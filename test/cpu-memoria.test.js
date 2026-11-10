'use strict';
// La memoria della serie (cpu-memoria.js + cpu-ia.js + battle-ui.js): la CPU si ricorda come hai giocato con un team nelle partite di prima.
//   - il modulo dati: normalizza, fonde con decadimento, quote di mosse e categorie;
//   - la CPU raccoglie ciò che vede (mosse, primo turno, apertura, chi porti, abilità, strumento) e lo usa (set noti, mosse che si prevedono, abitudini per Pokémon);
//   - senza memoria niente cambia; la pagina la tiene solo per la prova di un team (mai Random, palestre, online) e la azzera se il team cambia.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { caricaSim, giocaPartita, creaCasuale } = require('./ayuda-sim.js');
const IA = require('../docs/cpu-ia.js');
const Mem = require('../docs/cpu-memoria.js');
const AV = require('../docs/cpu-avversario.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

// ---------- il modulo dati ----------
const reg = (extra = {}) => Object.assign({ n: 1, portato: 1, apertura: 0, mosse: {}, mosseT1: {}, abilita: null, strumento: null, tera: null }, extra);
const mem = (specie, extra = {}) => Object.assign({ v: Mem.VERSIONE, partite: 1, categorie: { attacco: 4, protezione: 1, cambio: 0, altro: 1 }, specie }, extra);

test('normalizza: solo una memoria di questa versione, numeri validi, niente di strano', () => {
    assert.equal(Mem.normalizza(null), null);
    assert.equal(Mem.normalizza({}), null);
    assert.equal(Mem.normalizza({ v: 99, specie: {} }), null);
    assert.equal(Mem.normalizza('boh'), null);
    const m = Mem.normalizza({ v: 1, partite: 2.7, categorie: { attacco: -3, protezione: 'x', altro: 2 }, specie: { rillaboom: { n: 2, mosse: { fakeout: 3, strana: -1, nan: NaN }, abilita: 'x'.repeat(100), strumento: 5 }, rotta: null } });
    assert.equal(m.partite, 2);
    assert.deepEqual(m.categorie, { attacco: 0, protezione: 0, cambio: 0, altro: 2 });
    assert.deepEqual(m.specie.rillaboom.mosse, { fakeout: 3 });
    assert.equal(m.specie.rillaboom.abilita, null, 'un testo troppo lungo non è un\'abilità');
    assert.equal(m.specie.rillaboom.strumento, null);
    assert.ok(!('rotta' in m.specie));
});

test('fondi: la partita nuova si somma, quelle di prima valgono un po\' meno, le cose dimenticate spariscono; abilità e strumento nuovi vincono', () => {
    const a = mem({ incineroar: reg({ n: 1, portato: 1, apertura: 1, mosse: { fakeout: 2, flareblitz: 1 }, mosseT1: { fakeout: 1 }, abilita: 'blaze', strumento: 'sitrusberry' }) });
    const b = mem({ incineroar: reg({ n: 1, portato: 1, apertura: 0, mosse: { fakeout: 1, knockoff: 1 }, mosseT1: {}, abilita: 'intimidate' }) });
    const m = Mem.fondi(a, b);
    assert.equal(m.partite, 2);
    const r = m.specie.incineroar;
    assert.ok(Math.abs(r.n - (0.85 + 1)) < 1e-9, `n ${r.n}`);
    assert.ok(Math.abs(r.mosse.fakeout - (2 * 0.85 + 1)) < 1e-9);
    assert.ok(Math.abs(r.mosse.knockoff - 1) < 1e-9);
    assert.ok(Math.abs(r.mosseT1.fakeout - 0.85) < 1e-9, 'al primo turno ha usato Fake Out solo nella prima');
    assert.equal(r.abilita, 'intimidate', 'vince il più recente');
    assert.equal(r.strumento, 'sitrusberry', 'se la nuova non lo dice si tiene il vecchio');
    // la prima partita (senza memoria prima)
    assert.equal(Mem.fondi(null, b).partite, 1);
    // dopo tante partite senza rivederla, una mossa si dimentica
    let x = Mem.fondi(null, a);
    for (let i = 0; i < 30; i++) x = Mem.fondi(x, mem({ incineroar: reg({ mosse: { knockoff: 1 } }) }));
    assert.ok(!('flareblitz' in x.specie.incineroar.mosse), 'una mossa mai più rivista si dimentica');
    assert.ok(x.specie.incineroar.mosse.knockoff > 3);
    // una memoria rotta non rompe niente
    assert.equal(Mem.fondi({ v: 1 }, a).partite, 1);
});

test('quotaMossa e quoteCategorie: primo turno e turni dopo, separati', () => {
    const r = reg({ mosse: { fakeout: 3, closecombat: 5, protect: 2 }, mosseT1: { fakeout: 3 } });
    const t1 = Mem.quotaMossa(r, 'fakeout', true);
    assert.equal(t1.quota, 1); assert.equal(t1.n, 3);
    const dopo = Mem.quotaMossa(r, 'closecombat', false);
    assert.ok(Math.abs(dopo.quota - 5 / 7) < 1e-9 && Math.abs(dopo.n - 7) < 1e-9);
    assert.equal(Mem.quotaMossa(r, 'fakeout', false).quota, 0, 'dopo il primo turno non l\'ha più usata');
    assert.deepEqual(Mem.quotaMossa(null, 'x', true), { quota: 0, n: 0 });
    const c = Mem.quoteCategorie(r, false, AV.categoriaMossa);
    assert.ok(Math.abs(c.attacco - 5) < 1e-9 && Math.abs(c.protezione - 2) < 1e-9 && c.altro === 0 && Math.abs(c.n - 7) < 1e-9);
    assert.equal(Mem.quoteCategorie(r, true, AV.categoriaMossa).attacco, 3, 'Fake Out è un attacco');
    const ris = Mem.riassunto(mem({ rillaboom: reg({ n: 2, mosse: { fakeout: 1 } }) }));
    assert.equal(ris.partite, 1); assert.deepEqual(ris.specie[0].mosse, ['fakeout']);
});

test('il modello avversario: le decisioni delle partite di prima sono un punto di partenza, con un tetto', () => {
    const senza = AV.crea(null);
    const con = AV.crea(null, { precedenti: { attacco: 10, protezione: 90, cambio: 0, altro: 0 } });
    assert.ok(con.quote().protezione > senza.quote().protezione + 0.1, 'chi si parava molto è previsto come uno che si para');
    assert.equal(con.nVisti(), 0, 'visti conta solo questa partita (è quello che si ricorda dopo)');
    assert.ok(con.nPrecedenti() <= AV.FORZA_PRECEDENTI + 1e-9, 'tetto');
    // con tantissime decisioni di prima la proporzione resta, il peso no
    const tanto = AV.crea(null, { precedenti: { attacco: 1000, protezione: 9000, cambio: 0, altro: 0 } });
    assert.ok(Math.abs(tanto.nPrecedenti() - AV.FORZA_PRECEDENTI) < 1e-9);
    // dentro la partita ci si adatta lo stesso
    for (let i = 0; i < 80; i++) con.osserva('attacco');
    assert.ok(con.quote().attacco > 0.5);
    // niente precedenti: come sempre
    assert.deepEqual(AV.crea(null, { precedenti: null }).quote(), senza.quote());
});

// ---------- la CPU raccoglie e usa ----------
function creaRichiesta(Dex, { squadra, attivi, livello = 50 }) {
    const dex = Dex.forGen(9);
    const pokemon = squadra.map((s, i) => {
        const sp = dex.species.get(s.specie);
        const b = sp.baseStats;
        const stat = k => Math.floor((2 * b[k] + 31 + 21) * livello / 100) + 5;
        const hpMax = Math.floor((2 * b.hp + 31 + 21) * livello / 100) + livello + 10;
        return {
            ident: `p2: ${sp.name}`, details: `${sp.name}, L${livello}`, condition: `${hpMax}/${hpMax}`, active: attivi.includes(i),
            stats: { atk: stat('atk'), def: stat('def'), spa: stat('spa'), spd: stat('spd'), spe: stat('spe') },
            moves: s.mosse.map(m => dex.moves.get(m).id), baseAbility: Object.values(sp.abilities)[0].toLowerCase().replace(/[^a-z0-9]/g, ''), item: '',
            ability: Object.values(sp.abilities)[0].toLowerCase().replace(/[^a-z0-9]/g, ''), pokeball: 'pokeball', commanding: false, reviving: false
        };
    });
    const active = attivi.map(i => ({ moves: squadra[i].mosse.map(m => { const d = dex.moves.get(m); return { move: d.name, id: d.id, pp: d.pp, maxpp: d.pp, target: d.target, disabled: false }; }) }));
    return { active, side: { name: 'CPU', id: 'p2', pokemon }, rqid: 3 };
}
// il log di apertura: la squadra avversaria (p1) con i primi due in campo, la mia (p2)
function apertura(avversari, squadra, attivi) {
    const righe = ['|gen|9', '|gametype|doubles'];
    avversari.forEach(a => righe.push(`|poke|p1|${a}, L50|`));
    squadra.forEach(s => righe.push(`|poke|p2|${s.specie}, L50|`));
    avversari.slice(0, 2).forEach((a, i) => righe.push(`|switch|p1${'ab'[i]}: ${a}|${a}, L50|100/100`));
    attivi.forEach((i, k) => righe.push(`|switch|p2${'ab'[k]}: ${squadra[i].specie}|${squadra[i].specie}, L50|100/100`));
    return righe;
}
const MIA = [
    { specie: 'Garchomp', mosse: ['Dragon Claw', 'Rock Slide', 'Protect', 'Earthquake'] },
    { specie: 'Dragonite', mosse: ['Dragon Claw', 'Extreme Speed', 'Protect', 'Fire Punch'] }
];

test('memoriaDellaPartita: mosse usate (e quelle del primo turno), apertura, chi è sceso in campo, abilità valida e strumento; null se la partita è finita troppo presto', async () => {
    const { sim } = await caricaSim();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, avversario: true });
    assert.equal(ia.memoriaDellaPartita(), null);
    ia.osserva([...apertura(['Incineroar', 'Rillaboom', 'Flutter Mane'], MIA, [0, 1]), '|turn|1']);
    assert.equal(ia.memoriaDellaPartita(), null, 'dopo il solo turno 1 non c\'è niente da ricordare');
    ia.osserva(['|move|p1a: Incineroar|Fake Out|p2a: Garchomp', '|move|p1b: Rillaboom|Grassy Glide|p2b: Dragonite', '|upkeep', '|turn|2',
        '|move|p1a: Incineroar|Flare Blitz|p2a: Garchomp', '|-ability|p1a: Incineroar|Intimidate|boost', '|-ability|p1b: Rillaboom|Mummy|[from] ability: Mummy',
        '|move|p1b: Rillaboom|Grassy Glide|p2b: Dragonite', '|-enditem|p1b: Rillaboom|Sitrus Berry|[eat]', '|move|p1a: Incineroar|Sleep Talk|p1a: Incineroar|[from]Sleep Talk', '|upkeep', '|turn|3']);
    const m = ia.memoriaDellaPartita();
    assert.equal(m.v, Mem.VERSIONE); assert.equal(m.partite, 1);
    const inc = m.specie.incineroar, ril = m.specie.rillaboom, flu = m.specie.fluttermane;
    assert.deepEqual(inc.mosse, { fakeout: 1, flareblitz: 1 }, 'le mosse che partono da sole (Sleep Talk) non contano');
    assert.deepEqual(inc.mosseT1, { fakeout: 1 });
    assert.equal(inc.portato, 1); assert.equal(inc.apertura, 1);
    assert.equal(inc.abilita, 'intimidate');
    assert.deepEqual(ril.mosse, { grassyglide: 2 });
    assert.deepEqual(ril.mosseT1, { grassyglide: 1 });
    assert.equal(ril.abilita, null, 'Mummia presa in prestito non è la sua abilità');
    assert.equal(ril.strumento, 'sitrusberry');
    assert.deepEqual([flu.n, flu.portato, flu.apertura], [1, 0, 0], 'visto solo nell\'anteprima: non portato');
    assert.ok(m.categorie.attacco >= 3, 'le decisioni viste (attacchi)');
    // e finisce nella memoria
    const fusa = Mem.fondi(null, m);
    assert.equal(fusa.specie.incineroar.mosse.fakeout, 1);
});

test('con la memoria i set sono già noti: mosse, abilità e strumento dei Pokémon avversari fin dal primo turno (anche in anteprima)', async () => {
    const { sim } = await caricaSim();
    const memoria = mem({ incineroar: reg({ n: 2, portato: 2, apertura: 2, mosse: { fakeout: 2, flareblitz: 3, knockoff: 1, partingshot: 1 }, mosseT1: { fakeout: 2 }, abilita: 'intimidate', strumento: 'safetygoggles' }) });
    const con = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, memoria });
    const senza = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5 });
    for (const c of [con, senza]) c.osserva([...apertura(['Incineroar', 'Rillaboom', 'Flutter Mane'], MIA, [0, 1]), '|turn|1']);
    const inc = c => c.lati.p1.mons.Incineroar;
    assert.deepEqual([...inc(con).mosseViste].sort(), ['fakeout', 'flareblitz', 'knockoff', 'partingshot']);
    assert.equal(inc(con).abilita, 'intimidate'); assert.equal(inc(con).strumento, 'safetygoggles');
    assert.equal(inc(senza).mosseViste.size, 0); assert.equal(inc(senza).abilita, null);
    // Rillaboom non è nella memoria: come sempre
    assert.equal(con.lati.p1.mons.Rillaboom.mosseViste.size, 0);
    // le mosse note valgono per le previsioni: niente "attacco tipico" presunto al loro posto
    const noteCon = con.mosseAvversario(con.vista(inc(con))).map(m => m.id);
    assert.ok(noteCon.includes('flareblitz') && noteCon.includes('knockoff'));
    // senza memoria nelle opzioni la memoria non c'è, anche se si prova a passarne una di un'altra versione
    assert.equal(IA.crea({ Dex: sim.Dex, lato: 'p2', memoria: { v: 99, specie: {} } }).memoria, null);
    // memoria spenta dai parametri
    assert.equal(IA.crea({ Dex: sim.Dex, lato: 'p2', memoria, parametri: { memoria: 0 } }).memoria, null);
});

async function previsti(memoria, righeDopo) {
    const { sim } = await caricaSim();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, avversario: true, debug: true, ...(memoria ? { memoria } : {}) });
    const r = creaRichiesta(sim.Dex, { squadra: MIA, attivi: [0, 1] });
    ia.osserva([...apertura(['Incineroar', 'Rillaboom', 'Flutter Mane'], MIA, [0, 1]), '|turn|1', ...righeDopo]);
    ia.scegli(r);
    return ia;
}
const conMossa = (ia, id) => ia.ultimoStato.alternative.filter(sc => sc.azioni.some(a => a.lato === 'avv' && a.mossa && a.mossa.id === id)).reduce((t, sc) => t + sc.peso, 0);

test('abitudini per Pokémon: chi apriva sempre con Fake Out è previsto con Fake Out al primo turno in campo, e non più dopo', async () => {
    const memoria = mem({ incineroar: reg({ n: 3, portato: 3, apertura: 3, mosse: { fakeout: 3, flareblitz: 3, knockoff: 1 }, mosseT1: { fakeout: 3 } }) }, { partite: 3 });
    const primo = await previsti(memoria, []);
    assert.ok(conMossa(primo, 'fakeout') > 0.2, `con la memoria, Fake Out al turno 1: ${conMossa(primo, 'fakeout')}`);
    const senza = await previsti(null, []);
    assert.equal(conMossa(senza, 'fakeout'), 0, 'senza memoria non lo prevede');
    // al turno 2 non può più farlo (Fake Out vale solo il primo turno in campo): la memoria non lo fa prevedere
    const secondo = await previsti(memoria, ['|move|p1a: Incineroar|Fake Out|p2a: Garchomp', '|upkeep', '|turn|2']);
    assert.equal(conMossa(secondo, 'fakeout'), 0);
    // nei turni dopo prevede ciò che di solito gioca dopo il primo turno (Flare Blitz, non Knock Off che ha usato una volta sola)
    assert.ok(conMossa(secondo, 'flareblitz') > conMossa(secondo, 'knockoff'));
});

test('abitudini per Pokémon: chi si para sempre è previsto più spesso in Protezione di uno qualunque (e il contrario)', async () => {
    const protegge = mem({ incineroar: reg({ n: 4, portato: 4, mosse: { protect: 6, flareblitz: 1 }, mosseT1: { protect: 3 } }) }, { partite: 4 });
    const attacca = mem({ incineroar: reg({ n: 4, portato: 4, mosse: { flareblitz: 7, protect: 0.2 }, mosseT1: { flareblitz: 3 } }) }, { partite: 4 });
    const pesoCategoria = (ia, cat) => ia.ultimoStato.alternative.filter(sc => sc.categorie[0] === cat).reduce((t, sc) => t + sc.peso, 0);
    const base = await previsti(null, []);
    const p = await previsti(protegge, []);
    const a = await previsti(attacca, []);
    assert.ok(pesoCategoria(p, 'protezione') > pesoCategoria(base, 'protezione') + 0.1, `${pesoCategoria(p, 'protezione')} contro ${pesoCategoria(base, 'protezione')}`);
    assert.ok(pesoCategoria(a, 'protezione') < pesoCategoria(base, 'protezione'), 'chi non si para mai è previsto meno in Protezione');
});

test('anteprima con la memoria: sceglie comunque un team valido, e conoscere chi di solito non porti cambia i pesi senza rompere niente', async () => {
    const { sim } = await caricaSim();
    const squadra = [
        { specie: 'Garchomp', mosse: ['Dragon Claw', 'Rock Slide', 'Protect', 'Earthquake'] }, { specie: 'Dragonite', mosse: ['Dragon Claw', 'Extreme Speed', 'Protect', 'Fire Punch'] },
        { specie: 'Gholdengo', mosse: ['Make It Rain', 'Shadow Ball', 'Protect', 'Trick'] }, { specie: 'Urshifu-Rapid-Strike', mosse: ['Surging Strikes', 'Close Combat', 'Protect', 'Aqua Jet'] },
        { specie: 'Amoonguss', mosse: ['Spore', 'Rage Powder', 'Protect', 'Pollen Puff'] }, { specie: 'Kingambit', mosse: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Swords Dance'] }
    ];
    const memoria = mem({
        incineroar: reg({ n: 3, portato: 3, apertura: 3, mosse: { fakeout: 3, flareblitz: 3 }, mosseT1: { fakeout: 3 } }),
        rillaboom: reg({ n: 3, portato: 3, apertura: 3, mosse: { grassyglide: 3, woodhammer: 2 } }),
        fluttermane: reg({ n: 3, portato: 0 })
    }, { partite: 3 });
    for (const m of [null, memoria]) {
        const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, ...(m ? { memoria: m } : {}) });
        const req = creaRichiesta(sim.Dex, { squadra, attivi: [0, 1] });
        req.teamPreview = true; req.maxChosenTeamSize = 4;
        ia.osserva(['|gen|9', '|gametype|doubles', ...['Incineroar', 'Rillaboom', 'Flutter Mane', 'Amoonguss', 'Landorus-Therian', 'Urshifu'].map(a => `|poke|p1|${a}, L50|`), ...squadra.map(s => `|poke|p2|${s.specie}, L50|`)]);
        const s = ia.scegli(req);
        assert.match(s, /^team [1-6]{4}$/, s);
        assert.equal(new Set(s.slice(5)).size, 4);
    }
});

// ---------- una serie intera ----------
test('una serie di partite vere: la memoria della partita prima fa partire la CPU sapendo i set; senza di lei la partita è identica a prima', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const T = require('../docs/team-cpu.js');
    const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
    const regolamento = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    const caricaJson = async p => JSON.parse(leggi(p));
    const squadre = (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento, caricaJson, quanti: 6, seme: 'memoria-test' })).team.map(t => t.testo);
    const formato = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
    const gioca = async (memoria, teamCpu, seme) => {
        const cpu = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(seme), avversario: true, ...(memoria ? { memoria } : {}) });
        const altro = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(seme + 1) });
        const e = await giocaPartita({ sim, formato, team1: squadre[0], team2: teamCpu, agente1: { tipo: 'cpu', cerebro: altro }, agente2: { tipo: 'cpu', cerebro: cpu }, casuale: creaCasuale(seme + 2), seme: [seme, 2, 3, 4] });
        return { cpu, e };
    };
    const g1 = await gioca(null, squadre[1], 11);
    assert.equal(g1.e.errori.length, 0);
    const v1 = g1.cpu.memoriaDellaPartita();
    assert.ok(v1 && Object.keys(v1.specie).length >= 4, 'dopo la prima partita ha visto i Pokémon dell\'avversario');
    assert.ok(Object.values(v1.specie).some(r => Object.keys(r.mosse).length > 0), 'e delle mosse');
    const memoria = Mem.fondi(null, v1);
    assert.equal(memoria.partite, 1);
    // seconda partita, un altro team della CPU: i Pokémon avversari entrano in campo con i set noti
    const g2 = await gioca(memoria, squadre[2], 12);
    assert.equal(g2.e.errori.length, 0);
    const note = Object.values(g2.cpu.lati.p1.mons).filter(m => m.memoria && m.memoria.mosse && Object.keys(m.memoria.mosse).length);
    assert.ok(note.length >= 1, 'i Pokémon già visti hanno il set noto dall\'inizio');
    // e la memoria della seconda si somma alla prima
    const memoria2 = Mem.fondi(memoria, g2.cpu.memoriaDellaPartita());
    assert.equal(memoria2.partite, 2);
    // senza memoria (null) due partite uguali sono identiche: l'opzione non cambia niente quando manca
    const a = await gioca(null, squadre[3], 21), b = await gioca(null, squadre[3], 21);
    assert.deepEqual(a.e.righe, b.e.righe);
    const vuota = await gioca(Mem.vuota(), squadre[3], 21);
    assert.deepEqual(vuota.e.righe.slice(0, 40), a.e.righe.slice(0, 40), 'una memoria vuota non cambia le prime mosse');
});

// ---------- la pagina ----------
test('la pagina: memoria solo nella prova di un team del Box, azzerata se il team cambia, mai nei Random e nelle palestre', () => {
    const ui = leggi('battle-ui.js'), partita = leggi('cpu-partita.js');
    assert.match(partita, /import '\.\/cpu-memoria\.js'/);
    assert.match(partita, /memoria = null/);
    assert.match(partita, /CpuIa\.crea\(\{ Dex, lato, piano, meccaniche, avversario, memoria \}\)/);
    // l'unico posto con conMemoria: true è la prova di un team (preparaCpu); i Random e le palestre non ce l'hanno
    assert.equal((ui.match(/conMemoria: true/g) || []).length, 1);
    const blocco = (da, a) => ui.slice(ui.indexOf(da), ui.indexOf(a, ui.indexOf(da)));
    assert.ok(blocco('async function preparaCpu(', 'async function preparaCpuRandom(').includes('conMemoria: true') || blocco('async function preparaCpu(', '// Random Battle di Showdown').includes('conMemoria: true'));
    assert.ok(!blocco('async function preparaPalestra(', 'function vestiPalestra').includes('conMemoria'));
    assert.match(ui, /function ricordaLaPartita\(\)[\s\S]*cpu\.palestra \|\| cpu\.random/);
    // si alimenta a fine partita e all'avvio della prossima, e si passa al cervello nuovo
    assert.match(ui, /function mostraFineCpu\(vincitore\) \{[\s\S]*?ricordaLaPartita\(\)/);
    assert.match(ui, /ricordaLaPartita\(\);[^\n]*\n\s*cpu\.cerebro = nuovoCervello\([^\n]*memoria: cpu\.conMemoria \? cpu\.memoria : null/);
    // un team modificato: la memoria non vale più
    assert.match(ui, /cpu\.memoria = null;[^\n]*\n[^\n]*config\.p1\.team = dati\.team\.testo/);
    // non va in Firebase né nel browser: nessun salvataggio della memoria
    assert.ok(!/localStorage[^\n]*memoria|memoria[^\n]*localStorage|ref\([^)]*memoria/i.test(ui));
});
