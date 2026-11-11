'use strict';
// Etichette dei team (etichette-team.js) e il loro cablaggio nel Box.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../docs/etichette-team.js');

const DEF = { a: { nome: 'Ladder', colore: '#FF0000' }, b: { nome: '  Torneo   ', colore: 'boh' }, c: { nome: '   ' }, d: null };

test('elenco: nomi puliti, colori validi, le etichette rotte si scartano, in ordine di nome', () => {
    const el = E.elenco(DEF);
    assert.deepEqual(el.map(e => e.id), ['a', 'b']);
    assert.equal(el[0].colore, '#ff0000');
    assert.equal(el[1].nome, 'Torneo');
    assert.equal(el[1].colore, E.COLORI[0], 'un colore sbagliato torna al colore di base');
    assert.deepEqual(E.elenco(null), []);
    assert.equal(E.pulisciNome('x'.repeat(50)).length, 20);
});

test('diTeam e corrisponde: solo le etichette che esistono ancora; filtro tutte / senza etichette / una', () => {
    const t1 = { etichette: { a: true, zzz: true } }, t2 = { etichette: { b: true } }, t3 = {};
    assert.deepEqual(E.diTeam(t1, DEF).map(e => e.id), ['a'], 'una etichetta cancellata non conta');
    assert.ok([t1, t2, t3].every(t => E.corrisponde(t, DEF, '')));
    assert.deepEqual([t1, t2, t3].map(t => E.corrisponde(t, DEF, 'a')), [true, false, false]);
    assert.deepEqual([t1, t2, t3].map(t => E.corrisponde(t, DEF, E.NESSUNA)), [false, false, true]);
    assert.ok(E.corrisponde({ etichette: { zzz: true } }, DEF, E.NESSUNA), 'con solo etichette cancellate è senza etichette');
});

test('coloreTesto e nuovoId', () => {
    assert.equal(E.coloreTesto('#ffd43b'), '#000');
    assert.equal(E.coloreTesto('#4c6ef5'), '#fff');
    assert.ok(!(E.nuovoId({ a: 1 }) in { a: 1 }));
});

test('cablaggio nel Box: filtro, pillole, tasto e finestra, dati sotto players', () => {
    const box = fs.readFileSync(path.join(__dirname, '..', 'docs', 'box.html'), 'utf8');
    assert.match(box, /<script src="etichette-team\.js"><\/script>/);
    assert.match(box, /<link rel="stylesheet" href="etichette-team\.css">/);
    assert.match(box, /id="labelFilter" onchange="applicaFiltri\(\)"/);
    assert.match(box, /EtichetteTeam\.corrisponde\(team, etichetteDef, etichetta\)/);
    assert.match(box, /apriEtichette\('\$\{team\.id\}'\)/);
    assert.match(box, /players\/\$\{playerID\}\/etichette`\)\.on\('value'/);
    assert.match(box, /\$\{base\}\/teams\/\$\{teamId\}\/etichette\/\$\{id\}/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'etichette-team.css')));
});

test('cablaggio nel Box: preferenze salvate (filtri, ordine, vista) e le tre viste', () => {
    const box = fs.readFileSync(path.join(__dirname, '..', 'docs', 'box.html'), 'utf8');
    assert.match(box, /<link rel="stylesheet" href="box-vista\.css">/);
    assert.match(box, /id="viewFilter"[\s\S]*value="griglia"[\s\S]*value="lista"[\s\S]*value="cartelle"/);
    // si salva a ogni applicaFiltri e si ripristina all'apertura, prima del primo disegno
    assert.match(box, /ultimiFiltrati = filtrati;[\s\S]*?salvaPreferenze\(\);\s*renderizza\(filtrati\);/);
    assert.match(box, /sortFilter\.value = 'win';\s*}\s*ripristinaPreferenze\(\);/);
    assert.match(box, /localStorage\.setItem\(chiavePrefs\(\)/);
    assert.match(box, /const chiavePrefs = \(\) => `boxPrefs:\$\{playerID\}`/, 'per giocatore');
    // la lista e le cartelle
    assert.match(box, /vistaBox === 'cartelle'\) return renderizzaCartelle\(/);
    assert.match(box, /classList\.toggle\('vista-lista'/);
    assert.match(box, /function apriCartella\(cat\)/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'box-vista.css')));
});
