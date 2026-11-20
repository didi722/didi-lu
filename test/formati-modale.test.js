'use strict';
// formats.html: il modale di creazione/modifica del formato si chiude con la X e col velo, in tutti e due i casi.
// (Prima la X si collegava solo aprendo "aggiungi formato": col "modifica" non faceva niente.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'formats.html'), 'utf8');
const corpo = nome => { const i = html.indexOf(`function ${nome}(`); assert.ok(i > 0, nome); return html.slice(i, html.indexOf('\n}\n', i)); };

test('la chiusura del modale del formato sta in una funzione sola e collega X e velo', () => {
    const f = corpo('collegaChiusuraModaleFormato');
    assert.match(f, /getElementById\('close-format-modal'\)/);
    assert.match(f, /closeBtn\.onclick = \(\) => modal\.style\.setProperty\('display', 'none', 'important'\)/);
    assert.match(f, /modal\.onclick = /);
});

test('sia "aggiungi formato" sia "modifica formato" collegano la chiusura dopo aver aperto il modale', () => {
    assert.match(corpo('apriCreazioneFormato'), /collegaChiusuraModaleFormato\(modal\)/);
    const modifica = corpo('apriModaleModificaFormato');
    assert.match(modifica, /setProperty\('display', 'flex', 'important'\);\s*collegaChiusuraModaleFormato\(modal\)/);
});

test('il titolo del team nell\'editor del Team Builder è un campo che mostra maiuscole e minuscole (non tutto in maiuscolo)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'style-box.css'), 'utf8');
    const r = [...css.matchAll(/(?:^|\n)input\.tb-title \{([^}]*)\}/g)].map(m => m[1]).join('\n');
    assert.ok(r, 'regola del campo mancante');
    assert.match(r, /text-transform:\s*none/);
});

test('matches: il contenuto non finisce mai sotto le pubblicità fisse (margine sinistro almeno la loro larghezza più un po\' d\'aria)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'style-matches.css'), 'utf8');
    const r = /\n\.hub-container \{([^}]*)\}/.exec(css);
    assert.ok(r);
    assert.match(r[1], /margin-left: max\(18%, calc\(var\(--nb-ads, 220px\) \+ 24px\)\)/);
    assert.match(css, /@media \(max-width: 900px\) \{\s*\.hub-container \{ margin-left: 0;/, 'sul telefono (pubblicità nascoste) resta zero');
});

test('i tasti in alto (campanella, Team Builder...) sono fissi come il tasto utente: scorrendo non scappano via', () => {
    const temi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'temi.css'), 'utf8');
    const r = /\n\.tasti-alto \{([^}]*)\}/.exec(temi);
    assert.ok(r);
    assert.match(r[1], /position:\s*fixed/);
    assert.match(temi, /\.top-auth-bar \{ position: fixed;/, 'come il tasto utente');
    const mvp = fs.readFileSync(path.join(__dirname, '..', 'docs', 'mvp.css'), 'utf8');
    assert.match(mvp, /body\.nb:not\(\.pg-profile\) \.btn-mvp \{\s*position: fixed !important;/);
});

test('scorrendo, i tasti in alto con testo (Team Builder...) si riducono alla sola icona come il tasto utente', () => {
    const temi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'temi.css'), 'utf8');
    assert.match(temi, /body\.menu-compatto\.nb \.tasti-alto > \*:not\(:hover\):not\(:focus-visible\) \.tasto-testo \{ display: none; \}/);
    assert.match(temi, /body\.menu-compatto:is\(\.nb, \.pg-public\) \.auth-interaction:not\(:hover\):not\(:focus-visible\) #auth-text \{ display: none; \}/);
});

test('compatti: la colonna dei tasti parte sempre sotto il tasto utente, anche nelle pagine con la striscia nera (dove lui sta a 42px e non a 20px)', () => {
    const temi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'temi.css'), 'utf8');
    const px = (re, nome) => { const m = temi.match(re); assert.ok(m, nome); return Number(m[1]); };
    const utenteBase = px(/:is\(body\.nb, body\.pg-public\) \.top-auth-bar \{ position: fixed; top: (\d+)px;/, 'top del tasto utente');
    const utenteConStriscia = px(/body\.nb:has\(\.top-bar\) \.top-auth-bar \{ top: (\d+)px; \}/, 'top del tasto utente con la striscia');
    const colonnaBase = px(/body\.menu-compatto\.nb \.tasti-alto \{ top: (\d+)px; right: 20px;/, 'top della colonna');
    const colonnaConStriscia = px(/body\.menu-compatto\.nb:has\(\.top-bar\) \.tasti-alto \{ top: (\d+)px; \}/, 'top della colonna con la striscia');
    const compatto = 44, respiro = 10;                      // il tasto utente compatto è alto 44px
    assert.ok(colonnaBase >= utenteBase + compatto + respiro, `${colonnaBase} sovrapposta al tasto utente (${utenteBase} + ${compatto})`);
    assert.ok(colonnaConStriscia >= utenteConStriscia + compatto + respiro, `${colonnaConStriscia} sovrapposta al tasto utente (${utenteConStriscia} + ${compatto})`);
    // sul telefono il tasto utente sta a 42px in tutte le pagine (#auth-content)
    assert.match(temi, /body\.nb:not\(\.pg-profile\) #auth-content \{ position: fixed; top: 42px;/);
    assert.ok(px(/body\.menu-compatto\.nb \.tasti-alto \{ top: (\d+)px; right: 12px;/, 'top sul telefono') >= 42 + compatto + respiro);
});

test('compatti (pagina scorsa): i tasti in alto hanno la misura del tasto utente e stanno sotto di lui, con lo stesso bordo destro', () => {
    const temi = fs.readFileSync(path.join(__dirname, '..', 'docs', 'temi.css'), 'utf8');
    assert.match(temi, /\.auth-interaction:not\(:hover\):not\(:focus-visible\) \{[^}]*width: 44px; height: 44px; padding: 0/);
    assert.match(temi, /body\.menu-compatto\.nb \.tasti-alto \{ top: 74px; right: 20px; gap: 10px; flex-direction: column; align-items: flex-end;/);
    assert.match(temi, /body\.menu-compatto\.nb \.tasti-alto > \*:not\(:hover\):not\(:focus-visible\) \{ width: 44px !important; min-width: 44px; height: 44px !important; \}/);
    assert.match(temi, /body\.menu-compatto\.nb \.tasti-alto \{ top: 96px; right: 12px;/, 'sul telefono: il tasto utente sta a 42px');
    // New format (Formats) è nella stessa fila e ha il testo che sparisce
    const formats = fs.readFileSync(path.join(__dirname, '..', 'docs', 'formats.html'), 'utf8');
    assert.match(formats, /class="btn-floating-admin"[^>]*>\s*<span class="plus-icon">\+<\/span><span class="tasto-testo">New format<\/span>/);
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'docs', 'controlli.js'), 'utf8'), /'\.sfide-btn, \.btn-floating-admin, \.btn-floating-helper, \.btn-floating-h2h'/);
});
