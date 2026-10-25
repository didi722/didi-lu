'use strict';
// L'MVP della stagione: un singolo Pokémon (quel team, quell'individuo, non la specie) votato dai giocatori a fine stagione.
//   - mvp.js: punteggio e classifica dei Pokémon, quando si apre il voto, cosa è un voto valido;
//   - mvp.js e mvp-voto.js: le 24 ore di voto dopo la chiusura, lo spoglio con lo spareggio sulla classifica, il conteggio delle stagioni scadute;
//   - statistiche.js: i titoli MVP di Pokémon, team e allenatore; fiocchi.js: il fiocco "Season MVP".
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');
const Mvp = require('../docs/mvp.js');
const { calcola } = require('../docs/statistiche.js');
const Fiocchi = require('../docs/fiocchi.js');

const leggi = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const copia = x => JSON.parse(JSON.stringify(x));
function caricaSito(db) {
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: () => { throw new Error('rete non permessa'); }, db });
    vm.runInContext(leggi('docs/risultati-match.js'), contesto, { filename: 'risultati-match.js' });
    return contesto;
}

// ---------- 1. il punteggio e la classifica ----------
const pk = (chiave, extra = {}) => ({ chiave, player: 'didi', playerNome: 'Didi', team: 'ALPHA', formato: 'VGC', specie: chiave.split('::').pop(), specieId: chiave.split('::').pop(),
    portato: 0, koFatti: 0, svenuto: 0, setPortatoVinti: 0, ultimoVinto: 0, serie: { matchVinti: 0 }, ...extra });

test('punteggio: KO x3, set vinti x4, set giocati x1, set sopravvissuti x1,5, ultimo rimasto x6, match vinti x2', () => {
    const m = pk('didi::ALPHA::garchomp', { koFatti: 4, setPortatoVinti: 3, portato: 5, svenuto: 2, ultimoVinto: 1, serie: { matchVinti: 2 } });
    assert.equal(Mvp.punteggio(m), 12 + 12 + 5 + 4.5 + 6 + 4);
    assert.equal(Mvp.punteggio(pk('x')), 0);
    assert.equal(Mvp.punteggio(null), 0);
    // non si può sopravvivere a più set di quelli giocati
    assert.equal(Mvp.punteggio(pk('y', { portato: 1, svenuto: 3 })), 1);
});

test('classifica: solo chi è sceso in campo, dal punteggio più alto; a parità più KO, poi più presenze, poi il nome', () => {
    const lista = [
        pk('didi::ALPHA::panchina'),                                                                  // mai in campo: non c'è
        pk('didi::ALPHA::forte', { portato: 4, koFatti: 5, setPortatoVinti: 3 }),
        pk('lu::GAMMA::medio', { player: 'lu', portato: 4, koFatti: 2, setPortatoVinti: 2 }),
        pk('lu::GAMMA::piccolo', { player: 'lu', portato: 1 })
    ];
    const c = Mvp.classifica(lista);
    assert.deepEqual(c.map(v => v.specie), ['forte', 'medio', 'piccolo']);
    assert.deepEqual(c.map(v => v.posizione), [1, 2, 3]);
    assert.equal(Mvp.classifica(lista, 2).length, 2);
    // parità di punteggio: più KO prima (3 KO + 0 set = 9+; 2 set vinti x4 = 8 + 1 KO x3 = 3...)
    const pari = Mvp.classifica([
        pk('a::T::uno', { portato: 2, koFatti: 0, setPortatoVinti: 3 }),      // 12 + 2 + 3 = 17
        pk('a::T::due', { portato: 2, koFatti: 4, setPortatoVinti: 0 })       // 12 + 2 + 3 = 17
    ]);
    assert.equal(pari[0].specie, 'due', 'a parità vince chi ha più KO');
});

test("un Pokémon è un individuo: la stessa specie in due team (o due volte nello stesso) sono due candidati", () => {
    const c = Mvp.classifica([
        pk('didi::ALPHA::garchomp', { portato: 3, koFatti: 3 }),
        pk('didi::BETA::garchomp', { portato: 3, koFatti: 1 }),
        pk('didi::ALPHA::garchomp#2', { portato: 2 })
    ]);
    assert.equal(c.length, 3);
    assert.equal(new Set(c.map(v => v.chiave)).size, 3);
});

// ---------- 2. quando si può votare ----------
test('soglia del voto: gli ultimi 3 showdown, ma mai più di un terzo della stagione (almeno 1)', () => {
    assert.deepEqual([30, 9, 6, 5, 3, 2, 1, 0].map(Mvp.sogliaVoto), [3, 3, 2, 1, 1, 1, 1, 1]);
});

test('finestraVoto: apre quando mancano pochi showdown, mai prima di iniziare, mai senza calendario', () => {
    const info = { status: 'playing', tipo: 'league' };
    const f = (giocati, richiesti, i = info, id = 's1') => Mvp.finestraVoto(i, { giocati, richiesti }, id);
    assert.equal(f(26, 30).aperta, false);
    assert.equal(f(26, 30).motivo, 'presto');
    assert.equal(f(27, 30).aperta, true, 'mancano 3');
    assert.equal(f(27, 30).fase, 'durante');
    assert.equal(f(27, 30).mancano, 3);
    assert.equal(f(29, 30).aperta, true);
    assert.equal(f(0, 3).aperta, false, 'non è ancora iniziata');
    assert.equal(f(1, 3).aperta, false, 'una stagione corta non apre dopo il primo showdown: ne mancano 2 su 3');
    assert.equal(f(2, 3).aperta, true, 'ne manca un terzo');
    assert.equal(f(1, 6).aperta, false, '5 mancanti su 6: soglia 2');
    assert.equal(f(4, 6).aperta, true);
    assert.equal(f(5, 0).motivo, 'senza-calendario');
    assert.equal(f(27, 30, { status: 'playing', tipo: 'random' }).aperta, false, 'le Random non hanno i Pokémon');
    assert.equal(f(27, 30, { status: 'playing', tipo: 'cup' }).aperta, false);
    assert.equal(f(27, 30, info, 'sbeta').aperta, false);
    assert.equal(f(27, 30, { status: 'playing' }).aperta, true, 'senza tipo è una League');
    assert.equal(f(27, 30, { status: 'playing', tipo: 'monoformat' }).aperta, true);
});

test('finestraVoto: dopo la chiusura si vota ancora per 24 ore; poi è scaduta e si contano i voti', () => {
    const chiusaIl = '2026-10-24T20:00:00.000Z';
    const t = ore => Date.parse(chiusaIl) + ore * 3600000;
    const f = (ore, info = { status: 'closed', tipo: 'league', chiusaIl }) => Mvp.finestraVoto(info, { giocati: 30, richiesti: 30 }, 's1', t(ore));
    const subito = f(0);
    assert.equal(subito.aperta, true);
    assert.equal(subito.fase, 'dopo');
    assert.equal(subito.chiusa, true);
    assert.equal(subito.scaduta, false);
    assert.equal(subito.scade, t(24));
    assert.equal(f(23.9).aperta, true);
    const scaduta = f(24);
    assert.equal(scaduta.aperta, false, 'allo scadere delle 24 ore si ferma');
    assert.equal(scaduta.scaduta, true);
    assert.equal(f(300).scaduta, true);
    // chiusa senza data (a mano, in passato): niente tempo supplementare e niente conteggio
    const senzaData = f(1, { status: 'closed', tipo: 'league' });
    assert.equal(senzaData.aperta, false);
    assert.equal(senzaData.scaduta, false);
    assert.equal(Mvp.finestraVoto({ status: 'closed', tipo: 'random', chiusaIl }, {}, 's1', t(1)).aperta, false, 'le Random no');
    assert.equal(Mvp.finestraVoto({ status: 'closed', tipo: 'league', chiusaIl }, {}, 'sbeta', t(1)).aperta, false);
    assert.equal(Mvp.finestraVoto({ status: 'playing', tipo: 'league', chiusaIl }, { giocati: 10, richiesti: 30 }, 's1', t(1)).aperta, false, 'riaperta: conta la stagione, non la vecchia data');
    assert.equal(Mvp.ORE_DOPO_CHIUSURA, 24);
    // quando contare: scaduta, con voti e senza risultato
    const mvpConVoti = { voti: { didi: {} } };
    assert.equal(Mvp.daContare(f(25), mvpConVoti), true);
    assert.equal(Mvp.daContare(f(23), mvpConVoti), false, 'ancora aperta');
    assert.equal(Mvp.daContare(f(25), {}), false, 'nessun voto: niente da scrivere');
    assert.equal(Mvp.daContare(f(25), { ...mvpConVoti, risultato: { vincitori: [] } }), false, 'già contata');
});

// ---------- 2b. la top 5 si congela all'apertura del voto ----------
const sdCongelato = (a, b, data, ultimo = '') => ({
    info: { categoria: 'VGC', player1: a, player1Id: a.toLowerCase(), player2: b, player2Id: b.toLowerCase(), data },
    matches: Object.fromEntries([1, 2, 3].map(n => [`match${n}`, { p1score: 2, p2score: 0, winnerId: a.toLowerCase(), lastEdit: ultimo || `${data}T2${n}:00:00.000Z` }]))
});
const stagioneTre = { info: { status: 'playing', tipo: 'league', showdowns_per_format: 1, selected_formats: ['VGC'] }, iscritti: { Didi: {}, Lu: {}, Tom: {} },
    teams_iscritti: { VGC: Object.fromEntries(['didi', 'lu', 'tom'].map(g => [g, { count: 1, datiTeams: { t: { nome: 'T' } } }])) } };

test('congelamento: la top 5 è quella di quando si è aperto il voto, anche se dopo si sono giocati altri showdown', () => {
    const { avanzamentoStagione } = caricaSito(creaDb());
    const avanza = (...a) => avanzamentoStagione(...a);
    const apri = showdowns => Mvp.showdownAllApertura(stagioneTre.info, stagioneTre.iscritti, showdowns, stagioneTre.teams_iscritti, avanza);
    // tre coppie, un formato, un showdown ciascuna: 3 richiesti, il voto si apre quando ne manca 1 (dopo il secondo)
    const tutti = { zeta: sdCongelato('Lu', 'Tom', '2026-10-23'), alfa: sdCongelato('Didi', 'Lu', '2026-10-21'), mu: sdCongelato('Didi', 'Tom', '2026-10-22') };
    const f = apri(tutti);
    assert.deepEqual(Object.keys(f.showdowns).sort(), ['alfa', 'mu'], 'conta l\'ordine in cui si sono giocati, non quello delle chiavi: il terzo (zeta) è dopo');
    assert.equal(f.ultimo, 'mu');
    // stessa cosa quando i primi due sono quelli che esistono già: l'apertura non si sposta
    assert.deepEqual(Object.keys(apri({ alfa: tutti.alfa, mu: tutti.mu }).showdowns).sort(), ['alfa', 'mu']);
    assert.equal(apri({ alfa: tutti.alfa }), null, 'ne mancano 2 su 3: il voto non è ancora aperto');
    assert.equal(apri({}), null);
    // due showdown dello stesso giorno: vale l'ultimo match salvato
    const stessoGiorno = { primo: sdCongelato('Didi', 'Lu', '2026-10-21', '2026-10-21T10:00:00.000Z'), secondo: sdCongelato('Didi', 'Tom', '2026-10-21', '2026-10-21T18:00:00.000Z'), terzo: sdCongelato('Lu', 'Tom', '2026-10-21', '2026-10-21T20:00:00.000Z') };
    assert.deepEqual(Object.keys(apri(stessoGiorno).showdowns).sort(), ['primo', 'secondo']);
    // senza calendario (nessun showdown per formato) non c'è un momento di apertura
    assert.equal(Mvp.showdownAllApertura({ status: 'playing' }, stagioneTre.iscritti, tutti, stagioneTre.teams_iscritti, avanza), null);
});

// ---------- 3. cosa è un voto valido ----------
test('controllaScelte: solo tra i candidati, mai due volte lo stesso, mai i propri, al massimo 2', () => {
    const cand = Mvp.classifica([
        pk('didi::A::uno', { portato: 5, koFatti: 5 }), pk('lu::B::due', { player: 'lu', portato: 4, koFatti: 4 }),
        pk('tom::C::tre', { player: 'tom', portato: 3, koFatti: 3 }), pk('didi::A::quattro', { portato: 2, koFatti: 2 })
    ]);
    const ok = Mvp.controllaScelte(['lu::B::due', 'tom::C::tre'], cand, 'didi');
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.scelte.map(c => c.specie), ['due', 'tre']);
    // un Pokémon proprio o non candidato o doppio non conta
    const sporco = Mvp.controllaScelte(['didi::A::uno', 'lu::B::due', 'lu::B::due', 'fuori::X::z'], cand, 'Didi');
    assert.deepEqual(sporco.scelte.map(c => c.specie), ['due']);
    assert.equal(sporco.ok, true);
    // niente di valido
    const niente = Mvp.controllaScelte(['didi::A::uno'], cand, 'didi');
    assert.equal(niente.ok, false);
    assert.match(niente.errore, /at least one/i);
    // tre voti validi: troppi
    const tre = Mvp.controllaScelte(['lu::B::due', 'tom::C::tre', 'didi::A::quattro'], cand, 'ale');
    assert.equal(tre.ok, false);
    assert.equal(tre.scelte.length, 2);
    // il voto salvato ha solo stringhe (Firebase rifiuta undefined)
    assert.deepEqual(Object.keys(Mvp.candidato({ chiave: 'k' })).sort(), ['chiave', 'player', 'specie', 'specieId', 'team']);
    assert.ok(Object.values(Mvp.candidato({ chiave: 'k' })).every(v => typeof v === 'string'));
});

test('statVoto: le statistiche in evidenza, con il migliore di ognuna (solo se davvero sta davanti a qualcuno)', () => {
    const c = Mvp.classifica([
        pk('a::T::uno', { portato: 4, koFatti: 8, setPortatoVinti: 3, svenuto: 1, ultimoVinto: 1, serie: { matchVinti: 2, matchPortato: 2 } }),
        pk('b::T::due', { portato: 2, koFatti: 3, setPortatoVinti: 2, svenuto: 0, ultimoVinto: 0, serie: { matchVinti: 2, matchPortato: 2 } })
    ]);
    const st = Mvp.statVoto(c);
    assert.deepEqual(Mvp.STAT_VOTO.map(s => s.id), ['ko', 'set', 'vivo', 'ultimo', 'match']);
    const uno = Object.fromEntries(st[0].map(x => [x.id, x]));
    const due = Object.fromEntries(st[1].map(x => [x.id, x]));
    assert.equal(uno.ko.testo, '8');
    assert.equal(uno.ko.sub, '2 per set');
    assert.equal(uno.set.testo, '3/4');
    assert.equal(uno.set.sub, '75% won');
    assert.equal(uno.vivo.testo, '3/4');
    assert.equal(due.vivo.sub, '100% of sets');
    assert.deepEqual([uno.ko.migliore, due.ko.migliore], [true, false]);
    assert.deepEqual([uno.set.migliore, due.set.migliore], [true, false]);
    assert.deepEqual([uno.vivo.migliore, due.vivo.migliore], [false, true], 'conta la percentuale di set in cui è rimasto in piedi');
    assert.deepEqual([uno.ultimo.migliore, due.ultimo.migliore], [true, false]);
    assert.deepEqual([uno.match.migliore, due.match.migliore], [false, false], 'pari: nessuno è il migliore');
    // tutti a zero: niente evidenziato; un candidato solo: nemmeno
    assert.ok(Mvp.statVoto(Mvp.classifica([pk('a::T::x', { portato: 1 }), pk('b::T::y', { portato: 1 })])).flat().every(x => x.id === 'vivo' || !x.migliore));
    assert.ok(Mvp.statVoto(c.slice(0, 1)).flat().every(x => !x.migliore));
});

test('vincitoriDi legge i vincitori registrati (lista o oggetto numerato di Firebase)', () => {
    assert.deepEqual(Mvp.vincitoriDi({ mvp: { risultato: { vincitori: [{ chiave: 'a' }] } } }).map(v => v.chiave), ['a']);
    assert.deepEqual(Mvp.vincitoriDi({ mvp: { risultato: { vincitori: { 0: { chiave: 'a' }, 1: { chiave: 'b' } } } } }).map(v => v.chiave), ['a', 'b']);
    assert.deepEqual(Mvp.vincitoriDi({}), []);
    assert.deepEqual(Mvp.vincitoriDi(null), []);
});

// ---------- 4. lo spoglio ----------
const voto = (...scelte) => ({ ts: 1, scelte: scelte.map(([chiave, player, specie]) => ({ chiave, player, team: 'T', specie, specieId: specie.toLowerCase() })) });
const A = ['lu::T::garchomp', 'lu', 'Garchomp'], B = ['tom::T::dragonite', 'tom', 'Dragonite'], C = ['didi::T::kyogre', 'didi', 'Kyogre'];
// la classifica dell'MVP a stagione finita: Garchomp, poi Dragonite, poi Kyogre
const ranking = [A, B, C].map(([chiave, player, specie], i) => ({ chiave, player, specie, posizione: i + 1, punteggio: 90 - i * 10 }));

test('spoglio: vince chi ha più voti, uno solo; nessun voto = nessun MVP', () => {
    const iscritti = { Didi: {}, Lu: {}, Tom: {} };
    const uno = copia(Mvp.spoglio({ didi: voto(B, A), tom: voto(A) }, iscritti, ranking));
    assert.deepEqual(uno.vincitori.map(v => [v.specie, v.voti]), [['Garchomp', 2]]);
    assert.equal(uno.votanti, 2);
    assert.equal(uno.spareggio, false);
    assert.deepEqual(uno.classifica.map(v => v.specie), ['Garchomp', 'Dragonite']);
    // la classifica dell'MVP serve solo a pari voti: qui Dragonite ha più voti pur essendo dietro
    const dietro = copia(Mvp.spoglio({ didi: voto(B), lu: voto(B), tom: voto(A) }, iscritti, ranking));
    assert.deepEqual(dietro.vincitori.map(v => v.specie), ['Dragonite']);
    const nessuno = copia(Mvp.spoglio({}, iscritti, ranking));
    assert.deepEqual(nessuno.vincitori, []);
    assert.equal(nessuno.votanti, 0);
    assert.deepEqual(copia(Mvp.spoglio(null, null, null)).vincitori, []);
});

test('spoglio: a parità di voti vince il Pokémon avanti nella classifica dell\'MVP', () => {
    const iscritti = ['didi', 'lu', 'tom'];
    // un voto a Garchomp (didi) e uno a Dragonite (lu): Garchomp è primo in classifica
    const r = copia(Mvp.spoglio({ didi: voto(A), lu: voto(B) }, iscritti, ranking));
    assert.deepEqual(r.vincitori.map(v => v.specie), ['Garchomp']);
    assert.equal(r.spareggio, true);
    assert.deepEqual(r.pari.sort(), [A[0], B[0]].sort());
    // cambia la classifica, cambia il vincitore: non dipende dall'ordine dei voti né da chi ha votato per primo
    const rovescia = ranking.map(v => ({ ...v, posizione: 4 - v.posizione }));
    const r2 = copia(Mvp.spoglio({ lu: voto(B), didi: voto(A) }, iscritti, rovescia));
    assert.deepEqual(r2.vincitori.map(v => v.specie), ['Dragonite']);
    // Garchomp e Kyogre a pari voti (Dragonite, con 1 voto, non è nemmeno in questa classifica)
    const tre = copia(Mvp.spoglio({ didi: voto(B, A), lu: voto(C), tom: voto(C, A) }, iscritti, [ranking[2], ranking[0]]));
    const voti = Object.fromEntries(tre.classifica.map(v => [v.specie, v.voti]));
    assert.deepEqual(voti, { Garchomp: 2, Kyogre: 2, Dragonite: 1 });
    assert.deepEqual(tre.vincitori.map(v => v.specie), ['Garchomp'], 'Garchomp (1°) e Kyogre (3°) a pari voti: vince il primo in classifica');
    const senzaRanking = copia(Mvp.spoglio({ didi: voto(A), lu: voto(B) }, iscritti, []));
    assert.equal(senzaRanking.vincitori.length, 1, 'senza classifica decide comunque il nome, mai due vincitori');
});

test('spoglio: non contano i voti dei non iscritti, quelli per un proprio Pokémon, i doppioni e il terzo voto', () => {
    const iscritti = ['didi', 'lu', 'tom'];
    const r = copia(Mvp.spoglio({
        didi: voto(C, A),                       // C è suo: salta; A vale
        lu: voto(A, A, B, C),                   // A (il suo: salta); il doppione salta; B vale, C è il secondo voto valido
        intruso: voto(B, B),                    // non iscritto
        tom: voto(A, A)                         // doppione: un voto solo
    }, iscritti, ranking));
    const voti = Object.fromEntries(r.classifica.map(v => [v.specie, v.voti]));
    assert.deepEqual(voti, { Garchomp: 2, Dragonite: 1, Kyogre: 1 }, 'didi→A, lu→B e C, tom→A');
    assert.deepEqual(r.vincitori.map(v => v.specie), ['Garchomp']);
    assert.equal(r.votanti, 3);
});

test('il risultato si può scrivere su Firebase: niente undefined, solo testo, numeri e liste', () => {
    const r = Mvp.spoglio({ didi: voto(A) }, ['didi'], ranking);
    const db = creaDb();
    return db.ref('seasons/s1/mvp/risultato').set(JSON.parse(JSON.stringify(r))).then(() => assert.equal(db.leggi('seasons/s1/mvp/risultato/vincitori/0/specie'), 'Garchomp'));
});

test('riaprire una stagione toglie il risultato dell\'MVP ma non i voti; lo script delle funzioni è la copia di quello del sito', async () => {
    const db = creaDb({ seasons: { s1: { info: { status: 'closed' }, mvp: { voti: { didi: voto(A) }, risultato: { vincitori: [{ chiave: 'x' }] } } } }, players: { didi: {} } });
    await caricaSito(db).ritiraVincitoreStagione('s1');
    assert.equal(db.leggi('seasons/s1/mvp/risultato'), null);
    assert.ok(db.leggi('seasons/s1/mvp/voti/didi'));
    assert.equal(leggi('functions/risultati-match.js'), leggi('docs/risultati-match.js'));
});

// ---------- 5. i titoli nelle statistiche ----------
const setStats = (vincitore, p1Pokemon, p2Pokemon) => ({ v: 1, turni: 6, vincitore,
    p1: { nome: 'Didi', portati: p1Pokemon.length, svenuti: 0, pokemon: p1Pokemon.map(([specie, o = {}]) => ({ specie, nome: '', portato: true, titolare: true, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o })) },
    p2: { nome: 'Lu', portati: p2Pokemon.length, svenuti: 0, pokemon: p2Pokemon.map(([specie, o = {}]) => ({ specie, nome: '', portato: true, titolare: true, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o })) } });
const unMatch = { player1: 'Didi', player1Id: 'didi', player2: 'Lu', player2Id: 'lu', winnerId: 'didi', team1: 'ALPHA', team2: 'GAMMA', score: '2-0', p1score: 2, p2score: 0,
    p1points: 2, p2points: 0, data: '2026-02-01', categoria: 'VGC',
    setStats: { set1: setStats('p1', [['Garchomp', { koFatti: 3 }], ['Incineroar']], [['Dragonite', { svenuto: true }]]), set2: setStats('p1', [['Garchomp', { koFatti: 2 }], ['Incineroar']], [['Dragonite', { svenuto: true }]]) } };
const giocatori = {
    didi: { info: { name: 'Didi' }, teams: { a: { nome: 'ALPHA', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }, { nome: 'Incineroar' }] } } },
    lu: { info: { name: 'Lu' }, teams: { g: { nome: 'GAMMA', categoria: 'VGC', pokemon: [{ nome: 'Dragonite' }] } } }
};
const stagioneStat = (status, mvp) => ({ info: { name: 'S', status }, showdowns: { sd: { info: { categoria: 'VGC', player1: 'Didi', player2: 'Lu', data: '2026-02-01' }, matches: { match1: unMatch } } }, ...(mvp ? { mvp } : {}) });
const risultatoMvp = [{ chiave: 'didi::ALPHA::garchomp', player: 'didi', team: 'ALPHA', specie: 'Garchomp', specieId: 'garchomp', voti: 2 }];

test('statistiche: i titoli MVP contano per quel Pokémon (non per la specie), per il suo team e per il suo allenatore', () => {
    const r = calcola({ players: giocatori, seasons: { s1: stagioneStat('closed', { risultato: { vincitori: risultatoMvp } }) } }, { stagione: 'all' });
    const garchomp = r.pokemon.find(m => m.specieId === 'garchomp');
    assert.equal(garchomp.mvpVinti, 1);
    assert.deepEqual(garchomp.mvpStagioni, ['s1']);
    assert.equal(r.pokemon.find(m => m.specieId === 'incineroar').mvpVinti, 0, 'un compagno di team no');
    assert.equal(r.pokemon.find(m => m.specieId === 'dragonite').mvpVinti, 0);
    assert.equal(r.teams.find(t => t.nome === 'ALPHA').mvpVinti, 1);
    assert.equal(r.teams.find(t => t.nome === 'GAMMA').mvpVinti, 0);
    assert.equal(r.players.find(p => p.id === 'didi').mvpVinti, 1);
    assert.equal(r.players.find(p => p.id === 'lu').mvpVinti, 0);
    // un altro Garchomp (altro team o altra posizione) non prende il titolo
    const altro = copia(giocatori);
    altro.didi.teams.b = { nome: 'BETA', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }] };
    const r2 = calcola({ players: altro, seasons: { s1: stagioneStat('closed', { risultato: { vincitori: risultatoMvp } }) } }, { stagione: 'all' });
    assert.equal(r2.pokemon.filter(m => m.specieId === 'garchomp' && m.mvpVinti).length, 1);
});

test('statistiche: contano le stagioni chiuse nel perimetro scelto; la beta e quelle ancora aperte no', () => {
    const mvp = { risultato: { vincitori: risultatoMvp } };
    const dati = { players: giocatori, seasons: { s1: stagioneStat('closed', mvp), s2: stagioneStat('closed', mvp), s3: stagioneStat('playing', mvp), sbeta: stagioneStat('closed', mvp) } };
    const tutte = calcola(dati, { stagione: 'all' });
    assert.equal(tutte.pokemon.find(m => m.specieId === 'garchomp').mvpVinti, 2, 's1 e s2');
    const una = calcola(dati, { stagione: 's2' });
    assert.equal(una.pokemon.find(m => m.specieId === 'garchomp').mvpVinti, 1);
    // senza risultato (stagione senza voti o prima della chiusura) nessun titolo
    const senza = calcola({ players: giocatori, seasons: { s1: stagioneStat('closed') } }, { stagione: 'all' });
    assert.equal(senza.pokemon.find(m => m.specieId === 'garchomp').mvpVinti, 0);
});

// ---------- 5b. il conteggio delle stagioni scadute (mvp-voto.js) ----------
function caricaVoto(db) {
    const finestra = {};
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, window: finestra, document: { addEventListener() {}, getElementById: () => null, querySelector: () => null }, db });
    finestra.Mvp = Mvp;
    finestra.Statistiche = { calcola };
    finestra.SpritePkm = { id: x => x, gif: x => x, riserva() {} };
    vm.runInContext(leggi('docs/risultati-match.js'), contesto, { filename: 'risultati-match.js' });   // avanzamentoStagione, come nella pagina
    vm.runInContext(leggi('docs/mvp-voto.js'), contesto, { filename: 'mvp-voto.js' });
    return finestra.MvpVoto;
}
const fa = ore => new Date(Date.now() - ore * 3600000).toISOString();
const votoPer = (...k) => ({ ts: 1, scelte: k.map(([chiave, player, specie]) => ({ chiave, player, team: 'T', specie, specieId: specie.toLowerCase() })) });
const GARCHOMP = ['didi::ALPHA::garchomp', 'didi', 'Garchomp'], DRAGONITE = ['lu::GAMMA::dragonite', 'lu', 'Dragonite'];
const stagioneScaduta = (chiusaIl, voti = { lu: votoPer(GARCHOMP), didi: votoPer(DRAGONITE) }) => ({
    ...stagioneStat('closed', { voti }), info: { name: 'S', status: 'closed', tipo: 'league', chiusaIl }, iscritti: { Didi: {}, Lu: {} }
});

test('concludiScadute: dopo le 24 ore conta i voti una volta sola; a pari voti vince chi è avanti nella classifica della stagione', async () => {
    const seasons = { s1: stagioneScaduta(fa(30)) };
    const db = creaDb({ seasons: copia(seasons), players: giocatori });
    const V = caricaVoto(db);
    const fatti = copia(await V.concludiScadute(seasons, giocatori));
    assert.deepEqual(Object.keys(fatti), ['s1']);
    assert.deepEqual(fatti.s1.vincitori.map(v => v.specie), ['Garchomp'], '1 voto a testa: Garchomp è davanti in classifica (più KO e set vinti)');
    assert.equal(fatti.s1.spareggio, true);
    const salvato = db.leggi('seasons/s1/mvp/risultato');
    assert.equal(salvato.vincitori[0].chiave, 'didi::ALPHA::garchomp');
    assert.ok(salvato.contatoIl);
    // il risultato c'è: la seconda volta non si conta né si riscrive
    const dopo = copia(db.leggi('seasons/s1'));
    assert.deepEqual(copia(await V.concludiScadute(dopo, giocatori)), {});
    // due pagine che contano insieme: vale il primo risultato
    const db2 = creaDb({ seasons: copia(seasons), players: giocatori });
    const V2 = caricaVoto(db2);
    const r = await Promise.all([V2.concludiScadute(seasons, giocatori), V2.concludiScadute(seasons, giocatori)]);
    assert.equal(r.filter(x => Object.keys(x).length).length >= 1, true);
    assert.equal(db2.leggi('seasons/s1/mvp/risultato/vincitori/0/specie'), 'Garchomp');
});

test('concludiScadute: non tocca le stagioni ancora nelle 24 ore, quelle senza voti, quelle riaperte e quelle senza MVP', async () => {
    const seasons = {
        recente: stagioneScaduta(fa(5)),                                    // si vota ancora
        senzaVoti: { ...stagioneScaduta(fa(40)), mvp: undefined },          // niente da contare
        riaperta: { ...stagioneScaduta(fa(40)), info: { name: 'S', status: 'playing', tipo: 'league', chiusaIl: fa(40) } },
        random: { ...stagioneScaduta(fa(40)), info: { name: 'S', status: 'closed', tipo: 'random', chiusaIl: fa(40) } },
        senzaData: { ...stagioneScaduta(fa(40)), info: { name: 'S', status: 'closed', tipo: 'league' } }   // chiusa a mano in passato
    };
    const db = creaDb({ seasons: copia(seasons), players: giocatori });
    assert.deepEqual(copia(await caricaVoto(db).concludiScadute(seasons, giocatori)), {});
    for (const id of Object.keys(seasons)) assert.equal(db.leggi(`seasons/${id}/mvp/risultato`), null, id);
});

// ---------- 6. il fiocco ----------
test('il fiocco Season MVP: bronzo al primo titolo, poi 2, 3 e 4', () => {
    const mvp = p => Fiocchi.calcola(p).find(f => f.id === 'mvp');
    assert.deepEqual(Fiocchi.CATALOGO.find(f => f.id === 'mvp').soglie, [1, 2, 3, 4]);
    assert.equal(mvp({}).livello, 0);
    assert.equal(mvp({ mvpVinti: 1 }).livello, 1);
    assert.equal(mvp({ mvpVinti: 1 }).immagine, 'immagini/ribbon-mvp-bronze.png');
    assert.equal(mvp({ mvpVinti: 2 }).livello, 2);
    assert.equal(mvp({ mvpVinti: 3 }).livello, 3);
    assert.equal(mvp({ mvpVinti: 4 }).immagine, 'immagini/ribbon-mvp-platinum.png');
    assert.equal(mvp({ mvpVinti: 9 }).livello, 4);
    // viene dal Pokémon delle statistiche
    const r = calcola({ players: giocatori, seasons: { s1: stagioneStat('closed', { risultato: { vincitori: risultatoMvp } }) } }, { stagione: 'all' });
    assert.equal(mvp(Fiocchi.trova(r, { player: 'didi', team: 'ALPHA', specie: 'Garchomp' })).livello, 1);
    assert.equal(mvp(Fiocchi.trova(r, { player: 'didi', team: 'ALPHA', specie: 'Incineroar' })).livello, 0);
});

// ---------- 7. la pagina ----------
test('stats.html carica gli script dell\'MVP prima di stats.js e conta le stagioni scadute', () => {
    const s = [...leggi('docs/stats.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(s.includes('risultati-match.js') && s.indexOf('risultati-match.js') < s.indexOf('mvp-voto.js'), 'serve avanzamentoStagione');
    assert.ok(s.indexOf('statistiche.js') < s.indexOf('mvp.js') && s.indexOf('mvp.js') < s.indexOf('mvp-voto.js') && s.indexOf('mvp-voto.js') < s.indexOf('stats.js'));
    assert.match(leggi('docs/stats.js'), /MvpVoto\.concludiScadute\(STATO\.dati\.seasons, STATO\.dati\.players\)/);
});

test("la chiusura a mano dall'admin scrive chiusaIl: da lì partono le 24 ore del voto", () => {
    assert.match(leggi('docs/admin.html'), /info\/chiusaIl`\)\.set\(new Date\(\)\.toISOString\(\)\)/);
});

test('matches.html carica mvp.css e gli script dell\'MVP (dopo le statistiche) e li avvia a ogni disegno', () => {
    const html = leggi('docs/matches.html');
    const s = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    for (const f of ['statistiche.js', 'mvp.js', 'mvp-voto.js']) assert.ok(s.includes(f), f);
    assert.ok(s.indexOf('statistiche.js') < s.indexOf('mvp.js') && s.indexOf('mvp.js') < s.indexOf('mvp-voto.js'));
    assert.match(html, /<link rel="stylesheet" href="mvp\.css">/);
    assert.match(html, /MvpVoto\.avvia\(\{ stagione: stagioneAttiva/);
    assert.ok(leggi('docs/mvp-voto.js').includes("db.ref(`seasons/${ctx.stagione}/mvp/voti/${idDi(ctx.votante)}`)"), 'i voti stanno sotto seasons/{id}/mvp/voti/{giocatore}');
});
