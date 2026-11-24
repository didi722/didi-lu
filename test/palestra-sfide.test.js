'use strict';
// Le palestre sul server (functions/palestra-sfide.js + palestra-stat.js): le statistiche di ogni palestra, la sfida passo per passo e il premio in monete, una volta a settimana.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/palestra-stat.js');
const F = require('../functions/palestra-sfide.js');
const C = require('../docs/cosmetici.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// il database finto di test/monete.test.js: lettura, scrittura, transazioni
function dbFinto(dati = {}) {
    const albero = JSON.parse(JSON.stringify(dati));
    const prendi = percorso => percorso.split('/').filter(Boolean).reduce((x, k) => (x == null ? undefined : x[k]), albero);
    const metti = (percorso, valore) => {
        const k = percorso.split('/').filter(Boolean);
        let x = albero;
        for (const n of k.slice(0, -1)) x = x[n] = x[n] || {};
        if (valore === null || valore === undefined) delete x[k[k.length - 1]]; else x[k[k.length - 1]] = JSON.parse(JSON.stringify(valore));
    };
    let c = 0;
    const ref = (percorso = '') => ({
        once: async () => ({ val: () => { const v = prendi(percorso); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
        transaction: async fn => { const att = prendi(percorso); const nuovo = fn(att === undefined ? null : JSON.parse(JSON.stringify(att))); if (nuovo === undefined) return { committed: false }; metti(percorso, nuovo); return { committed: true }; },
        remove: async () => metti(percorso, null), set: async v => metti(percorso, v),
        update: async oggetto => { for (const [k, v] of Object.entries(oggetto)) metti(`${percorso}/${k}`, v); },
        push: () => { const k = `-K${String(++c).padStart(6, '0')}`; return { set: async v => metti(`${percorso}/${k}`, v) }; },
        child: k => ref(`${percorso}/${k}`)
    });
    return { albero, ref };
}

const TAPPE = [0, 1, 2].map(i => ({ formato: `f${i}`, categoria: `Format ${i}`, team: `T${i}`, vantaggio: 'rain' }));
const mondo = () => dbFinto({
    users: { u1: { name: 'Didi' }, u2: { name: 'Lu' }, u3: { name: 'Capo' } },
    players: {
        didi: { info: { name: 'Didi' } },
        lu: { info: { name: 'Lu' } },
        capo: { info: { name: 'Capo', palestra: { tappe: TAPPE } } },
        senza: { info: { name: 'Senza' } }
    }
});
const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);       // martedì 24 novembre 2026, settimana 48
const PASSO = S.MIN_TAPPA_MS + 1000;
const stat = db => db.albero.players.capo.palestraStat;
const saldo = (db, uid) => (db.albero.wallet && db.albero.wallet[uid] && db.albero.wallet[uid].saldo) || 0;

// una tappa intera: parte e finisce dopo il tempo minimo. Ritorna l'esito di "fine" e il nuovo istante
async function tappa(db, uid, n, vinta, t, gym = 'capo') {
    const a = await F.inizia({ db, uid, gym, tappa: n, adesso: t });
    assert.equal(a.ok, true, `inizia ${n}`);
    return { a, f: await F.fine({ db, uid, gym, tappa: n, vinta, adesso: t + PASSO }), t: t + PASSO };
}

// ---------------------------------------------------------------- il modulo puro
test('palestra-stat: registra tappa per tappa; una sconfitta o la terza vinta chiudono una sfida (tentativi = tenuta + espugnata)', () => {
    let s = null;
    const ev = (chi, tappa, vinta, t) => ({ chi, nome: chi.toUpperCase(), tappa, vinta, t });
    for (const e of [ev('didi', 0, true, 1), ev('didi', 1, true, 2), ev('didi', 2, true, 3), ev('lu', 0, false, 4), ev('lu', 0, true, 5), ev('lu', 1, false, 6)]) s = S.registra(s, e);
    const r = S.riassunto(s);
    assert.deepEqual([r.tentativi, r.tenuta, r.espugnata, r.percTenuta], [3, 2, 1, 67]);
    assert.equal(r.tentativi, r.tenuta + r.espugnata);
    assert.deepEqual(r.tappe.map(x => [x.giocate, x.vinte, x.perse, x.perc]), [[3, 2, 1, 67], [2, 1, 1, 50], [1, 1, 0, 100]]);
    assert.deepEqual(r.ultime.map(x => [x.c, x.e, x.s]), [['lu', 'p', 1], ['lu', 'p', 0], ['didi', 'v', 2]], 'la più recente per prima; le vinte a metà non sono sfide finite');
    assert.deepEqual(r.espugnatori.map(x => [x.id, x.nome, x.volte]), [['didi', 'DIDI', 1]]);
    assert.equal(r.vuota, false);
    assert.equal(r.aggiornata, 6);
});

test('palestra-stat: il nodo vuoto, quello letto da Firebase (oggetti al posto delle liste, numeri strani) e il tetto delle ultime sfide', () => {
    const v = S.riassunto(null);
    assert.deepEqual([v.vuota, v.tentativi, v.tenuta, v.espugnata, v.percTenuta, v.ultime.length, v.espugnatori.length], [true, 0, 0, 0, null, 0, 0]);
    assert.deepEqual(v.tappe.map(x => x.perc), [null, null, null]);
    // Firebase dà le liste come oggetti con chiavi 0, 1, 2 e toglie le liste vuote
    const grezzo = { tentativi: '4', tenuta: 3.9, espugnata: -2, tappe: { 0: { giocate: 5, vinte: 2 }, 2: { giocate: 'x', vinte: null } }, ultime: { 0: { c: 'a.b', n: 'A', t: 5, e: 'v', s: 9 }, 1: 'boh', 2: { c: 'c', t: 4, e: 'q', s: -1 } }, espugnatori: { 'x.y': { n: 'X', q: 2, t: 7 }, zero: { n: 'Z', q: 0, t: 1 }, rotto: 'no' } };
    const n = S.normalizza(grezzo);
    assert.deepEqual([n.tentativi, n.tenuta, n.espugnata], [4, 3, 0]);
    assert.deepEqual(n.tappe, [{ giocate: 5, vinte: 2 }, { giocate: 0, vinte: 0 }, { giocate: 0, vinte: 0 }]);
    assert.deepEqual(n.ultime.map(x => [x.c, x.e, x.s]), [['a_b', 'v', 2], ['c', 'p', 0]], 'chiavi sicure, esiti e tappe riportati ai valori ammessi, voci rotte saltate');
    assert.deepEqual(Object.keys(n.espugnatori), ['x_y']);
    // le ultime sfide sono al massimo MAX_ULTIME
    let s = null;
    for (let i = 0; i < 20; i++) s = S.registra(s, { chi: `p${i}`, nome: `P${i}`, tappa: 0, vinta: false, t: i + 1 });
    assert.equal(s.ultime.length, S.MAX_ULTIME);
    assert.equal(s.ultime[0].c, 'p19');
    assert.equal(s.tentativi, 20);
    // l'evento è letto con prudenza e il nodo di partenza non si tocca
    const prima = JSON.stringify(s);
    S.registra(s, { chi: 'x', tappa: 99, vinta: true, t: 1 });
    assert.equal(JSON.stringify(s), prima);
    assert.equal(S.registra(null, { tappa: 99, vinta: true }).tappe[2].vinte, 1, 'una tappa fuori misura è l\'ultima');
});

test('palestra-stat: gli espugnatori si contano e si ordinano per volte, poi per chi ha vinto per ultimo', () => {
    let s = null;
    for (const [chi, t] of [['a', 1], ['b', 2], ['a', 3], ['c', 4]]) for (let i = 0; i < 3; i++) s = S.registra(s, { chi, nome: chi.toUpperCase(), tappa: i, vinta: true, t: t * 10 + i });
    assert.deepEqual(S.riassunto(s).espugnatori.map(x => [x.id, x.volte]), [['a', 2], ['c', 1], ['b', 1]]);
});

test('palestra-stat: la settimana ISO (lunedì-domenica, UTC) e l\'inizio della prossima', () => {
    const w = t => S.settimanaDi(Date.parse(t));
    assert.equal(w('2026-11-23T00:00:00Z'), '2026-W48', 'lunedì');
    assert.equal(w('2026-11-29T23:59:59Z'), '2026-W48', 'domenica sera');
    assert.equal(w('2026-11-30T00:00:00Z'), '2026-W49', 'il lunedì dopo');
    assert.equal(w('2026-11-22T23:59:59Z'), '2026-W47');
    assert.equal(w('2026-01-01T00:00:00Z'), '2026-W01');
    assert.equal(w('2025-12-29T00:00:00Z'), '2026-W01', 'a fine anno si può già essere nella settimana 1 dell\'anno dopo');
    assert.equal(w('2027-01-01T00:00:00Z'), '2026-W53');
    assert.equal(w('2021-01-03T00:00:00Z'), '2020-W53');
    assert.equal(w('2024-12-30T00:00:00Z'), '2025-W01');
    assert.equal(S.settimanaDi('boh'), '');
    const prossima = t => new Date(S.prossimaSettimana(Date.parse(t))).toISOString();
    assert.equal(prossima('2026-11-24T12:00:00Z'), '2026-11-30T00:00:00.000Z');
    assert.equal(prossima('2026-11-23T00:00:00Z'), '2026-11-30T00:00:00.000Z', 'di lunedì mattina è il lunedì dopo, non oggi');
    assert.equal(prossima('2026-11-29T23:00:00Z'), '2026-11-30T00:00:00.000Z');
    assert.equal(S.prossimaSettimana('boh'), 0);
    assert.equal(S.settimanaDi(S.prossimaSettimana(Date.parse('2026-11-24T12:00:00Z'))), '2026-W49');
});

test('palestra-stat: tappeComplete (tre voci, anche come oggetto) e tempoFa', () => {
    assert.equal(S.tappeComplete({ tappe: TAPPE }), true);
    assert.equal(S.tappeComplete({ tappe: { 0: TAPPE[0], 1: TAPPE[1], 2: TAPPE[2] } }), true);
    assert.equal(S.tappeComplete({ tappe: TAPPE.slice(0, 2) }), false);
    assert.equal(S.tappeComplete({ tappe: [TAPPE[0], 'x', TAPPE[2]] }), false);
    for (const no of [null, undefined, {}, { tappe: 5 }, 'x']) assert.equal(S.tappeComplete(no), false, String(no));
    const t = 1000000000000;
    assert.deepEqual([S.tempoFa(t, t + 5000), S.tempoFa(t, t + 5 * 60000), S.tempoFa(t, t + 3 * 3600000), S.tempoFa(t, t + 86400000), S.tempoFa(t, t + 5 * 86400000), S.tempoFa(t, t + 21 * 86400000), S.tempoFa(t, t + 90 * 86400000)],
        ['just now', '5 min ago', '3 h ago', '1 day ago', '5 days ago', '3 weeks ago', '3 months ago']);
    assert.equal(S.tempoFa(t, t - 5000), 'just now', 'un orologio indietro non dà un tempo negativo');
});

test('le due copie di palestra-stat.js (sito e server) e di cosmetici.js sono identiche', () => {
    assert.equal(leggi('docs', 'palestra-stat.js'), leggi('functions', 'palestra-stat.js'));
    assert.equal(leggi('docs', 'cosmetici.js'), leggi('functions', 'cosmetici.js'));
});

// ---------------------------------------------------------------- il server
test('una sfida intera: tre tappe vinte di fila espugnano la palestra, scrivono le statistiche e danno il premio (10 monete)', async () => {
    const db = mondo();
    assert.equal(C.PREMI.palestra, 10);
    let t = T0;
    const prima = await tappa(db, 'u1', 0, true, t); t = prima.t;
    assert.equal(prima.a.verificata, true);
    assert.deepEqual(prima.f, { ok: true, esito: 'tappa', vinte: 1 });
    assert.deepEqual(db.albero.palestraSfide.u1.capo, { vinte: 1, inizio: 0, ok: true });
    assert.equal(stat(db).tentativi, 0, 'a metà sfida non c\'è ancora un tentativo');
    const seconda = await tappa(db, 'u1', 1, true, t); t = seconda.t;
    assert.equal(seconda.a.verificata, true);
    assert.equal(seconda.f.esito, 'tappa');
    const terza = await tappa(db, 'u1', 2, true, t);
    assert.deepEqual(terza.f, { ok: true, esito: 'espugnata', premio: 10, motivoPremio: '', settimana: '2026-W48' });
    assert.equal(saldo(db, 'u1'), 10);
    assert.deepEqual(Object.values(db.albero.wallet.u1.movimenti).map(m => [m.importo, m.motivo]), [[10, 'Gym conquered: Capo']]);
    assert.deepEqual(db.albero.wallet.u1.premiPalestra, { capo: { settimana: '2026-W48', t: terza.t } });
    assert.equal(db.albero.palestraSfide.u1.capo, undefined, 'la sfida è finita: lo stato si toglie');
    const r = S.riassunto(stat(db));
    assert.deepEqual([r.tentativi, r.tenuta, r.espugnata], [1, 0, 1]);
    assert.deepEqual(r.tappe.map(x => [x.giocate, x.vinte]), [[1, 1], [1, 1], [1, 1]]);
    assert.deepEqual(r.ultime.map(x => [x.c, x.n, x.e, x.s]), [['didi', 'Didi', 'v', 2]]);
    assert.deepEqual(r.espugnatori.map(x => [x.id, x.volte]), [['didi', 1]]);
});

test('una tappa persa: la palestra ha tenuto, la sfida finisce e si ricomincia dalla prima', async () => {
    const db = mondo();
    const p = await tappa(db, 'u2', 0, true, T0);
    const persa = await tappa(db, 'u2', 1, false, p.t);
    assert.deepEqual(persa.f, { ok: true, esito: 'tenuta' });
    assert.equal(db.albero.palestraSfide.u2.capo, undefined);
    assert.equal(saldo(db, 'u2'), 0, 'niente monete per una sconfitta');
    const r = S.riassunto(stat(db));
    assert.deepEqual([r.tentativi, r.tenuta, r.espugnata], [1, 1, 0]);
    assert.deepEqual(r.tappe.map(x => [x.giocate, x.vinte, x.perse]), [[1, 1, 0], [1, 0, 1], [0, 0, 0]]);
    assert.deepEqual(r.ultime.map(x => [x.c, x.e, x.s]), [['lu', 'p', 1]]);
    // dopo la sconfitta il "fine" della stessa tappa non vale più, e dalla seconda tappa non si riparte
    assert.equal((await F.fine({ db, uid: 'u2', gym: 'capo', tappa: 1, vinta: true, adesso: p.t + 5 * PASSO })).motivo, 'not-started');
    const dopo = await F.inizia({ db, uid: 'u2', gym: 'capo', tappa: 1, adesso: p.t + 6 * PASSO });
    assert.equal(dopo.verificata, false, 'la seconda tappa senza la prima non è una sfida che il server ha visto cominciare');
});

test('il premio è una volta a settimana per ogni palestra: la stessa palestra di nuovo non paga, un\'altra sì (più palestre, più premi), la settimana dopo di nuovo', async () => {
    const db = mondo();
    db.albero.players.altra = { info: { name: 'Altra', palestra: { tappe: TAPPE } } };
    const conquista = async (gym, quando, uid = 'u1') => { let x = quando; let ultimo; for (const n of [0, 1, 2]) { ultimo = await tappa(db, uid, n, true, x, gym); x = ultimo.t; } return { f: ultimo.f, t: x }; };
    const uno = await conquista('capo', T0);
    assert.equal(uno.f.premio, 10);
    const due = await conquista('capo', uno.t + 1000);
    assert.deepEqual([due.f.esito, due.f.premio, due.f.motivoPremio], ['espugnata', 0, 'already'], 'la stessa palestra di nuovo, stessa settimana');
    const tre = await conquista('altra', due.t + 1000);
    assert.deepEqual([tre.f.premio, tre.f.motivoPremio], [10, ''], 'un\'altra palestra, stessa settimana: paga');
    assert.equal(saldo(db, 'u1'), 20);
    assert.deepEqual(Object.keys(db.albero.wallet.u1.premiPalestra).sort(), ['altra', 'capo']);
    // le statistiche contano tutte le sfide, premio o no
    assert.equal(stat(db).espugnata, 2);
    assert.equal(db.albero.players.altra.palestraStat.espugnata, 1);
    // un altro giocatore ha i suoi premi nella stessa settimana, per ogni palestra
    for (const n of [0, 1, 2]) { const x = await tappa(db, 'u2', n, true, tre.t + 5000 + n * 100000); if (n === 2) assert.equal(x.f.premio, 10, 'Lu non l\'aveva ancora preso'); }
    // la settimana dopo (lunedì 30 novembre) si può di nuovo, per ognuna
    const lunedi = S.prossimaSettimana(T0);
    const nuova = await conquista('capo', lunedi + 1000);
    assert.deepEqual([nuova.f.premio, nuova.f.settimana], [10, '2026-W49']);
    const nuova2 = await conquista('altra', nuova.t + 1000);
    assert.equal(nuova2.f.premio, 10);
    assert.equal(saldo(db, 'u1'), 40);
    assert.equal(db.albero.wallet.u1.premiPalestra.capo.settimana, '2026-W49');
});

test('il tempo minimo: una tappa "finita" troppo presto non conta e non si perde (si può chiudere dopo); un "fine" vale una volta sola', async () => {
    const db = mondo();
    await F.inizia({ db, uid: 'u1', gym: 'capo', tappa: 0, adesso: T0 });
    const presto = await F.fine({ db, uid: 'u1', gym: 'capo', tappa: 0, vinta: true, adesso: T0 + 5000 });
    assert.deepEqual(presto, { ok: false, motivo: 'too-fast' });
    assert.equal(stat(db), undefined, 'niente statistiche');
    assert.equal(db.albero.palestraSfide.u1.capo.inizio, T0, 'la tappa è ancora aperta');
    const ok = await F.fine({ db, uid: 'u1', gym: 'capo', tappa: 0, vinta: true, adesso: T0 + PASSO });
    assert.equal(ok.esito, 'tappa');
    const doppio = await F.fine({ db, uid: 'u1', gym: 'capo', tappa: 0, vinta: true, adesso: T0 + 2 * PASSO });
    assert.deepEqual(doppio, { ok: false, motivo: 'not-started' });
    assert.equal(stat(db).tappe[0].giocate, 1, 'contata una volta sola');
    // senza "inizia" nemmeno la prima
    assert.equal((await F.fine({ db, uid: 'u2', gym: 'capo', tappa: 0, vinta: true, adesso: T0 + 9 * PASSO })).motivo, 'not-started');
    // "fine" per una tappa diversa da quella iniziata
    await F.inizia({ db, uid: 'u2', gym: 'capo', tappa: 0, adesso: T0 });
    assert.equal((await F.fine({ db, uid: 'u2', gym: 'capo', tappa: 2, vinta: true, adesso: T0 + PASSO })).motivo, 'not-started');
});

test('due "fine" insieme (doppio clic, richiesta ripetuta): la tappa si conta una volta sola', async () => {
    const db = mondo();
    await F.inizia({ db, uid: 'u1', gym: 'capo', tappa: 0, adesso: T0 });
    const r = await Promise.all([0, 1, 2].map(() => F.fine({ db, uid: 'u1', gym: 'capo', tappa: 0, vinta: false, adesso: T0 + PASSO })));
    assert.equal(r.filter(x => x.ok).length, 1);
    assert.equal(stat(db).tentativi, 1);
    assert.equal(stat(db).tenuta, 1);
});

test('una sfida che il server non ha visto cominciare (parte dalla seconda tappa, o ha perso un "fine") conta nelle statistiche ma non dà monete', async () => {
    const db = mondo();
    let t = T0;
    const b = await tappa(db, 'u1', 1, true, t); t = b.t;
    assert.equal(b.a.verificata, false);
    const c = await tappa(db, 'u1', 2, true, t);
    assert.equal(c.a.verificata, false, 'una sfida non verificata resta tale');
    assert.deepEqual([c.f.esito, c.f.premio, c.f.motivoPremio], ['espugnata', 0, 'unverified']);
    assert.equal(saldo(db, 'u1'), 0);
    assert.equal(db.albero.wallet, undefined, 'nessun movimento, nessun segno settimanale');
    assert.equal(stat(db).espugnata, 1, 'ma la palestra è stata espugnata');
    // il premio resta disponibile: una sfida fatta bene la settimana stessa lo paga
    let x = c.t + 1000;
    let ultimo;
    for (const n of [0, 1, 2]) { ultimo = await tappa(db, 'u1', n, true, x); x = ultimo.t; }
    assert.equal(ultimo.f.premio, 10);
    // dalla prima tappa si ricomincia sempre da capo, anche se c'era un'altra sfida a metà
    await tappa(db, 'u2', 0, true, T0);
    await F.inizia({ db, uid: 'u2', gym: 'capo', tappa: 0, adesso: T0 + 9 * PASSO });
    assert.deepEqual(db.albero.palestraSfide.u2.capo, { vinte: 0, inizio: T0 + 9 * PASSO, ok: true });
});

test('chi non può sfidare: la propria palestra, una palestra che non c\'è o è a metà, richieste fatte male, chi non è un giocatore', async () => {
    const db = mondo();
    assert.deepEqual(await F.inizia({ db, uid: 'u3', gym: 'capo', tappa: 0, adesso: T0 }), { ok: false, motivo: 'own-gym' });
    assert.deepEqual(await F.inizia({ db, uid: 'u1', gym: 'senza', tappa: 0, adesso: T0 }), { ok: false, motivo: 'no-gym' });
    db.albero.players.meta = { info: { name: 'Meta', palestra: { tappe: TAPPE.slice(0, 2) } } };
    assert.equal((await F.inizia({ db, uid: 'u1', gym: 'meta', tappa: 0, adesso: T0 })).motivo, 'no-gym');
    assert.equal((await F.inizia({ db, uid: 'u1', gym: 'inesistente', tappa: 0, adesso: T0 })).motivo, 'no-gym');
    for (const tappaStrana of [3, -1, 1.5, 'x', null, undefined, NaN]) assert.equal((await F.inizia({ db, uid: 'u1', gym: 'capo', tappa: tappaStrana, adesso: T0 })).motivo, 'bad-request', String(tappaStrana));
    for (const gymStrano of ['', 'a/b', 'a.b', '../wallet', '$x', '[x]', null]) assert.equal((await F.inizia({ db, uid: 'u1', gym: gymStrano, tappa: 0, adesso: T0 })).motivo, 'bad-request', String(gymStrano));
    assert.equal((await F.inizia({ db, uid: '', gym: 'capo', tappa: 0, adesso: T0 })).motivo, 'bad-request');
    assert.equal((await F.inizia({ db, uid: 'sconosciuto', gym: 'capo', tappa: 0, adesso: T0 })).motivo, 'no-player');
    assert.equal((await F.fine({ db, uid: 'u3', gym: 'capo', tappa: 0, vinta: true, adesso: T0 })).motivo, 'own-gym');
    assert.equal(db.albero.palestraSfide, undefined, 'niente di tutto questo ha lasciato tracce');
    // l'id della palestra si legge in minuscolo e senza spazi, come gli id dei giocatori
    assert.equal((await F.inizia({ db, uid: 'u1', gym: '  CAPO ', tappa: 0, adesso: T0 })).ok, true);
});

test('sfida(): smista inizia/fine; "vinta" vale solo se è proprio true; ogni altra azione è rifiutata', async () => {
    const db = mondo();
    assert.deepEqual(await F.sfida({ db, uid: 'u1', dati: { azione: 'inizia', gym: 'capo', tappa: 0 }, adesso: T0 }), { ok: true, verificata: true });
    // "true" scritto come testo o 1 non è una vittoria
    const f = await F.sfida({ db, uid: 'u1', dati: { azione: 'fine', gym: 'capo', tappa: 0, vinta: 'true' }, adesso: T0 + PASSO });
    assert.deepEqual(f, { ok: true, esito: 'tenuta' });
    for (const dati of [{ azione: 'boh' }, {}, null, undefined, { gym: 'capo', tappa: 0 }]) assert.deepEqual(await F.sfida({ db, uid: 'u1', dati, adesso: T0 }), { ok: false, motivo: 'bad-request' }, JSON.stringify(dati));
});

test('cablaggio: la Function palestraSfida (index.js), il saldo che la pagina legge e le regole del database', () => {
    const idx = leggi('functions', 'index.js');
    assert.match(idx, /const palestraSfide = require\('\.\/palestra-sfide'\);/);
    assert.match(idx, /exports\.palestraSfida = onCall\(\{ region: REGIONE, memory: '256MiB', timeoutSeconds: 20, cors: true \}/);
    assert.match(idx, /palestraSfide\.sfida\(\{ db: getDatabase\(\), uid: richiesta\.auth\.uid, dati: richiesta\.data \|\| \{\} \}\)/);
    assert.match(idx, /if \(!richiesta\.auth\) throw new HttpsError\('unauthenticated'/, 'solo da loggati');
    const monete = leggi('functions', 'monete.js');
    assert.match(monete, /module\.exports = \{[^}]*giocatoreDi[^}]*\};/);
    const srv = leggi('functions', 'palestra-sfide.js');
    assert.match(srv, /palestraSfide\/\$\{uid\}\/\$\{c\.id\}/, 'lo stato di chi sfida è privato: sta in un nodo che le regole non aprono al sito');
    assert.match(srv, /players\/\$\{c\.id\}\/palestraStat/, 'le statistiche sono pubbliche: nel nodo del capopalestra, come lo stile di gioco');
    assert.match(srv, /chiave: `palestra-\$\{settimana\}-\$\{uid\}-\$\{c\.id\}`/, 'una volta a settimana per giocatore e per palestra');
    assert.match(srv, /Cosmetici\.PREMI\.palestra/);
    const regole = leggi('REGOLE-DATABASE.md');
    assert.match(regole, /palestraStat/);
    assert.match(regole, /palestraSfide/);
    assert.match(regole, /premiPalestra/);
});
