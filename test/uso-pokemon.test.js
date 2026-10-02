'use strict';
// risultati-match.js: presenze, vittorie e KO reali per tipo e per specie (alla base dei titoli).
// Il file è uno script del sito (funzioni globali): lo si carica in un contesto isolato.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contesto = vm.createContext({ console, fetch: () => { throw new Error('rete non permessa'); }, db: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'risultati-match.js'), 'utf8'), contesto);
// i risultati nascono in un altro "realm" (vm): si ricopiano per poterli confrontare con deepEqual
const copia = x => JSON.parse(JSON.stringify(x));
const calcolaUsoPokemon = (...args) => copia(contesto.calcolaUsoPokemon(...args));
const specieSceseInCampo = (...args) => copia(contesto.specieSceseInCampo(...args));

const TIPI = {
    'Gengar': ['ghost', 'poison'], 'Dusknoir': ['ghost'], 'Garchomp': ['dragon', 'ground'],
    'Scizor': ['bug', 'steel'], 'Clefairy': ['fairy'], 'Calyrex-Shadow': ['psychic', 'ghost']
};
const tipiDi = s => TIPI[s] || [];
const nessunTeam = () => ({ specie: [], tipi: [] });
const pk = (specie, extra = {}) => ({ specie, portato: true, sceso: true, titolare: false, koFatti: 0, svenuto: false, ...extra });
const set = (vincitore, p1, p2 = []) => ({ vincitore, p1: { pokemon: p1 }, p2: { pokemon: p2.length ? p2 : [pk('Clefairy')] } });
const match = (setStats, extra = {}) => ({ vittoria: true, team: 'T', lato: 'p1', setStats, ...extra });

test('due Pokémon spettro nello stesso set: 2 presenze, ma 1 sola vittoria', () => {
    const uso = calcolaUsoPokemon([match({ set1: set('p1', [pk('Gengar', { koFatti: 2 }), pk('Dusknoir', { koFatti: 1 }), pk('Garchomp')]) })], tipiDi, nessunTeam);
    assert.deepEqual(uso.tipi.ghost, { played: 2, won: 1, ko: 3 });
    assert.deepEqual(uso.tipi.poison, { played: 1, won: 1, ko: 2 });
    assert.deepEqual(uso.tipi.dragon, { played: 1, won: 1, ko: 0 });
});

test('chi è stato solo portato (mai sceso in campo) non conta', () => {
    const uso = calcolaUsoPokemon([match({ set1: set('p1', [pk('Garchomp'), pk('Gengar', { sceso: false, portato: true })]) })], tipiDi, nessunTeam);
    assert.equal(uso.tipi.ghost, undefined);
    assert.equal(uso.specie.gengar, undefined);
    assert.equal(uso.specie.garchomp.played, 1);
});

test('i set persi contano le presenze ma non le vittorie; il lato è quello del giocatore', () => {
    const p1 = match({ set1: set('p2', [pk('Scizor', { koFatti: 1 })]), set2: set('p1', [pk('Scizor', { koFatti: 2 })]) });
    let uso = calcolaUsoPokemon([p1], tipiDi, nessunTeam);
    assert.deepEqual(uso.specie.scizor, { nome: 'Scizor', played: 2, won: 1, ko: 3 });
    // lo stesso match visto dall'altro lato: i Pokémon sono quelli di p2
    const dalLato2 = { ...p1, lato: 'p2', vittoria: false };
    uso = calcolaUsoPokemon([dalLato2], tipiDi, nessunTeam);
    assert.deepEqual(uso.specie.clefairy, { nome: 'Clefairy', played: 2, won: 1, ko: 0 });
});

test('la stessa specie due volte nello stesso set: 2 presenze, 1 vittoria', () => {
    const uso = calcolaUsoPokemon([match({ set1: set('p1', [pk('Scizor'), pk('Scizor')]) })], tipiDi, nessunTeam);
    assert.deepEqual(uso.specie.scizor, { nome: 'Scizor', played: 2, won: 1, ko: 0 });
    assert.deepEqual(uso.tipi.bug, { played: 2, won: 1, ko: 0 });
});

test('un Pokémon con due tipi dà una presenza a ciascuno, ma non due vittorie per tipo', () => {
    const uso = calcolaUsoPokemon([match({ set1: set('p1', [pk('Calyrex-Shadow', { koFatti: 3 })]) })], tipiDi, nessunTeam);
    assert.deepEqual(uso.tipi.psychic, { played: 1, won: 1, ko: 3 });
    assert.deepEqual(uso.tipi.ghost, { played: 1, won: 1, ko: 3 });
});

test('set vecchi senza "sceso": si contano solo quelli che hanno lasciato un segno', () => {
    const vecchio = (specie, extra) => { const p = pk(specie, extra); delete p.sceso; return p; };
    const uso = calcolaUsoPokemon([match({ set1: set('p1', [
        vecchio('Garchomp', { titolare: true }), vecchio('Gengar', { koFatti: 1 }), vecchio('Scizor'), vecchio('Dusknoir', { svenuto: true })
    ]) })], tipiDi, nessunTeam);
    assert.equal(uso.specie.garchomp.played, 1);
    assert.equal(uso.specie.gengar.played, 1);
    assert.equal(uso.specie.dusknoir.played, 1);
    assert.equal(uso.specie.scizor, undefined);          // portato, ma non si sa se sia entrato
});

test('match senza dati di set: la composizione del team, una volta per match, vittoria = match vinto', () => {
    const team = () => ({ specie: ['Gengar', 'Dusk (Dusknoir)', 'Garchomp'], tipi: [['ghost', 'poison'], ['ghost'], ['dragon', 'ground']] });
    const uso = calcolaUsoPokemon([
        { vittoria: true, team: 'T', lato: 'p1', setStats: null },
        { vittoria: false, team: 'T', lato: 'p1', setStats: null }
    ], tipiDi, team);
    assert.deepEqual(uso.tipi.ghost, { played: 4, won: 1, ko: 0 });          // 2 spettro × 2 match, 1 vittoria
    assert.deepEqual(uso.specie.dusknoir, { nome: 'Dusknoir', played: 2, won: 1, ko: 0 });
});

test('match con e senza set nello stesso calcolo, e specieSceseInCampo', () => {
    const conSet = match({ set1: set('p1', [pk('Gengar')]), set2: set('p2', [pk('Gengar'), pk('Garchomp', { sceso: false })]) });
    const senza = { vittoria: true, team: 'T', lato: 'p1', setStats: null };
    assert.deepEqual(specieSceseInCampo([conSet, senza]).sort(), ['Gengar']);
    const uso = calcolaUsoPokemon([conSet, senza], tipiDi, () => ({ specie: ['Scizor'], tipi: [['bug', 'steel']] }));
    assert.deepEqual(uso.tipi.ghost, { played: 2, won: 1, ko: 0 });
    assert.deepEqual(uso.tipi.bug, { played: 1, won: 1, ko: 0 });
});

test('Firebase restituisce gli array come oggetti: i set e i Pokémon si leggono lo stesso', () => {
    const comeOggetto = a => Object.fromEntries(a.map((x, i) => [i, x]));
    const st = { p1: { pokemon: comeOggetto([pk('Gengar')]) }, p2: { pokemon: comeOggetto([pk('Clefairy')]) }, vincitore: 'p1' };
    const uso = calcolaUsoPokemon([{ vittoria: true, team: 'T', lato: 'p1', setStats: { set1: st } }], tipiDi, nessunTeam);
    assert.equal(uso.tipi.ghost.played, 1);
});
