'use strict';
// badge-team.js: i badge di un team (livelli, soglie, minimo di match, medagliette) e il loro collegamento alle pagine
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../docs/badge-team.js');
const Statistiche = require('../docs/statistiche.js');

const perId = (lista, id) => lista.find(b => b.id === id);
const team = (extra = {}) => ({
    player: 'didi', nome: 'Alfa', stagioniVinte: 0, stagioniGiocate: 1,
    match: { giocati: 0, vinti: 0, persi: 0 }, set: { giocati: 0, vinti: 0, persi: 0 }, showdown: { giocati: 0, vinti: 0, persi: 0 },
    percMatch: null, serie: { vittorieMax: 0, pulitaMax: 0, showdownMax: 0 }, ko: { fatti: 0, setPerfetti: 0, setConDati: 0 },
    ...extra
});

test('catalogo: dieci badge con tre soglie crescenti ciascuno', () => {
    assert.equal(B.CATALOGO.length, 10);
    const ids = new Set();
    for (const b of B.CATALOGO) {
        assert.ok(!ids.has(b.id), `id doppio: ${b.id}`); ids.add(b.id);
        assert.equal(b.soglie.length, 3, b.id);
        assert.ok(b.soglie[0] < b.soglie[1] && b.soglie[1] < b.soglie[2], `soglie in ordine: ${b.id}`);
        assert.ok(b.immagini.length === 1 || b.immagini.length === 3, b.id);
    }
});

test('un team che non ha mai giocato: nessun badge, barre a zero (senza errori)', () => {
    for (const lista of [B.calcola(null), B.calcola(team())]) {
        assert.equal(lista.length, 10);
        assert.ok(lista.every(b => b.livello === 0 && b.classeLivello === 'locked'));
        assert.equal(B.guadagnati(lista).length, 0);
        assert.equal(B.htmlMini(lista), '');
    }
});

test('livelli: bronzo, argento e oro alle soglie; al massimo la barra è piena e non c\'è un prossimo traguardo', () => {
    const l = B.calcola(team({ match: { giocati: 40, vinti: 29, persi: 11 }, showdown: { giocati: 12, vinti: 10, persi: 2 }, stagioniVinte: 1, stagioniGiocate: 5 }));
    assert.equal(perId(l, 'winner').livello, 2, '29 match vinti: argento (15), non ancora oro (30)');
    assert.equal(perId(l, 'winner').prossima, 30);
    assert.equal(perId(l, 'showdown').livello, 3);
    assert.equal(perId(l, 'showdown').prossima, null);
    assert.equal(perId(l, 'showdown').progresso, 1);
    assert.equal(perId(l, 'champion').livello, 1);
    assert.equal(perId(l, 'veteran').livelloNome, 'Gold');
    assert.equal(perId(l, 'winner').progresso, (29 - 15) / (30 - 15));
    assert.deepEqual(B.guadagnati(l).map(b => b.id).slice(0, 2), ['showdown', 'veteran'], 'prima i più alti, a parità l\'ordine del catalogo');
});

test('le serie (match, match puliti, showdown di fila) e i KO usano i numeri del team', () => {
    const l = B.calcola(team({ serie: { vittorieMax: 5, pulitaMax: 4, showdownMax: 3 }, ko: { fatti: 120, setPerfetti: 2, setConDati: 9 } }));
    assert.equal(perId(l, 'winstreak').livello, 2);
    assert.equal(perId(l, 'cleanstreak').livello, 3);
    assert.equal(perId(l, 'sdstreak').livello, 2);
    assert.equal(perId(l, 'knockout').livello, 2);
    assert.equal(perId(l, 'flawless').livello, 1);
});

test('percentuale di match vinti: sotto i 10 match non conta, e dice quanto manca (come i fiocchi)', () => {
    const poco = perId(B.calcola(team({ match: { giocati: 6, vinti: 6, persi: 0 }, percMatch: 100 })), 'winrate');
    assert.equal(poco.livello, 0);
    assert.equal(poco.progresso, 0.6);
    assert.deepEqual({ v: poco.sblocco.valore, s: poco.sblocco.serve }, { v: 6, s: 10 });
    assert.match(poco.nota, /needs 10 matches played \(now 6\)/);
    assert.match(B.htmlBadge(poco), /<div class="bt-valore">6 <i>\/ 10<\/i><\/div>/);
    const abbastanza = perId(B.calcola(team({ match: { giocati: 12, vinti: 9, persi: 3 }, percMatch: 75 })), 'winrate');
    assert.equal(abbastanza.livello, 3);
    assert.equal(abbastanza.nota, '');
});

test('immagini: tutte col prefisso badge-team-, le serie con un file solo, gli altri con un file per livello', () => {
    const l = B.calcola(null);
    assert.equal(perId(l, 'winstreak').immagine, 'immagini/badge-team-winstreak.png');
    assert.equal(perId(l, 'cleanstreak').immagine, 'immagini/badge-team-cleanstreak.png');
    assert.equal(perId(l, 'sdstreak').immagine, 'immagini/badge-team-sdstreak.png');
    assert.equal(perId(l, 'champion').immagine, 'immagini/badge-team-champion-bronze.png');
    assert.equal(perId(B.calcola(team({ match: { giocati: 40, vinti: 30, persi: 10 } })), 'winner').immagine, 'immagini/badge-team-winner-gold.png');
    // 7 badge × 3 livelli + 3 serie con un file solo
    assert.equal(B.IMMAGINI.length, 24);
    assert.ok(B.IMMAGINI.includes('badge-team-knockout-silver.png'));
    assert.ok(B.IMMAGINI.every(n => /^badge-team-[a-z]+(-(bronze|silver|gold))?\.png$/.test(n)), 'nomi sbagliati');
});

test('HTML: lo scaffale mostra tutti i badge, le medagliette solo i migliori (con "+n"), e il testo di chi scrive è protetto', () => {
    const lista = B.calcola(team({ match: { giocati: 40, vinti: 30, persi: 10 }, showdown: { giocati: 5, vinti: 5, persi: 0 }, stagioniVinte: 3, stagioniGiocate: 5, serie: { vittorieMax: 7, pulitaMax: 4, showdownMax: 5 } }));
    const scaffale = B.htmlScaffale(lista);
    assert.equal((scaffale.match(/class="bt bt-/g) || []).length, 10);
    assert.match(scaffale, /TEAM BADGES <small class="bt-conto">\d+\/10<\/small>/);
    assert.match(B.htmlMini(lista, 3), /bt-altri" title="\d+ more badges">\+\d+<\/span>/);
    assert.equal((B.htmlMini(lista, 3).match(/class="bt-mini bt-(?!altri)/g) || []).length, 3);
    const strano = Object.assign(B.calcola(null)[0], { nome: '<img onerror=x>' });
    assert.doesNotMatch(B.htmlBadge(strano), /<img onerror/);
});

test('trova: il team di un giocatore tra quelli di Statistiche, senza badare alle maiuscole', () => {
    const r = { teams: [{ player: 'didi', nome: 'Alfa' }, { player: 'lu', nome: 'Alfa' }] };
    assert.equal(B.trova(r, { player: 'LU', team: ' alfa ' }).player, 'lu');
    assert.equal(B.trova(r, { player: 'didi', team: 'Zeta' }), null);
    assert.equal(B.trova(null, { player: 'didi', team: 'Alfa' }), null);
});

test('Statistiche: le serie dei team (match, puliti, showdown di fila) sono quelle che i badge leggono', () => {
    const match = (n, p1, p2, s1, s2, vincitoreSd) => ({ player1Id: p1, player2Id: p2, p1score: s1, p2score: s2, winnerId: s1 > s2 ? p1 : p2, team1: p1 === 'didi' ? 'Alfa' : 'Beta', team2: p2 === 'didi' ? 'Alfa' : 'Beta', data: `2026-01-0${n}`, categoria: 'OU' });
    const sd = (id, vincitore, matches) => ({ info: { categoria: 'OU', data: '2026-01-01', vincitoreShowdown: vincitore }, matches });
    const seasons = {
        s1: { info: { status: 'closed' }, showdowns: {
            a: sd('a', 'didi', { match1: match(1, 'didi', 'lu', 2, 0), match2: match(2, 'didi', 'lu', 2, 1) }),
            b: sd('b', 'didi', { match1: match(3, 'didi', 'lu', 2, 0) }),
            c: sd('c', 'lu', { match1: match(4, 'didi', 'lu', 0, 2) })
        } }
    };
    const r = Statistiche.calcola({ seasons, players: { didi: { info: { name: 'Didi' }, teams: { t: { nome: 'Alfa', categoria: 'OU', pokemon: [] } } } } });
    const alfa = r.teams.find(t => t.nome === 'Alfa');
    assert.equal(alfa.serie.vittorieMax, 3);
    assert.equal(alfa.serie.vittorieAttuale, 0, 'l\'ultimo match è perso');
    assert.equal(alfa.serie.pulitaMax, 1, 'il 2-1 spezza la serie di match puliti');
    assert.equal(alfa.serie.cleanSweep, 2);
    assert.equal(alfa.serie.showdownMax, 2, 'due showdown vinti di fila, poi uno perso');
    assert.equal(alfa.serie.showdownAttuale, 0);
    const beta = r.teams.find(t => t.nome === 'Beta');
    assert.equal(beta.serie.vittorieMax, 1);
    assert.equal(beta.serie.showdownMax, 1);
});

test('collegamento: Box, pagina pubblica e Stats mostrano i badge dei team; i tre badge di serie della pagina pubblica sono ora nel catalogo', () => {
    const doc = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
    for (const f of ['box.html', 'public.html', 'stats.html']) {
        assert.match(doc(f), /<script src="badge-team\.js"><\/script>/, f);
        assert.match(doc(f), /href="badge-team\.css"/, f);
    }
    assert.match(doc('box.html'), /BadgeTeam\.montaBarra\(db, content\.querySelector\('\[data-badge-team\]'\)/);
    assert.match(doc('box.html'), /BadgeTeam\.riempiCard\(db, grid/);
    assert.match(doc('box.html'), /data-team-badge="\$\{team\.id\}"/);
    assert.match(doc('public.html'), /BadgeTeam\.montaBarra\(db, content\.querySelector\('\[data-badge-team\]'\)/);
    assert.doesNotMatch(doc('public.html'), /teamBadgesHtml|maxshowdownstrike/, 'niente più la copia dei tre badge di serie');
    assert.match(doc('stats.js'), /BadgeTeam\.htmlScaffale\(BadgeTeam\.calcola\(t\)/);
    assert.match(doc('stats.js'), /BadgeTeam\.htmlMini\(BadgeTeam\.calcola\(t\), 4\)/);
});
