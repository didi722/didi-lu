// =====================================================
// APP — il caricamento all'apertura: le GIF dei Pokémon si scaricano subito, così nelle pagine ci sono già
// ---------------------------------------------------------------------
// Nell'app i Pokémon sono dappertutto (il compagno di ogni allenatore nelle stagioni e in Trainers, i Pokémon dei team in Stats). Ogni GIF veniva chiesta alla rete solo
// quando la pagina la mostrava, tutte insieme: su un telefono con poca rete alcune non arrivavano (e il compagno restava vuoto) e in Stats si vedevano comparire a una a una.
// Qui, mentre la schermata del titolo mostra la barra di caricamento, si scaricano tutte quelle che servono: i compagni di tutti gli allenatori, i Pokémon dei team iscritti
// alle stagioni (quelli di Stats), i tuoi del Box e gli avatar. Il service worker (sw.js) le tiene salvate, quindi dalla seconda apertura sono già lì e non si scarica più
// niente (se ne mancano di nuove, solo quelle).
//   - la coda scarica al massimo 6 GIF per volta (tutte insieme si contendono la rete e alcune cadono), e ogni GIF ha un secondo tentativo;
//   - una specie senza GIF animata passa alle altre della catena (GIF Gen 5, PNG del Pokédex), come fa Stats;
//   - l'elenco delle specie si ricorda per 4 ore: aprire l'app di nuovo non rilegge Firebase;
//   - l'attesa ha un tetto (25 s): se la rete è lenta l'app si apre lo stesso e le GIF continuano ad arrivare in secondo piano.
// La parte pura (elenco delle specie, coda, cosa manca) è provata in test/app-precarica.test.js; funziona nel browser (window.AppPrecarica) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const P = fabbrica(radice, inNode ? require('./sprite-pkm.js') : null);
    if (inNode) module.exports = P;
    else radice.AppPrecarica = P;
})(typeof self !== 'undefined' ? self : this, function (radice, SpriteNode) {
    'use strict';

    /** Le cache delle immagini del service worker (le stesse di sw.js: la prova le confronta) */
    const CACHE_IMMAGINI = 'sant-alvise-immagini-v1';
    const CACHE_OPACHE = 'sant-alvise-immagini-opache-v1';
    const CHIAVE_SPECIE = 'appPrecaricaSpecie1';             // l'ultimo elenco letto: { t, specie: [], avatar: [] }
    const CHIAVE_FALLITE = 'appPrecaricaFallite1';           // le GIF che non c'erano per niente: { id: ms } (non si riprovano per un giorno)
    const VALIDITA_ELENCO_MS = 4 * 3600 * 1000;
    const SILENZIO_FALLITE_MS = 24 * 3600 * 1000;
    const ATTESA_MASSIMA_MS = 25000;
    const CONCORRENZA = 6;
    const SCADENZA_IMMAGINE_MS = 15000;
    const PESO_COMPAGNO = 1000, PESO_BOX = 5, PESO_TEAM = 1;

    const sprite = () => radice.SpritePkm || SpriteNode;
    const valori = v => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));
    const pulisci = t => String(t == null ? '' : t).trim();
    const idGiocatore = t => pulisci(t).toLowerCase();

    // ---------- l'elenco di quello che serve ----------

    /**
     * I nomi dei Pokémon che l'app mostra con la GIF, senza doppioni (due nomi che danno lo stesso file contano uno) e nell'ordine in cui conviene scaricarli: prima i compagni
     * (si vedono ovunque), poi i tuoi del Box, poi i Pokémon dei team iscritti, dal più comune.
     *   players: il nodo `players` di Firebase; stagioni: { idStagione: nodo teams_iscritti }; giocatore: l'id di chi ha aperto l'app (o '')
     */
    function specieDa({ players, stagioni, giocatore } = {}) {
        const conta = new Map();
        const aggiungi = (nome, peso) => {
            const n = pulisci(nome);
            const id = n ? sprite().id(n) : '';
            if (!id) return;
            const v = conta.get(id) || { nome: n, punti: 0 };
            v.punti += peso;
            conta.set(id, v);
        };
        for (const p of valori(players)) aggiungi(p && p.info && p.info.pkmPreferito, PESO_COMPAGNO);
        const mio = players && giocatore ? players[idGiocatore(giocatore)] : null;
        for (const t of valori(mio && mio.teams)) for (const pk of valori(t && t.pokemon)) aggiungi(pk && pk.nome, PESO_BOX);
        for (const perFormato of valori(stagioni)) {
            for (const perGiocatore of valori(perFormato)) {
                for (const iscrizione of valori(perGiocatore)) {
                    for (const t of valori(iscrizione && iscrizione.datiTeams)) for (const pk of valori(t && t.pokemon)) aggiungi(pk && pk.nome, PESO_TEAM);
                }
            }
        }
        return [...conta.values()].sort((a, b) => b.punti - a.punti || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0)).map(v => v.nome);
    }

    /** Gli avatar degli allenatori (indirizzi assoluti, senza doppioni): si vedono nel carosello dei Trainers e nelle classifiche */
    function avatarDa(players, base) {
        const out = [];
        for (const p of valori(players)) {
            const a = pulisci(p && p.info && p.info.avatar);
            if (!a) continue;
            let url;
            try { url = new URL(a, base).href; } catch (e) { continue; }
            if (/^https?:/.test(url) && !out.includes(url)) out.push(url);
        }
        return out;
    }

    // ---------- scaricare ----------

    /** Fa partire `fn` fra `ms`; ritorna come annullarla (un timer che resta in giro tiene vivi i test e, nel browser, non serve a niente) */
    function dopo(ms, fn, setTempo) {
        const h = (setTempo || setTimeout)(fn, ms);
        return () => { if (h !== undefined && typeof clearTimeout === 'function') clearTimeout(h); };
    }
    const attendi = (ms, setTempo) => new Promise(r => dopo(ms, r, setTempo));

    /** Scarica un'immagine (così resta nella cache del browser e, passando dal service worker, in quella dell'app). Vero se arriva, falso se dà errore o ci mette troppo */
    function caricaImmagine(url, { Immagine, scadenza = SCADENZA_IMMAGINE_MS, setTempo } = {}) {
        const Img = Immagine || (typeof Image !== 'undefined' ? Image : null);
        if (!Img) return Promise.resolve(false);
        return new Promise(resolve => {
            const img = new Img();
            let finito = false, annulla = () => {};
            const fine = ok => {
                if (finito) return;
                finito = true;
                annulla();
                img.onload = img.onerror = null;
                if (!ok) { try { img.src = ''; } catch (e) { /* già chiusa */ } }
                resolve(ok);
            };
            img.onload = () => fine(true);
            img.onerror = () => fine(false);
            annulla = dopo(scadenza, () => fine(false), setTempo);
            img.src = url;
        });
    }

    /**
     * Il lavoro di una specie: la prima immagine della catena (la GIF animata) con due tentativi, poi le altre una volta; basta che una arrivi.
     * Ritorna una funzione che dà una promessa di vero/falso.
     */
    function lavoroSpecie(specie, opzioni = {}) {
        const catena = sprite().catena(specie);
        return async () => {
            for (let i = 0; i < catena.length; i++) {
                const prove = i === 0 ? 2 : 1;
                for (let k = 0; k < prove; k++) if (await caricaImmagine(catena[i], opzioni)) return true;
            }
            return false;
        };
    }

    /**
     * Esegue i lavori (funzioni che danno una promessa di vero/falso) al massimo `concorrenza` per volta, ognuno con `tentativi` prove e una pausa che cresce tra l'una e l'altra.
     * `avanza(fatti, totale)` a ogni lavoro finito. Ritorna { riusciti, falliti: [indici] }.
     */
    async function eseguiCoda(lavori, { concorrenza = CONCORRENZA, tentativi = 2, pausa = n => 500 * n, setTempo, avanza } = {}) {
        const totale = lavori.length;
        const falliti = [];
        let prossimo = 0, fatti = 0;
        const lavoratore = async () => {
            while (prossimo < totale) {
                const k = prossimo++;
                let ok = false;
                for (let t = 0; t < tentativi && !ok; t++) {
                    try { ok = !!(await lavori[k]()); } catch (e) { ok = false; }
                    if (!ok && t + 1 < tentativi) await attendi(pausa(t + 1), setTempo);
                }
                if (!ok) falliti.push(k);
                fatti += 1;
                if (avanza) avanza(fatti, totale);
            }
        };
        await Promise.all(Array.from({ length: Math.min(concorrenza, totale) }, lavoratore));
        return { riusciti: totale - falliti.length, falliti: falliti.sort((a, b) => a - b) };
    }

    // ---------- cosa c'è già ----------

    /** Quali di questi indirizzi sono già nelle cache delle immagini dell'app (la risposta, a una seconda apertura, è "tutti") */
    async function inCache(win, urls) {
        const trovati = new Set();
        const c = win && win.caches;
        if (!c || typeof c.open !== 'function') return trovati;
        try {
            const aperte = await Promise.all([c.open(CACHE_IMMAGINI), c.open(CACHE_OPACHE)]);
            await Promise.all(urls.map(async u => {
                for (const cache of aperte) { if (await cache.match(u)) { trovati.add(u); return; } }
            }));
        } catch (e) { /* senza cache si scarica tutto */ }
        return trovati;
    }

    /**
     * Cosa c'è da scaricare: le specie di cui nessuna immagine della catena è già nelle cache (e che non sono mancate di recente), e gli avatar che mancano.
     * `fallite`: { idSprite: ms } di quando una specie è risultata senza immagini.
     */
    async function daScaricare(win, { specie, avatar = [], fallite = {}, adesso = Date.now() } = {}) {
        const catene = specie.map(s => sprite().catena(s));
        const urls = [].concat(...catene, avatar);
        const presenti = await inCache(win, urls);
        const specieMancanti = specie.filter((s, i) => {
            if (catene[i].some(u => presenti.has(u))) return false;
            const recente = fallite[sprite().id(s)];
            return !(recente && adesso - recente < SILENZIO_FALLITE_MS);
        });
        return { specie: specieMancanti, avatar: avatar.filter(u => !presenti.has(u)), totale: specie.length + avatar.length };
    }

    /** Il service worker si prende la pagina poco dopo la prima apertura: finché non c'è, quello che si scarica non viene salvato. Si aspetta, ma poco. */
    function attendiServiceWorker(win, ms = 2000, setTempo) {
        const sw = win && win.navigator && win.navigator.serviceWorker;
        if (!sw || sw.controller) return Promise.resolve(!!(sw && sw.controller));
        return new Promise(resolve => {
            let fatto = false, annulla = () => {};
            const fine = ok => { if (!fatto) { fatto = true; annulla(); resolve(ok); } };
            if (typeof sw.addEventListener === 'function') sw.addEventListener('controllerchange', () => fine(true), { once: true });
            annulla = dopo(ms, () => fine(!!sw.controller), setTempo);
        });
    }

    // ---------- Firebase e memoria del browser ----------

    const leggiMemoria = (win, chiave) => { try { return JSON.parse(win.localStorage.getItem(chiave) || 'null'); } catch (e) { return null; } };
    const scriviMemoria = (win, chiave, v) => { try { win.localStorage.setItem(chiave, JSON.stringify(v)); } catch (e) { /* senza memoria si rilegge */ } };

    /** Il nodo `players` di Firebase, letto una volta sola per pagina (lo usa anche la posizione in classifica del menù) */
    function players(win) {
        if (!win.firebase) return Promise.reject(new Error('Firebase non c\'è'));
        if (!win.__appPlayers) {
            win.__appPlayers = win.firebase.database().ref('players').once('value').then(s => s.val() || {});
            win.__appPlayers.catch(() => { win.__appPlayers = null; });          // un errore non resta in memoria: la prossima volta si riprova
        }
        return win.__appPlayers;
    }

    /** I team iscritti di ogni stagione: { idStagione: nodo teams_iscritti } (quelli che non si leggono mancano) */
    async function teamsIscritti(win, ids) {
        const out = {};
        await Promise.all(valori(ids).map(async id => {
            try { out[id] = (await win.firebase.database().ref('seasons/' + id + '/teams_iscritti').once('value')).val() || {}; } catch (e) { /* quella stagione manca */ }
        }));
        return out;
    }

    /**
     * L'elenco delle specie e degli avatar: quello ricordato se è di meno di 4 ore, altrimenti letto da Firebase (e ricordato). Se Firebase non risponde si usa l'ultimo ricordato,
     * di qualunque età. `idsStagioni`: promessa degli id delle stagioni (la dà il menù, che già le cerca).
     */
    async function leggiElenco(win, { idsStagioni, giocatore, adesso = Date.now() } = {}) {
        const ricordato = leggiMemoria(win, CHIAVE_SPECIE);
        const valido = ricordato && Array.isArray(ricordato.specie);
        if (valido && adesso - Number(ricordato.t) < VALIDITA_ELENCO_MS) return { specie: ricordato.specie, avatar: ricordato.avatar || [] };
        try {
            const [p, ids] = await Promise.all([players(win), Promise.resolve(idsStagioni).catch(() => [])]);
            const stagioni = await teamsIscritti(win, ids || []);
            const specie = specieDa({ players: p, stagioni, giocatore: giocatore ? giocatore() : '' });
            const avatar = avatarDa(p, win.location && win.location.href);
            scriviMemoria(win, CHIAVE_SPECIE, { t: adesso, specie, avatar });
            return { specie, avatar };
        } catch (e) {
            return valido ? { specie: ricordato.specie, avatar: ricordato.avatar || [] } : { specie: [], avatar: [] };
        }
    }

    // ---------- tutto insieme ----------

    /**
     * Scarica quello che manca. `avanza(frazione 0..1)` dice a che punto si è (la barra di caricamento), `fine()` si chiama una volta sola: a lavoro finito o dopo `attesa` ms
     * (le GIF che mancano continuano ad arrivare in secondo piano). Ritorna una promessa di { totale, daScaricare, riusciti, falliti } quando ha finito davvero.
     */
    async function avvia(win, { idsStagioni, giocatore, avanza, fine, setTempo, attesa = ATTESA_MASSIMA_MS, concorrenza = CONCORRENZA, adesso = Date.now } = {}) {
        let chiuso = false, annullaTetto = () => {};
        const chiudi = () => { if (!chiuso) { chiuso = true; annullaTetto(); if (fine) fine(); } };
        const dice = f => { if (avanza && !chiuso) avanza(Math.max(0, Math.min(1, f))); };
        annullaTetto = dopo(attesa, chiudi, setTempo);
        dice(0);
        const { specie, avatar } = await leggiElenco(win, { idsStagioni, giocatore, adesso: adesso() });
        dice(.15);
        await attendiServiceWorker(win, 2000, setTempo);
        const fallite = leggiMemoria(win, CHIAVE_FALLITE) || {};
        const manca = await daScaricare(win, { specie, avatar, fallite, adesso: adesso() });
        const lavori = manca.specie.map(s => lavoroSpecie(s, { setTempo })).concat(manca.avatar.map(u => () => caricaImmagine(u, { setTempo })));
        if (!lavori.length) { dice(1); chiudi(); return { totale: manca.totale, daScaricare: 0, riusciti: 0, falliti: 0 }; }
        const r = await eseguiCoda(lavori, { concorrenza, setTempo, avanza: (fatti, tot) => dice(.15 + .85 * fatti / tot) });
        // le specie senza nessuna immagine non si riprovano per un giorno
        const nuove = { ...fallite };
        for (const k of r.falliti) if (k < manca.specie.length) nuove[sprite().id(manca.specie[k])] = adesso();
        if (r.falliti.length) scriviMemoria(win, CHIAVE_FALLITE, nuove);
        dice(1);
        chiudi();
        return { totale: manca.totale, daScaricare: lavori.length, riusciti: r.riusciti, falliti: r.falliti.length };
    }

    return {
        CACHE_IMMAGINI, CACHE_OPACHE, CHIAVE_SPECIE, CHIAVE_FALLITE, VALIDITA_ELENCO_MS, SILENZIO_FALLITE_MS, ATTESA_MASSIMA_MS, CONCORRENZA,
        specieDa, avatarDa, caricaImmagine, lavoroSpecie, eseguiCoda, inCache, daScaricare, attendiServiceWorker, players, teamsIscritti, leggiElenco, avvia
    };
});
