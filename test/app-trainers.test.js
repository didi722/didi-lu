'use strict';
// La pagina Trainers dell'app (docs/app-trainers.js): gli allenatori a scheda, uno alla volta; la pagina pubblica non c'è più.
//   - la parte pura: quale allenatore si apre, trofei, badge, la scheda;
//   - il collegamento con players.html (che pubblica i dati) e col carosello;
//   - il foglio e la pagina pubblica che rimanda qui.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../docs/app-trainers.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

const lista = [
    { id: 'didi', nome: 'Didi', posizione: 1, classificato: true, elo: 1032.4, colore: '#31c489', avatar: 'a.png', pkm: 'garchomp', titolo: 'Champion', stagioniVinte: 2 },
    { id: 'lukiani', nome: 'Lukiani', posizione: 2, classificato: true, elo: 990, colore: 'rosso', pkm: '' },
    { id: 'anna', nome: 'Anna <3>', posizione: 0, classificato: false }
];

test('indiceIniziale: ?player=nome apre quell\'allenatore (maiuscole a parte); senza nome o con uno che non c\'è si parte dal primo', () => {
    assert.equal(T.indiceIniziale(lista, ''), 0);
    assert.equal(T.indiceIniziale(lista, 'lukiani'), 1);
    assert.equal(T.indiceIniziale(lista, '  LUKIANI '), 1);
    assert.equal(T.indiceIniziale(lista, 'Anna <3>'), 2, 'anche per nome');
    assert.equal(T.indiceIniziale(lista, 'nessuno'), 0);
    assert.equal(T.indiceIniziale([], 'didi'), 0);
    assert.equal(T.indiceIniziale(null, 'didi'), 0);
});

test('htmlTrofei: una coppa per tipo di stagione col numero; senza il dettaglio, quella delle stagioni vinte; senza niente, lo dice', () => {
    const per = T.htmlTrofei({ trofei: [{ tipo: 'league', conteggio: 2, etichetta: 'League' }, { tipo: 'cup', conteggio: 1, etichetta: 'Cup <x>', icona: 'cup.png' }] });
    assert.equal((per.match(/class="at-coppa"/g) || []).length, 2);
    assert.match(per, /<b>x2<\/b>/);
    assert.match(per, /src="cup\.png"/);
    assert.match(per, /title="Cup &lt;x&gt;"/);
    assert.match(T.htmlTrofei({ stagioniVinte: 3 }), /title="Seasons won"[\s\S]*<b>x3<\/b>/);
    assert.match(T.htmlTrofei({}), /No trophies yet/);
    assert.match(T.htmlTrofei({ trofei: [] }), /No trophies yet/);
});

test('htmlBadge: una medaglia per badge col livello; senza immagine l\'icona; senza badge lo dice', () => {
    const h = T.htmlBadge({ badge: [{ nome: 'Clean', livello: 'gold', img: 'g.png', icona: '🧹' }, { nome: 'Win "x"', livello: 'bronze', img: 'b.png' }] });
    assert.equal((h.match(/class="at-badge/g) || []).length, 2);
    assert.match(h, /at-badge at-lv-gold" title="Clean · Gold"/);
    assert.match(h, /title="Win &quot;x&quot; · Bronze"/);
    assert.match(h, /🧹/);
    assert.match(T.htmlBadge({}), /No badges yet/);
});

test('htmlCarta: posizione, nome, Elo (N/A senza classifica), trofei e badge; il Pokémon preferito solo se c\'è; testo sempre ripulito', () => {
    const gif = s => 'gif/' + s + '.gif';
    const a = T.htmlCarta(lista[0], 0, { gif });
    assert.match(a, /class="at-carta" data-i="0" style="--c:#31c489"/);
    assert.match(a, /<span class="at-pos">#1<\/span><b class="at-nome">Didi<\/b>/);
    assert.match(a, /<span class="at-titolo">Champion<\/span>/);
    assert.match(a, /<div class="at-elo"><b>1032<\/b><small>Elo<\/small><\/div>/);
    assert.match(a, /class="at-pkm" draggable="false" src="gif\/garchomp\.gif"/);
    assert.match(a, /class="at-allenatore" draggable="false" src="a\.png"/);
    const b = T.htmlCarta(lista[1], 1, { gif });
    assert.doesNotMatch(b, /at-pkm/, 'senza Pokémon preferito niente immagine');
    assert.match(b, /--c:#31c489/, 'colore non valido: quello di base');
    assert.match(b, /src="immagini\/magikarp\.png"/, 'senza avatar il Magikarp');
    const c = T.htmlCarta(lista[2], 2, { gif });
    assert.match(c, /<span class="at-pos">–<\/span><b class="at-nome">Anna &lt;3&gt;<\/b>/);
    assert.match(c, /<b class="at-na">N\/A<\/b>/);
    assert.doesNotMatch(T.htmlCarta(lista[0], 0), /at-pkm/, 'senza lo strumento per le immagini animate non rompe');
});

test('players.html pubblica gli allenatori in classifica e non offre più la sfida amichevole nell\'app; la pagina pubblica rimanda qui', () => {
    const html = docs('players.html');
    assert.match(html, /AppSito\.pubblica\('trainers'/);
    assert.match(docs('app.js'), /RIMANDI = \{ 'public\.html': 'players\.html' \}/);
    // le sfide amichevoli partono da Practice: nell'app l'elenco del sito (con le spade per sfidare) non si vede, resta solo il carosello
    assert.match(docs('app-gioco-pagine.css'), /html\.app-shell\.app-trainers body\.pg-players #wrapper, html\.app-shell\.app-trainers body\.pg-players #trainers-grid \{ display: none !important; \}/);
    assert.match(docs('app-trainers.js'), /ArrowRight/);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'public.html')), 'sul sito da PC la pagina pubblica c\'è ancora');
});

test('il foglio: la scheda a carosello, tutto sotto html.app-shell', () => {
    const css = docs('app-gioco-pagine.css');
    const righe = css.split('\n').filter(r => /\.at-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 20, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
});

test('avvia: fuori dall\'app non fa niente', () => {
    assert.equal(T.avvia({ document: { documentElement: { classList: { contains: () => false } } } }), null);
    assert.equal(T.avvia({}), null);
});
