'use strict';
// Le rifiniture grafiche che si vedono solo a schermo e che un cambio di stile può rompere senza che nessuno se ne accorga:
// le schede delle mosse alte uguali, il tag del titolo della pagina Trainers, il Team Builder che sta in uno schermo basso.
// Qui si legge il CSS (non c'è un browser): ogni regola sta in piedi finché nessuno la toglie.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
const dettagli = docs('dettagli.css');
const nbPagine = docs('nb-pagine.css');
const stileBox = docs('style-box.css');
const box = docs('box.html');

/** Il corpo (tra le graffe) della prima regola con questo selettore esatto */
function regola(css, selettore) {
    const esc = selettore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm'));
    assert.ok(m, `manca la regola ${selettore}`);
    return m[1];
}

test('mosse del Pokémon: striscia e corpo hanno la stessa altezza in tutte le schede, il corpo cresce solo con testi molto lunghi', () => {
    const riga = regola(dettagli, '#pkmDetailModal .move-row-mini');
    // la striscia colorata ha un\'altezza propria, il corpo si prende tutto il resto: una scheda più alta allunga solo il corpo
    assert.match(riga, /grid-template-rows:\s*minmax\(28px,\s*auto\)\s+1fr/);
    assert.match(riga, /grid-template-areas:\s*"nome valori"\s*"desc desc"/);
    const desc = regola(dettagli, '#pkmDetailModal .move-desc-inline');
    assert.match(desc, /align-self:\s*stretch/);
    assert.match(desc, /min-height:\s*calc\(3lh \+ 14px\)/, 'almeno tre righe di testo');
    assert.match(desc, /min-height:\s*60px/, 'rete di sicurezza dove lh non esiste');
    assert.match(desc, /-webkit-line-clamp:\s*5/);
    assert.match(desc, /\bline-clamp:\s*5/);
    // niente riempimento sotto il testo: con il taglio delle righe lascerebbe vedere l'inizio di quella dopo
    assert.match(desc, /padding:\s*5px 9px 0 !important/);
    assert.match(desc, /border-bottom:\s*6px solid var\(--dt-carta\)/);
    // anche senza testo (non ancora arrivato) il corpo c'è: la scheda non cambia altezza quando il testo arriva
    assert.match(dettagli, /#pkmDetailModal \.move-desc-inline:empty\s*\{\s*display:\s*block;?\s*\}/);
});

test('pagina Trainers: sopra la prima riga c\'è posto per il tag del titolo, che è inclinato', () => {
    const griglia = regola(nbPagine, 'body.pg-players .trainers-grid');
    const m = griglia.match(/padding-top:\s*(\d+)px/);
    assert.ok(m, 'padding-top in pixel');
    assert.ok(Number(m[1]) >= 46, `con ${m[1]}px il tag copre il primo giocatore`);
});

test('Team Builder: Import ed Export stanno in una riga sola, in entrambe le varianti', () => {
    const azioni = box.match(/function tbHtmlAzioni\(variante\) \{[\s\S]*?\n\}/);
    assert.ok(azioni, 'tbHtmlAzioni');
    const io = azioni[0].match(/<div class="tb-actions-io">([\s\S]*?)<\/div>/);
    assert.ok(io, 'il contenitore tb-actions-io');
    assert.match(io[1], /id="tb-btn-import"/);
    assert.match(io[1], /id="tb-btn-export"/);
    // nella colonna sono due metà della stessa riga; nella variante a riga (scelta Pokémon) il contenitore sparisce e i tasti
    // tornano a essere come gli altri della fila
    const riga = regola(stileBox, '.tb-actions-io');
    assert.match(riga, /display:\s*flex/);
    assert.match(riga, /width:\s*100%/);
    assert.match(regola(stileBox, '.tb-actions-io .tb-btn'), /flex:\s*1 1 0/);
    assert.match(regola(stileBox, '.tb-actions-row .tb-actions-io'), /display:\s*contents/);
});

test('Team Builder: sugli schermi bassi (PC) si stringe quello che sta intorno e sotto, mai la distanza tra titolo e prima riga', () => {
    const inizio = stileBox.indexOf('TEAM BUILDER SU SCHERMI BASSI');
    assert.ok(inizio > 0, 'la sezione dei schermi bassi');
    const sezione = stileBox.slice(inizio);
    const blocchi = [...sezione.matchAll(/@media\s*\(([^)]*)\)\s*and\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/g)];
    assert.ok(blocchi.length >= 3, 'almeno tre scaglioni di altezza');
    const altezze = blocchi.map(b => {
        // solo finestre larghe: il telefono ha le sue regole
        assert.match(`${b[1]} ${b[2]}`, /min-width:\s*901px/);
        const h = `${b[1]} ${b[2]}`.match(/max-height:\s*(\d+)px/);
        assert.ok(h, 'ogni scaglione ha la sua altezza');
        return Number(h[1]);
    });
    assert.deepEqual(altezze, [...altezze].sort((a, b) => b - a), 'dal più alto al più basso: i più bassi vincono');
    // il primo scaglione parte sotto l'altezza naturale della finestra (719 con i due bottoni su una riga)
    assert.ok(altezze[0] >= 719 && altezze[0] <= 760, `primo scaglione a ${altezze[0]}px`);
    const tutto = blocchi.map(b => b[3]).join('\n');
    // il tag del titolo sporge nel corpo di quaranta pixel e il corpo ha il suo riempimento in alto: toccarli avvicina il titolo
    // alla prima riga e lo fa coprire i campi
    assert.doesNotMatch(tutto, /\.tb-body\s*\{[^}]*padding\s*:/, 'padding abbreviato su .tb-body');
    assert.doesNotMatch(tutto, /\.tb-body\s*\{[^}]*padding-top/);
    assert.doesNotMatch(tutto, /\.tb-wrapper\s*\{[^}]*gap/);
    assert.doesNotMatch(tutto, /\.tb-header\s*\{/);
    assert.doesNotMatch(tutto, /\.tb-title\s*\{/);
    // l'aria intorno alla finestra sì, ma non fino a far uscire il tag dallo schermo
    for (const m of tutto.matchAll(/\.tb-overlay\s*\{[^}]*padding-top:\s*(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `padding-top ${m[1]}px`);
});
