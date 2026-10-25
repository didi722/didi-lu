/* =====================================================================
   LO SCHELETRO DA TELEFONO — Poké-Tournament
   ---------------------------------------------------------------------
   Lo carica app.js solo quando il sito è aperto come app (icona sulla Home o APK), nelle pagine con la barra in basso. Al posto dell'intestazione
   da sito per PC (striscia nera con i tre pallini, adesivo del titolo, tasto utente, tasti sparsi) mette quella che si usa col pollice:
     - la barra in alto: indietro (o il logo), il titolo della pagina, e a destra campanella, battaglie e account;
       campanella e battaglie sono quelle di sempre (sfide.js): qui si sistemano solo (app.css);
     - il foglio dell'account (si apre dal tasto a destra): chi sei, le pagine che non stanno nella barra in basso, suono, ricarica, esci;
     - le finestre del sito (login, squadre, partite...) salgono dal basso come fogli e si chiudono trascinandole giù;
     - la barra in alto si nasconde scorrendo verso il basso e torna scorrendo verso l'alto;
     - le pagine cambiano con una dissolvenza (transizioni tra documenti, dove il browser le ha).
   La parte pura (titoli, voci del menù, direzione dello scorrimento, trascinamento) è provata in test/app-shell.test.js; funziona nel browser
   (window.AppShell) e in Node (require).
   ===================================================================== */
(function (radice, fabbrica) {
    const S = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = S;
    else {
        radice.AppShell = S;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => S.avvia(radice)); else S.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // le pagine "di primo livello" (stanno nella barra in basso): lì al posto della freccia indietro c'è il logo
    const RADICI = ['index.html', 'matches.html', 'box.html', 'players.html', 'stats.html'];
    // quando la pagina non ha un titolo suo
    const TITOLI = {
        'index.html': 'Season hub', 'hub.html': 'Season hub', 'matches.html': 'Matches', 'box.html': 'My box', 'players.html': 'Trainers', 'stats.html': 'Stats',
        'profile.html': 'Profile', 'formats.html': 'Formats', 'rules.html': 'Rulebook', 'palmares.html': 'Archive', 'public.html': 'Trainer'
    };
    // le voci del menù del sito che nell'app stanno già nella barra in basso
    const NELLA_BARRA = ['index.html', 'matches.html', 'box.html', 'players.html', 'stats.html'];
    const SOGLIA_SCORRIMENTO = 8;           // pixel di scorrimento che contano come "sta scorrendo"
    const DISTANZA_CHIUSURA = 110;          // pixel da trascinare giù per chiudere un foglio
    const VELOCITA_CHIUSURA = 0.6;          // oppure un colpo di dito veloce (pixel per millisecondo)

    // le pagine lunghe divise in schede (una sezione alla volta): contenitore, sezioni e nome breve di ciascuna
    const SCHEDE = {
        'profile.html': {
            contenitore: 'main.pf-main', sezioni: ':scope > section[id]',
            nomi: { 'pf-todo': 'To do', 'pf-rivali': 'Rivals', 'pf-personalita': 'Personality', 'pf-tema': 'Theme' }
        }
    };

    // ---------- parti pure ----------

    const nomePagina = percorso => {
        const ultimo = String(percorso || '').split('?')[0].split('#')[0].split('/').pop().toLowerCase();
        return ultimo || 'index.html';
    };
    const èRadice = pagina => RADICI.includes(nomePagina(pagina));

    /** Il titolo della barra: quello scritto nella pagina (spazi ripuliti), altrimenti quello della sezione. */
    function titolo(pagina, testo) {
        const t = String(testo == null ? '' : testo).replace(/\s+/g, ' ').trim();
        if (t && t.length <= 40) return t;
        return TITOLI[nomePagina(pagina)] || 'Sant\'Alvise';
    }

    /** L'iniziale per il tondino dell'account ("?" se non c'è un nome). */
    function iniziale(nome) {
        const m = String(nome || '').match(/[0-9A-Za-zÀ-ÿ]/);
        return m ? m[0].toUpperCase() : '?';
    }

    /**
     * Le voci del foglio dell'account, prese dal menù del sito: senza quelle già nella barra in basso, con l'amministrazione solo se l'account la vede.
     * `voci`: [{ href, etichetta, icona, nascosta }]. Il resto (esci) non è un link e lo gestisce il foglio.
     */
    function vociMenu(voci) {
        return (voci || [])
            .filter(v => v && v.href && !v.nascosta && !NELLA_BARRA.includes(nomePagina(v.href)))
            .map(v => ({ href: v.href, etichetta: String(v.etichetta || '').replace(/\s+/g, ' ').trim(), icona: v.icona || '' }));
    }

    /** Quale scheda mostrare all'apertura: quella nominata nell'indirizzo (#id), altrimenti l'ultima scelta in questa visita, altrimenti la prima. */
    function schedaIniziale(ids, indirizzo, salvata) {
        const lista = Array.isArray(ids) ? ids : [];
        const h = String(indirizzo || '').replace(/^#/, '');
        if (h && lista.includes(h)) return h;
        if (salvata && lista.includes(salvata)) return salvata;
        return lista[0] || '';
    }

    /** Il nome sul tasto di una scheda: quello scelto per la pagina, altrimenti il titolo della sezione (spazi ripuliti, prima lettera maiuscola). */
    function nomeScheda(id, titoloSezione, nomi) {
        const scelto = nomi && nomi[id];
        if (scelto) return scelto;
        const t = String(titoloSezione || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return t ? t.charAt(0).toUpperCase() + t.slice(1) : String(id || '');
    }

    /** Scorrendo verso il basso la barra si nasconde, verso l'alto torna; vicino alla cima c'è sempre. */
    function barraNascosta(precedente, attuale, nascostaOra) {
        if (attuale <= 24) return false;
        const d = attuale - precedente;
        if (Math.abs(d) < SOGLIA_SCORRIMENTO) return !!nascostaOra;
        return d > 0;
    }

    /** Un foglio trascinato verso il basso si chiude se è stato tirato abbastanza o in fretta. `dy`: pixel, `ms`: durata del gesto. */
    function chiudeTrascinando(dy, ms) {
        if (dy <= 0) return false;
        return dy >= DISTANZA_CHIUSURA || (dy >= 40 && dy / Math.max(1, ms) >= VELOCITA_CHIUSURA);
    }

    // ---------- la pagina ----------

    const ICONE = {
        indietro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
        utente: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.4 7.5-6.4s7.5 2.4 7.5 6.4"/></svg>',
        chiudi: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>',
        suono: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
        ricarica: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
        esci: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4"/><path d="M9 12h10"/></svg>'
    };

    // le finestre del sito che salgono dal basso: il foglio è il contenuto, lo "scuro" dietro è il velo (vedi app.css, sezione "fogli")
    const FOGLI = [
        '#login-modal .modal-content', '#modal-iscrizione', '#modalCreazione', '#modal-select-team', '#modal-registered-teams > *', '#modal-rank-details-content',
        '#sd-modal-overlay.active .sd-finestra', '#teamModal .modal-content', '#pkmDetailModal .modal-content', '#sfida-overlay > *', '.stats-modal-contenuto',
        '.stats-modal > *', '.ach-modal', '#helper-modal-overlay .format-modal-wrapper', '#format-modal-overlay > *', '#format-modal .format-modal-content',
        '.sfide-dropdown', '.app-foglio'
    ];
    // i contenitori scuri che stanno dietro a un foglio (dentro c'è il tasto per chiuderlo) e i tasti che chiudono, in ordine di preferenza
    const SFONDI = '#login-modal, #modal-iscrizione, #modalCreazione, #modal-select-team, #modal-registered-teams, #modal-rank-details, #sd-modal-overlay, #teamModal, #pkmDetailModal, ' +
        '#sfida-overlay, #stats-modal, #ach-overlay, #helper-modal-overlay, #format-modal-overlay, #format-modal, .app-foglio, .sfide-dropdown';
    const CHIUDI = '.close-modal, .iscr-chiudi, .close-modal-btn, .cl-chiudi, .sd-chiudi, .close-replay, .stats-modal-chiudi, .ach-close, .format-close-btn, .fmt-chiudi, ' +
        '.mvp-x, .app-foglio-chiudi, #teamModal .close, #pkmDetailModal .close, .btn-cancel, .sfida-annulla';

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.body) return null;
        if (win.self !== win.top) return null;
        const html = doc.documentElement;
        if (!html.classList.contains('app-shell')) return null;
        const pagina = nomePagina(win.location.pathname);

        const el = (tag, classe, html_) => {
            const e = doc.createElement(tag);
            if (classe) e.className = classe;
            if (html_ != null) e.innerHTML = html_;
            return e;
        };
        const nomeUtente = () => {
            const t = doc.getElementById('auth-text');
            const n = t ? t.textContent.trim() : '';
            return n && !/^login$/i.test(n) ? n : '';
        };

        // ----- la barra in alto -----
        const barra = el('header', 'app-bar');
        barra.setAttribute('role', 'banner');
        const sinistra = èRadice(pagina)
            ? el('a', 'app-bar-logo', '<img src="immagini/app/icon-192.png" alt="" width="34" height="34">')
            : el('button', 'app-bar-indietro', ICONE.indietro);
        if (sinistra.tagName === 'A') { sinistra.href = 'index.html'; sinistra.setAttribute('aria-label', 'Home'); }
        else {
            sinistra.type = 'button';
            sinistra.setAttribute('aria-label', 'Back');
            sinistra.addEventListener('click', () => { if (win.history.length > 1) win.history.back(); else win.location.href = 'index.html'; });
        }
        const h1 = el('h1', 'app-bar-titolo');
        const account = el('button', 'app-bar-utente');
        account.type = 'button';
        account.setAttribute('aria-haspopup', 'dialog');
        barra.append(sinistra, h1, account);
        doc.body.appendChild(barra);

        const originale = doc.querySelector('h1.hub-title-display');
        const scriviTitolo = () => { h1.textContent = titolo(pagina, originale ? originale.textContent : ''); };
        scriviTitolo();
        if (originale && win.MutationObserver) new win.MutationObserver(scriviTitolo).observe(originale, { childList: true, characterData: true, subtree: true });

        const aggiornaAccount = () => {
            const n = nomeUtente();
            account.classList.toggle('collegato', !!n);
            account.innerHTML = n ? '<span>' + iniziale(n) + '</span>' : ICONE.utente;
            account.setAttribute('aria-label', n ? 'Account: ' + n : 'Log in');
        };
        aggiornaAccount();
        const chip = doc.getElementById('auth-text');
        if (chip && win.MutationObserver) new win.MutationObserver(aggiornaAccount).observe(chip, { childList: true, characterData: true, subtree: true });

        // ----- il foglio dell'account -----
        const velo = el('div', 'app-velo');
        const foglio = el('section', 'app-foglio app-menu');
        foglio.setAttribute('role', 'dialog');
        foglio.setAttribute('aria-label', 'Account');
        doc.body.append(velo, foglio);
        let aperto = false;

        const vociDelSito = () => Array.from(doc.querySelectorAll('#user-menu a.menu-item')).map(a => {
            const i = a.querySelector('i');
            return { href: a.getAttribute('href'), etichetta: a.textContent, icona: i ? i.className : '', nascosta: win.getComputedStyle(a).display === 'none' };
        });
        const musica = doc.getElementById('music-control');
        const suonoAcceso = () => !!musica && !musica.classList.contains('muted');

        const disegnaFoglio = () => {
            const n = nomeUtente();
            const tessere = vociMenu(vociDelSito()).map(v =>
                '<a class="app-tessera" href="' + v.href + '"><i class="' + v.icona + '" aria-hidden="true"></i><span>' + v.etichetta + '</span></a>').join('');
            const azioni = (musica ? '<button type="button" class="app-tessera" data-azione="suono">' + ICONE.suono + '<span>Sound <b>' + (suonoAcceso() ? 'on' : 'off') + '</b></span></button>' : '') +
                '<button type="button" class="app-tessera" data-azione="ricarica">' + ICONE.ricarica + '<span>Refresh</span></button>';
            foglio.innerHTML =
                '<div class="app-foglio-maniglia" aria-hidden="true"></div>' +
                '<div class="app-menu-intesta">' +
                    (n ? '<span class="app-avatar">' + iniziale(n) + '</span><div class="app-menu-nome"><b>' + n.replace(/[<>&]/g, '') + '</b><small>Signed in</small></div>'
                        : '<span class="app-avatar">' + ICONE.utente + '</span><div class="app-menu-nome"><b>Welcome</b><small>Log in to play and vote</small></div>') +
                    '<button type="button" class="app-foglio-chiudi" aria-label="Close">' + ICONE.chiudi + '</button>' +
                '</div>' +
                '<div class="app-menu-griglia">' + tessere + azioni + '</div>' +
                (n ? '<button type="button" class="app-menu-esci" data-azione="esci">' + ICONE.esci + '<span>Log out</span></button>'
                    : '<button type="button" class="app-menu-entra" data-azione="entra"><span>Log in</span></button>');
        };

        const apri = () => {
            if (aperto) return;
            disegnaFoglio();
            aperto = true;
            velo.classList.add('aperto');
            foglio.classList.add('aperto');
            html.classList.add('app-foglio-aperto');
            try { win.history.pushState({ appFoglio: 1 }, ''); } catch (e) { /* senza cronologia: si chiude con il velo */ }
        };
        const chiudi = (daIndietro) => {
            if (!aperto) return;
            aperto = false;
            velo.classList.remove('aperto');
            foglio.classList.remove('aperto');
            foglio.style.translate = '';
            html.classList.remove('app-foglio-aperto');
            if (!daIndietro && win.history.state && win.history.state.appFoglio) { try { win.history.back(); } catch (e) { /* niente */ } }
        };
        win.addEventListener('popstate', () => { if (aperto) chiudi(true); });
        velo.addEventListener('click', () => chiudi());
        doc.addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(); });

        account.addEventListener('click', () => {
            if (nomeUtente()) apri();
            else if (typeof win.handleAuthClick === 'function') win.handleAuthClick();     // apre il login del sito
            else if (typeof win.toggleLoginModal === 'function') win.toggleLoginModal();
        });
        foglio.addEventListener('click', e => {
            const x = e.target.closest ? e.target.closest('[data-azione], .app-foglio-chiudi, a.app-tessera') : null;
            if (!x) return;
            if (x.matches('.app-foglio-chiudi')) return chiudi();
            if (x.tagName === 'A') {                                                        // prima si toglie dalla cronologia il foglio, poi si va: indietro non lo riapre
                const href = x.getAttribute('href');
                if (!(win.history.state && win.history.state.appFoglio)) return;
                e.preventDefault();
                win.addEventListener('popstate', () => { win.location.href = href; }, { once: true });
                win.history.back();
                return;
            }
            const azione = x.getAttribute('data-azione');
            if (azione === 'suono' && musica) { musica.click(); disegnaFoglio(); }
            else if (azione === 'ricarica') win.location.reload();
            else if (azione === 'esci' && typeof win.logout === 'function') win.logout();
            else if (azione === 'entra') { chiudi(); if (typeof win.handleAuthClick === 'function') win.handleAuthClick(); }
        });

        // ----- la barra in alto si nasconde scorrendo verso il basso -----
        let ultimo = win.pageYOffset || 0, nascosta = false, ferma = false;
        win.addEventListener('scroll', () => {
            if (ferma) return;
            ferma = true;
            win.requestAnimationFrame(() => {
                ferma = false;
                const y = Math.max(0, win.pageYOffset || 0);
                const n = barraNascosta(ultimo, y, nascosta);
                if (Math.abs(y - ultimo) >= SOGLIA_SCORRIMENTO || y <= 24) ultimo = y;
                if (n !== nascosta) { nascosta = n; html.classList.toggle('app-bar-nascosta', n); }
            });
        }, { passive: true });

        // ----- le pagine lunghe a schede: una sezione alla volta, con i tasti sotto la barra -----
        const schede = creaSchede(win, doc, pagina, el);

        // ----- i fogli si chiudono trascinandoli giù -----
        abilitaTrascinamento(win, doc, foglio, chiudi);

        // ----- le pagine cambiano con una dissolvenza (dove il browser sa farlo) -----
        const stile = doc.createElement('style');
        stile.textContent = '@view-transition { navigation: auto; }';
        doc.head.appendChild(stile);

        return { barra, foglio, apri, chiudi, schede };
    }

    /** Divide in schede le pagine lunghe (SCHEDE): i tasti stanno sotto la barra in alto, la scheda scelta resta per la visita e si può nominare nell'indirizzo (#id). */
    function creaSchede(win, doc, pagina, el) {
        const conf = SCHEDE[pagina];
        if (!conf) return null;
        const contenitore = doc.querySelector(conf.contenitore);
        if (!contenitore) return null;
        const sezioni = Array.from(contenitore.querySelectorAll(conf.sezioni));
        if (sezioni.length < 2) return null;
        const chiave = 'app-scheda:' + pagina;
        const leggi = () => { try { return win.sessionStorage.getItem(chiave) || ''; } catch (e) { return ''; } };
        const scrivi = id => { try { win.sessionStorage.setItem(chiave, id); } catch (e) { /* senza memoria si riparte dalla prima */ } };

        const nav = el('nav', 'app-schede');
        nav.setAttribute('role', 'tablist');
        const tasti = sezioni.map(sez => {
            const t = sez.querySelector('h2');
            const b = el('button', 'app-scheda-tasto');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.dataset.scheda = sez.id;
            b.textContent = nomeScheda(sez.id, t ? t.textContent : '', conf.nomi);
            nav.appendChild(b);
            return b;
        });
        contenitore.parentNode.insertBefore(nav, contenitore);

        const ids = sezioni.map(sez => sez.id);
        const mostra = (id, scorri) => {
            if (!ids.includes(id)) return;
            sezioni.forEach(sez => sez.classList.toggle('app-scheda-attiva', sez.id === id));
            tasti.forEach(b => { const on = b.dataset.scheda === id; b.classList.toggle('attivo', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
            scrivi(id);
            if (scorri) {
                // la nuova scheda parte dall'inizio: se la pagina era scesa oltre l'inizio del contenuto (i tasti restano fermi sotto la barra), si risale lì
                const barra = parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--app-bar-h')) || 56;
                const alto = contenitore.getBoundingClientRect().top + win.scrollY - barra - (nav.offsetHeight || 0);
                if (win.scrollY > alto) win.scrollTo(0, Math.max(0, alto));
            }
        };
        nav.addEventListener('click', e => {
            const b = e.target.closest ? e.target.closest('.app-scheda-tasto') : null;
            if (b) mostra(b.dataset.scheda, true);
        });
        // un collegamento a una sezione (#pf-tema) apre la sua scheda
        const daIndirizzo = () => { const id = String(win.location.hash || '').replace(/^#/, ''); if (ids.includes(id)) mostra(id, true); };
        win.addEventListener('hashchange', daIndirizzo);
        doc.addEventListener('click', e => {
            const a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
            const id = a ? a.getAttribute('href').slice(1) : '';
            if (ids.includes(id)) { e.preventDefault(); mostra(id, true); }
        });
        mostra(schedaIniziale(ids, win.location.hash, leggi()), false);
        return { nav, mostra };
    }

    function abilitaTrascinamento(win, doc, foglioAccount, chiudiAccount) {
        let foglio = null, y0 = 0, t0 = 0, dy = 0, attivo = false;
        const trovaFoglio = bersaglio => {
            for (const sel of FOGLI) {
                const f = bersaglio.closest ? bersaglio.closest(sel) : null;
                if (f) return f;
            }
            return null;
        };
        const scorreAncora = da => {      // qualcosa (il foglio, il suo contenitore, un elenco dentro) che scorre ancora in su: il gesto è suo
            for (let n = da; n && n.nodeType === 1 && n !== doc.body && n !== doc.documentElement; n = n.parentElement) if (n.scrollTop > 0) return true;
            return false;
        };
        doc.addEventListener('touchstart', e => {
            foglio = null; attivo = false; dy = 0;
            if (e.touches.length !== 1) return;
            const f = trovaFoglio(e.target);
            if (!f || scorreAncora(e.target)) return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            foglio = f; y0 = e.touches[0].clientY; t0 = Date.now();
        }, { passive: true });
        doc.addEventListener('touchmove', e => {
            if (!foglio) return;
            dy = e.touches[0].clientY - y0;
            if (dy <= 6) { if (attivo) foglio.style.translate = ''; attivo = false; return; }
            if (scorreAncora(e.target)) { foglio = null; return; }
            attivo = true;
            foglio.style.transition = 'none';
            foglio.style.translate = '0 ' + dy + 'px';
        }, { passive: true });
        const fine = () => {
            if (!foglio) return;
            const f = foglio; foglio = null;
            f.style.transition = '';
            if (!attivo) return;
            attivo = false;
            if (chiudeTrascinando(dy, Date.now() - t0)) {
                if (f === foglioAccount) { chiudiAccount(); return; }
                f.style.translate = '';
                const sfondo = f.closest(SFONDI) || f.parentElement || f;
                const x = Array.from(sfondo.querySelectorAll(CHIUDI)).find(b => b.offsetParent !== null || (b.getClientRects && b.getClientRects().length));
                if (x) x.click();
            } else f.style.translate = '';
        };
        doc.addEventListener('touchend', fine, { passive: true });
        doc.addEventListener('touchcancel', fine, { passive: true });
    }

    return { RADICI, TITOLI, NELLA_BARRA, FOGLI, DISTANZA_CHIUSURA, nomePagina, èRadice, titolo, iniziale, vociMenu, barraNascosta, chiudeTrascinando, schedaIniziale, nomeScheda, SCHEDE, creaSchede, avvia };
});
