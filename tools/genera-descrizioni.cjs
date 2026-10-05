#!/usr/bin/env node
'use strict';
// Genera docs/descrizioni.json: la spiegazione di ogni mossa, strumento e abilità, per il Team Builder del Box.
// Il Team Builder le prende dai file di dati di Pokémon Showdown (moves.js, items.js, abilities.js), ma quei file non portano più
// i testi (stanno a parte): senza questa tabella le liste di scelta e i fumetti in hover dicevano "No description available".
// I testi vengono dal simulatore del sito (docs/pkmn-sim.js), che li ha tutti.
//
//   node tools/genera-descrizioni.cjs          (dalla cartella principale; rifarlo quando esce una generazione nuova)
//
// Formato: { v: 1, mosse: { id: [breve, lunga?] }, strumenti: {...}, abilita: {...} }. La lunga c'è solo se è diversa dalla breve
// e non supera LUNGA_MAX caratteri (oltre, nel fumetto si legge la breve: vedi Descrizioni.completa).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const QUI = path.join(__dirname, '..');
const USCITA = path.join(QUI, 'docs', 'descrizioni.json');
const LUNGA_MAX = 260;

async function caricaDex() {
    const copia = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'descrizioni-')), 'pkmn-sim.mjs');
    fs.copyFileSync(path.join(QUI, 'docs', 'pkmn-sim.js'), copia);
    return (await import(pathToFileURL(copia).href)).Dex;
}

const pulisci = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

function tabella(elenco) {
    const out = {};
    for (const o of elenco) {
        if (!o.exists) continue;
        const breve = pulisci(o.shortDesc), lunga = pulisci(o.desc);
        if (!breve && !lunga) continue;
        const voce = [breve || lunga];
        if (lunga && lunga !== voce[0] && lunga.length <= LUNGA_MAX) voce.push(lunga);
        out[o.id] = voce;
    }
    return out;
}

(async () => {
    const Dex = await caricaDex();
    const dati = { v: 1, mosse: tabella(Dex.moves.all()), strumenti: tabella(Dex.items.all()), abilita: tabella(Dex.abilities.all()) };
    // una riga per voce: il file si legge e si confronta bene nei diff
    const sezione = t => '{\n' + Object.entries(t).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n  }';
    const testo = `{\n  "v": 1,\n  "mosse": ${sezione(dati.mosse)},\n  "strumenti": ${sezione(dati.strumenti)},\n  "abilita": ${sezione(dati.abilita)}\n}\n`;
    JSON.parse(testo);       // deve restare un JSON valido
    fs.writeFileSync(USCITA, testo);
    console.log(`${path.relative(QUI, USCITA)}: ${Object.keys(dati.mosse).length} mosse, ${Object.keys(dati.strumenti).length} strumenti, ${Object.keys(dati.abilita).length} abilità (${(testo.length / 1024).toFixed(0)} KB)`);
})();
