'use strict';
// Matches nell'app (docs/app-matches.js): due schermate (SHOWDOWNS | RANKINGS), i showdown come locandine "VS" e la finestra del showdown con i team.
//   - la parte pura: l'HTML delle locandine e dei tag, gli avatar per nome;
//   - la pagina: matches.html passa i showdown, il foglio dell'app li mostra a carosello e nasconde le schede del sito.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../docs/app-matches.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

const sd = (id, extra = {}) => ({
    id, formato: 'VGC', data: '2026-10-04', partite: 3, vince: 1,
    p1: { nome: 'Didi', colore: '#31c489', avatar: 'immagini/profile/3.png', vinti: 2 },
    p2: { nome: 'Lu <b>', colore: 'x', avatar: '', vinti: 1 },
    ...extra
});

test('htmlPoster: formato in alto, i due allenatori sul palco tondo nel loro colore, in mezzo VS e punteggio, la data in fondo; il vincitore ha il WIN, chi perde si spegne', () => {
    const h = K.htmlPoster(sd('a1'), 0);
    assert.match(h, /^<article class="mp-carta" data-i="0" data-id="a1" tabindex="-1">/);
    assert.match(h, /<b class="mp-formato"><span>VGC<\/span><\/b>\s*<span class="mp-fila">/);
    assert.match(h, /class="mp-lato mp-l1 mp-vince" style="--c:#31c489"/);
    assert.match(h, /<span class="mp-palco" aria-hidden="true"><span class="pal-aura"><\/span><span class="pal-pedana"><\/span><span class="mp-scena"><img class="mp-avatar" draggable="false" src="immagini\/profile\/3\.png"/);
    assert.equal((h.match(/class="mp-scena"/g) || []).length, 2, 'una scena per lato (allenatore e compagno insieme)');
    assert.match(h, /class="mp-lato mp-l2 mp-perde" style="--c:#8e44ad"/, 'senza colore valido, il viola');
    assert.match(h, /src="immagini\/magikarp\.png"/, 'senza avatar il Magikarp');
    assert.match(h, /<b class="mp-nome nome-scorrevole">Lu &lt;b&gt;<\/b>/, 'il nome è testo');
    assert.equal((h.match(/<i class="mp-win">WIN<\/i>/g) || []).length, 1, 'un solo WIN');
    assert.match(h, /<i class="mp-vs">VS<\/i><span class="mp-punti"><b class="mp-avanti">2<\/b><u>:<\/u><b class="">1<\/b><\/span>/);
    assert.match(h, /<small class="mp-data">2026-10-04 · 3 matches<\/small>/);
    // pareggio e dati mancanti: nessun vincitore, valori di ripiego
    const p = K.htmlPoster({ id: 'z', p1: { nome: 'A' }, p2: { nome: 'B' }, vince: 0 }, 2);
    assert.doesNotMatch(p, /mp-vince|mp-perde|mp-win|mp-avanti/);
    assert.match(p, /<span>OU<\/span>/);
    assert.match(p, /<small class="mp-data">No date<\/small>/);
    assert.match(K.htmlPoster(sd('b', { partite: 1, vince: 2 }), 0), /1 match<\/small>/);
    assert.match(K.htmlPoster(sd('b', { vince: 2 }), 0), /mp-l2 mp-vince[\s\S]*mp-l1 mp-perde|mp-l1 mp-perde[\s\S]*mp-l2 mp-vince/);
});

test('htmlLato / htmlPoster con il compagno: il Pokémon preferito sta sullo stesso palco dell\'allenatore (nella stessa scena, così si scalano insieme); senza gif o senza Pokémon no', () => {
    const gif = n => 'gif/' + n.toLowerCase() + '.gif';
    const conPkm = sd('a1', { p1: { nome: 'Didi', colore: '#31c489', avatar: 'a.png', pkm: 'Gengar', vinti: 2 } });
    const h = K.htmlPoster(conPkm, 0, gif);
    assert.match(h, /<span class="mp-scena"><img class="mp-avatar"[^>]*><img class="mp-pkm" draggable="false" src="gif\/gengar\.gif" data-pkm="Gengar" alt="" onerror="this\.style\.display='none'"><\/span>/);
    assert.equal((h.match(/class="mp-pkm"/g) || []).length, 1, 'solo chi ha un Pokémon preferito');
    assert.doesNotMatch(K.htmlPoster(conPkm, 0), /mp-pkm/, 'senza la funzione delle gif niente compagno');
    assert.doesNotMatch(K.htmlPoster(sd('a1'), 0, gif), /mp-pkm/, 'senza Pokémon preferito niente compagno');
    // il nome della specie è testo, non HTML
    assert.match(K.htmlLato(2, { nome: 'Lu', pkm: 'a"<b>' }, false, false, n => 'g/' + n), /data-pkm="a&quot;&lt;b&gt;"/);
    // la pista porta le gif a ogni locandina
    const pista = K.html([conPkm, sd('b', { p2: { nome: 'Lu', pkm: 'Mew' } })], { gif });
    assert.equal((pista.match(/class="mp-pkm"/g) || []).length, 2);
});

test('html: una pista di locandine; senza showdown lo dice', () => {
    const h = K.html([sd('a'), null, sd('b')]);
    assert.match(h, /^<div class="mp-pista">/);
    assert.equal((h.match(/class="mp-carta"/g) || []).length, 2);
    assert.match(h, /data-i="1" data-id="b"/);
    assert.match(K.html([]), /No showdowns yet/);
    assert.match(K.html(null), /No showdowns yet/);
});

test('htmlPager: le frecce e un pallino per match, quello guardato acceso (la finestra del showdown mostra un match alla volta)', () => {
    const h = K.htmlPager(3, 1);
    assert.match(h, /^<button type="button" class="sd-freccia sd-prec" aria-label="Previous match"/);
    assert.match(h, /<span class="sd-punti" aria-hidden="true"><i><\/i><i class="su"><\/i><i><\/i><\/span>/);
    assert.match(h, /<button type="button" class="sd-freccia sd-succ" aria-label="Next match"[^>]*>›<\/button>$/);
    assert.equal((K.htmlPager(0, 0).match(/<i/g) || []).length, 0);
    assert.equal((K.htmlPager('x', 0).match(/<i/g) || []).length, 0);
    assert.equal((K.htmlPager(1, 0).match(/<i class="su">/g) || []).length, 1);
});

test('htmlTabs / tabValido: SHOWDOWNS e RANKINGS, quello guardato acceso; sul primo il numero dei showdown; una scelta sconosciuta torna ai showdown', () => {
    const h = K.htmlTabs('rk', 5);
    assert.match(h, /class="mt-tab" role="tab" aria-selected="false" data-tab="sd"[^>]*><span>Showdowns <i>5<\/i><\/span>/);
    assert.match(h, /class="mt-tab su" role="tab" aria-selected="true" data-tab="rk"[^>]*><span>Rankings<\/span>/);
    assert.doesNotMatch(K.htmlTabs('sd', 0), /<i>/);
    assert.equal(K.tabValido('rk'), 'rk');
    assert.equal(K.tabValido('altro'), 'sd');
    assert.equal(K.tabValido(null), 'sd');
});

test('avatarPerNome / htmlAvatarTesta: gli avatar per nome (senza badare alle maiuscole), il primo che si trova; senza avatar niente', () => {
    const a = K.avatarPerNome([sd('a'), { p1: { nome: ' LU <b> ', avatar: 'lu.png' }, p2: { nome: 'Didi', avatar: 'altro.png' } }, null]);
    assert.equal(a['didi'], 'immagini/profile/3.png', 'il primo che si trova');
    assert.equal(a['lu <b>'], 'lu.png');
    assert.deepEqual(K.avatarPerNome(null), {});
    assert.match(K.htmlAvatarTesta('a"b.png'), /^<img class="mp-testa-avatar" draggable="false" src="a&quot;b\.png"/);
    assert.equal(K.htmlAvatarTesta(''), '');
});

test('avvia: fuori dall\'app o senza la pagina di Matches non fa niente', () => {
    assert.equal(K.avvia({ document: { documentElement: { classList: { contains: () => false } } } }), null);
    assert.equal(K.avvia({ document: { documentElement: { classList: { contains: () => true } }, querySelector: () => null } }), null);
    assert.equal(K.avvia({}), null);
});

test('matches.html pubblica i showdown (con la funzione per aprire la finestra); app.js carica app-matches.js dopo la classifica', () => {
    const html = docs('matches.html');
    assert.match(html, /AppSito\.pubblica\('showdowns', \{ stagione: stagioneAttiva, lista: perAppSd \}\)/);
    assert.match(html, /apri: \(\) => apriModaleShowdown\(sdId, sd\)/);
    const s = require('../docs/app.js').SCRIPT_PAGINE['matches.html'];
    assert.ok(s.indexOf('app-matches.js') > s.indexOf('app-classifica.js') && s.indexOf('app-carosello.js') < s.indexOf('app-matches.js'));
});

test('il foglio: una schermata alla volta, le schede del sito spente, le locandine a carosello; la finestra del showdown mostra i Pokémon dei team', () => {
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /html\.app-shell\[data-mt="sd"\] body\.pg-matches \.hub-right-column, html\.app-shell\[data-mt="rk"\] body\.pg-matches \.hub-left-column \{ display: none !important; \}/);
    assert.match(css, /body\.pg-matches #matchList \{ display: none !important; \}/);
    for (const c of ['mt-barra', 'mt-tab', 'mp-carta', 'mp-pista', 'mp-formato', 'mp-scena', 'mp-lato', 'mp-palco', 'mp-avatar', 'mp-nome', 'mp-win', 'mp-vs', 'mp-punti', 'mp-data', 'mp-vuoto', 'mp-testa-avatar', 'mp-fila', 'mp-pkm', 'sd-pista', 'sd-pager', 'sd-freccia', 'sd-punti']) {
        assert.ok(css.includes('.' + c), `il foglio non conosce ${c}`);
    }
    assert.match(css, /#sd-modal-overlay \.sd-lineup \{ display: flex !important;/, 'i Pokémon dei team si vedono');
    assert.doesNotMatch(css, /#sd-modal-overlay \.sd-lineup \{ display: none/);
    // gli stili dei pezzi nuovi stanno tutti sotto html.app-shell (il sito da PC non cambia)
    const righe = css.split('\n').filter(r => /\.(mp|mt)-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 20, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell/, r.trim().slice(0, 80));
});
