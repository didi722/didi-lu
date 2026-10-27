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

test('scorre da sola ogni pochi secondi (e dopo un gesto a mano aspetta di più)', () => {
    assert.ok(K.PASSO_AUTO >= 3000 && K.PASSO_AUTO <= 8000);
    assert.ok(K.RIPRENDI_DOPO > K.PASSO_AUTO, 'dopo un gesto l\'automatismo aspetta più di un giro');
});

test('matches.html pubblica la classifica; nell\'app l\'elenco del sito si nasconde, "Registered teams" non si vede e i showdown li disegna app-matches.js', () => {
    assert.match(docs('matches.html'), /AppSito\.pubblica\('classifica'/);
    assert.deepEqual(require('../docs/app.js').SCRIPT_PAGINE['matches.html'], ['app-carosello.js', 'altezze-pkm.js', 'scala-pkm.js', 'app-classifica.js', 'app-matches.js']);
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /html\.app-shell\.app-classifica body\.pg-matches #participants-list\{display:none\}|html\.app-shell\.app-classifica body\.pg-matches #participants-list \{ ?display: none/);
    assert.match(css, /\.cl-laterale \.cl-apri \{ display: none !important; \}/, 'via "Full table"');
    assert.match(css, /body\.pg-matches #matchList \{ display: none !important; \}/, 'le schede del sito non si vedono: ci sono le locandine');
    assert.match(css, /\.btn-registered-teams[^{]*\{[^}]*display: none/);
    const righe = css.split('\n').filter(r => /\.ac-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 10, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
});

test('avvia: fuori dall\'app non fa niente', () => {
    assert.equal(K.avvia({ document: { documentElement: { classList: { contains: () => false } } } }), null);
    assert.equal(K.avvia({}), null);
});

// ---------- la classifica sta in una delle due schermate di Matches (SHOWDOWNS | RANKINGS): scorre e si mette in scala solo da aperta ----------

/** Una pagina finta quanto basta per far partire avvia(): la classifica con le sue schede, i ticchettii del timer, gli eventi del documento */
function paginaClassifica({ tab }) {
    const ascoltatori = {};
    const timer = new Map();
    let idTimer = 0;
    const registro = { scale: 0, centro: null };
    const pezzo = (extra = {}) => ({ style: { setProperty() {} }, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, addEventListener() {}, setAttribute() {}, removeAttribute() {}, querySelector: () => null, querySelectorAll: () => [], clientHeight: 100, offsetWidth: 100, ...extra });
    const carte = [0, 1, 2].map(i => pezzo({
        dataset: { i: String(i) },
        classList: { toggle: (c, v) => { if (c === 'ac-centro' && v) registro.centro = i; }, add() {}, contains: () => false },
        querySelector: sel => ({ '.ac-avatar': pezzo(), '.ac-pkm': pezzo(), '.ac-palco': pezzo(), '.pal-pedana': pezzo(), '.ac-scena': pezzo() }[sel] || null)
    }));
    const pista = pezzo({ querySelectorAll: () => carte });
    const scheda = pezzo({ querySelector: sel => (sel === '.ac-pista' ? pista : null), querySelectorAll: () => carte });
    const corpo = pezzo({ appendChild() {} });
    const doc = {
        documentElement: { classList: { contains: c => c === 'app-shell', add() {} }, getAttribute: n => (n === 'data-mt' ? tab.valore : null) },
        hidden: false,
        querySelector: sel => (sel === '.participants-card .cl-corpo' ? corpo : null),
        getElementById: () => null,
        createElement: () => scheda,
        addEventListener: (t, f) => { (ascoltatori[t] = ascoltatori[t] || []).push(f); }
    };
    const win = {
        document: doc,
        AppSito: { datiPagina: () => null },
        ScalaPkm: { scena: () => { registro.scale++; return Promise.resolve(); } },
        SpritePkm: { gif: s => `sprites/ani/${s}.gif` },
        getComputedStyle: () => ({ bottom: '0px' }),
        addEventListener() {},
        setInterval: f => { timer.set(++idTimer, f); return idTimer; },
        clearInterval: id => { timer.delete(id); }
    };
    const dati = { giocatori: [0, 1, 2].map(i => ({ nome: 'P' + i, posizione: i + 1, pkm: 'Gengar' })) };
    return {
        win, registro, timer, dati,
        evento: (tipo, detail) => (ascoltatori[tipo] || []).forEach(f => f({ detail })),
        tic: () => [...timer.values()].forEach(f => f())
    };
}

test('classifica nascosta (l\'app apre SHOWDOWNS): niente scala (senza misure i Pokémon compagni resterebbero invisibili) e niente scorrimento; si apre RANKINGS: si mette in scala e scorre da adesso', () => {
    const tab = { valore: 'sd' };
    const p = paginaClassifica({ tab });
    const c = K.avvia(p.win);
    c.monta(p.dati);
    assert.equal(p.registro.scale, 0, 'nascosta non si misura');
    assert.equal(p.timer.size, 0, 'nascosta non scorre');
    assert.equal(p.registro.centro, 0);
    tab.valore = 'rk';
    p.evento('app-tab', 'rk');
    assert.equal(p.registro.scale, 3, 'ora i Pokémon compagni (uno per scheda) si mettono in scala');
    assert.equal(p.timer.size, 1, 'lo scorrimento comincia');
    p.tic();
    assert.equal(p.registro.centro, 1, 'dopo un giro passa al secondo');
});

test('classifica: lasciata RANKINGS lo scorrimento si ferma, e a ogni ritorno si riparte dal primo in classifica', () => {
    const tab = { valore: 'rk' };
    const p = paginaClassifica({ tab });
    const c = K.avvia(p.win);
    c.monta(p.dati);
    assert.equal(p.registro.scale, 3, 'già aperta all\'avvio (la schermata ricordata): si mette in scala subito');
    assert.equal(p.timer.size, 1);
    p.tic(); p.tic();
    assert.equal(p.registro.centro, 2);
    tab.valore = 'sd';
    p.evento('app-tab', 'sd');
    assert.equal(p.timer.size, 0, 'sui showdown la classifica sta ferma');
    p.tic();
    assert.equal(p.registro.centro, 2, 'e non va avanti da nascosta');
    tab.valore = 'rk';
    p.evento('app-tab', 'rk');
    assert.equal(p.registro.centro, 0, 'riparte dal primo');
    assert.equal(p.timer.size, 1);
    p.evento('app-tab', 'rk');
    assert.equal(p.timer.size, 1, 'un solo timer, anche se l\'evento arriva due volte');
    p.tic();
    assert.equal(p.registro.centro, 1);
    // dati nuovi mentre si guarda un'altra schermata non rimettono in moto niente
    tab.valore = 'sd'; p.evento('app-tab', 'sd');
    c.monta(p.dati);
    assert.equal(p.timer.size, 0);
});

test('app-matches.js: cambiando schermata dice "app-tab" (la classifica e le misure dei compagni lo ascoltano), e aprendo i SHOWDOWNS le locandine si rimettono in scala', () => {
    const m = docs('app-matches.js');
    assert.match(m, /doc\.dispatchEvent\(new win\.CustomEvent\('app-tab', \{ detail: tab \}\)\)/);
    assert.match(m, /doc\.addEventListener\('app-tab', e => \{ if \(e && e\.detail === 'sd'\) scalaPoster\(\); \}\)/);
    assert.match(docs('app-classifica.js'), /doc\.addEventListener\('app-tab', e => \{ if \(!e\) return; if \(e\.detail === 'rk'\) entra\(\); else fermaAuto\(\); \}\)/);
});
