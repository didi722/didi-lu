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
// Come si spendono: i cosmetici del catalogo; il cambio di avatar, di colore e di canzone (costa sempre, tranne la prima volta per chi ha ancora quello di partenza e tornando al primo; il primo
// resta tuo per sempre, gli altri tornano liberi quando li cambi); lo shiny di un Pokémon di un team.
//
//   premioSet({ ufficiale, vinto }), premioBadge(prima, dopo)           pure
//   accredita(db, uid, importo, motivo, { chiave, tettoGiorno, adesso }) → monete date davvero (0 se già dato o oltre il tetto)
//   spendi(db, uid, importo, motivo, { adesso })                         → true / false (saldo insufficiente)
//   premiaSet / acquista / equipa / cambia / shinyPokemon                le operazioni usate da index.js
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

/** L'id del giocatore (il suo nome in minuscolo) di un account */
const giocatoreDi = async (db, uid) => String((await db.ref(`users/${uid}/name`).once('value')).val() || '').toLowerCase().trim();

/** Un'operazione alla volta per chi la fa (due richieste insieme non la pagano due volte); il segno cade dopo un minuto se qualcosa si pianta */
async function conLock(db, nome, adesso, fn) {
    const segno = db.ref(`walletEventi/lock-${sicura(nome)}`);
    const preso = await segno.transaction(v => (v && adesso - Number(v) < 60000 ? undefined : adesso));
    if (!preso.committed) return { ok: false, motivo: 'busy' };
    try { return await fn(); } finally { await segno.remove(); }
}

/** Compra un cosmetico del catalogo (compagno shiny, aure, motivi dello sfondo): deve esistere, non essere già suo (o in uso) e il saldo bastare. Avatar e canzoni non si comprano: si cambiano (vedi sotto).
 *  Prima lo si "prenota" con una transazione (due richieste insieme non possono pagarlo due volte), poi si paga; se il saldo non basta la prenotazione torna indietro. */
async function acquista({ db, uid, id, adesso = Date.now() }) {
    const c = Cosmetici.perId(id);
    if (!c || c.tipo === 'avatar' || c.tipo === 'canzone') return { ok: false, motivo: 'unknown' };
    const giocatore = await giocatoreDi(db, uid);
    const [wallet, info] = await Promise.all([
        db.ref(`wallet/${uid}`).once('value').then(x => x.val() || {}),
        giocatore ? db.ref(`players/${giocatore}/info`).once('value').then(x => x.val() || {}) : Promise.resolve({})
    ]);
    if (Cosmetici.possiede(id, { wallet, info, pagina: info.pagina })) return { ok: false, motivo: 'owned' };
    const mio = db.ref(`wallet/${uid}/posseduti/${id}`);
    const preso = await mio.transaction(v => (v ? undefined : adesso));
    if (!preso.committed) return { ok: false, motivo: 'owned' };
    let fatto = false;
    try {
        fatto = await spendi(db, uid, c.prezzo, `Bought: ${c.nome}`, { adesso });
    } finally {
        if (!fatto) await mio.transaction(v => (v === adesso ? null : undefined));
    }
    if (!fatto) return { ok: false, motivo: 'poor' };
    const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
    return { ok: true, saldo };
}

// ---------------------------------------------------------------- avatar, colore e canzone: si cambiano, non si comprano
// Avatar, colore firma e canzone sono unici, com'è sempre stato: nessun altro può avere quello che hai. Cambiarli costa sempre (PREZZI), tranne la prima volta per chi ha ancora quello di partenza.
//   - il primo avatar, il primo colore e la prima canzone sono "di casa" (wallet/{uid}/casa/<tipo>), l'unica cosa personale: quello scelto gratis, o per chi ne aveva già uno quello che aveva,
//     resta tuo per sempre, nessun altro lo può prendere e tornarci non costa mai;
//   - quello che porti è riservato finché lo porti; cambiando di nuovo torna libero per tutti (tranne quello di casa);
//   - il server fa il cambio e scrive il profilo: pagare e portarlo sono un'unica operazione, quindi non si paga mai qualcosa che poi non si può usare.
// cosmeticiPresi/<id> = l'id dell'allenatore che lo tiene riservato (di casa o addosso): lo legge chiunque (per mostrare "già preso" nell'editor), lo scrive solo il server.
// Il colore firma è uno dei COLORI_FIRMA (cosmetici.js), scritto in players/{id}/info/color.
const ESCLUSIVI = Cosmetici.FAMIGLIE;          // avatar, colore, canzone
// il sito dove stanno le immagini degli avatar (come li salva l'editor della pagina); il server compone l'indirizzo da sé, senza fidarsi di quello che arriva
const SITO_AVATAR = process.env.SITO_AVATAR_URL || 'https://didi722.github.io/didi-lu/';
const indirizzoAvatar = id => `${SITO_AVATAR}immagini/profile/${String(id).replace('avatar-', '')}.png`;

/** Chi, tra gli altri, porta adesso questo avatar o questa canzone? Ritorna l'id dell'allenatore, o '' */
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
const libera = (db, id, giocatore) => db.ref(`cosmeticiPresi/${id}`).transaction(v => (v === giocatore ? null : undefined));

/**
 * Cambia l'avatar, il colore o la canzone di chi chiama. `id` è avatar-<n>, colore-<rrggbb> o canzone-<impronta>; per una canzone servono anche `url` e `nome` (l'id deve essere quello
 * dell'indirizzo); `id` vuoto con tipo 'canzone' toglie la canzone (gratis). Tornare a quello di casa è gratis. Ritorna { ok, saldo, gratis, ritorno, casa, liberato, avatar | color |
 * musicaPreferita + musicName } oppure { ok: false, motivo }: unknown, no-profile, same (è già quello che porti), taken (di un altro o lo porta un altro), poor, busy.
 */
async function cambia({ db, uid, tipo, id, url, nome, adesso = Date.now() }) {
    if (!ESCLUSIVI.includes(tipo)) return { ok: false, motivo: 'unknown' };
    const giocatore = await giocatoreDi(db, uid);
    if (!giocatore) return { ok: false, motivo: 'no-profile' };
    const vuota = tipo === 'canzone' && !id;
    let c = null, indirizzo = '', titolo = '';
    if (!vuota) {
        c = Cosmetici.perId(id);
        if (!c || c.tipo !== tipo) return { ok: false, motivo: 'unknown' };
        if (tipo === 'avatar') { indirizzo = indirizzoAvatar(id); titolo = c.nome; }
        else if (tipo === 'colore') { indirizzo = Cosmetici.coloreDaId(id); titolo = c.nome; }
        else {
            indirizzo = String(url || '').trim();
            if (!/^https?:\/\/\S{4,500}$/i.test(indirizzo) || Cosmetici.idCanzone(indirizzo) !== id) return { ok: false, motivo: 'unknown' };
            titolo = String(nome || 'Song').replace(/[\r\n]+/g, ' ').trim().slice(0, 60) || 'Song';
        }
    }
    return conLock(db, `cambia-${tipo}-${giocatore}`, adesso, async () => {
        const [wallet, info, giocatori, titolare] = await Promise.all([
            db.ref(`wallet/${uid}`).once('value').then(x => x.val() || {}),
            db.ref(`players/${giocatore}/info`).once('value').then(x => x.val() || {}),
            vuota ? Promise.resolve({}) : db.ref('players').once('value').then(x => x.val() || {}),
            vuota ? Promise.resolve('') : db.ref(`cosmeticiPresi/${id}`).once('value').then(x => x.val() || '')
        ]);
        const corrente = Cosmetici.idCorrente(tipo, info);
        if (vuota ? Cosmetici.eDiDefault('canzone', info) : corrente === id) return { ok: false, motivo: 'same' };
        // è riservato a un altro (di casa o addosso) o lo porta un altro (anche se ancora non risulta riservato): non si cambia, e non si addebita niente
        if (!vuota && ((titolare && titolare !== giocatore) || chiUsa(giocatori, giocatore, c))) return { ok: false, motivo: 'taken' };

        const casaPrima = String((wallet.casa || {})[tipo] || '');
        const { prezzo, gratis, ritorno } = vuota ? { prezzo: 0, gratis: false } : Cosmetici.prezzoCambio(tipo, { wallet, info }, id);
        // il "di casa": chi ha ancora quello di partenza sceglie gratis e quello diventa suo; chi ne aveva già uno tiene quello che aveva (al primo cambio)
        const casa = casaPrima || (gratis ? id : corrente);

        let riservato = { ok: true, nuovo: false };
        if (!vuota) {
            riservato = await riserva(db, id, giocatore);
            if (!riservato.ok) return { ok: false, motivo: 'taken' };
        }
        let pagato = false;
        try {
            if (prezzo > 0) {
                if (!(await spendi(db, uid, prezzo, `${tipo === 'canzone' ? 'Song' : tipo === 'colore' ? 'Colour' : 'Avatar'}: ${titolo}`, { adesso }))) {
                    if (riservato.nuovo) await libera(db, id, giocatore);
                    return { ok: false, motivo: 'poor' };
                }
                pagato = true;
            } else if (gratis) await scriviMovimento(db, uid, 0, `Free: ${titolo}`, adesso);
            else if (ritorno) await scriviMovimento(db, uid, 0, `Back to: ${titolo}`, adesso);
            const campi = tipo === 'avatar' ? { avatar: indirizzo } : tipo === 'colore' ? { color: indirizzo } : { musicaPreferita: indirizzo, musicName: vuota ? '' : titolo };
            await db.ref(`players/${giocatore}/info`).update(campi);
        } catch (e) {
            if (pagato) {
                await db.ref(`wallet/${uid}/saldo`).transaction(v => (Number(v) || 0) + prezzo);
                await scriviMovimento(db, uid, prezzo, `Refund: ${titolo}`, adesso);
            }
            if (riservato.nuovo) await libera(db, id, giocatore);
            throw e;
        }
        // fatto: il di casa si ricorda (e resta riservato per sempre) e quello che portavi prima torna libero, se non è di casa
        if (casa && casa !== casaPrima) {
            await db.ref(`wallet/${uid}/casa/${tipo}`).set(casa);
            await riserva(db, casa, giocatore);
        }
        if (corrente && corrente !== id && corrente !== casa) await libera(db, corrente, giocatore);
        const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
        const esito = { ok: true, saldo, gratis, casa };
        if (ritorno) esito.ritorno = true;
        if (corrente && corrente !== id && corrente !== casa) esito.liberato = corrente;
        return Object.assign(esito, tipo === 'avatar' ? { avatar: indirizzo } : tipo === 'colore' ? { color: indirizzo } : { musicaPreferita: indirizzo, musicName: vuota ? '' : titolo });
    });
}

// ---------------------------------------------------------------- lo shiny di un Pokémon di un team
const { idSpecie, testoConShiny } = Cosmetici;
const vociDi = x => (Array.isArray(x) ? x.map((v, k) => [String(k), v]) : Object.entries(x && typeof x === 'object' ? x : {}));

/**
 * Rende shiny il Pokémon numero `indice` di un team del Box. Lo shiny è solo estetico, quindi vale anche per i team bloccati (iscritti a una stagione iniziata): si scrive nel team
 * del Box e nelle iscrizioni alle stagioni non chiuse (dove il team è una copia), compreso il testo Showdown, che è quello che il simulatore legge. La stagione chiusa resta com'era.
 * Si paga solo se tutte le modifiche si possono fare; se la scrittura fallisce le monete tornano.
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
        if (!(await spendi(db, uid, PREZZI.shinyPokemon, `Shiny: ${pokemon.nome}`, { adesso }))) return { ok: false, motivo: 'poor' };
        try {
            await db.ref().update(modifiche);
        } catch (e) {
            await db.ref(`wallet/${uid}/saldo`).transaction(v => (Number(v) || 0) + PREZZI.shinyPokemon);
            await scriviMovimento(db, uid, PREZZI.shinyPokemon, `Refund: Shiny ${pokemon.nome}`, adesso);
            throw e;
        }
        const saldo = Number((await db.ref(`wallet/${uid}/saldo`).once('value')).val()) || 0;
        return { ok: true, saldo };
    });
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

module.exports = { PREMI, PREZZI, MAX_MOVIMENTI, premioSet, premioBadge, accredita, spendi, premiaSet, premiaBadge, acquista, equipa, cambia, shinyPokemon, testoConShiny, uidDi, giornoDi };
