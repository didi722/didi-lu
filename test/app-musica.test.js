'use strict';
// La musica dell'app (docs/app-musica.js): il brano più da battaglia della playlist, e la posizione che si ricorda tra una pagina e l'altra.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../docs/app-musica.js');

test('leggiBrani e scegli: dal foglio vince il titolo più da battaglia; i brani calmi (Center, ninna nanna) non contano', () => {
    const csv = 'Nome,Link\n"Pokémon Center",https://a.org/1.mp3\nRoute 101,https://a.org/2.mp3\n"Battle! Trainer",https://a.org/3.mp3\n"Battle! Wild Pokémon",https://a.org/4.mp3\nsenza link,\n';
    const b = M.leggiBrani(csv);
    assert.equal(b.length, 4);
    assert.deepEqual(M.scegli(b), { nome: 'Battle! Trainer', url: 'https://a.org/3.mp3' }, 'Battle + Trainer batte Battle e basta');
    assert.equal(M.scegli(M.leggiBrani('Pokémon Center,https://a.org/1.mp3\nLullaby,https://a.org/9.mp3')), null);
    assert.equal(M.scegli([]), null);
    assert.equal(M.punteggio('Pokémon Center Battle'), 0);
});

test('avvia: usa il brano scelto, ignora chi rimette il Pokémon Center e riprende dal punto in cui era la pagina prima', () => {
    const mem = { appMusicaBrano1: JSON.stringify({ url: 'https://a.org/3.mp3', nome: 'Battle' }) }, ses = { appMusicaPosto1: JSON.stringify({ url: 'https://a.org/3.mp3', t: 42 }) };
    const archivio = m => ({ getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } });
    const attr = {};
    const audio = { readyState: 4, duration: 200, paused: true, currentTime: 0, setAttribute: (k, v) => { attr[k] = v; }, play: () => { audio.paused = false; return Promise.resolve(); }, addEventListener() {} };
    const win = { document: { documentElement: { classList: { contains: c => c === 'app' } }, getElementById: () => audio, addEventListener() {} }, localStorage: archivio(mem), sessionStorage: archivio(ses), addEventListener() {}, setInterval() {} };
    const r = M.avvia(win);
    assert.equal(r.brano(), 'https://a.org/3.mp3');
    assert.equal(audio.currentTime, 42);
    assert.equal(audio.paused, false);
    audio.src = M.RISERVA;
    assert.equal(audio.src, 'https://a.org/3.mp3', 'la pagina non rimette il Pokémon Center');
    mem.userMusicPref = 'off';
    audio.paused = true;
    assert.equal(M.avvia({ ...win, document: { ...win.document, getElementById: () => ({ ...audio, paused: true, play: () => { throw new Error('spenta'); } }) } }).audio.paused, true, 'spenta resta spenta');
});
