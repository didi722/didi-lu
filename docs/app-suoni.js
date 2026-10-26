// =====================================================
// APP — suoni e vibrazione dei tasti, come in un gioco
// ---------------------------------------------------------------------
// Solo nell'app (lo carica app.js; il menù lo collega da sé). Ogni tocco su un tasto, un link o una tessera fa un "bip" corto e una vibrazione leggera;
// entrare, tornare indietro e confermare hanno un suono loro. I suoni non sono file: si sintetizzano al volo con WebAudio (niente da scaricare).
// Gli interruttori sono quelli che già ci sono nel sito: il suono segue userMusicPref (la voce "Sound" delle impostazioni: spento = silenzio
// anche qui), la vibrazione ha il suo (appVibra) nelle impostazioni del menù.
// Su un elemento si può scegliere il suono con data-suono="indietro|apri|chiudi|ok|errore|nessuno".
// La parte pura (che suono per quale elemento, le note) è provata in test/app-suoni.test.js; funziona nel browser (window.Suoni) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const S = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = S;
    else if (!radice.Suoni) {
        radice.Suoni = S;
        // nell'app: window.Suoni.fai('ok'), .suona(...), .vibra(...) per chi vuole un suono suo (il menù, la battaglia)
        if (radice.document && radice.document.documentElement.classList.contains('app')) Object.assign(S, S.collega(radice));
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CHIAVE_SUONO = 'userMusicPref';        // 'off' = spento (la stessa del resto del sito)
    const CHIAVE_VIBRA = 'appVibra';             // 'off' = niente vibrazione

    // gli elementi che al tocco fanno rumore
    const TOCCABILI = 'a[href], button, summary, [role="button"], [role="tab"], label[for], .btn, [onclick], input[type="checkbox"], input[type="radio"], select';

    // ogni suono è una lista di note: [frequenza, quando (s), quanto dura (s), forma d'onda, volume, frequenza finale]
    const NOTE = {
        tocco: [[740, 0, .06, 'square', .035, 520]],
        scegli: [[523, 0, .07, 'square', .04], [784, .06, .1, 'square', .04]],
        indietro: [[494, 0, .06, 'square', .035], [330, .055, .09, 'square', .035]],
        apri: [[280, 0, .16, 'triangle', .05, 880]],
        chiudi: [[880, 0, .14, 'triangle', .04, 300]],
        ok: [[523, 0, .12, 'square', .04], [659, .07, .12, 'square', .04], [784, .14, .12, 'square', .04], [1047, .21, .22, 'square', .045]],
        errore: [[180, 0, .2, 'sawtooth', .05, 120], [150, .12, .2, 'sawtooth', .05, 100]],
        avvio: [[392, 0, .14, 'square', .045], [523, .12, .14, 'square', .045], [659, .24, .14, 'square', .045], [784, .36, .1, 'square', .045], [1047, .46, .4, 'square', .05]]
    };
    const VIBRA = { tocco: 8, scegli: 12, indietro: 8, apri: 10, chiudi: 6, ok: [14, 40, 20], errore: [30, 40, 30], avvio: 0 };

    /** Che suono fa un elemento: quello scritto sopra (data-suono), altrimenti il "tocco"; null se è spento o disattivato. */
    function suonoDi(el) {
        if (!el || el.nodeType !== 1) return null;
        const x = el.closest ? el.closest('[data-suono]') : null;
        const scelto = x ? x.getAttribute('data-suono') : '';
        if (scelto === 'nessuno') return null;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
        if (scelto && NOTE[scelto]) return scelto;
        return 'tocco';
    }

    function collega(win) {
        const doc = win.document;
        const leggi = k => { try { return win.localStorage.getItem(k); } catch (e) { return null; } };
        let ctx = null;
        const acceso = () => leggi(CHIAVE_SUONO) !== 'off';
        const vibraAcceso = () => leggi(CHIAVE_VIBRA) !== 'off';

        function audio() {
            if (!ctx) {
                const AC = win.AudioContext || win.webkitAudioContext;
                if (!AC) return null;
                try { ctx = new AC(); } catch (e) { return null; }
            }
            if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* si riprova al prossimo tocco */ } }
            return ctx;
        }

        function nota([freq, quando, durata, forma, volume, fine]) {
            const c = audio();
            if (!c) return;
            const t = c.currentTime + quando;
            const o = c.createOscillator();
            const g = c.createGain();
            o.type = forma || 'square';
            o.frequency.setValueAtTime(freq, t);
            if (fine && fine !== freq) o.frequency.exponentialRampToValueAtTime(fine, t + durata);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(volume || .04, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + durata + 0.03);
        }

        function suona(nome) {
            if (!acceso() || !NOTE[nome]) return false;
            try { NOTE[nome].forEach(nota); return true; } catch (e) { return false; }
        }
        function vibra(nome) {
            const m = VIBRA[nome];
            if (!m || !vibraAcceso() || !win.navigator || typeof win.navigator.vibrate !== 'function') return false;
            try { win.navigator.vibrate(m); return true; } catch (e) { return false; }
        }
        const fai = nome => { suona(nome); vibra(nome); };

        // ogni tocco su qualcosa di toccabile: al primo contatto (non al rilascio), come nei giochi
        doc.addEventListener('pointerdown', e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const t = e.target && e.target.closest ? e.target.closest(TOCCABILI) : null;
            const nome = t ? suonoDi(t) : null;
            if (nome) fai(nome);
        }, { capture: true, passive: true });

        return { suona, vibra, fai, audio, acceso, vibraAcceso };
    }

    return { CHIAVE_SUONO, CHIAVE_VIBRA, TOCCABILI, NOTE, VIBRA, suonoDi, collega };
});
