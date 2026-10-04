'use strict';
// Il sito da telefono (docs/mobile.css + docs/mobile.js + i blocchi per telefono in fondo ai fogli delle pagine):
// la parte che si può provare senza browser.
// - ogni pagina dichiara la larghezza del dispositivo (senza tag viewport il telefono mostra la versione "da PC" rimpicciolita);
// - mobile.css / mobile.js sono collegati dove servono, e dopo i fogli della pagina;
// - mobile.css non tocca il desktop: ogni regola sta dentro una media query;
// - mobile.js: su touch il tocco dentro la scheda non la chiude, su PC non cambia nulla.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const PAGINE = fs.readdirSync(DOCS).filter(f => f.endsWith('.html')).sort();
// le pagine che caricano le regole comuni per telefono
const CON_MOBILE_CSS = ['box', 'formats', 'hub', 'index', 'matches', 'players', 'profile', 'public', 'rules', 'stats'].map(n => n + '.html');
const mobileCss = docs('mobile.css');
const mobileJs = docs('mobile.js');

// ---------- i tag nelle pagine ----------
test('ogni pagina dichiara la larghezza del dispositivo e non blocca lo zoom', () => {
    assert.ok(PAGINE.length >= 14, 'pagine trovate: ' + PAGINE.join(', '));
    for (const p of PAGINE) {
        const html = docs(p);
        assert.match(html, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1(\.0)?"\s*>/, `${p}: manca il tag viewport`);
        assert.doesNotMatch(html, /user-scalable\s*=\s*(no|0)|maximum-scale/i, `${p}: lo zoom col pizzico deve restare possibile`);
    }
});

test('mobile.css è collegato nelle dieci pagine che lo usano, dopo ogni altro foglio locale', () => {
    for (const p of CON_MOBILE_CSS) {
        const html = docs(p);
        const fogli = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^https?:/.test(h));
        assert.ok(fogli.includes('mobile.css'), `${p}: manca mobile.css`);
        assert.equal(fogli[fogli.length - 1], 'mobile.css', `${p}: mobile.css deve venire per ultimo (fogli: ${fogli.join(', ')})`);
        assert.equal(fogli.filter(f => f === 'mobile.css').length, 1, `${p}: mobile.css collegato più volte`);
    }
});

test('mobile.js è collegato in ogni pagina che ha la scheda squadra o la scheda Pokémon', () => {
    const conSchede = PAGINE.filter(p => /id="(teamModal|pkmDetailModal)"/.test(docs(p)));
    assert.deepEqual(conSchede, ['box.html', 'hub.html', 'matches.html', 'public.html']);
    for (const p of conSchede) assert.match(docs(p), /<script src="mobile\.js"><\/script>/, `${p}: manca mobile.js`);
    // e non dove non serve
    for (const p of PAGINE.filter(x => !conSchede.includes(x))) assert.doesNotMatch(docs(p), /mobile\.js/, `${p}: mobile.js non serve`);
});

// ---------- mobile.css: il desktop non cambia ----------
// i preamboli dei blocchi al livello più esterno del foglio (commenti e stringhe ignorati)
function blocchiEsterni(testo) {
    const t = testo.replace(/\/\*[\s\S]*?\*\//g, '');
    const preamboli = [];
    let profondita = 0, inizio = 0, preambolo = '', virgolette = null;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (virgolette) { if (c === virgolette && t[i - 1] !== '\\') virgolette = null; continue; }
        if (c === '"' || c === "'") virgolette = c;
        else if (c === '{') { if (profondita === 0) preambolo = t.slice(inizio, i).trim(); profondita++; }
        else if (c === '}') { profondita--; if (profondita === 0) { preamboli.push(preambolo); inizio = i + 1; } }
        else if (c === ';' && profondita === 0) inizio = i + 1;
    }
    assert.equal(profondita, 0, 'graffe non bilanciate');
    return preamboli;
}

test('mobile.css: ogni regola sta dentro una media query per schermi stretti o senza "passaggio del mouse"', () => {
    const blocchi = blocchiEsterni(mobileCss);
    assert.ok(blocchi.length >= 3, 'blocchi trovati: ' + blocchi.length);
    for (const b of blocchi) assert.match(b, /^@media \((max-width: \d+px|hover: none)\)$/, `regola fuori da una media query: "${b}"`);
});

test('mobile.css: i fumetti della scheda squadra, il selettore squadre e il login hanno il loro blocco', () => {
    for (const sel of ['#teamModal .move-tooltip', '#teamModal .generic-tooltip', '#teamModal .type-effectiveness-tooltip', '.modal-neubrutal', '#login-modal .modal-content']) assert.ok(mobileCss.includes(sel), `manca ${sel}`);
    // i fumetti restano dentro lo schermo
    assert.match(mobileCss, /max-width: calc\(100vw - 44px\)/);
});

test('mobile.css non ridefinisce la scheda: layout della scheda squadra e della scheda Pokémon stanno solo in dettagli.css', () => {
    // due fogli che disegnano la stessa griglia si pestano i piedi (l'ultimo vince: la scheda Pokémon si rompeva)
    for (const sel of ['pkm-modal-grid', 'grid-template-areas', '.modal-grid', '.modal-pkm-card', '.team-score-banner']) {
        assert.ok(!mobileCss.includes(sel), `mobile.css non deve toccare ${sel}`);
    }
});

test('formats: sotto i 1120px il contenitore da 1100px fissi si adatta alla finestra (la pagina non scorre di lato)', () => {
    const f = docs('style-formats.css');
    const m = /@media \(max-width: 1120px\)\s*\{([\s\S]*?)\n\}/.exec(f);
    assert.ok(m, 'blocco per le finestre strette mancante');
    assert.match(m[1], /\.main-wrapper,\s*\.home-seasons-container \{ width: 100%; max-width: 100%; \}/);
    // la griglia lascia libera la colonna delle pubblicità (220px, o 0 quando la colonna non c'è: --nb-ads)
    assert.match(m[1], /\.formats-neubrutalist-grid \{ width: calc\(100% - var\(--nb-ads, 220px\) - 30px\) !important; margin-left: calc\(var\(--nb-ads, 220px\) \+ 15px\) !important; \}/);
});

test('la colonna delle pubblicità sparisce anche su telefono in orizzontale, tablet col dito e "sito desktop"; il contenuto non lascia il vuoto', () => {
    const temiCss = docs('temi.css');
    const m = /@media \(max-width: 900px\),\s*\(pointer: coarse\) and \(max-width: 1000px\),\s*\(max-height: 520px\) and \(max-width: 1100px\) \{([\s\S]*?)\n\}/.exec(temiCss);
    assert.ok(m, 'media query della colonna mancante');
    assert.match(m[1], /body\.nb \{ --nb-ads: 0px; \}/);
    assert.match(m[1], /body\.nb \.ads-sidebar \{ display: none; \}/);
    assert.match(m[1], /body\.pg-matches \.hub-container \{ margin-left: 0; \}/);
    // gli spostamenti del contenuto che non stanno nei fogli delle pagine seguono la stessa variabile
    assert.match(docs('style-rules.css'), /\.rules-wrapper \{[^}]*margin-left: var\(--nb-ads, 220px\);[^}]*width: calc\(100% - var\(--nb-ads, 220px\)\)/);
    assert.match(docs('style-stats.css'), /\.stats-pagina \{[^}]*margin: 0 auto 0 calc\(var\(--nb-ads, 220px\) \+ 30px\)/);
});

// ---------- mobile.js ----------
// finestre e documento finti, quanto basta per eseguire lo script
function carica({ touch, stato = 'complete', finestre = {} }) {
    const ascoltatori = {};
    const document = {
        readyState: stato,
        getElementById: id => finestre[id] || null,
        addEventListener: (ev, f) => { ascoltatori[ev] = f; }
    };
    const window = { matchMedia: q => ({ matches: q === '(hover: none)' ? touch : false }) };
    vm.runInNewContext(mobileJs, { window, document });
    return ascoltatori;
}
function finestra(chiamate) {
    const f = { dataset: {} };
    f.onclick = function (evento) { chiamate.push({ questo: this, evento }); };
    return f;
}

test('mobile.js su touch: il tocco dentro la scheda non la chiude, quello sul bordo scuro sì', () => {
    const chiamate = [];
    const team = finestra(chiamate);
    carica({ touch: true, finestre: { teamModal: team } });
    const dentro = { target: { id: 'pokemon' } };
    team.onclick(dentro);
    assert.equal(chiamate.length, 0, 'un tocco dentro la scheda non deve chiuderla');
    const bordo = { target: team };
    team.onclick(bordo);
    assert.equal(chiamate.length, 1);
    assert.equal(chiamate[0].questo, team, 'il gestore originale gira sulla finestra');
    assert.equal(chiamate[0].evento, bordo);
});

test('mobile.js su touch: vale per entrambe le schede e non avvolge due volte lo stesso gestore', () => {
    const chiamate = [];
    const team = finestra(chiamate), pkm = finestra(chiamate);
    const ascoltatori = carica({ touch: true, finestre: { teamModal: team, pkmDetailModal: pkm } });
    assert.deepEqual(ascoltatori, {}, 'documento già pronto: niente attesa');
    const avvolto = team.onclick;
    assert.equal(team.dataset.toccoFuori, '1');
    assert.equal(pkm.dataset.toccoFuori, '1');
    // una seconda esecuzione (o uno script caricato due volte) non deve incatenare un altro filtro
    vm.runInNewContext(mobileJs, { window: { matchMedia: () => ({ matches: true }) }, document: { readyState: 'complete', getElementById: id => ({ teamModal: team, pkmDetailModal: pkm })[id] || null, addEventListener() {} } });
    assert.equal(team.onclick, avvolto);
    pkm.onclick({ target: { id: 'x' } });
    pkm.onclick({ target: pkm });
    assert.equal(chiamate.length, 1);
});

test('mobile.js su PC (con il mouse): non cambia nulla, il clic ovunque chiude come prima', () => {
    const chiamate = [];
    const team = finestra(chiamate);
    const originale = team.onclick;
    carica({ touch: false, finestre: { teamModal: team } });
    assert.equal(team.onclick, originale);
    assert.equal(team.dataset.toccoFuori, undefined);
    team.onclick({ target: { id: 'dentro' } });
    assert.equal(chiamate.length, 1);
});

test('mobile.js: se il documento si sta ancora caricando aspetta DOMContentLoaded; finestre assenti o senza gestore non danno errore', () => {
    const chiamate = [];
    const team = finestra(chiamate);
    const senzaGestore = { dataset: {} };
    const finestre = { teamModal: team, pkmDetailModal: senzaGestore };
    const ascoltatori = carica({ touch: true, stato: 'loading', finestre });
    assert.equal(typeof ascoltatori.DOMContentLoaded, 'function');
    assert.equal(team.dataset.toccoFuori, undefined, 'prima di DOMContentLoaded non tocca nulla');
    ascoltatori.DOMContentLoaded();
    assert.equal(team.dataset.toccoFuori, '1');
    assert.equal(senzaGestore.dataset.toccoFuori, undefined);
    assert.equal(senzaGestore.onclick, undefined);
    assert.doesNotThrow(() => carica({ touch: true, finestre: {} }));
});

test('mobile.js: senza matchMedia (ambienti vecchi) esce senza errori', () => {
    assert.doesNotThrow(() => vm.runInNewContext(mobileJs, { window: {}, document: { readyState: 'complete', getElementById: () => null, addEventListener() {} } }));
    assert.doesNotThrow(() => vm.runInNewContext(mobileJs, {}));
});
