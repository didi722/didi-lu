// =====================================================
// NOMI UNICI — Poké-Tournament
//
// Showdown identifica i Pokémon di un lato col soprannome ("p1a: Calyrex"), e il suo client
// grafico, il log e le statistiche ci contano. Un team con due Pokémon dello stesso soprannome
// li confonde: lo schermo può far sparire lo sprite sbagliato, il Pokémon che esce non è quello
// segnato, le statistiche si mescolano. Capita con due forme della stessa specie (Calyrex-Ice e
// Calyrex-Shadow), perché senza soprannome il simulatore chiama entrambe col nome della specie
// base: "Calyrex". Nei formati ufficiali la Species Clause lo impedisce; qui no, quindi i nomi
// doppi si distinguono prima di impacchettare il team.
//
// nomiUnici(sets, baseDi) corregge i set sul posto e li restituisce:
//   - un Pokémon senza soprannome (o col nome della specie) prende il nome della sua forma:
//     "Shadow Calyrex", "Ice Calyrex", "Rapid Strike Urshifu". Non può essere "Calyrex-Shadow"
//     né "Calyrex Shadow": se il soprannome ha le stesse lettere della specie il team impacchettato
//     lo perde e il simulatore torna a "Calyrex";
//   - un soprannome vero ("Bob") resta com'è, e un eventuale doppione prende un numero ("Bob 2");
//   - un team senza nomi doppi non cambia di una virgola.
// baseDi(specie) restituisce la specie base ("Calyrex-Ice" -> "Calyrex"); senza, si usa la specie.
//
// Funziona sia nelle Cloud Functions (require) sia nel browser (window.NomiUnici).
// ATTENZIONE: questo file esiste in due copie identiche, functions/nomi-unici.js (partite online)
// e docs/nomi-unici.js (partite locali). Modificane una e copiala sull'altra.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.NomiUnici = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX = 20;     // Showdown taglia i soprannomi a 20 caratteri
    const chiave = n => String(n == null ? '' : n).toLowerCase().replace(/[^a-z0-9]+/g, '');

    function conNumero(radice, n) {
        const suffisso = ` ${n}`;
        return radice.slice(0, MAX - suffisso.length) + suffisso;
    }

    // "Calyrex-Shadow" (base "Calyrex") -> "Shadow Calyrex"; vuoto se non è una forma
    function nomeForma(species, base) {
        const sp = String(species || '');
        return base && sp.startsWith(base + '-') ? `${sp.slice(base.length + 1).replace(/-/g, ' ')} ${base}` : '';
    }

    function nomiUnici(sets, baseDi) {
        if (!Array.isArray(sets)) return sets;
        const base = s => (typeof baseDi === 'function' && baseDi(s.species)) || String(s.species || '');
        // Senza soprannome, o con un nome che ha le stesse lettere della specie ("Calyrex Ice" per
        // Calyrex-Ice), il team impacchettato lo perde e il simulatore usa la specie base
        const perso = s => !s.name || chiave(s.name) === chiave(s.species);
        const predefinito = s => perso(s) || chiave(s.name) === chiave(base(s));
        const forma = s => nomeForma(s.species, base(s));
        const effettivo = s => (perso(s) ? base(s) : String(s.name));

        const quanti = new Map();
        for (const s of sets) quanti.set(chiave(effettivo(s)), (quanti.get(chiave(effettivo(s))) || 0) + 1);
        if (![...quanti.values()].some(n => n > 1)) return sets;

        // i nomi già unici restano com'erano e non si possono riusare
        const occupati = new Set([...quanti].filter(([, n]) => n === 1).map(([k]) => k));
        for (const s of sets) {
            if (quanti.get(chiave(effettivo(s))) === 1) continue;
            const radice = (predefinito(s) ? forma(s) || String(s.species || effettivo(s)) : String(s.name)).slice(0, MAX);
            let nome = radice;
            for (let n = 2; occupati.has(chiave(nome)); n++) nome = conNumero(radice, n);
            occupati.add(chiave(nome));
            s.name = nome;
        }
        return sets;
    }

    return { nomiUnici, nomeForma, conNumero, chiave };
});
