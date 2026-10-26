'use strict';
// Le Statistiche dell'app (docs/app-stats.js): un allenatore, un team o un Pokémon alla volta, ordinati per il numero scelto.
//   - la parte pura: le colonne delle tessere, cosa fa ripartire dal primo, l'HTML della carta, dei controlli e dei numeri;
//   - il collegamento con stats.js (che pubblica il modello) e con i controlli della pagina, che restano al loro posto;
//   - il foglio: la pagina del sito si nasconde solo nell'app.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/app-stats.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

const modello = () => ({
    tab: 'players', stagione: 'all', formato: '', ordine: { id: 'elo', dir: -1 }, grande: 'elo', tessere: ['punti', 'sets', 'win'], totale: 2,
    tabs: [{ id: 'players', titolo: 'Players' }, { id: 'teams', titolo: 'Teams' }],
    stagioni: [{ valore: 'all', testo: 'Global (all seasons)' }, { valore: 's1', testo: 'Season <1>' }],
    formati: [{ valore: '', testo: 'All formats' }],
    parametri: [{ id: 'elo', titolo: 'Elo', tip: 'Rating' }, { id: 'punti', titolo: 'Points' }],
    righe: [
        { posizione: 1, nome: 'Didi', sotto: 'Champion', colore: '#31c489', testa: '<img class="as-avatar" src="a.png">', valori: { elo: { titolo: 'Elo', html: '1,032' }, punti: { titolo: 'Points', html: '0' }, sets: { titolo: 'Sets', html: '23 - 16', sotto: '<small class="sub">+7</small>' }, win: { titolo: 'Win %', html: '62.5%' } } },
        { posizione: 2, nome: '<b>Lukiani</b>', colore: 'rosso', testa: '', valori: { elo: { titolo: 'Elo', html: '990' }, punti: { titolo: 'Points', html: '3' } } }
    ]
});

test('firma: cambiando categoria, stagione, formato o ordinamento si riparte dal primo; con gli stessi si resta dov\'si è', () => {
    const m = modello();
    const f = S.firma(m);
    assert.equal(S.firma(modello()), f);
    for (const cambio of [m => { m.tab = 'teams'; }, m => { m.stagione = 's1'; }, m => { m.formato = 'ou'; }, m => { m.ordine.id = 'punti'; }, m => { m.ordine.dir = 1; }]) {
        const altro = modello(); cambio(altro);
        assert.notEqual(S.firma(altro), f);
    }
    assert.doesNotThrow(() => S.firma({}));
});

test('htmlCarta: posizione, nome e SOLO il numero scelto, in grande; niente tessere con gli altri; il testo del sito non apre tag; colori sicuri', () => {
    const m = modello();
    const h = S.htmlCarta(m.righe[0], m, 0);
    assert.match(h, /class="as-carta" data-i="0" style="--c:#31c489"/);
    assert.match(h, /<span class="as-pos">#1<\/span>/);
    assert.match(h, /<b class="as-nome nome-scorrevole">Didi<\/b>/);
    assert.match(h, /<small class="as-sotto">Champion<\/small>/);
    assert.match(h, /<span class="as-et">Elo<\/span><span class="as-val">1,032<\/span>/);
    assert.match(h, /<span class="pal-aura"/);
    assert.match(h, /class="as-palco as-v-players"/);
    assert.doesNotMatch(h, /as-dato|as-dati|Points|Sets|Win %/, 'gli altri numeri non ci sono: si guarda quello scelto');
    const b = S.htmlCarta(m.righe[1], m, 1);
    assert.match(b, /&lt;b&gt;Lukiani&lt;\/b&gt;/, 'il nome è testo, non HTML');
    assert.match(b, /--c:#b388eb/, 'un colore che non è un colore torna quello di base');
    assert.doesNotMatch(b, /as-sotto/);
    assert.match(S.htmlCarta({ nome: 'X' }, m, 5), /data-i="5"[\s\S]*#6/, 'senza posizione si conta dal posto');
    assert.doesNotMatch(S.htmlCarta({ nome: 'X' }, { grande: 'zz', tab: 'players' }, 0), /undefined/, 'senza il numero scelto non rompe');
});

test('htmlBarra e htmlParametri: la categoria, la stagione e il formato in alto; i numeri con cui ordinare, quello attivo col verso', () => {
    const m = modello();
    const b = S.htmlBarra(m);
    assert.match(b, /class="as-t attivo"[^>]*aria-selected="true"[^>]*data-tab="players"/);
    assert.match(b, /data-tab="teams"/);
    assert.match(b, /<select class="as-sel" id="as-stagione"[\s\S]*<option value="all" selected>Global \(all seasons\)<\/option>/);
    assert.match(b, /Season &lt;1&gt;/, 'anche i nomi delle stagioni sono testo');
    assert.match(b, /id="as-formato"/);
    const p = S.htmlParametri(m);
    assert.match(p, /class="as-p attivo" data-ordina="elo" aria-pressed="true" title="Rating"[^>]*>Elo<i aria-hidden="true">▼<\/i>/);
    assert.match(p, /data-ordina="punti" aria-pressed="false"[^>]*>Points<\/button>/);
    m.ordine.dir = 1;
    assert.match(S.htmlParametri(m), /▲/);
    assert.equal(S.htmlParametri({}), '');
});

test('stats.js pubblica il modello a ogni cambiamento (e stats.html carica gli script giusti); il sito da PC non cambia', () => {
    const js = docs('stats.js');
    assert.match(js, /function pubblicaApp\(/);
    assert.match(js, /function pubblicaApp\(righe\) \{\s*if \(!window\.AppSito\) return;/, 'solo se l\'app c\'è');
    assert.match(js, /AppSito\.pubblica\('stats'/);
    // i controlli che l'app fa scattare esistono ancora nella pagina
    const html = docs('stats.html') + js;
    for (const sel of ['sel-stagione', 'sel-formato', 'stats-ordina', 'stats-tag', 'data-tab', 'data-ordina']) assert.ok(html.includes(sel), `manca ${sel}`);
    assert.match(docs('app-stats.js'), /'\.stats-tag \.tag\[data-tab="' \+ id \+ '"\]'/);
    assert.match(docs('app-stats.js'), /'#stats-ordina \[data-ordina="' \+ id \+ '"\]'/);
});

test('niente frecce né conto: si scorre col dito; il foglio: nell\'app la pagina del sito si nasconde e resta nella pagina (i controlli si azionano da codice); regole solo sotto html.app-shell', () => {
    const css = docs('app-gioco-pagine.css');
    assert.doesNotMatch(docs('app-stats.js'), /as-pie|as-freccia|data-passo|as-conta/);
    assert.match(css, /html\.app-shell\.app-stats body\.pg-stats main\.stats-pagina \{ display: none !important; \}/);
    assert.match(css, /html\.app-shell\.app-stats, html\.app-shell\.app-stats body \{ overflow: hidden !important; \}/);
    const righe = css.split('\n').filter(r => /\.as-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 20, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
});

test('avvia: fuori dall\'app non fa niente', () => {
    assert.equal(S.avvia({ document: { documentElement: { classList: { contains: () => false } } } }), null);
    assert.equal(S.avvia({}), null);
});

test('team: un Pokémon alla volta, che passa al successivo e dopo l\'ultimo riparte dal primo; i nomi lunghi scorrono', () => {
    assert.equal(S.prossimoMini(0, 6), 1);
    assert.equal(S.prossimoMini(5, 6), 0);
    assert.equal(S.prossimoMini(3, 0), 0);
    assert.ok(S.PASSO_TEAM >= 1500);
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /\.as-mini \{ display: none;/);
    assert.match(css, /\.as-mini\.attivo \{ display: block;/);
    assert.match(css, /\.nome-scorrevole\.ns-attivo > \.ns-testo \{ animation: nomeScorrevole/);
});
