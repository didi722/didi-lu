'use strict';
// Prove di docs/statistiche.js con dati inventati e conti fatti a mano.
//
//   npm test        (dalla cartella principale)
//
// Scenario
//   - tre giocatori: Didi, Lu, Tom; i team sono nel Box (players/{id}/teams)
//   - s1 (chiusa): tre showdown VGC, tutti da 3 match (BO3) + uno showdown OU di un match
//   - s2 (in corso): un solo match
//   - sbeta (chiusa): un match (la beta non conta nelle statistiche globali)
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcola } = require('../docs/statistiche.js');

// ---------- costruzione dei dati ----------
const PUNTI = { 0: 0, 1: 1, 2: 2 };       // BO3: punti = set vinti (2-0 → 2, 2-1 → 2, 1-2 → 1, 0-2 → 0)
const puntiBo3 = set => (set >= 2 ? 2 : set === 1 ? 1 : 0);

// Elo come in risultati-match.js (K = 32), nell'ordine in cui vengono inseriti i match
const elo = { didi: 1000, lu: 1000, tom: 1000 };
function match({ p1, p2, s1, s2, team1, team2, data, categoria = 'VGC', setStats }) {
    const exp1 = 1 / (1 + Math.pow(10, (elo[p2] - elo[p1]) / 400));
    const exp2 = 1 / (1 + Math.pow(10, (elo[p1] - elo[p2]) / 400));
    const vince1 = s1 > s2;
    const d1 = Math.round(32 * ((vince1 ? 1 : 0) - exp1)), d2 = Math.round(32 * ((vince1 ? 0 : 1) - exp2));
    const m = {
        player1: p1, player1Id: p1, player2: p2, player2Id: p2,
        winnerId: vince1 ? p1 : p2, team1, team2, score: `${s1}-${s2}`, p1score: s1, p2score: s2,
        p1points: puntiBo3(s1), p2points: puntiBo3(s2), data, categoria,
        p1EloAtMatch: elo[p1], p2EloAtMatch: elo[p2], p1DeltaElo: d1, p2DeltaElo: d2
    };
    elo[p1] += d1; elo[p2] += d2;
    if (setStats) m.setStats = setStats;
    return m;
}

// un lato di setStats: portati, svenuti e l'elenco dei Pokémon
const lato = (nome, portati, svenuti, pokemon) => ({
    nome, portati, svenuti,
    pokemon: pokemon.map(([specie, o = {}]) => ({
        specie, nome: '', portato: true, titolare: false, koFatti: 0, koDiretti: 0,
        svenuto: false, turnoKo: 0, ultimo: false, ...o
    }))
});

// Set 1 (Didi vince): Didi perde 1 Pokémon, Lu tutti e 4
const SET1 = {
    v: 1, turni: 8, vincitore: 'p1',
    p1: lato('Didi', 4, 1, [
        ['Garchomp', { titolare: true, koFatti: 2, koDiretti: 2 }],
        ['Rotom-Wash', { titolare: true, koFatti: 1, koDiretti: 0 }],
        ['Incineroar', { koFatti: 1, koDiretti: 1, svenuto: true, turnoKo: 6 }],
        ['Amoonguss'],
        ['Urshifu-Rapid-Strike', { portato: false }],
        ['Whimsicott', { portato: false }]
    ]),
    p2: lato('Lu', 4, 4, [
        ['Dragonite', { titolare: true, svenuto: true, turnoKo: 3 }],
        ['Tornadus', { titolare: true, svenuto: true, turnoKo: 5 }],
        ['Amoonguss', { svenuto: true, turnoKo: 7 }],
        ['Rillaboom', { svenuto: true, turnoKo: 8, ultimo: true }]
    ])
};
// Set 2 (Didi vince senza perdere nessuno)
const SET2 = {
    v: 1, turni: 5, vincitore: 'p1',
    p1: lato('Didi', 4, 0, [
        ['Garchomp', { titolare: true, koFatti: 3, koDiretti: 3 }],
        ['Rotom-Wash', { titolare: true, koFatti: 1, koDiretti: 1 }],
        ['Incineroar'],
        ['Amoonguss']
    ]),
    p2: lato('Lu', 4, 4, [
        ['Dragonite', { titolare: true, svenuto: true, turnoKo: 2 }],
        ['Tornadus', { titolare: true, svenuto: true, turnoKo: 3 }],
        ['Amoonguss', { svenuto: true, turnoKo: 4 }],
        ['Rillaboom', { svenuto: true, turnoKo: 5, ultimo: true }]
    ])
};
// Set 3 (Lu vince all'ultimo Pokémon: Dragonite è l'ultimo rimasto)
const SET3 = {
    v: 1, turni: 12, vincitore: 'p2',
    p1: lato('Didi', 4, 4, [
        ['Garchomp', { titolare: true, svenuto: true, turnoKo: 9 }],
        ['Rotom-Wash', { titolare: true, svenuto: true, turnoKo: 4 }],
        ['Incineroar', { svenuto: true, turnoKo: 7 }],
        ['Amoonguss', { svenuto: true, turnoKo: 12, ultimo: true }]
    ]),
    p2: lato('Lu', 4, 3, [
        ['Dragonite', { titolare: true, koFatti: 2, koDiretti: 2, ultimo: true }],
        ['Tornadus', { titolare: true, koFatti: 1, koDiretti: 0, svenuto: true, turnoKo: 10 }],
        ['Amoonguss', { koFatti: 1, koDiretti: 1, svenuto: true, turnoKo: 11 }],
        ['Rillaboom', { svenuto: true, turnoKo: 6 }]
    ])
};

const roster = nomi => nomi.map(nome => ({ nome }));
const players = {
    didi: { info: { name: 'Didi', color: '#31c489', avatar: 'a.png' }, stats: { 'individual-stats': { ranking: 1234 } }, teams: {
        a: { nome: 'ALPHA', categoria: 'VGC', pokemon: roster(['Garchomp', 'Rotom-Wash', 'Incineroar', 'Amoonguss', 'Urshifu-Rapid-Strike', 'Whimsicott']) },
        b: { nome: 'BETA', categoria: 'VGC', pokemon: roster(['Dragapult', 'Kingambit']) },
        c: { nome: 'OUTEAM', categoria: 'OU', pokemon: roster(['Great Tusk']) }
    } },
    lu: { info: { name: 'Lu', color: '#8e44ad' }, teams: {
        g: { nome: 'GAMMA', categoria: 'VGC', pokemon: roster(['Dragonite', 'Tornadus', 'Amoonguss', 'Rillaboom']) }
    } },
    tom: { info: { name: 'Tom' }, teams: {
        d: { nome: 'DELTA', categoria: 'VGC', pokemon: roster(['Flutter Mane', 'Kyogre']) }
    } }
};

// ordine di inserimento = ordine cronologico (la beta per prima)
const mBeta = match({ p1: 'didi', p2: 'lu', s1: 0, s2: 2, team1: 'ALPHA', team2: 'GAMMA', data: '2026-01-10' });
const sd1 = {
    info: { categoria: 'VGC', player1: 'Didi', player2: 'Lu', data: '2026-02-01', vincitoreShowdown: 'didi' },
    matches: {
        match1: match({ p1: 'didi', p2: 'lu', s1: 2, s2: 0, team1: 'ALPHA', team2: 'GAMMA', data: '2026-02-01', setStats: { set1: SET1, set2: SET2 } }),
        match2: match({ p1: 'didi', p2: 'lu', s1: 1, s2: 2, team1: 'BETA', team2: 'GAMMA', data: '2026-02-01', setStats: { set1: SET3 } }),
        match3: match({ p1: 'didi', p2: 'lu', s1: 2, s2: 0, team1: 'ALPHA', team2: 'GAMMA', data: '2026-02-01' })
    }
};
const sd2 = {
    info: { categoria: 'VGC', player1: 'Didi', player2: 'Tom', data: '2026-02-05', vincitoreShowdown: 'tom' },
    matches: {
        match1: match({ p1: 'didi', p2: 'tom', s1: 1, s2: 2, team1: 'ALPHA', team2: 'DELTA', data: '2026-02-05' }),
        match2: match({ p1: 'didi', p2: 'tom', s1: 2, s2: 0, team1: 'ALPHA', team2: 'DELTA', data: '2026-02-05' }),
        match3: match({ p1: 'didi', p2: 'tom', s1: 0, s2: 2, team1: 'BETA', team2: 'DELTA', data: '2026-02-05' })
    }
};
const sd3 = {
    info: { categoria: 'VGC', player1: 'Lu', player2: 'Tom', data: '2026-02-09', vincitoreShowdown: 'lu' },
    matches: {
        match1: match({ p1: 'lu', p2: 'tom', s1: 2, s2: 0, team1: 'GAMMA', team2: 'DELTA', data: '2026-02-09' }),
        match2: match({ p1: 'lu', p2: 'tom', s1: 1, s2: 2, team1: 'GAMMA', team2: 'DELTA', data: '2026-02-09' }),
        match3: match({ p1: 'lu', p2: 'tom', s1: 2, s2: 0, team1: 'GAMMA', team2: 'DELTA', data: '2026-02-09' })
    }
};
const sdOu = {   // un solo match: lo showdown non è deciso
    info: { categoria: 'OU', player1: 'Didi', player2: 'Tom', data: '2026-02-12' },
    matches: { match1: match({ p1: 'didi', p2: 'tom', s1: 2, s2: 1, team1: 'OUTEAM', team2: 'DELTA', data: '2026-02-12', categoria: 'OU' }) }
};
const mS2 = match({ p1: 'lu', p2: 'tom', s1: 2, s2: 0, team1: 'GAMMA', team2: 'DELTA', data: '2026-03-01' });

const dati = {
    players,
    seasons: {
        sbeta: { info: { name: 'Beta Season', status: 'closed' }, showdowns: { b1: { info: { categoria: 'VGC', data: '2026-01-10' }, matches: { match1: mBeta } } } },
        s1: { info: { name: 'Season One', status: 'closed' }, showdowns: { sd1, sd2, sd3, sdOu } },
        s2: { info: { name: 'Season Two', status: 'playing' }, showdowns: { x1: { info: { categoria: 'VGC', data: '2026-03-01' }, matches: { match1: mS2 } } } }
    }
};
const trova = (lista, f) => lista.find(f);

// ---------- stagioni ----------
test('elenco stagioni: la più recente prima, la beta in fondo, vincitore solo se chiusa', () => {
    const r = calcola(dati);
    assert.deepEqual(r.stagioni.map(s => s.id), ['s2', 's1', 'sbeta']);
    assert.equal(r.stagioni.find(s => s.id === 's1').nome, 'Season One');
    assert.equal(r.stagioni.find(s => s.id === 's1').vincitore, 'didi');     // 10 punti contro gli 8 di Lu
    assert.equal(r.stagioni.find(s => s.id === 's2').vincitore, '');         // in corso
    assert.equal(r.stagioni.find(s => s.id === 'sbeta').vincitore, 'lu');    // la beta ha un solo match: vince Lu
});

// ---------- player, stagione 1 ----------
test('player di una stagione: classifica a punti, risultati e stagione vinta', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    assert.deepEqual(r.players.map(p => p.id), ['didi', 'lu', 'tom']);       // 9, 8, 7 punti
    const didi = trova(r.players, p => p.id === 'didi');
    assert.equal(didi.nome, 'Didi');
    assert.equal(didi.colore, '#31c489');
    assert.equal(didi.punti, 9);                                              // 5 + 3 dei match + 1 dello showdown vinto
    assert.deepEqual(didi.match, { giocati: 6, vinti: 3, persi: 3 });
    assert.deepEqual(didi.set, { giocati: 14, vinti: 8, persi: 6 });
    assert.deepEqual(didi.showdown, { giocati: 2, vinti: 1, persi: 1 });
    assert.equal(didi.stagioniGiocate, 1);
    assert.equal(didi.stagioniVinte, 1);
    assert.equal(didi.percMatch, 50);
    assert.equal(didi.percSet, 57.1);
    const lu = trova(r.players, p => p.id === 'lu');
    assert.equal(lu.punti, 8);
    assert.equal(lu.stagioniVinte, 0);
    const tom = trova(r.players, p => p.id === 'tom');
    assert.equal(tom.punti, 7);
    assert.deepEqual(tom.showdown, { giocati: 2, vinti: 1, persi: 1 });
});

test('il formato non cambia chi ha vinto la stagione', () => {
    // Nel solo OU Didi e Tom hanno un match: il vincitore della stagione resta Didi
    const r = calcola(dati, { stagione: 's1', formato: 'OU' });
    assert.deepEqual(r.players.map(p => p.id).sort(), ['didi', 'tom']);
    assert.equal(trova(r.players, p => p.id === 'didi').stagioniVinte, 1);
    assert.deepEqual(r.formati, ['OU', 'VGC']);
    // showdown con un solo match: giocato ma non deciso
    assert.deepEqual(trova(r.players, p => p.id === 'didi').showdown, { giocati: 1, vinti: 0, persi: 0 });
});

test('serie di vittorie e match senza perdere set', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const didi = trova(r.players, p => p.id === 'didi');
    // W L W | L W L  → serie massima 1; 2 match vinti senza perdere set (sd1 m1, m3) + sd2 m2 = 3
    assert.equal(didi.serie.vittorieMax, 1);
    assert.equal(didi.serie.cleanSweep, 3);
    assert.equal(didi.serie.vittorieAttuale, 0);
});

// ---------- globali ----------
test('globali: la beta non conta, il ranking è quello salvato', () => {
    const r = calcola(dati);
    const didi = trova(r.players, p => p.id === 'didi');
    assert.equal(didi.elo, 1234);                       // players/didi/stats/individual-stats/ranking
    assert.equal(r.totali.match, 9 + 1 + 1);            // s1 (9 VGC + 1 OU) + s2, niente beta
    assert.equal(didi.stagioniGiocate, 1);              // s1 (la s2 non ha match di Didi)
    assert.equal(didi.stagioniVinte, 1);
    assert.deepEqual(r.stagioni.map(s => s.id), ['s2', 's1', 'sbeta']);
    assert.ok(!r.players.some(p => p.stagioniGiocate === 0));
});

test('globali: senza ranking salvato si parte da 1000 più le variazioni', () => {
    const r = calcola(dati);
    const lu = trova(r.players, p => p.id === 'lu');
    assert.equal(lu.elo, 1000 + lu.eloDelta);
});

test('la beta si può scegliere come stagione', () => {
    const r = calcola(dati, { stagione: 'sbeta' });
    assert.equal(r.totali.match, 1);
    assert.deepEqual(r.players.map(p => p.id), ['lu', 'didi']);
    assert.equal(trova(r.players, p => p.id === 'lu').stagioniVinte, 1);
});

test('stagione in corso: nessuno ha vinto', () => {
    const r = calcola(dati, { stagione: 's2' });
    assert.equal(r.totali.match, 1);
    assert.ok(r.players.every(p => p.stagioniVinte === 0));
});

// ---------- Elo ----------
test('Elo di stagione: valore a fine stagione, variazione, picco', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const didi = trova(r.players, p => p.id === 'didi');
    // la somma delle variazioni dei suoi match è la variazione di stagione
    let somma = 0;
    for (const sd of [sd1, sd2]) for (const m of Object.values(sd.matches)) somma += m.player1Id === 'didi' ? m.p1DeltaElo : m.p2DeltaElo;
    assert.equal(didi.eloDelta, somma);
    // l'Elo a fine stagione è quello dopo il suo ultimo match VGC (sd2 match3)
    const ultimo = sd2.matches.match3;
    assert.equal(didi.elo, ultimo.p1EloAtMatch + ultimo.p1DeltaElo);
    assert.ok(didi.eloPicco >= didi.elo);
});

// ---------- team ----------
test('team: risultati, showdown e stagioni vinte', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const alpha = trova(r.teams, t => t.chiave === 'didi::ALPHA');
    assert.deepEqual(alpha.match, { giocati: 4, vinti: 3, persi: 1 });       // sd1 m1 m3, sd2 m1 m2
    assert.deepEqual(alpha.set, { giocati: 9, vinti: 7, persi: 2 });
    assert.deepEqual(alpha.showdown, { giocati: 2, vinti: 1, persi: 1 });
    assert.equal(alpha.stagioniVinte, 1);
    assert.equal(alpha.formato, 'VGC');
    assert.deepEqual(alpha.specie, ['Garchomp', 'Rotom-Wash', 'Incineroar', 'Amoonguss', 'Urshifu-Rapid-Strike', 'Whimsicott']);
    const beta = trova(r.teams, t => t.chiave === 'didi::BETA');
    assert.deepEqual(beta.match, { giocati: 2, vinti: 0, persi: 2 });
    assert.deepEqual(beta.showdown, { giocati: 2, vinti: 1, persi: 1 });     // lo showdown conta per ogni team usato
    assert.equal(alpha.punti, 2 + 2 + 1 + 2);
    assert.equal(alpha.ultimoUso, '2026-02-05');
    const gamma = trova(r.teams, t => t.chiave === 'lu::GAMMA');
    assert.equal(gamma.stagioniVinte, 0);
});

test('team: KO fatti e subiti dai set con statistiche', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const alpha = trova(r.teams, t => t.chiave === 'didi::ALPHA');
    // set1: 1 subito, 4 fatti; set2: 0 subiti, 4 fatti
    assert.equal(alpha.ko.setConDati, 2);
    assert.equal(alpha.ko.fatti, 8);
    assert.equal(alpha.ko.subiti, 1);
    assert.equal(alpha.ko.differenza, 7);
    assert.equal(alpha.ko.setPerfetti, 1);          // set2: nessun Pokémon perso
    assert.equal(alpha.ko.setAlLimite, 0);
    assert.equal(alpha.ko.turniMedi, 6.5);
    assert.equal(alpha.ko.fattiPerSet, 4);
    const beta = trova(r.teams, t => t.chiave === 'didi::BETA');
    // set3 (sd1 match2): BETA perde con 4 Pokémon KO, ne manda KO 3
    assert.equal(beta.ko.setConDati, 1);
    assert.equal(beta.ko.fatti, 3);
    assert.equal(beta.ko.subiti, 4);
    const gamma = trova(r.teams, t => t.chiave === 'lu::GAMMA');
    assert.equal(gamma.ko.setConDati, 3);
    assert.equal(gamma.ko.fatti, 1 + 0 + 4);        // set3: Didi ha perso 4; set1 e set2: Didi ne ha persi 1 e 0
    assert.equal(gamma.ko.subiti, 4 + 4 + 3);
    assert.equal(gamma.ko.setAlLimite, 1);          // set3: vince con un solo Pokémon rimasto (4 portati, 3 KO)
});

test('match senza statistiche contano per i risultati ma non per i KO', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const delta = trova(r.teams, t => t.chiave === 'tom::DELTA');
    assert.equal(delta.match.giocati, 6);
    assert.equal(delta.ko.setConDati, 0);
    assert.equal(delta.ko.fatti, 0);
});

// ---------- Pokémon ----------
test('Pokémon: è quello di quel team, non la specie', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const amoongussDidi = trova(r.pokemon, p => p.chiave === 'didi::ALPHA::amoonguss');
    const amoongussLu = trova(r.pokemon, p => p.chiave === 'lu::GAMMA::amoonguss');
    assert.ok(amoongussDidi && amoongussLu);
    assert.notEqual(amoongussDidi.chiave, amoongussLu.chiave);
    assert.equal(amoongussDidi.team, 'ALPHA');
    assert.equal(amoongussLu.team, 'GAMMA');
});

test('Pokémon: KO, quota dei KO del team, ultimo rimasto, portato', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const garchomp = trova(r.pokemon, p => p.chiave === 'didi::ALPHA::garchomp');
    assert.equal(garchomp.specie, 'Garchomp');
    assert.equal(garchomp.setConDati, 2);
    assert.equal(garchomp.portato, 2);
    assert.equal(garchomp.titolare, 2);
    assert.equal(garchomp.koFatti, 5);                       // 2 + 3
    assert.equal(garchomp.koDiretti, 5);
    assert.equal(garchomp.koIndiretti, 0);
    assert.equal(garchomp.svenuto, 0);
    assert.equal(garchomp.koPerSet, 2.5);
    // KO attribuiti al team ALPHA: Garchomp 5, Rotom-Wash 2, Incineroar 1 → 8
    assert.equal(garchomp.quotaKo, 62.5);
    assert.equal(garchomp.sopravvivenza, 100);
    assert.equal(garchomp.percPortato, 100);
    assert.equal(garchomp.setPortatoVinti, 2);
    assert.equal(garchomp.percVintiPortato, 100);
    assert.equal(garchomp.stagioniVinte, 1);
    assert.deepEqual(garchomp.match, { giocati: 4, vinti: 3, persi: 1 });   // risultati del suo team
    const rotom = trova(r.pokemon, p => p.chiave === 'didi::ALPHA::rotomwash');
    assert.equal(rotom.koFatti, 2);
    assert.equal(rotom.koDiretti, 1);
    assert.equal(rotom.koIndiretti, 1);
    assert.equal(rotom.quotaKo, 25);
    const incineroar = trova(r.pokemon, p => p.chiave === 'didi::ALPHA::incineroar');
    assert.equal(incineroar.svenuto, 1);
    assert.equal(incineroar.sopravvivenza, 50);
    // portato solo 2 volte su 2 set con dati; Urshifu e Whimsicott: mai portati
    const urshifu = trova(r.pokemon, p => p.chiave === 'didi::ALPHA::urshifurapidstrike');
    assert.equal(urshifu.portato, 0);
    assert.equal(urshifu.percPortato, 0);
    assert.equal(urshifu.sopravvivenza, null);
    // ultimo rimasto: Rillaboom (Lu) lo è stato in set1 e set2 (perdendo), Dragonite in set3 (vincendo)
    const rillaboom = trova(r.pokemon, p => p.chiave === 'lu::GAMMA::rillaboom');
    assert.equal(rillaboom.ultimo, 2);
    assert.equal(rillaboom.ultimoVinto, 0);
    const dragonite = trova(r.pokemon, p => p.chiave === 'lu::GAMMA::dragonite');
    assert.equal(dragonite.ultimo, 1);
    assert.equal(dragonite.ultimoVinto, 1);
});

test('Pokémon del Box senza dati di set compaiono con i soli risultati del team', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    const dragapult = trova(r.pokemon, p => p.chiave === 'didi::BETA::dragapult');
    assert.ok(dragapult);
    assert.equal(dragapult.koFatti, 0);
    assert.equal(dragapult.percPortato, null);
    assert.equal(dragapult.match.giocati, 2);
});

test('il Pokémon con più KO è il primo della lista e l\'MVP del giocatore', () => {
    const r = calcola(dati, { stagione: 's1', formato: 'VGC' });
    assert.equal(r.pokemon[0].chiave, 'didi::ALPHA::garchomp');
    assert.deepEqual(trova(r.players, p => p.id === 'didi').mvp, { specie: 'Garchomp', team: 'ALPHA', koFatti: 5 });
});

test('stesso Pokémon due volte nel team: due schede distinte', () => {
    const doppio = JSON.parse(JSON.stringify(dati));
    doppio.players.didi.teams.a.pokemon = roster(['Garchomp', 'Garchomp', 'Rotom-Wash']);
    const r = calcola(doppio, { stagione: 's1', formato: 'VGC' });
    assert.ok(trova(r.pokemon, p => p.chiave === 'didi::ALPHA::garchomp'));
    assert.ok(trova(r.pokemon, p => p.chiave === 'didi::ALPHA::garchomp#2'));
});

test('soprannomi del Box: "Nick (Specie)" diventa la specie', () => {
    const nick = JSON.parse(JSON.stringify(dati));
    nick.players.didi.teams.a.pokemon = roster(['Tank (Garchomp)', 'Rotom-Wash']);
    const r = calcola(nick, { stagione: 's1', formato: 'VGC' });
    const garchomp = trova(r.pokemon, p => p.chiave === 'didi::ALPHA::garchomp');
    assert.equal(garchomp.koFatti, 5);          // i dati del set e quelli del Box finiscono sulla stessa scheda
    assert.equal(r.pokemon.filter(p => p.team === 'ALPHA' && p.specie.toLowerCase().includes('garchomp')).length, 1);
});

// ---------- robustezza ----------
test('dati vuoti, mancanti o strani non rompono nulla', () => {
    for (const d of [undefined, {}, { seasons: {}, players: {} }, { seasons: { s1: {} } }, { seasons: { s1: { showdowns: { a: { matches: { match1: {} } } } } } }]) {
        const r = calcola(d);
        assert.deepEqual(r.players, []);
        assert.deepEqual(r.teams, []);
        assert.deepEqual(r.pokemon, []);
        assert.equal(r.totali.match, 0);
    }
});

test('un match senza giocatori noti o senza punteggio viene ignorato', () => {
    const sporco = JSON.parse(JSON.stringify(dati));
    sporco.seasons.s1.showdowns.sd1.matches.match9 = { player1Id: 'didi', player2Id: 'lu' };        // niente punteggio
    sporco.seasons.s1.showdowns.sd1.matches.match8 = { p1score: 2, p2score: 0 };                    // niente giocatori
    const a = calcola(dati, { stagione: 's1' }), b = calcola(sporco, { stagione: 's1' });
    assert.equal(b.totali.match, a.totali.match);
});

test('il risultato è serializzabile (nessuna funzione, nessun Set)', () => {
    const r = calcola(dati, { stagione: 's1' });
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});
