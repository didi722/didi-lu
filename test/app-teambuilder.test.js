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

test('htmlMenu: cinque tappe numerate con quella attiva, le chiuse spente; niente frecce (si scorre col dito)', () => {
    const h = T.htmlMenu('mosse', true);
    assert.equal((h.match(/class="tbw-passo/g) || []).length, 5);
    assert.match(h, /class="tbw-passo attivo" data-tbw-passo="mosse"[^>]*aria-current="step"/);
    assert.match(h, /class="tbw-passo fatto" data-tbw-passo="pokemon"/, 'le tappe già fatte sono segnate');
    assert.match(h, /class="tbw-passo fatto" data-tbw-passo="oggetto"/);
    assert.doesNotMatch(h, /class="tbw-passo fatto" data-tbw-passo="ev"/);
    assert.match(h, /<b>3<\/b><span>Moves<\/span>/);
    assert.doesNotMatch(h, /tbw-freccia|data-tbw-verso/, 'le frecce gialle non ci sono più');
    const vuoto = T.htmlMenu('pokemon', false);
    for (const id of ['oggetto', 'mosse', 'ev']) assert.match(vuoto, new RegExp(`data-tbw-passo="${id}"[^>]* disabled`), `${id} chiuso senza Pokémon`);
});

test('htmlFormati: un tasto per formato (quello scelto evidenziato), al posto del menù a tendina; senza formati lo dice', () => {
    const h = T.htmlFormati([{ valore: '', testo: 'Choose format...' }, { valore: 'r1', testo: 'OU' }, { valore: 'r2', testo: 'VGC <Reg G>' }], 'r2');
    assert.equal((h.match(/class="tbf-chip/g) || []).length, 2, 'la voce vuota non è un formato');
    assert.match(h, /class="tbf-chip attivo" data-tbf="r2" aria-pressed="true"/);
    assert.match(h, /VGC &lt;Reg G&gt;/);
    assert.match(T.htmlFormati([], ''), /No formats yet/);
    assert.match(T.htmlFormati(null, ''), /No formats yet/);
});

test('tastieraAperta: l\'altezza visibile molto più bassa della massima vuol dire tastiera aperta', () => {
    assert.equal(T.tastieraAperta(340, 340), false);
    assert.equal(T.tastieraAperta(180, 340), true);
    assert.equal(T.tastieraAperta(300, 340), false, 'una barra di sistema non è una tastiera');
    assert.equal(T.tastieraAperta(0, 0), false);
});

test('azioneTocco: il primo tocco su un campo apre l\'elenco (senza tastiera); toccando la casella aperta compare la tastiera; con la tastiera aperta un tocco fuori la chiude prima dell\'elenco', () => {
    assert.equal(T.azioneTocco({ suCampo: true }), 'apri-lista');
    assert.equal(T.azioneTocco({ suCampo: true, campoAttivo: false, listaAperta: true }), 'apri-lista', 'un altro campo');
    assert.equal(T.azioneTocco({ suCampo: true, campoAttivo: true, listaAperta: true }), 'tastiera');
    assert.equal(T.azioneTocco({ suCampo: true, campoAttivo: true, listaAperta: true, tastiera: true }), 'normale', 'già a tastiera: si scrive');
    assert.equal(T.azioneTocco({ suCampo: false, tastiera: true, listaAperta: true }), 'chiudi-tastiera');
    assert.equal(T.azioneTocco({ suCampo: false, tastiera: false, listaAperta: true }), 'normale', 'a tastiera chiusa il tocco fuori chiude l\'elenco come sempre');
    assert.equal(T.azioneTocco({}), 'normale');
});

test('il foglio: ogni tappa ha le sue regole, tutte sotto html.app-shell; il sito resta com\'è', () => {
    const css = docs('app-gioco-pagine.css');
    for (const id of T.PASSI.map(p => p.id).filter(id => id !== 'pokemon')) assert.match(css, new RegExp(`\\.tb-overlay\\[data-tb-step="${id}"\\]`), `manca la tappa ${id}`);
    // niente regole del Team Builder fuori dall'app: ogni riga che nomina .tb- o .tbw- parte da html.app-shell
    const righe = css.split('\n').filter(r => /\.tbw?-/.test(r) && /\{/.test(r) && !/^\s*(\/\*|\*)/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 30, 'regole trovate: ' + righe.length);
    assert.match(css, /#helper-modal-overlay #helper-pkm-grid \{[^}]*grid-auto-flow: column;[^}]*overflow-x: auto !important; overflow-y: hidden !important;/, 'l\'assistente: i Pokémon scorrono di lato');
    assert.match(css, /#amic-overlay \.amic-formati \{ display: flex !important; flex-wrap: nowrap;/, 'la sfida amichevole: i formati scorrono di lato');
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
    // gli id e le classi che il foglio nomina esistono ancora in box.html
    const box = docs('box.html');
    for (const nome of ['tb-overlay', 'tb-wrapper', 'tb-header', 'tb-body', 'tb-slots', 'tb-content-container', 'tb-picker-top', 'tb-picker-grid', 'tb-editor', 'tb-side', 'tb-fields', 'tb-moves', 'tb-evs', 'tb-ev-row', 'tb-actions', 'tb-save-wrap', 'tb-combo-list']) assert.ok(box.includes(nome), `box.html non ha più ${nome}`);
});

test('app.js carica lo script solo nel Box; lo script non fa niente fuori dall\'app', () => {
    const A = require('../docs/app.js');
    assert.deepEqual(A.SCRIPT_PAGINE['box.html'], ['app-carosello.js', 'app-teambuilder.js']);
    const finto = { documentElement: { classList: { contains: () => false } } };
    assert.equal(T.avvia({ document: finto }), null, 'senza html.app-shell non tocca la pagina');
    assert.equal(T.avvia({}), null);
});
