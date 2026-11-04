// Genera docs/rarita-pkm.js (e la sua copia functions/rarita-pkm.js): in che fascia di rarità sta ogni specie, per dare un prezzo allo shiny di un Pokémon di un team
// (cosmetici.js, prezzoShiny). I dati sono quelli del simulatore che il sito si porta dietro (docs/pkmn-sim.js): categoria (Mythical, Restricted Legendary, Sub-Legendary, Ultra Beast,
// Paradox), tier (OU, UU...), se non è completamente evoluto e le statistiche di base.
// Quando il simulatore si aggiorna (nuove specie):   node tools/rarita-pkm/genera.mjs   e si commitano i due file generati.
//
// Fasce, dalla più economica:
//   comune     non completamente evoluti (anche Little Cup) e, evoluti, con statistiche di base sotto 450
//   standard   tutto il resto (è la fascia di chi non è in elenco)
//   forte      statistiche di base da 600 in su (i pseudo-leggendari), tier OU / UUBL / Uber / AG, Paradox
//   raro       sub-leggendari (le bestie, i laghi, le spade di giustizia...) e Ultracreature
//   mitico     leggendari "restricted" e mitici (Mewtwo, Calyrex, Zacian, Mew, Arceus...)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = path.dirname(fileURLToPath(import.meta.url));
const RADICE = path.join(QUI, '..', '..');
export const FASCE = ['comune', 'standard', 'forte', 'raro', 'mitico'];

/** La fascia di una specie, dai suoi dati: { tier, tags, nfe, bst } */
export function fasciaDi({ tier, tags = [], nfe = false, bst = 0 }) {
    const t = new Set(tags);
    if (t.has('Mythical') || t.has('Restricted Legendary')) return 'mitico';
    if (t.has('Sub-Legendary') || t.has('Ultra Beast')) return 'raro';
    if (nfe) return 'comune';
    if (bst >= 600 || t.has('Paradox') || ['AG', 'Uber', 'OU', 'UUBL'].includes(tier)) return 'forte';
    if (bst < 450) return 'comune';
    return 'standard';
}

/** docs/pkmn-sim.js è un modulo ES con estensione .js: per caricarlo in Node se ne fa una copia .mjs temporanea */
async function caricaDex() {
    const copia = path.join(os.tmpdir(), `pkmn-sim-${process.pid}.mjs`);
    fs.copyFileSync(path.join(RADICE, 'docs', 'pkmn-sim.js'), copia);
    try { return (await import(pathToFileURL(copia).href)).Dex; } finally { fs.unlinkSync(copia); }
}

/** { fascia: [id, ...] } per tutte le specie tranne quelle "standard" (che sono il valore di partenza) */
export async function costruisci() {
    const Dex = await caricaDex();
    const elenchi = Object.fromEntries(FASCE.filter(f => f !== 'standard').map(f => [f, []]));
    for (const s of Dex.species.all()) {
        if (!s.exists || s.isNonstandard === 'CAP' || s.isNonstandard === 'Custom') continue;
        const bst = Object.values(s.baseStats).reduce((a, b) => a + b, 0);
        const f = fasciaDi({ tier: s.tier, tags: s.tags, nfe: !!s.nfe, bst });
        if (f !== 'standard') elenchi[f].push(s.id);
    }
    for (const f of Object.keys(elenchi)) elenchi[f] = [...new Set(elenchi[f])].sort();
    return elenchi;
}

export function sorgente(elenchi) {
    const righe = Object.entries(elenchi).map(([f, ids]) => `        ${f}: '${ids.join(' ')}'`);
    return `// =====================================================
// RARITÀ DEI POKÉMON — file generato da tools/rarita-pkm/genera.mjs (non si modifica a mano)
// ---------------------------------------------------------------------
// In che fascia sta ogni specie: comune, standard, forte, raro, mitico (vedi il generatore). Qui ci sono gli id Showdown (minuscolo, solo lettere e cifre) delle fasce diverse da "standard",
// che è quella di chi non è in elenco. Serve a dare un prezzo allo shiny di un Pokémon di un team (cosmetici.js, prezzoShiny).
// ATTENZIONE: questo file esiste in due copie identiche, functions/rarita-pkm.js (il server decide il prezzo) e docs/rarita-pkm.js (il sito lo mostra).
// Funziona nel browser (window.RaritaPkm) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.RaritaPkm = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const ELENCHI = {
${righe.join(',\n')}
    };
    const mappa = {};
    for (const [fascia, ids] of Object.entries(ELENCHI)) for (const id of ids.split(' ')) mappa[id] = fascia;
    /** La fascia di una specie, dal suo nome o dal suo id Showdown ("Calyrex-Shadow", "Mr. Mime", "Flabébé"); "standard" se non è in elenco */
    const fascia = nome => mappa[String(nome == null ? '' : nome).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')] || 'standard';
    return { fascia, ELENCHI, FASCE: ['comune', 'standard', 'forte', 'raro', 'mitico'] };
});
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const elenchi = await costruisci();
    const testo = sorgente(elenchi);
    fs.writeFileSync(path.join(RADICE, 'docs', 'rarita-pkm.js'), testo);
    fs.writeFileSync(path.join(RADICE, 'functions', 'rarita-pkm.js'), testo);
    console.log(Object.entries(elenchi).map(([f, ids]) => `${f}: ${ids.length}`).join(' · '), '(standard: tutte le altre)');
}
