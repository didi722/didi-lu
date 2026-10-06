'use strict';
// I pareggi non esistono: se gli ultimi due Pokémon cadono insieme (Destiny Bond, Explosion...) il simulatore di Showdown nei formati
// fino alla 4ª generazione chiude con "|tie", e il sito non assegnava il set a nessuno. Vince chi cade PER ULTIMO.
// Qui: la regola (esito-set.js) provata con il simulatore vero e con log scritti a mano, e il suo collegamento al server e ai motori.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../docs/esito-set.js');
const { analizzaSet } = require('../functions/statistiche-set.js');
const { caricaSim, giocaPartita } = require('./ayuda-sim.js');

const leggi = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const gestore = r => (r.teamPreview ? 'team 1' : 'move 1');

// Ninjask (Destiny Bond, più veloce) cade per un Hyper Beam; Destiny Bond porta giù anche Slowbro: cadono insieme
const NINJASK = 'Ninjask\nAbility: Speed Boost\nLevel: 100\nIVs: 0 HP\n- Destiny Bond';
const SLOWBRO = 'Slowbro\nAbility: Oblivious\nLevel: 100\n- Hyper Beam';
async function doppioKo(formato) {
    const { sim } = await caricaSim();
    return giocaPartita({ sim, formato, team1: NINJASK, team2: SLOWBRO, maxTurni: 3,
        agente1: { tipo: 'script', gestore }, agente2: { tipo: 'script', gestore } });
}

test('Destiny Bond sugli ultimi due Pokémon, 3ª e 4ª generazione: il simulatore dice "|tie", il sito dà il set a chi è caduto per ultimo', async () => {
    for (const formato of ['gen4customgame', 'gen3customgame']) {
        const e = await doppioKo(formato);
        assert.ok(e.righe.includes('|tie'), `${formato}: il simulatore chiude in pareggio`);
        const cadute = e.righe.filter(r => r.startsWith('|faint|'));
        assert.deepEqual(cadute.map(r => r.split('|')[2].slice(0, 2)), ['p1', 'p2'], 'prima il Destiny Bond, poi chi lo ha colpito');

        const risolte = E.risolviPareggio(e.righe);
        assert.equal(risolte.length, e.righe.length, 'le righe restano tante quante erano');
        assert.ok(!risolte.some(r => r === '|tie'), 'niente più pareggio');
        assert.equal(risolte[risolte.length - 1], '|win|P2', `${formato}: vince il lato dell'ultimo Pokémon caduto`);
        assert.deepEqual({ ...E.vincitoreDelLog(e.righe) }, { lato: 'p2', nome: 'P2' });
    }
});

test('dalla 5ª generazione il simulatore scrive già "|win|" con la stessa regola: il log non cambia', async () => {
    for (const formato of ['gen5customgame', 'gen9customgame']) {
        const e = await doppioKo(formato);
        assert.ok(!e.righe.includes('|tie'));
        assert.equal(e.righe[e.righe.length - 1], '|win|P2', formato);
        assert.deepEqual(E.risolviPareggio(e.righe), e.righe, 'nessuna modifica');
        assert.equal(E.vincitoreDelLog(e.righe).lato, 'p2');
    }
});

test('lo stesso doppio KO a parti invertite: vince l\'altro lato', async () => {
    const { sim } = await caricaSim();
    const e = await giocaPartita({ sim, formato: 'gen4customgame', team1: SLOWBRO, team2: NINJASK, maxTurni: 3,
        agente1: { tipo: 'script', gestore }, agente2: { tipo: 'script', gestore } });
    assert.ok(e.righe.includes('|tie'));
    assert.equal(E.vincitoreDelLog(e.righe).lato, 'p1', 'ora è p1 a cadere per ultimo');
});

test('le statistiche del set dicono chi ha vinto anche se il log arriva col pareggio', async () => {
    const e = await doppioKo('gen4customgame');
    const stat = analizzaSet(e.righe);
    assert.equal(stat.vincitore, 'p2');
    const nuovo = analizzaSet(E.risolviPareggio(e.righe));
    assert.equal(nuovo.vincitore, 'p2');
    assert.equal(nuovo.p1.svenuti, 1);
    assert.equal(nuovo.p2.svenuti, 1);
});

// ---------- log scritti a mano ----------
const base = ['|player|p1|Didi|1|1000', '|player|p2|Lu|2|1000', '|turn|1'];

test('un log senza pareggio non si tocca, anche se vuoto o strano', () => {
    const log = [...base, '|faint|p1a: A', '|win|Lu'];
    assert.equal(E.risolviPareggio(log), log);
    assert.deepEqual(E.risolviPareggio([]), []);
    assert.equal(E.risolviPareggio(null), null);
    assert.deepEqual({ ...E.vincitoreDelLog([...base]) }, { lato: '', nome: '' }, 'set non finito: nessun vincitore');
    assert.equal(E.vincitoreDelLog(log).lato, 'p2');
});

test('doppio KO: vince il lato dell\'ultima riga "|faint|" (anche in doppio, con i nomi veri dei giocatori)', () => {
    const log = [...base, '|faint|p2a: B', '|faint|p1a: A', '|tie'];
    assert.equal(E.risolviPareggio(log).pop(), '|win|Didi');
    const inverso = [...base, '|faint|p1a: A', '|faint|p2a: B', '|tie'];
    assert.equal(E.risolviPareggio(inverso).pop(), '|win|Lu');
    // la forma "|tie|" con la barra finale si riconosce lo stesso
    assert.equal(E.risolviPareggio([...base, '|faint|p1a: A', '|faint|p2b: B', '|tie|']).pop(), '|win|Lu');
});

test('limite dei turni (nessun KO a chiudere): più Pokémon in piedi, poi più salute, poi una moneta sempre uguale', () => {
    // 1. p1 ha perso un Pokémon, p2 nessuno
    const kbase = [...base, '|faint|p1a: A', '|turn|2', '|turn|3'];
    assert.equal(E.vincitoreDelLog([...kbase, '|tie']).lato, 'p2');
    // 2. stessi Pokémon caduti: conta la salute rimasta
    const salute = [...base, '|switch|p1a: A|Garchomp, M|30/100', '|switch|p2a: B|Dragonite, M|80/100', '|turn|2', '|tie'];
    assert.equal(E.vincitoreDelLog(salute).lato, 'p2');
    const salute2 = [...base, '|switch|p1a: A|Garchomp, M|90/100', '|switch|p2a: B|Dragonite, M|80/100', '|-damage|p1a: A|10/100', '|turn|2', '|tie'];
    assert.equal(E.vincitoreDelLog(salute2).lato, 'p2', 'il danno più recente sostituisce la salute vista prima');
    // 3. tutto uguale: sempre lo stesso lato per lo stesso log, e comunque un vincitore
    const uguali = [...base, '|turn|2', '|tie'];
    const primo = E.vincitoreDelLog(uguali);
    assert.ok(primo.lato === 'p1' || primo.lato === 'p2');
    for (let i = 0; i < 3; i++) assert.equal(E.vincitoreDelLog(uguali).lato, primo.lato);
});

test('un nome mancante nel log non rompe nulla ("Player 1"/"Player 2")', () => {
    const r = E.risolviPareggio(['|faint|p1a: A', '|tie']);
    assert.equal(r[1], '|win|Player 1');
});

// ---------- collegamenti ----------
test('server e motori usano la regola: righePubbliche, fine del set, salvataggio del match, motore locale e online', () => {
    const partita = leggi('functions/partita.js');
    assert.match(partita, /const EsitoSet = require\('\.\/esito-set'\);/);
    assert.match(partita, /return EsitoSet\.risolviPareggio\(out\);/, 'il log pubblico (e quindi il replay) non ha più pareggi');
    assert.match(partita, /const vincitore = EsitoSet\.vincitoreDelLog\(righe\)\.lato/, 'il set ha sempre un vincitore');
    assert.match(partita, /vincitore = EsitoSet\.vincitoreDelLog\(righe\)\.lato;[^]*if \(vincitore === 'p1'\) s1\+\+;/, 'un set chiuso in pareggio prima di questa regola si recupera dal suo log');
    assert.match(leggi('functions/statistiche-set.js'), /EsitoSet\.risolviPareggio\(grezze\)/);
    assert.match(leggi('docs/motore-battaglia.js'), /import '\.\/esito-set\.js'/);
    assert.match(leggi('docs/motore-battaglia.js'), /self\.EsitoSet\.risolviPareggio\(\[\.\.\.this\.righeLog, \.\.\.righe\]\)/);
    assert.match(leggi('docs/motore-online.js'), /self\.EsitoSet\.risolviPareggio\(\[\.\.\.this\.righeLog, \.\.\.righe\]\)/);
    assert.doesNotMatch(leggi('docs/motore-battaglia.js') + leggi('docs/motore-online.js'), /vincitore: null/, 'i motori non emettono più "fine" senza vincitore');
});
