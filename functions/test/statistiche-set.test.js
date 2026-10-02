'use strict';
// Prove del parser delle statistiche (statistiche-set.js) contro il simulatore vero.
//
//   cd functions && node --test test/
//
// Gli scenari usano Shedinja (1 PS: muore a qualsiasi danno indiretto) per vedere a chi
// viene attribuito ogni tipo di KO. Poi si rigiocano partite casuali e si controlla che
// i numeri del parser coincidano con quelli del motore.
const test = require('node:test');
const assert = require('node:assert/strict');
const PS = require('pokemon-showdown');
const { righePubbliche } = require('../partita');
const { analizzaSet } = require('../statistiche-set');

let RandomPlayerAI = null;
try { ({ RandomPlayerAI } = require('pokemon-showdown/dist/sim/tools/random-player-ai')); } catch (e) { /* test casuali saltati */ }

// ---------- scenari scriptati ----------
function gioca({ formato = 'gen9customgame', t1, t2, s1 = [], s2 = [], turni = 4, portati }) {
    const b = new PS.Battle({ formatid: formato, seed: [1, 2, 3, 4] });
    b.setPlayer('p1', { name: 'Didi', team: PS.Teams.pack(PS.Teams.import(t1)) });
    b.setPlayer('p2', { name: 'Lu', team: PS.Teams.pack(PS.Teams.import(t2)) });
    const coda = { p1: s1.slice(), p2: s2.slice() };
    let fatti = 0;
    while (!b.ended && fatti < turni) {
        const scelte = {};
        let anteprima = false;
        for (const l of ['p1', 'p2']) {
            const r = b[l].activeRequest;
            if (!r || r.wait) continue;
            if (r.teamPreview) { scelte[l] = 'default'; anteprima = true; }
            else if (coda[l].length) scelte[l] = coda[l].shift();
            else if (r.forceSwitch) {
                const n = r.side.pokemon.findIndex((p, i) => i >= r.forceSwitch.length && !p.condition.endsWith(' fnt')) + 1;
                scelte[l] = r.forceSwitch.map(f => (f && n ? `switch ${n}` : 'pass')).join(', ');
            } else scelte[l] = r.active.map(() => 'move 1').join(', ');
        }
        if (!anteprima) fatti++;
        for (const [l, s] of Object.entries(scelte)) assert.ok(b.choose(l, s), `scelta rifiutata ${l}: ${s}`);
    }
    return analizzaSet(righePubbliche(b.log), { debug: true, portati });
}

const set = (nome, ab, mosse, { item = 'Leftovers', livello = 50 } = {}) =>
    `${nome} @ ${item}\nAbility: ${ab}\nLevel: ${livello}\n${mosse.map(m => '- ' + m).join('\n')}`;
const shedinja = (mosse, item = 'Leftovers') => set('Shedinja', 'Wonder Guard', mosse, { item });
const blissey = (mosse, item = 'Leftovers') => set('Blissey', 'Natural Cure', mosse, { item });
const trova = (st, lato, specie) => st[lato].pokemon.find(p => p.specie === specie);

test('KO diretto: merito a chi ha usato la mossa', () => {
    const st = gioca({
        t1: set('Gengar', 'Cursed Body', ['Shadow Ball']),
        t2: shedinja(['Splash']),
        s1: ['move shadowball'], s2: ['move splash'], turni: 2
    });
    assert.equal(trova(st, 'p1', 'Gengar').koFatti, 1);
    assert.equal(trova(st, 'p1', 'Gengar').koDiretti, 1);
    assert.equal(st.vincitore, 'p1');
    assert.equal(st.p2.svenuti, 1);
});

test('Stealth Rock, Spikes: merito a chi li ha messi', () => {
    for (const mossa of ['stealthrock', 'spikes']) {
        const st = gioca({
            t1: set('Forretress', 'Sturdy', ['Stealth Rock', 'Spikes']),
            t2: blissey(['Softboiled']) + '\n\n' + shedinja(['Splash']),
            s1: [`move ${mossa}`], s2: ['move softboiled', 'switch 2'], turni: 2
        });
        const f = trova(st, 'p1', 'Forretress');
        assert.equal(f.koFatti, 1, mossa);
        assert.equal(f.koDiretti, 0, mossa);
    }
});

test('Toxic Spikes: il veleno di chi entra è di chi ha messo la trappola', () => {
    const st = gioca({
        t1: set('Garchomp', 'Rough Skin', ['Toxic Spikes']),
        t2: blissey(['Softboiled']) + '\n\n' + shedinja(['Splash']),
        s1: ['move toxicspikes'], s2: ['move softboiled', 'switch 2'], turni: 2
    });
    assert.equal(trova(st, 'p1', 'Garchomp').koFatti, 1);
});

test('Sandstorm: merito a chi ha creato il meteo', () => {
    const st = gioca({
        t1: set('Tyranitar', 'Sand Stream', ['Protect']),
        t2: blissey(['Softboiled']) + '\n\n' + shedinja(['Splash']),
        s1: ['move protect'], s2: ['switch 2'], turni: 1
    });
    assert.equal(trova(st, 'p1', 'Tyranitar').koFatti, 1);
});

test('Scottatura, veleno, Leech Seed, Curse: merito a chi li ha causati', () => {
    const casi = [
        ['Rotom-Heat', 'Levitate', 'Will-O-Wisp', 'willowisp'],
        ['Toxapex', 'Regenerator', 'Toxic', 'toxic'],
        ['Venusaur', 'Overgrow', 'Leech Seed', 'leechseed'],
        ['Gengar', 'Cursed Body', 'Curse', 'curse']
    ];
    for (const [specie, abilita, mossa, id] of casi) {
        const st = gioca({ t1: set(specie, abilita, [mossa]), t2: shedinja(['Splash']), s1: [`move ${id}`], s2: ['move splash'], turni: 2 });
        const p = trova(st, 'p1', specie);
        assert.equal(p.koFatti, 1, mossa);
        assert.equal(p.koDiretti, 0, mossa);
    }
});

test('Toxic Debris: la trappola è di chi è stato colpito, non di chi ha attaccato', () => {
    const st = gioca({
        t1: set('Glimmora', 'Toxic Debris', ['Splash'], { livello: 100 }),
        t2: blissey(['Body Slam']) + '\n\n' + shedinja(['Splash']),
        s1: ['move splash'], s2: ['move bodyslam', 'switch 2'], turni: 3
    });
    assert.equal(trova(st, 'p1', 'Glimmora').koFatti, 1);
    assert.equal(trova(st, 'p2', 'Blissey').koFatti, 0);
});

test('Beak Blast: la scottatura presa da chi attacca è di chi la causa (righe da un log vero)', () => {
    const st = analizzaSet([
        '|player|p1|Didi||', '|player|p2|Lu||',
        '|poke|p1|Eelektross, M|', '|poke|p2|Toucannon, F|', '|teamsize|p1|1', '|teamsize|p2|1', '|start',
        '|switch|p1a: Eelektross|Eelektross, M|100/100', '|switch|p2a: Toucannon|Toucannon, F|100/100', '|turn|1',
        '|-singleturn|p2a: Toucannon|move: Beak Blast',
        '|move|p1a: Eelektross|U-turn|p2a: Toucannon', '|-resisted|p2a: Toucannon', '|-damage|p2a: Toucannon|57/100',
        '|-status|p1a: Eelektross|brn',
        '|-damage|p1a: Eelektross|0 fnt|[from] brn', '|faint|p1a: Eelektross',
        '|win|Lu'
    ]);
    assert.equal(trova(st, 'p2', 'Toucannon').koFatti, 1);
    assert.equal(trova(st, 'p2', 'Toucannon').koDiretti, 0);
    assert.equal(st.vincitore, 'p2');
});

test('Flame Orb e Toxic Orb: chi si avvelena da solo non dà meriti', () => {
    const st = analizzaSet([
        '|player|p1|Didi||', '|player|p2|Lu||',
        '|poke|p1|Conkeldurr|', '|poke|p2|Uxie|', '|teamsize|p1|1', '|teamsize|p2|1', '|start',
        '|switch|p1a: Conkeldurr|Conkeldurr, M|100/100', '|switch|p2a: Uxie|Uxie|100/100', '|turn|1',
        '|move|p2a: Uxie|Foul Play|p1a: Conkeldurr', '|-damage|p1a: Conkeldurr|20/100',
        '|-status|p1a: Conkeldurr|brn|[from] item: Flame Orb',
        '|-damage|p1a: Conkeldurr|0 fnt|[from] brn', '|faint|p1a: Conkeldurr', '|win|Lu'
    ]);
    assert.equal(trova(st, 'p2', 'Uxie').koFatti, 0);
    assert.equal(trova(st, 'p1', 'Conkeldurr').svenuto, true);
});

test('Fuoco amico: il merito non va a chi colpisce il proprio compagno', () => {
    const st = analizzaSet([
        '|player|p1|Didi||', '|player|p2|Lu||',
        '|poke|p1|Plusle|', '|poke|p1|Swalot|', '|poke|p2|Hitmonlee|', '|poke|p2|Garchomp|', '|teamsize|p1|2', '|teamsize|p2|2', '|start',
        '|switch|p1a: Plusle|Plusle, F|100/100', '|switch|p1b: Swalot|Swalot, M|100/100',
        '|switch|p2a: Hitmonlee|Hitmonlee, M|100/100', '|switch|p2b: Garchomp|Garchomp, M|100/100', '|turn|1',
        '|move|p2b: Garchomp|Earthquake|p1b: Swalot|[spread] p2a,p1a,p1b',
        '|-damage|p2a: Hitmonlee|0 fnt', '|-damage|p1a: Plusle|0 fnt', '|-damage|p1b: Swalot|0 fnt',
        '|faint|p2a: Hitmonlee', '|faint|p1a: Plusle', '|faint|p1b: Swalot', '|win|Lu'
    ]);
    const g = trova(st, 'p2', 'Garchomp');
    assert.equal(g.koFatti, 2);          // Plusle e Swalot, non il suo Hitmonlee
    assert.equal(st.p2.svenuti, 1);
    assert.equal(st.p1.svenuti, 2);
});

test('Rocky Helmet, Rough Skin, Aftermath: merito a chi li ha', () => {
    const rough = gioca({
        t1: shedinja(['Shadow Sneak']), t2: set('Garchomp', 'Rough Skin', ['Splash']),
        s1: ['move shadowsneak'], s2: ['move splash'], turni: 2
    });
    assert.equal(trova(rough, 'p2', 'Garchomp').koFatti, 1);
    assert.equal(trova(rough, 'p2', 'Garchomp').koDiretti, 0);

    const aftermath = gioca({
        t1: shedinja(['Shadow Sneak']), t2: set('Drifloon', 'Aftermath', ['Splash'], { livello: 5 }),
        s1: ['move shadowsneak'], s2: ['move splash'], turni: 2
    });
    assert.equal(trova(aftermath, 'p1', 'Shedinja').koFatti, 1);
    assert.equal(trova(aftermath, 'p2', 'Drifloon').koFatti, 1);   // l'ha portato via con sé
});

test('Contraccolpo e Life Orb: nessun merito', () => {
    // (niente Rough Skin sul bersaglio: Brave Bird è a contatto e il merito andrebbe a lui)
    const casi = [
        [['Brave Bird'], 'Leftovers', set('Blissey', 'Natural Cure', ['Splash'])],
        [['Shadow Ball'], 'Life Orb', set('Garchomp', 'Sand Veil', ['Splash'])]
    ];
    for (const [mosse, item, avversario] of casi) {
        const st = gioca({
            t1: shedinja(mosse, item), t2: avversario,
            s1: [`move ${mosse[0].toLowerCase().replace(/ /g, '')}`], s2: ['move splash'], turni: 2
        });
        assert.equal(trova(st, 'p1', 'Shedinja').svenuto, true, mosse[0]);
        assert.equal(st.p2.pokemon[0].koFatti, 0, mosse[0]);
    }
});

test('Explosion: il bersaglio è merito di chi esplode, lui no', () => {
    const st = gioca({
        t1: set('Golem', 'Sturdy', ['Explosion']), t2: blissey(['Softboiled']),
        s1: ['move explosion'], s2: ['move softboiled'], turni: 2
    });
    assert.equal(trova(st, 'p1', 'Golem').koFatti, 1);
    assert.equal(trova(st, 'p1', 'Golem').svenuto, true);
    assert.equal(trova(st, 'p2', 'Blissey').koFatti, 0);
});

test('Destiny Bond e Perish Song', () => {
    const db = gioca({
        t1: set('Gengar', 'Cursed Body', ['Destiny Bond'], { item: 'Focus Sash' }), t2: shedinja(['Shadow Sneak']),
        s1: ['move destinybond'], s2: ['move shadowsneak'], turni: 3
    });
    assert.equal(trova(db, 'p2', 'Shedinja').koFatti, 1);   // ha colpito Gengar
    assert.equal(trova(db, 'p1', 'Gengar').koFatti, 1);     // e Gengar se lo è portato via

    const perish = gioca({
        t1: set('Lapras', 'Water Absorb', ['Perish Song', 'Protect']), t2: blissey(['Softboiled']),
        s1: ['move perishsong', 'move protect', 'move protect', 'move protect'], s2: ['move softboiled'], turni: 8
    });
    assert.equal(trova(perish, 'p1', 'Lapras').koFatti, 1);
    assert.equal(perish.p1.svenuti, 1);
    assert.equal(perish.p2.svenuti, 1);
});

test('Future Sight e Fire Spin: KO tardivi attribuiti a chi li ha lanciati', () => {
    const futuro = gioca({
        t1: set('Slowking', 'Regenerator', ['Future Sight', 'Protect']), t2: set('Pikachu', 'Static', ['Splash'], { livello: 5 }),
        s1: ['move futuresight', 'move protect', 'move protect', 'move protect'], s2: ['move splash'], turni: 5
    });
    assert.equal(trova(futuro, 'p1', 'Slowking').koFatti, 1);

    const trappola = gioca({
        t1: set('Charizard', 'Blaze', ['Fire Spin', 'Protect']), t2: set('Pikachu', 'Static', ['Splash'], { livello: 5, item: 'Focus Sash' }),
        s1: ['move firespin'], s2: ['move splash'], turni: 3
    });
    assert.equal(trova(trappola, 'p1', 'Charizard').koFatti, 1);
});

test('Revival Blessing: chi torna in vita non è più KO', () => {
    const st = gioca({
        t1: shedinja(['Splash']) + '\n\n' + set('Blissey', 'Natural Cure', ['Revival Blessing', 'Splash']),
        t2: set('Garchomp', 'Rough Skin', ['Shadow Ball']),
        s1: ['move splash', 'switch 2', 'move revivalblessing', 'switch 2', 'move splash'], s2: ['move shadowball'], turni: 5
    });
    assert.equal(trova(st, 'p1', 'Shedinja').svenuto, false);
    assert.equal(trova(st, 'p2', 'Garchomp').koFatti, 1);      // il KO c'è stato
    assert.equal(st.p1.svenuti, 0);
});

test('Illusion: i meriti vanno a chi c\'era davvero', () => {
    const st = gioca({
        t1: set('Zoroark', 'Illusion', ['Splash']) + '\n\n' + set('Blissey', 'Natural Cure', ['Splash']),
        t2: set('Garchomp', 'Rough Skin', ['Earthquake']),
        s1: ['move splash'], s2: ['move earthquake'], turni: 2
    });
    const zoroark = trova(st, 'p1', 'Zoroark');
    assert.equal(zoroark.portato, true);
    assert.equal(zoroark.titolare, true);
    assert.equal(zoroark.svenuto, true);
    assert.equal(trova(st, 'p1', 'Blissey').portato, false);   // fingeva di essere lui
});

test('Ultimo rimasto: chi resta solo, vinca o perda', () => {
    const st = gioca({
        t1: set('Golem', 'Sturdy', ['Explosion']) + '\n\n' + set('Blissey', 'Natural Cure', ['Splash']),
        t2: set('Garchomp', 'Rough Skin', ['Earthquake']),
        s1: ['move explosion'], s2: ['move earthquake'], turni: 4
    });
    // Golem esplode (KO), resta solo Blissey
    assert.equal(trova(st, 'p1', 'Blissey').ultimo, true);
    assert.equal(trova(st, 'p1', 'Golem').ultimo, false);
});

test('Sceso in campo: chi è stato solo portato non conta come presenza', () => {
    const st = gioca({
        t1: set('Golem', 'Sturdy', ['Explosion']) + '\n\n' + set('Blissey', 'Natural Cure', ['Splash']) + '\n\n' + set('Shuckle', 'Sturdy', ['Splash']),
        t2: set('Garchomp', 'Rough Skin', ['Earthquake']),
        s1: ['move explosion'], s2: ['move earthquake'], turni: 2,
        portati: { p1: ['Golem', 'Blissey', 'Shuckle'] }
    });
    for (const specie of ['Golem', 'Blissey']) assert.equal(trova(st, 'p1', specie).sceso, true, specie);
    const shuckle = trova(st, 'p1', 'Shuckle');
    assert.equal(shuckle.portato, true);       // dichiarato portato dal server...
    assert.equal(shuckle.sceso, false);        // ...ma non è mai entrato
    assert.equal(trova(st, 'p2', 'Garchomp').sceso, true);
    assert.equal(st.v, 2);
});

// ---------- partite casuali: i numeri devono coincidere con quelli del motore ----------
const FORMATI = [
    { id: 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod', random: 'gen9randomdoublesbattle' },
    { id: 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod', random: 'gen9randombattle' }
];

async function partitaCasuale(n) {
    const f = FORMATI[n % FORMATI.length];
    const seed = [n * 7 + 1, n * 13 + 2, n * 17 + 3, n * 19 + 4];
    const stream = new PS.BattleStream();
    const flussi = PS.getPlayerStreams(stream);
    const t1 = PS.Teams.pack(PS.Teams.generate(f.random, { seed: seed.map(x => x + 11) }));
    const t2 = PS.Teams.pack(PS.Teams.generate(f.random, { seed: seed.map(x => x + 23) }));
    void new RandomPlayerAI(flussi.p1, { seed: seed.map(x => x + 5) }).start();
    void new RandomPlayerAI(flussi.p2, { seed: seed.map(x => x + 7) }).start();
    (async () => { for await (const _ of flussi.omniscient) { /* scarta */ } })();
    await flussi.omniscient.write(`>start ${JSON.stringify({ formatid: f.id, seed })}\n>player p1 ${JSON.stringify({ name: 'Didi', team: t1 })}\n>player p2 ${JSON.stringify({ name: 'Lu', team: t2 })}`);
    for (let i = 0; i < 5000 && !(stream.battle && stream.battle.ended); i++) await new Promise(r => setImmediate(r));
    return stream.battle;
}

test('Partite casuali: KO, portati, vincitore e ultimo coincidono col motore', { skip: !RandomPlayerAI && 'random-player-ai non disponibile' }, async () => {
    for (let n = 0; n < 16; n++) {
        const b = await partitaCasuale(n);
        assert.ok(b && b.ended, `partita ${n} non finita`);
        const portati = lato => b[lato].pokemon.map(p => p.set.species);
        const st = analizzaSet(righePubbliche(b.log), { portati: { p1: portati('p1'), p2: portati('p2') } });
        const cosa = `partita ${n}`;
        assert.equal(st.turni, b.turn, cosa);
        assert.equal(st.vincitore ? st[st.vincitore].nome : '', b.winner || '', cosa);
        for (const lato of ['p1', 'p2']) {
            const motore = b[lato].pokemon;
            assert.equal(st[lato].portati, motore.length, `${cosa} portati ${lato}`);
            assert.equal(st[lato].svenuti, motore.filter(p => p.fainted).length, `${cosa} svenuti ${lato}`);
            const visti = st[lato].pokemon.filter(p => p.portato);
            assert.equal(visti.length, motore.length, `${cosa} Pokémon portati ${lato}`);
            const titolari = st[lato].pokemon.filter(p => p.titolare).length;
            assert.ok(titolari >= 1 && titolari <= 2, `${cosa} titolari ${lato}`);
            assert.ok(st[lato].pokemon.filter(p => p.ultimo).length <= 1, `${cosa} ultimo ${lato}`);
            const vivi = st[lato].portati - st[lato].svenuti;
            if (vivi === 1) assert.ok(st[lato].pokemon.some(p => p.ultimo), `${cosa} manca l'ultimo ${lato}`);
        }
        // i meriti non possono superare i KO (a meno di Revival Blessing)
        const rianimati = b.log.some(r => /Revival Blessing/.test(r));
        if (!rianimati) {
            const crediti = lato => st[lato].pokemon.reduce((a, p) => a + p.koFatti, 0);
            assert.ok(crediti('p1') <= st.p2.svenuti && crediti('p2') <= st.p1.svenuti, `${cosa} troppi meriti`);
        }
    }
});

test('Il risultato è fatto di soli valori semplici (Firebase non accetta undefined)', () => {
    const st = gioca({
        t1: set('Gengar', 'Cursed Body', ['Shadow Ball']), t2: shedinja(['Splash']),
        s1: ['move shadowball'], s2: ['move splash'], turni: 2
    });
    const json = JSON.stringify(st, (k, v) => (v === undefined ? '__UNDEFINED__' : v));
    assert.ok(!json.includes('__UNDEFINED__'));
    assert.deepEqual(JSON.parse(JSON.stringify(st)), st);
});

test('Un log vuoto o rovinato non rompe nulla', () => {
    assert.doesNotThrow(() => analizzaSet(''));
    assert.doesNotThrow(() => analizzaSet(['|faint|p1a: Boh', '|-damage|p9z|0 fnt', 'riga senza barra', '|switch|']));
    const vuoto = analizzaSet([]);
    assert.equal(vuoto.vincitore, '');
    assert.equal(vuoto.p1.pokemon.length, 0);
});
