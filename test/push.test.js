'use strict';
// Notifiche push (functions/push.js, docs/push.js, le parti nuove di docs/sw.js e di .github/workflows/checker.js):
//   - i testi e i destinatari (chi riceve cosa), i promemoria di scadenza;
//   - l'invio con un database e un "messaging" finti: token raccolti, token morti ritirati, una notifica "di stato" parte una volta sola;
//   - il lato app: chiave del token, che tipo di notifiche ha il telefono, lo stato mostrato;
//   - il service worker: la notifica compare, toccarla apre la pagina giusta;
//   - il cablaggio: i trigger esistono, il checker le chiama, l'APK ha il plugin e il permesso.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../functions/push.js');
const C = require('../docs/push.js');

const RADICE = path.join(__dirname, '..');
const leggi = (...p) => fs.readFileSync(path.join(RADICE, ...p), 'utf8');

// ---------- un database finto (percorsi con "/", once, transaction, remove) ----------

function dbFinto(dati = {}) {
    const albero = JSON.parse(JSON.stringify(dati));
    const prendi = percorso => percorso.split('/').filter(Boolean).reduce((x, k) => (x == null ? undefined : x[k]), albero);
    const metti = (percorso, valore) => {
        const k = percorso.split('/').filter(Boolean);
        let x = albero;
        for (const n of k.slice(0, -1)) x = x[n] = x[n] || {};
        if (valore === null) delete x[k[k.length - 1]]; else x[k[k.length - 1]] = valore;
    };
    return {
        albero,
        ref: percorso => ({
            once: async () => ({ val: () => { const v = prendi(percorso); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
            transaction: async fn => { const nuovo = fn(prendi(percorso) === undefined ? null : prendi(percorso)); if (nuovo === undefined) return { committed: false }; metti(percorso, nuovo); return { committed: true }; },
            remove: async () => metti(percorso, null),
            set: async v => metti(percorso, v)
        })
    };
}

/** messaging finto: registra i messaggi; i token che iniziano con "morto" falliscono come farebbe Firebase */
function messagingFinto() {
    const m = { inviati: [] };
    m.sendEachForMulticast = async msg => {
        m.inviati.push(msg);
        return { responses: msg.tokens.map(t => (t.startsWith('morto') ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : { success: true })) };
    };
    return m;
}

const UTENTI = { u1: { name: 'Didi' }, u2: { name: 'Lu' }, u3: { name: 'Ada' }, u4: { name: 'Tom' } };
const TOKEN = { u1: { a: { t: 'tok-didi' } }, u2: { b: { t: 'tok-lu-1' }, c: { t: 'morto-lu-2' } }, u3: { d: { t: 'tok-ada' } } };   // Tom non ha acceso le notifiche

// ---------- testi ----------

test('testo: ogni notifica ha titolo, corpo, pagina da aprire e un tag; tutto in inglese e con le pagine che esistono', () => {
    const casi = {
        sfida: { da: 'Lu', categoria: 'OU', bestOf: 3, stagione: 's2', id: 'x1' },
        'iscrizioni-aperte': { nome: 'Season 3', scadenza: '2026-11-03T20:30:00Z', stagione: 's3' },
        promemoria: { nome: 'Season 3', ore: 3, stagione: 's3' },
        mvp: { nome: 'Season 2', stagione: 's2' },
        'stagione-conclusa': { nome: 'Season 2', vincitore: 'Didi', stagione: 's2' },
        turno: { da: 'Lu', categoria: 'OU', stagione: 's2', id: 'p1' },
        'sfida-accettata': { a: 'Lu', categoria: 'OU', amichevole: true, sfida: 'x1', id: 'x1' },
        'mvp-scadenza': { nome: 'Season 2', ore: 3, stagione: 's2' },
        'iscrivi-team': { nome: 'Season 3', scadenza: '2026-11-03T20:30:00Z', stagione: 's3' },
        live: { p1: 'Didi', p2: 'Lu', categoria: 'OU', stagione: 's2', id: 'p1' },
        'mvp-nomina': { nome: 'Season 2', vincitore: 'Garchomp (Didi)', stagione: 's2' }
    };
    for (const [tipo, d] of Object.entries(casi)) {
        const n = P.testo(tipo, d);
        assert.ok(n.title && n.body && n.tag, tipo);
        const pagina = n.url.split('?')[0];
        assert.ok(fs.existsSync(path.join(RADICE, 'docs', pagina)), `${tipo}: la pagina ${pagina} non esiste`);
        assert.doesNotMatch(n.title + n.body, /undefined|NaN|\[object/, tipo);
    }
    assert.equal(P.testo('boh', {}), null);
    assert.match(P.testo('sfida', { da: 'Lu', categoria: 'OU', bestOf: 3, stagione: 's2', id: 'x' }).body, /Lu challenges you in OU · best of 3/);
    assert.equal(P.testo('sfida', { amichevole: true, da: 'Lu', stagione: 'amichevoli', id: 'x' }).title, 'Friendly challenge');
    assert.equal(P.testo('sfida', { amichevole: true, da: 'Lu', bestOf: 1, stagione: 'amichevoli' }).body, 'Lu challenges you', 'serie da uno: niente "best of 1"');
    assert.equal(P.testo('sfida', { da: 'Lu', stagione: 's 1/x' }).url, 'matches.html?id=s%201%2Fx', 'l\'id della stagione non rompe l\'indirizzo');
    assert.match(P.testo('iscrizioni-aperte', casi['iscrizioni-aperte']).body, /sign up before 03\/11 20:30 UTC/);
    assert.match(P.testo('iscrizioni-aperte', { nome: 'Season 3', scadenza: 'boh' }).body, /the deadline/);
    assert.match(P.testo('promemoria', { nome: 'S', ore: 24 }).body, /sign-ups close in less than a day/);
    assert.match(P.testo('stagione-conclusa', { nome: 'Season 2' }).body, /^Season 2 is over$/);
});

// ---------- destinatari ----------

test('uidDelGiocatore / uidDeiGiocatori / tuttiIGiocatori: il giocatore è il nome in minuscolo; chi non ha un account non c\'è', () => {
    assert.equal(P.uidDelGiocatore(UTENTI, 'didi'), 'u1');
    assert.equal(P.uidDelGiocatore(UTENTI, ' LU '), 'u2');
    assert.equal(P.uidDelGiocatore(UTENTI, 'nessuno'), '');
    assert.equal(P.uidDelGiocatore(null, 'didi'), '');
    assert.deepEqual(P.uidDeiGiocatori(UTENTI, ['didi', 'Lu', 'lu', 'fantasma']), ['u1', 'u2']);
    assert.deepEqual(P.tuttiIGiocatori(UTENTI).sort(), ['ada', 'didi', 'lu', 'tom']);
    assert.deepEqual(P.tuttiIGiocatori(undefined), []);
});

test('promemoriaDovuto: 24 ore e 3 ore prima della scadenza, mai dopo, mai se la stagione non è aperta', () => {
    const ora = Date.UTC(2026, 10, 1, 12);
    const tra = ore => new Date(ora + ore * 3600000).toISOString();
    const info = (ore, extra) => ({ status: 'open', deadline: tra(ore), ...extra });
    assert.equal(P.promemoriaDovuto(info(48), ora), 0, 'è presto');
    assert.equal(P.promemoriaDovuto(info(24), ora), 24);
    assert.equal(P.promemoriaDovuto(info(10), ora), 24);
    assert.equal(P.promemoriaDovuto(info(3), ora), 3);
    assert.equal(P.promemoriaDovuto(info(1), ora), 3, 'vicino alla scadenza parte quello da 3 ore, non quello da 24');
    assert.equal(P.promemoriaDovuto(info(-1), ora), 0, 'scaduta');
    assert.equal(P.promemoriaDovuto(info(5, { status: 'playing' }), ora), 0);
    assert.equal(P.promemoriaDovuto({ status: 'open' }, ora), 0, 'senza scadenza');
    assert.equal(P.promemoriaDovuto({ status: 'open', deadline: 'boh' }, ora), 0);
    assert.equal(P.promemoriaDovuto(null, ora), 0);
});

// ---------- invio ----------

test('messaggio: la notifica per il sistema (Android) e i dati per il service worker (web); il link è quello della pagina, senza indirizzi assoluti', () => {
    const m = P.messaggio(['a', 'b'], { title: 'T', body: 'B', url: 'matches.html?id=s2', tag: 'x' });
    assert.deepEqual(m.tokens, ['a', 'b']);
    assert.deepEqual(m.notification, { title: 'T', body: 'B' });
    assert.deepEqual(m.data, { url: 'matches.html?id=s2', tag: 'x' });
    assert.equal(m.android.priority, 'high');
    assert.equal(m.webpush.fcmOptions, undefined, 'fcmOptions.link vuole un https assoluto: la pagina la apre il service worker');
});

test('invia: raccoglie i token di chi ha acceso le notifiche, ritira quelli morti, conta le inviate', async () => {
    const db = dbFinto({ pushTokens: TOKEN });
    const messaging = messagingFinto();
    const r = await P.invia({ db, messaging, uids: ['u1', 'u2', 'u4'], n: P.testo('mvp', { nome: 'S', stagione: 's2' }) });
    assert.deepEqual(r, { inviate: 2, ritirati: 1, saltata: false });
    assert.equal(messaging.inviati.length, 1);
    assert.deepEqual(messaging.inviati[0].tokens.sort(), ['morto-lu-2', 'tok-didi', 'tok-lu-1']);
    assert.equal(db.albero.pushTokens.u2.c, undefined, 'il token morto è stato cancellato');
    assert.ok(db.albero.pushTokens.u2.b, 'quello buono resta');
    // nessun destinatario: niente invii
    assert.deepEqual(await P.invia({ db, messaging, uids: [], n: { title: 'x', body: 'y' } }), { inviate: 0, ritirati: 0, saltata: false });
    assert.deepEqual(await P.invia({ db, messaging, uids: ['u4'], n: { title: 'x', body: 'y' } }), { inviate: 0, ritirati: 0, saltata: false });
    assert.equal(messaging.inviati.length, 1, 'senza destinatari o senza token non parte nessun messaggio');
});

test('invia: con una chiave unica la notifica parte una volta sola, anche se il checker passa mille volte', async () => {
    const db = dbFinto({ pushTokens: TOKEN });
    const messaging = messagingFinto();
    const n = { title: 'T', body: 'B', url: 'index.html', tag: 't' };
    const prima = await P.invia({ db, messaging, uids: ['u1'], n, chiaveUnica: 'mvp-s2' });
    const seconda = await P.invia({ db, messaging, uids: ['u1'], n, chiaveUnica: 'mvp-s2' });
    assert.equal(prima.inviate, 1);
    assert.deepEqual(seconda, { inviate: 0, ritirati: 0, saltata: true });
    assert.equal(messaging.inviati.length, 1);
    assert.ok(db.albero.pushInviati['mvp-s2']);
    // i caratteri vietati nelle chiavi di Firebase non rompono nulla
    await P.invia({ db, messaging, uids: ['u1'], n, chiaveUnica: 'a.b#c/d' });
    assert.ok(db.albero.pushInviati['a_b_c_d']);
});

test('invia: oltre 500 token si manda a blocchi', async () => {
    const molti = {};
    for (let i = 0; i < 1203; i++) molti[`k${i}`] = { t: `tok${i}` };
    const db = dbFinto({ pushTokens: { u1: molti } });
    const messaging = messagingFinto();
    const r = await P.invia({ db, messaging, uids: ['u1'], n: { title: 'x', body: 'y' } });
    assert.equal(r.inviate, 1203);
    assert.deepEqual(messaging.inviati.map(m => m.tokens.length), [500, 500, 203]);
});

// ---------- gli eventi ----------

test('notificaSfida: la riceve lo sfidato (amichevole: per uid; di stagione: per nome); le sfide non più in attesa non notificano', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN });
    const messaging = messagingFinto();
    await P.notificaSfida({ db, messaging, stagione: 'amichevoli', id: 'f1', sfida: { stato: 'in_attesa', da: 'Lu', aUid: 'u1', categoria: 'Free battle', bestOf: 1 } });
    assert.deepEqual(messaging.inviati[0].tokens, ['tok-didi']);
    assert.equal(messaging.inviati[0].notification.title, 'Friendly challenge');
    await P.notificaSfida({ db, messaging, stagione: 's2', id: 's1', sfida: { stato: 'in_attesa', da: 'Didi', aId: 'ada', a: 'Ada', categoria: 'OU', bestOf: 3 } });
    assert.deepEqual(messaging.inviati[1].tokens, ['tok-ada']);
    assert.equal(messaging.inviati[1].data.url, 'matches.html?id=s2');
    assert.equal(await P.notificaSfida({ db, messaging, stagione: 's2', id: 's2', sfida: { stato: 'accettata', aId: 'ada' } }), null);
    assert.equal(await P.notificaSfida({ db, messaging, stagione: 's2', id: 's3', sfida: { stato: 'in_attesa', aId: 'sconosciuto' } }), null);
    assert.equal(messaging.inviati.length, 2);
});

test('notificaIscrizioniAperte: a tutti quelli che hanno le notifiche; una volta sola per stagione', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN });
    const messaging = messagingFinto();
    const info = { name: 'Season 3', deadline: '2026-11-03T20:30:00Z', status: 'open' };
    const r = await P.notificaIscrizioniAperte({ db, messaging, stagione: 's3', info });
    assert.equal(r.inviate, 3);
    assert.equal((await P.notificaIscrizioniAperte({ db, messaging, stagione: 's3', info })).saltata, true);
    assert.equal(messaging.inviati[0].notification.title, 'Sign-ups are open');
});

test('notificaPromemoria: a tutti quelli con le notifiche accese (iscritti o no); ogni soglia (24 e 3 ore) una volta sola', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN, seasons: { s3: { iscritti: { didi: true, lu: true } } } });
    const messaging = messagingFinto();
    const info = { name: 'Season 3', status: 'open' };
    const r = await P.notificaPromemoria({ db, messaging, stagione: 's3', info, ore: 24 });
    assert.ok(r.inviate >= 3);
    assert.ok(messaging.inviati[0].tokens.includes('tok-ada'), 'chi non è iscritto');
    assert.ok(messaging.inviati[0].tokens.length >= 3, 'e anche chi è già iscritto (Didi e Lu)');
    assert.equal((await P.notificaPromemoria({ db, messaging, stagione: 's3', info, ore: 24 })).saltata, true);
    assert.equal((await P.notificaPromemoria({ db, messaging, stagione: 's3', info, ore: 3 })).saltata, false, 'quella da 3 ore è un\'altra notifica');
});

test('notificaMvp: agli iscritti che non hanno ancora votato; notificaStagioneConclusa: agli iscritti, col vincitore', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN, seasons: { s2: { iscritti: { didi: true, lu: true, ada: true }, mvp: { voti: { lu: { scelte: [] } } } } } });
    const messaging = messagingFinto();
    const info = { name: 'Season 2', winner: { name: 'Didi' } };
    await P.notificaMvp({ db, messaging, stagione: 's2', info });
    assert.deepEqual(messaging.inviati[0].tokens.sort(), ['tok-ada', 'tok-didi'], 'Lu ha già votato');
    await P.notificaStagioneConclusa({ db, messaging, stagione: 's2', info });
    assert.match(messaging.inviati[1].notification.body, /Season 2 is over: Didi wins!/);
    assert.equal(messaging.inviati[1].tokens.length, 4);
});

// ---------- il lato app ----------

test('chiaveToken: corta, uguale per lo stesso token, diversa per token diversi, sicura per Firebase', () => {
    const t1 = 'fAkE:APA91b' + 'x'.repeat(140), t2 = t1 + 'y';
    assert.equal(C.chiaveToken(t1), C.chiaveToken(t1));
    assert.notEqual(C.chiaveToken(t1), C.chiaveToken(t2));
    assert.match(C.chiaveToken(t1), /^[a-z0-9]{6,30}$/);
    assert.match(C.chiaveToken(''), /^[a-z0-9]+$/);
});

test('supporto: nativo nell\'APK col plugin, web con tutto il necessario e la chiave VAPID, altrimenti niente', () => {
    const apk = { isNativePlatform: () => true, Plugins: { PushNotifications: {} } };
    assert.equal(C.supporto({ capacitor: apk }), 'nativo');
    assert.equal(C.supporto({ capacitor: { isNativePlatform: () => true, Plugins: {} } }), '', 'APK senza il plugin');
    assert.equal(C.supporto({ capacitor: { isNativePlatform: () => false, Plugins: { PushNotifications: {} } }, notification: true, serviceWorker: true, pushManager: true, vapid: 'k' }), 'web');
    assert.equal(C.supporto({ notification: true, serviceWorker: true, pushManager: true, vapid: 'k' }), 'web');
    assert.equal(C.supporto({ notification: true, serviceWorker: true, pushManager: true, vapid: '' }), '', 'senza chiave VAPID non si offrono');
    assert.equal(C.supporto({ notification: true, serviceWorker: true, pushManager: false, vapid: 'k' }), '', 'iPhone senza icona sulla Home');
    assert.equal(C.supporto({}), '');
    assert.equal(C.supporto(), '');
});

test('statoDa: non supportato, negato, acceso solo se l\'utente le ha accese e il permesso c\'è', () => {
    assert.equal(C.statoDa({ tipo: '', permesso: 'granted', acceso: true }), 'non-supportato');
    assert.equal(C.statoDa({ tipo: 'web', permesso: 'denied', acceso: true }), 'negato');
    assert.equal(C.statoDa({ tipo: 'web', permesso: 'granted', acceso: true }), 'acceso');
    assert.equal(C.statoDa({ tipo: 'web', permesso: 'granted', acceso: false }), 'spento');
    assert.equal(C.statoDa({ tipo: 'web', permesso: 'default', acceso: true }), 'spento', 'permesso mai dato: da accendere di nuovo');
    assert.equal(C.statoDa({ tipo: 'nativo', permesso: 'granted', acceso: true }), 'acceso');
});

test('la chiave VAPID, se c\'è, ha la forma giusta (87 caratteri base64 url)', () => {
    if (C.CHIAVE_VAPID) assert.match(C.CHIAVE_VAPID, /^[A-Za-z0-9_-]{80,100}$/);
    else assert.equal(C.CHIAVE_VAPID, '');
});

// ---------- il service worker ----------

function serviceWorker() {
    const ascoltatori = {};
    const mostrate = [], aperte = [], navigate = [], messe = { focus: 0 };
    const clienti = [];
    const sandbox = {
        self: {
            addEventListener: (tipo, f) => { ascoltatori[tipo] = f; },
            registration: { scope: 'https://x.test/didi-lu/', showNotification: async (titolo, opz) => { mostrate.push({ titolo, opz }); } },
            clients: {
                claim: async () => {}, matchAll: async () => clienti,
                openWindow: async url => { aperte.push(url); return {}; }
            },
            skipWaiting: () => Promise.resolve()
        },
        caches: { open: async () => ({ add: async () => {} }), keys: async () => [], delete: async () => true, match: async () => null },
        Request: class { }, URL, Response: { error: () => 'x' }, fetch: async () => 'x'
    };
    vm.runInNewContext(leggi('docs', 'sw.js'), sandbox);
    const evento = (tipo, extra) => { let p; ascoltatori[tipo]({ waitUntil: x => { p = x; }, ...extra }); return p; };
    return { evento, mostrate, aperte, navigate, clienti, messe };
}

test('service worker: la notifica compare con titolo, testo, tag e la pagina da aprire (anche se il messaggio è solo "data")', async () => {
    const sw = serviceWorker();
    await sw.evento('push', { data: { json: () => ({ notification: { title: 'You were challenged', body: 'Lu challenges you' }, data: { url: 'matches.html?id=s2', tag: 'sfida-1' } }) } });
    assert.equal(sw.mostrate[0].titolo, 'You were challenged');
    assert.equal(sw.mostrate[0].opz.body, 'Lu challenges you');
    assert.equal(sw.mostrate[0].opz.tag, 'sfida-1');
    assert.equal(sw.mostrate[0].opz.data.url, 'matches.html?id=s2');
    assert.match(sw.mostrate[0].opz.icon, /icon-192\.png$/);
    await sw.evento('push', { data: { json: () => ({ data: { title: 'Solo data', body: 'b' } }) } });
    assert.equal(sw.mostrate[1].titolo, 'Solo data');
    assert.equal(sw.mostrate[1].opz.data.url, 'index.html');
    // un messaggio rotto o vuoto non rompe niente: compare comunque una notifica col nome dell'app
    await sw.evento('push', { data: { json: () => { throw new Error('non è json'); } } });
    await sw.evento('push', {});
    assert.equal(sw.mostrate.length, 4);
    assert.equal(sw.mostrate[3].titolo, 'Sant\'Alvise League');
});

test('service worker: toccando la notifica si porta davanti l\'app aperta (e la si manda alla pagina), altrimenti si apre una finestra', async () => {
    const sw = serviceWorker();
    let chiusa = 0;
    const notifica = { close: () => { chiusa++; }, data: { url: 'matches.html?id=s2' } };
    await sw.evento('notificationclick', { notification: notifica });
    assert.equal(chiusa, 1);
    assert.deepEqual(sw.aperte, ['https://x.test/didi-lu/matches.html?id=s2'], 'app chiusa: finestra nuova, indirizzo risolto sul sito');
    let focus = 0; const navigati = [];
    sw.clienti.push({ url: 'https://x.test/didi-lu/box.html', focus: async () => { focus++; }, navigate: async u => { navigati.push(u); } });
    await sw.evento('notificationclick', { notification: notifica });
    assert.equal(focus, 1);
    assert.deepEqual(navigati, ['https://x.test/didi-lu/matches.html?id=s2']);
    assert.equal(sw.aperte.length, 1, 'non si apre una seconda finestra');
    // una finestra di un altro sito non è la nostra
    sw.clienti.length = 0;
    sw.clienti.push({ url: 'https://altro.test/', focus: async () => {}, navigate: async () => { assert.fail('non è nostra'); } });
    await sw.evento('notificationclick', { notification: { close() {}, data: null } });
    assert.equal(sw.aperte[1], 'https://x.test/didi-lu/index.html');
});

// ---------- il cablaggio ----------

test('cablaggio: i trigger ci sono, il checker manda promemoria e voto MVP, il sito carica push.js solo nell\'app, il DB ha il suo percorso', () => {
    const idx = leggi('functions', 'index.js');
    assert.match(idx, /exports\.pushSfidaRicevuta = onValueCreated\(\s*\{ \.\.\.OPZIONI_PUSH, ref: '\/sfide\/\{stagione\}\/\{id\}' \}/);
    assert.match(idx, /exports\.pushStatoStagione = onValueWritten\(\s*\{ \.\.\.OPZIONI_PUSH, ref: '\/seasons\/\{stagione\}\/info\/status' \}/);
    assert.match(idx, /push\.notificaIscrizioniAperte/);
    assert.match(idx, /push\.notificaStagioneConclusa/);
    assert.match(idx, /async function conLog/, 'un errore nelle notifiche non fa fallire altro');
    const chk = leggi('.github', 'workflows', 'checker.js');
    assert.match(chk, /push\.promemoriaDovuto\(info\)/);
    assert.match(chk, /push\.notificaPromemoria/);
    assert.match(chk, /Mvp\.finestraVoto\(info, avanzamento, id\);\s*if \(finestra\.aperta\)/);
    assert.match(chk, /push\.notificaMvp/);
    assert.match(chk, /catch \(e\) \{\s*console\.error\(`⚠️ Notifiche push/, 'gli errori delle notifiche non fermano il controllo delle stagioni');
    // il checker e le functions usano lo stesso file e la stessa chiave dei token del sito
    assert.equal(P.PERCORSO_TOKEN, 'pushTokens');
    assert.match(leggi('docs', 'push.js'), /`pushTokens\/\$\{uid\}\/\$\{chiaveToken\(token\)\}`/);
    // il sito carica push.js dalle impostazioni dell'app (app-comune.js), mai dalle pagine
    assert.match(leggi('docs', 'app-comune.js'), /replace\(\/app-comune\\\.js\/, 'push\.js'\)/);
    for (const f of fs.readdirSync(path.join(RADICE, 'docs')).filter(x => x.endsWith('.html'))) assert.doesNotMatch(leggi('docs', f), /push\.js/, f);
    // il file non tira dentro niente di pesante (lo carica anche il checker, che ha solo firebase-admin)
    assert.doesNotMatch(leggi('functions', 'push.js'), /require\((?!['"]\.\/)/);
});

test('APK: plugin delle notifiche nel package.json e nel lock, permesso Android 13, google-services.json solo se c\'è il Secret', () => {
    const pkg = JSON.parse(leggi('package.json'));
    const lock = JSON.parse(leggi('package-lock.json'));
    assert.match(pkg.dependencies['@capacitor/push-notifications'], /^\^8\./);
    assert.equal(lock.packages[''].dependencies['@capacitor/push-notifications'], pkg.dependencies['@capacitor/push-notifications']);
    assert.ok(lock.packages['node_modules/@capacitor/push-notifications']);
    const flusso = leggi('.github', 'workflows', 'android-apk.yml');
    assert.match(flusso, /secrets\.GOOGLE_SERVICES_JSON/);
    assert.match(flusso, /package_name": "com\.didilucabattles\.app"/, 'un google-services.json di un\'altra app non passa');
    assert.ok(flusso.indexOf('Notifiche push (google-services.json') < flusso.indexOf('npx cap sync android'), 'il file c\'è prima di sincronizzare e costruire');
    assert.ok(flusso.indexOf('Notifiche push (google-services.json') > flusso.indexOf('npx cap add android'), 'e dopo che il progetto Android esiste');
    assert.deepEqual(JSON.parse(leggi('capacitor.config.json')).plugins.PushNotifications.presentationOptions, ['badge', 'sound', 'alert']);
});


// ---------- le nuove notifiche ----------

const INFO_RANKED = { stagione: 's2', categoria: 'OU', p1: { nome: 'Didi', uid: 'u1' }, p2: { nome: 'Lu', uid: 'u2' } };

test('notificaTurno: quando uno dei due ha scelto e l\'altro no, tocca all\'altro (una volta per turno); se hanno scelto entrambi o nessuno, niente', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN, partite: { p1: { haScelto: { p1: 4 } } } });
    const messaging = messagingFinto();
    const r = await P.notificaTurno({ db, messaging, id: 'p1', info: INFO_RANKED });
    assert.equal(r.inviate, 1);
    assert.deepEqual(messaging.inviati[0].tokens.sort(), ['morto-lu-2', 'tok-lu-1'], 'a Lu, che non ha ancora scelto');
    assert.equal(messaging.inviati[0].notification.title, 'Your move!');
    assert.equal((await P.notificaTurno({ db, messaging, id: 'p1', info: INFO_RANKED })).saltata, true, 'lo stesso turno una volta sola');
    db.albero.partite.p1.haScelto = { p1: 4, p2: 4 };
    assert.equal(await P.notificaTurno({ db, messaging, id: 'p1', info: INFO_RANKED }), null, 'hanno scelto entrambi');
    db.albero.partite.p1.haScelto = {};
    assert.equal(await P.notificaTurno({ db, messaging, id: 'p1', info: INFO_RANKED }), null, 'nessuno');
    // amichevole: lo stesso, con la pagina della sfida
    const amic = { ...INFO_RANKED, amichevole: true, sfida: 'x9', stagione: undefined };
    db.albero.partite.p2 = { haScelto: { p2: 1 } };
    const m2 = messagingFinto();
    await P.notificaTurno({ db, messaging: m2, id: 'p2', info: amic });
    assert.deepEqual(m2.inviati[0].tokens, ['tok-didi']);
    assert.match(m2.inviati[0].data.url, /battle\.html\?amichevole=x9/);
});

test('notificaTurno: se il destinatario è dentro la partita (battito fresco del simulatore) non riceve niente; battito vecchio, sì', async () => {
    const adesso = Date.now();
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN, partite: { p1: { haScelto: { p1: 4 }, presenza: { p2: adesso - 5000 } } } });
    const messaging = messagingFinto();
    assert.equal(await P.notificaTurno({ db, messaging, id: 'p1', info: INFO_RANKED }), null, 'Lu sta giocando dal PC');
    assert.equal(messaging.inviati.length, 0);
    db.albero.partite.p1.presenza.p2 = adesso - 5 * 60000;
    assert.equal((await P.notificaTurno({ db, messaging, id: 'p1', info: INFO_RANKED })).inviate, 1, 'battito di cinque minuti fa: il simulatore è chiuso');
    assert.equal(P.inPartita(adesso - 1000), true);
    assert.equal(P.inPartita(adesso - P.PRESENZA_MS - 1), false);
    assert.equal(P.inPartita(undefined), false);
    assert.equal(P.inPartita(true), false, 'solo un orario');
});

test('il simulatore online segna la presenza (battito, tolta alla chiusura o se cade la rete) e nell\'app la toglie quando va in secondo piano', () => {
    const js = fs.readFileSync(path.join(RADICE, 'docs', 'motore-online.js'), 'utf8');
    assert.match(js, /partite\/\$\{this\.id\}\/presenza\/\$\{this\.lato\}/);
    assert.match(js, /onDisconnect\(\)\.remove\(\)/);
    assert.match(js, /setInterval\([\s\S]*30000\)/);
    assert.match(js, /chiudi\(\) \{[\s\S]*_togliPresenza/);
    assert.match(js, /visibilityState === 'hidden'\) togli\(\)/);
    assert.match(js, /if \(this\.lato\) \{\s*this\._presenza\(\);/, 'solo chi gioca (non gli spettatori)');
});

test('notificaSfidaAccettata: a chi ha lanciato la sfida, solo se è accettata, una volta sola', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN });
    const messaging = messagingFinto();
    assert.equal(await P.notificaSfidaAccettata({ db, messaging, stagione: 's2', id: 'x1', sfida: { stato: 'in_attesa', daId: 'didi' } }), null);
    const sfida = { stato: 'accettata', daId: 'didi', da: 'Didi', a: 'Lu', categoria: 'OU' };
    const r = await P.notificaSfidaAccettata({ db, messaging, stagione: 's2', id: 'x1', sfida });
    assert.equal(r.inviate, 1);
    assert.deepEqual(messaging.inviati[0].tokens, ['tok-didi']);
    assert.match(messaging.inviati[0].notification.body, /Lu accepted your challenge in OU/);
    assert.equal((await P.notificaSfidaAccettata({ db, messaging, stagione: 's2', id: 'x1', sfida })).saltata, true);
});

test('notificaLive: un match ufficiale in diretta va a tutti con le notifiche, tranne i due che giocano; le amichevoli no', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN });
    const messaging = messagingFinto();
    const r = await P.notificaLive({ db, messaging, id: 'p1', info: INFO_RANKED });
    assert.equal(r.inviate, 1);
    assert.deepEqual(messaging.inviati[0].tokens, ['tok-ada']);
    assert.equal(await P.notificaLive({ db, messaging, id: 'p2', info: { ...INFO_RANKED, amichevole: true } }), null);
    assert.equal(await P.notificaLive({ db, messaging, id: 'p3', info: { ...INFO_RANKED, stagione: '' } }), null);
});

test('mvpScadenzaDovuta / notificaMvpScadenza: tre ore prima della fine del voto, solo a chi non ha votato', async () => {
    const ora = Date.parse('2026-11-10T12:00:00Z');
    const finestra = ore => ({ aperta: true, fase: 'dopo', scade: ora + ore * 3600000 });
    assert.equal(P.mvpScadenzaDovuta(finestra(10), ora), 0);
    assert.equal(P.mvpScadenzaDovuta(finestra(3), ora), 3);
    assert.equal(P.mvpScadenzaDovuta(finestra(1), ora), 3);
    assert.equal(P.mvpScadenzaDovuta(finestra(-1), ora), 0, 'scaduto');
    assert.equal(P.mvpScadenzaDovuta({ aperta: true, fase: 'durante' }, ora), 0, 'prima della chiusura non c\'è una scadenza');
    assert.equal(P.mvpScadenzaDovuta({ aperta: false, fase: 'dopo', scade: ora + 1000 }, ora), 0);
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN, seasons: { s2: { iscritti: { didi: true, lu: true, ada: true }, mvp: { voti: { didi: {} } } } } });
    const messaging = messagingFinto();
    const r = await P.notificaMvpScadenza({ db, messaging, stagione: 's2', info: { name: 'Season 2' }, ore: 3 });
    assert.equal(r.inviate, 2, 'Lu (2 telefoni, uno morto) e Ada; Didi ha già votato');
    assert.match(messaging.inviati[0].notification.body, /about 3 hours left to vote/);
    assert.equal((await P.notificaMvpScadenza({ db, messaging, stagione: 's2', info: {}, ore: 3 })).saltata, true);
});

test('iscriviTeamDovuto / notificaIscriviTeam: a metà tempo tra apertura e scadenza, agli iscritti senza team in qualche formato', async () => {
    const apertaIl = Date.parse('2026-11-01T00:00:00Z');
    const info = { status: 'open', deadline: '2026-11-11T00:00:00Z', selected_formats: { a: 'OU', b: 'VGC' } };
    assert.equal(P.iscriviTeamDovuto(info, apertaIl, Date.parse('2026-11-05T23:00:00Z')), false, 'prima della metà');
    assert.equal(P.iscriviTeamDovuto(info, apertaIl, Date.parse('2026-11-06T00:00:00Z')), true, 'a metà');
    assert.equal(P.iscriviTeamDovuto(info, apertaIl, Date.parse('2026-11-12T00:00:00Z')), false, 'scaduta');
    assert.equal(P.iscriviTeamDovuto({ ...info, status: 'playing' }, apertaIl, Date.parse('2026-11-07T00:00:00Z')), false);
    assert.equal(P.iscriviTeamDovuto(info, NaN, Date.parse('2026-11-07T00:00:00Z')), false, 'senza la data di apertura non si sa');
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN, seasons: { s3: {
        iscritti: { didi: true, lu: true, ada: true },
        teams_iscritti: { OU: { didi: { count: 2 }, lu: { count: 1 }, ada: { count: 0 } }, VGC: { didi: { count: 1 } } }
    } } });
    const messaging = messagingFinto();
    const r = await P.notificaIscriviTeam({ db, messaging, stagione: 's3', info });
    assert.deepEqual(messaging.inviati[0].tokens.sort(), ['morto-lu-2', 'tok-ada', 'tok-lu-1'], 'Lu e Ada: a Didi non manca niente');
    assert.equal(r.inviate, 2);
    assert.equal((await P.notificaIscriviTeam({ db, messaging, stagione: 's3', info })).saltata, true);
});

test('notificaMvpNomina: l\'MVP ufficiale a tutti con le notifiche, col Pokémon e il giocatore; senza vincitori niente', async () => {
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN });
    const messaging = messagingFinto();
    assert.equal(await P.notificaMvpNomina({ db, messaging, stagione: 's2', info: {}, risultato: { vincitori: [] } }), null);
    const risultato = { vincitori: [{ chiave: 'k', specie: 'Garchomp', player: 'Didi' }] };
    const r = await P.notificaMvpNomina({ db, messaging, stagione: 's2', info: { name: 'Season 2' }, risultato });
    assert.equal(r.inviate, 3);
    assert.match(messaging.inviati[0].notification.body, /Season 2: Garchomp \(Didi\) is the MVP!/);
    assert.equal((await P.notificaMvpNomina({ db, messaging, stagione: 's2', info: {}, risultato })).saltata, true);
});

test('cablaggio delle nuove notifiche: i trigger, il checker e il service worker (niente notifica a sito aperto per turno e live)', () => {
    const idx = fs.readFileSync(path.join(RADICE, 'functions', 'index.js'), 'utf8');
    for (const [nome, rif] of [['pushTurno', '/partite/{id}/haScelto/{lato}'], ['pushSfidaAccettata', '/sfide/{stagione}/{id}/stato'], ['pushMatchLive', '/partite/{id}/stato'], ['pushMvpNomina', '/seasons/{stagione}/mvp/risultato']]) {
        assert.ok(idx.includes(`exports.${nome} =`), nome);
        assert.ok(idx.includes(`ref: '${rif}'`), `${nome}: ${rif}`);
    }
    assert.match(idx, /!== 'lobby'[\s\S]*!== 'in_corso'/, 'live: solo quando la partita parte');
    const chk = fs.readFileSync(path.join(RADICE, '.github', 'workflows', 'checker.js'), 'utf8');
    assert.match(chk, /push\.iscriviTeamDovuto\(info, apertaIl\)/);
    assert.match(chk, /push\.mvpScadenzaDovuta\(finestra\)/);
    const sw = fs.readFileSync(path.join(RADICE, 'docs', 'sw.js'), 'utf8');
    assert.doesNotMatch(sw, /soloChiusa/, 'il service worker non scarta più le notifiche a sito aperto: conta solo essere dentro quella partita');
});
