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

// ---------- le situazioni, imparate dai replay ----------
const Sit = require('../docs/cpu-situazioni.js');
const { set: setFinti } = require('./dati/log-finti.js');
// con pochi PS si cambia molto di più
const CON_PS_BASSI_FINTO = bassi => (bassi ? { attacco: 0.45, protezione: 0.2, cambio: 0.3, altro: 0.05 } : { attacco: 0.74, protezione: 0.11, cambio: 0.04, altro: 0.11 });

// stagioni con un replay (finto) per ogni set: l'indirizzo dice quale log scaricare
function stagioniConReplay(n, effetto = CON_PS_BASSI_FINTO) {
    const finti = setFinti(n, effetto);
    const matches = {};
    finti.forEach((s, i) => { matches['m' + i] = { player1Id: 'Ada', player2Id: 'bruno', replays: { set1: { url: `https://replay.example/${i}.html`, vincitore: '1' } } }; });
    return { seasons: { s0: { showdowns: { sd1: { matches } } }, sbeta: { showdowns: { x: { matches: { m: { player1Id: 'a', player2Id: 'b', replays: { set1: { url: 'https://replay.example/beta.html' } } } } } } } }, finti };
}
const scaricaDa = finti => async url => { const m = /\/(\d+)\.html$/.exec(url); if (!m) throw new Error('404'); return JSON.stringify({ log: finti[+m[1]].log }); };
const leggiFinto = testo => { const d = JSON.parse(testo); return { log: d.log }; };

test('replay: quali set si possono leggere (con l\'indirizzo del replay, non la beta, non contro se stessi), con i due allenatori in minuscolo', () => {
    const seasons = {
        s0: { showdowns: { a: { matches: {
            m1: { player1Id: 'Didi', player2Id: 'Lu', replays: { set1: { url: 'https://x/1.html' }, set2: { url: 'https://x/2.html' }, set3: { url: '' }, set4: {}, set5: { url: 'http://non-sicuro/5.html' } } },
            m2: { player1Id: 'a', player2Id: 'a', replays: { set1: { url: 'https://x/3.html' } } },
            m3: { player1Id: 'a', player2Id: 'b' },
            m4: null
        } } } },
        sbeta: { showdowns: { a: { matches: { m: { player1Id: 'a', player2Id: 'b', replays: { set1: { url: 'https://x/beta.html' } } } } } } },
        s1: null
    };
    const l = S.setConReplay(seasons);
    assert.deepEqual(l.map(x => x.url), ['https://x/1.html', 'https://x/2.html']);
    assert.deepEqual(l[0].giocatori, { p1: 'didi', p2: 'lu' });
    assert.deepEqual(S.setConReplay(null), []);
    assert.equal(S.setConReplay(seasons, { escludi: [] }).length, 3);
});

test('replay: le regole si imparano dai replay scaricati, con la prova incrociata; sono pubblicate solo dove servono', async () => {
    const { seasons, finti } = stagioniConReplay(70);
    const r = await S.situazioniDaiReplay(seasons, { scarica: scaricaDa(finti), leggiReplay: leggiFinto, Situazioni: Sit });
    assert.equal(r.riusate, false);
    assert.equal(r.scaricati, 70);
    assert.equal(r.falliti, 0);
    const n = r.situazioni;
    assert.equal(n.v, Sit.VERSIONE);
    assert.equal(n.set, 70);
    assert.ok(n.singoli && n.singoli.pesi.cambio.psBassi > 0.8);
    assert.equal(n.doppi, undefined, 'nessun set in doppio: nessuna regola');
    assert.equal(n.validazione.singoli.esito, 'pubblicate');
    assert.equal(n.validazione.doppi.esito, 'pochi dati');
    // è un nodo da salvare: solo valori semplici
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(n)));
    assert.ok(!JSON.stringify(n).includes('null'));
    // e la CPU lo legge: le regole arrivano al profilo
    const profilo = AV.daStile({ set: 30, azioni: { mosse: 190, cambi: 10, attacco: 100, protezione: 80, recupero: 0, potenziamento: 0, campo: 0, supporto: 0, disturbo: 0, altro: 0 }, situazioni: JSON.parse(JSON.stringify(n)) });
    assert.ok(profilo.situazioni.singoli.pesi);
    assert.equal(AV.daStile({ set: 1 }).situazioni, null);

    // senza effetto nei dati, nessuna regola
    const senza = stagioniConReplay(70, () => ({ attacco: 0.7, protezione: 0.12, cambio: 0.06, altro: 0.12 }));
    const r2 = await S.situazioniDaiReplay(senza.seasons, { scarica: scaricaDa(senza.finti), leggiReplay: leggiFinto, Situazioni: Sit });
    assert.equal(r2.situazioni.singoli, undefined);
    assert.equal(r2.situazioni.validazione.singoli.esito, 'non servono');
});

test('replay: se i replay sono gli stessi non si scarica niente; se molti non arrivano si tengono le regole di prima; un replay illeggibile si salta', async () => {
    const { seasons, finti } = stagioniConReplay(70);
    const prima = (await S.situazioniDaiReplay(seasons, { scarica: scaricaDa(finti), leggiReplay: leggiFinto, Situazioni: Sit })).situazioni;
    let scaricati = 0;
    const conta = async url => { scaricati++; return scaricaDa(finti)(url); };
    const uguali = await S.situazioniDaiReplay(seasons, { scarica: conta, leggiReplay: leggiFinto, Situazioni: Sit, precedente: JSON.parse(JSON.stringify(prima)) });
    assert.equal(uguali.riusate, true);
    assert.equal(scaricati, 0);
    assert.deepEqual(uguali.situazioni, prima);
    assert.notEqual(S.firmaDi(['a', 'b']), S.firmaDi(['a', 'c']));
    assert.equal(S.firmaDi(['b', 'a']), S.firmaDi(['a', 'b']), 'l\'ordine non conta');

    // un replay in più: si rifà tutto
    const piu = JSON.parse(JSON.stringify(seasons));
    piu.s0.showdowns.sd1.matches.nuovo = { player1Id: 'ada', player2Id: 'bruno', replays: { set1: { url: 'https://replay.example/3.html' } } };
    const nuova = await S.situazioniDaiReplay(piu, { scarica: conta, leggiReplay: leggiFinto, Situazioni: Sit, precedente: prima });
    assert.equal(nuova.riusate, false);
    assert.ok(scaricati > 70);

    // la rete non risponde per la maggior parte dei replay: restano le regole di prima, non se ne imparano di peggiori
    const rotta = async url => { if (+/\/(\d+)\./.exec(url)[1] % 2) throw new Error('rete'); return scaricaDa(finti)(url); };
    const tenute = await S.situazioniDaiReplay(piu, { scarica: rotta, leggiReplay: leggiFinto, Situazioni: Sit, precedente: prima });
    assert.equal(tenute.riusate, true);
    assert.deepEqual(tenute.situazioni, prima);
    assert.ok(tenute.falliti > 30);

    // senza regole di prima, un replay illeggibile si salta e si impara dagli altri
    let letti = 0;
    const conBuco = await S.situazioniDaiReplay(seasons, { scarica: scaricaDa(finti), leggiReplay: t => (++letti === 5 ? null : leggiFinto(t)), Situazioni: Sit });
    assert.equal(conBuco.scaricati, 69);
    assert.equal(conBuco.falliti, 1);
    assert.ok(conBuco.situazioni.singoli);
    const nessuno = await S.situazioniDaiReplay({ s0: {} }, { scarica: scaricaDa(finti), leggiReplay: leggiFinto, Situazioni: Sit });
    assert.equal(nessuno.situazioni, null);
});

test('uguali: anche le regole sulle situazioni contano nel confronto', () => {
    const seasons = { s0: stagione(match('didi', 'lu', set(az(8, 1, 1), az(6, 3, 1)))) };
    const a = S.profili(seasons).didi;
    const conRegole = Object.assign({}, a, { situazioni: { v: 1, firma: 'abc', set: 5 } });
    assert.equal(S.uguali(a, conRegole), false);
    assert.equal(S.uguali(conRegole, JSON.parse(JSON.stringify(conRegole))), true);
});
