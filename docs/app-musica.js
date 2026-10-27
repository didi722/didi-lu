// =====================================================
// APP — la musica di sottofondo: una canzone da battaglia, che continua da una pagina all'altra
// ---------------------------------------------------------------------
// La canzone si sceglie dalla stessa playlist del sito (il foglio con i link a Internet Archive, quello dell'editor della pagina pubblica): tra i titoli vince quello
// più da battaglia (Battle, Trainer, Gym, Rival...); se la playlist non si legge resta il Pokémon Center di prima. Ogni pagina dell'app è un documento nuovo, quindi la
// musica ripartiva da capo a ogni cambio: ora la posizione si salva uscendo dalla pagina e si riprende da lì (se il telefono blocca la partenza automatica, al primo tocco).
// Vale per l'audio #bg-music-home di ogni pagina; le pagine che gli rimettono il vecchio indirizzo non contano più.
// Funziona nel browser (window.AppMusica) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const M = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = M;
    else { radice.AppMusica = M; if (radice.document) { const d = radice.document; const via = () => M.avvia(radice); if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', via); else via(); } }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const URL_PLAYLIST = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRBD7fZsWUtQ-UqcSaG-2lzeQnbxUdCUlTc8D6b4dCmSLq4-sDpIJGVzKmwwZF0p1uF-Ln3--4jpGk/pub?gid=775181727&single=true&output=csv';
    const RISERVA = 'https://dn721900.ca.archive.org/0/items/pkmn-rse-soundtrack/Disc%201/13%20-%20Pok%C3%A9mon%20Center.mp3';
    const CHIAVE_BRANO = 'appMusicaBrano1';       // { url, nome } scelto (localStorage)
    const CHIAVE_POSTO = 'appMusicaPosto1';        // { url, t } dove era arrivata (sessionStorage)
    const CHIAVE_PREF = 'userMusicPref';           // 'off' = spenta (come nel resto del sito)
    const PAROLE = [[/battle|fight|vs\.?\b|versus/i, 10], [/trainer|gym|rival|champion|elite|leader|team (rocket|aqua|magma|galactic|plasma|flare)/i, 6], [/wild|legendary|final|boss/i, 4], [/victory|theme|route|encounter/i, 1]];
    const NO = /center|centre|lullaby|ending|credits|sleep|pc\b|shop|mart|healing|intro|title|slow|rest/i;

    /** I brani del foglio (nome, link): le righe con un link, per qualunque ordine delle colonne */
    function leggiBrani(csv) {
        const out = [];
        for (const riga of String(csv || '').split(/\r?\n/)) {
            const campi = [];
            let c = '', q = false;
            for (let i = 0; i < riga.length; i++) {
                const ch = riga[i];
                if (q) { if (ch === '"' && riga[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
                else if (ch === '"') q = true; else if (ch === ',') { campi.push(c); c = ''; } else c += ch;
            }
            campi.push(c);
            const url = campi.map(x => x.trim()).find(x => /^https?:\/\//.test(x));
            const nome = campi.map(x => x.trim()).find(x => x && !/^https?:\/\//.test(x));
            if (url && nome) out.push({ nome, url });
        }
        return out;
    }

    /** Quanto un titolo è da battaglia (0 = per niente, o troppo calmo) */
    function punteggio(nome) {
        if (NO.test(nome)) return 0;
        return PAROLE.reduce((s, [re, p]) => s + (re.test(nome) ? p : 0), 0);
    }

    /** Il brano più da battaglia (a parità il primo); null se nessuno lo è */
    function scegli(brani) {
        let meglio = null, top = 0;
        for (const b of brani || []) { const p = punteggio(b.nome); if (p > top) { top = p; meglio = b; } }
        return meglio;
    }

    function avvia(win) {
        const doc = win.document;
        if (!doc.documentElement.classList.contains('app')) return null;
        let audio = doc.getElementById('bg-music-home');
        // le pagine che non avevano il loro lettore (Practice, Profilo, Login...) restavano senza musica: se ne crea uno. La battaglia ha i suoi suoni e resta com'è
        if (!audio && doc.body && typeof doc.createElement === 'function' && !/battle\.html/.test(String((win.location && win.location.pathname) || ''))) {
            audio = doc.createElement('audio');
            audio.id = 'bg-music-home';
            audio.setAttribute('preload', 'auto');
            doc.body.appendChild(audio);
        }
        if (!audio) return null;
        const ls = { get: k => { try { return win.localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { win.localStorage.setItem(k, v); } catch (e) { /* senza memoria */ } } };
        const ss = { get: k => { try { return win.sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { win.sessionStorage.setItem(k, v); } catch (e) { /* senza memoria */ } } };
        let brano = null;
        try { brano = JSON.parse(ls.get(CHIAVE_BRANO) || 'null'); } catch (e) { brano = null; }
        const url0 = (brano && brano.url) || RISERVA;

        // le pagine del sito rimettono il loro indirizzo (il Pokémon Center): non devono più poterlo fare
        let attuale = url0;
        try {
            Object.defineProperty(audio, 'src', { configurable: true, get: () => attuale, set: v => { if (v === RISERVA || /Pok%C3%A9mon%20Center/.test(String(v))) return; attuale = v; audio.setAttribute('src', v); } });
        } catch (e) { /* pazienza */ }
        audio.setAttribute('src', url0);
        audio.volume = .6;
        audio.loop = true;
        const spenta = () => ls.get(CHIAVE_PREF) === 'off';

        const riprendi = () => {
            let posto = null;
            try { posto = JSON.parse(ss.get(CHIAVE_POSTO) || 'null'); } catch (e) { posto = null; }
            const vai = () => { if (posto && posto.url === attuale && posto.t > 0 && isFinite(audio.duration || Infinity)) { try { audio.currentTime = posto.t; } catch (e) { /* non ancora */ } } };
            if (audio.readyState >= 1) vai(); else audio.addEventListener('loadedmetadata', vai, { once: true });
        };
        const parti = () => {
            if (spenta()) return;
            audio.muted = false;
            const p = audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => doc.addEventListener('pointerdown', () => { if (!spenta()) audio.play().catch(() => {}); }, { once: true }));
        };
        const salva = () => { if (!audio.paused || audio.currentTime > 0) ss.set(CHIAVE_POSTO, JSON.stringify({ url: attuale, t: audio.currentTime })); };
        // la musica non deve fermarsi da sola: un tocco (il suo "bip" sintetizzato, un'altra parte della pagina...) può metterla in pausa; se non l'ha spenta chi ascolta
        // (userMusicPref) riparte subito (salvo `window.AppMusicaPausa`: la pagina l'ha fermata apposta, per esempio mentre suona un replay), e a ogni tocco si riprova se era rimasta ferma (pagina appena aperta con la partenza automatica bloccata)
        const riparti = () => { if (!spenta() && !win.AppMusicaPausa && audio.paused) { audio.muted = false; const p = audio.play(); if (p && typeof p.catch === 'function') p.catch(() => { /* al prossimo tocco */ }); } };
        audio.addEventListener('pause', () => { win.setTimeout(() => { if (doc.visibilityState !== 'hidden') riparti(); }, 120); });
        doc.addEventListener('pointerdown', riparti, true);
        doc.addEventListener('touchend', riparti, true);
        win.addEventListener('pagehide', salva);
        doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') salva(); });
        // anche a metà pagina (il browser può chiudere senza avvisi)
        win.setInterval(salva, 1000);
        riprendi();
        parti();

        // il brano da battaglia: letto una volta dal foglio e ricordato; vale dalla prossima apertura di una pagina (cambiarlo adesso farebbe ripartire la musica)
        if (!brano && win.fetch) {
            win.fetch(URL_PLAYLIST).then(r => r.text()).then(t => {
                const b = scegli(leggiBrani(t));
                if (b) ls.set(CHIAVE_BRANO, JSON.stringify(b));
            }).catch(() => { /* resta il Pokémon Center */ });
        }
        return { audio, brano: () => attuale };
    }

    return { URL_PLAYLIST, RISERVA, CHIAVE_BRANO, CHIAVE_POSTO, leggiBrani, punteggio, scegli, avvia };
});
