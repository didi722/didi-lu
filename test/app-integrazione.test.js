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

test('Riepilogo di stagione nell\'app: ha il suo foglio da gioco (non le carte bianche del sito): tag gialli, tessere scure, pedane, targhette nere', () => {
    const css = leggi('app-riepilogo.css');
    assert.match(leggi('app.js'), /const FOGLI_PAGINA = \{ 'matches\.html': \['app-riepilogo\.css'\] \};/);
    // i blocchi non sono carte: niente sfondo, bordo né ombra del sito
    assert.match(css, /html\.app-shell \.rs-b \{[^}]*padding: 0; background: none;[^}]*border: 0; border-radius: 0; box-shadow: none;/);
    // l'etichetta è un tag giallo storto, come quelli in alto
    assert.match(css, /html\.app-shell \.rs-t \{[^}]*position: static;[^}]*background: var\(--gx-giallo[^}]*transform: skewX\(-9deg\)/);
    // le tessere dei numeri: vetro scuro, numero grande e bianco
    assert.match(css, /html\.app-shell \.rs-lega-voce, html\.app-shell \.rs-lega-voce:nth-child\(even\) \{[^}]*background: rgba\(0, 0, 0, \.5\)[^}]*border: calc\(2\.5 \* var\(--u\)\) solid rgba\(255, 255, 255, \.28\)/);
    // il Pokémon e l'allenatore stanno su una pedana con un alone
    assert.match(css, /html\.app-shell \.rs-med::before \{[^}]*radial-gradient\(circle, color-mix\(in srgb, var\(--tipo/);
    assert.match(css, /html\.app-shell \.rs-med::after \{[^}]*border-radius: 50%;[^}]*border: calc\(3 \* var\(--u\)\) solid #000/);
    assert.match(css, /html\.app-shell \.rs-campione-testa::after \{[^}]*border-radius: 50%/);
    assert.match(css, /html\.app-shell \.rs-av-grande \{[^}]*image-rendering: pixelated/);
    // il nome è una targhetta nera con il testo del colore dell'allenatore
    assert.match(css, /html\.app-shell \.rs-campione-nome \{[^}]*background: #000; color: color-mix\(in srgb, var\(--c\) 70%, #fff\)/);
    // la classifica: righe di vetro scuro con la striscia nel colore dell'allenatore, il primo con il tag giallo; a più di sei righe, due colonne
    assert.match(css, /html\.app-shell \.rs-righe \{ display: flex; flex-direction: column; justify-content: flex-start;/);
    assert.match(css, /html\.app-shell \.rs-righe:has\(> \.cl-riga:nth-child\(7\)\) \{ display: grid; grid-auto-flow: column; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); grid-template-rows: repeat\(var\(--rs-meta, 5\), auto\);/);
    assert.match(leggi('riepilogo-stagione.js'), /righe\.style\.setProperty\('--rs-meta', String\(Math\.ceil\(righe\.children\.length \/ 2\)\)\)/);
    assert.match(css, /border-left: calc\(5 \* var\(--u\)\) solid var\(--cl-colore\)/);
    assert.match(css, /html\.app-shell \.rs \.cl-primo \.cl-pos \{ background: var\(--gx-giallo/);
    // la squadra ideale: tessere con il Pokémon a sinistra e, a destra, il formato (tag nel colore dell'allenatore), il nome e chi l'ha usato
    assert.match(css, /html\.app-shell \.rs-fcard \{\s*display: grid; grid-template-columns: auto minmax\(0, 1fr\); grid-template-areas: "med tag" "med nome" "med chi";/);
    // i premi: due per riga, tinti del colore di chi li ha vinti; più vincitori uno sotto l'altro (la tessera non si allarga)
    assert.match(css, /html\.app-shell \.rs-premio, html\.app-shell \.rs-premio:nth-child\(even\) \{\s*flex: 0 1 calc\(50% - 6 \* var\(--u\)\);[^}]*flex-direction: row;/);
    assert.match(css, /html\.app-shell \.rs-vincitori \{ flex-direction: column;/);
    // il foglio del sito non ha più i ritocchi visivi dell'app (stanno tutti qui), e sopra la prima etichetta c'è poca aria: il tag sta nel flusso
    const sito = leggi('riepilogo-stagione.css');
    assert.doesNotMatch(sito, /html\.app-shell \.(rs-righe|rs-fcard|rs-dato|rs-med-medio|rs-premio b)/);
    assert.match(sito, /html\.app-shell \.rs \{[^}]*padding-top: calc\(28 \* var\(--u\)\)/);
    assert.match(sito, /html\.app-shell \.rs-schermata \{[^}]*padding: calc\(10 \* var\(--u\)\)/);
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

test('Seasons nell\'app: la tessera del menù porta alla pagina delle stagioni (seasons.html); Shop e Hall of Fame non sono nell\'app', () => {
    const voce = A.VOCI.find(v => v.id === 'seasons');
    assert.ok(voce, 'tessera seasons');
    assert.equal(voce.href, 'seasons.html');
    assert.deepEqual(voce.pagine, ['seasons.html', 'hub.html'], 'l\'hub delle iscrizioni resta della tessera Seasons');
    assert.deepEqual(A.VOCI.map(v => v.id), ['play', 'seasons', 'box', 'trainers', 'stats'], 'Seasons è la seconda scheda, subito dopo Play');
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

test('Box nell\'app: le card dei team sono tutte alte uguale (la riga dei tag c\'è sempre, anche vuota)', () => {
    assert.match(leggi('app-gioco-pagine.css'), /grid-template-areas: "cat st" "nm ac" "pk pk" "bd bd"; grid-template-rows: auto auto auto calc\(22 \* var\(--u\)\);/);
});

test('Hub nell\'app: la "i" di un team apre solo il dettaglio (l\'anteprima da mouse non c\'è col dito e si chiude toccando)', () => {
    const hub = leggi('hub.html');
    assert.match(hub, /infoIcon\.onpointerenter = \(e\) => \{\s*if \(e\.pointerType !== 'mouse'\) return;/);
    assert.match(hub, /infoIcon\.onpointermove = \(e\) => \{\s*if \(e\.pointerType !== 'mouse'\) return;/);
    assert.doesNotMatch(hub, /infoIcon\.onmouseenter|infoIcon\.onmousemove|infoIcon\.onmouseleave/, 'gli eventi del mouse simulati dal tocco aprivano il fumetto');
    assert.match(hub, /infoIcon\.onclick = \(e\) => \{\s*e\.stopPropagation\(\);\s*nascondiAnteprima\(\);\s*apriDettaglioTeam\(/);
    assert.match(leggi('app-gioco-pagine.css'), /html\.app-shell body\.pg-hub #global-team-tooltip \{ display: none !important; \}/);
});
