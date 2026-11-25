'use strict';
// =====================================================
// DUELLO TRA DUE VERSIONI DELLA CPU, TEAM E CERVELLO INSIEME
//
// tools/tara-cpu.cjs prova le manopole del cervello sugli stessi team; tools/prova-team.cjs prova i team con lo stesso cervello. Qui si mette a confronto una CPU intera con
// un'altra: ognuna compone i suoi team (team-cpu.js della sua cartella) e li gioca con il suo cervello (cpu-ia.js della sua cartella). Serve a sapere se un gruppo di modifiche,
// prese insieme, rende la CPU più forte o più debole di prima, e di quanto.
//
//   git archive HEAD docs | tar -x -C /tmp/cpu-vecchia          (la CPU di prima: la cartella docs/ dell'ultimo commit)
//   node tools/duello-cpu.cjs --vecchia /tmp/cpu-vecchia/docs [--coppie 200] [--formato vgc|doppio|singolo] [--cervello-nuovo-con-team-vecchi] [--seme A]
//        --parametri '{"..":..}'   parametri del cervello nuovo (di base quelli di adesso)
//        --personalita nome        la personalità della CPU nuova (cpu-personalita.js): fa comporre i team in quello stile e dà al cervello le sue manopole
//        --senza-team / --senza-cervello   la personalità vale solo per il cervello / solo per i team (per sapere da dove viene un cambiamento)
//        --ritocchi '{"cervello":{..},"team":{"parametri":{..},"piani":{..}}}'   cambia al volo la personalità (per provare i valori senza toccare i file)
//        --team-uguali             entrambe usano i team della CPU nuova (si misura solo il cervello)
//        --cervello-uguale         entrambe usano il cervello nuovo (si misura solo il comporre i team)
//        --parametri-team '{"..":..}'   le manopole di composizione dei team della CPU nuova (PARAMETRI_TEAM di team-cpu.js: candFissi, candMax, capUber...), anche quelle che agiscono
//                                  prima delle personalità (la scelta dei candidati)
//        --parametri-team-vecchi '{..}'   con --team-uguali: le manopole dei team dell'altra serie (di base quelle di sempre)
//        --gemelli                 ogni team nuovo gioca contro il suo gemello (stessi membri e mosse, per esempio con una manopola che cambia solo gli EV): confronto a coppie, molto meno rumore
//        --nuova cartella          la cartella docs/ della CPU nuova (di base quella del repository): una copia congelata permette di modificare i file mentre la prova gira
//        --squadre N               quanti team compone ogni versione (di base 60): con più team il rumore dovuto ai team campionati scende (con 200 team e 960 coppie, circa ±2,5)
// Ogni coppia sono due partite con gli stessi due team a lati scambiati: il risultato è la media (0, 0,5, 1). Con 200 coppie l'intervallo al 95% è di circa ±3,5 punti.
// =====================================================
const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');
const a0 = process.argv.slice(2);
// la CPU "nuova": di base la cartella docs/ del repository; con --nuova una copia congelata (per lanciare prove in sottofondo mentre si modificano i file)
const NUOVA = a0.includes('--nuova') ? path.resolve(a0[a0.indexOf('--nuova') + 1]) : path.join(__dirname, '..', 'docs');
const AIUTI = path.join(__dirname, '..', 'test', 'ayuda-sim.js');

const a = process.argv.slice(2);
const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : predefinito; };
const opz = {
    vecchia: val('vecchia', ''), coppie: parseInt(val('coppie', '200'), 10), formato: val('formato', 'vgc'), seme: val('seme', 'A'), parametri: val('parametri', '{}'), personalita: val('personalita', ''),
    squadre: parseInt(val('squadre', '60'), 10), parametriTeam: val('parametri-team', '{}'), parametriTeamVecchi: val('parametri-team-vecchi', '{}'), gemelli: a.includes('--gemelli'), teamUguali: a.includes('--team-uguali'), cervelloUguale: a.includes('--cervello-uguale'), senzaTeam: a.includes('--senza-team'), senzaCervello: a.includes('--senza-cervello'), ritocchi: val('ritocchi', ''), lavoratore: val('lavoratore', ''), lavoratori: parseInt(val('lavoratori', '4'), 10)
};

function regolamento(f) {
    const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
    if (f === 'vgc') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    if (f === 'doppio') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi };
    // altre generazioni e formati: singolo7, singolo4, singolo3 (OU di quella generazione), doppio7 e doppio5 (OU in doppio), lc9 (Little Cup in singolo)
    const gen = /^(singolo|doppio)(\d)$/.exec(f);
    if (gen) return { genRuleType: 'within', genRuleValue: gen[2], baseTier: 'OU', battleStyle: gen[1] === 'doppio' ? 'doubles' : 'singles', strutturaSito: 'custom', restrizioni: permessi };
    if (f === 'lc9') return { genRuleType: 'within', genRuleValue: '9', baseTier: 'LC', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi };
    return { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi };
}
const FORMATO_SIM = new Proxy({ vgc: 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause', doppio: 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod', singolo: 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod', lc9: 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod' }, {
    get(t, f) { const m = /^(singolo|doppio)(\d)$/.exec(f); return m ? `gen${m[2]}${m[1] === 'doppio' ? 'doubles' : ''}customgame@@@${Number(m[2]) < 5 ? 'Team Preview,' : ''}Picked Team Size = 4,HP Percentage Mod` : t[f]; }
});

async function composti(cartella, sim, quanti, seme, personalita, parametriTeam) {
    const T = require(path.join(cartella, 'team-cpu.js'));
    const leggi = p => JSON.parse(fs.readFileSync(path.join(cartella, p), 'utf8'));
    return (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: regolamento(opz.formato), caricaJson: async p => leggi(p), quanti, seme, ...(personalita ? { personalita } : {}), ...(parametriTeam ? { parametriTeam } : {}) })).team;
}

async function lavora() {
    const { caricaRandoms, giocaPartita, creaCasuale } = require(AIUTI);
    const IAnuova = require(path.join(NUOVA, 'cpu-ia.js'));
    const IAvecchia = require(path.join(path.resolve(opz.vecchia), 'cpu-ia.js'));
    const { sim } = await caricaRandoms();
    const N = opz.squadre;
    if (opz.personalita && opz.ritocchi) {         // le personalità sono dati: si ritoccano in questo processo, i file restano com'erano
        const Pers = require(path.join(NUOVA, 'cpu-personalita.js')), r = JSON.parse(opz.ritocchi), p = Pers.PERSONALITA[opz.personalita];
        if (r.cervello) Object.assign(p.cervello, r.cervello);
        if (r.team && r.team.parametri) Object.assign(p.team.parametri, r.team.parametri);
        if (r.team && r.team.piani) p.team.piani = Object.assign({}, r.team.sostituisci ? {} : p.team.piani, r.team.piani);
    }
    const stileTeam = opz.personalita && !opz.senzaTeam ? opz.personalita : '';
    const stileCervello = opz.personalita && !opz.senzaCervello ? opz.personalita : '';
    const parametriTeam = JSON.parse(opz.parametriTeam);
    const teamNuovi = await composti(NUOVA, sim, N, 'duello-' + opz.seme, stileTeam, Object.keys(parametriTeam).length ? parametriTeam : null);
    const parametriTeamVecchi = JSON.parse(opz.parametriTeamVecchi);
    const teamVecchi = opz.teamUguali ? await composti(NUOVA, sim, N, 'duello-' + opz.seme, '', Object.keys(parametriTeamVecchi).length ? parametriTeamVecchi : null)
        : await composti(path.resolve(opz.vecchia), sim, N, 'duello-' + opz.seme);
    const parametri = JSON.parse(opz.parametri);
    const [k, n] = opz.lavoratore.split('/').map(Number);
    const f = FORMATO_SIM[opz.formato];
    for (let p = k; p < opz.coppie; p += n) {
        // con --gemelli ogni team nuovo gioca contro il suo gemello (stessa posizione nella serie): se le due serie differiscono solo per una manopola che non cambia i membri
        // (gli EV, lo strumento) è un confronto a coppie, senza il rumore di team diversi
        const tN = teamNuovi[p % N], tV = opz.gemelli ? teamVecchi[p % N] : teamVecchi[(p * 7 + 3) % N];
        const gioca = async (latoN, seme) => {
            const latoV = latoN === 'p1' ? 'p2' : 'p1';
            const cn = IAnuova.crea({ Dex: sim.Dex, lato: latoN, casuale: creaCasuale(p * 13 + seme), parametri, piano: tN.piano, ...(stileCervello ? { personalita: stileCervello } : {}) });
            const cv = (opz.cervelloUguale ? IAnuova : IAvecchia).crea({ Dex: sim.Dex, lato: latoV, casuale: creaCasuale(p * 17 + seme), piano: tV.piano });
            const e = await giocaPartita({ sim, formato: f, team1: latoN === 'p1' ? tN.testo : tV.testo, team2: latoN === 'p1' ? tV.testo : tN.testo,
                agente1: { tipo: 'cpu', cerebro: latoN === 'p1' ? cn : cv, anteprima: r => (latoN === 'p1' ? cn : cv).scegli(r, { errori: 0 }) },
                agente2: { tipo: 'cpu', cerebro: latoN === 'p1' ? cv : cn, anteprima: r => (latoN === 'p1' ? cv : cn).scegli(r, { errori: 0 }) },
                casuale: creaCasuale(p * 11 + seme + 5), seme: [p + 1, seme, 11, 13] });
            return { mio: e.vincitore === latoN ? 1 : e.vincitore === latoV ? 0 : 0.5, errori: e.errori.length, turni: e.turni };
        };
        const x = await gioca('p1', 1), y = await gioca('p2', 2);
        process.send({ p, esito: (x.mio + y.mio) / 2, errori: x.errori + y.errori, turni: (x.turni + y.turni) / 2 });
    }
}

async function principale() {
    if (!opz.vecchia) throw new Error('manca --vecchia <cartella docs della CPU di prima>');
    const inizio = Date.now();
    const risultati = await new Promise((ok, no) => {
        const out = []; let finiti = 0;
        for (let k = 0; k < opz.lavoratori; k++) {
            const figlio = fork(__filename, ['--lavoratore', `${k}/${opz.lavoratori}`, '--vecchia', opz.vecchia, '--coppie', String(opz.coppie), '--formato', opz.formato, '--seme', opz.seme, '--parametri', opz.parametri, '--squadre', String(opz.squadre), '--parametri-team', opz.parametriTeam, '--parametri-team-vecchi', opz.parametriTeamVecchi, ...(opz.gemelli ? ['--gemelli'] : []), ...(a0.includes('--nuova') ? ['--nuova', NUOVA] : []),
                ...(opz.personalita ? ['--personalita', opz.personalita] : []), ...(opz.teamUguali ? ['--team-uguali'] : []), ...(opz.cervelloUguale ? ['--cervello-uguale'] : []), ...(opz.senzaTeam ? ['--senza-team'] : []), ...(opz.senzaCervello ? ['--senza-cervello'] : []), ...(opz.ritocchi ? ['--ritocchi', opz.ritocchi] : [])]);
            figlio.on('message', m => out.push(m));
            figlio.on('error', no);
            figlio.on('exit', c => { if (c) return no(new Error(`lavoratore ${k} uscito con ${c}`)); if (++finiti === opz.lavoratori) ok(out); });
        }
    });
    const v = risultati.map(r => r.esito), media = v.reduce((t, x) => t + x, 0) / v.length;
    const dev = Math.sqrt(v.reduce((t, x) => t + (x - media) ** 2, 0) / Math.max(1, v.length - 1)), mez = 1.96 * dev / Math.sqrt(v.length);
    const errori = risultati.reduce((t, r) => t + r.errori, 0), turni = risultati.reduce((t, r) => t + r.turni, 0) / risultati.length;
    console.log(`${opz.formato}: CPU nuova contro ${opz.vecchia}${opz.teamUguali ? ' (team uguali)' : ''}${opz.cervelloUguale ? ' (cervello uguale)' : ''}${opz.personalita ? ` · personalità ${opz.personalita}${opz.senzaTeam ? ' (solo cervello)' : opz.senzaCervello ? ' (solo team)' : ''}` : ''}`);
    console.log(`${v.length} coppie: la nuova vince il ${(100 * media).toFixed(1)}%  (95%: ${(100 * (media - mez)).toFixed(1)} … ${(100 * (media + mez)).toFixed(1)})  ·  ${turni.toFixed(1)} turni  ·  scelte rifiutate ${errori}  ·  ${Math.round((Date.now() - inizio) / 1000)} s`);
}

(opz.lavoratore ? lavora() : principale()).catch(e => { console.error(e); process.exit(1); });
