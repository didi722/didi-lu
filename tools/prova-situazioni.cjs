'use strict';
// =====================================================
// PROVA DELLE SITUAZIONI: LA CPU CHE IMPARA DAI REPLAY
//
// Misura se imparare dai log di una "lega" come cambiano le abitudini nelle varie situazioni (docs/cpu-situazioni.js) fa prevedere meglio l'avversario
// e vincere di più alla CPU. Non è tra i test (dura minuti): si lancia a mano.
//
//   node tools/prova-situazioni.cjs [--formato singolo|doppio] [--corpus 300] [--partite 200] [--lavoratori 4] [--forza 1]
//
// Come funziona. Non ci sono replay veri in questo ambiente, quindi la lega è finta ma ha una regola nota: i suoi giocatori decidono come la CPU di sempre,
// poi a ogni decisione si parano, cambiano o usano una mossa di stato con probabilità che dipendono dalla situazione (SITUAZIONALE: si parano appena
// entrati, cambiano con pochi PS...). Tre fasi:
//   1. corpus      i giocatori della lega giocano tra loro: se ne salvano i log, come i replay del sito;
//   2. apprendimento  da quei log (e solo da quelli) si impara con costruisci(): la prova incrociata dice quanto le situazioni aiutano a prevedere
//                  la scelta di partite che non ha mai visto (log-verosimiglianza media per decisione, con e senza);
//   3. gara        la CPU gioca contro un giocatore della lega con tre cervelli, stessi team e stesso seme: senza modello (default), con le abitudini
//                  medie imparate in partita (lega), e con le regole delle situazioni (situazioni). Differenza a coppie con l'intervallo al 95%.
// Attenzione: il giocatore della gara segue la stessa regola da cui nasce il corpus, quindi è il caso migliore possibile per le situazioni: dice se il
// meccanismo funziona, non quanto vale con giocatori veri (per quello serve il workflow sui replay veri: stampa la stessa prova incrociata).
// =====================================================
const { fork } = require('node:child_process');
const path = require('node:path');

const MODULI = path.join(__dirname, '..', 'docs');
const AIUTI = path.join(__dirname, '..', 'test', 'ayuda-sim.js');

// Le abitudini di base (la media della lega) e quanto cambiano con la situazione: moltiplicatori delle probabilità (poi riportate a somma 1)
const BASE = { protezione: 0.10, cambio: 0.04, altro: 0.13 };
const SITUAZIONALE = {
    primoTurno:    { protezione: 2.5, altro: 2.0 },
    appenaEntrato: { protezione: 3.0 },
    psBassi:       { cambio: 7.0, protezione: 2.0, altro: 1.5 },
    psMedi:        { cambio: 1.8 },
    inSvantaggio:  { protezione: 0.6 },
    inVantaggio:   { protezione: 1.6 },
    soloInCampo:   { protezione: 2.0 },
    conStato:      { cambio: 2.5 },
    finePartita:   { protezione: 1.4 }
};
// i due "caratteri" dei giocatori della lega: stessa regola sulle situazioni, ma uno si para di più e l'altro cambia di più
const CARATTERI = [
    { protezione: 0.14, cambio: 0.03, altro: 0.12 },
    { protezione: 0.07, cambio: 0.07, altro: 0.14 }
];

function argomenti() {
    const a = process.argv.slice(2);
    const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] ? a[i + 1] : predefinito; };
    return {
        formato: val('formato', 'doppio'), corpus: parseInt(val('corpus', '300'), 10), partite: parseInt(val('partite', '200'), 10),
        lavoratori: parseInt(val('lavoratori', '4'), 10), forza: parseFloat(val('forza', '1')),
        lavoratore: val('lavoratore', ''), fase: val('fase', ''), regole: val('regole', '')
    };
}

// Le probabilità di un giocatore della lega in una situazione
function probabilita(carattere, nomiCar, f) {
    const p = { attacco: 1 - carattere.protezione - carattere.cambio - carattere.altro, protezione: carattere.protezione, cambio: carattere.cambio, altro: carattere.altro };
    nomiCar.forEach((nome, j) => {
        if (!f[j]) return;
        const m = SITUAZIONALE[nome] || {};
        for (const k of Object.keys(m)) p[k] *= m[k];
    });
    const s = Object.values(p).reduce((t, x) => t + x, 0);
    for (const k of Object.keys(p)) p[k] /= s;
    return p;
}

// Un giocatore della lega: decide come la CPU di sempre, ma ogni suo Pokémon si para, cambia o usa una mossa di stato come vuole la situazione
function creaGiocatore({ sim, IA, K, Sit, lato, casuale, carattere }) {
    const base = IA.crea({ Dex: sim.Dex, lato, casuale });
    const tracker = Sit.crea();
    const caso = a => a[Math.floor(casuale() * a.length)];
    return {
        osserva: righe => { tracker.righe(righe); base.osserva(righe); },
        scegli(richiesta, opz) {
            const scelta = base.scegli(richiesta, opz);
            if (richiesta.teamPreview || richiesta.forceSwitch || richiesta.wait || !richiesta.active) return scelta;
            const squadra = richiesta.side.pokemon;
            const usati = new Set(scelta.split(', ').filter(x => x.startsWith('switch')).map(x => parseInt(x.split(' ')[1], 10)));
            const doppio = richiesta.active.length > 1;
            return scelta.split(', ').map((parte, slot) => {
                const a = richiesta.active[slot];
                if (!a || parte === 'pass') return parte;
                const f = tracker.contesto(lato + 'ab'[slot]);
                if (!f) return parte;
                const p = probabilita(carattere, Sit.CARATTERISTICHE, f);
                const x = casuale();
                const mosse = a.moves.map((m, j) => ({ m, j })).filter(y => !y.m.disabled && y.m.pp !== 0);
                if (x < p.protezione) {
                    const prot = mosse.filter(y => K.PROTEZIONI.has(y.m.id));
                    return prot.length ? `move ${caso(prot).j + 1}` : parte;
                }
                if (x < p.protezione + p.cambio) {
                    if (a.trapped) return parte;
                    const liberi = squadra.map((q, i) => ({ q, i })).filter(y => !y.q.active && !y.q.condition.endsWith(' fnt') && !usati.has(y.i + 1));
                    if (!liberi.length) return parte;
                    const scelto = caso(liberi);
                    usati.add(scelto.i + 1);
                    return `switch ${scelto.i + 1}`;
                }
                if (x < p.protezione + p.cambio + p.altro) {
                    const stato = mosse.filter(y => {
                        const d = sim.Dex.moves.get(y.m.id);
                        return d.category === 'Status' && !K.PROTEZIONI.has(y.m.id) && (!doppio || ['self', 'allySide', 'foeSide', 'all', 'allyTeam', 'normal', 'adjacentFoe', 'any'].includes(y.m.target));
                    });
                    if (!stato.length) return parte;
                    const { m, j } = caso(stato);
                    return `move ${j + 1}${doppio && ['normal', 'adjacentFoe', 'any'].includes(m.target) ? ` ${1 + Math.floor(casuale() * 2)}` : ''}`;
                }
                return parte;
            }).join(', ');
        }
    };
}

async function lavora(opz) {
    const { caricaRandoms, giocaPartita, creaCasuale } = require(AIUTI);
    const IA = require(path.join(MODULI, 'cpu-ia.js'));
    const K = require(path.join(MODULI, 'cpu-conoscenza.js'));
    const Sit = require(path.join(MODULI, 'cpu-situazioni.js'));
    const { sim } = await caricaRandoms();
    const f = opz.formato === 'singolo' ? 'gen9randombattle' : 'gen9randomdoublesbattle';
    const [k, n] = (opz.lavoratore || '0/1').split('/').map(Number);
    const regole = opz.regole ? JSON.parse(opz.regole) : null;

    if (opz.fase === 'corpus') {
        for (let i = k; i < opz.corpus; i += n) {
            const t1 = sim.Teams.generate(f, { seed: [i * 7 + 101, 3, 5, 7] }), t2 = sim.Teams.generate(f, { seed: [i * 7 + 102, 4, 6, 8] });
            const a = creaGiocatore({ sim, IA, K, Sit, lato: 'p1', casuale: creaCasuale(i * 3 + 501), carattere: CARATTERI[0] });
            const b = creaGiocatore({ sim, IA, K, Sit, lato: 'p2', casuale: creaCasuale(i * 5 + 502), carattere: CARATTERI[1] });
            const e = await giocaPartita({ sim, formato: f, team1: t1, team2: t2, agente1: { tipo: 'cpu', cerebro: a }, agente2: { tipo: 'cpu', cerebro: b },
                casuale: creaCasuale(i * 11 + 509), seme: [i + 101, 7, 11, 13] });
            // come in un replay del sito: i nomi dei giocatori e il log pubblico
            process.send({ tipo: 'set', i, log: ['|player|p1|Ada|1|', '|player|p2|Bruno|2|', ...e.righe.filter(r => !r.startsWith('|player|'))], giocatori: { p1: 'ada', p2: 'bruno' } });
        }
        return;
    }

    // la gara: la CPU contro un giocatore della lega, con tre cervelli
    const profili = {
        default: undefined,
        lega: true,
        situazioni: { giocatore: null, lega: null, situazioni: regole }
    };
    for (let i = k; i < opz.partite; i += n) {
        for (const braccio of ['default', 'lega', 'situazioni']) {
            const t1 = sim.Teams.generate(f, { seed: [i * 7 + 1, 3, 5, 7] }), t2 = sim.Teams.generate(f, { seed: [i * 7 + 2, 4, 6, 8] });
            const parametri = braccio === 'situazioni' ? { pesoSituazioni: opz.forza } : {};
            const cpu = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i * 3 + 1), parametri, ...(profili[braccio] ? { avversario: profili[braccio] } : {}) });
            const avv = creaGiocatore({ sim, IA, K, Sit, lato: 'p2', casuale: creaCasuale(i * 5 + 2), carattere: CARATTERI[i % 2] });
            const e = await giocaPartita({ sim, formato: f, team1: t1, team2: t2, agente1: { tipo: 'cpu', cerebro: cpu }, agente2: { tipo: 'cpu', cerebro: avv },
                casuale: creaCasuale(i * 11 + 9), seme: [i + 1, 7, 11, 13] });
            process.send({ tipo: 'gara', braccio, i, esito: e.vincitore === 'p1' ? 1 : e.vincitore === 'p2' ? 0 : 0.5, errori: e.errori.length, turni: e.turni });
        }
    }
}

function eseguiLavoratori(opz, extra) {
    return new Promise((ok, no) => {
        const risultati = [];
        let finiti = 0;
        for (let k = 0; k < opz.lavoratori; k++) {
            const figlio = fork(__filename, ['--lavoratore', `${k}/${opz.lavoratori}`, '--formato', opz.formato, '--corpus', String(opz.corpus), '--partite', String(opz.partite), '--forza', String(opz.forza), ...extra]);
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
    const Sit = require(path.join(MODULI, 'cpu-situazioni.js'));
    const inizio = Date.now();
    console.log(`Formato ${opz.formato}: corpus di ${opz.corpus} set, gara di ${opz.partite} partite per cervello, ${opz.lavoratori} lavoratori`);

    // 1) il corpus
    const corpus = (await eseguiLavoratori(opz, ['--fase', 'corpus'])).filter(m => m.tipo === 'set').sort((a, b) => a.i - b.i);
    const decisioni = corpus.reduce((t, s) => t + Sit.decisioni(s.log).length, 0);
    console.log(`Corpus: ${corpus.length} set, ${decisioni} decisioni lette dai log (${Math.round((Date.now() - inizio) / 1000)} s)`);

    // 2) l'apprendimento e la prova incrociata
    const { regole, validazione } = Sit.costruisci(corpus.map(s => ({ id: 'set' + s.i, log: s.log, giocatori: s.giocatori })));
    for (const [chiave, v] of Object.entries(validazione)) {
        if (v.senza == null) { console.log(`  ${chiave}: ${v.decisioni} decisioni in ${v.set} set — ${v.esito}`); continue; }
        console.log(`  ${chiave}: ${v.decisioni} decisioni in ${v.set} set — log-verosimiglianza per decisione ${v.senza.toFixed(4)} → ${v.con.toFixed(4)} (${v.guadagno >= 0 ? '+' : ''}${v.guadagno.toFixed(4)}; ` +
            `migliore in ${v.gruppiMigliori} gruppi su ${v.gruppi}) — ${v.esito}`);
    }
    const chiave = opz.formato === 'singolo' ? 'singoli' : 'doppi';
    const imparate = regole[chiave];
    if (imparate) {
        console.log('  pesi imparati (log dei moltiplicatori; veri tra parentesi):');
        for (const k of ['protezione', 'cambio', 'altro']) {
            console.log('   ' + k.padEnd(11) + Sit.CARATTERISTICHE.map(c => `${c}=${imparate.pesi[k][c].toFixed(2)}(${SITUAZIONALE[c] && SITUAZIONALE[c][k] ? Math.log(SITUAZIONALE[c][k]).toFixed(2) : '0'})`).join('  '));
        }
    }
    if (!imparate) { console.log('Le regole non sono state pubblicate: niente gara.'); return; }

    // 3) la gara
    const risultati = (await eseguiLavoratori(opz, ['--fase', 'gara', '--regole', JSON.stringify(regole)])).filter(m => m.tipo === 'gara');
    const per = {};
    for (const r of risultati) (per[r.braccio] = per[r.braccio] || {})[r.i] = r;
    const base = per.default || {};
    console.log(`\ncervello     partite  vittorie   differenza da "default" (a coppie, intervallo al 95%)   turni medi`);
    for (const b of ['default', 'lega', 'situazioni']) {
        const righe = Object.values(per[b] || {});
        let diff = '';
        if (b !== 'default') {
            const d = righe.filter(r => base[r.i]).map(r => r.esito - base[r.i].esito);
            const m = media(d), e = 1.96 * devSt(d) / Math.sqrt(d.length);
            diff = `${m >= 0 ? '+' : ''}${(m * 100).toFixed(1)} punti  (${((m - e) * 100).toFixed(1)} … ${((m + e) * 100).toFixed(1)})`;
        }
        console.log(`${b.padEnd(12)} ${String(righe.length).padStart(7)}  ${perc(media(righe.map(r => r.esito)))}   ${diff.padEnd(52)} ${media(righe.map(r => r.turni)).toFixed(1)}`);
    }
    // situazioni contro lega: l'unico confronto che dice se le regole aggiungono qualcosa all'adattamento in partita
    const sl = Object.values(per.situazioni || {}).filter(r => (per.lega || {})[r.i]).map(r => r.esito - per.lega[r.i].esito);
    if (sl.length) { const m = media(sl), e = 1.96 * devSt(sl) / Math.sqrt(sl.length); console.log(`situazioni contro lega: ${m >= 0 ? '+' : ''}${(m * 100).toFixed(1)} punti  (${((m - e) * 100).toFixed(1)} … ${((m + e) * 100).toFixed(1)})`); }
    console.log(`\nScelte rifiutate dal simulatore: ${risultati.reduce((t, r) => t + r.errori, 0)}. Tempo: ${Math.round((Date.now() - inizio) / 1000)} s`);
}

if (process.send) {
    lavora(argomenti()).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
} else principale().catch(e => { console.error(e); process.exit(1); });
