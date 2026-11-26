'use strict';
// Le personalità della CPU (docs/cpu-personalita.js): stili di gioco (aggressiva, pivot, campo, velocità, stato) che sostituiscono "una CPU che gioca sempre allo stesso modo".
//   - ogni personalità ha i suoi testi e manopole che esistono davvero (nel cervello, cpu-ia.js, e nel team builder, team-cpu.js);
//   - si pesca a sorte prima di ogni partita (di più l'equilibrata, e di più chi si adatta ai Pokémon che la CPU ha);
//   - il capopalestra la sceglie, oppure la CPU ne suggerisce una da come l'ha allenata e dalle mosse del team;
//   - il cervello la applica (le manopole date a mano vincono) e il team builder compone team per quello stile;
//   - una partita intera con ognuna finisce senza scelte rifiutate dal simulatore.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pers = require('../docs/cpu-personalita.js');
const Cop = require('../docs/cpu-copione.js');
const Mem = require('../docs/cpu-memoria.js');
const IA = require('../docs/cpu-ia.js');
const T = require('../docs/team-cpu.js');
const K = require('../docs/cpu-conoscenza.js');
const { caricaSim, giocaPartita, creaCasuale } = require('./ayuda-sim.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = p => JSON.parse(fs.readFileSync(path.join(DOCS, p), 'utf8'));
const caricaJson = async p => leggi(p);
const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
const VGC = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };

// un generatore di numeri a caso sempre uguale (il test non dipende dalla fortuna)
const casuale = seme => { let s = seme >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

// ---------------------------------------------------------------- l'elenco
test('ogni personalità ha i suoi testi (in inglese, per la pagina) e l\'equilibrata è la CPU di sempre', () => {
    assert.deepEqual(Pers.ELENCO, ['equilibrata', 'aggressiva', 'pivot', 'campo', 'velocita', 'stato']);
    assert.equal(Pers.PREDEFINITA, 'equilibrata');
    for (const id of Pers.ELENCO) {
        const i = Pers.info(id);
        assert.equal(i.id, id);
        for (const campo of ['nome', 'breve', 'descrizione']) assert.ok(typeof i[campo] === 'string' && i[campo].length >= 4, `${id}.${campo}`);
        assert.match(i.descrizione, /^[A-Z]/, `${id}: la descrizione è una frase`);
    }
    assert.deepEqual(Pers.info('velocita').nome, 'Speed control');
    assert.equal(Pers.info('nonesiste'), null);
    assert.equal(Pers.info(undefined), null);
    // la personalità di base non sposta niente: è la CPU com'era
    assert.deepEqual(Pers.cervello('equilibrata'), {});
    assert.deepEqual(Pers.team('equilibrata'), { piani: {}, parametri: {} });
    assert.deepEqual(Pers.cervello('nonesiste'), {}, 'una sconosciuta non sposta niente');
    assert.deepEqual(Pers.team('nonesiste'), { piani: {}, parametri: {} });
    assert.equal(Pers.esiste('pivot'), true);
    assert.equal(Pers.esiste('constructor'), false, 'non è una chiave ereditata dall\'oggetto');
    assert.equal(Pers.esiste(''), false);
    assert.equal(Pers.esiste(null), false);
});

test('le manopole di ogni personalità esistono davvero: nel cervello, nel team builder e tra i piani', () => {
    const piani = new Set([...T.PIANI_DOPPIO, ...T.PIANI_SINGOLO]);
    for (const id of Pers.ELENCO) {
        for (const [k, v] of Object.entries(Pers.cervello(id))) {
            assert.ok(Object.prototype.hasOwnProperty.call(IA.PARAMETRI_BASE, k), `${id}: il cervello non ha la manopola "${k}"`);
            assert.ok(Number.isFinite(v), `${id}.${k} è un numero`);
        }
        const t = Pers.team(id);
        for (const [k, v] of Object.entries(t.parametri)) {
            assert.ok(Object.prototype.hasOwnProperty.call(T.PARAMETRI_TEAM, k), `${id}: il team builder non ha la manopola "${k}"`);
            assert.ok(Number.isFinite(v), `${id}.${k} è un numero`);
        }
        for (const [k, v] of Object.entries(t.piani)) {
            assert.ok(piani.has(k), `${id}: "${k}" non è un piano di team`);
            assert.ok(Number.isFinite(v) && v >= 0, `${id}.${k}: il peso di un piano non è negativo`);
        }
    }
    // chi non è l'equilibrata sposta davvero qualcosa, sia nel cervello sia nei team
    for (const id of Pers.ELENCO.slice(1)) {
        assert.ok(Object.keys(Pers.cervello(id)).length >= 3, `${id}: sposta qualche manopola del cervello`);
        assert.ok(Object.keys(Pers.team(id).parametri).length >= 3 && Object.keys(Pers.team(id).piani).length >= 3, `${id}: e anche quelle dei team`);
    }
});

test('cervello() e team() danno copie: chi le modifica non cambia le personalità', () => {
    const c = Pers.cervello('aggressiva'); c.costoProtezione = 99;
    assert.notEqual(Pers.cervello('aggressiva').costoProtezione, 99);
    const t = Pers.team('velocita'); t.piani.tailwind = 99; t.parametri.maxStato = 99;
    assert.notEqual(Pers.team('velocita').piani.tailwind, 99);
    assert.notEqual(Pers.team('velocita').parametri.maxStato, 99);
});

// ---------------------------------------------------------------- pescare a sorte
test('scegli: ogni personalità può uscire, l\'equilibrata più delle altre, e i pesi e le esclusioni contano', () => {
    const rnd = casuale(7), conta = {};
    for (let i = 0; i < 6000; i++) { const x = Pers.scegli(rnd); conta[x] = (conta[x] || 0) + 1; }
    for (const id of Pers.ELENCO) assert.ok(conta[id] > 400, `${id} esce (${conta[id]})`);
    for (const id of Pers.ELENCO.slice(1)) assert.ok(conta.equilibrata > conta[id] * 1.2, `l'equilibrata (${conta.equilibrata}) esce più di ${id} (${conta[id]})`);
    // i pesi: chi si adatta di più esce più spesso, ma gli altri non spariscono
    const conPesi = {};
    const r2 = casuale(11);
    for (let i = 0; i < 4000; i++) { const x = Pers.scegli(r2, { pesi: { velocita: 8 } }); conPesi[x] = (conPesi[x] || 0) + 1; }
    assert.ok(conPesi.velocita > 2000, `con il peso la velocità prevale (${conPesi.velocita})`);
    assert.ok(Pers.ELENCO.every(id => conPesi[id] > 0), 'nessuna sparisce');
    // un peso zero la toglie, `escludi` anche; se si toglie tutto resta quella di base
    const r3 = casuale(5);
    for (let i = 0; i < 500; i++) {
        assert.notEqual(Pers.scegli(r3, { pesi: { pivot: 0 } }), 'pivot');
        assert.notEqual(Pers.scegli(r3, { escludi: ['equilibrata'] }), 'equilibrata');
    }
    assert.equal(Pers.scegli(casuale(1), { escludi: Pers.ELENCO }), 'equilibrata');
    // i casi limite del generatore e un generatore assente
    assert.ok(Pers.ELENCO.includes(Pers.scegli(() => 0)));
    assert.ok(Pers.ELENCO.includes(Pers.scegli(() => 0.999999999)));
    assert.ok(Pers.ELENCO.includes(Pers.scegli()));
    assert.ok(Pers.ELENCO.includes(Pers.scegli(null, { pesi: { pivot: 'x', stato: NaN } })), 'pesi senza senso valgono 1');
});

test('sceltaDellaTappa: "auto" se non c\'è niente o non si capisce, altrimenti la personalità scelta', () => {
    assert.equal(Pers.sceltaDellaTappa(undefined), 'auto');
    assert.equal(Pers.sceltaDellaTappa(''), 'auto');
    assert.equal(Pers.sceltaDellaTappa('auto'), 'auto');
    assert.equal(Pers.sceltaDellaTappa('inventata'), 'auto');
    assert.equal(Pers.sceltaDellaTappa(42), 'auto');
    assert.equal(Pers.sceltaDellaTappa({}), 'auto');
    assert.equal(Pers.sceltaDellaTappa('pivot'), 'pivot');
    assert.equal(Pers.sceltaDellaTappa('  Velocita '), 'velocita');
});

// ---------------------------------------------------------------- lo stile di un insieme di mosse
test('tratti e gruppi: protezioni, perni, campo, velocità e stati, e le mosse che valgono per due (Onda Tuono)', () => {
    const t = Pers.tratti(['Tailwind', 'Icy Wind', 'Protect', 'Close Combat']);
    assert.deepEqual([t.n, t.velocita, t.protezione, t.attacco, t.stato, t.perno, t.campo], [4, 2, 1, 1, 0, 0, 0]);
    // un copione conta le mosse tante volte quante sono state usate
    const m = Pers.tratti({ uturn: 6, partingshot: 2, flareblitz: 4, protect: 3 });
    assert.deepEqual([m.n, m.perno, m.attacco, m.protezione], [15, 8, 4, 3]);
    // le mosse di stato che non attaccano e non stanno in un gruppo (potenziamenti, recuperi) non sono attacchi
    const s = Pers.tratti(['Swords Dance', 'Recover', 'Earthquake']);
    assert.deepEqual([s.n, s.attacco], [3, 1]);
    assert.deepEqual(Pers.gruppiDi('thunderwave').sort(), ['stato', 'velocita']);
    assert.deepEqual(Pers.gruppiDi('uturn'), ['perno']);
    assert.deepEqual(Pers.gruppiDi('reflect'), ['campo']);
    assert.deepEqual(Pers.gruppiDi('protect'), ['protezione']);
    assert.deepEqual(Pers.gruppiDi('earthquake'), []);
    // robusto a ciò che non è una mossa
    assert.equal(Pers.tratti([null, '', undefined, 'Protect']).n, 1);
    assert.equal(Pers.tratti({}).n, 0);
    assert.equal(Pers.tratti(undefined).n, 0);
    // un callback può dire cosa attacca
    assert.equal(Pers.tratti(['Foo', 'Bar'], x => x === 'foo').attacco, 1);
});

test('mosseDaTesto: le mosse di ogni Pokémon da un team in testo Showdown', () => {
    const testo = 'Incineroar @ Sitrus Berry\nAbility: Intimidate\nLevel: 50\nEVs: 252 HP\n- Fake Out\n- Flare Blitz\n- U-turn\n- Parting Shot\n\nAmoonguss\n- Spore\n- Rage Powder\n- Pollen Puff\n- Protect\n\nSolo nome\n';
    assert.deepEqual(Pers.mosseDaTesto(testo), [
        { mosse: ['Fake Out', 'Flare Blitz', 'U-turn', 'Parting Shot'] },
        { mosse: ['Spore', 'Rage Powder', 'Pollen Puff', 'Protect'] }
    ], 'chi non ha mosse non c\'è');
    assert.deepEqual(Pers.mosseDaTesto(''), []);
    assert.deepEqual(Pers.mosseDaTesto(null), []);
});

// ---------------------------------------------------------------- quanto un team si presta a uno stile
const squadra = (...liste) => liste.map(mosse => ({ mosse }));
const TEAM_VELOCITA = squadra(['Tailwind', 'Icy Wind', 'Protect', 'Heat Wave'], ['Electroweb', 'Protect', 'Thunder Wave', 'Hurricane'], ['Trick Room', 'Protect', 'Shadow Ball', 'Psychic'],
    ['Fake Out', 'U-turn', 'Protect', 'Close Combat'], ['Earthquake', 'Protect', 'Rock Slide', 'Stone Edge'], ['Surf', 'Protect', 'Ice Beam', 'Muddy Water']);
const TEAM_ATTACCO = squadra(['Close Combat', 'Flare Blitz', 'Earthquake', 'Rock Slide'], ['Dragon Claw', 'Outrage', 'Stone Edge', 'Fire Fang'], ['Surf', 'Ice Beam', 'Hydro Pump', 'Energy Ball'],
    ['Moonblast', 'Shadow Ball', 'Psychic', 'Thunderbolt'], ['Brave Bird', 'Close Combat', 'Knock Off', 'U-turn'], ['Sucker Punch', 'Iron Head', 'Play Rough', 'Wild Charge']);
const TEAM_PIVOT = squadra(['Fake Out', 'U-turn', 'Parting Shot', 'Knock Off'], ['Volt Switch', 'Protect', 'Thunderbolt', 'Dazzling Gleam'], ['Flip Turn', 'Protect', 'Surf', 'Ice Beam'],
    ['Earthquake', 'Protect', 'Rock Slide', 'Dragon Claw'], ['Moonblast', 'Protect', 'Shadow Ball', 'Psychic'], ['Close Combat', 'Protect', 'Sucker Punch', 'Iron Head']);

test('affinita: un team si presta agli stili di cui ha le mosse (uno o due Pokémon non fanno uno stile, tre o quattro sì)', () => {
    const v = Pers.affinita(TEAM_VELOCITA);
    assert.ok(v.velocita >= 0.5, `velocità ${v.velocita}`);
    assert.ok(v.stato < 0.4 && v.campo < 0.4 && v.aggressiva < 0.2, 'e non è un team di stati, di campo o d\'attacco puro');
    const a = Pers.affinita(TEAM_ATTACCO);
    assert.ok(a.aggressiva >= 0.7, `aggressiva ${a.aggressiva}`);
    assert.ok(a.velocita === 0 && a.stato === 0 && a.campo === 0 && a.pivot < 0.4);
    const p = Pers.affinita(TEAM_PIVOT);
    assert.ok(p.pivot >= 0.7, `pivot ${p.pivot}`);
    // senza mosse resta solo l'equilibrata, a metà
    const niente = Pers.affinita([]);
    assert.equal(niente.equilibrata, 0.35);
    assert.ok(Pers.ELENCO.filter(i => i !== 'equilibrata').every(i => niente[i] === 0));
    // nel singolo la Protezione non conta: tutti i team senza Protezione non sono "aggressivi"
    assert.ok(Pers.affinita(TEAM_ATTACCO, { doppio: false }).aggressiva <= 0.7);
    assert.ok(Pers.affinita(TEAM_VELOCITA, { doppio: false }).aggressiva < 0.3);
    // i pesi per la scelta a sorte: chi si presta pesa fino a quattro volte, nessuno sparisce
    const pesi = Pers.pesiDaAffinita(v);
    assert.ok(pesi.velocita > pesi.stato && pesi.velocita <= 4);
    assert.ok(Pers.ELENCO.every(i => pesi[i] >= 1));
    assert.ok(Pers.ELENCO.every(i => Pers.pesiDaAffinita(null)[i] === 1));
});

// ---------------------------------------------------------------- il suggerimento per la palestra
/** Un copione: `categorie` le quattro quote delle decisioni del capopalestra, `mosse` per Pokémon quante volte le ha usate */
function copione({ categorie, mosse, lezioni = 4 }) {
    const specie = {};
    Object.entries(mosse).forEach(([nome, usi], i) => { specie[Cop.chiaveSpecie(nome)] = { n: 4, portato: 4, apertura: i < 2 ? 4 : 0, mosse: usi, mosseT1: {}, abilita: null, strumento: null, tera: null }; });
    const c = Cop.normalizza({ v: Cop.VERSIONE, lezioni, partite: lezioni, scelte: 80, t: 1, memoria: { v: Mem.VERSIONE, partite: lezioni, categorie, specie }, contro: {} });
    assert.ok(c, 'il copione di prova è valido');
    return c;
}
const COPIONE_PIVOT = copione({ categorie: { attacco: 30, protezione: 6, cambio: 20, altro: 6 }, mosse: { Incineroar: { fakeout: 4, uturn: 10, partingshot: 6, flareblitz: 8 }, Rillaboom: { grassyglide: 10, woodhammer: 6, uturn: 4 } } });
const COPIONE_VELOCITA = copione({ categorie: { attacco: 28, protezione: 8, cambio: 2, altro: 18 }, mosse: { Tornadus: { tailwind: 6, icywind: 6, hurricane: 6 }, Amoonguss: { ragepowder: 4, spore: 4, protect: 4 }, Kingambit: { trickroom: 4, suckerpunch: 6, ironhead: 6 } } });
const COPIONE_AGGRESSIVA = copione({ categorie: { attacco: 54, protezione: 2, cambio: 1, altro: 3 }, mosse: { Garchomp: { earthquake: 14, dragonclaw: 12, rockslide: 8 }, Incineroar: { flareblitz: 14, knockoff: 10, closecombat: 6 } } });
const COPIONE_NORMALE = copione({ categorie: { attacco: 36, protezione: 12, cambio: 3, altro: 9 }, mosse: { Garchomp: { earthquake: 10, protect: 6, dragonclaw: 8 }, Incineroar: { fakeout: 4, flareblitz: 8, knockoff: 6, protect: 4 } } });

test('suggerisci: senza dati l\'equilibrata; dal solo team lo stile che le sue mosse lasciano fare', () => {
    const niente = Pers.suggerisci({});
    assert.equal(niente.id, 'equilibrata');
    assert.equal(niente.origine, 'nessuna');
    assert.deepEqual(niente.motivi, []);
    const v = Pers.suggerisci({ team: TEAM_VELOCITA });
    assert.equal(v.id, 'velocita');
    assert.equal(v.origine, 'team');
    assert.equal(v.fiducia, 0);
    assert.equal(v.motivi[0], 'from the team: several of its Pokémon can control speed');
    assert.equal(Pers.suggerisci({ team: TEAM_PIVOT }).id, 'pivot');
    assert.equal(Pers.suggerisci({ team: TEAM_ATTACCO }).id, 'aggressiva');
    // un team qualunque, senza uno stile marcato, resta equilibrato (uno o due Pokémon con qualche mossa non bastano)
    const normale = squadra(['Earthquake', 'Protect', 'Rock Slide', 'Dragon Claw'], ['Surf', 'Protect', 'Ice Beam', 'Tailwind'], ['Moonblast', 'Protect', 'Shadow Ball', 'Psychic'],
        ['Close Combat', 'Protect', 'Sucker Punch', 'Iron Head'], ['Flare Blitz', 'Protect', 'Knock Off', 'Fake Out'], ['Grassy Glide', 'Protect', 'Wood Hammer', 'U-turn']);
    assert.equal(Pers.suggerisci({ team: normale }).id, 'equilibrata');
});

test('suggerisci: dall\'allenamento, cioè da come il capopalestra ha giocato quel team', () => {
    const p = Pers.suggerisci({ copione: COPIONE_PIVOT });
    assert.equal(p.id, 'pivot');
    assert.equal(p.origine, 'allenamento');
    assert.equal(p.motivi[0], 'from your training: you switch and pivot a lot');
    assert.ok(p.fiducia >= 0.5);
    assert.equal(Pers.suggerisci({ copione: COPIONE_VELOCITA }).id, 'velocita');
    assert.equal(Pers.suggerisci({ copione: COPIONE_AGGRESSIVA }).id, 'aggressiva');
    assert.equal(Pers.suggerisci({ copione: COPIONE_NORMALE }).id, 'equilibrata', 'chi gioca in modo normale ha una CPU equilibrata');
    // come lo gioca conta più di cosa potrebbe fare: un team da velocità giocato a cambi è pivot
    assert.equal(Pers.suggerisci({ copione: COPIONE_PIVOT, team: TEAM_VELOCITA }).id, 'pivot');
    // ...e chi ha allenato la CPU e gioca in modo normale ha una CPU equilibrata, anche con un team che potrebbe fare altro: conta come lo gioca
    assert.equal(Pers.suggerisci({ copione: COPIONE_NORMALE, team: TEAM_VELOCITA }).id, 'equilibrata');
    // con una lezione sola e poche decisioni la CPU si fida meno dell'allenamento
    const una = copione({ categorie: { attacco: 7, protezione: 2, cambio: 0, altro: 3 }, mosse: { Garchomp: { earthquake: 4, protect: 2 }, Incineroar: { flareblitz: 3, knockoff: 3 } }, lezioni: 1 });
    assert.ok(Pers.suggerisci({ copione: una }).fiducia < Pers.suggerisci({ copione: COPIONE_NORMALE }).fiducia - 0.3, 'si fida meno dell\'allenamento');
    // i punteggi sono numeri tra 0 e 1 per ogni personalità
    for (const id of Pers.ELENCO) assert.ok(p.punteggi[id] >= 0 && p.punteggi[id] <= 1);
});

test('suggerisci: poche decisioni o un copione rotto non fanno uno stile', () => {
    const corto = copione({ categorie: { attacco: 2, protezione: 0, cambio: 3, altro: 0 }, mosse: { Incineroar: { uturn: 3 } }, lezioni: 1 });
    assert.equal(Pers.suggerisci({ copione: corto }).id, 'equilibrata', 'cinque decisioni sono troppo poche per dire come gioca');
    for (const rotto of [null, undefined, {}, { v: 99 }, 'testo', 42, { v: 1, memoria: 'no' }]) {
        const r = Pers.suggerisci({ copione: rotto, team: TEAM_VELOCITA });
        assert.equal(r.id, 'velocita', 'un copione che non si legge vale come nessun allenamento: resta il team');
        assert.equal(r.origine, 'team');
    }
    assert.equal(Pers.suggerisci({ copione: null, team: [] }).id, 'equilibrata');
    assert.equal(Pers.suggerisci({ team: 'non una squadra' }).id, 'equilibrata');
});

// ---------------------------------------------------------------- il cervello
test('il cervello applica la personalità; le manopole date a mano vincono; una personalità sconosciuta è come nessuna', async () => {
    const { sim } = await caricaSim();
    const base = IA.crea({ Dex: sim.Dex, lato: 'p2' });
    assert.equal(base.personalita, null);
    assert.equal(base.par.moltVelocita, IA.PARAMETRI_BASE.moltVelocita);
    const v = IA.crea({ Dex: sim.Dex, lato: 'p2', personalita: 'velocita' });
    assert.equal(v.personalita, 'velocita');
    assert.ok(v.par.moltVelocita > base.par.moltVelocita && v.par.valoreRallenta > base.par.valoreRallenta);
    assert.equal(v.par.moltStati, base.par.moltStati, 'quelle che non sposta restano com\'erano');
    const a = IA.crea({ Dex: sim.Dex, lato: 'p2', personalita: 'aggressiva' });
    assert.ok(a.par.costoProtezione > base.par.costoProtezione && a.par.costoCambioDoppio > base.par.costoCambioDoppio && a.par.moltStati < 1);
    const p = IA.crea({ Dex: sim.Dex, lato: 'p2', personalita: 'pivot' });
    assert.ok(p.par.bonusPerno > 0 && p.par.costoCambioDoppio < base.par.costoCambioDoppio);
    // a mano vince
    const mano = IA.crea({ Dex: sim.Dex, lato: 'p2', personalita: 'velocita', parametri: { moltVelocita: 3 } });
    assert.equal(mano.par.moltVelocita, 3);
    assert.equal(mano.par.valoreRallenta, v.par.valoreRallenta, 'le altre della personalità restano');
    // sconosciuta, vuota o strana: come niente (e l'equilibrata non cambia niente)
    for (const x of ['nonesiste', '', null, 42, {}, 'constructor']) assert.equal(IA.crea({ Dex: sim.Dex, lato: 'p2', personalita: x }).personalita, null);
    assert.deepEqual(IA.crea({ Dex: sim.Dex, lato: 'p2', personalita: 'equilibrata' }).par, base.par);
});

// ---------------------------------------------------------------- il team builder
async function squadreDi(personalita, quanti = 24, sim) {
    return (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: VGC, caricaJson, quanti, seme: 'personalita-test', ...(personalita ? { personalita } : {}) })).team;
}
function profilo(team, sim) {
    const out = { n: team.length, protezioni: 0, perni: 0, aiuto: 0, stato: 0, velocitaMosse: 0, piani: {} };
    for (const t of team) {
        out.piani[t.piano] = (out.piani[t.piano] || 0) + 1;
        for (const s of sim.Teams.import(t.testo)) {
            const mm = s.moves.map(K.id);
            if (mm.some(m => Pers.GRUPPI.protezione.has(m))) out.protezioni++;
            if (mm.some(m => Pers.GRUPPI.perno.has(m))) out.perni++;
            if (mm.includes('helpinghand')) out.aiuto++;
            if (mm.some(m => Pers.GRUPPI.stato.has(m))) out.stato++;
            if (mm.some(m => Pers.GRUPPI.velocita.has(m))) out.velocitaMosse++;
        }
    }
    return out;
}
const perTeam = (p, k) => p[k] / p.n;

test('il team builder compone per lo stile: aggressiva con meno Protezioni, pivot con più perni, velocità con i suoi piani, stato con più stati (e il team dice per quale stile è nato)', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const t0 = await squadreDi('', 24, sim), base = profilo(t0, sim);
    assert.ok(t0.every(t => t.personalita === undefined), 'senza personalità il team non ne ha');
    const agg = await squadreDi('aggressiva', 24, sim), vel = await squadreDi('velocita', 24, sim), piv = await squadreDi('pivot', 24, sim), sta = await squadreDi('stato', 24, sim), cam = await squadreDi('campo', 24, sim);
    for (const [id, lista] of Object.entries({ aggressiva: agg, velocita: vel, pivot: piv, stato: sta, campo: cam })) {
        assert.equal(lista.length, 24, `${id}: i team ci sono tutti`);
        assert.ok(lista.every(t => t.personalita === id), `${id}: il team riporta il suo stile`);
        for (const t of lista) assert.equal(sim.Teams.import(t.testo).length, 6, `${id}: sei Pokémon`);
    }
    const a = profilo(agg, sim), v = profilo(vel, sim), p = profilo(piv, sim), s = profilo(sta, sim), c = profilo(cam, sim);
    assert.ok(perTeam(a, 'protezioni') < perTeam(base, 'protezioni') - 0.6, `aggressiva: meno Protezioni (${perTeam(a, 'protezioni').toFixed(2)} contro ${perTeam(base, 'protezioni').toFixed(2)})`);
    assert.equal(a.aiuto, 0, 'aggressiva: niente Aiuto');
    assert.ok((a.piani.offensivo || 0) > (base.piani.offensivo || 0) + 4, `aggressiva: molti più team offensivi (${a.piani.offensivo} contro ${base.piani.offensivo || 0})`);
    assert.ok(perTeam(p, 'perni') > perTeam(base, 'perni') + 0.4, `pivot: più perni (${perTeam(p, 'perni').toFixed(2)} contro ${perTeam(base, 'perni').toFixed(2)})`);
    const quelliDiVelocita = x => (x.piani.tailwind || 0) + (x.piani.trickroom || 0);
    assert.ok(quelliDiVelocita(v) >= 14 && quelliDiVelocita(v) > quelliDiVelocita(base) + 5, `velocità: Vento in Poppa o Stanza Magica nella maggior parte dei team (${quelliDiVelocita(v)} su 24 contro ${quelliDiVelocita(base)})`);
    assert.ok(perTeam(v, 'velocitaMosse') >= perTeam(base, 'velocitaMosse'), 'velocità: almeno tanti Pokémon che controllano la velocità');
    assert.ok(perTeam(s, 'stato') > perTeam(base, 'stato') + 0.05, `stato: più Pokémon con uno stato (${perTeam(s, 'stato').toFixed(2)} contro ${perTeam(base, 'stato').toFixed(2)})`);
    // campo: meno team "bilanciati" o "offensivi" (ne escono di più con un piano da preparare: meteo, Vento in Poppa, Stanza Magica) e almeno tanto Aiuto
    const semplici = x => (x.piani.bilanciato || 0) + (x.piani.offensivo || 0);
    assert.ok(semplici(c) < semplici(base) - 1, `campo: meno team senza un piano da preparare (${semplici(c)} contro ${semplici(base)})`);
    assert.ok(perTeam(c, 'aiuto') >= perTeam(base, 'aiuto'), 'campo: almeno tanto Aiuto');
});

test('nuovoTeam e unTeam: la personalità arriva al team; una sconosciuta o l\'equilibrata lo lasciano com\'era', { timeout: 120000 }, async () => {
    const { sim } = await caricaSim();
    const sessione = await T.preparaSessione({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: VGC, caricaJson });
    const con = await T.nuovoTeam(sessione, { personalita: 'campo', seme: 'a' });
    assert.equal(con.team.personalita, 'campo');
    const senza = await T.nuovoTeam(sessione, { seme: 'a' });
    assert.equal(senza.team.personalita, undefined);
    const strana = await T.nuovoTeam(sessione, { personalita: 'nonesiste', seme: 'a' });
    assert.equal(strana.team.personalita, undefined);
    const eq = await T.nuovoTeam(sessione, { personalita: 'equilibrata', seme: 'a' });
    assert.equal(eq.team.personalita, 'equilibrata');
    assert.equal(eq.team.testo, senza.team.testo, 'con l\'equilibrata lo stesso seme dà lo stesso team di sempre');
    // la sessione non si sporca: dopo un team per un altro stile, quello di prima è uguale
    const dopo = await T.nuovoTeam(sessione, { seme: 'a' });
    assert.equal(dopo.team.testo, senza.team.testo);
});

// ---------------------------------------------------------------- partite intere
test('una partita intera con ogni personalità (team composti per quello stile) finisce, senza scelte rifiutate dal simulatore', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const avversari = (await squadreDi('', 6, sim));
    const formato = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
    let n = 0;
    for (const id of Pers.ELENCO) {
        const mie = (await squadreDi(id, 6, sim))[n % 6], loro = avversari[(n + 2) % 6];
        n++;
        const c1 = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(n * 3), piano: mie.piano, personalita: id });
        const c2 = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(n * 5), piano: loro.piano });
        const e = await giocaPartita({ sim, formato, team1: mie.testo, team2: loro.testo,
            agente1: { tipo: 'cpu', cerebro: c1, anteprima: r => c1.scegli(r, { errori: 0 }) }, agente2: { tipo: 'cpu', cerebro: c2, anteprima: r => c2.scegli(r, { errori: 0 }) },
            casuale: creaCasuale(n * 11), seme: [n, 7, 11, 13] });
        assert.equal(e.errori.length, 0, `${id}: nessuna scelta rifiutata (${JSON.stringify(e.errori.slice(0, 2))})`);
        assert.ok(e.vincitore === 'p1' || e.vincitore === 'p2', `${id}: la partita finisce con un vincitore`);
        assert.ok(e.turni >= 2, `${id}: si è giocato davvero (${e.turni} turni)`);
    }
});
