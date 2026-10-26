// =====================================================
// APP — Trainers: gli allenatori a scheda, uno alla volta
// ---------------------------------------------------------------------
// Nell'app la pagina Trainers (e la pagina pubblica, che non c'è più) è un carosello: si apre sul primo della classifica, con il suo Pokémon preferito, i
// suoi trofei e badge e il suo Elo. Ai lati si intravedono il precedente e il successivo: si scorre di lato (o si tocca uno dei due, o una freccia) e si
// passa al secondo, al terzo... Dal primo, scorrendo indietro, si arriva all'ultimo. `?player=nome` apre direttamente quell'allenatore.
// I dati li calcola players.html (initTrainersPage → AppSito.pubblica('trainers', [...])): qui si disegnano e basta.
// La parte pura (cosa mostrare, l'HTML) è provata in test/app-trainers.test.js; funziona nel browser (window.AppTrainers) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const T = fabbrica(inNode ? require('./app-carosello.js') : radice.AppCarosello);
    if (inNode) module.exports = T;
    else {
        radice.AppTrainers = T;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => T.avvia(radice)); else T.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (Car) {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#31c489');
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const AVATAR_VUOTO = 'immagini/magikarp.png';
    const COPPA = 'immagini/season-winner-color.png';
    const FRECCIA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

    /** L'indice dell'allenatore che si chiede nell'indirizzo (?player=nome, senza badare alle maiuscole); 0 (il primo) se non c'è o non esiste */
    function indiceIniziale(lista, richiesto) {
        const id = idDi(richiesto);
        if (!id) return 0;
        const i = (lista || []).findIndex(g => idDi(g.id) === id || idDi(g.nome) === id);
        return i < 0 ? 0 : i;
    }

    const livelloNome = l => ({ bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', founder: 'Founder' }[l] || '');

    /** I trofei come piccole coppe con il numero: una per tipo di stagione; senza il dettaglio per tipo, una sola con le stagioni vinte */
    function htmlTrofei(g) {
        const gruppi = Array.isArray(g.trofei) && g.trofei.length
            ? g.trofei.map(t => ({ icona: t.tipo === 'league' ? COPPA : (t.icona || COPPA), n: t.conteggio, titolo: t.etichetta }))
            : (Number(g.stagioniVinte) > 0 ? [{ icona: COPPA, n: Number(g.stagioniVinte), titolo: 'Seasons won' }] : []);
        if (!gruppi.length) return '<span class="at-nulla">No trophies yet</span>';
        return gruppi.map(t => `<span class="at-coppa" title="${esc(t.titolo)}"><img src="${esc(t.icona)}" alt="" onerror="this.onerror=null;this.src='${COPPA}'"><b>x${Number(t.n) || 0}</b></span>`).join('');
    }

    /** I badge presi, come medaglie con l'immagine del livello (senza immagine, l'icona) */
    function htmlBadge(g) {
        const lista = Array.isArray(g.badge) ? g.badge : [];
        if (!lista.length) return '<span class="at-nulla">No badges yet</span>';
        return lista.map(b => `<span class="at-badge at-lv-${esc(b.livello)}" title="${esc(b.nome)}${livelloNome(b.livello) ? ' · ' + esc(livelloNome(b.livello)) : ''}"><img src="${esc(b.img)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(b.icona || '🏅')}'))"></span>`).join('');
    }

    /** La scheda di un allenatore. `gif(specie)` dà l'indirizzo del suo Pokémon animato. */
    function htmlCarta(g, indice, { gif } = {}) {
        const c = coloreSicuro(g.colore);
        const pkm = g.pkm && gif ? `<img class="at-pkm" draggable="false" src="${esc(gif(g.pkm))}" alt="${esc(g.pkm)}" onerror="this.style.display='none'">` : '';
        const elo = g.classificato ? `<b>${Math.round(Number(g.elo) || 0)}</b><small>Elo</small>` : '<b class="at-na">N/A</b><small>Elo</small>';
        return `<article class="at-carta" data-i="${indice}" style="--c:${c}">
            <div class="at-palco">
                <span class="at-raggi" aria-hidden="true"></span><span class="at-pedana" aria-hidden="true"></span>
                <img class="at-allenatore" draggable="false" src="${esc(g.avatar || AVATAR_VUOTO)}" alt="" onerror="this.onerror=null;this.src='${AVATAR_VUOTO}'">${pkm}
            </div>
            <div class="at-info">
                <header class="at-testa"><span class="at-pos">${g.posizione ? '#' + g.posizione : '–'}</span><b class="at-nome">${esc(g.nome)}</b></header>
                ${g.titolo ? `<span class="at-titolo">${esc(g.titolo)}</span>` : ''}
                <div class="at-elo">${elo}</div>
                <div class="at-trofei">${htmlTrofei(g)}</div>
                <div class="at-badge-riga">${htmlBadge(g)}</div>
            </div>
        </article>`;
    }

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        const ponte = win.AppSito;
        const gif = win.SpritePkm ? s => win.SpritePkm.gif(s) : null;
        let stato = null;      // { lista, corrente, pista, conta }

        const posiziona = () => {
            if (!stato) return;
            const n = stato.lista.length;
            stato.pista.querySelectorAll('.at-carta').forEach(el => {
                const i = Number(el.dataset.i);
                const a = Car.aspetto(Car.distanza(i, stato.corrente, n, true));
                el.style.setProperty('--x', a.x);
                el.style.setProperty('--s', a.scala);
                el.style.setProperty('--o', a.opacita);
                el.style.zIndex = a.z;
                el.classList.toggle('at-centro', i === stato.corrente);
                el.classList.toggle('at-vicino', Math.abs(Car.distanza(i, stato.corrente, n, true)) === 1);
                el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
            });
            if (stato.conta) stato.conta.textContent = (stato.corrente + 1) + ' / ' + n;
        };
        const vai = i => { if (!stato) return; const n = Car.dentro(i, stato.lista.length); if (n !== stato.corrente) { stato.corrente = n; posiziona(); } };
        const passo = verso => { if (stato) vai(Car.passo(stato.corrente, stato.lista.length, verso, true)); };

        const monta = dati => {
            const lista = Array.isArray(dati) ? dati.filter(Boolean) : [];
            let radice = doc.getElementById('app-trainers');
            if (!radice) {
                radice = doc.createElement('div');
                radice.id = 'app-trainers';
                radice.className = 'at';
                doc.body.appendChild(radice);
            }
            doc.documentElement.classList.add('app-trainers');
            if (!lista.length) { radice.innerHTML = '<p class="at-vuoto">No trainers yet.</p>'; stato = null; return; }
            let richiesto = '';
            try { richiesto = new win.URLSearchParams(win.location.search).get('player') || ''; } catch (e) { richiesto = ''; }
            const corrente = stato ? Car.dentro(stato.corrente, lista.length) : indiceIniziale(lista, richiesto);
            radice.innerHTML = `<div class="at-pista">${lista.map((g, i) => htmlCarta(g, i, { gif })).join('')}</div>
                <div class="at-pie">
                    <button type="button" class="at-freccia at-prec" aria-label="Previous trainer" data-suono="scegli">${FRECCIA}</button>
                    <span class="at-conta" aria-live="polite"></span>
                    <button type="button" class="at-freccia at-succ" aria-label="Next trainer" data-suono="scegli">${FRECCIA}</button>
                </div>`;
            stato = { lista, corrente, pista: radice.querySelector('.at-pista'), conta: radice.querySelector('.at-conta') };
            radice.querySelector('.at-prec').addEventListener('click', () => passo(-1));
            radice.querySelector('.at-succ').addEventListener('click', () => passo(1));
            stato.pista.addEventListener('click', e => {
                const carta = e.target.closest ? e.target.closest('.at-carta') : null;
                if (carta && !carta.classList.contains('at-centro')) vai(Number(carta.dataset.i));
            });
            if (!radice.dataset.gesti) {              // una volta sola, anche se i dati arrivano di nuovo
                radice.dataset.gesti = '1';
                Car.collegaGesti(radice, { avanti: () => passo(1), indietro: () => passo(-1) });
                doc.addEventListener('keydown', e => { if (e.key === 'ArrowRight') passo(1); else if (e.key === 'ArrowLeft') passo(-1); });
            }
            posiziona();
        };

        doc.addEventListener('app-dati', e => { if (e && e.detail === 'trainers' && ponte) monta(ponte.datiPagina('trainers')); });
        const gia = ponte && ponte.datiPagina ? ponte.datiPagina('trainers') : null;
        if (gia) monta(gia);
        return { monta, vai, passo };
    }

    return { indiceIniziale, htmlTrofei, htmlBadge, htmlCarta, avvia };
});
