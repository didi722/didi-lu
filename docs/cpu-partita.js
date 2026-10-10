// =====================================================
// CPU PARTITA
// Il collegamento tra la pagina di battaglia e la CPU:
//   - nuovoTeamCpu(regolamento): un team della CPU per quel formato, composto da solo (team-cpu.js) dal pool del formato
//     (formato-pool.js) nel momento in cui inizia la sfida, a caso e diverso da quelli appena incontrati. La parte lenta (leggere
//     le mosse di un centinaio di Pokémon) si fa una volta per formato e si tiene in memoria finché la pagina resta aperta:
//     il primo team costa una frazione di secondo, quelli dopo ancora meno. Niente più team ricordati nel browser.
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

const sessioni = new Map();       // firma del formato -> promessa della sessione di team-cpu.js (la parte lenta, già fatta)
const recenti = new Map();        // firma -> le specie degli ultimi team incontrati: i prossimi non somigliano troppo
const RECENTI_MAX = 4;
let contatore = 0;                // "Team 1", "Team 2"...: il numero progressivo della pagina

function hash(testo) {
    let h = 2166136261;
    for (let i = 0; i < testo.length; i++) { h ^= testo.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
}

// Solo ciò che cambia i team: le regole del formato (non il nome della descrizione, ad esempio)
function firmaRegolamento(regolamento, iniziali) {
    const r = regolamento;
    return hash(JSON.stringify([
        r.categoria, r.genRuleType, r.genRuleValue, r.baseTier, r.battleStyle, r.strutturaSito,
        r.vgcGen, r.vgcFormat, r.generationalMechanics === true, r.restrizioni || null, iniziali
    ]));
}

async function caricaJson(percorso) {
    const r = await fetch(percorso);
    if (!r.ok) throw new Error(`${percorso}: ${r.status}`);
    return r.json();
}

// Fino a poco fa i team della CPU si facevano in anticipo e si ricordavano nel browser: quelle copie non servono più
let vecchiaMemoriaPulita = false;
function ripulisciVecchiaMemoria() {
    if (vecchiaMemoriaPulita) return;
    vecchiaMemoriaPulita = true;
    try {
        for (const chiave of Object.keys(localStorage)) if (chiave.startsWith('squadreCpu|')) localStorage.removeItem(chiave);
    } catch { /* memoria bloccata: pazienza */ }
}

// Restituisce { team: { nome, piano, strategia, testo, specie[], numero } | null, avvisi: [] }
// iniziali: iniziali del nome e del cognome del giocatore, per i formati con la regola "iniziale del nome"
// seme: solo per le prove (di solito il team è a caso)
export async function nuovoTeamCpu(regolamento, { iniziali = [], seme } = {}) {
    ripulisciVecchiaMemoria();
    const inizialiPulite = iniziali.map(x => String(x || '').trim().charAt(0).toLowerCase()).filter(Boolean);
    const firma = firmaRegolamento(regolamento, inizialiPulite);

    if (!sessioni.has(firma)) {
        const promessa = self.TeamCpu.preparaSessione({ Dex, TeamValidator, regolamento, caricaJson, iniziali: inizialiPulite });
        promessa.catch(() => sessioni.delete(firma));       // se il caricamento fallisce (rete) la volta dopo si riprova
        sessioni.set(firma, promessa);
    }
    const sessione = await sessioni.get(firma);
    const ultimi = recenti.get(firma) || [];
    const { team, avvisi } = await self.TeamCpu.nuovoTeam(sessione, { recenti: ultimi, ...(seme ? { seme } : {}) });
    if (team) {
        team.numero = ++contatore;
        recenti.set(firma, [...ultimi, team.chiavi].slice(-RECENTI_MAX));
    }
    return { team, avvisi };
}

// Chi sceglie le mosse della CPU (uno per battaglia: tiene a mente com'è andata).
// `piano`: la strategia del team che gioca (team.piano di nuovoTeamCpu): l'IA la applica in anteprima e in battaglia.
// `meccaniche`: le meccaniche di generazione che il formato ammette (Mega Evoluzione, Mosse Z, Dynamax, Teracristal): false se il formato
// non le ammette (generationalMechanics spento), altrimenti ci pensa il simulatore a offrirle (e a scrivere nel log le clausole che le vietano)
export function nuovoCervello(lato = 'p2', { piano = null, meccaniche } = {}) {
    return self.CpuIa.crea({ Dex, lato, piano, meccaniche });
}

// Cosa dire a nuovoCervello delle meccaniche di generazione di un formato: false se spente, altrimenti niente (le decide il simulatore)
export function meccanicheDelFormato(regolamento) {
    return regolamento && regolamento.generationalMechanics === true ? undefined : false;
}

// Il nome con cui un team della CPU si presenta a chi gioca: "Team 7". Mai il nome vero (il piano di gioco, il Pokémon
// asso: "CPU Tailwind · ..."), altrimenti si saprebbe già cosa farà. Il numero è quello progressivo della pagina.
export function nomeNeutro(team) {
    const n = team && Number.isInteger(team.numero) && team.numero > 0 ? team.numero : 1;
    return `Team ${n}`;
}
