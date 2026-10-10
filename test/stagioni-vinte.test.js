'use strict';
// Le stagioni vinte: un solo numero per tutto il sito. Il profilo (avanzamento del badge dei campioni) le contava dalla classifica di ogni
// stagione chiusa, la pagina pubblica leggeva un contatore a parte (stats/seasons/won) che si aggiornava solo da un tasto dell'amministratore:
// una stagione finita poteva dare 1 nel badge e 0 nella pagina pubblica. Ora la pagina pubblica e la lista Trainers usano il numero dei badge.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { calcola } = require('../docs/statistiche.js');

const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');

const match = (p1, p2, s1, s2, extra = {}) => ({
    player1: p1, player1Id: p1, player2: p2, player2Id: p2, winnerId: s1 > s2 ? p1 : p2, team1: 'A', team2: 'B',
    score: `${s1}-${s2}`, p1score: s1, p2score: s2, p1points: s1 >= 2 ? 2 : (s1 === 1 ? 1 : 0), p2points: s2 >= 2 ? 2 : (s2 === 1 ? 1 : 0),
    data: '2026-02-01', categoria: 'OU', ...extra
});
const stagione = (stato, matches, nome = 'Season') => ({
    info: { name: nome, status: stato },
    showdowns: { sd1: { info: { categoria: 'OU', player1: 'didi', player2: 'lu', vincitoreShowdown: 'didi' }, matches: Object.fromEntries(matches.map((m, i) => [`match${i + 1}`, m])) } }
});
const giocatori = { didi: { info: { name: 'Didi' } }, lu: { info: { name: 'Lu' } } };

test('una stagione chiusa dà la vittoria a chi è primo in classifica, anche se nessuno ha aggiornato i contatori del profilo', () => {
    const r = calcola({ seasons: { s1: stagione('closed', [match('didi', 'lu', 2, 1), match('lu', 'didi', 0, 2), match('didi', 'lu', 2, 0)]) }, players: giocatori }, { stagione: 'all' });
    const didi = r.players.find(p => p.id === 'didi'), lu = r.players.find(p => p.id === 'lu');
    assert.equal(didi.stagioniVinte, 1);
    assert.deepEqual(didi.stagioniVinteId, ['s1']);
    assert.equal(lu.stagioniVinte, 0);
    assert.deepEqual(lu.stagioniVinteId, []);
    assert.equal(r.stagioni.find(s => s.id === 's1').vincitore, 'didi');
});

test('una stagione ancora in corso, o la stagione di prova (sbeta), non danno nessuna vittoria', () => {
    const inCorso = calcola({ seasons: { s1: stagione('playing', [match('didi', 'lu', 2, 0)]) }, players: giocatori }, { stagione: 'all' });
    assert.equal(inCorso.players.find(p => p.id === 'didi').stagioniVinte, 0);
    const prova = calcola({ seasons: { sbeta: stagione('closed', [match('didi', 'lu', 2, 0)]) }, players: giocatori }, { stagione: 'all' });
    assert.ok(!prova.players.some(p => p.stagioniVinte > 0), 'la beta non conta');
});

test('a pari punti e match decidono i set, poi il nome: lo stesso ordine di matches.html e del vincitore salvato', () => {
    // 1-1 nei match e 3 punti a testa: Lu ha più set vinti (4 contro 3)
    const sd = { sd1: { info: { categoria: 'OU', player1: 'didi', player2: 'lu' }, matches: { match1: match('didi', 'lu', 2, 1), match2: match('lu', 'didi', 3, 1) } } };
    const r = calcola({ seasons: { s1: { info: { name: 'S', status: 'closed' }, showdowns: sd } }, players: giocatori }, { stagione: 'all' });
    const vincitore = r.stagioni.find(s => s.id === 's1').vincitore;
    assert.equal(vincitore, 'lu');
    // identico a risultati-match.js
    const sito = vm.createContext({ console, db: {} });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'risultati-match.js'), 'utf8'), sito);
    const classifica = [{ name: 'didi', points: 4, won: 1, setW: 4 }, { name: 'lu', points: 4, won: 1, setW: 4 }].sort(sito.confrontaClassifica);
    assert.equal(classifica[0].name, 'didi', 'a parità totale il nome');
});

test('BadgeAllenatore.carica restituisce le stagioni vinte come le contano i badge, con il nome della stagione', async () => {
    const dati = { seasons: { s1: stagione('closed', [match('didi', 'lu', 2, 0)], 'Prima stagione') }, players: giocatori };
    const risultato = calcola(dati, { stagione: 'all' });
    const radice = vm.createContext({ self: null, console });
    radice.self = radice;
    radice.Fiocchi = { carica: async () => risultato };
    radice.BadgeTeam = require('../docs/badge-team.js');
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'badge-allenatore.js'), 'utf8'), radice);
    const r = await radice.BadgeAllenatore.carica({}, 'didi');
    assert.equal(r.dati, true);
    assert.equal(r.stagioniVinte, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(r.elencoStagioniVinte)), [{ id: 's1', nome: 'Prima stagione' }]);
    const lu = await radice.BadgeAllenatore.carica({}, 'lu');
    assert.equal(lu.stagioniVinte, 0);
    const sconosciuto = await radice.BadgeAllenatore.carica({}, 'nessuno');
    assert.equal(sconosciuto.dati, false);
    assert.equal(sconosciuto.stagioniVinte, 0);
    // se i dati non si leggono: nessun numero calcolato, le pagine ripiegano sul contatore del profilo
    radice.Fiocchi = { carica: async () => { throw new Error('rete'); } };
    const ko = await radice.BadgeAllenatore.carica({}, 'didi');
    assert.equal(ko.stagioniVinte, null);
});

test('la pagina pubblica e la lista Trainers usano quel numero; il contatore del profilo è solo il ripiego', () => {
    const pub = docs('public.html');
    assert.match(pub, /if \(r\.dati\) stagioniVinte = \{ conteggio: r\.stagioniVinte, elenco: r\.elencoStagioniVinte \};/);
    assert.match(pub, /stagioniVinte,\s*\n\s*tipi: tipi \|\| \{\}/);
    const card = docs('public-card.js');
    assert.match(card, /const conteggio = calcolate \? Number\(calcolate\.conteggio\) : \(Number\(stagioni\.won\) \|\| 0\);/);

    const giocatoriHtml = docs('players.html');
    assert.match(giocatoriHtml, /const r = await BadgeAllenatore\.carica\(db, key\);/);
    assert.match(giocatoriHtml, /BadgeAllenatore\.htmlMini\(r\.lista, 99\)/, 'tutti i badge guadagnati, non solo le tre serie');
    assert.match(giocatoriHtml, /const trophiesWon = calcolate != null \? calcolate : Math\.max\(/);
    for (const f of ['statistiche.js', 'fiocchi.js', 'badge-team.js', 'badge-allenatore.js']) assert.ok(giocatoriHtml.includes(`<script src="${f}"></script>`), `players.html carica ${f}`);
    assert.ok(giocatoriHtml.includes('<link rel="stylesheet" href="badge-team.css">'));
});

test('il suggerimento del titolo sul palco della pagina pubblica compare (prima il cursore era un punto di domanda e basta): una copia fissa sul body, intera dentro lo schermo', () => {
    const card = docs('public-card.js');
    assert.match(card, /function mostraFumetto\(host\)/);
    assert.match(card, /copia\.classList\.add\('pp-tip-fisso'\)/);
    // vale per ogni .pp-tip-host: il titolo e la targhetta della personalità sul palco, le coppe, le medaglie
    assert.match(card, /class: `hub-title-badge pp-titolo pp-tip-host tipo-\$\{classeTipo\}`/);
    assert.match(card, /document\.addEventListener\('pointerover', e => \{ const h = hostDi\(e\); if \(h\) mostraFumetto\(h\); \}\);/);
    assert.match(card, /document\.addEventListener\('focusin', e => \{ const h = hostDi\(e\); if \(h\) mostraFumetto\(h\); \}\);/);
    const css = docs('style-public-card.css');
    assert.match(css, /\.neubrutal-tooltip\.pp-tip-fisso \{[^}]*position: fixed/);
    // il fumetto scritto nel blocco resta nascosto (la scena lo taglierebbe e un blocco accanto lo coprirebbe): quello visibile è la copia fuori
    assert.match(css, /\.pp-pagina \.neubrutal-tooltip \{ display: none; \}/);
});
