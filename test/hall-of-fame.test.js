'use strict';
// hall-of-fame.js: i record di sempre, MVP e squadre ideali per stagione, l'archivio dei Match of the week; e il cablaggio della pagina (ex Archive).
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../docs/hall-of-fame.js');
const Statistiche = require('../docs/statistiche.js');
const Mvp = require('../docs/mvp.js');
const MatchSettimana = require('../docs/match-settimana.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const giocatore = (nome, extra = {}) => ({ nome, colore: '#31c489', avatar: '', serie: { vittorieMax: 0, pulitaMax: 0 }, match: { giocati: 0, vinti: 0, persi: 0 }, showdown: { vinti: 0 }, percMatch: null, stagioniVinte: 0, mvpVinti: 0, eloPicco: null, ...extra });

test('records: il podio di ogni primato, a parità in ordine alfabetico; i record a zero non ci sono; le soglie minime valgono', () => {
    const r = H.records({
        players: [
            giocatore('Didi', { serie: { vittorieMax: 6, vittorieMaxData: '2026-10-24', pulitaMax: 0 }, eloPicco: 1100, match: { giocati: 30, vinti: 20, persi: 10 }, percMatch: 66.7 }),
            giocatore('Lu', { serie: { vittorieMax: 15, vittorieMaxData: '2026-10-29', pulitaMax: 5 }, eloPicco: 1160, match: { giocati: 12, vinti: 11, persi: 1 }, percMatch: 91.7 }),
            giocatore('Ada', { serie: { vittorieMax: 6 }, match: { giocati: 4, vinti: 4, persi: 0 }, percMatch: 100 }),   // 4 match: fuori dalla % di vittorie
            giocatore('Tom', { serie: { vittorieMax: 1 }, classificato: false, eloPicco: 1300 }),
            giocatore('Zed', { serie: { vittorieMax: 6 } })
        ],
        teams: [{ nome: 'Alfa', playerNome: 'Didi', serie: { vittorieMax: 4 }, match: { giocati: 6, vinti: 5, persi: 1 }, percMatch: 83.3 }, { nome: 'Beta', playerNome: 'Lu', serie: { vittorieMax: 2 }, match: { giocati: 3, vinti: 3, persi: 0 }, percMatch: 100 }],
        pokemon: [{ specie: 'Garchomp', team: 'Alfa', playerNome: 'Didi', koFatti: 40, koPerSet: 1.4, portato: 30, serie: { vittorieMax: 7 } }, { specie: 'Mew', team: 'Beta', playerNome: 'Lu', koFatti: 3, koPerSet: 3, portato: 2, serie: { vittorieMax: 0 } }]
    });
    const per = id => r.find(x => x.id === id);
    assert.deepEqual(per('serie-allenatore').voci.map(v => [v.nome, v.valore]), [['Lu', '15'], ['Ada', '6'], ['Didi', '6']], 'a pari valore: ordine alfabetico, solo tre');
    assert.equal(per('serie-allenatore').voci[0].quando, '2026-10-29');
    assert.deepEqual(per('elo').voci.map(v => [v.nome, v.valore]), [['Lu', '1160'], ['Didi', '1100']], 'chi non è classificato non entra');
    assert.deepEqual(per('percentuale').voci.map(v => v.nome), ['Lu', 'Didi'], 'sotto 10 match non si entra');
    assert.equal(per('percentuale').voci[0].sotto, '11W · 1L');
    assert.deepEqual(per('percentuale-team').voci.map(v => v.nome), ['Alfa'], 'sotto 5 match non si entra');
    assert.equal(per('percentuale-team').voci[0].sotto, '5W · 1L');
    assert.equal(per('pulita-allenatore').voci.length, 1);
    assert.equal(per('stagioni'), undefined, 'nessuno ha vinto una stagione: il record non c\'è');
    assert.deepEqual(per('ko').voci.map(v => [v.nome, v.valore, v.specie, v.sotto]), [['Garchomp', '40', 'Garchomp', 'Alfa · Didi'], ['Mew', '3', 'Mew', 'Beta · Lu']]);
    assert.deepEqual(per('ko-per-set').voci.map(v => [v.nome, v.valore]), [['Garchomp', '1.4']], 'sotto 8 set non si entra');
    assert.equal(per('serie-team').voci[0].sotto, 'Didi');
    assert.deepEqual(H.records(null), []);
});

test('records dai dati veri: Statistiche.calcola produce un podio per ogni primato senza errori', () => {
    const m = (p1, p2, a, b, data, extra = {}) => ({ player1: p1, player1Id: p1, player2: p2, player2Id: p2, winnerId: a > b ? p1 : p2, team1: 'A', team2: 'B', p1score: a, p2score: b, p1points: a, p2points: b, data, categoria: 'VGC', p1EloAtMatch: 1000, p2EloAtMatch: 1000, p1DeltaElo: 16, p2DeltaElo: -16, ...extra });
    const dati = { players: { didi: { info: { name: 'Didi' } }, lu: { info: { name: 'Lu' } } }, seasons: { s1: { info: { name: 'S1', status: 'closed' }, showdowns: { sd1: { info: { categoria: 'VGC', data: '2026-03-01' }, matches: { m1: m('didi', 'lu', 2, 0, '2026-03-01'), m2: m('didi', 'lu', 2, 1, '2026-03-02') } } } } } };
    const r = H.records(Statistiche.calcola(dati, { stagione: 'all', senzaSquadre: true }));
    const serie = r.find(x => x.id === 'serie-allenatore');
    assert.deepEqual([serie.voci[0].nome, serie.voci[0].valore], ['Didi', '2']);
    assert.ok(r.find(x => x.id === 'match'));
});

test('stagioni: solo le chiuse (non la beta), con MVP registrato e squadra ideale; la più recente prima', () => {
    const mon = nome => ({ nome });
    const sd = (cat, matches) => ({ info: { categoria: cat, data: '2026-03-01' }, matches });
    const set = (specie, portato) => ({ pokemon: [{ specie, portato, titolare: true, koFatti: 2, svenuto: false }], portati: 1, svenuti: 0 });
    const m = { player1: 'didi', player1Id: 'didi', player2: 'lu', player2Id: 'lu', team1: 'A', team2: 'B', p1score: 2, p2score: 0, categoria: 'VGC', data: '2026-03-01', setStats: { set1: { vincitore: 'p1', turni: 8, p1: set('Garchomp', true), p2: set('Rillaboom', true) } } };
    const chiusa = (nome, chiusa) => ({ info: { name: nome, status: 'closed', chiusaIl: chiusa, selected_formats: ['VGC'] }, showdowns: { sd1: sd('VGC', { m1: m }) }, mvp: { risultato: { vincitori: { 0: { chiave: 'didi::A::garchomp', specie: 'Garchomp', player: 'didi', team: 'A' } } } } });
    const dati = { players: { didi: { info: { name: 'Didi' }, teams: {} }, lu: { info: { name: 'Lu' }, teams: {} } }, seasons: {
        s1: chiusa('Season One', '2026-04-01'), s2: chiusa('Season Two', '2026-06-01'),
        s3: { info: { name: 'In corso', status: 'playing' }, showdowns: {} }, sbeta: chiusa('Beta', '2026-01-01')
    } };
    const l = H.stagioni(dati, { Statistiche, Mvp });
    assert.deepEqual(l.map(x => x.stagione), ['s2', 's1'], 'le chiuse, la più recente prima; né la beta né la stagione in corso');
    assert.deepEqual(l[0].mvp, [{ specie: 'Garchomp', player: 'didi', team: 'A' }]);
    assert.ok(Array.isArray(l[0].dream));
    assert.deepEqual(H.stagioni({ seasons: {} }, { Statistiche, Mvp }), []);
});

test('settimane: dal Match of the week più recente, con link al replay senza ?da=home', () => {
    const set = { vincitore: 'p1', turni: 12, rimasti: 1, maxSvantaggio: 3, protagonista: { specie: 'Garchomp' }, motivi: ['Came back from 3 down'] };
    const mkSet = (n, quando) => ({ ...set, stagione: 's1', nomeStagione: 'Season One', showdown: 'sd1', match: 'match1', set: `set${n}`, categoria: 'VGC', data: quando, quando: Date.parse(quando), giocatori: { p1: { id: 'didi', nome: 'Didi', team: 'A' }, p2: { id: 'lu', nome: 'Lu', team: 'B' } } });
    const w = (inizio, s) => ({ inizio: Date.parse(inizio), fine: Date.parse(inizio) + 6 * 86400000, numero: 1, anno: 2026, corrente: false, quanti: 4, scelto: s });
    const l = H.settimane([w('2026-10-12', mkSet(1, '2026-10-13')), w('2026-10-19', mkSet(2, '2026-10-20'))], MatchSettimana);
    assert.equal(l.length, 2);
    assert.match(l[0].link, /^matches\.html\?id=s1&replay=sd1~match1~set2$/, 'la più recente per prima');
    assert.equal(l[0].p1.nome, 'Didi');
    assert.equal(l[0].motivi[0], 'Came back from 3 down');
    assert.deepEqual(H.settimane(null, MatchSettimana), []);
});

test('markup: testo protetto, podio con il primo evidenziato, link all\'allenatore; messaggi quando non c\'è niente', () => {
    const lista = [{ id: 'x', gruppo: 'Trainers', titolo: '<b>Serie</b>', nota: 'n', voci: [{ nome: 'Di<di>', sotto: 's', valore: '15', specie: '', colore: '#ff0000', avatar: 'a.png', link: 'public.html?player=Di%3Cdi%3E', quando: '2026-10-29' }] }];
    const h = H.htmlRecords(lista, { gif: s => `${s}.gif` });
    assert.match(h, /&lt;b&gt;Serie&lt;\/b&gt;/);
    assert.doesNotMatch(h, /<b>Serie<\/b>/);
    assert.match(h, /<a class="hof-nome" href="public\.html\?player=Di%3Cdi%3E">Di&lt;di&gt;<\/a>/);
    assert.match(h, /hof-primo/);
    assert.match(h, /29\/10\/2026/);
    assert.match(H.htmlRecords([]), /No records yet/);
    assert.match(H.htmlStagioni([]), /No MVP or Dream Team yet/);
    assert.match(H.htmlSettimane([]), /No Match of the week yet/);
    const st = H.htmlStagioni([{ stagione: 's1', nome: 'S<1>', data: '2026-04-01', mvp: [{ specie: 'Garchomp', player: 'Didi', team: 'A' }], dream: [{ specie: 'Rillaboom', player: 'Lu', team: 'B', formato: 'VGC' }] }], { gif: s => `${s}.gif` });
    assert.match(st, /S&lt;1&gt;/);
    assert.match(st, /Season MVP<\/h4>[\s\S]*Garchomp[\s\S]*Dream Team<\/h4>[\s\S]*Rillaboom/);
    // le settimane usano il banner della home (MatchSettimana.html), una volta per settimana e senza frecce; il replay non riporta alla home
    const finto = { html: (sc, o) => `<banner ${sc.stagione} ${o.settimana.titolo} ${o.totale} ${o.daHome}>` };
    const se = H.htmlSettimane([{ titolo: 'Last <week>', intervallo: '1 Nov', scelto: { stagione: 's1' } }], { MatchSettimana: finto, giocatori: { lu: { color: '#fff', avatar: 'a.png' } } });
    assert.equal(se, '<ol class="hof-settimane"><li class="ms hof-ms"><banner s1 Last <week> 1 false></li></ol>');
});

test('cablaggio: la pagina si chiama Hall of Fame (titolo e menu), ha le quattro sezioni e carica i moduli; le stagioni intere si leggono solo alla prima apertura', () => {
    const p = leggi('docs', 'palmares.html');
    assert.match(p, /<title>Hall of Fame<\/title>/);
    assert.match(p, /<h1 class="hub-title-display">HALL OF FAME<\/h1>/);
    for (const v of ['stagioni', 'records', 'mvp', 'settimane']) assert.ok(p.includes(`data-vista="${v}"`), v);
    for (const f of ['statistiche.js', 'mvp.js', 'match-settimana.js', 'sprite-pkm.js', 'hall-of-fame.js']) assert.ok(p.includes(`<script src="${f}"></script>`), f);
    assert.ok(p.indexOf('hall-of-fame.js') < p.indexOf('palmares.js'));
    const js = leggi('docs', 'palmares.js');
    assert.match(js, /function montaSezioni\(giocatori\)/);
    assert.match(js, /if \(vista === 'stagioni' \|\| pronte\[vista\]\) return;/);
    assert.match(js, /get\('sezione'\)/);
    assert.ok(leggi('docs', 'style-palmares.css').includes('.hof-record'));
    for (const f of ['match-settimana.css', 'nome-scorrevole.css']) assert.ok(p.includes(`<link rel="stylesheet" href="${f}">`), f);
    for (const f of ['medaglione-pkm.js', 'nome-scorrevole.js']) assert.ok(p.includes(`<script src="${f}"></script>`), f);
    assert.match(js, /MatchSettimana: window\.MatchSettimana/);
    assert.match(leggi('docs', 'match-settimana.js'), /\$\{daHome \? '&da=home' : ''\}/);
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'docs')).filter(n => n.endsWith('.html'))) {
        const t = leggi('docs', f);
        assert.ok(!/fa-trophy"><\/i> ARCHIVE/.test(t), `${f}: il menu dice ancora ARCHIVE`);
    }
});
