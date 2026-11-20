'use strict';
// Gli effetti del palco su canvas (effetti-palco.js): le particelle si provano in Node con un finto contesto di disegno; il resto (canvas, osservatori) lo prova il browser.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EP = require('../docs/effetti-palco.js');

const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');

/** Un contesto che registra le chiamate e non fa niente: createXGradient dà un oggetto con addColorStop, createImageData un buffer vero */
function finto() {
    const chiamate = {};
    const gradiente = { addColorStop() {} };
    const ctx = new Proxy({}, {
        get(_, nome) {
            if (nome === 'chiamate') return chiamate;
            if (nome === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
            if (nome === 'createLinearGradient' || nome === 'createRadialGradient') return (...a) => { chiamate[nome] = (chiamate[nome] || 0) + 1; assert.ok(a.every(Number.isFinite), `${nome}: numeri finiti ${a}`); return gradiente; };
            return (...a) => { chiamate[nome] = (chiamate[nome] || 0) + 1; for (const x of a) if (typeof x === 'number') assert.ok(Number.isFinite(x), `${String(nome)}: ${a}`); };
        },
        set() { return true; }
    });
    return ctx;
}
const tela = (w, h) => ({ canvas: { width: w, height: h }, ctx: finto() });

test('gli effetti su canvas sono quelli del catalogo (tutti i palchi tranne i petali di ciliegio, che restano CSS)', () => {
    const catalogo = require('../docs/cosmetici.js').CATALOGO.filter(c => c.tipo === 'palco').map(c => c.id);
    assert.deepEqual(EP.PRESENTI.slice().sort(), catalogo.filter(id => id !== 'palco-sakura').sort());
    for (const id of catalogo) assert.match(docs('effetti-pagina.css'), new RegExp(`data-effetto-palco="${id}"`), `${id}: resta anche il ripiego CSS`);
});

for (const id of EP.PRESENTI) {
    test(`${id}: ogni fotogramma disegna e ogni numero resta finito, a tutte le misure (palco grande, tondo piccolo del negozio) e per un minuto di animazione`, () => {
        for (const [w, h, u] of [[320, 256, 2.56], [1300, 700, 7], [52, 52, 1.56], [400, 160, 1.6]]) {
            const ctx = finto();
            const eff = EP.EFFETTI[id]({ w, h, u, tela });
            for (let i = 0; i < 1500; i++) eff.frame(ctx, i % 50 === 0 ? 0.05 : 0.016, i * 0.016);
            const disegni = Object.keys(ctx.chiamate).filter(n => /^(fill|stroke|arc|drawImage|ellipse|fillRect)/.test(n));
            assert.ok(disegni.length > 0, `${id} ${w}x${h}: niente disegnato`);
        }
    });
}

test('i fuochi d\'artificio lasciano le code (non cancellano tutto a ogni fotogramma); gli altri sì; l\'aurora si mescola con lo schermo', () => {
    const S = { w: 300, h: 200, u: 2, tela };
    assert.equal(EP.EFFETTI['palco-fuochi'](S).tracce, true);
    assert.ok(!EP.EFFETTI['palco-neve'](S).tracce);
    assert.equal(EP.EFFETTI['palco-aurora'](S).mezzo, 'screen');
});

test('le particelle non si accumulano all\'infinito (coriandoli, fuochi, schizzi della pioggia)', () => {
    for (const id of ['palco-coriandoli', 'palco-fuochi', 'palco-temporale']) {
        const ctx = finto();
        const eff = EP.EFFETTI[id]({ w: 600, h: 400, u: 4, tela });
        const prima = (() => { for (let i = 0; i < 600; i++) eff.frame(ctx, 0.016, i * 0.016); return ctx.chiamate.fillRect || 0; })();
        for (let i = 600; i < 6000; i++) eff.frame(ctx, 0.016, i * 0.016);
        const per = (ctx.chiamate.fillRect || 0) - prima;
        assert.ok(per < prima * 12, `${id}: il lavoro per fotogramma non cresce (${per} contro ${prima})`);
    }
});

test('lanterne: fumo e lucciole sono limitati, il lavoro per fotogramma non cresce nel tempo', () => {
    const ctx = finto();
    const eff = EP.EFFETTI['palco-lanterne']({ w: 600, h: 400, u: 4, tela });
    const totale = () => Object.values(ctx.chiamate).reduce((a, n) => a + n, 0);
    for (let i = 0; i < 600; i++) eff.frame(ctx, 0.016, i * 0.016);
    const a0 = totale();
    for (let i = 600; i < 1200; i++) eff.frame(ctx, 0.016, i * 0.016);
    const primo = totale() - a0;
    for (let i = 1200; i < 6000; i++) eff.frame(ctx, 0.016, i * 0.016);
    const b0 = totale();
    for (let i = 6000; i < 6600; i++) eff.frame(ctx, 0.016, i * 0.016);
    const ultimo = totale() - b0;
    assert.ok(primo > 0 && ultimo < primo * 2, `lanterne: ${ultimo} chiamate in 600 fotogrammi alla fine contro ${primo} all'inizio`);
});

test('effetti-palco.js: canvas davanti alla scena, un solo ciclo, solo quelli visibili, fermo con "riduci animazioni"', () => {
    const js = docs('effetti-palco.js');
    assert.match(js, /canvas\.className = 'ef-canvas'/);
    assert.match(js, /new radice\.IntersectionObserver/);
    assert.match(js, /new radice\.ResizeObserver/);
    assert.match(js, /prefers-reduced-motion: reduce/);
    assert.match(js, /attributeFilter: \['data-effetto-palco'\]/, 'segue i cambi di effetto (il negozio prova un palco dopo l\'altro)');
    assert.match(js, /el\.setAttribute\('data-ef-canvas', '1'\)/);
    // il CSS spegne gli strati di ripiego solo dove il canvas è attivo
    const css = docs('effetti-pagina.css');
    assert.match(css, /\[data-ef-canvas\]::before,\s*\[data-ef-canvas\]::after \{ content: none !important;/);
    assert.match(css, /\.ef-canvas \{[^}]*z-index: 20;[^}]*pointer-events: none;/);
    // lo script è nelle pagine che hanno gli effetti
    for (const pagina of ['public.html', 'shop.html', 'battle.html', 'palestra.html']) assert.match(docs(pagina), /<script src="effetti-palco\.js" defer><\/script>/, pagina);
});
