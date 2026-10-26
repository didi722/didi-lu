/* =====================================================================
   L'INTERFACCIA DA GIOCO DELLE PAGINE — Poké-Tournament
   ---------------------------------------------------------------------
   Lo carica app.js solo quando il sito è aperto come app (icona sulla Home o APK), nelle pagine con l'interfaccia da gioco (tutte tranne menù, battaglia, accesso
   e amministrazione). Al posto dell'intestazione da sito per PC (striscia nera con i tre pallini, adesivo del titolo, tasto utente, tasti sparsi) mette quella
   di un gioco:
     - la barra in alto: indietro, il menù principale (la griglia), il titolo della pagina sul nastro del suo colore, e a destra campanella, battaglie
       (quelle di sempre, di sfide.js: qui si sistemano solo, in app-gioco.css) e il giocatore, che apre le impostazioni (le stesse del menù);
     - la barra si nasconde scorrendo verso il basso e torna scorrendo verso l'alto;
     - le pagine lunghe divise in schede (il Profilo): una sezione alla volta, con i tasti di fianco;
     - le pagine cambiano con una transizione (transizioni tra documenti, dove il browser le ha).
   La parte pura (titoli, direzione dello scorrimento, schede) è provata in test/app-gioco.test.js; funziona nel browser (window.AppGioco) e in Node (require).
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
    const TITOLI = { 'hub.html': 'Season hub', 'public.html': 'Trainer' };
    // le pagine il cui titolo cambia con quello che si guarda (la stagione): il nastro porta il nome della tessera, accanto va quello della stagione
    const CON_SOTTOTITOLO = ['matches.html'];
    const SOGLIA_SCORRIMENTO = 8;           // pixel di scorrimento che contano come "sta scorrendo"

    // le pagine lunghe divise in schede (una sezione alla volta): contenitore, sezioni e nome breve di ciascuna
    const SCHEDE = {
        'profile.html': {
            contenitore: 'main.pf-main', sezioni: ':scope > section[id]', testa: 'section.hub-hero',
            nomi: { 'pf-todo': 'To do', 'pf-rivali': 'Rivals', 'pf-personalita': 'Personality', 'pf-tema': 'Theme' }
        }
    };

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
        const t = String(testo == null ? '' : testo).replace(/\s+/g, ' ').trim();
        return t && t.length <= 28 && !/^loading/i.test(t) ? t : '';
    }

    /** Il colore del nastro del titolo: quello della voce del menù a cui appartiene la pagina (il giallo del sito per le altre). */
    function coloreDi(pagina) {
        const voce = S.voceDi(pagina);
        return voce ? voce.colore : '#ffbd44';
    }

    /** L'iniziale per il tondino del giocatore ("?" se non c'è un nome). */
    function iniziale(nome) {
        const m = String(nome || '').match(/[0-9A-Za-zÀ-ÿ]/);
        return m ? m[0].toUpperCase() : '?';
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
        const indietro = el('button', 'gx-tondo gx-indietro', svg('indietro'));
        indietro.type = 'button';
        indietro.setAttribute('aria-label', 'Back');
        indietro.setAttribute('data-suono', 'indietro');
        indietro.addEventListener('click', () => { if (win.history.length > 1) win.history.back(); else win.location.href = 'menu.html'; });
        const casa = el('a', 'gx-tondo gx-casa', svg('casa'));
        casa.href = 'menu.html';
        casa.setAttribute('aria-label', 'Main menu');
        casa.setAttribute('data-suono', 'chiudi');
        const h1 = el('h1', 'gx-titolo-pagina', '<span></span><small></small>');
        const account = el('button', 'gx-tondo gx-account');
        account.type = 'button';
        account.setAttribute('aria-haspopup', 'dialog');
        account.setAttribute('data-suono', 'apri');
        barra.append(indietro, casa, h1, account);
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

        // ----- il giocatore: l'avatar nel tondino, il suo colore nel bordo -----
        let giocatore = null, admin = false;
        const aggiornaAccount = () => {
            const n = nomeUtente();
            account.classList.toggle('collegato', !!n);
            if (giocatore && giocatore.colore) account.style.setProperty('--gx-giocatore', giocatore.colore); else account.style.removeProperty('--gx-giocatore');
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

        // ----- le pagine lunghe a schede: una sezione alla volta, con i tasti di fianco -----
        const schede = creaSchede(win, doc, pagina, el);

        // ----- le pagine cambiano con una transizione (dove il browser sa farla) -----
        const stile = doc.createElement('style');
        stile.textContent = '@view-transition { navigation: auto; }';
        doc.head.appendChild(stile);

        return { barra, opzioni, schede };
    }

    /** Divide in schede le pagine lunghe (SCHEDE): i tasti stanno di fianco, la scheda scelta resta per la visita e si può nominare nell'indirizzo (#id). */
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

        const nav = el('nav', 'gx-schede');
        nav.setAttribute('role', 'tablist');
        const tasti = sezioni.map(sez => {
            const t = sez.querySelector('h2');
            const b = el('button', 'gx-scheda-tasto');
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.setAttribute('data-suono', 'scegli');
            b.dataset.scheda = sez.id;
            b.textContent = nomeScheda(sez.id, t ? t.textContent : '', conf.nomi);
            nav.appendChild(b);
            return b;
        });
        // a sinistra le schede, a destra la striscia delle scorciatoie (se la pagina ne ha) e la scheda scelta
        const testa = conf.testa ? doc.querySelector(conf.testa) : null;
        const quadro = el('div', 'gx-con-schede');
        const corpo = el('div', 'gx-schede-corpo');
        contenitore.parentNode.insertBefore(quadro, testa && testa.parentNode === contenitore.parentNode ? testa : contenitore);
        quadro.append(nav, corpo);
        if (testa && testa.parentNode !== corpo) corpo.appendChild(testa);
        corpo.appendChild(contenitore);

        const ids = sezioni.map(sez => sez.id);
        const mostra = (id, scorri) => {
            if (!ids.includes(id)) return;
            sezioni.forEach(sez => sez.classList.toggle('gx-scheda-attiva', sez.id === id));
            tasti.forEach(b => { const on = b.dataset.scheda === id; b.classList.toggle('attivo', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
            scrivi(id);
            if (scorri) win.scrollTo(0, 0);
        };
        nav.addEventListener('click', e => {
            const b = e.target.closest ? e.target.closest('.gx-scheda-tasto') : null;
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

    return { TITOLI, CON_SOTTOTITOLO, SCHEDE, SOGLIA_SCORRIMENTO, nomePagina, titolo, sottotitolo, coloreDi, iniziale, schedaIniziale, nomeScheda, barraNascosta, creaSchede, avvia };
});
