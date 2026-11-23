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
    assert.match(card, /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-stile-card\], \[data-stile-card\]::before, \[data-stile-card\]::after, \[data-stile-card\] \.pal-pedana \{ animation: none !important; \}/, 'anche gli strati');
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
    for (const c of [...per('card'), ...per('boxsfondo'), ...per('entrata')]) assert.ok(c.prezzo >= 300 && c.prezzo <= 900, `${c.id} ${c.prezzo}`);
});

test('le due copie di cosmetici.js (sito e server) sono uguali', () => {
    assert.equal(docs('cosmetici.js'), leggi('functions', 'cosmetici.js'));
});

test('stile delle card: una regola sola le applica a Trainers, classifica, Stats e all\'app; l\'attributo lo scrive ogni pagina da un id controllato', () => {
    const css = docs('stile-card.css');
    assert.match(css, /:root :is\(\.trainer-card, \.cl-riga, \.cl-tab-riga, \.carta-players, \.carta-teams, \.player-rank-row, \.ms-lato, \.season-card, \.palm-card, \.hof-voce, \.sd-team, \.rs-campione, \.rs-premio, \.sc-campione\)\[data-stile-card\] \{/);
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
    assert.match(stats, /const stileCardDi = \(tab, x\) => \(\(tab === 'players' \|\| tab === 'teams'\) && \/\^card-\[a-z-\]\{2,30\}\$\/\.test\(String\(x\.stileCard \|\| ''\)\) \? x\.stileCard : ''\);/, 'le card degli allenatori e dei loro team, non quelle dei Pokémon');
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

test('Shop: sotto la tua pagina c\'è sempre quello che si prova: un ritaglio della pagina vera (palco, nome, angolo) o il disegno di card, sfondo del Box ed entrata', () => {
    const N = require('../docs/negozio.js');
    const c = id => C.perId(id);
    const o = { colore: '#112233', avatar: 'immagini/profile/12.png', nome: 'Didi <b>' };
    assert.deepEqual(N.TIPI_PROVA_GRANDE, ['card', 'boxsfondo', 'entrata']);
    assert.deepEqual(N.FUOCO_PROVA, { aura: 'palco', palco: 'palco', nome: 'identita', sfondo: 'pagina' });
    // ogni voce del catalogo ha un pannello: o il ritaglio o il disegno
    for (const v of C.CATALOGO) assert.ok(N.FUOCO_PROVA[v.tipo] || N.TIPI_PROVA_GRANDE.includes(v.tipo), `${v.id} non ha una prova sotto la pagina`);
    // la tua card una volta sola, tra due righe di altri allenatori
    const card = N.provaGrandeHtml(c('card-oro'), o);
    assert.equal((card.match(/class="sc-campione ng-gp-card" data-stile-card="card-oro"/g) || []).length, 1, 'la tua card una volta sola');
    assert.equal((card.match(/class="ng-gp-vicina"/g) || []).length, 2, 'tra due righe di altri allenatori, senza stile e senza il tuo nome');
    assert.doesNotMatch(card.replace(/<div class="sc-campione[^]*?<\/div>/, ''), /DIDI/);
    assert.match(card, /--sc-fondo:#112233/);
    assert.match(card, /<b>DIDI &lt;B&gt;<\/b>/, 'il nome passa dall\'escape');
    assert.match(N.provaGrandeHtml(c('box-notte'), o), /<div class="ng-gp-box" data-sfondo-box="box-notte"><b class="ng-gp-box-titolo">DIDI &lt;B&gt;'S BOX/);
    assert.match(N.provaGrandeHtml(c('entrata-fumo'), o), /<div class="ng-gp-entrata ev-palco" data-entrata="entrata-fumo"><\/div>/);
    assert.equal(N.provaGrandeHtml(c('palco-neve'), o), '', 'il palco, l\'aura, il nome e i motivi si vedono sulla pagina vera, non in un disegno');
    assert.match(N.provaGrandeHtml(c('card-oro'), { colore: 'rosso', nome: 'x' }), /--sc-fondo:#6b93b0/, 'un colore che non è un colore non entra nello stile');
    // il pannello e la sua logica
    const html = docs('shop.html'), shop = docs('shop.js');
    assert.match(html, /<div class="shop-extra" id="shop-extra" hidden aria-live="polite">\s*<div class="shop-zoom" id="shop-zoom" hidden><iframe id="shop-iframe2"/);
    assert.match(shop, /const voceGrande = \(\) => \{ const c = S\.provando \? C\.perId\(S\.provando\) : null; return c && N\.TIPI_PROVA_GRANDE\.includes\(c\.tipo\) \? c : null; \};/);
    assert.match(shop, /if \(c && N\.FUOCO_PROVA\[c\.tipo\]\) return N\.FUOCO_PROVA\[c\.tipo\];\s*if \(S\.prova\.avatar\) return 'palco';\s*if \(S\.prova\.color\) return 'identita';/, 'avatar e colore hanno il loro ritaglio');
    assert.match(shop, /querySelector\(`\.pp-blocco\[data-blocco="\$\{fuoco\}"\]`\)/, 'il palco vero (con il compagno), non un disegno');
    assert.match(shop, /if \(fuoco === 'pagina'\) return \{ left: 0, top: 0, width: 560, height: 315 \};/);
    assert.match(shop, /for \(const f of \[\$\('shop-iframe'\), \$\('shop-iframe2'\)\]\)/, 'le prove vanno a tutte e due le pagine');
    assert.match(shop, /\[\$\('shop-iframe'\), \$\('shop-iframe2'\)\]\.find\(f => f && f\.contentWindow === e\.source\)/, 'ognuna dice quando è pronta');
    assert.match(shop, /S\.prova = campo \? \{ \[campo\]: valore \} : \{\}; S\.provando = id;/, 'card, Box ed entrata non toccano la pagina nel riquadro');
    assert.match(shop, /fermaGrande = window\.EntrateVs\.anteprima\(entrata, entrata\.dataset\.entrata, S\.info\.avatar\)/);
    assert.match(docs('style-shop.css'), /\.shop-extra \{[^}]*border-top: 3px dashed/);
    assert.match(docs('style-shop.css'), /\.shop-zoom iframe \{[^}]*width: 1440px; height: 810px;/, 'la pagina è larga 1440 come nel riquadro in alto');
    // la pagina nel riquadro non si legge da una cache vecchia
    assert.match(shop, /const indirizzoAnteprima = \(\) => `public\.html\?player=\$\{encodeURIComponent\(S\.giocatore\)\}&anteprima=1&_=\$\{Date\.now\(\)\.toString\(36\)\}`;/);
    assert.match(shop, /\$\('shop-iframe'\)\.src = indirizzoAnteprima\(\);/);
});

test('server: le Functions conoscono le voci nuove (acquista le cerca nel loro catalogo: senza, lo Shop dice "That item doesn\'t exist")', () => {
    const M = require('../functions/monete.js');
    const FC = require('../functions/cosmetici.js');
    assert.equal(typeof M.acquista, 'function');
    assert.equal(typeof M.equipa, 'function');
    for (const id of ['card-oro', 'box-notte', 'entrata-fulmine']) {
        const c = FC.perId(id);
        assert.ok(c && c.campo, `${id}: nel catalogo delle Functions, con il campo dove si scrive`);
        assert.ok(!FC.FAMIGLIE.includes(c.tipo), `${id}: non è una famiglia unica (avatar, colore, canzone): si compra come le aure`);
    }
    assert.equal(FC.perId('entrata-fulmine').campo, 'effettoEntrata');
});

test('Shop: dentro ogni categoria le voci sono in ordine di prezzo crescente (a parità, l\'ordine del catalogo)', () => {
    const N = require('../docs/negozio.js');
    const html = N.catalogoHtml({ saldo: 0, posseduti: {}, info: {}, pagina: {}, anteprime: {}, stagioni: {}, nomiStagioni: {} });
    const gruppi = [...html.matchAll(/<section class="ng-gruppo">[^]*?<\/section>/g)].map(m => m[0]);
    assert.ok(gruppi.length >= 7, 'tutte le categorie');
    for (const g of gruppi) {
        const ids = [...g.matchAll(/<li class="ng-voce[^"]*" data-tipo="[^"]*" data-id="([^"]+)"/g)].map(m => m[1]);
        const prezzi = ids.map(id => C.perId(id).prezzo);
        assert.deepEqual(prezzi, prezzi.slice().sort((a, b) => a - b), `${g.slice(0, 80)}: ${ids.join(', ')} ${prezzi.join(',')}`);
        // a parità di prezzo, l'ordine del catalogo
        const ordine = C.CATALOGO.map(c => c.id);
        for (let i = 1; i < ids.length; i++) if (prezzi[i] === prezzi[i - 1]) assert.ok(ordine.indexOf(ids[i - 1]) < ordine.indexOf(ids[i]), `${ids[i - 1]} prima di ${ids[i]}`);
    }
});

test('Zen: l\'ensō è un tratto di pennello (sagoma con spessore che cala, setole, bordi irregolari, maschera che lo traccia), non una linea', () => {
    const js = docs('entrate-vs.js');
    assert.match(js, /function ensoPennello\(doc, padre, h, t0\)/);
    assert.match(js, /feTurbulence/);
    assert.match(js, /feDisplacementMap/);
    assert.match(js, /el\('mask', \{ id: `\$\{id\}-m`/, 'la maschera che lo traccia');
    assert.match(js, /strokeDashoffset: \[`\$\{enso\.lunghezza\}`, '0'\]/);
    assert.match(js, /const enso = ensoPennello\(doc, D, h, c\.t0\);/, 'sta dietro l\'avatar');
    // la sagoma: spessore che cala lungo il tratto
    assert.match(js, /1 - 0\.8 \* Math\.pow\(\(f - 0\.05\) \/ 0\.95, 1\.25\)/);
    assert.match(docs('stile-card.css'), /--sc-anim: sc-olo 3s ease-in-out infinite;/, 'il foil olografico passa ogni 3 secondi');
});

// ---------------------------------------------------------------- la cornice appena comprata si vede subito

test('cornice appena comprata: lo Shop svuota la cache tra le pagine (db-leggero.js ricorda players per 3 minuti: Trainers, Stats e Formats mostravano ancora la vecchia)', async () => {
    const N = require('../docs/negozio.js');
    const finta = (risposta, extra = {}) => {
        const chiamate = [];
        const win = Object.assign({
            firebase: { functions() {}, app: () => ({ functions: regione => ({ httpsCallable: nome => async dati => { chiamate.push({ regione, nome, dati }); return { data: risposta }; } }) }) },
            DbLeggero: { svuotaCache: () => { chiamate.push('svuotata'); } }
        }, extra);
        return { win, chiamate };
    };
    const riuscita = finta({ ok: true, saldo: 100 });
    assert.deepEqual(await N.chiama(riuscita.win, 'acquistaCosmetico', { id: 'card-oro' }), { ok: true, saldo: 100 });
    assert.deepEqual(riuscita.chiamate.map(c => c.nome || c), ['acquistaCosmetico', 'svuotata'], 'prima il server, poi la cache');
    const rifiutata = finta({ ok: false, motivo: 'poor' });
    assert.equal((await N.chiama(rifiutata.win, 'acquistaCosmetico', { id: 'card-oro' })).motivo, 'poor');
    assert.ok(!rifiutata.chiamate.includes('svuotata'), 'se non è cambiato niente la cache resta');
    // senza il modulo, o con un modulo che si rompe, la risposta arriva lo stesso
    assert.equal((await N.chiama(finta({ ok: true }, { DbLeggero: undefined }).win, 'equipaCosmetico', {})).ok, true);
    assert.equal((await N.chiama(finta({ ok: true }, { DbLeggero: { svuotaCache() { throw new Error('scheda piena'); } } }).win, 'equipaCosmetico', {})).ok, true);
});

test('cache tra le pagine: svuotaCache toglie anche i colori dei giocatori (un colore comprato nello Shop compare subito altrove)', () => {
    const D = require('../docs/db-leggero.js');
    const memoria = new Map([['colori-giocatori-v1', '{"t":1,"v":{}}'], ['dbl-cache-v1:nodo:players', '1|{}'], ['altro', 'resta']]);
    const scheda = { get length() { return memoria.size; }, key: i => [...memoria.keys()][i], getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, v), removeItem: k => memoria.delete(k) };
    D.svuotaCache({ radice: { sessionStorage: scheda } });
    assert.deepEqual([...memoria.keys()], ['altro']);
});

test('cornice appena comprata: lo Shop carica db-leggero.js, e il salvataggio della propria pagina svuota la cache', () => {
    const shop = docs('shop.html');
    assert.ok(shop.indexOf('<script src="db-leggero.js"></script>') > 0, 'lo Shop ha il modulo');
    assert.ok(shop.indexOf('db-leggero.js') < shop.indexOf('<script src="negozio.js"'), 'prima di negozio.js');
    assert.match(docs('public-editor.js'), /await database\.ref\(`players\/\$\{chiave\}\/info`\)\.update\(aggiornamenti\);\n\s*try \{ if \(window\.DbLeggero\) window\.DbLeggero\.svuotaCache\(\); \} catch/);
});

test('Formats: ogni riga della classifica del formato ha l\'avatar e la cornice di quell\'allenatore (come Trainers e la classifica di stagione)', () => {
    const formats = docs('formats.html');
    assert.match(formats, /<link rel="stylesheet" href="finestre\.css">\n<link rel="stylesheet" href="stile-card\.css">/, 'dopo i fogli della pagina');
    assert.match(formats, /<script src="cosmetici\.js"><\/script>/);
    const righe = formats.slice(formats.indexOf('async function renderRankingsDelFormato('));
    assert.match(righe, /avatar: pData\.info\?\.avatar \|\| 'immagini\/magikarp\.png',/);
    assert.match(righe, /stileCard: window\.Cosmetici \? Cosmetici\.valido\(pData\.info\?\.stileCard, 'card'\) : '',/, 'solo un id del catalogo');
    assert.match(righe, /<span class="fmt-avatar"><img src="\$\{escHtml\(player\.avatar\)\}" alt="" loading="lazy" onerror="this\.onerror=null;this\.src='immagini\/magikarp\.png'"><\/span>/, 'l\'indirizzo passa da escHtml e se manca c\'è il Magikarp');
    const css = docs('style-formats.css');
    assert.match(css, /\.player-rank-row \{\s*position: relative;/, 'la riga è il riferimento degli strati della cornice');
    assert.match(css, /\.fmt-avatar img \{[^}]*object-fit: contain;/);
    assert.match(docs('stile-card.css'), /\.carta-players, \.carta-teams, \.player-rank-row, \.ms-lato, \.season-card, \.palm-card, \.hof-voce, \.sd-team, \.rs-campione, \.rs-premio, \.sc-campione\)\[data-stile-card\]/);
});

// ---------------------------------------------------------------- le cornici: strati, animazioni e una cornice luminosa per ogni aura

test('cornici luminose: ogni aura ha la sua cornice dello stesso colore ("<X> aura" -> "<X> glow"); le voci nuove tra le aure ne chiedono una anche qui', () => {
    const css = docs('stile-card.css');
    const MAPPA = {
        'aura-oro': 'card-bagliore-oro', 'aura-fiamma': 'card-bagliore-fiamma', 'aura-ghiaccio': 'card-bagliore-ciano', 'aura-arcobaleno': 'card-bagliore-arcobaleno', 'aura-smeraldo': 'card-bagliore-smeraldo',
        'aura-viola': 'card-bagliore-viola', 'aura-rosa': 'card-bagliore-rosa', 'aura-rosso': 'card-bagliore-rosso', 'aura-lime': 'card-bagliore-verde'
    };
    assert.deepEqual(per('aura').map(a => a.id).sort(), Object.keys(MAPPA).sort(), 'una aura nuova (o tolta) cambia anche le cornici: aggiornare qui la tabella');
    for (const a of per('aura')) {
        const c = C.perId(MAPPA[a.id]);
        assert.ok(c && c.tipo === 'card' && c.campo === 'stileCard', `${a.id}: manca ${MAPPA[a.id]} nel catalogo`);
        assert.equal(c.nome, a.nome.replace(/ aura$/, ' glow'), `${c.id}: il nome segue quello dell'aura`);
        assert.equal(c.prezzo, a.id === 'aura-arcobaleno' ? 900 : 600, `${c.id}: prezzo`);
        const inizio = css.indexOf(`[data-stile-card="${c.id}"] {`);
        assert.ok(inizio > 0, `${c.id}: ha il suo stile`);
        const gruppo = css.slice(inizio, css.indexOf('}', inizio));
        assert.match(gruppo, /--sc-glow:/);
        if (a.id !== 'aura-arcobaleno') {
            assert.ok(gruppo.includes(a.colore), `${c.id}: il colore dell'aura (${a.colore}) è nell'alone`);
            assert.match(gruppo, /--sc-glow2:/, `${c.id}: l'alone respira`);
        } else assert.match(gruppo, /--sc-anim: sc-arcobaleno /, 'l\'arcobaleno cambia colore');
    }
    // le tre di prima hanno tenuto il loro id (chi le ha comprate le ha ancora)
    for (const id of ['card-bagliore-ciano', 'card-bagliore-rosa', 'card-bagliore-verde']) assert.ok(C.perId(id), id);
});

test('cornici: gli strati (anello e decorazione) stanno dietro al testo, gli stili li accendono con una variabile e ogni animazione nominata esiste', () => {
    const css = docs('stile-card.css');
    assert.match(css, /isolation: isolate;/, 'la card è un contesto a sé: gli strati con z-index -1 stanno sopra il suo sfondo e sotto il testo');
    assert.match(css, /\[data-stile-card\]::before,\s*\n:root :is\([^)]*\)\[data-stile-card\]::after \{\s*position: absolute;\s*z-index: -1;\s*pointer-events: none;/);
    assert.match(css, /content: var\(--sc-deco-on, none\);/);
    assert.match(css, /content: var\(--sc-ring-on, none\);/);
    assert.match(css, /-webkit-mask-composite: xor;\s*mask: linear-gradient\(#000 0 0\) content-box, linear-gradient\(#000 0 0\);\s*mask-composite: exclude;/, 'l\'anello è ritagliato con la maschera (anche nei browser con il prefisso)');
    assert.match(css, /\.sc-campione\[data-stile-card\] \{ position: relative; \}/, 'il riquadro del negozio è il riferimento degli strati');
    // chi usa uno strato lo accende; chi lo accende lo riempie
    const blocchi = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter(b => /\[data-stile-card/.test(b) && /--sc-[a-z0-9-]+:/.test(b));
    for (const b of blocchi) {
        const nome = (b.match(/\[data-stile-card[^\]]*\]/) || [''])[0];
        assert.equal(/--sc-ring:/.test(b), /--sc-ring-on:/.test(b), `${nome}: anello e interruttore vanno insieme`);
        assert.equal(/--sc-deco:/.test(b), /--sc-deco-on:/.test(b), `${nome}: decorazione e interruttore vanno insieme`);
    }
    // ogni animazione nominata in uno stile ha il suo @keyframes
    const usate = new Set([...css.matchAll(/--sc-(?:ring-|deco-)?anim:\s*([a-z0-9-]+)/g)].map(m => m[1]));
    assert.ok(usate.size >= 8, 'ce n\'è una buona scelta');
    for (const n of usate) assert.ok(css.includes(`@keyframes ${n} `), `@keyframes ${n}`);
    // chi non vuole animazioni non le ha, nemmeno sugli strati
    assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\[data-stile-card\], \[data-stile-card\]::before, \[data-stile-card\]::after, \[data-stile-card\] \.pal-pedana \{ animation: none !important; \}/);
});
