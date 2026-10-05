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

test('profile.html: la personalità si disegna con nodi (DOM e SVG), mai con HTML; il diagramma (personalita-grafico.js) ha un testo per chi non lo vede', () => {
    const da = profilo.indexOf('// PERSONALITÀ (personalita.js');
    const a = profilo.indexOf('// AVVIO');
    assert.ok(da > 0 && a > da);
    const blocco = profilo.slice(da, a);
    for (const vietato of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) assert.ok(!blocco.includes(vietato), vietato);
    // il diagramma lo disegna il modulo condiviso con la pagina pubblica
    assert.match(blocco, /PersonalitaGrafico\.radar\(assi, valori\)/);
    assert.match(profilo, /<script src="personalita\.js"><\/script>\s*<script src="personalita-grafico\.js"><\/script>/);
    const modulo = docs('personalita-grafico.js');
    for (const vietato of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) assert.ok(!modulo.includes(vietato), vietato);
    assert.match(modulo, /createElementNS\(SVG_NS/);
    assert.match(modulo, /role: 'img'/);
    assert.match(modulo, /'aria-label'/);
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

test('profile.html: i badge dell\'allenatore hanno le stesse schede dei badge delle serie (immagine, livelli, numeri, barra, cosa manca)', () => {
    const scheda = profilo.slice(profilo.indexOf('function achSchedaBadgeAllenatore'), profilo.indexOf('// Il badge speciale dei fondatori'));
    assert.match(scheda, /BadgeAllenatore\.scheda\(b\)/);
    // le stesse classi delle schede delle serie
    for (const classe of ['ach-card ach-badge-card', 'ach-badge-img', 'ach-card-top', 'ach-card-name', 'ach-card-desc', 'ach-tiers', 'ach-tier', 'ach-stats-line', 'ach-missing']) {
        assert.ok(scheda.includes(classe), classe);
    }
    assert.match(scheda, /\$\{d\.bloccato \? 'locked' : ''\}/);
    assert.match(scheda, /onerror="BadgeTeam\.immagineMancante\(this,/);
    // le schede sostituiscono lo scaffale a tessere
    assert.ok(!/htmlScaffale/.test(profilo), 'niente più tessere nel profilo');
    assert.match(profilo, /html: achSchedaBadgeAllenatore\(b\)/);
    // la barra sa del suffisso % e della partenza (l'Elo parte da 1000)
    assert.match(profilo, /function achBarra\(etichetta, valore, obiettivo, \{ suffisso = '', partenza = 0 \} = \{\}\)/);
    const css = docs('style-profile.css');
    assert.match(css, /#ach-badges-list > \.bt-nota \{ margin: 0; \}/);
    assert.doesNotMatch(css, /ach-badge-extra/);
    assert.match(css, /\.ach-badge-card\.ach-lv-gold \{ --livello: var\(--bt-oro\); \}/);
});

test('profile.html: una sola lista di badge, il fondatore in cima e il resto dal più vicino al prossimo livello; niente "More trainer badges"', () => {
    assert.doesNotMatch(profilo, /MORE TRAINER BADGES/i, 'il titolo della seconda sezione non c\'è più');
    assert.doesNotMatch(profilo, /ach-badge-extra/);
    // le serie e i badge dell'allenatore si ordinano insieme, il fondatore si mette davanti
    const disegna = profilo.slice(profilo.indexOf('function achDisegnaElenco'), profilo.indexOf('async function aggiungiBadgeAllenatore'));
    assert.match(disegna, /achElenco\.serie\.concat\(achElenco\.catalogo\)/);
    assert.match(disegna, /BadgeTeam\.perVicinanza\(tutte\)/);
    assert.match(disegna, /achFondatore\(\) \+ ordinate\.map\(c => c\.html\)\.join\(''\)/, 'il fondatore prima di tutti');
    // ogni elemento dice quanto manca al prossimo livello (la barra che si vede), e se è già all'oro
    assert.match(profilo, /prossima: st\.completo \? null : st\.obiettivo, progresso: st\.progresso/);
    assert.match(profilo, /prossima: b\.prossima, progresso: b\.progresso/);
});
