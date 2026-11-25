/* Parte pura di genera-consigli.cjs: dai set grezzi (Smogon + battaglie casuali di Showdown) ai consigli compatti.
   Provata in test/consigli.test.js. */
'use strict';

const toID = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');

// Formati dove si gioca "per davvero" pesano 1; quelli speciali meno; quelli di sperimentazione non contano
const ESCLUSI = /^(godlygift|stabmons|almostanyability|balancedhackmons|purehackmons|mixandmega|camomons|inheritance|partnersincrime|sharedpower|cap|crossevolution|fortemons|pic|tiershift|scalemons|350cup|trademarked|ffa|metronome|freeforall|gen\d+metronome|vgcmulti)$/;
const SPECIALI = /^(lc|lclevel100|petitcup|pikacup|middlecup|nfe|nc\d+|1v1|2v2doubles|stadium.*|tradebacks.*)$/;
const DOPPI = /(doubles|vgc|battlespotdoubles|battlestadiumdoubles|2v2)/;

function pesoFormato(formato) {
    const f = toID(formato);
    if (ESCLUSI.test(f)) return 0;
    if (SPECIALI.test(f)) return 0.5;
    return 1;
}
const eDoppio = formato => DOPPI.test(toID(formato));

const MAX = { m: 16, i: 8, a: 3 };
// quanti spread (natura ed EV) si tengono per ogni Pokémon e quante mosse di ognuno (servono per capire a quale set somiglia quello che la CPU sta componendo)
const MAX_SPREAD = 3, MAX_MOSSE_SPREAD = 10;
const STATISTICHE = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function nuovo() { return { m: new Map(), i: new Map(), a: new Map(), p: new Map() }; }
function vota(mappa, valore, peso) {
    const id = toID(valore);
    if (!id || !peso) return;
    mappa.set(id, (mappa.get(id) || 0) + peso);
}
// una casella con alternative (["Giga Drain", "Leech Seed"]): la prima pesa tutto, le altre la metà
function votaCasella(mappa, casella, peso) {
    const alt = Array.isArray(casella) ? casella : [casella];
    alt.forEach((v, k) => vota(mappa, v, k === 0 ? peso : peso / 2));
}
// a parità di voti resta l'ordine in cui compaiono (i set di Smogon mettono per prima la mossa principale)
const ordinati = (mappa, quanti) => [...mappa.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, quanti).map(x => x[0]);

// I set più recenti pesano di più: tra i formati del VGC conta l'anno (vgc2025 più di vgc2023); per gli altri formati nessuna differenza
function pesoRecente(formato) {
    const m = /^vgc20(\d\d)/.exec(toID(formato));
    return m ? Math.max(0.5, 1 - (25 - Number(m[1])) * 0.15) : 1;
}

// Natura ed EV di un set di Smogon. Natura, EV e IV possono essere liste (due varianti dello stesso set: si accoppiano per posizione).
// Un EV è la lista [hp, atk, def, spa, spd, spe]; gli IV si tengono solo se non sono tutti 31 ({ atk: 0 }).
function spreadDelSet(set) {
    const lista = x => (Array.isArray(x) ? x : (x == null ? [] : [x]));
    const nature = lista(set.nature), evs = lista(set.evs), ivs = lista(set.ivs);
    if (!nature.length || !evs.length) return [];
    const mosse = [...new Set((set.moves || []).flat().map(toID).filter(Boolean))].slice(0, MAX_MOSSE_SPREAD);
    const n = Math.min(2, Math.max(nature.length, evs.length));
    const out = [];
    for (let k = 0; k < n; k++) {
        const nat = nature[k] || nature[0], ev = evs[k] || evs[0], iv = ivs[k] || ivs[0] || null;
        if (!nat || !ev || typeof ev !== 'object') continue;
        const e = STATISTICHE.map(st => Math.max(0, Math.min(252, Number(ev[st]) || 0)));
        if (e.reduce((a, b) => a + b, 0) > 510) continue;       // qualche set di Smogon ha 512 EV (un refuso): il validatore lo rifiuta
        const i = {};
        for (const [st, v] of Object.entries(iv || {})) if (STATISTICHE.includes(st) && Number(v) >= 0 && Number(v) < 31) i[st] = Number(v);
        out.push({ n: String(nat), e, ...(Object.keys(i).length ? { i } : {}), m: mosse });
    }
    return out;
}

function aggiungiSetSmogon(specie, set, peso, formato = '') {
    (set.moves || []).forEach(c => votaCasella(specie.m, c, peso));
    if (set.item) votaCasella(specie.i, set.item, peso);
    if (set.ability) votaCasella(specie.a, set.ability, peso);
    // lo stesso spread (natura, EV, IV) in più set o formati pesa di più; le mosse dei set che lo portano si uniscono
    for (const sp of spreadDelSet(set)) {
        const chiave = JSON.stringify([sp.n, sp.e, sp.i || null]);
        const gia = specie.p.get(chiave);
        const w = peso * pesoRecente(formato);
        if (gia) { gia.w += w; for (const m of sp.m) if (!gia.m.includes(m) && gia.m.length < MAX_MOSSE_SPREAD) gia.m.push(m); }
        else specie.p.set(chiave, { w, n: sp.n, e: sp.e, ...(sp.i ? { i: sp.i } : {}), m: sp.m.slice() });
    }
}

// i set delle battaglie casuali: la forma cambia un po' da una generazione all'altra
function aggiungiCasuali(specie, voce) {
    const elenco = Array.isArray(voce?.sets) ? voce.sets : [];
    for (const s of elenco) {
        for (const m of (s.movepool || s.moves || [])) vota(specie.m, m, 0.35);
        for (const a of (s.abilities || [])) vota(specie.a, a, 0.35);
    }
    for (const m of (Array.isArray(voce?.moves) ? voce.moves : [])) vota(specie.m, m, 0.35);   // forma vecchia
}

/**
 * @param {{ gen: number, smogon: object|null, casualiSingoli: object|null, casualiDoppi: object|null }} fonti
 * @returns {{ v: number, gen: number, s: object, d: object }}  s/d: id specie → { m: mosse, i: strumenti, a: abilità } (id, dalla più consigliata)
 *   e, dalla 3ª generazione, p: gli spread più giocati [{ n: natura, e: [hp, atk, def, spa, spd, spe], i?: { atk: 0 }, m: mosse del set }]
 */
function costruisci({ gen, smogon, casualiSingoli, casualiDoppi }) {
    const s = new Map(), d = new Map();
    const scheda = (mappa, id) => { if (!mappa.has(id)) mappa.set(id, nuovo()); return mappa.get(id); };

    for (const [nomeSpecie, perFormato] of Object.entries(smogon || {})) {
        const id = toID(nomeSpecie);
        for (const [formato, sets] of Object.entries(perFormato || {})) {
            const peso = pesoFormato(formato);
            if (!peso) continue;
            const dest = scheda(eDoppio(formato) ? d : s, id);
            for (const set of Object.values(sets || {})) aggiungiSetSmogon(dest, set, peso, formato);
        }
    }
    for (const [id, voce] of Object.entries(casualiSingoli || {})) aggiungiCasuali(scheda(s, toID(id)), voce);
    for (const [id, voce] of Object.entries(casualiDoppi || {})) aggiungiCasuali(scheda(d, toID(id)), voce);

    const finisci = mappa => {
        const out = {};
        for (const [id, x] of [...mappa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
            const m = ordinati(x.m, MAX.m), i = ordinati(x.i, MAX.i), a = ordinati(x.a, MAX.a);
            // gli spread: i più giocati (a parità, nell'ordine in cui compaiono); dalla 3ª generazione, quando natura ed EV esistono
            const p = gen >= 3 ? [...x.p.values()].sort((a, b) => b.w - a.w).slice(0, MAX_SPREAD).map(({ w, ...resto }) => resto) : [];
            if (m.length || i.length || a.length) out[id] = p.length ? { m, i, a, p } : { m, i, a };
        }
        return out;
    };
    return { v: 1, gen, s: finisci(s), d: finisci(d) };
}

module.exports = { toID, pesoFormato, eDoppio, costruisci, MAX };
