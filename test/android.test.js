'use strict';
// L'app Android (Capacitor + GitHub Actions): un guscio che apre il sito vero e lo riconosce dallo user agent.
//   - capacitor.config.json: indirizzo del sito, pagina offline, user agent che app.js riconosce, nero dappertutto;
//   - tools/android/prepara.cjs: le modifiche al progetto generato da Capacitor (parti pure, e la fase "web" in una cartella temporanea);
//   - .github/workflows/android-apk.yml: l'ordine dei passi, la firma, la release solo da main;
//   - i file che servono alla build (icone, chiave, .gitignore, dipendenze).
// L'APK vero si costruisce solo in GitHub Actions (qui non c'è l'Android SDK): le prove sono sulle parti che possono sbagliare prima di Gradle.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../tools/android/prepara.cjs');
const App = require('../docs/app.js');

const RADICE = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(RADICE, f), 'utf8');
const config = JSON.parse(leggi('capacitor.config.json'));
const workflow = leggi('.github/workflows/android-apk.yml');

// ---------- capacitor.config.json ----------

test('capacitor.config.json: l\'app apre il sito vero (https), mostra offline.html senza rete e porta il suo user agent', () => {
    assert.equal(config.webDir, 'www');
    assert.match(config.server.url, /^https:\/\/[a-z0-9.-]+\/(didi-lu\/)?$/);
    assert.ok(config.server.url.endsWith('/'));
    assert.equal(config.server.androidScheme, 'https');
    assert.equal(config.server.errorPath, 'offline.html');
    assert.match(config.appId, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
    // lo stesso token che app.js usa per riconoscere l'APK e mostrare l'aspetto da app
    assert.equal(config.android.appendUserAgent, App.TOKEN_APK);
    assert.equal(App.modoApp({ ua: `Mozilla/5.0 (Linux; Android 14; wv) Chrome/126.0 Mobile Safari/537.36 ${config.android.appendUserAgent}` }), 'apk');
    // nero come la barra del sito, con icone chiare nelle barre di sistema
    assert.equal(config.android.backgroundColor, '#000000');
    assert.equal(config.plugins.SystemBars.style, 'DARK');
});

test('offline.html del sito e capacitor.config.json indicano lo stesso indirizzo (il pulsante "Try again" dell\'app)', () => {
    const m = leggi('docs/offline.html').match(/var sito = '([^']*)';/);
    assert.ok(m, 'manca la costante "sito" in offline.html');
    assert.equal(m[1], config.server.url);
});

test('il pulsante "Try again" nell\'app (https://localhost) porta al sito, nel browser ricarica la pagina', () => {
    const html = leggi('docs/offline.html');
    assert.match(html, /location\.hostname === 'localhost' && location\.protocol === 'https:' && !location\.port/);
    assert.match(html, /location\.href = sito/);
});

// ---------- tools/android/prepara.cjs ----------

test('indirizzoSito: SITO_URL ha la precedenza, serve https, la barra finale si aggiunge', () => {
    assert.equal(P.indirizzoSito(config, {}), config.server.url);
    assert.equal(P.indirizzoSito(config, { SITO_URL: '' }), config.server.url, 'variabile vuota = non impostata');
    assert.equal(P.indirizzoSito(config, { SITO_URL: 'https://altro.example/app' }), 'https://altro.example/app/');
    assert.equal(P.indirizzoSito(config, { SITO_URL: '  https://altro.example/  ' }), 'https://altro.example/');
    for (const brutto of ['http://altro.example/', 'altro.example', 'https://a b.example/', 'https://x.example/"><script>', "https://x.example/'", 'javascript:alert(1)']) {
        assert.throws(() => P.indirizzoSito(config, { SITO_URL: brutto }), /non valido/, brutto);
    }
});

test('codiceVersione: il numero della build di GitHub, sempre intero e crescente', () => {
    assert.equal(P.codiceVersione({ GITHUB_RUN_NUMBER: '42' }), 42);
    assert.equal(P.codiceVersione({ VERSION_CODE: '7', GITHUB_RUN_NUMBER: '42' }), 7);
    assert.equal(P.codiceVersione({}), 1);
    for (const brutto of ['0', '-3', '2.5', 'abc', '3000000000']) assert.throws(() => P.codiceVersione({ VERSION_CODE: brutto }), /non valido/, brutto);
});

test('paginaIngresso: porta al sito (anche senza JavaScript), nessun file esterno', () => {
    const url = 'https://didi722.github.io/didi-lu/';
    const html = P.paginaIngresso(url);
    assert.equal((html.match(/https:\/\/didi722\.github\.io\/didi-lu\//g) || []).length, 3);
    assert.match(html, /<meta http-equiv="refresh" content="0; url=https:\/\/didi722\.github\.io\/didi-lu\/">/);
    assert.doesNotMatch(html, /<script[^>]+src=|<link/);
});

test('paginaOffline: cambia solo l\'indirizzo del sito; se la costante manca, si ferma', () => {
    const html = leggi('docs/offline.html');
    const nuova = P.paginaOffline(html, 'https://altro.example/app/');
    assert.match(nuova, /var sito = 'https:\/\/altro\.example\/app\/';/);
    assert.equal(nuova.replace('https://altro.example/app/', config.server.url), html);
    assert.throws(() => P.paginaOffline('<html></html>', 'https://x.example/'), /Non trovo/);
});

// i pezzi del progetto che Capacitor 8 genera (copiati dal modello vero)
const STILI = `<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Base application theme. -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>


    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
    </style>
</resources>`;
const GRADLE = `android {
    namespace = "com.didilucabattles.app"
    defaultConfig {
        applicationId "com.didilucabattles.app"
        minSdkVersion rootProject.ext.minSdkVersion
        versionCode 1
        versionName "1.0"
    }
}`;
const MANIFESTO = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name">
    </application>
</manifest>`;

test('modificaStili: sfondo nero dietro le barre di sistema e nella schermata di avvio, senza toccare il resto; ripetuta non cambia nulla', () => {
    const fatto = P.modificaStili(STILI);
    const stile = nome => fatto.slice(fatto.indexOf(`<style name="${nome}"`), fatto.indexOf('</style>', fatto.indexOf(`<style name="${nome}"`)));
    assert.match(stile('AppTheme.NoActionBar'), /<item name="android:windowBackground">@android:color\/black<\/item>/);
    assert.match(stile('AppTheme.NoActionBarLaunch'), /<item name="windowSplashScreenBackground">#000000<\/item>/);
    assert.doesNotMatch(stile('AppTheme'), /windowBackground|SplashScreen/);
    assert.match(stile('AppTheme.NoActionBarLaunch'), /<item name="android:background">@drawable\/splash<\/item>/, 'lo sfondo con il logo resta');
    assert.equal(P.modificaStili(fatto), fatto);
    assert.throws(() => P.modificaStili('<resources></resources>'), /Non trovo lo stile AppTheme\.NoActionBar/);
    assert.throws(() => P.modificaStili(STILI.replace('NoActionBarLaunch', 'Altro')), /Non trovo lo stile AppTheme\.NoActionBarLaunch/);
});

test('modificaGradle: versione = numero della build; se il modello cambia, si ferma', () => {
    const fatto = P.modificaGradle(GRADLE, 57);
    assert.match(fatto, /versionCode 57\b/);
    assert.match(fatto, /versionName "1\.57"/);
    assert.match(fatto, /applicationId "com\.didilucabattles\.app"/);
    assert.throws(() => P.modificaGradle('android { }', 1), /Non trovo versionCode/);
    assert.throws(() => P.modificaGradle('versionCode 1', 1), /Non trovo versionName/);
});

test('modificaManifest: niente copia di sicurezza nel cloud; se il modello cambia, si ferma', () => {
    assert.match(P.modificaManifest(MANIFESTO), /android:allowBackup="false"/);
    assert.throws(() => P.modificaManifest('<manifest/>'), /Non trovo allowBackup/);
    // e il permesso per le notifiche (Android 13+), una volta sola
    const fatto = P.modificaManifest(MANIFESTO);
    assert.equal((fatto.match(/android\.permission\.POST_NOTIFICATIONS/g) || []).length, 1);
    const giaCol = MANIFESTO.replace('</manifest>', '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" /></manifest>');
    assert.equal((P.modificaManifest(giaCol).match(/POST_NOTIFICATIONS/g) || []).length, 1, 'se c\'è già non si ripete');
});

// il punto del plugin ufficiale @capacitor/screen-orientation (ScreenOrientation.java) che modificaOrientamento cambia
const JAVA_PLUGIN = `public class ScreenOrientation {
    private int fromOrientationTypeToEnum(String orientationType) {
        switch (orientationType) {
            case "any":
                return ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
            case "landscape":
            case "landscape-primary":
                return ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
            case "landscape-secondary":
                return ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE;
            default:
                return ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        }
    }
}`;

test('modificaOrientamento: "landscape" segue il sensore (tutti e due i versi), gli altri tipi restano; ripetuta non cambia nulla; se il plugin cambia, si ferma', () => {
    const fatto = P.modificaOrientamento(JAVA_PLUGIN);
    assert.match(fatto, /case "landscape":\s*return ActivityInfo\.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;/);
    assert.match(fatto, /case "landscape-primary":\s*return ActivityInfo\.SCREEN_ORIENTATION_LANDSCAPE;/, 'un verso preciso resta fisso');
    assert.match(fatto, /case "landscape-secondary":\s*return ActivityInfo\.SCREEN_ORIENTATION_REVERSE_LANDSCAPE;/);
    assert.match(fatto, /case "any":\s*return ActivityInfo\.SCREEN_ORIENTATION_UNSPECIFIED;/, 'sbloccare resta sbloccare');
    assert.equal(P.modificaOrientamento(fatto), fatto);
    assert.throws(() => P.modificaOrientamento('class ScreenOrientation {}'), /Non trovo la scelta di "landscape"/);
});

test('il plugin ScreenOrientation installato ha il punto che modificaOrientamento si aspetta (cambiando versione si accorge se il codice è diverso)', () => {
    const file = path.join(RADICE, 'node_modules', '@capacitor', 'screen-orientation', 'android', 'src', 'main', 'java', 'com', 'capacitorjs', 'plugins', 'screenorientation', 'ScreenOrientation.java');
    assert.ok(fs.existsSync(file), 'manca il plugin: npm ci');
    assert.ok(P.modificaOrientamento(fs.readFileSync(file, 'utf8')).includes('SCREEN_ORIENTATION_SENSOR_LANDSCAPE'));
    const pkg = JSON.parse(leggi('package.json'));
    assert.match(pkg.dependencies['@capacitor/screen-orientation'], /^\^8\./, 'stessa versione maggiore di Capacitor');
    const lock = JSON.parse(leggi('package-lock.json'));
    assert.equal(lock.packages[''].dependencies['@capacitor/screen-orientation'], pkg.dependencies['@capacitor/screen-orientation']);
});

test('preparaPlugin: senza "npm ci" avvisa; col plugin presente lo ritocca', () => {
    const d = cartellaProva();
    try {
        assert.throws(() => P.preparaPlugin(d), /npm ci/);
        const dir = path.join(d, 'node_modules', '@capacitor', 'screen-orientation', 'android', 'src', 'main', 'java', 'com', 'capacitorjs', 'plugins', 'screenorientation');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'ScreenOrientation.java'), JAVA_PLUGIN);
        P.preparaPlugin(d);
        assert.match(fs.readFileSync(path.join(dir, 'ScreenOrientation.java'), 'utf8'), /SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

function cartellaProva() {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'app-android-'));
    fs.mkdirSync(path.join(d, 'docs'), { recursive: true });
    fs.copyFileSync(path.join(RADICE, 'capacitor.config.json'), path.join(d, 'capacitor.config.json'));
    fs.copyFileSync(path.join(RADICE, 'docs', 'offline.html'), path.join(d, 'docs', 'offline.html'));
    return d;
}

test('preparaWeb: rifà www/ da zero con ingresso e offline.html; SITO_URL finisce anche nel config', () => {
    const d = cartellaProva();
    try {
        fs.mkdirSync(path.join(d, 'www'));
        fs.writeFileSync(path.join(d, 'www', 'vecchio.html'), 'roba vecchia');
        const r = P.preparaWeb(d, {});
        assert.equal(r.url, config.server.url);
        assert.deepEqual(fs.readdirSync(path.join(d, 'www')).sort(), ['index.html', 'offline.html'], 'il vecchio contenuto di www/ non resta');
        assert.equal(fs.readFileSync(path.join(d, 'capacitor.config.json'), 'utf8'), leggi('capacitor.config.json'), 'config invariato senza SITO_URL');

        const s = P.preparaWeb(d, { SITO_URL: 'https://nuovo.example/lega' });
        assert.equal(s.url, 'https://nuovo.example/lega/');
        assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'capacitor.config.json'), 'utf8')).server.url, 'https://nuovo.example/lega/');
        assert.match(fs.readFileSync(path.join(d, 'www', 'offline.html'), 'utf8'), /var sito = 'https:\/\/nuovo\.example\/lega\/';/);
        assert.match(fs.readFileSync(path.join(d, 'www', 'index.html'), 'utf8'), /url=https:\/\/nuovo\.example\/lega\//);

        const altra = JSON.parse(leggi('capacitor.config.json'));
        altra.webDir = '../fuori';
        fs.writeFileSync(path.join(d, 'capacitor.config.json'), JSON.stringify(altra));
        assert.throws(() => P.preparaWeb(d, {}), /webDir deve restare "www"/);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('preparaAndroid: ritocca stili, gradle e manifesto del progetto generato; senza "cap add android" avvisa', () => {
    const d = cartellaProva();
    try {
        assert.throws(() => P.preparaAndroid(d, {}), /npx cap add android/);
        const app = path.join(d, 'android', 'app');
        fs.mkdirSync(path.join(app, 'src', 'main', 'res', 'values'), { recursive: true });
        fs.writeFileSync(path.join(app, 'src', 'main', 'res', 'values', 'styles.xml'), STILI);
        fs.writeFileSync(path.join(app, 'build.gradle'), GRADLE);
        fs.writeFileSync(path.join(app, 'src', 'main', 'AndroidManifest.xml'), MANIFESTO);
        const r = P.preparaAndroid(d, { GITHUB_RUN_NUMBER: '12' });
        assert.equal(r.codice, 12);
        assert.match(fs.readFileSync(path.join(app, 'build.gradle'), 'utf8'), /versionName "1\.12"/);
        assert.match(fs.readFileSync(path.join(app, 'src', 'main', 'res', 'values', 'styles.xml'), 'utf8'), /windowSplashScreenBackground/);
        assert.match(fs.readFileSync(path.join(app, 'src', 'main', 'AndroidManifest.xml'), 'utf8'), /allowBackup="false"/);
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

// ---------- .github/workflows/android-apk.yml ----------

test('workflow: parte dai file dell\'app su main, a mano, e con Node 22 e Java 21 (li vuole Capacitor 8)', () => {
    assert.match(workflow, /^on:\n  push:\n    branches:\n      - main\n/m);
    assert.match(workflow, /^  workflow_dispatch:/m);
    for (const f of ['capacitor.config.json', 'package.json', 'package-lock.json', 'assets/**', 'tools/android/**', 'docs/offline.html', '.github/workflows/android-apk.yml']) {
        assert.ok(workflow.includes(`- '${f}'`), `manca il percorso ${f} tra quelli che fanno partire la build`);
    }
    assert.match(workflow, /node-version: 22/);
    assert.match(workflow, /java-version: 21/);
    assert.match(workflow, /@capacitor\/assets@3\.0\.5/, 'versione dello strumento delle icone fissata');
});

test('workflow: i nomi dei passi sono YAML valido (un due punti seguito da spazio, senza virgolette, rompe tutto il file e GitHub non fa partire niente)', () => {
    for (const riga of workflow.split('\n')) {
        const m = riga.match(/^\s*- name: (.*)$/);
        if (!m || /^["']/.test(m[1])) continue;
        assert.doesNotMatch(m[1], /: |\s#/, `nome del passo non valido in YAML: ${m[1]}`);
    }
});

test('workflow: i passi stanno nell\'ordine giusto (www, progetto, icone, ritocchi, sincronizzazione, Gradle, firma, release)', () => {
    const ordine = [
        'npm ci --ignore-scripts', 'node tools/android/prepara.cjs plugin', 'node tools/android/prepara.cjs web', 'npx cap add android', 'generate --android',
        'node tools/android/prepara.cjs android', 'npx cap sync android', 'assembleRelease', 'zipalign', 'apksigner" sign', 'apksigner" verify', 'softprops/action-gh-release'
    ];
    let da = 0;
    for (const passo of ordine) {
        const i = workflow.indexOf(passo, da);
        assert.ok(i >= 0, `passo mancante o fuori ordine: ${passo}`);
        da = i;
    }
});

test('workflow: la release si aggiorna solo da main e con tag/file fissi; il resto costruisce soltanto', () => {
    assert.match(workflow, /^permissions:\n  contents: write/m);
    const rilascio = workflow.slice(workflow.indexOf('- name: Pubblica nella release'));
    assert.match(rilascio, /if: github\.ref == 'refs\/heads\/main'/);
    assert.match(rilascio, /tag_name: app-android/);
    assert.match(rilascio, /files: sant-alvise-league\.apk/);
    assert.match(rilascio, /make_latest: false/);
    assert.ok(workflow.includes('releases/download/app-android/sant-alvise-league.apk'));
    // l'APK della prova resta comunque tra gli artifact
    assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*sant-alvise-league\.apk/);
    // una sola build alla volta per ramo
    assert.match(workflow, /concurrency:\n  group: android-apk-\$\{\{ github\.ref \}\}/);
});

test('workflow: firma con la chiave del repository, o con quella privata dei Secrets se ci sono', () => {
    const chiave = path.join(RADICE, 'tools', 'android', 'firma-apk.p12');
    const byte = fs.readFileSync(chiave);
    assert.ok(byte.length > 1000, 'keystore vuoto');
    assert.equal(byte[0], 0x30, 'non sembra un file PKCS12 (DER)');
    assert.ok(workflow.includes('tools/android/firma-apk.p12'));
    for (const s of ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) assert.ok(workflow.includes(`secrets.${s}`), s);
    assert.match(workflow, /if \[ -n "\$\{KEYSTORE_BASE64:-\}" \]/);
    assert.match(workflow, /apksigner" verify --verbose --print-certs/, 'la firma si controlla prima di pubblicare');
    assert.ok(workflow.includes('SITO_URL: ${{ vars.SITO_URL }}'), 'indirizzo del sito cambiabile senza toccare il codice');
});

// ---------- i file che servono alla build ----------

test('icone e schermata di avvio: le cinque immagini che @capacitor/assets cerca, delle misure richieste', () => {
    const dimensioni = f => {
        const b = fs.readFileSync(path.join(RADICE, 'assets', f));
        assert.equal(b.toString('latin1', 1, 4), 'PNG', f);
        return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    for (const f of ['icon-only.png', 'icon-foreground.png', 'icon-background.png']) assert.deepEqual(dimensioni(f), [1024, 1024], f);
    for (const f of ['splash.png', 'splash-dark.png']) assert.deepEqual(dimensioni(f), [2732, 2732], f);
});

test('.gitignore: il progetto generato (android/) e www/ restano fuori dal repository, ma tools/android/ no', () => {
    const righe = leggi('.gitignore').split('\n').map(r => r.trim());
    assert.ok(righe.includes('/android/'), 'android/ solo alla radice (senza la barra iniziale scarterebbe anche tools/android/)');
    assert.ok(righe.includes('/www/'));
    assert.ok(!righe.includes('android/'), 'il vecchio "android/" nasconderebbe tools/android/');
    assert.ok(fs.existsSync(path.join(RADICE, 'tools', 'android', 'prepara.cjs')));
});

test('package.json e package-lock.json: Capacitor core, cli e android alla stessa versione (npm ci nel workflow non deve fallire)', () => {
    const pkg = JSON.parse(leggi('package.json'));
    const lock = JSON.parse(leggi('package-lock.json'));
    const versioni = [];
    for (const n of ['core', 'cli', 'android']) {
        const nome = `@capacitor/${n}`;
        assert.match(pkg.dependencies[nome], /^\^8\./, nome);
        assert.equal(lock.packages[''].dependencies[nome], pkg.dependencies[nome], `${nome}: package-lock.json non allineato a package.json`);
        versioni.push(lock.packages[`node_modules/${nome}`].version);
    }
    assert.equal(new Set(versioni).size, 1, 'versioni installate diverse: ' + versioni.join(', '));
});
