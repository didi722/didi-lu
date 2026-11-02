'use strict';
// =====================================================
// REAZIONI ALLE PARTITE LIVE — Poké-Tournament
//
// Chi guarda una partita in diretta (battle.html) manda una reazione (fuoco, shock, risata...) e tutti quelli che sono dentro la partita, giocatori compresi, la vedono
// salire sul campo. Si scrive SOLO da qui (funzione `reagisciPartita`): i client non hanno il permesso di scrivere in quei nodi.
//
//   partite/<id>/reazioni/<chiave>       { e: <id della reazione>, t: <millisecondi> }   il flusso, in ordine di chiave; non dice chi l'ha mandata
//   partite/<id>/reazioniTotali/<e>      quante reazioni di quel tipo in tutta la partita
//   partite/<id>/reazioniLimiti/<uid>    { t, n }  l'ultima reazione di quella persona e quante ne ha mandate (serve solo al limite)
//
// Le reazioni sono un elenco fisso di ID (REAZIONI): il disegno (emoji o immagine) lo sceglie il sito, qui si salva solo l'ID.
// Limiti: una reazione ogni INTERVALLO_MIN millisecondi per persona, al massimo MAX_PER_PERSONA in una partita; solo mentre si gioca (STATI_APERTI).
// Funzione senza dipendenze: db è il Realtime Database di firebase-admin (o un finto nelle prove, functions/test/reazioni.test.js).
// =====================================================

const REAZIONI = ['fire', 'shock', 'lol', 'gg', 'skull', 'love'];     // lo stesso elenco, con i disegni, è in docs/reazioni-live.js
const INTERVALLO_MIN = 900;           // millisecondi tra due reazioni della stessa persona
const MAX_PER_PERSONA = 400;          // in una partita
const STATI_APERTI = ['in_corso', 'tra_set'];

// Un errore "per chi ha reagito": index.js lo trasforma in un HttpsError con lo stesso codice
class ErroreReazione extends Error {
    constructor(codice, messaggio) { super(messaggio); this.codice = codice; }
}

function creaReazioni({ db, adesso = () => Date.now() }) {
    async function reagisci(uid, dati = {}) {
        if (!uid) throw new ErroreReazione('unauthenticated', 'Devi essere loggato');
        const id = String(dati.id || '');
        const e = String(dati.e || '');
        if (!/^[-\w]{1,80}$/.test(id)) throw new ErroreReazione('invalid-argument', 'Partita non valida');
        if (!REAZIONI.includes(e)) throw new ErroreReazione('invalid-argument', 'Reazione non valida');

        const stato = (await db.ref(`partite/${id}/stato`).once('value')).val();
        if (!stato) throw new ErroreReazione('not-found', 'Partita non trovata');
        if (!STATI_APERTI.includes(stato)) throw new ErroreReazione('failed-precondition', 'Le reazioni sono aperte solo mentre si gioca');

        // il limite: una transazione sul contatore di quella persona (se rifiuta, non si scrive niente)
        const ora = adesso();
        let motivo = '';
        const esito = await db.ref(`partite/${id}/reazioniLimiti/${uid}`).transaction(corrente => {
            const c = corrente && typeof corrente === 'object' ? corrente : { t: 0, n: 0 };
            if (ora - Number(c.t || 0) < INTERVALLO_MIN) { motivo = 'troppo presto'; return undefined; }
            if (Number(c.n || 0) >= MAX_PER_PERSONA) { motivo = 'troppe'; return undefined; }
            return { t: ora, n: Number(c.n || 0) + 1 };
        });
        if (!esito.committed) {
            throw new ErroreReazione('resource-exhausted', motivo === 'troppe' ? 'Hai già mandato tante reazioni in questa partita' : 'Un attimo: una reazione alla volta');
        }

        await db.ref(`partite/${id}/reazioni`).push().set({ e, t: ora });
        await db.ref(`partite/${id}/reazioniTotali/${e}`).transaction(n => (Number(n) || 0) + 1);
        return { ok: true };
    }
    return { reagisci };
}

module.exports = { REAZIONI, INTERVALLO_MIN, MAX_PER_PERSONA, STATI_APERTI, ErroreReazione, creaReazioni };
