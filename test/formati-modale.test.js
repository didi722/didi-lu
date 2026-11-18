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
