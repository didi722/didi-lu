'use strict';
// La finestra di iscrizione a una stagione aperta (index.html): il riepilogo della stagione e "Confirm & Join".
// Ora è una finestra come le altre del sito (striscia nera con i tre pallini, carta, X gialla) e segue il tema del giocatore.
// Qui: la scadenza che il riepilogo racconta (funzione vera, estratta dalla pagina), il markup che la pagina scrive e lo stile.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const index = docs('index.html');
const finestre = docs('finestre.css');
const stileIndex = docs('style-index.css');

// la funzione della pagina, provata da sola
const da = index.indexOf('function descriviScadenzaIscrizioni');
assert.ok(da > 0, 'index.html ha descriviScadenzaIscrizioni');
const fine = index.indexOf('\n}\n', da) + 3;
const { descriviScadenzaIscrizioni: scadenza } = vm.runInNewContext(`${index.slice(da, fine)}\n({ descriviScadenzaIscrizioni })`, {});
const ADESSO = Date.UTC(2026, 9, 3, 12, 0, 0);
const tra = ms => new Date(ADESSO + ms).toISOString();
const ORA = 3600000, GIORNO = 24 * ORA;

test('scadenza: la data e quanto manca, in giorni o in ore; chiusa se è passata; niente se la data non c\'è o non è valida', () => {
    const tre = scadenza(tra(3 * GIORNO + 5 * ORA), ADESSO);   // (oggetto di un altro contesto: si confrontano i campi)
    assert.equal(tre.data, '6 Oct 2026');
    assert.equal(tre.resta, '3 days left');
    assert.equal(scadenza(tra(GIORNO + ORA), ADESSO).resta, '1 day left');
    assert.equal(scadenza(tra(5 * ORA), ADESSO).resta, '5 hours left');
    assert.equal(scadenza(tra(ORA + 60000), ADESSO).resta, '1 hour left');
    assert.equal(scadenza(tra(-ORA), ADESSO).resta, 'closed');
    assert.equal(scadenza(tra(0), ADESSO).resta, 'closed');
    for (const vuoto of [undefined, null, '', 'non è una data']) assert.equal(scadenza(vuoto, ADESSO), null, String(vuoto));
});

test('la finestra: velo, finestra con la X, titolo, riepilogo e i due tasti; si chiude con la X, "Not now" o il velo', () => {
    assert.match(index, /<div id="modal-overlay" class="iscr-velo" onclick="toggleIscrizioneModal\(\)"><\/div>/);
    const apertura = index.slice(index.indexOf('<div id="modal-iscrizione"'), index.indexOf('<script>', index.indexOf('<div id="modal-iscrizione"')));
    assert.match(apertura, /role="dialog"/);
    assert.match(apertura, /<div class="iscr-finestra">/);
    assert.match(apertura, /<span class="iscr-chiudi"[^>]*onclick="toggleIscrizioneModal\(\)"/);
    assert.match(apertura, /<h3 id="modal-season-name">/);
    assert.match(apertura, /<div id="modal-season-rules"><\/div>/);
    assert.match(apertura, /<button id="btn-conferma-iscrizione" class="btn-save">Confirm &amp; Join<\/button>|<button id="btn-conferma-iscrizione" class="btn-save">Confirm & Join<\/button>/);
    assert.match(apertura, /<button onclick="toggleIscrizioneModal\(\)" class="btn-cancel">Not now<\/button>/);
});

test('il riepilogo: formati (ognuno con il suo tooltip) e numeri della stagione, più la scadenza se c\'è', () => {
    assert.match(index, /<section class="iscr-scheda iscr-formati">/);
    assert.match(index, /<ul class="neubru-format-list">/);
    assert.match(index, /class="format-has-rules" data-format-idx="\$\{idx\}"/, 'le voci a cui attivaTooltipFormati attacca le regole');
    assert.match(index, /<section class="iscr-scheda iscr-numeri">/);
    for (const voce of ['Registered players', 'Showdowns per format', 'Showdowns per opponent', 'Teams per format', 'Registrations close']) assert.ok(index.includes(`'${voce}'`), voce);
    assert.match(index, /limit > 0 \? `of \$\{limit\}` : ''/, 'i posti, se la stagione ha un limite');
    assert.match(index, /teamsPerFormato > 0 \? dato\('Teams per format'/);
    assert.match(index, /scadenza \? dato\('Registrations close', scadenza\.data, scadenza\.resta, 'iscr-scadenza'\)/);
    // il nome della stagione entra come testo (prima finiva in innerHTML)
    assert.match(index, /getElementById\('modal-season-name'\)\.textContent = `Register to: \$\{seasonName\}`/);
    assert.doesNotMatch(index, /neubru-title-badge|neubru-content-card|neubru-floating-label|neubru-stat-value/);
});

test('lo stile: la striscia e la carta sono quelle delle altre finestre, la X è gialla, il titolo è il cartellino nero', () => {
    assert.match(finestre, /#modal-iscrizione \.iscr-finestra, #replayModal \.replay-mini-header/, 'la striscia nera con i pallini');
    assert.match(finestre, /\.sfida-card,\s*#modal-iscrizione \.iscr-finestra \{\s*box-sizing: border-box;[^}]*var\(--nb-tip-bg/, 'la carta con la mezzatinta');
    assert.match(finestre, /#modal-iscrizione \{ --fin-etichetta: "SEASON REGISTRATION"; \}/);
    assert.match(finestre, /#modal-iscrizione \.iscr-chiudi \{[^}]*background: var\(--nb-giallo/);
    assert.match(finestre, /#modal-iscrizione #modal-season-name \{[^}]*background: var\(--nb-ink, #000\)[^}]*color: #fff/);
    assert.match(finestre, /#modal-iscrizione \.iscr-scadenza \{ grid-column: 1 \/ -1; background: var\(--nb-giallo/);
    assert.match(finestre, /\.iscr-velo \{[^}]*blur\(7px\)/);
    // il vecchio stile sospeso sullo sfondo è sparito dal foglio della pagina
    assert.doesNotMatch(stileIndex, /\.neubru-(?:grid|col|content-card|floating-label|stat-value|btn-confirm|title-badge)/);
    assert.match(stileIndex, /\.neubru-format-list li\.format-has-rules/, 'il tooltip dei formati resta');
});

test('lo stile segue il tema: colori, ombre, angoli e caratteri, mai le misure', () => {
    const inizio = finestre.indexOf('/* ---------- Iscrizione a una stagione aperta');
    const blocco = finestre.slice(inizio, finestre.indexOf('/* ---------- Replay di una partita'));
    assert.ok(blocco.length > 500, 'il blocco c\'è');
    for (const v of ['--nb-ink', '--nb-carta', '--nb-tip-bg', '--nb-giallo', '--nb-verde', '--nb-rosso', '--nb-raggio', '--nb-font-titoli', '--nb-sh-s', '--nb-sh-m', '--nb-sh-titolo', '--nb-rot']) {
        assert.ok(blocco.includes(`var(${v}`), v);
    }
    const misure = blocco.match(/(?:width|height|padding|margin|gap|border(?:-[a-z]+)?):[^;]*var\(--nb-(?!ink|carta|tip-bg|giallo|verde|rosso)[^)]*\)/g) || [];
    assert.deepEqual(misure.filter(m => !/raggio/.test(m)), [], misure.join(' | '));   // gli angoli sono del tema, le misure no
});

test('telefono: la finestra scorre con il velo, il riepilogo va in colonna; il desktop ha la sua larghezza solo sopra i 900px', () => {
    const inizio = finestre.indexOf('/* ---------- Iscrizione a una stagione aperta');
    const blocco = finestre.slice(inizio, finestre.indexOf('/* ---------- Replay di una partita'));
    assert.match(blocco, /@media \(min-width: 901px\) \{\s*#modal-iscrizione \{ max-width: 740px; padding: 0; \}/, 'sotto i 900px restano le misure di style-index.css (il velo a tutto schermo con il suo padding)');
    const tel = blocco.slice(blocco.indexOf('@media (max-width: 900px)'));
    assert.match(tel, /\.iscr-riepilogo \{ grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(tel, /\.iscr-finestra \{ max-height: none/);
    assert.match(tel, /#modal-season-rules \{ overflow: visible/);
});
