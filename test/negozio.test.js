'use strict';
// negozio.js: la finestra delle monete (markup puro) e il cablaggio dei cosmetici nelle pagine (compagno shiny, aure, motivi dello sfondo a pagamento).
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../docs/negozio.js');
const P = require('../docs/pagina-pubblica.js');
const Sprite = require('../docs/sprite-pkm.js');
const C = require('../docs/cosmetici.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('html: saldo, le tre categorie, compra con il prezzo (spento se mancano monete), "Put on"/"Take off" per ciò che si ha, i movimenti più recenti prima; testo protetto', () => {
    const h = N.html({ saldo: 650, posseduti: { 'aura-oro': 1 }, info: { aura: 'aura-oro', pkmShiny: false }, movimenti: [{ t: Date.UTC(2026, 10, 2), importo: 20, motivo: 'Season set won' }, { t: Date.UTC(2026, 10, 3), importo: -150, motivo: '<b>Bought</b>' }] });
    assert.match(h, /🪙 650/);
    for (const t of ['Shiny companion', 'Trainer aura', 'Page patterns']) assert.ok(h.includes(t), t);
    assert.match(h, new RegExp(`data-ng="compra" data-id="aura-fiamma">${C.perId('aura-fiamma').prezzo} 🪙`), '650 monete: l\'aura da 400 si può comprare');
    assert.match(h, new RegExp(`data-ng="compra" data-id="shiny" disabled>${C.perId('shiny').prezzo} 🪙`), 'il compagno shiny (800) no');
    assert.match(h, new RegExp(`data-ng="compra" data-id="aura-arcobaleno" disabled>${C.perId('aura-arcobaleno').prezzo} 🪙`), 'e nemmeno l\'arcobaleno');
    assert.match(h, /data-ng="equipa" data-id="aura-oro" data-attivo="0">Take off/, 'l\'aura in uso si toglie');
    assert.match(h, /On now/);
    assert.match(h, /&lt;b&gt;Bought&lt;\/b&gt;/);
    assert.ok(h.indexOf('Bought') < h.indexOf('Season set won'), 'il movimento più recente prima');
    assert.match(h, /-150/);
    assert.match(N.html({ saldo: 0 }), /Nothing yet: play a set!/);
    assert.match(N.html({ saldo: 5, messaggio: 'Not enough coins.' }), /role="status">Not enough coins\./);
    assert.doesNotMatch(N.html({ saldo: 1000, occupato: false, stagioni: { s1: 'playing' } }), /disabled/);
    assert.match(N.html({ saldo: 1000, occupato: true }), /disabled/);
});

test('html: le edizioni limitate stanno in cima e fuori dai gruppi normali; in vendita finché la stagione non è chiusa; prima "Soon"; dopo si vede solo quello che si ha', () => {
    const sezione = h => (/<section class="ng-gruppo ng-edizione">[^]*?<\/section>/.exec(h) || [''])[0];
    const ids = C.CATALOGO.filter(c => c.edizione).map(c => c.id);
    const prezzo = id => C.perId(id).prezzo;
    // in vendita
    const h = N.html({ saldo: 1000, stagioni: { s1: 'playing' }, nomiStagioni: { s1: "Sant'Alvise II" } });
    const ed = sezione(h);
    assert.match(ed, /<h3>Limited edition · Lagoon<\/h3>/);
    assert.match(ed, /On sale only until Sant&#39;Alvise II ends: after that nobody can buy them again/);
    assert.ok(h.indexOf('ng-edizione') < h.indexOf('<h3>Shiny companion</h3>'), 'in cima, prima del resto');
    for (const id of ids) {
        assert.match(ed, new RegExp(`data-ng="compra" data-id="${id}">${prezzo(id)} 🪙`), id);
        assert.equal((h.match(new RegExp(`<li class="ng-voce[^"]*" data-tipo="[a-z]+" data-id="${id}">`, 'g')) || []).length, 1, `${id} ha una riga sola: non anche nel suo gruppo`);
    }
    // senza il nome della stagione
    assert.match(sezione(N.html({ saldo: 0, stagioni: { s1: 'open' } })), /On sale only until the season ends/);
    // poche monete: il prezzo c'è, il tasto è spento
    assert.match(sezione(N.html({ saldo: 100, stagioni: { s1: 'playing' } })), new RegExp(`data-id="aura-laguna" disabled>${prezzo('aura-laguna')} 🪙`));
    // la stagione non c'è ancora: "Soon", spento anche con tante monete
    const presto = sezione(N.html({ saldo: 99999, stagioni: {} }));
    assert.match(presto, /Coming with the next season/);
    for (const id of ids) assert.match(presto, new RegExp(`data-id="${id}" disabled>Soon<`), id);
    // la stagione è chiusa: chi non ha niente non vede niente; chi ha una voce la vede, con "Put on", e il resto della sezione non c'è
    assert.equal(sezione(N.html({ saldo: 99999, stagioni: { s1: 'closed' } })), '', 'nessuna sezione se non si ha niente');
    const chiusa = sezione(N.html({ saldo: 99999, stagioni: { s1: 'closed' }, posseduti: { 'nome-laguna': 1 } }));
    assert.match(chiusa, /The sale has ended\. What you bought stays yours\./);
    assert.match(chiusa, /data-ng="equipa" data-id="nome-laguna" data-attivo="1">Put on/);
    assert.doesNotMatch(chiusa, /data-ng="compra"|aura-laguna|palco-laguna/);
    // quello che si ha si mette e si toglie come le altre cose, anche in vendita
    const mie = N.html({ saldo: 0, stagioni: { s1: 'playing' }, posseduti: { 'aura-laguna': 1 }, info: { aura: 'aura-laguna' } });
    assert.match(sezione(mie), /data-ng="equipa" data-id="aura-laguna" data-attivo="0">Take off/);
    // il testo ostile non esce dal tag
    assert.doesNotMatch(N.html({ saldo: 0, stagioni: { s1: 'open' }, nomiStagioni: { s1: '<script>x</script>' } }), /<script>x/);
});

test('html e anteprime: gli effetti del nome e del palco hanno il loro gruppo, l\'anteprima con l\'effetto vero (attributi di effetti-pagina.css) e si mettono e tolgono dal campo giusto', () => {
    const h = N.html({ saldo: 5000, posseduti: { 'nome-neon': 1, 'palco-neve': 1 }, info: { effettoNome: 'nome-neon', color: '#FF8800' }, stagioni: { s1: 'playing' } });
    for (const t of ['Name effects', 'Stage effects']) assert.ok(h.includes(`<h3>${t}</h3>`), t);
    for (const c of C.CATALOGO.filter(x => x.tipo === 'nome' && !x.edizione)) assert.match(h, new RegExp(`data-id="${c.id}"><span class="ng-anteprima" style="--pp-nome:#FF8800"><span class="ng-nome-prova" data-effetto-nome="${c.id}" data-testo="NAME">NAME</span>`), c.id);
    for (const c of C.CATALOGO.filter(x => x.tipo === 'palco' && !x.edizione)) assert.match(h, new RegExp(`data-id="${c.id}"><span class="ng-anteprima" data-effetto-palco="${c.id}" style="--ng-c:#FF8800"></span>`), c.id);
    assert.match(h, /data-ng="equipa" data-id="nome-neon" data-attivo="0">Take off/, 'quello che porti si toglie');
    assert.match(h, /data-ng="equipa" data-id="palco-neve" data-attivo="1">Put on/, 'quello che hai ma non porti si mette');
    assert.match(h, new RegExp(`data-ng="compra" data-id="nome-oro">${C.perId('nome-oro').prezzo} 🪙`));
    assert.match(h, /On now/);
    // il colore di chi guarda è solo un colore: altro (o niente) cade sul blu di riserva e non entra nel tag
    assert.match(N.html({ saldo: 0, info: { color: '"><script>x</script>' } }), /--pp-nome:#6b93b0/);
    assert.doesNotMatch(N.html({ saldo: 0, info: { color: '"><script>x</script>' } }), /<script>x/);
    assert.match(N.html({ saldo: 0 }), /--ng-c:#6b93b0/);
    // il foglio degli effetti si carica nella finestra e le anteprime hanno lo spazio per mostrarli
    const sorgente = leggi('docs', 'negozio.js');
    assert.match(sorgente, /effetti-pagina\\\.css/);
    assert.match(N.STILE, /\.ng-voce\[data-tipo=palco\] \.ng-anteprima\{position:relative;overflow:hidden;container-type:size;--ef-u:3cqh\}/, 'il palco in miniatura è un container e i puntini sono più grandi');
    assert.match(N.frase('not-yet'), /next season/);
    assert.match(N.frase('ended'), /has ended/);
});

test('html: un motivo dello sfondo in uso nella pagina resta di chi lo usa; i motivi non si "mettono" da qui', () => {
    const h = N.html({ saldo: 0, pagina: { sfondo: { motivo: 'raggi' } } });
    assert.match(h, /Sunburst<\/b><small>Yours: pick it in Customize on your page/);
    assert.match(h, new RegExp(`Stars</b>[\\s\\S]*?data-id="sfondo-stelle" disabled>${C.perId('sfondo-stelle').prezzo} 🪙`));
    assert.doesNotMatch(h, /data-ng="equipa" data-id="sfondo/);
});

test('anteprime: aure con il loro colore, sfondi con il motivo vero, shiny con lo sprite del compagno; senza dati restano semplici e il testo ostile non esce dal tag', () => {
    const sfondo = P.sfondoCss({ motivo: 'stelle', colore: '#ffd966', forza: 3 }, '#31c489');
    const h = N.html({ saldo: 0, anteprime: { 'sfondo-stelle': sfondo, shiny: { sprite: Sprite.gif('Garchomp', true) } } });
    assert.match(h, /data-id="sfondo-stelle"><span class="ng-anteprima" style="background-color:#ffd966;background-image:url\(&quot;data:image\/svg\+xml,/);
    assert.match(h, /<img src="https:\/\/play\.pokemonshowdown\.com\/sprites\/ani-shiny\/garchomp\.gif"/);
    const senza = N.html({ saldo: 0 });
    assert.match(senza, /data-id="shiny"><span class="ng-anteprima ng-scintilla"><\/span>/, 'senza sprite: la scintilla');
    assert.match(senza, /data-id="aura-oro"><span class="ng-anteprima" style="--ng-c:#ffcc33"><\/span>/);
    assert.match(senza, /data-id="sfondo-raggi"><span class="ng-anteprima" style="--ng-c:#d9dde6"><\/span>/, 'senza motivo: un quadrato semplice');
    assert.doesNotMatch(N.anteprima({ tipo: 'shiny' }, { sprite: '"><script>x</script>' }), /<script>/);
    assert.doesNotMatch(N.anteprima({ tipo: 'sfondo' }, { colore: '"><b>', immagine: 'url(x)', dimensione: '1px', posizione: '0 0' }), /<b>/);
    // la variabile dell'aura non deve toccare quelle del resto del sito
    assert.doesNotMatch(N.STILE.replace(/--ng-c/g, ''), /--c\b/);
});

test('sprite shiny: gif e catena con i colori alternativi, senza immagini locali', () => {
    assert.equal(Sprite.gif('Garchomp', true), 'https://play.pokemonshowdown.com/sprites/ani-shiny/garchomp.gif');
    assert.equal(Sprite.gif('Garchomp'), 'https://play.pokemonshowdown.com/sprites/ani/garchomp.gif');
    assert.deepEqual(Sprite.catena('Garchomp', true).slice(0, 3).map(u => u.split('sprites/')[1]), ['ani-shiny/garchomp.gif', 'gen5ani-shiny/garchomp.gif', 'dex-shiny/garchomp.png']);
});

test('i due motivi nuovi (Stars, Waves) esistono, si disegnano e passano la validazione della pagina', () => {
    assert.equal(P.MOTIVI.stelle, 'Stars');
    assert.equal(P.MOTIVI.onde, 'Waves');
    for (const motivo of ['stelle', 'onde']) {
        const css = P.sfondoCss({ colore: '#31c489', forza: 2, motivo }, '#31c489');
        assert.match(css.immagine, /^url\("data:image\/svg\+xml,/, motivo);
        assert.ok(css.periodo > 0);
    }
    const c = P.normalizza({ sfondo: { motivo: 'stelle' } });
    assert.equal(c.sfondo.motivo, 'stelle');
    assert.equal(P.normalizza({ sfondo: { motivo: 'boh' } }).sfondo.motivo, P.predefinita().sfondo.motivo);
});

test('cablaggio: il campanello apre il negozio; shiny nella pagina, nell\'app e nelle schede; aure nella pagina e nella scheda; motivi bloccati nell\'editor', () => {
    const sf = leggi('docs', 'sfide.js');
    assert.match(sf, /function pieNegozio\(\)/);
    assert.match(sf, /pieNegozio\(\)\);\s*\}/);
    assert.match(sf, /segui\(`wallet\/\$\{P\.uid\}\/saldo`/, 'il saldo si segue in tempo reale');
    assert.match(sf, /`Shop · 🪙 \$\{saldo\}`/, 'il tasto mostra il saldo');
    assert.match(sf, /carica\('cosmetici\.js', \(\) => window\.Cosmetici\)\.then\(\(\) => carica\('negozio\.js'/);
    const pc = leggi('docs', 'public-card.js');
    assert.match(pc, /const brillante = !!\(stato\.dati && stato\.dati\.info && stato\.dati\.info\.pkmShiny\)/);
    assert.match(pc, /'data-aura': cosmeticoDi\(d\.info\.aura, 'aura'\)/);
    assert.match(pc, /const cosmeticoDi = \(id, tipo\) => \{ const c = window\.Cosmetici && window\.Cosmetici\.perId\(id\); return c && c\.tipo === tipo \? id : null; \};/, 'un id vale solo se è di quel tipo');
    assert.match(pc, /'data-effetto-palco': cosmeticoDi\(d\.info\.effettoPalco, 'palco'\)/);
    assert.match(pc, /'data-effetto-nome': effettoNome, 'data-testo': effettoNome \? nome : null/, 'l\'effetto del nome ridisegna il testo: serve data-testo');
    assert.match(leggi('docs', 'public.html'), /<link rel="stylesheet" href="style-public-card\.css">\s*<link rel="stylesheet" href="effetti-pagina\.css">/);
    assert.match(leggi('functions', 'index.js'), /exports\.equipaCosmetico = negozio\('equipa'\)/);
    assert.match(leggi('functions', 'monete.js'), /motivo: d === 'presto' \? 'not-yet' : 'ended'/, 'le edizioni le controlla il server');
    assert.match(pc, /aura: window\.Cosmetici && window\.Cosmetici\.perId\(info\.aura\)/);
    assert.match(leggi('docs', 'public.html'), /<script src="cosmetici\.js"><\/script>\s*<script src="public-card\.js">/);
    assert.match(leggi('docs', 'matches.html'), /pkmShiny: !!g\.pkmShiny/);
    assert.match(leggi('docs', 'players.html'), /pkmShiny: p\.pkmShiny/);
    assert.match(leggi('docs', 'app-matches.js'), /gif\(l\.pkm, l\.pkmShiny\)/);
    assert.match(leggi('docs', 'app-classifica.js'), /gif\(p\.pkm, p\.pkmShiny\)/);
    assert.match(leggi('docs', 'app-trainers.js'), /gif\(g\.pkm, g\.pkmShiny\)/);
    for (const id of ['aura-oro', 'aura-fiamma', 'aura-ghiaccio', 'aura-arcobaleno']) assert.ok(leggi('docs', 'style-public-card.css').includes(`data-aura="${id}"`), id);
    const ed = leggi('docs', 'public-editor.js');
    assert.match(ed, /const motivoBloccato = motivo => !!window\.Cosmetici && window\.Cosmetici\.motivoBloccato\(motivo,/);
    assert.match(ed, /motivoBloccato\(id\) \? apriNegozio\(\) : cambia/);
    assert.match(ed, /dispatchEvent\(new CustomEvent\('apri-negozio'\)\)/);
    assert.match(leggi('docs', 'sfide.js'), /addEventListener\('apri-negozio'/);
    assert.ok(leggi('docs', 'style-public-editor.css').includes('.pe-motivo.pe-bloccato'));
});

test('htmlShinyTeam: una riga per Pokémon; i shiny sono "Shiny ✓", gli altri hanno la fascia e il prezzo della loro specie (spento senza monete); un tocco arma ("Sure?"), il testo è protetto', () => {
    const prezzo = nome => C.prezzoShiny(nome).prezzo;
    const base = {
        team: 'Alfa <b>', saldo: 500,
        pokemon: [{ nome: 'Garchomp', shiny: true, brillante: 'https://x/g-s.gif' }, { nome: 'Incineroar', shiny: false, normale: 'https://x/i.gif', brillante: 'https://x/i-s.gif' },
            { nome: 'Mewtwo', shiny: false }, { nome: 'Pichu', shiny: false }, { nome: '<i>X</i>', shiny: false }]
    };
    const h = N.htmlShinyTeam(base);
    assert.match(h, /✨ Shiny · Alfa &lt;b&gt;/);
    assert.match(h, /🪙 500/);
    assert.equal((h.match(/class="ng-voce ng-pkm/g) || []).length, 5);
    assert.match(h, /Garchomp<\/b><small>Shiny for good<\/small><\/span><span class="ng-fatto">Shiny ✓/, 'chi è già shiny non ha fascia né prezzo');
    // ogni Pokémon ha la fascia e il prezzo della sua specie
    assert.match(h, new RegExp(`Incineroar<span class="ng-fascia" data-fascia="standard">Standard</span></b><small>Normal colours</small></span><button type="button" class="ng-bottone ng-compra" data-ng="shiny" data-i="1">${prezzo('Incineroar')} 🪙</button>`));
    assert.match(h, new RegExp(`Mewtwo<span class="ng-fascia" data-fascia="mitico">Legendary</span></b>[^]*?data-i="2" disabled>${prezzo('Mewtwo')} 🪙</button>`), 'un leggendario a 500 monete è spento');
    assert.match(h, new RegExp(`Pichu<span class="ng-fascia" data-fascia="comune">Common</span></b>[^]*?data-i="3">${prezzo('Pichu')} 🪙</button>`), 'una specie comune costa meno ed è acquistabile');
    assert.match(h, new RegExp(`data-i="4" disabled>${prezzo('Specie Mai Vista')} 🪙|data-i="4">${prezzo('Specie Mai Vista')} 🪙`), 'una specie sconosciuta vale il prezzo standard');
    assert.match(h, /<img src="https:\/\/x\/i\.gif"[^>]*>(<i>→<\/i>)<img src="https:\/\/x\/i-s\.gif"/, 'prima/dopo');
    assert.doesNotMatch(h, /<i>X<\/i>/, 'il nome è protetto');
    // la legenda delle fasce: nomi e prezzi, dalla più economica
    const legenda = /<p class="ng-fasce"[^>]*>(.*?)<\/p>/.exec(h)[1];
    assert.deepEqual([...legenda.matchAll(/data-fascia="(\w+)">([^<]+)</g)].map(m => [m[1], m[2]]), C.fasceShiny().map(f => [f.fascia, `${f.nome} ${f.prezzo}`]));
    assert.match(h, /The price depends on the species/);
    // un tocco arma il pulsante di quel Pokémon soltanto
    const armato = N.htmlShinyTeam({ ...base, armato: 1 });
    assert.match(armato, new RegExp(`class="ng-bottone ng-compra ng-sicuro" data-ng="shiny" data-i="1">Sure\\? ${prezzo('Incineroar')} 🪙`));
    assert.match(armato, /Press again to confirm/);
    assert.equal((armato.match(/ng-sicuro/g) || []).length, 1);
    // senza monete o mentre si compra i pulsanti sono spenti: ognuno col suo prezzo
    const spenti = stato => (N.htmlShinyTeam({ ...base, ...stato }).match(/data-ng="shiny"[^>]*disabled/g) || []).length;
    assert.equal(spenti({ saldo: 500 }), 1, 'solo il leggendario');
    assert.equal(spenti({ saldo: prezzo('Mewtwo') }), 0);
    assert.equal(spenti({ saldo: prezzo('Pichu') }), 3, 'con il prezzo di una specie comune: tutti gli altri sono spenti');
    assert.equal(spenti({ saldo: prezzo('Pichu') - 1 }), 4);
    assert.equal(spenti({ saldo: 99999, occupato: true }), 4);
    assert.match(N.htmlShinyTeam({ ...base, messaggio: 'Not enough coins.' }), /role="status">Not enough coins\./);
    assert.match(N.htmlShinyTeam({ team: 'Vuoto', pokemon: [] }), /This team has no Pokémon yet/);
    assert.match(N.htmlShinyTeam({ team: 'Vuoto', pokemon: [{ nome: 'A' }] }), new RegExp(`data-i="0"[^>]*>${C.PREZZI.shinyPokemon} 🪙`), 'senza una specie nota vale il prezzo base');
});

test('negozio: i guadagni nel testo vengono da PREMI, la guida dice dove si spendono avatar, canzoni e shiny; "free" nei movimenti a zero; le frasi degli errori nuovi', () => {
    const h = N.html({ saldo: 0, movimenti: [{ t: Date.UTC(2026, 10, 3), importo: 0, motivo: 'Free: Avatar 12' }] });
    const P = C.PREMI;
    assert.match(h, new RegExp(`a season set pays ${P.set.ufficiale.giocato}, or ${P.set.ufficiale.giocato + P.set.ufficiale.vinto} if you win it`));
    assert.match(h, new RegExp(`a friendly pays ${P.set.amichevole.giocato} or ${P.set.amichevole.giocato + P.set.amichevole.vinto} \\(up to ${P.tettoAmichevoliGiorno} a day\\)`));
    assert.match(h, new RegExp(`Changing your avatar \\(${C.PREZZI.avatar} 🪙\\), colour \\(${C.PREZZI.colore} 🪙\\) or song \\(${C.PREZZI.canzone} 🪙\\) is in <b>Customize → Trainer</b>`));
    assert.match(h, /Your first avatar, colour and song are free and stay yours for good, and coming back to them is always free; the one you wear is yours while you wear it, then it goes back to the pool for everyone/);
    const fasce = C.fasceShiny().map(f => f.prezzo);
    assert.match(h, new RegExp(`Shiny Pokémon \\(${Math.min(...fasce)}–${Math.max(...fasce)} 🪙, the rarer the species the more it costs\\): the ✨ button on a team in your <b>Box</b>`));
    assert.match(h, /Free: Avatar 12<\/span><b class="ng-piu">free<\/b>/);
    for (const m of ['busy', 'already', 'cannot-apply', 'poor', 'owned']) assert.match(N.frase(m), /\w{4}/, m);
    assert.equal(N.frase('boh'), "Couldn't do that.");
    assert.match(N.frase('already'), /already shiny/);
});

test('sprite shiny: se la GIF manca, un Pokémon shiny ripiega sulle immagini shiny (il Pokédex shiny), non su quelle normali', () => {
    const img = shiny => ({ dataset: shiny ? { shiny: '1' } : {}, src: '' });
    const a = img(true);
    Sprite.riserva(a, 'garchomp');
    assert.equal(a.src, 'https://play.pokemonshowdown.com/sprites/dex-shiny/garchomp.png');
    const b = img(false);
    Sprite.riserva(b, 'garchomp');
    assert.equal(b.src, 'https://play.pokemonshowdown.com/sprites/dex/garchomp.png');
    const c = img(true);
    Sprite.riserva(c, 'mimikyu');
    assert.equal(c.src, 'https://play.pokemonshowdown.com/sprites/ani-shiny/mimikyu-disguised.gif', 'la forma di partenza, in shiny');
});

test('cablaggio: Box con il tasto ✨, la finestra e lo shiny sulle card; il salvataggio dei team toglie lo shiny non comprato; le altre pagine mostrano lo shiny dei team; il server lo vende', () => {
    const box = leggi('docs', 'box.html');
    assert.match(box, /<script src="rarita-pkm\.js"><\/script>\s*<script src="cosmetici\.js"><\/script>\s*<script src="negozio\.js"><\/script>/, 'le fasce di rarità servono al catalogo: vanno caricate prima');
    assert.match(box, /class="card-azione azione-shiny" onclick="event\.stopPropagation\(\); apriShinyTeam\('\$\{team\.id\}'\)"/);
    assert.match(box, /function apriShinyTeam\(id\)[\s\S]*?window\.Negozio\.apriShinyTeam\(window,[\s\S]*?alFatto: indice => \{ if \(pokemon\[indice\]\) pokemon\[indice\]\.shiny = true; applicaFiltri\(\); \}/);
    assert.match(box, /SpritePkm\.gif\(nomePkm, p\.shiny\)/);
    assert.match(box, /SpritePkm\.gif\(p\.nome, p\.shiny\)[^\n]*clickable-pkm/);
    assert.match(box, /Cosmetici\.senzaShinyAbusivi\(testoScritto, editingId \? tuttiITeam\.find\(t => t\.id === editingId\) : null\)/);
    assert.match(box, /sprites\/\$\{img\.dataset\.shiny \? 'dex-shiny' : 'dex'\}/);
    for (const [f, re] of [['matches.html', /SpritePkm\.gif\(p\.nome, p\.shiny\)/], ['public.html', /SpritePkm\.gif\(p\.nome, p\.shiny\)/], ['hub.html', /SpritePkm\.gif\(p\.nome \|\| '', p\.shiny\)/]]) assert.match(leggi('docs', f), re, f);
    assert.match(leggi('docs', 'public-card.js'), /gifShowdown\(nomePkm, p\.shiny\)/, 'la squadra nella pagina pubblica');
    const idx = leggi('functions', 'index.js');
    assert.match(idx, /exports\.shinyPokemonTeam = negozio\('shinyPokemon'\)/);
    assert.match(idx, /team: String\(dati\.team \|\| ''\), indice: dati\.indice/);
});

test('cablaggio: avatar e canzone si cambiano dal server (fuori da SAVE), con conferma; il primo di casa è segnato, quelli riservati da altri sono grigi, il resto non ha lucchetti', () => {
    const ed = leggi('docs', 'public-editor.js');
    assert.match(ed, /function leggiPortafoglio\(forza\)/);
    assert.match(ed, /ref\(`wallet\/\$\{u\.uid\}`\)/);
    assert.match(ed, /casa: w\.casa \|\| \{\}/);
    assert.match(ed, /ridisegna: disegnaPannello, cosmetici \}/);
    assert.doesNotMatch(ed, /possedutiMotivi|leggiPossedutiMotivi|cosmetici\.compra|Unlock your new/, 'niente più acquisto permanente di avatar e canzoni');
    // il cambio: il server paga e scrive; qui si aggiorna la carta (già "salvata"), la cronologia dell'undo, il portafoglio e il registro
    assert.match(ed, /window\.Negozio\.cambia\(window, \{ tipo, id, \.\.\.\(extra \|\| \{\}\) \}\)/);
    assert.match(ed, /tipo === 'colore' \? \{ color: r\.color \}/);
    assert.match(ed, /prezzo: \(tipo, id\) => \(window\.Cosmetici && window\.Cosmetici\.prezzoCambio\(tipo, contestoCosmetici\(\), id\)\)/, 'tornare a quello di casa non costa'); 
    assert.match(ed, /C\.profiloDalServer\(valori\)/);
    assert.match(ed, /for \(const f of storia\) Object\.assign\(f\.profilo, valori\)/);
    assert.match(ed, /await Promise\.all\(\[leggiPortafoglio\(true\), leggiRegistro\(true\)\]\)/);
    assert.match(ed, /else if \(r\.motivo === 'taken'\) await leggiRegistro\(true\)/);
    // SAVE non scrive mai avatar e canzone
    assert.match(ed, /CAMPI_DEL_SERVER = \['avatar', 'color', 'musicName', 'musicaPreferita'\]/);
    assert.match(ed, /const cambiati = P\.CAMPI_PROFILO\.filter\(k => !CAMPI_DEL_SERVER\.includes\(k\) && profilo\[k\] !== salvato\[k\]\)/);
    assert.match(ed, /P\.CAMPI_PROFILO\.some\(k => !CAMPI_DEL_SERVER\.includes\(k\) && ora\[k\] !== salvato\[k\]\)/);
    // il registro dei riservati
    assert.match(ed, /ref\('cosmeticiPresi'\)/);
    assert.match(ed, /presoDa: id => \{ const o = registro && registro\[id\]; return o && o !== C\.stato\.dati\.chiave \? String\(o\) : ''; \}/);
    assert.match(leggi('docs', 'public-card.js'), /profiloDalServer\(valori\) \{\s*impostaProfilo\(valori\);[\s\S]*?stato\.infoSalvata = \{ \.\.\.stato\.infoSalvata, \.\.\.salvati \}/);

    const tr = leggi('docs', 'public-editor-trainer.js');
    assert.match(tr, /async function chiediCambio\(ctx,/);
    assert.match(tr, /window\.Negozio\.frasiCambio\(\{ tipo, id, prezzo: p\.prezzo, gratis: p\.gratis, ritorno: p\.ritorno, saldo: cosmetici\.saldo\(\), corrente, casa: cosmetici\.casa\(tipo\), nomeCorrente \}\)/);
    assert.match(tr, /chiediCambio\(ctx, \{ tipo: 'avatar', id, nome: `Avatar \$\{n\}`/);
    assert.match(tr, /chiediCambio\(ctx, \{ tipo: 'colore', id, nome: `Colour \$\{C0\}`, colore: C0 \}\)/, 'il colore passa dal server come l\'avatar e la canzone');
    assert.match(tr, /casaMio = !!id && id === casaCo/);
    assert.match(tr, /if \(casaMio\) b\.classList\.add\('is-casa'\)/);
    assert.match(tr, /cosmetici\.presoDa\(id\)/, 'i colori riservati da altri sono grigi');
    assert.match(leggi('docs', 'style-public-editor.css'), /\.pe-campione\.is-casa::before \{ content: '★'/);
    assert.match(tr, /chiediCambio\(ctx, \{ tipo: 'canzone', id, nome: c\.nome, extra: \{ url: c\.url, nome: c\.nome \} \}\)/);
    assert.match(tr, /chiediCambio\(ctx, \{ tipo: 'canzone', id: '', nome: 'No song', extra: \{\} \}\)/, 'togliere la canzone passa dal server e libera quella di prima');
    assert.doesNotMatch(tr, /chiediSblocco|pe-bloccato|🔒|cosmetici\.possiede|cosmetici\.compra/, 'niente lucchetti: ogni cambio costa, non ci sono voci "bloccate"');
    assert.match(tr, /is-casa/);
    assert.match(tr, /const doAltri = f => cosmetici\.presoDa\(idAv\(f\)\)/);
    assert.match(tr, /comePresa\(b, `Avatar \$\{n\}`, `Owned by \$\{cosmetici\.nomeDi\(doAltri\(f\)\)\}`\)/);
    assert.match(tr, /doAltri\(c\) \? comePresa\(scelta, c\.nome, `Owned by/);
    assert.match(tr, /disabled: !profilo\.musicaPreferita/, '"None" è spento se non c\'è una canzone');
    assert.match(N.frase('taken'), /Someone else already has it/);
    assert.match(leggi('docs', 'style-public-editor.css'), /\.pe-avatar-item\.is-casa::after \{ content: '★'/);
    assert.match(leggi('REGOLE-DATABASE.md'), /"cosmeticiPresi": \{ "\.read": true \}/);
    const idx = leggi('functions', 'index.js');
    assert.match(idx, /exports\.cambiaCosmetico = negozio\('cambia'\)/);
    assert.match(idx, /tipo: String\(dati\.tipo \|\| ''\), url: String\(dati\.url \|\| ''\)\.slice\(0, 600\)/);
});

test('frasiCambio: gratis la prima volta; poi quanto costa, che fine fa quello che porti (di casa: resta tuo; altrimenti torna libero) e se le monete bastano; "None" è gratis', () => {
    const base = { tipo: 'avatar', id: 'avatar-5', prezzo: 40, gratis: false, saldo: 220, corrente: 'avatar-9', casa: 'avatar-7', nomeCorrente: 'Avatar 9' };
    const f = N.frasiCambio(base);
    assert.deepEqual(f.righe, ['Changing your avatar costs 40 🪙, and you have 220 🪙.', 'The new one is yours while you wear it.', 'Avatar 9 goes back to the pool: anyone can take it.']);
    assert.deepEqual([f.conferma, f.ok], ['Change · 40 🪙', true]);
    assert.ok(N.frasiCambio({ ...base, corrente: 'avatar-7', nomeCorrente: 'Avatar 7' }).righe.includes('Avatar 7 stays yours for good.'), 'quello di casa resta tuo');
    // tornare al primo (quello di casa) non costa mai: lo dice, e quello che portavi torna libero
    const ritorno = N.frasiCambio({ ...base, id: 'avatar-7', prezzo: 0, ritorno: true });
    assert.deepEqual(ritorno, { righe: ['It is your first avatar: coming back to it is free, and it stays yours for good.', 'Avatar 9 goes back to the pool: anyone can take it.'], conferma: 'Go back for free', ok: true });
    assert.equal(N.frasiCambio({ ...base, id: 'avatar-7', prezzo: 0, ritorno: true, saldo: 0 }).ok, true, 'senza monete si può tornare al primo');
    // il colore parla di "colour"
    const colore = N.frasiCambio({ tipo: 'colore', id: 'colore-ff8800', prezzo: 100, gratis: false, saldo: 220, corrente: 'colore-6b93b0', casa: 'colore-6b93b0', nomeCorrente: 'Colour #6B93B0' });
    assert.deepEqual(colore.righe, ['Changing your colour costs 100 🪙, and you have 220 🪙.', 'The new one is yours while you wear it.', 'Colour #6B93B0 stays yours for good.']);
    assert.match(N.frasiCambio({ tipo: 'colore', id: 'colore-ff8800', prezzo: 0, gratis: true, saldo: 0, corrente: '', casa: '' }).righe[0], /Your first colour is free, and it stays yours for good: nobody else can take it, even when you wear another one later, and coming back to it is always free\./);
    const povero = N.frasiCambio({ ...base, saldo: 39 });
    assert.equal(povero.ok, false);
    assert.match(povero.righe[0], /you have 39 🪙\. Play some sets to earn more coins\.$/);
    const primo = N.frasiCambio({ tipo: 'avatar', id: 'avatar-5', prezzo: 0, gratis: true, saldo: 0, corrente: '', casa: '' });
    assert.deepEqual(primo, { righe: ['Your first avatar is free, and it stays yours for good: nobody else can take it, even when you wear another one later, and coming back to it is always free.'], conferma: 'Choose for free', ok: true });
    // senza nessuna canzone: gratis, e dice che fine fa quella di adesso
    assert.deepEqual(N.frasiCambio({ tipo: 'canzone', id: '', prezzo: 0, gratis: false, saldo: 0, corrente: 'canzone-aaaaaaaa', casa: 'canzone-bbbbbbbb' }),
        { righe: ['You will have no song.', 'Your current song goes back to the pool: anyone can take it.'], conferma: 'Remove it', ok: true });
    assert.deepEqual(N.frasiCambio({ tipo: 'canzone', id: '', prezzo: 0, gratis: false, saldo: 0, corrente: 'canzone-aaaaaaaa', casa: 'canzone-aaaaaaaa' }).righe, ['You will have no song.', 'Your current song stays yours for good.']);
    assert.match(N.frasiCambio({ tipo: 'canzone', id: 'canzone-cccccccc', prezzo: 60, gratis: false, saldo: 100, corrente: 'canzone-aaaaaaaa', casa: '' }).righe[0], /Changing your song costs 60 🪙/);
});
