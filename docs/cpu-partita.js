// =====================================================
// CPU PARTITA
// Il collegamento tra la pagina di battaglia e la CPU:
//   - squadreCpu(regolamento): i team della CPU per quel formato, composti da soli (team-cpu.js) dal pool
//     del formato (formato-pool.js). Si fanno una volta e si ricordano nel browser; se il formato cambia
//     (regole nuove, un formato nuovo) cambia la "firma" e si rifanno da soli.
//   - nuovoCervello(): chi sceglie le mosse della CPU in battaglia (cpu-ia.js).
// Nessun riferimento al DOM.
// =====================================================

import { Dex, TeamValidator } from './pkmn-sim.js';
import './cpu-conoscenza.js';    // self.CpuConoscenza
import './cpu-calcolo.js';       // self.CpuCalcolo
import './cpu-ia.js';            // self.CpuIa
import './formato-pool.js';      // self.FormatoPool
import './consigli.js';          // self.Consigli
import './team-cpu.js';          // self.TeamCpu

// Cambia quando cambia il modo di comporre i team: i team ricordati nei browser si rifanno
// (2: ogni team ha una strategia vera, verificata sui set: chi la imposta e chi ne approfitta;
//  3: mosse, strumenti e abilità preferiti tra quelli che di solito si giocano su ogni Pokémon)
export const VERSIONE_TEAM_CPU = 3;
const memoria = new Map();

function hash(testo) {
    let h = 2166136261;
    for (let i = 0; i < testo.length; i++) { h ^= testo.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
}

// Solo ciò che cambia i team: le regole del formato (non il nome della descrizione, ad esempio)
function firmaRegolamento(regolamento, iniziali) {
    const r = regolamento;
    return hash(JSON.stringify([
        VERSIONE_TEAM_CPU, r.categoria, r.genRuleType, r.genRuleValue, r.baseTier, r.battleStyle, r.strutturaSito,
        r.vgcGen, r.vgcFormat, r.generationalMechanics === true, r.restrizioni || null, iniziali
    ]));
}

async function caricaJson(percorso) {
    const r = await fetch(percorso);
    if (!r.ok) throw new Error(`${percorso}: ${r.status}`);
    return r.json();
}

function daMemoriaDelBrowser(chiave, firma) {
    try {
        const s = JSON.parse(localStorage.getItem(chiave) || 'null');
        if (s && s.firma === firma && Array.isArray(s.team) && s.team.length) return s.team;
    } catch { /* senza memoria si rifà */ }
    return null;
}
function inMemoriaDelBrowser(chiave, firma, team) {
    try { localStorage.setItem(chiave, JSON.stringify({ firma, team })); } catch { /* pieno o bloccato: pazienza */ }
}

// Restituisce { team: [{ nome, piano, testo, specie[], numero }], avvisi: [] }
// iniziali: iniziali del nome e del cognome del giocatore, per i formati con la regola "iniziale del nome"
export async function squadreCpu(regolamento, { iniziali = [] } = {}) {
    const inizialiPulite = iniziali.map(x => String(x || '').trim().charAt(0).toLowerCase()).filter(Boolean);
    const firma = firmaRegolamento(regolamento, inizialiPulite);
    const chiave = `squadreCpu|${String(regolamento.categoria || '').toLowerCase()}`;

    if (memoria.has(firma)) return memoria.get(firma);
    const salvate = daMemoriaDelBrowser(chiave, firma);
    if (salvate) {
        const risultato = { team: salvate, avvisi: [] };
        memoria.set(firma, risultato);
        return risultato;
    }

    const risultato = await self.TeamCpu.squadrePerFormato({
        Dex, TeamValidator, regolamento, caricaJson, quanti: 12, iniziali: inizialiPulite,
        seme: `cpu|${regolamento.categoria || ''}|v${VERSIONE_TEAM_CPU}`
    });
    memoria.set(firma, risultato);
    if (risultato.team.length) inMemoriaDelBrowser(chiave, firma, risultato.team);
    return risultato;
}

// Chi sceglie le mosse della CPU (uno per battaglia: tiene a mente com'è andata).
// `piano`: la strategia del team che gioca (team.piano di squadreCpu): l'IA la applica in anteprima e in battaglia.
export function nuovoCervello(lato = 'p2', { piano = null } = {}) {
    return self.CpuIa.crea({ Dex, lato, piano });
}

// Il nome con cui un team della CPU si presenta a chi gioca: "Team 7". Mai il nome vero (il piano di gioco, il Pokémon
// asso: "CPU Tailwind · ..."), altrimenti si saprebbe già cosa farà. Il numero è quello stabile del team nel suo formato.
export function nomeNeutro(team, indice) {
    const n = team && Number.isInteger(team.numero) && team.numero > 0 ? team.numero : indice + 1;
    return `Team ${n}`;
}

// Un team a caso tra quelli disponibili, diverso dal precedente se possibile
export function sceglieTeam(team, escludiIndice = -1) {
    const possibili = team.map((t, i) => i).filter(i => i !== escludiIndice);
    const lista = possibili.length ? possibili : team.map((t, i) => i);
    return lista[Math.floor(Math.random() * lista.length)];
}
