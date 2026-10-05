'use strict';
// Le finestre del Box:
//   - il dettaglio del team si chiude solo con la X (prima ogni clic dentro la finestra, anche sulla card di un Pokémon, la chiudeva);
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

test('il dettaglio del team non si chiude con un clic sul velo né dentro la finestra: solo la X', () => {
    const velo = apertura('teamModal');
    assert.ok(velo, 'il velo del dettaglio c\'è');
    assert.doesNotMatch(velo, /onclick/, 'nessun clic sul velo (che raccoglie anche i clic dentro la finestra) chiude il dettaglio');
    assert.match(box, /<span class="close-modal" id="closeModal" onclick="chiudiTeamModal\(\)">/, 'la X chiude');
    assert.doesNotMatch(box, /window\.addEventListener\('click'[^]*?chiudiTeamModal\(\)/, 'niente chiusura cliccando fuori');
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
    assert.match(apertura('pkmDetailModal'), /onclick="if \(event\.target === this\) chiudiPkmModal\(\)"/);
    assert.match(box, /<span class="close" onclick="chiudiPkmModal\(\)">/);
    const esc = box.slice(box.indexOf("if (e.key !== \"Escape\") return;") - 120, box.indexOf("if (e.key !== \"Escape\") return;") + 420);
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
    assert.match(chiusura, /event\.target\.id === 'helper-modal-overlay'/);
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
