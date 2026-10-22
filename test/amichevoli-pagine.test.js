'use strict';
// Le partite amichevoli e il formato Random nelle pagine del sito: i pezzi sono collegati tra loro.
//   - la finestra di sfida (amichevoli.js) offre serie da 1, 3, 5, 7 e team fissi o cambiabili, e li manda al server;
//   - battle.html (battle-ui.js) gioca la partita: lobby, scelta del team tra un set e l'altro ("tra_set"), carta finale con
//     "Play again?" (rivincita) e il Random senza team nelle stagioni ufficiali;
//   - admin, hub, profilo e matches accettano un formato Random come categoria di una stagione (nessun team da iscrivere).
// Non guarda come vengono le pagine (per quello serve un browser): controlla che il codice giusto ci sia e che i nomi coincidano.
// I server (functions/partita.js) si provano in amichevoli-server.test.js.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leggi = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');
const funzioni = nome => fs.readFileSync(path.join(__dirname, '..', 'functions', nome), 'utf8');

// Il testo di una funzione (da "function nome(" alla sua graffa di chiusura a inizio riga)
function corpo(sorgente, nome) {
    const i = sorgente.search(new RegExp(`(?:async )?function ${nome}\\(`));
    assert.ok(i >= 0, `function ${nome} non trovata`);
    const fine = sorgente.indexOf('\n}\n', i);
    return sorgente.slice(i, fine < 0 ? undefined : fine + 2);
}

// ---------- il server esposto ----------
test('index.js espone le funzioni delle amichevoli, e partita.js conosce lo stato "tra_set" e la rivincita', () => {
    const indice = funzioni('index.js');
    assert.match(indice, /exports\.sfidaAmichevole = richiamabile\('sfidaAmichevole'\)/);
    assert.match(indice, /exports\.rispondiAmichevole = richiamabile\('rispondiAmichevole'\)/);
    const partita = funzioni('partita.js');
    assert.match(partita, /'tra_set'/);
    assert.match(partita, /SERIE_AMMESSE = \[1, 3, 5, 7\]/);
    assert.match(partita, /rivincitaDi/);
});

// ---------- la finestra di sfida ----------
test('amichevoli.js: serie da 1, 3, 5, 7; team fissi o cambiabili solo in una serie e mai nei Random; mandati al server', () => {
    const src = leggi('amichevoli.js');
    for (const n of [1, 3, 5, 7]) assert.match(src, new RegExp(`valore: ${n}, testo: '(?:One battle|Best of ${n})'`), `serie ${n}`);
    assert.match(src, /scelte\('Teams'/);
    assert.match(src, /'Change after each battle'/);
    assert.match(src, /opzioniSquadre\.hidden = serie === 1/, 'con una partita sola non c\'è nulla da scegliere');
    assert.match(src, /new random teams in every battle/, 'nei Random lo si dice');
    assert.match(src, /cambioTeam: serie > 1 && !scelta\.random && cambioTeam/);
    assert.match(src, /bestOf: serie/);
    assert.match(src, /chiama\('sfidaAmichevole'/);
});

test('sfide.js: la campanella descrive la serie e le rivincite', () => {
    const src = leggi('sfide.js');
    const d = corpo(src, 'descrizioneAmichevole');
    assert.match(d, /best of \$\{s\.bestOf\}/);
    assert.match(d, /teams can change/);
    assert.match(src, /wants to play again/, 'una rivincita offerta ha il suo testo');
});

// ---------- la pagina di battaglia ----------
test('battle-ui.js: lo stato "tra_set" riporta alla scelta del team, a campo fermo, senza spoiler sull\'ultimo turno', () => {
    const src = leggi('battle-ui.js');
    const fase = corpo(src, 'aggiornaFase');
    assert.match(fase, /s === 'tra_set'/);
    assert.match(fase, /if \(s !== 'tra_set'\) nascondiLobby\(\)/, 'la lobby tra i set non va nascosta');
    assert.match(fase, /quandoScenaFerma\(ridisegnaLobby\)/);
    const lobby = corpo(src, 'ridisegnaLobby');
    assert.match(lobby, /online\.stato === 'tra_set' && !animazioneInCorso\(\)/);
    // i pannelli dicono di scegliere il team solo a campo fermo (prima c'è il tasto per saltare l'animazione)
    const pannello = corpo(src, 'disegnaPannello');
    assert.ok(pannello.indexOf('animazioneInCorso()') < pannello.indexOf("online.stato === 'tra_set'"), 'prima l\'animazione');
    // chi ascolta i "pronti" ridisegna la lobby giusta
    assert.equal((src.match(/battaglia\.on\('pronti', p => \{ online\.pronti = p; ridisegnaLobby\(\); aggiornaStati\(\); \}\)/g) || []).length, 2, 'match ufficiale e amichevole');
});

test('battle-ui.js: in una serie con team cambiabili il set nuovo parte subito e le colonne dei player ripartono da capo', () => {
    const src = leggi('battle-ui.js');
    const nuovo = corpo(src, 'nuovoSet');
    assert.match(nuovo, /online\.info\.cambioTeam \? avviaProssimaScena : avviaPausaSet/);
    const rinnova = corpo(src, 'rinnovaSquadre');
    assert.match(rinnova, /squadraRandomDaRichiesta\(online\.richiestaRandom\)/);
    assert.match(rinnova, /online\.info\.cambioTeam/);
    assert.match(rinnova, /schedeOnline\(\)/);
    assert.match(corpo(src, 'avviaProssimaScena'), /rinnovaSquadre\(\)/);
});

test('battle-ui.js: il Random (anche nelle stagioni) non chiede team: basta "Ready", e la squadra si legge dalla richiesta', () => {
    const src = leggi('battle-ui.js');
    // lobby del match ufficiale
    const ufficiale = corpo(src, 'disegnaLobby');
    assert.match(ufficiale, /if \(online\.info\.random\)/);
    assert.match(ufficiale, /mandaPronto\(\{ pronto: !online\.pronti\[mioLato\] \}\)/);
    // la richiesta del Random vale per ogni partita online, non solo per le amichevoli
    assert.match(src, /if \(online && online\.info\.random && mioLato && lato === mioLato && richiesta\.side\)/);
    assert.ok(!/online && online\.amichevole && online\.info\.random && mioLato/.test(src), 'niente più solo amichevoli');
    // un solo modo di dire "pronto"
    const pronto = corpo(src, 'mandaPronto');
    assert.match(pronto, /httpsCallable\('prontoPartita'\)\(\{ id: online\.id, \.\.\.parametri \}\)/);
    assert.match(corpo(src, 'disegnaLobbyAmichevole'), /mandaPronto\(\{ team: pronto \? null : scelto\.nome \}\)/);
});

test('battle-ui.js: la lobby delle amichevoli dice la serie, i team fissi o cambiabili e, tra i set, il punteggio', () => {
    const lobby = corpo(leggi('battle-ui.js'), 'disegnaLobbyAmichevole');
    assert.match(lobby, /Best of \$\{info\.bestOf\}/);
    assert.match(lobby, /You can change team after every battle/);
    assert.match(lobby, /You keep it for the whole match/);
    assert.match(lobby, /Set \$\{prossimo\}: pick your team/);
    assert.match(lobby, /leads/);
    assert.match(lobby, /if \(traSet\) nascondiEsito\(\)/, 'il cartello del set lascia il posto alla scelta del team');
});

test('battle-ui.js: a fine amichevole (anche di una serie) si offre la rivincita, che è una sfida nuova con { rivincita }', () => {
    const src = leggi('battle-ui.js');
    const fine = corpo(src, 'mostraEsitoAmichevole');
    assert.match(fine, /\.\.\.rivincitaUi\(\)/);
    assert.match(fine, /Back to Trainers/);
    const ui = corpo(src, 'rivincitaUi');
    assert.match(ui, /if \(!mioLato\) return \[\]/, 'chi guarda non offre nulla');
    for (const testo of ['Play again?', 'Play again', 'Accept', 'No thanks', 'Withdraw', 'Fixed', 'Change after each battle', 'One battle']) {
        assert.ok(ui.includes(testo), `${testo} manca`);
    }
    assert.match(src, /SERIE_RIVINCITA = \[1, 3, 5, 7\]/);
    assert.match(corpo(src, 'offriRivincita'), /httpsCallable\('sfidaAmichevole'\)\(\{\s*rivincita: online\.info\.sfida, bestOf: f\.serie/);
    assert.match(corpo(src, 'rispondiRivincita'), /httpsCallable\('rispondiAmichevole'\)\(\{ id: r\.sfida, risposta \}\)/);
    assert.match(corpo(src, 'offriRivincita'), /r\.accettata\) return vaiAllaPartita\(r\.id\)/, 'se anche l\'altro la voleva, si parte');
    assert.match(corpo(src, 'vaiAllaPartita'), /battle\.html\?amichevole=\$\{encodeURIComponent\(idSfida\)\}/);
    // sui telefoni il cartello sul palco è troppo basso: la rivincita sta anche (e lì solo) nel pannello sotto lo schermo
    assert.match(corpo(src, 'disegnaPannello'), /online\.amichevole && online\.stato === 'conclusa' && lato === mioLato\) return corpo\.append\(\.\.\.rivincitaUi\(\)\)/);
    assert.match(fine, /ridisegnaComandi\(\)/);
    const stile = leggi('style-battle.css');
    assert.match(stile, /\.pannello \.rivincita \{ display: none; margin: 10px; \}/);
    assert.match(stile, /@media \(max-width: 699px\) \{[\s\S]*?\.pannello \.rivincita \{ display: grid; \}\s*\.esito-card \.rivincita \{ display: none; \}/);
    // quando l'altro risponde, la pagina lo sa: l'offerta accettata porta alla partita nuova
    assert.match(src, /battaglia\.on\('rivincita', r => \{[\s\S]*?r\.stato === 'accettata'[\s\S]*?vaiAllaPartita\(r\.sfida\)/);
});

test('battle-ui.js: il cartello finale batte quello del set, in qualunque ordine arrivino gli eventi, e il punteggio si aggiorna', () => {
    const src = leggi('battle-ui.js');
    assert.match(src, /if \(online\.amichevole && online\.stato === 'conclusa'\) mostraEsitoAmichevole\(\);\s*else if \(online\.stato === 'tra_set'\) ridisegnaLobby\(\);\s*else if \(!pausaSet\) mostraFineSet\(\);/);
    assert.match(src, /battaglia\.on\('risultati', r => \{[\s\S]*?if \(online\.stato === 'conclusa'\) quandoScenaFerma\(mostraEsitoAmichevole\);\s*else if \(online\.stato === 'tra_set'\) ridisegnaLobby\(\);/);
});

test('motore-online.js: ascolta la rivincita offerta sulla partita', () => {
    const src = leggi('motore-online.js');
    assert.match(src, /\$\{base\}\/rivincita/);
    assert.match(src, /_emetti\('rivincita'/);
});

test('style-battle.css: il blocco della rivincita e il cartello che scorre invece di tagliarsi', () => {
    const css = leggi('style-battle.css');
    for (const selettore of ['.esito-card .rivincita', '.rivincita-gruppo', '.rivincita-nome', '.rivincita-scelta', '.rivincita-scelta.scelta', '.rivincita-azioni']) {
        assert.ok(css.includes(selettore), `${selettore} manca`);
    }
    assert.match(css, /\.esito \{[^}]*overflow-y: auto/);
    // niente colori fuori dal sistema di variabili: i temi cambiano solo variabili
    const blocco = css.slice(css.indexOf('/* Fine di una partita amichevole'), css.indexOf('/* ---------- Cronaca'));
    assert.ok(!/#[0-9a-f]{3,6}\b/i.test(blocco), 'colori fissi nel blocco della rivincita');
});

// ---------- Random nelle stagioni ----------
test('admin.html: un formato Random si può scegliere come categoria di una stagione', () => {
    const src = leggi('admin.html');
    assert.match(src, /\(Random\)/);
    assert.ok(!/non ha team da iscrivere: si gioca nelle sfide amichevoli e contro la CPU, non nelle stagioni/.test(src), 'l\'esclusione dalle stagioni non c\'è più');
    assert.match(src, /<script src="formato-random\.js"><\/script>/);
});

test('hub.html: nel formato Random non c\'è nessun team da scegliere (bottone "RANDOM" già a posto)', () => {
    const src = leggi('hub.html');
    assert.match(src, /const eRandom = !!datiFormato && String\(datiFormato\.strutturaSito/);
    assert.match(src, /counterHTML = eRandom \? 'RANDOM'/);
    assert.match(src, /if \(eRandom\) \{\s*btn\.title = /);
    assert.match(src, /btn\.onclick = \(\) => openTeamPicker\(format, nomeUtenteClean\)/, 'gli altri formati aprono ancora la scelta dei team');
    assert.match(leggi('style-hub.css'), /\.btn-team\.btn-random \{ cursor: help; \}/);
});

test('profile.html: i formati Random non compaiono tra i team ancora da iscrivere', () => {
    const src = leggi('profile.html');
    assert.match(src, /formatiSenzaTeam: stato\.formatiSenzaTeam/);
    assert.match(src, /strutturaSito \|\| ''\)\.toLowerCase\(\)\.trim\(\) === 'random'/);
    assert.equal((src.match(/PP\.daFare\(playerID, stato\.stagioni, stato\.sfide, \{ formatiSenzaTeam: stato\.formatiSenzaTeam \}\)/g) || []).length, 2);
});

test('matches.html: un match senza team (Random) ha la sua scheda e si può registrare a mano senza team', () => {
    const src = leggi('matches.html');
    assert.match(src, /sd-senza-team/);
    assert.match(src, /Random teams/);
    assert.match(src, /const senzaTeam = document\.getElementById\('match-team1'\)\.dataset\.random === '1'/);
    assert.match(src, /if \(!nomeTeam\) return;\s*\/\/ nei Random non c'è un team a cui appartengono i badge/);
    assert.match(leggi('showdown.css'), /\.sd-senza-team/);
});

test('Trainers: il tasto della sfida amichevole sta accanto alla card (non dentro) e la pagina pubblica non lo ha', () => {
    const players = leggi('players.html');
    const riga = players.slice(players.indexOf('class="trainer-riga"'));
    const finecard = riga.indexOf('</a>');
    const tasto = riga.indexOf('Amichevoli.htmlTasto');
    assert.ok(finecard > 0 && tasto > finecard, 'il tasto viene dopo la chiusura del collegamento della card');
    assert.match(leggi('amichevoli.js'), /<button type="button" class="tasto-amichevole"/, 'è un vero pulsante, non più dentro un collegamento');
    assert.match(leggi('style-players.css'), /\.trainer-riga \.tasto-amichevole\[hidden\][^}]*visibility: hidden/, 'il proprio tasto lascia il posto');
    assert.match(leggi('nb-pagine.css'), /\.trainer-riga:nth-child\(1\) \.trainer-rank-text/, 'il podio segue le righe');
    for (const f of ['public.html', 'public-card.js', 'style-public-card.css']) {
        assert.doesNotMatch(leggi(f), /amichevol|Amichevoli|FRIENDLY MATCH/i, `${f}: niente tasto amichevole nella pagina pubblica`);
    }
});
