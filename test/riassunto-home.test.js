'use strict';
// Il riassunto del Match of the week (matchSettimana): il workflow lo calcola, la home lo legge al posto delle statistiche di tutto il sito.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../docs/match-settimana.js');
const D = require('../docs/db-leggero.js');
const { calcola } = require('../.github/workflows/riassunto-home.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const pk = (specie, o = {}) => ({ specie, nome: '', portato: true, sceso: true, titolare: false, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o });
const lato = (nome, pokemon) => ({ nome, pokemon, portati: pokemon.filter(p => p.portato).length, svenuti: pokemon.filter(p => p.svenuto).length, azioni: {} });
const rimonta = () => ({
    v: 3, turni: 16, vincitore: 'p1',
    p1: lato('Ada', [pk('A1', { svenuto: true, turnoKo: 3 }), pk('A2', { svenuto: true, turnoKo: 4 }), pk('A3', { svenuto: true, turnoKo: 5 }), pk('Ultimo', { ultimo: true, koFatti: 4 })]),
    p2: lato('Bea', [pk('B1', { svenuto: true, turnoKo: 9 }), pk('B2', { svenuto: true, turnoKo: 11 }), pk('B3', { svenuto: true, turnoKo: 13 }), pk('B4', { svenuto: true, turnoKo: 16 })])
});
const match = (data, setStats) => ({
    categoria: 'OU', data, p1score: 2, p2score: 1, player1: 'Ada', player1Id: 'ada', player2: 'Bea', player2Id: 'bea', team1: 'Team Uno', team2: 'Team Due',
    p1EloAtMatch: 1000, p2EloAtMatch: 1000, setStats,
    replays: Object.fromEntries(Object.keys(setStats || {}).map(k => [k, { url: `https://x.test/${k}.html`, vincitore: '1' }]))
});
const OGGI = new Date(2026, 9, 30, 12).getTime();
const senzaStats = seasons => JSON.parse(JSON.stringify(seasons, (k, v) => (k === 'setStats' ? undefined : v)));
const stagioni = () => ({ s0: { info: { name: 'Stagione', status: 'playing' }, showdowns: { sd1: { info: { data: '2026-10-20', categoria: 'OU' }, matches: { a: match('2026-10-20', { set1: rimonta() }), b: match('2026-10-28', { set1: rimonta() }) } } } } });
const nodoSetStats = () => ({ s0: { sd1: { a: { set1: rimonta() }, b: { set1: rimonta() } } } });
const players = { ada: { info: { name: 'Ada', color: '#aa00cc' } }, bea: { info: { name: 'Bea', color: '#cc0000' } } };

test('riassunto: per ogni settimana il set scelto e i suoi badge; senza undefined (il database non li accetta); uguale con le statistiche dentro ai match o nel nodo a parte', () => {
    const dentro = calcola({ seasons: stagioni(), setStats: {}, players, adesso: OGGI });
    const aParte = calcola({ seasons: senzaStats(stagioni()), setStats: nodoSetStats(), players, adesso: OGGI });
    assert.deepEqual(aParte, dentro, 'le statistiche nel nodo a parte danno lo stesso riassunto');
    assert.equal(dentro.v, 1);
    assert.equal(dentro.aggiornato, OGGI);
    assert.equal(dentro.settimane.length, 2);
    const w = dentro.settimane[1];
    assert.deepEqual(Object.keys(w).sort(), ['anno', 'badge', 'fine', 'inizio', 'numero', 'quanti', 'scelto']);
    assert.equal(w.scelto.vincitore, 'p1');
    assert.equal(w.scelto.protagonista.specie, 'Ultimo');
    assert.deepEqual(Object.keys(w.badge).sort(), ['p1', 'p2', 'prot']);
    assert.equal(JSON.stringify(dentro), JSON.stringify(JSON.parse(JSON.stringify(dentro))), 'solo valori semplici');
    assert.ok(JSON.stringify(dentro).length < 20000, 'piccolo (circa 1-2 KB a settimana contro centinaia di KB di setStats)');
    assert.deepEqual(calcola({ seasons: {}, setStats: {}, players: {}, adesso: OGGI }).settimane, [], 'nessun set: nessuna settimana');
});

test('badgeDati: solo i campi che servono a disegnare la medaglietta; badgeHtml li ridisegna anche dopo il database (campi vuoti mancanti, oggetti al posto degli array)', () => {
    const pieno = { id: 'champion', nome: 'Champion', icona: 'x', descrizione: 'd', unita: 'seasons won', valore: 2, livello: 2, livelloNome: 'Silver', classeLivello: 'silver', immagine: 'i.png', soglie: [1, 2], prossima: 3, progresso: 0.5, nota: '', sblocco: null };
    const lib = {
        BadgeTeam: { trova: () => 'T', calcola: x => [pieno, { ...pieno, id: 'altro', livello: 0 }], guadagnati: l => l.filter(b => b.livello > 0), htmlMini: l => `<t${l.length}>` },
        Fiocchi: { trova: () => 'F', calcola: () => [pieno, { ...pieno, id: 'b' }, { ...pieno, id: 'c' }], guadagnati: l => l, htmlMedaglietta: f => `<f ${f.id}>` }
    };
    const s = { giocatori: { p1: { id: 'ada', team: 'Uno' }, p2: { id: 'bea', team: '' } }, protagonista: { specie: 'Garchomp', lato: 'p1' } };
    const d = M.badgeDati({ pokemon: [] }, s, lib);
    assert.deepEqual(Object.keys(d.p1[0]).sort(), ['classeLivello', 'descrizione', 'icona', 'id', 'immagine', 'livello', 'livelloNome', 'nome', 'unita', 'valore']);
    assert.equal(d.p1.length, 1, 'solo i badge presi');
    assert.deepEqual(d.p2, [], 'senza team (Random) niente badge di team');
    assert.equal(d.prot.length, 2, 'i due fiocchi più alti');
    assert.deepEqual(M.badgeHtml(d, lib), { p1: '<t1>', p2: '<t0>', prot: '<f champion><f b>' });
    assert.deepEqual(M.badgeHtml({ p1: { 0: pieno }, prot: { 0: pieno } }, lib), { p1: '<t1>', p2: '<t0>', prot: '<f champion>' }, 'il database dà oggetti al posto degli array e toglie quelli vuoti');
    assert.deepEqual(M.badgeHtml(undefined, lib), { p1: '<t0>', p2: '<t0>', prot: '' });
});

test('riassuntoValido: c\'è, è la versione giusta e non ha più di 12 ore (il workflow gira ogni 3); altrimenti la home si calcola il banner da sé', () => {
    const ORA = 1e12;
    assert.equal(M.riassuntoValido({ v: 1, aggiornato: ORA - 3600000 }, ORA), true);
    assert.equal(M.riassuntoValido({ v: 1, aggiornato: ORA - 11.9 * 3600000 }, ORA), true);
    assert.equal(M.riassuntoValido({ v: 1, aggiornato: ORA - 12.1 * 3600000 }, ORA), false, 'troppo vecchio: il workflow ha smesso di funzionare');
    assert.equal(M.riassuntoValido({ v: 2, aggiornato: ORA }, ORA), false, 'un\'altra versione');
    assert.equal(M.riassuntoValido({ v: 1, aggiornato: ORA + 2 * 3600000 }, ORA), false, 'scritto nel futuro (orologio sbagliato)');
    for (const x of [null, undefined, 0, 'x', {}, { v: 1 }, { v: 1, aggiornato: 'ieri' }]) assert.equal(M.riassuntoValido(x, ORA), false);
    assert.equal(M.ETA_MASSIMA_RIASSUNTO, 12 * 3600 * 1000);
});

test('daRiassunto: dal riassunto del database (array o oggetti numerati) a { elenco, indice } come settimane(); le voci rotte si saltano; monta() lo disegna', async () => {
    const r = calcola({ seasons: stagioni(), setStats: {}, players, adesso: OGGI });
    const viaDatabase = JSON.parse(JSON.stringify({ ...r, settimane: Object.fromEntries(r.settimane.map((w, i) => [i, w])) }));
    const e = M.daRiassunto(viaDatabase);
    assert.equal(e.elenco.length, 2);
    assert.equal(e.indice, 1, 'si apre sull\'ultima');
    assert.deepEqual(e.elenco.map(w => w.inizio), r.settimane.map(w => w.inizio));
    assert.equal(M.daRiassunto({ ...r, settimane: [null, { x: 1 }, r.settimane[0]] }).elenco.length, 1, 'le voci senza set si saltano');
    assert.deepEqual(M.daRiassunto(null), { elenco: [], indice: -1 });
    const html = { innerHTML: '', addEventListener() {}, querySelector: () => null };
    const b = M.monta({}, html, { adesso: () => OGGI });
    assert.equal(await b.aggiorna(e), true);
    assert.match(html.innerHTML, /MATCH OF THE WEEK/);
    assert.match(html.innerHTML, /<b>This week<\/b>/);
});

test('monta: se la settimana ha già i suoi badge non scarica le statistiche (caricaBadge non si chiama); senza badge e con caricaBadge sì (come prima)', async () => {
    const caselle = {};
    const radice = () => ({ innerHTML: '', addEventListener() {}, querySelector: sel => { const k = /data-ms-badge="(\w+)"/.exec(sel); return k ? (caselle[k[1]] = caselle[k[1]] || { innerHTML: '' }) : null; } });
    const win = {
        Fiocchi: { guadagnati: l => l, htmlMedaglietta: f => `<f ${f.id}>`, trova: () => null, calcola: () => [] },
        BadgeTeam: { htmlMini: l => `<t${l.length}>`, trova: () => null, calcola: () => [] }
    };
    const r = calcola({ seasons: stagioni(), setStats: {}, players, adesso: OGGI });
    const conBadge = M.daRiassunto({ ...r, settimane: r.settimane.map(w => ({ ...w, badge: { p1: [{ id: 'a', livello: 1 }], p2: [], prot: [{ id: 'f', livello: 1 }] } })) });
    let chiamate = 0;
    const a = radice();
    await M.monta(win, a, { adesso: () => OGGI, caricaBadge: async () => { chiamate++; return {}; } }).aggiorna(conBadge);
    await new Promise(ok => setTimeout(ok, 0));
    assert.equal(chiamate, 0, 'badge già nel riassunto: niente statistiche');
    assert.deepEqual([caselle.p1.innerHTML, caselle.p2.innerHTML, caselle.prot.innerHTML], ['<t1>', '<t0>', '<f f>']);
    await M.monta(win, radice(), { adesso: () => OGGI, caricaBadge: async () => { chiamate++; return {}; } }).aggiorna(M.daRiassunto({ ...r, settimane: r.settimane.map(w => { const { badge, ...senza } = w; return senza; }) }));
    await new Promise(ok => setTimeout(ok, 0));
    assert.equal(chiamate, 1, 'senza badge nel riassunto si calcolano come prima');
});

test('home: legge matchSettimana; se è valido non scarica le statistiche dei set (nessun ascolto di setStats) e non carica i badge dal calcolo completo; se manca o è vecchio fa come prima', () => {
    const h = leggi('docs/index.html');
    assert.match(h, /db\.ref\('matchSettimana'\)\.once\('value'\)/);
    assert.match(h, /MatchSettimana\.riassuntoValido\(r\) \? r : null/);
    // setStats si segue solo senza riassunto
    assert.match(h, /riassuntoPronto\.then\(r => \{\s*if \(r\) return;\s*db\.ref\('setStats'\)\.on\('value'/);
    assert.equal((h.match(/db\.ref\('setStats'\)/g) || []).length, 1, 'un solo punto in cui la home legge setStats');
    assert.match(h, /if \(riassunto\) \{\s*datiStagioniMvp = stagioniGrezze;\s*contaMvpScaduti\(\);\s*if \(!bannerDalRiassunto\) \{ bannerDalRiassunto = true; mostraMatchSettimana\(null, riassunto\); \}/);
    assert.match(h, /esito = riassunto \? MatchSettimana\.daRiassunto\(riassunto\) : MatchSettimana\.settimane\(data\)/);
    assert.match(h, /mostraMatchSettimana\(unite\);/, 'il percorso di prima resta');
});

test('REGOLE-DATABASE.md e workflow: matchSettimana lo scrive solo il workflow; gira ogni 3 ore, a mano e con "prova"', () => {
    const regole = leggi('REGOLE-DATABASE.md');
    assert.match(regole, /"matchSettimana": \{ "\.read": true, "\.write": false \}/);
    assert.match(regole, /Riassunto del Match of the week/);
    const y = leggi('.github/workflows/riassunto-home.yml');
    assert.match(y, /cron: '41 \*\/3 \* \* \*'/);
    assert.match(y, /workflow_dispatch:/);
    assert.match(y, /riassunto-home\.js \$\{\{ inputs\.prova && '--prova' \|\| '' \}\}/);
    assert.match(y, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
    assert.ok(D.unisciSetStats, 'il workflow rimette insieme le statistiche con db-leggero.js');
});
