'use strict';
// L'IA della CPU (docs/cpu-ia.js): scelte sensate, non a caso.
// Le richieste del simulatore si costruiscono a mano (stesso formato di Showdown) e si guarda cosa sceglie:
//   - mossa super efficace invece di una debole, e non una mossa che non fa niente (immunità);
//   - cambio quando chi è in campo rischia troppo e in panchina c'è chi regge meglio (non a ogni turno);
//   - nel doppio: Terremoto solo se l'alleato non lo subisce (vola, si protegge, esce); Fake Out il primo turno e non dopo;
//     Tailwind se serve a superare gli avversari; Protezione non due volte di fila;
//   - mai due Pokémon che cambiano con lo stesso compagno, una sola Mega per turno, una sola Teracristal per partita;
//   - anteprima: sceglie quanti Pokémon servono; cambio forzato: il più adatto; Revival Blessing: un Pokémon caduto;
//   - partite vere contro un bot casuale e CPU contro CPU: nessuna scelta rifiutata dal simulatore.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim, giocaPartita, creaCasuale } = require('./ayuda-sim.js');
const IA = require('../docs/cpu-ia.js');
const K = require('../docs/cpu-conoscenza.js');

// ---------- costruzione delle richieste ----------
// squadra: [{ specie, item, abilita, mosse: [nomi], hp (0-100), stato, stats? }], attivi: indici degli attivi
function creaRichiesta(Dex, { squadra, attivi, livello = 50, gen = 9, extra = {} }) {
    const dex = Dex.forGen(gen);
    const pokemon = squadra.map((s, i) => {
        const sp = dex.species.get(s.specie);
        const b = sp.baseStats;
        const stat = k => Math.floor((2 * b[k] + 31 + 21) * livello / 100) + 5;
        const hpMax = b.hp === 1 ? 1 : Math.floor((2 * b.hp + 31 + 21) * livello / 100) + livello + 10;
        const hp = Math.round(hpMax * (s.hp == null ? 100 : s.hp) / 100);
        const cond = hp <= 0 ? '0 fnt' : `${hp}/${hpMax}${s.stato ? ' ' + s.stato : ''}`;
        return {
            ident: `p2: ${sp.name}`, details: `${sp.name}, L${livello}`, condition: cond, active: attivi.includes(i),
            stats: { atk: stat('atk'), def: stat('def'), spa: stat('spa'), spd: stat('spd'), spe: stat('spe') },
            moves: s.mosse.map(m => dex.moves.get(m).id), baseAbility: K.id(s.abilita || Object.values(sp.abilities)[0]),
            item: K.id(s.item || ''), ability: K.id(s.abilita || Object.values(sp.abilities)[0]), pokeball: 'pokeball', commanding: false, reviving: false
        };
    });
    const active = attivi.map(i => ({
        moves: squadra[i].mosse.map(m => {
            const d = dex.moves.get(m);
            return { move: d.name, id: d.id, pp: d.pp, maxpp: d.pp, target: d.target, disabled: false };
        }),
        ...(extra.active && extra.active[attivi.indexOf(i)] || {})
    }));
    return { active, side: { name: 'CPU', id: 'p2', pokemon }, rqid: 3, ...extra.richiesta };
}

// Righe del log: la squadra avversaria e chi è in campo (tutti a pieno HP)
function logAvversario(avversari, doppio, turno = 1, livello = 50) {
    const righe = ['|gen|9', `|gametype|${doppio ? 'doubles' : 'singles'}`];
    avversari.forEach(a => righe.push(`|poke|p1|${a.specie}, L${livello}|`));
    avversari.slice(0, doppio ? 2 : 1).forEach((a, i) => righe.push(`|switch|p1${'ab'[i]}: ${a.specie}|${a.specie}, L${livello}|${a.hp == null ? 100 : a.hp}/100`));
    righe.push(`|turn|${turno}`);
    return righe;
}
function logMiaSquadra(squadra, attivi, livello = 50) {
    const righe = [];
    squadra.forEach(s => righe.push(`|poke|p2|${s.specie}, L${livello}|`));
    attivi.forEach((i, k) => righe.push(`|switch|p2${'ab'[k]}: ${squadra[i].specie}|${squadra[i].specie}, L${livello}|${squadra[i].hp == null ? 100 : squadra[i].hp}/100`));
    return righe;
}

async function cervello(opzioni = {}) {
    const { sim } = await caricaSim();
    return { sim, ia: IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, ...opzioni }) };
}

function scelta(ia, richiesta, righe) {
    ia.osserva(righe);
    return ia.scegli(richiesta);
}

// ===================================================
// SINGOLO
// ===================================================
test('singolo: sceglie la mossa super efficace, non una neutra o inutile', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Charizard', item: 'Leftovers', mosse: ['Flamethrower', 'Air Slash', 'Earthquake', 'Roost'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    // contro Ferrothorn (Erba/Acciaio) il Lanciafiamme è 4x
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Ferrothorn' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.equal(s, 'move 1', 'Flamethrower è 4x su Ferrothorn');
});

test('singolo: non usa una mossa a cui l\'avversario è immune', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Outrage', 'Swords Dance'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    // Corviknight vola: Terremoto non fa nulla
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Corviknight' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.notEqual(s, 'move 1', 'Terremoto non colpisce un Pokémon volante');
});

test('singolo: cambia se chi è in campo ha una debolezza 4x e in panchina c\'è chi resiste', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Charizard', item: 'Leftovers', mosse: ['Flamethrower', 'Air Slash', 'Roost', 'Dragon Pulse'] },
        { specie: 'Excadrill', item: 'Leftovers', mosse: ['Earthquake', 'Iron Head', 'Rock Slide', 'Swords Dance'] },
        { specie: 'Venusaur', item: 'Leftovers', mosse: ['Giga Drain', 'Sludge Bomb', 'Synthesis', 'Sleep Powder'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    // Tyranitar: i suoi attacchi Roccia colpiscono Charizard 4x; Excadrill (Terra/Acciaio) li regge
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Tyranitar' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.equal(s, 'switch 2', 'meglio mandare Excadrill che resiste alla Roccia');
});

test('singolo: non cambia quando il Pokémon in campo sta bene', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Outrage', 'Swords Dance'] },
        { specie: 'Gengar', item: 'Leftovers', mosse: ['Shadow Ball', 'Sludge Bomb', 'Focus Blast', 'Thunderbolt'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Heatran' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.match(s, /^move /, 'Terremoto è 4x su Heatran: si attacca');
});

test('singolo: recupera quando sta per cadere e l\'avversario non lo mette KO subito', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Blissey', item: 'Leftovers', hp: 30, mosse: ['Soft-Boiled', 'Seismic Toss', 'Toxic', 'Flamethrower'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Dragonite' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.equal(s, 'move 1', 'Soft-Boiled');
});

test('stile: con quasi tutta la salute non si cura, attacca (Corviknight all\'80% contro Garchomp); i parametri di prima lo facevano curare', async () => {
    const squadra = [{ specie: 'Corviknight', item: 'Leftovers', hp: 80, mosse: ['Roost', 'Brave Bird', 'Body Press', 'U-turn'] }];
    const gioca = async parametri => {
        const { sim, ia } = await cervello({ parametri });
        const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
        return scelta(ia, r, [...logAvversario([{ specie: 'Garchomp' }], false), ...logMiaSquadra(squadra, [0])]);
    };
    assert.equal(await gioca({}), 'move 2', 'Brave Bird');
    assert.equal(await gioca({ sogliaRecupero: 0, aggressivita: 0 }), 'move 1', 'con la valutazione neutra di prima: Roost');
});

test('stile: i valori di base del singolo cambiano solo lo stile, nel doppio restano quelli di sempre', async () => {
    const { ia } = await cervello();
    assert.ok(ia.par.aggressivita > 0 && ia.par.sogliaRecupero > 0, 'nel singolo il danno pesa di più e curarsi con poco da curare no');
    assert.equal(ia.par.aggressivitaDoppio, 0);
    assert.equal(ia.par.costoCambioDoppio, 0.22);
    assert.ok(ia.par.costoCambio > ia.par.costoCambioDoppio, 'nel singolo cambiare costa di più');
});

test('singolo: non usa una mossa di stato su chi è immune (Onda d\'Urto su un tipo Terra)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Zapdos', item: 'Leftovers', mosse: ['Thunder Wave', 'Heat Wave', 'Roost', 'Hurricane'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Garchomp' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.notEqual(s, 'move 1', 'Thunder Wave non ha effetto su un tipo Terra');
});

// Illusion: uno Zorua di Hisui (Normale/Spettro) travestito da Magnemite (Elettro/Acciaio). Lottaiuto sembra super efficace
// sull'Acciaio, ma non ha effetto sullo Spettro. Il simulatore lo dice (|-immune|) e la CPU non deve riprovarci a ogni turno.
const BUNEARY = ['Drain Punch', 'Ice Punch', 'Quick Attack', 'Swords Dance'];
const logImmune = (turno, mossa = 'Drain Punch') => [`|move|p2a: Buneary|${mossa}|p1a: Magnemite`, '|-immune|p1a: Magnemite', `|turn|${turno}`];

test('Illusion: dopo un "non ha effetto" la CPU non riprova la stessa mossa sullo stesso Pokémon (Lottaiuto su uno Zorua travestito da Magnemite)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Buneary', item: 'Leftovers', mosse: BUNEARY }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const primo = scelta(ia, r, [...logAvversario([{ specie: 'Magnemite' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.equal(primo, 'move 1', 'contro un Magnemite visibile, Lottaiuto è super efficace: si prova');
    const secondo = scelta(ia, r, logImmune(2));
    assert.notEqual(secondo, 'move 1', 'Lottaiuto non ha avuto effetto: non si ripete');
    const terzo = scelta(ia, r, ['|move|p2a: Buneary|Ice Punch|p1a: Magnemite', '|-damage|p1a: Magnemite|90/100', '|turn|3']);
    assert.notEqual(terzo, 'move 1', 'e nemmeno al turno dopo');
});

test('Illusion: l\'immunità si impara per tipo: dopo Lottaiuto la CPU non prova nemmeno Close Combat (stessa Lotta)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Buneary', item: 'Leftovers', mosse: ['Close Combat', 'Drain Punch', 'Ice Punch', 'Quick Attack'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    assert.ok(['move 1', 'move 2'].includes(scelta(ia, r, [...logAvversario([{ specie: 'Magnemite' }], false), ...logMiaSquadra(squadra, [0])])));
    const dopo = scelta(ia, r, logImmune(2, 'Close Combat'));
    assert.ok(!['move 1', 'move 2'].includes(dopo), `non una mossa di tipo Lotta (scelta: ${dopo})`);
});

test('Illusion: l\'immunità vale finché resta in campo; se esce e un altro Magnemite rientra, si riparte da zero', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Buneary', item: 'Leftovers', mosse: BUNEARY }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    scelta(ia, r, [...logAvversario([{ specie: 'Magnemite' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.notEqual(scelta(ia, r, logImmune(2)), 'move 1');
    const m = ia.lati.p1.mons.Magnemite;
    assert.deepEqual([...m.immuneTipi], ['Fighting']);
    // esce Magnemite (lo Zorua) ed entra un altro Pokémon: poi rientra "Magnemite" (stavolta quello vero)
    ia.osserva(['|switch|p1a: Pikachu|Pikachu, L50|100/100', '|turn|3']);
    assert.equal(m.immuneTipi.size, 0, 'chi esce dal campo non porta con sé le immunità viste');
    const dopo = scelta(ia, r, ['|switch|p1a: Magnemite|Magnemite, L50|100/100', '|turn|4']);
    assert.equal(dopo, 'move 1', 'un Magnemite vero è debole alla Lotta');
});

test('Illusion: si legge solo un "non ha effetto" semplice; quelli per abilità, Mangiasogni o OHKO non insegnano niente sul tipo', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Buneary', item: 'Leftovers', mosse: BUNEARY }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    scelta(ia, r, [...logAvversario([{ specie: 'Magnemite' }], false), ...logMiaSquadra(squadra, [0])]);
    const m = ia.lati.p1.mons.Magnemite;
    // per abilità: si impara l'abilità, non il tipo
    ia.osserva(['|move|p2a: Buneary|Drain Punch|p1a: Magnemite', '|-immune|p1a: Magnemite|[from] ability: Levitate']);
    assert.equal(m.immuneTipi.size, 0);
    assert.equal(m.abilita, 'levitate');
    // Mangiasogni: serve un bersaglio addormentato, non c'entra il tipo
    ia.osserva(['|move|p2a: Buneary|Dream Eater|p1a: Magnemite', '|-immune|p1a: Magnemite']);
    assert.equal(m.immuneTipi.size, 0);
    // mossa dal tipo variabile
    ia.osserva(['|move|p2a: Buneary|Weather Ball|p1a: Magnemite', '|-immune|p1a: Magnemite']);
    assert.equal(m.immuneTipi.size, 0);
    // un "non ha effetto" di un altro turno non si lega a una mossa vecchia
    ia.osserva(['|turn|5', '|-immune|p1a: Magnemite']);
    assert.equal(m.immuneTipi.size, 0);
});

test('Illusion: con Scrappy la mossa Lotta/Normale colpisce comunque gli Spettro, quindi l\'immunità vista non vale per chi ce l\'ha', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Lopunny', item: 'Leftovers', abilita: 'Scrappy', mosse: ['Drain Punch', 'Ice Punch', 'Quick Attack', 'Protect'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    scelta(ia, r, [...logAvversario([{ specie: 'Magnemite' }], false), ...logMiaSquadra(squadra, [0])]);
    ia.osserva(['|move|p2a: Lopunny|Drain Punch|p1a: Magnemite', '|-immune|p1a: Magnemite', '|turn|2']);
    const v = ia.vista(ia.lati.p1.mons.Magnemite);
    const C = require('../docs/cpu-calcolo.js');
    const dex = sim.Dex.forGen(9);
    const att = { ...ia.vista(ia.lati.p2.mons.Lopunny), abilita: 'scrappy' };
    const d = C.danno(dex, att, v, K.descriviMossa(dex, 'Drain Punch'), ia.contesto(), {});
    assert.equal(d.immune, false, 'Scrappy: Lotta tocca anche lo Spettro');
    const senza = C.danno(dex, { ...att, abilita: 'limber' }, v, K.descriviMossa(dex, 'Drain Punch'), ia.contesto(), {});
    assert.equal(senza.immune, true, 'senza Scrappy: immune');
});

test('Illusion: una mossa di stato che non ha avuto effetto non si riprova con lo stesso Pokémon (e non si estende ad altri)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Zapdos', item: 'Leftovers', mosse: ['Thunder Wave', 'Heat Wave', 'Roost', 'Hurricane'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    // si vede un Pelipper (Acqua/Volante): Onda d'Urto sembra a posto. In realtà è un Pokémon di tipo Terra sotto Illusion
    const primo = scelta(ia, r, [...logAvversario([{ specie: 'Pelipper' }], false), ...logMiaSquadra(squadra, [0])]);
    ia.osserva(['|move|p2a: Zapdos|Thunder Wave|p1a: Pelipper', '|-immune|p1a: Pelipper', '|turn|2']);
    const pel = ia.lati.p1.mons.Pelipper;
    assert.deepEqual([...pel.immuneMosse], ['Zapdos|thunderwave']);
    assert.equal(pel.immuneTipi.size, 0, 'una mossa di stato non insegna niente sul tipo');
    const dopo = scelta(ia, r, []);
    assert.notEqual(dopo, 'move 1', `Onda d'Urto non ha avuto effetto (prima: ${primo})`);
});

test('Illusion, con il simulatore vero: contro lo Zorua di Hisui travestito da Magnemite la CPU prova Lottaiuto una volta sola', { timeout: 120000 }, async () => {
    const { sim } = await caricaSim();
    const cerebro = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(3) });
    // Zorua di Hisui (Normale/Spettro) con Illusion si traveste dell'ultimo Pokémon della squadra: Magnemite. Non fa altro che Splash
    const zorua = 'Zorua-Hisui @ Leftovers\nAbility: Illusion\n- Splash\n\nMagnemite @ Leftovers\nAbility: Sturdy\n- Splash';
    const buneary = 'Buneary @ Leftovers\nAbility: Klutz\n- Drain Punch\n- Ice Punch\n- Quick Attack\n- Swords Dance';
    const e = await giocaPartita({
        sim, formato: 'gen9customgame', team1: zorua, team2: buneary, seme: [1, 2, 3, 4], maxTurni: 5,
        agente1: { tipo: 'script', gestore: r => (r.teamPreview ? 'team 12' : 'move 1') }, agente2: { tipo: 'cpu', cerebro },
        fermaDopo: x => x.turni >= 5
    });
    assert.deepEqual(e.errori, [], 'nessuna scelta rifiutata');
    const righe = e.righe;
    assert.ok(righe.includes('|switch|p1a: Magnemite|Magnemite, L100|100/100') || righe.some(r => r.startsWith('|switch|p1a: Magnemite|Magnemite')), 'in campo si vede Magnemite');
    const usate = righe.filter(r => r.startsWith('|move|p2a: Buneary|')).map(r => r.split('|')[3]);
    const lotta = usate.filter(n => n === 'Drain Punch');
    assert.equal(lotta.length, 1, `Lottaiuto una volta sola (mosse: ${usate.join(', ')})`);
    const i = righe.findIndex(r => r === '|move|p2a: Buneary|Drain Punch|p1a: Magnemite');
    assert.equal(righe[i + 1], '|-immune|p1a: Magnemite', 'il simulatore dice che non ha effetto');
});

test('singolo: dopo un KO manda il Pokémon più adatto (cambio forzato)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Charizard', hp: 0, mosse: ['Flamethrower', 'Air Slash', 'Roost', 'Dragon Pulse'] },
        { specie: 'Venusaur', item: 'Leftovers', mosse: ['Giga Drain', 'Sludge Bomb', 'Synthesis', 'Sleep Powder'] },
        { specie: 'Starmie', item: 'Leftovers', mosse: ['Surf', 'Ice Beam', 'Rapid Spin', 'Recover'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], extra: { richiesta: { forceSwitch: [true], active: undefined } } });
    delete r.active;
    // contro Gyarados (Acqua/Volante) un Pokémon d'Acqua soffre, quello di Erba/Veleno... conta soprattutto chi lo colpisce 4x o regge
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Swampert' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.equal(s, 'switch 2', 'Venusaur colpisce 4x Swampert (Acqua/Terra) con Erba');
});

// ===================================================
// DOPPIO
// ===================================================
const nemiciRocciosi = [{ specie: 'Heatran' }, { specie: 'Magnezone' }, { specie: 'Kingambit' }, { specie: 'Amoonguss' }];

test('doppio: Terremoto se l\'alleato vola', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Togekiss', item: 'Leftovers', mosse: ['Air Slash', 'Dazzling Gleam', 'Follow Me', 'Protect'] },
        { specie: 'Rillaboom', item: 'Leftovers', mosse: ['Wood Hammer', 'Fake Out', 'Grassy Glide', 'Protect'] },
        { specie: 'Incineroar', item: 'Leftovers', mosse: ['Flare Blitz', 'Fake Out', 'Parting Shot', 'Knock Off'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    const s = scelta(ia, r, [...logAvversario(nemiciRocciosi, true), ...logMiaSquadra(squadra, [0, 1])]);
    assert.match(s.split(', ')[0], /^move 1\b/, 'Terremoto con Garchomp: Togekiss vola');
});

test('doppio: non usa Terremoto se l\'alleato lo subirebbe e non si protegge', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Tyranitar', item: 'Leftovers', mosse: ['Crunch', 'Stone Edge', 'Low Kick', 'Protect'] },
        { specie: 'Corviknight', item: 'Leftovers', mosse: ['Brave Bird', 'Iron Head', 'Roost', 'Protect'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    // avversari non particolarmente deboli a Terra: Terremoto farebbe più male all'alleato (Roccia/Buio, debole a Terra)
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Dragonite' }, { specie: 'Gyarados' }, { specie: 'Amoonguss' }, { specie: 'Kingambit' }], true), ...logMiaSquadra(squadra, [0, 1])]);
    const [a, b] = s.split(', ');
    const terremoto = /^move 1\b/.test(a);
    if (terremoto) {
        // se lo usa, deve avere messo al sicuro l'alleato: Protezione o cambio verso chi vola
        assert.ok(/^move 4\b/.test(b) || /^switch 3\b/.test(b), `Terremoto con alleato esposto: ${s}`);
    }
});

test('doppio: Terremoto molto utile + alleato che si protegge o esce per chi vola', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Tyranitar', item: 'Leftovers', mosse: ['Crunch', 'Stone Edge', 'Low Kick', 'Protect'] },
        { specie: 'Corviknight', item: 'Leftovers', mosse: ['Brave Bird', 'Iron Head', 'Roost', 'Protect'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    // Heatran e Magnezone sono 4x deboli a Terra: Terremoto è devastante, ma Tyranitar lo subirebbe
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Heatran' }, { specie: 'Magnezone' }, { specie: 'Kingambit' }, { specie: 'Amoonguss' }], true), ...logMiaSquadra(squadra, [0, 1])]);
    const [a, b] = s.split(', ');
    assert.match(a, /^move 1\b/, `Terremoto: ${s}`);
    assert.ok(/^move 4\b/.test(b) || /^switch 3\b/.test(b), `l'alleato deve proteggersi o uscire per Corviknight: ${s}`);
});

test('doppio: Fake Out il primo turno, non il secondo', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Incineroar', item: 'Sitrus Berry', mosse: ['Fake Out', 'Parting Shot', 'Taunt', 'Protect'] },
        { specie: 'Rillaboom', item: 'Miracle Seed', mosse: ['Grassy Glide', 'Protect', 'Wood Hammer', 'High Horsepower'] },
        { specie: 'Gholdengo', item: 'Leftovers', mosse: ['Make It Rain', 'Shadow Ball', 'Protect', 'Trick'] }
    ];
    const avv = [{ specie: 'Dragapult' }, { specie: 'Gholdengo' }, { specie: 'Amoonguss' }, { specie: 'Kingambit' }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    const s1 = scelta(ia, r, [...logAvversario(avv, true), ...logMiaSquadra(squadra, [0, 1])]);
    assert.match(s1.split(', ')[0], /^move 1\b/, `turno 1: ${s1}`);
    // secondo turno: Incineroar ha già agito in campo, Fake Out non funziona più
    ia.osserva(['|move|p2a: Incineroar|Fake Out|p1a: Dragapult', '|turn|2']);
    const s2 = ia.scegli(r);
    assert.ok(!/^move 1\b/.test(s2.split(', ')[0]), `turno 2: ${s2}`);
});

test('doppio: Tailwind se la squadra è più lenta, non se è già più veloce', async () => {
    const { sim } = await cervello();
    const squadra = [
        { specie: 'Tornadus', item: 'Leftovers', abilita: 'Prankster', mosse: ['Tailwind', 'Bleakwind Storm', 'Heat Wave', 'Protect'] },
        { specie: 'Ursaluna', item: 'Flame Orb', mosse: ['Facade', 'Earthquake', 'Protect', 'Headlong Rush'] },
        { specie: 'Amoonguss', item: 'Sitrus Berry', mosse: ['Pollen Puff', 'Rage Powder', 'Protect', 'Clear Smog'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });

    const lenta = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5 });
    const contro = [{ specie: 'Greninja' }, { specie: 'Weavile' }, { specie: 'Starmie' }, { specie: 'Alakazam' }];
    const s = scelta(lenta, r, [...logAvversario(contro, true), ...logMiaSquadra(squadra, [0, 1])]);
    assert.match(s.split(', ')[0], /^move 1\b/, `squadra più lenta: ${s}`);

    // stessa mossa, ma qui in campo ci sono due Pokémon più veloci di tutti i loro: Tailwind non serve
    const squadraVeloce = [
        { specie: 'Tornadus', item: 'Leftovers', abilita: 'Prankster', mosse: ['Tailwind', 'Bleakwind Storm', 'Heat Wave', 'Protect'] },
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Amoonguss', item: 'Sitrus Berry', mosse: ['Pollen Puff', 'Rage Powder', 'Protect', 'Clear Smog'] }
    ];
    const rVeloce = creaRichiesta(sim.Dex, { squadra: squadraVeloce, attivi: [0, 1] });
    const veloce = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5 });
    const piano = [{ specie: 'Snorlax' }, { specie: 'Torkoal' }, { specie: 'Ursaluna' }, { specie: 'Dondozo' }];
    const s2 = scelta(veloce, rVeloce, [...logAvversario(piano, true), ...logMiaSquadra(squadraVeloce, [0, 1])]);
    assert.ok(!/^move 1\b/.test(s2.split(', ')[0]), `già più veloce: Tailwind inutile: ${s2}`);
});

test('doppio: non usa la Protezione due volte di fila quando può attaccare', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Rillaboom', item: 'Miracle Seed', mosse: ['Wood Hammer', 'Grassy Glide', 'Protect', 'Fake Out'] },
        { specie: 'Gholdengo', item: 'Leftovers', mosse: ['Make It Rain', 'Shadow Ball', 'Protect', 'Trick'] }
    ];
    const avv = [{ specie: 'Dragapult' }, { specie: 'Kingambit' }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    ia.osserva([...logAvversario(avv, true), ...logMiaSquadra(squadra, [0, 1])]);
    // al turno scorso tutti e due si sono protetti: ora la Protezione riuscirebbe una volta su tre
    ia.osserva(['|move|p2a: Rillaboom|Protect|p2a: Rillaboom', '|move|p2b: Gholdengo|Protect|p2b: Gholdengo', '|turn|2']);
    const s = ia.scegli(r);
    const protezioni = s.split(', ').filter(x => /^move 3\b/.test(x)).length;
    assert.ok(protezioni < 2, `due Protezioni di fila fallirebbero spesso: ${s}`);
});

test('doppio: due Pokémon non cambiano con lo stesso compagno e c\'è al massimo una Mega e una Teracristal per turno', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Charizard', item: 'Charizardite X', mosse: ['Flamethrower', 'Dragon Claw', 'Roost', 'Protect'] },
        { specie: 'Gengar', item: 'Gengarite', mosse: ['Shadow Ball', 'Sludge Bomb', 'Protect', 'Focus Blast'] },
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Corviknight', item: 'Leftovers', mosse: ['Brave Bird', 'Iron Head', 'Roost', 'Protect'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1], extra: { active: [{ canMegaEvo: true, canTerastallize: 'Fire' }, { canMegaEvo: true, canTerastallize: 'Ghost' }] } });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Dragapult' }, { specie: 'Kingambit' }], true), ...logMiaSquadra(squadra, [0, 1])]);
    const parti = s.split(', ');
    assert.equal(parti.length, 2);
    assert.ok(parti.filter(x => /mega/.test(x)).length <= 1, `una sola Mega per turno: ${s}`);
    assert.ok(parti.filter(x => /terastallize/.test(x)).length <= 1, `una sola Teracristal per turno: ${s}`);
    const cambi = parti.filter(x => x.startsWith('switch')).map(x => x.split(' ')[1]);
    assert.equal(new Set(cambi).size, cambi.length);
});

// ===================================================
// MECCANICHE DI GENERAZIONE: Dynamax (Gen 8), Mosse Z e Ultra Esplosione (Gen 7). La Mega e la Teracristal sono più sopra.
// La CPU sa se il formato le ammette (opzione `meccaniche`, o la clausola scritta nel log dal simulatore) e, quando sono ammesse,
// le usa: il Dynamax e la Mossa Z come varianti della mossa (la Mossa Z è una mossa a parte), ognuna una volta per partita.
// ===================================================
// Quello che il simulatore scrive in `maxMoves` della richiesta: una mossa Max per ogni mossa (Max Guard per quelle di stato)
function mosseMax(Dex, mosse) {
    const dex = Dex.forGen(8);
    return {
        maxMoves: mosse.map(nome => {
            const d = dex.moves.get(nome);
            return d.category === 'Status' ? { move: 'maxguard', target: 'self' } : { move: K.MOSSE_MAX[d.type], target: 'adjacentFoe' };
        })
    };
}
// Una richiesta di Gen 8 (livello 100) con i miei Pokémon; `dinamax` aggiunge canDynamax/maxMoves ai Pokémon in campo, `inDinamax` solo maxMoves
function richiesta8(Dex, squadra, attivi, { dinamax = true, inDinamax = false } = {}) {
    const active = attivi.map(i => ({
        ...(dinamax && !inDinamax ? { canDynamax: true } : {}),
        ...(dinamax || inDinamax ? { maxMoves: mosseMax(Dex, squadra[i].mosse) } : {})
    }));
    return creaRichiesta(Dex, { squadra, attivi, gen: 8, livello: 100, extra: { active } });
}
// extra: righe prima della squadra (le regole); dopo: righe dopo che i Pokémon sono in campo (Dynamax già in corso...)
function log8(avversari, miaSquadra, attivi, doppio, extra = [], dopo = []) {
    const righe = ['|gen|8', `|gametype|${doppio ? 'doubles' : 'singles'}`, ...extra];
    avversari.forEach(a => righe.push(`|poke|p1|${a.specie}, L100|`));
    avversari.slice(0, doppio ? 2 : 1).forEach((a, i) => righe.push(`|switch|p1${'ab'[i]}: ${a.specie}|${a.specie}, L100|${a.hp == null ? 100 : a.hp}/100`));
    miaSquadra.forEach(s => righe.push(`|poke|p2|${s.specie}, L100|`));
    attivi.forEach((i, k) => righe.push(`|switch|p2${'ab'[k]}: ${miaSquadra[i].specie}|${miaSquadra[i].specie}, L100|${miaSquadra[i].hp == null ? 100 : miaSquadra[i].hp}/100`));
    righe.push(...dopo, '|turn|2');
    return righe;
}
const DRAGAPULT = [{ specie: 'Dragapult', mosse: ['Shadow Ball', 'Draco Meteor', 'U-turn', 'Thunderbolt'] }, { specie: 'Blissey', mosse: ['Soft-Boiled', 'Seismic Toss', 'Toxic', 'Protect'] }];

test('Dynamax: se la mossa Max mette KO e quella normale no, la CPU lo fa (move N dynamax)', async () => {
    const { sim, ia } = await cervello();
    const s = scelta(ia, richiesta8(sim.Dex, DRAGAPULT, [0]), log8([{ specie: 'Gengar' }], DRAGAPULT, [0], false));
    assert.equal(s, 'move 1 dynamax', 'Ombrartigli normale non basta, Max Phantasma sì');
    assert.equal(ia.ammette('dynamax'), true);
});

test('Dynamax Clause nel log: la CPU sa che il formato non lo ammette e non lo sceglie, anche se la richiesta lo offre', async () => {
    const { sim, ia } = await cervello();
    const righe = log8([{ specie: 'Gengar' }], DRAGAPULT, [0], false, ['|rule|Dynamax Clause: Pokémon cannot Dynamax']);
    const s = scelta(ia, richiesta8(sim.Dex, DRAGAPULT, [0]), righe);
    assert.doesNotMatch(s, /dynamax/);
    assert.equal(ia.ammette('dynamax'), false);
    assert.equal(ia.ammette('tera'), true, 'le altre meccaniche restano come sono');
});

test('meccaniche: opzione false = nessuna; un oggetto spegne solo quelle dette', async () => {
    const { sim, ia } = await cervello({ meccaniche: false });
    for (const m of ['mega', 'z', 'dynamax', 'tera']) assert.equal(ia.ammette(m), false, m);
    const s = scelta(ia, richiesta8(sim.Dex, DRAGAPULT, [0]), log8([{ specie: 'Gengar' }], DRAGAPULT, [0], false));
    assert.doesNotMatch(s, /dynamax|zmove|mega|ultra|terastallize/);

    const { ia: parziale } = await cervello({ meccaniche: { dynamax: false } });
    assert.equal(parziale.ammette('dynamax'), false);
    assert.equal(parziale.ammette('mega'), true);
    const { ia: libera } = await cervello({ meccaniche: true });
    for (const m of ['mega', 'z', 'dynamax', 'tera']) assert.equal(libera.ammette(m), true, m);
});

test('Dynamax: un Pokémon con le mosse di stato non lo fa (sarebbe solo un Max Guard)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Blissey', mosse: ['Soft-Boiled', 'Toxic', 'Protect', 'Wish'] }, DRAGAPULT[0]];
    const s = scelta(ia, richiesta8(sim.Dex, squadra, [0]), log8([{ specie: 'Gengar' }], squadra, [0], false));
    assert.doesNotMatch(s, /dynamax/);
});

test('Dynamax in corso: gioca la mossa Max (la scelta resta "move N") e non riprova il Dynamax', async () => {
    const { sim, ia } = await cervello();
    const richiesta = richiesta8(sim.Dex, DRAGAPULT, [0], { dinamax: false, inDinamax: true });
    assert.ok(richiesta.active[0].maxMoves && !richiesta.active[0].canDynamax, 'la richiesta ha maxMoves e non canDynamax');
    const s = scelta(ia, richiesta, log8([{ specie: 'Gengar' }], DRAGAPULT, [0], false, [], ['|-start|p2a: Dragapult|Dynamax']));
    assert.equal(s, 'move 1', 'Max Phantasma, la mossa più forte contro Gengar');
});

test('Dynamax in corso: le mosse di stato sono Max Guard, una protezione (non due volte di fila)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Blissey', mosse: ['Soft-Boiled', 'Toxic', 'Protect', 'Wish'] }, DRAGAPULT[0]];
    const richiesta = richiesta8(sim.Dex, squadra, [0], { dinamax: false, inDinamax: true });
    const s = scelta(ia, richiesta, log8([{ specie: 'Gengar' }], squadra, [0], false, [], ['|-start|p2a: Blissey|Dynamax']));
    assert.match(s, /^move [1-4]$/);
    // Max Guard ha priorità +4 e conta come protezione: dopo un Max Guard riuscito la CPU lo sa dal log
    ia.osserva(['|move|p2a: Blissey|Max Guard|p2a: Blissey', '|turn|3']);
    assert.equal(ia.lati.p2.mons.Blissey.protezioniDiFila, 1);
});

test('Dynamax in doppio: il bersaglio è quello della mossa Max (un avversario), anche se la mossa normale colpisce tutti (Terremoto)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Garchomp', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }, { specie: 'Amoonguss', mosse: ['Spore', 'Rage Powder', 'Pollen Puff', 'Protect'] }];
    const avv = [{ specie: 'Heatran' }, { specie: 'Tyranitar' }];
    const r = richiesta8(sim.Dex, squadra, [0, 1]);
    const parti = scelta(ia, r, log8(avv, squadra, [0, 1], true)).split(', ');
    assert.equal(parti.length, 2);
    assert.ok(parti.filter(x => /dynamax/.test(x)).length <= 1, `un solo Dynamax per turno: ${parti}`);
    for (const x of parti.filter(x => /dynamax/.test(x))) assert.match(x, /^move [1-4] [12] dynamax$/, 'la mossa Max vuole un bersaglio');
});

test('Dynamax: un avversario in Dynamax ha il doppio degli HP e gioca mosse Max, finché dura', async () => {
    const { sim, ia } = await cervello();
    const avv = [{ specie: 'Tyranitar' }];
    ia.osserva(log8(avv, DRAGAPULT, [0], false));
    ia.osserva(['|move|p1a: Tyranitar|Earthquake|p2a: Dragapult']);
    const mon = ia.lati.p1.mons.Tyranitar;
    const normale = ia.vista(mon);
    const moltoPrima = ia.mosseAvversario(normale).find(m => m.id === 'earthquake');
    assert.equal(moltoPrima.potenza, 100);

    ia.osserva(['|-start|p1a: Tyranitar|Dynamax']);
    const inMax = ia.vista(mon);
    assert.equal(inMax.hpMax, normale.hpMax * 2, 'HP doppi');
    assert.equal(inMax.hp, normale.hp * 2, 'la percentuale che si vede resta la stessa');
    assert.equal(ia.lati.p1.dinamaxUsato, true);
    const max = ia.mosseAvversario(inMax).find(m => m.id === 'maxquake');
    assert.ok(max, 'Terremoto diventa Max Terremoto');
    assert.equal(max.potenza, 130);
    assert.equal(max.tipo, 'Ground');
    assert.equal(max.precisione, 100);

    ia.osserva(['|-end|p1a: Tyranitar|Dynamax']);
    assert.equal(ia.vista(mon).hpMax, normale.hpMax, 'finito il Dynamax gli HP sono quelli di prima');
    // anche un cambio o un KO lo fanno finire
    ia.osserva(['|-start|p1a: Tyranitar|Dynamax', '|faint|p1a: Tyranitar']);
    assert.equal(mon.dinamax, false);
});

test('Dynamax: un avversario che ne ha già fatto uno non conta come offerto a noi (una sola volta per lato)', async () => {
    const { sim, ia } = await cervello();
    ia.osserva(log8([{ specie: 'Tyranitar' }], DRAGAPULT, [0], false, [], ['|-start|p1a: Tyranitar|Dynamax']));
    assert.equal(ia.lati.p1.dinamaxUsato, true);
    assert.ok(!ia.lati.p2.dinamaxUsato, 'il suo Dynamax non è il nostro: la richiesta dice se possiamo');
    const s = scelta(ia, richiesta8(sim.Dex, DRAGAPULT, [0]), []);
    assert.match(s, /^move /);
});

// ---------- Mosse Z (Gen 7) ----------
const KOKO = ['Tapu Koko', ['Thunderbolt', 'Dazzling Gleam', 'Protect', 'U-turn'], 'Electrium Z', [{ move: 'Gigavolt Havoc', target: 'normal' }, null, null, null]];
function sceltaZ(sim, ia, avversario, mio = KOKO, righeExtra = []) {
    const squadra = [{ specie: mio[0], mosse: mio[1], item: mio[2] }, { specie: 'Blissey', mosse: ['Soft-Boiled', 'Seismic Toss', 'Toxic', 'Protect'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], gen: 7, livello: 100, extra: { active: [{ canZMove: mio[3] }] } });
    return scelta(ia, r, ['|gen|7', '|gametype|singles', ...righeExtra, `|poke|p1|${avversario}, L100|`, `|switch|p1a: ${avversario}|${avversario}, L100|100/100`,
        `|poke|p2|${mio[0]}, L100|`, `|switch|p2a: ${mio[0]}|${mio[0]}, L100|100/100`, '|turn|2']);
}

test('Mossa Z: la CPU la usa quando è lei a mettere KO (Gigavolt Havoc contro Skarmory)', async () => {
    const { sim, ia } = await cervello();
    assert.equal(sceltaZ(sim, ia, 'Skarmory'), 'move 1 zmove');
});

test('Mossa Z: non si spreca quando la mossa normale basta (Fulmine contro un Gyarados), né contro chi è immune (Garchomp)', async () => {
    const { sim, ia } = await cervello();
    assert.equal(sceltaZ(sim, ia, 'Gyarados'), 'move 1', 'Fulmine contro un 4x mette già KO');
    const { ia: altra } = await cervello();
    assert.doesNotMatch(sceltaZ(sim, altra, 'Garchomp'), /zmove/, 'Garchomp è immune alla Mossa Z di tipo Elettro');
});

test('Mossa Z: se il formato non le ammette (Z-Move Clause nel log o meccaniche spente) la CPU non la considera', async () => {
    const { sim, ia } = await cervello();
    assert.doesNotMatch(sceltaZ(sim, ia, 'Skarmory', KOKO, ['|rule|Z-Move Clause: Z-Moves are banned']), /zmove/);
    assert.equal(ia.ammette('z'), false);
    const { ia: spenta } = await cervello({ meccaniche: false });
    assert.doesNotMatch(sceltaZ(sim, spenta, 'Skarmory'), /zmove/);
});

test('Mossa Z: la richiesta con una Mossa Z per una mossa di stato non fa scegliere la Mossa Z (nessun bonus che la CPU sappia usare)', async () => {
    const { sim, ia } = await cervello();
    const mio = ['Tapu Koko', ['Thunderbolt', 'Dazzling Gleam', 'Protect', 'U-turn'], 'Electrium Z', [null, null, { move: 'Z-Protect', target: 'self' }, null]];
    const s = sceltaZ(sim, ia, 'Skarmory', mio);
    assert.doesNotMatch(s, /zmove/);
});

test('Ultra Esplosione: la CPU la fa (è una forma più forte e non costa nulla), una sola per turno', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Necrozma-Dusk-Mane', item: 'Ultranecrozium Z', mosse: ['Sunsteel Strike', 'Earthquake', 'Photon Geyser', 'Protect'] }, { specie: 'Blissey', mosse: ['Soft-Boiled', 'Seismic Toss', 'Toxic', 'Protect'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], gen: 7, livello: 100, extra: { active: [{ canUltraBurst: true }] } });
    const s = scelta(ia, r, ['|gen|7', '|gametype|singles', '|poke|p1|Gengar, L100|', '|switch|p1a: Gengar|Gengar, L100|100/100',
        '|poke|p2|Necrozma-Dusk-Mane, L100|', '|switch|p2a: Necrozma-Dusk-Mane|Necrozma-Dusk-Mane, L100|100/100', '|turn|2']);
    assert.match(s, /^move [1-4] ultra$/);
});

test('mosse Max e Mosse Z: potenza, tipo e categoria dalla mossa di partenza (CpuConoscenza.mossaMax / mossaZ)', async () => {
    const { sim } = await caricaSim();
    const d8 = sim.Dex.forGen(8), d7 = sim.Dex.forGen(7);
    const terremoto = K.descriviMossa(d8, 'Earthquake');
    const max = K.mossaMax(d8, terremoto, 'maxquake');
    assert.deepEqual([max.id, max.nome, max.tipo, max.categoria, max.potenza, max.precisione, max.target, max.priorita], ['maxquake', 'Max Quake', 'Ground', 'Physical', 130, 100, 'adjacentFoe', 0]);
    assert.equal(max.multi, null);
    assert.equal(max.secondari, null);
    assert.equal(max.colpisceAlleato, false, 'una mossa Max colpisce un solo avversario, anche se Terremoto colpisce tutti');
    // Lotta e Veleno hanno una potenza Max più bassa
    assert.equal(K.mossaMax(d8, K.descriviMossa(d8, 'Close Combat'), 'maxknuckle').potenza, 95);
    assert.equal(K.potenzaMaxDaTabella(100, 'Fire'), 130);
    assert.equal(K.potenzaMaxDaTabella(100, 'Fighting'), 90);
    assert.equal(K.potenzaMaxDaTabella(150, 'Normal'), 150);
    // le mosse di stato diventano Max Guard: una protezione con priorità +4
    const guardia = K.mossaMax(d8, K.descriviMossa(d8, 'Toxic'), 'maxguard');
    assert.deepEqual([guardia.id, guardia.categoria, guardia.protezione, guardia.priorita, guardia.target], ['maxguard', 'Status', true, 4, 'self']);
    assert.ok(K.PROTEZIONI.has('maxguard'));
    // la Mossa Z
    const z = K.mossaZ(d7, K.descriviMossa(d7, 'Thunderbolt'), { move: 'Gigavolt Havoc', target: 'normal' });
    assert.deepEqual([z.id, z.tipo, z.categoria, z.potenza, z.precisione, z.target], ['gigavolthavoc', 'Electric', 'Special', 175, 100, 'normal']);
    const unica = K.mossaZ(d7, K.descriviMossa(d7, 'Volt Tackle'), { move: 'Catastropika', target: 'normal' });
    assert.equal(unica.potenza, 210, 'le Mosse Z uniche hanno la loro potenza');
    assert.equal(K.mossaZ(d7, K.descriviMossa(d7, 'Protect'), { move: 'Z-Protect', target: 'self' }), null, 'la Mossa Z di stato non si usa');
    assert.equal(K.potenzaZDaTabella(90), 175);
    assert.equal(K.potenzaZDaTabella(150), 200);
});

// ===================================================
// ANTEPRIMA, CAMBI FORZATI, CASI PARTICOLARI
// ===================================================
test('anteprima: sceglie quanti Pokémon servono e li ordina come "team 1234"', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Gholdengo', mosse: ['Make It Rain', 'Shadow Ball', 'Protect', 'Trick'] },
        { specie: 'Rillaboom', mosse: ['Wood Hammer', 'Fake Out', 'Grassy Glide', 'Protect'] },
        { specie: 'Incineroar', mosse: ['Flare Blitz', 'Fake Out', 'Parting Shot', 'Knock Off'] },
        { specie: 'Amoonguss', mosse: ['Spore', 'Pollen Puff', 'Rage Powder', 'Protect'] },
        { specie: 'Tornadus', mosse: ['Tailwind', 'Bleakwind Storm', 'Heat Wave', 'Protect'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [], extra: { richiesta: { teamPreview: true, maxChosenTeamSize: 4 } } });
    delete r.active;
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Dragapult' }, { specie: 'Kingambit' }, { specie: 'Primarina' }, { specie: 'Amoonguss' }, { specie: 'Landorus-Therian' }, { specie: 'Hatterene' }], true).slice(0, 8), ...logMiaSquadra(squadra, [])]);
    assert.match(s, /^team [1-6]{4}$/);
    assert.equal(new Set(s.slice(5).split('')).size, 4, 'quattro Pokémon diversi');
});

test('Revival Blessing: rianima un Pokémon caduto', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Pelipper', mosse: ['Revival Blessing', 'Surf', 'Protect', 'Tailwind'] },
        { specie: 'Garchomp', hp: 0, mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Tornadus', hp: 0, mosse: ['Tailwind', 'Heat Wave', 'Protect', 'Taunt'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    delete r.active;
    r.forceSwitch = [true];
    r.side.pokemon[0].reviving = true;
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Dragapult' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.match(s, /^switch [23]$/, `deve scegliere un Pokémon caduto: ${s}`);
});

test('dopo un rifiuto del simulatore propone un\'altra scelta, senza ripetere la stessa', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] },
        { specie: 'Gengar', item: 'Leftovers', mosse: ['Shadow Ball', 'Sludge Bomb', 'Focus Blast', 'Thunderbolt'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    ia.osserva([...logAvversario([{ specie: 'Heatran' }], false), ...logMiaSquadra(squadra, [0])]);
    const viste = new Set();
    for (let errori = 0; errori < 5; errori++) viste.add(ia.scegli(r, { errori }));
    assert.ok(viste.size >= 3, `dopo i rifiuti si provano scelte diverse: ${[...viste].join(' | ')}`);
});

test('tiene traccia del campo dal log: meteo, Tailwind, Camera Magica, stati e potenziamenti', async () => {
    const { ia } = await cervello();
    ia.osserva([
        '|gen|9', '|gametype|doubles', '|poke|p1|Garchomp, L50|', '|switch|p1a: Garchomp|Garchomp, L50|100/100', '|turn|1',
        '|-weather|RainDance', '|-fieldstart|move: Trick Room', '|-sidestart|p1: A|move: Tailwind',
        '|-boost|p1a: Garchomp|atk|2', '|-status|p1a: Garchomp|par', '|-damage|p1a: Garchomp|40/100 par',
        '|move|p1a: Garchomp|Earthquake|p2a: X', '|-terastallize|p1a: Garchomp|Fire'
    ]);
    assert.equal(ia.meteo, 'rain');
    assert.equal(ia.stanzaMagica, true);
    assert.ok(ia.lati.p1.campo.tailwind > 0);
    const g = ia.lati.p1.mons.Garchomp;
    assert.equal(g.boost.atk, 2);
    assert.equal(g.stato, 'par');
    assert.equal(Math.round(g.pct), 40);
    assert.ok(g.mosseViste.has('earthquake'));
    assert.equal(g.tera, 'Fire');
    ia.osserva(['|-weather|none', '|-fieldend|move: Trick Room', '|-sideend|p1: A|move: Tailwind', '|switch|p1a: Garchomp|Garchomp, L50|100/100']);
    assert.equal(ia.meteo, null);
    assert.equal(ia.stanzaMagica, false);
    assert.equal(ia.lati.p1.campo.tailwind, 0);
    assert.equal(ia.lati.p1.mons.Garchomp.boost.atk, 0, 'chi rientra perde i potenziamenti');
});

// ===================================================
// SUPER EFFICACE, PROTEZIONI, CAMBIO SICURO
// ===================================================
test('singolo: un tentennamento del 30% non fa preferire una mossa resistita a una 4x (Iron Treads contro Pelipper)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Iron Treads', item: 'Sitrus Berry', mosse: ['Stealth Rock', 'Volt Switch', 'Earthquake', 'Iron Head'] },
        { specie: 'Primarina', item: 'Leftovers', mosse: ['Moonblast', 'Surf', 'Psychic', 'Energy Ball'] },
        { specie: 'Kyurem', item: 'Leftovers', mosse: ['Ice Beam', 'Draco Meteor', 'Earth Power', 'Freeze-Dry'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Pelipper' }, { specie: 'Garchomp' }], false), ...logMiaSquadra(squadra, [0]), '|-weather|RainDance']);
    assert.notEqual(s, 'move 4', 'Iron Head è resistita: Volt Switch fa 4x');
});

test('singolo: preferisce la mossa super efficace a una neutra con STAB quasi pari (Rillaboom contro Iron Hands)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [{ specie: 'Rillaboom', item: 'Leftovers', mosse: ['Wood Hammer', 'High Horsepower', 'Grassy Glide', 'Knock Off'] }];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Iron Hands' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.equal(s, 'move 2', 'High Horsepower è super efficace su Iron Hands (Elettro)');
});

test('doppio: tra due bersagli sceglie quello su cui la mossa è super efficace', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Primarina', item: 'Leftovers', mosse: ['Moonblast', 'Surf', 'Protect', 'Icy Wind'] },
        { specie: 'Rillaboom', item: 'Leftovers', mosse: ['Wood Hammer', 'Grassy Glide', 'Protect', 'Fake Out'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    // Heatran (Fuoco/Acciaio) e Garchomp (Drago/Terra): Surf è 2x su Heatran... e 2x su Garchomp è Terra; Moonblast è 2x su Garchomp (Drago)
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Heatran' }, { specie: 'Garchomp' }, { specie: 'Amoonguss' }, { specie: 'Kingambit' }], true), ...logMiaSquadra(squadra, [0, 1])]);
    const [a] = s.split(', ');
    assert.ok(!/^move 1 1\b/.test(a), `Moonblast su Heatran (Fuoco/Acciaio) è 0,25x: ${s}`);
});

test('il conto delle protezioni: si legge dal log, per Pokémon, e si azzera con un fallimento, un\'altra mossa o un cambio', async () => {
    const { ia } = await cervello();
    ia.osserva(['|gen|9', '|gametype|doubles', '|switch|p2a: Rillaboom|Rillaboom, L50|100/100', '|switch|p2b: Gholdengo|Gholdengo, L50|100/100', '|turn|1']);
    const ril = () => ia.lati.p2.mons.Rillaboom, gho = () => ia.lati.p2.mons.Gholdengo;
    ia.osserva(['|move|p2a: Rillaboom|Protect|p2a: Rillaboom', '|move|p2b: Gholdengo|Make It Rain|p1a: X', '|turn|2']);
    assert.equal(ia._protezioniDiFila(ril()), 1, 'ha protetto il turno scorso');
    assert.equal(ia._protezioniDiFila(gho()), 0, 'Gholdengo no');
    // la seconda di fila, riuscita: il conto sale
    ia.osserva(['|move|p2a: Rillaboom|Protect|p2a: Rillaboom', '|-singleturn|p2a: Rillaboom|Protect', '|turn|3']);
    assert.equal(ia._protezioniDiFila(ril()), 2);
    // un turno senza protezione: si riparte
    ia.osserva(['|move|p2a: Rillaboom|Wood Hammer|p1a: X', '|turn|4']);
    assert.equal(ia._protezioniDiFila(ril()), 0);
    // una protezione fallita azzera il conto (la prossima riuscirà sempre)
    ia.osserva(['|move|p2a: Rillaboom|Protect|p2a: Rillaboom', '|turn|5', '|move|p2a: Rillaboom|Protect|p2a: Rillaboom', '|-fail|p2a: Rillaboom']);
    ia.osserva(['|turn|6']);
    assert.equal(ia._protezioniDiFila(ril()), 0, 'una protezione che fallisce azzera il conto');
    // chi esce e rientra riparte da zero
    ia.osserva(['|move|p2a: Rillaboom|Protect|p2a: Rillaboom', '|switch|p2a: Rillaboom|Rillaboom, L50|100/100', '|turn|7']);
    assert.equal(ia._protezioniDiFila(ril()), 0);
});

test('singolo: la seconda Protezione di fila non si gioca nemmeno contro un attacco micidiale se si può fare altro', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Gholdengo', item: 'Leftovers', mosse: ['Make It Rain', 'Shadow Ball', 'Protect', 'Recover'] },
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    ia.osserva([...logAvversario([{ specie: 'Kingambit' }], false), ...logMiaSquadra(squadra, [0])]);
    ia.osserva(['|move|p2a: Gholdengo|Protect|p2a: Gholdengo', '|turn|2']);
    const s = ia.scegli(r);
    assert.notEqual(s, 'move 3', `la seconda Protezione riuscirebbe una volta su tre: ${s}`);
});

test('la prima Protezione si usa ancora quando serve (Pokémon quasi esausto, nessun altro modo di salvarlo)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Gholdengo', item: 'Leftovers', hp: 20, mosse: ['Protect', 'Shadow Ball', 'Make It Rain', 'Trick'] },
        { specie: 'Garchomp', item: 'Leftovers', hp: 0, mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Flutter Mane' }], false), ...logMiaSquadra(squadra, [0])]);
    assert.equal(s, 'move 1', `Protezione al primo turno: ${s}`);
});

test('doppio: la prima Protezione si usa ancora quando serve (Pokémon quasi esausto contro due attaccanti)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Gholdengo', item: 'Leftovers', hp: 20, mosse: ['Protect', 'Shadow Ball', 'Make It Rain', 'Trick'] },
        { specie: 'Rillaboom', item: 'Leftovers', mosse: ['Wood Hammer', 'Grassy Glide', 'High Horsepower', 'Protect'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Dragapult' }, { specie: 'Flutter Mane' }, { specie: 'Kingambit' }, { specie: 'Amoonguss' }], true), ...logMiaSquadra(squadra, [0, 1])]);
    assert.match(s.split(', ')[0], /^move 1$/, `Protezione al primo turno: ${s}`);
});

test('singolo: con una minaccia 2x e in panchina chi la regge, cambia invece di curarsi (Zapdos contro Tyranitar)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Zapdos', item: 'Leftovers', hp: 46, mosse: ['Roost', 'Thunderbolt', 'Heat Wave', 'Hurricane'] },
        { specie: 'Hatterene', item: 'Leftovers', mosse: ['Psychic', 'Dazzling Gleam', 'Calm Mind', 'Mystical Fire'] },
        { specie: 'Heatran', item: 'Leftovers', mosse: ['Magma Storm', 'Earth Power', 'Flash Cannon', 'Stealth Rock'] },
        { specie: 'Ogerpon', item: 'Leftovers', mosse: ['Ivy Cudgel', 'Knock Off', 'Swords Dance', 'Horn Leech'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], livello: 100 });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Tyranitar' }], false, 1, 100), ...logMiaSquadra(squadra, [0], 100)]);
    assert.equal(s, 'switch 3', 'Heatran (Acciaio) resiste alla Roccia: cambio sicuro');
});

test('singolo: non cambia se può mettere KO prima che l\'avversario muova', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] },
        { specie: 'Corviknight', item: 'Leftovers', mosse: ['Brave Bird', 'Iron Head', 'Roost', 'Defog'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], livello: 100 });
    // Heatran al 25%, più lento di Garchomp: Terremoto è 4x e lo manda KO
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Heatran', hp: 25 }], false, 1, 100), ...logMiaSquadra(squadra, [0], 100)]);
    assert.equal(s, 'move 1', `si attacca: ${s}`);
});

test('singolo: non cambia verso un Pokémon che la minaccia colpirebbe ancora più forte', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Charizard', item: 'Leftovers', mosse: ['Flamethrower', 'Air Slash', 'Roost', 'Dragon Pulse'] },
        { specie: 'Ho-Oh', item: 'Leftovers', mosse: ['Sacred Fire', 'Brave Bird', 'Recover', 'Earthquake'] },
        { specie: 'Moltres', item: 'Leftovers', mosse: ['Flamethrower', 'Hurricane', 'Roost', 'U-turn'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], livello: 100 });
    // Tyranitar colpisce 4x Charizard, Ho-Oh e Moltres altrettanto (Fuoco/Volante): nessun cambio sicuro, meglio attaccare
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Tyranitar' }], false, 1, 100), ...logMiaSquadra(squadra, [0], 100)]);
    assert.match(s, /^move /, `nessuno regge la Roccia: ${s}`);
});

test('singolo: un U-turn/Volt Switch è il cambio sicuro per eccellenza: si colpisce e poi entra chi regge', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Iron Treads', item: 'Sitrus Berry', mosse: ['Stealth Rock', 'Volt Switch', 'Earthquake', 'Iron Head'] },
        { specie: 'Primarina', item: 'Leftovers', mosse: ['Moonblast', 'Surf', 'Psychic', 'Energy Ball'] },
        { specie: 'Kyurem', item: 'Leftovers', mosse: ['Ice Beam', 'Draco Meteor', 'Earth Power', 'Freeze-Dry'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Pelipper' }, { specie: 'Garchomp' }], false), ...logMiaSquadra(squadra, [0]), '|-weather|RainDance']);
    assert.equal(s, 'move 2', 'Volt Switch: 4x su Pelipper, e poi entra chi regge la sua risposta');
});

test('singolo: il cambio sicuro regge anche la risposta dell\'avversario (non solo la mossa che si aspetta)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Heatran', item: 'Leftovers', hp: 40, mosse: ['Magma Storm', 'Earth Power', 'Flash Cannon', 'Protect'] },
        { specie: 'Dragonite', item: 'Leftovers', mosse: ['Outrage', 'Extreme Speed', 'Earthquake', 'Roost'] },
        { specie: 'Corviknight', item: 'Leftovers', mosse: ['Brave Bird', 'Iron Head', 'Roost', 'Defog'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], livello: 100 });
    // Garchomp colpisce Heatran 4x con Terremoto: Dragonite è immune alla Terra ma subirebbe Outrage (Drago) 2x; Corviknight regge entrambe
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Garchomp', hp: 60 }], false, 1, 100), ...logMiaSquadra(squadra, [0], 100)]);
    assert.equal(s, 'switch 3', 'Corviknight: immune a Terremoto e resiste a Outrage');
});

test('singolo: non cambia verso un Pokémon che regge la mossa prevista ma è debole all\'altro attacco dell\'avversario', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Heatran', item: 'Leftovers', hp: 50, mosse: ['Magma Storm', 'Earth Power', 'Flash Cannon', 'Protect'] },
        { specie: 'Dragonite', item: 'Leftovers', mosse: ['Outrage', 'Extreme Speed', 'Earthquake', 'Roost'] },
        { specie: 'Zapdos', item: 'Leftovers', mosse: ['Thunderbolt', 'Heat Wave', 'Roost', 'Hurricane'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], livello: 100 });
    // sia Dragonite sia Zapdos sono immuni a Terremoto, ma Dragonite è 2x debole al Drago (Outrage, l'altro attacco di Garchomp)
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Garchomp' }], false, 1, 100), ...logMiaSquadra(squadra, [0], 100)]);
    assert.notEqual(s, 'switch 2', `Dragonite subirebbe Outrage 2x: ${s}`);
});

test('le mosse che l\'avversario non ha ancora mostrato si presumono dal Dex (la sua mossa più forte per tipo), non a potenza fissa', async () => {
    const { ia } = await cervello();
    ia.osserva(['|gen|9', '|gametype|singles', '|switch|p1a: Iron Moth|Iron Moth, L50|100/100', '|turn|1']);
    const moth = ia.vista(ia.lati.p1.mons['Iron Moth']);
    const presunte = ia.mosseAvversario(moth);
    const fuoco = presunte.find(m => m.tipo === 'Fire');
    assert.ok(fuoco && fuoco.potenza > 95, `una mossa di fuoco forte (Overheat), non 85 fissi: ${fuoco && fuoco.nome} ${fuoco && fuoco.potenza}`);
    assert.ok(presunte.every(m => m.categoria !== 'Status'), 'solo attacchi');
    // una mossa vista resta quella vera
    ia.osserva(['|move|p1a: Iron Moth|Sludge Wave|p2a: X']);
    assert.ok(ia.mosseAvversario(ia.vista(ia.lati.p1.mons['Iron Moth'])).some(m => m.id === 'sludgewave'));
});

test('un avversario quasi esausto non si prevede che usi una mossa che lo metterebbe KO da sola (Steel Beam)', async () => {
    const { sim, ia } = await cervello();
    const squadra = [
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] },
        { specie: 'Corviknight', item: 'Leftovers', mosse: ['Brave Bird', 'Iron Head', 'Roost', 'Defog'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0], livello: 100 });
    ia.osserva([...logAvversario([{ specie: 'Heatran', hp: 25 }], false, 1, 100), ...logMiaSquadra(squadra, [0], 100)]);
    const s = ia.scegli(r);
    assert.equal(s, 'move 1', `Terremoto mette KO Heatran prima che muova: ${s}`);
});

// ===================================================
// STRATEGIA DEL TEAM
// ===================================================
const squadraPioggia = [
    { specie: 'Garchomp', hp: 0, mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
    { specie: 'Pelipper', item: 'Leftovers', abilita: 'Drizzle', mosse: ['Hurricane', 'Surf', 'U-turn', 'Protect'] },
    { specie: 'Excadrill', item: 'Leftovers', mosse: ['Earthquake', 'Iron Head', 'Rock Slide', 'Protect'] },
    { specie: 'Corviknight', item: 'Leftovers', mosse: ['Brave Bird', 'Iron Head', 'Roost', 'Protect'] }
];

test('strategia: il piano si legge dai set (setter e chi ne approfitta) e si deduce se quello dato non è realizzabile', async () => {
    const { sim } = await cervello();
    const squadra = [
        { specie: 'Pelipper', item: 'Leftovers', abilita: 'Drizzle', mosse: ['Hurricane', 'Surf', 'Tailwind', 'Protect'] },
        { specie: 'Kingdra', item: 'Leftovers', abilita: 'Swift Swim', mosse: ['Waterfall', 'Draco Meteor', 'Protect', 'Rain Dance'] },
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Torkoal', item: 'Leftovers', mosse: ['Eruption', 'Heat Wave', 'Protect', 'Earth Power'] }
    ];
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1], livello: 100 });
    const deduce = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5 });
    const s1 = deduce._leggiStrategia(deduce._squadra(r));
    assert.equal(s1.piano, 'pioggia', 'Drizzle e Swift Swim: pioggia');
    assert.equal(s1.meteo, 'rain');
    assert.deepEqual(s1.meteoSetter.rain, [1]);
    assert.ok(s1.vento.includes(1), 'Pelipper ha anche Tailwind');
    // un piano che il team non può realizzare (nessuno ha la Stanza Magica) si ignora
    const finto = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, piano: 'trickroom' });
    assert.equal(finto._leggiStrategia(finto._squadra(r)).piano, 'pioggia');
    // un piano dato e coerente si conferma
    const dato = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, piano: 'pioggia' });
    assert.equal(dato._leggiStrategia(dato._squadra(r)).piano, 'pioggia');
});

test('strategia: dopo un KO, con il piano della pioggia manda chi mette la pioggia; senza piano, chi risponde meglio', async () => {
    const { sim } = await cervello();
    const scegliPer = async piano => {
        const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, piano });
        const r = creaRichiesta(sim.Dex, { squadra: squadraPioggia, attivi: [0], livello: 100 });
        delete r.active;
        r.forceSwitch = [true];
        return scelta(ia, r, [...logAvversario([{ specie: 'Kingambit' }], false, 1, 100), ...logMiaSquadra(squadraPioggia, [0], 100)]);
    };
    assert.equal(await scegliPer('pioggia'), 'switch 2', 'Pelipper rimette la pioggia');
    assert.equal(await scegliPer(undefined), 'switch 3', 'senza piano: Excadrill risponde meglio a Kingambit');
});

test('strategia: il team del piano della pioggia in anteprima porta e manda in campo chi mette la pioggia anche contro avversari che lo minacciano', async () => {
    const mia = [
        { specie: 'Pelipper', item: 'Leftovers', abilita: 'Drizzle', mosse: ['Hurricane', 'Surf', 'Tailwind', 'Protect'] },
        { specie: 'Kingdra', item: 'Leftovers', abilita: 'Swift Swim', mosse: ['Waterfall', 'Draco Meteor', 'Protect', 'Rain Dance'] },
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Rillaboom', item: 'Leftovers', mosse: ['Wood Hammer', 'Grassy Glide', 'Fake Out', 'Protect'] },
        { specie: 'Gholdengo', item: 'Leftovers', mosse: ['Make It Rain', 'Shadow Ball', 'Protect', 'Trick'] },
        { specie: 'Kingambit', item: 'Leftovers', mosse: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Protect'] }
    ];
    const lenti = ['Clefable', 'Blissey', 'Corviknight', 'Toxapex', 'Slowbro', 'Skarmory'];
    const { sim } = await cervello();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, piano: 'pioggia' });
    const r = creaRichiesta(sim.Dex, { squadra: mia, attivi: [], livello: 100, extra: { richiesta: { teamPreview: true, maxChosenTeamSize: 4 } } });
    delete r.active;
    const s = scelta(ia, r, [...logAvversario(lenti.map(specie => ({ specie })), true, 1, 100).slice(0, 2 + lenti.length), ...logMiaSquadra(mia, [], 100)]);
    const idx = s.slice(5).split('').map(Number);
    assert.ok(idx.slice(0, 2).includes(1), `Pelipper (Drizzle) tra i due in campo: ${s}`);
    assert.ok(idx.includes(2), `Kingdra (Swift Swim), che ne approfitta, viene portato: ${s}`);
});

test('strategia: il team della Stanza Magica la mette al primo turno quando gli avversari sono più veloci', async () => {
    const { sim } = await cervello();
    const squadra = [
        { specie: 'Porygon2', item: 'Eviolite', mosse: ['Trick Room', 'Tri Attack', 'Recover', 'Protect'] },
        { specie: 'Torkoal', item: 'Leftovers', mosse: ['Eruption', 'Heat Wave', 'Protect', 'Earth Power'] },
        { specie: 'Dusclops', item: 'Eviolite', mosse: ['Night Shade', 'Pain Split', 'Protect', 'Will-O-Wisp'] }
    ];
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, piano: 'trickroom' });
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
    const s = scelta(ia, r, [...logAvversario([{ specie: 'Rillaboom' }, { specie: 'Kingambit' }, { specie: 'Amoonguss' }, { specie: 'Gholdengo' }], true), ...logMiaSquadra(squadra, [0, 1])]);
    assert.match(s.split(', ')[0], /^move 1$/, `Trick Room: ${s}`);
});

// ===================================================
// ANTEPRIMA SULLA SQUADRA AVVERSARIA
// ===================================================
const miaSquadraAnteprima = [
    { specie: 'Gyarados', item: 'Leftovers', mosse: ['Waterfall', 'Ice Fang', 'Earthquake', 'Dragon Dance'] },
    { specie: 'Starmie', item: 'Leftovers', mosse: ['Surf', 'Ice Beam', 'Psychic', 'Recover'] },
    { specie: 'Venusaur', item: 'Leftovers', mosse: ['Giga Drain', 'Sludge Bomb', 'Earthquake', 'Synthesis'] },
    { specie: 'Ferrothorn', item: 'Leftovers', mosse: ['Power Whip', 'Gyro Ball', 'Knock Off', 'Leech Seed'] },
    { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] },
    { specie: 'Blissey', item: 'Leftovers', mosse: ['Seismic Toss', 'Soft-Boiled', 'Toxic', 'Flamethrower'] }
];
const avversariAnteprima = {
    fuoco: ['Charizard', 'Heatran', 'Arcanine', 'Talonflame', 'Torkoal', 'Volcarona'],
    acqua: ['Swampert', 'Vaporeon', 'Milotic', 'Kingdra', 'Gastrodon', 'Slowbro'],
    volante: ['Dragonite', 'Zapdos', 'Corviknight', 'Salamence', 'Togekiss', 'Landorus'],
    misto: ['Gengar', 'Tyranitar', 'Clefable', 'Excadrill', 'Rotom-Wash', 'Hippowdon']
};
async function anteprimaContro(avv, opzioni = {}, squadra = miaSquadraAnteprima, doppio = false) {
    const { sim, ia } = await cervello(opzioni);
    const r = creaRichiesta(sim.Dex, { squadra, attivi: [], livello: 100, extra: { richiesta: { teamPreview: true, maxChosenTeamSize: 4 } } });
    delete r.active;
    const log = logAvversario(avv.map(specie => ({ specie })), doppio, 1, 100).slice(0, 2 + avv.length);
    const s = scelta(ia, r, [...log, ...logMiaSquadra(squadra, [], 100)]);
    assert.match(s, /^team [1-6]{4}$/);
    const idx = s.slice(5).split('').map(Number);
    assert.equal(new Set(idx).size, 4);
    return idx.map(i => squadra[i - 1].specie);
}

test('anteprima: i quattro dipendono dai sei avversari (contro il fuoco porta l\'acqua e non l\'erba; contro l\'acqua l\'erba)', async () => {
    const fuoco = await anteprimaContro(avversariAnteprima.fuoco);
    assert.ok(fuoco.includes('Gyarados') || fuoco.includes('Starmie'), `contro il fuoco: ${fuoco}`);
    assert.ok(!fuoco.includes('Venusaur'), `l'erba soffre il fuoco: ${fuoco}`);
    const acqua = await anteprimaContro(avversariAnteprima.acqua);
    assert.ok(acqua.includes('Venusaur') || acqua.includes('Ferrothorn'), `contro l'acqua: ${acqua}`);
    const tutti = [];
    for (const avv of Object.values(avversariAnteprima)) tutti.push((await anteprimaContro(avv)).slice().sort().join(','));
    assert.ok(new Set(tutti).size >= 3, `quattro avversari diversi, almeno tre scelte diverse: ${tutti.join(' | ')}`);
});

test('anteprima: senza vedere i sei avversari sceglie comunque quattro Pokémon (i più forti)', async () => {
    const { sim, ia } = await cervello();
    const r = creaRichiesta(sim.Dex, { squadra: miaSquadraAnteprima, attivi: [], livello: 100, extra: { richiesta: { teamPreview: true, maxChosenTeamSize: 4 } } });
    delete r.active;
    const s = scelta(ia, r, logMiaSquadra(miaSquadraAnteprima, [], 100));
    assert.match(s, /^team [1-6]{4}$/);
});

// ===================================================
// PARTITE VERE
// ===================================================
async function squadreDi(sim, regolamento) {
    const T = require('../docs/team-cpu.js');
    const fs = require('node:fs');
    const path = require('node:path');
    const leggi = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', p), 'utf8'));
    return T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento, caricaJson: async p => leggi(p), quanti: 6 });
}

const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
const FORMATI = [
    { nome: 'singolo Gen 9', reg: { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi } },
    { nome: 'doppio Gen 9 con Teracristal', reg: { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi } },
    { nome: 'VGC Gen 8', reg: { genRuleType: 'within', genRuleValue: '8', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen8', vgcFormat: 'doubles', restrizioni: permessi } },
    { nome: 'doppio Gen 6 con Mega', reg: { genRuleType: 'within', genRuleValue: '6', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: { pokemon: { ...permessi.pokemon, is_mega: { mode: 'SPECIFIC', value: true } } } } },
    { nome: 'doppio Gen 8 con Dynamax', reg: { genRuleType: 'within', genRuleValue: '8', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi } },
    { nome: 'singolo Gen 7 con Mega e Mosse Z', reg: { genRuleType: 'within', genRuleValue: '7', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi } },
    { nome: 'singolo Gen 4', reg: { genRuleType: 'within', genRuleValue: '4', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi } },
    { nome: 'singolo Gen 1', reg: { genRuleType: 'within', genRuleValue: '1', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi } },
    { nome: 'Little Cup', reg: { genRuleType: 'within', genRuleValue: '9', baseTier: 'LC', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi } }
];

// il formato che il sito dà al simulatore (docs/team-sito.js), calcolato qui senza importarlo
function formatoSito(reg) {
    const T = require('../docs/team-cpu.js');
    const c = T.contestoDa(reg);
    const regole = [];
    if (c.gen < 5) regole.push('Team Preview');
    regole.push('Picked Team Size = 4');
    if (c.gen >= 4) regole.push('HP Percentage Mod');
    if (c.struttura === 'custom') regole.push('Sleep Clause Mod', 'Endless Battle Clause');
    if (!c.meccaniche) { if (c.gen === 8) regole.push('Dynamax Clause'); if (c.gen === 9) regole.push('Terastal Clause'); }
    return `gen${c.gen}${c.doppio ? 'doubles' : ''}customgame@@@${regole.join(',')}`;
}

for (const f of FORMATI) {
    test(`partite vere (${f.nome}): la CPU gioca senza che il simulatore rifiuti nessuna scelta`, { timeout: 180000 }, async () => {
        const { sim } = await caricaSim();
        const r = await squadreDi(sim, f.reg);
        assert.ok(r.team.length >= 4, 'servono team per giocare');
        const formato = formatoSito(f.reg);
        for (let i = 0; i < 4; i++) {
            const t1 = r.team[i % r.team.length], t2 = r.team[(i + 2) % r.team.length];
            const cpu = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 1) });
            const contro = i % 2 === 0 ? { tipo: 'casuale' } : { tipo: 'cpu', cerebro: IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 50) }) };
            const e = await giocaPartita({ sim, formato, team1: t1.testo, team2: t2.testo, agente1: { tipo: 'cpu', cerebro: cpu }, agente2: contro, casuale: creaCasuale(i + 9), seme: [i + 1, 7, 11, 13] });
            assert.deepEqual(e.errori.map(x => `${x.lato} ${x.scelta} => ${x.messaggio}`), [], 'nessuna scelta rifiutata');
            assert.ok(!e.bloccata && !e.scaduta, `la partita deve finire (turni ${e.turni})`);
            assert.ok(e.vincitore === 'p1' || e.vincitore === 'p2' || e.vincitore === null);
        }
    });
}

// Anything Goose: due copie dello stesso Pokémon (stesso nome nel log) e strumenti uguali, e il simulatore non rifiuta nessuna scelta
for (const stile of ['singles', 'doubles']) {
    test(`partite vere (Anything Goose, ${stile}): team con Pokémon e strumenti doppi, la CPU gioca senza scelte rifiutate`, { timeout: 240000 }, async () => {
        const { sim } = await caricaSim();
        const reg = { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: stile, strutturaSito: 'anything_goes', restrizioni: {} };
        const T = require('../docs/team-cpu.js');
        const fs = require('node:fs');
        const path = require('node:path');
        const leggi = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', p), 'utf8'));
        const r = await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: reg, caricaJson: async p => leggi(p), quanti: 12, seme: 'goose-partite' });
        const conCopie = r.team.filter(t => t.specie.length !== new Set(t.specie).size);
        assert.ok(conCopie.length >= 1, 'serve almeno un team con una copia');
        const formato = formatoSito(reg);
        assert.ok(!/Sleep Clause/.test(formato), 'Anything Goose non ha clausole in battaglia');
        let giocate = 0;
        for (let i = 0; i < Math.min(2, conCopie.length); i++) {
            const t1 = conCopie[i], t2 = r.team[(r.team.indexOf(t1) + 3) % r.team.length];
            const cpu1 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 31) });
            const cpu2 = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 77) });
            const e = await giocaPartita({ sim, formato, team1: t1.testo, team2: t2.testo, agente1: { tipo: 'cpu', cerebro: cpu1 }, agente2: { tipo: 'cpu', cerebro: cpu2 }, casuale: creaCasuale(i + 5), seme: [i + 2, 9, 4, 6] });
            assert.deepEqual(e.errori.map(x => `${x.lato} ${x.scelta} => ${x.messaggio}`), [], 'nessuna scelta rifiutata');
            assert.ok(!e.bloccata && !e.scaduta, `la partita deve finire (turni ${e.turni})`);
            giocate++;
        }
        assert.ok(giocate >= 1);
    });
}

// Quante volte, in una partita, un lato ha fatto una meccanica (righe del log): "-start|p1a: ...|Dynamax", "-zpower|p1a: ..."
function volte(righe, lato, regex) { return righe.filter(r => regex.test(r) && r.includes(`|${lato}`)).length; }
const DYNAMAX = /^\|-start\|p[12][ab]: [^|]*\|Dynamax/;

for (const stile of ['singles', 'doubles']) {
    test(`partite vere (Gen 8 ${stile}, Dynamax ammesso): la CPU lo usa e il simulatore non rifiuta nessuna scelta`, { timeout: 240000 }, async () => {
        const { sim } = await caricaSim();
        const reg = { genRuleType: 'within', genRuleValue: '8', baseTier: 'OU', battleStyle: stile, strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi };
        const r = await squadreDi(sim, reg);
        const formato = formatoSito(reg);
        assert.ok(!/Dynamax Clause/.test(formato), 'con le meccaniche accese il formato non vieta il Dynamax');
        let conDynamax = 0, giocate = 0;
        for (let i = 0; i < 6; i++) {
            const t1 = r.team[i % r.team.length], t2 = r.team[(i + 3) % r.team.length];
            const cpu1 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 11) });
            const cpu2 = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 61) });
            const e = await giocaPartita({ sim, formato, team1: t1.testo, team2: t2.testo, agente1: { tipo: 'cpu', cerebro: cpu1 }, agente2: { tipo: 'cpu', cerebro: cpu2 }, casuale: creaCasuale(i + 3), seme: [i + 4, 8, 15, 16] });
            assert.deepEqual(e.errori.map(x => `${x.lato} ${x.scelta} => ${x.messaggio}`), [], 'nessuna scelta rifiutata');
            assert.ok(!e.bloccata && !e.scaduta, `la partita deve finire (turni ${e.turni})`);
            giocate++;
            // un solo Dynamax per lato (il simulatore lo garantisce: la CPU non ci riprova)
            for (const lato of ['p1', 'p2']) assert.ok(volte(e.righe, lato, DYNAMAX) <= 1, `${lato}: un solo Dynamax per partita`);
            if (volte(e.righe, 'p1', DYNAMAX) + volte(e.righe, 'p2', DYNAMAX) > 0) conDynamax++;
        }
        assert.ok(conDynamax >= Math.ceil(giocate * 0.6), `la CPU deve usare il Dynamax: ${conDynamax}/${giocate} partite`);
    });
}

test('partite vere (Gen 8, Dynamax Clause): il formato lo vieta, la CPU lo legge dal log e non ci prova', { timeout: 240000 }, async () => {
    const { sim } = await caricaSim();
    const reg = { genRuleType: 'within', genRuleValue: '8', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: false, restrizioni: permessi };
    const r = await squadreDi(sim, reg);
    const formato = formatoSito(reg);
    assert.match(formato, /Dynamax Clause/);
    for (let i = 0; i < 3; i++) {
        const cpu1 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 1) });
        const cpu2 = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 2) });
        const e = await giocaPartita({ sim, formato, team1: r.team[i % r.team.length].testo, team2: r.team[(i + 3) % r.team.length].testo, agente1: { tipo: 'cpu', cerebro: cpu1 }, agente2: { tipo: 'cpu', cerebro: cpu2 }, casuale: creaCasuale(i + 9), seme: [i + 1, 2, 3, 5] });
        assert.deepEqual(e.errori, []);
        assert.equal(e.righe.filter(x => DYNAMAX.test(x)).length, 0, 'nessun Dynamax');
        assert.ok(e.righe.some(x => /^\|rule\|Dynamax Clause/.test(x)), 'il simulatore scrive la clausola');
        assert.equal(cpu1.ammette('dynamax'), false, 'la CPU ha letto la clausola');
    }
});

test('partite vere (Gen 7, Mosse Z e Mega): la CPU le usa e il simulatore non rifiuta nessuna scelta', { timeout: 240000 }, async () => {
    const { sim } = await caricaSim();
    for (const stile of ['singles', 'doubles']) {
        const reg = { genRuleType: 'within', genRuleValue: '7', baseTier: 'OU', battleStyle: stile, strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi };
        const r = await squadreDi(sim, reg);
        const formato = formatoSito(reg);
        let conZ = 0, giocate = 0;
        for (let i = 0; i < 10; i++) {
            const t1 = r.team[i % r.team.length], t2 = r.team[(i + 5) % r.team.length];
            const cpu1 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 21) });
            const cpu2 = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 71) });
            const e = await giocaPartita({ sim, formato, team1: t1.testo, team2: t2.testo, agente1: { tipo: 'cpu', cerebro: cpu1 }, agente2: { tipo: 'cpu', cerebro: cpu2 }, casuale: creaCasuale(i + 5), seme: [i + 2, 4, 6, 8] });
            assert.deepEqual(e.errori.map(x => `${x.lato} ${x.scelta} => ${x.messaggio}`), [], `${stile}: nessuna scelta rifiutata`);
            assert.ok(!e.bloccata && !e.scaduta);
            giocate++;
            for (const lato of ['p1', 'p2']) assert.ok(volte(e.righe, lato, /^\|-zpower\|/) <= 1, 'una sola Mossa Z per lato');
            if (e.righe.some(x => /^\|-zpower\|/.test(x))) conZ++;
        }
        assert.ok(conZ >= 2, `${stile}: la CPU deve usare la Mossa Z (${conZ}/${giocate} partite)`);
    }
});

test('partite vere: la CPU batte il bot casuale la gran parte delle volte (singolo e doppio)', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    for (const f of [FORMATI[0], FORMATI[1]]) {
        const r = await squadreDi(sim, f.reg);
        const formato = formatoSito(f.reg);
        let vinte = 0;
        const N = 16;
        for (let i = 0; i < N; i++) {
            const t1 = r.team[i % r.team.length], t2 = r.team[(i * 5 + 3) % r.team.length];
            const cpu = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 7) });
            const e = await giocaPartita({ sim, formato, team1: t1.testo, team2: t2.testo, agente1: { tipo: 'cpu', cerebro: cpu }, agente2: { tipo: 'casuale' }, casuale: creaCasuale(100 + i), seme: [i + 3, 5, 8, 21] });
            if (e.vincitore === 'p1') vinte++;
        }
        // partite con semi fissi: il risultato è sempre lo stesso; la soglia lascia margine ai cambi di valutazione
        assert.ok(vinte >= Math.ceil(N * 0.7), `${f.nome}: ${vinte}/${N}`);
    }
});
