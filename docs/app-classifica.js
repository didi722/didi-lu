// =====================================================
// APP — la classifica di Matches come un carosello
// ---------------------------------------------------------------------
// Nell'app la classifica della stagione (la schermata RANKINGS di Matches) non è un elenco e le schede non hanno sfondo: ogni giocatore sta in piedi sul suo palco tondo (come
// in Trainers), con sotto il posto, il nome, i punti e i numeri. Si vede un giocatore alla volta, a cominciare dal primo; ai lati si intravedono i vicini.
// Scorre da sola (ogni pochi secondi, sempre in avanti: dall'ultimo si torna al primo) e si può scorrere anche a mano col dito (o toccare un vicino): dopo
// un gesto l'automatismo aspetta un po'. Il giocatore al centro si tocca per aprire la sua scheda (Trainers) e porta il tasto VS per sfidarlo.
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

    /** Dove porta il giocatore: la sua scheda nella pagina Trainers */
    const indirizzo = nome => 'players.html?player=' + encodeURIComponent(String(nome || '').trim());

    /** La riga con i numeri sotto il nome: showdown e match, vinti-persi */
    const righeDati = p => ({ sd: `SD ${numero(p.sdWon)}-${numero(p.sdLost)}`, match: `MATCH ${numero(p.won)}-${numero(p.lost)}` });

    const avatar = (p, classe) => `<img class="${classe}" draggable="false" src="${esc(p.avatar || AVATAR_VUOTO)}" alt="" onerror="this.onerror=null;this.src='${AVATAR_VUOTO}'">`;

    /** Quanto sta fermo un giocatore prima che la classifica passi al successivo, da sola (ms) */
    const PASSO_AUTO = 4500;
    /** Dopo che si è toccata o scorsa a mano, l'automatismo riparte dopo questo tempo (ms) */
    const RIPRENDI_DOPO = 9000;

    /** Un giocatore: niente sfondo, lui sul palco tondo nel suo colore, sotto il nome, il posto, i punti e i numeri; `vs` è il tasto per sfidarlo (già HTML) */
    function htmlCarta(p, indice, vs, gif) {
        const d = righeDati(p);
        const pkm = p.pkm && gif ? `<img class="ac-pkm" draggable="false" src="${esc(gif(p.pkm))}" data-pkm="${esc(p.pkm)}" alt="${esc(p.pkm)}" onerror="SpritePkm.ritenta(this)">` : '';
        return `<article class="ac-carta" data-i="${indice}" style="--c:${coloreSicuro(p.colore)}">
            <a class="ac-link" draggable="false" href="${esc(indirizzo(p.nome))}" aria-label="${esc(p.nome)}: open the trainer card" data-suono="apri">
                <span class="ac-palco"><span class="pal-aura" aria-hidden="true"></span><span class="pal-pedana" aria-hidden="true"></span><span class="ac-scena">${avatar(p, 'ac-avatar')}${pkm}</span></span>
                <span class="ac-testi">
                    <span class="ac-riga"><span class="ac-pos">#${numero(p.posizione)}</span><b class="ac-nome">${esc(p.nome)}</b></span>
                    <span class="ac-punti"><b>${numero(p.punti)}</b><small>PTS</small></span>
                    <small class="ac-dati">${d.sd} · ${d.match}</small>
                </span>
            </a>${vs ? `<span class="ac-vs">${vs}</span>` : ''}
        </article>`;
    }

    /** Tutta la classifica: una scheda per giocatore (se ne vede una alla volta, le altre stanno ai lati). `vs(nome)` dà l'HTML del tasto per sfidare. */
    function html(giocatori, { vs, gif } = {}) {
        const lista = Array.isArray(giocatori) ? giocatori : [];
        if (!lista.length) return '<p class="ac-vuoto">No players registered in this season</p>';
        return `<div class="ac-pista">${lista.map((p, i) => htmlCarta(p, i, typeof vs === 'function' ? vs(p.nome) : '', gif)).join('')}</div>`;
    }

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        const ponte = win.AppSito;
        let stato = null;        // { giocatori, corrente, scheda, pista }
        let timer = null, ripresa = 0, premuto = false;

        const vs = nome => { try { return win.Sfide && typeof win.Sfide.bottoneRanking === 'function' ? win.Sfide.bottoneRanking(nome) : ''; } catch (e) { return ''; } };

        const posiziona = (frac = 0) => {
            if (!stato || !stato.pista) return;
            const n = stato.giocatori.length;
            stato.pista.querySelectorAll('.ac-carta').forEach(el => {
                const i = Number(el.dataset.i);
                const d = Car.distanza(i, stato.corrente, n, true);
                const a = Car.aspetto(d + frac);
                el.style.setProperty('--x', a.x);
                el.style.setProperty('--s', a.scala);
                el.style.setProperty('--o', a.opacita);
                el.style.zIndex = a.z;
                el.classList.toggle('ac-centro', i === stato.corrente);
                el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
            });
        };
        const vai = i => {
            if (!stato || !stato.giocatori.length) return;
            const nuovo = Car.dentro(i, stato.giocatori.length);
            if (nuovo !== stato.corrente) { stato.corrente = nuovo; posiziona(); }
        };
        const passo = verso => { if (stato) vai(Car.passo(stato.corrente, stato.giocatori.length, verso, true)); };
        // a mano (dito o tocco): l'automatismo aspetta un po' prima di ripartire
        const amano = verso => { ripresa = Date.now() + RIPRENDI_DOPO; passo(verso); };

        // da solo, ogni PASSO_AUTO ms passa al successivo (non se il dito è giù, la pagina è nascosta, c'è un solo giocatore o si è appena scorso a mano)
        const avviaAuto = () => {
            if (timer) return;
            timer = win.setInterval(() => {
                if (!stato || stato.giocatori.length < 2 || premuto || doc.hidden || Date.now() < ripresa) return;
                passo(1);
            }, PASSO_AUTO);
        };

        // il giocatore e il suo Pokémon compagno, in scala tra loro (scala-pkm.js) e dentro il cerchio del palco
        const scalaCarte = () => {
            const S = win.ScalaPkm;
            if (!S || !stato) return;
            stato.scheda.querySelectorAll('.ac-carta').forEach(c => {
                const a = c.querySelector('.ac-avatar'), p = c.querySelector('.ac-pkm'), palco = c.querySelector('.ac-palco'), ped = c.querySelector('.pal-pedana'), sc = c.querySelector('.ac-scena');
                if (!a || !p || !palco || !ped || !sc) return;
                const sotto = parseFloat(win.getComputedStyle(sc).bottom) || 0;
                S.scena({ allenatore: a, pokemon: p, spazioPx: Math.max(30, palco.clientHeight - sotto - 4), larghezzaMax: ped.offsetWidth * 0.94 });
            });
        };
        win.addEventListener('resize', () => { if (stato) stato.scheda.querySelectorAll('.ac-pkm[data-sc]').forEach(p => p.removeAttribute('data-sc')); scalaCarte(); });

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
                    const c = e.target.closest ? e.target.closest('.ac-carta') : null;
                    if (c && !c.classList.contains('ac-centro') && stato) { e.preventDefault(); ripresa = Date.now() + RIPRENDI_DOPO; vai(Number(c.dataset.i)); }
                });
                scheda.addEventListener('pointerdown', () => { premuto = true; });
                const lascia = () => { premuto = false; };
                scheda.addEventListener('pointerup', lascia);
                scheda.addEventListener('pointercancel', lascia);
                scheda.addEventListener('pointerleave', lascia);
                Car.collegaGesti(scheda, { avanti: () => amano(1), indietro: () => amano(-1), passoPx: () => 205 * Car.unitaPx(win), trascina: (f, fine) => { ripresa = Date.now() + RIPRENDI_DOPO; scheda.classList.toggle('trascinando', !fine); posiziona(fine ? 0 : f); } });
            }
            stato = { giocatori, corrente: stato ? Car.dentro(stato.corrente, giocatori.length || 1) : 0, scheda, pista: null };
            doc.documentElement.classList.add('app-classifica');
            scheda.innerHTML = html(giocatori, { vs, gif: win.SpritePkm ? sp => win.SpritePkm.gif(sp) : null });
            stato.pista = scheda.querySelector('.ac-pista');
            posiziona();
            scalaCarte();
            avviaAuto();
        };

        doc.addEventListener('app-dati', e => { if (e && e.detail === 'classifica' && ponte) monta(ponte.datiPagina('classifica')); });
        const gia = ponte && ponte.datiPagina ? ponte.datiPagina('classifica') : null;
        if (gia) monta(gia);
        return { monta, vai, passo };
    }

    return { PASSO_AUTO, RIPRENDI_DOPO, indirizzo, righeDati, htmlCarta, html, avvia };
});
