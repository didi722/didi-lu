'use strict';
// Il caricamento all'apertura dell'app (docs/app-precarica.js): le GIF dei Pokémon si scaricano mentre la schermata del titolo mostra la barra, così nelle pagine ci sono già.
//   - quali specie servono (compagni, team di Stats, Box del giocatore) e in che ordine;
//   - la coda: al massimo 6 per volta, due tentativi, la catena delle immagini di una specie, il tetto d'attesa;
//   - cosa c'è già nelle cache del service worker (a una seconda apertura non si scarica niente);
//   - il collegamento col menù, col service worker e con la posizione in classifica.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../docs/app-precarica.js');
const Sprite = require('../docs/sprite-pkm.js');

const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
/** I timer dei test: le attese brevi (pause fra i tentativi, attesa del service worker) scattano rapido, i tempi lunghi (scadenza di un'immagine, tetto) mai */
const rapido = (f, ms) => { if (ms <= 2000) Promise.resolve().then(f); return 1; };

/** Un'Image finta: `esito(url)` dice se carica; ricorda gli indirizzi chiesti e quante ne sono in volo */
function immagineFinta(esito, stato = { chieste: [], inVolo: 0, massimo: 0 }) {
    return Object.assign(class {
        set src(url) {
            if (!url) return;
            stato.chieste.push(url);
            stato.inVolo += 1; stato.massimo = Math.max(stato.massimo, stato.inVolo);
            Promise.resolve(esito(url)).then(ok => { stato.inVolo -= 1; if (ok) this.onload && this.onload(); else this.onerror && this.onerror(); });
        }
    }, { stato });
}

/** Un `caches` finto con le due cache dell'app e quello che c'è dentro */
function cacheFinte(dentro = []) {
    const insiemi = { [P.CACHE_IMMAGINI]: new Set(dentro), [P.CACHE_OPACHE]: new Set() };
    return { insiemi, open: async nome => ({ match: async u => (insiemi[nome].has(u) ? {} : undefined) }) };
}

const players = {
    didi: { info: { pkmPreferito: 'Garchomp', avatar: 'immagini/avatars/didi.png' }, teams: { t1: { pokemon: [{ nome: 'Kingambit' }, { nome: 'Mr. Mime' }] } } },
    lukiani: { info: { pkmPreferito: 'garchomp ', avatar: 'immagini/avatars/didi.png' } },
    anna: { info: { pkmPreferito: 'Mr. Mime', avatar: 'https://example.org/a.png' } },
    senza: { info: {} }
};
const iscritti = {
    s1: { OU: { didi: { datiTeams: { a: { pokemon: [{ nome: 'Garchomp' }, { nome: 'Iron Valiant' }, { nome: 'Gholdengo' }] } } }, anna: { datiTeams: { b: { pokemon: { 0: { nome: 'Gholdengo' }, 1: { nome: 'Urshifu-Rapid-Strike' } } } } } } },
    s2: { UU: { lukiani: { datiTeams: { c: { pokemon: [{ nome: 'Gholdengo' }, { nome: '' }, null] } } } } }
};

test('specieDa: i compagni per primi, poi i tuoi del Box, poi i team iscritti dal più comune; due nomi con lo stesso file contano uno', () => {
    const lista = P.specieDa({ players, stagioni: iscritti, giocatore: 'Didi' });
    // Garchomp (2 compagni, 1 team) e Mr. Mime (1 compagno + Box) davanti; Kingambit del Box; poi i team (Gholdengo 3, gli altri 1)
    assert.deepEqual(lista, ['Garchomp', 'Mr. Mime', 'Kingambit', 'Gholdengo', 'Iron Valiant', 'Urshifu-Rapid-Strike']);
    assert.equal(new Set(lista.map(s => Sprite.id(s))).size, lista.length, 'nessun doppione');
    assert.deepEqual(P.specieDa({ players, stagioni: iscritti }).slice(0, 2), ['Garchomp', 'Mr. Mime'], 'senza giocatore niente Box');
    assert.ok(!P.specieDa({ players, stagioni: iscritti }).includes('Kingambit'));
    assert.deepEqual(P.specieDa({}), []);
    assert.deepEqual(P.specieDa({ players: null, stagioni: null, giocatore: 'x' }), []);
});

test('specieDa: i nomi con soprannome o forme danno la specie giusta, e il nome pulito è quello della GIF', () => {
    const l = P.specieDa({ players: { x: { info: { pkmPreferito: 'Fuoco (Charizard)' } }, y: { info: { pkmPreferito: 'Charizard' } } } });
    assert.equal(l.length, 1, 'stesso file, un solo scaricamento');
    assert.equal(Sprite.gif(l[0]), 'https://play.pokemonshowdown.com/sprites/ani/charizard.gif');
});

test('avatarDa: indirizzi assoluti, senza doppioni e senza quelli che non si possono scaricare', () => {
    const a = P.avatarDa(players, 'https://didi722.github.io/didi-lu/menu.html');
    assert.deepEqual(a, ['https://didi722.github.io/didi-lu/immagini/avatars/didi.png', 'https://example.org/a.png']);
    assert.deepEqual(P.avatarDa({ x: { info: { avatar: 'javascript:alert(1)' } }, y: {} }, 'https://a.b/'), []);
    assert.deepEqual(P.avatarDa(null, 'https://a.b/'), []);
});

test('caricaImmagine: vero se arriva, falso se dà errore o ci mette troppo (e la richiesta si annulla)', async () => {
    const Img = immagineFinta(u => !/rotta/.test(u));
    assert.equal(await P.caricaImmagine('https://x/ok.gif', { Immagine: Img }), true);
    assert.equal(await P.caricaImmagine('https://x/rotta.gif', { Immagine: Img }), false);
    // che non finisce mai: il tempo scade
    let scatta;
    const Lenta = class { set src(v) { this._s = v; } };
    const p = P.caricaImmagine('https://x/lenta.gif', { Immagine: Lenta, scadenza: 15000, setTempo: f => { scatta = f; return 1; } });
    scatta();
    assert.equal(await p, false);
    assert.equal(await P.caricaImmagine('x', { Immagine: null }), false, 'senza Image (Node) non fa niente');
});

test('lavoroSpecie: la GIF animata ha due tentativi, poi si passa alle altre della catena (GIF Gen 5, PNG del Pokédex); basta che una arrivi', async () => {
    const catena = Sprite.catena('Gholdengo');
    assert.equal(catena.length, 3);
    // la GIF animata manca (404): due prove, poi la Gen 5 che c'è
    let stato = { chieste: [], inVolo: 0, massimo: 0 };
    let Img = immagineFinta(u => u === catena[1], stato);
    assert.equal(await P.lavoroSpecie('Gholdengo', { Immagine: Img, setTempo: rapido })(), true);
    assert.deepEqual(stato.chieste, [catena[0], catena[0], catena[1]]);
    // arriva al secondo tentativo (la rete si era solo impuntata): non si scende di qualità
    stato = { chieste: [], inVolo: 0, massimo: 0 };
    let prima = true;
    Img = immagineFinta(u => { if (u === catena[0] && prima) { prima = false; return false; } return u === catena[0]; }, stato);
    assert.equal(await P.lavoroSpecie('Gholdengo', { Immagine: Img, setTempo: rapido })(), true);
    assert.deepEqual(stato.chieste, [catena[0], catena[0]]);
    // niente da nessuna parte
    stato = { chieste: [], inVolo: 0, massimo: 0 };
    assert.equal(await P.lavoroSpecie('Gholdengo', { Immagine: immagineFinta(() => false, stato), setTempo: rapido })(), false);
    assert.equal(stato.chieste.length, 4, 'due prove sulla prima, una sulle altre');
});

test('eseguiCoda: al massimo N lavori per volta, ognuno con i suoi tentativi; dice a che punto è e quali non sono riusciti (anche se lanciano)', async () => {
    let inCorso = 0, massimo = 0;
    const lavoro = k => async () => { inCorso++; massimo = Math.max(massimo, inCorso); await new Promise(r => setImmediate(r)); inCorso--; return k !== 3; };
    const passi = [];
    const r = await P.eseguiCoda(Array.from({ length: 20 }, (_, k) => lavoro(k)), { concorrenza: 6, tentativi: 2, setTempo: rapido, avanza: (f, t) => passi.push([f, t]) });
    assert.equal(massimo, 6, 'mai più di 6 insieme (tutte insieme si contendono la rete e alcune cadono)');
    assert.equal(r.riusciti, 19);
    assert.deepEqual(r.falliti, [3]);
    assert.equal(passi.length, 20);
    assert.deepEqual(passi[19], [20, 20]);
    assert.deepEqual(passi.map(p => p[0]), passi.map((_, i) => i + 1), 'i passi crescono uno alla volta');

    let prove = 0;
    const r2 = await P.eseguiCoda([async () => { prove++; if (prove < 2) throw new Error('rete'); return true; }, async () => { throw new Error('sempre'); }], { tentativi: 2, setTempo: rapido });
    assert.deepEqual([r2.riusciti, r2.falliti], [1, [1]], 'un errore non ferma la coda; al secondo tentativo il primo riesce');
    assert.deepEqual(await P.eseguiCoda([], {}), { riusciti: 0, falliti: [] });
});

test('inCache e daScaricare: a una seconda apertura non manca niente; una specie è a posto se una qualunque immagine della sua catena c\'è; chi non c\'è per niente si riprova dopo un giorno', async () => {
    const specie = ['Garchomp', 'Gholdengo', 'Missingno'];
    const avatar = ['https://a.b/x.png', 'https://a.b/y.png'];
    const win = { caches: cacheFinte([Sprite.gif('Garchomp'), Sprite.dex('Gholdengo'), 'https://a.b/x.png']) };
    const m = await P.daScaricare(win, { specie, avatar });
    assert.deepEqual(m.specie, ['Missingno']);
    assert.deepEqual(m.avatar, ['https://a.b/y.png']);
    assert.equal(m.totale, 5);
    // una GIF nella cache delle risposte opache conta lo stesso
    win.caches.insiemi[P.CACHE_OPACHE].add(Sprite.gif('Missingno'));
    assert.deepEqual((await P.daScaricare(win, { specie, avatar })).specie, []);
    // senza l'API delle cache (contesto non sicuro) si scarica tutto
    assert.deepEqual((await P.daScaricare({}, { specie, avatar })).specie, specie);
    // le specie che non c'erano per niente non si riprovano per un giorno
    const adesso = 1e12;
    const vuota = { caches: cacheFinte() };
    assert.deepEqual((await P.daScaricare(vuota, { specie: ['Garchomp'], fallite: { garchomp: adesso - 3600e3 }, adesso })).specie, []);
    assert.deepEqual((await P.daScaricare(vuota, { specie: ['Garchomp'], fallite: { garchomp: adesso - P.SILENZIO_FALLITE_MS - 1 }, adesso })).specie, ['Garchomp']);
});

test('attendiServiceWorker: il service worker si prende la pagina poco dopo la prima apertura; finché non c\'è quello che si scarica non viene salvato, quindi si aspetta, ma poco', async () => {
    assert.equal(await P.attendiServiceWorker({}, 2000), false, 'senza service worker si parte');
    assert.equal(await P.attendiServiceWorker({ navigator: { serviceWorker: { controller: {} } } }), true, 'già al lavoro');
    let scatta;
    const sw = { controller: null, addEventListener: (ev, f) => { if (ev === 'controllerchange') sw.cambia = f; } };
    const p = P.attendiServiceWorker({ navigator: { serviceWorker: sw } }, 2000, f => { scatta = f; return 1; });
    sw.controller = {}; sw.cambia();
    assert.equal(await p, true);
    const sw2 = { controller: null, addEventListener() {} };
    const q = P.attendiServiceWorker({ navigator: { serviceWorker: sw2 } }, 2000, f => { scatta = f; return 2; });
    scatta();
    assert.equal(await q, false, 'passati i 2 secondi si parte comunque');
});

/** Una finestra finta con Firebase (players e teams_iscritti), memoria del browser, cache e service worker */
function finestra({ memoria = {}, giaInCache = [], firebaseRotto = false } = {}) {
    const letture = [];
    const dati = { players, 'seasons/s1/teams_iscritti': iscritti.s1, 'seasons/s2/teams_iscritti': iscritti.s2 };
    return {
        letture, memoria,
        location: { href: 'https://didi722.github.io/didi-lu/menu.html' },
        localStorage: { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); } },
        caches: cacheFinte(giaInCache),
        navigator: { serviceWorker: { controller: {} } },
        firebase: { database: () => ({ ref: p => ({ once: async () => { letture.push(p); if (firebaseRotto) throw new Error('offline'); const v = dati[p]; return { val: () => (v === undefined ? null : v) }; } }) }) }
    };
}

test('leggiElenco: l\'elenco si ricorda per 4 ore (aprire l\'app di nuovo non rilegge Firebase); se Firebase non risponde si usa l\'ultimo ricordato', async () => {
    const win = finestra();
    const prima = await P.leggiElenco(win, { idsStagioni: Promise.resolve(['s1', 's2']), giocatore: () => 'didi', adesso: 1000 });
    assert.ok(prima.specie.includes('Gholdengo') && prima.specie.includes('Kingambit'));
    assert.deepEqual(win.letture.sort(), ['players', 'seasons/s1/teams_iscritti', 'seasons/s2/teams_iscritti']);
    assert.ok(prima.avatar.includes('https://didi722.github.io/didi-lu/immagini/avatars/didi.png'));
    // dopo mezz'ora: dalla memoria
    const n = win.letture.length;
    assert.deepEqual(await P.leggiElenco(win, { idsStagioni: Promise.resolve([]), adesso: 1000 + 1800e3 }), prima);
    assert.equal(win.letture.length, n, 'nessuna lettura');
    // dopo 5 ore: si rilegge; se Firebase è giù, l'elenco di prima
    const giu = Object.assign(finestra({ firebaseRotto: true }), { memoria: win.memoria, localStorage: win.localStorage });
    assert.deepEqual(await P.leggiElenco(giu, { idsStagioni: Promise.resolve(['s1']), adesso: 1000 + 5 * 3600e3 }), prima);
    // senza memoria e senza Firebase: niente (l'app si apre lo stesso)
    assert.deepEqual(await P.leggiElenco(finestra({ firebaseRotto: true }), { idsStagioni: Promise.resolve(['s1']) }), { specie: [], avatar: [] });
    assert.deepEqual(await P.leggiElenco({ localStorage: { getItem: () => { throw new Error('bloccato'); }, setItem() {} }, location: {} }, {}), { specie: [], avatar: [] }, 'memoria del browser bloccata');
});

test('players: il nodo si legge una volta sola per pagina (lo usa anche la posizione in classifica); un errore non resta in memoria', async () => {
    const win = finestra();
    const [a, b] = await Promise.all([P.players(win), P.players(win)]);
    assert.equal(a, b);
    assert.equal(win.letture.filter(p => p === 'players').length, 1);
    const rotta = finestra({ firebaseRotto: true });
    await assert.rejects(P.players(rotta));
    await new Promise(r => setImmediate(r));
    assert.equal(rotta.__appPlayers, null, 'la prossima volta si riprova');
    await assert.rejects(P.players({}), /Firebase/);
});

test('avvia: legge l\'elenco, scarica solo quello che manca (6 per volta), fa avanzare la barra fino a 1 e chiama fine una volta; la seconda apertura non scarica niente', async () => {
    const win = finestra();
    const stato = { chieste: [], inVolo: 0, massimo: 0 };
    global.Image = immagineFinta(u => { win.caches.insiemi[P.CACHE_IMMAGINI].add(u); return true; }, stato);      // la GIF scaricata finisce nella cache del service worker
    try {
        const passi = []; let fini = 0;
        const r = await P.avvia(win, { idsStagioni: Promise.resolve(['s1', 's2']), giocatore: () => 'didi', avanza: f => passi.push(f), fine: () => { fini += 1; }, setTempo: rapido, adesso: () => 5000 });
        const attese = P.specieDa({ players, stagioni: iscritti, giocatore: 'didi' });
        assert.equal(r.daScaricare, attese.length + 2, 'una GIF per specie e i due avatar');
        assert.equal(r.riusciti, r.daScaricare);
        assert.equal(r.falliti, 0);
        assert.ok(stato.massimo <= P.CONCORRENZA, 'mai più di ' + P.CONCORRENZA + ' insieme: ' + stato.massimo);
        assert.equal(stato.chieste.filter(u => /\/ani\//.test(u)).length, attese.length, 'la GIF animata di ogni specie');
        assert.equal(passi[0], 0);
        assert.equal(passi[passi.length - 1], 1);
        assert.ok(passi.every((f, i) => i === 0 || f >= passi[i - 1]), 'la barra non torna indietro');
        assert.equal(fini, 1, 'fine una volta sola');

        // seconda apertura: è tutto nelle cache
        stato.chieste.length = 0;
        let fini2 = 0;
        const r2 = await P.avvia(win, { idsStagioni: Promise.resolve([]), giocatore: () => 'didi', fine: () => { fini2 += 1; }, setTempo: rapido, adesso: () => 6000 });
        assert.equal(r2.daScaricare, 0);
        assert.equal(stato.chieste.length, 0, 'niente in rete');
        assert.equal(fini2, 1);
    } finally { delete global.Image; }
});

test('avvia: se la rete è lenta l\'app si apre lo stesso (fine allo scadere del tetto) e le GIF continuano ad arrivare; le specie senza immagini non si riprovano per un giorno', async () => {
    const win = finestra();
    const rilascia = [];
    global.Image = class { set src(u) { if (!u) return; rilascia.push(() => this.onerror && this.onerror()); } };
    try {
        const timer = []; let fini = 0;
        const setTempo = f => { timer.push(f); return timer.length; };
        const corsa = P.avvia(win, { idsStagioni: Promise.resolve([]), giocatore: () => '', fine: () => { fini += 1; }, setTempo, attesa: 25000, adesso: () => 7000 });
        // il primo timer è il tetto (25 s): lo si fa scattare mentre le GIF sono ancora in volo
        await new Promise(r => setImmediate(r));
        await new Promise(r => setImmediate(r));
        timer[0]();
        assert.equal(fini, 1, 'il menù non resta fermo');
        // le immagini finiscono (tutte in errore) e poi la coda e i timer di pausa
        for (let giro = 0; giro < 400 && !win.memoria[P.CHIAVE_FALLITE]; giro++) {
            rilascia.splice(0).forEach(f => f());
            timer.splice(1).forEach(f => f());
            await new Promise(r => setImmediate(r));
        }
        const r = await corsa;
        assert.ok(r.falliti > 0);
        assert.equal(fini, 1, 'fine resta una');
        const fallite = JSON.parse(win.memoria[P.CHIAVE_FALLITE]);
        assert.equal(fallite.garchomp, 7000, 'ricordato quando');
    } finally { delete global.Image; }
});

test('le cache sono quelle del service worker, e gli sprite sono quelli che il service worker tiene (stessi host e percorsi)', () => {
    const sw = docs('sw.js');
    assert.ok(sw.includes(`'${P.CACHE_IMMAGINI}'`), 'cache delle risposte normali');
    assert.ok(sw.includes(`'${P.CACHE_OPACHE}'`), 'cache delle risposte opache');
    assert.ok(sw.includes("host: 'play.pokemonshowdown.com', percorso: '/sprites/'"), 'le GIF di Showdown le salva il service worker');
    assert.match(sw, /MASSIMO_OPACHE = (\d+)/);
    assert.ok(Number(/MASSIMO_OPACHE = (\d+)/.exec(sw)[1]) >= 120, 'abbastanza posto per le GIF scaricate all\'apertura anche se Showdown non permette il CORS');
});

test('il menù: le GIF partono quando Firebase c\'è, con gli id delle stagioni (senza le cup); la barra è un quinto scene e il resto GIF; l\'app non resta mai ferma; la posizione usa la stessa lettura di players', () => {
    const js = docs('app-menu.js');
    assert.match(js, /P\.avvia\(win, \{ idsStagioni, giocatore: \(\) => \(giocatore \? giocatore\.id : ''\)/);
    assert.match(js, /risolviIds\(trovate\.filter\(t => t\.info && String\(t\.info\.tipo \|\| ''\)\.toLowerCase\(\)\.trim\(\) !== 'cup'\)/);
    assert.match(js, /const parti = \(\) => \{\s*auth\(\)\.onAuthStateChanged\(user => \{ caricaGiocatore\(user\); \}\);\s*caricaStagione\(\);\s*avviaGif\(\);/);
    assert.match(js, /\+\+n > 50\) \{ win\.clearInterval\(t\); risolviIds\(\[\]\); avviaGif\(\); \}/, 'senza Firebase si parte lo stesso');
    assert.match(js, /mostra\(\.2 \* parte\.scene \+ \.8 \* parte\.gif\)/);
    assert.match(js, /finito\.scene = finito\.gif = true; prova\(\); \}, 32000\)/);
    assert.match(docs('app-comune.js'), /win\.AppPrecarica && typeof win\.AppPrecarica\.players === 'function' \? await win\.AppPrecarica\.players\(win\)/);
    // lo script è nel menù (prima di app-menu.js) con quello che gli serve per i nomi dei file
    const html = docs('menu.html');
    assert.ok(html.indexOf('sprite-pkm.js') < html.indexOf('app-precarica.js') && html.indexOf('app-precarica.js') < html.indexOf('app-menu.js'));
});
