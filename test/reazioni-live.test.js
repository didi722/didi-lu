'use strict';
// Reazioni alle partite live: l'elenco, i totali, la posizione, i tasti e il collegamento in battle.html / battle-ui.js (la parte server è in functions/test/reazioni.test.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../docs/reazioni-live.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('elenco fisso: ID, disegno e nome; gli stessi ID del server (functions/reazioni.js)', () => {
    assert.deepEqual(R.REAZIONI.map(r => r.id), ['fire', 'shock', 'lol', 'gg', 'skull', 'love']);
    for (const r of R.REAZIONI) assert.ok(r.glifo && r.nome, r.id);
    assert.deepEqual(R.REAZIONI.map(r => r.id), require('../functions/reazioni.js').REAZIONI);
    assert.equal(R.perId('gg').nome, 'GG');
    assert.equal(R.perId('ciao'), null);
});

test('totali: solo numeri interi positivi, solo reazioni dell\'elenco', () => {
    assert.deepEqual(R.totali({ fire: 3, lol: '4', gg: -2, skull: 'x', altro: 9, love: 2.9 }), { fire: 3, shock: 0, lol: 4, gg: 0, skull: 0, love: 2 });
    assert.deepEqual(R.totali(null), { fire: 0, shock: 0, lol: 0, gg: 0, skull: 0, love: 0 });
});

test('posizione: sempre la stessa per la stessa chiave, tra l\'8% e il 92%', () => {
    assert.equal(R.posizione('-Kabc'), R.posizione('-Kabc'));
    const punti = new Set();
    for (let i = 0; i < 200; i++) { const x = R.posizione(`-Nx${i}abc`); assert.ok(x >= 8 && x <= 92, String(x)); punti.add(x); }
    assert.ok(punti.size > 30, 'le reazioni si sparpagliano');
});

test('htmlBarra: un tasto per reazione con il totale (1.2k oltre il migliaio), nome per chi non vede l\'emoji', () => {
    const h = R.htmlBarra({ conto: { fire: 1234, gg: 7 } });
    assert.equal((h.match(/class="rz-btn"/g) || []).length, 6);
    assert.match(h, /data-rz="fire" title="Hype" aria-label="Hype"><span class="rz-glifo" aria-hidden="true">🔥<\/span><b class="rz-n" data-rz-n="fire">1\.2k<\/b>/);
    assert.match(h, /data-rz-n="gg">7<\/b>/);
    assert.match(h, /data-rz-n="love">0<\/b>/);
    assert.match(h, /<span class="rz-nota" role="status" aria-live="polite">/);
});

test('battle.html: il campo ha lo strato delle reazioni, la riga degli spettatori i tasti; script e stile caricati', () => {
    const b = leggi('docs/battle.html');
    assert.match(b, /<link rel="stylesheet" href="reazioni-live\.css">/);
    assert.match(b, /<script src="reazioni-live\.js"><\/script>/);
    assert.ok(b.indexOf('<script src="reazioni-live.js">') < b.indexOf('<script type="module" src="battle-ui.js">'), 'prima del modulo che lo usa');
    assert.match(b, /<div class="rz-volo" id="reazioni-volo" aria-hidden="true"><\/div>/);
    assert.ok(b.indexOf('id="reazioni-volo"') > b.indexOf('id="palco"') && b.indexOf('id="reazioni-volo"') < b.indexOf('id="lobby"'), 'dentro il campo');
    assert.match(b, /<div class="rz-barra" id="reazioni" aria-label="Reactions" hidden><\/div>/);
    assert.ok(b.indexOf('id="reazioni"') > b.indexOf('id="striscia-spettatore"'), 'sotto la riga "You\'re watching live"');
});

test('battle-ui.js: reazioni avviate nelle partite online e amichevoli; i tasti solo a chi guarda', () => {
    const u = leggi('docs/battle-ui.js');
    assert.equal((u.match(/avviaReazioni\(id, funzioni\);/g) || []).length, 2, 'ufficiali e amichevoli');
    assert.match(u, /puoReagire: !mioLato, barra: \$\('reazioni'\), volo: \$\('reazioni-volo'\)/);
});

test('stile: i tasti come i bottoni del simulatore, le reazioni sul campo senza clic, meno movimento', () => {
    const css = leggi('docs/reazioni-live.css');
    assert.match(css, /\.rz-btn \{[^}]*border: var\(--bordo, 3px solid #000\)/);
    assert.match(css, /\.rz-volo \{[^}]*pointer-events: none;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.rz-vola \{ bottom: 40%; animation: rz-svanisce/);
    assert.doesNotMatch(css, /--nb-giallo|ffbd44/i);
});

test('il client manda solo l\'ID della reazione, dalla funzione reagisciPartita, e non scrive mai nel database', () => {
    const js = leggi('docs/reazioni-live.js');
    assert.match(js, /httpsCallable\('reagisciPartita'\)\(\{ id, e: b\.dataset\.rz \}\)/);
    assert.doesNotMatch(js, /\.ref\([^)]*\)\s*\.(set|push|update|remove|transaction)\(/, 'solo letture');
    const fn = leggi('functions/index.js');
    assert.match(fn, /exports\.reagisciPartita = onCall\(/);
    assert.match(fn, /require\('\.\/reazioni'\)/);
});
