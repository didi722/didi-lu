'use strict';
// Aiuti per i test che fanno girare il vero simulatore di Showdown (docs/pkmn-sim.js, lo stesso del sito).
// Il file del sito è un modulo ES ma il progetto è CommonJS: lo si copia in una cartella temporanea
// con estensione .mjs e lo si importa da lì.
//
//   const { sim } = await caricaSim();                     // { BattleStreams, Dex, TeamValidator, Teams }
//   const esito = await giocaPartita({ sim, formato, team1, team2, agente1, agente2 });
//
// Un agente è { tipo: 'cpu' | 'casuale' | 'script', cerebro?, gestore? }. Con 'cpu' si usa docs/cpu-ia.js, con 'casuale' un bot
// che sceglie a caso tra le opzioni valide (come quello di battle-ui.js ma senza la pagina), con 'script'
// gestore(richiesta, numeroRichiesta) restituisce la scelta (per scenari decisi a tavolino).
// Opzione seme: [a, b, c, d] fissa la casualità del simulatore (di default sempre la stessa).
// Opzione fermaDopo(esito): se restituisce vero la partita si ferma lì (per guardare una sola decisione).
// Un agente 'cpu' può avere anteprima(richiesta) per decidere a mano chi portare e chi mandare in campo.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let promessa = null;
function caricaSim() {
    if (!promessa) {
        promessa = (async () => {
            const origine = path.join(__dirname, '..', 'docs', 'pkmn-sim.js');
            const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'pkmn-sim-'));
            const copia = path.join(cartella, 'pkmn-sim.mjs');
            fs.copyFileSync(origine, copia);
            const sim = await import(pathToFileURL(copia).href);
            return { sim };
        })();
    }
    return promessa;
}

// docs/team-sito.js e docs/cpu-partita.js (moduli ES del sito) caricati davvero: si copiano accanto al simulatore
// con le importazioni puntate sulla copia .mjs. Restituisce le loro funzioni esportate.
let promessaSito = null;
function caricaTeamSito() {
    if (!promessaSito) {
        promessaSito = (async () => {
            const docs = path.join(__dirname, '..', 'docs');
            const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'sito-'));
            globalThis.self = globalThis;     // i file del sito scrivono in self.DatiGen / self.ControlloTeam
            fs.copyFileSync(path.join(docs, 'pkmn-sim.js'), path.join(cartella, 'pkmn-sim.mjs'));
            fs.copyFileSync(path.join(docs, 'dati-gen.js'), path.join(cartella, 'dati-gen.mjs'));
            fs.copyFileSync(path.join(docs, 'controllo-team.js'), path.join(cartella, 'controllo-team.mjs'));
            const testo = fs.readFileSync(path.join(docs, 'team-sito.js'), 'utf8').replace("'./pkmn-sim.js'", "'./pkmn-sim.mjs'")
                .replace("'./dati-gen.js'", "'./dati-gen.mjs'").replace("'./controllo-team.js'", "'./controllo-team.mjs'");
            fs.writeFileSync(path.join(cartella, 'team-sito.mjs'), testo);
            return import(pathToFileURL(path.join(cartella, 'team-sito.mjs')).href);
        })();
    }
    return promessaSito;
}

// Scelta a caso valida (bot di confronto)
function sceltaCasuale(richiesta, casuale) {
    const caso = a => a[Math.floor(casuale() * a.length)];
    const squadra = richiesta.side.pokemon;
    if (richiesta.teamPreview) {
        const n = richiesta.maxChosenTeamSize || squadra.length;
        const ordine = squadra.map((_, i) => i + 1).sort(() => casuale() - 0.5);
        return 'team ' + ordine.slice(0, n).join('');
    }
    const usati = new Set();
    if (richiesta.forceSwitch) {
        return richiesta.forceSwitch.map(deve => {
            if (!deve) return 'pass';
            const liberi = squadra.map((p, i) => ({ p, i })).filter(x => !x.p.active && !x.p.condition.endsWith(' fnt') && !usati.has(x.i));
            if (!liberi.length) return 'pass';
            const x = caso(liberi);
            usati.add(x.i);
            return `switch ${x.i + 1}`;
        }).join(', ');
    }
    const doppio = richiesta.active.length > 1;
    return richiesta.active.map((a, slot) => {
        const lui = squadra[slot];
        if (lui.condition.endsWith(' fnt') || lui.commanding) return 'pass';
        const liberi = squadra.map((p, i) => ({ p, i })).filter(x => !x.p.active && !x.p.condition.endsWith(' fnt') && !usati.has(x.i));
        if (!a.trapped && liberi.length && casuale() < 0.1) { const x = caso(liberi); usati.add(x.i); return `switch ${x.i + 1}`; }
        const mosse = a.moves.map((m, j) => ({ m, j })).filter(x => !x.m.disabled && x.m.pp !== 0);
        if (!mosse.length) return 'move 1';
        const { m, j } = caso(mosse);
        let bers = '';
        if (doppio && ['normal', 'any', 'adjacentFoe'].includes(m.target)) bers = ` ${1 + Math.floor(casuale() * 2)}`;
        else if (doppio && m.target === 'adjacentAlly') bers = ` ${-(slot === 0 ? 2 : 1)}`;
        else if (doppio && m.target === 'adjacentAllyOrSelf') bers = ` ${-(slot + 1)}`;
        return `move ${j + 1}${bers}`;
    }).join(', ');
}

// Gioca una partita intera. agente1/agente2: { tipo, cerebro }.
// Restituisce { vincitore: 'p1'|'p2'|null, turni, errori: [...], righe: [...] }
async function giocaPartita({ sim, formato, team1, team2, agente1, agente2, casuale, maxTurni = 150, fermaDopo, seme }) {
    const { BattleStreams, Teams } = sim;
    const rnd = casuale || Math.random;
    const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());
    const agenti = { p1: agente1, p2: agente2 };
    const esito = { vincitore: undefined, turni: 0, errori: [], righe: [], richieste: 0 };
    const ultima = { p1: null, p2: null };
    const erroriDiFila = { p1: 0, p2: 0 };
    const contaScript = { p1: 0, p2: 0 };
    let terminata = false;
    let fine;
    const finita = new Promise(ok => { fine = () => { terminata = true; ok(); }; });

    const rispondi = lato => {
        const ag = agenti[lato];
        const richiesta = ultima[lato];
        if (terminata || !richiesta || richiesta.wait) return;
        const scelta = ag.tipo === 'cpu' && richiesta.teamPreview && ag.anteprima ? ag.anteprima(richiesta)
            : ag.tipo === 'cpu'
            ? ag.cerebro.scegli(richiesta, { errori: erroriDiFila[lato] })
            : ag.tipo === 'script' ? ag.gestore(richiesta, ++contaScript[lato])
                : sceltaCasuale(richiesta, rnd);
        if (scelta == null) return;
        esito.richieste++;
        esito.ultimaScelta = esito.ultimaScelta || {};
        esito.ultimaScelta[lato] = scelta;
        (esito.scelte = esito.scelte || { p1: [], p2: [] })[lato].push({ scelta, richiesta, turno: esito.turni, errori: erroriDiFila[lato] });
        try { streams[lato].write(scelta); } catch (e) { esito.erroreScrittura = String(e && e.message || e); }
        if (fermaDopo && fermaDopo(esito)) { esito.fermata = true; fine(); }
    };

    (async () => {
        for await (const blocco of streams.spectator) {
            const righe = blocco.split('\n').filter(r => r.startsWith('|'));
            esito.righe.push(...righe);
            for (const lato of ['p1', 'p2']) if (agenti[lato].tipo === 'cpu') agenti[lato].cerebro.osserva(righe);
            for (const r of righe) {
                if (r.startsWith('|turn|')) { esito.turni = parseInt(r.slice(6), 10); if (esito.turni > maxTurni) { esito.vincitore = null; esito.scaduta = true; fine(); } }
                if (r.startsWith('|win|')) { esito.vincitore = r.slice(5) === 'P1' ? 'p1' : 'p2'; esito.nomeVincitore = r.slice(5); }
                if (r === '|tie') esito.vincitore = null;
            }
        }
        fine();
    })();

    for (const lato of ['p1', 'p2']) {
        (async () => {
            for await (const blocco of streams[lato]) {
                for (const r of blocco.split('\n')) {
                    if (r.startsWith('|request|')) {
                        const json = r.slice(9);
                        if (!json) continue;
                        ultima[lato] = JSON.parse(json);
                        erroriDiFila[lato] = 0;
                        rispondi(lato);
                    } else if (r.startsWith('|error|')) {
                        const m = r.slice(7);
                        if (m.startsWith('[Unavailable choice]')) continue;   // il simulatore manda subito una richiesta aggiornata
                        esito.errori.push({ lato, messaggio: m, scelta: esito.ultimaScelta && esito.ultimaScelta[lato] });
                        erroriDiFila[lato]++;
                        if (erroriDiFila[lato] > 12) { esito.bloccata = true; fine(); return; }
                        rispondi(lato);
                    }
                }
            }
        })();
    }

    // con un seme la partita si ripete identica (stessi colpi critici, stessi danni): i test non sono più a caso
    const spec = { formatid: formato, seed: seme || [1, 2, 3, 4] };
    streams.omniscient.write(
        `>start ${JSON.stringify(spec)}\n` +
        `>player p1 ${JSON.stringify({ name: 'P1', team: Teams.pack(Teams.import(team1)) })}\n` +
        `>player p2 ${JSON.stringify({ name: 'P2', team: Teams.pack(Teams.import(team2)) })}`
    );

    await finita;
    try { await streams.omniscient.writeEnd(); } catch (e) { /* già chiuso */ }
    return esito;
}

// Generatore pseudo-casuale con seme (per partite ripetibili)
function creaCasuale(seme) {
    let a = (seme >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

module.exports = { caricaSim, caricaTeamSito, giocaPartita, sceltaCasuale, creaCasuale };
