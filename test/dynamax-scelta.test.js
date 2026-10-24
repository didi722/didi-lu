'use strict';
// Dynamax con uno strumento Scelta (Choice Band...): il blocco sulla mossa si toglie, e con il Dynamax si può scegliere qualunque mossa Max.
// La richiesta del simulatore elenca le mosse normali (quelle bloccate sono "disabled") e, a parte, le mosse Max (disabled solo per Gilet
// Assalto, Provocazione e PP finiti): la pagina deve guardare le seconde quando si sceglie il Dynamax.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
let moduli = null;
function carica() {
    if (!moduli) {
        moduli = (async () => {
            globalThis.self = globalThis;
            const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'dynamax-'));
            const copia = (da, a, sostituzioni = []) => {
                let testo = leggi(da);
                for (const [x, y] of sostituzioni) testo = testo.replace(x, y);
                fs.writeFileSync(path.join(cartella, a), testo);
            };
            copia('pkmn-sim.js', 'pkmn-sim.mjs');
            copia('nomi-unici.js', 'nomi-unici.mjs');
            copia('esito-set.js', 'esito-set.mjs');
            copia('motore-battaglia.js', 'motore-battaglia.mjs', [["'./pkmn-sim.js'", "'./pkmn-sim.mjs'"], ["'./nomi-unici.js'", "'./nomi-unici.mjs'"], ["'./esito-set.js'", "'./esito-set.mjs'"]]);
            const url = n => pathToFileURL(path.join(cartella, n)).href;
            return { sim: await import(url('pkmn-sim.mjs')), motore: await import(url('motore-battaglia.mjs')) };
        })();
    }
    return moduli;
}

const aspetta = ms => new Promise(r => setTimeout(r, ms));
// una partita gen 8 con il Dynamax: p1 ha il Pokémon e lo strumento dati, p2 un Pokémon qualunque. Restituisce la richiesta di p1 dopo ogni turno
async function giocaTurni(sim, squadraP1, scelteP1) {
    const S = sim.BattleStreams;
    const flussi = S.getPlayerStreams(new S.BattleStream());
    const pack = t => sim.Teams.pack(sim.Teams.import(t));
    const richieste = [];
    (async () => { for await (const c of flussi.p1) for (const r of c.split('\n')) if (r.startsWith('|request|')) richieste.push(JSON.parse(r.slice(9))); })();
    (async () => { for await (const c of flussi.p2) { /* niente */ } })();
    const p2 = 'Skarmory @ Leftovers\nAbility: Sturdy\nLevel: 50\n- Roost\n- Brave Bird\n\nDragonite @ Leftovers\nAbility: Multiscale\nLevel: 50\n- Roost\n- Extreme Speed';
    flussi.omniscient.write(`>start ${JSON.stringify({ formatid: 'gen8customgame' })}\n>player p1 ${JSON.stringify({ name: 'A', team: pack(squadraP1) })}\n>player p2 ${JSON.stringify({ name: 'B', team: pack(p2) })}`);
    await aspetta(1200);
    flussi.p1.write('team 12'); flussi.p2.write('team 12'); await aspetta(400);
    for (const scelta of scelteP1) { flussi.p1.write(scelta); flussi.p2.write('move 1'); await aspetta(700); }
    return richieste;
}

test('con lo strumento Scelta le mosse normali sono bloccate, ma quelle Max no: il Dynamax le sblocca (e il simulatore accetta la scelta)', async () => {
    const { sim, motore } = await carica();
    const squadra = 'Garchomp @ Choice Band\nAbility: Rough Skin\nLevel: 50\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Protect\n\nCorviknight @ Leftovers\nAbility: Pressure\nLevel: 50\n- Roost\n- Brave Bird';
    const richieste = await giocaTurni(sim, squadra, ['move 1']);          // Terremoto: la Fascia Scelta blocca
    const r = motore.leggiRichiesta(richieste[richieste.length - 1]);
    const [terremoto, artigli, danza, protezione] = r.attivi[0].mosse;
    assert.equal(terremoto.disabilitata, false);
    assert.deepEqual([artigli.disabilitata, danza.disabilitata, protezione.disabilitata], [true, true, true], 'le altre mosse sono bloccate');
    // le mosse Max di quelle stesse mosse non lo sono: il blocco non le riguarda
    assert.deepEqual(r.attivi[0].mosse.map(m => m.max && m.max.disabilitata), [false, false, false, false]);
    assert.equal(r.attivi[0].mosse[1].max.nome, 'maxwyrmwind');
    // e il simulatore accetta il Dynamax con una mossa bloccata: dopo, tutte le mosse sono scelte libere
    const dopo = await giocaTurni(sim, squadra, ['move 1', 'move 2 dynamax']);
    const r2 = dopo[dopo.length - 1];
    assert.ok(r2.active[0].maxMoves && !r2.active[0].canDynamax, 'è in Dynamax');
    assert.ok(r2.active[0].moves.every(m => !m.disabled), 'senza più il blocco di Scelta');
});

test('le mosse Max di stato restano bloccate con il Gilet Assalto (e con i PP finiti): è il simulatore a dirlo', async () => {
    const { sim, motore } = await carica();
    const squadra = 'Garchomp @ Assault Vest\nAbility: Rough Skin\nLevel: 50\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Protect\n\nCorviknight @ Leftovers\nAbility: Pressure\nLevel: 50\n- Roost\n- Brave Bird';
    const richieste = await giocaTurni(sim, squadra, []);
    const r = motore.leggiRichiesta(richieste[richieste.length - 1]);
    assert.deepEqual(r.attivi[0].mosse.map(m => m.max.disabilitata), [false, false, true, true], 'Danza Spada e Protezione sono di stato');
    assert.deepEqual(r.attivi[0].mosse.map(m => m.disabilitata), [false, false, true, true]);
});

test('battle-ui.js: con il Dynamax scelto (o in corso) una mossa si spegne solo per i limiti della mossa Max, non per il blocco della mossa normale', () => {
    const ui = leggi('battle-ui.js');
    assert.match(ui, /const spenta = !eff \|\| m\.pp === 0 \|\| \(massima \? !!m\.max\.disabilitata : m\.disabilitata\);/);
    // `massima` è vera con il Dynamax scelto adesso o già in corso, e solo se la mossa ha una versione Max
    assert.match(ui, /const massima = \(p\.potenziamento === 'dynamax' \|\| attivo\.dinamizzato\) && m\.max;/);
    assert.match(leggi('motore-battaglia.js'), /disabilitata: !!mosseMax\[j\]\.disabled/);
});
