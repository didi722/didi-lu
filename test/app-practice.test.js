'use strict';
// Practice, la pagina nuova dell'app (docs/practice.html, app-practice.js): contro la CPU o amichevole con un altro allenatore.
//   - la parte pura: i team e gli allenatori da mostrare, gli indirizzi, l'HTML delle schermate;
//   - la pagina: solo nell'app (dal sito da PC si torna alla home), una sola tessera in home, via dal Box e da Trainers.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../docs/app-comune.js');
const P = require('../docs/app-practice.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

test('elencoTeam: i team del giocatore in ordine di nome, con formato e le specie (al massimo sei); Firebase dà anche oggetti al posto degli array', () => {
    const l = P.elencoTeam({
        b: { nome: 'beta', categoria: 'OU', pokemon: [{ nome: 'Garchomp' }, { nome: '' }, { nome: 'Corviknight' }] },
        a: { nome: 'Alfa', pokemon: { 0: { nome: 'Pikachu' }, 1: { nome: 'a' }, 2: { nome: 'b' }, 3: { nome: 'c' }, 4: { nome: 'd' }, 5: { nome: 'e' }, 6: { nome: 'f' } } },
        c: { pokemon: [] },
        x: null
    });
    assert.deepEqual(l.map(t => t.id), ['a', 'b', 'c']);
    assert.deepEqual(l[0].specie, ['Pikachu', 'a', 'b', 'c', 'd', 'e'], 'sei al massimo');
    assert.deepEqual(l[1], { id: 'b', nome: 'beta', formato: 'OU', specie: ['Garchomp', 'Corviknight'] });
    assert.equal(l[2].nome, 'Team', 'senza nome si chiama Team');
    assert.deepEqual(P.elencoTeam(null), []);
});

test('elencoGiocatori: gli altri allenatori (non tu); prima chi ha un Elo, dal più alto, poi per nome; l\'Elo solo con abbastanza showdown', () => {
    const ind = (sd, r) => ({ stats: { 'individual-stats': { showdownsPlayed: sd, ranking: r } } });
    const l = P.elencoGiocatori({
        didi: { info: { name: 'Didi' }, ...ind(5, 1000) },
        Anna: { info: { name: 'Anna', color: '#ff0000', avatar: 'a.png' }, ...ind(4, 1200.4) },
        zeno: { info: { name: 'Zeno' }, ...ind(1, 1500) },
        bea: { info: { name: 'Bea' } },
        vuoto: null
    }, ' DIDI ');
    assert.deepEqual(l.map(g => g.id), ['anna', 'bea', 'zeno'], 'senza Didi; Anna ha l\'Elo, Bea e Zeno no');
    assert.equal(l[0].elo, 1200);
    assert.equal(l[0].colore, '#ff0000');
    assert.equal(l[2].elo, null, 'un solo showdown: niente Elo');
    assert.deepEqual(P.elencoGiocatori(null, 'x'), []);
});

test('gli indirizzi: contro la CPU col proprio team o con un Random Battle; il nome del formato è ripulito', () => {
    assert.equal(P.indirizzoTeam('t 1&'), 'battle.html?cpu=1&team=t%201%26');
    assert.equal(P.indirizzoRandom({ id: 'gen9randombattle', nome: 'Random Battle (Gen 9)' }), 'battle.html?cpu=1&random=gen9randombattle&nome=Random%20Battle%20(Gen%209)');
    assert.deepEqual(P.VISTE, ['home', 'cpu', 'amichevole']);
});

test('htmlHome: due grandi tessere, contro la CPU e amichevole', () => {
    const h = P.htmlHome();
    assert.match(h, /data-vista="cpu"[\s\S]*VS CPU/);
    assert.match(h, /data-vista="amichevole"[\s\S]*Friendly/);
    assert.equal((h.match(/class="pr-tessera /g) || []).length, 2);
});

test('htmlCpu: i team come carte con le specie, i Random Battle come chip; senza team lo dice e rimanda al Box', () => {
    const team = [{ id: 't1', nome: 'Il mio <OU>', formato: 'OU', specie: ['Garchomp', 'Rotom'] }];
    const h = P.htmlCpu({ team, random: [{ id: 'gen9randombattle', nome: 'Random Battle' }], dex: s => 'dex/' + s + '.png' });
    assert.match(h, /data-team="t1"/);
    assert.match(h, /<b class="pr-nome">Il mio &lt;OU&gt;<\/b><span class="pr-tag">OU<\/span>/);
    assert.equal((h.match(/class="pr-mini"/g) || []).length, 2);
    assert.match(h, /src="dex\/Garchomp\.png"/);
    assert.match(h, /data-random="gen9randombattle" data-nome="Random Battle"/);
    assert.doesNotMatch(h, /pr-vuoto/);
    const v = P.htmlCpu({ team: [], random: [] });
    assert.match(v, /You have no teams yet\. <a href="box\.html">Build one in the Box<\/a>/);
    assert.doesNotMatch(v, /Random battles/);
    assert.match(v, /data-vista="home"/, 'il tasto per tornare a Practice');
    assert.doesNotThrow(() => P.htmlCpu());
});

test('htmlAmichevole: una carta per allenatore col suo colore e l\'Elo (N/A senza); senza nessuno lo dice', () => {
    const h = P.htmlAmichevole({ giocatori: [{ nome: 'Anna', colore: '#ff0000', elo: 1200 }, { nome: 'Bea <b>', colore: 'x', elo: null }] });
    assert.match(h, /data-sfida="Anna" style="--c:#ff0000"/);
    assert.match(h, /1200 <small>Elo<\/small>/);
    assert.match(h, /data-sfida="Bea &lt;b&gt;" style="--c:#31c489"/);
    assert.match(h, /<span class="pr-elo">N\/A<\/span>/);
    assert.match(P.htmlAmichevole({ giocatori: [] }), /There is nobody to play with yet/);
    assert.match(P.htmlAccedi(), /data-accedi="1"/);
});

test('practice.html: solo nell\'app (dal browser si torna alla home), con Firebase, l\'accesso e gli script delle sfide; gli id che servono ci sono', () => {
    const html = docs('practice.html');
    assert.match(html, /<body class="nb pg-practice senza-ads">/);
    assert.match(html, /classList\.contains\('app'\)\) location\.replace\('index\.html'\)/);
    for (const id of ['practice', 'login-modal', 'login-form', 'login-email', 'login-password', 'auth-text']) assert.ok(html.includes(`id="${id}"`), id);
    for (const s of ['sfide.js', 'amichevoli.js', 'formato-random.js', 'sprite-pkm.js', 'controlli.js']) assert.match(html, new RegExp(`<script src="${s}"></script>`), s);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'id ripetuti');
    assert.deepEqual(require('../docs/app.js').SCRIPT_PAGINE['practice.html'], ['app-practice.js'], 'sprite-pkm.js lo carica la pagina stessa');
});

test('in app non si prova più un team dal Box e non si sfida più dalla scheda di un allenatore: si parte da Practice', () => {
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /html\.app-shell :is\(\.azione-cpu, \.tb-prova-cpu\) \{ display: none !important; \}/);
    // le schermate e i ritorni dalla battaglia
    assert.match(docs('battle-ui.js'), /inApp\(\) \? 'practice\.html'/);
    // la tessera in home sta accanto a Matches
    assert.deepEqual(require('../docs/app.js').VOCI.slice(0, 2).map(v => v.id), ['matches', 'practice']);
    assert.ok(C.ICONE.practice && C.ICONE.cpu && C.ICONE.amici);
});

test('il foglio: Practice sta sotto html.app-shell, nella sua pagina', () => {
    const css = docs('app-gioco-pagine.css');
    const righe = css.split('\n').filter(r => /\.pr-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 20, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
});

test('avvia: fuori dall\'app, o senza la pagina, non fa niente', () => {
    assert.equal(P.avvia({ document: { getElementById: () => null, documentElement: { classList: { contains: () => true } } } }), null);
    assert.equal(P.avvia({ document: { getElementById: () => ({}), documentElement: { classList: { contains: () => false } } } }), null);
});
