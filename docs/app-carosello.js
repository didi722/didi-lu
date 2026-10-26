// =====================================================
// APP — carosello: una fila di cose (allenatori, giocatori in classifica, statistiche) di cui se ne vede una alla volta, e si scorre di lato
// ---------------------------------------------------------------------
// Solo nell'app (lo caricano le pagine che lo usano: Trainers, Stats, la classifica di Matches). Qui c'è solo la meccanica, senza niente di disegnato:
//   - la parte pura: dove sta ogni elemento rispetto a quello al centro (anche in giro, dall'ultimo si torna al primo), quali si vedono attorno,
//     cosa vuol dire un gesto del dito (scorrere di lato, anche poco) e quale passo si fa;
//   - collegaGesti: sceglie i gesti su un elemento (dito o mouse) e li trasforma in "avanti" e "indietro", senza togliere lo scorrimento in verticale alla pagina
//     e senza far partire il tocco che chiude il gesto (un trascinamento non è un clic).
// La parte pura è provata in test/app-carosello.test.js; funziona nel browser (window.AppCarosello) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const C = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = C;
    else radice.AppCarosello = C;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SOGLIA_GESTO = 36;        // pixel di spostamento di lato che contano come "ho scorso"
    const SOGLIA_CLIC = 8;          // sotto questa distanza un tocco è un tocco, non un trascinamento
    const PREVALENZA = 1.2;         // un gesto è "di lato" se lo spostamento orizzontale supera quello verticale di questo fattore

    /** L'indice riportato nella fila (0..n-1): `i` può essere negativo o oltre la fine. */
    function dentro(i, n) {
        if (!(n > 0)) return 0;
        return ((Math.trunc(i) % n) + n) % n;
    }

    /**
     * Quanti posti separano `i` dall'elemento al centro (`corrente`): 0 è lui, +1 il seguente, -1 il precedente.
     * In giro (circolare) si prende la strada più corta: in una fila di 5, dal primo l'ultimo è a -1 e non a +4.
     */
    function distanza(i, corrente, n, circolare) {
        if (!(n > 0)) return 0;
        let d = i - corrente;
        if (!circolare) return d;
        d = dentro(d, n);
        return d > n / 2 ? d - n : d;
    }

    /** L'indice dopo un passo di `verso` (+1 avanti, -1 indietro). Senza giro si ferma ai capi. */
    function passo(corrente, n, verso, circolare) {
        if (!(n > 0)) return 0;
        const v = verso < 0 ? -1 : 1;
        return circolare ? dentro(corrente + v, n) : Math.max(0, Math.min(n - 1, corrente + v));
    }

    /**
     * Gli elementi da disegnare attorno a quello al centro: [{ i, d }] con la distanza `d` tra -prima e +dopo, senza ripeterne nessuno anche se
     * la fila è corta (con tre elementi e una finestra più larga ognuno compare una volta sola). In ordine di distanza crescente da -prima.
     */
    function visibili(n, corrente, { prima = 1, dopo = 1, circolare = true } = {}) {
        const fuori = [];
        if (!(n > 0)) return fuori;
        const visti = new Set();
        for (let d = -prima; d <= dopo; d++) {
            let i = corrente + d;
            if (circolare) i = dentro(i, n); else if (i < 0 || i >= n) continue;
            if (visti.has(i)) continue;
            visti.add(i);
            fuori.push({ i, d: distanza(i, corrente, n, circolare) });
        }
        return fuori;
    }

    /** Gli indici dell'elemento al centro e dei successivi (per la classifica: il primo grande, e sotto i due che seguono). */
    function seguenti(n, corrente, quanti, circolare) {
        const fuori = [];
        const visti = new Set();
        for (let k = 0; k < quanti; k++) {
            const i = circolare ? dentro(corrente + k, n) : corrente + k;
            if (i < 0 || i >= n || visti.has(i)) continue;
            visti.add(i);
            fuori.push(i);
        }
        return fuori;
    }

    /**
     * Come si presenta un elemento a distanza `d` dal centro in una fila "a scheda" (quello al centro grande, i vicini più piccoli e un po' trasparenti
     * ai lati, gli altri nascosti dietro): { x (in unità di passo, da -2 a 2), scala, opacita, z }.
     */
    function aspetto(d, vicini = 1) {
        const a = Math.abs(d);
        const x = Math.max(-2, Math.min(2, d));
        if (a === 0) return { x: 0, scala: 1, opacita: 1, z: 3 };
        if (a <= vicini) return { x, scala: 0.82, opacita: 0.62, z: 2 };
        return { x, scala: 0.7, opacita: 0, z: 1 };
    }

    /**
     * Cosa vuol dire un gesto: +1 avanti (il dito va a sinistra), -1 indietro (il dito va a destra), 0 niente (troppo corto, o più in verticale che di lato).
     */
    function gesto(dx, dy, soglia = SOGLIA_GESTO) {
        if (Math.abs(dx) < soglia) return 0;
        if (Math.abs(dx) < Math.abs(dy) * PREVALENZA) return 0;
        return dx < 0 ? 1 : -1;
    }

    /**
     * Collega i gesti a un elemento: dito o mouse. `avanti` e `indietro` sono chiamati a gesto finito (una volta sola per gesto).
     * Scorrere in verticale resta alla pagina (touch-action: pan-y). Un trascinamento non fa scattare il clic che lo chiude.
     * Restituisce { stacca } per toglierli.
     */
    function collegaGesti(el, { avanti, indietro, soglia = SOGLIA_GESTO } = {}) {
        let inizio = null, mosso = false;
        const giu = e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            inizio = { x: e.clientX, y: e.clientY };
            mosso = false;
        };
        const muovi = e => {
            if (!inizio) return;
            if (Math.abs(e.clientX - inizio.x) > SOGLIA_CLIC || Math.abs(e.clientY - inizio.y) > SOGLIA_CLIC) mosso = true;
        };
        const su = e => {
            if (!inizio) return;
            const dx = e.clientX - inizio.x, dy = e.clientY - inizio.y;
            inizio = null;
            const g = gesto(dx, dy, soglia);
            if (g > 0 && avanti) avanti();
            else if (g < 0 && indietro) indietro();
        };
        const annulla = () => { inizio = null; };
        // il clic che chiude un trascinamento non vale (altrimenti scorrere sopra una scheda la aprirebbe)
        const clic = e => { if (mosso) { e.stopPropagation(); e.preventDefault(); mosso = false; } };
        el.addEventListener('pointerdown', giu);
        el.addEventListener('pointermove', muovi);
        el.addEventListener('pointerup', su);
        el.addEventListener('pointercancel', annulla);
        el.addEventListener('click', clic, true);
        if (el.style) el.style.touchAction = 'pan-y';
        return {
            stacca() {
                el.removeEventListener('pointerdown', giu);
                el.removeEventListener('pointermove', muovi);
                el.removeEventListener('pointerup', su);
                el.removeEventListener('pointercancel', annulla);
                el.removeEventListener('click', clic, true);
            }
        };
    }

    return { SOGLIA_GESTO, SOGLIA_CLIC, PREVALENZA, dentro, distanza, passo, visibili, seguenti, aspetto, gesto, collegaGesti };
});
