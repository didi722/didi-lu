/* =====================================================================
   TELEFONO: comportamento dei modali "tocca fuori per chiudere".
   Su PC il clic ovunque sulla finestra della squadra (o del Pokémon) la chiude: va bene col mouse. Con un dito sullo
   schermo la scheda riempie quasi tutta la larghezza e ogni tocco per leggere un fumetto, o per scorrere, la
   chiuderebbe: qui, solo sui dispositivi senza "passaggio del mouse", il tocco dentro la scheda non chiude più.
   Si chiude toccando il bordo scuro fuori dalla scheda, o con la X (visibile solo su touch, vedi mobile.css).
   Non si ferma la propagazione (così i gestori dei Pokémon cliccabili continuano a funzionare): si sostituisce il
   gestore in linea della finestra con uno che reagisce solo ai tocchi sul bordo.
   ===================================================================== */
(function () {
    'use strict';
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(hover: none)').matches) return;

    const FINESTRE = ['teamModal', 'pkmDetailModal'];

    function prepara() {
        for (const id of FINESTRE) {
            const finestra = document.getElementById(id);
            if (!finestra || finestra.dataset.toccoFuori === '1') continue;
            const originale = finestra.onclick;
            if (typeof originale !== 'function') continue;
            finestra.dataset.toccoFuori = '1';
            finestra.onclick = function (evento) {
                if (evento.target === finestra) return originale.call(this, evento);
            };
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prepara);
    else prepara();
})();
