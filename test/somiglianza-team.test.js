'use strict';
// La regola di somiglianza tra team (somiglianza-team.js): nello stesso formato non più di 2 Pokémon uguali, ma solo verso un team che non si può
// più modificare (iscritto a una stagione iniziata). Tra team ancora modificabili si può provare quel che si vuole.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../docs/somiglianza-team.js');

const team = (id, nome, specie, categoria = 'QWERTY') => ({ id, nome, categoria, pokemon: specie.map(n => ({ nome: n, strumento: 'Focus Sash' })) });
const bloccatiPerNome = (...nomi) => t => nomi.includes(t.nome);

test('MASSIMO_COMUNI: due Pokémon uguali vanno bene, il terzo no', () => {
    assert.equal(S.MASSIMO_COMUNI, 2);
    assert.equal(S.troppoSimili(['A', 'B', 'C', 'D', 'E', 'F'], ['A', 'B', 'X', 'Y', 'Z', 'W']), false, '2 in comune: ok');
    assert.equal(S.troppoSimili(['A', 'B', 'C', 'D', 'E', 'F'], ['A', 'B', 'C', 'Y', 'Z', 'W']), true, '3 in comune: troppi');
    assert.equal(S.troppoSimili(['A', 'B'], []), false);
});

test('valeNelFormato: formati custom e Anything Goes (e quelli senza struttura, come al salvataggio); VGC e Random no', () => {
    for (const s of ['custom', 'anything_goes', 'Custom', ' ANYTHING_GOES ', '', undefined, null]) assert.equal(S.valeNelFormato(s), true, String(s));
    for (const s of ['vgc', 'VGC', 'random', 'altro']) assert.equal(S.valeNelFormato(s), false, s);
});

test('specieDi: i nomi in minuscolo, da un team del Box, dai dati di validazione, da un elenco o da un oggetto di Firebase', () => {
    assert.deepEqual(S.specieDi(team('1', 'x', ['Great Tusk', 'Urshifu-Rapid-Strike'])), ['great tusk', 'urshifu-rapid-strike']);
    assert.deepEqual(S.specieDi([{ name: 'Incineroar' }, { species: { name: 'Rillaboom' } }, { nome: 'Amoonguss' }, 'Flutter Mane']), ['incineroar', 'rillaboom', 'amoonguss', 'flutter mane']);
    assert.deepEqual(S.specieDi({ pokemon: { 0: { nome: 'Ditto' }, 1: { nome: 'Gengar' } } }), ['ditto', 'gengar'], 'Firebase a volte restituisce un oggetto');
    assert.deepEqual(S.specieDi({ teamDati: ['Pikachu'] }), ['pikachu']);
    assert.deepEqual(S.specieDi({ pokemon: [{ nome: '  Ditto ' }, null, {}, { nome: '' }] }), ['ditto'], 'voci vuote e spazi');
    assert.deepEqual(S.specieDi(null), []);
    assert.deepEqual(S.specieDi({}), []);
});

test('inComune: i Pokémon di `a` che ha anche `b`, senza badare alle maiuscole e col nome che hanno in `a`', () => {
    const a = team('a', 'A', ['Incineroar', 'Rillaboom', 'Urshifu-Rapid-Strike', 'Landorus-Therian', 'Amoonguss', 'Flutter Mane']);
    const b = team('b', 'B', ['incineroar', 'RILLABOOM', 'Urshifu', 'Landorus-Therian', 'Ditto', 'Gengar']);
    assert.deepEqual(S.inComune(a, b), ['Incineroar', 'Rillaboom', 'Landorus-Therian'], 'Urshifu e Urshifu-Rapid-Strike non sono lo stesso Pokémon');
    assert.deepEqual(S.inComune(b, a), ['incineroar', 'RILLABOOM', 'Landorus-Therian'], 'i nomi sono quelli del primo team');
    assert.deepEqual(S.inComune(a, team('c', 'C', [])), []);
});

test('conflittiDi: conta solo verso i team che non si possono più modificare', () => {
    const modificabileA = team('a', 'Team a', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const modificabileB = team('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    assert.deepEqual(S.conflittiDi(modificabileA, [modificabileA, modificabileB], { bloccato: () => false }), [], 'due team modificabili: si prova quel che si vuole');
    // quando l'altro diventa non modificabile, il primo è fuori regola
    const c = S.conflittiDi(modificabileA, [modificabileA, modificabileB], { bloccato: bloccatiPerNome('Team b') });
    assert.equal(c.length, 1);
    assert.equal(c[0].con, modificabileB);
    assert.deepEqual(c[0].comuni, ['P1', 'P2', 'P3']);
});

test('conflittiDi: salta il team stesso, i team di un altro formato e quelli con al massimo 2 in comune; dal più simile', () => {
    const io = team('io', 'Io', ['A', 'B', 'C', 'D', 'E', 'F']);
    const stessoId = { ...team('io', 'Io (vecchia copia)', ['A', 'B', 'C', 'D', 'E', 'F']) };
    const altroFormato = team('f', 'Altro formato', ['A', 'B', 'C', 'D', 'E', 'F'], 'Monotype');
    const due = team('d', 'Due', ['A', 'B', 'X', 'Y', 'Z', 'W']);
    const tre = team('t', 'Tre', ['A', 'B', 'C', 'Y', 'Z', 'W']);
    const cinque = team('c', 'Cinque', ['A', 'B', 'C', 'D', 'E', 'W']);
    const tutti = [io, stessoId, altroFormato, due, tre, cinque];
    const c = S.conflittiDi(io, tutti, { bloccato: () => true });
    assert.deepEqual(c.map(x => x.con.nome), ['Cinque', 'Tre'], 'prima il più simile; né se stesso, né un altro formato, né 2 in comune');
    assert.deepEqual(c.map(x => x.comuni.length), [5, 3]);
});

test('conflittiDi: il formato si confronta senza badare a maiuscole e spazi; senza la funzione "bloccato" è un errore, non un via libera', () => {
    const a = team('a', 'A', ['P1', 'P2', 'P3'], 'Little Cup');
    const b = team('b', 'B', ['P1', 'P2', 'P3'], ' little cup ');
    assert.equal(S.conflittiDi(a, [b], { bloccato: () => true }).length, 1);
    assert.throws(() => S.conflittiDi(a, [b]), /bloccato/);
    assert.throws(() => S.mappaConflitti([a, b]), /bloccato/);
});

test('mappaConflitti: lo scenario del Box — due team modificabili simili, poi uno si iscrive a una stagione in corso e l\'altro risulta fuori regola', () => {
    const a = team('a', 'Team a', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const b = team('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const libero = team('l', 'Libero', ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']);
    // all'inizio nessuno è bloccato: nessuno è fuori regola
    assert.equal(S.mappaConflitti([a, b, libero], { bloccato: () => false }).size, 0);
    // Team b si iscrive a una stagione in corso: Team a diventa fuori regola, Team b (bloccato) no, Libero non c'entra
    const m = S.mappaConflitti([a, b, libero], { bloccato: bloccatiPerNome('Team b') });
    assert.deepEqual([...m.keys()], ['a']);
    assert.equal(m.get('a')[0].con, b);
    assert.deepEqual(m.get('a')[0].comuni, ['P1', 'P2', 'P3']);
    // e se si cambia un Pokémon di Team a, torna in regola
    const a2 = team('a', 'Team a', ['P1', 'P2', 'Z9', 'P4', 'P5', 'P6']);
    assert.equal(S.mappaConflitti([a2, b, libero], { bloccato: bloccatiPerNome('Team b') }).size, 0);
});

test('mappaConflitti: due team entrambi bloccati non si segnano (non si possono più cambiare); formati senza la regola (VGC) neppure', () => {
    const a = team('a', 'A', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const b = team('b', 'B', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    assert.equal(S.mappaConflitti([a, b], { bloccato: () => true }).size, 0, 'tutti e due bloccati');
    const vgcA = team('va', 'VA', ['P1', 'P2', 'P3', 'P4'], 'VGC Gen 8');
    const vgcB = team('vb', 'VB', ['P1', 'P2', 'P3', 'X1'], 'VGC Gen 8');
    const solo = new Map([['vgc gen 8', 'vgc'], ['qwerty', 'custom']]);
    const vale = t => solo.has(String(t.categoria).toLowerCase()) && S.valeNelFormato(solo.get(String(t.categoria).toLowerCase()));
    assert.equal(S.mappaConflitti([vgcA, vgcB], { bloccato: bloccatiPerNome('VB'), vale }).size, 0, 'in VGC la regola non c\'è');
    assert.equal(S.mappaConflitti([vgcA, vgcB], { bloccato: bloccatiPerNome('VB') }).size, 1, 'senza "vale" la regola c\'è ovunque');
});

test('mappaConflitti: più team bloccati simili — tutti elencati, il più simile per primo; formati diversi non si mescolano', () => {
    const io = team('io', 'Io', ['A', 'B', 'C', 'D', 'E', 'F']);
    const x = team('x', 'X', ['A', 'B', 'C', 'Q', 'R', 'S']);
    const y = team('y', 'Y', ['A', 'B', 'C', 'D', 'R', 'S']);
    const altroFormato = team('z', 'Z', ['A', 'B', 'C', 'D', 'E', 'F'], 'Little Cup');
    const m = S.mappaConflitti([io, x, y, altroFormato], { bloccato: bloccatiPerNome('X', 'Y', 'Z') });
    assert.deepEqual(m.get('io').map(c => c.con.nome), ['Y', 'X']);
    assert.equal(m.has('z'), false, 'Z è bloccato');
    assert.equal(m.has('x'), false);
});

test('mappaConflitti: i team senza id o vuoti non fanno danni', () => {
    const a = team('a', 'A', ['P1', 'P2', 'P3']);
    const senzaId = { nome: 'Senza id', categoria: 'QWERTY', pokemon: [{ nome: 'P1' }, { nome: 'P2' }, { nome: 'P3' }] };
    assert.doesNotThrow(() => S.mappaConflitti([a, senzaId, null, undefined, {}], { bloccato: bloccatiPerNome('Senza id') }));
    assert.equal(S.mappaConflitti([a, senzaId], { bloccato: bloccatiPerNome('Senza id') }).get('a').length, 1);
    assert.equal(S.mappaConflitti(null, { bloccato: () => true }).size, 0);
});

test('testo: il titolo nomina il team con cui si rompe la regola; poi i Pokémon in comune e cosa fare', () => {
    const a = team('a', 'Team a', ['Incineroar', 'Rillaboom', 'Urshifu-Rapid-Strike', 'Landorus-Therian', 'Amoonguss', 'Flutter Mane']);
    const b = team('b', 'Team b', ['Incineroar', 'Rillaboom', 'Urshifu-Rapid-Strike', 'Landorus-Therian', 'Ditto', 'Gengar']);
    const t = S.testo(S.conflittiDi(a, [b], { bloccato: () => true }));
    const righe = t.split('\n');
    assert.equal(righe[0], 'Breaks the similarity rule with "Team b"');
    assert.equal(righe[1], '4 Pokémon in common: Incineroar, Rillaboom, Urshifu-Rapid-Strike, Landorus-Therian.');
    assert.equal(righe[2], 'Max 2 are allowed with a team already registered in a season: change some Pokémon to enter this team in one.');
    assert.equal(righe.length, 3);
});

test('testo: con più team fuori regola nomina il più simile e accenna agli altri; senza conflitti è vuoto', () => {
    const io = team('io', 'Io', ['A', 'B', 'C', 'D', 'E', 'F']);
    const x = team('x', 'X', ['A', 'B', 'C', 'Q', 'R', 'S']);
    const y = team('y', 'Y', ['A', 'B', 'C', 'D', 'R', 'S']);
    const t = S.testo(S.conflittiDi(io, [x, y], { bloccato: () => true })).split('\n');
    assert.equal(t[0], 'Breaks the similarity rule with "Y"');
    assert.equal(t[1], '4 Pokémon in common: A, B, C, D.');
    assert.equal(t[2], 'Also too similar to "X" (3 in common).');
    assert.equal(S.testo([]), '');
    assert.equal(S.testo(undefined), '');
    assert.match(S.testo([{ con: {}, comuni: ['A', 'B', 'C'] }]), /"another team"/, 'un team senza nome non rompe il testo');
});

// ---------- l'iscrizione: due team simili non si iscrivono insieme ----------

const ctx = (extra = {}) => ({ bloccato: () => false, delFormato: [], scelti: [], altrove: [], ...extra });

test('conflittiIscrizione: un team modificabile troppo simile a uno che si iscrive insieme a lui è in conflitto ("insieme"), e il contrario', () => {
    const a = team('a', 'Team a', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const b = team('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const c = S.conflittiIscrizione(b, ctx({ scelti: [a] }));
    assert.equal(c.length, 1);
    assert.equal(c[0].con, a);
    assert.equal(c[0].tipo, 'insieme');
    assert.deepEqual(c[0].comuni, ['P1', 'P2', 'P3']);
    assert.equal(S.conflittiIscrizione(a, ctx({ scelti: [b] }))[0].tipo, 'insieme');
    assert.deepEqual(S.conflittiIscrizione(b, ctx({ scelti: [b] })), [], 'il team stesso, già scelto, non conta');
    assert.deepEqual(S.conflittiIscrizione(b, ctx({ scelti: [] })), [], 'se l\'altro non è scelto, niente');
    const poco = team('p', 'Poco', ['P1', 'P2', 'Y1', 'Y2', 'Y3', 'Y4']);
    assert.deepEqual(S.conflittiIscrizione(poco, ctx({ scelti: [a] })), [], 'due in comune vanno bene');
});

test('conflittiIscrizione: un team già iscritto a un\'altra stagione con le iscrizioni aperte conta come un team scelto ("altrove"), col nome della stagione', () => {
    const a = team('a', 'Team a', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const b = team('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const c = S.conflittiIscrizione(b, ctx({ altrove: [{ ...a, nomeStagione: 'Friuli DOC I' }] }));
    assert.equal(c.length, 1);
    assert.equal(c[0].tipo, 'altrove');
    assert.equal(c[0].stagione, 'Friuli DOC I');
    // lo stesso team iscritto altrove non è in conflitto con se stesso (lo si iscrive anche a questa stagione)
    assert.deepEqual(S.conflittiIscrizione(a, ctx({ altrove: [{ ...a, nomeStagione: 'X' }] })), []);
});

test('conflittiIscrizione: verso un team non modificabile c\'è sempre ("bloccato"); un team già non modificabile non è mai in conflitto', () => {
    const a = team('a', 'Team a', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const b = team('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const bloccato = t => t.nome === 'Team a';
    const c = S.conflittiIscrizione(b, ctx({ bloccato, delFormato: [a, b] }));
    assert.equal(c.length, 1);
    assert.equal(c[0].tipo, 'bloccato');
    assert.deepEqual(S.conflittiIscrizione(a, ctx({ bloccato, delFormato: [a, b], scelti: [b] })), [], 'Team a non si può più cambiare: non è lui a dover cambiare');
    // due team non modificabili scelti insieme: non si segnalano (non c'è niente da fare)
    const bb = team('bb', 'Team bb', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    assert.deepEqual(S.conflittiIscrizione(bb, ctx({ bloccato: () => true, scelti: [a] })), []);
});

test('conflittiIscrizione: lo stesso team in più elenchi si segnala una volta (vale il primo); i team di un altro formato non contano; dal più simile', () => {
    const io = team('io', 'Io', ['A', 'B', 'C', 'D', 'E', 'F']);
    const x = team('x', 'X', ['A', 'B', 'C', 'Q', 'R', 'S']);
    const y = team('y', 'Y', ['A', 'B', 'C', 'D', 'R', 'S']);
    const bloccato = t => t.nome === 'X';
    const c = S.conflittiIscrizione(io, ctx({ bloccato, delFormato: [x], scelti: [x, y], altrove: [{ ...y, nomeStagione: 'S2' }, { ...x, nomeStagione: 'S2' }] }));
    assert.deepEqual(c.map(k => [k.con.nome, k.tipo]), [['Y', 'insieme'], ['X', 'bloccato']], 'X compare tre volte ma conta una, come "bloccato"; Y due, come "insieme"; Y è più simile');
    const altroFormato = team('z', 'Z', ['A', 'B', 'C', 'D', 'E', 'F'], 'Monotype');
    assert.deepEqual(S.conflittiIscrizione(io, ctx({ scelti: [altroFormato] })), []);
    assert.throws(() => S.conflittiIscrizione(io, {}), /bloccato/);
    assert.deepEqual(S.conflittiIscrizione(null, ctx()), []);
});

test('testo: i conflitti di iscrizione dicono cosa fare — "insieme" (si sceglie quale), "altrove" (con il nome della stagione), "bloccato" (si cambia il team)', () => {
    const a = team('a', 'Team a', ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    const b = team('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const insieme = S.testo(S.conflittiIscrizione(b, ctx({ scelti: [a] }))).split('\n');
    assert.equal(insieme[0], 'Breaks the similarity rule with "Team a"');
    assert.equal(insieme[1], '3 Pokémon in common: P1, P2, P3.');
    assert.equal(insieme[2], 'You\'ve selected "Team a" too: two teams with more than 2 Pokémon in common can\'t be registered together, because both would become non-editable when the season starts.');
    const altrove = S.testo(S.conflittiIscrizione(b, ctx({ altrove: [{ ...a, nomeStagione: 'Friuli DOC I' }] }))).split('\n');
    assert.equal(altrove[2], '"Team a" is already registered in "Friuli DOC I": two teams with more than 2 Pokémon in common can\'t be registered while registrations are open, because both would become non-editable when the seasons start.');
    const senzaNome = S.testo([{ con: a, comuni: ['P1', 'P2', 'P3'], tipo: 'altrove' }]).split('\n');
    assert.match(senzaNome[2], /^"Team a" is already registered: two teams/, 'senza il nome della stagione si dice solo "già iscritto"');
    const bloccato = S.testo(S.conflittiIscrizione(b, ctx({ bloccato: t => t.id === 'a', delFormato: [a] }))).split('\n');
    assert.equal(bloccato[2], 'Max 2 are allowed with a team already registered in a season: change some Pokémon to enter this team in one.');
    assert.equal(S.testo([{ con: a, comuni: ['P1', 'P2', 'P3'] }]).split('\n')[2], bloccato[2], 'senza tipo vale come "bloccato" (il fumetto del Box)');
});
