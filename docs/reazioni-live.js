// =====================================================
// REAZIONI ALLE PARTITE LIVE — Poké-Tournament
//
// Chi guarda una partita in diretta (battle.html) manda una reazione con un tocco; tutti quelli che sono dentro la partita, giocatori compresi, la vedono salire sul
// campo e i totali crescere. Le reazioni sono un elenco fisso (REAZIONI): al server arriva solo l'ID (functions/reazioni.js ha lo stesso elenco: lo controlla un test).
// Per cambiare il disegno di una reazione (un'immagine al posto dell'emoji) si cambia `glifo` qui: il server non se ne accorge.
//
//   ReazioniLive.REAZIONI                     [{ id, glifo, nome }]
//   ReazioniLive.totali(nodo)                 { fire: 3, ... } da reazioniTotali (numeri sicuri, solo reazioni dell'elenco)
//   ReazioniLive.htmlBarra(opzioni)           i tasti con i totali
//   ReazioniLive.posizione(chiave)            da 8 a 92 (% da sinistra) dove far salire una reazione: sempre la stessa per la stessa chiave
//   ReazioniLive.monta(win, opzioni)          collega tutto: tasti, flusso in tempo reale, totali; restituisce { ferma() }
//
// Dati (scritti solo dal server): partite/<id>/reazioni/<chiave> { e, t }, partite/<id>/reazioniTotali/<e>.
// Funziona nel browser (window.ReazioniLive) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.ReazioniLive = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const REAZIONI = [
        { id: 'fire', glifo: '🔥', nome: 'Hype' },
        { id: 'shock', glifo: '😱', nome: 'No way' },
        { id: 'lol', glifo: '😂', nome: 'LOL' },
        { id: 'gg', glifo: '👏', nome: 'GG' },
        { id: 'skull', glifo: '💀', nome: 'Ouch' },
        { id: 'love', glifo: '❤️', nome: 'Love it' }
    ];
    const INTERVALLO_MS = 900;        // come sul server: una reazione ogni 0,9 secondi
    const MASSIMO_IN_VOLO = 24;       // oltre, le più vecchie spariscono (tante persone insieme non coprono il campo)
    const DURATA_VOLO_MS = 3200;

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const perId = id => REAZIONI.find(r => r.id === id) || null;

    function totali(nodo) {
        const fuori = {};
        for (const r of REAZIONI) {
            const n = Number(nodo && nodo[r.id]);
            fuori[r.id] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        }
        return fuori;
    }

    // la stessa chiave dà sempre lo stesso punto: tutti vedono la reazione nello stesso posto (e si prova senza il caso)
    function posizione(chiave) {
        let h = 7;
        for (const c of String(chiave == null ? '' : chiave)) h = (h * 31 + c.charCodeAt(0)) % 9973;
        return 8 + (h % 85);
    }

    const compatto = n => (n >= 1000 ? `${Math.floor(n / 100) / 10}k` : String(n));

    /** @param {{ conto?: object }} [opzioni]  conto: i totali (totali()) */
    function htmlBarra({ conto = {} } = {}) {
        const t = totali(conto);
        return `<span class="rz-titolo">React to the match</span><span class="rz-tasti">`
            + REAZIONI.map(r => `<button type="button" class="rz-btn" data-rz="${esc(r.id)}" title="${esc(r.nome)}" aria-label="${esc(r.nome)}">`
                + `<span class="rz-glifo" aria-hidden="true">${r.glifo}</span><b class="rz-n" data-rz-n="${esc(r.id)}">${compatto(t[r.id])}</b></button>`).join('')
            + `</span><span class="rz-nota" role="status" aria-live="polite"></span>`;
    }

    /**
     * @param {Window} win
     * @param {object} o
     *   db, funzioni, id   il database, le funzioni (firebase.app().functions(...)) e l'id della partita
     *   puoReagire         true: chi guarda; false: chi gioca (vede le reazioni ma non le manda)
     *   barra, volo        gli elementi: dove stanno i tasti (solo se puoReagire) e dove salgono le reazioni
     */
    function monta(win, { db, funzioni, id, puoReagire = false, barra, volo } = {}) {
        const doc = win && win.document;
        const riferimenti = [];
        let fermo = false;
        let attesa = false;

        // ---- i tasti ----
        if (puoReagire && barra) {
            barra.innerHTML = htmlBarra();
            barra.hidden = false;
            const nota = barra.querySelector('.rz-nota');
            const dillo = testo => { if (nota) nota.textContent = testo || ''; };
            barra.addEventListener('click', async e => {
                const b = e.target && e.target.closest ? e.target.closest('[data-rz]') : null;
                if (!b || attesa || !perId(b.dataset.rz)) return;
                attesa = true;
                barra.classList.add('rz-attesa');
                win.setTimeout(() => { attesa = false; barra.classList.remove('rz-attesa'); }, INTERVALLO_MS);
                b.classList.remove('rz-premuto'); void b.offsetWidth; b.classList.add('rz-premuto');
                dillo('');
                try {
                    await funzioni.httpsCallable('reagisciPartita')({ id, e: b.dataset.rz });
                } catch (errore) {
                    const codice = String((errore && errore.code) || '');
                    if (/resource-exhausted/.test(codice)) dillo('Easy there — one at a time!');
                    else if (/failed-precondition|not-found/.test(codice)) dillo('Reactions are open only while the match is on.');
                    else dillo("Couldn't send it. Try again.");
                }
            });
        }

        // ---- le reazioni che salgono sul campo ----
        const inVolo = [];
        function sali(chiave, r) {
            const def = perId(r && r.e);
            if (!def || !volo || !doc) return;
            const el = doc.createElement('span');
            el.className = 'rz-vola';
            el.textContent = def.glifo;
            el.style.left = `${posizione(chiave)}%`;
            el.style.setProperty('--rz-deriva', `${(posizione(`${chiave}d`) - 50) / 4}px`);
            volo.appendChild(el);
            inVolo.push(el);
            const via = () => { const i = inVolo.indexOf(el); if (i >= 0) inVolo.splice(i, 1); if (el.parentNode) el.parentNode.removeChild(el); };
            win.setTimeout(via, DURATA_VOLO_MS + 200);
            while (inVolo.length > MASSIMO_IN_VOLO) { const vecchio = inVolo.shift(); if (vecchio.parentNode) vecchio.parentNode.removeChild(vecchio); }
        }

        (async () => {
            const base = `partite/${id}`;
            // il flusso: solo le reazioni nuove (quelle già nel database sono di prima che si entrasse)
            const flusso = db.ref(`${base}/reazioni`);
            let ultima = '';
            try {
                const prima = (await flusso.once('value')).val() || {};
                ultima = Object.keys(prima).sort().pop() || '';
            } catch (e) { /* si parte da adesso lo stesso */ }
            if (fermo) return;
            const visti = new Set(ultima ? [ultima] : []);
            const q = ultima ? flusso.orderByKey().startAt(ultima) : flusso;
            q.on('child_added', s => {
                if (fermo || visti.has(s.key)) return;
                visti.add(s.key);
                sali(s.key, s.val());
            });
            riferimenti.push(q);

            const conti = db.ref(`${base}/reazioniTotali`);
            conti.on('value', s => {
                if (fermo || !barra) return;
                const t = totali(s.val());
                for (const r of REAZIONI) {
                    const n = barra.querySelector(`[data-rz-n="${r.id}"]`);
                    if (n && n.textContent !== compatto(t[r.id])) n.textContent = compatto(t[r.id]);
                }
            });
            riferimenti.push(conti);
        })();

        return {
            sali,
            ferma() { fermo = true; riferimenti.forEach(r => { try { r.off(); } catch (e) { /* già staccato */ } }); }
        };
    }

    return { REAZIONI, INTERVALLO_MS, MASSIMO_IN_VOLO, totali, posizione, htmlBarra, monta, perId };
});
