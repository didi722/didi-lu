// Stile dei giocatori: somma le scelte di ogni allenatore nei set giocati sul sito (setStats di ogni match) e le salva in players/<id>/stile.
// Le legge la CPU quando gioca contro di lui (docs/cpu-avversario.js), per conoscere le sue abitudini senza scaricare tutte le stagioni.
// Oltre alle abitudini di ognuno, impara dai replay dei set della lega come cambiano le scelte nelle varie situazioni (turno, PS, vantaggio...: docs/cpu-situazioni.js)
// e le salva in players/<id>/stile/situazioni (le stesse in ogni nodo). Le pubblica solo se la prova incrociata (impara su una parte dei set, prevede gli altri)
// dice che prevedono meglio delle sole abitudini; i replay si scaricano solo quando ne arrivano di nuovi.
// La logica del calcolo è in docs/stile-giocatore.js e docs/cpu-situazioni.js (provate in test/); qui si legge, si confronta e si scrive.
//
//   node .github/workflows/stile-giocatori.js            scrive solo dove qualcosa è cambiato
//   node .github/workflows/stile-giocatori.js --prova    non scrive niente: dice cosa scriverebbe
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const path = require('path');
const Stile = require(path.join(__dirname, '..', '..', 'docs', 'stile-giocatore.js'));
const Situazioni = require(path.join(__dirname, '..', '..', 'docs', 'cpu-situazioni.js'));
const ReplaySito = require(path.join(__dirname, '..', '..', 'docs', 'replay-sito.js'));

const prova = process.argv.includes('--prova');

initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: 'https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app'
});
const db = getDatabase();

// La prova incrociata di un tipo di partita, in una riga
function riga(v) {
  if (!v) return 'niente';
  if (v.guadagno == null) return `${v.decisioni} decisioni in ${v.set} set: ${v.esito}`;
  return `${v.decisioni} decisioni in ${v.set} set, log-verosimiglianza ${v.senza.toFixed(4)} → ${v.con.toFixed(4)} (${v.guadagno >= 0 ? '+' : ''}${v.guadagno.toFixed(4)}, migliore in ${v.gruppiMigliori} gruppi su ${v.gruppi}): ${v.esito}`;
}

async function main() {
  const stagioni = (await db.ref('seasons').once('value')).val() || {};
  const nodi = Stile.profili(stagioni);
  const ids = Object.keys(nodi).sort();
  console.log(`${ids.length} allenatori con scelte registrate${prova ? ' (prova: non si scrive niente)' : ''}.`);

  // le regole sulle situazioni: uguali per tutti, quindi si leggono da un nodo che le ha già e si rifanno solo se ci sono replay nuovi
  let precedente = null;
  for (const id of ids) {
    const s = (await db.ref(`players/${id}/stile/situazioni`).once('value')).val();
    if (s && s.firma) { precedente = s; break; }
  }
  let situazioni = null;
  try {
    const r = await Stile.situazioniDaiReplay(stagioni, {
      scarica: async url => { const x = await fetch(url); if (!x.ok) throw new Error(`${x.status} ${url}`); return x.text(); },
      leggiReplay: ReplaySito.leggiReplay, Situazioni, precedente
    });
    situazioni = r.situazioni;
    if (!situazioni) console.log('Situazioni: nessun replay da cui imparare.');
    else if (r.riusate && !r.scaricati) console.log(`Situazioni: i replay sono gli stessi (${situazioni.set} set), regole invariate.`);
    else if (r.riusate) console.log(`Situazioni: ${r.falliti} replay non scaricati, tengo le regole di prima.`);
    else {
      console.log(`Situazioni: imparate da ${r.scaricati} replay (${r.falliti} non letti).`);
      console.log(`  singoli: ${riga(situazioni.validazione && situazioni.validazione.singoli)}`);
      console.log(`  doppi:   ${riga(situazioni.validazione && situazioni.validazione.doppi)}`);
    }
  } catch (e) {
    // le abitudini di ognuno si aggiornano comunque; le regole sulle situazioni restano quelle di prima
    console.error('Situazioni: non imparate, restano quelle di prima.', e);
    situazioni = precedente;
  }

  let scritti = 0, invariati = 0, senzaPagina = 0;
  for (const id of ids) {
    const n = nodi[id];
    if (situazioni) n.situazioni = situazioni;
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
