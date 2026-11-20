'use strict';
// pokedex-lega.js: il Pokédex di Stats, a colori i Pokémon usati e in grigio i mai usati, per la lega o per un allenatore.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../docs/pokedex-lega.js');

// il risultato di UsoGlobale.calcola, quanto serve: i nomi delle specie e, per ogni team che ha giocato, chi è e cosa porta
const uso = {
    specie: [
        { specieId: 'garchomp', nome: 'Garchomp' }, { specieId: 'ninetales', nome: 'Ninetales' }, { specieId: 'ninetalesalola', nome: 'Ninetales-Alola' },
        { specieId: 'urshifurapidstrike', nome: 'Urshifu-Rapid-Strike' }, { specieId: 'mrmime', nome: 'Mr. Mime' }, { specieId: 'fakemon', nome: 'Fake"mon' }
    ],
    squadre: [
        { giocatore: 'didi', stagione: 's0', specieId: ['garchomp', 'ninetalesalola', 'mrmime'] },
        { giocatore: 'didi', stagione: 's1', specieId: ['garchomp', 'urshifurapidstrike'] },
        { giocatore: 'Lu', stagione: 's0', specieId: ['ninetales', 'ninetalesalola', 'garchomp', 'fakemon'] }
    ]
};
const cella = (m, num) => m.regioni.flatMap(r => r.celle).find(c => c.num === num);

test('le regioni coprono tutto il Pokédex, una dopo l\'altra', () => {
    assert.equal(PL.REGIONI[0].da, 1);
    assert.equal(PL.REGIONI[PL.REGIONI.length - 1].a, 1025);
    PL.REGIONI.forEach((r, i) => { if (i) assert.equal(r.da, PL.REGIONI[i - 1].a + 1, `${r.nome} comincia dove finisce la regione prima`); });
    assert.equal(PL.TOTALE, 1025);
    assert.deepEqual(PL.REGIONI.map(r => r.id), ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea']);
});

test('numeroDi: specie, forme, forme solo estetiche (per prefisso) e quello che non si conosce', () => {
    assert.equal(PL.numeroDi('garchomp'), 445);
    assert.equal(PL.numeroDi('Garchomp'), 445);
    assert.equal(PL.numeroDi('Mr. Mime'), 122);
    assert.equal(PL.numeroDi('ninetalesalola'), 38);
    assert.equal(PL.numeroDi('Urshifu-Rapid-Strike'), 892);
    assert.equal(PL.numeroDi('mew'), 151, 'la specie corta si trova per intero');
    assert.equal(PL.numeroDi('alcremieribbonsweet'), 869, 'una forma estetica che il simulatore non elenca vale la sua specie base');
    assert.equal(PL.numeroDi('pikachuxyz'), 25);
    assert.equal(PL.numeroDi('zzzzzz'), 0);
    assert.equal(PL.numeroDi(''), 0);
    assert.equal(PL.numeroDi(null), 0);
    assert.equal(PL.numeroDi('mewx'), 0, 'un prefisso troppo corto non basta (mew ha tre lettere)');
});

test('giocatori: chi ha team nel perimetro, in minuscolo e in ordine', () => {
    assert.deepEqual(PL.giocatori(uso), ['didi', 'lu']);
    assert.deepEqual(PL.giocatori(null), []);
    assert.deepEqual(PL.giocatori({ squadre: [null, { giocatore: '' }] }), []);
});

test('calcola, la lega: i Pokémon usati da tutti, le forme sulla loro specie e quanti team e allenatori', () => {
    const m = PL.calcola(uso);
    assert.equal(m.chi, '');
    assert.equal(m.team, 3);
    assert.equal(m.totale, 1025);
    assert.equal(m.usati, 4, 'Garchomp, Ninetales (con la forma di Alola), Mr. Mime e Urshifu');
    assert.equal(m.perc, 0.4);
    const garchomp = cella(m, 445);
    assert.deepEqual([garchomp.usato, garchomp.team, garchomp.giocatori, garchomp.nome], [true, 3, 2, 'Garchomp']);
    const volpe = cella(m, 38);
    assert.equal(volpe.nome, 'Ninetales');
    assert.deepEqual([volpe.team, volpe.giocatori], [2, 2], 'Ninetales e la forma di Alola nello stesso team contano un team solo');
    assert.deepEqual(volpe.forme.map(f => [f.specieId, f.team]), [['ninetalesalola', 2], ['ninetales', 1]], 'le forme dalla più usata');
    assert.equal(volpe.specieId, 'ninetalesalola', 'la scheda di uso che si apre è quella della forma più usata');
    assert.equal(cella(m, 892).nome, 'Urshifu');
    assert.equal(cella(m, 892).forme[0].nome, 'Urshifu-Rapid-Strike');
    assert.equal(cella(m, 1).usato, false);
    assert.deepEqual([cella(m, 1).team, cella(m, 1).giocatori, cella(m, 1).forme, cella(m, 1).specieId], [0, 0, [], '']);
    // le regioni: Kanto ha Ninetales e Mr. Mime, Sinnoh Garchomp, Galar & Hisui Urshifu
    const per = Object.fromEntries(m.regioni.map(r => [r.id, r.usati]));
    assert.deepEqual(per, { kanto: 2, johto: 0, hoenn: 0, sinnoh: 1, unova: 0, kalos: 0, alola: 0, galar: 1, paldea: 0 });
    assert.equal(m.regioni[0].totale, 151);
    assert.equal(m.regioni[0].celle.length, 151);
    assert.equal(m.regioni.reduce((n, r) => n + r.celle.length, 0), 1025);
    assert.deepEqual(m.sconosciute, ['Fake"mon'], 'quello che non ha un posto non si perde: si dice');
});

test('calcola, un allenatore: solo i suoi team (le maiuscole non contano)', () => {
    const didi = PL.calcola(uso, { chi: 'Didi' });
    assert.equal(didi.chi, 'didi');
    assert.equal(didi.team, 2);
    assert.equal(didi.usati, 4);
    assert.equal(cella(didi, 445).team, 2);
    assert.equal(cella(didi, 445).giocatori, 1);
    assert.deepEqual(cella(didi, 38).forme.map(f => f.specieId), ['ninetalesalola']);
    const lu = PL.calcola(uso, { chi: 'lu' });
    assert.equal(lu.usati, 2, 'Garchomp e Ninetales');
    assert.equal(cella(lu, 122).usato, false, 'Mr. Mime lo ha usato solo Didi');
    assert.deepEqual(lu.sconosciute, ['Fake"mon']);
    const nessuno = PL.calcola(uso, { chi: 'zed' });
    assert.deepEqual([nessuno.team, nessuno.usati, nessuno.perc], [0, 0, 0]);
});

test('calcola: senza dati è un Pokédex tutto in grigio', () => {
    for (const vuoto of [null, undefined, {}, { squadre: null }, { squadre: [null, { giocatore: 'a', specieId: null }] }]) {
        const m = PL.calcola(vuoto);
        assert.equal(m.usati, 0);
        assert.equal(m.regioni.reduce((n, r) => n + r.celle.filter(c => c.usato).length, 0), 0);
        assert.equal(m.regioni.reduce((n, r) => n + r.celle.length, 0), 1025);
    }
});

test('htmlPokedex: una regione per sezione, con il conto; le caselle usate sono pulsanti che aprono la scheda d\'uso, le mai usate no', () => {
    const html = PL.htmlPokedex(PL.calcola(uso));
    assert.equal((html.match(/<section class="pdx-regione"/g) || []).length, 9);
    assert.match(html, /<h3>Kanto<\/h3><span class="pdx-intervallo">#001–#151<\/span><span class="pdx-conto"><b>2<\/b>\/151<\/span>/);
    assert.match(html, /<h3>Galar &amp; Hisui<\/h3>/);
    // usata: pulsante con la forma più usata, il numero e il fumetto
    assert.match(html, /<button type="button" class="pdx-cella pdx-usato" data-apri="usage" data-chiave="ninetalesalola" data-num="38" title="#038 Ninetales — in 2 teams · 2 trainers \(also as Ninetales-Alola\)"/);
    assert.match(html, /<span class="pdx-icona" aria-hidden="true" style="--x:2;--y:3"><\/span><span class="pdx-num" aria-hidden="true">038<\/span><span class="pdx-n" aria-hidden="true">2<\/span>/, 'l\'icona sta alla colonna 38 % 12 e riga 38 / 12; il numero di team compare da due in su');
    // mai usata: niente pulsante
    assert.match(html, /<span class="pdx-cella pdx-mai" data-num="1" title="#001 Bulbasaur — never used in the league" role="img"/);
    assert.equal((html.match(/pdx-usato/g) || []).length, 4);
    assert.equal((html.match(/pdx-mai/g) || []).length, 1021);
    // una usata una volta sola non ha il numero accanto
    assert.doesNotMatch(html.match(/<button[^>]*data-num="892"[^]*?<\/button>/)[0], /class="pdx-n"/);
});

test('htmlPokedex, un allenatore: i fumetti parlano di lui', () => {
    const html = PL.htmlPokedex(PL.calcola(uso, { chi: 'lu' }), { nomeChi: 'Lu' });
    assert.match(html, /title="#445 Garchomp — in 1 team"/);
    assert.match(html, /title="#001 Bulbasaur — never used by Lu"/);
    assert.doesNotMatch(html, /trainers/);
});

test('htmlPokedex: ricerca (nome, numero, forma); tutti i Pokémon, usati e mai usati', () => {
    const m = PL.calcola(uso);
    const tutti = PL.htmlPokedex(m);
    assert.equal((tutti.match(/pdx-cella/g) || []).length, 1025, 'sempre tutti: gli usati a colori, gli altri in grigio');
    assert.equal((tutti.match(/pdx-usato/g) || []).length, 4);
    assert.equal((PL.htmlPokedex(m, { cerca: 'mime' }).match(/pdx-cella/g) || []).length, 2, 'Mr. Mime e Mime Jr.');
    assert.match(PL.htmlPokedex(m, { cerca: '#038' }), /data-num="38"/);
    assert.match(PL.htmlPokedex(m, { cerca: '038' }), /data-num="38"/, 'anche il numero scritto con gli zeri');
    assert.equal((PL.htmlPokedex(m, { cerca: '38' }).match(/pdx-cella/g) || []).length, 1, 'il numero esatto, non tutti quelli che lo contengono');
    assert.match(PL.htmlPokedex(m, { cerca: 'alola' }), /data-num="38"/, 'si trova anche dalla forma usata');
    assert.match(PL.htmlPokedex(m, { cerca: 'xyzxyz' }), /Nothing matches “xyzxyz”/);
    assert.doesNotMatch(PL.htmlPokedex(PL.calcola(null)), /Nothing to show/, 'anche senza dati si vedono i 1025 in grigio');
});

test('htmlPokedex: il testo che viene dai dati non entra come HTML', () => {
    const m = PL.calcola({ specie: [{ specieId: 'garchomp', nome: 'Garchomp' }], squadre: [{ giocatore: 'x', specieId: ['garchomp'] }] }, { chi: 'x' });
    const html = PL.htmlPokedex(m, { nomeChi: '<img src=x onerror=1>', cerca: '' });
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /never used by &lt;img src=x onerror=1&gt;/);
    const ricerca = PL.htmlPokedex(m, { cerca: '<script>' });
    assert.doesNotMatch(ricerca, /<script>/);
    assert.match(ricerca, /Nothing matches “&lt;script&gt;”/);
});
