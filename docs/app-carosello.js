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
    const SOGLIA_SCATTO = 14;       // pixel minimi di uno scatto veloce
    const VELOCITA_SCATTO = 0.35;   // px per ms: sopra, il gesto è uno scatto
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
     * `d` può avere la virgola: mentre il dito trascina, ogni elemento è a metà strada tra il suo posto e quello dopo, e cambia grandezza e trasparenza di pari passo.
     * Con `d` intero il risultato è quello di sempre.
     */
    function aspetto(d, vicini = 1) {
        const t = Math.abs(d);
        const x = Math.max(-2, Math.min(2, d));
        let scala, opacita;
        if (t <= 1) { scala = 1 - 0.18 * t; opacita = 1 - 0.38 * t; }
        else if (t <= vicini) { scala = 0.82; opacita = 0.62; }
        else if (t <= vicini + 1) { scala = 0.82 - 0.12 * (t - vicini); opacita = 0.62 * (vicini + 1 - t); }
        else { scala = 0.7; opacita = 0; }
        const arrotonda = v => Math.round(v * 1000) / 1000;
        return { x: arrotonda(x), scala: arrotonda(scala), opacita: arrotonda(opacita), z: t < 0.5 ? 3 : t <= vicini + 0.5 ? 2 : 1 };
    }

    /** Di quanto si è trascinato, in passi (-1..1): il dito ha fatto `dx` pixel e un passo è lungo `passoPx` */
    function frazione(dx, passoPx) {
        if (!(passoPx > 0)) return 0;
        return Math.max(-1, Math.min(1, dx / passoPx));
    }

    /** I pixel di una "unità" (u) del foglio dell'app: serve a sapere quanto è lungo un passo, che il CSS scrive in u. Si misura con un elemento invisibile. */
    function unitaPx(win) {
        const doc = win && win.document;
        if (!doc || !doc.body) return 1;
        const sonda = doc.createElement('div');
        sonda.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:calc(1000 * var(--u, 1px));height:1px';
        doc.body.appendChild(sonda);
        const px = sonda.offsetWidth / 1000;
        sonda.remove();
        return px > 0 ? px : 1;
    }

    /**
     * Cosa vuol dire un gesto: +1 avanti (il dito va a sinistra), -1 indietro (il dito va a destra), 0 niente (troppo corto, o più in verticale che di lato).
     */
    function gesto(dx, dy, soglia = SOGLIA_GESTO, ms = 0) {
        // uno scatto veloce conta anche se corto (un colpo di dito, non un trascinamento lento)
        if (ms > 0 && Math.abs(dx) >= SOGLIA_SCATTO && Math.abs(dx) / ms >= VELOCITA_SCATTO) soglia = Math.min(soglia, SOGLIA_SCATTO);
        if (Math.abs(dx) < soglia) return 0;
        if (Math.abs(dx) < Math.abs(dy) * PREVALENZA) return 0;
        return dx < 0 ? 1 : -1;
    }

    /**
     * Collega i gesti a un elemento: dito o mouse. `avanti` e `indietro` sono chiamati a gesto finito (una volta sola per gesto). `ignora`: selettore degli elementi
     * interni su cui un gesto non vale (cursori, menù a tendina...).
     * Scorrere in verticale resta alla pagina (touch-action: pan-y). Un trascinamento non fa scattare il clic che lo chiude.
     * Restituisce { stacca } per toglierli.
     */
    function collegaGesti(el, { avanti, indietro, soglia = SOGLIA_GESTO, ignora, trascina, passoPx, senzaScorrimento } = {}) {
        let inizio = null, mosso = false, orizzontale = false;
        const passoVero = () => (typeof passoPx === 'function' ? passoPx() : passoPx) || 0;
        const giu = e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (ignora && e.target && e.target.closest && e.target.closest(ignora)) { inizio = null; return; }      // es. i cursori: lì il dito serve a loro
            inizio = { x: e.clientX, y: e.clientY, t: Date.now() };
            mosso = false;
            orizzontale = false;
        };
        const muovi = e => {
            if (!inizio) return;
            const dx = e.clientX - inizio.x, dy = e.clientY - inizio.y;
            if (Math.abs(dx) > SOGLIA_CLIC || Math.abs(dy) > SOGLIA_CLIC) mosso = true;
            // il trascinamento è graduale: appena il dito va chiaramente di lato, gli elementi lo seguono (`trascina(frazione di passo, finito)`)
            if (trascina && (orizzontale || (Math.abs(dx) > SOGLIA_CLIC && Math.abs(dx) >= Math.abs(dy) * PREVALENZA))) {
                if (!orizzontale) { orizzontale = true; try { el.setPointerCapture(e.pointerId); } catch (err) { /* il dito resta dov'è */ } }
                trascina(frazione(dx, passoVero()), false);
            }
        };
        const su = e => {
            if (!inizio) return;
            const dx = e.clientX - inizio.x, dy = e.clientY - inizio.y;
            const inizio0 = inizio;
            inizio = null;
            const g = gesto(dx, dy, soglia, Date.now() - (inizio0 ? inizio0.t : Date.now()));
            // prima si smette di seguire il dito (gli elementi tornano al loro posto con la transizione), poi si cambia: finiscono dove devono, senza salti
            if (orizzontale && trascina) trascina(0, true);
            orizzontale = false;
            if (g > 0 && avanti) avanti();
            else if (g < 0 && indietro) indietro();
        };
        const annulla = () => { inizio = null; if (orizzontale && trascina) trascina(0, true); orizzontale = false; };
        // il clic che chiude un trascinamento non vale (altrimenti scorrere sopra una scheda la aprirebbe)
        const clic = e => { if (mosso) { e.stopPropagation(); e.preventDefault(); mosso = false; } };
        el.addEventListener('pointerdown', giu);
        el.addEventListener('pointermove', muovi);
        el.addEventListener('pointerup', su);
        el.addEventListener('pointercancel', annulla);
        el.addEventListener('click', clic, true);
        if (el.style) el.style.touchAction = senzaScorrimento ? 'none' : 'pan-y';     // dove la pagina non scorre (la Home) il browser non deve mai prendersi il gesto: un dito un po' storto in verticale lo annullava
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

    /**
     * Le spiegazioni dei piccoli elementi (i badge): un tocco la mostra per qualche secondo (o la toglie se c'è già); tenendo premuto resta finché il dito non si alza.
     * `selettore`: quali elementi dentro `radice`; `mostra(el, lungo)` e `nascondi()` disegnano la nota. Se il dito scorre (un gesto di lato) non conta né l'uno né l'altro.
     * `tempi`: { set, clear } (per le prove: di norma i timer del browser). Restituisce { stacca }.
     */
    function collegaPressione(radice, selettore, { mostra, nascondi, ms = 350, durata = 3200, tempi } = {}) {
        const T = tempi || { set: (f, t) => setTimeout(f, t), clear: id => clearTimeout(id) };
        let attivo = null, inizio = null, lungo = false, tenere = null, chiudere = null, aperto = null;
        const trova = e => (e.target && e.target.closest ? e.target.closest(selettore) : null);
        const chiudi = () => { if (chiudere) { T.clear(chiudere); chiudere = null; } if (aperto) { aperto = null; if (nascondi) nascondi(); } };
        const giu = e => {
            const el = trova(e);
            if (!el) return;
            attivo = el; inizio = { x: e.clientX, y: e.clientY }; lungo = false;
            if (tenere) T.clear(tenere);
            tenere = T.set(() => { tenere = null; if (!attivo) return; lungo = true; if (chiudere) { T.clear(chiudere); chiudere = null; } aperto = attivo; if (mostra) mostra(attivo, true); }, ms);
        };
        const muovi = e => {
            if (!attivo || !inizio || lungo) return;
            if (Math.abs(e.clientX - inizio.x) > SOGLIA_CLIC || Math.abs(e.clientY - inizio.y) > SOGLIA_CLIC) { T.clear(tenere); tenere = null; attivo = null; }
        };
        const su = () => {
            const el = attivo;
            if (tenere) { T.clear(tenere); tenere = null; }
            attivo = null;
            if (!el) return;
            if (lungo) { lungo = false; chiudi(); return; }
            // un tocco: la nota compare per qualche secondo; toccando di nuovo lo stesso elemento sparisce
            if (aperto === el) { chiudi(); return; }
            chiudi();
            aperto = el;
            if (mostra) mostra(el, false);
            chiudere = T.set(() => { chiudere = null; chiudi(); }, durata);
        };
        const annulla = () => { if (tenere) { T.clear(tenere); tenere = null; } const eraLungo = lungo; attivo = null; lungo = false; if (eraLungo) chiudi(); };
        const menu = e => { if (trova(e)) e.preventDefault(); };
        radice.addEventListener('pointerdown', giu);
        radice.addEventListener('pointermove', muovi);
        radice.addEventListener('pointerup', su);
        radice.addEventListener('pointercancel', annulla);
        radice.addEventListener('contextmenu', menu);
        return {
            chiudi,
            stacca() {
                radice.removeEventListener('pointerdown', giu);
                radice.removeEventListener('pointermove', muovi);
                radice.removeEventListener('pointerup', su);
                radice.removeEventListener('pointercancel', annulla);
                radice.removeEventListener('contextmenu', menu);
                if (tenere) T.clear(tenere);
                chiudi();
            }
        };
    }

    return { SOGLIA_GESTO, SOGLIA_CLIC, PREVALENZA, dentro, distanza, passo, visibili, seguenti, aspetto, frazione, unitaPx, gesto, collegaGesti, collegaPressione };
});
