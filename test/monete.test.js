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
    const ref = (percorso = '') => ({
        once: async () => ({ val: () => { const v = prendi(percorso); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }),
        transaction: async fn => { const att = prendi(percorso); const nuovo = fn(att === undefined ? null : att); if (nuovo === undefined) return { committed: false }; metti(percorso, nuovo); return { committed: true }; },
        remove: async () => metti(percorso, null), set: async v => metti(percorso, v),
        update: async oggetto => { for (const [k, v] of Object.entries(oggetto)) metti(`${percorso}/${k}`, v); },
        push: () => { const k = `-K${String(++c).padStart(6, '0')}`; return { set: async v => metti(`${percorso}/${k}`, v) }; },
        child: k => ref(`${percorso}/${k}`)
    });
    return { albero, ref };
}
const saldo = (db, uid) => (db.albero.wallet && db.albero.wallet[uid] && db.albero.wallet[uid].saldo) || 0;
const movimenti = (db, uid) => Object.values((db.albero.wallet[uid] || {}).movimenti || {});

test('premi: in stagione un set giocato 5, vinto 11; amichevole 2 e 5; badge per livello saltato', () => {
    assert.equal(M.premioSet({ ufficiale: false, vinto: false }), 2);
    assert.equal(M.premioSet({ ufficiale: false, vinto: true }), 5);
    assert.equal(M.premioSet({ ufficiale: true, vinto: false }), 5);
    assert.equal(M.premioSet({ ufficiale: true, vinto: true }), 11);
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

test('premiaSet: i due giocatori, chi vince di più; le amichevoli hanno il tetto di 10 al giorno', async () => {
    const db = dbFinto();
    const r = await M.premiaSet({ db, uids: { p1: 'u1', p2: 'u2' }, vincitore: 'p1', ufficiale: true, id: 'p1', set: 1 });
    assert.deepEqual(r, { p1: 11, p2: 5 });
    assert.deepEqual([saldo(db, 'u1'), saldo(db, 'u2')], [11, 5]);
    await M.premiaSet({ db, uids: { p1: 'u1', p2: 'u2' }, vincitore: 'p1', ufficiale: true, id: 'p1', set: 1 });
    assert.equal(saldo(db, 'u1'), 11, 'lo stesso set non paga due volte');
    // amichevoli: 5 per chi vince, 2 per chi perde, al massimo 10 al giorno
    const adesso = Date.UTC(2026, 10, 3, 12);
    let totale = 0;
    for (let i = 1; i <= 6; i++) totale += (await M.premiaSet({ db: db, uids: { p1: 'u3', p2: '' }, vincitore: 'p1', ufficiale: false, id: `a${i}`, set: 1, adesso })).p1;
    assert.equal(totale, 10, 'tetto giornaliero: 2 set da 5, poi niente');
    assert.equal(saldo(db, 'u3'), 10);
    const domani = await M.premiaSet({ db, uids: { p1: 'u3' }, vincitore: 'p1', ufficiale: false, id: 'a7', set: 1, adesso: adesso + 86400000 });
    assert.equal(domani.p1, 5, 'il giorno dopo si riparte');
    // le stagioni non hanno tetto
    for (let i = 1; i <= 5; i++) await M.premiaSet({ db, uids: { p1: 'u4' }, vincitore: 'p1', ufficiale: true, id: `s${i}`, set: 1, adesso });
    assert.equal(saldo(db, 'u4'), 55);
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
    const db = dbFinto({ wallet: { u1: { saldo: C.perId('aura-arcobaleno').prezzo } } });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'non-esiste' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' }), { ok: true, saldo: 0 });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' }), { ok: false, motivo: 'owned' });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'aura-ghiaccio' }), { ok: false, motivo: 'poor' });
    assert.ok(db.albero.wallet.u1.posseduti['aura-arcobaleno']);
    assert.equal(saldo(db, 'u1'), 0);
});

test('acquista: due richieste insieme per lo stesso oggetto lo pagano una volta sola; se il saldo non basta non resta nessuna prenotazione', async () => {
    const db = dbFinto({ wallet: { u1: { saldo: 2 * C.perId('aura-arcobaleno').prezzo } } });
    const [x, y] = await Promise.all([M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' }), M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' })]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find(r => !r.ok).motivo, 'owned');
    assert.equal(saldo(db, 'u1'), C.perId('aura-arcobaleno').prezzo, 'addebitato una volta');
    assert.equal(movimenti(db, 'u1').filter(m => m.importo < 0).length, 1);

    const povero = dbFinto({ wallet: { u2: { saldo: 5 } } });
    assert.deepEqual(await M.acquista({ db: povero, uid: 'u2', id: 'aura-ghiaccio' }), { ok: false, motivo: 'poor' });
    assert.equal((povero.albero.wallet.u2.posseduti || {})['aura-ghiaccio'], undefined, 'la prenotazione è tornata indietro');
    assert.equal(saldo(povero, 'u2'), 5);
});

const INDIRIZZO = n => `https://didi722.github.io/didi-lu/immagini/profile/${n}.png`;
function dbGiocatori(extra = {}) {
    return dbFinto({
        users: { u1: { name: 'Didi' }, u2: { name: 'Lukiani' }, u3: { name: 'Ilaria' } },
        players: {
            didi: { info: { avatar: 'https://via.placeholder.com/150', musicaPreferita: '' } },                      // ha ancora quelli di partenza
            lukiani: { info: { avatar: INDIRIZZO(7), musicaPreferita: 'https://x.test/b.mp3', musicName: 'B' } },    // li aveva già scelti
            ilaria: { info: { avatar: 'immagini/profile/20.png' } }
        },
        wallet: { u1: { saldo: 300 }, u2: { saldo: 300 }, u3: { saldo: 300 } },
        ...extra
    });
}
const prendiAv = (db, uid, n, extra = {}) => M.prendi({ db, uid, id: `avatar-${n}`, ...extra });
const presi = db => db.albero.cosmeticiPresi || {};
const posseduti = (db, uid) => Object.keys((db.albero.wallet[uid] || {}).posseduti || {}).sort();

test('avatar: il primo è gratis e si indossa; i successivi costano; a quota piena si rilascia (gratis) uno per prenderne un altro, e quello rilasciato torna libero per tutti', async () => {
    const db = dbGiocatori();
    const L = C.LIMITI.avatar, P = C.PREZZI.avatar;
    assert.equal(L, 3);
    // il primo: gratis, indossato, tuo e riservato
    assert.deepEqual(await prendiAv(db, 'u1', 5), { ok: true, saldo: 300, gratis: true, avatar: INDIRIZZO(5) });
    assert.equal(db.albero.players.didi.info.avatar, INDIRIZZO(5));
    assert.deepEqual(posseduti(db, 'u1'), ['avatar-5']);
    assert.equal(presi(db)['avatar-5'], 'didi');
    assert.deepEqual(movimenti(db, 'u1').map(m => [m.importo, m.motivo]), [[0, 'Free: Avatar 5']]);
    // gli altri costano, e si indossa l'ultimo
    assert.deepEqual(await prendiAv(db, 'u1', 6), { ok: true, saldo: 300 - P, gratis: false, avatar: INDIRIZZO(6) });
    assert.deepEqual(await prendiAv(db, 'u1', 8), { ok: true, saldo: 300 - 2 * P, gratis: false, avatar: INDIRIZZO(8) });
    assert.deepEqual(posseduti(db, 'u1'), ['avatar-5', 'avatar-6', 'avatar-8']);
    assert.equal(db.albero.players.didi.info.avatar, INDIRIZZO(8));
    // già suo
    assert.deepEqual(await prendiAv(db, 'u1', 6), { ok: false, motivo: 'owned' });
    // a quota piena: serve rilasciarne uno; senza, non succede niente
    const senza = await prendiAv(db, 'u1', 9);
    assert.deepEqual([senza.ok, senza.motivo, senza.possedute.sort(), senza.limite], [false, 'limit', ['avatar-5', 'avatar-6', 'avatar-8'], L]);
    assert.equal(saldo(db, 'u1'), 300 - 2 * P);
    assert.equal(presi(db)['avatar-9'], undefined);
    // uno che non è suo non si può rilasciare nello scambio
    assert.deepEqual(await prendiAv(db, 'u1', 9, { rilascia: 'avatar-50' }), { ok: false, motivo: 'not-owned' });
    // lo scambio: paga il nuovo, rilascia il vecchio (gratis), indossa il nuovo
    assert.deepEqual(await prendiAv(db, 'u1', 9, { rilascia: 'avatar-5' }), { ok: true, saldo: 300 - 3 * P, gratis: false, rilasciato: 'avatar-5', avatar: INDIRIZZO(9) });
    assert.deepEqual(posseduti(db, 'u1'), ['avatar-6', 'avatar-8', 'avatar-9']);
    assert.equal(presi(db)['avatar-5'], undefined, 'torna libero per tutti');
    assert.equal(presi(db)['avatar-9'], 'didi');
    // e un altro lo può prendere (è il suo primo: gratis o a pagamento a seconda di quello che ha)
    assert.equal((await prendiAv(db, 'u3', 5)).ok, true);
    assert.equal(presi(db)['avatar-5'], 'ilaria');
});

test('avatar: quello di un altro non si prende (comprato da lui, o che porta e basta); senza monete non si paga né si riserva niente; due che lo vogliono insieme: ne vince uno; se la scrittura fallisce le monete tornano', async () => {
    const db = dbGiocatori();
    await prendiAv(db, 'u3', 5);                                           // Ilaria lo compra
    assert.deepEqual(await prendiAv(db, 'u1', 5), { ok: false, motivo: 'taken' });
    assert.deepEqual(await prendiAv(db, 'u1', 7), { ok: false, motivo: 'taken' }, 'Lukiani lo porta (lo aveva prima del negozio), anche se non è ancora nel registro');
    assert.equal(saldo(db, 'u1'), 300);
    assert.deepEqual(posseduti(db, 'u1'), []);
    // senza monete (ha già il primo gratis): non si paga e non resta riservato
    const povero = dbGiocatori({ wallet: { u1: { saldo: 99 }, u2: { saldo: 300 }, u3: { saldo: 300 } } });
    await prendiAv(povero, 'u1', 5);
    assert.deepEqual(await prendiAv(povero, 'u1', 6), { ok: false, motivo: 'poor' });
    assert.equal(presi(povero)['avatar-6'], undefined, 'la riserva cade');
    assert.equal(saldo(povero, 'u1'), 99);
    assert.deepEqual(posseduti(povero, 'u1'), ['avatar-5']);
    // a quota piena e senza monete non si rilascia niente
    const pieno = dbGiocatori({ wallet: { u1: { saldo: 0, posseduti: { 'avatar-1': 1, 'avatar-2': 1, 'avatar-3': 1 } }, u2: { saldo: 0 }, u3: { saldo: 0 } } });
    assert.deepEqual(await prendiAv(pieno, 'u1', 4, { rilascia: 'avatar-1' }), { ok: false, motivo: 'poor' });
    assert.deepEqual(posseduti(pieno, 'u1'), ['avatar-1', 'avatar-2', 'avatar-3'], 'senza pagare non si rilascia');
    // due allenatori insieme sullo stesso avatar
    const gara = dbGiocatori();
    const [x, y] = await Promise.all([prendiAv(gara, 'u1', 12), prendiAv(gara, 'u3', 12)]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find(r => !r.ok).motivo, 'taken');
    // scrittura che fallisce: le monete tornano e la riserva cade
    const rotto = dbGiocatori();
    await prendiAv(rotto, 'u1', 5);
    const ref = rotto.ref;
    rotto.ref = (percorso = '') => { const r = ref(percorso); if (percorso === '') r.update = async () => { throw new Error('scrittura fallita'); }; return r; };
    await assert.rejects(prendiAv(rotto, 'u1', 6), /scrittura fallita/);
    assert.equal(saldo(rotto, 'u1'), 300);
    assert.equal(presi(rotto)['avatar-6'], undefined);
    assert.deepEqual(movimenti(rotto, 'u1').map(m => m.importo), [0, -C.PREZZI.avatar, C.PREZZI.avatar]);
});

test('chi aveva già un avatar prima del negozio: lo ha già (non ha il gratis), conta nel massimo e resta suo anche indossandone un altro; il "di casa" delle versioni precedenti diventa un posseduto', async () => {
    const db = dbGiocatori({ wallet: { u1: { saldo: 300 }, u2: { saldo: 300, casa: { avatar: 'avatar-3' } }, u3: { saldo: 300 } } });
    // Lukiani porta l'7 e ha l'3 "di casa": due su tre
    assert.deepEqual(C.possedutiDiTipo('avatar', { wallet: db.albero.wallet.u2, info: db.albero.players.lukiani.info }).sort(), ['avatar-3', 'avatar-7']);
    assert.equal(C.prezzoAcquisto('avatar', { wallet: db.albero.wallet.u2, info: db.albero.players.lukiani.info }).gratis, false);
    assert.deepEqual(await prendiAv(db, 'u2', 9), { ok: true, saldo: 300 - C.PREZZI.avatar, gratis: false, avatar: INDIRIZZO(9) });
    // l'7 che portava e l'3 "di casa" ora sono scritti come suoi e riservati; "casa" non serve più
    assert.deepEqual(posseduti(db, 'u2'), ['avatar-3', 'avatar-7', 'avatar-9']);
    assert.deepEqual(Object.keys(db.albero.wallet.u2.casa || {}), []);
    assert.deepEqual([presi(db)['avatar-3'], presi(db)['avatar-7'], presi(db)['avatar-9']], ['lukiani', 'lukiani', 'lukiani']);
    // quota piena (3): per un altro si rilascia uno; l'avatar che si porta non si rilascia da solo
    assert.deepEqual(await M.rilascia({ db, uid: 'u2', id: 'avatar-9' }), { ok: false, motivo: 'worn' });
    const piena = await prendiAv(db, 'u2', 10);
    assert.deepEqual([piena.ok, piena.motivo, piena.possedute.sort(), piena.limite], [false, 'limit', ['avatar-3', 'avatar-7', 'avatar-9'], 3]);
    // chi porta uno della vecchia scelta e ne indossa un altro (cambia) non lo perde
    const db2 = dbGiocatori({ wallet: { u1: { saldo: 300 }, u2: { saldo: 300, posseduti: { 'avatar-9': 1 } }, u3: { saldo: 300 } } });
    assert.deepEqual(await M.cambia({ db: db2, uid: 'u2', tipo: 'avatar', id: 'avatar-9' }), { ok: true, saldo: 300, avatar: INDIRIZZO(9) });
    assert.deepEqual(posseduti(db2, 'u2'), ['avatar-7', 'avatar-9'], 'quello di prima è suo e registrato');
    assert.equal(presi(db2)['avatar-7'], 'lukiani');
    assert.deepEqual(await M.cambia({ db: db2, uid: 'u2', tipo: 'avatar', id: 'avatar-7' }), { ok: true, saldo: 300, avatar: INDIRIZZO(7) }, 'tornarci è gratis');
});

test('rilascia: uno che si ha, gratis, torna libero; non quello che si indossa, non uno che non si ha, non uno sconosciuto', async () => {
    const db = dbGiocatori();
    await prendiAv(db, 'u1', 5); await prendiAv(db, 'u1', 6);              // porta il 6
    assert.deepEqual(await M.rilascia({ db, uid: 'u1', id: 'avatar-6' }), { ok: false, motivo: 'worn' });
    assert.deepEqual(await M.rilascia({ db, uid: 'u1', id: 'avatar-40' }), { ok: false, motivo: 'not-owned' });
    assert.deepEqual(await M.rilascia({ db, uid: 'u1', id: 'aura-oro' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.rilascia({ db, uid: 'senza-profilo', id: 'avatar-5' }), { ok: false, motivo: 'no-profile' });
    const prima = saldo(db, 'u1');
    assert.deepEqual(await M.rilascia({ db, uid: 'u1', id: 'avatar-5' }), { ok: true, rilasciato: 'avatar-5' });
    assert.equal(saldo(db, 'u1'), prima, 'gratis, e niente rimborso');
    assert.deepEqual(posseduti(db, 'u1'), ['avatar-6']);
    assert.equal(presi(db)['avatar-5'], undefined);
    assert.equal(movimenti(db, 'u1').at(-1).motivo, 'Released: Avatar 5');
    // l'avatar rilasciato di uno non lo può rilasciare un altro
    assert.deepEqual(await M.rilascia({ db, uid: 'u3', id: 'avatar-6' }), { ok: false, motivo: 'not-owned' });
});

test('cambia (indossa): solo quello che si ha, gratis; già addosso o sconosciuto o non suo: niente; il primo cambio non fa perdere quello di prima', async () => {
    const db = dbGiocatori();
    await prendiAv(db, 'u1', 5); await prendiAv(db, 'u1', 6);
    const prima = saldo(db, 'u1');
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'avatar', id: 'avatar-5' }), { ok: true, saldo: prima, avatar: INDIRIZZO(5) });
    assert.equal(db.albero.players.didi.info.avatar, INDIRIZZO(5));
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'avatar', id: 'avatar-5' }), { ok: false, motivo: 'same' });
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'avatar', id: 'avatar-30' }), { ok: false, motivo: 'not-owned' }, 'prima si compra');
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'avatar', id: 'avatar-9999' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'aura', id: 'aura-oro' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.cambia({ db, uid: 'senza-profilo', tipo: 'avatar', id: 'avatar-5' }), { ok: false, motivo: 'no-profile' });
    assert.equal(saldo(db, 'u1'), prima);
});

test('canzone: la prima è gratis; poi si paga; massimo tre, a quota piena si rilascia; id e indirizzo devono combaciare; si indossa solo quello che si ha; "None" è gratis', async () => {
    const db = dbGiocatori({ wallet: { u1: { saldo: 1000 }, u2: { saldo: 300 }, u3: { saldo: 300 } } });
    const brano = n => ({ id: C.idCanzone(`https://x.test/${n}.mp3`), url: `https://x.test/${n}.mp3`, nome: `Song ${n}` });
    const [a, b, c2, d] = ['a', 'b2', 'c', 'd'].map(brano);
    const prendi = (b0, extra = {}) => M.prendi({ db, uid: 'u1', id: b0.id, url: b0.url, nome: b0.nome, ...extra });
    assert.deepEqual(await prendi(a), { ok: true, saldo: 1000, gratis: true, musicaPreferita: a.url, musicName: 'Song a' });
    assert.deepEqual(db.albero.wallet.u1.posseduti[a.id].url, a.url, 'si ricorda l\'indirizzo e il nome: servono per indossarla di nuovo');
    assert.equal((await prendi(b)).saldo, 1000 - C.PREZZI.canzone);
    assert.equal((await prendi(c2)).ok, true);
    assert.equal((await prendi(d)).motivo, 'limit');
    assert.deepEqual(await prendi(d, { rilascia: a.id }), { ok: true, saldo: 1000 - 3 * C.PREZZI.canzone, gratis: false, rilasciato: a.id, musicaPreferita: d.url, musicName: 'Song d' });
    assert.equal(presi(db)[a.id], undefined);
    // l'indirizzo deve essere quello dell'id
    assert.deepEqual(await M.prendi({ db, uid: 'u3', id: a.id, url: 'https://x.test/altra.mp3', nome: 'X' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.prendi({ db, uid: 'u3', id: a.id, url: 'javascript:alert(1)', nome: 'X' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.prendi({ db, uid: 'u3', id: a.id, url: '', nome: 'X' }), { ok: false, motivo: 'unknown' });
    // indossare: solo le sue; None è gratis
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'canzone', id: b.id, url: b.url, nome: b.nome }), { ok: true, saldo: saldo(db, 'u1'), musicaPreferita: b.url, musicName: 'Song b2' });
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'canzone', id: a.id, url: a.url, nome: a.nome }), { ok: false, motivo: 'not-owned' }, 'l\'ha rilasciata');
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'canzone', id: '' }), { ok: true, saldo: saldo(db, 'u1'), musicaPreferita: '', musicName: '' });
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'canzone', id: '' }), { ok: false, motivo: 'same' });
    assert.deepEqual(posseduti(db, 'u1'), [b.id, c2.id, d.id].sort(), 'senza canzone le sue restano sue');
    // Lukiani aveva già una canzone: ce l'ha (non è gratis), e se la toglie non la perde; senza indossarla la può rilasciare
    assert.equal(C.prezzoAcquisto('canzone', { wallet: db.albero.wallet.u2, info: db.albero.players.lukiani.info }).gratis, false);
    assert.deepEqual(await M.rilascia({ db, uid: 'u2', id: C.idCanzone('https://x.test/b.mp3') }), { ok: false, motivo: 'worn' });
    await M.cambia({ db, uid: 'u2', tipo: 'canzone', id: '' });
    assert.equal(db.albero.wallet.u2.posseduti[C.idCanzone('https://x.test/b.mp3')].nome, 'B');
    assert.equal(presi(db)[C.idCanzone('https://x.test/b.mp3')], 'lukiani');
    assert.deepEqual(await M.rilascia({ db, uid: 'u2', id: C.idCanzone('https://x.test/b.mp3') }), { ok: true, rilasciato: C.idCanzone('https://x.test/b.mp3') });
});

test('colore: il verde degli account nuovi è quello di partenza (il primo è gratis); massimo due; fuori dalla palette non esiste; chi ne aveva già uno lo ha', async () => {
    const db = dbGiocatori();
    db.albero.players.didi.info.color = '#31c489';
    const colore = (uid, hex, extra = {}) => M.prendi({ db, uid, id: C.idColore(hex), ...extra });
    assert.equal(C.LIMITI.colore, 2);
    assert.deepEqual(await colore('u1', '#FF3333'), { ok: true, saldo: 300, gratis: true, color: '#FF3333' });
    assert.equal(db.albero.players.didi.info.color, '#FF3333');
    assert.deepEqual(await colore('u1', '#FF8800'), { ok: true, saldo: 300 - C.PREZZI.colore, gratis: false, color: '#FF8800' });
    assert.equal((await colore('u1', '#0055FF')).motivo, 'limit');
    assert.deepEqual(await colore('u1', '#0055FF', { rilascia: C.idColore('#FF3333') }), { ok: true, saldo: 300 - 2 * C.PREZZI.colore, gratis: false, rilasciato: 'colore-ff3333', color: '#0055FF' });
    assert.equal(presi(db)['colore-ff3333'], undefined);
    assert.equal((await colore('u3', '#FF3333')).ok, true, 'libero per tutti');
    assert.deepEqual(await colore('u1', '#123456'), { ok: false, motivo: 'unknown' }, 'non è nella palette');
    assert.deepEqual(await colore('u2', '#FF8800'), { ok: false, motivo: 'taken' });
    // si indossa solo uno dei suoi
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'colore', id: 'colore-ff8800' }), { ok: true, saldo: saldo(db, 'u1'), color: '#FF8800' });
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'colore', id: 'colore-ff3333' }), { ok: false, motivo: 'not-owned' });
});

test('avatar, colori e canzoni passano da acquista (stesso comando del resto del negozio); il resto del catalogo non è esclusivo (due allenatori possono avere la stessa aura)', async () => {
    const db = dbGiocatori({ wallet: { u1: { saldo: 2000 }, u2: { saldo: 2000 }, u3: { saldo: 2000 } } });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-5' }), { ok: true, saldo: 2000, gratis: true, avatar: INDIRIZZO(5) });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'colore-ff3333' }), { ok: true, saldo: 2000, gratis: true, color: '#FF3333' });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-6', rilascia: 'avatar-5' }), { ok: true, saldo: 2000 - C.PREZZI.avatar, gratis: false, rilasciato: 'avatar-5', avatar: INDIRIZZO(6) }, 'sotto il massimo si può rilasciare lo stesso');
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-bello' }), { ok: false, motivo: 'unknown' });
    assert.equal((await M.acquista({ db, uid: 'u1', id: 'aura-oro' })).ok, true);
    assert.equal((await M.acquista({ db, uid: 'u2', id: 'aura-oro' })).ok, true);
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'aura-oro' }), { ok: false, motivo: 'owned' });
});

const TESTO = `Garchomp @ Rocky Helmet
Ability: Rough Skin
Level: 50
EVs: 252 HP / 252 Atk
Jolly Nature
- Earthquake
- Protect

Incineroar (M) @ Safety Goggles
Ability: Intimidate
Level: 50
- Fake Out

Kingambit (F) @ Black Glasses
Ability: Defiant
- Sucker Punch

Mimey (Mr. Mime) @ Light Clay
Ability: Filter
Shiny: No
- Reflect`;
const SPECIE = ['Garchomp', 'Incineroar', 'Kingambit', 'Mr. Mime'];

test('testoConShiny: aggiunge "Shiny: Yes" nel blocco giusto (dopo Level, o dopo Ability, o al posto di "Shiny: No"); il resto del testo non cambia', () => {
    const solo = (testo, k) => testo.split('\n\n')[k];
    let t = M.testoConShiny(TESTO, 0, 'Garchomp', SPECIE);
    assert.equal(t.replace('Shiny: Yes\n', ''), TESTO, 'a parte la riga aggiunta, uguale');
    assert.match(solo(t, 0), /Level: 50\nShiny: Yes\nEVs:/);
    t = M.testoConShiny(TESTO, 1, 'Incineroar', SPECIE);
    assert.match(solo(t, 1), /Level: 50\nShiny: Yes\n- Fake Out/);
    assert.doesNotMatch(solo(t, 0), /Shiny/);
    t = M.testoConShiny(TESTO, 2, 'Kingambit', SPECIE);
    assert.match(solo(t, 2), /Ability: Defiant\nShiny: Yes\n- Sucker Punch/, 'senza Level, dopo Ability');
    t = M.testoConShiny(TESTO, 3, 'Mr. Mime', SPECIE);
    assert.match(solo(t, 3), /Mimey \(Mr\. Mime\)[^\n]*\nAbility: Filter\nShiny: Yes\n- Reflect/, 'con soprannome; "Shiny: No" diventa Yes');
    assert.doesNotMatch(t, /Shiny: No/);
    // il Pokémon non è in quella posizione: si cerca il blocco della specie; se non c'è, niente
    assert.match(solo(M.testoConShiny(TESTO, 0, 'Kingambit', ['Kingambit']), 2), /Shiny: Yes/);
    assert.equal(M.testoConShiny(TESTO, 1, 'Pikachu', SPECIE), null);
    assert.equal(M.testoConShiny('', 0, 'Garchomp', []), null);
    // doppioni: il secondo Ditto è il secondo blocco di Ditto
    const doppio = 'Ditto @ Choice Scarf\nAbility: Imposter\n- Transform\n\nGarchomp\nAbility: Rough Skin\n- Protect\n\nDitto @ Focus Sash\nAbility: Imposter\n- Transform';
    const d = M.testoConShiny(doppio, 2, 'Ditto', ['Ditto', 'Garchomp', 'Ditto']);
    assert.match(d.split('\n\n')[2], /Shiny: Yes/);
    assert.doesNotMatch(d.split('\n\n')[0], /Shiny/);
    // a capo di Windows
    const win = TESTO.replace(/\n/g, '\r\n');
    const w = M.testoConShiny(win, 1, 'Incineroar', SPECIE);
    assert.ok(!/[^\r]\n/.test(w), 'gli a capo restano \\r\\n');
    assert.match(w, /Level: 50\r\nShiny: Yes\r\n- Fake Out/);
});

test('senzaShinyAbusivi: lo shiny si compra, non si scrive: resta solo ai Pokémon che lo erano già (per specie); un team nuovo non ne ha', () => {
    const testo = 'Garchomp @ Rocky Helmet\nAbility: Rough Skin\nLevel: 50\nShiny: Yes\n- Protect\n\nIncineroar (M)\nAbility: Intimidate\nShiny: Yes\n- Fake Out\n\nDitto\nAbility: Imposter\nShiny: Yes\n- Transform\n\nDitto\nAbility: Imposter\nShiny: Yes\n- Transform';
    const conta = t => (t.match(/Shiny: Yes/g) || []).length;
    assert.equal(conta(C.senzaShinyAbusivi(testo, null)), 0, 'team nuovo: nessuno shiny');
    assert.equal(C.senzaShinyAbusivi(testo, null), testo.replace(/Shiny: Yes\n/g, ''), 'si toglie solo la riga');
    const prima = { pokemon: [{ nome: 'Garchomp', shiny: true }, { nome: 'Incineroar', shiny: false }, { nome: 'Ditto', shiny: true }, { nome: 'Ditto', shiny: false }] };
    const t = C.senzaShinyAbusivi(testo, prima);
    assert.equal(conta(t), 2, 'restano il Garchomp e un Ditto');
    assert.match(t.split('\n\n')[0], /Shiny: Yes/);
    assert.doesNotMatch(t.split('\n\n')[1], /Shiny/);
    assert.match(t.split('\n\n')[2], /Shiny: Yes/);
    assert.doesNotMatch(t.split('\n\n')[3], /Shiny/, 'il secondo Ditto non era shiny');
    // riordinati o con un'altra specie nella stessa posizione: conta la specie
    const altra = C.senzaShinyAbusivi('Dragonite\nAbility: Multiscale\nShiny: Yes\n- Protect\n\nGarchomp\nAbility: Rough Skin\nShiny: Yes\n- Protect', prima);
    assert.doesNotMatch(altra.split('\n\n')[0], /Shiny/, 'un Dragonite nuovo al posto del Garchomp shiny non lo è');
    assert.match(altra.split('\n\n')[1], /Shiny: Yes/);
    // team di prima senza lista, testo vuoto, a capo di Windows
    assert.equal(C.senzaShinyAbusivi('', prima), '');
    assert.equal(conta(C.senzaShinyAbusivi(testo, {})), 0);
    const win = C.senzaShinyAbusivi('Garchomp\r\nAbility: Rough Skin\r\nShiny: Yes\r\n- Protect', null);
    assert.equal(win, 'Garchomp\r\nAbility: Rough Skin\r\n- Protect');
    // un nome che contiene "shiny" nelle mosse o nel soprannome non è la riga
    assert.equal(C.senzaShinyAbusivi('Shinx\nAbility: Intimidate\n- Shiny Tackle', null), 'Shinx\nAbility: Intimidate\n- Shiny Tackle');
});

const P_GARCHOMP = C.prezzoShiny('Garchomp').prezzo, P_INCINEROAR = C.prezzoShiny('Incineroar').prezzo;      // il team di prova: una specie forte e una standard
const SALDO_SQUADRE = P_GARCHOMP + P_INCINEROAR + 100;      // basta per i due shiny e un po' di resto
function dbSquadre(extra = {}) {
    const team = nome => ({ id: 'T1', nome, pokemon: [{ nome: 'Garchomp', shiny: false }, { nome: 'Incineroar', shiny: false }], testoShowdown: 'Garchomp @ Rocky Helmet\nAbility: Rough Skin\nLevel: 50\n- Protect\n\nIncineroar @ Safety Goggles\nAbility: Intimidate\nLevel: 50\n- Fake Out' });
    return dbFinto({
        users: { u1: { name: 'Didi' } },
        wallet: { u1: { saldo: SALDO_SQUADRE } },
        players: { didi: { teams: { T1: team('Alfa') } } },
        seasons: {
            s0: { info: { status: 'closed' }, teams_iscritti: { 'VGC Gen 8': { didi: { datiTeams: [team('Alfa')] } } } },
            s1: { info: { status: 'playing' }, teams_iscritti: { 'VGC Gen 8': { didi: { datiTeams: [team('alfa'), { id: 'T9', nome: 'Beta', pokemon: [{ nome: 'Garchomp' }] }] }, lukiani: { datiTeams: [team('Alfa')] } } } },
            sbeta: { info: { status: 'closed' }, teams_iscritti: {} }
        },
        ...extra
    });
}

test('shinyPokemon: un Pokémon del team diventa shiny (anche se bloccato): Box, testo e iscrizioni alle stagioni non chiuse; si paga una volta; la stagione chiusa e gli altri restano come sono', async () => {
    const db = dbSquadre();
    const r = await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 });
    assert.deepEqual(r, { ok: true, saldo: SALDO_SQUADRE - P_GARCHOMP, prezzo: P_GARCHOMP, fascia: 'forte', gratis: false, attivo: true });
    const box = db.albero.players.didi.teams.T1;
    assert.deepEqual(box.pokemon.map(p => p.shiny), [true, false]);
    assert.match(box.testoShowdown, /^Garchomp @ Rocky Helmet\nAbility: Rough Skin\nLevel: 50\nShiny: Yes\n- Protect\n\nIncineroar[^]*- Fake Out$/);
    const iscritto = db.albero.seasons.s1.teams_iscritti['VGC Gen 8'].didi.datiTeams;
    assert.deepEqual(iscritto[0].pokemon.map(p => p.shiny), [true, false], 'la copia nella stagione in corso (il nome combacia senza badare alle maiuscole)');
    assert.match(iscritto[0].testoShowdown, /Level: 50\nShiny: Yes/);
    assert.equal(iscritto[1].pokemon[0].shiny, undefined, 'un altro team di Didi non si tocca');
    assert.equal(db.albero.seasons['VGC Gen 8'], undefined);
    assert.deepEqual(db.albero.seasons.s0.teams_iscritti['VGC Gen 8'].didi.datiTeams[0].pokemon.map(p => p.shiny), [false, false], 'la stagione chiusa resta com\'era');
    assert.deepEqual(db.albero.seasons.s1.teams_iscritti['VGC Gen 8'].lukiani.datiTeams[0].pokemon.map(p => p.shiny), [false, false], 'il team di un altro allenatore con lo stesso nome non si tocca');
    assert.deepEqual(movimenti(db, 'u1').map(m => [m.importo, m.motivo]), [[-P_GARCHOMP, 'Shiny: Garchomp']]);
    assert.equal(Object.keys(db.albero.walletEventi || {}).length, 0, 'il segno di "acquisto in corso" è caduto');
    // già shiny: niente addebito
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 }), { ok: false, motivo: 'already' });
    assert.equal(saldo(db, 'u1'), SALDO_SQUADRE - P_GARCHOMP);
    // il secondo Pokémon è un altro acquisto, al prezzo della sua specie
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 1 }), { ok: true, saldo: 100, prezzo: P_INCINEROAR, fascia: 'standard', gratis: false, attivo: true });
    assert.deepEqual(db.albero.players.didi.teams.T1.pokemon.map(p => p.shiny), [true, true]);
});

test('shinyPokemon: senza monete o con dati che non tornano non si addebita niente e non si scrive niente', async () => {
    const povero = dbSquadre({ wallet: { u1: { saldo: P_GARCHOMP - 1 } } });
    assert.deepEqual(await M.shinyPokemon({ db: povero, uid: 'u1', team: 'T1', indice: 0 }), { ok: false, motivo: 'poor' });
    assert.equal(povero.albero.players.didi.teams.T1.pokemon[0].shiny, false);
    assert.doesNotMatch(povero.albero.players.didi.teams.T1.testoShowdown, /Shiny/);
    assert.equal(saldo(povero, 'u1'), P_GARCHOMP - 1);
    assert.equal((await M.shinyPokemon({ db: povero, uid: 'u1', team: 'T1', indice: 1 })).ok, true, 'con le stesse monete la specie standard sì: il prezzo dipende dalla specie');

    const db = dbSquadre();
    for (const [team, indice] of [['T404', 0], ['T1', 5], ['T1', -1], ['T1', 'x'], ['../x', 0], ['', 0]]) assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team, indice }), { ok: false, motivo: 'unknown' }, `${team}/${indice}`);
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'senza-profilo', team: 'T1', indice: 0 }), { ok: false, motivo: 'no-profile' });
    // il testo non ha il Pokémon: non si saprebbe come renderlo shiny in battaglia, quindi non si vende
    db.albero.players.didi.teams.T1.testoShowdown = 'Incineroar @ Safety Goggles\nAbility: Intimidate\n- Fake Out';
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 }), { ok: false, motivo: 'cannot-apply' });
    assert.equal(saldo(db, 'u1'), SALDO_SQUADRE);
    assert.equal(movimenti(db, 'u1').length, 0);
    // un team salvato solo come elenco (senza testo) si aggiorna lo stesso
    delete db.albero.players.didi.teams.T1.testoShowdown;
    assert.equal((await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 })).ok, true);
    assert.equal(db.albero.players.didi.teams.T1.pokemon[0].shiny, true);
});

test('shinyPokemon: il prezzo lo decide il server dalla specie nel team (da comune a leggendario), mai dal client; stessa cifra per addebito e rimborso', async () => {
    const specie = [['Pichu', 'comune'], ['Incineroar', 'standard'], ['Garchomp', 'forte'], ['Urshifu', 'raro'], ['Mewtwo', 'mitico']];
    const prezzi = specie.map(([nome]) => C.prezzoShiny(nome).prezzo);
    assert.deepEqual(prezzi, [400, 800, 1000, 1300, 1800], 'le cifre che il negozio promette');
    const team = { id: 'T1', nome: 'Misto', pokemon: specie.map(([nome]) => ({ nome, shiny: false })), testoShowdown: specie.map(([nome]) => `${nome}\nAbility: X\n- Protect`).join('\n\n') };
    const totale = prezzi.reduce((a, b) => a + b, 0);
    const db = dbFinto({ users: { u1: { name: 'Didi' } }, wallet: { u1: { saldo: totale } }, players: { didi: { teams: { T1: team } } } });
    for (const [i, [nome, fascia]] of specie.entries()) {
        const prima = saldo(db, 'u1');
        // anche se il client prova a dire un altro prezzo, conta la specie
        const r = await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: i, prezzo: 1, fascia: 'comune' });
        assert.deepEqual(r, { ok: true, saldo: prima - prezzi[i], prezzo: prezzi[i], fascia, gratis: false, attivo: true }, nome);
    }
    assert.equal(saldo(db, 'u1'), 0);
    assert.deepEqual(movimenti(db, 'u1').map(m => [m.importo, m.motivo]), specie.map(([nome], i) => [-prezzi[i], `Shiny: ${nome}`]));
    assert.ok(db.albero.players.didi.teams.T1.pokemon.every(p => p.shiny === true));
    // un leggendario a un soldo dal prezzo non si vende
    const quasi = dbFinto({ users: { u1: { name: 'Didi' } }, wallet: { u1: { saldo: prezzi[4] - 1 } }, players: { didi: { teams: { T1: { ...team, pokemon: team.pokemon.map(p => ({ ...p })) } } } } });
    assert.deepEqual(await M.shinyPokemon({ db: quasi, uid: 'u1', team: 'T1', indice: 4 }), { ok: false, motivo: 'poor' });
    assert.equal(saldo(quasi, 'u1'), prezzi[4] - 1);
    // la stessa specie scritta in un altro modo (soprannome nel nome, forma, accenti) cade nella stessa fascia
    for (const [nome, fascia] of [['Mewtwo', 'mitico'], ['Calyrex-Shadow', 'mitico'], ['Urshifu-Rapid-Strike', 'raro'], ['Flabébé', 'comune'], ['Mr. Mime', 'standard'], ['Specie Mai Vista', 'standard'], ['', 'standard'], [null, 'standard']]) assert.equal(C.prezzoShiny(nome).fascia, fascia, String(nome));
});

test('shinyPokemon: due richieste insieme lo pagano una volta; un segno vecchio non blocca, uno recente sì; se la scrittura fallisce le monete tornano', async () => {
    const db = dbSquadre();
    const [x, y] = await Promise.all([M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 }), M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 })]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.ok(['busy', 'already'].includes([x, y].find(r => !r.ok).motivo));
    assert.equal(saldo(db, 'u1'), SALDO_SQUADRE - P_GARCHOMP, 'addebitato una volta');

    const adesso = Date.UTC(2026, 10, 3, 12);
    const lock = 'walletEventi/lock-shiny-didi-T1-0';
    const fresco = dbSquadre({ walletEventi: { 'lock-shiny-didi-T1-0': adesso - 5000 } });
    assert.deepEqual(await M.shinyPokemon({ db: fresco, uid: 'u1', team: 'T1', indice: 0, adesso }), { ok: false, motivo: 'busy' });
    assert.equal(saldo(fresco, 'u1'), SALDO_SQUADRE);
    const vecchio = dbSquadre({ walletEventi: { 'lock-shiny-didi-T1-0': adesso - 120000 } });
    assert.equal((await M.shinyPokemon({ db: vecchio, uid: 'u1', team: 'T1', indice: 0, adesso })).ok, true, 'il segno di più di un minuto fa è scaduto');

    const rotto = dbSquadre();
    const ref = rotto.ref;
    rotto.ref = (p = '') => { const r = ref(p); if (p === '') r.update = async () => { throw new Error('scrittura fallita'); }; return r; };
    await assert.rejects(M.shinyPokemon({ db: rotto, uid: 'u1', team: 'T1', indice: 0 }), /scrittura fallita/);
    assert.equal(saldo(rotto, 'u1'), SALDO_SQUADRE, 'le monete tornano');
    assert.deepEqual(movimenti(rotto, 'u1').map(m => m.importo), [-P_GARCHOMP, P_GARCHOMP]);
    assert.equal(rotto.albero.players.didi.teams.T1.pokemon[0].shiny, false);
    assert.equal(Object.keys(rotto.albero.walletEventi || {}).length, 0, 'e il segno cade');
});

test('colori: la lista dei colori firma è la stessa della pagina pubblica; id e colori si convertono; il verde degli account nuovi è "di partenza" e non si sceglie', () => {
    const P = require('../docs/pagina-pubblica.js');
    assert.deepEqual(C.COLORI_FIRMA, P.PALETTE_FIRMA, 'copiata da PALETTE_FIRMA: se cambia l\'una cambia l\'altra');
    assert.equal(C.idColore('#FF8800'), 'colore-ff8800');
    assert.equal(C.idColore('ff8800'), 'colore-ff8800');
    assert.equal(C.coloreDaId('colore-ff8800'), '#FF8800');
    for (const x of ['', '#fff', 'rosso', '#GG0000', null, undefined]) assert.equal(C.idColore(x), '', String(x));
    for (const x of ['', 'colore-ff88', 'avatar-5', 'colore-GG0000']) assert.equal(C.coloreDaId(x), '', String(x));
    // si sceglie solo dalla palette
    assert.equal(C.perId('colore-ff8800').tipo, 'colore');
    assert.equal(C.perId('colore-ff8800').prezzo, C.PREZZI.colore);
    assert.equal(C.perId('colore-123456'), null);
    assert.equal(C.perId(C.idColore(C.COLORE_DEFAULT)), null, 'il verde degli account nuovi non è nella palette');
    assert.equal(C.COLORI_FIRMA.includes(C.COLORE_DEFAULT), false);
    // di partenza: nessun colore, il verde (in qualunque forma), un valore illeggibile
    for (const color of [undefined, '', '#31c489', '#31C489', ' #31c489 ', 'verde']) assert.equal(C.eDiDefault('colore', { color }), true, String(color));
    assert.equal(C.eDiDefault('colore', { color: '#6B93B0' }), false);
    assert.equal(C.idCorrente('colore', { color: '#6b93b0' }), 'colore-6b93b0');
    assert.equal(C.idCorrente('colore', { color: '#31c489' }), '', 'quello di partenza non ha id: non si riserva');
    // il gratis (il primo, per chi ha ancora quello di partenza) e il prezzo; quelli che si hanno
    assert.deepEqual(C.prezzoAcquisto('colore', { info: { color: '#31c489' } }), { prezzo: 0, gratis: true });
    assert.deepEqual(C.prezzoAcquisto('colore', { info: { color: '#6B93B0' } }), { prezzo: C.PREZZI.colore, gratis: false }, 'chi ne aveva già uno lo ha già: non è il primo');
    assert.deepEqual(C.prezzoAcquisto('colore', { wallet: { posseduti: { 'colore-ff8800': 1 } }, info: { color: '#31c489' } }), { prezzo: C.PREZZI.colore, gratis: false });
    assert.deepEqual(C.possedutiDiTipo('colore', { wallet: { casa: { colore: 'colore-6b93b0' }, posseduti: { 'colore-ff1744': 1, 'avatar-5': 1, 'colore-123456': 1 } }, info: { color: '#FF8800' } }).sort(), ['colore-6b93b0', 'colore-ff1744', 'colore-ff8800']);
    assert.equal(C.prezzoPer('avatar-5', { info: { avatar: 'immagini/profile/9.png' } }).prezzo, C.PREZZI.avatar);
    assert.equal(C.prezzoPer('canzone-aaaaaaaa', {}).gratis, true);
    assert.ok(C.possiede('colore-6b93b0', { wallet: { casa: { colore: 'colore-6b93b0' } }, info: { color: '#FF8800' } }), 'quello di casa delle versioni precedenti è tuo');
    assert.ok(C.possiede('colore-ff1744', { wallet: { posseduti: { 'colore-ff1744': 5 } }, info: { color: '#FF8800' } }), 'quello comprato');
    assert.ok(C.possiede('colore-ff8800', { info: { color: '#FF8800' } }), 'e quello che porti');
    assert.equal(C.possiede('colore-ff1744', { info: { color: '#FF8800' } }), false);
});

test('calibrazione: con i set di Sant\'Alvise I si fanno 550–1000 monete a stagione (media ~780); i prezzi sono una frazione o un multiplo di quella stagione tipo, gli shiny i più cari', () => {
    // [set ufficiali, set vinti] a testa nei dati reali della stagione (5 allenatori, 27 showdown, 3 set a match)
    const stagione = { lukiani: [108, 79], didi: [99, 64], hilblacky: [99, 45], ilaria: [90, 38], dodo: [90, 17] };
    const soloSet = Object.values(stagione).map(([setUfficiali, setVinti]) => C.stimaStagione({ setUfficiali, setVinti }).set);
    const media = soloSet.reduce((a, b) => a + b, 0) / soloSet.length;
    assert.ok(media >= 700 && media <= 900, `media ${media}`);
    assert.ok(Math.min(...soloSet) >= 500 && Math.max(...soloSet) <= 1100, soloSet.join(', '));
    assert.ok(Math.max(...soloSet) / Math.min(...soloSet) < 2.2, 'chi vince molto non fa più del doppio di chi perde quasi sempre: giocare conta più che vincere');
    // un allenatore attivo: set + un po' di amichevoli + qualche badge
    const attivo = C.stimaStagione({ setUfficiali: 97, setVinti: 49, amichevoliSet: 24, amichevoliVinti: 12, giorniAmichevoli: 8, badge: 100 });
    assert.ok(attivo.totale >= 900 && attivo.totale <= 1200, `totale ${attivo.totale}`);
    // le amichevoli sono un extra: mai più del tetto al giorno
    assert.equal(C.stimaStagione({ amichevoliSet: 500, amichevoliVinti: 500, giorniAmichevoli: 3 }).amichevoli, 3 * C.PREMI.tettoAmichevoliGiorno);
    assert.ok(42 * C.PREMI.tettoAmichevoliGiorno < media, 'anche giocando amichevoli ogni giorno di una stagione di sei settimane non si supera quello dei set');
    // i prezzi: un cambio di avatar è il 10–15% di una stagione, di canzone il 15–22%; uno shiny di un Pokémon di un team metà stagione (45–60%): una squadra intera ne costa ~tre
    const P = C.PREZZI;
    assert.ok(P.avatar >= media * 0.10 && P.avatar <= media * 0.15, `avatar ${P.avatar}`);
    assert.ok(P.colore >= media * 0.10 && P.colore <= media * 0.15, `colore ${P.colore}`);
    assert.ok(P.canzone >= media * 0.15 && P.canzone <= media * 0.22, `canzone ${P.canzone}`);
    assert.ok(P.shinyPokemon >= media * 0.95 && P.shinyPokemon <= media * 1.15, `shiny di team ${P.shinyPokemon}: uno standard vale circa una stagione`);
    assert.ok(6 * P.shinyPokemon >= media * 5 && 6 * P.shinyPokemon <= media * 7.5, 'una squadra intera di standard shiny: sei stagioni circa');
    // le fasce: la standard costa il prezzo base; una specie comune un quarto di stagione, una leggendaria una stagione e mezza
    const fasce = C.fasceShiny();
    assert.deepEqual(fasce.map(f => f.fascia), ['comune', 'standard', 'forte', 'raro', 'mitico']);
    assert.equal(fasce.find(f => f.fascia === 'standard').prezzo, P.shinyPokemon);
    assert.ok(fasce.every((f, k) => Number.isInteger(f.prezzo) && (k === 0 || f.prezzo > fasce[k - 1].prezzo)), 'prezzi interi e sempre più alti');
    assert.ok(fasce[0].prezzo >= media * 0.4 && fasce[0].prezzo <= media * 0.6, `comune ${fasce[0].prezzo}`);
    assert.ok(fasce[4].prezzo >= media * 2 && fasce[4].prezzo <= media * 2.6, `leggendario ${fasce[4].prezzo}`);
    assert.ok(fasce[0].prezzo > P.canzone, 'anche lo shiny più economico costa più di un cambio di canzone');
    // il catalogo fisso: un motivo il 25–40%, un'aura il 45–60%; l'arcobaleno e il compagno shiny tra 3/4 e una stagione; si completa in 4–6 stagioni
    const per = id => C.perId(id).prezzo;
    for (const id of ['sfondo-raggi', 'sfondo-pokeball', 'sfondo-anelli', 'sfondo-stelle', 'sfondo-onde']) assert.ok(per(id) >= media * 0.25 && per(id) <= media * 0.40, `${id} ${per(id)}`);
    for (const id of ['aura-oro', 'aura-fiamma', 'aura-ghiaccio']) assert.ok(per(id) >= media * 0.45 && per(id) <= media * 0.60, `${id} ${per(id)}`);
    for (const id of ['aura-arcobaleno']) assert.ok(per(id) >= media * 0.75 && per(id) <= media * 1.1, `${id} ${per(id)}`);
    // gli effetti del nome come le aure; quelli del palco, animati, un po' di più
    for (const id of ['nome-oro', 'nome-neon', 'nome-fuoco']) assert.ok(per(id) >= media * 0.45 && per(id) <= media * 0.60, `${id} ${per(id)}`);
    assert.ok(per('nome-arcobaleno') >= media * 0.75 && per('nome-arcobaleno') <= media * 1.1, `nome-arcobaleno ${per('nome-arcobaleno')}`);
    for (const id of ['palco-neve', 'palco-scintille', 'palco-coriandoli', 'palco-stelle']) assert.ok(per(id) >= media * 0.55 && per(id) <= media * 0.75, `${id} ${per(id)}`);
    // il catalogo permanente si completa in 8–24 stagioni: non si esaurisce in fretta (e nessuno lo compra tutto: ognuno prende quello che gli piace)
    const fisso = C.CATALOGO.filter(c => !c.edizione).reduce((t, c) => t + c.prezzo, 0);
    assert.ok(fisso >= media * 8 && fisso <= media * 24, `catalogo permanente ${fisso} = ${(fisso / media).toFixed(1)} stagioni`);
    // gli shiny sono la cosa più cara: quello di un team costa più di due cambi di canzone e più di un motivo; il compagno shiny è al massimo del catalogo
    assert.ok(P.shinyPokemon > P.canzone * 2 && P.shinyPokemon > per('sfondo-onde'), 'lo shiny di un team pesa più dei cambi e dei motivi');
});

test('equipa: solo ciò che si possiede; l\'aura finisce nel profilo pubblico, togliere la pulisce', async () => {
    const db = dbFinto({ users: { u1: { name: 'Didi' } }, wallet: { u1: { saldo: 0, posseduti: { 'aura-oro': 1 } } }, players: { didi: { info: {} } } });
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'aura-oro', attivo: true }), { ok: true });
    assert.equal(db.albero.players.didi.info.aura, 'aura-oro');
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'aura-fiamma', attivo: true }), { ok: false, motivo: 'not-owned' });
    await M.equipa({ db, uid: 'u1', id: 'aura-oro', attivo: false });
    assert.equal(db.albero.players.didi.info.aura, undefined);
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'shiny', attivo: true }), { ok: false, motivo: 'unknown' }, 'il compagno shiny non esiste più');
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'sfondo-raggi', attivo: true }), { ok: false, motivo: 'unknown' }, 'i motivi non si equipaggiano da qui');
    assert.deepEqual(await M.equipa({ db: dbFinto({ wallet: { u2: { posseduti: { 'aura-oro': 1 } } } }), uid: 'u2', id: 'aura-oro', attivo: true }), { ok: false, motivo: 'no-profile' });
});

test('compagno shiny: solo se il compagno viene dal Box ed è shiny quel Pokémon; un compagno generico non è mai shiny e il negozio non lo vende', () => {
    const teams = [{ id: 'T1', pokemon: [{ nome: 'Garchomp', shiny: true }, { nome: 'Mr. Mime', shiny: false }] }];
    // dal Box: conta il Pokémon del Box, qualunque cosa dica pkmShiny
    assert.equal(C.compagnoShiny({ pkmPreferito: 'garchomp', pkmBox: 'T1|0', pkmShiny: false }, teams), true);
    assert.equal(C.compagnoShiny({ pkmPreferito: 'mr-mime', pkmBox: 'T1|1', pkmShiny: true }, teams), false, 'un vecchio pkmShiny non rende shiny');
    assert.equal(C.compagnoDelBox({ pkmPreferito: 'mr-mime', pkmBox: 'T1|1' }, teams).nome, 'Mr. Mime', 'nomi con spazi e punti');
    // il Box è cambiato (un altro Pokémon in quel posto, il team non c'è più, indirizzo storto): è come generico
    for (const pkmBox of ['T1|1', 'T9|0', 'T1|7', 'T1', '', '|0', 'T1|-1', 'T1|x']) assert.equal(C.compagnoDelBox({ pkmPreferito: 'garchomp', pkmBox }, teams), null, pkmBox);
    // generico: mai shiny, anche con un vecchio pkmShiny nel profilo
    assert.equal(C.compagnoShiny({ pkmPreferito: 'garchomp', pkmBox: 'T9|0', pkmShiny: true }, teams), false);
    assert.equal(C.compagnoShiny({ pkmPreferito: 'pikachu', pkmShiny: true }, teams), false);
    assert.equal(C.compagnoShiny({ pkmPreferito: 'pikachu' }, teams), false);
    assert.equal(C.compagnoShiny(null, null), false);
    // i team come arrivano dal database: oggetto id → team, Pokémon in un oggetto
    assert.equal(C.compagnoShiny({ pkmPreferito: 'garchomp', pkmBox: 'T1|0' }, { T1: { pokemon: { 0: { nome: 'Garchomp', shiny: true } } } }), true);
    // il catalogo non ha più il compagno shiny
    assert.equal(C.perId('shiny'), null);
    assert.ok(!C.CATALOGO.some(c => c.tipo === 'shiny' || c.campo === 'pkmShiny'));
});

test('equipa: gli effetti del nome e del palco vanno nei loro campi del profilo (uno per campo: il nuovo prende il posto del vecchio); togliere una voce che non si porta non cancella quella che si porta', async () => {
    const db = dbFinto({ users: { u1: { name: 'Didi' } }, wallet: { u1: { posseduti: { 'nome-oro': 1, 'nome-neon': 1, 'palco-neve': 1, 'aura-oro': 1 } } }, players: { didi: { info: {} } } });
    const info = () => db.albero.players.didi.info;
    await M.equipa({ db, uid: 'u1', id: 'nome-oro', attivo: true });
    await M.equipa({ db, uid: 'u1', id: 'palco-neve', attivo: true });
    assert.deepEqual([info().effettoNome, info().effettoPalco], ['nome-oro', 'palco-neve']);
    await M.equipa({ db, uid: 'u1', id: 'nome-neon', attivo: true });
    assert.equal(info().effettoNome, 'nome-neon', 'un altro effetto del nome prende il posto del primo');
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'nome-fuoco', attivo: true }), { ok: false, motivo: 'not-owned' });
    assert.equal(info().effettoNome, 'nome-neon');
    // una pagina rimasta aperta chiede di togliere l'oro, ma ora si porta il neon: resta il neon
    assert.deepEqual(await M.equipa({ db, uid: 'u1', id: 'nome-oro', attivo: false }), { ok: true });
    assert.equal(info().effettoNome, 'nome-neon');
    await M.equipa({ db, uid: 'u1', id: 'nome-neon', attivo: false });
    assert.equal(info().effettoNome, undefined);
    assert.equal(info().effettoPalco, 'palco-neve', 'l\'altro campo non si tocca');
    // lo stesso vale per l'aura
    await M.equipa({ db, uid: 'u1', id: 'aura-oro', attivo: true });
    await M.equipa({ db, uid: 'u1', id: 'aura-fiamma', attivo: false });
    assert.equal(info().aura, 'aura-oro');
});

test('catalogo: effetti del nome e del palco e edizioni sono coerenti: campo e prefisso giusti, edizione legata a una stagione, ogni voce ha il suo aspetto nei fogli di stile e la sua regola nel database', () => {
    const css = leggi('docs', 'effetti-pagina.css'), pagina = leggi('docs', 'style-public-card.css'), regole = leggi('REGOLE-DATABASE.md');
    const per = tipo => C.CATALOGO.filter(c => c.tipo === tipo);
    assert.ok(per('nome').length >= 8 && per('palco').length >= 4 && per('aura').length >= 8, 'ce n\'è una buona scelta');
    for (const c of per('nome')) { assert.equal(c.campo, 'effettoNome', c.id); assert.match(c.id, /^nome-[a-z]+$/, c.id); assert.ok(css.includes(`data-effetto-nome="${c.id}"`), `${c.id} non ha il suo aspetto in effetti-pagina.css`); }
    for (const c of per('palco')) { assert.equal(c.campo, 'effettoPalco', c.id); assert.match(c.id, /^palco-[a-z]+$/, c.id); assert.ok(css.includes(`data-effetto-palco="${c.id}"`), `${c.id} non ha il suo aspetto in effetti-pagina.css`); }
    for (const c of per('aura')) { assert.equal(c.campo, 'aura', c.id); assert.ok(pagina.includes(`data-aura="${c.id}"`), `${c.id} non ha il suo aspetto in style-public-card.css`); }
    for (const campo of new Set(C.CATALOGO.map(c => c.campo).filter(Boolean))) assert.ok(regole.includes(`"${campo}": { ".validate"`), `REGOLE-DATABASE.md non protegge info/${campo}`);
    for (const c of C.CATALOGO.filter(x => x.edizione)) {
        assert.match(c.edizione.stagione, /^s\d+$/, c.id);
        assert.ok(String(c.edizione.nome).length >= 3, c.id);
    }
    // le animazioni rispettano chi non le vuole
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^]*?\[data-effetto-palco\]::before/);
    assert.match(pagina, /@media \(prefers-reduced-motion: reduce\) \{ \.pp-allenatore\[data-aura="aura-arcobaleno"\] img \{ animation: none/);
});

test('cosmetici: possesso per acquisto o per uso (chi usava un motivo ora a pagamento lo tiene); motivi bloccati', () => {
    assert.equal(C.possiede('aura-oro', { info: { aura: 'aura-oro' } }), true);
    assert.equal(C.possiede('aura-oro', { info: { aura: 'aura-fiamma' } }), false);
    assert.equal(C.possiede('sfondo-raggi', { pagina: { sfondo: { motivo: 'raggi' } } }), true, 'il motivo che usi lo tieni');
    assert.equal(C.motivoBloccato('raggi', {}), true);
    assert.equal(C.motivoBloccato('raggi', { wallet: { posseduti: { 'sfondo-raggi': 1 } } }), false);
    assert.equal(C.motivoBloccato('punti', {}), false, 'i motivi gratuiti non sono nel catalogo');
    assert.equal(C.possiede('boh', {}), false);
    assert.deepEqual([...C.possedutiDa({ info: { pkmShiny: true, aura: 'aura-oro' } })].sort(), ['aura-oro'], 'un vecchio pkmShiny non conta');
    for (const c of C.CATALOGO) assert.ok(c.prezzo > 0 && C.TIPI[c.tipo] && (c.campo || c.motivo), c.id);
    assert.equal(new Set(C.CATALOGO.map(c => c.id)).size, C.CATALOGO.length, 'id unici');
});

test('rarita-pkm: le fasce delle specie (comune, forte, raro, mitico; il resto è standard), senza doppioni e senza maiuscole; i nomi si leggono anche con accenti e forme', () => {
    const R = require('../docs/rarita-pkm.js');
    assert.deepEqual(Object.keys(R.ELENCHI), ['comune', 'forte', 'raro', 'mitico']);
    const visti = new Map();
    for (const [fascia, ids] of Object.entries(R.ELENCHI)) {
        const lista = ids.split(' ');
        assert.ok(lista.length >= 50, `${fascia}: ${lista.length} specie`);
        for (const id of lista) {
            assert.match(id, /^[a-z0-9]+$/, `${fascia}: ${id}`);
            assert.ok(!visti.has(id), `${id} sta in due fasce: ${visti.get(id)} e ${fascia}`);
            visti.set(id, fascia);
        }
    }
    const attese = {
        comune: ['pichu', 'magikarp', 'ditto', 'pikachu', 'eevee', 'dwebble', 'ponytagalar'],
        standard: ['incineroar', 'torkoal', 'mrmime', 'whimsicott', 'charizard'],
        forte: ['garchomp', 'dragonite', 'tyranitar', 'dragapult', 'greattusk', 'fluttermane', 'kingambit', 'rillaboom'],
        raro: ['urshifu', 'urshifurapidstrike', 'landorustherian', 'zapdos', 'cresselia', 'nihilego', 'tapukoko', 'regieleki', 'ogerpon'],
        mitico: ['mew', 'mewtwo', 'arceus', 'zacian', 'calyrexshadow', 'koraidon', 'eternatus', 'zygarde', 'jirachi', 'rayquaza']
    };
    for (const [fascia, specie] of Object.entries(attese)) for (const id of specie) assert.equal(R.fascia(id), fascia, id);
    // nomi come li scrive un team: maiuscole, trattini, punti, accenti, spazi
    assert.equal(R.fascia('Calyrex-Shadow'), 'mitico');
    assert.equal(R.fascia('Urshifu-Rapid-Strike'), 'raro');
    assert.equal(R.fascia('Mr. Mime'), 'standard');
    assert.equal(R.fascia('Flabébé'), 'comune');
    assert.equal(R.fascia('  GARCHOMP  '), 'forte');
    for (const x of ['Missingno', '', '   ', null, undefined, 42, {}]) assert.equal(R.fascia(x), 'standard', String(x));
    // la fascia vale per ogni forma (mega, regionale), non solo per la specie base
    assert.equal(R.fascia('Charizard-Mega-X'), 'forte');
    assert.equal(R.fascia('Mewtwo-Mega-Y'), 'mitico');
});

test('rarita-pkm: le regole delle fasce (il generatore) e il file generato è aggiornato rispetto al simulatore del sito', async () => {
    const G = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'tools', 'rarita-pkm', 'genera.mjs')).href);
    const f = (tags, extra = {}) => G.fasciaDi({ tier: 'NU', bst: 500, nfe: false, tags, ...extra });
    assert.equal(f(['Mythical']), 'mitico');
    assert.equal(f(['Restricted Legendary']), 'mitico');
    assert.equal(f(['Mythical'], { nfe: true }), 'mitico', 'la categoria vince su tutto');
    assert.equal(f(['Sub-Legendary']), 'raro');
    assert.equal(f(['Ultra Beast']), 'raro');
    assert.equal(f([], { nfe: true, bst: 700 }), 'comune', 'non completamente evoluto');
    assert.equal(f([], { bst: 440 }), 'comune');
    assert.equal(f([], { bst: 450 }), 'standard');
    assert.equal(f([], { bst: 599 }), 'standard');
    assert.equal(f([], { bst: 600 }), 'forte');
    assert.equal(f(['Paradox'], { bst: 570 }), 'forte');
    for (const tier of ['OU', 'UUBL', 'Uber', 'AG']) assert.equal(f([], { tier }), 'forte', tier);
    assert.equal(f([], { tier: 'UU' }), 'standard');
    // il file del sito e quello del server sono quelli che il generatore produce adesso con docs/pkmn-sim.js: se il simulatore si aggiorna, `node tools/rarita-pkm/genera.mjs`
    const generato = G.sorgente(await G.costruisci());
    assert.equal(leggi('docs', 'rarita-pkm.js'), generato, 'docs/rarita-pkm.js è vecchio: rilancia node tools/rarita-pkm/genera.mjs');
    assert.equal(leggi('functions', 'rarita-pkm.js'), generato, 'functions/rarita-pkm.js è vecchio: rilancia node tools/rarita-pkm/genera.mjs');
});

test('le due copie di cosmetici.js sono identiche e il server ha i collegamenti (set, badge, stagione, MVP, negozio)', () => {
    assert.equal(leggi('functions', 'cosmetici.js'), leggi('docs', 'cosmetici.js'));
    assert.equal(leggi('functions', 'rarita-pkm.js'), leggi('docs', 'rarita-pkm.js'));
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

test('ricalcolo delle monete: set dai punteggi dei match, badge, stagioni vinte e MVP; la beta non conta; rilanciandolo non si paga due volte', async () => {
    const R = require('../.github/workflows/ricalcola-monete.js');
    const match = (p1, p2, s1, s2) => ({ player1Id: p1, player2Id: p2, p1score: s1, p2score: s2 });
    const dati = {
        seasons: {
            s0: { info: { name: 'Uno', status: 'closed', winner: 'Lu' }, showdowns: { a: { matches: { m1: match('didi', 'lu', 1, 2), m2: match('didi', 'lu', 0, 3), m3: { player1Id: 'didi', player2Id: 'lu' } } } }, mvp: { risultato: { vincitori: { x: { chiave: 'k1', player: 'Didi', specie: 'Garchomp' } } } } },
            sbeta: { info: { status: 'closed' }, showdowns: { a: { matches: { m1: match('didi', 'lu', 3, 0) } } } }
        },
        players: {}
    };
    const c = R.calcola(dati, { badge: false });
    const O = C.PREMI.set.ufficiale;
    assert.deepEqual(c.didi.sets.s0, { giocati: 6, vinti: 1, monete: 6 * O.giocato + 1 * O.vinto });
    assert.deepEqual(c.lu.sets.s0, { giocati: 6, vinti: 5, monete: 6 * O.giocato + 5 * O.vinto });
    assert.equal(c.didi.sets.sbeta, undefined, 'la beta non conta');
    assert.equal(R.totale(c.lu), c.lu.sets.s0.monete + C.PREMI.stagioneVinta);
    assert.equal(R.totale(c.didi), c.didi.sets.s0.monete + C.PREMI.mvp);
    const db = dbFinto({ users: { u1: { name: 'Didi' }, u2: { name: 'Lu' } } });
    await R.applica(db, dati, { u1: { name: 'Didi' }, u2: { name: 'Lu' } }, { log: () => {}, badge: false });
    assert.equal(saldo(db, 'u1'), R.totale(c.didi));
    assert.equal(saldo(db, 'u2'), R.totale(c.lu));
    await R.applica(db, dati, { u1: { name: 'Didi' }, u2: { name: 'Lu' } }, { log: () => {}, badge: false });
    assert.equal(saldo(db, 'u1'), R.totale(c.didi), 'rilanciato: niente di nuovo, niente doppio');
    // un set in più dopo: paga solo la differenza
    dati.seasons.s0.showdowns.a.matches.m4 = match('didi', 'lu', 2, 0);
    await R.applica(db, dati, { u1: { name: 'Didi' }, u2: { name: 'Lu' } }, { log: () => {}, badge: false });
    assert.equal(saldo(db, 'u1'), R.totale(R.calcola(dati, { badge: false }).didi));
});

test('spendi: come fa il vero database, la prima esecuzione parte con il valore vuoto (cache): annullare lì dava "monete insufficienti" a torto', async () => {
    const db = dbFinto({ users: { u1: { name: 'Didi' } }, wallet: { u1: { saldo: 1854 } }, players: { didi: { info: {} } } });
    const reale = db.ref.bind(db);
    // il vero database: prima il gestore con null; se annulla è finita, altrimenti il server vede che non combacia e lo rilancia con il valore vero
    db.ref = percorso => {
        const r = reale(percorso), tr = r.transaction;
        if (/\/saldo$/.test(percorso)) r.transaction = async fn => { const primo = fn(null); return primo === undefined ? { committed: false } : tr(fn); };
        return r;
    };
    assert.equal(await M.spendi(db, 'u1', 250, 'prova'), true);
    assert.equal(saldo(db, 'u1'), 1604);
    assert.equal(await M.spendi(db, 'u1', 5000, 'troppo'), false, 'con il saldo vero che non basta si annulla');
    assert.equal(saldo(db, 'u1'), 1604);
});

test('shinyPokemon: si può tornare normale (gratis) e, avendolo già comprato, rimetterlo shiny gratis; chi era shiny prima del conto lo ritrova gratis', async () => {
    const db = dbSquadre();
    const pagato = await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 });
    assert.equal(pagato.ok, true);
    const dopo = saldo(db, 'u1');
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 1, attivo: false }), { ok: false, motivo: 'not-shiny' }, 'non è shiny: niente da togliere');
    // tornare normale: gratis, via il segno nel team, nel testo e nella copia della stagione; il conto dell'acquisto resta
    const normale = await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0, attivo: false });
    assert.deepEqual([normale.ok, normale.prezzo, normale.attivo], [true, 0, false]);
    const box = db.albero.players.didi.teams.T1;
    assert.deepEqual(box.pokemon.map(p => !!p.shiny), [false, false]);
    assert.doesNotMatch(box.testoShowdown, /Shiny/);
    assert.deepEqual(db.albero.seasons.s1.teams_iscritti['VGC Gen 8'].didi.datiTeams[0].pokemon.map(p => !!p.shiny), [false, false]);
    assert.equal(saldo(db, 'u1'), dopo);
    // rimetterlo: gratis, perché già comprato
    const ancora = await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 });
    assert.deepEqual([ancora.ok, ancora.prezzo, ancora.gratis], [true, 0, true]);
    assert.equal(saldo(db, 'u1'), dopo, 'nessun addebito');
    assert.match(db.albero.players.didi.teams.T1.testoShowdown, /Level: 50\nShiny: Yes/);
    assert.equal(movimenti(db, 'u1').length, 1, 'un solo movimento: quello dell\'acquisto');
    // già shiny prima che si tenesse il conto: tornando normale si registra, e poi si ritrova gratis
    const vecchio = dbSquadre();
    vecchio.albero.players.didi.teams.T1.pokemon[0].shiny = true;
    assert.equal((await M.shinyPokemon({ db: vecchio, uid: 'u1', team: 'T1', indice: 0, attivo: false })).ok, true);
    const prima = saldo(vecchio, 'u1');
    assert.equal((await M.shinyPokemon({ db: vecchio, uid: 'u1', team: 'T1', indice: 0 })).gratis, true);
    assert.equal(saldo(vecchio, 'u1'), prima);
});
