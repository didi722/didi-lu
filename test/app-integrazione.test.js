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

test('app: niente scorrimento in giù — Box a fila di lato, Palestra e Hub bloccati, finestre scure (non carte bianche del sito)', () => {
    const pagine = leggi('app-gioco-pagine.css');
    // Box: i team in una fila sola che scorre di lato, a pagine
    assert.match(pagine, /html\.app-shell body\.pg-box \{ overflow: hidden !important; \}/);
    assert.match(pagine, /body\.pg-box #teamsGrid \{[^}]*grid-auto-flow: column;[^}]*overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory/);
    // la finestra delle etichette e quella per scegliere i team di un formato
    assert.match(pagine, /html\.app-shell #etichette-fondo \{ background: rgba\(5, 4, 15/);
    assert.match(pagine, /html\.app-shell \.etichette-finestra \{[^}]*background: linear-gradient/);
    assert.match(pagine, /body\.pg-hub #modal-select-team \{[^}]*background: linear-gradient/);
    assert.match(pagine, /body\.pg-hub #user-teams-list \{ display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important;/);
    assert.match(pagine, /body\.pg-hub \.neubru-badge-white \{ background: rgba\(0, 0, 0, \.5\) !important;/);
    // Palestra: la pagina sta nello schermo, le squadre in fila di lato, niente testi lunghi
    const palestra = leggi('style-palestra.css');
    assert.match(palestra, /html\.app-shell body\.pg-palestra \{ overflow: hidden !important; \}/);
    assert.match(palestra, /html\.app-shell \.pal-squadre \{ display: flex;[^}]*overflow-x: auto; overflow-y: hidden/);
    assert.match(palestra, /html\.app-shell \.pal-pagina \.pal-aiuto, [^{]*\{ display: none; \}/);
    // Hub e classifica/risultati (le tre schede del riepilogo): la pagina non ha 46 px di troppo
    const riep = leggi('riepilogo-stagione.css');
    assert.match(riep, /html\.app-shell\[data-mt="sd"\] body\.pg-matches[^{]*\{ overflow: hidden !important; \}/);
    assert.match(pagine, /html\.app-shell body\.pg-hub \{ overflow: hidden !important; \}/);
});

test('riepilogo di stagione nell\'app: le parti diventano schermate da scorrere di lato (non una pagina lunga), ognuna rimpicciolita per starci, con i pallini', () => {
    const js = leggi('riepilogo-stagione.js');
    const css = leggi('riepilogo-stagione.css');
    assert.match(js, /function raggruppaInSchermate\(doc, corpo\)/);
    assert.match(js, /function adattaSchermate\(rs\)/);
    assert.match(js, /classList\.contains\('app-shell'\)/, 'solo nell\'app (sul sito la pagina resta com\'è)');
    assert.match(js, /i \+= 4/, 'i premi: quattro per schermata');
    assert.match(css, /html\.app-shell #riepilogoStagione \.rs\[data-schermate\] \{[^}]*overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory/);
    assert.match(css, /html\.app-shell \.rs-schermata \{ flex: 0 0 100%;/);
    assert.match(css, /html\.app-shell \.rs-pallini i\.su \{/);
});

test('riepilogo: raggruppaInSchermate mette ogni parte nella sua schermata (i premi quattro per volta) e aggiunge un pallino per schermata', () => {
    const R = require('../docs/riepilogo-stagione.js');
    // un DOM minimo: solo ciò che usa la funzione
    const el = (classe, figli = []) => {
        const e = { classe, figli: [...figli], nodeType: 1, attrs: {}, listeners: {}, classi: new Set(String(classe || '').split(/\s+/).filter(Boolean)), style: {} };
        Object.defineProperty(e, 'className', { get: () => [...e.classi].join(' '), set: v => { e.classi = new Set(String(v).split(/\s+/).filter(Boolean)); } });
        Object.defineProperty(e, 'firstChild', { get: () => e.figli[0] || null });
        Object.defineProperty(e, 'children', { get: () => e.figli });
        e.appendChild = c => { e.figli.push(c); return c; };
        e.removeChild = c => { e.figli.splice(e.figli.indexOf(c), 1); return c; };
        e.cloneNode = (profondo) => el([...e.classi].join(' '), profondo ? e.figli.map(f => f.cloneNode(true)) : []);
        e.setAttribute = (k, v) => { e.attrs[k] = v; };
        e.hasAttribute = k => k in e.attrs;
        e.addEventListener = (k, f) => { e.listeners[k] = f; };
        e.classList = { toggle: () => {}, contains: c => e.classi.has(c) };
        e.querySelector = sel => trova(e, sel, true)[0] || null;
        e.querySelectorAll = sel => trova(e, sel, false);
        e.clientWidth = 800; e.scrollLeft = 0;
        return e;
    };
    // selettori usati: ".a", ":scope > .a", ":scope > .a, :scope > .b"
    function trova(radice, sel, uno) {
        const out = [];
        for (const parte of sel.split(',').map(s => s.trim())) {
            const diretto = parte.startsWith(':scope >');
            const classe = parte.replace(':scope >', '').trim().replace(/^\./, '');
            const visita = (n, prof) => { for (const f of n.figli) { if (f.classi && f.classi.has(classe) && (!diretto || prof === 0)) out.push(f); if (!diretto) visita(f, prof + 1); } };
            visita(radice, 0);
        }
        return uno ? out.slice(0, 1) : out;
    }
    const doc = { createElement: () => el('') };
    const premi = Array.from({ length: 9 }, () => el('rs-premio'));
    const rs = el('rs', [el('rs-stagione'), el('rs-campione'), el('rs-mvp'), el('rs-classifica'), el('rs-formati'), el('rs-usati'), el('rs-premi', [el('rs-t'), el('rs-premi-lista', premi)])]);
    const corpo = el('corpo', [rs]);
    const risultato = R.raggruppaInSchermate(doc, corpo);
    assert.equal(risultato, rs);
    // stagione | campione+mvp | classifica | squadra ideale | più usati | 9 premi = 3 schermate (4+4+1)
    assert.equal(rs.attrs['data-schermate'], '8');
    assert.equal(rs.figli.length, 8);
    assert.ok(rs.figli.every(s => s.classi.has('rs-schermata')));
    assert.equal(rs.figli[1].figli[0].figli.length, 2, 'campione e MVP stanno insieme');
    assert.equal((corpo.figli[corpo.figli.length - 1].innerHTML.match(/<i><\/i>/g) || []).length, 8, 'un pallino per schermata');
    // una seconda chiamata non rifà nulla
    assert.equal(R.raggruppaInSchermate(doc, corpo), null);
});
