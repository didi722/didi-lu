#!/usr/bin/env node
'use strict';
// Ricostruisce i due file del simulatore che il sito carica nel browser:
//   docs/pkmn-sim.js      il simulatore di Showdown (@pkmn/sim): battaglie, validazione dei team, dati
//   docs/pkmn-randoms.js  i generatori di team dei formati Random di Showdown (@pkmn/randoms), caricato solo quando serve
//                         (import dinamico): si appoggia a pkmn-sim.js, non ne porta una seconda copia
// Le versioni sono fissate qui sotto: con le stesse versioni il risultato è sempre lo stesso file, byte per byte
// (pkmn-sim.js di prima dei Random era identico a quello che questo script produce senza i tre export in più).
//
//   node tools/costruisci-simulatore.cjs        (dalla cartella principale; serve la rete per scaricare i pacchetti)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const QUI = path.join(__dirname, '..');
const VERSIONI = { '@pkmn/sim': '0.10.11', '@pkmn/randoms': '0.10.11', esbuild: '0.28.2' };

// Gli export del simulatore: quelli di sempre più PRNG, Tags e toID, che servono ai generatori dei team Random, e Battle, con cui
// i test fanno girare le funzioni del server (che usano la classe Battle del pacchetto "pokemon-showdown") sullo stesso simulatore del sito
const ENTRATA_SIM = "export {Battle, BattleStreams, Dex, TeamValidator, Teams, PRNG, Tags, toID} from '@pkmn/sim';\n";
// I generatori si collegano da soli a Teams.generate(): basta importare il file
const ENTRATA_RANDOMS = [
    "import {Teams} from '@pkmn/sim';",
    "import {TeamGenerators} from '@pkmn/randoms';",
    'Teams.setGeneratorFactory(TeamGenerators);',
    'export {TeamGenerators};',
    ''
].join('\n');

function esegui(comando, argomenti, cartella) {
    execFileSync(comando, argomenti, { cwd: cartella, stdio: 'inherit' });
}

function main() {
    const lavoro = fs.mkdtempSync(path.join(os.tmpdir(), 'costruisci-simulatore-'));
    fs.writeFileSync(path.join(lavoro, 'package.json'), JSON.stringify({ name: 'costruisci-simulatore', private: true }));
    const pacchetti = Object.entries(VERSIONI).map(([nome, versione]) => `${nome}@${versione}`);
    esegui('npm', ['install', '--no-audit', '--no-fund', '--save-exact', ...pacchetti], lavoro);

    fs.writeFileSync(path.join(lavoro, 'entrata-sim.mjs'), ENTRATA_SIM);
    fs.writeFileSync(path.join(lavoro, 'entrata-randoms.mjs'), ENTRATA_RANDOMS);
    const esbuild = path.join(lavoro, 'node_modules', '.bin', 'esbuild');
    const comuni = ['--bundle', '--minify', '--format=esm', '--log-level=warning'];

    esegui(esbuild, ['entrata-sim.mjs', ...comuni, `--outfile=${path.join(QUI, 'docs', 'pkmn-sim.js')}`], lavoro);
    // @pkmn/randoms importa '@pkmn/sim': nel browser è lo stesso file di pkmn-sim.js (stessa copia di Teams, Dex, PRNG)
    esegui(esbuild, ['entrata-randoms.mjs', ...comuni, '--alias:@pkmn/sim=./pkmn-sim.js', '--external:./pkmn-sim.js',
        `--outfile=${path.join(QUI, 'docs', 'pkmn-randoms.js')}`], lavoro);

    for (const f of ['pkmn-sim.js', 'pkmn-randoms.js']) {
        console.log(`docs/${f}: ${(fs.statSync(path.join(QUI, 'docs', f)).size / 1048576).toFixed(2)} MB`);
    }
    console.log('Fatto. Se i dati per generazione sono cambiati: node tools/genera-dati-gen.cjs');
}

main();
