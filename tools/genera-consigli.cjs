#!/usr/bin/env node
/* =====================================================================
   Genera docs/consigli/genN.json: mosse, strumenti e abilità consigliati per ogni Pokémon, una generazione per file.
   ---------------------------------------------------------------------
   Il Team Builder li usa per mettere in cima alle liste di scelta quello che di solito si gioca, come fa Pokémon Showdown.
   Fonti (solo GitHub, nessuna chiave):
     - i set della Strategy Dex di Smogon, raccolti da pkmn/smogon (data/sets/genN.json): mosse, strumento e abilità
       dei set consigliati per ogni formato;
     - le mosse dei set delle battaglie casuali di Pokémon Showdown (data/random-battles/genN/*sets.json), come ripiego
       per i Pokémon che Smogon non analizza e per le abilità.
   Come si ordina: ogni set vota le sue mosse (la prima alternativa di una casella pesa 1, le altre 0,5); i formati "da
   gioco vero" (OU, UU, Ubers, VGC, Doubles...) pesano 1, quelli speciali (LC, 1v1...) 0,5, quelli di sperimentazione
   (STABmons, Godly Gift, Balanced Hackmons...) sono esclusi. Singolo e doppio hanno liste separate.

   Uso:   node tools/genera-consigli.cjs            (scarica da GitHub, scrive docs/consigli/gen1.json ... gen9.json)
          node tools/genera-consigli.cjs 9 8        (solo alcune generazioni)
   Il risultato è nel repository: il sito non scarica nulla da GitHub, e il file si rigenera quando serve.
   ===================================================================== */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { costruisci } = require('./consigli-lib.cjs');

const RAW = 'https://raw.githubusercontent.com/';
const SMOGON = g => `${RAW}pkmn/smogon/main/data/sets/gen${g}.json`;
const CASUALI = (g, file) => `${RAW}smogon/pokemon-showdown/master/data/random-battles/gen${g}/${file}`;
const USCITA = path.join(__dirname, '..', 'docs', 'consigli');

async function scarica(url) {
    const r = await fetch(url);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
}

(async () => {
    const richieste = process.argv.slice(2).map(Number).filter(n => n >= 1 && n <= 9);
    const gens = richieste.length ? richieste : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    fs.mkdirSync(USCITA, { recursive: true });
    for (const g of gens) {
        const [smogon, casualiS, casualiD] = await Promise.all([
            scarica(SMOGON(g)), scarica(CASUALI(g, 'sets.json')), scarica(CASUALI(g, 'doubles-sets.json'))
        ]);
        const dati = costruisci({ gen: g, smogon, casualiSingoli: casualiS, casualiDoppi: casualiD });
        const file = path.join(USCITA, `gen${g}.json`);
        fs.writeFileSync(file, JSON.stringify(dati));
        const n = Object.keys(dati.s).length, nd = Object.keys(dati.d).length;
        console.log(`gen${g}: ${n} Pokémon (singolo), ${nd} (doppio), ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    }
})().catch(e => { console.error(e); process.exit(1); });
