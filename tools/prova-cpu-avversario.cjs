'use strict';
// =====================================================
// PROVA DELLA CPU CHE STUDIA L'AVVERSARIO
//
// Misura se conoscere le abitudini di chi si ha davanti (docs/cpu-avversario.js, usato da docs/cpu-ia.js) fa vincere di più alla CPU, e se non la fa
// peggiorare quando le abitudini sono sbagliate. Non è tra i test (dura minuti): si lancia a mano quando si cambia il modello o le sue manopole.
//
//   node tools/prova-cpu-avversario.cjs [--formato singolo|doppio] [--partite 200] [--bot guardiano|ilaria|pivot|stratega|lega|aggressore]
//                                       [--braccia default,lega,vero,sbagliato] [--lavoratori 4]
//
// Come funziona. L'avversario è un "giocatore con delle abitudini": decide come la CPU di sempre, ma a ogni decisione di ogni suo Pokémon, con le
// probabilità del suo profilo, si para, cambia o usa una mossa di stato (le abitudini dei giocatori della lega, vedi BOT). La CPU gioca contro di lui
// più volte, con gli stessi team e lo stesso seme per ogni "braccio" (cioè cosa sa di lui):
//   default     niente (la CPU di prima: prevede solo l'attacco migliore)
//   lega        la media della lega (e poi impara da lui mentre gioca)
//   vero        le sue abitudini vere (misurate in una serie di prova), imparate e corrette in partita
//   sbagliato   le abitudini di un altro tipo di giocatore (il costo di sbagliare profilo)
// Si confrontano le vittorie di ogni braccio con quelle del braccio "default" (stessi team, stesso seme: differenza a coppie, con l'intervallo al 95%).
// Con 200 partite l'intervallo è di circa ±5 punti: si vedono bene i cambiamenti grandi e i peggioramenti; un guadagno di uno o due punti non si
// distingue dal caso (per quello servono migliaia di partite).
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
        formato: val('formato', 'doppio'), partite: parseInt(val('partite', '200'), 10), bot: val('bot', 'guardiano'),
        braccia: val('braccia', 'default,lega,vero,sbagliato').split(','), lavoratori: parseInt(val('lavoratori', '4'), 10),
        lavoratore: val('lavoratore', ''), profiloVero: val('profilo-vero', '')
    };
}

// ---------------------------------------------------------------------------------
// Un lavoratore: gioca le partite di sua competenza e le scrive al genitore
// ---------------------------------------------------------------------------------
async function lavora(opz) {
    const { caricaRandoms, giocaPartita, creaCasuale } = require(AIUTI);
    const IA = require(path.join(MODULI, 'cpu-ia.js'));
    const K = require(path.join(MODULI, 'cpu-conoscenza.js'));
    const { sim } = await caricaRandoms();
    const f = opz.formato === 'singolo' ? 'gen9randombattle' : 'gen9randomdoublesbattle';
    const abitudini = BOT[opz.bot];
    const profiloVero = opz.profiloVero ? JSON.parse(opz.profiloVero) : null;
    const profili = {
        default: undefined,
        lega: true,
        vero: profiloVero ? { giocatore: { n: 3000, quote: profiloVero }, lega: null } : true,
        sbagliato: { giocatore: { n: 3000, quote: opz.bot === 'aggressore' ? { attacco: 0.5, protezione: 0.3, cambio: 0.1, altro: 0.1 } : { attacco: 0.97, protezione: 0.01, cambio: 0.01, altro: 0.01 } }, lega: null }
    };
    const [k, n] = (opz.lavoratore || '0/1').split('/').map(Number);
    for (let i = k; i < opz.partite; i += n) {
        for (const braccio of opz.braccia) {
            const t1 = sim.Teams.generate(f, { seed: [i * 7 + 1, 3, 5, 7] }), t2 = sim.Teams.generate(f, { seed: [i * 7 + 2, 4, 6, 8] });
            const cpu = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i * 3 + 1), ...(profili[braccio] ? { avversario: profili[braccio] } : {}) });
            const bot = creaGiocatore({ sim, IA, K, lato: 'p2', casuale: creaCasuale(i * 5 + 2), abitudini });
            const e = await giocaPartita({ sim, formato: f, team1: t1, team2: t2, agente1: { tipo: 'cpu', cerebro: cpu }, agente2: { tipo: 'cpu', cerebro: bot },
                casuale: creaCasuale(i * 11 + 9), seme: [i + 1, 7, 11, 13] });
            const visti = cpu.modelloAvversario ? cpu.modelloAvversario() : null;
            process.send({ braccio, i, esito: e.vincitore === 'p1' ? 1 : e.vincitore === 'p2' ? 0 : 0.5, errori: e.errori.length, turni: e.turni, visti: visti && visti.visti });
        }
    }
}

// ---------------------------------------------------------------------------------
// Il genitore: lancia i lavoratori, raccoglie, confronta
// ---------------------------------------------------------------------------------
function eseguiLavoratori(opz, braccia, partite, profiloVero) {
    return new Promise((ok, no) => {
        const risultati = [];
        let finiti = 0;
        for (let k = 0; k < opz.lavoratori; k++) {
            const figlio = fork(__filename, ['--lavoratore', `${k}/${opz.lavoratori}`, '--formato', opz.formato, '--partite', String(partite), '--bot', opz.bot, '--braccia', braccia.join(','),
                ...(profiloVero ? ['--profilo-vero', JSON.stringify(profiloVero)] : [])]);
            figlio.on('message', m => risultati.push(m));
            figlio.on('error', no);
            figlio.on('exit', codice => { if (codice) return no(new Error(`lavoratore ${k} uscito con ${codice}`)); if (++finiti === opz.lavoratori) ok(risultati); });
        }
    });
}

const media = v => v.reduce((t, x) => t + x, 0) / (v.length || 1);
const devSt = v => { const m = media(v); return Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); };
const perc = x => (x * 100).toFixed(1).padStart(5) + '%';

async function principale() {
    const opz = argomenti();
    if (!BOT[opz.bot]) throw new Error(`bot sconosciuto: ${opz.bot} (${Object.keys(BOT).join(', ')})`);
    const inizio = Date.now();
    console.log(`Formato ${opz.formato}, bot "${opz.bot}" (${JSON.stringify(BOT[opz.bot])}), ${opz.partite} partite per braccio, ${opz.lavoratori} lavoratori`);

    // 1) le abitudini vere del bot, misurate: una serie di prova della CPU di prima, che conta cosa fa
    let profiloVero = null;
    if (opz.braccia.includes('vero')) {
        const prova = await eseguiLavoratori({ ...opz }, ['lega'], Math.min(40, Math.max(8, Math.floor(opz.partite / 4))), null);
        const somma = { attacco: 0, protezione: 0, cambio: 0, altro: 0 };
        for (const r of prova) if (r.visti) for (const k of Object.keys(somma)) somma[k] += r.visti[k];
        const n = Object.values(somma).reduce((t, x) => t + x, 0) || 1;
        profiloVero = Object.fromEntries(Object.keys(somma).map(k => [k, somma[k] / n]));
        console.log('Abitudini vere misurate (' + n + ' decisioni):', Object.entries(profiloVero).map(([k, v]) => `${k} ${perc(v)}`).join(', '));
    }

    // 2) le partite
    const risultati = await eseguiLavoratori(opz, opz.braccia, opz.partite, profiloVero);
    const errori = risultati.reduce((t, r) => t + r.errori, 0);
    const per = {};
    for (const r of risultati) (per[r.braccio] = per[r.braccio] || {})[r.i] = r;
    const base = per[opz.braccia[0]] || {};
    console.log(`\nbraccio      partite  vittorie   differenza dal primo (a coppie, intervallo al 95%)   turni medi`);
    for (const b of opz.braccia) {
        const righe = Object.values(per[b] || {});
        const v = righe.map(r => r.esito);
        let diff = '';
        if (b !== opz.braccia[0]) {
            const d = righe.filter(r => base[r.i]).map(r => r.esito - base[r.i].esito);
            const m = media(d), e = 1.96 * devSt(d) / Math.sqrt(d.length);
            diff = `${m >= 0 ? '+' : ''}${(m * 100).toFixed(1)} punti  (${((m - e) * 100).toFixed(1)} … ${((m + e) * 100).toFixed(1)})`;
        }
        console.log(`${b.padEnd(12)} ${String(v.length).padStart(7)}  ${perc(media(v))}   ${diff.padEnd(48)} ${media(righe.map(r => r.turni)).toFixed(1)}`);
    }
    console.log(`\nScelte rifiutate dal simulatore: ${errori}. Tempo: ${Math.round((Date.now() - inizio) / 1000)} s`);
}

if (process.send) {
    const opz = argomenti();
    lavora(opz).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
} else principale().catch(e => { console.error(e); process.exit(1); });
