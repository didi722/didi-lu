# App Android (APK)

L'app è un guscio [Capacitor](https://capacitorjs.com) che apre il sito vero (`capacitor.config.json` > `server.url`): ogni modifica al sito
arriva subito, senza rifare l'APK. Il sito la riconosce dallo user agent (`SantAlviseApp`) e diventa un gioco da telefono: si apre sul **menù principale**
(`docs/menu.html`: l'avatar del giocatore e quattro grandi tessere, **Matches** (giocare e guardare i showdown), **Box**, **Trainers** e **Stats**), le altre pagine hanno un'interfaccia da gioco
(indietro, menù, campanella, account in alto) e ogni tocco fa un suono e una vibrazione leggera (spegnibili dalle impostazioni, l'ingranaggio del menù).
L'app è accessoria al sito, non una sua copia: stagioni (home), profilo, archivio, formati e regolamento restano solo sul sito (dal telefono, nell'app, rimandano al menù).
Lo **stile è uno solo** per tutti, quello del menù: il tema e il colore che il giocatore sceglie per il sito non contano nell'app (`app.js` > `fissaStile`, `temi.js` resta fermo,
`app-gioco.css` rimette a mano le variabili `--nb-*`). Le stagioni non hanno una pagina: quella con le iscrizioni aperte compare come nastro sotto il giocatore e, la prima volta
che si apre il menù dopo il suo arrivo (e se il giocatore non è ancora iscritto), come messaggio "Sign-ups are open" col tasto **Join now** verso l'iscrizione (`hub.html?id=…`);
la stagione annunciata si ricorda (`appStagioneVista`), così il messaggio non torna.
Nel Box il dettaglio del team mostra solo i Pokémon (niente debolezze né avanzamento dei badge del team): è tutto CSS dell'app, le pagine del sito non cambiano.
Tutta l'app è **sempre in orizzontale**: l'APK la blocca da sé (`android:screenOrientation="sensorLandscape"` nel manifest, impostato da `prepara.cjs`, più il plugin
`@capacitor/screen-orientation` per sicurezza), anche con la rotazione automatica spenta, e nasconde le barre di sistema (plugin `SystemBars`, `capacitor.config.json`: si rivedono con uno scorrimento dal bordo).
Il permesso `VIBRATE` è nel manifest. Chi ha un APK costruito prima di questo giro deve scaricare e installare quello nuovo (sopra il vecchio) per avere
schermo intero, orizzontale fisso e vibrazione; con l'APK vecchio l'app funziona lo stesso, ma resta com'era (barre visibili, orientamento libero: se il telefono è in piedi compare "Turn your phone sideways").
Senza rete l'app mostra `docs/offline.html`.

## Per gli amici

- **Android**: aprire dal telefono https://github.com/didi722/didi-lu/releases/download/app-android/sant-alvise-league.apk (indirizzo fisso, è sempre l'ultima versione),
  poi aprire il file scaricato. La prima volta Android chiede di permettere l'installazione da quella fonte (Chrome o il gestore file); se Play Protect
  avvisa che l'app è di uno sviluppatore sconosciuto, si sceglie "Installa comunque". Gli aggiornamenti si installano sopra la versione precedente.
- **iPhone / iPad**: un'app vera richiede un account Apple Developer a pagamento. Gratis: aprire il sito in **Safari**, Condividi, **Aggiungi alla schermata Home**.
  Si apre a schermo intero come un'app, con lo stesso menù e le stesse pagine da gioco, sempre aggiornate (anche da Chrome su iOS 16.4+: Condividi, Aggiungi a Home).
  iOS non permette di bloccare l'orientamento: il telefono va tenuto girato (in piedi compare l'avviso "Turn your phone sideways"). La vibrazione su iPhone non esiste, i suoni sì.
- Android senza APK: da Chrome, menù, **Installa app** (o l'invito che compare sulla home).

## Come si costruisce

`.github/workflows/android-apk.yml` (non serve Android Studio): parte da sola quando su `main` cambiano i file dell'app (`capacitor.config.json`, `assets/`,
`tools/android/`, `docs/offline.html`, dipendenze), oppure a mano da GitHub: **Actions > Android APK > Run workflow**. Pubblica `sant-alvise-league.apk`
nella release `app-android`. Sugli altri rami costruisce e basta (l'APK resta tra gli artifact della prova).

I passi sono quelli del workflow, nell'ordine: `node tools/android/prepara.cjs plugin` (il plugin dell'orientamento segue il sensore, così l'app va bene girata da tutti e due i lati), `node tools/android/prepara.cjs web` (rifà `www/`), `npx cap add android`, `npx @capacitor/assets generate --android`
(icone e schermata di avvio da `assets/`, che si rifanno con `python3 tools/crea-icone-app.py`), `node tools/android/prepara.cjs android` (sfondo nero, versione),
`npx cap sync android`, Gradle `assembleRelease`, `zipalign` e `apksigner`. Il progetto `android/` e `www/` sono generati e non stanno nel repository.

- **Il sito cambia indirizzo**: variabile del repository `SITO_URL` (Settings > Secrets and variables > Actions > Variables) e rilancio a mano
  (oppure `server.url` in `capacitor.config.json`, che deve restare uguale al valore di `docs/offline.html`: lo controlla un test).
- **Nome, icona, colori**: `capacitor.config.json`, `assets/`, `tools/android/prepara.cjs`.

## Firma

Android installa un aggiornamento solo se l'APK è firmato con la stessa chiave dell'app già installata. Di base la build usa `tools/android/firma-apk.p12`,
una chiave messa nel repository **apposta** con la password pubblica `santalvise` (come la chiave "debug" di Android): va bene per un'app tra amici,
ma chiunque potrebbe firmare un APK con la stessa chiave. Per una chiave privata: creare un keystore (`keytool -genkeypair ...`) e aggiungere nei Secrets del
repository `ANDROID_KEYSTORE_BASE64` (il file in base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`: la build li usa al posto di quella del
repository (chi ha già l'app la deve disinstallare e reinstallare una volta sola).

## Provare in locale

Serve Node 22, Java 21 e l'Android SDK (non c'è nell'ambiente di sviluppo del sito): gli stessi comandi del workflow, poi `cd android && ./gradlew assembleDebug`.
