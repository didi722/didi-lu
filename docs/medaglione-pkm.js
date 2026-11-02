// =====================================================
// MEDAGLIONE DI UN POKÉMON — Poké-Tournament
//
// Il Pokémon su un disco a mezzatinta del colore del suo primo tipo, come nel Box. Il disegno lo fanno le pagine (riepilogo-stagione.css,
// match-settimana.css): qui c'è solo il colore. Chi mette un medaglione scrive `data-pkm="<specie>"` sull'elemento del disco; coloraMedaglioni()
// chiede a PokeAPI il primo tipo di ogni specie (una richiesta sola per specie, ricordata) e scrive `--tipo` sul disco. Finché non risponde (o se
// PokeAPI non conosce il nome) il disco resta grigio.
//
// Funziona nel browser (window.MedaglionePkm) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.MedaglionePkm = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // I colori dei tipi usati ovunque nel sito (stessi di dettagli.js)
    const COLORI_TIPO = {
        normal: '#aaaa99', fire: '#ff4422', water: '#3399ff', electric: '#ffcc33', grass: '#77cc55', ice: '#66ccff',
        fighting: '#bb5544', poison: '#aa5599', ground: '#ddbb55', flying: '#8899ff', psychic: '#ff5599', bug: '#aabb22',
        rock: '#bbaa66', ghost: '#6666bb', dragon: '#7766ee', dark: '#775544', steel: '#aaaabb', fairy: '#ee99ee'
    };

    /** "Landorus-Therian" -> "landorus-therian", "Urshifu-*" -> "urshifu": il nome come lo vuole PokeAPI */
    const nomePokeApi = specie => String(specie || '').toLowerCase().trim().replace(/ /g, '-').replace(/[.'é’%]/g, '').replace(/-?\*$/, '');

    const cacheTipo = new Map();      // nome PokeAPI -> promessa del colore del primo tipo (o null)

    function colorePerSpecie(win, specie) {
        const k = nomePokeApi(specie);
        if (!k || typeof win.fetch !== 'function') return Promise.resolve(null);
        if (!cacheTipo.has(k)) {
            cacheTipo.set(k, win.fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(k)}`)
                .then(r => (r.ok ? r.json() : null))
                .then(j => (j && j.types && j.types[0] ? COLORI_TIPO[j.types[0].type.name] || null : null))
                .catch(() => null));
        }
        return cacheTipo.get(k);
    }

    /** Dà a ogni [data-pkm] dentro `radice` il colore del tipo del suo Pokémon */
    function coloraMedaglioni(win, radice) {
        radice.querySelectorAll('[data-pkm]').forEach(el => {
            colorePerSpecie(win, el.getAttribute('data-pkm')).then(c => { if (c && el.isConnected) el.style.setProperty('--tipo', c); });
        });
    }

    return { COLORI_TIPO, nomePokeApi, colorePerSpecie, coloraMedaglioni };
});
