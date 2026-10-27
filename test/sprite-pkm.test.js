'use strict';
// Le GIF dei Pokémon: il nome del file di Showdown non è il nome con i trattini ("mr-mime" non esiste, "mrmime" sì). Una sola regola (sprite-pkm.js)
// per tutte le pagine, perché prima ognuna si arrangiava e certi Pokémon (Mr. Mime, Tapu Koko, Ho-Oh, Urshifu-Rapid-Strike...) restavano senza GIF.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/sprite-pkm.js');

const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');

test('i nomi con spazi, punti, apostrofi, due punti e accenti diventano l\'id di Showdown', () => {
    const attesi = {
        'Mr. Mime': 'mrmime', 'Mr. Rime': 'mrrime', 'Mime Jr.': 'mimejr', 'Type: Null': 'typenull', 'Tapu Koko': 'tapukoko',
        'Great Tusk': 'greattusk', 'Iron Valiant': 'ironvaliant', "Farfetch'd": 'farfetchd', "Sirfetch'd": 'sirfetchd', 'Flabébé': 'flabebe',
        'Charizard': 'charizard', 'Pikachu': 'pikachu'
    };
    for (const [nome, id] of Object.entries(attesi)) assert.equal(S.id(nome), id, nome);
});

test('i nomi con il trattino nella specie base lo perdono; quelli con una forma lo tengono UNO solo', () => {
    const attesi = {
        'Ho-Oh': 'hooh', 'Porygon-Z': 'porygonz', 'Jangmo-o': 'jangmoo', 'Hakamo-o': 'hakamoo', 'Kommo-o': 'kommoo',
        'Wo-Chien': 'wochien', 'Chien-Pao': 'chienpao', 'Ting-Lu': 'tinglu', 'Chi-Yu': 'chiyu', 'Nidoran-F': 'nidoranf', 'Nidoran-M': 'nidoranm',
        'Urshifu-Rapid-Strike': 'urshifu-rapidstrike', 'Calyrex-Shadow': 'calyrex-shadow', 'Necrozma-Dusk-Mane': 'necrozma-duskmane',
        'Charizard-Mega-X': 'charizard-megax', 'Tauros-Paldea-Combat': 'tauros-paldeacombat', 'Zygarde-10%': 'zygarde-10',
        'Mr. Mime-Galar': 'mrmime-galar', 'Ho-Oh-Test': 'hooh-test', 'Oricorio-Pom-Pom': 'oricorio-pompom', 'Basculin-White-Striped': 'basculin-whitestriped'
    };
    for (const [nome, id] of Object.entries(attesi)) assert.equal(S.id(nome), id, nome);
});

test('i soprannomi del Box e il sesso non contano; testo vuoto non rompe', () => {
    assert.equal(S.id('Garchomp (M)'), 'garchomp');
    assert.equal(S.id('Lucky (Mr. Mime)'), 'mrmime');
    assert.equal(S.id('Lucky (Mr. Mime-Galar)'), 'mrmime-galar');
    assert.equal(S.id(''), '');
    assert.equal(S.id(null), '');
    assert.equal(S.id(undefined), '');
});

test('gli indirizzi: GIF animata e PNG del Pokédex con lo stesso id; PokéAPI ha il suo nome con i trattini', () => {
    assert.equal(S.gif('Mr. Mime'), 'https://play.pokemonshowdown.com/sprites/ani/mrmime.gif');
    assert.equal(S.dex('Urshifu-Rapid-Strike'), 'https://play.pokemonshowdown.com/sprites/dex/urshifu-rapidstrike.png');
    assert.equal(S.pokeapi('Mr. Mime'), 'mr-mime');
    assert.equal(S.pokeapi('Great Tusk'), 'great-tusk');
    assert.equal(S.pokeapi('Type: Null'), 'type-null');
    assert.equal(S.pokeapi('Ho-Oh'), 'ho-oh');
    assert.equal(S.idSprite('Mr. Mime').db, 'mr-mime', 'per Pokémon Database');
});

test('ripiego della GIF mancante: forma di partenza (poche specie), poi PNG, poi Poké Ball', () => {
    const img = id => ({ dataset: {}, src: '', onerror: () => {} });
    const a = img(); S.riserva(a, 'mimikyu');
    assert.equal(a.src, 'https://play.pokemonshowdown.com/sprites/ani/mimikyu-disguised.gif');
    S.riserva(a, 'mimikyu');
    assert.equal(a.src, 'https://play.pokemonshowdown.com/sprites/dex/mimikyu.png');
    S.riserva(a, 'mimikyu');
    assert.equal(a.src, S.POKEBALL);
    assert.equal(a.onerror, null, 'dopo la Poké Ball non si riprova');

    const b = img(); S.riserva(b, 'mrmime');
    assert.equal(b.src, 'https://play.pokemonshowdown.com/sprites/dex/mrmime.png');
    S.riserva(b, 'mrmime');
    assert.equal(b.src, S.POKEBALL);
    const c = img(); S.riserva(c, '');
    assert.equal(c.src, S.POKEBALL);
});

test('le pagine usano la regola condivisa: nessun nome di GIF costruito a mano dal nome del Pokémon', () => {
    for (const pagina of ['box.html', 'hub.html', 'matches.html', 'public.html', 'battle.html', 'stats.html']) {
        assert.match(docs(pagina), /<script src="sprite-pkm\.js"><\/script>/, `${pagina} carica sprite-pkm.js`);
    }
    for (const pagina of ['box.html', 'hub.html', 'matches.html', 'public.html']) {
        const testo = docs(pagina);
        assert.doesNotMatch(testo, /sprites\/ani\/\$\{pkmNameUrl(?:\.toLowerCase\(\))?\}\.gif/, `${pagina}: la GIF non si costruisce più col nome con i trattini`);
        assert.doesNotMatch(testo, /sprites\/ani\/\$\{slug\}\.gif/, `${pagina}: né con il vecchio slug`);
        assert.doesNotMatch(testo, /if \(pkmNameUrl === 'mr-mime'\)/, `${pagina}: niente più toppe sul solo Mr. Mime`);
    }
    // getGifUrl (hub e matches) passa dalla regola
    for (const pagina of ['hub.html', 'matches.html']) assert.match(docs(pagina), /function getGifUrl\(pName\) \{\s*if \(!pName\) return "";\s*return SpritePkm\.gif\(pName\);/);
    // il ripiego per il PNG usa l'id di Showdown, non il nome con i trattini
    for (const pagina of ['box.html', 'hub.html', 'matches.html']) {
        const t = docs(pagina);
        assert.match(t, /function gestisciErroreSprite\(img, pkmNameUrl, spriteId\)/);
        assert.match(t, /sprites\/dex\/\$\{spriteId \|\| pkmNameUrl\}\.png/);
    }
    assert.match(docs('public-card.js'), /window\.SpritePkm \? window\.SpritePkm\.gif\(nome\)/);
    assert.match(docs('stats.js'), /const \{ idSprite \} = window\.SpritePkm;/);
    assert.match(docs('battle-extra.js'), /window\.SpritePkm \? window\.SpritePkm\.id\(specie\)/);
});

test('catena: la GIF animata, la GIF Gen 5, il PNG del Pokédex; per le forme anche la GIF della specie base', () => {
    assert.deepEqual(S.catena('Pikachu'), [
        'https://play.pokemonshowdown.com/sprites/ani/pikachu.gif', 'https://play.pokemonshowdown.com/sprites/gen5ani/pikachu.gif', 'https://play.pokemonshowdown.com/sprites/dex/pikachu.png'
    ]);
    const u = S.catena('Urshifu-Rapid-Strike');
    assert.equal(u[0], S.gif('Urshifu-Rapid-Strike'));
    assert.equal(u[u.length - 1], 'https://play.pokemonshowdown.com/sprites/ani/urshifu.gif');
    assert.equal(new Set(u).size, u.length);
    // lo stesso primo indirizzo di stats.js, così quello che il caricamento all'apertura scarica è quello che Stats chiede
    assert.match(docs('stats.js'), /\[`\$\{SD\}\/ani\/\$\{id\}\.gif`, `\$\{SD\}\/gen5ani\/\$\{id\}\.gif`, `\$\{SD\}\/dex\/\$\{id\}\.png`/);
});

test('ritenta (onerror dei compagni): riprova la stessa GIF dopo un momento, poi la Gen 5 e il PNG; solo se nessuna c\'è l\'immagine sparisce; intanto non si vede e riappare appena una carica', () => {
    const img = { dataset: { pkm: 'Pikachu' }, style: {}, onerror: () => {} };
    const attese = [];
    const setTempo = (f, ms) => { attese.push(ms); f(); return 1; };
    assert.equal(S.ritenta(img, { setTempo }), true);
    assert.equal(img.src, S.gif('Pikachu'), 'la stessa GIF: la rete può essersi solo impuntata');
    assert.deepEqual(attese, [S.ATTESA_RITENTA_MS], 'dopo un momento');
    assert.equal(img.style.visibility, 'hidden', 'niente icona rotta');
    img.onload();
    assert.equal(img.style.visibility, '', 'appena una carica riappare');
    assert.equal(S.ritenta(img, { setTempo }), true);
    assert.equal(img.src, 'https://play.pokemonshowdown.com/sprites/gen5ani/pikachu.gif');
    assert.equal(S.ritenta(img, { setTempo }), true);
    assert.equal(img.src, 'https://play.pokemonshowdown.com/sprites/dex/pikachu.png');
    assert.equal(S.ritenta(img, { setTempo }), false, 'finite le strade: sparisce');
    assert.equal(img.style.display, 'none');
    assert.equal(img.onerror, null);
    assert.equal(S.ritenta({ dataset: {}, style: {} }), false, 'senza nome (data-pkm) non c\'è niente da riprovare');
    assert.equal(S.ritenta(null), false);
});

test('i compagni (classifica, Matches, Trainers) usano ritenta e non nascondono la GIF al primo errore', () => {
    for (const f of ['app-classifica.js', 'app-matches.js', 'app-trainers.js']) {
        const js = docs(f);
        assert.match(js, /data-pkm="\$\{esc\([a-z]+\.pkm\)\}"[^`]*onerror="SpritePkm\.ritenta\(this\)"/, f);
        assert.doesNotMatch(js, /class="(?:ac|mp|at)-pkm"[^`]*onerror="this\.style\.display='none'"/, f);
    }
});
