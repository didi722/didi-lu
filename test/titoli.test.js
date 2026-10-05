'use strict';
// titoli.js: soglie dei titoli (tipi e Pokémon), titolo equipaggiato, colonna Pokémon degli Achievements e badge.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../docs/titoli.js');

const testi = elenco => elenco.map(t => t.testo);

test('tipi: il primo scaglione chiede solo presenze, il secondo anche le vittorie, il terzo anche i KO', () => {
    assert.deepEqual(testi(T.titoliSbloccati({ ghost: { played: 29, won: 99, ko: 99 } })), []);
    assert.deepEqual(testi(T.titoliSbloccati({ ghost: { played: 30, won: 0, ko: 0 } })), ['Hex Maniac']);
    // tante presenze ma poche vittorie: resta al primo
    assert.deepEqual(testi(T.titoliSbloccati({ ghost: { played: 500, won: 39, ko: 999 } })), ['Hex Maniac']);
    assert.deepEqual(testi(T.titoliSbloccati({ ghost: { played: 120, won: 40, ko: 0 } })), ['Hex Maniac', 'Ghost Gym Leader']);
    // superquattro: servono anche i KO
    assert.deepEqual(testi(T.titoliSbloccati({ ghost: { played: 400, won: 140, ko: 179 } })), ['Hex Maniac', 'Ghost Gym Leader']);
    assert.deepEqual(testi(T.titoliSbloccati({ ghost: { played: 400, won: 140, ko: 180 } })), ['Hex Maniac', 'Ghost Gym Leader', 'Ghost Elite Four']);
});

test('i tipi si leggono anche con la maiuscola e con dati mancanti', () => {
    assert.deepEqual(testi(T.titoliSbloccati({ Ghost: { played: 30 }, nonsense: { played: 999 }, fire: null })), ['Hex Maniac']);
    assert.deepEqual(T.titoliSbloccati(null, null), []);
});

test('Pokémon: Fan, Specialist, Master', () => {
    const uso = (played, won, ko) => ({ scizor: { nome: 'Scizor', played, won, ko } });
    assert.deepEqual(testi(T.titoliSbloccati({}, uso(24, 99, 99))), []);
    assert.deepEqual(testi(T.titoliSbloccati({}, uso(25, 0, 0))), ['Scizor Fan']);
    assert.deepEqual(testi(T.titoliSbloccati({}, uso(80, 30, 0))), ['Scizor Fan', 'Scizor Specialist']);
    assert.deepEqual(testi(T.titoliSbloccati({}, uso(200, 80, 99))), ['Scizor Fan', 'Scizor Specialist']);
    assert.deepEqual(testi(T.titoliSbloccati({}, uso(200, 80, 100))), ['Scizor Fan', 'Scizor Specialist', 'Scizor Master']);
});

test('progresso: cosa manca e quanto manca al prossimo scaglione', () => {
    const p = T.progresso(T.LIVELLI_TIPO, { played: 100, won: 10, ko: 5 });
    assert.equal(p.livello, 1);
    assert.equal(p.prossimo.nome('ghost'), 'Ghost Gym Leader');
    assert.deepEqual(p.mancano, { played: 20, won: 30, ko: 0 });
    assert.deepEqual(p.barre.map(b => b.c), ['played', 'won']);                 // il KO non serve ancora
    assert.ok(Math.abs(p.pct - (100 / 120 + 10 / 40) / 2) < 1e-9);
    const ultimo = T.progresso(T.LIVELLI_TIPO, { played: 999, won: 999, ko: 999 });
    assert.equal(ultimo.prossimo, null);
    assert.equal(ultimo.pct, 1);
});

test('descriviTitolo riconosce titoli di tipo e di Pokémon', () => {
    const tipi = { ghost: { played: 130, won: 41, ko: 20 } };
    const pokemon = { scizor: { nome: 'Scizor', played: 90, won: 31, ko: 12 } };
    const gym = T.descriviTitolo('Ghost Gym Leader', tipi, pokemon);
    assert.equal(gym.categoria, 'tipo'); assert.equal(gym.tipo, 'ghost'); assert.equal(gym.livelloIndice, 1);
    assert.equal(gym.progresso.prossimo.nome('ghost'), 'Ghost Elite Four');
    const base = T.descriviTitolo('Hex Maniac', tipi, pokemon);
    assert.equal(base.tipo, 'ghost'); assert.equal(base.livelloIndice, 0);
    const spec = T.descriviTitolo('Scizor Specialist', tipi, pokemon);
    assert.equal(spec.categoria, 'pokemon'); assert.equal(spec.nome, 'Scizor'); assert.equal(spec.livelloIndice, 1);
    assert.equal(T.descriviTitolo('No Title', tipi, pokemon), null);
    assert.equal(T.descriviTitolo('', tipi, pokemon), null);
    assert.equal(T.descriviTitolo('Qualcosa di strano', tipi, pokemon), null);
    // un titolo di tipo di cui non ci sono più dati si riconosce comunque dal nome
    assert.equal(T.descriviTitolo('Fire Elite Four', {}, {}).tipo, 'fire');
    assert.equal(T.descriviTitolo('Kindler', {}, {}).tipo, 'fire');
});

test('colonna Pokémon: le specie più avanti verso le soglie, non tutte', () => {
    const uso = {};
    for (let i = 0; i < 12; i++) uso['mon' + i] = { nome: 'Mon' + i, played: 1 + i, won: 0, ko: 0 };
    uso.master = { nome: 'Master', played: 300, won: 100, ko: 150 };      // già al massimo
    uso.quasi = { nome: 'Quasi', played: 79, won: 30, ko: 0 };             // a un passo da Specialist
    uso.mai = { nome: 'Mai', played: 0, won: 0, ko: 0 };                   // mai sceso: fuori
    const elenco = T.pokemonPiuVicini(uso, 5);
    assert.equal(elenco.length, 5);
    assert.equal(elenco[0].nome, 'Master');
    assert.equal(elenco[1].nome, 'Quasi');                               // livello 1 (Fan), 99% verso il 2
    assert.ok(!elenco.some(e => e.nome === 'Mai'));
    assert.equal(T.pokemonPiuVicini(uso).length, T.MAX_POKEMON_ACHIEVEMENTS);
    assert.deepEqual(T.pokemonPiuVicini(null), []);
});

test('badge delle serie: livello, descrizione, avanzamento; fondatori', () => {
    const b = T.badgeSbloccati({ maxcleanstrike: 5, cleanstrike: 2, maxcleanstrikedate: '2026-03-04', maxwonstrike: 4, maxsdstrike: 7, sdstrike: 7, sdwonstrikedate: '2026-05-01' }, 'Tom');
    assert.deepEqual(b.map(x => `${x.id}:${x.livello}`), ['clean:silver', 'sd:gold']);       // win streak 4 < 5: nessun badge
    assert.equal(b[0].descrizione, '5 matches undefeated');
    assert.equal(b[0].obiettivo, 7);
    assert.equal(b[0].img, 'immagini/badge-allenatore-cleanstreak-silver.png');
    assert.equal(b[1].img, 'immagini/badge-allenatore-sdstreak-gold.png');
    assert.equal(b[0].data, '04/03/2026');
    assert.equal(b[1].obiettivo, 7);                       // oro: l'obiettivo resta il massimo
    assert.equal(T.badgeSbloccati({}, 'didi')[0].id, 'founder');
    assert.equal(T.badgeSbloccati({}, 'didi')[0].img, 'immagini/badge-allenatore-founder.png');
    assert.deepEqual(T.badgeSbloccati(null, 'tom'), []);
});

test('le soglie crescono (altrimenti "contare gli scaglioni" non basterebbe)', () => {
    for (const livelli of [T.LIVELLI_TIPO, T.LIVELLI_POKEMON]) {
        for (let i = 1; i < livelli.length; i++) {
            for (const c of ['played', 'won', 'ko']) assert.ok(livelli[i][c] >= livelli[i - 1][c], `${c} scaglione ${i}`);
        }
    }
    assert.equal(Object.keys(T.TIPI).length, 18);
});
