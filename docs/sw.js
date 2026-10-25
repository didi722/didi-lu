/* =====================================================================
   SERVICE WORKER — Poké-Tournament
   ---------------------------------------------------------------------
   Serve a due cose: rendere il sito installabile come app (Chrome lo pretende) e mostrare una pagina d'attesa invece del dinosauro quando manca la
   rete. NON mette in cache pagine, script o stili: tutto passa sempre dalla rete (e dalla cache normale del browser), quindi ogni aggiornamento del
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
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', evento => {
    const richiesta = evento.request;
    // solo l'apertura di una pagina: scripts, immagini, Firebase, Showdown... vanno in rete come se il service worker non ci fosse
    if (richiesta.mode !== 'navigate') return;
    evento.respondWith(
        fetch(richiesta).catch(() => caches.match(OFFLINE).then(risposta => risposta || Response.error()))
    );
});
