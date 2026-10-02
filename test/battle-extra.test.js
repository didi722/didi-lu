'use strict';
// battle-extra.js: a quale carta della colonna laterale corrisponde ciascun Pokémon di Showdown.
// Il file è un modulo del browser: lo si legge e si prova in un contesto isolato, senza pagina.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sorgente = fs.readFileSync(path.join(__dirname, '..', 'docs', 'battle-extra.js'), 'utf8').replace(/^export /gm, '');
const BASI = { 'Calyrex-Ice': 'Calyrex', 'Calyrex-Shadow': 'Calyrex', Calyrex: 'Calyrex', 'Charizard-Mega-X': 'Charizard' };
const dex = { species: { get: s => ({ baseSpecies: BASI[s] || s, name: s }) } };
const dentro = vm.runInNewContext(`${sorgente}\n({ abbina, setDi, S })`, { window: {}, document: {}, console });
const { abbina, setDi, S } = dentro;

const pkm = (speciesForme, name = speciesForme) => ({ speciesForme, name });
const carta = (specie, nome = specie) => ({ specie, nome });
const battle = { dex };

test('due Calyrex dello stesso team, stesso soprannome: ognuno trova la propria carta anche se side.pokemon è rimescolato', () => {
    const carte = [carta('Calyrex-Ice', 'Calyrex'), carta('Calyrex-Shadow', 'Calyrex'), carta('Clefairy')];
    const shadow = pkm('Calyrex-Shadow', 'Calyrex'), ice = pkm('Calyrex-Ice', 'Calyrex'), clefairy = pkm('Clefairy');
    for (const ordine of [[ice, shadow, clefairy], [shadow, ice, clefairy], [clefairy, shadow, ice]]) {
        const [a, b, c] = abbina(battle, carte, ordine);
        assert.equal(a, ice);
        assert.equal(b, shadow);
        assert.equal(c, clefairy);
    }
});

test('con soprannomi diversi e stessa forma si distingue dal soprannome', () => {
    const carte = [carta('Calyrex-Ice', 'Bob'), carta('Calyrex-Ice', 'Ann')];
    const ann = pkm('Calyrex-Ice', 'Ann'), bob = pkm('Calyrex-Ice', 'Bob');
    assert.deepEqual(abbina(battle, carte, [ann, bob]), [bob, ann]);
});

test('una forma cambiata in battaglia (Mega) si abbina per specie base', () => {
    const mega = pkm('Charizard-Mega-X', 'Charizard'), clefairy = pkm('Clefairy');
    assert.deepEqual(abbina(battle, [carta('Charizard'), carta('Clefairy')], [clefairy, mega]), [mega, clefairy]);
});

test('ogni Pokémon di Showdown serve una carta sola; chi non c\'è resta null', () => {
    const carte = [carta('Calyrex-Ice', 'Calyrex'), carta('Calyrex-Ice', 'Calyrex')];
    const unico = pkm('Calyrex-Ice', 'Calyrex');
    const r = abbina(battle, carte, [unico]);
    assert.equal(r.filter(Boolean).length, 1);
    assert.deepEqual(abbina(battle, [carta('Clefairy')], []), [null]);
});

test('setDi sceglie il set della forma giusta anche con lo stesso soprannome', () => {
    const squadra = [
        { name: 'Calyrex', species: 'Calyrex-Shadow', moves: ['Astral Barrage'] },
        { name: 'Calyrex', species: 'Calyrex-Ice', moves: ['Glacial Lance'] }
    ];
    const shadow = pkm('Calyrex-Shadow', 'Calyrex'), ice = pkm('Calyrex-Ice', 'Calyrex');
    S.squadre.p1 = squadra;
    S.battle = { dex, p1: { pokemon: [ice, shadow] } };      // side.pokemon rimescolato
    assert.equal(setDi('p1', ice, dex), squadra[1]);
    assert.equal(setDi('p1', shadow, dex), squadra[0]);
});

test('setDi: un Pokémon con la forma cambiata (Mega) trova il suo set per specie base', () => {
    S.squadre.p1 = [{ name: 'Zard', species: 'Charizard' }, { name: 'Clefairy', species: 'Clefairy' }];
    const mega = pkm('Charizard-Mega-X', 'Zard');
    S.battle = { dex, p1: { pokemon: [pkm('Clefairy'), mega] } };
    assert.equal(setDi('p1', mega, dex), S.squadre.p1[0]);
});

test('setDi: due Pokémon identici nel team hanno ciascuno il proprio set (abbinamento esclusivo)', () => {
    const a = { name: 'Pika', species: 'Pikachu', moves: ['Thunderbolt'] }, b = { name: 'Pika', species: 'Pikachu', moves: ['Surf'] };
    S.squadre.p2 = [a, b];
    const p = pkm('Pikachu', 'Pika'), q = pkm('Pikachu', 'Pika');
    S.battle = { dex, p2: { pokemon: [p, q] } };
    assert.equal(setDi('p2', p, dex), a);
    assert.equal(setDi('p2', q, dex), b);
});
