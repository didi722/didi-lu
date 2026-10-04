/* =====================================================================
   CONSIGLI — mosse, strumenti e abilità che di solito si giocano su un Pokémon (Team Builder)
   ---------------------------------------------------------------------
   I dati sono in docs/consigli/genN.json (li genera tools/genera-consigli.cjs dai set di Smogon e dalle battaglie casuali di
   Showdown). Qui si caricano (uno per generazione, una sola volta) e si usano per mettere i consigliati in cima alle liste
   di scelta del Team Builder, prima di tutto il resto. Se il file manca il Team Builder funziona come prima (ordine alfabetico).
   Modulo UMD: le funzioni pure si provano in Node (test/consigli.test.js).
   ===================================================================== */
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Consigli = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Mosse che quasi mai servono a qualcosa: in fondo alla lista delle "altre"
    const MOSSE_POCO_UTILI = new Set(['splash', 'celebrate', 'holdhands', 'happyhour', 'teeterdance', 'bide', 'mudsport',
        'watersport', 'camouflage', 'sweetscent', 'minimize', 'lastresort', 'sketch']);

    const cache = {};

    /** Carica i consigli di una generazione ({ s, d } per singolo e doppio); null se non ci sono. */
    function carica(gen, caricaJson) {
        const g = Number(gen);
        if (!(g >= 1 && g <= 9)) return Promise.resolve(null);
        if (!cache[g]) {
            const leggi = caricaJson || (url => fetch(url).then(r => (r.ok ? r.json() : null)));
            cache[g] = Promise.resolve().then(() => leggi(`consigli/gen${g}.json`)).catch(() => null)
                .then(dati => (dati && dati.s && dati.d ? dati : null));
        }
        return cache[g];
    }

    const vuoto = () => ({ mosse: [], oggetti: [], abilita: [] });
    const conta = x => (x ? x.m.length : 0);

    /**
     * I consigli per un Pokémon, dalla più consigliata.
     * @param {object|null} dati            quanto restituisce carica()
     * @param {string} specieId             id della specie (es. "calyrexshadow")
     * @param {{ doppio?: boolean, baseId?: string }} [opzioni]  doppio: formato a due contro due; baseId: specie base, se la forma non ha set propri
     */
    function per(dati, specieId, opzioni = {}) {
        if (!dati) return vuoto();
        const cerca = lista => {
            for (const id of [specieId, opzioni.baseId]) if (id && lista && lista[id]) return lista[id];
            return null;
        };
        const singolo = cerca(dati.s);
        const doppio = cerca(dati.d);
        let scelta = opzioni.doppio ? (doppio || singolo) : (singolo || doppio);
        if (!scelta) return vuoto();
        let { m, i, a } = scelta;
        // se la lista del doppio è corta si completa con quella del singolo
        const altra = opzioni.doppio ? singolo : null;
        if (altra && scelta !== altra && conta(scelta) < 5) {
            const gia = new Set(m);
            m = [...m, ...altra.m.filter(x => !gia.has(x))];
            if (!i.length) i = altra.i;
            if (!a.length) a = altra.a;
        }
        return { mosse: m.slice(), oggetti: i.slice(), abilita: a.slice() };
    }

    /**
     * Divide le voci in "consigliate" (nell'ordine dei consigli) e "altre" (ordine originale, quelle quasi sempre inutili in fondo).
     * @param {Array} voci
     * @param {string[]} consigliati        id, dalla più consigliata
     * @param {(voce) => string} idDi
     * @param {Set<string>} [pocoUtili]
     */
    function ordina(voci, consigliati, idDi = v => v.id, pocoUtili = null) {
        const posizione = new Map((consigliati || []).map((id, k) => [id, k]));
        const consigliate = voci.filter(v => posizione.has(idDi(v))).sort((a, b) => posizione.get(idDi(a)) - posizione.get(idDi(b)));
        const altre = voci.filter(v => !posizione.has(idDi(v)));
        if (pocoUtili && pocoUtili.size) {
            const bene = altre.filter(v => !pocoUtili.has(idDi(v)));
            return { consigliate, altre: [...bene, ...altre.filter(v => pocoUtili.has(idDi(v)))] };
        }
        return { consigliate, altre };
    }

    return { carica, per, ordina, MOSSE_POCO_UTILI };
});
