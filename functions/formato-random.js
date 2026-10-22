// =====================================================
// FORMATO RANDOM — Poké-Tournament
//
// Il formato "Random Battle" di Pokémon Showdown: nessun team da costruire, i team li compone Showdown (ogni giocatore ne riceve uno
// a caso, nuovo a ogni partita) e le regole sono quelle del formato ufficiale. Per questo un formato Random del sito non ha nulla da
// impostare: solo QUALE Random Battle di Showdown è (la generazione e se è singolo o doppio).
//
// Nel database un formato Random è un normale regolamento (regolamenti/{id}) con:
//   strutturaSito: 'random'
//   formatoSimulatore: l'id del formato di Showdown, ad esempio 'gen9randombattle'
//   genRuleType / genRuleValue / battleStyle: gli stessi campi degli altri formati (per chi li legge senza saper nulla del Random)
//
//   FORMATI                  -> i formati Random che il sito sa giocare: { id, nome, gen, doppio }
//   eRandom(regolamento)     -> true se il regolamento è un formato Random
//   trova(id)                -> la voce di FORMATI con quell'id (o null)
//   idSimulatore(regolamento)-> l'id del formato di Showdown da giocare (quello salvato, se è uno dei nostri; altrimenti il predefinito)
//   descrivi(regolamento)    -> la voce di FORMATI di quel regolamento
//   campiRegolamento(id)     -> i campi da salvare nel regolamento per quel formato Random
//   generazione(regolamento) -> la generazione del formato
//
// Funziona sia nelle Cloud Functions (require) sia nel browser (self.FormatoRandom).
// ATTENZIONE: questo file esiste in due copie identiche, functions/formato-random.js (partite online)
// e docs/formato-random.js (pagine e partite locali). Modificane una e copiala sull'altra.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.FormatoRandom = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Solo i Random Battle "classici" che il simulatore del sito e quello del server conoscono entrambi: singolo dalla Gen 1 alla Gen 9,
    // doppio in Gen 9 (gli altri Random di Showdown, come il Baby, il BDSP o il Let's Go, non fanno parte del sito).
    const DEFINIZIONI = [
        [9, false], [9, true], [8, false], [7, false], [6, false], [5, false], [4, false], [3, false], [2, false], [1, false]
    ];
    const FORMATI = DEFINIZIONI.map(([gen, doppio]) => Object.freeze({
        id: `gen${gen}random${doppio ? 'doubles' : ''}battle`,
        nome: `[Gen ${gen}] Random ${doppio ? 'Doubles ' : ''}Battle`,
        gen, doppio
    }));
    const PREDEFINITO = FORMATI[0];

    const struttura = regolamento => String((regolamento && regolamento.strutturaSito) || '').toLowerCase().trim();
    const eRandom = regolamento => struttura(regolamento) === 'random';

    function trova(id) {
        const chiave = String(id == null ? '' : id).toLowerCase().replace(/[^a-z0-9]/g, '');
        return FORMATI.find(f => f.id === chiave) || null;
    }

    function descrivi(regolamento) {
        return trova(regolamento && regolamento.formatoSimulatore) || PREDEFINITO;
    }

    const idSimulatore = regolamento => descrivi(regolamento).id;
    const generazione = regolamento => descrivi(regolamento).gen;

    // Cosa si salva in un regolamento Random (oltre a nome e descrizione). I campi "da formato normale" servono solo a chi li legge
    // senza sapere del Random: tier, restrizioni e meccaniche non esistono perché le decide Showdown.
    function campiRegolamento(id) {
        const f = trova(id) || PREDEFINITO;
        return {
            strutturaSito: 'random',
            formatoSimulatore: f.id,
            genRuleType: 'within',
            genRuleValue: String(f.gen),
            battleStyle: f.doppio ? 'doubles' : 'singles',
            generationalMechanics: true       // Dynamax, Teracristal, Mosse Z e Mega ci sono dove Showdown li ammette
        };
    }

    return { FORMATI, PREDEFINITO, eRandom, trova, descrivi, idSimulatore, generazione, campiRegolamento };
});
