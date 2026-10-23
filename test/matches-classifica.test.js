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
test('replay: intestazione, palco (console con i set a destra) e comandi nel flusso; la console si scala sullo spazio libero', () => {
    const fin = docs('finestre.css');
    assert.match(fin, /#replayModal\.replay-modal \{[^}]*flex-direction: column/);
    const intest = /#replayModal \.replay-mini-header \{[^}]*\}/.exec(fin)[0];
    assert.match(intest, /position: relative/, 'non più in assoluto sopra la console');
    assert.match(intest, /width: min\(1120px, 100%\)/);
    assert.match(intest, /flex: 0 0 auto/, 'l\'intestazione non si schiaccia mai');
    assert.match(fin, /#replayModal \.replay-palco \{[^}]*flex-direction: row/, 'la console e i set stanno su una riga');
    const set = /#replayModal \.set-selector \{[^}]*\}/.exec(fin)[0];
    assert.match(set, /position: static !important/);
    assert.match(fin, /#replayModal \.set-lista \{[^}]*flex-direction: column/, 'i tasti dei set sono in verticale, a destra della console');
    assert.match(fin, /#replayModal \.replay-palco \{ flex-direction: column;/, 'sul telefono i set vanno sotto');
    // i comandi (pausa, avanti, 2x...) stanno fuori dalla scocca, sotto la console
    const comandi = /#replayModal \.replay-comandi \{[^}]*\}/.exec(fin)[0];
    assert.match(comandi, /order: 4/);
    // i set sono tasti piccoli
    const tasto = /#replayModal button\.btn-set \{[^}]*\}/.exec(fin)[0];
    assert.match(tasto, /width: 40px;[^}]*height: 36px/);
    // la X gialla c'è e il vecchio "nascosto" non vale per questa finestra
    assert.match(fin, /#replayModal > \.close-replay \{[^}]*visibility: visible[^}]*background: var\(--nb-giallo/);

    const adatta = matches.slice(matches.indexOf('function adattaReplayAlloSchermo()'), matches.indexOf("window.addEventListener('resize', () => { if (document.getElementById('replayModal')"));
    assert.match(adatta, /const perLarghezza = \(larghezza - 24 - tastiSet\) \/ 1150;/, 'la larghezza dei tasti dei set a destra si toglie');
    assert.match(adatta, /const riservato = alto\('\.replay-mini-header'\) \+ alto\('\.replay-campo'\) \+ alto\('\.replay-comandi'\)/, 'lo spazio per l\'intestazione, il campo e i comandi si misura');
    assert.match(adatta, /const perAltezza = \(altezza - riservato\) \/ 647;/);
    assert.match(adatta, /Math\.min\(1, perLarghezza, Math\.max\(0\.5, perAltezza\)\)/);
    // l'immagine della console è 1920 × 1080: a 1150 px di larghezza è alta 647 px
    assert.equal(Math.round(1150 * 1080 / 1920), 647);
});

test('replay dentro la console: i comandi vanno fuori dalla scocca se la pagina li sa usare (postMessage), niente barra dei turni sotto la scocca', () => {
    const rs = docs('replay-sito.js');
    // il replay avvisa la pagina dello stato e, quando la pagina risponde, toglie i suoi comandi dallo schermo
    assert.match(rs, /\.comandi-fuori \.comandi-replay \{ display: none; \}/);
    assert.match(rs, /tipo: 'replay-stato', inPausa: inPausa\(\), velocita: VELOCITA\[velocita\]\.etichetta, muto/);
    assert.match(rs, /e\.data\.tipo === 'replay-comandi-fuori'\) document\.documentElement\.classList\.add\('comandi-fuori'\)/);
    assert.match(rs, /e\.data\.tipo === 'replay-comando' && Object\.prototype\.hasOwnProperty\.call\(COMANDI, e\.data\.comando\)/);
    // la barra del progresso dei set (la vecchia "turn x/y" sotto la scocca) non c'è più
    assert.doesNotMatch(rs, /barra-fuori|replay-turni|replay-vai/);
    assert.match(rs, /@media \(max-width: 719px\) \{[^]*\.velo-avvio p \{ display: none; \}/);
    assert.equal(rs, fs.readFileSync(path.join(__dirname, '..', 'functions', 'replay-sito.js'), 'utf8'), 'le due copie sono identiche');
});

test('classifica: il tasto VS sparisce quando contro quel giocatore non resta nulla da giocare', () => {
    const sfide = docs('sfide.js');
    const f = sfide.slice(sfide.indexOf('function dacoSfidare(D, nome)'), sfide.indexOf('// 5. Finestra per lanciare la sfida'));
    assert.match(f, /if \(!dacoSfidare\(D, nome\)\) return '';/);
    assert.match(f, /formatiOccupati\(D, D\.io, nome\)\.occupati\.size\) return true;\s*return formatiStagione\(D\)\.some\(f => rimasti\(D, D\.io, nome, f\) > 0\);/);
    // la classifica è disegnata prima che arrivino gli showdown: i tasti già in pagina si aggiornano quando i dati cambiano
    assert.match(f, /function aggiornaBottoniRanking\(\)[\s\S]*b\.hidden = !dacoSfidare\(D, b\.dataset\.nome\)/);
    assert.match(sfide, /disegnaCampanella\(\);\s*aggiornaBottoniRanking\(\);\s*\}/);
    assert.match(docs('style-sfide.css'), /\.sfida-rank-btn\[hidden\] \{ display: none !important; \}/);
    // la stessa regola della finestra di sfida: "You have played every showdown against ..." quando non c'è nessun formato libero né occupato
    assert.match(sfide, /You have played every showdown against/);
});

test('replay: meteo, terreni e condizioni dei lati stanno fuori dallo schermo del GBA (sopra la console), non sopra le barre della salute', () => {
    const fs = require('node:fs'), path = require('node:path');
    const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
    const replay = leggi('replay-sito.js'), pagina = leggi('matches.html'), css = leggi('finestre.css');
    // il replay manda le voci alla pagina e toglie i suoi cartellini quando la pagina li disegna
    assert.match(replay, /tipo: 'replay-campo'/);
    assert.match(replay, /replay-campo-fuori/);
    assert.match(replay, /\.campo-fuori \.effetti \{ display: none; \}/);
    // la pagina li disegna in una striscia sopra la console, con solo testo
    assert.match(pagina, /id="replayCampo"/);
    assert.match(pagina, /e\.data\.tipo !== 'replay-campo'/);
    assert.doesNotMatch(pagina.slice(pagina.indexOf("tipo !== 'replay-campo'"), pagina.indexOf("tipo !== 'replay-campo'") + 1500), /innerHTML/);
    assert.match(css, /#replayModal \.replay-campo \{\s*order: 2;/);
    assert.match(css, /#replayModal \.replay-palco \{ order: 3;/);
    // l'altezza della striscia si toglie dallo spazio della console
    assert.match(pagina, /alto\('\.replay-campo'\)/);
});
