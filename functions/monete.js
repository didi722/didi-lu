// =====================================================
// MONETE — Poké-Tournament (server)
//
// Il saldo di ognuno sta in wallet/{uid}: { saldo, posseduti: { <idCosmetico>: t }, casa: { avatar, canzone }, movimenti: { <push>: { t, importo, motivo } }, giorno: { <AAAA-MM-GG>: { amichevoli } } }.
// Solo il server lo scrive (i client lo leggono se è il proprio: regole del database): così nessuno si dà monete a mano.
//
// Come si guadagnano (PREMI, in cosmetici.js: sono calibrati con i prezzi sulla stagione tipo, vedi stimaStagione):
//   - ogni set giocato: in stagione 5 monete, +6 se lo si vince; nelle amichevoli 2, +3 (al massimo 10 al giorno in tutto: così non si fanno monete giocando sempre con lo stesso amico);
//   - un badge nuovo: 25 (bronzo), 50 (argento), 100 (oro); salendo di livello si prende quello dei livelli saltati;
//   - una stagione vinta: 300; un MVP della stagione (il Pokémon di un allenatore): 100.
// Ogni premio ha una chiave: lo stesso fatto (un set, un badge, una stagione) paga una volta sola (walletEventi/{chiave}).
// Non si guadagna contro la CPU (nessun controllo possibile da qui).
//
// Come si spendono: i cosmetici del catalogo; avatar, colori e canzoni (unici, comprati: al massimo LIMITI per tipo, si rilascia gratis per prenderne un altro; il primo è gratis per chi ha
// ancora quello di partenza); lo shiny di un Pokémon di un team (il prezzo dipende dalla specie: Cosmetici.prezzoShiny).
//
//   premioSet({ ufficiale, vinto }), premioBadge(prima, dopo)           pure
//   accredita(db, uid, importo, motivo, { chiave, tettoGiorno, adesso }) → monete date davvero (0 se già dato o oltre il tetto)
//   spendi(db, uid, importo, motivo, { adesso })                         → true / false (saldo insufficiente)
//   premiaSet / acquista (prendi) / rilascia / equipa / cambia / shinyPokemon   le operazioni usate da index.js
//   testoConShiny(testo, indice, nome)                                   pure: il testo Showdown di un team con "Shiny: Yes" nel Pokémon indicato
// =====================================================
'use strict';
const Cosmetici = require('./cosmetici.js');

const { PREMI, PREZZI } = Cosmetici;
const MAX_MOVIMENTI = 30;

const sicura = t => String(t == null ? '' : t).replace(/[.#$/[\]]/g, '_').slice(0, 120);
const giornoDi = adesso => new Date(adesso).toISOString().slice(0, 10);

const premioSet = ({ ufficiale, vinto }) => { const t = ufficiale ? PREMI.set.ufficiale : PREMI.set.amichevole; return t.giocato + (vinto ? t.vinto : 0); };
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
    // La prima volta la transazione parte con v = null (il valore vero ancora non è arrivato): abortire lì sarebbe "monete insufficienti" a torto.
    // Su null si restituisce null (nessun cambiamento): il server vede che non combacia e la riesegue con il saldo vero. `tolto` dice se l'ultima esecuzione ha pagato.
    let tolto = false;
    const esito = await db.ref(`wallet/${uid}/saldo`).transaction(v => {
        tolto = false;
        if (v == null) return v;
        const n = Number(v) || 0;
        if (n < importo) return undefined;
        tolto = true;
        return n - importo;
    });
    if (!esito.committed || !tolto) return false;
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

/** L'id del giocatore (il suo nome in minuscolo) di un account */
const giocatoreDi = async (db, uid) => String((await db.ref(`users/${uid}/name`).once('value')).val() || '').toLowerCase().trim();

/** Un'operazione alla volta per chi la fa (due richieste insieme non la pagano due volte); il segno cade dopo un minuto se qualcosa si pianta */
async function conLock(db, nome, adesso, fn) {
    const segno = db.ref(`walletEventi/lock-${sicura(nome)}`);
    const preso = await segno.transaction(v => (v && adesso - Number(v) < 60000 ? undefined : adesso));
    if (!preso.committed) return { ok: false, motivo: 'busy' };
    try { return await fn(); } finally { await segno.remove(); }
}

/** Il compagno viene dal Box? (info.pkmBox = "idTeam|posizione", e quel Pokémon c'è ancora ed è il compagno): si legge solo quel team */
async function compagnoDalBox(db, giocatore, info) {
    const idTeam = String((info && info.pkmBox) || '').split('|')[0];
    if (!giocatore || !/^[A-Za-z0-9_-]{1,60}$/.test(idTeam)) return null;
    const team = (await db.ref(`players/${giocatore}/teams/${idTeam}`).once('value')).val();
    return team ? Cosmetici.compagnoDelBox(info, [{ id: idTeam, ...team }]) : null;
}

/** Compra un cosmetico del catalogo (compagno shiny, aure, effetti del nome e del palco, motivi dello sfondo; avatar, colori e canzoni passano da prendi): deve esistere, non essere già suo (o in uso), essere in vendita (le edizioni limitate solo finché la loro
 *  stagione non è chiusa: motivo 'not-yet' o 'ended') e il saldo bastare.
 *  Prima lo si "prenota" con una transazione (due richieste insieme non possono pagarlo due volte), poi si paga; se il saldo non basta la prenotazione torna indietro. */
async function acquista({ db, uid, id, url, nome, rilascia: daRilasciare = '', adesso = Date.now() }) {
    const c = Cosmetici.perId(id);
    if (!c) return { ok: false, motivo: 'unknown' };
    if (Cosmetici.FAMIGLIE.includes(c.tipo)) return prendi({ db, uid, id, url, nome, rilascia: daRilasciare, adesso });       // avatar, colori e canzoni: unici, con il massimo per tipo
    const giocatore = await giocatoreDi(db, uid);
    const [wallet, info] = await Promise.all([
        db.ref(`wallet/${uid}`).once('value').then(x => x.val() || {}),
        giocatore ? db.ref(`players/${giocatore}/info`).once('value').then(x => x.val() || {}) : Promise.resolve({})
    ]);
    if (Cosmetici.possiede(id, { wallet, info, pagina: info.pagina })) return { ok: false, motivo: 'owned' };
    // il compagno shiny vale solo per un compagno generico: uno scelto dal Box è shiny come quel Pokémon
    if (c.tipo === 'shiny' && await compagnoDalBox(db, giocatore, info)) return { ok: false, motivo: 'box-companion' };
    // un'edizione limitata si compra solo finché la sua stagione non è chiusa (la decide il server, non la pagina)
    if (c.edizione) {
        const stato = (await db.ref(`seasons/${c.edizione.stagione}/info/status`).once('value')).val();
        const d = Cosmetici.disponibilita(c, { [c.edizione.stagione]: stato });
        if (d !== 'si') return { ok: false, motivo: d === 'presto' ? 'not-yet' : 'ended' };
    }
    const mio = db.ref(`wallet/${uid}/posseduti/${id}`);
    const preso = await mio.transaction(v => (v ? undefined : adesso));
    if (!preso.committed) return { ok: false, motivo: 'owned' };
    let fatto = false;
    try {
        fatto = await spendi(db, uid, c.prezzo, `Bought: ${c.nome}`, { adesso });
    } finally {
        if (!fatto) await mio.transaction(v => (v === adesso ? null : v));
    }
    if (!fatto) return { ok: false, motivo: 'poor' };
    const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
    return { ok: true, saldo };
}

// ---------------------------------------------------------------- avatar, colore e canzone: si comprano, sono unici, ognuno ne ha al massimo LIMITI
// Avatar, colore firma e canzone sono unici, com'è sempre stato: nessun altro può avere quello che hai. Ora si COMPRANO e si hanno (wallet.posseduti), fino a un massimo per tipo (LIMITI, in
// cosmetici.js): così uno non se ne prende un sacco lasciando gli altri senza. A quota piena, per prenderne un altro se ne rilascia uno (gratis): torna libero per tutti. Il primo avatar,
// il primo colore e la prima canzone sono gratis per chi ha ancora quello di partenza; chi ne aveva già uno lo ha già (conta come il primo: quello che porta, o il "di casa" delle versioni
// precedenti, wallet/{uid}/casa, che qui si trasforma in un posseduto). Si indossa solo quello che si ha, e indossarlo non costa.
//   prendi     compra un avatar, un colore o una canzone (e lo indossa); a quota piena serve `rilascia`: cosa lasciare
//   rilascia   lascia andare uno di quelli che si hanno (gratis); non quello che si indossa
//   cambia     indossa uno di quelli che si hanno (gratis), o toglie la canzone
// cosmeticiPresi/<id> = l'id dell'allenatore che lo ha: lo legge chiunque (per mostrare "già preso" nell'editor e nello Shop), lo scrive solo il server.
// Il colore firma è uno dei COLORI_FIRMA (cosmetici.js), scritto in players/{id}/info/color.
const ESCLUSIVI = Cosmetici.FAMIGLIE;          // avatar, colore, canzone
// il sito dove stanno le immagini degli avatar (come li salva l'editor della pagina); il server compone l'indirizzo da sé, senza fidarsi di quello che arriva
const SITO_AVATAR = process.env.SITO_AVATAR_URL || 'https://didi722.github.io/didi-lu/';
const indirizzoAvatar = id => `${SITO_AVATAR}immagini/profile/${String(id).replace('avatar-', '')}.png`;

/** Chi, tra gli altri, porta adesso questo avatar o questa canzone? Ritorna l'id dell'allenatore, o '' (serve per chi li aveva già prima che esistesse il registro) */
function chiUsa(giocatori, io, c) {
    for (const [g, v] of Object.entries(giocatori && typeof giocatori === 'object' ? giocatori : {})) {
        if (g === io) continue;
        const i = v && v.info;
        if (i && Cosmetici.idCorrente(c.tipo, i) === c.id) return g;
    }
    return '';
}

/** Riserva un id per un allenatore (transazione: se due lo chiedono insieme vince il primo). { ok } se era libero o già suo; { nuovo } se l'ha scritto adesso (per toglierlo se l'operazione non riesce) */
async function riserva(db, id, giocatore) {
    let prima;
    const r = await db.ref(`cosmeticiPresi/${id}`).transaction(v => { prima = v; return !v || v === giocatore ? giocatore : undefined; });
    return { ok: !!r.committed, nuovo: !!r.committed && !prima };
}
/** Rimette libero un id, ma solo se lo teneva questo allenatore */
const libera = (db, id, giocatore) => db.ref(`cosmeticiPresi/${id}`).transaction(v => (v === giocatore ? null : v));

/** Cosa si sta chiedendo, controllato: { c, tipo, indirizzo, titolo } oppure null. Per una canzone servono `url` e `nome` e l'id deve essere quello dell'indirizzo; il server compone da sé l'indirizzo degli avatar */
function descrivi(id, url, nome) {
    const c = Cosmetici.perId(id);
    if (!c || !ESCLUSIVI.includes(c.tipo)) return null;
    if (c.tipo === 'avatar') return { c, tipo: 'avatar', indirizzo: indirizzoAvatar(id), titolo: c.nome };
    if (c.tipo === 'colore') return { c, tipo: 'colore', indirizzo: Cosmetici.coloreDaId(id), titolo: c.nome };
    const indirizzo = String(url || '').trim();
    if (!/^https?:\/\/\S{4,500}$/i.test(indirizzo) || Cosmetici.idCanzone(indirizzo) !== id) return null;
    return { c, tipo: 'canzone', indirizzo, titolo: String(nome || 'Song').replace(/[\r\n]+/g, ' ').trim().slice(0, 60) || 'Song' };
}
const campiDi = (tipo, d) => (tipo === 'avatar' ? { avatar: d.indirizzo } : tipo === 'colore' ? { color: d.indirizzo } : { musicaPreferita: d.indirizzo, musicName: d.titolo });
const etichetta = tipo => (tipo === 'canzone' ? 'Song' : tipo === 'colore' ? 'Colour' : 'Avatar');

/**
 * Quello che un allenatore ha già ma non è ancora scritto come suo (l'avatar che portava prima del negozio, il "di casa" delle versioni precedenti): lo riserva e prepara le scritture che lo
 * mettono tra i suoi posseduti (e tolgono "casa"). `escludi`: un id che sta per essere rilasciato. → { <percorso>: valore } da unire alle altre scritture.
 */
async function fissa(db, uid, giocatore, tipo, wallet, info, adesso, escludi = '') {
    const scritture = {}, gia = wallet.posseduti || {}, corrente = Cosmetici.idCorrente(tipo, info);
    for (const x of Cosmetici.possedutiDiTipo(tipo, { wallet, info })) {
        if (x === escludi) continue;
        await riserva(db, x, giocatore);
        if (!gia[x]) scritture[`wallet/${uid}/posseduti/${x}`] = tipo === 'canzone' && x === corrente ? { t: adesso, url: String(info.musicaPreferita || ''), nome: String(info.musicName || 'Song') } : adesso;
    }
    if ((wallet.casa || {})[tipo]) scritture[`wallet/${uid}/casa/${tipo}`] = null;
    return scritture;
}

const leggiTutto = (db, uid, giocatore, id, conTutti = true) => Promise.all([
    db.ref(`wallet/${uid}`).once('value').then(x => x.val() || {}),
    db.ref(`players/${giocatore}/info`).once('value').then(x => x.val() || {}),
    conTutti ? db.ref('players').once('value').then(x => x.val() || {}) : Promise.resolve({}),
    id ? db.ref(`cosmeticiPresi/${id}`).once('value').then(x => x.val() || '') : Promise.resolve('')
]);

/**
 * Compra un avatar, un colore o una canzone (`id`: avatar-<n>, colore-<rrggbb>, canzone-<impronta>; per una canzone anche `url` e `nome`) e lo indossa. Il primo di ogni tipo è gratis per chi ha
 * ancora quello di partenza. A quota piena (Cosmetici.LIMITI) serve `rilascia`: uno di quelli che si hanno, che si lascia (gratis) e torna libero per tutti.
 * → { ok, saldo, gratis, rilasciato?, avatar | color | musicaPreferita + musicName } oppure { ok: false, motivo }: unknown, no-profile, owned, taken (di un altro o lo porta un altro), limit (con
 * `possedute` e `limite`: scegliere cosa rilasciare), not-owned (quello da rilasciare non è suo), poor, busy.
 */
async function prendi({ db, uid, id, url, nome, rilascia: daRilasciare = '', adesso = Date.now() }) {
    const d = descrivi(id, url, nome);
    if (!d) return { ok: false, motivo: 'unknown' };
    const { tipo } = d;
    const giocatore = await giocatoreDi(db, uid);
    if (!giocatore) return { ok: false, motivo: 'no-profile' };
    return conLock(db, `collezione-${tipo}-${giocatore}`, adesso, async () => {
        const [wallet, info, giocatori, titolare] = await leggiTutto(db, uid, giocatore, id);
        const contesto = { wallet, info };
        const possedute = Cosmetici.possedutiDiTipo(tipo, contesto);
        if (possedute.includes(id)) return { ok: false, motivo: 'owned' };
        // è di un altro (lo ha comprato) o lo porta un altro (anche se ancora non risulta nel registro): non si prende, e non si addebita niente
        if ((titolare && titolare !== giocatore) || chiUsa(giocatori, giocatore, d.c)) return { ok: false, motivo: 'taken' };
        const limite = Cosmetici.LIMITI[tipo];
        if (daRilasciare && !possedute.includes(daRilasciare)) return { ok: false, motivo: 'not-owned' };
        if (possedute.length >= limite && !daRilasciare) return { ok: false, motivo: 'limit', possedute, limite };

        const { prezzo, gratis } = Cosmetici.prezzoAcquisto(tipo, contesto);
        const riservato = await riserva(db, id, giocatore);
        if (!riservato.ok) return { ok: false, motivo: 'taken' };
        let pagato = false;
        try {
            if (prezzo > 0) {
                if (!(await spendi(db, uid, prezzo, `${etichetta(tipo)}: ${d.titolo}`, { adesso }))) {
                    if (riservato.nuovo) await libera(db, id, giocatore);
                    return { ok: false, motivo: 'poor' };
                }
                pagato = true;
            } else await scriviMovimento(db, uid, 0, `Free: ${d.titolo}`, adesso);
            const scritture = await fissa(db, uid, giocatore, tipo, wallet, info, adesso, daRilasciare);
            scritture[`wallet/${uid}/posseduti/${id}`] = tipo === 'canzone' ? { t: adesso, url: d.indirizzo, nome: d.titolo } : adesso;
            if (daRilasciare) scritture[`wallet/${uid}/posseduti/${daRilasciare}`] = null;
            for (const [k, v] of Object.entries(campiDi(tipo, d))) scritture[`players/${giocatore}/info/${k}`] = v;
            await db.ref().update(scritture);
        } catch (e) {
            if (pagato) {
                await db.ref(`wallet/${uid}/saldo`).transaction(v => (Number(v) || 0) + prezzo);
                await scriviMovimento(db, uid, prezzo, `Refund: ${d.titolo}`, adesso);
            }
            if (riservato.nuovo) await libera(db, id, giocatore);
            throw e;
        }
        if (daRilasciare) await libera(db, daRilasciare, giocatore);
        const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
        const esito = { ok: true, saldo, gratis };
        if (daRilasciare) esito.rilasciato = daRilasciare;
        return Object.assign(esito, campiDi(tipo, d));
    });
}

/** Lascia andare uno di quelli che si hanno (gratis): torna libero per tutti. Non quello che si indossa (prima se ne indossa un altro, o si toglie la canzone). → { ok, rilasciato } oppure { ok: false, motivo }: unknown, no-profile, not-owned, worn, busy */
async function rilascia({ db, uid, id, adesso = Date.now() }) {
    const c = Cosmetici.perId(id);
    if (!c || !ESCLUSIVI.includes(c.tipo)) return { ok: false, motivo: 'unknown' };
    const tipo = c.tipo;
    const giocatore = await giocatoreDi(db, uid);
    if (!giocatore) return { ok: false, motivo: 'no-profile' };
    return conLock(db, `collezione-${tipo}-${giocatore}`, adesso, async () => {
        const [wallet, info] = await leggiTutto(db, uid, giocatore, '', false);
        if (!Cosmetici.possedutiDiTipo(tipo, { wallet, info }).includes(id)) return { ok: false, motivo: 'not-owned' };
        if (Cosmetici.idCorrente(tipo, info) === id) return { ok: false, motivo: 'worn' };
        const scritture = await fissa(db, uid, giocatore, tipo, wallet, info, adesso, id);
        scritture[`wallet/${uid}/posseduti/${id}`] = null;
        await db.ref().update(scritture);
        await libera(db, id, giocatore);
        await scriviMovimento(db, uid, 0, `Released: ${c.nome}`, adesso);
        return { ok: true, rilasciato: id };
    });
}

/**
 * Indossa uno di quelli che si hanno (gratis); `id` vuoto con tipo 'canzone' toglie la canzone. Per una canzone servono anche `url` e `nome` (l'id deve essere quello dell'indirizzo).
 * → { ok, saldo, avatar | color | musicaPreferita + musicName } oppure { ok: false, motivo }: unknown, no-profile, same (è già quello che porti), not-owned (prima si compra), busy.
 */
async function cambia({ db, uid, tipo, id, url, nome, adesso = Date.now() }) {
    if (!ESCLUSIVI.includes(tipo)) return { ok: false, motivo: 'unknown' };
    const giocatore = await giocatoreDi(db, uid);
    if (!giocatore) return { ok: false, motivo: 'no-profile' };
    const vuota = tipo === 'canzone' && !id;
    let d = null;
    if (!vuota) {
        d = descrivi(id, url, nome);
        if (!d || d.tipo !== tipo) return { ok: false, motivo: 'unknown' };
    }
    return conLock(db, `collezione-${tipo}-${giocatore}`, adesso, async () => {
        const [wallet, info] = await leggiTutto(db, uid, giocatore, '', false);
        if (vuota ? Cosmetici.eDiDefault('canzone', info) : Cosmetici.idCorrente(tipo, info) === id) return { ok: false, motivo: 'same' };
        if (!vuota && !Cosmetici.possedutiDiTipo(tipo, { wallet, info }).includes(id)) return { ok: false, motivo: 'not-owned' };
        // quello che portavi prima del negozio resta tuo anche se ne indossi un altro: lo si scrive ora, prima del cambio
        const scritture = await fissa(db, uid, giocatore, tipo, wallet, info, adesso);
        const campi = vuota ? { musicaPreferita: '', musicName: '' } : campiDi(tipo, d);
        for (const [k, v] of Object.entries(campi)) scritture[`players/${giocatore}/info/${k}`] = v;
        await db.ref().update(scritture);
        const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
        return Object.assign({ ok: true, saldo }, campi);
    });
}

// ---------------------------------------------------------------- lo shiny di un Pokémon di un team
const { idSpecie, testoConShiny } = Cosmetici;
const vociDi = x => (Array.isArray(x) ? x.map((v, k) => [String(k), v]) : Object.entries(x && typeof x === 'object' ? x : {}));

/**
 * Rende shiny il Pokémon numero `indice` di un team del Box. Lo shiny è solo estetico, quindi vale anche per i team bloccati (iscritti a una stagione iniziata): si scrive nel team
 * del Box e nelle iscrizioni alle stagioni non chiuse (dove il team è una copia), compreso il testo Showdown, che è quello che il simulatore legge. La stagione chiusa resta com'era.
 * Il prezzo lo decide il server dalla specie del Pokémon nel team (Cosmetici.prezzoShiny: da comune a leggendario), mai dal client. Si paga solo se tutte le modifiche si possono fare; se la
 * scrittura fallisce le monete tornano. → { ok, saldo, prezzo, fascia } oppure { ok: false, motivo: unknown | no-profile | already | busy | cannot-apply | poor }
 */
async function shinyPokemon({ db, uid, team, indice, adesso = Date.now() }) {
    const giocatore = await giocatoreDi(db, uid);
    if (!giocatore) return { ok: false, motivo: 'no-profile' };
    const idTeam = String(team || ''), i = Number(indice);
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(idTeam) || !Number.isInteger(i) || i < 0 || i > 11) return { ok: false, motivo: 'unknown' };
    const radice = `players/${giocatore}/teams/${idTeam}`;
    const t = (await db.ref(radice).once('value')).val();
    const voci = vociDi(t && t.pokemon);
    if (!t || !voci[i] || !voci[i][1] || !voci[i][1].nome) return { ok: false, motivo: 'unknown' };
    const [chiave, pokemon] = voci[i];
    if (pokemon.shiny) return { ok: false, motivo: 'already' };
    const { prezzo, fascia } = Cosmetici.prezzoShiny(pokemon.nome);
    const specieTeam = voci.map(([, p]) => (p && p.nome) || '');

    // un solo acquisto alla volta per questo Pokémon (due richieste insieme non lo pagano due volte)
    return conLock(db, `shiny-${giocatore}-${idTeam}-${i}`, adesso, async () => {
        // le modifiche si preparano prima di pagare: se il testo non si riesce a toccare non si addebita niente
        const modifiche = { [`${radice}/pokemon/${chiave}/shiny`]: true };
        if (t.testoShowdown && String(t.testoShowdown).trim()) {
            const nuovo = testoConShiny(t.testoShowdown, i, pokemon.nome, specieTeam);
            if (nuovo == null) return { ok: false, motivo: 'cannot-apply' };
            modifiche[`${radice}/testoShowdown`] = nuovo;
        }
        const nomeBox = String(t.nome && typeof t.nome === 'object' ? t.nome.valore : t.nome || '').trim().toLowerCase();
        const stagioni = (await db.ref('seasons').once('value')).val() || {};
        for (const [sid, st] of Object.entries(stagioni)) {
            if (sid === 'sbeta' || !st || String((st.info || {}).status || '').toLowerCase() === 'closed') continue;
            for (const [formato, perGiocatore] of Object.entries((st.teams_iscritti && typeof st.teams_iscritti === 'object') ? st.teams_iscritti : {})) {
                const iscritto = perGiocatore && perGiocatore[giocatore];
                for (const [k, copia] of vociDi(iscritto && iscritto.datiTeams)) {
                    if (!copia) continue;
                    const nomeCopia = String(copia.nome && typeof copia.nome === 'object' ? copia.nome.valore : copia.nome || '').trim().toLowerCase();
                    if (!((copia.id && copia.id === idTeam) || (nomeCopia && nomeCopia === nomeBox))) continue;
                    const dellaCopia = vociDi(copia.pokemon);
                    // lo stesso Pokémon della copia: nella stessa posizione se è la stessa specie, altrimenti il primo di quella specie non ancora shiny
                    const stessa = p => !!p && idSpecie(p.nome) === idSpecie(pokemon.nome);
                    const j = dellaCopia[i] && stessa(dellaCopia[i][1]) ? i : dellaCopia.findIndex(([, p]) => stessa(p) && !p.shiny);
                    if (j < 0) continue;
                    const base = `seasons/${sid}/teams_iscritti/${formato}/${giocatore}/datiTeams/${k}`;
                    modifiche[`${base}/pokemon/${dellaCopia[j][0]}/shiny`] = true;
                    if (copia.testoShowdown && String(copia.testoShowdown).trim()) {
                        const testoCopia = testoConShiny(copia.testoShowdown, j, pokemon.nome, dellaCopia.map(([, p]) => (p && p.nome) || ''));
                        if (testoCopia != null) modifiche[`${base}/testoShowdown`] = testoCopia;
                    }
                }
            }
        }
        if (!(await spendi(db, uid, prezzo, `Shiny: ${pokemon.nome}`, { adesso }))) return { ok: false, motivo: 'poor' };
        try {
            await db.ref().update(modifiche);
        } catch (e) {
            await db.ref(`wallet/${uid}/saldo`).transaction(v => (Number(v) || 0) + prezzo);
            await scriviMovimento(db, uid, prezzo, `Refund: Shiny ${pokemon.nome}`, adesso);
            throw e;
        }
        const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
        return { ok: true, saldo, prezzo, fascia };
    });
}

/** Mette (o toglie) un cosmetico: shiny, aure e effetti del nome e del palco si scrivono nel profilo pubblico (uno per campo: il nuovo prende il posto del vecchio); i motivi dello sfondo li sceglie l'editor della pagina */
async function equipa({ db, uid, id, attivo }) {
    const c = Cosmetici.perId(id);
    if (!c || !c.campo) return { ok: false, motivo: 'unknown' };
    const wallet = (await db.ref(`wallet/${uid}`).once('value')).val() || {};
    if (attivo && !(wallet.posseduti || {})[id]) return { ok: false, motivo: 'not-owned' };
    const nome = (await db.ref(`users/${uid}/name`).once('value')).val();
    const giocatore = String(nome || '').toLowerCase().trim();
    if (!giocatore) return { ok: false, motivo: 'no-profile' };
    if (attivo && c.tipo === 'shiny' && await compagnoDalBox(db, giocatore, (await db.ref(`players/${giocatore}/info`).once('value')).val() || {})) return { ok: false, motivo: 'box-companion' };
    const percorso = `players/${giocatore}/info/${c.campo}`;
    // togliere una voce che non si porta (una pagina rimasta aperta) non deve cancellare quella che si porta adesso
    if (!attivo && c.tipo !== 'shiny' && (await db.ref(percorso).once('value')).val() !== id) return { ok: true };
    await db.ref(percorso).set(c.tipo === 'shiny' ? (attivo ? true : null) : (attivo ? id : null));
    return { ok: true };
}

module.exports = { PREMI, PREZZI, MAX_MOVIMENTI, premioSet, premioBadge, accredita, spendi, premiaSet, premiaBadge, acquista, prendi, rilascia, equipa, cambia, shinyPokemon, testoConShiny, uidDi, giornoDi };
