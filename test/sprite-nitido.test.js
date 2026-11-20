'use strict';
// I Pokémon molto ingranditi sul palco della pagina pubblica: le GIF si decodificano (gif-frames.js), si ingrandiscono con xBR (xbr.js) e si animano su un canvas (sprite-nitido.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const XBR = require('../docs/xbr.js');
const GifFrames = require('../docs/gif-frames.js');
const SN = require('../docs/sprite-nitido.js');

const DOCS = path.join(__dirname, '..', 'docs');
const sprite = nome => new Uint8Array(fs.readFileSync(path.join(DOCS, 'sprites', 'ani', `${nome}.gif`)));
const letto = f => fs.readFileSync(path.join(DOCS, f), 'utf8');

// Il contenuto dei fotogrammi con i colori dei pixel trasparenti azzerati (la GIF non dice che colore hanno): l'impronta è quella di ffmpeg sulle stesse GIF
const impronta = px => {
    const c = Buffer.from(px.buffer.slice(px.byteOffset, px.byteOffset + px.byteLength));
    for (let i = 0; i < c.length; i += 4) if (!c[i + 3]) c[i] = c[i + 1] = c[i + 2] = 0;
    return crypto.createHash('sha1').update(c).digest('hex').slice(0, 16);
};

// Una GIF fatta a mano (codici LZW "libera tutto e scrivi un colore", senza compressione): per provare la sovrapposizione dei fotogrammi senza file
function gifFinta(L, A, palette, fotogrammi) {
    const out = [];
    const b = (...v) => out.push(...v);
    const w16 = n => b(n & 255, n >> 8);
    out.push(...Buffer.from('GIF89a'));
    w16(L); w16(A); b(0x80 | 0x01, 0, 0);                         // tavolozza globale da 4 colori
    for (const [r, g, bl] of palette) b(r, g, bl);
    for (const f of fotogrammi) {
        b(0x21, 0xf9, 4, ((f.disposal || 0) << 2) | (f.trasparente != null ? 1 : 0)); w16(f.ritardo); b(f.trasparente || 0, 0);
        b(0x2c); w16(f.x); w16(f.y); w16(f.l); w16(f.a); b(0);
        b(2);                                                      // dimensione minima dei codici: 2 (clear = 4, fine = 5, codici da 3 bit)
        let bit = 0, nbit = 0; const dati = [];
        const codice = c => { bit |= c << nbit; nbit += 3; while (nbit >= 8) { dati.push(bit & 255); bit >>= 8; nbit -= 8; } };
        for (const i of f.indici) { codice(4); codice(i); }
        codice(5); if (nbit) dati.push(bit & 255);
        for (let i = 0; i < dati.length; i += 255) { const blocco = dati.slice(i, i + 255); b(blocco.length, ...blocco); }
        b(0);
    }
    b(0x3b);
    return new Uint8Array(out);
}
const NERO = [0, 0, 0], ROSSO = [255, 0, 0], VERDE = [0, 255, 0], BLU = [0, 0, 255];
const colore = (px, i) => [...new Uint8Array(px.buffer, i * 4, 4)];

// ---------------------------------------------------------------- la GIF in fotogrammi

test('gif-frames: i fotogrammi sono identici a quelli di ffmpeg (impronte di una GIF di Showdown a 66x79 e di una Mega a 74x98)', () => {
    const f = GifFrames.decodificaGif(sprite('froslass'));
    assert.deepEqual([f.larghezza, f.altezza, f.frame.length, f.frame[0].ritardo], [66, 79, 69, 30]);
    assert.equal(f.frame[0].px.length, 66 * 79);
    assert.deepEqual([0, 20, 68].map(i => impronta(f.frame[i].px)), ['717417db76f51414', 'fc51a2bf273c8ef4', '203f2fe5ad691cb5']);
    const g = GifFrames.decodificaGif(sprite('gardevoir-mega'));
    assert.deepEqual([g.larghezza, g.altezza, g.frame.length], [74, 98, 72]);
    assert.deepEqual([0, 20, 71].map(i => impronta(g.frame[i].px)), ['1d82a67ad039c693', '9c02a1161a5de8c1', '7a150773da5910e1']);
});

test('gif-frames: i fotogrammi parziali si sovrappongono come nel browser (trasparenza, "disposal" 2 = si cancella la zona, ritardi sotto i 20 ms = 100)', () => {
    const byte = gifFinta(3, 2, [NERO, ROSSO, VERDE, BLU], [
        { x: 0, y: 0, l: 3, a: 2, indici: [1, 1, 1, 1, 1, 1], ritardo: 10 },
        { x: 1, y: 0, l: 2, a: 1, indici: [2, 0], trasparente: 0, disposal: 2, ritardo: 1 },
        { x: 0, y: 1, l: 1, a: 1, indici: [3], ritardo: 20 }
    ]);
    const d = GifFrames.decodificaGif(byte);
    assert.deepEqual(d.frame.map(f => f.ritardo), [100, 100, 200], '10 cs = 100 ms; 1 cs (troppo veloce per i browser) = 100 ms; 20 cs = 200 ms');
    const R = [...ROSSO, 255], V = [...VERDE, 255], B = [...BLU, 255], T = [0, 0, 0, 0];
    // 1: tutto rosso
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => colore(d.frame[0].px, i)), [R, R, R, R, R, R]);
    // 2: un verde in (1,0); il pixel trasparente del fotogramma lascia il rosso di prima
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => colore(d.frame[1].px, i)), [R, V, R, R, R, R]);
    // 3: la zona del fotogramma 2 è stata cancellata (disposal 2): ora è trasparente, non rossa; in (0,1) il blu nuovo
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(i => colore(d.frame[2].px, i)), [R, T, T, B, R, R]);
    // niente fotogrammi che si toccano tra loro
    assert.notEqual(d.frame[0].px.buffer, d.frame[1].px.buffer);
});

test('gif-frames: quello che non è una GIF (o è troppo grande per essere uno sprite) è null, non un errore', () => {
    assert.equal(GifFrames.decodificaGif(new Uint8Array([1, 2, 3, 4])), null);
    assert.equal(GifFrames.decodificaGif(new Uint8Array(0)), null);
    assert.equal(GifFrames.decodificaGif(sprite('froslass').slice(0, 60)), null, 'una GIF tagliata a metà');
    const enorme = gifFinta(300, 300, [NERO, ROSSO, VERDE, BLU], [{ x: 0, y: 0, l: 1, a: 1, indici: [1], ritardo: 5 }]);
    assert.equal(GifFrames.decodificaGif(enorme), null, '300x300 pixel: non è uno sprite');
});

// ---------------------------------------------------------------- xBR

test('xbr: l\'immagine esce 2, 3 o 4 volte più grande; il colore piatto resta quello, il vuoto resta vuoto; con blendColors il bordo diagonale si ammorbidisce', () => {
    const L = 10, A = 10, ROSSO32 = 0xff0000ff;
    const px = new Uint32Array(L * A);
    for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) if (x + y >= 9) px[y * L + x] = ROSSO32;          // una diagonale: sotto è rosso, sopra è trasparente
    for (const k of [2, 3, 4]) {
        const out = XBR[`xbr${k}x`](px, L, A, { blendColors: true, scaleAlpha: true });
        assert.ok(out instanceof Uint32Array);
        assert.equal(out.length, L * k * A * k);
        assert.equal(out[(A * k - 2) * L * k + L * k - 2] >>> 0, ROSSO32 >>> 0, 'in fondo a destra: rosso pieno');
        assert.equal(out[1 * L * k + 1] >>> 0, 0, 'in alto a sinistra: ancora trasparente');
        const alfa = o => [...new Set(Array.from(o, p => p >>> 24))];
        assert.ok(alfa(out).some(a => a > 0 && a < 255), `x${k}: il bordo ha mezze trasparenze (liscio)`);
        assert.deepEqual(alfa(XBR[`xbr${k}x`](px, L, A, { blendColors: false, scaleAlpha: true })).filter(a => a > 0 && a < 255), [], `x${k} senza blendColors: nessun colore nuovo, il bordo resta netto`);
    }
});

// ---------------------------------------------------------------- scegliere come ingrandire

test('sprite-nitido: di quanto si ingrandisce, e meno se i fotogrammi non starebbero in memoria', () => {
    assert.equal(SN.fattore(2.1, 66, 79, 69), 2);
    assert.equal(SN.fattore(3, 66, 79, 69), 2);
    assert.equal(SN.fattore(3.5, 66, 79, 69), 3);
    assert.equal(SN.fattore(4.5, 66, 79, 69), 4);
    assert.equal(SN.fattore(9, 66, 79, 69), 4, 'più di 4 non esiste');
    assert.equal(SN.fattore(5, 146, 81, 119), 3, 'Wailord: 119 fotogrammi 146x81: a 4x sarebbero 90 MB, a 3x 51');
    assert.equal(SN.fattore(5, 84, 124, 110), 3, 'Mega Froslass (84x124, un centinaio di fotogrammi): 4x sarebbero 73 MB, 3x ne sono 41');
    assert.equal(SN.fattore(5, 200, 200, 300), 0, 'troppo grande anche a 2x: si lascia l\'immagine com\'è');
    for (const [r, l, a, n] of [[5, 66, 79, 69], [5, 146, 81, 119], [4, 118, 193, 60]]) {
        const k = SN.fattore(r, l, a, n);
        assert.ok(n * l * k * a * k * 4 <= SN.MAX_BYTE, `${l}x${a} x${n}: sta nei ${SN.MAX_BYTE / 1e6} MB`);
    }
});

test('sprite-nitido: si leggono solo le GIF del sito e quelle di raw.githubusercontent.com (play.pokemonshowdown.com non dà il permesso)', () => {
    const luogo = { href: 'https://didi722.github.io/didi-lu/public.html', origin: 'https://didi722.github.io' };
    assert.equal(SN.leggibile('sprites/ani/froslass.gif', luogo), true, 'indirizzo relativo = del sito');
    assert.equal(SN.leggibile('https://didi722.github.io/didi-lu/sprites/ani/froslass.gif', luogo), true);
    assert.equal(SN.leggibile('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/6.gif', luogo), true);
    assert.equal(SN.leggibile('https://play.pokemonshowdown.com/sprites/ani/froslass-mega.gif', luogo), false);
    assert.equal(SN.leggibile('http://raw.githubusercontent.com/x.gif', luogo), false, 'solo https');
    assert.equal(SN.leggibile('https://altro.example/x.gif', luogo), false);
    assert.equal(SN.leggibile('', { href: 'file:///x/public.html', origin: 'null' }), false);
    assert.equal(SN.leggibile('sprites/ani/x.gif', { href: 'file:///x/public.html', origin: 'null' }), false, 'una pagina aperta da file: non ha un\'origine');
});

// ---------------------------------------------------------------- un browser finto

function fintoBrowser(byte, opzioni = {}) {
    const o = Object.assign({ url: 'https://didi722.github.io/didi-lu/sprites/ani/froslass.gif', altezza: 355 }, opzioni);
    const chiamate = [], disegni = [], coda = [], timer = [];
    let osservatore = null;
    class ImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } }
    const ctx = { putImageData(img) { disegni.push(img); } };
    const win = {
        location: { href: 'https://didi722.github.io/didi-lu/public.html', origin: 'https://didi722.github.io' },
        devicePixelRatio: 1,
        ImageData,
        document: { createElement: tag => ({ tag, width: 0, height: 0, isConnected: false, className: '', attrs: {}, dataset: {}, setAttribute(k, v) { this.attrs[k] = v; }, getContext: () => (o.senzaContesto ? null : ctx) }) },
        fetch: async (url, init) => { chiamate.push({ url, init }); if (o.errore) throw new Error('rete'); return { ok: !o.nonOk, arrayBuffer: async () => byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.byteLength) }; },
        requestAnimationFrame: f => coda.push(f),
        setTimeout: f => timer.push(f)
    };
    if (!o.senzaOsservatore) win.IntersectionObserver = class { constructor(f) { osservatore = this; this.f = f; this.disconnesso = false; } observe() {} disconnect() { this.disconnesso = true; } };
    const img = {
        currentSrc: o.url, src: o.url, clientHeight: o.altezza, alt: 'Froslass', className: 'pp-pkm-img pp-ingrandita', isConnected: true,
        replaceWith(c) { this.sostituita = c; this.isConnected = false; c.isConnected = true; }
    };
    return {
        win, img, chiamate, disegni, osservatore: () => osservatore,
        // un giro del browser: tutte le richieste di animazione in coda, con quell'ora
        passo(ora) { const f = coda.splice(0); f.forEach(x => x(ora)); return f.length; },
        inCoda: () => coda.length,
        // gli intervalli: i fotogrammi che mancano si preparano uno alla volta
        scorri() { let n = 0; while (timer.length && n++ < 1000) timer.shift()(); return n; }
    };
}

test('migliora: il canvas prende il posto dell\'<img> (stesse classi e misure, senza i pixel a blocchi) e disegna subito il primo fotogramma', async () => {
    SN.svuota();
    const b = fintoBrowser(sprite('froslass'));
    const c = await SN.migliora(b.img, { win: b.win });
    assert.ok(c, 'è stato sostituito');
    assert.equal(b.img.sostituita, c);
    assert.equal(c.dataset.nitido, 'xbr4', '355 px per 79 di GIF = 4,5 volte: xBR 4x');
    assert.deepEqual([c.width, c.height], [66 * 4, 79 * 4]);
    assert.equal(c.className, 'pp-pkm-img', 'via pp-ingrandita (image-rendering: pixelated): il canvas è già liscio');
    assert.equal(c.attrs.role, 'img');
    assert.equal(c.attrs['aria-label'], 'Froslass');
    assert.equal(b.chiamate.length, 1);
    assert.equal(b.chiamate[0].url, 'https://didi722.github.io/didi-lu/sprites/ani/froslass.gif');
    assert.equal(b.chiamate[0].init.credentials, 'omit');
    assert.equal(b.disegni.length, 1);
    assert.deepEqual([b.disegni[0].width, b.disegni[0].height, b.disegni[0].data.length], [264, 316, 264 * 316 * 4]);
    // il fotogramma disegnato è quello vero ingrandito: dentro il corpo (bianco/azzurro) ci sono pixel pieni, ai bordi del canvas c'è il vuoto
    const d = b.disegni[0].data;
    assert.equal(d[3], 0, 'angolo in alto a sinistra trasparente');
    assert.ok(Array.from({ length: 264 * 316 }, (_, i) => d[i * 4 + 3]).filter(a => a === 255).length > 264 * 316 * 0.25, 'lo sprite è pieno');
});

test('migliora: l\'animazione segue i ritardi della GIF, salta i fotogrammi persi se il browser è in ritardo e si ferma da sola', async () => {
    SN.svuota();
    const b = fintoBrowser(sprite('froslass'));
    const c = await SN.migliora(b.img, { win: b.win });
    assert.equal(b.inCoda(), 1, 'una richiesta di animazione in attesa');
    b.passo(1000);                      // il primo giro fissa la scadenza: fotogramma 0 per 30 ms
    b.passo(1029); assert.equal(b.disegni.length, 1, 'a 29 ms ancora lo stesso fotogramma');
    b.passo(1031); assert.equal(b.disegni.length, 2, 'a 31 ms il fotogramma 1');
    b.passo(1061); assert.equal(b.disegni.length, 3, 'a 61 ms il 2');
    b.passo(1061 + 30 * 10 + 5); assert.equal(b.disegni.length, 4, 'in ritardo di dieci fotogrammi: se ne disegna uno solo (quello giusto), non dieci');
    assert.equal(b.inCoda(), 1);
    // un giro completo: torna al fotogramma 0 (69 fotogrammi da 30 ms)
    const prima = b.disegni.length;
    for (let t = 1400; t < 1400 + 30 * 69; t += 30) b.passo(t);
    assert.ok(b.disegni.length - prima >= 65, 'l\'animazione continua e ricomincia');
    // fuori dallo schermo: non si disegna (ma l'animazione resta in piedi per quando torna)
    b.osservatore().f([{ isIntersecting: false }]);
    const ferme = b.disegni.length;
    b.passo(9000); b.passo(9100); assert.equal(b.disegni.length, ferme, 'invisibile: niente disegni');
    b.osservatore().f([{ isIntersecting: true }]);
    b.passo(9200); b.passo(9300); assert.ok(b.disegni.length > ferme, 'di nuovo visibile: riprende');
    // il canvas esce dalla pagina (un altro Pokémon): il giro finisce e non ne parte un altro
    c.isConnected = false;
    b.passo(9400);
    assert.equal(b.inCoda(), 0, 'nessuna richiesta in coda');
    assert.equal(b.osservatore().disconnesso, true, 'e l\'osservatore è spento');
});

test('migliora: i fotogrammi che mancano si preparano negli intervalli (e quelli già pronti non si rifanno)', async () => {
    SN.svuota();
    const b = fintoBrowser(sprite('froslass'));
    await SN.migliora(b.img, { win: b.win });
    const dati = await SN.carica('https://didi722.github.io/didi-lu/sprites/ani/froslass.gif', b.win);
    assert.equal(dati.xbr[4].filter(Boolean).length, 1, 'all\'inizio solo il primo');
    assert.ok(b.scorri() > 60, 'un fotogramma per intervallo');
    assert.equal(dati.xbr[4].filter(Boolean).length, 69, 'alla fine tutti');
    assert.equal(b.chiamate.length, 1, 'la GIF si è scaricata una volta sola');
});

test('migliora: dove il browser ha i "momenti liberi" (requestIdleCallback) i fotogrammi si preparano solo finché c\'è tempo', async () => {
    SN.svuota();
    const b = fintoBrowser(sprite('froslass'));
    const liberi = [];
    let restante = 5;
    b.win.requestIdleCallback = (f, opzioni) => { assert.equal(opzioni.timeout, 300, 'se la pagina è sempre occupata, entro 300 ms si lavora lo stesso'); liberi.push(f); };
    await SN.migliora(b.img, { win: b.win });
    const dati = await SN.carica('https://didi722.github.io/didi-lu/sprites/ani/froslass.gif', b.win);
    const pronti = () => dati.xbr[4].filter(Boolean).length;
    assert.equal(liberi.length, 1, 'un solo invito in attesa');
    liberi.shift()({ timeRemaining: () => restante });
    assert.equal(pronti(), 2, 'con poco tempo (5 ms) un fotogramma alla volta');
    restante = 100;
    liberi.shift()({ timeRemaining: () => restante });
    assert.equal(pronti(), 69, 'con tanto tempo si fanno tutti');
    assert.equal(liberi.length, 0, 'finiti: niente altri inviti');
});

test('migliora: se la pagina ridisegna il compagno la GIF già decodificata si riusa; un insuccesso non si ricorda', async () => {
    SN.svuota();
    const b = fintoBrowser(sprite('froslass'));
    await SN.migliora(b.img, { win: b.win });
    const b2 = fintoBrowser(sprite('froslass'));
    b2.win.fetch = b.win.fetch;
    await SN.migliora(b2.img, { win: b2.win });
    assert.equal(b.chiamate.length, 1, 'due volte lo stesso Pokémon: un solo download');
    // un download che fallisce
    SN.svuota();
    const rotto = fintoBrowser(sprite('froslass'), { errore: true });
    assert.equal(await SN.migliora(rotto.img, { win: rotto.win }), null);
    assert.equal(rotto.img.sostituita, undefined, 'l\'<img> è rimasta');
    rotto.win.fetch = async url => { rotto.chiamate.push({ url }); return { ok: true, arrayBuffer: async () => sprite('froslass').buffer.slice(0) }; };
    const riuscito = await SN.migliora(rotto.img, { win: rotto.win });
    assert.ok(riuscito, 'la volta dopo si riprova e funziona');
});

test('migliora: nei casi dubbi non tocca niente (Showdown, risposta sbagliata, non è una GIF, Pokémon cambiato nel frattempo, niente canvas)', async () => {
    SN.svuota();
    const showdown = fintoBrowser(sprite('froslass'), { url: 'https://play.pokemonshowdown.com/sprites/ani/froslass-mega.gif' });
    assert.equal(await SN.migliora(showdown.img, { win: showdown.win }), null);
    assert.equal(showdown.chiamate.length, 0, 'nemmeno la richiesta: il browser la rifiuterebbe per il CORS');

    const nonOk = fintoBrowser(sprite('froslass'), { nonOk: true });
    assert.equal(await SN.migliora(nonOk.img, { win: nonOk.win }), null);

    SN.svuota();
    const pagina = fintoBrowser(new TextEncoder().encode('<html>Not found</html> '.repeat(5)));
    assert.equal(await SN.migliora(pagina.img, { win: pagina.win }), null, 'una pagina HTML al posto della GIF');
    assert.equal(pagina.img.sostituita, undefined);

    SN.svuota();
    const cambiato = fintoBrowser(sprite('froslass'));
    const attesa = SN.migliora(cambiato.img, { win: cambiato.win });
    cambiato.img.isConnected = false;                 // la pagina ha messo un altro Pokémon
    assert.equal(await attesa, null);

    SN.svuota();
    const senza = fintoBrowser(sprite('froslass'), { senzaContesto: true });
    assert.equal(await SN.migliora(senza.img, { win: senza.win }), null, 'il browser non dà il contesto 2D');
    assert.equal(senza.img.sostituita, undefined);

    SN.svuota();
    const troppo = fintoBrowser(sprite('froslass'));
    delete troppo.win.ImageData;
    assert.equal(await SN.migliora(troppo.img, { win: troppo.win }), null);
});

test('migliora: la misura vera sul palco decide l\'ingrandimento (e il doppio della densità dello schermo conta, fino a 2)', async () => {
    SN.svuota();
    const piccolo = fintoBrowser(sprite('froslass'), { altezza: 200 });                  // 2,5 volte: xBR 2x
    assert.equal((await SN.migliora(piccolo.img, { win: piccolo.win })).dataset.nitido, 'xbr2');
    SN.svuota();
    const denso = fintoBrowser(sprite('froslass'), { altezza: 200 });
    denso.win.devicePixelRatio = 3;                                                      // 200 css px sono 400 pixel veri su un telefono: ne vale 2 (si arriva fino a 2)
    assert.equal((await SN.migliora(denso.img, { win: denso.win })).dataset.nitido, 'xbr4');
    SN.svuota();
    const medio = fintoBrowser(sprite('froslass'), { altezza: 260 });                    // 3,3 volte: xBR 3x
    const c = await SN.migliora(medio.img, { win: medio.win });
    assert.deepEqual([c.dataset.nitido, c.width, c.height], ['xbr3', 66 * 3, 79 * 3]);
});

// ---------------------------------------------------------------- nella pagina

test('la pagina pubblica: i tre script prima di public-card.js, che chiama migliora solo per il Pokémon ingrandito', () => {
    const html = letto('public.html');
    const ordine = ['xbr.js', 'gif-frames.js', 'sprite-nitido.js', 'public-card.js'].map(s => html.indexOf(`<script src="${s}"></script>`));
    assert.ok(ordine.every(i => i > 0), 'ci sono tutti');
    assert.deepEqual([...ordine].sort((a, b) => a - b), ordine, 'in quest\'ordine: xbr e gif-frames prima di sprite-nitido, e tutti prima della carta');
    const card = letto('public-card.js');
    assert.match(card, /img\.clientHeight \/ img\.naturalHeight > RAPPORTO_GIF_INGRANDITA\) img\.classList\.add\('pp-ingrandita'\);/, 'senza il canvas restano i pixel netti di prima');
    assert.match(card, /if \(img\.classList\.contains\('pp-ingrandita'\) && window\.SpriteNitido\) window\.SpriteNitido\.migliora\(img\)\.then\(c => \{ if \(c\) centraScena\(set, posto, c\); \}\)\.catch\(\(\) => \{\}\);/, 'solo se è ingrandito (più del doppio)');
});

test('xbr.js e gif-frames.js sono copie di librerie MIT: restano il nome di chi le ha scritte e la licenza', () => {
    const xbr = letto('xbr.js'), gif = letto('gif-frames.js');
    assert.match(xbr, /Josep del Rio/);
    assert.match(xbr, /Permission is hereby granted, free of charge/);
    assert.match(xbr, /THE SOFTWARE IS PROVIDED "AS IS"/);
    assert.match(gif, /Dean McNamee/);
    assert.match(gif, /Permission is hereby granted, free of charge/);
    assert.match(gif, /THE SOFTWARE IS PROVIDED "AS IS"/);
});
