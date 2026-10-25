# App Android (APK)

L'app è un guscio [Capacitor](https://capacitorjs.com) che apre il sito vero (`capacitor.config.json` > `server.url`): ogni modifica al sito
arriva subito, senza rifare l'APK. Il sito la riconosce dallo user agent (`SantAlviseApp`) e accende l'aspetto da app (barra in basso e in alto compatte, pagine ridisegnate per il telefono, battaglie in orizzontale, tira per aggiornare).
Senza rete l'app mostra `docs/offline.html`.

## Per gli amici

- **Android**: aprire dal telefono https://github.com/didi722/didi-lu/releases/download/app-android/sant-alvise-league.apk (indirizzo fisso, è sempre l'ultima versione),
  poi aprire il file scaricato. La prima volta Android chiede di permettere l'installazione da quella fonte (Chrome o il gestore file); se Play Protect
  avvisa che l'app è di uno sviluppatore sconosciuto, si sceglie "Installa comunque". Gli aggiornamenti si installano sopra la versione precedente.
- **iPhone / iPad**: un'app vera richiede un account Apple Developer a pagamento. Gratis: aprire il sito in **Safari**, Condividi, **Aggiungi alla schermata Home**.
  Si apre a schermo intero come un'app, con le stesse pagine ridisegnate per il telefono, sempre aggiornate (anche da Chrome su iOS 16.4+: Condividi, Aggiungi a Home).
- Android senza APK: da Chrome, menù, **Installa app** (o l'invito che compare sulla home).

## Come si costruisce

`.github/workflows/android-apk.yml` (non serve Android Studio): parte da sola quando su `main` cambiano i file dell'app (`capacitor.config.json`, `assets/`,
`tools/android/`, `docs/offline.html`, dipendenze), oppure a mano da GitHub: **Actions > Android APK > Run workflow**. Pubblica `sant-alvise-league.apk`
nella release `app-android`. Sugli altri rami costruisce e basta (l'APK resta tra gli artifact della prova).

I passi sono quelli del workflow, nell'ordine: `node tools/android/prepara.cjs web` (rifà `www/`), `npx cap add android`, `npx @capacitor/assets generate --android`
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
