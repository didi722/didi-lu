'use strict';
// L'aspetto da app (html.app-shell) delle cose aggiunte dopo: ogni pagina del sito è stata presa in considerazione per l'app, e alcune correzioni viste a schermo
// nell'APK (testo illeggibile della Palestra, nome del team che sbordava sotto i tasti nel Box, classifica del riepilogo con buchi).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../docs/app.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = f => fs.readFileSync(path.join(DOCS, f), 'utf8');

// Le pagine che non sono né nel menù (VOCI), né senza intestazione da gioco (SENZA_HUD), né fuori dall'app (FUORI_APP): hanno l'interfaccia da gioco in alto ma
// si raggiungono da un'altra pagina. Ogni pagina nuova deve stare in uno di questi quattro posti: chi ne aggiunge una decide come si vede nell'app.
const RAGGIUNTE_DA_ALTROVE = {
    'palestra.html': 'costruire e sfidare una palestra: dalla scheda del Trainer nell\'app (My gym sulla propria, Challenge gym su quella di chi ne ha una)',
    'offline.html': 'la pagina che il service worker mostra senza rete'
};

test('ogni pagina del sito è presa in considerazione dall\'app: nel menù, senza intestazione, fuori dall\'app o raggiunta da un\'altra pagina', () => {
    const pagine = fs.readdirSync(DOCS).filter(f => f.endsWith('.html'));
    const note = new Set([...A.VOCI.flatMap(v => v.pagine), ...A.SENZA_HUD, ...A.FUORI_APP, ...Object.keys(RAGGIUNTE_DA_ALTROVE)]);
    const dimenticate = pagine.filter(p => !note.has(p));
    assert.deepEqual(dimenticate, [], `pagine che l'app non conosce (aggiungile a VOCI, SENZA_HUD, FUORI_APP o a RAGGIUNTE_DA_ALTROVE): ${dimenticate.join(', ')}`);
    for (const p of Object.keys(RAGGIUNTE_DA_ALTROVE)) assert.ok(pagine.includes(p), `${p} non esiste più: toglila dall'elenco`);
});

test('Palestra nell\'app: titolo e spiegazioni appoggiati sullo sfondo scuro sono bianchi (le carte restano nere su bianco)', () => {
    const css = leggi('style-palestra.css');
    assert.match(css, /html\.app-shell \.pal-pagina :is\(\.pal-titolo, \.pal-aiuto, \.pal-accedi\) \{ color: #fff; \}/);
    assert.match(css, /html\.app-shell \.pal-pagina \.pal-passo-corpo \.pal-aiuto \{ color: #000; \}/, 'dentro la carta bianca la spiegazione resta nera');
});

test('Box nell\'app: il nome del team sta nella sua colonna (box-sizing: border-box) e non finisce sotto i tasti della carta', () => {
    const css = leggi('app-gioco-pagine.css');
    assert.match(css, /body\.pg-box #teamsGrid \.card h3 \{ grid-area: nm; box-sizing: border-box;/);
});

test('Riepilogo di stagione nell\'app: le righe della classifica non si distanziano per riempire la colonna, e sopra la prima etichetta c\'è aria per i tag', () => {
    const css = leggi('riepilogo-stagione.css');
    assert.match(css, /html\.app-shell \.rs-righe \{ justify-content: flex-start; \}/);
    assert.match(css, /html\.app-shell \.rs \{[^}]*padding-top: calc\(28 \* var\(--u\)\)/);
});

test('menù dell\'app: ogni figura di una scena ha la sua regola di posto e grandezza (senza, la figura compare grande quanto l\'immagine intera)', () => {
    const S = require('../docs/app-scena.js');
    const css = leggi('app-scena.css');
    for (const [id, scena] of Object.entries(S.SCENE)) {
        for (const e of scena.eroi || []) {
            assert.ok(css.includes(`.gx-c-${id} .${e.c} {`), `la scena ${id}: manca la regola di .gx-c-${id} .${e.c} in app-scena.css`);
        }
    }
});

test('Seasons nell\'app: la tessera del menù porta alle stagioni e all\'iscrizione; Shop e Hall of Fame non sono nell\'app', () => {
    const voce = A.VOCI.find(v => v.id === 'seasons');
    assert.ok(voce, 'tessera seasons');
    assert.equal(voce.href, 'hub.html');
    assert.deepEqual(A.VOCI.map(v => v.id), ['play', 'box', 'trainers', 'stats', 'seasons']);
    assert.ok(A.FUORI_APP.includes('palmares.html') && A.FUORI_APP.includes('shop.html'));
});

test('Box nell\'app: il tasto shiny (che porta allo Shop) non c\'è, perché lo Shop nell\'app non c\'è', () => {
    assert.match(leggi('app-gioco-pagine.css'), /body\.pg-box #teamsGrid \.card-azione\.azione-shiny \{ display: none; \}/);
});
