'use strict';
// Il controllo di un team per generazione è UNO solo (controllo-team.js): lo usano il Box quando salva, il simulatore sul sito e il server
// quando si avvia la partita. Prima il simulatore e il server si fidavano del segno "Future" che Showdown mette nella Gen 8 su tutto
// ciò che non c'è in Spada e Scudo, e rifiutavano un team con le forme di Hisui (che sono Gen 8) che il Box aveva accettato.
// Qui: le forme di Hisui in un formato "fino alla Gen 8", la stessa risposta da Box, simulatore e server, e il collegamento dei tre.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const CT = require('../docs/controllo-team.js');
const DatiGen = require('../docs/dati-gen.js');
const { caricaSim, caricaTeamSito } = require('./ayuda-sim.js');

const RADICE = path.join(__dirname, '..');
const leggi = rel => fs.readFileSync(path.join(RADICE, rel), 'utf8');
const delta = gen => DatiGen.carica(gen, url => JSON.parse(fs.readFileSync(path.join(RADICE, 'docs', url), 'utf8')));
const reg = (gen, extra = {}) => ({ genRuleValue: gen, genRuleType: 'up_to', strutturaSito: 'custom', baseTier: 'OU', ...extra });

const HISUI = `Samurott-Hisui @ Leftovers
Ability: Sharpness
Level: 100
- Ceaseless Edge
- Razor Shell

Sneasler @ Leftovers
Ability: Poison Touch
Level: 100
- Dire Claw
- Close Combat

Wyrdeer @ Leftovers
Ability: Intimidate
Level: 100
- Psyshield Bash
- Double-Edge

Typhlosion-Hisui @ Leftovers
Ability: Frisk
Level: 100
- Eruption
- Shadow Ball

Kleavor @ Leftovers
Ability: Sharpness
Level: 100
- Stone Axe
- X-Scissor

Ursaluna @ Leftovers
Ability: Guts
Level: 100
- Facade
- Headlong Rush`;

// Il server si carica con il simulatore del sito al posto del pacchetto "pokemon-showdown" (che non è installato nei test)
let server = null;
async function caricaServer() {
    if (!server) {
        const { sim } = await caricaSim();
        const originale = Module._load;
        Module._load = function (richiesta, ...resto) {
            if (richiesta === 'pokemon-showdown') return sim;
            return originale.call(this, richiesta, ...resto);
        };
        try { server = require('../functions/partita.js'); } finally { Module._load = originale; }
    }
    return server;
}

test('le forme di Hisui e i Pokémon di Leggende Arceus sono Gen 8: un formato "fino alla Gen 8" li accetta (sito, simulatore e server)', async () => {
    const { controllaTeam } = await caricaTeamSito();
    const { controllaTeam: delServer } = await caricaServer();
    assert.deepEqual(controllaTeam(HISUI, reg(8), await delta(8)), [], 'simulatore sul sito');
    assert.deepEqual(await delServer(HISUI, reg(8)), [], 'server');
    assert.deepEqual(controllaTeam(HISUI, reg(9), null), [], 'in Gen 9 non cambia nulla');
});

test('prima della Gen 8 quegli stessi Pokémon, abilità e mosse non esistono: il team si rifiuta, con il motivo', async () => {
    const { controllaTeam } = await caricaTeamSito();
    const g7 = controllaTeam(HISUI, reg(7), await delta(7));
    assert.ok(g7.includes('Samurott-Hisui does not exist in Gen 7 (it first appears in Gen 8).'), g7.join('\n'));
    assert.ok(g7.includes('Sneasler does not exist in Gen 7 (it first appears in Gen 8).'));
    assert.ok(g7.includes('Samurott-Hisui: the ability Sharpness does not exist in Gen 7.'));
    assert.ok(g7.includes('Wyrdeer: Psyshield Bash does not exist in Gen 7.'));
    assert.ok(g7.includes('Sneasler: Dire Claw does not exist in Gen 7.'));
});

test('un Pokémon di Gen 9 in un formato fino alla Gen 8 si rifiuta; negli Anything Goes la specie non è limitata (abilità e mosse sì)', async () => {
    const { controllaTeam } = await caricaTeamSito();
    const squadra = 'Iron Valiant @ Leftovers\nAbility: Quark Drive\nLevel: 100\n- Close Combat';
    const normale = controllaTeam(squadra, reg(8), await delta(8));
    assert.ok(normale.includes('Iron Valiant does not exist in Gen 8 (it first appears in Gen 9).'), normale.join('\n'));
    assert.ok(normale.includes('Iron Valiant: the ability Quark Drive does not exist in Gen 8.'));
    const libero = controllaTeam(squadra, reg(8, { strutturaSito: 'anything_goes' }), await delta(8));
    assert.ok(!libero.some(p => p.includes('first appears')), libero.join('\n'));
    assert.ok(libero.includes('Iron Valiant: the ability Quark Drive does not exist in Gen 8.'));
});

test('le altre regole del simulatore restano: livello, Megapietre e Cristalli Z senza meccaniche generazionali, mosse e strumenti di generazioni dopo', async () => {
    const { controllaTeam } = await caricaTeamSito();
    assert.deepEqual(controllaTeam('Garchomp\nAbility: Rough Skin\nLevel: 50\n- Earthquake', reg(9), null), ['Garchomp is level 50 instead of 100.']);
    assert.deepEqual(controllaTeam('Garchomp\nAbility: Rough Skin\nLevel: 50\n- Earthquake', reg(9, { strutturaSito: 'vgc' }), null), []);
    assert.deepEqual(controllaTeam('Charizard @ Charizardite X\nAbility: Blaze\nLevel: 100\n- Flare Blitz', reg(9), null),
        ['Charizard holds Charizardite X, but this format has no generational mechanics.']);
    assert.deepEqual(controllaTeam('Charizard @ Charizardite X\nAbility: Blaze\nLevel: 100\n- Flare Blitz', reg(9, { generationalMechanics: true }), null), []);
    const g4 = controllaTeam('Mawile @ Leftovers\nAbility: Sheer Force\nLevel: 100\n- Play Rough\n- Iron Head\n\nGarchomp @ Heavy-Duty Boots\nAbility: Sand Veil\nLevel: 100\n- Earthquake', reg(4), await delta(4));
    assert.deepEqual(g4, [
        'Mawile: the ability Sheer Force does not exist in Gen 4.',
        'Mawile: Play Rough does not exist in Gen 4.',
        'Garchomp: Heavy-Duty Boots does not exist in Gen 4.'
    ]);
    assert.deepEqual(controllaTeam('Alakazam\nAbility: Magic Guard\nLevel: 100\n- Psychic', reg(2), await delta(2)), [], 'Gen 1-2: niente abilità');
    assert.deepEqual(controllaTeam('Garchomp\nAbility: Rough Skin\nLevel: 100\n- Earthquake', reg(4), await delta(4)), ['Garchomp: Rough Skin is not one of its abilities in Gen 4.'], 'l\'abilità deve essere una di quelle della specie di allora');
    assert.deepEqual(controllaTeam('', reg(9), null), ['The team is empty or unreadable']);
});

// ---------- Box, simulatore e server danno la stessa risposta ----------
// Il Box legge i dati di Showdown del browser (pokedex.js, moves.js...: senza il campo "gen" che ha il simulatore): si ricostruiscono così
function fontiDelBox(Dex) {
    const copia = (voce, campi) => { const o = {}; for (const c of campi) if (voce[c] !== undefined) o[c] = voce[c]; return o; };
    const id = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const pokedex = {}, mosse = {}, abilita = {}, strumenti = {};
    for (const s of Dex.species.all()) if (s.exists) pokedex[s.id] = copia(s, ['num', 'name', 'baseSpecies', 'forme', 'battleOnly', 'abilities']);
    for (const m of Dex.moves.all()) if (m.exists) mosse[id(m.name)] = copia(m, ['num', 'name', 'isMax', 'isZ']);   // il Box li cerca per nome (Hidden Power Bug...)
    for (const a of Dex.abilities.all()) if (a.exists) abilita[a.id] = copia(a, ['num', 'name']);
    for (const i of Dex.items.all()) if (i.exists) strumenti[i.id] = copia(i, ['num', 'name', 'gen', 'megaStone', 'zMove']);
    return {
        specie: nome => pokedex[id(nome)] || null,
        abilita: nome => abilita[id(nome)] || null,
        strumento: nome => strumenti[id(nome)] || null,
        mossa: nome => mosse[id(nome)] || null,
        base: sp => (sp.battleOnly || /^(Mega|Primal)/.test(sp.forme || '')) ? (pokedex[id(Array.isArray(sp.battleOnly) ? sp.battleOnly[0] : (sp.battleOnly || sp.baseSpecies))] || sp) : null
    };
}

test('Box (dati del browser) e simulatore (Dex) dicono la stessa cosa su ogni specie, mossa, abilità e strumento, in ogni generazione', async () => {
    const { sim } = await caricaSim();
    const Dex = sim.Dex;
    const box = fontiDelBox(Dex), simu = CT.fontiDaDex(Dex);
    let controlli = 0;
    const esami = [];
    for (const s of Dex.species.all().filter(x => x.exists && x.num > 0)) esami.push({ specie: s.name });
    for (const m of Dex.moves.all().filter(x => x.exists && !x.isMax && !x.isZ)) esami.push({ specie: 'Garchomp', mosse: [m.name] });
    for (const a of Dex.abilities.all().filter(x => x.exists)) esami.push({ specie: 'Garchomp', abilita: a.name });
    for (const i of Dex.items.all().filter(x => x.exists)) esami.push({ specie: 'Garchomp', strumento: i.name });
    for (const gen of [1, 3, 4, 5, 6, 7, 8, 9]) {
        for (const e of esami) {
            const set = { nome: e.specie, specie: e.specie, abilita: e.abilita, strumento: e.strumento, mosse: e.mosse || [] };
            const regole = { gen, delta: null, meccaniche: true };
            const a = CT.problemiDelSet(set, regole, box), b = CT.problemiDelSet(set, regole, simu);
            if (a.join('|') !== b.join('|')) assert.fail(`Gen ${gen}, ${JSON.stringify(e)}: Box ${JSON.stringify(a)} ≠ simulatore ${JSON.stringify(b)}`);
            controlli++;
        }
    }
    assert.ok(controlli > 20000, `${controlli} controlli`);
});

test('simulatore sul sito e server: lo stesso team dà gli stessi problemi, in ogni generazione', async () => {
    const { controllaTeam } = await caricaTeamSito();
    const { controllaTeam: delServer } = await caricaServer();
    const squadre = [
        HISUI,
        'Mawile @ Mawilite\nAbility: Sheer Force\nLevel: 100\n- Play Rough\n- Iron Head\n\nGarchomp @ Heavy-Duty Boots\nAbility: Sand Veil\nLevel: 100\n- Earthquake',
        'Iron Valiant @ Booster Energy\nAbility: Quark Drive\nLevel: 50\n- Close Combat\n- Tera Blast',
        'Gengar @ Leftovers\nAbility: Levitate\nLevel: 100\n- Shadow Ball\n\nBlissey @ Eviolite\nAbility: Natural Cure\nLevel: 100\n- Soft-Boiled',
        'Rayquaza @ Life Orb\nAbility: Delta Stream\nLevel: 100\n- Dragon Ascent'
    ];
    for (const gen of [2, 3, 4, 5, 6, 7, 8, 9]) {
        for (const struttura of ['custom', 'vgc', 'anything_goes']) {
            for (const meccaniche of [false, true]) {
                const r = reg(gen, { strutturaSito: struttura, generationalMechanics: meccaniche });
                for (const t of squadre) {
                    const sito = controllaTeam(t, r, await delta(gen));
                    const srv = await delServer(t, r);
                    assert.deepEqual(srv, sito, `Gen ${gen} ${struttura} ${meccaniche ? 'con' : 'senza'} meccaniche`);
                }
            }
        }
    }
});

test('i tre posti usano la stessa regola e le stesse copie dei file', () => {
    // Box
    const box = leggi('docs/box.html');
    assert.match(box, /<script src="controllo-team\.js"><\/script>/);
    assert.match(box, /return ControlloTeam\.problemiDelTeam\(sets, regole, fonti\);/);
    assert.match(box, /function tbGenSpecie\(sp\) \{\s*return ControlloTeam\.genSpecie\(/);
    assert.match(box, /function tbGenMossa\(m\) \{\s*return ControlloTeam\.genMossa\(m\);/);
    assert.match(box, /return ControlloTeam\.genAbilita\(tbDex\.abilities\[tbToID\(nome\)\]\);/);
    assert.match(box, /controllaSpecie: String\(regolamento\?\.strutturaSito \|\| 'custom'\)\.toLowerCase\(\)\.trim\(\) !== 'anything_goes'/);
    // simulatore sul sito e server
    assert.match(leggi('docs/team-sito.js'), /return self\.ControlloTeam\.problemiDeiSetShowdown\(sets, regole, Dex\);/);
    assert.match(leggi('functions/partita.js'), /return ControlloTeam\.problemiDeiSetShowdown\(sets, regole, PS\.Dex\);/);
    // niente più "Future": è il segno di Spada e Scudo, non la generazione di debutto
    for (const f of ['docs/team-sito.js', 'functions/partita.js', 'docs/controllo-team.js']) assert.doesNotMatch(leggi(f), /isNonstandard === 'Future'/, f);
    // copie identiche
    for (const nome of ['controllo-team.js', 'dati-gen.js']) assert.equal(leggi(`docs/${nome}`), leggi(`functions/${nome}`), `${nome}: docs/ e functions/ devono essere uguali`);
    for (let g = 1; g <= 8; g++) assert.equal(leggi(`docs/pkm-gens/delta-gen${g}.json`), leggi(`functions/pkm-gens/delta-gen${g}.json`), `delta-gen${g}.json`);
});

test('la specie di Leggende Arceus in Gen 8 prende i dati di oggi (nel simulatore sono provvisori): Samurott di Hisui ha Sharpness', () => {
    const d8 = JSON.parse(leggi('docs/pkm-gens/delta-gen8.json'));
    for (const id of ['samurotthisui', 'kleavor', 'sneasler', 'basculegion', 'typhlosionhisui', 'goodrahisui', 'enamorus', 'braviaryhisui']) {
        assert.equal(d8.specie[id], undefined, `${id}: nessuna differenza per la Gen 8`);
    }
    assert.equal(CT.genAbilita({ num: 292 }), 8, 'Sharpness');
    assert.equal(CT.genMossa({ num: 827 }), 8, 'Dire Claw');
    assert.equal(CT.genMossa({ num: 850 }), 8, 'Take Heart');
    assert.equal(CT.genMossa({ num: 851 }), 9, 'Tera Blast');
    assert.equal(CT.genSpecie({ num: 903, forme: '', name: 'Sneasler' }), 8);
    assert.equal(CT.genSpecie({ num: 157, forme: 'Hisui', name: 'Typhlosion-Hisui' }), 8);
    assert.equal(CT.genSpecie({ num: 1000, forme: '', name: 'Gholdengo' }), 9);
});
