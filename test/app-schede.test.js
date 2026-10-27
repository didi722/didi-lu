'use strict';
// Le schede della battaglia nell'app (docs/app-schede.js): il tooltip di Showdown (Pokémon, mossa) rifatto come scheda da gioco.
//   - la lettura del tooltip (l'HTML che scrivono battle-extra.js e Showdown) e la scheda che ne esce, con tutto quello che è testo di altri escapato;
//   - il foglio (app-battaglia.css) ha le regole di ogni pezzo, e nero al posto del bianco intorno allo schermo;
//   - il collegamento: app.js scarica lo script prima di app-battaglia.js, che rifà il tooltip solo da telefono.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parsa } = require('./ayuda-dom.js');
const S = require('../docs/app-schede.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = f => fs.readFileSync(path.join(DOCS, f), 'utf8');

// Il tooltip di un mio Pokémon fuori dal campo, com'è scritto da htmlPokemon (battle-extra.js)
const POKEMON = `<div class="tt-testa p1"><div class="tt-nome">Fuoco <small>Charizard</small> <small>Lv 50</small></div><div class="tt-tipi"><span class="tt-tipo t-fire">Fire</span><span class="tt-tipo t-flying">Flying</span><span class="tt-nota">Dynamax</span></div></div><div class="tt-corpo">
<div class="tt-hp"><div class="tt-barra"><span class="hp-y" style="width:46%"></span></div><b>138/299</b><span class="tag-stato brn">BRN</span></div>
<div class="tt-sezione"><div class="tt-riga"><span class="tt-etichetta">Ability</span><span class="tt-valore">Blaze</span></div><div class="tt-riga"><span class="tt-etichetta">Item</span><span class="tt-valore">Charizardite Y</span></div><div class="tt-riga"><span class="tt-etichetta">Nature</span><span class="tt-valore">Timid <small>+Spe −Atk</small></span></div></div>
<div class="tt-sezione"><div class="tt-titolo">Stats</div><div class="tt-griglia-stat">
<div class="tt-cella"><span>HP</span><b>299</b></div><div class="tt-cella giu"><span>Atk</span><b>96</b><small>128</small><em>-1</em></div><div class="tt-cella"><span>Def</span><b>192</b></div><div class="tt-cella su"><span>SpA</span><b>489</b><small>326</small><em>+1</em></div><div class="tt-cella"><span>SpD</span><b>206</b></div><div class="tt-cella"><span>Spe</span><b>328</b></div></div></div>
<div class="tt-sezione"><div class="tt-titolo">Moves</div><div class="tt-mossa"><span class="tt-tipo t-fire">Fire</span><span>Flamethrower</span><small>3/24</small></div><div class="tt-mossa"><span class="tt-tipo t-flying">Flying</span><span>Air Slash</span></div><div class="tt-mossa"><span class="tt-tipo t-dragon">Dragon</span><span>Dragon Pulse</span></div><div class="tt-mossa"><span class="tt-tipo t-fighting">Fighting</span><span>Focus Blast</span><small>1/8</small></div></div></div>`;

// Un avversario senza open sheet: abilità possibili, velocità possibile, mosse viste
const AVVERSARIO = `<div class="tt-testa p2"><div class="tt-nome">Lucario <small>Lv 50</small></div><div class="tt-tipi"><span class="tt-tipo t-fighting">Fighting</span><span class="tt-tipo t-steel">Steel</span></div></div><div class="tt-corpo">
<div class="tt-hp"><div class="tt-barra"><span class="hp-g" style="width:100%"></span></div><b>100%</b></div>
<div class="tt-sezione"><div class="tt-riga a-capo"><span class="tt-etichetta">Possible abilities</span><span class="tt-chips"><span class="tt-chip">Steadfast</span><span class="tt-chip">Inner Focus</span></span></div><div class="tt-riga"><span class="tt-etichetta">Item</span><span class="tt-valore"><span class="tt-ignoto">unknown</span></span></div></div>
<div class="tt-sezione"><div class="tt-titolo">Possible speed</div><div class="tt-grande">214–329</div><div class="tt-barra-range"><span></span></div><div class="tt-sub">0 EVs 214 · 252 EVs 329</div><div class="tt-sub">at +1: <b>321–493</b></div><div class="tt-chips"><span class="tt-chip su">Atk +2</span></div></div>
<div class="tt-sezione"><div class="tt-titolo">Revealed moves</div><div class="tt-mossa"><span class="tt-tipo t-fighting">Fighting</span><span>Close Combat</span><small>2/8</small></div></div></div>`;

// Il tooltip nativo di una mossa, con in fondo l'efficacia di battle-extra.js
const MOSSA = `<h2>Flamethrower<br><img src="Fire.png" alt="Fire" height="14" width="32" class="pixelated"> <img src="Special.png" alt="Special" height="14" width="32" class="pixelated"></h2><p>Base power: 90</p><p>Accuracy: 100%</p><p class="tooltip-section">Has a 10% chance to burn the target.</p><p>&#x25ce; Normal (selected target)</p><div class="tt-sezione tt-efficacia"><div class="tt-titolo"><span class="tt-tipo t-fire">Fire</span> Against</div><div class="tt-riga"><span class="tt-nomi">Lucario</span><span class="tt-badge super">×2 Super effective</span></div><div class="tt-riga"><span class="tt-nomi">Garchomp <small>(ally)</small></span><span class="tt-badge poco">×½ Not very effective</span></div></div>`;
const MOSSA_PRIORITA = `<h2>Extreme Speed<br><img src="x" alt="Normal"> <img src="x" alt="Physical"></h2><p>Base power: 80</p><p>Accuracy: 100%</p><p class="tooltip-section">Nearly always moves first (priority +2).</p><p>Inflicts regular damage.</p><p>&#x25ce; Normal (selected target)</p><p class="movetag">&#x2713; Makes contact <small>(the target's contact abilities...)</small></p><p class="movetag">&#x2713; Bites <small>(boosted by Strong Jaw)</small></p>`;
const MOSSA_DOPPIE = `<h2>Surf<br><img src="x" alt="Water"> <img src="x" alt="Special"></h2><p>Base power vs. Lucario: 90<br>Base power vs. Garchomp: 120</p><p>Accuracy: 100%</p><p class="tooltip-section">Hits all adjacent Pokemon.</p>`;
const MOSSA_STATO = `<h2>Roost<br><img src="x" alt="Flying"> <img src="x" alt="Status"></h2><p>Accuracy: —</p><p class="tooltip-section">Heals the user by 50% of its max HP.</p>`;

test('leggiPokemon: nome, specie, livello, lato, tipi, vita e stato, abilità e strumento (senza natura), le sei statistiche, le mosse', () => {
    const d = S.leggiPokemon(parsa(POKEMON));
    assert.equal(d.nome, 'Fuoco');
    assert.equal(d.specie, 'Charizard');
    assert.equal(d.livello, 'Lv 50');
    assert.equal(d.lato, 'p1');
    assert.deepEqual(d.tipi, ['Fire', 'Flying']);
    assert.deepEqual(d.note, ['Dynamax']);
    assert.deepEqual(d.hp, { perc: 46, classe: 'y', testo: '138/299', stato: { codice: 'brn', testo: 'BRN' }, extra: '' });
    assert.deepEqual(d.righe, [{ etichetta: 'Ability', valore: 'Blaze' }, { etichetta: 'Item', valore: 'Charizardite Y' }], 'la natura non serve per giocare');
    assert.equal(d.stat.length, 6);
    assert.deepEqual(d.stat[1], { nome: 'Atk', valore: '96', base: '128', dir: 'giu', boost: '-1' });
    assert.deepEqual(d.stat[3], { nome: 'SpA', valore: '489', base: '326', dir: 'su', boost: '+1' });
    assert.deepEqual(d.stat[0], { nome: 'HP', valore: '299', base: '', dir: '', boost: '' });
    assert.equal(d.velocita, null);
    assert.equal(d.mosseTitolo, 'Moves');
    assert.deepEqual(d.mosse.map(m => [m.tipo, m.nome, m.pp]), [['Fire', 'Flamethrower', '3/24'], ['Flying', 'Air Slash', ''], ['Dragon', 'Dragon Pulse', ''], ['Fighting', 'Focus Blast', '1/8']]);
});

test('leggiPokemon: un avversario senza open sheet ha le abilità possibili, la velocità possibile coi boost e le mosse viste; senza nome o senza testata non è un Pokémon', () => {
    const d = S.leggiPokemon(parsa(AVVERSARIO));
    assert.equal(d.nome, 'Lucario');
    assert.equal(d.specie, '');
    assert.equal(d.lato, 'p2');
    assert.deepEqual(d.hp, { perc: 100, classe: 'g', testo: '100%', stato: null, extra: '' });
    assert.deepEqual(d.possibili, ['Steadfast', 'Inner Focus']);
    assert.deepEqual(d.righe, [{ etichetta: 'Item', valore: 'unknown' }]);
    assert.equal(d.stat, null);
    assert.deepEqual(d.velocita, { testo: '214–329', note: ['at +1: 321–493'] });
    assert.deepEqual(d.boost, [{ testo: 'Atk +2', dir: 'su' }]);
    assert.equal(d.mosseTitolo, 'Revealed moves');
    assert.equal(d.mosse.length, 1);
    assert.equal(S.leggiPokemon(parsa(MOSSA)), null, 'una mossa non è un Pokémon');
    assert.equal(S.leggiPokemon(parsa('<div class="tt-testa"><div class="tt-nome"></div></div>')), null);
});

test('leggiMossa: nome, tipo e categoria dalle icone, potenza e precisione, priorità, descrizione, bersaglio, caratteristiche, efficacia sugli avversari', () => {
    const d = S.leggiMossa(parsa(MOSSA));
    assert.equal(d.nome, 'Flamethrower');
    assert.equal(d.tipo, 'Fire');
    assert.equal(d.categoria, 'Special');
    assert.equal(d.potenza, '90');
    assert.equal(d.precisione, '100%');
    assert.equal(d.priorita, '');
    assert.equal(d.descrizione, 'Has a 10% chance to burn the target.');
    assert.equal(d.bersaglio, 'Normal (selected target)');
    assert.deepEqual(d.efficacia, [{ nome: 'Lucario', classe: 'super', testo: '×2 Super effective' }, { nome: 'Garchomp (ally)', classe: 'poco', testo: '×½ Not very effective' }]);

    const p = S.leggiMossa(parsa(MOSSA_PRIORITA));
    assert.equal(p.priorita, '+2');
    assert.equal(p.descrizione, 'Inflicts regular damage.', 'la frase della priorità non è la descrizione');
    assert.deepEqual(p.tag, ['Makes contact', 'Bites'], 'il nome della caratteristica, senza il suggerimento tra parentesi');

    const m = S.leggiMossa(parsa(MOSSA_DOPPIE));
    assert.equal(m.potenza, '');
    assert.deepEqual(m.potenze, ['Lucario: 90', 'Garchomp: 120'], 'una potenza per avversario (doppie)');

    const s = S.leggiMossa(parsa(MOSSA_STATO));
    assert.equal(s.categoria, 'Status');
    assert.equal(s.potenza, '', 'una mossa di stato non ha potenza');
    assert.equal(s.precisione, '—');

    assert.equal(S.leggiMossa(parsa(POKEMON)), null, 'un Pokémon non è una mossa');
    assert.equal(S.leggiMossa(parsa('<h2>Campo<br></h2><p>Sole</p>')), null, 'senza l\'icona del tipo non è una mossa');
});

test('htmlCartaPokemon: la scheda ha lui con la GIF su un fondo dei suoi due tipi, la vita, le statistiche a barre per fascia, abilità e strumento, le mosse del colore del tipo', () => {
    const h = S.htmlCartaPokemon(S.leggiPokemon(parsa(POKEMON)), { gif: s => 'gif/' + s + '.gif', id: s => s.toLowerCase() });
    assert.match(h, /^<div class="sc sc-pkm p1">/);
    assert.match(h, /class="sc-eroe" style="--t1:#ff4422;--t2:#8899ff"/, 'il fondo prende i colori dei due tipi');
    assert.match(h, /<img class="sc-img" src="gif\/Charizard\.gif" data-id="charizard"/, 'la GIF è della specie, non del soprannome');
    assert.match(h, /<b class="sc-nome">Fuoco<\/b><small class="sc-specie">Charizard<\/small>/);
    assert.match(h, /<span class="sc-livello">Lv 50<\/span>/);
    assert.match(h, /<span class="sc-tipo" style="--tipo:#ff4422">Fire<\/span>/);
    assert.match(h, /class="sc-hp-y" style="width:46%"/);
    assert.match(h, /<span class="sc-stato brn">BRN<\/span>/);
    assert.equal((h.match(/class="sc-st /g) || []).length, 6);
    assert.match(h, /class="sc-st sc-v1 giu"><span>Atk<em>-1<\/em><\/span><span class="sc-barra"><i style="width:19%"><\/i><\/span><b>96<\/b>/, 'barra e fascia dal valore; il boost accanto al nome');
    assert.match(h, /class="sc-st sc-v5 su"><span>SpA<em>\+1<\/em><\/span>.*<b>489<\/b>/);
    assert.match(h, /<span class="sc-chip"><small>Ability<\/small><b>Blaze<\/b><\/span>/);
    assert.match(h, /<span class="sc-mossa" style="--tipo:#ff4422"><b>Flamethrower<\/b><small>3\/24<\/small><\/span>/);
    assert.match(h, /<span class="sc-mossa sc-chiaro" style="--tipo:#bb5544"><b>Focus Blast<\/b>/, 'su un tipo scuro la scritta è chiara');
    assert.doesNotMatch(S.htmlCartaPokemon(S.leggiPokemon(parsa(POKEMON))), /<img/, 'senza lo strumento per le GIF niente immagine');

    const a = S.htmlCartaPokemon(S.leggiPokemon(parsa(AVVERSARIO)));
    assert.match(a, /class="sc-vel"><span class="sc-et">Speed<\/span><b>214–329<\/b><small>at \+1: 321–493<\/small><span class="sc-boost su">Atk \+2<\/span>/);
    assert.match(a, /<span class="sc-chip sc-poss"><small>Ability\?<\/small><b>Steadfast<\/b>/);
    assert.match(a, /<span class="sc-et">Revealed moves<\/span>/);
    assert.doesNotMatch(a, /sc-st /, 'senza le statistiche esatte niente barre');
});

test('htmlCartaMossa: la fascia del tipo con tipo e categoria, le placche (potenza, precisione, priorità), la descrizione, le caratteristiche e l\'efficacia col moltiplicatore grande', () => {
    const h = S.htmlCartaMossa(S.leggiMossa(parsa(MOSSA)));
    assert.match(h, /^<div class="sc sc-mv" style="--t1:#ff4422">/);
    assert.match(h, /<b class="sc-nome">Flamethrower<\/b>/);
    assert.match(h, /<span class="sc-tipo" style="--tipo:#ff4422">Fire<\/span><span class="sc-cat sc-cat-special">Special<\/span>/);
    assert.match(h, /<div class="sc-placca"><small>Power<\/small><b>90<\/b><\/div><div class="sc-placca"><small>Accuracy<\/small><b>100%<\/b><\/div>/);
    assert.doesNotMatch(h, /Priority/, 'la priorità solo se c\'è');
    assert.match(h, /<p class="sc-desc">Has a 10% chance to burn the target\.<\/p>/);
    assert.match(h, /<span class="sc-tag sc-bersaglio">Normal \(selected target\)<\/span>/);
    assert.match(h, /<span class="sc-ef sc-ef-super"><small>Lucario<\/small><b>×2<\/b><i>Super effective<\/i><\/span>/);
    assert.match(h, /<span class="sc-ef sc-ef-poco"><small>Garchomp \(ally\)<\/small><b>×½<\/b><i>Not very effective<\/i><\/span>/);

    const p = S.htmlCartaMossa(S.leggiMossa(parsa(MOSSA_PRIORITA)));
    assert.match(p, /<div class="sc-placca"><small>Priority<\/small><b>\+2<\/b><\/div>/);
    assert.match(p, /<span class="sc-tag">Makes contact<\/span><span class="sc-tag">Bites<\/span>/);
    assert.doesNotMatch(S.htmlCartaMossa(S.leggiMossa(parsa(MOSSA_STATO))), /Power/, 'una mossa di stato non ha la placca della potenza');
    assert.match(S.htmlCartaMossa(S.leggiMossa(parsa(MOSSA_DOPPIE))), /sc-placca-lunga"><small>Power<\/small><b>Lucario: 90<\/b><b>Garchomp: 120<\/b>/);
});

test('le schede non si fidano dei testi: nomi, soprannomi e descrizioni escapati; i colori inline solo quelli della palette', () => {
    const cattivo = '<img src=x onerror=alert(1)>"\'';
    const h = S.htmlCartaPokemon({ nome: cattivo, specie: cattivo, livello: cattivo, lato: 'p1" onclick="x', tipi: [cattivo, 'Fire'], note: [cattivo], hp: { perc: 'abc', classe: 'g', testo: cattivo, stato: { codice: cattivo, testo: cattivo }, extra: cattivo },
        righe: [{ etichetta: cattivo, valore: cattivo }], possibili: [cattivo], stat: [{ nome: cattivo, valore: cattivo, dir: 'su', boost: cattivo }], mosse: [{ tipo: cattivo, nome: cattivo, pp: cattivo }] },
        { gif: () => 'x" onerror="y', id: () => cattivo });
    const m = S.htmlCartaMossa({ nome: cattivo, tipo: cattivo, categoria: cattivo, potenza: cattivo, precisione: cattivo, priorita: cattivo, descrizione: cattivo, bersaglio: cattivo, effetto: cattivo, tag: [cattivo], efficacia: [{ nome: cattivo, classe: cattivo, testo: cattivo }] });
    for (const x of [h, m]) {
        assert.doesNotMatch(x, /<img src=x/, 'nessun tag dai testi');
        assert.doesNotMatch(x, /" onclick="|" onerror="/, 'nessun attributo dai testi');
        for (const c of x.match(/--(?:tipo|t1|t2):[^;"]*/g) || []) assert.match(c, /^--(?:tipo|t1|t2):#[0-9a-f]{6}$/i, c);
    }
    assert.match(h, /style="width:0%"/, 'una vita che non è un numero è 0');
});

test('la fascia delle statistiche e la barra: come la schermata Sommario, dal rosso all\'azzurro; la barra non esce dal contenitore', () => {
    assert.deepEqual([50, 100, 199, 200, 299, 300, 399, 400, 700].map(S.fasciaStat), [1, 2, 2, 3, 3, 4, 4, 5, 5]);
    assert.equal(S.percStat(250), 50);
    assert.equal(S.percStat(900), 100);
    assert.equal(S.percStat(-3), 0);
    assert.equal(S.percStat('x'), 0);
    assert.equal(S.coloreTipo('Fire'), '#ff4422');
    assert.equal(S.coloreTipo('Stellar'), S.COLORE_NEUTRO, 'un tipo che non conosciamo ha il colore neutro');
    for (const t of ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']) {
        assert.match(S.COLORI_TIPO[t], /^#[0-9a-f]{6}$/i, t);
        assert.match(docs('style-battle.css'), new RegExp(`\\.t-${t}\\{--tipo:${S.COLORI_TIPO[t]}\\}`), `il colore di ${t} è quello del sito`);
    }
});

test('trasforma: riscrive il tooltip una volta sola (data-sc); quello che non conosce (campo, abilità) resta com\'è', () => {
    const t = parsa(POKEMON);
    assert.equal(S.trasforma(t, {}), 'pkm');
    assert.equal(t.dataset.sc, 'pkm');
    assert.match(t.innerHTML, /^$/, 'l\'innerHTML è stato riscritto (nel mini-DOM resta nel campo _html)');
    assert.match(t._html, /^<div class="sc sc-pkm p1">/);
    assert.equal(S.trasforma(t, {}), null, 'già fatto');

    const m = parsa(MOSSA);
    assert.equal(S.trasforma(m, {}), 'mossa');
    assert.match(m._html, /^<div class="sc sc-mv"/);

    const campo = parsa('<div class="tt-sezione"><div class="tt-titolo">Field</div><p>Sunny Day</p></div>');
    assert.equal(S.trasforma(campo, {}), null);
    assert.equal(campo.dataset.sc, undefined);
    assert.equal(campo._html, undefined, 'il tooltip sconosciuto non si tocca');
    assert.equal(S.trasforma(null, {}), null);
});

test('il foglio ha una regola per ogni pezzo delle schede, e l\'immersione: nero intorno allo schermo, bordi neri (non bianchi) ovunque', () => {
    const css = docs('app-battaglia.css');
    // ogni classe sc-* che le schede scrivono ha le sue regole
    const classi = new Set();
    const tutte = [S.htmlCartaPokemon(S.leggiPokemon(parsa(POKEMON)), { gif: () => 'g.gif' }), S.htmlCartaPokemon(S.leggiPokemon(parsa(AVVERSARIO))),
        S.htmlCartaMossa(S.leggiMossa(parsa(MOSSA))), S.htmlCartaMossa(S.leggiMossa(parsa(MOSSA_PRIORITA))), S.htmlCartaMossa(S.leggiMossa(parsa(MOSSA_DOPPIE)))].join('');
    for (const m of tutte.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c.startsWith('sc')) classi.add(c);
    assert.ok(classi.size >= 40, 'classi trovate: ' + classi.size);
    for (const c of classi) assert.ok(css.includes('.' + c), `manca la regola di .${c}`);
    for (const c of ['sc-v1', 'sc-v2', 'sc-v3', 'sc-v4', 'sc-v5', 'sc-hp-g', 'sc-hp-y', 'sc-hp-r', 'sc-cat-physical', 'sc-cat-special', 'sc-cat-status', 'sc-ef-nullo', 'sc-ef-neutro']) assert.ok(css.includes('.' + c) || c === 'sc-ef-neutro', c);
    // dietro la scheda lo schermo si abbuia; la scheda entra con un'animazione
    assert.match(css, /#tooltipwrapper:has\(\.tooltip\)::before \{[^}]*backdrop-filter: blur/);
    assert.match(css, /@keyframes sc-entra/);

    // nero intorno allo schermo, niente bianco né grigio
    assert.match(css, /html\.app, html\.app body \{[^}]*background: #000;/);
    assert.match(css, /html\.app \.palco-box \{[^}]*border: 4px solid #000;/);
    assert.doesNotMatch(css, /border(?:-[a-z]+)?:[^;}]*(?:#fff\b|#ffffff|var\(--carta\))/i, 'nessun bordo bianco');
    assert.doesNotMatch(css, /var\(--inchiostro\)/, 'i bordi e le ombre sono nero pieno, non la variabile del tema del sito');
    assert.doesNotMatch(css, /var\(--crema\)|var\(--sfondo-[ab]\)/, 'niente sfondi chiari del sito');
    // la fascia di testo sullo schermo ha il bordo nero
    assert.match(css, /:is\(\.domanda, \.messaggio > span, \.striscia\) \{[^}]*border: 3px solid #000;/);
});

test('il collegamento: app.js scarica app-schede.js prima di app-battaglia.js; app-battaglia.js rifà il tooltip solo da telefono e lascia il fallback di Showdown', () => {
    const app = docs('app.js');
    assert.match(app, /caricaScript\(doc, 'app-schede\.js'\); caricaScript\(doc, 'app-battaglia\.js'\)/);
    const js = docs('app-battaglia.js');
    assert.match(js, /win\.AppSchede/);
    assert.match(js, /S && !t\.dataset\.sc && telefono\(\)/);
    assert.doesNotMatch(js, /innerHTML/, 'il DOM lo scrive app-schede.js');
    assert.ok(docs('app-schede.js').includes('radice.AppSchede = S'));
    for (const f of ['battle.html']) assert.doesNotMatch(docs(f).replace(/<!--[\s\S]*?-->/g, ''), /app-schede/, 'lo scarica solo l\'app');
});

test('il lettore dipende dalle classi che battle-extra.js e Showdown scrivono: se cambiano, qui lo si vede', () => {
    const extra = docs('battle-extra.js');
    for (const c of ['tt-testa', 'tt-nome', 'tt-tipi', 'tt-tipo', 'tt-nota', 'tt-corpo', 'tt-hp', 'tt-barra', 'tag-stato', 'tt-sezione', 'tt-riga', 'tt-etichetta', 'tt-valore', 'tt-chips', 'tt-chip',
        'tt-griglia-stat', 'tt-cella', 'tt-grande', 'tt-sub', 'tt-titolo', 'tt-mossa', 'tt-efficacia', 'tt-nomi', 'tt-badge', 'hp-g', 'hp-y', 'hp-r']) {
        assert.ok(extra.includes(c), `battle-extra.js non scrive più ${c}`);
    }
    for (const c of ['super', 'poco', 'nullo', 'neutro']) assert.ok(extra.includes(`classe: '${c}'`), c);
    // i colori dei tipi dei cartellini sono quelli delle schede (provato sopra); le categorie sono quelle di Showdown
    assert.deepEqual(Object.values({ physical: 'Physical', special: 'Special', status: 'Status' }), ['Physical', 'Special', 'Status']);
});
