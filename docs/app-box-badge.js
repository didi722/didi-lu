// =====================================================
// APP — Box: le spiegazioni dei badge (dei team e dei Pokémon)
// ---------------------------------------------------------------------
// Nel Box dell'app i badge ci sono (medagliette sulla scheda del team, nella testata del team aperto, sulle carte dei Pokémon e nella scheda del Pokémon), ma SENZA
// l'avanzamento verso il livello dopo: toccandone uno compare una nota in basso con nome, livello e cosa premia (per qualche secondo; tenendo premuto resta finché
// non si lascia). Il testo è quello che il sito mette già nel `title` delle medagliette (nome · livello, descrizione, numero fatto) e nel fumetto dei fiocchi.
// La parte pura (il testo della nota) è provata in test/app-box-badge.test.js; funziona nel browser (window.AppBoxBadge) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const B = fabbrica(inNode ? require('./app-carosello.js') : radice.AppCarosello);
    if (inNode) module.exports = B;
    else {
        radice.AppBoxBadge = B;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => B.avvia(radice)); else B.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (Car) {
    'use strict';

    /** Gli elementi che si toccano: le medagliette (`.bt-mini`, con la descrizione nel title) e i fiocchi dello scaffale (`.fiocco`, con il fumetto dentro) */
    const SELETTORE = '.bt-mini[title]:not(.bt-altri), #pkm-fiocchi .fiocco';

    /** Dal testo "Nome · Livello\nCosa premia\n12 KO" alla nota: titolo e descrizione (il numero fatto e il progresso non servono) */
    function notaDaTitolo(testo) {
        const righe = String(testo == null ? '' : testo).split('\n').map(r => r.trim()).filter(Boolean);
        return { titolo: righe[0] || '', descrizione: righe[1] || '' };
    }

    /** La nota di un elemento già nella pagina: dal title di una medaglietta o dal fumetto di un fiocco (senza la riga "Next level: ...", che è avanzamento) */
    function notaDiElemento(el) {
        if (!el) return null;
        const tip = el.querySelector ? el.querySelector('.fiocco-tip') : null;
        if (tip) {
            const t = tip.querySelector('strong');
            const p = tip.querySelector('p:not(.fiocco-tip-nota)');
            return { titolo: t ? t.textContent.trim() : '', descrizione: p ? p.textContent.trim() : '' };
        }
        return notaDaTitolo(el.getAttribute ? el.getAttribute('title') : '');
    }

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const htmlNota = n => `<b>${esc(n.titolo)}</b>${n.descrizione ? `<span>${esc(n.descrizione)}</span>` : ''}`;

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        let nota = null;
        const mostra = el => {
            const n = notaDiElemento(el);
            if (!n || !n.titolo) return;
            if (!nota) { nota = doc.createElement('div'); nota.id = 'ab-nota'; nota.className = 'ab-nota'; nota.setAttribute('role', 'status'); doc.body.appendChild(nota); }
            nota.innerHTML = htmlNota(n);
            nota.hidden = false;
        };
        const nascondi = () => { if (nota) nota.hidden = true; };
        // la medaglietta sta spesso dentro una carta che si apre al tocco (il Pokémon nel team): toccare il badge spiega, non apre
        doc.addEventListener('click', e => {
            const el = e.target && e.target.closest ? e.target.closest(SELETTORE) : null;
            if (el) e.stopPropagation();
        }, true);
        const legame = Car.collegaPressione(doc.body, SELETTORE, { mostra, nascondi });
        return { mostra, nascondi, legame };
    }

    return { SELETTORE, notaDaTitolo, notaDiElemento, htmlNota, avvia };
});
