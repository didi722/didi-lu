#!/usr/bin/env node
/* Elenca le immagini che il sito si aspetta e non trova ancora in docs/immagini/ (fiocchi dei Pokémon e badge dei team).
   Finché un file manca, il sito mostra una medaglia disegnata con il CSS al suo posto.
   Uso:  node tools/elenco-immagini.cjs            (stampa l'elenco)
         node tools/elenco-immagini.cjs --scrivi   (scrive anche IMMAGINI-DA-CARICARE.md nella cartella principale) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Fiocchi = require('../docs/fiocchi.js');
const BadgeTeam = require('../docs/badge-team.js');

const CARTELLA = path.join(__dirname, '..', 'docs', 'immagini');
const manca = nome => !fs.existsSync(path.join(CARTELLA, nome));
const gruppi = [
    { titolo: 'Fiocchi dei Pokémon (scheda Pokémon e medagliette sulla card del team)', file: Fiocchi.IMMAGINI_DA_CARICARE, catalogo: Fiocchi.CATALOGO, prefisso: 'ribbon-' },
    { titolo: 'Badge dei team (scaffale, medagliette nella testata e sulla card del team)', file: BadgeTeam.IMMAGINI_DA_CARICARE, catalogo: BadgeTeam.CATALOGO, prefisso: 'badge-team-' }
];

let righe = ['# Immagini da caricare', '',
    'Tutte in `docs/immagini/`, PNG con sfondo trasparente, quadrate, almeno 256×256 px (vengono mostrate fra 22 e 66 px, ma così restano nitide). ',
    'Per ogni badge ci sono tre file, uno per livello: `-bronze`, `-silver`, `-gold`. Finché un file manca il sito mostra al suo posto una medaglia disegnata con il CSS.', ''];
let totale = 0;
for (const g of gruppi) {
    const mancanti = g.file.filter(manca);
    totale += mancanti.length;
    righe.push(`## ${g.titolo}`, '', `${mancanti.length} file mancanti su ${g.file.length}`, '');
    righe.push('| File | Badge | Cosa rappresenta |', '|---|---|---|');
    for (const f of mancanti) {
        const id = f.replace(g.prefisso, '').replace(/-(bronze|silver|gold)\.png$/, '');
        const livello = (/-(bronze|silver|gold)\.png$/.exec(f) || [])[1];
        const def = g.catalogo.find(b => b.id === id);
        righe.push(`| \`${f}\` | ${def ? def.nome : id} · ${livello} | ${def ? def.descrizione : ''} |`);
    }
    righe.push('');
}
righe.push(`Totale: ${totale} file.`, '');
const testo = righe.join('\n');
console.log(testo);
if (process.argv.includes('--scrivi')) fs.writeFileSync(path.join(__dirname, '..', 'IMMAGINI-DA-CARICARE.md'), testo);
