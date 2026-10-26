// =====================================================
// APP — Stats: un elemento alla volta
// ---------------------------------------------------------------------
// Nell'app le statistiche non sono una griglia di card: si sceglie cosa guardare (allenatori, team, Pokémon, uso), la stagione e il formato, e il numero con cui
// ordinare (Elo, punti, KO, percentuale di vittorie...); poi si vede un allenatore, un team o un Pokémon alla volta, a partire dal primo di quella classifica,
// con il numero scelto in grande e sotto gli altri. Ai lati si intravedono il precedente e il successivo: si scorre di lato (o con le frecce).
// I numeri sono quelli della pagina (stats.js: stesso calcolo, stesso ordine): la pagina li pubblica (AppSito.pubblica('stats', modello)) a ogni cambiamento, e i
// controlli di qui (categoria, stagione, formato, ordinamento) fanno scattare quelli della pagina, che li ricalcola e li pubblica di nuovo.
// La parte pura (l'HTML a partire dal modello) è provata in test/app-stats.test.js; funziona nel browser (window.AppStats) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const S = fabbrica(inNode ? require('./app-carosello.js') : radice.AppCarosello);
    if (inNode) module.exports = S;
    else {
        radice.AppStats = S;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => S.avvia(radice)); else S.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (Car) {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#b388eb');
    const FRECCIA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

    /** Le colonne delle tessere a lato della carta: due fino a sei, altrimenti tre (al massimo tre righe: la carta è bassa) */
    const colonne = n => (n <= 6 ? 2 : 3);

    /** Cosa distingue una vista dall'altra: cambiando una di queste cose si riparte dal primo */
    const firma = m => [m.tab, m.stagione, m.formato, m.ordine && m.ordine.id, m.ordine && m.ordine.dir].join('|');

    /** La carta di un elemento: il numero scelto in grande, gli altri sotto */
    function htmlCarta(r, m, indice) {
        const grande = (r.valori || {})[m.grande] || { titolo: '', html: '', sotto: '' };
        const tessere = (m.tessere || []).filter(id => r.valori && r.valori[id]);
        return `<article class="as-carta" data-i="${indice}" style="--c:${coloreSicuro(r.colore)};--cols:${colonne(tessere.length)}">
            <div class="as-alto">
                <span class="as-pos">#${Number(r.posizione) || indice + 1}</span>
                <div class="as-visual as-v-${esc(m.tab)}">${r.testa || ''}</div>
                <div class="as-titoli">
                    <b class="as-nome">${esc(r.nome)}</b>
                    ${r.sotto ? `<small class="as-sotto">${esc(r.sotto)}</small>` : ''}
                    <div class="as-grande"><span class="as-et">${esc(grande.titolo)}</span><span class="as-val">${grande.html}</span>${grande.sotto || ''}</div>
                </div>
            </div>
            <div class="as-dati">${tessere.map(id => `<div class="as-dato"><span class="as-det">${esc(r.valori[id].titolo)}</span><span class="as-dva">${r.valori[id].html}</span>${r.valori[id].sotto || ''}</div>`).join('')}</div>
        </article>`;
    }

    /** I controlli in alto: la categoria, la stagione e il formato */
    function htmlBarra(m) {
        const opz = (lista, scelto) => (lista || []).map(o => `<option value="${esc(o.valore)}"${String(o.valore) === String(scelto) ? ' selected' : ''}>${esc(o.testo)}</option>`).join('');
        return `<div class="as-tab" role="tablist" aria-label="Statistics category">${(m.tabs || []).map(t =>
            `<button type="button" role="tab" class="as-t${t.id === m.tab ? ' attivo' : ''}" aria-selected="${t.id === m.tab}" data-tab="${esc(t.id)}" data-suono="scegli">${esc(t.titolo)}</button>`).join('')}</div>
            <div class="as-filtri"><select class="as-sel" id="as-stagione" aria-label="Season">${opz(m.stagioni, m.stagione)}</select>
            <select class="as-sel" id="as-formato" aria-label="Format">${opz(m.formati, m.formato)}</select></div>`;
    }

    /** Le chip dei numeri con cui ordinare; quella attiva porta il verso (▼ dal più alto, ▲ dal più basso) */
    function htmlParametri(m) {
        return (m.parametri || []).map(p => {
            const attivo = m.ordine && p.id === m.ordine.id;
            return `<button type="button" class="as-p${attivo ? ' attivo' : ''}" data-ordina="${esc(p.id)}" aria-pressed="${!!attivo}"${p.tip ? ` title="${esc(p.tip)}"` : ''} data-suono="scegli">${esc(p.titolo)}${attivo ? `<i aria-hidden="true">${m.ordine.dir < 0 ? '▼' : '▲'}</i>` : ''}</button>`;
        }).join('');
    }

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        const ponte = win.AppSito;
        let stato = null;     // { m, corrente, pista, conta, firma }

        const posiziona = () => {
            if (!stato) return;
            const n = stato.m.righe.length;
            stato.pista.querySelectorAll('.as-carta').forEach(el => {
                const i = Number(el.dataset.i);
                const d = Car.distanza(i, stato.corrente, n, true);
                const a = Car.aspetto(d);
                el.style.setProperty('--x', a.x);
                el.style.setProperty('--s', a.scala);
                el.style.setProperty('--o', a.opacita);
                el.style.zIndex = a.z;
                el.classList.toggle('as-centro', i === stato.corrente);
                el.classList.toggle('as-vicino', Math.abs(d) === 1);
                el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
            });
            if (stato.conta) stato.conta.textContent = (stato.corrente + 1) + ' / ' + n + (stato.m.totale > n ? '+' : '');
        };
        const vai = i => { if (!stato || !stato.m.righe.length) return; const n = Car.dentro(i, stato.m.righe.length); if (n !== stato.corrente) { stato.corrente = n; posiziona(); } };
        const passo = verso => { if (stato) vai(Car.passo(stato.corrente, stato.m.righe.length, verso, true)); };

        // i controlli della pagina (nascosti) che la schermata dell'app fa scattare
        const scatta = {
            tab: id => { const b = doc.querySelector('.stats-tag .tag[data-tab="' + id + '"]'); if (b) b.click(); },
            ordina: id => { const b = doc.querySelector('#stats-ordina [data-ordina="' + id + '"]'); if (b) b.click(); },
            seleziona: (idSel, valore) => { const s = doc.getElementById(idSel); if (!s) return; s.value = valore; s.dispatchEvent(new win.Event('change', { bubbles: true })); }
        };

        const monta = m => {
            if (!m) return;
            let radice = doc.getElementById('app-stats');
            if (!radice) {
                radice = doc.createElement('div');
                radice.id = 'app-stats';
                radice.className = 'as';
                doc.body.appendChild(radice);
                radice.addEventListener('click', e => {
                    const t = e.target.closest ? e.target.closest('[data-tab]') : null;
                    if (t) return scatta.tab(t.dataset.tab);
                    const p = e.target.closest ? e.target.closest('[data-ordina]') : null;
                    if (p) return scatta.ordina(p.dataset.ordina);
                    const pa = e.target.closest ? e.target.closest('[data-passo]') : null;
                    if (pa) return passo(Number(pa.dataset.passo));
                    const c = e.target.closest ? e.target.closest('.as-vicino') : null;
                    if (c) vai(Number(c.dataset.i));
                });
                radice.addEventListener('change', e => {
                    if (e.target.id === 'as-stagione') scatta.seleziona('sel-stagione', e.target.value);
                    else if (e.target.id === 'as-formato') scatta.seleziona('sel-formato', e.target.value);
                });
                Car.collegaGesti(radice, { avanti: () => passo(1), indietro: () => passo(-1) });
                doc.addEventListener('keydown', e => { if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; if (e.key === 'ArrowRight') passo(1); else if (e.key === 'ArrowLeft') passo(-1); });
            }
            doc.documentElement.classList.add('app-stats');
            const f = firma(m);
            const corrente = stato && stato.firma === f ? Car.dentro(stato.corrente, m.righe.length || 1) : 0;
            const n = m.righe.length;
            radice.innerHTML = `<div class="as-barra">${htmlBarra(m)}</div>
                <div class="as-param" role="group" aria-label="Sort by">${htmlParametri(m)}</div>
                ${n ? `<div class="as-pista">${m.righe.map((r, i) => htmlCarta(r, m, i)).join('')}</div>
                <div class="as-pie"><button type="button" class="as-freccia" data-passo="-1" aria-label="Previous" data-suono="scegli">${FRECCIA}</button>
                    <span class="as-conta" aria-live="polite"></span>
                    <button type="button" class="as-freccia as-succ" data-passo="1" aria-label="Next" data-suono="scegli">${FRECCIA}</button></div>`
        : `<div class="as-vuoto">${m.vuoto || 'Nothing to show here yet.'}</div>`}`;
            stato = { m, corrente, firma: f, pista: radice.querySelector('.as-pista'), conta: radice.querySelector('.as-conta') };
            // la chip attiva resta in vista (l'elenco dei numeri scorre di lato)
            const attiva = radice.querySelector('.as-p.attivo');
            if (attiva && attiva.scrollIntoView) { try { attiva.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* senza: resta dov'è */ } }
            if (n) posiziona();
        };

        doc.addEventListener('app-dati', e => { if (e && e.detail === 'stats' && ponte) monta(ponte.datiPagina('stats')); });
        const gia = ponte && ponte.datiPagina ? ponte.datiPagina('stats') : null;
        if (gia) monta(gia);
        return { monta, vai, passo };
    }

    return { colonne, firma, htmlCarta, htmlBarra, htmlParametri, avvia };
});
