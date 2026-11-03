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
        constructor() { this.active = []; this.battle = { scene: { aggiornati: [], ridisegnati: [], updateStatbar(p) { this.aggiornati.push(p); }, animTransform(p, ...argomenti) { this.ridisegnati.push([p, ...argomenti]); } } }; }
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

test('con il Dynamax in corso lo sprite di Zoroark si ridisegna grande; senza Dynamax non si ridisegna niente; un errore della scena non rompe la sostituzione', () => {
    const Side = creaSide();
    proteggiSostituzione(Side);
    const lato = new Side();
    const vero = mon('Zoroark');
    lato.active[0] = mon('Garchomp', { volatiles: { dynamax: ['dynamax', false], illusion: {} } });
    lato.replace(vero);
    assert.deepEqual(lato.battle.scene.ridisegnati, [[vero, true, true]], 'come all\'inizio del Dynamax, e anche con le animazioni ferme (replay)');
    const senza = new Side();
    senza.active[0] = mon('Garchomp', { volatiles: { illusion: {} } });
    senza.replace(mon('Zoroark'));
    assert.deepEqual(senza.battle.scene.ridisegnati, []);
    const rotto = new Side();
    rotto.battle.scene.animTransform = () => { throw new Error('scena'); };
    rotto.active[0] = mon('Garchomp', { volatiles: { dynamax: ['dynamax', false] } });
    const z = mon('Zoroark');
    assert.doesNotThrow(() => rotto.replace(z));
    assert.equal(rotto.active[0], z);
    assert.ok(z.volatiles.dynamax);
});

test('il replay ha la stessa correzione e le due copie di replay-sito.js restano identiche', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'docs', 'replay-sito.js'), 'utf8');
    assert.match(src, /scena\.animTransform\(pokemon, true, true\)/);
    assert.equal(fs.readFileSync(require('node:path').join(__dirname, '..', 'functions', 'replay-sito.js'), 'utf8'), src);
});
