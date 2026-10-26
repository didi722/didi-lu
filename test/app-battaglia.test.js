'use strict';
// La battaglia come gioco da telefono (docs/app-battaglia.css, docs/app-battaglia.js): schermo di Showdown intero e girato, i comandi a due passi
// (Fight / Pokémon) come nei giochi.
//   - il foglio: ogni regola sta sotto html.app e dentro le condizioni dello schermo da telefono; lo schermo resta intero, via cronaca, player e tooltip;
//   - lo script: il pannello a due passi si ricorda a che punto sei solo finché la domanda è la stessa, e nel sito (non-app) non fa niente.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');

function selettori(css) {
    // le virgole dentro le parentesi (:is(a, b)) non separano i selettori
    const t = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    for (const m of t.matchAll(/([^{}]+)\{/g)) {
        const pre = m[1].trim();
        if (pre.startsWith('@')) continue;
        if (/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(pre)) continue;
        let livello = 0, da = 0;
        for (let i = 0; i < pre.length; i++) {
            if (pre[i] === '(') livello++;
            else if (pre[i] === ')') livello--;
            else if (pre[i] === ',' && livello === 0) { out.push(pre.slice(da, i).trim()); da = i + 1; }
        }
        out.push(pre.slice(da).trim());
    }
    return out.filter(Boolean);
}
/** Le regole che non stanno dentro nessuna @media (ogni regola deve stare dentro una) */
function fuoriDalleCondizioni(css) {
    const t = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let livello = 0;
    const fuori = [];
    for (const m of t.matchAll(/[{}]|[^{}]+/g)) {
        const x = m[0];
        if (x === '{') livello++;
        else if (x === '}') livello--;
        else if (livello === 0 && x.trim() && !x.trim().startsWith('@media')) fuori.push(x.trim().slice(0, 60));
    }
    return fuori;
}

test('app-battaglia.css: ogni regola riguarda l\'app (html.app) ed è solo per telefoni; lo schermo di Showdown resta intero; via cronaca, player e tooltip', () => {
    const css = docs('app-battaglia.css');
    const lista = selettori(css);
    assert.ok(lista.length >= 80, 'selettori trovati: ' + lista.length);
    for (const s of lista) assert.match(s, /^html\.app([\s.:]|$)/, `regola che tocca il sito intero: "${s}"`);
    assert.deepEqual(fuoriDalleCondizioni(css), []);
    const medie = [...css.matchAll(/@media[^{]+/g)].map(m => m[0].trim());
    assert.equal(medie.length, 3);
    assert.match(medie[0], /max-width:\s*700px\),\s*\(max-height:\s*520px/);
    assert.match(medie[1], /orientation:\s*landscape\)\s*and\s*\(max-height:\s*520px\)/);
    assert.match(medie[2], /orientation:\s*portrait\)\s*and\s*\(max-width:\s*700px\)/);
    // lo schermo di Showdown non si toglie mai: è 16:9 e resta intero, solo più piccolo; ai due lati restano almeno 112px per i tasti
    assert.match(css, /--wc:\s*min\(calc\(\(100dvh - 32px\) \* 16 \/ 9 \+ 8px\), calc\(100vw - 2 \* 112px/);
    assert.doesNotMatch(css, /\.palco(-box)?\s*\{[^}]*display:\s*none/);
    // girato: tre colonne (sinistra | schermo | destra), lo schermo al centro, POKÉMON a sinistra e FIGHT a destra
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\) var\(--wc\) minmax\(0, 1fr\);/);
    assert.match(css, /\.palco-box \{ grid-column: 2; grid-row: 1 \/ -1;/);
    assert.match(css, /\.ab-squadra \{ grid-column: 1; grid-row: 2 \/ 4; \}/);
    assert.match(css, /\.ab-lotta \{ grid-column: 3; grid-row: 2 \/ 4; \}/);
    // le mosse come nei giochi (1 2 / 3 4): le dispari a sinistra, le pari a destra
    assert.match(css, /\.mossa:nth-child\(odd\) \{ grid-column: 1; \}/);
    assert.match(css, /\.mossa:nth-child\(even\) \{ grid-column: 3; \}/);
    // niente player ai lati, cronaca, tooltip, prove (bot, note) e schermo intero
    assert.match(css, /html\.app :is\(\.lato, \.colonna-log, \.opzione-bot, \.btn-note, \.btn-schermo-intero, #note-team\) \{ display: none !important; \}/);
    // le schede dei Pokémon compaiono tenendo premuto, al centro dello schermo (non sono più nascoste)
    assert.match(css, /html\.app #tooltipwrapper \{ position: fixed !important; inset: 0 !important;[^}]*display: flex !important; align-items: center; justify-content: center;/);
    assert.match(css, /html\.app #tooltipwrapper \.tooltip \{ position: static !important; left: auto !important; top: auto !important;/);
    // i due passi: menu -> (mosse | cambi)
    for (const passo of ['menu', 'mosse', 'cambi']) assert.match(css, new RegExp(`\\.corpo\\[data-ab="${passo}"\\]`));
    assert.match(css, /\.ab-menu \{ display: grid; grid-template-columns: 1fr 1fr/);
});

test('app-battaglia.js: il pannello a due passi (Fight / Pokémon) si ricorda a che punto sei solo finché la domanda è la stessa', () => {
    const B = require(path.join(DOCS, 'app-battaglia.js'));
    assert.equal(B.CONDIZIONE_TELEFONO, '(max-width: 700px), (max-height: 520px)');
    assert.equal(B.passoDa({ chiave: 'What will A do?', precedente: null }), 'menu');
    assert.equal(B.passoDa({ chiave: 'What will A do?', precedente: { chiave: 'What will A do?', passo: 'mosse' } }), 'mosse');
    assert.equal(B.passoDa({ chiave: 'What will B do?', precedente: { chiave: 'What will A do?', passo: 'mosse' } }), 'menu', 'altra domanda (altro Pokémon, altro turno): si riparte dal menu');
    assert.equal(B.passoDa({ chiave: '', precedente: { chiave: '', passo: '' } }), 'menu');
    // si può cambiare solo se c'è almeno un compagno non spento
    const corpo = n => ({ querySelectorAll: sel => (sel === '.cambi .btn-pkm:not(.spento)' ? new Array(n).fill({}) : []) });
    assert.equal(B.puoCambiare(corpo(2)), true);
    assert.equal(B.puoCambiare(corpo(0)), false);
    // la condizione è la stessa di app-battaglia.css, di battle-layout.js (lì sta scritta per esteso) e di app.js
    assert.match(docs('app-battaglia.css'), /@media \(max-width: 700px\), \(max-height: 520px\)/);
    assert.match(docs('battle-layout.js'), /matchMedia\('\(max-width: 700px\), \(max-height: 520px\)'\)/);
    assert.equal(require(path.join(DOCS, 'app.js')).CONDIZIONE_TELEFONO, B.CONDIZIONE_TELEFONO);
});

test('app-battaglia.js: nel sito (non-app) non fa niente; i tasti sono quelli del simulatore (non scelgono niente da soli)', () => {
    const B = require(path.join(DOCS, 'app-battaglia.js'));
    const radice = { classList: { contains: () => false } };
    assert.equal(B.avvia({ document: { documentElement: radice } }), null);
    const js = docs('app-battaglia.js');
    assert.doesNotMatch(js, /\.click\(\)|dispatchEvent|innerHTML/);
    // Back e i due tasti grandi: solo cambiano il passo (data-ab), non mandano scelte
    assert.match(js, /tasto\('ab-btn ab-lotta', 'Fight', \(\) => vai\(corpo, 'mosse'\)\)/);
    assert.match(js, /tasto\('ab-indietro', 'Back', \(\) => vai\(corpo, 'menu'\)\)/);
});

test('app-battaglia.js: le schede (tooltip) si vedono tenendo premuto e spariscono lasciando; l\'eco finta del tocco non le fa comparire', () => {
    const B = require(path.join(DOCS, 'app-battaglia.js'));
    assert.ok(B.TENUTA_MS >= 300 && B.TENUTA_MS <= 700, 'si tiene premuto un po\', non basta un tocco');
    assert.equal(B.eEcoDelTocco(1000, 500), true, 'il mouseover che il telefono manda subito dopo un tocco è un\'eco');
    assert.equal(B.eEcoDelTocco(1000 + B.FINESTRA_MOUSE_FINTO_MS, 1000), false, 'passata la finestra è un mouse vero');
    const js = docs('app-battaglia.js');
    for (const ev of ['touchend', 'touchcancel']) assert.ok(js.includes(`'${ev}'`), ev);
    assert.match(js, /hideTooltip/);
    assert.match(docs('battle-ui.js'), /if \(inApp\(\)\) window\.AppTooltips = tooltips;/);
});

test('le schede si aprono solo tenendo premuto: a Showdown non arrivano i suoi eventi di tocco/focus/mouse, e la scheda sta nello schermo', () => {
    const B2 = require('../docs/app-battaglia.js');
    for (const t of ['touchstart', 'touchend', 'mouseover', 'focus', 'focusin', 'pointerdown']) assert.ok(B2.EVENTI_SHOWDOWN.includes(t), t);
    assert.ok(B2.SCARTA_CLICK_MS > 0 && B2.TOLLERANZA_PX > 0);
    assert.equal(B2.zoomPer(200, 300, 340, 740), 1);
    assert.ok(B2.zoomPer(600, 300, 340, 740) < .6 + 1e-9 && B2.zoomPer(600, 300, 340, 740) >= .5);
});
