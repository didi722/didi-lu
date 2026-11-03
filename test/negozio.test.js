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

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('html: saldo, le tre categorie, compra con il prezzo (spento se mancano monete), "Put on"/"Take off" per ciò che si ha, i movimenti più recenti prima; testo protetto', () => {
    const h = N.html({ saldo: 220, posseduti: { 'aura-oro': 1 }, info: { aura: 'aura-oro', pkmShiny: false }, movimenti: [{ t: Date.UTC(2026, 10, 2), importo: 20, motivo: 'Season set won' }, { t: Date.UTC(2026, 10, 3), importo: -150, motivo: '<b>Bought</b>' }] });
    assert.match(h, /🪙 220/);
    for (const t of ['Shiny companion', 'Trainer aura', 'Page patterns']) assert.ok(h.includes(t), t);
    assert.match(h, /data-ng="compra" data-id="shiny">200 🪙/);
    assert.match(h, /data-ng="compra" data-id="aura-arcobaleno" disabled>250 🪙/, '220 monete: l\'arcobaleno costa 250');
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
