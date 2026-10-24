// =====================================================
// TITOLI E BADGE — Poké-Tournament
//
// Un'unica fonte per i titoli del giocatore ("Hex Maniac", "Ghost Gym Leader", "Scizor Fan"...)
// e per i badge delle serie, usata da profile.html (Achievements), public.html
// (titolo sotto il nome) e stats.html (scheda del giocatore). Nessun riferimento al DOM.
//
// Da dove vengono i numeri (li scrive risultati-match.js a ogni match salvato):
//   players/{id}/stats/team-stats/typeusage     = { ghost: { played, won, ko }, ... }
//   players/{id}/stats/team-stats/pokemonusage  = { scizor: { nome: 'Scizor', played, won, ko }, ... }
// Sono dati REALI dei set giocati sul sito: "played" sono le presenze (Pokémon scesi in campo, uno per
// ogni set e per ogni tipo), "won" i set vinti con almeno uno di quel tipo in campo (due Pokémon dello
// stesso tipo sono 2 presenze ma 1 vittoria), "ko" i KO fatti da quei Pokémon.
//
// SOGLIE. Si ragiona sulle stagioni ufficiali (League, Monoformat; le Randomize non danno titoli perché non hanno i team; le cup non contano) e
// sulla simulazione `node tools/simula-soglie.cjs`: una League ha 2-4 formati e da 1 a 5 showdown per formato contro ciascun avversario (in media
// ~29 showdown, ~87 match, ~260 set a testa), ogni set scendono in campo 4 Pokémon (~1000 presenze di Pokémon a stagione). Un team gioca un solo
// formato (4 showdown a stagione per ogni showdown per formato) e torna quando torna il formato. Il primo livello si prende dopo una stagione o due
// giocate bene, il secondo dopo alcune stagioni, l'ultimo dopo molte: il gioco è fatto per durare tante stagioni.
//   TIPI      base            400 presenze + 110 vittorie    (un giocatore che punta su un tipo: 1-2 stagioni; uno casual 1-2 stagioni)
//             Gym Leader      1500 presenze + 400 vittorie   (5 stagioni per chi punta su un tipo, ~10 per un casual)
//             Elite Four      4000 presenze + 1100 vittorie + 2800 KO   (14 stagioni per chi punta su un tipo, ~25 per un casual)
//   POKÉMON   Fan             150 presenze + 85 vittorie     (la specie preferita: 1-2 stagioni)
//             Specialist      450 presenze + 260 vittorie    (4-6 stagioni per chi la usa quasi ovunque, ~12 per un casual)
//             Master          1200 presenze + 680 vittorie + 900 KO   (17 stagioni per chi la usa ovunque; un casual non ci arriva)
//   SERIE     le soglie di Win / Clean / SD Streak (più sotto) vengono dalla stessa simulazione
// Se la struttura delle stagioni cambia, si rifà la simulazione e si cambia solo qui.
//
// Funziona nel browser (window.Titoli) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Titoli = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const maiuscola = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
    const idDi = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');

    // -----------------------------------------------------
    // Tipi: nome del titolo di base (le classi allenatore storiche) e colore
    // -----------------------------------------------------
    const TIPI = {
        bug:      { base: 'Bug Catcher',     colore: '#aabb22' },
        dark:     { base: 'Punk Guy',        colore: '#775544' },
        dragon:   { base: 'Dragon Tamer',    colore: '#7766ee' },
        electric: { base: 'Guitarist',       colore: '#ffcc33' },
        fairy:    { base: 'Fairy Tale Girl', colore: '#ee99ee' },
        fighting: { base: 'Black Belt',      colore: '#bb5544' },
        fire:     { base: 'Kindler',         colore: '#de3a1d' },
        flying:   { base: 'Bird Keeper',     colore: '#8899ff' },
        ghost:    { base: 'Hex Maniac',      colore: '#6666bb' },
        grass:    { base: 'Aroma Lady',      colore: '#77cc55' },
        ground:   { base: 'Ruin Maniac',     colore: '#ddbb55' },
        ice:      { base: 'Skier',           colore: '#66ccff' },
        normal:   { base: 'Rich Boy',        colore: '#aaaa99' },
        poison:   { base: 'Ninja Boy',       colore: '#aa5599' },
        psychic:  { base: 'Psychic',         colore: '#ff5599' },
        rock:     { base: 'Hiker',           colore: '#bbaa66' },
        steel:    { base: 'Working Man',     colore: '#aaaabb' },
        water:    { base: 'Fisherman',       colore: '#3399ff' }
    };

    // Scaglioni: ognuno chiede presenze (played), vittorie (won) e KO (ko); 0 = non richiesto
    const LIVELLI_TIPO = [
        { chip: t => TIPI[t].base, nome: t => TIPI[t].base,                  played: 400, won: 110, ko: 0 },
        { chip: () => 'Gym Leader', nome: t => `${maiuscola(t)} Gym Leader`, played: 1500, won: 400, ko: 0 },
        { chip: () => 'Elite Four', nome: t => `${maiuscola(t)} Elite Four`, played: 4000, won: 1100, ko: 2800 }
    ];
    const LIVELLI_POKEMON = [
        { chip: () => 'Fan',        nome: s => `${s} Fan`,        played: 150,  won: 85,  ko: 0 },
        { chip: () => 'Specialist', nome: s => `${s} Specialist`, played: 450,  won: 260, ko: 0 },
        { chip: () => 'Master',     nome: s => `${s} Master`,     played: 1200, won: 680, ko: 900 }
    ];

    const COMPONENTI = ['played', 'won', 'ko'];
    const numero = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const uso = st => ({ played: numero(st && st.played), won: numero(st && st.won), ko: numero(st && st.ko) });

    // Quanti scaglioni sono sbloccati (le soglie crescono: basta contarli)
    function livello(livelli, stat) {
        const u = uso(stat);
        return livelli.filter(l => COMPONENTI.every(c => u[c] >= l[c])).length;
    }

    /**
     * Dove si è arrivati e cosa manca al prossimo scaglione.
     * -> { livello, prossimo (scaglione o null), uso, mancano: {played, won, ko}, barre: [{ c, valore, obiettivo, pct }], pct }
     * pct = avanzamento verso il prossimo scaglione (media delle voci richieste), 1 se è l'ultimo.
     */
    function progresso(livelli, stat) {
        const u = uso(stat);
        const n = livello(livelli, stat);
        const prossimo = livelli[n] || null;
        if (!prossimo) return { livello: n, prossimo: null, uso: u, mancano: { played: 0, won: 0, ko: 0 }, barre: [], pct: 1 };
        const barre = COMPONENTI.filter(c => prossimo[c] > 0)
            .map(c => ({ c, valore: u[c], obiettivo: prossimo[c], pct: Math.min(1, u[c] / prossimo[c]) }));
        const mancano = Object.fromEntries(COMPONENTI.map(c => [c, Math.max(0, prossimo[c] - u[c])]));
        return { livello: n, prossimo, uso: u, mancano, barre, pct: barre.reduce((s, b) => s + b.pct, 0) / barre.length };
    }

    // Chiavi dell'uso in minuscolo ("Ghost" -> "ghost")
    function normalizzaTipi(typeUsage) {
        const out = {};
        for (const [k, v] of Object.entries(typeUsage || {})) out[String(k).toLowerCase().trim()] = v || {};
        return out;
    }

    // -----------------------------------------------------
    // Titoli sbloccati (menu del profilo)
    // -----------------------------------------------------
    /** -> [{ testo, categoria: 'tipo' | 'pokemon', chiave, livello (0..2) }] */
    function titoliSbloccati(typeUsage, pokemonUsage) {
        const elenco = [];
        const tipi = normalizzaTipi(typeUsage);
        for (const tipo of Object.keys(TIPI)) {
            const n = livello(LIVELLI_TIPO, tipi[tipo]);
            for (let i = 0; i < n; i++) elenco.push({ testo: LIVELLI_TIPO[i].nome(tipo), categoria: 'tipo', chiave: tipo, livello: i });
        }
        for (const [id, dati] of Object.entries(pokemonUsage || {})) {
            if (!dati || !dati.nome) continue;
            const n = livello(LIVELLI_POKEMON, dati);
            for (let i = 0; i < n; i++) elenco.push({ testo: LIVELLI_POKEMON[i].nome(dati.nome), categoria: 'pokemon', chiave: id, livello: i });
        }
        return elenco;
    }

    // -----------------------------------------------------
    // Un titolo già scelto: di che cosa è, a che punto è il giocatore
    // -----------------------------------------------------
    /**
     * @param {string} testo           il titolo equipaggiato, es. "Ghost Gym Leader" o "Scizor Fan"
     * @returns {null | { categoria, chiave, nome, tipo, livelloIndice, livelli, progresso }}
     *          chiave = tipo ("ghost") o id della specie ("scizor"); nome = "Ghost" o "Scizor";
     *          progresso = progresso() sull'uso di quel tipo / quella specie
     */
    function descriviTitolo(testo, typeUsage, pokemonUsage) {
        const t = String(testo || '').trim();
        if (!t || t === 'No Title') return null;

        const tipi = normalizzaTipi(typeUsage);
        for (const tipo of Object.keys(TIPI)) {
            const i = LIVELLI_TIPO.findIndex(l => l.nome(tipo).toLowerCase() === t.toLowerCase());
            if (i >= 0) {
                return { categoria: 'tipo', chiave: tipo, nome: maiuscola(tipo), tipo, livelloIndice: i, livelli: LIVELLI_TIPO, progresso: progresso(LIVELLI_TIPO, tipi[tipo]) };
            }
        }
        for (const [id, dati] of Object.entries(pokemonUsage || {})) {
            if (!dati || !dati.nome) continue;
            const i = LIVELLI_POKEMON.findIndex(l => l.nome(dati.nome).toLowerCase() === t.toLowerCase());
            if (i >= 0) {
                return { categoria: 'pokemon', chiave: id, nome: dati.nome, tipo: null, livelloIndice: i, livelli: LIVELLI_POKEMON, progresso: progresso(LIVELLI_POKEMON, dati) };
            }
        }
        // titolo di un tipo senza dati (o un titolo vecchio): si riconosce almeno dal nome
        const primo = t.split(' ')[0].toLowerCase();
        if (TIPI[primo]) return { categoria: 'tipo', chiave: primo, nome: maiuscola(primo), tipo: primo, livelloIndice: -1, livelli: LIVELLI_TIPO, progresso: progresso(LIVELLI_TIPO, tipi[primo]) };
        const daBase = Object.keys(TIPI).find(tp => TIPI[tp].base.toLowerCase() === t.toLowerCase());
        if (daBase) return { categoria: 'tipo', chiave: daBase, nome: maiuscola(daBase), tipo: daBase, livelloIndice: 0, livelli: LIVELLI_TIPO, progresso: progresso(LIVELLI_TIPO, tipi[daBase]) };
        return null;
    }

    // -----------------------------------------------------
    // Colonna "Pokémon" degli Achievements: non tutte le specie, solo le più avanti verso le soglie
    // -----------------------------------------------------
    const MAX_POKEMON_ACHIEVEMENTS = 8;

    /** -> [{ id, nome, uso, progresso }] ordinate per scaglioni sbloccati e poi per avanzamento verso il prossimo */
    function pokemonPiuVicini(pokemonUsage, max = MAX_POKEMON_ACHIEVEMENTS) {
        return Object.entries(pokemonUsage || {})
            .filter(([, d]) => d && d.nome && numero(d.played) > 0)
            .map(([id, d]) => ({ id, nome: d.nome, uso: uso(d), progresso: progresso(LIVELLI_POKEMON, d) }))
            .sort((a, b) => (b.progresso.livello - a.progresso.livello) || (b.progresso.pct - a.progresso.pct) || (b.uso.played - a.uso.played) || a.nome.localeCompare(b.nome))
            .slice(0, max);
    }

    // -----------------------------------------------------
    // Badge delle serie (clean streak, win streak, SD streak): l'unico posto dove stanno nomi, chiavi e soglie. Profilo, Trainers, pagina
    // pubblica e Stats li leggono da qui (BADGE, statoSerie).
    //   - `file`: la parte del nome della PNG, docs/immagini/badge-allenatore-<file>-<bronze|silver|gold|platinum>.png;
    //   - maxKeys / curKeys / dateKeys: i campi di players/<id>/stats/badges che il server scrive (functions/risultati-match.js), nell'ordine in cui si
    //     cercano. Lo showdown ha DUE nomi: il server scrive maxshowdownstrike e compagni, la prima versione della pagina leggeva maxsdstrike:
    //     per questo il badge SD Streak restava a zero per tutti. Ora si leggono entrambi;
    //   - steps: i match (o gli showdown) di fila per bronzo, argento, oro, platino. Vengono da `node tools/simula-soglie.cjs` (League, Monoformat e
    //     Randomize, anche in contemporanea: le serie attraversano le stagioni): un giocatore "forte" (~60% di match vinti) prende il bronzo in
    //     una o due stagioni, l'argento dopo molte, l'oro solo dopo anni; il platino lo prende solo un giocatore dominante (~72%) dopo una ventina di
    //     stagioni. Win Streak 10 / 14 / 18 / 24, Clean Streak 4 / 5 / 6 / 7, SD Streak 8 / 12 / 16 / 24.
    //     Prima (tre livelli) erano 10 / 16 / 24, 5 / 7 / 9 e 8 / 14 / 22, tarati su una League da 12 showdown a testa.
    // -----------------------------------------------------
    const LIVELLI_BADGE = ['bronze', 'silver', 'gold', 'platinum'];
    const IMMAGINE_FONDATORE = 'immagini/badge-allenatore-founder.png';
    const immagineSerie = (b, livello) => `immagini/badge-allenatore-${b.file}-${livello}.png`;
    const BADGE = [
        { id: 'clean', file: 'cleanstreak', label: 'Clean Streak', icona: '✨', unita: 'clean wins', steps: [4, 5, 6, 7],
          testo: 'Win matches without dropping a single set, back to back.',
          descrizione: n => `${n} matches won without losing a set, in a row`,
          maxKeys: ['maxcleanstrike'], curKeys: ['cleanstrike'], dateKeys: ['maxcleanstrikedate'] },
        { id: 'won', file: 'winstreak', label: 'Win Streak', icona: '🔥', unita: 'match wins', steps: [10, 14, 18, 24],
          testo: 'Win matches back to back.',
          descrizione: n => `${n} matches won in a row`,
          maxKeys: ['maxwonstrike'], curKeys: ['wonstrike'], dateKeys: ['maxwonstrikedate'] },
        { id: 'sd', file: 'sdstreak', label: 'SD Streak', icona: '🎯', unita: 'showdown wins', steps: [8, 12, 16, 24],
          testo: 'Win showdowns back to back.',
          descrizione: n => `${n} showdowns won in a row`,
          maxKeys: ['maxshowdownstrike', 'maxsdstrike'], curKeys: ['showdownstrike', 'sdstrike'],
          dateKeys: ['maxshowdownstrikedate', 'maxsdstrikedate', 'sdwonstrikedate'] }
    ];
    const interoDi = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

    /**
     * Lo stato di una serie dai numeri salvati del giocatore (`players/<id>/stats/badges`).
     * @returns {{ record, attuale, data, livello (0-4), completo, obiettivo (il prossimo traguardo, o l'ultimo se completo), progresso (0-1:
     *             la serie in corso verso il prossimo traguardo, la barra che si vede; 1 se completo) }}
     */
    function statoSerie(stats, b) {
        const s = stats || {};
        const record = Math.max(0, ...b.maxKeys.map(k => interoDi(s[k])).filter(n => n !== null));
        const corrente = b.curKeys.map(k => interoDi(s[k])).find(n => n !== null);
        const attuale = corrente == null ? 0 : corrente;
        const livello = b.steps.filter(n => record >= n).length;
        const completo = livello === b.steps.length;
        const obiettivo = b.steps[Math.min(livello, b.steps.length - 1)];
        return {
            record, attuale, data: formattaData(b.dateKeys.map(k => s[k]).find(Boolean)),
            livello, completo, obiettivo, progresso: completo ? 1 : Math.max(0, Math.min(1, attuale / obiettivo))
        };
    }
    // Tutte le PNG delle serie e del fondatore (con la cartella): le usa tools/elenco-immagini.cjs
    const IMMAGINI = [IMMAGINE_FONDATORE].concat(BADGE.flatMap(b => LIVELLI_BADGE.map(l => immagineSerie(b, l))));
    const FONDATORI = ['didi', 'lukiani'];

    function formattaData(raw) {
        if (!raw || raw === '--/--/--' || raw === 'Data N.D.') return '';
        const d = new Date(raw);
        if (isNaN(d.getTime())) return String(raw);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    /**
     * I badge che il giocatore ha già, come li mostra la pagina pubblica.
     * @param {object} stats       players/{id}/stats/badges
     * @param {string} idPlayer    per il badge dei fondatori
     * -> [{ id, label, livello: 'bronze'|'silver'|'gold'|'platinum'|'founder', img, descrizione, data, attuale, obiettivo, pct }]
     */
    function badgeSbloccati(stats, idPlayer) {
        const out = [];
        if (FONDATORI.includes(String(idPlayer || '').trim().toLowerCase())) {
            out.push({ id: 'founder', label: 'League Founder', livello: 'founder', img: IMMAGINE_FONDATORE, descrizione: 'Hail to the kings', data: '', attuale: 0, obiettivo: 0, pct: 100 });
        }
        for (const b of BADGE) {
            const st = statoSerie(stats, b);
            if (!st.livello) continue;
            out.push({
                id: b.id, label: b.label, livello: LIVELLI_BADGE[st.livello - 1],
                img: immagineSerie(b, LIVELLI_BADGE[st.livello - 1]),
                descrizione: b.descrizione(b.steps[st.livello - 1]),
                data: st.data,
                attuale: st.attuale, obiettivo: st.obiettivo, pct: Math.min(100, st.obiettivo ? (st.attuale / st.obiettivo) * 100 : 100)
            });
        }
        return out;
    }

    return {
        TIPI, LIVELLI_TIPO, LIVELLI_POKEMON, MAX_POKEMON_ACHIEVEMENTS,
        livello, progresso, titoliSbloccati, descriviTitolo, pokemonPiuVicini, normalizzaTipi,
        LIVELLI_BADGE, BADGE, IMMAGINE_FONDATORE, IMMAGINI, immagineSerie, statoSerie, badgeSbloccati, formattaData, maiuscola, idDi
    };
});
