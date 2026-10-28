// Importiamo i moduli specifici richiesti dalle nuove specifiche Firebase Admin SDK
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { cert } = require('firebase-admin/app');

// 1. Recuperiamo le credenziali protette dai Secrets di GitHub
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// 2. Inizializziamo l'applicazione in modo modulare e sicuro
initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app" 
});

// Otteniamo l'istanza del Realtime Database
const db = getDatabase();

// La logica delle stagioni (fine, vincitore, classifica) è quella del sito e del server: functions/risultati-match.js, eseguita qui col database di questo script
const fs = require('fs');
const path = require('path');
const vm = require('vm');
function caricaSito() {
  const contesto = vm.createContext({ db, fetch, console, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'risultati-match.js'), 'utf8'), contesto, { filename: 'risultati-match.js' });
  return contesto;
}
const sito = caricaSito();

// Notifiche push (functions/push.js): i promemoria di scadenza e l'apertura del voto MVP, che dipendono dall'ora e dai risultati e non da una scrittura.
// Gli altri eventi (sfida ricevuta, iscrizioni aperte, stagione conclusa) li manda subito il database (functions/index.js).
const { getMessaging } = require('firebase-admin/messaging');
const push = require(path.join(__dirname, '..', '..', 'functions', 'push.js'));
const Mvp = require(path.join(__dirname, '..', '..', 'docs', 'mvp.js'));

async function notifiche(id, info, dati) {
  try {
    const ctx = { db, messaging: getMessaging(), stagione: id, info };
    const ore = push.promemoriaDovuto(info);
    if (ore) {
      const r = await push.notificaPromemoria({ ...ctx, ore });
      if (r && !r.saltata) console.log(`🔔 Promemoria (${ore} h) per [${id}]: ${r.inviate} notifiche inviate.`);
    }
    // "Iscrivi i tuoi team!": a metà strada tra l'apertura (quando è partita la notifica di apertura) e la scadenza delle iscrizioni
    const apertaIl = Number((await db.ref(`pushInviati/aperta-${String(id).replace(/[.#$\[\]/]/g, '_')}`).once('value')).val());
    if (push.iscriviTeamDovuto(info, apertaIl)) {
      const r = await push.notificaIscriviTeam(ctx);
      if (r && !r.saltata) console.log(`🔔 Iscrivi i team per [${id}]: ${r.inviate} notifiche inviate.`);
    }
    if (id !== 'sbeta' && ['playing', 'closed'].includes(String(info.status || '').toLowerCase())) {
      const avanzamento = sito.avanzamentoStagione(info, dati.iscritti, dati.showdowns, dati.teams_iscritti);
      const finestra = Mvp.finestraVoto(info, avanzamento, id);
      if (finestra.aperta) {
        const r = await push.notificaMvp(ctx);
        if (r && !r.saltata) console.log(`🔔 Voto MVP aperto per [${id}]: ${r.inviate} notifiche inviate.`);
        const oreMvp = push.mvpScadenzaDovuta(finestra);
        if (oreMvp) {
          const s2 = await push.notificaMvpScadenza({ ...ctx, ore: oreMvp });
          if (s2 && !s2.saltata) console.log(`🔔 Scadenza voto MVP (${oreMvp} h) per [${id}]: ${s2.inviate} notifiche inviate.`);
        }
      }
    }
  } catch (e) {
    console.error(`⚠️ Notifiche push di [${id}] non inviate (il controllo prosegue):`, e.message);
  }
}

async function runChecker() {
  try {
    console.log("🚀 Script avviato da GitHub. Controllo scadenze e conteggio showdown...");
    
    const ref = db.ref('seasons');
    const snap = await ref.once('value');
    const seasons = snap.val();

    if (!seasons) {
      console.log("⚠️ Nessuna stagione trovata nel Database.");
      process.exit(0);
    }

    const oraAttuale = new Date();
    let modificheFatte = 0;

    for (const id in seasons) {
      const seasonData = seasons[id];
      const info = seasonData.info || seasonData;
      
      if (!info) continue;

      const status = (info.status || "open").toLowerCase();

      // CASO 1: La stagione è OPEN ma il tempo è scaduto -> Diventa PLAYING
      if (status === "open" && info.deadline) {
        const scadenza = new Date(info.deadline);

        if (oraAttuale >= scadenza) {
          console.log(`📌 Tempo scaduto per la stagione [${id}]. Passaggio a 'playing'...`);
          await db.ref(`seasons/${id}/info/status`).set("playing");
          modificheFatte++;
        }
      }

      // CASO 2: la stagione è PLAYING e ogni giocatore ha giocato tutti gli showdown contro tutti gli altri -> CLOSED, con il vincitore.
      // Di solito lo fa già il server quando si salva l'ultimo match (functions/risultati-match.js): qui è la rete di sicurezza.
      if (status === "playing" && id !== "sbeta") {
        const esito = await sito.chiudiStagioneSeCompleta(id);
        if (esito.stagioneChiusa) {
          console.log(`📌 Tutti gli showdown della stagione [${id}] sono stati giocati: CLOSED, vince ${esito.vincitoreStagione}.`);
          modificheFatte++;
        }
      }

      // CASO 3: la stagione è CLOSED ma senza vincitore (chiusa prima che il sito lo calcolasse): classifica, vincitore e profili
      if (status === "closed" && !info.winner && id !== "sbeta") {
        await sito.aggiornaLeaderboard(id);
        const vincitore = await sito.salvaVincitoreStagione(id);
        console.log(`📌 La stagione chiusa [${id}] non aveva il vincitore: calcolato (${vincitore}).`);
        modificheFatte++;
      }

      // Notifiche push: con lo stato com'è adesso (se sopra è cambiato, lo si rilegge)
      const adesso = modificheFatte ? ((await db.ref(`seasons/${id}/info`).once('value')).val() || info) : info;
      await notifiche(id, adesso, seasonData);
    }

    console.log(`✅ Controllo terminato con successo. Stati database modificati: ${modificheFatte}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ ERRORE DETTAGLIATO:");
    console.error("Messaggio:", error.message);
    if (error.stack) {
      console.error("Tracciato di stack:\n", error.stack);
    }
    process.exit(1);
  }
}

// Avvia l'operazione
runChecker();
