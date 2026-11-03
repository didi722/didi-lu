// =====================================================
// COSMETICI DEL NEGOZIO — Poké-Tournament
//
// Cose che si comprano con le monete (wallet/{uid}) e cambiano solo l'aspetto: il Pokémon compagno shiny, l'aura dell'allenatore, i motivi dello sfondo
// della pagina pubblica. Il catalogo è questo file: aggiungere una voce basta a metterla in vendita.
// ATTENZIONE: questo file esiste in due copie identiche, functions/cosmetici.js (il server controlla prezzi e acquisti) e docs/cosmetici.js (il sito).
// Modificane una e copiala sull'altra (lo controlla test/cosmetici.test.js).
//
//   Cosmetici.CATALOGO, Cosmetici.perId(id), Cosmetici.TIPI
//   Cosmetici.possiede(id, { wallet, info, pagina })   comprato, oppure già in uso (chi usava un motivo che ora è a pagamento lo tiene)
//   Cosmetici.possedutiDa({ wallet, info, pagina })    l'insieme degli id posseduti
//   Cosmetici.motivoBloccato(motivo, contesto)         true se quel motivo dello sfondo è a pagamento e non è posseduto
//
// Funziona nel browser (window.Cosmetici) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Cosmetici = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TIPI = {
        shiny: { nome: 'Shiny companion', frase: 'Your favourite Pokémon in its shiny colours.' },
        aura: { nome: 'Trainer aura', frase: 'A glow around your trainer on your page.' },
        sfondo: { nome: 'Page patterns', frase: 'More patterns for the background of your page.' }
    };

    // `campo`: dove si scrive quando si equipaggia (players/{id}/info/<campo>); per i motivi non c'è: li sceglie l'editor della pagina
    const CATALOGO = [
        { id: 'shiny', tipo: 'shiny', nome: 'Shiny companion', prezzo: 200, campo: 'pkmShiny', descr: 'Your favourite Pokémon shows up shiny on your page, in the rankings and on share cards.' },
        { id: 'aura-oro', tipo: 'aura', nome: 'Gold aura', prezzo: 150, campo: 'aura', colore: '#ffcc33', descr: 'A warm golden glow around your trainer.' },
        { id: 'aura-fiamma', tipo: 'aura', nome: 'Flame aura', prezzo: 150, campo: 'aura', colore: '#ff5a1f', descr: 'A fiery orange glow.' },
        { id: 'aura-ghiaccio', tipo: 'aura', nome: 'Ice aura', prezzo: 150, campo: 'aura', colore: '#5fd4ff', descr: 'A cold blue glow.' },
        { id: 'aura-arcobaleno', tipo: 'aura', nome: 'Rainbow aura', prezzo: 250, campo: 'aura', colore: '#ff66cc', descr: 'A glow that cycles through every colour.' },
        { id: 'sfondo-raggi', tipo: 'sfondo', nome: 'Sunburst', prezzo: 100, motivo: 'raggi', descr: 'Rays from the stage.' },
        { id: 'sfondo-pokeball', tipo: 'sfondo', nome: 'Pokéballs', prezzo: 100, motivo: 'pokeball', descr: 'A field of tiny Poké Balls.' },
        { id: 'sfondo-anelli', tipo: 'sfondo', nome: 'Rings', prezzo: 100, motivo: 'anelli', descr: 'Overlapping rings.' },
        { id: 'sfondo-stelle', tipo: 'sfondo', nome: 'Stars', prezzo: 100, motivo: 'stelle', descr: 'A sky of little stars.' },
        { id: 'sfondo-onde', tipo: 'sfondo', nome: 'Waves', prezzo: 100, motivo: 'onde', descr: 'Soft rolling waves.' }
    ];

    const perId = id => CATALOGO.find(c => c.id === id) || null;
    const objOr = x => (x && typeof x === 'object' ? x : {});

    /** Comprato (wallet.posseduti), oppure già in uso: chi usava un motivo che ora è a pagamento, o ha già il compagno shiny, lo tiene */
    function possiede(id, { wallet, info, pagina } = {}) {
        const c = perId(id);
        if (!c) return false;
        if (objOr(objOr(wallet).posseduti)[id]) return true;
        const i = objOr(info);
        if (c.tipo === 'shiny') return !!i.pkmShiny;
        if (c.tipo === 'aura') return i.aura === id;
        if (c.tipo === 'sfondo') return objOr(objOr(pagina).sfondo).motivo === c.motivo;
        return false;
    }

    function possedutiDa(contesto) {
        return new Set(CATALOGO.filter(c => possiede(c.id, contesto)).map(c => c.id));
    }

    /** Il motivo dello sfondo è a pagamento e chi guarda non lo possiede? */
    function motivoBloccato(motivo, contesto) {
        const c = CATALOGO.find(x => x.tipo === 'sfondo' && x.motivo === motivo);
        return !!c && !possiede(c.id, contesto);
    }

    return { CATALOGO, TIPI, perId, possiede, possedutiDa, motivoBloccato };
});
