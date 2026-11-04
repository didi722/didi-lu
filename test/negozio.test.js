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
// la pagina dello Shop vista come un testo solo (le sezioni le mette shop.js): catalogo, guida e ultimi movimenti
const pagina = s => N.catalogoHtml(s) + N.movimentiHtml((s || {}).movimenti);

test('html: saldo, le tre categorie, compra con il prezzo (spento se mancano monete), "Put on"/"Take off" per ciò che si ha, i movimenti più recenti prima; testo protetto', () => {
    const h = pagina({ saldo: 650, posseduti: { 'aura-oro': 1 }, info: { aura: 'aura-oro', pkmShiny: false }, movimenti: [{ t: Date.UTC(2026, 10, 2), importo: 20, motivo: 'Season set won' }, { t: Date.UTC(2026, 10, 3), importo: -150, motivo: '<b>Bought</b>' }] });
    for (const t of ['Shiny companion', 'Trainer aura', 'Page patterns']) assert.ok(h.includes(t), t);
    assert.match(h, new RegExp(`data-ng="compra" data-id="aura-fiamma">${C.perId('aura-fiamma').prezzo} 🪙`), '650 monete: l\'aura da 400 si può comprare');
    assert.match(h, new RegExp(`data-ng="compra" data-id="shiny" disabled>${C.perId('shiny').prezzo} 🪙`), 'il compagno shiny (800) no');
    assert.match(h, new RegExp(`data-ng="compra" data-id="aura-arcobaleno" disabled>${C.perId('aura-arcobaleno').prezzo} 🪙`), 'e nemmeno l\'arcobaleno');
    assert.match(h, /data-ng="equipa" data-id="aura-oro" data-attivo="0">Take off/, 'l\'aura in uso si toglie');
    assert.match(h, /On now/);
    assert.match(h, /&lt;b&gt;Bought&lt;\/b&gt;/);
    assert.ok(h.indexOf('Bought') < h.indexOf('Season set won'), 'il movimento più recente prima');
    assert.match(h, /-150/);
    assert.match(pagina({ saldo: 0 }), /Nothing yet: play a set!/);
    assert.doesNotMatch(pagina({ saldo: 1000, occupato: false, stagioni: { s1: 'playing' } }), /disabled/);
    assert.match(pagina({ saldo: 1000, occupato: true }), /disabled/);
});

test('html e anteprime: gli effetti del nome e del palco hanno il loro gruppo, l\'anteprima con l\'effetto vero (attributi di effetti-pagina.css) e si mettono e tolgono dal campo giusto', () => {
    const h = pagina({ saldo: 5000, posseduti: { 'nome-neon': 1, 'palco-neve': 1 }, info: { effettoNome: 'nome-neon', color: '#FF8800' }, stagioni: { s1: 'playing' } });
    for (const t of ['Name effects', 'Stage effects']) assert.ok(h.includes(`<h3>${t}</h3>`), t);
    for (const c of C.CATALOGO.filter(x => x.tipo === 'nome' && !x.edizione)) assert.match(h, new RegExp(`data-id="${c.id}"[^>]*><span class="ng-anteprima" style="--pp-nome:#FF8800"><span class="ng-nome-prova" data-effetto-nome="${c.id}" data-testo="NAME">NAME</span>`), c.id);
    for (const c of C.CATALOGO.filter(x => x.tipo === 'palco' && !x.edizione)) assert.match(h, new RegExp(`data-id="${c.id}"[^>]*><span class="ng-anteprima" data-effetto-palco="${c.id}" style="--ng-c:#FF8800"></span>`), c.id);
    assert.match(h, /data-ng="equipa" data-id="nome-neon" data-attivo="0">Take off/, 'quello che porti si toglie');
    assert.match(h, /data-ng="equipa" data-id="palco-neve" data-attivo="1">Put on/, 'quello che hai ma non porti si mette');
    assert.match(h, new RegExp(`data-ng="compra" data-id="nome-oro">${C.perId('nome-oro').prezzo} 🪙`));
    assert.match(h, /On now/);
    // il colore di chi guarda è solo un colore: altro (o niente) cade sul blu di riserva e non entra nel tag
    assert.match(pagina({ saldo: 0, info: { color: '"><script>x</script>' } }), /--pp-nome:#6b93b0/);
    assert.doesNotMatch(pagina({ saldo: 0, info: { color: '"><script>x</script>' } }), /<script>x/);
    assert.match(pagina({ saldo: 0 }), /--ng-c:#6b93b0/);
    // lo Shop carica il foglio degli effetti e le anteprime hanno lo spazio per mostrarli
    assert.match(leggi('docs', 'shop.html'), /<link rel="stylesheet" href="effetti-pagina\.css">/);
    assert.match(N.STILE, /\.ng-voce\[data-tipo=palco\] \.ng-anteprima\{position:relative;overflow:hidden;container-type:size;--ef-u:3cqh\}/, 'il palco in miniatura è un container e i puntini sono più grandi');
    assert.match(N.frase('not-yet'), /next season/);
    assert.match(N.frase('ended'), /has ended/);
});

test('html: un motivo dello sfondo in uso nella pagina resta di chi lo usa; i motivi non si "mettono" da qui', () => {
    const h = pagina({ saldo: 0, pagina: { sfondo: { motivo: 'raggi' } } });
    assert.match(h, /Sunburst<\/b><small>Yours: pick it in Customize on your page/);
    assert.match(h, new RegExp(`Stars</b>[\\s\\S]*?data-id="sfondo-stelle" disabled>${C.perId('sfondo-stelle').prezzo} 🪙`));
    assert.doesNotMatch(h, /data-ng="equipa" data-id="sfondo/);
});

test('anteprime: aure con il loro colore, sfondi con il motivo vero, shiny con lo sprite del compagno; senza dati restano semplici e il testo ostile non esce dal tag', () => {
    const sfondo = P.sfondoCss({ motivo: 'stelle', colore: '#ffd966', forza: 3 }, '#31c489');
    const h = pagina({ saldo: 0, anteprime: { 'sfondo-stelle': sfondo, shiny: { sprite: Sprite.gif('Garchomp', true) } } });
    assert.match(h, /data-id="sfondo-stelle"[^>]*><span class="ng-anteprima" style="background-color:#ffd966;background-image:url\(&quot;data:image\/svg\+xml,/);
    assert.match(h, /<img src="https:\/\/play\.pokemonshowdown\.com\/sprites\/ani-shiny\/garchomp\.gif"/);
    const senza = pagina({ saldo: 0 });
    assert.match(senza, /data-id="shiny"[^>]*><span class="ng-anteprima ng-scintilla"><\/span>/, 'senza sprite: la scintilla');
    assert.match(senza, /data-id="aura-oro"[^>]*><span class="ng-anteprima" style="--ng-c:#ffcc33"><\/span>/);
    assert.match(senza, /data-id="sfondo-raggi"[^>]*><span class="ng-anteprima" style="--ng-c:#d9dde6"><\/span>/, 'senza motivo: un quadrato semplice');
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

test('cablaggio: lo Shop è una pagina (non sta più nella campanella); shiny nella pagina, nell\'app e nelle schede; aure nella pagina e nella scheda; nell\'editor niente voci bloccate', () => {
    const sf = leggi('docs', 'sfide.js');
    assert.doesNotMatch(sf, /pieNegozio|apriNegozio|apri-negozio|Negozio\.apri/, 'nella campanella non c\'è più niente da comprare');
    assert.doesNotMatch(sf, /wallet\/\$\{P\.uid\}\/saldo/);
    const pc = leggi('docs', 'public-card.js');
    assert.match(pc, /const brillante = !!\(stato\.dati && stato\.dati\.info && \(window\.Cosmetici \? window\.Cosmetici\.compagnoShiny\(stato\.dati\.info, stato\.dati\.teams\) : stato\.dati\.info\.pkmShiny\)\)/, 'lo shiny del compagno: del Box segue il suo Pokémon, il generico quello comprato');
    assert.match(pc, /'data-aura': cosmeticoDi\(d\.info\.aura, 'aura'\)/);
    assert.match(pc, /const cosmeticoDi = \(id, tipo\) => \{ const c = window\.Cosmetici && window\.Cosmetici\.perId\(id\); return c && c\.tipo === tipo \? id : null; \};/, 'un id vale solo se è di quel tipo');
    assert.match(pc, /'data-effetto-palco': cosmeticoDi\(d\.info\.effettoPalco, 'palco'\)/);
    assert.match(pc, /'data-effetto-nome': effettoNome, 'data-testo': effettoNome \? nome : null/, 'l\'effetto del nome ridisegna il testo: serve data-testo');
    assert.match(leggi('docs', 'public.html'), /<link rel="stylesheet" href="style-public-card\.css">\s*<link rel="stylesheet" href="effetti-pagina\.css">/);
    assert.match(leggi('functions', 'index.js'), /exports\.equipaCosmetico = negozio\('equipa'\)/);
    assert.match(leggi('functions', 'monete.js'), /motivo: d === 'presto' \? 'not-yet' : 'ended'/, 'le edizioni le controlla il server');
    assert.match(pc, /aura: window\.Cosmetici && window\.Cosmetici\.perId\(info\.aura\)/);
    assert.match(leggi('docs', 'public.html'), /<script src="cosmetici\.js"><\/script>\s*<script src="public-card\.js">/);
    assert.match(leggi('docs', 'matches.html'), /pkmShiny: window\.Cosmetici \? Cosmetici\.compagnoShiny\(g, teamBox\)|pkmShiny: window\.Cosmetici \? Cosmetici\.compagnoShiny\(infoPlayer, teamBox\)/, 'nei match il compagno è shiny come lo decide Cosmetici.compagnoShiny');
    assert.match(leggi('docs', 'players.html'), /pkmShiny: window\.Cosmetici \? Cosmetici\.compagnoShiny\(info, player\.teams\) : !!info\.pkmShiny/, 'nei profili il compagno del Box è shiny come quel Pokémon');
    assert.match(leggi('docs', 'app-matches.js'), /gif\(l\.pkm, l\.pkmShiny\)/);
    assert.match(leggi('docs', 'app-classifica.js'), /gif\(p\.pkm, p\.pkmShiny\)/);
    assert.match(leggi('docs', 'app-trainers.js'), /gif\(g\.pkm, g\.pkmShiny\)/);
    for (const id of ['aura-oro', 'aura-fiamma', 'aura-ghiaccio', 'aura-arcobaleno']) assert.ok(leggi('docs', 'style-public-card.css').includes(`data-aura="${id}"`), id);
    const ed = leggi('docs', 'public-editor.js');
    assert.match(ed, /const motivoBloccato = motivo => !!window\.Cosmetici && window\.Cosmetici\.motivoBloccato\(motivo,/);
    assert.match(ed, /Object\.entries\(P\.MOTIVI\)\.filter\(\(\[id\]\) => id === s\.motivo \|\| !motivoBloccato\(id\)\)/, 'nell\'editor compaiono solo i motivi liberi, quelli comprati e quello in uso');
    assert.match(ed, /vaiAlloShop\('tab=pagina'\)[^]*?See them in the Shop →/, 'gli altri motivi sono nello Shop');
    assert.doesNotMatch(ed, /chiediAcquisto|acquistaCosmetico|apri-negozio|pe-bloccato|🔒/, 'nell\'editor non si compra più niente e non ci sono voci bloccate');
    assert.ok(!leggi('docs', 'style-public-editor.css').includes('.pe-bloccato'));
});

test('shinyTeamHtml: una carta per Pokémon con gif grande, tag col nome e pulsante: prezzo (che apre la conferma), "Make shiny" gratis se già comprato, "Back to normal" se è shiny; il testo è protetto', () => {
    const prezzo = nome => C.prezzoShiny(nome).prezzo;
    const base = {
        saldo: 500,
        pokemon: [{ nome: 'Garchomp', shiny: true, brillante: 'https://x/g-s.gif', normale: 'https://x/g.gif' }, { nome: 'Incineroar', shiny: false, normale: 'https://x/i.gif', brillante: 'https://x/i-s.gif' },
            { nome: 'Mewtwo', shiny: false }, { nome: 'Pichu', shiny: false, comprato: true }, { nome: '<i>X</i>', shiny: false }]
    };
    const h = N.shinyTeamHtml(base);
    assert.equal((h.match(/<li class="ng-carta/g) || []).length, 5);
    // shiny: la gif shiny e il pulsante per tornare normale; niente prezzo
    assert.match(h, /<li class="ng-carta ng-shiny" data-tipo="pokemon"><span class="ng-tondo"><img src="https:\/\/x\/g-s\.gif"[^>]*><\/span><b class="ng-tag">Garchomp<\/b><button type="button" class="ng-bottone" data-ng="shiny-off" data-i="0">Back to normal<\/button>/);
    // non shiny: la gif normale, il nome nel tag e il prezzo della sua specie nel pulsante
    assert.match(h, new RegExp(`<img src="https://x/i\\.gif"[^>]*></span><b class="ng-tag">Incineroar</b><button type="button" class="ng-bottone ng-compra" data-ng="shiny" data-i="1">${prezzo('Incineroar')} 🪙</button>`));
    assert.match(h, new RegExp(`Mewtwo</b><button[^>]*data-ng="shiny" data-i="2" disabled>${prezzo('Mewtwo')} 🪙`), 'un leggendario a 500 monete è spento');
    // già comprato e poi tolto: si rimette gratis
    assert.match(h, /Pichu<\/b><button type="button" class="ng-bottone ng-compra" data-ng="shiny-on" data-i="3">Make shiny · free<\/button>/);
    assert.doesNotMatch(h, /<i>X<\/i>/, 'il nome è protetto');
    assert.doesNotMatch(h, /ng-fascia" data-fascia="[a-z]+">[A-Za-z]+<\/span><\/b>/, 'niente tag della rarità sulle carte');
    // la legenda delle fasce: nomi e prezzi, dalla più economica
    const legenda = /<p class="ng-fasce"[^>]*>(.*?)<\/p>/.exec(h)[1];
    assert.deepEqual([...legenda.matchAll(/data-fascia="(\w+)">([^<]+)</g)].map(m => [m[1], m[2]]), C.fasceShiny().map(f => [f.fascia, `${f.nome} ${f.prezzo}`]));
    assert.match(h, /go back to normal and make it shiny again for free/);
    // senza monete o mentre si lavora i pulsanti sono spenti; quelli gratis si spengono solo mentre si lavora
    const spenti = stato => (N.shinyTeamHtml({ ...base, ...stato }).match(/data-ng="shiny[^"]*" data-i="\d"[^>]*disabled/g) || []).length;
    assert.equal(spenti({ saldo: 500 }), 1, 'solo il leggendario');
    assert.equal(spenti({ saldo: prezzo('Mewtwo') }), 0);
    assert.equal(spenti({ saldo: 0 }), 3, 'senza monete: i tre da pagare');
    assert.equal(spenti({ saldo: 99999, occupato: true }), 5, 'mentre si lavora tutti');
    assert.match(N.shinyTeamHtml({ pokemon: [] }), /This team has no Pokémon yet/);
});

test('negozio: i guadagni nel testo vengono da PREMI, la guida dice dove si spendono avatar, canzoni e shiny; "free" nei movimenti a zero; le frasi degli errori nuovi', () => {
    const P = C.PREMI;
    const nota = N.premiHtml();
    const li = (testo, n) => assert.ok(nota.includes(`<li><span>${testo}</span><b>+${n} 🪙</b></li>`), testo);
    li('Season set played', P.set.ufficiale.giocato); li('Season set won', P.set.ufficiale.giocato + P.set.ufficiale.vinto);
    li('Friendly set played', P.set.amichevole.giocato); li('Friendly set won', P.set.amichevole.giocato + P.set.amichevole.vinto);
    li('New bronze badge', P.badge[1]); li('New silver badge', P.badge[2]); li('New gold badge', P.badge[3]);
    li('Season won', P.stagioneVinta); li('Season MVP', P.mvp);
    assert.match(nota, new RegExp(`^<ul class="ng-premi">`));
    assert.match(nota, new RegExp(`Friendly sets pay up to ${P.tettoAmichevoliGiorno} 🪙 a day`));
    assert.equal(N.guidaHtml, undefined, 'il blocco "How it works" non c\'è più');
    const m = N.movimentiHtml([{ t: Date.UTC(2026, 10, 2), importo: 20, motivo: 'Season set won' }, { t: Date.UTC(2026, 10, 3), importo: -150, motivo: '<b>Bought</b>' }, { t: Date.UTC(2026, 10, 3), importo: 0, motivo: 'Free: Avatar 12' }]);
    assert.match(m, /Free: Avatar 12<\/span><b class="ng-piu">free<\/b>/);
    assert.match(m, /&lt;b&gt;Bought&lt;\/b&gt;/);
    assert.ok(m.indexOf('Free: Avatar') < m.indexOf('Season set won'), 'il movimento più recente prima');
    assert.match(m, /-150/);
    assert.match(N.movimentiHtml([]), /Nothing yet: play a set!/);
    for (const x of ['busy', 'already', 'cannot-apply', 'poor', 'owned', 'limit', 'worn', 'not-owned', 'box-companion']) assert.match(N.frase(x), /\w{4}/, x);
    assert.match(N.frase('limit'), /release one of yours/);
    assert.match(N.frase('worn'), /wear another one first/);
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

test('cablaggio: Box con il tasto ✨ che porta allo Shop e lo shiny sulle card; il salvataggio dei team toglie lo shiny non comprato; le altre pagine mostrano lo shiny dei team; il server lo vende', () => {
    const box = leggi('docs', 'box.html');
    assert.doesNotMatch(box, /negozio\.js|rarita-pkm\.js/, 'il Box non apre più finestre di acquisto');
    assert.match(box, /class="card-azione azione-shiny" onclick="event\.stopPropagation\(\); apriShinyTeam\('\$\{team\.id\}'\)"/);
    assert.match(box, /function apriShinyTeam\(id\) \{\s*window\.location\.href = `shop\.html\?tab=pokemon&team=\$\{encodeURIComponent\(id\)\}`;/);
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

test('cablaggio: avatar, colore e canzone si comprano nello Shop (massimo per tipo, a quota piena se ne rilascia uno) e si indossano gratis; nell\'editor ci sono solo quelli che hai', () => {
    // l'editor: solo quelli che hai, indossarli passa dal server (fuori da SAVE)
    const ed = leggi('docs', 'public-editor.js');
    assert.match(ed, /function leggiPortafoglio\(forza\)/);
    assert.match(ed, /ref\(`wallet\/\$\{u\.uid\}`\)/);
    assert.match(ed, /portafoglio = \{ posseduti: w\.posseduti \|\| \{\}, casa: w\.casa \|\| \{\}, pronto: true \}/);
    assert.match(ed, /possedute: tipo => \(window\.Cosmetici \? window\.Cosmetici\.possedutiDiTipo\(tipo, contestoCosmetici\(\)\) : \[\]\)/);
    assert.match(ed, /limite: tipo => \(window\.Cosmetici \? window\.Cosmetici\.LIMITI\[tipo\] : 0\)/);
    assert.match(ed, /const r = await window\.Negozio\.cambia\(window, \{ tipo, id, \.\.\.\(extra \|\| \{\}\) \}\)/, 'indossare lo fa il server');
    assert.match(ed, /C\.profiloDalServer\(valori\)/);
    assert.match(ed, /for \(const f of storia\) Object\.assign\(f\.profilo, valori\)/, '"undo" non riporta indietro quello che ha già fatto il server');
    assert.match(ed, /vaiAlloShop: \(dove = 'tab=allenatore'\) => vaiAlloShop\(dove\)/);
    // aure, effetti e compagno shiny: solo quelli che hai, li mette il server
    assert.match(ed, /window\.Negozio\.chiama\(window, 'equipaCosmetico', \{ id: c\.id, attivo \}\)/);
    assert.match(ed, /C\.provaCosmetici\(c\.tipo === 'shiny' \? \{ pkmShiny: attivo \} : \{ \[c\.campo\]: attivo \? c\.id : null \}\)/);
    assert.match(ed, /catalogo: tipo => .*window\.Cosmetici\.possiede\(c\.id, contestoCosmetici\(\)\)/);
    assert.doesNotMatch(ed, /acquistaCosmetico|rilasciaCosmetico|prezzoAcquisto|leggiRegistro|cosmeticiPresi/, 'dall\'editor non si compra né si rilascia');
    // SAVE non scrive mai avatar, colore e canzone
    assert.match(ed, /CAMPI_DEL_SERVER = \['avatar', 'color', 'musicName', 'musicaPreferita'\]/);
    assert.match(ed, /const cambiati = P\.CAMPI_PROFILO\.filter\(k => !CAMPI_DEL_SERVER\.includes\(k\) && profilo\[k\] !== salvato\[k\]\)/);
    assert.match(ed, /P\.CAMPI_PROFILO\.some\(k => !CAMPI_DEL_SERVER\.includes\(k\) && ora\[k\] !== salvato\[k\]\)/);
    const tr = leggi('docs', 'public-editor-trainer.js');
    for (const t of ['avatar', 'colore', 'canzone']) assert.match(tr, new RegExp(`cosmetici\\.possedute\\('${t}'\\)`), `${t}: solo quelli che hai`);
    assert.match(tr, /sezione\(`Avatar \(\$\{conta\('avatar'\)\}\)`/);
    assert.match(tr, /sezione\(`Signature colour \(\$\{conta\('colore'\)\}\)`/);
    assert.match(tr, /sezione\(`Favourite song \(\$\{conta\('canzone'\)\}\)`/);
    assert.match(tr, /indossa\('avatar', id, `Avatar \$\{n\}`\)/);
    assert.match(tr, /indossa\('colore', id, c\)/);
    assert.match(tr, /indossa\('canzone', id, nome, \{ url: b\.url, nome: b\.nome \}\)/);
    assert.match(tr, /indossa\('canzone', '', '', null\)/, '"No song" toglie la canzone e resta tua');
    assert.match(tr, /Get more in the Shop →/);
    assert.match(tr, /window\.PublicEditor\.estendi\(\{ id: 'oggetti', nome: 'Items', disegna: disegnaItems \}\)/, 'una scheda per quello che hai preso nello Shop');
    for (const [titolo, tipo] of [['Aura', 'aura'], ['Name effect', 'nome'], ['Stage effect', 'palco'], ['Shiny companion', 'shiny']]) assert.match(tr, new RegExp(`sezioneEffetti\\(ctx, '${titolo}', '${tipo}'`), titolo);
    assert.match(tr, /Your first one is free: get it in the Shop\./);
    assert.doesNotMatch(tr, /elencoAvatar|PALETTE_FIRMA|canzoni === |caricaCanzoni|Negozio|prezzoCambio|chiediCambio/, 'nessun elenco di tutti gli avatar, colori o canzoni nell\'editor');

    // lo Shop: la scheda Trainer, la collezione
    const sh = leggi('docs', 'shop.js');
    assert.match(sh, /const possedute = tipo => C\.possedutiDiTipo\(tipo, contestoW\(\)\);/);
    assert.match(sh, /N\.cambia\(window, \{ tipo, id, \.\.\.\(extra \|\| \{\}\) \}\)/, 'indossare lo fa il server');
    assert.match(sh, /const pr = C\.prezzoAcquisto\(tipo, contestoW\(\)\), mie = possedute\(tipo\), limite = C\.LIMITI\[tipo\], piena = mie\.length >= limite;/, 'il prezzo e la quota piena');
    assert.match(sh, /N\.frasiAcquisto\(\{ tipo, nome, prezzo: pr\.prezzo, gratis: pr\.gratis, saldo: S\.saldo, piena, limite, scelta \}\)/);
    assert.match(sh, /N\.chiama\(window, 'acquistaCosmetico', \{ id, \.\.\.\(extra \|\| \{\}\), \.\.\.\(scelta \? \{ rilascia: scelta \} : \{\}\) \}\)/, 'a quota piena si manda cosa rilasciare');
    assert.match(sh, /N\.frasiRilascio\(\{ tipo, nome \}\)/);
    assert.match(sh, /N\.chiama\(window, 'rilasciaCosmetico', \{ id \}\)/);
    assert.match(sh, /data-ng="prendi"/);
    assert.match(sh, /data-ng="rilascia"/);
    assert.match(sh, /data-ng="indossa"/);
    assert.match(sh, /data-ng="canzone-nessuna"/, '"No song" è gratis');
    assert.match(sh, /const presoDa = id => \{ const o = S\.registro\[id\]; return o && o !== S\.giocatore \? String\(o\) : ''; \};/, 'i riservati da altri sono grigi');
    assert.match(sh, /ref\('cosmeticiPresi'\)/);
    assert.match(sh, /<div class="shop-rilascia" role="radiogroup" aria-label="Release one">/, 'a quota piena si sceglie quale rilasciare');
    assert.doesNotMatch(sh, /prezzoCambio|frasiCambio|chiediCambio|casaDi/, 'niente del vecchio cambio a pagamento');
    assert.match(N.frase('taken'), /Someone else already has it/);
    assert.match(leggi('docs', 'shop.js'), /N\.chiama\(window, 'shinyPokemonTeam', \{ team: t\.id, indice: i, attivo \}\)/, 'tornare normale e rimettere shiny passano dal server');
    assert.match(leggi('docs', 'shop.js'), /function chiediShiny\(i\)/, 'lo shiny si compra dopo una conferma con il Pokémon in grande');
    assert.match(leggi('docs', 'style-shop.css'), /\.shop-miio \{[^}]*display: flex/);
    assert.match(leggi('REGOLE-DATABASE.md'), /"cosmeticiPresi": \{ "\.read": true \}/);
    const idx = leggi('functions', 'index.js');
    assert.match(idx, /exports\.cambiaCosmetico = negozio\('cambia'\)/);
    assert.match(idx, /exports\.rilasciaCosmetico = negozio\('rilascia'\)/);
    assert.match(idx, /tipo: String\(dati\.tipo \|\| ''\), url: String\(dati\.url \|\| ''\)\.slice\(0, 600\)/);
    assert.match(idx, /rilascia: String\(dati\.rilascia \|\| ''\)\.slice\(0, 80\)/);
});

test('Shop: la pagina, le schede, l\'anteprima della tua pagina, il menu del sito e quello dell\'app', () => {
    const h = leggi('docs', 'shop.html'), sh = leggi('docs', 'shop.js');
    assert.match(h, /<title>Shop<\/title>/);
    for (const t of ['pagina', 'allenatore', 'pokemon', 'monete']) assert.ok(h.includes(`data-tab="${t}"`), t);
    assert.match(h, /<script src="rarita-pkm\.js"><\/script>\s*<script src="cosmetici\.js"><\/script>\s*<script src="negozio\.js"><\/script>\s*<script src="shop\.js"><\/script>/, 'le fasce di rarità prima del catalogo');
    assert.match(h, /<iframe id="shop-iframe"/);
    // l'anteprima: la pagina pubblica in un riquadro, a cui si manda quello che si prova
    assert.match(sh, /public\.html\?player=\$\{encodeURIComponent\(S\.giocatore\)\}&anteprima=1/);
    assert.match(sh, /postMessage\(\{ tipo: 'shop-prova', valori: \{ \.\.\.base\(\), \.\.\.S\.prova \} \}, window\.location\.origin\)/);
    assert.match(sh, /e\.origin !== window\.location\.origin/, 'si ascolta solo la stessa origine');
    const pc = leggi('docs', 'public-card.js');
    assert.match(pc, /new URLSearchParams\(window\.location\.search\)\.get\('anteprima'\) === '1' && window\.parent !== window/);
    assert.match(pc, /if \(e\.origin !== window\.location\.origin \|\| !e\.data \|\| e\.data\.tipo !== 'shop-prova'\) return;/);
    assert.match(pc, /const COSMETICI_IN_PROVA = \['aura', 'effettoNome', 'effettoPalco', 'pkmShiny'\];/);
    assert.match(leggi('docs', 'style-public-card.css'), /html\.pp-anteprima \.top-auth-bar/);
    // le voci della pagina si comprano e si mettono dal server; lo shiny dei Pokémon pure; tutto da qui
    assert.match(sh, /N\.chiama\(window, 'equipaCosmetico'/);
    assert.match(sh, /if \(ng === 'compra'\) return chiediCatalogo\(C\.perId\(b\.dataset\.id\)\);/, 'prima di comprare dal catalogo si chiede conferma, con la voce in grande');
    assert.match(sh, /Are you sure you want to buy it\?/);
    assert.match(sh, /N\.chiama\(window, 'acquistaCosmetico', \{ id: c\.id \}\)/);
    assert.match(sh, /'shinyPokemonTeam', \{ team: t\.id, indice: i \}/);
    // il menu di tutte le pagine ha SHOP; l'app ha la tessera
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'docs')).filter(n => n.endsWith('.html'))) {
        const t = leggi('docs', f);
        if (/class="menu-item"[^>]*><i class="fas fa-trophy"/.test(t)) assert.match(t, /<a href="shop\.html" class="menu-item"><i class="fas fa-store"><\/i> SHOP<\/a>/, `${f}: manca SHOP nel menu`);
    }
    assert.match(leggi('docs', 'app.js'), /\{ id: 'shop', et: 'Shop', href: 'shop\.html', colore: '#47ea6a', pagine: \['shop\.html'\] \}/);
    assert.match(leggi('docs', 'style-shop.css'), /body\.pg-shop \{ overflow-x: hidden; overflow-y: auto; \}/, 'la base blocca lo scorrimento del body: lo Shop lo ripristina');
});

test('frasiAcquisto: la prima volta è gratis; poi il prezzo e le monete; a quota piena si deve scegliere cosa rilasciare; frasiRilascio: gratis, torna libero per tutti', () => {
    const base = { tipo: 'avatar', nome: 'Avatar 5', prezzo: 100, gratis: false, saldo: 220, piena: false, limite: 3, scelta: '' };
    const f = N.frasiAcquisto(base);
    assert.deepEqual(f.righe, ['Avatar 5 costs 100 🪙, and you have 220 🪙.', 'It is yours: nobody else can take it. You wear it right away.']);
    assert.deepEqual([f.conferma, f.ok], ['Buy · 100 🪙', true]);
    // la prima volta non costa: parla di "colour" per il colore
    const primo = N.frasiAcquisto({ tipo: 'colore', nome: '#FF8800', prezzo: 0, gratis: true, saldo: 0, piena: false, limite: 2, scelta: '' });
    assert.deepEqual(primo, { righe: ['Your first colour is free. It is yours: nobody else can take it. You wear it right away.'], conferma: 'Take it for free', ok: true });
    // senza monete: lo dice e non si può confermare
    const povero = N.frasiAcquisto({ ...base, saldo: 99 });
    assert.equal(povero.ok, false);
    assert.match(povero.righe[0], /you have 99 🪙\. Play some sets to earn more coins\.$/);
    assert.equal(N.frasiAcquisto({ ...base, saldo: 100 }).ok, true, 'le monete esatte bastano');
    // quota piena: si spiega e finché non si sceglie cosa rilasciare non si conferma
    const piena = N.frasiAcquisto({ ...base, piena: true });
    assert.match(piena.righe[2], /You already have 3 avatars, the most you can have\. To get this one, release one of yours \(free\): it goes back to the pool for everyone\./);
    assert.equal(piena.ok, false, 'prima si sceglie');
    assert.equal(N.frasiAcquisto({ ...base, piena: true, scelta: 'avatar-9' }).ok, true);
    assert.equal(N.frasiAcquisto({ ...base, piena: true, scelta: 'avatar-9', saldo: 5 }).ok, false, 'sceglie ma non ha le monete');
    // anche la prima volta gratis a quota piena (impossibile nel modello, ma la frase non deve mentire)
    assert.equal(N.frasiAcquisto({ ...base, gratis: true, prezzo: 0, piena: true }).ok, false);
    // il rilascio: gratis, e per riaverlo bisogna ricomprarlo se nessuno lo prende
    const r = N.frasiRilascio({ tipo: 'canzone', nome: 'Route 1' });
    assert.deepEqual(r, { righe: ['Route 1 goes back to the pool: anyone can take it. Releasing is free, but to get this song back you would have to buy it again, if nobody takes it first.'], conferma: 'Release it' });
    assert.match(N.frasiRilascio({ tipo: 'colore', nome: '#FF8800' }).righe[0], /get this colour back/);
});
