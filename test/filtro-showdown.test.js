'use strict';
// filtro-showdown.js: cercare al volo uno showdown nell'elenco di una stagione (testo libero + giocatore, contro chi, formato, mese, vinti/persi).
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../docs/filtro-showdown.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const sd = (p1, p2, categoria, data, teams = [], extra = {}) => ({ info: { player1: p1, player2: p2, categoria, data, ...extra },
    matches: Object.fromEntries(teams.map(([a, b], i) => [`match${i + 1}`, { team1: a, team2: b }])) });

// cinque showdown: due di Didi contro Lu (VGC marzo e OU aprile), uno di Ada contro Lu, uno di Didi contro Ada, uno senza vincitore
const SD = {
    a: [sd('Didi', 'Lu', 'VGC', '2026-03-02', [['Alfa', 'Beta'], ['Alfa', 'Gamma']]), 1],
    b: [sd('Didi', 'Lu', 'OU', '2026-04-10', [['Omega', 'Sigma']]), 2],
    c: [sd('Ada', 'Lu', 'VGC', '15/03/2026', [['Delta', 'Beta']]), 1],
    d: [sd('Didi', 'Ada', 'Little Cup', '2026-05-01', [['Mini', 'Piccolo']]), 2],
    e: [sd('Lu', 'Ada', 'VGC', '2026-05-20', [['Beta', 'Delta']]), 0]
};
const voci = Object.entries(SD).map(([id, [s, vince]]) => F.voce(id, s, vince));
const ids = criteri => F.filtra(voci, criteri).map(v => v.id);

test('voce: data normalizzata (anche GG/MM/AAAA), mese, team senza doppioni, chiavi in minuscolo', () => {
    const v = voci[0];
    assert.deepEqual([v.data, v.mese, v.formato], ['2026-03-02', '2026-03', 'VGC']);
    assert.deepEqual(v.team, ['Alfa', 'Beta', 'Gamma']);
    assert.deepEqual(v.chiavi, ['didi', 'lu']);
    assert.equal(voci[2].data, '2026-03-15', '15/03/2026');
    assert.equal(F.voce('x', { info: { data: 'boh' } }).data, '');
    assert.deepEqual(F.voce('x', {}).giocatori, ['TBD', 'TBD']);
    assert.equal(F.voce('x', { info: {} }, 7).vince, 0, 'solo 1 o 2');
    assert.deepEqual(F.voce('x', { info: {}, matches: { m: { team1: { valore: 'Nome' }, team2: '  ' } } }).team, ['Nome'], 'il team può essere { valore }');
});

test('opzioni: giocatori (una volta, in ordine alfabetico), formati, mesi dal più recente; TBD non conta', () => {
    const o = F.opzioni([...voci, F.voce('t', sd('', '', 'OU', '2026-06-01'))]);
    assert.deepEqual(o.giocatori.map(g => g.nome), ['Ada', 'Didi', 'Lu']);
    assert.deepEqual(o.giocatori.map(g => g.chiave), ['ada', 'didi', 'lu']);
    assert.deepEqual(o.formati, ['Little Cup', 'OU', 'VGC']);
    assert.deepEqual(o.mesi, [{ valore: '2026-06', nome: 'June 2026' }, { valore: '2026-05', nome: 'May 2026' }, { valore: '2026-04', nome: 'April 2026' }, { valore: '2026-03', nome: 'March 2026' }]);
    assert.deepEqual(F.opzioni(null), { giocatori: [], formati: [], mesi: [] });
});

test('filtra: un criterio alla volta (giocatore, contro, formato, mese)', () => {
    assert.deepEqual(ids({}), ['a', 'b', 'c', 'd', 'e'], 'senza criteri tutto, stesso ordine');
    assert.deepEqual(ids({ giocatore: 'didi' }), ['a', 'b', 'd']);
    assert.deepEqual(ids({ giocatore: 'Lu' }), ['a', 'b', 'c', 'e'], 'maiuscole non contano');
    assert.deepEqual(ids({ formato: 'vgc' }), ['a', 'c', 'e']);
    assert.deepEqual(ids({ formato: 'OU' }), ['b'], 'esatto: OU non pesca altro');
    assert.deepEqual(ids({ mese: '2026-03' }), ['a', 'c']);
    assert.deepEqual(ids({ contro: 'ada' }), ['c', 'd', 'e']);
});

test('filtra: i criteri si sommano (Didi contro Lu in VGC, Didi in aprile...) e contro se stesso non trova niente', () => {
    assert.deepEqual(ids({ giocatore: 'didi', contro: 'lu' }), ['a', 'b']);
    assert.deepEqual(ids({ giocatore: 'didi', contro: 'lu', formato: 'VGC' }), ['a']);
    assert.deepEqual(ids({ giocatore: 'didi', mese: '2026-04' }), ['b']);
    assert.deepEqual(ids({ giocatore: 'ada', contro: 'ada' }), []);
    assert.deepEqual(ids({ giocatore: 'ada', formato: 'OU' }), []);
});

test('filtra: vinti e persi di un giocatore (il lato conta; pari o aperti non sono né vinti né persi); senza giocatore l\'esito non si applica', () => {
    assert.deepEqual(ids({ giocatore: 'didi', esito: 'won' }), ['a'], 'a: vince Didi (lato 1); b e d: vince il secondo');
    assert.deepEqual(ids({ giocatore: 'didi', esito: 'lost' }), ['b', 'd']);
    assert.deepEqual(ids({ giocatore: 'lu', esito: 'won' }), ['b'], 'Lu: b (lato 2). c: vince Ada; e: aperto');
    assert.deepEqual(ids({ giocatore: 'lu', esito: 'lost' }), ['a', 'c']);
    assert.deepEqual(ids({ esito: 'won' }), ['a', 'b', 'c', 'd', 'e'], 'senza giocatore niente da fare');
});

test('filtra: il testo libero cerca giocatori, team, formato, data e mese; più parole si sommano', () => {
    assert.deepEqual(ids({ testo: 'beta' }), ['a', 'c', 'e'], 'team');
    assert.deepEqual(ids({ testo: 'didi vgc' }), ['a']);
    assert.deepEqual(ids({ testo: 'little' }), ['d'], 'formato');
    assert.deepEqual(ids({ testo: '2026-05' }), ['d', 'e'], 'data normalizzata');
    assert.deepEqual(ids({ testo: '15/03/2026' }), ['c'], 'data come l\'hanno scritta');
    assert.deepEqual(ids({ testo: 'march' }), ['a', 'c'], 'nome del mese');
    assert.deepEqual(ids({ testo: '  ADA   delta ' }), ['c', 'e'], 'spazi e maiuscole');
    assert.deepEqual(ids({ testo: 'zzz' }), []);
    assert.deepEqual(ids({ testo: 'beta', giocatore: 'ada', formato: 'VGC', mese: '2026-05' }), ['e'], 'testo + tendine insieme');
});

test('quantiAttivi: testo, giocatore, contro, formato, mese; l\'esito conta solo con il giocatore', () => {
    assert.equal(F.quantiAttivi({}), 0);
    assert.equal(F.quantiAttivi({ testo: '  ' }), 0);
    assert.equal(F.quantiAttivi({ testo: 'x', giocatore: 'didi', esito: 'won', formato: 'OU' }), 4);
    assert.equal(F.quantiAttivi({ esito: 'won' }), 0);
    assert.equal(F.quantiAttivi(null), 0);
});

test('html: la barra ha ricerca, tendine con le scelte, tasti vinti/persi solo con un giocatore, conteggio e avviso se non c\'è niente; niente HTML dai nomi', () => {
    const cattivo = [...voci, F.voce('z', sd('<b>X</b>', 'Lu', 'A"B', '2026-06-01'), 1)];
    const opz = F.opzioni(cattivo);
    const h = F.html(opz, { giocatore: 'didi', esito: 'won' }, { mostrati: 1, totale: 6 }, { aperto: true });
    assert.match(h, /<input type="search" class="mf-testo" data-mf="testo" value=""/);
    assert.match(h, /<select data-mf="giocatore" aria-label="Player"><option value="">Any<\/option>.*<option value="didi" selected>Didi<\/option>/s);
    assert.match(h, /&lt;b&gt;X&lt;\/b&gt;/);
    assert.doesNotMatch(h, /<b>X<\/b>/);
    assert.match(h, /value="A&quot;B"/);
    assert.match(h, /<option value="2026-06">June 2026<\/option>/);
    assert.match(h, /<button type="button" class="mf-apri" data-mf-apri aria-expanded="true"[^>]*>Filters <i class="mf-n">2<\/i>/);
    assert.match(h, /data-mf-esito="won" aria-pressed="true"/);
    assert.doesNotMatch(h, /class="mf-esito"[^>]*hidden/);
    assert.match(h, /1 of 6 showdowns/);
    assert.match(h, /<p class="mf-vuoto" role="status" hidden>/);
    const senza = F.html(opz, {}, { mostrati: 0, totale: 6 });
    assert.match(senza, /class="mf-esito"[^>]*hidden/, 'senza giocatore i tasti Won/Lost non si vedono');
    assert.match(senza, /<div class="mf-pannello" id="mf-pannello" hidden>/);
    assert.match(senza, /data-mf-pulisci hidden/);
    assert.match(senza, /<p class="mf-vuoto" role="status">No showdown matches these filters\./);
    assert.match(F.html(opz, { testo: 'a"b' }, { mostrati: 6, totale: 6 }), /value="a&quot;b"/);
    assert.match(F.html(opz, {}, { mostrati: 6, totale: 6 }), /6 showdowns/);
    assert.match(F.html(opz, {}, { mostrati: 1, totale: 1 }), /1 showdown</);
});

test('cablaggio: matches.html ha la barra, indicizza ogni showdown, nasconde le card e passa all\'app solo le locandine rimaste', () => {
    const m = leggi('docs', 'matches.html');
    assert.match(m, /<script src="filtro-showdown\.js"><\/script>/);
    assert.match(m, /<div id="matchFiltro" class="match-filtro" hidden><\/div>\s*<div id="matchList"/);
    assert.match(m, /FiltroShowdown\.voce\(sdId, sd, chiVince\)/);
    assert.match(m, /montaFiltroShowdown\(\{ voci: vociFiltro, schede: schedeFiltro, perAppSd/);
    assert.match(m, /card\.hidden = !ok\.has\(id\)/);
    assert.match(m, /lista: ctx\.perAppSd\.filter\(s => ok\.has\(s\.id\)\), riepilogo: ctx\.riepilogo, reset: true/);
    assert.match(leggi('docs', 'app-matches.js'), /dati && dati\.reset \? 0 :/);
    const css = leggi('docs', 'style-matches.css');
    for (const c of ['.match-filtro', '.mf-testo', '.mf-pannello', '.mf-esito-tasto', '.showdown-summary-card[hidden]']) assert.ok(css.includes(c), c);
    assert.ok(leggi('docs', 'app-gioco-pagine.css').includes('.mf-pannello'));
    // con il riepilogo di fine stagione in vista (il calendario nascosto) la barra non deve restare da sola
    assert.match(leggi('docs', 'riepilogo-stagione.css'), /#matchFiltro/);
});
