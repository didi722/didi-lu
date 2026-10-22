'use strict';
// Elo dei giocatori (risultati-match.js): K più alto all'inizio, margine di vittoria, ricalcolo sempre cronologico.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');

function caricaSito(db) {
    const file = path.join(__dirname, '..', 'docs', 'risultati-match.js');
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: () => { throw new Error('rete non permessa'); }, db });
    vm.runInContext(fs.readFileSync(file, 'utf8'), contesto, { filename: file });
    return contesto;
}
const copia = x => JSON.parse(JSON.stringify(x));

const match = (a, b, s1, s2, data) => ({ player1Id: a, player2Id: b, p1score: s1, p2score: s2, winnerId: s1 > s2 ? a : b, ...(data ? { data } : {}) });
// una stagione con i match in sequenza, uno showdown ciascuno
const stagione = (...elenco) => ({ showdowns: Object.fromEntries(elenco.map((m, i) => [`sd${i + 1}`, { info: { categoria: 'OU' }, matches: { match1: m } }])) });

test('margine (match sempre per intero): 3 set -> 3-0 vale 1 e 2-1 vale 0,8; 5 set -> 5-0 vale 1, 4-1 0,88, 3-2 0,76', () => {
    const { moltiplicatoreMargine } = caricaSito(creaDb());
    assert.equal(moltiplicatoreMargine(3, 0), 1);
    assert.ok(Math.abs(moltiplicatoreMargine(4, 1) - 0.88) < 1e-9);
    assert.equal(moltiplicatoreMargine(3, 0), 1);
    assert.equal(moltiplicatoreMargine(5, 0), 1);
    assert.ok(Math.abs(moltiplicatoreMargine(2, 1) - 0.8) < 1e-9);
    assert.ok(Math.abs(moltiplicatoreMargine(3, 2) - 0.76) < 1e-9);
    assert.equal(moltiplicatoreMargine(0, 0), 1);
});

test('primo match tra due da 1000: 3-0 = +24/-24 (K 48), 2-1 = +19/-19 (K 48 x 0,8)', () => {
    const { calcolaEloCronologico } = caricaSito(creaDb());
    const pulito = copia(calcolaEloCronologico({ s1: stagione(match('a', 'b', 3, 0)) }));
    assert.deepEqual(pulito.elo, { a: 1024, b: 976 });
    const tirato = copia(calcolaEloCronologico({ s1: stagione(match('a', 'b', 2, 1)) }));
    assert.deepEqual(tirato.elo, { a: 1019, b: 981 });
});

test('K: 48 per i primi 8 match di ciascun giocatore, poi 32', () => {
    const { calcolaEloCronologico } = caricaSito(creaDb());
    // a batte b otto volte di fila 3-0, poi una nona: il nono match (K 32 per entrambi) muove meno del primo (K 48)
    const sd = Array.from({ length: 9 }, () => match('a', 'b', 3, 0));
    const r = copia(calcolaEloCronologico({ s1: stagione(...sd) }));
    const dopo = (n) => r.match[`s1/showdowns/sd${n}/matches/match1`];
    assert.equal(dopo(1).p1DeltaElo, 24);
    const ottavo = dopo(8), nono = dopo(9);
    // stesso atteso: con K 48 la variazione è 1,5 volte quella con K 32
    const attesoNono = 1 / (1 + Math.pow(10, (nono.p2EloAtMatch - nono.p1EloAtMatch) / 400));
    assert.equal(nono.p1DeltaElo, Math.round(32 * (1 - attesoNono)));
    const attesoOttavo = 1 / (1 + Math.pow(10, (ottavo.p2EloAtMatch - ottavo.p1EloAtMatch) / 400));
    assert.equal(ottavo.p1DeltaElo, Math.round(48 * (1 - attesoOttavo)), 'l\'ottavo match è ancora con K 48');
});

test('il rating non dipende dall\'ordine in cui i match sono nel database: conta la data', () => {
    const { calcolaEloCronologico } = caricaSito(creaDb());
    const m = [match('a', 'b', 3, 0, '2026-10-01'), match('b', 'c', 2, 1, '2026-10-03'), match('c', 'a', 3, 0, '2026-10-05'), match('a', 'b', 2, 1, '2026-10-07')];
    const inOrdine = copia(calcolaEloCronologico({ s1: stagione(...m) }));
    // gli stessi match salvati in un altro ordine e in due stagioni diverse
    const mescolato = copia(calcolaEloCronologico({ s2: stagione(m[3], m[1]), s1: stagione(m[2], m[0]) }));
    assert.deepEqual(mescolato.elo, inOrdine.elo);
});

test('un match inserito in ritardo (ma con una data vecchia) sistema i successivi', async () => {
    const seasons = { s1: stagione(match('a', 'b', 3, 0, '2026-10-05'), match('b', 'a', 3, 0, '2026-10-06')) };
    const db = creaDb({ seasons, players: { a: {}, b: {}, c: {} } });
    const sito = caricaSito(db);
    await sito.ricalcolaEloGiocatori();
    const prima = db.leggi('players/a/stats/individual-stats/ranking');
    // arriva un match del 1 ottobre di a contro c: i match di a e b del 5 e 6 ottobre cambiano
    await db.ref('seasons/s1/showdowns/sd3').set({ info: { categoria: 'OU' }, matches: { match1: match('a', 'c', 3, 0, '2026-10-01') } });
    await sito.ricalcolaEloGiocatori();
    const dopo = db.leggi('players/a/stats/individual-stats/ranking');
    assert.notEqual(dopo, prima);
    // il match del 5 ottobre ha ora l'Elo di prima ricalcolato dopo il match con c: a parte da 1024 e non più da 1000
    assert.equal(db.leggi('seasons/s1/showdowns/sd1/matches/match1/p1EloAtMatch'), 1024);
    assert.deepEqual(copia(await sito.ricalcolaEloGiocatori()), { a: dopo, b: db.leggi('players/b/stats/individual-stats/ranking'), c: 976 }, 'rifarlo non cambia niente');
});

test('cancellando un match vecchio gli altri tornano coerenti', async () => {
    const seasons = { s1: stagione(match('a', 'b', 3, 0, '2026-10-01'), match('a', 'b', 3, 0, '2026-10-02')) };
    const db = creaDb({ seasons, players: { a: {}, b: {} } });
    const sito = caricaSito(db);
    await sito.ricalcolaEloGiocatori();
    await db.ref('seasons/s1/showdowns/sd1').remove();
    await sito.ricalcolaEloGiocatori();
    assert.equal(db.leggi('seasons/s1/showdowns/sd2/matches/match1/p1EloAtMatch'), 1000, 'il match rimasto è ora il primo');
    assert.equal(db.leggi('players/a/stats/individual-stats/ranking'), 1024);
});

test('la beta ha una classifica a parte e non tocca i profili', () => {
    const { calcolaEloCronologico } = caricaSito(creaDb());
    const r = copia(calcolaEloCronologico({ sbeta: stagione(match('a', 'b', 3, 0, '2026-09-01')), s1: stagione(match('a', 'b', 3, 0, '2026-10-01')) }));
    assert.deepEqual(r.elo, { a: 1024, b: 976 }, 'solo i match ufficiali');
    assert.equal(r.match['sbeta/showdowns/sd1/matches/match1'].p1EloAtMatch, 1000);
    assert.equal(r.match['s1/showdowns/sd1/matches/match1'].p1EloAtMatch, 1000, 'la beta non ha dato Elo: l\'ufficiale parte da 1000');
});

test('registrare un match scrive i delta nel match e il rating nei profili', async () => {
    const db = creaDb({ players: { didi: {}, lu: {} }, seasons: { s1: { info: { name: 'S', status: 'playing', best_of: 3, selected_formats: ['OU'], showdowns_per_format: 1 },
        showdowns: { sd1: { info: { player1: 'Didi', player1Id: 'didi', player2: 'Lu', player2Id: 'lu', categoria: 'OU', data: '2026-10-01' } } } } } });
    await caricaSito(db).registraRisultatoMatch({ stagione: 's1', showdownId: 'sd1', matchNum: 1, player1: 'Didi', player2: 'Lu', team1: 'A', team2: 'B', score: '3-0', data: '2026-10-01', categoria: 'OU', replays: {} });
    const m = db.leggi('seasons/s1/showdowns/sd1/matches/match1');
    assert.deepEqual([m.p1EloAtMatch, m.p2EloAtMatch, m.p1DeltaElo, m.p2DeltaElo], [1000, 1000, 24, -24]);
    assert.equal(db.leggi('players/didi/stats/individual-stats/ranking'), 1024);
    assert.equal(db.leggi('players/lu/stats/individual-stats/ranking'), 976);
});
