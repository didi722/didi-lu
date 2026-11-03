// =====================================================
// MONETE — Poké-Tournament (server)
//
// Il saldo di ognuno sta in wallet/{uid}: { saldo, posseduti: { <idCosmetico>: t }, movimenti: { <push>: { t, importo, motivo } }, giorno: { <AAAA-MM-GG>: { amichevoli } } }.
// Solo il server lo scrive (i client lo leggono se è il proprio: regole del database): così nessuno si dà monete a mano.
//
// Come si guadagnano (PREMI):
//   - ogni set giocato: 4 monete, +6 se lo si vince; nei set di stagione (ufficiali) il doppio;
//   - nelle amichevoli lo stesso, ma al massimo 40 monete al giorno in tutto (così non si fanno monete giocando sempre con lo stesso amico);
//   - un badge nuovo: 25 (bronzo), 50 (argento), 100 (oro); salendo di livello si prende quello dei livelli saltati;
//   - una stagione vinta: 300; un MVP della stagione (il Pokémon di un allenatore): 100.
// Ogni premio ha una chiave: lo stesso fatto (un set, un badge, una stagione) paga una volta sola (walletEventi/{chiave}).
// Non si guadagna contro la CPU (nessun controllo possibile da qui).
//
//   premioSet({ ufficiale, vinto }), premioBadge(prima, dopo)           pure
//   accredita(db, uid, importo, motivo, { chiave, tettoGiorno, adesso }) → monete date davvero (0 se già dato o oltre il tetto)
//   spendi(db, uid, importo, motivo, { adesso })                         → true / false (saldo insufficiente)
//   premiaSet / acquista / equipa                                        le operazioni usate da index.js
// =====================================================
'use strict';
const Cosmetici = require('./cosmetici.js');

const PREMI = { setGiocato: 4, setVinto: 6, moltiplicatoreUfficiale: 2, tettoAmichevoliGiorno: 40, badge: [0, 25, 50, 100], stagioneVinta: 300, mvp: 100 };
const MAX_MOVIMENTI = 30;

const sicura = t => String(t == null ? '' : t).replace(/[.#$/[\]]/g, '_').slice(0, 120);
const giornoDi = adesso => new Date(adesso).toISOString().slice(0, 10);

const premioSet = ({ ufficiale, vinto }) => (PREMI.setGiocato + (vinto ? PREMI.setVinto : 0)) * (ufficiale ? PREMI.moltiplicatoreUfficiale : 1);
const premioBadge = (prima, dopo) => { let t = 0; for (let l = Math.max(0, prima) + 1; l <= Math.min(3, dopo); l++) t += PREMI.badge[l]; return t; };

async function scriviMovimento(db, uid, importo, motivo, adesso) {
    const rif = db.ref(`wallet/${uid}/movimenti`);
    await rif.push().set({ t: adesso, importo, motivo: String(motivo).slice(0, 60) });
    // si tengono gli ultimi MAX_MOVIMENTI
    const tutti = (await rif.once('value')).val() || {};
    const chiavi = Object.keys(tutti).sort();
    for (const k of chiavi.slice(0, Math.max(0, chiavi.length - MAX_MOVIMENTI))) await rif.child(k).remove();
}

/** Dà monete a uno. `chiave`: lo stesso fatto non paga due volte. `tettoGiorno`: al massimo quante monete di questo tipo al giorno (amichevoli). Ritorna quante ne ha date. */
async function accredita(db, uid, importo, motivo, { chiave = '', tettoGiorno = 0, adesso = Date.now() } = {}) {
    if (!uid || !(importo > 0)) return 0;
    if (chiave) {
        const nuovo = await db.ref(`walletEventi/${sicura(chiave)}`).transaction(v => (v ? undefined : adesso));
        if (!nuovo.committed) return 0;
    }
    let da = importo;
    if (tettoGiorno > 0) {
        let dato = 0;
        await db.ref(`wallet/${uid}/giorno/${giornoDi(adesso)}/amichevoli`).transaction(v => {
            const usato = Number(v) || 0;
            dato = Math.max(0, Math.min(importo, tettoGiorno - usato));
            return dato ? usato + dato : usato;
        });
        da = dato;
    }
    if (!(da > 0)) return 0;
    await db.ref(`wallet/${uid}/saldo`).transaction(v => (Number(v) || 0) + da);
    await scriviMovimento(db, uid, da, motivo, adesso);
    return da;
}

/** Toglie monete se ci sono (il saldo non scende sotto zero) */
async function spendi(db, uid, importo, motivo, { adesso = Date.now() } = {}) {
    if (!uid || !(importo > 0)) return false;
    const esito = await db.ref(`wallet/${uid}/saldo`).transaction(v => ((Number(v) || 0) >= importo ? (Number(v) || 0) - importo : undefined));
    if (!esito.committed) return false;
    await scriviMovimento(db, uid, -importo, motivo, adesso);
    return true;
}

/** I due giocatori di un set: chi ha giocato prende il suo premio. `uids` = { p1, p2 }; `vincitore` = 'p1' | 'p2' | '' */
async function premiaSet({ db, uids, vincitore, ufficiale, id, set, adesso = Date.now() }) {
    const dati = {};
    for (const lato of ['p1', 'p2']) {
        if (!uids[lato]) continue;
        const importo = premioSet({ ufficiale: !!ufficiale, vinto: vincitore === lato });
        dati[lato] = await accredita(db, uids[lato], importo, `${ufficiale ? 'Season' : 'Friendly'} set ${vincitore === lato ? 'won' : 'played'}`,
            { chiave: `set-${id}-${set}-${lato}`, tettoGiorno: ufficiale ? 0 : PREMI.tettoAmichevoliGiorno, adesso });
    }
    return dati;
}

/** Un badge nuovo o salito di livello (1 bronzo, 2 argento, 3 oro): chiave stabile, quindi paga una volta */
async function premiaBadge({ db, uid, chiave, prima, dopo, nome, adesso = Date.now() }) {
    const importo = premioBadge(prima, dopo);
    return accredita(db, uid, importo, `Badge: ${nome || 'new badge'}`, { chiave: `badge-${chiave}-${dopo}`, adesso });
}

const uidDi = async (db, nome) => {
    const utenti = (await db.ref('users').once('value')).val() || {};
    const id = String(nome || '').toLowerCase().trim();
    return Object.keys(utenti).find(u => String(utenti[u] && utenti[u].name || '').toLowerCase().trim() === id) || '';
};

/** Compra un cosmetico: deve esistere, non essere già suo (o in uso) e il saldo bastare */
async function acquista({ db, uid, id, adesso = Date.now() }) {
    const c = Cosmetici.perId(id);
    if (!c) return { ok: false, motivo: 'unknown' };
    const wallet = (await db.ref(`wallet/${uid}`).once('value')).val() || {};
    if ((wallet.posseduti || {})[id]) return { ok: false, motivo: 'owned' };
    if (!(await spendi(db, uid, c.prezzo, `Bought: ${c.nome}`, { adesso }))) return { ok: false, motivo: 'poor' };
    await db.ref(`wallet/${uid}/posseduti/${id}`).set(adesso);
    const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
    return { ok: true, saldo };
}

/** Mette (o toglie) un cosmetico: shiny e aure si scrivono nel profilo pubblico; i motivi dello sfondo li sceglie l'editor della pagina */
async function equipa({ db, uid, id, attivo }) {
    const c = Cosmetici.perId(id);
    if (!c || !c.campo) return { ok: false, motivo: 'unknown' };
    const wallet = (await db.ref(`wallet/${uid}`).once('value')).val() || {};
    if (attivo && !(wallet.posseduti || {})[id]) return { ok: false, motivo: 'not-owned' };
    const nome = (await db.ref(`users/${uid}/name`).once('value')).val();
    const giocatore = String(nome || '').toLowerCase().trim();
    if (!giocatore) return { ok: false, motivo: 'no-profile' };
    const percorso = `players/${giocatore}/info/${c.campo}`;
    await db.ref(percorso).set(c.tipo === 'shiny' ? (attivo ? true : null) : (attivo ? id : null));
    return { ok: true };
}

module.exports = { PREMI, MAX_MOVIMENTI, premioSet, premioBadge, accredita, spendi, premiaSet, premiaBadge, acquista, equipa, uidDi, giornoDi };
