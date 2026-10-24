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

test('catalogo: dieci badge con quattro soglie crescenti ciascuno (bronzo, argento, oro, platino)', () => {
    assert.equal(B.CATALOGO.length, 10);
    const ids = new Set();
    for (const b of B.CATALOGO) {
        assert.ok(!ids.has(b.id), `id doppio: ${b.id}`); ids.add(b.id);
        assert.equal(b.soglie.length, 4, b.id);
        assert.ok(b.soglie.every((v, i) => i === 0 || v > b.soglie[i - 1]), `soglie in ordine: ${b.id}`);
        assert.ok(b.immagini.length === 1 || b.immagini.length === 4, b.id);
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

test('livelli: bronzo, argento, oro e platino alle soglie; al massimo la barra è piena e non c\'è un prossimo traguardo', () => {
    const l = B.calcola(team({ match: { giocati: 40, vinti: 33, persi: 7 }, showdown: { giocati: 40, vinti: 35, persi: 5 }, stagioniVinte: 1, stagioniGiocate: 4 }));
    assert.equal(perId(l, 'winner').livello, 2, '33 match vinti: argento (32), non ancora oro (52)');
    assert.equal(perId(l, 'winner').prossima, 52);
    assert.equal(perId(l, 'showdown').livello, 4, '35 showdown vinti: platino');
    assert.equal(perId(l, 'showdown').livelloNome, 'Platinum');
    assert.equal(perId(l, 'showdown').classeLivello, 'platinum');
    assert.equal(perId(l, 'showdown').prossima, null);
    assert.equal(perId(l, 'showdown').progresso, 1);
    assert.equal(perId(l, 'champion').livello, 1);
    assert.equal(perId(l, 'veteran').livelloNome, 'Gold');
    assert.equal(perId(l, 'winner').progresso, 33 / 52, 'la barra è quella dei numeri "33 / 52"');
    assert.deepEqual(B.guadagnati(l).map(b => b.id).slice(0, 2), ['showdown', 'veteran'], 'prima i più alti, a parità l\'ordine del catalogo');
});

test('le serie (match, match puliti, showdown di fila) e i KO usano i numeri del team', () => {
    // soglie: vittorie di fila 8/11/14/18, match puliti 3/4/5/6, showdown di fila 6/8/11/15, KO 330/530/800/1250, set perfetti 8/13/20/30
    const l = B.calcola(team({ serie: { vittorieMax: 11, pulitaMax: 6, showdownMax: 8 }, ko: { fatti: 530, setPerfetti: 8, setConDati: 9 } }));
    assert.equal(perId(l, 'winstreak').livello, 2);
    assert.equal(perId(l, 'cleanstreak').livello, 4);
    assert.equal(perId(l, 'sdstreak').livello, 2);
    assert.equal(perId(l, 'knockout').livello, 2);
    assert.equal(perId(l, 'flawless').livello, 1);
});

test('percentuale di match vinti: sotto i 18 match non conta, e dice quanto manca (come i fiocchi)', () => {
    const poco = perId(B.calcola(team({ match: { giocati: 6, vinti: 6, persi: 0 }, percMatch: 100 })), 'winrate');
    assert.equal(poco.livello, 0);
    const minimo = B.CATALOGO.find(b => b.id === 'winrate').minimo.valore;
    assert.equal(minimo, 18, 'servono diciotto match giocati (una stagione di un team, o più)');
    assert.equal(poco.progresso, 6 / minimo);
    assert.deepEqual({ v: poco.sblocco.valore, s: poco.sblocco.serve }, { v: 6, s: minimo });
    assert.match(poco.nota, /needs 18 matches played \(now 6\)/);
    assert.match(B.htmlBadge(poco), /<span class="bt-et">Matches played<\/span><span class="bt-val"><b>6<\/b> <i>\/ 18<\/i><\/span>/);
    // soglie 68% / 73% / 78% / 85%
    const abbastanza = perId(B.calcola(team({ match: { giocati: 20, vinti: 18, persi: 2 }, percMatch: 90 })), 'winrate');
    assert.equal(abbastanza.livello, 4);
    assert.equal(abbastanza.nota, '');
});

test('immagini: tutte col prefisso badge-team-, un file per livello per ogni badge (anche le serie)', () => {
    const l = B.calcola(null);
    // il non preso mostra il bronzo, come per gli altri badge
    assert.equal(perId(l, 'winstreak').immagine, 'immagini/badge-team-winstreak-bronze.png');
    assert.equal(perId(l, 'cleanstreak').immagine, 'immagini/badge-team-cleanstreak-bronze.png');
    assert.equal(perId(l, 'sdstreak').immagine, 'immagini/badge-team-sdstreak-bronze.png');
    assert.equal(perId(l, 'champion').immagine, 'immagini/badge-team-champion-bronze.png');
    const alto = B.calcola(team({ serie: { vittorieMax: 14, pulitaMax: 4, showdownMax: 15 }, match: { giocati: 60, vinti: 52, persi: 8 } }));
    assert.equal(perId(alto, 'winstreak').immagine, 'immagini/badge-team-winstreak-gold.png');
    assert.equal(perId(alto, 'cleanstreak').immagine, 'immagini/badge-team-cleanstreak-silver.png');
    assert.equal(perId(alto, 'sdstreak').immagine, 'immagini/badge-team-sdstreak-platinum.png');
    assert.equal(perId(alto, 'winner').immagine, 'immagini/badge-team-winner-gold.png');
    // dieci badge × quattro livelli
    assert.equal(B.IMMAGINI.length, 40);
    assert.ok(B.IMMAGINI.includes('badge-team-knockout-silver.png'));
    assert.ok(B.IMMAGINI.includes('badge-team-knockout-platinum.png'));
    assert.ok(B.IMMAGINI.every(n => /^badge-team-[a-z]+-(bronze|silver|gold|platinum)\.png$/.test(n)), 'nomi sbagliati');
    for (const b of B.CATALOGO) assert.equal(b.immagini.length, 4, b.id);
});

test('HTML: lo scaffale mostra tutti i badge, le medagliette solo i migliori (con "+n"), e il testo di chi scrive è protetto', () => {
    const lista = B.calcola(team({ match: { giocati: 40, vinti: 30, persi: 10 }, showdown: { giocati: 5, vinti: 5, persi: 0 }, stagioniVinte: 3, stagioniGiocate: 5, serie: { vittorieMax: 7, pulitaMax: 4, showdownMax: 5 } }));
    const scaffale = B.htmlScaffale(lista);
    assert.equal((scaffale.match(/class="bt bt-/g) || []).length, 10);
    assert.match(scaffale, /TEAM BADGES <small class="bt-conto">\d+\/10<\/small>/);
    assert.match(B.htmlMini(lista, 3), /bt-altri" title="\d+ more badges?">\+\d+<\/span>/);
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
    // Stats mostra le medagliette vinte (le prime quattro sulla card, tutte nel dettaglio), mai il progresso: quello è solo nel Box del giocatore
    assert.match(doc('stats.js'), /BadgeTeam\.htmlMini\(BadgeTeam\.calcola\(t\), 99\)/);
    assert.match(doc('stats.js'), /BadgeTeam\.htmlMini\(BadgeTeam\.calcola\(t\), 4\)/);
    assert.doesNotMatch(doc('stats.js'), /htmlScaffale/, 'Stats: niente scaffale con il progresso');
    assert.match(doc('box.html'), /BadgeTeam\.montaBarra\(db, content\.querySelector\('\[data-badge-team\]'\)[^\n]*progresso: true/, 'Box: il tasto "Badges x/10" con il progresso');
    assert.doesNotMatch(doc('public.html'), /progresso: true/, 'pagina pubblica: solo le medagliette');
});

// ---------- le medagliette (l'unico modo in cui un team si mostra fuori dal Box) ----------
test('testoMedaglia: nome e livello, descrizione e quanto vale, una riga ciascuno (è la descrizione al passaggio)', () => {
    const lista = B.calcola(team({ match: { giocati: 40, vinti: 29, persi: 11 }, stagioniVinte: 1, stagioniGiocate: 5 }));
    const preso = B.guadagnati(lista)[0];
    assert.ok(preso, 'il team ha almeno un badge');
    const righe = B.testoMedaglia(preso).split('\n');
    assert.equal(righe.length, 3);
    assert.equal(righe[0], `${preso.nome} · ${preso.livelloNome}`);
    assert.equal(righe[1], preso.descrizione);
    assert.match(righe[2], /\d/, 'il numero raggiunto');
});

test('htmlMedaglietta: cerchio del livello con l\'immagine, descrizione al passaggio e per la tastiera; il testo è protetto', () => {
    const b = { id: 'champion', nome: '"><img src=x onerror=alert(1)>', livelloNome: 'Gold', descrizione: '<b>d</b>', valore: 5, unita: 'seasons won', classeLivello: 'gold', immagine: 'a.png', icona: '🏅' };
    const h = B.htmlMedaglietta(b);
    assert.match(h, /^<span class="bt-mini bt-gold" tabindex="0" role="img" aria-label="[^"]*" title="[^"]*">/);
    assert.match(h, /<img class="bt-mini-img"/);
    assert.doesNotMatch(h, /<img src=x onerror=/, 'il nome non esce dall\'attributo');
    assert.doesNotMatch(h, /<b>d<\/b>/);
    // la descrizione si può dare a mano (la usano la pagina Trainers e il simulatore); per chi legge lo schermo le righe si separano con un punto
    const h2 = B.htmlMedaglietta({ ...b, nome: 'Ok' }, 'Titolo\nSeconda riga');
    assert.match(h2, /title="Titolo\nSeconda riga"/);
    assert.match(h2, /aria-label="Titolo\. Seconda riga"/);
});

function casellaFinta() {
    const elementi = {
        '.bt-apri': { setAttribute() {}, addEventListener() {}, contains: () => false, focus() {} },
        '.bt-pop': { hidden: true, style: {}, contains: () => false, getBoundingClientRect: () => ({ right: 0, top: 0 }) }
    };
    return { innerHTML: '', querySelector: sel => elementi[sel] || null };
}

test('montaBarra: senza "progresso" solo le medagliette vinte; con "progresso" (il Box del giocatore) il tasto "Badges x/10" e lo scaffale', async () => {
    // in Node non c'è Fiocchi: i dati dal vivo non arrivano (c'è la nota) ma la barra si monta lo stesso, con i badge a zero
    const sola = casellaFinta();
    assert.equal(await B.montaBarra(null, sola, { giocatore: 'didi', team: { nome: 'Alfa' } }), true);
    assert.equal(sola.innerHTML, '', 'nessun badge vinto: niente barra');
    assert.doesNotMatch(sola.innerHTML, /bt-apri|bt-pop/);

    const col = casellaFinta();
    assert.equal(await B.montaBarra(null, col, { giocatore: 'didi', team: { nome: 'Alfa' }, progresso: true }), true);
    assert.match(col.innerHTML, /<button type="button" class="bt-apri" aria-expanded="false" aria-haspopup="dialog">🏅 Badges <b>0\/10<\/b><\/button>/);
    assert.match(col.innerHTML, /<div class="bt-pop" role="dialog" aria-label="Team badges" hidden>/);
    assert.equal((col.innerHTML.match(/data-badge="/g) || []).length, 10, 'lo scaffale ha tutti e dieci i badge, con il progresso');
    assert.match(col.innerHTML, /class="bt-nota"/, 'e la nota che i dati dal vivo non ci sono');

    // senza giocatore o team non si monta niente; una barra superata da un'altra apertura (valido) non si tocca
    assert.equal(await B.montaBarra(null, casellaFinta(), { giocatore: 'didi' }), false);
    assert.equal(await B.montaBarra(null, null, { giocatore: 'didi', team: { nome: 'Alfa' } }), false);
    const intatta = casellaFinta(); intatta.innerHTML = 'vecchio';
    assert.equal(await B.montaBarra(null, intatta, { giocatore: 'didi', team: { nome: 'Alfa' }, progresso: true, valido: () => false }), false);
    assert.equal(intatta.innerHTML, 'vecchio');
});

test('montaMini: la barra delle testate strette (il replay) è sempre solo medagliette, mai il progresso', async () => {
    const c = casellaFinta();
    assert.equal(await B.montaMini(null, c, { giocatore: 'didi', team: { nome: 'Alfa' } }), true);
    assert.doesNotMatch(c.innerHTML, /bt-apri|bt-pop/);
});

// ---------- ordine per vicinanza al prossimo livello ----------
test('perVicinanza: dal più vicino al prossimo livello al più lontano; a parità l\'ordine del catalogo; in fondo chi ha già l\'oro', () => {
    const l = B.calcola(team({
        match: { giocati: 40, vinti: 31, persi: 9 },                  // Winner: 31 / 32 (bronzo preso), il più vicino
        stagioniGiocate: 2,                                              // Veteran: 2 / 3
        serie: { vittorieMax: 0, pulitaMax: 0, showdownMax: 0 },
        showdown: { giocati: 40, vinti: 35, persi: 5 },                  // Showdown Winner: platino (35), in fondo
        ko: { fatti: 330, setPerfetti: 0, setConDati: 9 }                // Knockout: bronzo, 330 / 530
    }));
    const ordine = B.perVicinanza(l).map(b => b.id);
    assert.equal(ordine[0], 'winner', 'il più vicino: 31 su 32');
    assert.ok(ordine.indexOf('veteran') < ordine.indexOf('knockout'), '2/3 prima di 330/530');
    assert.equal(ordine[ordine.length - 1], 'showdown', 'chi ha già il platino va in fondo');
    // chi è a zero resta nell'ordine del catalogo, tutti insieme, prima di chi ha già l'oro
    const azzerati = ordine.filter(id => perId(l, id).progresso === 0 && perId(l, id).prossima != null);
    assert.deepEqual(azzerati, B.CATALOGO.map(b => b.id).filter(id => azzerati.includes(id)));
    // la lista originale non si tocca, e dentro ci sono tutti
    assert.equal(l[0].id, 'champion');
    assert.equal(new Set(ordine).size, B.CATALOGO.length);
});

test('htmlScaffale: i badge escono nell\'ordine di vicinanza (o in quello del catalogo con ordina: false), con il riepilogo dei livelli', () => {
    const l = B.calcola(team({ stagioniGiocate: 2, match: { giocati: 40, vinti: 29, persi: 11 } }));
    const ids = html => [...html.matchAll(/data-badge="([a-z]+)"/g)].map(m => m[1]);
    assert.deepEqual(ids(B.htmlScaffale(l)), B.perVicinanza(l).map(b => b.id));
    assert.deepEqual(ids(B.htmlScaffale(l, { ordina: false })), l.map(b => b.id));
    const html = B.htmlScaffale(l, { titolo: 'TEAM BADGES' });
    assert.match(html, /TEAM BADGES <small class="bt-conto">\d+\/10<\/small>/);
    assert.match(html, /<b>\d+<\/b>\/10 badges/);
    assert.match(html, /<b>\d+<\/b>\/40 levels/);
    assert.match(html, /Closest to the next level first\./);
    // niente fumetti nascosti: spiegazione, traguardi, barra e cosa manca sono sempre visibili
    assert.doesNotMatch(html, /bt-tip/);
    for (const parte of ['bt-desc', 'bt-livelli', 'bt-barra', 'bt-frase']) assert.ok(html.includes(parte), parte);
});

test('una riga di badge: i quattro livelli con il prossimo evidenziato, la barra uguale ai numeri, e cosa manca', () => {
    const l = B.calcola(team({ stagioniGiocate: 2 }));
    const veteran = perId(l, 'veteran');                      // 2 stagioni: bronzo (2), prossimo argento (3)
    const riga = B.htmlBadge(veteran);
    assert.match(riga, /class="bt bt-bronze bt-p-silver"/, 'colore del livello preso e di quello in arrivo');
    assert.match(riga, /bt-lv bt-lv-bronze done">Bronze <b>2<\/b>/);
    assert.match(riga, /bt-lv bt-lv-silver next">Silver <b>3<\/b>/);
    assert.match(riga, /bt-lv bt-lv-gold ">Gold <b>4<\/b>/);
    assert.match(riga, /bt-lv bt-lv-platinum ">Platinum <b>6<\/b>/);
    assert.match(riga, /<b>2<\/b> <i>\/ 3<\/i>/);
    assert.match(riga, /aria-valuenow="67"/);
    assert.match(riga, /1 more to unlock Silver\./);
    const oro = B.htmlBadge(perId(B.calcola(team({ stagioniGiocate: 6 })), 'veteran'));
    assert.match(oro, /bt-completo/);
    assert.match(oro, /Platinum reached: badge complete!/);
    assert.match(oro, /<i>MAX<\/i>/);
    // la percentuale ha il suo segno e la sua etichetta
    const wr = B.htmlBadge(perId(B.calcola(team({ match: { giocati: 20, vinti: 15, persi: 5 }, percMatch: 75 })), 'winrate'));
    assert.match(wr, /Win rate<\/span><span class="bt-val"><b>75%<\/b>/);
});

test('il pannello dei badge nella testata del team: si apre e si chiude (tasto, clic fuori, Esc), senza il vecchio title del tasto', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'docs', 'badge-team.js'), 'utf8');
    const barra = src.slice(src.indexOf('async function montaBarra'), src.indexOf('async function riempiCard'));
    assert.doesNotMatch(barra, /title="All the badges of this team"/);
    assert.match(barra, /aria-haspopup="dialog"/);
    assert.match(barra, /e\.key === 'Escape'/);
    assert.match(barra, /document\.addEventListener\('click', fuori, true\)/);
    assert.match(barra, /document\.removeEventListener\('click', fuori, true\)/);
    assert.match(barra, /titolo: 'TEAM BADGES'/);
});
