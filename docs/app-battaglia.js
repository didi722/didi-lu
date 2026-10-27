// =====================================================
// APP — i comandi della battaglia come in un gioco Pokémon
// ---------------------------------------------------------------------
// Solo nell'app, solo sul telefono (app.js lo scarica per battle.html). Il simulatore (battle-ui.js) disegna come sempre le mosse e i cambi, tutti insieme;
// qui il pannello diventa a due passi, come nei giochi:
//   1. "What will X do?"  con due tasti grandi: POKÉMON (a sinistra) e FIGHT (a destra)
//   2. FIGHT -> le quattro mosse (e Mega/Tera/Dynamax, se ci sono);  POKÉMON -> la squadra.  "Back" torna al passo 1.
// Non cambia niente nelle scelte: i tasti sono sempre quelli del simulatore, qui si decide solo quali mostrare e dove. Lo fa lo stile (app-battaglia.css)
// guardando data-ab sul .corpo di ogni pannello, e su <body> quello del pannello che si vede:
//   menu | mosse | cambi            i due passi di sopra
//   anteprima | bersagli | cambio   scelta dei Pokémon prima della partita, del bersaglio (doppie), del Pokémon che entra dopo un KO
//   anim | messaggio | fine | rivincita   il turno che si sta giocando, un'attesa ("Waiting for…"), fine partita contro la CPU, "Play again?"
// Il pannello si ridisegna da solo a ogni cambio di stato: l'osservatore rimette i tasti, e ricorda a che passo eri finché la domanda è la stessa.
// Tenendo premuto un Pokémon o una mossa compare la sua scheda: il tooltip di Showdown, rifatto come una carta da gioco da app-schede.js (che si scarica prima di questo file).
// =====================================================
(function (radice, fabbrica) {
    const B = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = B;
    else if (radice.document.readyState === 'loading') radice.document.addEventListener('DOMContentLoaded', () => B.avvia(radice));
    else B.avvia(radice);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // dove vale il layout da telefono (identica a quella di app-battaglia.css)
    const CONDIZIONE_TELEFONO = '(max-width: 700px), (max-height: 520px)';

    /** Il passo in cui mostrare il pannello: lo stesso di prima se la domanda non è cambiata, altrimenti il menu */
    function passoDa({ chiave, precedente }) {
        return precedente && precedente.chiave === chiave && precedente.passo ? precedente.passo : 'menu';
    }

    /** Si può cambiare Pokémon? (almeno un compagno non spento) */
    function puoCambiare(corpo) {
        return corpo.querySelectorAll('.cambi .btn-pkm:not(.spento)').length > 0;
    }

    /**
     * Lo stato di un pannello che non è la scelta della mossa: cosa ci sta dentro, dal più specifico.
     * `ha(selettore)`: c'è un figlio diretto del pannello così; `testoMessaggio`: il testo del messaggio (se c'è).
     */
    function statoAltro({ ha, testoMessaggio, haAzioniCpu }) {
        if (ha('.anteprima-griglia')) return 'anteprima';
        if (ha('.bersagli')) return 'bersagli';
        if (ha('.cambi.grandi')) return 'cambio';
        if (ha('.rivincita')) return 'rivincita';
        if (testoMessaggio == null) return '';
        if (haAzioniCpu) return 'fine';
        return /playing out/i.test(testoMessaggio) ? 'anim' : 'messaggio';
    }

    /** Quanto si tiene premuto (ms) prima che compaia la scheda del Pokémon o della mossa */
    const TENUTA_MS = 450;
    /** Dopo un tocco il telefono manda anche i "mouseover" finti: per questo tempo (ms) non contano */
    const FINESTRA_MOUSE_FINTO_MS = 800;

    /** Un "mouseover" è un'eco di un tocco (e non va fatto vedere ai tooltip di Showdown)? */
    const eEcoDelTocco = (adesso, ultimoTocco) => (adesso - ultimoTocco) < FINESTRA_MOUSE_FINTO_MS;

    /** Di quanto rimpicciolire una scheda alta `h` e larga `w` per farla stare in uno schermo `H` x `W` (con un po' di margine); 1 se ci sta già */
    function zoomPer(h, w, H, W, margine = 12) {
        if (!(h > 0) || !(w > 0)) return 1;
        return Math.max(.5, Math.min(1, (H - margine) / h, (W - margine) / w));
    }

    /** Quanto si può muovere il dito (px) restando una pressione: oltre è uno scorrimento */
    const TOLLERANZA_PX = 10;
    /** Dopo una pressione lunga il telefono manda comunque il "click" al rilascio: per questo tempo (ms) va scartato, o sceglierebbe il Pokémon/la mossa */
    const SCARTA_CLICK_MS = 700;
    /** Gli eventi con cui Showdown apre, blocca o chiude le sue schede da solo: nell'app non devono arrivargli (le fa vedere solo la pressione lunga) */
    const EVENTI_SHOWDOWN = ['touchstart', 'touchend', 'touchcancel', 'touchleave', 'pointerdown', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'focus', 'focusin', 'blur', 'focusout'];

    /**
     * La scheda di un Pokémon o di una mossa (i tooltip di Showdown) si vede solo TENENDO PREMUTO e al centro dello schermo (lo mette il foglio); lasciando, sparisce.
     * Un semplice tocco sceglie (la mossa, il Pokémon) e basta: niente scheda che compare e resta lì, nemmeno con un tocco un po' lento.
     * Showdown da solo la apre al primo contatto, al "focus" e al passaggio del mouse (anche quello finto che il telefono manda dopo un tocco), e la blocca se il dito resta
     * appena più a lungo: qui quegli eventi non gli arrivano (si ferma la propagazione in cattura, prima dei suoi), e la apriamo noi, chiamando la sua funzione.
     */
    function collegaSchede(win) {
        const doc = win.document;
        let timer = null, inizio = null, lungo = false, scartaFinoA = 0;
        const tooltips = () => win.PSClient && win.PSClient.BattleTooltips || win.BattleTooltips || null;
        const nascondi = () => {
            const T = tooltips();
            if (T && typeof T.hideTooltip === 'function') { try { T.hideTooltip(); } catch (e) { /* niente da nascondere */ } }
        };
        const ferma = () => { if (timer) { win.clearTimeout(timer); timer = null; } };
        const dellaScheda = e => (e.target && e.target.closest ? e.target.closest('.has-tooltip') : null);
        const rilascia = () => {
            ferma();
            inizio = null;
            if (lungo) { lungo = false; scartaFinoA = Date.now() + SCARTA_CLICK_MS; }
            nascondi();
        };
        EVENTI_SHOWDOWN.forEach(tipo => win.addEventListener(tipo, e => {
            const el = dellaScheda(e);
            if (tipo === 'touchstart' && el) {
                const t = e.touches && e.touches[0];
                inizio = t ? { x: t.clientX, y: t.clientY } : null;
                lungo = false;
                ferma();
                timer = win.setTimeout(() => {
                    timer = null;
                    const istanza = win.AppTooltips;           // l'istanza di Showdown, messa a disposizione da battle-ui.js
                    if (istanza && typeof istanza.showTooltip === 'function') { try { nascondi(); istanza.showTooltip(el); lungo = true; if (win.navigator && typeof win.navigator.vibrate === 'function') win.navigator.vibrate(12); } catch (err) { /* resta com'è */ } }
                }, TENUTA_MS);
            }
            if (tipo === 'touchend' || tipo === 'touchcancel') rilascia();
            if (el) e.stopImmediatePropagation();
        }, true));
        // il dito che scorre (i pannelli scorrono di lato) non è una pressione
        win.addEventListener('touchmove', e => {
            const t = e.touches && e.touches[0];
            if (timer && inizio && t && (Math.abs(t.clientX - inizio.x) > TOLLERANZA_PX || Math.abs(t.clientY - inizio.y) > TOLLERANZA_PX)) ferma();
        }, { capture: true, passive: true });
        // dopo una pressione lunga il click del rilascio non deve scegliere niente
        win.addEventListener('click', e => {
            if (Date.now() < scartaFinoA && dellaScheda(e)) { e.preventDefault(); e.stopImmediatePropagation(); scartaFinoA = 0; }
        }, true);
        doc.addEventListener('contextmenu', e => { if (dellaScheda(e)) e.preventDefault(); }, true);
        // la scheda deve stare tutta nello schermo: se è più alta, si rimpicciolisce di quanto serve (niente tagli)
        const telefono = () => !!(win.matchMedia && win.matchMedia(CONDIZIONE_TELEFONO).matches);
        const adatta = () => {
            const t = doc.querySelector('#tooltipwrapper .tooltip');
            if (!t) return;
            // il tooltip di Showdown diventa una scheda da gioco (app-schede.js); se non la sa fare, resta com'è
            const S = win.AppSchede;
            if (S && !t.dataset.sc && telefono()) {
                const SP = win.SpritePkm;
                S.trasforma(t, { gif: SP ? s => SP.gif(s) : null, id: SP ? s => SP.id(s) : null, riserva: SP && typeof SP.riserva === 'function' ? (img, id) => SP.riserva(img, id) : null });
            }
            // la natura non serve per giocare: via
            t.querySelectorAll('.tt-riga').forEach(r => { const e = r.querySelector('.tt-etichetta'); if (e && /^nature$/i.test(e.textContent.trim())) r.remove(); });
            t.style.zoom = '';
            const r = t.getBoundingClientRect();
            const f = zoomPer(Math.max(r.height, t.scrollHeight), Math.max(r.width, t.scrollWidth), win.innerHeight, win.innerWidth);
            if (f < 1) t.style.zoom = String(f);
        };
        const cerca = () => {
            const w = doc.getElementById('tooltipwrapper');
            if (!w) return false;
            new win.MutationObserver(adatta).observe(w, { childList: true, subtree: true });
            return true;
        };
        if (cerca()) adatta(); else { const o = new win.MutationObserver(() => { if (cerca()) { o.disconnect(); adatta(); } }); o.observe(doc.body, { childList: true }); }
    }

    function avvia(win) {
        const doc = win.document;
        const radice = doc.documentElement;
        if (!radice.classList.contains('app')) return null;
        collegaSchede(win);
        const ricorda = new WeakMap();      // .corpo -> { chiave, passo }
        const mq = win.matchMedia ? win.matchMedia(CONDIZIONE_TELEFONO) : { matches: false };

        const tasto = (classe, testo, onclick) => {
            const b = doc.createElement('button');
            b.type = 'button';
            b.className = classe;
            b.textContent = testo;
            b.addEventListener('click', onclick);
            return b;
        };

        function vai(corpo, passo) {
            const d = corpo.querySelector('.testa-scelta .domanda');
            ricorda.set(corpo, { chiave: d ? d.textContent : '', passo });
            corpo.dataset.ab = passo;
            aggiornaCorpo();
        }

        function pulisci(corpo) {
            delete corpo.dataset.ab;
            ricorda.delete(corpo);
            corpo.querySelectorAll('.ab-menu, .ab-indietro').forEach(x => x.remove());
        }

        function elabora(corpo) {
            if (!mq.matches) { if (corpo.dataset.ab || corpo.querySelector('.ab-menu')) pulisci(corpo); return; }
            const testa = corpo.querySelector(':scope > .testa-scelta');
            const haMosse = !!corpo.querySelector(':scope > .mosse');

            // il "Back" del simulatore (scelta del bersaglio) è un tasto indietro come gli altri: sta dove c'è "← Box"
            if (testa) for (const b of testa.querySelectorAll(':scope > .btn')) if (/^back$/i.test(b.textContent.trim())) b.classList.add('ab-indietro');

            if (!testa || !haMosse) {
                // niente mosse da scegliere: il pannello resta quello del simulatore, e lo stile sa di che cosa si tratta
                if (corpo.querySelector('.ab-menu')) pulisci(corpo);
                ricorda.delete(corpo);
                const m = corpo.querySelector(':scope > .messaggio');
                const stato = statoAltro({
                    ha: s => !!corpo.querySelector(':scope > ' + s),
                    testoMessaggio: m ? m.textContent : null,
                    haAzioniCpu: !!(m && m.querySelector('.azioni-cpu'))
                });
                if (stato) corpo.dataset.ab = stato; else delete corpo.dataset.ab;
                return;
            }
            if (corpo.querySelector(':scope > .ab-menu')) return;      // già pronto: è il nostro stesso inserimento che ha fatto scattare l'osservatore

            const d = testa.querySelector('.domanda');
            const passo = passoDa({ chiave: d ? d.textContent : '', precedente: ricorda.get(corpo) });

            const menu = doc.createElement('div');
            menu.className = 'ab-menu';
            const lotta = tasto('ab-btn ab-lotta', 'Fight', () => vai(corpo, 'mosse'));
            const squadra = tasto('ab-btn ab-squadra', 'Pokémon', () => { if (puoCambiare(corpo)) vai(corpo, 'cambi'); });
            if (!puoCambiare(corpo)) {
                squadra.setAttribute('aria-disabled', 'true');
                squadra.classList.add('spento');
                const et = corpo.querySelector('.cambi .etichetta');
                if (et && /trapped/i.test(et.textContent)) squadra.dataset.nota = 'Trapped';
            }
            // a sinistra POKÉMON, a destra FIGHT (l'ordine nel DOM è quello di lettura: Fight, poi Pokémon; lo stile li mette ai due lati)
            menu.append(lotta, squadra);
            testa.after(menu);
            testa.prepend(tasto('ab-indietro', 'Back', () => vai(corpo, 'menu')));
            vai(corpo, passo);
        }

        // il passo del pannello che si vede, anche su <body>: serve allo stile per i pezzi che stanno fuori dal pannello (il tasto "← Box", l'insegna)
        function aggiornaCorpo() {
            const visibile = doc.querySelector('#comandi .pannello:not([hidden]) .corpo');
            const v = visibile && visibile.dataset.ab;
            if (v) doc.body.dataset.ab = v; else delete doc.body.dataset.ab;
        }

        function tutti() {
            doc.querySelectorAll('#comandi .corpo').forEach(elabora);
            aggiornaCorpo();
        }

        const comandi = doc.getElementById('comandi');
        if (!comandi) return null;
        const osservatore = new win.MutationObserver(tutti);
        osservatore.observe(comandi, { childList: true, subtree: true });
        if (mq.addEventListener) mq.addEventListener('change', tutti);
        tutti();
        return { osservatore, tutti };
    }

    return { CONDIZIONE_TELEFONO, zoomPer, TENUTA_MS, TOLLERANZA_PX, SCARTA_CLICK_MS, EVENTI_SHOWDOWN, FINESTRA_MOUSE_FINTO_MS, eEcoDelTocco, passoDa, puoCambiare, statoAltro, avvia };
});
