// Stile dei giocatori: somma le scelte di ogni allenatore nei set giocati sul sito (setStats di ogni match) e le salva in players/<id>/stile.
// Le legge la CPU quando gioca contro di lui (docs/cpu-avversario.js), per conoscere le sue abitudini senza scaricare tutte le stagioni.
// Oltre alle abitudini di ognuno, impara dai replay dei set della lega come cambiano le scelte nelle varie situazioni (turno, PS, vantaggio...: docs/cpu-situazioni.js)
// e le salva in players/<id>/stile/situazioni (le stesse in ogni nodo). Le pubblica solo se la prova incrociata (impara su una parte dei set, prevede gli altri)
// dice che prevedono meglio delle sole abitudini; i replay si scaricano solo quando ne arrivano di nuovi.
// Pubblica anche cosa si gioca nella lega (docs/meta-lega.js): per ogni formato, quanto compare ogni Pokémon, con quali mosse, quanti Helping Hand, Protezioni, mosse
// prioritarie e pivot (U-turn, Volt Switch...) per team, in settings/cpuMeta. Solo numeri aggregati delle stagioni chiuse, mai team né nomi, e senza soglie di riservatezza (la CPU usa tutto ciò che
// c'è; vedi meta-lega.js): la CPU li usa per comporre team più vicini a quelli che si vedono nelle stagioni vere, con un peso che scende se la lega è piccola
// (così non li copia).
// La logica del calcolo è in docs/stile-giocatore.js, docs/cpu-situazioni.js e docs/meta-lega.js (provate in test/); qui si legge, si confronta e si scrive.
//
//   node .github/workflows/stile-giocatori.js            scrive solo dove qualcosa è cambiato
//   node .github/workflows/stile-giocatori.js --prova    non scrive niente: dice cosa scriverebbe
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const path = require('path');
const Stile = require(path.join(__dirname, '..', '..', 'docs', 'stile-giocatore.js'));
const Situazioni = require(path.join(__dirname, '..', '..', 'docs', 'cpu-situazioni.js'));
const ReplaySito = require(path.join(__dirname, '..', '..', 'docs', 'replay-sito.js'));
const MetaLega = require(path.join(__dirname, '..', '..', 'docs', 'meta-lega.js'));

const prova = process.argv.includes('--prova');
const ricalcola = process.argv.includes('--ricalcola');      // rifà le situazioni anche se i replay sono gli stessi (e stampa come giocano le persone)

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

// Cosa si gioca nella lega, per formato: settings/cpuMeta/formati/<chiave>. Si riscrive solo se qualcosa è cambiato.
async function pubblicaMeta(stagioni) {
  const nuova = MetaLega.aggrega(stagioni);
  const chiavi = Object.keys(nuova).sort();
  if (!chiavi.length) { console.log('Meta della lega: nessun formato con abbastanza team nelle stagioni chiuse.'); return; }
  for (const k of chiavi) {
    const m = nuova[k];
    console.log(`Meta della lega, ${k}: ${m.team} team, ${m.set} set, ${Object.keys(m.specie).length} Pokémon; per team ${m.squadra.aiuto} Helping Hand, ${m.squadra.protezioni} Protezioni, ${m.squadra.priorita} mosse prioritarie, ${m.squadra.perno} pivot; ` +
      `set con Fake Out ${Math.round(m.classi.fakeout * 100)}%, deviatore ${Math.round(m.classi.redirezione * 100)}%, Tailwind ${Math.round(m.classi.vento * 100)}%, Stanza Magica ${Math.round(m.classi.stanza * 100)}%, pivot ${Math.round(m.classi.perno * 100)}%`);
  }
  const attuale = (await db.ref('settings/cpuMeta/formati').once('value')).val();
  if (JSON.stringify(Stile.ordina(attuale)) === JSON.stringify(Stile.ordina(nuova))) { console.log('Meta della lega: invariata.'); return; }
  if (!prova) await db.ref('settings/cpuMeta').set({ v: MetaLega.VERSIONE, aggiornato: Date.now(), formati: nuova });
  console.log(`Meta della lega: ${prova ? 'da scrivere' : 'scritta'} (${chiavi.length} formati).`);
}

async function main() {
  const stagioni = (await db.ref('seasons').once('value')).val() || {};
  const nodi = Stile.profili(stagioni);
  const ids = Object.keys(nodi).sort();
  console.log(`${ids.length} allenatori con scelte registrate${prova ? ' (prova: non si scrive niente)' : ''}.`);

  // le regole sulle situazioni: uguali per tutti, quindi si leggono da un nodo che le ha già e si rifanno solo se ci sono replay nuovi
  let precedente = null;
  for (const id of ricalcola ? [] : ids) {
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
      // i pesi imparati (per rifare i calcoli a mano, e per tarare la CPU): un JSON per tipo di partita
      for (const k of ['singoli', 'doppi']) if (situazioni[k] && situazioni[k].pesi) console.log(`Pesi ${k}: ${JSON.stringify(situazioni[k].pesi)}`);
      // come giocano le persone, per situazione: serve a confrontarle con la CPU (tools/stile-cpu.cjs stampa la stessa tabella)
      if (r.tabelle) for (const k of ['singoli', 'doppi']) if (r.tabelle[k][0].n) console.log(`\nCome giocano le persone, ${k}:\n${Situazioni.tabellaInTesto(r.tabelle[k])}\n`);
      // chi scelgono di colpire nel doppio (a caso sarebbe il 50%)
      if (r.tabelle && r.tabelle.bersagli) console.log(`Chi colpiscono le persone, doppi (con due avversari in campo, a caso sarebbe il 50%):\n${Situazioni.tabellaBersagliInTesto(r.tabelle.bersagli)}\n`);
    }
  } catch (e) {
    // le abitudini di ognuno si aggiornano comunque; le regole sulle situazioni restano quelle di prima
    console.error('Situazioni: non imparate, restano quelle di prima.', e);
    situazioni = precedente;
  }

  await pubblicaMeta(stagioni);

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
