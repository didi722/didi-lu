'use strict';
// =====================================================
// NOVITÀ DELLA LEGA — Poké-Tournament (lo esegue il checker ogni 30 minuti: .github/workflows/checker.js)
//
//   1. BADGE SBLOCCATI. A ogni giro si calcolano i badge (fiocchi dei Pokémon, badge dei team, badge e serie degli allenatori: gli stessi del sito) e li si confronta con
//      l'ultima situazione salvata in badgeVisti/{chiave} = livello. Un livello più alto di prima è una novità: a chi li ha vinti arriva una notifica ("Your Garchomp earned
//      Knockout · Silver") e finisce nella sua posta del campanello; agli altri finisce solo nella posta, come notizia della lega ("Didi's Garchomp earned...").
//      La prima volta (niente situazione salvata) si salva tutto e non si notifica niente, altrimenti arriverebbero in blocco tutti i badge già presi.
//      Si salva PRIMA di notificare: un errore a metà non fa ripetere le notifiche. Più badge dello stesso giocatore nello stesso giro sono una sola notifica.
//   2. RIASSUNTO DEL LUNEDÌ. Il lunedì dalle 9 (ora di Roma) si riassume la settimana scorsa (da lunedì a domenica): match giocati, i tuoi vinti e persi, il Match della
//      settimana e chi guida la classifica. Una volta per settimana e per persona (pushInviati/digest-<settimana>-<uid>); se non si è giocato niente non parte.
//      Il telefono lo riceve solo chi ha le notifiche accese e non l'ha spento (notifiche/{uid}/preferenze/digest = 'off'); la posta del campanello c'è per tutti.
//
// La parte pura (cosa è nuovo, i testi, la settimana) è provata in test/novita.test.js; `eseguiNovita` collega database e notifiche.
// =====================================================
const path = require('path');
const RADICE = path.join(__dirname, '..', '..');
const Statistiche = require(path.join(RADICE, 'docs', 'statistiche.js'));
const Fiocchi = require(path.join(RADICE, 'docs', 'fiocchi.js'));
const BadgeTeam = require(path.join(RADICE, 'docs', 'badge-team.js'));
const BadgeAllenatore = require(path.join(RADICE, 'docs', 'badge-allenatore.js'));
const Titoli = require(path.join(RADICE, 'docs', 'titoli.js'));
const MatchSettimana = require(path.join(RADICE, 'docs', 'match-settimana.js'));
const push = require(path.join(RADICE, 'functions', 'push.js'));
const monete = require(path.join(RADICE, 'functions', 'monete.js'));

const PERCORSO_BADGE = 'badgeVisti';
const GIORNO_MS = 86400000;
const ORA_RIASSUNTO = 9;                 // il lunedì, ora di Roma
const MAX_VOCI_TESTO = 3;                // badge nominati nel testo; gli altri sono "and N more"
const NOME_LIVELLO = { 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Platinum' };
const LIVELLO_DI = { bronze: 1, silver: 2, gold: 3, platinum: 4, founder: 5 };

const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
const chiaveSicura = k => String(k).replace(/[.#$\[\]/]/g, '_');
const maiuscola = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);

// -----------------------------------------------------
// 1. Badge
// -----------------------------------------------------
/**
 * Tutti i badge presi adesso: { chiaveSicura: { liv (1-4), dove, badge, livelloNome, giocatore (id), tipo } }.
 * `dove` dice di chi è (il Pokémon col suo team, il team, o '' per l'allenatore).
 */
function badgePresi(risultato, giocatori = {}) {
    const fuori = {};
    const metti = (k, voce) => { fuori[chiaveSicura(k)] = voce; };
    for (const p of (risultato && risultato.pokemon) || []) {
        for (const f of Fiocchi.guadagnati(Fiocchi.calcola(p))) {
            metti(`pk|${p.chiave}|${f.id}`, { liv: f.livello, dove: `${p.specie} (${p.team})`, badge: f.nome, livelloNome: f.livelloNome, giocatore: idDi(p.player), tipo: 'pokemon' });
        }
    }
    for (const t of (risultato && risultato.teams) || []) {
        for (const b of BadgeTeam.guadagnati(BadgeTeam.calcola(t))) {
            metti(`tm|${t.chiave}|${b.id}`, { liv: b.livello, dove: t.nome, badge: b.nome, livelloNome: b.livelloNome, giocatore: idDi(t.player), tipo: 'team' });
        }
    }
    for (const g of (risultato && risultato.players) || []) {
        const id = idDi(g.id);
        for (const b of BadgeAllenatore.guadagnati(BadgeAllenatore.calcola(risultato, id))) {
            metti(`al|${id}|${b.id}`, { liv: b.livello, dove: '', badge: b.nome, livelloNome: b.livelloNome, giocatore: id, tipo: 'allenatore' });
        }
        for (const b of Titoli.badgeSbloccati(Titoli.serieDaStatistiche(g) || {}, id)) {
            if (b.livello === 'founder') continue;                      // il fondatore non è una novità
            metti(`sr|${id}|${b.id}`, { liv: LIVELLO_DI[b.livello] || 0, dove: '', badge: b.label, livelloNome: maiuscola(b.livello), giocatore: id, tipo: 'allenatore' });
        }
    }
    return fuori;
}

/** I badge nuovi o saliti di livello rispetto alla situazione salvata: [{ chiave, ...voce, prima }] (prima = livello di prima, 0 se nuovo) */
function badgeNuovi(presi, visti) {
    const v = visti || {};
    return Object.entries(presi).filter(([k, x]) => x.liv > (Number(v[k]) || 0)).map(([k, x]) => ({ chiave: k, ...x, prima: Number(v[k]) || 0 }));
}

/** La nuova situazione da salvare: mai più bassa di prima (se un livello scende per un ricalcolo e poi risale, non si notifica di nuovo) */
function badgeDaSalvare(presi, visti) {
    const fuori = { ...(visti || {}) };
    for (const [k, x] of Object.entries(presi)) fuori[k] = Math.max(Number(fuori[k]) || 0, x.liv);
    return fuori;
}

/** La frase di un badge: "Garchomp (Team) · Knockout · Silver" */
const fraseBadge = b => [b.dove, b.badge, b.livelloNome].filter(Boolean).join(' · ');

/**
 * Le novità raggruppate per giocatore, con i testi per chi li ha vinti e per gli altri. `nomi`: id -> nome.
 * @returns {Array<{ giocatore, nome, personale: { titolo, testo, url }, lega: { testo, url }, quanti }>}
 */
function novitaPerGiocatore(nuovi, nomi = {}) {
    const gruppi = {};
    for (const b of nuovi) (gruppi[b.giocatore] ||= []).push(b);
    return Object.entries(gruppi).map(([giocatore, lista]) => {
        lista.sort((a, b) => b.liv - a.liv || a.chiave.localeCompare(b.chiave));
        const nome = nomi[giocatore] || maiuscola(giocatore);
        const visibili = lista.slice(0, MAX_VOCI_TESTO).map(fraseBadge);
        const resto = lista.length - visibili.length;
        const elenco = visibili.join('; ') + (resto > 0 ? ` and ${resto} more` : '');
        const soloAllenatore = lista.every(b => b.tipo === 'allenatore');
        return {
            giocatore, nome, quanti: lista.length,
            personale: { titolo: lista.length === 1 ? 'New badge' : `${lista.length} new badges`, testo: `${soloAllenatore ? 'You earned ' : 'Earned: '}${elenco}`, url: soloAllenatore ? `public.html?player=${encodeURIComponent(nome)}` : 'box.html' },
            lega: { testo: `${nome} earned ${elenco}`, url: `public.html?player=${encodeURIComponent(nome)}` }
        };
    });
}

// -----------------------------------------------------
// 2. Riassunto del lunedì
// -----------------------------------------------------
/** L'ora a Roma di un istante: { giorno: 0 (domenica) - 6, ora, data: 'AAAA-MM-GG' } */
function oraRoma(adesso) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(adesso)).map(x => [x.type, x.value]));
    return { giorno: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), ora: Number(p.hour), data: `${p.year}-${p.month}-${p.day}` };
}

/** Il riassunto è dovuto? Il lunedì, dalle 9 a Roma (la finestra resta aperta fino a sera: il checker può ritardare). Restituisce { lunedi (ms), settimana: 'AAAA-Wnn' } o null. */
function riassuntoDovuto(adesso) {
    const r = oraRoma(adesso);
    if (r.giorno !== 1 || r.ora < ORA_RIASSUNTO) return null;
    const oggi = MatchSettimana.giornoDi(r.data);
    const lunedi = MatchSettimana.lunediDi(oggi) - 7 * GIORNO_MS;         // il lunedì della settimana scorsa
    const { numero, anno } = MatchSettimana.numeroSettimana(lunedi);
    return { lunedi, settimana: `${anno}-W${String(numero).padStart(2, '0')}` };
}

/**
 * Cosa è successo nella settimana che comincia a `lunedi` (da lunedì a domenica): match salvati (la beta non conta), chi ha vinto e perso, il Match della settimana e chi guida.
 * @returns {{ match, perGiocatore: { id: { vinti, persi } }, matchDellaSettimana: null | { testo }, capoclassifica: null | { nome, stagione, punti } }}
 */
function riassuntoSettimana(seasons, lunedi, adesso = Date.now()) {
    const fine = lunedi + 6 * GIORNO_MS;
    const perGiocatore = {};
    let match = 0;
    for (const [idStagione, st] of Object.entries(seasons || {})) {
        if (idStagione === 'sbeta' || !st) continue;
        for (const sd of Object.values(st.showdowns || {})) {
            for (const m of Object.values((sd && sd.matches) || {})) {
                if (!m || m.p1score == null || m.p2score == null) continue;
                const giorno = MatchSettimana.giornoDi(m.data || (sd.info && sd.info.data));
                if (giorno == null || giorno < lunedi || giorno > fine) continue;
                match++;
                const a = Number(m.p1score), b = Number(m.p2score);
                if (a === b) continue;
                const vince = a > b ? idDi(m.player1Id) : idDi(m.player2Id), perde = a > b ? idDi(m.player2Id) : idDi(m.player1Id);
                (perGiocatore[vince] ||= { vinti: 0, persi: 0 }).vinti++;
                (perGiocatore[perde] ||= { vinti: 0, persi: 0 }).persi++;
            }
        }
    }
    const w = MatchSettimana.settimane(seasons, { adesso }).elenco.find(x => x.inizio === lunedi);
    let matchDellaSettimana = null;
    if (w && w.scelto) {
        const s = w.scelto;
        matchDellaSettimana = { testo: `${bello(s.giocatori.p1.nome)} vs ${bello(s.giocatori.p2.nome)}${s.motivi && s.motivi[0] ? ` (${s.motivi[0]})` : ''}` };
    }
    // chi guida: la stagione in corso più recente con una classifica
    let capoclassifica = null;
    const inCorso = Object.entries(seasons || {}).filter(([id, st]) => id !== 'sbeta' && st && st.info && ['playing', 'open'].includes(idDi(st.info.status))).sort((x, y) => y[0].localeCompare(x[0], undefined, { numeric: true }));
    for (const [id, st] of inCorso) {
        const righe = Object.entries(st.leaderboard || {}).map(([k, v]) => ({ nome: (v && v.name) || k, punti: Number(v && v.points) || 0 })).sort((a, b) => b.punti - a.punti || a.nome.localeCompare(b.nome));
        if (righe.length && righe[0].punti > 0) { capoclassifica = { nome: bello(righe[0].nome), stagione: (st.info && st.info.name) || id, punti: righe[0].punti }; break; }
    }
    return { match, perGiocatore, matchDellaSettimana, capoclassifica };
}

// i nomi nelle partite sono salvati come li ha scritti chi ha creato l'account (di solito minuscoli): per leggerli si mette la maiuscola
const bello = n => (/^[a-z0-9 ._'-]+$/.test(String(n || '')) ? String(n).replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()) : String(n || ''));
const piu = (n, singolare, plurale) => `${n} ${n === 1 ? singolare : plurale}`;

/** Il testo del riassunto per una persona (`id`, minuscolo), con la sua riga se ha giocato */
function testoRiassunto(r, id) {
    const parti = [];
    const mio = r.perGiocatore[idDi(id)];
    if (mio) parti.push(`You: ${piu(mio.vinti, 'win', 'wins')}, ${piu(mio.persi, 'loss', 'losses')}`);
    parti.push(`${piu(r.match, 'match', 'matches')} played last week`);
    if (r.matchDellaSettimana) parti.push(`Match of the week: ${r.matchDellaSettimana.testo}`);
    if (r.capoclassifica) parti.push(`${r.capoclassifica.nome} leads ${r.capoclassifica.stagione} (${r.capoclassifica.punti} pts)`);
    return parti.join(' · ');
}

// -----------------------------------------------------
// Il collegamento a database e notifiche
// -----------------------------------------------------
async function notificaBadge({ db, messaging, seasons, players, utenti, log = () => {} }) {
    const risultato = Statistiche.calcola({ seasons, players }, { stagione: 'all' });
    const nomi = Object.fromEntries(Object.entries(players || {}).map(([id, p]) => [idDi(id), (p && p.info && p.info.name) || id]));
    const presi = badgePresi(risultato);
    const visti = (await db.ref(PERCORSO_BADGE).once('value')).val();
    if (visti === null || visti === undefined) {                       // prima volta: si salva e basta
        await db.ref(PERCORSO_BADGE).set(badgeDaSalvare(presi, {}));
        log(`🏅 Badge: situazione iniziale salvata (${Object.keys(presi).length} badge), nessuna notifica.`);
        return { iniziale: true, nuovi: 0 };
    }
    const nuovi = badgeNuovi(presi, visti);
    if (!nuovi.length) return { iniziale: false, nuovi: 0 };
    await db.ref(PERCORSO_BADGE).set(badgeDaSalvare(presi, visti));      // prima si salva, poi si notifica
    // le monete dei badge nuovi (monete.js): una volta sola per badge e livello; i badge che c'erano già alla prima volta non pagano
    for (const b of nuovi) {
        try { await monete.premiaBadge({ db, uid: push.uidDelGiocatore(utenti, b.giocatore), chiave: b.chiave, prima: b.prima, dopo: b.liv, nome: b.badge }); } catch (e) { log(`⚠️ Monete badge non accreditate: ${e.message}`); }
    }
    const tutti = Object.keys(utenti || {});
    for (const g of novitaPerGiocatore(nuovi, nomi)) {
        const uid = push.uidDelGiocatore(utenti, g.giocatore);
        const n = push.testo('badge', { titolo: g.personale.titolo, testo: g.personale.testo, url: g.personale.url, chiave: `${g.giocatore}-${Date.now()}` });
        if (uid) await push.invia({ db, messaging, uids: [uid], n, posta: { tipo: 'badge' } });
        const altri = tutti.filter(u => u !== uid);
        if (altri.length) await push.scriviPosta(db, altri, { tipo: 'badge', titolo: '', testo: g.lega.testo, url: g.lega.url, lega: true });
        log(`🏅 ${g.nome}: ${g.quanti} badge nuovi.`);
    }
    return { iniziale: false, nuovi: nuovi.length };
}

async function notificaRiassunto({ db, messaging, seasons, utenti, adesso = Date.now(), log = () => {} }) {
    const dovuto = riassuntoDovuto(adesso);
    if (!dovuto) return { inviati: 0 };
    const r = riassuntoSettimana(seasons, dovuto.lunedi, adesso);
    if (!r.match) return { inviati: 0 };                                // settimana senza partite: niente da dire
    let inviati = 0;
    for (const uid of Object.keys(utenti || {})) {
        const id = idDi(utenti[uid] && utenti[uid].name);
        const spento = (await db.ref(`notifiche/${uid}/preferenze/digest`).once('value')).val() === 'off';
        const n = push.testo('digest', { titolo: 'Your week in the league', testo: testoRiassunto(r, id), settimana: dovuto.settimana, url: 'index.html' });
        const esito = await push.invia({ db, messaging, uids: [uid], n, chiaveUnica: `digest-${dovuto.settimana}-${uid}`, posta: { tipo: 'digest' }, soloPosta: spento });
        if (!esito.saltata) inviati++;
    }
    if (inviati) log(`📬 Riassunto della settimana ${dovuto.settimana}: ${inviati} persone.`);
    return { inviati };
}

/** Il giro delle novità, da chiamare a ogni passaggio del checker. Un errore qui non ferma il resto. */
async function eseguiNovita({ db, messaging, seasons, adesso = Date.now(), log = console.log }) {
    try {
        const [players, utenti] = await Promise.all([db.ref('players').once('value').then(s => s.val() || {}), db.ref('users').once('value').then(s => s.val() || {})]);
        await notificaBadge({ db, messaging, seasons, players, utenti, log });
        await notificaRiassunto({ db, messaging, seasons, utenti, adesso, log });
    } catch (e) {
        console.error('⚠️ Novità della lega non elaborate (il controllo prosegue):', e && e.message);
    }
}

module.exports = {
    PERCORSO_BADGE, ORA_RIASSUNTO,
    badgePresi, badgeNuovi, badgeDaSalvare, fraseBadge, novitaPerGiocatore,
    oraRoma, riassuntoDovuto, riassuntoSettimana, testoRiassunto,
    notificaBadge, notificaRiassunto, eseguiNovita
};
