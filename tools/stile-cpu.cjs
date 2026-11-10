'use strict';
// =====================================================
// COME GIOCA LA CPU, PER SITUAZIONE
//
// Fa giocare la CPU contro se stessa e conta, con lo stesso modulo che legge i replay della lega (docs/cpu-situazioni.js), quante volte attacca, si para, cambia
// o usa una mossa di stato in ogni situazione (primo turno, appena entrato, PS bassi...). Serve a confrontare il suo modo di giocare con quello delle persone:
// il workflow "Stile dei giocatori" stampa la stessa tabella calcolata sui replay della lega.
//
//   node tools/stile-cpu.cjs [--formato doppio|singolo] [--squadre vgc] [--partite 120] [--parametri '{"costoProtezione":0.3}'] [--modello]
//        --modello   la CPU gioca con il modello dell'avversario acceso (come sul sito)
// =====================================================
const path = require('node:path');
const fs = require('node:fs');
const MODULI = path.join(__dirname, '..', 'docs');
const { caricaRandoms, giocaPartita, creaCasuale } = require(path.join(__dirname, '..', 'test', 'ayuda-sim.js'));
const IA = require(path.join(MODULI, 'cpu-ia.js'));
const Sit = require(path.join(MODULI, 'cpu-situazioni.js'));
const T = require(path.join(MODULI, 'team-cpu.js'));

const a = process.argv.slice(2);
const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] ? a[i + 1] : predefinito; };
const formato = val('formato', 'doppio'), partite = parseInt(val('partite', '120'), 10), squadreTipo = val('squadre', ''), parametri = JSON.parse(val('parametri', '{}')), modello = a.includes('--modello');

(async () => {
    const { sim } = await caricaRandoms();
    let f = formato === 'singolo' ? 'gen9randombattle' : 'gen9randomdoublesbattle';
    let squadre = null;
    if (squadreTipo === 'vgc') {
        const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
        const reg = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
        const leggi = q => JSON.parse(fs.readFileSync(path.join(MODULI, q), 'utf8'));
        squadre = (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: reg, caricaJson: async q => leggi(q), quanti: 36, seme: 'tara' })).team.map(t => t.testo);
        f = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
    }
    const tutte = [];
    let turni = 0;
    for (let i = 0; i < partite; i++) {
        const t1 = squadre ? squadre[(i * 7 + 3) % squadre.length] : sim.Teams.generate(f, { seed: [i * 7 + 31, 3, 5, 7] });
        const t2 = squadre ? squadre[(i * 11 + 5 + Math.floor(i / squadre.length)) % squadre.length] : sim.Teams.generate(f, { seed: [i * 7 + 32, 4, 6, 8] });
        const extra = modello ? { avversario: true } : {};
        const c1 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i * 3 + 1), parametri, ...extra }), c2 = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i * 5 + 2), parametri, ...extra });
        const e = await giocaPartita({ sim, formato: f, team1: t1, team2: t2, agente1: { tipo: 'cpu', cerebro: c1 }, agente2: { tipo: 'cpu', cerebro: c2 }, casuale: creaCasuale(i * 11 + 9), seme: [i + 1, 7, 11, 13] });
        tutte.push(...Sit.decisioni(e.righe));
        turni += e.turni;
    }
    console.log(`CPU contro CPU, ${formato}${squadreTipo ? ' (' + squadreTipo + ')' : ''}${modello ? ', con il modello dell\'avversario' : ''}: ${partite} partite, ${(turni / partite).toFixed(1)} turni`);
    console.log(Sit.tabellaInTesto(Sit.tabella(tutte, { doppio: formato !== 'singolo' })));
})().catch(e => { console.error(e); process.exit(1); });
