'use strict';
// Il match della settimana (docs/match-settimana.js): quale set sceglie, le settimane da lunedì a domenica, il banner della home con le frecce e i collegamenti in index.html e matches.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../docs/match-settimana.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

// ---------- dati finti ----------
const pk = (specie, o = {}) => ({ specie, nome: '', portato: true, sceso: true, titolare: false, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o });
const lato = (nome, pokemon) => ({ nome, pokemon, portati: pokemon.filter(p => p.portato).length, svenuti: pokemon.filter(p => p.svenuto).length, azioni: {} });

/** Una passeggiata: vince p1 senza perdere nessuno, in 5 turni */
const passeggiata = () => ({
    v: 3, turni: 5, vincitore: 'p1',
    p1: lato('Ada', [pk('A1', { koFatti: 2 }), pk('A2', { koFatti: 2 }), pk('A3'), pk('A4')]),
    p2: lato('Bea', [pk('B1', { svenuto: true, turnoKo: 2 }), pk('B2', { svenuto: true, turnoKo: 3 }), pk('B3', { svenuto: true, turnoKo: 4 }), pk('B4', { svenuto: true, turnoKo: 5 })])
});
/** Una rimonta: p1 resta sotto 1 contro 4, poi il suo ultimo Pokémon manda KO tutti e quattro (16 turni) */
const rimonta = () => ({
    v: 3, turni: 16, vincitore: 'p1',
    p1: lato('Ada', [pk('A1', { svenuto: true, turnoKo: 3 }), pk('A2', { svenuto: true, turnoKo: 4 }), pk('A3', { svenuto: true, turnoKo: 5 }), pk('Ultimo', { ultimo: true, koFatti: 4 })]),
    p2: lato('Bea', [pk('B1', { svenuto: true, turnoKo: 9 }), pk('B2', { svenuto: true, turnoKo: 11 }), pk('B3', { svenuto: true, turnoKo: 13 }), pk('B4', { svenuto: true, turnoKo: 16 })])
});

const match = (data, setStats, o = {}) => ({
    categoria: 'OU', data, p1score: 2, p2score: 1, player1: 'Ada', player1Id: 'ada', player2: 'Bea', player2Id: 'bea', team1: 'Team Uno', team2: 'Team Due',
    p1EloAtMatch: 1000, p2EloAtMatch: 1000, setStats,
    replays: Object.fromEntries(Object.keys(setStats).map(k => [k, { url: `https://x.test/${k}.html`, vincitore: '1' }])), ...o
});
const stagioni = (matches, id = 's0') => ({ [id]: { info: { name: 'Stagione' }, showdowns: { sd1: { info: { data: '2026-10-20' }, matches } } } });
const OGGI = new Date(2026, 9, 30, 12).getTime();        // venerdì 30 ottobre 2026 (ora locale: le settimane si contano nel fuso di chi guarda)
const ora = (a, m, g, h = 12) => new Date(a, m - 1, g, h).getTime();

// ---------- il punteggio ----------
test('analizzaSet: una rimonta vinta con un solo Pokémon vale molto più di una passeggiata', () => {
    const bello = M.analizzaSet(rimonta());
    const brutto = M.analizzaSet(passeggiata());
    assert.ok(bello.punteggio > brutto.punteggio + 80, `${bello.punteggio} contro ${brutto.punteggio}`);
    assert.equal(bello.rimasti, 1);
    assert.equal(bello.maxSvantaggio, 3, 'è arrivato a essere sotto di 3 Pokémon (1 contro 4)');
    assert.equal(brutto.rimasti, 4);
    assert.equal(brutto.maxSvantaggio, 0);
    assert.deepEqual(bello.motivi, ['Came back from 3 down', 'Won with 1 Pokémon left', 'Ultimo took 4 KOs']);
    assert.deepEqual(brutto.motivi, []);
    assert.equal(bello.protagonista.specie, 'Ultimo');
    assert.equal(bello.protagonista.ultimo, true);
    assert.equal(brutto.protagonista.specie, 'A1', 'senza ultimo in piedi: chi ha fatto più KO');
});

test('analizzaSet: i KO nello stesso turno contano insieme; più di una sorpresa di Elo e un match stretto fanno salire il punteggio', () => {
    const base = M.analizzaSet(rimonta()).punteggio;
    const sorpresa = M.analizzaSet(rimonta(), { scartoElo: 120 });
    assert.equal(sorpresa.punteggio, Math.round((base + 12) * 10) / 10, 'un punto ogni 8 di scarto, al massimo 12');
    assert.equal(M.analizzaSet(rimonta(), { matchStretto: true }).punteggio, Math.round((base + 6) * 10) / 10);
    assert.ok(M.analizzaSet(rimonta(), { scartoElo: -50 }).punteggio === base, 'se ha vinto chi aveva più Elo non conta');
    // due Pokémon di p1 vanno KO nello stesso turno: sotto di 2, non di 1 e poi di 2
    const doppio = rimonta();
    doppio.p1.pokemon[0].turnoKo = 3; doppio.p1.pokemon[1].turnoKo = 3; doppio.p1.pokemon[2].turnoKo = 3;
    assert.equal(M.analizzaSet(doppio).maxSvantaggio, 3);
});

test('analizzaSet: un log incompleto non si può valutare', () => {
    assert.equal(M.analizzaSet(null), null);
    assert.equal(M.analizzaSet({ ...rimonta(), vincitore: '' }), null);
    const senzaPortati = rimonta(); senzaPortati.p2.portati = 0;
    assert.equal(M.analizzaSet(senzaPortati), null);
});

test('analizzaSet: se cadono tutti i Pokémon di entrambi vince chi cade per ultimo (nessun Pokémon rimasto): ancora più bello', () => {
    const ultimoKo = rimonta();
    ultimoKo.p1.pokemon[3] = pk('Ultimo', { ultimo: true, koFatti: 4, svenuto: true, turnoKo: 17 });
    ultimoKo.p1.svenuti = 4;
    const r = M.analizzaSet(ultimoKo);
    assert.equal(r.rimasti, 0);
    assert.ok(r.motivi.includes('Decided by the very last KO'));
    assert.ok(r.punteggio > M.analizzaSet(rimonta()).punteggio - 1);
});


// ---------- le settimane (da lunedì a domenica) ----------
const lun = (a, m, g) => Date.UTC(a, m - 1, g, 12);        // un giorno come lo conta il modulo: mezzogiorno UTC

test('lunediDi: la settimana va da lunedì a domenica (non gli ultimi 7 giorni)', () => {
    const l = M.lunediDi;
    assert.equal(l(lun(2026, 10, 26)), lun(2026, 10, 26), 'un lunedì è il lunedì di sé stesso');
    assert.equal(l(lun(2026, 10, 28)), lun(2026, 10, 26), 'mercoledì');
    assert.equal(l(lun(2026, 11, 1)), lun(2026, 10, 26), 'la domenica è l\'ultimo giorno della settimana, non il primo');
    assert.equal(l(lun(2026, 11, 2)), lun(2026, 11, 2), 'il lunedì dopo comincia un\'altra settimana');
    assert.equal(l(lun(2027, 1, 1)), lun(2026, 12, 28), 'a cavallo d\'anno');
    assert.equal(l(lun(2026, 3, 1)), lun(2026, 2, 23), 'a cavallo di mese (1 marzo 2026 è una domenica)');
});

test('numeroSettimana / etichettaSettimana: il numero ISO, le date e "This week" / "Last week"', () => {
    assert.deepEqual(M.numeroSettimana(lun(2026, 10, 26)), { numero: 44, anno: 2026 });
    assert.deepEqual(M.numeroSettimana(lun(2025, 12, 29)), { numero: 1, anno: 2026 }, 'la settimana del primo giovedì dell\'anno');
    assert.deepEqual(M.numeroSettimana(lun(2026, 12, 28)), { numero: 53, anno: 2026 });
    const w = (a, m, g) => ({ inizio: lun(a, m, g), fine: lun(a, m, g) + 6 * 86400000, numero: M.numeroSettimana(lun(a, m, g)).numero });
    const adesso = ora(2026, 11, 2, 9);                                                                 // lunedì 2 novembre
    assert.deepEqual(M.etichettaSettimana(w(2026, 11, 2), adesso), { titolo: 'This week', intervallo: '2–8 Nov' });
    assert.deepEqual(M.etichettaSettimana(w(2026, 10, 26), adesso), { titolo: 'Last week', intervallo: '26 Oct – 1 Nov' }, 'a cavallo di mese le date hanno il mese due volte');
    assert.deepEqual(M.etichettaSettimana(w(2026, 10, 19), adesso), { titolo: 'Week 43', intervallo: '19–25 Oct' });
    assert.equal(M.etichettaSettimana(w(2026, 10, 26), ora(2026, 11, 1, 22)).titolo, 'This week', 'la domenica sera è ancora questa settimana');
});

test('spostamento: si passa alla settimana accanto e non si esce dall\'elenco', () => {
    assert.equal(M.spostamento(1, -1, 3), 0);
    assert.equal(M.spostamento(1, 1, 3), 2);
    assert.equal(M.spostamento(0, -1, 3), 0, 'la più vecchia è in fondo');
    assert.equal(M.spostamento(2, 1, 3), 2, 'la più nuova è in cima');
    assert.equal(M.spostamento(0, 5, 3), 2);
    assert.equal(M.spostamento(0, 1, 0), 0);
});

test('settimane: da lunedì a domenica, dalla più vecchia alla più nuova, ognuna con il suo set più bello', () => {
    const seasons = stagioni({
        a: match('2026-10-19', { set1: passeggiata() }),                       // lunedì della settimana 43
        b: match('2026-10-25', { set1: rimonta() }),                           // domenica della 43: il più bello
        c: match('2026-10-26', { set1: passeggiata(), set2: passeggiata() })   // lunedì della 44: è un'altra settimana
    });
    const { elenco, indice } = M.settimane(seasons, { adesso: OGGI });
    assert.equal(elenco.length, 2);
    assert.equal(indice, 1, 'si apre sull\'ultima');
    const [w43, w44] = elenco;
    assert.equal(w43.numero, 43);
    assert.equal(w43.quanti, 2);
    assert.equal(w43.scelto.match, 'b');
    assert.equal(w43.corrente, false);
    assert.equal(w44.numero, 44);
    assert.equal(w44.quanti, 2);
    assert.equal(w44.corrente, true);
    assert.equal(w43.fine - w43.inizio, 6 * 86400000, 'sette giorni');
    assert.equal(new Date(w43.inizio).getUTCDay(), 1, 'comincia di lunedì');
    assert.equal(new Date(w43.fine).getUTCDay(), 0, 'finisce di domenica');
});

test('settimane: una domenica e il lunedì dopo stanno in settimane diverse, anche a un giorno di distanza', () => {
    const seasons = stagioni({ a: match('2026-11-01', { set1: rimonta() }), b: match('2026-11-02', { set1: passeggiata() }) });
    const { elenco } = M.settimane(seasons, { adesso: ora(2026, 11, 3) });
    assert.deepEqual(elenco.map(w => [w.numero, w.scelto.match]), [[44, 'a'], [45, 'b']]);
});

test('settimane: le settimane senza set non compaiono (si scorre solo tra quelle con qualcosa da guardare)', () => {
    const seasons = stagioni({ a: match('2026-10-06', { set1: rimonta() }), b: match('2026-10-27', { set1: passeggiata() }) });
    assert.deepEqual(M.settimane(seasons, { adesso: OGGI }).elenco.map(w => w.numero), [41, 44]);
});

test('settimane: se nella settimana in corso non si è ancora giocato, si tiene quella dell\'ultima settimana giocata', () => {
    const seasons = stagioni({ a: match('2026-10-27', { set1: rimonta() }), b: match('2026-10-14', { set1: passeggiata() }) });
    const lunedi = ora(2026, 11, 2, 9);                                        // lunedì mattina: nuova settimana, ancora niente
    const { elenco, indice } = M.settimane(seasons, { adesso: lunedi });
    assert.deepEqual(elenco.map(w => w.numero), [42, 44]);
    assert.equal(elenco[indice].numero, 44, 'si apre sull\'ultima con dei set');
    assert.equal(elenco[indice].corrente, false);
    assert.deepEqual(M.etichettaSettimana(elenco[indice], lunedi), { titolo: 'Last week', intervallo: '26 Oct – 1 Nov' });
    const s = M.scegli(seasons, { adesso: lunedi });
    assert.equal(s.match, 'a');
    assert.equal(s.corrente, false);
    // dopo qualche settimana senza partite resta l'ultima giocata, ma con il suo numero ("Last week" non sarebbe vero)
    const dopo = ora(2027, 1, 5);
    const w = M.settimane(seasons, { adesso: dopo });
    assert.equal(M.etichettaSettimana(w.elenco[w.indice], dopo).titolo, 'Week 44');
    // e appena si gioca di nuovo, la nuova settimana diventa l'ultima
    const piuNuova = stagioni({ a: match('2026-10-27', { set1: rimonta() }), n: match('2026-11-03', { set1: passeggiata() }) });
    const nuova = M.settimane(piuNuova, { adesso: ora(2026, 11, 4) });
    assert.equal(nuova.elenco[nuova.indice].numero, 45);
    assert.equal(nuova.elenco[nuova.indice].corrente, true);
});

// ---------- la scelta ----------
test('scegli: il set più bello della settimana (lunedì-domenica) più recente; quelli di altre settimane non contano', () => {
    const seasons = stagioni({
        match1: match('2026-10-29', { set1: passeggiata(), set2: rimonta() }),
        match2: match('2026-10-10', { set1: rimonta() })
    });
    const s = M.scegli(seasons, { adesso: OGGI });
    assert.equal(s.match, 'match1');
    assert.equal(s.set, 'set2');
    assert.equal(s.corrente, true);
    assert.equal(s.quanti, 2, 'in gara solo i due set di questa settimana');
    assert.equal(s.numeroSet, 2);
    assert.equal(s.stagione, 's0');
    assert.equal(s.settimana.numero, 44);
    assert.equal(s.giocatori.p1.id, 'ada');
    assert.equal(s.giocatori.p2.team, 'Team Due');
    assert.match(s.replayUrl, /set2\.html$/);
});

test('scegli: la settimana è di calendario: una partita di domenica non è più "di questa settimana" il lunedì dopo', () => {
    const seasons = stagioni({ a: match('2026-11-01', { set1: rimonta() }) });                    // domenica
    assert.equal(M.scegli(seasons, { adesso: ora(2026, 11, 1, 22) }).corrente, true, 'domenica sera');
    const lunedi = M.scegli(seasons, { adesso: ora(2026, 11, 2, 8) });
    assert.equal(lunedi.corrente, false, 'lunedì mattina è la settimana scorsa');
    assert.equal(lunedi.match, 'a', 'ma è quella che si vede, finché non si gioca di nuovo');
});

test('scegli: salta la stagione beta, i set senza replay e quelli senza dati leggibili; senza niente da mostrare restituisce null', () => {
    assert.equal(M.scegli(null), null);
    assert.equal(M.scegli({}), null);
    assert.equal(M.scegli(stagioni({ match1: match('2026-10-29', { set1: rimonta() }) }, 'sbeta'), { adesso: OGGI }), null, 'la beta è di prova');
    const senzaReplay = match('2026-10-29', { set1: rimonta() }); senzaReplay.replays = { set1: { vincitore: '1' } };
    assert.equal(M.scegli(stagioni({ match1: senzaReplay }), { adesso: OGGI }), null, 'senza replay non c\'è niente da guardare');
    const rotto = match('2026-10-29', { set1: { ...rimonta(), vincitore: '' } });
    assert.equal(M.scegli(stagioni({ match1: rotto }), { adesso: OGGI }), null);
    const nonSalvato = match('2026-10-29', { set1: rimonta() }); nonSalvato.p1score = null;
    assert.equal(M.scegli(stagioni({ match1: nonSalvato }), { adesso: OGGI }), null, 'match non ancora salvato');
    const futuro = match('2027-01-01', { set1: rimonta() });
    assert.equal(M.scegli(stagioni({ match1: futuro }), { adesso: OGGI }), null, 'una data nel futuro è un errore: non si sceglie');
    assert.equal(M.settimane(stagioni({ match1: futuro }), { adesso: OGGI }).elenco.length, 0);
});

test('scegli: a parità di punteggio vince il set giocato più di recente; le date si leggono anche come GG/MM/AAAA', () => {
    const seasons = stagioni({
        match1: match('27/10/2026', { set1: rimonta() }),
        match2: match('2026-10-29', { set1: rimonta() })
    });
    assert.equal(M.scegli(seasons, { adesso: OGGI }).match, 'match2');
    assert.equal(M.giornoDi('27/10/2026'), M.giornoDi('2026-10-27'));
    assert.equal(M.giornoDi('boh'), null);
});

test('scegli: lo scarto di Elo conta dal lato di chi ha vinto (vince p2 con meno Elo = sorpresa)', () => {
    const vince2 = rimonta(); vince2.vincitore = 'p2'; [vince2.p1, vince2.p2] = [vince2.p2, vince2.p1];
    const seasons = stagioni({
        match1: match('2026-10-29', { set1: vince2 }, { p1EloAtMatch: 1100, p2EloAtMatch: 1000 }),
        match2: match('2026-10-29', { set1: rimonta() }, { p1EloAtMatch: 1100, p2EloAtMatch: 1000 })      // vince chi ha più Elo: nessuna sorpresa
    });
    const s = M.scegli(seasons, { adesso: OGGI });
    assert.equal(s.match, 'match1');
    assert.ok(s.motivi.includes('Upset: 100 less Elo'));
});

// ---------- il banner ----------
test('linkReplay: matches.html con la stagione e il set (showdown~match~set)', () => {
    const s = M.scegli(stagioni({ match1: match('2026-10-29', { set2: rimonta() }) }), { adesso: OGGI });
    assert.equal(M.linkReplay(s), 'matches.html?id=s0&replay=sd1~match1~set2&da=home', 'da=home: chiudendo il replay si torna alla home');
    assert.equal(M.linkReplay({ stagione: 's1', showdown: '-Abc_d', match: 'match3', set: 'set1' }), 'matches.html?id=s1&replay=-Abc_d~match3~set1&da=home');
});

test('html: una riga con etichetta e settimana sul bordo, i due allenatori sui loro colori, WINNER, i Pokémon KO spenti, il protagonista, il replay', () => {
    const s = M.scegli(stagioni({ match1: match('2026-10-29', { set1: rimonta() }, { team1: '<b>Uno</b>' }) }), { adesso: OGGI });
    const giocatori = { ada: { colore: '#aa00cc', avatar: 'a.png' }, bea: { colore: 'rosso', avatar: '' } };
    const settimana = { titolo: 'This week', intervallo: '26 Oct – 1 Nov' };
    const h = M.html(s, { giocatori, gif: x => `g/${x}.gif`, settimana, indice: 0, totale: 1 });
    assert.match(h, /^<span class="ms-t">MATCH OF THE WEEK<\/span><div class="ms-pager ms-solo" role="group" aria-label="Week">/);
    assert.match(h, /<span class="ms-sett"><b>This week<\/b><span>26 Oct – 1 Nov<\/span><\/span>/);
    assert.match(h, /class="ms-lato ms-l1 ms-vince" style="--c:#aa00cc" title="Ada · won"><a class="ms-av-link" href="public\.html\?player=Ada" title="Ada"><img class="ms-av" src="a\.png"/, 'chi ha vinto: colore pieno; dell\'allenatore l\'avatar');
    assert.match(h, /class="ms-lato ms-l2 ms-perde" style="--c:#d9dde6" title="Bea · lost"/, 'chi ha perso: sbiadito; un colore non valido torna al neutro');
    assert.doesNotMatch(h, /WINNER|ms-win|class="ms-vs"|>VS</, 'né il tag WINNER né la scritta VS');
    assert.doesNotMatch(h, /<b>Uno<\/b>/, 'il nome del team è protetto');
    // il tag nero porta il nome del team (protetto), non quello dell'allenatore; senza team, il nome dell'allenatore
    assert.match(h, /<a class="ms-nome-link" href="public\.html\?player=Ada" title="&lt;b&gt;Uno&lt;\/b&gt; · Ada"><b class="ms-nome">&lt;b&gt;Uno&lt;\/b&gt;<\/b><\/a>/);
    assert.match(h, /<a class="ms-nome-link" href="public\.html\?player=Bea" title="Team Due · Bea"><b class="ms-nome">Team Due<\/b><\/a>/);
    assert.doesNotMatch(h, /<b class="ms-nome">(Ada|Bea)<\/b>/);
    const senzaTeam = M.html({ ...s, giocatori: { p1: { ...s.giocatori.p1, team: '' }, p2: s.giocatori.p2 } }, { giocatori });
    assert.match(senzaTeam, /<a class="ms-nome-link" href="public\.html\?player=Ada" title="Ada"><b class="ms-nome">Ada<\/b><\/a>/);
    assert.equal((h.match(/class="ms-spr ms-ko"/g) || []).length, 3 + 4, 'i Pokémon andati KO sono spenti (3 di Ada e 4 di Bea)');
    assert.match(h, /class="ms-med" data-pkm="Ultimo"/);
    assert.match(h, /<b class="ms-banner">Ultimo<\/b><span class="ms-chip">Came back from 3 down<\/span><\/div><\/div>/, 'del protagonista si vede il motivo più importante');
    assert.equal((h.match(/class="ms-chip"/g) || []).length, 1);
    assert.match(h, /<div class="ms-prot" title="Came back from 3 down · Won with 1 Pokémon left · Ultimo took 4 KOs">/, 'tutti i motivi nel suggerimento');
    assert.match(h, /<a class="ms-replay" href="matches\.html\?id=s0&amp;replay=sd1~match1~set1&amp;da=home" title="Watch the replay" aria-label="Watch the replay">&#9654; Replay<\/a>/);
    // in mezzo: formato, VS e set; la data e il resto nel suggerimento
    assert.match(h, /<span class="ms-info" title="OU · 29 Oct · Stagione · Match 2-1"><b>OU<\/b>Set 1 · Match 1<\/span><\/div><\/div>$/, 'sotto il replay: formato e set; la data e il resto nel suggerimento');
    // il nome dell'allenatore sta in un tag, con accanto il posto per i badge del team; il Pokémon protagonista ha il suo sul medaglione
    assert.match(h, /<\/a><span class="ms-bdg" data-ms-badge="p1"><\/span><\/div>/);
    assert.match(h, /<span class="ms-bdg ms-bdg-prot" data-ms-badge="prot"><\/span><\/span><div class="ms-prot-testo">/);
    // l'allenatore di sinistra ha l'avatar a sinistra, quello di destra a destra (lo decide il CSS: .ms-l2 in riga inversa); il link porta alla pagina pubblica
    assert.match(h, /<a class="ms-av-link" href="public\.html\?player=Ada" title="Ada">/);
    // l'ordine: etichetta, settimana, poi nella riga gli allenatori, il protagonista, il replay
    const ordine = ['class="ms-t"', 'class="ms-pager', 'class="ms-corpo', 'class="ms-scontro"', 'class="ms-prot"', 'class="ms-azione"', 'class="ms-replay"'].map(x => h.indexOf(x));
    assert.deepEqual(ordine, [...ordine].sort((a, b) => a - b));
    assert.ok(ordine.every(i => i >= 0));
    assert.equal(M.html(null), '');
    // senza sprite (la pagina non li ha) il banner c'è lo stesso, e senza settimana non c'è il selettore
    const nudo = M.html(s, { giocatori });
    assert.doesNotMatch(nudo, /<img class="ms-spr|class="ms-med"/);
    assert.doesNotMatch(nudo, /ms-pager/);
    assert.match(nudo, /class="ms-chip"/);
});

test('html: con più settimane compaiono le frecce, spente in fondo e in cima; il contenuto entra dal lato giusto', () => {
    const s = M.scegli(stagioni({ match1: match('2026-10-29', { set1: rimonta() }) }), { adesso: OGGI });
    const settimana = { titolo: 'Last week', intervallo: '26 Oct – 1 Nov' };
    const frecce = h => [...h.matchAll(/<button[^>]*data-ms-vai="(-?1)"[^>]*>/g)].map(m => [m[1], /\sdisabled/.test(m[0])]);
    const media = M.html(s, { settimana, indice: 1, totale: 3 });
    assert.deepEqual(frecce(media), [['-1', false], ['1', false]]);
    assert.match(media, /<div class="ms-pager" role="group" aria-label="Week"><button type="button" class="ms-freccia ms-prec"/);
    assert.match(media, /aria-label="Previous week"/);
    assert.match(media, /aria-label="Next week"/);
    assert.ok(media.indexOf('ms-prec') < media.indexOf('class="ms-sett"') && media.indexOf('class="ms-sett"') < media.indexOf('ms-succ'), 'la settimana sta tra le due frecce');
    assert.deepEqual(frecce(M.html(s, { settimana, indice: 0, totale: 3 })), [['-1', true], ['1', false]], 'la più vecchia: niente da cui tornare');
    assert.deepEqual(frecce(M.html(s, { settimana, indice: 2, totale: 3 })), [['-1', false], ['1', true]], 'la più nuova: niente oltre');
    assert.deepEqual(frecce(M.html(s, { settimana, indice: 0, totale: 1 })), [], 'una settimana sola: niente frecce');
    assert.match(M.html(s, { settimana, indice: 1, totale: 3, animazione: 'dx' }), /class="ms-corpo ms-in-dx"/);
    assert.match(M.html(s, { settimana, indice: 1, totale: 3, animazione: 'sx' }), /class="ms-corpo ms-in-sx"/);
    assert.match(M.html(s, { settimana, indice: 1, totale: 3 }), /class="ms-corpo" aria-live="polite"/);
});

// ---------- il banner nella pagina (monta): una finestra e un contenitore finti, senza browser ----------
function radiceFinta() {
    const r = {
        scritture: 0, _html: '', eventi: {},
        get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = v; this.scritture++; },
        addEventListener(tipo, f) { this.eventi[tipo] = f; },
        querySelector() { return null; }
    };
    return r;
}
const aspetta = () => new Promise(r => setTimeout(r, 0));          // lascia finire le promesse in corso
const treSettimane = () => stagioni({
    a: match('2026-10-12', { set1: passeggiata() }),                      // settimana 42
    b: match('2026-10-20', { set1: rimonta() }),                          // 43
    c: match('2026-10-28', { set1: passeggiata() })                       // 44 (quella in corso)
});

test('monta: si apre sull\'ultima settimana; le frecce passano alle altre in ordine, fino in fondo', async () => {
    const r = radiceFinta(), letti = [];
    const b = M.monta({}, r, { leggiGiocatore: async id => { letti.push(id); return { colore: '#112233', avatar: '' }; }, adesso: () => OGGI });
    assert.equal(await b.aggiorna(M.settimane(treSettimane(), { adesso: OGGI })), true);
    assert.match(r.innerHTML, /<b>This week<\/b><span>26 Oct – 1 Nov<\/span>/);
    assert.match(r.innerHTML, /--c:#112233/, 'i colori letti dagli allenatori');
    assert.doesNotMatch(r.innerHTML, /ms-in-/, 'la prima volta non c\'è animazione');
    assert.deepEqual(letti.sort(), ['ada', 'bea'], 'ogni allenatore si legge una volta sola');

    assert.equal(await b.vai(-1), true);
    assert.match(r.innerHTML, /<b>Last week<\/b><span>19–25 Oct<\/span>/);
    assert.match(r.innerHTML, /class="ms-corpo ms-in-sx"/, 'andando indietro entra da sinistra');
    assert.match(r.innerHTML, /href="matches\.html\?id=s0&amp;replay=sd1~b~set1&amp;da=home"/, 'il replay è quello della settimana mostrata (match b)');
    assert.equal(await b.vai(-1), true);
    assert.match(r.innerHTML, /<b>Week 42<\/b><span>12–18 Oct<\/span>/);
    assert.match(r.innerHTML, /class="ms-freccia ms-prec"[^>]*disabled/, 'la più vecchia: freccia indietro spenta');
    assert.equal(await b.vai(-1), false, 'oltre la più vecchia non si va');
    assert.equal(await b.vai(1), true);
    assert.match(r.innerHTML, /class="ms-corpo ms-in-dx"/, 'andando avanti entra da destra');
    assert.equal(await b.vai(1), true);
    assert.match(r.innerHTML, /<b>This week<\/b>/);
    assert.match(r.innerHTML, /class="ms-freccia ms-succ"[^>]*disabled/);
    assert.equal(await b.vai(1), false);
    assert.deepEqual(letti.sort(), ['ada', 'bea'], 'navigando non si rileggono');
});

test('monta: i dati si rileggono a ogni cambiamento del database ma il banner si ridisegna solo se cambia qualcosa; chi guarda una settimana vecchia ci resta', async () => {
    const r = radiceFinta();
    const b = M.monta({}, r, { adesso: () => OGGI });
    await b.aggiorna(M.settimane(treSettimane(), { adesso: OGGI }));
    assert.equal(r.scritture, 1);
    assert.equal(await b.aggiorna(M.settimane(treSettimane(), { adesso: OGGI })), false, 'dati uguali');
    assert.equal(r.scritture, 1);
    await b.vai(-1);
    const scritte = r.scritture;
    assert.equal(await b.aggiorna(M.settimane(treSettimane(), { adesso: OGGI })), false);
    assert.equal(r.scritture, scritte, 'nessun ridisegno');
    assert.match(r.innerHTML, /19–25 Oct/, 'chi sta guardando la 43 ci resta');
    // un set nuovo e più bello nella settimana guardata: si ridisegna, e resta la stessa settimana
    const migliorato = treSettimane(); migliorato.s0.showdowns.sd1.matches.b2 = match('2026-10-21', { set1: rimonta(), set2: rimonta() }, { p1score: 2, p2score: 0 });
    migliorato.s0.showdowns.sd1.matches.b.setStats.set1 = passeggiata();
    assert.equal(await b.aggiorna(M.settimane(migliorato, { adesso: OGGI })), true);
    assert.match(r.innerHTML, /19–25 Oct/);
    // il database si svuota: il banner sparisce
    assert.equal(await b.aggiorna(null), false);
    assert.equal(r.innerHTML, '');
});

test('monta: se il database si svuota mentre il banner si sta ancora disegnando, il banner non riappare', async () => {
    const r = radiceFinta();
    const b = M.monta({}, r, { adesso: () => OGGI, leggiGiocatore: async () => { await aspetta(); return { colore: '#112233', avatar: '' }; } });
    const primo = b.aggiorna(M.settimane(treSettimane(), { adesso: OGGI }));          // si sta leggendo gli allenatori...
    await b.aggiorna(null);                                                           // ...e intanto non c'è più niente
    assert.equal(await primo, false, 'il disegno vecchio è superato');
    assert.equal(r.innerHTML, '');
});

test('monta: chi guarda l\'ultima settimana segue quella nuova quando arriva', async () => {
    const prima = stagioni({ a: match('2026-10-20', { set1: rimonta() }), b: match('2026-10-28', { set1: passeggiata() }) });
    const dopo = stagioni({ a: match('2026-10-20', { set1: rimonta() }), b: match('2026-10-28', { set1: passeggiata() }), c: match('2026-11-03', { set1: rimonta() }) });
    const t1 = ora(2026, 10, 30), t2 = ora(2026, 11, 4);
    const r = radiceFinta();
    const b = M.monta({}, r, { adesso: () => t2 });
    await b.aggiorna(M.settimane(prima, { adesso: t1 }));
    assert.equal(b.stato.inizio, M.lunediDi(M.giornoDi('2026-10-28')));
    await b.aggiorna(M.settimane(dopo, { adesso: t2 }));
    assert.equal(b.stato.inizio, M.lunediDi(M.giornoDi('2026-11-03')), 'passa alla settimana nuova');
    assert.match(r.innerHTML, /<b>This week<\/b><span>2–8 Nov<\/span>/);
    // chi era sulla settimana precedente resta lì
    const r2 = radiceFinta();
    const b2 = M.monta({}, r2, { adesso: () => t2 });
    await b2.aggiorna(M.settimane(prima, { adesso: t1 }));
    await b2.vai(-1);
    await b2.aggiorna(M.settimane(dopo, { adesso: t2 }));
    assert.equal(b2.stato.inizio, M.lunediDi(M.giornoDi('2026-10-20')));
    assert.match(r2.innerHTML, /19–25 Oct/);
});

test('monta: una lettura fallita di un allenatore non si ricorda (al ridisegno si riprova) e non blocca il banner', async () => {
    let n = 0;
    const r = radiceFinta();
    const b = M.monta({}, r, { adesso: () => OGGI, leggiGiocatore: async () => { n++; if (n <= 2) throw new Error('rete'); return { colore: '#abcdef', avatar: '' }; } });
    await b.aggiorna(M.settimane(stagioni({ a: match('2026-10-27', { set1: passeggiata() }) }), { adesso: OGGI }));
    assert.match(r.innerHTML, /--c:#d9dde6/, 'senza colori il banner c\'è lo stesso, neutro');
    await b.aggiorna(M.settimane(stagioni({ a: match('2026-10-27', { set1: passeggiata() }), b: match('2026-10-28', { set1: rimonta() }) }), { adesso: OGGI }));
    assert.match(r.innerHTML, /--c:#abcdef/, 'la seconda volta la lettura riesce');
});

test('monta: clic sulle frecce, tasti ←/→ e scorrimento di lato cambiano settimana; dopo uno scorrimento il clic su un link non lo apre', async () => {
    const r = radiceFinta();
    let azzera = null;
    const b = M.monta({ setTimeout: f => { azzera = f; } }, r, { adesso: () => OGGI });
    await b.aggiorna(M.settimane(treSettimane(), { adesso: OGGI }));
    const titolo = () => (/<span class="ms-sett"><b>([^<]*)<\/b>/.exec(r.innerHTML) || [])[1];
    const clic = verso => { const e = { prevented: false, detail: 1, target: { closest: () => ({ disabled: false, getAttribute: () => String(verso) }) }, preventDefault() { this.prevented = true; }, stopPropagation() {} }; r.eventi.click(e); return e; };
    assert.equal(titolo(), 'This week');
    clic(-1); await aspetta();
    assert.equal(titolo(), 'Last week');
    // i tasti freccia
    r.eventi.keydown({ key: 'ArrowLeft', preventDefault() {} }); await aspetta();
    assert.equal(titolo(), 'Week 42');
    r.eventi.keydown({ key: 'ArrowRight', preventDefault() {} }); await aspetta();
    assert.equal(titolo(), 'Last week');
    r.eventi.keydown({ key: 'Enter', preventDefault() { throw new Error('altri tasti non si toccano'); } });
    // scorrimento col dito: verso sinistra la settimana più nuova, verso destra la più vecchia
    r.eventi.pointerdown({ clientX: 400, clientY: 100 });
    r.eventi.pointerup({ clientX: 300, clientY: 108 }); await aspetta();
    assert.equal(titolo(), 'This week', 'trascinando a sinistra: avanti');
    assert.equal(clic(1).prevented, true, 'subito dopo lo scorrimento il clic non apre i link');
    assert.equal(titolo(), 'This week', 'e non cambia settimana');
    azzera();
    r.eventi.pointerdown({ clientX: 300, clientY: 100 });
    r.eventi.pointerup({ clientX: 420, clientY: 90 }); await aspetta();
    assert.equal(titolo(), 'Last week', 'trascinando a destra: indietro');
    azzera();
    // movimenti piccoli o più verticali che orizzontali non sono scorrimenti
    r.eventi.pointerdown({ clientX: 300, clientY: 100 });
    r.eventi.pointerup({ clientX: 280, clientY: 100 }); await aspetta();
    r.eventi.pointerdown({ clientX: 300, clientY: 100 });
    r.eventi.pointerup({ clientX: 240, clientY: 190 }); await aspetta();
    r.eventi.pointerdown({ clientX: 300, clientY: 100 });
    r.eventi.pointercancel();
    r.eventi.pointerup({ clientX: 100, clientY: 100 }); await aspetta();
    assert.equal(titolo(), 'Last week');
    assert.equal(clic(1).prevented, false, 'un clic normale sulla freccia passa alla settimana dopo');
    await aspetta();
    assert.equal(titolo(), 'This week');
});

// ---------- il collegamento nelle pagine ----------
test('home: il banner sta sotto le stagioni, nascosto finché non c\'è un set; le settimane le gestisce il modulo e si ridisegna solo se cambia', () => {
    const idx = leggi('index.html');
    assert.match(idx, /<link rel="stylesheet" href="match-settimana\.css">/);
    for (const f of ['sprites/indice.js', 'sprite-pkm.js', 'medaglione-pkm.js', 'match-settimana.js']) assert.ok(idx.includes(`<script src="${f}"></script>`), f);
    assert.match(idx, /<section id="match-settimana" class="ms-sezione" aria-label="Match of the week" hidden>/);
    assert.ok(idx.indexOf('id="match-settimana"') > idx.indexOf('id="link-next"'), 'dopo le tre stagioni');
    assert.match(idx, /mostraMatchSettimana\(data\);/);
    assert.match(idx, /MatchSettimana\.monta\(window, blocco, \{/);
    assert.match(idx, /caricaBadge: \(\) => Fiocchi\.carica\(db\)/);
    for (const f of ['fiocchi.js', 'badge-team.js']) assert.ok(idx.includes(`<script src="${f}"></script>`), f);
    assert.match(idx, /<link rel="stylesheet" href="badge-team\.css">/);
    assert.match(idx, /MatchSettimana\.settimane\(data\)/);
    assert.match(idx, /matchSettimanaBanner\.aggiorna\(ce \? esito : null\)/);
    assert.match(idx, /players\/\$\{id\}\/info/);
    assert.match(idx, /sezione\.hidden = !\(ce && blocco\.firstChild\);/, 'si mostra a banner disegnato');
    // il nome del player non finisce nell'HTML senza protezione: lo scrive match-settimana.js (esc)
    assert.doesNotMatch(idx, /ms-blocco'\)\.innerHTML = .*\$\{/);
});

test('matches.html: ?replay=showdown~match~set apre da solo il replay di quel set (una volta sola)', () => {
    const m = leggi('matches.html');
    assert.match(m, /async function apriMatch\(showdownID, matchKey, teamDidi, teamLu, scoreDidi, scoreLu, setIniziale\)/);
    assert.match(m, /data-set="\$\{numSet\}"/);
    assert.match(m, /\.btn-set\[data-set="\$\{String\(setIniziale\)\.replace\(\/\\D\/g, ''\)\}"\]/);
    assert.match(m, /apriReplayDaLink\(dataShowdowns\);/);
    assert.match(m, /get\('replay'\)/);
    assert.match(m, /richiesto\.split\('~'\)/);
    assert.match(m, /if \(replayDaLinkAperto\) return;/);
    // da=home (link del banner): chiudendo il replay si torna alla home, una volta sola
    assert.match(m, /window\.replayTornaAllaHome = new URLSearchParams\(window\.location\.search\)\.get\('da'\) === 'home';/);
    assert.match(m, /if \(window\.replayTornaAllaHome\) \{\s*window\.replayTornaAllaHome = false;[\s\S]*?window\.location\.replace\('index\.html'\);\s*return;/);
    assert.match(m, /<script src="medaglione-pkm\.js"><\/script>\s*\n<script src="riepilogo-stagione\.js"><\/script>/, 'il medaglione prima del riepilogo');
});

test('stile: bordi, ombre, angoli, rotazioni e caratteri del tema; niente giallo; una riga con frecce sul bordo; a capo sotto gli 800 px; nell\'app non serve', () => {
    const css = leggi('match-settimana.css');
    for (const v of ['--nb-ink', '--nb-carta', '--nb-sh-s', '--nb-sh-m', '--nb-raggio', '--nb-rot', '--nb-font-titoli', '--nb-ads']) assert.ok(css.includes(v), v);
    assert.doesNotMatch(css, /--nb-giallo|--gx-giallo|ffbd44|ffde4d/i);
    // una riga sola: allenatori (griglia a tre colonne), protagonista, replay
    assert.match(css, /\.ms-corpo \{ display: flex; align-items: center;/);
    assert.match(css, /\.ms-scontro \{ display: grid; flex: 1 1 auto; grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
    assert.match(css, /\.ms-l2 \{ flex-direction: row-reverse; text-align: right;/);
    // i nomi non vanno a capo a metà parola (si accorciano con i puntini) e gli sprite si restringono invece di andare a capo
    assert.match(css, /\.ms-nome \{ display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;/);
    assert.match(css, /\.ms-sprites \{ display: flex; flex-wrap: nowrap;/);
    assert.match(css, /\.ms-spr \{ flex: 0 1 30px; width: 30px; min-width: 10px; height: 30px; object-fit: contain;/);
    assert.match(css, /\.ms-spr\.ms-ko \{ filter: grayscale\(1\); opacity: \.5; \}/);
    // la settimana con le frecce sul bordo in alto a destra (come l'etichetta a sinistra); le frecce spente in fondo; il dito scorre di lato
    assert.match(css, /\.ms-pager \{\s*position: absolute; top: -19px; right: 18px;/);
    assert.match(css, /\.ms-freccia:disabled \{ opacity: \.28; cursor: default; \}/);
    assert.match(css, /touch-action: pan-y;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.ms-av, \.ms-in-dx, \.ms-in-sx \{ animation: none; \} \}/);
    // finestre meno larghe: prima si rinuncia al motivo, poi al nome del Pokémon
    assert.match(css, /@media \(max-width: 1230px\) \{\s*\.ms-chip \{ display: none; \}/);
    assert.match(css, /@media \(max-width: 1150px\) \{\s*\.ms-banner \{ display: none; \}/);
    // sotto gli 800 px la riga va a capo (gli allenatori sopra, protagonista e replay sotto); sui telefoni gli allenatori uno sopra l'altro
    assert.match(css, /@media \(max-width: 800px\) \{[\s\S]*?\.ms-corpo \{ flex-wrap: wrap;/);
    assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?\.ms-scontro \{ grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(css, /html\.app-shell \.ms-sezione \{ display: none; \}/);
    assert.match(css, /body\.pg-index\.con-match \.home-seasons-container \{ min-height: 0;/);
    // i blocchi neri hanno l'ombra corta dei blocchi scuri (mai nera piena): l'etichetta in alto e il replay quando si annerisce al passaggio
    assert.match(/\.ms-t \{[^}]*\}/.exec(css)[0], /--nb-sh-s-scuro/);
    assert.match(/\.ms a\.ms-replay:hover \{[^}]*\}/.exec(css)[0], /--nb-sh-4-scuro/);
    // i tag del nome del Pokémon e del motivo sono bianchi con bordo nero spesso e ombra; chi ha perso è sbiadito; niente WINNER né VS
    const nero = /\.ms-nome-link \{[^}]*\}/.exec(css)[0];
    assert.ok(/background: var\(--nb-ink/.test(nero) && /color: #fff/.test(nero) && /--nb-sh-s-scuro/.test(nero), 'il tag del team è nero, con testo bianco e l\'ombra grigia trasparente dei titoli');
    const tag = /\.ms-banner, \.ms-chip \{[^}]*\}/.exec(css);
    assert.ok(tag && /background: var\(--nb-carta/.test(tag[0]) && /border: 3px solid var\(--nb-ink/.test(tag[0]) && /box-shadow: var\(--nb-sh-s/.test(tag[0]));
    assert.match(css, /\.ms-perde \{ background: color-mix\(in srgb, var\(--c, #d9dde6\) 38%, var\(--nb-carta/);
    assert.doesNotMatch(css, /\.ms-win|\.ms-vs|\.ms-centro/);
    // i badge: del team accanto al nome, del Pokémon sul bordo del medaglione (le immagini del medaglione non si prendono le loro regole)
    assert.match(css, /\.ms-med > img \{ position: absolute;/);
    assert.match(css, /\.ms-bdg-prot \{ position: absolute;/);
});

test('badge: i badge dei due team e dei fiocchi del Pokémon protagonista, con le stesse medagliette del Box; niente badge senza team', () => {
    const s = M.scegli(stagioni({ match1: match('2026-10-29', { set1: rimonta() }) }), { adesso: OGGI });
    const chiamate = [];
    const lib = {
        BadgeTeam: {
            trova: (r, q) => { chiamate.push(['team', q.player, q.team]); return { q }; },
            calcola: e => [{ e }], htmlMini: (l, max) => `<mini team ${l[0].e.q.player} max${max}>`
        },
        Fiocchi: {
            trova: (r, q) => { chiamate.push(['pkm', q.player, q.team, q.specie]); return { q }; },
            calcola: e => [{ e, livello: 1 }, { e, livello: 2 }, { e, livello: 3 }], guadagnati: l => l, htmlMedaglietta: f => `<f${f.livello}>`
        }
    };
    assert.deepEqual(M.badge({}, s, lib), { p1: '<mini team ada max2>', p2: '<mini team bea max2>', prot: '<f1><f2>' }, 'sul medaglione i due più alti');
    assert.deepEqual(chiamate, [['team', 'ada', 'Team Uno'], ['team', 'bea', 'Team Due'], ['pkm', 'ada', 'Team Uno', 'Ultimo']], 'il Pokémon è di chi ha vinto, nel suo team');
    const senzaTeam = M.scegli(stagioni({ match1: match('2026-10-29', { set1: rimonta() }, { team1: '', team2: '' }) }), { adesso: OGGI });
    assert.deepEqual(M.badge({}, senzaTeam, lib), { p1: '', p2: '', prot: '' });
    assert.deepEqual(M.badge({}, s, {}), { p1: '', p2: '', prot: '' }, 'senza le librerie dei badge il banner è lo stesso');
});

test('monta: i badge arrivano dopo il banner e non si scrivono più se nel frattempo si è cambiato settimana', async () => {
    const r = radiceFinta();
    const caselle = {};
    r.querySelector = sel => { const k = /data-ms-badge="(\w+)"/.exec(sel); return k ? (caselle[k[1]] = caselle[k[1]] || { innerHTML: '' }) : null; };
    let rilascia;
    const attesa = new Promise(ok => { rilascia = ok; });
    const win = {
        Fiocchi: { trova: () => null, calcola: () => [{ livello: 1 }], guadagnati: l => l, htmlMedaglietta: () => '<p>' },
        BadgeTeam: { trova: () => null, calcola: () => [], htmlMini: () => '<t>' }
    };
    const b = M.monta(win, r, { adesso: () => OGGI, caricaBadge: () => attesa });
    await b.aggiorna(M.settimane(treSettimane(), { adesso: OGGI }));
    assert.deepEqual(caselle, {}, 'il banner c\'è prima dei badge');
    rilascia({});
    await aspetta();
    assert.deepEqual([caselle.p1.innerHTML, caselle.p2.innerHTML, caselle.prot.innerHTML], ['<t>', '<t>', '<p>']);
    // si cambia settimana prima che i dati arrivino: i vecchi badge non finiscono nel banner nuovo
    const r2 = radiceFinta(), scritti = [];
    r2.querySelector = () => ({ set innerHTML(v) { scritti.push(v); } });
    let rilascia2; const attesa2 = new Promise(ok => { rilascia2 = ok; });
    const b2 = M.monta(win, r2, { adesso: () => OGGI, caricaBadge: () => attesa2 });
    await b2.aggiorna(M.settimane(treSettimane(), { adesso: OGGI }));
    await b2.vai(-1);
    rilascia2({}); await aspetta();
    assert.equal(scritti.length, 3, 'solo i badge della settimana mostrata (3 caselle), non quelli della prima');
});

test('home: il banner è largo quanto la fila delle stagioni (stesse misure di nb-pagine.css e style-index.css) e basso', () => {
    const css = leggi('match-settimana.css');
    const nb = leggi('nb-pagine.css');
    const idx = leggi('style-index.css');
    // le misure delle carte: gap e larghezza come in nb-pagine.css, con il tetto di 280 px che style-index.css dà a .season-card
    assert.ok(nb.includes('clamp(26px, 3.6vw, 56px)'), 'il gap delle stagioni è cambiato in nb-pagine.css: aggiornare --ms-gap');
    assert.ok(css.includes('--ms-gap: clamp(26px, 3.6vw, 56px);'));
    assert.ok(nb.includes('clamp(236px, calc((100vw - var(--nb-ads) - 60px - 2 * var(--nb-gap-card)) / 3), 300px)'), 'la larghezza delle stagioni è cambiata in nb-pagine.css: aggiornare --ms-card');
    assert.ok(css.includes('--ms-card: clamp(236px, calc((100vw - var(--nb-ads, 0px) - 60px - 2 * var(--ms-gap)) / 3), 280px);'));
    assert.match(idx, /\.season-card \{[^}]*max-width: 280px;/, 'il tetto di 280 px delle carte è cambiato in style-index.css: aggiornare --ms-card');
    assert.match(css, /\.ms \{[^}]*width: calc\(3 \* var\(--ms-card\) \+ 2 \* var\(--ms-gap\) - 12px\);/);
    // lo spazio sopra il banner basta per le etichette che sporgono e per l'ombra della carta di mezzo (ingrandita); sugli schermi bassi un po' meno
    assert.match(css, /\.ms-sezione \{[^}]*padding: 84px 30px 36px;/);
    assert.match(css, /@media \(min-width: 1051px\) and \(max-height: 820px\) \{[^}]*\.ms-sezione \{ padding-top: 70px;/);
    // sotto i 1050 px le stagioni vanno in colonna: il banner non segue più la loro fila
    assert.match(css, /@media \(max-width: 1050px\) \{\s*\.ms \{ width: min\(100%, 760px\); \}/);
});
