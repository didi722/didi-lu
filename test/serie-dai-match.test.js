'use strict';
// Le serie dei badge (Clean, Win, SD Streak) si leggono dai match veri, non dai numeri salvati in players/<id>/stats/badges.
// Quei numeri li riscrive la Cloud Function a ogni match salvato online: se le funzioni pubblicate sono quelle vecchie (che mescolavano i match
// di showdown diversi dello stesso giorno e contavano anche le cup) un badge compare senza che la serie ci sia mai stata ("Clean Streak 4"
// di Lukiani, che nei match veri non ha mai fatto più di 2 vittorie pulite di fila).
//   - Statistiche.calcola(...).players[].serie ha anche gli showdown vinti di fila e il giorno dei record;
//   - Titoli.serieAggiornate sostituisce i numeri salvati con quelli veri (e azzera i vecchi nomi dello showdown);
//   - le serie di Statistiche e quelle di risultati-match.js (il codice delle funzioni) dicono le stesse cose.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');
const { calcola } = require('../docs/statistiche.js');
const Titoli = require('../docs/titoli.js');

function caricaSito(db) {
    const file = path.join(__dirname, '..', 'docs', 'risultati-match.js');
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: async () => ({ ok: false, json: async () => ({}) }), db });
    vm.runInContext(fs.readFileSync(file, 'utf8'), contesto, { filename: file });
    return contesto;
}

// I primi quattro showdown della stagione s0 (dati veri): Lukiani vince i primi tre (in uno dei tre perde un match), Didi vince il quarto.
// Uniti per numero di match nello stesso giorno (come faceva il vecchio calcolo) i match puliti di Lukiani sembrerebbero 4 di fila.
const RIGHE = `-P4_CsJpYn4L9cO1XVZf | 2026-10-22 | match1 | didi 0-3 lukiani | 2026-10-22T20:22:38.546Z | lukiani
-P4_CsJpYn4L9cO1XVZf | 2026-10-22 | match2 | didi 0-3 lukiani | 2026-10-22T20:40:41.849Z | lukiani
-P4_CsJpYn4L9cO1XVZf | 2026-10-22 | match3 | didi 3-0 lukiani | 2026-10-22T20:59:09.683Z | lukiani
-P4_QP2Ogqr2bvsOSfK1 | 2026-10-22 | match1 | lukiani 3-0 ilaria | 2026-10-22T21:14:56.361Z | lukiani
-P4_QP2Ogqr2bvsOSfK1 | 2026-10-22 | match2 | lukiani 2-1 ilaria | 2026-10-22T21:30:44.267Z | lukiani
-P4_QP2Ogqr2bvsOSfK1 | 2026-10-22 | match3 | lukiani 2-1 ilaria | 2026-10-22T22:55:39.867Z | lukiani
-P4_b2tzYi4U36h5F69A | 2026-10-22 | match1 | lukiani 3-0 didi | 2026-10-22T23:10:40.241Z | lukiani
-P4_b2tzYi4U36h5F69A | 2026-10-22 | match2 | lukiani 2-1 didi | 2026-10-22T23:22:15.824Z | lukiani
-P4_b2tzYi4U36h5F69A | 2026-10-22 | match3 | lukiani 1-2 didi | 2026-10-22T23:31:08.232Z | lukiani
-P4_xCyHq0_X8iHqpH_u | 2026-10-23 | match1 | didi 2-1 lukiani | 2026-10-22T23:47:35.046Z | didi
-P4_xCyHq0_X8iHqpH_u | 2026-10-23 | match2 | didi 3-0 lukiani | 2026-10-22T23:58:54.221Z | didi
-P4_xCyHq0_X8iHqpH_u | 2026-10-23 | match3 | didi 2-1 lukiani | 2026-10-23T00:10:06.797Z | didi`;

function stagione0() {
    const showdowns = {};
    for (const riga of RIGHE.split('\n')) {
        const [sd, data, mk, ris, quando, vincitoreSd] = riga.split(' | ');
        const [p1, punteggio, p2] = ris.split(' ');
        const [a, b] = punteggio.split('-').map(Number);
        const nodo = (showdowns[sd] ||= { info: { categoria: 'VGC', data, vincitoreShowdown: vincitoreSd }, matches: {} });
        nodo.matches[mk] = { player1Id: p1, player2Id: p2, player1: p1, player2: p2, winnerId: a > b ? p1 : p2, team1: '', team2: '', p1score: a, p2score: b, p1points: 0, p2points: 0, lastEdit: quando };
    }
    return { s0: { info: { name: "Sant'Alvise I", status: 'playing' }, showdowns } };
}
const PLAYERS = { lukiani: { info: { name: 'Lukiani' } }, didi: { info: { name: 'Didi' } }, ilaria: { info: { name: 'Ilaria' } } };
const risultato = (seasons = stagione0()) => calcola({ players: PLAYERS, seasons }, { stagione: 'all' });
const di = (r, id) => r.players.find(p => p.id === id);

test('Statistiche: le serie dell\'allenatore dai match veri, con gli showdown vinti di fila e il giorno dei record', () => {
    const r = risultato();
    const luk = di(r, 'lukiani').serie;
    assert.equal(luk.pulitaMax, 2, 'mai più di 2 match puliti di fila (non 4)');
    assert.equal(luk.pulitaMaxData, '2026-10-22');
    assert.equal(luk.cleanSweep, 4, 'quattro match puliti in tutto, ma non di fila');
    assert.equal(luk.vittorieMax, 5);
    assert.equal(luk.showdownMax, 3, 'i primi tre showdown');
    assert.equal(luk.showdownAttuale, 0, 'il quarto lo ha perso');
    assert.equal(luk.showdownMaxData, '2026-10-22');
    const didi = di(r, 'didi').serie;
    assert.deepEqual([didi.vittorieMax, didi.vittorieAttuale, didi.showdownMax, didi.showdownAttuale], [4, 4, 1, 1]);
    assert.equal(didi.vittorieMaxData, '2026-10-23');
    const ilaria = di(r, 'ilaria').serie;
    assert.deepEqual([ilaria.vittorieMax, ilaria.pulitaMax, ilaria.showdownMax], [0, 0, 0]);
});

test('Statistiche: uno showdown non ancora deciso non spezza la serie di showdown', () => {
    const s = stagione0();
    delete s.s0.showdowns['-P4_QP2Ogqr2bvsOSfK1'].info.vincitoreShowdown;       // il secondo showdown è ancora aperto
    const luk = di(risultato(s), 'lukiani').serie;
    assert.equal(luk.showdownMax, 2, 'il primo e il terzo, di fila');
});

test('Statistiche: le date GG/MM/AAAA si ordinano come date, non come testo', () => {
    // "02/11/2026" è dopo "12/10/2026" anche se come testo viene prima
    const m = (s1, s2, lastEdit) => ({ player1Id: 'lukiani', player2Id: 'ilaria', winnerId: s1 > s2 ? 'lukiani' : 'ilaria', team1: '', team2: '', p1score: s1, p2score: s2, p1points: 0, p2points: 0, lastEdit });
    const seasons = { s1: { info: { name: 'S' }, showdowns: {
        a: { info: { categoria: 'VGC', data: '12/10/2026' }, matches: { match1: m(3, 0, '2026-10-12T10:00:00Z') } },
        b: { info: { categoria: 'VGC', data: '02/11/2026' }, matches: { match1: m(0, 3, '2026-11-02T10:00:00Z') } }
    } } };
    const luk = di(risultato(seasons), 'lukiani').serie;
    assert.equal(luk.vittorieMax, 1);
    assert.equal(luk.vittorieAttuale, 0, 'l\'ultimo match (novembre) è perso');
});

test('Titoli.serieAggiornate: i numeri veri vincono su quelli salvati (anche sui vecchi nomi dello showdown)', () => {
    const r = risultato();
    // quello che la funzione vecchia scriveva: 4 puliti di fila, e un record di showdown nei vecchi campi
    const salvati = { maxcleanstrike: 4, cleanstrike: 3, maxwonstrike: 9, wonstrike: 2, maxsdstrike: 30, sdstrike: 5, maxshowdownstrike: 1, loyaltybadge: true };
    const veri = Titoli.serieAggiornate(salvati, r, 'Lukiani');       // anche con la maiuscola
    assert.deepEqual([veri.maxcleanstrike, veri.cleanstrike, veri.maxwonstrike, veri.wonstrike, veri.maxshowdownstrike, veri.showdownstrike], [2, 0, 5, 0, 3, 0]);
    assert.equal(veri.loyaltybadge, true, 'il resto dei numeri salvati non si tocca');
    assert.equal(salvati.maxcleanstrike, 4, 'l\'oggetto salvato non viene modificato');
    // il badge Clean Streak (bronzo a 4 match puliti) non c'è, e nemmeno quello degli showdown (con il vecchio 30)
    const serie = stats => Titoli.badgeSbloccati(stats, 'lukiani').map(b => b.id).filter(id => id !== 'founder');     // Lukiani è un fondatore: il suo badge speciale non c'entra
    assert.deepEqual(serie(veri), []);
    assert.deepEqual(serie(salvati), ['clean', 'sd'], 'con i numeri salvati sì: è il bug');
    const clean = Titoli.BADGE.find(b => b.id === 'clean');
    const st = Titoli.statoSerie(veri, clean);
    assert.deepEqual([st.record, st.attuale, st.livello], [2, 0, 0]);
    assert.equal(st.obiettivo, clean.steps[0]);
});

test('Titoli.serieAggiornate: la data del record viene dai match; senza risultato restano i numeri salvati; chi non ha match fa zero', () => {
    const r = risultato();
    const veri = Titoli.serieAggiornate({ maxcleanstrikedate: '2020-01-01' }, r, 'didi');
    assert.equal(veri.maxwonstrikedate, '2026-10-23');
    assert.equal(Titoli.formattaData(veri.maxwonstrikedate), '23/10/2026');
    // lettura fallita: i salvati
    const salvati = { maxcleanstrike: 4 };
    assert.equal(Titoli.serieAggiornate(salvati, null, 'lukiani'), salvati);
    assert.equal(Titoli.serieAggiornate(salvati, {}, 'lukiani'), salvati);
    assert.deepEqual(Titoli.serieAggiornate(null, null, 'x'), {});
    // un allenatore che nei match che fanno statistica non c'è (solo cup o beta) ha le serie a zero, qualunque cosa dicano i numeri salvati
    const zero = Titoli.serieAggiornate({ maxcleanstrike: 7, maxwonstrike: 10 }, r, 'nessuno');
    assert.deepEqual([zero.maxcleanstrike, zero.maxwonstrike, zero.maxshowdownstrike], [0, 0, 0]);
    assert.deepEqual(Titoli.badgeSbloccati(zero, 'nessuno'), []);
});

test('le cup non entrano nelle serie (nemmeno se la funzione vecchia le contava)', () => {
    const s = stagione0();
    // una cup giocata dopo: tre match puliti di Lukiani, che non devono allungare niente
    const m = (n, t) => ({ player1Id: 'lukiani', player2Id: 'didi', winnerId: 'lukiani', team1: '', team2: '', p1score: 3, p2score: 0, p1points: 0, p2points: 0, lastEdit: `2026-10-24T10:0${n}:00Z` });
    s.s9 = { info: { name: 'Christmas Cup', tipo: 'cup', status: 'closed', winner: 'lukiani' }, showdowns: { c1: { info: { categoria: 'VGC', data: '2026-10-24', vincitoreShowdown: 'lukiani' }, matches: { match1: m(1), match2: m(2), match3: m(3) } } } };
    const luk = di(risultato(s), 'lukiani').serie;
    assert.equal(luk.pulitaMax, 2);
    assert.equal(luk.vittorieMax, 5);
    assert.equal(luk.showdownMax, 3);
});

test('parità: Statistiche e il codice delle funzioni (risultati-match.js) danno le stesse serie sugli stessi match', async () => {
    const seasons = stagione0();
    const db = creaDb({ players: { lukiani: {}, didi: {}, ilaria: {} }, seasons });
    const r = risultato(seasons);
    for (const id of ['lukiani', 'didi', 'ilaria']) {
        await caricaSito(db).ricalcolaStatisticheGlobali(id);
        const salvati = db.leggi(`players/${id}/stats/badges`) || {};
        const veri = Titoli.serieDaStatistiche(di(r, id));
        for (const k of ['maxwonstrike', 'wonstrike', 'maxcleanstrike', 'cleanstrike', 'maxshowdownstrike']) {
            assert.equal(Number(salvati[k] || 0), veri[k], `${id}: ${k}`);
        }
    }
});
