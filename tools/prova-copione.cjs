'use strict';
// =====================================================
// PROVA DEL COPIONE DELLA PALESTRA: la CPU allenata difende il team come lo giocava il proprietario?
//
// Il proprietario di una palestra allena la sua CPU (docs/cpu-copione.js, opzione `copione` di docs/cpu-ia.js): a ogni lezione la CPU guarda come gioca il team di una tappa e ne
// ricorda chi porta, chi manda in campo per primo, le mosse e lo stile (quanto si para, cambia, usa mosse di stato). Poi, difendendo la palestra, ci si avvicina.
// Qui un "proprietario abitudinario" (porta sempre i primi quattro del suo team, apre con i primi due e gioca con una personalità sua) fa LEZIONI lezioni contro una CPU, che le annota
// come in battle-ui.js (CpuCopione.lezione + fondi); poi la CPU difende il suo team contro sfidanti nuovi, senza copione e con il copione dopo 1, 2, 4... lezioni, e si misura:
//   quattro giusti   quanti dei suoi quattro porta (media); esatti: quante volte porta proprio i suoi quattro; apre come lui: quante volte apre con i suoi due
//   mosse uguali     quanto spesso sceglie, nello stesso turno, quello che sceglierebbe lui (una seconda CPU con la sua personalità guarda la stessa partita)
//   [atta/prot/...]  come si distribuiscono le sue decisioni (attacco, protezione, mossa di stato, cambio)
//   vinte            le partite vinte contro gli stessi sfidanti con gli stessi semi: seguire un'abitudine cattiva costa forza, e il peso del copione (parametri copione*) è il compromesso
// Con 8 lezioni la CPU doveva portare i suoi quattro nel 90% dei casi e aprire come lui nell'80%, con una perdita di forza contenuta nel caso peggiore (l'abitudine "sempre i primi
// quattro" è quasi sempre peggiore della scelta in base alla squadra avversaria): è così che si sono scelti copioneAnteprima 0.8 e copioneApertura 0.8. Lo stile (parate, mosse di stato,
// cambi) sposta le percentuali verso quelle del proprietario senza costare partite (copioneMosse 0.5).
//
//   node tools/prova-copione.cjs [--lezioni 1,2,4,8] [--prove 30] [--stile base|protegge|senzaprot|cambia|pari] [--parametri '{"copioneAnteprima":0.5}'] [--solo-anteprima]
//        --stile       come gioca il proprietario durante la partita: base (personalità sua), protegge (si para molto), senzaprot (non si para mai), cambia (cambia spesso), pari (come la CPU)
//        --parametri   parametri della CPU che difende (quelli di PARAMETRI_BASE)
// =====================================================
const path = require('node:path');
const fs = require('node:fs');

const MODULI = path.join(__dirname, '..', 'docs');
const { caricaSim, giocaPartita, creaCasuale } = require(path.join(__dirname, '..', 'test', 'ayuda-sim.js'));
const IA = require(path.join(MODULI, 'cpu-ia.js'));
const Cop = require(path.join(MODULI, 'cpu-copione.js'));
const AV = require(path.join(MODULI, 'cpu-avversario.js'));
const T = require(path.join(MODULI, 'team-cpu.js'));

const a = process.argv.slice(2);
const val = (nome, predefinito) => { const i = a.indexOf('--' + nome); return i >= 0 && a[i + 1] ? a[i + 1] : predefinito; };
const LEZIONI = val('lezioni', '1,2,4,8').split(',').map(Number);
const PROVE = parseInt(val('prove', '30'), 10);
const PARAM_CPU = JSON.parse(val('parametri', '{}'));
const SOLO_ANTEPRIMA = a.includes('--solo-anteprima');
const STILI = {
    base: { aggressivitaDoppio: 0.3, costoProtezione: 0.05, costoCambioDoppio: 0.5, pesoStile: 0 },
    protegge: { costoProtezione: -0.35, pesoStile: 0 },
    senzaprot: { costoProtezione: 6, pesoStile: 0 },
    cambia: { costoCambioDoppio: -0.12, costoCambio: -0.12, pesoStile: 0 },
    pari: {}
};
const PARAM_OWNER = STILI[val('stile', 'base')] || STILI.base;
const FORMATO = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
const ABITUDINE = 'team 1234';          // il proprietario porta sempre i primi quattro e apre con i primi due

// la categoria di ogni slot di una scelta ("move 1 2, switch 3"): attacco, protezione, altro, cambio
function categorie(scelta, richiesta) {
    return String(scelta).split(',').map((x, i) => {
        const m = /^\s*(move|switch|pass)\s*(\d+)?/.exec(x);
        if (!m || m[1] === 'pass') return null;
        if (m[1] === 'switch') return 'cambio';
        const mv = richiesta.active && richiesta.active[i] && richiesta.active[i].moves[(+m[2] || 1) - 1];
        return mv ? AV.categoriaMossa(mv.id) : null;
    });
}
const pezzi = s => String(s).split(',').map(x => x.trim()).map(x => { const m = /^(move|switch|pass)\s*(\d+)?/.exec(x); return m ? { tipo: m[1], idx: m[2] || '' } : { tipo: '?', idx: '' }; });
const nuovoConto = () => ({ attacco: 0, protezione: 0, altro: 0, cambio: 0, n: 0 });
const aggiungi = (conto, cats) => cats.forEach(c => { if (c) { conto[c]++; conto.n++; } });
const quote = c => ['attacco', 'protezione', 'altro', 'cambio'].map(k => `${k.slice(0, 4)} ${(100 * c[k] / Math.max(1, c.n)).toFixed(0)}%`).join(' ');
const pct = x => (100 * x).toFixed(0) + '%';

(async () => {
    const { sim } = await caricaSim();
    const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
    const regolamento = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    const caricaJson = async p => JSON.parse(fs.readFileSync(path.join(MODULI, p), 'utf8'));
    const MAX = Math.max(...LEZIONI);
    const squadre = (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento, caricaJson, quanti: 1 + MAX + PROVE, seme: 'copione-calibra' })).team.map(t => t.testo);
    const nomi = testo => sim.Teams.import(testo).map(s => s.species || s.name);
    const PROPRIETARIO = squadre[0], sfidanti = squadre.slice(1, 1 + MAX), prove = squadre.slice(1 + MAX, 1 + MAX + PROVE);
    const specieProp = nomi(PROPRIETARIO);
    console.log('proprietario:', specieProp.join(', '), `· stile ${val('stile', 'base')} · parametri CPU ${JSON.stringify(PARAM_CPU)}`);

    // le lezioni: il proprietario (p1) gioca contro la CPU (p2), che guarda
    const lezioni = [], contoProp = nuovoConto();
    for (let i = 0; i < MAX; i++) {
        const cpu = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(100 + i), avversario: true });
        const prop0 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(200 + i), parametri: PARAM_OWNER });
        const prop = { osserva: r => prop0.osserva(r), scegli(richiesta, opz) { const c = prop0.scegli(richiesta, opz); if (!richiesta.teamPreview && richiesta.active && !richiesta.forceSwitch) aggiungi(contoProp, categorie(c, richiesta)); return c; } };
        const e = await giocaPartita({ sim, formato: FORMATO, team1: PROPRIETARIO, team2: sfidanti[i], agente1: { tipo: 'cpu', cerebro: prop, anteprima: () => ABITUDINE }, agente2: { tipo: 'cpu', cerebro: cpu },
            casuale: creaCasuale(300 + i), seme: [i + 1, 2, 3, 4] });
        lezioni.push(Cop.lezione({ vista: cpu.memoriaDellaPartita(), avversari: nomi(sfidanti[i]), portati: specieProp.slice(0, 4), turni: e.turni }));
    }
    console.log(`lezioni: ${lezioni.filter(Boolean).length}/${MAX} valide · il proprietario nelle lezioni: ${quote(contoProp)} (${contoProp.n} decisioni)`);

    // la difesa: la CPU con il team del proprietario contro sfidanti nuovi
    async function misura(copione, etichetta) {
        const conto = nuovoConto();
        const r = { prove: 0, vinte: 0, portatiGiusti: 0, aperturaGiusta: 0, perfette: 0, mosse: 0, uguali: 0 };
        for (let k = 0; k < prove.length; k++) {
            const cpu = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(500 + k), avversario: true, parametri: PARAM_CPU, ...(copione ? { copione } : {}) });
            const ombra = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(600 + k), parametri: PARAM_OWNER, avversario: true });
            const sfid = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(700 + k), avversario: true });
            let anteprima = null;
            const involucro = {
                osserva(righe) { cpu.osserva(righe); ombra.osserva(righe); },
                scegli(richiesta, opz) {
                    const c = cpu.scegli(richiesta, opz);
                    if (richiesta.teamPreview) { anteprima = c; return c; }
                    if (richiesta.active && !richiesta.forceSwitch && !(opz && opz.errori)) {
                        aggiungi(conto, categorie(c, richiesta));
                        if (!SOLO_ANTEPRIMA) {
                            let o = null;
                            try { o = ombra.scegli(richiesta, opz); } catch (e) { /* niente */ }
                            if (o) pezzi(c).forEach((x, i) => { const y = pezzi(o)[i]; if (!y || x.tipo === 'pass' || y.tipo === 'pass') return; r.mosse++; if (x.tipo === y.tipo && x.idx === y.idx) r.uguali++; });
                        }
                    }
                    return c;
                }
            };
            const e = await giocaPartita({ sim, formato: FORMATO, team1: prove[k], team2: PROPRIETARIO, agente1: { tipo: 'cpu', cerebro: sfid }, agente2: { tipo: 'cpu', cerebro: involucro }, casuale: creaCasuale(800 + k), seme: [k + 11, 2, 3, 4] });
            r.prove++;
            if (e.vincitore === 'p2') r.vinte++;
            if (anteprima) {
                const cifre = anteprima.replace('team ', '').split('');
                const giusti = cifre.filter(c => '1234'.includes(c)).length;
                r.portatiGiusti += giusti / 4;
                if (cifre.slice(0, 2).every(c => '12'.includes(c))) r.aperturaGiusta++;
                if (giusti === 4) r.perfette++;
            }
        }
        console.log(`${etichetta.padEnd(16)} vinte ${String(r.vinte).padStart(2)}/${r.prove}  quattro giusti ${pct(r.portatiGiusti / r.prove)}  esatti ${pct(r.perfette / r.prove)}  apre come lui ${pct(r.aperturaGiusta / r.prove)}  mosse uguali ${r.mosse ? pct(r.uguali / r.mosse) : '-'} (${r.mosse})  [${quote(conto)}]`);
    }
    await misura(null, 'senza copione');
    for (const n of LEZIONI) {
        let c = null;
        for (let i = 0; i < n; i++) if (lezioni[i]) c = Cop.fondi(c, lezioni[i]);
        await misura(c, `${n} lezioni ${Cop.progresso(c, specieProp).percento}%`);
    }
})().catch(e => { console.error(e); process.exit(1); });
