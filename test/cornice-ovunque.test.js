'use strict';
// La cornice comprata nello Shop (stile-card.css) dove c'è una card con l'avatar e il colore di un allenatore, o con un suo team: Match of the week (home e Hall of Fame),
// card delle stagioni (home e Hall of Fame), record della Hall of Fame, team in Stats, i due team di uno showdown, riepilogo di stagione. Mai nel Box e mai sui singoli Pokémon.
// Il disegno si prova a schermo; qui chi scrive l'attributo (sempre da un id controllato) e dove.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../docs/match-settimana.js');
const P = require('../docs/palmares.js');
const H = require('../docs/hall-of-fame.js');
const R = require('../docs/riepilogo-stagione.js');
const Statistiche = require('../docs/statistiche.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const docs = nome => leggi('docs', nome);
const conta = (testo, re) => (testo.match(re) || []).length;
const CATTIVO = 'card-oro" onclick="x';       // un valore scritto a mano nel database

// ---------------------------------------------------------------- Match of the week
const set = () => ({
    stagione: 's0', showdown: 'sd1', match: 'match1', set: 'set1', numeroSet: 1, numeroMatch: 1, categoria: 'OU', data: '2026-10-29', nomeStagione: 'S0', punteggioMatch: '2-1',
    vincitore: 'p1', giocatori: { p1: { id: 'ada', nome: 'Ada', team: 'Uno' }, p2: { id: 'bea', nome: 'Bea', team: 'Due' } },
    lati: { p1: { pokemon: [] }, p2: { pokemon: [] } }, protagonista: null, motivi: []
});

test('Match of the week: ogni lato porta la cornice del suo allenatore (chi ha perso compreso), solo se è un id fatto come si deve', () => {
    const h = M.html(set(), { giocatori: { ada: { colore: '#aa00cc', avatar: 'a.png', stileCard: 'card-fiamma' }, bea: { colore: '#00aa44', stileCard: 'card-bagliore-ciano' } } });
    assert.match(h, /<div class="ms-lato ms-l1 ms-vince" data-stile-card="card-fiamma" style="--c:#aa00cc"/);
    assert.match(h, /<div class="ms-lato ms-l2 ms-perde" data-stile-card="card-bagliore-ciano" style="--c:#00aa44"/);
    const senza = M.html(set(), { giocatori: { ada: { colore: '#aa00cc' }, bea: { colore: '#00aa44', stileCard: CATTIVO } } });
    assert.equal(conta(senza, /data-stile-card/g), 0, 'niente stile, o uno scritto a mano: niente attributo');
    assert.doesNotMatch(senza, /onclick/);
});

test('Match of the week: la home legge la cornice dei due allenatori con il resto della loro scheda e carica il foglio di stile', () => {
    const home = docs('index.html');
    assert.match(home, /<link rel="stylesheet" href="match-settimana\.css">\n<link rel="stylesheet" href="stile-card\.css">/, 'dopo i fogli della pagina');
    assert.match(home, /<script src="cosmetici\.js"><\/script>/);
    assert.match(home, /const stileCardValido = v => \(window\.Cosmetici \? Cosmetici\.valido\(v, 'card'\) : ''\);/);
    assert.match(home, /return \{ colore: info\.color \|\| '', avatar: info\.avatar \|\| '', stileCard: stileCardValido\(info\.stileCard\) \};/);
});

// ---------------------------------------------------------------- le card delle stagioni
test('home: la card di una stagione porta la cornice di chi vince o guida; a ogni giro riparte senza, e la rimette solo quando arriva la scheda di quell\'allenatore', () => {
    const home = docs('index.html');
    assert.match(home, /if \(card\) card\.removeAttribute\('data-stile-card'\);/, 'le card si riusano a ogni cambio del database');
    assert.match(home, /const cornice = stileCardValido\(pInfo\.stileCard\);\n\s*if \(card && cornice\) card\.setAttribute\('data-stile-card', cornice\);/);
    // l'attributo si toglie prima di tutto il resto della card (anche per quelle senza stagione)
    assert.ok(home.indexOf("card.removeAttribute('data-stile-card')") < home.indexOf("if (!item.key || !info) {"));
});

test('Hall of Fame, stagioni: la card ha la cornice di chi ha vinto (o di chi guida se è in corso), non di chi non c\'è', () => {
    const giocatori = { ada: { name: 'Ada', color: '#aa00cc', avatar: 'a.png', stileCard: 'card-oro' }, bea: { name: 'Bea', color: '#00aa44', avatar: 'b.png', stileCard: CATTIVO } };
    const voce = (o) => ({ stagione: 's1', tipo: 'league', nome: 'S1', data: '2026-10-01', vincitore: '', stato: 'closed', icona: 'x.png', ...o });
    const h = P.html([voce({ vincitore: 'Ada' }), voce({ stagione: 's2', vincitore: 'Bea' }), voce({ stagione: 's3', stato: 'playing', capo: 'ada' }), voce({ stagione: 's4', stato: 'playing', capo: '' })], giocatori);
    assert.match(h, /<a class="palm-card palm-league" data-stile-card="card-oro" href="matches\.html\?id=s1"/, 'il vincitore');
    assert.match(h, /<a class="palm-card palm-league palm-giocando" data-stile-card="card-oro" href="matches\.html\?id=s3"/, 'chi guida una stagione in corso');
    assert.equal(conta(h, /data-stile-card/g), 2, 'uno stile non valido o nessun leader: niente cornice');
    assert.doesNotMatch(h, /onclick/);
    const pagina = docs('palmares.js');
    assert.match(pagina, /avatar: p && p\.info && p\.info\.avatar, stileCard: stileCard\(p && p\.info && p\.info\.stileCard\)/, 'la pagina passa la cornice di ogni allenatore');
    assert.match(docs('palmares.html'), /<link rel="stylesheet" href="match-settimana\.css">\n<link rel="stylesheet" href="stile-card\.css">/);
});

// ---------------------------------------------------------------- Hall of Fame: record e Match of the week
const voce = (o) => ({ nome: 'X', sotto: '', valore: '1', specie: '', colore: '#fff', avatar: '', link: '', quando: '', ...o });

test('Hall of Fame, record: la cornice sulle righe degli allenatori e dei loro team, non su quelle dei Pokémon', () => {
    const lista = [
        { id: 'a', gruppo: 'Trainers', titolo: 'T', nota: '', voci: [voce({ nome: 'Ada', avatar: 'a.png', idGiocatore: 'ada' })] },
        { id: 'b', gruppo: 'Teams', titolo: 'U', nota: '', voci: [voce({ nome: 'Team Uno', sotto: 'Ada', idGiocatore: 'ada' })] },
        { id: 'c', gruppo: 'Pokémon', titolo: 'V', nota: '', voci: [voce({ nome: 'Garchomp', specie: 'Garchomp', sotto: 'Team Uno · Ada', idGiocatore: 'ada' })] }
    ];
    const h = H.htmlRecords(lista, { gif: s => `${s}.gif`, giocatori: { ada: { avatar: 'a.png', stileCard: 'card-circuito' } } });
    assert.equal(conta(h, /<li class="hof-voce hof-primo" data-stile-card="card-circuito"/g), 2, 'allenatore e team');
    assert.equal(conta(h, /<li class="hof-voce hof-primo"/g), 3);
    assert.match(h, /<li class="hof-voce hof-primo" style="--c:#fff"><span class="hof-pos">1<\/span><span class="ms-med" data-pkm="Garchomp"/, 'la riga del Pokémon resta com\'era');
    // un valore scritto a mano nel database non arriva nella pagina; senza idGiocatore (dati vecchi) si cerca per nome
    assert.doesNotMatch(H.htmlRecords(lista, { giocatori: { ada: { stileCard: CATTIVO } } }), /data-stile-card/);
    assert.equal(conta(H.htmlRecords([lista[0]], { giocatori: { ada: { stileCard: 'card-oro' } } }).replace(/idGiocatore/g, ''), /data-stile-card="card-oro"/g), 1);
    const vecchio = [{ id: 'a', gruppo: 'Trainers', titolo: 'T', voci: [{ ...voce({ nome: 'Ada' }) }] }];
    assert.match(H.htmlRecords(vecchio, { giocatori: { ada: { stileCard: 'card-oro' } } }), /<li class="hof-voce hof-primo" data-stile-card="card-oro"/);
});

test('Hall of Fame, record dai dati veri: ogni voce dice di chi è la scheda (idGiocatore): l\'allenatore, o il proprietario del team e del Pokémon', () => {
    const r = H.records({
        players: [{ id: 'didi', nome: 'Didi', colore: '#111', avatar: '', serie: { vittorieMax: 3 }, match: { giocati: 0, vinti: 0, persi: 0 } }],
        teams: [{ nome: 'Alfa', player: 'didi', playerNome: 'Didi', serie: { vittorieMax: 4 }, match: { giocati: 0, vinti: 0, persi: 0 } }],
        pokemon: [{ specie: 'Garchomp', team: 'Alfa', player: 'didi', playerNome: 'Didi', koFatti: 4, serie: { vittorieMax: 1 } }]
    });
    assert.equal(r.find(x => x.id === 'serie-allenatore').voci[0].idGiocatore, 'didi');
    assert.equal(r.find(x => x.id === 'serie-team').voci[0].idGiocatore, 'didi');
    assert.equal(r.find(x => x.id === 'ko').voci[0].idGiocatore, 'didi');
});

test('Hall of Fame, Match of the week: l\'archivio passa la cornice di ogni allenatore al banner della home', () => {
    let visto = null;
    const finto = { html: (sc, o) => { visto = o.giocatori; return '<banner>'; } };
    H.htmlSettimane([{ titolo: 'T', intervallo: 'I', scelto: { stagione: 's1' } }], { MatchSettimana: finto, giocatori: { ada: { color: '#fff', avatar: 'a.png', stileCard: 'card-oro' }, bea: { color: '#000', stileCard: CATTIVO } } });
    assert.deepEqual(visto, { ada: { colore: '#fff', avatar: 'a.png', stileCard: 'card-oro' }, bea: { colore: '#000', avatar: '', stileCard: '' } });
});

// ---------------------------------------------------------------- Stats: i team
test('Stats: ogni team porta la cornice del suo allenatore (anche per l\'app); i Pokémon no', () => {
    const m = (p1, p2, a, b, data) => ({ player1: p1, player1Id: p1, player2: p2, player2Id: p2, winnerId: a > b ? p1 : p2, team1: 'A', team2: 'B', p1score: a, p2score: b, p1points: a, p2points: b, data, categoria: 'VGC', p1EloAtMatch: 1000, p2EloAtMatch: 1000, p1DeltaElo: 16, p2DeltaElo: -16 });
    const dati = { players: { didi: { info: { name: 'Didi', stileCard: 'card-oro' } }, lu: { info: { name: 'Lu' } } }, seasons: { s1: { info: { name: 'S1', status: 'closed' }, showdowns: { sd1: { info: { categoria: 'VGC', data: '2026-03-01' }, matches: { m1: m('didi', 'lu', 2, 0, '2026-03-01') } } } } } };
    const r = Statistiche.calcola(dati, { stagione: 'all', senzaSquadre: true });
    const di = id => r.teams.filter(t => t.player === id);
    assert.ok(di('didi').length && di('lu').length);
    assert.ok(di('didi').every(t => t.stileCard === 'card-oro'), 'i team di Didi');
    assert.ok(di('lu').every(t => t.stileCard === ''), 'chi non ha una cornice non ne ha');
    assert.ok(r.players.find(p => p.id === 'didi').stileCard === 'card-oro', 'gli allenatori, come prima');
    assert.ok(r.pokemon.every(x => !('stileCard' in x)), 'i singoli Pokémon non portano la cornice');
    const stats = docs('stats.js');
    assert.match(stats, /\(tab === 'players' \|\| tab === 'teams'\)/);
    assert.match(stats, /<article class="carta carta-\$\{tab\}" role="button" tabindex="0" data-chiave="\$\{esc\(chiave\)\}"\$\{stile \? ` data-stile-card="\$\{stile\}"` : ''\}/, 'le card di Stats: .carta-teams è uno degli elementi con cornice');
});

// ---------------------------------------------------------------- i due team di uno showdown
test('dettaglio di uno showdown: i due team hanno la cornice dei loro allenatori (due letture minuscole, come i colori), anche quando il team non c\'è', () => {
    const matches = docs('matches.html');
    assert.match(matches, /async function getPlayersStili\(p1, p2\) \{\s*if \(document\.documentElement\.classList\.contains\('app-shell'\)\) return \{ s1: '', s2: '' \};\s*const leggi = nome => db\.ref\(`players\/\$\{String\(nome \|\| ''\)\.toLowerCase\(\)\.trim\(\)\}\/info\/stileCard`\)\.once\('value'\)\s*\.then\(x => \(window\.Cosmetici \? Cosmetici\.valido\(x\.val\(\), 'card'\) : ''\)\)\.catch\(\(\) => ''\);/);
    assert.match(matches, /const \[colors, stili\] = await Promise\.all\(\[getPlayersColors\(info\.player1, info\.player2\), getPlayersStili\(info\.player1, info\.player2\)\]\);/);
    assert.match(matches, /stile: stili\.s1/);
    assert.match(matches, /stile: stili\.s2/);
    const finestra = matches.slice(matches.indexOf('const blocco = (lato, giocatore, team, escaped, colore, vince, perde, stile) =>'));
    assert.equal(conta(finestra.slice(0, 1400), /data-stile-card="\$\{stile\}"/g), 2, 'il team con il suo pulsante e il match senza team (Random)');
    assert.match(finestra, /\$\{blocco\(1, info\.player1, m\.team1, team1Escaped, p1\.base, vince1, vince2, vince1 \? p1\.stile : ''\)\}/);
    assert.match(finestra, /\$\{blocco\(2, info\.player2, m\.team2, team2Escaped, p2\.base, vince2, vince1, vince2 \? p2\.stile : ''\)\}/);
});

// ---------------------------------------------------------------- riepilogo di stagione
const riepilogo = (stile) => {
    const persona = (id, nome, stileCard) => ({ id, nome, colore: '#aa00cc', avatar: 'a.png', stileCard });
    const ada = { ...persona('ada', 'Ada', stile), posizione: 1, punti: 30, vinti: 9, persi: 1, sdVinti: 3, sdPersi: 0 };
    const bea = { ...persona('bea', 'Bea', ''), posizione: 2, punti: 20, vinti: 5, persi: 5, sdVinti: 1, sdPersi: 2 };
    return {
        id: 's1', nome: 'S1', formati: [], dal: '', al: '', numeri: { showdown: 1, match: 2, set: 3, ko: 4, giocatori: 2 }, provvisorio: false, trofeo: null,
        vincitore: { ...ada, stat: { elo: 1100, percMatch: 90, set: { vinti: 5, persi: 1 }, ko: { fatti: 4, subiti: 2 }, serie: 3 } }, classifica: [ada, bea], mvp: null, mvpInCorso: false, squadra: [], piuUsati: [],
        premi: [{ id: 'x', icona: '⚡', immagine: null, titolo: 'Premio', descrizione: 'd', vincitori: [persona('ada', 'Ada', stile)], valore: 1, testoValore: '1' }]
    };
};

test('riepilogo di stagione: il campione, le righe della classifica e i premi portano la cornice di chi li ha (solo sul sito, e solo con un id fatto come si deve)', () => {
    assert.equal(conta(R.html(riepilogo('card-stelle')), /data-stile-card/g), 0, 'di base niente: l\'app e l\'immagine da condividere hanno il loro aspetto');
    const h = R.html(riepilogo('card-stelle'), { cornici: true });
    assert.match(h, /<section class="rs-b rs-campione rs-s12" data-stile-card="card-stelle" style="--c:#aa00cc">/);
    assert.match(h, /<a class="cl-riga cl-primo" data-stile-card="card-stelle" href="/);
    assert.match(h, /<article class="rs-premio" data-stile-card="card-stelle" style="--c:#aa00cc">/);
    assert.equal(conta(h, /data-stile-card/g), 3, 'Bea non ne ha una: la sua riga resta com\'era');
    assert.equal(conta(R.html(riepilogo(CATTIVO), { cornici: true }), /data-stile-card/g), 0);
    const modulo = docs('riepilogo-stagione.js');
    assert.match(modulo, /corpo\.innerHTML = html\(riep, \{ gif, cornici: !doc\.documentElement\.classList\.contains\('app-shell'\) \}\);/, 'nell\'app niente cornici');
    // i dati: la classifica e i premi portano la cornice dell'allenatore
    assert.match(modulo, /avatar: p\.avatar \|\| '', stileCard: p\.stileCard \|\| '', punti:/);
    assert.match(modulo, /function persona\(x\) \{ return \{ id: x\.id, nome: x\.nome \|\| x\.id, colore: x\.colore \|\| '', avatar: x\.avatar \|\| '', stileCard: x\.stileCard \|\| '' \}; \}/);
});

// ---------------------------------------------------------------- il foglio di stile
test('stile-card.css: le card che hanno già ::before (la linguetta dello stato) non ricevono la decorazione; chi ha perso un Match of the week resta con la cornice accesa; le card non si toccano', () => {
    const css = docs('stile-card.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const tutte = css.match(/:root :is\(([^)]*)\)\[data-stile-card\]::after \{/)[1].split(',').map(x => x.trim());
    const deco = css.match(/:root :is\(([^)]*)\)\[data-stile-card\]::before \{/)[1].split(',').map(x => x.trim());
    assert.deepEqual(tutte.filter(x => !deco.includes(x)), ['.season-card', '.palm-card'], 'la linguetta FINISHED / LIVE NOW sta in ::before');
    assert.ok(docs('nb-pagine.css').includes('body.pg-index .season-card::before') && docs('style-palmares.css').includes('.palm-card::before'), 'è davvero così');
    for (const c of ['.ms-lato', '.sd-team', '.sd-lato', '.hof-voce', '.carta-teams', '.rs-campione', '.rs-premio']) assert.ok(deco.includes(c) && tutte.includes(c), c);
    // la riga dei record e il premio non hanno una posizione loro: gli strati ci si ancorano
    assert.match(css, /:root :is\(\.hof-voce, \.rs-premio\)\[data-stile-card\] \{ position: relative; \}/);
    // chi ha perso è grigio: con la cornice si spegne il contenuto, non la card
    assert.match(css, /:root \.ms-perde\[data-stile-card\] \{ filter: none; \}\s*:root \.ms-perde\[data-stile-card\] > \* \{ filter: grayscale\(0\.8\); \}/);
    assert.match(docs('match-settimana.css'), /\.ms-perde \{[^}]*filter: grayscale\(\.8\);/, 'e senza cornice è come prima');
    // più spazio tra le card con la cornice, che sporge dal bordo
    assert.match(css, /:root \.hof-record ol:has\(> \[data-stile-card\]\) \{ gap: 18px; \}/);
    assert.match(css, /:root \.ms-scontro:has\(> \[data-stile-card\]\) \{ gap: 18px; \}/);
    assert.match(css, /:root \.rs-righe:has\(> \[data-stile-card\]\) \{ gap: calc\(18 \* var\(--rs-u, 1\)\); \}/);
});

test('mai nel Box e mai sulle card dei singoli Pokémon: né il Box né le card dei Pokémon portano l\'attributo', () => {
    for (const f of ['box.html', 'box-team.css', 'box-vista.css']) assert.doesNotMatch(docs(f), /data-stile-card/, f);
    const css = docs('stile-card.css');
    for (const c of ['.carta-pokemon', '.carta-usage', '.hof-membro', '.rs-fcard', '.rs-mvp']) assert.ok(!css.replace(/\/\*[\s\S]*?\*\//g, '').includes(c), `${c} non è tra le card con cornice`);
});

test('showdown: la cornice la porta solo chi vince (il team vincitore di ogni match nella finestra, il lato vincitore nella card della lista)', () => {
    const m = docs('matches.html');
    assert.match(m, /vince1, vince2, vince1 \? p1\.stile : ''\)\}/);
    assert.match(m, /vince2, vince1, vince2 \? p2\.stile : ''\)\}/);
    assert.match(m, /const corniceVince = chiVince \? corniceDi\(chiVince === 1 \? p1Name : p2Name\) : '';/);
    assert.match(m, /<div class="sd-lato sd-lato-1"\$\{attrCornice\(1\)\} title=/);
    assert.match(m, /<div class="sd-lato sd-lato-2"\$\{attrCornice\(2\)\} title=/);
    assert.match(m, /const attrCornice = k => \(chiVince === k && corniceVince/);
});
