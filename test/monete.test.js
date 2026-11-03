'use strict';
// monete.js + cosmetici.js: il libro mastro delle monete (premi una volta sola, tetto delle amichevoli, acquisti, equipaggiamento) e il catalogo dei cosmetici.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../functions/monete.js');
const C = require('../docs/cosmetici.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

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
    const ref = percorso => ({
        once: async () => ({ val: () => { const v = prendi(percorso); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
        transaction: async fn => { const att = prendi(percorso); const nuovo = fn(att === undefined ? null : att); if (nuovo === undefined) return { committed: false }; metti(percorso, nuovo); return { committed: true }; },
        remove: async () => metti(percorso, null), set: async v => metti(percorso, v),
        push: () => { const k = `-K${String(++c).padStart(6, '0')}`; return { set: async v => metti(`${percorso}/${k}`, v) }; },
        child: k => ref(`${percorso}/${k}`)
    });
    return { albero, ref };
}
const saldo = (db, uid) => (db.albero.wallet && db.albero.wallet[uid] && db.albero.wallet[uid].saldo) || 0;
const movimenti = (db, uid) => Object.values((db.albero.wallet[uid] || {}).movimenti || {});

test('premi: set giocato 4, vinto 10, doppio in stagione; badge per livello saltato', () => {
    assert.equal(M.premioSet({ ufficiale: false, vinto: false }), 4);
    assert.equal(M.premioSet({ ufficiale: false, vinto: true }), 10);
    assert.equal(M.premioSet({ ufficiale: true, vinto: false }), 8);
    assert.equal(M.premioSet({ ufficiale: true, vinto: true }), 20);
    assert.deepEqual([M.premioBadge(0, 1), M.premioBadge(0, 3), M.premioBadge(1, 2), M.premioBadge(2, 3), M.premioBadge(3, 3), M.premioBadge(0, 9)], [25, 175, 50, 100, 0, 175]);
});

test('accredita: aggiunge al saldo e scrive il movimento; la stessa chiave paga una volta sola; importi nulli o senza uid non fanno niente', async () => {
    const db = dbFinto();
    assert.equal(await M.accredita(db, 'u1', 20, 'Season set won', { chiave: 'set-p1-1-p1' }), 20);
    assert.equal(await M.accredita(db, 'u1', 20, 'Season set won', { chiave: 'set-p1-1-p1' }), 0, 'già dato');
    assert.equal(await M.accredita(db, 'u1', 8, 'altro', { chiave: 'set-p1-1-p2' }), 8);
    assert.equal(saldo(db, 'u1'), 28);
    assert.deepEqual(movimenti(db, 'u1').map(m => [m.importo, m.motivo]), [[20, 'Season set won'], [8, 'altro']]);
    assert.equal(await M.accredita(db, '', 5, 'x'), 0);
    assert.equal(await M.accredita(db, 'u1', 0, 'x'), 0);
    assert.equal(await M.accredita(db, 'u1', 5, 'chiave.con#caratteri$strani/[ok]', { chiave: 'a.b#c' }), 5, 'la chiave si rende sicura per Firebase');
    assert.ok(db.albero.walletEventi['a_b_c']);
});

test('premiaSet: i due giocatori, chi vince di più; le amichevoli hanno il tetto di 40 al giorno', async () => {
    const db = dbFinto();
    const r = await M.premiaSet({ db, uids: { p1: 'u1', p2: 'u2' }, vincitore: 'p1', ufficiale: true, id: 'p1', set: 1 });
    assert.deepEqual(r, { p1: 20, p2: 8 });
    assert.deepEqual([saldo(db, 'u1'), saldo(db, 'u2')], [20, 8]);
    await M.premiaSet({ db, uids: { p1: 'u1', p2: 'u2' }, vincitore: 'p1', ufficiale: true, id: 'p1', set: 1 });
    assert.equal(saldo(db, 'u1'), 20, 'lo stesso set non paga due volte');
    // amichevoli: 10 per chi vince, 4 per chi perde, al massimo 40 al giorno
    const adesso = Date.UTC(2026, 10, 3, 12);
    let totale = 0;
    for (let i = 1; i <= 6; i++) totale += (await M.premiaSet({ db: db, uids: { p1: 'u3', p2: '' }, vincitore: 'p1', ufficiale: false, id: `a${i}`, set: 1, adesso })).p1;
    assert.equal(totale, 40, 'tetto giornaliero: 4 set da 10, poi niente');
    assert.equal(saldo(db, 'u3'), 40);
    const domani = await M.premiaSet({ db, uids: { p1: 'u3' }, vincitore: 'p1', ufficiale: false, id: 'a7', set: 1, adesso: adesso + 86400000 });
    assert.equal(domani.p1, 10, 'il giorno dopo si riparte');
    // le stagioni non hanno tetto
    for (let i = 1; i <= 5; i++) await M.premiaSet({ db, uids: { p1: 'u4' }, vincitore: 'p1', ufficiale: true, id: `s${i}`, set: 1, adesso });
    assert.equal(saldo(db, 'u4'), 100);
});

test('premiaBadge: per livello, una volta sola per badge e livello; salendo di livello paga la differenza', async () => {
    const db = dbFinto();
    assert.equal(await M.premiaBadge({ db, uid: 'u1', chiave: 'pk|didi|x', prima: 0, dopo: 1, nome: 'Win Streak' }), 25);
    assert.equal(await M.premiaBadge({ db, uid: 'u1', chiave: 'pk|didi|x', prima: 0, dopo: 1, nome: 'Win Streak' }), 0);
    assert.equal(await M.premiaBadge({ db, uid: 'u1', chiave: 'pk|didi|x', prima: 1, dopo: 3, nome: 'Win Streak' }), 150, 'argento + oro');
    assert.equal(saldo(db, 'u1'), 175);
    assert.equal(await M.premiaBadge({ db, uid: 'u1', chiave: 'pk|didi|y', prima: 2, dopo: 2 }), 0, 'nessun livello nuovo');
});

test('spendi: solo se c\'è il saldo; non va mai sotto zero', async () => {
    const db = dbFinto({ wallet: { u1: { saldo: 100 } } });
    assert.equal(await M.spendi(db, 'u1', 150, 'x'), false);
    assert.equal(saldo(db, 'u1'), 100);
    assert.equal(await M.spendi(db, 'u1', 60, 'Bought'), true);
    assert.equal(saldo(db, 'u1'), 40);
    assert.equal(movimenti(db, 'u1').slice(-1)[0].importo, -60);
    assert.equal(await M.spendi(db, 'u9', 10, 'x'), false, 'senza wallet');
});

test('acquista: sconosciuto, già posseduto, troppo poche monete, e quello andato a buon fine (si paga una volta)', async () => {
    const db = dbFinto({ wallet: { u1: { saldo: 250 } } });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'non-esiste' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' }), { ok: true, saldo: 0 });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' }), { ok: false, motivo: 'owned' });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'shiny' }), { ok: false, motivo: 'poor' });
    assert.ok(db.albero.wallet.u1.posseduti['aura-arcobaleno']);
    assert.equal(saldo(db, 'u1'), 0);
});

test('acquista: due richieste insieme per lo stesso oggetto lo pagano una volta sola; se il saldo non basta non resta nessuna prenotazione', async () => {
    const db = dbFinto({ wallet: { u1: { saldo: 700 } } });
    const [x, y] = await Promise.all([M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' }), M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' })]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find(r => !r.ok).motivo, 'owned');
    assert.equal(saldo(db, 'u1'), 700 - C.perId('aura-arcobaleno').prezzo, 'addebitato una volta');
    assert.equal(movimenti(db, 'u1').filter(m => m.importo < 0).length, 1);

    const povero = dbFinto({ wallet: { u2: { saldo: 5 } } });
    assert.deepEqual(await M.acquista({ db: povero, uid: 'u2', id: 'shiny' }), { ok: false, motivo: 'poor' });
    assert.equal((povero.albero.wallet.u2.posseduti || {}).shiny, undefined, 'la prenotazione è tornata indietro');
    assert.equal(saldo(povero, 'u2'), 5);
});

test('equipa: solo ciò che si possiede; shiny e aura finiscono nel profilo pubblico, togliere li pulisce', async () => {
    const db = dbFinto({ users: { u1: { name: 'Didi' } }, wallet: { u1: { saldo: 0, posseduti: { shiny: 1, 'aura-oro': 1 } } }, players: { didi: { info: {} } } });
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'shiny', attivo: true }), { ok: true });
    assert.equal(db.albero.players.didi.info.pkmShiny, true);
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'aura-oro', attivo: true }), { ok: true });
    assert.equal(db.albero.players.didi.info.aura, 'aura-oro');
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'aura-fiamma', attivo: true }), { ok: false, motivo: 'not-owned' });
    await M.equipa({ db, uid: 'u1', id: 'shiny', attivo: false });
    assert.equal(db.albero.players.didi.info.pkmShiny, undefined);
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'sfondo-raggi', attivo: true }), { ok: false, motivo: 'unknown' }, 'i motivi non si equipaggiano da qui');
    assert.deepEqual(await M.equipa({ db: dbFinto({ wallet: { u2: { posseduti: { shiny: 1 } } } }), uid: 'u2', id: 'shiny', attivo: true }), { ok: false, motivo: 'no-profile' });
});

test('cosmetici: possesso per acquisto o per uso (chi usava un motivo ora a pagamento lo tiene); motivi bloccati', () => {
    assert.equal(C.possiede('shiny', {}), false);
    assert.equal(C.possiede('shiny', { wallet: { posseduti: { shiny: 5 } } }), true);
    assert.equal(C.possiede('shiny', { info: { pkmShiny: true } }), true, 'in uso');
    assert.equal(C.possiede('aura-oro', { info: { aura: 'aura-oro' } }), true);
    assert.equal(C.possiede('aura-oro', { info: { aura: 'aura-fiamma' } }), false);
    assert.equal(C.possiede('sfondo-raggi', { pagina: { sfondo: { motivo: 'raggi' } } }), true, 'il motivo che usi lo tieni');
    assert.equal(C.motivoBloccato('raggi', {}), true);
    assert.equal(C.motivoBloccato('raggi', { wallet: { posseduti: { 'sfondo-raggi': 1 } } }), false);
    assert.equal(C.motivoBloccato('punti', {}), false, 'i motivi gratuiti non sono nel catalogo');
    assert.equal(C.possiede('boh', {}), false);
    assert.deepEqual([...C.possedutiDa({ info: { pkmShiny: true, aura: 'aura-oro' } })].sort(), ['aura-oro', 'shiny']);
    for (const c of C.CATALOGO) assert.ok(c.prezzo > 0 && C.TIPI[c.tipo] && (c.campo || c.motivo), c.id);
    assert.equal(new Set(C.CATALOGO.map(c => c.id)).size, C.CATALOGO.length, 'id unici');
});

test('le due copie di cosmetici.js sono identiche e il server ha i collegamenti (set, badge, stagione, MVP, negozio)', () => {
    assert.equal(leggi('functions', 'cosmetici.js'), leggi('docs', 'cosmetici.js'));
    const p = leggi('functions', 'partita.js');
    assert.match(p, /await premiaSetConcluso\(id, info, stato, vincitore, true\);/);
    assert.match(p, /await premiaSetConcluso\(id, info, stato, vincitore, false\);/);
    const i = leggi('functions', 'index.js');
    assert.match(i, /exports\.acquistaCosmetico = negozio\('acquista'\)/);
    assert.match(i, /exports\.equipaCosmetico = negozio\('equipa'\)/);
    assert.match(i, /chiave: `stagione-\$\{stagione\}`/);
    assert.match(i, /chiave: `mvp-\$\{evento\.params\.stagione\}/);
    assert.match(leggi('.github', 'workflows', 'novita.js'), /monete\.premiaBadge\(\{ db, uid: push\.uidDelGiocatore\(utenti, b\.giocatore\)/);
});
