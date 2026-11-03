'use strict';
// Le novità della lega (.github/workflows/novita.js): badge sbloccati e riassunto del lunedì, notifiche e posta del campanello.
//   npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../.github/workflows/novita.js');
const Fiocchi = require('../docs/fiocchi.js');
const P = require('../functions/push.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// ---------- un database finto ----------
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
        transaction: async fn => { const nuovo = fn(prendi(percorso) === undefined ? null : prendi(percorso)); if (nuovo === undefined) return { committed: false }; metti(percorso, nuovo); return { committed: true }; },
        remove: async () => metti(percorso, null), set: async v => metti(percorso, v),
        push: () => { const k = `-K${String(++c).padStart(6, '0')}`; return { set: async v => metti(`${percorso}/${k}`, v) }; },
        child: k => ref(`${percorso}/${k}`)
    });
    return { albero, ref };
}
const messagingFinto = () => { const m = { inviati: [] }; m.sendEachForMulticast = async msg => { m.inviati.push(msg); return { responses: msg.tokens.map(() => ({ success: true })) }; }; return m; };
const posta = (db, uid) => Object.values(((db.albero.notifiche || {})[uid] || {}).posta || {});

// ---------- una lega piccola: Didi vince di fila contro Lu ----------
const partita = (n, vince = 'didi') => ({
    player1: 'didi', player1Id: 'didi', player2: 'lu', player2Id: 'lu', winnerId: vince, team1: 'A', team2: 'B', score: vince === 'didi' ? '2-1' : '1-2',
    p1score: vince === 'didi' ? 2 : 1, p2score: vince === 'didi' ? 1 : 2, p1points: 2, p2points: 1, data: `2026-03-${String(n).padStart(2, '0')}`, categoria: 'VGC',
    p1EloAtMatch: 1000, p2EloAtMatch: 1000, p1DeltaElo: 16, p2DeltaElo: -16
});
const stagioni = vittorie => ({
    s1: { info: { name: 'Season One', status: 'playing', selected_formats: ['VGC'] }, leaderboard: { didi: { name: 'didi', points: 3 * vittorie }, lu: { name: 'lu', points: vittorie } },
        showdowns: { sd1: { info: { categoria: 'VGC', data: '2026-03-01' }, matches: Object.fromEntries(Array.from({ length: vittorie }, (_, i) => [`match${i + 1}`, partita(i + 1)])) } } }
});
const giocatori = { didi: { info: { name: 'Didi' }, teams: { a: { nome: 'A', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }] } } }, lu: { info: { name: 'Lu' }, teams: { b: { nome: 'B', categoria: 'VGC', pokemon: [{ nome: 'Dragonite' }] } } } };
const UTENTI = { u1: { name: 'Didi' }, u2: { name: 'Lu' }, u3: { name: 'Ada' } };
const TOKEN = { u1: { a: { t: 'tok-didi' } }, u3: { d: { t: 'tok-ada' } } };

test('badgePresi: i fiocchi dei Pokémon, i badge dei team e le serie dell\'allenatore, con livello, di chi sono e chiavi sicure per Firebase', () => {
    const pokemon = [{ chiave: 'didi::A team::garchomp#2', player: 'Didi', team: 'A team', specie: 'Garchomp', portato: 100, koFatti: 400, setPortatoVinti: 60, ultimoVinto: 12, sopravvivenza: 60, serie: { vittorieMax: 10, pulitaMax: 6 }, stagioniVinteInCampo: 1, stagioniInCampo: 2 }];
    const presi = N.badgePresi({ pokemon, teams: [], players: [] });
    const attesi = Fiocchi.guadagnati(Fiocchi.calcola(pokemon[0]));
    assert.ok(attesi.length > 0, 'la prova ha almeno un fiocco');
    assert.equal(Object.keys(presi).length, attesi.length);
    for (const k of Object.keys(presi)) {
        assert.doesNotMatch(k, /[.#$\[\]/]/.test(k) && k.replace(/\|/g, '') === k ? /x^/ : /[.#$\[\]]/, k);
        assert.equal(presi[k].tipo, 'pokemon');
        assert.equal(presi[k].giocatore, 'didi', 'l\'id è in minuscolo');
        assert.equal(presi[k].dove, 'Garchomp (A team)');
    }
    assert.ok(Object.keys(presi).every(k => k.startsWith('pk|didi::A team::garchomp_2|')), 'il # diventa _');
    const serie = N.badgePresi({ pokemon: [], teams: [], players: [{ id: 'didi', serie: { vittorieMax: 12, vittorieAttuale: 12, pulitaMax: 0, pulitaAttuale: 0, showdownMax: 0, showdownAttuale: 0 } }] });
    assert.deepEqual(Object.values(serie).filter(x => x.badge === 'Win Streak').map(x => [x.livelloNome, x.giocatore, x.tipo]), [['Bronze', 'didi', 'allenatore']]);
});

test('badgeNuovi / badgeDaSalvare: nuovo o salito di livello sì, uguale o sceso no; la situazione salvata non scende mai', () => {
    const presi = { a: { liv: 2 }, b: { liv: 1 }, c: { liv: 3 }, d: { liv: 1 } };
    const visti = { a: 2, b: 0, c: 1, e: 4 };
    assert.deepEqual(N.badgeNuovi(presi, visti).map(x => [x.chiave, x.prima]), [['b', 0], ['c', 1], ['d', 0]], 'b è salito da 0 a 1');
    assert.deepEqual(N.badgeDaSalvare(presi, visti), { a: 2, b: 1, c: 3, d: 1, e: 4 }, 'e resta 4 anche se ora non c\'è');
    assert.deepEqual(N.badgeNuovi({ a: { liv: 1 } }, null).map(x => x.chiave), ['a']);
});

test('novitaPerGiocatore: una notifica per giocatore anche con più badge (i primi tre nel testo, poi "and N more"), il testo personale e quello della lega', () => {
    const b = (chiave, liv, giocatore, tipo = 'pokemon', dove = 'Garchomp (A)') => ({ chiave, liv, giocatore, tipo, dove, badge: `B${chiave}`, livelloNome: ['', 'Bronze', 'Silver', 'Gold'][liv] });
    const r = N.novitaPerGiocatore([b('1', 1, 'didi'), b('2', 3, 'didi'), b('3', 2, 'didi'), b('4', 1, 'didi'), b('5', 2, 'lu', 'allenatore', '')], { didi: 'Didi', lu: 'Lu' });
    assert.equal(r.length, 2);
    const didi = r.find(x => x.giocatore === 'didi');
    assert.equal(didi.personale.titolo, '4 new badges');
    assert.equal(didi.personale.testo, 'Earned: Garchomp (A) · B2 · Gold; Garchomp (A) · B3 · Silver; Garchomp (A) · B1 · Bronze and 1 more', 'dal più alto, tre voci');
    assert.equal(didi.personale.url, 'box.html');
    assert.match(didi.lega.testo, /^Didi earned Garchomp/);
    assert.equal(didi.lega.url, 'public.html?player=Didi');
    const lu = r.find(x => x.giocatore === 'lu');
    assert.equal(lu.personale.titolo, 'New badge');
    assert.equal(lu.personale.testo, 'You earned B5 · Silver', 'un badge solo da allenatore: "You earned"');
    assert.equal(lu.personale.url, 'public.html?player=Lu');
});

test('oraRoma / riassuntoDovuto: il lunedì dalle 9 a Roma (anche con l\'ora legale), mai negli altri giorni; la settimana è quella scorsa', () => {
    assert.deepEqual(N.oraRoma(Date.UTC(2026, 10, 2, 8, 0)), { giorno: 1, ora: 9, data: '2026-11-02' }, 'a novembre Roma è UTC+1');
    assert.deepEqual(N.oraRoma(Date.UTC(2026, 5, 1, 7, 0)), { giorno: 1, ora: 9, data: '2026-06-01' }, 'a giugno UTC+2');
    assert.equal(N.riassuntoDovuto(Date.UTC(2026, 10, 2, 7, 59)), null, 'prima delle 9');
    const d = N.riassuntoDovuto(Date.UTC(2026, 10, 2, 8, 0));
    assert.equal(d.settimana, '2026-W44', 'lunedì 2 novembre: si riassume la settimana 44 (26 ottobre - 1 novembre)');
    assert.equal(d.lunedi, Date.UTC(2026, 9, 26, 12));
    assert.ok(N.riassuntoDovuto(Date.UTC(2026, 10, 2, 17, 30)), 'anche più tardi, lo stesso lunedì');
    assert.equal(N.riassuntoDovuto(Date.UTC(2026, 10, 3, 9, 0)), null, 'martedì no');
    assert.equal(N.riassuntoDovuto(Date.UTC(2026, 10, 1, 9, 0)), null, 'domenica no');
    assert.equal(N.riassuntoDovuto(Date.UTC(2026, 5, 1, 6, 59)), null);
    assert.ok(N.riassuntoDovuto(Date.UTC(2026, 5, 1, 7, 0)));
});

test('riassuntoSettimana / testoRiassunto: match della settimana scorsa, vinti e persi di ognuno, chi guida; la beta non conta', () => {
    const s = stagioni(4);
    s.s1.showdowns.sd1.matches.match2 = partita(2, 'lu');                       // Lu vince il secondo
    s.sbeta = { info: { name: 'Beta', status: 'closed' }, showdowns: { b: { info: { data: '2026-03-02' }, matches: { m: partita(2) } } } };
    const lunedi = Date.UTC(2026, 2, 2, 12);                                     // lunedì 2 marzo: i match sono del 1 (domenica scorsa), 2, 3, 4
    const r = N.riassuntoSettimana(s, lunedi, Date.UTC(2026, 2, 9, 9));
    assert.equal(r.match, 3, 'il 2, 3 e 4; il 1 è della settimana prima, la beta non c\'è');
    assert.deepEqual(r.perGiocatore, { lu: { vinti: 1, persi: 2 }, didi: { vinti: 2, persi: 1 } });
    assert.deepEqual(r.capoclassifica, { nome: 'Didi', stagione: 'Season One', punti: 12 });
    assert.equal(N.testoRiassunto(r, 'didi'), 'You: 2 wins, 1 loss · 3 matches played last week · Didi leads Season One (12 pts)');
    assert.equal(N.testoRiassunto(r, 'ada'), '3 matches played last week · Didi leads Season One (12 pts)', 'chi non ha giocato non ha la riga personale');
    assert.equal(N.riassuntoSettimana(s, Date.UTC(2026, 3, 6, 12)).match, 0);
});

test('notificaBadge: la prima volta salva la situazione e non notifica; poi un nuovo badge arriva a chi lo ha vinto (push e posta) e agli altri come notizia della lega, una volta sola', async () => {
    const db = dbFinto({ users: UTENTI, players: giocatori, pushTokens: TOKEN });
    const m = messagingFinto();
    const giro = seasons => N.notificaBadge({ db, messaging: m, seasons, players: giocatori, utenti: UTENTI });
    const prima = await giro(stagioni(11));                                      // 11 vittorie di fila: nessuna serie ancora
    assert.equal(prima.iniziale, true);
    assert.equal(m.inviati.length, 0);
    assert.equal(posta(db, 'u1').length + posta(db, 'u2').length + posta(db, 'u3').length, 0, 'niente notifiche alla prima volta');
    assert.ok(db.albero.badgeVisti, 'la situazione è salvata');
    const dopo = await giro(stagioni(12));                                       // la dodicesima: Win Streak bronzo per Didi
    assert.equal(dopo.nuovi > 0, true);
    const didi = posta(db, 'u1');
    assert.equal(didi.length, 1);
    assert.equal(didi[0].tipo, 'badge');
    assert.equal(didi[0].lega, false);
    assert.match(didi[0].testo, /Win Streak · Bronze/);
    assert.equal(m.inviati.length, 1, 'push solo a Didi (Ada ha i token ma non è la sua notizia)');
    assert.deepEqual(m.inviati[0].tokens, ['tok-didi']);
    for (const uid of ['u2', 'u3']) {
        const v = posta(db, uid);
        assert.equal(v.length, 1, uid);
        assert.equal(v[0].lega, true);
        assert.match(v[0].testo, /^Didi earned .*Win Streak · Bronze/);
    }
    const ancora = await giro(stagioni(12));
    assert.equal(ancora.nuovi, 0, 'stessi numeri: niente di nuovo');
    assert.equal(posta(db, 'u1').length, 1);
    await giro(stagioni(16));                                                    // argento
    assert.match(posta(db, 'u1')[1].testo, /Win Streak · Silver/);
});

test('notificaRiassunto: il lunedì a ognuno il suo (con le sue vittorie), una volta per settimana; chi ha spento il riassunto ha solo la posta; senza partite niente', async () => {
    const seasons = stagioni(5);
    const lunedi = Date.UTC(2026, 2, 9, 9, 0);                                   // lunedì 9 marzo 10:00 a Roma: si riassume la settimana 2-8 marzo
    const db = dbFinto({ users: UTENTI, pushTokens: TOKEN, notifiche: { u3: { preferenze: { digest: 'off' } } } });
    const m = messagingFinto();
    const r = await N.notificaRiassunto({ db, messaging: m, seasons, utenti: UTENTI, adesso: lunedi });
    assert.equal(r.inviati, 3, 'a tutti e tre (la posta)');
    assert.deepEqual(posta(db, 'u1').map(x => x.tipo), ['digest']);
    assert.match(posta(db, 'u1')[0].testo, /^You: 4 wins, 0 losses · 4 matches played last week/);
    assert.match(posta(db, 'u2')[0].testo, /^You: 0 wins, 4 losses/);
    assert.doesNotMatch(posta(db, 'u3')[0].testo, /^You:/);
    assert.equal(m.inviati.length, 1, 'push solo a Didi: Lu non ha i token, Ada ha spento il riassunto');
    assert.deepEqual(m.inviati[0].tokens, ['tok-didi']);
    const bis = await N.notificaRiassunto({ db, messaging: m, seasons, utenti: UTENTI, adesso: lunedi + 3600000 });
    assert.equal(bis.inviati, 0, 'una volta per settimana');
    assert.equal(posta(db, 'u1').length, 1);
    assert.equal((await N.notificaRiassunto({ db: dbFinto({ users: UTENTI }), messaging: m, seasons, utenti: UTENTI, adesso: Date.UTC(2026, 2, 10, 9) })).inviati, 0, 'martedì no');
    assert.equal((await N.notificaRiassunto({ db: dbFinto({ users: UTENTI }), messaging: m, seasons: stagioni(0), utenti: UTENTI, adesso: lunedi })).inviati, 0, 'senza partite niente');
});

test('cablaggio: il checker chiama le novità a ogni giro e il piè del campanello ha l\'interruttore del riassunto', () => {
    const checker = leggi('.github', 'workflows', 'checker.js');
    assert.match(checker, /const novita = require\('\.\/novita\.js'\);/);
    assert.match(checker, /await novita\.eseguiNovita\(\{ db, messaging: getMessaging\(\), seasons/);
    const sfide = leggi('docs', 'sfide.js');
    assert.match(sfide, /notifiche\/\$\{P\.uid\}\/preferenze/);
    assert.match(sfide, /notifiche\/\$\{S\.utente\.uid\}\/preferenze\/digest`\)\.set\(spento \? null : 'off'\)/);
    assert.match(leggi('.github', 'workflows', 'check-deadline.yml'), /node \.github\/workflows\/checker\.js/);
    assert.equal(P.testo('digest', { settimana: '2026-W44' }).tag, 'digest-2026-W44');
});
