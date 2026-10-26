// =====================================================
// NOTIFICHE PUSH — Poké-Tournament (lato app)
// ---------------------------------------------------------------------
// Si accendono dalle impostazioni dell'app ("Alerts", app-comune.js). Il telefono dà un "token" (Firebase Cloud Messaging) che il sito scrive in
// pushTokens/{uid}/{chiave}: il server (functions/push.js, .github/workflows/checker.js) lo usa per mandare sfide ricevute, iscrizioni aperte,
// promemoria, voto MVP e stagione conclusa.
//   - sul web (icona sulla Home): service worker del sito (sw.js) + firebase-messaging; serve la chiave VAPID qui sotto (Firebase > Impostazioni del
//     progetto > Cloud Messaging > Certificati push web). Su iPhone funziona solo con l'icona sulla Home (iOS 16.4+).
//   - nell'APK Android: il plugin nativo @capacitor/push-notifications (serve google-services.json: vedi tools/android/LEGGIMI.md).
// Senza chiave né plugin le notifiche non si offrono: il resto dell'app non cambia.
// La parte pura (supporto, chiave del token) è provata in test/push-client.test.js; funziona nel browser (window.Push) e in Node.
// =====================================================
(function (radice, fabbrica) {
    const P = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = P;
    else radice.Push = P;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Chiave pubblica per le notifiche web (non è un segreto). Vuota finché non è stata creata in Firebase: finché è vuota, sul web non si offrono.
    const CHIAVE_VAPID = '';
    const VERSIONE_FIREBASE = '9.17.1';
    const PROVA_ACCESE = 'pushAcceso';          // localStorage: '1' se l'utente le ha accese su questo telefono

    // ---------- parti pure ----------

    /** Una chiave corta e sicura per Firebase (niente . # $ [ ] /) per un token lungo e diverso a ogni telefono */
    function chiaveToken(token) {
        const t = String(token || '');
        let a = 5381, b = 52711;
        for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); a = ((a * 33) ^ c) >>> 0; b = ((b * 31) + c) >>> 0; }
        return a.toString(36) + b.toString(36) + t.length.toString(36);
    }

    /**
     * Che tipo di notifiche può avere questo telefono: 'nativo' (APK con il plugin), 'web' (service worker + notifiche + chiave VAPID) o ''.
     * `env`: { capacitor (window.Capacitor), notification, serviceWorker (bool), pushManager (bool), vapid }
     */
    function supporto(env) {
        const e = env || {};
        const cap = e.capacitor;
        const nativo = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && cap.Plugins && cap.Plugins.PushNotifications);
        if (nativo) return 'nativo';
        if (e.notification && e.serviceWorker && e.pushManager && e.vapid) return 'web';
        return '';
    }

    /** Lo stato da mostrare nel foglio: 'non-supportato', 'negato' (permesso rifiutato nel telefono), 'acceso' o 'spento' */
    function statoDa({ tipo, permesso, acceso }) {
        if (!tipo) return 'non-supportato';
        if (permesso === 'denied') return 'negato';
        return acceso && permesso !== 'default' ? 'acceso' : 'spento';
    }

    // ---------- il browser ----------

    const finestra = () => (typeof window !== 'undefined' ? window : null);
    const leggi = k => { try { return finestra().localStorage.getItem(k); } catch (e) { return null; } };
    const scrivi = (k, v) => { try { finestra().localStorage.setItem(k, v); } catch (e) { /* senza memoria si riparte da spento */ } };

    function ambiente(win) {
        const w = win || finestra();
        if (!w) return {};
        return {
            capacitor: w.Capacitor, notification: typeof w.Notification !== 'undefined',
            serviceWorker: !!(w.navigator && 'serviceWorker' in w.navigator), pushManager: 'PushManager' in w, vapid: CHIAVE_VAPID
        };
    }
    const tipo = () => supporto(ambiente());

    const plugin = () => finestra().Capacitor.Plugins.PushNotifications;

    function permessoDelTelefono() {
        const w = finestra();
        if (tipo() === 'nativo') return null;   // lo dice il plugin (asincrono): vedi stato()
        return w && typeof w.Notification !== 'undefined' ? w.Notification.permission : 'default';
    }

    async function stato() {
        const t = tipo();
        let permesso = permessoDelTelefono();
        if (t === 'nativo') {
            try { const r = await plugin().checkPermissions(); permesso = r.receive === 'granted' ? 'granted' : r.receive === 'denied' ? 'denied' : 'default'; } catch (e) { permesso = 'default'; }
        }
        return statoDa({ tipo: t, permesso, acceso: leggi(PROVA_ACCESE) === '1' });
    }

    function utenteCollegato() {
        return new Promise(ok => {
            const w = finestra();
            if (!w.firebase || !w.firebase.auth) return ok(null);
            const u = w.firebase.auth().currentUser;
            if (u) return ok(u);
            const stop = w.firebase.auth().onAuthStateChanged(x => { stop(); ok(x); });
            setTimeout(() => ok(null), 8000);
        });
    }

    function caricaScript(src) {
        return new Promise((ok, no) => {
            const d = finestra().document;
            const s = d.createElement('script');
            s.src = src; s.onload = ok; s.onerror = () => no(new Error('Could not load ' + src));
            d.head.appendChild(s);
        });
    }

    async function tokenWeb(chiedi) {
        const w = finestra();
        if (chiedi) {
            const p = await w.Notification.requestPermission();
            if (p !== 'granted') return { permesso: p, token: '' };
        } else if (w.Notification.permission !== 'granted') return { permesso: w.Notification.permission, token: '' };
        if (!w.firebase.messaging) await caricaScript(`https://www.gstatic.com/firebasejs/${VERSIONE_FIREBASE}/firebase-messaging-compat.js`);
        if (!w.firebase.messaging.isSupported()) throw new Error('This browser cannot receive notifications');
        const registrazione = (await w.navigator.serviceWorker.getRegistration()) || (await w.navigator.serviceWorker.register('sw.js'));
        await w.navigator.serviceWorker.ready;
        const token = await w.firebase.messaging().getToken({ vapidKey: CHIAVE_VAPID, serviceWorkerRegistration: registrazione });
        return { permesso: 'granted', token: token || '' };
    }

    function tokenNativo(chiedi) {
        return new Promise(async (ok, no) => {
            try {
                const p = plugin();
                let r = await p.checkPermissions();
                if (r.receive !== 'granted' && chiedi) r = await p.requestPermissions();
                if (r.receive !== 'granted') return ok({ permesso: r.receive === 'denied' ? 'denied' : 'default', token: '' });
                const fine = await p.addListener('registration', t => { fine.remove(); ok({ permesso: 'granted', token: t.value }); });
                const errore = await p.addListener('registrationError', e => { errore.remove(); no(new Error((e && e.error) || 'Registration failed')); });
                await p.register();
            } catch (e) { no(e); }
        });
    }

    async function salva(uid, token) {
        const w = finestra();
        const nativo = tipo() === 'nativo';
        await w.firebase.database().ref(`pushTokens/${uid}/${chiaveToken(token)}`).set({ t: token, os: nativo ? 'android-app' : 'web', creato: Date.now() });
    }

    /** Accende le notifiche su questo telefono (da un tocco dell'utente: il permesso si può chiedere solo così). Restituisce lo stato nuovo. */
    async function attiva() {
        const t = tipo();
        if (!t) return 'non-supportato';
        const utente = await utenteCollegato();
        if (!utente) throw new Error('Log in first');
        const r = t === 'nativo' ? await tokenNativo(true) : await tokenWeb(true);
        if (!r.token) return r.permesso === 'denied' ? 'negato' : 'spento';
        await salva(utente.uid, r.token);
        scrivi(PROVA_ACCESE, '1');
        if (t === 'nativo') ascoltaTocchi();
        return 'acceso';
    }

    /** Le spegne: il token esce dal database (il server non ci scrive più) e dal telefono */
    async function disattiva() {
        const w = finestra();
        const t = tipo();
        scrivi(PROVA_ACCESE, '0');
        if (!t) return 'non-supportato';
        const utente = await utenteCollegato();
        try {
            const r = t === 'nativo' ? await tokenNativo(false) : await tokenWeb(false);
            if (utente && r.token) await w.firebase.database().ref(`pushTokens/${utente.uid}/${chiaveToken(r.token)}`).remove();
            if (t === 'web' && r.token) await w.firebase.messaging().deleteToken();
            if (t === 'nativo') await plugin().unregister();
        } catch (e) { /* il token scade da solo: il server lo ritira alla prima notifica */ }
        return 'spento';
    }

    /** Ad ogni apertura, se sono accese: il token può cambiare (Firebase lo rinnova), quindi lo si riscrive. Non chiede mai permessi. */
    async function ripristina() {
        if (!tipo() || leggi(PROVA_ACCESE) !== '1') return;
        try {
            const utente = await utenteCollegato();
            if (!utente) return;
            const r = tipo() === 'nativo' ? await tokenNativo(false) : await tokenWeb(false);
            if (r.token) await salva(utente.uid, r.token);
            if (tipo() === 'nativo') ascoltaTocchi();
        } catch (e) { /* si riprova alla prossima apertura */ }
    }

    // nell'APK toccare una notifica apre l'app: la pagina giusta sta in data.url
    let tocchiAscoltati = false;
    function ascoltaTocchi() {
        if (tocchiAscoltati || tipo() !== 'nativo') return;
        tocchiAscoltati = true;
        plugin().addListener('pushNotificationActionPerformed', az => {
            const url = az && az.notification && az.notification.data && az.notification.data.url;
            if (url && /^[A-Za-z0-9_\-./?=&%:]+$/.test(url) && !/^[a-z]+:/i.test(url)) finestra().location.href = url;
        });
    }

    return { CHIAVE_VAPID, chiaveToken, supporto, statoDa, ambiente, tipo, stato, attiva, disattiva, ripristina };
});
