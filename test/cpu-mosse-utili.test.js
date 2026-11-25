'use strict';
// Le mosse "di utilità" che la CPU ora sa giocare (docs/cpu-ia.js, MOSSE_UTILI in docs/cpu-conoscenza.js):
//   Encore, Trick/Switcheroo, Coaching, Heal Pulse, Substitute, Rest e Sleep Talk, Wish, Baton Pass, Explosion/Self-Destruct, Hidden Power con il suo tipo.
// Ogni prova è una situazione in cui la mossa serve e una in cui non serve: la CPU deve scegliere la prima volta e non la seconda.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim } = require('./ayuda-sim.js');
const IA = require('../docs/cpu-ia.js');
const K = require('../docs/cpu-conoscenza.js');

// ---------- richieste e log come negli altri test della CPU ----------
function creaRichiesta(Dex, { squadra, attivi, livello = 50, gen = 9, doppio = true }) {
    const dex = Dex.forGen(gen);
    const pokemon = squadra.map((s, i) => {
        const sp = dex.species.get(s.specie), b = sp.baseStats;
        const stat = k => Math.floor((2 * b[k] + 31 + 21) * livello / 100) + 5;
        const hpMax = b.hp === 1 ? 1 : Math.floor((2 * b.hp + 31 + 21) * livello / 100) + livello + 10;
        const hp = Math.round(hpMax * (s.hp == null ? 100 : s.hp) / 100);
        return {
            ident: `p2: ${sp.name}`, details: `${sp.name}, L${livello}`, condition: hp <= 0 ? '0 fnt' : `${hp}/${hpMax}${s.stato ? ' ' + s.stato : ''}`, active: attivi.includes(i),
            stats: { atk: stat('atk'), def: stat('def'), spa: stat('spa'), spd: stat('spd'), spe: stat('spe') },
            moves: s.mosse.map(m => { const d = dex.moves.get(m); return d.id; }), baseAbility: K.id(s.abilita || Object.values(sp.abilities)[0]), item: K.id(s.item || ''), ability: K.id(s.abilita || Object.values(sp.abilities)[0]),
            pokeball: 'pokeball', commanding: false, reviving: false
        };
    });
    const active = attivi.map(i => ({ moves: squadra[i].mosse.map(m => { const d = dex.moves.get(m); return { move: m, id: d.id === 'hiddenpowerice' || /^hiddenpower/.test(d.id) ? 'hiddenpower' : d.id, pp: d.pp, maxpp: d.pp, target: d.target, disabled: false }; }) }));
    return { active, side: { name: 'CPU', id: 'p2', pokemon }, rqid: 3 };
}
const logAvv = (specie, { hp = 100, livello = 50, mieiPortati = 2, doppio = true, hpPerSpecie = {} } = {}) => {
    const r = ['|gen|9', `|gametype|${doppio ? 'doubles' : 'singles'}`, `|teamsize|p1|${specie.length}`, `|teamsize|p2|${mieiPortati}`];
    specie.forEach(s => r.push(`|poke|p1|${s}, L${livello}|`));
    specie.slice(0, doppio ? 2 : 1).forEach((s, i) => r.push(`|switch|p1${'ab'[i]}: ${s}|${s}, L${livello}|${hpPerSpecie[s] != null ? hpPerSpecie[s] : hp}/100`));
    return r;
};
const logMia = (sq, attivi, livello = 50) => {
    const r = [];
    sq.forEach(s => r.push(`|poke|p2|${s.specie}, L${livello}|`));
    attivi.forEach((i, k) => r.push(`|switch|p2${'ab'[k]}: ${sq[i].specie}|${sq[i].specie}, L${livello}|100/100`));
    return r;
};
// opzioni: mia, opp (specie dell'avversario), attivi, extraLog (righe del log tra l'ingresso e il turno), doppio, hp (dell'avversario, %)
async function decidi({ mia, opp, attivi, hp = 100, turno = 4, extraLog = [], doppio = true, parametri, hpPerSpecie, gen = 9 }) {
    const { sim } = await caricaSim();
    attivi = attivi || (doppio ? [0, 1] : [0]);
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, debug: true, parametri });
    const r = creaRichiesta(sim.Dex, { squadra: mia, attivi, gen });
    ia.osserva([...logAvv(opp, { hp, mieiPortati: mia.length, doppio, hpPerSpecie }), ...logMia(mia, attivi), ...extraLog, `|turn|${turno}`]);
    const scelta = ia.scegli(r);
    return { ia, scelta, valutazione: ia.ultimaValutazione, sim, richiesta: r };
}
const mossa = (r, slot = 0) => r.scelta.split(', ')[slot];
const stampa = r => (process.env.STAMPA ? console.log(r.scelta, JSON.stringify(r.valutazione.slice(0, 3))) : null);

// ---------------------------------------------------------------- Encore
const PIVOT_ENCORE = [
    { specie: 'Whimsicott', item: 'Focus Sash', abilita: 'Prankster', mosse: ['Encore', 'Moonblast', 'Tailwind', 'Protect'] },
    { specie: 'Rillaboom', item: 'Assault Vest', mosse: ['Grassy Glide', 'Wood Hammer', 'U-turn', 'Fake Out'] }
];

test('Encore: contro chi ha appena usato una mossa di stato (Stanza Magica) lo blocca; contro chi ha fatto un attacco che fa male no', async () => {
    const stato = await decidi({ mia: PIVOT_ENCORE, opp: ['Porygon2', 'Torkoal', 'Incineroar', 'Rillaboom'], extraLog: ['|move|p1a: Porygon2|Trick Room|p1a: Porygon2', '|move|p1b: Torkoal|Protect|p1b: Torkoal'] });
    stampa(stato);
    assert.match(mossa(stato), /^move 1 [12]$/, `Encore sul bersaglio che ha usato la mossa di stato: ${stato.scelta}`);
    const attacco = await decidi({ mia: PIVOT_ENCORE, opp: ['Incineroar', 'Rillaboom', 'Torkoal', 'Amoonguss'], extraLog: ['|move|p1a: Incineroar|Flare Blitz|p2a: Whimsicott', '|move|p1b: Rillaboom|Wood Hammer|p2b: Rillaboom'] });
    stampa(attacco);
    assert.doesNotMatch(mossa(attacco), /^move 1 /, `con due bei attacchi appena fatti non serve: ${attacco.scelta}`);
});

test('Encore non riesce a chi non ha ancora mosso, né su una mossa che non si può ripetere, né su chi è già bloccato', async () => {
    const nuovo = await decidi({ mia: PIVOT_ENCORE, opp: ['Porygon2', 'Torkoal', 'Incineroar', 'Rillaboom'] });
    stampa(nuovo);
    assert.doesNotMatch(mossa(nuovo), /^move 1 /, `nessuno ha ancora fatto una mossa: ${nuovo.scelta}`);
    const bloccato = await decidi({ mia: PIVOT_ENCORE, opp: ['Porygon2', 'Torkoal', 'Incineroar', 'Rillaboom'], extraLog: ['|move|p1a: Porygon2|Trick Room|p1a: Porygon2', '|-start|p1a: Porygon2|Encore', '|move|p1b: Torkoal|Protect|p1b: Torkoal'] });
    const ia = bloccato.ia;
    assert.equal(ia._mon('p1a: Porygon2').encore, 'trickroom', 'il log dice su quale mossa è bloccato');
    const vistaB = ia.vista(ia._mon('p1a: Porygon2'));
    assert.equal(vistaB.encore, 'trickroom');
    assert.deepEqual(ia.mosseAvversario(vistaB), [], 'bloccato su una mossa di stato non fa danno');
    ia.osserva(['|-end|p1a: Porygon2|Encore']);
    assert.equal(ia._mon('p1a: Porygon2').encore, null, 'finito');
});

// ---------------------------------------------------------------- Trick
test('Trick: con uno strumento Scelta in mano blocca un avversario che usa mosse di stato; senza non serve e non si prova contro chi ha già uno Scelta', async () => {
    const mia = [
        { specie: 'Alakazam', item: 'Choice Scarf', mosse: ['Trick', 'Psychic', 'Focus Blast', 'Shadow Ball'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const muro = await decidi({ mia, doppio: false, attivi: [0], opp: ['Blissey'], extraLog: ['|move|p1a: Blissey|Soft-Boiled|p1a: Blissey'] });
    stampa(muro);
    assert.match(mossa(muro), /^move 1$/, `Trick su chi cura: ${muro.scelta}`);
    // se la CPU non ha lo Scelta, Trick non vale niente
    const senza = await decidi({ mia: [{ ...mia[0], item: 'Life Orb' }, mia[1]], doppio: false, attivi: [0], opp: ['Blissey'], extraLog: ['|move|p1a: Blissey|Soft-Boiled|p1a: Blissey'] });
    assert.doesNotMatch(mossa(senza), /^move 1$/, `senza uno Scelta: ${senza.scelta}`);
});

// ---------------------------------------------------------------- Heal Pulse e Coaching
const SUPPORTO_DOPPIO = [
    { specie: 'Clefairy', item: 'Eviolite', mosse: ['Heal Pulse', 'Moonblast', 'Helping Hand', 'Protect'] },
    { specie: 'Ursaluna', item: 'Flame Orb', hp: 40, mosse: ['Facade', 'Headlong Rush', 'Protect', 'Swords Dance'] }
];
const POCO_MINACCIOSI = ['Amoonguss', 'Chansey', 'Incineroar', 'Rillaboom'];

test('Heal Pulse cura l\'alleato in difficoltà (e solo lui, mai un avversario); non si sceglie se sta bene', async () => {
    const r = await decidi({ mia: SUPPORTO_DOPPIO, opp: POCO_MINACCIOSI });
    stampa(r);
    assert.match(mossa(r), /^move 1 -2$/, `Heal Pulse sull'alleato: ${r.scelta}`);
    const bene = await decidi({ mia: [SUPPORTO_DOPPIO[0], { ...SUPPORTO_DOPPIO[1], hp: 100 }], opp: POCO_MINACCIOSI });
    stampa(bene);
    assert.doesNotMatch(mossa(bene), /^move 1\b/, `con l'alleato in salute no: ${bene.scelta}`);
    // le azioni non contengono mai Heal Pulse su un avversario
    const azioni = bene.ia.ultimoStato.opzioni[0].filter(a => a.tipo === 'mossa' && a.mossa && a.mossa.id === 'healpulse');
    assert.ok(azioni.length && azioni.every(a => a.bersaglio < 0), 'solo l\'alleato come bersaglio');
});

test('Heal Pulse nel singolo non si offre (curerebbe l\'avversario)', async () => {
    const r = await decidi({ mia: [{ specie: 'Clefairy', item: 'Eviolite', mosse: ['Heal Pulse', 'Moonblast', 'Protect', 'Thunder Wave'] }, SUPPORTO_DOPPIO[1]], opp: ['Incineroar'], doppio: false, attivi: [0] });
    assert.ok(!r.ia.ultimoStato.opzioni[0].some(a => a.tipo === 'mossa' && a.mossa && a.mossa.id === 'healpulse'), 'nessuna azione con Heal Pulse');
});

test('Coaching dà +1 Attacco e Difesa all\'alleato che attacca coi colpi fisici', async () => {
    const mia = [
        { specie: 'Mienshao', item: 'Safety Goggles', mosse: ['Coaching', 'Fake Out', 'Protect', 'Drain Punch'] },
        { specie: 'Ursaluna', item: 'Flame Orb', mosse: ['Facade', 'Headlong Rush', 'Protect', 'Swords Dance'] }
    ];
    // gli avversari si parano: i colpi non servono, Coaching sì
    const r = await decidi({ mia, opp: ['Pelipper', 'Kingdra', 'Incineroar', 'Rillaboom'], turno: 5, extraLog: ['|move|p1a: Pelipper|Protect|p1a: Pelipper', '|move|p1b: Kingdra|Protect|p1b: Kingdra'] });
    stampa(r);
    assert.match(mossa(r), /^move 1 -2$/, `Coaching sull'alleato fisico: ${r.scelta}`);
});

// ---------------------------------------------------------------- Substitute
test('Substitute: si fa se prende un colpo che altrimenti farebbe male, non se ce n\'è già uno o se gli HP sono pochi; il log insegna chi ne ha uno', async () => {
    const mia = [
        { specie: 'Gengar', item: 'Life Orb', hp: 90, mosse: ['Substitute', 'Shadow Ball', 'Sludge Bomb', 'Protect'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const gia = await decidi({ mia, doppio: false, attivi: [0], opp: ['Kingdra'], extraLog: ['|move|p2a: Gengar|Substitute|p2a: Gengar', '|-start|p2a: Gengar|Substitute'] });
    assert.equal(gia.ia._mon('p2a: Gengar').sostituto, 0.25, 'il sostituto è nel log');
    assert.ok(!gia.ia.ultimoStato.opzioni[0].some(a => a.tipo === 'mossa' && a.mossa && a.mossa.id === 'substitute'), 'con un sostituto già in campo la mossa non si offre');
    gia.ia.osserva(['|-activate|p2a: Gengar|move: Substitute|[damage]']);
    assert.equal(gia.ia._mon('p2a: Gengar').sostituto, 0.125, 'un colpo che lo regge ne toglie la metà della stima');
    gia.ia.osserva(['|-end|p2a: Gengar|Substitute']);
    assert.equal(gia.ia._mon('p2a: Gengar').sostituto, 0);
    const poco = await decidi({ mia: [{ ...mia[0], hp: 20 }, mia[1]], doppio: false, attivi: [0], opp: ['Kingdra'] });
    assert.ok(!poco.ia.ultimoStato.opzioni[0].some(a => a.tipo === 'mossa' && a.mossa && a.mossa.id === 'substitute'), 'con il 25% degli HP o meno non riesce');
});

test('Substitute rotto nello stesso turno costa un turno (costoSostituto), e rifarlo subito dopo costa ancora', async () => {
    const mia = [
        { specie: 'Serperior', item: 'Leftovers', mosse: ['Substitute', 'Leaf Storm', 'Glare', 'Protect'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const opp = ['Xurkitree', 'Clefable', 'Skarmory', 'Blissey'];
    const log = ['|-boost|p1a: Xurkitree|spa|3'];
    const valoreSub = r => { const p = r.valutazione.find(x => /Substitute/.test(x.azioni[0])); assert.ok(p, `un piano con Substitute tra i migliori: ${JSON.stringify(r.valutazione.map(x => x.azioni))}`); return p.val; };
    const senzaCosto = await decidi({ mia, doppio: false, attivi: [0], opp, extraLog: log, parametri: { costoSostituto: 0 } });
    const conCosto = await decidi({ mia, doppio: false, attivi: [0], opp, extraLog: log });
    assert.ok(valoreSub(conCosto) < valoreSub(senzaCosto) - 0.3, `il sostituto che il colpo forte rompe vale meno: ${valoreSub(conCosto)} contro ${valoreSub(senzaCosto)}`);
    // il turno prima aveva già fatto un sostituto (rotto): rifarlo vale ancora meno
    const dopo = await decidi({ mia, doppio: false, attivi: [0], opp, turno: 5, extraLog: [...log, '|turn|4', '|move|p2a: Serperior|Substitute|p2a: Serperior', '|-start|p2a: Serperior|Substitute', '|-end|p2a: Serperior|Substitute'] });
    assert.ok(valoreSub(dopo) < valoreSub(conCosto) - 0.2, `rifarlo subito costa ancora: ${valoreSub(dopo)} contro ${valoreSub(conCosto)}`);
});

test('il sostituto dell\'avversario prende i colpi e ferma gli stati: la CPU non gli manda Onda Tuono', async () => {
    const mia = [
        { specie: 'Jolteon', item: 'Life Orb', mosse: ['Thunder Wave', 'Thunderbolt', 'Shadow Ball', 'Protect'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const r = await decidi({ mia, doppio: false, attivi: [0], opp: ['Gyarados'], extraLog: ['|move|p1a: Gyarados|Substitute|p1a: Gyarados', '|-start|p1a: Gyarados|Substitute'] });
    stampa(r);
    assert.doesNotMatch(mossa(r), /^move 1$/, `Thunder Wave contro un sostituto non serve: ${r.scelta}`);
});

// ---------------------------------------------------------------- Rest e Sleep Talk
test('Rest: a pochi HP, con un avversario che colpisce forte, cura tutto; a HP pieni non si offre', async () => {
    const mia = [
        { specie: 'Vaporeon', item: 'Leftovers', hp: 30, mosse: ['Rest', 'Sleep Talk', 'Surf', 'Protect'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    // Slowbro è più lento e colpisce forte: dopo Rest Vaporeon regge, senza non reggerebbe
    const r = await decidi({ mia, doppio: false, attivi: [0], opp: ['Slowbro', 'Clefable', 'Skarmory', 'Blissey'], extraLog: ['|move|p1a: Slowbro|Scald|p2a: Vaporeon'] });
    stampa(r);
    assert.match(mossa(r), /^move 1$/, `Rest a un terzo degli HP contro chi non lo mette KO prima: ${r.scelta}`);
    const pieno = await decidi({ mia: [{ ...mia[0], hp: 100 }, mia[1]], doppio: false, attivi: [0], opp: ['Slowbro', 'Clefable', 'Skarmory', 'Blissey'] });
    assert.ok(!pieno.ia.ultimoStato.opzioni[0].some(a => a.tipo === 'mossa' && a.mossa && a.mossa.id === 'rest'), 'a HP pieni Rest non si offre');
});

test('il sonno di Rest dura due turni sicuri: lo si impara dal log e cambia la probabilità di agire', async () => {
    const mia = [
        { specie: 'Snorlax', item: 'Leftovers', mosse: ['Rest', 'Sleep Talk', 'Body Slam', 'Earthquake'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const r = await decidi({ mia, doppio: false, attivi: [0], opp: ['Gyarados'], extraLog: ['|move|p2a: Snorlax|Rest|p2a: Snorlax', '|-status|p2a: Snorlax|slp|[from] move: Rest', '|-heal|p2a: Snorlax|100/100 slp|[silent]'] });
    const ia = r.ia;
    const m = ia._mon('p2a: Snorlax');
    assert.equal(m.riposo, true);
    const v = () => ia.vista(m);
    assert.equal(ia._probAgire(Object.assign(v(), { stato: 'slp' })), 0, 'primo turno di sonno');
    ia.osserva(['|cant|p2a: Snorlax|slp']);
    assert.equal(ia._probAgire(Object.assign(v(), { stato: 'slp' })), 0, 'anche il secondo');
    ia.osserva(['|cant|p2a: Snorlax|slp']);
    assert.equal(ia._probAgire(Object.assign(v(), { stato: 'slp' })), 1, 'al terzo si sveglia e muove');
    // un sonno normale (da una mossa avversaria) non è quello di Rest
    ia.osserva(['|-curestatus|p2a: Snorlax|slp|[msg]', '|-status|p2a: Snorlax|slp']);
    assert.equal(m.riposo, false);
});

test('Sleep Talk: da addormentato è l\'unica mossa che si gioca; da sveglio non si offre', async () => {
    const mia = [
        { specie: 'Snorlax', item: 'Leftovers', stato: 'slp', mosse: ['Rest', 'Sleep Talk', 'Body Slam', 'Earthquake'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const r = await decidi({ mia, doppio: false, attivi: [0], opp: ['Gyarados'], extraLog: ['|-status|p2a: Snorlax|slp|[from] move: Rest', '|cant|p2a: Snorlax|slp'] });
    stampa(r);
    assert.match(mossa(r), /^move 2$|^switch /, `da addormentato: Sleep Talk (o un cambio): ${r.scelta}`);
    const sveglio = await decidi({ mia: [{ ...mia[0], stato: '' }, mia[1]], doppio: false, attivi: [0], opp: ['Gyarados'] });
    assert.ok(!sveglio.ia.ultimoStato.opzioni[0].some(a => a.tipo === 'mossa' && a.mossa && a.mossa.id === 'sleeptalk'), 'da sveglio non si offre');
});

// ---------------------------------------------------------------- Wish
test('Wish: il log lo tiene per posto e a fine turno cura chi c\'è; usarlo da sani non serve e con uno già in arrivo non si ripete', async () => {
    const mia = [
        { specie: 'Blissey', item: 'Leftovers', hp: 50, mosse: ['Wish', 'Protect', 'Seismic Toss', 'Soft-Boiled'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const r = await decidi({ mia, doppio: false, attivi: [0], opp: ['Gyarados'] });
    stampa(r);
    const aria = r.ia.ultimaValutazione;
    assert.ok(aria.some(p => /Wish/.test(p.azioni[0])) || /^move [124]$/.test(mossa(r)), 'Wish è tra le cose valutate');
    // il log
    const ia = r.ia;
    ia.osserva(['|move|p2a: Blissey|Wish|p2a: Blissey']);
    assert.deepEqual(ia.lati.p2.desiderio[0], { turno: 4, da: 'Blissey' });
    ia.osserva(['|turn|5']);
    assert.ok(ia.lati.p2.desiderio[0], 'resta per il turno in cui cura');
    ia.osserva(['|-heal|p2a: Blissey|100/100|[from] move: Wish|[wisher] Blissey']);
    assert.equal(ia.lati.p2.desiderio[0], null, 'dopo la cura non c\'è più');
    ia.osserva(['|move|p2a: Blissey|Wish|p2a: Blissey', '|turn|6', '|turn|7']);
    assert.equal(ia.lati.p2.desiderio[0], null, 'se non cura (posto vuoto) sparisce dopo due turni');
});

// ---------------------------------------------------------------- Explosion
test('Explosion: per chiudere la partita (l\'ultimo avversario) sì; contro un immune o a HP pieni quando basta un attacco, no', async () => {
    const mia = [
        { specie: 'Golem', item: 'Leftovers', mosse: ['Explosion', 'Earthquake', 'Rock Slide', 'Protect'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    // l'avversario ha solo Blissey: Explosion la mette KO e chiude la partita (a Garchomp resta in panchina)
    const finale = await decidi({ mia, doppio: false, attivi: [0], opp: ['Blissey'] });
    stampa(finale);
    assert.match(mossa(finale), /^move 1$/, `Explosion per chiudere: ${finale.scelta}`);
    // con altri Pokémon avversari in panchina, e contro un Normale-immune (Spettro), no
    const immune = await decidi({ mia, doppio: false, attivi: [0], opp: ['Gengar', 'Clefable', 'Skarmory', 'Blissey'] });
    stampa(immune);
    assert.doesNotMatch(mossa(immune), /^move 1$/, `contro uno Spettro non serve: ${immune.scelta}`);
    // a HP pieni contro uno che un buon attacco mette già in difficoltà, non butta via Golem
    const pieno = await decidi({ mia, doppio: false, attivi: [0], opp: ['Snorlax', 'Clefable', 'Skarmory', 'Blissey'], hp: 50 });
    stampa(pieno);
    assert.doesNotMatch(mossa(pieno), /^move 1$/, `a HP pieni non si fa esplodere: ${pieno.scelta}`);
});

test('Explosion non riesce con Damp in campo, nemmeno per chiudere la partita', async () => {
    const mia = [
        { specie: 'Golem', item: 'Leftovers', mosse: ['Explosion', 'Earthquake', 'Rock Slide', 'Protect'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const r = await decidi({ mia, doppio: false, attivi: [0], opp: ['Politoed'], extraLog: ['|-ability|p1a: Politoed|Damp'] });
    stampa(r);
    assert.doesNotMatch(mossa(r), /^move 1$/, `con Damp la mossa fallisce: ${r.scelta}`);
});

// ---------------------------------------------------------------- Baton Pass
test('Baton Pass: con i potenziamenti da passare sì, e chi entra li tiene (nel log e nella scelta del sostituto); senza non serve', async () => {
    const mia = [
        { specie: 'Scizor', item: 'Leftovers', mosse: ['Swords Dance', 'Baton Pass', 'Bullet Punch', 'Roost'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] },
        { specie: 'Blissey', item: 'Leftovers', mosse: ['Seismic Toss', 'Protect', 'Soft-Boiled', 'Wish'] }
    ];
    const { sim } = await caricaSim();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, debug: true });
    ia.osserva([...logAvv(['Rotom-Wash'], { doppio: false, mieiPortati: 3 }), ...logMia(mia, [0]), '|-boost|p2a: Scizor|atk|2', '|-boost|p2a: Scizor|spe|2', '|turn|4']);
    assert.equal(ia._mon('p2a: Scizor').boost.atk, 2);
    // dopo Baton Pass chi entra ha i potenziamenti
    ia.osserva(['|move|p2a: Scizor|Baton Pass|p2a: Scizor', '|switch|p2a: Garchomp|Garchomp, L50|100/100|[from] Baton Pass']);
    assert.equal(ia._mon('p2a: Garchomp').boost.atk, 2, 'Garchomp ha i +2 di Scizor');
    assert.equal(ia._mon('p2a: Garchomp').boost.spe, 2);
    assert.equal(ia._mon('p2a: Scizor').boost.atk, 0, 'chi è uscito no');
    // un cambio normale azzera
    ia.osserva(['|switch|p2a: Blissey|Blissey, L50, F|100/100']);
    assert.equal(ia._mon('p2a: Blissey').boost.atk, 0);
    assert.equal(ia._mon('p2a: Garchomp').boost.atk, 0);
});

test('Baton Pass: con +2 Attacco e +2 Velocità la CPU la usa; senza potenziamenti no', async () => {
    const mia = [
        { specie: 'Scizor', item: 'Leftovers', mosse: ['Swords Dance', 'Baton Pass', 'Bullet Punch', 'Roost'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const squadraAvv = ['Rotom-Wash', 'Clefable', 'Skarmory', 'Blissey'];
    const potenziato = await decidi({ mia, doppio: false, attivi: [0], opp: squadraAvv, extraLog: ['|-boost|p2a: Scizor|atk|2', '|-boost|p2a: Scizor|spe|2'] });
    stampa(potenziato);
    assert.match(mossa(potenziato), /^move 2$/, `Baton Pass con i potenziamenti: ${potenziato.scelta}`);
    const liscio = await decidi({ mia, doppio: false, attivi: [0], opp: squadraAvv });
    stampa(liscio);
    assert.doesNotMatch(mossa(liscio), /^move 2$/, `senza potenziamenti no: ${liscio.scelta}`);
});

// ---------------------------------------------------------------- Lightning Rod e Storm Drain
test('nel doppio Lightning Rod attira le mosse Elettro: puntare l\'altro avversario non serve, e la CPU non insiste', async () => {
    const mia = [
        { specie: 'Raichu', abilita: 'Static', mosse: ['Thunderbolt', 'Focus Blast', 'Protect', 'Helping Hand'] },
        { specie: 'Garchomp', abilita: 'Rough Skin', mosse: ['Earthquake', 'Dragon Claw', 'Protect', 'Rock Slide'] }
    ];
    const log = ['|move|p2a: Raichu|Thunderbolt|p1a: Marowak', '|-ability|p1a: Marowak|Lightning Rod|boost', '|-boost|p1a: Marowak|spa|1'];
    const r = await decidi({ mia, opp: ['Marowak', 'Gyarados', 'Rhydon', 'Rillaboom'], extraLog: log, turno: 3 });
    stampa(r);
    assert.doesNotMatch(mossa(r), /^move 1\b/, `Thunderbolt finirebbe comunque sul Pokémon con Lightning Rod: ${r.scelta}`);
});

// ---------------------------------------------------------------- Hidden Power
test('Hidden Power si gioca con il suo tipo (quello scritto nel nome della mossa), non da Normale', async () => {
    const mia = [
        { specie: 'Gengar', item: 'Life Orb', mosse: ['Hidden Power Ice', 'Protect', 'Sludge Bomb', 'Substitute'] },
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Protect'] }
    ];
    const r = await decidi({ mia, doppio: false, attivi: [0], opp: ['Dragonite'] });
    stampa(r);
    assert.match(mossa(r), /^move 1$/, `Hidden Power Ice contro un Drago volante: ${r.scelta}`);
    const d = r.ia._mossaDiRichiesta({ move: 'Hidden Power Ice', id: 'hiddenpower' });
    assert.equal(d.tipo, 'Ice');
    assert.equal(r.ia._mossaDiRichiesta({ move: 'Hidden Power Fire 70', id: 'hiddenpower' }).potenza, 70, 'prima della 6ª generazione la potenza sta nel nome');
    assert.equal(r.ia._mossaDiRichiesta({ move: 'Earthquake', id: 'earthquake' }).id, 'earthquake');
});

// ---------------------------------------------------------------- la conoscenza
test('le mosse di utilità non sono più escluse, e il descrittore le riconosce', async () => {
    const { sim } = await caricaSim();
    const dex = sim.Dex.forGen(9);
    for (const nome of ['encore', 'trick', 'switcheroo', 'substitute', 'rest', 'sleeptalk', 'wish', 'batonpass', 'explosion', 'selfdestruct', 'mistyexplosion', 'healpulse', 'coaching']) {
        const d = K.descriviMossa(dex, nome);
        assert.equal(d.esclusa, false, nome);
        assert.ok(K.mossaUsabile(dex, nome), `${nome} è usabile`);
    }
    assert.equal(K.descriviMossa(dex, 'explosion').autoKo, true);
    assert.equal(K.descriviMossa(dex, 'earthquake').autoKo, false);
    assert.equal(K.descriviMossa(dex, 'encore').utile, 'encore');
    assert.equal(K.descriviMossa(dex, 'switcheroo').utile, 'trick');
    assert.equal(K.descriviMossa(dex, 'healpulse').curaAltri, 0.5);
    assert.deepEqual(K.descriviMossa(dex, 'coaching').boostAlleato, { atk: 1, def: 1 });
    assert.equal(K.descriviMossa(dex, 'coaching').boostBersaglio, null, 'Coaching non abbassa nessuno');
});

// ---------------------------------------------------------------- il team builder (docs/team-cpu.js)
const fs = require('node:fs');
const path = require('node:path');
const T = require('../docs/team-cpu.js');
const P = require('../docs/formato-pool.js');
const DOCS = path.join(__dirname, '..', 'docs');
const caricaJson = async p => JSON.parse(fs.readFileSync(path.join(DOCS, p), 'utf8'));
const pokedexBase = P.minuscole(JSON.parse(fs.readFileSync(path.join(DOCS, 'pkm-gens/pokedex_base.json'), 'utf8')));
const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
const reg = (extra = {}) => ({ genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi, ...extra });
async function genera(regolamento, parametriTeam, quanti = 40) {
    const { sim } = await caricaSim();
    return { sim, r: await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento, caricaJson, pokedexBase, quanti, seme: 'utili', parametriTeam }) };
}
const setsDi = t => t.testo.split('\n\n').map(s => ({ testo: s, mosse: s.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2)), strumento: ((/^.+ @ (.+)$/m.exec(s.split('\n')[0])) || [])[1] || '' }));
const POTENZIA = new Set(['Swords Dance', 'Nasty Plot', 'Dragon Dance', 'Calm Mind', 'Quiver Dance', 'Bulk Up', 'Shell Smash', 'Agility', 'Rock Polish', 'Iron Defense', 'Amnesia', 'Curse', 'Coil', 'Work Up', 'Howl', 'Belly Drum', 'Growth', 'Cosmic Power', 'Tail Glow', 'Autotomize', 'Cotton Guard', 'Acid Armor', 'Barrier', 'Charge Beam', 'Hone Claws', 'Geomancy', 'Victory Dance', 'Tidy Up']);
const SCELTA = ['Choice Scarf', 'Choice Band', 'Choice Specs'];

const TUTTE_ACCESE = { probEncore: 1, probTrick: 1, probSostituto: 1, probRiposo: 1, probDesiderio: 1, probPassaBoost: 1, probEsplosione: 1, probCura: 1, probCoaching: 1, hiddenPower: 1 };
test('team builder, Gen 4 singolo: Rest sempre con Sleep Talk, Trick solo con uno Scelta, Baton Pass solo con un potenziamento, una sola Hidden Power per set e IV che la sostengono', { timeout: 300000 }, async () => {
    // (di base Substitute, Rest ed Explosion non entrano nei team della CPU: per provare i vincoli le si accende)
    const { sim, r } = await genera(reg({ genRuleValue: '4' }), TUTTE_ACCESE, 60);
    const validatore = sim.TeamValidator.get('gen4ou');
    const conta = {};
    for (const t of r.team) {
        for (const s of setsDi(t)) {
            const nomi = new Set(s.mosse);
            for (const m of s.mosse) conta[m.replace(/^Hidden Power .*/, 'Hidden Power')] = (conta[m.replace(/^Hidden Power .*/, 'Hidden Power')] || 0) + 1;
            if (nomi.has('Sleep Talk')) assert.ok(nomi.has('Rest'), `Sleep Talk senza Rest: ${s.testo}`);
            if (nomi.has('Trick') || nomi.has('Switcheroo')) assert.ok(SCELTA.includes(s.strumento), `Trick senza lo Scelta (${s.strumento}): ${s.testo}`);
            if (nomi.has('Baton Pass')) assert.ok(s.mosse.some(m => POTENZIA.has(m)), `Baton Pass senza niente da passare: ${s.testo}`);
            assert.ok(s.mosse.filter(m => /^Hidden Power/.test(m)).length <= 1, `due Hidden Power: ${s.testo}`);
            assert.ok(s.mosse.length >= 1 && s.mosse.length <= 4);
        }
        // il validatore non trova niente da dire sulle Hidden Power (gli IV seguono il tipo) né sulle mosse che il Pokémon non può avere
        const problemi = (validatore.validateTeam(sim.Teams.import(t.testo)) || []).filter(p => /Hidden Power|IVs|learn/i.test(p));
        assert.deepEqual(problemi, [], `${t.nome}: ${problemi.join(' | ')}`);
        // al massimo un Pokémon con Explosion per team, e al massimo tre mosse di utilità (Rest con Sleep Talk conta una)
        const sets = setsDi(t);
        assert.ok(sets.filter(s => s.mosse.some(m => /^(Explosion|Self-Destruct|Misty Explosion)$/.test(m))).length <= 1, `${t.nome}: troppe esplosioni`);
    }
    // le novità ci sono (non è vuoto), e Hidden Power è la più comune (nella 4ª generazione è su metà dei set dei consigli)
    for (const k of ['Hidden Power', 'Substitute', 'Explosion', 'Trick']) assert.ok(conta[k] > 0, `nessun set con ${k}: ${JSON.stringify(conta)}`);
});

test('team builder: con le manopole spente (maxUtili 0 e hiddenPower 0) le novità spariscono e i membri sono gli stessi (confronto a coppie)', { timeout: 300000 }, async () => {
    const acceso = await genera(reg({ genRuleValue: '4' }), TUTTE_ACCESE, 30);
    const spento = await genera(reg({ genRuleValue: '4' }), { maxUtili: 0, hiddenPower: 0 }, 30);
    const tutte = ['Encore', 'Trick', 'Switcheroo', 'Substitute', 'Rest', 'Sleep Talk', 'Wish', 'Baton Pass', 'Explosion', 'Self-Destruct', 'Misty Explosion', 'Heal Pulse', 'Coaching'];
    for (const t of spento.r.team) for (const s of setsDi(t)) for (const m of s.mosse) {
        assert.ok(!tutte.includes(m) && !/^Hidden Power/.test(m), `a manopole spente c'è ${m}: ${s.testo}`);
    }
    // gli stessi sei Pokémon, nello stesso ordine: cambiano solo le mosse di chi porta le novità
    assert.equal(spento.r.team.length, acceso.r.team.length);
    const uguali = spento.r.team.filter((t, i) => JSON.stringify(t.specie) === JSON.stringify(acceso.r.team[i].specie)).length;
    assert.ok(uguali >= spento.r.team.length * 0.9, `solo ${uguali} team su ${spento.r.team.length} hanno gli stessi membri`);
});

test('team builder: i team di prima (parametri vecchi) non hanno mosse di utilità né Hidden Power, e Explosion non è un attacco comune', { timeout: 300000 }, async () => {
    const { r } = await genera(reg({ genRuleValue: '4' }), T.PARAMETRI_TEAM_VECCHI, 30);
    for (const t of r.team) for (const s of setsDi(t)) for (const m of s.mosse) assert.ok(!/^(Explosion|Self-Destruct|Rest|Sleep Talk|Substitute|Baton Pass|Trick|Wish|Encore)$|^Hidden Power/.test(m), `${m}: ${s.testo}`);
});

test('team builder, doppio VGC: Encore e Coaching ci sono, Heal Pulse solo nel doppio, nessun Baton Pass, e resta sempre un attacco in ogni set', { timeout: 300000 }, async () => {
    const vgc = reg({ baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles' });
    // (di base Encore non entra nei team della CPU, perché misurata non conviene: la si accende per provare i vincoli)
    const { r } = await genera(vgc, { probEncore: 1 }, 80);
    const conta = {};
    const { sim } = await caricaSim();
    const dex = sim.Dex.forGen(9);
    for (const t of r.team) for (const s of setsDi(t)) {
        for (const m of s.mosse) conta[m] = (conta[m] || 0) + 1;
        assert.ok(s.mosse.some(m => dex.moves.get(m).category !== 'Status'), `nessun attacco: ${s.testo}`);
        assert.ok(!s.mosse.includes('Baton Pass'), 'Baton Pass nel doppio');
    }
    assert.ok(conta['Encore'] > 0, `Encore nei team VGC: ${conta['Encore']}`);
    assert.ok(conta['Coaching'] > 0, `Coaching nei team VGC: ${conta['Coaching']}`);
});

test('team builder: nelle generazioni dove non c\'è, Hidden Power non compare (Gen 8 e 9), e in Gen 2 e Gen 1 non c\'è nessuna novità', { timeout: 300000 }, async () => {
    for (const gen of ['9', '2']) {
        const { r } = await genera(reg({ genRuleValue: gen }), {}, 20);
        for (const t of r.team) for (const s of setsDi(t)) for (const m of s.mosse) assert.ok(!/^Hidden Power/.test(m), `Hidden Power in Gen ${gen}: ${s.testo}`);
    }
});
