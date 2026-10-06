'use strict';
// Matches: l'ordine dei showdown (i giocati per ultimi in cima), la classifica a lato (RANKINGS) e quella estesa (LEAGUE TABLE) nello stile
// del sito, e il replay come colonna pulita (intestazione compatta, console, set) che non copre mai la console.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const OS = require('../docs/ordine-showdown.js');

const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');
const matches = docs('matches.html');

// ---------- ordine dei showdown ----------
const sd = (data, ...ultimiMatch) => ({
    info: { data, player1: 'A', player2: 'B' },
    matches: Object.fromEntries(ultimiMatch.map((t, i) => [`match${i + 1}`, { lastEdit: t, p1score: 2, p2score: 1 }]))
});

test('la data dello showdown: AAAA-MM-GG e GG/MM/AAAA diventano la stessa cosa; senza data è vuota', () => {
    assert.equal(OS.giorno('2026-03-09'), '2026-03-09');
    assert.equal(OS.giorno('9/3/2026'), '2026-03-09');
    assert.equal(OS.giorno('09/03/2026'), '2026-03-09');
    assert.equal(OS.giorno('2026-3-9T10:00:00Z'), '2026-03-09');
    assert.equal(OS.giorno(''), '');
    assert.equal(OS.giorno(null), '');
    assert.equal(OS.giorno('boh'), '');
});

test('in cima gli showdown giocati per ultimi: prima il giorno più recente', () => {
    const lista = { vecchio: sd('2026-03-01', '2026-03-01T10:00:00Z'), nuovo: sd('2026-03-12', '2026-03-12T10:00:00Z'), mezzo: sd('2026-03-05', '2026-03-05T10:00:00Z') };
    assert.deepEqual(OS.ordina(lista), ['nuovo', 'mezzo', 'vecchio']);
    // date in formati diversi si confrontano come date, non come testo ("9/3" non viene dopo "12/3")
    assert.deepEqual(OS.ordina({ a: sd('9/3/2026'), b: sd('12/3/2026'), c: sd('2026-03-10') }), ['b', 'c', 'a']);
});

test('due showdown nello stesso giorno: in cima quello il cui ultimo match è stato salvato per ultimo', () => {
    const lista = {
        // creato per primo, ma finito per ultimo
        a: sd('2026-03-12', '2026-03-12T09:00:00Z', '2026-03-12T21:30:00Z'),
        b: sd('2026-03-12', '2026-03-12T10:00:00Z', '2026-03-12T11:00:00Z', '2026-03-12T12:00:00Z'),
        c: sd('2026-03-12', '2026-03-12T15:00:00Z')
    };
    assert.deepEqual(OS.ordina(lista), ['a', 'c', 'b']);
    assert.equal(OS.ultimoMovimento(lista.a), Date.parse('2026-03-12T21:30:00Z'));
});

test('senza orari sui match si usano quelli dello showdown; a parità totale l\'id più alto sta sopra; dati vuoti non rompono', () => {
    const lista = {
        x1: { info: { data: '2026-03-12', timestamp: '2026-03-12T08:00:00Z' } },
        x2: { info: { data: '2026-03-12', ultimoAggiornamento: '2026-03-12T19:00:00Z' } },
        x3: { info: { data: '2026-03-12' } },
        x4: { info: { data: '2026-03-12' } }
    };
    assert.deepEqual(OS.ordina(lista), ['x2', 'x1', 'x4', 'x3']);
    assert.deepEqual(OS.ordina({}), []);
    assert.deepEqual(OS.ordina(null), []);
    assert.deepEqual(OS.ordina({ a: null, b: sd('2026-01-01') }), ['b']);
});

test('matches.html usa l\'ordine condiviso per la lista degli showdown', () => {
    assert.match(matches, /<script src="ordine-showdown\.js"><\/script>/);
    assert.match(matches, /OrdineShowdown\.ordina\(dataShowdowns\)\.filter\(id => Sfide\.completato\(dataShowdowns\[id\]\)\)/);
    assert.doesNotMatch(matches, /dataB\.localeCompare\(dataA\)/, 'niente più ordine per sola data testuale');
});

// ---------- classifica ----------
const sito = vm.createContext({ console, db: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'risultati-match.js'), 'utf8'), sito);

test('ordine della classifica: punti, poi match vinti, poi set vinti, poi il nome (lo stesso per i rankings e per il vincitore)', () => {
    const ordina = lista => lista.slice().sort(sito.confrontaClassifica).map(x => x.name);
    assert.deepEqual(ordina([{ name: 'b', points: 5 }, { name: 'a', points: 9 }]), ['a', 'b']);
    assert.deepEqual(ordina([{ name: 'a', points: 9, won: 2 }, { name: 'b', points: 9, won: 3 }]), ['b', 'a']);
    assert.deepEqual(ordina([{ name: 'a', points: 9, won: 3, setW: 5 }, { name: 'b', points: 9, won: 3, setW: 7 }]), ['b', 'a']);
    assert.deepEqual(ordina([{ name: 'zed', points: 1 }, { name: 'ada', points: 1 }]), ['ada', 'zed']);
    assert.deepEqual([{ id: 'lu', points: 3 }, { id: 'didi', points: 3 }].sort(sito.confrontaClassifica).map(x => x.id), ['didi', 'lu'], 'anche con "id" al posto di "name"');
    assert.deepEqual(ordina([{ name: 'a' }, { name: 'b', points: '4' }]), ['b', 'a'], 'valori mancanti o testuali non rompono');
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'docs', 'risultati-match.js'), 'utf8'), fs.readFileSync(path.join(__dirname, '..', 'functions', 'risultati-match.js'), 'utf8'));
});

test('la classifica a lato e la tabella estesa sono finestre del tema (classifica.css): striscia nera, carta, righe sul colore dell\'allenatore', () => {
    const css = docs('classifica.css');
    assert.match(matches, /<link rel="stylesheet" href="classifica\.css">/);
    const fogli = [...matches.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(fogli.indexOf('classifica.css') > fogli.indexOf('style-matches.css'), 'dopo il foglio della pagina');
    assert.match(css, /\.cl-barra \{[^}]*radial-gradient\(circle at 24px 50%, #ff5f57/, 'i tre pallini');
    assert.match(css, /\.cl-finestra \{[^}]*var\(--nb-tip-bg/, 'la carta con la mezzatinta');
    assert.match(css, /\.cl-riga \{[^}]*background: var\(--cl-colore/, 'la riga è sul colore dell\'allenatore');
    assert.match(css, /\.cl-riga:hover[^}]*var\(--nb-sh-4/, 'l\'ombra al passaggio segue il tema, non è nera fissa');
    assert.match(css, /\.cl-apri, \.cl-chiudi \{[^}]*var\(--nb-giallo/, 'tasti gialli come le altre finestre');
    assert.match(css, /@media \(max-width: 680px\)[^]*\.cl-tab \.cl-tot \{ display: none; \}/, 'sul telefono i totali si tolgono');
    // i temi non cambiano misure: nessuna larghezza o altezza dentro le variabili
    assert.doesNotMatch(css, /--nb-(?:larg|alt|margine|bordo)/);
});

test('matches.html: markup delle classifiche senza stili scritti a mano, ordine unico, apertura e chiusura della tabella', () => {
    const lat = matches.slice(matches.indexOf('async function renderRankings('), matches.indexOf('async function renderClassificaDettagliata('));
    assert.match(lat, /\.sort\(confrontaClassifica\)/);
    assert.match(lat, /class="cl-riga/);
    assert.match(lat, /Sfide\.bottoneRanking\(player\.name\)/, 'il tasto VS della sfida resta');
    assert.doesNotMatch(lat, /onmouseenter|onmouseleave|box-shadow:|rotate\(-1deg\)/, 'nessuna ombra nera o rotazione scritta nel JS');
    assert.match(lat, /escClassifica\(player\.name\)/, 'il nome entra come testo');

    const est = matches.slice(matches.indexOf('async function renderClassificaDettagliata('), matches.indexOf('async function apriModaleTeamsIscritti('));
    assert.match(est, /\.sort\(confrontaClassifica\)/);
    assert.match(est, /class="cl-gruppo cl-g-sd"[^]*class="cl-gruppo cl-g-match"[^]*class="cl-gruppo cl-g-set"/, 'i tre gruppi hanno la loro etichetta');
    assert.match(est, /\['P', 'W', 'L'\]/, 'ogni colonna ha la sua sigla');
    assert.match(est, /<span class="cl-sotto">PT<\/span>/);
    assert.doesNotMatch(est, /style="\s*(?!--cl-colore)/, 'solo il colore dell\'allenatore come variabile');

    assert.match(matches, /function apriClassificaEstesa\(\) \{[^}]*classList\.add\('aperta'\)[^}]*renderClassificaDettagliata\(stagioneAttiva\)/);
    assert.match(matches, /function chiudiClassificaEstesa\(\) \{[^}]*classList\.remove\('aperta'\)/);
    assert.match(matches, /e\.key === 'Escape'\) chiudiClassificaEstesa\(\)/);
    assert.match(matches, /<button type="button" class="cl-chiudi" aria-label="Close" onclick="chiudiClassificaEstesa\(\)">/);
    assert.doesNotMatch(matches, /async function popolaClassifica\(\)/, 'via la vecchia funzione mai usata con i suoi stili');

    // il vecchio stile è tolto dal foglio della pagina (due fogli sulla stessa finestra si pestano i piedi)
    const vecchio = docs('style-matches.css');
    for (const sel of ['.rank-modal-', '.player-stack-card', '.stack-name', '.rank-grid-system', '.rank-header-row', '.group-main-label', '.player-rank-row', '.rank-avatar-mini', '.right-hub-title']) {
        assert.ok(!vecchio.includes(sel), `style-matches.css ha ancora ${sel}`);
    }
});

// ---------- replay ----------
test('replay: una colonna nel flusso (intestazione compatta, console, set) e la console si scala anche sull\'altezza', () => {
    const fin = docs('finestre.css');
    assert.match(fin, /#replayModal\.replay-modal \{[^}]*flex-direction: column/);
    const intest = /#replayModal \.replay-mini-header \{[^}]*\}/.exec(fin)[0];
    assert.match(intest, /position: relative/, 'non più in assoluto sopra la console');
    assert.match(intest, /width: min\(980px, 100%\)/);
    const set = /#replayModal \.set-selector \{[^}]*\}/.exec(fin)[0];
    assert.match(set, /position: static !important/);
    assert.match(set, /order: 3/);
    // i set sono tasti piccoli
    const tasto = /#replayModal button\.btn-set \{[^}]*\}/.exec(fin)[0];
    assert.match(tasto, /width: 40px;[^}]*height: 36px/);
    // la X gialla c'è e il vecchio "nascosto" non vale per questa finestra
    assert.match(fin, /#replayModal > \.close-replay \{[^}]*visibility: visible[^}]*background: var\(--nb-giallo/);

    const adatta = matches.slice(matches.indexOf('function adattaReplayAlloSchermo()'), matches.indexOf("window.addEventListener('resize', () => { if (document.getElementById('replayModal')"));
    assert.match(adatta, /const perLarghezza = \(larghezza - 24\) \/ 1150;/);
    assert.match(adatta, /const perAltezza = \(altezza - 230\) \/ 647;/);
    assert.match(adatta, /Math\.min\(1, perLarghezza, Math\.max\(0\.5, perAltezza\)\)/);
    // l'immagine della console è 1920 × 1080: a 1150 px di larghezza è alta 647 px
    assert.equal(Math.round(1150 * 1080 / 1920), 647);
});

test('replay dentro la console: comandi piccoli (una pillola) quando la pagina ha la sua barra dei turni; Play e cartello di fine più piccoli', () => {
    const rs = docs('replay-sito.js');
    assert.match(rs, /\.barra-fuori \.comandi-replay \{ width: auto;/);
    assert.match(rs, /\.barra-fuori \.contatore-turni, \.barra-fuori #btn-inizio \{ display: none; \}/);
    assert.match(rs, /\.barra-fuori \.tasto \{ width: 30px; height: 28px; \}/);
    assert.match(rs, /@media \(max-width: 719px\) \{[^]*\.velo-avvio p \{ display: none; \}/);
    assert.equal(rs, fs.readFileSync(path.join(__dirname, '..', 'functions', 'replay-sito.js'), 'utf8'), 'le due copie sono identiche');
});
