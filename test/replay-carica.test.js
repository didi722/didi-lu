'use strict';
// Aprire un replay dentro la pagina (matches.html): leggere i dati dal file salvato, motore di Showdown e immagini dei Pokémon dalla cache del browser e dal sito.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = require('../docs/replay-sito.js');
const C = require('../docs/replay-carica.js');

const leggi = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const LOG = [
    '|player|p1|Didi||', '|player|p2|Lu||', '|gen|8', '|poke|p1|Garchomp, L50|', '|poke|p2|Blissey, L50|', '|poke|p2|Charizard-Mega-X, L50, M|',
    '|teampreview', '|start', '|switch|p1a: Garchomp|Garchomp, L50|100/100', '|switch|p2a: Blissey|Blissey, L50|100/100',
    '|turn|1', '|-formechange|p2a: Blissey|Chansey|[from] x', '|detailschange|p2a: Blissey|Charizard-Mega-X, L50|100/100', '|turn|2', '|win|Didi'
];
const SITO = 'https://sito.test/didi-lu/';
const replay = (extra = {}) => R.creaReplayHtml({
    log: LOG, p1: { nome: 'Didi', colore: '#31c489', avatar: 'https://sito.test/didi-lu/immagini/profile/1.png' }, p2: { nome: 'Lu & Co' }, etichetta: 'Little Cup & Co', match: 1, set: 2, ...extra
});

// ---------- leggere un replay salvato ----------
test('leggiReplay: dal file salvato si riprendono log, giocatori e testata (e ricostruendolo il replay è lo stesso)', () => {
    const letto = R.leggiReplay(replay());
    assert.deepEqual(letto.log, LOG);
    assert.deepEqual(letto.p1, { nome: 'Didi', colore: '#31c489', avatar: 'https://sito.test/didi-lu/immagini/profile/1.png' });
    assert.deepEqual(letto.p2, { nome: 'Lu & Co', colore: '', avatar: '' });
    assert.deepEqual([letto.etichetta, letto.match, letto.set], ['Little Cup & Co', '1', '2'], 'anche i caratteri speciali della testata tornano come erano');
    const dati = html => JSON.parse(/id="dati-replay">([\s\S]*?)<\/script>/.exec(html)[1]);
    const di = dati(replay());
    const ricostruito = dati(R.creaReplayHtml(letto));
    assert.equal(ricostruito.id, di.id, 'stesso replay (lo sfondo del campo lo decide il log)');
    assert.deepEqual(ricostruito.log, di.log);
    assert.equal(ricostruito.turni, di.turni);
    assert.deepEqual(ricostruito.p1, di.p1);
    assert.match(R.creaReplayHtml(letto), /<title>Didi vs Lu &amp; Co · Set 2 \| Poké-Tournament replay<\/title>/);
});

test('leggiReplay: quello che non è un replay del sito (Showdown caricato a mano, pagine qualunque, dati rotti) è null', () => {
    assert.equal(R.leggiReplay(''), null);
    assert.equal(R.leggiReplay(null), null);
    assert.equal(R.leggiReplay('<html><body><script type="text/plain" class="battle-log-data">|player|p1|a|</script></body></html>'), null);
    const rotto = replay().replace(/(id="dati-replay">)[\s\S]*?(<\/script>)/, '$1{non json$2');
    assert.equal(R.leggiReplay(rotto), null);
    const conDati = log => `<script type="application/json" id="dati-replay">${JSON.stringify({ log, p1: {}, p2: {} })}</script>`;
    assert.equal(R.leggiReplay(conDati('non è una lista')), null);
    assert.equal(R.leggiReplay(conDati([])), null);
    assert.equal(R.leggiReplay(conDati(['|turn|1', 7])), null);
    assert.equal(R.leggiReplay(conDati(new Array(20001).fill('|turn|1'))), null, 'un log enorme non si rimette in pagina');
});

test('leggiReplay: dal file entrano solo dati — colore e avatar strani (virgolette, javascript:) si scartano, i nomi si accorciano', () => {
    const html = `<script type="application/json" id="dati-replay">${JSON.stringify({
        log: LOG, p1: { nome: 'x'.repeat(200), colore: 'red;background:url(x)', avatar: 'javascript:alert(1)' }, p2: { nome: 7, colore: '#abc', avatar: 'cynthia' }
    })}</script>`;
    const l = R.leggiReplay(html);
    assert.equal(l.p1.nome.length, 60);
    assert.deepEqual([l.p1.colore, l.p1.avatar], ['', '']);
    assert.deepEqual(l.p2, { nome: '', colore: '#abc', avatar: 'cynthia' });
    assert.equal(R.leggiReplay(html.replace('javascript:alert(1)', 'https://a.test/x.png\\"onerror=\\"y')).p1.avatar, '');
    assert.equal(R.leggiReplay(html.replace('javascript:alert(1)', 'https://a.test/x.png')).p1.avatar, 'https://a.test/x.png');
});

// ---------- il file che si costruisce ----------
test('creaReplayHtml con il motore già scaricato: i fogli di stile vanno nel file, gli script puntano ai blob, quello che manca si chiede a Showdown', () => {
    const [css0, css1] = R.MOTORE.stili;
    const motore = { stili: { [css0]: 'body{color:red} </style><script>x</script>' }, script: { [R.MOTORE.script[0]]: 'blob:https://sito.test/uno', [R.MOTORE.script[1]]: 'https://cattivo.test/x.js' } };
    const html = replay({ motore });
    assert.match(html, /<style data-origine="https:\/\/play\.pokemonshowdown\.com\/style\/font-awesome\.css">body\{color:red\} <\\\/style><script>x<\/script><\/style>/, 'il CSS entra e non può chiudere lo <style>');
    assert.ok(html.includes(`<link rel="stylesheet" href="${css1}">`), 'quello che non c\'è si chiede a Showdown');
    assert.ok(html.includes('<script src="blob:https://sito.test/uno"></script>'));
    assert.ok(html.includes(`<script src="${R.MOTORE.script[1]}"></script>`), 'solo blob: va bene come indirizzo locale');
    assert.equal((html.match(/<script src=/g) || []).length, 16);
    // l'ordine degli script è quello di prima (battle.js per ultimo)
    const ordine = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('/').pop());
    assert.equal(ordine[ordine.length - 1], 'battle.js');
    // senza motore è il file di sempre
    const semplice = replay();
    assert.equal((semplice.match(/<link rel="stylesheet" href="https:\/\/play\.pokemonshowdown\.com/g) || []).length, 3);
    assert.ok(!semplice.includes('data-origine') && !semplice.includes('blob:'));
});

test('creaReplayHtml: i caratteri di Google non bloccano la pagina (un foglio di stile in testa ferma anche gli script dopo di lui)', () => {
    const html = replay();
    assert.match(html, /<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet" media="print" onload="this\.media='all'">/);
    assert.doesNotMatch(html, /<link href="https:\/\/fonts\.googleapis\.com[^>]*rel="stylesheet">/);
});

test('creaReplayHtml: le immagini del sito entrano nei dati solo se la pagina le ha (indirizzo della cartella + elenchi)', () => {
    const dati = html => JSON.parse(/id="dati-replay">([\s\S]*?)<\/script>/.exec(html)[1]);
    assert.equal(dati(replay()).sprites, undefined);
    assert.equal(dati(replay({ sprites: { ani: ['a'] } })).sprites, undefined, 'senza indirizzo non servono');
    assert.deepEqual(dati(replay({ sprites: { base: SITO, ani: ['garchomp'], back: ['garchomp'], altro: 1 } })).sprites, { base: SITO, ani: ['garchomp'], back: ['garchomp'] });
    assert.deepEqual(dati(replay({ sprites: { base: SITO } })).sprites, { base: SITO, ani: [], back: [] });
});

test('il codice dentro il replay (con le immagini) è JavaScript valido e immaginiReplay non ha variabili esterne', () => {
    const html = replay({ sprites: { base: SITO, ani: [], back: [] } });
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();
    assert.match(script, /^function immaginiReplay\(win, dati\)/);
    assert.doesNotThrow(() => new vm.Script(script));
    assert.match(script, /immaginiReplay\(window, dati\)/);
    // la funzione da sola, senza il resto del modulo, funziona: niente di quello che sta fuori
    const sola = new vm.Script(`(${R.immaginiReplay.toString()})`).runInNewContext({});
    assert.doesNotThrow(() => sola({ document: { addEventListener() {} } }, { log: [] }));
});

// ---------- immaginiReplay ----------
function paginaFinta() {
    const chiamate = [], caricate = [], timer = [], ascoltatori = {};
    const id = n => String(n).toLowerCase().replace(/[^a-z0-9-]/g, '');
    const win = {
        Dex: {
            getSpriteData(nome, davanti, opz) {
                chiamate.push({ nome, davanti, gen: opz && opz.gen });
                if (nome === 'Strano') throw new Error('nome sconosciuto');
                return { url: `https://play.pokemonshowdown.com/sprites/${davanti ? 'ani' : 'ani-back'}/${id(nome)}.gif`, w: 96 };
            }
        },
        document: { addEventListener: (tipo, f, cattura) => { ascoltatori[tipo] = { f, cattura }; } },
        Image: class { set src(v) { caricate.push(v); } },
        setTimeout: (f, ms) => { timer.push({ f, ms }); return timer.length; }
    };
    return { win, chiamate, caricate, timer, ascoltatori };
}
const imgFinta = src => { const a = {}; return { tagName: 'IMG', src, getAttribute: n => (n in a ? a[n] : null), setAttribute: (n, v) => { a[n] = v; } }; };

test('immaginiReplay: le GIF che il sito ha si chiedono al sito (davanti e di schiena), le altre a Showdown', () => {
    const p = paginaFinta();
    R.immaginiReplay(p.win, { log: LOG, sprites: { base: SITO, ani: ['garchomp'], back: ['blissey'] } });
    assert.equal(p.win.Dex.getSpriteData('Garchomp', true).url, `${SITO}sprites/ani/garchomp.gif`);
    assert.equal(p.win.Dex.getSpriteData('Garchomp', false).url, 'https://play.pokemonshowdown.com/sprites/ani-back/garchomp.gif', 'di schiena solo se c\'è anche quella');
    assert.equal(p.win.Dex.getSpriteData('Blissey', false).url, `${SITO}sprites/ani-back/blissey.gif`);
    assert.equal(p.win.Dex.getSpriteData('Blissey', true).url, 'https://play.pokemonshowdown.com/sprites/ani/blissey.gif');
    assert.ok(p.win.Dex.getSpriteData.sito);
    const avvolta = p.win.Dex.getSpriteData;
    R.immaginiReplay(p.win, { log: LOG, sprites: { base: SITO, ani: ['garchomp'], back: [] } });
    assert.equal(p.win.Dex.getSpriteData, avvolta, 'una seconda volta non si avvolge ancora');
});

test('immaginiReplay: senza immagini del sito il motore resta com\'è, ma le immagini si scaricano lo stesso prima di partire', () => {
    const p = paginaFinta();
    const originale = p.win.Dex.getSpriteData;
    R.immaginiReplay(p.win, { log: LOG });
    assert.equal(p.win.Dex.getSpriteData, originale);
    // i Pokémon del log (anche quelli che cambiano forma), ognuno davanti e di schiena, nella generazione del replay
    const nomi = [...new Set(p.chiamate.map(c => c.nome))];
    assert.deepEqual(nomi, ['Garchomp', 'Blissey', 'Charizard-Mega-X', 'Chansey']);
    assert.ok(p.chiamate.every(c => c.gen === 8));
    assert.equal(p.chiamate.length, nomi.length * 2);
    assert.equal(p.caricate.length, 8);
    assert.ok(p.caricate.includes('https://play.pokemonshowdown.com/sprites/ani-back/chansey.gif'));
});

test('immaginiReplay: con le immagini del sito si scaricano quelle del sito; un nome sconosciuto non ferma gli altri; senza Dex non succede niente', () => {
    const p = paginaFinta();
    R.immaginiReplay(p.win, { log: ['|gen|9', '|switch|p1a: x|Strano, L50|100/100', '|switch|p1a: x|Garchomp, L50|100/100'], sprites: { base: SITO, ani: ['garchomp'], back: ['garchomp'] } });
    assert.deepEqual(p.caricate, [`${SITO}sprites/ani/garchomp.gif`, `${SITO}sprites/ani-back/garchomp.gif`]);
    assert.ok(p.chiamate.every(c => c.gen === 9));
    const senza = paginaFinta();
    delete senza.win.Dex;
    assert.doesNotThrow(() => R.immaginiReplay(senza.win, { log: LOG, sprites: { base: SITO } }));
    assert.equal(senza.ascoltatori.error.cattura, true, 'anche senza Dex le immagini che non arrivano si riprovano');
});

test('immaginiReplay: un\'immagine che non arriva si riprova — dal sito si passa a Showdown, poi la stessa dopo 0,6 s e dopo 1,8 s, poi basta', () => {
    const p = paginaFinta();
    R.immaginiReplay(p.win, { log: LOG, sprites: { base: SITO, ani: ['garchomp'], back: [] } });
    const { f, cattura } = p.ascoltatori.error;
    assert.equal(cattura, true, 'l\'evento error non risale: si ascolta in cattura');
    const img = imgFinta(`${SITO}sprites/ani/garchomp.gif`);
    f({ target: img });
    assert.equal(img.src, 'https://play.pokemonshowdown.com/sprites/ani/garchomp.gif', 'subito Showdown');
    assert.equal(p.timer.length, 0);
    f({ target: img });
    assert.equal(p.timer.length, 1);
    assert.equal(p.timer[0].ms, 600);
    img.src = 'altro'; p.timer[0].f();
    assert.equal(img.src, 'https://play.pokemonshowdown.com/sprites/ani/garchomp.gif', 'riprova lo stesso indirizzo che non era arrivato');
    f({ target: img });
    assert.equal(p.timer[1].ms, 1800);
    f({ target: img });
    assert.equal(p.timer.length, 2, 'dopo due riprove rinuncia');
    // quello che non è l'immagine di un Pokémon non si tocca
    for (const x of [imgFinta('https://sito.test/avatar.png'), { tagName: 'SCRIPT', src: 'https://play.pokemonshowdown.com/sprites/x.gif', getAttribute: () => null, setAttribute() {} }, null]) {
        assert.doesNotThrow(() => f({ target: x }));
    }
    assert.equal(p.timer.length, 2);
});

// ---------- il motore di Showdown nella cache del browser ----------
function browserFinto({ ora = 1000, rete = true, tipo = 'application/javascript', stato = 200, casse = new Map(), memoria = new Map(), indirizzi = [] } = {}) {
    const richieste = [];
    let blobUrl = 0;
    const cassa = nome => { if (!casse.has(nome)) casse.set(nome, new Map()); return casse.get(nome); };
    const sandbox = { rete, tipo, stato, fallisciSu: null };
    const win = {
        ReplaySito: R,
        console: { warn() {} },
        localStorage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, v) },
        caches: { open: async nome => { const c = cassa(nome); return { match: async u => c.get(u), put: async (u, r) => { c.set(u, r); } }; } },
        fetch: async (u, opz) => {
            richieste.push({ url: u, opz });
            if (indirizzi.length) indirizzi.push(u);
            if (!sandbox.rete || (sandbox.fallisciSu && u === sandbox.fallisciSu)) throw new TypeError('Failed to fetch');
            const corpo = /\.css$/.test(u) ? `.a{background:url(../fx/pioggia.png)}` : `corpo(${u})`;
            return { ok: sandbox.stato === 200, status: sandbox.stato, type: 'cors', headers: { get: () => sandbox.tipo }, clone() { return this; }, text: async () => corpo };
        },
        Blob: class { constructor(parti, opz) { this.parti = parti; this.type = opz && opz.type; } },
        URL: class extends URL { static createObjectURL(b) { return `blob:${SITO}${++blobUrl}`; } },
        location: { href: `${SITO}matches.html?id=s2` },
        SpriteLocali: { ani: ['garchomp'], back: [] }
    };
    return { win, sandbox, richieste, casse, memoria, cassa };
}
const TUTTI = R.MOTORE.stili.length + R.MOTORE.script.length;

test('motore: la prima volta si scarica tutto (CORS, senza cookie) e si tiene; i replay dopo lo trovano già pronto (una sola preparazione per pagina)', async () => {
    C.azzera();
    const b = browserFinto();
    const m = await C.preparaMotore(b.win, { adesso: 5000 });
    assert.equal(TUTTI, 19);
    assert.equal(b.richieste.length, TUTTI);
    assert.ok(b.richieste.every(r => r.opz.mode === 'cors' && r.opz.credentials === 'omit'));
    assert.equal(Object.keys(m.stili).length, 3);
    assert.equal(Object.keys(m.script).length, 16);
    assert.equal(m.stili[R.MOTORE.stili[0]], '.a{background:url(https://play.pokemonshowdown.com/fx/pioggia.png)}', 'gli indirizzi relativi del foglio di stile diventano assoluti');
    assert.ok(Object.values(m.script).every(u => u.startsWith('blob:')));
    assert.equal(b.casse.get(C.NOME_CACHE).size, TUTTI, 'tutto nella cache del browser');
    assert.equal(b.memoria.get(C.CHIAVE_CONTROLLO), '5000');
    assert.equal(await C.preparaMotore(b.win), m, 'la stessa promessa');
    assert.equal(b.richieste.length, TUTTI);
});

test('motore: una pagina nuova lo trova nella cache e non scarica niente; dopo un giorno lo rinfresca in silenzio, e solo se arrivano tutti i file', async () => {
    C.azzera();
    const prima = browserFinto();
    await C.preparaMotore(prima.win, { adesso: 5000 });
    // pagina nuova, stesso browser, poco dopo: niente rete
    C.azzera();
    const poi = browserFinto({ casse: prima.casse, memoria: prima.memoria });
    const m = await C.preparaMotore(poi.win, { adesso: 5000 + 3600 * 1000 });
    assert.equal(poi.richieste.length, 0);
    assert.equal(Object.keys(m.script).length, 16);

    // dopo più di un giorno: parte subito dalla cache e intanto rinfresca
    C.azzera();
    const giorno = browserFinto({ casse: prima.casse, memoria: prima.memoria });
    const adesso = 5000 + C.VALIDITA_MS + 1;
    const m2 = await C.preparaMotore(giorno.win, { adesso });
    assert.equal(Object.keys(m2.script).length, 16, 'il replay non aspetta il rinfresco');
    await new Promise(r => setImmediate(r));
    assert.equal(giorno.richieste.length, TUTTI);
    assert.ok(giorno.richieste.every(r => r.opz.cache === 'no-cache'), 'rinfresco con la validazione, non un secondo scaricamento inutile');
    assert.equal(giorno.memoria.get(C.CHIAVE_CONTROLLO), String(adesso), 'ricordato: un rinfresco al giorno');

    // un file che non arriva: i file nuovi non si mettono a metà, resta tutto com'era
    C.azzera();
    const rotto = browserFinto({ casse: prima.casse, memoria: new Map([[C.CHIAVE_CONTROLLO, '1']]) });
    rotto.sandbox.fallisciSu = R.MOTORE.script[5];
    const vecchio = [...prima.casse.get(C.NOME_CACHE).values()];
    await C.preparaMotore(rotto.win, { adesso });
    await new Promise(r => setImmediate(r));
    assert.deepEqual([...prima.casse.get(C.NOME_CACHE).values()], vecchio, 'nessun file sostituito');
});

test('motore: se non si può (CORS rifiutato, file che non esiste, pagina d\'errore, niente cache del browser, troppo lento) è null e il replay si chiede a Showdown come prima', async () => {
    for (const [nome, prepara] of [
        ['rete', b => { b.sandbox.rete = false; }],
        ['404', b => { b.sandbox.stato = 404; }],
        ['pagina html', b => { b.sandbox.tipo = 'text/html; charset=utf-8'; }],
        ['senza cache', b => { delete b.win.caches; }],
        ['senza blob', b => { delete b.win.URL.createObjectURL; }],
        ['senza ReplaySito', b => { delete b.win.ReplaySito; }]
    ]) {
        C.azzera();
        const b = browserFinto();
        prepara(b);
        assert.equal(await C.preparaMotore(b.win), null, nome);
        if (nome === 'rete') { const n = b.richieste.length; await C.preparaMotore(b.win); assert.equal(b.richieste.length, n, 'dopo un fallimento non si insiste a ogni replay'); }
    }
    C.azzera();
    const lento = browserFinto();
    lento.win.fetch = () => new Promise(() => {});
    lento.win.setTimeout = (f, ms) => { if (ms === C.ATTESA_MASSIMA_MS) f(); return 1; };
    lento.win.clearTimeout = () => {};
    assert.equal(await C.preparaMotore(lento.win), null, 'oltre l\'attesa massima si apre il replay come prima');
});

test('assolutizzaCss: url() e @import relativi diventano quelli di Showdown, quelli già assoluti, data: e # restano', () => {
    const base = 'https://play.pokemonshowdown.com/style/battle.css';
    const css = `@import 'altro.css'; .a{background:url(../fx/a.png)} .b{background:url( "b.png" ) no-repeat} @font-face{src:url('../fonts/f.woff?v=4.7') format('woff'),url(data:font/woff;base64,AA==),url(https://cdn.test/x.woff),url(//cdn.test/y.woff)} .c{filter:url(#nebbia)} .d{background:url(/sprites/d.png)}`;
    assert.equal(C.assolutizzaCss(css, base),
        `@import 'https://play.pokemonshowdown.com/style/altro.css'; .a{background:url(https://play.pokemonshowdown.com/fx/a.png)} .b{background:url("https://play.pokemonshowdown.com/style/b.png") no-repeat} ` +
        `@font-face{src:url('https://play.pokemonshowdown.com/fonts/f.woff?v=4.7') format('woff'),url(data:font/woff;base64,AA==),url(https://cdn.test/x.woff),url(//cdn.test/y.woff)} .c{filter:url(#nebbia)} .d{background:url(https://play.pokemonshowdown.com/sprites/d.png)}`);
});

// ---------- apri / ferma ----------
function iframeFinto() {
    const storia = [];
    const f = { src: 'iniziale', __srcdoc: undefined, removeAttribute(n) { if (n === 'srcdoc') { f.__srcdoc = undefined; storia.push('rimosso'); } } };
    Object.defineProperty(f, 'srcdoc', { get: () => f.__srcdoc, set: v => { f.__srcdoc = v; storia.push(v === C.CARICAMENTO ? 'caricamento' : 'replay'); } });
    f.storia = storia;
    return f;
}
const URL_REPLAY = 'https://firebasestorage.googleapis.com/v0/b/b/o/replays%2Fx%2Fmatch1%2Fset2.html?alt=media&token=t';
function conStorage(b, { corpo, ok = true } = {}) {
    const fetchMotore = b.win.fetch;
    b.win.fetch = async (u, opz) => {
        if (u === URL_REPLAY) { b.richieste.push({ url: u, opz }); if (corpo instanceof Error) throw corpo; return { ok, status: ok ? 200 : 404, text: async () => corpo }; }
        return fetchMotore(u, opz);
    };
    return b;
}

test('apri: mentre si prepara si vede "Loading replay", poi il replay è dentro la pagina (srcdoc) con motore in cache, immagini del sito e il suo contenuto', async () => {
    C.azzera();
    const b = conStorage(browserFinto(), { corpo: replay() });
    const f = iframeFinto();
    const esito = await C.apri(b.win, f, URL_REPLAY);
    assert.equal(esito, 'sito');
    assert.deepEqual(f.storia, ['caricamento', 'replay']);
    assert.equal(f.src, 'iniziale', 'non si naviga più verso Storage');
    assert.match(C.CARICAMENTO, /Loading replay/);
    assert.ok(f.srcdoc.includes('<script src="blob:'));
    assert.ok(f.srcdoc.includes('data-origine="https://play.pokemonshowdown.com/style/battle.css"'));
    const dati = JSON.parse(/id="dati-replay">([\s\S]*?)<\/script>/.exec(f.srcdoc)[1]);
    assert.deepEqual(dati.sprites, { base: SITO, ani: ['garchomp'], back: [] }, 'l\'indirizzo della cartella del sito e le immagini che ci sono');
    assert.deepEqual(dati.log, LOG);
    assert.equal(dati.p2.nome, 'Lu & Co');
    // il file di Storage si chiede senza cookie, il motore in parallelo
    assert.equal(b.richieste[0].url, URL_REPLAY);
    assert.deepEqual(b.richieste[0].opz, { credentials: 'omit' });
    // il replay dopo non riscarica il motore
    const n = b.richieste.length;
    await C.apri(b.win, iframeFinto(), URL_REPLAY);
    assert.equal(b.richieste.length, n + 1, 'solo il file del replay');
});

test('apri: se il motore non si può preparare il replay si apre lo stesso dalla pagina, con gli script di Showdown', async () => {
    C.azzera();
    const b = conStorage(browserFinto(), { corpo: replay() });
    delete b.win.caches;
    const f = iframeFinto();
    assert.equal(await C.apri(b.win, f, URL_REPLAY), 'sito-senza-motore');
    assert.ok(f.srcdoc.includes('<script src="https://play.pokemonshowdown.com/js/battle.js"></script>'));
    assert.ok(!f.srcdoc.includes('blob:'));
});

test('apri: se il file non è un replay del sito, non si legge o la rete non c\'è, si apre dal suo indirizzo come prima', async () => {
    for (const [nome, b] of [
        ['replay di Showdown', conStorage(browserFinto(), { corpo: '<html><script type="text/plain" class="battle-log-data">|player|p1|a|</script></html>' })],
        ['rete', conStorage(browserFinto(), { corpo: new TypeError('Failed to fetch') })],
        ['404', conStorage(browserFinto(), { corpo: '', ok: false })]
    ]) {
        C.azzera();
        const f = iframeFinto();
        assert.equal(await C.apri(b.win, f, URL_REPLAY), 'esterno', nome);
        assert.equal(f.src, URL_REPLAY, nome);
        assert.equal(f.srcdoc, undefined, `${nome}: senza srcdoc, che altrimenti vincerebbe sull'indirizzo`);
    }
    C.azzera();
    const f = iframeFinto();
    assert.equal(await C.apri({ ...conStorage(browserFinto(), { corpo: replay() }).win, ReplaySito: undefined }, f, URL_REPLAY), 'esterno', 'replay-sito.js non caricato');
});

test('apri/ferma: se si clicca un altro set mentre il primo si prepara, vale l\'ultimo; chiudere la finestra ferma anche un replay ancora in preparazione e toglie l\'audio', async () => {
    C.azzera();
    const b = conStorage(browserFinto(), { corpo: replay() });
    const f = iframeFinto();
    const [primo, secondo] = await Promise.all([C.apri(b.win, f, URL_REPLAY), C.apri(b.win, f, URL_REPLAY)]);
    assert.deepEqual([primo, secondo], ['annullato', 'sito']);
    assert.equal(f.storia.filter(s => s === 'replay').length, 1);

    C.azzera();
    const g = iframeFinto();
    const inCorso = C.apri(b.win, g, URL_REPLAY);
    C.ferma(b.win, g);
    assert.equal(await inCorso, 'annullato');
    assert.equal(g.srcdoc, undefined);
    assert.equal(g.src, '');
    C.ferma(b.win, null);
});

// ---------- il sito ----------
test('matches.html: carica replay-carica.js dopo replay-sito.js, apre i replay del sito con ReplayCarica (e come prima se manca), lo prepara all\'apertura della finestra e lo ferma alla chiusura', () => {
    const h = leggi('docs/matches.html');
    assert.ok(h.indexOf('<script src="replay-carica.js"></script>') > h.indexOf('<script src="replay-sito.js"></script>'));
    assert.match(h, /if \(window\.ReplayCarica\) window\.ReplayCarica\.apri\(window, iframe, urlFile\);\s*else iframe\.src = urlFile;/);
    assert.match(h, /if \(window\.ReplayCarica\) window\.ReplayCarica\.ferma\(window, iframe\);\s*else iframe\.src = "";/);
    const apri = h.slice(h.indexOf('async function apriMatch('), h.indexOf("selector.style.display = 'flex'"));
    assert.match(apri, /window\.ReplayCarica\.scalda\(window\)/);
    // e anche già quando si apre il riepilogo del showdown: il replay è il passo dopo
    const modale = h.slice(h.indexOf('async function apriModaleShowdown('), h.indexOf('async function apriModaleShowdown(') + 600);
    assert.match(modale, /typeof ReplayCarica !== 'undefined'\) ReplayCarica\.scalda\(window\)/);
    // le immagini dei Pokémon del sito ci sono prima che il replay si apra
    assert.ok(h.indexOf('sprites/indice.js') > 0 && h.indexOf('sprite-pkm.js') > 0);
});

test('i file: replay-carica.js non è in functions/ (gira solo nel browser), replay-sito.js è identico nelle due cartelle', () => {
    assert.ok(!fs.existsSync(path.join(__dirname, '..', 'functions', 'replay-carica.js')));
    assert.equal(leggi('docs/replay-sito.js'), leggi('functions/replay-sito.js'));
});

test('service worker: anche le GIF di schiena del sito (sprites/ani-back) si tengono per sempre, come le altre', () => {
    assert.match(leggi('docs/sw.js'), /\/sprites\\\/\(ani\|ani-back\|dex\)\\\//);
});
