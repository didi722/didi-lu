'use strict';
// Vista del simulatore (battle-vista.js, battle-vista.css, battle.html): il colore dei neutri e la cronaca di Showdown mostrata o nascosta.
// E il resto di "il simulatore segue il tema del giocatore": niente ombre, rotazioni e caratteri scritti a mano, niente bande laterali nello schermo.
// Funzioni pure provate così come sono; i tasti e il pannello con un DOM finto minimo (non c'è jsdom). Per come viene a schermo serve un browser.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../docs/battle-vista.js');

const leggi = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');
const senzaCommenti = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

// ---------- colori ----------
const canale = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
function luminanza(hex) {
    const v = [0, 1, 2].map(i => { const c = canale(hex, i) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
const contrasto = (a, b) => { const [x, y] = [luminanza(a), luminanza(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('normalizzaColore: "#rrggbb" e "#rgb" in minuscolo, tutto il resto niente', () => {
    assert.equal(V.normalizzaColore('#E0568A'), '#e0568a');
    assert.equal(V.normalizzaColore('  #AbC '), '#aabbcc');
    for (const no of ['', 'red', '#12', '#12345', '#1234567', '#gggggg', 'e0568a', null, undefined, 5, {}]) assert.equal(V.normalizzaColore(no), null, String(no));
});

test('hslDa e hexDa si ricompongono (a meno di un livello per canale)', () => {
    for (const t of V.TINTE.map(x => x.colore).concat(['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#808080', '#123456'])) {
        const [h, s, l] = V.hslDa(t);
        const di_nuovo = V.hexDa(h, s, l);
        for (let i = 0; i < 3; i++) assert.ok(Math.abs(canale(t, i) - canale(di_nuovo, i)) <= 1, `${t} -> ${di_nuovo}`);
    }
});

test('neutriDa: carta chiarissima, crema un po\' meno, inchiostro quasi nero, tutti della stessa tinta', () => {
    assert.equal(V.neutriDa('non è un colore'), null);
    assert.equal(V.neutriDa(null), null);
    for (const { colore } of V.TINTE) {
        const n = V.neutriDa(colore);
        assert.match(n.carta, /^#[0-9a-f]{6}$/);
        const [h, s, l] = V.hslDa(colore);
        const [hc, , lc] = V.hslDa(n.carta), [hk, , lk] = V.hslDa(n.crema), [hi, , li] = V.hslDa(n.ink);
        assert.ok(Math.abs(lc - 0.94) < 0.01 && Math.abs(lk - 0.90) < 0.01 && Math.abs(li - 0.08) < 0.01, `luminosità fisse (${colore})`);
        if (s > 0.2) for (const x of [hc, hk, hi]) assert.ok(Math.min(Math.abs(x - h), 360 - Math.abs(x - h)) < 4, `la tinta resta quella di ${colore}`);
    }
});

test('neutriDa: qualunque colore si scelga il testo si legge (inchiostro su carta e su crema, contrasto da AAA)', () => {
    const prove = V.TINTE.map(x => x.colore).concat(['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#000000', '#ffffff', '#808080']);
    for (const c of prove) {
        const n = V.neutriDa(c);
        assert.ok(contrasto(n.ink, n.carta) >= 12, `${c}: inchiostro su carta ${contrasto(n.ink, n.carta).toFixed(1)}`);
        assert.ok(contrasto(n.ink, n.crema) >= 11, `${c}: inchiostro su crema ${contrasto(n.ink, n.crema).toFixed(1)}`);
    }
});

test('neutriDa: un grigio dà neutri grigi (r = g = b)', () => {
    for (const g of ['#808080', '#000000', '#ffffff', '#c0c0c0']) {
        const n = V.neutriDa(g);
        for (const x of [n.carta, n.crema, n.ink]) assert.ok(canale(x, 0) === canale(x, 1) && canale(x, 1) === canale(x, 2), `${g} -> ${x}`);
    }
});

test('le tinte proposte sono colori veri, con nomi diversi, e nessuna si chiama come la voce "Classic" che toglie la scelta', () => {
    assert.ok(V.TINTE.length >= 6);
    assert.equal(new Set(V.TINTE.map(t => t.id)).size, V.TINTE.length);
    assert.equal(new Set(V.TINTE.map(t => t.nome)).size, V.TINTE.length);
    for (const t of V.TINTE) { assert.equal(V.normalizzaColore(t.colore), t.colore, t.id); assert.notEqual(t.nome.toLowerCase(), 'classic'); }
});

// ---------- memoria del browser e pagina finta ----------
function memoriaFinta(iniziale = {}) {
    return { dati: { ...iniziale }, getItem(k) { return k in this.dati ? this.dati[k] : null; }, setItem(k, v) { this.dati[k] = String(v); }, removeItem(k) { delete this.dati[k]; } };
}

test('leggiScelte: valori validi ricordati, tutto il resto ignorato, memoria che lancia o manca = scelte di base', () => {
    const base = { colore: null, cronaca: 'visibile' };
    assert.deepEqual(V.leggiScelte(memoriaFinta()), base);
    assert.deepEqual(V.leggiScelte(null), base);
    assert.deepEqual(V.leggiScelte(memoriaFinta({ simNeutri: '#E0568A', simCronaca: 'nascosta' })), { colore: '#e0568a', cronaca: 'nascosta' });
    assert.deepEqual(V.leggiScelte(memoriaFinta({ simNeutri: 'rosso', simCronaca: 'boh' })), base);
    assert.deepEqual(V.leggiScelte({ getItem() { throw new Error('bloccata'); } }), base);
});

class ElFinto {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.figli = []; this.padre = null; this.ascoltatori = {}; this.hidden = false; this.title = ''; this.value = ''; this.focused = false; this.classi = new Set(); this.testo = ''; this.fermato = false; this.classList = { add: c => this.classi.add(c), remove: c => this.classi.delete(c), contains: c => this.classi.has(c), toggle: (c, on) => { if (on === undefined ? !this.classi.has(c) : on) this.classi.add(c); else this.classi.delete(c); } }; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.classi = new Set(String(v).split(/\s+/).filter(Boolean)); if (k === 'value') this.value = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    appendChild(c) { c.padre = this; this.figli.push(c); return c; }
    set textContent(v) { this.figli = []; this.testo = String(v); }
    addEventListener(tipo, f) { (this.ascoltatori[tipo] = this.ascoltatori[tipo] || []).push(f); }
    emetti(tipo, extra = {}) { const e = { target: this, key: undefined, stopPropagation: () => { e.fermato = true; }, ...extra }; (this.ascoltatori[tipo] || []).forEach(f => f(e)); return e; }
    closest(sel) { const c = sel.replace(/^\./, ''); for (let n = this; n; n = n.padre) if (n.classi && n.classi.has(c)) return n; return null; }
    focus() { this.focused = true; }
    dispatchEvent(ev) { this.eventi = (this.eventi || []).concat(ev.type); (this.ascoltatori[ev.type] || []).forEach(f => f(ev)); return true; }
    trova(f) { for (const x of this.figli) { if (f(x)) return x; const d = x.trova && x.trova(f); if (d) return d; } return null; }
    trovaTutti(f, fuori = []) { for (const x of this.figli) { if (f(x)) fuori.push(x); if (x.trovaTutti) x.trovaTutti(f, fuori); } return fuori; }
}

function paginaFinta({ app = false, memoria = {}, caricata = true } = {}) {
    const mem = memoriaFinta(memoria);
    const html = { props: {}, attrs: {}, style: null, classList: { contains: c => app && c === 'app' }, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } };
    html.style = { setProperty: (k, v) => { html.props[k] = v; }, removeProperty: k => { delete html.props[k]; } };
    const ids = {};
    for (const id of ['btn-cronaca', 'btn-colori', 'pannello-colori']) { ids[id] = new ElFinto(id === 'pannello-colori' ? 'div' : 'button'); }
    ids['pannello-colori'].hidden = true;
    ids['btn-cronaca'].setAttribute('aria-pressed', 'true');
    const radiceDoc = new ElFinto('doc');
    const doc = Object.assign(radiceDoc, { documentElement: html, readyState: caricata ? 'complete' : 'loading', createElement: tag => new ElFinto(tag), createTextNode: t => ({ testo: t }), getElementById: id => ids[id] || null });
    const radice = { document: doc, localStorage: mem, MouseEvent: class { constructor(tipo, init) { this.type = tipo; Object.assign(this, init); } } };
    return { radice, doc, html, mem, ids };
}

test('applicaColore: scrive le tre variabili del tema su <html> e le toglie quando la scelta torna "Classic"', () => {
    const { radice, html } = paginaFinta();
    const n = V.applicaColore(radice, '#e0568a');
    assert.deepEqual(html.props, { '--nb-carta': n.carta, '--nb-tip-bg': n.crema, '--nb-ink': n.ink });
    assert.equal(V.applicaColore(radice, null), null);
    assert.deepEqual(html.props, {});
    assert.equal(V.applicaColore(radice, 'rosso'), null);
    assert.deepEqual(html.props, {});
});

test('applicaCronaca: l\'attributo data-cronaca="nascosta" c\'è solo quando è nascosta', () => {
    const { radice, html } = paginaFinta();
    V.applicaCronaca(radice, 'nascosta');
    assert.equal(html.getAttribute('data-cronaca'), 'nascosta');
    V.applicaCronaca(radice, 'visibile');
    assert.equal(html.getAttribute('data-cronaca'), null);
});

test('nell\'app (html.app) non si applica niente: lo stile è quello dell\'app, anche se in memoria c\'è una scelta', () => {
    const { radice, html, ids, doc } = paginaFinta({ app: true, memoria: { simNeutri: '#e0568a', simCronaca: 'nascosta' } });
    V.avvia(radice);
    assert.deepEqual(html.props, {});
    assert.equal(html.getAttribute('data-cronaca'), null);
    assert.deepEqual(ids['btn-cronaca'].ascoltatori, {});
    assert.deepEqual(ids['btn-colori'].ascoltatori, {});
    assert.deepEqual(doc.ascoltatori, {});
});

test('avvia: le scelte ricordate si applicano subito (prima del primo disegno), i tasti si collegano a pagina pronta', () => {
    const { radice, html, ids, doc } = paginaFinta({ caricata: false, memoria: { simNeutri: '#2fbf7f', simCronaca: 'nascosta' } });
    V.avvia(radice);
    assert.equal(html.props['--nb-carta'], V.neutriDa('#2fbf7f').carta);
    assert.equal(html.getAttribute('data-cronaca'), 'nascosta');
    assert.deepEqual(ids['btn-cronaca'].ascoltatori, {}, 'i tasti ancora non ci sono: la pagina si sta caricando');
    doc.emetti('DOMContentLoaded');
    assert.equal(ids['btn-cronaca'].ascoltatori.click.length, 1);
    assert.equal(ids['btn-cronaca'].getAttribute('aria-pressed'), 'false', 'cronaca nascosta: il tasto è "spento"');
});

test('il tasto della cronaca: la nasconde e la mostra, e se lo ricorda', () => {
    const { radice, html, ids, mem } = paginaFinta();
    V.avvia(radice);
    const t = ids['btn-cronaca'];
    assert.equal(t.getAttribute('aria-pressed'), 'true');
    t.emetti('click');
    assert.equal(html.getAttribute('data-cronaca'), 'nascosta');
    assert.equal(mem.dati.simCronaca, 'nascosta');
    assert.equal(t.getAttribute('aria-pressed'), 'false');
    assert.equal(t.getAttribute('title'), 'Show the battle log');
    assert.equal(t.getAttribute('aria-label'), 'Show the battle log');
    assert.deepEqual(t.eventi, ['mouseout'], 'dopo il clic il fumetto dei title (tooltip.js) si chiude: non dice il contrario di com\'è adesso');
    t.emetti('click');
    assert.equal(html.getAttribute('data-cronaca'), null);
    assert.ok(!('simCronaca' in mem.dati), 'visibile è la scelta di base: non si scrive niente');
    assert.equal(t.getAttribute('aria-pressed'), 'true');
    assert.equal(t.getAttribute('title'), 'Hide the battle log');
});

test('il fumetto dei title (tooltip.js) tiene il title in data-tip-titolo mentre il mouse è sul tasto: il testo nuovo va lì, non torna il vecchio', () => {
    const { radice, ids } = paginaFinta();
    V.avvia(radice);
    const t = ids['btn-cronaca'];
    t.attrs['data-tip-titolo'] = 'Hide the battle log';      // com'è mentre tooltip.js lo mostra
    delete t.attrs.title;
    t.emetti('click');
    assert.equal(t.getAttribute('data-tip-titolo'), 'Show the battle log');
    assert.equal(t.getAttribute('title'), null, 'il title non va rimesso mentre il fumetto lo tiene: lo rimette lui, col testo nuovo');
});

test('il pannello dei colori: aprendolo si chiude il fumetto del tasto (non lo copre) e le tinte non hanno title (il nome è scritto sotto)', () => {
    const { radice, ids } = paginaFinta();
    V.avvia(radice);
    ids['btn-colori'].emetti('click');
    assert.deepEqual(ids['btn-colori'].eventi, ['mouseout']);
    for (const v of ids['pannello-colori'].trovaTutti(x => x.classi && x.classi.has('vc-tinta'))) assert.equal(v.getAttribute('title'), null, v.getAttribute('aria-label'));
    ids['btn-colori'].emetti('click');      // si richiude: il fumetto non c'entra
    assert.deepEqual(ids['btn-colori'].eventi, ['mouseout']);
});

test('il pannello dei colori: una voce "Classic" e le tinte, quella in uso è segnata', () => {
    const { radice, ids } = paginaFinta({ memoria: { simNeutri: '#e0568a' } });
    V.avvia(radice);
    const p = ids['pannello-colori'];
    const voci = p.trovaTutti(x => x.classi && x.classi.has('vc-tinta'));
    assert.equal(voci.length, V.TINTE.length + 1);
    assert.equal(voci[0].getAttribute('data-colore'), '');
    assert.deepEqual(voci.map(v => v.getAttribute('data-colore')).slice(1), V.TINTE.map(t => t.colore));
    const scelte = voci.filter(v => v.classi.has('scelta'));
    assert.equal(scelte.length, 1);
    assert.equal(scelte[0].getAttribute('data-colore'), '#e0568a');
    assert.equal(scelte[0].getAttribute('aria-checked'), 'true');
    assert.equal(voci.filter(v => v.getAttribute('aria-checked') === 'true').length, 1);
    assert.ok(p.trova(x => x.attrs && x.attrs.type === 'color'), 'e il colore a piacere');
});

test('scegliere un colore: i neutri cambiano, la scelta resta in memoria; "Classic" la toglie', () => {
    const { radice, html, ids, mem } = paginaFinta();
    V.avvia(radice);
    const lista = ids['pannello-colori'].trova(x => x.classi && x.classi.has('vc-lista'));
    const voce = col => lista.trova(x => x.classi && x.classi.has('vc-tinta') && x.getAttribute('data-colore') === col);
    const rosa = V.TINTE.find(t => t.id === 'rose').colore;
    lista.emetti('click', { target: voce(rosa) });
    assert.equal(html.props['--nb-ink'], V.neutriDa(rosa).ink);
    assert.equal(mem.dati.simNeutri, rosa);
    assert.ok(voce(rosa).classi.has('scelta'));
    lista.emetti('click', { target: voce('') });
    assert.deepEqual(html.props, {});
    assert.ok(!('simNeutri' in mem.dati));
    assert.ok(voce('').classi.has('scelta') && !voce(rosa).classi.has('scelta'));
});

test('il colore a piacere (input type=color) vale come una tinta; un valore sbagliato non cambia niente', () => {
    const { radice, html, ids, mem } = paginaFinta();
    V.avvia(radice);
    const libero = ids['pannello-colori'].trova(x => x.attrs && x.attrs.type === 'color');
    libero.value = '#336699';
    libero.emetti('input');
    assert.equal(mem.dati.simNeutri, '#336699');
    assert.equal(html.props['--nb-carta'], V.neutriDa('#336699').carta);
    libero.value = 'boh';
    libero.emetti('input');
    assert.ok(!('simNeutri' in mem.dati), 'un valore che non è un colore vale "Classic"');
    assert.deepEqual(html.props, {});
});

test('il pannello si apre dal tasto e si chiude con Esc, con un clic fuori, e non con un clic dentro', () => {
    const { radice, ids, doc } = paginaFinta();
    V.avvia(radice);
    const p = ids['pannello-colori'], t = ids['btn-colori'];
    assert.equal(p.hidden, true);
    const clic = t.emetti('click');
    assert.equal(clic.fermato, true, 'il clic sul tasto non arriva al documento (che lo chiuderebbe)');
    assert.equal(p.hidden, false);
    assert.equal(t.getAttribute('aria-expanded'), 'true');
    assert.ok(t.classi.has('aperto'));
    assert.equal(p.emetti('click').fermato, true, 'un clic dentro il pannello lo lascia aperto');
    doc.emetti('keydown', { key: 'a' });
    assert.equal(p.hidden, false);
    doc.emetti('keydown', { key: 'Escape' });
    assert.equal(p.hidden, true);
    assert.equal(t.focused, true, 'chiuso con Esc, il fuoco torna al tasto');
    assert.equal(t.getAttribute('aria-expanded'), 'false');
    t.emetti('click');
    assert.equal(p.hidden, false);
    doc.emetti('click');
    assert.equal(p.hidden, true);
    assert.ok(!t.classi.has('aperto'));
});

// ---------- battle.html, CSS e battle-layout.js ----------
const html = leggi('battle.html');
const css = leggi('style-battle.css');
const cssVista = leggi('battle-vista.css');
const cssPalestra = leggi('style-palestra-battaglia.css');
const cssReazioni = leggi('reazioni-live.css');
const layout = leggi('battle-layout.js');

test('battle.html carica il tema del giocatore prima dello stile del simulatore, e lo stile della vista dopo gli altri', () => {
    const i = nome => html.indexOf(`<link rel="stylesheet" href="${nome}">`);
    for (const nome of ['temi.css', 'style-battle.css', 'style-palestra-battaglia.css', 'tooltip.css', 'battle-vista.css']) assert.ok(i(nome) > 0, `${nome} non è collegato`);
    assert.ok(i('temi.css') < i('style-battle.css'), 'le variabili del tema devono esserci prima dello stile del simulatore');
    assert.ok(i('battle-vista.css') > i('style-battle.css') && i('battle-vista.css') > i('style-palestra-battaglia.css') && i('battle-vista.css') > i('tooltip.css'));
    const testa = html.slice(0, html.indexOf('</head>'));
    for (const script of ['temi.js', 'battle-vista.js']) assert.ok(testa.includes(`<script src="${script}"></script>`), `${script} va nell'<head>: le scelte si applicano prima del primo disegno`);
    assert.ok(testa.indexOf('src="temi.js"') < testa.indexOf('src="battle-vista.js"'));
});

test('i due tasti e il pannello sono nei servizi, dove stanno suono e schermo intero', () => {
    const servizi = html.slice(html.indexOf('<div class="servizi">'), html.indexOf('<!-- Colonne dei player'));
    for (const id of ['btn-cronaca', 'btn-colori', 'pannello-colori', 'btn-audio', 'btn-schermo-intero']) assert.ok(servizi.includes(`id="${id}"`), `#${id} non è nei servizi`);
    assert.match(servizi, /id="btn-cronaca"[^>]*aria-pressed="true"/);
    assert.match(servizi, /id="btn-colori"[^>]*aria-expanded="false"[^>]*aria-controls="pannello-colori"/);
    assert.match(servizi, /id="pannello-colori"[^>]*role="dialog"[^>]*hidden/);
    // gli id che battle-vista.js cerca ci sono tutti
    for (const m of leggi('battle-vista.js').matchAll(/getElementById\('([\w-]+)'\)/g)) assert.ok(html.includes(`id="${m[1]}"`), `battle-vista.js cerca #${m[1]}`);
});

test('nell\'app i tasti e il pannello non ci sono', () => {
    assert.match(cssVista, /html\.app :is\(\.btn-vista, \.pannello-colori\)\s*\{\s*display:\s*none\s*!important/);
    assert.match(html, /class="btn-audio btn-vista btn-cronaca"/);
    assert.match(html, /class="btn-audio btn-vista btn-colori"/);
});

test('cronaca nascosta: la colonna del log sparisce e il tavolo si ridisegna con una colonna in meno', () => {
    assert.match(cssVista, /html\[data-cronaca="nascosta"\] \.colonna-log\s*\{\s*display:\s*none/);
    // layout a colonna (telefono) e layout "una schermata": le aree della griglia non nominano più "log"
    const regole = [...cssVista.matchAll(/html\[data-[^{]*\[data-cronaca="nascosta"\][^{]*\.tavolo\s*\{([^}]*)\}/g)].map(m => m[1]).concat([...cssVista.matchAll(/html\[data-cronaca="nascosta"\] \.tavolo\s*\{([^}]*)\}/g)].map(m => m[1]));
    assert.ok(regole.length >= 3, 'servono le aree per il layout "una schermata", per il layout a colonna e per quello stretto');
    for (const r of regole) assert.ok(!/\blog\b/.test(r), `la griglia senza cronaca non deve nominare "log": ${r.trim()}`);
    assert.match(cssVista, /html\[data-modo="fit"\]\[data-cronaca="nascosta"\] \.tavolo\s*\{[^}]*grid-template-columns:\s*var\(--w-lato\) var\(--w-console\) var\(--w-lato\)/);
});

test('il tasto della cronaca spento si vede spento, quello dei colori aperto si vede aperto', () => {
    assert.match(cssVista, /\.btn-cronaca\[aria-pressed="false"\] svg\s*\{\s*opacity/);
    assert.match(cssVista, /\.btn-colori\.aperto\s*\{/);
    assert.match(cssVista, /\.pannello-colori\[hidden\]\s*\{\s*display:\s*none/);
});

test('cinque tasti (con le note del team) stanno nella colonna di un player su una riga: si stringono, restano quadrati', () => {
    const r = /\.servizi \.btn-audio\s*\{([^}]*)\}/.exec(cssVista);
    assert.ok(r, 'regola dei tasti dei servizi mancante');
    assert.match(r[1], /flex:\s*1 1 30px/);
    assert.match(r[1], /max-width:\s*38px/);
    assert.match(r[1], /aspect-ratio:\s*1/);
    assert.ok(5 * 30 + 4 * 6 <= 176, 'cinque tasti da 30px con gli spazi stanno nei 176px della colonna');
    assert.match(cssVista, /\.servizi\s*\{[^}]*gap:\s*10px 6px/);
});

test('nel browser lo schermo mostra solo il campo (440 × 360), senza le bande con nome e avatar; nell\'app resta intero', () => {
    assert.match(css, /html:not\(\.app\) \.palco \.leftbar,\s*html:not\(\.app\) \.palco \.rightbar\s*\{\s*display:\s*none/);
    assert.match(css, /html:not\(\.app\) \.palco\s*\{[^}]*width:\s*calc\(440px \* var\(--scala-campo, 1\)\)[^}]*height:\s*calc\(360px \* var\(--scala-campo, 1\)\)/);
    assert.match(css, /html:not\(\.app\) #campo\s*\{[^}]*translateX\(calc\(-100px \* var\(--scala-campo, 1\)\)\) scale\(var\(--scala-campo, 1\)\)/);
    // la regola di base (intera, 640) resta per l'app
    assert.match(css, /\.palco\s*\{[^}]*width:\s*640px/);
    // battle-layout.js: il campo è 440 nel browser, la scena intera 640 nell'app
    assert.match(layout, /LARGHEZZA_SCENA = 640, LARGHEZZA_CAMPO = 440/);
    assert.match(layout, /palcoBox\.clientWidth \/ LARGHEZZA_CAMPO/);
    assert.match(layout, /palcoBox\.clientWidth \/ LARGHEZZA_SCENA/);
    // la scala dello schermo si scrive prima di misurare il tavolo (la sua altezza dipende da lei)
    assert.ok(layout.indexOf("setAttribute('data-modo', 'fit');\n            scalaCampo();") > 0, 'scalaCampo() va chiamata subito dopo aver provato il layout "fit", prima di misurare');
});

test('il simulatore segue il tema: ombre, rotazioni e caratteri vengono dalle variabili --nb-* di temi.css', () => {
    const radice = senzaCommenti(css).match(/:root\s*\{([^}]*)\}/)[1];
    // i neutri e l'ambra sono quelli del tema, con il valore classico di riserva
    assert.match(radice, /--inchiostro:\s*var\(--nb-ink, #000\)/);
    assert.match(radice, /--carta:\s*var\(--nb-carta, #fff\)/);
    assert.match(radice, /--crema:\s*var\(--nb-tip-bg, #fffdf6\)/);
    assert.match(radice, /--ambra:\s*var\(--nb-giallo, #ffbd44\)/);
    assert.match(radice, /--raggio:\s*var\(--nb-raggio, 0px\)/);
    // le ombre: tutte le misure usate sono definite e seguono spostamento, sfumatura e colore del tema
    const usate = new Set();
    for (const f of [css, cssPalestra, cssVista]) for (const m of f.matchAll(/var\(--(shs?-\d+)\)/g)) usate.add(m[1]);
    assert.ok(usate.size >= 10);
    for (const v of usate) {
        const d = new RegExp(`--${v}:\\s*calc\\((\\d+)px \\* var\\(--nb-kx, 1\\)\\) calc\\(\\1px \\* var\\(--nb-ky, 1\\)\\) calc\\(\\d+px \\* var\\(--nb-bk, 0\\)\\) var\\(--nb-shcol${v.startsWith('shs') ? '-titolo' : ''}, `).exec(radice);
        assert.ok(d, `--${v} manca in :root o non segue il tema`);
        assert.equal(d[1], v.replace(/\D+/g, ''), `--${v}: lo spostamento deve essere quello del nome`);
    }
    // niente ombre piene, rotazioni (se non 0 o giri veri) e caratteri del sito scritti a mano
    for (const [nome, f] of [['style-battle.css', css], ['style-palestra-battaglia.css', cssPalestra], ['battle-vista.css', cssVista]]) {
        const s = senzaCommenti(f);
        assert.ok(!/box-shadow:\s*\d+px \d+px 0 var\(--inchiostro\)/.test(s), `${nome}: un'ombra piena scritta a mano (usare var(--sh-N))`);
        assert.ok(!/rotate\((?!0deg|90deg|-32deg)-?[\d.]+deg\)/.test(s), `${nome}: una rotazione che non segue --nb-rot`);
        assert.ok(!/font(-family)?:[^;{}]*(?<!var\(--nb-font-titoli, )(?<!var\(--nb-font-testo, )'(Josefin Sans|Montserrat)'/.test(s), `${nome}: un carattere scritto a mano (usare var(--nb-font-titoli / --nb-font-testo))`);
    }
    assert.match(css, /--nb-rot, 1/);
    assert.match(css, /var\(--nb-font-titoli, 'Josefin Sans', sans-serif\)/);
    assert.match(css, /var\(--nb-font-testo, 'Montserrat', sans-serif\)/);
});

test('gli angoli del tema (Soft) arrivano agli elementi del simulatore, con un tetto per quelli piccoli', () => {
    assert.match(css, /:is\(\.btn-hub, \.btn-audio, [^{]*\.console[^{]*\)\s*\{\s*border-radius:\s*var\(--raggio\)/);
    assert.match(css, /\.btn-audio\s*\{\s*--raggio:\s*min\(var\(--nb-raggio, 0px\), 12px\)/);
    assert.match(css, /html\[data-tema="morbido"\] \.console\s*\{\s*overflow:\s*hidden/);
});

test('i grigi del simulatore sono sfumature di inchiostro e carta: se i neutri prendono una tinta, anche i grigi', () => {
    const radice = senzaCommenti(css).match(/:root\s*\{([^}]*)\}/)[1];
    for (const v of ['--tenue', '--tenue-forte', '--tenue-scuro', '--grigio-bordo', '--grigio-ombra', '--grigio-pieno', '--grigio-pieno-2', '--grigio-scrollbar', '--grigio-vetro', '--sfondo-a', '--sfondo-b']) {
        assert.match(radice, new RegExp(`${v}:\\s*color-mix\\(in srgb, var\\(--(inchiostro|carta)\\) [\\d.]+%, var\\(--(inchiostro|carta)\\)\\)`), `${v} deve venire da inchiostro e carta`);
        assert.ok(senzaCommenti(css).split(`var(${v})`).length > 1, `${v} non è usata`);
    }
    // nel simulatore non restano i grigi e i bianchi scritti a mano (i colori di stato, di tipo e delle schede sono un'altra cosa)
    for (const vecchio of ['#8a8a8a', '#9a9a9a', '#e4e4e4', '#ececec', '#3a3a3a', '#555', '#666', '#333']) assert.ok(!new RegExp(`${vecchio}\\b`, 'i').test(senzaCommenti(css)), `style-battle.css ha ancora ${vecchio}`);
    // velo, esito e barra dei messaggi sullo schermo prendono la tinta dei neutri
    assert.match(css, /\.velo\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--crema\) 96%, transparent\)/);
    assert.match(css, /\.esito\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--inchiostro\) 25%, transparent\)/);
    assert.match(css, /\.palco \.messagebar\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--inchiostro\) 88%, transparent\)/);
});

test('le reazioni di chi guarda seguono il tema come i bottoni del simulatore', () => {
    assert.match(cssReazioni, /border-radius:\s*var\(--raggio, 0\)/);
    assert.match(cssReazioni, /box-shadow:\s*var\(--sh-3,/);
    assert.match(cssReazioni, /box-shadow:\s*var\(--sh-5,/);
    assert.match(cssReazioni, /rotate\(calc\(-1 \* var\(--nb-rot, 1\) \* 1deg\)\)/);
    assert.ok(!/font:[^;]*'Josefin Sans'/.test(cssReazioni.replace(/var\(--nb-font-titoli, 'Josefin Sans', sans-serif\)/g, '')), 'carattere scritto a mano');
});

test('le parentesi graffe dei CSS toccati sono in pari', () => {
    for (const [nome, f] of [['style-battle.css', css], ['battle-vista.css', cssVista], ['style-palestra-battaglia.css', cssPalestra], ['reazioni-live.css', cssReazioni]]) {
        let livello = 0;
        for (const c of senzaCommenti(f)) {
            if (c === '{') livello++;
            if (c === '}') livello--;
            assert.ok(livello >= 0, `${nome}: una } di troppo`);
        }
        assert.equal(livello, 0, `${nome}: parentesi non in pari`);
    }
});

test('i commenti del CSS non nascondono mai il resto: nessun "/*" dentro un commento e nessun commento lasciato aperto', () => {
    for (const [nome, f] of [['style-battle.css', css], ['battle-vista.css', cssVista], ['style-palestra-battaglia.css', cssPalestra], ['reazioni-live.css', cssReazioni]]) {
        const aperti = (f.match(/\/\*/g) || []).length, chiusi = (f.match(/\*\//g) || []).length;
        assert.equal(aperti, chiusi, `${nome}: ${aperti} aperture e ${chiusi} chiusure di commento`);
        assert.ok(!/\/\*(?:(?!\*\/)[\s\S])*?\/\*/.test(f), `${nome}: un commento ne apre un altro`);
    }
});
