'use strict';
//   cd functions && node --test test/reazioni.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { REAZIONI, INTERVALLO_MIN, MAX_PER_PERSONA, creaReazioni } = require('../reazioni');

// un Realtime Database finto: solo quello che serve (once, transaction, push().set)
function dbFinto(iniziale = {}) {
    const dati = JSON.parse(JSON.stringify(iniziale));
    const leggi = p => p.split('/').reduce((v, k) => (v == null ? v : v[k]), dati);
    const scrivi = (p, valore) => {
        const k = p.split('/'); const ultimo = k.pop();
        let v = dati; for (const x of k) v = v[x] ||= {};
        if (valore === undefined) delete v[ultimo]; else v[ultimo] = valore;
    };
    let n = 0;
    const ref = p => ({
        once: async () => ({ val: () => { const x = leggi(p); return x === undefined ? null : JSON.parse(JSON.stringify(x)); } }),
        transaction: async fn => { const nuovo = fn(leggi(p) === undefined ? null : leggi(p)); if (nuovo === undefined) return { committed: false }; scrivi(p, nuovo); return { committed: true }; },
        push: () => { const k = `-K${String(++n).padStart(4, '0')}`; return { set: async v => scrivi(`${p}/${k}`, v) }; }
    });
    return { ref, dati };
}
const partita = stato => ({ partite: { p1: { stato } } });

test('una reazione valida entra nel flusso, nei totali e nel limite di chi l\'ha mandata (senza dire chi è)', async () => {
    const db = dbFinto(partita('in_corso'));
    const r = creaReazioni({ db, adesso: () => 5000 });
    assert.deepEqual(await r.reagisci('u1', { id: 'p1', e: 'fire' }), { ok: true });
    const nodo = db.dati.partite.p1;
    assert.deepEqual(Object.values(nodo.reazioni), [{ e: 'fire', t: 5000 }]);
    assert.deepEqual(nodo.reazioniTotali, { fire: 1 });
    assert.deepEqual(nodo.reazioniLimiti.u1, { t: 5000, n: 1 });
    assert.ok(!JSON.stringify(nodo.reazioni).includes('u1'), 'il flusso non contiene chi ha reagito');
});

test('rifiutate: reazioni non dell\'elenco, partite sbagliate o non in corso, persone non loggate', async () => {
    const db = dbFinto(partita('in_corso'));
    const r = creaReazioni({ db });
    const codice = async (uid, d) => { try { await r.reagisci(uid, d); return 'ok'; } catch (e) { return e.codice; } };
    assert.equal(await codice('u1', { id: 'p1', e: 'ciao' }), 'invalid-argument');
    assert.equal(await codice('u1', { id: 'p1' }), 'invalid-argument');
    assert.equal(await codice('u1', { id: '../x', e: 'fire' }), 'invalid-argument');
    assert.equal(await codice('u1', { id: 'inesistente', e: 'fire' }), 'not-found');
    assert.equal(await codice('', { id: 'p1', e: 'fire' }), 'unauthenticated');
    for (const stato of ['lobby', 'conclusa', 'da_salvare', 'salvata']) {
        db.dati.partite.p1.stato = stato;
        assert.equal(await codice('u1', { id: 'p1', e: 'fire' }), 'failed-precondition', stato);
    }
    db.dati.partite.p1.stato = 'tra_set';
    assert.equal(await codice('u1', { id: 'p1', e: 'gg' }), 'ok', 'tra un set e l\'altro si può');
    assert.deepEqual(Object.keys(db.dati.partite.p1.reazioniTotali), ['gg'], 'quelle rifiutate non si contano');
});

test('limite: una reazione ogni INTERVALLO_MIN per persona (altre persone non c\'entrano) e un massimo per partita', async () => {
    const db = dbFinto(partita('in_corso'));
    let ora = 10000;
    const r = creaReazioni({ db, adesso: () => ora });
    const codice = async (uid, e = 'fire') => { try { await r.reagisci(uid, { id: 'p1', e }); return 'ok'; } catch (x) { return x.codice; } };
    assert.equal(await codice('u1'), 'ok');
    ora += INTERVALLO_MIN - 1;
    assert.equal(await codice('u1'), 'resource-exhausted', 'troppo presto');
    assert.equal(await codice('u2'), 'ok', 'un\'altra persona può');
    ora += 1;
    assert.equal(await codice('u1', 'lol'), 'ok', 'passato l\'intervallo');
    assert.equal(db.dati.partite.p1.reazioniTotali.fire, 2);
    assert.equal(db.dati.partite.p1.reazioniTotali.lol, 1);
    // il tetto per persona
    db.dati.partite.p1.reazioniLimiti.u1 = { t: 0, n: MAX_PER_PERSONA };
    ora += 10 * INTERVALLO_MIN;
    assert.equal(await codice('u1'), 'resource-exhausted');
    assert.equal(db.dati.partite.p1.reazioniLimiti.u1.n, MAX_PER_PERSONA, 'un rifiuto non conta');
});

test('l\'elenco è lo stesso del sito (docs/reazioni-live.js)', () => {
    const sito = require('../../docs/reazioni-live.js');
    assert.deepEqual(sito.REAZIONI.map(x => x.id), REAZIONI);
});
