'use strict';
// Il testa a testa nella pagina Trainers e nell'app: il tasto VS accanto a ogni allenatore, la finestra (scontri-diretti-ui.js) e il tasto sulla scheda dell'app.
// Sono controlli sul markup e sul codice (il conto e l'HTML si provano in scontri-diretti.test.js; l'aspetto, nel browser).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../docs/app-trainers.js');

const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');
const players = docs('players.html');
const ui = docs('scontri-diretti-ui.js');
const css = docs('scontri-diretti.css');
const cssApp = docs('app-gioco-pagine.css');

test('players.html carica stile e script del testa a testa, nell\'ordine giusto (il profilo prima, poi il calcolo, poi la finestra)', () => {
    assert.match(players, /<link rel="stylesheet" href="scontri-diretti\.css">/);
    const prima = players.indexOf('<script src="profilo-personale.js"></script>');
    const calcolo = players.indexOf('<script src="scontri-diretti.js"></script>');
    const finestra = players.indexOf('<script src="scontri-diretti-ui.js"></script>');
    assert.ok(prima > 0 && calcolo > prima && finestra > calcolo, 'profilo-personale.js, scontri-diretti.js, scontri-diretti-ui.js');
    // il calcolo usa il profilo: lo prende da lì (in Node con require, nel browser dalla finestra)
    assert.match(docs('scontri-diretti.js'), /require\('\.\/profilo-personale\.js'\)/);
    assert.match(docs('scontri-diretti.js'), /radice\.ScontriDiretti = fabbrica\(radice\.ProfiloPersonale\)/);
});

test('players.html: un tasto VS per riga, accanto alla card (non dentro) e prima delle spade; gli allenatori e il database vanno alla finestra', () => {
    const riga = players.slice(players.indexOf('class="trainer-riga"'));
    const finecard = riga.indexOf('</a>');
    const vs = riga.indexOf('ScontriDirettiUI.htmlTasto(player.id, player.name)');
    const spade = riga.indexOf('Amichevoli.htmlTasto(player.name)');
    assert.ok(finecard > 0 && vs > finecard, 'il VS dopo la chiusura del collegamento della card');
    assert.ok(spade > vs, 'e prima delle spade');
    assert.match(riga, /<div class="trainer-azioni">[^]*ScontriDirettiUI\.htmlTasto[^]*Amichevoli\.htmlTasto[^]*<\/div>/, 'i due tasti stanno insieme, così sul telefono si mettono uno sopra l\'altro');
    assert.match(players, /ScontriDirettiUI\.imposta\(\{ db, giocatori: playersList\.map\(p => \(\{ id: p\.id, nome: p\.name, avatar: p\.avatar, colore: p\.color \}\)\) \}\)/);
    // la lista è già in ordine di classifica quando la si passa
    assert.ok(players.indexOf('playersList.sort(') < players.indexOf('ScontriDirettiUI.imposta('));
    assert.match(players, /ScontriDirettiUI\.aggiornaTasti\(gridContainer\)/, 'il proprio VS si nasconde');
});

test('la finestra: legge le stagioni dalla stessa cache dei badge, si chiude con la X, fuori ed Esc, e la coppia di partenza la sceglie il modulo puro', () => {
    assert.match(ui, /window\.DbLeggero\.stagioniConStats\(db\)/, 'la stessa lettura (con la cache tra le pagine) che usano i badge: niente scaricamenti in più');
    assert.match(ui, /SD\.coppiaIniziale\(io\(\), idAvversario, stato\.giocatori\)/);
    assert.match(ui, /window\.__nomeUtente/, 'chi è collegato lo dice la pagina');
    assert.match(ui, /if \(t\.closest\('\[data-h2h-chiudi\]'\)\) return chiudi\(\);/);
    assert.match(ui, /if \(t === velo\) \{ if \(stato\.premutoSulVelo\) chiudi\(\); return; \}/, 'fuori chiude, ma non se la pressione è cominciata dentro la finestra');
    assert.match(ui, /e\.key === 'Escape'[^]*document\.querySelector\('\.ts-lista'\)\) return;/, 'con un menu a tendina aperto Esc chiude quello');
    assert.match(ui, /role', 'dialog'/);
    assert.match(ui, /aria-modal/);
    assert.match(ui, /document\.addEventListener\('app-utente'/, 'quando arriva il nome di chi è collegato i tasti si rifanno');
    assert.match(ui, /window\.ScontriDirettiUI = \{ imposta, apri, chiudi, clic, htmlTasto, aggiornaTasti \}/);
    // l'errore di lettura non lascia la finestra vuota
    assert.match(ui, /try again/);
});

test('htmlTasto: un vero pulsante col nome dell\'allenatore (e il suo id in minuscolo), senza HTML dal database', () => {
    // il tasto è scritto dalla pagina dentro una stringa: si prova con un finto "window" (il file si carica da solo)
    const finestra = { ScontriDiretti: require('../docs/scontri-diretti.js'), addEventListener() {} };
    const finto = { addEventListener() {} };
    new Function('window', 'document', ui)(finestra, finto);
    const t = finestra.ScontriDirettiUI.htmlTasto('El Burraco', 'El <b>Burraco</b>');
    assert.match(t, /<button type="button" class="tasto-scontro" data-id="el burraco"/);
    assert.match(t, /aria-label="Head to head with El &lt;b&gt;Burraco&lt;\/b&gt;"/);
    assert.match(t, /onclick="ScontriDirettiUI\.clic\(event, this\)"/);
    assert.doesNotMatch(t, /<b>Burraco/);
    // aggiornaTasti: nasconde solo il proprio
    const tasti = ['didi', 'lu'].map(id => ({ dataset: { id }, hidden: false }));
    finestra.__nomeUtente = 'Didi';
    finestra.ScontriDirettiUI.aggiornaTasti({ querySelectorAll: () => tasti });
    assert.deepEqual(tasti.map(x => x.hidden), [true, false]);
    finestra.__nomeUtente = '';
    finestra.ScontriDirettiUI.aggiornaTasti({ querySelectorAll: () => tasti });
    assert.deepEqual(tasti.map(x => x.hidden), [false, false], 'senza login si vedono tutti');
});

test('stile: il tasto, la finestra e i colori dei due lati seguono il tema; nell\'app la finestra è a due colonne', () => {
    assert.match(css, /\.tasto-scontro \{/);
    assert.match(css, /\.trainer-riga \.tasto-scontro\[hidden\][^}]*visibility: hidden/, 'il proprio tasto lascia il posto');
    assert.match(css, /@media \(max-width: 600px\) \{ \.trainer-azioni \{ flex-direction: column;/, 'sul telefono i due tasti uno sopra l\'altro');
    assert.match(css, /\.h2h-lato \{[^}]*background: var\(--c, #31c489\)/, 'ogni lato nel colore del suo allenatore');
    assert.match(css, /\.h2h-barra-a \{ background: var\(--ca/);
    assert.match(css, /html\.h2h-aperto, html\.h2h-aperto body \{ overflow: hidden; \}/, 'dietro la finestra la pagina non scorre');
    assert.match(css, /z-index: 5000/, 'sotto i menu a tendina del tema (100000)');
    assert.match(cssApp, /html\.app-shell \.h2h-contenuto \{[^}]*grid-template-columns: calc\(290 \* var\(--u\)\) minmax\(0, 1fr\)/, 'nell\'app due colonne: sintesi e dettagli');
    assert.match(cssApp, /html\.app-shell \.at-scontro \{/);
    assert.match(cssApp, /html\.app-shell \.trainer-riga \.tasto-scontro \{ display: none !important; \}/, 'le righe che l\'app non usa non mostrano il VS');
});

// ---------- l'app ----------
test('app: il tasto "Head to head" sta su ogni scheda tranne la propria (anche senza login), accanto al tasto della palestra', () => {
    const lukiani = { id: 'lukiani', nome: 'Lukiani', palestra: true };
    assert.match(T.htmlScontro(lukiani, 'Didi'), /<button type="button" class="at-scontro" data-scontro="lukiani"/);
    assert.match(T.htmlScontro(lukiani, ''), /data-scontro="lukiani"/, 'senza login lo si vede lo stesso');
    assert.equal(T.htmlScontro({ id: 'didi', nome: 'Didi' }, 'Didi'), '', 'non sulla propria scheda');
    assert.equal(T.htmlScontro({ id: 'didi', nome: 'Didi' }, 'DIDI'), '', 'le maiuscole non contano');
    assert.match(T.htmlScontro({ id: 'a"b', nome: 'x' }, ''), /data-scontro="a&quot;b"/, 'l\'id passa dall\'escape');
    const carta = T.htmlCarta(lukiani, 0, { io: 'Didi' });
    assert.match(carta, /<div class="at-azioni"><a class="at-palestra"[^]*<\/a><button type="button" class="at-scontro"/, 'palestra e testa a testa in fila');
    assert.ok(carta.indexOf('at-palestra') < carta.indexOf('at-scontro'));
    // sulla propria scheda resta "My gym" e basta
    const mia = T.htmlCarta({ id: 'didi', nome: 'Didi' }, 0, { io: 'Didi' });
    assert.match(mia, /at-palestra-mia/);
    assert.doesNotMatch(mia, /at-scontro/);
});

test('app: toccare il tasto sulla scheda al centro apre la finestra; sulle schede di lato porta la scheda al centro e basta', () => {
    const app = docs('app-trainers.js');
    assert.match(app, /return; \}\s*\/\/ il testa a testa dell'allenatore al centro/, 'il tasto di una scheda di lato non apre niente');
    assert.match(app, /const scontro = e\.target\.closest \? e\.target\.closest\('\[data-scontro\]'\) : null;\s*if \(scontro && win\.ScontriDirettiUI\) win\.ScontriDirettiUI\.apri\(scontro\.dataset\.scontro\);/);
    assert.match(players, /<script src="scontri-diretti-ui\.js"><\/script>/, 'l\'app usa la stessa pagina: la finestra c\'è');
});
