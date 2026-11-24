// =====================================================
// STATISTICHE DELLA PALESTRA — Poké-Tournament
//
// Come va la palestra di un allenatore: quanti tentativi ha avuto, quante volte ha tenuto (chi la sfidava ha perso una tappa) e quante volte è stata espugnata (le tre tappe vinte
// di fila), tappa per tappa, con le ultime sfide e chi l'ha espugnata. Un TENTATIVO è una sfida finita: comincia dalla prima tappa e finisce con una sconfitta (la palestra ha
// tenuto) o con la terza tappa vinta (espugnata), quindi tentativi = tenuta + espugnata. Una sfida lasciata a metà non conta finché non finisce.
//
// Dati: players/<id>/palestraStat. Li scrive il server (functions/palestra-sfide.js, Function palestraSfida) e li leggono tutti; il sito li mostra nella pagina della palestra
// (palestra.html, palestra-ui.js). Il simulatore gira nel browser e non si può controllare da qui: il server si fida di quello che il browser riferisce, ma solo se prima ha
// annunciato la tappa e se ci è voluto un tempo ragionevole (MIN_TAPPA_MS). Per le monete conta anche una settimana alla volta (settimanaDi).
//
//   PalestraStat.TAPPE / MIN_TAPPA_MS / MAX_ULTIME
//   PalestraStat.vuota()                     il nodo di una palestra mai sfidata
//   PalestraStat.normalizza(stat)            qualunque cosa ci sia nel database → un nodo ben fatto (numeri interi, tre tappe, liste vere)
//   PalestraStat.registra(stat, evento)      il nodo dopo una tappa giocata: evento = { chi, nome, tappa (0..2), vinta, t } (puro: ritorna un nodo nuovo)
//   PalestraStat.riassunto(stat)             i numeri da mostrare: { vuota, tentativi, tenuta, espugnata, percTenuta, tappe: [{ giocate, vinte, perse, perc }], ultime, espugnatori }
//   PalestraStat.tappeComplete(config)       la configurazione della palestra (info/palestra) ha tre tappe?
//   PalestraStat.settimanaDi(ms)             "2026-W48": la settimana ISO (da lunedì a domenica, in UTC) in cui cade un istante; il premio in monete vale una volta per settimana
//   PalestraStat.prossimaSettimana(ms)       l'istante (ms) in cui comincia la settimana dopo (lunedì alle 00:00 UTC)
//   PalestraStat.tempoFa(t, adesso)          "5 min ago", "3 h ago", "2 days ago"
//
// Niente DOM, niente Firebase. Funziona nel browser (window.PalestraStat) e in Node (require). docs/palestra-stat.js e functions/palestra-stat.js sono lo stesso file.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.PalestraStat = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TAPPE = 3;
    const MIN_TAPPA_MS = 40 * 1000;       // una tappa (un set in doppio, 6 portati e 4 scelti) non finisce prima: chi riferisce un esito prima di così non ha giocato
    const MAX_ULTIME = 8;

    const intero = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
    /** Firebase dà un oggetto con chiavi 0, 1, 2… dove noi scriviamo una lista (e a volte una lista vera): si leggono tutti e due i modi */
    const valori = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.keys(x).sort((a, b) => Number(a) - Number(b)).map(k => x[k]) : []);
    /** Le chiavi di Firebase non ammettono . # $ / [ ] */
    const chiaveSicura = t => String(t == null ? '' : t).toLowerCase().trim().replace(/[.#$/[\]]/g, '_').slice(0, 60);

    const vuota = () => ({ v: 1, tentativi: 0, tenuta: 0, espugnata: 0, tappe: Array.from({ length: TAPPE }, () => ({ giocate: 0, vinte: 0 })), ultime: [], espugnatori: {}, t: 0 });

    function normalizza(stat) {
        const s = stat && typeof stat === 'object' ? stat : {};
        const tappe = valori(s.tappe);
        const espugnatori = {};
        if (s.espugnatori && typeof s.espugnatori === 'object') {
            for (const [id, x] of Object.entries(s.espugnatori)) {
                if (x && typeof x === 'object' && intero(x.q) > 0) espugnatori[chiaveSicura(id)] = { n: String(x.n || id).slice(0, 40), q: intero(x.q), t: intero(x.t) };
            }
        }
        return {
            v: 1,
            tentativi: intero(s.tentativi), tenuta: intero(s.tenuta), espugnata: intero(s.espugnata),
            tappe: Array.from({ length: TAPPE }, (_, i) => ({ giocate: intero(tappe[i] && tappe[i].giocate), vinte: intero(tappe[i] && tappe[i].vinte) })),
            ultime: valori(s.ultime).filter(x => x && typeof x === 'object').slice(0, MAX_ULTIME).map(x => ({
                c: chiaveSicura(x.c), n: String(x.n || x.c || '').slice(0, 40), t: intero(x.t), e: x.e === 'v' ? 'v' : 'p', s: Math.min(TAPPE - 1, intero(x.s))
            })),
            espugnatori,
            t: intero(s.t)
        };
    }

    /** Il nodo dopo una tappa giocata. Una tappa persa chiude la sfida (la palestra ha tenuto), la terza vinta pure (espugnata); le altre vinte la lasciano aperta */
    function registra(stat, evento) {
        const s = normalizza(stat);
        const ev = evento || {};
        const tappa = Math.min(TAPPE - 1, intero(ev.tappa));
        const vinta = !!ev.vinta;
        const t = intero(ev.t);
        const chi = chiaveSicura(ev.chi);
        const nome = String(ev.nome || ev.chi || '').slice(0, 40);
        s.tappe[tappa].giocate++;
        if (vinta) s.tappe[tappa].vinte++;
        if (!vinta || tappa === TAPPE - 1) {
            s.tentativi++;
            if (vinta) {
                s.espugnata++;
                if (chi) s.espugnatori[chi] = { n: nome || chi, q: (s.espugnatori[chi] ? s.espugnatori[chi].q : 0) + 1, t };
            } else {
                s.tenuta++;
            }
            s.ultime.unshift({ c: chi, n: nome || chi, t, e: vinta ? 'v' : 'p', s: tappa });
            s.ultime = s.ultime.slice(0, MAX_ULTIME);
        }
        s.t = t;
        return s;
    }

    const percentuale = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

    function riassunto(stat) {
        const s = normalizza(stat);
        return {
            vuota: s.tentativi === 0 && s.tappe.every(x => x.giocate === 0),
            tentativi: s.tentativi, tenuta: s.tenuta, espugnata: s.espugnata,
            percTenuta: percentuale(s.tenuta, s.tentativi),
            tappe: s.tappe.map(x => ({ giocate: x.giocate, vinte: x.vinte, perse: x.giocate - x.vinte, perc: percentuale(x.vinte, x.giocate) })),
            ultime: s.ultime,
            espugnatori: Object.entries(s.espugnatori).map(([id, x]) => ({ id, nome: x.n, volte: x.q, t: x.t })).sort((a, b) => b.volte - a.volte || b.t - a.t),
            aggiornata: s.t
        };
    }

    /** La configurazione di una palestra (players/<id>/info/palestra) ha le sue tre tappe? (come Palestra.tappeDi: tre voci, anche se Firebase le ha date come oggetto) */
    function tappeComplete(config) {
        return valori(config && config.tappe).filter(t => t && typeof t === 'object').slice(0, TAPPE).length === TAPPE;
    }

    const GIORNO = 86400000;
    /** La settimana ISO di un istante, in UTC: "2026-W48" (la settimana 1 è quella del primo giovedì dell'anno) */
    function settimanaDi(ms) {
        const d = new Date(Number(ms));
        if (!Number.isFinite(d.getTime())) return '';
        const giorno = d.getUTCDay() || 7;                                                  // 1 = lunedì … 7 = domenica
        const giovedi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - giorno));
        const numero = Math.ceil(((giovedi - Date.UTC(giovedi.getUTCFullYear(), 0, 1)) / GIORNO + 1) / 7);
        return `${giovedi.getUTCFullYear()}-W${String(numero).padStart(2, '0')}`;
    }

    /** Quando comincia la settimana dopo: il prossimo lunedì alle 00:00 UTC */
    function prossimaSettimana(ms) {
        const d = new Date(Number(ms));
        if (!Number.isFinite(d.getTime())) return 0;
        const giorno = d.getUTCDay() || 7;
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 8 - giorno);
    }

    function tempoFa(t, adesso) {
        const s = Math.max(0, Math.floor((Number(adesso) - Number(t)) / 1000));
        if (!Number.isFinite(s)) return '';
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)} min ago`;
        if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
        const g = Math.floor(s / 86400);
        if (g < 14) return `${g} day${g === 1 ? '' : 's'} ago`;
        if (g < 60) return `${Math.floor(g / 7)} weeks ago`;
        return `${Math.floor(g / 30)} months ago`;
    }

    return { TAPPE, MIN_TAPPA_MS, MAX_ULTIME, vuota, normalizza, registra, riassunto, tappeComplete, settimanaDi, prossimaSettimana, tempoFa };
});
