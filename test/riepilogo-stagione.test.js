'use strict';
// Il riepilogo di fine stagione (docs/riepilogo-stagione.js): i premi, la classifica, l'HTML protetto e il collegamento nella pagina e nell'app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../docs/riepilogo-stagione.js');
const AppMatches = require('../docs/app-matches.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

const giocatore = (id, extra = {}) => ({
    id, nome: id.toUpperCase(), colore: '#112233', avatar: '', eloDelta: 0,
    ko: { fatti: 0, subiti: 0, setConDati: 30, setPerfetti: 0, setAlLimite: 0 },
    serie: { vittorieMax: 0 }, azioni: { setConDati: 30, cambi: 0 }, ...extra
});
const dati = (players, extra = {}) => ({
    risultato: { totali: { match: 12, set: 36, showdown: 4 }, players, pokemon: [], formati: ['OU'], stagioni: [{ nome: 'S1' }] },
    info: { id: 's1', name: 'Season <1>', selected_formats: ['OU'], winner: 'bea' },
    leaderboard: { ada: { points: 10, won: 3, lost: 1, setW: 9, sdWon: 2, sdLost: 0 }, bea: { points: 14, won: 5, lost: 1, setW: 12, sdWon: 3, sdLost: 1 } },
    showdowns: {}, mvp: null, ...extra
});

test('senza match non c\'è niente da riassumere', () => {
    assert.equal(R.calcola({ risultato: { totali: { match: 0 }, players: [] } }), null);
    assert.equal(R.calcola(null), null);
});

test('classifica e campione: punti, poi match vinti, poi set vinti; il campione è quello scritto dalla stagione', () => {
    const r = R.calcola(dati([giocatore('ada'), giocatore('bea')]));
    assert.deepEqual(r.classifica.map(c => c.id), ['bea', 'ada']);
    assert.equal(r.vincitore.id, 'bea');
    assert.equal(r.numeri.match, 12);
    // senza vincitore scritto, vince la prima della classifica
    const senza = R.calcola(dati([giocatore('ada'), giocatore('bea')], { info: { id: 's1', name: 'S' } }));
    assert.equal(senza.vincitore.id, 'bea');
});

test('premi: solo se qualcuno li merita; a pari merito si premiano tutti (al massimo tre); le medie vogliono un minimo di set', () => {
    const p = [
        giocatore('ada', { ko: { fatti: 40, subiti: 30, setConDati: 30, setPerfetti: 3, setAlLimite: 0 }, serie: { vittorieMax: 4 } }),
        giocatore('bea', { ko: { fatti: 40, subiti: 12, setConDati: 30, setPerfetti: 0, setAlLimite: 0 }, serie: { vittorieMax: 2 } }),
        giocatore('cleo', { ko: { fatti: 5, subiti: 1, setConDati: 2, setPerfetti: 0, setAlLimite: 0 } })
    ];
    const premi = Object.fromEntries(R.calcola(dati(p)).premi.map(x => [x.id, x]));
    assert.deepEqual(premi.ko.vincitori.map(v => v.id), ['ada', 'bea'], 'pari merito');
    assert.deepEqual(premi.muro.vincitori.map(v => v.id), ['bea'], 'cleo ha troppi pochi set per la media');
    assert.deepEqual(premi.pulito.vincitori.map(v => v.id), ['ada']);
    assert.equal(premi.rimonta, undefined, 'nessuno ha vinto all\'ultimo Pokémon: niente premio');
    assert.deepEqual(premi.serie.vincitori.map(v => v.id), ['ada'], 'una serie di 4 conta, 2 no (soglia 2)');
    assert.equal(premi.collezione, undefined, 'senza team niente premi sui Pokémon');
});

test('Heartbreaker e Upset vengono dai match: persi per un set solo, e la vittoria di chi aveva meno Elo', () => {
    const showdowns = { sd1: { info: { categoria: 'OU', data: '2026-10-01' }, matches: {
        m1: { player1Id: 'ada', player2Id: 'bea', p1score: 1, p2score: 2, p1EloAtMatch: 1000, p2EloAtMatch: 1000, data: '2026-10-01' },
        m2: { player1Id: 'ada', player2Id: 'bea', p1score: 2, p2score: 1, p1EloAtMatch: 980, p2EloAtMatch: 1100, data: '2026-10-02' },
        m3: { player1Id: 'ada', player2Id: 'bea', p1score: 3, p2score: 0, p1EloAtMatch: 1090, p2EloAtMatch: 1000, data: '2026-10-03' },
        m4: { player1Id: 'ada', player2Id: 'bea', p1score: 1, p2score: 2, p1EloAtMatch: 1000, p2EloAtMatch: 1000, data: '2026-10-04' }
    } } };
    const premi = Object.fromEntries(R.calcola(dati([giocatore('ada'), giocatore('bea')], { showdowns })).premi.map(x => [x.id, x]));
    assert.deepEqual(premi.sfortuna.vincitori.map(v => v.id), ['ada'], 'ada ha perso due volte per un set (1-2), bea una sola (2-1) e il 3-0 non conta: il premio vuole almeno due');
    assert.equal(premi.sorpresa.vincitori[0].id, 'ada');
    assert.equal(premi.sorpresa.valore, 120, 'ada (980) batte bea (1100): 120 Elo in meno');
});

test('MVP: il risultato dello spoglio, oppure "si sta ancora contando" se ci sono solo i voti', () => {
    const con = R.calcola(dati([giocatore('ada')], { mvp: { risultato: { vincitori: { 0: { specie: 'Gengar', team: 'T', player: 'Ada', voti: 2 } } } } }));
    assert.equal(con.mvp.specie, 'Gengar');
    assert.equal(con.mvpInCorso, false);
    const voti = R.calcola(dati([giocatore('ada')], { mvp: { voti: { ada: {} } } }));
    assert.equal(voti.mvp, null);
    assert.equal(voti.mvpInCorso, true);
});

test('l\'HTML protegge il testo che viene dal database e il testo da condividere racconta i premi', () => {
    const riep = R.calcola(dati([giocatore('ada', { nome: '<img src=x onerror=alert(1)>' }), giocatore('bea')]));
    const h = R.html(riep, { gif: s => `g/${s}` });
    assert.doesNotMatch(h, /<img src=x/);
    assert.match(h, /Season &lt;1&gt;/);
    assert.match(R.html(null), /No recap available/);
    const t = R.testo(riep);
    assert.match(t, /Champion: BEA/);
    assert.match(t, /matches · /);
});

test('nella pagina: una stagione chiusa calcola il riepilogo, lo monta con i due tasti e lo dice all\'app', () => {
    const m = leggi('matches.html');
    assert.match(m, /<script src="riepilogo-stagione\.js"><\/script>/);
    assert.match(m, /<link rel="stylesheet" href="riepilogo-stagione\.css">/);
    assert.match(m, /if \(!stagioneChiusa \|\| !window\.RiepilogoStagione/);
    assert.match(m, /riepilogo: !!riepilogoIniziale/);
    assert.match(m, /RiepilogoStagione\.monta\(window, riepilogo,/);
    const js = leggi('riepilogo-stagione.js');
    assert.match(js, /SEASON RECAP<\/button><button[^>]*>CALENDAR/);
    assert.doesNotMatch(js, /classList\.add\('rs-attivo'\)/);
    const css = leggi('riepilogo-stagione.css');
    assert.match(css, /\[data-vista="riepilogo"\] #matchList \{ display: none; \}/);
    assert.match(css, /\[data-vista="calendario"\] #riepilogoStagione \{ display: none; \}/);
    assert.match(css, /html\.app-shell\[data-mt="rc"\] #app-showdown \{ display: none !important; \}/);
});

test('app: la stagione chiusa ha il tag Recap davanti agli altri, e un tag sconosciuto torna ai showdown', () => {
    assert.deepEqual(AppMatches.TABS_RIEPILOGO.map(t => t.id), ['rc', 'sd', 'rk']);
    assert.match(AppMatches.htmlTabs('rc', 5, true), /data-tab="rc"/);
    assert.doesNotMatch(AppMatches.htmlTabs('sd', 5, false), /data-tab="rc"/);
    assert.equal(AppMatches.tabValido('rc', true), 'rc');
    assert.equal(AppMatches.tabValido('rc', false), 'sd', 'senza riepilogo il tag non esiste');
});
