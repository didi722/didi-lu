'use strict';
// docs/tipo-stagione.js: i quattro tipi di stagione (league, monoformat, random, cup), chi fa statistica, i nomi progressivi, i trofei.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../docs/tipo-stagione.js');

test('tipoDi: senza tipo è una league, la beta è la beta, un tipo strano torna league', () => {
    assert.equal(T.tipoDi({}, 's0'), 'league');
    assert.equal(T.tipoDi(null, 's1'), 'league');
    assert.equal(T.tipoDi({ tipo: 'Cup' }, 's2'), 'cup');
    assert.equal(T.tipoDi({ tipo: 'monoformat' }, 's3'), 'monoformat');
    assert.equal(T.tipoDi({ tipo: 'random' }, 's4'), 'random');
    assert.equal(T.tipoDi({ tipo: 'boh' }, 's5'), 'league');
    assert.equal(T.tipoDi({ tipo: 'cup' }, 'sbeta'), 'beta');
});

test('statistica: league, monoformat e random sì; cup e beta no. Il trofeo lo danno tutte tranne la beta', () => {
    for (const t of ['league', 'monoformat', 'random']) { assert.equal(T.faStatistica({ tipo: t }, 's1'), true, t); assert.equal(T.daTrofeo({ tipo: t }, 's1'), true, t); }
    assert.equal(T.faStatistica({ tipo: 'cup' }, 's1'), false);
    assert.equal(T.daTrofeo({ tipo: 'cup' }, 's1'), true);
    assert.equal(T.faStatistica({}, 'sbeta'), false);
    assert.equal(T.daTrofeo({}, 'sbeta'), false);
    assert.equal(T.faStatistica({}, 's0'), true, 'le stagioni di prima sono league');
});

test('numeri romani e nomi progressivi per tipo (la beta e le cup non contano)', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 9, 14, 19, 40, 90].map(T.romano), ['I', 'II', 'III', 'IV', 'V', 'IX', 'XIV', 'XIX', 'XL', 'XC']);
    const stagioni = {
        sbeta: { info: { name: 'Beta' } },
        s0: { info: { name: "Sant'Alvise I" } },
        s1: { info: { name: 'Natale', tipo: 'cup' } },
        s2: { info: { name: 'Friuli DOC I', tipo: 'random' } },
        s3: { info: { name: "Sant'Alvise II", tipo: 'league' } }
    };
    assert.equal(T.nomeProgressivo('league', stagioni), "Sant'Alvise III");
    assert.equal(T.nomeProgressivo('random', stagioni), 'Friuli DOC II');
    assert.equal(T.nomeProgressivo('monoformat', stagioni), 'Martiri di Marzabotto Memorial I');
    assert.equal(T.nomeProgressivo('cup', stagioni), '', 'le cup hanno il nome che dà l\'admin');
    assert.equal(T.nomeProgressivo('league', {}), "Sant'Alvise I");
});

const STAGIONI = {
    sbeta: { info: { name: 'Beta', status: 'closed', winner: 'Didi' } },
    s0: { info: { name: "Sant'Alvise I", status: 'closed', winner: 'Didi', endDate: '2026-04-10' } },
    s1: { info: { name: 'Friuli DOC I', tipo: 'random', status: 'closed', winner: 'Lu', endDate: '2026-05-20' } },
    s2: { info: { name: 'Christmas Cup', tipo: 'cup', status: 'closed', winner: 'Didi', chiusaIl: '2026-12-24T22:10:00Z', icona: 'immagini/coppe/natale.png' } },
    s3: { info: { name: "Sant'Alvise II", status: 'closed', winner: 'didi', endDate: '2026-09-30' } },
    s4: { info: { name: 'Estate', tipo: 'cup', status: 'playing' } },
    s5: { info: { name: 'Marzabotto I', tipo: 'monoformat', status: 'closed', winner: 'DIDI', endDate: '2026-07-01' } }
};

test('trofei: le stagioni e le cup chiuse vinte dal giocatore (la beta e le stagioni in corso no), le più recenti per prime, con nome e data', () => {
    const t = T.trofei(STAGIONI, 'Didi');
    assert.deepEqual(t.map(x => x.stagione), ['s2', 's3', 's5', 's0']);
    assert.deepEqual(t.map(x => x.tipo), ['cup', 'league', 'monoformat', 'league']);
    assert.equal(t[0].nome, 'Christmas Cup');
    assert.equal(t[0].data, '2026-12-24');
    assert.equal(t[0].icona, 'immagini/coppe/natale.png', 'una cup può avere la sua icona');
    assert.equal(t[1].icona, 'immagini/season-winner-color.png');
    assert.deepEqual(T.trofei(STAGIONI, 'lu').map(x => x.nome), ['Friuli DOC I']);
    assert.deepEqual(T.trofei(STAGIONI, 'nessuno'), []);
    assert.deepEqual(T.trofei(STAGIONI, ''), []);
    assert.deepEqual(T.trofei(null, 'didi'), []);
});

test('raggruppa: per tipo, con il conto e le singole vittorie (quale e quando)', () => {
    const g = T.raggruppa(T.trofei(STAGIONI, 'didi'));
    assert.deepEqual(g.map(x => [x.tipo, x.conteggio]), [['league', 2], ['monoformat', 1], ['cup', 1]]);
    assert.deepEqual(g[0].vittorie.map(v => [v.nome, v.data]), [["Sant'Alvise II", '2026-09-30'], ["Sant'Alvise I", '2026-04-10']]);
    assert.deepEqual(T.raggruppa([]), []);
});

test('palmares: tutte le stagioni e le cup chiuse con il vincitore, la beta e quelle in corso no', () => {
    const p = T.palmares(STAGIONI);
    assert.deepEqual(p.map(x => x.stagione), ['s2', 's3', 's5', 's1', 's0']);
    assert.deepEqual(p.map(x => x.vincitore), ['Didi', 'didi', 'DIDI', 'Lu', 'Didi']);
});

test('dataVittoria: endDate, poi la chiusura, poi l\'ultimo aggiornamento; anche GG/MM/AAAA', () => {
    assert.equal(T.dataVittoria({ endDate: '2026-04-10', chiusaIl: '2026-05-01T00:00:00Z' }), '2026-04-10');
    assert.equal(T.dataVittoria({ chiusaIl: '2026-05-01T10:00:00Z' }), '2026-05-01');
    assert.equal(T.dataVittoria({ endDate: '03/02/2026' }), '2026-02-03');
    assert.equal(T.dataVittoria({ endDate: 'N/A', chiusaIl: '2026-06-02T08:00:00Z' }), '2026-06-02', 'un endDate che non è una data si salta');
    assert.equal(T.dataVittoria({}), '');
});

test('leggiInfo: sbeta, s0, s1... e la stagione corrente, una lettura per stagione', async () => {
    const dati = { 'seasons/sbeta/info': { name: 'B' }, 'seasons/s0/info': { name: 'A' }, 'seasons/s1/info': { name: 'C' }, 'seasons/s12/info': { name: 'Salto' }, 'settings/currentSeason': 's12' };
    const db = { ref: p => ({ once: async () => ({ val: () => (p in dati ? dati[p] : null) }) }) };
    const r = await T.leggiInfo(db);
    assert.deepEqual(Object.keys(r).sort(), ['s0', 's1', 's12', 'sbeta']);
});

// ---------- le cup non fanno statistica: ogni modulo che legge le stagioni le salta ----------
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');
const Statistiche = require('../docs/statistiche.js');

const match = (p1, p2, s1, s2, extra = {}) => ({
    player1Id: p1, player2Id: p2, player1: p1, player2: p2, winnerId: s1 > s2 ? p1 : p2, team1: 'A', team2: 'B',
    p1score: s1, p2score: s2, p1points: 0, p2points: 0, data: '2026-12-24', categoria: 'VGC', lastEdit: '2026-12-24T20:00:00Z', ...extra
});
const showdown = matches => ({ info: { categoria: 'VGC', data: '2026-12-24', vincitoreShowdown: 'didi' }, matches });
const DATI = {
    players: { didi: { info: { name: 'Didi' } }, lu: { info: { name: 'Lu' } } },
    seasons: {
        s0: { info: { name: "Sant'Alvise I", status: 'playing' }, showdowns: { d1: showdown({ match1: match('didi', 'lu', 3, 0, { data: '2026-10-01' }), match2: match('didi', 'lu', 3, 0, { data: '2026-10-01' }) }) } },
        s1: { info: { name: 'Christmas Cup', tipo: 'cup', status: 'playing' }, showdowns: { d1: showdown({ match1: match('lu', 'didi', 3, 0), match2: match('lu', 'didi', 3, 0), match3: match('lu', 'didi', 3, 0) }) } }
    }
};

test('Statistiche.calcola: una cup è come se non ci fosse (match, set, serie, stagioni da scegliere)', () => {
    const r = Statistiche.calcola(DATI, { stagione: 'all' });
    const didi = r.players.find(p => p.id === 'didi');
    assert.equal(didi.match.giocati, 2, 'solo i match della stagione, non quelli della cup');
    assert.equal(didi.serie.vittorieMax, 2);
    assert.equal(didi.serie.vittorieAttuale, 2, 'perdere nella cup non spezza la serie');
    assert.deepEqual(r.stagioni.map(s => s.id), ['s0'], 'la cup non è tra le stagioni da scegliere');
    assert.equal(r.players.find(p => p.id === 'lu').match.giocati, 2);
});

function caricaSito(db) {
    const file = path.join(__dirname, '..', 'docs', 'risultati-match.js');
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: async () => ({ ok: false, json: async () => ({}) }), db });
    vm.runInContext(fs.readFileSync(file, 'utf8'), contesto, { filename: file });
    return contesto;
}

test('risultati-match: una cup non entra in Elo, statistiche e serie dei badge; una stagione random sì', async () => {
    const db = creaDb(JSON.parse(JSON.stringify(DATI)));
    const sito = caricaSito(db);
    const elo = sito.calcolaEloCronologico(DATI.seasons);
    assert.deepEqual(Object.keys(elo.match).sort(), ['s0/showdowns/d1/matches/match1', 's0/showdowns/d1/matches/match2'], 'solo i match della stagione');
    await sito.ricalcolaStatisticheGlobali('didi');
    const st = db.leggi('players/didi/stats');
    assert.equal(st['individual-stats'].showdownsPlayed, 1);
    assert.equal(st.badges.wonstrike, 2, 'la sconfitta nella cup non spezza la serie');
    assert.equal(st.badges.maxwonstrike, 2);
});

test('la regola delle cup di ogni modulo è quella di TipoStagione.faStatistica', () => {
    for (const tipo of [undefined, 'league', 'monoformat', 'random', 'cup', 'CUP']) {
        const info = tipo ? { tipo } : {};
        const attesa = T.faStatistica(info, 's1');
        const dati = { players: { a: { info: {} }, b: { info: {} } }, seasons: { s1: { info, showdowns: { d: showdown({ match1: match('a', 'b', 3, 0) }) } } } };
        assert.equal(Statistiche.calcola(dati, { stagione: 'all' }).stagioni.length > 0, attesa, `Statistiche: ${tipo}`);
        const elo = caricaSito(creaDb()).calcolaEloCronologico(dati.seasons);
        assert.equal(Object.keys(elo.match).length > 0, attesa, `Elo: ${tipo}`);
    }
});
