const admin = require('firebase-admin');

// 1. Recuperiamo le credenziali protette che abbiamo salvato nei Secrets di GitHub
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// 2. Inizializziamo l'applicazione Firebase con privilegi Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app" 
});

const db = admin.database();

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

      // CASO 2: La stagione è PLAYING ma ha raggiunto il numero massimo di showdown -> Diventa CLOSED
      if (status === "playing") {
        const totalDays = Number(info.total_days || 0);
        // Conta quanti ID unici ci sono sotto il sotto-nodo 'showdowns'
        const numeroShowdowns = seasonData.showdowns ? Object.keys(seasonData.showdowns).length : 0;

        if (totalDays > 0 && numeroShowdowns >= totalDays) {
          console.log(`📌 Raggiunto il limite di showdown (${numeroShowdowns}/${totalDays}) per la stagione [${id}]. Passaggio a 'closed'...`);
          await db.ref(`seasons/${id}/info/status`).set("closed");
          modificheFatte++;
        }
      }
    }

    console.log(`✅ Controllo terminato con successo. Stati database modificati: ${modificheFatte}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Errore critico durante l'esecuzione dello script:", error);
    process.exit(1);
  }
}

// Avvia l'operazione
runChecker();
