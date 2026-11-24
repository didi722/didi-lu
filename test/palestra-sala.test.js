'use strict';
// Entrare in una palestra: la pagina di scelta dei team vestita come la palestra (colori, sfondo, avatar, nome), le statistiche e il premio in monete dentro la pagina, e la musica
// scelta dal capopalestra, sia nella scelta dei team sia nel simulatore. Qui il lato del sito (palestra.js puro + cablaggio); il server sta in test/palestra-sfide.test.js.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../docs/palestra.js');
const PP = require('../docs/pagina-pubblica.js');
const C = require('../docs/cosmetici.js');
const A = require('../docs/app.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// ---------------------------------------------------------------- il modulo puro (palestra.js)
test('urlMusica: solo indirizzi http(s) o percorsi del sito, mai codice, dati o testo con virgolette', () => {
    assert.equal(P.urlMusica('https://archive.org/download/x/Gym%20Leader.mp3'), 'https://archive.org/download/x/Gym%20Leader.mp3');
    assert.equal(P.urlMusica('  http://example.com/a.mp3  '), 'http://example.com/a.mp3', 'gli spazi attorno si tolgono');
    assert.equal(P.urlMusica('audio/tema-palestra.mp3'), 'audio/tema-palestra.mp3', 'un percorso del sito');
    for (const male of ['javascript:alert(1)', 'data:audio/mp3;base64,AAAA', 'file:///etc/passwd', '//evil.example/x.mp3', '/assoluto/x.mp3', '../x.mp3', 'a/../../x.mp3',
        'https://x.example/a b.mp3', 'https://x.example/a"b.mp3', "https://x.example/a'b.mp3", 'https://x.example/<b>.mp3', 'https://', 'https:///x', 'ftp://x.example/a.mp3', '', '   ', null, undefined, 42, {}]) {
        assert.equal(P.urlMusica(male), '', `si rifiuta: ${JSON.stringify(male)}`);
    }
    assert.equal(P.urlMusica(`https://x.example/${'a'.repeat(700)}.mp3`), '', 'indirizzi lunghissimi no');
});

test('aspettoCapo: com\'è fatto il capopalestra (colore, avatar, pagina, aura, effetti, compagno, canzone), uguale nella scelta dei team e nel simulatore', () => {
    const info = { color: '#3399FF', avatar: 'immagini/profile/7.png', pagina: { carta: { font: 'bungee' } }, aura: 'aura-oro', effettoNome: 'nome-neon', effettoPalco: 'palco-neve',
        pkmPreferito: 'Garchomp', musicaPreferita: 'https://archive.org/x/Gym%20Theme.mp3', musicName: 'Gym Theme', palestra: { tappe: [] }, wallet: 99 };
    const a = P.aspettoCapo(info, true);
    assert.deepEqual(a, { colore: '#3399FF', avatar: 'immagini/profile/7.png', pagina: { carta: { font: 'bungee' } }, aura: 'aura-oro', effettoNome: 'nome-neon', effettoPalco: 'palco-neve',
        compagno: { nome: 'Garchomp', shiny: true }, musica: { url: 'https://archive.org/x/Gym%20Theme.mp3', nome: 'Gym Theme' } });
    assert.equal(P.aspettoCapo(info, false).compagno.shiny, false);
    // niente canzone, niente compagno: null (e la pagina resta com'è, senza musica propria)
    const nuda = P.aspettoCapo({ color: '#FF7B6B' });
    assert.equal(nuda.musica, null); assert.equal(nuda.compagno, null);
    assert.equal(P.aspettoCapo({ musicaPreferita: 'javascript:alert(1)', musicName: 'x' }).musica, null, 'una canzone non sicura non suona');
    assert.equal(P.aspettoCapo({ musicaPreferita: 'https://x.example/a.mp3', musicName: 'N'.repeat(300) }).musica.nome.length, 80, 'il titolo è corto');
    assert.deepEqual(P.aspettoCapo(null, false).musica, null);
    // il tema che ne esce non porta con sé la canzone: la musica non passa dal CSS
    const tema = P.temaPalestra(a, PP, C);
    assert.ok(!('musica' in tema));
});

test('temaPalestra: il carattere del capopalestra è uno della lista ammessa (Google Fonts), sennò Josefin Sans', () => {
    assert.equal(P.temaPalestra({ colore: '#3399FF', pagina: { carta: { font: 'bungee' } } }, PP, C).font, 'Bungee');
    assert.equal(P.temaPalestra({ colore: '#3399FF', pagina: { carta: { font: 'pixel' } } }, PP, C).font, 'Press Start 2P');
    assert.equal(P.temaPalestra({ colore: '#3399FF' }, PP, C).font, 'Josefin Sans', 'chi non ha toccato la pagina');
    assert.equal(P.temaPalestra({ colore: '#3399FF', pagina: { carta: { font: 'x"; src: url(//evil)' } } }, PP, C).font, 'Josefin Sans', 'un nome fuori lista non arriva al caricamento dei font');
    for (const id of Object.keys(PP.FONT)) assert.equal(P.temaPalestra({ colore: '#3399FF', pagina: { carta: { font: id } } }, PP, C).font, PP.FONT[id].nome, id);
});

// ---------------------------------------------------------------- il simulatore: la sua musica
test('simulatore: la musica del capopalestra prende il posto di quella di Showdown (silenziata), segue il volume del sito e se non si carica torna quella di Showdown', () => {
    const bu = leggi('docs', 'battle-ui.js');
    // team-sito.js passa la canzone insieme all'aspetto
    assert.match(leggi('docs', 'team-sito.js'), /return \{ [\s\S]*?, aspetto, musica: aspetto\.musica \};/);
    // preparaPalestra la avvia dopo aver vestito la pagina e prima che parta la scena (la musica di Showdown parte con la scena)
    const prep = bu.slice(bu.indexOf('async function preparaPalestra'), bu.indexOf('function vestiPalestra'));
    assert.match(prep, /avviaMusicaPalestra\(gym\.musica\);/);
    assert.ok(prep.indexOf('avviaMusicaPalestra(gym.musica)') < prep.indexOf('avviaBattaglia();'), 'prima della scena');
    // la variabile deve esistere prima che preparaAudio() giri (alla riga di avvio della pagina): un `let` dichiarato dopo darebbe un errore all'apertura di ogni partita
    assert.ok(bu.indexOf('let musicaCapo = null;') > 0 && bu.indexOf('let musicaCapo = null;') < bu.indexOf('\npreparaAudio();'), 'musicaCapo è dichiarata prima dell\'avvio');
    const mus = bu.slice(bu.indexOf('function avviaMusicaPalestra'), bu.indexOf('// Utilità DOM'));
    assert.match(mus, /if \(musicaCapo \|\| !musica \|\| !musica\.url \|\| !PS\) return;/, 'senza canzone resta la musica di Showdown; una sola volta per pagina');
    assert.match(mus, /audio\.loop = true;/);
    assert.match(mus, /audio\.volume = 0\.5;/, 'come la musica di Showdown (bgmVolume 50)');
    assert.match(mus, /audio\.src = musica\.url;/);
    assert.match(mus, /PS\.BattleSound\.bgmVolume = 0;/, 'quella di Showdown non parte: currentBgm() non ne trova (versi ed effetti restano)');
    assert.match(mus, /audio\.addEventListener\('error', \(\) => \{[\s\S]*PS\.BattleSound\.bgmVolume = 50;[\s\S]*PS\.BattleSound\.setMute\(audioSpento\(\)\);/, 'canzone che non si carica: torna Showdown');
    assert.match(mus, /if \(audioSpento\(\)\) \{ audio\.pause\(\); return; \}/, 'volume del sito spento: niente musica');
    assert.match(mus, /document\.addEventListener\('pointerdown'[\s\S]*audio\.play\(\)/, 'se il browser blocca la partenza, riparte al primo tocco');
    // il tasto del volume e la preferenza comandano anche questa musica
    assert.match(bu, /if \(scena\) scena\.battle\.setMute\(spento\);\s*suonaMusicaCapo\(\);/);
});

// ---------------------------------------------------------------- il simulatore: le statistiche e il premio (lato client)
test('simulatore: a ogni tappa dice al server "inizia" e "fine" (Function palestraSfida) e mostra le monete nel cartello', () => {
    const bu = leggi('docs', 'battle-ui.js');
    assert.match(bu, /firebase\.app\(\)\.functions\('europe-west1'\)\.httpsCallable\('palestraSfida'\)\(dati\)/);
    assert.match(bu, /riferisciPalestra\('inizia'\);/);
    assert.match(bu, /riferisciPalestra\('fine', vinto\)\.then\(mostraPremioPalestra\);/);
    assert.match(bu, /const dati = \{ azione, gym: g\.id, tappa: g\.tappa \};\s*if \(azione === 'fine'\) dati\.vinta = !!vinta;/);
    // "fine" si ritenta una volta; "inizia" no; niente rompe la partita
    assert.match(bu, /if \(azione !== 'fine'\) return null;\s*await new Promise\(ok => setTimeout\(ok, 2500\)\);/);
    // le tre frasi del cartello: monete prese, già prese questa settimana, sfida non cominciata dalla prima tappa
    assert.match(bu, /coins for conquering the gym! The next gym coins are up for grabs on Monday\./);
    assert.match(bu, /You already collected your gym coins this week: they are back on Monday\./);
    assert.match(bu, /No coins this time: they're paid when you clear all 3 stages in one run, starting from stage 1\./);
    assert.match(leggi('docs', 'battle.html'), /<p class="esito-premio" id="premio-vittoria" hidden><\/p>/);
    assert.match(leggi('docs', 'battle.html'), /firebase-functions-compat\.js/, 'il client delle Functions è nella pagina');
    assert.match(leggi('docs', 'style-palestra-battaglia.css'), /\.esito-card \.esito-premio \{/);
    // il cartello degli altri esiti non si porta dietro la riga del premio
    assert.match(bu, /const premio = \$\('premio-vittoria'\);\s*if \(premio\) premio\.hidden = true;/);
});

// ---------------------------------------------------------------- la pagina di scelta dei team
test('palestra.html: gli stili e i moduli del simulatore (sfondo, avatar, compagno), la musica del capopalestra e la barra che non cambia colore', () => {
    const html = leggi('docs', 'palestra.html');
    assert.match(html, /<link rel="stylesheet" href="style-versus\.css">\s*<link rel="stylesheet" href="style-palestra-battaglia\.css">\s*<link rel="stylesheet" href="style-palestra\.css">/, 'gli stili del simulatore prima di quelli della pagina');
    for (const s of ['pagina-pubblica', 'cosmetici', 'altezze-pkm', 'scala-pkm', 'palestra-stat']) assert.match(html, new RegExp(`<script src="${s}\\.js"></script>`), s);
    // la musica: la canzone del capopalestra, comunicata da palestra-ui.js; finché non si sa non parte nulla (niente Pokémon Center e poi, di colpo, un'altra canzone)
    assert.match(html, /window\.musicaPalestra = \{ imposta\(url\) \{ canzonePalestra = String\(url \|\| ''\); musicaPronta = true; syncMusicState\(\); \} \};/);
    assert.match(html, /if \(q\.get\('player'\) && q\.get\('edit'\) !== '1'\) musicaPronta = false;/, 'solo sfidando un altro si aspetta di sapere la canzone');
    assert.match(html, /if \(!player \|\| !musicaPronta\) return;/);
    assert.match(html, /const indirizzo = canzonePalestra \|\| LINK_MP3_HOME;/, 'senza canzone suona quella di sempre');
    assert.match(html, /player\.getAttribute\('src'\) !== indirizzo/);
    // la barra in alto ha il colore del capopalestra (palestra-ui.js): il colore dell'utente non la ricolora
    assert.equal((html.match(/!document\.body\.classList\.contains\('pal-dentro'\)/g) || []).length, 2, 'né con il profilo né senza login');
});

test('palestra-ui.js: sfidando un altro la pagina si veste da palestra e suona la sua canzone; le statistiche e il premio sono lì dentro', () => {
    const ui = leggi('docs', 'palestra-ui.js');
    // l'aspetto è lo stesso del simulatore (Palestra.aspettoCapo) e il compagno è shiny come nel suo Box
    assert.match(ui, /S\.capo = P\.aspettoCapo\(i, shiny\);\s*S\.tema = vestiSala\(\);/);
    assert.match(ui, /window\.Cosmetici\.compagnoShiny\(i, \(await leggi\(`players\/\$\{altro\}\/teams`\)\) \|\| \{\}\)/);
    assert.match(ui, /P\.tappeDi\(config\)\.length === P\.TAPPE\) \{ S\.capo = /, 'una palestra non costruita non si veste e non suona');
    // vestiSala: come vestiPalestra del simulatore
    const sala = ui.slice(ui.indexOf('function vestiSala'), ui.indexOf('function insegnaHtml'));
    assert.match(sala, /colore: 'giocatore'/, 'lo sfondo è il suo colore con il suo motivo, come nelle partite');
    assert.match(sala, /const tema = P\.temaPalestra\(aspetto, PP, CO\);/);
    assert.match(sala, /document\.body\.classList\.add\('palestra', 'pal-dentro'\);/);
    assert.match(sala, /barra\.style\.setProperty\('background-color', tema\.colore, 'important'\);/);
    assert.match(sala, /if \(tema\.font && tema\.font !== 'Josefin Sans'\) caricaFont\(tema\.font\);/);
    assert.match(sala, /class="vs-avatar pal-avatar"/); assert.match(sala, /class="vs-compagno"/);
    assert.match(sala, /ScalaPkm|SC\.scena|scena\(/, 'il compagno ha la sua misura, come nel simulatore');
    // la canzone: quella del capopalestra, o vuota (e allora suona la solita) — comunque a pagina pronta
    assert.match(ui, /const suona = url => \{ if \(window\.musicaPalestra\) window\.musicaPalestra\.imposta\(url \|\| ''\); \};/);
    assert.match(ui, /fine = \(\) => \{ suona\(S\.capo && S\.capo\.musica \? S\.capo\.musica\.url : ''\);/);
    // le statistiche (pubbliche) e il premio della settimana (il portafoglio è di chi sfida)
    assert.match(ui, /leggi\(`players\/\$\{altro\}\/palestraStat`\)\.catch\(\(\) => null\)/);
    assert.match(ui, /leggi\(`wallet\/\$\{S\.uid\}\/premioPalestra`\)\.catch\(\(\) => null\)/);
    assert.match(ui, /leggi\(`players\/\$\{S\.io\}\/palestraStat`\)\.catch\(\(\) => null\)/, 'e anche nella propria, da impostare');
    assert.match(ui, /chip\(r\.tentativi, 'Attempts'/); assert.match(ui, /chip\(r\.tenuta, 'Gym wins'/); assert.match(ui, /chip\(r\.espugnata, 'Gym beaten'/);
    assert.match(ui, /<details class="pal-dett"><summary>Stage by stage · recent challenges<\/summary>/);
    assert.match(ui, /Gym coins are paid once a week in total, whichever gym you conquer\./);
    // PalestraStat serve alla pagina (riassunto, tempoFa, settimane)
    assert.match(ui, /const P = window\.Palestra, ST = window\.PalestraStat;/);
});

test('titolo della pagina: "Didi\'s gym" (di chi tiene la palestra sfidandola, il proprio nella propria), anche per il nastro dell\'app e la scheda del browser', () => {
    // l'h1 ha l'id come nelle altre pagine con il titolo che cambia: è quello che app-gioco.js legge per il nastro
    assert.match(leggi('docs', 'palestra.html'), /<h1 class="hub-title-display" id="hub-title-display">GYM<\/h1>/);
    const ui = leggi('docs', 'palestra-ui.js');
    const f = ui.slice(ui.indexOf('function intestazione'), ui.indexOf('// ---------------------------------------------------------------- le statistiche della palestra'));
    assert.match(f, /const titolo = `\$\{n\}'s gym`;/);
    assert.match(f, /h1\.textContent = titolo;/);
    assert.match(f, /document\.title = titolo;/);
    assert.match(f, /if \(!n\) return;/, 'senza nome resta "GYM"');
    assert.match(ui, /S\.nomeIo = String\(nome \|\| ''\)\.trim\(\);/, 'il proprio nome, com\'è scritto (non quello in minuscolo che serve da chiave)');
    assert.match(ui, /intestazione\(S\.nomeIo\);\s*\$\('pal-corpo'\)\.hidden = false;/, 'nella propria palestra');
    assert.match(ui, /S\.stat = stat; S\.premio = premio;\s*intestazione\(S\.gymNome\);/, 'sfidando un altro, anche se non ha ancora costruito la palestra');
    // il nastro dell'app segue quel testo (la palestra non ha una tessera nel menù) e, se non entra, resta "Gym"
    assert.equal(A.voceDi('palestra.html'), null);
    assert.match(leggi('docs', 'app-gioco.js'), /const RISERVE = \{ 'palestra\.html': 'Gym' \};/);
});

test('style-palestra.css: dentro la palestra i colori sono i suoi (sfondo del simulatore, targa, numeri); nell\'app tutto sta in una schermata', () => {
    const css = leggi('docs', 'style-palestra.css');
    // temi.css mette lo sfondo giallo con !important al body: la palestra lo ridefinisce con la stessa forza (e il testo fantasma del tema)
    assert.match(css, /html body\.pg-palestra\.pal-dentro \{[^}]*!important/);
    assert.match(css, /html body\.pg-palestra\.pal-dentro::before \{/);
    assert.match(css, /html body\.pg-palestra\.pal-dentro\.pal-scorre::before \{/);
    for (const re of [/\.pal-insegna \{/, /\.pal-chips \{/, /\.pal-chip \{/, /\.pal-dett \{/, /\.pal-premio \{/, /html:not\(\.app-shell\) body\.pal-dentro \.ads-sidebar \{ display: none; \}/,
        /body\.pal-dentro \.pal-decor \.vs-avatar \{/, /body\.pal-dentro \.pal-decor \.vs-compagno \{/]) assert.match(css, re);
    // il premio come numero (quarta targhetta) solo nell'app: sul sito c'è il cartellino
    assert.match(css, /\.pal-chip-premio \{ display: none; \}/);
    assert.match(css, /html\.app-shell \.pal-chip-premio \{ display: flex;/);
    // nell'app le misure sono in unità dello schermo (--u): niente scorrimento
    assert.match(css, /html\.app-shell \.pal-insegna \{[^}]*var\(--u\)/);
    assert.match(css, /html\.app-shell \.pal-chip \{[^}]*var\(--u\)/);
});

test('Shop e documentazione: la riga del premio della palestra, una volta a settimana, e il catalogo uguale sul server', () => {
    assert.equal(C.PREMI.palestra, 25);
    assert.equal(leggi('docs', 'cosmetici.js'), leggi('functions', 'cosmetici.js'), 'cosmetici.js è lo stesso file sul sito e sul server');
    const neg = leggi('docs', 'negozio.js');
    assert.match(neg, /\['Gym conquered \(once a week\)', P\.palestra\]/);
    assert.match(neg, /it pays once a week in total, not per gym, and resets on Monday\./);
    const regole = leggi('REGOLE-DATABASE.md');
    const punto = regole.slice(regole.indexOf('8. **PALESTRA**'));
    for (const re of [/palestraSfida/, /firebase deploy --only functions/, /una volta a settimana in tutto/i, /canzone/i, /Attempts/, /Gym wins/, /Gym beaten/]) assert.match(punto.slice(0, 3000), re);
});
