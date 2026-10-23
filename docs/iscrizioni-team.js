// =====================================================
// ISCRIZIONI DEI TEAM ALLE STAGIONI — allineamento con il Box
//
// Quando un team si iscrive a una stagione se ne salva una fotografia (seasons/{id}/teams_iscritti/{formato}/{giocatore}/datiTeams:
// [{ id, nome, pokemon }]). Se poi il team viene modificato nel Box (nome, Pokémon), la fotografia restava quella vecchia.
// Questo modulo la riallinea: per ogni team iscritto si guarda il team con lo stesso id nel Box (players/{giocatore}/teams/{id}) e,
// se nome o Pokémon sono diversi, si aggiorna la fotografia.
//
// Quali stagioni: quelle in iscrizione, in arrivo e in corso. Le stagioni chiuse sono storia e non si toccano.
// Se un team è stato rinominato, i match già salvati della stagione che portano il vecchio nome (team1/team2 di quel giocatore)
// prendono il nuovo, così le statistiche per team restano insieme.
//
//   piano(seasons, players, filtro?)   puro: { iscrizioni: { percorso: valore }, match: { percorso: nome }, rinomine: [...] }
//   applica(db, piano)                 scrive il piano (una scrittura per percorso)
//   sincronizza(db, filtro?)           legge, calcola e scrive. Restituisce il piano
//   filtro: { giocatore?: id, teamId?: id, conMatch?: true|false (default true) }
//
// Funziona nel browser (window.IscrizioniTeam) e in Node (test/iscrizioni-team.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.IscrizioniTeam = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STATI_AGGIORNABILI = ['open', 'coming soon', 'playing'];

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const voci = x => (x && typeof x === 'object' ? Object.entries(x) : []);
    // Il nome di un team iscritto: di solito una stringa, in alcuni salvataggi { valore }
    const nomeDi = t => (t && typeof t.nome === 'object' && t.nome ? t.nome.valore : (t && t.nome)) || '';
    const uguali = (a, b) => JSON.stringify(valori(a)) === JSON.stringify(valori(b));

    function piano(seasons, players, filtro = {}) {
        const soloGiocatore = filtro.giocatore ? idDi(filtro.giocatore) : null;
        const soloTeam = filtro.teamId || null;
        const conMatch = filtro.conMatch !== false;
        const risultato = { iscrizioni: {}, match: {}, rinomine: [] };

        for (const [sid, stagione] of Object.entries(seasons || {})) {
            const stato = String((stagione && stagione.info && stagione.info.status) || '').toLowerCase();
            if (!STATI_AGGIORNABILI.includes(stato)) continue;

            const mappe = {};      // giocatore -> { nome vecchio (minuscolo) -> nome nuovo }
            for (const [formato, perGiocatore] of voci(stagione.teams_iscritti)) {
                for (const [chiaveGiocatore, iscrizione] of voci(perGiocatore)) {
                    const giocatore = idDi(chiaveGiocatore);
                    if (soloGiocatore && giocatore !== soloGiocatore) continue;
                    const box = (players && players[giocatore] && players[giocatore].teams) || {};
                    for (const [k, fotografia] of voci(iscrizione && iscrizione.datiTeams)) {
                        if (!fotografia || !fotografia.id) continue;
                        if (soloTeam && fotografia.id !== soloTeam) continue;
                        const attuale = box[fotografia.id];
                        if (!attuale) continue;                                  // team cancellato dal Box: resta com'è
                        const nomeVecchio = String(nomeDi(fotografia)), nomeNuovo = String(attuale.nome || '');
                        const cambiaNome = nomeNuovo !== '' && nomeVecchio !== nomeNuovo;
                        const cambiaPokemon = !uguali(fotografia.pokemon, attuale.pokemon);
                        if (!cambiaNome && !cambiaPokemon) continue;
                        const nuova = { ...fotografia, id: fotografia.id, nome: cambiaNome ? nomeNuovo : fotografia.nome };
                        if (cambiaPokemon) nuova.pokemon = attuale.pokemon || [];
                        risultato.iscrizioni[`seasons/${sid}/teams_iscritti/${formato}/${chiaveGiocatore}/datiTeams/${k}`] = nuova;
                        if (cambiaNome) {
                            (mappe[giocatore] ||= {})[idDi(nomeVecchio)] = nomeNuovo;
                            risultato.rinomine.push({ stagione: sid, formato, giocatore, teamId: fotografia.id, da: nomeVecchio, a: nomeNuovo });
                        }
                    }
                }
            }

            if (!conMatch) continue;
            for (const [sdId, sd] of voci(stagione.showdowns)) {
                for (const [mKey, m] of voci(sd && sd.matches)) {
                    if (!m) continue;
                    for (const [lato, campo] of [['player1Id', 'team1'], ['player2Id', 'team2']]) {
                        const mappa = mappe[idDi(m[lato])];
                        const nuovo = mappa && mappa[idDi(m[campo])];
                        if (nuovo) risultato.match[`seasons/${sid}/showdowns/${sdId}/matches/${mKey}/${campo}`] = nuovo;
                    }
                }
            }
        }
        return risultato;
    }

    async function applica(db, p) {
        for (const [percorso, valore] of Object.entries(p.iscrizioni)) await db.ref(percorso).set(valore);
        for (const [percorso, valore] of Object.entries(p.match)) await db.ref(percorso).set(valore);
        return p;
    }

    async function sincronizza(db, filtro = {}) {
        const [stagioni, giocatori] = await Promise.all([
            db.ref('seasons').once('value'),
            filtro.giocatore ? db.ref(`players/${idDi(filtro.giocatore)}`).once('value').then(s => ({ val: () => ({ [idDi(filtro.giocatore)]: s.val() }) })) : db.ref('players').once('value')
        ]);
        return applica(db, piano(stagioni.val() || {}, giocatori.val() || {}, filtro));
    }

    return { piano, applica, sincronizza, STATI_AGGIORNABILI };
});
