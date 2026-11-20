'use strict';
// pokedex-nazionale.js: l'elenco dei Pokémon in ordine di Pokédex nazionale, generato dai dati del simulatore (tools/pokedex-nazionale/genera.cjs).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('../tools/pokedex-nazionale/genera.cjs');
const N = require('../docs/pokedex-nazionale.js');

test('il file generato è quello che dà il generatore dai dati del simulatore (dopo un aggiornamento: node tools/pokedex-nazionale/genera.cjs)', () => {
    const atteso = G.sorgente(G.costruisci(require(G.ORIGINE).BattlePokedex));
    assert.equal(fs.readFileSync(G.FUORI, 'utf8'), atteso);
});

test('le specie: 1025 numeri, dal 1 (Bulbasaur) al 1025 (Pecharunt), senza buchi né nomi doppi', () => {
    assert.equal(N.nomi.length, 1025);
    assert.equal(N.nomi[0], 'Bulbasaur');
    assert.equal(N.nomi[24], 'Pikachu');
    assert.equal(N.nomi[121], 'Mr. Mime');
    assert.equal(N.nomi[444], 'Garchomp');
    assert.equal(N.nomi[1024], 'Pecharunt');
    assert.ok(N.nomi.every(n => typeof n === 'string' && n.length > 0), 'ogni numero ha un nome');
    assert.equal(new Set(N.nomi).size, 1025);
});

test('gli id: ogni specie e forma ha il numero della sua specie base; niente CAP né Pokémon fan-made', () => {
    assert.equal(N.ids.bulbasaur, 1);
    assert.equal(N.ids.venusaurmega, 3);
    assert.equal(N.ids.ninetalesalola, 38);
    assert.equal(N.ids.urshifurapidstrike, 892);
    assert.equal(N.ids.mrmime, 122);
    assert.equal(N.ids.pecharunt, 1025);
    for (const [id, n] of Object.entries(N.ids)) {
        assert.ok(/^[a-z0-9]+$/.test(id), `${id}: id nel formato di Showdown`);
        assert.ok(Number.isInteger(n) && n >= 1 && n <= 1025, `${id}: numero tra 1 e 1025 (è ${n})`);
    }
    // ogni specie base è nella tabella con il suo numero
    N.nomi.forEach((nome, i) => assert.equal(N.ids[nome.toLowerCase().replace(/[^a-z0-9]+/g, '')], i + 1, nome));
    assert.ok(Object.keys(N.ids).length > 1300, 'con le forme');
});

test('costruisci: salta le CAP, i Pokémon fan-made e quelli senza numero; le forme non danno il nome del numero', () => {
    const c = G.costruisci({
        uno: { num: 1, name: 'Uno' },
        unomega: { num: 1, name: 'Uno-Mega', baseSpecies: 'Uno', forme: 'Mega' },
        cap: { num: 5, name: 'Cap', isNonstandard: 'CAP' },
        fan: { num: 7, name: 'Fan', isNonstandard: 'Custom' },
        negativo: { num: -3, name: 'Neg' },
        due: { num: 2, name: 'Due' }
    });
    assert.deepEqual(c.nomi, ['Uno', 'Due']);
    assert.deepEqual(c.ids, { due: 2, uno: 1, unomega: 1 });
    assert.deepEqual(G.costruisci(null), { nomi: [], ids: {} });
});
