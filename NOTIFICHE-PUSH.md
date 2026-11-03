# Notifiche push: cosa parte e cosa va acceso

## Cosa arriva sul telefono
| Notifica | Quando | A chi | Chi la manda |
|---|---|---|---|
| Sfida ricevuta | appena qualcuno ti sfida (amichevole o di stagione) | lo sfidato | Cloud Function `pushSfidaRicevuta` |
| Iscrizioni aperte | una stagione passa a "open" | tutti quelli che hanno acceso le notifiche | Cloud Function `pushStatoStagione` |
| Promemoria scadenza | 24 ore e 3 ore prima della scadenza | tutti quelli che hanno acceso le notifiche (iscritti o no) | checker (ogni 30 minuti) |
| Voto MVP aperto | quando si apre la finestra di voto | gli iscritti che non hanno ancora votato | checker (ogni 30 minuti) |
| Stagione conclusa | la stagione passa a "closed" | gli iscritti, col nome del vincitore | Cloud Function `pushStatoStagione` |
| Il tuo turno | l'avversario ha giocato il suo turno e a te manca la scelta (ufficiale e amichevole); non arriva se sei dentro quella partita (simulatore aperto, anche dal PC) | l'altro giocatore | Cloud Function `pushTurno` |
| Sfida accettata | chi ti sfida accetta (la partita è pronta) | chi ha lanciato la sfida | Cloud Function `pushSfidaAccettata` |
| Scadenza voto MVP | 3 ore prima della fine del voto (dopo la chiusura della stagione) | gli iscritti che non hanno votato | checker (ogni 30 minuti) |
| Iscrivi i tuoi team! | a metà strada tra l'apertura della stagione e la scadenza delle iscrizioni | gli iscritti a cui manca un team in qualche formato | checker (ogni 30 minuti) |
| Match in diretta | un match ufficiale (ranked) parte | tutti con le notifiche, tranne i due che giocano | Cloud Function `pushMatchLive` |
| MVP ufficiale | il conteggio dei voti scrive l'MVP della stagione | tutti con le notifiche | Cloud Function `pushMvpNomina` |
| Nuovo badge | hai sbloccato o fatto salire di livello un fiocco/badge (Pokémon, team, allenatore, serie) | chi lo ha vinto (telefono + campanello); agli altri arriva nel campanello come notizia della lega | checker (ogni 30 minuti), `.github/workflows/novita.js` |
| Riassunto del lunedì | il lunedì dalle 9:00 (ora di Roma), se la settimana scorsa si è giocato: le tue vittorie/sconfitte, i match giocati, il Match of the week, chi guida | tutti con le notifiche (si può spegnere dal campanello); nel campanello c'è sempre | checker (ogni 30 minuti), `.github/workflows/novita.js` |

(Il simulatore segna che sei dentro la partita con un battito ogni 30 secondi in `partite/<id>/presenza/<p1|p2>`: se è fresco (meno di 90 secondi) la notifica «Your move!» non parte. Nell'APK, con l'app in secondo piano il battito si toglie. Il vincitore della stagione è la notifica «Season finished» di sopra.)

Ognuno le accende dalle impostazioni dell'app (l'ingranaggio nel menù principale o il tondino del giocatore in alto nelle pagine, tessera **Alerts**). Ogni notifica "di stato" parte una volta sola (`pushInviati/…`).

## Il campanello (tutte le notizie, anche senza notifiche accese)
Il campanellino in alto raccoglie anche quello che arriva sul telefono, così non si perde niente (anche dal browser del PC):
- **News for you**: i tuoi badge, il riassunto del lunedì, e gli avvisi di stagione/MVP; **League news**: i badge presi dagli altri. Si tengono le ultime 40 voci per persona (`notifiche/<uid>/posta`).
- Le voci si segnano come lette quando apri il campanello (`notifiche/<uid>/posta-lette`).
- In fondo al campanello: *This device* (notifiche accese/spente/bloccate su questo dispositivo, con il bottone per accenderle o spegnerle), *Weekly digest* (interruttore del riassunto del lunedì sul telefono: spento = niente push, la voce nel campanello resta) e **Send a test**, che manda una notifica di prova a tutti i tuoi dispositivi e dice a quanti è arrivata (una ogni 15 secondi). Serve per controllare che il push arrivi davvero.
- Dal browser/PWA il push parte solo con la chiave VAPID (punto 3 sotto); senza, il bottone dice che non è disponibile, ma il campanello funziona lo stesso.

### Come funzionano le novità del checker
`novita.js` gira a ogni giro del checker (ogni 30 minuti): calcola i badge di tutti con gli stessi moduli del sito e li confronta con `badgeVisti` (la situazione già vista). **Il primo giro salva soltanto**, senza notifiche, così non parte una raffica per i badge già esistenti. Poi notifica solo i badge nuovi o saliti di livello, una notifica per persona anche con più badge. Il riassunto usa `pushInviati/digest-<settimana>-<uid>` per non ripetersi.

## Da fare una volta sola (servono i tuoi accessi: io non posso farlo)

1. **Regole del Realtime Database** (Firebase → Realtime Database → Regole): ogni giocatore scrive solo i propri token, nessuno li legge dal sito.
   ```json
   "pushTokens": {
     "$uid": { ".write": "auth != null && auth.uid === $uid", ".read": false }
   }
   ```
   (dentro `"rules": { … }`, accanto agli altri nodi; `pushInviati`, `badgeVisti` e `pushProve` non servono: li scrive solo il server.)
   Per il campanello serve anche che ognuno legga e scriva **solo i propri** `notifiche/<uid>` (la posta la scrive il server, che non passa dalle regole; le voci lette e le preferenze le scrive la persona). Se per le sfide c'è già una regola su `notifiche/$uid` che permette lettura e scrittura al proprietario, non serve altro; altrimenti:
   ```json
   "notifiche": {
     "$uid": { ".read": "auth != null && auth.uid === $uid", ".write": "auth != null && auth.uid === $uid" }
   }
   ```
   Se manca, il campanello lo dice nella console del browser («controlla le regole del database»).
2. **Pubblicare le Cloud Functions** (`pushSfidaRicevuta`, `pushStatoStagione`, `pushTurno`, `pushSfidaAccettata`, `pushMatchLive`, `pushMvpNomina` e la nuova `provaNotifica` per il bottone *Send a test*): `firebase deploy --only functions`, come le altre volte.
3. **Notifiche dall'icona sulla Home (Android Chrome e iPhone):** Firebase → Impostazioni del progetto → Cloud Messaging → *Certificati push web* → *Genera coppia di chiavi*. Mandami la **chiave pubblica** (è lunga ~87 caratteri, non è un segreto) e la metto in `docs/push.js` (`CHIAVE_VAPID`), oppure incollala tu lì. Finché è vuota la tessera Alerts non compare sul web.
   - iPhone: le notifiche funzionano solo se il sito è stato aggiunto alla Home (iOS 16.4 o successivo).
4. **Notifiche nell'APK Android:** Firebase → Impostazioni del progetto → *Le tue app* → *Aggiungi app* → Android, nome pacchetto `com.didilucabattles.app`. Scarica `google-services.json`, aprilo e copia **tutto il contenuto** in un Secret del repository chiamato `GOOGLE_SERVICES_JSON` (Settings → Secrets and variables → Actions). Poi rilancia il workflow *Android APK* (Run workflow su `main`): senza il Secret l'APK si costruisce lo stesso, ma senza notifiche.
   - Chi ha già l'APK installato lo aggiorna sopra (stessa firma): al primo avvio Android chiede il permesso per le notifiche quando si tocca *Alerts*.
5. Il checker usa già `FIREBASE_SERVICE_ACCOUNT` (Secret esistente): non serve altro, il suo account ha già il permesso di mandare messaggi.

## Come controllare che funzioni
- Accendi *Alerts* dalle impostazioni dell'app: in Firebase → Realtime Database deve comparire `pushTokens/<tuo uid>/<chiave>`.
- Apri il campanello → **Send a test**: la notifica deve arrivare sul telefono in pochi secondi; il sito risponde con il numero di dispositivi raggiunti (se dice che nessun dispositivo ha le notifiche accese, riaccendile da *Alerts*).
- Fai partire a mano una sfida amichevole verso un account con le notifiche accese: la notifica arriva in pochi secondi.
- I log: Firebase → Functions → Log (per le due funzioni) e Actions → *Firebase Deadlines Checker* (per promemoria e MVP: righe che iniziano con 🔔).
