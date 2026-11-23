'use strict';
// I colori firma che un allenatore può comprare nello Shop (Cosmetici.COLORI_FIRMA = PALETTE_FIRMA di pagina-pubblica.js): una scelta ampia, tutti ben distinti uno dall'altro,
// e lo Shop li mostra raggruppati per tonalità (Cosmetici.raggruppaColori): i colori simili stanno vicini.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../docs/cosmetici.js');
const P = require('../docs/pagina-pubblica.js');

const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');

// ---------- CIEDE2000: la distanza tra due colori come la vede l'occhio (sotto 2-3 non si distinguono, sopra 6 sì, anche a occhio nudo) ----------
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function lab(h) {
    const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function de2000([L1, a1, b1], [L2, a2, b2]) {
    const rad = Math.PI / 180, p7 = x => Math.pow(x, 7);
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(p7(Cm) / (p7(Cm) + p7(25))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const ang = (b, a) => { const x = Math.atan2(b, a) / rad; return x < 0 ? x + 360 : x; };
    const h1p = ang(b1, a1p), h2p = ang(b2, a2p);
    let dhp = 0;
    if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dLp = L2 - L1, dCp = C2p - C1p, dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2), Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
    let hpm = h1p + h2p;
    if (C1p * C2p !== 0) hpm = Math.abs(h1p - h2p) <= 180 ? hpm / 2 : (hpm + (hpm < 360 ? 360 : -360)) / 2;
    const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
    const Rc = 2 * Math.sqrt(p7(Cpm) / (p7(Cpm) + p7(25))), dTheta = 30 * Math.exp(-Math.pow((hpm - 275) / 25, 2));
    const Sl = 1 + 0.015 * Math.pow(Lpm - 50, 2) / Math.sqrt(20 + Math.pow(Lpm - 50, 2)), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
    return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) - Math.sin(2 * dTheta * rad) * Rc * (dCp / Sc) * (dHp / Sh));
}

const ORIGINALI = 56;       // i colori di prima (40 del profilo + 16 extra): chi li ha comprati li ha ancora, nello stesso ordine
const EXTRA_DI_PRIMA = ['#FF7B6B', '#F28C28', '#F4C430', '#A7C957', '#2A9D8F', '#1D7874', '#118AB2', '#264653', '#5E60CE', '#6A0572', '#AB4E68', '#8D5524', '#5B3A29', '#0B3D2E', '#1B2A49', '#4A1942'];

test('colori firma: una scelta ampia, scritta una volta sola, senza il verde di partenza e senza i neutri; quelli di prima ci sono ancora', () => {
    const tutti = P.PALETTE_FIRMA;
    assert.ok(tutti.length >= 120, `ce ne sono ${tutti.length}`);
    for (const c of tutti) assert.match(c, /^#[0-9A-F]{6}$/, `${c}: sei cifre, maiuscole (come l'id che ne deriva)`);
    assert.equal(new Set(tutti.map(c => c.toLowerCase())).size, tutti.length, 'nessun colore doppio');
    assert.ok(!tutti.includes(C.COLORE_DEFAULT), 'il verde degli account nuovi resta "di partenza"');
    for (const n of P.PALETTE_NEUTRI) assert.ok(!tutti.map(c => c.toLowerCase()).includes(n.toLowerCase()), `${n}: i neutri sono solo per sfondi e carte`);
    assert.deepEqual(tutti.slice(0, ORIGINALI), [...P.PALETTE_PROFILO, ...EXTRA_DI_PRIMA], 'quelli di prima, nel loro ordine: i nuovi stanno in fondo');
    assert.deepEqual(C.COLORI_FIRMA, tutti, 'il catalogo (sito e server) ha la stessa lista della pagina pubblica');
    // ogni colore si compra: ha il suo id nel catalogo e il prezzo di un colore
    for (const c of tutti) { const v = C.perId(C.idColore(c)); assert.ok(v && v.tipo === 'colore' && v.prezzo === C.PREZZI.colore, c); }
    assert.equal(C.valido('colore-d21e1e', 'colore'), 'colore-d21e1e', 'uno dei nuovi');
    assert.equal(C.valido('colore-d21e1f', 'colore'), '', 'uno che non è nella lista no');
});

test('colori firma: ogni colore nuovo si distingue bene da tutti gli altri (e dal verde di partenza): niente quasi-doppioni', () => {
    const tutti = [...P.PALETTE_FIRMA, C.COLORE_DEFAULT].map(c => ({ c, lab: lab(c) }));
    for (const nuovo of P.PALETTE_FIRMA.slice(ORIGINALI)) {
        const l = lab(nuovo);
        for (const altro of tutti) {
            if (altro.c === nuovo) continue;
            const d = de2000(l, altro.lab);
            assert.ok(d >= 6, `${nuovo} e ${altro.c} sono troppo simili (distanza ${d.toFixed(1)})`);
        }
    }
    // niente quasi-neri (illeggibili sulle card) né quasi-bianchi (sembrerebbero bianchi): come quelli di prima
    const luce = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    for (const nuovo of P.PALETTE_FIRMA.slice(ORIGINALI)) { const y = luce(nuovo); assert.ok(y >= 0.03 && (y <= 0.85 || C.famigliaColore(nuovo) === 'Greys'), `${nuovo}: luminosità ${y.toFixed(2)}`); }   // i bianchi sono voluti
});

test('famigliaColore: ogni colore sta nella sua famiglia, dai rossi ai rosa; un valore che non è un colore no', () => {
    const famiglia = c => C.famigliaColore(c);
    assert.equal(famiglia('#FF3333'), 'Reds');
    assert.equal(famiglia('#741111'), 'Reds');
    assert.equal(famiglia('#FFB3BA'), 'Pinks', 'un rosso molto chiaro è un rosa');
    assert.equal(famiglia('#D11A7A'), 'Pinks');
    assert.equal(famiglia('#FF8800'), 'Oranges');
    assert.equal(famiglia('#8D5524'), 'Browns', 'un arancio scuro è un marrone');
    assert.equal(famiglia('#B07D9A'), 'Pinks');
    assert.equal(famiglia('#D48C5F'), 'Oranges');
    assert.equal(famiglia('#FFDD00'), 'Yellows');
    assert.equal(famiglia('#33CC66'), 'Greens');
    assert.equal(famiglia('#00BFA5'), 'Teals');
    assert.equal(famiglia('#00F0FF'), 'Teals');
    assert.equal(famiglia('#0055FF'), 'Blues');
    assert.equal(famiglia('#7A29FF'), 'Purples');
    assert.equal(famiglia('#CC00FF'), 'Purples');
    assert.equal(famiglia('#6A0572'), 'Magentas');
    assert.equal(famiglia('#BDBDBD'), 'Greys');
    assert.equal(famiglia('#FAFAFA'), 'Greys', 'i bianchi');
    assert.equal(famiglia('#E8E4DC'), 'Greys', 'anche i bianchi caldi (la saturazione HSL vicino al bianco ingannerebbe)');
    assert.equal(famiglia('#BAFFF0'), 'Teals', 'un pastello colorato no');
    assert.equal(famiglia('ff3333'), 'Reds', 'anche senza il cancelletto (come Cosmetici.idColore)');
    for (const x of ['', 'rosso', '#GG0000', '#FFF', null, undefined, 5]) assert.equal(famiglia(x), '', String(x));
    assert.equal(famiglia('#ff3333'), 'Reds', 'maiuscole o minuscole');
});

test('raggruppaColori: ogni colore compare una volta sola, le famiglie vanno come l\'arcobaleno e dentro ognuna dal più chiaro al più scuro; nessuna famiglia vuota', () => {
    const gruppi = C.raggruppaColori(P.PALETTE_FIRMA);
    const piatti = gruppi.flatMap(g => g.colori);
    assert.equal(piatti.length, P.PALETTE_FIRMA.length);
    assert.deepEqual(piatti.slice().sort(), P.PALETTE_FIRMA.slice().sort(), 'gli stessi colori, solo in un altro ordine');
    assert.deepEqual(gruppi.map(g => g.nome), ['Reds', 'Oranges', 'Browns', 'Yellows', 'Greens', 'Teals', 'Blues', 'Purples', 'Magentas', 'Pinks', 'Greys'], 'in ordine d\'arcobaleno, poi bianchi e grigi in fondo');
    assert.deepEqual(gruppi.map(g => g.nome), C.GRUPPI_COLORI.filter(n => gruppi.some(g => g.nome === n)));
    for (const g of gruppi) {
        assert.ok(g.colori.length >= 6, `${g.nome}: ${g.colori.length} colori`);
        const luci = g.colori.map(c => { const [r, gg, b] = rgb(c).map(v => v / 255); return (Math.max(r, gg, b) + Math.min(r, gg, b)) / 2; });
        for (let i = 1; i < luci.length; i++) assert.ok(luci[i] <= luci[i - 1] + 1e-9, `${g.nome}: ${g.colori[i - 1]} poi ${g.colori[i]} (dal più chiaro al più scuro)`);
        for (const c of g.colori) assert.equal(C.famigliaColore(c), g.nome, c);
    }
    // senza elenco, quelli firma; valori che non sono colori e famiglie vuote non compaiono
    assert.deepEqual(C.raggruppaColori(), gruppi);
    assert.deepEqual(C.raggruppaColori(['#FF3333', 'rosso', '#0055FF', null]), [{ nome: 'Reds', colori: ['#FF3333'] }, { nome: 'Blues', colori: ['#0055FF'] }]);
    assert.deepEqual(C.raggruppaColori([]), []);
    // è la stessa cosa sul sito e sul server
    assert.deepEqual(require('../functions/cosmetici.js').raggruppaColori(P.PALETTE_FIRMA), gruppi);
});

test('Shop: i colori stanno tutti in fila (nessun titolo di famiglia, nessuna riga a parte), ordinati per tonalità', () => {
    const shop = docs('shop.js');
    assert.match(shop, /C\.raggruppaColori\(P\.PALETTE_FIRMA\)\.flatMap\(g => g\.colori\)\.map\(c => \{/);
    assert.doesNotMatch(shop, /shop-famiglia/, 'niente titoli: un\'unica griglia');
    assert.doesNotMatch(docs('style-shop.css'), /shop-famiglia/);
    assert.match(shop, /if \(!id \|\| mie\.has\(id\)\) return '';/, 'quelli che hai già non si ricomprano');
    assert.match(shop, /<div class="shop-colori">\$\{bottoni\}<\/div>/);
    assert.match(docs('style-shop.css'), /\.shop-colori \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(36px, 1fr\)\);/);
    assert.equal(docs('cosmetici.js'), fs.readFileSync(path.join(__dirname, '..', 'functions', 'cosmetici.js'), 'utf8'));
});

test('editor della pagina: i colori dello sfondo e della carta stanno nello stesso ordine dello Shop (per tonalità) con i neutri in fondo', () => {
    const ed = docs('public-editor.js');
    assert.match(ed, /const tavolozza = \(\) => \(window\.Cosmetici \? \[\.\.\.window\.Cosmetici\.raggruppaColori\(P\.PALETTE_FIRMA\)\.flatMap\(g => g\.colori\), \.\.\.P\.PALETTE_NEUTRI\] : P\.PALETTE_SFONDO\);/);
    assert.equal((ed.match(/tavolozza\(\)\.map\(/g) || []).length, 2, 'lo sfondo e la carta');
    assert.doesNotMatch(ed, /P\.PALETTE_SFONDO\.map\(/, 'nessuna lista fuori ordine');
    // la tavolozza ha tutti i colori una volta sola: quelli firma e i neutri
    const tav = [...C.raggruppaColori(P.PALETTE_FIRMA).flatMap(g => g.colori), ...P.PALETTE_NEUTRI];
    assert.deepEqual(tav.slice().sort(), P.PALETTE_SFONDO.slice().sort());
    assert.ok(docs('public.html').includes('<script src="cosmetici.js"></script>'), 'l\'editor ha il catalogo');
});
