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
