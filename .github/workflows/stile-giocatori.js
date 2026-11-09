// Stile dei giocatori: somma le scelte di ogni allenatore nei set giocati sul sito (setStats di ogni match) e le salva in players/<id>/stile.
// Le legge la CPU quando gioca contro di lui (docs/cpu-avversario.js), per conoscere le sue abitudini senza scaricare tutte le stagioni.
// La logica del calcolo è in docs/stile-giocatore.js (provata in test/stile-giocatore.test.js); qui si legge, si confronta e si scrive.
//
//   node .github/workflows/stile-giocatori.js            scrive solo dove qualcosa è cambiato
//   node .github/workflows/stile-giocatori.js --prova    non scrive niente: dice cosa scriverebbe
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const path = require('path');
const Stile = require(path.join(__dirname, '..', '..', 'docs', 'stile-giocatore.js'));

const prova = process.argv.includes('--prova');

initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: 'https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app'
});
const db = getDatabase();

async function main() {
  const stagioni = (await db.ref('seasons').once('value')).val() || {};
  const nodi = Stile.profili(stagioni);
  const ids = Object.keys(nodi).sort();
  console.log(`${ids.length} allenatori con scelte registrate${prova ? ' (prova: non si scrive niente)' : ''}.`);
  let scritti = 0, invariati = 0, senzaPagina = 0;
  for (const id of ids) {
    const n = nodi[id];
    // un allenatore che non c'è più (cancellato) non deve rinascere solo per il suo stile
    if (!(await db.ref(`players/${id}/info`).once('value')).exists()) { senzaPagina++; console.log(`  ${id}: non ha più la pagina, salto`); continue; }
    const attuale = (await db.ref(`players/${id}/stile`).once('value')).val();
    if (Stile.uguali(attuale, n)) { invariati++; continue; }
    const q = n.azioni;
    console.log(`  ${id}: ${n.set} set, ${n.decisioni} decisioni (attacco ${q.attacco}, protezione ${q.protezione}, cambi ${q.cambi}) ${attuale ? 'aggiornato' : 'nuovo'}`);
    if (!prova) await db.ref(`players/${id}/stile`).set({ ...n, aggiornato: Date.now() });
    scritti++;
  }
  console.log(`Fatto: ${scritti} ${prova ? 'da scrivere' : 'scritti'}, ${invariati} già aggiornati, ${senzaPagina} senza pagina.`);
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
