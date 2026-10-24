'use strict';
// Illusione svelata: il client di Showdown azzerava i potenziamenti del Pokémon (anche in Dynamax) sostituendo l'oggetto
// travestito con quello vero. docs/illusione-client.js avvolge Side.replace per rimetterli. La CPU li tiene sul Pokémon vero.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { proteggiSostituzione } = require('../docs/illusione-client.js');

// un Side finto che si comporta come quello del client: replace() azzera i volatili del nuovo arrivato
function creaSide() {
    class Side {
        constructor() { this.active = []; this.battle = { scene: { aggiornati: [], updateStatbar(p) { this.aggiornati.push(p); } } }; }
        replace(pokemon, slot = pokemon.slot) {
            const vecchio = this.active[slot];
            if (pokemon === vecchio) return;
            this.active[slot] = pokemon;
            pokemon.slot = slot;
            pokemon.boosts = {};
            pokemon.volatiles = {};
        }
    }
    return Side;
}
const mon = (nome, extra = {}) => ({ name: nome, slot: 0, boosts: {}, volatiles: {}, ...extra });

test('Illusione svelata: i potenziamenti e il Dynamax del travestito passano a Zoroark', () => {
    const Side = creaSide();
    assert.equal(proteggiSostituzione(Side), true);
    const lato = new Side();
    const finto = mon('Garchomp', { boosts: { spa: 2, spe: -1 }, volatiles: { dynamax: { turns: 2 }, illusion: {} } });
    lato.active[0] = finto;
    const vero = mon('Zoroark');
    lato.replace(vero);
    assert.equal(lato.active[0], vero);
    assert.deepEqual({ spa: vero.boosts.spa, spe: vero.boosts.spe }, { spa: 2, spe: -1 });
    assert.deepEqual(vero.volatiles.dynamax, { turns: 2 });
    assert.ok(!('illusion' in vero.volatiles), "l'Illusione è finita");
    assert.equal(lato.battle.scene.aggiornati[0], vero, "l'indicatore grafico si aggiorna");
});

test('è idempotente e non tocca un cambio normale né la sostituzione con lo stesso oggetto', () => {
    const Side = creaSide();
    assert.equal(proteggiSostituzione(Side), true);
    assert.equal(proteggiSostituzione(Side), false, 'secondo giro: nessun doppio avvolgimento');
    const lato = new Side();
    const a = mon('Garchomp', { boosts: { atk: 1 } });
    lato.active[0] = a;
    lato.replace(a);
    assert.equal(a.boosts.atk, 1, 'stesso oggetto: lo fa già il client e non cambia nulla');
});

test('classi senza replace non rompono nulla', () => {
    assert.equal(proteggiSostituzione(null), false);
    assert.equal(proteggiSostituzione(class {}), false);
});
