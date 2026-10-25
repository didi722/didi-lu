/* =====================================================================
   IL SITO COME APP — Poké-Tournament
   ---------------------------------------------------------------------
   Il sito si può usare come app in tre modi, e questo file è uguale per tutti:
     - "installata": aperto dall'icona sulla schermata Home (iPhone: Condividi > Aggiungi a Home; Android: Installa app). Si riconosce da
       display-mode: standalone (e da navigator.standalone su iOS);
     - "apk": dentro l'app Android costruita con Capacitor (android-apk.yml): il suo user agent finisce con SantAlviseApp;
     - nel browser: tutto come prima, tranne un invito a installare (una volta, sulla home, dal telefono).
   Come app (installata o apk) la pagina prende la classe "app" su <html> e compaiono i ritocchi di app.css:
     - lo scheletro da telefono (app-shell.js + app.css): barra in alto compatta, foglio dell'account, finestre che salgono dal basso;
     - la barra in basso (Home, Matches, Box, Trainers, Stats);
     - "tira per aggiornare" (nelle app non c'è il tasto Ricarica; non nelle pagine dove si modifica qualcosa, né in battaglia);
     - niente selezione e menu di tocco prolungato sui pulsanti, nessun ritardo e zoom al doppio tocco.
   Per vedere l'aspetto da app nel browser (anche da PC): aggiungi ?app=1 a un indirizzo del sito; ?app=0 per tornare indietro.
   Non fa niente dentro un altro frame (il Box incorporato nel simulatore). Le parti pure (riconoscimento, quale voce è attiva...) sono provate in
   test/app.test.js; funziona nel browser (window.AppSito) e in Node (require).
   ===================================================================== */
(function (radice, fabbrica) {
    const A = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = A;
    else {
        radice.AppSito = A;
        if (radice.document) A.avvia(radice);
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TOKEN_APK = 'SantAlviseApp';                 // lo aggiunge l'APK allo user agent (capacitor.config.json: android.appendUserAgent)
    const CHIAVE_FORZATA = 'appForzata';               // ?app=1 / ?app=0, ricordato in questo browser
    const CHIAVE_INVITO = 'invitoApp';                 // quando si è chiuso l'invito a installare
    const GIORNI_INVITO = 14;                          // dopo averlo chiuso, l'invito torna dopo tanti giorni
    const DISTANZA_TIRA = 90;                          // pixel da tirare giù per aggiornare

    // le pagine dove la barra non serve (battaglia a schermo intero, accesso, modello vuoto, pannello dell'amministratore)
    const SENZA_BARRA = ['battle.html', 'login.html', 'schermata-base-vuota.html', 'admin.html'];
    // le pagine dove tirare per aggiornare è innocuo: dove si modifica qualcosa (Box, profilo, pagina pubblica, amministrazione) o si gioca si ricarica col solo tasto
    const CON_TIRA = ['index.html', 'matches.html', 'hub.html', 'players.html', 'stats.html', 'palmares.html', 'rules.html', 'formats.html'];

    // I cinque punti della barra. `pagine`: le pagine che la tengono accesa (le altre, come Profile o Archive, si aprono dal foglio dell'account in alto:
    // app-shell.js).
    const ICONE = {
        home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
        matches: '<path d="M5 19 19 5"/><path d="M19 19 5 5"/><path d="M14.5 5H19v4.5"/><path d="M9.5 5H5v4.5"/>',
        box: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5"/><path d="M12 12 4 7.5"/><path d="M12 12v9"/>',
        trainers: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.6 14.3c2.9.3 4.9 2 4.9 5.2"/>',
        stats: '<path d="M5 20v-9"/><path d="M12 20V4"/><path d="M19 20v-6"/>'
    };
    const VOCI = [
        { id: 'home', et: 'Home', href: 'index.html', pagine: ['index.html', 'hub.html'] },
        { id: 'matches', et: 'Matches', href: 'matches.html', pagine: ['matches.html'] },
        { id: 'box', et: 'Box', href: 'box.html', pagine: ['box.html'] },
        { id: 'trainers', et: 'Trainers', href: 'players.html', pagine: ['players.html'] },
        { id: 'stats', et: 'Stats', href: 'stats.html', pagine: ['stats.html'] }
    ];

    // ---------- parti pure ----------

    /** Il nome del file della pagina: "/didi-lu/Matches.html" -> "matches.html"; la radice è la home. */
    function nomePagina(percorso) {
        const ultimo = String(percorso || '').split('?')[0].split('#')[0].split('/').pop().toLowerCase();
        return ultimo || 'index.html';
    }

    /**
     * Com'è aperto il sito: 'apk' (app Android), 'installata' (icona sulla schermata Home) o '' (browser).
     * env: { ua, standalone (matchMedia display-mode), iosStandalone (navigator.standalone), referrer, forzata ('1' | '0' | '') }
     */
    function modoApp(env) {
        const e = env || {};
        if (String(e.ua || '').includes(TOKEN_APK)) return 'apk';         // nell'APK l'aspetto da app non si toglie
        if (e.forzata === '0') return '';
        if (e.forzata === '1') return 'installata';
        if (e.standalone || e.iosStandalone || /^android-app:\/\//.test(String(e.referrer || ''))) return 'installata';
        return '';
    }

    /** 'ios' (anche iPad che si spaccia per Mac), 'android' o '' */
    function sistema(ua, puntiDiTocco) {
        const u = String(ua || '');
        if (/iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && Number(puntiDiTocco) > 1)) return 'ios';
        if (/Android/.test(u)) return 'android';
        return '';
    }

    /** I browser incorporati nelle app (Facebook, Instagram...) non possono installare nulla: lì l'invito non serve */
    const dentroUnaApp = ua => /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|; wv\)/.test(String(ua || ''));

    /** La voce della barra accesa per questa pagina ('' per le pagine che non ci sono: Profile, Archive...) */
    function voceAttiva(pagina) {
        const p = nomePagina(pagina);
        const v = VOCI.find(x => x.pagine.includes(p));
        return v ? v.id : '';
    }

    const haBarra = pagina => !SENZA_BARRA.includes(nomePagina(pagina));
    const puoTirare = pagina => CON_TIRA.includes(nomePagina(pagina));

    /**
     * Va mostrato l'invito a installare? Solo dal telefono, nel browser, sulla home, se non è stato chiuso da poco.
     * env: { modo, sistema, pagina, inApp, chiusoIl (ms o 0), adesso (ms) }
     */
    function proporreInstallazione(env) {
        const e = env || {};
        if (e.modo || !e.sistema || e.inApp) return false;
        if (nomePagina(e.pagina) !== 'index.html') return false;
        const chiuso = Number(e.chiusoIl) || 0;
        return !chiuso || (Number(e.adesso) || Date.now()) - chiuso > GIORNI_INVITO * 86400000;
    }

    /** Quanto si è tirato giù (con un po' di resistenza): 0 se non si sta tirando */
    const tirata = (partenza, attuale) => Math.max(0, Math.round((attuale - partenza) * 0.55));

    // ---------- la pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement) return null;
        if (win.self !== win.top) return null;                     // il Box incorporato nel simulatore resta com'è

        const leggi = k => { try { return win.localStorage.getItem(k); } catch (e) { return null; } };
        const scrivi = (k, v) => { try { if (v == null) win.localStorage.removeItem(k); else win.localStorage.setItem(k, v); } catch (e) { /* storage bloccato */ } };

        // ?app=1 / ?app=0: per vedere (o togliere) l'aspetto da app anche nel browser; si ricorda per le pagine dopo
        let forzata = leggi(CHIAVE_FORZATA) || '';
        try {
            const q = new win.URLSearchParams(win.location.search).get('app');
            if (q === '1' || q === '0') { scrivi(CHIAVE_FORZATA, q); forzata = q; }
        } catch (e) { /* indirizzo strano: niente */ }

        const nav = win.navigator || {};
        const modo = modoApp({
            ua: nav.userAgent,
            standalone: !!(win.matchMedia && win.matchMedia('(display-mode: standalone)').matches),
            iosStandalone: nav.standalone === true,
            referrer: doc.referrer,
            forzata
        });
        const os = sistema(nav.userAgent, nav.maxTouchPoints);
        const pagina = nomePagina(win.location.pathname);
        const html = doc.documentElement;
        if (os) html.classList.add('os-' + os);
        if (modo) html.classList.add('app', 'app-' + modo);
        // nelle pagine con la barra in basso l'intestazione da sito per PC lascia il posto allo scheletro da telefono (app-shell.js, app.css)
        if (modo && haBarra(pagina)) { html.classList.add('app-shell'); caricaFogliDiStile(doc, 'app-pagine.css'); caricaScheletro(doc); }
        // la battaglia non ha la barra, ma ha il suo foglio: in orizzontale lo schermo sta a sinistra e i comandi a destra (app-battaglia.css)
        else if (modo && pagina === 'battle.html') caricaFogliDiStile(doc, 'app-battaglia.css');

        const quandoPronto = fn => (doc.readyState === 'loading' ? doc.addEventListener('DOMContentLoaded', fn) : fn());

        registraServiceWorker(win, modo, os);
        if (modo) quandoPronto(() => avviaApp(win, doc, pagina));
        else quandoPronto(() => avviaInvito(win, doc, { os, pagina, ua: nav.userAgent, leggi, scrivi }));
        return { modo };
    }

    // le pagine ridisegnate per il telefono (app-pagine.css, app-battaglia.css) stanno in fogli a parte, scaricato solo dalle app. Va scritto subito, mentre la pagina
    // si legge (document.write), così blocca il primo disegno e non si vede mai il sito "da PC" lampeggiare prima dell'app.
    function caricaFogliDiStile(doc, nome) {
        const mio = Array.from(doc.scripts || []).find(s => /(^|\/)app\.js(\?|#|$)/.test(s.getAttribute('src') || ''));
        const href = mio ? mio.getAttribute('src').replace(/app\.js/, nome) : nome;
        if (doc.readyState === 'loading' && typeof doc.write === 'function') { doc.write('<link rel="stylesheet" href="' + href + '">'); return; }
        if (!doc.head) return;
        const l = doc.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        doc.head.appendChild(l);
    }

    // lo scheletro da telefono sta in un file a parte: lo scaricano solo le app, il sito nel browser non lo carica
    function caricaScheletro(doc) {
        if (!doc.head) return;
        const mio = Array.from(doc.scripts || []).find(s => /(^|\/)app\.js(\?|#|$)/.test(s.getAttribute('src') || ''));
        const s = doc.createElement('script');
        s.src = mio ? mio.getAttribute('src').replace(/app\.js/, 'app-shell.js') : 'app-shell.js';
        s.async = true;
        doc.head.appendChild(s);
    }

    // il service worker serve solo a rendere il sito installabile (e alla pagina "offline"): da PC non serve (nessuna differenza per chi usa il sito
    // dal computer), nell'APK nemmeno (il sito arriva sempre dalla rete)
    function registraServiceWorker(win, modo, os) {
        if (modo === 'apk' || !os || !win.navigator || !('serviceWorker' in win.navigator)) return;
        const sicuro = win.location.protocol === 'https:' || win.location.hostname === 'localhost' || win.location.hostname === '127.0.0.1';
        if (!sicuro) return;
        win.addEventListener('load', () => { win.navigator.serviceWorker.register('sw.js').catch(() => { /* senza: il sito funziona uguale */ }); });
    }

    // ---------- invito a installare (solo browser da telefono, solo sulla home) ----------
    function avviaInvito(win, doc, { os, pagina, ua, leggi, scrivi }) {
        if (!proporreInstallazione({ modo: '', sistema: os, pagina, inApp: dentroUnaApp(ua), chiusoIl: Number(leggi(CHIAVE_INVITO)) || 0, adesso: Date.now() })) return;
        let evento = null;

        const mostra = (conTasto) => {
            if (doc.getElementById('app-invito')) return;
            const b = doc.createElement('div');
            b.id = 'app-invito';
            b.className = 'app-invito';
            b.setAttribute('role', 'dialog');
            b.setAttribute('aria-label', 'Install the app');
            const condividi = '<svg class="app-invito-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 11v8h14v-8"/></svg>';
            b.innerHTML = '<img src="immagini/app/icon-192.png" alt="" width="48" height="48">' +
                '<div class="app-invito-testo"><b>Get the app</b>' +
                (conTasto ? '<span>Add it to your home screen: full screen, like a real app.</span>'
                    : '<span>Tap ' + condividi + ' then <b>Add to Home Screen</b>. Open this page in Safari or Chrome if you don\'t see it.</span>') +
                '</div>' +
                (conTasto ? '<button type="button" class="app-invito-si">Install</button>' : '') +
                '<button type="button" class="app-invito-no" aria-label="Not now">&#10005;</button>';
            doc.body.appendChild(b);
            const chiudi = () => { scrivi(CHIAVE_INVITO, String(Date.now())); b.remove(); };
            b.querySelector('.app-invito-no').addEventListener('click', chiudi);
            const si = b.querySelector('.app-invito-si');
            if (si) si.addEventListener('click', () => {
                if (!evento) return chiudi();
                evento.prompt();
                evento.userChoice.finally(() => { evento = null; b.remove(); });
            });
        };

        if (os === 'ios') { mostra(false); return; }
        // Android: Chrome dice quando il sito è installabile (e non lo dice se lo è già)
        win.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evento = e; mostra(true); });
        win.addEventListener('appinstalled', () => { const b = doc.getElementById('app-invito'); if (b) b.remove(); });
    }

    // ---------- come app: barra in basso, tira per aggiornare ----------
    function avviaApp(win, doc, pagina) {
        const html = doc.documentElement;
        if (haBarra(pagina)) creaBarra(win, doc, pagina);
        if (puoTirare(pagina)) abilitaTira(win, doc);

        // con la tastiera aperta la barra sparirebbe sopra i campi: la si nasconde finché si scrive
        const campo = el => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(el.type || '');
        doc.addEventListener('focusin', e => { if (campo(e.target)) html.classList.add('app-tastiera'); });
        doc.addEventListener('focusout', () => html.classList.remove('app-tastiera'));
    }

    function creaBarra(win, doc, pagina) {
        const html = doc.documentElement;
        const attiva = voceAttiva(pagina);
        const barra = doc.createElement('nav');
        barra.className = 'app-nav';
        barra.setAttribute('aria-label', 'App navigation');
        barra.innerHTML = VOCI.map(v => {
            const icona = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONE[v.id] + '</svg>';
            const classe = 'app-nav-voce' + (v.id === attiva ? ' attiva' : '');
            return '<a class="' + classe + '" href="' + v.href + '"' + (v.id === attiva ? ' aria-current="page"' : '') + '>' + icona + '<span>' + v.et + '</span></a>';
        }).join('');
        doc.body.appendChild(barra);
        html.classList.add('app-con-barra');
    }

    // ---------- tira per aggiornare ----------
    function abilitaTira(win, doc) {
        let indicatore = null, partenza = null, ricarica = false;
        const html = doc.documentElement;

        const inCima = () => Math.max(win.pageYOffset || 0, html.scrollTop || 0, doc.body ? doc.body.scrollTop || 0 : 0) <= 0;
        // se il tocco inizia dentro qualcosa che scorre da solo, o dentro una finestra aperta, non è per la pagina
        const dentroAltro = el => {
            for (let n = el; n && n.nodeType === 1 && n !== doc.body && n !== html; n = n.parentElement) {
                if (n.scrollTop > 0) return true;
                if (n.matches && n.matches('[role="dialog"], .modal, .custom-modal-backdrop, .mvp-velo, .sfide-dropdown, .user-dropdown, input, textarea, select')) return true;
            }
            return false;
        };
        const crea = () => {
            if (indicatore) return indicatore;
            indicatore = doc.createElement('div');
            indicatore.className = 'app-tira';
            indicatore.setAttribute('aria-hidden', 'true');
            indicatore.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg><span>Pull to refresh</span>';
            doc.body.appendChild(indicatore);
            return indicatore;
        };
        const mostra = d => {
            const i = crea();
            const pronto = d >= DISTANZA_TIRA;
            i.style.transform = 'translate(-50%, ' + Math.min(d, DISTANZA_TIRA + 30) + 'px)';
            i.style.opacity = String(Math.min(1, d / 50));
            i.classList.toggle('pronto', pronto);
            i.querySelector('span').textContent = pronto ? 'Release to refresh' : 'Pull to refresh';
        };
        const nascondi = () => { if (indicatore) { indicatore.style.opacity = '0'; indicatore.style.transform = 'translate(-50%, 0)'; indicatore.classList.remove('pronto'); } };

        doc.addEventListener('touchstart', e => {
            partenza = null;
            if (ricarica || e.touches.length !== 1 || !inCima() || dentroAltro(e.target)) return;
            partenza = e.touches[0].clientY;
        }, { passive: true });
        doc.addEventListener('touchmove', e => {
            if (partenza == null || ricarica) return;
            const d = tirata(partenza, e.touches[0].clientY);
            if (d <= 0) { nascondi(); return; }
            if (!inCima()) { partenza = null; nascondi(); return; }
            mostra(d);
        }, { passive: true });
        const fine = e => {
            if (partenza == null) return;
            const y = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : partenza;
            const d = tirata(partenza, y);
            partenza = null;
            if (d >= DISTANZA_TIRA && inCima()) {
                ricarica = true;
                const i = crea();
                i.classList.add('gira', 'pronto');
                i.querySelector('span').textContent = 'Refreshing…';
                win.location.reload();
            } else nascondi();
        };
        doc.addEventListener('touchend', fine, { passive: true });
        doc.addEventListener('touchcancel', () => { partenza = null; nascondi(); }, { passive: true });
    }

    return { TOKEN_APK, VOCI, SENZA_BARRA, CON_TIRA, DISTANZA_TIRA, GIORNI_INVITO, nomePagina, modoApp, sistema, dentroUnaApp, voceAttiva, haBarra, puoTirare, proporreInstallazione, tirata, avvia };
});
