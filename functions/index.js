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
const { onValueWritten } = require('firebase-functions/v2/database');
// partita.js porta con sé il simulatore completo di Showdown (migliaia di file): si carica alla prima richiesta e non all'avvio,
// così il contenitore apre subito la porta e supera il controllo di avvio di Cloud Run anche quando leggere i file è lento
let moduloPartita = null;
const partita = () => (moduloPartita ||= require('./partita'));
// dopo l'avvio (la porta è già aperta) lo si carica comunque, così la prima partita non lo aspetta
setTimeout(() => { try { partita(); } catch (e) { console.error('Caricamento di partita.js fallito', e); } }, 200).unref();

initializeApp();

// Le funzioni delle partite stanno in REGIONE_FUNZIONI; quella del salvataggio deve stare nella regione del database (REGIONE_DB)
const REGIONE_DB = 'europe-west1';
const REGIONE_FUNZIONI = 'europe-west4';
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
        region: REGIONE_FUNZIONI, 
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
    { ref: '/partite/{id}/stato', instance: ISTANZA_DB, region: REGIONE_DB, memory: '1GiB', timeoutSeconds: 300 },
    async evento => {
        if (evento.data.after.val() !== 'da_salvare') return;
        await prendiServizio().salvaPartita(evento.params.id);
    }
);