// =====================================================
// TROPHY ARCHIVE (palmarès) — Poké-Tournament
//
// Tutte le stagioni e le cup giocate, chiuse e in corso, con il vincitore e la data: la home ne mostra solo tre. Si legge dalle info di
// ogni stagione (tipo-stagione.js), mai dalle stagioni intere.
//
//   Palmares.html(voci, giocatori, filtro)   le card (testo sempre protetto)
//   Palmares.voci(infoStagioni)              [{ stagione, tipo, nome, data, vincitore, stato }] le più recenti per prime
//
// Funziona nel browser (window.Palmares) e in Node (test/palmares.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./tipo-stagione.js'));
    else radice.Palmares = fabbrica(radice.TipoStagione);
})(typeof self !== 'undefined' ? self : this, function (TipoStagione) {
    'use strict';

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dataIt = iso => { const p = String(iso || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ''; };

    /** Le stagioni e le cup (la beta no) con il loro stato: 'closed' (vinta da qualcuno), 'playing' (in corso), 'open' (iscrizioni aperte). */
    function voci(infoStagioni) {
        const out = [];
        for (const [id, info] of Object.entries(infoStagioni || {})) {
            if (!TipoStagione.daTrofeo(info, id)) continue;
            const tipo = TipoStagione.tipoDi(info, id);
            out.push({
                stagione: id, tipo, nome: (info && info.name) || id, data: TipoStagione.dataVittoria(info || {}),
                vincitore: String((info && info.winner) || ''), stato: idDi(info && info.status) || 'open',
                icona: (tipo === 'cup' && info && info.icona) ? String(info.icona) : TipoStagione.TIPI[tipo].icona
            });
        }
        const numero = v => parseInt(String(v.stagione).replace(/\D/g, ''), 10) || 0;
        return out.sort((a, b) => (b.data || '').localeCompare(a.data || '') || numero(b) - numero(a));
    }

    // Una card: il tipo di coppa, il nome, il vincitore (con il colore e il link alla sua pagina) e la data
    function html(lista, giocatori, filtro = 'all') {
        return (lista || []).filter(v => filtro === 'all' || v.tipo === filtro).map(v => {
            const tipo = TipoStagione.TIPI[v.tipo];
            const g = (giocatori || {})[idDi(v.vincitore)] || {};
            const chiusa = v.stato === 'closed';
            const vincitore = chiusa && v.vincitore
                ? `<a class="palm-vincitore" href="public.html?player=${encodeURIComponent(idDi(v.vincitore))}" style="--palm-col:${esc(g.color || '#31c489')}">
                        ${g.avatar ? `<img src="${esc(g.avatar)}" alt="" class="palm-avatar">` : ''}<span>${esc(g.name || v.vincitore)}</span></a>`
                : `<span class="palm-stato">${v.stato === 'playing' ? 'In progress' : v.stato === 'open' ? 'Sign-ups open' : 'No winner'}</span>`;
            return `<article class="palm-card palm-${esc(v.tipo)}">
                <span class="palm-tipo">${esc(tipo.etichetta)}</span>
                <h3 class="palm-nome">${esc(v.nome)}</h3>
                ${vincitore}
                ${chiusa && v.data ? `<time class="palm-data">${esc(dataIt(v.data))}</time>` : ''}
            </article>`;
        }).join('');
    }

    // ---------- la pagina ----------
    async function avvia() {
        if (typeof document === 'undefined' || !document.getElementById('palm-archivio')) return;
        const filtri = document.getElementById('palm-filtri');
        let filtro = 'all', lista = [], giocatori = {};
        const disegna = () => {
            const chiuse = lista.filter(v => v.stato === 'closed'), inCorso = lista.filter(v => v.stato !== 'closed');
            document.getElementById('palm-archivio').innerHTML = html(chiuse, giocatori, filtro);
            document.getElementById('palm-in-corso').innerHTML = html(inCorso, giocatori, filtro);
            document.getElementById('palm-in-corso-sezione').hidden = !inCorso.some(v => filtro === 'all' || v.tipo === filtro);
            document.getElementById('palm-vuoto').hidden = chiuse.some(v => filtro === 'all' || v.tipo === filtro);
        };
        const tasti = [['all', 'All'], ...TipoStagione.ORDINE.map(t => [t, t === 'cup' ? 'Cups' : TipoStagione.TIPI[t].etichetta])];
        filtri.innerHTML = tasti.map(([id, testo]) => `<button type="button" class="palm-tasto${id === filtro ? ' attivo' : ''}" data-tipo="${id}">${esc(testo)}</button>`).join('');
        filtri.addEventListener('click', e => {
            const b = e.target.closest('[data-tipo]');
            if (!b) return;
            filtro = b.dataset.tipo;
            filtri.querySelectorAll('.palm-tasto').forEach(x => x.classList.toggle('attivo', x === b));
            disegna();
        });
        try {
            const [info, snap] = await Promise.all([TipoStagione.leggiInfo(db), db.ref('players').once('value')]);
            lista = voci(info);
            for (const [id, p] of Object.entries(snap.val() || {})) giocatori[idDi(id)] = { name: p && p.info && p.info.name, color: p && p.info && p.info.color, avatar: p && p.info && p.info.avatar };
        } catch (e) { console.warn('Trophy archive not available:', e); }
        disegna();
        const loader = document.getElementById('poke-loader');
        if (loader) loader.style.display = 'none';
    }
    if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', avvia);

    return { voci, html };
});
