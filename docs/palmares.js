// =====================================================
// ARCHIVE (palmarès) — Poké-Tournament
//
// Tutte le stagioni e le cup giocate, chiuse e in corso, con il vincitore e la data: la home ne mostra solo tre. Si legge dalle info di
// ogni stagione (tipo-stagione.js), mai dalle stagioni intere.
//
//   Palmares.html(voci, giocatori, filtro)   le card (testo sempre protetto)
//   Palmares.capoClassifica(classifica)      chi guida una stagione in corso
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

    // Come la home: con le iscrizioni scadute la stagione è in corso
    const statoDi = info => {
        const st = idDi(info && info.status) || 'open';
        return st === 'open' && info && info.deadline && new Date() >= new Date(info.deadline) ? 'playing' : st;
    };

    /** Le stagioni e le cup (la beta no) con il loro stato: 'closed' (vinta da qualcuno), 'playing' (in corso), 'open' (iscrizioni aperte). */
    function voci(infoStagioni) {
        const out = [];
        for (const [id, info] of Object.entries(infoStagioni || {})) {
            if (!TipoStagione.daTrofeo(info, id)) continue;
            if (statoDi(info) === 'open') continue; // iscrizioni aperte: non ancora iniziata, non compare
            const tipo = TipoStagione.tipoDi(info, id);
            out.push({
                stagione: id, tipo, nome: (info && info.name) || id, data: TipoStagione.dataVittoria(info || {}),
                vincitore: String((info && info.winner) || ''), stato: statoDi(info),
                icona: (tipo === 'cup' && info && info.icona) ? String(info.icona) : TipoStagione.TIPI[tipo].icona
            });
        }
        const numero = v => parseInt(String(v.stagione).replace(/\D/g, ''), 10) || 0;
        return out.sort((a, b) => (b.data || '').localeCompare(a.data || '') || numero(b) - numero(a));
    }

    /** Chi guida una classifica ({ giocatore: { points } }): il primo per punti, '' se è vuota. */
    function capoClassifica(classifica) {
        let max = -1, capo = '';
        for (const [nome, r] of Object.entries(classifica || {})) {
            const pt = Number(r && r.points || 0);
            if (pt > max) { max = pt; capo = nome; }
        }
        return capo;
    }

    // Una card come quelle della home: colore e cerchio con il vincitore (o chi guida, se la stagione è in corso), il nome della competizione,
    // l'icona del suo trofeo accanto al cerchio (nessun tag di tipo) e la data
    function html(lista, giocatori, filtro = 'all') {
        return (lista || []).filter(v => filtro === 'all' || v.tipo === filtro).map(v => {
            const chiusa = v.stato === 'closed';
            const giocando = v.stato === 'playing';
            const chi = chiusa ? v.vincitore : (giocando ? v.capo : '');
            const g = (giocatori || {})[idDi(chi)] || {};
            const cerchio = chi
                ? (g.avatar ? `<img src="${esc(g.avatar)}" alt="" class="palm-avatar">` : `<span class="palm-avatar palm-senza">?</span>`)
                : `<span class="palm-avatar palm-senza">?</span>`;
            const segno = chiusa
                ? `<img src="${esc(v.icona)}" alt="" class="palm-trofeo" onerror="this.src='immagini/season-winner-color.png';this.onerror=null">`
                : (giocando ? '<span class="palm-live">●</span>' : '');
            const nome = chi
                ? `<span class="palm-vincitore">${esc(g.name || chi)}</span>`
                : `<span class="palm-stato">${giocando ? 'In progress' : 'No winner'}</span>`;
            return `<a class="palm-card palm-${esc(v.tipo)}" href="matches.html?id=${encodeURIComponent(v.stagione)}" style="--palm-col:${esc(chi && g.color || '#fff')}">
                <h3 class="palm-nome">${esc(v.nome)}</h3>
                <div class="palm-cerchio">${cerchio}${segno}</div>
                ${nome}
                ${giocando && chi ? '<span class="palm-stato">In progress</span>' : ''}
                ${chiusa && v.data ? `<time class="palm-data">${esc(dataIt(v.data))}</time>` : ''}
            </a>`;
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
            await Promise.all(lista.filter(v => v.stato === 'playing').map(async v => {
                const lb = await db.ref(`seasons/${v.stagione}/leaderboard`).once('value').then(x => x.val()).catch(() => null);
                v.capo = capoClassifica(lb);
            }));
            for (const [id, p] of Object.entries(snap.val() || {})) giocatori[idDi(id)] = { name: p && p.info && p.info.name, color: p && p.info && p.info.color, avatar: p && p.info && p.info.avatar };
        } catch (e) { console.warn('Archive not available:', e); }
        disegna();
        const loader = document.getElementById('poke-loader');
        if (loader) loader.style.display = 'none';
    }
    if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', avvia);

    return { voci, html, capoClassifica };
});
