// =====================================================
// ETICHETTE DEI TEAM — Poké-Tournament
//
// Ogni giocatore può creare delle etichette (un nome e un colore) e metterne quante vuole sui suoi team del Box, poi filtrare il Box per etichetta.
// Dove stanno: players/<id>/etichette/<idEtichetta> = { nome, colore }  e  players/<id>/teams/<team>/etichette/<idEtichetta> = true.
// Sono dati del giocatore (vale la regola di `players`): nessuna regola in più.
//
//   EtichetteTeam.COLORI, MASSIMO, NESSUNA        i colori proposti, quante etichette al massimo, il valore del filtro "senza etichette"
//   EtichetteTeam.pulisciNome(testo)              il nome pulito (spazi, al massimo 20 caratteri)
//   EtichetteTeam.coloreValido(testo, base?)      "#rrggbb" oppure il colore di base
//   EtichetteTeam.coloreTesto(colore)             "#000" o "#fff": quello che si legge meglio sul colore
//   EtichetteTeam.elenco(definizioni)             [{ id, nome, colore }] in ordine di nome, scartando quelle rotte
//   EtichetteTeam.diTeam(team, definizioni)       le etichette di un team (solo quelle che esistono ancora)
//   EtichetteTeam.corrisponde(team, definizioni, filtro)   true se il team passa il filtro ('' = tutti, NESSUNA = senza etichette, o un id)
//   EtichetteTeam.nuovoId(definizioni)            un id libero
//
// Funziona nel browser (window.EtichetteTeam) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.EtichetteTeam = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const COLORI = ['#ff5c5c', '#ff9f43', '#ffd43b', '#51cf66', '#22b8cf', '#4c6ef5', '#cc5de8', '#f783ac'];
    const MASSIMO = 12;
    const NESSUNA = '__nessuna';

    const pulisciNome = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, 20);
    const coloreValido = (t, base = COLORI[0]) => (/^#[0-9a-f]{6}$/i.test(String(t || '')) ? String(t).toLowerCase() : base);
    function coloreTesto(colore) {
        const c = coloreValido(colore);
        const [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff';
    }
    function elenco(definizioni) {
        const out = [];
        for (const [id, d] of Object.entries(definizioni && typeof definizioni === 'object' ? definizioni : {})) {
            const nome = pulisciNome(d && d.nome);
            if (!nome) continue;
            out.push({ id, nome, colore: coloreValido(d.colore) });
        }
        return out.sort((a, b) => a.nome.localeCompare(b.nome));
    }
    function diTeam(team, definizioni) {
        const mie = team && team.etichette && typeof team.etichette === 'object' ? team.etichette : {};
        return elenco(definizioni).filter(e => mie[e.id]);
    }
    function corrisponde(team, definizioni, filtro) {
        if (!filtro) return true;
        const mie = diTeam(team, definizioni);
        return filtro === NESSUNA ? mie.length === 0 : mie.some(e => e.id === filtro);
    }
    function nuovoId(definizioni) {
        const usati = new Set(Object.keys(definizioni || {}));
        let id;
        do { id = 'e' + Math.random().toString(36).slice(2, 8); } while (usati.has(id));
        return id;
    }
    return { COLORI, MASSIMO, NESSUNA, pulisciNome, coloreValido, coloreTesto, elenco, diTeam, corrisponde, nuovoId };
});
