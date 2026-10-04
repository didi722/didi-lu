'use strict';
// La finestra del Showdown (Matches): stessa famiglia delle altre finestre, un foglio suo (showdown.css) e il suo markup,
// scritto da apriModaleShowdown() dentro matches.html. Qui: i collegamenti, il vecchio stile davvero tolto, le variabili del
// tema, il telefono, e il markup prodotto (vincitore, serie, apostrofi nei nomi) eseguendo la funzione con un documento finto.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const html = docs('matches.html');
const css = docs('showdown.css');
const locali = h => [...h.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]).filter(x => !/^https?:/.test(x));

test('matches.html carica showdown.css dopo dettagli.css e prima di tooltip.css e mobile.css', () => {
    const fogli = locali(html);
    for (const f of ['showdown.css', 'dettagli.css', 'tooltip.css', 'mobile.css']) assert.ok(fogli.includes(f), `manca ${f}`);
    assert.ok(fogli.indexOf('showdown.css') > fogli.indexOf('dettagli.css'));
    assert.ok(fogli.indexOf('showdown.css') < fogli.indexOf('tooltip.css'));
    assert.ok(fogli.indexOf('showdown.css') < fogli.indexOf('mobile.css'));
    assert.ok(fogli.indexOf('showdown.css') > fogli.findIndex(f => /^style-/.test(f)), 'dopo il foglio della pagina');
});

test('lo stile di prima del Showdown è tolto da style-matches.css (due fogli sulla stessa finestra si pestano i piedi)', () => {
    const vecchio = docs('style-matches.css');
    for (const sel of ['#sd-modal-overlay', '.sd-modal-', '.match-card', '.score-container', '.btn-replay-icon', '.match-category', '.team-badge']) {
        assert.ok(!vecchio.includes(sel), `style-matches.css ha ancora ${sel}`);
    }
    // .badge-label serve ancora alla testata del replay
    assert.match(vecchio, /\.badge-label \{/);
    // le graffe tornano
    let saldo = 0;
    for (const c of vecchio) { if (c === '{') saldo++; else if (c === '}') saldo--; assert.ok(saldo >= 0, 'graffa chiusa di troppo'); }
    assert.equal(saldo, 0);
});

test('showdown.css: striscia con i tre pallini, X gialla, carta e ombre del tema (con i valori classici di ripiego)', () => {
    assert.match(css, /#sd-modal-overlay \.sd-finestra::before \{\s*content: "SHOWDOWN/);
    assert.match(css, /radial-gradient\(circle at 24px 50%, #ff5f57[\s\S]*?#febc2e[\s\S]*?#28c840/);
    assert.match(css, /\.sd-chiudi \{[\s\S]*?background: var\(--nb-giallo, #ffbd44\)/);
    for (const v of ['--nb-ink', '--nb-carta', '--nb-tip-bg', '--nb-sh-l', '--nb-sh-m', '--nb-sh-s', '--nb-raggio', '--nb-rot', '--nb-font-titoli', '--nb-giallo', '--nb-motivo']) {
        assert.match(css, new RegExp(`var\\(${v},`), `${v} senza ripiego`);
    }
});

test('showdown.css: la finestra entra con un movimento, ma non se il sistema chiede meno movimento', () => {
    assert.match(css, /@keyframes sd-salta/);
    assert.match(css, /@keyframes sd-entra/);
    assert.match(css, /animation-delay: calc\(var\(--i, 0\) \* 85ms/, 'le cartoline entrano una dopo l\'altra');
    const ridotto = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css);
    assert.ok(ridotto, 'manca il blocco per chi vuole meno movimento');
    assert.match(ridotto[1], /\.sd-finestra,\s*#sd-modal-overlay\.active \.sd-match \{ animation: none; \}/);
});

test('showdown.css: su telefono la finestra scorre intera e le partite stanno una sotto l\'altra', () => {
    const tel = /@media \(max-width: 900px\) \{([\s\S]*?)\n\}/.exec(css);
    assert.ok(tel, 'blocco per telefono mancante');
    assert.match(tel[1], /\.sd-finestra \{ max-height: none;/);
    assert.match(tel[1], /\.sd-match \{ grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(tel[1], /\.sd-replay \{ justify-self: stretch;/);
    assert.match(css, /@media \(max-width: 520px\) \{\s*#sd-modal-overlay \.sd-finestra::before \{ content: "SHOWDOWN · SANT'ALVISE"; \}/, 'l\'etichetta della striscia si accorcia: la X non la copre');
});

// ---------- il markup che scrive apriModaleShowdown ----------
function eseguiApri({ info, matches }) {
    const inizio = html.indexOf('async function apriModaleShowdown');
    const fine = html.indexOf('// Funzione globale per il toggle');
    assert.ok(inizio > 0 && fine > inizio, 'funzione non trovata');
    const sorgente = html.slice(inizio, fine);
    const overlay = { id: '', innerHTML: '', classList: { add() {}, remove() {} }, onclick: null };
    const documento = {
        getElementById: id => (id === 'sd-modal-overlay' ? null : null),
        createElement: () => overlay,
        body: { appendChild() {}, style: {} },
        addEventListener() {}, removeEventListener() {},
        querySelectorAll: () => []
    };
    const ambiente = {
        document: documento,
        getPlayersColors: async () => ({ c1: '#31c489', c2: '#8e44ad' }),
        pSBC: c => c,
        generaHtmlGifs: () => '<img class="mini-gif" alt="">',
        formattaDataItaliana: d => d.split('-').reverse().join('/'),
        getComputedStyle: () => ({ display: 'none' })
    };
    const fabbrica = vm.runInNewContext(`(function () { ${sorgente}; return apriModaleShowdown; })()`, ambiente);
    return fabbrica('sd1', { info, matches }).then(() => ({ overlay, html: overlay.innerHTML }));
}

test('apriModaleShowdown: titolo, formato, data, serie e una cartolina per partita, con il vincitore segnato', async () => {
    const { html: h } = await eseguiApri({
        info: { player1: 'Didi', player2: 'Lu', categoria: 'Monotype', data: '2026-03-06' },
        matches: {
            match1: { team1: 'Martiri', team2: 'Rain', p1score: 2, p2score: 0 },
            match2: { team1: 'Martiri', team2: 'Rain', p1score: 1, p2score: 2 },
            match3: { team1: 'Martiri', team2: 'Rain', p1score: 2, p2score: 1 }
        }
    });
    assert.match(h, /class="sd-finestra" role="dialog"/);
    assert.match(h, /<span class="sd-nome" style="--c: #31c489;">Didi<\/span>[\s\S]*<span class="sd-vs">VS<\/span>[\s\S]*<span class="sd-nome" style="--c: #8e44ad;">Lu<\/span>/);
    assert.match(h, /sd-chip sd-formato">Monotype</);
    assert.match(h, /sd-chip sd-data">06\/03\/2026</);
    assert.equal((h.match(/<article class="sd-match"/g) || []).length, 3);
    assert.match(h, /<span class="sd-numero">MATCH 1<\/span>/);
    // serie 2 : 1 per Didi, e chi è avanti è evidenziato
    assert.match(h, /<div class="sd-serie"[^>]*>\s*<b class="sd-avanti">2<\/b><i>:<\/i><b>1<\/b>/);
    // un solo vincitore per partita: l'adesivo WIN e la classe sul team giusto
    assert.equal((h.match(/class="sd-win"/g) || []).length, 3);
    assert.equal((h.match(/sd-team-1 sd-vincitore/g) || []).length, 2);
    assert.equal((h.match(/sd-team-2 sd-vincitore/g) || []).length, 1);
    assert.equal((h.match(/sd-perde/g) || []).length, 3);
    assert.match(h, /<b class="sd-vince">2<\/b><i>:<\/i><b>0<\/b>/);
    assert.equal((h.match(/class="sd-replay"/g) || []).length, 3);
    assert.match(h, /onclick="chiudiModaleShowdown\(\)"/);
    assert.equal((h.match(/class="mini-gif"/g) || []).length, 6, 'le GIF della formazione, una per team e partita');
    for (const vecchio of ['sd-modal-container', 'match-card', 'team-badge', 'score-container']) assert.ok(!h.includes(vecchio), `classe vecchia: ${vecchio}`);
});

test('apriModaleShowdown: apostrofi e virgolette nei nomi non rompono né il testo né i gestori onclick', async () => {
    const { html: h, overlay } = await eseguiApri({
        info: { player1: "D'Arco", player2: 'Lu "Il Rosso"', categoria: 'OU', data: '2026-01-02' },
        matches: { match1: { team1: "Rock 'n' Roll", team2: '<b>Team</b>', p1score: 0, p2score: 0 } }
    });
    assert.ok(!h.includes('<b>Team</b>'), 'il testo è protetto');
    assert.match(h, /&lt;b&gt;Team&lt;\/b&gt;/);
    // nell'attributo l'apostrofo diventa \&#39; : dopo che l'HTML è letto resta \' dentro la stringa JavaScript
    assert.match(h, /apriDettaglioTeam\('D\\&#39;Arco', 'Rock \\&#39;n\\&#39; Roll', 'OU'\)/);
    assert.match(h, /apriDettaglioTeam\('Lu &quot;Il Rosso&quot;', '&lt;b&gt;Team&lt;\/b&gt;', 'OU'\)/);
    // pareggio 0:0 (partita non giocata): nessun vincitore, nessuna serie
    assert.ok(!h.includes('sd-vincitore') && !h.includes('sd-win"') && !h.includes('sd-serie'));
    // il gestore del velo: si chiude toccando fuori dalla finestra, non dentro
    let chiuso = 0;
    const globali = { chiudiModaleShowdown() { chiuso++; } };
    const gestore = new Function('chiudiModaleShowdown', `return ${overlay.onclick};`)(globali.chiudiModaleShowdown);
    gestore({ target: { closest: s => (s === '.sd-finestra' ? {} : null) } });
    assert.equal(chiuso, 0, 'dentro la finestra non si chiude');
    gestore({ target: { closest: () => null } });
    assert.equal(chiuso, 1, 'fuori dalla finestra si chiude');
});

test('apriModaleShowdown: senza partite la finestra lo dice invece di restare vuota', async () => {
    const { html: h } = await eseguiApri({ info: { player1: 'A', player2: 'B', categoria: 'OU', data: '2026-01-02' }, matches: {} });
    assert.match(h, /<p class="sd-vuoto">No matches yet<\/p>/);
    assert.ok(!h.includes('sd-serie'));
});
