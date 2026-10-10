'use strict';
// Pokémon ripetuti nel team (Anything Goose, o due forme che il nome non distingue) e Ditto nelle statistiche dei set:
//   - il log dice solo "p1a: Garchomp 2|Garchomp": quale dei due è sceso in campo lo dice il soprannome (nomi-unici.js li rende diversi);
//   - i fiocchi e i badge sono di QUEL Pokémon di QUEL team: il secondo Garchomp non eredita i numeri del primo;
//   - un Ditto resta Ditto (specie, tipi, KO, presenze), non la specie di cui assume l'aspetto.
// Si gioca con il simulatore vero (docs/pkmn-sim.js) e si legge il log con functions/statistiche-set.js.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim, giocaPartita } = require('./ayuda-sim.js');
const { analizzaSet } = require('../functions/statistiche-set.js');
const { nomiUnici } = require('../docs/nomi-unici.js');
const { calcola } = require('../docs/statistiche.js');
const Fiocchi = require('../docs/fiocchi.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// risultati-match.js è uno script del sito (funzioni globali): lo si carica in un contesto isolato, come fa uso-pokemon.test.js
const contesto = vm.createContext({ console, fetch: () => { throw new Error('rete non permessa'); }, db: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'docs', 'risultati-match.js'), 'utf8'), contesto);
const calcolaUsoPokemon = (...args) => JSON.parse(JSON.stringify(contesto.calcolaUsoPokemon(...args)));

const set = (nome, ab, mosse, item = 'Leftovers') => `${nome} @ ${item}\nAbility: ${ab}\nLevel: 50\n${mosse.map(m => '- ' + m).join('\n')}`;
const TEAM1 = [
    set('Garchomp', 'Rough Skin', ['Earthquake', 'Protect']),
    set('Garchomp', 'Sand Veil', ['Dragon Claw', 'Protect'], 'Choice Band'),
    set('Ditto', 'Imposter', ['Transform'], 'Choice Scarf'),
    set('Pikachu', 'Static', ['Thunderbolt']),
    set('Mew', 'Synchronize', ['Psychic']),
    set('Snorlax', 'Immunity', ['Body Slam'])
].join('\n\n');
const TEAM2 = [
    set('Gyarados', 'Intimidate', ['Waterfall', 'Protect']),
    set('Charizard', 'Blaze', ['Flamethrower', 'Protect']),
    set('Blissey', 'Natural Cure', ['Seismic Toss']),
    set('Tyranitar', 'Sand Stream', ['Crunch']),
    set('Lapras', 'Water Absorb', ['Surf']),
    set('Aerodactyl', 'Pressure', ['Rock Slide'])
].join('\n\n');

// Una partita corta: p1 porta il SECONDO Garchomp, Ditto, il primo Garchomp e Pikachu (in quest'ordine) e manda in campo il secondo
async function partita(portati1 = '2314') {
    const { sim } = await caricaSim();
    const { Teams, Dex } = sim;
    const sets = nomiUnici(Teams.import(TEAM1), s => Dex.species.get(s).baseSpecies);
    const nomi = sets.map(s => s.name || s.species);
    const team1 = Teams.export(sets);
    const e = await giocaPartita({
        sim, formato: 'gen9customgame@@@Picked Team Size = 4', team1, team2: TEAM2, maxTurni: 6,
        agente1: { tipo: 'script', gestore: r => (r.teamPreview ? `team ${portati1}` : r.forceSwitch ? 'switch 2' : 'move 1') },
        agente2: { tipo: 'script', gestore: r => (r.teamPreview ? 'team 1234' : r.forceSwitch ? 'switch 2' : 'move 1') }
    });
    return { righe: e.righe, nomi, sets };
}
const GARCHOMP = ['Garchomp', 'Garchomp 2'];
const portatiConNomi = ordine => ordine.map(i => ({ specie: [0, 1].includes(i) ? 'Garchomp' : i === 2 ? 'Ditto' : 'Pikachu', nome: [...GARCHOMP, 'Ditto', 'Pikachu'][i] }));
const dellaSpecie = (st, specie) => st.p1.pokemon.filter(p => p.specie === specie);

test('nomi-unici: il primo dei doppioni resta "Garchomp", il secondo diventa "Garchomp 2"', async () => {
    const { nomi } = await partita();
    assert.deepEqual(nomi.slice(0, 2), GARCHOMP);
});

test('due Garchomp nel team: è il secondo a scendere in campo, e le statistiche lo attribuiscono al secondo (con i soprannomi del team)', async () => {
    const { righe, nomi } = await partita();
    assert.ok(righe.some(r => r.startsWith('|switch|p1a: Garchomp 2|')), 'il secondo Garchomp è il titolare');
    const st = analizzaSet(righe, { portati: { p1: portatiConNomi([1, 2, 0, 3]), p2: ['Gyarados', 'Charizard', 'Blissey', 'Tyranitar'] }, nomi: { p1: nomi } });
    const [primo, secondo] = dellaSpecie(st, 'Garchomp');
    assert.equal(secondo.nome, 'Garchomp 2');
    assert.equal(secondo.sceso, true, 'il secondo Garchomp è sceso in campo');
    assert.equal(secondo.titolare, true);
    assert.ok(secondo.koFatti >= 1);
    assert.equal(primo.sceso, false, 'il primo è rimasto in panchina');
    assert.equal(primo.titolare, false);
    assert.equal(primo.koFatti, 0);
    assert.equal(primo.portato, true, 'ma era tra i quattro portati');
});

test('anche senza i soprannomi del team (set già salvati, replay): il numero nel soprannome dice quale dei due è sceso', async () => {
    const { righe } = await partita();
    const st = analizzaSet(righe, { portati: { p1: ['Garchomp', 'Ditto', 'Garchomp', 'Pikachu'] } });
    const [primo, secondo] = dellaSpecie(st, 'Garchomp');
    assert.equal(secondo.sceso, true);
    assert.equal(secondo.titolare, true);
    assert.equal(primo.sceso, false);
    assert.equal(primo.titolare, false);
});

test('porta solo il secondo Garchomp (il primo resta a casa): "portato" è del secondo, anche se la specie è la stessa', async () => {
    const { righe, nomi } = await partita('2345');   // Garchomp 2, Ditto, Pikachu, Mew
    const st = analizzaSet(righe, {
        portati: { p1: [{ specie: 'Garchomp', nome: 'Garchomp 2' }, { specie: 'Ditto', nome: 'Ditto' }, { specie: 'Pikachu', nome: 'Pikachu' }, { specie: 'Mew', nome: 'Mew' }] },
        nomi: { p1: nomi }
    });
    const [primo, secondo] = dellaSpecie(st, 'Garchomp');
    assert.equal(primo.portato, false, 'il primo non era tra i portati');
    assert.equal(secondo.portato, true);
    assert.equal(secondo.titolare, true);
});

test('Ditto resta Ditto: specie, KO e presenze sono suoi, non del Pokémon di cui assume l\'aspetto', async () => {
    const { righe, nomi } = await partita();
    assert.ok(righe.some(r => /^\|-transform\|p1a: Ditto\|p2a: /.test(r)), 'Ditto si trasforma (Imposter)');
    const st = analizzaSet(righe, { portati: { p1: portatiConNomi([1, 2, 0, 3]), p2: ['Gyarados', 'Charizard', 'Blissey', 'Tyranitar'] }, nomi: { p1: nomi } });
    const ditto = st.p1.pokemon.filter(p => p.specie === 'Ditto');
    assert.equal(ditto.length, 1);
    assert.equal(ditto[0].sceso, true);
    assert.ok(ditto[0].koFatti >= 1, 'il KO fatto da Ditto trasformato è di Ditto');
    // nessun "Charizard" fra i Pokémon di p1 (la specie imitata non entra nelle sue statistiche) e quello di p2 non guadagna KO da Ditto
    assert.ok(!st.p1.pokemon.some(p => p.specie === 'Charizard'));
    const charizard = st.p2.pokemon.find(p => p.specie === 'Charizard');
    assert.equal(charizard.koFatti >= 0, true);
    assert.equal(st.p1.pokemon.map(p => p.specie).join(), 'Garchomp,Garchomp,Ditto,Pikachu,Mew,Snorlax');
});

test('uso globale: un Ditto conta come Ditto (specie e tipi Normale), non come la specie imitata', async () => {
    const { righe, nomi } = await partita();
    const st = analizzaSet(righe, { portati: { p1: portatiConNomi([1, 2, 0, 3]) }, nomi: { p1: nomi } });
    st.vincitore = 'p1';
    const tipiDi = specie => ({ ditto: ['normal'], garchomp: ['dragon', 'ground'], pikachu: ['electric'], charizard: ['fire', 'flying'] }[String(specie).toLowerCase()] || []);
    const uso = calcolaUsoPokemon([{ vittoria: true, team: 'ALPHA', lato: 'p1', setStats: { set1: st } }], tipiDi, () => null);
    assert.equal(uso.specie.ditto.played, 1);
    assert.equal(uso.specie.ditto.won, 1);
    assert.equal(uso.specie.charizard, undefined, 'Charizard non è stato giocato da p1');
    assert.equal(uso.tipi.normal.played, 1, 'Normale: il Ditto');
    assert.equal(uso.tipi.fire, undefined, 'né Fuoco né Volante: Ditto non diventa un Charizard');
    assert.equal(uso.specie.garchomp.played, 1, 'solo il secondo Garchomp è sceso in campo');
});

test('fiocchi: il secondo Garchomp del team prende le statistiche del secondo, non quelle del primo', () => {
    const risultato = { pokemon: [
        { chiave: 'didi::ALPHA::garchomp', player: 'didi', team: 'ALPHA', specieId: 'garchomp', portato: 3 },
        { chiave: 'didi::ALPHA::garchomp#2', player: 'didi', team: 'ALPHA', specieId: 'garchomp', portato: 9 },
        { chiave: 'didi::ALPHA::ditto', player: 'didi', team: 'ALPHA', specieId: 'ditto', portato: 5 }
    ] };
    const team = { nome: 'ALPHA', pokemon: [{ nome: 'Garchomp' }, { nome: 'Ditto' }, { nome: 'Tank (Garchomp)' }] };
    const trova = (specie, ordinale) => Fiocchi.trova(risultato, { player: 'didi', team: 'ALPHA', specie, ordinale });
    assert.equal(trova('Garchomp').portato, 3);
    assert.equal(trova('Garchomp', 1).portato, 3);
    assert.equal(trova('Garchomp', 2).portato, 9);
    assert.equal(trova('Garchomp', 3), null, 'un terzo Garchomp senza dati: nessun numero in prestito');
    assert.equal(trova('Ditto').portato, 5);
    assert.equal(trova('Tank (Garchomp)', 2).portato, 9, 'il soprannome del Box ("Nick (Specie)") non cambia la specie');
    // il numero d'ordine di ogni Pokémon del team
    assert.deepEqual(team.pokemon.map((p, i) => Fiocchi.ordinaleDi(team, p, i)), [1, 1, 2]);
    assert.deepEqual(team.pokemon.map(p => Fiocchi.ordinaleDi(team, p)), [1, 1, 2], 'anche solo con l\'oggetto');
    assert.equal(Fiocchi.ordinaleDi(team, JSON.parse(JSON.stringify(team.pokemon[2]))), 2, 'e con una copia (la pagina pubblica ne riceve una)');
    assert.equal(Fiocchi.ordinaleDi(team, { nome: 'Mew' }), 1);
});

test('statistiche complete: due Garchomp nel team hanno due schede, e i numeri del set vanno sul secondo', async () => {
    const { righe, nomi } = await partita();
    const st = analizzaSet(righe, { portati: { p1: portatiConNomi([1, 2, 0, 3]), p2: ['Gyarados', 'Charizard', 'Blissey', 'Tyranitar'] }, nomi: { p1: nomi } });
    st.vincitore = 'p1';
    const roster = n => n.map(nome => ({ nome }));
    const dati = {
        players: {
            didi: { info: { name: 'Didi' }, teams: { a: { nome: 'ALPHA', categoria: 'AG', pokemon: roster(['Garchomp', 'Garchomp', 'Ditto', 'Pikachu', 'Mew', 'Snorlax']) } } },
            lu: { info: { name: 'Lu' }, teams: { g: { nome: 'GAMMA', categoria: 'AG', pokemon: roster(['Gyarados', 'Charizard', 'Blissey', 'Tyranitar']) } } }
        },
        seasons: { s1: { info: { name: 'S1', status: 'playing' }, showdowns: { sd1: {
            info: { categoria: 'AG', player1: 'Didi', player2: 'Lu', data: '2026-02-01' },
            matches: { match1: {
                player1: 'didi', player1Id: 'didi', player2: 'lu', player2Id: 'lu', winnerId: 'didi', team1: 'ALPHA', team2: 'GAMMA',
                score: '1-0', p1score: 1, p2score: 0, p1points: 1, p2points: 0, data: '2026-02-01', categoria: 'AG',
                p1EloAtMatch: 1000, p2EloAtMatch: 1000, p1DeltaElo: 16, p2DeltaElo: -16, setStats: { set1: st }
            } }
        } } } }
    };
    const r = calcola(dati, { stagione: 's1' });
    const primo = r.pokemon.find(p => p.chiave === 'didi::ALPHA::garchomp');
    const secondo = r.pokemon.find(p => p.chiave === 'didi::ALPHA::garchomp#2');
    const ditto = r.pokemon.find(p => p.chiave === 'didi::ALPHA::ditto');
    assert.ok(primo && secondo && ditto);
    assert.equal(secondo.titolare, 1);
    assert.ok(secondo.koFatti >= 1);
    assert.equal(primo.titolare, 0);
    assert.equal(primo.koFatti, 0);
    assert.equal(primo.portato, 1, 'portato ma rimasto in panchina: una presenza fra i portati');
    assert.equal(ditto.specie, 'Ditto');
    // i fiocchi (lo stesso lookup che usano il Box e la pagina pubblica): il secondo Garchomp vede i suoi numeri
    const team = dati.players.didi.teams.a;
    const f = (nome, i) => Fiocchi.trova(r, { player: 'didi', team: 'ALPHA', specie: nome, ordinale: Fiocchi.ordinaleDi(team, team.pokemon[i], i) });
    assert.equal(f('Garchomp', 0).chiave, 'didi::ALPHA::garchomp');
    assert.equal(f('Garchomp', 1).chiave, 'didi::ALPHA::garchomp#2');
    assert.equal(f('Garchomp', 1).titolare, 1);
});

test('box e pagina pubblica passano la posizione del Pokémon ai fiocchi', () => {
    const box = fs.readFileSync(path.join(__dirname, '..', 'docs', 'box.html'), 'utf8');
    const pub = fs.readFileSync(path.join(__dirname, '..', 'docs', 'public.html'), 'utf8');
    assert.match(box, /apriPkmDettaglio\(team\.pokemon\[pkmIndex\], pkmNameUrl, pkmIndex\)/);
    assert.match(box, /function apriPkmDettaglio\(pokemonData, pkmNameUrl, indice\)/);
    assert.match(box, /pokemon: pokemonData, indice,/);
    // la pagina pubblica non ha più i dati del Pokémon scritti nell'HTML (mosse, EV...): passa l'indice, e il Pokémon sta nella lista della pagina
    assert.match(pub, /data-i="\$\{pIndex\}"/, 'la card porta la posizione del Pokémon');
    assert.match(pub, /apriPkmDettaglio\(team\.pokemon\[i\], SpritePkm\.id\(team\.pokemon\[i\]\.nome\), i\)/);
    assert.match(pub, /async function apriPkmDettaglio\(pokemonData, pkmNameUrl, indice\)/);
    assert.match(pub, /data-fiocchi-pkm="\$\{Number\.isInteger\(indice\) \? indice : 0\}"/, 'la casella delle medagliette porta la posizione');
    assert.match(pub, /casella\.dataset\.fiocchiPkm = String\(posto\)/);
    assert.match(pub, /amicizia: p => p === pokemonData && amicizia/);
    // il server passa i soprannomi del team e i portati col nome
    const partitaJs = fs.readFileSync(path.join(__dirname, '..', 'functions', 'partita.js'), 'utf8');
    assert.match(partitaJs, /const nomi = lato => \(b\[lato\]\.team \|\| \[\]\)\.map\(s => s\.name \|\| s\.species\)/);
    assert.match(partitaJs, /nomi: \{ p1: nomi\('p1'\), p2: nomi\('p2'\) \}/);
    assert.match(partitaJs, /specie: p\.set\.species, nome: p\.set\.name \|\| ''/);
});
