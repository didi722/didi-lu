/* =====================================================================
   IL SITO COME APP — Poké-Tournament
   ---------------------------------------------------------------------
   Il sito si può usare come app in tre modi, e questo file è uguale per tutti:
     - "installata": aperto dall'icona sulla schermata Home (iPhone: Condividi > Aggiungi a Home; Android: Installa app). Si riconosce da
       display-mode: standalone o fullscreen (e da navigator.standalone su iOS);
     - "apk": dentro l'app Android costruita con Capacitor (android-apk.yml): il suo user agent finisce con SantAlviseApp;
     - nel browser: tutto come prima, tranne un invito a installare (una volta, sulla home, dal telefono).
   Come app (installata o apk) la pagina prende la classe "app" su <html> e il sito diventa un GIOCO da telefono, sempre in orizzontale, pensato per giocare e
   vedere i risultati (non una copia del sito):
     - lo schermo si blocca in orizzontale (plugin dell'APK o API del browser) e, nell'APK, le barre di sistema si nascondono; dove l'orientamento non
       si può bloccare (iPhone) un avviso chiede di girare il telefono;
     - all'apertura si arriva al menù principale (menu.html): l'avatar del giocatore, i suoi achievements e poche tessere (Matches, Practice, Box, Trainers,
       Stats). Le pagine del sito che nell'app non servono (stagioni, profilo, archivio, formati, regolamento) rimandano al menù: le stagioni aperte si
       annunciano lì; la pagina pubblica di un allenatore (public.html) è la sua scheda nella pagina Trainers;
     - lo stile è uno solo, quello dell'app: il tema e il colore che il giocatore ha scelto per il sito non contano;
     - le altre pagine hanno l'interfaccia da gioco (app-gioco.css, app-gioco.js): il menù principale, il titolo, campanella e account in alto, niente
       barre del sito né freccia indietro (si torna sempre al menù).
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
    const GIORNI_INVITO = 14;                          // dopo averlo chiuso, l'invito torna dopo tanti giorni
    const CONDIZIONE_TELEFONO = '(max-width: 700px), (max-height: 520px)';   // com'è fatto uno schermo da telefono (la stessa degli stili)
    const VIEWPORT_APP = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no';   // in un gioco niente zoom, né col pizzico né col doppio tocco
    const CHIAVE_SPLASH = 'menuSplashVisto';           // sessionStorage: la schermata del titolo del menù è già passata in questa visita (la scrive app-menu.js)

    // le pagine che non hanno l'interfaccia da gioco in alto: il menù principale, la battaglia (ha la sua), accesso, modello vuoto, amministrazione
    const SENZA_HUD = ['menu.html', 'battle.html', 'login.html', 'schermata-base-vuota.html', 'admin.html'];

    // le pagine del sito che nell'app non servono: dal telefono rimandano al menù (le stagioni aperte si annunciano lì, l'iscrizione è hub.html)
    // e, per la pagina pubblica di un allenatore, alla sua scheda nella pagina Trainers (che ha già tutto: Pokémon, badge, trofei, Elo)
    const FUORI_APP = ['index.html', 'profile.html', 'palmares.html', 'formats.html', 'rules.html', 'public.html'];
    const RIMANDI = { 'public.html': 'players.html' };

    // gli script che una pagina dell'app carica oltre a quelli comuni (app-comune.js, app-gioco.js): ognuno disegna a modo suo i dati che la pagina del sito ha
    // appena calcolato (vedi pubblica), così il sito da PC non cambia di una riga
    const SCRIPT_PAGINE = {
        'matches.html': ['app-carosello.js', 'scala-pkm.js', 'app-classifica.js', 'app-matches.js'],
        'players.html': ['sprite-pkm.js', 'app-carosello.js', 'scala-pkm.js', 'app-trainers.js'],
        'stats.html': ['app-carosello.js', 'nome-scorrevole.js', 'scala-pkm.js', 'app-stats.js'],
        'box.html': ['app-carosello.js', 'app-teambuilder.js', 'app-box-badge.js'],
        'practice.html': ['app-practice.js']
    };

    // Le pagine del gioco, come le vede il menù principale: nome, colore e pagine che le tengono accese (`pagine`: una pagina del sito che non è
    // nel menù, per esempio la scheda pubblica di un allenatore, appartiene alla voce da cui ci si arriva).
    // Il colore è anche quello del titolo in alto nella pagina (app-gioco.js), così si capisce da dove si arriva.
    const VOCI = [
        { id: 'play', et: 'Play', href: 'practice.html', colore: '#ffbd44', pagine: ['practice.html', 'matches.html'] },
        { id: 'box', et: 'Box', href: 'box.html', colore: '#6fa8ff', pagine: ['box.html'] },
        { id: 'trainers', et: 'Trainers', href: 'players.html', colore: '#ff7b6b', pagine: ['players.html'] },
        { id: 'stats', et: 'Stats', href: 'stats.html', colore: '#b388eb', pagine: ['stats.html'] }
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

    /** La pagina del sito non ha posto nell'app (stagioni, profilo, archivio, formati, regolamento, pagina pubblica)? Dal telefono si va altrove. */
    const fuoriApp = pagina => FUORI_APP.includes(nomePagina(pagina));

    /**
     * Dove si va dalla pagina che nell'app non c'è: al menù principale, o (la pagina pubblica di un allenatore) alla pagina Trainers sullo stesso allenatore.
     * `ricerca`: la parte dell'indirizzo dopo il punto interrogativo, con o senza "?".
     */
    function destinazioneFuoriApp(pagina, ricerca) {
        const p = nomePagina(pagina);
        if (!RIMANDI[p]) return 'menu.html';
        let giocatore = '';
        try { giocatore = new URLSearchParams(String(ricerca || '')).get('player') || ''; } catch (e) { giocatore = ''; }
        return RIMANDI[p] + (giocatore ? '?player=' + encodeURIComponent(giocatore) : '');
    }

    // ---------- i dati che la pagina passa all'app ----------

    const DATI_PAGINA = {};

    /**
     * Le pagine del sito (classifica di Matches, allenatori, statistiche...) passano qui i dati che hanno calcolato: l'app li disegna a modo suo (app-classifica.js,
     * app-trainers.js, app-stats.js). Si può chiamare sempre, anche da PC: lì non ascolta nessuno. Chi arriva dopo i dati li trova con datiPagina; chi c'era già
     * sente l'evento "app-dati" sul documento.
     */
    function pubblica(nome, dati) {
        DATI_PAGINA[nome] = dati;
        try {
            const d = typeof document !== 'undefined' ? document : null;
            if (d && typeof CustomEvent === 'function') d.dispatchEvent(new CustomEvent('app-dati', { detail: nome }));
        } catch (e) { /* niente: i dati restano disponibili */ }
    }
    const datiPagina = nome => DATI_PAGINA[nome];

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

    // ---------- niente zoom ----------

    /**
     * Un gioco non si ingrandisce: via lo zoom col pizzico e col doppio tocco (viewport) e, dove il browser non rispetta il viewport (iPhone), anche i gesti
     * di pizzico. Senza zoom la pagina non può nemmeno spostarsi "da ingrandita" né allargarsi oltre lo schermo. Restituisce il viewport scritto.
     */
    function bloccaZoom(doc) {
        let m = typeof doc.querySelector === 'function' ? doc.querySelector('meta[name="viewport"]') : null;
        if (!m && typeof doc.createElement === 'function' && doc.head) {
            m = doc.createElement('meta');
            m.setAttribute('name', 'viewport');
            doc.head.appendChild(m);
        }
        if (m) m.setAttribute('content', VIEWPORT_APP);
        const ferma = e => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); };
        for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) doc.addEventListener(ev, ferma, { passive: false });
        doc.addEventListener('touchmove', e => { if (e && e.touches && e.touches.length > 1) ferma(e); }, { passive: false });
        return VIEWPORT_APP;
    }

    // ---------- lo stile: uno solo ----------

    const TEMA_APP = 'neubrutal';

    /**
     * Nell'app lo stile è quello dell'app, uguale per tutti: il tema e il colore che il giocatore ha scelto per il sito (temi.js li mette su <html> prima
     * di noi) si tolgono, e temi.js non li rimette (guarda la classe "app"). I colori e le forme dell'app stanno in app-gioco.css.
     */
    function fissaStile(doc) {
        const html = doc.documentElement;
        html.setAttribute('data-tema', TEMA_APP);
        if (html.style && typeof html.style.removeProperty === 'function') html.style.removeProperty('--nb-accento');
        const caratteri = doc.getElementById ? doc.getElementById('temi-caratteri') : null;
        if (caratteri && typeof caratteri.remove === 'function') caratteri.remove();
    }

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

        // lo stile dell'app è uno solo; le pagine del sito che nell'app non servono rimandano al menù principale (che annuncia le stagioni aperte)
        if (modo) {
            fissaStile(doc);
            bloccaZoom(doc);
            if (os && fuoriApp(pagina) && win.location && typeof win.location.replace === 'function') {
                const dove = destinazioneFuoriApp(pagina, win.location.search);
                win.location.replace(dove);
                return { modo, menu: dove === 'menu.html', verso: dove };
            }
        }

        // i suoni e la vibrazione dei tasti (app-suoni.js) valgono per ogni pagina dell'app, battaglia compresa
        if (modo) caricaScript(doc, 'app-suoni.js');

        // il menù principale: l'aspetto da gioco comune (app-gioco.css: colori, tasti, finestre) e il suo (app-menu.css: sfondo, avatar, tessere); la logica
        // (app-comune.js, app-menu.js) la carica la pagina
        if (modo && pagina === 'menu.html') {
            // la schermata del titolo si vede dal primo disegno (senza che il menù lampeggi sotto prima che parta lo script): se in questa visita è già passata, il menù è pronto
            try { if (win.sessionStorage.getItem(CHIAVE_SPLASH)) html.classList.add('gx-pronto'); } catch (e) { /* senza memoria si rivede il titolo */ }
            caricaFogliDiStile(doc, 'app-gioco.css'); caricaFogliDiStile(doc, 'app-menu.css');
        }
        // le pagine con l'interfaccia da gioco in alto (app-gioco.js) al posto dell'intestazione da sito per PC; i fogli: l'aspetto comune e le pagine una per una
        else if (modo && haHud(pagina)) {
            html.classList.add('app-shell');
            caricaFogliDiStile(doc, 'app-gioco.css'); caricaFogliDiStile(doc, 'app-gioco-pagine.css');
            caricaScript(doc, 'app-comune.js'); caricaScript(doc, 'app-gioco.js');          // nell'ordine: gli script aggiunti così partono uno dopo l'altro
            for (const nome of SCRIPT_PAGINE[pagina] || []) caricaScript(doc, nome);
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
        TOKEN_APK, VOCI, SENZA_HUD, FUORI_APP, RIMANDI, SCRIPT_PAGINE, TEMA_APP, GIORNI_INVITO, CONDIZIONE_TELEFONO, VIEWPORT_APP, CHIAVE_SPLASH,
        nomePagina, modoApp, sistema, dentroUnaApp, voceDi, haHud, fuoriApp, destinazioneFuoriApp, pubblica, datiPagina, fissaStile, bloccaZoom, proporreInstallazione,
        pluginNativo, bloccaOrizzontale, orientamentoDellaPagina, barreNascoste, creaAvvisoRuota, avvia
    };
});
