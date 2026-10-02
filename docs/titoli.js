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
// SOGLIE. Si ragiona su una stagione tipica: 8 giocatori, 2 formati, 1 showdown per formato contro
// ciascun avversario = 14 showdown da 3 match, al meglio dei 3 set (~2,5 set a match) = circa 105 set
// a testa. In doppio ne scendono in campo 3 a set: ~315 presenze di Pokémon, e con 1,6 tipi a Pokémon ~500
// presenze di tipo, cioè ~28 per tipo se fossero ripartite in parti uguali (45 per i tipi più usati).
//   - chi gioca ogni set con un Pokémon di quel tipo (o della stessa specie): ~80-100 presenze, ~40 set vinti,
//     ~50 KO a stagione;
//   - un monotipo: ~300 presenze a stagione, ma sempre ~50 vittorie (si vince un set una volta sola).
//   TIPI      base              30 presenze                    (un terzo di stagione con il tipo in squadra)
//             Gym Leader      120 presenze + 40 vittorie       (una stagione di impegno)
//             Elite Four      400 presenze + 140 vittorie + 180 KO
//                              (circa 3 stagioni e mezza con un Pokémon fisso di quel tipo; un monotipo
//                               ci mette comunque quasi 3 stagioni per le vittorie: a una stagione sola
//                               non ci arriva nessuno)
//   POKÉMON   Fan               25 presenze
//             Specialist        80 presenze + 30 vittorie       (un Pokémon fisso per una stagione)
//             Master           200 presenze + 80 vittorie + 100 KO   (due stagioni e mezza)
// Se la stagione tipica cambia, si cambia solo qui.
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
        { chip: t => TIPI[t].base, nome: t => TIPI[t].base,                  played: 30,  won: 0,   ko: 0 },
        { chip: () => 'Gym Leader', nome: t => `${maiuscola(t)} Gym Leader`, played: 120, won: 40,  ko: 0 },
        { chip: () => 'Elite Four', nome: t => `${maiuscola(t)} Elite Four`, played: 400, won: 140, ko: 180 }
    ];
    const LIVELLI_POKEMON = [
        { chip: () => 'Fan',        nome: s => `${s} Fan`,        played: 25,  won: 0,  ko: 0 },
        { chip: () => 'Specialist', nome: s => `${s} Specialist`, played: 80,  won: 30, ko: 0 },
        { chip: () => 'Master',     nome: s => `${s} Master`,     played: 200, won: 80, ko: 100 }
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
    // Badge delle serie (clean streak, win streak, SD streak)
    // -----------------------------------------------------
    const LIVELLI_BADGE = ['bronze', 'silver', 'gold'];
    const BADGE = [
        { id: 'clean', label: 'Clean Streak', descrizione: n => `${n} matches undefeated`,   unita: 'undefeated matches', maxKey: 'maxcleanstrike', curKey: 'cleanstrike', dateKeys: ['maxcleanstrikedate'], steps: [3, 5, 7] },
        { id: 'won',   label: 'Win Streak',   descrizione: n => `${n} matches in a row`,     unita: 'match wins',         maxKey: 'maxwonstrike',   curKey: 'wonstrike',   dateKeys: ['maxwonstrikedate'],   steps: [5, 7, 10] },
        { id: 'sd',    label: 'SD Streak',    descrizione: n => `${n} showdowns in a row`,   unita: 'showdown wins',      maxKey: 'maxsdstrike',    curKey: 'sdstrike',    dateKeys: ['maxsdstrikedate', 'sdwonstrikedate'], steps: [3, 5, 7] }
    ];
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
     * -> [{ id, label, livello: 'bronze'|'silver'|'gold'|'founder', img, descrizione, data, attuale, obiettivo, pct }]
     */
    function badgeSbloccati(stats, idPlayer) {
        const s = stats || {};
        const out = [];
        if (FONDATORI.includes(String(idPlayer || '').trim().toLowerCase())) {
            out.push({ id: 'founder', label: 'League Founder', livello: 'founder', img: 'immagini/badge_founder.png', descrizione: 'Hail to the kings', data: '', attuale: 0, obiettivo: 0, pct: 100 });
        }
        for (const b of BADGE) {
            const max = parseInt(s[b.maxKey], 10) || 0;
            const attuale = parseInt(s[b.curKey], 10) || 0;
            const i = b.steps.filter(n => max >= n).length - 1;
            if (i < 0) continue;
            const obiettivo = b.steps[Math.min(i + 1, b.steps.length - 1)];
            out.push({
                id: b.id, label: b.label, livello: LIVELLI_BADGE[i],
                img: `immagini/badge_${b.id}_${LIVELLI_BADGE[i]}.png`,
                descrizione: b.descrizione(b.steps[i]),
                data: formattaData(b.dateKeys.map(k => s[k]).find(Boolean)),
                attuale, obiettivo, pct: Math.min(100, obiettivo ? (attuale / obiettivo) * 100 : 100)
            });
        }
        return out;
    }

    return {
        TIPI, LIVELLI_TIPO, LIVELLI_POKEMON, MAX_POKEMON_ACHIEVEMENTS,
        livello, progresso, titoliSbloccati, descriviTitolo, pokemonPiuVicini, normalizzaTipi,
        LIVELLI_BADGE, BADGE, badgeSbloccati, formattaData, maiuscola, idDi
    };
});
