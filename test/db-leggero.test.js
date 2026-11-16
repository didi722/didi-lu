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

// ---------- la cache tra le pagine ----------
const schedaFinta = () => {
    const m = new Map();
    return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m };
};

test('cache: una lettura sola anche con più richieste insieme; ognuno riceve una copia sua; dopo 3 minuti si rilegge', async () => {
    D.svuotaCache();
    const radice = { sessionStorage: schedaFinta() };
    let t = 1000, letture = 0;
    const adesso = () => t;
    const leggi = async () => { letture++; return { a: [1, 2], b: { c: 3 } }; };
    const [x, y] = await Promise.all([D.conCache('k1', leggi, { radice, adesso }), D.conCache('k1', leggi, { radice, adesso })]);
    assert.equal(letture, 1, 'due richieste insieme: una lettura');
    assert.deepEqual(x, y);
    assert.notEqual(x, y, 'copie diverse');
    x.a.push(99);
    assert.deepEqual((await D.conCache('k1', leggi, { radice, adesso })).a, [1, 2], 'chi modifica i dati non rovina quelli degli altri');
    assert.equal(letture, 1);
    t += D.DURATA_CACHE - 1;
    await D.conCache('k1', leggi, { radice, adesso });
    assert.equal(letture, 1, 'ancora valida');
    t += 2;
    await D.conCache('k1', leggi, { radice, adesso });
    assert.equal(letture, 2, 'scaduta: si rilegge');
    assert.equal(D.DURATA_CACHE, 3 * 60 * 1000);
});

test('cache: cambiando pagina (memoria della pagina vuota, scheda del browser piena) non si rilegge; ttl 0 = sempre fresca; un errore non si ricorda', async () => {
    D.svuotaCache();
    const scheda = schedaFinta();
    const radice = { sessionStorage: scheda };
    let letture = 0;
    const leggi = async () => { letture++; return { v: letture }; };
    await D.conCache('pagina', leggi, { radice });
    assert.ok([...scheda._m.keys()].some(k => k.startsWith(D.PREFISSO_CACHE + 'pagina')), 'si scrive anche nella scheda del browser');
    // "un'altra pagina": la memoria del modulo riparte da zero, la scheda resta
    const D2 = (() => { delete require.cache[require.resolve('../docs/db-leggero.js')]; return require('../docs/db-leggero.js'); })();
    assert.deepEqual(await D2.conCache('pagina', leggi, { radice }), { v: 1 });
    assert.equal(letture, 1, 'riletta dalla scheda, non dal database');
    await D2.conCache('pagina', leggi, { radice, ttl: 0 });
    assert.equal(letture, 2, 'ttl 0: sempre fresca');
    // un errore non resta in cache
    let prova = 0;
    const incerta = async () => { if (++prova === 1) throw new Error('rete'); return 'ok'; };
    await assert.rejects(D2.conCache('errore', incerta, { radice }), /rete/);
    assert.equal(await D2.conCache('errore', incerta, { radice }), 'ok', 'la volta dopo si riprova');
});

test('cache: scheda piena o bloccata, dati troppo grandi o scheda assente: la lettura funziona lo stesso (resta in memoria)', async () => {
    D.svuotaCache();
    let letture = 0;
    const leggi = async () => { letture++; return { x: 1 }; };
    const piena = { sessionStorage: { length: 0, key: () => null, getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} } };
    assert.deepEqual(await D.conCache('piena', leggi, { radice: piena }), { x: 1 });
    await D.conCache('piena', leggi, { radice: piena });
    assert.equal(letture, 1, 'resta in memoria');
    assert.deepEqual(await D.conCache('senza', leggi, { radice: {} }), { x: 1 }, 'senza scheda');
    const scheda = schedaFinta();
    await D.conCache('grande', async () => ({ testo: 'x'.repeat(2600000) }), { radice: { sessionStorage: scheda } });
    assert.ok(![...scheda._m.keys()].some(k => k.includes('grande')), 'oltre 2,5 milioni di caratteri non si scrive nella scheda');
});

test('cache: lettura() è come once(\'value\') con la cache; svuotaCache() toglie tutto (memoria e scheda) e le letture dopo vanno al database', async () => {
    D.svuotaCache();
    const scheda = schedaFinta();
    const radice = { sessionStorage: scheda };
    const db = dbFinto({ players: { didi: { info: { name: 'Didi' } } } });
    const a = await D.lettura(db, 'players', { radice });
    const b = await D.lettura(db, 'players', { radice });
    assert.deepEqual(a.val(), { didi: { info: { name: 'Didi' } } });
    assert.equal(a.exists(), true);
    assert.deepEqual(db.letti, ['players'], 'una lettura sola');
    assert.notEqual(a.val(), b.val(), 'copie diverse');
    scheda.setItem('altro', 'resta');
    D.svuotaCache({ radice });
    assert.deepEqual([...scheda._m.keys()], ['altro'], 'si tolgono solo le voci della cache');
    await D.lettura(db, 'players', { radice });
    assert.deepEqual(db.letti, ['players', 'players'], 'dopo lo svuotamento si rilegge');
    assert.equal((await D.lettura(dbFinto({}), 'vuoto', { radice })).exists(), false, 'un nodo che non c\'è: val() null');
});

test('cache: stagioniConStats si ricorda (seasons e setStats si leggono una volta per tutte le pagine)', async () => {
    D.svuotaCache();
    const radice = { sessionStorage: schedaFinta() };
    const db = dbFinto({ seasons: { s0: { showdowns: { sd1: { matches: { match1: { p1score: 2 } } } } } }, setStats: { s0: { sd1: { match1: { set1: { turni: 5 } } } } } });
    const a = await D.stagioniConStats(db, { radice });
    const b = await D.stagioniConStats(db, { radice });
    assert.deepEqual(db.letti.sort(), ['seasons', 'setStats'], 'una lettura di ognuno');
    assert.deepEqual(a.s0.showdowns.sd1.matches.match1.setStats, { set1: { turni: 5 } });
    assert.notEqual(a, b);
});

test('cache: le pagine di statistica leggono players e le stagioni dalla cache; chi scrive la svuota; Hub e Matches non la usano', () => {
    for (const f of ['stats.js', 'palmares.js', 'scheda-battaglia.js', 'players.html', 'formats.html', 'app-precarica.js', 'fiocchi.js']) assert.match(leggiFile(f), /DbLeggero\.lettura\(db, 'players'\)|DbLeggero\.lettura\(db, 'players'\)/, f);
    for (const f of ['stats.js', 'palmares.js', 'fiocchi.js', 'box.html', 'formats.html']) assert.match(leggiFile(f), /DbLeggero\.stagioniConStats\(db\)/, f);
    const r = leggiFile('risultati-match.js');
    assert.match(r, /function svuotaCachePagine\(\) \{\s*try \{ if \(typeof DbLeggero !== 'undefined'/);
    assert.match(r, /svuotaCachePagine\(\);      \/\/ Stats, Hall of Fame, badge/, 'dopo aver registrato un match');
    assert.match(r, /Recalculation completed for \$\{pId\}[^\n]*\n\s*svuotaCachePagine\(\);/, 'dopo il ricalcolo dei giocatori');
    assert.equal(fs.readFileSync(path.join(DOCS, '..', 'functions', 'risultati-match.js'), 'utf8'), r, 'identico nel server');
    assert.match(leggiFile('matches.html'), /remove\(\)\.catch[^\n]*\n\s*if \(window\.DbLeggero\) DbLeggero\.svuotaCache\(\);/, 'cancellando un match o uno showdown');
    assert.match(leggiFile('admin.html'), /if \(window\.DbLeggero\) DbLeggero\.svuotaCache\(\);/, 'eliminando una stagione');
    for (const f of ['hub.html']) assert.doesNotMatch(leggiFile(f), /DbLeggero\.(lettura|conCache|stagioniConStats)/, `${f}: dati sempre aggiornati`);
});
