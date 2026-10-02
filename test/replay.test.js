'use strict';
// Replay: niente hover sui Pokémon, barre della salute del sito, e le copie dei file condivisi.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RADICE = path.join(__dirname, '..');
const leggi = p => fs.readFileSync(path.join(RADICE, p), 'utf8');
const { creaReplayHtml, adattaReplayShowdown } = require('../functions/replay-sito.js');

const LOG = [
    '|player|p1|Didi||', '|player|p2|Lu||', '|gen|9', '|poke|p1|Garchomp, L50|', '|poke|p2|Blissey, L50|',
    '|teampreview', '|start', '|switch|p1a: Garchomp|Garchomp, L50|100/100', '|switch|p2a: Blissey|Blissey, L50|100/100',
    '|turn|1', '|move|p1a: Garchomp|Earthquake|p2a: Blissey', '|-damage|p2a: Blissey|40/100', '|turn|2'
];
const replay = () => creaReplayHtml({ log: LOG, p1: { nome: 'Didi', colore: '#31c489' }, p2: { nome: 'Lu' }, etichetta: 'VGC', match: 1, set: 1 });

// regole .statbar di un CSS, con il prefisso tolto: "{selettore} -> {corpo}"
function regoleBarre(css, prefisso) {
    const out = {};
    const re = new RegExp(`(${prefisso.replace('.', '\\.')}\\s[^{}]*?)\\{([^{}]*)\\}`, 'g');
    for (const m of css.matchAll(re)) {
        const selettore = m[1].split(prefisso).join('').replace(/\s+/g, ' ').trim();
        if (selettore.includes('statbar')) out[selettore] = m[2].replace(/\s+/g, ' ').trim();
    }
    return out;
}

test('il replay del simulatore non ha tooltip: niente schede, niente ascoltatori', () => {
    const html = replay();
    assert.match(html, /tooltips\.unlisten\(window\.jQuery\('#campo'\)\)/);
    assert.match(html, /\.palco \.has-tooltip, \.palco \.tooltips \{ pointer-events: none/);
    assert.match(html, /#tooltipwrapper \{ display: none !important; \}/);
    // non c'è più lo stile delle schede dei Pokémon
    assert.ok(!html.includes('#tooltipwrapper .tooltip'));
});

test('il codice dentro il replay è JavaScript valido', () => {
    const html = replay();
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();
    assert.ok(script.includes('giocaReplay') || script.length > 1000);
    assert.doesNotThrow(() => new vm.Script(script));
});

test('replay del simulatore e battle.html hanno le stesse barre della salute', () => {
    const nelReplay = regoleBarre(replay(), '.palco');
    const nelSimulatore = regoleBarre(leggi('docs/style-battle.css'), '.palco');
    assert.ok(Object.keys(nelSimulatore).length >= 20, 'mi aspetto le regole delle barre in style-battle.css');
    assert.deepEqual(nelReplay, nelSimulatore);
});

// ---------- replay di Showdown caricati a mano ----------
const SHOWDOWN = `<!DOCTYPE html>
<meta charset="utf-8" />
<!-- version 1 -->
<title>gen9vgc2024: A vs. B</title>
<style>html,body {font-family:Verdana, sans-serif;}</style>
<div class="wrapper replay-wrapper" style="max-width:1180px;margin:0 auto">
<input type="hidden" name="replayid" value="gen9vgc2024-123" />
<div class="battle"></div><div class="battle-log"></div><div class="replay-controls"></div>
<script type="text/plain" class="battle-log-data">|player|p1|A|1|</script>
</div>
<script>let daily = Math.floor(Date.now()/1000/60/60/24);document.write('<script src="https://play.pokemonshowdown.com/js/replay-embed.js?version'+daily+'"></' + 'script>');</script>
`;

test('un replay di Showdown riceve le barre del sito e perde l\'hover', () => {
    const fuori = adattaReplayShowdown(SHOWDOWN);
    assert.ok(fuori.startsWith(SHOWDOWN.trimEnd()), 'il file originale resta com\'è');
    assert.match(fuori, /sito-replay-adattato/);
    assert.match(fuori, /\.battle \.statbar \.hpbar \{/);
    assert.match(fuori, /\.battle \.has-tooltip, \.battle \.tooltips \{ pointer-events: none !important/);
    assert.match(fuori, /#tooltipwrapper \{ display: none !important; \}/);
    // le variabili di colore che le barre usano ci sono
    for (const v of ['--inchiostro', '--carta', '--crema', '--ambra', '--conferma', '--conferma-scuro', '--pericolo']) {
        assert.ok(fuori.includes(`${v}:`), `manca ${v}`);
    }
});

test('adattare due volte non cambia nulla', () => {
    const una = adattaReplayShowdown(SHOWDOWN);
    assert.equal(adattaReplayShowdown(una), una);
});

test('con </body> l\'aggiunta va prima della chiusura, senza si mette in fondo', () => {
    const conBody = adattaReplayShowdown(`<html><body>${SHOWDOWN}</body></html>`);
    assert.ok(conBody.indexOf('sito-replay-adattato') < conBody.indexOf('</body>'));
    assert.ok(conBody.trim().endsWith('</body></html>'));
    assert.ok(adattaReplayShowdown(SHOWDOWN).indexOf('sito-replay-adattato') > SHOWDOWN.indexOf('battle-log-data'));
});

test('quello che non è un replay di Showdown resta com\'è', () => {
    for (const x of ['', '   ', null, undefined, '<html><body>ciao</body></html>', 'testo qualsiasi']) {
        assert.equal(adattaReplayShowdown(x), x == null ? '' : String(x));
    }
    // neanche un replay già fatto dal sito viene toccato
    const delSito = replay();
    assert.equal(adattaReplayShowdown(delSito), delSito);
});

test('le barre aggiunte ai replay di Showdown sono quelle del replay del sito', () => {
    const adattato = regoleBarre(adattaReplayShowdown(SHOWDOWN), '.battle');
    const delSito = regoleBarre(replay(), '.palco');
    assert.ok(Object.keys(adattato).length >= 20);
    assert.deepEqual(adattato, delSito);
});

// ---------- file condivisi: due copie identiche ----------
test('docs/ e functions/ hanno la stessa copia dei file condivisi', () => {
    for (const nome of ['risultati-match.js', 'replay-sito.js']) {
        assert.equal(leggi(`docs/${nome}`), leggi(`functions/${nome}`), `${nome} è diverso tra docs/ e functions/: copia quello che hai modificato sull'altro`);
    }
});

test('matches.html carica replay-sito.js e adatta i replay che si caricano', () => {
    const html = leggi('docs/matches.html');
    assert.match(html, /<script src="replay-sito\.js"><\/script>/);
    assert.equal((html.match(/await replayAdattato\(file\)/g) || []).length, 2);     // i due punti di upload
    assert.match(html, /adattaReplayShowdown/);
});
