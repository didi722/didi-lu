// =====================================================
// SCHEDA DELL'ALLENATORE NEL SIMULATORE — Poké-Tournament
//
// In battaglia, ai lati dello schermo, ogni allenatore ha la sua colonna (battle-extra.js). Qui si prepara quello che ci va aggiunto, un
// vanto per chi lo ha guadagnato e un po' di contesto per chi gioca contro di lui:
//   - il titolo che l'allenatore ha scelto di mostrare (lo stesso della sua pagina pubblica: se lì lo ha nascosto, qui non c'è);
//   - ELO e posizione in classifica (come nella sua scheda: la classifica conta chi ha giocato almeno tre showdown);
//   - le medaglie dei suoi badge da allenatore (il fondatore, le serie, i badge del catalogo), le più alte;
//   - i badge del team in campo (le medagliette vinte) e le medagliette dei fiocchi su ogni suo Pokémon (passandoci sopra, l'elenco).
// Sono tutti numeri pubblici, calcolati come nel resto del sito (Fiocchi.carica: una sola lettura di Firebase per pagina).
// Funzione di dati e di HTML, niente DOM: funziona nel browser (window.SchedaBattaglia) e in Node (test/scheda-battaglia.test.js).
// Le dipendenze (Fiocchi, BadgeTeam, BadgeAllenatore, Titoli, PaginaPubblica) si passano in `dip` o si prendono dalla pagina.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(null);
    else radice.SchedaBattaglia = fabbrica(radice);
})(typeof self !== 'undefined' ? self : this, function (finestra) {
    'use strict';

    const MAX_MEDAGLIE = 5;
    const ORDINE_LIVELLO = { founder: 4, gold: 3, silver: 2, bronze: 1 };
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dipendenze = dip => Object.assign({}, finestra && {
        Fiocchi: finestra.Fiocchi, BadgeTeam: finestra.BadgeTeam, BadgeAllenatore: finestra.BadgeAllenatore, Titoli: finestra.Titoli,
        PaginaPubblica: finestra.PaginaPubblica, Statistiche: finestra.Statistiche
    }, dip || {});

    // -----------------------------------------------------
    // Dati
    // -----------------------------------------------------
    /** Il titolo che l'allenatore mostra: `info.title`, a meno che nella sua pagina pubblica la targhetta del titolo sia nascosta. */
    function titoloVisibile(info, PaginaPubblica) {
        const titolo = String((info && info.title) || '').trim();
        if (!titolo) return '';
        let posto = info && info.pagina && info.pagina.targhette && info.pagina.targhette.titolo;
        if (PaginaPubblica && typeof PaginaPubblica.normalizza === 'function') {
            try { posto = PaginaPubblica.normalizza(info.pagina).targhette.titolo; } catch (e) { /* resta il valore grezzo */ }
        }
        return posto === 'nessuno' ? '' : titolo;
    }

    /**
     * Le medaglie dei badge da allenatore (tutte quelle prese), le più alte per prime: il fondatore, le serie (Clean, Win, SD Streak)
     * e i badge del catalogo. Ognuna: { id, nome, livello: 'founder'|'gold'|'silver'|'bronze', livelloNome, img, testo, icona }.
     */
    function medaglieAllenatore({ id, statsBadge, lista }, dip) {
        const { Titoli, BadgeAllenatore } = dipendenze(dip);
        const medaglie = [];
        if (Titoli) {
            for (const b of Titoli.badgeSbloccati(statsBadge || {}, id)) {
                const livelloNome = b.livello === 'founder' ? 'Founder' : b.livello.charAt(0).toUpperCase() + b.livello.slice(1);
                medaglie.push({ id: b.id, nome: b.label, livello: b.livello, livelloNome, img: b.img, testo: b.descrizione, icona: b.livello === 'founder' ? '👑' : '🏅' });
            }
        }
        if (BadgeAllenatore && lista) {
            for (const b of BadgeAllenatore.guadagnati(lista)) {
                medaglie.push({ id: b.id, nome: b.nome, livello: b.classeLivello, livelloNome: b.livelloNome, img: b.immagine, testo: `${b.valore} ${b.unita}`, icona: b.icona });
            }
        }
        return medaglie.map((m, i) => ({ m, i })).sort((a, b) => (ORDINE_LIVELLO[b.m.livello] || 0) - (ORDINE_LIVELLO[a.m.livello] || 0) || a.i - b.i).map(x => x.m);
    }

    /**
     * Le schede dei due allenatori. `ids`: { p1, p2 } (id dei giocatori in Firebase, vuoto per chi non ne ha, come la CPU).
     * Restituisce { p1: scheda | null, p2: scheda | null, risultato }. Una lettura sbagliata non rompe la partita: si torna senza schede.
     */
    async function carica(db, ids, dip) {
        const d = dipendenze(dip);
        const { Fiocchi, BadgeAllenatore, PaginaPubblica } = d;
        const vuoto = { p1: null, p2: null, risultato: null };
        if (!db || !Fiocchi) return vuoto;
        const voluti = ['p1', 'p2'].filter(l => ids && ids[l]);
        if (!voluti.length) return vuoto;
        try {
            const [risultato, snap] = await Promise.all([Fiocchi.carica(db, d.Statistiche), db.ref('players').once('value')]);
            const giocatori = snap.val() || {};
            const out = { p1: null, p2: null, risultato };
            for (const lato of voluti) {
                const richiesto = ids[lato];
                const chiave = giocatori[richiesto] ? richiesto : Object.keys(giocatori).find(k => idDi(k) === idDi(richiesto));
                const g = chiave ? giocatori[chiave] : null;
                if (!g) continue;
                const info = g.info || {}, individuali = (g.stats && g.stats['individual-stats']) || {};
                let posizione = '';
                if (PaginaPubblica && typeof PaginaPubblica.riepilogoStat === 'function') {
                    // "#3" se è in classifica (almeno tre showdown giocati), altrimenti niente: come nella sua scheda
                    const r = PaginaPubblica.riepilogoStat(chiave, giocatori).rank;
                    posizione = r && /^#\d+$/.test(r.grande) ? r.grande : '';
                }
                const lista = BadgeAllenatore ? BadgeAllenatore.calcola(risultato, chiave) : null;
                out[lato] = {
                    id: chiave, nome: info.name || chiave, colore: info.color || '',
                    titolo: titoloVisibile(info, PaginaPubblica),
                    elo: Number(individuali.ranking) || 1000,
                    posizione,
                    medaglie: medaglieAllenatore({ id: chiave, statsBadge: g.stats && g.stats.badges, lista }, d)
                };
            }
            return out;
        } catch (e) {
            if (typeof console !== 'undefined') console.warn('Trainer cards not available:', e);
            return vuoto;
        }
    }

    // -----------------------------------------------------
    // HTML
    // -----------------------------------------------------
    const medagliaHtml = m =>
        `<span class="bt-mini bt-${esc(m.livello === 'founder' ? 'gold' : m.livello)}" title="${esc(m.nome)} · ${esc(m.livelloNome)}: ${esc(m.testo)}">` +
        `<img class="bt-mini-img" src="${esc(m.img)}" alt="" loading="lazy" onerror="BadgeTeam.immagineMancante(this,'${esc(m.icona)}')"></span>`;

    /** Il blocco sotto il nome: titolo, ELO e posizione, le medaglie da allenatore. Vuoto se non c'è la scheda. */
    function htmlScheda(sc) {
        if (!sc) return '';
        const visibili = sc.medaglie.slice(0, MAX_MEDAGLIE), resto = sc.medaglie.length - visibili.length;
        const medaglie = sc.medaglie.length
            ? `<div class="scheda-riga scheda-medaglie" aria-label="Trainer badges"><span class="scheda-etichetta">Badges</span>` +
              visibili.map(medagliaHtml).join('') +
              (resto > 0 ? `<span class="bt-mini bt-altri" title="${resto} more trainer badge${resto > 1 ? 's' : ''}">+${resto}</span>` : '') + '</div>'
            : '';
        return `<div class="lato-scheda">` +
            (sc.titolo ? `<p class="scheda-titolo">${esc(sc.titolo)}</p>` : '') +
            `<div class="scheda-riga"><span class="scheda-elo" title="Elo rating">ELO <b>${esc(sc.elo)}</b></span>` +
            (sc.posizione ? `<span class="scheda-posizione" title="Position in the league ranking">${esc(sc.posizione)}</span>` : '') + `</div>` +
            medaglie + `</div>`;
    }

    /** I badge del team in campo: le medagliette vinte (la descrizione al passaggio), come in ogni pagina fuori dal Box. Vuoto se non si sa quale team è o non ne ha. */
    function htmlBadgeTeam(risultato, sc, nomeTeam, dip) {
        const { BadgeTeam } = dipendenze(dip);
        if (!BadgeTeam || !risultato || !sc || !nomeTeam) return '';
        const lista = BadgeTeam.calcola(BadgeTeam.trova(risultato, { player: sc.id, team: nomeTeam }));
        const medaglie = BadgeTeam.htmlMini(lista, MAX_MEDAGLIE);
        return medaglie ? `<span class="scheda-team-badge"><span class="bt-barra-mini">${medaglie}</span></span>` : '';
    }

    /**
     * Le medagliette dei fiocchi di un Pokémon del team (e l'elenco al passaggio). `nomi`: i Pokémon del team nell'ordine (la specie o
     * "Soprannome (Specie)"), `indice` la posizione di quello che interessa (due Pokémon della stessa specie si distinguono per l'ordine).
     */
    function htmlFiocchiPokemon(risultato, sc, nomeTeam, nomi, indice, dip) {
        const { Fiocchi } = dipendenze(dip);
        if (!Fiocchi || !risultato || !sc || !nomeTeam || !nomi || !nomi[indice]) return '';
        const squadra = { nome: nomeTeam, pokemon: nomi.map(n => ({ nome: n })) };
        const entry = Fiocchi.trova(risultato, {
            player: sc.id, team: nomeTeam, specie: nomi[indice], ordinale: Fiocchi.ordinaleDi(squadra, squadra.pokemon[indice], indice)
        });
        return entry ? Fiocchi.htmlMedaglieConElenco(Fiocchi.calcola(entry)) : '';
    }

    return { MAX_MEDAGLIE, titoloVisibile, medaglieAllenatore, carica, htmlScheda, htmlBadgeTeam, htmlFiocchiPokemon };
});
