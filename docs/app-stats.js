// =====================================================
// APP — Stats: un elemento alla volta
// ---------------------------------------------------------------------
// Nell'app le statistiche non sono una griglia di card: si sceglie cosa guardare (allenatori, team, Pokémon, uso), la stagione e il formato, e il numero con cui
// ordinare (Elo, punti, KO, percentuale di vittorie...); poi si vede un allenatore, un team o un Pokémon alla volta, a partire dal primo di quella classifica,
// con SOLO il numero scelto, in grande (niente tessere con gli altri). Niente sfondi e niente frecce: lui sul palco tondo, come in Trainers; ai lati si
// intravedono il precedente e il successivo e si scorre di lato col dito.
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

    /** Cosa distingue una vista dall'altra: cambiando una di queste cose si riparte dal primo */
    const firma = m => [m.tab, m.stagione, m.formato, m.ordine && m.ordine.id, m.ordine && m.ordine.dir].join('|');

    /** La carta di un elemento: niente sfondo. Sul palco tondo lui (l'allenatore, i Pokémon del team o il Pokémon); di fianco il nome, il posto e SOLO il numero scelto */
    function htmlCarta(r, m, indice) {
        const grande = (r.valori || {})[m.grande] || { titolo: '', html: '', sotto: '' };
        return `<article class="as-carta" data-i="${indice}" style="--c:${coloreSicuro(r.colore)}">
            <div class="as-palco as-v-${esc(m.tab)}"><span class="pal-aura" aria-hidden="true"></span><span class="pal-pedana" aria-hidden="true"></span><div class="as-testa">${r.testa || ''}</div></div>
            <div class="as-info">
                <div class="as-riga"><span class="as-pos">#${Number(r.posizione) || indice + 1}</span><b class="as-nome nome-scorrevole">${esc(r.nome)}</b></div>
                ${r.sotto ? `<small class="as-sotto">${esc(r.sotto)}</small>` : ''}
                <div class="as-grande"><span class="as-et">${esc(grande.titolo)}</span><span class="as-val">${grande.html}</span>${grande.sotto || ''}</div>
            </div>
        </article>`;
    }

    /** Nei team si vede un Pokémon alla volta: dopo l'ultimo si riparte dal primo */
    const prossimoMini = (k, n) => (n > 0 ? (Number(k) + 1) % n : 0);
    const PASSO_TEAM = 1500;      // quanto resta a schermo un Pokémon del team prima che scorra il successivo (ms)
    const DURATA_SCORRE = 450;    // quanto dura lo scorrimento (ms)

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
        let stato = null;     // { m, corrente, pista, firma }

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
                el.classList.toggle('as-prima', d < 0);
                el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
            });
        };
        // i team: i sei Pokémon scorrono di lato, uno dopo l'altro (l'ultimo lascia posto al primo, che è anche in coda come copia); i team ai lati restano sul primo
        let giroTeam = null, ritorno = null, mostrato = 0;
        const fermaGiro = () => { if (giroTeam) { win.clearInterval(giroTeam); giroTeam = null; } if (ritorno) { win.clearTimeout(ritorno); ritorno = null; } };
        const vaiA = (fila, k, conTransizione) => {
            fila.style.transition = conTransizione ? '' : 'none';
            fila.style.setProperty('--k', String(k));
            if (!conTransizione) { void fila.offsetWidth; fila.style.transition = ''; }
        };
        const avviaGiroTeam = () => {
            fermaGiro();
            if (!stato || stato.m.tab !== 'teams') return;
            stato.pista.querySelectorAll('.as-fila').forEach(f => vaiA(f, 0, false));
            mostrato = 0;
            const centro = stato.pista.querySelector('.as-carta.as-centro .as-fila');
            const n = centro ? centro.querySelectorAll('.as-slot:not(.as-copia)').length : 0;
            if (n < 2) return;
            giroTeam = win.setInterval(() => {
                mostrato = mostrato + 1;
                vaiA(centro, mostrato, true);
                if (mostrato >= n) ritorno = win.setTimeout(() => { mostrato = prossimoMini(mostrato, n + 1); vaiA(centro, mostrato, false); }, DURATA_SCORRE + 30);
            }, PASSO_TEAM);
        };
        // Pokémon in scala (e a terra o fluttuanti): quelli della carta al centro e delle vicine, appena servono
        const scala = () => {
            const S = win.ScalaPkm;
            if (!stato || !S) return;
            const n = stato.m.righe.length;
            stato.pista.querySelectorAll('.as-carta').forEach(el => {
                if (Math.abs(Car.distanza(Number(el.dataset.i), stato.corrente, n, true)) > 2) return;
                const palco = el.querySelector('.as-testa');
                const H = palco ? palco.clientHeight : 0;
                el.querySelectorAll('img[data-pkm]:not([data-sc])').forEach(img => { if (H > 0) S.dimensiona(img, H); });
            });
        };
        const vai = i => { if (!stato || !stato.m.righe.length) return; const n = Car.dentro(i, stato.m.righe.length); if (n !== stato.corrente) { stato.corrente = n; posiziona(); avviaGiroTeam(); scala(); } };
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
                ${n ? `<div class="as-pista">${m.righe.map((r, i) => htmlCarta(r, m, i)).join('')}</div>`
        : `<div class="as-vuoto">${m.vuoto || 'Nothing to show here yet.'}</div>`}`;
            stato = { m, corrente, firma: f, pista: radice.querySelector('.as-pista') };
            // la chip attiva resta in vista (l'elenco dei numeri scorre di lato)
            const attiva = radice.querySelector('.as-p.attivo');
            if (attiva && attiva.scrollIntoView) { try { attiva.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* senza: resta dov'è */ } }
            // nei team i Pokémon stanno in una fila che scorre: ognuno nel suo posto, più una copia del primo in fondo per il giro
            radice.querySelectorAll('.as-v-teams .as-testa').forEach(t => {
                const minis = [...t.querySelectorAll('.as-mini')];
                if (!minis.length) return;
                const fila = doc.createElement('div');
                fila.className = 'as-fila';
                minis.forEach(m => { const slot = doc.createElement('div'); slot.className = 'as-slot'; slot.appendChild(m); fila.appendChild(slot); });
                const copia = doc.createElement('div');
                copia.className = 'as-slot as-copia';
                copia.setAttribute('aria-hidden', 'true');
                copia.appendChild(minis[0].cloneNode(true));
                fila.appendChild(copia);
                t.replaceChildren(fila);
            });
            if (n) posiziona();
            scala();
            avviaGiroTeam();
            // i nomi troppo lunghi per il loro riquadro scorrono (nome-scorrevole.js, se c'è)
            if (win.NomeScorrevole && n) win.requestAnimationFrame(() => win.NomeScorrevole.applicaTutti('.as-nome'));
        };

        doc.addEventListener('app-dati', e => { if (e && e.detail === 'stats' && ponte) monta(ponte.datiPagina('stats')); });
        const gia = ponte && ponte.datiPagina ? ponte.datiPagina('stats') : null;
        if (gia) monta(gia);
        return { monta, vai, passo };
    }

    return { firma, htmlCarta, htmlBarra, htmlParametri, prossimoMini, PASSO_TEAM, avvia };
});
