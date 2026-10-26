'use strict';
// La classifica di Matches nell'app (docs/app-classifica.js): il primo in grande, sotto i due che seguono; si scorre, dall'ultimo si torna al primo.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../docs/app-classifica.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

const g = (n, extra = {}) => ({ nome: n, posizione: 1, punti: 10, sdWon: 2, sdLost: 1, won: 7, lost: 3, colore: '#31c489', avatar: n + '.png', ...extra });
const lista = [g('Didi'), g('Lukiani', { posizione: 2 }), g('Anna', { posizione: 3 }), g('Bea <x>', { posizione: 4 })];

test('indirizzo e righeDati: dove porta e cosa si legge sotto il nome', () => {
    assert.equal(K.indirizzo(' Anna Maria '), 'players.html?player=Anna%20Maria');
    assert.deepEqual(K.righeDati({ sdWon: 3, sdLost: 1, won: 9, lost: 4 }), { sd: 'SD 3-1', match: 'MATCH 9-4' });
    assert.deepEqual(K.righeDati({}), { sd: 'SD 0-0', match: 'MATCH 0-0' });
});

test('htmlGrande: posizione, avatar, nome, numeri e punti; il tasto per sfidare solo se c\'è; il nome è testo', () => {
    const h = K.htmlGrande(lista[3], '<button class="vs">VS</button>');
    assert.match(h, /href="players\.html\?player=Bea%20%3Cx%3E"/);
    assert.match(h, /Bea &lt;x&gt;/);
    assert.match(h, /<span class="ac-pos">#4<\/span>/);
    assert.match(h, /<small>SD 2-1<\/small><small>MATCH 7-3<\/small>/);
    assert.match(h, /<span class="ac-punti"><b>10<\/b><small>PTS<\/small><\/span>/);
    assert.match(h, /<span class="ac-vs"><button class="vs">VS<\/button><\/span>/);
    assert.doesNotMatch(K.htmlGrande(lista[0], ''), /ac-vs/);
    assert.match(K.htmlGrande({ nome: 'X', colore: 'no' }, ''), /--c:#31c489/);
    assert.match(K.htmlGrande({ nome: 'X' }, ''), /src="immagini\/magikarp\.png"/);
});

test('html: il giocatore al centro, i due successivi sotto (dall\'ultimo si ricomincia), il conto e le frecce se sono più di uno', () => {
    const h = K.html(lista, 0);
    assert.match(h, /class="ac-grande"[\s\S]*Didi/);
    assert.deepEqual([...h.matchAll(/data-vai="(\d+)"/g)].map(m => Number(m[1])), [1, 2]);
    assert.match(h, /<span class="ac-conta" aria-live="polite">1 \/ 4<\/span>/);
    const fine = K.html(lista, 3);
    assert.deepEqual([...fine.matchAll(/data-vai="(\d+)"/g)].map(m => Number(m[1])), [0, 1], 'dopo l\'ultimo c\'è il primo');
    assert.match(fine, /4 \/ 4/);
    assert.deepEqual([...K.html(lista, -1).matchAll(/data-vai="(\d+)"/g)].map(m => Number(m[1])), [0, 1], 'un indice fuori fila torna dentro');
    const due = K.html(lista.slice(0, 2), 0);
    assert.deepEqual([...due.matchAll(/data-vai="(\d+)"/g)].map(m => Number(m[1])), [1], 'con due giocatori ne compare uno sotto');
    const solo = K.html(lista.slice(0, 1), 0);
    assert.doesNotMatch(solo, /ac-piccoli|ac-nav/, 'da soli niente comandi');
    assert.match(K.html([], 0), /No players registered in this season/);
    assert.match(K.html(lista, 0, { vs: n => `<i>${n}</i>` }), /<span class="ac-vs"><i>Didi<\/i><\/span>/);
});

test('matches.html pubblica la classifica; nell\'app l\'elenco del sito si nasconde e "Registered teams" non si vede', () => {
    assert.match(docs('matches.html'), /AppSito\.pubblica\('classifica'/);
    assert.deepEqual(require('../docs/app.js').SCRIPT_PAGINE['matches.html'], ['app-carosello.js', 'app-classifica.js']);
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /html\.app-shell\.app-classifica body\.pg-matches #participants-list\{display:none\}|html\.app-shell\.app-classifica body\.pg-matches #participants-list \{ ?display: none/);
    assert.match(css, /\.btn-registered-teams[^{]*\{[^}]*display: none/);
    const righe = css.split('\n').filter(r => /\.ac-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 10, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
});

test('avvia: fuori dall\'app non fa niente', () => {
    assert.equal(K.avvia({ document: { documentElement: { classList: { contains: () => false } } } }), null);
    assert.equal(K.avvia({}), null);
});
