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
