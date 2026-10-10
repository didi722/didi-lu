'use strict';
// Le schede di dettaglio (squadra e Pokémon) e i tooltip "coach" del sito:
// - dettagli.js: colori dei tipi, lettura del record W/L, ritocchi sul contenuto (con un DOM finto);
// - tooltip.js: dove si posa il fumetto, niente "passaggio del mouse" sui dispositivi touch;
// - i fogli (dettagli.css, tooltip.css) e i collegamenti nelle pagine.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../docs/dettagli.js');
const T = require('../docs/tooltip.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const dettagliCss = docs('dettagli.css');
const tooltipCss = docs('tooltip.css');
const locali = html => [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]).filter(h => !/^https?:/.test(h));
const scriptLocali = html => [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(h => !/^https?:/.test(h));

// ---------- collegamenti ----------
test('le quattro pagine con la scheda squadra caricano dettagli.css (prima di mobile.css) e dettagli.js', () => {
    for (const p of ['box', 'hub', 'matches', 'public']) {
        const html = docs(p + '.html');
        const fogli = locali(html);
        assert.ok(fogli.includes('dettagli.css'), `${p}: manca dettagli.css`);
        assert.ok(fogli.indexOf('dettagli.css') < fogli.indexOf('mobile.css'), `${p}: dettagli.css deve stare prima di mobile.css`);
        assert.ok(fogli.indexOf('dettagli.css') > fogli.findIndex(f => /^style-/.test(f)), `${p}: dettagli.css deve stare dopo il foglio della pagina`);
        assert.ok(scriptLocali(html).includes('dettagli.js'), `${p}: manca dettagli.js`);
    }
});

test('ogni pagina del sito (non la battaglia) carica i tooltip coach, prima di mobile.css dove c\'è', () => {
    for (const p of ['index', 'hub', 'players', 'profile', 'stats', 'formats', 'rules', 'matches', 'box', 'admin', 'public']) {
        const html = docs(p + '.html');
        const fogli = locali(html);
        assert.ok(fogli.includes('tooltip.css'), `${p}: manca tooltip.css`);
        assert.ok(scriptLocali(html).includes('tooltip.js'), `${p}: manca tooltip.js`);
        if (fogli.includes('mobile.css')) assert.ok(fogli.indexOf('tooltip.css') < fogli.indexOf('mobile.css'), `${p}: tooltip.css prima di mobile.css`);
    }
    assert.ok(!docs('battle.html').includes('tooltip.js'), 'la battaglia ha i suoi fumetti');
});

test('Box e pagina pubblica caricano le statistiche e i fiocchi (statistiche.js prima di fiocchi.js)', () => {
    for (const p of ['box', 'public']) {
        const s = scriptLocali(docs(p + '.html'));
        assert.ok(s.includes('statistiche.js') && s.includes('fiocchi.js'), `${p}: mancano statistiche.js o fiocchi.js`);
        assert.ok(s.indexOf('statistiche.js') < s.indexOf('fiocchi.js'), `${p}: ordine degli script`);
    }
});

test('le pagine usano i fiocchi calcolati: lo scaffale con il progresso solo nel Box, le medagliette vinte ovunque; niente più soglie fisse nel codice', () => {
    for (const p of ['box', 'public']) {
        const html = docs(p + '.html');
        assert.match(html, /id="pkm-fiocchi"/, `${p}: manca l'area dei fiocchi`);
        assert.match(html, /Fiocchi\.riempiMini\(/, `${p}: mancano le medagliette (sulle card e nella scheda del Pokémon)`);
        assert.match(html, /data-fiocchi-pkm="\$\{pIndex\}"/, `${p}: manca la casella delle medagliette`);
        assert.match(html, /window\.squadraAperta = team/, `${p}: i fiocchi sono del Pokémon DI QUEL team`);
    }
    // il progresso (lo scaffale con le barre e "cosa manca") si vede solo nel Box del giocatore: negli altri posti, medagliette e basta
    assert.match(docs('box.html'), /Fiocchi\.montaScaffale\(/, 'box: lo scaffale con il progresso');
    assert.doesNotMatch(docs('public.html'), /Fiocchi\.montaScaffale\(|htmlScaffale/, 'public: niente progresso, solo le medagliette vinte');
    // la card dell'allenatore apre la scheda di un Pokémon senza passare dalla scheda squadra: deve dire di che team è
    assert.match(docs('public-card.js'), /window\.squadraAperta = team;[\s\S]{0,160}window\.apriPkmDettaglio\(/, 'public-card.js: i fiocchi del Pokémon sono quelli del suo team');
    const pub = docs('public.html');
    assert.ok(!/maxwonstrike[^\n]*>= 8|maxcleanstrike[^\n]*>= 5/.test(pub), 'le vecchie soglie sui badge salvati non ci sono più');
    assert.ok(!pub.includes('ribbons-floating-sidebar'), 'la vecchia barra dei fiocchi è sparita');
});

// ---------- dettagli.js: parti pure ----------
test('coloreTipo: i diciotto tipi, senza badare a maiuscole e spazi; altrimenti null', () => {
    assert.equal(Object.keys(D.COLORI_TIPO).length, 18);
    assert.equal(D.coloreTipo('Ghost'), '#6666bb');
    assert.equal(D.coloreTipo(' fire '), '#ff4422');
    assert.equal(D.coloreTipo('shadow'), null);
    assert.equal(D.coloreTipo(null), null);
});

test('leggiRecord: "9 - 3", "20-8" e le percentuali; niente numeri → null', () => {
    assert.deepEqual(D.leggiRecord('9 - 3'), { v: 9, p: 3, tot: 12, percentuale: 75 });
    assert.deepEqual(D.leggiRecord('20-8'), { v: 20, p: 8, tot: 28, percentuale: 71 });
    assert.equal(D.leggiRecord('0 - 0').percentuale, null);
    assert.equal(D.leggiRecord('2 – 1').v, 2);              // trattino lungo
    assert.equal(D.leggiRecord('n/d'), null);
    assert.equal(D.leggiRecord(undefined), null);
});

test('htmlRecord, htmlBarra e htmlTotale', () => {
    assert.equal(D.htmlRecord({ v: 9, p: 3 }), '<span class="td-v">9</span><span class="td-sep">-</span><span class="td-p">3</span>');
    const barra = D.htmlBarra({ percentuale: 75 });
    assert.match(barra, /75% wins/);
    assert.match(barra, /style="width:75%"/);
    assert.equal(D.sommaStat([60, 75, 90, 105, 120, 135]), 585);
    assert.equal(D.htmlTotale([1, 2, 3]), '<div class="stat-total"><span>Total</span><b>6</b></div>');
});

// ---------- dettagli.js: ritocchi su un DOM finto ----------
const nodo = (extra = {}) => ({ dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, classList: [], ...extra });
function voce(etichetta, valore) {
    const strong = nodo({ textContent: valore, innerHTML: valore });
    return nodo({ querySelector: sel => (sel === 'span' ? { textContent: etichetta } : sel === 'strong' ? strong : null), strong });
}
function finestraFinta({ card, testa, righe = [], stat }) {
    return {
        querySelectorAll: sel => {
            if (sel === '.modal-pkm-card, .pkm-modal-grid') return card ? [card] : [];
            if (sel === '.stat-row') return righe;
            if (sel === '.modal-header-container') return testa ? [testa] : [];
            return [];
        },
        querySelector: sel => (sel === '#single-stats' ? stat || null : null)
    };
}
const rigaStat = (nome, valore) => nodo({ querySelectorAll: () => [{ textContent: nome }, { textContent: String(valore) }] });

test('ritocca: la card prende il colore del primo tipo, una sola volta', () => {
    const card = nodo({ querySelectorAll: () => [{ classList: ['type-badge', 'ghost'] }, { classList: ['type-badge', 'psychic'] }] });
    const f = finestraFinta({ card });
    D.ritocca(f);
    assert.equal(card.style.props['--tipo'], '#6666bb');
    assert.equal(card.dataset.tipoApplicato, 'ghost');
    card.style.props['--tipo'] = 'toccato';
    D.ritocca(f);
    assert.equal(card.style.props['--tipo'], 'toccato', 'la seconda passata non rifà il lavoro');
});

test('ritocca: finché i tipi non sono arrivati la card resta com\'è, poi si aggiorna', () => {
    let badge = [];
    const card = nodo({ querySelectorAll: () => badge });
    const f = finestraFinta({ card });
    D.ritocca(f);
    assert.equal(card.dataset.tipoApplicato, undefined);
    badge = [{ classList: ['type-badge', 'fire'] }];
    D.ritocca(f);
    assert.equal(card.style.props['--tipo'], '#ff4422');
});

test('ritocca: il riepilogo colora vittorie e sconfitte e aggiunge la barra della percentuale', () => {
    const wl = voce('W/L', '9 - 3'), sets = voce('Sets W/L', '20 - 8'), punti = voce('Points', '0'), giocate = voce('Played', '12');
    const banner = { querySelectorAll: () => [wl, sets, punti, giocate] };
    const inseriti = [];
    const testa = nodo({ querySelector: sel => (sel === '.team-score-banner' ? banner : null), insertAdjacentHTML: (pos, html) => inseriti.push([pos, html]) });
    const f = finestraFinta({ testa });
    D.ritocca(f);
    assert.match(wl.strong.innerHTML, /td-v">9<.*td-p">3</);
    assert.match(sets.strong.innerHTML, /td-v">20<.*td-p">8</);
    assert.equal(punti.strong.innerHTML, '0', 'i punti restano un numero solo');
    assert.equal(giocate.strong.innerHTML, '12');
    assert.equal(inseriti.length, 1);
    assert.equal(inseriti[0][0], 'beforeend');
    assert.match(inseriti[0][1], /75% wins/);
    D.ritocca(f);
    assert.equal(inseriti.length, 1, 'la barra si aggiunge una volta sola');
});

test('ritocca: senza partite giocate (0 - 0) niente barra; un riepilogo senza W/L non dà errore', () => {
    const wl = voce('W/L', '0 - 0');
    const inseriti = [];
    const testa = nodo({ querySelector: () => ({ querySelectorAll: () => [wl] }), insertAdjacentHTML: (p, h) => inseriti.push(h) });
    D.ritocca(finestraFinta({ testa }));
    assert.equal(inseriti.length, 0);
    const senza = nodo({ querySelector: () => null });
    assert.doesNotThrow(() => D.ritocca(finestraFinta({ testa: senza })));
});

test('ritocca: ogni barra delle statistiche riceve il suo valore e il totale compare con sei righe', () => {
    const nomi = [['HP', 60], ['ATK', 75], ['DEF', 90], ['SPA', 105], ['SPD', 120], ['SPE', 135]];
    const righe = nomi.map(([n, v]) => rigaStat(n, v));
    const inseriti = [];
    const stat = { querySelector: () => null, querySelectorAll: () => righe, insertAdjacentHTML: (p, h) => inseriti.push(h) };
    D.ritocca(finestraFinta({ righe, stat }));
    assert.deepEqual(righe.map(r => r.style.props['--v']), ['60', '75', '90', '105', '120', '135']);
    assert.equal(inseriti.length, 1);
    assert.match(inseriti[0], /<b>585<\/b>/);
    // il fumetto con tre righe soltanto (o un tooltip) non prende il totale
    const poche = righe.slice(0, 3).map(r => r);
    const stat2 = { querySelector: () => null, querySelectorAll: () => poche, insertAdjacentHTML: (p, h) => inseriti.push(h) };
    D.ritocca(finestraFinta({ righe: [], stat: stat2 }));
    assert.equal(inseriti.length, 1);
});

// ---------- tooltip.js ----------
test('posiziona: sotto l\'elemento e centrato; se sotto non c\'è posto, sopra', () => {
    const vista = { w: 1000, h: 700 };
    const sotto = T.posiziona({ left: 400, top: 100, right: 500, bottom: 140 }, { w: 200, h: 50 }, vista);
    assert.deepEqual(sotto, { left: 350, top: 150, sopra: false });
    const sopra = T.posiziona({ left: 400, top: 600, right: 500, bottom: 640 }, { w: 200, h: 80 }, vista);
    assert.deepEqual(sopra, { left: 350, top: 510, sopra: true });
});

test('posiziona: resta sempre dentro lo schermo (bordi, fumetto più grande dello spazio)', () => {
    const vista = { w: 400, h: 300 };
    assert.equal(T.posiziona({ left: 0, top: 50, right: 20, bottom: 70 }, { w: 200, h: 40 }, vista).left, T.MARGINE);
    assert.equal(T.posiziona({ left: 380, top: 50, right: 400, bottom: 70 }, { w: 200, h: 40 }, vista).left, 400 - 200 - T.MARGINE);
    const alto = T.posiziona({ left: 100, top: 10, right: 140, bottom: 30 }, { w: 100, h: 290 }, vista);
    assert.ok(alto.top >= T.MARGINE && alto.top + 290 <= 300 - 0);
});

test('avvia: senza "passaggio del mouse" (touch) o senza matchMedia non registra nulla', () => {
    let registrati = 0;
    const doc = { addEventListener: () => registrati++ };
    assert.equal(T.avvia({ document: doc, matchMedia: () => ({ matches: false }), addEventListener() {} }), null);
    assert.equal(T.avvia({ document: doc }), null);
    assert.equal(T.avvia({}), null);
    assert.equal(registrati, 0);
});

test('avvia: con il mouse il title passa nel fumetto coach e torna al suo posto', () => {
    const ascoltatori = {};
    const creati = [];
    const doc = {
        body: { appendChild: e => creati.push(e) },
        createElement: () => ({ className: '', style: {}, classList: { add() { this.visibile = true; }, remove() { this.visibile = false; } }, setAttribute() {}, offsetWidth: 120, offsetHeight: 30 }),
        addEventListener: (ev, f) => { ascoltatori[ev] = f; }
    };
    const attributi = { title: 'Edit team' };
    const bottone = {
        getAttribute: k => (k in attributi ? attributi[k] : null),
        setAttribute: (k, v) => { attributi[k] = v; },
        removeAttribute: k => { delete attributi[k]; },
        getBoundingClientRect: () => ({ left: 100, top: 100, right: 140, bottom: 130 }),
        contains: n => n === bottone, matches: () => false, closest: sel => (sel === '[title]' ? bottone : null)
    };
    const win = { document: doc, matchMedia: () => ({ matches: true }), innerWidth: 1000, innerHeight: 700, addEventListener() {} };
    T.avvia(win);
    ascoltatori.mouseover({ target: bottone });
    assert.equal(attributi.title, undefined, 'il fumetto del browser non deve comparire');
    assert.equal(attributi['data-tip-titolo'], 'Edit team');
    assert.equal(creati.length, 1);
    assert.equal(creati[0].textContent, 'Edit team');
    assert.equal(creati[0].className, 'tip-coach tip-globale');
    ascoltatori.mouseout({ target: bottone, relatedTarget: null });
    assert.equal(attributi.title, 'Edit team', 'il title torna com\'era');
    assert.equal(attributi['data-tip-titolo'], undefined);
});

// ---------- schede intere nello schermo (PC) ----------
test('zoomPer: 1 se la scheda ci sta già, altrimenti il rapporto, mai sotto il minimo; dati non validi → 1', () => {
    assert.equal(D.zoomPer(574, 597), 1);
    assert.equal(D.zoomPer(700, 600), 0.857);
    assert.equal(D.zoomPer(1243, 597), D.ZOOM_MINIMO, 'una finestra bassissima non rimpicciolisce oltre il minimo leggibile');
    assert.equal(D.zoomPer(900, 300, 0.5), 0.5);
    for (const [n, d] of [[0, 600], [600, 0], [NaN, 600], [600, -5], [undefined, undefined]]) assert.equal(D.zoomPer(n, d), 1);
    assert.ok(D.ZOOM_MINIMO >= 0.7 && D.ZOOM_MINIMO < 1);
});

// finestra e documento finti: la scheda alta "alto" px a zoom 1, e un rettangolo che si riduce con lo zoom come nel browser
function schedaFinta({ larghezza = 1279, altezza = 631, display = 'flex', alto = 574 } = {}) {
    const classi = new Set();
    const contenuto = { style: { zoom: '' }, getBoundingClientRect() { return { height: alto * Number(this.style.zoom || 1) }; } };
    const finestra = {
        classList: { contains: c => classi.has(c), toggle: (c, on) => { if (on) classi.add(c); else classi.delete(c); } },
        querySelector: sel => (sel === '.modal-content' ? contenuto : null)
    };
    const win = { innerWidth: larghezza, innerHeight: altezza, getComputedStyle: () => ({ display, paddingTop: '14px', paddingBottom: '20px' }) };
    return { win, finestra, contenuto, intera: () => classi.has('dt-intera') };
}

test('adatta: se la scheda ci sta nessuno zoom e la finestra è "intera" (non scorre)', () => {
    const x = schedaFinta({ alto: 574 });
    D.adatta(x.win, x.finestra);
    assert.equal(x.contenuto.style.zoom, '');
    assert.equal(x.intera(), true);
});

test('adatta: se è troppo alta la riduce quanto basta per farla entrare', () => {
    const x = schedaFinta({ alto: 650 });          // disponibile: 631 - 14 - 20 = 597
    D.adatta(x.win, x.finestra);
    assert.equal(x.contenuto.style.zoom, '0.918');
    assert.equal(x.intera(), true);
});

test('adatta: oltre il minimo non rimpicciolisce più: la scheda scorre (non è "intera")', () => {
    const x = schedaFinta({ alto: 1243 });
    D.adatta(x.win, x.finestra);
    assert.equal(x.contenuto.style.zoom, String(D.ZOOM_MINIMO));
    assert.equal(x.intera(), false);
});

test('adatta: telefono (≤ 900px) o finestra bassissima: niente zoom, la scheda scorre; finestra chiusa: non tocca nulla', () => {
    for (const cfg of [{ larghezza: 390, altezza: 844 }, { larghezza: 932, altezza: 430 }, { larghezza: 1279, altezza: 500 }]) {
        const x = schedaFinta({ ...cfg, alto: 1500 });
        x.contenuto.style.zoom = '0.8';
        D.adatta(x.win, x.finestra);
        assert.equal(x.contenuto.style.zoom, '', `${cfg.larghezza}x${cfg.altezza}: lo zoom torna a 1`);
        assert.equal(x.intera(), false);
    }
    const chiusa = schedaFinta({ display: 'none', alto: 1500 });
    chiusa.contenuto.style.zoom = '0.9';
    D.adatta(chiusa.win, chiusa.finestra);
    assert.equal(chiusa.contenuto.style.zoom, '0.9');
});

test('avvia: due osservatori (contenuto e apertura), perché un secondo observe() sullo stesso nodo cancellerebbe il primo', () => {
    const src = docs('dettagli.js');
    assert.match(src, /contenuto\.observe\(f, \{ childList: true, subtree: true \}\)/);
    assert.match(src, /apertura\.observe\(f, \{ attributes: true, attributeFilter: \['style', 'class'\] \}\)/);
    assert.ok(!/attributes: true[^}]*subtree|subtree: true[^}]*attributes/.test(src), 'gli attributi vanno osservati solo sul contenitore: lo zoom è sull\'elemento interno e non deve rilanciare l\'osservatore');
});

// ---------- fogli ----------
test('dettagli.css: ogni disposizione della scheda Pokémon ha l\'area dei fiocchi (senza, la griglia si rompe)', () => {
    const aree = [...dettagliCss.matchAll(/grid-template-areas:([^;]*?)!important;/g)].map(m => m[1]);
    assert.ok(aree.length >= 3, 'disposizioni trovate: ' + aree.length);
    for (const a of aree) {
        assert.match(a, /ribbons/, 'manca "ribbons" in ' + a.replace(/\s+/g, ' '));
        for (const nome of ['header', 'weakness', 'info-strips', 'stats', 'moves']) assert.match(a, new RegExp(nome), `manca ${nome}`);
    }
});

test('dettagli.css: su PC le schede sono compatte e la scheda Pokémon ha i fiocchi in colonna a destra a tutta altezza', () => {
    const pc = /@media \(min-width: 901px\) \{([\s\S]*?)\n\}\n/.exec(dettagliCss);
    assert.ok(pc, 'sezione per PC mancante');
    assert.match(pc[1], /#teamModal\.dt-intera,\s*#pkmDetailModal\.dt-intera \{ overflow: hidden !important; \}/);
    assert.match(pc[1], /#teamModal \.modal-pkm-info \{ flex-direction: row; flex-wrap: wrap;/, 'abilità e strumento sulla stessa riga');
    const largo = /@media \(min-width: 1000px\) \{([\s\S]*?)\n\}\n/.exec(dettagliCss);
    assert.ok(largo, 'sezione per schermi larghi mancante');
    assert.match(largo[1], /"weakness header info-strips ribbons"\s*"moves\s+moves\s+stats\s+ribbons"/, 'i fiocchi occupano la colonna di destra per tutte e due le righe');
    assert.match(largo[1], /\.fiocco \{\s*display: grid;/, 'un fiocco è una riga compatta');
    assert.match(largo[1], /\.fiocco \.fiocco-tip \{ left: auto; right: calc\(100% \+ 14px\)/, 'il fumetto si apre a sinistra: a destra non c\'è spazio');
    // il telefono resta com'era: una colonna, i fiocchi subito dopo l'eroe
    assert.match(dettagliCss, /@media \(max-width: 900px\) \{\s*#pkmDetailModal \.pkm-modal-grid \{\s*grid-template-columns: minmax\(0, 1fr\) !important;\s*grid-template-areas:\s*"header"\s*"ribbons"/);
});

test('dettagli.css: la X è sempre visibile (a PC si chiudeva toccando fuori), il colore del tipo viene dalla variabile --tipo', () => {
    assert.match(dettagliCss, /#teamModal :is\(\.close-replay, \.close-modal, \.close\),[\s\S]*?visibility: visible !important/);
    assert.match(dettagliCss, /background: [^;]*var\(--tipo\)/);
    assert.match(dettagliCss, /--tipo: var\(--dt-accento\)/);
});

test('dettagli.css: usa le variabili del tema con i valori classici come ripiego', () => {
    for (const v of ['--nb-ink', '--nb-carta', '--nb-sh-m', '--nb-raggio', '--nb-rot', '--nb-font-titoli']) {
        assert.match(dettagliCss, new RegExp(`var\\(${v},`), `${v} senza ripiego`);
    }
});

test('tooltip.css: copre i fumetti non colorati (schede, anteprima squadra, regole del formato, Box, Stats, fiocchi)', () => {
    for (const sel of ['#teamModal .generic-tooltip', '#teamModal .stats-tooltip', '#teamModal .type-effectiveness-tooltip', '.team-preview-tooltip',
        '.format-rules-tooltip', '.pkm-hover-card', '.premio-tip', '.tb-bubble', '.tip-coach']) {
        assert.ok(tooltipCss.includes(sel), `manca ${sel}`);
    }
    // i fumetti colorati di proposito (mosse) non si toccano
    assert.ok(!/:is\([^)]*\.move-tooltip/.test(tooltipCss), 'i fumetti delle mosse restano colorati dal tipo');
    assert.match(tooltipCss, /#fffdf6/i, 'la carta calda del coach');
    assert.match(tooltipCss, /2px dashed/, 'il separatore tratteggiato del coach');
});

// ---------- finestre (login, scelta squadre, nuova stagione, sfida) ----------
const finestreCss = docs('finestre.css');
test('ogni pagina del sito carica finestre.css dopo il foglio della pagina e prima dei tooltip e di mobile.css', () => {
    for (const p of ['index', 'hub', 'players', 'profile', 'stats', 'formats', 'rules', 'matches', 'box', 'admin', 'public']) {
        const fogli = locali(docs(p + '.html'));
        assert.ok(fogli.includes('finestre.css'), `${p}: manca finestre.css`);
        assert.ok(fogli.indexOf('finestre.css') > fogli.findIndex(f => /^style-/.test(f)), `${p}: finestre.css dopo il foglio della pagina`);
        assert.ok(fogli.indexOf('finestre.css') < fogli.indexOf('tooltip.css'), `${p}: finestre.css prima di tooltip.css`);
    }
});

test('finestre.css: ogni finestra ha la sua striscia con la sua etichetta, e segue il tema (con i valori classici di ripiego)', () => {
    for (const nome of ['LOGIN', 'PICK A TEAM', 'CHALLENGE', 'NEW SEASON']) assert.match(finestreCss, new RegExp(`--fin-etichetta: "${nome}`), `manca l'etichetta ${nome}`);
    for (const v of ['--nb-ink', '--nb-raggio', '--nb-sh-l', '--nb-font-titoli', '--nb-tip-bg', '--nb-giallo']) assert.match(finestreCss, new RegExp(`var\\(${v},`), `${v} senza ripiego`);
    // il login cresce con il contenuto (con il bordo dentro la misura finiva con il bottone fuori dalla finestra)
    assert.match(finestreCss, /#login-modal \.modal-content \{[^}]*height: auto !important/);
});

// ---------- menu: la voce della pagina in cui si è ----------
const temi = require('../docs/temi.js');
test('temi.js paginaDi: il nome del file, qualunque cartella, query o maiuscola; una cartella senza file è index.html', () => {
    assert.equal(temi.paginaDi('/box.html'), 'box.html');
    assert.equal(temi.paginaDi('https://x.it/sito/Players.html?a=1#b'), 'players.html');
    assert.equal(temi.paginaDi('/'), 'index.html');
    assert.equal(temi.paginaDi(''), 'index.html');
    assert.equal(temi.paginaDi(undefined), 'index.html');
});

test('temi.js segnaPagina: solo la voce del menu di questa pagina riceve aria-current, le altre lo perdono', () => {
    const voci = ['index.html', 'box.html', 'players.html'].map(href => {
        const attributi = { href };
        return { getAttribute: k => (k in attributi ? attributi[k] : null), setAttribute: (k, v) => { attributi[k] = v; }, removeAttribute: k => { delete attributi[k]; }, attributi };
    });
    voci[0].attributi['aria-current'] = 'page';           // era la pagina di prima
    const doc = { querySelectorAll: sel => (sel === '.user-dropdown .menu-item[href]' ? voci : []) };
    assert.equal(temi.segnaPagina(doc, '/sito/box.html'), 1);
    assert.deepEqual(voci.map(v => v.attributi['aria-current']), [undefined, 'page', undefined]);
    assert.equal(temi.segnaPagina(doc, '/'), 1);
    assert.deepEqual(voci.map(v => v.attributi['aria-current']), ['page', undefined, undefined]);
    assert.equal(temi.segnaPagina({}, '/'), 0);
    assert.equal(temi.segnaPagina(null, '/'), 0);
});

test('temi.css: su PC il menu si adatta all\'altezza dello schermo (le nove voci stanno sempre tutte), sotto i 470px scorre', () => {
    const temiCss = docs('temi.css');
    assert.match(temiCss, /@media \(min-width: 901px\) \{\s*:is\(body\.nb, body\.pg-public\) \.user-dropdown \{\s*--mn-h: clamp\([^;]*100vh[^;]*\);\s*--mn-gap: clamp\([^;]*100vh[^;]*\);/);
    assert.match(temiCss, /:is\(body\.nb, body\.pg-public\) \.user-dropdown > :first-child \{ margin-top: 0 !important; \}/);
    assert.match(temiCss, /@media \(min-width: 901px\) and \(max-height: 470px\) \{\s*:is\(body\.nb, body\.pg-public\) \.user-dropdown \{[^}]*max-height: calc\(100vh - 100px\); overflow-y: auto/);
});

test('temi.css: la voce del menu della pagina corrente è nera e le voci hanno il loro colore', () => {
    const temiCss = docs('temi.css');
    assert.match(temiCss, /\.menu-item\[aria-current="page"\] \{[^}]*background: var\(--nb-ink\) !important/);
    assert.match(temiCss, /\.user-dropdown \.menu-item:nth-child\(8\) \{ --mi: var\(--nb-rosso\)/);
    assert.match(temiCss, /\.user-dropdown \.logout-btn \{[^}]*background: var\(--nb-rosso\) !important/);
});
