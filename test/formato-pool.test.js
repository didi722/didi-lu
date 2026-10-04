'use strict';
// Il pool di un formato (docs/formato-pool.js): quali Pokémon ci si possono giocare.
// È la lista che vede il giocatore nel Team Builder di box.html e quella da cui pesca la CPU:
//   - tier massima, singolo/doppio, generazione ("within" / "up_to");
//   - restrizioni biologiche (leggendari, iniziale, ...) e "stesso ... in tutto il team";
//   - box.html non ne tiene più una copia propria.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../docs/formato-pool.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = p => JSON.parse(fs.readFileSync(path.join(DOCS, p), 'utf8'));
const g9 = leggi('pkm-gens/gen9.json');
const natdex = leggi('pkm-gens/natdex-tiers.json');
const base = P.minuscole(leggi('pkm-gens/pokedex_base.json'));

const reg = (extra = {}) => ({ genRuleType: 'within', genRuleValue: '9', battleStyle: 'singles', strutturaSito: 'custom', ...extra });
const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
const pool = (regolamento, opz) => P.calcolaPool(regolamento, { gens: { 9: g9 }, natdex, pokedexBase: base }, opz);
const ids = r => new Set(r.pokemon.map(p => p.id));

test('la tier massima esclude chi sta sopra: OU non ha gli Ubers, STANDARD sì (ma non gli AG)', () => {
    const ou = ids(pool(reg({ baseTier: 'OU', restrizioni: permessi })));
    assert.ok(ou.has('garchomp'));
    assert.ok(ou.has('pichu'), 'le tier più basse restano ammesse');
    for (const id of ou) {
        const t = String(g9[id].single_tier).toUpperCase();
        assert.ok(!['UBER', 'UBERS', 'AG', 'ILLEGAL', 'PAST'].includes(t), `${id} è ${t}`);
    }
    const standard = ids(pool(reg({ baseTier: 'STANDARD', restrizioni: permessi })));
    assert.ok(standard.size > ou.size);
    for (const id of standard) assert.notEqual(String(g9[id].single_tier).toUpperCase(), 'AG', id);
});

test('Little Cup: solo i Pokémon LC', () => {
    const lc = ids(pool(reg({ baseTier: 'LC' })));
    assert.ok(lc.has('pichu'));
    assert.ok(!lc.has('pikachu'));
});

test('singolo e doppio guardano la tier giusta', () => {
    const singolo = ids(pool(reg({ baseTier: 'UU', restrizioni: permessi })));
    const doppio = ids(pool(reg({ baseTier: 'UU', battleStyle: 'doubles', restrizioni: permessi })));
    assert.notDeepEqual([...singolo].sort(), [...doppio].sort());
});

test('"Only Legendary" tiene solo i leggendari; l\'iniziale fissa tiene solo quelle iniziali', () => {
    const leg = pool(reg({ baseTier: 'STANDARD', restrizioni: { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'Only Legendary' } } } }));
    assert.ok(leg.pokemon.length > 20);
    for (const p of leg.pokemon) assert.equal((base[p.id] || base[p.radice]).is_legendary, true, p.id);

    const p = pool(reg({ baseTier: 'OU', restrizioni: { pokemon: { ...permessi.pokemon, name_starts: { mode: 'VALUE', operator: 'STARTS_WITH', value: 'p' } } } }));
    assert.ok(p.pokemon.length > 10);
    for (const x of p.pokemon) assert.ok(x.name.toLowerCase().startsWith('p'), x.name);
});

test('l\'iniziale del giocatore (PLAYER_INITIAL) arriva da fuori; senza, nessun Pokémon', () => {
    const r = reg({ baseTier: 'OU', restrizioni: { pokemon: { ...permessi.pokemon, name_starts: { mode: 'PLAYER_INITIAL' } } } });
    const conM = pool(r, { inizialeNome: 'Marco' });
    assert.ok(conM.pokemon.length > 10);
    for (const x of conM.pokemon) assert.ok(x.name.toLowerCase().startsWith('m'), x.name);
    assert.equal(pool(r).pokemon.length, 0);
});

test('"fino alla generazione" (up_to) unisce le generazioni e usa il natdex per chi è uscito dal gioco', () => {
    const gens = {};
    for (let i = 1; i <= 4; i++) gens[i] = leggi(`pkm-gens/gen${i}.json`);
    const r = P.calcolaPool({ genRuleType: 'up_to', genRuleValue: '4', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi }, { gens, natdex, pokedexBase: base });
    const nomi = ids(r);
    assert.ok(nomi.has('gliscor'), 'OU in quarta generazione');
    assert.ok(!nomi.has('garchomp'), 'in quarta generazione era Uber: la tier si legge alla generazione del formato');
    assert.ok(!nomi.has('greninja'), 'è della sesta generazione');
    assert.deepEqual(P.fileNecessari({ genRuleType: 'up_to', genRuleValue: '4' }).gens, [1, 2, 3, 4]);
    assert.deepEqual(P.fileNecessari({ genRuleType: 'within', genRuleValue: '9' }).gens, [9]);
});

test('SAME_ACROSS_TEAM: non filtra il pool, ma si può scegliere un valore e restringerlo', () => {
    const r = reg({ baseTier: 'OU', restrizioni: { pokemon: { ...permessi.pokemon, type: { mode: 'SAME_ACROSS_TEAM', operator: 'equals' } } } });
    assert.deepEqual(P.chiaviSameAcross(r), ['type']);
    const senza = P.senzaSameAcross(r);
    assert.deepEqual(P.chiaviSameAcross(senza), []);
    assert.ok(r.restrizioni.pokemon.type, 'il regolamento originale non si tocca');

    const tutti = pool(senza);
    const valori = P.valoriPossibili(base, tutti.pokemon, 'type');
    assert.ok(valori.fire > 10 && valori.water > 10);
    const fuoco = tutti.pokemon.filter(p => P.corrispondeAllaScelta(base, p, 'type', 'fire'));
    assert.equal(fuoco.length, valori.fire);
    assert.ok(fuoco.every(p => base[p.id].type.includes('fire')));
});

test('caricaPool scarica solo i file che servono e non riscarica quelli già in mano', async () => {
    const richiesti = [];
    const carica = async percorso => { richiesti.push(percorso); return leggi(percorso); };
    const r = reg({ baseTier: 'OU', restrizioni: permessi });
    const a = await P.caricaPool(r, carica);
    assert.deepEqual(richiesti.sort(), ['pkm-gens/gen9.json', 'pkm-gens/pokedex_base.json']);

    richiesti.length = 0;
    const b = await P.caricaPool(r, carica, { pokedexBase: base, cache: { 'pkm-gens/gen9.json': g9 } });
    assert.deepEqual(richiesti, []);
    assert.deepEqual(a, b);
    assert.deepEqual(ids(a), ids(pool(r)));
});

test('box.html usa il modulo condiviso e non ha più una copia della logica del pool', () => {
    const html = fs.readFileSync(path.join(DOCS, 'box.html'), 'utf8');
    assert.match(html, /<script src="formato-pool\.js"><\/script>/);
    assert.match(html, /FormatoPool\.caricaPool\(/);
    assert.ok(!html.includes('function controllaRestrizioniBiologiche'), 'la copia vecchia è ancora in box.html');
    assert.ok(!html.includes('function controllaTierAmmessa'), 'la copia vecchia è ancora in box.html');
});
