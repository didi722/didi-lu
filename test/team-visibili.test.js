'use strict';
// Stagioni a scheda chiusa, pagina dei match, "Registered teams": i team degli avversari si vedono solo dopo che sono scesi in
// campo contro di te, e solo i 6 Pokémon. Con la scheda aperta non cambia nulla.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TV = require('../docs/team-visibili.js');

const match = (p1, t1, p2, t2) => ({ player1Id: p1, team1: t1, player2Id: p2, team2: t2, p1score: 2, p2score: 1 });
const showdowns = {
    a: { info: { player1: 'Didi', player2: 'Lu' }, matches: { match1: match('didi', 'Rain Dance', 'lu', 'Sun Team'), match2: match('lu', 'Sun Team', 'didi', 'Rain Dance') } },
    b: { info: { player1: 'Gio', player2: 'Didi' }, matches: { match1: match('gio', 'Trick Room', 'didi', 'Rain Dance') } },
    c: { info: { player1: 'Lu', player2: 'Gio' }, matches: { match1: match('lu', 'Hail Mary', 'gio', 'Trick Room') } },   // senza di me
    d: { info: { player1: 'Ada', player2: 'Didi' }, matches: {} }                                                          // niente giocato
};

test('squadreAffrontate: i team degli avversari che hanno giocato contro di me, da qualunque lato', () => {
    const s = TV.squadreAffrontate(showdowns, 'Didi');
    assert.deepEqual([...s].sort(), ['gio|trick room', 'lu|sun team']);
});

test('squadreAffrontate: i match degli altri non contano, né i miei team, né uno showdown ancora senza match', () => {
    const s = TV.squadreAffrontate(showdowns, 'Didi');
    assert.ok(!s.has('lu|hail mary'), 'Lu ha giocato solo contro Gio con quel team');
    assert.ok(!s.has('didi|rain dance'));
    assert.deepEqual([...TV.squadreAffrontate(showdowns, 'Ada')], [], 'Ada ha uno showdown ma nessun match giocato');
});

test('squadreAffrontate: maiuscole e spazi non contano; senza utente o senza dati è vuoto; regge dati strani', () => {
    assert.deepEqual([...TV.squadreAffrontate(showdowns, '  DIDI ')].sort(), ['gio|trick room', 'lu|sun team']);
    assert.equal(TV.squadreAffrontate(showdowns, '').size, 0);
    assert.equal(TV.squadreAffrontate(showdowns, null).size, 0);
    assert.equal(TV.squadreAffrontate(null, 'didi').size, 0);
    assert.equal(TV.squadreAffrontate({ x: null, y: { matches: null }, z: { matches: { m: null } } }, 'didi').size, 0);
});

test('squadreAffrontate: senza gli id nel match si usano quelli dello showdown, poi i nomi', () => {
    const vecchi = {
        a: { info: { player1: 'Didi', player2: 'Lu' }, matches: { m1: { team1: 'Mio', team2: 'Suo' } } },
        b: { info: {}, matches: { m1: { player1: 'Zed', player2: 'Didi', team1: ' Zeta ', team2: 'Mio' } } }
    };
    assert.deepEqual([...TV.squadreAffrontate(vecchi, 'didi')].sort(), ['lu|suo', 'zed|zeta']);
});

test('squadreAffrontate: un match senza il nome del team avversario non rivela niente', () => {
    const s = TV.squadreAffrontate({ a: { matches: { m: { player1Id: 'didi', player2Id: 'lu', team1: 'Mio' } } } }, 'didi');
    assert.equal(s.size, 0);
});

const teamsLu = [{ nome: 'Sun Team', pokemon: [] }, { nome: { valore: 'Hail Mary' }, pokemon: [] }, { nome: 'Segreto', pokemon: [] }];

test('dividiTeam: scheda aperta → si vedono tutti', () => {
    const r = TV.dividiTeam({ chiusa: false, io: 'didi', giocatore: 'lu', teams: teamsLu, affrontate: new Set() });
    assert.equal(r.visibili.length, 3);
    assert.equal(r.nascosti, 0);
});

test('dividiTeam: scheda chiusa → solo i team già scesi in campo contro di me', () => {
    const affrontate = TV.squadreAffrontate(showdowns, 'didi');
    const r = TV.dividiTeam({ chiusa: true, io: 'didi', giocatore: 'Lu', teams: teamsLu, affrontate });
    assert.deepEqual(r.visibili.map(TV.nomeDi), ['Sun Team']);
    assert.equal(r.nascosti, 2);
});

test('dividiTeam: scheda chiusa → i miei team si vedono sempre (anche se non li ho mai usati)', () => {
    const r = TV.dividiTeam({ chiusa: true, io: 'Didi', giocatore: 'didi', teams: teamsLu, affrontate: new Set() });
    assert.equal(r.visibili.length, 3);
    assert.equal(r.nascosti, 0);
});

test('dividiTeam: scheda chiusa e nessuno collegato → niente di nessuno; un team con lo stesso nome ma di un altro giocatore non basta', () => {
    const affrontate = TV.squadreAffrontate(showdowns, 'didi');
    const senza = TV.dividiTeam({ chiusa: true, io: '', giocatore: 'lu', teams: teamsLu, affrontate: new Set() });
    assert.equal(senza.visibili.length, 0);
    assert.equal(senza.nascosti, 3);
    const altro = TV.dividiTeam({ chiusa: true, io: 'didi', giocatore: 'ada', teams: [{ nome: 'Sun Team' }, { nome: 'Trick Room' }], affrontate });
    assert.equal(altro.visibili.length, 0, 'Sun Team e Trick Room li hanno giocati Lu e Gio, non Ada');
});

test('dividiTeam: i team possono arrivare come array o come oggetto di Firebase', () => {
    const come = { 0: { nome: 'Sun Team' }, 1: { nome: 'Segreto' } };
    const r = TV.dividiTeam({ chiusa: true, io: 'didi', giocatore: 'lu', teams: come, affrontate: TV.squadreAffrontate(showdowns, 'didi') });
    assert.equal(r.visibili.length, 1);
    assert.equal(r.nascosti, 1);
    assert.deepEqual(TV.dividiTeam({ chiusa: true, io: 'x', giocatore: 'y', teams: null }), { visibili: [], nascosti: 0 });
});

// ---------- la pagina ----------
const matches = fs.readFileSync(path.join(__dirname, '..', 'docs', 'matches.html'), 'utf8');
const estrai = (da, a) => { const i = matches.indexOf(da), j = matches.indexOf(a, i); assert.ok(i >= 0 && j > i, da); return matches.slice(i, j); };

test('matches.html: carica il modulo e passa il contesto di visibilità a ogni scheda giocatore', () => {
    assert.match(matches, /<script src="team-visibili\.js"><\/script>/);
    const apri = estrai('async function apriModaleTeamsIscritti', 'async function mostraTeamGiocatoreSelezionato');
    assert.match(apri, /if \(!isOpenSheet\) \{[\s\S]*seasons\/\$\{stagioneAttiva\}\/showdowns[\s\S]*TeamVisibili\.squadreAffrontate\(snapShowdowns\.val\(\), io\)/);
    assert.match(apri, /mostraTeamGiocatoreSelezionato\(player\.name, playerMap\[player\.name\], contestoVisibilita\)/);
    assert.match(apri, /users\/\$\{utente\.uid\}\/name/);
});

test('matches.html: i team nascosti non entrano nella pagina; a scheda chiusa niente riga degli strumenti', () => {
    const mostra = estrai('async function mostraTeamGiocatoreSelezionato', '// Chiusura del modale');
    assert.match(mostra, /TeamVisibili\.dividiTeam\(\{[\s\S]*chiusa: visibilita\.chiusa[\s\S]*\}\)/);
    assert.match(mostra, /const listaTeamIscritti = divisi\.visibili;/);
    assert.ok(!/categorieDati\[categoria\]\s*\|\|\s*\[\];\s*if \(listaTeamIscritti/.test(mostra));
    assert.match(mostra, /\$\{visibilita\.chiusa \? '' : `<div class="item-container">/);
    assert.match(mostra, /Closed sheet season/);
});
