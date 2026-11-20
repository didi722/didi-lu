// =====================================================
// SPRITE NITIDO — i Pokémon molto ingranditi con i bordi lisci, non a blocchi
// ---------------------------------------------------------------------
// Le GIF dei Pokémon sono piccole (60-100 pixel di altezza) e sul palco della pagina pubblica un Pokémon alto, come Mega Froslass, ne occupa 450: ingrandita così la GIF
// viene a blocchi (il browser la sfoca, oppure con image-rendering: pixelated i pixel diventano quadrati grossi e irregolari). Qui la si ricostruisce con xBR
// (xbr.js, l'ingrandimento "pixel art" degli emulatori: i bordi diventano lisci, i colori restano quelli dello sprite): la GIF si scarica come dati, si decodifica
// (gif-frames.js), si ingrandisce di 2, 3 o 4 volte un fotogramma alla volta e si anima su un <canvas> che prende il posto dell'<img>. Il canvas poi si adatta alla misura
// sul palco con la solita interpolazione del browser, che su un bordo già liscio non si vede.
// Si può fare solo se la GIF si può LEGGERE: arriva dallo stesso sito (sprites/ani/, le copie che scarica il workflow "Sprites") o da raw.githubusercontent.com (che
// permette il CORS). Quelle che arrivano da play.pokemonshowdown.com no (il browser le mostra ma non le fa leggere): lì l'<img> resta com'è, e passano dal sito appena il
// workflow le ha copiate. In qualunque altro caso (rete, GIF strana, troppo grande, niente canvas) `migliora` risponde null e l'<img> non si tocca.
// Funziona nel browser (window.SpriteNitido) e in Node (require, per le prove).
// =====================================================
(function (radice, fabbrica) {
    const nodo = typeof module === 'object' && module.exports;
    const S = fabbrica(radice, nodo ? require('./xbr.js') : radice.XBR, nodo ? require('./gif-frames.js') : radice.GifFrames);
    if (nodo) module.exports = S; else radice.SpriteNitido = S;
})(typeof self !== 'undefined' ? self : this, function (radice, XBR, Gif) {
    'use strict';

    const MAX_BYTE = 40e6;                       // quanta memoria al massimo per i fotogrammi ingranditi di una GIF (una GIF lunga ne chiede di più: si ingrandisce meno)
    const MAX_GIF_IN_MEMORIA = 4;                // quante GIF si ricordano (così se la pagina ridisegna il compagno non si rifà tutto)
    const HOST_CON_CORS = ['raw.githubusercontent.com'];       // gli altri host da cui si può leggere un'immagine (oltre al sito stesso)
    const OPZIONI_XBR = { blendColors: true, scaleAlpha: true };   // anche il bordo trasparente si ammorbidisce: i contorni dello sprite sono lisci

    /** Di quanto ingrandire con xBR (2, 3 o 4) per un Pokémon mostrato `rapporto` volte più grande della sua GIF; 0 se i fotogrammi non starebbero in memoria nemmeno a 2 */
    function fattore(rapporto, larghezza, altezza, fotogrammi) {
        let k = rapporto > 4 ? 4 : rapporto > 3 ? 3 : 2;
        while (k >= 2 && fotogrammi * larghezza * k * altezza * k * 4 > MAX_BYTE) k--;
        return k >= 2 ? k : 0;
    }

    /** Vero se la pagina può leggere i dati di questa immagine: dello stesso sito, o di un host che permette il CORS (play.pokemonshowdown.com no) */
    function leggibile(url, luogo) {
        let u;
        try { u = new URL(String(url), luogo && luogo.href); } catch (e) { return false; }
        if (luogo && luogo.origin && luogo.origin !== 'null' && u.origin === luogo.origin) return true;
        return u.protocol === 'https:' && HOST_CON_CORS.includes(u.hostname);
    }

    // ---- scaricare e decodificare ---------------------------------------------------------------------------------------------------------

    const memoria = new Map();                   // indirizzo -> Promise di { larghezza, altezza, frame, xbr: { 2|3|4: [ImageData] } } (o null)

    /** La GIF decodificata (con la cache dei fotogrammi ingranditi), o null se non si riesce: non è una GIF, è troppo grande, la rete non risponde */
    function carica(url, win, fetchFn) {
        if (memoria.has(url)) { const p = memoria.get(url); memoria.delete(url); memoria.set(url, p); return p; }
        const vai = fetchFn || (win && typeof win.fetch === 'function' ? win.fetch.bind(win) : null);
        const p = (async () => {
            if (!vai) return null;
            const r = await vai(url, { credentials: 'omit', cache: 'force-cache' });      // gli sprite non cambiano mai: va bene anche la copia già scaricata
            if (!r || !r.ok) return null;
            const byte = new Uint8Array(await r.arrayBuffer());
            if (byte.length < 16 || byte[0] !== 0x47 || byte[1] !== 0x49 || byte[2] !== 0x46) return null;       // "GIF"
            const d = Gif.decodificaGif(byte);
            return d ? Object.assign(d, { xbr: {} }) : null;
        })().catch(() => null);
        memoria.set(url, p);
        p.then(d => { if (!d && memoria.get(url) === p) memoria.delete(url); });          // un insuccesso non si ricorda: la prossima volta si riprova
        while (memoria.size > MAX_GIF_IN_MEMORIA) memoria.delete(memoria.keys().next().value);
        return p;
    }

    // ---- il canvas animato ---------------------------------------------------------------------------------------------------------------

    /**
     * Un <canvas> che anima la GIF ingrandita `k` volte con xBR. Ritorna { canvas, avvia, ferma } (il canvas disegna già il primo fotogramma; l'animazione parte con `avvia`,
     * dopo averlo messo nella pagina) o null se il browser non dà il contesto 2D. I fotogrammi si ingrandiscono quando servono (e quelli che mancano si preparano
     * negli intervalli), così all'inizio non c'è nessuna attesa; si ricordano, quindi dal secondo giro non costa più niente. Si ferma da solo se il canvas esce dalla pagina,
     * e non disegna mentre è fuori dallo schermo. I ritardi sono quelli della GIF.
     */
    function riproduci(win, dati, k) {
        const n = dati.frame.length, L = dati.larghezza * k, A = dati.altezza * k;
        const canvas = win.document.createElement('canvas');
        canvas.width = L; canvas.height = A;
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return null;
        const pronti = dati.xbr[k] || (dati.xbr[k] = new Array(n));
        const ingrandisci = XBR['xbr' + k + 'x'];
        const calcola = i => pronti[i] || (pronti[i] = new win.ImageData(new Uint8ClampedArray(ingrandisci(dati.frame[i].px, dati.larghezza, dati.altezza, OPZIONI_XBR).buffer), L, A));
        const disegna = i => ctx.putImageData(calcola(i), 0, 0);
        disegna(0);

        let fermo = false, indice = 0, scade = 0, visibile = true, osservatore = null, daPreparare = 1;
        const ferma = () => { fermo = true; if (osservatore) { osservatore.disconnect(); osservatore = null; } };
        function giro(ora) {
            if (fermo) return;
            if (!canvas.isConnected) { ferma(); return; }
            if (!scade) scade = ora + dati.frame[0].ritardo;
            else if (ora >= scade) {
                let salti = 0;
                do { indice = (indice + 1) % n; scade += dati.frame[indice].ritardo; salti++; } while (ora >= scade && salti < n);      // se il browser è rimasto indietro si saltano i fotogrammi persi
                if (ora >= scade) scade = ora + dati.frame[indice].ritardo;
                if (visibile) disegna(indice);
            }
            win.requestAnimationFrame(giro);
        }
        function prepara() {
            if (fermo) return;
            while (daPreparare < n && pronti[daPreparare]) daPreparare++;
            if (daPreparare >= n) return;
            calcola(daPreparare++);
            win.setTimeout(prepara, 4);
        }
        function avvia() {
            if (fermo || n < 2) return;
            if (typeof win.IntersectionObserver === 'function') {
                osservatore = new win.IntersectionObserver(voci => { visibile = !!voci[voci.length - 1].isIntersecting; });
                osservatore.observe(canvas);
            }
            win.requestAnimationFrame(giro);
            win.setTimeout(prepara, 4);
        }
        return { canvas, avvia, ferma };
    }

    /**
     * Sostituisce l'<img> di un Pokémon ingrandito (già nella pagina, già caricata) con il canvas dalla GIF ricostruita con xBR. Ritorna il canvas, che prende le classi e
     * le misure dell'<img>; o null (e l'<img> resta com'è) se non si può o non conviene: vedi l'inizio del file.
     */
    async function migliora(img, opzioni) {
        const o = opzioni || {};
        const win = o.win || radice;
        if (!img || !XBR || !Gif || !win.document || !win.ImageData) return null;
        const url = img.currentSrc || img.src;
        if (!leggibile(url, win.location)) return null;
        const dati = await carica(url, win, o.fetchFn);
        if (!dati || !img.isConnected) return null;          // nel frattempo il Pokémon è stato cambiato
        const dpr = Math.min(Math.max(win.devicePixelRatio || 1, 1), 2);
        const k = fattore(Math.max((img.clientHeight || 0) / dati.altezza * dpr, 2), dati.larghezza, dati.altezza, dati.frame.length);
        if (!k) return null;
        const r = riproduci(win, dati, k);
        if (!r) return null;
        const c = r.canvas;
        c.className = String(img.className || '').replace(/\bpp-ingrandita\b/g, '').replace(/\s+/g, ' ').trim();      // niente pixel a blocchi: il bordo è già liscio
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', img.alt || '');
        c.dataset.nitido = 'xbr' + k;
        img.replaceWith(c);
        r.avvia();
        return c;
    }

    return { fattore, leggibile, carica, riproduci, migliora, svuota: () => memoria.clear(), MAX_BYTE };
});
