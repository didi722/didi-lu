'use strict';
// =====================================================
// MESSA A PUNTO DELLA CPU CONTRO SE STESSA
//
// Le "manopole" di docs/cpu-ia.js (PARAMETRI_BASE) sono state scelte a mano. Qui si provano: una CPU con una manopola cambiata (la variante) gioca contro la CPU di
// adesso (la base), sugli stessi team, e si conta chi vince. Non è tra i test (dura ore): si lancia a mano.
//
//   node tools/tara-cpu.cjs --formato singolo|doppio --parametri a,b,c            prova ogni manopola a metà e a una volta e mezza (per le manopole a zero: 0,15 e 0,3)
//   node tools/tara-cpu.cjs --formato doppio --varianti "aggressivitaDoppio=0.15 | costoCambio=0.2,costoProtezione=0.05"     varianti scritte a mano (separate da |)
//   altre opzioni: --squadre vgc (team VGC composti dalla CPU, con anteprima: serve per le manopole delle aperture; senza, team casuali)  --coppie 100 (quante coppie di partite per variante)  --da 0 (da quale coppia: coppie diverse = partite nuove)  --lavoratori 4
//                  --bot guardiano|ilaria|pivot|stratega|lega|aggressore (la base gioca con le abitudini di quel giocatore, vedi bot-abitudini.cjs: serve a
//                  controllare che una modifica non funzioni solo contro una CPU uguale a sé)
//
// Come si misura. Una coppia sono due partite con gli stessi due team: nella prima la variante è p1 col team A contro la base p2 col team B; nella seconda
// la variante è p2 col team B contro la base p1 col team A. Il lato e la forza dei team si compensano. Il risultato della coppia è la media delle due partite
// (0, 0,5 o 1). La variante "nullo" (nessuna modifica) è il controllo: deve stare a 50%. Le stesse coppie si usano per tutte le varianti.
// Con 100 coppie l'intervallo al 95% è di circa ±7 punti: bastano a scartare le modifiche che peggiorano molto, non a vedere un guadagno di due punti
// (servono un migliaio di coppie). Si procede a gradini: poche coppie per tutte, di più per le migliori, moltissime per quelle da adottare.
// =====================================================
const { fork } = require('node:child_process');
const path = require('node:path');

const MODULI = path.join(__dirname, '..', 'docs');
const AIUTI = path.join(__dirname, '..', 'test', 'ayuda-sim.js');
const { BOT, creaGiocatore } = require('./bot-abitudini.cjs');

function argomenti() {
    const a = process.argv.slice(2);
    const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] ? a[i + 1] : predefinito; };
    return {
        formato: val('formato', 'doppio'), coppie: parseInt(val('coppie', '100'), 10), da: parseInt(val('da', '0'), 10), lavoratori: parseInt(val('lavoratori', '4'), 10),
        parametri: val('parametri', ''), varianti: val('varianti', ''), bot: val('bot', ''), squadre: val('squadre', ''), lavoratore: val('lavoratore', ''), elenco: val('elenco', '')
    };
}

// "a=1,b=2 | c=3" -> [{ nome: 'a=1,b=2', par: { a: 1, b: 2 } }, ...]
function leggiVarianti(testo) {
    return testo.split('|').map(x => x.trim()).filter(Boolean).map(x => {
        if (x === 'nullo') return { nome: 'nullo', par: {} };
        const par = {};
        for (const kv of x.split(',')) {
            const [k, v] = kv.split('=').map(y => y.trim());
            if (!k || !Number.isFinite(parseFloat(v))) throw new Error(`variante non valida: ${x}`);
            par[k] = parseFloat(v);
        }
        return { nome: x.replace(/\s+/g, ''), par };
    });
}

function variantiDa(opz) {
    const { PARAMETRI_BASE } = require(path.join(MODULI, 'cpu-ia.js'));
    const out = [{ nome: 'nullo', par: {} }];
    for (const nome of opz.parametri.split(',').map(x => x.trim()).filter(Boolean)) {
        if (!(nome in PARAMETRI_BASE)) throw new Error(`manopola sconosciuta: ${nome}`);
        const v = PARAMETRI_BASE[nome];
        const valori = v === 0 ? [0.15, 0.3] : [v * 0.5, v * 1.5];
        for (const x of valori) out.push({ nome: `${nome}=${Math.round(x * 1000) / 1000}`, par: { [nome]: x } });
    }
    if (opz.varianti) for (const x of leggiVarianti(opz.varianti)) if (!out.some(o => o.nome === x.nome)) out.push(x);
    return out;
}

// ---------------------------------------------------------------------------------
// Un lavoratore: gioca le coppie che gli toccano e le scrive al genitore
// ---------------------------------------------------------------------------------
async function lavora(opz) {
    const { caricaRandoms, giocaPartita, creaCasuale } = require(AIUTI);
    const IA = require(path.join(MODULI, 'cpu-ia.js'));
    const K = require(path.join(MODULI, 'cpu-conoscenza.js'));
    const { sim } = await caricaRandoms();
    let f = opz.formato === 'singolo' ? 'gen9randombattle' : 'gen9randomdoublesbattle';
    // team VGC composti dalla CPU (gli stessi delle palestre e delle sfide): sempre gli stessi 36 (seme fisso), uno diverso per coppia
    let squadre = null;
    if (opz.squadre === 'vgc') {
        const fs = require('node:fs');
        const T = require(path.join(MODULI, 'team-cpu.js'));
        const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
        const reg = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
        const leggi = q => JSON.parse(fs.readFileSync(path.join(MODULI, q), 'utf8'));
        squadre = (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: reg, caricaJson: async q => leggi(q), quanti: 36, seme: 'tara' })).team.map(t => t.testo);
        f = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
    }
    const varianti = JSON.parse(opz.elenco);
    const abitudini = opz.bot ? BOT[opz.bot] : null;
    const [k, n] = (opz.lavoratore || '0/1').split('/').map(Number);
    let compito = 0;
    for (let p = opz.da; p < opz.da + opz.coppie; p++) {
        const tA = squadre ? squadre[(p * 7 + 3) % squadre.length] : sim.Teams.generate(f, { seed: [p * 7 + 31, 3, 5, 7] });
        const tB = squadre ? squadre[(p * 11 + 5 + Math.floor(p / squadre.length)) % squadre.length] : sim.Teams.generate(f, { seed: [p * 7 + 32, 4, 6, 8] });
        for (const v of varianti) {
            if (compito++ % n !== k) continue;
            const gioca = async (latoVar, seme) => {
                const latoBase = latoVar === 'p1' ? 'p2' : 'p1';
                const cerv = IA.crea({ Dex: sim.Dex, lato: latoVar, casuale: creaCasuale(p * 13 + seme), parametri: v.par });
                const baseCerv = abitudini
                    ? creaGiocatore({ sim, IA, K, lato: latoBase, casuale: creaCasuale(p * 17 + seme), abitudini })
                    : IA.crea({ Dex: sim.Dex, lato: latoBase, casuale: creaCasuale(p * 17 + seme) });
                // la variante ha sempre il team del suo lato: p1 col team A, p2 col team B (così lato e team si compensano tra le due partite)
                const e = await giocaPartita({
                    sim, formato: f, team1: tA, team2: tB,
                    agente1: { tipo: 'cpu', cerebro: latoVar === 'p1' ? cerv : baseCerv }, agente2: { tipo: 'cpu', cerebro: latoVar === 'p1' ? baseCerv : cerv },
                    casuale: creaCasuale(p * 11 + seme + 5), seme: [p + 1, seme, 11, 13]
                });
                const mio = e.vincitore === latoVar ? 1 : e.vincitore === latoBase ? 0 : 0.5;
                return { mio, errori: e.errori.length, turni: e.turni };
            };
            const a = await gioca('p1', 1), b = await gioca('p2', 2);
            process.send({ variante: v.nome, p, esito: (a.mio + b.mio) / 2, errori: a.errori + b.errori, turni: (a.turni + b.turni) / 2 });
        }
    }
}

function eseguiLavoratori(opz, varianti) {
    return new Promise((ok, no) => {
        const risultati = [];
        let finiti = 0;
        for (let k = 0; k < opz.lavoratori; k++) {
            const figlio = fork(__filename, ['--lavoratore', `${k}/${opz.lavoratori}`, '--formato', opz.formato, '--coppie', String(opz.coppie), '--da', String(opz.da),
                '--elenco', JSON.stringify(varianti), ...(opz.bot ? ['--bot', opz.bot] : []), ...(opz.squadre ? ['--squadre', opz.squadre] : [])]);
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
    const varianti = variantiDa(opz);
    if (varianti.length < 2) throw new Error('niente da provare: usa --parametri o --varianti');
    const inizio = Date.now();
    console.log(`Formato ${opz.formato}${opz.bot ? `, la base gioca come "${opz.bot}"` : ''}: ${varianti.length} varianti, ${opz.coppie} coppie ciascuna (da ${opz.da}), ${opz.lavoratori} lavoratori`);
    const risultati = await eseguiLavoratori(opz, varianti);
    const per = {};
    for (const r of risultati) (per[r.variante] = per[r.variante] || []).push(r);
    console.log(`\nvariante                               coppie  vittorie della variante   (intervallo al 95%)   turni`);
    const righe = varianti.map(v => {
        const r = per[v.nome] || [];
        const e = r.map(x => x.esito);
        const m = media(e), ic = 1.96 * devSt(e) / Math.sqrt(e.length || 1);
        return { nome: v.nome, n: e.length, m, ic, turni: media(r.map(x => x.turni)), errori: r.reduce((t, x) => t + x.errori, 0) };
    });
    for (const r of righe.sort((a, b) => b.m - a.m)) {
        const segno = r.m - r.ic > 0.5 ? ' ▲' : r.m + r.ic < 0.5 ? ' ▼' : '';
        console.log(`${r.nome.padEnd(38)} ${String(r.n).padStart(6)}  ${(r.m * 100).toFixed(1).padStart(10)}%   (${((r.m - r.ic) * 100).toFixed(1)} … ${((r.m + r.ic) * 100).toFixed(1)})${segno}  ${r.turni.toFixed(1)}`);
    }
    console.log(`\nScelte rifiutate dal simulatore: ${righe.reduce((t, r) => t + r.errori, 0)}. Tempo: ${Math.round((Date.now() - inizio) / 1000)} s`);
}

if (process.send) {
    lavora(argomenti()).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
} else principale().catch(e => { console.error(e); process.exit(1); });
