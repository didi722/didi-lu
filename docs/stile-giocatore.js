// =====================================================
// STILE DEI GIOCATORI — Poké-Tournament
//
// Le scelte di ogni allenatore nei set giocati sul sito, sommate: quante volte ha attaccato, si è parato, ha cambiato, ha usato una mossa di stato.
// Sono gli stessi numeri da cui nasce la sua personalità (personalita.js, statistiche.js), ma salvati già sommati in players/<id>/stile, così la CPU
// può leggerli in un attimo quando gioca contro di lui (cpu-avversario.js) senza scaricare tutte le stagioni.
//
// Da dove si parte: setStats di ogni match (le scrive il server a fine set: functions/statistiche-set.js), lato per lato. Come per le statistiche del
// sito, la stagione beta (sbeta) non conta. I set senza le scelte (i più vecchi) e quelli senza decisioni si saltano.
//
//   StileGiocatore.profili(seasons) -> { [idAllenatore]: nodo }     il nodo da salvare in players/<id>/stile (senza l'orario: lo mette chi scrive)
//     nodo = { v: 1, set, decisioni, azioni: { mosse, cambi, attacco, protezione, recupero, potenziamento, campo, supporto, disturbo, altro },
//              lega: { set, decisioni, azioni: {...} } }              (la lega: la somma di tutti gli allenatori, la stessa in ogni nodo)
//   (il workflow aggiunge al nodo anche `situazioni`: le regole sulle situazioni imparate dai replay, vedi cpu-situazioni.js; sono le stesse in ogni nodo)
//   StileGiocatore.uguali(a, b)     due nodi dicono la stessa cosa? (l'orario di aggiornamento non conta: serve a non riscrivere per niente)
//
// Funziona nel browser (window.StileGiocatore) e in Node (workflow "Stile dei giocatori", .github/workflows/stile-giocatori.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.StileGiocatore = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSIONE = 1;
    const BETA = 'sbeta';
    const AZIONI = ['mosse', 'cambi', 'attacco', 'protezione', 'recupero', 'potenziamento', 'campo', 'supporto', 'disturbo', 'altro'];

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const vuote = () => Object.fromEntries(AZIONI.map(k => [k, 0]));
    const vuoto = () => ({ set: 0, decisioni: 0, azioni: vuote() });

    function aggiungi(somma, azioni) {
        somma.set++;
        somma.decisioni += num(azioni.mosse) + num(azioni.cambi);
        for (const k of AZIONI) somma.azioni[k] += Math.max(0, num(azioni[k]));
    }

    /**
     * I set di cui si può leggere il replay: [{ id, url, giocatori: { p1, p2 } }] (id degli allenatori in minuscolo). `seasons` è il nodo "seasons" di Firebase;
     * come per le statistiche, la stagione beta non conta. Un set senza indirizzo del replay o contro se stesso si salta.
     */
    function setConReplay(seasons, { escludi = [BETA] } = {}) {
        const out = [];
        for (const [sid, stagione] of Object.entries(seasons || {})) {
            if (!stagione || escludi.includes(sid)) continue;
            for (const [dk, showdown] of Object.entries((stagione.showdowns && typeof stagione.showdowns === 'object') ? stagione.showdowns : {})) {
                for (const [mk, match] of Object.entries((showdown && showdown.matches && typeof showdown.matches === 'object') ? showdown.matches : {})) {
                    if (!match || !match.replays || typeof match.replays !== 'object') continue;
                    const p1 = idDi(match.player1Id || match.player1), p2 = idDi(match.player2Id || match.player2);
                    if (!p1 || !p2 || p1 === p2) continue;
                    for (const [sk, r] of Object.entries(match.replays)) {
                        const url = r && typeof r.url === 'string' ? r.url.trim() : '';
                        if (/^https:\/\//.test(url)) out.push({ id: `${sid}/${dk}/${mk}/${sk}`, url, giocatori: { p1, p2 } });
                    }
                }
            }
        }
        return out;
    }

    /**
     * Le somme di ogni allenatore e della lega. `seasons` è il nodo "seasons" di Firebase. Opzione `escludi`: stagioni da saltare (di solito la beta).
     * Restituisce { giocatori: { [id]: { set, decisioni, azioni } }, lega: { set, decisioni, azioni } }; "set" sono i set in cui l'allenatore ha
     * giocato con le scelte registrate (la lega somma tutti, quindi ogni set conta due volte: una per lato).
     */
    function somme(seasons, { escludi = [BETA] } = {}) {
        const giocatori = {};
        const lega = vuoto();
        for (const [sid, stagione] of Object.entries(seasons || {})) {
            if (!stagione || escludi.includes(sid)) continue;
            for (const showdown of valori(stagione.showdowns)) {
                for (const match of valori(showdown && showdown.matches)) {
                    if (!match || !match.setStats || typeof match.setStats !== 'object') continue;
                    const ids = { p1: idDi(match.player1Id || match.player1), p2: idDi(match.player2Id || match.player2) };
                    if (!ids.p1 || !ids.p2 || ids.p1 === ids.p2) continue;
                    for (const set of valori(match.setStats)) {
                        for (const lato of ['p1', 'p2']) {
                            const azioni = set && set[lato] && set[lato].azioni;
                            if (!azioni || !(num(azioni.mosse) + num(azioni.cambi) > 0)) continue;
                            aggiungi(giocatori[ids[lato]] || (giocatori[ids[lato]] = vuoto()), azioni);
                            aggiungi(lega, azioni);
                        }
                    }
                }
            }
        }
        return { giocatori, lega };
    }

    // Una firma corta e stabile di un elenco di indirizzi (e della versione delle regole): se non cambia, i replay sono gli stessi e non c'è niente da reimparare
    function firmaDi(testi) {
        let h = 5381;
        for (const c of [...testi].sort().join('\n')) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
        return (h >>> 0).toString(36);
    }

    /**
     * Le regole sulle situazioni (cpu-situazioni.js) imparate dai replay dei set della lega.
     *   seasons        il nodo "seasons" di Firebase
     *   scarica(url)   -> testo del replay (async); leggiReplay(testo) -> { log } oppure null (replay-sito.js); Situazioni: cpu-situazioni.js
     *   precedente     le regole già salvate: se i replay sono gli stessi non si rifà niente; se molti non si scaricano (rete) si tengono quelle
     * Restituisce { situazioni, riusate, scaricati, falliti }: `situazioni` è il nodo da salvare in players/<id>/stile/situazioni
     * ({ v, firma, set, singoli?, doppi?, validazione }; singoli e doppi ci sono solo se la prova incrociata dice che servono) oppure null.
     */
    async function situazioniDaiReplay(seasons, { scarica, leggiReplay, Situazioni, precedente = null, concorrenza = 6, opzioni = {} } = {}) {
        const lista = setConReplay(seasons);
        if (!lista.length) return { situazioni: null, riusate: false, scaricati: 0, falliti: 0 };
        const firma = firmaDi([`v${Situazioni.VERSIONE}`, ...lista.map(x => x.url)]);
        if (precedente && precedente.firma === firma) return { situazioni: precedente, riusate: true, scaricati: 0, falliti: 0 };
        const set = [];
        let falliti = 0, prossimo = 0;
        const operaio = async () => {
            while (prossimo < lista.length) {
                const s = lista[prossimo++];
                try {
                    const r = leggiReplay(await scarica(s.url));
                    if (r && Array.isArray(r.log) && r.log.length) set.push({ id: s.id, log: r.log, giocatori: s.giocatori }); else falliti++;
                } catch (e) { falliti++; }
            }
        };
        await Promise.all(Array.from({ length: Math.max(1, concorrenza) }, operaio));
        // se la rete ha fatto cilecca per molti replay, le regole nuove si baserebbero su un pezzo di lega: meglio tenere le vecchie
        if (precedente && falliti > lista.length * 0.2) return { situazioni: precedente, riusate: true, scaricati: set.length, falliti };
        set.sort((a, b) => (a.id < b.id ? -1 : 1));
        const { regole, validazione } = Situazioni.costruisci(set, opzioni);
        const nodo = { v: Situazioni.VERSIONE, firma, set: set.length, validazione };
        if (regole.singoli) nodo.singoli = regole.singoli;
        if (regole.doppi) nodo.doppi = regole.doppi;
        return { situazioni: nodo, riusate: false, scaricati: set.length, falliti };
    }

    /** I nodi da salvare, uno per allenatore con almeno un set con le scelte registrate */
    function profili(seasons, opz) {
        const { giocatori, lega } = somme(seasons, opz);
        const out = {};
        for (const [id, g] of Object.entries(giocatori)) out[id] = { v: VERSIONE, set: g.set, decisioni: g.decisioni, azioni: g.azioni, lega };
        return out;
    }

    /** Due nodi dicono la stessa cosa? (senza badare all'orario dell'ultimo aggiornamento) */
    function uguali(a, b) {
        const nudo = n => (n && typeof n === 'object' ? { v: n.v, set: n.set, decisioni: n.decisioni, azioni: n.azioni, lega: n.lega, situazioni: n.situazioni || null } : null);
        return JSON.stringify(ordina(nudo(a))) === JSON.stringify(ordina(nudo(b)));
    }
    // un oggetto con le chiavi in ordine, così il confronto non dipende da come Firebase le restituisce
    function ordina(x) {
        if (Array.isArray(x)) return x.map(ordina);
        if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, ordina(x[k])]));
        return x;
    }

    return { VERSIONE, AZIONI, somme, profili, uguali, setConReplay, firmaDi, situazioniDaiReplay };
});
