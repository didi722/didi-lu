'use strict';
// =====================================================
// CLOUD FUNCTIONS — Poké-Tournament
// Tutta la logica sta in partita.js. Qui si collega a Firebase.
// =====================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueWritten, onValueCreated } = require('firebase-functions/v2/database');
const { getMessaging } = require('firebase-admin/messaging');
// partita.js porta con sé il simulatore completo di Showdown (migliaia di file): si carica alla prima richiesta e non all'avvio,
// così il contenitore apre subito la porta e supera il controllo di avvio di Cloud Run anche quando leggere i file è lento
let moduloPartita = null;
const partita = () => (moduloPartita ||= require('./partita'));
// dopo l'avvio (la porta è già aperta) lo si carica comunque, così la prima partita non lo aspetta. Solo su Cloud Run (K_SERVICE c'è sempre):
// durante `firebase deploy` il codice viene solo letto per elencare le funzioni, e caricare il simulatore (migliaia di file) in quel momento
// può superare i 10 secondi del controllo ("User code failed to load. Cannot determine backend specification. Timeout after 10000")
if (process.env.K_SERVICE) {
    setTimeout(() => { try { partita(); } catch (e) { console.error('Caricamento di partita.js fallito', e); } }, 200).unref();
}

initializeApp();

const REGIONE = 'europe-west1';
const ISTANZA_DB = 'pokemonsuite-didi-lu-default-rtdb';
const BUCKET = 'pokemonsuite-didi-lu.firebasestorage.app';
// Indirizzo del sito: serve ai replay per gli avatar salvati con un percorso relativo
// (es. "immagini/avatar/didi.png"). Gli avatar con l'indirizzo completo funzionano comunque.
const SITO = process.env.SITO_URL || 'https://pokemonsuite-didi-lu.web.app';

// risultati-match.js è lo STESSO file del sito: lo si esegue qui con il database del server.
function caricaRegistraRisultato(db) {
    const contesto = vm.createContext({ db, fetch, console, setTimeout, clearTimeout });
    const codice = fs.readFileSync(path.join(__dirname, 'risultati-match.js'), 'utf8');
    vm.runInContext(codice, contesto, { filename: 'risultati-match.js' });
    return contesto.registraRisultatoMatch;
}

let servizio = null;
function prendiServizio() {
    if (servizio) return servizio;
    const db = getDatabase();
    const bucket = getStorage().bucket(BUCKET);

    // Carica il replay nello stesso percorso usato dall'upload manuale
    async function salvaReplay(percorso, html) {
        const token = crypto.randomUUID();
        await bucket.file(percorso).save(html, {
            resumable: false,
            contentType: 'text/html; charset=utf-8',
            metadata: { metadata: { firebaseStorageDownloadTokens: token } }
        });
        return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(percorso)}?alt=media&token=${token}`;
    }

    servizio = partita().creaServizio({
        db,
        salvaReplay,
        registraRisultato: r => caricaRegistraRisultato(db)(r),
        segreto: process.env.CHIAVE_SCELTE,
        sito: SITO
    });
    return servizio;
}

// Trasforma gli errori "per il giocatore" in messaggi leggibili dal sito
function richiamabile(nome, opzioni = {}) {
    return onCall({ 
        region: REGIONE, 
        // 1 GiB: a ogni scelta il server ricostruisce la battaglia dall'inizio con il simulatore completo, e con più partite in
        // corso la memoria da 512 MiB si esauriva: l'istanza veniva riavviata e le richieste fallivano (nel browser: "CORS policy")
        memory: '1GiB', 
        timeoutSeconds: 60, 
        cors: true,
        ...opzioni 
    }, async richiesta => {
        if (!richiesta.auth) throw new HttpsError('unauthenticated', 'Devi essere loggato');
        try {
            return await prendiServizio()[nome](richiesta.auth.uid, richiesta.data || {});
        } catch (e) {
            if (e instanceof partita().ErroreUtente) throw new HttpsError('failed-precondition', e.message);
            console.error(nome, e);
            throw new HttpsError('internal', 'Errore del server: riprova tra poco');
        }
    });
}
// Reazioni alle partite in diretta (functions/reazioni.js): leggere è dei client, scrivere solo da qui. Leggera: niente simulatore.
const { creaReazioni, ErroreReazione } = require('./reazioni');
let reazioni = null;
exports.reagisciPartita = onCall({ region: REGIONE, memory: '256MiB', timeoutSeconds: 15, cors: true }, async richiesta => {
    if (!richiesta.auth) throw new HttpsError('unauthenticated', 'Devi essere loggato');
    try {
        reazioni ||= creaReazioni({ db: getDatabase() });
        return await reazioni.reagisci(richiesta.auth.uid, richiesta.data || {});
    } catch (e) {
        if (e instanceof ErroreReazione) throw new HttpsError(e.codice, e.message);
        console.error('reagisciPartita', e);
        throw new HttpsError('internal', 'Errore del server: riprova tra poco');
    }
});

exports.apriPartita = richiamabile('apriPartita');
exports.prontoPartita = richiamabile('pronto');
exports.inviaScelta = richiamabile('inviaScelta', { minInstances: 0 });
exports.annullaScelta = richiamabile('annullaScelta');   // ritirare la propria scelta finché l'avversario non ha scelto

// Partite amichevoli: sfidare un altro giocatore fuori dalle stagioni (niente punti, niente statistiche, niente replay).
// La partita vera usa le stesse funzioni di quelle ufficiali (apriPartita con { amichevole }, prontoPartita, inviaScelta...).
exports.sfidaAmichevole = richiamabile('sfidaAmichevole');
exports.rispondiAmichevole = richiamabile('rispondiAmichevole');

// Quando l'ultimo set finisce, il match si salva da solo
exports.salvaPartitaConclusa = onValueWritten(
    { ref: '/partite/{id}/stato', instance: ISTANZA_DB, region: REGIONE, memory: '1GiB', timeoutSeconds: 300 },
    async evento => {
        if (evento.data.after.val() !== 'da_salvare') return;
        await prendiServizio().salvaPartita(evento.params.id);
    }
);


// ---------------------------------------------------------------------------------------------------------------------------------
// NOTIFICHE PUSH (push.js). Qui gli eventi che si vedono subito sul database; i promemoria e il voto MVP li manda il checker
// (.github/workflows/checker.js, ogni 30 minuti). Leggere e scrivere a nome del server: chi ha acceso le notifiche ha i suoi token in pushTokens/{uid}.
// Un errore nelle notifiche non deve mai far fallire il resto: si scrive nel log e basta.
// ---------------------------------------------------------------------------------------------------------------------------------
const push = require('./push');
const OPZIONI_PUSH = { instance: ISTANZA_DB, region: REGIONE, memory: '256MiB' };
async function conLog(nome, fn) {
    try { return await fn(); } catch (e) { console.error(`Notifica push (${nome}) non inviata:`, e); return null; }
}

// Una sfida ricevuta: amichevole (sfide/amichevoli/{id}) o di stagione (sfide/{stagione}/{id})
exports.pushSfidaRicevuta = onValueCreated(
    { ...OPZIONI_PUSH, ref: '/sfide/{stagione}/{id}' },
    evento => conLog('sfida', () => push.notificaSfida({
        db: getDatabase(), messaging: getMessaging(), stagione: evento.params.stagione, id: evento.params.id, sfida: evento.data.val()
    }))
);

// L'avversario ha giocato il suo turno (ha scelto la mossa e tu no): partite ufficiali e amichevoli
exports.pushTurno = onValueCreated(
    { ...OPZIONI_PUSH, ref: '/partite/{id}/haScelto/{lato}' },
    evento => conLog('turno', async () => {
        const db = getDatabase();
        const info = (await db.ref(`partite/${evento.params.id}/info`).once('value')).val();
        return push.notificaTurno({ db, messaging: getMessaging(), id: evento.params.id, info });
    })
);

// La sfida che avevi lanciato è stata accettata (di stagione o amichevole)
exports.pushSfidaAccettata = onValueWritten(
    { ...OPZIONI_PUSH, ref: '/sfide/{stagione}/{id}/stato' },
    evento => conLog('sfida-accettata', async () => {
        if (String(evento.data.before.val() || '') === 'accettata' || String(evento.data.after.val() || '') !== 'accettata') return null;
        const db = getDatabase();
        const sfida = (await db.ref(`sfide/${evento.params.stagione}/${evento.params.id}`).once('value')).val();
        return push.notificaSfidaAccettata({ db, messaging: getMessaging(), stagione: evento.params.stagione, id: evento.params.id, sfida });
    })
);

// Un match ufficiale (ranked) comincia (i due sono pronti: la partita passa da lobby a in_corso): gli altri lo sanno
exports.pushMatchLive = onValueWritten(
    { ...OPZIONI_PUSH, ref: '/partite/{id}/stato' },
    evento => conLog('live', async () => {
        if (String(evento.data.before.val() || '') !== 'lobby' || String(evento.data.after.val() || '') !== 'in_corso') return null;
        const db = getDatabase();
        const info = (await db.ref(`partite/${evento.params.id}/info`).once('value')).val();
        return push.notificaLive({ db, messaging: getMessaging(), id: evento.params.id, info });
    })
);

// L'MVP ufficiale di una stagione (il conteggio dei voti scrive il risultato)
exports.pushMvpNomina = onValueCreated(
    { ...OPZIONI_PUSH, ref: '/seasons/{stagione}/mvp/risultato' },
    evento => conLog('mvp-nomina', async () => {
        const db = getDatabase();
        const info = (await db.ref(`seasons/${evento.params.stagione}/info`).once('value')).val() || {};
        // 100 monete a chi ha il Pokémon MVP (una volta sola)
        try {
            for (const v of Object.values((evento.data.val() || {}).vincitori || {})) {
                if (v && v.player) await monete.accredita(db, await monete.uidDi(db, v.player), monete.PREMI.mvp, `MVP: ${v.specie || 'Pokémon'}`, { chiave: `mvp-${evento.params.stagione}-${v.chiave || v.player}` });
            }
        } catch (e) { console.error('Monete MVP', e); }
        return push.notificaMvpNomina({ db, messaging: getMessaging(), stagione: evento.params.stagione, info, risultato: evento.data.val() });
    })
);

// Una notifica di prova a se stessi (il tasto "Send a test" del campanello): serve a controllare che sul proprio telefono o browser arrivino davvero
exports.provaNotifica = onCall({ region: REGIONE, memory: '256MiB', timeoutSeconds: 30, cors: true }, async richiesta => {
    if (!richiesta.auth) throw new HttpsError('unauthenticated', 'Devi essere loggato');
    try {
        return await push.notificaProva({ db: getDatabase(), messaging: getMessaging(), uid: richiesta.auth.uid });
    } catch (e) {
        if (e && e.codice) throw new HttpsError(e.codice, e.message);
        console.error('provaNotifica', e);
        throw new HttpsError('internal', 'Errore del server: riprova tra poco');
    }
});

// Eliminare un giocatore (solo un admin): oltre ai dati nel database toglie anche il suo account da Firebase Authentication (così il suo UID non esiste più).
// Dati toccati: players/<nome>, users/<uid>, wallet/<uid>, e i suoi avatar/colori/canzoni nel registro cosmeticiPresi (tornano liberi).
exports.eliminaGiocatore = onCall({ region: REGIONE, memory: '256MiB', timeoutSeconds: 30, cors: true }, async richiesta => {
    if (!richiesta.auth) throw new HttpsError('unauthenticated', 'Devi essere loggato');
    const db = getDatabase();
    const ruolo = (await db.ref(`users/${richiesta.auth.uid}/role`).once('value')).val();
    if (ruolo !== 'admin') throw new HttpsError('permission-denied', 'Solo un admin può eliminare un giocatore');
    const nome = String((richiesta.data || {}).nome || '').toLowerCase().trim();
    if (!nome || /[.#$\[\]/]/.test(nome)) throw new HttpsError('invalid-argument', 'Nome non valido');
    try {
        const info = (await db.ref(`players/${nome}`).once('value')).val() || {};
        let uid = (info.stats && info.stats.uid_riferimento) || '';
        if (!uid) {      // vecchi record: si cerca in users il nome
            const utenti = (await db.ref('users').once('value')).val() || {};
            uid = Object.keys(utenti).find(k => String((utenti[k] || {}).name || '').toLowerCase().trim() === nome) || '';
        }
        if (uid && uid === richiesta.auth.uid) throw new HttpsError('failed-precondition', 'Non puoi eliminare te stesso');
        let accountEliminato = false;
        if (uid) {
            try { await getAuth().deleteUser(uid); accountEliminato = true; }
            catch (e) { if (!(e && e.code === 'auth/user-not-found')) throw e; }
        }
        const aggiornamenti = { [`players/${nome}`]: null };
        if (uid) { aggiornamenti[`users/${uid}`] = null; aggiornamenti[`wallet/${uid}`] = null; }
        const presi = (await db.ref('cosmeticiPresi').once('value')).val() || {};
        for (const [id, chi] of Object.entries(presi)) if (String(chi).toLowerCase() === nome) aggiornamenti[`cosmeticiPresi/${id}`] = null;
        await db.ref().update(aggiornamenti);
        return { ok: true, uid, accountEliminato };
    } catch (e) {
        if (e instanceof HttpsError) throw e;
        console.error('eliminaGiocatore', e);
        throw new HttpsError('internal', 'Errore del server: riprova tra poco');
    }
});

// Il negozio (functions/monete.js): comprare, mettere e (avatar, colori, canzoni) rilasciare i cosmetici. Il saldo lo scrive solo il server.
const monete = require('./monete');
const negozio = nome => onCall({ region: REGIONE, memory: '256MiB', timeoutSeconds: 20, cors: true }, async richiesta => {
    if (!richiesta.auth) throw new HttpsError('unauthenticated', 'Devi essere loggato');
    const dati = richiesta.data || {};
    try {
        const esito = await monete[nome]({
            db: getDatabase(), uid: richiesta.auth.uid, id: String(dati.id || ''), attivo: dati.attivo !== false,
            nome: String(dati.nome || '').slice(0, 60), team: String(dati.team || ''), indice: dati.indice,
            tipo: String(dati.tipo || ''), url: String(dati.url || '').slice(0, 600), rilascia: String(dati.rilascia || '').slice(0, 80)
        });
        return esito;
    } catch (e) {
        console.error(nome, e);
        throw new HttpsError('internal', 'Errore del server: riprova tra poco');
    }
});
exports.acquistaCosmetico = negozio('acquista');
exports.equipaCosmetico = negozio('equipa');
exports.cambiaCosmetico = negozio('cambia');             // indossare un avatar, un colore o una canzone che si ha (gratis); la canzone si può anche togliere
exports.rilasciaCosmetico = negozio('rilascia');         // lasciare andare un avatar, un colore o una canzone (gratis): torna libero per tutti
exports.shinyPokemonTeam = negozio('shinyPokemon');      // lo shiny di un Pokémon di un team del Box (anche bloccato)

// Le iscrizioni di una stagione si aprono (la stagione nasce "open", o torna ad esserlo), o la stagione si conclude
exports.pushStatoStagione = onValueWritten(
    { ...OPZIONI_PUSH, ref: '/seasons/{stagione}/info/status' },
    evento => conLog('stagione', async () => {
        const prima = String(evento.data.before.val() || '').toLowerCase();
        const dopo = String(evento.data.after.val() || '').toLowerCase();
        if (prima === dopo) return null;
        const db = getDatabase();
        const stagione = evento.params.stagione;
        const info = (await db.ref(`seasons/${stagione}/info`).once('value')).val() || {};
        if (dopo === 'open') return push.notificaIscrizioniAperte({ db, messaging: getMessaging(), stagione, info });
        if (dopo === 'closed' && stagione !== 'sbeta') {
            // il vincitore lo scrive il sito subito dopo lo stato: si aspetta un attimo, così la notifica lo può dire
            await new Promise(ok => setTimeout(ok, 8000));
            const aggiornata = (await db.ref(`seasons/${stagione}/info`).once('value')).val() || info;
            // il premio di chi ha vinto la stagione (una volta sola)
            try { await monete.accredita(db, await monete.uidDi(db, aggiornata.winner), monete.PREMI.stagioneVinta, `Season won: ${aggiornata.name || stagione}`, { chiave: `stagione-${stagione}` }); } catch (e) { console.error('Monete stagione', e); }
            return push.notificaStagioneConclusa({ db, messaging: getMessaging(), stagione, info: aggiornata });
        }
        return null;
    })
);
