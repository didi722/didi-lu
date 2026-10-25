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
            return push.notificaStagioneConclusa({ db, messaging: getMessaging(), stagione, info: aggiornata });
        }
        return null;
    })
);
