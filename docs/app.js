/* =====================================================================
   IL SITO COME APP — Poké-Tournament
   ---------------------------------------------------------------------
   Il sito si può usare come app in tre modi, e questo file è uguale per tutti:
     - "installata": aperto dall'icona sulla schermata Home (iPhone: Condividi > Aggiungi a Home; Android: Installa app). Si riconosce da
       display-mode: standalone o fullscreen (e da navigator.standalone su iOS);
     - "apk": dentro l'app Android costruita con Capacitor (android-apk.yml): il suo user agent finisce con SantAlviseApp;
     - nel browser: tutto come prima, tranne un invito a installare (una volta, sulla home, dal telefono).
   Come app (installata o apk) la pagina prende la classe "app" su <html> e il sito diventa un GIOCO da telefono, sempre in orizzontale:
     - lo schermo si blocca in orizzontale (plugin dell'APK o API del browser) e, nell'APK, le barre di sistema si nascondono; dove l'orientamento non
       si può bloccare (iPhone) un avviso chiede di girare il telefono;
     - all'apertura si arriva al menù principale (menu.html): l'avatar del giocatore e le pagine del gioco;
     - le altre pagine hanno l'interfaccia da gioco (app-gioco.css, app-gioco.js): indietro, menù, campanella, account in alto, niente barre del sito.
   Per vedere l'aspetto da app nel browser (anche da PC): aggiungi ?app=1 a un indirizzo del sito; ?app=0 per tornare indietro.
   Non fa niente dentro un altro frame (il Box incorporato nel simulatore). Le parti pure (riconoscimento, pagine, orientamento...) sono provate in
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
    const CHIAVE_AVVIATA = 'appAvviata';               // (sessionStorage) l'app è già stata aperta in questa visita: la home non riporta più al menù
    const GIORNI_INVITO = 14;                          // dopo averlo chiuso, l'invito torna dopo tanti giorni
    const CONDIZIONE_TELEFONO = '(max-width: 700px), (max-height: 520px)';   // com'è fatto uno schermo da telefono (la stessa degli stili)

    // le pagine che non hanno l'interfaccia da gioco in alto: il menù principale, la battaglia (ha la sua), accesso, modello vuoto, amministrazione
    const SENZA_HUD = ['menu.html', 'battle.html', 'login.html', 'schermata-base-vuota.html', 'admin.html'];

    // Le pagine del gioco, come le vede il menù principale: nome, colore e pagine che le tengono accese (`pagine`: una pagina del sito che non è
    // nel menù, per esempio la scheda pubblica di un allenatore, appartiene alla voce da cui ci si arriva).
    // Il colore è anche quello del titolo in alto nella pagina (app-gioco.js), così si capisce da dove si arriva.
    const VOCI = [
        { id: 'matches', et: 'Matches', href: 'matches.html', colore: '#ffbd44', pagine: ['matches.html'] },
        { id: 'stagioni', et: 'Seasons', href: 'index.html', colore: '#31c489', pagine: ['index.html', 'hub.html'] },
        { id: 'box', et: 'Box', href: 'box.html', colore: '#6fa8ff', pagine: ['box.html'] },
        { id: 'trainers', et: 'Trainers', href: 'players.html', colore: '#ff7b6b', pagine: ['players.html', 'public.html'] },
        { id: 'stats', et: 'Stats', href: 'stats.html', colore: '#b388eb', pagine: ['stats.html'] },
        { id: 'profilo', et: 'Profile', href: 'profile.html', colore: '#f78fb3', pagine: ['profile.html'] },
        { id: 'archivio', et: 'Archive', href: 'palmares.html', colore: '#ffd23f', pagine: ['palmares.html'] },
        { id: 'formati', et: 'Formats', href: 'formats.html', colore: '#4fd1c5', pagine: ['formats.html'] },
        { id: 'regole', et: 'Rules', href: 'rules.html', colore: '#ff6b6b', pagine: ['rules.html'] }
    ];

    // ---------- parti pure ----------

    /** Il nome del file della pagina: "/didi-lu/Matches.html" -> "matches.html"; la radice è la home. */
    function nomePagina(percorso) {
        const ultimo = String(percorso || '').split('?')[0].split('#')[0].split('/').pop().toLowerCase();
        return ultimo || 'index.html';
    }

    /**
     * Com'è aperto il sito: 'apk' (app Android), 'installata' (icona sulla schermata Home) o '' (browser).
     * env: { ua, standalone (matchMedia display-mode: standalone o fullscreen), iosStandalone (navigator.standalone), referrer, forzata ('1' | '0' | '') }
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

    /** La voce del gioco a cui appartiene la pagina (null per le pagine che non ne hanno: battaglia, accesso...) */
    function voceDi(pagina) {
        const p = nomePagina(pagina);
        return VOCI.find(x => x.pagine.includes(p)) || null;
    }

    /** La pagina ha l'interfaccia da gioco in alto (indietro, menù, campanella, account)? */
    const haHud = pagina => !SENZA_HUD.includes(nomePagina(pagina));

    /**
     * Va aperto il menù principale al posto della pagina? Solo la prima apertura dell'app di questa visita, e solo se si apre la home:
     * dopo, "Seasons" è la home vera. `giaAvviata`: l'app era già stata aperta (sessionStorage).
     */
    const vaAlMenu = (pagina, giaAvviata) => !giaAvviata && nomePagina(pagina) === 'index.html';

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

    // ---------- l'orientamento: tutta l'app si gioca in orizzontale ----------

    /**
     * Un plugin nativo di Capacitor (solo nell'APK), o null. Il sito arriva dalla rete e non porta con sé il pacchetto @capacitor/core: si usa il
     * `Capacitor` che l'app inietta in ogni pagina. Se l'APK non ha quel plugin (è una versione vecchia) le chiamate falliscono e basta.
     */
    function pluginNativo(win, nome) {
        const cap = win && win.Capacitor;
        if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
        if (cap.Plugins && cap.Plugins[nome]) return cap.Plugins[nome];
        if (typeof cap.registerPlugin === 'function') { try { return cap.registerPlugin(nome); } catch (e) { return null; } }
        return null;
    }

    /**
     * Blocca lo schermo in orizzontale (i due versi, secondo come si tiene il telefono). Nell'APK il manifest lo fa già dall'avvio; qui si ripete col plugin
     * ScreenOrientation (anche per gli APK vecchi) o, nelle app installate dal browser, con l'API del browser (solo Android: su iPhone non esiste, e lì un
     * avviso chiede di girare il telefono).
     * Restituisce 'nativo', 'web' o '' (non si è riusciti).
     */
    async function bloccaOrizzontale(win) {
        const nativo = pluginNativo(win, 'ScreenOrientation');
        if (nativo && typeof nativo.lock === 'function') {
            try { await nativo.lock({ orientation: 'landscape' }); return 'nativo'; } catch (e) { /* APK senza il plugin: si prova con il browser */ }
        }
        const so = win && win.screen && win.screen.orientation;
        if (so && typeof so.lock === 'function') {
            try { await so.lock('landscape'); return 'web'; } catch (e) { /* non permesso (serve un'app installata) o non supportato */ }
        }
        return '';
    }

    /** Lo blocca a ogni pagina (si riprova qualche volta: all'apertura l'app può non essere ancora pronta; e tornando dalla cache del browser) */
    function orientamentoDellaPagina(win) {
        const prova = restanti => bloccaOrizzontale(win).then(modo => {
            if (!modo && restanti > 0 && typeof win.setTimeout === 'function') win.setTimeout(() => prova(restanti - 1), 500);
        });
        prova(4);
        win.addEventListener('pageshow', e => { if (e && e.persisted) prova(1); });
    }

    /**
     * Schermo intero da gioco nell'APK: via la barra di stato e quella dei gesti (si rivedono con uno scorrimento dal bordo dello schermo).
     * Il plugin le nasconde una volta: se tornano (le si è richiamate) si rinascondono dopo un attimo.
     */
    function barreNascoste(win) {
        const sb = pluginNativo(win, 'SystemBars');
        if (!sb || typeof sb.hide !== 'function') return null;
        const nascondi = () => { try { const r = sb.hide(); if (r && typeof r.catch === 'function') r.catch(() => { /* APK vecchio */ }); } catch (e) { /* niente */ } };
        nascondi();
        let attesa = 0;
        win.addEventListener('resize', () => {
            if (typeof win.setTimeout !== 'function') return;
            if (attesa) win.clearTimeout(attesa);
            attesa = win.setTimeout(() => { attesa = 0; nascondi(); }, 1800);
        });
        win.addEventListener('pageshow', nascondi);
        return { nascondi };
    }

    /** L'avviso "gira il telefono": si vede solo con lo schermo da telefono in verticale (lo stile è in app.css) */
    function creaAvvisoRuota(doc) {
        if (!doc.body || doc.getElementById('app-ruota')) return null;
        const d = doc.createElement('div');
        d.id = 'app-ruota';
        d.className = 'app-ruota';
        d.setAttribute('role', 'alert');
        d.innerHTML = '<svg class="app-ruota-telefono" viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="6" width="20" height="52" rx="5"/><path d="M30 12h4"/><circle cx="32" cy="51" r="2"/></svg>' +
            '<b>Turn your phone sideways</b><span>This game is played in landscape.</span>';
        doc.body.appendChild(d);
        return d;
    }

    // ---------- la pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement) return null;
        if (win.self !== win.top) return null;                     // il Box incorporato nel simulatore resta com'è

        const leggi = k => { try { return win.localStorage.getItem(k); } catch (e) { return null; } };
        const scrivi = (k, v) => { try { if (v == null) win.localStorage.removeItem(k); else win.localStorage.setItem(k, v); } catch (e) { /* storage bloccato */ } };
        const leggiVisita = k => { try { return win.sessionStorage.getItem(k); } catch (e) { return null; } };
        const scriviVisita = (k, v) => { try { win.sessionStorage.setItem(k, v); } catch (e) { /* senza memoria della visita il menù si riapre dalla home */ } };

        // ?app=1 / ?app=0: per vedere (o togliere) l'aspetto da app anche nel browser; si ricorda per le pagine dopo
        let forzata = leggi(CHIAVE_FORZATA) || '';
        try {
            const q = new win.URLSearchParams(win.location.search).get('app');
            if (q === '1' || q === '0') { scrivi(CHIAVE_FORZATA, q); forzata = q; }
        } catch (e) { /* indirizzo strano: niente */ }

        const nav = win.navigator || {};
        const dm = q => !!(win.matchMedia && win.matchMedia('(display-mode: ' + q + ')').matches);
        const modo = modoApp({
            ua: nav.userAgent,
            standalone: dm('standalone') || dm('fullscreen'),
            iosStandalone: nav.standalone === true,
            referrer: doc.referrer,
            forzata
        });
        const os = sistema(nav.userAgent, nav.maxTouchPoints);
        const pagina = nomePagina(win.location.pathname);
        const html = doc.documentElement;
        if (os) html.classList.add('os-' + os);
        if (modo) html.classList.add('app', 'app-' + modo);

        // la prima apertura dell'app (dal telefono) è il menù principale; da lì ogni pagina ha il suo posto
        if (modo) {
            const giaAvviata = !!leggiVisita(CHIAVE_AVVIATA);
            scriviVisita(CHIAVE_AVVIATA, '1');
            if (os && vaAlMenu(pagina, giaAvviata) && win.location && typeof win.location.replace === 'function') {
                win.location.replace('menu.html');
                return { modo, menu: true };
            }
        }

        // i suoni e la vibrazione dei tasti (app-suoni.js) valgono per ogni pagina dell'app, battaglia compresa
        if (modo) caricaScript(doc, 'app-suoni.js');

        // il menù principale: l'aspetto da gioco comune (app-gioco.css: colori, tasti, finestre) e il suo (app-menu.css: sfondo, avatar, tessere); la logica
        // (app-comune.js, app-menu.js) la carica la pagina
        if (modo && pagina === 'menu.html') { caricaFogliDiStile(doc, 'app-gioco.css'); caricaFogliDiStile(doc, 'app-menu.css'); }
        // le pagine con l'interfaccia da gioco in alto (app-gioco.js) al posto dell'intestazione da sito per PC; i fogli: l'aspetto comune e le pagine una per una
        else if (modo && haHud(pagina)) {
            html.classList.add('app-shell');
            caricaFogliDiStile(doc, 'app-gioco.css'); caricaFogliDiStile(doc, 'app-gioco-pagine.css');
            caricaScript(doc, 'app-comune.js'); caricaScript(doc, 'app-gioco.js');          // nell'ordine: gli script aggiunti così partono uno dopo l'altro
        }
        // la battaglia ha il suo foglio e i suoi comandi a due passi (Fight / Pokémon), come in un gioco: app-battaglia.css, app-battaglia.js
        else if (modo && pagina === 'battle.html') { caricaFogliDiStile(doc, 'app-battaglia.css'); caricaScript(doc, 'app-battaglia.js'); }

        const quandoPronto = fn => (doc.readyState === 'loading' ? doc.addEventListener('DOMContentLoaded', fn) : fn());

        registraServiceWorker(win, modo, os);
        if (modo && os) { orientamentoDellaPagina(win); barreNascoste(win); }
        if (modo) quandoPronto(() => avviaApp(win, doc, os));
        else quandoPronto(() => avviaInvito(win, doc, { os, pagina, ua: nav.userAgent, leggi, scrivi }));
        return { modo };
    }

    // le pagine ridisegnate per il gioco (app-gioco.css, app-battaglia.css) stanno in fogli a parte, scaricati solo dalle app. Va scritto subito, mentre la pagina
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

    // uno script dell'app (app-gioco.js, app-battaglia.js) che nel sito da PC non si scarica
    function caricaScript(doc, nome) {
        if (!doc.head) return;
        const mio = Array.from(doc.scripts || []).find(s => /(^|\/)app\.js(\?|#|$)/.test(s.getAttribute('src') || ''));
        const s = doc.createElement('script');
        s.src = mio ? mio.getAttribute('src').replace(/app\.js/, nome) : nome;
        s.async = false;                       // gli script aggiunti dalla pagina partono nell'ordine in cui sono stati aggiunti
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

    // ---------- come app ----------
    function avviaApp(win, doc, os) {
        const html = doc.documentElement;
        // dal telefono, in verticale, un avviso chiede di girare lo schermo (dove non si riesce a bloccarlo: iPhone, app installate senza il permesso)
        if (os) creaAvvisoRuota(doc);

        // con la tastiera aperta l'interfaccia in alto starebbe sopra i campi: la si nasconde finché si scrive
        const campo = el => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(el.type || '');
        doc.addEventListener('focusin', e => { if (campo(e.target)) html.classList.add('app-tastiera'); });
        doc.addEventListener('focusout', () => html.classList.remove('app-tastiera'));
    }

    return {
        TOKEN_APK, VOCI, SENZA_HUD, GIORNI_INVITO, CONDIZIONE_TELEFONO, CHIAVE_AVVIATA,
        nomePagina, modoApp, sistema, dentroUnaApp, voceDi, haHud, vaAlMenu, proporreInstallazione,
        pluginNativo, bloccaOrizzontale, orientamentoDellaPagina, barreNascoste, creaAvvisoRuota, avvia
    };
});
