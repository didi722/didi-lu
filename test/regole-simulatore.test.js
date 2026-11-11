'use strict';
// Due situazioni segnalate come "bug del simulatore", controllate con il simulatore vero (docs/pkmn-sim.js, lo stesso di Showdown):
//
//   1. Un Pokémon usa Protect al turno 1. Al turno 2 Whimsicott (Prankster) usa Encore su di lui: Protect parte "nel suo turno di
//      velocità" e non con la priorità di Protect. È così in Showdown: Encore cambia la mossa scelta, ma la mossa forzata usa la
//      priorità di quella che il bersaglio aveva scelto (il codice del simulatore lo scrive apposta: `move.priority = priorità
//      della mossa scelta`). Se il bersaglio aveva scelto un attacco, Protect esce dove sarebbe uscito l'attacco.
//   2. Fake Out al secondo turno in campo, dopo un primo turno passato a "flinchare": fallisce ("Fake Out only works on your first
//      turn out"). Il turno in cui si è perso per un tentennamento conta come turno in campo.
//
// Se si aggiorna docs/pkmn-sim.js e uno di questi test cambia, è cambiato il comportamento ufficiale di Showdown: va deciso a mano.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim, giocaPartita } = require('./ayuda-sim.js');

const FORMATO = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod';
const scelte = copioni => lato => ({ tipo: 'script', gestore: (r, n) => copioni[lato][n - 1] || (r.forceSwitch ? 'pass' : 'move 2, move 2') });
const mossa = (righe, turno, regex) => {
    const da = righe.indexOf(`|turn|${turno}`);
    const a = righe.indexOf(`|turn|${turno + 1}`);
    return righe.slice(da, a < 0 ? undefined : a).findIndex(r => regex.test(r));
};

test('Encore su un Pokémon che aveva scelto un\'altra mossa: Protect esce con la priorità della mossa scelta (come in Showdown)', async () => {
    const { sim } = await caricaSim();
    const whimsicott = 'Whimsicott @ Leftovers\nAbility: Prankster\nLevel: 50\n- Encore\n- Tackle\n- Protect\n- Moonblast';
    const mienfoo = 'Mienfoo @ Leftovers\nAbility: Inner Focus\nLevel: 50\n- Fake Out\n- Tackle\n- Protect\n- Drain Punch';
    const e = await giocaPartita({
        sim, formato: FORMATO, team1: `${whimsicott}\n\n${mienfoo}`, team2: `${mienfoo}\n\n${whimsicott}`, maxTurni: 3,
        agente1: scelte({ p1: ['team 12', 'move 2 1, move 1 1', 'move 1 1, move 2 1'] })('p1'),
        // turno 1: Protect con tutti e due; turno 2: Mienfoo sceglie Tackle (non Protect)
        agente2: scelte({ p2: ['team 12', 'move 3, move 3', 'move 2 1, move 4 1'] })('p2')
    });
    const t2 = e.righe.slice(e.righe.indexOf('|turn|2'), e.righe.indexOf('|turn|3'));
    const posizione = regex => t2.findIndex(r => regex.test(r));
    const encore = posizione(/^\|move\|p1a: Whimsicott\|Encore\|p2a: Mienfoo/);
    const protect = posizione(/^\|move\|p2a: Mienfoo\|Protect/);
    const attaccoAlleato = posizione(/^\|move\|p1b: Mienfoo\|Tackle\|p2a: Mienfoo/);
    assert.ok(encore >= 0 && protect >= 0 && attaccoAlleato >= 0, t2.join('\n'));
    assert.ok(encore < protect, 'Encore (Prankster, +1) parte prima del bersaglio');
    assert.ok(attaccoAlleato < protect, 'la Protect forzata non ha la priorità +4: esce dopo l\'attacco dell\'alleato più veloce');
});

test('Fake Out al secondo turno in campo dopo un primo turno perso per un tentennamento: fallisce', async () => {
    const { sim } = await caricaSim();
    const mk = (abilita, spe) => `Mienfoo @ Leftovers\nAbility: ${abilita}\nLevel: 50\n${spe ? 'EVs: 252 Spe\n' : ''}- Fake Out\n- Tackle\n- Protect\n- Drain Punch\n\n` +
        `Whimsicott @ Leftovers\nAbility: Prankster\nLevel: 50\n- Tackle\n- Protect\n- Moonblast\n- Encore`;
    const e = await giocaPartita({
        sim, formato: FORMATO, team1: mk('Inner Focus', true), team2: mk('Regenerator', false), maxTurni: 3,
        agente1: scelte({ p1: ['team 12', 'move 1 1, move 1 1', 'move 2 1, move 1 1'] })('p1'),
        agente2: scelte({ p2: ['team 12', 'move 1 1, move 1 1', 'move 1 1, move 1 1'] })('p2')
    });
    const t1 = e.righe.slice(e.righe.indexOf('|turn|1'), e.righe.indexOf('|turn|2'));
    const t2 = e.righe.slice(e.righe.indexOf('|turn|2'), e.righe.indexOf('|turn|3'));
    assert.ok(t1.includes('|cant|p2a: Mienfoo|flinch'), 'al turno 1 il Mienfoo avversario tentenna');
    assert.ok(t2.includes('|move|p2a: Mienfoo|Fake Out||[still]'), 'al turno 2 prova Fake Out');
    assert.ok(t2.includes('|-hint|Fake Out only works on your first turn out.'), 'il simulatore spiega perché');
    assert.ok(t2.includes('|-fail|p2a: Mienfoo'), 'e fallisce');
    assert.ok(!t2.some(r => /^\|cant\|p1a: Mienfoo\|flinch/.test(r)), 'il mio Mienfoo non tentenna');
});

// 3. Armor Tail (e Queenly Majesty, Dazzling) annulla le mosse prioritarie dirette a chi le ha o al suo compagno, e lo fa vedere con una riga
//    "|cant|<chi ha l'abilità>|ability: Armor Tail|<mossa>|[of] <chi l'ha usata>": la CPU impara l'abilità da lì (cpu-ia.js, case 'cant')
test('Armor Tail: Fake Out contro il Farigiraf o contro il suo compagno viene annullato e la riga del log nomina chi ha l\'abilità; la CPU la impara', async () => {
    const { sim } = await caricaSim();
    const IA = require('../docs/cpu-ia.js');
    const mienfoo = 'Mienfoo @ Leftovers\nAbility: Inner Focus\nLevel: 50\n- Fake Out\n- Tackle\n- Protect\n- Drain Punch\n\n' +
        'Whimsicott @ Leftovers\nAbility: Prankster\nLevel: 50\n- Tackle\n- Protect\n- Moonblast\n- Encore';
    const farigiraf = 'Farigiraf @ Leftovers\nAbility: Armor Tail\nLevel: 50\n- Psychic\n- Protect\n- Hyper Voice\n- Trick Room\n\n' +
        'Garchomp @ Leftovers\nAbility: Rough Skin\nLevel: 50\n- Dragon Claw\n- Protect\n- Earthquake\n- Rock Slide';
    // Mienfoo (p1a) usa Fake Out sul compagno di Farigiraf (p2b), poi nel turno 2 la CPU ha già visto l'abilità
    const e = await giocaPartita({
        sim, formato: FORMATO, team1: mienfoo, team2: farigiraf, maxTurni: 3,
        agente1: scelte({ p1: ['team 12', 'move 1 2, move 2'] })('p1'),
        agente2: scelte({ p2: ['team 12', 'move 2, move 2'] })('p2')
    });
    const t1 = e.righe.slice(e.righe.indexOf('|turn|1'), e.righe.indexOf('|turn|2'));
    const riga = t1.find(r => /^\|cant\|/.test(r) && /Armor Tail/.test(r));
    assert.ok(riga, 'log: ' + e.righe.slice(0, 60).join(' ; '));
    assert.match(riga, /^\|cant\|p2a: Farigiraf\|ability: Armor Tail\|Fake Out\|\[of\] p1a: Mienfoo$/, 'il primo nome è chi ha l\'abilità, non chi ha attaccato');
    assert.ok(!t1.some(r => /^\|-damage\|p2b: Garchomp/.test(r) && /Fake Out/.test(t1[t1.indexOf(r) - 1] || '')), 'nessun danno da Fake Out');
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: () => 0.5 });
    ia.osserva(e.righe.slice(0, e.righe.indexOf('|turn|2') + 1));
    assert.equal(ia.lati.p2.mons.Farigiraf.abilita, 'armortail');
});
