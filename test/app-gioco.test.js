'use strict';
// L'app come gioco da telefono: l'interfaccia delle pagine (docs/app-gioco.js), i fogli di stile (app-gioco.css, app-gioco-pagine.css, app-menu.css).
//   - la parte pura: titolo e colore del nastro, iniziale del giocatore, barra che si nasconde, schede;
//   - le schede (Profile): create con una pagina finta, si cambia scheda, quella scelta si ricorda e si può nominare nell'indirizzo;
//   - i fogli in sé: ogni regola sta sotto html.app-shell (o html.app per il menù e le parti comuni) e dentro le condizioni dello schermo da telefono:
//     in una finestra larga (app installata dal computer) e nel browser il sito resta quello di sempre;
//   - il cablaggio: le classi e gli id di cui parlano i fogli e gli script esistono davvero nelle pagine (se una pagina cambia nome, il foglio va aggiornato).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../docs/app-gioco.js');
const A = require('../docs/app.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const senzaCommenti = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// ---------- la parte pura ----------

test('titolo: il nastro porta il nome della tessera del menù; hub e pagina dell\'allenatore hanno il loro; le altre il testo della pagina, ripulito', () => {
    // ogni pagina del menù mostra il nome della sua tessera, qualunque cosa scriva la pagina
    for (const v of A.VOCI) assert.equal(G.titolo('/didi-lu/' + v.href, 'Qualcosa di lungo e diverso'), v.et, v.href);
    assert.equal(G.titolo('/didi-lu/matches.html', 'Season 3'), 'Matches');
    assert.equal(G.titolo('/didi-lu/hub.html', 'Season 3'), 'Season hub');
    assert.equal(G.titolo('/didi-lu/public.html?player=didi', 'DIDI'), 'Trainer');
    // una pagina senza tessera né titolo suo: il testo scritto dalla pagina (spazi ripuliti), se è ragionevole
    assert.equal(G.titolo('/didi-lu/altra.html', '  Didi\'s \n  Box '), 'Didi\'s Box');
    assert.equal(G.titolo('/didi-lu/altra.html', ''), 'Sant\'Alvise');
    assert.equal(G.titolo('/didi-lu/altra.html', undefined), 'Sant\'Alvise');
    assert.equal(G.titolo('/didi-lu/altra.html', 'x'.repeat(29)), 'Sant\'Alvise', 'troppo lungo per il nastro');
    assert.equal(G.titolo('/didi-lu/altra.html', 'Loading...'), 'Sant\'Alvise', 'la pagina non ha ancora i dati');
    // le pagine del sito che esistono davvero
    for (const p of Object.keys(G.TITOLI)) assert.ok(fs.existsSync(path.join(DOCS, p)), p);
});

test('sottotitolo: solo Matches mostra accanto al nastro il nome della stagione guardata', () => {
    assert.equal(G.sottotitolo('/didi-lu/matches.html', '  Season   3 '), 'Season 3');
    assert.equal(G.sottotitolo('/didi-lu/matches.html', 'Loading...'), '');
    assert.equal(G.sottotitolo('/didi-lu/matches.html', 'x'.repeat(29)), '');
    assert.equal(G.sottotitolo('/didi-lu/matches.html', ''), '');
    assert.equal(G.sottotitolo('/didi-lu/box.html', 'Season 3'), '');
    for (const p of G.CON_SOTTOTITOLO) assert.ok(fs.existsSync(path.join(DOCS, p)), p);
});

test('coloreDi: il nastro ha il colore della tessera nel menù (anche hub e pagina dell\'allenatore); le altre pagine il giallo del sito', () => {
    for (const v of A.VOCI) assert.equal(G.coloreDi(v.href), v.colore, v.href);
    assert.equal(G.coloreDi('hub.html'), A.VOCI.find(v => v.id === 'stagioni').colore);
    assert.equal(G.coloreDi('public.html'), A.VOCI.find(v => v.id === 'trainers').colore);
    assert.equal(G.coloreDi('battle.html'), '#ffbd44');
    assert.equal(G.coloreDi('/didi-lu/'), A.VOCI.find(v => v.id === 'stagioni').colore, 'la radice è la home');
});

test('iniziale: la prima lettera o cifra in maiuscolo, "?" senza nome', () => {
    assert.equal(G.iniziale('didi'), 'D');
    assert.equal(G.iniziale('  àlex'), 'À');
    assert.equal(G.iniziale('7up'), '7');
    assert.equal(G.iniziale('***'), '?');
    assert.equal(G.iniziale(''), '?');
    assert.equal(G.iniziale(undefined), '?');
});

test('barraNascosta: scorrendo giù si nasconde, su torna; vicino alla cima c\'è sempre; piccoli movimenti non cambiano nulla', () => {
    assert.equal(G.barraNascosta(0, 300, false), true);
    assert.equal(G.barraNascosta(300, 200, true), false);
    assert.equal(G.barraNascosta(300, 20, true), false, 'in cima c\'è sempre');
    assert.equal(G.barraNascosta(0, 24, false), false, 'a 24 pixel dalla cima ancora');
    assert.equal(G.barraNascosta(0, 40, false), true);
    assert.equal(G.barraNascosta(100, 103, false), false, 'tre pixel non contano');
    assert.equal(G.barraNascosta(300, 303, true), true, 'e non la riportano fuori');
    assert.equal(G.SOGLIA_SCORRIMENTO, 8);
});

test('schedaIniziale: l\'indirizzo (#id) vince, poi l\'ultima scelta, poi la prima; id che non esistono si ignorano', () => {
    const ids = ['a', 'b', 'c'];
    assert.equal(G.schedaIniziale(ids, '#c', 'b'), 'c');
    assert.equal(G.schedaIniziale(ids, 'c', ''), 'c');
    assert.equal(G.schedaIniziale(ids, '', 'b'), 'b');
    assert.equal(G.schedaIniziale(ids, '#x', 'y'), 'a');
    assert.equal(G.schedaIniziale(ids, undefined, undefined), 'a');
    assert.equal(G.schedaIniziale([], '#a', 'a'), '');
    assert.equal(G.schedaIniziale(undefined, '#a', 'a'), '');
});

test('nomeScheda: il nome scelto per la pagina, altrimenti il titolo della sezione con la prima maiuscola', () => {
    const nomi = G.SCHEDE['profile.html'].nomi;
    assert.equal(G.nomeScheda('pf-tema', 'SITE THEME', nomi), 'Theme');
    assert.equal(G.nomeScheda('pf-nuova', 'SITE   THEME', nomi), 'Site theme');
    assert.equal(G.nomeScheda('pf-nuova', '', nomi), 'pf-nuova');
    assert.equal(G.nomeScheda('pf-nuova', 'x'), 'X');
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
    // come nel DOM vero, un nodo che si sposta lascia il vecchio genitore
    const stacca = f => { if (f.parentNode) f.parentNode.figli = f.parentNode.figli.filter(x => x !== f); f.parentNode = null; };
    n.appendChild = f => { stacca(f); f.parentNode = n; n.figli.push(f); return f; };
    n.append = (...fs) => fs.forEach(f => n.appendChild(f));
    n.insertBefore = (f, prima) => { stacca(f); f.parentNode = n; const i = n.figli.indexOf(prima); n.figli.splice(i < 0 ? n.figli.length : i, 0, f); return f; };
    n.addEventListener = (ev, f) => { (n.ascoltatori[ev] = n.ascoltatori[ev] || []).push(f); };
    n.closest = sel => {
        for (let x = n; x; x = x.parentNode) {
            if (sel === '.gx-scheda-tasto' && x.classi.has('gx-scheda-tasto')) return x;
            if (sel === 'a[href^="#"]' && x.tagName === 'A' && (x.getAttribute('href') || '').startsWith('#')) return x;
        }
        return null;
    };
    n.querySelector = sel => (sel === 'h2' ? n.figli.find(f => f.tagName === 'H2') || null : null);
    return n;
}

function paginaProfilo({ hash = '', salvata = '', storageRotto = false, conTesta = true } = {}) {
    const corpoPagina = nodo('body');
    const testa = nodo('section'); testa.className = 'hub-hero';
    const main = nodo('main'); main.className = 'pf-main';
    if (conTesta) corpoPagina.appendChild(testa);
    corpoPagina.appendChild(main);
    const sezioni = [['pf-todo', 'WHAT TO DO'], ['pf-rivali', 'RIVALS'], ['pf-personalita', 'PERSONALITY'], ['pf-tema', 'SITE THEME']].map(([id, t]) => {
        const sez = nodo('section', { id });
        sez.appendChild(nodo('h2', { testo: t }));
        main.appendChild(sez);
        return sez;
    });
    const memoria = salvata ? { 'app-scheda:profile.html': salvata } : {};
    const scroll = [];
    const doc = {
        ascoltatori: {},
        createElement: tag => nodo(tag),
        querySelector: sel => (sel === 'main.pf-main' ? main : sel === 'section.hub-hero' && conTesta ? testa : null),
        addEventListener: (ev, f) => { (doc.ascoltatori[ev] = doc.ascoltatori[ev] || []).push(f); }
    };
    main.querySelectorAll = () => sezioni;
    const win = {
        document: doc, location: { hash }, ascoltatori: {},
        sessionStorage: storageRotto
            ? { getItem() { throw new Error('bloccato'); }, setItem() { throw new Error('bloccato'); } }
            : { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); } },
        scrollTo: (x, y) => scroll.push([x, y]),
        addEventListener: (ev, f) => { (win.ascoltatori[ev] = win.ascoltatori[ev] || []).push(f); }
    };
    const el = (tag, classe) => { const e = nodo(tag); if (classe) e.className = classe; return e; };
    return { win, doc, main, testa, sezioni, memoria, scroll, el, corpoPagina };
}

test('schede: nasce un tasto per ogni sezione e si vede solo la scelta; il clic cambia scheda e la ricorda; l\'indirizzo (#id) la sceglie', () => {
    const p = paginaProfilo();
    const r = G.creaSchede(p.win, p.doc, 'profile.html', p.el);
    assert.ok(r);
    // a sinistra i tasti, a destra la striscia in testa e le sezioni: tutto dentro un quadro che prende il posto del contenuto
    assert.equal(p.corpoPagina.figli.length, 1);
    const quadro = p.corpoPagina.figli[0];
    assert.equal(quadro.className, 'gx-con-schede');
    assert.equal(quadro.figli[0], r.nav);
    assert.equal(r.nav.className, 'gx-schede');
    const corpo = quadro.figli[1];
    assert.equal(corpo.className, 'gx-schede-corpo');
    assert.deepEqual(corpo.figli, [p.testa, p.main]);
    assert.equal(r.nav.attributi.role, 'tablist');
    assert.deepEqual(r.nav.figli.map(b => b.textContent), ['To do', 'Rivals', 'Personality', 'Theme']);
    assert.deepEqual(r.nav.figli.map(b => b.dataset.scheda), ['pf-todo', 'pf-rivali', 'pf-personalita', 'pf-tema']);
    assert.ok(r.nav.figli.every(b => b.attributi.role === 'tab' && b.classi.has('gx-scheda-tasto') && b.attributi['data-suono'] === 'scegli'));
    const attive = () => p.sezioni.filter(s => s.classi.has('gx-scheda-attiva')).map(s => s.id);
    assert.deepEqual(attive(), ['pf-todo']);
    assert.equal(r.nav.figli[0].attributi['aria-selected'], 'true');
    assert.equal(r.nav.figli[1].attributi['aria-selected'], 'false');
    assert.deepEqual(p.scroll, [], 'all\'apertura la pagina non si sposta');
    // il clic sul secondo tasto: si vede solo quella sezione, si ricorda, la pagina torna in cima
    r.nav.ascoltatori.click[0]({ target: r.nav.figli[1] });
    assert.deepEqual(attive(), ['pf-rivali']);
    assert.ok(r.nav.figli[1].classi.has('attivo') && !r.nav.figli[0].classi.has('attivo'));
    assert.equal(p.memoria['app-scheda:profile.html'], 'pf-rivali');
    assert.deepEqual(p.scroll, [[0, 0]]);
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
    p.win.location.hash = '#inesistente';
    p.win.ascoltatori.hashchange[0]();
    assert.deepEqual(attive(), ['pf-personalita'], 'un indirizzo che non è una scheda non cambia niente');
});

test('schede: all\'apertura vince l\'indirizzo, poi la scelta della visita, poi la prima; senza memoria nel browser funziona uguale', () => {
    const attiva = opz => { const p = paginaProfilo(opz); G.creaSchede(p.win, p.doc, 'profile.html', p.el); return p.sezioni.filter(s => s.classi.has('gx-scheda-attiva')).map(s => s.id); };
    assert.deepEqual(attiva({ hash: '#pf-tema' }), ['pf-tema']);
    assert.deepEqual(attiva({ salvata: 'pf-rivali' }), ['pf-rivali']);
    assert.deepEqual(attiva({ hash: '#pf-tema', salvata: 'pf-rivali' }), ['pf-tema']);
    assert.deepEqual(attiva({ salvata: 'inesistente' }), ['pf-todo']);
    assert.deepEqual(attiva({ storageRotto: true }), ['pf-todo']);
    const rotto = paginaProfilo({ storageRotto: true });
    const r = G.creaSchede(rotto.win, rotto.doc, 'profile.html', rotto.el);
    assert.doesNotThrow(() => r.nav.ascoltatori.click[0]({ target: r.nav.figli[2] }));
    assert.deepEqual(rotto.sezioni.filter(s => s.classi.has('gx-scheda-attiva')).map(s => s.id), ['pf-personalita']);
});

test('schede: senza la striscia in testa (altra pagina o markup cambiato) il quadro contiene solo i tasti e il contenuto', () => {
    const p = paginaProfilo({ conTesta: false });
    const r = G.creaSchede(p.win, p.doc, 'profile.html', p.el);
    assert.ok(r);
    const quadro = p.corpoPagina.figli[0];
    assert.deepEqual(quadro.figli[1].figli, [p.main]);
});

test('schede: le pagine senza schede (o con una sola sezione) restano come sono', () => {
    const p = paginaProfilo();
    assert.equal(G.creaSchede(p.win, p.doc, 'matches.html', p.el), null);
    const una = paginaProfilo();
    una.main.querySelectorAll = () => [una.sezioni[0]];
    assert.equal(G.creaSchede(una.win, una.doc, 'profile.html', una.el), null);
    assert.deepEqual(una.corpoPagina.figli, [una.testa, una.main], 'niente tasti né quadro');
    const senza = paginaProfilo();
    senza.doc.querySelector = () => null;
    assert.equal(G.creaSchede(senza.win, senza.doc, 'profile.html', senza.el), null);
});

test('avvia: fuori dall\'app (senza app-shell), nel frame del simulatore o senza il resto dell\'app non fa niente', () => {
    const html = { classList: { contains: () => false } };
    const finestra = extra => ({ document: { documentElement: html, body: {} }, ...extra });
    const w = finestra({}); w.self = w; w.top = w;
    assert.equal(G.avvia(w), null, 'nel browser');
    const dentro = { classList: { contains: c => c === 'app-shell' } };
    const f = { document: { documentElement: dentro, body: {} } }; f.self = f; f.top = {};
    assert.equal(G.avvia(f), null, 'in un frame');
    assert.equal(G.avvia({ document: { documentElement: dentro } }), null, 'senza body');
    assert.equal(G.avvia({ document: null }), null);
});

// ---------- le schede del Profile e le pagine ----------

test('le schede del Profile: il contenitore, le sezioni e i titoli di cui parla app-gioco.js ci sono davvero in profile.html, e il foglio le conosce', () => {
    const conf = G.SCHEDE['profile.html'];
    const h = docs('profile.html');
    assert.equal(conf.contenitore, 'main.pf-main');
    assert.match(h, /<main class="pf-main"/);
    for (const id of Object.keys(conf.nomi)) assert.match(h, new RegExp(`<section class="pf-sezione [^"]*" id="${id}"`), `manca la sezione ${id}`);
    assert.equal((h.match(/<section class="pf-sezione /g) || []).length, Object.keys(conf.nomi).length, 'ogni sezione ha il suo tasto');
    assert.match(h, /<main class="pf-main">\s*<section/, 'le sezioni sono figlie dirette di main (:scope > section[id])');
    assert.equal(conf.sezioni, ':scope > section[id]');
    assert.match(h, /<section class="hub-hero">/, 'la striscia in testa che sta accanto alle schede');
    assert.equal(conf.testa, 'section.hub-hero');
    assert.match(h, /id="view-public-link"/);
    assert.match(h, /href="#pf-tema"/, 'il collegamento "Site theme" apre la scheda del tema');
    assert.match(h, /<h1 class="hub-title-display">/, 'il titolo che l\'interfaccia in alto segue');
    const css = docs('app-gioco-pagine.css');
    for (const c of ['gx-scheda-attiva', 'gx-schede', 'gx-scheda-tasto', 'gx-con-schede', 'gx-schede-corpo']) assert.ok(css.includes(c), `il foglio non conosce ${c}`);
    assert.match(docs('app-gioco.js'), /classList\.toggle\('gx-scheda-attiva'/);
});

test('ogni pagina del gioco ha la sua classe sul body (pg-...), con cui il foglio la riconosce', () => {
    const attese = {
        'index.html': 'pg-index', 'hub.html': 'pg-hub', 'matches.html': 'pg-matches', 'players.html': 'pg-players', 'stats.html': 'pg-stats', 'box.html': 'pg-box',
        'profile.html': 'pg-profile', 'palmares.html': 'pg-palmares', 'formats.html': 'pg-formats', 'rules.html': 'pg-rules', 'public.html': 'pg-public'
    };
    const css = docs('app-gioco-pagine.css');
    for (const [pagina, classe] of Object.entries(attese)) {
        assert.match(docs(pagina), new RegExp(`<body[^>]*class="[^"]*\\b${classe}\\b`), `${pagina}: manca ${classe} sul body`);
        assert.ok(A.haHud(pagina), pagina);
    }
    // il foglio riconosce tutte (il Profile le sue schede con gx-schede, il resto con body.pg-...)
    for (const classe of Object.values(attese).filter(c => c !== 'pg-profile')) assert.ok(css.includes(`body.${classe}`), `il foglio non conosce ${classe}`);
});

test('le pagine ridisegnate usano i nomi veri delle loro classi (se una pagina cambia nome, il foglio va aggiornato)', () => {
    const css = senzaCommenti(docs('app-gioco-pagine.css'));
    // il foglio nomina le classi di ogni pagina dopo "body.pg-...": ognuna deve esistere ancora nella pagina, nei suoi script o nei suoi fogli
    const sorgenti = fs.readdirSync(DOCS).filter(f => /\.(html|js|css)$/.test(f) && !/^app-/.test(f)).map(docs).join('\n');
    const perPagina = {};
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
        const pre = m[1].trim();
        if (pre.startsWith('@')) continue;
        const pg = pre.match(/body\.pg-([a-z]+)/);
        if (!pg) continue;
        for (const c of pre.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
            if (/^(gx-|pg-|app)/.test(c[1]) || c[1] === 'nb') continue;
            (perPagina[pg[1]] ||= new Set()).add(c[1]);
        }
    }
    assert.deepEqual(Object.keys(perPagina).sort(), ['box', 'formats', 'hub', 'index', 'matches', 'palmares', 'players', 'rules', 'stats']);
    for (const [pagina, classi] of Object.entries(perPagina)) {
        assert.ok(classi.size >= 5, `${pagina}: classi trovate ${classi.size}`);
        const mancano = [...classi].filter(c => !sorgenti.includes(c));
        assert.deepEqual(mancano, [], `${pagina}: classi che nessun file del sito scrive più`);
    }
    // qualche classe chiave per pagina, senza la quale lo schermo non regge
    const chiave = {
        'players.html': ['trainers-grid', 'trainer-riga', 'trainer-card'], 'stats.html': ['stats-tag', 'stats-griglia', 'carta-dati'],
        'box.html': ['card-header', 'pkm-grid', 'card-actions'], 'hub.html': ['btn-team', 'countdown-main-container'],
        'formats.html': ['formats-neubrutalist-grid', 'format-card-nb'], 'palmares.html': ['palm-pagina', 'palm-griglia', 'palm-card'],
        'rules.html': ['rules-sidebar', 'toc-nav', 'rule-card'], 'index.html': ['home-seasons-container', 'season-card'], 'matches.html': ['showdown-summary-card', 'hub-main-layout']
    };
    for (const [pagina, classi] of Object.entries(chiave)) {
        const sorg = docs(pagina) + fs.readdirSync(DOCS).filter(f => f.endsWith('.js') && !/^app-/.test(f)).map(docs).join('\n');
        for (const c of classi) {
            assert.ok(sorg.includes(c), `${pagina}: nessun file scrive la classe "${c}"`);
            assert.ok(css.includes(c), `app-gioco-pagine.css non usa più la classe "${c}"`);
        }
    }
});

// ---------- i fogli ----------

function selettori(css) {
    // le virgole dentro le parentesi (:is(a, b)) non separano i selettori
    const t = senzaCommenti(css);
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
/** Le regole che non stanno dentro nessuna @media */
function fuoriDalleCondizioni(css) {
    const t = senzaCommenti(css);
    let livello = 0;
    const fuori = [];
    for (const m of t.matchAll(/[{}]|[^{}]+/g)) {
        const x = m[0];
        if (x === '{') livello++;
        else if (x === '}') livello--;
        else if (livello === 0 && x.trim() && !x.trim().startsWith('@media')) fuori.push(x.trim().slice(0, 60));
    }
    return fuori;
}

test('app-gioco-pagine.css: ogni regola riguarda l\'app ("html.app-shell") e sta dentro le condizioni dello schermo da telefono: in una finestra larga il sito resta quello di sempre', () => {
    const css = docs('app-gioco-pagine.css');
    const lista = selettori(css);
    assert.ok(lista.length >= 300, 'selettori trovati: ' + lista.length);
    for (const s of lista) {
        assert.match(s, /^(html\.app-shell|html\.gx-barra-nascosta\.app-shell|html\.gx-dialogo-aperto body$|::view-transition-(old|new|group)\(|\.gx-barra$|\.gx-schede$)/, `regola che tocca il sito intero: "${s}"`);
    }
    // l'unica regola fuori dalle @media nasconde la barra e le schede dove non servono (non esistono nemmeno finché l'app non le crea)
    assert.deepEqual(fuoriDalleCondizioni(css), ['.gx-barra, .gx-schede']);
    assert.match(css, /\.gx-barra, \.gx-schede \{ display: none; \}/);
    const medie = [...new Set([...css.matchAll(/@media[^{]+/g)].map(m => m[0].trim()))];
    assert.deepEqual(medie, ['@media (max-width: 900px), (max-height: 520px)', '@media (orientation: landscape) and (max-height: 520px)']);
});

test('app-gioco.css e app-menu.css: ogni regola riguarda l\'app (html.app…); le animazioni si fermano a chi ha scelto "meno movimento"', () => {
    for (const nome of ['app-gioco.css', 'app-menu.css']) {
        const css = docs(nome);
        const lista = selettori(css);
        assert.ok(lista.length >= 40, `${nome}: selettori trovati ${lista.length}`);
        for (const s of lista) assert.match(s, /^html\.app([\s.:\[]|$)/, `${nome}: regola che tocca il sito intero: "${s}"`);
    }
    const comune = docs('app-gioco.css');
    assert.deepEqual([...new Set([...comune.matchAll(/@media[^{]+/g)].map(m => m[0].trim()))], ['@media (prefers-reduced-motion: reduce)']);
    assert.doesNotMatch(docs('app-menu.css'), /@media/, 'il menù non ha condizioni: è una schermata a sé, con misure che seguono lo schermo (--u)');
    // movimento ridotto: le animazioni infinite si fermano
    assert.match(comune, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation(-duration)?:\s*(none|\.01ms|0\.01ms)/);
});

test('le misure e i colori dell\'app sono definiti: --u, i --gx-… e le proprietà del tema; --c e --i le scrive il menù tessera per tessera', () => {
    const fogli = ['app-gioco.css', 'app-gioco-pagine.css', 'app-menu.css'].map(f => senzaCommenti(docs(f))).join('\n');
    const js = ['app-gioco.js', 'app-menu.js', 'app-comune.js'].map(docs).join('\n');
    const tema = docs('temi.css') + docs('nb-pagine.css');
    const usate = new Set([...fogli.matchAll(/var\((--[a-z0-9-]+)/gi)].map(m => m[1]));
    const definite = new Set([...fogli.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
    for (const m of js.matchAll(/setProperty\('(--[a-z0-9-]+)'/g)) definite.add(m[1]);
    for (const m of tema.matchAll(/(--[a-z0-9-]+)\s*:/gi)) definite.add(m[1]);
    const senza = [...usate].filter(v => !definite.has(v) && !['--c', '--i'].includes(v));
    assert.deepEqual(senza, [], 'proprietà usate ma mai definite');
    assert.match(docs('app-menu.js'), /style="--c:'.*';--i:'/s);
    // 1u = 1px su uno schermo di 740x340: la misura dell'app si adatta allo schermo
    assert.match(fogli, /--u:\s*min\(\.294vh,\s*\.1351vw\)/);
});

test('i quattro temi del sito (neubrutal, sticker, morbido, arcade) hanno ciascuno i colori dello sfondo da gioco', () => {
    const css = docs('app-gioco.css');
    for (const tema of ['sticker', 'morbido', 'arcade']) assert.match(css, new RegExp(`html\\.app\\[data-tema="${tema}"\\]`), tema);
    for (const t of ['neubrutal', 'sticker', 'morbido', 'arcade']) assert.match(docs('temi.js'), new RegExp(`['"]${t}['"]|\\b${t}\\b`), `temi.js non conosce ${t}`);
});

test('transizioni tra pagine: attive solo nell\'app (la regola @view-transition la scrivono gli script dell\'app, mai un foglio del sito)', () => {
    assert.match(docs('app-gioco.js'), /@view-transition \{ navigation: auto; \}/);
    assert.match(docs('app-menu.js'), /@view-transition \{ navigation: auto; \}/);
    for (const f of fs.readdirSync(DOCS).filter(x => /\.(css|html)$/.test(x))) assert.doesNotMatch(docs(f), /@view-transition/, `${f}: la regola va solo negli script dell'app`);
    // le animazioni delle pagine non lasciano blocchi "contenitore" attorno ai tasti fissi (fill-mode both li terrebbe per sempre)
    const css = senzaCommenti(docs('app-gioco-pagine.css')).replace(/::view-transition-[^{]*\{[^}]*\}/g, '');       // i pezzi della transizione vivono su uno strato a parte
    assert.doesNotMatch(css, /animation(-fill-mode)?:[^;}]*\bboth\b/, 'animation con fill-mode "both" (usa "backwards")');
});
