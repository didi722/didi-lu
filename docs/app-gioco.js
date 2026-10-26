/* =====================================================================
   L'INTERFACCIA DA GIOCO DELLE PAGINE — Poké-Tournament
   ---------------------------------------------------------------------
   Lo carica app.js solo quando il sito è aperto come app (icona sulla Home o APK), nelle pagine con l'interfaccia da gioco (tutte tranne menù, battaglia, accesso
   e amministrazione). Al posto dell'intestazione da sito per PC (striscia nera con i tre pallini, adesivo del titolo, tasto utente, tasti sparsi) mette quella
   di un gioco:
     - la barra in alto: il menù principale (la griglia; non c'è la freccia indietro: si torna sempre al menù), il titolo della pagina sul nastro del suo colore, e a destra campanella, battaglie
       (quelle di sempre, di sfide.js: qui si sistemano solo, in app-gioco.css) e il giocatore, che apre le impostazioni (le stesse del menù);
     - la barra si nasconde scorrendo verso il basso e torna scorrendo verso l'alto;
     - le pagine cambiano con una transizione (transizioni tra documenti, dove il browser le ha).
   La parte pura (titoli, direzione dello scorrimento) è provata in test/app-gioco.test.js; funziona nel browser (window.AppGioco) e in Node (require).
   ===================================================================== */
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const G = fabbrica(inNode ? require('./app-comune.js') : radice.AppComune, inNode ? require('./app.js') : radice.AppSito);
    if (inNode) module.exports = G;
    else {
        radice.AppGioco = G;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => G.avvia(radice)); else G.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (C, S) {
    'use strict';

    // il titolo delle pagine che non sono una tessera del menù (le altre prendono il nome della loro tessera)
    const TITOLI = { 'hub.html': 'Sign up', 'public.html': 'Trainer' };
    // il colore del nastro delle pagine che non sono una tessera del menù e non seguono quella da cui si arriva
    const COLORI = { 'hub.html': '#31c489' };
    // le pagine il cui titolo cambia con quello che si guarda (la stagione): il nastro porta il nome della tessera, accanto va quello della stagione
    const CON_SOTTOTITOLO = ['matches.html'];
    const CON_NOME_STAGIONE = ['hub.html'];
    const SOGLIA_SCORRIMENTO = 8;           // pixel di scorrimento che contano come "sta scorrendo"

    // ---------- parti pure ----------

    const nomePagina = percorso => S.nomePagina(percorso);

    /** Il nastro della barra: il nome della tessera del menù a cui appartiene la pagina; le pagine senza tessera (hub, pagina dell'allenatore) hanno il loro. */
    function titolo(pagina, testo) {
        const p = nomePagina(pagina);
        const voce = S.voceDi(p);
        if (TITOLI[p]) return TITOLI[p];
        if (voce && voce.href === p) return voce.et;
        const t = String(testo == null ? '' : testo).replace(/\s+/g, ' ').trim();
        if (t && t.length <= 28 && !/^loading/i.test(t)) return t;
        return (voce && voce.et) || 'Sant\'Alvise';
    }

    /** Quello che sta accanto al nastro (il nome della stagione guardata, in Matches), o '' */
    function sottotitolo(pagina, testo) {
        if (!CON_SOTTOTITOLO.includes(nomePagina(pagina))) return '';
        return sottotitoloDa(testo);
    }

    /** Il testo accanto al nastro, da un nome qualsiasi (ripulito; vuoto se manca o è troppo lungo) */
    function sottotitoloDa(testo) {
        const t = String(testo == null ? '' : testo).replace(/\s+/g, ' ').trim();
        return t && t.length <= 28 && !/^loading/i.test(t) ? t : '';
    }

    /** Il colore del nastro del titolo: quello della voce del menù a cui appartiene la pagina (il giallo del sito per le altre). */
    function coloreDi(pagina) {
        const voce = S.voceDi(pagina);
        return COLORI[nomePagina(pagina)] || (voce ? voce.colore : '#ffbd44');
    }

    /** L'iniziale per il tondino del giocatore ("?" se non c'è un nome). */
    function iniziale(nome) {
        const m = String(nome || '').match(/[0-9A-Za-zÀ-ÿ]/);
        return m ? m[0].toUpperCase() : '?';
    }

    /** Scorrendo verso il basso la barra si nasconde, verso l'alto torna; vicino alla cima c'è sempre. */
    function barraNascosta(precedente, attuale, nascostaOra) {
        if (attuale <= 24) return false;
        const d = attuale - precedente;
        if (Math.abs(d) < SOGLIA_SCORRIMENTO) return !!nascostaOra;
        return d > 0;
    }

    /** Le finestre del sito (team, Pokémon, classifica, accesso, iscrizione...): contenitori a tutto schermo che si aprono sopra la pagina. */
    const FINESTRE = '.modal, [id^="modal-"], [id$="Modal"], [id$="-overlay"], .format-modal-backdrop, .stats-modal, .ach-modal, .sfide-dropdown';
    const NON_FINESTRE = ['menu-overlay'];

    /** C'è una finestra del sito aperta? (visibile e a tutto schermo: `display` e `visibility` si leggono dallo stile calcolato) */
    function finestraAperta(doc, win) {
        for (const e of doc.querySelectorAll(FINESTRE)) {
            if (!e || NON_FINESTRE.includes(e.id) || (e.classList && e.classList.contains('gx-dialogo'))) continue;
            const cs = win.getComputedStyle(e);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position !== 'fixed' || Number(cs.opacity) === 0) continue;
            return true;
        }
        return false;
    }

    // ---------- la pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.body) return null;
        if (win.self !== win.top) return null;
        const html = doc.documentElement;
        if (!html.classList.contains('app-shell') || !C) return null;
        const pagina = nomePagina(win.location.pathname);
        const { svg } = C;

        const el = (tag, classe, dentro) => {
            const e = doc.createElement(tag);
            if (classe) e.className = classe;
            if (dentro != null) e.innerHTML = dentro;
            return e;
        };
        const nomeUtente = () => {
            const t = doc.getElementById('auth-text');
            const n = t ? t.textContent.trim() : '';
            return n && !/^login$/i.test(n) ? n : '';
        };

        // ----- la barra in alto -----
        const barra = el('header', 'gx-barra');
        barra.setAttribute('role', 'banner');
        html.style.setProperty('--gx-voce', coloreDi(pagina));          // il colore della pagina: quello della sua tessera nel menù (barra, sfondo, tasti)
        const casa = el('a', 'gx-tondo gx-casa', svg('casa'));
        casa.href = 'menu.html';
        casa.setAttribute('aria-label', 'Main menu');
        casa.setAttribute('data-suono', 'chiudi');
        const h1 = el('h1', 'gx-titolo-pagina', '<span></span><small></small>');
        const account = el('button', 'gx-tondo gx-account');
        account.type = 'button';
        account.setAttribute('aria-haspopup', 'dialog');
        account.setAttribute('data-suono', 'apri');
        barra.append(casa, h1, account);
        doc.body.appendChild(barra);

        // il titolo segue quello della pagina (alcune lo scrivono dopo aver caricato i dati)
        const originale = doc.querySelector('h1.hub-title-display, h1#hub-title-display');
        const scriviTitolo = () => {
            const testo = originale ? originale.textContent : '';
            h1.firstChild.textContent = titolo(pagina, testo);
            h1.lastChild.textContent = sottotitolo(pagina, testo);
        };
        scriviTitolo();
        if (originale && win.MutationObserver) new win.MutationObserver(scriviTitolo).observe(originale, { childList: true, characterData: true, subtree: true });
        // l'iscrizione non scrive il nome della stagione (la pagina ha solo "Season hub"): accanto al nastro lo si legge da Firebase
        if (CON_NOME_STAGIONE.includes(pagina)) {
            const id = (() => { try { return new win.URLSearchParams(win.location.search).get('id'); } catch (e) { return null; } })();
            let n = 0;
            const cerca = () => {
                if (!id) return;
                if (win.firebase && win.firebase.apps && win.firebase.apps.length) {
                    win.firebase.database().ref('seasons/' + id + '/info/name').once('value').then(v => { h1.lastChild.textContent = sottotitoloDa(v.val()); }).catch(() => { /* senza nome resta il solo nastro */ });
                } else if (++n < 60) win.setTimeout(cerca, 150);
            };
            cerca();
        }

        // ----- il giocatore: l'avatar nel tondino, il suo colore nel bordo -----
        let giocatore = null, admin = false;
        const aggiornaAccount = () => {
            const n = nomeUtente();
            account.classList.toggle('collegato', !!n);
            account.innerHTML = giocatore && giocatore.avatar
                ? '<img src="' + C.esc(giocatore.avatar) + '" alt="" onerror="this.remove()">'
                : n ? '<span>' + iniziale(n) + '</span>' : svg('utente');
            account.setAttribute('aria-label', n ? 'Settings: ' + n : 'Settings');
        };
        aggiornaAccount();
        const chip = doc.getElementById('auth-text');
        if (chip && win.MutationObserver) new win.MutationObserver(aggiornaAccount).observe(chip, { childList: true, characterData: true, subtree: true });
        const caricaGiocatore = user => {
            giocatore = null; admin = false;
            if (!user) { aggiornaAccount(); return; }
            C.leggiGiocatore(win, user).then(r => { if (r) { giocatore = r.giocatore; admin = r.admin; } aggiornaAccount(); });
        };
        if (win.firebase && win.firebase.apps && win.firebase.apps.length) win.firebase.auth().onAuthStateChanged(caricaGiocatore);

        // ----- le impostazioni (le stesse del menù): quello che dipende dalla pagina è il suono, l'accesso e l'uscita -----
        const musica = doc.getElementById('music-control');
        const leggiPref = () => { try { return win.localStorage.getItem(C.CHIAVE_SUONO); } catch (e) { return null; } };
        const opzioni = C.creaOpzioni(win, {
            suonoAcceso: () => (musica ? !musica.classList.contains('muted') : leggiPref() !== 'off'),
            cambiaSuono: () => { if (musica) musica.click(); else { try { win.localStorage.setItem(C.CHIAVE_SUONO, leggiPref() === 'off' ? 'on' : 'off'); } catch (e) { /* niente */ } } },
            utente: nomeUtente,
            admin: () => admin,
            accedi: () => { if (typeof win.handleAuthClick === 'function') win.handleAuthClick(); else if (typeof win.toggleLoginModal === 'function') win.toggleLoginModal(); },
            esci: () => { if (typeof win.logout === 'function') win.logout(); }
        });
        account.addEventListener('click', () => opzioni.apri());

        // ----- la barra si nasconde scorrendo verso il basso -----
        let ultimo = win.pageYOffset || 0, nascosta = false, ferma = false;
        win.addEventListener('scroll', () => {
            if (ferma) return;
            ferma = true;
            win.requestAnimationFrame(() => {
                ferma = false;
                const y = Math.max(0, win.pageYOffset || 0);
                const n = barraNascosta(ultimo, y, nascosta);
                if (Math.abs(y - ultimo) >= SOGLIA_SCORRIMENTO || y <= 24) ultimo = y;
                if (n !== nascosta) { nascosta = n; html.classList.toggle('gx-barra-nascosta', n); }
            });
        }, { passive: true });

        // ----- con una finestra del sito aperta (team, Pokémon, classifica...) la pagina dietro sta ferma -----
        let controllo = false;
        const segnaFinestre = () => {
            if (controllo) return;
            controllo = true;
            win.requestAnimationFrame(() => { controllo = false; html.classList.toggle('gx-dialogo-aperto', finestraAperta(doc, win)); });
        };
        if (win.MutationObserver) new win.MutationObserver(segnaFinestre).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
        segnaFinestre();

        // ----- le pagine cambiano con una transizione (dove il browser sa farla) -----
        const stile = doc.createElement('style');
        stile.textContent = '@view-transition { navigation: auto; }';
        doc.head.appendChild(stile);

        return { barra, opzioni };
    }

    return { TITOLI, COLORI, CON_SOTTOTITOLO, CON_NOME_STAGIONE, SOGLIA_SCORRIMENTO, FINESTRE, finestraAperta, nomePagina, titolo, sottotitolo, sottotitoloDa, coloreDi, iniziale, barraNascosta, avvia };
});
