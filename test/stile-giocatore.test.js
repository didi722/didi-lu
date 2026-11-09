'use strict';
// Lo stile dei giocatori (stile-giocatore.js): le scelte di ogni allenatore nei set giocati sul sito, sommate (players/<id>/stile), e il collegamento
// con la CPU: un nodo così, letto da cpu-avversario.js, dà le abitudini di chi ha davanti.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/stile-giocatore.js');
const AV = require('../docs/cpu-avversario.js');

const az = (attacco, protezione, cambi, altro = 0) => ({
    decisioni: attacco + protezione + cambi + altro, mosse: attacco + protezione + altro, cambi, attacco, protezione, recupero: 0, potenziamento: altro, campo: 0, supporto: 0, disturbo: 0, altro: 0
});
const set = (a1, a2) => ({ p1: { nome: 'A', azioni: a1 }, p2: { nome: 'B', azioni: a2 } });
const match = (p1, p2, ...setStats) => ({ player1Id: p1, player2Id: p2, setStats: Object.fromEntries(setStats.map((s, i) => ['set' + (i + 1), s])) });
const stagione = (...matches) => ({ showdowns: { sd1: { matches: Object.fromEntries(matches.map((m, i) => ['match' + (i + 1), m])) } } });

test('somme: le scelte di ogni lato vanno all\'allenatore che ha giocato quel lato; la lega è la somma di tutti', () => {
    const seasons = {
        s0: stagione(
            match('didi', 'lu', set(az(8, 1, 1), az(6, 3, 1)), set(az(7, 2, 1), az(9, 0, 1))),
            match('lu', 'didi', set(az(5, 4, 1), az(10, 0, 0)))          // qui didi gioca da p2
        )
    };
    const { giocatori, lega } = S.somme(seasons);
    assert.equal(giocatori.didi.set, 3);
    assert.equal(giocatori.didi.azioni.attacco, 8 + 7 + 10);
    assert.equal(giocatori.didi.azioni.protezione, 1 + 2 + 0);
    assert.equal(giocatori.didi.azioni.cambi, 1 + 1 + 0);
    assert.equal(giocatori.lu.azioni.attacco, 6 + 9 + 5);
    assert.equal(giocatori.lu.set, 3);
    assert.equal(lega.set, 6);
    assert.equal(lega.azioni.attacco, 8 + 6 + 7 + 9 + 5 + 10);
    assert.equal(lega.decisioni, giocatori.didi.decisioni + giocatori.lu.decisioni);
    // decisioni = mosse + cambi
    assert.equal(giocatori.didi.decisioni, (8 + 1 + 1) + (7 + 2 + 1) + (10 + 0 + 0));
});

test('somme: la stagione beta non conta (come nelle statistiche del sito); i set senza scelte registrate (i più vecchi) o senza decisioni si saltano', () => {
    const vecchio = { p1: { nome: 'A' }, p2: { nome: 'B' } };                       // un set di prima che si contassero le scelte
    const vuoto = set(az(0, 0, 0), az(0, 0, 0));
    const seasons = {
        sbeta: stagione(match('didi', 'lu', set(az(9, 9, 9), az(9, 9, 9)))),
        s0: stagione(match('didi', 'lu', vecchio, vuoto, set(az(4, 1, 0), az(3, 2, 0))))
    };
    const { giocatori, lega } = S.somme(seasons);
    assert.equal(giocatori.didi.set, 1);
    assert.equal(giocatori.didi.azioni.attacco, 4);
    assert.equal(lega.set, 2);
    assert.equal(S.somme(seasons, { escludi: [] }).giocatori.didi.set, 2, 'con escludi vuoto conta anche la beta');
});

test('somme: id in minuscolo anche se scritti diversamente; senza id si usa il nome; match strani o vuoti non rompono niente', () => {
    const seasons = {
        s0: stagione(
            match(' Didi ', 'LU', set(az(1, 0, 0), az(1, 0, 0))),
            { player1: 'Didi', player2: 'Lu', setStats: { set1: set(az(1, 0, 0), az(1, 0, 0)) } },        // senza id: il nome
            match('x', 'x', set(az(1, 0, 0), az(1, 0, 0))),                                                  // contro se stesso: non conta
            { player1Id: 'a', player2Id: 'b' },                                                              // senza statistiche
            { player1Id: 'a', player2Id: 'b', setStats: 'boh' },
            null
        ),
        s1: null,
        s2: {}
    };
    const { giocatori } = S.somme(seasons);
    assert.deepEqual(Object.keys(giocatori).sort(), ['didi', 'lu']);
    assert.equal(giocatori.didi.set, 2);
    for (const vuoto of [null, undefined, {}, { s0: {} }, { s0: { showdowns: null } }]) assert.deepEqual(S.profili(vuoto), {});
});

test('profili: un nodo per allenatore con versione, set, decisioni, azioni e la lega (la stessa per tutti)', () => {
    const seasons = { s0: stagione(match('didi', 'lu', set(az(8, 1, 1), az(6, 3, 1)))) };
    const p = S.profili(seasons);
    assert.deepEqual(Object.keys(p).sort(), ['didi', 'lu']);
    assert.equal(p.didi.v, 1);
    assert.equal(p.didi.set, 1);
    assert.equal(p.didi.decisioni, 10);
    assert.deepEqual(Object.keys(p.didi.azioni).sort(), [...S.AZIONI].sort());
    assert.deepEqual(p.didi.lega, p.lu.lega);
    assert.equal(p.didi.lega.set, 2);
    assert.ok(!('aggiornato' in p.didi), 'l\'orario lo mette chi scrive');
});

test('uguali: si confronta il contenuto, non l\'orario né l\'ordine delle chiavi; un numero diverso o un nodo mancante sono differenze', () => {
    const seasons = { s0: stagione(match('didi', 'lu', set(az(8, 1, 1), az(6, 3, 1)))) };
    const a = S.profili(seasons).didi;
    const b = JSON.parse(JSON.stringify({ ...a, aggiornato: 12345 }));
    const rimescolato = { lega: a.lega, azioni: Object.fromEntries(Object.entries(a.azioni).reverse()), decisioni: a.decisioni, set: a.set, v: a.v };
    assert.equal(S.uguali(a, b), true);
    assert.equal(S.uguali(a, rimescolato), true);
    const c = JSON.parse(JSON.stringify(a)); c.azioni.protezione++;
    assert.equal(S.uguali(a, c), false);
    assert.equal(S.uguali(a, null), false);
    assert.equal(S.uguali(null, undefined), true);
});

test('il nodo salvato, letto dalla CPU (cpu-avversario.js), dà le abitudini giuste: quote dell\'allenatore e media della lega', () => {
    const seasons = { s0: stagione(match('didi', 'lu', set(az(60, 20, 10, 10), az(80, 5, 5, 10)), set(az(60, 20, 10, 10), az(80, 5, 5, 10)))) };
    const nodo = S.profili(seasons).didi;
    const profilo = AV.daStile(JSON.parse(JSON.stringify(nodo)));       // come arriva dal database
    assert.equal(profilo.giocatore.n, 200);
    assert.ok(Math.abs(profilo.giocatore.quote.protezione - 0.2) < 1e-9);
    assert.ok(Math.abs(profilo.giocatore.quote.cambio - 0.1) < 1e-9);
    assert.equal(profilo.lega.n, 400);
    assert.ok(Math.abs(profilo.lega.quote.attacco - 0.7) < 1e-9);       // (60+80)/200
    assert.ok(Math.abs(profilo.lega.quote.protezione - 0.125) < 1e-9);  // (20+5)/200
});

test('i dati veri: i profili di un\'esportazione reale del database, con quote che sommano a 1 e media della lega vicina a quella di riserva della CPU', { skip: !fs.existsSync(path.join(__dirname, 'dati', 'esempio-stile.json')) && 'nessun file di esempio' }, () => {
    const dati = JSON.parse(fs.readFileSync(path.join(__dirname, 'dati', 'esempio-stile.json'), 'utf8'));
    const p = S.profili(dati.seasons);
    assert.ok(Object.keys(p).length >= 2);
    for (const nodo of Object.values(p)) {
        const prof = AV.daStile(nodo);
        const q = prof.giocatore.quote;
        assert.ok(Math.abs(q.attacco + q.protezione + q.cambio + q.altro - 1) < 1e-9);
    }
    const lega = AV.daStile(Object.values(p)[0]).lega.quote;
    for (const k of AV.CATEGORIE) assert.ok(Math.abs(lega[k] - AV.QUOTE_LEGA[k]) < 0.03, `${k}: ${lega[k]} contro ${AV.QUOTE_LEGA[k]}`);
});
