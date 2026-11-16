'use strict';
// Letture leggere del database: solo i colori dei giocatori e lo stato/i team iscritti delle stagioni, non i nodi interi (players ~210 KB, seasons ~760 KB).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../docs/db-leggero.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggiFile = f => fs.readFileSync(path.join(DOCS, f), 'utf8');

// un database finto che conta cosa si legge
function dbFinto(dati, { databaseURL = 'https://x.firebaseio.com' } = {}) {
    const letti = [];
    const prendi = percorso => percorso.split('/').filter(Boolean).reduce((n, k) => (n == null ? n : n[k]), dati);
    return {
        letti,
        app: { options: { databaseURL } },
        ref: percorso => ({ once: async () => { letti.push(percorso); const v = prendi(percorso); return { val: () => (v === undefined ? null : v) }; } })
    };
}
const fetchFinto = (dati, { ok = true } = {}) => async url => {
    const m = /\/([^/]+)\.json\?shallow=true$/.exec(url);
    const nodo = m && dati[m[1]];
    return { ok: ok && !!nodo, json: async () => Object.fromEntries(Object.keys(nodo || {}).map(k => [k, true])) };
};
const DATI = {
    players: {
        didi: { info: { color: '#6B93B0', name: 'Didi' }, teams: { t1: { grosso: 'x'.repeat(5000) } }, stats: { a: 1 } },
        'El Burraco': { info: { color: '#31C489' }, teams: {} },
        senza: { info: { name: 'Senza colore' } }
    },
    seasons: {
        sbeta: { info: { status: 'closed', name: 'Beta' }, showdowns: { sd1: { grosso: 'y'.repeat(9000) } }, teams_iscritti: { OU: {} } },
        s0: { info: { status: 'playing' }, showdowns: { sd1: { grosso: 'y'.repeat(9000) } }, teams_iscritti: { 'Little Cup': { didi: { datiTeams: [{ nome: 'Team b' }] } } }, mvp: { a: 1 } }
    }
};

test('chiaviDi: le chiavi senza scaricare i dati (REST shallow); senza rete o con un errore, null', async () => {
    const db = dbFinto(DATI);
    assert.deepEqual(await D.chiaviDi(db, 'players', { fetch: fetchFinto(DATI) }), ['didi', 'El Burraco', 'senza']);
    assert.equal(await D.chiaviDi(db, 'players', { fetch: fetchFinto(DATI, { ok: false }) }), null, 'le regole non lo permettono');
    assert.equal(await D.chiaviDi(db, 'players', { fetch: async () => { throw new Error('rete'); } }), null);
    assert.equal(await D.chiaviDi({ ref: () => {} }, 'players', { fetch: fetchFinto(DATI), radice: {} }), null, 'senza l\'indirizzo del database');
    assert.equal(db.letti.length, 0, 'nessun dato letto');
});

test('coloriGiocatori: legge solo players/{id}/info/color di ognuno (minuscolo), mai il nodo intero', async () => {
    const db = dbFinto(DATI);
    const colori = await D.coloriGiocatori(db, { fetch: fetchFinto(DATI), radice: {} });
    assert.deepEqual(colori, { didi: '#6B93B0', 'el burraco': '#31C489' }, 'chi non ha il colore non c\'è');
    assert.ok(!db.letti.includes('players'), 'players intero non si legge');
    assert.deepEqual(db.letti.sort(), ['players/El Burraco/info/color', 'players/didi/info/color', 'players/senza/info/color']);
});

test('coloriGiocatori: si ricorda per 5 minuti nella scheda del browser (cambiando pagina non si rilegge), poi si rilegge', async () => {
    const mem = {}; const sessionStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
    let ora = 1000;
    const opzioni = { fetch: fetchFinto(DATI), radice: { sessionStorage }, adesso: () => ora };
    const a = dbFinto(DATI);
    await D.coloriGiocatori(a, opzioni);
    assert.equal(a.letti.length, 3);
    ora += 4 * 60 * 1000;
    const b = dbFinto(DATI);
    assert.deepEqual(await D.coloriGiocatori(b, opzioni), { didi: '#6B93B0', 'el burraco': '#31C489' });
    assert.equal(b.letti.length, 0, 'dalla memoria');
    ora += 2 * 60 * 1000;
    const c = dbFinto(DATI);
    await D.coloriGiocatori(c, opzioni);
    assert.equal(c.letti.length, 3, 'scaduta: si rilegge');
    // la memoria rotta non ferma niente
    const rotto = { getItem: () => { throw new Error('bloccata'); }, setItem: () => { throw new Error('bloccata'); } };
    assert.deepEqual(await D.coloriGiocatori(dbFinto(DATI), { fetch: fetchFinto(DATI), radice: { sessionStorage: rotto } }), { didi: '#6B93B0', 'el burraco': '#31C489' });
});

test('coloriGiocatori: se lo shallow non si può fare si ripiega sulla lettura intera, con lo stesso risultato', async () => {
    const db = dbFinto(DATI);
    const colori = await D.coloriGiocatori(db, { fetch: fetchFinto(DATI, { ok: false }), radice: {} });
    assert.deepEqual(colori, { didi: '#6B93B0', 'el burraco': '#31C489' });
    assert.deepEqual(db.letti, ['players']);
});

test('stagioniLeggere: solo info e teams_iscritti di ogni stagione (niente showdown), e team-bloccati.js ne ricava gli stessi risultati di prima', async () => {
    const TB = require('../docs/team-bloccati.js');
    const db = dbFinto(DATI);
    const leggere = await D.stagioniLeggere(db, { fetch: fetchFinto(DATI), radice: {} });
    assert.deepEqual(Object.keys(leggere).sort(), ['s0', 'sbeta']);
    assert.ok(db.letti.every(p => /\/(info|teams_iscritti)$/.test(p)), 'mai i showdown: ' + db.letti.join(', '));
    assert.deepEqual([...TB.nomiBloccati(leggere)].sort(), [...TB.nomiBloccati(DATI.seasons)].sort());
    assert.equal(TB.eBloccato(leggere, 'Team b'), TB.eBloccato(DATI.seasons, 'Team b'));
    // senza shallow: lettura intera ma sempre solo le due parti
    const intero = await D.stagioniLeggere(dbFinto(DATI), { fetch: fetchFinto(DATI, { ok: false }), radice: {} });
    assert.deepEqual(Object.keys(intero.s0).sort(), ['info', 'teams_iscritti']);
});

test('le pagine usano le letture leggere: i colori (9 pagine), le stagioni di Box, Hub e simulatore; nessuna rilegge più players per i colori', () => {
    for (const f of ['index', 'matches', 'players', 'box', 'hub', 'public', 'rules', 'formats', 'schermata-base-vuota']) {
        const h = leggiFile(f + '.html');
        assert.match(h, /<script src="db-leggero\.js"><\/script>/, f);
        const fn = h.slice(h.indexOf('async function caricaColoriPlayers()'), h.indexOf('\n}\n', h.indexOf('async function caricaColoriPlayers()')));
        assert.match(fn, /Object\.assign\(playerColors, await DbLeggero\.coloriGiocatori\(db\)\)/, f);
        assert.doesNotMatch(fn, /ref\('players'\)/, f);
    }
    assert.match(leggiFile('box.html'), /await DbLeggero\.stagioniLeggere\(db\);\s*window\.nomiTeamBloccati = TeamBloccati\.nomiBloccati\(stagioni\);/);
    assert.match(leggiFile('hub.html'), /DbLeggero\.stagioniLeggere\(db\), db\.ref\('regolamenti'\)/);
    assert.match(leggiFile('battle-ui.js'), /await self\.DbLeggero\.stagioniLeggere\(firebase\.database\(\)\);/);
    assert.match(leggiFile('battle.html'), /<script src="db-leggero\.js"><\/script>/);
});
