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
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'shiny' }), { ok: false, motivo: 'poor' });
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
    assert.deepEqual(await M.acquista({ db: povero, uid: 'u2', id: 'shiny' }), { ok: false, motivo: 'poor' });
    assert.equal((povero.albero.wallet.u2.posseduti || {}).shiny, undefined, 'la prenotazione è tornata indietro');
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
const cambiaAv = (db, uid, n) => M.cambia({ db, uid, tipo: 'avatar', id: `avatar-${n}` });
const presi = db => db.albero.cosmeticiPresi || {};

test('cambia avatar: il primo è gratis e resta tuo per sempre; ogni cambio dopo costa; cambiando di nuovo, quello di prima torna libero (tranne il primo)', async () => {
    const db = dbGiocatori();
    const { avatar } = C.PREZZI;
    // il primo: gratis, diventa "di casa"
    assert.deepEqual(await cambiaAv(db, 'u1', 12), { ok: true, saldo: 300, gratis: true, casa: 'avatar-12', avatar: INDIRIZZO(12) });
    assert.equal(db.albero.players.didi.info.avatar, INDIRIZZO(12), 'il server scrive il profilo');
    assert.equal(db.albero.wallet.u1.casa.avatar, 'avatar-12');
    assert.deepEqual(presi(db), { 'avatar-12': 'didi' });
    // il secondo costa; il primo resta riservato anche se non lo porta più
    assert.deepEqual(await cambiaAv(db, 'u1', 13), { ok: true, saldo: 300 - avatar, gratis: false, casa: 'avatar-12', avatar: INDIRIZZO(13) });
    assert.deepEqual(presi(db), { 'avatar-12': 'didi', 'avatar-13': 'didi' });
    // un terzo: il secondo torna libero, il primo no
    const terzo = await cambiaAv(db, 'u1', 14);
    assert.deepEqual(terzo, { ok: true, saldo: 300 - 2 * avatar, gratis: false, casa: 'avatar-12', avatar: INDIRIZZO(14), liberato: 'avatar-13' });
    assert.deepEqual(presi(db), { 'avatar-12': 'didi', 'avatar-14': 'didi' });
    assert.deepEqual(movimenti(db, 'u1').map(m => [m.importo, m.motivo]), [[0, 'Free: Avatar 12'], [-avatar, 'Avatar: Avatar 13'], [-avatar, 'Avatar: Avatar 14']]);
    // gli altri: il secondo (liberato) lo può prendere chiunque; il primo e quello che porta Didi no
    assert.equal((await cambiaAv(db, 'u3', 13)).ok, true, 'liberato');
    assert.deepEqual(await cambiaAv(db, 'u2', 12), { ok: false, motivo: 'taken' }, 'quello di casa di Didi resta suo');
    assert.deepEqual(await cambiaAv(db, 'u2', 14), { ok: false, motivo: 'taken' }, 'e quello che porta');
    assert.equal(saldo(db, 'u2'), 300, 'senza addebiti');
    // tornare al primo non costa mai (è l'unica cosa personale) e libera quello che portava
    const ritorno = await cambiaAv(db, 'u1', 12);
    assert.deepEqual(ritorno, { ok: true, saldo: 300 - 2 * avatar, gratis: false, ritorno: true, casa: 'avatar-12', avatar: INDIRIZZO(12), liberato: 'avatar-14' });
    assert.equal(db.albero.players.didi.info.avatar, INDIRIZZO(12));
    assert.equal(presi(db)['avatar-14'], undefined);
    assert.equal((await cambiaAv(db, 'u2', 14)).ok, true, 'ora è libero');
    assert.deepEqual(movimenti(db, 'u1').slice(-1).map(m => [m.importo, m.motivo]), [[0, 'Back to: Avatar 12']]);
    // un nuovo cambio costa di nuovo, e il primo resta riservato anche stavolta
    assert.equal((await cambiaAv(db, 'u1', 15)).saldo, 300 - 3 * avatar);
    assert.deepEqual(presi(db)['avatar-12'], 'didi');
    // già quello che porta
    assert.deepEqual(await cambiaAv(db, 'u1', 15), { ok: false, motivo: 'same' });
    assert.equal(saldo(db, 'u1'), 300 - 3 * avatar);
});

test('cambia avatar: chi lo aveva già scelto non ha il gratis, e quello che aveva diventa il suo "di casa" al primo cambio', async () => {
    const db = dbGiocatori();
    const { avatar } = C.PREZZI;
    // finché non cambia, quello che porta è protetto perché lo porta (nessuno lo può prendere)
    assert.deepEqual(await cambiaAv(db, 'u3', 7), { ok: false, motivo: 'taken' });
    // il primo cambio costa, e l'avatar di prima resta suo per sempre
    assert.deepEqual(await cambiaAv(db, 'u2', 9), { ok: true, saldo: 300 - avatar, gratis: false, casa: 'avatar-7', avatar: INDIRIZZO(9) });
    assert.equal(db.albero.wallet.u2.casa.avatar, 'avatar-7');
    assert.deepEqual(presi(db), { 'avatar-7': 'lukiani', 'avatar-9': 'lukiani' });
    assert.deepEqual(await cambiaAv(db, 'u3', 7), { ok: false, motivo: 'taken' }, 'ora è riservato, non solo in uso');
    // il secondo cambio libera il 9 e tiene il 7
    const r = await cambiaAv(db, 'u2', 10);
    assert.equal(r.liberato, 'avatar-9');
    assert.deepEqual(presi(db), { 'avatar-7': 'lukiani', 'avatar-10': 'lukiani' });
    // un avatar che usa un altro non si prende, anche se non risulta riservato (era già suo); niente addebito e niente scritture
    assert.deepEqual(await cambiaAv(db, 'u1', 20), { ok: false, motivo: 'taken' });
    assert.equal(saldo(db, 'u1'), 300);
    assert.equal(db.albero.players.didi.info.avatar, 'https://via.placeholder.com/150');
    assert.equal(db.albero.wallet.u1.casa, undefined, 'un tentativo respinto non consuma il gratis');
    assert.equal(presi(db)['avatar-20'], undefined);
    assert.equal((await cambiaAv(db, 'u1', 21)).gratis, true, 'il gratis c\'è ancora');
});

test('cambia avatar: senza monete non cambia niente; due allenatori sullo stesso avatar, ne vince uno; due richieste dello stesso allenatore non pagano due volte; se la scrittura fallisce le monete tornano e la riserva cade', async () => {
    const povero = dbGiocatori({ wallet: { u2: { saldo: 10 } } });
    assert.deepEqual(await cambiaAv(povero, 'u2', 9), { ok: false, motivo: 'poor' });
    assert.equal(povero.albero.players.lukiani.info.avatar, INDIRIZZO(7));
    assert.equal(presi(povero)['avatar-9'], undefined, 'la riserva è tornata libera');
    assert.equal(povero.albero.wallet.u2.casa, undefined, 'e quello di prima non è diventato "di casa"');
    assert.equal(saldo(povero, 'u2'), 10);

    const gara = dbGiocatori({ players: { didi: { info: {} }, ilaria: { info: {} }, lukiani: { info: { avatar: INDIRIZZO(7) } } } });
    const [x, y] = await Promise.all([cambiaAv(gara, 'u1', 30), cambiaAv(gara, 'u3', 30)]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find(r => !r.ok).motivo, 'taken');
    const perso = x.ok ? 'u3' : 'u1';
    assert.equal((await cambiaAv(gara, perso, 31)).gratis, true, 'chi ha perso ha ancora il suo primo gratis');

    const doppio = dbGiocatori();
    const [a, b] = await Promise.all([cambiaAv(doppio, 'u2', 40), cambiaAv(doppio, 'u2', 41)]);
    assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
    assert.equal([a, b].find(r => !r.ok).motivo, 'busy');
    assert.equal(saldo(doppio, 'u2'), 300 - C.PREZZI.avatar, 'addebitato una volta');
    assert.equal(Object.keys(doppio.albero.walletEventi || {}).length, 0, 'il segno di "operazione in corso" è caduto');

    for (const [uid, attesa] of [['u2', 300], ['u1', 300]]) {
        const rotto = dbGiocatori();
        const ref = rotto.ref;
        rotto.ref = (p = '') => { const r = ref(p); if (p === `players/${uid === 'u1' ? 'didi' : 'lukiani'}/info`) r.update = async () => { throw new Error('scrittura fallita'); }; return r; };
        await assert.rejects(cambiaAv(rotto, uid, 50), /scrittura fallita/);
        assert.equal(saldo(rotto, uid), attesa, 'nessun addebito rimasto');
        assert.equal(presi(rotto)['avatar-50'], undefined, 'riserva caduta');
        assert.equal((rotto.albero.wallet[uid].casa || {}).avatar, undefined);
    }
});

test('cambia canzone: il primo è gratis e resta tuo, poi costa; "None" è gratis e libera quella che portavi (non quella di casa); id e indirizzo devono combaciare', async () => {
    const db = dbGiocatori();
    const { canzone } = C.PREZZI;
    const url = n => `https://x.test/${n}.mp3`;
    const cambiaCa = (uid, n, nome) => M.cambia({ db, uid, tipo: 'canzone', id: C.idCanzone(url(n)), url: url(n), nome });
    const c1 = C.idCanzone(url('uno')), c2 = C.idCanzone(url('due')), c3 = C.idCanzone(url('tre'));
    assert.deepEqual(await cambiaCa('u1', 'uno', 'Uno'), { ok: true, saldo: 300, gratis: true, casa: c1, musicaPreferita: url('uno'), musicName: 'Uno' });
    assert.deepEqual([db.albero.players.didi.info.musicaPreferita, db.albero.players.didi.info.musicName], [url('uno'), 'Uno']);
    assert.equal((await cambiaCa('u1', 'due', 'Due')).gratis, false);
    assert.equal(saldo(db, 'u1'), 300 - canzone);
    const r3 = await cambiaCa('u1', 'tre', 'Tre');
    assert.equal(r3.liberato, c2);
    assert.deepEqual(presi(db), { [c1]: 'didi', [c3]: 'didi' });
    assert.deepEqual(await cambiaCa('u3', 'uno', 'Uno'), { ok: false, motivo: 'taken' }, 'quella di casa di Didi');
    assert.deepEqual(await cambiaCa('u3', 'tre', 'Tre'), { ok: false, motivo: 'taken' }, 'quella che porta');
    assert.equal((await cambiaCa('u3', 'due', 'Due')).ok, true, 'quella liberata');
    // nessuna canzone: gratis; quella che portava (non di casa) torna libera
    const nessuna = await M.cambia({ db, uid: 'u1', tipo: 'canzone', id: '' });
    assert.deepEqual(nessuna, { ok: true, saldo: 300 - 2 * canzone, gratis: false, casa: c1, liberato: c3, musicaPreferita: '', musicName: '' });
    assert.deepEqual([db.albero.players.didi.info.musicaPreferita, db.albero.players.didi.info.musicName], ['', '']);
    assert.deepEqual(presi(db), { [c1]: 'didi', [C.idCanzone(url('due'))]: 'ilaria' });
    assert.deepEqual(await M.cambia({ db, uid: 'u1', tipo: 'canzone', id: '' }), { ok: false, motivo: 'same' });
    // chi aveva già una canzone: "None" come primo gesto la tiene "di casa"
    const l = await M.cambia({ db, uid: 'u2', tipo: 'canzone', id: '' });
    assert.equal(l.casa, C.idCanzone('https://x.test/b.mp3'));
    assert.equal(presi(db)[C.idCanzone('https://x.test/b.mp3')], 'lukiani');
    assert.equal(saldo(db, 'u2'), 300);
    // dati che non tornano
    const sbagliati = [
        { id: C.idCanzone(url('uno')), url: url('due') },
        { id: C.idCanzone('javascript:alert(1)'), url: 'javascript:alert(1)' },
        { id: 'canzone-zzzzzzzz', url: url('uno') },
        { id: C.idCanzone(url('uno')), url: '' },
        { id: 'avatar-3', url: url('uno') }
    ];
    for (const d of sbagliati) assert.deepEqual(await M.cambia({ db, uid: 'u3', tipo: 'canzone', ...d, nome: 'x' }), { ok: false, motivo: 'unknown' }, JSON.stringify(d));
    assert.deepEqual(await M.cambia({ db, uid: 'u3', tipo: 'colore', id: 'x' }), { ok: false, motivo: 'unknown' });
    assert.deepEqual(await M.cambia({ db, uid: 'senza-profilo', tipo: 'avatar', id: 'avatar-3' }), { ok: false, motivo: 'no-profile' });
    for (const id of ['avatar-162', 'avatar-293', 'avatar-0', 'canzone-1a2b3c4d', 'avatar-5; x']) assert.deepEqual(await cambiaAv(db, 'u3', id.replace('avatar-', '')), { ok: false, motivo: 'unknown' }, id);
});

test('cambia colore: come l\'avatar: il primo è gratis e di casa, poi si paga, il precedente torna libero, tornare al primo è gratis; chi aveva già un colore lo tiene "di casa" al primo cambio', async () => {
    const db = dbFinto({
        users: { u1: { name: 'Didi' }, u2: { name: 'Lukiani' }, u3: { name: 'Ilaria' } },
        players: {
            didi: { info: { color: '#31c489' } },                       // il verde degli account nuovi: ha ancora quello di partenza
            lukiani: { info: { color: '#6B93B0' } },                    // l'aveva già scelto
            ilaria: { info: {} }
        },
        wallet: { u1: { saldo: 300 }, u2: { saldo: 300 }, u3: { saldo: 300 } }
    });
    const { colore } = C.PREZZI;
    const col = (uid, hex) => M.cambia({ db, uid, tipo: 'colore', id: C.idColore(hex) });
    // il primo: gratis, di casa; il server scrive il colore in maiuscolo
    assert.deepEqual(await col('u1', '#ff8800'), { ok: true, saldo: 300, gratis: true, casa: 'colore-ff8800', color: '#FF8800' });
    assert.equal(db.albero.players.didi.info.color, '#FF8800');
    assert.equal(db.albero.wallet.u1.casa.colore, 'colore-ff8800');
    assert.deepEqual(presi(db), { 'colore-ff8800': 'didi' });
    // poi si paga; il primo resta riservato; il secondo torna libero al terzo
    assert.deepEqual(await col('u1', '#3399FF'), { ok: true, saldo: 300 - colore, gratis: false, casa: 'colore-ff8800', color: '#3399FF' });
    const terzo = await col('u1', '#7A29FF');
    assert.equal(terzo.liberato, 'colore-3399ff');
    assert.deepEqual(presi(db), { 'colore-ff8800': 'didi', 'colore-7a29ff': 'didi' });
    assert.equal((await col('u3', '#3399FF')).ok, true, 'liberato');
    assert.deepEqual(await col('u3', '#FF8800'), { ok: false, motivo: 'taken' }, 'quello di casa di Didi');
    assert.deepEqual(await col('u3', '#7A29FF'), { ok: false, motivo: 'taken' }, 'quello che porta');
    // tornare al primo non costa
    const ritorno = await col('u1', '#FF8800');
    assert.deepEqual(ritorno, { ok: true, saldo: 300 - 2 * colore, gratis: false, ritorno: true, casa: 'colore-ff8800', color: '#FF8800', liberato: 'colore-7a29ff' });
    assert.deepEqual(await col('u1', '#FF8800'), { ok: false, motivo: 'same' });
    // chi aveva già un colore: lo porta anche mentre nessuno lo può prendere; al primo cambio paga e quello diventa di casa
    assert.deepEqual(await col('u3', '#6B93B0'), { ok: false, motivo: 'taken' }, 'lo porta Lukiani');
    assert.deepEqual(await col('u2', '#D11A7A'), { ok: true, saldo: 300 - colore, gratis: false, casa: 'colore-6b93b0', color: '#D11A7A' });
    assert.equal(presi(db)['colore-6b93b0'], 'lukiani');
    assert.deepEqual(await col('u3', '#6B93B0'), { ok: false, motivo: 'taken' }, 'ora è riservato, non solo in uso');
    // solo i colori della palette; il verde degli account nuovi non è un colore da scegliere; il colore non si toglie
    for (const hex of ['#123456', '#31C489', '#fff', 'rosso', '']) assert.deepEqual(await M.cambia({ db, uid: 'u3', tipo: 'colore', id: C.idColore(hex) || 'colore-xx' }), { ok: false, motivo: 'unknown' }, hex);
    assert.deepEqual(await M.cambia({ db, uid: 'u3', tipo: 'colore', id: '' }), { ok: false, motivo: 'unknown' });
    // due allenatori sullo stesso colore insieme: ne vince uno solo, e chi perde ha ancora il primo gratis
    const gara = dbFinto({ users: { u1: { name: 'Didi' }, u2: { name: 'Ilaria' } }, players: { didi: { info: {} }, ilaria: { info: { color: '#31C489' } } }, wallet: { u1: { saldo: 0 }, u2: { saldo: 0 } } });
    const [x, y] = await Promise.all(['u1', 'u2'].map(uid => M.cambia({ db: gara, uid, tipo: 'colore', id: 'colore-00ffcc' })));
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find(r => !r.ok).motivo, 'taken');
    assert.equal((await M.cambia({ db: gara, uid: x.ok ? 'u2' : 'u1', tipo: 'colore', id: 'colore-ff1744' })).gratis, true);
});

test('cambia canzone: tornare alla prima non costa, anche dopo "None"; il resto è come per l\'avatar', async () => {
    const db = dbGiocatori();
    const { canzone } = C.PREZZI;
    const url = n => `https://x.test/${n}.mp3`;
    const cambiaCa = (uid, n, nome) => M.cambia({ db, uid, tipo: 'canzone', id: C.idCanzone(url(n)), url: url(n), nome });
    assert.equal((await cambiaCa('u1', 'uno', 'Uno')).gratis, true);
    assert.equal((await cambiaCa('u1', 'due', 'Due')).saldo, 300 - canzone);
    // tornare alla prima: gratis, e quella di prima torna libera
    const ritorno = await cambiaCa('u1', 'uno', 'Uno');
    assert.deepEqual(ritorno, { ok: true, saldo: 300 - canzone, gratis: false, ritorno: true, casa: C.idCanzone(url('uno')), liberato: C.idCanzone(url('due')), musicaPreferita: url('uno'), musicName: 'Uno' });
    // senza canzone e poi di nuovo la prima: gratis anche così
    assert.equal((await M.cambia({ db, uid: 'u1', tipo: 'canzone', id: '' })).ok, true);
    const dopoNone = await cambiaCa('u1', 'uno', 'Uno');
    assert.deepEqual([dopoNone.ok, dopoNone.ritorno, dopoNone.saldo], [true, true, 300 - canzone]);
    // una nuova costa ancora
    assert.equal((await cambiaCa('u1', 'tre', 'Tre')).saldo, 300 - 2 * canzone);
});

test('avatar e canzoni non si comprano: acquista li rifiuta; il resto del catalogo non è esclusivo (due allenatori possono avere la stessa aura)', async () => {
    const aura = C.perId('aura-oro').prezzo;
    const db = dbGiocatori({ wallet: { u1: { saldo: aura }, u2: { saldo: aura } } });
    for (const id of ['avatar-5', C.idCanzone('https://x.test/a.mp3')]) assert.deepEqual(await M.acquista({ db, uid: 'u1', id }), { ok: false, motivo: 'unknown' });
    assert.equal(saldo(db, 'u1'), aura);
    assert.equal((await M.acquista({ db, uid: 'u1', id: 'aura-oro' })).ok, true);
    assert.equal((await M.acquista({ db, uid: 'u2', id: 'aura-oro' })).ok, true);
    assert.equal(presi(db)['aura-oro'], undefined);
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
    assert.deepEqual(r, { ok: true, saldo: SALDO_SQUADRE - P_GARCHOMP, prezzo: P_GARCHOMP, fascia: 'forte' });
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
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 1 }), { ok: true, saldo: 100, prezzo: P_INCINEROAR, fascia: 'standard' });
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
    assert.deepEqual(prezzi, [200, 400, 600, 800, 1200], 'le cifre che il negozio promette');
    const team = { id: 'T1', nome: 'Misto', pokemon: specie.map(([nome]) => ({ nome, shiny: false })), testoShowdown: specie.map(([nome]) => `${nome}\nAbility: X\n- Protect`).join('\n\n') };
    const totale = prezzi.reduce((a, b) => a + b, 0);
    const db = dbFinto({ users: { u1: { name: 'Didi' } }, wallet: { u1: { saldo: totale } }, players: { didi: { teams: { T1: team } } } });
    for (const [i, [nome, fascia]] of specie.entries()) {
        const prima = saldo(db, 'u1');
        // anche se il client prova a dire un altro prezzo, conta la specie
        const r = await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: i, prezzo: 1, fascia: 'comune' });
        assert.deepEqual(r, { ok: true, saldo: prima - prezzi[i], prezzo: prezzi[i], fascia }, nome);
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
    // il gratis, il ritorno al primo, il prezzo
    assert.deepEqual(C.prezzoCambio('colore', { info: { color: '#31c489' } }, 'colore-ff8800'), { prezzo: 0, gratis: true });
    assert.deepEqual(C.prezzoCambio('colore', { info: { color: '#6B93B0' } }, 'colore-ff8800'), { prezzo: C.PREZZI.colore, gratis: false });
    assert.deepEqual(C.prezzoCambio('colore', { wallet: { casa: { colore: 'colore-6b93b0' } }, info: { color: '#FF8800' } }, 'colore-6b93b0'), { prezzo: 0, gratis: false, ritorno: true });
    assert.deepEqual(C.prezzoCambio('colore', { wallet: { casa: { colore: 'colore-6b93b0' } }, info: { color: '#FF8800' } }, 'colore-ff1744'), { prezzo: C.PREZZI.colore, gratis: false });
    // lo stesso per avatar e canzone
    assert.equal(C.prezzoCambio('avatar', { wallet: { casa: { avatar: 'avatar-5' } }, info: { avatar: 'immagini/profile/9.png' } }, 'avatar-5').prezzo, 0);
    assert.equal(C.prezzoPer('canzone-aaaaaaaa', { wallet: { casa: { canzone: 'canzone-aaaaaaaa' } }, info: { musicaPreferita: 'https://x.test/b.mp3' } }).ritorno, true);
    assert.ok(C.possiede('colore-6b93b0', { wallet: { casa: { colore: 'colore-6b93b0' } }, info: { color: '#FF8800' } }), 'quello di casa è tuo anche se non lo porti');
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
    assert.ok(P.shinyPokemon >= media * 0.45 && P.shinyPokemon <= media * 0.60, `shiny di team ${P.shinyPokemon}`);
    assert.ok(6 * P.shinyPokemon >= media * 2.5 && 6 * P.shinyPokemon <= media * 4, 'una squadra intera shiny: tre stagioni circa');
    // le fasce: la standard costa il prezzo base; una specie comune un quarto di stagione, una leggendaria una stagione e mezza
    const fasce = C.fasceShiny();
    assert.deepEqual(fasce.map(f => f.fascia), ['comune', 'standard', 'forte', 'raro', 'mitico']);
    assert.equal(fasce.find(f => f.fascia === 'standard').prezzo, P.shinyPokemon);
    assert.ok(fasce.every((f, k) => Number.isInteger(f.prezzo) && (k === 0 || f.prezzo > fasce[k - 1].prezzo)), 'prezzi interi e sempre più alti');
    assert.ok(fasce[0].prezzo >= media * 0.2 && fasce[0].prezzo <= media * 0.35, `comune ${fasce[0].prezzo}`);
    assert.ok(fasce[4].prezzo >= media * 1.3 && fasce[4].prezzo <= media * 1.8, `leggendario ${fasce[4].prezzo}`);
    assert.ok(fasce[0].prezzo > P.canzone, 'anche lo shiny più economico costa più di un cambio di canzone');
    // il catalogo fisso: un motivo il 25–40%, un'aura il 45–60%; l'arcobaleno e il compagno shiny tra 3/4 e una stagione; si completa in 4–6 stagioni
    const per = id => C.perId(id).prezzo;
    for (const id of ['sfondo-raggi', 'sfondo-pokeball', 'sfondo-anelli', 'sfondo-stelle', 'sfondo-onde']) assert.ok(per(id) >= media * 0.25 && per(id) <= media * 0.40, `${id} ${per(id)}`);
    for (const id of ['aura-oro', 'aura-fiamma', 'aura-ghiaccio']) assert.ok(per(id) >= media * 0.45 && per(id) <= media * 0.60, `${id} ${per(id)}`);
    for (const id of ['aura-arcobaleno', 'shiny']) assert.ok(per(id) >= media * 0.75 && per(id) <= media * 1.1, `${id} ${per(id)}`);
    const fisso = C.CATALOGO.reduce((t, c) => t + c.prezzo, 0);
    assert.ok(fisso >= media * 4 && fisso <= media * 6, `catalogo fisso ${fisso} = ${(fisso / media).toFixed(1)} stagioni`);
    // gli shiny sono la cosa più cara: quello di un team costa più di due cambi di canzone e più di un motivo; il compagno shiny è al massimo del catalogo
    assert.ok(P.shinyPokemon > P.canzone * 2 && P.shinyPokemon > per('sfondo-onde'), 'lo shiny di un team pesa più dei cambi e dei motivi');
    assert.equal(per('shiny'), Math.max(...C.CATALOGO.map(c => c.prezzo)), 'il compagno shiny è tra i più cari del catalogo');
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
