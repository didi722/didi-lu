/* =====================================================================
   SERVICE WORKER — Poké-Tournament
   ---------------------------------------------------------------------
   Serve a tre cose: rendere il sito installabile come app (Chrome lo pretende), mostrare una pagina d'attesa invece del dinosauro quando manca la
   rete, e far comparire le notifiche push (sfida ricevuta, iscrizioni...: vedi push.js) anche con il sito chiuso. NON mette in cache pagine, script o stili: tutto passa sempre dalla rete (e dalla cache normale del browser), quindi ogni aggiornamento del
   sito arriva subito, come prima, senza "Ctrl+Shift+R". Di cache c'è solo offline.html.
   Per cambiare offline.html basta cambiare VERSIONE.
   ===================================================================== */
'use strict';

const VERSIONE = 'v1';
const PREFISSO = 'sant-alvise-offline-';
const CACHE = PREFISSO + VERSIONE;
const OFFLINE = 'offline.html';

self.addEventListener('install', evento => {
    evento.waitUntil(
        caches.open(CACHE)
            .then(cache => cache.add(new Request(OFFLINE, { cache: 'reload' })))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', evento => {
    // le cache sono di tutto l'indirizzo (anche di altri siti dello stesso account su github.io): si tolgono solo le nostre, delle versioni vecchie
    evento.waitUntil(
        caches.keys()
            .then(chiavi => Promise.all(chiavi.filter(k => k.startsWith(PREFISSO) && k !== CACHE).map(k => caches.delete(k))))
            // "navigation preload": la pagina si chiede alla rete mentre il service worker si sveglia, così aprirla non costa niente in più
            .then(() => (self.registration && self.registration.navigationPreload ? self.registration.navigationPreload.enable() : null))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', evento => {
    const richiesta = evento.request;
    // solo l'apertura di una pagina: scripts, immagini, Firebase, Showdown... vanno in rete come se il service worker non ci fosse
    if (richiesta.mode !== 'navigate') return;
    evento.respondWith((async () => {
        try {
            return (await evento.preloadResponse) || await fetch(richiesta);
        } catch (errore) {
            return (await caches.match(OFFLINE)) || Response.error();
        }
    })());
});

// ---------- notifiche push ----------
// Firebase Cloud Messaging manda { notification: { title, body }, data: { url, tag } }: qui la si disegna e, toccandola, si apre la pagina giusta.
const ICONA = 'immagini/app/icon-192.png';

self.addEventListener('push', evento => {
    let d = {};
    try { d = evento.data ? evento.data.json() : {}; } catch (e) { d = {}; }
    const n = d.notification || {};
    const dati = d.data || {};
    const titolo = n.title || dati.title || 'Sant\'Alvise League';
    evento.waitUntil(self.registration.showNotification(titolo, {
        body: n.body || dati.body || '',
        icon: ICONA, badge: ICONA,
        tag: dati.tag || n.tag || undefined,
        data: { url: dati.url || 'index.html' }
    }));
});

self.addEventListener('notificationclick', evento => {
    evento.notification.close();
    const url = new URL((evento.notification.data && evento.notification.data.url) || 'index.html', self.registration.scope).href;
    evento.waitUntil((async () => {
        const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        // l'app è già aperta: la si porta davanti e la si manda alla pagina; altrimenti si apre una finestra
        const mia = aperte.find(c => c.url.startsWith(self.registration.scope));
        if (mia) { await mia.focus(); if ('navigate' in mia) return mia.navigate(url).catch(() => {}); return null; }
        return self.clients.openWindow(url);
    })());
});
