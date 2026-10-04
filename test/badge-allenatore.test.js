'use strict';
// I badge degli allenatori (docs/badge-allenatore.js): dodici badge a tre livelli, difficili, sui numeri reali di Statistiche.calcola.
//   - soglie crescenti e pensate per una stagione tipica (14 showdown, ~105 set): il bronzo richiede un impegno vero;
//   - le percentuali contano solo dopo abbastanza match;
//   - le immagini: il campione usa quelle che il sito ha già, le altre sono da caricare e il catalogo le elenca;
//   - stessi meccanismi e stessi stili dei badge dei team.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BA = require('../docs/badge-allenatore.js');
const BT = require('../docs/badge-team.js');
const { calcola: statistiche } = require('../docs/statistiche.js');

const DOCS = path.join(__dirname, '..', 'docs');

// un allenatore con i numeri che interessano ai badge
function giocatore(extra = {}) {
    return {
        id: 'didi', stagioniGiocate: 0, stagioniVinte: 0, eloPicco: null,
        match: { giocati: 0, vinti: 0, persi: 0 }, set: { giocati: 0, vinti: 0, persi: 0 }, showdown: { giocati: 0, vinti: 0, persi: 0 },
        percMatch: null, ko: { fatti: 0, setPerfetti: 0, setAlLimite: 0 }, formati: {}, ...extra
    };
}
const risultato = (g, pokemon = []) => ({ players: [g], teams: [], pokemon });
const per = (lista, id) => lista.find(b => b.id === id);

test('catalogo: dodici badge, soglie crescenti, tre livelli, ognuno con la sua spiegazione', () => {
    assert.equal(BA.CATALOGO.length, 12);
    assert.equal(new Set(BA.CATALOGO.map(b => b.id)).size, 12);
    for (const b of BA.CATALOGO) {
        assert.equal(b.soglie.length, 3, b.id);
        assert.ok(b.soglie[0] < b.soglie[1] && b.soglie[1] < b.soglie[2], `${b.id}: soglie crescenti`);
        assert.ok(b.descrizione.length > 15 && b.unita && b.icona, b.id);
        assert.ok(b.immagini.length === 3, `${b.id}: un file per livello`);
    }
    // sono più di quelli che c'erano (tre serie e il fondatore)
    assert.ok(BA.CATALOGO.length > 4);
});

test('senza dati: tutti a zero, bloccati, senza errori (anche con un allenatore che non esiste)', () => {
    for (const lista of [BA.calcola(risultato(giocatore()), 'didi'), BA.calcola(risultato(giocatore()), 'nessuno'), BA.calcola(null, 'x'), BA.calcola({}, 'x')]) {
        assert.equal(lista.length, 12);
        for (const b of lista) { assert.equal(b.livello, 0, b.id); assert.equal(b.classeLivello, 'locked'); assert.equal(b.valore, 0); }
    }
    assert.deepEqual(BA.guadagnati(BA.calcola(null, 'x')), []);
});

test('difficili: una stagione piena di buoni risultati non basta per l\'oro, e per il primo livello serve più di un assaggio', () => {
    // una stagione: 42 match (60% vinti), 105 set (58 vinti), 14 showdown (8 vinti), 250 KO
    const stagione = giocatore({
        stagioniGiocate: 1, match: { giocati: 42, vinti: 25, persi: 17 }, set: { giocati: 105, vinti: 58, persi: 47 }, showdown: { giocati: 14, vinti: 8, persi: 6 },
        percMatch: 59.5, ko: { fatti: 260, setPerfetti: 4, setAlLimite: 3 }, eloPicco: 1120
    });
    const l = BA.calcola(risultato(stagione), 'didi');
    for (const b of l) assert.ok(b.livello <= 1, `${b.id}: dopo una stagione al massimo il bronzo (livello ${b.livello})`);
    assert.equal(per(l, 'matchwinner').livello, 1);
    assert.equal(per(l, 'showdown').livello, 1);
    assert.equal(per(l, 'setcrusher').livello, 0, '58 set vinti: ancora sotto i 70');
    assert.equal(per(l, 'knockout').livello, 0);
    assert.equal(per(l, 'dominant').livello, 0, 'il 59,5% non è il 60%');
    assert.equal(per(l, 'elopeak').livello, 1);
});

test('livelli: bronzo, argento e oro alle soglie, con il traguardo successivo e la barra del progresso', () => {
    const l = BA.calcola(risultato(giocatore({ match: { giocati: 130, vinti: 100, persi: 30 }, showdown: { vinti: 50 } })), 'didi');
    const m = per(l, 'matchwinner');
    assert.equal(m.livello, 2, '100 match vinti: argento (75), non ancora oro (160)');
    assert.equal(m.prossima, 160);
    assert.ok(m.progresso > 0.2 && m.progresso < 0.4, `(100-75)/(160-75) = ${m.progresso}`);
    assert.equal(m.livelloNome, 'Silver');
    assert.equal(per(l, 'showdown').livello, 3);
    assert.equal(per(l, 'showdown').prossima, null);
    assert.equal(per(l, 'showdown').progresso, 1);
    // dal più alto al più basso
    assert.deepEqual(BA.guadagnati(l).map(b => b.id), ['showdown', 'matchwinner']);
});

test('percentuale di vittorie: conta solo dopo 30 match', () => {
    const pochi = per(BA.calcola(risultato(giocatore({ percMatch: 90, match: { giocati: 12, vinti: 11, persi: 1 } })), 'didi'), 'dominant');
    assert.equal(pochi.livello, 0);
    assert.match(pochi.nota, /needs 30 matches played \(now 12\)/);
    assert.deepEqual(pochi.sblocco, { valore: 12, serve: 30, etichetta: 'matches played' });
    const tanti = per(BA.calcola(risultato(giocatore({ percMatch: 71.3, match: { giocati: 40, vinti: 29, persi: 11 } })), 'didi'), 'dominant');
    assert.equal(tanti.livello, 2);
});

test('format master: formati con almeno 8 match e almeno il 60% di vittorie', () => {
    const formati = { VGC: { n: 20, vinti: 14 }, OU: { n: 10, vinti: 6 }, Monotype: { n: 7, vinti: 7 }, Uber: { n: 12, vinti: 5 } };
    assert.equal(BA.formatiForti(giocatore({ formati })), 2, 'Monotype ha troppi pochi match, Uber troppe sconfitte');
    assert.equal(per(BA.calcola(risultato(giocatore({ formati })), 'didi'), 'formatmaster').livello, 2);
});

test('collezionista: le specie diverse portate in campo (non i team, non le comparse in panchina)', () => {
    const mostro = (specieId, portato, player = 'didi') => ({ player, specieId, portato });
    const pokemon = [mostro('garchomp', 5), mostro('garchomp', 3), mostro('gengar', 1), mostro('kyurem', 0), mostro('zapdos', 4, 'lu')];
    const lista = BA.calcola(risultato(giocatore(), pokemon), 'didi');
    assert.equal(per(lista, 'collector').valore, 2, 'garchomp (due volte) e gengar; kyurem non è mai sceso; zapdos è di Lu');
    assert.equal(per(lista, 'collector').livello, 0);
    const tanti = Array.from({ length: 41 }, (_, i) => mostro('specie' + i, 1));
    assert.equal(per(BA.calcola(risultato(giocatore(), tanti), 'didi'), 'collector').livello, 2);
});

test('immagini: il campione usa quelle del sito, le altre 33 sono da caricare e hanno un nome prevedibile', () => {
    assert.equal(BA.IMMAGINI_DA_CARICARE.length, 33);
    assert.ok(!BA.IMMAGINI_DA_CARICARE.some(n => n.startsWith('champion-')));
    assert.ok(BA.IMMAGINI_DA_CARICARE.every(n => /^badge-allenatore-[a-z]+-(bronze|silver|gold)\.png$/.test(n)));
    for (const f of ['champion-bronze.png', 'champion-silver.png', 'champion-gold.png']) assert.ok(fs.existsSync(path.join(DOCS, 'immagini', f)), f);
});

test('HTML: scaffale con tutti i badge, medagliette dei più alti, testi sicuri', () => {
    const l = BA.calcola(risultato(giocatore({ match: { giocati: 130, vinti: 100, persi: 30 }, stagioniVinte: 1 })), 'didi');
    const scaffale = BA.htmlScaffale(l);
    assert.match(scaffale, /TRAINER BADGES <small class="bt-conto">2\/12<\/small>/);
    assert.equal((scaffale.match(/class="bt bt-/g) || []).length, 12);
    assert.match(scaffale, /bt-silver/);
    assert.match(scaffale, /bt-bloccato/);
    assert.match(BA.htmlMini(l, 1), /bt-mini bt-silver.*\+1/s);
    // le immagini mancanti si sostituiscono con la medaglia disegnata (stessa funzione dei team)
    assert.match(scaffale, /onerror="BadgeTeam\.immagineMancante\(this,'/);
    assert.equal(BA.htmlScaffale(l, { titolo: '' }).includes('bt-titolo'), false);
});

test('dati veri di Statistiche.calcola: un allenatore con match e set ha badge coerenti con i suoi numeri', () => {
    const lato = (nome, svenuti, specie) => ({ nome, portati: 4, svenuti, pokemon: specie.map(s => ({ specie: s, nome: '', portato: true, titolare: false, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false })) });
    const set = { v: 3, turni: 6, vincitore: 'p1', p1: lato('Didi', 0, ['Garchomp', 'Gengar']), p2: lato('Lu', 4, ['Kyurem']) };
    const m = (n, setStats) => ({ player1: 'didi', player1Id: 'didi', player2: 'lu', player2Id: 'lu', winnerId: 'didi', team1: 'A', team2: 'B', score: '2-0', p1score: 2, p2score: 0, p1points: 2, p2points: 0, data: `2026-05-0${n}`, categoria: 'VGC', p1EloAtMatch: 1000, p2EloAtMatch: 1000, p1DeltaElo: 16, p2DeltaElo: -16, setStats });
    const dati = { players: { didi: { info: { name: 'Didi' }, teams: { a: { nome: 'A', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }, { nome: 'Gengar' }] } } }, lu: { info: { name: 'Lu' }, teams: { b: { nome: 'B', categoria: 'VGC', pokemon: [{ nome: 'Kyurem' }] } } } },
        seasons: { s1: { info: { name: 'S1', status: 'playing' }, showdowns: { x: { info: { categoria: 'VGC', data: '2026-05-01' }, matches: { match1: m(1, { set1: set, set2: set }), match2: m(2, { set1: set }) } } } } } };
    const r = statistiche(dati, { stagione: 'all' });
    const l = BA.calcola(r, 'didi');
    assert.equal(per(l, 'matchwinner').valore, 2);
    assert.equal(per(l, 'setcrusher').valore, 4);
    assert.equal(per(l, 'untouchable').valore, 3, 'tre set vinti senza perdere nessuno');
    assert.equal(per(l, 'collector').valore, 2);
    assert.equal(per(l, 'knockout').valore, 12, 'tre set con 4 avversari KO');
    assert.equal(per(l, 'veteran').valore, 1);
});

test('i badge dei team non cambiano: stesso catalogo, stesse soglie, stessi file da caricare', () => {
    assert.equal(BT.CATALOGO.length, 10);
    assert.equal(BT.IMMAGINI_DA_CARICARE.length, 18);
    assert.equal(typeof BT.costruisci, 'function');
});
