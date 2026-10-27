'use strict';
// Suoni e vibrazione dei tasti dell'app (docs/app-suoni.js): come in un gioco, ogni tocco fa un bip e una vibrazione leggera.
//   - la parte pura: che suono fa un elemento, le note e le vibrazioni sono coerenti, i nomi usati nelle pagine esistono;
//   - con una finestra finta: gli interruttori (suono e vibrazione) valgono subito, le note arrivano a WebAudio, il tocco suona al primo contatto;
//   - il caricamento: solo nell'app, e una volta sola.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../docs/app-suoni.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');

// ---------- la parte pura ----------

/** Un elemento finto: `suono` è il data-suono di sé o di un antenato */
function el({ suono, disabled = false, ariaDisabled = false, tipo = 1 } = {}) {
    const e = {
        nodeType: tipo, disabled,
        getAttribute: k => (k === 'aria-disabled' ? (ariaDisabled ? 'true' : null) : k === 'data-suono' ? suono ?? null : null),
        closest: sel => (sel === '[data-suono]' ? (suono !== undefined ? e : null) : null)
    };
    return e;
}

test('suonoDi: il "tocco" di tutti i giorni, quello scelto sull\'elemento (data-suono), nessuno se è spento o disattivato', () => {
    assert.equal(S.suonoDi(el()), 'tocco');
    assert.equal(S.suonoDi(el({ suono: 'indietro' })), 'indietro');
    assert.equal(S.suonoDi(el({ suono: 'ok' })), 'ok');
    assert.equal(S.suonoDi(el({ suono: 'nessuno' })), null, 'a un elemento si può togliere il suono');
    assert.equal(S.suonoDi(el({ suono: 'inventato' })), 'tocco', 'un nome che non esiste: il tocco normale');
    assert.equal(S.suonoDi(el({ disabled: true })), null, 'un tasto disattivato non risponde');
    assert.equal(S.suonoDi(el({ ariaDisabled: true })), null);
    assert.equal(S.suonoDi(el({ tipo: 3 })), null, 'un nodo di testo non è un tasto');
    assert.equal(S.suonoDi(null), null);
    assert.equal(S.suonoDi(undefined), null);
    // senza closest (ambiente strano): il tocco
    assert.equal(S.suonoDi({ nodeType: 1, getAttribute: () => null }), 'tocco');
});

test('le note e le vibrazioni: ogni suono ha le sue, valori ragionevoli (corti e piano: sono bip, non musica)', () => {
    assert.deepEqual(Object.keys(S.NOTE).sort(), ['apri', 'avvio', 'chiudi', 'errore', 'indietro', 'ok', 'scegli', 'tocco']);
    assert.deepEqual(Object.keys(S.VIBRA).sort(), Object.keys(S.NOTE).sort(), 'ogni suono ha la sua vibrazione (anche "nessuna": 0)');
    for (const [nome, note] of Object.entries(S.NOTE)) {
        assert.ok(note.length >= 1 && note.length <= 5, nome);
        let fine = 0;
        for (const [freq, quando, durata, forma, volume, finale] of note) {
            assert.ok(freq >= 100 && freq <= 1200, `${nome}: frequenza ${freq}`);
            assert.ok(quando >= 0 && quando < 1, `${nome}: inizio ${quando}`);
            assert.ok(durata > 0.03 && durata <= 0.45, `${nome}: durata ${durata}`);
            assert.ok(['square', 'triangle', 'sawtooth', 'sine'].includes(forma), `${nome}: forma d'onda ${forma}`);
            assert.ok(volume > 0 && volume <= 0.06, `${nome}: volume ${volume}`);
            if (finale !== undefined) assert.ok(finale >= 100 && finale <= 1200, `${nome}: frequenza finale`);
            fine = Math.max(fine, quando + durata);
        }
        assert.ok(fine <= 0.9, `${nome}: dura ${fine}s`);
    }
    for (const [nome, v] of Object.entries(S.VIBRA)) {
        const lista = [].concat(v);
        assert.ok(lista.every(n => Number.isFinite(n) && n >= 0 && n <= 60), `${nome}: ${lista}`);
    }
    assert.equal(S.VIBRA.avvio, 0, 'la schermata del titolo non vibra: ha già il suo suono');
    assert.deepEqual([S.CHIAVE_SUONO, S.CHIAVE_VIBRA], ['userMusicPref', 'appVibra']);
});

test('i nomi dei suoni scritti nelle pagine (data-suono) e chiesti dal codice (fai) esistono', () => {
    const nomi = new Set([...Object.keys(S.NOTE), 'nessuno']);
    const trovati = new Set();
    for (const f of fs.readdirSync(DOCS).filter(x => /\.(html|js)$/.test(x))) {
        const t = docs(f);
        for (const m of t.matchAll(/data-suono="(\w+)"/g)) trovati.add(m[1]);
        for (const m of t.matchAll(/data-suono['"],\s*'(\w+)'/g)) trovati.add(m[1]);
        if (/^app-(menu|comune|gioco|battaglia)\.js$/.test(f)) for (const m of t.matchAll(/\bfai\('(\w+)'\)|Suoni\.(?:fai|suona|vibra)\('(\w+)'\)|\bvibra\('(\w+)'\)/g)) trovati.add(m[1] || m[2] || m[3]);
    }
    assert.ok(trovati.size >= 6, 'nomi trovati: ' + [...trovati].join(', '));
    for (const n of trovati) assert.ok(nomi.has(n), `suono sconosciuto: ${n}`);
    // i selettori dei toccabili: tasti, link, schede, interruttori
    for (const sel of ['a[href]', 'button', '[role="tab"]', 'input[type="checkbox"]', 'select']) assert.ok(S.TOCCABILI.includes(sel), sel);
});

// ---------- con una finestra finta ----------

function audioFinto() {
    const registro = { contesti: [], resume: 0 };
    class AudioContext {
        constructor() { this.currentTime = 10; this.state = 'suspended'; this.destination = {}; this.oscillatori = []; registro.contesti.push(this); }
        resume() { this.state = 'running'; registro.resume++; }
        createOscillator() {
            const o = {
                frequenze: [], collegato: false,
                frequency: { setValueAtTime: (f, t) => o.frequenze.push(['set', f, t]), exponentialRampToValueAtTime: (f, t) => o.frequenze.push(['rampa', f, t]) },
                connect() { o.collegato = true; }, start: t => { o.inizio = t; }, stop: t => { o.fine = t; }
            };
            this.oscillatori.push(o);
            return o;
        }
        createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    }
    return { AudioContext, registro };
}

function finestra({ memoria = {}, audio = audioFinto(), vibrazione = true, conAudio = true, storageRotto = false } = {}) {
    const vibrazioni = [];
    const ascoltatori = {};
    const doc = { addEventListener: (ev, f, opz) => { (ascoltatori[ev] = ascoltatori[ev] || []).push({ f, opz }); } };
    const win = {
        document: doc,
        localStorage: storageRotto ? { getItem() { throw new Error('bloccato'); } } : { getItem: k => (k in memoria ? memoria[k] : null) },
        navigator: vibrazione ? { vibrate: p => { vibrazioni.push(p); return true; } } : {}
    };
    if (conAudio) win.AudioContext = audio.AudioContext;
    return { win, vibrazioni, ascoltatori, memoria, audio };
}

test('suona: le note vanno a WebAudio al momento giusto; il suono spento (userMusicPref = off) è silenzio; un nome sconosciuto non fa niente', () => {
    const f = finestra();
    const s = S.collega(f.win);
    assert.equal(s.acceso(), true);
    assert.equal(s.suona('ok'), true);
    const ctx = f.audio.registro.contesti[0];
    assert.equal(ctx.oscillatori.length, S.NOTE.ok.length);
    assert.deepEqual(ctx.oscillatori.map(o => o.inizio), S.NOTE.ok.map(n => 10 + n[1]), 'ogni nota parte a suo tempo');
    ctx.oscillatori.forEach((o, i) => assert.ok(o.fine > o.inizio + S.NOTE.ok[i][2], 'e si ferma dopo la sua durata'));
    assert.ok(ctx.oscillatori.every(o => o.collegato));
    assert.equal(f.audio.registro.resume, 1, 'il telefono parte con l\'audio sospeso: al primo suono si risveglia');
    // un solo contesto audio per tutta la pagina
    s.suona('tocco');
    assert.equal(f.audio.registro.contesti.length, 1);
    // il glissando (frequenza finale) è una rampa
    const tocco = ctx.oscillatori[ctx.oscillatori.length - 1];
    assert.deepEqual(tocco.frequenze.map(x => x[0]), ['set', 'rampa']);
    assert.equal(tocco.frequenze[1][1], 520);
    // il suono spento è silenzio; la scelta vale subito (si rilegge a ogni suono)
    const prima = ctx.oscillatori.length;
    f.memoria.userMusicPref = 'off';
    assert.equal(s.acceso(), false);
    assert.equal(s.suona('ok'), false);
    assert.equal(ctx.oscillatori.length, prima);
    f.memoria.userMusicPref = 'on';
    assert.equal(s.suona('ok'), true);
    assert.equal(s.suona('inventato'), false);
});

test('suona: senza WebAudio, con un WebAudio che si rifiuta o con lo storage bloccato non succede niente di brutto', () => {
    assert.equal(S.collega(finestra({ conAudio: false }).win).suona('ok'), true, 'senza audio: la richiesta è valida, le note si perdono');
    const rotto = finestra();
    rotto.win.AudioContext = function () { throw new Error('not allowed'); };
    assert.doesNotThrow(() => S.collega(rotto.win).fai('ok'));
    const senzaStorage = S.collega(finestra({ storageRotto: true }).win);
    assert.equal(senzaStorage.acceso(), true, 'senza memoria si riparte da acceso');
    assert.equal(senzaStorage.vibraAcceso(), true);
    assert.doesNotThrow(() => senzaStorage.fai('tocco'));
    // un'onda che WebAudio non accetta: l'errore resta dentro
    const f = finestra();
    f.audio.AudioContext.prototype.createOscillator = () => { throw new Error('boh'); };
    assert.equal(S.collega(f.win).suona('ok'), false);
});

test('vibra: il disegno del suo nome; spenta nelle impostazioni (appVibra = off) o dove il telefono non vibra (iPhone) non fa niente; "avvio" non vibra', () => {
    const f = finestra();
    const s = S.collega(f.win);
    assert.equal(s.vibra('tocco'), true);
    assert.equal(s.vibra('ok'), true);
    assert.deepEqual(f.vibrazioni, [8, [14, 40, 20]]);
    assert.equal(s.vibra('avvio'), false, 'nessuna vibrazione per il titolo');
    assert.equal(s.vibra('inventato'), false);
    f.memoria.appVibra = 'off';
    assert.equal(s.vibraAcceso(), false);
    assert.equal(s.vibra('tocco'), false);
    assert.equal(f.vibrazioni.length, 2);
    // iPhone: niente navigator.vibrate
    const iphone = S.collega(finestra({ vibrazione: false }).win);
    assert.equal(iphone.vibra('tocco'), false);
    // vibrate che lancia un errore (permessi): resta dentro
    const f2 = finestra();
    f2.win.navigator.vibrate = () => { throw new Error('blocked'); };
    assert.equal(S.collega(f2.win).vibra('tocco'), false);
    // fai = suono + vibrazione, ciascuno per conto suo
    const g = finestra({ memoria: { userMusicPref: 'off' } });
    S.collega(g.win).fai('scegli');
    assert.deepEqual(g.vibrazioni, [12], 'suono spento, vibrazione accesa');
    assert.equal(g.audio.registro.contesti.length, 0, 'e l\'audio non si sveglia nemmeno');
});

test('il tocco: al primo contatto (pointerdown, in cattura) su qualcosa di toccabile; i tasti destri del mouse e il resto della pagina no', () => {
    const f = finestra();
    S.collega(f.win);
    const [giu] = f.ascoltatori.pointerdown;
    assert.deepEqual(giu.opz, { capture: true, passive: true }, 'prima di chiunque altro, senza rallentare lo scorrimento');
    const bersaglio = (toccabile, suono) => ({
        closest: sel => (sel === S.TOCCABILI ? (toccabile ? el({ suono }) : null) : null)
    });
    giu.f({ pointerType: 'touch', button: 0, target: bersaglio(true) });
    assert.equal(f.vibrazioni.length, 1, 'un tasto: tocco');
    assert.equal(f.audio.registro.contesti[0].oscillatori.length, 1);
    giu.f({ pointerType: 'touch', button: 0, target: bersaglio(true, 'indietro') });
    assert.deepEqual(f.vibrazioni, [8, 8]);
    assert.equal(f.audio.registro.contesti[0].oscillatori.length, 3, 'e il suono "indietro" ha due note');
    giu.f({ pointerType: 'touch', button: 0, target: bersaglio(true, 'nessuno') });
    assert.equal(f.vibrazioni.length, 2, 'un elemento muto resta muto');
    giu.f({ pointerType: 'touch', button: 0, target: bersaglio(false) });
    assert.equal(f.vibrazioni.length, 2, 'lo sfondo non suona');
    giu.f({ pointerType: 'mouse', button: 2, target: bersaglio(true) });
    assert.equal(f.vibrazioni.length, 2, 'il tasto destro del mouse no');
    giu.f({ pointerType: 'mouse', button: 0, target: bersaglio(true) });
    assert.equal(f.vibrazioni.length, 3, 'il sinistro sì');
    assert.doesNotThrow(() => giu.f({ pointerType: 'touch', button: 0, target: null }));
    assert.doesNotThrow(() => giu.f({ pointerType: 'touch', button: 0, target: {} }));
});

// ---------- il caricamento ----------

function caricaNelBrowser({ app, prima } = {}) {
    const html = { classList: { contains: c => c === 'app' && !!app } };
    const ascoltatori = [];
    const sandbox = { document: { documentElement: html, addEventListener: (ev, f) => ascoltatori.push(ev) }, localStorage: { getItem: () => null }, navigator: {} };
    sandbox.self = sandbox;
    if (prima) sandbox.Suoni = prima;
    vm.runInNewContext(docs('app-suoni.js'), sandbox);
    return { sandbox, ascoltatori };
}

test('nel browser: window.Suoni c\'è sempre; con la classe app (nell\'app) è già collegato ai tocchi e offre fai/suona/vibra, altrimenti resta inerte; due caricamenti non si pestano', () => {
    const app = caricaNelBrowser({ app: true });
    assert.ok(app.sandbox.Suoni);
    for (const k of ['suona', 'vibra', 'fai', 'audio', 'acceso', 'vibraAcceso']) assert.equal(typeof app.sandbox.Suoni[k], 'function', k);
    assert.deepEqual(app.ascoltatori, ['pointerdown']);
    const sito = caricaNelBrowser({ app: false });
    assert.ok(sito.sandbox.Suoni);
    assert.equal(sito.sandbox.Suoni.fai, undefined, 'nel sito normale non fa niente');
    assert.deepEqual(sito.ascoltatori, []);
    // già caricato: non si sostituisce
    const gia = { mio: true };
    const doppio = caricaNelBrowser({ app: true, prima: gia });
    assert.equal(doppio.sandbox.Suoni, gia);
    assert.deepEqual(doppio.ascoltatori, []);
});

test('app.js carica i suoni in ogni pagina dell\'app (anche battaglia, accesso e menù) e solo lì', () => {
    const js = docs('app.js');
    assert.match(js, /if \(modo\) \{ caricaScript\(doc, 'app-suoni\.js'\);/);
    for (const f of fs.readdirSync(DOCS).filter(x => x.endsWith('.html'))) assert.doesNotMatch(docs(f).replace(/<!--[\s\S]*?-->/g, ''), /app-suoni\.js/, `${f}: arriva da app.js`);
});
