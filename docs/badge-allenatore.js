// =====================================================
// BADGE DEGLI ALLENATORI — Poké-Tournament
//
// Riconoscimenti di UN allenatore, come i badge dei team (badge-team.js) lo sono di un team e i fiocchi (fiocchi.js) di un Pokémon.
// Si aggiungono ai badge delle serie che c'erano già (Clean Streak, Win Streak, SD Streak e il Fondatore: titoli.js) e, come tutti,
// partono dai numeri reali: Statistiche.calcola(dati, { stagione: 'all' }), un elemento per allenatore in `players`, più le sue
// squadre (`teams`) e i suoi Pokémon (`pokemon`).
//
// Sono fatti per essere difficili. Le stagioni ufficiali sono League (Sant'Alvise), Monoformat e Randomize, anche in contemporanea (le cup non contano);
// una League ha 2-4 formati e da 1 a 5 showdown per formato contro ciascun avversario, quindi 12-60 showdown da 3 match a testa (in media ~29, cioè ~87
// match e ~260 set), una Monoformat o una Randomize circa 8-16. I quattro livelli puntano a un giocatore "forte" (~60% di match vinti): bronzo dopo circa
// due stagioni, argento dopo sei, oro dopo una dozzina, platino dopo più di venti (un giocatore "elite", ~72%, ci arriva in metà tempo). Le soglie vengono da
// `node tools/simula-soglie.cjs` (il modello e le ipotesi sono scritte lì): se la struttura delle stagioni cambia si rifà la simulazione e si cambiano solo i numeri del CATALOGO.
//
// Meccanismo e stili sono quelli dei badge dei team (BadgeTeam.costruisci, badge-team.css). Funzione pura: funziona nel browser
// (window.BadgeAllenatore) e in Node (test/badge-allenatore.test.js).
//
// Immagini: tutte in docs/immagini/badge-allenatore-<id>-<bronze|silver|gold|platinum>.png (anche il campione). Le serie (cleanstreak, winstreak,
// sdstreak) e il fondatore, che stanno in titoli.js, hanno lo stesso prefisso. Finché un file non c'è compare una medaglia disegnata
// dal CSS. IMMAGINI elenca i file del catalogo; `node tools/elenco-immagini.cjs` dice quali mancano.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./badge-team.js'), null);
    else radice.BadgeAllenatore = fabbrica(radice.BadgeTeam, radice);
})(typeof self !== 'undefined' ? self : this, function (BadgeTeam, finestra) {
    'use strict';

    const { perLivelli } = BadgeTeam;

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    // Formati in cui si è davvero forti: abbastanza match (MIN_MATCH_FORMATO) e almeno questa % di vittorie
    const MIN_MATCH_FORMATO = 12;     // con un solo showdown per formato sono 12 match a stagione, e un formato non si ripete per ~3 stagioni: si padroneggia in una stagione intera
    const PERC_FORMATO = 65;
    const formatiForti = g => Object.values((g && g.formati) || {}).filter(f => num(f.n) >= MIN_MATCH_FORMATO && (num(f.vinti) / num(f.n)) * 100 >= PERC_FORMATO).length;

    // -----------------------------------------------------
    // Catalogo. Il "contesto" di un allenatore: { g: players[i], specie: n. specie portate in campo, team: n. team giocati }
    // -----------------------------------------------------
    const CATALOGO = [
        { id: 'champion', nome: 'League Champion', icona: '👑', unita: 'seasons won', soglie: [3, 5, 8, 14],
          descrizione: 'Official seasons won: Sant\'Alvise League, Monoformat and Randomize (cups do not count).',
          valore: c => num(c.g.stagioniVinte), immagini: perLivelli('badge-allenatore-champion-{l}.png') },
        { id: 'veteran', nome: 'Veteran', icona: '🎖️', unita: 'seasons played', soglie: [3, 8, 16, 30],
          descrizione: 'Seasons of the league played.',
          valore: c => num(c.g.stagioniGiocate), immagini: perLivelli('badge-allenatore-veteran-{l}.png') },
        { id: 'matchwinner', nome: 'Match Winner', icona: '🏆', unita: 'matches won', soglie: [70, 210, 450, 900],
          descrizione: 'Matches won, in every format.',
          valore: c => num(c.g.match && c.g.match.vinti), immagini: perLivelli('badge-allenatore-matchwinner-{l}.png') },
        { id: 'setcrusher', nome: 'Set Crusher', icona: '⚔️', unita: 'sets won', soglie: [200, 600, 1300, 2600],
          descrizione: 'Sets won, in every format.',
          valore: c => num(c.g.set && c.g.set.vinti), immagini: perLivelli('badge-allenatore-setcrusher-{l}.png') },
        { id: 'showdown', nome: 'Showdown Victor', icona: '🎯', unita: 'showdowns won', soglie: [25, 75, 160, 320],
          descrizione: 'Showdowns won.',
          valore: c => num(c.g.showdown && c.g.showdown.vinti), immagini: perLivelli('badge-allenatore-showdown-{l}.png') },
        { id: 'dominant', nome: 'Dominant', icona: '📈', unita: '% of matches won', soglie: [60, 64, 68, 73], etichetta: 'Win rate', suffisso: '%',
          descrizione: 'Share of matches won, once you have played enough of them.',
          valore: c => num(c.g.percMatch), minimo: { campo: c => num(c.g.match && c.g.match.giocati), valore: 120, etichetta: 'matches played' },
          immagini: perLivelli('badge-allenatore-dominant-{l}.png') },
        { id: 'knockout', nome: 'KO Artist', icona: '💥', unita: 'KOs', soglie: [1000, 3000, 6500, 13000],
          descrizione: 'Opposing Pokémon knocked out.',
          valore: c => num(c.g.ko && c.g.ko.fatti), immagini: perLivelli('badge-allenatore-knockout-{l}.png') },
        { id: 'untouchable', nome: 'Untouchable', icona: '🛡️', unita: 'flawless sets', soglie: [20, 60, 130, 260],
          descrizione: 'Sets won without losing a single Pokémon.',
          valore: c => num(c.g.ko && c.g.ko.setPerfetti), immagini: perLivelli('badge-allenatore-untouchable-{l}.png') },
        { id: 'closecall', nome: 'Against All Odds', icona: '💪', unita: 'sets won on the last Pokémon', soglie: [50, 140, 300, 600],
          descrizione: 'Sets won with only one Pokémon left standing.',
          valore: c => num(c.g.ko && c.g.ko.setAlLimite), immagini: perLivelli('badge-allenatore-closecall-{l}.png') },
        { id: 'formatmaster', nome: 'Format Master', icona: '🧭', unita: 'formats mastered', soglie: [3, 5, 8, 12],
          descrizione: `Formats where you won at least ${PERC_FORMATO}% of your matches, with at least ${MIN_MATCH_FORMATO} played.`,
          valore: c => formatiForti(c.g), immagini: perLivelli('badge-allenatore-formatmaster-{l}.png') },
        { id: 'elopeak', nome: 'Elo Peak', icona: '📊', unita: 'peak Elo', soglie: [1120, 1170, 1225, 1260], partenza: 1000,
          descrizione: 'The highest Elo you have ever reached.',
          valore: c => num(c.g.eloPicco), immagini: perLivelli('badge-allenatore-elopeak-{l}.png') },
        { id: 'collector', nome: 'Collector', icona: '🔎', unita: 'different Pokémon used', soglie: [80, 160, 280, 450],
          descrizione: 'Different Pokémon species you have brought into battle.',
          valore: c => num(c.specie), immagini: perLivelli('badge-allenatore-collector-{l}.png') }
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

    // La scheda di un badge per il profilo (Achievements) è quella generica di badge-team.js (costruisci): immagine, spiegazione, i quattro livelli,
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
