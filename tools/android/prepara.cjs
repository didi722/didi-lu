'use strict';
// Prepara l'app Android (Capacitor) per la build di GitHub Actions (.github/workflows/android-apk.yml). Due fasi:
//   node tools/android/prepara.cjs web       prima di "cap add android": rifà www/ (pagina di ingresso + offline.html presa dal sito) e applica SITO_URL
//   node tools/android/prepara.cjs android   dopo "cap add android": sfondo nero dietro le barre di sistema, numero di versione, niente backup del WebView
// L'app è solo un guscio: apre il sito vero (capacitor.config.json > server.url), quindi ogni modifica al sito arriva subito, senza rifare l'APK.
// Se il modello di Capacitor cambia e una modifica non trova il suo punto, lo script si ferma con un errore: meglio nessun APK che un APK storto.
// Le parti pure sono esportate e provate in test/android.test.js.
const fs = require('node:fs');
const path = require('node:path');

/** Sostituisce la prima occorrenza di `modello`; se manca, errore (il modello di Capacitor non è più quello che ci aspettiamo). */
function sostituisci(testo, modello, nuovo, cosa) {
    if (!modello.test(testo)) throw new Error(`Non trovo ${cosa}: il modello di Capacitor è cambiato? Aggiornare tools/android/prepara.cjs`);
    return testo.replace(modello, nuovo);
}

/** L'indirizzo del sito: SITO_URL (variabile del repository, se c'è) altrimenti quello di capacitor.config.json; sempre https e con "/" finale. */
function indirizzoSito(config, env) {
    const da = String((env && env.SITO_URL) || (config && config.server && config.server.url) || '').trim();
    if (!/^https:\/\/[^\s'"<>\\]+$/.test(da)) throw new Error(`Indirizzo del sito non valido: "${da}" (serve un indirizzo https://...)`);
    return da.endsWith('/') ? da : da + '/';
}

/** Il numero di versione dell'app: sempre crescente (numero della build di GitHub), così ogni APK può aggiornare il precedente. */
function codiceVersione(env) {
    const n = Number((env && (env.VERSION_CODE || env.GITHUB_RUN_NUMBER)) || 1);
    if (!Number.isInteger(n) || n < 1 || n > 2000000000) throw new Error(`Numero di versione non valido: ${n}`);
    return n;
}

/** La pagina di ingresso dell'app (www/index.html): serve solo a Capacitor per esistere, il sito vero è server.url. */
function paginaIngresso(url) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="0; url=${url}">
    <title>Sant'Alvise League</title>
    <style>html, body { margin: 0; background: #000; color: #fff; font-family: sans-serif; } a { color: #ffbd44; } p { padding: 24px; }</style>
</head>
<body>
    <p><a href="${url}">Open the league</a></p>
    <script>location.replace('${url}');</script>
</body>
</html>
`;
}

/** offline.html del sito, con "Try again" che nell'app riporta all'indirizzo vero del sito. */
function paginaOffline(html, url) {
    return sostituisci(html, /var sito = '[^']*';/, `var sito = '${url}';`, "l'indirizzo del sito in offline.html");
}

/** Aggiunge una riga <item> in testa allo stile `nome` di styles.xml (se già c'è la stessa voce, non fa niente). */
function inserisciNelloStile(xml, nome, voce, riga) {
    const apertura = new RegExp(`<style name="${nome.replace(/\./g, '\\.')}"[^>]*>`);
    const inizio = xml.search(apertura);
    if (inizio < 0) throw new Error(`Non trovo lo stile ${nome} in styles.xml: il modello di Capacitor è cambiato? Aggiornare tools/android/prepara.cjs`);
    if (xml.slice(inizio, xml.indexOf('</style>', inizio)).includes(voce)) return xml;
    return xml.replace(apertura, m => `${m}\n        ${riga}`);
}

/**
 * Nero dappertutto, come la barra del sito: dietro le barre di sistema (stato, gesti) si vede lo sfondo della finestra (altrimenti bianco o grigio)
 * e sull'avvio di Android 12 e successivi la schermata col logo prende il suo colore dal tema di lancio (altrimenti bianca).
 */
function modificaStili(xml) {
    let t = inserisciNelloStile(xml, 'AppTheme.NoActionBar', 'android:windowBackground', '<item name="android:windowBackground">@android:color/black</item>');
    t = inserisciNelloStile(t, 'AppTheme.NoActionBarLaunch', 'windowSplashScreenBackground', '<item name="windowSplashScreenBackground">#000000</item>');
    return t;
}

/** Versione dell'app: il numero della build, così Android la riconosce come un aggiornamento. */
function modificaGradle(testo, codice) {
    let t = sostituisci(testo, /versionCode\s+\d+/, `versionCode ${codice}`, 'versionCode in app/build.gradle');
    t = sostituisci(t, /versionName\s+"[^"]*"/, `versionName "1.${codice}"`, 'versionName in app/build.gradle');
    return t;
}

/** Niente copia di sicurezza nel cloud dei dati del WebView (accesso e preferenze restano sul telefono). */
function modificaManifest(xml) {
    return sostituisci(xml, /android:allowBackup="true"/, 'android:allowBackup="false"', 'allowBackup in AndroidManifest.xml');
}

function ritocca(file, modifica) {
    if (!fs.existsSync(file)) throw new Error(`Manca ${file}: prima va eseguito "npx cap add android"`);
    fs.writeFileSync(file, modifica(fs.readFileSync(file, 'utf8')));
}

function preparaWeb(radice, env) {
    const fileConfig = path.join(radice, 'capacitor.config.json');
    const config = JSON.parse(fs.readFileSync(fileConfig, 'utf8'));
    if (config.webDir !== 'www') throw new Error('capacitor.config.json: webDir deve restare "www" (lo script lo rifà da zero)');
    const url = indirizzoSito(config, env);
    if (config.server.url !== url) {
        config.server.url = url;
        fs.writeFileSync(fileConfig, JSON.stringify(config, null, 2) + '\n');
    }
    const www = path.join(radice, 'www');
    fs.rmSync(www, { recursive: true, force: true });       // www/ non contiene nulla di scritto a mano: si rifà ogni volta
    fs.mkdirSync(www, { recursive: true });
    fs.writeFileSync(path.join(www, 'index.html'), paginaIngresso(url));
    fs.writeFileSync(path.join(www, 'offline.html'), paginaOffline(fs.readFileSync(path.join(radice, 'docs', 'offline.html'), 'utf8'), url));
    return { url };
}

function preparaAndroid(radice, env) {
    const app = path.join(radice, 'android', 'app');
    const codice = codiceVersione(env);
    ritocca(path.join(app, 'src', 'main', 'res', 'values', 'styles.xml'), modificaStili);
    ritocca(path.join(app, 'build.gradle'), t => modificaGradle(t, codice));
    ritocca(path.join(app, 'src', 'main', 'AndroidManifest.xml'), modificaManifest);
    return { codice };
}

module.exports = { sostituisci, indirizzoSito, codiceVersione, paginaIngresso, paginaOffline, modificaStili, modificaGradle, modificaManifest, preparaWeb, preparaAndroid };

if (require.main === module) {
    const radice = path.resolve(__dirname, '..', '..');
    const fase = process.argv[2];
    try {
        if (fase === 'web') { const r = preparaWeb(radice, process.env); console.log(`www/ pronta: l'app aprirà ${r.url}`); }
        else if (fase === 'android') { const r = preparaAndroid(radice, process.env); console.log(`android/ ritoccata: versione 1.${r.codice} (codice ${r.codice})`); }
        else throw new Error('Uso: node tools/android/prepara.cjs web|android');
    } catch (e) {
        console.error('ERRORE: ' + e.message);
        process.exit(1);
    }
}
