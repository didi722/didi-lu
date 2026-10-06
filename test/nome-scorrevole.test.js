'use strict';
// Nomi lunghi che scorrono (nome-scorrevole.js): niente puntini di sospensione, il nome va piano fino alla fine e torna piano indietro.
// Qui anche il tasto "Sign up" del profilo, che ora porta al riepilogo di iscrizione della home.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const NS = require('../docs/nome-scorrevole.js');

const leggi = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('un nome che ci sta non si muove; uno che sbordo scorre per quanto sbordo, piano', () => {
    assert.equal(NS.calcola(200, 150), null);
    assert.equal(NS.calcola(200, 200), null);
    assert.equal(NS.calcola(200, 201), null, 'un pixel di arrotondamento non fa scorrere nulla');
    assert.equal(NS.calcola(0, 300), null, 'un riquadro nascosto (larghezza 0) non si può misurare');
    const poco = NS.calcola(100, 130);
    assert.equal(poco.eccesso, 30);
    assert.equal(poco.durata, NS.DURATA_MINIMA, 'anche per pochi pixel la corsa non è mai veloce');
    const medio = NS.calcola(100, 400);
    assert.equal(medio.eccesso, 300);
    assert.ok(medio.durata > NS.DURATA_MINIMA && medio.durata <= NS.DURATA_MASSIMA);
    // più sbordo, più tempo; ma mai oltre il massimo
    assert.ok(NS.calcola(100, 500).durata >= medio.durata);
    assert.equal(NS.calcola(100, 5000).durata, NS.DURATA_MASSIMA);
    // la velocità del tratto vero (senza le soste) resta lenta: al massimo la costante
    for (const larg of [150, 250, 400]) {      // oltre il tetto di durata (nomi lunghissimi) il tratto va un po' più svelto, ma resta piano
        const r = NS.calcola(100, larg);
        const tragitto = r.durata * (1 - 2 * NS.QUOTA_FERMA);
        assert.ok(r.eccesso / tragitto <= NS.PIXEL_AL_SECONDO + 0.5, `${larg}px: ${Math.round(r.eccesso / tragitto)} px/s`);
    }
});

// un elemento finto, con quel che serve a applica()
function finto(larghezzaRiquadro, larghezzaTesto, riempimento = 0) {
    const classi = new Set(), stile = new Map();
    const figli = [];
    const doc = {
        createElement: () => { const sp = { children: [], classList: { contains: c => sp.className === c }, className: '', appendChild(f) { sp.children.push(f); }, get firstChild() { return null; }, offsetWidth: larghezzaTesto }; return sp; },
        defaultView: { getComputedStyle: () => ({ paddingLeft: `${riempimento}px`, paddingRight: `${riempimento}px` }) }
    };
    const el = {
        ownerDocument: doc, clientWidth: larghezzaRiquadro, children: figli,
        classList: { add: c => classi.add(c), remove: c => classi.delete(c), contains: c => classi.has(c) },
        style: { setProperty: (k, v) => stile.set(k, v), removeProperty: k => stile.delete(k) },
        get firstChild() { return null; }, appendChild: f => figli.push(f)
    };
    return { el, classi, stile };
}

test('applica(): il nome lungo prende la classe e le misure; se poi ci sta (finestra più larga) torna fermo', () => {
    const lungo = finto(180, 560, 14);
    assert.equal(NS.applica(lungo.el), true);
    assert.ok(lungo.classi.has('ns-attivo'));
    assert.equal(lungo.stile.get('--ns-eccesso'), `-${Math.ceil(560 - (180 - 28))}px`, 'conta il riempimento: scorre fino al bordo interno');
    assert.match(lungo.stile.get('--ns-durata'), /^\d+(\.\d)?s$/);

    lungo.el.clientWidth = 700;
    assert.equal(NS.applica(lungo.el), false);
    assert.ok(!lungo.classi.has('ns-attivo'));
    assert.equal(lungo.stile.has('--ns-eccesso'), false);

    const nascosto = finto(0, 500);
    assert.equal(NS.applica(nascosto.el), false, 'un elemento nascosto non si tocca');
});

test('il CSS: scorre avanti e indietro con una pausa a ogni estremo, senza puntini; chi chiede meno movimento ha i puntini', () => {
    const css = leggi('docs/nome-scorrevole.css');
    assert.match(css, /\.nome-scorrevole\.ns-attivo > \.ns-testo \{[^}]*animation: nomeScorrevole var\(--ns-durata, 6s\) ease-in-out infinite alternate/);
    assert.match(css, /@keyframes nomeScorrevole \{\s*0%, 16% \{[^}]*translate3d\(0, 0, 0\)[^}]*\}\s*84%, 100% \{[^}]*var\(--ns-eccesso, 0px\)/);
    assert.equal(16, Math.round(NS.QUOTA_FERMA * 100), 'la pausa del CSS è la stessa dei calcoli');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*text-overflow: ellipsis[^]*animation: none/);
    assert.match(css, /\.nome-scorrevole \{[^}]*text-overflow: clip/);
    // i temi non cambiano il movimento: nessuna regola del movimento negli altri fogli di stile
    assert.doesNotMatch(leggi('docs/temi.css'), /nomeScorrevole|ns-attivo/);
});

test('simulatore e card showdown: il nome lungo scorre, niente puntini', () => {
    const battle = leggi('docs/style-battle.css');
    const nome = /\.lato-nome \{[^}]*\}/.exec(battle)[0];
    const team = /\.lato-team \{[^}]*\}/.exec(battle)[0];
    assert.doesNotMatch(nome, /text-overflow: ellipsis/);
    assert.doesNotMatch(team, /text-overflow: ellipsis/);
    assert.match(leggi('docs/battle-extra.js'), /<h2 class="lato-nome nome-scorrevole"/);
    assert.match(leggi('docs/battle-extra.js'), /<p class="lato-team nome-scorrevole">/);
    const html = leggi('docs/battle.html');
    assert.match(html, /nome-scorrevole\.css/);
    assert.match(html, /<script src="nome-scorrevole\.js"><\/script>/);
    assert.match(html, /NomeScorrevole\.installa\('\.lato-nome, \.lato-team'\)/);

    const sd = /\.showdown-summary-card \.sd-nome \{[^}]*\}/.exec(leggi('docs/showdown.css'))[0];
    assert.doesNotMatch(sd, /text-overflow: ellipsis/);
    const matches = leggi('docs/matches.html');
    assert.equal((matches.match(/class="sd-nome nome-scorrevole"/g) || []).length, 2, 'i due giocatori della card');
    assert.match(matches, /nome-scorrevole\.css/);
    assert.match(matches, /NomeScorrevole\.installa\('\.showdown-summary-card \.nome-scorrevole'\)/);
});

test('profilo: "Sign up" porta al riepilogo di iscrizione della home, che si apre da solo; "Choose teams" resta sull\'hub', () => {
    const profilo = leggi('docs/profile.html');
    assert.match(profilo, /const iscrizione = `index\.html\?iscrizione=\$\{encodeURIComponent\(i\.stagione\)\}`;/);
    assert.match(profilo, /collegamento\('Sign up', 'pf-primario', iscrizione\)/);
    assert.match(profilo, /collegamento\('Choose teams', 'pf-primario', hub\)/);
    const index = leggi('docs/index.html');
    assert.match(index, /new URLSearchParams\(location\.search\)\.get\('iscrizione'\)/);
    assert.match(index, /await gestisciAccessoHub\(id, status, info\.name/);
    assert.match(index, /auth\.onAuthStateChanged\(async \(user\) => \{[^]{0,200}apriIscrizioneDaLink\(\);/, 'parte appena si sa chi è l\'utente');
    assert.match(index, /history\.replaceState\(null, '', location\.pathname\)/, 'ricaricando la pagina non si riapre');
});
