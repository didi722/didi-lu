/* =====================================================================
   ILLUSIONE SVELATA NEL CLIENT DI SHOWDOWN
   ---------------------------------------------------------------------
   Quando l'Illusione di Zoroark finisce il simulatore manda "|replace|p2a: Zoroark|Zoroark, L50, M": il Pokémon in campo era
   già Zoroark (travestito), e tiene tutto: potenziamenti, Dynamax, confusione, protezioni. Il client invece sostituisce l'oggetto
   Pokémon travestito con quello vero e azzera i suoi "volatili": i potenziamenti sparivano da fumetti e indicatori,
   anche in Dynamax. Qui il metodo Side.replace del client viene avvolto: prima si copia lo stato del Pokémon che stava
   in campo, dopo si rimette su quello vero tutto ciò che il client ha buttato via.
   proteggiSostituzione(Side) è idempotente; funziona su qualunque classe con replace(pokemon, slot) e active[].
   ===================================================================== */
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.IllusioneClient = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function proteggiSostituzione(Side) {
        const proto = Side && Side.prototype;
        if (!proto || typeof proto.replace !== 'function' || proto.replace.illusione) return false;
        const originale = proto.replace;
        proto.replace = function (pokemon, slot) {
            const posto = slot === undefined ? pokemon && pokemon.slot : slot;
            const prima = this.active ? this.active[posto] : null;
            const salvati = prima && prima !== pokemon ? { boosts: { ...(prima.boosts || {}) }, volatili: { ...(prima.volatiles || {}) } } : null;
            const esito = originale.apply(this, arguments);
            if (salvati) {
                pokemon.boosts = { ...(pokemon.boosts || {}) };
                for (const [stat, valore] of Object.entries(salvati.boosts)) if (valore && !pokemon.boosts[stat]) pokemon.boosts[stat] = valore;
                pokemon.volatiles = pokemon.volatiles || {};
                for (const [nome, v] of Object.entries(salvati.volatili)) if (!(nome in pokemon.volatiles) && nome !== 'illusion') pokemon.volatiles[nome] = v;
                try {
                    const scena = this.battle && this.battle.scene;
                    if (scena && typeof scena.updateStatbar === 'function') scena.updateStatbar(pokemon);
                } catch (e) { /* solo grafica */ }
            }
            return esito;
        };
        proto.replace.illusione = true;
        return true;
    }

    return { proteggiSostituzione };
});
