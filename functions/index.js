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
const { creaServizio, ErroreUtente } = require('./partita');

initializeApp();

const REGIONE = 'europe-west1';
const ISTANZA_DB = 'pokemonsuite-didi-lu-default-rtdb';
const BUCKET = 'pokemonsuite-didi-lu.firebasestorage.app';

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

    servizio = creaServizio({
        db,
        salvaReplay,
        registraRisultato: r => caricaRegistraRisultato(db)(r),
        segreto: process.env.CHIAVE_SCELTE
    });
    return servizio;
}

// Trasforma gli errori "per il giocatore" in messaggi leggibili dal sito
function richiamabile(nome, opzioni = {}) {
    return onCall({ 
        region: REGIONE, 
        memory: '512MiB', 
        timeoutSeconds: 60, 
        cors: true, // <--- AGGIUNGI QUESTA RIGA
        ...opzioni 
    }, async richiesta => {
        if (!richiesta.auth) throw new HttpsError('unauthenticated', 'Devi essere loggato');
        try {
            return await prendiServizio()[nome](richiesta.auth.uid, richiesta.data || {});
        } catch (e) {
            if (e instanceof ErroreUtente) throw new HttpsError('failed-precondition', e.message);
            console.error(nome, e);
            throw new HttpsError('internal', 'Errore del server: riprova tra poco');
        }
    });
}
exports.apriPartita = richiamabile('apriPartita');
exports.prontoPartita = richiamabile('pronto');
exports.inviaScelta = richiamabile('inviaScelta', { minInstances: 0 });

// Quando l'ultimo set finisce, il match si salva da solo
exports.salvaPartitaConclusa = onValueWritten(
    { ref: '/partite/{id}/stato', instance: ISTANZA_DB, region: REGIONE, memory: '512MiB', timeoutSeconds: 300 },
    async evento => {
        if (evento.data.after.val() !== 'da_salvare') return;
        await prendiServizio().salvaPartita(evento.params.id);
    }
);