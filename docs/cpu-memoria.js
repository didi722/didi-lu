// =====================================================
// LA MEMORIA DELLA CPU SU CHI HA DAVANTI — Poké-Tournament
//
// Quando provi un team contro la CPU e rigiochi (rivincita o "Another random CPU team"), la CPU si ricorda come hai giocato con quel team: i set
// dei tuoi Pokémon (mosse, abilità, strumento), cosa fanno di solito (e cosa fanno al primo turno in campo), chi porti e chi metti in apertura,
// quanto ti pari, cambi o usi mosse di stato. Partita dopo partita le previsioni diventano più precise.
//
// È solo una memoria della pagina: non va in Firebase, non si salva, si perde quando esci (o cambi il team). Vive in battle-ui.js, per una serie di
// partite con lo stesso team del Box contro la CPU (mai nei Random, nelle palestre, nelle partite online).
//
// Una memoria è un oggetto semplice (lo scrive cpu-ia.js a fine partita con memoriaDellaPartita(), lo legge nella partita dopo):
//   { v, partite, categorie: { attacco, protezione, cambio, altro },
//     specie: { <id>: { n, portato, apertura, mosse: { <mossa>: usi }, mosseT1: { <mossa>: usi al primo turno in campo }, abilita, strumento, tera } } }
// I numeri sono "pesati": a ogni partita che si aggiunge, quelle di prima valgono un po' meno (decadimento), così se cambi modo di giocare la CPU
// se ne accorge.
//
//   CpuMemoria.vuota()                          -> una memoria senza niente
//   CpuMemoria.normalizza(memoria)              -> la memoria pulita (numeri validi, solo ciò che serve) oppure null se non è una memoria
//   CpuMemoria.fondi(vecchia, nuova, opz?)      -> una memoria nuova: la vecchia (col decadimento) più la partita appena finita
//   CpuMemoria.quotaMossa(r, mossa, primoTurno) -> { quota, n }: quanto spesso quel Pokémon ha usato quella mossa (nel primo turno in campo o negli altri)
//   CpuMemoria.quoteCategorie(r, primoTurno, classe) -> { attacco, protezione, altro, n }: lo stesso per categoria di mossa (classe: nome della mossa -> categoria)
//   CpuMemoria.riassunto(memoria)               -> { partite, specie: [{ specie, n, mosse }] } per mostrarla o controllarla
//
// Funziona nel browser (window.CpuMemoria) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.CpuMemoria = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSIONE = 1;
    const DECADIMENTO = 0.85;          // ogni partita nuova fa valere le precedenti un po' meno
    const MINIMO = 0.06;               // sotto questo peso una mossa o una specie si dimentica
    const CATEGORIE = ['attacco', 'protezione', 'cambio', 'altro'];
    const MAX_MOSSE = 12;
    const MAX_SPECIE = 12;

    const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const arrotonda = x => Math.round(x * 1000) / 1000;

    function vuota() {
        return { v: VERSIONE, partite: 0, categorie: { attacco: 0, protezione: 0, cambio: 0, altro: 0 }, specie: {} };
    }

    function mappa(o, fattore = 1) {
        const out = {};
        if (!o || typeof o !== 'object') return out;
        for (const [k, v] of Object.entries(o)) { const x = num(v) * fattore; if (x > 0 && typeof k === 'string' && k) out[k] = x; }
        return out;
    }

    const testo = v => (typeof v === 'string' && v.length <= 40 ? v : null);

    /** Una memoria da un oggetto qualunque: numeri validi, niente di strano; null se non è una memoria di questa versione */
    function normalizza(m, fattore = 1) {
        if (!m || typeof m !== 'object' || m.v !== VERSIONE || !m.specie || typeof m.specie !== 'object') return null;
        const out = vuota();
        out.partite = Math.max(0, Math.floor(Number(m.partite) || 0));
        for (const k of CATEGORIE) out.categorie[k] = num(m.categorie && m.categorie[k]) * fattore;
        for (const [id, r] of Object.entries(m.specie).slice(0, MAX_SPECIE * 2)) {
            if (!r || typeof r !== 'object') continue;
            const mosse = mappa(r.mosse, fattore), mosseT1 = mappa(r.mosseT1, fattore);
            out.specie[id] = {
                n: num(r.n) * fattore, portato: num(r.portato) * fattore, apertura: num(r.apertura) * fattore,
                mosse, mosseT1, abilita: testo(r.abilita), strumento: testo(r.strumento), tera: testo(r.tera)
            };
        }
        return out;
    }

    /** La vecchia memoria (ogni numero per `decadimento`) più quella della partita appena finita */
    function fondi(vecchia, nuova, opz = {}) {
        const decad = opz.decadimento != null ? opz.decadimento : DECADIMENTO;
        const base = normalizza(vecchia, decad) || vuota();
        const fresca = normalizza(nuova) || vuota();
        const out = vuota();
        out.partite = (vecchia && Number.isFinite(vecchia.partite) ? Math.max(0, Math.floor(vecchia.partite)) : 0) + (nuova ? 1 : 0);
        for (const k of CATEGORIE) out.categorie[k] = arrotonda(base.categorie[k] + fresca.categorie[k]);
        for (const id of new Set([...Object.keys(base.specie), ...Object.keys(fresca.specie)])) {
            const a = base.specie[id], b = fresca.specie[id];
            const somma = (x, y) => { const o = {}; for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) { const v = ((x && x[k]) || 0) + ((y && y[k]) || 0); if (v >= MINIMO) o[k] = arrotonda(v); } return o; };
            const limita = o => Object.fromEntries(Object.entries(o).sort((p, q) => q[1] - p[1]).slice(0, MAX_MOSSE));
            const r = {
                n: arrotonda(((a && a.n) || 0) + ((b && b.n) || 0)), portato: arrotonda(((a && a.portato) || 0) + ((b && b.portato) || 0)),
                apertura: arrotonda(((a && a.apertura) || 0) + ((b && b.apertura) || 0)),
                mosse: limita(somma(a && a.mosse, b && b.mosse)), mosseT1: limita(somma(a && a.mosseT1, b && b.mosseT1)),
                // chi è nuovo (l'ultima partita) vince: sono le cose più recenti che si sono viste
                abilita: (b && b.abilita) || (a && a.abilita) || null, strumento: (b && b.strumento) || (a && a.strumento) || null, tera: (b && b.tera) || (a && a.tera) || null
            };
            if (r.n >= MINIMO) out.specie[id] = r;
        }
        return out;
    }

    // Le mosse che non sono del primo turno: tutti gli usi meno quelli del primo turno
    function altriTurni(r) {
        const o = {};
        for (const [k, v] of Object.entries(r.mosse || {})) { const x = v - ((r.mosseT1 && r.mosseT1[k]) || 0); if (x > 0.01) o[k] = x; }
        return o;
    }

    /** Quanto spesso quel Pokémon ha usato questa mossa, tra le sue mosse del primo turno in campo (o degli altri turni). n = quanti usi sono contati. */
    function quotaMossa(r, mossa, primoTurno) {
        if (!r) return { quota: 0, n: 0 };
        const m = primoTurno ? (r.mosseT1 || {}) : altriTurni(r);
        const n = Object.values(m).reduce((s, x) => s + x, 0);
        return { quota: n > 0 ? (m[mossa] || 0) / n : 0, n };
    }

    /** Come quotaMossa, ma per categoria (attacco, protezione, altro); `classe` dice di che categoria è una mossa */
    function quoteCategorie(r, primoTurno, classe) {
        const out = { attacco: 0, protezione: 0, altro: 0, n: 0 };
        if (!r) return out;
        const m = primoTurno ? (r.mosseT1 || {}) : altriTurni(r);
        for (const [k, v] of Object.entries(m)) { const c = classe(k); out[c in out ? c : 'altro'] += v; out.n += v; }
        return out;
    }

    function riassunto(memoria) {
        const m = normalizza(memoria);
        if (!m) return { partite: 0, specie: [] };
        return {
            partite: m.partite,
            specie: Object.entries(m.specie).map(([specie, r]) => ({ specie, n: arrotonda(r.n), mosse: Object.keys(r.mosse) })).sort((a, b) => b.n - a.n)
        };
    }

    return { VERSIONE, DECADIMENTO, CATEGORIE, vuota, normalizza, fondi, quotaMossa, quoteCategorie, riassunto };
});
