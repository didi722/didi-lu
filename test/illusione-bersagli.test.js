'use strict';
// Illusione (Zoroark) svelata in doppio: il Pokémon vero deve restare un bersaglio valido.
// La riga "|replace|p2a: Zoroark|Zoroark, L50, M" non porta gli HP: se StatoCampo li perdeva, Zoroark risultava a 0 HP e, con un compagno
// accanto, l'avversario non poteva più sceglierlo come bersaglio (la lista dei bersagli si riduceva al solo compagno).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
let modulo = null;
function carica() {
    if (!modulo) {
        modulo = (async () => {
            globalThis.self = globalThis;
            const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'illusione-'));
            const copia = (da, a, sostituzioni = []) => {
                let testo = leggi(da);
                for (const [x, y] of sostituzioni) testo = testo.replace(x, y);
                fs.writeFileSync(path.join(cartella, a), testo);
            };
            copia('pkmn-sim.js', 'pkmn-sim.mjs');
            copia('nomi-unici.js', 'nomi-unici.mjs');
            copia('esito-set.js', 'esito-set.mjs');
            copia('motore-battaglia.js', 'motore-battaglia.mjs', [["'./pkmn-sim.js'", "'./pkmn-sim.mjs'"], ["'./nomi-unici.js'", "'./nomi-unici.mjs'"], ["'./esito-set.js'", "'./esito-set.mjs'"]]);
            return import(pathToFileURL(path.join(cartella, 'motore-battaglia.mjs')).href);
        })();
    }
    return modulo;
}

const RIGHE = [
    '|switch|p1a: Garchomp|Garchomp, L50, M|100/100',
    '|switch|p1b: Rillaboom|Rillaboom, L50, M|100/100',
    '|switch|p2a: Cottonee|Cottonee, L50, M|100/100',          // Zoroark travestito da Cottonee
    '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
    '|-damage|p2a: Cottonee|62/100 par'
];

// i bersagli che il pannello offre a p1a per una mossa su un solo bersaglio (come bersagliValidi in battle-ui.js)
const bersagli = (m, stato) => m.bersagliScegliibili('normal', 0, b => { const x = stato.campo[b.lato === 'mio' ? 'p1' : 'p2'][b.slot]; return x && x.hp > 0; });

test('illusione svelata: Zoroark resta un bersaglio valido, con gli HP e lo stato che aveva sotto mentite spoglie', async () => {
    const m = await carica();
    const stato = new m.StatoCampo();
    stato.aggiorna(RIGHE);
    assert.equal(bersagli(m, stato).filter(b => b.lato !== 'mio').length, 2, 'prima dello svelamento i due avversari si possono colpire');
    stato.aggiorna(['|replace|p2a: Zoroark|Zoroark, L50, M']);
    const z = stato.campo.p2[0];
    assert.equal(z.specie, 'Zoroark');
    assert.equal(z.nome, 'Zoroark');
    assert.equal(z.hp, 62, 'gli HP sono quelli di prima');
    assert.equal(z.hpMax, 100);
    assert.equal(z.stato, 'par', 'anche lo stato');
    const avversari = bersagli(m, stato).filter(b => b.lato !== 'mio');
    assert.equal(avversari.length, 2, 'con il compagno accanto Zoroark si può ancora scegliere come bersaglio');
    assert.deepEqual(avversari.map(b => b.slot).sort(), [0, 1]);
});

test('replace con gli HP nella riga (se un giorno li porta): vincono quelli della riga; il dinamax si mantiene', async () => {
    const m = await carica();
    const stato = new m.StatoCampo();
    stato.aggiorna(RIGHE);
    stato.campo.p2[0].dinamax = true;
    stato.aggiorna(['|replace|p2a: Zoroark|Zoroark, L50, M|40/100']);
    assert.equal(stato.campo.p2[0].hp, 40);
    assert.equal(stato.campo.p2[0].dinamax, true);
    // un replace su uno slot vuoto non si rompe
    const vuoto = new m.StatoCampo();
    vuoto.aggiorna(['|replace|p2a: Zoroark|Zoroark, L50, M']);
    assert.equal(vuoto.campo.p2[0].specie, 'Zoroark');
});

test('un normale cambio (switch) continua a rimettere gli HP e a spegnere il dinamax', async () => {
    const m = await carica();
    const stato = new m.StatoCampo();
    stato.aggiorna(RIGHE);
    stato.campo.p2[0].dinamax = true;
    stato.aggiorna(['|switch|p2a: Corviknight|Corviknight, L50, F|100/100']);
    assert.equal(stato.campo.p2[0].hp, 100);
    assert.equal(stato.campo.p2[0].stato, '');
    assert.equal(stato.campo.p2[0].dinamax, false);
});
