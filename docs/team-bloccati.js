// =====================================================
// TEAM BLOCCATI
// Un team non si modifica più quando è stato iscritto almeno una volta a una stagione iniziata (in corso o chiusa),
// anche se non ne ha mai preso parte: nel Box sparisce il tasto con la matita, e così nel simulatore.
// È la regola che prima stava dentro box.html (caricaTeamBloccati): qui è una sola, usata da tutti e due.
//
//   nomiBloccati(stagioni)        -> Set dei nomi (in minuscolo, senza spazi ai lati) dei team iscritti a una stagione
//                                    "playing" o "closed". stagioni = il nodo "seasons" di Firebase.
//   eBloccato(bloccati, nome)     -> true se quel team è tra i bloccati. "bloccati" è il Set (o direttamente "seasons").
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

    return { nomiBloccati, eBloccato, chiave, STAGIONI_CHE_NON_BLOCCANO, STATI_DI_STAGIONE_INIZIATA };
});
