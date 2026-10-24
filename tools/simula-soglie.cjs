'use strict';
// =====================================================
// SIMULAZIONE DELLE SOGLIE DI BADGE, FIOCCHI E TITOLI
//
// Simula carriere intere di una lega di 5 giocatori (forza diversa) su tante stagioni ufficiali e dice, per ogni statistica che ha una soglia,
// quanto vale dopo 1, 2, 4... stagioni per un giocatore di ogni livello. Serve a scegliere i numeri di CATALOGO (badge-allenatore.js, badge-team.js,
// fiocchi.js, titoli.js) e a rifarli se la struttura delle stagioni cambia.
//
//   node tools/simula-soglie.cjs [carriere] [stagioni]       (predefinito: 150 carriere da 32 stagioni; per un'occhiata veloce: 40 24)
//
// IL MODELLO (tutto nelle costanti qui sotto, si cambia lì):
//   - stagioni ufficiali che si ripetono a ciclo: League, League, Monoformat, Randomize. Le coppie (League+Monoformat, League+Randomize) si giocano in
//     contemporanea: i loro showdown si mescolano, quindi anche le serie si mescolano tra stagioni.
//   - League: 3 formati (2-4) e da 1 a 5 showdown per formato; Monoformat: 1 formato e 2-4 showdown; Randomize: 1 formato Random e 2-3 showdown
//     (conta solo per l'allenatore: niente team, Pokémon, specie, titoli).
//   - ogni coppia di giocatori gioca (formati x showdown per formato) showdown da 3 match da 3 set (si giocano sempre tutti i set).
//   - la forza è un Elo: un set si vince con probabilità logistica sulla differenza. Chi vince un set fa 4 KO e perde 0-3 Pokémon; chi perde fa 0-3 KO:
//     le frequenze vengono dalla stagione reale (s0): 10% di set vinti senza perdere nessuno, 24% vinti con un solo Pokémon rimasto.
//   - un team gioca un formato e riappare con il suo nome quando il formato torna (70% delle volte che il giocatore lo gioca di nuovo); 6 Pokémon,
//     ogni set ne scendono 4 (i 4 titolari quasi sempre, gli altri due poco). I formati non si ripetono per 3 stagioni di fila.
//   - specie e tipi: un universo di 300 specie con 1 o 2 tipi; ognuno ha uno stile ("casual" o "dedicato": più tipi/specie preferiti).
//   - il vincitore di una stagione è chi ha più punti (2 per match vinto, poi set vinti).
// =====================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CARRIERE = +(process.argv[2] || 150);
const STAGIONI = +(process.argv[3] || 32);
let seme = 20261024;
const rnd = () => (seme = (seme * 1664525 + 1013904223) % 4294967296) / 4294967296;
const scegli = (tabella) => { let x = rnd(), a = 0; for (const [v, p] of tabella) { a += p; if (x < a) return v; } return tabella[tabella.length - 1][0]; };
const mischia = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ----- parametri del modello -----
const FORZE = [90, 40, 0, -40, -90];                 // elite, forte, medio, debole, molto debole (Elo: differenze piccole, una lega di amici)
const NOMI = ['elite', 'forte', 'medio', 'debole', 'molto-deb'];
const N = FORZE.length;
const CICLO = ['league', 'league', 'monoformat', 'random'];
const SD_LEAGUE = [[1, .25], [2, .35], [3, .25], [4, .10], [5, .05]];
const FORMATI_LEAGUE = [[2, .2], [3, .6], [4, .2]];
const SD_MONO = [[2, .4], [3, .4], [4, .2]];
const SD_RANDOM = [[2, .5], [3, .5]];
const POOL_FORMATI = 16, NON_RIPETERE = 3, RIUSO_TEAM = 0.7;
const PESI_CAMPO = [.92, .88, .85, .80, .35, .20];      // chi scende in campo (la somma è 4)
const KO_PERDENTE = [[0, .10], [1, .25], [2, .41], [3, .24]];   // KO che fa chi perde un set
const SPECIE = 300;
const TIPI = 18;
const CHECK = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32].filter(c => c <= STAGIONI);

const specie = Array.from({ length: SPECIE }, (_, i) => {
    const t1 = Math.floor(rnd() * TIPI); let t2 = rnd() < 0.55 ? Math.floor(rnd() * TIPI) : -1; if (t2 === t1) t2 = -1;
    return { id: i, tipi: t2 < 0 ? [t1] : [t1, t2], peso: 1 / Math.pow(i + 1, 0.55) };
});
const pesoTot = specie.reduce((s, x) => s + x.peso, 0);
const sorteggiaSpecie = (esclusi) => { for (;;) { let x = rnd() * pesoTot, i = 0; while (x > specie[i].peso && i < SPECIE - 1) { x -= specie[i].peso; i++; } if (!esclusi.has(i)) return i; } };

const pSet = (a, b) => 1 / (1 + Math.pow(10, -(FORZE[a] - FORZE[b]) / 400));
const STILI = [{ nome: '', tipoPref: 0.20, specPref: 0.25 }, { nome: 'D.', tipoPref: 0.55, specPref: 0.6 }]; // casual, dedicato (D.)

// ----- stato di un giocatore su tutta la carriera -----
function nuovoGiocatore(stile) {
    return {
        stile, tipoPreferito: Math.floor(rnd() * TIPI), specieFirma: sorteggiaSpecie(new Set()),
        stagioniGiocate: 0, stagioniVinte: 0, sdV: 0, matchV: 0, matchG: 0, setV: 0, setG: 0, ko: 0, perfetti: 0, alLimite: 0,
        specie: new Set(), formati: new Map(), win: 0, winMax: 0, clean: 0, cleanMax: 0, sd: 0, sdMax: 0,
        team: new Map(), tuttiTeam: [], tipoUso: Array.from({ length: TIPI }, () => ({ played: 0, won: 0, ko: 0 })),
        specieUso: new Map(), ultimiFormati: []
    };
}
function nuovoTeam(g, formato) {
    const sp = new Set(); const slot = [];
    for (let i = 0; i < 6; i++) {
        let s;
        if (i === 0 && rnd() < g.stile.specPref) s = g.specieFirma;
        else if (rnd() < g.stile.tipoPref) {
            // una specie del tipo preferito
            const cand = specie.filter(x => x.tipi.includes(g.tipoPreferito) && !sp.has(x.id));
            s = cand.length ? cand[Math.floor(rnd() * cand.length)].id : sorteggiaSpecie(sp);
        } else s = sorteggiaSpecie(sp);
        if (sp.has(s)) s = sorteggiaSpecie(sp);
        sp.add(s);
        slot.push({ specie: s, portato: 0, ko: 0, vinti: 0, ultimo: 0, svenuto: 0, win: 0, winMax: 0, clean: 0, cleanMax: 0, stagioni: 0, stagioniVinte: 0 });
    }
    const t = { formato, slot, sdV: 0, sdG: 0, matchV: 0, matchG: 0, perfetti: 0, ko: 0, win: 0, winMax: 0, clean: 0, cleanMax: 0, sd: 0, sdMax: 0, stagioni: 0, stagioniVinte: 0 };
    g.tuttiTeam.push(t);
    return t;
}
const fissaMax = (o, cur, max) => { if (o[cur] > o[max]) o[max] = o[cur]; };

// ----- una stagione -----
function creaStagione(indice, giocatori, storia) {
    const tipo = CICLO[indice % CICLO.length];
    const sdPerFormato = tipo === 'league' ? scegli(SD_LEAGUE) : tipo === 'monoformat' ? scegli(SD_MONO) : scegli(SD_RANDOM);
    const nFormati = tipo === 'league' ? scegli(FORMATI_LEAGUE) : 1;
    const formati = [];
    if (tipo === 'random') formati.push(-1);
    else {
        const vietati = new Set(storia.slice(-NON_RIPETERE).flat());
        const libere = mischia(Array.from({ length: POOL_FORMATI }, (_, i) => i).filter(i => !vietati.has(i)));
        for (let i = 0; i < nFormati; i++) formati.push(libere[i]);
        storia.push(formati);
    }
    // team della stagione per giocatore e formato
    const teams = giocatori.map(g => {
        const m = new Map();
        if (tipo === 'random') return m;
        for (const f of formati) {
            let t = g.team.get(f);
            if (!t || rnd() >= RIUSO_TEAM) { t = nuovoTeam(g, f); g.team.set(f, t); }
            m.set(f, t);
        }
        return m;
    });
    const showdown = [];
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) for (const f of formati) for (let s = 0; s < sdPerFormato; s++) showdown.push({ a, b, f });
    const prima = new Map(); teams.forEach(m => m.forEach(t => t.slot.forEach(sl => prima.set(sl, sl.portato))));
    return { tipo, formati, teams, showdown, prima, punti: Array(N).fill(0), setV: Array(N).fill(0) };
}

function campo(t) {
    // 4 Pokémon di 6, a caso con i pesi
    const idx = [0, 1, 2, 3, 4, 5], scelti = [];
    const pesi = PESI_CAMPO.slice();
    for (let k = 0; k < 4; k++) {
        const tot = idx.reduce((s, i) => s + pesi[i], 0); let x = rnd() * tot, j = 0;
        for (const i of idx) { if (x < pesi[i]) { j = i; break; } x -= pesi[i]; j = i; }
        scelti.push(j); idx.splice(idx.indexOf(j), 1);
    }
    return scelti;
}

function giocaShowdown(sd, stagione, giocatori) {
    const { a, b, f } = sd;
    const ga = giocatori[a], gb = giocatori[b];
    const conTeam = stagione.tipo !== 'random';
    const ta = conTeam ? stagione.teams[a].get(f) : null, tb = conTeam ? stagione.teams[b].get(f) : null;
    let mA = 0, mB = 0;
    const matchRes = [];
    const fieldedMatch = [new Set(), new Set()]; // per chi: slot che scendono nel match
    for (let m = 0; m < 3; m++) {
        let sA = 0, sB = 0;
        const fA = new Set(), fB = new Set();
        for (let s = 0; s < 3; s++) {
            const vinceA = rnd() < pSet(a, b);
            const L = scegli(KO_PERDENTE);
            vinceA ? sA++ : sB++;
            // per ogni lato: KO fatti, Pokémon persi, risultato
            for (const [lato, g, t, vince, fSet] of [[0, ga, ta, vinceA, fA], [1, gb, tb, !vinceA, fB]]) {
                const koFatti = vince ? 4 : L, persi = vince ? L : 4;
                g.setG++; g.ko += koFatti;
                if (vince) { g.setV++; if (L === 0) g.perfetti++; if (L === 3) g.alLimite++; stagione.setV[lato === 0 ? a : b]++; }
                if (!t) continue;
                const sc = campo(t);
                sc.forEach(i => fSet.add(i));
                // KO fatti: ogni KO è di un Pokémon in campo a caso
                const koDi = sc.map(() => 0);
                for (let k = 0; k < koFatti; k++) koDi[Math.floor(rnd() * 4)]++;
                // Pokémon svenuti: `persi` a caso tra i 4
                const svenuti = new Set(mischia([0, 1, 2, 3]).slice(0, persi));
                const tipiSet = new Set();
                sc.forEach((i, k) => {
                    const sl = t.slot[i]; sl.portato++; sl.ko += koDi[k]; if (vince) sl.vinti++;
                    if (svenuti.has(k)) sl.svenuto++;
                    else if (vince && persi === 3) sl.ultimo++;
                    const sp = specie[sl.specie];
                    g.specie.add(sl.specie);
                    for (const tp of sp.tipi) { g.tipoUso[tp].played++; g.tipoUso[tp].ko += koDi[k]; tipiSet.add(tp); }
                    let su = g.specieUso.get(sl.specie); if (!su) g.specieUso.set(sl.specie, su = { played: 0, won: 0, ko: 0 });
                    su.played++; su.ko += koDi[k]; if (vince) su.won++;
                });
                if (vince) { tipiSet.forEach(tp => g.tipoUso[tp].won++); }
                if (vince && L === 0) t.perfetti++;
                t.ko += koFatti;
            }
        }
        const vinceA = sA > sB, pulito = (vinceA ? sB : sA) === 0;
        vinceA ? mA++ : mB++;
        matchRes.push(vinceA);
        for (const [lato, g, t, vince, fSet] of [[0, ga, ta, vinceA, fA], [1, gb, tb, !vinceA, fB]]) {
            g.matchG++; if (vince) g.matchV++;
            const pul = vince && pulito;
            g.win = vince ? g.win + 1 : 0; g.clean = pul ? g.clean + 1 : 0; fissaMax(g, 'win', 'winMax'); fissaMax(g, 'clean', 'cleanMax');
            stagione.punti[lato === 0 ? a : b] += vince ? 2 : 0;
            const mf = g.formati.get(f) || { n: 0, v: 0 }; if (f >= 0) { mf.n++; if (vince) mf.v++; g.formati.set(f, mf); }
            if (!t) continue;
            t.matchG++; if (vince) t.matchV++;
            t.win = vince ? t.win + 1 : 0; t.clean = pul ? t.clean + 1 : 0; fissaMax(t, 'win', 'winMax'); fissaMax(t, 'clean', 'cleanMax');
            fSet.forEach(i => {
                const sl = t.slot[i];
                sl.win = vince ? sl.win + 1 : 0; sl.clean = pul ? sl.clean + 1 : 0; fissaMax(sl, 'win', 'winMax'); fissaMax(sl, 'clean', 'cleanMax');
            });
        }
    }
    const vinceA = mA > mB;
    for (const [g, t, vince] of [[ga, ta, vinceA], [gb, tb, !vinceA]]) {
        if (vince) g.sdV++;
        g.sd = vince ? g.sd + 1 : 0; fissaMax(g, 'sd', 'sdMax');
        if (t) { t.sdG++; if (vince) t.sdV++; t.sd = vince ? t.sd + 1 : 0; fissaMax(t, 'sd', 'sdMax'); }
    }
}

function chiudiStagione(stagione, giocatori) {
    // vincitore: più punti, poi più set vinti, poi caso
    let best = 0, bv = -1;
    for (let i = 0; i < N; i++) { const v = stagione.punti[i] * 1000 + stagione.setV[i] + rnd() * 0.5; if (v > bv) { bv = v; best = i; } }
    giocatori.forEach((g, i) => {
        g.stagioniGiocate++;
        if (i === best) g.stagioniVinte++;
        for (const t of stagione.teams[i].values()) {
            t.stagioni++; if (i === best) t.stagioniVinte++;
            // stagioni insieme / vinte in campo per ogni Pokémon che è sceso in campo in questa stagione
            t.slot.forEach(sl => { if (sl.portato > (stagione.prima.get(sl) || 0)) { sl.stagioni++; if (i === best) sl.stagioniVinte++; } });
        }
    });
    return best;
}

// ----- Elo con la funzione vera del sito -----
const ctx = vm.createContext({ console, fetch: async () => ({ ok: false }), db: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'risultati-match.js'), 'utf8'), ctx);

// ----- statistiche per checkpoint -----
const risultati = {}; // metrica -> checkpoint -> giocatore -> [valori]
const reg = (m, c, p, v) => { (((risultati[m] ||= {})[c] ||= [])[p] ||= []).push(v); };
const migliore = (lista, f) => lista.reduce((m, x) => Math.max(m, f(x)), 0);

function istantanea(giocatori, c) {
    giocatori.forEach((g, p) => {
        reg('champion', c, p, g.stagioniVinte); reg('veteran', c, p, g.stagioniGiocate);
        reg('matchwinner', c, p, g.matchV); reg('setcrusher', c, p, g.setV); reg('showdown', c, p, g.sdV);
        reg('dominant%', c, p, g.matchG ? 100 * g.matchV / g.matchG : 0); reg('matchGiocati', c, p, g.matchG);
        reg('knockout', c, p, g.ko); reg('untouchable', c, p, g.perfetti); reg('closecall', c, p, g.alLimite);
        reg('formatmaster', c, p, [...g.formati.values()].filter(f => f.n >= 12 && 100 * f.v / f.n >= 65).length);
        reg('collector', c, p, g.specie.size);
        reg('winstreak', c, p, g.winMax); reg('cleanstreak', c, p, g.cleanMax); reg('sdstreak', c, p, g.sdMax);
        // team (il migliore del giocatore)
        reg('t.champion', c, p, migliore(g.tuttiTeam, t => t.stagioniVinte));
        reg('t.veteran', c, p, migliore(g.tuttiTeam, t => t.stagioni));
        reg('t.showdown', c, p, migliore(g.tuttiTeam, t => t.sdV));
        reg('t.sdstreak', c, p, migliore(g.tuttiTeam, t => t.sdMax));
        reg('t.winner', c, p, migliore(g.tuttiTeam, t => t.matchV));
        reg('t.winrate%', c, p, migliore(g.tuttiTeam.filter(t => t.matchG >= 18), t => 100 * t.matchV / t.matchG));
        reg('t.winstreak', c, p, migliore(g.tuttiTeam, t => t.winMax));
        reg('t.cleanstreak', c, p, migliore(g.tuttiTeam, t => t.cleanMax));
        reg('t.flawless', c, p, migliore(g.tuttiTeam, t => t.perfetti));
        reg('t.knockout', c, p, migliore(g.tuttiTeam, t => t.ko));
        // Pokémon (il migliore del giocatore)
        const slots = g.tuttiTeam.flatMap(t => t.slot);
        reg('p.regular', c, p, migliore(slots, s => s.portato)); reg('p.ko', c, p, migliore(slots, s => s.ko));
        reg('p.winner', c, p, migliore(slots, s => s.vinti)); reg('p.laststand', c, p, migliore(slots, s => s.ultimo));
        reg('p.survivor%', c, p, migliore(slots.filter(s => s.portato >= 60), s => 100 * (1 - s.svenuto / s.portato)));
        reg('p.winstreak', c, p, migliore(slots, s => s.winMax)); reg('p.cleanstreak', c, p, migliore(slots, s => s.cleanMax));
        reg('p.champion', c, p, migliore(slots, s => s.stagioniVinte)); reg('p.friendship', c, p, migliore(slots, s => s.stagioni));
        // titoli: il tipo e la specie più usati
        const tt = g.tipoUso.map((u, i) => ({ ...u, i })).sort((x, y) => y.played - x.played)[0];
        const D = g.stile.nome;
        reg(D + 'tipo.played', c, p, tt.played); reg(D + 'tipo.won', c, p, tt.won); reg(D + 'tipo.ko', c, p, tt.ko);
        const ss = [...g.specieUso.values()].sort((x, y) => y.played - x.played)[0] || { played: 0, won: 0, ko: 0 };
        reg(D + 'spec.played', c, p, ss.played); reg(D + 'spec.won', c, p, ss.won); reg(D + 'spec.ko', c, p, ss.ko);
    });
}

function carriera(stile) {
    const giocatori = Array.from({ length: N }, () => nuovoGiocatore(STILI[stile]));
    const storiaFormati = [];
    // le stagioni si giocano a coppie, in contemporanea: gli showdown delle due stagioni si mescolano (e con loro le serie)
    for (let i = 0; i < STAGIONI; i += 2) {
        const coppia = [creaStagione(i, giocatori, storiaFormati)];
        if (i + 1 < STAGIONI) coppia.push(creaStagione(i + 1, giocatori, storiaFormati));
        for (const x of mischia(coppia.flatMap(st => st.showdown.map(sd => ({ sd, st }))))) giocaShowdown(x.sd, x.st, giocatori);
        coppia.forEach(st => chiudiStagione(st, giocatori));
        const fatte = i + coppia.length;
        for (const c of CHECK) if (c > i && c <= fatte) istantanea(giocatori, c);
    }
    return giocatori;
}

// ----- Elo: una carriera "leggera" giocata con la funzione vera -----
function picchiElo(carriere) {
    const out = {};
    for (let r = 0; r < carriere; r++) {
        const seasons = {}; let k = 0;
        const storia = [];
        for (let s = 0; s < STAGIONI; s++) {
            const tipo = CICLO[s % CICLO.length];
            const sdp = tipo === 'league' ? scegli(SD_LEAGUE) : tipo === 'monoformat' ? scegli(SD_MONO) : scegli(SD_RANDOM);
            const nf = tipo === 'league' ? scegli(FORMATI_LEAGUE) : 1;
            const sid = 's' + s; seasons[sid] = { info: { tipo: tipo === 'monoformat' ? 'monoformat' : tipo }, showdowns: {} };
            const lista = [];
            for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) for (let f = 0; f < nf * sdp; f++) lista.push([a, b]);
            mischia(lista).forEach(([a, b], i) => {
                const matches = {};
                for (let m = 1; m <= 3; m++) {
                    let sa = 0, sb = 0; for (let t = 0; t < 3; t++) rnd() < pSet(a, b) ? sa++ : sb++;
                    matches['match' + m] = { player1Id: 'p' + a, player2Id: 'p' + b, p1score: sa, p2score: sb, winnerId: sa > sb ? 'p' + a : 'p' + b, data: `${2026 + Math.floor(s / 12)}-${String(1 + (s % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}` };
                }
                seasons[sid].showdowns['d' + (k++)] = { info: { data: `${2026 + Math.floor(s / 12)}-${String(1 + (s % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, categoria: 'x' }, matches };
            });
        }
        const elo = ctx.calcolaEloCronologico(seasons);
        const picco = Array.from({ length: STAGIONI }, () => Array(N).fill(1000));
        const corrente = Array(N).fill(1000);
        // picchi per stagione (prefisso): scorro i match nell'ordine delle stagioni
        const perStagione = {};
        for (const [p, v] of Object.entries(elo.match)) {
            const parti = p.split('/'); const sid = parti[0]; const mm = seasons[sid].showdowns[parti[2]].matches[parti[4]];
            for (const [id, e, d] of [[mm.player1Id, v.p1EloAtMatch, v.p1DeltaElo], [mm.player2Id, v.p2EloAtMatch, v.p2DeltaElo]]) {
                const i = +id.slice(1); const s = +sid.slice(1);
                perStagione[s] ||= Array(N).fill(1000); perStagione[s][i] = Math.max(perStagione[s][i], e + d);
            }
        }
        let corr = Array(N).fill(1000);
        for (let s = 0; s < STAGIONI; s++) {
            corr = corr.map((x, i) => Math.max(x, (perStagione[s] || [])[i] || 1000));
            if (CHECK.includes(s + 1)) for (let i = 0; i < N; i++) reg('elopeak', s + 1, i, corr[i]);
        }
    }
}

// ----- esecuzione -----
function mediana(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
const perc = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

function esegui() {
    for (let r = 0; r < CARRIERE; r++) carriera(r % 2);   // metà casual, metà dedicati (i titoli si leggono separati: D.*)
    picchiElo(Math.max(20, Math.floor(CARRIERE / 3)));
}

function stampa(metriche, giocatori = [0, 1, 2, 3]) {
    const intest = `${'metrica'.padEnd(15)}${'giocatore'.padEnd(11)}` + CHECK.map(c => String(c).padStart(7)).join('');
    console.log(intest);
    for (const m of metriche) {
        if (!risultati[m]) continue;
        for (const p of giocatori) {
            console.log(`${m.padEnd(15)}${NOMI[p].padEnd(11)}` + CHECK.map(c => { const v = (risultati[m][c] || [])[p] || []; return String(Math.round(mediana(v) * 10) / 10).padStart(7); }).join(''));
        }
    }
}

esegui();
const modo = process.argv[4] || 'tutto';
console.log(`# ${CARRIERE} carriere da ${STAGIONI} stagioni ufficiali (ciclo League, League, Monoformat, Randomize); mediana per giocatore dopo N stagioni`);
console.log('# giocatori: elite(+90) forte(+40) medio(0) debole(-40)');
const gruppi = {
    allenatore: ['champion', 'veteran', 'matchwinner', 'setcrusher', 'showdown', 'dominant%', 'matchGiocati', 'knockout', 'untouchable', 'closecall', 'formatmaster', 'elopeak', 'collector', 'winstreak', 'cleanstreak', 'sdstreak'],
    team: ['t.champion', 't.veteran', 't.showdown', 't.sdstreak', 't.winner', 't.winrate%', 't.winstreak', 't.cleanstreak', 't.flawless', 't.knockout'],
    pokemon: ['p.regular', 'p.ko', 'p.winner', 'p.laststand', 'p.survivor%', 'p.winstreak', 'p.cleanstreak', 'p.champion', 'p.friendship'],
    titoli: ['tipo.played', 'tipo.won', 'tipo.ko', 'spec.played', 'spec.won', 'spec.ko', 'D.tipo.played', 'D.tipo.won', 'D.tipo.ko', 'D.spec.played', 'D.spec.won', 'D.spec.ko']
};
for (const [nome, lista] of Object.entries(gruppi)) { console.log(`\n## ${nome}`); stampa(lista); }


// riepilogo per scegliere le soglie: forte e elite dopo 2, 8, 16, 24 stagioni ufficiali (2 = le prime due stagioni, in contemporanea)
console.log('\n## riepilogo (mediana): forte@2 @8 @16 @32 | elite@2 @8 @16 @24 @32');
const col = [2, 8, 16, 32], colE = [2, 8, 16, 24, 32];
for (const m of Object.keys(risultati).filter(k => !k.startsWith('D.') || true)) {
    const val = (c, p) => { const v = (risultati[m][c] || [])[p] || []; return v.length ? Math.round(mediana(v) * 10) / 10 : '-'; };
    console.log(m.padEnd(16) + col.map(c => String(val(c, 1)).padStart(7)).join('') + '  |' + colE.map(c => String(val(c, 0)).padStart(7)).join(''));
}

// probabilità di raggiungere una soglia (percentuale di carriere), per le statistiche "di picco" (serie, Elo...) dove la mediana racconta poco
function probabilita(metrica, soglie, giocatori = [0, 1, 2], checks = [2, 8, 16, 32]) {
    console.log(`\n# P(${metrica} >= soglia) per giocatore e stagioni giocate`);
    console.log('soglia'.padEnd(8) + giocatori.map(p => NOMI[p].padEnd(40)).join(''));
    console.log(''.padEnd(8) + giocatori.map(() => checks.map(c => ('@' + c).padStart(7)).join('').padEnd(40)).join(''));
    for (const t of soglie) {
        console.log(String(t).padEnd(8) + giocatori.map(p => checks.map(c => { const v = (risultati[metrica][c] || [])[p] || []; return (100 * v.filter(x => x >= t).length / v.length).toFixed(0).padStart(6) + '%'; }).join('').padEnd(40)).join(''));
    }
}
if (process.argv[4] === 'prob') {
    probabilita('winstreak', [7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 25]);
    probabilita('cleanstreak', [3, 4, 5, 6, 7, 8]);
    probabilita('sdstreak', [5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 24]);
    probabilita('elopeak', [1100, 1120, 1150, 1180, 1200, 1230, 1250, 1280, 1300]);
    probabilita('dominant%', [55, 58, 60, 62, 65, 68, 70, 72, 75]);
    probabilita('formatmaster', [2, 3, 4, 5, 6, 8, 10, 12, 15]);
    probabilita('champion', [1, 2, 3, 4, 5, 8, 10, 14]);
}
if (process.argv[4] === 'prob') {
    probabilita('t.winrate%', [62, 65, 68, 70, 72, 75, 78, 80, 85, 88]);
    probabilita('p.survivor%', [36, 40, 44, 46, 48, 50, 52, 55]);
    probabilita('t.cleanstreak', [3, 4, 5, 6, 7]);
}

// `tempi`: per ogni badge del sito, dopo quante stagioni ufficiali (mediana) un giocatore forte e uno elite arrivano a ogni livello
if (process.argv[4] === 'tempi') {
    const BA = require('../docs/badge-allenatore.js'), BT = require('../docs/badge-team.js'), FI = require('../docs/fiocchi.js'), TI = require('../docs/titoli.js');
    const serie = { clean: 'cleanstreak', won: 'winstreak', sd: 'sdstreak' };
    const righe = [];
    const aggiungi = (gruppo, id, nomeMetrica, soglie) => righe.push({ gruppo, id, m: nomeMetrica, soglie });
    for (const b of BA.CATALOGO) aggiungi('allenatore', b.id, b.id === 'dominant' ? 'dominant%' : b.id, b.soglie);
    for (const b of TI.BADGE) aggiungi('allenatore', serie[b.id], serie[b.id], b.steps);
    for (const b of BT.CATALOGO) aggiungi('team', b.id, 't.' + (b.id === 'winrate' ? 'winrate%' : b.id), b.soglie);
    for (const b of FI.CATALOGO) aggiungi('pokemon', b.id, 'p.' + (b.id === 'survivor' ? 'survivor%' : b.id), b.soglie);
    const prima = (m, p, soglia) => { for (const c of CHECK) { const v = (risultati[m][c] || [])[p] || []; if (v.length && mediana(v) >= soglia) return c; } return `>${STAGIONI}`; };
    console.log('\n## stagioni ufficiali necessarie (mediana) a un giocatore forte (+40 Elo) / elite (+90 Elo) per ogni livello: bronzo, argento, oro, platino');
    for (const r of righe) {
        if (!risultati[r.m]) continue;
        const t = p => r.soglie.map(s => String(prima(r.m, p, s)).padStart(4)).join('');
        console.log(`${r.gruppo.padEnd(11)}${r.id.padEnd(13)}soglie ${r.soglie.join('/').padEnd(22)} forte:${t(1)}   elite:${t(0)}`);
    }
}
