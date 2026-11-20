'use strict';
// Il Pokédex nella pagina Stats e nell'app: la scheda "Pokédex" (a colori i Pokémon usati, in grigio i mai usati; della lega o di un allenatore).
// Il calcolo e l'HTML si provano in pokedex-lega.test.js; qui il collegamento in stats.html/stats.js, la vista dell'app e gli stili.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/app-stats.js');
const PL = require('../docs/pokedex-lega.js');

const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
const html = docs('stats.html');
const stats = docs('stats.js');
const css = docs('pokedex-lega.css');
const cssApp = docs('app-gioco-pagine.css');

test('stats.html: il tag Pokédex, la sezione con i suoi controlli, gli stili e gli script nell\'ordine giusto', () => {
    assert.match(html, /<button type="button" class="tag tag-pokedex" role="tab" data-tab="pokedex" aria-selected="false"[^>]*>Pokédex<\/button>/);
    assert.match(html, /<section id="stats-pokedex" class="pdx" aria-label="Pokédex" hidden>/, 'nascosta finché non si sceglie il tag');
    for (const id of ['pdx-chi', 'pdx-totale', 'pdx-indice', 'pdx-corpo', 'pdx-nota']) assert.match(html, new RegExp(`id="${id}"`), id);
    assert.doesNotMatch(html, /pdx-filtri|data-pdx-filtro/, 'niente filtri tutti/usati/mai: solo la scelta di chi e la ricerca');
    assert.match(html, /<label class="filtro" id="filtro-stagione">/);
    assert.match(html, /<label class="filtro" id="filtro-formato">/);
    assert.match(html, /<link rel="stylesheet" href="pokedex-lega\.css">/);
    const naz = html.indexOf('<script src="pokedex-nazionale.js"></script>');
    const lega = html.indexOf('<script src="pokedex-lega.js"></script>');
    const uso = html.indexOf('<script src="uso-globale.js"></script>');
    const pagina = html.indexOf('<script src="stats.js"></script>');
    assert.ok(uso > 0 && naz > uso && lega > naz && pagina > lega, 'uso-globale.js, pokedex-nazionale.js, pokedex-lega.js, poi stats.js');
    assert.match(html, /<li><b>Pokédex<\/b> lists every Pokémon in national Pokédex order/, 'la spiegazione dei numeri');
    assert.match(docs('pokedex-lega.js'), /require\('\.\/pokedex-nazionale\.js'\)/);
});

test('stats.js: il Pokédex è una categoria come le altre; ha la sua sezione e prende i dati dell\'uso, con gli stessi filtri di stagione e formato', () => {
    assert.match(stats, /TITOLO_TAB = \{ players: 'Players', teams: 'Teams', pokemon: 'Pokémon', usage: 'Usage', pokedex: 'Pokédex' \}/);
    assert.match(stats, /\['players', 'teams', 'pokemon', 'usage', 'pokedex'\]\.includes\(p\.get\('tab'\)\)/, 'si apre da ?tab=pokedex');
    assert.match(stats, /const modelloPokedex = \(\) => PokedexLega\.calcola\(STATO\.uso, \{ chi: STATO\.pokedexChi \}\);/, 'dai team che hanno giocato (UsoGlobale), nel perimetro scelto');
    // la sezione si vede solo nel Pokédex; la griglia delle card e i chip dell'ordinamento no
    assert.match(stats, /\$\('stats-pokedex'\)\.hidden = !inPokedex;[^]*for \(const id of \['stats-griglia', 'stats-ordina', 'stats-altri', 'filtro-stagione', 'filtro-formato'\]\)[^]*el\.hidden = inPokedex;[^]*if \(inPokedex\) \{ disegnaPokedex\(\); return; \}/);
    // allenatore: dall'indirizzo e nell'indirizzo
    assert.match(stats, /if \(p\.get\('trainer'\)\) STATO\.pokedexChi = idDi\(p\.get\('trainer'\)\);/);
    assert.match(stats, /if \(STATO\.tab === 'pokedex' && STATO\.pokedexChi\) p\.set\('trainer', STATO\.pokedexChi\);/);
    // un allenatore che non c'è più torna alla lega
    assert.match(stats, /if \(STATO\.pokedexChi && !elencoGiocatori\(\)\.some\(g => g\.id === STATO\.pokedexChi\)\) STATO\.pokedexChi = '';/);
    // chi è collegato: "(you)" nel selettore
    assert.match(stats, /async function scopriChiSono\(\)/);
    assert.match(stats, /await scopriChiSono\(\);\s*disegna\(\);/);
    assert.match(stats, /g\.id === STATO\.io \? ' \(you\)' : ''/);
});

test('stats.js: i controlli del Pokédex (di chi, cosa mostrare, salto a una regione) e il clic su un usato, che apre la sua scheda d\'uso', () => {
    assert.match(stats, /\$\('pdx-chi'\)\.addEventListener\('change', e => \{ STATO\.pokedexChi = e\.target\.value;/);
    assert.doesNotMatch(stats, /pokedexFiltro|pdx-filtri/);
    assert.match(stats, /\[data-regione="\$\{v\.dataset\.pdxVai\}"\]/);
    assert.match(stats, /\$\('pdx-corpo'\)\.addEventListener\('click', e => \{\s*const v = e\.target\.closest\('\[data-apri\]'\);\s*if \(v\) apriScheda\(v\.dataset\.apri, v\.dataset\.chiave\);/);
    assert.match(stats, /\$\('cerca'\)\.addEventListener\('input'[^}]*disegnaGriglia\(\)/, 'la ricerca per nome vale anche per il Pokédex (passa da disegnaGriglia)');
});

test('stats.js nell\'app: il Pokédex si pubblica come modello (niente carosello) e le caselle si disegnano una volta sola', () => {
    assert.match(stats, /const nellApp = document\.documentElement\.classList\.contains\('app-shell'\);\s*if \(!nellApp\) \$\('pdx-corpo'\)\.innerHTML = html;/);
    assert.match(stats, /if \(nellApp\) pubblicaAppPokedex\(m, nomeChi, giocatori, html\);/);
    assert.match(stats, /tab: 'pokedex', tabs: Object\.keys\(TITOLO_TAB\)/);
    assert.match(stats, /righe: \[\], vuoto: '', totale: 0/, 'senza righe il carosello dell\'app non fa niente');
    assert.match(stats, /giocatori: \[\{ valore: '', testo: 'The whole league' \}/);
});

// ---------- l'app ----------
const modelloApp = (extra = {}) => ({
    tab: 'pokedex', tabs: [{ id: 'players', titolo: 'Players' }, { id: 'pokedex', titolo: 'Pokédex' }], stagione: 'all', formato: 'all',
    stagioni: [{ valore: 'all', testo: 'Global' }], formati: [{ valore: 'all', testo: 'All formats' }], righe: [], vuoto: '', totale: 0,
    pokedex: {
        chi: 'didi', nomeChi: 'Didi', usati: 30, totale: 1025, perc: 2.9, team: 6,
        giocatori: [{ valore: '', testo: 'The whole league' }, { valore: 'didi', testo: 'Didi (you)' }, { valore: 'x"y', testo: '<b>Xy</b>' }],
        regioni: [{ id: 'kanto', nome: 'Kanto', usati: 7, totale: 151 }, { id: 'galar', nome: 'Galar & Hisui', usati: 3, totale: 96 }],
        html: '<section class="pdx-regione" data-regione="kanto">…</section>', ...extra
    }
});

test('app, htmlPokedex: di chi è (niente filtri), il totale, un salto a ogni regione e le caselle che scrive la pagina', () => {
    const h = S.htmlPokedex(modelloApp());
    assert.match(h, /<select class="as-sel" id="as-pdx-chi" aria-label="Pokédex of">/);
    assert.match(h, /<option value="didi" selected>Didi \(you\)<\/option>/);
    assert.match(h, /<option value="">The whole league<\/option>/);
    assert.doesNotMatch(h, /data-pdx-filtro|Never used/);
    assert.match(h, /<b>30<\/b><span>\/ 1,025<\/span><i>2\.9%<\/i>/);
    assert.match(h, /data-pdx-vai="kanto"[^>]*>Kanto<b>7\/151<\/b>/);
    assert.match(h, /Galar &amp; Hisui<b>3\/96<\/b>/);
    assert.match(h, /<div class="as-pdx-corpo"><section class="pdx-regione" data-regione="kanto">…<\/section><\/div>/);
    // il testo che viene dai dati non apre tag
    assert.doesNotMatch(h, /<b>Xy<\/b>/);
    assert.match(h, /<option value="x&quot;y">&lt;b&gt;Xy&lt;\/b&gt;<\/option>/);
    // senza dati non rompe niente
    assert.doesNotThrow(() => S.htmlPokedex({ tab: 'pokedex' }));
    assert.match(S.htmlPokedex({ tab: 'pokedex' }), /<b>0<\/b><span>\/ 0<\/span>/);
});

test('app, firma: nel Pokédex cambiando allenatore si riparte dall\'inizio dell\'elenco; per le altre viste la firma resta quella di prima', () => {
    const f = S.firma(modelloApp());
    for (const cambio of [m => { m.pokedex.chi = ''; }, m => { m.stagione = 's1'; }]) {
        const altro = modelloApp(); cambio(altro);
        assert.notEqual(S.firma(altro), f);
    }
    assert.equal(S.firma(modelloApp()), f);
    assert.equal(S.firma({ tab: 'players', stagione: 'all', formato: 'all', ordine: { id: 'elo', dir: -1 } }), 'players|all|all|elo|-1', 'senza Pokédex niente di aggiunto');
});

test('app-stats.js: il Pokédex non usa il carosello; i controlli della pagina scattano da qui e il tocco su una casella dà una nota', () => {
    const app = docs('app-stats.js');
    assert.match(app, /radice\.innerHTML = m\.tab === 'pokedex'\s*\? `<div class="as-barra">\$\{htmlBarra\(m\)\}<\/div>\$\{htmlPokedex\(m\)\}`/);
    assert.match(app, /if \(!stato \|\| !S \|\| !stato\.pista\) return;/, 'senza carosello niente scala dei Pokémon');
    assert.doesNotMatch(app, /filtroPokedex|data-pdx-filtro/);
    assert.match(app, /else if \(e\.target\.id === 'as-pdx-chi'\) scatta\.seleziona\('pdx-chi', e\.target\.value\);/);
    assert.match(app, /if \(cella\) return nota\(cella\.getAttribute\('title'\)\);/);
    // ridisegnando lo stesso Pokédex si resta dov'si era
    assert.match(app, /corpoPdx\.scrollTop = scorrimento/);
    assert.equal(typeof S.htmlPokedex, 'function');
});

// ---------- gli stili ----------
test('stile: le icone dal foglio di Showdown (12 colonne da 40x30), usate a colori, mai usate in grigio e tratteggiate', () => {
    assert.match(css, /background: url\('https:\/\/play\.pokemonshowdown\.com\/sprites\/pokemonicons-sheet\.png\?v22'\) no-repeat;/);
    assert.match(css, /background-size: calc\(480px \* var\(--z\)\) auto;/, '12 colonne da 40px');
    assert.match(css, /background-position: calc\(var\(--x, 0\) \* -40px \* var\(--z\)\) calc\(var\(--y, 0\) \* -30px \* var\(--z\)\);/);
    assert.equal(PL.COLONNE_ICONE, 12);
    assert.match(css, /\.pdx-mai \{ border-style: dashed;/);
    assert.match(css, /\.pdx-mai \.pdx-icona \{ filter: grayscale\(1\)/);
    assert.match(css, /\.tag-pokedex\.attivo \{ background: #a3e635; \}/);
});

test('stile dell\'app: la vista del Pokédex ha il suo riquadro che scorre, le icone in u e il tag in più sta nella barra', () => {
    assert.match(cssApp, /html\.app-shell \.as-pdx \{ flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;/);
    assert.match(cssApp, /html\.app-shell \.as-pdx-corpo \{[^}]*overflow-y: auto;[^}]*touch-action: pan-y;/);
    assert.match(cssApp, /html\.app-shell \.as-pdx-corpo \.pdx-icona \{ --z: 1; width: calc\(40 \* var\(--z\) \* var\(--u\)\);[^}]*background-position: calc\(var\(--x, 0\) \* -40 \* var\(--z\) \* var\(--u\)\)/);
    assert.match(cssApp, /html\.app-shell \.as-nota \{/);
    // cinque tag e due filtri stanno nella barra
    assert.match(cssApp, /html\.app-shell \.as-t \{ position: relative; padding: calc\(6 \* var\(--u\)\) calc\(9\.5 \* var\(--u\)\)/);
    assert.match(cssApp, /html\.app-shell \.as-sel \{ max-width: calc\(134 \* var\(--u\)\);/);
});

test('Pokédex: sempre di tutta la lega (stagione e formato "all"); entrando si ricorda la scelta, uscendo si rimette; l\'indirizzo non porta stagione e formato', () => {
    assert.match(stats, /prima: null,/);
    assert.match(stats, /if \(!eraPokedex && STATO\.tab === 'pokedex'\) \{ STATO\.prima = \{ stagione: STATO\.stagione, formato: STATO\.formato \}; STATO\.stagione = 'all'; STATO\.formato = 'all'; return disegna\(\); \}/);
    assert.match(stats, /if \(eraPokedex && STATO\.prima\) \{ STATO\.stagione = STATO\.prima\.stagione; STATO\.formato = STATO\.prima\.formato; STATO\.prima = null; return disegna\(\); \}/);
    assert.match(stats, /if \(STATO\.tab !== 'pokedex'\) \{[^}]*p\.get\('season'\)[^}]*p\.get\('format'\)/, 'da ?tab=pokedex si ignorano stagione e formato');
    assert.match(docs('style-stats.css'), /\.filtro\[hidden\] \{ display: none; \}/, 'hidden vale anche su un elemento con display flex');
    // nell'app niente selettori di stagione e formato nel Pokédex
    const app = require('../docs/app-stats.js');
    const barra = m => app.htmlBarra({ tabs: [], stagioni: [], formati: [], ...m });
    assert.doesNotMatch(barra({ tab: 'pokedex' }), /as-stagione|as-formato/);
    assert.match(barra({ tab: 'players' }), /id="as-stagione"[^]*id="as-formato"/);
});

test('scheda di un giocatore, team o Pokémon (Stats, Usage, Pokédex): angoli e inclinazioni seguono il tema scelto', () => {
    const stile = docs('style-stats.css');
    const sch = stile.slice(stile.indexOf('SCHEDA DI DETTAGLIO'), stile.indexOf('USAGE · i Pokémon più usati'));
    // nessuna rotazione fissa: tutte moltiplicate per --nb-rot (0 in Arcade, poco nel Soft, tanto in Sticker)
    assert.doesNotMatch(sch.replace(/rotate\(0deg\)/g, ''), /rotate\(-?[\d.]+deg\)/);
    assert.match(sch, /\.scheda-nome \{[^}]*rotate\(calc\(var\(--nb-rot, 1\) \* -2\.5deg\)\)/);
    assert.match(sch, /\.scheda-testa \{[^}]*border-radius: calc\(var\(--nb-raggio, 0px\) - 4px\)/, 'gli angoli alti della testata seguono quelli della scheda');
    // gli angoli del tema (controlli.css) comprendono la scheda e i suoi pezzi
    const ctrl = docs('controlli.css');
    assert.match(ctrl, /\.stats-modal-card, \.scheda-nome, \.scheda-titolo, \.stats-modal \.tessera, \.stats-modal \.vuoto, \.premio-titolo-testo, \.premio-tip, \.uso-formato,/);
});
