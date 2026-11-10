'use strict';
// battle-extra.js: a quale carta della colonna laterale corrisponde ciascun Pokémon di Showdown.
// Il file è un modulo del browser: lo si legge e si prova in un contesto isolato, senza pagina.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sorgente = fs.readFileSync(path.join(__dirname, '..', 'docs', 'battle-extra.js'), 'utf8').replace(/^export /gm, '');
const BASI = { 'Calyrex-Ice': 'Calyrex', 'Calyrex-Shadow': 'Calyrex', Calyrex: 'Calyrex', 'Charizard-Mega-X': 'Charizard' };
const dex = { species: { get: s => ({ baseSpecies: BASI[s] || s, name: s }) } };
const dentro = vm.runInNewContext(`${sorgente}\n({ abbina, setDi, S, elencoLato })`, { window: {}, document: {}, console });
const { abbina, setDi, S, elencoLato } = dentro;

const pkm = (speciesForme, name = speciesForme) => ({ speciesForme, name });
const carta = (specie, nome = specie) => ({ specie, nome });
const battle = { dex };

test('due Calyrex dello stesso team, stesso soprannome: ognuno trova la propria carta anche se side.pokemon è rimescolato', () => {
    const carte = [carta('Calyrex-Ice', 'Calyrex'), carta('Calyrex-Shadow', 'Calyrex'), carta('Clefairy')];
    const shadow = pkm('Calyrex-Shadow', 'Calyrex'), ice = pkm('Calyrex-Ice', 'Calyrex'), clefairy = pkm('Clefairy');
    for (const ordine of [[ice, shadow, clefairy], [shadow, ice, clefairy], [clefairy, shadow, ice]]) {
        const [a, b, c] = abbina(battle, carte, ordine);
        assert.equal(a, ice);
        assert.equal(b, shadow);
        assert.equal(c, clefairy);
    }
});

test('con soprannomi diversi e stessa forma si distingue dal soprannome', () => {
    const carte = [carta('Calyrex-Ice', 'Bob'), carta('Calyrex-Ice', 'Ann')];
    const ann = pkm('Calyrex-Ice', 'Ann'), bob = pkm('Calyrex-Ice', 'Bob');
    assert.deepEqual(abbina(battle, carte, [ann, bob]), [bob, ann]);
});

test('una forma cambiata in battaglia (Mega) si abbina per specie base', () => {
    const mega = pkm('Charizard-Mega-X', 'Charizard'), clefairy = pkm('Clefairy');
    assert.deepEqual(abbina(battle, [carta('Charizard'), carta('Clefairy')], [clefairy, mega]), [mega, clefairy]);
});

test('ogni Pokémon di Showdown serve una carta sola; chi non c\'è resta null', () => {
    const carte = [carta('Calyrex-Ice', 'Calyrex'), carta('Calyrex-Ice', 'Calyrex')];
    const unico = pkm('Calyrex-Ice', 'Calyrex');
    const r = abbina(battle, carte, [unico]);
    assert.equal(r.filter(Boolean).length, 1);
    assert.deepEqual(abbina(battle, [carta('Clefairy')], []), [null]);
});

test('setDi sceglie il set della forma giusta anche con lo stesso soprannome', () => {
    const squadra = [
        { name: 'Calyrex', species: 'Calyrex-Shadow', moves: ['Astral Barrage'] },
        { name: 'Calyrex', species: 'Calyrex-Ice', moves: ['Glacial Lance'] }
    ];
    const shadow = pkm('Calyrex-Shadow', 'Calyrex'), ice = pkm('Calyrex-Ice', 'Calyrex');
    S.squadre.p1 = squadra;
    S.battle = { dex, p1: { pokemon: [ice, shadow] } };      // side.pokemon rimescolato
    assert.equal(setDi('p1', ice, dex), squadra[1]);
    assert.equal(setDi('p1', shadow, dex), squadra[0]);
});

test('setDi: un Pokémon con la forma cambiata (Mega) trova il suo set per specie base', () => {
    S.squadre.p1 = [{ name: 'Zard', species: 'Charizard' }, { name: 'Clefairy', species: 'Clefairy' }];
    const mega = pkm('Charizard-Mega-X', 'Zard');
    S.battle = { dex, p1: { pokemon: [pkm('Clefairy'), mega] } };
    assert.equal(setDi('p1', mega, dex), S.squadre.p1[0]);
});

test('setDi: due Pokémon identici nel team hanno ciascuno il proprio set (abbinamento esclusivo)', () => {
    const a = { name: 'Pika', species: 'Pikachu', moves: ['Thunderbolt'] }, b = { name: 'Pika', species: 'Pikachu', moves: ['Surf'] };
    S.squadre.p2 = [a, b];
    const p = pkm('Pikachu', 'Pika'), q = pkm('Pikachu', 'Pika');
    S.battle = { dex, p2: { pokemon: [p, q] } };
    assert.equal(setDi('p2', p, dex), a);
    assert.equal(setDi('p2', q, dex), b);
});

// ---------- Random: il team avversario non si vede (né contro la CPU né contro un altro giocatore) ----------
// Del lato che non si può vedere si elencano solo i Pokémon già scesi in campo; gli altri sono caselle ignote, qualunque dato sia arrivato
// (una squadra registrata, un team preview, delle righe |poke|).
test('Random: il lato avversario mostra solo chi è sceso in campo e le caselle ignote, anche se arriva la squadra o un team preview', () => {
    const salvato = { senza: S.senzaAnteprima, noti: S.latiNoti, open: S.openSheet, squadre: S.squadre, battle: S.battle };
    try {
        const sceso = { speciesForme: 'Pikachu', name: 'Pikachu', ident: 'p2a: Pikachu' };
        const soloAnteprima = [{ speciesForme: 'Mew', name: 'Mew', ident: '' }, { speciesForme: 'Snorlax', name: 'Snorlax', ident: '' }];
        const caduto = { speciesForme: 'Gengar', name: 'Gengar', ident: '', fainted: true };
        S.senzaAnteprima = true; S.latiNoti = ['p1']; S.openSheet = false;
        S.battle = { p1: { totalPokemon: 6, pokemon: [] }, p2: { totalPokemon: 6, pokemon: [sceso, ...soloAnteprima, caduto] } };
        // una squadra già nota per l'avversario (un candidato risolto per errore, un set che passa) non deve uscire
        S.squadre = { p1: [{ species: 'Charizard', name: 'Charizard' }], p2: [{ species: 'Mew' }, { species: 'Snorlax' }, { species: 'Pikachu' }] };
        const avv = elencoLato('p2');
        assert.equal(avv.length, 6, 'sempre 6 caselle');
        assert.deepEqual(avv.filter(x => !x.ignoto).map(x => x.specie), ['Pikachu', 'Gengar'], 'solo chi è sceso in campo (o è già caduto)');
        assert.equal(avv.filter(x => x.ignoto).length, 4);
        // il proprio lato si vede per intero
        assert.deepEqual(elencoLato('p1').map(x => x.specie), ['Charizard']);
        // chi guarda (nessun lato noto): nessuna squadra, solo i Pokémon scesi in campo
        S.latiNoti = [];
        assert.deepEqual(elencoLato('p1').filter(x => !x.ignoto).map(x => x.specie), []);
        // a squadre aperte (open sheet) invece si vede
        S.latiNoti = ['p1']; S.openSheet = true;
        assert.deepEqual(elencoLato('p2').map(x => x.specie), ['Mew', 'Snorlax', 'Pikachu']);
    } finally {
        S.senzaAnteprima = salvato.senza; S.latiNoti = salvato.noti; S.openSheet = salvato.open; S.squadre = salvato.squadre; S.battle = salvato.battle;
    }
});
