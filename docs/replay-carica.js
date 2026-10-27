// =====================================================
// APRIRE UN REPLAY — Poké-Tournament (matches.html)
//
// Il replay salvato su Storage è un file che, per partire, carica il motore di Showdown da play.pokemonshowdown.com (16 script e 3 fogli di stile: qualche MB).
// Aperto in un iframe dal suo indirizzo (un altro dominio) ogni apertura era lunga e le GIF dei Pokémon a volte non arrivavano: dentro quell'iframe il browser non
// condivide la cache con il sito, il service worker non lo vede, e le immagini arrivano tutte e solo da Showdown, senza riprovare se una si impunta.
// Qui il file si scarica (Storage lo permette), se ne leggono i dati (ReplaySito.leggiReplay) e il replay si ricostruisce DENTRO la pagina (srcdoc: stessa origine del
// sito, quindi ha la sua cache e il service worker del telefono) con:
//   - il motore preso dalla cache del browser (Cache API): si scarica una volta sola, poi è subito lì; si rinfresca in silenzio una volta al giorno;
//   - le immagini dei Pokémon dal sito, quando ci sono (sprites/, le scrive il workflow "Sprites"), scaricate prima di partire e riprovate se non arrivano
//     (ReplaySito.immaginiReplay).
// Dal file si prende solo il contenuto (log, giocatori, testata): il codice del replay è sempre quello di replay-sito.js.
// Se qualcosa non va (rete, un replay di Showdown caricato a mano che non ha i nostri dati...) il replay si apre come prima, dal suo indirizzo.
//
//   ReplayCarica.apri(win, iframe, indirizzo)   apre il replay nell'iframe; ritorna 'sito', 'sito-senza-motore', 'esterno' o 'annullato' (un'apertura più recente l'ha superata)
//   ReplayCarica.scalda(win)                    prepara il motore in anticipo (all'apertura della finestra del replay, mentre si leggono i dati dei set)
//   ReplayCarica.ferma(win, iframe)             chiude il replay (e ferma l'audio)
//   ReplayCarica.preparaMotore(win)             { stili: {indirizzo: testo}, script: {indirizzo: blob:...} } oppure null
//
// Il file è anche un modulo di Node (per le prove).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.ReplayCarica = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NOME_CACHE = 'sant-alvise-motore-replay-v1';
    const CHIAVE_CONTROLLO = 'motoreReplayControllo';
    const VALIDITA_MS = 24 * 60 * 60 * 1000;     // il motore si rinfresca una volta al giorno
    const ATTESA_MASSIMA_MS = 30000;             // oltre, si apre il replay come prima: Showdown lo scarica da sé

    // la pagina che si vede mentre il replay si prepara
    const CARICAMENTO = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>' +
        'html,body{height:100%;margin:0;background:#000;color:#fff;font:700 12px/1 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}' +
        'body{display:flex;align-items:center;justify-content:center;gap:10px}' +
        'i{width:14px;height:14px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:g .7s linear infinite}' +
        '@keyframes g{to{transform:rotate(360deg)}}</style></head><body><i></i>Loading replay</body></html>';

    let promessaMotore = null;                   // una per pagina: tutti i replay aperti dopo il primo trovano il motore già pronto

    const leggiControllo = win => { try { return Number(win.localStorage.getItem(CHIAVE_CONTROLLO)) || 0; } catch (e) { return 0; } };
    const scriviControllo = (win, v) => { try { win.localStorage.setItem(CHIAVE_CONTROLLO, String(v)); } catch (e) { /* senza: si rinfresca a ogni pagina */ } };

    /** Scarica un file del motore: deve essere una risposta vera (con il CORS) e non una pagina d'errore travestita */
    async function scarica(win, indirizzo, opzioni) {
        const r = await win.fetch(indirizzo, Object.assign({ mode: 'cors', credentials: 'omit' }, opzioni));
        if (!r || !r.ok || r.type === 'opaque') throw new Error(`${indirizzo}: ${r ? r.status || r.type : 'nessuna risposta'}`);
        const tipo = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (/text\/html/i.test(tipo)) throw new Error(`${indirizzo}: non è un file del motore`);
        return r;
    }

    /** Ogni giorno, in silenzio: i file nuovi del motore al posto di quelli tenuti. Solo se arrivano TUTTI: versioni che non si accordano fra loro fanno più danni di una vecchia */
    function rinfresca(win, cache, indirizzi, adesso) {
        if (adesso - leggiControllo(win) < VALIDITA_MS) return;
        scriviControllo(win, adesso);            // subito: se non riesce si riprova alla prossima pagina, non a ogni replay
        Promise.all(indirizzi.map(async u => [u, await scarica(win, u, { cache: 'no-cache' })]))
            .then(async coppie => { for (const [u, r] of coppie) await cache.put(u, r); })
            .catch(() => { /* resta quello che c'è */ });
    }

    /**
     * Un foglio di stile di Showdown messo dentro la pagina: i suoi indirizzi sono relativi al file (url(../fx/pioggia.png), i caratteri delle icone) e dentro la pagina del sito
     * punterebbero nel posto sbagliato. Si riscrivono assoluti, come se il foglio stesse ancora dov'era.
     */
    function assolutizzaCss(css, base) {
        const aAssoluto = u => { try { return new URL(u, base).href; } catch (e) { return u; } };
        const daLasciare = /^(data:|https?:|\/\/|#|blob:)/i;
        return String(css)
            .replace(/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, (tutto, q, u) => (daLasciare.test(u.trim()) ? tutto : `url(${q}${aAssoluto(u.trim())}${q})`))
            .replace(/@import\s+(['"])([^'"]+)\1/gi, (tutto, q, u) => (daLasciare.test(u.trim()) ? tutto : `@import ${q}${aAssoluto(u.trim())}${q}`));
    }

    async function costruisciMotore(win, adesso) {
        const R = win.ReplaySito;
        if (!R || !R.MOTORE || !win.caches || typeof win.fetch !== 'function' || !win.Blob || !win.URL || !win.URL.createObjectURL) return null;
        const cache = await win.caches.open(NOME_CACHE);
        const indirizzi = R.MOTORE.stili.concat(R.MOTORE.script);
        let tuttoDallaCache = true;
        const prendi = async u => {
            let r = await cache.match(u);
            if (!r) {
                tuttoDallaCache = false;
                r = await scarica(win, u);
                try { await cache.put(u, r.clone()); } catch (e) { /* senza spazio il replay parte lo stesso */ }
            }
            return r.text();
        };
        const testi = await Promise.all(indirizzi.map(prendi));
        const motore = { stili: {}, script: {} };
        indirizzi.forEach((u, i) => {
            if (R.MOTORE.stili.includes(u)) motore.stili[u] = assolutizzaCss(testi[i], u);
            else motore.script[u] = win.URL.createObjectURL(new win.Blob([testi[i]], { type: 'text/javascript' }));
        });
        // appena scaricato è fresco; se invece viene tutto dalla cache e ha più di un giorno, si rinfresca in silenzio (il replay non aspetta)
        if (tuttoDallaCache) rinfresca(win, cache, indirizzi, adesso); else scriviControllo(win, adesso);
        return motore;
    }

    /** Il motore di Showdown pronto per il replay, o null se non si è potuto (il replay allora lo chiede a Showdown come sempre). Una volta per pagina */
    function preparaMotore(win, { adesso = Date.now() } = {}) {
        if (promessaMotore) return promessaMotore;
        let scaduta;
        const attesa = new Promise(r => { scaduta = win.setTimeout ? win.setTimeout(() => r(null), ATTESA_MASSIMA_MS) : null; });
        promessaMotore = Promise.race([costruisciMotore(win, adesso), attesa])
            .catch(errore => { if (win.console) win.console.warn('[Replay] motore non preparato:', errore && errore.message); return null; })
            .then(m => { if (scaduta && win.clearTimeout) win.clearTimeout(scaduta); return m; });
        return promessaMotore;
    }

    function scalda(win) {
        return preparaMotore(win).then(() => undefined);
    }

    /** Le immagini dei Pokémon che stanno nel sito, per il replay: l'indirizzo della cartella (quello della pagina) e gli elenchi scritti da sprites/indice.js */
    function spritesDi(win) {
        const l = win.SpriteLocali;
        if (!l) return null;
        try { return { base: new win.URL('.', win.location.href).href, ani: l.ani || [], back: l.back || [] }; } catch (e) { return null; }
    }

    async function scaricaTesto(win, indirizzo) {
        const r = await win.fetch(indirizzo, { credentials: 'omit' });
        if (!r || !r.ok) throw new Error(`replay: ${r ? r.status : 'nessuna risposta'}`);
        return r.text();
    }

    async function apri(win, iframe, indirizzo, opzioni) {
        const numero = (iframe.__replayCarica || 0) + 1;       // se mentre si prepara se ne apre un altro (un altro set), questo si ferma
        iframe.__replayCarica = numero;
        const ancora = () => iframe.__replayCarica === numero;
        iframe.srcdoc = CARICAMENTO;
        try {
            const R = win.ReplaySito;
            if (!R || !R.leggiReplay) throw new Error('replay-sito.js non caricato');
            const [testo, motore] = await Promise.all([scaricaTesto(win, indirizzo), preparaMotore(win, opzioni)]);
            if (!ancora()) return 'annullato';
            const dati = R.leggiReplay(testo);
            if (!dati) throw new Error('non è un replay del sito');
            iframe.srcdoc = R.creaReplayHtml(Object.assign({}, dati, { motore, sprites: spritesDi(win) }));
            return motore ? 'sito' : 'sito-senza-motore';
        } catch (errore) {
            if (!ancora()) return 'annullato';
            if (win.console) win.console.warn('[Replay] si apre dal suo indirizzo:', errore && errore.message);
            iframe.removeAttribute('srcdoc');
            iframe.src = indirizzo;
            return 'esterno';
        }
    }

    function ferma(win, iframe) {
        if (!iframe) return;
        iframe.__replayCarica = (iframe.__replayCarica || 0) + 1;   // un'apertura ancora in corso non deve riaprirlo
        iframe.removeAttribute('srcdoc');
        iframe.src = '';
    }

    /** Solo per le prove: ricomincia da capo come una pagina nuova */
    function azzera() { promessaMotore = null; }

    return { NOME_CACHE, CHIAVE_CONTROLLO, VALIDITA_MS, ATTESA_MASSIMA_MS, CARICAMENTO, assolutizzaCss, preparaMotore, scalda, spritesDi, apri, ferma, azzera };
});
