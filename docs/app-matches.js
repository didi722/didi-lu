// =====================================================
// APP — Matches: i showdown come locandine "VS" e le due schermate (SHOWDOWNS | RANKINGS)
// ---------------------------------------------------------------------
// Nell'app la pagina Matches non è più un elenco: in alto due tag, SHOWDOWNS e RANKINGS, e si vede una schermata alla volta. Nei SHOWDOWNS ogni partita è una
// locandina da videogioco di lotta: i due allenatori in piedi sul loro palco tondo, ognuno nel suo colore, in mezzo il punteggio grosso e il VS, in alto il formato,
// in basso la data. Chi ha vinto brilla e porta il WIN, chi ha perso si spegne un po'. Si scorre di lato seguendo il dito (le vicine si avvicinano mentre si trascina);
// toccando quella al centro si apre la finestra del showdown (i tre match, i team con i loro Pokémon, il replay), toccando una vicina ci viene in mezzo.
// I RANKINGS sono il carosello di app-classifica.js. Le partite in diretta (la fila LIVE) stanno nella stessa riga dei tag.
// I dati li passa matches.html (renderizza i showdown → AppSito.pubblica('showdowns', { stagione, lista })); questo file li disegna e basta.
// La parte pura (l'HTML a partire dai dati) è provata in test/app-matches.test.js; funziona nel browser (window.AppMatches) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const M = fabbrica(inNode ? require('./app-carosello.js') : radice.AppCarosello);
    if (inNode) module.exports = M;
    else {
        radice.AppMatches = M;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => M.avvia(radice)); else M.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (Car) {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = (c, vuoto) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : vuoto);
    const numero = n => Number(n) || 0;
    const AVATAR_VUOTO = 'immagini/magikarp.png';
    const CHIAVE_TAB = 'matchesTab';                 // sessionStorage: la schermata guardata, per ritrovarla tornando indietro
    const TABS = [{ id: 'sd', et: 'Showdowns' }, { id: 'rk', et: 'Rankings' }];

    // ---------- parti pure ----------

    /** Un lato della locandina: l'allenatore sul palco tondo, col nome sotto; `vince` lo fa brillare con il WIN, `perde` lo spegne un po' */
    function htmlLato(n, lato, vince, perde) {
        const l = lato || {};
        return `<span class="mp-lato mp-l${n}${vince ? ' mp-vince' : ''}${perde ? ' mp-perde' : ''}" style="--c:${coloreSicuro(l.colore, n === 1 ? '#31c489' : '#8e44ad')}">
            <span class="mp-palco" aria-hidden="true"><span class="pal-aura"></span><span class="pal-pedana"></span><img class="mp-avatar" draggable="false" src="${esc(l.avatar || AVATAR_VUOTO)}" alt="" onerror="this.onerror=null;this.src='${AVATAR_VUOTO}'"></span>
            <b class="mp-nome nome-scorrevole">${esc(l.nome || 'TBD')}</b>${vince ? '<i class="mp-win">WIN</i>' : ''}
        </span>`;
    }

    /** Una locandina: formato in alto, i due allenatori ai lati, in mezzo VS e punteggio, in fondo la data. */
    function htmlPoster(s, indice) {
        const p1 = numero(s.p1 && s.p1.vinti), p2 = numero(s.p2 && s.p2.vinti);
        const vince = s.vince === 1 || s.vince === 2 ? s.vince : 0;
        const partite = numero(s.partite);
        return `<article class="mp-carta" data-i="${indice}" data-id="${esc(s.id)}" tabindex="-1">
            <b class="mp-formato"><span>${esc(s.formato || 'OU')}</span></b>
            <span class="mp-scena">
                ${htmlLato(1, s.p1, vince === 1, vince === 2)}
                <span class="mp-centro"><i class="mp-vs">VS</i><span class="mp-punti"><b class="${vince === 1 ? 'mp-avanti' : ''}">${p1}</b><u>:</u><b class="${vince === 2 ? 'mp-avanti' : ''}">${p2}</b></span></span>
                ${htmlLato(2, s.p2, vince === 2, vince === 1)}
            </span>
            <small class="mp-data">${esc(s.data || 'No date')}${partite ? ` · ${partite} ${partite === 1 ? 'match' : 'matches'}` : ''}</small>
        </article>`;
    }

    /** Tutte le locandine, in una pista (se ne vede una al centro, le altre ai lati); senza showdown lo dice */
    function html(lista) {
        const l = Array.isArray(lista) ? lista.filter(Boolean) : [];
        if (!l.length) return '<p class="mp-vuoto">No showdowns yet.<br>Challenge a friend and make some history!</p>';
        return `<div class="mp-pista">${l.map((s, i) => htmlPoster(s, i)).join('')}</div>`;
    }

    /** I due tag in alto; `su` è quello guardato, `quanti` il numero di showdown (sul primo) */
    function htmlTabs(su, quanti) {
        return TABS.map(t => `<button type="button" class="mt-tab${t.id === su ? ' su' : ''}" role="tab" aria-selected="${t.id === su}" data-tab="${t.id}" data-suono="scegli"><span>${t.et}${t.id === 'sd' && quanti ? ` <i>${quanti}</i>` : ''}</span></button>`).join('');
    }

    /** Gli avatar degli allenatori che compaiono nei showdown, per nome (senza badare alle maiuscole): serve alla testata della finestra del showdown */
    function avatarPerNome(lista) {
        const fuori = {};
        for (const s of Array.isArray(lista) ? lista : []) {
            for (const l of [s && s.p1, s && s.p2]) {
                const k = String(l && l.nome || '').toLowerCase().trim();
                if (k && l.avatar && !fuori[k]) fuori[k] = l.avatar;
            }
        }
        return fuori;
    }

    /** L'avatar da mettere in testa al nome (già HTML), o '' se non lo conosciamo */
    function htmlAvatarTesta(avatar) {
        return avatar ? `<img class="mp-testa-avatar" draggable="false" src="${esc(avatar)}" alt="" onerror="this.remove()">` : '';
    }

    /** La schermata da mostrare: quella ricordata se è una delle due, altrimenti i showdown */
    const tabValido = t => (TABS.some(x => x.id === t) ? t : 'sd');

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        const contenitore = doc.querySelector('.hub-container');
        const colonnaSx = doc.querySelector('.hub-left-column');
        if (!contenitore || !colonnaSx) return null;
        const ponte = win.AppSito;
        const html_ = doc.documentElement;
        let stato = { lista: [], corrente: 0, scheda: null, pista: null };
        let tab = 'sd';
        try { tab = tabValido(win.sessionStorage.getItem(CHIAVE_TAB)); } catch (e) { /* si parte dai showdown */ }

        // ----- i due tag in alto (con, a destra, la fila delle partite in diretta) -----
        const barra = doc.createElement('div');
        barra.id = 'mt-barra';
        barra.className = 'mt-barra';
        barra.setAttribute('role', 'tablist');
        contenitore.insertBefore(barra, contenitore.firstChild);
        const live = doc.getElementById('liveList');
        const disegnaTabs = () => {
            barra.querySelectorAll('.mt-tab').forEach(b => b.remove());
            barra.insertAdjacentHTML('afterbegin', htmlTabs(tab, stato.lista.length));
        };
        if (live) barra.appendChild(live);
        const mostra = nuovo => {
            tab = tabValido(nuovo);
            html_.setAttribute('data-mt', tab);
            try { win.sessionStorage.setItem(CHIAVE_TAB, tab); } catch (e) { /* non si ricorda */ }
            disegnaTabs();
        };
        barra.addEventListener('click', e => {
            const b = e.target.closest ? e.target.closest('.mt-tab') : null;
            if (b && b.dataset.tab !== tab) mostra(b.dataset.tab);
        });
        mostra(tab);

        // ----- le locandine -----
        const posiziona = (frac = 0) => {
            if (!stato.pista) return;
            const n = stato.lista.length;
            stato.pista.querySelectorAll('.mp-carta').forEach(el => {
                const i = Number(el.dataset.i);
                const d = Car.distanza(i, stato.corrente, n, false);
                const a = Car.aspetto(d + frac);
                el.style.setProperty('--x', a.x);
                el.style.setProperty('--s', a.scala);
                el.style.setProperty('--o', a.opacita);
                el.style.zIndex = a.z;
                el.classList.toggle('mp-centro-carta', i === stato.corrente);
                el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
            });
        };
        const vai = i => {
            if (!stato.lista.length) return;
            const nuovo = Math.max(0, Math.min(stato.lista.length - 1, i));
            if (nuovo !== stato.corrente) { stato.corrente = nuovo; posiziona(); }
        };
        const passo = verso => vai(stato.corrente + verso);

        const monta = dati => {
            const lista = dati && Array.isArray(dati.lista) ? dati.lista.filter(Boolean) : [];
            let scheda = doc.getElementById('app-showdown');
            if (!scheda) {
                scheda = doc.createElement('div');
                scheda.id = 'app-showdown';
                scheda.className = 'mp';
                const dopo = doc.getElementById('matchList');
                if (dopo && dopo.parentNode === colonnaSx) colonnaSx.insertBefore(scheda, dopo); else colonnaSx.appendChild(scheda);
                scheda.addEventListener('click', e => {
                    const c = e.target.closest ? e.target.closest('.mp-carta') : null;
                    if (!c) return;
                    const i = Number(c.dataset.i);
                    if (i !== stato.corrente) { e.preventDefault(); vai(i); return; }
                    const s = stato.lista[i];
                    if (s && typeof s.apri === 'function') s.apri();
                });
                Car.collegaGesti(scheda, { avanti: () => passo(1), indietro: () => passo(-1), passoPx: () => 380 * Car.unitaPx(win), trascina: (f, fine) => { scheda.classList.toggle('trascinando', !fine); posiziona(fine ? 0 : f); } });
            }
            stato = { lista, corrente: Math.min(stato.corrente, Math.max(0, lista.length - 1)), scheda, pista: null };
            scheda.innerHTML = html(lista);
            stato.pista = scheda.querySelector('.mp-pista');
            posiziona();
            disegnaTabs();
            if (win.NomeScorrevole && typeof win.NomeScorrevole.installa === 'function') win.NomeScorrevole.installa('.mp-nome');
        };

        // la finestra del showdown la fa matches.html (quando serve): quando compare, ogni allenatore in testata prende il suo avatar
        const decoraFinestra = fin => {
            const avatar = avatarPerNome(stato.lista);
            fin.querySelectorAll('.sd-titolo .sd-nome').forEach(n => {
                if (n.querySelector('.mp-testa-avatar')) return;
                const h = htmlAvatarTesta(avatar[String(n.textContent || '').toLowerCase().trim()]);
                if (h) n.insertAdjacentHTML('afterbegin', h);
            });
        };
        if (win.MutationObserver) {
            const guarda = fin => { decoraFinestra(fin); new win.MutationObserver(() => decoraFinestra(fin)).observe(fin, { childList: true }); };
            const esistente = doc.getElementById('sd-modal-overlay');
            if (esistente) guarda(esistente);
            else new win.MutationObserver((_, o) => { const f = doc.getElementById('sd-modal-overlay'); if (f) { o.disconnect(); guarda(f); } }).observe(doc.body, { childList: true });
        }

        doc.addEventListener('keydown', e => { if (tab === 'sd' && e.key === 'ArrowRight') passo(1); else if (tab === 'sd' && e.key === 'ArrowLeft') passo(-1); });
        doc.addEventListener('app-dati', e => { if (e && e.detail === 'showdowns' && ponte) monta(ponte.datiPagina('showdowns')); });
        const gia = ponte && ponte.datiPagina ? ponte.datiPagina('showdowns') : null;
        if (gia) monta(gia);
        return { monta, vai, passo, mostra };
    }

    return { CHIAVE_TAB, TABS, htmlLato, htmlPoster, html, htmlTabs, tabValido, avatarPerNome, htmlAvatarTesta, avvia };
});
