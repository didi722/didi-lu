'use strict';
// I blocchi dei team nel Box: finestrelle con striscia nera, bilancio W/L, barra delle vittorie e sei tessere con lo sprite
// sul disco del colore del tipo. Qui: i collegamenti, lo stile (movimento, telefono, temi) e il markup che scrive
// renderizza() in box.html, eseguendolo con un documento finto; più il colore del tipo che applicaColoreBordo() mette alla tessera.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const box = docs('box.html');
const css = docs('box-team.css');
const locali = h => [...h.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map(m => m[1]).filter(x => !/^https?:/.test(x));
const D = require('../docs/dettagli.js');

test('box.html carica box-team.css dopo style-box.css e dettagli.css, prima di tooltip.css e mobile.css', () => {
    const fogli = locali(box);
    assert.ok(fogli.includes('box-team.css'));
    assert.ok(fogli.indexOf('box-team.css') > fogli.indexOf('style-box.css'));
    assert.ok(fogli.indexOf('box-team.css') > fogli.indexOf('dettagli.css'));
    assert.ok(fogli.indexOf('box-team.css') < fogli.indexOf('tooltip.css'));
    assert.ok(fogli.indexOf('box-team.css') < fogli.indexOf('mobile.css'));
});

test('box-team.css: striscia con tre pallini, categoria, azioni e bilancio; carta e ombre del tema (con ripiego)', () => {
    assert.match(css, /\.card-header \{[^}]*position: absolute;[^}]*height: 34px;/);
    assert.match(css, /radial-gradient\(circle at 18px 50%, #ff5f57[\s\S]*?#febc2e[\s\S]*?#28c840/);
    assert.match(css, /\.card-header \.stats \{[^}]*background: var\(--nb-giallo, #ffbd44\)/);
    assert.match(css, /\.azione-elimina:hover[^}]*var\(--nb-rosso, #ff4444\)/);
    for (const v of ['--nb-ink', '--nb-carta', '--nb-tip-bg', '--nb-sh-m', '--nb-sh-l', '--nb-sh-s', '--nb-raggio', '--nb-rot', '--nb-font-titoli', '--nb-giallo', '--nb-verde', '--nb-motivo']) {
        assert.match(css, new RegExp(`var\\(${v},`), `${v} senza ripiego`);
    }
    // la carta si tinge col colore dell'allenatore solo dove il browser sa mescolare i colori
    assert.match(css, /@supports \(background: color-mix\(in srgb, red 10%, white\)\) \{\s*\.card \{[\s\S]*?color-mix\(in srgb, var\(--accent-color, #31c489\) 16%/);
});

test('box-team.css: tessere con lo sprite sul disco del tipo (--tipo), tre per riga, fumetto che si apre verso l\'interno', () => {
    assert.match(css, /\.card \.pkm-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.card \.pkm-sprite-container \{[\s\S]*?var\(--tipo, var\(--accent-color, #31c489\)\)/);
    assert.match(css, /\.pkm-box:nth-child\(3n \+ 1\) \.pkm-hover-card \{ left: 0;/);
    assert.match(css, /\.pkm-box:nth-child\(3n \+ 2\) \.pkm-hover-card \{ left: 50%;/);
    assert.match(css, /\.pkm-box:nth-child\(3n \+ 3\) \.pkm-hover-card \{ left: auto; right: 0;/);
});

test('box-team.css: le card entrano una dopo l\'altra solo la prima volta, e non se il sistema chiede meno movimento', () => {
    assert.match(css, /@keyframes box-cade/);
    assert.match(css, /#teamsGrid\.intro \.card \{ animation: box-cade[^}]*animation-delay: calc\(var\(--i, 0\) \* 70ms\)/);
    const ridotto = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css);
    assert.ok(ridotto);
    assert.match(ridotto[1], /#teamsGrid\.intro \.card \{ animation: none; \}/);
});

test('box-team.css: sul telefono niente rotazioni, striscia più alta con pulsanti da dito; sotto i 360px la categoria prende il posto dei pallini', () => {
    const tel = /@media \(max-width: 900px\) \{([\s\S]*?)\n\}/.exec(css);
    assert.ok(tel);
    assert.match(tel[1], /\.card \{ rotate: 0deg;/);
    assert.match(tel[1], /\.card-header \{ height: 40px;/);
    assert.match(tel[1], /\.card-azione \{ width: 30px; height: 30px;/);
    // la regola dei 360px sta dopo quella dei 400px (a parità di forza vince l'ultima)
    assert.ok(css.indexOf('@media (max-width: 360px)') > css.indexOf('@media (max-width: 400px)'));
});

test('style-box.css non ha più le regole delle vecchie azioni a capo (due fogli sulla stessa card si pestano i piedi)', () => {
    const vecchio = docs('style-box.css');
    assert.ok(!/\.card-actions button \{ font-size: 20px !important/.test(vecchio));
    assert.ok(!/\.card-header \.card-actions \{ order: 3/.test(vecchio));
});

// ---------- il markup che scrive renderizza() ----------
function eseguiRenderizza(lista, { bloccati = [], grid } = {}) {
    const inizio = box.indexOf('async function renderizza(lista)');
    const fine = box.indexOf('async function caricaInfoAbilita');
    assert.ok(inizio > 0 && fine > inizio, 'renderizza non trovata');
    const sorgente = box.slice(inizio, fine) + '\nreturn renderizza;';
    const griglia = grid || {
        innerHTML: '', dataset: {}, _classi: new Set(),
        classList: { toggle(c, on) { if (on) griglia._classi.add(c); else griglia._classi.delete(c); } }
    };
    const finestra = { nomiTeamBloccati: new Set(bloccati), coloriPokemonNoti: undefined };
    const ambiente = {
        window: finestra,
        document: { getElementById: id => (id === 'teamsGrid' ? griglia : null) },
        caricaTeamBloccati: async () => {},
        applicaColoreBordo: () => {},
        setTimeout: () => 0,
        EFFETTI_NATURE: {},
        formattaEffettoNatura: () => '',
        SpritePkm: require('../docs/sprite-pkm.js')     // il nome della GIF lo decide la regola condivisa
    };
    const renderizza = new Function(...Object.keys(ambiente), sorgente)(...Object.values(ambiente));
    return renderizza(lista).then(() => ({ griglia, finestra, html: griglia.innerHTML }));
}
const squadra = (id, nome, v, s, pokemon = ['Calyrex-Shadow', 'Clefairy']) => ({
    id, nome, categoria: 'VGC Reg G', vittorie: v, sconfitte: s,
    pokemon: pokemon.map(n => ({ nome: n, strumento: 'Focus Sash', abilita: 'As One', evs: '252 HP', mosse: ['Protect'] }))
});

test('renderizza: finestrella per team con striscia, azioni, bilancio, barra delle vittorie e le tessere dei Pokémon', async () => {
    const { html, griglia } = await eseguiRenderizza([squadra('t1', 'Martiri', 9, 3), squadra('t2', 'Mai giocato', 0, 0)]);
    assert.equal((html.match(/<div class="card" style="--i: \d+;"/g) || []).length, 2);
    assert.match(html, /style="--i: 0;"[\s\S]*style="--i: 1;"/, 'posizione di ogni card, per l\'entrata a cascata');
    assert.match(html, /<span class="category">VGC Reg G<\/span>/);
    assert.match(html, /<span class="stats">W: 9 \/ L: 3<\/span>/);
    // barra: 9 su 12 = 75%; il team che non ha giocato non ha barra
    assert.match(html, /<div class="card-winrate" title="75% of matches won"><span style="width:75%"><\/span><b>75% wins<\/b><\/div>/);
    assert.equal((html.match(/class="card-winrate"/g) || []).length, 1);
    // le tre azioni sono pulsanti con classe (non più stili in linea), e fermano il clic della card
    assert.equal((html.match(/class="card-azione azione-cpu"/g) || []).length, 2);
    assert.equal((html.match(/class="card-azione azione-modifica"/g) || []).length, 2);
    assert.equal((html.match(/class="card-azione azione-elimina"/g) || []).length, 2);
    assert.ok(!/onmouseenter="this\.style\.backgroundColor/.test(html.split('<div class="pkm-grid">')[0]), 'niente più colori di passaggio scritti in linea');
    assert.equal((html.match(/class="pkm-box"/g) || []).length, 4);
    assert.equal(griglia._classi.has('intro'), true, 'la prima volta le card entrano a cascata');
});

test('renderizza: l\'entrata a cascata è solo la prima volta (cercando o filtrando le card non ripartono)', async () => {
    const { griglia } = await eseguiRenderizza([squadra('t1', 'A', 1, 0)]);
    assert.equal(griglia._classi.has('intro'), true);
    await eseguiRenderizza([squadra('t1', 'A', 1, 0)], { grid: griglia });
    assert.equal(griglia._classi.has('intro'), false, 'seconda volta: niente intro');
});

test('renderizza: un team bloccato (in una stagione) ha solo la prova contro la CPU, non modifica né elimina', async () => {
    const { html } = await eseguiRenderizza([squadra('t1', 'Rain Dance', 1, 3)], { bloccati: ['rain dance'] });
    assert.equal((html.match(/azione-cpu/g) || []).length, 1);
    assert.ok(!html.includes('azione-modifica') && !html.includes('azione-elimina'));
    assert.match(html, /title="Practice this team against the CPU">🎮<\/button>/);
});

test('renderizza: una tessera il cui colore è già noto nasce colorata (niente lampeggio quando si ridisegna)', async () => {
    const inizio = box.indexOf('async function renderizza(lista)');
    assert.ok(inizio > 0);
    const griglia = { innerHTML: '', dataset: {}, classList: { toggle() {} } };
    const finestra = { nomiTeamBloccati: new Set(), coloriPokemonNoti: { 'Calyrex-Shadow': '#ff5599' } };
    const sorgente = box.slice(inizio, box.indexOf('async function caricaInfoAbilita')) + '\nreturn renderizza;';
    const amb = { window: finestra, document: { getElementById: () => griglia }, caricaTeamBloccati: async () => {}, applicaColoreBordo() {}, setTimeout: () => 0, formattaEffettoNatura: () => '', SpritePkm: require('../docs/sprite-pkm.js') };
    await new Function(...Object.keys(amb), sorgente)(...Object.values(amb))([squadra('t1', 'A', 1, 0)]);
    assert.match(griglia.innerHTML, /id="box-t1-0" style="--tipo: #ff5599;"/);
    assert.ok(!/id="box-t1-1" style=/.test(griglia.innerHTML), 'il Pokémon di cui non si sa il tipo non ha stile');
});

test('applicaColoreBordo: il primo tipo di PokéAPI diventa il colore (--tipo) della tessera, e si ricorda', async () => {
    const inizio = box.indexOf('async function applicaColoreBordo');
    const fine = box.indexOf('function gestisciErroreSprite');
    assert.ok(inizio > 0 && fine > inizio);
    const tessera = { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
    const finestra = {};
    const amb = {
        window: finestra, Dettagli: D, console: { warn() {}, error() {} },
        document: { getElementById: id => (id === 'box-t1-0' ? tessera : null) },
        fetch: async () => ({ ok: true, json: async () => ({ types: [{ type: { name: 'ghost' } }, { type: { name: 'psychic' } }] }) })
    };
    const fn = new Function(...Object.keys(amb), box.slice(inizio, fine) + '\nreturn applicaColoreBordo;')(...Object.values(amb));
    await fn('Calyrex-Shadow', 'box-t1-0');
    assert.equal(tessera.style.props['--tipo'], '#6666bb', 'ghost');
    assert.equal(finestra.coloriPokemonNoti['Calyrex-Shadow'], '#6666bb');
    // un nome che PokéAPI non conosce (risposta non ok) non cambia nulla e non dà errore
    const senza = new Function(...Object.keys(amb), box.slice(inizio, fine) + '\nreturn applicaColoreBordo;')(...Object.values({ ...amb, fetch: async () => ({ ok: false, status: 404 }) }));
    const t2 = { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
    await senza('Boh', 't2');
    assert.deepEqual(t2.style.props, {});
});
