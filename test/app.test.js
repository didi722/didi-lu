'use strict';
// Il sito come app (docs/app.js, app.css, manifest.webmanifest, sw.js, offline.html): installabile su iPhone e Android, e come app (icona sulla Home o APK)
// diventa un gioco da telefono: sempre in orizzontale, si parte dal menù principale, le altre pagine hanno l'interfaccia da gioco.
//   - la parte pura: come è aperto il sito, a quale tessera del menù appartiene una pagina, quando proporre di installare;
//   - il comportamento con una finestra finta: classi su <html>, fogli e script che arrivano solo all'app, il menù alla prima apertura, l'orientamento,
//     le barre di sistema, l'avviso "gira il telefono", la tastiera, l'invito a installare, il service worker;
//   - il cablaggio: ogni pagina collega manifest, icona, app.css e app.js; il manifest punta a icone vere; il service worker non tiene pagine in cache;
//   - app.css: fuori dall'app non cambia nulla (a parte il doppio tocco e l'invito a installare).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('../docs/app.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const esiste = nome => fs.existsSync(path.join(DOCS, nome));
const PAGINE = fs.readdirSync(DOCS).filter(f => f.endsWith('.html') && f !== 'offline.html').sort();

const UA = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    webview: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36',
    apk: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 SantAlviseApp',
    instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0',
    pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

// ---------- la parte pura ----------

test('nomePagina: il file della pagina in minuscolo; la radice e le cartelle sono la home', () => {
    assert.equal(A.nomePagina('/didi-lu/Matches.html'), 'matches.html');
    assert.equal(A.nomePagina('/didi-lu/box.html?x=1#y'), 'box.html');
    assert.equal(A.nomePagina('/didi-lu/'), 'index.html');
    assert.equal(A.nomePagina('/'), 'index.html');
    assert.equal(A.nomePagina(''), 'index.html');
    assert.equal(A.nomePagina(undefined), 'index.html');
});

test('modoApp: APK dal suo user agent; icona sulla Home da display-mode, iOS o provenienza Android; altrimenti browser', () => {
    assert.equal(A.modoApp({ ua: UA.apk }), 'apk');
    assert.equal(A.modoApp({ ua: UA.android, standalone: true }), 'installata');
    assert.equal(A.modoApp({ ua: UA.iphone, iosStandalone: true }), 'installata');
    assert.equal(A.modoApp({ ua: UA.android, referrer: 'android-app://com.android.chrome' }), 'installata');
    assert.equal(A.modoApp({ ua: UA.android, referrer: 'https://www.google.com/' }), '');
    assert.equal(A.modoApp({ ua: UA.pc }), '');
    assert.equal(A.modoApp({}), '');
    assert.equal(A.modoApp(), '');
});

test('modoApp: ?app=1 mostra l\'aspetto da app anche nel browser, ?app=0 lo toglie; l\'APK resta sempre app', () => {
    assert.equal(A.modoApp({ ua: UA.pc, forzata: '1' }), 'installata');
    assert.equal(A.modoApp({ ua: UA.android, standalone: true, forzata: '0' }), '');
    assert.equal(A.modoApp({ ua: UA.apk, forzata: '0' }), 'apk');
    assert.equal(A.modoApp({ ua: UA.pc, forzata: '' }), '');
});

test('sistema: iPhone, iPad (anche quando si spaccia per Mac), Android; il resto no', () => {
    assert.equal(A.sistema(UA.iphone, 5), 'ios');
    assert.equal(A.sistema(UA.ipad, 5), 'ios');
    assert.equal(A.sistema(UA.mac, 0), '');
    assert.equal(A.sistema(UA.android, 5), 'android');
    assert.equal(A.sistema(UA.pc, 0), '');
    assert.equal(A.sistema(undefined), '');
});

test('dentroUnaApp: i browser incorporati (Instagram, Facebook, WebView) non possono installare', () => {
    assert.equal(A.dentroUnaApp(UA.instagram), true);
    assert.equal(A.dentroUnaApp('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]'), true);
    assert.equal(A.dentroUnaApp(UA.webview), true);
    assert.equal(A.dentroUnaApp(UA.iphone), false);
    assert.equal(A.dentroUnaApp(UA.android), false);
    assert.equal(A.dentroUnaApp(undefined), false);
});

test('le tessere del menù (VOCI): quattro (Play riunisce Practice e Matches), con colore, pagina e icona; le pagine citate esistono; ogni pagina appartiene a una sola tessera', () => {
    assert.deepEqual(A.VOCI.map(v => v.id), ['play', 'box', 'trainers', 'stats']);
    assert.equal(new Set(A.VOCI.map(v => v.et)).size, 4, 'nomi diversi');
    assert.equal(new Set(A.VOCI.map(v => v.colore)).size, 4, 'colori diversi: ogni schermata ha il suo');
    assert.deepEqual(A.VOCI[0].pagine, ['practice.html', 'matches.html'], 'Play tiene accese le sue due pagine: l\'hub e showdown e classifica');
    const viste = [];
    for (const v of A.VOCI) {
        assert.match(v.colore, /^#[0-9a-f]{6}$/i, `${v.id}: colore`);
        assert.ok(esiste(v.href), `${v.id}: manca ${v.href}`);
        assert.ok(v.pagine.includes(v.href), `${v.id}: la sua pagina principale (${v.href}) è tra le pagine`);
        for (const p of v.pagine) { assert.ok(esiste(p), `${v.id}: manca ${p}`); assert.ok(A.haHud(p), `${p} ha l'interfaccia da gioco`); viste.push(p); }
    }
    assert.equal(new Set(viste).size, viste.length, 'una pagina in due tessere');
    assert.ok(!viste.includes('menu.html'));
    for (const p of A.SENZA_HUD) assert.ok(esiste(p), `manca ${p}`);
    // le pagine del sito che nell'app non servono non stanno in nessuna tessera
    for (const p of A.FUORI_APP) { assert.ok(esiste(p), `manca ${p}`); assert.ok(!viste.includes(p), `${p} è fuori dall'app ma ha una tessera`); }
});

test('voceDi: a quale tessera appartiene la pagina (Practice e Matches stanno sotto Play); iscrizione, battaglia, accesso, menù e pagine fuori dall\'app (anche la pagina pubblica) a nessuna', () => {
    assert.equal(A.voceDi('/didi-lu/matches.html').id, 'play');
    assert.equal(A.voceDi('/didi-lu/box.html').id, 'box');
    assert.equal(A.voceDi('/didi-lu/players.html').id, 'trainers');
    assert.equal(A.voceDi('/didi-lu/practice.html').id, 'play');
    assert.equal(A.voceDi('/didi-lu/stats.html').id, 'stats');
    for (const p of ['hub.html', 'index.html', 'palmares.html', 'public.html', 'battle.html', 'login.html', 'menu.html', 'admin.html', 'schermata-base-vuota.html']) assert.equal(A.voceDi(p), null, p);
});

test('haHud: tutte le pagine del gioco hanno l\'interfaccia in alto; menù, battaglia, accesso, amministrazione e modello vuoto no', () => {
    for (const p of ['menu.html', 'battle.html', 'login.html', 'admin.html', 'schermata-base-vuota.html']) assert.equal(A.haHud(p), false, p);
    for (const p of ['index.html', 'matches.html', 'box.html', 'players.html', 'stats.html', 'profile.html', 'public.html', 'hub.html', 'palmares.html', 'rules.html', 'formats.html']) assert.equal(A.haHud(p), true, p);
});

test('fuoriApp: stagioni (home), profilo, archivio, formati, regolamento e pagina pubblica non hanno posto nell\'app; il resto si apre dov\'è', () => {
    for (const p of ['/didi-lu/index.html', '/didi-lu/', '/didi-lu/profile.html', '/didi-lu/palmares.html?x=1', '/didi-lu/formats.html', '/didi-lu/rules.html#a', '/didi-lu/public.html?player=didi']) assert.equal(A.fuoriApp(p), true, p);
    for (const p of ['matches.html', 'hub.html', 'box.html', 'players.html', 'practice.html', 'stats.html', 'menu.html', 'battle.html']) assert.equal(A.fuoriApp('/didi-lu/' + p), false, p);
});

test('fissaStile: lo stile è quello dell\'app: tema predefinito sul sito, via il colore del giocatore e i caratteri del tema scelto', () => {
    const html = elemento('html');
    html.attributi['data-tema'] = 'arcade';
    const tolte = [];
    html.style.removeProperty = k => tolte.push(k);
    let carattere = 0;
    A.fissaStile({ documentElement: html, getElementById: id => (id === 'temi-caratteri' ? { remove: () => { carattere++; } } : null) });
    assert.equal(html.attributi['data-tema'], 'neubrutal');
    assert.equal(A.TEMA_APP, 'neubrutal');
    assert.deepEqual(tolte, ['--nb-accento']);
    assert.equal(carattere, 1);
    // senza il foglio dei caratteri (tema predefinito) e senza style: non lancia
    assert.doesNotThrow(() => A.fissaStile({ documentElement: elemento('html'), getElementById: () => null }));
});

test('proporreInstallazione: solo dal telefono, nel browser, sulla home; chiuso, torna dopo 14 giorni', () => {
    const adesso = Date.UTC(2026, 9, 25, 12);
    const base = { modo: '', sistema: 'ios', pagina: '/didi-lu/index.html', inApp: false, chiusoIl: 0, adesso };
    assert.equal(A.proporreInstallazione(base), true);
    assert.equal(A.proporreInstallazione({ ...base, pagina: '/didi-lu/' }), true);
    assert.equal(A.proporreInstallazione({ ...base, sistema: 'android' }), true);
    assert.equal(A.proporreInstallazione({ ...base, sistema: '' }), false, 'da PC no');
    assert.equal(A.proporreInstallazione({ ...base, modo: 'installata' }), false, 'già installata');
    assert.equal(A.proporreInstallazione({ ...base, modo: 'apk' }), false);
    assert.equal(A.proporreInstallazione({ ...base, inApp: true }), false, 'browser incorporato');
    assert.equal(A.proporreInstallazione({ ...base, pagina: '/didi-lu/matches.html' }), false, 'solo sulla home');
    assert.equal(A.proporreInstallazione({ ...base, chiusoIl: adesso - 2 * 86400000 }), false, 'chiuso due giorni fa');
    assert.equal(A.proporreInstallazione({ ...base, chiusoIl: adesso - 13 * 86400000 }), false);
    assert.equal(A.proporreInstallazione({ ...base, chiusoIl: adesso - 15 * 86400000 }), true, 'dopo due settimane torna');
    assert.equal(A.GIORNI_INVITO, 14);
});

// ---------- una finestra finta, quanto basta ----------

function elemento(tag) {
    const e = {
        nodeType: 1, tagName: tag.toUpperCase(), id: '', style: {}, scrollTop: 0, textContent: '', parentElement: null,
        figli: [], attributi: {}, ascoltatori: {}, classi: new Set(), _html: '', _trovati: {}, clic: 0
    };
    e.classList = {
        add: (...c) => c.forEach(x => e.classi.add(x)),
        remove: (...c) => c.forEach(x => e.classi.delete(x)),
        toggle: (c, acceso) => { if (acceso === undefined ? !e.classi.has(c) : acceso) e.classi.add(c); else e.classi.delete(c); },
        contains: c => e.classi.has(c)
    };
    Object.defineProperty(e, 'className', { get: () => [...e.classi].join(' '), set: v => { e.classi = new Set(String(v).split(/\s+/).filter(Boolean)); } });
    Object.defineProperty(e, 'innerHTML', { get: () => e._html, set: v => { e._html = String(v); e._trovati = {}; } });
    e.setAttribute = (k, v) => { e.attributi[k] = String(v); };
    e.getAttribute = k => (k in e.attributi ? e.attributi[k] : null);
    e.appendChild = f => { f.parentElement = e; e.figli.push(f); return f; };
    e.remove = () => { if (e.parentElement) e.parentElement.figli = e.parentElement.figli.filter(x => x !== e); e.parentElement = null; };
    e.addEventListener = (ev, f) => { (e.ascoltatori[ev] = e.ascoltatori[ev] || []).push(f); };
    e.click = () => { e.clic++; (e.ascoltatori.click || []).forEach(f => f({ stopPropagation() {} })); };
    e.matches = () => false;
    // il contenuto messo con innerHTML si interroga solo con i tre selettori che app.js usa: .classe, [attributo] e span
    e.querySelector = sel => {
        const re = sel.startsWith('.') ? new RegExp('class="[^"]*\\b' + sel.slice(1) + '\\b') : sel.startsWith('[') ? new RegExp(sel.slice(1, -1) + '(=|\\s|>)') : new RegExp('<' + sel + '[\\s>]');
        if (!re.test(e._html)) return null;
        return e._trovati[sel] || (e._trovati[sel] = elemento('x'));
    };
    return e;
}

function cerca(radice, id) {
    for (const f of radice.figli) {
        if (f.id === id) return f;
        const d = cerca(f, id);
        if (d) return d;
    }
    return null;
}

/**
 * Apre una pagina finta e fa partire app.js. Con `stato` si guardano classi, fogli e script caricati, reindirizzamenti, orientamento, barre, invito...
 * `srcApp`: come la pagina scrive l'indirizzo di app.js (con un numero di versione si vede che i file dell'app lo ereditano).
 */
function apri({ ua = UA.pc, percorso = '/didi-lu/index.html', search = '', protocollo = 'https:', host = 'didi722.github.io', standalone = false, fullscreen = false, iosStandalone,
    referrer = '', memoria = {}, sessione = {}, caricamento = false, inFrame = false, punti = 0, serviceWorker = true, storageRotto = false, nativo = null, srcApp = 'app.js' } = {}) {
    const doc = { readyState: caricamento ? 'loading' : 'complete', referrer, documentElement: elemento('html'), body: elemento('body'), head: elemento('head'), ascoltatori: {}, scritture: [] };
    doc.scripts = [{ getAttribute: k => (k === 'src' ? srcApp : null) }];
    doc.createElement = tag => elemento(tag);
    doc.getElementById = id => cerca(doc.body, id);
    doc.addEventListener = (ev, f) => { (doc.ascoltatori[ev] = doc.ascoltatori[ev] || []).push(f); };
    doc.write = h => { doc.scritture.push(h); };
    const stato = { memoria, sessione, doc, registrazioni: [], reindirizzato: [], timer: [], blocchi: [], barre: 0 };
    const navigator = { userAgent: ua, maxTouchPoints: punti, standalone: iosStandalone };
    if (serviceWorker) navigator.serviceWorker = { register: url => { stato.registrazioni.push(url); return Promise.resolve(); } };
    const memo = (m, rotto) => (rotto
        ? { getItem() { throw new Error('storage bloccato'); }, setItem() { throw new Error('storage bloccato'); }, removeItem() { throw new Error('storage bloccato'); } }
        : { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } });
    const win = {
        document: doc, navigator, ascoltatori: {},
        location: { search, pathname: percorso, protocol: protocollo, hostname: host, replace(url) { stato.reindirizzato.push(url); } },
        localStorage: memo(memoria, storageRotto), sessionStorage: memo(sessione, storageRotto),
        matchMedia: q => ({ matches: (standalone && /standalone/.test(q)) || (fullscreen && /fullscreen/.test(q)) }),
        URLSearchParams,
        setTimeout: (f, ms) => { stato.timer.push({ f, ms }); return stato.timer.length; },
        clearTimeout: n => { if (stato.timer[n - 1]) stato.timer[n - 1].f = null; },
        addEventListener: (ev, f) => { (win.ascoltatori[ev] = win.ascoltatori[ev] || []).push(f); }
    };
    if (nativo) {
        win.Capacitor = {
            isNativePlatform: () => true,
            Plugins: {
                ScreenOrientation: { lock: async o => { stato.blocchi.push(o.orientation); } },
                SystemBars: { hide: async () => { stato.barre++; } }
            }
        };
    }
    win.self = win;
    win.top = inFrame ? {} : win;
    stato.win = win;
    stato.html = doc.documentElement;
    stato.risultato = A.avvia(win);
    stato.classi = () => [...stato.html.classi].sort();
    stato.invito = () => doc.getElementById('app-invito');
    stato.avviso = () => doc.getElementById('app-ruota');
    stato.sulla = (oggetto, ev, dati) => (oggetto.ascoltatori[ev] || []).forEach(f => f(dati));
    stato.finisciCaricamento = () => { doc.readyState = 'complete'; stato.sulla(doc, 'DOMContentLoaded'); };
    // gli script e i fogli che l'app ha aggiunto alla pagina (nell'ordine), e quelli scritti mentre la pagina si legge
    stato.script = () => doc.head.figli.filter(f => f.tagName === 'SCRIPT').map(f => f.src);
    stato.fogli = () => [...doc.scritture.map(h => (h.match(/href="([^"]+)"/) || [])[1]), ...doc.head.figli.filter(f => f.tagName === 'LINK').map(f => f.href)].filter(Boolean);
    return stato;
}


// ---------- come si presenta la pagina ----------

test('nel browser da PC: nessuna classe, nessun foglio né script dell\'app, nessun invito, nessun service worker (il sito è quello di sempre)', () => {
    const s = apri({ ua: UA.pc, percorso: '/didi-lu/matches.html' });
    assert.deepEqual(s.risultato, { modo: '' });
    assert.deepEqual(s.classi(), []);
    assert.equal(s.avviso(), null);
    assert.equal(s.invito(), null);
    assert.equal(s.doc.body.figli.length, 0);
    assert.deepEqual(s.script(), []);
    assert.deepEqual(s.fogli(), []);
    assert.deepEqual(s.reindirizzato, []);
    s.sulla(s.win, 'load');
    assert.deepEqual(s.registrazioni, []);
});

test('service worker: solo da telefono o tablet (anche dentro l\'APK: tiene in cache gli sprite), su https o localhost, solo se il browser lo ha', () => {
    const registra = opz => { const s = apri(opz); assert.deepEqual(s.registrazioni, [], 'non prima che la pagina sia caricata'); s.sulla(s.win, 'load'); return s.registrazioni; };
    assert.deepEqual(registra({ ua: UA.android }), ['sw.js']);
    assert.deepEqual(registra({ ua: UA.iphone }), ['sw.js']);
    assert.deepEqual(registra({ ua: UA.ipad, punti: 5 }), ['sw.js'], 'anche l\'iPad che si spaccia per Mac');
    assert.deepEqual(registra({ ua: UA.android, protocollo: 'http:', host: 'localhost' }), ['sw.js'], 'localhost va bene anche senza https');
    assert.deepEqual(registra({ ua: UA.android, protocollo: 'http:', host: '192.168.1.20' }), [], 'http in rete: il browser non lo permetterebbe');
    assert.deepEqual(registra({ ua: UA.pc }), [], 'da PC non serve');
    assert.deepEqual(registra({ ua: UA.pc, search: '?app=1' }), [], 'nemmeno guardando l\'aspetto da app dal PC');
    assert.deepEqual(registra({ ua: UA.android, serviceWorker: false }), []);
    assert.deepEqual(registra({ ua: UA.apk, percorso: '/didi-lu/box.html', punti: 5 }), ['sw.js'], 'nell\'APK serve per le immagini: senza, le GIF dei Pokémon si riscaricano a ogni apertura');
});

test('dall\'icona sulla Home dell\'iPhone, in una pagina del gioco: classi app e app-shell, i fogli e gli script dell\'interfaccia da gioco nell\'ordine, nessun invito', () => {
    const s = apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/matches.html', punti: 5 });
    assert.deepEqual(s.risultato, { modo: 'installata' });
    assert.deepEqual(s.classi(), ['app', 'app-installata', 'app-shell', 'os-ios']);
    assert.deepEqual(s.reindirizzato, [], 'una pagina diversa dalla home si apre dov\'è');
    assert.deepEqual(s.fogli(), ['app-gioco.css', 'app-gioco-pagine.css'], 'l\'aspetto comune e quello delle pagine');
    // suoni (per ogni pagina dell'app), poi le parti comuni e l'interfaccia in alto: nell'ordine in cui servono (async = false: partono uno dopo l'altro)
    assert.deepEqual(s.script(), ['app-suoni.js', 'app-comune.js', 'app-gioco.js', 'app-carosello.js', 'altezze-pkm.js', 'scala-pkm.js', 'app-classifica.js', 'app-matches.js'], 'poi quelli della pagina (Matches: il carosello della classifica e le locandine dei showdown)');
    for (const f of s.doc.head.figli.filter(x => x.tagName === 'SCRIPT')) assert.equal(f.async, false, `${f.src}: async = false per l'ordine`);
    assert.equal(s.invito(), null);
});

test('i fogli e gli script dell\'app ereditano l\'indirizzo di app.js (anche con un numero di versione), a pagina letta si aggiungono alla testa', () => {
    const s = apri({ ua: UA.android, standalone: true, percorso: '/didi-lu/box.html', srcApp: 'app.js?v=7' });
    assert.deepEqual(s.fogli(), ['app-gioco.css?v=7', 'app-gioco-pagine.css?v=7']);
    assert.deepEqual(s.script(), ['app-suoni.js?v=7', 'app-comune.js?v=7', 'app-gioco.js?v=7', 'app-carosello.js?v=7', 'app-teambuilder.js?v=7', 'app-box-badge.js?v=7']);
    // mentre la pagina si legge i fogli si scrivono subito (document.write): il sito "da PC" non lampeggia prima dell'app
    const l = apri({ ua: UA.android, standalone: true, percorso: '/didi-lu/box.html', caricamento: true });
    assert.deepEqual(l.doc.scritture, ['<link rel="stylesheet" href="app-gioco.css">', '<link rel="stylesheet" href="app-gioco-pagine.css">']);
    assert.deepEqual(l.script(), ['app-suoni.js', 'app-comune.js', 'app-gioco.js', 'app-carosello.js', 'app-teambuilder.js', 'app-box-badge.js']);
    assert.deepEqual(l.classi(), ['app', 'app-installata', 'app-shell', 'os-android'], 'le classi arrivano subito (niente sfarfallio)');
    assert.equal(l.avviso(), null, 'l\'avviso "gira il telefono" aspetta la pagina pronta');
});

test('dentro l\'APK, in una pagina del gioco: classe app-apk, service worker (per le immagini), orientamento bloccato e barre di sistema nascoste', async () => {
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/box.html', punti: 5, nativo: true });
    assert.deepEqual(s.risultato, { modo: 'apk' });
    assert.deepEqual(s.classi(), ['app', 'app-apk', 'app-shell', 'os-android']);
    s.sulla(s.win, 'load');
    assert.deepEqual(s.registrazioni, ['sw.js']);
    await new Promise(r => setImmediate(r));
    assert.deepEqual(s.blocchi, ['landscape']);
    assert.equal(s.barre, 1);
    assert.equal(s.invito(), null, 'dentro l\'app non si invita a installare l\'app');
});

test('dall\'app (telefono) le pagine che nell\'app non servono portano al menù, ogni volta: la home (stagioni), profilo, archivio, formati e regolamento', () => {
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/index.html', punti: 5 });
    assert.deepEqual(s.risultato, { modo: 'apk', menu: true, verso: 'menu.html' });
    assert.deepEqual(s.reindirizzato, ['menu.html']);
    assert.deepEqual(s.script(), [], 'la pagina che sta per essere sostituita non carica niente');
    assert.deepEqual(s.fogli(), []);
    // sempre, non solo la prima volta (non c\'è più una pagina "Seasons")
    assert.deepEqual(apri({ ua: UA.apk, percorso: '/didi-lu/index.html', punti: 5 }).reindirizzato, ['menu.html']);
    for (const p of ['profile.html', 'palmares.html', 'formats.html', 'rules.html']) assert.deepEqual(apri({ ua: UA.apk, percorso: '/didi-lu/' + p, punti: 5 }).reindirizzato, ['menu.html'], p);
    // la pagina pubblica è stata fusa in Trainers: porta alla scheda dello stesso allenatore (o alla pagina, senza nome)
    assert.deepEqual(apri({ ua: UA.apk, percorso: '/didi-lu/public.html', search: '?player=Didi', punti: 5 }).reindirizzato, ['players.html?player=Didi']);
    assert.deepEqual(apri({ ua: UA.apk, percorso: '/didi-lu/public.html', punti: 5 }).reindirizzato, ['players.html']);
    // le pagine del gioco (anche l\'iscrizione, dove porta il messaggio delle stagioni aperte) si aprono dove sono
    for (const p of ['matches.html', 'hub.html', 'box.html', 'players.html', 'practice.html', 'stats.html']) assert.deepEqual(apri({ ua: UA.apk, percorso: '/didi-lu/' + p, punti: 5 }).reindirizzato, [], p);
});

test('lo stile è uno solo: dall\'app il tema e il colore del giocatore (già messi dal sito) si tolgono; nel browser restano', () => {
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/matches.html', punti: 5 });
    assert.equal(s.html.attributi['data-tema'], 'neubrutal');
    const b = apri({ ua: UA.android, percorso: '/didi-lu/matches.html', punti: 5 });
    assert.equal(b.html.attributi['data-tema'], undefined, 'nel browser nessuno tocca il tema');
    // anche nel menù e nella battaglia
    assert.equal(apri({ ua: UA.apk, percorso: '/didi-lu/menu.html', punti: 5 }).html.attributi['data-tema'], 'neubrutal');
    assert.equal(apri({ ua: UA.apk, percorso: '/didi-lu/battle.html' }).html.attributi['data-tema'], 'neubrutal');
});

test('il menù dal telefono solo dove ha senso: non dal computer (app installata sul PC), non nel browser, non nella battaglia', () => {
    assert.deepEqual(apri({ ua: UA.pc, search: '?app=1', percorso: '/didi-lu/index.html' }).reindirizzato, [], 'PC con ?app=1: resta la home');
    assert.deepEqual(apri({ ua: UA.android, percorso: '/didi-lu/index.html' }).reindirizzato, [], 'nel browser del telefono: il sito di sempre');
    assert.deepEqual(apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/index.html', punti: 5 }).reindirizzato, ['menu.html'], 'dall\'icona dell\'iPhone sì');
    assert.deepEqual(apri({ ua: UA.android, fullscreen: true, percorso: '/didi-lu/index.html' }).reindirizzato, ['menu.html'], 'app installata a schermo intero (display-mode: fullscreen) sì');
});

test('il menù principale: solo l\'aspetto comune e il suo (app-gioco.css, app-menu.css); niente interfaccia in alto', () => {
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/menu.html', punti: 5 });
    assert.deepEqual(s.classi(), ['app', 'app-apk', 'os-android']);
    assert.deepEqual(s.fogli(), ['app-gioco.css', 'app-scena.css', 'app-menu.css']);
    assert.deepEqual(s.script(), ['app-suoni.js'], 'i suoni dei tasti ci sono; il resto lo collega la pagina (app-comune.js, app-menu.js)');
    assert.deepEqual(s.reindirizzato, []);
});

test('niente zoom: nell\'app il viewport lo vieta (pizzico e doppio tocco) e i gesti di pizzico dell\'iPhone si fermano; nel browser il viewport del sito non si tocca', () => {
    for (const v of ['width=device-width', 'initial-scale=1', 'minimum-scale=1', 'maximum-scale=1', 'user-scalable=no']) assert.ok(A.VIEWPORT_APP.includes(v), v);
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/box.html', punti: 5 });
    const meta = s.doc.head.figli.filter(f => f.tagName === 'META');
    assert.equal(meta.length, 1);
    assert.equal(meta[0].attributi.name, 'viewport');
    assert.equal(meta[0].attributi.content, A.VIEWPORT_APP);
    let fermati = 0;
    const ev = (n, dati = {}) => { s.sulla(s.doc, n, { preventDefault: () => { fermati++; }, ...dati }); };
    for (const n of ['gesturestart', 'gesturechange', 'gestureend']) ev(n);
    assert.equal(fermati, 3, 'i gesti di pizzico (iPhone) si fermano');
    ev('touchmove', { touches: [{}, {}] });
    assert.equal(fermati, 4, 'due dita che si muovono: fermo');
    ev('touchmove', { touches: [{}] });
    ev('touchmove', {});
    assert.equal(fermati, 4, 'un dito solo (scorrere, trascinare) non si ferma');
    // il viewport che la pagina ha già si riscrive (non se ne aggiunge un altro)
    const mia = elemento('meta');
    const registro = [];
    const doc = { querySelector: sel => (sel === 'meta[name="viewport"]' ? mia : null), addEventListener: n => registro.push(n) };
    assert.equal(A.bloccaZoom(doc), A.VIEWPORT_APP);
    assert.equal(mia.attributi.content, A.VIEWPORT_APP);
    assert.deepEqual(registro.sort(), ['gesturechange', 'gestureend', 'gesturestart', 'touchmove']);
    // nel browser: niente
    const b = apri({ ua: UA.android, percorso: '/didi-lu/box.html', punti: 5 });
    assert.equal(b.doc.head.figli.length, 0);
    assert.deepEqual(Object.keys(b.doc.ascoltatori), []);
});

test('il menù: la schermata del titolo si vede dal primo disegno e, se in questa visita è già passata, il menù è pronto subito (classe gx-pronto); le altre pagine non c\'entrano', () => {
    assert.equal(A.CHIAVE_SPLASH, 'menuSplashVisto');
    assert.match(docs('app-menu.js'), /CHIAVE_SPLASH = 'menuSplashVisto'/, 'la chiave è quella che scrive il menù');
    assert.ok(!apri({ ua: UA.apk, percorso: '/didi-lu/menu.html', punti: 5 }).classi().includes('gx-pronto'), 'prima volta: c\'è il titolo, il menù aspetta');
    assert.ok(apri({ ua: UA.apk, percorso: '/didi-lu/menu.html', punti: 5, sessione: { menuSplashVisto: '1' } }).classi().includes('gx-pronto'), 'già visto: il menù subito');
    assert.ok(!apri({ ua: UA.apk, percorso: '/didi-lu/box.html', punti: 5, sessione: { menuSplashVisto: '1' } }).classi().includes('gx-pronto'));
    assert.doesNotThrow(() => apri({ ua: UA.apk, percorso: '/didi-lu/menu.html', punti: 5, storageRotto: true }), 'senza memoria si rivede il titolo');
});

test('battaglia, accesso, amministrazione e modello vuoto: classe app, nessuna interfaccia in alto; la battaglia ha il suo foglio e il suo script', () => {
    for (const p of ['login.html', 'admin.html', 'schermata-base-vuota.html']) {
        const s = apri({ ua: UA.apk, percorso: '/didi-lu/' + p });
        assert.deepEqual(s.classi(), ['app', 'app-apk', 'os-android'], p);
        assert.deepEqual(s.fogli(), [], p);
        assert.deepEqual(s.script(), ['app-suoni.js'], p);
    }
    const b = apri({ ua: UA.apk, percorso: '/didi-lu/battle.html' });
    assert.deepEqual(b.classi(), ['app', 'app-apk', 'os-android']);
    assert.deepEqual(b.fogli(), ['app-battaglia.css']);
    assert.deepEqual(b.script(), ['app-suoni.js', 'app-schede.js', 'app-battaglia.js'], 'le schede (Pokémon, mosse) prima dei comandi, che le usano');
});

test('il desktop installato come app (display-mode standalone, senza telefono): classe app e interfaccia da gioco, ma niente menù né avviso "gira il telefono"', () => {
    const s = apri({ ua: UA.pc, standalone: true, percorso: '/didi-lu/index.html' });
    assert.deepEqual(s.classi(), ['app', 'app-installata', 'app-shell']);
    assert.deepEqual(s.reindirizzato, []);
    s.finisciCaricamento();
    assert.equal(s.avviso(), null);
    assert.deepEqual(s.timer, [], 'niente da bloccare né da nascondere');
});

test('dentro un altro frame (il Box incorporato nel simulatore) non fa niente', () => {
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/box.html', inFrame: true });
    assert.equal(s.risultato, null);
    assert.deepEqual(s.classi(), []);
    assert.deepEqual(s.script(), []);
    assert.deepEqual(s.registrazioni, []);
});

test('?app=1 accende l\'aspetto da app anche da PC e lo ricorda; ?app=0 lo spegne; altri valori non toccano niente', () => {
    const memoria = {};
    let s = apri({ ua: UA.pc, percorso: '/didi-lu/stats.html', search: '?app=1', memoria });
    assert.equal(s.risultato.modo, 'installata');
    assert.equal(memoria.appForzata, '1');
    assert.deepEqual(s.script(), ['app-suoni.js', 'app-comune.js', 'app-gioco.js', 'app-carosello.js', 'nome-scorrevole.js', 'altezze-pkm.js', 'scala-pkm.js', 'app-stats.js']);
    s = apri({ ua: UA.pc, percorso: '/didi-lu/box.html', memoria });
    assert.equal(s.risultato.modo, 'installata', 'la volta dopo, senza parametro, resta acceso');
    s = apri({ ua: UA.pc, percorso: '/didi-lu/box.html', search: '?app=0', memoria });
    assert.equal(s.risultato.modo, '');
    assert.equal(memoria.appForzata, '0');
    assert.deepEqual(s.script(), []);
    s = apri({ ua: UA.pc, search: '?app=boh', memoria: {} });
    assert.equal(s.risultato.modo, '');
});

test('con lo storage del browser bloccato (navigazione privata...) il sito funziona uguale', () => {
    const s = apri({ ua: UA.iphone, percorso: '/didi-lu/matches.html', storageRotto: true, search: '?app=1' });
    assert.equal(s.risultato.modo, 'installata');
    assert.deepEqual(s.script(), ['app-suoni.js', 'app-comune.js', 'app-gioco.js', 'app-carosello.js', 'altezze-pkm.js', 'scala-pkm.js', 'app-classifica.js', 'app-matches.js']);
    // senza memoria della visita la home si riconosce come prima apertura: si va al menù (che non rimanda da nessuna parte, quindi nessun ciclo)
    const m = apri({ ua: UA.iphone, percorso: '/didi-lu/index.html', storageRotto: true, search: '?app=1', punti: 5 });
    assert.deepEqual(m.reindirizzato, ['menu.html']);
    const t = apri({ ua: UA.iphone, percorso: '/didi-lu/index.html', storageRotto: true });
    assert.ok(t.invito());
    assert.doesNotThrow(() => t.invito().querySelector('.app-invito-no').click());
    assert.equal(t.invito(), null);
});

// ---------- l'avviso "gira il telefono" e la tastiera ----------

test('avviso "gira il telefono": una volta sola, a pagina pronta, dal telefono (dove l\'orientamento non si riesce a bloccare)', () => {
    const s = apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/stats.html', caricamento: true, punti: 5 });
    assert.equal(s.avviso(), null);
    s.finisciCaricamento();
    const a = s.avviso();
    assert.ok(a);
    assert.equal(a.className, 'app-ruota');
    assert.equal(a.attributi.role, 'alert');
    assert.match(a.innerHTML, /Turn your phone sideways/);
    assert.equal(A.creaAvvisoRuota(s.doc), null, 'non si crea due volte');
    assert.equal(s.doc.body.figli.filter(f => f.id === 'app-ruota').length, 1);
    assert.equal(A.creaAvvisoRuota({ body: null, getElementById: () => null }), null, 'senza body non si può');
});

test('con la tastiera aperta la classe app-tastiera sta su <html>: campi di testo sì, caselle e pulsanti no', () => {
    const s = apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/players.html' });
    const campo = (tag, type) => { const c = elemento(tag); c.type = type; return c; };
    const entra = el => s.sulla(s.doc, 'focusin', { target: el });
    const attiva = () => s.html.classi.has('app-tastiera');
    entra(campo('input', 'text'));
    assert.ok(attiva());
    s.sulla(s.doc, 'focusout', {});
    assert.ok(!attiva());
    for (const [tag, type] of [['textarea', undefined], ['select', undefined], ['input', 'search'], ['input', 'number']]) {
        entra(campo(tag, type));
        assert.ok(attiva(), `${tag}/${type} apre la tastiera`);
        s.sulla(s.doc, 'focusout', {});
    }
    for (const [tag, type] of [['input', 'checkbox'], ['input', 'radio'], ['input', 'range'], ['input', 'button'], ['input', 'file'], ['button', undefined], ['div', undefined]]) {
        entra(campo(tag, type));
        assert.ok(!attiva(), `${tag}/${type} non apre la tastiera`);
    }
});

// ---------- l'invito a installare ----------

test('invito su iPhone: nel browser, sulla home, con le istruzioni di Condividi > Aggiungi a Home; chiuderlo lo ricorda', () => {
    const s = apri({ ua: UA.iphone, percorso: '/didi-lu/', punti: 5 });
    assert.deepEqual(s.risultato, { modo: '' });
    assert.deepEqual(s.classi(), ['os-ios']);
    const inv = s.invito();
    assert.ok(inv);
    assert.equal(inv.className, 'app-invito');
    assert.equal(inv.attributi.role, 'dialog');
    assert.match(inv.innerHTML, /Add to Home Screen/);
    assert.doesNotMatch(inv.innerHTML, /app-invito-si/, 'su iPhone non esiste un tasto che installa');
    assert.match(inv.innerHTML, /src="immagini\/app\/icon-192\.png"/);
    inv.querySelector('.app-invito-no').click();
    assert.equal(s.invito(), null);
    assert.ok(Math.abs(Number(s.memoria.invitoApp) - Date.now()) < 5000);
    assert.equal(apri({ ua: UA.iphone, percorso: '/didi-lu/', memoria: s.memoria }).invito(), null, 'alla visita dopo non c\'è');
});

test('l\'invito non compare su altre pagine, da PC, nei browser incorporati, se è già installata, né se chiuso da poco', () => {
    const adesso = Date.now();
    const vedi = opz => apri({ percorso: '/didi-lu/index.html', ...opz }).invito() !== null;
    assert.equal(vedi({ ua: UA.iphone }), true);
    assert.equal(vedi({ ua: UA.iphone, percorso: '/didi-lu/matches.html' }), false);
    assert.equal(vedi({ ua: UA.pc }), false);
    assert.equal(vedi({ ua: UA.instagram }), false);
    assert.equal(vedi({ ua: UA.iphone, iosStandalone: true }), false);
    assert.equal(vedi({ ua: UA.iphone, memoria: { invitoApp: String(adesso - 3 * 86400000) } }), false);
    assert.equal(vedi({ ua: UA.iphone, memoria: { invitoApp: String(adesso - 20 * 86400000) } }), true, 'dopo due settimane torna');
});

test('invito su Android: compare quando Chrome dice che si può installare, "Install" apre la richiesta di Chrome', async () => {
    const s = apri({ ua: UA.android, percorso: '/didi-lu/index.html', punti: 5 });
    assert.equal(s.invito(), null, 'prima che Chrome lo permetta non c\'è nulla');
    let prevenuti = 0, richieste = 0, scelta;
    const finita = new Promise(r => { scelta = r; });
    const evento = { preventDefault() { prevenuti++; }, prompt() { richieste++; }, userChoice: finita.then(() => ({ outcome: 'accepted' })) };
    s.sulla(s.win, 'beforeinstallprompt', evento);
    s.sulla(s.win, 'beforeinstallprompt', evento);
    assert.equal(prevenuti, 2, 'si ferma il banner automatico di Chrome');
    assert.equal(s.doc.body.figli.filter(f => f.id === 'app-invito').length, 1, 'un solo invito');
    const inv = s.invito();
    assert.match(inv.innerHTML, /app-invito-si/);
    assert.doesNotMatch(inv.innerHTML, /Add to Home Screen/);
    inv.querySelector('.app-invito-si').click();
    assert.equal(richieste, 1);
    scelta();
    await finita;
    await new Promise(r => setImmediate(r));
    assert.equal(s.invito(), null, 'dopo la scelta l\'invito sparisce');
});

test('invito su Android: chiuderlo lo ricorda; a installazione fatta sparisce; sulle altre pagine non c\'è', () => {
    const evento = () => ({ preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    const s = apri({ ua: UA.android, percorso: '/didi-lu/' });
    s.sulla(s.win, 'beforeinstallprompt', evento());
    s.invito().querySelector('.app-invito-no').click();
    assert.equal(s.invito(), null);
    assert.ok(s.memoria.invitoApp);
    assert.equal((apri({ ua: UA.android, percorso: '/didi-lu/', memoria: s.memoria }).win.ascoltatori.beforeinstallprompt || []).length, 0, 'chiuso da poco: non ascolta nemmeno');

    const t = apri({ ua: UA.android, percorso: '/didi-lu/' });
    t.sulla(t.win, 'beforeinstallprompt', evento());
    assert.ok(t.invito());
    t.sulla(t.win, 'appinstalled');
    assert.equal(t.invito(), null);

    assert.equal((apri({ ua: UA.android, percorso: '/didi-lu/box.html' }).win.ascoltatori.beforeinstallprompt || []).length, 0);
});

// ---------- il cablaggio nelle pagine ----------

test('ogni pagina collega manifest, icona e aspetto da app; app.js è uno script normale (le classi arrivano prima del primo disegno)', () => {
    assert.ok(PAGINE.length >= 15, 'pagine trovate: ' + PAGINE.join(', '));
    assert.ok(PAGINE.includes('menu.html'));
    for (const p of PAGINE) {
        const h = docs(p);
        const conta = re => (h.match(re) || []).length;
        assert.equal(conta(/<link rel="manifest" href="manifest\.webmanifest">/g), 1, `${p}: manifest`);
        assert.equal(conta(/<link rel="apple-touch-icon" href="immagini\/app\/apple-touch-icon\.png">/g), 1, `${p}: icona per iPhone`);
        assert.equal(conta(/<meta name="apple-mobile-web-app-capable" content="yes">/g), 1, `${p}: iPhone a schermo intero`);
        assert.equal(conta(/<meta name="mobile-web-app-capable" content="yes">/g), 1, `${p}: Android a schermo intero`);
        assert.equal(conta(/<meta name="apple-mobile-web-app-status-bar-style" content="black">/g), 1, `${p}: barra di stato`);
        assert.equal(conta(/<meta name="theme-color" content="#000000">/g), 1, `${p}: colore della barra`);
        assert.equal(conta(/<script src="app\.js"><\/script>/g), 1, `${p}: app.js senza defer né async`);
        // app.css è l'ultimo foglio del sito: sopra a tutti, mobile.css compreso
        const fogli = [...h.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]).filter(x => !/^https?:/.test(x));
        assert.equal(fogli[fogli.length - 1], 'app.css', `${p}: app.css deve essere l'ultimo foglio (fogli: ${fogli.join(', ')})`);
        assert.equal(fogli.filter(f => f === 'app.css').length, 1, `${p}: app.css collegato più volte`);
        // il sito non si estende sotto la barra di stato (iOS lascerebbe il nero, nell'APK ci pensa Capacitor)
        assert.doesNotMatch(h, /viewport-fit\s*=\s*cover/, `${p}: viewport-fit=cover`);
    }
});

test('i fogli e gli script dell\'app esistono e li scarica solo l\'app (da app.js): nessuna pagina li collega, tranne il menù che porta i suoi script', () => {
    const js = docs('app.js');
    for (const f of ['app-gioco.css', 'app-gioco-pagine.css', 'app-menu.css', 'app-battaglia.css', 'app-suoni.js', 'app-comune.js', 'app-gioco.js', 'app-menu.js', 'app-battaglia.js', 'app-schede.js']) {
        assert.ok(esiste(f), `manca ${f}`);
        assert.ok(js.includes(`'${f}'`) || f === 'app-menu.js', `app.js non cita ${f}`);
    }
    assert.ok(!esiste('app-pagine.css') && !esiste('app-shell.js'), 'i vecchi file della barra in basso sono stati tolti');
    for (const f of PAGINE) {
        const h = docs(f).replace(/<!--[\s\S]*?-->/g, '');
        assert.doesNotMatch(h, /app-(gioco|gioco-pagine|menu|battaglia)\.css|app-(gioco|battaglia|schede)\.js|app-suoni\.js/, `${f} non deve collegare i fogli dell'app`);
        if (f !== 'menu.html') assert.doesNotMatch(h, /app-comune\.js|app-menu\.js/, `${f}: solo il menù collega queste`);
    }
    // il menù: le parti comuni prima della sua logica
    const m = docs('menu.html');
    assert.ok(m.indexOf('app-comune.js') > 0 && m.indexOf('app-comune.js') < m.indexOf('app-menu.js'));
});

test('manifest: app a schermo intero in orizzontale, indirizzi relativi (il sito sta in una sottocartella), icone vere delle misure dichiarate, il menù tra le scorciatoie', () => {
    const m = JSON.parse(docs('manifest.webmanifest'));
    assert.equal(m.display, 'standalone');
    assert.deepEqual(m.display_override, ['fullscreen', 'standalone'], 'dove si può, a schermo intero (senza barra di stato)');
    assert.equal(m.orientation, 'landscape');
    for (const k of ['id', 'start_url', 'scope']) assert.equal(m[k], './', k);
    assert.equal(m.background_color, '#000000');
    assert.equal(m.theme_color, '#000000');
    assert.ok(m.name && m.short_name && m.short_name.length <= 12, 'sotto l\'icona il nome deve essere breve');
    const dimensioni = f => {
        const b = fs.readFileSync(path.join(DOCS, f));
        assert.equal(b.toString('latin1', 1, 4), 'PNG', f);
        return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
    };
    for (const i of m.icons) {
        assert.doesNotMatch(i.src, /^(\/|https?:)/, i.src);
        assert.equal(dimensioni(i.src), i.sizes, i.src);
        assert.equal(i.type, 'image/png');
    }
    assert.deepEqual(m.icons.map(i => `${i.sizes} ${i.purpose}`).sort(), ['192x192 any', '512x512 any', '512x512 maskable']);
    assert.equal(dimensioni('immagini/app/apple-touch-icon.png'), '180x180');
    for (const s of m.shortcuts) {
        assert.doesNotMatch(s.url, /^(\/|https?:)/, s.url);
        assert.ok(esiste(s.url), `scorciatoia verso ${s.url}`);
    }
    assert.ok(m.shortcuts.length >= 1 && m.shortcuts.length <= 4, 'Android mostra al massimo quattro scorciatoie');
    assert.equal(m.shortcuts[0].url, 'menu.html', 'la prima scorciatoia è il menù principale');
});

// ---------- l'orientamento: tutta l'app si gioca in orizzontale ----------

const passaUnGiro = () => new Promise(ok => setImmediate(ok));

function finestraOrientamento({ nativo, plugin, web, funzioneRegistra } = {}) {
    const ascoltatori = {};
    const win = {
        ascoltatori,
        addEventListener: (tipo, fn) => { (ascoltatori[tipo] ||= []).push(fn); }
    };
    if (nativo) {
        win.Capacitor = { isNativePlatform: () => true, Plugins: plugin ? { ScreenOrientation: plugin } : {} };
        if (funzioneRegistra) win.Capacitor.registerPlugin = funzioneRegistra;
    }
    if (web) win.screen = { orientation: web };
    return win;
}

const pluginFinto = (chiamate, { rifiuta = false } = {}) => ({
    lock: async o => { chiamate.push(['nativo lock', o.orientation]); if (rifiuta) throw new Error('not implemented'); }
});
const webFinto = (chiamate, { rifiuta = false } = {}) => ({
    lock: async o => { chiamate.push(['web lock', o]); if (rifiuta) throw new Error('SecurityError'); }
});

test('bloccaOrizzontale: nell\'APK col plugin ScreenOrientation, nelle app installate con l\'API del browser, altrimenti non fa niente', async () => {
    const c = [];
    assert.equal(await A.bloccaOrizzontale(finestraOrientamento({ nativo: true, plugin: pluginFinto(c) })), 'nativo');
    assert.deepEqual(c, [['nativo lock', 'landscape']]);

    // APK vecchio, senza il plugin: la chiamata fallisce e si prova con il browser
    const d = [];
    assert.equal(await A.bloccaOrizzontale(finestraOrientamento({ nativo: true, plugin: pluginFinto(d, { rifiuta: true }), web: webFinto(d) })), 'web');
    assert.deepEqual(d, [['nativo lock', 'landscape'], ['web lock', 'landscape']]);

    // app installata da Chrome: solo l'API del browser
    const e = [];
    assert.equal(await A.bloccaOrizzontale(finestraOrientamento({ web: webFinto(e) })), 'web');
    assert.deepEqual(e, [['web lock', 'landscape']]);

    // il browser non lo permette (o iPhone, dove non esiste): resta com'è
    assert.equal(await A.bloccaOrizzontale(finestraOrientamento({ web: webFinto([], { rifiuta: true }) })), '');
    assert.equal(await A.bloccaOrizzontale(finestraOrientamento({})), '');
    assert.equal(await A.bloccaOrizzontale(null), '');
});

test('pluginNativo: solo dentro l\'app nativa; il pacchetto non c\'è (il sito arriva dalla rete), si usa il Capacitor che l\'app inietta', () => {
    assert.equal(A.pluginNativo({}, 'ScreenOrientation'), null);
    assert.equal(A.pluginNativo({ Capacitor: { isNativePlatform: () => false, Plugins: { ScreenOrientation: {} } } }, 'ScreenOrientation'), null, 'nel browser il Capacitor non è nativo');
    const gia = {};
    assert.equal(A.pluginNativo({ Capacitor: { isNativePlatform: () => true, Plugins: { ScreenOrientation: gia } } }, 'ScreenOrientation'), gia);
    const registrato = {};
    const chiesti = [];
    assert.equal(A.pluginNativo({ Capacitor: { isNativePlatform: () => true, Plugins: {}, registerPlugin: n => { chiesti.push(n); return registrato; } } }, 'ScreenOrientation'), registrato);
    assert.deepEqual(chiesti, ['ScreenOrientation']);
    assert.equal(A.pluginNativo({ Capacitor: { isNativePlatform: () => true, Plugins: {}, registerPlugin: () => { throw new Error('no'); } } }, 'ScreenOrientation'), null);
});

test('orientamentoDellaPagina: blocca subito e non insiste se ci riesce; tornando dalla cache del browser (pageshow persisted) blocca di nuovo', async () => {
    const c = [];
    const win = finestraOrientamento({ nativo: true, plugin: pluginFinto(c) });
    const timer = [];
    win.setTimeout = (f, ms) => { timer.push(ms); };
    A.orientamentoDellaPagina(win);
    await passaUnGiro();
    assert.deepEqual(c, [['nativo lock', 'landscape']]);
    assert.deepEqual(timer, [], 'riuscito: nessun nuovo tentativo');
    win.ascoltatori.pageshow.forEach(f => f({ persisted: false }));
    await passaUnGiro();
    assert.equal(c.length, 1, 'una pagina normale non ripete');
    win.ascoltatori.pageshow.forEach(f => f({ persisted: true }));
    await passaUnGiro();
    assert.equal(c.length, 2, 'tornando dalla cache sì');
    assert.doesNotThrow(() => win.ascoltatori.pageshow.forEach(f => f()), 'un pageshow senza dati non rompe niente');
});

test('orientamentoDellaPagina: se all\'apertura non ci riesce (l\'app non è ancora pronta) riprova ogni mezzo secondo, al massimo quattro volte', async () => {
    const c = [];
    let aperta = false;
    const plugin = { lock: async o => { c.push(o.orientation); if (!aperta) throw new Error('non ancora'); } };
    const win = finestraOrientamento({ nativo: true, plugin });
    const timer = [];
    win.setTimeout = (f, ms) => { timer.push({ f, ms }); };
    A.orientamentoDellaPagina(win);
    await passaUnGiro();
    assert.equal(c.length, 1);
    assert.deepEqual(timer.map(t => t.ms), [500]);
    // il secondo tentativo riesce: finito
    aperta = true;
    timer.shift().f();
    await passaUnGiro();
    assert.equal(c.length, 2);
    assert.deepEqual(timer, []);

    // se non riesce mai (iPhone) i tentativi sono quattro e poi basta
    const iphone = finestraOrientamento({});
    let tentativi = 0;
    iphone.setTimeout = (f, ms) => { tentativi++; assert.equal(ms, 500); f(); };
    A.orientamentoDellaPagina(iphone);
    await passaUnGiro();
    assert.equal(tentativi, 4);
});

function finestraBarre({ nativo = true, plugin } = {}) {
    const ascoltatori = {};
    const timer = [];
    const win = {
        ascoltatori, timer,
        addEventListener: (tipo, fn) => { (ascoltatori[tipo] ||= []).push(fn); },
        setTimeout: (f, ms) => { timer.push({ f, ms, attivo: true }); return timer.length; },
        clearTimeout: n => { if (timer[n - 1]) timer[n - 1].attivo = false; }
    };
    if (nativo) win.Capacitor = { isNativePlatform: () => true, Plugins: plugin ? { SystemBars: plugin } : {} };
    return win;
}

test('barreNascoste: nell\'APK nasconde barra di stato e dei gesti; se tornano (cambia la misura dello schermo) le rinasconde dopo un attimo; altrove non fa niente', () => {
    assert.equal(A.barreNascoste(finestraBarre({ nativo: false })), null, 'nel browser');
    assert.equal(A.barreNascoste(finestraBarre({})), null, 'APK vecchio, senza il plugin');
    let nascoste = 0;
    const win = finestraBarre({ plugin: { hide: () => { nascoste++; return Promise.resolve(); } } });
    assert.ok(A.barreNascoste(win));
    assert.equal(nascoste, 1, 'subito');
    // la barra è tornata (un gesto dal bordo): dopo un attimo si rinasconde, e più cambi di misura di fila contano come uno
    win.ascoltatori.resize.forEach(f => f());
    win.ascoltatori.resize.forEach(f => f());
    assert.deepEqual(win.timer.map(t => [t.ms, t.attivo]), [[1800, false], [1800, true]]);
    assert.equal(nascoste, 1, 'non prima del tempo');
    win.timer[1].f();
    assert.equal(nascoste, 2);
    win.ascoltatori.resize.forEach(f => f());
    assert.equal(win.timer.length, 3, 'si può ripetere');
    // tornando alla pagina dalla cache del browser: subito
    win.ascoltatori.pageshow.forEach(f => f());
    assert.equal(nascoste, 3);
});

test('barreNascoste: se il plugin si lamenta (APK vecchio) non succede niente', async () => {
    assert.doesNotThrow(() => A.barreNascoste(finestraBarre({ plugin: { hide() { throw new Error('no'); } } })));
    const win = finestraBarre({ plugin: { hide: () => Promise.reject(new Error('not implemented')) } });
    assert.doesNotThrow(() => A.barreNascoste(win));
    await passaUnGiro();          // se l'errore non fosse gestito, il test runner lo segnalerebbe qui
    assert.equal(A.barreNascoste(finestraBarre({ plugin: {} })), null, 'plugin senza hide');
});

test('orientamento e barre nel cablaggio: solo come app e solo dal telefono (non su PC con ?app=1)', async () => {
    const pc = apri({ ua: UA.pc, search: '?app=1', percorso: '/didi-lu/box.html', nativo: true });
    await passaUnGiro();
    assert.deepEqual(pc.blocchi, []);
    assert.equal(pc.barre, 0);
    const browser = apri({ ua: UA.android, percorso: '/didi-lu/box.html', nativo: true });
    await passaUnGiro();
    assert.deepEqual(browser.blocchi, [], 'nel browser del telefono l\'orientamento è libero');
    const iphone = apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/box.html', punti: 5 });
    await passaUnGiro();
    assert.equal(iphone.timer.length, 1, 'senza plugin né API: un nuovo tentativo a distanza (poi l\'avviso "gira il telefono")');
    assert.ok(iphone.win.ascoltatori.pageshow, 'e si ricontrolla quando la pagina torna dalla cache');
});

// ---------- il service worker e la pagina offline ----------

function serviceWorker({ rete = true, cache = [], preload = true } = {}) {
    const ascoltatori = {};
    const casse = new Map(cache.map(n => [n, new Map()]));
    const log = { skipWaiting: 0, claim: 0, preload: 0 };
    class Request { constructor(url, opzioni) { this.url = url; this.opzioni = opzioni; } }
    const sandbox = {
        self: {
            addEventListener: (ev, f) => { ascoltatori[ev] = f; },
            skipWaiting: () => { log.skipWaiting++; return Promise.resolve(); },
            clients: { claim: () => { log.claim++; return Promise.resolve(); } },
            registration: preload ? { navigationPreload: { enable: () => { log.preload++; return Promise.resolve(); } } } : {}
        },
        caches: {
            open: async nome => { if (!casse.has(nome)) casse.set(nome, new Map()); const c = casse.get(nome); return { add: async r => { c.set(r.url, 'PAGINA-OFFLINE'); } }; },
            keys: async () => [...casse.keys()],
            delete: async nome => casse.delete(nome),
            match: async url => { for (const c of casse.values()) if (c.has(url)) return c.get(url); return undefined; }
        },
        Request,
        Response: { error: () => 'ERRORE-DI-RETE' },
        fetch: async r => { if (!sandbox.rete) throw new TypeError('Failed to fetch'); return 'DALLA-RETE ' + r.url; },
        rete
    };
    vm.runInNewContext(docs('sw.js'), sandbox);
    const evento = (tipo, extra = {}) => { let promessa; ascoltatori[tipo]({ waitUntil: p => { promessa = p; }, respondWith: p => { promessa = p; }, ...extra }); return promessa; };
    return { sandbox, casse, log, ascoltatori, evento };
}

test('service worker: all\'installazione tiene solo la pagina offline, e le cache vecchie del sito vanno via (non quelle di altri siti)', async () => {
    const sw = serviceWorker({ cache: ['sant-alvise-offline-v0', 'altro-sito-v7'] });
    await sw.evento('install');
    assert.equal(sw.log.skipWaiting, 1);
    assert.deepEqual([...sw.casse.get('sant-alvise-offline-v1').keys()], ['offline.html']);
    await sw.evento('activate');
    assert.deepEqual([...sw.casse.keys()].sort(), ['altro-sito-v7', 'sant-alvise-offline-v1']);
    assert.equal(sw.log.claim, 1);
    assert.equal(sw.log.preload, 1, 'la pagina si chiede alla rete mentre il service worker si sveglia');
    // un browser senza "navigation preload" attiva il service worker lo stesso
    const senza = serviceWorker({ preload: false });
    await senza.evento('activate');
    assert.equal(senza.log.claim, 1);
});

test('service worker: le pagine passano dalla rete; senza rete compare offline.html; tutto il resto non lo tocca', async () => {
    const sw = serviceWorker();
    await sw.evento('install');
    const pagina = { mode: 'navigate', url: 'https://x.test/didi-lu/matches.html' };
    assert.equal(await sw.evento('fetch', { request: pagina }), 'DALLA-RETE https://x.test/didi-lu/matches.html');
    sw.sandbox.rete = false;
    assert.equal(await sw.evento('fetch', { request: pagina }), 'PAGINA-OFFLINE');
    // script, immagini, Firebase...: il service worker non risponde, ci pensa il browser
    let risposto = false;
    sw.ascoltatori.fetch({ request: { mode: 'no-cors', url: 'https://x.test/didi-lu/app.js' }, respondWith: () => { risposto = true; } });
    sw.ascoltatori.fetch({ request: { mode: 'cors', url: 'https://firebaseio.com/x.json' }, respondWith: () => { risposto = true; } });
    assert.equal(risposto, false);
    // senza nemmeno la pagina offline in cache: l'errore normale del browser
    const vuoto = serviceWorker({ rete: false });
    assert.equal(await vuoto.evento('fetch', { request: pagina }), 'ERRORE-DI-RETE');
});

test('service worker: usa la pagina già chiesta in anticipo dal browser (navigation preload) invece di chiederla due volte; se quella fallisce, offline.html', async () => {
    const sw = serviceWorker();
    await sw.evento('install');
    let richieste = 0;
    sw.sandbox.fetch = async () => { richieste++; return 'DALLA-RETE'; };
    const pagina = { mode: 'navigate', url: 'https://x.test/didi-lu/box.html' };
    assert.equal(await sw.evento('fetch', { request: pagina, preloadResponse: Promise.resolve('GIA-ARRIVATA') }), 'GIA-ARRIVATA');
    assert.equal(richieste, 0, 'la pagina non si chiede una seconda volta');
    assert.equal(await sw.evento('fetch', { request: pagina, preloadResponse: Promise.resolve(undefined) }), 'DALLA-RETE', 'preload non attivo: si chiede ora');
    assert.equal(richieste, 1);
    assert.equal(await sw.evento('fetch', { request: pagina, preloadResponse: Promise.reject(new TypeError('Failed to fetch')) }), 'PAGINA-OFFLINE', 'senza rete');
});

test('service worker: non mette in cache pagine, script o stili (gli aggiornamenti del sito arrivano subito), solo la pagina offline e le immagini', () => {
    const sw = docs('sw.js');
    assert.doesNotMatch(sw, /addAll\(/);
    assert.equal((sw.match(/cache\.add\(/g) || []).length, 1, 'una sola aggiunta diretta in cache: la pagina offline');
    assert.match(sw, /cache: 'reload'/, 'la pagina offline si prende sempre fresca dalla rete');
    assert.match(sw, /if \(richiesta\.mode !== 'navigate'\) \{/, 'quello che non è una pagina passa dal controllo delle immagini');
    assert.match(sw, /richiesta\.destination !== 'image'/, 'e di tutto il resto non si occupa');
});

/** Un service worker con una cache vera (in memoria) e una rete finta, per le immagini */
function swImmagini({ cors = true, rete = true } = {}) {
    const casse = new Map();
    const richieste = [];
    const ascoltatori = {};
    const cassa = nome => { if (!casse.has(nome)) casse.set(nome, new Map()); return casse.get(nome); };
    const sandbox = {
        self: { addEventListener: (ev, f) => { ascoltatori[ev] = f; }, location: { origin: 'https://sito.test' }, skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } },
        caches: {
            open: async nome => { const c = cassa(nome); return { match: async u => c.get(u), put: async (u, r) => { c.set(u, r); }, keys: async () => [...c.keys()], delete: async u => c.delete(u), add: async () => {} }; },
            keys: async () => [...casse.keys()], delete: async n => casse.delete(n), match: async () => undefined
        },
        URL, Request: class { constructor(u) { this.url = u; } }, Response: { error: () => 'ERRORE' },
        fetch: async (r, opz) => {
            const url = typeof r === 'string' ? r : r.url;
            richieste.push({ url, opz });
            if (!sandbox.rete) throw new TypeError('Failed to fetch');
            if (opz && opz.mode === 'cors' && !sandbox.cors) throw new TypeError('CORS');
            const risposta = { ok: true, status: 200, type: opz && opz.mode === 'cors' ? 'cors' : 'opaque', url, clone() { return this; } };
            if (typeof r !== 'string' && !sandbox.cors) risposta.type = 'opaque';
            return risposta;
        },
        cors, rete
    };
    vm.runInNewContext(docs('sw.js'), sandbox);
    const chiedi = async (url, extra = {}) => {
        let promessa, attesa = [];
        ascoltatori.fetch({ request: { mode: 'no-cors', destination: 'image', method: 'GET', url, ...extra }, respondWith: p => { promessa = p; }, waitUntil: p => attesa.push(p) });
        const r = promessa === undefined ? 'NON-GESTITA' : await promessa;
        await Promise.all(attesa);
        return r;
    };
    return { sandbox, casse, richieste, chiedi };
}

test('service worker, immagini: lo sprite di un Pokémon si scarica una volta sola (con il CORS) e poi viene dalla cache, anche senza rete', async () => {
    const sw = swImmagini();
    const url = 'https://play.pokemonshowdown.com/sprites/ani/garchomp.gif';
    const prima = await sw.chiedi(url);
    assert.equal(prima.type, 'cors');
    assert.deepEqual(sw.richieste.map(r => r.opz && r.opz.mode), ['cors'], 'si chiede con il CORS, così si può tenere');
    assert.ok(sw.casse.get('sant-alvise-immagini-v1').has(url), 'salvata');
    sw.sandbox.rete = false;
    const dopo = await sw.chiedi(url);
    assert.equal(dopo.url, url);
    assert.equal(sw.richieste.length, 1, 'la seconda volta niente rete: sono GIF che non cambiano mai');
    // i render di PokeAPI e quelli di Pokémon DB sono sprite uguali
    sw.sandbox.rete = true;
    for (const u of ['https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/25.png', 'https://img.pokemondb.net/sprites/home/normal/pikachu.png']) {
        await sw.chiedi(u);
        assert.ok(sw.casse.get('sant-alvise-immagini-v1').has(u), u);
    }
});

test('service worker, immagini: cosa NON gestisce (altri host, altri percorsi, richieste non immagini, POST) va in rete come prima', async () => {
    const sw = swImmagini();
    for (const [url, extra] of [
        ['https://raw.githubusercontent.com/didi722/didi-lu/main/docs/app.js', { destination: 'script' }],
        ['https://raw.githubusercontent.com/altro/repo/main/a.png', {}],
        ['https://play.pokemonshowdown.com/data/pokedex.js', { destination: 'script' }],
        ['https://pokeapi.co/api/v2/pokemon/pikachu', { destination: '' }],
        ['https://altro.test/foto.png', {}],
        ['https://play.pokemonshowdown.com/sprites/ani/mew.gif', { method: 'POST' }],
        ['https://sito.test/didi-lu/app.js', { destination: 'script' }]
    ]) assert.equal(await sw.chiedi(url, extra), 'NON-GESTITA', url);
    assert.equal(sw.richieste.length, 0);
});

test('service worker, immagini: quelle del sito (immagini/) escono subito dalla cache e intanto si rinfrescano; se manca la rete restano quelle', async () => {
    const sw = swImmagini();
    const url = 'https://sito.test/didi-lu/immagini/app/scena-play.webp';
    await sw.chiedi(url);                                      // prima volta: dalla rete e salvata
    assert.ok(sw.casse.get('sant-alvise-immagini-v1').has(url));
    assert.equal(sw.richieste.length, 1);
    const r = await sw.chiedi(url);                            // seconda: subito quella salvata, e si rinfresca
    assert.equal(r.url, url);
    assert.equal(sw.richieste.length, 2);
    assert.equal(sw.richieste[1].opz.cache, 'no-cache', 'il rinfresco chiede alla rete se è cambiata');
    sw.sandbox.rete = false;
    assert.equal((await sw.chiedi(url)).url, url, 'senza rete resta quella salvata');
});

test('service worker, immagini: se l\'host non permette il CORS si ripiega sulla richiesta normale (risposta opaca, in una cache a parte, poche) e non si riprova', async () => {
    const sw = swImmagini({ cors: false });
    const url = 'https://play.pokemonshowdown.com/sprites/ani/rayquaza.gif';
    const r = await sw.chiedi(url);
    assert.equal(r.type, 'opaque');
    assert.ok(sw.casse.get('sant-alvise-immagini-opache-v1').has(url));
    assert.equal(sw.casse.get('sant-alvise-immagini-v1').size, 0, 'niente nella cache normale');
    assert.equal(sw.richieste.map(x => x.opz && x.opz.mode).join(','), 'cors,', 'prima il CORS, poi la richiesta normale');
    const dopo = await sw.chiedi(url);
    assert.equal(dopo.url, url);
    assert.equal(sw.richieste.length, 2, 'la seconda volta dalla cache: nessuna richiesta in più');
});

test('service worker, immagini: la cache tiene al massimo 400 immagini (via le più vecchie) e il non-successo (404) non si salva', async () => {
    const sw = swImmagini();
    for (let i = 0; i < 403; i++) await sw.chiedi(`https://play.pokemonshowdown.com/sprites/ani/p${i}.gif`);
    const cassa = sw.casse.get('sant-alvise-immagini-v1');
    assert.equal(cassa.size, 400);
    assert.ok(!cassa.has('https://play.pokemonshowdown.com/sprites/ani/p0.gif') && cassa.has('https://play.pokemonshowdown.com/sprites/ani/p402.gif'));
    sw.sandbox.fetch = async (r, opz) => ({ ok: false, status: 404, type: 'cors', url: typeof r === 'string' ? r : r.url, clone() { return this; } });
    const mancante = 'https://play.pokemonshowdown.com/sprites/ani/non-esiste.gif';
    assert.equal((await sw.chiedi(mancante)).status, 404, 'la risposta arriva com\'è: la pagina passa alla sua immagine di riserva');
    assert.ok(!cassa.has(mancante));
});

test('offline.html: autonoma (nessun file esterno, nemmeno l\'immagine), con il pulsante per riprovare', () => {
    const h = docs('offline.html');
    assert.doesNotMatch(h, /<link[^>]+stylesheet/);
    assert.doesNotMatch(h, /<script[^>]+src=/);
    assert.doesNotMatch(h, /(src|href)="(?!data:)[^"]*(https?:|\.png|\.jpe?g|\.gif|\.svg)/, 'tutto quello che serve è dentro la pagina');
    assert.match(h, /<meta name="viewport"/);
    assert.match(h, /<button type="button" id="riprova">Try again<\/button>/);
    assert.match(h, /<img class="pesce" src="data:image\/png;base64,[A-Za-z0-9+\/=]+" alt="" width="112" height="112">/);
    // nell'APK la pagina sta nell'app (https://localhost): "riprova" porta al sito vero; altrove ricarica la stessa pagina
    assert.match(h, /location\.hostname === 'localhost' && location\.protocol === 'https:' && !location\.port/);
});

// ---------- app.css: fuori dall'app non cambia nulla ----------

/** Le virgole fuori dalle parentesi separano i selettori ( :is(a, b) è uno solo ) */
function dividi(s) {
    const out = [];
    let livello = 0, da = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') livello++;
        else if (s[i] === ')') livello--;
        else if (s[i] === ',' && livello === 0) { out.push(s.slice(da, i).trim()); da = i + 1; }
    }
    out.push(s.slice(da).trim());
    return out.filter(Boolean);
}
/** Tutti i selettori delle regole (anche dentro @media); @keyframes e i loro passi esclusi */
function selettori(css) {
    const t = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    for (const m of t.matchAll(/([^{}]+)\{/g)) {
        const pre = m[1].trim();
        if (pre.startsWith('@')) continue;
        if (/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(pre)) continue;
        out.push(...dividi(pre));
    }
    return out;
}
function regola(css, selettore) {
    const esc = selettore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = css.replace(/\/\*[\s\S]*?\*\//g, '').match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm'));
    assert.ok(m, `manca la regola ${selettore}`);
    return m[1];
}

test('app.css: ogni regola riguarda l\'app (html.app…) o i suoi elementi; l\'unica regola per tutti è il doppio tocco senza zoom', () => {
    const css = docs('app.css');
    const lista = selettori(css);
    assert.ok(lista.length >= 20, 'selettori trovati: ' + lista.length);
    for (const s of lista) assert.match(s, /^(html\.app(\s|$|:|\[)|\.app-[a-z])|^html$/, `regola che tocca il sito intero: "${s}"`);
    assert.equal(regola(css, 'html').trim(), 'touch-action: manipulation;');
    // niente rimbalzo né "ricarica tirando giù" dentro l'app: è un gioco
    assert.match(regola(css, 'html.app'), /overscroll-behavior:\s*none/);
    // niente zoom col pizzico: la pagina si sposta solo in verticale e in orizzontale (il testo non si ingrandisce da solo)
    assert.match(regola(css, 'html.app'), /touch-action:\s*pan-x pan-y/);
    assert.match(regola(css, 'html.app'), /text-size-adjust:\s*100%/);
});

test('app.css: l\'avviso "gira il telefono" non si vede mai, tranne con il telefono in verticale dentro l\'app; il resto della pagina sparisce sotto', () => {
    const css = docs('app.css');
    assert.match(css, /\.app-ruota\s*\{\s*display:\s*none;\s*\}/);
    const media = css.match(/@media \(orientation: portrait\) and \(max-width: 700px\) \{([\s\S]*?)\n\}\n/);
    assert.ok(media, 'manca la condizione "telefono in verticale"');
    assert.match(media[1], /html\.app \.app-ruota \{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*display:\s*flex/);
    assert.match(media[1], /html\.app body > \*:not\(\.app-ruota\) \{ visibility: hidden; \}/);
    assert.match(css, /@keyframes app-ruota-gira/);
    // la stessa soglia di larghezza dello schermo da telefono (app.js: CONDIZIONE_TELEFONO)
    assert.equal(A.CONDIZIONE_TELEFONO, '(max-width: 700px), (max-height: 520px)');
});

test('app.css: l\'invito a installare (solo browser da telefono) non è tra le regole dell\'app; i vecchi pezzi (barra in basso, foglio dell\'account) non ci sono più', () => {
    const css = docs('app.css');
    for (const c of ['.app-invito', '.app-invito-testo', '.app-invito-si', '.app-invito-no']) assert.ok(css.includes(c), c);
    assert.doesNotMatch(css, /app-nav|app-bar|app-velo|app-foglio|app-con-barra|app-tira/, 'rimasugli della barra in basso');
});

// ---------- la pagina pubblica è fusa in Trainers; le pagine passano i dati all'app ----------

test('destinazioneFuoriApp: le pagine senza posto nell\'app portano al menù; la pagina pubblica di un allenatore alla sua scheda in Trainers', () => {
    assert.equal(A.destinazioneFuoriApp('/didi-lu/index.html', ''), 'menu.html');
    assert.equal(A.destinazioneFuoriApp('/didi-lu/profile.html', '?player=didi'), 'menu.html', 'solo la pagina pubblica ha un rimando');
    assert.equal(A.destinazioneFuoriApp('/didi-lu/public.html', '?player=didi'), 'players.html?player=didi');
    assert.equal(A.destinazioneFuoriApp('/didi-lu/public.html', 'player=Lukiani'), 'players.html?player=Lukiani', 'con o senza il punto interrogativo');
    assert.equal(A.destinazioneFuoriApp('/didi-lu/public.html', '?player=Anna Maria'), 'players.html?player=Anna%20Maria');
    assert.equal(A.destinazioneFuoriApp('/didi-lu/public.html', ''), 'players.html');
    for (const [pagina, dove] of Object.entries(A.RIMANDI)) { assert.ok(A.FUORI_APP.includes(pagina), pagina); assert.ok(A.VOCI.some(v => v.pagine.includes(dove)), `${pagina} rimanda a una pagina che ha la sua tessera`); }
});

test('SCRIPT_PAGINE: gli script che una pagina dell\'app carica oltre a quelli comuni esistono e la pagina li può usare', () => {
    assert.deepEqual(Object.keys(A.SCRIPT_PAGINE).sort(), ['box.html', 'matches.html', 'players.html', 'practice.html', 'stats.html']);
    for (const [pagina, lista] of Object.entries(A.SCRIPT_PAGINE)) {
        assert.ok(esiste(pagina), pagina);
        assert.ok(A.voceDi(pagina), `${pagina}: è una pagina dell'app`);
        for (const f of lista) assert.ok(esiste(f), `${pagina}: manca ${f}`);
        // il carosello va prima di chi lo usa
        const i = lista.indexOf('app-carosello.js');
        if (i >= 0) assert.equal(i, lista.findIndex(x => x !== 'sprite-pkm.js'), `${pagina}: il carosello viene prima delle schermate che lo usano`);
    }
});

test('pubblica / datiPagina: la pagina del sito lascia i dati calcolati e l\'app li legge; chi ascolta li riceve all\'evento; fuori dal browser non lancia', () => {
    assert.equal(A.datiPagina('classifica'), undefined);
    assert.doesNotThrow(() => A.pubblica('classifica', [{ nome: 'Didi' }]));
    assert.deepEqual(A.datiPagina('classifica'), [{ nome: 'Didi' }]);
    A.pubblica('classifica', []);
    assert.deepEqual(A.datiPagina('classifica'), [], 'l\'ultima pubblicazione sostituisce la precedente');
    const eventi = [];
    const prima = global.document;
    global.document = { dispatchEvent: e => eventi.push(e.detail) };
    try { A.pubblica('trainers', [1]); } finally { global.document = prima; }
    assert.deepEqual(eventi, ['trainers']);
    assert.deepEqual(A.datiPagina('trainers'), [1]);
});
