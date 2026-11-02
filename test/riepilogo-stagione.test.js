'use strict';
// Il riepilogo di fine stagione (docs/riepilogo-stagione.js): i premi, la classifica, l'HTML protetto e il collegamento nella pagina e nell'app.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../docs/riepilogo-stagione.js');
const AppMatches = require('../docs/app-matches.js');
const Statistiche = require('../docs/statistiche.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

const giocatore = (id, extra = {}) => ({
    id, nome: id.toUpperCase(), colore: '#112233', avatar: '', eloDelta: 0,
    ko: { fatti: 0, subiti: 0, setConDati: 30, setPerfetti: 0, setAlLimite: 0 },
    serie: { vittorieMax: 0 }, azioni: { setConDati: 30, cambi: 0 }, ...extra
});
const dati = (players, extra = {}) => ({
    risultato: { totali: { match: 12, set: 36, showdown: 4 }, players, pokemon: [], formati: ['OU'], stagioni: [{ nome: 'S1' }] },
    info: { id: 's1', name: 'Season <1>', selected_formats: ['OU'], winner: 'bea', status: 'closed' },
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
    assert.match(m, /if \(\(!stagioneChiusa && !anteprima\) \|\| !window\.RiepilogoStagione/);
    assert.match(m, /get\('riepilogo'\) === '1'/, 'con ?riepilogo=1 anteprima anche di una stagione in corso, senza scrivere niente');
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

test('estetica: stesse finestre e righe della classifica del sito (seguono il tema di ognuno), pannelli scuri nell\'app', () => {
    const riep = R.calcola(dati([giocatore('ada'), giocatore('bea')]));
    const h = R.html(riep, {});
    assert.match(h, /class="cl-finestra rs-sez/);
    assert.match(h, /class="cl-barra"><span class="cl-barra-titolo">FINAL STANDINGS/);
    assert.match(h, /class="cl-riga cl-primo"[^>]*style="--cl-colore:/);
    const css = leggi('riepilogo-stagione.css');
    // i colori, le ombre, gli angoli e le rotazioni sono quelli del tema (--nb-*), non fissi
    for (const v of ['--nb-ink', '--nb-carta', '--nb-sh-s', '--nb-raggio', '--nb-rot', '--nb-font-titoli']) assert.ok(css.includes(v), v);
    assert.match(css, /html\.app-shell \.rs \.cl-finestra \{ background: radial-gradient/);
    assert.match(css, /\.rs a\.cl-riga \{ color: #000; \}/);
});

test('anteprima: una stagione non chiusa si chiama "leader" e non "campione"', () => {
    const prov = R.calcola(dati([giocatore('ada'), giocatore('bea')], { info: { id: 's1', name: 'S', status: 'playing', winner: 'ada' } }));
    assert.equal(prov.provvisorio, true);
    assert.equal(prov.vincitore.id, 'bea', 'in anteprima conta la classifica, non un vincitore scritto');
    assert.match(R.html(prov), /CURRENT LEADER/);
    assert.match(R.html(prov), /SEASON RECAP · PREVIEW/);
    const chiusa = R.calcola(dati([giocatore('ada'), giocatore('bea')], { info: { id: 's1', name: 'S', status: 'closed', winner: 'ada' } }));
    assert.equal(chiusa.provvisorio, false);
    assert.equal(chiusa.vincitore.id, 'ada');
    assert.match(R.html(chiusa), /CHAMPION/);
});

test('card immagine: dimensioni fisse, finestra con SHARE (solo se il telefono lo permette) e SAVE IMAGE', () => {
    assert.deepEqual(R.CARD, { W: 1080, H: 1350 });
    const js = leggi('riepilogo-stagione.js');
    assert.match(js, /canvas\.toBlob\(/);
    assert.match(js, /canShare\(\{ files: \[file\] \}\)/);
    assert.match(js, /download="season-recap\.png"/);
    assert.match(js, /img\.crossOrigin = 'anonymous'/, 'le immagini non sporcano il canvas: senza permesso si saltano');
    // se l'immagine non si può fare, si ripiega sul testo
    assert.match(js, /l'immagine non si è potuta fare: si condivide il testo/);
});

test('il campione ha gli stessi numeri della sua scheda in /stats (Elo, % vittorie, set, KO, serie) e i totali della lega sono etichettati', () => {
    const lukiani = giocatore('bea', { elo: 1160, percMatch: 80.6, set: { vinti: 79, persi: 29 }, ko: { fatti: 365, subiti: 253, setConDati: 30 }, serie: { vittorieMax: 15 } });
    const riep = R.calcola(dati([giocatore('ada'), lukiani]));
    assert.deepEqual(riep.vincitore.stat, { elo: 1160, percMatch: 80.6, set: { vinti: 79, persi: 29 }, ko: { fatti: 365, subiti: 253 }, serie: 15 });
    const h = R.html(riep);
    for (const t of ['Elo', 'Win %', 'Best streak', '1160', '80.6%', '79 – 29', '365 – 253']) assert.ok(h.includes(t), t);
    assert.match(h, /WHOLE LEAGUE/);
});

test('Elo del campione: quello a fine stagione (ultimo match di quella stagione), non il ranking di oggi', () => {
    const match = (data, e1, d1) => ({ player1Id: 'ada', player2Id: 'bea', player1: 'Ada', player2: 'Bea', p1score: 3, p2score: 0, data, categoria: 'OU',
        p1EloAtMatch: e1, p2EloAtMatch: 1000, p1DeltaElo: d1, p2DeltaElo: -d1, p1points: 2, p2points: 0 });
    const showdown = (data, e1, d1) => ({ info: { data, categoria: 'OU', vincitoreShowdown: 'ada' }, matches: { match1: match(data, e1, d1) } });
    const sA = { info: { id: 'sA', name: 'A', status: 'closed' }, showdowns: { s1: showdown('2026-01-10', 1000, 20), s2: showdown('2026-01-11', 1020, 20), s3: showdown('2026-01-12', 1040, 20) } };
    const sB = { info: { id: 'sB', name: 'B', status: 'playing' }, showdowns: { s1: showdown('2026-02-10', 1060, 15) } };
    const players = { ada: { stats: { 'individual-stats': { ranking: 1075, showdownsPlayed: 4 } } }, bea: {} };
    const risultato = Statistiche.calcola({ seasons: { sA, sB }, players }, { stagione: 'sA' });
    const riep = R.calcola({ risultato, info: sA.info, leaderboard: { ada: { points: 8, won: 3, lost: 0, setW: 9, sdWon: 3, sdLost: 0 }, bea: { points: 0, won: 0, lost: 3, setW: 0, sdWon: 0, sdLost: 3 } }, showdowns: sA.showdowns });
    assert.equal(riep.vincitore.id, 'ada');
    assert.equal(riep.vincitore.stat.elo, 1060, 'fine della stagione A (1040 + 20), non 1075 di oggi');
    assert.match(R.html(riep), /Final Elo/);
    // con meno di tre showdown nella stagione l'Elo è unranked: N/A
    const poche = Statistiche.calcola({ seasons: { sB, sA: { ...sA, showdowns: { s1: sA.showdowns.s1 } } }, players }, { stagione: 'sA' });
    const r2 = R.calcola({ risultato: poche, info: sA.info, leaderboard: { ada: { points: 2, won: 1, lost: 0, setW: 3, sdWon: 1, sdLost: 0 } }, showdowns: { s1: sA.showdowns.s1 } });
    assert.equal(r2.vincitore.stat.elo, 0);
    assert.match(R.html(r2), /Final Elo<\/span><b>N\/A/);
});

test('sul sito, vedendo il riepilogo la classifica a lato sparisce; nell\'app resta com\'è (i tag in alto)', () => {
    const js = leggi('riepilogo-stagione.js');
    assert.match(js, /layout\.classList\.toggle\('rs-solo-riepilogo', v === 'riepilogo'\)/);
    assert.match(js, /const sito = !doc\.documentElement\.classList\.contains\('app-shell'\)/);
    const css = leggi('riepilogo-stagione.css');
    assert.match(css, /html:not\(\.app-shell\) \.hub-main-layout\.rs-solo-riepilogo \.hub-right-column \{ display: none; \}/);
});
