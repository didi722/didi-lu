// =====================================================
// APP — la classifica di Matches come un carosello
// ---------------------------------------------------------------------
// Nell'app la classifica della stagione (a destra, in Matches) non è un elenco: si vede un giocatore alla volta, il primo in classifica per cominciare,
// con la sua posizione e i suoi punti; sotto, più piccoli, i due che lo seguono. Si scorre di lato (o si tocca uno dei due piccoli): quello che sta sotto
// a sinistra diventa il giocatore grande, e i due sotto sono i successivi. Dall'ultimo si torna al primo. Il giocatore grande si tocca per aprire la sua
// scheda (la pagina Trainers), e porta il tasto VS per sfidarlo (Sfide.bottoneRanking, lo stesso di sempre).
// I dati li passa matches.html (renderRankings → AppSito.pubblica('classifica', { stagione, giocatori })); questo file li disegna e basta.
// La parte pura (l'HTML a partire dai dati) è provata in test/app-classifica.test.js; funziona nel browser (window.AppClassifica) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const C = fabbrica(inNode ? require('./app-carosello.js') : radice.AppCarosello);
    if (inNode) module.exports = C;
    else {
        radice.AppClassifica = C;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => C.avvia(radice)); else C.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (Car) {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#31c489');
    const numero = n => Number(n) || 0;
    const AVATAR_VUOTO = 'immagini/magikarp.png';
    const FRECCIA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

    /** Dove porta il giocatore: la sua scheda nella pagina Trainers */
    const indirizzo = nome => 'players.html?player=' + encodeURIComponent(String(nome || '').trim());

    /** La riga con i numeri sotto il nome: showdown e match, vinti-persi */
    const righeDati = p => ({ sd: `SD ${numero(p.sdWon)}-${numero(p.sdLost)}`, match: `MATCH ${numero(p.won)}-${numero(p.lost)}` });

    const avatar = (p, classe) => `<img class="${classe}" draggable="false" src="${esc(p.avatar || AVATAR_VUOTO)}" alt="" onerror="this.onerror=null;this.src='${AVATAR_VUOTO}'">`;

    /** Il giocatore grande: posizione, sprite, nome, numeri e punti; `vs` è il tasto per sfidarlo (già HTML) */
    function htmlGrande(p, vs) {
        const d = righeDati(p);
        return `<div class="ac-grande" style="--c:${coloreSicuro(p.colore)}">
            <a class="ac-link" draggable="false" href="${esc(indirizzo(p.nome))}" aria-label="${esc(p.nome)}: open the trainer card" data-suono="apri">
                <span class="ac-pos">#${numero(p.posizione)}</span>
                ${avatar(p, 'ac-avatar')}
                <span class="ac-testi"><b class="ac-nome">${esc(p.nome)}</b><small>${d.sd}</small><small>${d.match}</small></span>
                <span class="ac-punti"><b>${numero(p.punti)}</b><small>PTS</small></span>
            </a>${vs ? `<span class="ac-vs">${vs}</span>` : ''}
        </div>`;
    }

    /** Uno dei due sotto: si tocca per portarlo in primo piano */
    function htmlPiccolo(p, indice) {
        return `<button type="button" class="ac-piccolo" data-vai="${indice}" style="--c:${coloreSicuro(p.colore)}" aria-label="Show ${esc(p.nome)}, number ${numero(p.posizione)}" data-suono="scegli">
            <span class="ac-pos">#${numero(p.posizione)}</span>
            ${avatar(p, 'ac-avatar')}
            <b class="ac-nome">${esc(p.nome)}</b>
            <span class="ac-punti"><b>${numero(p.punti)}</b></span>
        </button>`;
    }

    /**
     * La classifica intera dal giocatore al centro: il grande, i due successivi sotto (anche meno se la fila è corta) e, se c'è più di un giocatore, i comandi
     * per scorrere e quanti sono. `vs(nome)` dà l'HTML del tasto per sfidare.
     */
    function html(giocatori, corrente, { vs } = {}) {
        const lista = Array.isArray(giocatori) ? giocatori : [];
        if (!lista.length) return '<p class="ac-vuoto">No players registered in this season</p>';
        const i = Car.dentro(corrente, lista.length);
        const sotto = Car.seguenti(lista.length, i, 3, true).slice(1);
        const grande = lista[i];
        const nav = lista.length > 1
            ? `<div class="ac-nav"><button type="button" class="ac-freccia ac-prec" data-passo="-1" aria-label="Previous player" data-suono="scegli">${FRECCIA}</button>
                <span class="ac-conta" aria-live="polite">${i + 1} / ${lista.length}</span>
                <button type="button" class="ac-freccia ac-succ" data-passo="1" aria-label="Next player" data-suono="scegli">${FRECCIA}</button></div>`
            : '';
        return `${htmlGrande(grande, typeof vs === 'function' ? vs(grande.nome) : '')}
            ${sotto.length ? `<div class="ac-piccoli">${sotto.map(k => htmlPiccolo(lista[k], k)).join('')}</div>` : ''}
            ${nav}`;
    }

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        const ponte = win.AppSito;
        let stato = null;        // { giocatori, corrente, scheda }

        const vs = nome => { try { return win.Sfide && typeof win.Sfide.bottoneRanking === 'function' ? win.Sfide.bottoneRanking(nome) : ''; } catch (e) { return ''; } };

        const disegna = verso => {
            if (!stato) return;
            stato.scheda.dataset.verso = verso || '';
            stato.scheda.innerHTML = html(stato.giocatori, stato.corrente, { vs });
        };
        const vai = (i, verso) => {
            if (!stato || !stato.giocatori.length) return;
            const nuovo = Car.dentro(i, stato.giocatori.length);
            if (nuovo === stato.corrente) return;
            const d = Car.distanza(nuovo, stato.corrente, stato.giocatori.length, true);
            stato.corrente = nuovo;
            disegna(verso || (d > 0 ? 'avanti' : 'indietro'));
        };
        const passo = verso => { if (stato) vai(Car.passo(stato.corrente, stato.giocatori.length, verso, true), verso > 0 ? 'avanti' : 'indietro'); };

        const monta = dati => {
            const giocatori = dati && Array.isArray(dati.giocatori) ? dati.giocatori.filter(Boolean) : [];
            const corpo = doc.querySelector('.participants-card .cl-corpo');
            if (!corpo) return;
            let scheda = doc.getElementById('app-classifica');
            if (!scheda) {
                scheda = doc.createElement('div');
                scheda.id = 'app-classifica';
                scheda.className = 'ac';
                corpo.appendChild(scheda);
                scheda.addEventListener('click', e => {
                    const v = e.target.closest ? e.target.closest('[data-vai]') : null;
                    if (v) { vai(Number(v.dataset.vai), 'avanti'); return; }
                    const p = e.target.closest ? e.target.closest('[data-passo]') : null;
                    if (p) passo(Number(p.dataset.passo));
                });
                Car.collegaGesti(scheda, { avanti: () => passo(1), indietro: () => passo(-1) });
            }
            stato = { giocatori, corrente: stato ? Car.dentro(stato.corrente, giocatori.length || 1) : 0, scheda };
            doc.documentElement.classList.add('app-classifica');
            disegna('');
        };

        doc.addEventListener('app-dati', e => { if (e && e.detail === 'classifica' && ponte) monta(ponte.datiPagina('classifica')); });
        const gia = ponte && ponte.datiPagina ? ponte.datiPagina('classifica') : null;
        if (gia) monta(gia);
        return { monta, vai, passo };
    }

    return { indirizzo, righeDati, htmlGrande, htmlPiccolo, html, avvia };
});
