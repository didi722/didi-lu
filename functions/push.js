'use strict';
// =====================================================
// NOTIFICHE PUSH — Poké-Tournament (lato server)
// ---------------------------------------------------------------------
// Costruisce e invia le notifiche push (Firebase Cloud Messaging) ai telefoni dei giocatori che le hanno accese dall'app.
//   - sfida ricevuta (amichevole o di stagione)        -> index.js (trigger sul database)
//   - iscrizioni aperte, stagione conclusa              -> index.js (trigger sul database)
//   - promemoria scadenza iscrizioni, voto MVP aperto   -> .github/workflows/checker.js (ogni 30 minuti)
// I token stanno in pushTokens/{uid}/{chiave} = { t, os, creato }; li scrive il sito (docs/push.js) quando il giocatore accende le notifiche.
// Questo file non carica niente di pesante (solo i dati e `messaging` che gli si passano): lo usano sia le Cloud Functions sia lo script del checker.
// La parte pura (testi, destinatari, promemoria) è provata in test/push.test.js.
// =====================================================

const PERCORSO_TOKEN = 'pushTokens';
const PERCORSO_INVIATI = 'pushInviati';          // chiavi già notificate (una notifica "di stato" parte una volta sola)
const ORE_PROMEMORIA = [24, 3];                  // quante ore prima della scadenza delle iscrizioni

const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
const nomeStagione = (info, id) => (info && info.name) || `Season ${id}`;

// ---------- testi: tutto in inglese, come il sito ----------

/** { title, body, url, tag } per ogni tipo di notifica. `url` è la pagina che si apre toccandola. */
function testo(tipo, d = {}) {
    switch (tipo) {
        case 'sfida': {
            const quanto = d.bestOf > 1 ? ` · best of ${d.bestOf}` : '';
            return {
                title: d.amichevole ? 'Friendly challenge' : 'You were challenged',
                body: `${d.da} challenges you${d.categoria ? ` in ${d.categoria}` : ''}${quanto}`,
                url: d.amichevole ? 'index.html' : `matches.html?id=${encodeURIComponent(d.stagione || '')}`,
                tag: `sfida-${d.id || ''}`
            };
        }
        case 'iscrizioni-aperte':
            return {
                title: 'Sign-ups are open',
                body: `${d.nome} is open${d.scadenza ? `: sign up before ${quandoScade(d.scadenza)}` : ''}`,
                url: 'index.html', tag: `iscrizioni-${d.stagione || ''}`
            };
        case 'promemoria':
            return {
                title: 'Sign-ups close soon',
                body: `${d.nome}: sign-ups close in ${d.ore >= 24 ? 'less than a day' : `about ${d.ore} hours`}`,
                url: 'index.html', tag: `promemoria-${d.stagione || ''}`
            };
        case 'mvp':
            return {
                title: 'MVP voting is open',
                body: `Vote for the ${d.nome} MVP: 2 votes each`,
                url: `matches.html?id=${encodeURIComponent(d.stagione || '')}`, tag: `mvp-${d.stagione || ''}`
            };
        case 'stagione-conclusa':
            return {
                title: 'Season finished',
                body: d.vincitore ? `${d.nome} is over: ${d.vincitore} wins!` : `${d.nome} is over`,
                url: 'palmares.html', tag: `conclusa-${d.stagione || ''}`
            };
        case 'turno':
            return {
                title: 'Your move!',
                body: `${d.da} has played their turn${d.categoria ? ` in ${d.categoria}` : ''}`,
                url: partitaUrl(d), tag: `turno-${d.id || ''}`
            };
        case 'sfida-accettata':
            return {
                title: 'Challenge accepted',
                body: `${d.a} accepted your challenge${d.categoria ? ` in ${d.categoria}` : ''}: the match is ready`,
                url: partitaUrl(d), tag: `accettata-${d.id || ''}`
            };
        case 'mvp-scadenza':
            return {
                title: 'MVP voting closes soon',
                body: `${d.nome}: about ${d.ore} hours left to vote`,
                url: `matches.html?id=${encodeURIComponent(d.stagione || '')}`, tag: `mvp-scadenza-${d.stagione || ''}`
            };
        case 'iscrivi-team':
            return {
                title: 'Register your teams!',
                body: `${d.nome}: ${d.scadenza ? `sign-ups close ${quandoScade(d.scadenza)}` : 'sign-ups are closing'}, make sure your teams are registered`,
                url: `hub.html?id=${encodeURIComponent(d.stagione || '')}`, tag: `iscrivi-team-${d.stagione || ''}`
            };
        case 'live':
            return {
                title: 'Live now',
                body: `${d.p1} vs ${d.p2}${d.categoria ? ` · ${d.categoria}` : ''}`,
                url: `matches.html?id=${encodeURIComponent(d.stagione || '')}`, tag: `live-${d.id || ''}`
            };
        case 'mvp-nomina':
            return {
                title: 'Official MVP',
                body: `${d.nome}: ${d.vincitore} is the MVP!`,
                url: `matches.html?id=${encodeURIComponent(d.stagione || '')}`, tag: `mvp-nomina-${d.stagione || ''}`
            };
        default:
            return null;
    }
}

/** La pagina di una partita: quella amichevole dal suo id, quella di stagione dalla stagione */
function partitaUrl(d) {
    return d.amichevole ? `battle.html?amichevole=${encodeURIComponent(d.sfida || '')}` : `battle.html?stagione=${encodeURIComponent(d.stagione || '')}`;
}

function quandoScade(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return 'the deadline';
    const d = new Date(t);
    const due = n => String(n).padStart(2, '0');
    return `${due(d.getUTCDate())}/${due(d.getUTCMonth() + 1)} ${due(d.getUTCHours())}:${due(d.getUTCMinutes())} UTC`;
}

// ---------- destinatari ----------

/** L'uid di un giocatore (id = nome in minuscolo) dall'elenco `users` ({ uid: { name } }), o '' */
function uidDelGiocatore(utenti, idGiocatore) {
    const id = idDi(idGiocatore);
    return Object.keys(utenti || {}).find(u => idDi(utenti[u] && utenti[u].name) === id) || '';
}

/** Gli uid dei giocatori (id) indicati: quelli che non hanno un account non ci sono */
function uidDeiGiocatori(utenti, ids) {
    return [...new Set((ids || []).map(id => uidDelGiocatore(utenti, id)).filter(Boolean))];
}

/** Gli id di tutti i giocatori (nome in minuscolo) */
const tuttiIGiocatori = utenti => [...new Set(Object.values(utenti || {}).map(u => idDi(u && u.name)).filter(Boolean))];

// ---------- promemoria e voto: quando mandarli ----------

/**
 * Quale promemoria di scadenza delle iscrizioni è dovuto adesso per una stagione ('open' con scadenza futura): le ore (24, 3) della soglia
 * più vicina già superata, o 0. La chiave dedupe è per stagione+ore (vedi notificaPromemoria): il checker può passare mille volte, parte una sola.
 */
function promemoriaDovuto(info, adesso = Date.now()) {
    if (!info || idDi(info.status || 'open') !== 'open') return 0;
    const scadenza = Date.parse(info.deadline);
    if (!Number.isFinite(scadenza) || scadenza <= adesso) return 0;
    const mancano = scadenza - adesso;
    return [...ORE_PROMEMORIA].sort((a, b) => a - b).find(ore => mancano <= ore * 3600000) || 0;
}

/** Il promemoria della scadenza del voto MVP (dopo la chiusura della stagione): le ore (3) della soglia già superata, o 0. `finestra` è Mvp.finestraVoto(...) */
const ORE_MVP_SCADENZA = [3];
function mvpScadenzaDovuta(finestra, adesso = Date.now()) {
    if (!finestra || !finestra.aperta || finestra.fase !== 'dopo' || !Number.isFinite(finestra.scade) || finestra.scade <= adesso) return 0;
    const mancano = finestra.scade - adesso;
    return [...ORE_MVP_SCADENZA].sort((a, b) => a - b).find(ore => mancano <= ore * 3600000) || 0;
}

/** "Iscrivi i tuoi team": a metà strada tra l'apertura della stagione (`apertaIl`, ms: quando è partita la notifica di apertura) e la scadenza delle iscrizioni */
function iscriviTeamDovuto(info, apertaIl, adesso = Date.now()) {
    if (!info || idDi(info.status || 'open') !== 'open' || !Number.isFinite(apertaIl)) return false;
    const scadenza = Date.parse(info.deadline);
    if (!Number.isFinite(scadenza) || scadenza <= adesso || scadenza <= apertaIl) return false;
    return adesso >= apertaIl + (scadenza - apertaIl) / 2;
}

// ---------- invio ----------

/** Tutti i token (con chi li ha) di questi uid: [{ uid, chiave, token }] */
async function tokenDi(db, uids) {
    const out = [];
    await Promise.all([...new Set(uids || [])].map(async uid => {
        const snap = await db.ref(`${PERCORSO_TOKEN}/${uid}`).once('value');
        const v = snap.val() || {};
        for (const [chiave, x] of Object.entries(v)) if (x && typeof x.t === 'string' && x.t) out.push({ uid, chiave, token: x.t });
    }));
    return out;
}

/** Tutti gli uid che hanno almeno un token */
async function uidConToken(db) {
    const v = (await db.ref(PERCORSO_TOKEN).once('value')).val() || {};
    return Object.keys(v).filter(u => v[u] && Object.keys(v[u]).length);
}

/** Il messaggio FCM per un token: `notification` fa comparire la notifica anche quando l'app è chiusa (Android), `data.url` dice dove andare */
function messaggio(tokens, n) {
    return {
        tokens,
        notification: { title: n.title, body: n.body },
        data: { url: n.url || 'index.html', tag: n.tag || '' },
        // sul web la notifica la disegna il service worker del sito (docs/sw.js) e apre `data.url`; su Android la disegna il sistema
        webpush: { headers: { Urgency: 'high', TTL: '86400' } },
        android: { priority: 'high', ttl: 86400000, notification: { tag: n.tag || undefined } }
    };
}

const TOKEN_MORTO = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

/**
 * Manda `n` ({title, body, url, tag}) a questi uid. I token che Firebase dice morti (app disinstallata, permesso tolto) si cancellano.
 * `chiaveUnica`: se c'è, la notifica parte una volta sola (pushInviati/{chiave}). Restituisce { inviate, ritirati, saltata }.
 */
async function invia({ db, messaging, uids, n, chiaveUnica = '' }) {
    if (!n || !uids || !uids.length) return { inviate: 0, ritirati: 0, saltata: false };
    if (chiaveUnica) {
        const chiave = String(chiaveUnica).replace(/[.#$\[\]/]/g, '_');
        const esito = await db.ref(`${PERCORSO_INVIATI}/${chiave}`).transaction(cur => (cur ? undefined : Date.now()));   // già c'è: si annulla (committed = false)
        if (!esito.committed) return { inviate: 0, ritirati: 0, saltata: true };
    }
    const elenco = await tokenDi(db, uids);
    let inviate = 0, ritirati = 0;
    for (let i = 0; i < elenco.length; i += 500) {
        const blocco = elenco.slice(i, i + 500);
        const r = await messaging.sendEachForMulticast(messaggio(blocco.map(x => x.token), n));
        const morti = [];
        r.responses.forEach((x, k) => {
            if (x.success) inviate++;
            else if (x.error && TOKEN_MORTO.has(x.error.code)) morti.push(blocco[k]);
        });
        await Promise.all(morti.map(x => db.ref(`${PERCORSO_TOKEN}/${x.uid}/${x.chiave}`).remove()));
        ritirati += morti.length;
    }
    return { inviate, ritirati, saltata: false };
}

// ---------- gli eventi, uno per uno (li usano index.js e il checker) ----------

async function notificaSfida({ db, messaging, stagione, id, sfida }) {
    if (!sfida || sfida.stato !== 'in_attesa') return null;
    const utenti = (await db.ref('users').once('value')).val() || {};
    const uid = sfida.aUid || uidDelGiocatore(utenti, sfida.aId || sfida.a);
    if (!uid) return null;
    const n = testo('sfida', { amichevole: stagione === 'amichevoli', da: sfida.da, categoria: sfida.categoria, bestOf: sfida.bestOf, stagione, id });
    return invia({ db, messaging, uids: [uid], n, chiaveUnica: `sfida-${stagione}-${id}` });
}

async function notificaIscrizioniAperte({ db, messaging, stagione, info }) {
    const uids = await uidConToken(db);
    const n = testo('iscrizioni-aperte', { nome: nomeStagione(info, stagione), scadenza: info.deadline, stagione });
    return invia({ db, messaging, uids, n, chiaveUnica: `aperta-${stagione}` });
}

async function notificaStagioneConclusa({ db, messaging, stagione, info }) {
    const [utenti, iscrittiSnap] = await Promise.all([db.ref('users').once('value'), db.ref(`seasons/${stagione}/iscritti`).once('value')]);
    const uids = uidDeiGiocatori(utenti.val() || {}, Object.keys(iscrittiSnap.val() || {}));
    const n = testo('stagione-conclusa', { nome: nomeStagione(info, stagione), vincitore: info.winner && (info.winner.name || info.winner) || '', stagione });
    return invia({ db, messaging, uids, n, chiaveUnica: `conclusa-${stagione}` });
}

/** Promemoria: a tutti quelli che hanno acceso le notifiche (iscritti o no: la scadenza interessa a tutti, e il testo non dice "iscriviti") */
async function notificaPromemoria({ db, messaging, stagione, info, ore }) {
    const uids = await uidConToken(db);
    const n = testo('promemoria', { nome: nomeStagione(info, stagione), ore, stagione });
    return invia({ db, messaging, uids, n, chiaveUnica: `promemoria-${stagione}-${ore}` });
}

/** Voto MVP aperto: agli iscritti che non hanno ancora votato */
async function notificaMvp({ db, messaging, stagione, info }) {
    const [utenti, iscrittiSnap, votiSnap] = await Promise.all([
        db.ref('users').once('value'), db.ref(`seasons/${stagione}/iscritti`).once('value'), db.ref(`seasons/${stagione}/mvp/voti`).once('value')
    ]);
    const votato = new Set(Object.keys(votiSnap.val() || {}).map(idDi));
    const ids = Object.keys(iscrittiSnap.val() || {}).filter(id => !votato.has(idDi(id)));
    const n = testo('mvp', { nome: nomeStagione(info, stagione), stagione });
    return invia({ db, messaging, uids: uidDeiGiocatori(utenti.val() || {}, ids), n, chiaveUnica: `mvp-${stagione}` });
}

/** Chi sta dentro la partita (simulatore aperto) segna `partite/{id}/presenza/{lato}` con un battito ogni 30 s (docs/motore-online.js): se è fresco non gli si manda niente */
const PRESENZA_MS = 90000;
const inPartita = (battito, adesso = Date.now()) => typeof battito === 'number' && Number.isFinite(battito) && adesso - battito < PRESENZA_MS;

/** L'avversario ha scelto la sua mossa e tu no: tocca a te (una volta per turno), a meno che tu non sia già dentro la partita */
async function notificaTurno({ db, messaging, id, info }) {
    if (!info || !info.p1 || !info.p2) return null;
    const scelto = (await db.ref(`partite/${id}/haScelto`).once('value')).val() || {};
    const lati = ['p1', 'p2'].filter(l => scelto[l] !== undefined && scelto[l] !== null);
    if (lati.length !== 1) return null;                      // nessuno ha scelto, o hanno scelto entrambi: il turno è già andato
    const chi = lati[0], altro = chi === 'p1' ? 'p2' : 'p1';
    const uid = info[altro].uid;
    if (!uid) return null;
    const battito = (await db.ref(`partite/${id}/presenza/${altro}`).once('value')).val();
    if (inPartita(battito)) return null;                      // il simulatore è aperto: la mossa dell'avversario la vede lì
    const n = testo('turno', { da: info[chi].nome, categoria: info.categoria, amichevole: !!info.amichevole, sfida: info.sfida, stagione: info.stagione, id });
    return invia({ db, messaging, uids: [uid], n, chiaveUnica: `turno-${id}-${scelto[chi]}-${chi}` });
}

/** La sfida che hai lanciato è stata accettata (la partita è pronta) */
async function notificaSfidaAccettata({ db, messaging, stagione, id, sfida }) {
    if (!sfida || sfida.stato !== 'accettata') return null;
    const utenti = (await db.ref('users').once('value')).val() || {};
    const uid = sfida.daUid || uidDelGiocatore(utenti, sfida.daId || sfida.da);
    if (!uid) return null;
    const n = testo('sfida-accettata', { a: sfida.a, categoria: sfida.categoria, amichevole: stagione === 'amichevoli', sfida: id, stagione, id });
    return invia({ db, messaging, uids: [uid], n, chiaveUnica: `accettata-${stagione}-${id}` });
}

/** Il voto MVP sta per chiudersi: a chi non ha ancora votato */
async function notificaMvpScadenza({ db, messaging, stagione, info, ore }) {
    const [utenti, iscrittiSnap, votiSnap] = await Promise.all([
        db.ref('users').once('value'), db.ref(`seasons/${stagione}/iscritti`).once('value'), db.ref(`seasons/${stagione}/mvp/voti`).once('value')
    ]);
    const votato = new Set(Object.keys(votiSnap.val() || {}).map(idDi));
    const ids = Object.keys(iscrittiSnap.val() || {}).filter(id => !votato.has(idDi(id)));
    const n = testo('mvp-scadenza', { nome: nomeStagione(info, stagione), ore, stagione });
    return invia({ db, messaging, uids: uidDeiGiocatori(utenti.val() || {}, ids), n, chiaveUnica: `mvp-scadenza-${stagione}-${ore}` });
}

/** "Iscrivi i tuoi team": agli iscritti che in qualche formato non hanno ancora registrato nessun team */
async function notificaIscriviTeam({ db, messaging, stagione, info }) {
    const [utenti, iscrittiSnap, teamSnap] = await Promise.all([
        db.ref('users').once('value'), db.ref(`seasons/${stagione}/iscritti`).once('value'), db.ref(`seasons/${stagione}/teams_iscritti`).once('value')
    ]);
    const formati = Object.values((info && info.selected_formats) || {});
    const teams = teamSnap.val() || {};
    const senzaTeam = id => formati.some(f => {
        const voci = teams[f] || {};
        const chiave = Object.keys(voci).find(k => idDi(k) === idDi(id));
        return !chiave || !(voci[chiave] && voci[chiave].count > 0);
    });
    const ids = Object.keys(iscrittiSnap.val() || {}).filter(senzaTeam);
    const n = testo('iscrivi-team', { nome: nomeStagione(info, stagione), scadenza: info.deadline, stagione });
    return invia({ db, messaging, uids: uidDeiGiocatori(utenti.val() || {}, ids), n, chiaveUnica: `iscrivi-team-${stagione}` });
}

/** Un match ufficiale (ranked) è in diretta: a tutti quelli con le notifiche accese, tranne i due che giocano */
async function notificaLive({ db, messaging, id, info }) {
    if (!info || info.amichevole || !info.stagione || !info.p1 || !info.p2) return null;
    const uids = (await uidConToken(db)).filter(u => u !== info.p1.uid && u !== info.p2.uid);
    const n = testo('live', { p1: info.p1.nome, p2: info.p2.nome, categoria: info.categoria, stagione: info.stagione, id });
    return invia({ db, messaging, uids, n, chiaveUnica: `live-${id}` });
}

/** L'MVP ufficiale della stagione (lo scrive il conteggio dei voti in seasons/{id}/mvp/risultato): a tutti quelli con le notifiche accese */
async function notificaMvpNomina({ db, messaging, stagione, info, risultato }) {
    const v = risultato && risultato.vincitori;
    const lista = (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : [])).filter(x => x && x.chiave);
    if (!lista.length) return null;
    const m = lista[0];
    const vincitore = `${m.specie || 'A Pokémon'}${m.player ? ` (${m.player})` : ''}`;
    const uids = await uidConToken(db);
    const n = testo('mvp-nomina', { nome: nomeStagione(info, stagione), vincitore, stagione });
    return invia({ db, messaging, uids, n, chiaveUnica: `mvp-nomina-${stagione}` });
}

module.exports = {
    PERCORSO_TOKEN, PERCORSO_INVIATI, ORE_PROMEMORIA,
    testo, quandoScade, uidDelGiocatore, uidDeiGiocatori, tuttiIGiocatori, promemoriaDovuto, messaggio,
    tokenDi, uidConToken, invia,
    notificaSfida, notificaIscrizioniAperte, notificaStagioneConclusa, notificaPromemoria, notificaMvp,
    ORE_MVP_SCADENZA, mvpScadenzaDovuta, iscriviTeamDovuto, PRESENZA_MS, inPartita,
    notificaTurno, notificaSfidaAccettata, notificaMvpScadenza, notificaIscriviTeam, notificaLive, notificaMvpNomina
};
