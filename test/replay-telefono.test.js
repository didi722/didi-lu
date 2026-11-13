'use strict';
// Il replay sul telefono (browser): niente scocca, la partita (640 × 360) grande quanto ci sta, le condizioni del campo fuori dal flusso (non spostano più la
// console) e le altre parti (intestazione, comandi, set, momenti chiave) attorno alla partita. In orizzontale set a sinistra, comandi e momenti a destra.
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

// la funzione vera di matches.html, con una finestra finta: elementi che hanno un'altezza e una classList
function prova({ larghezza, altezza, app = false, tel = true, altezze = {} }) {
    const inizio = matches.indexOf('function adattaReplayAlloSchermo()');
    const fine = matches.indexOf("window.addEventListener('resize'", inizio);
    assert.ok(inizio > 0 && fine > inizio, 'adattaReplayAlloSchermo c\'è');
    const classiModal = new Set();
    const proprieta = {};
    const elemento = sel => (altezze[sel] === undefined ? null : { offsetHeight: altezze[sel], offsetParent: {}, offsetWidth: 90, hidden: false, childElementCount: 0 });
    const modal = {
        classList: { add: c => classiModal.add(c), remove: c => classiModal.delete(c), contains: c => classiModal.has(c), toggle: (c, v) => (v ? classiModal.add(c) : classiModal.delete(c)) },
        style: { setProperty: (k, v) => { proprieta[k] = v; } },
        querySelector: elemento
    };
    const finestra = {
        innerHeight: altezza,
        matchMedia: q => ({ matches: tel && /max-width: 900px/.test(q) && (larghezza <= 900 || (altezza <= 520)) })
    };
    const documento = {
        getElementById: id => (id === 'replayModal' ? modal : null),
        documentElement: { clientWidth: larghezza, clientHeight: altezza, classList: { contains: c => c === 'app-shell' && app } }
    };
    const ctx = vm.createContext({ document: documento, window: finestra, Math });
    vm.runInContext(matches.slice(inizio, fine) + '\nadattaReplayAlloSchermo();', ctx);
    return { classi: [...classiModal].sort(), scala: Number(proprieta['--gba-scala']) };
}

test('telefono in verticale: classe tel, la scena (640 px) sta nella larghezza, niente console rimpicciolita a un francobollo', () => {
    const r = prova({ larghezza: 390, altezza: 844, altezze: { '.replay-mini-header': 130, '.replay-campo': 100 } });
    assert.deepEqual(r.classi, ['tel']);
    assert.ok(Math.abs(r.scala - (390 - 16) / 640) < 0.002, `scala ${r.scala}`);
    // 390 px: la scena è 374 px (la console di prima, 366 px, dava uno schermo di 124)
    assert.ok(640 * r.scala >= 370);
});

test('telefono in orizzontale: classe tel-orizz, la scena sta in altezza (con intestazione e striscia del campo) e nella larghezza che lasciano i lati', () => {
    const r = prova({ larghezza: 844, altezza: 390, altezze: { '.replay-mini-header': 49, '.replay-campo': 25 } });
    assert.deepEqual(r.classi, ['tel', 'tel-orizz']);
    assert.ok(360 * r.scala + 49 + 25 + 32 <= 390 + 0.5, 'non esce dall\'altezza');
    assert.ok(640 * r.scala + 224 <= 844 + 0.5, 'non esce dalla larghezza');
    // ... e senza condizioni del campo la partita è più grande
    const senza = prova({ larghezza: 844, altezza: 390, altezze: { '.replay-mini-header': 49 } });
    assert.ok(senza.scala > r.scala);
    // un telefono largo (932 × 430) è limitato dall'altezza, uno stretto (667 × 375) dalla larghezza
    assert.ok(360 * prova({ larghezza: 932, altezza: 430, altezze: { '.replay-mini-header': 49, '.replay-campo': 25 } }).scala <= 430 - 49 - 25 - 32);
    assert.ok(Math.abs(prova({ larghezza: 667, altezza: 375, altezze: { '.replay-mini-header': 49, '.replay-campo': 25 } }).scala - (667 - 224) / 640) < 0.002);
});

test('sul desktop la console resta com\'è (niente classi del telefono), nell\'app c\'è il suo aspetto', () => {
    const desktop = prova({ larghezza: 1300, altezza: 900, tel: false, altezze: { '.replay-mini-header': 150, '.replay-comandi': 60 } });
    assert.deepEqual(desktop.classi, []);
    assert.ok(desktop.scala <= 1);
    const app = prova({ larghezza: 844, altezza: 390, app: true });
    assert.deepEqual(app.classi, [], 'nell\'app non si toccano le classi: ha il suo CSS (html.app-shell)');
});

test('CSS del telefono: palco trasparente al layout, scocca nascosta, scena 640 × 360 e condizioni del campo che non occupano più tutta l\'altezza', () => {
    const regola = sel => {
        const i = finestre.indexOf(sel + ' {');
        assert.ok(i >= 0, sel);
        return finestre.slice(i, finestre.indexOf('}', i));
    };
    assert.match(regola('html:not(.app-shell) #replayModal.tel .replay-palco'), /display: contents/);
    assert.match(regola('html:not(.app-shell) #replayModal.tel .gba-shell'), /display: none/);
    assert.match(regola('html:not(.app-shell) #replayModal.tel .gba-container'), /width: 640px/);
    assert.match(regola('html:not(.app-shell) #replayModal.tel .replay-content'), /width: 640px; height: 360px/);
    // il guasto: `flex: 1 0 100%` letto sull'altezza faceva dei cartellini blocchi altissimi e spingeva la console fuori dallo schermo
    assert.match(finestre, /#replayModal\.tel \.replay-campo \{ flex: 0 0 auto;/);
    assert.match(regola('html:not(.app-shell) #replayModal.tel .replay-comandi'), /order: 2/);
    // orizzontale: griglia (set | partita), comandi e momenti in una colonna fissa a destra
    assert.match(finestre, /#replayModal\.tel-orizz\[style\*="flex"\] \{\s*display: grid !important/);
    assert.match(regola('html:not(.app-shell) #replayModal.tel-orizz .set-selector'), /grid-column: 1/);
    assert.match(regola('html:not(.app-shell) #replayModal.tel-orizz .replay-momenti').replace(/\n/g, ' '), /position: fixed/);
});
