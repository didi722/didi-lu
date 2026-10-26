'use strict';
// Il Team Builder dell'app (docs/app-teambuilder.js, app-gioco-pagine.css): lo stesso di box.html, a tappe.
//   - la parte pura: le tappe, quali sono raggiungibili, la tappa dopo una scelta, il menù;
//   - il foglio: ogni tappa mostra solo la sua parte, e vale solo nell'app.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../docs/app-teambuilder.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

test('PASSI: Pokémon, strumento e abilità, mosse, EV, team; le tre di mezzo servono un Pokémon', () => {
    assert.deepEqual(T.PASSI.map(p => p.id), ['pokemon', 'oggetto', 'mosse', 'ev', 'team']);
    assert.deepEqual(T.PASSI.filter(p => p.serve).map(p => p.id), ['oggetto', 'mosse', 'ev']);
    assert.equal(T.indice('mosse'), 2);
    assert.equal(T.indice('boh'), -1);
});

test('abilitato: scegliere il Pokémon e guardare il team si può sempre; il resto solo con un Pokémon nello slot', () => {
    for (const id of ['pokemon', 'team']) { assert.equal(T.abilitato(id, false), true, id); assert.equal(T.abilitato(id, true), true, id); }
    for (const id of ['oggetto', 'mosse', 'ev']) { assert.equal(T.abilitato(id, false), false, id); assert.equal(T.abilitato(id, true), true, id); }
    assert.equal(T.abilitato('boh', true), false);
});

test('prossimo: un passo avanti o indietro, saltando le tappe chiuse; ai capi resta dov\'è', () => {
    assert.equal(T.prossimo('pokemon', 1, true), 'oggetto');
    assert.equal(T.prossimo('oggetto', 1, true), 'mosse');
    assert.equal(T.prossimo('ev', 1, true), 'team');
    assert.equal(T.prossimo('team', 1, true), 'team');
    assert.equal(T.prossimo('pokemon', -1, true), 'pokemon');
    assert.equal(T.prossimo('team', -1, true), 'ev');
    assert.equal(T.prossimo('pokemon', 1, false), 'team', 'senza Pokémon si salta a guardare il team');
    assert.equal(T.prossimo('team', -1, false), 'pokemon');
    assert.equal(T.prossimo('boh', 1, true), 'pokemon');
});

test('dopoRender: scelto il Pokémon si passa a strumento e abilità; uno slot vuoto riporta alla scelta; altrimenti la tappa resta', () => {
    assert.equal(T.dopoRender('scelta', 'editor', 'pokemon'), 'oggetto', 'appena scelto');
    assert.equal(T.dopoRender('scelta', 'editor', 'team'), 'team', 'se si stava guardando il team non lo si lascia');
    assert.equal(T.dopoRender(null, 'editor', 'pokemon'), 'pokemon', 'aperto un team da modificare: si parte dal Pokémon');
    assert.equal(T.dopoRender('editor', 'editor', 'mosse'), 'mosse', 'cambiando slot (tra due Pokémon) si resta sulle mosse');
    assert.equal(T.dopoRender('editor', 'scelta', 'mosse'), 'pokemon', 'toccato uno slot vuoto');
    assert.equal(T.dopoRender('editor', 'scelta', 'team'), 'pokemon');
    assert.equal(T.dopoRender('editor', 'altro', 'ev'), 'ev', 'durante un caricamento non cambia niente');
});

test('htmlMenu: cinque tappe numerate con quella attiva, le chiuse spente, le frecce ai lati', () => {
    const h = T.htmlMenu('mosse', true);
    assert.equal((h.match(/class="tbw-passo/g) || []).length, 5);
    assert.match(h, /class="tbw-passo attivo" data-tbw-passo="mosse"[^>]*aria-current="step"/);
    assert.match(h, /class="tbw-passo fatto" data-tbw-passo="pokemon"/, 'le tappe già fatte sono segnate');
    assert.match(h, /class="tbw-passo fatto" data-tbw-passo="oggetto"/);
    assert.doesNotMatch(h, /class="tbw-passo fatto" data-tbw-passo="ev"/);
    assert.match(h, /<b>3<\/b><span>Moves<\/span>/);
    assert.equal((h.match(/data-tbw-verso="-1"/g) || []).length, 1);
    assert.equal((h.match(/data-tbw-verso="1"/g) || []).length, 1);
    const vuoto = T.htmlMenu('pokemon', false);
    for (const id of ['oggetto', 'mosse', 'ev']) assert.match(vuoto, new RegExp(`data-tbw-passo="${id}"[^>]* disabled`), `${id} chiuso senza Pokémon`);
    assert.match(vuoto, /data-tbw-verso="-1"[^>]* disabled/, 'dalla prima tappa non si torna indietro');
    assert.match(T.htmlMenu('team', true), /data-tbw-verso="1"[^>]* disabled/, 'dall\'ultima non si va avanti');
});

test('il foglio: ogni tappa ha le sue regole, tutte sotto html.app-shell; il sito resta com\'è', () => {
    const css = docs('app-gioco-pagine.css');
    for (const id of T.PASSI.map(p => p.id).filter(id => id !== 'pokemon')) assert.match(css, new RegExp(`\\.tb-overlay\\[data-tb-step="${id}"\\]`), `manca la tappa ${id}`);
    // niente regole del Team Builder fuori dall'app: ogni riga che nomina .tb- o .tbw- parte da html.app-shell
    const righe = css.split('\n').filter(r => /\.tbw?-/.test(r) && /\{/.test(r) && !/^\s*(\/\*|\*)/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 30, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
    // gli id e le classi che il foglio nomina esistono ancora in box.html
    const box = docs('box.html');
    for (const nome of ['tb-overlay', 'tb-wrapper', 'tb-header', 'tb-body', 'tb-slots', 'tb-content-container', 'tb-picker-top', 'tb-picker-grid', 'tb-editor', 'tb-side', 'tb-fields', 'tb-moves', 'tb-evs', 'tb-ev-row', 'tb-actions', 'tb-save-wrap', 'tb-combo-list']) assert.ok(box.includes(nome), `box.html non ha più ${nome}`);
});

test('app.js carica lo script solo nel Box; lo script non fa niente fuori dall\'app', () => {
    const A = require('../docs/app.js');
    assert.deepEqual(A.SCRIPT_PAGINE['box.html'], ['app-teambuilder.js']);
    const finto = { documentElement: { classList: { contains: () => false } } };
    assert.equal(T.avvia({ document: finto }), null, 'senza html.app-shell non tocca la pagina');
    assert.equal(T.avvia({}), null);
});
