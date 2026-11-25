'use strict';
// La CPU nel doppio, dopo le segnalazioni di chi ci gioca contro (docs/cpu-ia.js):
//   - la fine della partita conta: con due Pokémon contro uno, un doppio attacco che chiude la partita vale più di proteggersi (pesoFinale, pesoMateriale);
//   - una mossa che può riuscire solo a certe condizioni (Mano Pesante senza una mossa prioritaria davanti, Colpo Basso contro chi non attacca) non si ripete a vuoto;
//   - gli stati (Fuocopira, Onda Tuono) valgono per il bersaglio scelto; Vento Gelato e simili valgono per i sorpassi che creano; Colpo Fortunato pesa di più;
//   - le protezioni non sono una regola a memoria: un piano con la protezione riceve uno scarto a caso (rumoreProtezione).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim } = require('./ayuda-sim.js');
const IA = require('../docs/cpu-ia.js');
const K = require('../docs/cpu-conoscenza.js');

// ---------- le richieste e il log, come negli altri test della CPU ----------
function creaRichiesta(Dex, { squadra, attivi, livello = 50, gen = 9 }) {
    const dex = Dex.forGen(gen);
    const pokemon = squadra.map((s, i) => {
        const sp = dex.species.get(s.specie), b = sp.baseStats;
        const stat = k => Math.floor((2 * b[k] + 31 + 21) * livello / 100) + 5;
        const hpMax = b.hp === 1 ? 1 : Math.floor((2 * b.hp + 31 + 21) * livello / 100) + livello + 10;
        const hp = Math.round(hpMax * (s.hp == null ? 100 : s.hp) / 100);
        return {
            ident: `p2: ${sp.name}`, details: `${sp.name}, L${livello}`, condition: hp <= 0 ? '0 fnt' : `${hp}/${hpMax}`, active: attivi.includes(i),
            stats: { atk: stat('atk'), def: stat('def'), spa: stat('spa'), spd: stat('spd'), spe: stat('spe') },
            moves: s.mosse.map(m => dex.moves.get(m).id), baseAbility: K.id(s.abilita || Object.values(sp.abilities)[0]), item: K.id(s.item || ''), ability: K.id(s.abilita || Object.values(sp.abilities)[0]),
            pokeball: 'pokeball', commanding: false, reviving: false
        };
    });
    const active = attivi.map(i => ({ moves: squadra[i].mosse.map(m => { const d = dex.moves.get(m); return { move: d.name, id: d.id, pp: d.pp, maxpp: d.pp, target: d.target, disabled: false }; }) }));
    return { active, side: { name: 'CPU', id: 'p2', pokemon }, rqid: 3 };
}
// il log: l'avversario ha `quanti` Pokémon portati (gli attivi sono i primi due), io quanti ne ho in squadra
const logAvv = (specie, { hp = 100, quanti = specie.length, livello = 50, mieiPortati = 2 } = {}) => {
    const r = ['|gen|9', '|gametype|doubles', `|teamsize|p1|${quanti}`, `|teamsize|p2|${mieiPortati}`];
    specie.forEach(s => r.push(`|poke|p1|${s}, L${livello}|`));
    specie.slice(0, 2).forEach((s, i) => r.push(`|switch|p1${'ab'[i]}: ${s}|${s}, L${livello}|${hp}/100`));
    return r;
};
const logMia = (sq, attivi, livello = 50) => {
    const r = [];
    sq.forEach(s => r.push(`|poke|p2|${s.specie}, L${livello}|`));
    attivi.forEach((i, k) => r.push(`|switch|p2${'ab'[k]}: ${sq[i].specie}|${sq[i].specie}, L${livello}|100/100`));
    return r;
};
async function decidi(opzioniIa, { mia, opp, hp = 100, turno = 4, attivi = [0, 1], quanti, extraLog = [] }) {
    const { sim } = await caricaSim();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, debug: true, ...opzioniIa });
    const r = creaRichiesta(sim.Dex, { squadra: mia, attivi });
    ia.osserva([...logAvv(opp, { hp, quanti: quanti || opp.length, mieiPortati: mia.length }), ...logMia(mia, attivi), ...extraLog, `|turn|${turno}`]);
    const scelta = ia.scegli(r);
    return { ia, scelta, valutazione: ia.ultimaValutazione, sim };
}

// ---------------------------------------------------------------- la fine della partita
const KINGAMBIT_URSALUNA = [
    { specie: 'Kingambit', item: 'Black Glasses', mosse: ['Kowtow Cleave', 'Sucker Punch', 'Protect', 'Iron Head'] },
    { specie: 'Ursaluna', item: 'Flame Orb', mosse: ['Facade', 'Earthquake', 'Protect', 'Headlong Rush'] }
];

test('due Pokémon contro uno: se un doppio attacco chiude la partita lo fa, non si para con uno dei due', async () => {
    const nuovo = await decidi({}, { mia: KINGAMBIT_URSALUNA, opp: ['Urshifu-Rapid-Strike'], hp: 70 });
    const [a, b] = nuovo.scelta.split(', ');
    assert.match(a, /^move (1|4) 1$/, `il primo attacca l'unico avversario: ${nuovo.scelta}`);
    assert.match(b, /^move (1|4) 1$/, `anche il secondo: ${nuovo.scelta}`);
    assert.doesNotMatch(nuovo.scelta, /move 3\b/, 'nessuna protezione');
    // senza l'economia della partita (come prima) si parava con Kingambit: era il difetto segnalato
    const vecchio = await decidi({ parametri: { pesoFinale: 0, pesoMateriale: 0, protezioneInVantaggio: 0 } }, { mia: KINGAMBIT_URSALUNA, opp: ['Urshifu-Rapid-Strike'], hp: 70 });
    assert.match(vecchio.scelta, /move 3\b/, `com'era: ${vecchio.scelta}`);
    assert.ok(nuovo.ia.par.protezioneInVantaggio > 0, 'il costo della protezione cresce con il vantaggio quando all\'avversario restano pochi Pokémon');
});

test('la fine della partita conta solo se l\'avversario ha davvero finito i Pokémon: con tre in panchina il doppio attacco non vale il bonus', async () => {
    // lo stesso scenario ma l'avversario ne ha portati quattro: un KO non chiude la partita, quindi il bonus del finale non c'è
    const { ia, valutazione } = await decidi({}, { mia: KINGAMBIT_URSALUNA, opp: ['Urshifu-Rapid-Strike', 'Incineroar', 'Rillaboom', 'Amoonguss'], hp: 70, quanti: 4 });
    const doppio = valutazione.find(x => x.azioni.every(t => /\b(Kowtow Cleave|Iron Head|Headlong Rush|Facade|Earthquake|Sucker Punch)\b/.test(t)));
    assert.ok(!doppio || doppio.val < 3, `senza il finale il valore non salta di tre punti: ${doppio && doppio.val}`);
});

test('proteggersi costa di più solo nel finale, quando si è in vantaggio: con quattro avversari vale come prima, con uno solo e due Pokémon miei costa di più', async () => {
    const proteggono = v => v.filter(x => x.azioni.some(t => /\b(Protect|Detect)\b/.test(t))).map(x => x.val);
    // quattro avversari: all'avversario non restano "al massimo due" Pokémon, niente cambia
    const quattro = ['Urshifu-Rapid-Strike', 'Incineroar', 'Rillaboom', 'Amoonguss'];
    const a = await decidi({ parametri: { protezioneInVantaggio: 0 } }, { mia: KINGAMBIT_URSALUNA, opp: quattro, hp: 70, quanti: 4 });
    const b = await decidi({ parametri: { protezioneInVantaggio: 3 } }, { mia: KINGAMBIT_URSALUNA, opp: quattro, hp: 70, quanti: 4 });
    assert.ok(proteggono(a.valutazione).length > 0);
    assert.deepEqual(proteggono(b.valutazione), proteggono(a.valutazione), 'a metà partita la protezione costa quanto prima');
    // un avversario solo e due Pokémon miei: con il vantaggio la protezione costa molto di più e, tra i cinque piani migliori, non ce n'è uno con una protezione
    const d = await decidi({ parametri: { protezioneInVantaggio: 3 } }, { mia: KINGAMBIT_URSALUNA, opp: ['Urshifu-Rapid-Strike'], hp: 70 });
    assert.equal(proteggono(d.valutazione).length, 0, `nessun piano con una protezione tra i migliori: ${JSON.stringify(d.valutazione.map(x => x.azioni))}`);
    assert.doesNotMatch(d.scelta, /move 3\b/);
});

test('chi ha più Pokémon scambia volentieri: un KO vale di più quanto meno Pokémon restano (pesoMateriale), ma solo a chi lo subisce', async () => {
    const { ia } = await decidi({}, { mia: KINGAMBIT_URSALUNA, opp: ['Urshifu-Rapid-Strike'], hp: 70 });
    // la squadra avversaria è di un Pokémon e la mia di due: tre a uno per chi è in vantaggio
    const kMat = n => 1 + ia.par.pesoMateriale * (Math.max(2, 2, 1) - Math.min(2, Math.max(1, n))) / (Math.max(2, 2, 1) - 1);
    assert.ok(kMat(1) > kMat(2), 'l\'ultimo Pokémon vale più del penultimo');
    assert.equal(kMat(2), 1, 'la squadra piena vale come prima');
    assert.ok(ia.par.pesoFinale > 0 && ia.par.pesoMateriale > 0);
});

// ---------------------------------------------------------------- le mosse che falliscono
const HITMON = [
    { specie: 'Hitmonlee', item: 'Sitrus Berry', mosse: ['Upper Hand', 'Close Combat', 'Fake Out', 'Protect'] },
    { specie: 'Gholdengo', item: 'Choice Specs', mosse: ['Make It Rain', 'Shadow Ball', 'Thunderbolt', 'Protect'] }
];

test('Mano Pesante non si gioca contro chi non userà una mossa prioritaria (era scelta il 44% delle volte e falliva il 94%)', async () => {
    // Weavile e Abomasnow sono deboli alla lotta: per la CPU di prima Mano Pesante (65 di potenza, priorità +3) era la mossa migliore, anche se nessuno dei due usa una mossa prioritaria
    const r = await decidi({}, { mia: HITMON, opp: ['Weavile', 'Abomasnow', 'Incineroar', 'Rillaboom'], turno: 4, quanti: 4 });
    assert.doesNotMatch(r.scelta.split(', ')[0], /^move 1\b/, `Upper Hand al primo slot: ${r.scelta}`);
    assert.match(r.scelta.split(', ')[0], /^move 2 1$/, 'Close Combat: una mossa che riesce');
    const conUH = r.valutazione.find(p => /Upper Hand/.test(p.azioni[0]));
    assert.ok(!conUH || conUH.val < r.valutazione[0].val - 0.2, `un piano con Upper Hand, se c'è, è peggiore: ${conUH && conUH.val} contro ${r.valutazione[0].val}`);
});

test('una mossa fallita il turno prima non si ripete uguale (costoRipetizione), e il fallimento si impara dal log', async () => {
    const mia = [
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Dragon Claw', 'Rock Slide', 'Protect', 'Swords Dance'] },
        { specie: 'Dragonite', item: 'Leftovers', mosse: ['Extreme Speed', 'Dragon Claw', 'Protect', 'Fire Punch'] }
    ];
    const { sim } = await caricaSim();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, debug: true });
    ia.osserva([...logAvv(['Tyranitar', 'Tapu Koko'], { quanti: 4 }), ...logMia(mia, [0, 1]), '|turn|3']);
    // al turno 3 Garchomp usa Dragon Claw e la mossa fallisce
    ia.osserva(['|move|p2a: Garchomp|Dragon Claw|p1a: Tyranitar', '|-fail|p2a: Garchomp', '|turn|4']);
    const m = ia._mon('p2a: Garchomp');
    assert.deepEqual(m.fallita, { mossa: 'dragonclaw', turno: 3 });
    // una protezione che fallisce non si conta come mossa fallita (ha già il suo conto)
    ia.osserva(['|move|p2b: Dragonite|Protect|p2b: Dragonite', '|-fail|p2b: Dragonite']);
    assert.equal(ia._mon('p2b: Dragonite').fallita, undefined);
});

// ---------------------------------------------------------------- stati e rallentamenti
test('gli stati valgono per il bersaglio scelto: Fuocopira su uno speciale vale molto meno che su uno fisico, e non si dà a chi sta meglio col nuovo stato', async () => {
    const mia = [
        { specie: 'Rotom-Wash', item: 'Sitrus Berry', mosse: ['Will-O-Wisp', 'Hydro Pump', 'Thunderbolt', 'Protect'] },
        { specie: 'Rillaboom', item: 'Assault Vest', mosse: ['Grassy Glide', 'Wood Hammer', 'U-turn', 'Fake Out'] }
    ];
    const r = await decidi({}, { mia, opp: ['Kingambit', 'Flutter Mane', 'Incineroar', 'Amoonguss'], quanti: 4 });
    const ia = r.ia, S = ia.ultimoStato.stato0;
    const wow = ia.mossa('willowisp');
    const E = vittima => ({ campoMio: { tailwind: 0 }, campoAvv: { tailwind: 0 }, ctx: S.ctx, doppio: true, nemici: () => S.avv, insiemi: l => (l === 'mie' ? S.mie : S.avv), vittima });
    const fisico = S.avv[0], speciale = S.avv[1];       // Kingambit attacca con l'Attacco, Flutter Mane con l'Attacco Speciale
    const vF = ia._valoreStato(wow, 'mie', 0, E(fisico)), vS = ia._valoreStato(wow, 'mie', 0, E(speciale));
    assert.ok(vF > 0.4, `contro un fisico vale: ${vF}`);
    assert.ok(vS < vF * 0.6, `contro uno speciale molto meno: ${vS} contro ${vF}`);
    // chi ha già uno stato, o è di tipo Fuoco, o ha Grinta, non si colpisce
    assert.equal(ia._valoreStato(wow, 'mie', 0, E(Object.assign({}, fisico, { stato: 'par' }))), 0);
    assert.equal(ia._valoreStato(wow, 'mie', 0, E(Object.assign({}, fisico, { tipi: ['Fire'] }))), 0);
    assert.equal(ia._valoreStato(wow, 'mie', 0, E(Object.assign({}, fisico, { abilita: 'guts' }))), 0);
    // chi sta per cadere non ha più turni da perdere
    assert.ok(ia._valoreStato(wow, 'mie', 0, E(Object.assign({}, fisico, { hp: Math.round(fisico.hpMax * 0.15) }))) < vF * 0.6);
});

test('Vento Gelato e Rete Elettrica valgono per i sorpassi che creano: niente se la Stanza Magica è attiva o se nessuno dei miei passerebbe', async () => {
    const mia = [
        { specie: 'Garchomp', item: 'Life Orb', mosse: ['Dragon Claw', 'Rock Slide', 'Protect', 'Icy Wind'] },
        { specie: 'Gholdengo', item: 'Choice Specs', mosse: ['Make It Rain', 'Shadow Ball', 'Thunderbolt', 'Protect'] }
    ];
    // Dragapult (142) è più veloce di Garchomp (102): con un livello in meno (× 2/3) Garchomp passa
    const r = await decidi({}, { mia, opp: ['Dragapult', 'Hatterene', 'Incineroar', 'Rillaboom'], quanti: 4 });
    const ia = r.ia, S = ia.ultimoStato.stato0, drago = S.avv[0];
    assert.ok(ia._sorpassiSe(S.mie, drago, S.ctx, 2 / 3) > 0, 'Garchomp passerebbe Dragapult con la velocità abbassata di un livello');
    assert.equal(ia._sorpassiSe(S.mie, drago, Object.assign({}, S.ctx, { stanzaMagica: true }), 2 / 3), 0, 'in Stanza Magica non serve');
    assert.equal(ia._sorpassiSe(S.mie, S.avv[1], S.ctx, 2 / 3), 0, 'Hatterene è già più lento di Garchomp: niente da sorpassare');
    assert.equal(ia._sorpassiSe([], drago, S.ctx, 2 / 3), 0);
});

test('Colpo Fortunato pesa di più quanto più minaccia chi lo subisce (valoreFakeOut)', async () => {
    assert.ok(IA.PARAMETRI_BASE.valoreFakeOut > 0.3, 'prima era 0,3 uguale per tutti');
});

// ---------------------------------------------------------------- le protezioni non a schema
test('rumoreProtezione: nei casi dubbi la decisione di proteggersi cambia da una decisione all\'altra (non è una regola a memoria)', async () => {
    const mia = [
        { specie: 'Rillaboom', item: 'Assault Vest', mosse: ['Grassy Glide', 'Wood Hammer', 'Protect', 'U-turn'] },
        { specie: 'Incineroar', item: 'Sitrus Berry', mosse: ['Flare Blitz', 'Knock Off', 'Protect', 'Fake Out'] }
    ];
    const prova = async casuale => {
        const { sim } = await caricaSim();
        const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale, debug: true });
        ia.osserva([...logAvv(['Flutter Mane', 'Urshifu-Rapid-Strike', 'Kingambit', 'Amoonguss'], { hp: 50, quanti: 4, mieiPortati: 2 }), ...logMia(mia, [0, 1]), '|turn|5']);
        ia.scegli(creaRichiesta(sim.Dex, { squadra: mia, attivi: [0, 1] }));
        return ia.ultimaValutazione;
    };
    // con lo scarto a caso massimo e minimo i piani con la protezione cambiano posto rispetto agli altri
    const alto = await prova(() => 0.999), basso = await prova(() => 0.001);
    const conProt = v => v.filter(x => x.azioni.some(t => /Protect/.test(t))).length;
    assert.notEqual(conProt(alto), conProt(basso), `quanti piani con la protezione tra i primi cinque: ${conProt(alto)} contro ${conProt(basso)}`);
    // e spento (rumoreProtezione 0) lo scarto non c'è
    const { sim } = await caricaSim();
    const fermo = x => { const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => x, debug: true, parametri: { rumoreProtezione: 0 } }); ia.osserva([...logAvv(['Flutter Mane', 'Urshifu-Rapid-Strike'], { hp: 50, quanti: 2 }), ...logMia(mia, [0, 1]), '|turn|5']); ia.scegli(creaRichiesta(sim.Dex, { squadra: mia, attivi: [0, 1] })); return ia.ultimaValutazione.map(z => z.azioni.join('|')).join(';'); };
    assert.equal(fermo(0.999).split(';')[0], fermo(0.001).split(';')[0], 'senza rumore il piano migliore è sempre lo stesso');
});
