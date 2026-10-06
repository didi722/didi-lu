'use strict';
// La fine della stagione (risultati-match.js): la stagione si chiude quando OGNI giocatore ha giocato TUTTI gli showdown contro TUTTI gli altri,
// nello stesso istante in cui si salva l'ultimo match: stato "closed", classifica con anche quell'ultimo match, vincitore e profili.
// Il file è uno script del sito (funzioni globali che usano `db`): lo si carica in un contesto isolato con un database finto in memoria.
// Qui anche il sistema di punti (match al meglio dei 3 set: 2 punti la vittoria, 1 la sconfitta 1-2, +1 per lo showdown vinto).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const leggi = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const copia = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// ---------- un Realtime Database finto, in memoria ----------
function creaDb(iniziale = {}) {
    const dati = copia(iniziale);
    const chiavi = p => String(p).split('/').filter(Boolean);
    const leggiNodo = p => {
        let n = dati;
        for (const k of chiavi(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
        return n === undefined ? null : n;
    };
    const vuoto = v => v && typeof v === 'object' && !Object.keys(v).length;
    const pota = (nodo, ks) => {
        if (!ks.length || nodo == null || typeof nodo !== 'object') return;
        pota(nodo[ks[0]], ks.slice(1));
        if (vuoto(nodo[ks[0]])) delete nodo[ks[0]];
    };
    const scrivi = (p, v) => {
        const ks = chiavi(p);
        if (v === null || v === undefined) {
            let n = dati;
            for (const k of ks.slice(0, -1)) { if (n == null || typeof n !== 'object') return; n = n[k]; }
            if (n && typeof n === 'object') delete n[ks[ks.length - 1]];
            pota(dati, ks);
            return;
        }
        let n = dati;
        for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
        n[ks[ks.length - 1]] = copia(v);
    };
    const istantanea = p => { const v = copia(leggiNodo(p)); return { val: () => v, exists: () => v !== null, key: chiavi(p).pop() }; };
    const ref = p => ({
        child: c => ref(`${p}/${c}`),
        once: async () => istantanea(p),
        set: async v => scrivi(p, v),
        remove: async () => scrivi(p, null),
        update: async oggetto => { for (const [k, v] of Object.entries(oggetto)) scrivi(`${p}/${k}`, v); },
        transaction: async fn => {
            const nuovo = fn(copia(leggiNodo(p)));
            if (nuovo === undefined) return { committed: false, snapshot: istantanea(p) };
            scrivi(p, nuovo);
            return { committed: true, snapshot: istantanea(p) };
        }
    });
    return { ref, leggi: p => copia(leggiNodo(p)), tutto: () => copia(dati) };
}

function caricaSito(db, file = 'docs/risultati-match.js') {
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: () => { throw new Error('rete non permessa'); }, db });
    vm.runInContext(leggi(file), contesto, { filename: file });
    return contesto;
}

// ---------- una stagione di prova ----------
const ora = () => new Date().toISOString();
const sd = (a, b, categoria, matches = 3, extra = {}) => ({
    info: { player1: a, player1Id: a.toLowerCase(), player2: b, player2Id: b.toLowerCase(), categoria, data: '10/10/2026', status: 'playing', ...extra },
    matches: Object.fromEntries(Array.from({ length: matches }, (_, i) => [`match${i + 1}`, { p1score: 2, p2score: 1, winnerId: a.toLowerCase() }]))
});
const teams = (formati, giocatori) => Object.fromEntries(formati.map(f => [f, Object.fromEntries(giocatori.map(g => [g.toLowerCase(), { count: 1, datiTeams: { t1: { nome: 'Team' } } }]))]));
function stagione({ giocatori = ['Didi', 'Lu'], formati = ['OU'], perFormato = 1, stato = 'playing', showdowns = {}, extraInfo = {} } = {}) {
    return {
        info: { name: 'Stagione di prova', status: stato, showdowns_per_format: perFormato, selected_formats: formati, best_of: 3, ...extraInfo },
        iscritti: Object.fromEntries(giocatori.map(g => [g, { name: g }])),
        teams_iscritti: teams(formati, giocatori),
        showdowns
    };
}

// ---------- 1. quanto manca alla fine ----------
test('avanzamentoStagione: due giocatori, un formato, uno showdown: completa solo quando i 3 match sono salvati', () => {
    const { avanzamentoStagione } = caricaSito(creaDb());
    const s = stagione();
    assert.equal(avanzamentoStagione(s.info, s.iscritti, {}, s.teams_iscritti).completa, false);
    const due = avanzamentoStagione(s.info, s.iscritti, { d1: sd('Didi', 'Lu', 'OU', 2) }, s.teams_iscritti);
    assert.equal(due.completa, false, 'con 2 match su 3 lo showdown non è finito');
    assert.deepEqual(copia(due.mancanti), [{ a: 'didi', b: 'lu', formato: 'OU', mancano: 1 }]);
    const tre = avanzamentoStagione(s.info, s.iscritti, { d1: sd('Didi', 'Lu', 'OU', 3) }, s.teams_iscritti);
    assert.equal(tre.completa, true);
    assert.equal(tre.richiesti, 1);
    assert.equal(tre.giocati, 1);
});

test('avanzamentoStagione: richiesti = coppie × formati × showdown per formato; contano solo gli showdown della coppia e del formato giusto', () => {
    const { avanzamentoStagione } = caricaSito(creaDb());
    const s = stagione({ giocatori: ['Didi', 'Lu', 'Mo'], formati: ['OU', 'UU'], perFormato: 2 });
    const vuoto = avanzamentoStagione(s.info, s.iscritti, {}, s.teams_iscritti);
    assert.equal(vuoto.richiesti, 3 * 2 * 2, '3 coppie, 2 formati, 2 showdown ciascuno');
    assert.equal(vuoto.giocati, 0);

    // tutti giocati, anche con il giocatore scritto in modo diverso (maiuscole) e i due lati scambiati
    const sds = {};
    let n = 0;
    for (const [a, b] of [['Didi', 'Lu'], ['Didi', 'Mo'], ['Lu', 'Mo']]) {
        for (const f of ['OU', 'UU']) for (let k = 0; k < 2; k++) sds[`s${n++}`] = k ? sd(b.toUpperCase(), a, f.toLowerCase()) : sd(a, b, f);
    }
    const pieno = avanzamentoStagione(s.info, s.iscritti, sds, s.teams_iscritti);
    assert.equal(pieno.completa, true);
    assert.equal(pieno.giocati, 12);

    // ne manca uno solo: non è completa e dice quale
    delete sds.s11;
    const quasi = avanzamentoStagione(s.info, s.iscritti, sds, s.teams_iscritti);
    assert.equal(quasi.completa, false);
    assert.deepEqual(copia(quasi.mancanti), [{ a: 'lu', b: 'mo', formato: 'UU', mancano: 1 }]);
});

test('avanzamentoStagione: showdown in più non compensano quelli che mancano; "isCompleted" basta; senza regole la stagione non si chiude da sola', () => {
    const { avanzamentoStagione } = caricaSito(creaDb());
    const s = stagione({ giocatori: ['Didi', 'Lu', 'Mo'] });
    // Didi-Lu giocato 3 volte, ma Didi-Mo e Lu-Mo mai
    const sds = { a: sd('Didi', 'Lu', 'OU'), b: sd('Didi', 'Lu', 'OU'), c: sd('Lu', 'Didi', 'OU') };
    const r = avanzamentoStagione(s.info, s.iscritti, sds, s.teams_iscritti);
    assert.equal(r.completa, false);
    assert.equal(r.giocati, 1);
    assert.equal(r.mancanti.length, 2);

    const conFlag = avanzamentoStagione(s.info, stagione().iscritti, { a: sd('Didi', 'Lu', 'OU', 1, { isCompleted: true }) }, s.teams_iscritti);
    assert.equal(conFlag.completa, true, 'uno showdown segnato come completato conta');

    const senzaRegole = avanzamentoStagione({ ...s.info, showdowns_per_format: 0 }, stagione().iscritti, { a: sd('Didi', 'Lu', 'OU') }, s.teams_iscritti);
    assert.equal(senzaRegole.completa, false);
    assert.equal(avanzamentoStagione(s.info, { Didi: {} }, {}, null).completa, false, 'un giocatore solo non fa una stagione');
});

test('avanzamentoStagione: due giocatori senza team nello stesso formato non possono giocarlo, quella coppia non è richiesta', () => {
    const { avanzamentoStagione } = caricaSito(creaDb());
    const s = stagione({ giocatori: ['Didi', 'Lu'], formati: ['OU', 'UU'] });
    delete s.teams_iscritti.UU.lu;                      // Lu non ha iscritto nessun team in UU
    const r = avanzamentoStagione(s.info, s.iscritti, { a: sd('Didi', 'Lu', 'OU') }, s.teams_iscritti);
    assert.equal(r.richiesti, 1);
    assert.equal(r.completa, true);
});

// ---------- 2. la chiusura vera, a ogni match salvato ----------
const matchDa = (s1, s2, n, sdId = 'sd1', extra = {}) => ({
    stagione: 'st1', showdownId: sdId, matchNum: n, player1: 'Didi', player2: 'Lu', team1: 'Team A', team2: 'Team B',
    score: `${s1}-${s2}`, data: '10/10/2026', categoria: 'OU', replays: {}, ...extra
});
const giocatoriDb = () => ({ didi: { stats: {} }, lu: { stats: {} } });
// gli showdown nascono "aperti" (solo le info: chi, formato, data); i match si aggiungono man mano
const showdownAperti = () => Object.fromEntries(['sd1', 'sd2'].map(id => [id, { info: sd('Didi', 'Lu', 'OU', 0).info }]));
const dbStagione = (s = stagione(), extra = {}) => creaDb({ seasons: { st1: { ...s, showdowns: Object.keys(s.showdowns).length ? s.showdowns : showdownAperti() } }, players: giocatoriDb(), ...extra });

test('l\'ultimo match dell\'ultimo showdown chiude la stagione: closed, classifica con quel match, vincitore e profili', async () => {
    const db = dbStagione();
    const sito = caricaSito(db);

    let esito = await sito.registraRisultatoMatch(matchDa(2, 1, 1));
    assert.equal(esito.stagioneChiusa, false);
    esito = await sito.registraRisultatoMatch(matchDa(1, 2, 2));
    assert.equal(esito.stagioneChiusa, false);
    assert.equal(db.leggi('seasons/st1/info/status'), 'playing', 'con 2 match su 3 la stagione è ancora in corso');

    esito = await sito.registraRisultatoMatch(matchDa(3, 0, 3));
    assert.equal(esito.stagioneChiusa, true);
    assert.equal(esito.vincitoreStagione, 'didi');
    assert.equal(esito.totalDays, 1);

    const info = db.leggi('seasons/st1/info');
    assert.equal(info.status, 'closed');
    assert.equal(info.winner, 'didi');
    assert.equal(info.chiusuraAutomatica, true);

    // la classifica comprende anche l'ultimo match (Didi: 2 + 1 + 2 + 1 bonus showdown; Lu: 1 + 2 + 0)
    const lb = db.leggi('seasons/st1/leaderboard');
    assert.equal(lb.didi.points, 6);
    assert.equal(lb.lu.points, 3);
    assert.equal(lb.didi.sdWon, 1);
    assert.equal(lb.lu.sdLost, 1);

    // profili: stagione vinta e storico
    assert.equal(db.leggi('players/didi/stats/seasons/won'), 1);
    assert.equal(db.leggi('players/lu/stats/seasons/won'), null);
    assert.equal(db.leggi('players/didi/stats/seasons/history/st1/rank'), 1);
    assert.equal(db.leggi('players/lu/stats/seasons/history/st1/rank'), 2);
    assert.equal(db.leggi('players/didi/stats/seasons/history/st1/name'), 'Stagione di prova');
});

test('uno showdown vecchio senza giocatori nelle info conta lo stesso: i giocatori e il formato si leggono dai suoi match', () => {
    const { avanzamentoStagione } = caricaSito(creaDb());
    const s = stagione();
    const vecchio = { matches: Object.fromEntries([1, 2, 3].map(n => [`match${n}`, { player1Id: 'didi', player2Id: 'lu', categoria: 'OU', p1score: 2, p2score: 1 }])) };
    assert.equal(avanzamentoStagione(s.info, s.iscritti, { d1: vecchio }, s.teams_iscritti).completa, true);
});

test('la stagione non si chiude più "da sola" a metà: con uno showdown ancora da giocare resta in corso, e chiude quando arriva l\'ultimo', async () => {
    const db = dbStagione(stagione({ perFormato: 2 }));
    const sito = caricaSito(db);
    for (const n of [1, 2, 3]) await sito.registraRisultatoMatch(matchDa(2, 1, n, 'sd1'));
    assert.equal(db.leggi('seasons/st1/info/status'), 'playing', 'il primo showdown è finito, ma ne manca un altro');
    assert.equal(db.leggi('seasons/st1/info/winner'), null);
    // lo showdown appena concluso è già in classifica
    assert.equal(db.leggi('seasons/st1/leaderboard/didi/sdWon'), 1);

    await sito.registraRisultatoMatch(matchDa(2, 1, 1, 'sd2'));
    await sito.registraRisultatoMatch(matchDa(2, 1, 2, 'sd2'));
    assert.equal(db.leggi('seasons/st1/info/status'), 'playing');
    const fine = await sito.registraRisultatoMatch(matchDa(0, 3, 3, 'sd2'));
    assert.equal(fine.stagioneChiusa, true);
    assert.equal(db.leggi('seasons/st1/info/status'), 'closed');
});

test('una stagione "open" (iscrizioni ancora aperte) non si chiude; scaduta l\'iscrizione sì', async () => {
    const aperta = dbStagione(stagione({ stato: 'open', extraInfo: { deadline: '2999-01-01T00:00' } }));
    const sitoAperto = caricaSito(aperta);
    for (const n of [1, 2, 3]) await sitoAperto.registraRisultatoMatch(matchDa(2, 1, n));
    assert.equal(aperta.leggi('seasons/st1/info/status'), 'open');

    const scaduta = dbStagione(stagione({ stato: 'open', extraInfo: { deadline: '2020-01-01T00:00' } }));
    const sitoScaduto = caricaSito(scaduta);
    for (const n of [1, 2, 3]) await sitoScaduto.registraRisultatoMatch(matchDa(2, 1, n));
    assert.equal(scaduta.leggi('seasons/st1/info/status'), 'closed');
});

test('la stagione di prova "sbeta" non si chiude mai da sola', async () => {
    const db = creaDb({ seasons: { sbeta: stagione() }, players: giocatoriDb() });
    const sito = caricaSito(db);
    for (const n of [1, 2, 3]) await sito.registraRisultatoMatch({ ...matchDa(2, 1, n), stagione: 'sbeta' });
    assert.equal(db.leggi('seasons/sbeta/info/status'), 'playing');
    assert.equal((await sito.chiudiStagioneSeCompleta('sbeta')).stagioneChiusa, false);
});

test('chiudere due volte non conta due stagioni vinte (due match salvati insieme, o il controllo del server dopo il sito)', async () => {
    const db = dbStagione();
    const sito = caricaSito(db);
    for (const n of [1, 2, 3]) await sito.registraRisultatoMatch(matchDa(2, 1, n));
    assert.equal(db.leggi('players/didi/stats/seasons/won'), 1);
    const ancora = await sito.chiudiStagioneSeCompleta('st1');
    assert.equal(ancora.stagioneChiusa, false, 'è già closed: niente da fare');
    // anche rifare vincitore e classifica a mano non cambia il contatore
    await sito.aggiornaLeaderboard('st1');
    await sito.salvaVincitoreStagione('st1');
    await sito.salvaVincitoreStagione('st1');
    assert.equal(db.leggi('players/didi/stats/seasons/won'), 1);
});

test('il vincitore è chi ha più punti, poi più match vinti, poi più set vinti; se cambia la classifica cambia chi ha vinto la stagione', async () => {
    const db = creaDb({
        seasons: { st1: { ...stagione({ stato: 'closed' }), leaderboard: {
            didi: { points: 6, won: 2, setW: 5 }, lu: { points: 6, won: 2, setW: 4 }, mo: { points: 6, won: 1, setW: 9 }
        } } },
        players: { didi: {}, lu: {}, mo: {} }
    });
    const sito = caricaSito(db);
    assert.equal(await sito.salvaVincitoreStagione('st1'), 'didi', 'pari punti e match: contano i set');
    assert.equal(db.leggi('players/didi/stats/seasons/won'), 1);

    db.ref('seasons/st1/leaderboard/lu').update({ setW: 8 });
    assert.equal(await sito.salvaVincitoreStagione('st1'), 'lu');
    assert.equal(db.leggi('players/didi/stats/seasons/won'), 0, 'a Didi la stagione vinta viene tolta');
    assert.equal(db.leggi('players/lu/stats/seasons/won'), 1);
    assert.equal(db.leggi('players/didi/stats/seasons/history/st1/rank'), 2);
});

test('una stagione senza punti non ha un vincitore: "Nessun Vincitore" e nessuna stagione vinta', async () => {
    const db = creaDb({ seasons: { st1: { ...stagione({ stato: 'closed' }), leaderboard: { didi: { points: 0 }, lu: { points: 0 } } } }, players: { didi: {}, lu: {} } });
    const sito = caricaSito(db);
    assert.equal(await sito.salvaVincitoreStagione('st1'), 'Nessun Vincitore');
    assert.equal(db.leggi('players/didi/stats/seasons/won'), null);
});

// ---------- 3. riaprire ----------
test('togliere uno showdown a una stagione chiusa da sola la riapre ("playing", senza vincitore né storico); una chiusa a mano no', async () => {
    const db = dbStagione();
    const sito = caricaSito(db);
    for (const n of [1, 2, 3]) await sito.registraRisultatoMatch(matchDa(2, 1, n));
    assert.equal(db.leggi('seasons/st1/info/status'), 'closed');

    await db.ref('seasons/st1/showdowns/sd1/matches/match3').remove();
    assert.equal(await sito.riapriStagioneSeIncompleta('st1'), true);
    const info = db.leggi('seasons/st1/info');
    assert.equal(info.status, 'playing');
    assert.equal(info.winner, undefined);
    assert.equal(info.chiusuraAutomatica, undefined);
    assert.equal(db.leggi('players/didi/stats/seasons/won'), 0);
    assert.equal(db.leggi('players/didi/stats/seasons/history'), null);

    // chiusa a mano dall'amministratore (senza "chiusuraAutomatica"): non si tocca
    const manuale = dbStagione(stagione({ stato: 'closed' }));
    assert.equal(await caricaSito(manuale).riapriStagioneSeIncompleta('st1'), false);
    assert.equal(manuale.leggi('seasons/st1/info/status'), 'closed');
});

test('una stagione ancora completa non si riapre', async () => {
    const db = dbStagione();
    const sito = caricaSito(db);
    for (const n of [1, 2, 3]) await sito.registraRisultatoMatch(matchDa(2, 1, n));
    assert.equal(await sito.riapriStagioneSeIncompleta('st1'), false);
    assert.equal(db.leggi('seasons/st1/info/status'), 'closed');
});

// ---------- 4. punti ----------
test('punti di un match al meglio dei 3 set: 2 per la vittoria (3-0 o 2-1), 1 per la sconfitta 1-2, 0 per 0-3', () => {
    const { calcolaPuntiMatch } = caricaSito(creaDb());
    assert.equal(calcolaPuntiMatch(3, true), 2);
    assert.equal(calcolaPuntiMatch(2, true), 2);
    assert.equal(calcolaPuntiMatch(1, true), 1);
    assert.equal(calcolaPuntiMatch(0, true), 0);
    // al meglio dei 5: 5-0 → 3, 3-x → 2, 2 set → 1
    assert.equal(calcolaPuntiMatch(5, false), 3);
    assert.equal(calcolaPuntiMatch(4, false), 2);
    assert.equal(calcolaPuntiMatch(3, false), 2);
    assert.equal(calcolaPuntiMatch(2, false), 1);
    assert.equal(calcolaPuntiMatch(1, false), 0);
});

test('punti nella classifica: ogni match vale i suoi punti e chi vince lo showdown (serie di 3 match) ne ha 1 in più', async () => {
    const db = dbStagione(stagione({ perFormato: 2 }));
    const sito = caricaSito(db);
    // showdown: Didi vince 2-1, Lu vince 2-1 (Didi 1 punto), Didi vince 3-0 → Didi vince la serie 2-1
    await sito.registraRisultatoMatch(matchDa(2, 1, 1));
    await sito.registraRisultatoMatch(matchDa(1, 2, 2));
    await sito.registraRisultatoMatch(matchDa(3, 0, 3));
    const lb = db.leggi('seasons/st1/leaderboard');
    assert.equal(lb.didi.points, 2 + 1 + 2 + 1);
    assert.equal(lb.lu.points, 1 + 2 + 0);
    assert.equal(lb.didi.won, 2);
    assert.equal(lb.lu.won, 1);
    assert.equal(db.leggi('seasons/st1/showdowns/sd1/info/vincitoreShowdown'), 'didi');

    // il tutto si può rifare da zero con lo stesso risultato
    await sito.aggiornaLeaderboard('st1');
    assert.deepEqual(db.leggi('seasons/st1/leaderboard/didi/points'), 6);
});

// ---------- 5. collegamenti ----------
test('le due copie di risultati-match.js sono identiche; il server, l\'amministrazione e il controllo di GitHub usano la stessa logica', () => {
    assert.equal(leggi('docs/risultati-match.js'), leggi('functions/risultati-match.js'));
    const checker = leggi('.github/workflows/checker.js');
    assert.match(checker, /functions', 'risultati-match\.js'/, 'il controllo di GitHub carica la logica del server');
    assert.match(checker, /sito\.chiudiStagioneSeCompleta\(id\)/);
    assert.match(checker, /sito\.salvaVincitoreStagione\(id\)/);
    assert.doesNotMatch(checker, /total_days/);

    const admin = leggi('docs/admin.html');
    assert.match(admin, /await salvaVincitoreStagione\(idStagione\)/);
    assert.doesNotMatch(admin, /async function salvaVincitoreStagione/, 'una sola funzione per il vincitore: quella condivisa');
    assert.match(admin, /ricalcolaVincitoreStagione\(/, 'un tasto per rifare classifica e vincitore di una stagione già chiusa');

    const matches = leggi('docs/matches.html');
    assert.equal((matches.match(/riapriStagioneSeIncompleta\(stagione\)/g) || []).length, 2, 'eliminando uno showdown o un match');
    assert.doesNotMatch(matches + leggi('docs/hub.html') + leggi('docs/index.html'), /info\.total_days|stagioneInfo\.total_days/);
    assert.doesNotMatch(leggi('docs/index.html'), /status = ["']closed["']/, 'la home non dichiara "closed" contando gli showdown');
});
