'use strict';
// Il replay mostra le squadre nell'intestazione: chi è sceso in campo e chi è andato KO (semitrasparente), fino al punto in cui è il replay.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const replay = fs.readFileSync(path.join(DOCS, 'replay-sito.js'), 'utf8');
const matches = fs.readFileSync(path.join(DOCS, 'matches.html'), 'utf8');
const finestre = fs.readFileSync(path.join(DOCS, 'finestre.css'), 'utf8');

function squadre(coda, currentStep) {
    const inizio = replay.indexOf('const baseSpecie = ');
    const fine = replay.indexOf('        function inviaSquadre()', inizio);
    assert.ok(inizio > 0 && fine > inizio);
    const ctx = vm.createContext({ battle: { stepQueue: coda, currentStep }, Math, String, JSON });
    vm.runInContext(replay.slice(inizio, fine) + '\nthis.calcola = calcolaSquadre;', ctx);
    return JSON.parse(JSON.stringify(ctx.calcola()));
}

const LOG = [
    '|poke|p1|Incineroar, L50, M|', '|poke|p1|Rillaboom, L50, M|', '|poke|p1|Urshifu-*, L50, M|', '|poke|p1|Amoonguss, L50, F|',
    '|poke|p2|Torkoal, L50, M|', '|poke|p2|Pelipper, L50, F|', '|poke|p2|Dragapult, L50, F|',
    '|start',
    '|switch|p1a: Incineroar|Incineroar, L50, M|100/100', '|switch|p1b: Rillaboom|Rillaboom, L50, M|100/100',
    '|switch|p2a: Torkoal|Torkoal, L50, M|100/100', '|switch|p2b: Pelipper|Pelipper, L50, F|100/100',
    '|turn|1', '|faint|p2b: Pelipper', '|upkeep', '|switch|p2b: Draga|Dragapult, L50, F|100/100',
    '|switch|p1a: Uru|Urshifu-Rapid-Strike, L50, M|100/100'
];
const stato = (r, lato, specie) => r[lato].find(x => x.s === specie).st;

test('squadre: all\'inizio nessuno è sceso; poi chi è in campo (1) e chi è KO (2), solo con le righe già eseguite', () => {
    const prima = squadre(LOG, 8);
    assert.deepEqual(prima.p1.map(x => x.st), [0, 0, 0, 0]);
    assert.equal(prima.p2.length, 3, 'l\'elenco è quello della presentazione (|poke|)');
    const dopo = squadre(LOG, 13);
    assert.equal(stato(dopo, 'p1', 'Incineroar'), 1);
    assert.equal(stato(dopo, 'p2', 'Pelipper'), 1);
    assert.equal(stato(dopo, 'p2', 'Dragapult'), 0);
    const ko = squadre(LOG, 15);
    assert.equal(stato(ko, 'p2', 'Pelipper'), 2);
});

test('squadre: un Pokémon con soprannome o forma diversa dalla presentazione si riconosce (Urshifu-* -> Urshifu-Rapid-Strike, Draga -> Dragapult); i KO non tornano in campo', () => {
    const r = squadre(LOG, LOG.length);
    assert.equal(r.p1.length, 4, 'nessun doppione');
    assert.equal(stato(r, 'p1', 'Urshifu-Rapid-Strike'), 1);
    assert.equal(stato(r, 'p2', 'Dragapult'), 1);
    assert.equal(stato(r, 'p2', 'Pelipper'), 2);
});

test('squadre: senza |poke| (Random) l\'elenco si costruisce da chi scende in campo', () => {
    const r = squadre(['|switch|p1a: A|Pikachu, L82|100/100', '|switch|p2a: B|Eevee, L90|100/100', '|faint|p2a: B'], 3);
    assert.deepEqual(r.p1, [{ s: 'Pikachu', st: 1 }]);
    assert.deepEqual(r.p2, [{ s: 'Eevee', st: 2 }]);
});

test('squadre: il replay le manda alla pagina a ogni cambio (non uguali a prima), la pagina le mostra nelle file dell\'intestazione: KO semitrasparente e grigio, non ancora sceso più tenue', () => {
    assert.match(replay, /aggiornaCampo\(\);\s*inviaSquadre\(\);\s*aggiornaComandi\(\);/);
    assert.match(replay, /setInterval\(\(\) => \{ impostaAvatar\(\); aggiornaCampo\(\); inviaSquadre\(\); \}, 400\)/);
    assert.match(replay, /if \(firma === ultimeSquadre\) return;/);
    assert.match(matches, /e\.data\.tipo !== 'replay-squadre'/);
    assert.match(matches, /img\.dataset\.pkm = p\.nome;/);
    assert.match(matches, /img\.classList\.toggle\('rg-ko', st === 2\)/);
    assert.match(finestre, /\.mini-gifs-row\.rg-attiva img\.rg-ko \{ opacity: \.28; filter: grayscale\(1\); \}/);
    assert.match(finestre, /\.mini-gifs-row\.rg-attiva img \{ opacity: \.5;/);
});
