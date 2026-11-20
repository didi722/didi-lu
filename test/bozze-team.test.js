'use strict';
// Le bozze dei team (docs/bozze-team.js): un team in lavorazione da riprendere dopo, e la copia di sicurezza nel browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../docs/bozze-team.js');

const TESTO = [
    'Garchomp @ Rocky Helmet\nAbility: Rough Skin\nLevel: 50\nJolly Nature\n- Earthquake',
    'Gigi (Incineroar) (M) @ Sitrus Berry\nAbility: Intimidate\n- Fake Out',
    'Urshifu-Rapid-Strike\n- Close Combat',
    'Flutter (Flutter Mane) (F)\n- Moonblast'
].join('\n\n');

test('specieDaTesto: la specie di ogni Pokémon, con soprannome, sesso e strumento', () => {
    assert.deepEqual(B.specieDaTesto(TESTO), ['Garchomp', 'Incineroar', 'Urshifu-Rapid-Strike', 'Flutter Mane']);
    assert.deepEqual(B.specieDaTesto('Garchomp (M) @ Life Orb'), ['Garchomp']);
    assert.deepEqual(B.specieDaTesto('Mr. Mime @ Leftovers'), ['Mr. Mime']);
});

test('specieDaTesto: righe vuote, intestazioni di Showdown e testi vuoti non danno Pokémon; al massimo sei', () => {
    assert.deepEqual(B.specieDaTesto(''), []);
    assert.deepEqual(B.specieDaTesto(null), []);
    assert.deepEqual(B.specieDaTesto('\n\n   \n\n'), []);
    assert.deepEqual(B.specieDaTesto('=== [gen9vgc] Cartella/Mio team ===\n\nGarchomp\n- Protect'), ['Garchomp'], 'l\'intestazione non è un Pokémon');
    const sette = Array.from({ length: 7 }, (_, i) => `Mon${i}\n- Tackle`).join('\n\n');
    assert.equal(B.specieDaTesto(sette).length, 6);
    assert.deepEqual(B.specieDaTesto('Garchomp\r\n- Protect\r\n\r\nIncineroar\r\n- Fake Out'), ['Garchomp', 'Incineroar'], 'anche con gli a capo di Windows');
});

test('perSalvare: formato, testo e almeno un Pokémon; niente valori undefined', () => {
    const b = B.perSalvare({ nome: '  Il   mio  team ', categoria: 'VGC Gen 9', testo: TESTO, daTeam: '', ora: 1700000000000 });
    assert.deepEqual(b, {
        nome: 'Il mio team', categoria: 'VGC Gen 9', testoShowdown: TESTO, specie: ['Garchomp', 'Incineroar', 'Urshifu-Rapid-Strike', 'Flutter Mane'],
        quanti: 4, daTeam: '', aggiornata: 1700000000000
    });
    assert.ok(Object.values(b).every(v => v !== undefined), 'Firebase rifiuta undefined');
    assert.equal(B.perSalvare({ categoria: 'X', testo: 'Garchomp', ora: 5 }).nome, '', 'una bozza può non avere nome');
    assert.equal(B.perSalvare({ nome: 'x'.repeat(80), categoria: 'X', testo: 'Garchomp' }).nome.length, 40);
    assert.equal(B.perSalvare({ categoria: '', testo: 'Garchomp' }), null, 'serve il formato');
    assert.equal(B.perSalvare({ categoria: 'X', testo: '' }), null, 'serve almeno un Pokémon');
    assert.equal(B.perSalvare({ categoria: 'X', testo: '\n\n' }), null);
    assert.equal(B.perSalvare(), null);
    assert.ok(B.perSalvare({ categoria: 'X', testo: 'Garchomp' }).aggiornata > 0, 'senza `ora` vale adesso');
});

test('elenco: dalla più recente, con i campi calcolati; le bozze rotte si scartano', () => {
    const nodo = {
        a: { nome: 'Vecchia', categoria: 'Monotype', testoShowdown: 'Garchomp\n- Protect', aggiornata: 100 },
        b: { nome: 'Nuova', categoria: 'VGC Gen 9', testoShowdown: TESTO, aggiornata: 300, daTeam: 'T1' },
        c: { nome: 'Senza formato', categoria: '', testoShowdown: 'Garchomp', aggiornata: 400 },
        d: { nome: 'Senza Pokémon', categoria: 'Monotype', testoShowdown: '', aggiornata: 500 },
        e: null,
        f: 'rotta'
    };
    const l = B.elenco(nodo);
    assert.deepEqual(l.map(x => x.id), ['b', 'a']);
    assert.equal(l[0].quanti, 4);
    assert.deepEqual(l[0].specie.slice(0, 2), ['Garchomp', 'Incineroar']);
    assert.equal(l[0].daTeam, 'T1');
    assert.deepEqual(B.elenco(null), []);
    assert.deepEqual(B.elenco('x'), []);
    assert.deepEqual(B.elenco({ a: { categoria: 'X', testoShowdown: 'Garchomp' } }).map(x => x.aggiornata), [0], 'senza data: in fondo');
});

test('nomeVisibile: senza nome è "Untitled draft"', () => {
    assert.equal(B.nomeVisibile({ nome: '' }), 'Untitled draft');
    assert.equal(B.nomeVisibile({ nome: '   ' }), 'Untitled draft');
    assert.equal(B.nomeVisibile({ nome: 'Rain' }), 'Rain');
    assert.equal(B.nomeVisibile(null), 'Untitled draft');
});

test('filtra: ricerca nel nome, nel formato e nelle specie; il formato scelto; con un\'etichetta non ci sono bozze', () => {
    const l = B.elenco({
        a: { nome: 'Rain', categoria: 'VGC Gen 9', testoShowdown: 'Pelipper\n- Hurricane', aggiornata: 2 },
        b: { nome: '', categoria: 'Monotype', testoShowdown: 'Garchomp\n- Protect', aggiornata: 1 }
    });
    assert.equal(B.filtra(l, {}).length, 2);
    assert.deepEqual(B.filtra(l, { testo: 'rain' }).map(b => b.id), ['a']);
    assert.deepEqual(B.filtra(l, { testo: 'GARCH' }).map(b => b.id), ['b'], 'maiuscole e specie');
    assert.deepEqual(B.filtra(l, { testo: 'monotype' }).map(b => b.id), ['b'], 'il formato');
    assert.deepEqual(B.filtra(l, { testo: 'untitled' }).map(b => b.id), ['b'], 'anche il nome di riserva');
    assert.deepEqual(B.filtra(l, { categoria: 'VGC Gen 9' }).map(b => b.id), ['a']);
    assert.deepEqual(B.filtra(l, { etichetta: 'x' }), []);
    assert.deepEqual(B.filtra(null, {}), []);
});

test('quando: da "just now" ai giorni, poi la data', () => {
    const ora = Date.UTC(2026, 10, 20, 12, 0, 0);
    assert.equal(B.quando(ora - 5000, ora), 'just now');
    assert.equal(B.quando(ora - 5 * 60000, ora), '5 min ago');
    assert.equal(B.quando(ora - 2 * 3600000, ora), '2 h ago');
    assert.equal(B.quando(ora - 86400000, ora), '1 day ago');
    assert.equal(B.quando(ora - 3 * 86400000, ora), '3 days ago');
    assert.equal(B.quando(Date.UTC(2026, 8, 3), ora), '03/09/2026');
    assert.equal(B.quando(0, ora), '');
    assert.equal(B.quando(ora + 99999, ora), 'just now', 'un orologio avanti non dà numeri negativi');
});

test('htmlCard: la stessa struttura delle card dei team, sei caselle, DRAFT e il conto', () => {
    const [b] = B.elenco({ x1: { nome: 'Rain <b>', categoria: 'VGC "Gen 9"', testoShowdown: 'Pelipper\n- Hurricane\n\nBarraskewda\n- Liquidation', aggiornata: 1000 } });
    const h = B.htmlCard(b, { gif: s => `g/${s}.gif`, colore: () => '#abc', ora: 1000 + 2 * 3600000, posizione: 3 });
    assert.match(h, /<div class="card card-bozza" style="--i: 3; --cc: #abc;" data-bozza="x1"/);
    assert.match(h, /onclick="continuaBozza\('x1'\)"/);
    assert.match(h, /onclick="event\.stopPropagation\(\); cancellaBozza\('x1'\)"/);
    assert.match(h, /class="bozza-tag">Draft</);
    assert.match(h, /class="bozza-conta">2\/6 Pokémon</);
    assert.match(h, /class="bozza-quando">2 h ago</);
    assert.equal((h.match(/class="pkm-box"/g) || []).length, 2, 'due Pokémon');
    assert.equal((h.match(/pkm-box pkm-vuoto/g) || []).length, 4, 'quattro caselle vuote');
    assert.match(h, /src="g\/Pelipper\.gif"/);
    assert.match(h, /<span class="pkm-name">Pelipper<\/span>/, 'il nome della specie sotto lo sprite, come nelle card dei team');
    // il testo dell'utente è protetto
    assert.match(h, /<h3>Rain &lt;b&gt;<\/h3>/);
    assert.doesNotMatch(h, /<b>/);
    assert.match(h, /VGC &quot;Gen 9&quot;/);
    const senzaNome = B.htmlCard({ ...b, nome: '' }, {});
    assert.match(senzaNome, /<h3>Untitled draft<\/h3>/);
});

// ---------- il backup ----------
function memoria() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

test('backup: si scrive, si rilegge uguale e si cancella; uno per giocatore', () => {
    const s = memoria(), ora = 1700000000000;
    assert.equal(B.leggiBackup(s, 'didi', ora), null);
    assert.equal(B.scriviBackup(s, 'didi', { nome: 'Rain', categoria: 'VGC Gen 9', testo: TESTO, daTeam: 'T9', bozzaId: 'B1', ora }), true);
    const b = B.leggiBackup(s, 'didi', ora + 1000);
    assert.equal(b.nome, 'Rain');
    assert.equal(b.categoria, 'VGC Gen 9');
    assert.equal(b.testoShowdown, TESTO);
    assert.equal(b.daTeam, 'T9');
    assert.equal(b.bozzaId, 'B1');
    assert.equal(b.quanti, 4);
    assert.equal(B.leggiBackup(s, 'lu', ora), null, 'quello di un altro giocatore non c\'è');
    assert.equal(B.chiaveBackup('didi'), 'boxBackup:didi');
    B.cancellaBackup(s, 'didi');
    assert.equal(B.leggiBackup(s, 'didi', ora), null);
});

test('backup: niente da salvare, memoria rotta o piena, dati rovinati e backup troppo vecchi non rompono nulla', () => {
    const s = memoria(), ora = 1700000000000;
    assert.equal(B.scriviBackup(s, 'didi', { categoria: 'X', testo: '' }), false, 'nessun Pokémon: niente backup');
    assert.equal(B.scriviBackup(null, 'didi', { categoria: 'X', testo: 'Garchomp' }), false);
    const piena = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { throw new Error('no'); } };
    assert.equal(B.scriviBackup(piena, 'didi', { categoria: 'X', testo: 'Garchomp' }), false);
    assert.doesNotThrow(() => B.cancellaBackup(piena, 'didi'));
    assert.doesNotThrow(() => B.cancellaBackup(null, 'didi'));
    s.setItem('boxBackup:didi', '{rotto');
    assert.equal(B.leggiBackup(s, 'didi', ora), null);
    s.setItem('boxBackup:didi', JSON.stringify({ categoria: 'X', testoShowdown: '' }));
    assert.equal(B.leggiBackup(s, 'didi', ora), null);
    B.scriviBackup(s, 'didi', { categoria: 'X', testo: 'Garchomp', ora });
    assert.ok(B.leggiBackup(s, 'didi', ora + 29 * 86400000), 'dopo 29 giorni c\'è ancora');
    assert.equal(B.leggiBackup(s, 'didi', ora + 31 * 86400000), null, 'dopo un mese non si propone più');
});

test('percorso: i dati sono del giocatore, sotto players', () => {
    assert.equal(B.percorso('didi'), 'players/didi/bozze');
    assert.ok(B.MASSIMO >= 10);
});
