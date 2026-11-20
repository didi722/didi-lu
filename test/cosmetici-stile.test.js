'use strict';
// Gli stili delle card, gli sfondi del Box e le entrate nella schermata VS (cosmetici.js, tipi "card", "boxsfondo", "entrata"): catalogo, fogli di stile, pagine e moduli.
// Il disegno si prova a schermo; qui il collegamento (chi scrive l'attributo, cosa si valida) e le entrate con un finto documento.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../docs/cosmetici.js');
const E = require('../docs/entrate-vs.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const docs = nome => leggi('docs', nome);
const per = tipo => C.CATALOGO.filter(c => c.tipo === tipo);

test('catalogo: card, sfondi del Box ed entrate hanno campo e prefisso giusti e il loro aspetto nel foglio di stile (o nel modulo)', () => {
    const card = docs('stile-card.css'), box = docs('sfondo-box.css');
    assert.ok(per('card').length >= 10 && per('boxsfondo').length >= 6 && per('entrata').length >= 6, 'ce n\'è una buona scelta');
    for (const c of per('card')) { assert.equal(c.campo, 'stileCard', c.id); assert.match(c.id, /^card-[a-z-]+$/, c.id); assert.ok(card.includes(`[data-stile-card="${c.id}"]`), `${c.id} non ha il suo stile in stile-card.css`); }
    for (const c of per('boxsfondo')) { assert.equal(c.campo, 'sfondoBox', c.id); assert.match(c.id, /^box-[a-z-]+$/, c.id); assert.ok(box.includes(`[data-sfondo-box="${c.id}"]`), `${c.id} non ha il suo sfondo in sfondo-box.css`); }
    for (const c of per('entrata')) { assert.equal(c.campo, 'effettoEntrata', c.id); assert.match(c.id, /^entrata-[a-z]+$/, c.id); assert.ok(E.ELENCO.includes(c.id), `${c.id} non ha il suo effetto in entrate-vs.js`); }
    assert.deepEqual(E.ELENCO.slice().sort(), per('entrata').map(c => c.id).sort(), 'ogni effetto è in vendita');
    for (const tipo of ['card', 'boxsfondo', 'entrata']) assert.ok(C.TIPI[tipo] && C.TIPI[tipo].nome && C.TIPI[tipo].frase, tipo);
    // le regole del database proteggono i tre campi, col prefisso giusto
    const regole = leggi('REGOLE-DATABASE.md');
    for (const [campo, prefisso] of [['stileCard', 'card-'], ['sfondoBox', 'box-'], ['effettoEntrata', 'entrata-']]) assert.match(regole, new RegExp(`"${campo}": \\{ "\\.validate": "[^"]*beginsWith\\('${prefisso}'\\)`), campo);
    // le animazioni rispettano chi non le vuole
    assert.match(card, /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-stile-card\], \[data-stile-card\] \.pal-pedana \{ animation: none !important; \}/);
});

test('Cosmetici.valido: solo gli id del catalogo di quel tipo (un valore scritto a mano nel database non finisce in un attributo)', () => {
    assert.equal(C.valido('card-oro', 'card'), 'card-oro');
    assert.equal(C.valido('card-oro', 'boxsfondo'), '', 'il tipo conta');
    assert.equal(C.valido('box-notte', 'boxsfondo'), 'box-notte');
    assert.equal(C.valido('entrata-fulmine', 'entrata'), 'entrata-fulmine');
    assert.equal(C.valido('card-oro" onmouseover="x', 'card'), '');
    assert.equal(C.valido('', 'card'), '');
    assert.equal(C.valido(undefined, 'card'), '');
    // si possiedono come il resto: per acquisto
    assert.equal(C.possiede('card-oro', { wallet: { posseduti: { 'card-oro': 1 } } }), true);
    assert.equal(C.possiede('card-oro', {}), false);
    // il server mette e toglie con lo stesso comando delle aure
    for (const c of [...per('card'), ...per('boxsfondo'), ...per('entrata')]) assert.ok(c.prezzo >= 400 && c.prezzo <= 900, `${c.id} ${c.prezzo}`);
});

test('le due copie di cosmetici.js (sito e server) sono uguali', () => {
    assert.equal(docs('cosmetici.js'), leggi('functions', 'cosmetici.js'));
});

test('stile delle card: una regola sola le applica a Trainers, classifica, Stats e all\'app; l\'attributo lo scrive ogni pagina da un id controllato', () => {
    const css = docs('stile-card.css');
    assert.match(css, /:root :is\(\.trainer-card, \.cl-riga, \.cl-tab-riga, \.carta-players, \.sc-campione\)\[data-stile-card\] \{/);
    assert.match(css, /html\.app-shell \[data-stile-card\] \.pal-pedana \{/);
    assert.doesNotMatch(css.slice(css.indexOf(':root :is('), css.indexOf('}', css.indexOf(':root :is('))), /box-shadow:[^;]*!important/, 'senza !important: le animazioni vincono');
    // Trainers (browser)
    const players = docs('players.html');
    assert.match(players, /<link rel="stylesheet" href="stile-card\.css">/);
    assert.match(players, /stileCard: window\.Cosmetici \? Cosmetici\.valido\(info\.stileCard, 'card'\) : ''/);
    assert.match(players, /class="trainer-card"\$\{player\.stileCard \? ` data-stile-card="\$\{player\.stileCard\}"` : ''\}/);
    assert.match(players, /palestra: p\.palestra, stileCard: p\.stileCard/, 'l\'app riceve lo stile');
    // classifica di stagione (sia la colonna a lato sia la tabella grande)
    const matches = docs('matches.html');
    assert.match(matches, /<link rel="stylesheet" href="stile-card\.css">/);
    assert.match(matches, /class="cl-riga\$\{index === 0 \? ' cl-primo' : ''\}" href="public\.html\?player=\$\{playerUrlParam\}"\$\{stileCard \? ` data-stile-card="\$\{stileCard\}"` : ''\}/);
    assert.match(matches, /class="cl-tab cl-tab-riga[^"]*" href="public\.html\?player=\$\{url\}"\$\{stileDi\(p\.id\) \? ` data-stile-card="\$\{stileDi\(p\.id\)\}"` : ''\}/);
    assert.match(matches, /perApp\[index\] = \{ nome: player\.name, posizione: index \+ 1, colore: color, stileCard,/);
    // Stats
    assert.match(docs('stats.html'), /<link rel="stylesheet" href="stile-card\.css">/);
    assert.match(docs('statistiche.js'), /stileCard: info\(g\.id\)\.stileCard \|\| ''/);
    const stats = docs('stats.js');
    assert.match(stats, /const stileCardDi = \(tab, x\) => \(tab === 'players' && \/\^card-\[a-z-\]\{2,30\}\$\/\.test\(String\(x\.stileCard \|\| ''\)\) \? x\.stileCard : ''\);/, 'solo le card dei giocatori');
    assert.match(stats, /data-stile-card="\$\{stile\}"/);
});

test('app: le schede a scorrimento (Trainers, classifica, Stats) portano lo stile, solo se è un id fatto come si deve', () => {
    const T = require('../docs/app-trainers.js');
    const lukiani = { id: 'lukiani', nome: 'Lukiani', stileCard: 'card-oro' };
    assert.match(T.htmlCarta(lukiani, 0, {}), /<article class="at-carta" data-i="0" data-stile-card="card-oro" style="--c:/);
    assert.doesNotMatch(T.htmlCarta({ ...lukiani, stileCard: 'card-oro" onclick="x' }, 0, {}), /data-stile-card/);
    assert.doesNotMatch(T.htmlCarta({ id: 'a', nome: 'A' }, 0, {}), /data-stile-card/);
    const S = require('../docs/app-stats.js');
    assert.match(docs('app-stats.js'), /const stileCard = id => \(\/\^card-\[a-z-\]\{2,30\}\$\/\.test\(String\(id \|\| ''\)\) \? ` data-stile-card="\$\{id\}"` : ''\);/);
    assert.match(docs('app-classifica.js'), /<article class="ac-carta" data-i="\$\{indice\}"\$\{stileCard\(p\.stileCard\)\}/);
    assert.match(docs('app-stats.js'), /<article class="as-carta" data-i="\$\{indice\}"\$\{stileCard\(r\.stileCard\)\}/);
    assert.ok(S && typeof S.htmlCarta === 'function');
});

test('sfondo del Box: lo legge box.html dal profilo di chi è collegato (non nell\'editor incorporato) e lo mette sul body', () => {
    const box = docs('box.html');
    assert.match(box, /<link rel="stylesheet" href="sfondo-box\.css">/);
    assert.match(box, /db\.ref\(`players\/\$\{playerID\}\/info\/sfondoBox`\)\.on\('value'/);
    assert.match(box, /Cosmetici\.valido\(snapshot\.val\(\), 'boxsfondo'\)/);
    assert.match(box, /document\.body\.setAttribute\('data-sfondo-box', id\); else document\.body\.removeAttribute\('data-sfondo-box'\)/);
    assert.match(box, /!INCORPORATO\) \{[^}]*ascoltaMusicaFirebase\(\);\s*ascoltaSfondoBox\(\);/);
    const css = docs('sfondo-box.css');
    assert.match(css, /body\.nb\[data-sfondo-box\] \{[^}]*background-image: var\(--sb-img\) !important;/);
    // gli sfondi scuri schiariscono il testo scritto sulla pagina
    for (const id of ['box-blueprint', 'box-oceano', 'box-notte', 'box-vulcano', 'box-neon']) assert.match(css, new RegExp(`\\[data-sfondo-box="${id}"\\] \\{[^}]*--nb-testo: #`), id);
});

test('entrate: l\'intro VS le suona quando l\'avatar arriva; il valore passa dal profilo, controllato, fino all\'avatar della metà', () => {
    const intro = docs('battle-intro.js');
    assert.match(intro, /win\.EntrateVs\.suona\(entrata, \{ doc, ancora: p\.ancora, corpo: p\.corpo, img: p\.img, dir: lati\[i\]\.dir, h: lati\[i\]\.altezza \* ingr, A, t0: T\.ritardoAvatar \+ T\.entraAvatar \}\)/);
    assert.match(intro, /return \{ ancora, corpo, tag, img: imgAvatar \};/);
    assert.match(docs('battle.html'), /<script src="entrate-vs\.js"><\/script>\s*<script src="battle-intro\.js"><\/script>/);
    const ui = docs('battle-ui.js');
    assert.match(ui, /self\.Cosmetici\.valido\(a\.effettoEntrata, 'entrata'\)/);
    assert.match(ui, /'data-entrata': entrata \|\| null/);
    const ts = docs('team-sito.js');
    assert.match(ts, /effettoPalco: info\.effettoPalco, effettoEntrata: info\.effettoEntrata/);
    assert.match(ts, /effettoPalco: '', effettoEntrata: '' \}/);
});

// ---- le entrate, con un finto documento ----
function finto() {
    const nodi = [];
    const el = (tag) => {
        const e = { tag, style: {}, children: [], attrs: {}, className: '', parent: null, animazioni: [] };
        e.appendChild = f => { f.parent = e; e.children.push(f); return f; };
        e.setAttribute = (k, v) => { e.attrs[k] = v; };
        e.cloneNode = () => { const c = el(tag); c.className = e.className; return c; };
        e.remove = () => { if (e.parent) e.parent.children = e.parent.children.filter(x => x !== e); e.rimosso = true; };
        nodi.push(e);
        return e;
    };
    return { createElement: el, createElementNS: (ns, tag) => el(tag), nodi };
}

for (const id of E.ELENCO) {
    test(`${id}: parte con un finto documento, anima solo cose esistenti con numeri finiti, e pulisci() toglie tutto`, () => {
        const doc = finto();
        const ancora = doc.createElement('div'), corpo = doc.createElement('div'), img = doc.createElement('img');
        corpo.appendChild(img); ancora.appendChild(corpo);
        const animate = [];
        const A = (e, keyframes, opzioni) => {
            assert.ok(doc.nodi.includes(e) || e === img, 'anima un elemento creato qui');
            for (const [k, v] of Object.entries(keyframes)) {
                if (k === 'easing') continue;
                assert.ok(Array.isArray(v) && v.length >= 2, `${k}: almeno due valori`);
                if (k === 'offset') assert.equal(v.length, keyframes.opacity ? keyframes.opacity.length : v.length);
                for (const x of v) assert.ok(typeof x === 'number' ? Number.isFinite(x) : !/NaN|undefined|Infinity/.test(String(x)), `${id} ${k}: ${x}`);
            }
            assert.ok(opzioni.duration > 0 && (opzioni.delay === undefined || (Number.isFinite(opzioni.delay) && opzioni.delay >= 0)), `${id}: durata e ritardo ${JSON.stringify(opzioni)}`);
            const a = { cancellata: false, cancel() { this.cancellata = true; } };
            animate.push(a);
            return a;
        };
        for (const [h, t0] of [[300, 710], [60, 250], [500, 710]]) {
            const r = E.suona(id, { doc, ancora, corpo, img, dir: -1, h, A, t0 });
            assert.ok(r.durata > 0 && typeof r.pulisci === 'function');
            r.pulisci();
        }
        assert.ok(animate.length >= 3, `${id}: ha animazioni`);
        assert.ok(animate.every(a => a.cancellata), 'pulisci le ferma');
        assert.deepEqual(ancora.children, [corpo], 'e toglie gli strati: resta solo il corpo');
        assert.equal(corpo.children.length, 1, 'e le sagome: resta solo l\'avatar');
    });
}

test('entrate: un id sconosciuto o dati mancanti non rompono niente (l\'intro va avanti)', () => {
    assert.equal(E.suona('entrata-boh', {}).durata, 0);
    assert.equal(E.suona('entrata-fumo', null).durata, 0);
    assert.equal(E.suona('entrata-fumo', { doc: finto(), h: 0 }).durata, 0);
    assert.doesNotThrow(() => E.suona('entrata-fumo', {}).pulisci());
});

test('negozio: le tre famiglie hanno la loro anteprima e lo Shop fa girare le entrate', () => {
    const N = require('../docs/negozio.js');
    const c = id => C.perId(id);
    assert.match(N.anteprima(c('card-oro'), null, '#112233'), /class="ng-anteprima sc-campione" data-stile-card="card-oro" style="--sc-fondo:#112233"/);
    assert.match(N.anteprima(c('box-notte'), null, '#112233'), /class="ng-anteprima sb-campione" data-sfondo-box="box-notte"/);
    assert.match(N.anteprima(c('entrata-fumo'), null, '#112233'), /class="ng-anteprima ev-palco" data-entrata="entrata-fumo"/);
    const shop = docs('shop.js'), html = docs('shop.html');
    assert.match(shop, /EntrateVs\.anteprima\(b, b\.dataset\.entrata, S\.info\.avatar\)/);
    assert.match(shop, /animaEntrate\(document, '\.shop-grande \.ev-palco\[data-entrata\]'\)/, 'anche in grande, nella conferma');
    for (const f of ['stile-card.css', 'sfondo-box.css', 'battle-intro.css']) assert.match(html, new RegExp(`<link rel="stylesheet" href="${f.replace('.', '\\.')}">`), f);
    assert.match(html, /<script src="entrate-vs\.js"><\/script>/);
});

test('Shop: sotto la tua pagina c\'è la prova grande di quello che si guarda (palco, card, sfondo del Box, entrata)', () => {
    const N = require('../docs/negozio.js');
    const c = id => C.perId(id);
    const o = { colore: '#112233', avatar: 'immagini/profile/12.png', nome: 'Didi <b>' };
    assert.deepEqual(N.TIPI_PROVA_GRANDE, ['palco', 'card', 'boxsfondo', 'entrata']);
    const palco = N.provaGrandeHtml(c('palco-temporale'), o);
    assert.match(palco, /<div class="ng-gp-palco" data-effetto-palco="palco-temporale"><img src="immagini\/profile\/12\.png"/);
    assert.match(palco, /<b>Thunderstorm<\/b>/, 'e il suo nome e la sua frase');
    const card = N.provaGrandeHtml(c('card-oro'), o);
    assert.equal((card.match(/class="sc-campione ng-gp-card" data-stile-card="card-oro"/g) || []).length, 3, 'tre card: nel tuo colore e in altri due');
    assert.match(card, /--sc-fondo:#112233/);
    assert.match(card, /<b>DIDI &lt;B&gt;<\/b>/, 'il nome passa dall\'escape');
    assert.match(N.provaGrandeHtml(c('box-notte'), o), /<div class="ng-gp-box" data-sfondo-box="box-notte"><b class="ng-gp-box-titolo">DIDI &lt;B&gt;'S BOX/);
    assert.match(N.provaGrandeHtml(c('entrata-fumo'), o), /<div class="ng-gp-entrata ev-palco" data-entrata="entrata-fumo"><\/div>/);
    assert.equal(N.provaGrandeHtml(c('aura-oro'), o), '', 'le altre voci si provano sulla pagina');
    assert.match(N.provaGrandeHtml(c('card-oro'), { colore: 'rosso', nome: 'x' }), /--sc-fondo:#6b93b0/, 'un colore che non è un colore non entra nello stile');
    // il pannello e la sua logica
    const html = docs('shop.html'), shop = docs('shop.js');
    assert.match(html, /<div class="shop-extra" id="shop-extra" hidden aria-live="polite"><\/div>/);
    assert.match(shop, /const voceGrande = \(\) => \{ const c = S\.provando \? C\.perId\(S\.provando\) : null; return c && N\.TIPI_PROVA_GRANDE\.includes\(c\.tipo\) \? c : null; \};/);
    assert.match(shop, /box\.innerHTML = N\.provaGrandeHtml\(c, \{ colore: S\.info\.color, avatar: S\.info\.avatar, nome: S\.info\.name \|\| S\.giocatore \}\);/);
    assert.match(shop, /if \(id === grandeId\) return;/, 'si ridisegna solo quando cambia la voce');
    assert.match(shop, /S\.prova = campo \? \{ \[campo\]: valore \} : \{\}; S\.provando = id;/, 'card, Box ed entrata non toccano la pagina nel riquadro');
    assert.match(shop, /fermaGrande = window\.EntrateVs\.anteprima\(entrata, entrata\.dataset\.entrata, S\.info\.avatar\)/);
    assert.match(docs('style-shop.css'), /\.shop-extra \{[^}]*border-top: 3px dashed/);
});
