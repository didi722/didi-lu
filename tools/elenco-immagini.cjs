#!/usr/bin/env node
/* Controlla le immagini dei badge in docs/immagini/: quelle che il sito si aspetta e non trova, quelle con un solo file (senza i tre
   livelli) e quelle che nessun catalogo usa (nome sbagliato, o file messi lì senza essere agganciati a niente).
   Tre gruppi, uno per prefisso: ribbon-* (fiocchi dei Pokémon), badge-team-* (badge dei team), badge-allenatore-* (badge degli allenatori,
   comprese le serie e il fondatore di titoli.js). Un badge ha tre file, -bronze, -silver e -gold (le serie e il fondatore possono averne
   uno solo); finché un file manca il sito mostra al suo posto una medaglia disegnata con il CSS.
   Uso:  node tools/elenco-immagini.cjs            (stampa il controllo)
         node tools/elenco-immagini.cjs --scrivi   (scrive anche IMMAGINI-DA-CARICARE.md nella cartella principale) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Fiocchi = require('../docs/fiocchi.js');
const BadgeTeam = require('../docs/badge-team.js');
const BadgeAllenatore = require('../docs/badge-allenatore.js');
const Titoli = require('../docs/titoli.js');

const CARTELLA = path.join(__dirname, '..', 'docs', 'immagini');
const nomi = lista => lista.map(p => p.replace(/^immagini\//, ''));
const esiste = nome => fs.existsSync(path.join(CARTELLA, nome));
const LIVELLO = /-(bronze|silver|gold)\.png$/;
// Sagome per lo stato "bloccato": ci sono, ma nessuna pagina le usa ancora (il bloccato si disegna in grigio con il CSS)
const SAGOME = /-ghost\.png$/;

// Gli elementi delle serie e del fondatore (titoli.js) hanno la stessa forma dei badge dei cataloghi
const serie = Titoli.BADGE.map(b => ({ id: b.file, nome: b.label, descrizione: `Series badge: ${b.unita}.`, immagini: Titoli.LIVELLI_BADGE.map(l => Titoli.immagineSerie(b, l)) }));
const fondatore = { id: 'founder', nome: 'League Founder', descrizione: 'Special badge of the two founders (one image, no levels).', immagini: [Titoli.IMMAGINE_FONDATORE] };

const gruppi = [
    { titolo: 'Fiocchi dei Pokémon (scheda Pokémon e medagliette sulla card del team)', prefisso: 'ribbon-', catalogo: Fiocchi.CATALOGO },
    { titolo: 'Badge dei team (scaffale, medagliette nella testata e sulla card del team)', prefisso: 'badge-team-', catalogo: BadgeTeam.CATALOGO },
    { titolo: 'Badge degli allenatori (Achievements nel profilo, pagina Trainers, medaglie della pagina pubblica, scheda in Stats)', prefisso: 'badge-allenatore-',
      catalogo: BadgeAllenatore.CATALOGO.concat(serie, [fondatore]) }
];

/** Il controllo: { gruppi: [{ g, attesi, mancanti, unFile, orfani, sagome }], testo (markdown), mancanti (totale) } */
function controlla() {
    const righe = ['# Immagini dei badge', '',
        'Tutte in `docs/immagini/`, PNG con sfondo trasparente, quadrate, almeno 256×256 px (vengono mostrate fra 22 e 66 px, ma così restano nitide). ',
        'Nomi: `ribbon-<badge>-<livello>.png` per i Pokémon, `badge-team-<badge>-<livello>.png` per i team, `badge-allenatore-<badge>-<livello>.png` per gli allenatori, con `-bronze`, `-silver` o `-gold`. ',
        'Finché un file manca il sito mostra al suo posto una medaglia disegnata con il CSS. Per rifare il controllo: `node tools/elenco-immagini.cjs --scrivi`.', ''];
    let totale = 0;
    const risultati = [];
    const tutti = fs.readdirSync(CARTELLA);
    for (const g of gruppi) {
        const attesi = [...new Set(g.catalogo.flatMap(b => nomi(b.immagini)))];
        const mancanti = attesi.filter(f => !esiste(f));
        const unFile = g.catalogo.filter(b => b.immagini.length === 1 && b.id !== 'founder');
        const usati = new Set(attesi);
        const suoi = tutti.filter(f => f.startsWith(g.prefisso) && f.endsWith('.png'));
        const orfani = suoi.filter(f => !usati.has(f) && !SAGOME.test(f)).sort();
        const sagome = suoi.filter(f => SAGOME.test(f)).sort();
        totale += mancanti.length;
        risultati.push({ g, attesi, mancanti, unFile, orfani, sagome });

        righe.push(`## ${g.titolo}`, '', `${attesi.length - mancanti.length} file presenti su ${attesi.length} attesi, ${mancanti.length} mancanti.`, '');
        if (mancanti.length) {
            righe.push('Mancano:', '', '| File | Badge | Cosa rappresenta |', '|---|---|---|');
            for (const f of mancanti) {
                const id = f.slice(g.prefisso.length).replace(LIVELLO, '').replace(/\.png$/, '');
                const livello = (LIVELLO.exec(f) || [])[1] || 'unico';
                const def = g.catalogo.find(b => b.id === id);
                righe.push(`| \`${f}\` | ${def ? def.nome : id} · ${livello} | ${def ? def.descrizione : ''} |`);
            }
            righe.push('');
        }
        if (unFile.length) {
            righe.push('Hanno un solo file per tutti i livelli (nessun bronze/silver/gold):', '');
            for (const b of unFile) {
                const f = nomi(b.immagini)[0];
                const base = f.replace(/\.png$/, '');
                righe.push(`- ${b.nome}: \`${f}\` → per i tre livelli servirebbero \`${base}-bronze.png\`, \`${base}-silver.png\` e \`${base}-gold.png\``);
            }
            righe.push('');
        }
        if (orfani.length) righe.push('File con questo prefisso che nessun badge usa (nome sbagliato?):', '', ...orfani.map(f => `- \`${f}\``), '');
        if (sagome.length) righe.push('Sagome "ghost" presenti ma non usate da nessuna pagina:', '', ...sagome.map(f => `- \`${f}\``), '');
    }
    righe.push(`Totale: ${totale} file mancanti.`, '');
    return { gruppi: risultati, testo: righe.join('\n'), mancanti: totale };
}

if (require.main === module) {
    const { testo } = controlla();
    console.log(testo);
    if (process.argv.includes('--scrivi')) fs.writeFileSync(path.join(__dirname, '..', 'IMMAGINI-DA-CARICARE.md'), testo);
}
module.exports = { controlla };
