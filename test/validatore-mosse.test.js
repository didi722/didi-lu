'use strict';
// Le mosse di un team devono essere nel movepool della specie: "Jellicent non impara Soak in nessuna generazione" non passa più il controllo, né nel Box (salvataggio e
// importer del Team Builder), né nel simulatore sul sito, né sul server. La regola è UNA (controllo-team.js, mossePossibili) e gira sui dati veri di Showdown.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const CT = require('../docs/controllo-team.js');
const { caricaSim, caricaRandoms, caricaTeamSito } = require('./ayuda-sim.js');

const RADICE = path.join(__dirname, '..');
const leggi = rel => fs.readFileSync(path.join(RADICE, rel), 'utf8');
const reg = (gen, extra = {}) => ({ genRuleValue: gen, genRuleType: 'up_to', strutturaSito: 'custom', baseTier: 'OU', ...extra });

const JELLICENT = `Jellicent @ Leftovers
Ability: Water Absorb
Level: 100
EVs: 252 HP / 252 Def / 4 SpD
Relaxed Nature
IVs: 0 Atk
- Soak
- Will-O-Wisp
- Scald
- Recover`;

let server = null;
async function caricaServer() {
    if (!server) {
        const { sim } = await caricaSim();
        const originale = Module._load;
        Module._load = function (richiesta, ...resto) { return richiesta === 'pokemon-showdown' ? sim : originale.call(this, richiesta, ...resto); };
        try { server = require('../functions/partita.js'); } finally { Module._load = originale; }
    }
    return server;
}

async function problemi(testo, gen = 9, extra = {}) {
    const { sim } = await caricaSim();
    const regole = { gen, livello: 100, meccaniche: true, controllaSpecie: true, delta: null, ...extra };
    return CT.problemiDeiSetShowdown(sim.Teams.import(testo), regole, sim.Dex);
}

test('Jellicent con Soak (che non impara in nessuna generazione): il controllo lo rifiuta, con il motivo; Will-O-Wisp, Scald e Recover restano buone', async () => {
    const p = await problemi(JELLICENT);
    assert.deepEqual(p, ['Jellicent: Soak is not in its movepool in Gen 9.']);
    // in nessuna generazione
    for (const gen of [5, 6, 7, 8]) assert.deepEqual(await problemi(JELLICENT, gen), [`Jellicent: Soak is not in its movepool in Gen ${gen}.`], `Gen ${gen}`);
    // tolta la mossa il team passa
    assert.deepEqual(await problemi(JELLICENT.replace('- Soak', '- Taunt')), []);
});

test('il controllo del simulatore sul sito e quello del server danno la stessa risposta (e il Box usa la stessa regola)', async () => {
    const { controllaTeam } = await caricaTeamSito();
    const { controllaTeam: delServer } = await caricaServer();
    assert.deepEqual(controllaTeam(JELLICENT, reg(9), null), ['Jellicent: Soak is not in its movepool in Gen 9.'], 'simulatore sul sito');
    assert.deepEqual(await delServer(JELLICENT, reg(9)), ['Jellicent: Soak is not in its movepool in Gen 9.'], 'server');
    assert.equal(leggi('docs/controllo-team.js'), leggi('functions/controllo-team.js'), 'le due copie del controllo sono identiche');
});

test('i casi legittimi non si bloccano: stadi precedenti, forme, Hidden Power, Tailwind retroattivo, Smeargle, forme di Hisui, mosse firma e cosmetiche', async () => {
    const buoni = [
        ['Garchomp\nAbility: Rough Skin\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Stealth Rock', 9],
        ['Zapdos\nAbility: Pressure\n- Tailwind\n- Hurricane\n- Heat Wave\n- Roost', 8],
        ['Pikachu\nAbility: Static\n- Volt Tackle\n- Surf\n- Fake Out\n- Protect', 9],                    // Volt Tackle: mossa di uovo di Pichu
        ['Smeargle\nAbility: Own Tempo\n- Spore\n- Fake Out\n- Wide Guard\n- Follow Me', 9],           // Sketch
        ['Rotom-Wash\nAbility: Levitate\n- Hydro Pump\n- Thunderbolt\n- Will-O-Wisp\n- Volt Switch', 9],
        ['Urshifu-Rapid-Strike\nAbility: Unseen Fist\n- Surging Strikes\n- Close Combat\n- U-turn\n- Aqua Jet', 9],
        ['Zacian-Crowned @ Rusted Sword\nAbility: Intrepid Sword\n- Behemoth Blade\n- Play Rough\n- Sacred Sword\n- Protect', 9],
        ['Charizard-Mega-X @ Charizardite X\nAbility: Tough Claws\n- Flare Blitz\n- Dragon Claw\n- Roost\n- Dragon Dance', 9],
        ['Samurott-Hisui\nAbility: Sharpness\n- Ceaseless Edge\n- Razor Shell\n- Sucker Punch\n- Aqua Jet', 8],
        ['Ursaluna\nAbility: Guts\n- Facade\n- Headlong Rush\n- Earthquake\n- Protect', 9],
        ['Gengar\nAbility: Cursed Body\n- Hidden Power Fire\n- Shadow Ball\n- Sludge Bomb\n- Focus Blast', 7],
        ['Greninja-Ash\nAbility: Battle Bond\n- Water Shuriken\n- Hydro Pump\n- Dark Pulse\n- Protect', 9],
        ['Basculegion\nAbility: Adaptability\n- Wave Crash\n- Last Respects\n- Flip Turn\n- Protect', 9],
        ['Gastrodon-East\nAbility: Storm Drain\n- Earth Power\n- Scald\n- Recover\n- Ice Beam', 9],
        ['Dracovish\nAbility: Strong Jaw\n- Fishious Rend\n- Psychic Fangs\n- Crunch\n- Protect', 8]
    ];
    for (const [testo, gen] of buoni) assert.deepEqual(await problemi(testo, gen), [], `${testo.split('\n')[0]} (Gen ${gen})`);
});

test('più mosse illegali: una riga per mossa; la mossa che non esiste ancora in quella generazione è segnalata una volta sola (non anche come "movepool")', async () => {
    const p = await problemi('Garchomp\nAbility: Rough Skin\n- Earthquake\n- Thunderbolt\n- Recover\n- Roost');
    assert.deepEqual(p, ['Garchomp: Thunderbolt is not in its movepool in Gen 9.', 'Garchomp: Recover is not in its movepool in Gen 9.', 'Garchomp: Roost is not in its movepool in Gen 9.']);
    assert.deepEqual(await problemi('Mawile\nAbility: Intimidate\n- Play Rough', 4), ['Mawile: Play Rough does not exist in Gen 4.']);
    // una specie che non esiste ancora: solo quel problema
    const nuova = await problemi('Iron Valiant\nAbility: Quark Drive\n- Close Combat', 8);
    assert.ok(nuova.every(x => !x.includes('movepool')), nuova.join('\n'));
});

test('senza i learnset (fonte che non li dà, o specie senza dati) il controllo non blocca niente; regole.controllaMosse === false lo salta', async () => {
    const { sim } = await caricaSim();
    const fonti = CT.fontiDaDex(sim.Dex);
    const senza = { ...fonti, learnset: undefined };
    const set = { nome: 'Jellicent', specie: 'Jellicent', abilita: 'Water Absorb', strumento: 'Leftovers', mosse: ['Soak'], livello: 100 };
    assert.deepEqual(CT.problemiDelSet(set, { gen: 9, meccaniche: true }, senza), []);
    assert.deepEqual(CT.problemiDelSet(set, { gen: 9, meccaniche: true, controllaMosse: false }, fonti), []);
    assert.deepEqual(CT.problemiDelSet(set, { gen: 9, meccaniche: true }, fonti), ['Jellicent: Soak is not in its movepool in Gen 9.']);
    const nessunDato = { ...fonti, learnset: () => null };
    assert.equal(CT.mossePossibili('jellicent', 9, nessunDato), null, 'senza dati di learnset non si può dire');
    assert.deepEqual(CT.problemiDelSet(set, { gen: 9, meccaniche: true }, nessunDato), []);
});

test('strumenti che cambiano la forma (Rusted Sword/Shield) e cappelli di Pikachu: le mosse sono quelle della forma, non quelle del nome scritto nel team', async () => {
    assert.deepEqual(await problemi('Zacian @ Rusted Sword\nAbility: Intrepid Sword\n- Behemoth Blade\n- Play Rough\n- Sacred Sword\n- Protect'), [], 'Zacian con Rusted Sword è Zacian-Crowned');
    assert.deepEqual(await problemi('Zamazenta @ Rusted Shield\nAbility: Dauntless Shield\n- Behemoth Bash\n- Close Combat\n- Iron Head\n- Protect'), []);
    assert.deepEqual(await problemi('Zacian @ Leftovers\nAbility: Intrepid Sword\n- Behemoth Blade'), ['Zacian: Behemoth Blade is not in its movepool in Gen 9.'], 'senza Rusted Sword la mossa firma non c\'è');
    assert.deepEqual(await problemi('Giratina-Origin @ Griseous Orb\nAbility: Levitate\n- Shadow Force\n- Dragon Tail\n- Will-O-Wisp\n- Protect'), []);
    assert.deepEqual(await problemi('Pikachu-World\nAbility: Static\n- Knock Off\n- Volt Tackle'), [], 'un cappello di Pikachu ha le mosse di Pikachu');
});

test('nessun falso positivo: le squadre che genera Showdown stesso (legali per costruzione) passano il controllo in ogni generazione', async () => {
    const { sim } = await caricaRandoms();
    const formati = [['gen9randombattle', 9], ['gen9randomdoublesbattle', 9], ['gen8randombattle', 8], ['gen7randombattle', 7], ['gen6randombattle', 6], ['gen5randombattle', 5], ['gen4randombattle', 4], ['gen3randombattle', 3]];
    let set = 0;
    for (const [formato, gen] of formati) {
        const fonti = CT.fontiDaDex(sim.Dex.forGen(gen));
        for (let i = 0; i < 25; i++) {
            for (const x of sim.Teams.generate(formato)) {
                set++;
                const p = CT.problemiDelSet({ nome: x.species, specie: x.species, abilita: x.ability, strumento: x.item, mosse: x.moves, livello: x.level }, { gen, meccaniche: true, controllaSpecie: false, delta: null }, fonti)
                    .filter(m => m.includes('movepool'));
                assert.deepEqual(p, [], `${formato}: ${x.species} con ${x.moves.join(', ')}`);
            }
        }
    }
    assert.ok(set > 1000, `${set} set`);
});

// ---------- il Box: salvataggio e importer del Team Builder, sulle funzioni vere di box.html ----------
function estrai(sorgente, inizio) {
    const i = sorgente.indexOf(inizio);
    assert.ok(i >= 0, inizio);
    let aperte = 0, j = sorgente.indexOf('{', i);
    for (; j < sorgente.length; j++) {
        if (sorgente[j] === '{') aperte++;
        else if (sorgente[j] === '}' && --aperte === 0) break;
    }
    return sorgente.slice(i, j + 1);
}
async function boxConDatiVeri(gen = 9) {
    const { sim } = await caricaSim();
    const D = sim.Dex;
    // i dati di Showdown dietro le stesse mappe che il Team Builder legge dal sito (pokedex, moves, items, abilities, learnsets)
    const mappa = leggiVoce => new Proxy({}, { get: (t, id) => (typeof id === 'string' ? leggiVoce(id) : undefined) });
    const esiste = v => (v && v.exists ? v : undefined);
    const tbDex = {
        pokedex: mappa(id => esiste(D.species.get(id))), moves: mappa(id => esiste(D.moves.get(id))),
        items: mappa(id => esiste(D.items.get(id))), abilities: mappa(id => esiste(D.abilities.get(id))),
        learnsets: mappa(id => D.species.getLearnsetData(id))
    };
    const sorgente = leggi('docs/box.html');
    const funzioni = ['function tbToID(', 'function tbSpecie(', 'function tbNomeBello(', 'function tbSpecieDaNome(', 'function tbFontiControllo(', 'function tbMosseLegali(',
        'function tbGenMossa(', 'function tbMossaAmmessaDalFormato(', 'function tbValoriMossa(', 'function tbSlotDaSalvato(', 'function tbAbilitaLegali(', 'function tbSpecieBase(', 'function tbGenAbilita('];
    const codice = funzioni.map(f => estrai(sorgente, f)).join('\n');
    const ctx = vm.createContext({
        console: { warn() {}, log() {} }, ControlloTeam: CT, tbDex, tbStato: { gen, within: false, cacheMosse: {}, regolamento: { restrizioni: null }, pool: [{ specieId: 'jellicent' }, { specieId: 'gengar' }] },
        TB_STAT: [{ key: 'hp', label: 'HP' }, { key: 'atk', label: 'Atk' }, { key: 'def', label: 'Def' }, { key: 'spa', label: 'SpA' }, { key: 'spd', label: 'SpD' }, { key: 'spe', label: 'Spe' }],
        TB_NATURE: { Relaxed: ['def', 'spe'], Serious: null }, TB_MOSSE_PROTECT: [], voceBannata: () => false
    });
    vm.runInContext(`${codice}\nthis.api = { tbSlotDaSalvato, tbMosseLegali, tbFontiControllo };`, ctx);
    return { api: ctx.api, ctx };
}
const piano = x => JSON.parse(JSON.stringify(x));      // gli oggetti nati nel contesto della pagina finta hanno altri prototipi
const salvato = (nome, mosse) => ({ nome, strumento: 'Leftovers', abilita: 'Water Absorb', natura: 'Relaxed', evs: '252 HP / 252 Def / 4 SpD', ivs: '0 Atk', mosse });

test('importer del Team Builder: le mosse che la specie non può avere si scartano e si dice quali (Jellicent: Soak); un team già salvato si carica com\'è', async () => {
    const { api } = await boxConDatiVeri(9);
    const r = piano(api.tbSlotDaSalvato(salvato('Jellicent', ['Soak', 'Will-O-Wisp', 'Scald', 'Recover']), true));
    assert.deepEqual(r.slot.mosse, ['willowisp', 'scald', 'recover', ''], 'Soak non c\'è più');
    assert.equal(r.avvisi.length, 1);
    assert.match(r.avvisi[0], /^Jellicent cannot use Soak in this format/);
    // senza mosse scartate niente avviso
    const ok = piano(api.tbSlotDaSalvato(salvato('Jellicent', ['Taunt', 'Will-O-Wisp', 'Scald', 'Recover']), true));
    assert.deepEqual(ok.avvisi, []);
    assert.deepEqual(ok.slot.mosse, ['taunt', 'willowisp', 'scald', 'recover']);
    // caricando un team del box (soloDelFormato falso) le mosse restano: il controllo al salvataggio le segnala
    const caricato = piano(api.tbSlotDaSalvato(salvato('Jellicent', ['Soak', 'Scald']), false));
    assert.deepEqual(caricato.slot.mosse, ['soak', 'scald', '', '']);
    // Hidden Power e Smeargle (Sketch) non si scartano
    const hp = piano(api.tbSlotDaSalvato({ ...salvato('Gengar', ['Hidden Power Fire', 'Shadow Ball']), abilita: 'Cursed Body' }, true));
    assert.deepEqual(hp.slot.mosse.slice(0, 2), ['hiddenpowerfire', 'shadowball']);
    assert.deepEqual(hp.avvisi, []);
});

test('il Team Builder offre le stesse mosse che il controllo ammette (una regola sola): Soak non è tra quelle di Jellicent, Scald sì', async () => {
    const { api } = await boxConDatiVeri(9);
    const ids = api.tbMosseLegali('jellicent').map(m => m.id);
    assert.ok(ids.includes('scald') && ids.includes('willowisp') && ids.includes('recover'));
    assert.ok(!ids.includes('soak'));
    // le stesse mosse del controllo sul simulatore
    const { sim } = await caricaSim();
    const dalControllo = [...CT.mossePossibili('jellicent', 9, CT.fontiDaDex(sim.Dex))].sort();
    for (const id of dalControllo) assert.ok(ids.includes(id) || !sim.Dex.moves.get(id).exists, id);
});

test('box.html: il salvataggio passa le mosse al controllo (fonte learnset) e l\'importer ne mostra gli avvisi', () => {
    const b = leggi('docs/box.html');
    assert.match(b, /learnset: id => \(tbDex\.learnsets && tbDex\.learnsets\[id\] && tbDex\.learnsets\[id\]\.learnset\) \|\| null,\s*base: sp =>/, 'validaCoerenzaGenerazione dà i learnset');
    assert.match(b, /ControlloTeam\.mossePossibili\(specieId, tbStato\.gen, tbFontiControllo\(\)\)/, 'il Team Builder usa la stessa regola');
    assert.doesNotMatch(b, /function tbRaccogliLearnset|function tbFonteValida|function tbGenRipiegoLearnset/, 'niente più una seconda copia della regola');
    assert.match(b, /if \(r\.slot\) \{ nuovi\.push\(r\.slot\); saltati\.push\(\.\.\.\(r\.avvisi \|\| \[\]\)\); \}/);
});

// ---------------------------------------------------------------- l'eccezione per i team già creati
test('eccezione: i team già creati di Little Cup, VGC Gen 8 e QWERTY non si controllano sulle mosse; i nuovi e gli altri formati sì', () => {
    const prima = { dataUltimaModifica: CT.DATA_CONTROLLO_MOSSE - 1 }, dopo = { dataUltimaModifica: CT.DATA_CONTROLLO_MOSSE + 1 };
    for (const f of ['Little Cup', 'VGC Gen 8', 'QWERTY', 'little cup', 'vgc gen8']) assert.equal(CT.eccezioneMosse(prima, f), true, f);
    // un team creato dopo il controllo è controllato per intero, anche in quei formati
    for (const f of ['Little Cup', 'VGC Gen 8', 'QWERTY']) assert.equal(CT.eccezioneMosse(dopo, f), false, f);
    // gli altri formati non hanno l'eccezione, qualunque sia la data
    for (const f of ['VGC Gen 9', 'Gen9 OU', 'Anything Goes', '', null]) assert.equal(CT.eccezioneMosse(prima, f), false, String(f));
    // senza data il team è di prima; il segno del Box tiene l'eccezione anche dopo una modifica
    assert.equal(CT.eccezioneMosse({}, 'QWERTY'), true);
    assert.equal(CT.eccezioneMosse({ ...dopo, eccezioneMosse: true }, 'QWERTY'), true);
    assert.equal(CT.eccezioneMosse({ ...prima, eccezioneMosse: true }, 'Gen9 OU'), false, 'il segno vale solo nei tre formati');
    assert.equal(CT.eccezioneMosse(null, 'QWERTY'), false);
    assert.equal(CT.eccezioneMosse('x', 'QWERTY'), false);
    // le due copie del controllo (sito e server) sono identiche
    assert.equal(leggi('docs/controllo-team.js'), leggi('functions/controllo-team.js'));
});

test('eccezione: con l\'eccezione solo le mosse non si controllano (una specie che non esiste ancora in quella generazione resta un problema)', async () => {
    const { controllaTeam } = await caricaTeamSito();
    const { controllaTeam: delServer } = await caricaServer();
    const SOAK = ['Jellicent: Soak is not in its movepool in Gen 9.'];
    assert.deepEqual(controllaTeam(JELLICENT, reg(9), null), SOAK);
    assert.deepEqual(controllaTeam(JELLICENT, reg(9), null, true), [], 'simulatore sul sito: team già creato');
    assert.deepEqual(await delServer(JELLICENT, reg(9)), SOAK);
    assert.deepEqual(await delServer(JELLICENT, reg(9), true), [], 'server: team già creato');
    const GEN9_IN_GEN8 = `Koraidon @ Choice Scarf\nAbility: Orichalcum Pulse\n- Close Combat\n- Flare Blitz\n- U-turn\n- Dragon Claw`;
    assert.ok((await delServer(GEN9_IN_GEN8, reg(8), true)).length > 0, 'la specie fuori generazione non è coperta dall\'eccezione');
    assert.ok(controllaTeam(GEN9_IN_GEN8, reg(8), null, true).length > 0);
});

test('eccezione: simulatore e server la leggono dal team del Box (data o segno) e solo per il formato del match; il Box la dà al salvataggio e la conserva', () => {
    const sito = leggi('docs/team-sito.js'), srv = leggi('functions/partita.js'), box = leggi('docs/box.html');
    assert.match(sito, /self\.ControlloTeam\.eccezioneMosse\(dalBox \|\| iscritto, regolamento\.categoria\)/, 'team iscritti');
    assert.match(sito, /self\.ControlloTeam\.eccezioneMosse\(team, regolamento\.categoria\)/, 'il team scelto per giocare');
    assert.match(sito, /self\.ControlloTeam\.eccezioneMosse\(team, info\.categoria\)/, 'i team del Box per il match');
    assert.match(srv, /eccezione: ControlloTeam\.eccezioneMosse\(b \|\| t, info\.categoria\)/);
    assert.match(srv, /controllaTeam\(scelto\.testo, reg, scelto\.eccezione\)/, 'il server rifiuta o accetta il team scelto con la stessa eccezione');
    assert.match(srv, /ControlloTeam\.eccezioneMosse\(t, categoria\)/, 'l\'elenco dei team utilizzabili');
    // il Box: legge il team com'era, lo valida con l'eccezione e gli lascia il segno
    assert.match(box, /ControlloTeam\.eccezioneMosse\(\(await databaseRef\.child\(`players\/\$\{playerID\}\/teams\/\$\{editingId\}`\)\.once\('value'\)\)\.val\(\), regolamento\.categoria\)/);
    assert.match(box, /eccezioneMosse = teamInput\.eccezioneMosse === true;/);
    assert.match(box, /controllaMosse: !eccezioneMosse,/);
    assert.match(box, /if \(eccezioneMosse\) datiTeamDaSalvare\.eccezioneMosse = true;/);
    // un team nuovo non ha eccezione: si legge solo modificandone uno
    assert.match(box, /let eccezioneMosse = false;\s*if \(editingId\) \{/);
});
