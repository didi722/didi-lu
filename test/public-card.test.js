'use strict';
// La pagina pubblica (public.html + public-card.js + public-editor.js + i due fogli di stile): che i pezzi
// siano collegati tra loro. Non apre un browser: controlla il codice e il markup come testo.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../docs/pagina-pubblica.js');

const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');
const html = docs('public.html');
const card = docs('public-card.js');
const editor = docs('public-editor.js');
const cssCard = docs('style-public-card.css');
const cssEditor = docs('style-public-editor.css');
const cssVecchio = docs('style-public.css');

const tutti = (testo, regex) => [...testo.matchAll(regex)].map(m => m[1]);

test('gli script della pagina sono validi e si caricano nell\'ordine giusto', () => {
    for (const [nome, src] of [['public-card.js', card], ['public-editor.js', editor], ['pagina-pubblica.js', docs('pagina-pubblica.js')]]) {
        assert.doesNotThrow(() => new vm.Script(src, { filename: nome }), nome);
    }
    // lo script in linea di public.html
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
    assert.doesNotThrow(() => new vm.Script(inline, { filename: 'public.html' }));
    // pagina-pubblica.js deve essere letto prima di public-card.js, che lo usa subito; titoli.js prima di tutti e due
    const ordine = ['titoli.js', 'pagina-pubblica.js', 'public-card.js'].map(s => html.indexOf(`<script src="${s}"></script>`));
    assert.ok(ordine.every(i => i > 0), 'script mancanti');
    assert.deepEqual([...ordine].sort((a, b) => a - b), ordine);
    assert.match(html, /<link rel="stylesheet" href="style-public-card\.css">/);
    assert.ok(html.indexOf('style-public.css') < html.indexOf('style-public-card.css'), 'la carta deve venire dopo lo stile di base');
});

test('public.html ha un solo <head> e le tre zone dove public-card.js mette i blocchi', () => {
    assert.equal((html.match(/<head>/g) || []).length, 1);
    assert.equal((html.match(/<!DOCTYPE html>/gi) || []).length, 1);
    for (const z of P.ZONE) assert.match(html, new RegExp(`class="pp-zona" data-zona="${z}"`));
    for (const id of ['pp-pagina', 'pp-carta', 'pp-tela', 'pp-sfondo', 'pp-scritta', 'pp-adesivi', 'pp-numero', 'pp-id', 'pp-firma', 'pp-barre', 'pp-messaggio']) {
        assert.match(html, new RegExp(`id="${id}"`), id);
    }
});

test('ogni id che public-card.js e public-editor.js cercano esiste nel markup o lo creano loro', () => {
    const cercati = new Set([
        ...tutti(card, /getElementById\('([^']+)'\)/g),
        ...tutti(editor, /getElementById\('([^']+)'\)/g)
    ]);
    const creati = new Set([
        ...tutti(html, /\bid="([^"]+)"/g),
        ...tutti(card + editor, /\bid: '([^']+)'/g)
    ]);
    for (const id of cercati) assert.ok(creati.has(id), `id mancante: ${id}`);
});

test('la pagina chiama solo funzioni che esistono ancora (le vecchie della card sono sparite)', () => {
    for (const vecchia of ['renderPalmares', 'caricaBadge', 'renderPlayerStats', 'caricaPokemonPreferito', 'renderizzaBestTeam', 'caricaBioAllenatore', 'caricaBestTeamDallAlto']) {
        assert.doesNotMatch(html, new RegExp(`\\b${vecchia}\\b`), vecchia);
    }
    // le funzioni globali che la carta richiama ci sono ancora
    for (const fn of ['mostraGraficoElo', 'apriDettagli', 'apriPkmDettaglio', 'toggleMusic']) {
        assert.match(html, new RegExp(`function ${fn}\\s*\\(|window\\.${fn}\\s*=`), fn);
        assert.match(card, new RegExp(`window\\.${fn}\\b`), `${fn} usata da public-card.js`);
    }
});

test('niente testo del database passa da innerHTML: la carta e l\'editor costruiscono solo nodi di testo', () => {
    assert.doesNotMatch(card, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
    assert.doesNotMatch(editor, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
});

test('ogni layout e ogni blocco della configurazione ha il suo stile', () => {
    for (const id of Object.keys(P.LAYOUT)) assert.match(cssCard, new RegExp(`\\[data-layout="${id}"\\]`), `layout ${id}`);
    for (const id of Object.keys(P.BLOCCHI)) {
        assert.match(cssCard, new RegExp(`\\.pp-${id}\\b`), `stile del blocco ${id}`);
        assert.match(card, new RegExp(`blocco\\('${id}'`), `public-card.js costruisce il blocco ${id}`);
    }
    // l'editor ha il disegnino di ogni layout e un componente per ogni scheda
    for (const id of Object.keys(P.LAYOUT)) assert.match(editor, new RegExp(`\\b${id}: \\[\\[`), `disegno del layout ${id}`);
    for (const scheda of ['layout', 'blocchi', 'sfondo', 'carta', 'adesivi', 'contenuto']) {
        assert.match(editor, new RegExp(`${scheda}: scheda[A-Z]\\w*`), scheda);
    }
});

test('ogni variabile --pp-* usata dagli stili è definita (in :root, da variabiliCss o nel foglio stesso)', () => {
    const usate = new Set([...cssCard.matchAll(/var\((--pp-[\w-]+)/g), ...cssEditor.matchAll(/var\((--pp-[\w-]+)/g)].map(m => m[1]));
    const dalModulo = Object.keys(P.variabiliCss(P.predefinita(), '#31c489'));
    const nelFoglio = new Set([...cssCard.matchAll(/(--pp-[\w-]+)\s*:/g)].map(m => m[1]));
    // quelle che public-card.js imposta a mano su un elemento
    const daJs = new Set([...card.matchAll(/'(--pp-[\w-]+)'/g), ...editor.matchAll(/'(--pp-[\w-]+)'/g)].map(m => m[1]));
    for (const v of usate) {
        assert.ok(dalModulo.includes(v) || nelFoglio.has(v) || daJs.has(v), `variabile non definita: ${v}`);
    }
    // e viceversa: variabiliCss non produce niente che gli stili ignorino
    for (const v of dalModulo) assert.ok(usate.has(v), `variabile mai usata: ${v}`);
});

test('il foglio di stile vecchio non ha più le regole della card di prima e lascia scorrere la pagina', () => {
    assert.doesNotMatch(cssVecchio, /^html, body\s*\{/m);
    for (const sel of ['.top-bar', '.pkm-box', '#stats-container', '.stat-bar {', '#trophy-shelf-container', '.profile-layout-container', '.pokemon-column']) {
        assert.ok(!cssVecchio.includes(sel), `regola ancora presente: ${sel}`);
    }
    // quello che serve ai modali c'è ancora
    for (const sel of ['.modal-grid', '.modal-pkm-card', '.hub-title-badge', '.type-badge', '.pkm-modal-grid', '.stat-bar-fill', '.move-tooltip']) {
        assert.ok(cssVecchio.includes(sel), `regola sparita: ${sel}`);
    }
    // senza un body che scorre la pagina su telefono non si vede
    assert.match(cssCard, /overflow-y:\s*auto/);
});

test('profile.html porta all\'editor della pagina pubblica e public-card.js lo apre con ?edit=1', () => {
    const profilo = docs('profile.html');
    assert.match(profilo, /id="customize-public-link"/);
    assert.match(profilo, /public\.html\?player=\$\{encodeURIComponent\(playerID\)\}&edit=1/);
    assert.match(card, /get\('edit'\) === '1'/);
});

test('l\'editor salva in players/{id}/info (campo pagina compreso) e non scrive la configurazione di partenza', () => {
    assert.match(editor, /players\/\$\{chiave\}\/info`\)\.update\(aggiornamenti\)/);
    assert.match(editor, /pagina: P\.uguali\(daSalvare, P\.predefinita\(\)\) \? null : daSalvare/);
    // la pagina legge la stessa configurazione, passando da normalizza
    assert.match(card, /P\.normalizza\(d\.info && d\.info\.pagina\)/);
});


// ---- Schermo intero, musica, scheda Trainer ---------------------------------------------------

const trainer = docs('public-editor-trainer.js');

test('schermo intero su PC: ogni layout ha le sue regole a tela, e i numeri della tela sono gli stessi nel JS e nel CSS', () => {
    for (const id of Object.keys(P.LAYOUT)) {
        assert.match(cssCard, new RegExp(`body\\.pp-fisso[^{]*\\[data-layout="${id}"\\]|body\\.pp-fisso :is\\([^)]*"${id}"`), `layout ${id}`);
    }
    assert.match(cssCard, /body\.pp-fisso \.pp-pagina \{[^}]*position: fixed[^}]*transform: scale\(var\(--pp-k\)\)/);
    // la finestra "da PC" e la larghezza del pannello: JS, stile della carta e dell'editor devono dire lo stesso
    assert.match(card, /PC_MIN_W = 1100/);
    assert.match(cssEditor, /@media \(max-width: 1099px\)/);
    assert.match(card, /PANNELLO_PX = 400/);
    assert.match(cssEditor, /\.pe-pannello \{[^}]*width: 400px/);
    // senza min-height: 0 sui blocchi non ci si accorge che qualcosa non ci sta (solo il palco può)
    assert.doesNotMatch(cssCard.slice(cssCard.indexOf('Schermo intero su PC')), /\.pp-(identita|statistiche|party|trofei|medaglie|musica)[^{]*\{[^}]*min-height: 0/);
});

test('le sagome di ogni layout dell\'editor ci sono per tutti i layout e la scena usa pixel di progetto, non misure fisse', () => {
    const palco = cssCard.slice(cssCard.indexOf('/* ---------- Palco'), cssCard.indexOf('/* ---------- Nome, titolo, motto'));
    assert.doesNotMatch(palco.replace(/--d: min\([^)]*\);/, ''), /\d(cqw)\b/, 'misure in cqw dentro il palco: devono essere in pixel di progetto (--d)');
    assert.match(palco, /--d: min\(0\.25cqw, 0\.3125cqh\)/);
    assert.match(card, /P\.scalaScena\(/);
    assert.doesNotMatch(card, /Math\.min\(Math\.max\(px, 90\), 255\)/, 'il vecchio tetto che sfora la proporzione');
});

test('musica: il tasto del volume in alto non c\'è più; la musica va dal widget e rispetta la preferenza di tutto il sito', () => {
    assert.doesNotMatch(html, /music-control|class="music-btn"|caricaMusicaSottoBio/);
    assert.doesNotMatch(cssVecchio, /\.music-btn|\.music-tooltip|#music-control/);
    assert.match(html, /userMusicPref/);
    // parte da sola solo se la preferenza è 'on' e il widget è in vista
    assert.match(html, /preferenzaMusica\(\) === 'on'/);
    assert.match(html, /info\.musicaPreferita && PublicCard\.musicaAttiva\(\)/);
    // toggleMusic non dipende più da un pulsante (prima usciva subito se non c'era)
    const toggle = /function toggleMusic\(\) \{([\s\S]*?)\n\}/.exec(html)[1];
    assert.doesNotMatch(toggle, /getElementById\('music-(control|toggle)'\)/);
    assert.match(toggle, /localStorage\.setItem\('userMusicPref', 'on'\)/);
    assert.match(toggle, /localStorage\.setItem\('userMusicPref', 'off'\)/);
    // senza il widget in vista la musica si ferma
    assert.match(card, /if \(audio && !musicaAttiva\(\)\) audio\.pause\(\)/);
    // il widget della carta chiama toggleMusic
    assert.match(card, /window\.toggleMusic\(\)/);
});

test('scheda Trainer: si carica con l\'editor, copre i sette campi del profilo e nasconde le scelte degli altri', () => {
    assert.match(card, /public-editor\.js'\)\.then\(\(\) => caricaScript\('public-editor-trainer\.js'\)/);
    assert.match(trainer, /PublicEditor\.estendi\(\{ id: 'trainer'/);
    assert.doesNotMatch(trainer, /innerHTML|insertAdjacentHTML|outerHTML/);
    for (const campo of P.CAMPI_PROFILO) assert.match(trainer + card + editor, new RegExp(`\\b${campo}\\b`), campo);
    // le liste partono da quello che hanno già gli altri
    assert.match(trainer, /P\.scelteDegliAltri\(/);
    for (const insieme of ['presi.avatar', 'presi.colori', 'presi.pokemon', 'presi.canzoniUrl', 'presi.canzoniNomi']) assert.ok(trainer.includes(insieme), insieme);
    // il colore di chi sceglie resta sempre tra le scelte
    assert.match(trainer, /colori\.unshift\(attuale\)/);
    // e la palette del colore firma è quella senza neutri
    assert.match(trainer, /P\.PALETTE_FIRMA/);
});

test('salvataggio: un\'unica scrittura su info, e le scelte uniche si ricontrollano sui dati di adesso', () => {
    assert.match(editor, /database\.ref\(`players\/\$\{chiave\}\/info`\)\.update\(aggiornamenti\)/);
    assert.match(editor, /database\.ref\('players'\)\.once\('value'\)/);
    assert.match(editor, /P\.conflitti\(chiave, unici, tutti\)/);
    // ogni campo unico è controllato, e ogni nome di conflitto ha il suo messaggio
    assert.match(editor, /CAMPI_UNICI = \['color', 'avatar', 'pkmPreferito', 'musicName', 'musicaPreferita'\]/);
    for (const nome of ['color', 'avatar', 'pkmPreferito', 'musica']) assert.match(editor, new RegExp(`NOMI_CONFLITTO = \\{[^}]*\\b${nome}:`), nome);
    // "No Title" si salva come stringa vuota, come faceva profile.html
    assert.match(editor, /k === 'title' && profilo\.title === 'No Title' \? ''/);
});

test('trascinare un blocco: pointer events con posti di aggancio, non più il trascinamento nativo del browser', () => {
    assert.match(editor, /function postiPossibili\(/);
    assert.match(editor, /class: 'pp-ancora'/);
    assert.doesNotMatch(editor, /setDragImage/);
    assert.match(cssEditor, /\.pp-ancora\.is-vicina/);
    assert.match(cssCard, /body\.pp-modifica \.pp-blocco \{ cursor: grab; touch-action: none; \}/);
});

test('reset: un tasto nel pannello e uno nella scheda Layout riportano alla Trainer Card standard', () => {
    assert.match(editor, /function tornaAllaTrainerCard\(\)/);
    assert.equal((editor.match(/onclick: tornaAllaTrainerCard/g) || []).length, 2);
    assert.match(editor, /cambia\(\(\) => P\.predefinita\(\)\)/);
});

test('tooltip: si aprono verso l\'alto quando in basso non c\'è posto, e a riposo non occupano spazio nella pagina', () => {
    assert.match(card, /host\.classList\.add\('pp-tip-su'\)/);
    assert.match(cssCard, /\.pp-pagina \.pp-tip-su > \.neubrutal-tooltip \{ top: auto; bottom:/);
    // display: none a riposo: un tooltip nascosto con visibility continuerebbe a contare nell'overflow della tela
    const regola = /\.pp-pagina \.neubrutal-tooltip \{([^}]*)\}/.exec(cssCard)[1];
    assert.match(regola, /display: none/);
    assert.doesNotMatch(regola, /visibility: hidden/);
});
