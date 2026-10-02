'use strict';
// nomi-log.js: due Pokémon identici nello stesso team (due Calyrex-Shadow) arrivano al client di
// Showdown con nomi diversi, altrimenti li confonde (sprite che sparisce, un solo IN, un solo KO).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { creaRiscrittore } = require('../docs/nomi-log.js');
const NU = require('../functions/nomi-unici.js');

const BASI = { 'Calyrex-Shadow': 'Calyrex', 'Calyrex-Ice': 'Calyrex', Calyrex: 'Calyrex' };
const nuovo = () => creaRiscrittore({ baseDi: s => BASI[s] || s, nomeForma: NU.nomeForma, conNumero: NU.conNumero });

const PREVIEW = [
    '|clearpoke', '|poke|p1|Calyrex-Shadow, L50|', '|poke|p1|Calyrex-Shadow, L50|', '|poke|p1|Calyrex-Ice, L50|', '|poke|p1|Clefairy, L50|',
    '|poke|p2|Calyrex-Shadow, L50|', '|poke|p2|Clefairy, L50|', '|poke|p2|Incineroar, L50|', '|poke|p2|Rillaboom, L50|'
];

test('due Calyrex-Shadow identici in campo: nomi diversi, e ogni riga che li cita segue chi occupa la posizione', () => {
    const r = nuovo();
    const fuori = r.riscrivi([
        ...PREVIEW,
        '|switch|p1a: Calyrex|Calyrex-Shadow, L50|100/100',
        '|switch|p1b: Calyrex|Calyrex-Shadow, L50|100/100',
        '|move|p1a: Calyrex|Astral Barrage|p2a: Clefairy',
        '|-damage|p1b: Calyrex|40/100|[from] item: Life Orb',
        '|-ability|p1b: Calyrex|As One|[of] p1a: Calyrex'
    ]).slice(PREVIEW.length);
    assert.deepEqual(fuori, [
        '|switch|p1a: Shadow Calyrex|Calyrex-Shadow, L50|100/100',
        '|switch|p1b: Shadow Calyrex 2|Calyrex-Shadow, L50|100/100',
        '|move|p1a: Shadow Calyrex|Astral Barrage|p2a: Clefairy',
        '|-damage|p1b: Shadow Calyrex 2|40/100|[from] item: Life Orb',
        '|-ability|p1b: Shadow Calyrex 2|As One|[of] p1a: Shadow Calyrex'
    ]);
});

test('chi rientra riprende il suo nome (dalla salute con cui era uscito); uno svenuto non rientra', () => {
    const r = nuovo();
    const fuori = r.riscrivi([
        ...PREVIEW,
        '|switch|p1a: Calyrex|Calyrex-Shadow, L50|100/100',
        '|switch|p1b: Calyrex|Calyrex-Shadow, L50|100/100',
        '|-damage|p1a: Calyrex|40/100',
        '|switch|p1a: Clefairy|Clefairy, L50|100/100',          // il gemello 1 (40%) esce
        '|faint|p1b: Calyrex',                                   // il gemello 2 sviene
        '|switch|p1b: Calyrex|Calyrex-Ice, L50|100/100',
        '|switch|p1a: Calyrex|Calyrex-Shadow, L50|40/100'        // rientra il gemello 1
    ]).slice(PREVIEW.length);
    assert.deepEqual(fuori, [
        '|switch|p1a: Shadow Calyrex|Calyrex-Shadow, L50|100/100',
        '|switch|p1b: Shadow Calyrex 2|Calyrex-Shadow, L50|100/100',
        '|-damage|p1a: Shadow Calyrex|40/100',
        '|switch|p1a: Clefairy|Clefairy, L50|100/100',
        '|faint|p1b: Shadow Calyrex 2',
        '|switch|p1b: Ice Calyrex|Calyrex-Ice, L50|100/100',
        '|switch|p1a: Shadow Calyrex|Calyrex-Shadow, L50|40/100'
    ]);
});

test('con un solo Calyrex-Shadow ma anche un Calyrex-Ice nel team le due forme prendono il nome della forma', () => {
    const r = nuovo();
    const fuori = r.riscrivi([
        '|clearpoke', '|poke|p2|Calyrex-Shadow, L50|', '|poke|p2|Calyrex-Ice, L50|', '|poke|p2|Clefairy, L50|',
        '|switch|p2a: Calyrex|Calyrex-Shadow, L50|100/100', '|switch|p2b: Calyrex|Calyrex-Ice, L50|100/100',
        '|faint|p2b: Calyrex'
    ]).slice(4);
    assert.deepEqual(fuori, [
        '|switch|p2a: Shadow Calyrex|Calyrex-Shadow, L50|100/100',
        '|switch|p2b: Ice Calyrex|Calyrex-Ice, L50|100/100',
        '|faint|p2b: Ice Calyrex'
    ]);
});

test('niente da rinominare: team senza Pokémon della stessa specie base, soprannomi veri, nomi già unici', () => {
    const r = nuovo();
    const righe = [
        '|clearpoke', '|poke|p1|Calyrex-Shadow, L50|', '|poke|p1|Clefairy, L50|', '|poke|p1|Calyrex-Ice, L50|',
        '|switch|p1a: Bob|Calyrex-Shadow, L50|100/100',                 // soprannome vero
        '|switch|p1b: Clefairy|Clefairy, L50|100/100',
        '|move|p1a: Bob|Protect|p1a: Bob',
        '|switch|p1b: Ice Calyrex|Calyrex-Ice, L50|100/100',          // già unico (server aggiornato)
        '|-damage|p1b: Ice Calyrex|50/100'
    ];
    assert.deepEqual(r.riscrivi(righe), righe);
    const solo = nuovo().riscrivi(['|poke|p1|Clefairy, L50|', '|switch|p1a: Clefairy|Clefairy, L50|100/100', '|-damage|p1a: Clefairy|50/100']);
    assert.deepEqual(solo, ['|poke|p1|Clefairy, L50|', '|switch|p1a: Clefairy|Clefairy, L50|100/100', '|-damage|p1a: Clefairy|50/100']);
});

test('nuovo set: |clearpoke| azzera tutto', () => {
    const r = nuovo();
    r.riscrivi([...PREVIEW, '|switch|p1a: Calyrex|Calyrex-Shadow, L50|100/100', '|faint|p1a: Calyrex']);
    const secondo = r.riscrivi([...PREVIEW, '|switch|p1a: Calyrex|Calyrex-Shadow, L50|100/100']).slice(PREVIEW.length);
    assert.deepEqual(secondo, ['|switch|p1a: Shadow Calyrex|Calyrex-Shadow, L50|100/100']);
});

test('Ally Switch: chi cambia posto porta con sé il nome', () => {
    const r = nuovo();
    const fuori = r.riscrivi([
        ...PREVIEW,
        '|switch|p1a: Calyrex|Calyrex-Shadow, L50|100/100',
        '|switch|p1b: Calyrex|Calyrex-Shadow, L50|100/100',
        '|swap|p1a: Calyrex|1',
        '|-damage|p1a: Calyrex|50/100',          // ora in a c'è il gemello 2
        '|-damage|p1b: Calyrex|60/100'
    ]).slice(PREVIEW.length);
    assert.deepEqual(fuori.slice(2), [
        '|swap|p1a: Shadow Calyrex|1',
        '|-damage|p1a: Shadow Calyrex 2|50/100',
        '|-damage|p1b: Shadow Calyrex|60/100'
    ]);
});

test('righe senza barra iniziale o con parti strane passano intatte', () => {
    const r = nuovo();
    const righe = ['', 'testo', '|', '|-message|Calyrex lost its HP', '|raw|p1a: Calyrex'];
    assert.deepEqual(r.riscrivi(righe), righe);
});
