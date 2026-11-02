'use strict';
// La forma nascosta del team preview ("Urshifu-*"): appena si conosce la forma vera sostituisce il segnaposto
//   cd functions && node --test test/statistiche-set-forma.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { analizzaSet } = require('../statistiche-set');

const LOG = [
    '|player|p1|Didi|1', '|player|p2|Lu|2',
    '|poke|p1|Urshifu-*, M|', '|poke|p1|Garchomp, F|',
    '|poke|p2|Heatran|', '|poke|p2|Rillaboom|',
    '|teamsize|p1|2', '|teamsize|p2|2',
    '|start',
    '|switch|p1a: Urshifu|Urshifu-Rapid-Strike, M|100/100',
    '|switch|p2a: Heatran|Heatran, M|100/100',
    '|turn|1'
];

test('sceso in campo: la specie è la forma vera dello switch, non il segnaposto', () => {
    const r = analizzaSet(LOG);
    const specie = r.p1.pokemon.map(p => p.specie);
    assert.deepEqual(specie, ['Urshifu-Rapid-Strike', 'Garchomp']);
    assert.equal(r.p1.pokemon[0].sceso, true);
});

test('portato ma mai sceso: la forma la dice il team registrato (portati)', () => {
    const r = analizzaSet(LOG.filter(r => !r.startsWith('|switch|p1a')), { portati: { p1: ['Urshifu-Rapid-Strike', 'Garchomp'], p2: ['Heatran', 'Rillaboom'] } });
    assert.deepEqual(r.p1.pokemon.map(p => [p.specie, p.portato, p.sceso]), [['Urshifu-Rapid-Strike', true, false], ['Garchomp', true, false]]);
});

test('senza nessuna informazione sulla forma il segnaposto resta (e una specie diversa non lo sostituisce)', () => {
    const r = analizzaSet(LOG.filter(r => !r.startsWith('|switch|p1a')));
    assert.equal(r.p1.pokemon[0].specie, 'Urshifu-*');
    const sbagliata = analizzaSet(LOG.filter(r => !r.startsWith('|switch|p1a')), { portati: { p1: ['Garchomp'] } });
    assert.equal(sbagliata.p1.pokemon[0].specie, 'Urshifu-*');
});
