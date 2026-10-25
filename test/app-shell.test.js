'use strict';
// Lo scheletro da telefono dell'app (docs/app-shell.js, app-pagine.css, app-battaglia.css, e le parti nuove di app.css/app.js):
//   - la parte pura: titolo della barra, iniziale dell'account, voci del foglio, barra che si nasconde, trascinamento per chiudere, schede;
//   - le schede (Profile): create con una pagina finta, si cambia scheda, quella scelta si ricorda e si può nominare nell'indirizzo;
//   - il cablaggio: i fogli di stile esistono, sono scaricati solo dall'app e riguardano solo l'app; i selettori che le schede e i fogli usano esistono nelle pagine;
//   - i fogli in sé: ogni regola sta sotto html.app-shell (o html.app per la battaglia) e dentro le condizioni dello schermo stretto.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/app-shell.js');
const A = require('../docs/app.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');

// ---------- la parte pura ----------

test('nomePagina / èRadice: le cinque pagine della barra in basso sono "di primo livello" (lì c\'è il logo, altrove la freccia indietro)', () => {
    assert.equal(S.nomePagina('/didi-lu/Profile.html?x=1#y'), 'profile.html');
    assert.equal(S.nomePagina('/didi-lu/'), 'index.html');
    for (const p of ['index.html', 'matches.html', 'box.html', 'players.html', 'stats.html']) assert.equal(S.èRadice('/didi-lu/' + p), true, p);
    for (const p of ['hub.html', 'profile.html', 'palmares.html', 'formats.html', 'rules.html', 'public.html']) assert.equal(S.èRadice('/didi-lu/' + p), false, p);
    // la barra in basso e quella in alto parlano delle stesse pagine
    assert.deepEqual([...S.RADICI].sort(), A.VOCI.map(v => v.href).sort());
    assert.deepEqual([...S.NELLA_BARRA].sort(), A.VOCI.map(v => v.href).sort());
});

test('titolo: quello scritto nella pagina, ripulito; se manca o è troppo lungo, quello della pagina', () => {
    assert.equal(S.titolo('/didi-lu/box.html', '  Didi\'s \n  Box '), 'Didi\'s Box');
    assert.equal(S.titolo('/didi-lu/box.html', ''), 'My box');
    assert.equal(S.titolo('/didi-lu/stats.html', undefined), 'Stats');
    assert.equal(S.titolo('/didi-lu/rules.html', 'x'.repeat(41)), 'Rulebook');
    assert.equal(S.titolo('/didi-lu/qualcosa.html', ''), 'Sant\'Alvise');
    for (const p of ['index.html', 'hub.html', 'matches.html', 'box.html', 'players.html', 'stats.html', 'profile.html', 'formats.html', 'rules.html', 'palmares.html', 'public.html']) {
        assert.ok(S.TITOLI[p], `manca il titolo di ${p}`);
        assert.ok(fs.existsSync(path.join(DOCS, p)), `${p} non esiste`);
    }
});

test('iniziale: la prima lettera o cifra in maiuscolo, "?" senza nome', () => {
    assert.equal(S.iniziale('didi'), 'D');
    assert.equal(S.iniziale('  àlex'), 'À');
    assert.equal(S.iniziale('7up'), '7');
    assert.equal(S.iniziale('***'), '?');
    assert.equal(S.iniziale(''), '?');
    assert.equal(S.iniziale(undefined), '?');
});

test('vociMenu: nel foglio dell\'account restano le pagine che non stanno nella barra in basso, senza quelle nascoste (l\'amministrazione degli altri)', () => {
    const voci = S.vociMenu([
        { href: 'index.html', etichetta: 'HOME', icona: 'a' },
        { href: 'profile.html', etichetta: ' PRO\n FILE ', icona: 'b' },
        { href: 'palmares.html', etichetta: 'ARCHIVE' },
        { href: 'admin.html', etichetta: 'ADMIN', nascosta: true },
        { href: 'stats.html', etichetta: 'STATS' },
        { href: '', etichetta: 'vuota' },
        null
    ]);
    assert.deepEqual(voci, [{ href: 'profile.html', etichetta: 'PRO FILE', icona: 'b' }, { href: 'palmares.html', etichetta: 'ARCHIVE', icona: '' }]);
    assert.deepEqual(S.vociMenu(undefined), []);
});

test('barraNascosta: scorrendo giù si nasconde, su torna; vicino alla cima c\'è sempre; piccoli movimenti non cambiano nulla', () => {
    assert.equal(S.barraNascosta(0, 300, false), true);
    assert.equal(S.barraNascosta(300, 200, true), false);
    assert.equal(S.barraNascosta(300, 20, true), false, 'in cima c\'è sempre');
    assert.equal(S.barraNascosta(100, 103, false), false, 'tre pixel non contano');
    assert.equal(S.barraNascosta(300, 303, true), true, 'e non la riportano fuori');
});

test('chiudeTrascinando: un foglio trascinato giù si chiude se è stato tirato abbastanza o in fretta, mai verso l\'alto', () => {
    assert.equal(S.chiudeTrascinando(-50, 100), false);
    assert.equal(S.chiudeTrascinando(0, 100), false);
    assert.equal(S.chiudeTrascinando(S.DISTANZA_CHIUSURA, 2000), true, 'lungo e lento');
    assert.equal(S.chiudeTrascinando(S.DISTANZA_CHIUSURA - 1, 2000), false);
    assert.equal(S.chiudeTrascinando(60, 80), true, 'corto ma veloce');
    assert.equal(S.chiudeTrascinando(30, 10), false, 'troppo poco anche se velocissimo');
    assert.equal(S.chiudeTrascinando(60, 1000), false);
});

test('schedaIniziale: l\'indirizzo (#id) vince, poi l\'ultima scelta, poi la prima; id che non esistono si ignorano', () => {
    const ids = ['a', 'b', 'c'];
    assert.equal(S.schedaIniziale(ids, '#c', 'b'), 'c');
    assert.equal(S.schedaIniziale(ids, 'c', ''), 'c');
    assert.equal(S.schedaIniziale(ids, '', 'b'), 'b');
    assert.equal(S.schedaIniziale(ids, '#x', 'y'), 'a');
    assert.equal(S.schedaIniziale(ids, undefined, undefined), 'a');
    assert.equal(S.schedaIniziale([], '#a', 'a'), '');
    assert.equal(S.schedaIniziale(undefined, '#a', 'a'), '');
});

test('nomeScheda: il nome scelto per la pagina, altrimenti il titolo della sezione con la prima maiuscola', () => {
    const nomi = S.SCHEDE['profile.html'].nomi;
    assert.equal(S.nomeScheda('pf-tema', 'SITE THEME', nomi), 'Theme');
    assert.equal(S.nomeScheda('pf-nuova', 'SITE   THEME', nomi), 'Site theme');
    assert.equal(S.nomeScheda('pf-nuova', '', nomi), 'pf-nuova');
    assert.equal(S.nomeScheda('pf-nuova', 'x'), 'X');
});

// ---------- le schede, con una pagina finta ----------

function nodo(tag, attr = {}) {
    const n = {
        nodeType: 1, tagName: tag.toUpperCase(), id: attr.id || '', figli: [], parentNode: null, attributi: {}, ascoltatori: {}, classi: new Set(), textContent: attr.testo || '',
        dataset: {}, type: ''
    };
    n.classList = { toggle: (c, on) => { if (on === undefined ? !n.classi.has(c) : on) n.classi.add(c); else n.classi.delete(c); }, contains: c => n.classi.has(c), add: c => n.classi.add(c) };
    Object.defineProperty(n, 'className', { get: () => [...n.classi].join(' '), set: v => { n.classi = new Set(String(v).split(/\s+/).filter(Boolean)); } });
    n.setAttribute = (k, v) => { n.attributi[k] = String(v); };
    n.getAttribute = k => (k in n.attributi ? n.attributi[k] : null);
    n.appendChild = f => { f.parentNode = n; n.figli.push(f); return f; };
    n.insertBefore = (f, prima) => { f.parentNode = n; const i = n.figli.indexOf(prima); n.figli.splice(i < 0 ? n.figli.length : i, 0, f); return f; };
    n.addEventListener = (ev, f) => { (n.ascoltatori[ev] = n.ascoltatori[ev] || []).push(f); };
    n.closest = sel => {
        for (let x = n; x; x = x.parentNode) {
            if (sel === '.app-scheda-tasto' && x.classi.has('app-scheda-tasto')) return x;
            if (sel === 'a[href^="#"]' && x.tagName === 'A' && (x.getAttribute('href') || '').startsWith('#')) return x;
        }
        return null;
    };
    n.querySelector = sel => (sel === 'h2' ? n.figli.find(f => f.tagName === 'H2') || null : null);
    n.getBoundingClientRect = () => ({ top: -700 });     // la pagina è scesa di 800: l'inizio del contenuto è a 100 dalla cima
    return n;
}

function paginaProfilo({ hash = '', salvata = '', storageRotto = false } = {}) {
    const main = nodo('main');
    const sezioni = [['pf-todo', 'WHAT TO DO'], ['pf-rivali', 'RIVALS'], ['pf-personalita', 'PERSONALITY'], ['pf-tema', 'SITE THEME']].map(([id, t]) => {
        const sez = nodo('section', { id });
        sez.appendChild(nodo('h2', { testo: t }));
        main.appendChild(sez);
        return sez;
    });
    const contenitore = nodo('div');
    contenitore.appendChild(main);
    const memoria = salvata ? { 'app-scheda:profile.html': salvata } : {};
    const scroll = [];
    const doc = {
        ascoltatori: {},
        createElement: tag => nodo(tag),
        querySelector: sel => (sel === 'main.pf-main' ? main : null),
        documentElement: {},
        addEventListener: (ev, f) => { (doc.ascoltatori[ev] = doc.ascoltatori[ev] || []).push(f); }
    };
    main.querySelectorAll = () => sezioni;
    const win = {
        document: doc, scrollY: 800, location: { hash }, ascoltatori: {},
        sessionStorage: storageRotto
            ? { getItem() { throw new Error('bloccato'); }, setItem() { throw new Error('bloccato'); } }
            : { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); } },
        getComputedStyle: () => ({ getPropertyValue: () => '56px' }),
        scrollTo: (x, y) => scroll.push(y),
        addEventListener: (ev, f) => { (win.ascoltatori[ev] = win.ascoltatori[ev] || []).push(f); }
    };
    const el = (tag, classe, html) => { const e = nodo(tag); if (classe) e.className = classe; return e; };
    return { win, doc, main, sezioni, memoria, scroll, el, contenitore };
}

test('schede: nasce un tasto per ogni sezione e si vede solo la scelta; il clic cambia scheda e la ricorda; l\'indirizzo (#id) la sceglie', () => {
    const p = paginaProfilo();
    const r = S.creaSchede(p.win, p.doc, 'profile.html', p.el);
    assert.ok(r);
    // i tasti stanno prima del contenuto
    assert.equal(p.contenitore.figli[0], r.nav);
    assert.equal(p.contenitore.figli[1], p.main);
    assert.equal(r.nav.attributi.role, 'tablist');
    assert.deepEqual(r.nav.figli.map(b => b.textContent), ['To do', 'Rivals', 'Personality', 'Theme']);
    assert.deepEqual(r.nav.figli.map(b => b.dataset.scheda), ['pf-todo', 'pf-rivali', 'pf-personalita', 'pf-tema']);
    const attive = () => p.sezioni.filter(s => s.classi.has('app-scheda-attiva')).map(s => s.id);
    assert.deepEqual(attive(), ['pf-todo']);
    assert.equal(r.nav.figli[0].attributi['aria-selected'], 'true');
    assert.equal(r.nav.figli[1].attributi['aria-selected'], 'false');
    // il clic sul secondo tasto: si vede solo quella sezione, si ricorda, la pagina risale ai tasti
    r.nav.ascoltatori.click[0]({ target: r.nav.figli[1] });
    assert.deepEqual(attive(), ['pf-rivali']);
    assert.ok(r.nav.figli[1].classi.has('attivo') && !r.nav.figli[0].classi.has('attivo'));
    assert.equal(p.memoria['app-scheda:profile.html'], 'pf-rivali');
    assert.deepEqual(p.scroll, [-700 + 800 - 56], 'la pagina era scesa di 800: si risale all\'inizio del contenuto (sotto la barra di 56)');
    // un clic fuori dai tasti non fa niente
    r.nav.ascoltatori.click[0]({ target: nodo('div') });
    assert.deepEqual(attive(), ['pf-rivali']);
    // un collegamento a una sezione (#pf-tema) apre la sua scheda e non fa saltare la pagina
    const link = nodo('a'); link.setAttribute('href', '#pf-tema');
    let fermato = false;
    p.doc.ascoltatori.click[0]({ target: link, preventDefault() { fermato = true; } });
    assert.deepEqual(attive(), ['pf-tema']);
    assert.equal(fermato, true);
    const altro = nodo('a'); altro.setAttribute('href', '#boh');
    p.doc.ascoltatori.click[0]({ target: altro, preventDefault() { assert.fail('un collegamento qualsiasi non va toccato'); } });
    assert.deepEqual(attive(), ['pf-tema']);
    // cambiando l'indirizzo
    p.win.location.hash = '#pf-personalita';
    p.win.ascoltatori.hashchange[0]();
    assert.deepEqual(attive(), ['pf-personalita']);
});

test('schede: all\'apertura vince l\'indirizzo, poi la scelta della visita, poi la prima; senza memoria nel browser funziona uguale', () => {
    const attiva = opz => { const p = paginaProfilo(opz); S.creaSchede(p.win, p.doc, 'profile.html', p.el); return p.sezioni.filter(s => s.classi.has('app-scheda-attiva')).map(s => s.id); };
    assert.deepEqual(attiva({ hash: '#pf-tema' }), ['pf-tema']);
    assert.deepEqual(attiva({ salvata: 'pf-rivali' }), ['pf-rivali']);
    assert.deepEqual(attiva({ hash: '#pf-tema', salvata: 'pf-rivali' }), ['pf-tema']);
    assert.deepEqual(attiva({ salvata: 'inesistente' }), ['pf-todo']);
    assert.deepEqual(attiva({ storageRotto: true }), ['pf-todo']);
    const rotto = paginaProfilo({ storageRotto: true });
    const r = S.creaSchede(rotto.win, rotto.doc, 'profile.html', rotto.el);
    assert.doesNotThrow(() => r.nav.ascoltatori.click[0]({ target: r.nav.figli[2] }));
    assert.deepEqual(rotto.sezioni.filter(s => s.classi.has('app-scheda-attiva')).map(s => s.id), ['pf-personalita']);
});

test('schede: le pagine senza schede (o con una sola sezione) restano come sono', () => {
    const p = paginaProfilo();
    assert.equal(S.creaSchede(p.win, p.doc, 'matches.html', p.el), null);
    const una = paginaProfilo();
    una.main.querySelectorAll = () => [una.sezioni[0]];
    assert.equal(S.creaSchede(una.win, una.doc, 'profile.html', una.el), null);
    assert.equal(una.contenitore.figli.length, 1, 'nessun tasto aggiunto');
    const senza = paginaProfilo();
    senza.doc.querySelector = () => null;
    assert.equal(S.creaSchede(senza.win, senza.doc, 'profile.html', senza.el), null);
});

// ---------- il cablaggio ----------

test('i fogli di stile dell\'app esistono e li scarica solo l\'app: app-pagine.css nelle pagine con la barra, app-battaglia.css nella battaglia', () => {
    assert.ok(fs.existsSync(path.join(DOCS, 'app-pagine.css')));
    assert.ok(fs.existsSync(path.join(DOCS, 'app-battaglia.css')));
    assert.ok(fs.existsSync(path.join(DOCS, 'app-shell.js')));
    const js = docs('app.js');
    assert.match(js, /caricaFogliDiStile\(doc, 'app-pagine\.css'\)/);
    assert.match(js, /pagina === 'battle\.html'\) caricaFogliDiStile\(doc, 'app-battaglia\.css'\)/);
    // nessuna pagina li collega: arrivano solo da app.js, quando il sito è aperto come app
    for (const f of fs.readdirSync(DOCS).filter(x => x.endsWith('.html'))) {
        const h = docs(f);
        assert.doesNotMatch(h, /app-pagine\.css|app-battaglia\.css|app-shell\.js/, `${f} non deve collegare i fogli dell'app`);
    }
});

test('le schede del Profile: il contenitore, le sezioni e i titoli di cui parlano app-shell.js e app-pagine.css ci sono davvero in profile.html', () => {
    const conf = S.SCHEDE['profile.html'];
    const h = docs('profile.html');
    assert.match(h, /<main class="pf-main"/);
    for (const id of Object.keys(conf.nomi)) assert.match(h, new RegExp(`<section class="pf-sezione [^"]*" id="${id}"`), `manca la sezione ${id}`);
    assert.equal((h.match(/<section class="pf-sezione /g) || []).length, Object.keys(conf.nomi).length, 'ogni sezione ha il suo tasto');
    assert.match(h, /<main class="pf-main">\s*<section/, 'le sezioni sono figlie dirette di main (:scope > section[id])');
    assert.match(h, /id="view-public-link"/);
    assert.match(h, /class="hub-hero"/);
    assert.match(h, /href="#pf-tema"/, 'il collegamento "Site theme" apre la scheda del tema');
    const css = docs('app-pagine.css');
    assert.match(css, /app-scheda-attiva/);
    assert.match(css, /\.app-schede\s*\{/);
    assert.match(docs('app-shell.js'), /classList\.toggle\('app-scheda-attiva'/);
});

test('le pagine ridisegnate usano i nomi veri delle loro classi (se una pagina cambia nome, il foglio va aggiornato)', () => {
    const css = docs('app-pagine.css');
    const controlli = {
        'players.html': ['trainers-grid', 'trainer-riga', 'trainer-card', 'tasto-amichevole'],
        'stats.html': ['stats-tag', 'stats-filtri', 'stats-ordina', 'stats-griglia', 'carta-dati'],
        'box.html': ['card-header', 'card-winrate', 'pkm-grid', 'card-actions'],
        'profile.html': ['pf-contatori', 'pf-tessere', 'pf-rivale', 'tm-lista'],
        'hub.html': ['btn-team', 'countdown-main-container', 'hub-stats-row'],
        'formats.html': ['formats-neubrutalist-grid', 'format-card-nb'],
        'palmares.html': ['palm-pagina', 'palm-griglia', 'palm-card'],
        'rules.html': ['rules-sidebar', 'toc-nav', 'rule-card'],
        'index.html': ['home-seasons-container', 'season-card'],
        'matches.html': ['showdown-summary-card', 'hub-main-layout']
    };
    for (const [pagina, classi] of Object.entries(controlli)) {
        const sorgenti = docs(pagina) + fs.readdirSync(DOCS).filter(f => f.endsWith('.js')).map(docs).join('\n');
        for (const c of classi) {
            assert.ok(sorgenti.includes(c), `${pagina}: nessun file scrive la classe "${c}"`);
            assert.ok(css.includes(c), `app-pagine.css non usa più la classe "${c}"`);
        }
    }
});

// ---------- i fogli ----------

function selettori(css) {
    // le virgole dentro le parentesi (:is(a, b)) non separano i selettori
    const t = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    for (const m of t.matchAll(/([^{}]+)\{/g)) {
        const pre = m[1].trim();
        if (pre.startsWith('@')) continue;
        if (/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(pre)) continue;
        let livello = 0, da = 0;
        for (let i = 0; i < pre.length; i++) {
            if (pre[i] === '(') livello++;
            else if (pre[i] === ')') livello--;
            else if (pre[i] === ',' && livello === 0) { out.push(pre.slice(da, i).trim()); da = i + 1; }
        }
        out.push(pre.slice(da).trim());
    }
    return out.filter(Boolean);
}
/** Le condizioni (@media) che racchiudono le regole: ogni regola deve stare dentro una */
function fuoriDalleCondizioni(css) {
    const t = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let livello = 0, prima = true;
    const fuori = [];
    for (const m of t.matchAll(/[{}]|[^{}]+/g)) {
        const x = m[0];
        if (x === '{') livello++;
        else if (x === '}') livello--;
        else if (livello === 0 && x.trim() && !x.trim().startsWith('@media')) fuori.push(x.trim().slice(0, 60));
    }
    return fuori;
}

test('app-pagine.css: ogni regola riguarda l\'app ("html.app-shell") e sta dentro le condizioni dello schermo stretto: in una finestra larga il sito resta quello di sempre', () => {
    const css = docs('app-pagine.css');
    const lista = selettori(css);
    assert.ok(lista.length >= 250, 'selettori trovati: ' + lista.length);
    for (const s of lista) assert.match(s, /^(html\.app-shell|html\.app-bar-nascosta\.app-shell)/, `regola che tocca il sito intero: "${s}"`);
    // nessuna regola fuori dalle @media dello schermo stretto / telefono in orizzontale (a parte i @keyframes)
    const fuori = fuoriDalleCondizioni(css).filter(x => !/^@keyframes|^from|^to|^\d+%/.test(x));
    assert.deepEqual(fuori, []);
    for (const m of css.matchAll(/@media[^{]+/g)) assert.match(m[0], /max-width:\s*900px|max-height:\s*500px/, m[0]);
});

test('app-battaglia.css: ogni regola riguarda l\'app (html.app) e la battaglia in orizzontale è solo per telefoni (altezza ≤ 520px)', () => {
    const css = docs('app-battaglia.css');
    const lista = selettori(css);
    assert.ok(lista.length >= 40, 'selettori trovati: ' + lista.length);
    for (const s of lista) assert.match(s, /^html\.app[\s.:]|^:where\(body\.vista-p2\) html\.app/, `regola che tocca il sito intero: "${s}"`);
    assert.deepEqual(fuoriDalleCondizioni(css), []);
    const medie = [...css.matchAll(/@media[^{]+/g)].map(m => m[0].trim());
    assert.equal(medie.length, 2);
    assert.match(medie[0], /orientation:\s*portrait/);
    assert.match(medie[1], /orientation:\s*landscape\)\s*and\s*\(max-height:\s*520px\)/);
    // lo schermo di Showdown non si toglie mai: è 16:9 e resta intero, solo più piccolo
    assert.match(css, /--wc:\s*min\(calc\(\(100dvh - 60px\) \* 16 \/ 9 \+ 20px\), calc\(100vw - 292px\)\)/);
    assert.doesNotMatch(css, /\.palco\s*\{[^}]*display:\s*none/);
});

test('app.css: la barra in alto e i fogli non si vedono fuori dall\'app; il foglio dell\'account sta sopra la barra, sotto non c\'è niente di più alto', () => {
    const css = docs('app.css');
    assert.match(css, /\.app-nav, \.app-bar, \.app-velo, \.app-foglio \{ display: none; \}/);
    assert.match(css, /html\.app-shell \.top-auth-bar > :is\(#auth-content, #user-menu, :has\(> #auth-content\)\) \{ display: none !important; \}/);
    assert.match(css, /--app-bar-h:\s*56px/);
    assert.match(css, /html\.app \{ --app-nav-h: 0px; --app-rail-w: 64px; --app-bar-h: 46px; \}/, 'in orizzontale la barra in basso diventa una colonna a sinistra');
});
