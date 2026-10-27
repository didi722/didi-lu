'use strict';
// Le immagini dei Pokémon dentro il sito (docs/sprites/, scritte dal workflow "Sprites" con tools/sprites/scarica.cjs) e come le usa l'app:
// se ci sono arrivano dallo stesso indirizzo della pagina (veloci, il service worker le tiene), altrimenti da Showdown come prima.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/sprite-pkm.js');
const T = require('../tools/sprites/scarica.cjs');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

test('sprite-pkm: con l\'elenco delle immagini del sito si usano quelle (GIF, altrimenti PNG), per prime nella catena; senza, Showdown', () => {
    assert.equal(S.locale('Garchomp'), null);
    assert.equal(S.gif('Garchomp'), 'https://play.pokemonshowdown.com/sprites/ani/garchomp.gif');
    globalThis.SpriteLocali = { ani: ['garchomp', 'urshifu-rapidstrike'], dex: ['kingambit'] };
    try {
        assert.equal(S.gif('Garchomp'), 'sprites/ani/garchomp.gif');
        assert.equal(S.gif('Urshifu-Rapid-Strike'), 'sprites/ani/urshifu-rapidstrike.gif');
        assert.equal(S.gif('Kingambit'), 'sprites/dex/kingambit.png', 'senza GIF il PNG');
        assert.equal(S.gif('Pikachu'), 'https://play.pokemonshowdown.com/sprites/ani/pikachu.gif', 'quelli che non ci sono: Showdown');
        assert.equal(S.catena('Garchomp')[0], 'sprites/ani/garchomp.gif');
        assert.ok(S.catena('Garchomp').length >= 4, 'e dietro, quelle di Showdown');
        const img = { dataset: { pkm: 'Garchomp' }, style: {} };
        S.ritenta(img, { setTempo: f => f() });
        assert.equal(img.src, 'sprites/ani/garchomp.gif', 'si riprova prima la stessa');
        S.ritenta(img, { setTempo: f => f() });
        assert.equal(img.src, S.catena('Garchomp')[1], 'poi le altre, senza rifare la stessa');
    } finally { delete globalThis.SpriteLocali; }
});

test('scarica.cjs: le specie sono quelle che l\'app mostra (compagni, team iscritti, Box di tutti) senza doppioni; le fonti vanno dalla GIF al PNG', () => {
    const e = T.elencoSpecie({ a: { info: { pkmPreferito: 'Garchomp' }, teams: { t: { pokemon: [{ nome: 'Kingambit' }] } } }, b: { info: { pkmPreferito: 'garchomp' } } },
        { s1: { OU: { a: { datiTeams: { x: { pokemon: [{ nome: 'Urshifu-Rapid-Strike' }] } } } } } });
    assert.deepEqual(e.map(x => x.id).sort(), ['garchomp', 'kingambit', 'urshifu-rapidstrike']);
    const f = T.fontiDi({ id: 'kingambit', nome: 'Kingambit' });
    assert.deepEqual(f.map(x => x.url.split('/sprites/')[1]), ['ani/kingambit.gif', 'gen5ani/kingambit.gif', 'dex/kingambit.png']);
    assert.ok(f[0].file.endsWith(path.join('docs', 'sprites', 'ani', 'kingambit.gif')) && f[2].file.endsWith(path.join('sprites', 'dex', 'kingambit.png')));
});

test('scarica.cjs: si tengono solo vere GIF e PNG (Showdown, per un file che non ha, può rispondere con una pagina); l\'indice è ordinato', () => {
    assert.equal(T.eImmagine(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(100)]), 'ani'), true);
    assert.equal(T.eImmagine(Buffer.concat([Buffer.from('<html>'), Buffer.alloc(100)]), 'ani'), false);
    assert.equal(T.eImmagine(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]), 'dex'), true);
    assert.equal(T.eImmagine(Buffer.from('GIF89a'), 'ani'), false, 'troppo piccola');
    const i = T.indiceDa({ ani: ['b', 'a'], dex: new Set(['z']), back: ['q', 'p'] });
    assert.match(i, /window\.SpriteLocali = \{ ani: \["a","b"\], dex: \["z"\], back: \["p","q"\] \};/);
    assert.match(T.indiceDa({ ani: ['a'], dex: [] }), /back: \[\] \};/, 'senza GIF di schiena l\'elenco è vuoto');
});

test('scarica: salta quello che c\'è già, prova le fonti in ordine e ricorda chi non ha niente', async () => {
    const cartellaPrima = T.CARTELLA;
    const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || require('node:os').tmpdir(), 'spr-'));
    try {
        const chiamate = [];
        const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(100)]);
        const fetchFinto = async url => { chiamate.push(url); if (/ani\/ok\.gif/.test(url)) return { ok: true, status: 200, arrayBuffer: async () => gif }; return { ok: false, status: 404 }; };
        const b = await T.scarica('https://x/ani/ok.gif', 'ani', fetchFinto);
        assert.ok(Buffer.isBuffer(b));
        assert.equal(await T.scarica('https://x/ani/no.gif', 'ani', fetchFinto), null, 'un 404 non si ripete');
        assert.equal(chiamate.length, 2);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); assert.equal(T.CARTELLA, cartellaPrima); }
});

test('il sito: sprites/indice.js c\'è (vuoto finché il workflow non gira), lo carica ogni pagina che usa sprite-pkm.js prima di lui, il service worker tiene per sempre sprites/, Stats ci guarda per prima', () => {
    assert.match(docs('sprites/indice.js'), /window\.SpriteLocali = \{ ani: \[.*\], dex: \[.*\], back: \[.*\] \};/);
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'docs')).filter(n => n.endsWith('.html'))) {
        const h = docs(f);
        if (!h.includes('<script src="sprite-pkm.js"></script>')) continue;
        assert.ok(h.indexOf('sprites/indice.js') > 0 && h.indexOf('sprites/indice.js') < h.indexOf('sprite-pkm.js'), `${f}: l'indice prima di sprite-pkm.js`);
    }
    const { SCRIPT_PAGINE } = require('../docs/app.js');
    assert.ok(SCRIPT_PAGINE['players.html'].indexOf('sprites/indice.js') < SCRIPT_PAGINE['players.html'].indexOf('sprite-pkm.js'));
    assert.match(docs('sw.js'), /\/sprites\\\/\(ani\|ani-back\|dex\)\\\/\/\.test\(u\.pathname\)\) return 'sprite'/);
    assert.match(docs('stats.js'), /window\.SpritePkm\.locale \? window\.SpritePkm\.locale\(specie\)/);
});

test('il workflow Sprites: ogni giorno e a mano, con le credenziali di Firebase, salva solo docs/sprites', () => {
    const y = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'sprites.yml'), 'utf8');
    assert.match(y, /schedule:/);
    assert.match(y, /workflow_dispatch:/);
    assert.match(y, /contents: write/);
    assert.match(y, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
    assert.match(y, /node tools\/sprites\/scarica\.cjs/);
    assert.match(y, /git add docs\/sprites\b/);
});

test('scarica.cjs prende anche le GIF di schiena (per il simulatore) e si ricorda chi non le ha; la lista pratica mostra tutti e sei i Pokémon e senza caricamento a richiesta', () => {
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'tools', 'sprites', 'scarica.cjs'), 'utf8'), /assenti\.json[\s\S]*ani-back\/\$\{i\}\.gif/);
    assert.match(docs('app-gioco-pagine.css'), /\.pr-carta \.pr-mini \{ flex: 1 1 0; min-width: 0; width: auto;/);
    assert.doesNotMatch(docs('app-practice.js'), /class="pr-mini"[^`]*loading="lazy"/);
    assert.match(docs('app-menu.css'), /gx-carta:not\(\.gx-centro\) \*::after[\s\S]*animation-play-state: paused !important/, 'le scene che non si vedono stanno ferme');
});

