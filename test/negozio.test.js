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
    const h = N.html({ saldo: 220, posseduti: { 'aura-oro': 1 }, info: { aura: 'aura-oro', pkmShiny: false }, movimenti: [{ t: Date.UTC(2026, 10, 2), importo: 20, motivo: 'Season set won' }, { t: Date.UTC(2026, 10, 3), importo: -150, motivo: '<b>Bought</b>' }] });
    assert.match(h, /🪙 220/);
    for (const t of ['Shiny companion', 'Trainer aura', 'Page patterns']) assert.ok(h.includes(t), t);
    assert.match(h, new RegExp(`data-ng="compra" data-id="shiny">${C.perId('shiny').prezzo} 🪙`));
    assert.match(h, new RegExp(`data-ng="compra" data-id="aura-arcobaleno" disabled>${C.perId('aura-arcobaleno').prezzo} 🪙`), '220 monete: l\'arcobaleno costa di più');
    assert.match(h, /data-ng="equipa" data-id="aura-oro" data-attivo="0">Take off/, 'l\'aura in uso si toglie');
    assert.match(h, /On now/);
    assert.match(h, /&lt;b&gt;Bought&lt;\/b&gt;/);
    assert.ok(h.indexOf('Bought') < h.indexOf('Season set won'), 'il movimento più recente prima');
    assert.match(h, /-150/);
    assert.match(N.html({ saldo: 0 }), /Nothing yet: play a set!/);
    assert.match(N.html({ saldo: 5, messaggio: 'Not enough coins.' }), /role="status">Not enough coins\./);
    assert.doesNotMatch(N.html({ saldo: 1000, occupato: false }), /disabled/);
    assert.match(N.html({ saldo: 1000, occupato: true }), /disabled/);
});

test('html: un motivo dello sfondo in uso nella pagina resta di chi lo usa; i motivi non si "mettono" da qui', () => {
    const h = N.html({ saldo: 0, pagina: { sfondo: { motivo: 'raggi' } } });
    assert.match(h, /Sunburst<\/b><small>Yours: pick it in Customize on your page/);
    assert.match(h, /Stars<\/b>[\s\S]*?data-id="sfondo-stelle" disabled>100 🪙/);
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
    assert.match(pc, /'data-aura':/);
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

test('htmlShinyTeam: una riga per Pokémon; i shiny sono "Shiny ✓", gli altri hanno il prezzo (spento senza monete); un tocco arma ("Sure?"), il testo è protetto', () => {
    const base = { team: 'Alfa <b>', saldo: 150, prezzo: 100, pokemon: [{ nome: 'Garchomp', shiny: true, brillante: 'https://x/g-s.gif' }, { nome: 'Incineroar', shiny: false, normale: 'https://x/i.gif', brillante: 'https://x/i-s.gif' }, { nome: '<i>X</i>', shiny: false }] };
    const h = N.htmlShinyTeam(base);
    assert.match(h, /✨ Shiny · Alfa &lt;b&gt;/);
    assert.match(h, /🪙 150/);
    assert.equal((h.match(/class="ng-voce ng-pkm/g) || []).length, 3);
    assert.match(h, /Garchomp<\/b><small>Shiny for good<\/small><\/span><span class="ng-fatto">Shiny ✓/);
    assert.match(h, /Incineroar<\/b><small>Normal colours<\/small><\/span><button type="button" class="ng-bottone ng-compra" data-ng="shiny" data-i="1">100 🪙<\/button>/);
    assert.match(h, /<img src="https:\/\/x\/i\.gif"[^>]*>(<i>→<\/i>)<img src="https:\/\/x\/i-s\.gif"/, 'prima/dopo');
    assert.doesNotMatch(h, /<i>X<\/i>/, 'il nome è protetto');
    // un tocco arma il pulsante di quel Pokémon soltanto
    const armato = N.htmlShinyTeam({ ...base, armato: 1 });
    assert.match(armato, /class="ng-bottone ng-compra ng-sicuro" data-ng="shiny" data-i="1">Sure\? 100 🪙/);
    assert.match(armato, /Press again to confirm/);
    assert.equal((armato.match(/ng-sicuro/g) || []).length, 1);
    // senza monete o mentre si compra i pulsanti sono spenti
    assert.equal((N.htmlShinyTeam({ ...base, saldo: 99 }).match(/data-ng="shiny"[^>]*disabled/g) || []).length, 2);
    assert.equal((N.htmlShinyTeam({ ...base, occupato: true }).match(/data-ng="shiny"[^>]*disabled/g) || []).length, 2);
    assert.match(N.htmlShinyTeam({ ...base, messaggio: 'Not enough coins.' }), /role="status">Not enough coins\./);
    assert.match(N.htmlShinyTeam({ team: 'Vuoto', pokemon: [] }), /This team has no Pokémon yet/);
    assert.match(N.htmlShinyTeam({ team: 'Vuoto', pokemon: [{ nome: 'A' }] }), new RegExp(`data-i="0"[^>]*>${C.PREZZI.shinyPokemon} 🪙`), 'senza prezzo nello stato vale quello del catalogo');
});

test('negozio: i guadagni nel testo vengono da PREMI, la guida dice dove si spendono avatar, canzoni e shiny; "free" nei movimenti a zero; le frasi degli errori nuovi', () => {
    const h = N.html({ saldo: 0, movimenti: [{ t: Date.UTC(2026, 10, 3), importo: 0, motivo: 'Free: Avatar 12' }] });
    const P = C.PREMI;
    assert.match(h, new RegExp(`a season set pays ${P.set.ufficiale.giocato}, or ${P.set.ufficiale.giocato + P.set.ufficiale.vinto} if you win it`));
    assert.match(h, new RegExp(`a friendly pays ${P.set.amichevole.giocato} or ${P.set.amichevole.giocato + P.set.amichevole.vinto} \\(up to ${P.tettoAmichevoliGiorno} a day\\)`));
    assert.match(h, new RegExp(`Avatars \\(${C.PREZZI.avatar} 🪙\\) and songs \\(${C.PREZZI.canzone} 🪙\\)`));
    assert.match(h, new RegExp(`Shiny Pokémon \\(${C.PREZZI.shinyPokemon} 🪙 each\\): the ✨ button on a team in your <b>Box</b>`));
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
    assert.match(box, /<script src="cosmetici\.js"><\/script>\s*<script src="negozio\.js"><\/script>/);
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

test('cablaggio: l\'editor legge il portafoglio, mostra il lucchetto su avatar e canzoni non sbloccati e al salvataggio non accetta quelli non sbloccati', () => {
    const ed = leggi('docs', 'public-editor.js');
    assert.match(ed, /function leggiPortafoglio\(forza\)/);
    assert.match(ed, /ref\(`wallet\/\$\{u\.uid\}`\)/);
    assert.match(ed, /cosmetici\.possiede\(avatarId\)[\s\S]*?cosmetici\.possiede\(canzoneId\)[\s\S]*?Unlock your new/);
    assert.match(ed, /ridisegna: disegnaPannello, cosmetici \}/);
    assert.doesNotMatch(ed, /possedutiMotivi|leggiPossedutiMotivi/, 'un solo portafoglio per tutto');
    const tr = leggi('docs', 'public-editor-trainer.js');
    assert.match(tr, /function chiediSblocco\(ctx,/);
    assert.match(tr, /chiediSblocco\(ctx, \{ id, nome: `Avatar \$\{n\}`, tipo: 'avatar'/);
    assert.match(tr, /chiediSblocco\(ctx, \{ id, nome: c\.nome, tipo: 'song'/);
    assert.match(tr, /Unlock for free/);
    assert.match(tr, /None' \}\)|testo: 'None'/, 'togliere la canzone resta gratis');
    assert.match(leggi('docs', 'style-public-editor.css'), /\.pe-avatar-item\.pe-bloccato::after \{ content: '🔒'/);
});
