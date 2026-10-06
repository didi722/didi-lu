// =====================================================
// SPRITE DEI POKÉMON — Poké-Tournament
//
// Il nome di un file di Showdown (sprites/ani/<id>.gif, sprites/dex/<id>.png) NON è il nome del Pokémon con i trattini al posto degli spazi:
//   - la specie base è solo lettere e cifre minuscole, senza spazi né punteggiatura: "Mr. Mime" → mrmime, "Tapu Koko" → tapukoko,
//     "Type: Null" → typenull, "Farfetch'd" → farfetchd, "Flabébé" → flabebe, "Ho-Oh" → hooh, "Porygon-Z" → porygonz;
//   - la forma, se c'è, segue dopo UN trattino, anch'essa solo lettere e cifre: "Urshifu-Rapid-Strike" → urshifu-rapidstrike,
//     "Mr. Mime-Galar" → mrmime-galar, "Charizard-Mega-X" → charizard-megax, "Zygarde-10%" → zygarde-10.
// Prima ogni pagina si costruiva il nome a modo suo (spesso con i trattini: "mr-mime"), e certi Pokémon non avevano la GIF in certi punti del sito.
// Questo file è LA regola, per tutte le pagine.
//
//   SpritePkm.pulisciSpecie(testo)   "Soprannome (Garchomp)" → "Garchomp"; "Garchomp (M)" → "Garchomp"
//   SpritePkm.idSprite(testo)        { completo: 'urshifu-rapidstrike', base: 'urshifu', db: 'urshifu' }  (db: nome per Pokémon Database, "mr-mime")
//   SpritePkm.id(testo)              l'id di Showdown ("completo")
//   SpritePkm.gif(testo)             https://play.pokemonshowdown.com/sprites/ani/<id>.gif
//   SpritePkm.dex(testo)             https://play.pokemonshowdown.com/sprites/dex/<id>.png
//   SpritePkm.pokeapi(testo)         nome per PokéAPI: "mr-mime", "great-tusk", "type-null" (minuscolo, spazi → trattini)
//   SpritePkm.riserva(img, id)       per onerror: prima il PNG del Pokédex, poi la Poké Ball
//
// Funziona nel browser (window.SpritePkm) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.SpritePkm = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SD = 'https://play.pokemonshowdown.com/sprites';
    // specie il cui nome base contiene già un trattino
    const BASI_CON_TRATTINO = ['ho-oh', 'porygon-z', 'jangmo-o', 'hakamo-o', 'kommo-o',
        'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu', 'nidoran-f', 'nidoran-m'];

    const senzaAccenti = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '');
    const toId = t => senzaAccenti(t).toLowerCase().replace(/[^a-z0-9]/g, '');

    function pulisciSpecie(specie) {
        let s = String(specie == null ? '' : specie).trim().replace(/\s*\((?:m|f)\)\s*$/i, '');   // "Garchomp (M)"
        const m = s.match(/\(([^()]+)\)\s*$/);                                                     // "Soprannome (Garchomp)"
        if (m) s = m[1].trim();
        return s;
    }

    function idSprite(specie) {
        const s = senzaAccenti(pulisciSpecie(specie)).toLowerCase();
        let base = s, forma = '';
        const conTrattino = BASI_CON_TRATTINO.find(b => s === b || s.startsWith(b + '-'));
        if (conTrattino) { base = conTrattino; forma = s.slice(conTrattino.length + 1); }
        else if (s.includes('-')) { base = s.slice(0, s.indexOf('-')); forma = s.slice(s.indexOf('-') + 1); }
        const idBase = toId(base);
        return {
            completo: forma ? `${idBase}-${toId(forma)}` : idBase,
            base: idBase,
            db: base.replace(/[.'’:]/g, '').trim().replace(/\s+/g, '-')
        };
    }

    const id = specie => idSprite(specie).completo;
    const gif = specie => `${SD}/ani/${id(specie)}.gif`;
    const dex = specie => `${SD}/dex/${id(specie)}.png`;
    const pokeapi = specie => senzaAccenti(pulisciSpecie(specie)).toLowerCase().replace(/[.'’:%]/g, '').trim().replace(/\s+/g, '-');

    const POKEBALL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
    // specie che nella GIF possono avere il nome della forma di partenza (così le chiama anche PokéAPI)
    const FORME_DI_PARTENZA = { mimikyu: 'mimikyu-disguised', giratina: 'giratina-altered', deoxys: 'deoxys-normal', shaymin: 'shaymin-land', aegislash: 'aegislash-shield' };

    /** GIF mancante (onerror): la GIF con la forma di partenza (per le poche specie che ce l'hanno), poi il PNG del Pokédex, poi la Poké Ball.
     *  `idSprite` è l'id già calcolato (SpritePkm.id). */
    function riserva(img, idSprite) {
        const passi = [];
        if (idSprite && FORME_DI_PARTENZA[idSprite]) passi.push(`${SD}/ani/${FORME_DI_PARTENZA[idSprite]}.gif`);
        if (idSprite) passi.push(`${SD}/dex/${idSprite}.png`);
        const fase = Number(img.dataset.spriteFase || 0);
        img.dataset.spriteFase = String(fase + 1);
        if (fase < passi.length) { img.src = passi[fase]; return; }
        img.onerror = null;
        img.src = POKEBALL;
    }

    return { SD, POKEBALL, FORME_DI_PARTENZA, BASI_CON_TRATTINO, pulisciSpecie, idSprite, id, gif, dex, pokeapi, riserva };
});
