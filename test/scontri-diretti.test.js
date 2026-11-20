'use strict';
// scontri-diretti.js: il testa a testa tra due allenatori (pagina Trainers e app). I numeri devono essere gli stessi di Profile > Rivals (profilo-personale.js).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../docs/profilo-personale.js');
const SD = require('../docs/scontri-diretti.js');

// ---------- dati di prova ----------
const match = (p1, p2, s1, s2, extra = {}) => ({
    player1: p1, player1Id: p1.toLowerCase(), player2: p2, player2Id: p2.toLowerCase(),
    p1score: s1, p2score: s2, winnerId: (s1 > s2 ? p1 : p2).toLowerCase(), ...extra
});
const showdown = (p1, p2, categoria, risultati, info = {}) => ({
    info: { player1: p1, player1Id: p1.toLowerCase(), player2: p2, player2Id: p2.toLowerCase(), categoria, ...info },
    matches: Object.fromEntries(risultati.map(([a, b, extra], k) => [`match${k + 1}`, match(p1, p2, a, b, extra)]))
});

const s0 = {
    info: { name: 'Season 0', status: 'closed' },
    showdowns: {
        a: showdown('Didi', 'Lu', 'OU', [[2, 0, { data: '2026-01-01', team1: 'Rain', team2: 'Sun' }], [2, 1, { data: '2026-01-02' }], [0, 2, { data: '2026-01-03' }]], { isCompleted: true }),
        b: showdown('Gio', 'Didi', 'OU', [[2, 1, { data: '2026-01-05' }], [2, 0, { data: '2026-01-06' }], [1, 2, { data: '2026-01-07' }]], { isCompleted: true }),
        c: showdown('Lu', 'Gio', 'OU', [[2, 0], [2, 0], [2, 0]], { isCompleted: true }),          // non riguarda Didi
        d: showdown('Lu', 'Didi', 'VGC', [[2, 1, { data: '2026-02-01' }], [1, 2, { data: '2026-02-02' }]], { isCompleted: false })    // in corso, a metà
    }
};
const s1 = {
    info: { name: 'Season 1', status: 'playing' },
    showdowns: {
        e: showdown('Didi', 'Lu', 'VGC', [[2, 0, { data: '2026-03-01' }], [2, 1, { data: '2026-03-02' }], [2, 0, { data: '2026-03-03' }]], { isCompleted: true })
    }
};
const beta = {
    info: { name: 'Beta Season', status: 'closed' },
    showdowns: { z: showdown('Didi', 'Lu', 'Monotype', [[0, 2, { data: '2025-12-01' }], [0, 2, { data: '2025-12-02' }]], { isCompleted: true }) }
};
const cup = {
    info: { name: 'Summer Cup', status: 'closed', tipo: 'cup' },
    showdowns: { y: showdown('Didi', 'Lu', 'OU', [[2, 0, { data: '2026-04-01' }]], { isCompleted: true }) }
};
const stagioni = { sbeta: beta, s0, s1, scup: cup };

// ---------- il conto ----------
test('confronta: match, set e showdown di Didi contro Lu, senza la beta e le cup', () => {
    const c = SD.confronta('didi', 'lu', stagioni);
    // s0 a: 2-0, 2-1, 0-2 · s0 d (in corso): 1-2, 2-1 · s1 e: 2-0, 2-1, 2-0 (per Didi: a, d sono con Didi in seconda posizione in d)
    assert.deepEqual(c.match, { a: 6, b: 2 });
    assert.deepEqual(c.set, { a: 13, b: 7 });
    assert.deepEqual(c.showdown, { a: 2, b: 0, inCorso: 1 });
    assert.equal(c.giocati, 8);
    assert.equal(c.a.nome, 'Didi');
    assert.equal(c.b.nome, 'Lu');
    assert.deepEqual(c.stagioni, ['s0', 's1'], 'la beta e le cup non fanno statistica');
    assert.deepEqual(c.formati.map(f => [f.formato, f.match.a, f.match.b]), [['VGC', 4, 1], ['OU', 2, 1]], 'i formati dal più giocato');
});

test('confronta: con { beta: true } entra anche la stagione di prova', () => {
    const c = SD.confronta('didi', 'lu', stagioni, { beta: true });
    assert.deepEqual(c.match, { a: 6, b: 4 });
    assert.ok(c.stagioni.includes('sbeta'));
    assert.equal(c.stagioni[0], 'sbeta', 'la beta prima di tutte');
});

test('confronta: lo stesso conto del profilo (Rivals), match per match', () => {
    for (const [io, avv] of [['didi', 'lu'], ['lu', 'didi'], ['didi', 'gio'], ['gio', 'didi'], ['lu', 'gio']]) {
        const r = P.rivali(io, stagioni).find(x => x.id === avv);
        const c = SD.confronta(io, avv, stagioni);
        assert.ok(r, `${io} contro ${avv}`);
        assert.deepEqual([c.match.a, c.match.b], [r.matchV, r.matchP], `match ${io}-${avv}`);
        assert.deepEqual([c.set.a, c.set.b], [r.setV, r.setP], `set ${io}-${avv}`);
        assert.deepEqual([c.showdown.a, c.showdown.b, c.showdown.inCorso], [r.sdV, r.sdP, r.sdInCorso], `showdown ${io}-${avv}`);
        assert.deepEqual(c.forma, r.forma, `forma ${io}-${avv}`);
        assert.equal(c.ultimo, r.ultimo, `ultimo ${io}-${avv}`);
        assert.deepEqual(c.stagioni, r.stagioni);
        assert.deepEqual(Object.fromEntries(c.formati.map(f => [f.formato, [f.match.a, f.match.b, f.showdown.a, f.showdown.b]])),
            Object.fromEntries(Object.entries(r.formati).filter(([f]) => f).map(([f, x]) => [f, [x.matchV, x.matchP, x.sdV, x.sdP]])), `formati ${io}-${avv}`);
    }
});

test('confronta: dal punto di vista dell\'altro i numeri si specchiano', () => {
    const x = SD.confronta('didi', 'lu', stagioni), y = SD.confronta('lu', 'didi', stagioni);
    assert.deepEqual([y.match.a, y.match.b], [x.match.b, x.match.a]);
    assert.deepEqual([y.set.a, y.set.b], [x.set.b, x.set.a]);
    assert.deepEqual([y.showdown.a, y.showdown.b, y.showdown.inCorso], [x.showdown.b, x.showdown.a, x.showdown.inCorso]);
    assert.deepEqual(y.forma, x.forma.map(l => (l === 'V' ? 'P' : 'V')));
    assert.equal(y.incontri.length, x.incontri.length);
    assert.deepEqual(y.incontri[0].punteggio, { a: x.incontri[0].punteggio.b, b: x.incontri[0].punteggio.a });
});

test('confronta: chi non si è mai incontrato, lo stesso allenatore e i dati rotti non rompono niente', () => {
    const mai = SD.confronta('didi', 'zed', stagioni);
    assert.deepEqual(mai.match, { a: 0, b: 0 });
    assert.equal(mai.giocati, 0);
    assert.deepEqual(mai.incontri, []);
    assert.deepEqual(mai.formati, []);
    assert.equal(mai.serie.quanti, 0);
    assert.equal(SD.confronta('didi', 'didi', stagioni).giocati, 0);
    assert.equal(SD.confronta('', 'lu', stagioni).giocati, 0);
    for (const rotti of [null, undefined, {}, { s0: null }, { s0: { showdowns: { x: null } } }, { s0: { showdowns: { x: { info: {} } } } }, 'testo']) {
        assert.equal(SD.confronta('didi', 'lu', rotti).giocati, 0);
    }
    // i nomi, se non ci sono negli showdown, restano gli id; quelli dati vincono
    assert.equal(mai.b.nome, 'zed');
    assert.equal(SD.confronta('didi', 'lu', stagioni, { nomi: { didi: 'DIDI!' } }).a.nome, 'DIDI!');
});

test('confronta: l\'elenco degli incontri è dal più recente, con i match in ordine e i set dal punto di vista di chi guarda', () => {
    const c = SD.confronta('didi', 'lu', stagioni);
    assert.deepEqual(c.incontri.map(i => i.id), ['e', 'd', 'a'], 'il più recente prima (e in marzo, d in febbraio, a in gennaio)');
    const e = c.incontri[0];
    assert.equal(e.stagione, 's1');
    assert.equal(e.nomeStagione, 'Season 1');
    assert.equal(e.formato, 'VGC');
    assert.deepEqual(e.punteggio, { a: 3, b: 0 });
    assert.equal(e.vincitore, 'a');
    assert.equal(e.inCorso, false);
    assert.deepEqual(e.match.map(m => [m.n, m.a, m.b, m.vincitore]), [[1, 2, 0, 'a'], [2, 2, 1, 'a'], [3, 2, 0, 'a']]);
    assert.equal(e.data, Date.parse('2026-03-03'));
    // d: in corso, Lu era primo nello showdown: per Didi i set sono quelli del secondo
    const d = c.incontri[1];
    assert.equal(d.inCorso, true);
    assert.equal(d.vincitore, '');
    assert.deepEqual(d.match.map(m => [m.a, m.b, m.vincitore]), [[1, 2, 'b'], [2, 1, 'a']]);
    // le squadre, se ci sono, dal punto di vista giusto
    const a = c.incontri[2];
    assert.deepEqual(a.match[0].squadre, { a: 'Rain', b: 'Sun' });
    assert.deepEqual(SD.confronta('lu', 'didi', stagioni).incontri[2].match[0].squadre, { a: 'Sun', b: 'Rain' });
    assert.deepEqual(d.match[0].squadre, { a: '', b: '' });
});

test('confronta: i match si ordinano per numero (match10 dopo match2) e un match senza vincitore non conta', () => {
    const sd = { info: { player1: 'Didi', player1Id: 'didi', player2: 'Lu', player2Id: 'lu', categoria: 'OU' }, matches: {} };
    for (let n = 1; n <= 11; n++) sd.matches[`match${n}`] = match('Didi', 'Lu', n % 2 ? 2 : 1, n % 2 ? 1 : 2, { data: `2026-05-${String(n).padStart(2, '0')}` });
    sd.matches.match12 = { player1: 'Didi', player2: 'Lu' };      // senza punteggi: non giocato
    sd.matches.match13 = match('Didi', 'Lu', 1, 1, { winnerId: '', data: '2026-05-13' });     // pari: nessun vincitore
    const c = SD.confronta('didi', 'lu', { s5: { info: { name: 'S5' }, showdowns: { q: sd } } });
    assert.deepEqual(c.incontri[0].match.map(m => m.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(c.giocati, 11);
});

test('confronta: forma (gli ultimi cinque, dal più vecchio), serie in corso e date', () => {
    const c = SD.confronta('didi', 'lu', stagioni);
    // in ordine di data: 1/1 V, 1/2 V, 1/3 P, 2/1 P (Lu 2–1 su Didi), 2/2 V, 3/1 V, 3/2 V, 3/3 V
    assert.deepEqual(c.forma, ['P', 'V', 'V', 'V', 'V'], 'gli ultimi cinque');
    assert.deepEqual(c.serie, { chi: 'a', quanti: 4 }, 'quattro vinti di fila: 2/2, 3/1, 3/2, 3/3');
    assert.equal(c.primo, Date.parse('2026-01-01'));
    assert.equal(c.ultimo, Date.parse('2026-03-03'));
    const l = SD.confronta('lu', 'didi', stagioni);
    assert.deepEqual(l.serie, { chi: 'b', quanti: 4 }, 'la stessa serie, ma di chi sta dall\'altra parte');
});

// ---------- il verdetto ----------
const finto = (ma, mb, extra = {}) => ({ a: { id: 'didi', nome: 'Didi' }, b: { id: 'lu', nome: 'Lu' }, match: { a: ma, b: mb }, showdown: { a: 0, b: 0, inCorso: 0 }, ...extra });

test('verdetto: nessuno, inizio, rivali storici, alla pari, nemesi e preda', () => {
    assert.equal(SD.verdetto(finto(0, 0)).id, 'nessuno');
    assert.match(SD.verdetto(finto(0, 0)).testo, /haven't met/);
    assert.match(SD.verdetto(finto(0, 0, { showdown: { a: 0, b: 0, inCorso: 1 } })).testo, /first showdown right now/);
    assert.equal(SD.verdetto(finto(1, 0)).id, 'inizio', 'un solo match: presto per dirlo');
    assert.equal(SD.verdetto(finto(1, 0)).chi, 'a');
    assert.equal(SD.verdetto(finto(2, 2)).id, 'pari');
    assert.equal(SD.verdetto(finto(2, 1)).id, 'preda', 'due match bastano');
    assert.equal(SD.verdetto(finto(1, 2)).id, 'nemesi');
    assert.equal(SD.verdetto(finto(5, 1)).id, 'preda');
    assert.equal(SD.verdetto(finto(1, 5)).id, 'nemesi');
    assert.equal(SD.verdetto(finto(3, 3)).id, 'rivali', 'sei match e in pari');
    assert.equal(SD.verdetto(finto(4, 3)).id, 'rivali', 'sette match, uno di scarto');
    assert.equal(SD.verdetto(finto(5, 3)).id, 'preda', 'due di scarto: non più rivali');
    assert.equal(SD.verdetto(finto(2, 3)).id, 'nemesi', 'cinque match: ancora pochi per i rivali storici');
});

test('verdetto: il testo parla a chi guarda ("you", "your") e di chi è avanti', () => {
    assert.equal(SD.verdetto(finto(2, 5)).testo, "Lu is Didi's nemesis (5–2 in matches).");
    assert.equal(SD.verdetto(finto(2, 5), { io: 'didi' }).testo, 'Lu is your nemesis (5–2 in matches).');
    assert.equal(SD.verdetto(finto(2, 5), { io: 'lu' }).testo, "You are Didi's nemesis (5–2 in matches).");
    assert.equal(SD.verdetto(finto(5, 2), { io: 'didi' }).testo, 'Lu is your prey (5–2 in matches).');
    assert.equal(SD.verdetto(finto(5, 2), { io: 'lu' }).testo, "You are Didi's prey (5–2 in matches).");
    assert.equal(SD.verdetto(finto(2, 2), { io: 'didi' }).testo, 'You and Lu are level at 2–2 in matches.');
    assert.equal(SD.verdetto(finto(0, 0), { io: 'lu' }).testo, "Didi and you haven't met in a showdown yet.");
    assert.equal(SD.verdetto(finto(0, 0), { io: 'didi' }).testo, "You and Lu haven't met in a showdown yet.");
    assert.equal(SD.verdetto(finto(5, 2)).chi, 'a');
    assert.equal(SD.verdetto(finto(2, 5)).chi, 'b');
    assert.equal(SD.verdetto(finto(3, 3)).chi, '');
    assert.equal(SD.verdetto(finto(3, 3)).etichetta, 'Arch-rivals');
});

// ---------- l'html ----------
test('htmlScheda: verdetto, numeri, forma, formati e ultimi incontri', () => {
    const c = SD.confronta('didi', 'lu', stagioni);
    const html = SD.htmlScheda(c, { io: 'didi', colori: { a: '#ff0000', b: '#00ff00' } });
    assert.match(html, /--ca: #ff0000; --cb: #00ff00/);
    assert.match(html, /class="h2h-verdetto h2h-v-preda h2h-avanti-a"/);
    assert.match(html, /Lu is your prey \(6–2 in matches\)\./);
    assert.match(html, /<b class="h2h-num h2h-num-a h2h-avanti">6<\/b><span class="h2h-voce">Matches<\/span><b class="h2h-num h2h-num-b">2<\/b>/);
    assert.match(html, /<span class="h2h-voce">Sets<\/span>/);
    assert.match(html, /<span class="h2h-voce">Showdowns<\/span>/);
    assert.match(html, /1 showdown in progress/);
    assert.match(html, /width:75%/, 'la barra: 6 match su 8');
    assert.match(html, /Didi's latest matches/);
    assert.match(html, /<i class="h2h-l">L<\/i><i class="h2h-w">W<\/i>/);
    assert.match(html, /You have won the last 4 matches/);
    assert.match(html, /<b>VGC<\/b> 4–1/);
    assert.match(html, /<a class="h2h-inc-stagione" href="matches\.html\?id=s1">Season 1<\/a>/);
    assert.match(html, /Didi won 3–0/);
    assert.match(html, /In progress · 1–1/);
    assert.match(html, /3 Mar 2026/);
    assert.match(html, /title="Match 1 · Rain vs Sun"/);
    assert.match(html, /class="h2h-incontro h2h-vince-a"/);
    assert.match(html, /class="h2h-incontro h2h-in-corso"/);
    assert.doesNotMatch(html, /h2h-altri/, 'tre showdown: niente "Show all"');
});

test('htmlScheda: oltre il massimo si elencano i più recenti e compare "Show all"; con { tutti } si vedono tutti', () => {
    const molti = { s9: { info: { name: 'Big' }, showdowns: {} } };
    for (let i = 0; i < 8; i++) molti.s9.showdowns[`k${i}`] = showdown('Didi', 'Lu', 'OU', [[2, 0, { data: `2026-06-0${i + 1}` }]], { isCompleted: true });
    const c = SD.confronta('didi', 'lu', molti);
    const poco = SD.htmlScheda(c);
    assert.equal((poco.match(/class="h2h-incontro /g) || []).length, 5);
    assert.match(poco, /<button type="button" class="h2h-altri" data-h2h-altri>Show all 8 showdowns<\/button>/);
    assert.match(poco, /Latest meetings/);
    const tutti = SD.htmlScheda(c, { tutti: true });
    assert.equal((tutti.match(/class="h2h-incontro /g) || []).length, 8);
    assert.doesNotMatch(tutti, /h2h-altri/);
    assert.match(SD.htmlScheda(c, { massimo: 2 }), /Show all 8 showdowns/);
});

test('htmlScheda: nessun incontro, stesso allenatore due volte, e il testo del database non entra come HTML', () => {
    const mai = SD.htmlScheda(SD.confronta('didi', 'zed', stagioni));
    assert.match(mai, /h2h-v-nessuno/);
    assert.match(mai, /haven&#39;t met/, 'l\'apostrofo passa dall\'escape');
    assert.doesNotMatch(mai, /h2h-tabellone|h2h-incontri|h2h-forma/, 'senza match non ci sono né numeri né elenco');
    assert.match(SD.htmlScheda(SD.confronta('didi', 'didi', stagioni)), /Pick two different trainers/);

    const cattivo = { s0: { info: { name: '<img src=x onerror=alert(1)>' }, showdowns: {
        k: { info: { player1: '<b>Didi</b>', player1Id: 'didi', player2: 'Lu"', player2Id: 'lu', categoria: '<script>x</script>', isCompleted: true },
            matches: { match1: match('Didi', 'Lu', 0, 2, { team1: '<i>T</i>', team2: 'a"b', data: '2026-01-01' }) } }
    } } };
    const html = SD.htmlScheda(SD.confronta('didi', 'lu', cattivo));
    assert.doesNotMatch(html, /<img src=x|<script>|<b>Didi|<i>T<\/i>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /Lu&quot; won 1–0/);
    assert.match(html, /a&quot;b/);
});

test('htmlTesta: i due allenatori con avatar, colore e selettore; l\'altro lato non si può scegliere due volte', () => {
    const giocatori = [
        { id: 'didi', nome: 'Didi', avatar: 'https://sito.it/didi-lu/immagini/profile/5.png', colore: '#123456' },
        { id: 'lu', nome: 'Lu', avatar: 'http://evil.example/x.png', colore: 'red;background:url(x)' },
        { id: 'gio', nome: 'Gio <b>', avatar: '', colore: '#fff' }
    ];
    const c = SD.confronta('didi', 'lu', stagioni);
    const html = SD.htmlTesta(c, { giocatori, io: 'didi' });
    assert.match(html, /class="h2h-lato h2h-lato-a" style="--c: #123456"/);
    assert.match(html, /src="immagini\/profile\/5\.png"/, 'l\'indirizzo completo dell\'editor diventa il percorso del sito');
    assert.match(html, /src="immagini\/magikarp\.png"/, 'un avatar fuori dal sito diventa quello predefinito');
    assert.match(html, /class="h2h-lato h2h-lato-b" style="--c: #31c489"/, 'un colore non valido diventa quello predefinito');
    assert.doesNotMatch(html, /background:url/);
    assert.match(html, /<select class="h2h-scelta" data-h2h-scelta="a"/);
    assert.match(html, /<select class="h2h-scelta" data-h2h-scelta="b"/);
    // a sinistra Didi (selezionato, "(you)"), Lu disabilitato; a destra il contrario
    const sinistra = html.split('data-h2h-scelta="b"')[0];
    assert.match(sinistra, /<option value="didi" selected>Didi \(you\)<\/option>/);
    assert.match(sinistra, /<option value="lu" disabled>Lu<\/option>/);
    assert.match(html, /<option value="lu" selected>Lu<\/option>/);
    assert.match(html, /Gio &lt;b&gt;/);
    assert.match(html, /data-h2h-scambia/);
    // senza elenco di allenatori: i nomi
    const senza = SD.htmlTesta(c, {});
    assert.doesNotMatch(senza, /<select/);
    assert.match(senza, /<span class="h2h-nome">Didi<\/span>/);
});

test('dataBreve: "22 Oct 2026" in UTC, vuota senza data', () => {
    assert.equal(SD.dataBreve(Date.parse('2026-10-22')), '22 Oct 2026');
    assert.equal(SD.dataBreve(Date.parse('2026-01-01T23:30:00Z')), '1 Jan 2026');
    assert.equal(SD.dataBreve(0), '');
    assert.equal(SD.dataBreve(NaN), '');
});

test('coppiaIniziale: chi guarda contro l\'avversario del tasto; senza login (o sul proprio tasto) il primo della classifica che non sia lui', () => {
    const giocatori = [{ id: 'lukiani' }, { id: 'didi' }, { id: 'Ilaria' }];
    assert.deepEqual(SD.coppiaIniziale('didi', 'ilaria', giocatori), { a: 'didi', b: 'ilaria' }, 'io contro lui');
    assert.deepEqual(SD.coppiaIniziale('Didi', 'Lukiani', giocatori), { a: 'didi', b: 'lukiani' }, 'le maiuscole non contano');
    assert.deepEqual(SD.coppiaIniziale('', 'didi', giocatori), { a: 'lukiani', b: 'didi' }, 'senza login: il primo della classifica');
    assert.deepEqual(SD.coppiaIniziale('', 'lukiani', giocatori), { a: 'didi', b: 'lukiani' }, 'se il primo è proprio l\'avversario: il secondo');
    assert.deepEqual(SD.coppiaIniziale('didi', 'didi', giocatori), { a: 'lukiani', b: 'didi' }, 'il proprio tasto: non contro se stessi');
    assert.deepEqual(SD.coppiaIniziale('sconosciuto', 'didi', giocatori), { a: 'lukiani', b: 'didi' }, 'chi non è tra gli allenatori non fa da punto di vista');
    assert.deepEqual(SD.coppiaIniziale('didi', 'didi', [{ id: 'didi' }]), { a: '', b: 'didi' }, 'nessun altro allenatore');
    assert.deepEqual(SD.coppiaIniziale('didi', 'lu', null), { a: '', b: 'lu' });
    assert.deepEqual(SD.coppiaIniziale('didi', '', giocatori).b, '');
});
