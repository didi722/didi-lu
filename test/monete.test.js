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
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'aura-arcobaleno' }), { ok: true, saldo: 0, gratis: false });
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

test('avatar e canzoni: il primo sblocco è gratis per chi ha ancora quelli di partenza (uno per tipo), poi si paga; quello che si usava resta suo e non si ripaga', async () => {
    const db = dbFinto({
        users: { u1: { name: 'Nuovo' }, u2: { name: 'Vecchio' }, u3: { name: 'Terzo' } },
        players: {
            nuovo: { info: { avatar: 'https://via.placeholder.com/150', musicaPreferita: '' } },
            vecchio: { info: { avatar: 'https://didi722.github.io/didi-lu/immagini/profile/7.png', musicaPreferita: 'https://x.test/a.mp3', musicName: 'A' } },
            terzo: { info: { avatar: 'immagini/profile/9.png' } }
        },
        wallet: { u1: { saldo: 100 }, u2: { saldo: 100 } }
    });
    const { avatar, canzone } = C.PREZZI;
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-12' }), { ok: true, saldo: 100, gratis: true }, 'il primo avatar è gratis');
    assert.ok(db.albero.wallet.u1.gratis.avatar && db.albero.wallet.u1.posseduti['avatar-12']);
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-13' }), { ok: true, saldo: 100 - avatar, gratis: false }, 'il secondo si paga (l\'avatar di partenza non è cambiato, ma lo sblocco gratis è già stato usato)');
    const uno = C.idCanzone('https://x.test/uno.mp3'), due = C.idCanzone('https://x.test/due.mp3');
    assert.equal((await M.acquista({ db, uid: 'u1', id: uno, nome: 'Uno' })).gratis, true, 'la prima canzone è gratis, anche se l\'avatar l\'ha già usata per il suo tipo');
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: due, nome: 'Due' }), { ok: true, saldo: 100 - avatar - canzone, gratis: false });
    assert.deepEqual(movimenti(db, 'u1').map(m => [m.importo, m.motivo]), [[0, 'Free: Avatar 12'], [-avatar, 'Bought: Avatar 13'], [0, 'Free: Uno'], [-canzone, 'Bought: Due']]);

    // chi ha già un avatar e una canzone paga subito; quello che usava resta suo (era "in uso", mai comprato)
    assert.deepEqual(await M.acquista({ db, uid: 'u2', id: 'avatar-20' }), { ok: true, saldo: 100 - avatar, gratis: false });
    assert.ok(db.albero.wallet.u2.posseduti['avatar-7'], 'l\'avatar di prima è suo');
    assert.deepEqual(await M.acquista({ db, uid: 'u2', id: 'avatar-7' }), { ok: false, motivo: 'owned' }, 'tornare a quello di prima non costa');
    const tre = C.idCanzone('https://x.test/tre.mp3');
    assert.equal((await M.acquista({ db, uid: 'u2', id: tre })).gratis, false, 'ha già una canzone: niente gratis');
    assert.ok(db.albero.wallet.u2.posseduti[C.idCanzone('https://x.test/a.mp3')], 'anche la canzone di prima resta sua');
    // l'avatar in uso adesso è già suo: nessun addebito
    assert.deepEqual(await M.acquista({ db, uid: 'u3', id: 'avatar-9' }), { ok: false, motivo: 'owned' });
    // id che non esistono
    for (const id of ['avatar-162', 'avatar-293', 'avatar-0', 'canzone-xyz', 'avatar-1; drop']) assert.deepEqual(await M.acquista({ db, uid: 'u1', id }), { ok: false, motivo: 'unknown' }, id);
});

test('avatar e canzoni hanno un solo proprietario: comprare vuol dire riservare, anche se poi non lo si usa; nessuno li può comprare finché sono di un altro, e non si paga niente', async () => {
    const db = dbFinto({
        users: { u1: { name: 'Didi' }, u2: { name: 'Lukiani' }, u3: { name: 'Ilaria' } },
        players: {
            didi: { info: { avatar: 'https://didi722.github.io/didi-lu/immagini/profile/7.png', musicaPreferita: 'https://x.test/a.mp3' } },
            lukiani: { info: { avatar: 'immagini/profile/20.png', musicaPreferita: 'https://x.test/b.mp3' } },
            ilaria: { info: { avatar: 'https://via.placeholder.com/150' } }
        },
        wallet: { u1: { saldo: 500 }, u2: { saldo: 500 }, u3: { saldo: 500 } }
    });
    const { avatar } = C.PREZZI;
    // Didi compra l'avatar 5 e continua a usare il 7: l'avatar 5 è suo e di nessun altro
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-5' }), { ok: true, saldo: 500 - avatar, gratis: false });
    assert.equal(db.albero.cosmeticiPresi['avatar-5'], 'didi');
    assert.deepEqual(await M.acquista({ db, uid: 'u2', id: 'avatar-5' }), { ok: false, motivo: 'taken' }, 'comprato da Didi, anche se non lo usa');
    assert.equal(saldo(db, 'u2'), 500, 'e non si addebita niente');
    assert.equal((db.albero.wallet.u2.posseduti || {})['avatar-5'], undefined);
    // un avatar in uso da un altro (mai comprato: era già suo) non si vende
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-20' }), { ok: false, motivo: 'taken' }, 'lo usa Lukiani');
    // chi cambia avatar tiene il vecchio e nessun altro lo può prendere: era suo per uso, ora lo è per possesso
    assert.equal(db.albero.cosmeticiPresi['avatar-7'], 'didi');
    assert.deepEqual(await M.acquista({ db, uid: 'u3', id: 'avatar-7' }), { ok: false, motivo: 'taken' }, 'Didi non lo usa più per scelta, ma resta suo');
    // le canzoni uguale
    const a = C.idCanzone('https://x.test/a.mp3'), nuova = C.idCanzone('https://x.test/nuova.mp3');
    assert.deepEqual(await M.acquista({ db, uid: 'u2', id: a }), { ok: false, motivo: 'taken' }, 'la canzone in uso da Didi');
    assert.equal((await M.acquista({ db, uid: 'u1', id: nuova })).ok, true);
    assert.equal(db.albero.cosmeticiPresi[a], 'didi', 'la canzone di prima resta di Didi');
    assert.equal(db.albero.cosmeticiPresi[nuova], 'didi');
    assert.deepEqual(await M.acquista({ db, uid: 'u3', id: nuova }), { ok: false, motivo: 'taken' });
    // chi è già proprietario non è un altro: lo stesso Didi riprova → "owned"
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-5' }), { ok: false, motivo: 'owned' });
    // il resto del catalogo non è esclusivo: due allenatori possono avere la stessa aura
    assert.equal((await M.acquista({ db, uid: 'u1', id: 'aura-oro' })).ok, true);
    assert.equal((await M.acquista({ db, uid: 'u2', id: 'aura-oro' })).ok, true);
    assert.equal(db.albero.cosmeticiPresi['aura-oro'], undefined);
});

test('avatar riservato: due allenatori che comprano lo stesso insieme, uno solo lo prende e si paga una volta; se il saldo non basta la riserva torna libera; "taken" non consuma lo sblocco gratis', async () => {
    const db = dbFinto({
        users: { u1: { name: 'Didi' }, u2: { name: 'Lukiani' }, u3: { name: 'Ilaria' } },
        players: { didi: { info: {} }, lukiani: { info: {} }, ilaria: { info: { avatar: 'immagini/profile/3.png' } } },
        wallet: { u1: { saldo: 100 }, u2: { saldo: 100 }, u3: { saldo: 1 } }
    });
    const [x, y] = await Promise.all([M.acquista({ db, uid: 'u1', id: 'avatar-9' }), M.acquista({ db, uid: 'u2', id: 'avatar-9' })]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.equal([x, y].find(r => !r.ok).motivo, 'taken');
    const vinto = x.ok ? 'didi' : 'lukiani', perso = x.ok ? 'u2' : 'u1';
    assert.equal(db.albero.cosmeticiPresi['avatar-9'], vinto);
    // chi ha perso non ha pagato, non ha l'avatar e può ancora usare il suo gratis per un altro
    assert.equal(saldo(db, perso), 100);
    assert.equal((db.albero.wallet[perso].posseduti || {})['avatar-9'], undefined);
    assert.equal(db.albero.wallet[perso].gratis, undefined, 'lo sblocco gratis non si è consumato');
    assert.deepEqual(await M.acquista({ db, uid: perso, id: 'avatar-10' }), { ok: true, saldo: 100, gratis: true });
    // senza monete la riserva non resta: l'avatar torna libero per gli altri
    assert.deepEqual(await M.acquista({ db, uid: 'u3', id: 'avatar-11' }), { ok: false, motivo: 'poor' });
    assert.equal(db.albero.cosmeticiPresi['avatar-11'], undefined, 'riserva tornata libera');
    assert.equal((await M.acquista({ db, uid: perso, id: 'avatar-11' })).ok, true);
    // un acquisto interrotto a metà (riservato ma non nel portafoglio) si porta a termine dallo stesso allenatore
    db.albero.cosmeticiPresi['avatar-12'] = vinto;
    const rep = await M.acquista({ db, uid: x.ok ? 'u1' : 'u2', id: 'avatar-12' });
    assert.equal(rep.ok, true, 'era già suo nel registro: si riprende');
    // e non si riserva per chi non ha un profilo
    assert.deepEqual(await M.acquista({ db, uid: 'senza-profilo', id: 'avatar-40' }), { ok: false, motivo: 'no-profile' });
});

test('avatar e canzoni senza monete: lo sblocco gratis si consuma lo stesso, quello a pagamento no; la prenotazione torna indietro', async () => {
    const db = dbFinto({ users: { u1: { name: 'Nuovo' } }, players: { nuovo: { info: { avatar: '' } } }, wallet: { u1: { saldo: 10 } } });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-3' }), { ok: true, saldo: 10, gratis: true });
    assert.deepEqual(await M.acquista({ db, uid: 'u1', id: 'avatar-4' }), { ok: false, motivo: 'poor' });
    assert.equal(db.albero.wallet.u1.posseduti['avatar-4'], undefined);
    assert.equal(saldo(db, 'u1'), 10);
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

function dbSquadre(extra = {}) {
    const team = nome => ({ id: 'T1', nome, pokemon: [{ nome: 'Garchomp', shiny: false }, { nome: 'Incineroar', shiny: false }], testoShowdown: 'Garchomp @ Rocky Helmet\nAbility: Rough Skin\nLevel: 50\n- Protect\n\nIncineroar @ Safety Goggles\nAbility: Intimidate\nLevel: 50\n- Fake Out' });
    return dbFinto({
        users: { u1: { name: 'Didi' } },
        wallet: { u1: { saldo: 250 } },
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
    assert.deepEqual(r, { ok: true, saldo: 250 - C.PREZZI.shinyPokemon });
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
    assert.deepEqual(movimenti(db, 'u1').map(m => [m.importo, m.motivo]), [[-C.PREZZI.shinyPokemon, 'Shiny: Garchomp']]);
    assert.equal(Object.keys(db.albero.walletEventi || {}).length, 0, 'il segno di "acquisto in corso" è caduto');
    // già shiny: niente addebito
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 }), { ok: false, motivo: 'already' });
    assert.equal(saldo(db, 'u1'), 250 - C.PREZZI.shinyPokemon);
    // il secondo Pokémon è un altro acquisto
    assert.equal((await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 1 })).ok, true);
    assert.deepEqual(db.albero.players.didi.teams.T1.pokemon.map(p => p.shiny), [true, true]);
});

test('shinyPokemon: senza monete o con dati che non tornano non si addebita niente e non si scrive niente', async () => {
    const povero = dbSquadre({ wallet: { u1: { saldo: C.PREZZI.shinyPokemon - 1 } } });
    assert.deepEqual(await M.shinyPokemon({ db: povero, uid: 'u1', team: 'T1', indice: 0 }), { ok: false, motivo: 'poor' });
    assert.equal(povero.albero.players.didi.teams.T1.pokemon[0].shiny, false);
    assert.doesNotMatch(povero.albero.players.didi.teams.T1.testoShowdown, /Shiny/);
    assert.equal(saldo(povero, 'u1'), C.PREZZI.shinyPokemon - 1);

    const db = dbSquadre();
    for (const [team, indice] of [['T404', 0], ['T1', 5], ['T1', -1], ['T1', 'x'], ['../x', 0], ['', 0]]) assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team, indice }), { ok: false, motivo: 'unknown' }, `${team}/${indice}`);
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'senza-profilo', team: 'T1', indice: 0 }), { ok: false, motivo: 'no-profile' });
    // il testo non ha il Pokémon: non si saprebbe come renderlo shiny in battaglia, quindi non si vende
    db.albero.players.didi.teams.T1.testoShowdown = 'Incineroar @ Safety Goggles\nAbility: Intimidate\n- Fake Out';
    assert.deepEqual(await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 }), { ok: false, motivo: 'cannot-apply' });
    assert.equal(saldo(db, 'u1'), 250);
    assert.equal(movimenti(db, 'u1').length, 0);
    // un team salvato solo come elenco (senza testo) si aggiorna lo stesso
    delete db.albero.players.didi.teams.T1.testoShowdown;
    assert.equal((await M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 })).ok, true);
    assert.equal(db.albero.players.didi.teams.T1.pokemon[0].shiny, true);
});

test('shinyPokemon: due richieste insieme lo pagano una volta; un segno vecchio non blocca, uno recente sì; se la scrittura fallisce le monete tornano', async () => {
    const db = dbSquadre();
    const [x, y] = await Promise.all([M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 }), M.shinyPokemon({ db, uid: 'u1', team: 'T1', indice: 0 })]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    assert.ok(['busy', 'already'].includes([x, y].find(r => !r.ok).motivo));
    assert.equal(saldo(db, 'u1'), 250 - C.PREZZI.shinyPokemon, 'addebitato una volta');

    const adesso = Date.UTC(2026, 10, 3, 12);
    const lock = 'walletEventi/lock-shiny-didi-T1-0';
    const fresco = dbSquadre({ walletEventi: { 'lock-shiny-didi-T1-0': adesso - 5000 } });
    assert.deepEqual(await M.shinyPokemon({ db: fresco, uid: 'u1', team: 'T1', indice: 0, adesso }), { ok: false, motivo: 'busy' });
    assert.equal(saldo(fresco, 'u1'), 250);
    const vecchio = dbSquadre({ walletEventi: { 'lock-shiny-didi-T1-0': adesso - 120000 } });
    assert.equal((await M.shinyPokemon({ db: vecchio, uid: 'u1', team: 'T1', indice: 0, adesso })).ok, true, 'il segno di più di un minuto fa è scaduto');

    const rotto = dbSquadre();
    const ref = rotto.ref;
    rotto.ref = (p = '') => { const r = ref(p); if (p === '') r.update = async () => { throw new Error('scrittura fallita'); }; return r; };
    await assert.rejects(M.shinyPokemon({ db: rotto, uid: 'u1', team: 'T1', indice: 0 }), /scrittura fallita/);
    assert.equal(saldo(rotto, 'u1'), 250, 'le monete tornano');
    assert.deepEqual(movimenti(rotto, 'u1').map(m => m.importo), [-C.PREZZI.shinyPokemon, C.PREZZI.shinyPokemon]);
    assert.equal(rotto.albero.players.didi.teams.T1.pokemon[0].shiny, false);
    assert.equal(Object.keys(rotto.albero.walletEventi || {}).length, 0, 'e il segno cade');
});

test('calibrazione: con i set di Sant\'Alvise I si fanno 550–1000 monete a stagione (media ~780); i prezzi sono una frazione di quella stagione tipo', () => {
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
    // i prezzi: l'avatar è il 4–6% di una stagione, la canzone il 6–9%, lo shiny di un team il 10–15%; il catalogo fisso si completa in circa due stagioni
    const P = C.PREZZI;
    assert.ok(P.avatar <= media * 0.06 && P.avatar >= media * 0.03, `avatar ${P.avatar}`);
    assert.ok(P.canzone <= media * 0.09 && P.canzone >= media * 0.05, `canzone ${P.canzone}`);
    assert.ok(P.shinyPokemon <= media * 0.15 && P.shinyPokemon >= media * 0.1, `shiny ${P.shinyPokemon}`);
    const fisso = C.CATALOGO.reduce((t, c) => t + c.prezzo, 0);
    assert.ok(fisso >= media * 1.5 && fisso <= media * 3, `catalogo fisso ${fisso}`);
    assert.ok(Math.min(...C.CATALOGO.map(c => c.prezzo)) >= media * 0.1, 'la cosa più economica del catalogo fisso non si compra in una serata');
    assert.ok(Math.max(...C.CATALOGO.map(c => c.prezzo)) <= media * 0.5, 'e la più cara si raggiunge in una stagione');
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
