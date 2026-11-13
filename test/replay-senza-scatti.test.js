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
        window: { innerHeight: altezza, matchMedia: () => ({ matches: false }) }, Math
    });
    vm.runInContext(matches.slice(inizio, fine) + '\nadattaReplayAlloSchermo();', ctx);
    return { classi: [...classi].sort(), scala: proprieta['--gba-scala'], righe: proprieta['--righe-campo'] };
}

test('la console non cambia misura né modalità quando compaiono o spariscono i cartellini del campo (colonna o riga, a tutte le misure di finestra)', () => {
    for (const [larghezza, altezza] of [[1920, 1080], [1536, 864], [1440, 900], [1366, 768], [1280, 720], [1100, 800], [1000, 700]]) {
        const senza = adatta({ larghezza, altezza, campo: false });
        const con = adatta({ larghezza, altezza, campo: true });
        assert.deepEqual(con, senza, `${larghezza}x${altezza}: con i cartellini la console resta com'era`);
        assert.ok(Number(senza.scala) > 0.3);
    }
    // la modalità la decide la finestra: larga, in colonna; stretta, in riga
    assert.ok(adatta({ larghezza: 1920, altezza: 1080, campo: false }).classi.includes('campo-laterale'));
    assert.ok(!adatta({ larghezza: 1100, altezza: 800, campo: false }).classi.includes('campo-laterale'));
    // in riga si riservano una o due righe di cartellini secondo la larghezza
    assert.equal(adatta({ larghezza: 1440, altezza: 900, campo: false }).righe, 1);
    assert.equal(adatta({ larghezza: 1100, altezza: 800, campo: false }).righe, 2);
});

test('in riga lo spazio della riga dei cartellini si toglie sempre alla console (con o senza cartellini): la console sta tutta nello schermo', () => {
    const r = adatta({ larghezza: 1440, altezza: 900, campo: false });
    // intestazione 157 + comandi 60 + momenti 26 + riga 27 + spazi: tutto dentro i 900 px
    assert.ok(647 * Number(r.scala) + 157 + 60 + 26 + 27 <= 900, `scala ${r.scala}`);
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
