// Le spiegazioni dei badge nel Box dell'app (docs/app-box-badge.js, app-gioco-pagine.css): niente progresso, solo nome, livello e cosa premia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../docs/app-box-badge.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

const el = (attr, tip) => ({
    getAttribute: n => (n === 'title' ? attr : null),
    querySelector: sel => (sel === '.fiocco-tip' ? tip || null : null)
});

test('la nota di una medaglietta: titolo e descrizione, senza il numero fatto', () => {
    assert.deepEqual(B.notaDaTitolo('Flawless · Gold\nSets won without losing a single Pokémon.\n12 sets'), { titolo: 'Flawless · Gold', descrizione: 'Sets won without losing a single Pokémon.' });
    assert.deepEqual(B.notaDaTitolo(''), { titolo: '', descrizione: '' });
    assert.deepEqual(B.notaDaTitolo(null), { titolo: '', descrizione: '' });
});

test('la nota di un fiocco dello scaffale: il fumetto senza la riga del livello dopo', () => {
    const q = { strong: { textContent: ' LAST STAND · BRONZE ' }, p: { textContent: 'Sets won as the very last Pokémon standing.' } };
    const tip = { querySelector: sel => (sel === 'strong' ? q.strong : sel === 'p:not(.fiocco-tip-nota)' ? q.p : null) };
    assert.deepEqual(B.notaDiElemento(el('', tip)), { titolo: 'LAST STAND · BRONZE', descrizione: 'Sets won as the very last Pokémon standing.' });
    assert.deepEqual(B.notaDiElemento(el('Ribbon · Gold\nDescrizione\n3 KO')), { titolo: 'Ribbon · Gold', descrizione: 'Descrizione' });
    assert.equal(B.notaDiElemento(null), null);
});

test("l'HTML della nota è sicuro", () => {
    assert.match(B.htmlNota({ titolo: '<b>x</b>', descrizione: 'a & b' }), /&lt;b&gt;x&lt;\/b&gt;.*a &amp; b/);
    assert.doesNotMatch(B.htmlNota({ titolo: 'Solo titolo', descrizione: '' }), /<span>/);
});

test('si tocca la medaglietta o il fiocco, non il "+N" che raccoglie gli altri', () => {
    assert.match(B.SELETTORE, /\.bt-mini\[title\]:not\(\.bt-altri\)/);
    assert.match(B.SELETTORE, /#pkm-fiocchi \.fiocco/);
});

test('nel Box dell\'app i badge ci sono e senza avanzamento', () => {
    const css = docs('app-gioco-pagine.css');
    assert.deepEqual(require('../docs/app.js').SCRIPT_PAGINE['box.html'].slice(-1), ['app-box-badge.js']);
    // team: la scheda e la testata mostrano le medagliette, senza tasto "Badges x/10" né scaffale
    assert.match(css, /#teamsGrid \.card \.bt-card \{ grid-area: bd;/);
    assert.doesNotMatch(css, /#teamsGrid \.card :is\(\.bt-card, \.bt-barra-team\)/);
    assert.match(css, /\[data-badge-team\] :is\(\.bt-apri, \.bt-barra-mini\) \{ display: none/);
    assert.match(css, /\[data-badge-team\] \.bt-pop \{ position: static !important; display: block !important;/, 'tutti i badge del team in fila, anche quelli non ancora presi');
    // Pokémon: le medagliette sulla carta del team e i fiocchi nella scheda, senza barre né valori né fumetto da sito
    assert.doesNotMatch(css, /\.modal-moves, \.pkm-badges-overlay,/);
    assert.match(css, /#pkm-fiocchi :is\([^)]*\.fiocco-barra, \.fiocco-valore, \.fiocco-tip\) \{ display: none/);
    assert.doesNotMatch(css, /#pkmDetailModal :is\(\.area-weakness, \.area-ribbons, #pkm-fiocchi/);
    assert.match(css, /\.ab-nota \{/);
});

test('toccando altrove la spiegazione si chiude subito, e i badge del team (anche grigi) si spiegano', () => {
    const js = docs('app-box-badge.js');
    assert.match(js, /addEventListener\('pointerdown'[^]*legame\.chiudi\(\)/);
    assert.match(B.SELETTORE, /#teamModal \.bt-pop \.bt/);
    const corpo = { querySelector: s => ({ '.bt-nome': { textContent: 'Win Rate' }, '.bt-stato': { textContent: 'Locked' }, '.bt-desc': { textContent: 'Share of matches won.' } })[s] };
    const el = { querySelector: s => (s === '.bt-corpo' ? corpo : null), getAttribute: () => '' };
    assert.deepEqual(B.notaDiElemento(el), { titolo: 'Win Rate · Locked', descrizione: 'Share of matches won.' });
});

test('nel Box il Pokémon sta su un podio nel colore del suo tipo (due se ha due tipi), senza riquadro né tooltip al passaggio', () => {
    const css = docs('app-gioco-pagine.css');
    assert.doesNotMatch(css, /#teamsGrid \.card \.pkm-box::before/, 'niente alone tondo dietro al Pokémon');
    assert.match(css, /\.bt-mini\.bt-locked \{/, 'i badge da prendere sono in grigio');
    assert.match(css, /#pkmDetailModal \.info-box-compact::before \{ content: none/, 'via le etichette ABILITY e ITEM');
    assert.match(css, /#teamsGrid \.card \.pkm-box::after[^}]*var\(--tipo2/);
    assert.match(css, /\.pkm-hover-card \{ display: none !important; \}/);
    assert.match(docs('box.html'), /coloriPokemonNoti2/, 'il secondo tipo arriva dalla pagina');
});
