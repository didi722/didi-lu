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

(Il simulatore segna che sei dentro la partita con un battito ogni 30 secondi in `partite/<id>/presenza/<p1|p2>`: se è fresco (meno di 90 secondi) la notifica «Your move!» non parte. Nell'APK, con l'app in secondo piano il battito si toglie. Il vincitore della stagione è la notifica «Season finished» di sopra.)

Ognuno le accende dalle impostazioni dell'app (l'ingranaggio nel menù principale o il tondino del giocatore in alto nelle pagine, tessera **Alerts**). Ogni notifica "di stato" parte una volta sola (`pushInviati/…`).

## Da fare una volta sola (servono i tuoi accessi: io non posso farlo)

1. **Regole del Realtime Database** (Firebase → Realtime Database → Regole): ogni giocatore scrive solo i propri token, nessuno li legge dal sito.
   ```json
   "pushTokens": {
     "$uid": { ".write": "auth != null && auth.uid === $uid", ".read": false }
   }
   ```
   (dentro `"rules": { … }`, accanto agli altri nodi; `pushInviati` non serve: lo scrive solo il server.)
2. **Pubblicare le Cloud Functions** (`pushSfidaRicevuta`, `pushStatoStagione`, `pushTurno`, `pushSfidaAccettata`, `pushMatchLive`, `pushMvpNomina`): `firebase deploy --only functions`, come le altre volte.
3. **Notifiche dall'icona sulla Home (Android Chrome e iPhone):** Firebase → Impostazioni del progetto → Cloud Messaging → *Certificati push web* → *Genera coppia di chiavi*. Mandami la **chiave pubblica** (è lunga ~87 caratteri, non è un segreto) e la metto in `docs/push.js` (`CHIAVE_VAPID`), oppure incollala tu lì. Finché è vuota la tessera Alerts non compare sul web.
   - iPhone: le notifiche funzionano solo se il sito è stato aggiunto alla Home (iOS 16.4 o successivo).
4. **Notifiche nell'APK Android:** Firebase → Impostazioni del progetto → *Le tue app* → *Aggiungi app* → Android, nome pacchetto `com.didilucabattles.app`. Scarica `google-services.json`, aprilo e copia **tutto il contenuto** in un Secret del repository chiamato `GOOGLE_SERVICES_JSON` (Settings → Secrets and variables → Actions). Poi rilancia il workflow *Android APK* (Run workflow su `main`): senza il Secret l'APK si costruisce lo stesso, ma senza notifiche.
   - Chi ha già l'APK installato lo aggiorna sopra (stessa firma): al primo avvio Android chiede il permesso per le notifiche quando si tocca *Alerts*.
5. Il checker usa già `FIREBASE_SERVICE_ACCOUNT` (Secret esistente): non serve altro, il suo account ha già il permesso di mandare messaggi.

## Come controllare che funzioni
- Accendi *Alerts* dalle impostazioni dell'app: in Firebase → Realtime Database deve comparire `pushTokens/<tuo uid>/<chiave>`.
- Fai partire a mano una sfida amichevole verso un account con le notifiche accese: la notifica arriva in pochi secondi.
- I log: Firebase → Functions → Log (per le due funzioni) e Actions → *Firebase Deadlines Checker* (per promemoria e MVP: righe che iniziano con 🔔).
