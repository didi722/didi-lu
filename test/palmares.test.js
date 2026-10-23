'use strict';
// docs/palmares.js: la pagina Trophy Archive (tutte le stagioni e le cup, chiuse e in corso, con il vincitore).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../docs/palmares.js');

const INFO = {
    sbeta: { name: 'Beta', status: 'closed', winner: 'Didi' },
    s0: { name: "Sant'Alvise I", status: 'closed', winner: 'Didi', endDate: '2026-04-10' },
    s1: { name: 'Christmas <Cup>', tipo: 'cup', status: 'closed', winner: 'Lu', endDate: '2026-12-24' },
    s2: { name: 'Friuli DOC I', tipo: 'random', status: 'playing' },
    s3: { name: 'Marzabotto I', tipo: 'monoformat', status: 'open' }
};
const GIOCATORI = { didi: { name: 'Didi', color: '#31c489', avatar: 'immagini/a.png' }, lu: { name: 'Lu', color: '#a050c8' } };

test('voci: stagioni e cup (la beta no), le più recenti per prime, con stato e tipo', () => {
    const v = P.voci(INFO);
    assert.equal(v.length, 4);
    assert.equal(v.some(x => x.stagione === 'sbeta'), false);
    assert.deepEqual(v.filter(x => x.stato === 'closed').map(x => [x.stagione, x.tipo, x.data]), [['s1', 'cup', '2026-12-24'], ['s0', 'league', '2026-04-10']]);
    assert.equal(v.find(x => x.stagione === 's2').stato, 'playing');
});

test('html: card con tipo, nome, vincitore e data; il testo è protetto; in corso senza vincitore', () => {
    const v = P.voci(INFO);
    const h = P.html(v.filter(x => x.stato === 'closed'), GIOCATORI);
    assert.match(h, /palm-cup/);
    assert.match(h, /Christmas &lt;Cup&gt;/);
    assert.ok(!h.includes('<Cup>'), 'il testo di chi scrive non entra come HTML');
    assert.match(h, /href="public\.html\?player=lu"/);
    assert.match(h, /24\/12\/2026/);
    assert.match(h, /10\/04\/2026/);
    const incorso = P.html(v.filter(x => x.stato !== 'closed'), GIOCATORI);
    assert.match(incorso, /In progress/);
    assert.match(incorso, /Sign-ups open/);
    assert.ok(!/palm-vincitore/.test(incorso));
});

test('html: il filtro per tipo', () => {
    const v = P.voci(INFO);
    assert.equal((P.html(v, GIOCATORI, 'cup').match(/<article/g) || []).length, 1);
    assert.equal((P.html(v, GIOCATORI, 'all').match(/<article/g) || []).length, 4);
    assert.equal(P.html([], GIOCATORI), '');
});

test('la pagina e il menu: palmares.html carica i suoi file e ogni pagina con il menu ha il link', () => {
    const doc = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
    const pagina = doc('palmares.html');
    for (const f of ['tipo-stagione.js', 'palmares.js']) assert.ok(pagina.includes(`<script src="${f}"></script>`), f);
    assert.ok(pagina.includes('style-palmares.css'));
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'docs')).filter(n => n.endsWith('.html'))) {
        const t = doc(f);
        if (t.includes('href="stats.html" class="menu-item"')) assert.ok(t.includes('href="palmares.html" class="menu-item"'), `${f}: link al Trophy Archive nel menu`);
    }
});
