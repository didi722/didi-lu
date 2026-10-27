// La scala dei Pokémon (docs/scala-pkm.js): le stesse regole della pagina pubblica dell'allenatore, più la curva per quando non c'è nessun allenatore.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/scala-pkm.js');
const P = require('../docs/pagina-pubblica.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

/** Un elenco di nomi dichiarato in public-card.js: const NOME = ['a', 'b']; */
const elenco = (js, nome) => {
    const m = new RegExp(`const ${nome} = \\[([^\\]]*)\\]`).exec(js);
    assert.ok(m, nome);
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};

test('le liste (rimpicciolisci, ingrandisci, a terra, galleggiano, forme speciali) sono quelle della pagina pubblica', () => {
    const js = docs('public-card.js');
    assert.deepEqual(S.RIMPICCIOLISCI, elenco(js, 'RIMPICCIOLISCI'));
    assert.deepEqual(S.INGRANDISCI, elenco(js, 'INGRANDISCI'));
    assert.deepEqual(S.A_TERRA, elenco(js, 'A_TERRA'));
    assert.deepEqual(S.GALLEGGIANO, elenco(js, 'GALLEGGIANO'));
    const forme = /const FORME_SPECIALI = \{([^}]*)\}/.exec(js)[1];
    assert.deepEqual(S.FORME_SPECIALI, Object.fromEntries([...forme.matchAll(/(\w+): '([^']+)'/g)].map(m => [m[1], m[2]])));
});

test('chi fluttua: Volante, Levitazione, la lista dei galleggianti, Rayquaza; mai chi sta a terra', () => {
    assert.equal(S.fluttua('Charizard', ['fire', 'flying'], []), true);
    assert.equal(S.fluttua('Gengar', ['ghost', 'poison'], ['cursed-body']), false);
    assert.equal(S.fluttua('Rotom', [], ['levitate']), true);
    assert.equal(S.fluttua('Mew', ['psychic'], []), true, 'in lista');
    assert.equal(S.fluttua('Rayquaza', ['dragon', 'flying'], []), true);
    assert.equal(S.fluttua('Gyarados', ['water', 'flying'], []), false, 'sta a terra per scelta');
    assert.equal(S.fluttua('Tyranitar', ['rock', 'dark'], []), false);
    assert.equal(S.fluttua('Lunala', ['psychic', 'ghost'], []), true, 'Lunala galleggia (e non sta più tra quelli a terra)');
    assert.ok(!S.A_TERRA.includes('lunala'));
    assert.equal(S.nomeApi('Mr. Mime'), 'mr-mime');
    assert.equal(S.nomeApi('Giratina'), 'giratina-altered');
});

test('con l\'allenatore le misure sono quelle di scalaScena della pagina pubblica (a un allenatore di 170 e un palco di 255)', () => {
    for (const altezza of [0.3, 0.5, 0.9, 1.3, 1.7, 2.5, 5, 9, 14.5, 20]) {
        for (const vola of [false, true]) {
            for (const regola of [undefined, 'rimpicciolisci', 'ingrandisci']) {
                const sito = P.scalaScena(altezza, { regola, vola });
                const app = S.scenaConAllenatore(altezza, { allenatorePx: 170, spazioPx: 255, vola, regola });
                assert.ok(Math.abs(app.pokemon - sito.pokemon) <= 1, `pokemon ${altezza} ${vola} ${regola}: ${app.pokemon} vs ${sito.pokemon}`);
                assert.ok(Math.abs(app.allenatore - sito.allenatore) <= 1, `allenatore ${altezza} ${vola} ${regola}`);
            }
        }
    }
});

test('con l\'allenatore tutto si rimpicciolisce di pari passo su uno schermo piccolo', () => {
    const grande = S.scenaConAllenatore(2.5, { allenatorePx: 170, spazioPx: 255 });
    const piccolo = S.scenaConAllenatore(2.5, { allenatorePx: 85, spazioPx: 127.5 });
    assert.ok(Math.abs(piccolo.pokemon - grande.pokemon / 2) < 1);
    assert.ok(Math.abs(piccolo.allenatore - grande.allenatore / 2) < 1);
    assert.ok(S.scenaConAllenatore(14.5, { allenatorePx: 100, spazioPx: 150, regola: 'rimpicciolisci' }).pokemon <= 150);
});

test('da solo: più alto è più grande, il piccolo resta visibile, l\'enorme sta nel palco', () => {
    const H = 200;
    const archen = S.altezzaDaSolo(0.5, H), rayquaza = S.altezzaDaSolo(7, H), wailord = S.altezzaDaSolo(14.5, H), joltik = S.altezzaDaSolo(0.1, H), enorme = S.altezzaDaSolo(100, H);
    assert.ok(rayquaza > archen * 1.8, 'Rayquaza è molto più imponente di Archen');
    assert.ok(wailord > rayquaza);
    assert.ok(joltik >= .25 * H && joltik < archen, 'un Pokémon minuscolo si vede ma è piccolo');
    assert.ok(enorme <= H + 1e-9);
    let prima = 0;
    for (const m of [0.3, 0.6, 1, 1.7, 3, 6, 12, 18]) { const x = S.altezzaDaSolo(m, H); assert.ok(x > prima, `monotona ${m}`); prima = x; }
});

test('dimensiona: fissa l\'altezza, stacca da terra chi fluttua senza uscire dal palco, e segna l\'immagine', async () => {
    const stile = {}; const classi = new Set();
    const img = { dataset: { pkm: 'Mew' }, style: { setProperty(k, v) { stile[k] = v; } }, classList: { toggle: (c, on) => (on ? classi.add(c) : classi.delete(c)) } };
    global.localStorage = { getItem: () => JSON.stringify({ mew: { h: 0.4, v: 1 } }), setItem() {} };
    const r = await S.dimensiona(img, 200);
    assert.equal(r.vola, true);
    assert.ok(r.h + r.alza <= 200 + 1e-9);
    assert.ok(classi.has('sc-vola'));
    assert.equal(img.dataset.sc, '1');
    assert.match(img.style.height, /px$/);
    assert.match(stile['--alza'], /px$/);
    delete global.localStorage;
});

// ---------- la tabella delle altezze (docs/altezze-pkm.js, generata da tools/altezze-pkm/genera.cjs) ----------

test('le altezze vengono dalla tabella, senza chiedere niente a PokeAPI: istantanee e uguali ogni volta', async () => {
    const fetchPrima = global.fetch;
    let chiamate = 0;
    global.fetch = async () => { chiamate++; throw new Error('niente rete'); };
    try {
        assert.deepEqual(await S.misure('Rayquaza'), { altezzaM: 7, vola: true });
        assert.deepEqual(await S.misure('Mr. Mime'), { altezzaM: 1.3, vola: false });
        assert.deepEqual(await S.misure('Urshifu-Rapid-Strike'), { altezzaM: 1.9, vola: false });
        assert.deepEqual(await S.misure('Giratina'), { altezzaM: 4.5, vola: false }, 'la forma di partenza (giratina-altered) c\'è');
        assert.deepEqual(await S.misure('Great Tusk'), { altezzaM: 2.2, vola: false });
        assert.equal(chiamate, 0, 'nessuna richiesta');
        // una forma che la tabella non ha ma la sua specie base sì
        assert.deepEqual(S.dallaTabella('rayquaza-forma-inventata'), { altezzaM: 7, vola: true });
        assert.equal(S.dallaTabella('specie-che-non-esiste'), null, 'quelle che non ci sono si chiedono a PokeAPI');
    } finally { if (fetchPrima) global.fetch = fetchPrima; else delete global.fetch; }
});

test('PokeAPI (per le specie fuori tabella) ha un secondo tentativo se la rete si impunta, ma non insiste su una specie che non conosce', async () => {
    // il modulo legge `self` (nel browser la finestra): lo si rilegge con una finestra finta, così fetch e timer sono quelli del test
    const sorgente = fs.readFileSync(path.join(__dirname, '..', 'docs', 'scala-pkm.js'), 'utf8');
    const carica = fetchFinto => {
        const modulo = { exports: {} };
        const finestra = { fetch: fetchFinto, setTimeout: f => { Promise.resolve().then(f); return 1; }, localStorage: { getItem: () => '{}', setItem() {} } };
        new Function('module', 'self', 'require', sorgente)(modulo, finestra, require);
        return modulo.exports;
    };
    const ok = { ok: true, status: 200, json: async () => ({ height: 25, types: [{ type: { name: 'steel' } }], abilities: [{ ability: { name: 'levitate' } }] }) };
    let n = 0;
    const S1 = carica(async () => { n++; if (n === 1) throw new Error('rete'); return ok; });
    assert.deepEqual(await S1.misure('nuova-specie-x'), { altezzaM: 2.5, vola: true }, 'al secondo tentativo arriva');
    assert.equal(n, 2);
    let m = 0;
    const S2 = carica(async () => { m++; return m === 1 ? { ok: false, status: 429 } : ok; });
    assert.equal((await S2.misure('nuovaspeciey')).altezzaM, 2.5, '429: si riprova una volta');
    let k = 0;
    const S3 = carica(async () => { k++; return { ok: false, status: 404 }; });
    assert.equal((await S3.misure('sconosciuto')).altezzaM, 1.2, 'se non la conosce, una taglia media');
    assert.equal(k, 1, 'un 404 non si ripete');
});

test('docs/altezze-pkm.js è quello che genera tools/altezze-pkm/genera.cjs dai dati del simulatore (dopo un aggiornamento: node tools/altezze-pkm/genera.cjs)', () => {
    const G = require('../tools/altezze-pkm/genera.cjs');
    assert.equal(docs('altezze-pkm.js'), G.sorgente(G.costruisci()));
    const T = require('../docs/altezze-pkm.js');
    const chiavi = Object.keys(T);
    assert.ok(chiavi.length > 1300, 'specie: ' + chiavi.length);
    for (const k of chiavi) { assert.ok(T[k][0] > 0, k); assert.ok(T[k][1] === 0 || T[k][1] === 1, k); }
    assert.deepEqual(chiavi, [...chiavi].sort(), 'ordinata: le differenze tra una generazione e l\'altra si leggono');
    for (const k of ['pikachu', 'charizard', 'mr-mime', 'tapu-koko', 'ho-oh', 'porygon-z', 'urshifu-rapid-strike', 'terapagos', 'ogerpon-wellspring', 'iron-valiant']) assert.ok(T[k], k);
});

test('le pagine che mettono i Pokémon in scala caricano la tabella prima di scala-pkm.js', () => {
    const { SCRIPT_PAGINE } = require('../docs/app.js');
    for (const p of ['matches.html', 'players.html', 'stats.html']) {
        const l = SCRIPT_PAGINE[p];
        assert.ok(l.indexOf('altezze-pkm.js') >= 0 && l.indexOf('altezze-pkm.js') < l.indexOf('scala-pkm.js'), p);
    }
});
