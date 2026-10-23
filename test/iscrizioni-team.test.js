'use strict';
// Iscrizioni ai team delle stagioni: la fotografia salvata all'iscrizione segue il team del Box (nome, Pokémon).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { creaDb } = require('./db-finto');
const IscrizioniTeam = require('../docs/iscrizioni-team.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const copia = x => JSON.parse(JSON.stringify(x));
const pk = (...nomi) => nomi.map(nome => ({ nome }));

function mondo(statoStagione = 'open') {
    return {
        players: { didi: { teams: { t1: { nome: 'Didi Nuovo', pokemon: pk('Gengar', 'Scizor') }, t2: { nome: 'Altro', pokemon: pk('Zapdos') } } }, lu: { teams: { t1: { nome: 'Lu OU', pokemon: pk('Garchomp') } } } },
        seasons: {
            s1: {
                info: { status: statoStagione },
                teams_iscritti: { OU: {
                    didi: { teamIds: ['t1', 't2'], datiTeams: [{ id: 't1', nome: 'Didi Vecchio', pokemon: pk('Gengar') }, { id: 't2', nome: 'Altro', pokemon: pk('Zapdos') }] },
                    lu: { teamIds: ['t1'], datiTeams: [{ id: 't1', nome: 'Lu OU', pokemon: pk('Garchomp') }] }
                } },
                showdowns: { sd1: { info: {}, matches: {
                    match1: { player1Id: 'didi', player2Id: 'lu', team1: 'Didi Vecchio', team2: 'Lu OU' },
                    match2: { player1Id: 'lu', player2Id: 'didi', team1: 'Lu OU', team2: 'didi vecchio' }
                } } }
            },
            chiusa: { info: { status: 'closed' }, teams_iscritti: { OU: { didi: { datiTeams: [{ id: 't1', nome: 'Storia', pokemon: [] }] } } } }
        }
    };
}

test('piano: aggiorna nome e Pokémon della fotografia, solo dove cambiano; le stagioni chiuse non si toccano', () => {
    const m = mondo();
    const p = copia(IscrizioniTeam.piano(m.seasons, m.players));
    assert.deepEqual(Object.keys(p.iscrizioni), ['seasons/s1/teams_iscritti/OU/didi/datiTeams/0']);
    const nuova = p.iscrizioni['seasons/s1/teams_iscritti/OU/didi/datiTeams/0'];
    assert.equal(nuova.nome, 'Didi Nuovo');
    assert.deepEqual(nuova.pokemon, pk('Gengar', 'Scizor'));
    assert.equal(nuova.id, 't1');
    assert.deepEqual(p.rinomine.map(r => [r.giocatore, r.da, r.a]), [['didi', 'Didi Vecchio', 'Didi Nuovo']]);
});

test('piano: i match già salvati con il vecchio nome (di quel giocatore, in qualunque lato) prendono il nuovo', () => {
    const m = mondo('playing');
    const p = copia(IscrizioniTeam.piano(m.seasons, m.players));
    assert.deepEqual(p.match, {
        'seasons/s1/showdowns/sd1/matches/match1/team1': 'Didi Nuovo',
        'seasons/s1/showdowns/sd1/matches/match2/team2': 'Didi Nuovo'
    });
    assert.deepEqual(copia(IscrizioniTeam.piano(m.seasons, m.players, { conMatch: false })).match, {});
});

test('piano: filtro per giocatore e team; team cancellato dal Box e stagioni non aggiornabili restano com\'erano', () => {
    const m = mondo();
    assert.equal(Object.keys(IscrizioniTeam.piano(m.seasons, m.players, { giocatore: 'lu' }).iscrizioni).length, 0);
    assert.equal(Object.keys(IscrizioniTeam.piano(m.seasons, m.players, { giocatore: 'DIDI', teamId: 't2' }).iscrizioni).length, 0);
    assert.equal(Object.keys(IscrizioniTeam.piano(m.seasons, m.players, { giocatore: 'didi', teamId: 't1' }).iscrizioni).length, 1);
    delete m.players.didi.teams.t1;
    assert.equal(Object.keys(IscrizioniTeam.piano(m.seasons, m.players).iscrizioni).length, 0, 'team non più nel Box');
    const chiusa = mondo('closed');
    assert.equal(Object.keys(IscrizioniTeam.piano(chiusa.seasons, chiusa.players).iscrizioni).length, 0);
});

test('piano: due team che si scambiano il nome non si pestano nei match', () => {
    const seasons = { s1: { info: { status: 'playing' }, teams_iscritti: { OU: { didi: { datiTeams: [{ id: 'a', nome: 'Uno', pokemon: [] }, { id: 'b', nome: 'Due', pokemon: [] }] } } },
        showdowns: { sd: { matches: { m1: { player1Id: 'didi', team1: 'Uno' }, m2: { player1Id: 'didi', team1: 'Due' } } } } } };
    const players = { didi: { teams: { a: { nome: 'Due', pokemon: [] }, b: { nome: 'Uno', pokemon: [] } } } };
    const p = copia(IscrizioniTeam.piano(seasons, players));
    assert.equal(p.match['seasons/s1/showdowns/sd/matches/m1/team1'], 'Due');
    assert.equal(p.match['seasons/s1/showdowns/sd/matches/m2/team1'], 'Uno');
});

test('sincronizza: scrive nel database (solo il giocatore chiesto, oppure tutti)', async () => {
    const db = creaDb(mondo('playing'));
    await IscrizioniTeam.sincronizza(db, { giocatore: 'didi', teamId: 't1', conMatch: false });
    assert.equal(db.leggi('seasons/s1/teams_iscritti/OU/didi/datiTeams/0/nome'), 'Didi Nuovo');
    assert.equal(db.leggi('seasons/s1/showdowns/sd1/matches/match1/team1'), 'Didi Vecchio', 'senza conMatch i match non si toccano');
    await IscrizioniTeam.sincronizza(db);
    assert.equal(db.leggi('seasons/s1/showdowns/sd1/matches/match1/team1'), 'Didi Vecchio', 'la fotografia ora è allineata: niente più rinomine da fare');
    const db2 = creaDb(mondo('playing'));
    await IscrizioniTeam.sincronizza(db2);
    assert.equal(db2.leggi('seasons/s1/showdowns/sd1/matches/match1/team1'), 'Didi Nuovo');
    assert.equal(db2.leggi('seasons/chiusa/teams_iscritti/OU/didi/datiTeams/0/nome'), 'Storia');
});

test('cablaggio: il Box riallinea l\'iscrizione quando si salva un team; l\'admin ha il tasto retroattivo', () => {
    const box = leggi('docs/box.html');
    assert.match(box, /<script src="iscrizioni-team\.js"><\/script>/);
    assert.match(box, /IscrizioniTeam\.sincronizza\(databaseRef, \{ giocatore: playerID, teamId: editingId, conMatch: false \}\)/);
    const admin = leggi('docs/admin.html');
    assert.match(admin, /<script src="iscrizioni-team\.js"><\/script>/);
    assert.match(admin, /onclick="sincronizzaIscrizioniAdmin\(\)"/);
    assert.match(admin, /async function sincronizzaIscrizioniAdmin[\s\S]*IscrizioniTeam\.applica[\s\S]*aggiornaLeaderboard\(sid\)[\s\S]*ricalcolaStatisticheGlobali\(g\)/);
});
