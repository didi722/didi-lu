/* =====================================================================
   SCHEDE DI DETTAGLIO (squadra e Pokémon): ritocchi che il CSS da solo non può fare
   ---------------------------------------------------------------------
   Le pagine scrivono la scheda con il loro codice e i tipi dei Pokémon arrivano dopo (da PokéAPI). Questo script resta
   in ascolto sulle due finestre (#teamModal, #pkmDetailModal) e, ogni volta che il contenuto cambia:
     - dà a ogni card il colore del suo primo tipo (variabile --tipo, usata dal medaglione dello sprite);
     - colora vittorie e sconfitte del riepilogo e aggiunge la barra della percentuale di vittorie;
     - dà a ogni barra delle statistiche base il suo valore (--v, per il colore) e aggiunge il totale nella scheda del Pokémon.
   Non cambia i testi né i gestori delle pagine, solo classi, una variabile CSS e un elemento in più: se lo script non
   parte la scheda è comunque completa. Le parti pure (colori, lettura del record) sono provate in test/dettagli.test.js.
   ===================================================================== */
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else {
        radice.Dettagli = fabbrica();
        if (radice.document) radice.Dettagli.avvia(radice);
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Gli stessi colori dei tipi usati ovunque nel sito (badge, titoli, mosse)
    const COLORI_TIPO = {
        normal: '#aaaa99', fire: '#ff4422', water: '#3399ff', electric: '#ffcc33', grass: '#77cc55', ice: '#66ccff',
        fighting: '#bb5544', poison: '#aa5599', ground: '#ddbb55', flying: '#8899ff', psychic: '#ff5599', bug: '#aabb22',
        rock: '#bbaa66', ghost: '#6666bb', dragon: '#7766ee', dark: '#775544', steel: '#aaaabb', fairy: '#ee99ee'
    };

    const coloreTipo = nome => COLORI_TIPO[String(nome == null ? '' : nome).toLowerCase().trim()] || null;

    // "9 - 3" → { v: 9, p: 3, tot: 12, percentuale: 75 }; null se non si legge
    function leggiRecord(testo) {
        const m = /(\d+)\s*[-–]\s*(\d+)/.exec(String(testo == null ? '' : testo));
        if (!m) return null;
        const v = Number(m[1]), p = Number(m[2]), tot = v + p;
        return { v, p, tot, percentuale: tot > 0 ? Math.round((v / tot) * 100) : null };
    }

    const htmlRecord = r => `<span class="td-v">${r.v}</span><span class="td-sep">-</span><span class="td-p">${r.p}</span>`;

    const htmlBarra = r => `<div class="td-winrate"><span class="td-winrate-etichetta">${r.percentuale}% wins</span>` +
        `<div class="td-winrate-barra" role="img" aria-label="${r.percentuale}% of matches won"><span style="width:${r.percentuale}%"></span></div></div>`;

    // Il valore di una riga di statistica base: il numero nel suo secondo elemento (es. "HP  60  [barra]")
    function valoreRiga(riga) {
        const celle = riga.querySelectorAll(':scope > span');
        for (const c of celle) {
            const m = /^\s*(\d{1,3})\s*$/.exec(c.textContent || '');
            if (m) return Number(m[1]);
        }
        return null;
    }
    const sommaStat = valori => valori.reduce((a, b) => a + b, 0);
    const htmlTotale = valori => `<div class="stat-total"><span>Total</span><b>${sommaStat(valori)}</b></div>`;

    // Il primo tipo di una card: il primo .type-badge che ha una classe di tipo
    function primoTipoDi(contenitore) {
        const badges = contenitore.querySelectorAll('.type-badge');
        for (const b of badges) {
            for (const c of b.classList) if (COLORI_TIPO[c]) return c;
        }
        return null;
    }

    function ritocca(finestra) {
        // 1. colore del tipo sulle card della squadra e sulla scheda del Pokémon
        for (const card of finestra.querySelectorAll('.modal-pkm-card, .pkm-modal-grid')) {
            if (card.dataset.tipoApplicato) continue;
            const tipo = primoTipoDi(card);
            if (!tipo) continue;
            card.style.setProperty('--tipo', COLORI_TIPO[tipo]);
            card.dataset.tipoApplicato = tipo;
        }
        // 2. statistiche base: ogni riga porta il suo valore (--v, colora la barra) e la scheda del Pokémon il totale
        for (const riga of finestra.querySelectorAll('.stat-row')) {
            if (riga.dataset.valoreApplicato) continue;
            const v = valoreRiga(riga);
            if (v == null) continue;
            riga.style.setProperty('--v', String(v));
            riga.dataset.valoreApplicato = '1';
        }
        const stat = finestra.querySelector('#single-stats');
        if (stat && !stat.querySelector('.stat-total')) {
            const righe = [...stat.querySelectorAll('.stat-row')].map(valoreRiga).filter(v => v != null);
            if (righe.length >= 6) stat.insertAdjacentHTML('beforeend', htmlTotale(righe));
        }
        // 3. riepilogo: vittorie/sconfitte colorate e barra della percentuale
        for (const testa of finestra.querySelectorAll('.modal-header-container')) {
            if (testa.dataset.riepilogoFatto) continue;
            const banner = testa.querySelector('.team-score-banner');
            if (!banner) continue;
            let record = null;
            for (const voce of banner.querySelectorAll('.score-item')) {
                const etichetta = (voce.querySelector('span') || {}).textContent || '';
                const valore = voce.querySelector('strong');
                if (!valore || !/^\s*(W\/L|sets?(\s*w\/l)?)\s*$/i.test(etichetta)) continue;
                const r = leggiRecord(valore.textContent);
                if (!r) continue;
                valore.innerHTML = htmlRecord(r);
                if (/^\s*w\/l\s*$/i.test(etichetta)) record = r;
            }
            testa.dataset.riepilogoFatto = '1';
            if (record && record.percentuale != null) testa.insertAdjacentHTML('beforeend', htmlBarra(record));
        }
    }

    function avvia(win) {
        const doc = win.document;
        if (!doc || typeof win.MutationObserver !== 'function') return null;
        let programmato = false;
        const esegui = () => {
            programmato = false;
            for (const id of ['teamModal', 'pkmDetailModal']) {
                const f = doc.getElementById(id);
                if (f) ritocca(f);
            }
        };
        const pianifica = () => {
            if (programmato) return;
            programmato = true;
            (win.requestAnimationFrame || (f => win.setTimeout(f, 16)))(esegui);
        };
        const osserva = () => {
            const obs = new win.MutationObserver(pianifica);
            let n = 0;
            for (const id of ['teamModal', 'pkmDetailModal']) {
                const f = doc.getElementById(id);
                if (f) { obs.observe(f, { childList: true, subtree: true }); n++; }
            }
            if (n) pianifica();
        };
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', osserva);
        else osserva();
        return { esegui };
    }

    return { coloreTipo, leggiRecord, htmlRecord, htmlBarra, htmlTotale, sommaStat, ritocca, avvia, COLORI_TIPO };
});
