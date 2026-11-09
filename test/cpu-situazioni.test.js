'use strict';
// Le situazioni del gioco (cpu-situazioni.js): la CPU che impara dai log dei set come cambiano le scelte di un allenatore nelle varie situazioni.
//   - il tracker legge un log e dice in che situazione si trova ogni Pokémon a inizio turno (turno, appena entrato, PS, vantaggio, compagno KO, stato);
//   - le decisioni di un set: una per Pokémon e turno, con la situazione e la scelta (attacco, protezione, cambio, altro); chi non può scegliere non ne dà;
//   - l'apprendimento ritrova gli effetti veri, resta prudente con pochi dati, non inventa effetti dove non ci sono;
//   - la prova incrociata dice se le situazioni servono davvero (e il gioco pubblica le regole solo se servono).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../docs/cpu-situazioni.js');

const F = nome => S.CARATTERISTICHE.indexOf(nome);
const caratt = (f, ...nomi) => nomi.every(n => f[F(n)] === 1);
const soloQueste = (f, ...nomi) => S.CARATTERISTICHE.every((n, j) => f[j] === (nomi.includes(n) ? 1 : 0));

// ---------- un piccolo set, scritto a mano ----------
const SET_DOPPIO = [
    '|player|p1|Ada|1|', '|player|p2|Bruno|2|',
    '|gametype|doubles', '|teamsize|p1|3', '|teamsize|p2|3', '|start',
    '|switch|p1a: Garchomp|Garchomp, L50|100/100', '|switch|p1b: Incineroar|Incineroar, L50|100/100',
    '|switch|p2a: Flutter Mane|Flutter Mane, L50|100/100', '|switch|p2b: Rillaboom|Rillaboom, L50|100/100',
    '|turn|1',
    '|switch|p2b: Landorus|Landorus-Therian, L50|100/100',              // un cambio scelto: prima di qualunque mossa
    '|move|p1a: Garchomp|Protect|p1a: Garchomp',
    '|move|p1b: Incineroar|Fake Out|p2a: Flutter Mane',
    '|-damage|p2a: Flutter Mane|60/100',
    '|cant|p2a: Flutter Mane|flinch',                                   // non ha potuto scegliere: niente decisione
    '|upkeep',
    '|turn|2',
    '|move|p1a: Garchomp|Earthquake|p2a: Flutter Mane',
    '|move|p1b: Incineroar|Parting Shot|p2a: Flutter Mane',
    '|move|p2a: Flutter Mane|Moonblast|p1b: Incineroar',
    '|-damage|p1b: Incineroar|20/100',
    '|move|p2b: Landorus|Swords Dance|p2b: Landorus',
    '|-damage|p2a: Flutter Mane|0 fnt', '|faint|p2a: Flutter Mane',
    '|upkeep',
    '|switch|p2a: Amoonguss|Amoonguss, L50|100/100',                    // il sostituto di un KO, dopo |upkeep|: non è una scelta
    '|turn|3',
    '|move|p1a: Garchomp|Protect|p1a: Garchomp',
    '|move|p1b: Incineroar|Flare Blitz|p2b: Landorus',
    '|move|p2a: Amoonguss|Spore|p1a: Garchomp',
    '|move|p2b: Landorus|Earthquake|p1b: Incineroar'
];

test('il tracker: a ogni turno dice la situazione di ogni Pokémon in campo prima che scelga', () => {
    const t = S.crea();
    t.righe(SET_DOPPIO.slice(0, 11));                                   // fino a |turn|1
    assert.equal(t.doppio(), true);
    assert.equal(t.turno(), 1);
    // al turno 1 sono tutti titolari a pieno PS, squadre pari
    assert.ok(soloQueste(t.contesto('p1a'), 'primoTurno'));
    assert.ok(soloQueste(t.contesto('p2b'), 'primoTurno'));
    assert.equal(t.contesto('p3a'), null);
    t.righe(SET_DOPPIO.slice(11, 19));                                  // fino a |turn|2
    assert.equal(t.turno(), 2);
    assert.ok(soloQueste(t.contesto('p1a')), 'turno 2, in piedi da prima, tutto normale');
    assert.ok(soloQueste(t.contesto('p2b'), 'appenaEntrato'), 'Landorus è entrato al turno 1');
    assert.ok(soloQueste(t.contesto('p2a'), 'psMedi'), 'Flutter Mane è al 60%');
    t.righe(SET_DOPPIO.slice(19, 28));                                  // fino a |turn|3
    assert.ok(caratt(t.contesto('p1b'), 'psBassi'), 'Incineroar è al 20%');
    assert.ok(caratt(t.contesto('p2a'), 'appenaEntrato'), 'chi sostituisce un KO conta come appena entrato');
    assert.ok(caratt(t.contesto('p1a'), 'inVantaggio'), 'tre Pokémon contro due');
    assert.ok(caratt(t.contesto('p2b'), 'inSvantaggio'));
});

test('il tracker: un compagno KO senza sostituto, e i problemi di stato', () => {
    const t = S.crea();
    t.righe([
        '|gametype|doubles', '|teamsize|p1|4', '|teamsize|p2|4', '|start',
        '|switch|p1a: A|Garchomp, L50|100/100', '|switch|p1b: B|Incineroar, L50|100/100',
        '|switch|p2a: C|Rillaboom, L50|100/100', '|switch|p2b: D|Flutter Mane, L50|100/100',
        '|turn|1', '|move|p1a: A|Earthquake|p2a: C', '|-damage|p2a: C|0 fnt', '|faint|p2a: C',
        '|-status|p1b: B|brn', '|upkeep', '|turn|2'
    ]);
    assert.ok(caratt(t.contesto('p2b'), 'soloInCampo'), 'il compagno è KO e non ha un sostituto');
    assert.equal(t.contesto('p2a'), null, 'nessuno in campo in quella posizione');
    assert.ok(caratt(t.contesto('p1b'), 'conStato'));
    t.righe(['|-curestatus|p1b: B|brn', '|upkeep', '|turn|3']);
    assert.ok(!caratt(t.contesto('p1b'), 'conStato'));
    assert.ok(caratt(t.contesto('p1a'), 'inVantaggio'));
});

test('le decisioni di un set: una per Pokémon e turno; protezioni, mosse di stato, cambi scelti; non i KO sostituiti, non chi non ha potuto muoversi', () => {
    const d = S.decisioni(SET_DOPPIO);
    const del = (turno, lato) => d.filter(x => x.turno === turno && x.lato === lato);
    assert.deepEqual(del(1, 'p1').map(x => x.categoria).sort(), ['attacco', 'protezione']);          // Protect, Fake Out
    assert.deepEqual(del(1, 'p2').map(x => x.categoria), ['cambio']);                                // lo scambio di Rillaboom; Flutter Mane era esitante
    assert.deepEqual(del(2, 'p1').map(x => x.categoria).sort(), ['altro', 'attacco']);               // Earthquake, Parting Shot (una mossa di stato)
    assert.deepEqual(del(2, 'p2').map(x => x.categoria).sort(), ['altro', 'attacco']);               // Moonblast, Swords Dance
    assert.deepEqual(del(3, 'p2').map(x => x.categoria).sort(), ['altro', 'attacco']);               // Spore (stato), Earthquake — niente cambio di Amoonguss
    assert.ok(d.every(x => x.doppio === true));
    assert.ok(d.every(x => x.f.length === S.CARATTERISTICHE.length));
    assert.equal(d.find(x => x.turno === 1 && x.categoria === 'protezione').giocatore, 'Ada');
    // la situazione registrata è quella a inizio turno (non quella dopo i danni del turno)
    const moon = d.find(x => x.turno === 2 && x.lato === 'p2' && x.categoria === 'attacco');
    assert.ok(caratt(moon.f, 'psMedi'));
    assert.deepEqual(S.decisioni(SET_DOPPIO, { lato: 'p2' }).filter(x => x.lato !== 'p2'), []);
    assert.deepEqual(S.decisioni(''), []);
    assert.deepEqual(S.decisioni(null), []);
});

test('il tracker non si rompe con righe strane, un log vuoto o a metà', () => {
    const t = S.crea();
    t.righe(['', 'testo', '|', '|turn|x', '|switch|boh', '|move|', '|-damage|p1a: X|', '|faint|', null, undefined, 42]);
    assert.equal(t.contesto('p1a'), null);
    assert.doesNotThrow(() => S.decisioni(['|gametype|singles', '|turn|1', '|move|p1a: X|Tackle|p2a: Y']));
});

// ---------- l'apprendimento, su dati finti con un effetto noto ----------

const { casuale, logFinto, set } = require('./dati/log-finti.js');

const NIENTE = bassi => ({ attacco: 0.7, protezione: 0.12, cambio: 0.06, altro: 0.12 });
// con pochi PS cambia sei volte di più e si para il doppio
const CON_PS_BASSI = bassi => (bassi ? { attacco: 0.45, protezione: 0.2, cambio: 0.3, altro: 0.05 } : { attacco: 0.74, protezione: 0.11, cambio: 0.04, altro: 0.11 });

test('apprendimento: ritrova un effetto vero (con pochi PS si cambia molto di più) e non ne inventa altrove', () => {
    const campioni = [];
    for (const s of set(60, CON_PS_BASSI)) for (const d of S.decisioni(s.log)) campioni.push({ f: d.f, categoria: d.categoria });
    const r = S.addestra(campioni);
    assert.ok(r, 'ci sono abbastanza decisioni');
    assert.ok(r.n >= 1400);
    const cambio = r.pesi.cambio;
    assert.ok(cambio.psBassi > 1.2, `cambio con pochi PS: ${cambio.psBassi}`);                  // vero: ln(0.3/0.04 · 0.74/0.45) ≈ 2.5, penalità lo tiene più basso
    assert.ok(r.pesi.protezione.psBassi > 0.2);
    for (const nome of ['primoTurno', 'appenaEntrato', 'inSvantaggio', 'conStato', 'finePartita']) {
        // il primo turno e la fine partita ci sono davvero nei log, ma senza un effetto: devono restare vicini a zero
        for (const k of ['protezione', 'cambio', 'altro']) assert.ok(Math.abs(r.pesi[k][nome]) < 0.5, `${k} ${nome}: ${r.pesi[k][nome]}`);
    }
    // un moltiplicatore: con pochi PS il cambio vale molte volte di più, l'attacco no
    const f = S.CARATTERISTICHE.map(n => (n === 'psBassi' ? 1 : 0));
    const m = S.moltiplicatori(r.pesi, f);
    assert.equal(m.attacco, 1);
    assert.ok(m.cambio > 2 && m.protezione > 1.2, JSON.stringify(m));
    // nella situazione "normale" (nessuna caratteristica) si cambia meno della media, che comprende anche le situazioni con pochi PS
    const normale = S.moltiplicatori(r.pesi, S.CARATTERISTICHE.map(() => 0));
    assert.equal(normale.attacco, 1);
    assert.ok(normale.cambio < 0.85, JSON.stringify(normale));
    assert.deepEqual(S.moltiplicatori(null, f), { attacco: 1, protezione: 1, cambio: 1, altro: 1 });
});

test('apprendimento: con pochi dati non si impara niente (null); la partenza (le quote dell\'allenatore) sposta solo l\'intercetta, non l\'effetto della situazione', () => {
    assert.equal(S.addestra([]), null);
    assert.equal(S.addestra(null), null);
    const pochi = [];
    for (const s of set(5, CON_PS_BASSI)) for (const d of S.decisioni(s.log)) pochi.push({ f: d.f, categoria: d.categoria });
    assert.equal(S.addestra(pochi), null);
    assert.ok(S.addestra(pochi, { minimo: 10 }), 'con una soglia più bassa si impara');
    // una partenza sbagliata (uguale per tutti) sposta solo l'intercetta: l'effetto della situazione resta quello
    const tanti = [];
    for (const s of set(60, CON_PS_BASSI)) for (const d of S.decisioni(s.log)) tanti.push({ f: d.f, categoria: d.categoria });
    const senza = S.addestra(tanti).pesi.cambio;
    const sbagliata = S.addestra(tanti.map(c => Object.assign({}, c, { partenza: { attacco: 0.5, protezione: 0.1, cambio: 0.3, altro: 0.1 } }))).pesi.cambio;
    assert.ok(Math.abs(sbagliata.psBassi - senza.psBassi) < 0.4, `${sbagliata.psBassi} contro ${senza.psBassi}`);
    assert.ok(sbagliata.base < senza.base - 0.5, 'la "situazione normale" cambia meno di quanto dice la partenza: l\'intercetta lo compensa');
});

test('applica: quote × moltiplicatori, a somma 1; senza moltiplicatori le quote restano', () => {
    const q = { attacco: 0.6, protezione: 0.2, cambio: 0.1, altro: 0.1 };
    assert.deepEqual(S.applica(q, null), q);
    const a = S.applica(q, { attacco: 1, protezione: 1, cambio: 4, altro: 1 });
    assert.ok(Math.abs(Object.values(a).reduce((t, x) => t + x, 0) - 1) < 1e-9);
    assert.ok(a.cambio > 0.3 && a.attacco < 0.6);
});

test('prova incrociata: se le situazioni contano, prevedere set mai visti riesce meglio; se non contano, non si guadagna niente e le regole non si pubblicano', () => {
    const vero = set(70, CON_PS_BASSI, 11);
    const v = S.validaIncrociata(vero);
    assert.ok(v.n > 1500);
    assert.ok(v.guadagno > 0.02, `guadagno ${v.guadagno}`);
    assert.equal(v.gruppiMigliori, v.gruppi, 'in tutti i gruppi');
    const c = S.costruisci(vero);
    assert.ok(c.regole.singoli && c.regole.singoli.pesi && c.regole.singoli.n > 1500);
    assert.equal(c.regole.doppi, null, 'nessun set in doppio');
    assert.equal(c.validazione.singoli.esito, 'pubblicate');
    assert.equal(c.validazione.doppi.esito, 'pochi dati');

    const niente = set(70, NIENTE, 13);
    const w = S.validaIncrociata(niente);
    assert.ok(w.guadagno < 0.002, `senza effetto il guadagno resta nel rumore: ${w.guadagno}`);
    const cn = S.costruisci(niente);
    assert.equal(cn.regole.singoli, null);
    assert.equal(cn.validazione.singoli.esito, 'non servono');
});

test('costruisci: pochi set o log vuoti non rompono niente', () => {
    assert.deepEqual(S.costruisci([]).regole, { singoli: null, doppi: null });
    assert.deepEqual(S.costruisci([{ id: 'x', log: [] }, { id: 'y', log: null }]).regole, { singoli: null, doppi: null });
    assert.deepEqual(S.costruisci(set(3, CON_PS_BASSI)).regole, { singoli: null, doppi: null });
});

test('versione: cambia quando cambiano le caratteristiche (le regole salvate si reimparano)', () => {
    assert.equal(typeof S.VERSIONE, 'number');
    assert.equal(S.CARATTERISTICHE.length, 9);
});

