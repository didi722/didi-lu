// =====================================================
// RICALCOLO DELLE MONETE — si lancia a mano (workflow "Ricalcola monete") per dare a ognuno le monete di quello che ha già fatto prima che il negozio esistesse
//
// Cosa conta (gli stessi premi di functions/monete.js, PREMI in cosmetici.js):
//   - i set ufficiali giocati e vinti nelle stagioni salvate (tutte tranne la beta): dai punteggi dei match (p1score/p2score = set vinti da ciascuno), 5 per set giocato e +6 se vinto;
//   - i badge che si hanno adesso (BadgeTeam, Fiocchi, allenatore, serie: gli stessi di novita.js), al livello raggiunto: 25 / 50 / 100 per livello;
//   - le stagioni vinte (300) e gli MVP (100), con le stesse chiavi dei premi in tempo reale: se il premio è già stato dato non lo si dà due volte.
// Le amichevoli non si ricostruiscono (non sono registrate per stagione).
//
// Sicuro da rilanciare: i set pagano solo la differenza rispetto a quello che il ricalcolo ha già dato (walletEventi/retro-set-<stagione>-<uid>), badge, stagioni e MVP hanno la chiave del premio.
// Una sola avvertenza: i set giocati nel simulatore DOPO il deploy delle Functions sono già stati pagati in tempo reale e il ricalcolo li conterebbe ancora; per questo
// si lancia una volta, subito, e prima in prova (senza scrivere niente) per vedere i totali.
//   node .github/workflows/ricalcola-monete.js          prova: stampa cosa darebbe a ognuno
//   node .github/workflows/ricalcola-monete.js --applica  scrive davvero (serve FIREBASE_SERVICE_ACCOUNT); con --senza-badge i badge già presi non si pagano
// =====================================================
'use strict';
const path = require('path');
const RADICE = path.join(__dirname, '..', '..');
const Statistiche = require(path.join(RADICE, 'docs', 'statistiche.js'));
const Mvp = require(path.join(RADICE, 'docs', 'mvp.js'));
const Cosmetici = require(path.join(RADICE, 'docs', 'cosmetici.js'));
const monete = require(path.join(RADICE, 'functions', 'monete.js'));
const novita = require('./novita.js');

const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);

/**
 * Cosa spetta a ognuno (puro). → { [idGiocatore]: { sets: { [stagione]: { giocati, vinti, monete } }, badge: [{ chiave, liv, nome }], stagioni: [{ stagione, nome }], mvp: [{ stagione, chiave, specie }] } }
 * @param {{ seasons: object, players: object }} dati
 */
function calcola(dati, { badge = true } = {}) {
    const fuori = {};
    const di = id => (fuori[id] = fuori[id] || { sets: {}, badge: [], stagioni: [], mvp: [] });
    const seasons = (dati && dati.seasons) || {};
    for (const [sid, s] of Object.entries(seasons)) {
        if (sid === 'sbeta' || !s) continue;
        for (const sd of valori(s.showdowns)) {
            for (const m of valori(sd && sd.matches)) {
                if (!m || m.p1score == null || m.p2score == null) continue;      // match non salvato
                const s1 = num(m.p1score), s2 = num(m.p2score);
                for (const [id, mio, altro] of [[idDi(m.player1Id), s1, s2], [idDi(m.player2Id), s2, s1]]) {
                    if (!id) continue;
                    const r = (di(id).sets[sid] = di(id).sets[sid] || { giocati: 0, vinti: 0, monete: 0 });
                    r.giocati += mio + altro; r.vinti += mio;
                }
            }
        }
        const info = s.info || {};
        if (idDi(info.status) === 'closed' && info.winner) di(idDi(info.winner)).stagioni.push({ stagione: sid, nome: String(info.name || sid) });
        for (const v of Mvp.vincitoriDi(s)) if (v.player) di(idDi(v.player)).mvp.push({ stagione: sid, chiave: v.chiave || v.player, specie: String(v.specie || '') });
    }
    const O = Cosmetici.PREMI.set.ufficiale;
    for (const g of Object.values(fuori)) for (const r of Object.values(g.sets)) r.monete = r.giocati * O.giocato + r.vinti * O.vinto;
    if (badge) try {
        const risultato = Statistiche.calcola(dati, { stagione: 'all' });
        for (const [chiave, b] of Object.entries(novita.badgePresi(risultato))) if (b.giocatore) di(b.giocatore).badge.push({ chiave, liv: b.liv, nome: b.badge });
    } catch (e) { console.error('Badge non calcolati:', e && e.message); }
    return fuori;
}

/** Il totale delle monete spettanti a uno (set + badge + stagioni + MVP) */
function totale(g) {
    const P = Cosmetici.PREMI;
    return Object.values(g.sets).reduce((t, r) => t + r.monete, 0) + g.badge.reduce((t, b) => t + monete.premioBadge(0, b.liv), 0) + g.stagioni.length * P.stagioneVinta + g.mvp.length * P.mvp;
}

/** Scrive le monete (db = database Admin). → { [idGiocatore]: monete date adesso } */
async function applica(db, dati, utenti, { log = console.log, badge = true } = {}) {
    const calcolati = calcola(dati, { badge });
    const dati_ = {};
    for (const [id, g] of Object.entries(calcolati)) {
        const uid = Object.keys(utenti).find(u => idDi(utenti[u] && utenti[u].name) === id);
        if (!uid) { log(`- ${id}: nessun account, salto`); continue; }
        let dato = 0;
        for (const [sid, r] of Object.entries(g.sets)) {
            const segno = db.ref(`walletEventi/retro-set-${sid}-${uid}`);
            const gia = num((await segno.once('value')).val());
            if (r.monete > gia) { dato += await monete.accredita(db, uid, r.monete - gia, `Season sets so far (${(dati.seasons[sid].info || {}).name || sid})`, { chiave: `retro-set-${sid}-${uid}-${r.monete}` }); await segno.set(r.monete); }
        }
        for (const b of g.badge) dato += await monete.premiaBadge({ db, uid, chiave: b.chiave, prima: 0, dopo: b.liv, nome: b.nome });
        for (const s of g.stagioni) dato += await monete.accredita(db, uid, Cosmetici.PREMI.stagioneVinta, `Season won: ${s.nome}`, { chiave: `stagione-${s.stagione}` });
        for (const m of g.mvp) dato += await monete.accredita(db, uid, Cosmetici.PREMI.mvp, `MVP: ${m.specie || 'Pokémon'}`, { chiave: `mvp-${m.stagione}-${m.chiave}` });
        dati_[id] = dato;
        log(`✔ ${id}: +${dato}`);
    }
    return dati_;
}

module.exports = { calcola, totale, applica };

if (require.main === module) {
    (async () => {
        const fs = require('fs');
        const { initializeApp, cert } = require('firebase-admin/app');
        const { getDatabase } = require('firebase-admin/database');
        const arg = process.argv.slice(2);
        initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: 'https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app' });
        const db = getDatabase();
        const [seasons, players, utenti] = await Promise.all(['seasons', 'players', 'users'].map(n => db.ref(n).once('value').then(s => s.val() || {})));
        const dati = { seasons, players };
        const senzaBadge = arg.includes('--senza-badge');
        const c = calcola(dati, { badge: !senzaBadge });
        console.log('Monete spettanti per quello che è già stato fatto:');
        for (const [id, g] of Object.entries(c).sort((a, b) => totale(b[1]) - totale(a[1]))) {
            const set = Object.values(g.sets).reduce((t, r) => t + r.monete, 0);
            console.log(`  ${id.padEnd(14)} ${String(totale(g)).padStart(5)} = set ${set} + badge ${g.badge.length} (${g.badge.reduce((t, b) => t + monete.premioBadge(0, b.liv), 0)}) + stagioni vinte ${g.stagioni.length} + MVP ${g.mvp.length}`);
        }
        if (!arg.includes('--applica')) { console.log('\nProva: non è stato scritto niente. Rilancia con "applica" per dare le monete.'); process.exit(0); }
        await applica(db, dati, utenti, { badge: !senzaBadge });
        console.log('Fatto.');
        process.exit(0);      // la connessione al database tiene vivo il processo: senza, il job non finisce mai
    })().catch(e => { console.error(e); process.exit(1); });
}
