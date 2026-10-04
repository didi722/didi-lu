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
