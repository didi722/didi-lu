// =====================================================
// BADGE DEGLI ALLENATORI — Poké-Tournament
//
// Riconoscimenti di UN allenatore, come i badge dei team (badge-team.js) lo sono di un team e i fiocchi (fiocchi.js) di un Pokémon.
// Si aggiungono ai badge delle serie che c'erano già (Clean Streak, Win Streak, SD Streak e il Fondatore: titoli.js) e, come tutti,
// partono dai numeri reali: Statistiche.calcola(dati, { stagione: 'all' }), un elemento per allenatore in `players`, più le sue
// squadre (`teams`) e i suoi Pokémon (`pokemon`).
//
// Sono fatti per essere difficili: una stagione tipica ha 14 showdown da 3 match, circa 105 set a testa. Il primo livello si
// prende dopo una stagione o più di impegno, l'oro in anni. Le soglie sono nel CATALOGO: se la stagione tipica cambia si cambiano solo lì.
//
// Meccanismo e stili sono quelli dei badge dei team (BadgeTeam.costruisci, badge-team.css). Funzione pura: funziona nel browser
// (window.BadgeAllenatore) e in Node (test/badge-allenatore.test.js).
//
// Immagini: tutte in docs/immagini/badge-allenatore-<id>-<bronze|silver|gold>.png (anche il campione). Le serie (cleanstreak, winstreak,
// sdstreak) e il fondatore, che stanno in titoli.js, hanno lo stesso prefisso. Finché un file non c'è compare una medaglia disegnata
// dal CSS. IMMAGINI elenca i file del catalogo; `node tools/elenco-immagini.cjs` dice quali mancano.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./badge-team.js'), null);
    else radice.BadgeAllenatore = fabbrica(radice.BadgeTeam, radice);
})(typeof self !== 'undefined' ? self : this, function (BadgeTeam, finestra) {
    'use strict';

    const { tre } = BadgeTeam;

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    // Formati in cui si è davvero forti: abbastanza match (MIN_MATCH_FORMATO) e almeno questa % di vittorie
    const MIN_MATCH_FORMATO = 8;
    const PERC_FORMATO = 60;
    const formatiForti = g => Object.values((g && g.formati) || {}).filter(f => num(f.n) >= MIN_MATCH_FORMATO && (num(f.vinti) / num(f.n)) * 100 >= PERC_FORMATO).length;

    // -----------------------------------------------------
    // Catalogo. Il "contesto" di un allenatore: { g: players[i], specie: n. specie portate in campo, team: n. team giocati }
    // -----------------------------------------------------
    const CATALOGO = [
        { id: 'champion', nome: 'League Champion', icona: '👑', unita: 'seasons won', soglie: [2, 3, 5],
          descrizione: 'Seasons of the league won.',
          valore: c => num(c.g.stagioniVinte), immagini: tre('badge-allenatore-champion-{l}.png') },
        { id: 'veteran', nome: 'Veteran', icona: '🎖️', unita: 'seasons played', soglie: [3, 6, 10],
          descrizione: 'Seasons of the league played.',
          valore: c => num(c.g.stagioniGiocate), immagini: tre('badge-allenatore-veteran-{l}.png') },
        { id: 'matchwinner', nome: 'Match Winner', icona: '🏆', unita: 'matches won', soglie: [25, 75, 160],
          descrizione: 'Matches won, in every format.',
          valore: c => num(c.g.match && c.g.match.vinti), immagini: tre('badge-allenatore-matchwinner-{l}.png') },
        { id: 'setcrusher', nome: 'Set Crusher', icona: '⚔️', unita: 'sets won', soglie: [70, 200, 420],
          descrizione: 'Sets won, in every format.',
          valore: c => num(c.g.set && c.g.set.vinti), immagini: tre('badge-allenatore-setcrusher-{l}.png') },
        { id: 'showdown', nome: 'Showdown Victor', icona: '🎯', unita: 'showdowns won', soglie: [8, 24, 50],
          descrizione: 'Showdowns won.',
          valore: c => num(c.g.showdown && c.g.showdown.vinti), immagini: tre('badge-allenatore-showdown-{l}.png') },
        { id: 'dominant', nome: 'Dominant', icona: '📈', unita: '% of matches won', soglie: [60, 70, 80], etichetta: 'Win rate', suffisso: '%',
          descrizione: 'Share of matches won, once you have played enough of them.',
          valore: c => num(c.g.percMatch), minimo: { campo: c => num(c.g.match && c.g.match.giocati), valore: 30, etichetta: 'matches played' },
          immagini: tre('badge-allenatore-dominant-{l}.png') },
        { id: 'knockout', nome: 'KO Artist', icona: '💥', unita: 'KOs', soglie: [300, 900, 2000],
          descrizione: 'Opposing Pokémon knocked out.',
          valore: c => num(c.g.ko && c.g.ko.fatti), immagini: tre('badge-allenatore-knockout-{l}.png') },
        { id: 'untouchable', nome: 'Untouchable', icona: '🛡️', unita: 'flawless sets', soglie: [5, 15, 35],
          descrizione: 'Sets won without losing a single Pokémon.',
          valore: c => num(c.g.ko && c.g.ko.setPerfetti), immagini: tre('badge-allenatore-untouchable-{l}.png') },
        { id: 'closecall', nome: 'Against All Odds', icona: '💪', unita: 'sets won on the last Pokémon', soglie: [4, 10, 20],
          descrizione: 'Sets won with only one Pokémon left standing.',
          valore: c => num(c.g.ko && c.g.ko.setAlLimite), immagini: tre('badge-allenatore-closecall-{l}.png') },
        { id: 'formatmaster', nome: 'Format Master', icona: '🧭', unita: 'formats mastered', soglie: [1, 2, 4],
          descrizione: `Formats where you won at least ${PERC_FORMATO}% of your matches, with at least ${MIN_MATCH_FORMATO} played.`,
          valore: c => formatiForti(c.g), immagini: tre('badge-allenatore-formatmaster-{l}.png') },
        { id: 'elopeak', nome: 'Elo Peak', icona: '📊', unita: 'peak Elo', soglie: [1100, 1250, 1400], partenza: 1000,
          descrizione: 'The highest Elo you have ever reached (everyone starts at 1000).',
          valore: c => num(c.g.eloPicco), immagini: tre('badge-allenatore-elopeak-{l}.png') },
        { id: 'collector', nome: 'Collector', icona: '🔎', unita: 'different Pokémon used', soglie: [30, 65, 100],
          descrizione: 'Different Pokémon species you have brought into battle.',
          valore: c => num(c.specie), immagini: tre('badge-allenatore-collector-{l}.png') }
    ];

    const base = BadgeTeam.costruisci(CATALOGO, { titolo: 'TRAINER BADGES' });
    const { IMMAGINI, guadagnati, perVicinanza, scheda, htmlBadge, htmlScaffale, htmlMini } = base;

    // L'allenatore tra quelli di Statistiche.calcola(...), con i conteggi che servono ai badge
    function contestoDi(risultato, idAllenatore) {
        const id = idDi(idAllenatore);
        const g = ((risultato && risultato.players) || []).find(p => idDi(p.id) === id);
        if (!g) return null;
        const suoi = ((risultato && risultato.pokemon) || []).filter(m => idDi(m.player) === id && num(m.portato) > 0);
        return { g, specie: new Set(suoi.map(m => m.specieId)).size };
    }

    /** I badge di un allenatore (tutti quelli del catalogo, anche non presi). `risultato` = Statistiche.calcola(dati, { stagione: 'all' }) */
    const calcola = (risultato, idAllenatore) => base.calcola(contestoDi(risultato, idAllenatore) || { g: {}, specie: 0 });

    // La scheda di un badge per il profilo (Achievements) è quella generica di badge-team.js (costruisci): immagine, spiegazione, i tre livelli,
    // i numeri, la barra e cosa manca. Si usa `scheda(b)`; la pagina la disegna nel suo stile.
    //   etichetta / suffisso / partenza (opzionali nel catalogo): nome della barra, "%" dopo i numeri, da dove parte la barra (l'Elo da 1000)

    // -----------------------------------------------------
    // Colla per le pagine: i badge di un allenatore con i numeri di tutto il sito (Fiocchi.carica(db): una sola lettura per pagina)
    // -----------------------------------------------------
    async function carica(db, idAllenatore) {
        try {
            const risultato = await finestra.Fiocchi.carica(db);
            const c = contestoDi(risultato, idAllenatore);
            // le stagioni vinte come le contano i badge (dalla classifica di ogni stagione chiusa): le pagine mostrano questo numero, non un contatore a parte
            const nomi = Object.fromEntries(((risultato && risultato.stagioni) || []).map(x => [x.id, x.nome]));
            const vinte = c ? (c.g.stagioniVinteId || []).map(id => ({ id, nome: nomi[id] || id })) : [];
            return { lista: calcola(risultato, idAllenatore), dati: !!c, stagioniVinte: vinte.length, elencoStagioniVinte: vinte, risultato };
        } catch (e) {
            return { lista: calcola(null, idAllenatore), dati: false, errore: true, stagioniVinte: null, elencoStagioniVinte: [], risultato: null };
        }
    }

    return {
        CATALOGO, IMMAGINI, MIN_MATCH_FORMATO, PERC_FORMATO,
        calcola, contestoDi, carica, guadagnati, perVicinanza, scheda,
        htmlBadge, htmlScaffale, htmlMini, formatiForti
    };
});
