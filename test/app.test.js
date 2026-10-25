'use strict';
// Il sito come app (docs/app.js, app.css, manifest.webmanifest, sw.js, offline.html): installabile su iPhone e Android, e con i ritocchi "da app"
// (barra in basso, tira per aggiornare) solo quando è aperto dall'icona sulla Home o dentro l'APK.
//   - la parte pura: come è aperto il sito, quale voce della barra è accesa, quando proporre di installare;
//   - il comportamento con una finestra finta: classi su <html>, barra, menù, tastiera, tira per aggiornare, invito a installare, service worker;
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

test('voceAttiva: Home accende Home (anche l\'hub di una stagione), le cinque pagine hanno la loro voce, il resto non ne accende nessuna', () => {
    assert.equal(A.voceAttiva('/didi-lu/'), 'home');
    assert.equal(A.voceAttiva('/didi-lu/index.html'), 'home');
    assert.equal(A.voceAttiva('/didi-lu/hub.html'), 'home');
    assert.equal(A.voceAttiva('/didi-lu/matches.html'), 'matches');
    assert.equal(A.voceAttiva('/didi-lu/box.html'), 'box');
    assert.equal(A.voceAttiva('/didi-lu/players.html'), 'trainers');
    assert.equal(A.voceAttiva('/didi-lu/stats.html'), 'stats');
    // Profile, Archive, Formats, Rulebook e le pagine dei giocatori si aprono dal foglio dell'account (app-shell.js): nella barra non c'è una voce per loro
    for (const p of ['profile.html', 'palmares.html', 'formats.html', 'rules.html', 'public.html']) assert.equal(A.voceAttiva('/didi-lu/' + p), '', p);
});

test('haBarra / puoTirare: niente barra in battaglia, accesso, amministrazione e modello vuoto; tirare solo dove non si modifica nulla', () => {
    for (const p of ['battle.html', 'login.html', 'admin.html', 'schermata-base-vuota.html']) assert.equal(A.haBarra(p), false, p);
    for (const p of ['index.html', 'matches.html', 'box.html', 'players.html', 'stats.html', 'profile.html', 'public.html', 'hub.html', 'palmares.html', 'rules.html', 'formats.html']) assert.equal(A.haBarra(p), true, p);
    for (const p of ['index.html', 'matches.html', 'hub.html', 'players.html', 'stats.html', 'palmares.html', 'rules.html', 'formats.html']) assert.equal(A.puoTirare(p), true, p);
    // dove si modifica o si gioca si ricarica solo col tasto: tirare per sbaglio perderebbe il lavoro
    for (const p of ['box.html', 'profile.html', 'public.html', 'battle.html', 'admin.html', 'login.html']) assert.equal(A.puoTirare(p), false, p);
});

test('le voci della barra: cinque, con pagine vere; le pagine citate esistono e hanno la barra', () => {
    assert.deepEqual(A.VOCI.map(v => v.id), ['home', 'matches', 'box', 'trainers', 'stats']);
    assert.equal(new Set(A.VOCI.map(v => v.et)).size, 5);
    for (const v of A.VOCI) {
        assert.ok(esiste(v.href), `${v.id}: manca ${v.href}`);
        assert.ok(A.haBarra(v.href), v.href);
        for (const p of v.pagine) assert.ok(esiste(p), `${v.id}: manca ${p}`);
    }
    for (const p of [...A.SENZA_BARRA, ...A.CON_TIRA]) assert.ok(esiste(p), `manca ${p}`);
    assert.deepEqual(A.CON_TIRA.filter(p => A.SENZA_BARRA.includes(p)), []);
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

test('tirata: la distanza ha un po\' di resistenza e verso l\'alto non conta', () => {
    assert.equal(A.tirata(100, 100), 0);
    assert.equal(A.tirata(100, 40), 0);
    assert.equal(A.tirata(0, 100), 55);
    assert.equal(A.tirata(0, 200), 110);
    assert.ok(A.tirata(0, 300) >= A.DISTANZA_TIRA);
    assert.ok(A.tirata(0, 100) < A.DISTANZA_TIRA, 'un tocco corto non aggiorna');
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

/** Apre una pagina finta e fa partire app.js. Con `stato` si guardano classi, barra, invito, ricariche... */
function apri({ ua = UA.pc, percorso = '/didi-lu/index.html', search = '', protocollo = 'https:', host = 'didi722.github.io', standalone = false, iosStandalone,
    referrer = '', memoria = {}, caricamento = false, inFrame = false, punti = 0, serviceWorker = true, menuDelSito = true, storageRotto = false } = {}) {
    const doc = { readyState: caricamento ? 'loading' : 'complete', referrer, documentElement: elemento('html'), body: elemento('body'), ascoltatori: {} };
    doc.createElement = tag => elemento(tag);
    doc.getElementById = id => cerca(doc.body, id);
    doc.addEventListener = (ev, f) => { (doc.ascoltatori[ev] = doc.ascoltatori[ev] || []).push(f); };
    const stato = { memoria, ricariche: 0, menu: 0, registrazioni: [], doc };
    const navigator = { userAgent: ua, maxTouchPoints: punti, standalone: iosStandalone };
    if (serviceWorker) navigator.serviceWorker = { register: url => { stato.registrazioni.push(url); return Promise.resolve(); } };
    const win = {
        document: doc, navigator, pageYOffset: 0, ascoltatori: {},
        location: { search, pathname: percorso, protocol: protocollo, hostname: host, reload() { stato.ricariche++; } },
        localStorage: storageRotto
            ? { getItem() { throw new Error('storage bloccato'); }, setItem() { throw new Error('storage bloccato'); }, removeItem() { throw new Error('storage bloccato'); } }
            : { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); }, removeItem: k => { delete memoria[k]; } },
        matchMedia: q => ({ matches: standalone && /standalone/.test(q) }),
        URLSearchParams,
        addEventListener: (ev, f) => { (win.ascoltatori[ev] = win.ascoltatori[ev] || []).push(f); }
    };
    win.self = win;
    win.top = inFrame ? {} : win;
    if (menuDelSito) win.handleAuthClick = () => { stato.menu++; };
    stato.win = win;
    stato.html = doc.documentElement;
    stato.risultato = A.avvia(win);
    stato.classi = () => [...stato.html.classi].sort();
    stato.barra = () => doc.body.figli.find(f => f.tagName === 'NAV') || null;
    stato.invito = () => doc.getElementById('app-invito');
    stato.sulla = (oggetto, ev, dati) => (oggetto.ascoltatori[ev] || []).forEach(f => f(dati));
    stato.tocco = (ev, y, bersaglio = elemento('div')) => stato.sulla(doc, ev, { target: bersaglio, touches: ev === 'touchend' ? [] : [{ clientY: y }], changedTouches: [{ clientY: y }] });
    stato.finisciCaricamento = () => { doc.readyState = 'complete'; stato.sulla(doc, 'DOMContentLoaded'); };
    return stato;
}


// ---------- come si presenta la pagina ----------

test('nel browser da PC: nessuna classe, nessuna barra, nessun invito, nessun service worker (il sito è quello di sempre)', () => {
    const s = apri({ ua: UA.pc, percorso: '/didi-lu/matches.html' });
    assert.deepEqual(s.risultato, { modo: '' });
    assert.deepEqual(s.classi(), []);
    assert.equal(s.barra(), null);
    assert.equal(s.invito(), null);
    assert.equal(s.doc.body.figli.length, 0);
    s.sulla(s.win, 'load');
    assert.deepEqual(s.registrazioni, []);
});

test('service worker: solo da telefono o tablet, su https o localhost, solo se il browser lo ha, mai dentro l\'APK', () => {
    const registra = opz => { const s = apri(opz); assert.deepEqual(s.registrazioni, [], 'non prima che la pagina sia caricata'); s.sulla(s.win, 'load'); return s.registrazioni; };
    assert.deepEqual(registra({ ua: UA.android }), ['sw.js']);
    assert.deepEqual(registra({ ua: UA.iphone }), ['sw.js']);
    assert.deepEqual(registra({ ua: UA.ipad, punti: 5 }), ['sw.js'], 'anche l\'iPad che si spaccia per Mac');
    assert.deepEqual(registra({ ua: UA.android, protocollo: 'http:', host: 'localhost' }), ['sw.js'], 'localhost va bene anche senza https');
    assert.deepEqual(registra({ ua: UA.android, protocollo: 'http:', host: '192.168.1.20' }), [], 'http in rete: il browser non lo permetterebbe');
    assert.deepEqual(registra({ ua: UA.pc }), [], 'da PC non serve');
    assert.deepEqual(registra({ ua: UA.pc, search: '?app=1' }), [], 'nemmeno guardando l\'aspetto da app dal PC');
    assert.deepEqual(registra({ ua: UA.android, serviceWorker: false }), []);
    assert.deepEqual(registra({ ua: UA.apk }), [], 'nell\'APK il sito arriva sempre dalla rete');
});

test('dall\'icona sulla Home dell\'iPhone: classi app e app-shell, barra a cinque voci con quella della pagina accesa, nessun invito', () => {
    const s = apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/matches.html', punti: 5 });
    assert.deepEqual(s.risultato, { modo: 'installata' });
    assert.deepEqual(s.classi(), ['app', 'app-con-barra', 'app-installata', 'app-shell', 'os-ios']);
    const barra = s.barra();
    assert.ok(barra);
    assert.equal(barra.className, 'app-nav');
    assert.equal(barra.attributi['aria-label'], 'App navigation');
    const html = barra.innerHTML;
    assert.equal((html.match(/app-nav-voce/g) || []).length, 5);
    for (const p of ['index.html', 'matches.html', 'box.html', 'players.html', 'stats.html']) assert.match(html, new RegExp(`href="${p}"`));
    for (const et of ['Home', 'Matches', 'Box', 'Trainers', 'Stats']) assert.match(html, new RegExp(`<span>${et}</span>`));
    // una sola voce accesa, segnalata anche ai lettori di schermo
    assert.equal((html.match(/app-nav-voce attiva/g) || []).length, 1);
    assert.match(html, /<a class="app-nav-voce attiva" href="matches\.html" aria-current="page">/);
    assert.equal((html.match(/aria-current/g) || []).length, 1);
    assert.doesNotMatch(html, /<button/, 'nessun pulsante Menu: le altre pagine stanno nel foglio dell\'account in alto');
    assert.equal(s.invito(), null);
});

test('la voce accesa segue la pagina: l\'hub accende Home, Profile e le altre pagine non ne accendono nessuna', () => {
    const accesa = pagina => {
        const s = apri({ ua: UA.android, standalone: true, percorso: '/didi-lu/' + pagina });
        return (s.barra().innerHTML.match(/class="app-nav-voce attiva"[^>]*>/g) || []).map(m => m.match(/href="([^"]+)"/)[1]);
    };
    assert.deepEqual(accesa('hub.html'), ['index.html']);
    assert.deepEqual(accesa('index.html'), ['index.html']);
    assert.deepEqual(accesa('players.html'), ['players.html']);
    assert.deepEqual(accesa('profile.html'), []);
    assert.deepEqual(accesa('palmares.html'), []);
});

test('dentro l\'APK: classe app-apk, nessun service worker, la stessa barra', () => {
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/box.html', punti: 5 });
    assert.deepEqual(s.risultato, { modo: 'apk' });
    assert.deepEqual(s.classi(), ['app', 'app-apk', 'app-con-barra', 'app-shell', 'os-android']);
    s.sulla(s.win, 'load');
    assert.deepEqual(s.registrazioni, []);
    assert.match(s.barra().innerHTML, /<a class="app-nav-voce attiva" href="box\.html" aria-current="page">/);
    assert.equal(s.invito(), null, 'dentro l\'app non si invita a installare l\'app');
});

test('battaglia, accesso, amministrazione e modello vuoto: classe app ma niente barra né "tira per aggiornare"', () => {
    for (const p of ['battle.html', 'login.html', 'admin.html', 'schermata-base-vuota.html']) {
        const s = apri({ ua: UA.apk, percorso: '/didi-lu/' + p });
        assert.deepEqual(s.classi(), ['app', 'app-apk', 'os-android'], p);
        assert.equal(s.barra(), null, p);
        assert.equal((s.doc.ascoltatori.touchstart || []).length, 0, p);
    }
});

test('con il documento ancora in caricamento le classi arrivano subito (niente sfarfallio), la barra appena la pagina è pronta', () => {
    const s = apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/stats.html', caricamento: true });
    assert.deepEqual(s.classi(), ['app', 'app-installata', 'app-shell', 'os-ios']);
    assert.equal(s.barra(), null);
    s.finisciCaricamento();
    assert.ok(s.barra());
    assert.ok(s.html.classi.has('app-con-barra'));
});

test('dentro un altro frame (il Box incorporato nel simulatore) non fa niente', () => {
    const s = apri({ ua: UA.apk, percorso: '/didi-lu/box.html', inFrame: true });
    assert.equal(s.risultato, null);
    assert.deepEqual(s.classi(), []);
    assert.equal(s.barra(), null);
    assert.deepEqual(s.registrazioni, []);
});

test('?app=1 accende l\'aspetto da app anche da PC e lo ricorda; ?app=0 lo spegne; altri valori non toccano niente', () => {
    const memoria = {};
    let s = apri({ ua: UA.pc, percorso: '/didi-lu/stats.html', search: '?app=1', memoria });
    assert.equal(s.risultato.modo, 'installata');
    assert.equal(memoria.appForzata, '1');
    assert.ok(s.barra());
    s = apri({ ua: UA.pc, percorso: '/didi-lu/box.html', memoria });
    assert.equal(s.risultato.modo, 'installata', 'la volta dopo, senza parametro, resta acceso');
    s = apri({ ua: UA.pc, percorso: '/didi-lu/box.html', search: '?app=0', memoria });
    assert.equal(s.risultato.modo, '');
    assert.equal(memoria.appForzata, '0');
    assert.equal(s.barra(), null);
    s = apri({ ua: UA.pc, search: '?app=boh', memoria: {} });
    assert.equal(s.risultato.modo, '');
});

test('con lo storage del browser bloccato (navigazione privata...) il sito funziona uguale', () => {
    const s = apri({ ua: UA.iphone, percorso: '/didi-lu/index.html', storageRotto: true, search: '?app=1' });
    assert.equal(s.risultato.modo, 'installata');
    assert.ok(s.barra());
    const t = apri({ ua: UA.iphone, percorso: '/didi-lu/index.html', storageRotto: true });
    assert.ok(t.invito());
    assert.doesNotThrow(() => t.invito().querySelector('.app-invito-no').click());
    assert.equal(t.invito(), null);
});

// ---------- la tastiera e il "tira per aggiornare" ----------

test('con la tastiera aperta la barra si nasconde: campi di testo sì, caselle e pulsanti no', () => {
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

test('tira per aggiornare: abbastanza giù ricarica; un tocco corto, la pagina già scorsa o due dita no; una volta sola', () => {
    const nuova = (p = 'index.html') => apri({ ua: UA.iphone, iosStandalone: true, percorso: '/didi-lu/' + p });
    // tirata lunga: l'indicatore compare, poi la pagina si ricarica
    let s = nuova();
    s.tocco('touchstart', 100);
    s.tocco('touchmove', 200);
    const indicatore = s.doc.body.figli.find(f => f.classi.has('app-tira'));
    assert.ok(indicatore, 'compare l\'indicatore');
    assert.equal(s.ricariche, 0);
    assert.match(indicatore.querySelector('span').textContent, /Pull to refresh/);
    s.tocco('touchmove', 300);
    assert.ok(indicatore.classi.has('pronto'));
    assert.match(indicatore.querySelector('span').textContent, /Release/);
    s.tocco('touchend', 300);
    assert.equal(s.ricariche, 1);
    assert.ok(indicatore.classi.has('gira'));
    // una volta sola, anche se il dito continua
    s.tocco('touchstart', 100);
    s.tocco('touchend', 400);
    assert.equal(s.ricariche, 1);

    // tocco corto: niente, e l'indicatore sparisce
    s = nuova();
    s.tocco('touchstart', 100);
    s.tocco('touchmove', 180);
    s.tocco('touchend', 180);
    assert.equal(s.ricariche, 0);
    assert.equal(s.doc.body.figli.find(f => f.classi.has('app-tira')).style.opacity, '0');

    // la pagina non è in cima: è uno scorrimento, non un aggiornamento
    s = nuova();
    s.win.pageYOffset = 300;
    s.tocco('touchstart', 100);
    s.tocco('touchmove', 300);
    s.tocco('touchend', 400);
    assert.equal(s.ricariche, 0);

    // due dita (pizzico per lo zoom)
    s = nuova();
    s.sulla(s.doc, 'touchstart', { target: elemento('div'), touches: [{ clientY: 100 }, { clientY: 120 }] });
    s.tocco('touchend', 400);
    assert.equal(s.ricariche, 0);

    // il tocco inizia dentro qualcosa che scorre da solo, o dentro una finestra aperta
    s = nuova();
    const elenco = elemento('div');
    elenco.scrollTop = 20;
    s.tocco('touchstart', 100, elenco);
    s.tocco('touchend', 400);
    assert.equal(s.ricariche, 0, 'un elenco che scorre');
    const finestra = elemento('div');
    finestra.matches = () => true;
    const dentro = elemento('div');
    finestra.appendChild(dentro);
    s.tocco('touchstart', 100, dentro);
    s.tocco('touchend', 400);
    assert.equal(s.ricariche, 0, 'una finestra aperta');
    s.sulla(s.doc, 'touchcancel', {});
});

test('tira per aggiornare: solo nelle pagine dove non si modifica nulla', () => {
    for (const p of A.CON_TIRA) assert.equal((apri({ ua: UA.apk, percorso: '/didi-lu/' + p }).doc.ascoltatori.touchstart || []).length, 1, p);
    for (const p of ['box.html', 'profile.html', 'public.html']) assert.equal((apri({ ua: UA.apk, percorso: '/didi-lu/' + p }).doc.ascoltatori.touchstart || []).length, 0, p);
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
    assert.ok(PAGINE.length >= 14, 'pagine trovate: ' + PAGINE.join(', '));
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

test('manifest: app a schermo intero, indirizzi relativi (il sito sta in una sottocartella), icone vere delle misure dichiarate', () => {
    const m = JSON.parse(docs('manifest.webmanifest'));
    assert.equal(m.display, 'standalone');
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

test('service worker: non mette in cache pagine, script o stili (gli aggiornamenti del sito arrivano subito)', () => {
    const sw = docs('sw.js');
    assert.doesNotMatch(sw, /\.put\(|addAll\(/);
    assert.equal((sw.match(/\.add\(/g) || []).length, 1, 'una sola aggiunta in cache: la pagina offline');
    assert.match(sw, /cache: 'reload'/, 'la pagina offline si prende sempre fresca dalla rete');
    assert.match(sw, /richiesta\.mode !== 'navigate'\) return/);
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
    assert.ok(lista.length >= 25, 'selettori trovati: ' + lista.length);
    for (const s of lista) assert.match(s, /^(html\.app(-[a-z]+)*(\s|$|:|\[)|\.app-[a-z])|^html$/, `regola che tocca il sito intero: "${s}"`);
    assert.equal(regola(css, 'html').trim(), 'touch-action: manipulation;');
    // la barra, l'intestazione e i fogli non esistono finché l'app non li accende (il selettore è uno dei quattro della regola che li nasconde)
    assert.match(css, /\.app-nav,\s*\.app-bar,\s*\.app-velo,\s*\.app-foglio\s*\{\s*display:\s*none/);
    assert.match(css, /html\.app-con-barra \.app-nav\s*\{[^}]*display:\s*flex/);
    // lo spazio per la barra (e per la tacca dei telefoni) è riservato in fondo alla pagina
    assert.match(css, /html\.app-con-barra body\s*\{[^}]*padding-bottom:\s*calc\(var\(--app-nav-h\)\s*\+\s*env\(safe-area-inset-bottom, 0px\)\)/);
    assert.match(css, /@keyframes app-gira/);
});
