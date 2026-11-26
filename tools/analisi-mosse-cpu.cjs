'use strict';
// =====================================================
// ANALISI DELLE MOSSE DELLA CPU
// Gioca partite CPU contro CPU con i team che la CPU si compone da sola e, per ogni mossa di ogni Pokémon:
//   - quante partite l'ha avuta in campo, quante volte l'ha usata (una mossa mai usata è un posto sprecato nel set);
//   - quante volte non ha fatto niente e perché: immune, assorbita da un'abilità, parata da una protezione, fallita, mancata, nessun bersaglio
// (un tentennamento di chi subisce Fake Out è un successo, non si conta).
// Serve a trovare i difetti che si ripetono (come Lightning Rod che assorbiva ogni mossa Elettro) senza aspettare che li veda una persona.
//
//   node tools/analisi-mosse-cpu.cjs --formato singolo|singolo7|singolo4|vgc|doppio|lc9 [--partite 300] [--docs cartella] [--seme A] [--min 8] [--esempi Mossa [--n-esempi 6]]  (stampa il turno in cui la mossa non ha fatto niente) [--parametri-team '{..}']
// =====================================================
const fs = require('node:fs');
const path = require('node:path');
const a = process.argv.slice(2);
const val = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : d; };
const FORMATO = val('formato', 'singolo'), PARTITE = parseInt(val('partite', '300'), 10), SEME = val('seme', 'A'), MIN = parseInt(val('min', '8'), 10);
const ESEMPI = val('esempi', ''), N_ESEMPI = parseInt(val('n-esempi', '6'), 10);
let mostrati = 0;
const DOCS = path.resolve(val('docs', path.join(__dirname, '..', 'docs')));
const PAR_TEAM = JSON.parse(val('parametri-team', '{}'));
const { caricaRandoms, giocaPartita, creaCasuale } = require(path.join(__dirname, '..', 'test', 'ayuda-sim.js'));
const IA = require(path.join(DOCS, 'cpu-ia.js'));
const T = require(path.join(DOCS, 'team-cpu.js'));
const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };

function regolamento(f) {
    if (f === 'vgc') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    if (f === 'doppio') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi };
    const g = /^(singolo|doppio)(\d)$/.exec(f);
    if (g) return { genRuleType: 'within', genRuleValue: g[2], baseTier: 'OU', battleStyle: g[1] === 'doppio' ? 'doubles' : 'singles', strutturaSito: 'custom', restrizioni: permessi };
    if (f === 'lc9') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'LC', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi };
    return { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi };
}
function formatoSim(f) {
    const g = /^(singolo|doppio)(\d)$/.exec(f);
    if (g) return `gen${g[2]}${g[1] === 'doppio' ? 'doubles' : ''}customgame@@@${Number(g[2]) < 5 ? 'Team Preview,' : ''}Picked Team Size = 4,HP Percentage Mod`;
    return ({ vgc: 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause', doppio: 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod' })[f] || 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod';
}

// Cosa è successo alla mossa appena usata: guarda le righe fino alla prossima mossa o al prossimo turno
function esito(righe, i, lato) {
    const motivi = [];
    for (let j = i + 1; j < righe.length && j < i + 14; j++) {
        const q = righe[j].split('|');
        if (q[1] === 'move' || q[1] === 'turn' || q[1] === 'upkeep' || q[1] === 'switch' || q[1] === 'drag') break;
        const ab = /\[from\] ability: ([^|\]]+)/.exec(righe[j]);
        if (q[1] === '-immune') motivi.push(ab ? 'assorbita da ' + ab[1] : 'immune');
        else if (q[1] === '-miss') motivi.push('mancata');
        else if (q[1] === '-fail') motivi.push('fallita');
        else if (q[1] === '-notarget') motivi.push('nessun bersaglio');
        else if (q[1] === '-activate' && /Protect|Detect|Spiky|King's Shield|Baneful|Obstruct|Silk Trap|Burning Bulwark|Max Guard/i.test(q[3] || '')) motivi.push('parata da una protezione');
        else if (q[1] === '-activate' && /Substitute/i.test(q[3] || '')) motivi.push('sul sostituto');
        else if (q[1] === '-ability' && /boost|heal|redirect|absorb/i.test(q[4] || '') && (q[2] || '').slice(0, 2) !== lato) motivi.push('assorbita da ' + q[3]);
        else if ((q[1] === '-boost' || q[1] === '-heal') && ab && (q[2] || '').slice(0, 2) !== lato) motivi.push('assorbita da ' + ab[1]);
    }
    return motivi[0] || null;
}

(async () => {
    const { sim } = await caricaRandoms();
    const leggi = p => JSON.parse(fs.readFileSync(path.join(DOCS, p), 'utf8'));
    const r = await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: regolamento(FORMATO), caricaJson: async p => leggi(p), quanti: 200, seme: 'analisi-' + SEME, parametriTeam: PAR_TEAM });
    const team = r.team.map(t => ({
        piano: t.piano, testo: t.testo,
        sets: t.testo.split('\n\n').map(s => { const righe = s.split('\n'); return { specie: righe[0].replace(/ @ .*/, '').replace(/ \(.*\)$/, ''), mosse: righe.filter(l => l.startsWith('- ')).map(l => l.slice(2)) }; })
    }));
    const stat = {};                 // "Specie|Mossa" -> { disp, usi, motivi: {} }
    const S = k => stat[k] || (stat[k] = { disp: 0, usi: 0, nulle: 0, motivi: {} });
    let errori = 0;
    for (let g = 0; g < PARTITE; g++) {
        const tA = team[(g * 5) % team.length], tB = team[(g * 11 + 3) % team.length];
        const cA = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(g * 13 + 1), piano: tA.piano }), cB = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(g * 17 + 2), piano: tB.piano });
        const e = await giocaPartita({ sim, formato: formatoSim(FORMATO), team1: tA.testo, team2: tB.testo,
            agente1: { tipo: 'cpu', cerebro: cA, anteprima: q => cA.scegli(q, { errori: 0 }) }, agente2: { tipo: 'cpu', cerebro: cB, anteprima: q => cB.scegli(q, { errori: 0 }) },
            casuale: creaCasuale(g * 11 + 5), seme: [g + 1, 7, 11, 13] });
        errori += e.errori.length;
        // chi è sceso in campo (per specie, a partire dal nome nel log)
        const inCampo = { p1: new Set(), p2: new Set() };
        for (const riga of e.righe) { const q = riga.split('|'); if (q[1] === 'switch' || q[1] === 'drag') inCampo[q[2].slice(0, 2)].add(q[3].split(',')[0]); }
        for (const [lato, tm] of [['p1', tA], ['p2', tB]]) for (const s of tm.sets) if (inCampo[lato].has(s.specie)) for (const m of s.mosse) S(s.specie + '|' + m.replace(/^Hidden Power .*/, 'Hidden Power')).disp++;
        const specieDi = {};
        for (const riga of e.righe) { const q = riga.split('|'); if (q[1] === 'switch' || q[1] === 'drag') specieDi[q[2].replace(/^(p\d)[abc]: /, '$1: ')] = q[3].split(',')[0]; }
        for (let i = 0; i < e.righe.length; i++) {
            const q = e.righe[i].split('|');
            if (q[1] !== 'move' || e.righe[i].includes('[from]')) continue;
            const chi = q[2], lato = chi.slice(0, 2), nome = specieDi[chi.replace(/^(p\d)[abc]: /, '$1: ')];
            if (!nome) continue;
            const k = nome + '|' + q[3].replace(/^Hidden Power .*/, 'Hidden Power'), s = S(k);
            s.usi++;
            const m = esito(e.righe, i, lato);
            if (m && ESEMPI && q[3] === ESEMPI && mostrati < N_ESEMPI) { mostrati++; let t0 = i; while (t0 > 0 && !e.righe[t0].startsWith('|turn|')) t0--; console.log(`--- partita ${g}, ${m}\n` + (tA.testo.split('\n\n').concat(tB.testo.split('\n\n')).filter(x => x.includes('- ' + ESEMPI)).join('\n').slice(0, 400)) + '\n' + e.righe.slice(t0, i + 6).filter(r => /^\|(turn|move|switch|drag|-fail|-immune|-miss|-activate|cant)\|/.test(r)).join('\n')); }
            if (m) { s.nulle++; s.motivi[m] = (s.motivi[m] || 0) + 1; }
        }
    }
    console.log(`${FORMATO}: ${PARTITE} partite, scelte rifiutate ${errori}`);
    const righe = Object.entries(stat).map(([k, s]) => ({ k, ...s, tasso: s.disp ? s.usi / s.disp : 0, nullo: s.usi ? s.nulle / s.usi : 0 }));
    console.log(`\n== Mosse quasi mai usate (almeno ${MIN} partite col Pokémon in campo, meno di 0,15 usi a partita)`);
    for (const x of righe.filter(x => x.disp >= MIN && x.tasso < 0.15).sort((p, q) => p.tasso - q.tasso).slice(0, 40)) console.log(`${x.k.padEnd(34)} in ${String(x.disp).padStart(3)} partite, usata ${x.usi} volte`);
    console.log(`\n== Mosse che spesso non fanno niente (almeno ${MIN} usi, almeno il 25% nullo)`);
    for (const x of righe.filter(x => x.usi >= MIN && x.nullo >= 0.25).sort((p, q) => q.nulle - p.nulle).slice(0, 40)) {
        console.log(`${x.k.padEnd(34)} ${String(x.usi).padStart(3)} usi, ${String(Math.round(100 * x.nullo)).padStart(3)}% nulle: ${Object.entries(x.motivi).sort((p, q) => q[1] - p[1]).map(([m, n]) => `${m} ${n}`).join(', ')}`);
    }
    const tot = righe.reduce((s, x) => s + x.usi, 0), nulle = righe.reduce((s, x) => s + x.nulle, 0);
    const motiviTot = {};
    for (const x of righe) for (const [m, n] of Object.entries(x.motivi)) motiviTot[m.replace(/^assorbita da .*/, 'assorbita da un\'abilità')] = (motiviTot[m.replace(/^assorbita da .*/, 'assorbita da un\'abilità')] || 0) + n;
    console.log(`\n== Totale: ${tot} mosse usate, ${nulle} senza effetto (${(100 * nulle / Math.max(1, tot)).toFixed(1)}%): ${Object.entries(motiviTot).sort((p, q) => q[1] - p[1]).map(([m, n]) => `${m} ${n}`).join(', ')}`);
})();
