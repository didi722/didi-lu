'use strict';
// Il menù principale dell'app (docs/menu.html, app-menu.js, app-menu.css): la prima schermata, con l'avatar del giocatore e le pagine del gioco.
//   - la parte pura: quale stagione mostrare, il tempo che manca, la riga della stagione;
//   - il markup: gli id che lo script cerca ci sono davvero in menu.html; una tessera per ogni pagina del gioco;
//   - il menù con una pagina finta: le tessere, la schermata del titolo (una volta a visita), il suono, l'accesso, il giocatore e la stagione;
//   - dal browser (senza app) il menù non c'è: si torna alla home del sito.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../docs/app-menu.js');
const A = require('../docs/app.js');
const C = require('../docs/app-comune.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const passaUnGiro = () => new Promise(ok => setImmediate(ok));
const GIORNO = 86400000;

// ---------- la parte pura ----------

test('statoStagione: quello scritto, ma con le iscrizioni scadute è "playing" (come nella home del sito)', () => {
    const T = Date.parse('2026-05-10T12:00:00Z');
    assert.equal(M.statoStagione(null, T), '');
    assert.equal(M.statoStagione({}, T), 'open', 'senza stato: aperta');
    assert.equal(M.statoStagione({ status: 'open' }, T), 'open', 'senza scadenza resta aperta');
    assert.equal(M.statoStagione({ status: 'OPEN', deadline: '2026-05-11T12:00:00Z' }, T), 'open');
    assert.equal(M.statoStagione({ status: 'open', deadline: '2026-05-10T12:00:00Z' }, T), 'playing', 'scadenza arrivata');
    assert.equal(M.statoStagione({ status: 'open', deadline: 'boh' }, T), 'open', 'una scadenza illeggibile non conta');
    assert.equal(M.statoStagione({ status: 'playing' }, T), 'playing');
    assert.equal(M.statoStagione({ status: 'closed' }, T), 'closed');
    assert.equal(M.statoStagione({ status: 'terminata' }, T), 'closed', 'il vecchio nome italiano');
});

test('stagioneDaMostrare: prima le iscrizioni aperte (la più vicina alla scadenza), poi la stagione in corso, poi l\'ultima conclusa; la beta solo se non c\'è altro', () => {
    const T = Date.parse('2026-05-10T12:00:00Z');
    const s = (id, status, extra = {}) => ({ id, info: { status, ...extra } });
    const tutte = [
        s('sbeta', 'open', { deadline: '2026-05-10T18:00:00Z' }), s('s1', 'closed'), s('s2', 'closed'), s('s3', 'playing'), s('s10', 'playing'),
        s('s4', 'open', { deadline: '2026-05-12T12:00:00Z' }), s('s5', 'open', { deadline: '2026-05-11T12:00:00Z' })
    ];
    const prima = M.stagioneDaMostrare(tutte, T);
    assert.equal(prima.id, 's5', 'la più vicina alla scadenza (la beta non conta)');
    assert.equal(prima.stato, 'open');
    assert.equal(prima.mancano, GIORNO);
    // senza iscrizioni aperte: l'ultima in corso (s10, non s3: i numeri si confrontano come numeri)
    const senzaAperte = tutte.filter(x => x.info.status !== 'open' || x.id === 'sbeta');
    assert.equal(M.stagioneDaMostrare(senzaAperte, T).id, 's10');
    assert.equal(M.stagioneDaMostrare(senzaAperte, T).mancano, null);
    // solo concluse: l'ultima
    assert.equal(M.stagioneDaMostrare([s('s1', 'closed'), s('s12', 'closed'), s('s2', 'closed')], T).id, 's12');
    // le iscrizioni scadute valgono come "in corso"
    assert.deepEqual([M.stagioneDaMostrare([s('s1', 'closed'), s('s2', 'open', { deadline: '2026-05-01T00:00:00Z' })], T).id, M.stagioneDaMostrare([s('s1', 'closed'), s('s2', 'open', { deadline: '2026-05-01T00:00:00Z' })], T).stato], ['s2', 'playing']);
    // la beta solo se è tutto quello che c'è
    assert.equal(M.stagioneDaMostrare([s('sbeta', 'closed')], T).id, 'sbeta');
    // niente
    assert.equal(M.stagioneDaMostrare([], T), null);
    assert.equal(M.stagioneDaMostrare(undefined, T), null);
    assert.equal(M.stagioneDaMostrare([{ id: 's1', info: null }, null, { id: 's2' }], T), null, 'le stagioni senza dati si ignorano');
    // aperta senza scadenza: va bene lo stesso, ma dopo quelle con la scadenza
    assert.equal(M.stagioneDaMostrare([s('s1', 'open'), s('s2', 'open', { deadline: '2026-05-11T12:00:00Z' })], T).id, 's2');
    assert.equal(M.stagioneDaMostrare([s('s1', 'open')], T).mancano, null);
});

test('tempoCheManca: scritto corto (giorni e ore, ore e minuti, minuti); "now" quando è scaduto', () => {
    assert.equal(M.tempoCheManca(2 * GIORNO + 23 * 3600000 + 59000), '2d 23h');
    assert.equal(M.tempoCheManca(5 * 3600000 + 12 * 60000), '5h 12m');
    assert.equal(M.tempoCheManca(12 * 60000 + 30000), '12m');
    assert.equal(M.tempoCheManca(20000), '1m', 'meno di un minuto: almeno uno');
    assert.equal(M.tempoCheManca(0), 'now');
    assert.equal(M.tempoCheManca(-5), 'now');
    assert.equal(M.tempoCheManca(NaN), 'now');
    assert.equal(M.tempoCheManca(null), 'now');
});

test('riassuntoStagione: iscrizioni aperte -> JOIN all\'hub; in corso -> PLAY ai match; conclusa -> VIEW ai match, con il vincitore', () => {
    const aperta = M.riassuntoStagione({ id: 's4', info: { name: 'Spring Cup' }, stato: 'open', mancano: GIORNO });
    assert.deepEqual(aperta, { nome: 'Spring Cup', stato: 'open', testo: 'Sign-ups close in 1d 0h', azione: 'JOIN', href: 'hub.html?id=s4' });
    assert.deepEqual(M.riassuntoStagione({ id: 's5', info: {}, stato: 'playing' }), { nome: 'Season 5', stato: 'playing', testo: 'Showdowns in progress', azione: 'PLAY', href: 'matches.html?id=s5' });
    assert.deepEqual(M.riassuntoStagione({ id: 's2', info: { name: 'Winter', winner: 'Luca' }, stato: 'closed' }), { nome: 'Winter', stato: 'closed', testo: 'Season over · Luca won', azione: 'VIEW', href: 'matches.html?id=s2' });
    assert.equal(M.riassuntoStagione({ id: 's3', info: {}, stato: 'closed' }).testo, 'Season over');
    assert.equal(M.riassuntoStagione({ id: 'sbeta', info: {}, stato: 'closed' }).nome, 'Season beta');
    assert.equal(M.riassuntoStagione({ id: 's 1', info: {}, stato: 'playing' }).href, 'matches.html?id=s%201', 'l\'id viaggia nell\'indirizzo in modo sicuro');
    assert.equal(M.riassuntoStagione(null), null);
    // le pagine di destinazione leggono davvero "id"
    assert.match(docs('hub.html'), /urlParams\.get\('id'\)/);
    assert.match(docs('matches.html'), /urlParams\.get\('id'\)/);
});

test('riassuntoStagione con le iscrizioni aperte: se sei già dentro il tasto porta ai team, non a iscriversi', () => {
    const dentro = M.riassuntoStagione({ id: 's4', info: { name: 'Spring Cup' }, stato: 'open', mancano: GIORNO }, true);
    assert.deepEqual(dentro, { nome: 'Spring Cup', stato: 'open', testo: 'You\'re in · closes in 1d 0h', azione: 'TEAMS', href: 'hub.html?id=s4' });
    // per le altre stagioni "iscritto" non conta
    assert.equal(M.riassuntoStagione({ id: 's5', info: {}, stato: 'playing' }, true).azione, 'PLAY');
});

test('giaIscritto: il nome del giocatore tra gli iscritti, senza guardare maiuscole e spazi; senza nome o senza elenco no', () => {
    assert.equal(M.giaIscritto(['Didi', 'Luca'], 'didi'), true);
    assert.equal(M.giaIscritto(['didi'], ' DIDI '), true);
    assert.equal(M.giaIscritto(['Luca'], 'didi'), false);
    assert.equal(M.giaIscritto([], 'didi'), false);
    assert.equal(M.giaIscritto(undefined, 'didi'), false);
    assert.equal(M.giaIscritto(['Didi'], ''), false);
    assert.equal(M.giaIscritto(['Didi'], null), false);
});

test('daAnnunciare: solo con le iscrizioni aperte, a un giocatore collegato non ancora iscritto, una volta sola per stagione', () => {
    const aperta = { id: 's7', info: { name: 'Christmas Cup' }, stato: 'open', mancano: 3 * GIORNO + 3600000 };
    const base = { stagione: aperta, giocatoreId: 'didi', iscritti: ['luca'], vista: null };
    assert.deepEqual(M.daAnnunciare(base), { id: 's7', nome: 'Christmas Cup', tempo: '3d 1h', href: 'hub.html?id=s7' });
    assert.equal(M.daAnnunciare({ ...base, vista: 's7' }), null, 'già annunciata');
    assert.equal(M.daAnnunciare({ ...base, vista: 's6' }).id, 's7', 'una stagione nuova si annuncia anche se una vecchia era già stata vista');
    assert.equal(M.daAnnunciare({ ...base, iscritti: ['Luca', 'DIDI'] }), null, 'è già dentro');
    assert.equal(M.daAnnunciare({ ...base, giocatoreId: '' }), null, 'senza account non si sa chi sei');
    assert.equal(M.daAnnunciare({ ...base, iscritti: undefined }), null, 'se non si sa chi è iscritto, meglio tacere');
    assert.equal(M.daAnnunciare({ ...base, stagione: { ...aperta, stato: 'playing' } }), null);
    assert.equal(M.daAnnunciare({ ...base, stagione: { ...aperta, stato: 'closed' } }), null);
    assert.equal(M.daAnnunciare({ ...base, stagione: null }), null);
    assert.equal(M.daAnnunciare({ ...base, stagione: { id: 's8', info: {}, stato: 'open', mancano: 60000 } }).nome, 'Season 8', 'senza nome: Season N');
});

// ---------- il markup ----------

test('menu.html: tutti gli id che lo script cerca ci sono (e quelli creati al volo no); è una pagina dell\'app come le altre (manifest, icona, app.css, app.js)', () => {
    const html = docs('menu.html');
    const js = docs('app-menu.js');
    const cercati = new Set([...js.matchAll(/\$\('([\w-]+)'\)/g)].map(m => m[1]));
    const dinamici = new Set(['gx-accedi', 'gx-nastro']);                // il tasto "Log in" lo disegna lo script dentro il pannello del giocatore
    assert.ok(cercati.size >= 12, 'id cercati: ' + [...cercati].join(', '));
    for (const id of cercati) {
        if (dinamici.has(id)) assert.ok(!html.includes(`id="${id}"`), `${id} lo crea lo script`);
        else assert.ok(html.includes(`id="${id}"`), `manca #${id} in menu.html`);
    }
    // gli id sono unici
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'id ripetuti');
    // il resto della pagina: Firebase, temi e sfide (campanella) come le altre pagine; app.css ultimo foglio, poi app.js
    assert.match(html, /firebase-app-compat\.js[\s\S]*firebase-auth-compat\.js[\s\S]*firebase-database-compat\.js/);
    assert.match(html, /<script src="temi\.js"><\/script>/);
    assert.match(html, /<script src="sfide\.js"><\/script>/);
    assert.match(html, /<body class="gx-menu">/);
    // gli Achievements usano i moduli dei badge del sito (prima dello script dell'app), che a loro volta vogliono Statistiche e Titoli
    assert.match(html, /<script src="statistiche\.js"><\/script>\s*<script src="titoli\.js"><\/script>\s*<script src="fiocchi\.js"><\/script>\s*<script src="badge-team\.js"><\/script>\s*<script src="badge-allenatore\.js"><\/script>\s*<script src="app-comune\.js"><\/script>\s*<script src="app-achievements\.js"><\/script>\s*<script src="app-menu\.js"><\/script>\s*<\/body>/);
    // il menù non è una pagina per i motori di ricerca né per il browser da PC: dal browser si torna alla home (provato sotto)
    assert.match(html, /<title>Menu \| Sant'Alvise League<\/title>/);
    assert.match(html, /<div class="gx-splash" id="gx-splash"[^>]* hidden>/, 'la schermata del titolo parte nascosta: la mostra lo script una volta a visita');
    assert.match(html, /<div class="gx-dialogo" id="gx-login"[^>]* hidden>/);
});

test('le tessere: una per pagina del gioco, con nome e icona (senza sottotitolo); la prima (Matches) è la grande', () => {
    const js = docs('app-menu.js');
    assert.doesNotMatch(js, /sottotitoli/, 'le tessere non hanno più il sottotitolo');
    for (const v of A.VOCI) assert.ok(C.ICONE[v.id], `manca l'icona ${v.id}`);
    const css = docs('app-menu.css');
    assert.equal(A.VOCI[0].id, 'matches');
    assert.match(css, /\.gx-t-matches/, 'la tessera grande');
    assert.match(css, /\.gx-tessera small \{ display: none;/, 'se un sottotitolo ricomparisse, non si vede');
    for (const c of ['gx-tessera', 'gx-tessere', 'gx-giocatore', 'gx-palco', 'gx-avatar', 'gx-stagione', 'gx-nastro', 'gx-splash', 'gx-lobby']) assert.ok(css.includes(c), `app-menu.css non conosce ${c}`);
    for (const st of ['gx-st-open', 'gx-st-playing', 'gx-st-closed']) assert.ok(css.includes(st), st);
    // niente barra in alto col logo: il giocatore sta a tutta altezza e i comandi restano a destra
    assert.doesNotMatch(docs('menu.html'), /class="gx-logo"/);
    // le forme che galleggiano sono pokéball (metà rossa, metà bianca, bottone al centro), non cerchi barrati
    assert.match(css, /\.gx-forma \{[^}]*linear-gradient\(180deg, rgba\(255, 82, 72/);
});

// ---------- il menù con una pagina finta ----------

function elemento(id) {
    const e = { id, className: '', hidden: false, textContent: '', value: '', attributi: {}, ascoltatori: {}, classi: new Set(), _html: '', muted: false, volume: 1, src: '', paused: true, focalizzato: 0, style: {} };
    e.classList = {
        add: (...c) => c.forEach(x => e.classi.add(x)),
        remove: (...c) => c.forEach(x => e.classi.delete(x)),
        contains: c => e.classi.has(c),
        toggle: (c, on) => { if (on === undefined ? !e.classi.has(c) : on) e.classi.add(c); else e.classi.delete(c); }
    };
    e.setAttribute = (k, v) => { e.attributi[k] = String(v); };
    e.getAttribute = k => (k in e.attributi ? e.attributi[k] : null);
    e.addEventListener = (ev, f) => { (e.ascoltatori[ev] = e.ascoltatori[ev] || []).push(f); };
    e.appendChild = f => { if (f.id) e._registro && e._registro(f); return f; };
    e.focus = () => { e.focalizzato++; };
    e.play = () => { e.paused = false; return Promise.resolve(); };
    e.pause = () => { e.paused = true; };
    e.closest = () => null;
    e.querySelector = sel => (sel.startsWith('#') && e._cerca ? e._cerca(sel.slice(1)) : null);
    e.scatta = (ev, dati = {}) => (e.ascoltatori[ev] || []).forEach(f => f({ target: e, preventDefault() {}, ...dati }));
    e.click = () => e.scatta('click');
    return e;
}

/**
 * Il menù di menu.html con una finestra finta. Gli elementi nascono dagli id veri del markup; quelli che lo script disegna (come il tasto "Log in"
 * dentro il pannello del giocatore) nascono quando compaiono nell'innerHTML di chi li contiene.
 */
function paginaMenu({ app = true, sessione = {}, memoria = {}, utenti = {}, giocatori = {}, stagioni = {}, firebaseAttivo = true, loginRiesce = true } = {}) {
    const registro = {};
    const nuovo = id => {
        const e = elemento(id);
        e._registro = f => { registro[f.id] = f; f._registro = e._registro; f._cerca = e._cerca; };
        e._cerca = i => registro[i] || null;
        Object.defineProperty(e, 'innerHTML', {
            get: () => e._html,
            set: v => { e._html = String(v); for (const m of e._html.matchAll(/\bid="([^"]+)"/g)) registro[m[1]] = nuovo(m[1]); }
        });
        return e;
    };
    const html = docs('menu.html');
    for (const m of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const e = nuovo(m[1]);
        e.className = (m[0].match(/\bclass="([^"]*)"/) || [, ''])[1];
        e.hidden = /\shidden[\s>]/.test(m[0]);
        registro[m[1]] = e;
    }
    const classiHtml = new Set();
    const proprieta = {};
    const registroEventi = { suoni: [], sostituzioni: [], timer: [], intervalli: [], accessi: [], uscite: [], reset: [], head: [] };
    const doc = {
        ascoltatori: {}, body: nuovo('body'),
        documentElement: { classList: { add: c => classiHtml.add(c), contains: c => classiHtml.has(c), toggle: (c, on) => { if (on) classiHtml.add(c); else classiHtml.delete(c); } }, style: { setProperty: (k, v) => { proprieta[k] = v; } } },
        head: { appendChild: f => { registroEventi.head.push(f); } },
        scripts: [{ getAttribute: () => 'app-comune.js' }],
        getElementById: id => registro[id] || null,
        createElement: tag => nuovo(tag === 'div' ? '' : tag),
        querySelector: sel => (sel === '.gx-dialogo:not([hidden])' ? Object.values(registro).find(e => /\bgx-dialogo\b/.test(e.className) && !e.hidden) || null : null),
        addEventListener: (ev, f) => { (doc.ascoltatori[ev] = doc.ascoltatori[ev] || []).push(f); }
    };
    doc.body._registro = f => { registro[f.id] = f; f._registro = doc.body._registro; f._cerca = doc.body._cerca; };
    doc.body._cerca = i => registro[i] || null;
    const leggiPercorso = (radice, p) => p.split('/').reduce((x, k) => (x == null ? x : x[k]), radice);
    let osservatore = null;
    const firebase = {
        apps: firebaseAttivo ? [{}] : [],
        database: () => ({
            ref: p => ({
                once: async () => {
                    const v = leggiPercorso({ users: utenti, players: giocatori, seasons: stagioni }, p);
                    return { val: () => (v === undefined ? null : v) };
                }
            })
        }),
        auth: () => ({
            onAuthStateChanged: f => { osservatore = f; },
            signInWithEmailAndPassword: async (m, pw) => { registroEventi.accessi.push([m, pw]); if (!loginRiesce) throw new Error('auth/wrong-password'); },
            signOut: async () => { registroEventi.uscite.push(1); },
            sendPasswordResetEmail: async m => { registroEventi.reset.push(m); }
        })
    };
    const memo = m => ({ getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } });
    const win = {
        document: doc, firebase, AppSito: A, memoria, sessione,
        location: { replace: u => registroEventi.sostituzioni.push(u) },
        localStorage: memo(memoria), sessionStorage: memo(sessione),
        Suoni: { fai: n => registroEventi.suoni.push(n) },
        setTimeout: (f, ms) => { registroEventi.timer.push({ f, ms }); return registroEventi.timer.length; },
        setInterval: (f, ms) => { registroEventi.intervalli.push({ f, ms }); return registroEventi.intervalli.length; },
        clearInterval: () => {},
        addEventListener: () => {},
        history: { state: null, pushState() {}, back() {} }
    };
    if (app) classiHtml.add('app');
    const r = M.avvia(win);
    return {
        win, doc, r, registro, classiHtml, proprieta, sessione, memoria, ...registroEventi,
        id: id => registro[id],
        accedi: user => osservatore && osservatore(user)
    };
}

test('dal browser (senza la classe app) il menù non c\'è: si torna alla home del sito', () => {
    const p = paginaMenu({ app: false });
    assert.equal(p.r, null);
    assert.deepEqual(p.sostituzioni, ['index.html']);
    assert.equal(p.id('gx-tessere').innerHTML, '', 'e non disegna niente');
    assert.equal(M.avvia({ document: null }), null);
});

test('le tessere: una per voce del gioco, nell\'ordine, con link, colore, posto, nome e sottotitolo', () => {
    const p = paginaMenu();
    const h = p.id('gx-tessere').innerHTML;
    const tessere = [...h.matchAll(/<a class="gx-tessera gx-t-(\w+)" href="([^"]+)" style="--c:(#[0-9a-f]{6});--i:(\d+)" data-suono="scegli">([\s\S]*?)<\/a>/g)];
    assert.deepEqual(tessere.map(t => t[1]), A.VOCI.map(v => v.id));
    A.VOCI.forEach((v, i) => {
        const t = tessere[i];
        assert.equal(t[2], v.href);
        assert.equal(t[3], v.colore);
        assert.equal(t[4], String(i));
        assert.match(t[5], new RegExp(`^<span class="gx-ico"><svg class="gx-icona"[^>]*>.+</svg></span><b>${v.et}</b>$`));
    });
});

test('la schermata del titolo: la prima volta di ogni visita c\'è ("Tap to start"); toccarla suona l\'avvio, fa partire la musica e la toglie; poi non torna', () => {
    const p = paginaMenu({});
    const splash = p.id('gx-splash');
    assert.equal(splash.hidden, false, 'si vede');
    assert.ok(!p.classiHtml.has('gx-pronto'), 'il menù aspetta');
    splash.click();
    assert.deepEqual(p.suoni, ['avvio']);
    assert.equal(p.sessione.menuSplashVisto, '1');
    assert.ok(splash.classi.has('esce'));
    assert.ok(p.classiHtml.has('gx-pronto'), 'le tessere entrano');
    assert.equal(p.id('bg-music-home').paused, false, 'la musica parte (il telefono la lascia partire solo dopo un tocco)');
    assert.equal(p.id('bg-music-home').muted, false);
    assert.equal(splash.hidden, false, 'sparisce a fine animazione');
    p.timer.find(t => t.ms === 520).f();
    assert.equal(splash.hidden, true);
    // un secondo tocco non rifà niente
    splash.click();
    assert.deepEqual(p.suoni, ['avvio']);
    // dalla tastiera
    const q = paginaMenu({});
    q.id('gx-splash').scatta('keydown', { key: 'x' });
    assert.equal(q.suoni.length, 0);
    q.id('gx-splash').scatta('keydown', { key: 'Enter' });
    assert.deepEqual(q.suoni, ['avvio']);
    // nella stessa visita, tornando al menù: niente schermata del titolo, le tessere ci sono subito
    const dopo = paginaMenu({ sessione: { menuSplashVisto: '1' } });
    assert.equal(dopo.id('gx-splash').hidden, true);
    assert.ok(dopo.classiHtml.has('gx-pronto'));
});

test('suono: la schermata del titolo rispetta la scelta di spegnerlo; il tasto in alto lo cambia (stessa chiave del resto del sito) e lo ridisegna', () => {
    const muto = paginaMenu({ memoria: { userMusicPref: 'off' } });
    assert.match(muto.id('gx-suono').innerHTML, /<path d="M11 5 6 9H2v6h4l5 4V5z"\/><path d="M16 9l6 6"\/>/, 'icona del suono spento');
    assert.equal(muto.id('gx-suono').attributi['aria-pressed'], 'false');
    muto.id('gx-splash').click();
    assert.equal(muto.id('bg-music-home').paused, true, 'musica spenta: non parte');
    // il tasto: da spento ad acceso
    muto.id('gx-suono').click();
    assert.equal(muto.memoria.userMusicPref, 'on');
    assert.equal(muto.id('gx-suono').attributi['aria-pressed'], 'true');
    assert.match(muto.id('gx-suono').innerHTML, /M15\.5 8\.5a5 5 0 0 1 0 7/, 'icona del suono acceso');
    assert.equal(muto.id('bg-music-home').paused, false, 'accendendolo la musica parte');
    assert.deepEqual(muto.suoni.slice(-1), ['scegli']);
    // e da acceso a spento: ferma la musica
    muto.id('gx-suono').click();
    assert.equal(muto.memoria.userMusicPref, 'off');
    assert.equal(muto.id('bg-music-home').paused, true);
    assert.equal(muto.id('bg-music-home').muted, true);
    // impostazioni
    assert.match(muto.id('gx-opzioni-apri').innerHTML, /<circle cx="12" cy="12" r="3\.2"\/>/);
});

test('senza account: pannello "Welcome!" con il tasto Log in; il tasto apre la finestra di accesso, che si chiude con la X, lo sfondo e Esc', () => {
    const p = paginaMenu({ sessione: { menuSplashVisto: '1' } });
    const g = p.id('gx-giocatore').innerHTML;
    assert.match(g, /<b class="gx-nome">Welcome!<\/b>/);
    assert.match(g, /id="gx-accedi"/);
    assert.equal(p.proprieta['--nb-accento'], undefined, 'nessun colore del giocatore: lo stile dell\'app è uno solo');
    const login = p.id('gx-login');
    assert.equal(login.hidden, true);
    p.id('gx-accedi').click();
    assert.equal(login.hidden, false);
    assert.ok(p.classiHtml.has('gx-dialogo-aperto'));
    assert.ok(p.timer.some(t => t.ms === 60), 'poi il cursore va sulla mail');
    p.timer.find(t => t.ms === 60).f();
    assert.equal(p.id('gx-email').focalizzato, 1, 'cursore sulla mail');
    login.scatta('click', { target: { closest: sel => (sel === '[data-chiudi]' ? {} : null) } });
    assert.equal(login.hidden, true);
    assert.ok(!p.classiHtml.has('gx-dialogo-aperto'));
    p.id('gx-accedi').click();
    login.scatta('click', { target: login });
    assert.equal(login.hidden, true, 'anche toccando lo sfondo');
    p.id('gx-accedi').click();
    p.doc.ascoltatori.keydown.forEach(f => f({ key: 'Escape' }));
    assert.equal(login.hidden, true, 'e con Esc');
});

test('accesso: email e password a Firebase; riuscito chiude la finestra e suona ok, sbagliato mostra l\'errore e suona errore; "Forgot password?" chiede prima la mail', async () => {
    const p = paginaMenu({ sessione: { menuSplashVisto: '1' } });
    p.id('gx-accedi').click();
    p.id('gx-email').value = 'a@b.it';
    p.id('gx-password').value = 'segreta';
    p.id('gx-login-form').scatta('submit');
    await passaUnGiro();
    assert.deepEqual(p.accessi, [['a@b.it', 'segreta']]);
    assert.equal(p.id('gx-login').hidden, true);
    assert.deepEqual(p.suoni.slice(-1), ['ok']);
    assert.equal(p.id('gx-login-errore').hidden, true);

    const m = paginaMenu({ sessione: { menuSplashVisto: '1' }, loginRiesce: false });
    m.id('gx-accedi').click();
    m.id('gx-email').value = 'a@b.it';
    m.id('gx-password').value = 'no';
    m.id('gx-login-form').scatta('submit');
    await passaUnGiro();
    assert.equal(m.id('gx-login').hidden, false, 'resta aperta');
    assert.equal(m.id('gx-login-errore').textContent, 'Wrong email or password.');
    assert.equal(m.id('gx-login-errore').hidden, false);
    assert.deepEqual(m.suoni.slice(-1), ['errore']);

    // password dimenticata
    m.id('gx-email').value = '   ';
    m.id('gx-password-dimenticata').click();
    assert.match(m.id('gx-login-errore').textContent, /Type your email first/);
    assert.deepEqual(m.reset, []);
    m.id('gx-email').value = ' a@b.it ';
    m.id('gx-password-dimenticata').click();
    await passaUnGiro();
    assert.deepEqual(m.reset, ['a@b.it']);
    assert.match(m.id('gx-login-errore').textContent, /Check your inbox/);
});

test('con l\'account: avatar, nome, titolo, Elo e stagioni vinte nel pannello; il suo colore NON cambia l\'aspetto (lo stile è uno solo); l\'amministratore trova Admin nelle impostazioni', async () => {
    const p = paginaMenu({
        sessione: { menuSplashVisto: '1' },
        utenti: { u1: { name: 'Didi', role: 'admin' } },
        giocatori: { didi: { info: { name: 'Didi', avatar: 'immagini/didi.png', color: '#e63946', title: 'Champion <b>' }, stats: { 'individual-stats': { ranking: 1234.4, showdownsPlayed: 6 }, seasons: { won: 2 } } } }
    });
    p.accedi({ uid: 'u1', email: 'd@x.it' });
    await passaUnGiro(); await passaUnGiro();
    const g = p.id('gx-giocatore').innerHTML;
    assert.match(g, /<img class="gx-avatar" src="immagini\/didi\.png"/);
    assert.match(g, /<b class="gx-nome">Didi<\/b>/);
    assert.match(g, /<small class="gx-titolo-g">Champion &lt;b&gt;<\/small>/, 'il titolo non può aprire tag');
    assert.match(g, /<li><b>1234<\/b><span>Elo<\/span><\/li>/);
    assert.match(g, /<li><b>#1<\/b><span>Ranking<\/span><\/li>/, 'il posto in classifica, non le stagioni vinte');
    assert.doesNotMatch(g, /Seasons won/);
    assert.match(g, /<span>Achievements<\/span>/, 'il tasto dice cos\'è');
    assert.doesNotMatch(g, /gx-accedi/);
    assert.equal(p.proprieta['--nb-accento'], undefined, 'il colore scelto per il sito non conta nell\'app');
    // le impostazioni: Admin e Log out
    p.id('gx-opzioni-apri').click();
    assert.ok(p.registro['gx-opzioni'], 'la finestra delle impostazioni è nata');
    const tessere = p.registro['gx-opzioni-griglia'].innerHTML;
    assert.match(tessere, /href="admin\.html"/);
    assert.match(tessere, /data-azione="esci"/);
    assert.match(tessere, /<small>Didi<\/small>/);
    // si esce
    p.registro['gx-opzioni'].scatta('click', { target: { closest: sel => (sel === '[data-azione]' ? { getAttribute: () => 'esci' } : null) } });
    assert.equal(p.uscite.length, 1);
    // uscito dall'account: torna il pannello "Welcome!"
    p.accedi(null);
    await passaUnGiro();
    assert.match(p.id('gx-giocatore').innerHTML, /Welcome!/);
    assert.equal(p.proprieta['--nb-accento'], undefined);
});

test('giocatore con pochi showdown: Elo "N/A"; senza titolo la riga del titolo non c\'è', async () => {
    const p = paginaMenu({
        sessione: { menuSplashVisto: '1' },
        utenti: { u1: { name: 'Luca' } },
        giocatori: { luca: { info: { name: 'Luca' }, stats: { 'individual-stats': { ranking: 1500, showdownsPlayed: 1 } } } }
    });
    p.accedi({ uid: 'u1' });
    await passaUnGiro(); await passaUnGiro();
    const g = p.id('gx-giocatore').innerHTML;
    assert.match(g, /<li><b>N\/A<\/b><span>Ranking<\/span><\/li><li><b>N\/A<\/b><span>Elo<\/span><\/li>/);
    assert.doesNotMatch(g, /gx-titolo-g/);
    assert.match(g, /src="immagini\/magikarp\.png"/, 'avatar di riserva');
});

test('la stagione del momento: il nastro sotto il giocatore, col tempo che manca e il tasto verso la pagina giusta', async () => {
    const scade = new Date(Date.now() + 2 * GIORNO + 3600000 + 60000).toISOString();
    const stagioni = {
        sbeta: { info: { status: 'closed', name: 'Beta' } },
        s0: { info: { status: 'closed', name: 'Season 0', winner: 'Luca' } },
        s1: { info: { status: 'closed', name: 'Season 1', winner: 'Luca' } },
        s2: { info: { status: 'open', name: 'Spring Cup', deadline: scade } }
    };
    const p = paginaMenu({ sessione: { menuSplashVisto: '1' }, stagioni });
    await passaUnGiro(); await passaUnGiro(); await passaUnGiro();
    const g = p.id('gx-giocatore').innerHTML;
    assert.match(g, /<a class="gx-stagione gx-st-open" href="hub\.html\?id=s2" data-suono="scegli">/);
    assert.match(g, /<b>Spring Cup<\/b><small>Sign-ups close in 2d 1h<\/small>/);
    assert.match(g, /<em>JOIN<\/em>/);
    // il conto alla rovescia si aggiorna da solo, ogni mezzo minuto
    assert.equal(p.intervalli.length, 2);
    assert.ok(p.intervalli.some(i => i.ms === 30000), 'il conto alla rovescia, ogni mezzo minuto');
    assert.ok(p.intervalli.some(i => i.ms === M.PASSO_NASTRO || i.ms === 4000), 'il nastro che passa da una stagione all\'altra');
    // senza nessuna stagione: niente nastro
    const vuoto = paginaMenu({ sessione: { menuSplashVisto: '1' } });
    await passaUnGiro(); await passaUnGiro();
    assert.doesNotMatch(vuoto.id('gx-giocatore').innerHTML, /gx-stagione/);
});

test('l\'annuncio delle iscrizioni aperte: dopo la schermata del titolo, a chi non è iscritto, con il nome della stagione e il tasto che porta a iscriversi; una volta sola per stagione', async () => {
    const scade = new Date(Date.now() + 4 * GIORNO + 3600000 + 60000).toISOString();
    const stagioni = {
        sbeta: { info: { status: 'closed', name: 'Beta' } },
        s1: { info: { status: 'open', name: 'Christmas Cup', deadline: scade }, iscritti: { Luca: true } }
    };
    const utenti = { u1: { name: 'Didi' } };
    const giocatori = { didi: { info: { name: 'Didi' }, stats: {} } };
    const carica = async opzioni => {
        const p = paginaMenu({ stagioni, utenti, giocatori, ...opzioni });
        p.accedi({ uid: 'u1', email: 'd@x.it' });
        for (let i = 0; i < 6; i++) await passaUnGiro();
        return p;
    };
    // la schermata del titolo è già passata: il messaggio compare appena si sa chi sei e quale stagione è aperta
    const p = await carica({ sessione: { menuSplashVisto: '1' } });
    const a = p.id('gx-annuncio');
    assert.equal(a.hidden, false);
    assert.equal(p.id('gx-annuncio-nome').textContent, 'Christmas Cup');
    assert.equal(p.id('gx-annuncio-tempo').textContent, 'Closes in 4d 1h');
    assert.equal(p.id('gx-annuncio-vai').attributi.href, 'hub.html?id=s1');
    assert.ok(p.classiHtml.has('gx-dialogo-aperto'), 'la schermata dietro sta ferma');
    assert.deepEqual(p.suoni.slice(-1), ['ok']);
    assert.equal(p.memoria.appStagioneVista, 's1', 'la stagione annunciata si ricorda');
    // si chiude con "Later", toccando lo sfondo e con Esc
    a.scatta('click', { target: { closest: sel => (sel === '[data-chiudi]' ? {} : null) } });
    assert.equal(a.hidden, true);
    assert.ok(!p.classiHtml.has('gx-dialogo-aperto'));
    // l'annuncio non torna nella stessa visita, né nelle prossime (la stagione è già stata annunciata)
    const dopo = await carica({ sessione: { menuSplashVisto: '1' }, memoria: { appStagioneVista: 's1' } });
    assert.equal(dopo.id('gx-annuncio').hidden, true);
    // una stagione nuova si annuncia di nuovo
    const nuova = await carica({ sessione: { menuSplashVisto: '1' }, memoria: { appStagioneVista: 's0' } });
    assert.equal(nuova.id('gx-annuncio').hidden, false);
    // c'è anche il nastro con "JOIN" sotto il giocatore, anche dopo aver chiuso il messaggio
    assert.match(p.id('gx-giocatore').innerHTML, /<em>JOIN<\/em>/);
    // sfondo e Esc
    const q = await carica({ sessione: { menuSplashVisto: '1' } });
    q.id('gx-annuncio').scatta('click', { target: q.id('gx-annuncio') });
    assert.equal(q.id('gx-annuncio').hidden, true, 'toccando lo sfondo');
    const r = await carica({ sessione: { menuSplashVisto: '1' } });
    r.doc.ascoltatori.keydown.forEach(f => f({ key: 'Escape' }));
    assert.equal(r.id('gx-annuncio').hidden, true, 'con Esc');
});

test('l\'annuncio delle iscrizioni aperte: aspetta la schermata del titolo; non compare a chi è già iscritto, a chi non ha un account, né con la stagione già iniziata', async () => {
    const scade = new Date(Date.now() + 2 * GIORNO).toISOString();
    const utenti = { u1: { name: 'Didi' } };
    const giocatori = { didi: { info: { name: 'Didi' }, stats: {} } };
    const aperta = { sbeta: { info: { status: 'closed' } }, s1: { info: { status: 'open', name: 'Spring Cup', deadline: scade }, iscritti: { Luca: true } } };
    const giro = async () => { for (let i = 0; i < 6; i++) await passaUnGiro(); };
    // con la schermata del titolo ancora sopra: aspetta; si mostra a fine animazione
    const titolo = paginaMenu({ stagioni: aperta, utenti, giocatori });
    titolo.accedi({ uid: 'u1' });
    await giro();
    assert.equal(titolo.id('gx-annuncio').hidden, true, 'prima il titolo');
    titolo.id('gx-splash').click();
    assert.equal(titolo.id('gx-annuncio').hidden, true, 'e finché l\'animazione non finisce');
    titolo.timer.find(t => t.ms === 520).f();
    assert.equal(titolo.id('gx-annuncio').hidden, false, 'poi il messaggio');
    // già iscritto (anche con le maiuscole diverse)
    const dentro = paginaMenu({ sessione: { menuSplashVisto: '1' }, utenti, giocatori, stagioni: { sbeta: aperta.sbeta, s1: { info: aperta.s1.info, iscritti: { DIDI: true } } } });
    dentro.accedi({ uid: 'u1' });
    await giro();
    assert.equal(dentro.id('gx-annuncio').hidden, true);
    assert.equal(dentro.memoria.appStagioneVista, undefined, 'e niente da ricordare');
    assert.match(dentro.id('gx-giocatore').innerHTML, /<em>TEAMS<\/em>/, 'il nastro porta ai suoi team');
    // senza account
    const ospite = paginaMenu({ sessione: { menuSplashVisto: '1' }, utenti, giocatori, stagioni: aperta });
    await giro();
    assert.equal(ospite.id('gx-annuncio').hidden, true);
    // stagione già in corso (iscrizioni chiuse)
    const inCorso = paginaMenu({ sessione: { menuSplashVisto: '1' }, utenti, giocatori, stagioni: { sbeta: aperta.sbeta, s1: { info: { status: 'playing', name: 'Spring Cup' } } } });
    inCorso.accedi({ uid: 'u1' });
    await giro();
    assert.equal(inCorso.id('gx-annuncio').hidden, true);
    // il tasto dell'annuncio porta all'iscrizione: la pagina esiste e legge l'id
    assert.match(docs('hub.html'), /urlParams\.get\('id'\)/);
});

test('Firebase che parte dopo la pagina: il menù aspetta (senza mai bloccarsi) e poi legge giocatore e stagione', async () => {
    const p = paginaMenu({ sessione: { menuSplashVisto: '1' }, firebaseAttivo: false });
    assert.equal(p.intervalli.length, 3, 'il conto alla rovescia, il nastro delle stagioni e l\'attesa di Firebase');
    const attesa = p.intervalli.find(i => i.ms === 150);
    assert.ok(attesa);
    // le tessere e il pannello "Welcome!" ci sono comunque
    assert.equal((p.id('gx-tessere').innerHTML.match(/gx-tessera /g) || []).length, 5);
    assert.match(p.id('gx-giocatore').innerHTML, /Welcome!/);
    // Firebase arriva
    p.win.firebase.apps.push({});
    attesa.f();
    await passaUnGiro();
    assert.ok(p.accedi, 'ora ascolta l\'accesso');
});

test('stagioniDaMostrare: tutte le aperte (la più vicina alla scadenza prima) e tutte quelle in corso; se non c\'è altro, l\'ultima conclusa', () => {
    const adesso = Date.UTC(2026, 9, 5, 12);
    const info = (status, deadline) => ({ info: { status, ...(deadline ? { deadline } : {}) } });
    const lista = M.stagioniDaMostrare([
        { id: 's1', ...info('closed') }, { id: 's2', ...info('playing') }, { id: 's3', ...info('playing') },
        { id: 's4', ...info('open', new Date(adesso + 5 * 86400000).toISOString()) }, { id: 's5', ...info('open', new Date(adesso + 2 * 86400000).toISOString()) },
        { id: 'sbeta', ...info('playing') }, { id: 's9' }
    ], adesso);
    assert.deepEqual(lista.map(x => x.id), ['s5', 's4', 's3', 's2'], 'prima le aperte per scadenza, poi le in corso dalla più recente; senza beta');
    assert.equal(lista[0].mancano, 2 * 86400000);
    assert.equal(lista[2].mancano, null);
    assert.deepEqual(M.stagioniDaMostrare([{ id: 's1', ...info('closed') }, { id: 's2', ...info('closed') }], adesso).map(x => x.id), ['s2'], 'solo l\'ultima conclusa');
    assert.deepEqual(M.stagioniDaMostrare([], adesso), []);
    assert.deepEqual(M.stagioniDaMostrare([{ id: 'sbeta', ...info('playing') }], adesso).map(x => x.id), ['sbeta'], 'la beta solo se non c\'è altro');
    assert.equal(M.stagioneDaMostrare([{ id: 's1', ...info('playing') }], adesso).id, 's1', 'quella di prima resta valida');
});
