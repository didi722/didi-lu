/* =====================================================================
   IL PULSANTE DEL MENÙ DEL SITO — sempre in vista, piccolo quando si scorre
   ---------------------------------------------------------------------
   Il tasto con il nome dell'utente apre il menù del sito: è l'unica navigazione. Prima in alcune pagine (Box, Rulebook) scorreva via con la
   pagina e nelle altre restava fermo sopra il contenuto, quindi non si sapeva mai dove cercarlo. Ora sta fermo in alto a destra in tutte le
   pagine e, appena si scorre, si riduce alla sola icona (classe menu-compatto su <body>: lo stile è in temi.css, come ogni altro dettaglio
   del tema). Torna intero al passaggio del mouse, col fuoco della tastiera, e quando si è in cima alla pagina.
   Parte pura (soglia) provata in test/menu-sito.test.js; funziona nel browser (window.MenuSito) e in Node (require).
   ===================================================================== */
(function (radice, fabbrica) {
    const M = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = M;
    else {
        radice.MenuSito = M;
        if (radice.document) M.avvia(radice);
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SOGLIA = 60;      // pixel scorsi oltre i quali il pulsante si fa piccolo

    /** Il pulsante è compatto quando la pagina è scorsa più della soglia. */
    const compatto = scorso => (Number(scorso) || 0) > SOGLIA;

    function avvia(win) {
        const doc = win.document;
        if (!doc || typeof win.addEventListener !== 'function') return null;
        let attesa = 0;

        // quanto è scorsa la pagina: la finestra, oppure (alcune pagine hanno body con overflow) il body; un contenitore interno conta solo se
        // occupa quasi tutto lo schermo (non un elenco o una finestra che scorre da sola)
        const scorso = bersaglio => {
            const grande = el => el && el.clientHeight >= (win.innerHeight || 0) * 0.6 && el.clientWidth >= (win.innerWidth || 0) * 0.6;
            let y = Math.max(win.pageYOffset || 0, doc.documentElement ? doc.documentElement.scrollTop || 0 : 0, doc.body ? doc.body.scrollTop || 0 : 0);
            if (bersaglio && bersaglio.nodeType === 1 && bersaglio !== doc.body && bersaglio !== doc.documentElement && grande(bersaglio)) y = Math.max(y, bersaglio.scrollTop || 0);
            return y;
        };
        const aggiorna = bersaglio => {
            attesa = 0;
            if (doc.body) doc.body.classList.toggle('menu-compatto', compatto(scorso(bersaglio)));
        };
        const alloScroll = e => {
            if (attesa) return;
            const bersaglio = e && e.target;
            attesa = (win.requestAnimationFrame || (f => win.setTimeout(f, 16)))(() => aggiorna(bersaglio));
        };
        // in cattura: gli eventi di scroll dei contenitori non risalgono fino alla finestra
        win.addEventListener('scroll', alloScroll, { passive: true, capture: true });
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => aggiorna());
        else aggiorna();
        return { aggiorna };
    }

    return { SOGLIA, compatto, avvia };
});
