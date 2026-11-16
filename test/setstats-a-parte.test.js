'use strict';
// Le statistiche dei set (setStats) stanno in un nodo a parte, setStats/{stagione}/{showdown}/match{N}, non più dentro ai match di seasons: il server le scrive lì (o, se il nodo
// non è ancora nelle regole, dentro al match come prima), le pagine che le usano le rimettono nei match, lo script di migrazione le sposta senza perdere niente.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');
const D = require('../docs/db-leggero.js');
const { piano } = require('../.github/workflows/migra-setstats.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggiFile = f => fs.readFileSync(path.join(DOCS, f), 'utf8');

const STATS1 = { set1: { turni: 12, vincitore: 'p1' }, set2: { turni: 9, vincitore: 'p2' } };
const stagioni = () => ({
    s0: { info: { status: 'playing' }, showdowns: { sd1: { info: { categoria: 'OU' }, matches: { match1: { p1score: 2, p2score: 1, setStats: STATS1 }, match2: { p1score: 2, p2score: 0 } } } } },
    s1: { info: { status: 'open' }, showdowns: {} }
});

test('unisciSetStats: ogni match riprende le sue statistiche dal nodo nuovo (che vale più di quello dentro); gli altri restano, l\'originale non cambia', () => {
    const originale = stagioni();
    const nodo = { s0: { sd1: { match2: { set1: { turni: 5 } }, match1: { set1: { turni: 99 } } } }, sNonEsiste: { x: {} } };
    const unite = D.unisciSetStats(originale, nodo);
    assert.deepEqual(unite.s0.showdowns.sd1.matches.match2.setStats, { set1: { turni: 5 } }, 'un match che non le aveva dentro');
    assert.deepEqual(unite.s0.showdowns.sd1.matches.match1.setStats, { set1: { turni: 99 } }, 'il nodo nuovo vale più di quelle dentro');
    assert.equal(unite.s1, originale.s1, 'una stagione senza statistiche resta com\'è');
    assert.equal(unite.sNonEsiste, undefined, 'niente stagioni inventate da statistiche orfane');
    assert.deepEqual(originale.s0.showdowns.sd1.matches.match1.setStats, STATS1, 'l\'originale non si tocca');
    assert.equal(originale.s0.showdowns.sd1.matches.match2.setStats, undefined);
    // senza il nodo (o con un nodo vuoto) tutto com'era: i dati non ancora spostati funzionano
    assert.equal(D.unisciSetStats(originale, null), originale);
    assert.deepEqual(D.unisciSetStats(originale, {}).s0.showdowns.sd1.matches.match1.setStats, STATS1);
});

test('unisciSetStatsShowdowns: lo stesso per i soli showdown di una stagione; stagioniConStats e setStatsStagione leggono i due nodi', async () => {
    const db = creaDb({ seasons: stagioni(), setStats: { s0: { sd1: { match2: { set1: { turni: 5 } } } } } });
    const letti = [];
    const spia = { ref: p => { letti.push(p); return db.ref(p); } };
    const unite = await D.stagioniConStats(spia);
    assert.deepEqual(letti.sort(), ['seasons', 'setStats']);
    assert.deepEqual(unite.s0.showdowns.sd1.matches.match2.setStats, { set1: { turni: 5 } });
    assert.deepEqual(unite.s0.showdowns.sd1.matches.match1.setStats, STATS1);
    assert.deepEqual(await D.setStatsStagione(db, 's0'), { sd1: { match2: { set1: { turni: 5 } } } });
    assert.deepEqual(await D.setStatsStagione(db, 'nessuna'), {});
    const sd = D.unisciSetStatsShowdowns(db.leggi('seasons/s0/showdowns'), await D.setStatsStagione(db, 's0'));
    assert.deepEqual(sd.sd1.matches.match2.setStats, { set1: { turni: 5 } });
    // un nodo che non si legge (regole) non rompe la lettura delle stagioni
    const rotto = { ref: p => (p === 'setStats' ? { once: async () => { throw new Error('permission_denied'); } } : db.ref(p)) };
    assert.deepEqual((await D.stagioniConStats(rotto)).s0.showdowns.sd1.matches.match1.setStats, STATS1);
});

test('migrazione, piano: copia i match che hanno le statistiche dentro, salta quelli già copiati identici (da pulire), segnala quelli diversi', () => {
    const s = stagioni();
    let p = piano(s, {});
    assert.deepEqual(Object.keys(p.copia), ['s0/sd1/match1']);
    assert.equal(p.senzaStats, 1);
    assert.deepEqual(p.pulisci, []);
    p = piano(s, { s0: { sd1: { match1: STATS1 } } });
    assert.deepEqual(p.copia, {});
    assert.deepEqual(p.pulisci, ['s0/sd1/match1']);
    assert.equal(p.giaCopiate, 1);
    p = piano(s, { s0: { sd1: { match1: { set1: { turni: 1 } } } } });
    assert.deepEqual(p.conflitti, ['s0/sd1/match1'], 'diverso: non si copia e non si toglie, si guarda a mano');
    assert.deepEqual(p.copia, {});
    assert.deepEqual(p.pulisci, []);
    assert.deepEqual(piano(null, null).copia, {});
});

// ---------- il server (registraRisultatoMatch) ----------
function caricaSito(db) {
    const file = path.join(DOCS, 'risultati-match.js');
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: async () => ({ ok: false, json: async () => ({}) }), db });
    vm.runInContext(fs.readFileSync(file, 'utf8'), contesto, { filename: file });
    return contesto;
}
const base = () => ({
    seasons: { s0: { info: { name: 'S0', status: 'playing' }, showdowns: { sd1: { info: { categoria: 'OU', data: '2026-11-01' }, matches: {} } } } },
    players: { didi: { info: { name: 'Didi' } }, lukiani: { info: { name: 'Lukiani' } } }
});
const richiesta = (extra = {}) => ({ stagione: 's0', showdownId: 'sd1', matchNum: 1, player1: 'Didi', player2: 'Lukiani', team1: '', team2: '', score: '2-1', data: '2026-11-01', categoria: 'OU', replays: { set1: { url: 'u', vincitore: '1' } }, ...extra });

test('registraRisultatoMatch: le statistiche dei set si scrivono nel nodo a parte e NON dentro al match', async () => {
    const db = creaDb(base());
    const sito = caricaSito(db);
    await sito.registraRisultatoMatch(richiesta({ setStats: STATS1 }));
    assert.deepEqual(db.leggi('setStats/s0/sd1/match1'), STATS1);
    assert.equal(db.leggi('seasons/s0/showdowns/sd1/matches/match1/setStats'), null, 'dentro al match non più');
    assert.equal(db.leggi('seasons/s0/showdowns/sd1/matches/match1/p1score'), 2, 'il match c\'è');
});

test('registraRisultatoMatch: una modifica a mano (senza statistiche) tiene quelle già salvate, nel nodo nuovo o dentro al match (dati non spostati)', async () => {
    // già nel nodo nuovo
    let db = creaDb(base());
    let sito = caricaSito(db);
    await sito.registraRisultatoMatch(richiesta({ setStats: STATS1 }));
    await sito.registraRisultatoMatch(richiesta({ score: '2-0' }));
    assert.deepEqual(db.leggi('setStats/s0/sd1/match1'), STATS1);
    assert.equal(db.leggi('seasons/s0/showdowns/sd1/matches/match1/p1score'), 2);
    assert.equal(db.leggi('seasons/s0/showdowns/sd1/matches/match1/p2score'), 0);
    // ancora dentro al match (prima della migrazione): si passano al nodo nuovo
    const vecchio = base();
    vecchio.seasons.s0.showdowns.sd1.matches.match1 = { player1: 'Didi', player2: 'Lukiani', p1score: 2, p2score: 1, setStats: STATS1 };
    db = creaDb(vecchio);
    sito = caricaSito(db);
    await sito.registraRisultatoMatch(richiesta({ score: '2-0' }));
    assert.deepEqual(db.leggi('setStats/s0/sd1/match1'), STATS1);
    assert.equal(db.leggi('seasons/s0/showdowns/sd1/matches/match1/setStats'), null);
});

test('registraRisultatoMatch: se il nodo a parte non si può scrivere (regole non ancora aggiornate) le statistiche restano dentro al match, come prima: il salvataggio non si rompe', async () => {
    const db = creaDb(base());
    const originale = db.ref;
    db.ref = p => (/^setStats\//.test(p) ? { once: async () => ({ val: () => null }), set: async () => { throw new Error('PERMISSION_DENIED'); }, remove: async () => {} } : originale(p));
    const sito = caricaSito(db);
    await sito.registraRisultatoMatch(richiesta({ setStats: STATS1 }));
    assert.deepEqual(db.leggi('seasons/s0/showdowns/sd1/matches/match1/setStats'), STATS1);
});

test('ricalcolaStatisticheGlobali legge le statistiche anche dal nodo a parte (dopo lo spostamento i numeri dei giocatori non cambiano)', async () => {
    const prove = [];
    for (const dentro of [true, false]) {
        const d = base();
        const set = { turni: 7, vincitore: 'p1', p1: { portati: 2, svenuti: 1, pokemon: [{ specie: 'Pikachu', portato: true, svenuto: false, ultimo: true, koFatti: 2 }] }, p2: { portati: 2, svenuti: 2, pokemon: [] } };
        const dati = { set1: set };
        d.seasons.s0.showdowns.sd1.matches.match1 = { player1: 'Didi', player1Id: 'didi', player2: 'Lukiani', player2Id: 'lukiani', winnerId: 'didi', team1: 'T1', team2: 'T2', p1score: 1, p2score: 0, p1points: 3, p2points: 0, data: '2026-11-01', replays: {} };
        if (dentro) d.seasons.s0.showdowns.sd1.matches.match1.setStats = dati; else d.setStats = { s0: { sd1: { match1: dati } } };
        const db = creaDb(d);
        const sito = caricaSito(db);
        await sito.ricalcolaStatisticheGlobali('didi');
        prove.push(JSON.stringify(db.leggi('players/didi/stats')));
    }
    assert.equal(prove[0], prove[1], 'stessi numeri con le statistiche dentro al match o nel nodo a parte');
});

test('cancellazioni: match, showdown e stagione tolgono anche il loro pezzo di setStats (se no, rifacendo un match con lo stesso numero tornerebbero le vecchie statistiche)', () => {
    const m = leggiFile('matches.html');
    assert.match(m, /await db\.ref\(`setStats\/\$\{stagione\}\/\$\{sdId\}`\)\.remove\(\)\.catch/);
    assert.match(m, /await db\.ref\(`setStats\/\$\{stagione\}\/\$\{showdownId\}\/match\$\{matchNum\}`\)\.remove\(\)\.catch/);
    assert.match(leggiFile('admin.html'), /await db\.ref\(`setStats\/\$\{idDaEliminare\}`\)\.remove\(\)\.catch/);
});

test('le pagine che usano le statistiche dei set le rimettono nei match; quelle che non le usano (Hub, le card di Matches) no; ogni pagina che ne ha bisogno carica db-leggero.js', () => {
    assert.match(leggiFile('fiocchi.js'), /finestra\.DbLeggero\.stagioniConStats\(db\)/);
    assert.match(leggiFile('stats.js'), /window\.DbLeggero\.stagioniConStats\(db\)/);
    assert.match(leggiFile('palmares.js'), /window\.DbLeggero\.stagioniConStats\(db\)/);
    assert.match(leggiFile('box.html'), /window\.stagioniPerLega = \(await DbLeggero\.stagioniConStats\(db\)\)/);
    assert.match(leggiFile('formats.html'), /datiStagioniFormato = \(await DbLeggero\.stagioniConStats\(db\)\)/);
    const idx = leggiFile('index.html');
    assert.match(idx, /db\.ref\('setStats'\)\.on\('value'/);
    assert.match(idx, /DbLeggero\.unisciSetStats\(stagioniGrezze, statisticheSet\)/);
    const mt = leggiFile('matches.html');
    assert.match(mt, /DbLeggero\.setStatsStagione\(db, stagioneAttiva\)/);
    assert.match(mt, /showdowns: await showdownsConStats\(\)/, 'il riepilogo');
    assert.match(mt, /caricaShowdownsConStats: showdownsConStats/, 'il voto dell\'MVP, solo quando serve');
    assert.doesNotMatch(leggiFile('hub.html'), /setStats|stagioniConStats/, 'l\'Hub non le scarica');
    const mv = leggiFile('mvp-voto.js');
    assert.match(mv, /showdowns: await showdownsPerStatistiche\(ctx\), iscritti: ctx\.iscrittiGrezzi/);
    assert.match(mv, /showdowns: await showdownsPerStatistiche\(ctx\), teamsIscritti/);
    for (const f of ['index', 'stats', 'palmares', 'profile', 'public', 'box', 'formats', 'matches', 'battle']) assert.match(leggiFile(f + '.html'), /<script src="db-leggero\.js"><\/script>/, f);
    assert.match(fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'stile-giocatori.js'), 'utf8'), /DbLeggero\.unisciSetStats\(/);
});

test('REGOLE-DATABASE.md: il nodo setStats e i passi per spostare i dati sono scritti', () => {
    const r = fs.readFileSync(path.join(__dirname, '..', 'REGOLE-DATABASE.md'), 'utf8');
    assert.match(r, /"setStats": \{ "\.read": true, "\.write": "auth != null" \}/);
    assert.match(r, /Sposta le statistiche dei set/);
});
