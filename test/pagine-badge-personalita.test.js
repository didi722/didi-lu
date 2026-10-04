'use strict';
// Il collegamento tra le pagine e i moduli nuovi (badge degli allenatori, personalità): ci sono gli script, i punti di aggancio e
// niente HTML costruito con testo che viene dal database.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
const profilo = docs('profile.html');
const pubblica = docs('public.html');
const carta = docs('public-card.js');
const stats = docs('stats.html');
const statsJs = docs('stats.js');

const ordine = (html, a, b) => { const i = html.indexOf(`src="${a}"`), j = html.indexOf(`src="${b}"`); return i > 0 && j > i; };

test('profile.html: la sezione Personality ha i suoi script, nell\'ordine giusto, e il suo posto nella pagina', () => {
    for (const f of ['statistiche.js', 'fiocchi.js', 'personalita.js', 'badge-team.js', 'badge-allenatore.js']) assert.match(profilo, new RegExp(`<script src="${f.replace('.', '\\.')}"></script>`), f);
    assert.ok(ordine(profilo, 'badge-team.js', 'badge-allenatore.js'), 'badge-allenatore.js usa BadgeTeam');
    assert.match(profilo, /<link rel="stylesheet" href="badge-team\.css">/);
    assert.match(profilo, /<section class="pf-sezione pf-personalita" id="pf-personalita"[^>]*>[\s\S]*PERSONALITY[\s\S]*id="pf-personalita-corpo"/);
    // dopo i rivali e prima del tema
    assert.ok(profilo.indexOf('id="pf-rivali"') < profilo.indexOf('id="pf-personalita"') && profilo.indexOf('id="pf-personalita"') < profilo.indexOf('id="pf-tema"'));
    // non blocca l'apertura della pagina
    assert.match(profilo, /await disegna\(\);\s*disegnaPersonalita\(\);/);
});

test('profile.html: la personalità si disegna con nodi (DOM e SVG), mai con HTML; il diagramma ha un testo per chi non lo vede', () => {
    const da = profilo.indexOf('// PERSONALITÀ (personalita.js');
    const a = profilo.indexOf('// AVVIO');
    assert.ok(da > 0 && a > da);
    const blocco = profilo.slice(da, a);
    for (const vietato of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) assert.ok(!blocco.includes(vietato), vietato);
    assert.match(blocco, /createElementNS\(SVG_NS/);
    assert.match(blocco, /role: 'img'/);
    assert.match(blocco, /'aria-label'/);
    // i tre stati: bloccata, in attesa della lega, pronta
    for (const f of ['disegnaPersonalitaBloccata', 'disegnaPersonalitaInAttesa', 'disegnaPersonalitaPronta']) assert.ok(blocco.includes(`function ${f}(`), f);
    assert.match(blocco, /Personalita\.calcola\(risultato\.players, playerID\)/);
});

test('profile.html: i badge dell\'allenatore stanno nella colonna Badges degli Achievements e aggiornano il conteggio', () => {
    assert.match(profilo, /async function aggiungiBadgeAllenatore\(overlay, lista, summary\)/);
    assert.match(profilo, /renderBadgeAchievements\(stats\.badges \|\| \{\}, badgeList, badgeSummary\);\s*aggiungiBadgeAllenatore\(overlay, badgeList, badgeSummary\);/);
    assert.match(profilo, /BadgeAllenatore\.carica\(db, playerID\)/);
    assert.match(profilo, /badge levels unlocked/);
});

test('public.html e la card: i badge dell\'allenatore diventano medaglie (le quattro più alte e un "+N"), con la medaglia disegnata se la PNG manca', () => {
    assert.match(pubblica, /<script src="badge-allenatore\.js"><\/script>/);
    assert.ok(ordine(pubblica, 'badge-team.js', 'badge-allenatore.js'));
    assert.match(pubblica, /BadgeAllenatore\.carica\(db, playerKey\)/);
    assert.match(pubblica, /badgeAllenatore,/);
    assert.match(carta, /const MEDAGLIE_ALLENATORE = 4;/);
    assert.match(carta, /presi\.slice\(0, MEDAGLIE_ALLENATORE\)/);
    assert.match(carta, /window\.BadgeTeam\.immagineMancante\(ev\.target, icona\)/);
    assert.match(carta, /pp-medaglia-altri/);
});

test('stats: la scheda del giocatore mostra i badge dell\'allenatore, calcolati su tutte le stagioni', () => {
    assert.ok(ordine(stats, 'badge-team.js', 'badge-allenatore.js') && ordine(stats, 'badge-allenatore.js', 'stats.js'));
    assert.match(statsJs, /Statistiche\.calcola\(STATO\.dati, \{ stagione: 'all' \}\)/);
    assert.match(statsJs, /BadgeAllenatore\.guadagnati\(BadgeAllenatore\.calcola\(STATO\.globale, p\.id\)\)/);
    assert.match(statsJs, /STATO\.globale = null;/, 'si rifà quando i dati si ricaricano');
});
