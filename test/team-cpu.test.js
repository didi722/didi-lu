'use strict';
// I team che la CPU si compone da sola (docs/team-cpu.js) partendo dal pool di un formato:
//   - una dozzina di team da sei Pokémon per formato, sempre gli stessi (deterministici), mai troppo simili tra loro;
//   - tutto nelle regole: pool del formato, livello, Species Clause, Item Clause, Uber limit di STANDARD,
//     mosse e abilità bandite, natura imposta, Mega/Teracristal solo se il formato li ammette;
//   - mosse realmente imparabili (le controlla il validatore del simulatore) e quattro per Pokémon;
//   - funziona per qualunque formato, anche nuovo: monotype (stesso tipo), iniziale del nome, pool piccoli;
//   - le funzioni sul formato (generazione, livello, singolo/doppio) sono quelle di team-sito.js;
//   - il formato che il sito dà al simulatore fa partire la partita in ogni generazione.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { caricaSim, caricaTeamSito, giocaPartita } = require('./ayuda-sim.js');
const T = require('../docs/team-cpu.js');
const P = require('../docs/formato-pool.js');
const K = require('../docs/cpu-conoscenza.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = p => JSON.parse(fs.readFileSync(path.join(DOCS, p), 'utf8'));
const caricaJson = async p => leggi(p);
const base = P.minuscole(leggi('pkm-gens/pokedex_base.json'));
const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
const reg = (extra = {}) => ({ genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi, ...extra });

async function genera(regolamento, opz = {}) {
    const { sim } = await caricaSim();
    return T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento, caricaJson, pokedexBase: base, quanti: 12, ...opz });
}
const importa = async testo => { const { sim } = await caricaSim(); return sim.Teams.import(testo); };
const id = K.id;

// Controlli comuni a ogni formato
async function controllaTeam(regolamento, r, { sim } = {}) {
    const { sim: S } = await caricaSim();
    const c = T.contestoDa(regolamento);
    const dex = S.Dex.forGen(c.gen);
    const pool = (await P.caricaPool(regolamento, caricaJson, { pokedexBase: base })).pokemon;
    const idPool = new Set(pool.map(p => id(p.id)));
    const validatore = S.TeamValidator.get([`gen${c.gen}anythinggoes`, `gen${c.gen}ubers`, `gen${c.gen}ou`].find(f => S.Dex.formats.get(f).exists));
    for (const t of r.team) {
        const sets = S.Teams.import(t.testo);
        assert.equal(sets.length, 6, `${t.nome}: sei Pokémon`);
        const specie = new Set(), strumenti = new Set();
        for (const s of sets) {
            const sp = dex.species.get(s.species);
            assert.equal(s.level || 100, c.livello, `${t.nome}: ${s.species} al livello del formato`);
            // nel pool, oppure una Mega di una specie del pool (entra col nome della base e la pietra)
            const nelPool = idPool.has(sp.id) || [...pool].some(x => dex.species.get(x.id).battleOnly === sp.name);
            assert.ok(nelPool, `${t.nome}: ${s.species} non è nel pool del formato`);
            assert.ok(!specie.has(sp.baseSpecies), `${t.nome}: Species Clause (${sp.baseSpecies})`);
            specie.add(sp.baseSpecies);
            if (s.item) { assert.ok(!strumenti.has(id(s.item)), `${t.nome}: Item Clause (${s.item})`); strumenti.add(id(s.item)); }
            assert.equal((s.moves || []).length, 4, `${t.nome}: ${s.species} ha quattro mosse`);
            assert.equal(new Set(s.moves.map(id)).size, 4, `${t.nome}: ${s.species} senza mosse doppie`);
            // mosse imparabili: il validatore del simulatore le conosce
            const copia = JSON.parse(JSON.stringify(s)); copia.level = 100;
            const problemi = (validatore.validateSet(copia, {}) || []).filter(x => !/event|Hidden Ability|obtainable|tier|banned|Tera|restricted|EVs/i.test(x));
            assert.deepEqual(problemi, [], `${t.nome}: ${s.species}`);
            if (!c.meccaniche) {
                const it = dex.items.get(s.item);
                assert.ok(!(it.exists && (it.megaStone || it.zMove)), `${t.nome}: ${s.species} con ${s.item} ma il formato non ha meccaniche`);
                assert.ok(!s.teraType, `${t.nome}: Teracristal senza meccaniche`);
            }
        }
        assert.equal(t.specie.length, 6);
    }
    // varietà: due team non condividono quattro o più Pokémon e nessuno è in più di un terzo dei team
    const liste = r.team.map(t => t.specie.map(x => dex.species.get(x).baseSpecies));
    for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
        assert.ok(liste[i].filter(x => liste[j].includes(x)).length < 4, `team ${i + 1} e ${j + 1} troppo simili`);
    }
    const uso = {};
    liste.flat().forEach(x => { uso[x] = (uso[x] || 0) + 1; });
    assert.ok(Math.max(...Object.values(uso)) <= Math.ceil(r.team.length / 3) + 1, `un Pokémon è in troppi team: ${JSON.stringify(uso)}`);
}

// ===================================================
// I FORMATI
// ===================================================
const FORMATI = [
    ['singolo Gen 9 (OU)', reg()],
    ['doppio Gen 9 (OU)', reg({ battleStyle: 'doubles' })],
    ['doppio Gen 9 con Teracristal', reg({ battleStyle: 'doubles', generationalMechanics: true })],
    ['VGC Gen 8 (STANDARD)', reg({ genRuleValue: '8', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen8', vgcFormat: 'doubles' })],
    ['singolo Gen 7 con Mega', reg({ genRuleValue: '7', generationalMechanics: true, restrizioni: { pokemon: { ...permessi.pokemon, is_mega: { mode: 'SPECIFIC', value: true } } } })],
    ['singolo Gen 4', reg({ genRuleValue: '4' })],
    ['singolo Gen 2', reg({ genRuleValue: '2' })],
    ['singolo Gen 1', reg({ genRuleValue: '1' })],
    ['Little Cup', reg({ baseTier: 'LC' })],
    ['fino alla Gen 6 (up_to)', reg({ genRuleType: 'up_to', genRuleValue: '6' })]
];

for (const [nome, regolamento] of FORMATI) {
    test(`${nome}: dodici team legali, diversi tra loro`, { timeout: 120000 }, async () => {
        const r = await genera(regolamento);
        assert.equal(r.team.length, 12, `team prodotti: ${r.team.length} (${r.avvisi.join('; ')})`);
        await controllaTeam(regolamento, r);
    });
}

test('i team sono sempre gli stessi per lo stesso formato (e cambiano se cambia il seme)', async () => {
    const regolamento = reg({ battleStyle: 'doubles' });
    const a = await genera(regolamento, { seme: 'prova' });
    const b = await genera(regolamento, { seme: 'prova' });
    const c = await genera(regolamento, { seme: 'altro' });
    assert.deepEqual(a.team.map(t => t.testo), b.team.map(t => t.testo));
    assert.notDeepEqual(a.team.map(t => t.testo), c.team.map(t => t.testo));
});

test('ogni team ha un piano diverso (Tailwind, Trick Room, meteo...) e un nome leggibile', async () => {
    const r = await genera(reg({ battleStyle: 'doubles' }));
    const piani = new Set(r.team.map(t => t.piano));
    assert.ok(piani.size >= 5, `piani: ${[...piani].join(', ')}`);
    for (const t of r.team) assert.match(t.nome, /^CPU [A-Za-z ]+ · \S/);
    // il piano si vede nel team: chi gioca Trick Room ha la mossa, chi gioca Tailwind pure
    const tr = r.team.find(t => t.piano === 'trickroom');
    if (tr) assert.match(tr.testo, /- Trick Room/);
    const tw = r.team.find(t => t.piano === 'tailwind');
    if (tw) assert.match(tw.testo, /- Tailwind/);
});

// La strategia di un team deve essere vera: chi la imposta e chi ne approfitta stanno davvero nei set (non è solo un nome).
function controllaStrategia(t, sets, dex) {
    const s = t.strategia;
    assert.ok(s && typeof s === 'object', `${t.nome}: manca la strategia`);
    assert.equal(s.piano, t.piano);
    assert.equal(s.coerente, true, `${t.nome}: piano ${s.richiesto} non realizzato (${JSON.stringify(s.trovati)})`);
    const ha = (set, m) => (set.moves || []).map(id).includes(m);
    const attacca = set => (set.moves || []).some(m => dex.moves.get(m).category !== 'Status');
    const specie = set => dex.species.get(set.species);
    const meteoDelPiano = K.PIANO_METEO[t.piano];
    if (t.piano === 'tailwind') {
        assert.ok(sets.some(x => ha(x, 'tailwind')), `${t.nome}: nessuno con Tailwind`);
    } else if (t.piano === 'trickroom') {
        assert.ok(sets.some(x => ha(x, 'trickroom')), `${t.nome}: nessuno con Trick Room`);
        const lenti = sets.filter(x => attacca(x) && specie(x).baseStats.spe <= 60 && Math.max(specie(x).baseStats.atk, specie(x).baseStats.spa) >= 95);
        assert.ok(lenti.length >= 2, `${t.nome}: servono almeno due attaccanti lenti (${lenti.map(x => x.species).join(', ')})`);
    } else if (meteoDelPiano) {
        const setter = sets.filter(x => K.METEO_SETTER[meteoDelPiano].includes(id(x.ability)));
        assert.ok(setter.length >= 1, `${t.nome}: nessuno con l'abilità che mette il meteo`);
        const abusatori = sets.filter(x => !setter.includes(x) && attacca(x) && (K.METEO_SFRUTTATORI[meteoDelPiano].includes(id(x.ability)) ||
            ((x.moves || []).some(m => dex.moves.get(m).category !== 'Status' && dex.moves.get(m).type === K.METEO_TIPO[meteoDelPiano]) && Math.max(specie(x).baseStats.atk, specie(x).baseStats.spa) >= 80)));
        assert.ok(abusatori.length >= 1, `${t.nome}: nessuno ne approfitta`);
    }
    // il nucleo (setter e abusatori) sono Pokémon del team
    for (const n of s.nucleo) assert.ok(t.specie.includes(n), `${t.nome}: ${n} nel nucleo ma non nel team`);
    if (s.piano !== 'bilanciato' && ['tailwind', 'trickroom'].concat(Object.keys(K.PIANO_METEO)).includes(s.piano)) assert.ok(s.setter.length >= 1 && s.nucleo.length >= 2, `${t.nome}: nucleo`);
}

for (const [nome, regolamento] of [
    ['doppio Gen 9 con Teracristal', reg({ battleStyle: 'doubles', generationalMechanics: true })],
    ['VGC Gen 8 (STANDARD)', reg({ genRuleValue: '8', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen8', vgcFormat: 'doubles' })],
    ['singolo Gen 9 (OU)', reg()],
    ['singolo Gen 4', reg({ genRuleValue: '4' })]
]) {
    test(`${nome}: ogni team ha una strategia vera (chi la imposta e chi ne approfitta sono nei set)`, { timeout: 120000 }, async () => {
        const { sim } = await caricaSim();
        const r = await genera(regolamento);
        const dex = sim.Dex.forGen(T.contestoDa(regolamento).gen);
        assert.equal(r.team.length, 12);
        for (const t of r.team) controllaStrategia(t, await importa(t.testo), dex);
        // e la varietà non è sparita: almeno quattro piani diversi
        assert.ok(new Set(r.team.map(t => t.piano)).size >= 4, `piani: ${r.team.map(t => t.piano).join(', ')}`);
    });
}

test('strategiaDelTeam: un piano che nessuno realizza diventa "bilanciato"; uno vero ha setter, abusatori e nucleo', async () => {
    const { sim } = await caricaSim();
    const dex = sim.Dex.forGen(9);
    const K2 = K;
    const cand = (nome, extra = {}) => { const s = dex.species.get(nome); return { nome: s.name, basi: s.baseStats, offesa: Math.max(s.baseStats.atk, s.baseStats.spa), lento: s.baseStats.spe <= 60, valore: 100, ...extra }; };
    const mosse = (...ids) => ids.map(k => K2.descriviMossa(dex, k));
    const info = (nome, ms, abilita) => ({ cand: cand(nome), mosse: mosse(...ms), abilita });
    // Tailwind senza nessuno che la sappia → bilanciato
    const senza = T.strategiaDelTeam('tailwind', [info('Garchomp', ['earthquake', 'dragonclaw'], 'Rough Skin'), info('Rillaboom', ['woodhammer', 'grassyglide'], 'Grassy Surge'), info('Incineroar', ['flareblitz', 'knockoff'], 'Intimidate')]);
    assert.equal(senza.piano, 'bilanciato');
    assert.equal(senza.coerente, false);
    assert.equal(senza.richiesto, 'tailwind');
    assert.deepEqual(senza.nucleo, []);
    // Tailwind vero
    const vero = T.strategiaDelTeam('tailwind', [info('Tornadus', ['tailwind', 'bleakwindstorm'], 'Prankster'), info('Garchomp', ['earthquake', 'dragonclaw'], 'Rough Skin'), info('Rillaboom', ['woodhammer'], 'Grassy Surge')]);
    assert.equal(vero.piano, 'tailwind');
    assert.deepEqual(vero.setter, ['Tornadus']);
    assert.ok(vero.abusatori.length >= 2 && vero.nucleo[0] === 'Tornadus');
    // pioggia: il setter da solo non basta, serve chi ne approfitta
    const soloSetter = T.strategiaDelTeam('pioggia', [info('Pelipper', ['surf', 'hurricane'], 'Drizzle'), info('Garchomp', ['earthquake'], 'Rough Skin')]);
    assert.equal(soloSetter.piano, 'bilanciato');
    const pioggia = T.strategiaDelTeam('pioggia', [info('Pelipper', ['surf', 'hurricane'], 'Drizzle'), info('Barraskewda', ['liquidation', 'closecombat'], 'Swift Swim')]);
    assert.equal(pioggia.piano, 'pioggia');
    assert.deepEqual(pioggia.setter, ['Pelipper']);
    // Stanza Magica: servono due attaccanti lenti
    const tr = T.strategiaDelTeam('trickroom', [info('Hatterene', ['trickroom', 'dazzlinggleam'], 'Magic Bounce'), info('Torkoal', ['eruption', 'earthpower'], 'Drought'), info('Ursaluna', ['facade', 'earthquake'], 'Guts')]);
    assert.equal(tr.piano, 'trickroom');
    const trFinto = T.strategiaDelTeam('trickroom', [info('Hatterene', ['trickroom', 'dazzlinggleam'], 'Magic Bounce'), info('Garchomp', ['earthquake'], 'Rough Skin')]);
    assert.equal(trFinto.piano, 'bilanciato');
    // i piani senza setter sono sempre veri
    assert.equal(T.strategiaDelTeam('offensivo', [info('Garchomp', ['earthquake'], 'Rough Skin')]).coerente, true);
});

test('nel doppio ci sono protezioni e supporti; nel singolo trappole, recupero e potenziamenti', async () => {
    const doppio = await genera(reg({ battleStyle: 'doubles' }));
    const conProtect = doppio.team.filter(t => /- (Protect|Detect|Spiky Shield|King's Shield|Baneful Bunker|Obstruct|Silk Trap|Burning Bulwark)/.test(t.testo)).length;
    assert.ok(conProtect >= 10, `team con Protezione: ${conProtect}/12`);
    assert.ok(doppio.team.filter(t => /- Fake Out/.test(t.testo)).length >= 4);
    const singolo = await genera(reg());
    assert.ok(singolo.team.filter(t => /- (Stealth Rock|Spikes)/.test(t.testo)).length >= 3, 'trappole');
    assert.ok(singolo.team.filter(t => /- (Recover|Roost|Soft-Boiled|Slack Off|Synthesis|Moonlight|Morning Sun|Shore Up|Milk Drink)/.test(t.testo)).length >= 3, 'recupero');
    assert.ok(singolo.team.filter(t => /- (Swords Dance|Nasty Plot|Dragon Dance|Calm Mind|Quiver Dance|Bulk Up|Shell Smash)/.test(t.testo)).length >= 4, 'potenziamenti');
});

// ===================================================
// LE REGOLE DEL FORMATO
// ===================================================
test('STANDARD: al massimo due Uber, niente AG né misteriosi', async () => {
    const { sim } = await caricaSim();
    const regolamento = reg({ baseTier: 'STANDARD' });
    const r = await genera(regolamento);
    assert.equal(r.team.length, 12);
    const dex = sim.Dex.forGen(9);
    const g9 = leggi('pkm-gens/gen9.json');
    for (const t of r.team) {
        const sets = await importa(t.testo);
        const uber = sets.filter(s => /^uber$/i.test(String(g9[id(s.species)] && g9[id(s.species)].single_tier))).length;
        assert.ok(uber <= 2, `${t.nome}: ${uber} Uber`);
        for (const s of sets) {
            const k = id(s.species);
            assert.notEqual(String(g9[k] && g9[k].single_tier).toUpperCase(), 'AG', `${t.nome}: ${s.species} è AG`);
            const dett = base[k] || base[id(dex.species.get(s.species).baseSpecies)];
            assert.ok(!(dett && dett.is_mythical === true), `${t.nome}: ${s.species} è misterioso`);
        }
    }
});

test('mosse e abilità bandite non compaiono mai', async () => {
    const regolamento = reg({
        battleStyle: 'doubles',
        restrizioni: {
            ...permessi,
            mosse: { banned_list: { mode: 'BANLIST', value: { protect: true, detect: true, fakeout: true, tailwind: true, earthquake: true } } },
            abilita: { banned_list: { mode: 'BANLIST', value: { intimidate: true, prankster: true } } }
        }
    });
    const r = await genera(regolamento);
    assert.equal(r.team.length, 12);
    for (const t of r.team) {
        assert.ok(!/- (Protect|Detect|Fake Out|Tailwind|Earthquake)\b/.test(t.testo), `${t.nome}: mossa bandita`);
        assert.ok(!/Ability: (Intimidate|Prankster)\b/.test(t.testo), `${t.nome}: abilità bandita`);
    }
    await controllaTeam(regolamento, r);
});

test('natura imposta: tutti i Pokémon hanno quella natura', async () => {
    const r = await genera(reg({ restrizioni: { pokemon: { ...permessi.pokemon, nature: { mode: 'SPECIFIC', operator: 'equals', value: 'Jolly' } } } }));
    assert.equal(r.team.length, 12);
    for (const t of r.team) assert.equal((t.testo.match(/Jolly Nature/g) || []).length, 6, t.nome);
});

test('restrizioni su mosse e strumenti: potenza massima e solo bacche', async () => {
    const r = await genera(reg({
        restrizioni: {
            ...permessi,
            mosse: { power: { mode: 'SPECIFIC', operator: 'lt', value: 100 } },
            strumenti: { is_berry: { mode: 'SPECIFIC', operator: 'equals', value: true } }
        }
    }));
    assert.ok(r.team.length >= 6);
    const { sim } = await caricaSim();
    const dex = sim.Dex.forGen(9);
    for (const t of r.team) for (const s of await importa(t.testo)) {
        assert.ok(!s.item || dex.items.get(s.item).isBerry, `${t.nome}: ${s.species} con ${s.item}`);
        for (const m of s.moves) assert.ok((dex.moves.get(m).basePower || 0) < 100, `${t.nome}: ${m}`);
    }
});

test('monotype (stesso tipo in tutto il team): ogni team ha un tipo comune a tutti', async () => {
    const { sim } = await caricaSim();
    const regolamento = reg({ restrizioni: { pokemon: { ...permessi.pokemon, type: { mode: 'SAME_ACROSS_TEAM', operator: 'equals' } } } });
    const r = await genera(regolamento);
    assert.ok(r.team.length >= 8, `team: ${r.team.length}`);
    const dex = sim.Dex.forGen(9);
    const tipiUsati = new Set();
    for (const t of r.team) {
        const sets = await importa(t.testo);
        let comuni = dex.species.get(sets[0].species).types;
        for (const s of sets) comuni = comuni.filter(x => dex.species.get(s.species).types.includes(x));
        assert.ok(comuni.length >= 1, `${t.nome}: nessun tipo in comune`);
        comuni.forEach(x => tipiUsati.add(x));
    }
    assert.ok(tipiUsati.size >= 3, `tipi diversi tra i team: ${[...tipiUsati].join(', ')}`);
});

test('iniziale del nome (PLAYER_INITIAL): la CPU usa le iniziali date, o una lettera con abbastanza Pokémon', async () => {
    const regolamento = reg({ restrizioni: { pokemon: { ...permessi.pokemon, name_starts: { mode: 'PLAYER_INITIAL' } } } });
    const conIniziali = await genera(regolamento, { iniziali: ['m'] });
    assert.ok(conIniziali.team.length >= 1);
    for (const t of conIniziali.team) for (const s of await importa(t.testo)) assert.ok(s.species.toLowerCase().startsWith('m'), `${t.nome}: ${s.species}`);
    const senza = await genera(regolamento);
    assert.ok(senza.team.length >= 6, `team: ${senza.team.length}`);
    for (const t of senza.team) {
        const lettere = new Set((await importa(t.testo)).map(s => s.species.charAt(0).toLowerCase()));
        assert.equal(lettere.size, 1, `${t.nome}: iniziali ${[...lettere]}`);
    }
});

test('pool troppo piccolo: nessun team e un avviso, senza errori', async () => {
    const r = await genera(reg({ restrizioni: { pokemon: { ...permessi.pokemon, name_starts: { mode: 'VALUE', operator: 'STARTS_WITH', value: 'x' } } } }));
    assert.equal(r.team.length, 0);
    assert.ok(r.avvisi.length >= 1);
});

test('un formato mai visto funziona: peso, BST e colore come regole nuove', async () => {
    const r = await genera(reg({
        battleStyle: 'doubles',
        restrizioni: { pokemon: { ...permessi.pokemon, bst: { mode: 'SPECIFIC', operator: 'lt', value: 520 }, weight: { mode: 'SPECIFIC', operator: 'lt', value: 120 } } }
    }));
    assert.ok(r.team.length >= 6);
    const pool = (await P.caricaPool(reg({ battleStyle: 'doubles', restrizioni: { pokemon: { ...permessi.pokemon, bst: { mode: 'SPECIFIC', operator: 'lt', value: 520 }, weight: { mode: 'SPECIFIC', operator: 'lt', value: 120 } } } }), caricaJson, { pokedexBase: base })).pokemon;
    const ammessi = new Set(pool.map(p => id(p.id)));
    for (const t of r.team) for (const s of await importa(t.testo)) assert.ok(ammessi.has(id(s.species)), `${t.nome}: ${s.species} fuori dalle regole`);
});

// ===================================================
// IL SITO E LA CPU PARLANO LA STESSA LINGUA
// ===================================================
// Le funzioni vere di team-sito.js (modulo ES che importa il simulatore: vedi ayuda-sim.js)
test('generazione, livello, singolo/doppio e meccaniche: la CPU usa le stesse regole di team-sito.js', async () => {
    const S = await caricaTeamSito();
    const campioni = [
        { strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles' }, { strutturaSito: 'vgc', vgcGen: 'Gen8', vgcFormat: 'singles' },
        { strutturaSito: 'custom', genRuleValue: '9', battleStyle: 'doubles', generationalMechanics: true }, { strutturaSito: 'custom', genRuleValue: '4', baseTier: 'LC', battleStyle: 'singles' },
        { strutturaSito: 'custom', genRuleValue: '2', battleStyle: 'doubles' }, { strutturaSito: 'anything_goes', genRuleValue: '8', battleStyle: 'doubles' }, {}
    ];
    for (const r of campioni) {
        const c = T.contestoDa(r);
        assert.equal(c.gen, S.generazioneFormato(r), JSON.stringify(r));
        assert.equal(c.livello, S.livelloFormato(r), JSON.stringify(r));
        assert.equal(c.meccaniche, S.meccanicheAttive(r), JSON.stringify(r));
        assert.equal(S.formatoSimulatore(r).includes('doubles'), c.doppio, JSON.stringify(r));
    }
});

test('il formato che il sito dà al simulatore fa partire la partita in ogni generazione (anche le prime quattro)', { timeout: 120000 }, async () => {
    const { sim } = await caricaSim();
    const S = await caricaTeamSito();
    // functions/partita.js carica il simulatore di Node (non installato qui): se ne prende solo la parte sul formato
    const srcServer = fs.readFileSync(path.join(__dirname, '..', 'functions', 'partita.js'), 'utf8');
    const server = new Function(srcServer.slice(srcServer.indexOf('function generazioneFormato'), srcServer.indexOf('function trovaRegolamento')) + '\nreturn { formatoSimulatore };')();
    for (let gen = 1; gen <= 9; gen++) for (const stile of ['singles', 'doubles']) {
        const regolamento = reg({ genRuleValue: String(gen), battleStyle: stile });
        const formato = S.formatoSimulatore(regolamento);
        assert.equal(server.formatoSimulatore(regolamento), formato, `server e sito danno lo stesso formato (gen ${gen} ${stile})`);
        const r = await genera(regolamento, { quanti: 2 });
        assert.ok(r.team.length >= 2, `team in gen ${gen}`);
        const e = await giocaPartita({
            sim, formato, team1: r.team[0].testo, team2: r.team[1].testo, maxTurni: 2,
            agente1: { tipo: 'casuale' }, agente2: { tipo: 'casuale' }, fermaDopo: es => es.richieste >= 2
        });
        assert.ok(e.richieste >= 2, `la partita parte (gen ${gen} ${stile}): ${formato}`);
        assert.deepEqual(e.errori, []);
    }
});

// ===================================================
// I consigli (docs/consigli.js): mosse, strumenti e abilità che di solito si giocano su un Pokémon
// ===================================================
const Consigli = require('../docs/consigli.js');

// Quanto dei set è "consigliato": mosse, strumento e abilità che compaiono nei consigli della specie
async function quantoConsigliato(regolamento, opz) {
    const r = await genera(regolamento, opz);
    const c = T.contestoDa(regolamento);
    const dati = leggi(`consigli/gen${c.gen}.json`);
    let mosse = 0, mosseCons = 0, pokemon = 0, strumentoCons = 0, abilitaCons = 0;
    for (const t of r.team) for (const s of await importa(t.testo)) {
        const cons = Consigli.per(dati, id(s.species), { doppio: c.doppio, baseId: id(s.species.split('-')[0]) });
        pokemon++;
        for (const m of s.moves) { mosse++; if (cons.mosse.includes(id(m))) mosseCons++; }
        if (cons.oggetti.includes(id(s.item))) strumentoCons++;
        if (cons.abilita.includes(id(s.ability))) abilitaCons++;
    }
    return { team: r.team, mosse: mosseCons / mosse, strumenti: strumentoCons / pokemon, abilita: abilitaCons / pokemon };
}

for (const [nome, regolamento] of [['singolo Gen 9', reg()], ['doppio Gen 9', reg({ battleStyle: 'doubles', generationalMechanics: true })]]) {
    test(`consigli (${nome}): i set hanno molte più mosse, strumenti e abilità consigliati che senza`, { timeout: 120000 }, async () => {
        const con = await quantoConsigliato(regolamento);
        const senza = await quantoConsigliato(regolamento, { consigli: null });
        assert.equal(con.team.length, 12);
        assert.ok(con.mosse >= 0.6, `mosse consigliate: ${(con.mosse * 100).toFixed(0)}%`);
        assert.ok(con.mosse > senza.mosse + 0.1, `con ${con.mosse.toFixed(2)} contro senza ${senza.mosse.toFixed(2)}`);
        assert.ok(con.strumenti > senza.strumenti, `strumenti: con ${con.strumenti.toFixed(2)} contro senza ${senza.strumenti.toFixed(2)}`);
        // l'abilità migliore di solito è già quella consigliata: qui basta che i consigli non la peggiorino di molto
        assert.ok(con.abilita >= 0.8 && con.abilita >= senza.abilita - 0.08, `abilità: con ${con.abilita.toFixed(2)} contro senza ${senza.abilita.toFixed(2)}`);
    });
}

test('consigli: senza i dati (file mancante) i team si fanno lo stesso, legali e con quattro mosse', async () => {
    const regolamento = reg();
    const r = await genera(regolamento, { consigli: null });
    assert.equal(r.team.length, 12);
    await controllaTeam(regolamento, r);
    // anche se il file non si legge: Consigli.carica restituisce null e il resto va avanti
    const r2 = await genera(regolamento, { consigli: await Consigli.carica(9, async () => { throw new Error('manca'); }) });
    assert.equal(r2.team.length, 12);
});

test('consigli: il Gilet d\'assalto va solo a chi non ha nessuna mossa di stato (nemmeno la Protezione)', async () => {
    for (const regolamento of [reg(), reg({ battleStyle: 'doubles', generationalMechanics: true })]) {
        const r = await genera(regolamento);
        const { sim } = await caricaSim();
        for (const t of r.team) for (const s of await importa(t.testo)) {
            if (id(s.item) !== 'assaultvest') continue;
            const stato = s.moves.filter(m => sim.Dex.moves.get(m).category === 'Status');
            assert.deepEqual(stato, [], `${t.nome}: ${s.species} con Gilet d'assalto e ${stato.join(', ')}`);
        }
    }
});

test('consigli: i team di sempre restano rispettosi delle regole con i consigli (monotype e iniziale del nome)', { timeout: 120000 }, async () => {
    const regolamento = reg({ restrizioni: { ...permessi, pokemon: { ...permessi.pokemon, type: { mode: 'SAME_ACROSS_TEAM' } } } });
    const r = await genera(regolamento);
    assert.ok(r.team.length >= 6);
    await controllaTeam(regolamento, r);
});
