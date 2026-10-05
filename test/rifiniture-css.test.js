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

// ---------------------------------------------------------------------------------------------------------------------------
// Tag e blocchi neri: mai un'ombra nera piena (nero su nero si fonde: la figura si ingrossa e basta)
// ---------------------------------------------------------------------------------------------------------------------------
const temi = docs('temi.css');
const nbPagine2 = docs('nb-pagine.css');

/** Il valore di una proprietà (l'ultima dichiarazione) nel corpo di una regola, senza !important */
const valore = (corpo, proprieta) => {
    const m = [...corpo.matchAll(new RegExp(`(?:^|[;\\s])${proprieta}\\s*:\\s*([^;]+)`, 'g'))].pop();
    return m ? m[1].replace(/\s*!important\s*$/i, '').trim() : null;
};

test('Team Builder: il nome del team (il tag nero in alto) parte dal bordo della scheda e non si riduce a due lettere accanto al formato', () => {
    const intestazione = regola(stileBox, '.tb-header');
    // prima partiva 300px più in là e, col formato lungo ("Little Cup · Up to Gen 6 · Lv. 5 · Species & Item Clause"), restava "I..."
    const spazio = Number(intestazione.match(/margin-left:\s*(\d+)px/)[1]);
    assert.ok(spazio >= 75 && spazio <= 110, `margin-left ${spazio}px: dopo la colonna degli slot (75px + 20) e non oltre`);
    assert.match(intestazione, /flex-wrap:\s*nowrap/);
    const nome = regola(stileBox, '.tb-title');
    assert.match(nome, /flex:\s*0 0\.\d+ auto/, 'cede poco spazio (il formato cede per primo)');
    assert.match(nome, /min-width:\s*min\(100%,\s*9rem\)/, 'mai sotto le otto lettere circa');
    assert.doesNotMatch(nome, /min-width:\s*0\b/);
    const formato = regola(stileBox, '.tb-format-badge');
    assert.match(formato, /flex-shrink:\s*1/, 'il formato si restringe');
    assert.match(formato, /white-space:\s*normal/, '...andando a capo');
    assert.doesNotMatch(formato, /flex-shrink:\s*0/);
    assert.doesNotMatch(formato, /white-space:\s*nowrap/);
    // schermi stretti ma con la colonna degli slot: nome e formato più piccoli
    const stretto = stileBox.match(/@media \(min-width: 901px\) and \(max-width: (\d+)px\) \{([^@]*?)\n\}/);
    assert.ok(stretto && Number(stretto[1]) >= 1000, 'scaglione 901px...');
    assert.match(stretto[2], /\.tb-title\s*\{[^}]*font-size:\s*1\.5rem/);
    assert.match(stretto[2], /\.tb-format-badge\s*\{[^}]*font-size:\s*0\.68rem/);
    // telefono (<= 900px): sulla prima riga solo il nome e la X, formato e note sotto, insieme
    const telefono = stileBox.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/)[1];
    assert.match(telefono, /input\.tb-title\s*\{[^}]*flex:\s*1 1 calc\(100% - 60px\)/);
    assert.match(telefono, /\.tb-close\s*\{[^}]*order:\s*2/);
    assert.match(telefono, /\.tb-format-badge\s*\{[^}]*order:\s*3[^}]*flex:\s*1 1 0/);
    assert.match(docs('note-team.css'), /@media \(max-width: 900px\) \{[^@]*\.tb-header \.nt-barra-team \{ order: 4; \}/);
    // i temi non toccano né larghezze né margini dell'intestazione
    for (const f of ['temi.css', 'nb-pagine.css']) assert.doesNotMatch(docs(f), /\.tb-(header|title)[^{]*\{[^}]*(margin|width)/);
});

test('temi: le ombre dei blocchi scuri sono grigie e trasparenti, quelle delle etichette piccole sono spente nei temi con ombra piena', () => {
    const tema = nome => {
        const m = temi.match(new RegExp(`\\[data-tema="${nome}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
        assert.ok(m, `tema ${nome}`);
        return m[1];
    };
    const neubrutal = temi.match(/:root,\s*\[data-tema="neubrutal"\]\s*\{([\s\S]*?)\n\}/);
    assert.ok(neubrutal, 'tema neubrutal (predefinito)');
    assert.equal(valore(neubrutal[1], '--nb-sh-tag'), 'none');
    assert.equal(valore(tema('sticker'), '--nb-sh-tag'), 'none');
    // nei temi con ombra sfumata o al neon quella del tema si vede: resta
    assert.equal(valore(tema('morbido'), '--nb-sh-tag'), 'var(--nb-sh-s)');
    assert.equal(valore(tema('arcade'), '--nb-sh-tag'), 'var(--nb-sh-s)');
    // il colore dell'ombra degli adesivi scuri non è mai pieno: grigio trasparente (o il neon di Arcade)
    for (const [nome, corpo] of [['neubrutal', neubrutal[1]], ['sticker', tema('sticker')], ['morbido', tema('morbido')]]) {
        const col = valore(corpo, '--nb-shcol-titolo');
        const a = col && col.match(/rgba\([^)]*,\s*(0?\.\d+)\s*\)/);
        assert.ok(a && Number(a[1]) < 0.55, `${nome}: --nb-shcol-titolo ${col}`);
    }
    assert.equal(valore(tema('arcade'), '--nb-shcol-titolo'), 'var(--nb-neon)');
    // le tre ombre "scure" usano quel colore, con gli stessi spostamenti di quelle piene
    for (const [nome, px, blur] of [['s', 3, 8], ['4', 4, 10], ['m', 6, 16]]) {
        const v = temi.match(new RegExp(`--nb-sh-${nome}-scuro:\\s*([^;]+);`));
        assert.ok(v, `--nb-sh-${nome}-scuro`);
        assert.match(v[1], new RegExp(`calc\\(${px}px \\* var\\(--nb-kx\\)\\) calc\\(${px}px \\* var\\(--nb-ky\\)\\) calc\\(${blur}px \\* var\\(--nb-bk\\)\\) var\\(--nb-shcol-titolo\\)`));
    }
});

test('occorrenze sistemate: ogni blocco o tag scuro ha la sua ombra (grigia trasparente o nessuna)', () => {
    const css = { 'nb-pagine.css': nbPagine2, 'temi.css': temi, 'showdown.css': docs('showdown.css'), 'style-formats.css': docs('style-formats.css'),
        'style-box.css': stileBox, 'style-profile.css': docs('style-profile.css'), 'style-sfide.css': docs('style-sfide.css') };
    const ombra = (file, selettore) => valore(regola(css[file], selettore), 'box-shadow');
    // blocchi con un contenuto (nomi delle stagioni, conto alla rovescia, cifre, posizione e punti in classifica): grigio trasparente
    assert.equal(ombra('nb-pagine.css', 'body.pg-index .season-card h3'), 'var(--nb-sh-s-scuro)');
    assert.equal(ombra('nb-pagine.css', 'body.pg-index .timer-display'), 'var(--nb-sh-s-scuro)');
    assert.equal(ombra('nb-pagine.css', 'body.pg-hub .countdown-label'), 'var(--nb-sh-m-scuro)');
    assert.equal(ombra('nb-pagine.css', 'body.pg-hub .countdown-digits'), 'var(--nb-sh-m-scuro)');
    assert.equal(ombra('nb-pagine.css', 'body.pg-players .trainer-rank-text'), 'var(--nb-sh-s-scuro)');
    assert.equal(ombra('nb-pagine.css', 'body.pg-players .trainer-points-box'), 'var(--nb-sh-s-scuro)');
    assert.match(ombra('showdown.css', '#sd-modal-overlay .sd-serie'), /^var\(--nb-sh-s-scuro,/);
    assert.match(ombra('style-box.css', '.tb-dropdown-wrapper:hover .tb-dropdown-trigger,\n.tb-dropdown-wrapper:focus-within .tb-dropdown-trigger'), /^var\(--nb-sh-4-scuro,/);
    assert.match(temi, /\.menu-item\[aria-current="page"\]\s*\{[^}]*box-shadow:\s*var\(--nb-sh-s-scuro\)/);
    // etichette piccole (tab, filtro attivo, titolo del riquadro): nessuna ombra nei temi con ombra piena
    assert.equal(ombra('nb-pagine.css', 'body.pg-index .season-card::before'), 'var(--nb-sh-tag)');
    assert.equal(ombra('nb-pagine.css', 'body.pg-hub #registration-column::before,\nbody.pg-hub .hub-column-right::before'), 'var(--nb-sh-tag)');
    assert.equal(ombra('nb-pagine.css', 'body.pg-players .trainers-grid::before'), 'var(--nb-sh-tag)');
    assert.equal(ombra('style-formats.css', '.mandatory-title'), 'var(--nb-sh-tag, none)');
    assert.match(css['style-profile.css'], /\.pf-filtro\.attivo\s*\{[^}]*box-shadow:\s*var\(--nb-sh-tag, none\)/);
    assert.match(css['style-sfide.css'], /\.sfida-riprendi:hover\s*\{[^}]*box-shadow:\s*var\(--nb-sh-tag, none\)/);
    // le tab colorate della card stagione (LIVE, SIGN-UPS OPEN, COMING SOON) tengono l'ombra piena: non sono nere
    for (const stato of ['playing', 'open', 'empty']) {
        assert.match(nbPagine2, new RegExp(`\\.season-card\\.status-${stato}::before\\s*\\{[^}]*box-shadow:\\s*var\\(--nb-sh-s\\)`), stato);
    }
});

test('il badge del risultato di uno showdown senza vincitore non è nero (testo nero su nero) e il pareggio ha l\'ombra grigia', () => {
    const matches = docs('matches.html');
    assert.match(matches, /const COLORE_NEUTRO = "var\(--nb-giallo, #ffbd44\)";/);
    assert.doesNotMatch(matches, /let winnerColor = "#000"/);
    assert.match(matches, /ombraPunteggio = 'var\(--nb-sh-4-scuro, 4px 4px 0 rgba\(0, 0, 0, \.3\)\)'/);
    assert.match(matches, /box-shadow: \$\{ombraPunteggio\};/);
});

// ---- la rete di sicurezza: nessuna regola con sfondo nero e ombra nera piena ----
function regoleCss(css) {
    const senza = css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
    const out = [], pila = [];
    let buf = '', riga = 1;
    for (const c of senza) {
        if (c === '\n') riga++;
        if (c === '{') { pila.push({ sel: buf.trim(), riga }); buf = ''; }
        else if (c === '}') { const r = pila.pop(); if (r) out.push({ ...r, corpo: buf }); buf = ''; }
        else buf += c;
    }
    return out.filter(r => !r.sel.startsWith('@') && r.corpo.trim());
}
// sfondo scuro: il nero, l'inchiostro del tema (--nb-ink, --dt-ink, --inchiostro...) o il fondo delle tab (--nb-tab-bg)
const SFONDO_SCURO = /^(#000(?:000)?\b|#1a1a1a\b|#1e1e1e\b|#111\b|black\b|var\(--(?:nb-ink|dt-ink|inchiostro|nero|black|nb-tab-bg)\b)/i;
// un'ombra con spostamento che dietro un blocco scuro si legge come nero pieno
function ombraNeraPiena(valoreOmbra) {
    const pezzi = []; let prof = 0, cur = '';
    for (const ch of valoreOmbra) {
        if (ch === '(') prof++; if (ch === ')') prof--;
        if (ch === ',' && prof === 0) { pezzi.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) pezzi.push(cur.trim());
    return pezzi.some(o => {
        if (/^none$/i.test(o) || /\binset\b/i.test(o)) return false;
        if (/^0(?:px)?\s+0(?:px)?\s/.test(o)) return false;                       // senza spostamento: un alone, non un'ombra
        if (/--nb-sh-(?:s|4|m|8|l)-scuro|--nb-sh-tag|--nb-shcol-titolo|--nb-sh-titolo|--dt-sh-titolo/.test(o)) return false;
        const rgba = o.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (rgba) return rgba[1] == null || Number(rgba[1]) >= 0.55;                // nero: pieno se l'alfa è alto
        return /#000(?:000)?\b|\bblack\b|var\(--(?:nb-ink|dt-ink|inchiostro|nero|black|nb-shcol|nb-sh-(?:s|4|m|8|l))\b/i.test(o);
    });
}
// eccezioni note: la regola, e perché va bene
const ECCEZIONI = {
    'style-matches.css .news-ticker': 'regola morta (non c\'è nessun elemento): ha un filo giallo di 5px sotto, tra il nero e l\'ombra'
};

test('nessuna regola del sito dà a un blocco nero un\'ombra nera piena (nero su nero)', () => {
    const colpevoli = [];
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'docs')).filter(n => n.endsWith('.css'))) {
        for (const { sel, riga, corpo } of regoleCss(docs(f))) {
            const sfondo = valore(corpo, 'background') || valore(corpo, 'background-color');
            const ombra = valore(corpo, 'box-shadow');
            if (!sfondo || !ombra || !SFONDO_SCURO.test(sfondo) || !ombraNeraPiena(ombra)) continue;
            const chiave = `${f} ${sel.replace(/\s+/g, ' ')}`;
            if (ECCEZIONI[chiave]) continue;
            colpevoli.push(`${f}:${riga} ${sel.replace(/\s+/g, ' ')}  →  ${ombra}`);
        }
    }
    assert.deepEqual(colpevoli, [], `blocchi scuri con ombra nera piena:\n${colpevoli.join('\n')}`);
});

test('la rete di sicurezza riconosce davvero il nero su nero (e lascia stare il resto)', () => {
    assert.ok(ombraNeraPiena('var(--nb-sh-s)'));
    assert.ok(ombraNeraPiena('3px 3px 0 #000'));
    assert.ok(ombraNeraPiena('calc(3px * var(--nb-kx, 1)) calc(3px * var(--nb-ky, 1)) calc(8px * var(--nb-bk, 0)) var(--nb-shcol, #000)'));
    assert.ok(ombraNeraPiena('4px 4px 0 var(--inchiostro)'));
    assert.ok(ombraNeraPiena('5px 5px 0 rgba(0, 0, 0, .8)'));
    assert.ok(ombraNeraPiena('0 4px 0 #000'));
    assert.ok(!ombraNeraPiena('var(--nb-sh-s-scuro)'));
    assert.ok(!ombraNeraPiena('var(--nb-sh-tag, none)'));
    assert.ok(!ombraNeraPiena('none'));
    assert.ok(!ombraNeraPiena('4px 4px 0 rgba(0, 0, 0, .3)'));
    assert.ok(!ombraNeraPiena('4px 4px 0 var(--nb-shcol-titolo, rgba(0, 0, 0, .3))'));
    assert.ok(!ombraNeraPiena('4px 4px 0 white'));
    assert.ok(!ombraNeraPiena('3px 3px 0 var(--giallo)'));
    assert.ok(!ombraNeraPiena('0 0 30px rgba(0, 0, 0, 1)'), 'un alone senza spostamento');
    assert.ok(!ombraNeraPiena('inset 0 -4px 0 #000'));
    assert.ok(SFONDO_SCURO.test('var(--nb-ink, #000)') && SFONDO_SCURO.test('#000') && SFONDO_SCURO.test('var(--nb-tab-bg)'));
    assert.ok(!SFONDO_SCURO.test('#09ca49') && !SFONDO_SCURO.test('#fff') && !SFONDO_SCURO.test('var(--nb-giallo)'));
});
