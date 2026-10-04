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

function nuovo() { return { m: new Map(), i: new Map(), a: new Map() }; }
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

function aggiungiSetSmogon(specie, set, peso) {
    (set.moves || []).forEach(c => votaCasella(specie.m, c, peso));
    if (set.item) votaCasella(specie.i, set.item, peso);
    if (set.ability) votaCasella(specie.a, set.ability, peso);
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
            for (const set of Object.values(sets || {})) aggiungiSetSmogon(dest, set, peso);
        }
    }
    for (const [id, voce] of Object.entries(casualiSingoli || {})) aggiungiCasuali(scheda(s, toID(id)), voce);
    for (const [id, voce] of Object.entries(casualiDoppi || {})) aggiungiCasuali(scheda(d, toID(id)), voce);

    const finisci = mappa => {
        const out = {};
        for (const [id, x] of [...mappa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
            const m = ordinati(x.m, MAX.m), i = ordinati(x.i, MAX.i), a = ordinati(x.a, MAX.a);
            if (m.length || i.length || a.length) out[id] = { m, i, a };
        }
        return out;
    };
    return { v: 1, gen, s: finisci(s), d: finisci(d) };
}

module.exports = { toID, pesoFormato, eDoppio, costruisci, MAX };
