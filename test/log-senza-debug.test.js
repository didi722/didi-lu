'use strict';
// La cronaca della partita non mostra righe di debug.
// Il formato "Custom Game" del simulatore ha il debug acceso: ogni tanto manda righe "|debug|Multiscale weaken" che il client
// di Showdown scrive nel log come testo qualunque. Non servono a nessuno e confondono i giocatori: le righe "|debug|" si tolgono
// alla sorgente (motore locale e online), davanti alla scena e quando si costruisce un replay.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { caricaSim, giocaPartita } = require('./ayuda-sim.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');

let motore = null;
function caricaMotoreLocale() {
    if (!motore) {
        motore = (async () => {
            globalThis.self = globalThis;     // i file del sito scrivono in self.NomiUnici
            const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'motore-debug-'));
            fs.writeFileSync(path.join(cartella, 'pkmn-sim.mjs'), leggi('pkmn-sim.js'));
            fs.writeFileSync(path.join(cartella, 'nomi-unici.mjs'), leggi('nomi-unici.js'));
            fs.writeFileSync(path.join(cartella, 'motore-battaglia.mjs'), leggi('motore-battaglia.js')
                .replace("'./pkmn-sim.js'", "'./pkmn-sim.mjs'").replace("'./nomi-unici.js'", "'./nomi-unici.mjs'"));
            return import(pathToFileURL(path.join(cartella, 'motore-battaglia.mjs')).href);
        })();
    }
    return motore;
}

// Dragonite con Multiscale a salute piena subisce un colpo: il simulatore scrive "|debug|Multiscale weaken"
const ATTACCANTE = 'Garchomp @ Leftovers\nAbility: Rough Skin\nLevel: 100\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Protect';
const DIFENSORE = 'Dragonite @ Leftovers\nAbility: Multiscale\nLevel: 100\n- Extreme Speed\n- Dragon Dance\n- Earthquake\n- Roost';
const FORMATO = 'gen9customgame@@@Picked Team Size = 1,HP Percentage Mod,Terastal Clause';

const aspetta = async (condizione, ms = 4000) => {
    const t0 = Date.now();
    while (!condizione()) {
        if (Date.now() - t0 > ms) throw new Error('attesa scaduta');
        await new Promise(r => setTimeout(r, 10));
    }
};

test('il simulatore (Custom Game) manda davvero righe "|debug|": è per questo che vanno tolte', async () => {
    const { sim } = await caricaSim();
    const gestore = richiesta => (richiesta.teamPreview ? 'team 1' : richiesta.forceSwitch ? 'switch 1' : 'move 2');   // Dragon Claw
    const e = await giocaPartita({ sim, formato: FORMATO, team1: ATTACCANTE, team2: DIFENSORE, agente1: { tipo: 'script', gestore }, agente2: { tipo: 'script', gestore: r => (r.teamPreview ? 'team 1' : r.forceSwitch ? 'switch 1' : 'move 2') }, maxTurni: 3, seme: [1, 2, 3, 4] });
    assert.ok(e.righe.some(r => r.startsWith('|debug|')), 'righe di debug nel log grezzo');
});

test('BattagliaLocale: nel log che arriva alla pagina (e nel replay) non ci sono righe di debug', async () => {
    const motoreLocale = await caricaMotoreLocale();
    const b = new motoreLocale.BattagliaLocale({ formato: FORMATO, p1: { nome: 'A', team: ATTACCANTE }, p2: { nome: 'B', team: DIFENSORE } });
    const richieste = { p1: 0, p2: 0 }, log = [];
    b.on('richiesta', lato => { richieste[lato]++; });
    b.on('log', righe => log.push(...righe));
    b.avvia();
    await aspetta(() => richieste.p1 === 1 && richieste.p2 === 1);
    b.scegli('p1', 'team 1'); b.scegli('p2', 'team 1');
    await aspetta(() => richieste.p1 === 2 && richieste.p2 === 2);
    b.scegli('p1', 'move 2'); b.scegli('p2', 'move 2');       // Dragon Claw su Dragonite a salute piena: Multiscale
    await aspetta(() => richieste.p1 === 3 || log.some(r => r.startsWith('|-damage|p2a')));
    assert.ok(log.some(r => r.startsWith('|move|p1a: Garchomp|Dragon Claw')), 'il colpo c\'è stato');
    assert.ok(!log.some(r => r.includes('debug')), `righe di debug nel log: ${log.filter(r => r.includes('debug')).join(' / ')}`);
    assert.ok(!b.righeLog.some(r => r.startsWith('|debug|')), 'né nel log da salvare per il replay');
});

test('la pagina, il motore online e il replay tolgono le righe di debug', () => {
    const ui = leggi('battle-ui.js');
    const fn = ui.slice(ui.indexOf('function aggiungiAScena'), ui.indexOf('// Il campo sta ancora animando'));
    assert.match(fn, /filter\(r => !r\.startsWith\('\|debug\|'\)\)/, 'battle-ui.js: aggiungiAScena');
    assert.match(leggi('motore-online.js'), /startsWith\('\|'\) && !r\.startsWith\('\|debug\|'\)/, 'motore-online.js');
    assert.match(leggi('motore-battaglia.js'), /startsWith\('\|'\) && !r\.startsWith\('\|debug\|'\)/, 'motore-battaglia.js');
    assert.match(leggi('replay-sito.js'), /startsWith\('\|'\) && !r\.startsWith\('\|debug\|'\)/, 'replay-sito.js: righeDi');
    // il server le toglieva già
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'functions', 'partita.js'), 'utf8'), /startsWith\('\|debug\|'\)\) continue/);
});
