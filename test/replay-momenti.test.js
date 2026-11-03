'use strict';
// Momenti chiave del replay e link a un turno preciso: ReplaySito.momentiChiave (dal log), il comando "turno" del replay, i chip e il tasto link di matches.html.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../docs/replay-sito.js');
const Carica = require('../docs/replay-carica.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const base = (a = 4, b = 4) => ['|player|p1|Didi|x', '|player|p2|Lu|y', `|teamsize|p1|${a}`, `|teamsize|p2|${b}`, '|turn|1'];

test('momentiChiave: primo KO, sorpasso, ultimo Pokémon di chi vince e ultimo KO, ognuno al suo turno', () => {
    const log = [...base(), '|turn|2', '|faint|p1a: A',                   // Lu avanti 4-3
        '|turn|3', '|faint|p2a: B', '|faint|p2b: C',                     // 3-3 poi Didi avanti 3-2
        '|turn|4', '|faint|p1a: D', '|faint|p1b: E',                     // 2-2 poi Lu avanti 2-1 → Didi con l'ultimo Pokémon
        '|turn|5', '|faint|p2a: F', '|faint|p2b: G', '|win|Didi'];
    assert.deepEqual(R.momentiChiave(log), [
        { turno: 2, tipo: 'primo', testo: 'First KO' },
        { turno: 3, tipo: 'sorpasso', testo: 'Didi takes the lead' },
        { turno: 4, tipo: 'sorpasso', testo: "Lu takes the lead · Didi's last Pokémon" },
        { turno: 5, tipo: 'fine', testo: 'Final KO' }     // Didi torna avanti con l'ultimo KO: è il finale, non un altro sorpasso
    ]);
});

test('momentiChiave: la rimonta è il punto più basso di chi poi ha vinto (sotto di 2 o più), con il turno in cui è successo', () => {
    const log = [...base(), '|turn|2', '|faint|p1a: A', '|faint|p1b: B', '|turn|3', '|faint|p1a: C',     // Didi sotto 1-4 (3 sotto) al turno 3
        '|turn|4', '|faint|p2a: D', '|faint|p2b: E', '|faint|p2a: F', '|faint|p2b: G', '|win|Didi'];
    const m = R.momentiChiave(log);
    assert.equal(m.find(x => x.turno === 3).tipo, 'rimonta');
    assert.match(m.find(x => x.turno === 3).testo, /^Didi down 3/);
    assert.equal(m[m.length - 1].tipo, 'fine');
    assert.equal(m[m.length - 1].turno, 4);
});

test('momentiChiave: più momenti nello stesso turno diventano uno solo (vale il più importante), senza vincitore niente rimonta né finale', () => {
    const log = [...base(2, 2), '|turn|2', '|faint|p1a: A', '|faint|p2a: B', '|faint|p2b: C', '|faint|p1b: D'];
    const m = R.momentiChiave(log);
    assert.deepEqual(m, [{ turno: 2, tipo: 'sorpasso', testo: 'Didi takes the lead · First KO' }], 'primo KO e sorpasso nello stesso turno: un solo chip');
    assert.ok(!m.some(x => x.tipo === 'fine' || x.tipo === 'rimonta'));
    const stesso = R.momentiChiave([...base(2, 2), '|turn|2', '|faint|p1a: A', '|faint|p2a: B', '|faint|p2b: C', '|win|Lu']);
    assert.equal(stesso.filter(x => x.turno === 2).length, 1, 'un chip per turno');
    assert.deepEqual(R.momentiChiave([...base(), '|turn|2', '|faint|p1a: A', '|win|Didi']), [{ turno: 2, tipo: 'fine', testo: 'Final KO' }], 'un solo KO: il primo è anche l\'ultimo');
});

test('momentiChiave: nomi dai |player|, altrimenti quelli passati; squadre dai |poke| se manca |teamsize|; log strani non rompono nulla', () => {
    const senzaNomi = ['|poke|p1|A, L50|', '|poke|p1|B, L50|', '|poke|p2|C, L50|', '|poke|p2|D, L50|', '|turn|1', '|faint|p1a: A', '|turn|2', '|faint|p2a: C', '|faint|p2b: D', '|win|Ada'];
    const m = R.momentiChiave(senzaNomi, { p1: 'Ada', p2: 'Bob' });
    assert.ok(m.length >= 2);
    assert.match(m[m.length - 1].testo, /^Final KO/);
    assert.match(m.map(x => x.testo).join(' '), /Ada/);
    assert.deepEqual(R.momentiChiave([]), []);
    assert.deepEqual(R.momentiChiave(null), []);
    assert.deepEqual(R.momentiChiave(['|turn|1', '|faint|p1a: A']), [], 'senza squadre note');
    assert.deepEqual(R.momentiChiave(base()), [], 'nessun KO');
    assert.doesNotThrow(() => R.momentiChiave(['|faint|', '|turn|', 12, undefined, '|win|']));
});

test('il replay manda il turno alla pagina e sa andare a un turno preciso (stessa via della barra); le due copie del file sono identiche', () => {
    const src = leggi('docs', 'replay-sito.js');
    assert.match(src, /tipo: 'replay-stato', inPausa: inPausa\(\), velocita: VELOCITA\[velocita\]\.etichetta, muto, turno: Math\.max\(0, battle\.turn\), turni: totaleTurni/);
    assert.match(src, /function vaiATurno\(n\)/);
    assert.match(src, /battle\.seekTurn\(totaleTurni && n > totaleTurni \? Infinity : Math\.floor\(n\)\)/);
    assert.match(src, /e\.data\.comando === 'turno'\) vaiATurno\(Number\(e\.data\.valore\)\)/);
    assert.equal(leggi('functions', 'replay-sito.js'), src, 'copia identica in functions/ (modificane una e copiala sull\'altra)');
    assert.equal(typeof R.momentiChiave, 'function');
});

test('ReplayCarica annuncia i momenti alla pagina quando apre un replay del sito; un errore non lo ferma', async () => {
    const eventi = [];
    class Evento { constructor(tipo, init) { this.type = tipo; this.detail = init && init.detail; } }
    const log = [...base(), '|turn|2', '|faint|p1a: A', '|win|Didi'];
    const dati = { log, p1: { nome: 'Didi' }, p2: { nome: 'Lu' }, etichetta: '', match: '1', set: '1' };
    const win = {
        ReplaySito: { leggiReplay: () => dati, creaReplayHtml: () => '<html></html>', momentiChiave: R.momentiChiave, MOTORE: { stili: [], script: [] } },
        fetch: async () => ({ ok: true, text: async () => 'x' }), caches: undefined, SpriteLocali: null,
        location: { href: 'https://x.test/matches.html' }, console: { warn() {} },
        CustomEvent: Evento, dispatchEvent: e => { eventi.push(e); return true; },
        setTimeout: () => 0, clearTimeout() {}
    };
    Carica.azzera();
    const iframe = {};
    const esito = await Carica.apri(win, iframe, 'https://storage/replay.html');
    assert.ok(['sito', 'sito-senza-motore'].includes(esito), esito);
    const ev = eventi.find(e => e.type === 'replay-momenti');
    assert.ok(ev, 'evento replay-momenti');
    assert.equal(ev.detail.iframe, iframe);
    assert.deepEqual(ev.detail.momenti.map(m => m.tipo), ['fine'], 'un KO solo: primo e ultimo nello stesso turno');
    // un momentiChiave che si rompe non impedisce di aprire il replay
    win.ReplaySito.momentiChiave = () => { throw new Error('boom'); };
    Carica.azzera();
    assert.ok(['sito', 'sito-senza-motore'].includes(await Carica.apri(win, {}, 'https://storage/replay.html')));
    Carica.azzera();
});

test('matches.html: tasto per copiare il link al turno, chip dei momenti, ?turno= nel link; nell\'app i chip restano nascosti', () => {
    const m = leggi('docs', 'matches.html');
    assert.match(m, /data-comando="link" id="rcLink"/);
    assert.match(m, /<div class="replay-momenti" id="replayMomenti"[^>]*hidden><\/div>/);
    assert.match(m, /window\.replayAttuale = \{ sd: showdownID, match: matchKey \}/);
    assert.match(m, /window\.indirizzoTurnoReplay = function/);
    assert.match(m, /q\.set\('turno', String\(turnoReplay\)\)/);
    assert.match(m, /window\.turnoDaLink = Number\.isFinite\(turnoRichiesto\)/);
    assert.match(m, /comando: 'turno', valore: t \}/);
    assert.match(m, /window\.addEventListener\('replay-momenti'/);
    assert.match(m, /if \(t\.dataset\.comando === 'link'\) copiaLinkTurno\(\);/);
    for (const css of ['style-matches.css', 'finestre.css']) assert.ok(leggi('docs', css).includes('replay-momenti'), css);
    assert.match(leggi('docs', 'app-gioco-pagine.css'), /#replayModal \.replay-momenti \{ display: none !important; \}/);
});
