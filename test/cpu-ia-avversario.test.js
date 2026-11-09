'use strict';
// La CPU che conosce chi ha davanti (cpu-ia.js + cpu-avversario.js): le sue abitudini (quante volte si para, cambia, usa una mossa di stato) diventano
// gli scenari che la CPU valuta a ogni turno, e quello che l'avversario fa davvero in partita le corregge.
//   - cosa conta come "una decisione" nel log (le stesse regole delle statistiche da cui nasce la personalità);
//   - gli scenari del turno (singolo e doppio) e i loro pesi; la protezione ripetuta, il cambio senza panchina;
//   - le scelte: contro chi si para quasi sempre la CPU non attacca nel vuoto; contro chi attacca sempre è quella di prima; senza profilo non cambia niente;
//   - partite vere con la CPU che studia l'avversario: nessuna scelta rifiutata dal simulatore.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim, caricaRandoms, giocaPartita, creaCasuale } = require('./ayuda-sim.js');
const IA = require('../docs/cpu-ia.js');
const K = require('../docs/cpu-conoscenza.js');
const AV = require('../docs/cpu-avversario.js');

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

async function cervello(opzioni = {}) {
    const { sim } = await caricaSim();
    return { sim, ia: IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, ...opzioni }) };
}
function scelta(ia, richiesta, righe) {
    ia.osserva(righe);
    return ia.scegli(richiesta);
}
// un avversario con quelle abitudini, come se avesse tanti set alle spalle
const abitudini = (attacco, protezione, cambio, altro, n = 5000) => ({ giocatore: { n, quote: { attacco, protezione, cambio, altro } }, lega: null });
const SI_PARA_QUASI_SEMPRE = abitudini(0.05, 0.9, 0, 0.05);
const TUTTO_ATTACCO = abitudini(1, 0, 0, 0);

// ---------- cosa conta come "una decisione" dell'avversario ----------
// la CPU è p2, l'avversario è p1

test('decisioni dell\'avversario: mosse di attacco, protezioni, mosse di stato e cambi scelti a inizio turno (non U-turn, non i KO sostituiti, non le mosse che partono da sole)', async () => {
    const { ia } = await cervello({ avversario: true });
    ia.osserva([
        '|gen|9', '|gametype|singles',
        '|poke|p1|Heatran, L50|', '|poke|p1|Dragonite, L50|', '|poke|p1|Ferrothorn, L50|',
        '|switch|p1a: Heatran|Heatran, L50|100/100',                           // all'inizio non è una scelta
        '|turn|1',
        '|move|p1a: Heatran|Earth Power|p2a: Garchomp',                        // attacco
        '|move|p2a: Garchomp|Earthquake|p1a: Heatran',                         // mossa della CPU: non conta
        '|upkeep',
        '|turn|2',
        '|move|p1a: Heatran|Protect|p1a: Heatran',                             // protezione
        '|upkeep',
        '|turn|3',
        '|move|p1a: Heatran|Stealth Rock|p2a: Garchomp',                       // altro (campo)
        '|move|p1a: Heatran|Outrage|p2a: Garchomp|[from]lockedmove',           // partita da sola: non conta
        '|upkeep',
        '|turn|4',
        '|switch|p1a: Dragonite|Dragonite, L50|100/100',                       // cambio scelto a inizio turno
        '|move|p2a: Garchomp|Earthquake|p1a: Dragonite',
        '|move|p1a: Dragonite|U-turn|p2a: Garchomp',                           // attacco
        '|switch|p1a: Ferrothorn|Ferrothorn, L50|100/100',                     // dopo una mossa: è il U-turn, non una scelta
        '|faint|p1a: Ferrothorn',
        '|upkeep',
        '|switch|p1a: Heatran|Heatran, L50|100/100',                           // dopo |upkeep|: un KO sostituito, non una scelta
        '|turn|5'
    ]);
    assert.deepEqual(ia.modelloAvversario().visti, { attacco: 2, protezione: 1, cambio: 1, altro: 1 });
    assert.equal(ia.modelloAvversario().nVisti, 5);
});

test('decisioni dell\'avversario: le mosse della CPU non si contano; senza modello non si conta niente', async () => {
    const { ia } = await cervello({ avversario: true });
    ia.osserva(['|turn|1', '|move|p2a: Garchomp|Protect|p2a: Garchomp', '|switch|p2a: Gengar|Gengar, L50|100/100', '|turn|2', '|move|p2a: Gengar|Shadow Ball|p1a: X']);
    assert.equal(ia.modelloAvversario().nVisti, 0, 'sono tutte scelte sue');
    const senza = await cervello();
    senza.ia.osserva(['|turn|1', '|move|p1a: Heatran|Protect|p1a: Heatran']);
    assert.equal(senza.ia.modelloAvversario(), null);
});

test('abitudini: la media della lega se si dice solo "avversario: true", il profilo se c\'è, niente se non c\'è; si può togliere e rimettere a partita iniziata', async () => {
    assert.equal((await cervello()).ia.modelloAvversario(), null);
    assert.equal((await cervello({ avversario: null })).ia.modelloAvversario(), null);
    assert.deepEqual((await cervello({ avversario: true })).ia.modelloAvversario().quote, AV.QUOTE_LEGA);
    const profilo = AV.daStile({ set: 30, azioni: { mosse: 190, cambi: 10, attacco: 100, protezione: 80, recupero: 4, potenziamento: 3, campo: 2, supporto: 1, disturbo: 0, altro: 0 } });
    const { ia } = await cervello({ avversario: profilo });
    assert.ok(ia.modelloAvversario().partenza.protezione > AV.QUOTE_LEGA.protezione + 0.1);
    // il profilo arriva tardi: si cambia la partenza e quello che si è visto resta
    const tardi = (await cervello({ avversario: true })).ia;
    tardi.osserva(['|turn|1', '|move|p1a: Heatran|Protect|p1a: Heatran']);
    tardi.impostaAvversario(profilo);
    assert.equal(tardi.modelloAvversario().nVisti, 1);
    assert.ok(tardi.modelloAvversario().partenza.protezione > AV.QUOTE_LEGA.protezione + 0.1);
    tardi.impostaAvversario(null);
    assert.equal(tardi.modelloAvversario(), null);
});

test('abitudini: quello che l\'avversario fa in partita corregge le quote (chi si para dieci volte di fila si para)', async () => {
    const { ia } = await cervello({ avversario: true });
    const prima = ia.modelloAvversario().quote.protezione;
    const righe = [];
    for (let t = 1; t <= 10; t++) righe.push(`|turn|${t}`, '|move|p1a: Heatran|Detect|p1a: Heatran', '|upkeep');
    ia.osserva(righe);
    assert.ok(ia.modelloAvversario().quote.protezione > prima + 0.15);
}) ;

// ---------- gli scenari del turno ----------

function squadraSingolo() { return [{ specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Protect'] }]; }

async function scenariDi({ avversario, avversari = [{ specie: 'Heatran' }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }], doppio = false, extra = [], squadra, richiesta, parametri }) {
    const { sim, ia } = await cervello({ avversario, debug: true, ...(parametri ? { parametri } : {}) });
    squadra = squadra || squadraSingolo();
    const r = richiesta ? richiesta(sim) : creaRichiesta(sim.Dex, { squadra, attivi: doppio ? [0, 1] : [0] });
    scelta(ia, r, [...logAvversario(avversari, doppio), ...extra, ...logMiaSquadra(squadra, doppio ? [0, 1] : [0])]);
    return { ia, sim, scenari: ia.ultimoStato.alternative };
}
const categorieDi = scenari => scenari.map(s => Object.values(s.categorie).join('+'));

test('scenari, singolo: attacca, si para, cambia o fa altro, con le probabilità delle sue abitudini; chi si para si para con una Protezione', async () => {
    const { scenari } = await scenariDi({ avversario: abitudini(0.6, 0.2, 0.1, 0.1) });
    assert.deepEqual(categorieDi(scenari).sort(), ['altro', 'attacco', 'cambio', 'protezione']);
    const peso = c => scenari.find(s => s.categorie[0] === c).peso;
    // con 5.000 decisioni alle spalle le sue quote contano quasi del tutto (un filo di media della lega)
    vicino(peso('attacco'), 0.6, 0.01); vicino(peso('protezione'), 0.2, 0.01);
    assert.ok(Math.abs(scenari.reduce((t, s) => t + s.peso, 0) - 1) < 1e-9);
    const para = scenari.find(s => s.categorie[0] === 'protezione').azioni[0];
    assert.equal(para.tipo, 'mossa');
    assert.equal(para.mossa.protezione, true);
    assert.equal(para.lato, 'avv');
    assert.equal(scenari.find(s => s.categorie[0] === 'cambio').azioni[0].tipo, 'cambio');
    assert.equal(scenari.find(s => s.categorie[0] === 'altro').azioni[0].tipo, 'passa');
    assert.equal(scenari.find(s => s.categorie[0] === 'attacco').azioni[0].tipo, 'mossa');
});

// le regole sulle situazioni (cpu-situazioni.js): con pochi PS l'avversario cambia molto di più
const PESI_ZERO = () => Object.fromEntries(['base', ...require('../docs/cpu-situazioni.js').CARATTERISTICHE].map(k => [k, 0]));
const REGOLE_PS_BASSI = { singoli: { n: 5000, pesi: { protezione: PESI_ZERO(), cambio: Object.assign(PESI_ZERO(), { psBassi: 2 }), altro: PESI_ZERO() } } };
const conRegole = (regole = REGOLE_PS_BASSI) => Object.assign(abitudini(0.6, 0.2, 0.1, 0.1), { situazioni: regole });
const pesoDi = (scenari, c) => scenari.find(s => s.categorie[0] === c).peso;

test('situazioni: le regole imparate dai replay cambiano i pesi degli scenari secondo come sta il Pokémon avversario (pochi PS: cambia molto di più)', async () => {
    const normale = await scenariDi({ avversario: conRegole() });
    const quasiKo = await scenariDi({ avversario: conRegole(), avversari: [{ specie: 'Heatran', hp: 20 }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
    vicino(pesoDi(normale.scenari, 'cambio'), 0.1, 0.02);                          // a pieno PS le regole non cambiano niente (pesi a zero)
    assert.ok(pesoDi(quasiKo.scenari, 'cambio') > pesoDi(normale.scenari, 'cambio') * 4, `${pesoDi(quasiKo.scenari, 'cambio')} contro ${pesoDi(normale.scenari, 'cambio')}`);
    assert.ok(pesoDi(quasiKo.scenari, 'attacco') < pesoDi(normale.scenari, 'attacco'));
    assert.ok(Math.abs(quasiKo.scenari.reduce((t, s) => t + s.peso, 0) - 1) < 1e-9);
    // senza regole, o spente, nessuna differenza tra PS pieni e bassi
    const senza = await scenariDi({ avversario: abitudini(0.6, 0.2, 0.1, 0.1), avversari: [{ specie: 'Heatran', hp: 20 }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
    vicino(pesoDi(senza.scenari, 'cambio'), 0.1, 0.02);
    const spente = await scenariDi({ avversario: conRegole(), parametri: { pesoSituazioni: 0 }, avversari: [{ specie: 'Heatran', hp: 20 }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
    vicino(pesoDi(spente.scenari, 'cambio'), 0.1, 0.02);
    // metà peso: a metà strada
    const meta = await scenariDi({ avversario: conRegole(), parametri: { pesoSituazioni: 0.5 }, avversari: [{ specie: 'Heatran', hp: 20 }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
    assert.ok(pesoDi(meta.scenari, 'cambio') > pesoDi(normale.scenari, 'cambio') * 1.5 && pesoDi(meta.scenari, 'cambio') < pesoDi(quasiKo.scenari, 'cambio'));
});

test('situazioni: le regole del doppio non valgono nel singolo e viceversa; regole incomplete o assenti non rompono niente', async () => {
    const soloDoppio = { doppi: REGOLE_PS_BASSI.singoli };
    const s = await scenariDi({ avversario: conRegole(soloDoppio), avversari: [{ specie: 'Heatran', hp: 20 }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
    vicino(pesoDi(s.scenari, 'cambio'), 0.1, 0.02);
    for (const strane of [{}, { singoli: {} }, { singoli: { pesi: null } }, { singoli: { pesi: { cambio: { psBassi: 'boh' } } } }, 'testo', 5]) {
        const x = await scenariDi({ avversario: conRegole(strane), avversari: [{ specie: 'Heatran', hp: 20 }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
        assert.ok(x.scenari.length >= 1);
        assert.ok(Math.abs(x.scenari.reduce((t, c) => t + c.peso, 0) - 1) < 1e-9);
    }
});

test('situazioni: nel doppio ogni Pokémon avversario ha la sua situazione (uno quasi KO, l\'altro no)', async () => {
    const regole = { doppi: REGOLE_PS_BASSI.singoli };
    const d = await scenariDi({ avversario: conRegole(regole), doppio: true, squadra: [{ specie: 'Garchomp', mosse: ['Earthquake', 'Protect'] }, { specie: 'Rillaboom', mosse: ['Grassy Glide', 'Protect'] }],
        avversari: [{ specie: 'Heatran', hp: 15 }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
    const cambiaPrimo = d.scenari.filter(s => s.categorie[0] === 'cambio').reduce((t, s) => t + s.peso, 0);
    const cambiaSecondo = d.scenari.filter(s => s.categorie[1] === 'cambio').reduce((t, s) => t + s.peso, 0);
    assert.ok(cambiaPrimo > cambiaSecondo * 3, `${cambiaPrimo} contro ${cambiaSecondo}`);
});

test('scenari: senza abitudini restano i due di sempre (65% e 35%); con un avversario che attacca e basta, lo stesso', async () => {
    const senza = await scenariDi({ avversario: null });
    assert.deepEqual(senza.scenari.map(s => s.peso), [0.65, 0.35]);
    assert.ok(senza.scenari.every(s => s.categorie === undefined), 'è la previsione di prima');
    const attacco = await scenariDi({ avversario: TUTTO_ATTACCO });
    assert.equal(attacco.scenari.length, 1);
    assert.equal(attacco.scenari[0].categorie[0], 'attacco');
});

test('scenari: chi ha appena protetto si para molto meno (la seconda di fila riesce una volta su tre); lo si legge dal log', async () => {
    const quote = abitudini(0.6, 0.3, 0, 0.1);
    const normale = await scenariDi({ avversario: quote });
    // il turno scorso Heatran ha protetto (l'ultimo turno è l'1, quindi ora siamo al 2)
    const dopo = await scenariDi({ avversario: quote, extra: [] }).then(async () => {
        const { sim, ia } = await cervello({ avversario: quote, debug: true });
        const squadra = squadraSingolo();
        const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
        ia.osserva([...logAvversario([{ specie: 'Heatran' }, { specie: 'Dragonite' }], false, 1), ...logMiaSquadra(squadra, [0]),
            '|move|p1a: Heatran|Protect|p1a: Heatran', '|upkeep', '|turn|2']);
        ia.scegli(r);
        return ia.ultimoStato.alternative;
    });
    const pPara = lista => (lista.find(s => s.categorie[0] === 'protezione') || { peso: 0 }).peso;
    assert.ok(pPara(dopo) < pPara(normale.scenari) / 2, `${pPara(dopo)} dovrebbe essere molto meno di ${pPara(normale.scenari)}`);
});

test('scenari: senza nessuno in panchina l\'avversario non cambia (un solo Pokémon rimasto)', async () => {
    const { scenari } = await scenariDi({ avversario: abitudini(0.5, 0.1, 0.3, 0.1), avversari: [{ specie: 'Heatran' }] });
    assert.ok(!categorieDi(scenari).includes('cambio'), categorieDi(scenari).join());
    vicino(scenari.reduce((t, s) => t + s.peso, 0), 1);
    const con = await scenariDi({ avversario: abitudini(0.5, 0.1, 0.3, 0.1) });
    assert.ok(categorieDi(con.scenari).includes('cambio'), 'con la panchina cambia');
});
function vicino(a, b, tol = 1e-9) { assert.ok(Math.abs(a - b) <= tol, `${a} non è vicino a ${b}`); }

test('scenari, doppio: due slot, ognuno per conto suo; chi attacca ha le due varianti; ci sono sempre meno di maxScenari scenari e i pesi sommano a 1', async () => {
    const squadra = [
        { specie: 'Garchomp', item: 'Leftovers', mosse: ['Earthquake', 'Dragon Claw', 'Protect', 'Swords Dance'] },
        { specie: 'Gengar', item: 'Leftovers', mosse: ['Shadow Ball', 'Sludge Bomb', 'Protect', 'Thunderbolt'] }
    ];
    const { scenari } = await scenariDi({ avversario: true, doppio: true, squadra, avversari: [{ specie: 'Heatran' }, { specie: 'Dragonite' }, { specie: 'Ferrothorn' }] });
    assert.ok(scenari.length >= 3 && scenari.length <= 8, `scenari: ${scenari.length}`);
    vicino(scenari.reduce((t, s) => t + s.peso, 0), 1);
    const piu = scenari.filter(s => s.categorie[0] === 'attacco' && s.categorie[1] === 'attacco');
    assert.deepEqual(piu.map(s => s.variante).sort(), [0, 1], 'attaccano tutti e due: bersaglio migliore o l\'altro');
    assert.ok(scenari.some(s => s.categorie[0] !== s.categorie[1]), 'ci sono scenari misti (uno attacca, l\'altro no)');
    for (const s of scenari) assert.equal(s.azioni.length, 2, 'un\'azione per ogni slot');
});

test('scenari: la risposta a un cambio mio tiene lo scenario — chi si para continua a pararsi, chi attacca risponde ai nuovi arrivati', async () => {
    const squadra = [
        { specie: 'Charizard', item: 'Leftovers', mosse: ['Flamethrower', 'Air Slash', 'Roost', 'Dragon Pulse'] },
        { specie: 'Excadrill', item: 'Leftovers', mosse: ['Earthquake', 'Iron Head', 'Rock Slide', 'Swords Dance'] }
    ];
    const { ia, scenari } = await scenariDi({ avversario: abitudini(0.5, 0.5, 0, 0), squadra, avversari: [{ specie: 'Tyranitar' }, { specie: 'Dragonite' }] });
    const S = ia.ultimoStato.stato0;
    const cambio = [{ tipo: 'cambio', slot: 0, verso: 2, nome: 'Excadrill', squadraInfo: S.squadra.find(x => !x.attivo) }];
    const protegge = scenari.find(s => s.categorie[0] === 'protezione');
    const risposta = ia._rispostaAlCambio(cambio, S, scenari.indexOf(protegge), protegge);
    assert.equal(risposta.length, 1);
    assert.equal(risposta[0].mossa.protezione, true, 'si parava e si para');
    const attacca = scenari.find(s => s.categorie[0] === 'attacco');
    assert.equal(ia._rispostaAlCambio(cambio, S, scenari.indexOf(attacca), attacca)[0].tipo, 'mossa');
});

// ---------- le scelte ----------

test('scelta: contro chi si para quasi sempre la CPU si potenzia invece di attaccare nel vuoto; contro chi attacca (o senza profilo) attacca come sempre', async () => {
    const gioca = async avversario => {
        const { sim, ia } = await cervello({ avversario });
        const squadra = squadraSingolo();
        const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
        return scelta(ia, r, [...logAvversario([{ specie: 'Heatran' }], false), ...logMiaSquadra(squadra, [0])]);
    };
    assert.equal(await gioca(undefined), 'move 1', 'senza profilo: Terremoto (4x su Heatran)');
    assert.equal(await gioca(true), 'move 1', 'con la media della lega: ancora Terremoto');
    assert.equal(await gioca(TUTTO_ATTACCO), 'move 1');
    assert.equal(await gioca(SI_PARA_QUASI_SEMPRE), 'move 3', 'Swords Dance: l\'attacco andrebbe contro una Protezione');
});

test('scelta: contro chi cambia quasi sempre l\'attacco vale meno (chi entra incassa meno): il valore di Terremoto scende', async () => {
    const valore = async avversario => {
        const { sim, ia } = await cervello({ avversario, debug: true });
        const squadra = squadraSingolo();
        const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
        scelta(ia, r, [...logAvversario([{ specie: 'Heatran' }, { specie: 'Dragonite' }], false), ...logMiaSquadra(squadra, [0])]);
        return ia.ultimaValutazione.find(x => x.azioni[0].includes('Earthquake')).val;
    };
    const normale = await valore(TUTTO_ATTACCO);
    const cambiaSempre = await valore(abitudini(0, 0, 1, 0));
    assert.ok(cambiaSempre < normale * 0.85, `${cambiaSempre} dovrebbe essere molto meno di ${normale}`);
});

test('scelta: un profilo che non cambia l\'idea di cosa conviene non cambia la scelta (la CPU resta la stessa dove l\'attacco è ovviamente migliore)', async () => {
    for (const avversario of [true, abitudini(0.71, 0.163, 0.039, 0.087), abitudini(0.83, 0.114, 0.009, 0.047), abitudini(0.619, 0.089, 0.024, 0.268)]) {
        const { sim, ia } = await cervello({ avversario });
        const squadra = [{ specie: 'Charizard', item: 'Leftovers', mosse: ['Flamethrower', 'Air Slash', 'Earthquake', 'Roost'] }];
        const r = creaRichiesta(sim.Dex, { squadra, attivi: [0] });
        assert.equal(scelta(ia, r, [...logAvversario([{ specie: 'Ferrothorn' }], false), ...logMiaSquadra(squadra, [0])]), 'move 1', 'Lanciafiamme è 4x su Ferrothorn');
    }
});

// ---------- partite vere ----------

for (const f of ['gen9randombattle', 'gen9randomdoublesbattle']) {
    test(`partite vere (${f}): la CPU che studia l'avversario gioca fino in fondo senza scelte rifiutate dal simulatore, e quello che vede lo conta`, { timeout: 240000 }, async () => {
        const { sim } = await caricaRandoms();
        for (let i = 0; i < 2; i++) {
            const t1 = sim.Teams.generate(f, { seed: [i + 1, 3, 5, 7] }), t2 = sim.Teams.generate(f, { seed: [i + 2, 4, 6, 8] });
            const cpu = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 1), avversario: i === 0 ? true : abitudini(0.5, 0.3, 0.1, 0.1) });
            const contro = i === 0 ? { tipo: 'casuale' } : { tipo: 'cpu', cerebro: IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 50) }) };
            const e = await giocaPartita({ sim, formato: f, team1: t1, team2: t2, agente1: { tipo: 'cpu', cerebro: cpu }, agente2: contro, casuale: creaCasuale(i + 9), seme: [i + 1, 7, 11, 13] });
            assert.deepEqual(e.errori.map(x => `${x.lato} ${x.scelta} => ${x.messaggio}`), [], 'nessuna scelta rifiutata');
            assert.ok(!e.bloccata && !e.scaduta, `la partita deve finire (turni ${e.turni})`);
            assert.ok(cpu.modelloAvversario().nVisti >= 3, 'ha visto cosa faceva l\'avversario');
        }
    });
}
