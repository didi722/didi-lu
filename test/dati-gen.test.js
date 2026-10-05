'use strict';
// I dati per generazione (docs/dati-gen.js + docs/pkm-gens/delta-gen*.json, generati da tools/genera-dati-gen.cjs):
//   - in un formato di una generazione precedente Pokémon, mosse e tabella dei tipi sono quelli di allora (Mawile in Gen 4 è solo Acciaio);
//   - i file delta coincidono con il simulatore (se si aggiorna docs/pkmn-sim.js e non si rilancia lo strumento, questo test lo dice);
//   - il Team Builder, il dettaglio dei team e il validatore usano questi dati.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { caricaSim } = require('./ayuda-sim.js');
const G = require('../docs/dati-gen.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggiDelta = gen => JSON.parse(fs.readFileSync(path.join(DOCS, 'pkm-gens', `delta-gen${gen}.json`), 'utf8'));
const GENERAZIONI = [1, 2, 3, 4, 5, 6, 7, 8];

test('ogni generazione prima della 9 ha il suo file, la 9 (i dati di oggi) no', async () => {
    for (const gen of GENERAZIONI) {
        const d = leggiDelta(gen);
        assert.equal(d.gen, gen);
        assert.ok(Array.isArray(d.esistenti) && d.esistenti.length >= 15, `gen${gen}: tipi esistenti`);
        assert.ok(d.specie && d.mosse && d.tipi, `gen${gen}: sezioni`);
        assert.equal(G.url(gen), `pkm-gens/delta-gen${gen}.json`);
    }
    assert.equal(G.url(9), null);
    assert.equal(G.url(undefined), null);
    assert.equal(await G.carica(9), null);
    assert.equal(await G.carica('boh'), null);
});

test('carica: una sola lettura per generazione, e un errore non resta in memoria', async () => {
    let letture = 0;
    const leggi = u => { letture++; return Promise.resolve({ gen: 4, url: u }); };
    const [a, b] = await Promise.all([G.carica(4, leggi), G.carica(4, leggi)]);
    assert.equal(a, b);
    assert.equal(letture, 1);
    assert.equal((await G.carica(4, leggi)).url, 'pkm-gens/delta-gen4.json');
    assert.equal(letture, 1);
    let tentativi = 0;
    await assert.rejects(G.carica(2, () => { tentativi++; return Promise.reject(new Error('rete')); }), /rete/);
    const ok = await G.carica(2, () => { tentativi++; return Promise.resolve({ gen: 2 }); });
    assert.equal(ok.gen, 2);
    assert.equal(tentativi, 2);
});

test('Mawile: in Gen 4 solo Acciaio (il Folletto arriva in Gen 6), poi Acciaio/Folletto', () => {
    const oggi = ['Steel', 'Fairy'];
    assert.deepEqual(G.tipiSpecie(leggiDelta(4), 'mawile', oggi), ['Steel']);
    assert.deepEqual(G.tipiSpecie(leggiDelta(5), 'Mawile', oggi), ['Steel']);
    assert.deepEqual(G.tipiSpecie(leggiDelta(6), 'mawile', oggi), oggi);
    assert.deepEqual(G.tipiSpecie(null, 'mawile', oggi), oggi);
    // altri Pokémon diventati Folletto in Gen 6
    assert.deepEqual(G.tipiSpecie(leggiDelta(5), 'clefairy', ['Fairy']), ['Normal']);
    assert.deepEqual(G.tipiSpecie(leggiDelta(5), 'gardevoir', ['Psychic', 'Fairy']), ['Psychic']);
    assert.deepEqual(G.tipiSpecie(leggiDelta(5), 'togekiss', ['Fairy', 'Flying']), ['Normal', 'Flying']);
    // Magnemite: Elettro in Gen 1-5... resta com'è, e Gen 1: Gengar è Spettro/Veleno, Magneton Elettro
    assert.deepEqual(G.tipiSpecie(leggiDelta(1), 'gengar', ['Ghost', 'Poison']), ['Ghost', 'Poison']);
});

test('i tipi che esistono: niente Buio e Acciaio in Gen 1, niente Folletto prima della Gen 6', () => {
    const t = gen => G.tipiDellaGenerazione(leggiDelta(gen), gen);
    assert.equal(t(1).length, 15);
    for (const x of ['Dark', 'Steel', 'Fairy']) assert.ok(!t(1).includes(x), `Gen 1 senza ${x}`);
    assert.ok(t(2).includes('Dark') && t(2).includes('Steel') && !t(2).includes('Fairy'));
    assert.ok(t(5).includes('Steel') && !t(5).includes('Fairy'));
    assert.equal(G.tipiDellaGenerazione(null, 9).length, 18);
    assert.ok(G.tipiDellaGenerazione(null, 9).includes('Fairy'));
    assert.deepEqual(G.tipiEsistenti(4), t(4).slice().sort((a, b) => G.TUTTI_I_TIPI.indexOf(a) - G.TUTTI_I_TIPI.indexOf(b)));
});

test('la tabella dei tipi: Acciaio resiste a Spettro e Buio fino alla Gen 5, in Gen 1 Spettro non colpisce Psico', () => {
    // moltiplicatore(delta, attacco, difensore, valoreDiOggi)
    assert.equal(G.moltiplicatore(leggiDelta(4), 'Ghost', 'Steel', 1), 0.5);
    assert.equal(G.moltiplicatore(leggiDelta(5), 'Dark', 'Steel', 1), 0.5);
    assert.equal(G.moltiplicatore(leggiDelta(6), 'Dark', 'Steel', 1), 1, 'dalla Gen 6 è come oggi');
    assert.equal(G.moltiplicatore(null, 'Ghost', 'Steel', 1), 1);
    assert.equal(G.moltiplicatore(leggiDelta(1), 'Ghost', 'Psychic', 2), 0);
    assert.equal(G.moltiplicatore(leggiDelta(1), 'Ice', 'Fire', 0.5), 1);
    assert.equal(G.moltiplicatore(leggiDelta(1), 'Poison', 'Bug', 1), 2);
    assert.equal(G.moltiplicatore(leggiDelta(1), 'Fire', 'Grass', 2), 2, 'quello che non cambia resta quello di oggi');
});

test('statistiche e abilità di allora: in Gen 4 niente abilità nascosta, Gen 1-2 senza abilità', () => {
    const d4 = leggiDelta(4);
    const oggi = { 0: 'Hyper Cutter', 1: 'Intimidate', H: 'Sheer Force' };
    assert.deepEqual(G.abilitaSpecie(d4, 'mawile', oggi, 4), { 0: 'Hyper Cutter', 1: 'Intimidate' });
    assert.deepEqual(G.abilitaSpecie(null, 'mawile', oggi, 9), oggi);
    assert.deepEqual(G.abilitaSpecie(leggiDelta(5), 'mawile', oggi, 5), oggi, 'la nascosta c\'è dalla Gen 5');
    // Charizard Gen 3-4: solo Blaze
    assert.deepEqual(G.abilitaSpecie(leggiDelta(4), 'charizard', { 0: 'Blaze', H: 'Solar Power' }, 4), { 0: 'Blaze' });
    // statistiche cambiate nel tempo (Gen 1: Charmander ha Speciale 50)
    assert.deepEqual(G.statSpecie(leggiDelta(1), 'charmander'), [39, 52, 43, 50, 50, 65]);
    assert.equal(G.statSpecie(leggiDelta(1), 'mawile'), null);
});

test('mosse di allora: Bite è speciale in Gen 3 e Normale in Gen 1', () => {
    assert.equal(G.mossaDi(leggiDelta(3), 'bite').c, 'Special');
    assert.equal(G.mossaDi(leggiDelta(1), 'bite').t, 'Normal');
    assert.equal(G.mossaDi(leggiDelta(4), 'bite'), null);
});

// Un Pokédex e un elenco di mosse finti, con la forma di quelli di Showdown
const pokedexFinto = () => ({
    mawile: { name: 'Mawile', types: ['Steel', 'Fairy'], baseStats: { hp: 50, atk: 85, def: 85, spa: 55, spd: 55, spe: 50 }, abilities: { 0: 'Hyper Cutter', 1: 'Intimidate', H: 'Sheer Force' } },
    clefairy: { name: 'Clefairy', types: ['Fairy'], baseStats: { hp: 70, atk: 45, def: 48, spa: 60, spd: 65, spe: 35 }, abilities: { 0: 'Cute Charm', 1: 'Magic Guard', H: 'Friend Guard' } }
});
const mosseFinte = () => ({ bite: { name: 'Bite', type: 'Dark', category: 'Physical', basePower: 60, accuracy: 100, pp: 25, priority: 0 } });

test('applicaAlPokedex e applicaAlleMosse: si passa da una generazione all\'altra e si torna ai dati di oggi', () => {
    const dex = pokedexFinto(), mosse = mosseFinte();
    const originale = JSON.stringify([dex, mosse]);
    G.applicaAlPokedex(dex, leggiDelta(4)); G.applicaAlleMosse(mosse, leggiDelta(3));
    assert.deepEqual(dex.mawile.types, ['Steel']);
    assert.deepEqual(dex.clefairy.types, ['Normal']);
    assert.equal(mosse.bite.category, 'Special');
    // da Gen 4 a Gen 9: tutto com'era
    G.applicaAlPokedex(dex, null); G.applicaAlleMosse(mosse, null);
    assert.equal(JSON.stringify([dex, mosse]), originale);
    // da Gen 4 a Gen 6: Mawile torna Acciaio/Folletto (la 6 non cambia i suoi tipi), senza residui della 4
    G.applicaAlPokedex(dex, leggiDelta(4));
    G.applicaAlPokedex(dex, leggiDelta(6));
    assert.deepEqual(dex.mawile.types, ['Steel', 'Fairy']);
    // Charizard in Gen 3 ha un'abilità sola (la nascosta arriva in Gen 5): il Pokédex di Showdown la porta ancora, la cambia chi legge
    const ch = { charizard: { name: 'Charizard', types: ['Fire', 'Flying'], baseStats: {}, abilities: { 0: 'Blaze', H: 'Solar Power' } } };
    G.applicaAlPokedex(ch, { specie: { charizard: { a: { 0: 'Blaze', 1: 'Other' } } } });
    assert.deepEqual(ch.charizard.abilities, { 0: 'Blaze', 1: 'Other' });
    G.applicaAlPokedex(ch, null);
    assert.deepEqual(ch.charizard.abilities, { 0: 'Blaze', H: 'Solar Power' });
    // dati mancanti: nessun errore
    assert.equal(G.applicaAlPokedex(null, leggiDelta(4)), null);
});

test('pokedex_base.json: tipi, statistiche e BST di allora; ogni voce toccata una volta anche con più chiavi', () => {
    const voce = { name: 'Charmander', type: ['fire'], stats: { hp: 39, attack: 52, defense: 43, 'sp. attack': 60, 'sp. defense': 50, speed: 65 }, bst: 309, highest_stat: ['speed'], abilities: ['Blaze', 'Solar Power'] };
    const base = { Charmander: voce, charmander: voce, Mawile: { name: 'Mawile', type: ['steel', 'fairy'], stats: {}, bst: 380, abilities: ['Intimidate'] } };
    G.applicaAPokedexBase(base, leggiDelta(1));
    assert.equal(voce.stats['sp. attack'], 50);
    assert.equal(voce.bst, 39 + 52 + 43 + 50 + 50 + 65);
    assert.deepEqual(voce.highest_stat, ['speed']);
    G.applicaAPokedexBase(base, leggiDelta(4));
    assert.deepEqual(base.Mawile.type, ['steel']);
    assert.equal(voce.stats['sp. attack'], 60, 'la Gen 4 non cambia le statistiche di Charmander: tornano quelle di oggi');
    G.applicaAPokedexBase(base, null);
    assert.deepEqual(base.Mawile.type, ['steel', 'fairy']);
    assert.equal(voce.bst, 309);
});

test('PokeAPI: tipi e statistiche del Pokémon, tipo/potenza/PP della mossa, come nella generazione', async () => {
    const mawile = { name: 'mawile', types: [{ slot: 1, type: { name: 'steel' } }, { slot: 2, type: { name: 'fairy' } }], stats: [{ base_stat: 50, stat: { name: 'hp' } }] };
    const g4 = G.rettificaPokemonPokeApi(mawile, leggiDelta(4));
    assert.deepEqual(g4.types.map(t => t.type.name), ['steel']);
    assert.equal(mawile.types.length, 2, 'l\'originale non si tocca');
    assert.equal(G.rettificaPokemonPokeApi(mawile, null), mawile);
    assert.equal(G.rettificaPokemonPokeApi(mawile, leggiDelta(9 - 1)).types.length, 2);
    const charmander = { name: 'charmander', types: [{ type: { name: 'fire' } }], stats: [{ base_stat: 60, stat: { name: 'special-attack' } }, { base_stat: 50, stat: { name: 'special-defense' } }] };
    assert.deepEqual(G.rettificaPokemonPokeApi(charmander, leggiDelta(1)).stats.map(s => s.base_stat), [50, 50]);

    const bite = { name: 'bite', type: { name: 'dark' }, damage_class: { name: 'physical' }, power: 60, accuracy: 100, pp: 25, priority: 0 };
    const b3 = G.rettificaMossaPokeApi(bite, leggiDelta(3));
    assert.equal(b3.damage_class.name, 'special');
    assert.equal(b3.type.name, 'dark');
    const b1 = G.rettificaMossaPokeApi(bite, leggiDelta(1));
    assert.equal(b1.type.name, 'normal');

    // fetchPokeApi: stessa risposta di fetch, con i dati di allora; gli altri indirizzi non si toccano
    const finto = u => Promise.resolve({ ok: true, status: 200, json: async () => (/pokemon/.test(u) ? mawile : /move/.test(u) ? bite : { name: 'x' }) });
    const r = await G.fetchPokeApi('https://pokeapi.co/api/v2/pokemon/mawile', leggiDelta(4), finto);
    assert.deepEqual((await r.json()).types.map(t => t.type.name), ['steel']);
    assert.equal((await (await G.fetchPokeApi('https://pokeapi.co/api/v2/move/bite', leggiDelta(3), finto)).json()).damage_class.name, 'special');
    assert.equal((await (await G.fetchPokeApi('https://pokeapi.co/api/v2/type/steel', leggiDelta(4), finto)).json()).name, 'x');
    assert.equal((await (await G.fetchPokeApi('https://pokeapi.co/api/v2/pokemon/mawile', null, finto)).json()).types.length, 2);
    const nonTrovato = u => Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    assert.equal((await G.fetchPokeApi('https://pokeapi.co/api/v2/pokemon/nonesiste', leggiDelta(4), nonTrovato)).status, 404);
});

test('validazione: tipi, BST e mosse del payload sono quelli della generazione (le regole sul tipo si valutano su quelli)', () => {
    const payload = () => ({
        name: 'Mawile', idPokeAPI: 'mawile', type: ['Steel', 'Fairy'], bst: 380, highest_stat: 'Attack',
        movesData: [{ name: 'Bite', power: 60, type: 'Dark', category: 'Physical', max_pp: 25 }, { name: 'Iron Head', power: 80, type: 'Steel', category: 'Physical', max_pp: 15 }]
    });
    const g4 = G.rettificaDatiValidazione(payload(), leggiDelta(4));
    assert.deepEqual(g4.type, ['Steel'], 'in Gen 4 Mawile non è di tipo Folletto');
    assert.equal(g4.bst, 380);
    const g3 = G.rettificaDatiValidazione(payload(), leggiDelta(3));
    assert.equal(g3.movesData[0].category, 'Special');
    const oggi = G.rettificaDatiValidazione(payload(), null);
    assert.deepEqual(oggi.type, ['Steel', 'Fairy']);
    const errore = { erroreDati: true, name: 'X' };
    assert.equal(G.rettificaDatiValidazione(errore, leggiDelta(4)), errore);
    // Charmander Gen 1: BST e statistica migliore dalle statistiche di allora
    const c = G.rettificaDatiValidazione({ name: 'Charmander', idPokeAPI: 'charmander', type: ['Fire'], bst: 309, highest_stat: 'Speed', movesData: [] }, leggiDelta(1));
    assert.equal(c.bst, 39 + 52 + 43 + 50 + 50 + 65);
    assert.equal(c.highest_stat, 'Speed');
});

test('controllaSet: abilità, strumento e mosse devono esistere nella generazione, e l\'abilità essere una della specie di allora', () => {
    const nascita = { 'sheer force': 5, intimidate: 3, 'hyper cutter': 3 };
    const strumenti = { leftovers: 2, 'heavy-duty boots': 8, 'choice band': 3 };
    const mosse = { 'iron head': 4, 'play rough': 6, 'swords dance': 1, bite: 1 };
    const id = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');
    const trova = (tabella, nome) => {
        const chiave = Object.keys(tabella).find(k => id(k) === id(nome));
        return chiave === undefined ? null : tabella[chiave];
    };
    const fonti = specie => ({ specie, abilitaGen: n => trova(nascita, n), strumentoGen: n => trova(strumenti, n), mossaGen: n => trova(mosse, n) });
    const mawile = { abilities: { 0: 'Hyper Cutter', 1: 'Intimidate', H: 'Sheer Force' } };
    const set = { nome: 'Mawile', id: 'mawile', abilita: 'Sheer Force', strumento: 'Heavy-Duty Boots', mosse: ['Play Rough', 'Iron Head', 'Bite', ''] };
    const g4 = G.controllaSet(set, 4, leggiDelta(4), fonti(mawile));
    assert.deepEqual(g4, [
        'Mawile: the ability Sheer Force does not exist in Gen 4.',
        'Mawile: Heavy-Duty Boots does not exist in Gen 4.',
        'Mawile: Play Rough does not exist in Gen 4.'
    ]);
    assert.deepEqual(G.controllaSet(set, 9, null, fonti(mawile)), []);
    // l'abilità nascosta non c'è prima della Gen 5, anche se esiste: la specie di allora non la ha
    const hidden = Object.assign({}, nascita, { 'cursed body': 3 });
    const f = Object.assign(fonti({ abilities: { 0: 'Hyper Cutter', 1: 'Intimidate', H: 'Sheer Force' } }), { abilitaGen: n => trova(Object.assign({}, nascita, { 'sheer force': 3 }), n) });
    assert.deepEqual(G.controllaSet({ nome: 'Mawile', id: 'mawile', abilita: 'Sheer Force', mosse: [] }, 4, leggiDelta(4), f), ['Mawile: Sheer Force is not one of its abilities in Gen 4.']);
    assert.deepEqual(G.controllaSet({ nome: 'Mawile', id: 'mawile', abilita: 'Intimidate', mosse: [] }, 4, leggiDelta(4), f), []);
    assert.equal(hidden['cursed body'], 3);
    // Gen 1-2: niente abilità da controllare; strumento "None" ammesso
    assert.deepEqual(G.controllaSet({ nome: 'Mawile', id: 'mawile', abilita: 'Intimidate', strumento: 'None', mosse: [] }, 2, leggiDelta(2), fonti(mawile)), []);
});

test('i file delta coincidono con il simulatore (specie, mosse e tabella dei tipi di ogni generazione)', async () => {
    const { sim: { Dex } } = await caricaSim();
    const oggi = Dex.forGen(9);
    const STAT = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    for (const gen of GENERAZIONI) {
        const dex = Dex.forGen(gen), delta = leggiDelta(gen);
        const tipi = G.tipiDellaGenerazione(delta, gen);
        // ogni specie che esiste in quella generazione: dati di oggi + delta = dati del simulatore di allora
        let controllate = 0;
        for (const s of dex.species.all()) {
            if (!s.exists || s.num <= 0 || s.gen > gen) continue;
            const b = oggi.species.get(s.id);
            if (!b.exists) continue;
            controllate++;
            assert.deepEqual(G.tipiSpecie(delta, s.id, b.types), s.types, `gen${gen} ${s.id}: tipi`);
            assert.deepEqual(G.statSpecie(delta, s.id) || STAT.map(k => b.baseStats[k]), STAT.map(k => s.baseStats[k]), `gen${gen} ${s.id}: statistiche`);
            if (gen >= 3) {
                const atteso = Object.fromEntries(Object.entries(s.abilities).filter(([k, v]) => v && !(k === 'H' && gen < 5)));
                assert.deepEqual(G.abilitaSpecie(delta, s.id, b.abilities, gen), atteso, `gen${gen} ${s.id}: abilità`);
            }
        }
        assert.ok(controllate >= 150, `gen${gen}: ${controllate} specie controllate`);
        for (const m of dex.moves.all()) {
            const b = oggi.moves.get(m.id);
            if (!m.exists || !b.exists || m.id.startsWith('hiddenpower')) continue;   // Introiettabile: una voce per tipo, con lo stesso id
            const d = G.mossaDi(delta, m.id) || {};
            const letto = { t: d.t !== undefined ? d.t : b.type, c: d.c !== undefined ? d.c : b.category, p: d.p !== undefined ? d.p : b.basePower,
                a: d.a !== undefined ? d.a : b.accuracy, pp: d.pp !== undefined ? d.pp : b.pp, pr: d.pr !== undefined ? d.pr : b.priority };
            assert.deepEqual(letto, { t: m.type, c: m.category, p: m.basePower, a: m.accuracy, pp: m.pp, pr: m.priority }, `gen${gen} ${m.id}`);
        }
        // la tabella dei tipi
        const CODICI = [1, 2, 0.5, 0];
        for (const dif of tipi) for (const att of tipi) {
            const atteso = CODICI[dex.types.get(dif).damageTaken[att]];
            const dOggi = CODICI[oggi.types.get(dif).damageTaken[att]];
            assert.equal(G.moltiplicatore(delta, att, dif, dOggi), atteso, `gen${gen} ${att} su ${dif}`);
        }
    }
});

test('box.html: il Team Builder, i pool, il dettaglio dei team e la validazione usano i dati della generazione del formato', () => {
    const box = fs.readFileSync(path.join(DOCS, 'box.html'), 'utf8');
    assert.match(box, /<script src="dati-gen\.js"><\/script>/);
    // un'unica funzione rimette a posto Pokédex, mosse e pokedex_base per un regolamento
    assert.match(box, /async function applicaGenerazioneFormato\(regolamento\)/);
    assert.match(box, /DatiGen\.applicaAPokedexBase\(window\.pokedexBase, delta\)/);
    assert.match(box, /DatiGen\.applicaAlPokedex\(tbDex\.pokedex, delta\)/);
    assert.match(box, /DatiGen\.applicaAlleMosse\(tbDex\.moves, delta\)/);
    // la si chiama quando si apre il Team Builder, quando si calcola il pool del formato, per i tag del dettaglio e al salvataggio
    const apertura = box.slice(box.indexOf('async function apriTeamBuilder'), box.indexOf('function chiudiTeamBuilder'));
    assert.match(apertura, /await applicaGenerazioneFormato\(regolamento\)[\s\S]*tbInizializzaStato\(/);
    const pool = box.slice(box.indexOf('async function generaListaPokémonPerFormato'), box.indexOf('function renderizzaListaPiatta'));
    assert.match(pool, /await applicaGenerazioneFormato\(regolamento\)[\s\S]*FormatoPool\.caricaPool/);
    const dettaglio = box.slice(box.indexOf('async function tbPreparaDettaglio'), box.indexOf('// Bottoni Copy / Save'));
    assert.match(dettaglio, /await applicaGenerazioneFormato\(formato\.regolamento\)[\s\S]*tbInizializzaStato\(/);
    // la tabella dei tipi del Team Builder legge quella della generazione, non più "Acciaio resiste a Spettro se gen < 6" scritto a mano
    assert.match(box, /DatiGen\.moltiplicatore\(tbStato\.deltaGen, attacco, dif, oggi\)/);
    assert.match(box, /DatiGen\.tipiDellaGenerazione\(tbStato\.deltaGen, tbStato\.gen\)/);
    assert.doesNotMatch(box, /tbStato\.gen < 6 && dif === 'Steel'/);
    // il dettaglio del team: PokeAPI passa da DatiGen.fetchPokeApi con il delta del suo formato; le debolezze usano la tabella di allora
    const dopo = nome => box.slice(box.indexOf(`function ${nome}(`), box.indexOf('\n}\n', box.indexOf(`function ${nome}(`)));
    for (const nome of ['caricaStats', 'caricaTipi', 'caricaDebolezzeStatiche', 'caricaInfoMossa', 'aggiornaColoreMossa', 'apriPkmDettaglio']) {
        assert.match(dopo(nome), /DatiGen\.fetchPokeApi\(`https:\/\/pokeapi\.co\/api\/v2\/(pokemon|move)\//, `${nome}: legge PokeAPI con i dati della generazione`);
    }
    assert.match(box, /deltaGenDettaglio = await DatiGen\.carica\(generazioneDelRegolamento\(formatoTeam\.regolamento\)\)/);
    assert.match(box, /async function moltiplicatoriContro\(/);
    assert.equal((box.match(/await moltiplicatoriContro\(data\.types\.map\(t => t\.type\.name\)\)/g) || []).length, 2, 'le due schede con le debolezze');
    // il salvataggio: i dati per la validazione sono quelli della generazione, e il validatore controlla la coerenza di abilità, strumenti e mosse
    assert.match(box, /preparaDatiTeamPerValidazione\(datiTeamDaSalvare\.pokemon, regolamento\)/);
    assert.match(box, /DatiGen\.rettificaDatiValidazione\(\{/);
    const validatore = box.slice(box.indexOf('async function validaTeamDinamico'), box.indexOf('function validaSovrapposizioneTeam'));
    assert.match(validatore, /await validaCoerenzaGenerazione\(teamDatiPokeAPI, regolamento\)/);
    assert.match(validatore, /validaMosseDuplicate[\s\S]*validaCoerenzaGenerazione[\s\S]*if \(regolamento\.restrizioni\)/, 'vale anche per Anything Goes: sta fuori dal blocco dei controlli standard');
    assert.match(box, /DatiGen\.controllaSet\(/);
});

// ---------- il controllo prima di giocare (server e simulatore del sito) ----------
const { caricaTeamSito } = require('./ayuda-sim.js');
const TEAM_GEN4 = `Mawile @ Leftovers
Ability: Sheer Force
Level: 100
- Play Rough
- Iron Head

Garchomp @ Heavy-Duty Boots
Ability: Rough Skin
Level: 100
- Earthquake`;

test('prima di giocare: abilità, strumenti, mosse e Pokémon che nella generazione del formato non esistono ancora fanno rifiutare il team', async () => {
    const { controllaTeam } = await caricaTeamSito();
    const reg = gen => ({ genRuleValue: gen, genRuleType: 'up_to', strutturaSito: 'custom', baseTier: 'OU' });
    const g4 = controllaTeam(TEAM_GEN4, reg(4));
    assert.deepEqual(g4, [
        'Mawile: the ability Sheer Force does not exist in Gen 4',
        'Mawile: the move Play Rough does not exist in Gen 4',
        'Garchomp: the item Heavy-Duty Boots does not exist in Gen 4'
    ]);
    assert.deepEqual(controllaTeam(TEAM_GEN4, reg(9)), []);
    assert.ok(controllaTeam('Garchomp\nAbility: Sand Veil\n- Earthquake', reg(3)).includes('Garchomp does not exist in Gen 3'));
    // Gen 1-2: niente abilità, quindi niente controllo sulle abilità
    assert.deepEqual(controllaTeam('Alakazam\nAbility: Magic Guard\n- Psychic', reg(2)), []);
});

test('il server controlla le stesse cose, con gli stessi criteri (functions/partita.js è la copia di docs/team-sito.js)', () => {
    const server = fs.readFileSync(path.join(__dirname, '..', 'functions', 'partita.js'), 'utf8');
    const sito = fs.readFileSync(path.join(DOCS, 'team-sito.js'), 'utf8');
    for (const [nome, testo] of [['server', server], ['sito', sito]]) {
        assert.match(testo, /voce\.exists && voce\.isNonstandard === 'Future'/, nome);
        assert.match(testo, /nonEsisteAncora\(dex\.species\.get\(set\.species\)\)/, nome);
        assert.match(testo, /gen >= 3 && set\.ability && nonEsisteAncora\(dex\.abilities\.get\(set\.ability\)\)/, nome);
        assert.match(testo, /nonEsisteAncora\(strumento\)/, nome);
        assert.match(testo, /nonEsisteAncora\(dex\.moves\.get\(mossa\)\)/, nome);
    }
});
