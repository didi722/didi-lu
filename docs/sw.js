/* =====================================================================
   SERVICE WORKER — Poké-Tournament
   ---------------------------------------------------------------------
   Serve a tre cose: rendere il sito installabile come app (Chrome lo pretende), mostrare una pagina d'attesa invece del dinosauro quando manca la
   rete, e far comparire le notifiche push (sfida ricevuta, iscrizioni...: vedi push.js) anche con il sito chiuso. NON mette in cache pagine, script o stili: tutto passa sempre dalla rete (e dalla cache normale del browser), quindi ogni aggiornamento del
   sito arriva subito, come prima, senza "Ctrl+Shift+R". Di cache ci sono offline.html e le IMMAGINI: gli sprite dei Pokémon (GIF e render, che non cambiano mai) restano
   salvati tra una visita e l'altra, invece di essere riscaricati a ogni apertura (GitHub li lascia validi solo 5 minuti), e le immagini del sito (immagini/) si
   mostrano subito da qui e intanto si rinfrescano in rete.
   Per cambiare offline.html basta cambiare VERSIONE.
   ===================================================================== */
'use strict';

const VERSIONE = 'v1';
const PREFISSO = 'sant-alvise-offline-';
const CACHE = PREFISSO + VERSIONE;
const OFFLINE = 'offline.html';

// le immagini (cache a parte: l'attivazione toglie solo le vecchie `sant-alvise-offline-*`)
const CACHE_IMMAGINI = 'sant-alvise-immagini-v1';          // risposte normali (CORS o dello stesso sito)
const CACHE_OPACHE = 'sant-alvise-immagini-opache-v1';      // se l'host degli sprite non permette il CORS: risposte "opache", che Chrome conta molto di più: meno
const MASSIMO_IMMAGINI = 400;
const MASSIMO_OPACHE = 150;          // abbastanza per le GIF che il caricamento iniziale scarica (app-precarica.js: compagni e team di Stats); se non c'è spazio il salvataggio salta in silenzio
// gli sprite dei Pokémon (solo questi host e questi percorsi: tutto il resto va in rete come prima)
const SPRITE = [
    { host: 'play.pokemonshowdown.com', percorso: '/sprites/' },
    { host: 'raw.githubusercontent.com', percorso: '/PokeAPI/sprites/' },
    { host: 'img.pokemondb.net', percorso: '/sprites/' }
];
const senzaCors = new Set();      // gli indirizzi per cui il CORS è stato rifiutato in questa sessione: non si riprova

/** 'sprite' (immagine di un Pokémon: per sempre), 'sito' (immagine del sito: subito dalla cache, rinfrescata in rete) o null (non è affar nostro) */
function tipoImmagine(richiesta) {
    if (richiesta.destination !== 'image' || (richiesta.method && richiesta.method !== 'GET')) return null;
    let u;
    try { u = new URL(richiesta.url); } catch (e) { return null; }
    if (SPRITE.some(s => u.hostname === s.host && u.pathname.startsWith(s.percorso))) return 'sprite';
    if (self.location && u.origin === self.location.origin && u.pathname.includes('/immagini/')) return 'sito';
    return null;
}

/** Tiene al massimo `massimo` immagini in `cache`: se ce ne sono di più, via le più vecchie */
async function pota(cache, massimo) {
    const chiavi = await cache.keys();
    if (chiavi.length > massimo) await Promise.all(chiavi.slice(0, chiavi.length - massimo).map(k => cache.delete(k)));
}

async function salva(nome, massimo, url, risposta) {
    try {
        const cache = await caches.open(nome);
        await cache.put(url, risposta.clone());
        await pota(cache, massimo);
    } catch (e) { /* senza spazio o senza cache: l'immagine arriva lo stesso */ }
}

/** Scarica l'immagine e la salva. Gli sprite si chiedono con il CORS (così si possono tenere); se non lo permettono si ripiega sulla richiesta normale, e si tiene la risposta opaca */
async function scarica(richiesta, tipo) {
    const url = richiesta.url;
    if (tipo === 'sito') {
        const r = await fetch(url, { cache: 'no-cache' });
        if (r && r.ok && r.status === 200) await salva(CACHE_IMMAGINI, MASSIMO_IMMAGINI, url, r);
        return r;
    }
    if (!senzaCors.has(url)) {
        try {
            const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (r && r.ok && r.status === 200) await salva(CACHE_IMMAGINI, MASSIMO_IMMAGINI, url, r);
            return r;
        } catch (e) { senzaCors.add(url); }
    }
    const r = await fetch(richiesta);
    if (r && r.type === 'opaque') await salva(CACHE_OPACHE, MASSIMO_OPACHE, url, r);
    return r;
}

async function rispondiImmagine(evento, richiesta, tipo) {
    const url = richiesta.url;
    let salvata;
    try { salvata = (await (await caches.open(CACHE_IMMAGINI)).match(url)) || (await (await caches.open(CACHE_OPACHE)).match(url)); } catch (e) { salvata = undefined; }
    if (salvata && tipo === 'sprite') return salvata;                                         // gli sprite non cambiano: niente rete
    if (salvata) { evento.waitUntil(scarica(richiesta, tipo).catch(() => {})); return salvata; }   // immagine del sito: subito questa, e intanto si rinfresca
    try { return await scarica(richiesta, tipo); } catch (e) { return fetch(richiesta); }
}

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
    // le immagini dei Pokémon e del sito si tengono (vedi sopra); script, stili, Firebase, Showdown (le API)... vanno in rete come se il service worker non ci fosse
    if (richiesta.mode !== 'navigate') {
        const tipo = tipoImmagine(richiesta);
        if (tipo) evento.respondWith(rispondiImmagine(evento, richiesta, tipo));
        return;
    }
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
