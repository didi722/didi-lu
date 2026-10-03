/* =====================================================================
   TOOLTIP "COACH" per i suggerimenti dei pulsanti
   ---------------------------------------------------------------------
   Il browser mostra l'attributo title con il suo fumetto grigio. Qui, dove c'è il mouse, quel testo esce nel fumetto
   "coach" del sito (stile in tooltip.css): al passaggio si sposta in un attributo di servizio (così il fumetto del
   browser non compare) e si rimette a posto appena il mouse esce. Sui dispositivi touch non fa nulla (non c'è
   "passaggio"). Non tocca battle.html (ha i suoi fumetti) né i title di iframe e svg (servono ai lettori di schermo).
   La posizione è una funzione pura (posiziona), provata in test/tooltip.test.js.
   ===================================================================== */
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else {
        radice.TooltipCoach = fabbrica();
        if (radice.document) radice.TooltipCoach.avvia(radice);
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MARGINE = 10;     // distanza minima dai bordi dello schermo
    const DISTANZA = 10;    // distanza dall'elemento
    const ESCLUSI = 'iframe, svg, #tooltipwrapper, #tooltipwrapper *';

    /**
     * Dove mettere il fumetto: centrato sotto l'elemento, sopra se sotto non c'è posto, sempre dentro lo schermo.
     * @param {{left:number, top:number, right:number, bottom:number}} ancora  riquadro dell'elemento (coordinate della finestra)
     * @param {{w:number, h:number}} dim   dimensioni del fumetto
     * @param {{w:number, h:number}} vista dimensioni dello schermo
     */
    function posiziona(ancora, dim, vista) {
        let top = ancora.bottom + DISTANZA;
        let sopra = false;
        if (top + dim.h > vista.h - MARGINE && ancora.top - DISTANZA - dim.h >= MARGINE) {
            top = ancora.top - DISTANZA - dim.h;
            sopra = true;
        }
        top = Math.max(MARGINE, Math.min(top, vista.h - dim.h - MARGINE));
        let left = (ancora.left + ancora.right) / 2 - dim.w / 2;
        left = Math.max(MARGINE, Math.min(left, vista.w - dim.w - MARGINE));
        return { left: Math.round(left), top: Math.round(top), sopra };
    }

    function avvia(win) {
        const doc = win.document;
        if (!doc || typeof win.matchMedia !== 'function' || !win.matchMedia('(hover: hover)').matches) return null;

        let fumetto = null;
        let corrente = null;

        const crea = () => {
            if (fumetto) return fumetto;
            fumetto = doc.createElement('div');
            fumetto.className = 'tip-coach tip-globale';
            fumetto.setAttribute('role', 'tooltip');
            fumetto.style.whiteSpace = 'pre-line';
            (doc.body || doc.documentElement).appendChild(fumetto);
            return fumetto;
        };
        const ripristina = el => {
            const t = el.getAttribute('data-tip-titolo');
            if (t != null) { el.setAttribute('title', t); el.removeAttribute('data-tip-titolo'); }
        };
        const nascondi = () => {
            if (corrente) { ripristina(corrente); corrente = null; }
            if (fumetto) fumetto.classList.remove('tip-visibile');
        };
        const mostra = el => {
            const testo = el.getAttribute('title');
            if (!testo || !testo.trim()) return;
            el.setAttribute('data-tip-titolo', testo);
            el.removeAttribute('title');
            corrente = el;
            const f = crea();
            f.textContent = testo.trim();
            f.classList.remove('tip-visibile');
            f.style.left = '0px'; f.style.top = '0px';
            const r = el.getBoundingClientRect();
            const p = posiziona(r, { w: f.offsetWidth, h: f.offsetHeight }, { w: win.innerWidth, h: win.innerHeight });
            f.style.left = p.left + 'px';
            f.style.top = p.top + 'px';
            f.classList.add('tip-visibile');
        };
        const cercaElemento = nodo => (nodo && nodo.closest ? nodo.closest('[title]') : null);

        doc.addEventListener('mouseover', e => {
            if (corrente && corrente.contains(e.target)) return;      // ancora dentro lo stesso elemento
            const el = cercaElemento(e.target);
            if (corrente) nascondi();
            if (el && !el.matches(ESCLUSI)) mostra(el);
        });
        doc.addEventListener('mouseout', e => {
            if (corrente && !(e.relatedTarget && corrente.contains(e.relatedTarget))) nascondi();
        });
        doc.addEventListener('focusin', e => {
            const el = cercaElemento(e.target);
            if (el && !el.matches(ESCLUSI)) { nascondi(); mostra(el); }
        });
        doc.addEventListener('focusout', nascondi);
        doc.addEventListener('keydown', e => { if (e.key === 'Escape') nascondi(); });
        win.addEventListener('scroll', nascondi, true);
        win.addEventListener('blur', nascondi);
        return { nascondi, mostra };
    }

    return { posiziona, avvia, MARGINE, DISTANZA };
});
