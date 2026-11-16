// =====================================================
// LETTURE LEGGERE DEL DATABASE — Poké-Tournament
//
// Il database si paga a quanto si scarica. Due nodi pesano molto: `players` (team, badge, statistiche di tutti: ~210 KB con 7 giocatori) e `seasons` (ogni stagione ha tutti
// i showdown con le statistiche di ogni set: ~680 KB a stagione). Molte pagine ne scaricavano uno intero per leggere due righe: i colori dei giocatori (7 KB su 210) o
// lo stato e i team iscritti di una stagione (50 KB su 680).
//
// Qui ci sono le letture che prendono solo quello che serve:
//   - chiaviDi(db, percorso)       le chiavi figlie di un nodo, senza scaricarne il contenuto (REST con ?shallow=true); null se non si può (si ripiega sulla lettura intera)
//   - coloriGiocatori(db)          { idInMinuscolo: colore }: legge solo players/{id}/info/color di ognuno; il risultato si ricorda per 5 minuti nella scheda del browser
//                                  (cambiando pagina non si rilegge); un colore appena cambiato compare nelle altre pagine entro 5 minuti
//   - stagioniLeggere(db)          { idStagione: { info, teams_iscritti } }: quanto basta a team-bloccati.js (chi è bloccato, chi è iscritto a stagioni aperte)
//
// LE STATISTICHE DEI SET (setStats) stanno in un nodo a parte: setStats/{stagione}/{showdown}/{match} = { set1: {...}, set2: {...} } (prima erano dentro ogni match di
// seasons/…/matches/{match}/setStats e pesavano l'84% di una stagione). Le pagine che le usano (Stats, badge, Match of the week, riepilogo...) le rimettono al loro posto:
//   - unisciSetStats(seasons, nodo)       pura: le stagioni nella forma di sempre (ogni match con il suo setStats); il nodo nuovo vale più di quello dentro al match
//   - unisciSetStatsShowdowns(showdowns, perStagione)   lo stesso per i soli showdown di una stagione
//   - stagioniConStats(db)                seasons + setStats uniti: la lettura di prima, per chi ha bisogno di tutto
//   - setStatsStagione(db, id)            solo le statistiche dei set di una stagione
// Chi non ha bisogno delle statistiche (Hub, Matches, Box...) legge seasons senza e scarica un quinto.
// Se qualcosa non va (rete, regole) si ripiega sulla lettura intera di una volta: il risultato è lo stesso, solo più pesante.
//
// Funziona nel browser (window.DbLeggero) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.DbLeggero = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CHIAVE_COLORI = 'colori-giocatori-v1';
    const DURATA_COLORI = 5 * 60 * 1000;

    const urlBase = (db, radice) => {
        try {
            if (db && db.app && db.app.options && db.app.options.databaseURL) return String(db.app.options.databaseURL).replace(/\/+$/, '');
            if (radice && radice.firebase && radice.firebase.app) return String(radice.firebase.app().options.databaseURL || '').replace(/\/+$/, '');
        } catch (e) { /* senza indirizzo si ripiega */ }
        return '';
    };

    /** Le chiavi figlie di `percorso` senza scaricare i dati (REST shallow); null se non è possibile */
    async function chiaviDi(db, percorso, { fetch: f, radice = (typeof self !== 'undefined' ? self : undefined) } = {}) {
        const base = urlBase(db, radice);
        const prendi = f || (radice && radice.fetch ? radice.fetch.bind(radice) : null);
        if (!base || !prendi) return null;
        try {
            const r = await prendi(`${base}/${percorso}.json?shallow=true`);
            if (!r || !r.ok) return null;
            const j = await r.json();
            return j && typeof j === 'object' ? Object.keys(j) : null;
        } catch (e) { return null; }
    }

    const leggi = async (db, percorso) => (await db.ref(percorso).once('value')).val();

    function memoria(radice) {
        try { return radice && radice.sessionStorage ? radice.sessionStorage : null; } catch (e) { return null; }
    }

    /** { idInMinuscolo: colore } di tutti i giocatori, leggendo solo il colore di ognuno */
    async function coloriGiocatori(db, { fetch: f, radice = (typeof self !== 'undefined' ? self : undefined), adesso = () => Date.now() } = {}) {
        const mem = memoria(radice);
        try {
            const salvato = mem && JSON.parse(mem.getItem(CHIAVE_COLORI) || 'null');
            if (salvato && salvato.v && adesso() - salvato.t < DURATA_COLORI) return salvato.v;
        } catch (e) { /* memoria illeggibile: si rilegge */ }

        const fuori = {};
        const chiavi = await chiaviDi(db, 'players', { fetch: f, radice });
        if (chiavi) {
            await Promise.all(chiavi.map(async k => {
                try { const c = await leggi(db, `players/${k}/info/color`); if (c) fuori[k.toLowerCase()] = c; } catch (e) { /* uno solo che manca non ferma gli altri */ }
            }));
        } else {
            const tutti = (await leggi(db, 'players')) || {};
            for (const [k, g] of Object.entries(tutti)) { const c = g && g.info && g.info.color; if (c) fuori[k.toLowerCase()] = c; }
        }
        try { if (mem) mem.setItem(CHIAVE_COLORI, JSON.stringify({ t: adesso(), v: fuori })); } catch (e) { /* memoria piena o bloccata: pazienza */ }
        return fuori;
    }

    /** { idStagione: { info, teams_iscritti } }: solo la parte delle stagioni che serve a sapere chi è bloccato e chi è iscritto (senza i showdown, che pesano il 90%) */
    async function stagioniLeggere(db, { fetch: f, radice = (typeof self !== 'undefined' ? self : undefined) } = {}) {
        const chiavi = await chiaviDi(db, 'seasons', { fetch: f, radice });
        if (!chiavi) {
            const tutte = (await leggi(db, 'seasons')) || {};
            const fuori = {};
            for (const [k, s] of Object.entries(tutte)) if (s && typeof s === 'object') fuori[k] = { info: s.info || null, teams_iscritti: s.teams_iscritti || null };
            return fuori;
        }
        const fuori = {};
        await Promise.all(chiavi.map(async k => {
            const [info, teams] = await Promise.all([leggi(db, `seasons/${k}/info`), leggi(db, `seasons/${k}/teams_iscritti`)]);
            fuori[k] = { info: info || null, teams_iscritti: teams || null };
        }));
        return fuori;
    }

    // ---------- le statistiche dei set ----------
    const eOggetto = x => !!x && typeof x === 'object';

    /** Gli showdown di una stagione con le statistiche dei set rimesse nei loro match (senza toccare l'originale). `perStagione`: setStats/{stagione} */
    function unisciSetStatsShowdowns(showdowns, perStagione) {
        if (!eOggetto(showdowns) || !eOggetto(perStagione)) return showdowns;
        const fuori = {};
        for (const [sd, dati] of Object.entries(showdowns)) {
            const perSd = perStagione[sd];
            if (!eOggetto(dati) || !eOggetto(perSd) || !eOggetto(dati.matches)) { fuori[sd] = dati; continue; }
            const matches = {};
            for (const [chiave, m] of Object.entries(dati.matches)) matches[chiave] = eOggetto(m) && eOggetto(perSd[chiave]) ? { ...m, setStats: perSd[chiave] } : m;
            fuori[sd] = { ...dati, matches };
        }
        return fuori;
    }

    /** Le stagioni nella forma di sempre: ogni match col suo setStats. Chi non ha il nodo nuovo (dati non ancora spostati) tiene quello che ha dentro */
    function unisciSetStats(seasons, nodo) {
        if (!eOggetto(seasons) || !eOggetto(nodo)) return seasons;
        const fuori = {};
        for (const [id, stagione] of Object.entries(seasons)) {
            fuori[id] = eOggetto(stagione) && eOggetto(nodo[id]) ? { ...stagione, showdowns: unisciSetStatsShowdowns(stagione.showdowns, nodo[id]) } : stagione;
        }
        return fuori;
    }

    async function setStatsStagione(db, id) { return (await leggi(db, `setStats/${id}`)) || {}; }

    /** seasons + setStats uniti: la stessa cosa che si leggeva prima da `seasons` */
    async function stagioniConStats(db) {
        const [stagioni, nodo] = await Promise.all([leggi(db, 'seasons'), leggi(db, 'setStats').catch(() => null)]);
        return unisciSetStats(stagioni || {}, nodo || {});
    }

    return { chiaviDi, coloriGiocatori, stagioniLeggere, unisciSetStats, unisciSetStatsShowdowns, setStatsStagione, stagioniConStats, CHIAVE_COLORI, DURATA_COLORI };
});
