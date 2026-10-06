'use strict';
// Open sheet: le stat nel tooltip di un Pokémon avversario sono quelle che vede il proprietario (le sue vere stat, dalla richiesta del server).
// Caso del test della stagione: Minior dopo Shell Smash, 2034 per chi guardava e 1314 per il proprietario. La causa: Minior entra come "Minior"
// (Core) e Shields Down lo trasforma in Meteor con "-formechange", che NON cambia speciesForme ma sta nei volatili del client; il tooltip del
// terzo calcolava le stat dalla speciesForme (Core) mentre il proprietario le aveva dalla forma Meteor.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { caricaSim } = require('./ayuda-sim.js');

const sorgente = fs.readFileSync(path.join(__dirname, '..', 'docs', 'battle-extra.js'), 'utf8').replace(/^export /gm, '');
const modulo = vm.runInNewContext(`${sorgente}\n({ serverDaSet, specieEffettiva, calcolaStat })`, { window: {}, document: {}, console });
const { serverDaSet, specieEffettiva, calcolaStat } = modulo;

const MINIOR = { species: 'Minior', name: 'Minior', level: 100, evs: { spe: 252 }, ivs: {}, nature: 'Hardy', ability: 'Shields Down', item: 'Choice Scarf', moves: ['Shell Smash'] };

test('la specie effettiva: la forma temporanea (formechange) vince su speciesForme; senza, speciesForme; senza client, il set', () => {
    assert.equal(specieEffettiva({ speciesForme: 'Minior', volatiles: { formechange: ['formechange', 'Minior-Meteor'] } }, 'Minior'), 'Minior-Meteor');
    assert.equal(specieEffettiva({ speciesForme: 'Minior', volatiles: { formechange: 'Minior-Meteor' } }, 'Minior'), 'Minior-Meteor', 'anche se è una stringa');
    assert.equal(specieEffettiva({ speciesForme: 'Charizard-Mega-X', volatiles: {} }, 'Charizard'), 'Charizard-Mega-X');
    assert.equal(specieEffettiva({ speciesForme: 'Minior', volatiles: { formechange: ['formechange'] } }, 'Minior'), 'Minior', 'volatile senza forma: non rompe');
    assert.equal(specieEffettiva(null, 'Minior'), 'Minior');
    assert.equal(specieEffettiva(undefined, 'Garchomp'), 'Garchomp');
});

test('Minior in forma Meteor (Shields Down, HP oltre la metà): le stat sono quelle Meteor, uguali a quelle del proprietario', async () => {
    const { sim } = await caricaSim();
    const battle = { dex: sim.Dex, gen: 9 };
    const core = serverDaSet(battle, MINIOR, { speciesForme: 'Minior', hp: 100, maxhp: 100, volatiles: {} });
    const meteor = serverDaSet(battle, MINIOR, { speciesForme: 'Minior', hp: 100, maxhp: 100, volatiles: { formechange: ['formechange', 'Minior-Meteor'] } });
    // Core: Spe base 120 con 252 EV → 339; Meteor: Spe base 60 → 219 (le due cifre del test: 339×6 = 2034, 219×6 = 1314)
    assert.equal(core.stats.spe, 339);
    assert.equal(meteor.stats.spe, 219);
    assert.equal(meteor.stats.spe * 6, 1314);
    assert.equal(core.stats.spe * 6, 2034);
    assert.equal(meteor.speciesForme, 'Minior-Meteor');
    assert.equal(meteor.stats.def, calcolaStat(sim.Dex.species.get('Minior-Meteor').baseStats, MINIOR, 100, 9).def, 'tutte le stat dalla stessa forma');
    assert.notEqual(core.stats.def, meteor.stats.def);
    assert.equal(meteor.maxhp, core.maxhp, 'gli HP sono gli stessi nelle due forme');
});

test('lo strumento o l\'abilità cambiati in battaglia (Trick, Skill Swap) valgono quelli visti dal client; il set resta il ripiego', async () => {
    const { sim } = await caricaSim();
    const battle = { dex: sim.Dex, gen: 9 };
    const scambiato = serverDaSet(battle, MINIOR, { speciesForme: 'Minior', hp: 100, maxhp: 100, volatiles: {}, item: 'Leftovers', ability: 'Trace' });
    assert.equal(scambiato.item, 'leftovers');
    assert.equal(scambiato.ability, 'trace');
    assert.equal(scambiato.baseAbility, 'shieldsdown');
    const come = serverDaSet(battle, MINIOR, { speciesForme: 'Minior', hp: 100, maxhp: 100, volatiles: {}, item: '', ability: '' });
    assert.equal(come.item, 'choicescarf');
    assert.equal(come.ability, 'shieldsdown');
    const consumato = serverDaSet(battle, MINIOR, { speciesForme: 'Minior', hp: 100, maxhp: 100, volatiles: {}, item: '', prevItem: 'choicescarf' });
    assert.equal(consumato.item, '', 'strumento perso/consumato');
});

test('i modificatori di campo (Tailwind...) li applica il tooltip di Showdown SUL LATO del Pokémon, che per l\'avversario è il suo; il sito passa il Pokémon giusto', () => {
    // il tooltip chiama tt.calculateModifiedStats(clientPokemon, serverPokemon): la velocità col Tailwind viene da clientPokemon.side, non dal nostro calcolo
    assert.match(sorgente, /const finali = tt\.calculateModifiedStats\(clientPokemon, serverPokemon\);/);
    // le stat base che passiamo sono quelle senza boost, strumenti, campo: li aggiunge Showdown
    const { calcolaStat: c } = modulo;
    const neutra = c({ hp: 60, atk: 100, def: 60, spa: 100, spd: 60, spe: 120 }, { evs: { spe: 252 }, ivs: {} }, 100, 9);
    assert.equal(neutra.spe, 339, 'niente Tailwind, boost o strumento in questo numero');
    // e la sezione stat usa la riga del lato del Pokémon: l'abbinamento carta-Pokémon è per lato
    assert.match(sorgente, /const lato = latoDi\(battle, clientPokemon\.side\);\s*if \(!puoVedereSet\(lato\)\) return null;/);
});
