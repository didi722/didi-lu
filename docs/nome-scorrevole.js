// =====================================================
// NOME CHE SCORRE — Poké-Tournament
//
// Un nome troppo lungo per il suo riquadro non si taglia con i puntini di sospensione: scorre piano fino alla fine, si ferma un istante,
// poi torna piano all'inizio, e così via. Se il nome ci sta, non si muove.
//
//   NomeScorrevole.calcola(larghezzaVisibile, larghezzaTesto) -> null (ci sta) | { eccesso, durata }
//        eccesso: quanti pixel sbordano; durata: secondi per un tratto (andata o ritorno), sempre lenta (da 4 a 18 secondi)
//   NomeScorrevole.applica(elemento)        misura un elemento e lo fa scorrere (o fermare)
//   NomeScorrevole.applicaTutti(selettore)  lo stesso per tutti gli elementi che corrispondono
//   NomeScorrevole.installa(selettore)      lo fa subito, e di nuovo quando la pagina cambia o la finestra si ridimensiona
//
// Il CSS è in nome-scorrevole.css (una sola regola, uguale in tutti i temi: i temi non cambiano misure né movimento).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.NomeScorrevole = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PIXEL_AL_SECONDO = 30;     // lentamente
    const DURATA_MINIMA = 4;         // anche per uno sbordo piccolo
    const DURATA_MASSIMA = 18;       // un nome lunghissimo non impiega un minuto: al massimo 18 secondi per tratto
    const QUOTA_FERMA = 0.16;        // a ogni estremo il nome resta fermo per questa parte di un tratto (vedi i keyframes del CSS)

    function calcola(larghezzaVisibile, larghezzaTesto) {
        const eccesso = Math.ceil((Number(larghezzaTesto) || 0) - (Number(larghezzaVisibile) || 0));
        if (!(larghezzaVisibile > 0) || eccesso <= 1) return null;
        const tragitto = eccesso / PIXEL_AL_SECONDO;
        const durata = Math.min(DURATA_MASSIMA, Math.max(DURATA_MINIMA, tragitto / (1 - 2 * QUOTA_FERMA)));
        return { eccesso, durata: Math.round(durata * 10) / 10 };
    }

    // il testo dell'elemento sta in un <span class="ns-testo">: è lui che si muove
    function conSpan(el) {
        for (const f of el.children || []) if (f.classList && f.classList.contains('ns-testo')) return f;
        const span = el.ownerDocument.createElement('span');
        span.className = 'ns-testo';
        while (el.firstChild) span.appendChild(el.firstChild);
        el.appendChild(span);
        return span;
    }

    function applica(el) {
        if (!el || !el.ownerDocument) return false;
        const span = conSpan(el);
        const stile = el.ownerDocument.defaultView ? el.ownerDocument.defaultView.getComputedStyle(el) : null;
        const riempimento = stile ? (parseFloat(stile.paddingLeft) || 0) + (parseFloat(stile.paddingRight) || 0) : 0;
        // se l'elemento è nascosto (larghezza 0) non si può misurare: si lascia com'è
        const visibile = el.clientWidth - riempimento;
        const stato = el.clientWidth > 0 ? calcola(visibile, span.offsetWidth) : null;
        if (stato) {
            el.style.setProperty('--ns-eccesso', `-${stato.eccesso}px`);
            el.style.setProperty('--ns-durata', `${stato.durata}s`);
            el.classList.add('ns-attivo');
        } else {
            el.classList.remove('ns-attivo');
            el.style.removeProperty('--ns-eccesso');
            el.style.removeProperty('--ns-durata');
        }
        return !!stato;
    }

    function applicaTutti(selettore, radice) {
        const doc = radice || (typeof document !== 'undefined' ? document : null);
        if (!doc) return 0;
        let n = 0;
        doc.querySelectorAll(selettore).forEach(el => { if (applica(el)) n++; });
        return n;
    }

    function installa(selettore) {
        if (typeof document === 'undefined') return;
        let attesa = null;
        const rifai = () => { clearTimeout(attesa); attesa = setTimeout(() => applicaTutti(selettore), 120); };
        applicaTutti(selettore);
        window.addEventListener('resize', rifai);
        window.addEventListener('load', rifai);
        if (typeof MutationObserver === 'function') {
            new MutationObserver(rifai).observe(document.body, { childList: true, subtree: true, characterData: true });
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(rifai).catch(() => {});
    }

    return { calcola, applica, applicaTutti, installa, PIXEL_AL_SECONDO, DURATA_MINIMA, DURATA_MASSIMA, QUOTA_FERMA };
});
