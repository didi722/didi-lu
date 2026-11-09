// =====================================================
// TEAM BLOCCATI
// Un team non si modifica più quando è stato iscritto almeno una volta a una stagione iniziata (in corso o chiusa),
// anche se non ne ha mai preso parte: nel Box sparisce il tasto con la matita, e così nel simulatore.
// È la regola che prima stava dentro box.html (caricaTeamBloccati): qui è una sola, usata da tutti e due.
//
//   nomiBloccati(stagioni)        -> Set dei nomi (in minuscolo, senza spazi ai lati) dei team iscritti a una stagione
//                                    "playing" o "closed". stagioni = il nodo "seasons" di Firebase.
//   eBloccato(bloccati, nome)     -> true se quel team è tra i bloccati. "bloccati" è il Set (o direttamente "seasons").
//   iscrittiInStagioniAperte(stagioni, { giocatore, formato, escludi })
//                                 -> i team di quel giocatore, in quel formato, iscritti a stagioni con le iscrizioni ancora aperte (non iniziate): sono ancora
//                                    modificabili, ma lo smettono appena la stagione inizia. Serve alla regola di somiglianza (somiglianza-team.js).
//
// Si guarda il nome del team, come ha sempre fatto il Box. La stagione di prova "sbeta" non blocca nulla.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.TeamBloccati = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STAGIONI_CHE_NON_BLOCCANO = ['sbeta'];
    const STATI_DI_STAGIONE_INIZIATA = ['playing', 'closed'];

    const chiave = nome => String(nome == null ? '' : nome).trim().toLowerCase();

    // Il nome di un team iscritto: di solito una stringa, in alcuni salvataggi { valore }
    function nomeDi(t) {
        if (!t) return '';
        return typeof t.nome === 'object' && t.nome ? t.nome.valore : t.nome;
    }

    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);

    function nomiBloccati(stagioni) {
        const nomi = new Set();
        for (const [id, stagione] of Object.entries(stagioni || {})) {
            if (STAGIONI_CHE_NON_BLOCCANO.includes(id)) continue;
            const stato = stagione && stagione.info && stagione.info.status;
            if (!STATI_DI_STAGIONE_INIZIATA.includes(stato)) continue;
            // formati -> allenatori -> datiTeams
            for (const formato of valori(stagione.teams_iscritti)) {
                for (const allenatore of valori(formato)) {
                    for (const t of valori(allenatore && allenatore.datiTeams)) {
                        const nome = chiave(nomeDi(t));
                        if (nome) nomi.add(nome);
                    }
                }
            }
        }
        return nomi;
    }

    function eBloccato(bloccati, nome) {
        const insieme = bloccati instanceof Set ? bloccati : nomiBloccati(bloccati);
        const n = chiave(nome);
        return !!n && insieme.has(n);
    }

    /**
     * I team di un giocatore iscritti, in un formato, a stagioni con le iscrizioni ancora aperte. Una stagione ha le iscrizioni aperte finché non è iniziata (né "playing"
     * né "closed"; senza stato, come per l'Hub, è aperta); la stagione di prova "sbeta" non conta, perché non blocca niente. `escludi` è l'id di una stagione da saltare
     * (quella di cui si sta scegliendo l'iscrizione). Ogni voce: { id, nome, pokemon, stagione (id), nomeStagione }, con nome e Pokémon della fotografia dell'iscrizione.
     * Il giocatore e il formato si confrontano senza badare a maiuscole e spazi.
     */
    function iscrittiInStagioniAperte(stagioni, { giocatore, formato, escludi } = {}) {
        const chiaveGiocatore = chiave(giocatore);
        const chiaveFormato = chiave(formato);
        const trovati = [];
        for (const [id, stagione] of Object.entries(stagioni || {})) {
            if (!stagione || id === escludi || STAGIONI_CHE_NON_BLOCCANO.includes(id)) continue;
            const stato = chiave(stagione.info && stagione.info.status) || 'open';
            if (STATI_DI_STAGIONE_INIZIATA.includes(stato)) continue;
            const nomeStagione = (stagione.info && stagione.info.name) || id;
            for (const [nomeFormato, perGiocatore] of Object.entries(stagione.teams_iscritti || {})) {
                if (chiave(nomeFormato) !== chiaveFormato) continue;
                for (const [chiaveDi, iscrizione] of Object.entries(perGiocatore || {})) {
                    if (chiave(chiaveDi) !== chiaveGiocatore || !iscrizione) continue;
                    const fotografie = valori(iscrizione.datiTeams);
                    const ids = valori(iscrizione.teamIds);
                    for (const teamId of (ids.length ? ids : fotografie.map(f => f && f.id).filter(Boolean))) {
                        const foto = fotografie.find(f => f && f.id === teamId) || {};
                        trovati.push({ id: teamId, nome: String(nomeDi(foto) || ''), pokemon: foto.pokemon || [], stagione: id, nomeStagione });
                    }
                }
            }
        }
        return trovati;
    }

    return { nomiBloccati, eBloccato, iscrittiInStagioniAperte, chiave, STAGIONI_CHE_NON_BLOCCANO, STATI_DI_STAGIONE_INIZIATA };
});
