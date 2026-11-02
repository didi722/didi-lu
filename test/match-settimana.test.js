'use strict';
// Il match della settimana (docs/match-settimana.js): quale set sceglie, la finestra di sette giorni, il blocco della home e i collegamenti in index.html e matches.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../docs/match-settimana.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

// ---------- dati finti ----------
const pk = (specie, o = {}) => ({ specie, nome: '', portato: true, sceso: true, titolare: false, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o });
const lato = (nome, pokemon) => ({ nome, pokemon, portati: pokemon.filter(p => p.portato).length, svenuti: pokemon.filter(p => p.svenuto).length, azioni: {} });

/** Una passeggiata: vince p1 senza perdere nessuno, in 5 turni */
const passeggiata = () => ({
    v: 3, turni: 5, vincitore: 'p1',
    p1: lato('Ada', [pk('A1', { koFatti: 2 }), pk('A2', { koFatti: 2 }), pk('A3'), pk('A4')]),
    p2: lato('Bea', [pk('B1', { svenuto: true, turnoKo: 2 }), pk('B2', { svenuto: true, turnoKo: 3 }), pk('B3', { svenuto: true, turnoKo: 4 }), pk('B4', { svenuto: true, turnoKo: 5 })])
});
/** Una rimonta: p1 resta sotto 1 contro 4, poi il suo ultimo Pokémon manda KO tutti e quattro (16 turni) */
const rimonta = () => ({
    v: 3, turni: 16, vincitore: 'p1',
    p1: lato('Ada', [pk('A1', { svenuto: true, turnoKo: 3 }), pk('A2', { svenuto: true, turnoKo: 4 }), pk('A3', { svenuto: true, turnoKo: 5 }), pk('Ultimo', { ultimo: true, koFatti: 4 })]),
    p2: lato('Bea', [pk('B1', { svenuto: true, turnoKo: 9 }), pk('B2', { svenuto: true, turnoKo: 11 }), pk('B3', { svenuto: true, turnoKo: 13 }), pk('B4', { svenuto: true, turnoKo: 16 })])
});

const match = (data, setStats, o = {}) => ({
    categoria: 'OU', data, p1score: 2, p2score: 1, player1: 'Ada', player1Id: 'ada', player2: 'Bea', player2Id: 'bea', team1: 'Team Uno', team2: 'Team Due',
    p1EloAtMatch: 1000, p2EloAtMatch: 1000, setStats,
    replays: Object.fromEntries(Object.keys(setStats).map(k => [k, { url: `https://x.test/${k}.html`, vincitore: '1' }])), ...o
});
const stagioni = (matches, id = 's0') => ({ [id]: { info: { name: 'Stagione' }, showdowns: { sd1: { info: { data: '2026-10-20' }, matches } } } });
const OGGI = Date.UTC(2026, 9, 30, 12);

// ---------- il punteggio ----------
test('analizzaSet: una rimonta vinta con un solo Pokémon vale molto più di una passeggiata', () => {
    const bello = M.analizzaSet(rimonta());
    const brutto = M.analizzaSet(passeggiata());
    assert.ok(bello.punteggio > brutto.punteggio + 80, `${bello.punteggio} contro ${brutto.punteggio}`);
    assert.equal(bello.rimasti, 1);
    assert.equal(bello.maxSvantaggio, 3, 'è arrivato a essere sotto di 3 Pokémon (1 contro 4)');
    assert.equal(brutto.rimasti, 4);
    assert.equal(brutto.maxSvantaggio, 0);
    assert.deepEqual(bello.motivi, ['Came back from 3 down', 'Won with 1 Pokémon left', 'Ultimo took 4 KOs']);
    assert.deepEqual(brutto.motivi, []);
    assert.equal(bello.protagonista.specie, 'Ultimo');
    assert.equal(bello.protagonista.ultimo, true);
    assert.equal(brutto.protagonista.specie, 'A1', 'senza ultimo in piedi: chi ha fatto più KO');
});

test('analizzaSet: i KO nello stesso turno contano insieme; più di una sorpresa di Elo e un match stretto fanno salire il punteggio', () => {
    const base = M.analizzaSet(rimonta()).punteggio;
    const sorpresa = M.analizzaSet(rimonta(), { scartoElo: 120 });
    assert.equal(sorpresa.punteggio, Math.round((base + 12) * 10) / 10, 'un punto ogni 8 di scarto, al massimo 12');
    assert.equal(M.analizzaSet(rimonta(), { matchStretto: true }).punteggio, Math.round((base + 6) * 10) / 10);
    assert.ok(M.analizzaSet(rimonta(), { scartoElo: -50 }).punteggio === base, 'se ha vinto chi aveva più Elo non conta');
    // due Pokémon di p1 vanno KO nello stesso turno: sotto di 2, non di 1 e poi di 2
    const doppio = rimonta();
    doppio.p1.pokemon[0].turnoKo = 3; doppio.p1.pokemon[1].turnoKo = 3; doppio.p1.pokemon[2].turnoKo = 3;
    assert.equal(M.analizzaSet(doppio).maxSvantaggio, 3);
});

test('analizzaSet: un log incompleto non si può valutare', () => {
    assert.equal(M.analizzaSet(null), null);
    assert.equal(M.analizzaSet({ ...rimonta(), vincitore: '' }), null);
    const senzaPortati = rimonta(); senzaPortati.p2.portati = 0;
    assert.equal(M.analizzaSet(senzaPortati), null);
});

test('analizzaSet: se cadono tutti i Pokémon di entrambi vince chi cade per ultimo (nessun Pokémon rimasto): ancora più bello', () => {
    const ultimoKo = rimonta();
    ultimoKo.p1.pokemon[3] = pk('Ultimo', { ultimo: true, koFatti: 4, svenuto: true, turnoKo: 17 });
    ultimoKo.p1.svenuti = 4;
    const r = M.analizzaSet(ultimoKo);
    assert.equal(r.rimasti, 0);
    assert.ok(r.motivi.includes('Decided by the very last KO'));
    assert.ok(r.punteggio > M.analizzaSet(rimonta()).punteggio - 1);
});

// ---------- la scelta ----------
test('scegli: il set più bello degli ultimi 7 giorni; quelli più vecchi non contano', () => {
    const seasons = stagioni({
        match1: match('2026-10-29', { set1: passeggiata(), set2: rimonta() }),
        match2: match('2026-10-10', { set1: rimonta() })
    });
    const s = M.scegli(seasons, { adesso: OGGI });
    assert.equal(s.match, 'match1');
    assert.equal(s.set, 'set2');
    assert.equal(s.corrente, true);
    assert.equal(s.quanti, 2, 'in gara solo i due set di questa settimana');
    assert.equal(s.numeroSet, 2);
    assert.equal(s.stagione, 's0');
    assert.equal(s.giocatori.p1.id, 'ada');
    assert.equal(s.giocatori.p2.team, 'Team Due');
    assert.match(s.replayUrl, /set2\.html$/);
});

test('scegli: senza partite negli ultimi 7 giorni (tra una stagione e l\'altra) si prende la settimana dell\'ultima partita', () => {
    const seasons = stagioni({
        match1: match('2026-10-03', { set1: rimonta() }),          // la migliore, ma di una settimana prima
        match2: match('2026-10-12', { set1: passeggiata(), set2: M.analizzaSet && passeggiata() })
    });
    const s = M.scegli(seasons, { adesso: Date.UTC(2026, 10, 20, 12) });
    assert.equal(s.corrente, false);
    assert.equal(s.match, 'match2', 'la settimana dell\'ultima partita (12/10) non comprende il 3/10');
    assert.equal(s.quanti, 2);
});

test('scegli: salta la stagione beta, i set senza replay e quelli senza dati leggibili; senza niente da mostrare restituisce null', () => {
    assert.equal(M.scegli(null), null);
    assert.equal(M.scegli({}), null);
    assert.equal(M.scegli(stagioni({ match1: match('2026-10-29', { set1: rimonta() }) }, 'sbeta'), { adesso: OGGI }), null, 'la beta è di prova');
    const senzaReplay = match('2026-10-29', { set1: rimonta() }); senzaReplay.replays = { set1: { vincitore: '1' } };
    assert.equal(M.scegli(stagioni({ match1: senzaReplay }), { adesso: OGGI }), null, 'senza replay non c\'è niente da guardare');
    const rotto = match('2026-10-29', { set1: { ...rimonta(), vincitore: '' } });
    assert.equal(M.scegli(stagioni({ match1: rotto }), { adesso: OGGI }), null);
    const nonSalvato = match('2026-10-29', { set1: rimonta() }); nonSalvato.p1score = null;
    assert.equal(M.scegli(stagioni({ match1: nonSalvato }), { adesso: OGGI }), null, 'match non ancora salvato');
    const futuro = match('2027-01-01', { set1: rimonta() });
    assert.equal(M.scegli(stagioni({ match1: futuro }), { adesso: OGGI }), null, 'una data nel futuro è un errore: non si sceglie');
});

test('scegli: a parità di punteggio vince il set giocato più di recente; le date si leggono anche come GG/MM/AAAA', () => {
    const seasons = stagioni({
        match1: match('27/10/2026', { set1: rimonta() }),
        match2: match('2026-10-29', { set1: rimonta() })
    });
    assert.equal(M.scegli(seasons, { adesso: OGGI }).match, 'match2');
    assert.equal(M.giornoDi('27/10/2026'), M.giornoDi('2026-10-27'));
    assert.equal(M.giornoDi('boh'), null);
});

test('scegli: lo scarto di Elo conta dal lato di chi ha vinto (vince p2 con meno Elo = sorpresa)', () => {
    const vince2 = rimonta(); vince2.vincitore = 'p2'; [vince2.p1, vince2.p2] = [vince2.p2, vince2.p1];
    const seasons = stagioni({
        match1: match('2026-10-29', { set1: vince2 }, { p1EloAtMatch: 1100, p2EloAtMatch: 1000 }),
        match2: match('2026-10-29', { set1: rimonta() }, { p1EloAtMatch: 1100, p2EloAtMatch: 1000 })      // vince chi ha più Elo: nessuna sorpresa
    });
    const s = M.scegli(seasons, { adesso: OGGI });
    assert.equal(s.match, 'match1');
    assert.ok(s.motivi.includes('Upset: 100 less Elo'));
});

// ---------- il blocco ----------
test('linkReplay: matches.html con la stagione e il set (showdown~match~set)', () => {
    const s = M.scegli(stagioni({ match1: match('2026-10-29', { set2: rimonta() }) }), { adesso: OGGI });
    assert.equal(M.linkReplay(s), 'matches.html?id=s0&replay=sd1~match1~set2');
    assert.equal(M.linkReplay({ stagione: 's1', showdown: '-Abc_d', match: 'match3', set: 'set1' }), 'matches.html?id=s1&replay=-Abc_d~match3~set1');
});

test('html: i due allenatori sui loro colori, WINNER sul vincitore, i Pokémon KO spenti, il Pokémon protagonista nel medaglione, il replay', () => {
    const s = M.scegli(stagioni({ match1: match('2026-10-29', { set1: rimonta() }, { team1: '<b>Uno</b>' }) }), { adesso: OGGI });
    const giocatori = { ada: { colore: '#aa00cc', avatar: 'a.png' }, bea: { colore: 'rosso', avatar: '' } };
    const h = M.html(s, { giocatori, gif: x => `g/${x}.gif` });
    assert.match(h, /MATCH OF THE WEEK/);
    assert.match(h, /class="ms-lato ms-l1 ms-vince" style="--c:#aa00cc"><span class="ms-win">WINNER<\/span>/);
    assert.match(h, /class="ms-lato ms-l2" style="--c:#d9dde6"/, 'un colore non valido torna al neutro');
    assert.doesNotMatch(h, /<b>Uno<\/b>/, 'il nome del team è protetto');
    assert.match(h, /&lt;b&gt;Uno&lt;\/b&gt;/);
    assert.equal((h.match(/class="ms-spr ms-ko"/g) || []).length, 3 + 4, 'i Pokémon andati KO sono spenti (3 di Ada e 4 di Bea)');
    assert.match(h, /class="ms-med" data-pkm="Ultimo"/);
    assert.match(h, /<b class="ms-banner">Ultimo<\/b><span class="ms-didascalia">Last one standing<\/span>/);
    assert.match(h, /href="matches\.html\?id=s0&amp;replay=sd1~match1~set1">WATCH THE REPLAY<\/a>/);
    assert.match(h, /<span class="ms-set">Set 1 · Match 1<\/span><span class="ms-data">29 Oct<\/span>/);
    assert.match(h, /<b class="ms-vs">VS<\/b>/);
    // l'allenatore di sinistra ha l'avatar a sinistra, quello di destra a destra (lo decide il CSS: .ms-l2 in riga inversa); il link porta alla pagina pubblica
    assert.match(h, /<a class="ms-av-link" href="public\.html\?player=Ada">/);
    assert.match(h, /<a class="ms-nome-link" href="public\.html\?player=Bea"><b class="ms-nome">Bea<\/b><\/a>/);
    // in basso, dopo i due allenatori: il protagonista, i motivi e il replay (in questo ordine)
    assert.ok(h.indexOf('class="ms-scontro"') < h.indexOf('class="ms-pie"'));
    assert.ok(h.indexOf('class="ms-prot"') < h.indexOf('class="ms-motivi"') && h.indexOf('class="ms-motivi"') < h.indexOf('class="ms-replay"'));
    assert.match(h, /<span class="ms-chip">Came back from 3 down<\/span>/);
    assert.equal(M.html(null), '');
    // senza sprite (la pagina non li ha) il blocco c'è lo stesso
    assert.doesNotMatch(M.html(s, { giocatori }), /<img class="ms-spr|class="ms-med"/);
});

// ---------- il collegamento nelle pagine ----------
test('home: il blocco sta sotto le stagioni, nascosto finché non c\'è un set, e si ridisegna solo se cambia il set scelto', () => {
    const idx = leggi('index.html');
    assert.match(idx, /<link rel="stylesheet" href="match-settimana\.css">/);
    for (const f of ['sprites/indice.js', 'sprite-pkm.js', 'medaglione-pkm.js', 'match-settimana.js']) assert.ok(idx.includes(`<script src="${f}"></script>`), f);
    assert.match(idx, /<section id="match-settimana" class="ms-sezione" aria-label="Match of the week" hidden>/);
    assert.ok(idx.indexOf('id="match-settimana"') > idx.indexOf('id="link-next"'), 'dopo le tre stagioni');
    assert.match(idx, /mostraMatchSettimana\(data\);/);
    assert.match(idx, /if \(chiave === matchSettimanaChiave\) return;/);
    assert.match(idx, /MedaglionePkm\.coloraMedaglioni\(window, blocco\)/);
    // il nome del player non finisce nell'HTML senza protezione: lo scrive match-settimana.js (esc)
    assert.doesNotMatch(idx, /ms-blocco'\)\.innerHTML = .*\$\{/);
});

test('matches.html: ?replay=showdown~match~set apre da solo il replay di quel set (una volta sola)', () => {
    const m = leggi('matches.html');
    assert.match(m, /async function apriMatch\(showdownID, matchKey, teamDidi, teamLu, scoreDidi, scoreLu, setIniziale\)/);
    assert.match(m, /data-set="\$\{numSet\}"/);
    assert.match(m, /\.btn-set\[data-set="\$\{String\(setIniziale\)\.replace\(\/\\D\/g, ''\)\}"\]/);
    assert.match(m, /apriReplayDaLink\(dataShowdowns\);/);
    assert.match(m, /get\('replay'\)/);
    assert.match(m, /richiesto\.split\('~'\)/);
    assert.match(m, /if \(replayDaLinkAperto\) return;/);
    assert.match(m, /<script src="medaglione-pkm\.js"><\/script>\s*\n<script src="riepilogo-stagione\.js"><\/script>/, 'il medaglione prima del riepilogo');
});

test('stile: bordi, ombre, angoli, rotazioni e caratteri del tema; niente giallo; sotto i 900 px un blocco per riga; nell\'app non serve', () => {
    const css = leggi('match-settimana.css');
    for (const v of ['--nb-ink', '--nb-carta', '--nb-sh-s', '--nb-sh-m', '--nb-raggio', '--nb-rot', '--nb-font-titoli', '--nb-ads']) assert.ok(css.includes(v), v);
    assert.doesNotMatch(css, /--nb-giallo|--gx-giallo|ffbd44|ffde4d/i);
    assert.match(css, /@media \(max-width: 900px\) \{[^}]*\.ms-sezione \{[^}]*\}[\s\S]*\.ms-scontro \{ grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /html\.app-shell \.ms-sezione \{ display: none; \}/);
    assert.match(css, /\.ms-spr\.ms-ko \{ filter: grayscale\(1\); opacity: \.4; \}/);
    assert.match(css, /body\.pg-index\.con-match \.home-seasons-container \{ min-height: 0;/);
});

test('home: il nastro è largo quanto la fila delle stagioni (stesse misure di nb-pagine.css e style-index.css) e basso', () => {
    const css = leggi('match-settimana.css');
    const nb = leggi('nb-pagine.css');
    const idx = leggi('style-index.css');
    // le misure delle carte: gap e larghezza come in nb-pagine.css, con il tetto di 280 px che style-index.css dà a .season-card
    assert.ok(nb.includes('clamp(26px, 3.6vw, 56px)'), 'il gap delle stagioni è cambiato in nb-pagine.css: aggiornare --ms-gap');
    assert.ok(css.includes('--ms-gap: clamp(26px, 3.6vw, 56px);'));
    assert.ok(nb.includes('clamp(236px, calc((100vw - var(--nb-ads) - 60px - 2 * var(--nb-gap-card)) / 3), 300px)'), 'la larghezza delle stagioni è cambiata in nb-pagine.css: aggiornare --ms-card');
    assert.ok(css.includes('--ms-card: clamp(236px, calc((100vw - var(--nb-ads, 0px) - 60px - 2 * var(--ms-gap)) / 3), 280px);'));
    assert.match(idx, /\.season-card \{[^}]*max-width: 280px;/, 'il tetto di 280 px delle carte è cambiato in style-index.css: aggiornare --ms-card');
    assert.match(css, /\.ms \{[^}]*width: calc\(3 \* var\(--ms-card\) \+ 2 \* var\(--ms-gap\) - 12px\);/);
    // un nastro basso: i due allenatori in riga (avatar accanto al testo), il resto in una riga sola sotto
    assert.match(css, /\.ms-scontro \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 132px minmax\(0, 1fr\);/);
    assert.match(css, /\.ms-l2 \{ flex-direction: row-reverse; text-align: right;/);
    assert.match(css, /\.ms-pie \{ display: flex; align-items: center;/);
    assert.match(css, /\.ms-replay \{[^}]*margin-left: auto;/);
    // lo spazio sotto la carta di mezzo (ingrandita) basta per l'etichetta che sporge; sugli schermi bassi tutto è un po' più stretto
    assert.match(css, /\.ms-sezione \{[^}]*padding: 64px 30px 36px;/);
    assert.match(css, /@media \(min-width: 1051px\) and \(max-height: 820px\) \{[^}]*\.ms-sezione \{ padding-top: 50px;/);
    // sotto i 1050 px le stagioni vanno in colonna: il nastro non segue più la loro fila
    assert.match(css, /@media \(max-width: 1050px\) \{\s*\.ms \{ width: min\(100%, 760px\); \}/);
});
