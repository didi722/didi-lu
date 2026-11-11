'use strict';
// Le finestre del Box:
//   - il dettaglio del team si chiude con la X o con un clic sullo sfondo, non con un clic dentro la finestra (prima ogni clic dentro, anche sulla card di un Pokémon, la chiudeva);
//   - ogni modale del Box (login, dettaglio del team, scheda del Pokémon, assistente, Team Builder, importa/esporta, etichette, cartella) ha la X in alto a destra
//     e si chiude con un clic sullo sfondo, ma non se la pressione è cominciata dentro la finestra (selezionare un testo trascinando fuori);
//   - la card di un Pokémon nel dettaglio apre la scheda del Pokémon, e Esc chiude un livello alla volta;
//   - l'assistente del Team Builder (la prima fase: scelta del formato) è una finestra come le altre, nello stile del tema.
// Sono controlli sul markup e sul codice di box.html e dei fogli di stile: il comportamento si prova nel browser.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const box = docs('box.html');
const stile = docs('style-box.css');
const dettagli = docs('dettagli.css');
const apertura = id => (box.match(new RegExp(`<div id="${id}"[^>]*>`)) || [''])[0];
const funzione = nome => {
    const da = box.indexOf(`function ${nome}`);
    assert.ok(da >= 0, nome);
    const fine = box.indexOf('\nfunction ', da + 10);
    return box.slice(da, fine < 0 ? undefined : fine);
};

test('il dettaglio del team si chiude con la X o con un clic sul velo, non con un clic dentro la finestra', () => {
    const velo = apertura('teamModal');
    assert.ok(velo, 'il velo del dettaglio c\'è');
    assert.match(velo, /onclick="if \(clicSulloSfondo\(event, this\)\) chiudiTeamModal\(\)"/, 'solo se il bersaglio è il velo stesso (i clic dentro la finestra lo raggiungono ma non lo chiudono)');
    assert.match(box, /<span class="close-modal" id="closeModal" onclick="chiudiTeamModal\(\)">/, 'la X chiude');
    for (const m of box.matchAll(/window\.addEventListener\('click'/g)) {
        assert.doesNotMatch(box.slice(m.index, m.index + 160), /chiudiTeamModal/, 'nessun ascoltatore globale che chiude per un clic qualunque');
    }
});

test('la card di un Pokémon nel dettaglio del team apre il Pokémon (con il mouse e da tastiera)', () => {
    const da = box.indexOf('class="modal-pkm-card modal-pkm-card-apri"');
    assert.ok(da > 0, 'la card ha la classe che la fa cliccare');
    const tag = box.slice(da, box.indexOf('>', box.indexOf('onmouseleave', da)));
    assert.match(tag, /onclick="preparaAperturaPkm\('\$\{team\.id\}', \$\{pIndex\}, '\$\{pkmNameUrl\}'\)"/, 'clic: la scheda di quel Pokémon di quel team');
    assert.match(tag, /role="button"/);
    assert.match(tag, /tabindex="0"/);
    assert.match(tag, /onkeydown="if \(event\.target === this && \(event\.key === 'Enter' \|\| event\.key === ' '\)\)/, 'Invio o spazio sulla card (non sugli elementi dentro)');
    assert.match(dettagli, /#teamModal \.modal-pkm-card-apri \{ cursor: pointer; \}/);
    assert.match(dettagli, /#teamModal \.modal-pkm-card-apri:focus-visible/);
    // preparaAperturaPkm cerca il Pokémon per indice nel team aperto: lo stesso indice della card
    assert.match(funzione('preparaAperturaPkm'), /team\.pokemon\[pkmIndex\][^]*apriPkmDettaglio\(team\.pokemon\[pkmIndex\], pkmNameUrl, pkmIndex\)/);
});

test('la scheda del Pokémon si chiude con la X o toccando fuori, non con un clic dentro; Esc chiude un livello alla volta', () => {
    assert.match(apertura('pkmDetailModal'), /onclick="if \(clicSulloSfondo\(event, this\)\) chiudiPkmModal\(\)"/);
    assert.match(box, /<span class="close" onclick="chiudiPkmModal\(\)">/);
    const esc = box.slice(box.indexOf("if (e.key !== \"Escape\") return;") - 120, box.indexOf("if (e.key !== \"Escape\") return;") + 620);
    assert.match(esc, /if \(document\.querySelector\('\.bt-pop:not\(\[hidden\]\)'\)\) return;/, 'con il pannello dei badge aperto Esc chiude quello (da solo) e non il dettaglio');
    assert.match(esc, /chiudiPkmModal\(\);\s*else chiudiTeamModal\(\);/, 'prima la scheda del Pokémon, poi il dettaglio');
    // la frecce sinistra/destra restano, Esc non è più duplicato dentro lo stesso gestore
    assert.doesNotMatch(box, /e\.key === "Escape"\) \{\s*chiudiTeamModal\(\);\s*\}\s*\}\s*\}\);/);
});

// ---------- l'assistente del Team Builder ----------
test('l\'assistente: velo, finestra con la X e spiegazione; si chiude con la X o toccando il velo, non il bordo della finestra', () => {
    const velo = apertura('helper-modal-overlay');
    assert.match(velo, /role="dialog"/);
    assert.match(velo, /onclick="inizializzaChiusuraHelper\(event\)"/);
    assert.match(box, /<span class="format-close-btn" role="button" aria-label="Close" title="Close">&times;<\/span>/);
    assert.match(box, /<p class="format-modal-hint">/, 'dice cosa fare');
    assert.doesNotMatch(box, /<span class="format-close-btn"[^>]*style=/, 'la X non ha stili in linea: li decide il foglio');
    const chiusura = funzione('inizializzaChiusuraHelper');
    assert.match(chiusura, /closest\('\.format-close-btn'\)/);
    assert.match(chiusura, /event\.target\.id === 'helper-modal-overlay' && clicSulloSfondo\(event, event\.target\)/);
    assert.doesNotMatch(chiusura, /format-modal-wrapper/, 'il margine della finestra (che ora è la carta) non chiude');
    assert.match(box, /<div id="helper-pkm-grid" class="explorer-pkm-scroll-container"><\/div>/, 'vuota davvero: così il foglio mostra il messaggio iniziale');
});

test('l\'assistente: striscia nera con i tre pallini e la X gialla, carta con la mezzatinta, tutto sulle variabili del tema', () => {
    const da = stile.indexOf("L'ASSISTENTE DEL TEAM BUILDER");
    assert.ok(da > 0);
    const s = stile.slice(da);
    for (const v of ['--nb-ink', '--nb-carta', '--nb-tip-bg', '--nb-giallo', '--nb-raggio', '--nb-font-titoli', '--nb-font-testo', '--nb-motivo', '--nb-sh-l', '--nb-sh-m', '--nb-sh-s', '--nb-rot']) {
        assert.ok(s.includes(`var(${v},`), `${v} con il suo ripiego`);
    }
    assert.match(s, /#helper-modal-overlay \.format-modal-wrapper::before \{[^}]*#ff5f57[^}]*#febc2e[^}]*#28c840/, 'i tre pallini');
    assert.match(s, /#helper-modal-overlay \.format-close-btn \{[^}]*background: var\(--hm-giallo\)/, 'la X gialla');
    assert.match(s, /#helper-modal-overlay \.format-modal-container \{[^}]*grid-template-columns: minmax\(280px, 340px\) minmax\(0, 1fr\)/, 'filtri a sinistra, Pokémon a destra');
    assert.match(s, /explorer-pkm-scroll-container:empty::before/, 'messaggio prima di scegliere il formato');
    assert.match(s, /\.helper-placeholder-row:not\(:empty\)/, 'i messaggi della griglia si leggono');
});

test('l\'assistente: i temi cambiano colori, ombre, angoli e caratteri, non le misure', () => {
    const da = stile.indexOf("L'ASSISTENTE DEL TEAM BUILDER");
    const s = stile.slice(da);
    // niente larghezze, altezze, margini o spessori dei bordi che dipendano dal tema (--nb-kx/ky/bk sono solo nelle ombre)
    const misure = s.match(/(?:width|height|padding|margin|border(?:-[a-z]+)?|gap):[^;]*var\(--nb-(?!ink|carta)[^)]*\)/g) || [];
    assert.deepEqual(misure.filter(m => !/raggio/.test(m)), [], misure.join(' | '));
});

test('l\'assistente sul telefono: schede in pila, la finestra scorre con il velo, nella striscia solo il titolo corto', () => {
    const da = stile.indexOf("L'ASSISTENTE DEL TEAM BUILDER");
    const s = stile.slice(da);
    const tel = s.slice(s.indexOf('@media (max-width: 900px)'));
    assert.match(tel, /#helper-modal-overlay \.format-modal-container \{ grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(tel, /#helper-modal-overlay \.format-modal-wrapper \{ max-height: none/);
    assert.match(tel, /flex-wrap: wrap !important/, 'ricerca e ordine vanno a capo: le imposta una riga in linea del codice');
    assert.match(s, /@media \(max-width: 560px\)[^]*content: "TEAM BUILDER"/);
});

// ---------- tutti i modali: la X in alto a destra e il clic sullo sfondo ----------
const vm = require('node:vm');
const estrai = (da, a) => { const i = box.indexOf(da); const j = box.indexOf(a, i + da.length); assert.ok(i >= 0 && j > i, `non trovo ${da}`); return box.slice(i, j); };

test('clicSulloSfondo: chiude solo se il clic e la pressione sono sullo sfondo; un testo selezionato trascinando fuori dalla finestra non la chiude', () => {
    const ascoltatori = {};
    const ctx = { window: { addEventListener: (tipo, f, cattura) => { (ascoltatori[tipo] = ascoltatori[tipo] || []).push(f); } } };
    vm.createContext(ctx);
    vm.runInContext(estrai('let ultimaPressione = null;', 'function toggleLoginModal') + '\nthis.clicSulloSfondo = clicSulloSfondo;', ctx);
    const sfondo = { nome: 'sfondo' }, finestra = { nome: 'finestra' };
    const premi = bersaglio => ascoltatori.pointerdown.forEach(f => f({ target: bersaglio }));
    const clic = bersaglio => { const e = { target: bersaglio }; const esito = ctx.clicSulloSfondo(e, sfondo); ascoltatori.click.forEach(f => f(e)); return esito; };
    premi(sfondo); assert.equal(clic(sfondo), true, 'pressione e clic sullo sfondo: chiude');
    premi(finestra); assert.equal(clic(finestra), false, 'un clic dentro la finestra non chiude');
    premi(finestra); assert.equal(clic(sfondo), false, 'pressione dentro e rilascio fuori (selezione di un testo): il clic nasce sullo sfondo ma non chiude');
    assert.equal(clic(sfondo), true, 'senza una pressione registrata (clic da programma) chiude: la memoria si azzera a ogni clic');
    assert.equal(ctx.clicSulloSfondo({ target: sfondo }, null), false, 'senza sfondo non chiude');
});

test('login, etichette, cartella, Team Builder: il clic sullo sfondo passa dal controllo della pressione (niente più confronti nudi con il bersaglio)', () => {
    assert.match(apertura('login-modal'), /onclick="if \(clicSulloSfondo\(event, this\)\) toggleLoginModal\(\)"/);
    assert.match(box, /fondo\.addEventListener\('click', e => \{ if \(clicSulloSfondo\(e, fondo\)\) fondo\.remove\(\); \}\);/, 'etichette');
    assert.match(box, /f\.addEventListener\('click', e => \{ if \(clicSulloSfondo\(e, f\)\) chiudiCartella\(\); \}\);/, 'cartella');
    assert.match(box, /overlay\.addEventListener\('click', \(e\) => \{\s*if \(clicSulloSfondo\(e, overlay\)\) tbChiediChiusura\(\);/, 'Team Builder');
    assert.doesNotMatch(box, /if \(e\.target === (fondo|f|overlay)\)/, 'nessun clic sullo sfondo rimasto senza il controllo');
    // l'importa/esporta Showdown del builder chiude alla pressione sullo sfondo (non c'è il problema del trascinamento)
    assert.match(box, /dialogo\.addEventListener\('mousedown', e => \{ if \(e\.target === dialogo\) tbChiudiShowdown\(\); \}\);/);
});

test('ogni modale ha la X in alto a destra: login, dettaglio, scheda, assistente, Team Builder, importa/esporta, etichette, cartella', () => {
    assert.match(box, /<div id="login-modal"[^]*?<span class="close-modal" onclick="toggleLoginModal\(\)">&times;<\/span>/);
    assert.match(box, /<span class="close-modal" id="closeModal" onclick="chiudiTeamModal\(\)">&times;<\/span>/);
    assert.match(box, /<span class="close" onclick="chiudiPkmModal\(\)">&times;<\/span>/);
    assert.match(box, /<span class="format-close-btn" role="button" aria-label="Close" title="Close">&times;<\/span>/);
    assert.match(box, /<button type="button" class="tb-close" onclick="tbChiediChiusura\(\)" aria-label="Close">&times;<\/button>/);
    assert.match(box, /<button type="button" class="tb-sd-x" aria-label="Close" onclick="tbChiudiShowdown\(\)">&times;<\/button>/);
    // etichette e cartella: la X sta nella testata, con la stessa forma delle altre (bollino giallo che diventa rosso)
    assert.match(box, /<div class="etichette-testa">\s*<h3>[^]*?<\/h3>\s*<button type="button" class="x-modale etichette-x" data-azione="chiudi" aria-label="Close" title="Close">&times;<\/button>\s*<\/div>/);
    assert.match(box, /querySelectorAll\('\[data-azione="chiudi"\]'\)\.forEach\(b => \{ b\.onclick = \(\) => fondo\.remove\(\); \}\)/, 'la X e "Done" chiudono');
    assert.match(box, /<div class="cartella-testa"><h2><\/h2><button type="button" class="x-modale cartella-chiudi" aria-label="Close" title="Close">&times;<\/button><\/div>/);
    const vista = docs('box-vista.css');
    assert.match(vista, /\.x-modale \{[^}]*background: var\(--nb-giallo, #ffbd44\)/, 'gialla');
    assert.match(vista, /\.x-modale:hover \{[^}]*background: var\(--nb-rosso, #ff4444\)/, 'rossa al passaggio');
    assert.match(vista, /\.etichette-testa \{[^}]*justify-content: space-between/, 'titolo a sinistra, X a destra');
});

// ---------- il Team Builder sul telefono (browser) ----------
test('Team Builder da telefono: caselle in fila sopra il pannello a tutta larghezza (solo browser: l\'app ha il suo layout), sprite più piccolo', () => {
    const da = stile.indexOf('TEAM BUILDER · telefono in verticale (browser)');
    assert.ok(da > 0);
    // viene dopo il layout affiancato (altrimenti quello, definito più in basso, vincerebbe)
    assert.ok(da > stile.indexOf('/* Layout affiancato per il contenuto dell\'overlay */'));
    const s = stile.slice(da);
    assert.match(s, /@media \(max-width: 640px\) \{/);
    assert.match(s, /html:not\(\.app-shell\) \.tb-content-container \{ flex-direction: column;/);
    assert.match(s, /html:not\(\.app-shell\) \.tb-slots \{[^}]*width: 100%; flex-direction: row;/);
    assert.match(s, /html:not\(\.app-shell\) \.tb-slot \{[^}]*flex: 1 1 0; min-width: 0; width: auto;/, 'sei caselle in una fila');
    assert.match(s, /html:not\(\.app-shell\) \.tb-body \{ width: 100%;/);
    assert.match(s, /html:not\(\.app-shell\) \.tb-side-sprite \{ width: 84px; height: 84px; \}/);
    assert.match(s, /html:not\(\.app-shell\) \.tb-row \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'strumento e abilità in colonna');
    // niente di tutto questo vale nell'app: lì il layout è in app-gioco-pagine.css
    assert.ok(!/@media[^{]*\{\s*\.tb-/.test(s), 'ogni regola è sotto html:not(.app-shell)');
});
