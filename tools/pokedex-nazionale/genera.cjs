'use strict';
// Genera docs/pokedex-nazionale.js: i Pokémon in ordine di Pokédex nazionale (numero → nome) e, per ogni specie e forma del simulatore, il numero della sua specie
// base ("venusaurmega" → 3). Serve alla scheda "Pokédex" di Stats (docs/pokedex-lega.js): dove mettere ogni specie usata e quante ne mancano.
// I dati sono quelli del simulatore che il sito ha già (docs/motore-replay/data/pokedex.js): niente rete, niente pacchetti.
// Quando esce una generazione nuova: si aggiorna quel file (il workflow del simulatore) e poi
//     node tools/pokedex-nazionale/genera.cjs
// e si commita il file generato. Le specie che la tabella non conosce restano fuori dal Pokédex (la scheda dice quante).
const fs = require('node:fs');
const path = require('node:path');

const ORIGINE = path.join(__dirname, '..', '..', 'docs', 'motore-replay', 'data', 'pokedex.js');
const FUORI = path.join(__dirname, '..', '..', 'docs', 'pokedex-nazionale.js');

/** { nomi: [nome della specie n. 1, n. 2, ...], ids: { id: numero } } da BattlePokedex: le specie vere (non le fan-made né le CAP), con le loro forme */
function costruisci(pokedex) {
    const nomi = [];
    const ids = {};
    for (const [id, s] of Object.entries(pokedex || {})) {
        if (!s || !(s.num > 0) || s.isNonstandard === 'CAP' || s.isNonstandard === 'Custom') continue;
        ids[id] = s.num;
        if (!s.baseSpecies) nomi[s.num - 1] = s.name;       // le forme hanno baseSpecies: il nome del numero è quello della specie base
    }
    return { nomi, ids: Object.fromEntries(Object.entries(ids).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) };
}

const righe = (voci, perRiga, rientro) => {
    const gruppi = [];
    for (let i = 0; i < voci.length; i += perRiga) gruppi.push(rientro + voci.slice(i, i + perRiga).join(', '));
    return gruppi.join(',\n');
};

function sorgente({ nomi, ids }) {
    const nomiJs = nomi.map(n => JSON.stringify(n == null ? '' : n));
    const idsJs = Object.entries(ids).map(([id, n]) => `'${id}': ${n}`);
    return `// =====================================================
// POKÉDEX NAZIONALE — file generato da tools/pokedex-nazionale/genera.cjs (non si modifica a mano)
// ---------------------------------------------------------------------
// nomi[n - 1]: il nome della specie con il numero n del Pokédex nazionale (1 = Bulbasaur).
// ids: per ogni specie e forma del simulatore (nel formato di Showdown: minuscole e senza simboli, "urshifurapidstrike"), il numero della sua specie base.
// Serve alla scheda "Pokédex" di Stats (pokedex-lega.js). Funziona nel browser (window.PokedexNazionale) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.PokedexNazionale = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
        nomi: [
${righe(nomiJs, 6, '            ')}
        ],
        ids: {
${righe(idsJs, 4, '            ')}
        }
    };
});
`;
}

if (require.main === module) {
    const dati = costruisci(require(ORIGINE).BattlePokedex);
    fs.writeFileSync(FUORI, sorgente(dati));
    console.log(`docs/pokedex-nazionale.js: ${dati.nomi.length} specie, ${Object.keys(dati.ids).length} con le forme`);
}

module.exports = { costruisci, sorgente, ORIGINE, FUORI };
