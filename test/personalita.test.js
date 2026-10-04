'use strict';
// La personalità dell'allenatore (docs/personalita.js): scarti dalla media della lega, non numeri assoluti.
//   - si sblocca dopo 25 set con dati sulle scelte, e quando almeno 3 allenatori hanno dati da confrontare;
//   - tutti attaccano più di quanto si proteggano: un allenatore nella media di tutti gli assi vale 50 ovunque;
//   - chi usa Protezione un po' più della media è "difensivo" anche se attacca sempre più di quanto si protegga;
//   - le famiglie: offensiva (attacco), difensiva (guardia, cambio), stratega (potenziamento, campo, trucchi).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../docs/personalita.js');

// un allenatore con `set` set e 20 scelte per set, ripartite per quote (somma ≤ 1; il resto sono "altro")
function allenatore(id, set, quote) {
    const dec = set * 20;
    const q = { attacco: 0.7, protezione: 0.1, recupero: 0.02, cambi: 0.06, potenziamento: 0.04, campo: 0.03, supporto: 0.02, disturbo: 0.03, ...quote };
    const az = { setConDati: set, decisioni: dec, mosse: 0, cambi: 0, attacco: 0, protezione: 0, recupero: 0, potenziamento: 0, campo: 0, supporto: 0, disturbo: 0, altro: 0 };
    for (const k of Object.keys(q)) az[k] = Math.round(dec * q[k]);
    az.mosse = dec - az.cambi;
    return { id, azioni: az };
}
const lega = (...extra) => [
    allenatore('a', 40, {}), allenatore('b', 40, { attacco: 0.68, protezione: 0.12 }), allenatore('c', 40, { attacco: 0.72, protezione: 0.08 }),
    allenatore('d', 40, { attacco: 0.7 }), ...extra
];

test('sblocco: nessun dato, pochi set, poca lega, poi pronta', () => {
    assert.equal(P.calcola([{ id: 'x' }], 'x').stato, 'nessun-dato');
    assert.equal(P.calcola([allenatore('x', 10, {})], 'x').stato, 'bloccata');
    const poco = P.calcola([allenatore('x', 10, {})], 'x');
    assert.equal(poco.set, 10);
    assert.equal(poco.setServono, P.MIN_SET);
    // 25 set bastano per lui, ma da solo non ha con chi confrontarsi
    const solo = P.calcola([allenatore('x', 25, {})], 'x');
    assert.equal(solo.stato, 'in-attesa');
    assert.equal(solo.allenatoriServono, 3);
    assert.equal(P.calcola([allenatore('x', 25, {}), allenatore('y', 30, {})], 'x').stato, 'in-attesa');
    assert.equal(P.calcola([allenatore('x', 25, {}), allenatore('y', 30, {}), allenatore('z', 30, {})], 'x').stato, 'pronta');
    // un id sconosciuto: niente dati
    assert.equal(P.calcola(lega(), 'nessuno').stato, 'nessun-dato');
});

test('chi è nella media della lega vale 50 su ogni asse e ha una personalità equilibrata, anche se attacca molto più di quanto si protegga', () => {
    const giocatori = [allenatore('a', 40, {}), allenatore('b', 40, {}), allenatore('c', 40, {})];
    const r = P.calcola(giocatori, 'a');
    assert.equal(r.stato, 'pronta');
    for (const asse of r.assi) assert.equal(asse.valore, 50, asse.id);
    assert.equal(r.tipo.id, 'equilibrata');
    // l'attacco resta il 70% delle scelte, ma non è "tanto": è la media
    assert.equal(r.assi.find(a => a.id === 'attacco').quota, 0.7);
});

test('un po\' più di Protezione della media: più difensivo, pur attaccando sempre più di quanto si protegga', () => {
    const prudente = allenatore('p', 40, { attacco: 0.6, protezione: 0.2, recupero: 0.04 });
    const r = P.calcola(lega(prudente), 'p');
    const guardia = r.assi.find(a => a.id === 'guardia');
    assert.ok(guardia.quota < r.assi.find(a => a.id === 'attacco').quota, 'attacca più di quanto si protegga');
    assert.ok(guardia.scartoPerc > 50, `scarto ${guardia.scartoPerc}%`);
    assert.ok(guardia.valore > 70, `valore ${guardia.valore}`);
    assert.equal(r.tipo.id, 'difensiva');
    assert.ok(r.famiglie.difensiva > r.famiglie.offensiva);
});

test('chi attacca più della media è offensivo, chi gioca di campo e trucchi è stratega', () => {
    const aggressivo = allenatore('g', 40, { attacco: 0.82, protezione: 0.05, recupero: 0.01, cambi: 0.03, potenziamento: 0.02, campo: 0.01, supporto: 0.01, disturbo: 0.01 });
    const r = P.calcola(lega(aggressivo), 'g');
    assert.equal(r.tipo.id, 'offensiva');
    assert.ok(r.assi.find(a => a.id === 'attacco').valore > 60);
    assert.ok(r.assi.find(a => a.id === 'guardia').valore < 40);

    const stratega = allenatore('s', 40, { attacco: 0.5, potenziamento: 0.1, campo: 0.1, supporto: 0.06, disturbo: 0.1 });
    const s = P.calcola(lega(stratega), 's');
    assert.equal(s.tipo.id, 'stratega');
    for (const id of ['potenziamento', 'campo', 'trucchi']) assert.ok(s.assi.find(a => a.id === id).valore > 60, id);
});

test('i set che mancano rendono il giudizio più prudente: con pochi dati si resta più vicini a 50', () => {
    const profilo = { attacco: 0.5, protezione: 0.25, recupero: 0.05 };
    // una lega grande, perché i set di chi si sta guardando non spostino la media di tutti
    const grande = [allenatore('a', 400, {}), allenatore('b', 400, { protezione: 0.11 }), allenatore('c', 400, { protezione: 0.09 }), allenatore('d', 400, {})];
    const pochi = P.calcola([...grande, allenatore('p', 25, profilo)], 'p').assi.find(a => a.id === 'guardia');
    const tanti = P.calcola([...grande, allenatore('p', 120, profilo)], 'p').assi.find(a => a.id === 'guardia');
    assert.ok(tanti.valore > pochi.valore, `${tanti.valore} > ${pochi.valore}`);
    assert.ok(pochi.valore > 50);
});

test('la media della lega pesa tutte le scelte di tutti (chi gioca di più conta di più) e non conta chi non ha dati', () => {
    const L = P.lega([allenatore('a', 100, { protezione: 0.2 }), allenatore('b', 10, { protezione: 0 }), { id: 'c' }, { id: 'd', azioni: { decisioni: 0 } }]);
    assert.equal(L.allenatori, 2);
    assert.equal(L.set, 110);
    const attesa = (0.2 * 2000 + 0.02 * 2000 + 0.02 * 200) / 2200;     // protezione + recupero
    const guardia = L.assi.guardia.quota;
    assert.ok(Math.abs(guardia - attesa) < 0.005, `${guardia} vs ${attesa}`);
});

test('quanto gli allenatori si distinguono tra loro fissa la scala: dove sono tutti uguali basta poco per spiccare', () => {
    // con almeno quattro allenatori confrontabili si usa la loro dispersione vera (minimo 5% relativo)
    const L = P.lega([allenatore('a', 40, {}), allenatore('b', 40, {}), allenatore('c', 40, {}), allenatore('d', 40, {})]);
    assert.equal(L.assi.attacco.scala, 0.05, 'tutti uguali: scala minima');
    // con pochi allenatori, la scala di base dell\'asse
    const poca = P.lega([allenatore('a', 40, {}), allenatore('b', 40, {})]);
    assert.equal(poca.assi.attacco.scala, 0.12);
    assert.equal(poca.assi.guardia.scala, 0.45);
});

test('i valori restano nella scala 0-100 anche per allenatori estremi, e il risultato è semplice da salvare', () => {
    const estremo = allenatore('e', 200, { attacco: 0.05, protezione: 0.7, recupero: 0.1, cambi: 0.1 });
    const r = P.calcola(lega(estremo), 'e');
    for (const a of r.assi) assert.ok(a.valore >= 4 && a.valore <= 96, `${a.id} ${a.valore}`);
    assert.doesNotThrow(() => JSON.stringify(r));
    assert.ok(r.frasi.length >= 1 && r.frasi.length <= 3);
    assert.match(r.frasi[0], /of your choices against .*% for the league \(/);
});

test('cambi e protezioni ripetute: i sei assi e le tre famiglie del progetto', () => {
    assert.deepEqual(P.ASSI.map(a => a.id), ['attacco', 'guardia', 'cambio', 'potenziamento', 'campo', 'trucchi']);
    assert.deepEqual([...new Set(P.ASSI.map(a => a.famiglia))], ['offensiva', 'difensiva', 'stratega']);
    assert.deepEqual(Object.keys(P.FAMIGLIE).sort(), ['difensiva', 'equilibrata', 'offensiva', 'stratega']);
});

test('vertici del diagramma: il primo asse in alto, gli altri in senso orario, il raggio è proporzionale al valore', () => {
    const v = P.vertici([100, 100, 100, 100, 100, 100], 100, 100, 100);
    assert.deepEqual([v[0].x, v[0].y], [100, 0], 'il primo è in alto');
    assert.deepEqual([v[1].x, v[1].y], [186.6, 50], 'il secondo in alto a destra');
    assert.deepEqual([v[3].x, v[3].y], [100, 200], 'il quarto in basso');
    const meta = P.vertici([50, 50, 50, 50], 100, 0, 0);
    assert.deepEqual(meta.map(p => [p.x, p.y]), [[0, -50], [50, 0], [0, 50], [-50, 0]]);
    // fuori scala resta dentro il disegno
    assert.deepEqual([P.vertici([250], 10, 0, 0)[0].y, P.vertici([-5], 10, 0, 0)[0].y], [-10, 0]);
});
