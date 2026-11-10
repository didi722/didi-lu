'use strict';
// =====================================================
// PROVA DEI TEAM DELLA CPU: I NUOVI CONTRO I VECCHI
//
// Un team composto con altre manopole (docs/team-cpu.js, PARAMETRI_TEAM) è più forte o più debole di quelli composti come prima? Si compongono due serie di
// team (la variante e il confronto), e la CPU (la stessa, con le stesse manopole) li gioca uno contro l'altro. Ogni coppia sono due partite con gli stessi due
// team a lati scambiati; il risultato è la media (0, 0,5, 1). Non è tra i test: si lancia a mano.
//
//   node tools/prova-team.cjs [--formato vgc|doppio|singolo] [--team 60] [--coppie 400] [--seme A] [--variante '{"maxAiuto":1}'] [--confronto vecchi|'{"...":...}']
//        --seme       il seme della serie della variante (la serie di confronto è sempre la stessa): serie diverse = team diversi; la forza di una serie di team varia
//                     di qualche punto da una serie all'altra, quindi per un confronto serio si ripete con più semi
//        --variante   i parametri del team della variante (di base: quelli attuali)
//        --confronto  con cosa si confronta: "vecchi" (com'era prima: tutti Protect, tutti gli Helping Hand, niente priorità) o altri parametri in JSON
// Stampa anche com'è fatta ogni serie: Helping Hand, mosse prioritarie e Protezioni per team.
// =====================================================
const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');
const MODULI = path.join(__dirname, '..', 'docs');
const AIUTI = path.join(__dirname, '..', 'test', 'ayuda-sim.js');

const a = process.argv.slice(2);
const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] ? a[i + 1] : predefinito; };
const opz = { formato: val('formato', 'vgc'), team: parseInt(val('team', '60'), 10), coppie: parseInt(val('coppie', '400'), 10), variante: val('variante', '{}'), confronto: val('confronto', 'vecchi'),
    lavoratore: val('lavoratore', ''), file: val('file', ''), meta: val('meta', ''), seme: val('seme', 'A') };

function regolamento(f) {
    const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
    if (f === 'vgc') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    if (f === 'doppio') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi };
    return { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi };
}
const FORMATO_SIM = { vgc: 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause', doppio: 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod', singolo: 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod,Sleep Clause Mod,Endless Battle Clause' };

async function team(sim, T, parametriTeam, seme, quanti, meta) {
    const leggi = p => JSON.parse(fs.readFileSync(path.join(MODULI, p), 'utf8'));
    return (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: regolamento(opz.formato), caricaJson: async p => leggi(p), quanti, seme, parametriTeam, meta })).team;
}
const parametriDi = (testo, T) => (testo === 'vecchi' ? T.PARAMETRI_TEAM_VECCHI : Object.assign({}, T.PARAMETRI_TEAM, JSON.parse(testo)));

async function lavora() {
    const { caricaRandoms, giocaPartita, creaCasuale } = require(AIUTI);
    const IA = require(path.join(MODULI, 'cpu-ia.js'));
    const { sim } = await caricaRandoms();
    const { serieA, serieB } = JSON.parse(fs.readFileSync(opz.file, 'utf8'));
    const [k, n] = opz.lavoratore.split('/').map(Number);
    const f = FORMATO_SIM[opz.formato];
    for (let p = k; p < opz.coppie; p += n) {
        const tA = serieA[p % serieA.length], tB = serieB[(p * 7 + 3) % serieB.length];
        const gioca = async (latoA, seme) => {
            const latoB = latoA === 'p1' ? 'p2' : 'p1';
            const ca = IA.crea({ Dex: sim.Dex, lato: latoA, casuale: creaCasuale(p * 13 + seme) }), cb = IA.crea({ Dex: sim.Dex, lato: latoB, casuale: creaCasuale(p * 17 + seme) });
            const e = await giocaPartita({ sim, formato: f, team1: latoA === 'p1' ? tA : tB, team2: latoA === 'p1' ? tB : tA,
                agente1: { tipo: 'cpu', cerebro: latoA === 'p1' ? ca : cb }, agente2: { tipo: 'cpu', cerebro: latoA === 'p1' ? cb : ca }, casuale: creaCasuale(p * 11 + seme + 5), seme: [p + 1, seme, 11, 13] });
            return { mio: e.vincitore === latoA ? 1 : e.vincitore === latoB ? 0 : 0.5, errori: e.errori.length, turni: e.turni };
        };
        const x = await gioca('p1', 1), y = await gioca('p2', 2);
        process.send({ p, esito: (x.mio + y.mio) / 2, errori: x.errori + y.errori, turni: (x.turni + y.turni) / 2 });
    }
}

const media = v => v.reduce((t, x) => t + x, 0) / (v.length || 1);
const devSt = v => { const m = media(v); return Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); };

function descrivi(nome, squadre, sim) {
    const dex = sim.Dex.forGen(9);
    let aiuto = 0, prio = 0, prot = 0, mon = 0, senzaPrio = 0, fo = 0;
    const PROT = new Set(['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct']);
    for (const t of squadre) {
        let p = 0;
        for (const s of sim.Teams.import(t)) {
            mon++;
            for (const mv of s.moves) {
                const m = dex.moves.get(mv);
                if (m.id === 'helpinghand') aiuto++;
                if (m.id === 'fakeout') fo++;
                else if (m.priority > 0 && m.category !== 'Status') { prio++; p++; }
                if (PROT.has(m.id)) prot++;
            }
        }
        if (!p) senzaPrio++;
    }
    const n = squadre.length;
    return `${nome.padEnd(10)} ${n} team: Helping Hand ${(aiuto / n).toFixed(2)} a team, mosse prioritarie ${(prio / n).toFixed(2)} (nessuna nel ${Math.round(100 * senzaPrio / n)}%), Fake Out ${(fo / n).toFixed(2)}, Protezione sul ${Math.round(100 * prot / mon)}% dei Pokémon`;
}

async function principale() {
    const { caricaRandoms } = require(AIUTI);
    const T = require(path.join(MODULI, 'team-cpu.js'));
    const { sim } = await caricaRandoms();
    const inizio = Date.now();
    const meta = opz.meta ? JSON.parse(fs.readFileSync(opz.meta, 'utf8')) : undefined;
    const serieA = (await team(sim, T, parametriDi(opz.variante, T), 'prova-team-' + opz.seme, opz.team, meta)).map(t => t.testo);
    const serieB = (await team(sim, T, parametriDi(opz.confronto, T), 'prova-team-B', opz.team, opz.metaConfronto ? meta : undefined)).map(t => t.testo);
    console.log(`Formato ${opz.formato}: variante ${opz.variante}${meta ? ' (con la meta della lega)' : ''} contro ${opz.confronto}, ${opz.coppie} coppie`);
    console.log(descrivi('variante', serieA, sim));
    console.log(descrivi('confronto', serieB, sim));
    const file = path.join(require('node:os').tmpdir(), `prova-team-${process.pid}.json`);
    fs.writeFileSync(file, JSON.stringify({ serieA, serieB }));
    const risultati = await new Promise((ok, no) => {
        const r = []; let finiti = 0; const L = 4;
        for (let k = 0; k < L; k++) {
            const f = fork(__filename, ['--lavoratore', `${k}/${L}`, '--formato', opz.formato, '--coppie', String(opz.coppie), '--file', file]);
            f.on('message', m => r.push(m)); f.on('error', no);
            f.on('exit', c => { if (c) return no(new Error('lavoratore ' + k + ' uscito con ' + c)); if (++finiti === L) ok(r); });
        }
    });
    fs.unlinkSync(file);
    const e = risultati.map(r => r.esito), m = media(e), ic = 1.96 * devSt(e) / Math.sqrt(e.length);
    console.log(`\nvittorie dei team della variante: ${(m * 100).toFixed(1)}%  (${((m - ic) * 100).toFixed(1)} … ${((m + ic) * 100).toFixed(1)})  su ${e.length} coppie, turni ${media(risultati.map(r => r.turni)).toFixed(1)}, scelte rifiutate ${risultati.reduce((t, r) => t + r.errori, 0)}, ${Math.round((Date.now() - inizio) / 1000)} s`);
}

if (process.send) lavora().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
else principale().catch(e => { console.error(e); process.exit(1); });
