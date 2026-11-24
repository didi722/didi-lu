// =====================================================
// SFIDE ALLE PALESTRE — Poké-Tournament (server)
//
// Il simulatore contro la CPU gira nel browser: da qui non si può controllare com'è andata davvero. Il browser riferisce l'inizio di ogni tappa ("inizia") e la sua fine ("fine",
// vinta o persa); il server tiene il conto di dove è arrivato chi sfida, scrive le statistiche della palestra e dà il premio in monete. Per non regalare monete a chi chiama la
// Function a mano (tutto quello che segue limita il danno, non lo azzera: il tetto vero è la settimana):
//   - "fine" vale solo se prima c'è stato "inizia" per quella stessa tappa e se è passato almeno PalestraStat.MIN_TAPPA_MS; un "fine" vale una volta sola;
//   - una sfida comincia dalla prima tappa: se si trova già avviata (la seconda tappa senza aver visto la prima, un altro browser, dati cancellati) si conta nelle statistiche
//     ma non dà monete;
//   - il premio (PREMI.palestra) si prende una volta a settimana per ogni palestra (di ogni giocatore): più palestre espugnate, più premi; ed è per chi espugna la palestra di un altro;
//   - la propria palestra non si sfida, e una palestra senza le sue tre tappe nemmeno.
//
// Dati:
//   palestraSfide/<uid>/<palestra> = { vinte, inizio, ok }   privato, lo scrive solo il server: tappe vinte, quando è partita l'ultima tappa (0 se è già stata chiusa) e se la
//                                                            sfida è cominciata dalla prima sotto gli occhi del server (ok: può dare il premio)
//   players/<palestra>/palestraStat                          le statistiche (palestra-stat.js): le leggono tutti
//   wallet/<uid>/premiPalestra/<palestra> = { settimana, t } l'ultimo premio preso per quella palestra: il sito lo legge per dire "già preso questa settimana"
//                                                            (wallet/<uid>/premioPalestra = { settimana, gym, t }, il vecchio premio unico, il sito lo legge ancora per la sua palestra)
//   walletEventi/palestra-<settimana>-<uid>-<palestra>       il segno che il premio di quella palestra in quella settimana è stato dato (una volta sola, anche con due richieste insieme)
//
//   inizia({ db, uid, gym, tappa })          → { ok, verificata } | { ok: false, motivo }
//   fine({ db, uid, gym, tappa, vinta })     → { ok, esito: 'tenuta' | 'tappa' | 'espugnata', premio, motivoPremio ('' | 'already' | 'unverified'), settimana } | { ok: false, motivo }
//   sfida({ db, uid, dati })                 smista sulla chiave `azione` ('inizia' | 'fine'): è quello che chiama la Function palestraSfida (index.js)
// =====================================================
'use strict';
const Monete = require('./monete.js');
const Cosmetici = require('./cosmetici.js');
const Stat = require('./palestra-stat.js');

const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
const idValido = id => !!id && !/[.#$/[\]]/.test(id);
const rifiuto = motivo => ({ ok: false, motivo });

/** Controlli comuni: chi chiama è un giocatore, la palestra esiste, non è la sua e la tappa è una delle tre. Ritorna { io, id, t } oppure { errore } */
async function controlla({ db, uid, gym, tappa }) {
    const id = idDi(gym);
    const t = typeof tappa === 'number' ? tappa : NaN;       // un numero vero: Number(null) o Number('') darebbero 0
    if (!uid || !idValido(id) || !Number.isInteger(t) || t < 0 || t >= Stat.TAPPE) return { errore: rifiuto('bad-request') };
    const io = await Monete.giocatoreDi(db, uid);
    if (!io) return { errore: rifiuto('no-player') };
    if (io === id) return { errore: rifiuto('own-gym') };
    const config = (await db.ref(`players/${id}/info/palestra`).once('value')).val();
    if (!Stat.tappeComplete(config)) return { errore: rifiuto('no-gym') };
    return { io, id, t };
}

/** Comincia una tappa: dalla prima parte una sfida nuova; dalle altre si continua se il server ha visto la precedente, altrimenti si conta lo stesso ma senza premio */
async function inizia({ db, uid, gym, tappa, adesso = Date.now() }) {
    const c = await controlla({ db, uid, gym, tappa });
    if (c.errore) return c.errore;
    const rif = db.ref(`palestraSfide/${uid}/${c.id}`);
    const prima = (await rif.once('value')).val();
    const ok = c.t === 0 || !!(prima && prima.ok && Number(prima.vinte) === c.t);
    await rif.set({ vinte: c.t, inizio: adesso, ok });
    return { ok: true, verificata: ok };
}

/** Finisce una tappa: statistiche della palestra, avanzamento di chi sfida e, alla terza vinta, il premio della settimana */
async function fine({ db, uid, gym, tappa, vinta, adesso = Date.now() }) {
    const c = await controlla({ db, uid, gym, tappa });
    if (c.errore) return c.errore;
    const rif = db.ref(`palestraSfide/${uid}/${c.id}`);
    // si "prende" la tappa con una transazione (inizio → 0): due richieste insieme non la contano due volte. Sul null della prima esecuzione si lascia com'è: il server la rifà con il valore vero.
    let preso = null, motivo = '';
    await rif.transaction(cur => {
        preso = null; motivo = '';
        if (cur == null) { motivo = 'not-started'; return cur; }
        if (Number(cur.vinte) !== c.t || !(Number(cur.inizio) > 0)) { motivo = 'not-started'; return undefined; }
        if (adesso - Number(cur.inizio) < Stat.MIN_TAPPA_MS) { motivo = 'too-fast'; return undefined; }
        preso = cur;
        return { ...cur, inizio: 0 };
    });
    if (!preso) return rifiuto(motivo || 'not-started');

    const [nomeIo, nomeGym] = await Promise.all([
        db.ref(`players/${c.io}/info/name`).once('value').then(x => String(x.val() || c.io)),
        db.ref(`players/${c.id}/info/name`).once('value').then(x => String(x.val() || c.id))
    ]);
    const evento = { chi: c.io, nome: nomeIo, tappa: c.t, vinta: !!vinta, t: adesso };
    await db.ref(`players/${c.id}/palestraStat`).transaction(cur => Stat.registra(cur, evento));

    if (!vinta) {
        await rif.remove();
        return { ok: true, esito: 'tenuta' };
    }
    if (c.t < Stat.TAPPE - 1) {
        await rif.set({ vinte: c.t + 1, inizio: 0, ok: !!preso.ok });
        return { ok: true, esito: 'tappa', vinte: c.t + 1 };
    }
    // la terza tappa: la palestra è espugnata. Il premio è di una volta a settimana per ogni palestra (la chiave dice di chi, di quale palestra e di quale settimana: due richieste insieme non lo pagano due volte)
    await rif.remove();
    const settimana = Stat.settimanaDi(adesso);
    let premio = 0, motivoPremio = '';
    if (!preso.ok) {
        motivoPremio = 'unverified';
    } else {
        premio = await Monete.accredita(db, uid, Cosmetici.PREMI.palestra, `Gym conquered: ${nomeGym}`, { chiave: `palestra-${settimana}-${uid}-${c.id}`, adesso });
        if (premio > 0) await db.ref(`wallet/${uid}/premiPalestra/${c.id}`).set({ settimana, t: adesso });
        else motivoPremio = 'already';
    }
    return { ok: true, esito: 'espugnata', premio, motivoPremio, settimana };
}

/** Quello che chiama la Function: { azione: 'inizia' | 'fine', gym, tappa, vinta } */
async function sfida({ db, uid, dati, adesso = Date.now() }) {
    const d = dati || {};
    const base = { db, uid, gym: d.gym, tappa: d.tappa, adesso };
    if (d.azione === 'inizia') return inizia(base);
    if (d.azione === 'fine') return fine({ ...base, vinta: d.vinta === true });
    return rifiuto('bad-request');
}

module.exports = { inizia, fine, sfida };
