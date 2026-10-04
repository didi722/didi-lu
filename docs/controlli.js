/* =====================================================================
   CONTROLLI DEL SITO — tasti in alto, interruttore del suono, menu a tendina nello stile del tema
   ---------------------------------------------------------------------
   Pagine con <body class="nb"> (e la pagina pubblica). Lo stile è in temi.css e controlli.css: qui solo il comportamento.

   1. #tasti-alto: la campanella, le battaglie e i tasti d'azione della pagina ("Team Builder", "New format"...) stanno
      tutti in una fila sotto il tasto utente. Prima ognuno aveva la sua posizione scritta a mano e si sovrapponevano.
   2. L'interruttore del suono (#music-control) va nella striscia nera della barra in alto, come un comando di finestra.
      La musica la gestiscono le pagine (toggleMusic): qui si cambia solo dove sta e com'è disegnato.
   3. Menu a tendina: il <select> resta quello vero (valore, eventi, tastiera, stile da CSS); cambia solo l'elenco che si
      apre, disegnato dal tema (angoli, ombra, carattere, colori) invece che dal sistema operativo. Sul telefono (si tocca,
      non c'è il mouse) resta l'elenco del sistema, che lì è la scelta migliore.
   Modulo UMD: le parti pure (voci di un select, ricerca per iniziali) si provano anche in Node (test/controlli.test.js).
   ===================================================================== */
(function (root, factory) {
    const M = factory();
    if (typeof module === 'object' && module.exports) module.exports = M;
    else root.ControlliSito = M;
    if (typeof document !== 'undefined' && root.document === document) M.avvia(root);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ---- parti pure ----

    /** Le voci di un <select> (anche con optgroup), come elenco piatto: { indice, testo, gruppo, disabilitata }. */
    function vociDi(select) {
        const out = [];
        Array.from(select.children).forEach(figlio => {
            if (figlio.tagName === 'OPTGROUP') {
                const nome = figlio.label || '';
                Array.from(figlio.children).forEach(o => { if (o.tagName === 'OPTION') out.push(voce(select, o, nome)); });
            } else if (figlio.tagName === 'OPTION') {
                out.push(voce(select, figlio, null));
            }
        });
        return out;
    }
    function voce(select, option, gruppo) {
        return { indice: option.index, testo: option.textContent.replace(/\s+/g, ' ').trim(), gruppo, disabilitata: !!option.disabled || !!(option.parentNode && option.parentNode.disabled) };
    }

    /** Scrivendo lettere si va alla prima voce che inizia così (dopo `da`, poi dall'inizio); -1 se non c'è. */
    function cercaPerIniziali(voci, testo, da) {
        const t = String(testo || '').toLowerCase();
        if (!t) return -1;
        const ok = v => !v.disabilitata && v.testo.toLowerCase().startsWith(t);
        const dopo = voci.findIndex((v, i) => i > da && ok(v));
        return dopo >= 0 ? dopo : voci.findIndex(ok);
    }

    /** Prossima voce abilitata partendo da `da` nella direzione `verso` (+1/-1); se non ce n'è, resta dov'è. */
    function prossima(voci, da, verso) {
        for (let n = da + verso; n >= 0 && n < voci.length; n += verso) if (!voci[n].disabilitata) return n;
        return da;
    }

    // ---- 1. tasti in alto ----
    const SELETTORE_TASTI = '.sfide-btn, .btn-floating-admin, .btn-floating-helper';

    function raggruppaTasti(doc) {
        if (!doc.body) return null;
        let fila = doc.getElementById('tasti-alto');
        if (!fila) {
            fila = doc.createElement('div');
            fila.id = 'tasti-alto';
            fila.className = 'tasti-alto';
            doc.body.appendChild(fila);
        }
        const sposta = () => {
            doc.querySelectorAll(SELETTORE_TASTI).forEach(b => { if (b.parentNode !== fila) fila.appendChild(b); });
        };
        sposta();
        // la campanella e le battaglie le crea sfide.js dopo il login: si mettono in fila appena compaiono
        if (typeof MutationObserver === 'function') new MutationObserver(sposta).observe(doc.body, { childList: true });
        return fila;
    }

    // ---- 2. interruttore del suono ----
    const ICONA_SUONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M11 5L6 9H2v6h4l5 4V5z"></path>' +
        '<path class="onda" d="M15.5 8.5a5 5 0 0 1 0 7"></path><path class="onda" d="M18.5 5.5a9 9 0 0 1 0 13"></path>' +
        '<path class="taglio" d="M16 9l6 6M22 9l-6 6"></path></svg>';

    function montaSuono(doc) {
        const tasto = doc.getElementById('music-control');
        const barra = doc.querySelector('.top-bar');
        if (!tasto || !barra || tasto.dataset.suono === '1') return null;
        tasto.dataset.suono = '1';
        barra.appendChild(tasto);
        tasto.innerHTML = ICONA_SUONO;
        tasto.setAttribute('role', 'button');
        tasto.setAttribute('tabindex', '0');
        tasto.setAttribute('aria-label', 'Sound on or off');
        tasto.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tasto.click(); }
        });
        return tasto;
    }

    // ---- 3. menu a tendina ----
    function montaSelect(root) {
        const doc = root.document;
        if (typeof root.matchMedia === 'function' && !root.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;

        let elenco = null, select = null, voci = [], attiva = -1, scritto = '', timerScritto = null;

        const idoneo = s => s && s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.disabled && !s.hasAttribute('data-nativo');

        function chiudi(riportaFuoco) {
            if (!elenco) return;
            elenco.remove();
            if (select) { select.classList.remove('ts-aperto'); select.removeAttribute('aria-expanded'); if (riportaFuoco) select.focus({ preventScroll: true }); }
            elenco = null; select = null; voci = []; attiva = -1;
            doc.removeEventListener('pointerdown', fuori, true);
            root.removeEventListener('resize', chiudiSubito);
            root.removeEventListener('scroll', alloScroll, true);
        }
        function chiudiSubito() { chiudi(false); }
        function alloScroll(e) { if (elenco && !elenco.contains(e.target)) chiudi(false); }
        function fuori(e) { if (elenco && !elenco.contains(e.target) && e.target !== select) chiudi(false); }

        function evidenzia(i, scorri) {
            if (!elenco) return;
            attiva = i;
            elenco.querySelectorAll('.ts-voce').forEach(v => v.classList.toggle('ts-attiva', Number(v.dataset.i) === i));
            const v = elenco.querySelector('.ts-voce.ts-attiva');
            if (v && scorri) v.scrollIntoView({ block: 'nearest' });
        }

        function scegli(i) {
            if (!select || !voci[i] || voci[i].disabilitata) return;
            const s = select;
            const cambia = s.selectedIndex !== voci[i].indice;
            s.selectedIndex = voci[i].indice;
            chiudi(true);
            if (cambia) {
                s.dispatchEvent(new root.Event('input', { bubbles: true }));
                s.dispatchEvent(new root.Event('change', { bubbles: true }));
            }
        }

        function apri(s) {
            chiudi(false);
            voci = vociDi(s);
            if (!voci.length) return;
            select = s;
            s.classList.add('ts-aperto');
            s.setAttribute('aria-expanded', 'true');
            elenco = doc.createElement('div');
            elenco.className = 'ts-lista';
            elenco.setAttribute('role', 'listbox');
            const scelta = voci.findIndex(v => v.indice === s.selectedIndex);
            let gruppo = null;
            voci.forEach((v, i) => {
                if (v.gruppo && v.gruppo !== gruppo) {
                    gruppo = v.gruppo;
                    const g = doc.createElement('div');
                    g.className = 'ts-gruppo';
                    g.textContent = gruppo;
                    elenco.appendChild(g);
                }
                const d = doc.createElement('div');
                d.className = 'ts-voce' + (i === scelta ? ' ts-scelta' : '') + (v.disabilitata ? ' ts-spenta' : '');
                d.setAttribute('role', 'option');
                d.setAttribute('aria-selected', i === scelta ? 'true' : 'false');
                d.dataset.i = String(i);
                d.textContent = v.testo || ' ';
                elenco.appendChild(d);
            });
            doc.body.appendChild(elenco);
            // posizione: sotto il campo, o sopra se sotto non c'è posto
            const r = s.getBoundingClientRect();
            const altezzaFinestra = root.innerHeight || doc.documentElement.clientHeight;
            elenco.style.minWidth = Math.round(r.width) + 'px';
            elenco.style.maxWidth = Math.max(Math.round(r.width), 420) + 'px';
            const h = Math.min(elenco.scrollHeight, 320);
            const sotto = altezzaFinestra - r.bottom - 12, sopra = r.top - 12;
            const inAlto = h > sotto && sopra > sotto;
            elenco.style.maxHeight = Math.max(120, Math.min(320, inAlto ? sopra : sotto)) + 'px';
            const larghezzaFinestra = root.innerWidth || doc.documentElement.clientWidth;
            elenco.style.left = Math.max(8, Math.min(r.left, larghezzaFinestra - elenco.offsetWidth - 8)) + 'px';
            elenco.style.top = inAlto ? Math.max(8, r.top - elenco.offsetHeight - 6) + 'px' : (r.bottom + 6) + 'px';
            evidenzia(scelta >= 0 ? scelta : 0, true);

            elenco.addEventListener('mousedown', e => e.preventDefault());   // il campo non perde il fuoco
            elenco.addEventListener('click', e => {
                const v = e.target.closest && e.target.closest('.ts-voce');
                if (v) scegli(Number(v.dataset.i));
            });
            elenco.addEventListener('mousemove', e => {
                const v = e.target.closest && e.target.closest('.ts-voce');
                if (v && Number(v.dataset.i) !== attiva && !v.classList.contains('ts-spenta')) evidenzia(Number(v.dataset.i), false);
            });
            doc.addEventListener('pointerdown', fuori, true);
            root.addEventListener('resize', chiudiSubito);
            root.addEventListener('scroll', alloScroll, true);
        }

        // il clic sul campo apre il nostro elenco al posto di quello del sistema
        doc.addEventListener('mousedown', e => {
            const s = e.target.closest && e.target.closest('select');
            if (!idoneo(s) || e.button !== 0) return;
            e.preventDefault();
            s.focus({ preventScroll: true });
            if (elenco && select === s) chiudi(false); else apri(s);
        }, true);
        doc.addEventListener('click', e => {
            const s = e.target.closest && e.target.closest('select');
            if (idoneo(s)) e.preventDefault();
        }, true);

        doc.addEventListener('keydown', e => {
            if (elenco) {
                // l'elenco è aperto: la tastiera lo governa
                const verso = { ArrowDown: 1, ArrowUp: -1 }[e.key];
                if (verso) { e.preventDefault(); evidenzia(prossima(voci, attiva, verso), true); return; }
                if (e.key === 'Home') { e.preventDefault(); evidenzia(prossima(voci, -1, 1), true); return; }
                if (e.key === 'End') { e.preventDefault(); evidenzia(prossima(voci, voci.length, -1), true); return; }
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegli(attiva); return; }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(true); return; }
                if (e.key === 'Tab') { chiudi(false); return; }
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    scritto += e.key;
                    root.clearTimeout(timerScritto);
                    timerScritto = root.setTimeout(() => { scritto = ''; }, 700);
                    const i = cercaPerIniziali(voci, scritto, scritto.length > 1 ? attiva - 1 : attiva);
                    if (i >= 0) { evidenzia(i, true); e.preventDefault(); }
                }
                return;
            }
            const s = doc.activeElement;
            if (!idoneo(s) || s.tagName !== 'SELECT') return;
            if (e.key === 'Enter' || e.key === ' ' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
                e.preventDefault();
                apri(s);
            }
        }, true);
        return true;
    }

    function avvia(root) {
        const doc = root.document;
        const parti = () => {
            raggruppaTasti(doc);
            montaSuono(doc);
            montaSelect(root);
        };
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', parti);
        else parti();
    }

    return { vociDi, cercaPerIniziali, prossima, raggruppaTasti, montaSuono, montaSelect, avvia };
});
