'use strict';
// Soprannomi doppi nello stesso team (due forme della stessa specie, entrambe "Calyrex"):
// si distinguono prima di impacchettare, altrimenti schermo, log e statistiche le confondono.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nomiUnici } = require('../functions/nomi-unici.js');

const BASI = { 'Calyrex-Ice': 'Calyrex', 'Calyrex-Shadow': 'Calyrex', 'Urshifu-Rapid-Strike': 'Urshifu' };
const baseDi = specie => BASI[specie] || specie;
const nomi = sets => sets.map(s => s.name);

test('due forme con lo stesso soprannome "Calyrex" prendono ciascuna il nome della propria forma', () => {
    const sets = [
        { name: 'Calyrex', species: 'Calyrex-Shadow' },
        { name: 'Calyrex', species: 'Calyrex-Ice' },
        { name: 'Clefairy', species: 'Clefairy' }
    ];
    assert.deepEqual(nomi(nomiUnici(sets, baseDi)), ['Shadow Calyrex', 'Ice Calyrex', 'Clefairy']);
});

test('un soprannome con le stesse lettere della specie conta come nessun soprannome (il pack lo perde)', () => {
    const sets = [{ name: 'Calyrex Ice', species: 'Calyrex-Ice' }, { name: '', species: 'Calyrex-Shadow' }];
    assert.deepEqual(nomi(nomiUnici(sets, baseDi)), ['Ice Calyrex', 'Shadow Calyrex']);
});

test('il nuovo nome ha lettere diverse dalla specie: impacchettato non torna alla specie base', () => {
    const sets = nomiUnici([{ name: 'Calyrex', species: 'Calyrex-Shadow' }, { name: '', species: 'Calyrex-Ice' }], baseDi);
    for (const s of sets) assert.notEqual(s.name.toLowerCase().replace(/[^a-z0-9]/g, ''), s.species.toLowerCase().replace(/[^a-z0-9]/g, ''));
});

test('un team senza nomi doppi non cambia, nemmeno con soprannomi uguali alla specie base', () => {
    const sets = [
        { name: 'Calyrex', species: 'Calyrex-Shadow' },
        { name: '', species: 'Clefairy' },
        { name: 'Urshifu', species: 'Urshifu-Rapid-Strike' }
    ];
    const prima = JSON.stringify(sets);
    nomiUnici(sets, baseDi);
    assert.equal(JSON.stringify(sets), prima);
});

test('i soprannomi veri restano, e i doppioni prendono un numero', () => {
    const sets = [{ name: 'Bob', species: 'Pikachu' }, { name: 'Bob', species: 'Raichu' }, { name: 'Bob', species: 'Pichu' }];
    assert.deepEqual(nomi(nomiUnici(sets, baseDi)), ['Bob', 'Bob 2', 'Bob 3']);
});

test('due Pokémon identici: il secondo prende il numero', () => {
    const sets = [{ name: '', species: 'Pikachu' }, { name: 'Pikachu', species: 'Pikachu' }];
    assert.deepEqual(nomi(nomiUnici(sets, baseDi)), ['Pikachu', 'Pikachu 2']);
});

test('il nuovo nome non ne ruba uno già usato nel team e resta sotto i 20 caratteri', () => {
    const sets = [
        { name: 'Ice Calyrex', species: 'Glastrier' },          // già "occupa" quel nome
        { name: 'Calyrex', species: 'Calyrex-Ice' },
        { name: 'Calyrex', species: 'Calyrex-Shadow' },
        { name: 'Urshifu-Rapid-Strike', species: 'Urshifu-Rapid-Strike' },
        { name: 'Urshifu-Rapid-Strike', species: 'Urshifu-Rapid-Strike' }
    ];
    nomiUnici(sets, baseDi);
    const k = nomi(sets).map(n => n.toLowerCase());
    assert.equal(new Set(k).size, k.length, `nomi doppi: ${k}`);
    assert.ok(nomi(sets).every(n => n.length <= 20), nomi(sets).join(' | '));
    assert.equal(sets[0].name, 'Ice Calyrex');                   // chi era già unico non si tocca
    assert.equal(sets[1].name, 'Ice Calyrex 2');
    assert.equal(sets[2].name, 'Shadow Calyrex');
    assert.equal(sets[3].name, 'Rapid Strike Urshifu');
    assert.equal(sets[4].name, 'Rapid Strike Urshi 2');          // il numero ci sta, il nome si accorcia
});

test('funziona anche senza baseDi, e con input strani', () => {
    assert.deepEqual(nomi(nomiUnici([{ name: 'X', species: 'A' }, { name: 'x', species: 'B' }])), ['X', 'x 2']);
    assert.equal(nomiUnici(null), null);
    assert.deepEqual(nomiUnici([]), []);
});

test('le due copie del file (partite online e partite locali) sono identiche', () => {
    const leggi = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    assert.equal(leggi('docs/nomi-unici.js'), leggi('functions/nomi-unici.js'));
});

test('partita.js e motore-battaglia.js li usano prima di impacchettare il team', () => {
    const leggi = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    assert.match(leggi('functions/partita.js'), /nomiUnici\(PS\.Teams\.import\(testo\)/);
    const locale = leggi('docs/motore-battaglia.js');
    assert.match(locale, /import '\.\/nomi-unici\.js'/);
    assert.match(locale, /Teams\.pack\(setDaTeam\(team\)\)/);
});
