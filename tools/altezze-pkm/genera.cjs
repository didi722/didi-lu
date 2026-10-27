'use strict';
// Genera docs/altezze-pkm.js: l'altezza vera (in metri) di ogni specie e se fluttua, per mettere i Pokémon in scala (docs/scala-pkm.js) SENZA chiedere niente a PokeAPI
// (una richiesta per specie: lenta, e a volte fallisce, per questo Stats e i compagni comparivano a fatica).
// I dati sono quelli del simulatore (pokemon-showdown, già tra le dipendenze); la regola "fluttua" è quella di scala-pkm.js, la stessa che si applicava ai dati di PokeAPI.
// Quando esce una generazione nuova: npm update pokemon-showdown, poi
//     node tools/altezze-pkm/genera.cjs
// e si commita il file generato. Le specie che la tabella non conosce si chiedono a PokeAPI, come prima.
const fs = require('node:fs');
const path = require('node:path');
const { Dex } = require('pokemon-showdown');
const Scala = require('../../docs/scala-pkm.js');

const FUORI = path.join(__dirname, '..', '..', 'docs', 'altezze-pkm.js');

function costruisci() {
    const tabella = {};
    for (const s of Dex.species.all()) {
        if (!s.exists || s.isNonstandard === 'CAP' || s.isNonstandard === 'Custom') continue;
        const altezza = Number(s.heightm);
        if (!(altezza > 0)) continue;
        const chiave = Scala.nomeApi(s.name);
        if (tabella[chiave]) continue;
        const tipi = (s.types || []).map(t => String(t).toLowerCase());
        const abilita = Object.values(s.abilities || {}).map(a => String(a).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        tabella[chiave] = [altezza, Scala.fluttua(chiave, tipi, abilita) ? 1 : 0];
    }
    return Object.fromEntries(Object.entries(tabella).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function sorgente(tabella) {
    const righe = Object.entries(tabella).map(([k, [h, v]]) => `        '${k}': [${h}, ${v}]`);
    return `// =====================================================
// ALTEZZE DEI POKÉMON — file generato da tools/altezze-pkm/genera.cjs (non si modifica a mano)
// ---------------------------------------------------------------------
// Per ogni specie (nel nome che usa scala-pkm.js: "mr-mime", "urshifu-rapid-strike"): [altezza vera in metri, 1 se fluttua]. Serve a mettere i Pokémon in scala sul
// palco senza aspettare PokeAPI. Specie assenti: le chiede PokeAPI, come prima.
// Funziona nel browser (window.AltezzePkm) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.AltezzePkm = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
${righe.join(',\n')}
    };
});
`;
}

if (require.main === module) {
    const tabella = costruisci();
    fs.writeFileSync(FUORI, sorgente(tabella));
    console.log(`docs/altezze-pkm.js: ${Object.keys(tabella).length} specie`);
}

module.exports = { costruisci, sorgente };
