'use strict';
// Il testa a testa nella pagina Trainers e nell'app: un solo tasto "Head to head" in alto (come "Team builder" nel Box) e la finestra (scontri-diretti-ui.js).
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

test('players.html: un solo tasto "Head to head", raccolto in alto con gli altri come il Team builder del Box; niente VS per riga', () => {
    const tasto = players.match(/<button type="button" class="btn-floating-h2h"[^>]*>[^]*?<\/button>/);
    assert.ok(tasto, 'il tasto c\'è');
    assert.match(tasto[0], /onclick="if \(window\.ScontriDirettiUI\) ScontriDirettiUI\.apri\(\)"/, 'apre la finestra senza avversario: chi è collegato a sinistra, a destra si sceglie');
    assert.match(tasto[0], /<i class="fas fa-people-arrows tasto-icona"><\/i><span class="tasto-testo">Head to head<\/span>/, 'icona e testo come il Team builder: scorrendo resta la sola icona');
    assert.equal((players.match(/btn-floating-h2h/g) || []).length, 1, 'uno solo');
    assert.match(docs('controlli.js'), /SELETTORE_TASTI = '[^']*\.btn-floating-h2h'/, 'controlli.js lo porta in #tasti-alto');
    assert.ok(players.indexOf('class="btn-floating-h2h"') < players.indexOf('<script src="controlli.js">'));
    // niente tasti VS per riga
    const riga = players.slice(players.indexOf('class="trainer-riga"'));
    assert.doesNotMatch(riga, /ScontriDirettiUI\.htmlTasto|tasto-scontro|trainer-azioni/);
    assert.match(riga, /<\/a>\s*\$\{window\.Amichevoli \? Amichevoli\.htmlTasto\(player\.name\) : ''\}/, 'le spade restano subito dopo la card');
    assert.match(players, /ScontriDirettiUI\.imposta\(\{ db, giocatori: playersList\.map\(p => \(\{ id: p\.id, nome: p\.name, avatar: p\.avatar, colore: p\.color \}\)\) \}\)/);
    // la lista è già in ordine di classifica quando la si passa
    assert.ok(players.indexOf('playersList.sort(') < players.indexOf('ScontriDirettiUI.imposta('));
});

test('la finestra: legge le stagioni dalla stessa cache dei badge, si chiude con la X, fuori ed Esc, e la coppia di partenza la sceglie il modulo puro', () => {
    assert.match(ui, /window\.DbLeggero\.stagioniConStats\(db\)/, 'la stessa lettura (con la cache tra le pagine) che usano i badge: niente scaricamenti in più');
    assert.match(ui, /SD\.coppiaIniziale\(io\(\), idAvversario, stato\.giocatori\)/);
    assert.match(ui, /if \(!a \|\| !b\) return;/, 'servono almeno due allenatori');
    assert.match(ui, /window\.__nomeUtente/, 'chi è collegato lo dice la pagina');
    assert.match(ui, /if \(t\.closest\('\[data-h2h-chiudi\]'\)\) return chiudi\(\);/);
    assert.match(ui, /if \(t === velo\) \{ if \(stato\.premutoSulVelo\) chiudi\(\); return; \}/, 'fuori chiude, ma non se la pressione è cominciata dentro la finestra');
    assert.match(ui, /e\.key === 'Escape'[^]*document\.querySelector\('\.ts-lista'\)\) return;/, 'con un menu a tendina aperto Esc chiude quello');
    assert.match(ui, /role', 'dialog'/);
    assert.match(ui, /aria-modal/);
    assert.match(ui, /window\.ScontriDirettiUI = \{ imposta, apri, chiudi \}/);
    // l'errore di lettura non lascia la finestra vuota
    assert.match(ui, /try again/);
});

test('apri(): chi è collegato a sinistra e un altro a destra; chiunque si può scegliere nei due selettori', () => {
    const finestra = { ScontriDiretti: require('../docs/scontri-diretti.js'), addEventListener() {}, __nomeUtente: 'Didi' };
    const finto = { addEventListener() {}, activeElement: null, body: { appendChild() {} }, documentElement: { classList: { add() {}, remove() {} } }, createElement: () => ({ querySelector: () => null, addEventListener() {}, setAttribute() {} }) };
    new Function('window', 'document', ui)(finestra, finto);
    assert.deepEqual(Object.keys(finestra.ScontriDirettiUI).sort(), ['apri', 'chiudi', 'imposta']);
    // senza allenatori non succede niente (e non si rompe)
    finestra.ScontriDirettiUI.apri();
    // la scelta di chi sta a sinistra e a destra è del modulo puro
    const giocatori = [{ id: 'lukiani' }, { id: 'didi' }, { id: 'ilaria' }];
    assert.deepEqual(finestra.ScontriDiretti.coppiaIniziale('Didi', '', giocatori), { a: 'didi', b: 'lukiani' });
});

test('stile: la finestra e i colori dei due lati seguono il tema; nell\'app la finestra è a due colonne', () => {
    assert.match(css, /\.h2h-lato \{[^}]*background: var\(--c, #31c489\)/, 'ogni lato nel colore del suo allenatore');
    assert.match(css, /\.h2h-barra-a \{ background: var\(--ca/);
    assert.match(css, /html\.h2h-aperto, html\.h2h-aperto body \{ overflow: hidden; \}/, 'dietro la finestra la pagina non scorre');
    assert.match(css, /z-index: 5000/, 'sotto i menu a tendina del tema (100000)');
    assert.match(cssApp, /html\.app-shell \.h2h-contenuto \{[^}]*grid-template-columns: calc\(290 \* var\(--u\)\) minmax\(0, 1fr\)/, 'nell\'app due colonne: sintesi e dettagli');
    assert.doesNotMatch(css + cssApp, /tasto-scontro|trainer-azioni|at-scontro/, 'niente più tasti VS per riga o per scheda');
});

// ---------- l'app ----------
test('app: le schede dei trainer non hanno più il tasto del testa a testa (c\'è quello unico in basso a destra, come il Team builder); la palestra resta', () => {
    assert.equal(T.htmlScontro, undefined);
    const carta = T.htmlCarta({ id: 'lukiani', nome: 'Lukiani', palestra: true }, 0, { io: 'Didi' });
    assert.match(carta, /<a class="at-palestra"/);
    assert.doesNotMatch(carta, /at-scontro|data-scontro|Head to head/);
    assert.doesNotMatch(docs('app-trainers.js'), /ScontriDirettiUI/);
    assert.match(players, /<script src="scontri-diretti-ui\.js"><\/script>/, 'l\'app usa la stessa pagina: la finestra e il tasto ci sono');
    // nell'app i tasti d'azione di #tasti-alto sono tondi in basso a destra, solo icona: vale anche per questo
    assert.match(cssApp, /html\.app-shell body\.nb #tasti-alto > :not\(\.sfide-btn\) \{/);
});
