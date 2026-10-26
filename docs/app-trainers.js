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

    /** I trofei come piccole coppe con il numero: una per tipo di stagione; senza il dettaglio per tipo, una sola con le stagioni vinte. Niente trofei: niente (nessuna scritta). */
    function htmlTrofei(g) {
        const gruppi = Array.isArray(g.trofei) && g.trofei.length
            ? g.trofei.map(t => ({ icona: t.tipo === 'league' ? COPPA : (t.icona || COPPA), n: t.conteggio, titolo: t.etichetta }))
            : (Number(g.stagioniVinte) > 0 ? [{ icona: COPPA, n: Number(g.stagioniVinte), titolo: 'Seasons won' }] : []);
        return gruppi.map(t => `<span class="at-coppa" title="${esc(t.titolo)}"><img src="${esc(t.icona)}" alt="" draggable="false" onerror="this.onerror=null;this.src='${COPPA}'"><b>x${Number(t.n) || 0}</b></span>`).join('');
    }

    /** Il testo che spiega un badge: titolo (nome e livello) e descrizione */
    function testoBadge(b) {
        const lv = livelloNome(b && b.livello);
        return { titolo: `${(b && b.nome) || ''}${lv ? ' · ' + lv : ''}`, descrizione: String((b && b.descrizione) || '').trim() };
    }

    /** I badge presi, come medaglie con l'immagine del livello (senza immagine, l'icona): si toccano per leggere cosa sono. Nessun badge: niente (nessuna scritta). */
    function htmlBadge(g) {
        const lista = Array.isArray(g.badge) ? g.badge : [];
        return lista.map((b, i) => `<button type="button" class="at-badge at-lv-${esc(b.livello)}" data-badge="${i}" aria-label="${esc(testoBadge(b).titolo)}"><img src="${esc(b.img)}" alt="" draggable="false" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(b.icona || '🏅')}'))"></button>`).join('');
    }

    /** Ranking ed Elo, come sulla home */
    function htmlNumeri(g) {
        const ok = !!g.classificato;
        return `<ul class="at-numeri"><li><b>${ok && g.posizione ? '#' + g.posizione : 'N/A'}</b><span>Ranking</span></li><li><b>${ok ? Math.round(Number(g.elo) || 0) : 'N/A'}</b><span>Elo</span></li></ul>`;
    }

    /** La scheda di un allenatore: niente sfondo. Al centro lui e il suo Pokémon compagno sul palco tondo; di fianco il nome, il ranking, l'Elo, i trofei e i badge. `gif(specie)` dà l'indirizzo del Pokémon animato. */
    function htmlCarta(g, indice, { gif } = {}) {
        const c = coloreSicuro(g.colore);
        const pkm = g.pkm && gif ? `<img class="at-pkm" draggable="false" src="${esc(gif(g.pkm))}" data-pkm="${esc(g.pkm)}" alt="${esc(g.pkm)}" onerror="this.style.display='none'">` : '';
        const trofei = htmlTrofei(g), badge = htmlBadge(g);
        return `<article class="at-carta" data-i="${indice}" style="--c:${c}">
            <div class="at-palco">
                <span class="pal-aura" aria-hidden="true"></span><span class="pal-pedana" aria-hidden="true"></span>
                <img class="at-allenatore" draggable="false" src="${esc(g.avatar || AVATAR_VUOTO)}" alt="" onerror="this.onerror=null;this.src='${AVATAR_VUOTO}'">${pkm}
            </div>
            <div class="at-info">
                <header class="at-testa"><b class="at-nome">${esc(g.nome)}</b></header>
                ${g.titolo ? `<span class="at-titolo">${esc(g.titolo)}</span>` : ''}
                ${htmlNumeri(g)}
                ${trofei ? `<div class="at-trofei">${trofei}</div>` : ''}
                ${badge ? `<div class="at-badge-riga">${badge}</div>` : ''}
            </div>
        </article>`;
    }

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        const ponte = win.AppSito;
        const gif = win.SpritePkm ? s => win.SpritePkm.gif(s) : null;
        let stato = null;      // { lista, corrente, pista }

        // il compagno in scala con l'allenatore (le formule della pagina pubblica, scala-pkm.js) e a terra o fluttuante; si rifà quando le immagini arrivano e lo schermo cambia
        const scala = carta => {
            const S = win.ScalaPkm;
            const a = carta.querySelector('.at-allenatore'), p = carta.querySelector('.at-pkm');
            const palco = carta.querySelector('.at-palco');
            if (!S || !a || !p || !palco) return;
            const sotto = parseFloat(win.getComputedStyle(p).bottom) || 0;
            S.scena({ allenatore: a, pokemon: p, spazioPx: Math.max(40, palco.clientHeight - sotto - 6), larghezzaMax: Math.max(60, palco.clientWidth - 24) });
        };
        const scalaTutti = () => { if (stato) stato.pista.querySelectorAll('.at-carta').forEach(c => { c.querySelectorAll('.at-pkm[data-sc]').forEach(p => p.removeAttribute('data-sc')); scala(c); }); };
        win.addEventListener('resize', scalaTutti);

        const posiziona = () => {
            if (!stato) return;
            const n = stato.lista.length;
            stato.pista.querySelectorAll('.at-carta').forEach(el => {
                const i = Number(el.dataset.i);
                const d = Car.distanza(i, stato.corrente, n, true);
                const a = Car.aspetto(d);
                el.style.setProperty('--x', a.x);
                el.style.setProperty('--s', a.scala);
                el.style.setProperty('--o', a.opacita);
                el.style.zIndex = a.z;
                el.classList.toggle('at-centro', i === stato.corrente);
                el.classList.toggle('at-vicino', Math.abs(d) === 1);
                el.classList.toggle('at-prima', d < 0);           // chi sta a sinistra mostra il palco dal lato dello schermo
                el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
            });
            nota(null);
        };
        const vai = i => { if (!stato) return; const n = Car.dentro(i, stato.lista.length); if (n !== stato.corrente) { stato.corrente = n; posiziona(); } };
        const passo = verso => { if (stato) vai(Car.passo(stato.corrente, stato.lista.length, verso, true)); };

        // la spiegazione di un badge: la nota in basso (un tocco: per qualche secondo; tenendo premuto: finché non si lascia)
        const nota = badge => {
            let el = doc.getElementById('at-nota');
            if (!badge) { if (el) el.hidden = true; return; }
            const carta = badge.closest('.at-carta');
            const g = stato && carta ? stato.lista[Number(carta.dataset.i)] : null;
            const b = g && g.badge ? g.badge[Number(badge.dataset.badge)] : null;
            if (!b) return;
            if (!el) { el = doc.createElement('div'); el.id = 'at-nota'; el.className = 'at-nota'; el.setAttribute('role', 'status'); doc.body.appendChild(el); }
            const t = testoBadge(b);
            el.innerHTML = `<b>${esc(t.titolo)}</b>${t.descrizione ? `<span>${esc(t.descrizione)}</span>` : ''}`;
            el.hidden = false;
        };

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
            radice.innerHTML = `<div class="at-pista">${lista.map((g, i) => htmlCarta(g, i, { gif })).join('')}</div>`;
            stato = { lista, corrente, pista: radice.querySelector('.at-pista') };
            stato.pista.querySelectorAll('.at-carta').forEach(scala);
            stato.pista.addEventListener('click', e => {
                const carta = e.target.closest ? e.target.closest('.at-carta') : null;
                if (carta && !carta.classList.contains('at-centro')) vai(Number(carta.dataset.i));
            });
            if (!radice.dataset.gesti) {              // una volta sola, anche se i dati arrivano di nuovo
                radice.dataset.gesti = '1';
                Car.collegaGesti(radice, { avanti: () => passo(1), indietro: () => passo(-1) });
                Car.collegaPressione(radice, '.at-carta.at-centro .at-badge', { mostra: b => nota(b), nascondi: () => nota(null) });
                doc.addEventListener('keydown', e => { if (e.key === 'ArrowRight') passo(1); else if (e.key === 'ArrowLeft') passo(-1); });
            }
            posiziona();
        };

        doc.addEventListener('app-dati', e => { if (e && e.detail === 'trainers' && ponte) monta(ponte.datiPagina('trainers')); });
        const gia = ponte && ponte.datiPagina ? ponte.datiPagina('trainers') : null;
        if (gia) monta(gia);
        return { monta, vai, passo };
    }

    return { indiceIniziale, htmlTrofei, testoBadge, htmlBadge, htmlNumeri, htmlCarta, avvia };
});
