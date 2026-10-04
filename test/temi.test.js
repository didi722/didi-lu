'use strict';
// I temi del sito (docs/temi.css + docs/temi.js + docs/fonts/): la parte che si può provare senza browser.
// - l'elenco dei temi, la normalizzazione, i caratteri e il colore del giocatore (puri);
// - il comportamento con un "documento" e un Firebase finti: applica, scegli, sincronizza, selettore;
// - il CSS come testo: ogni tema c'è, i temi cambiano solo variabili --nb-* (mai misure), i font esistono;
// - ogni pagina con la barra del sito è collegata ai temi.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../docs/temi.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const css = docs('temi.css');
const pagineCss = docs('nb-pagine.css');
const js = docs('temi.js');

// ---------- Documento e Firebase finti, quanto basta per temi.js ----------
function elemento(tag) {
    const e = {
        tag, attributi: {}, figli: [], stili: {}, classi: new Set(), ascoltatori: {}, textContent: '', id: '',
        setAttribute(k, v) { this.attributi[k] = String(v); if (k === 'id') this.id = String(v); },
        getAttribute(k) { return k in this.attributi ? this.attributi[k] : null; },
        appendChild(f) { this.figli.push(f); f.padre = this; return f; },
        remove() { if (this.padre) this.padre.figli = this.padre.figli.filter(x => x !== this); },
        addEventListener(ev, f) { (this.ascoltatori[ev] = this.ascoltatori[ev] || []).push(f); },
        focus() { this.focalizzato = true; },
        classList: null, style: null,
        closest(sel) { for (let n = this; n; n = n.padre) if (sel === '.tm-opzione' && n.attributi.class && /\btm-opzione\b/.test(n.attributi.class)) return n; return null; }
    };
    e.classList = { toggle: (c, on) => { if (on) e.classList_set.add(c); else e.classList_set.delete(c); }, contains: c => e.classList_set.has(c) };
    e.classList_set = new Set();
    e.style = { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; }, getPropertyValue(k) { return this.props[k] || ''; } };
    Object.defineProperty(e, 'childNodes', { get() { return e.figli; } });
    return e;
}
function trovaPerId(radice, id) {
    if (radice.id === id) return radice;
    for (const f of radice.figli || []) { const r = trovaPerId(f, id); if (r) return r; }
    return null;
}
function trovaTutti(radice, pred, out = []) {
    if (pred(radice)) out.push(radice);
    for (const f of radice.figli || []) trovaTutti(f, pred, out);
    return out;
}
function nuovoMondo({ memoria = {}, utente = null, nome = null, info = null, scrittureFalliscono = null, firebasePronto = true } = {}) {
    const html = elemento('html'), head = elemento('head'), body = elemento('body');
    html.appendChild(head); html.appendChild(body);
    const doc = {
        documentElement: html, head, body, readyState: 'complete',
        createElement: tag => elemento(tag), createTextNode: t => ({ nodo: 'testo', textContent: t, attributi: {}, figli: [] }),
        getElementById: id => trovaPerId(html, id), addEventListener() {}
    };
    // appendChild con testo: i nodi di testo non hanno figli
    const dati = new Map(Object.entries(memoria));
    const scritture = [];
    const sessioni = [];
    const fb = {
        apps: firebasePronto ? [{}] : [],
        auth: () => ({ onAuthStateChanged: f => { sessioni.push(f); } }),
        database: () => ({
            ref: p => ({
                once: async () => ({ val: () => (p === `users/${utente && utente.uid}/name` ? nome : p === `players/${nome && nome.toLowerCase()}/info` ? info : null) }),
                update: async v => { if (scrittureFalliscono) { const e = new Error('x'); e.code = scrittureFalliscono; throw e; } scritture.push([p, v]); }
            })
        })
    };
    const root = {
        document: doc, firebase: fb,
        localStorage: { getItem: k => (dati.has(k) ? dati.get(k) : null), setItem: (k, v) => dati.set(k, String(v)), removeItem: k => dati.delete(k) }
    };
    // timer finti: si lanciano a mano, uno "giro" alla volta
    const timer = [];
    root.setTimeout = (f, ms) => { timer.push({ f, ms }); return timer.length; };
    const giro = () => { const da = timer.splice(0); da.forEach(x => x.f()); return da.length; };
    return { root, doc, html, dati, scritture, fb, timer, giro, accedi: async u => { for (const f of sessioni) await f(u); }, sessioni };
}
const attende = () => new Promise(r => setImmediate(r));

// ---------- La parte pura ----------
test('ci sono quattro temi e quello predefinito è il primo (il look di prima)', () => {
    assert.deepEqual(T.ELENCO, ['neubrutal', 'sticker', 'morbido', 'arcade']);
    assert.equal(T.PREDEFINITO, 'neubrutal');
    assert.equal(T.ELENCO[0], T.PREDEFINITO);
    for (const id of T.ELENCO) {
        const t = T.TEMI[id];
        assert.ok(t.nome && t.frase && t.caratteri, `${id}: nome, frase e caratteri servono al selettore`);
    }
});

test('normalizza: un id che non esiste (o non è una stringa) diventa il tema predefinito', () => {
    for (const id of T.ELENCO) assert.equal(T.normalizza(id), id);
    for (const sbagliato of [undefined, null, '', 'Arcade', 'neon', 42, {}, [], 'toString', '__proto__', 'constructor']) {
        assert.equal(T.normalizza(sbagliato), T.PREDEFINITO, String(sbagliato));
    }
});

test('coloreValido: solo esadecimali #rgb e #rrggbb, riportati in minuscolo e per esteso', () => {
    assert.equal(T.coloreValido('#31C489'), '#31c489');
    assert.equal(T.coloreValido(' #ABC '), '#aabbcc');
    for (const no of ['rgb(1,2,3)', 'green', '#12', '#12345', '#1234567', '31c489', '', null, undefined, 5, '#ggg']) assert.equal(T.coloreValido(no), null, String(no));
});

test('i caratteri: il tema predefinito usa quelli del sito, gli altri un foglio in fonts/ che esiste', () => {
    assert.equal(T.cssCaratteri('neubrutal'), null);
    assert.equal(T.cssCaratteri('inesistente'), null);
    for (const id of T.ELENCO.filter(x => x !== T.PREDEFINITO)) {
        const file = T.cssCaratteri(id);
        assert.equal(file, `fonts/tema-${id}.css`);
        assert.ok(fs.existsSync(path.join(DOCS, file)), `${file} manca`);
    }
});

// ---------- Il comportamento con documento e Firebase finti ----------
test('avvia: mette subito il tema e il colore ricordati dal browser, prima di sapere chi sei', () => {
    const w = nuovoMondo({ memoria: { temaSito: 'arcade', coloreSito: '#ff7b6b' } });
    T.avvia(w.root);
    assert.equal(w.html.getAttribute('data-tema'), 'arcade');
    assert.equal(w.doc.getElementById('temi-caratteri').getAttribute('href'), 'fonts/tema-arcade.css');
    assert.equal(w.html.style.getPropertyValue('--nb-accento'), '#ff7b6b');
});

test('avvia: senza nulla di ricordato il tema è quello predefinito, senza foglio di caratteri, e il colore è quello degli ospiti', () => {
    const w = nuovoMondo();
    T.avvia(w.root);
    assert.equal(w.html.getAttribute('data-tema'), 'neubrutal');
    assert.equal(w.doc.getElementById('temi-caratteri'), null);
    assert.equal(w.html.style.getPropertyValue('--nb-accento'), T.COLORE_OSPITE);
});

test('un valore ricordato che non è un tema (memoria sporca) non rompe niente', () => {
    const w = nuovoMondo({ memoria: { temaSito: '<script>', coloreSito: 'url(x)' } });
    T.avvia(w.root);
    assert.equal(w.html.getAttribute('data-tema'), 'neubrutal');
    assert.equal(w.html.style.getPropertyValue('--nb-accento'), T.COLORE_OSPITE);
});

test('se localStorage non c\'è o lancia, il tema si applica lo stesso', () => {
    const w = nuovoMondo();
    w.root.localStorage = { getItem() { throw new Error('bloccato'); }, setItem() { throw new Error('bloccato'); }, removeItem() { throw new Error('bloccato'); } };
    assert.doesNotThrow(() => T.avvia(w.root));
    assert.equal(w.html.getAttribute('data-tema'), 'neubrutal');
    const w2 = nuovoMondo();
    delete w2.root.localStorage;
    assert.doesNotThrow(() => T.avvia(w2.root));
});

test('applica: cambiare tema cambia l\'attributo, porta il foglio dei caratteri e lo toglie tornando al predefinito', () => {
    const w = nuovoMondo();
    assert.equal(T.applica(w.root, 'sticker'), 'sticker');
    assert.equal(w.html.getAttribute('data-tema'), 'sticker');
    assert.equal(w.doc.getElementById('temi-caratteri').getAttribute('href'), 'fonts/tema-sticker.css');
    T.applica(w.root, 'morbido');
    // un solo foglio, che cambia indirizzo
    assert.equal(trovaTutti(w.html, e => e.id === 'temi-caratteri').length, 1);
    assert.equal(w.doc.getElementById('temi-caratteri').getAttribute('href'), 'fonts/tema-morbido.css');
    assert.equal(T.applica(w.root, 'boh'), 'neubrutal');
    assert.equal(w.html.getAttribute('data-tema'), 'neubrutal');
    assert.equal(w.doc.getElementById('temi-caratteri'), null);
});

test('scegli senza essere collegati: si salva nel browser e basta', async () => {
    const w = nuovoMondo();
    T.avvia(w.root);
    const r = await T.scegli(w.root, 'sticker');
    assert.deepEqual(r, { salvato: false, motivo: 'locale' });
    assert.equal(w.dati.get('temaSito'), 'sticker');
    assert.equal(w.html.getAttribute('data-tema'), 'sticker');
    assert.deepEqual(w.scritture, []);
});

test('sincronizza: dopo l\'accesso adotta tema e colore del profilo e li ricorda nel browser', async () => {
    const w = nuovoMondo({ utente: { uid: 'u1' }, nome: 'Didi', info: { temaSito: 'morbido', color: '#4D9DE0' } });
    T.avvia(w.root);
    await w.accedi({ uid: 'u1' });
    assert.equal(w.html.getAttribute('data-tema'), 'morbido');
    assert.equal(w.dati.get('temaSito'), 'morbido');
    assert.equal(w.dati.get('coloreSito'), '#4d9de0');
    assert.equal(w.html.style.getPropertyValue('--nb-accento'), '#4d9de0');
});

test('sincronizza: chi non ha mai scelto torna al tema predefinito, anche se il browser ne ricordava un altro', async () => {
    const w = nuovoMondo({ memoria: { temaSito: 'arcade' }, utente: { uid: 'u1' }, nome: 'Lu', info: { color: '#8e44ad' } });
    T.avvia(w.root);
    assert.equal(w.html.getAttribute('data-tema'), 'arcade', 'prima di sapere chi sei vale quello ricordato');
    await w.accedi({ uid: 'u1' });
    assert.equal(w.html.getAttribute('data-tema'), 'neubrutal');
    assert.equal(w.dati.get('temaSito'), 'neubrutal');
});

test('sincronizza: un tema scritto male nel profilo (o rimosso in futuro) diventa il predefinito', async () => {
    const w = nuovoMondo({ utente: { uid: 'u1' }, nome: 'Didi', info: { temaSito: 'vecchio-tema' } });
    T.avvia(w.root);
    await w.accedi({ uid: 'u1' });
    assert.equal(w.html.getAttribute('data-tema'), 'neubrutal');
});

test('scegli da collegati: un\'unica scrittura su players/<nome>/info con solo il campo temaSito', async () => {
    const w = nuovoMondo({ utente: { uid: 'u1' }, nome: 'Didi', info: {} });
    T.avvia(w.root);
    await w.accedi({ uid: 'u1' });
    const r = await T.scegli(w.root, 'arcade');
    assert.deepEqual(r, { salvato: true });
    assert.deepEqual(w.scritture, [['players/didi/info', { temaSito: 'arcade' }]]);
    assert.equal(w.dati.get('temaSito'), 'arcade');
    // un id sbagliato non finisce nel database
    await T.scegli(w.root, 'qualcosa');
    assert.deepEqual(w.scritture[1], ['players/didi/info', { temaSito: 'neubrutal' }]);
});

test('scegli: se il database rifiuta la scrittura il tema vale lo stesso qui e il motivo è chiaro', async () => {
    const w = nuovoMondo({ utente: { uid: 'u1' }, nome: 'Didi', info: {}, scrittureFalliscono: 'PERMISSION_DENIED' });
    T.avvia(w.root);
    await w.accedi({ uid: 'u1' });
    assert.deepEqual(await T.scegli(w.root, 'sticker'), { salvato: false, motivo: 'permessi' });
    assert.equal(w.html.getAttribute('data-tema'), 'sticker');
    const w2 = nuovoMondo({ utente: { uid: 'u1' }, nome: 'Didi', info: {}, scrittureFalliscono: 'NETWORK_ERROR' });
    T.avvia(w2.root);
    await w2.accedi({ uid: 'u1' });
    assert.deepEqual(await T.scegli(w2.root, 'sticker'), { salvato: false, motivo: 'rete' });
});

test('uscire (ospite): resta il tema del browser ma il colore torna quello degli ospiti', async () => {
    const w = nuovoMondo({ memoria: { temaSito: 'sticker', coloreSito: '#31c489' } });
    T.avvia(w.root);
    await w.accedi(null);
    assert.equal(w.html.getAttribute('data-tema'), 'sticker');
    assert.equal(w.html.style.getPropertyValue('--nb-accento'), T.COLORE_OSPITE);
    assert.equal(w.dati.has('coloreSito'), false);
});

test('se la pagina non ha ancora inizializzato Firebase, si riprova ogni 150ms (fino a 9 secondi) e poi si sincronizza', async () => {
    const w = nuovoMondo({ firebasePronto: false, utente: { uid: 'u1' }, nome: 'Didi', info: { temaSito: 'arcade', color: '#ff7b6b' } });
    T.avvia(w.root);
    assert.equal(w.sessioni.length, 0, 'Firebase non è pronto: nessun ascolto');
    assert.equal(w.timer.length, 1);
    assert.equal(w.timer[0].ms, 150);
    w.giro(); w.giro();
    assert.equal(w.sessioni.length, 0);
    // la pagina chiama initializeApp()
    w.fb.apps.push({});
    w.giro();
    assert.equal(w.sessioni.length, 1, 'ora ascolta l\'accesso');
    await w.accedi({ uid: 'u1' });
    assert.equal(w.html.getAttribute('data-tema'), 'arcade');
    assert.equal(w.html.style.getPropertyValue('--nb-accento'), '#ff7b6b');
});

test('se Firebase non arriva mai, dopo 60 tentativi si smette e la pagina resta col tema del browser', () => {
    const w = nuovoMondo({ firebasePronto: false, memoria: { temaSito: 'morbido' } });
    T.avvia(w.root);
    let giri = 0;
    while (w.giro() > 0 && giri < 200) giri++;
    assert.equal(giri, 60);
    assert.equal(w.timer.length, 0);
    assert.equal(w.html.getAttribute('data-tema'), 'morbido');
});

test('se ha già scelto un tema mentre il profilo si leggeva, vale la sua scelta (e va nel profilo, senza essere cancellata)', async () => {
    const w = nuovoMondo({ utente: { uid: 'u1' }, nome: 'Didi', info: { temaSito: 'morbido' } });
    T.avvia(w.root);
    // clic sul selettore prima che l'accesso sia stato risolto
    const r = await T.scegli(w.root, 'arcade');
    assert.deepEqual(r, { salvato: false, motivo: 'locale' });
    await w.accedi({ uid: 'u1' });
    await attende();
    assert.equal(w.html.getAttribute('data-tema'), 'arcade', 'non torna a "morbido", che era nel profilo');
    assert.equal(w.dati.get('temaSito'), 'arcade');
    assert.deepEqual(w.scritture, [['players/didi/info', { temaSito: 'arcade' }]]);
});

test('il selettore: una scelta per tema, quella attiva segnata, e un clic la applica', async () => {
    const w = nuovoMondo({ utente: { uid: 'u1' }, nome: 'Didi', info: { temaSito: 'morbido' } });
    T.avvia(w.root);
    await w.accedi({ uid: 'u1' });
    const contenitore = elemento('div');
    const sel = T.montaSelettore(w.root, contenitore);
    assert.ok(sel);
    const opzioni = trovaTutti(contenitore, e => e.attributi.role === 'radio');
    assert.deepEqual(opzioni.map(o => o.attributi['data-scelta']), T.ELENCO);
    assert.deepEqual(opzioni.map(o => o.attributi['aria-checked']), ['false', 'false', 'true', 'false']);
    assert.deepEqual(opzioni.map(o => o.attributi.tabindex), ['-1', '-1', '0', '-1'], 'solo l\'attiva è raggiungibile col tab (gruppo di radio)');
    // clic su "arcade"
    const arcade = opzioni[3];
    sel.lista.ascoltatori.click[0]({ target: arcade });
    await attende(); await attende();
    assert.equal(w.html.getAttribute('data-tema'), 'arcade');
    assert.deepEqual(opzioni.map(o => o.attributi['aria-checked']), ['false', 'false', 'false', 'true']);
    assert.deepEqual(w.scritture.at(-1), ['players/didi/info', { temaSito: 'arcade' }]);
    assert.match(sel.nota.textContent, /Saved to your profile/);
});

test('il selettore: le frecce spostano la scelta come in un gruppo di radio (con giro)', async () => {
    const w = nuovoMondo();
    T.avvia(w.root);
    const contenitore = elemento('div');
    const sel = T.montaSelettore(w.root, contenitore);
    const opzioni = trovaTutti(contenitore, e => e.attributi.role === 'radio');
    const premi = key => { let fermato = false; sel.lista.ascoltatori.keydown[0]({ key, preventDefault() { fermato = true; } }); return fermato; };
    assert.equal(premi('ArrowRight'), true);
    assert.equal(w.html.getAttribute('data-tema'), 'sticker');
    assert.equal(opzioni[1].focalizzato, true);
    premi('ArrowLeft'); premi('ArrowLeft');
    assert.equal(w.html.getAttribute('data-tema'), 'arcade', 'da neubrutal a sinistra si torna all\'ultimo');
    assert.equal(premi('a'), false, 'gli altri tasti non vengono toccati');
});

test('il selettore costruisce solo nodi di testo (niente innerHTML)', () => {
    assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

// ---------- Il CSS ----------
const blocchiTema = id => {
    // le definizioni principali: [data-tema="x"] { ... } (o :root per il predefinito), prima del guscio comune
    const inizio = css.indexOf('/* ---------- Tema');
    const fine = css.indexOf('/* Ombre ricavate dai numeri del tema.');
    assert.ok(inizio >= 0 && fine > inizio, 'delimitatori dei temi non trovati');
    const zona = css.slice(inizio, fine);
    const re = id === 'neubrutal' ? /:root,\s*\[data-tema="neubrutal"\]\s*\{([^}]*)\}/ : new RegExp(`\\[data-tema="${id}"\\]\\s*\\{([^}]*)\\}`);
    const m = re.exec(zona);
    assert.ok(m, `blocco del tema ${id} non trovato`);
    return m[1];
};
const dichiarazioni = blocco => blocco.replace(/\/\*[\s\S]*?\*\//g, '').split(';').map(s => s.trim()).filter(Boolean)
    .map(d => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; });

test('ogni tema ha il suo blocco di variabili nel CSS', () => {
    for (const id of T.ELENCO) assert.ok(blocchiTema(id).length > 20, id);
});

test('i temi cambiano solo variabili --nb-*: nessuna larghezza, altezza, margine, spessore o riempimento', () => {
    for (const id of T.ELENCO) {
        const d = dichiarazioni(blocchiTema(id));
        const estranee = d.filter(([k]) => !k.startsWith('--nb-'));
        assert.deepEqual(estranee, [], `${id}: solo variabili --nb-* (le dimensioni degli oggetti non devono cambiare)`);
        // e anche tra le variabili, niente che suoni come una misura di layout
        const misure = d.filter(([k]) => /(larghezza|altezza|width|height|margin|padding|gap|spessore|bordo)/i.test(k));
        assert.deepEqual(misure, [], `${id}: variabili che toccano le misure`);
    }
});

test('i quattro temi definiscono lo stesso insieme di variabili di rotazione, angoli, ombre e caratteri', () => {
    const necessarie = ['--nb-raggio', '--nb-rot', '--nb-font-titoli', '--nb-font-testo', '--nb-sfondo', '--nb-motivo'];
    for (const id of T.ELENCO) {
        const nomi = new Set(dichiarazioni(blocchiTema(id)).map(([k]) => k));
        if (id === 'neubrutal') for (const v of ['--nb-kx', '--nb-ky', '--nb-bk', '--nb-shcol', ...necessarie]) assert.ok(nomi.has(v), `${id}: manca ${v}`);
        else for (const v of ['--nb-rot', '--nb-font-titoli', '--nb-font-testo']) assert.ok(nomi.has(v), `${id}: manca ${v}`);
    }
    // un tema scuro deve dire anche di che colore è il testo scritto sulla pagina
    assert.ok(dichiarazioni(blocchiTema('arcade')).some(([k]) => k === '--nb-testo'));
});

test('le ombre vere si ricavano da cinque numeri per tema, e valgono anche sulle anteprime del selettore', () => {
    assert.match(css, /:root,\s*\[data-tema\]\s*\{[^}]*--nb-sh-s:[^}]*var\(--nb-kx\)[^}]*var\(--nb-bk\)[^}]*var\(--nb-shcol\)/);
    for (const v of ['--nb-sh-s', '--nb-sh-4', '--nb-sh-m', '--nb-sh-8', '--nb-sh-l', '--nb-sh-titolo']) assert.match(css, new RegExp(`${v}:`), v);
    // il tema morbido sfuma e va solo verso il basso; gli altri hanno ombre piene
    const morbido = Object.fromEntries(dichiarazioni(blocchiTema('morbido')));
    assert.equal(morbido['--nb-kx'], '0');
    assert.equal(morbido['--nb-bk'], '1');
    const neubrutal = Object.fromEntries(dichiarazioni(blocchiTema('neubrutal')));
    assert.equal(neubrutal['--nb-bk'], '0', 'ombra piena = nessuna sfumatura');
});

test('arcade è l\'unico scuro: testo chiaro sulla pagina e fuori dalle card, ombre al neon', () => {
    const arcade = Object.fromEntries(dichiarazioni(blocchiTema('arcade')));
    assert.match(arcade['--nb-sfondo'], /^#0/);
    assert.equal(arcade['--nb-rot'], '0', 'tutto dritto');
    assert.match(arcade['--nb-neon'], /color-mix/);
    assert.match(css, /\[data-tema="arcade"\] body\.nb :is\(\.stats-ordina-et, \.uso-formati-titolo, \.toc-link:not\(\.active\)\)\s*\{\s*color: var\(--nb-testo\)/);
});

test('la tinta della pagina col colore del giocatore c\'è solo dove color-mix esiste (altrimenti resta lo sfondo di prima)', () => {
    const m = /@supports \(background: color-mix\([^)]*\)\)\s*\{\s*body\.nb\s*\{([^}]*)\}/.exec(css);
    assert.ok(m, 'la regola dello sfondo deve stare dentro @supports');
    assert.match(m[1], /color-mix\(in srgb, var\(--nb-accento, #31c489\) var\(--nb-tinta\), var\(--nb-sfondo\)\)/);
    assert.match(m[1], /!important/);
    // fuori da @supports il guscio non ridefinisce lo sfondo
    const fuori = css.replace(/@supports[\s\S]*?\n\}\n/, '');
    assert.doesNotMatch(fuori, /body\.nb\s*\{[^}]*\bbackground:/);
});

test('i fogli dei caratteri: ogni tema rimpiazza Josefin Sans e Montserrat con file che esistono, con le misure calibrate', () => {
    for (const id of T.ELENCO.filter(x => x !== T.PREDEFINITO)) {
        const f = docs(`fonts/tema-${id}.css`);
        const facce = [...f.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]);
        assert.equal(facce.length, 2, `${id}: una faccia per i titoli e una per il testo`);
        assert.deepEqual(facce.map(x => /font-family:\s*'([^']+)'/.exec(x)[1]).sort(), ['Josefin Sans', 'Montserrat']);
        for (const faccia of facce) {
            const file = /url\(([^)]+)\)/.exec(faccia)[1];
            assert.ok(fs.existsSync(path.join(DOCS, 'fonts', file)), `${id}: ${file} manca`);
            assert.match(faccia, /font-weight:\s*100 900/, 'un carattere variabile o unico copre tutti i pesi richiesti dal sito');
            // la calibrazione tiene gli ingombri del carattere sostituito: grandezza e metriche di riga
            for (const d of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) assert.match(faccia, new RegExp(`${d}:\\s*[\\d.]+%`), `${id}: manca ${d}`);
            const k = parseFloat(/size-adjust:\s*([\d.]+)%/.exec(faccia)[1]);
            assert.ok(k >= 80 && k <= 125, `${id}: size-adjust ${k}% fuori dai limiti ragionevoli`);
        }
    }
});

test('le anteprime del selettore usano nomi propri dei caratteri, e i file ci sono tutti', () => {
    const a = docs('fonts/anteprime.css');
    const file = [...a.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
    assert.ok(file.length >= 7);
    for (const f of file) assert.ok(fs.existsSync(path.join(DOCS, 'fonts', f)), `${f} manca`);
    for (const nome of ['NB Josefin', 'NB Montserrat', 'NB Titan One', 'NB Fredoka', 'NB Nunito', 'NB Chakra', 'NB Inconsolata']) assert.match(a, new RegExp(`'${nome}'`), nome);
    // e il CSS del selettore li usa
    for (const nome of ['NB Josefin', 'NB Titan One', 'NB Fredoka', 'NB Nunito', 'NB Chakra', 'NB Inconsolata']) assert.match(css, new RegExp(`'${nome}'`), nome);
    assert.ok(fs.existsSync(path.join(DOCS, 'fonts', 'README.txt')), 'la licenza dei caratteri va dichiarata');
    assert.match(docs('fonts/README.txt'), /SIL Open Font License/);
});

test('l\'anteprima di ogni opzione usa le variabili del proprio tema, non quelle del tema attivo', () => {
    // .tm-opzione[data-tema=...] eredita le variabili dal selettore [data-tema] definito in temi.css
    for (const id of T.ELENCO.filter(x => x !== T.PREDEFINITO)) assert.match(css, new RegExp(`\\.tm-opzione\\[data-tema="${id}"\\]`), id);
    assert.match(js, /'data-tema': id/);
    assert.match(css, /\.tm-anteprima\s*\{[^}]*var\(--nb-motivo\)[^}]*color-mix/s);
});

// ---------- Le pagine ----------
const PAGINE_CON_BARRA = {
    'index.html': 'pg-index', 'hub.html': 'pg-hub', 'players.html': 'pg-players',
    'profile.html': 'pg-profile', 'stats.html': 'pg-stats', 'formats.html': 'pg-formats',
    'rules.html': 'pg-rules', 'matches.html': 'pg-matches', 'box.html': 'pg-box'
};

test('ogni pagina con la barra del sito carica temi.css e temi.js e ha la classe nb sul body', () => {
    for (const [file, classe] of Object.entries(PAGINE_CON_BARRA)) {
        const h = docs(file);
        assert.match(h, /<link rel="stylesheet" href="temi\.css">/, `${file}: temi.css`);
        assert.match(h, /<script src="temi\.js"><\/script>/, `${file}: temi.js`);
        assert.match(h, new RegExp(`<body class="nb ${classe}[ "]`), `${file}: classe del body`);
        // temi.js parte presto (nell'<head>, o subito dopo i fogli) per applicare il tema prima del primo disegno
        const corpo = h.indexOf('<body');
        assert.ok(h.indexOf('temi.js') < corpo || file === 'hub.html', `${file}: temi.js dopo il body`);
        // lo stile dei temi viene dopo quello della pagina: a parità di peso vince lui
        const fogliPagina = [...h.matchAll(/<link rel="stylesheet" href="(style-[^"]+\.css)">/g)].map(m => h.indexOf(m[0]));
        for (const pos of fogliPagina) assert.ok(pos < h.indexOf('temi.css'), `${file}: temi.css prima di un foglio di pagina`);
    }
});

test('index, hub e players caricano anche lo stile nuovo del contenuto, dopo temi.css', () => {
    for (const file of ['index.html', 'hub.html', 'players.html']) {
        const h = docs(file);
        assert.match(h, /<link rel="stylesheet" href="nb-pagine\.css">/, file);
        assert.ok(h.indexOf('temi.css') < h.indexOf('nb-pagine.css'), file);
    }
});

test('hub.html: lo stato della stagione non cancella le classi dello stile (nb, pg-hub)', () => {
    const h = docs('hub.html');
    assert.doesNotMatch(h, /document\.body\.className\s*=/);
    assert.match(h, /classList\.add\(`status-\$\{status\.toLowerCase\(\)\}`\)/);
});

test('il body delle pagine con i temi non viene riscritto da nessuno script della pagina', () => {
    for (const file of Object.keys(PAGINE_CON_BARRA)) {
        assert.doesNotMatch(docs(file), /document\.body\.className\s*=/, file);
    }
});

test('il profilo ha la sezione del selettore, il collegamento dalla testata e lo monta con TemiSito', () => {
    const h = docs('profile.html');
    assert.match(h, /id="pf-tema"/);
    assert.match(h, /id="pf-tema-corpo"/);
    assert.match(h, /href="#pf-tema"/);
    assert.match(h, /TemiSito\.montaSelettore\(window, document\.getElementById\('pf-tema-corpo'\)\)/);
    // lo script di montaggio viene dopo il contenitore e dopo temi.js
    assert.ok(h.indexOf('montaSelettore') > h.indexOf('id="pf-tema-corpo"'));
    assert.ok(h.indexOf('montaSelettore') > h.indexOf('<script src="temi.js">'));
});

test('temi.js scrive nel profilo solo il campo temaSito (due punti: la scelta, e la scelta fatta mentre il profilo si leggeva)', () => {
    assert.match(js, /ref\(`players\/\$\{stato\.chiave\}\/info`\)\.update\(\{ temaSito: t \}\)/);
    assert.match(js, /ref\(`players\/\$\{chiave\}\/info`\)\.update\(\{ temaSito: stato\.tema \}\)/);
    assert.equal((js.match(/\.update\(/g) || []).length, 2);
    assert.equal((js.match(/\.set\(/g) || []).length, 0);
    assert.equal((js.match(/\.remove\(\)/g) || []).length, 1, 'solo il foglio dei caratteri viene tolto dalla pagina');
});

test('lo script è valido e non usa nulla che manchi nel browser (UMD: self, module, document)', () => {
    assert.doesNotThrow(() => new vm.Script(js, { filename: 'temi.js' }));
    assert.match(js, /typeof self !== 'undefined' \? self : this/);
    assert.match(js, /if \(typeof module === 'object' && module\.exports\) module\.exports = M;/);
});

// ---------- Lo stile del contenuto ----------
test('ogni selettore pg-* di nb-pagine.css corrisponde a una classe messa su un body', () => {
    const usate = new Set([...pagineCss.matchAll(/body\.(pg-[a-z]+)/g)].map(m => m[1]));
    const messe = new Set(Object.values(PAGINE_CON_BARRA));
    for (const c of usate) assert.ok(messe.has(c), `${c} non è su nessuna pagina`);
    for (const c of ['pg-index', 'pg-hub', 'pg-players']) assert.ok(usate.has(c), `${c} non ha regole`);
});

test('lo stile del contenuto prende ombre, angoli, rotazioni e caratteri dal tema: nessun nero o ombra fissi nelle nuove regole', () => {
    // nelle regole nuove le ombre sono var(--nb-sh-*), mai 4px 4px 0 #000 scritti a mano
    assert.doesNotMatch(pagineCss, /box-shadow:\s*\d+px\s+\d+px\s+0/);
    assert.doesNotMatch(pagineCss, /border-radius:\s*(?!50%)[1-9]/, 'gli angoli vengono da --nb-raggio (solo i cerchi, 50%, sono fissi)');
    // le rotazioni si moltiplicano per --nb-rot (così il tema arcade le azzera)
    // (0deg è "dritto"; 360deg è il giro del caricatore, un'animazione e non un'inclinazione)
    const rotazioni = [...pagineCss.matchAll(/rotate\(([^)]*)\)/g)].map(m => m[1]).filter(r => !/^(0|360)deg$/.test(r.trim()));
    for (const r of rotazioni) assert.match(r, /--nb-rot|var\(--random-deg/, `rotazione fissa: rotate(${r})`);
});

test('hub su finestre medie (901-1250px): sparisce la colonna vuota di sinistra, così la pagina non scorre di lato', () => {
    const m = /@media \(min-width: 901px\) and \(max-width: 1250px\)\s*\{([\s\S]*?)\n\}/.exec(pagineCss);
    assert.ok(m, 'blocco per le finestre medie mancante');
    assert.match(m[1], /body\.pg-hub \.hub-container > \.hub-new-layout \{ grid-template-columns: minmax\(0, 1fr\) max-content !important/);
    assert.match(m[1], /#registration-buttons-container \{ display: none; \}/);
    assert.match(m[1], /padding-left: calc\(var\(--nb-ads\) \+ 28px\) !important/, 'le pubblicità restano libere grazie al padding');
});

test('le card dell\'index si adattano alla larghezza (da 236 a 300px) e sotto i 1050px vanno in colonna', () => {
    assert.match(pagineCss, /width:\s*clamp\(236px, calc\(\(100vw - var\(--nb-ads\) - 60px - 2 \* var\(--nb-gap-card\)\) \/ 3\), 300px\)/);
    assert.match(pagineCss, /@media \(max-width: 1050px\)\s*\{[^}]*body\.pg-index[^}]*overflow-y: auto/s);
    assert.match(pagineCss, /@media \(max-width: 900px\)/);
    // la barra del titolo su telefono (scritta accorciata sotto i 520px) è un blocco unico in temi.css, per tutte le pagine
    assert.match(css, /@media \(max-width: 520px\)/);
});

test('i tasti in più (sfide, admin, Team Builder) stanno in un dock sopra al blocco del titolo che il tema alza, altrimenti non ricevono i clic', () => {
    const m = /body\.nb \.top-bar-inner \{[^}]*z-index:\s*(\d+)/.exec(css);
    assert.ok(m, 'blocco del titolo con z-index');
    const r = /\.tasti-alto \{[^}]*z-index:\s*(\d+)/.exec(css);
    assert.ok(r, 'regola del dock dei tasti mancante');
    assert.ok(Number(r[1]) > Number(m[1]), `z-index del dock (${r[1]}) deve superare quello del titolo (${m[1]})`);
    // il suono vive nella barra del titolo come "chip", non come tasto tondo fisso
    assert.match(css, /body\.nb \.top-bar > \.music-btn/);
});

test('il dock dei tasti in alto sta sopra la barra del titolo di ogni pagina (z-index della barra, altrimenti i tasti non ricevono i clic)', () => {
    const dock = /\.tasti-alto \{[^}]*z-index:\s*(\d+)/.exec(css);
    assert.ok(dock, 'z-index del dock');
    const zBarra = [];
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'docs')).filter(n => /^style-.*\.css$/.test(n) || n === 'nb-pagine.css')) {
        for (const m of docs(f).matchAll(/(?:^|\n)\.top-bar\s*\{[^}]*?z-index:\s*(\d+)/g)) zBarra.push({ f, z: Number(m[1]) });
    }
    assert.ok(zBarra.length > 0, 'trovata almeno una barra con z-index');
    for (const { f, z } of zBarra) assert.ok(Number(dock[1]) > z, `${f}: la barra (${z}) copre il dock (${dock[1]})`);
});

test('pagina pubblica: il menu a tendina è quello nuovo del sito (stesse regole di temi.css), non le linguette gialle', () => {
    const pub = docs('public.html');
    assert.match(pub, /<body class="pg-public">/);
    assert.match(pub, /href="temi\.css"/);
    assert.match(pub, /<script src="temi\.js"><\/script>/);
    assert.match(css, /:is\(body\.nb, body\.pg-public\) \.user-dropdown \.menu-item,/);
    assert.match(css, /:is\(body\.nb, body\.pg-public\) \.auth-interaction \{/);
});

test('replay di una partita: intestazione e scelta del set sono finestre del tema, i colori dei giocatori solo filetti (--vinc)', () => {
    const fin = docs('finestre.css');
    assert.match(fin, /#replayModal \.replay-mini-header \{/);
    assert.match(fin, /#replayModal \.set-lista \{/);
    assert.match(fin, /#replayModal \.gba-shell \{ filter: drop-shadow\(var\(--nb-sh-l/);
    assert.match(fin, /linear-gradient\(to top, var\(--vinc, #555\) 0 9px, var\(--nb-carta/);
    const m = docs('matches.html');
    assert.doesNotMatch(m, /miniHeader\.style\.(backgroundColor|boxShadow|border)/, 'niente stili fissi scritti nel JS');
    assert.doesNotMatch(m, /class="btn-set[^"]*"[^>]*style="background-color/, 'il tasto del set non ha lo sfondo pieno');
    assert.match(m, /setProperty\('--vinc'/);
});

test('hub: la finestra PICK A TEAM e il fumetto della "i" seguono il tema (nessun verde/rosso pieno, nessun cerchio nero)', () => {
    const fin = docs('finestre.css');
    assert.match(fin, /\.modal-neubrutal \.team-option\.selected \{[^}]*var\(--nb-verde/);
    assert.match(fin, /\.modal-neubrutal \.info-icon \{[^}]*var\(--nb-giallo/);
    assert.match(fin, /\.team-preview-tooltip \.tp-pkm \{/);
    assert.match(docs('hub.html'), /class="tp-titolo"/);
});
