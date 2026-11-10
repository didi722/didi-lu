'use strict';
// =====================================================
// PROVA DELLA MEMORIA DELLA SERIE: la CPU migliora partita dopo partita contro lo stesso team?
//
// Chi prova un team contro la CPU e rigioca (rivincita, "Another random CPU team") ha sempre lo stesso team, e la CPU si ricorda come l'ha giocato
// (docs/cpu-memoria.js, opzione `memoria` di docs/cpu-ia.js). Qui un "giocatore abitudinario" gioca una serie di partite con lo stesso team contro una CPU
// con un team diverso a ogni partita; la stessa serie la gioca una CPU senza memoria e una CPU con la memoria (che si porta dietro quello che ha visto).
// Le due CPU hanno gli stessi team e gli stessi avversari: si confronta la percentuale di vittorie della CPU alla partita 1, 2, 3...
//
// Il giocatore abitudinario non è una persona vera: ha, per ogni suo Pokémon, un attacco preferito che gioca più spesso del resto (e un'apertura per il primo turno
// in campo: Fake Out, Tailwind, una Protezione...), e porta e apre quasi sempre allo stesso modo. Serve a controllare che la memoria impari ciò che si ripete, non a dire quanto vale contro le persone.
//
//   node tools/prova-memoria.cjs [--serie 60] [--partite 6] [--costanza 0.5] [--lavoratori 4] [--parametri '{"memoriaPesoMosse":1}'] [--abitudini 0|1]
//        --costanza     quanto il giocatore segue le sue abitudini (0 = gioca come la CPU, 1 = sempre le sue mosse preferite)
//        --parametri    parametri della CPU con memoria (quelli di PARAMETRI_BASE)
//        --abitudini 0  il giocatore NON ha abitudini (gioca come la CPU): la memoria non deve peggiorare niente
//        --contro       'abitudinario' (di base), 'cpu' (un'altra CPU, senza abitudini sue)
// =====================================================
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MODULI = path.join(__dirname, '..', 'docs');
// le mosse con cui si apre di solito una partita
const APERTURE = new Set(['fakeout', 'tailwind', 'trickroom', 'followme', 'ragepowder', 'helpinghand', 'protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'icywind', 'reflect', 'lightscreen', 'auroraveil']);
const AIUTI = path.join(__dirname, '..', 'test', 'ayuda-sim.js');

function argomenti() {
    const a = process.argv.slice(2);
    const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] ? a[i + 1] : predefinito; };
    return {
        serie: parseInt(val('serie', '60'), 10), partite: parseInt(val('partite', '6'), 10), costanza: parseFloat(val('costanza', '0.5')),
        lavoratori: parseInt(val('lavoratori', '4'), 10), parametri: val('parametri', '{}'), abitudini: val('abitudini', '1') !== '0',
        lavoratore: val('lavoratore', ''), da: parseInt(val('da', '0'), 10)
    };
}

// un numero stabile da un testo (per scegliere la mossa preferita di un Pokémon senza tirare a caso ogni volta)
function hash(testo) { let h = 2166136261; for (const c of String(testo)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------------------------------------------------------------------------------
// Il giocatore abitudinario
// ---------------------------------------------------------------------------------
function creaAbitudinario({ sim, IA, K, lato, casuale, seme, costanza }) {
    const base = IA.crea({ Dex: sim.Dex, lato, casuale });
    const ordineFisso = specie => hash(seme + '|ordine|' + specie);
    const preferite = (specie, nomi) => nomi.slice().sort((x, y) => hash(seme + '|' + specie + '|' + x) - hash(seme + '|' + specie + '|' + y));
    const inCampo = [null, null, null];
    const turniInCampo = [0, 0, 0];
    return {
        osserva: righe => base.osserva(righe),
        scegli(richiesta, opz) {
            const scelta = base.scegli(richiesta, opz);
            if (opz && opz.errori > 0) return scelta;                      // il simulatore ha rifiutato la scelta di prima: si gioca come la CPU
            if (richiesta.teamPreview) {
                // porta e apre quasi sempre allo stesso modo: i sei in un ordine fisso
                if (casuale() >= costanza) return scelta;
                const n = richiesta.side.pokemon.length;
                const quanti = Math.min(richiesta.maxChosenTeamSize || n, n);
                const ordine = richiesta.side.pokemon.map((p, i) => ({ i: i + 1, k: ordineFisso(String(p.details).split(',')[0]) })).sort((x, y) => x.k - y.k).slice(0, quanti);
                return 'team ' + ordine.map(x => x.i).join('');
            }
            if (richiesta.forceSwitch || richiesta.wait || !richiesta.active) return scelta;
            const squadra = richiesta.side.pokemon;
            return scelta.split(', ').map((parte, slot) => {
                const a = richiesta.active[slot];
                if (!a || parte === 'pass') return parte;
                const specie = String(squadra[slot].details).split(',')[0];
                if (inCampo[slot] !== specie) { inCampo[slot] = specie; turniInCampo[slot] = 0; } else turniInCampo[slot]++;
                const primo = turniInCampo[slot] === 0;
                if (parte.startsWith('switch')) return parte;                       // i cambi decisi dalla CPU restano
                const usabili = a.moves.map((m, j) => ({ m, j })).filter(y => !y.m.disabled && y.m.pp !== 0);
                if (!usabili.length) return parte;
                const dm = y => sim.Dex.moves.get(y.m.id);
                const attacchi = usabili.filter(y => dm(y).category !== 'Status' && dm(y).basePower >= 50).map(y => y.m.id);
                const apertura = usabili.filter(y => APERTURE.has(y.m.id)).map(y => y.m.id);
                const favoriteAttacchi = preferite(specie, attacchi);
                // al primo turno in campo: la sua apertura (Fake Out, Tailwind, una Protezione...) se ne ha una, altrimenti il suo attacco preferito
                const aperture = preferite(specie + '|1', apertura.length ? apertura : attacchi);
                // dopo: l'attacco preferito, ogni tanto il secondo
                const x = casuale();
                let scelta2 = null;
                if (primo && x < costanza) scelta2 = aperture[0];
                else if (!primo && x < costanza * 0.6) scelta2 = favoriteAttacchi[0];
                else if (!primo && x < costanza * 0.85) scelta2 = favoriteAttacchi[1] || favoriteAttacchi[0];
                if (!scelta2) return parte;
                const y = usabili.find(q => q.m.id === scelta2);
                if (!y) return parte;
                const d = sim.Dex.moves.get(y.m.id);
                const doppio = richiesta.active.length > 1;
                let bers = '';
                if (doppio) {
                    if (['normal', 'adjacentFoe', 'any'].includes(d.target)) bers = ` ${1 + Math.floor(casuale() * 2)}`;
                    else if (d.target === 'adjacentAlly') bers = ` ${-(slot === 0 ? 2 : 1)}`;
                }
                return `move ${y.j + 1}${bers}`;
            }).join(', ');
        }
    };
}

// ---------------------------------------------------------------------------------
// La CPU "osservata": per ogni mossa che l'avversario usa davvero, quanta probabilità le aveva dato prima la CPU (le sue previsioni del turno)
// ---------------------------------------------------------------------------------
function osservaPrevisioni(cpu, latoCpu) {
    const latoAvv = latoCpu === 'p1' ? 'p2' : 'p1';
    const st = { n: 0, p: 0, top: 0, nAtt: 0, pAtt: 0, topAtt: 0 };
    let pendente = null;
    return {
        st,
        memoriaDellaPartita: () => cpu.memoriaDellaPartita(),
        scegli(richiesta, opz) {
            const x = cpu.scegli(richiesta, opz);
            const alt = cpu.ultimoStato && cpu.ultimoStato.alternative;
            if (alt && !richiesta.teamPreview && !richiesta.forceSwitch && !richiesta.wait) pendente = alt;
            return x;
        },
        osserva(righe) {
            for (const r of righe) {
                if (r.startsWith('|turn|')) pendente = null;
                const m = pendente && /^\|move\|(p[12])([ab]): [^|]*\|([^|]*)\|/.exec(r);
                if (m && m[1] === latoAvv && !/\[from\]/.test(r)) {
                    const slot = m[2] === 'b' ? 1 : 0, mossa = m[3].toLowerCase().replace(/[^a-z0-9]/g, '');
                    let p = 0, miglioreM = null, miglioreP = -1;
                    const per = {};
                    for (const sc of pendente) for (const a of sc.azioni) {
                        if (a.lato !== 'avv' || a.slot !== slot || a.tipo !== 'mossa' || !a.mossa) continue;
                        per[a.mossa.id] = (per[a.mossa.id] || 0) + sc.peso;
                    }
                    for (const [k, v] of Object.entries(per)) { if (v > miglioreP) { miglioreP = v; miglioreM = k; } if (k === mossa) p = v; }
                    const att = sim_.Dex.moves.get(mossa).category !== 'Status';
                    st.n++; st.p += p; if (miglioreM === mossa) st.top++;
                    if (att) { st.nAtt++; st.pAtt += p; if (miglioreM === mossa) st.topAtt++; }
                }
            }
            cpu.osserva(righe);
        }
    };
}
let sim_ = null;

// ---------------------------------------------------------------------------------
// Un lavoratore: gioca le serie che gli toccano
// ---------------------------------------------------------------------------------
async function lavora(opz) {
    const { caricaRandoms, giocaPartita, creaCasuale } = require(AIUTI);
    const IA = require(path.join(MODULI, 'cpu-ia.js'));
    const K = require(path.join(MODULI, 'cpu-conoscenza.js'));
    const Mem = require(path.join(MODULI, 'cpu-memoria.js'));
    const T = require(path.join(MODULI, 'team-cpu.js'));
    const { sim } = await caricaRandoms();
    sim_ = sim;
    const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
    const reg = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    const leggi = q => JSON.parse(fs.readFileSync(path.join(MODULI, q), 'utf8'));
    const squadre = (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: reg, caricaJson: async q => leggi(q), quanti: 60, seme: 'memoria' })).team.map(t => t.testo);
    const formato = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
    const parametri = JSON.parse(opz.parametri || '{}');
    const [k, n] = (opz.lavoratore || '0/1').split('/').map(Number);

    for (let s = opz.da; s < opz.da + opz.serie; s++) {
        if (s % n !== k) continue;
        const teamGiocatore = squadre[(s * 5 + 1) % squadre.length];
        for (const variante of ['senza', 'con']) {
            let memoria = null;
            for (let g = 0; g < opz.partite; g++) {
                const teamCpu = squadre[(s * 7 + g * 11 + 20) % squadre.length];
                const latoCpu = g % 2 === 0 ? 'p2' : 'p1', latoGio = latoCpu === 'p2' ? 'p1' : 'p2';
                const semeGioco = s * 1000 + g * 10;
                const cervello = IA.crea({ Dex: sim.Dex, lato: latoCpu, casuale: creaCasuale(semeGioco + 1), avversario: true, debug: true, parametri: variante === 'con' ? parametri : {}, memoria: variante === 'con' ? memoria : null });
                const cpu = osservaPrevisioni(cervello, latoCpu);
                const giocatore = opz.abitudini
                    ? creaAbitudinario({ sim, IA, K, lato: latoGio, casuale: creaCasuale(semeGioco + 2), seme: 'serie' + s, costanza: opz.costanza })
                    : IA.crea({ Dex: sim.Dex, lato: latoGio, casuale: creaCasuale(semeGioco + 2) });
                const e = await giocaPartita({
                    sim, formato, team1: latoCpu === 'p1' ? teamCpu : teamGiocatore, team2: latoCpu === 'p1' ? teamGiocatore : teamCpu,
                    agente1: { tipo: 'cpu', cerebro: latoCpu === 'p1' ? cpu : giocatore }, agente2: { tipo: 'cpu', cerebro: latoCpu === 'p1' ? giocatore : cpu },
                    casuale: creaCasuale(semeGioco + 3), seme: [s + 1, g + 1, 11, 13]
                });
                const mio = e.vincitore === latoCpu ? 1 : e.vincitore === latoGio ? 0 : 0.5;
                if (variante === 'con') memoria = Mem.fondi(memoria, cpu.memoriaDellaPartita());
                process.send({ serie: s, partita: g, variante, esito: mio, turni: e.turni, errori: e.errori.length, prev: cpu.st });
            }
        }
    }
}

function eseguiLavoratori(opz) {
    return new Promise((ok, no) => {
        const risultati = [];
        let finiti = 0;
        for (let k = 0; k < opz.lavoratori; k++) {
            const figlio = fork(__filename, ['--lavoratore', `${k}/${opz.lavoratori}`, '--serie', String(opz.serie), '--partite', String(opz.partite), '--costanza', String(opz.costanza),
                '--parametri', opz.parametri, '--abitudini', opz.abitudini ? '1' : '0', '--da', String(opz.da)]);
            figlio.on('message', m => risultati.push(m));
            figlio.on('error', no);
            figlio.on('exit', codice => { if (codice) return no(new Error(`lavoratore ${k} uscito con ${codice}`)); if (++finiti === opz.lavoratori) ok(risultati); });
        }
    });
}

const media = v => v.reduce((t, x) => t + x, 0) / (v.length || 1);
const devSt = v => { const m = media(v); return Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); };

async function principale() {
    const opz = argomenti();
    const inizio = Date.now();
    console.log(`Serie ${opz.serie} da ${opz.partite} partite, giocatore ${opz.abitudini ? `abitudinario (costanza ${opz.costanza})` : 'senza abitudini (come la CPU)'}, parametri ${opz.parametri}`);
    const r = await eseguiLavoratori(opz);
    // per ogni serie e partita: la differenza tra la CPU con memoria e quella senza (stessi team, stessi avversari)
    const per = {};
    for (const x of r) { ((per[x.serie] = per[x.serie] || {})[x.partita] = per[x.serie][x.partita] || {})[x.variante] = x; }
    console.log('\npartita   senza memoria   con memoria   differenza (intervallo al 95%)');
    const tutte = [];
    for (let g = 0; g < opz.partite; g++) {
        const senza = [], con = [], diff = [];
        for (const s of Object.keys(per)) { const e = per[s][g]; if (e && e.senza && e.con) { senza.push(e.senza.esito); con.push(e.con.esito); diff.push(e.con.esito - e.senza.esito); } }
        const d = media(diff), ic = 1.96 * devSt(diff) / Math.sqrt(diff.length || 1);
        if (g >= 2) tutte.push(...diff);
        console.log(`${String(g + 1).padStart(4)}      ${(media(senza) * 100).toFixed(1).padStart(8)}%     ${(media(con) * 100).toFixed(1).padStart(8)}%    ${(d * 100 >= 0 ? '+' : '') + (d * 100).toFixed(1)} punti  (${(100 * (d - ic)).toFixed(1)} … ${(100 * (d + ic)).toFixed(1)})   n=${diff.length}`);
    }
    console.log('\nprevisioni della CPU sulle mosse vere dell\'avversario (probabilità data alla mossa che ha usato / quante volte era la più probabile)');
    console.log('partita   senza memoria                 con memoria                   (tutte le mosse | solo attacchi)');
    for (let g = 0; g < opz.partite; g++) {
        const somma = v => { const o = { n: 0, p: 0, top: 0, nAtt: 0, pAtt: 0, topAtt: 0 }; for (const x of r.filter(y => y.partita === g && y.variante === v)) for (const k of Object.keys(o)) o[k] += x.prev[k]; return o; };
        const f = o => `${(100 * o.p / (o.n || 1)).toFixed(1).padStart(5)}% / ${(100 * o.top / (o.n || 1)).toFixed(1).padStart(5)}%  |  ${(100 * o.pAtt / (o.nAtt || 1)).toFixed(1).padStart(5)}% / ${(100 * o.topAtt / (o.nAtt || 1)).toFixed(1).padStart(5)}%`;
        console.log(`${String(g + 1).padStart(4)}      ${f(somma('senza'))}      ${f(somma('con'))}`);
    }
    if (tutte.length) {
        const d = media(tutte), ic = 1.96 * devSt(tutte) / Math.sqrt(tutte.length);
        console.log(`\nDalla terza partita in poi: ${(d * 100 >= 0 ? '+' : '') + (d * 100).toFixed(1)} punti per partita (${(100 * (d - ic)).toFixed(1)} … ${(100 * (d + ic)).toFixed(1)}), ${tutte.length} confronti`);
    }
    console.log(`Scelte rifiutate dal simulatore: ${r.reduce((t, x) => t + x.errori, 0)}. Tempo: ${Math.round((Date.now() - inizio) / 1000)} s`);
}

if (process.send) lavora(argomenti()).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
else principale().catch(e => { console.error(e); process.exit(1); });
