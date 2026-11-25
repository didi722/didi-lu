'use strict';
// =====================================================
// DIAGNOSI DELLA CPU IN DOPPIO: cosa fa davvero, mossa per mossa
//
// Fa giocare la CPU contro se stessa (team VGC composti da lei, anteprima compresa) e, per ogni decisione presa, guarda quali mosse il Pokémon aveva e quale ha scelto:
// il risultato è "quante volte l'ha usata sulle volte che poteva". Serve a vedere se una mossa (Fake Out, Icy Wind, Will-O-Wisp...) non si usa quasi mai, se le
// Protezioni sono troppe o a schema, se una mossa che non può riuscire (Upper Hand senza una mossa prioritaria davanti) si ripete, e come ci si comporta nel finale
// (due Pokémon contro uno: attaccare o proteggersi?).
//
//   node tools/diagnosi-cpu.cjs [--partite 60] [--parametri '{"costoProtezione":0.3}'] [--personalita nome] [--min 30] [--lato p1|p2|tutti]
//        --min        mostra solo le mosse disponibili almeno questo numero di volte (default 25)
//        --personalita  la personalità (CpuIa.PERSONALITA) da dare a una delle due CPU (la p1); l'altra ha la base
// =====================================================
const path = require('node:path');
const fs = require('node:fs');
const MODULI = path.join(__dirname, '..', 'docs');
const { caricaRandoms, giocaPartita, creaCasuale } = require(path.join(__dirname, '..', 'test', 'ayuda-sim.js'));
const IA = require(path.join(MODULI, 'cpu-ia.js'));
const K = require(path.join(MODULI, 'cpu-conoscenza.js'));
const T = require(path.join(MODULI, 'team-cpu.js'));

const a = process.argv.slice(2);
const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] ? a[i + 1] : predefinito; };
const PARTITE = parseInt(val('partite', '60'), 10), PARAMETRI = JSON.parse(val('parametri', '{}')), MIN = parseInt(val('min', '25'), 10), PERSONALITA = val('personalita', '');
const LATO = val('lato', 'tutti');
const SEME = val('seme', 'diagnosi');

// i gruppi di mosse che interessano
const GRUPPI = {
    protezione: new Set([...K.PROTEZIONI, 'wideguard', 'quickguard']),
    fakeout: new Set(['fakeout', 'firstimpression']),
    velocitaSquadra: new Set(['tailwind', 'trickroom']),
    velocitaBersaglio: new Set(['icywind', 'electroweb', 'thunderwave', 'glare', 'nuzzle', 'bulldoze', 'rocktomb', 'mudshot', 'scaryface', 'stunspore', 'stickyweb', 'cottonspore', 'lowsweep']),
    stato: new Set(['willowisp', 'toxic', 'spore', 'sleeppowder', 'hypnosis', 'yawn', 'stunspore', 'thunderwave', 'glare', 'poisonpowder', 'nuzzle', 'encore', 'taunt']),
    redirezione: new Set(['followme', 'ragepowder']),
    supporto: new Set(['helpinghand', 'reflect', 'lightscreen', 'auroraveil', 'wideguard', 'quickguard', 'coaching', 'decorate', 'lifedew', 'pollenpuff']),
    perno: new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot']),
    potenziamento: new Set(Object.keys(K.POTENZIAMENTI)),
    recupero: new Set([...K.RECUPERO, 'strengthsap', 'wish'])
};
const gruppiDi = id => Object.keys(GRUPPI).filter(g => GRUPPI[g].has(id));

(async () => {
    const { sim } = await caricaRandoms();
    const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
    const reg = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    const leggi = q => JSON.parse(fs.readFileSync(path.join(MODULI, q), 'utf8'));
    const squadre = (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: reg, caricaJson: async q => leggi(q), quanti: 150, seme: SEME })).team;
    const formato = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';

    const mosse = {};           // id -> { disp, usata, primoTurno: { disp, usata } }
    const voce = id => mosse[id] || (mosse[id] = { disp: 0, usata: 0, d1: 0, u1: 0 });
    const gruppi = {};           // gruppo -> { decisioni (slot-turni con almeno una del gruppo), usate }
    const protPattern = { dopoProt: { n: 0, p: 0 }, dopoAltro: { n: 0, p: 0 }, primo: { n: 0, p: 0 }, nonPrimo: { n: 0, p: 0 } };
    const fallite = {}, ripetute = {};
    const finali = {};           // "miei-vs-loro" -> { dec, prot, doppioProt (almeno uno dei due), partite: Set }
    let decisioni = 0, slotTurni = 0, cambi = 0, turniTotali = 0, vittorieP1 = 0, vittorieP2 = 0, patte = 0;
    const lunghezza = [];

    for (let g = 0; g < PARTITE; g++) {
        const t1 = squadre[(g * 7 + 3) % squadre.length], t2 = squadre[(g * 11 + 5 + Math.floor(g / squadre.length)) % squadre.length];
        const c1 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(g * 3 + 1), parametri: PARAMETRI, piano: t1.piano, ...(PERSONALITA ? { personalita: PERSONALITA } : {}) });
        const c2 = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(g * 5 + 2), parametri: {}, piano: t2.piano });
        const anteprima = (cerebro) => richiesta => cerebro.scegli(richiesta, { errori: 0 });
        const e = await giocaPartita({ sim, formato, team1: t1.testo, team2: t2.testo, agente1: { tipo: 'cpu', cerebro: c1, anteprima: anteprima(c1) }, agente2: { tipo: 'cpu', cerebro: c2, anteprima: anteprima(c2) },
            casuale: creaCasuale(g * 11 + 9), seme: [g + 1, 7, 11, 13] });
        turniTotali += e.turni; lunghezza.push(e.turni);
        if (e.vincitore === 'p1') vittorieP1++; else if (e.vincitore === 'p2') vittorieP2++; else patte++;

        // i KO per turno, dal log: "|faint|p1a: Nome"
        const cadutiPerTurno = { p1: {}, p2: {} };      // lato -> turno -> quanti sono caduti fino a quel turno compreso
        let turno = 0; const caduti = { p1: 0, p2: 0 };
        let precedente = null; const ripetizione = new Map();
        for (const r of e.righe) {
            if (r.startsWith('|turn|')) { turno = parseInt(r.slice(6), 10); cadutiPerTurno.p1[turno] = caduti.p1; cadutiPerTurno.p2[turno] = caduti.p2; }
            else if (r.startsWith('|faint|')) { const l = /^\|faint\|(p[12])/.exec(r); if (l) caduti[l[1]]++; }
            else if (r.startsWith('|move|')) precedente = { turno, riga: r };
            else if ((r.startsWith('|-fail|') || r.startsWith('|-notarget|')) && precedente && precedente.turno === turno) {
                const p = precedente.riga.split('|');       // ['', 'move', 'p1a: Nome', 'Mossa', 'bersaglio', ...]
                const chi = p[2], nome = p[3];
                const k = nome;
                fallite[k] = (fallite[k] || 0) + 1;
                const chiave = `${g}|${chi}|${nome}`;
                const ultimo = ripetizione.get(chiave);
                const serie = ultimo && ultimo.turno === turno - 1 ? ultimo.serie + 1 : 1;
                ripetizione.set(chiave, { turno, serie });
                if (serie >= 2) { ripetute[k] = ripetute[k] || { due: 0, tre: 0 }; if (serie === 2) ripetute[k].due++; if (serie >= 3) ripetute[k].tre++; }
                precedente = null;
            }
        }

        // le decisioni
        for (const lato of ['p1', 'p2']) {
            if (LATO !== 'tutti' && lato !== LATO) continue;
            const strisce = new Map();       // ident -> true se era in campo alla decisione prima
            let dopoProtezione = {};          // ident -> ha usato una protezione alla decisione prima
            let ultimoTurno = -1;
            for (const s of (e.scelte && e.scelte[lato]) || []) {
                const r = s.richiesta;
                if (!r || r.teamPreview || !r.active || r.forceSwitch) continue;
                const parti = String(s.scelta).split(',').map(x => x.trim());
                const mieiVivi = r.side.pokemon.filter(p => !/ fnt$/.test(p.condition)).length;
                const loro = lato === 'p1' ? 'p2' : 'p1';
                const loroVivi = 4 - (cadutiPerTurno[loro][s.turno] || 0);
                const attivi = r.side.pokemon.filter(p => p.active);
                const inCampoOra = new Set(attivi.map(p => p.ident));
                const nuovaStrisce = new Map();
                const prot = [];
                decisioni++;
                r.active.forEach((att, i) => {
                    const ident = attivi[i] && attivi[i].ident;
                    if (!ident || !att || !att.moves) return;
                    const primo = !strisce.get(ident);
                    nuovaStrisce.set(ident, true);
                    const scelta = parti[i] || '';
                    const m = /^move\s+(\d+)/.exec(scelta);
                    const scelto = m ? att.moves[parseInt(m[1], 10) - 1] : null;
                    const idScelto = scelto ? scelto.id : null;
                    slotTurni++;
                    if (/^switch\b/.test(scelta)) cambi++;
                    const disponibili = att.moves.filter(x => !x.disabled && x.id !== 'recharge' && (x.pp == null || x.pp > 0));
                    for (const x of disponibili) {
                        const v = voce(x.id);
                        v.disp++; if (x.id === idScelto) v.usata++;
                        if (primo) { v.d1++; if (x.id === idScelto) v.u1++; }
                    }
                    const gruppiDisp = new Set();
                    for (const x of disponibili) for (const gr of gruppiDi(x.id)) gruppiDisp.add(gr);
                    for (const gr of gruppiDisp) {
                        const o = gruppi[gr] || (gruppi[gr] = { disp: 0, usata: 0 });
                        o.disp++;
                        if (idScelto && gruppiDi(idScelto).includes(gr)) o.usata++;
                    }
                    const haProt = disponibili.some(x => GRUPPI.protezione.has(x.id));
                    if (haProt) {
                        const uso = idScelto && GRUPPI.protezione.has(idScelto) ? 1 : 0;
                        const blocco = dopoProtezione[ident] ? protPattern.dopoProt : protPattern.dopoAltro;
                        if (ultimoTurno >= 0) { blocco.n++; blocco.p += uso; }
                        const b2 = primo ? protPattern.primo : protPattern.nonPrimo; b2.n++; b2.p += uso;
                    }
                    prot[i] = !!(idScelto && GRUPPI.protezione.has(idScelto));
                });
                const nuovoDopo = {};
                r.active.forEach((att, i) => { const ident = attivi[i] && attivi[i].ident; if (ident) nuovoDopo[ident] = !!prot[i]; });
                dopoProtezione = nuovoDopo; ultimoTurno = s.turno;
                strisce.clear(); for (const [k, v] of nuovaStrisce) strisce.set(k, v);
                const chiaveF = `${Math.min(mieiVivi, 4)}v${Math.min(loroVivi, 4)}`;
                const f = finali[chiaveF] || (finali[chiaveF] = { dec: 0, protAlmenoUna: 0, vinte: new Set(), viste: new Set() });
                f.dec++; if (prot.some(Boolean)) f.protAlmenoUna++;
                f.viste.add(g + lato); if (e.vincitore === lato) f.vinte.add(g + lato);
            }
        }
    }

    const pct = (x, y) => (y ? (100 * x / y).toFixed(1) : '-').toString().padStart(5) + '%';
    console.log(`CPU contro CPU, doppio VGC: ${PARTITE} partite, ${(turniTotali / PARTITE).toFixed(1)} turni in media · p1 ${vittorieP1}, p2 ${vittorieP2}, patte ${patte}${PERSONALITA ? ` (p1 personalità: ${PERSONALITA})` : ''}${Object.keys(PARAMETRI).length ? ` · parametri p1 ${JSON.stringify(PARAMETRI)}` : ''}`);
    console.log(`${decisioni} decisioni, ${slotTurni} Pokémon-turni, cambi ${cambi} (${pct(cambi, slotTurni).trim()})\n`);
    console.log('GRUPPI (usati / disponibili: quante volte, avendola, la mossa del gruppo è stata scelta):');
    for (const gr of Object.keys(GRUPPI)) { const o = gruppi[gr]; if (o) console.log(`  ${gr.padEnd(18)} ${String(o.usata).padStart(5)} / ${String(o.disp).padStart(5)}  ${pct(o.usata, o.disp)}`); }
    console.log('\nPROTEZIONI:');
    console.log(`  dopo aver parato il turno prima  ${pct(protPattern.dopoProt.p, protPattern.dopoProt.n)} (${protPattern.dopoProt.p}/${protPattern.dopoProt.n})`);
    console.log(`  dopo aver fatto altro            ${pct(protPattern.dopoAltro.p, protPattern.dopoAltro.n)} (${protPattern.dopoAltro.p}/${protPattern.dopoAltro.n})`);
    console.log(`  primo turno in campo             ${pct(protPattern.primo.p, protPattern.primo.n)} (${protPattern.primo.p}/${protPattern.primo.n})`);
    console.log(`  dal secondo turno in poi         ${pct(protPattern.nonPrimo.p, protPattern.nonPrimo.n)} (${protPattern.nonPrimo.p}/${protPattern.nonPrimo.n})`);
    console.log('\nMOSSE (usate / disponibili; tra parentesi: al primo turno in campo):');
    const elenco = Object.entries(mosse).filter(([, v]) => v.disp >= MIN).sort((x, y) => y[1].disp - x[1].disp);
    for (const [id, v] of elenco) {
        const gr = gruppiDi(id);
        console.log(`  ${id.padEnd(18)} ${String(v.usata).padStart(5)} / ${String(v.disp).padStart(5)} ${pct(v.usata, v.disp)}   (${String(v.u1).padStart(4)} / ${String(v.d1).padStart(4)} ${pct(v.u1, v.d1)})${gr.length ? '  [' + gr.join(', ') + ']' : ''}${fallite[id] ? `  fallita ${fallite[id]}` : ''}`);
    }
    console.log('\nMOSSE FALLITE (|-fail| o |-notarget| subito dopo la mossa), con le ripetizioni di fila dello stesso Pokémon:');
    for (const [nome, n] of Object.entries(fallite).sort((x, y) => y[1] - x[1]).slice(0, 14)) {
        const r = ripetute[nome];
        console.log(`  ${nome.padEnd(20)} ${String(n).padStart(4)}${r ? `   di fila: 2 volte ${r.due}, 3 o più ${r.tre}` : ''}`);
    }
    console.log('\nFINALI (miei Pokémon vivi contro i loro: decisioni, quante volte almeno uno si para, e quante partite sono state vinte da chi si è trovato lì):');
    for (const k of Object.keys(finali).sort()) {
        const f = finali[k];
        console.log(`  ${k}  ${String(f.dec).padStart(5)} decisioni, si para ${pct(f.protAlmenoUna, f.dec)}   partite vinte da chi è lì ${pct(f.vinte.size, f.viste.size)} (${f.vinte.size}/${f.viste.size})`);
    }
})().catch(e => { console.error(e); process.exit(1); });
