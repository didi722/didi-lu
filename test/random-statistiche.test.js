'use strict';
// Le sfide ufficiali Random (match senza team, perché i team li dà Showdown e non esistono nel Box): fanno statistica per l'allenatore
// (punti, vittorie, KO, serie, showdown) ma non per i team e i Pokémon: niente uso dei Pokémon e dei tipi (quindi niente titoli),
// niente badge di team e di Pokémon, niente conteggi globali di utilizzo.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');

const TIPI = { gengar: ['ghost', 'poison'], scizor: ['bug', 'steel'] };
const fetchFinto = async url => {
    const nome = String(url).split('/pokemon/')[1];
    return TIPI[nome]
        ? { ok: true, json: async () => ({ types: TIPI[nome].map(t => ({ type: { name: t } })) }) }
        : { ok: false, json: async () => ({}) };
};

function caricaSito(db) {
    const file = path.join(__dirname, '..', 'docs', 'risultati-match.js');
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: fetchFinto, db });
    vm.runInContext(fs.readFileSync(file, 'utf8'), contesto, { filename: file });
    return contesto;
}

const pk = (specie, koFatti) => ({ specie, portato: true, sceso: true, titolare: true, koFatti, svenuto: false });
const setVinto = (specie, ko) => ({ vincitore: 'p1', p1: { pokemon: { a: pk(specie, ko) } }, p2: { pokemon: { a: pk('Altro', 0) } } });

function dbDiProva() {
    return creaDb({
        players: {
            didi: { teams: { t1: { nome: 'Alpha', pokemon: [{ nome: 'Gengar' }] } } },
            lu: {}
        },
        seasons: {
            s1: {
                info: { name: 'Stagione' },
                leaderboard: { didi: { won: 3, lost: 0, setW: 6, setL: 0 } },
                showdowns: {
                    // uno showdown con un team vero
                    d1: {
                        info: { categoria: 'OU', data: '10/10/2026', vincitoreShowdown: 'didi' },
                        matches: {
                            match1: { player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: 'Alpha', team2: 'Beta', p1score: 2, p2score: 0, p1points: 3, p2points: 0,
                                setStats: { set1: setVinto('Gengar', 2), set2: setVinto('Gengar', 1) } }
                        }
                    },
                    // uno showdown Random: nessun team
                    d2: {
                        info: { categoria: 'Random', data: '11/10/2026', vincitoreShowdown: 'didi' },
                        matches: {
                            match1: { player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: '', team2: '', p1score: 2, p2score: 0, p1points: 3, p2points: 0,
                                setStats: { set1: setVinto('Scizor', 4), set2: setVinto('Scizor', 3) } },
                            match2: { player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: '', team2: '', p1score: 2, p2score: 0, p1points: 3, p2points: 0,
                                setStats: { set1: setVinto('Scizor', 5), set2: setVinto('Scizor', 1) } }
                        }
                    }
                }
            }
        }
    });
}

test('ricalcolo delle statistiche: il Random conta per l\'allenatore (punti, match, showdown, serie)', async () => {
    const db = dbDiProva();
    await caricaSito(db).ricalcolaStatisticheGlobali('didi');
    const st = db.leggi('players/didi/stats');
    const ind = st['individual-stats'];
    assert.equal(ind.points, 9 + 2, 'i punti dei 3 match (anche i Random) più un punto per ogni showdown vinto');
    assert.equal(ind.showdownsPlayed, 2, 'anche lo showdown Random è giocato');
    assert.equal(ind.showdownsWon, 2);
    assert.equal(st['formats-stats'].Random.played, 2);
    assert.equal(st['formats-stats'].Random.won, 2);
    assert.equal(st['formats-stats'].Random.showdownsWon, 1);
    assert.equal(st.badges.maxwonstrike, 3, 'la serie di vittorie include i match Random');
    assert.equal(st.badges.maxshowdownstrike, 2, 'e quella degli showdown');
});

test('ricalcolo delle statistiche: il Random non entra nell\'uso dei Pokémon e dei tipi (niente titoli)', async () => {
    const db = dbDiProva();
    await caricaSito(db).ricalcolaStatisticheGlobali('didi');
    const uso = db.leggi('players/didi/stats/team-stats');
    assert.deepEqual(Object.keys(uso.pokemonusage), ['gengar'], 'solo il Pokémon del match con il team vero');
    assert.equal(uso.pokemonusage.gengar.played, 2);
    assert.equal(uso.pokemonusage.gengar.ko, 3);
    assert.deepEqual(Object.keys(uso.typeusage).sort(), ['ghost', 'poison']);
    assert.equal(uso.typeusage.bug, undefined);
    assert.equal(uso.typeusage.steel, undefined);
});

test('ricalcolo delle statistiche: il Random non dà badge ai Pokémon né statistiche ai team', async () => {
    const db = dbDiProva();
    await caricaSito(db).ricalcolaStatisticheGlobali('didi');
    const badge = db.leggi('players/didi/pokemon-badges');
    assert.deepEqual(Object.keys(badge), ['Gengar']);
    assert.equal(badge.Gengar.played, 1, 'solo il match con il team vero');
    const team = db.leggi('players/didi/teams/t1');
    assert.equal(team.stats.played, 1, 'il team Alpha ha giocato un solo match: i Random non sono suoi');
    assert.equal(team.badges.played, 1);
    assert.equal(team.badges.showdownstrike, 1, 'e solo il suo showdown');
});

test('specieSceseInCampo e calcolaUsoPokemon ignorano i match senza team', () => {
    const sito = caricaSito(creaDb());
    const partite = [
        { vittoria: true, team: '', lato: 'p1', setStats: { set1: setVinto('Scizor', 4) } },
        { vittoria: true, team: 'Alpha', lato: 'p1', setStats: { set1: setVinto('Gengar', 1) } }
    ];
    assert.deepEqual(JSON.parse(JSON.stringify(sito.specieSceseInCampo(partite))), ['Gengar']);
    const uso = JSON.parse(JSON.stringify(sito.calcolaUsoPokemon(partite, s => TIPI[s.toLowerCase()] || [], () => null)));
    assert.deepEqual(Object.keys(uso.specie), ['gengar']);
    // anche senza dati di set: un match senza team non fa comparire la composizione di nessun team
    const senzaSet = JSON.parse(JSON.stringify(sito.calcolaUsoPokemon([{ vittoria: true, team: '', lato: 'p1' }], () => [], () => ({ specie: ['Scizor'], tipi: [['bug']] }))));
    assert.deepEqual(senzaSet, { tipi: {}, specie: {} });
});

test('la pagina Stats conta i Random per l\'allenatore (match, showdown, KO) ma non per team e Pokémon', () => {
    const Statistiche = require('../docs/statistiche.js');
    const seasons = dbDiProva().leggi('seasons');
    // i KO subiti dall'avversario (svenuti) nei due set del match Random
    for (const st of Object.values(seasons.s1.showdowns.d2.matches.match1.setStats)) { st.p2.svenuti = 3; st.p1.svenuti = 1; st.turni = 10; }
    const r = Statistiche.calcola({ players: { didi: { name: 'Didi' }, lu: { name: 'Lu' } }, seasons }, {});
    const didi = r.players.find(p => p.id === 'didi');
    assert.equal(didi.match.vinti, 3);
    assert.equal(didi.showdown.giocati, 2, 'gli showdown Random contano');
    assert.equal(didi.showdown.vinti, 2);
    assert.equal(didi.ko.fatti, 6, 'i KO dei set Random contano per l\'allenatore');
    assert.deepEqual(r.teams.map(t => t.nome).sort(), ['Alpha', 'Beta'], 'nessun team inventato per i Random');
    assert.ok(!r.pokemon.some(p => p.specieId === 'scizor'), 'nessun Pokémon dei team Random');
    const alpha = r.teams.find(t => t.nome === 'Alpha');
    assert.equal(alpha.match.giocati, 1, 'il team Alpha ha giocato solo il suo match');
});

test('l\'uso globale dei Pokémon non conta i Random: un team iscritto che ha giocato solo match Random non è "sceso in campo"', () => {
    const UsoGlobale = require('../docs/uso-globale.js');
    const stagione = giocato => ({
        info: { name: 'Stagione' },
        teams_iscritti: { OU: { didi: { datiTeams: { t1: { id: 't1', nome: 'Alpha', pokemon: [{ nome: 'Gengar' }] } } } } },
        showdowns: {
            d1: { info: { categoria: giocato ? 'OU' : 'Random' }, matches: { match1: { player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: giocato ? 'Alpha' : '', team2: '', p1score: 2, p2score: 0 } } }
        }
    });
    const specieDi = giocato => UsoGlobale.calcola({ seasons: { s1: stagione(giocato) }, players: {} }, {}, []).specie.map(s => s.specieId);
    assert.deepEqual(specieDi(true), ['gengar'], 'con un match del team vero il Pokémon conta');
    assert.deepEqual(specieDi(false), [], 'con soli match Random no');
});

test('il badge Collector conta solo le specie dei team veri: i Pokémon dei match Random non lo fanno salire', () => {
    const Statistiche = require('../docs/statistiche.js');
    const BadgeAllenatore = require('../docs/badge-allenatore.js');
    const squadra = prefisso => ({ pokemon: Object.fromEntries(['A', 'B', 'C', 'D'].map((x, i) => [i, pk(prefisso + x, 1)])) });
    const set = prefisso => ({ vincitore: 'p1', p1: squadra(prefisso), p2: { pokemon: { a: pk('Altro', 0) } } });
    const match = (team, prefisso) => ({
        player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: team, team2: team ? 'Beta' : '', p1score: 2, p2score: 0,
        setStats: { set1: set(prefisso), set2: set(prefisso) }
    });
    const seasons = { s1: { info: {}, showdowns: {
        d1: { info: { categoria: 'OU', data: '1/1/2026' }, matches: { match1: match('Alpha', 'ou') } },
        d2: { info: { categoria: 'Random', data: '2/1/2026' }, matches: { match1: match('', 'rndx'), match2: match('', 'rndy') } }
    } } };
    const players = { didi: { name: 'Didi', teams: [{ nome: 'Alpha', pokemon: [{ nome: 'ouA' }] }] }, lu: { name: 'Lu' } };
    const r = Statistiche.calcola({ players, seasons }, { stagione: 'all' });
    const collector = BadgeAllenatore.calcola(r, 'didi').find(b => b.id === 'collector');
    assert.equal(collector.valore, 4, 'solo le 4 specie del team OU, non le 8 dei team Random');
});

test('i badge dell\'allenatore (tranne il Collector) contano i match Random: partite, set, showdown, KO, set perfetti, Elo', () => {
    const Statistiche = require('../docs/statistiche.js');
    const BadgeAllenatore = require('../docs/badge-allenatore.js');
    const set = { vincitore: 'p1', turni: 10, p1: { svenuti: 0, portati: 4, pokemon: { a: pk('X', 2) } }, p2: { svenuti: 4, portati: 4, pokemon: { a: pk('Y', 0) } } };
    const match = n => ({ player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: '', team2: '', p1score: 2, p2score: 0, p1points: 3,
        p1EloAtMatch: 1000 + n * 10, p1DeltaElo: 10, data: '1/1/2026', setStats: { set1: set, set2: set } });
    const seasons = { s1: { info: {}, showdowns: { d1: { info: { categoria: 'Random', vincitoreShowdown: 'didi', data: '1/1/2026' }, matches: { match1: match(0), match2: match(1) } } } } };
    const r = Statistiche.calcola({ players: { didi: { name: 'Didi' }, lu: { name: 'Lu' } }, seasons }, { stagione: 'all' });
    const v = Object.fromEntries(BadgeAllenatore.calcola(r, 'didi').map(b => [b.id, b.valore]));
    assert.deepEqual({ veteran: v.veteran, matchwinner: v.matchwinner, setcrusher: v.setcrusher, showdown: v.showdown, dominant: v.dominant, knockout: v.knockout, untouchable: v.untouchable, elopeak: v.elopeak },
        { veteran: 1, matchwinner: 2, setcrusher: 4, showdown: 1, dominant: 100, knockout: 16, untouchable: 4, elopeak: 1020 });
    assert.equal(v.collector, 0, 'e il Collector no');
});

// ---------- chiavi di Firebase ----------
test('un Pokémon o un team con il punto nel nome ("Mr. Mime") non ferma il ricalcolo: i punti si aggiornano lo stesso', async () => {
    const stagione = {
        info: { name: 'S', status: 'playing' },
        showdowns: { d1: { info: { categoria: 'OU', data: '2026-10-10', vincitoreShowdown: 'didi' }, matches: {
            match1: { player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: 'Team Mr. Mime', team2: 'Beta', p1score: 3, p2score: 0, p1points: 2 }
        } } }
    };
    const db = creaDb({
        players: { didi: { teams: [{ nome: 'Team Mr. Mime', pokemon: [{ nome: 'Mr. Mime' }, { nome: 'Gengar' }] }] }, lu: {} },
        seasons: { s1: stagione }
    });
    const sito = caricaSito(db);
    await sito.ricalcolaStatisticheGlobali('didi');
    assert.equal(db.leggi('players/didi/stats/individual-stats/points'), 3, 'i punti del match più il bonus dello showdown');
    assert.deepEqual(Object.keys(db.leggi('players/didi/pokemon-badges')).sort(), ['Gengar', 'Mr_ Mime']);
    await sito.aggiornaLeaderboard('s1');
    const lb = db.leggi('seasons/s1/leaderboard/didi');
    assert.equal(lb.points, 3);
    assert.ok(lb.teams['Team Mr_ Mime'], 'il team con il punto nel nome è salvato con la chiave "pulita"');
    assert.equal(lb.records.mostUsedTeam.name, 'Team Mr. Mime', 'il nome vero resta nei dati');
});

test('se i badge dei Pokémon non si possono salvare, punti e statistiche si salvano lo stesso', async () => {
    const db = creaDb({ players: { didi: {}, lu: {} }, seasons: { s1: { info: { name: 'S' }, showdowns: { d1: { info: { categoria: 'OU', data: '2026-10-10' }, matches: {
        match1: { player1Id: 'didi', player2Id: 'lu', winnerId: 'didi', team1: 'A', team2: 'B', p1score: 3, p2score: 0, p1points: 2 } } } } } } });
    const vero = db.ref;
    db.ref = p => (String(p).endsWith('/pokemon-badges') ? { ...vero(p), set: async () => { throw new Error('rifiutato'); } } : vero(p));
    await caricaSito(db).ricalcolaStatisticheGlobali('didi');
    assert.equal(db.leggi('players/didi/stats/individual-stats/points'), 2);
});
