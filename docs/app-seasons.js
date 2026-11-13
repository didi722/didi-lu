// =====================================================
// APP — Seasons: la pagina delle stagioni (seasons.html)
// ---------------------------------------------------------------------
// Si apre dalla tessera SEASONS del menù, come Play (practice.html) con le sue locandine: tre grandi locandine affiancate,
//   - PAST: le stagioni concluse;
//   - PLAYING: le stagioni in corso (iscrizioni chiuse, showdown da giocare);
//   - SIGN-UPS: le stagioni con le iscrizioni aperte.
// Toccandone una: se c'è una stagione sola ci si va direttamente (iscrizioni: hub.html; in corso e passate: matches.html), altrimenti si sceglie tra più locandine
// (una per stagione, con le stesse immagini). Una categoria senza stagioni resta spenta.
// Le immagini proprie si mettono in immagini/app/seasons-<past|playing|signups>.png (o .webp). Lo stile è quello di Play (pr-*, app-gioco-pagine.css).
// La parte pura è provata in test/app-seasons.test.js; funziona nel browser (window.AppSeasons) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const P = fabbrica(inNode ? require('./app-comune.js') : radice.AppComune, inNode ? require('./app-scena.js') : radice.AppScena);
    if (inNode) module.exports = P;
    else {
        radice.AppSeasons = P;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => P.avvia(radice)); else P.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (C, S) {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const ICONA = nome => (C && C.svg ? C.svg(nome) : '');

    /** Le tre categorie, nell'ordine in cui compaiono: id (anche della scena e dell'immagine), nome sul tag e colore */
    const GRUPPI = [
        { id: 'past', et: 'Past', colore: '#b388eb', scelta: 'Past seasons' },
        { id: 'playing', et: 'Playing', colore: '#ffbd44', scelta: 'Seasons in progress' },
        { id: 'signups', et: 'Sign-ups', colore: '#31c489', scelta: 'Sign-ups open' }
    ];

    // ---------- parti pure ----------

    /** Lo stato di una stagione: quello scritto, ma con le iscrizioni scadute è "playing" (come nel menù e nella home del sito) */
    function statoStagione(info, adesso) {
        if (!info) return '';
        let st = String(info.status || 'open').toLowerCase();
        if (st === 'terminata') st = 'closed';
        if (st === 'open' && info.deadline && Number.isFinite(Date.parse(info.deadline)) && (adesso || Date.now()) >= Date.parse(info.deadline)) st = 'playing';
        return st;
    }

    /** "2d 23h", "5h 12m", "12m", "now": il tempo che manca, scritto corto */
    function tempoCheManca(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return 'now';
        const min = Math.floor(ms / 60000);
        const g = Math.floor(min / 1440), o = Math.floor((min % 1440) / 60), m = min % 60;
        if (g > 0) return `${g}d ${o}h`;
        if (o > 0) return `${o}h ${m}m`;
        return `${Math.max(1, m)}m`;
    }

    const numeroDi = id => { const m = /(\d+)$/.exec(String(id)); return m ? Number(m[1]) : -1; };

    /**
     * Le stagioni divise per categoria. `elenco`: [{ id, info }] (le assenti si ignorano; la beta, sbeta, conta solo se non c'è altro).
     * Restituisce { past, playing, signups }: ognuna è un elenco di { id, info, nome, stato, mancano } (le iscrizioni dalla più vicina alla scadenza, le altre dalla più recente).
     */
    function raggruppa(elenco, adesso) {
        const ora = adesso || Date.now();
        const tutte = (elenco || []).filter(x => x && x.info).map(x => ({ id: x.id, info: x.info, stato: statoStagione(x.info, ora) }));
        const vere = tutte.filter(x => x.id !== 'sbeta');
        const lista = (vere.length ? vere : tutte).map(x => {
            const scad = Date.parse(x.info.deadline);
            return { ...x, nome: nomeStagione(x), mancano: x.stato === 'open' && Number.isFinite(scad) ? Math.max(0, scad - ora) : null };
        });
        const piuRecente = (a, b) => numeroDi(b.id) - numeroDi(a.id);
        return {
            past: lista.filter(x => x.stato === 'closed').sort(piuRecente),
            playing: lista.filter(x => x.stato === 'playing').sort(piuRecente),
            signups: lista.filter(x => x.stato === 'open').sort((a, b) => (Date.parse(a.info.deadline) || Infinity) - (Date.parse(b.info.deadline) || Infinity))
        };
    }

    function nomeStagione(s) { return (s.info && s.info.name) || `Season ${String(s.id).replace(/^s/, '')}`; }

    /** Dove porta una stagione: le iscrizioni all'hub (squadre e iscrizione), le altre a showdown e classifica */
    function indirizzo(gruppo, id) {
        return (gruppo === 'signups' ? 'hub.html?id=' : 'matches.html?id=') + encodeURIComponent(id);
    }

    /** La riga sotto il tag di una locandina: il nome se la stagione è una sola, altrimenti quante sono (o che non ce ne sono) */
    function sottoGruppo(id, lista) {
        const n = (lista || []).length;
        if (!n) return { past: 'None yet', playing: 'None right now', signups: 'None open' }[id];
        if (n === 1) return lista[0].nome;
        return { past: `${n} seasons`, playing: `${n} in progress`, signups: `${n} open` }[id];
    }

    /** La riga sotto una stagione nella scelta: chi ha vinto, cosa si sta giocando, quanto manca alle iscrizioni (e se ci si è già dentro) */
    function sottoStagione(gruppo, s, iscritto) {
        if (gruppo === 'past') return s.info && s.info.winner ? `${s.info.winner} won` : 'Season over';
        if (gruppo === 'signups') return (iscritto ? "You're in · " : '') + `Closes in ${tempoCheManca(s.mancano)}`;
        return 'Showdowns in progress';
    }

    // ---------- l'HTML ----------

    /** Le immagini da provare, in ordine, per una locandina */
    const immaginiDi = id => ['immagini/app/seasons-' + id + '.png', 'immagini/app/seasons-' + id + '.webp'];

    const arte = (id, i, bolla) => `<span class="pr-arte">${S.htmlScena(S.LOCANDINE_STAGIONI[id], { indice: i, scintille: 8, escF: esc, immagine: `<img class="pr-img" data-id="${id}" alt="" hidden>` })}${bolla ? `<i class="pr-bolla" aria-label="${bolla} to join">${bolla}</i>` : ''}</span>`;

    /**
     * La scelta iniziale: tre locandine affiancate. Una categoria senza stagioni è spenta; con una stagione sola il tocco porta dritto a lei;
     * `daIscrivere`: quante stagioni con le iscrizioni aperte non hanno ancora il giocatore (la bolla rossa sulla locandina).
     */
    function htmlHome(gruppi, { daIscrivere = 0 } = {}) {
        const g = gruppi || { past: [], playing: [], signups: [] };
        return '<div class="pr-home">' + GRUPPI.map((x, i) => {
            const lista = g[x.id] || [];
            const azione = !lista.length ? ' disabled' : lista.length === 1 ? ` data-vai="${esc(indirizzo(x.id, lista[0].id))}"` : ` data-vista="${x.id}"`;
            return `<button type="button" class="pr-poster pr-p-${x.id}${lista.length ? '' : ' pr-vuota'}"${azione} style="--c:${x.colore}; --i:${i}" data-suono="scegli">
                ${arte(x.id, i, x.id === 'signups' ? daIscrivere : 0)}
                <b class="pr-tag"><span>${esc(x.et)}</span></b><small class="pr-sotto-tag">${esc(sottoGruppo(x.id, lista))}</small>
            </button>`;
        }).join('') + '</div>';
    }

    /** Più stagioni in una categoria: si sceglie quale aprire, una locandina ciascuna (si scorre di lato se sono tante). `iscritto(id)`: il giocatore è già dentro? */
    function htmlScelta(idGruppo, lista, { iscritto } = {}) {
        const x = GRUPPI.find(k => k.id === idGruppo) || GRUPPI[0];
        const carte = (lista || []).map((s, i) => `<button type="button" class="pr-poster pr-stagione pr-p-${x.id}" data-vai="${esc(indirizzo(x.id, s.id))}" style="--c:${x.colore}; --i:${i}" data-suono="scegli">
                ${arte(x.id, i, 0)}
                <b class="pr-tag"><span>${esc(s.nome)}</span></b><small class="pr-sotto-tag">${esc(sottoStagione(x.id, s, iscritto ? iscritto(s.id) : false))}</small>
            </button>`).join('');
        return `<div class="pr-vista"><header class="pr-testa">
                <button type="button" class="pr-torna" data-vista="home" data-suono="indietro" aria-label="Back">${ICONA('indietro')}<span>Back</span></button>
                <h2>${esc(x.scelta)}</h2><span class="pr-sotto">Pick a season</span>
            </header>
            <div class="pr-home pr-home-scorre">${carte}</div></div>`;
    }

    const htmlCarico = () => '<div class="pr-carico" role="status"><i class="pr-ball" aria-hidden="true"></i><span>Loading…</span></div>';
    const htmlErrore = () => '<p class="pr-vuoto">Couldn\'t load the seasons. Check your connection and try again.</p>';

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        const pagina = doc && doc.getElementById('stagioni');
        if (!pagina || !doc.documentElement.classList.contains('app-shell')) return null;
        const db = () => win.firebase.database();
        const stato = { vista: 'home', gruppi: null, io: null, iscritti: {}, errore: false };

        const iscritto = id => (stato.iscritti[id] || []).some(n => idDi(n) === idDi(stato.io));
        const daIscrivere = () => (stato.io && stato.gruppi ? stato.gruppi.signups.filter(s => !iscritto(s.id)).length : 0);

        const caricaImmagini = () => {
            pagina.querySelectorAll('.pr-img').forEach(img => {
                const prove = immaginiDi(img.dataset.id);
                let k = 0;
                img.addEventListener('load', () => { img.hidden = false; img.closest('.pr-arte').classList.add('ha-immagine'); });
                img.addEventListener('error', () => { k += 1; if (k < prove.length) img.src = prove[k]; });
                img.src = prove[0];
            });
        };

        // se l'HTML è identico a quello già in pagina non si tocca niente (come in Play): un ridisegno inutile rifarebbe le locandine
        let ultimo = null;
        const metti = html => { if (html === ultimo) return false; ultimo = html; pagina.innerHTML = html; return true; };
        const disegna = () => {
            pagina.dataset.vista = stato.vista;
            if (stato.errore) { metti(htmlErrore()); return; }
            if (!stato.gruppi) { metti(htmlCarico()); return; }
            const lista = stato.gruppi[stato.vista];
            if (lista && lista.length > 1) { if (metti(htmlScelta(stato.vista, lista, { iscritto }))) caricaImmagini(); return; }
            stato.vista = 'home';
            if (metti(htmlHome(stato.gruppi, { daIscrivere: daIscrivere() }))) caricaImmagini();
        };

        const carica = async () => {
            if (!win.firebase || !win.firebase.apps || !win.firebase.apps.length) { stato.errore = true; disegna(); return; }
            try {
                const leggiInfo = id => db().ref('seasons/' + id + '/info').once('value').then(s => ({ id, info: s.val() })).catch(() => ({ id, info: null }));
                const trovate = [await leggiInfo('sbeta')];
                for (let da = 0; da < 200; da += 10) {
                    const blocco = await Promise.all(Array.from({ length: 10 }, (_, i) => leggiInfo('s' + (da + i))));
                    trovate.push(...blocco);
                    if (!blocco[blocco.length - 1].info) break;
                }
                stato.gruppi = raggruppa(trovate, Date.now());
                disegna();
                caricaIscritti();
            } catch (e) { stato.errore = true; disegna(); }
        };

        /** Chi è dentro alle stagioni con le iscrizioni aperte (per la bolla e per "You're in") */
        const caricaIscritti = async () => {
            if (!stato.io || !stato.gruppi) return;
            await Promise.all(stato.gruppi.signups.map(async s => {
                try { const v = (await db().ref('seasons/' + s.id + '/iscritti').once('value')).val(); stato.iscritti[s.id] = v ? Object.keys(v) : []; } catch (e) { stato.iscritti[s.id] = []; }
            }));
            ultimo = null;           // le bolle cambiano: si ridisegna una volta
            disegna();
        };

        pagina.addEventListener('click', e => {
            const el = e.target.closest ? e.target.closest('[data-vai],[data-vista]') : null;
            if (!el || el.disabled) return;
            if (el.dataset.vai) { win.location.href = el.dataset.vai; return; }
            stato.vista = el.dataset.vista;
            disegna();
        });

        if (win.firebase && win.firebase.apps && win.firebase.apps.length) {
            win.firebase.auth().onAuthStateChanged(async user => {
                const r = user && C ? await C.leggiGiocatore(win, user) : null;
                stato.io = r && r.giocatore ? r.giocatore.id : null;
                stato.iscritti = {};
                if (stato.gruppi) caricaIscritti(); else carica();
            });
        } else carica();
        disegna();
        return { stato };
    }

    return { GRUPPI, statoStagione, tempoCheManca, raggruppa, nomeStagione, indirizzo, sottoGruppo, sottoStagione, immaginiDi, htmlHome, htmlScelta, htmlCarico, htmlErrore, avvia };
});
