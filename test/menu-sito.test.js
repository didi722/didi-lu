'use strict';
// Il pulsante del menù del sito (docs/menu-sito.js): sempre in vista in tutte le pagine, intero in cima e piccolo (solo icona) quando si scorre.
//   - la parte pura: dopo quanti pixel diventa compatto;
//   - il comportamento con una finestra finta: la classe menu-compatto su <body> segue lo scorrimento (anche di un contenitore grande quanto
//     lo schermo, mai di un elenco piccolo che scorre da solo), un solo aggiornamento per fotogramma;
//   - il cablaggio: ogni pagina con il tasto carica menu-sito.js dopo temi.js, e il foglio dei temi lo tiene fisso e lo rimpicciolisce.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../docs/menu-sito.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = f => fs.readFileSync(path.join(DOCS, f), 'utf8');

// una finestra e un documento finti, quanto basta: i fotogrammi si "suonano" a mano con ciclo()
function ambiente({ innerHeight = 800, innerWidth = 1200, caricamento = false } = {}) {
    const classi = new Set();
    const coda = [];
    const ascoltatori = {};
    const body = {
        nodeType: 1, scrollTop: 0, clientHeight: innerHeight, clientWidth: innerWidth,
        classList: { toggle: (c, acceso) => { if (acceso) classi.add(c); else classi.delete(c); }, contains: c => classi.has(c) }
    };
    const doc = {
        readyState: caricamento ? 'loading' : 'complete', body, documentElement: { nodeType: 1, scrollTop: 0 },
        addEventListener: (ev, f) => { ascoltatori['doc:' + ev] = f; }
    };
    const win = {
        document: doc, pageYOffset: 0, innerHeight, innerWidth,
        addEventListener: (ev, f, opz) => { ascoltatori[ev] = f; ascoltatori[ev + ':opz'] = opz; },
        requestAnimationFrame: f => { coda.push(f); return coda.length; }
    };
    return {
        win, doc, body, classi, ascoltatori,
        scorri(y, bersaglio) { win.pageYOffset = y; ascoltatori.scroll({ target: bersaglio || doc }); },
        ciclo() { const f = coda.splice(0); f.forEach(x => x()); return f.length; }
    };
}

test('compatto: solo oltre la soglia (60px), e solo con un numero vero', () => {
    assert.equal(M.SOGLIA, 60);
    assert.equal(M.compatto(0), false);
    assert.equal(M.compatto(60), false, 'esattamente sulla soglia è ancora intero');
    assert.equal(M.compatto(61), true);
    assert.equal(M.compatto(5000), true);
    for (const x of [undefined, null, NaN, 'abc', -10, '']) assert.equal(M.compatto(x), false, String(x));
    assert.equal(M.compatto('120'), true, 'un numero scritto come testo');
});

test('avvia: in cima il pulsante è intero, scorrendo si fa piccolo, tornando su torna intero', () => {
    const a = ambiente();
    M.avvia(a.win);
    assert.equal(a.classi.has('menu-compatto'), false, 'all\'apertura della pagina è intero');
    a.scorri(300);
    assert.equal(a.classi.has('menu-compatto'), false, 'si aggiorna al fotogramma successivo, non subito');
    a.ciclo();
    assert.equal(a.classi.has('menu-compatto'), true);
    a.scorri(20); a.ciclo();
    assert.equal(a.classi.has('menu-compatto'), false);
});

test('avvia: l\'ascolto è in cattura (lo scroll dei contenitori non risale alla finestra) e passivo', () => {
    const a = ambiente();
    M.avvia(a.win);
    assert.deepEqual(a.ascoltatori['scroll:opz'], { passive: true, capture: true });
});

test('avvia: molti scroll nello stesso fotogramma fanno un solo aggiornamento', () => {
    const a = ambiente();
    M.avvia(a.win);
    for (let y = 100; y < 400; y += 30) a.scorri(y);
    assert.equal(a.ciclo(), 1, 'un solo fotogramma in coda');
    assert.equal(a.classi.has('menu-compatto'), true);
    a.scorri(0);
    assert.equal(a.ciclo(), 1, 'dopo il fotogramma si può riprogrammare');
    assert.equal(a.classi.has('menu-compatto'), false);
});

test('avvia: un contenitore grande quanto lo schermo che scorre conta, un elenco piccolo che scorre da solo no', () => {
    const a = ambiente({ innerHeight: 800, innerWidth: 1200 });
    M.avvia(a.win);
    const grande = { nodeType: 1, scrollTop: 400, clientHeight: 780, clientWidth: 1180 };
    a.scorri(0, grande); a.ciclo();
    assert.equal(a.classi.has('menu-compatto'), true, 'una pagina che scorre dentro un suo contenitore');
    a.classi.delete('menu-compatto');
    const elenco = { nodeType: 1, scrollTop: 400, clientHeight: 200, clientWidth: 300 };
    a.scorri(0, elenco); a.ciclo();
    assert.equal(a.classi.has('menu-compatto'), false, 'una lista o una finestra che scorre da sola non rimpicciolisce il menù');
});

test('avvia: anche il body o l\'elemento radice che scorrono (alcune pagine hanno overflow sul body) contano', () => {
    const a = ambiente();
    M.avvia(a.win);
    a.body.scrollTop = 250;
    a.scorri(0); a.ciclo();
    assert.equal(a.classi.has('menu-compatto'), true);
    a.body.scrollTop = 0; a.doc.documentElement.scrollTop = 90;
    a.scorri(0); a.ciclo();
    assert.equal(a.classi.has('menu-compatto'), true);
    a.doc.documentElement.scrollTop = 0;
    a.scorri(0); a.ciclo();
    assert.equal(a.classi.has('menu-compatto'), false);
});

test('avvia: con la pagina ancora in caricamento aspetta DOMContentLoaded; senza finestra utile non fa niente', () => {
    const a = ambiente({ caricamento: true });
    M.avvia(a.win);
    assert.equal(typeof a.ascoltatori['doc:DOMContentLoaded'], 'function');
    assert.equal(M.avvia({}), null);
    assert.equal(M.avvia({ document: {} }), null);
});

test('cablaggio: ogni pagina con il tasto del menù carica menu-sito.js dopo temi.js', () => {
    for (const f of ['box', 'formats', 'hub', 'index', 'matches', 'players', 'profile', 'public', 'rules', 'stats']) {
        const html = leggi(f + '.html');
        const t = html.indexOf('<script src="temi.js"></script>');
        const m = html.indexOf('<script src="menu-sito.js"></script>');
        assert.ok(m > -1, `${f}.html: manca menu-sito.js`);
        if (t > -1) assert.ok(m > t, `${f}.html: menu-sito.js dopo temi.js`);
    }
});

test('foglio dei temi: il pulsante sta fisso in alto a destra in tutte le pagine e compatto è solo l\'icona (intero al passaggio e col fuoco)', () => {
    const css = leggi('temi.css');
    assert.match(css, /:is\(body\.nb, body\.pg-public\) \.top-auth-bar \{ position: fixed; top: 20px; right: 20px; z-index: 3000; \}/);
    assert.match(css, /body\.menu-compatto:is\(\.nb, \.pg-public\) \.auth-interaction:not\(:hover\):not\(:focus-visible\) \{ padding: 7px 10px; gap: 0; \}/);
    assert.match(css, /body\.menu-compatto:is\(\.nb, \.pg-public\) \.auth-interaction:not\(:hover\):not\(:focus-visible\) #auth-text \{ display: none; \}/);
});
