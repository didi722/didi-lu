'use strict';
// Il replay su PC non scatta: quello che arriva dopo (striscia dei momenti chiave, comandi, condizioni del campo, intestazione, badge, scocca) ha il suo posto riservato
// da subito, la modalità delle condizioni (colonna o riga) e la misura della console non dipendono da cosa c'è in quel momento, e la finestra compare tutta insieme.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const matches = fs.readFileSync(path.join(DOCS, 'matches.html'), 'utf8');
const finestre = fs.readFileSync(path.join(DOCS, 'finestre.css'), 'utf8');

// la funzione vera di matches.html con una finestra finta; `campo` dice se in quel momento ci sono cartellini del campo (cambia solo `hidden`)
function adatta({ larghezza, altezza, campo, altezze = { '.replay-mini-header': 157, '.replay-comandi': 60, '#replayMomenti': 26, '.replay-campo': 27 } }) {
    const inizio = matches.indexOf('function adattaReplayAlloSchermo()');
    const fine = matches.indexOf("window.addEventListener('resize'", inizio);
    const classi = new Set(), proprieta = {};
    const elemento = sel => (altezze[sel] === undefined ? null : { offsetHeight: altezze[sel], offsetParent: {}, offsetWidth: 90, hidden: sel === '.replay-campo' ? !campo : false, childElementCount: campo ? 5 : 0 });
    const modal = {
        classList: { add: c => classi.add(c), remove: c => classi.delete(c), contains: c => classi.has(c), toggle: (c, v) => (v ? classi.add(c) : classi.delete(c)) },
        style: { setProperty: (k, v) => { proprieta[k] = v; } },
        querySelector: elemento
    };
    const ctx = vm.createContext({
        document: { getElementById: () => modal, documentElement: { clientWidth: larghezza, clientHeight: altezza, classList: { contains: () => false } } },
        window: { innerHeight: altezza, matchMedia: () => ({ matches: false }) }, Math, posizionaConsoleReplay: () => {}
    });
    vm.runInContext(matches.slice(inizio, fine) + '\nadattaReplayAlloSchermo();', ctx);
    return { classi: [...classi].sort(), larg: proprieta['--schermo-larg'], sch: proprieta['--sch'], righe: proprieta['--righe-campo'] };
}

test('lo schermo non cambia misura né modalità quando compaiono o spariscono i cartellini del campo (colonna o riga, a tutte le misure di finestra)', () => {
    for (const [larghezza, altezza] of [[1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 720], [1100, 800], [1000, 700]]) {
        const senza = adatta({ larghezza, altezza, campo: false });
        const con = adatta({ larghezza, altezza, campo: true });
        assert.deepEqual(con, senza, `${larghezza}x${altezza}: con i cartellini lo schermo resta com'era`);
        assert.ok(parseFloat(senza.larg) >= 420, `${larghezza}x${altezza}: schermo largo ${senza.larg}`);
    }
    // la modalità la decide la finestra: larga, in colonna; stretta, in riga
    assert.ok(adatta({ larghezza: 1920, altezza: 1080, campo: false }).classi.includes('campo-laterale'));
    assert.ok(!adatta({ larghezza: 900, altezza: 700, campo: false }).classi.includes('campo-laterale'), 'una finestra stretta: i cartellini in riga sopra lo schermo');
    // in riga si riservano una o due righe di cartellini secondo la larghezza
    assert.equal(adatta({ larghezza: 1440, altezza: 900, campo: false }).righe, 1);
    assert.equal(adatta({ larghezza: 900, altezza: 700, campo: false }).righe, 2);
});

test('in riga lo spazio della riga dei cartellini si toglie sempre allo schermo (con o senza cartellini): lo schermo sta tutto nella finestra', () => {
    const r = adatta({ larghezza: 1440, altezza: 900, campo: false });
    // intestazione 157 + comandi 60 + momenti 26 + riga 27 + spazi: tutto dentro i 900 px (lo schermo è il campo, 438 × 360 ingranditi)
    const alto = parseFloat(r.larg) * 360 / 438;
    assert.ok(alto + 157 + 60 + 26 + 27 <= 900, `schermo ${r.larg}`);
    // la scala dei 438 px della scena dà proprio la larghezza dello schermo
    assert.ok(Math.abs(parseFloat(r.sch) * 438 - parseFloat(r.larg)) < 0.5);
});

test('lo schermo del replay da PC è grande: occupa quanto ci sta (in altezza) fino a metà finestra circa, e mai meno di 420 px', () => {
    const grande = adatta({ larghezza: 1920, altezza: 950, campo: true });
    assert.ok(parseFloat(grande.larg) > 700, `a 1920 × 950 lo schermo è largo ${grande.larg}`);
    assert.ok(parseFloat(grande.larg) <= 1920 * 0.48 + 0.5);
    const piccola = adatta({ larghezza: 900, altezza: 500, campo: false });
    assert.ok(parseFloat(piccola.larg) >= 420);
    // intero: niente mezzi pixel che farebbero un pixel di scorrimento
    assert.match(grande.larg, /^\d+px$/);
});

test('CSS: i posti di comandi, momenti chiave e riga del campo sono riservati anche quando sono nascosti; la loro larghezza non allarga il palco', () => {
    assert.match(finestre, /#replayModal:not\(\.tel\) \.replay-comandi\[hidden\],\s*html:not\(\.app-shell\) #replayModal:not\(\.tel\) \.replay-momenti\[hidden\] \{ display: flex; visibility: hidden; \}/);
    assert.match(finestre, /#replayModal:not\(\.tel\) \.replay-momenti \{ min-height: 26px; \}/);
    assert.match(finestre, /\.replay-campo \{ min-height: calc\(27px \* var\(--righe-campo, 2\)[^}]*contain: inline-size; \}/);
    assert.match(finestre, /\.replay-campo\[hidden\] \{ display: flex; visibility: hidden; \}/);
    // la scocca ha le sue dimensioni dichiarate (senza, finché non arriva l'immagine non ha altezza e al suo arrivo tutto salta)
    assert.match(matches, /<img src="immagini\/advance\.png" class="gba-shell" alt="GBA Shell" width="1920" height="1080">/);
});

test('apertura: la finestra si mostra subito ma il resto è invisibile finché intestazione, set, badge e scocca non sono pronti; poi compare tutto insieme', () => {
    assert.match(finestre, /#replayModal\.in-preparazione > :not\(\.close-replay\) \{ visibility: hidden; \}/);
    const apri = matches.slice(matches.indexOf('async function apriMatch('), matches.indexOf('window.gestisciClickReplay'));
    assert.ok(apri.indexOf("modal.classList.add('in-preparazione')") < apri.indexOf("modal.style.display = 'flex'"), 'prima si nasconde il contenuto, poi si apre la finestra');
    assert.match(apri, /badgePromesse\.push\(BadgeTeam\.montaMini\(/, 'i badge si aspettano');
    assert.match(apri, /\} finally \{[\s\S]*Promise\.race\(\[Promise\.all\(attese\), new Promise\(ok => setTimeout\(ok, 1000\)\)\]\)[\s\S]*adattaReplayAlloSchermo\(\);\s*modal\.classList\.remove\('in-preparazione'\)/, 'si aspetta al massimo un secondo, si misura e si scopre');
    // chiudendo, o con un'apertura più recente, quella in preparazione non scopre più niente
    assert.match(apri, /window\.aperturaReplay === aperturaDi/);
    assert.match(matches, /window\.aperturaReplay = \(window\.aperturaReplay \|\| 0\) \+ 1;[^\n]*\n\s*if \(modal\) \{\s*modal\.style\.display = "none";\s*modal\.classList\.remove\('in-preparazione'\);/);
});

test('replay da PC: i due allenatori ai lati della console, dietro a tutto e fuori dal flusso (niente si sposta), con la riga in diagonale; non sul telefono né nell\'app', () => {
    const regola = sel => {
        const i = finestre.indexOf(sel + ' {');
        assert.ok(i >= 0, sel);
        return finestre.slice(i, finestre.indexOf('}', i)).replace(/\s+/g, ' ');
    };
    // nascosto di default, mostrato solo da PC (né .tel né app)
    assert.match(regola('#replayModal .replay-versus'), /display: none/);
    const pc = regola('html:not(.app-shell) #replayModal:not(.tel) .replay-versus');
    assert.match(pc, /display: block; position: fixed; inset: 0; z-index: -1;[^}]*pointer-events: none/, 'fuori dal flusso, sotto ogni cosa, e il clic passa (chiude la finestra)');
    assert.match(pc, /--rv-h: clamp\(150px, calc\(var\(--rv-margine\) \* 1\.15\), 46vh\)/, 'la grandezza segue lo spazio che la console lascia ai lati');
    assert.match(pc, /--rv-margine: calc\(\(100vw - var\(--schermo-larg, calc\(1150px \* var\(--gba-scala, 1\)\)\) - 106px\) \/ 2\)/, 'i lati sono quello che lo schermo grande lascia');
    // la riga in diagonale come nel simulatore (60% in alto, 40% in basso), senza colori di sfondo
    assert.match(finestre, /\.rv-taglio-b \{[^}]*clip-path: polygon\(calc\(60% - 7px\) 0, calc\(60% \+ 7px\) 0, calc\(40% \+ 7px\) 100%, calc\(40% - 7px\) 100%\)/);
    // le due metà: colore e motivo della pagina pubblica di ognuno (--pp-sfondo*), un po' trasparenti
    assert.match(finestre, /\.rv-lato \{[^}]*opacity: \.6;[^}]*background-image: var\(--pp-sfondo-img, none\)/);
    assert.match(finestre, /\.rv-lato-a \{ clip-path: [^}]*--pp-sfondo: var\(--c1, #555\)/);
    assert.match(finestre, /\.rv-lato-c \{ clip-path: [^}]*--pp-sfondo: var\(--c2, #555\)/);
    // il primo a sinistra rivolto verso la console, il secondo a destra
    assert.match(finestre, /\.rv-sx \{ left: [^}]*scaleX\(-1\)/);
    assert.match(finestre, /\.rv-dx \{ right: /);
    // resta invisibile con il resto della finestra finché non è tutto pronto (.in-preparazione > :not(.close-replay))
    assert.match(finestre, /#replayModal\.in-preparazione > :not\(\.close-replay\) \{ visibility: hidden; \}/);
});

test('replay da PC: gli avatar si leggono con i colori, si montano all\'apertura (il vecchio sfondo si toglie) e la finestra aspetta che siano caricati prima di comparire', () => {
    assert.match(matches, /document\.querySelectorAll\('\.replay-versus'\)\.forEach\(e => e\.remove\(\)\)/);
    assert.match(matches, /Promise\.all\(\[getPlayersColors\(sdData\.info\.player1, sdData\.info\.player2\), aspettoDeiGiocatori\(\[sdData\.info\.player1, sdData\.info\.player2\]\)/);
    assert.match(matches, /modal\.prepend\(versus\.box\);\s*immaginiVersus = versus\.caricate;/);
    assert.match(matches, /attese\.push\(Promise\.all\(immaginiVersus\)\)/);
    // l'attesa vale solo se lo sfondo è visibile (sul telefono e nell'app è display: none): getComputedStyle, non offsetParent (con position: fixed è sempre null)
    assert.match(matches, /getComputedStyle\(versusBox\)\.display !== 'none'/);
});

test('creaSfondoVersus: la riga con i due colori e un avatar per lato (il primo a sinistra); senza avatar o con avatar rotto non resta niente e l\'attesa finisce lo stesso', async () => {
    const inizio = matches.indexOf('function creaSfondoVersus(');
    const fine = matches.indexOf('function renderGifs(', inizio);
    assert.ok(inizio > 0 && fine > inizio);
    const el = (tag) => {
        const e = { tag, figli: [], stile: {}, attrs: {}, className: '', onload: null, onerror: null };
        e.appendChild = c => { c.padre = e; e.figli.push(c); return c; };
        e.remove = () => { if (e.padre) e.padre.figli.splice(e.padre.figli.indexOf(e), 1); };
        e.setAttribute = (k, v) => { e.attrs[k] = v; };
        e.style = { setProperty: (k, v) => { e.stile[k] = v; } };
        Object.defineProperty(e, 'src', { set: v => { e._src = v; setTimeout(() => (/rotto/.test(v) ? e.onerror : e.onload)(), 0); }, get: () => e._src });
        return e;
    };
    const ctx = vm.createContext({ document: { createElement: el }, setTimeout, Promise });
    vm.runInContext(matches.slice(inizio, fine) + '\nthis.creaSfondoVersus = creaSfondoVersus;', ctx);
    const r = ctx.creaSfondoVersus('https://x/uno.png', 'https://x/rotto.png', '#31c489', '#e0457b');
    assert.equal(r.box.className, 'replay-versus');
    assert.equal(r.box.attrs['aria-hidden'], 'true');
    assert.equal(r.box.stile['--c1'], '#31c489');
    assert.equal(r.box.stile['--c2'], '#e0457b');
    assert.equal(r.box.figli.filter(f => f.tag === 'i').length, 3, 'metà del primo, riga nera, metà del secondo');
    assert.equal(r.caricate.length, 3, 'la scocca e i due avatar');
    await Promise.all(r.caricate);        // anche quello rotto finisce (e si toglie)
    const immagini = r.box.figli.filter(f => f.tag === 'img');
    const avatar = immagini.filter(f => /rv-avatar/.test(f.className));
    assert.equal(avatar.length, 1, 'l\'avatar rotto non resta');
    assert.equal(avatar[0].className, 'rv-avatar rv-sx');
    // la scocca del Game Boy Advance sta nello strato, prima degli avatar (quindi sotto)
    const console_ = immagini.find(f => f.className === 'rv-console');
    assert.ok(console_ && /immagini\/advance\.png$/.test(console_.src), 'la scocca c\'è');
    assert.ok(r.box.figli.indexOf(console_) < r.box.figli.indexOf(avatar[0]), 'la scocca sta sotto gli avatar');
    assert.equal(ctx.creaSfondoVersus('', '', '#000', '#000').caricate.length, 1, 'senza avatar resta da aspettare solo la scocca');
});

test('replay da PC: la scocca grande e semitrasparente è indipendente dallo schermo (nello strato dietro), che mostra solo il campo senza le bande di Showdown; non sul telefono né nell\'app', () => {
    const regola = sel => {
        const i = finestre.indexOf(sel + ' {');
        assert.ok(i >= 0, sel);
        return finestre.slice(i, finestre.indexOf('}', i)).replace(/\s+/g, ' ');
    };
    assert.match(regola('#replayModal .rv-console'), /display: none/, 'nascosta di default (telefono e app)');
    const grande = regola('html:not(.app-shell) #replayModal:not(.tel) .rv-console');
    assert.match(grande, /position: absolute;[^}]*opacity: \.5;[^}]*pointer-events: none/, 'semitrasparente e il clic passa');
    assert.match(grande, /width: calc\(var\(--schermo-larg, 640px\) \/ \.34\)/, 'lo schermo bianco dell\'immagine (34%) largo quanto lo schermo');
    assert.match(grande, /left: calc\(var\(--sx, 50vw\)[^;]*\.498\)/);
    assert.match(grande, /top: calc\(var\(--sy, 50vh\)[^;]*\.505\)/);
    // la vecchia scocca nel flusso non c'è più e lo schermo è la finestra (campo 438 × 360, senza le bande)
    assert.match(regola('html:not(.app-shell) #replayModal:not(.tel) .gba-shell'), /display: none/);
    assert.match(regola('html:not(.app-shell) #replayModal:not(.tel) .gba-container'), /width: var\(--schermo-larg, 438px\); height: calc\(var\(--schermo-larg, 438px\) \* 360 \/ 438\)/);
    assert.match(regola('html:not(.app-shell) #replayModal:not(.tel) .gba-screen-area .replay-content'), /width: 438px; height: 360px;[^}]*zoom: var\(--sch, 1\)/);
    // le bande laterali (circa il 16% a destra e a sinistra della scena 640 × 360) restano fuori dalla finestra
    assert.match(regola('html:not(.app-shell) #replayModal:not(.tel) #replayFrame'), /left: -101px; width: 640px/);
    assert.equal(640 - 2 * 101, 438, 'il campo che resta è largo 438 px');
    // lo schermo si centra sulla scocca: --sx e --sy li scrive posizionaConsoleReplay e si rifanno quando cambia qualcosa
    assert.match(matches, /modal\.style\.setProperty\('--sx', /);
    assert.match(matches, /modal\.style\.setProperty\('--sy', /);
    assert.match(matches, /new ResizeObserver\(\(\) => posizionaConsoleReplay\(/);
});
