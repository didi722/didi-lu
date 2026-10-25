'use strict';
// L'MVP della stagione: un singolo Pokémon (quel team, quell'individuo, non la specie) votato dai giocatori a fine stagione.
//   - mvp.js: punteggio e classifica dei Pokémon, quando si apre il voto, cosa è un voto valido;
//   - risultati-match.js (anche nelle Cloud Functions): lo spoglio alla chiusura della stagione;
//   - statistiche.js: i titoli MVP di Pokémon, team e allenatore; fiocchi.js: il fiocco "Season MVP".
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');
const Mvp = require('../docs/mvp.js');
const { calcola } = require('../docs/statistiche.js');
const Fiocchi = require('../docs/fiocchi.js');

const leggi = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const copia = x => JSON.parse(JSON.stringify(x));
function caricaSito(db) {
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: () => { throw new Error('rete non permessa'); }, db });
    vm.runInContext(leggi('docs/risultati-match.js'), contesto, { filename: 'risultati-match.js' });
    return contesto;
}

// ---------- 1. il punteggio e la classifica ----------
const pk = (chiave, extra = {}) => ({ chiave, player: 'didi', playerNome: 'Didi', team: 'ALPHA', formato: 'VGC', specie: chiave.split('::').pop(), specieId: chiave.split('::').pop(),
    portato: 0, koFatti: 0, svenuto: 0, setPortatoVinti: 0, ultimoVinto: 0, serie: { matchVinti: 0 }, ...extra });

test('punteggio: KO x3, set vinti x4, set giocati x1, set sopravvissuti x1,5, ultimo rimasto x6, match vinti x2', () => {
    const m = pk('didi::ALPHA::garchomp', { koFatti: 4, setPortatoVinti: 3, portato: 5, svenuto: 2, ultimoVinto: 1, serie: { matchVinti: 2 } });
    assert.equal(Mvp.punteggio(m), 12 + 12 + 5 + 4.5 + 6 + 4);
    assert.equal(Mvp.punteggio(pk('x')), 0);
    assert.equal(Mvp.punteggio(null), 0);
    // non si può sopravvivere a più set di quelli giocati
    assert.equal(Mvp.punteggio(pk('y', { portato: 1, svenuto: 3 })), 1);
});

test('classifica: solo chi è sceso in campo, dal punteggio più alto; a parità più KO, poi più presenze, poi il nome', () => {
    const lista = [
        pk('didi::ALPHA::panchina'),                                                                  // mai in campo: non c'è
        pk('didi::ALPHA::forte', { portato: 4, koFatti: 5, setPortatoVinti: 3 }),
        pk('lu::GAMMA::medio', { player: 'lu', portato: 4, koFatti: 2, setPortatoVinti: 2 }),
        pk('lu::GAMMA::piccolo', { player: 'lu', portato: 1 })
    ];
    const c = Mvp.classifica(lista);
    assert.deepEqual(c.map(v => v.specie), ['forte', 'medio', 'piccolo']);
    assert.deepEqual(c.map(v => v.posizione), [1, 2, 3]);
    assert.equal(Mvp.classifica(lista, 2).length, 2);
    // parità di punteggio: più KO prima (3 KO + 0 set = 9+; 2 set vinti x4 = 8 + 1 KO x3 = 3...)
    const pari = Mvp.classifica([
        pk('a::T::uno', { portato: 2, koFatti: 0, setPortatoVinti: 3 }),      // 12 + 2 + 3 = 17
        pk('a::T::due', { portato: 2, koFatti: 4, setPortatoVinti: 0 })       // 12 + 2 + 3 = 17
    ]);
    assert.equal(pari[0].specie, 'due', 'a parità vince chi ha più KO');
});

test("un Pokémon è un individuo: la stessa specie in due team (o due volte nello stesso) sono due candidati", () => {
    const c = Mvp.classifica([
        pk('didi::ALPHA::garchomp', { portato: 3, koFatti: 3 }),
        pk('didi::BETA::garchomp', { portato: 3, koFatti: 1 }),
        pk('didi::ALPHA::garchomp#2', { portato: 2 })
    ]);
    assert.equal(c.length, 3);
    assert.equal(new Set(c.map(v => v.chiave)).size, 3);
});

// ---------- 2. quando si può votare ----------
test('soglia del voto: gli ultimi 3 showdown, ma mai più di un terzo della stagione (almeno 1)', () => {
    assert.deepEqual([30, 9, 6, 5, 3, 2, 1, 0].map(Mvp.sogliaVoto), [3, 3, 2, 1, 1, 1, 1, 1]);
});

test('finestraVoto: apre quando mancano pochi showdown, mai prima di iniziare, mai a stagione chiusa o senza calendario', () => {
    const info = { status: 'playing', tipo: 'league' };
    const f = (giocati, richiesti, i = info, id = 's1') => Mvp.finestraVoto(i, { giocati, richiesti }, id);
    assert.equal(f(26, 30).aperta, false);
    assert.equal(f(26, 30).motivo, 'presto');
    assert.equal(f(27, 30).aperta, true, 'mancano 3');
    assert.equal(f(27, 30).mancano, 3);
    assert.equal(f(29, 30).aperta, true);
    assert.equal(f(0, 3).aperta, false, 'non è ancora iniziata');
    assert.equal(f(1, 3).aperta, false, 'una stagione corta non apre dopo il primo showdown: ne mancano 2 su 3');
    assert.equal(f(2, 3).aperta, true, 'ne manca un terzo');
    assert.equal(f(1, 6).aperta, false, '5 mancanti su 6: soglia 2');
    assert.equal(f(4, 6).aperta, true);
    assert.equal(f(5, 0).motivo, 'senza-calendario');
    const chiusa = f(30, 30, { status: 'closed', tipo: 'league' });
    assert.equal(chiusa.aperta, false);
    assert.equal(chiusa.chiusa, true);
    assert.equal(f(27, 30, { status: 'playing', tipo: 'random' }).aperta, false, 'le Random non hanno i Pokémon');
    assert.equal(f(27, 30, { status: 'playing', tipo: 'cup' }).aperta, false);
    assert.equal(f(27, 30, info, 'sbeta').aperta, false);
    assert.equal(f(27, 30, { status: 'playing' }).aperta, true, 'senza tipo è una League');
    assert.equal(f(27, 30, { status: 'playing', tipo: 'monoformat' }).aperta, true);
});

// ---------- 3. cosa è un voto valido ----------
test('controllaScelte: solo tra i candidati, mai due volte lo stesso, mai i propri, al massimo 2', () => {
    const cand = Mvp.classifica([
        pk('didi::A::uno', { portato: 5, koFatti: 5 }), pk('lu::B::due', { player: 'lu', portato: 4, koFatti: 4 }),
        pk('tom::C::tre', { player: 'tom', portato: 3, koFatti: 3 }), pk('didi::A::quattro', { portato: 2, koFatti: 2 })
    ]);
    const ok = Mvp.controllaScelte(['lu::B::due', 'tom::C::tre'], cand, 'didi');
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.scelte.map(c => c.specie), ['due', 'tre']);
    // un Pokémon proprio o non candidato o doppio non conta
    const sporco = Mvp.controllaScelte(['didi::A::uno', 'lu::B::due', 'lu::B::due', 'fuori::X::z'], cand, 'Didi');
    assert.deepEqual(sporco.scelte.map(c => c.specie), ['due']);
    assert.equal(sporco.ok, true);
    // niente di valido
    const niente = Mvp.controllaScelte(['didi::A::uno'], cand, 'didi');
    assert.equal(niente.ok, false);
    assert.match(niente.errore, /at least one/i);
    // tre voti validi: troppi
    const tre = Mvp.controllaScelte(['lu::B::due', 'tom::C::tre', 'didi::A::quattro'], cand, 'ale');
    assert.equal(tre.ok, false);
    assert.equal(tre.scelte.length, 2);
    // il voto salvato ha solo stringhe (Firebase rifiuta undefined)
    assert.deepEqual(Object.keys(Mvp.candidato({ chiave: 'k' })).sort(), ['chiave', 'player', 'specie', 'specieId', 'team']);
    assert.ok(Object.values(Mvp.candidato({ chiave: 'k' })).every(v => typeof v === 'string'));
});

test('vincitoriDi legge i vincitori registrati (lista o oggetto numerato di Firebase)', () => {
    assert.deepEqual(Mvp.vincitoriDi({ mvp: { risultato: { vincitori: [{ chiave: 'a' }] } } }).map(v => v.chiave), ['a']);
    assert.deepEqual(Mvp.vincitoriDi({ mvp: { risultato: { vincitori: { 0: { chiave: 'a' }, 1: { chiave: 'b' } } } } }).map(v => v.chiave), ['a', 'b']);
    assert.deepEqual(Mvp.vincitoriDi({}), []);
    assert.deepEqual(Mvp.vincitoriDi(null), []);
});

// ---------- 4. lo spoglio (risultati-match.js, anche nelle Cloud Functions) ----------
const voto = (...scelte) => ({ ts: 1, scelte: scelte.map(([chiave, player, specie]) => ({ chiave, player, team: 'T', specie, specieId: specie.toLowerCase() })) });
const A = ['lu::T::garchomp', 'lu', 'Garchomp'], B = ['tom::T::dragonite', 'tom', 'Dragonite'], C = ['didi::T::kyogre', 'didi', 'Kyogre'];

test('spoglio: vince chi ha più voti; a parità vincono tutti i primi; nessun voto = nessun MVP', () => {
    const { spoglioMvp } = caricaSito(creaDb());
    const iscritti = { Didi: {}, Lu: {}, Tom: {} };
    const uno = copia(spoglioMvp({ didi: voto(A, B), tom: voto(A) }, iscritti));
    assert.deepEqual(uno.vincitori.map(v => [v.specie, v.voti]), [['Garchomp', 2]]);
    assert.equal(uno.votanti, 2);
    assert.deepEqual(uno.classifica.map(v => v.specie), ['Garchomp', 'Dragonite']);
    const pari = copia(spoglioMvp({ didi: voto(A), lu: voto(B) }, iscritti));
    assert.deepEqual(pari.vincitori.map(v => v.specie).sort(), ['Dragonite', 'Garchomp'], 'a pari merito');
    const nessuno = copia(spoglioMvp({}, iscritti));
    assert.deepEqual(nessuno.vincitori, []);
    assert.equal(nessuno.votanti, 0);
    assert.deepEqual(copia(spoglioMvp(null, null)).vincitori, []);
});

test('spoglio: non contano i voti dei non iscritti, quelli per un proprio Pokémon, i doppioni e il terzo voto', () => {
    const { spoglioMvp } = caricaSito(creaDb());
    const iscritti = ['didi', 'lu', 'tom'];
    const r = copia(spoglioMvp({
        didi: voto(C, A),                       // C è suo: salta; A vale
        lu: voto(A, A, B, C),                   // A (il suo: salta); il doppione salta; B vale, C è il secondo voto valido
        intruso: voto(B, B),                    // non iscritto
        tom: voto(A, A)                         // doppione: un voto solo
    }, iscritti));
    const voti = Object.fromEntries(r.classifica.map(v => [v.specie, v.voti]));
    assert.deepEqual(voti, { Garchomp: 2, Dragonite: 1, Kyogre: 1 }, 'didi→A, lu→B e C, tom→A');
    assert.deepEqual(r.vincitori.map(v => v.specie), ['Garchomp']);
    assert.equal(r.votanti, 3);
});

test('stagioneConMvp: lo stesso verdetto in risultati-match.js e in mvp.js', () => {
    const sito = caricaSito(creaDb());
    for (const info of [{}, { tipo: 'league' }, { tipo: 'monoformat' }, { tipo: 'random' }, { tipo: 'cup' }, { tipo: 'LEAGUE ' }, null]) {
        for (const id of ['s1', 'sbeta']) assert.equal(sito.stagioneConMvp(info, id), Mvp.stagioneConMvp(info, id), `${JSON.stringify(info)} ${id}`);
    }
    assert.equal(vm.runInContext('VOTI_MVP_PER_GIOCATORE', sito), Mvp.VOTI);
});

const stagioneConVoti = (extraInfo = {}) => ({
    info: { name: 'S', status: 'playing', showdowns_per_format: 1, selected_formats: ['OU'], ...extraInfo },
    iscritti: { Didi: {}, Lu: {}, Tom: {} },
    mvp: { voti: { didi: voto(A), tom: voto(A, B) } }
});

test('salvaMvpStagione: scrive il risultato nella stagione; le Random, le cup e la beta non hanno MVP', async () => {
    const db = creaDb({ seasons: { s1: stagioneConVoti(), s2: stagioneConVoti({ tipo: 'random' }), s3: stagioneConVoti({ tipo: 'cup' }), sbeta: stagioneConVoti() } });
    const sito = caricaSito(db);
    const r = await sito.salvaMvpStagione('s1');
    assert.deepEqual(copia(r.vincitori).map(v => v.specie), ['Garchomp']);
    const salvato = db.leggi('seasons/s1/mvp/risultato');
    assert.equal(salvato.vincitori[0].chiave, 'lu::T::garchomp');
    assert.equal(salvato.vincitori[0].voti, 2);
    assert.equal(salvato.votanti, 2);
    assert.ok(salvato.contatoIl);
    assert.deepEqual(db.leggi('seasons/s1/mvp/voti').didi.scelte.length, 1, 'i voti restano');
    for (const id of ['s2', 's3', 'sbeta']) {
        assert.equal(await sito.salvaMvpStagione(id), null, id);
        assert.equal(db.leggi(`seasons/${id}/mvp/risultato`), null, id);
    }
});

test('la chiusura della stagione conta i voti; riaprendola il risultato si toglie ma i voti restano', async () => {
    const lb = { Didi: { points: 4, won: 2, setW: 4 }, Lu: { points: 3, won: 1, setW: 3 }, Tom: { points: 1, won: 0, setW: 1 } };
    const db = creaDb({ seasons: { s1: { ...stagioneConVoti(), leaderboard: lb } }, players: { didi: {}, lu: {}, tom: {} } });
    const sito = caricaSito(db);
    assert.equal(await sito.salvaVincitoreStagione('s1'), 'Didi');
    assert.equal(db.leggi('seasons/s1/mvp/risultato/vincitori/0/specie'), 'Garchomp');
    await sito.ritiraVincitoreStagione('s1');
    assert.equal(db.leggi('seasons/s1/mvp/risultato'), null);
    assert.ok(db.leggi('seasons/s1/mvp/voti/didi'));
});

test('lo script delle funzioni è la copia identica di quello del sito', () => {
    assert.equal(leggi('functions/risultati-match.js'), leggi('docs/risultati-match.js'));
});

// ---------- 5. i titoli nelle statistiche ----------
const setStats = (vincitore, p1Pokemon, p2Pokemon) => ({ v: 1, turni: 6, vincitore,
    p1: { nome: 'Didi', portati: p1Pokemon.length, svenuti: 0, pokemon: p1Pokemon.map(([specie, o = {}]) => ({ specie, nome: '', portato: true, titolare: true, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o })) },
    p2: { nome: 'Lu', portati: p2Pokemon.length, svenuti: 0, pokemon: p2Pokemon.map(([specie, o = {}]) => ({ specie, nome: '', portato: true, titolare: true, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o })) } });
const unMatch = { player1: 'Didi', player1Id: 'didi', player2: 'Lu', player2Id: 'lu', winnerId: 'didi', team1: 'ALPHA', team2: 'GAMMA', score: '2-0', p1score: 2, p2score: 0,
    p1points: 2, p2points: 0, data: '2026-02-01', categoria: 'VGC',
    setStats: { set1: setStats('p1', [['Garchomp', { koFatti: 3 }], ['Incineroar']], [['Dragonite', { svenuto: true }]]), set2: setStats('p1', [['Garchomp', { koFatti: 2 }], ['Incineroar']], [['Dragonite', { svenuto: true }]]) } };
const giocatori = {
    didi: { info: { name: 'Didi' }, teams: { a: { nome: 'ALPHA', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }, { nome: 'Incineroar' }] } } },
    lu: { info: { name: 'Lu' }, teams: { g: { nome: 'GAMMA', categoria: 'VGC', pokemon: [{ nome: 'Dragonite' }] } } }
};
const stagioneStat = (status, mvp) => ({ info: { name: 'S', status }, showdowns: { sd: { info: { categoria: 'VGC', player1: 'Didi', player2: 'Lu', data: '2026-02-01' }, matches: { match1: unMatch } } }, ...(mvp ? { mvp } : {}) });
const risultatoMvp = [{ chiave: 'didi::ALPHA::garchomp', player: 'didi', team: 'ALPHA', specie: 'Garchomp', specieId: 'garchomp', voti: 2 }];

test('statistiche: i titoli MVP contano per quel Pokémon (non per la specie), per il suo team e per il suo allenatore', () => {
    const r = calcola({ players: giocatori, seasons: { s1: stagioneStat('closed', { risultato: { vincitori: risultatoMvp } }) } }, { stagione: 'all' });
    const garchomp = r.pokemon.find(m => m.specieId === 'garchomp');
    assert.equal(garchomp.mvpVinti, 1);
    assert.deepEqual(garchomp.mvpStagioni, ['s1']);
    assert.equal(r.pokemon.find(m => m.specieId === 'incineroar').mvpVinti, 0, 'un compagno di team no');
    assert.equal(r.pokemon.find(m => m.specieId === 'dragonite').mvpVinti, 0);
    assert.equal(r.teams.find(t => t.nome === 'ALPHA').mvpVinti, 1);
    assert.equal(r.teams.find(t => t.nome === 'GAMMA').mvpVinti, 0);
    assert.equal(r.players.find(p => p.id === 'didi').mvpVinti, 1);
    assert.equal(r.players.find(p => p.id === 'lu').mvpVinti, 0);
    // un altro Garchomp (altro team o altra posizione) non prende il titolo
    const altro = copia(giocatori);
    altro.didi.teams.b = { nome: 'BETA', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }] };
    const r2 = calcola({ players: altro, seasons: { s1: stagioneStat('closed', { risultato: { vincitori: risultatoMvp } }) } }, { stagione: 'all' });
    assert.equal(r2.pokemon.filter(m => m.specieId === 'garchomp' && m.mvpVinti).length, 1);
});

test('statistiche: contano le stagioni chiuse nel perimetro scelto; la beta e quelle ancora aperte no', () => {
    const mvp = { risultato: { vincitori: risultatoMvp } };
    const dati = { players: giocatori, seasons: { s1: stagioneStat('closed', mvp), s2: stagioneStat('closed', mvp), s3: stagioneStat('playing', mvp), sbeta: stagioneStat('closed', mvp) } };
    const tutte = calcola(dati, { stagione: 'all' });
    assert.equal(tutte.pokemon.find(m => m.specieId === 'garchomp').mvpVinti, 2, 's1 e s2');
    const una = calcola(dati, { stagione: 's2' });
    assert.equal(una.pokemon.find(m => m.specieId === 'garchomp').mvpVinti, 1);
    // senza risultato (stagione senza voti o prima della chiusura) nessun titolo
    const senza = calcola({ players: giocatori, seasons: { s1: stagioneStat('closed') } }, { stagione: 'all' });
    assert.equal(senza.pokemon.find(m => m.specieId === 'garchomp').mvpVinti, 0);
});

// ---------- 6. il fiocco ----------
test('il fiocco Season MVP: bronzo al primo titolo, poi 2, 3 e 4', () => {
    const mvp = p => Fiocchi.calcola(p).find(f => f.id === 'mvp');
    assert.deepEqual(Fiocchi.CATALOGO.find(f => f.id === 'mvp').soglie, [1, 2, 3, 4]);
    assert.equal(mvp({}).livello, 0);
    assert.equal(mvp({ mvpVinti: 1 }).livello, 1);
    assert.equal(mvp({ mvpVinti: 1 }).immagine, 'immagini/ribbon-mvp-bronze.png');
    assert.equal(mvp({ mvpVinti: 2 }).livello, 2);
    assert.equal(mvp({ mvpVinti: 3 }).livello, 3);
    assert.equal(mvp({ mvpVinti: 4 }).immagine, 'immagini/ribbon-mvp-platinum.png');
    assert.equal(mvp({ mvpVinti: 9 }).livello, 4);
    // viene dal Pokémon delle statistiche
    const r = calcola({ players: giocatori, seasons: { s1: stagioneStat('closed', { risultato: { vincitori: risultatoMvp } }) } }, { stagione: 'all' });
    assert.equal(mvp(Fiocchi.trova(r, { player: 'didi', team: 'ALPHA', specie: 'Garchomp' })).livello, 1);
    assert.equal(mvp(Fiocchi.trova(r, { player: 'didi', team: 'ALPHA', specie: 'Incineroar' })).livello, 0);
});

// ---------- 7. la pagina ----------
test('matches.html carica mvp.css e gli script dell\'MVP (dopo le statistiche) e li avvia a ogni disegno', () => {
    const html = leggi('docs/matches.html');
    const s = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    for (const f of ['statistiche.js', 'mvp.js', 'mvp-voto.js']) assert.ok(s.includes(f), f);
    assert.ok(s.indexOf('statistiche.js') < s.indexOf('mvp.js') && s.indexOf('mvp.js') < s.indexOf('mvp-voto.js'));
    assert.match(html, /<link rel="stylesheet" href="mvp\.css">/);
    assert.match(html, /MvpVoto\.avvia\(\{ stagione: stagioneAttiva/);
    assert.ok(leggi('docs/mvp-voto.js').includes("db.ref(`seasons/${ctx.stagione}/mvp/voti/${idDi(ctx.votante)}`)"), 'i voti stanno sotto seasons/{id}/mvp/voti/{giocatore}');
});
