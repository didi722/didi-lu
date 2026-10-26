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

test('htmlCarta: posizione, avatar sul palco, nome, punti e numeri; il tasto per sfidare solo se c\'è; il nome è testo; niente sfondo (la scheda non ha classi di riquadro)', () => {
    const h = K.htmlCarta(lista[3], 3, '<button class="vs">VS</button>');
    assert.match(h, /class="ac-carta" data-i="3" style="--c:#31c489"/);
    assert.match(h, /href="players\.html\?player=Bea%20%3Cx%3E"/);
    assert.match(h, /Bea &lt;x&gt;/);
    assert.match(h, /<span class="pal-aura"/);
    assert.match(h, /<span class="pal-pedana"/);
    assert.match(h, /<img class="ac-avatar"/);
    assert.match(h, /<span class="ac-pos">#4<\/span>/);
    assert.match(h, /<span class="ac-punti"><b>10<\/b><small>PTS<\/small><\/span>/);
    assert.match(h, /SD 2-1 · MATCH 7-3/);
    assert.match(h, /<span class="ac-vs"><button class="vs">VS<\/button><\/span>/);
    assert.doesNotMatch(K.htmlCarta(lista[0], 0, ''), /ac-vs/);
    assert.match(K.htmlCarta({ nome: 'X', colore: 'no' }, 0, ''), /--c:#31c489/);
    assert.match(K.htmlCarta({ nome: 'X' }, 0, ''), /src="immagini\/magikarp\.png"/);
});

test('html: una scheda per giocatore, tutte nella pista (se ne vede una, le altre stanno ai lati); senza giocatori lo dice; niente conto e niente frecce', () => {
    const h = K.html(lista, { vs: n => `<i>${n}</i>` });
    assert.equal((h.match(/class="ac-carta"/g) || []).length, 4);
    assert.match(h, /^<div class="ac-pista">/);
    assert.match(h, /<span class="ac-vs"><i>Didi<\/i><\/span>/);
    assert.doesNotMatch(h, /ac-nav|ac-freccia|ac-conta|data-passo/, 'niente frecce né 1 / 4: si scorre col dito');
    assert.match(K.html([]), /No players registered in this season/);
    assert.match(K.html(null), /No players registered in this season/);
});

test('scorre da sola ogni pochi secondi (e dopo un gesto a mano aspetta di più); un avatar per ogni lato delle schede dei showdown', () => {
    assert.ok(K.PASSO_AUTO >= 3000 && K.PASSO_AUTO <= 8000);
    assert.ok(K.RIPRENDI_DOPO > K.PASSO_AUTO, 'dopo un gesto l\'automatismo aspetta più di un giro');
    assert.equal(K.avatarDi(lista, ' ANNA '), 'Anna.png', 'senza badare alle maiuscole');
    assert.equal(K.avatarDi(lista, 'nessuno'), 'immagini/magikarp.png');
    const h = K.htmlPalcoShowdown(lista, 'Didi');
    assert.match(h, /<span class="sd-palco" aria-hidden="true"><span class="pal-aura"><\/span><span class="pal-pedana"><\/span><img class="sd-avatar" draggable="false" src="Didi\.png"/);
});

test('matches.html pubblica la classifica; nell\'app l\'elenco del sito si nasconde e "Registered teams" non si vede', () => {
    assert.match(docs('matches.html'), /AppSito\.pubblica\('classifica'/);
    assert.deepEqual(require('../docs/app.js').SCRIPT_PAGINE['matches.html'], ['app-carosello.js', 'app-classifica.js']);
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /html\.app-shell\.app-classifica body\.pg-matches #participants-list\{display:none\}|html\.app-shell\.app-classifica body\.pg-matches #participants-list \{ ?display: none/);
    assert.match(css, /\.cl-laterale \.cl-apri \{ display: none !important; \}/, 'via "Full table"');
    assert.match(css, /#matchList\.showdown-grid-double \{ display: flex !important; flex-wrap: nowrap;[^}]*scroll-snap-type: x mandatory/, 'i showdown scorrono di lato');
    assert.match(css, /\.btn-registered-teams[^{]*\{[^}]*display: none/);
    const righe = css.split('\n').filter(r => /\.ac-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 10, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
});

test('avvia: fuori dall\'app non fa niente', () => {
    assert.equal(K.avvia({ document: { documentElement: { classList: { contains: () => false } } } }), null);
    assert.equal(K.avvia({}), null);
});
