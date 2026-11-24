'use strict';
// Il cervello della CPU con il copione della palestra (cpu-ia.js + cpu-copione.js): difende la palestra giocando con i team del proprietario come li ha giocati lui.
//   - senza copione (o con uno vuoto, rotto, di un'altra versione, spento dai parametri) la CPU è quella di sempre;
//   - in anteprima porta di più i Pokémon che il proprietario porta contro quella squadra e apre con quelli con cui apre lui, in proporzione alle lezioni fatte;
//     un'abitudine chiaramente cattiva non la segue fino in fondo (resta un'anteprima valida: tiene la parte buona e cambia il resto);
//   - in battaglia lo stile (si para, usa mosse di stato, cambia) e la mossa con cui apre al primo turno si avvicinano ai suoi, ma una mossa chiaramente migliore vince lo stesso;
//   - una partita intera con il copione finisce senza errori.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim, giocaPartita, creaCasuale } = require('./ayuda-sim.js');
const IA = require('../docs/cpu-ia.js');
const Cop = require('../docs/cpu-copione.js');
const Mem = require('../docs/cpu-memoria.js');

// ---------- gli attrezzi (come in cpu-memoria.test.js) ----------
const reg = (extra = {}) => Object.assign({ n: 1, portato: 1, apertura: 0, mosse: {}, mosseT1: {}, abilita: null, strumento: null, tera: null }, extra);
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
function apertura(avversari, squadra, attivi) {
    const righe = ['|gen|9', '|gametype|doubles'];
    avversari.forEach(a => righe.push(`|poke|p1|${a}, L50|`));
    squadra.forEach(s => righe.push(`|poke|p2|${s.specie}, L50|`));
    avversari.slice(0, 2).forEach((a, i) => righe.push(`|switch|p1${'ab'[i]}: ${a}|${a}, L50|100/100`));
    attivi.forEach((i, k) => righe.push(`|switch|p2${'ab'[k]}: ${squadra[i].specie}|${squadra[i].specie}, L50|100/100`));
    return righe;
}
// un copione fatto di `lezioni` lezioni uguali: `specie` è quello che la CPU ha visto giocare il proprietario (la memoria della serie)
function copioneDa(specie, { lezioni = 4, portati = [], avversari = [], categorie = { attacco: 20, protezione: 4, cambio: 1, altro: 3 } } = {}) {
    const vista = { v: Mem.VERSIONE, partite: 1, categorie, specie };
    let c = null;
    for (let i = 0; i < lezioni; i++) c = Cop.fondi(c, Cop.lezione({ vista, avversari, portati, turni: 8 }));
    return c;
}

const MIA = [
    { specie: 'Garchomp', mosse: ['Dragon Claw', 'Rock Slide', 'Protect', 'Earthquake'] },
    { specie: 'Dragonite', mosse: ['Dragon Claw', 'Extreme Speed', 'Protect', 'Fire Punch'] }
];
const SQUADRA = [
    { specie: 'Garchomp', mosse: ['Dragon Claw', 'Rock Slide', 'Protect', 'Earthquake'] }, { specie: 'Dragonite', mosse: ['Dragon Claw', 'Extreme Speed', 'Protect', 'Fire Punch'] },
    { specie: 'Gholdengo', mosse: ['Make It Rain', 'Shadow Ball', 'Protect', 'Trick'] }, { specie: 'Urshifu-Rapid-Strike', mosse: ['Surging Strikes', 'Close Combat', 'Protect', 'Aqua Jet'] },
    { specie: 'Amoonguss', mosse: ['Spore', 'Rage Powder', 'Protect', 'Pollen Puff'] }, { specie: 'Kingambit', mosse: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Swords Dance'] }
];
const AVV = ['Incineroar', 'Rillaboom', 'Flutter Mane', 'Amoonguss', 'Landorus-Therian', 'Urshifu'];

// l'anteprima della CPU (squadra di sei, ne porta quattro) con o senza copione
async function anteprima(copione, extra = {}) {
    const { sim } = await caricaSim();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, debug: true, ...extra, ...(copione !== undefined ? { copione } : {}) });
    const req = creaRichiesta(sim.Dex, { squadra: SQUADRA, attivi: [0, 1] });
    req.teamPreview = true; req.maxChosenTeamSize = 4;
    ia.osserva(['|gen|9', '|gametype|doubles', ...AVV.map(a => `|poke|p1|${a}, L50|`), ...SQUADRA.map(s => `|poke|p2|${s.specie}, L50|`)]);
    const scelta = ia.scegli(req);
    return { scelta, ia, ordine: scelta.replace('team ', '').split('').map(Number) };
}
// il primo turno (Garchomp e Dragonite in campo contro Incineroar e Rillaboom)
async function primoTurno(copione, extra = {}) {
    const { sim } = await caricaSim();
    const ia = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: () => 0.5, avversario: true, debug: true, ...extra, ...(copione !== undefined ? { copione } : {}) });
    const r = creaRichiesta(sim.Dex, { squadra: MIA, attivi: [0, 1] });
    ia.osserva([...apertura(['Incineroar', 'Rillaboom', 'Flutter Mane'], MIA, [0, 1]), '|turn|1']);
    const scelta = ia.scegli(r);
    return { scelta, ia };
}
const sorted = x => x.slice().sort((a, b) => a - b);
const nomeSpecie = i => SQUADRA[i - 1].specie;
// i quattro che il proprietario porta (con questi due in apertura), come li ha visti la CPU in una lezione
function vistaDel(portati) {
    const specie = {};
    SQUADRA.forEach(s => { specie[Cop.chiaveSpecie(s.specie)] = reg({ portato: 0 }); });
    portati.forEach((p, i) => {
        const r = specie[Cop.chiaveSpecie(p)];
        r.portato = 1; if (i < 2) r.apertura = 1;
        r.mosse = { protect: 2, [SQUADRA.find(x => x.specie === p).mosse[0].toLowerCase().replace(/[^a-z]/g, '')]: 4 };
    });
    return specie;
}

// ---------- il cervello ----------
test('senza copione, con uno vuoto, rotto, di un\'altra versione o spento dai parametri la CPU è quella di sempre (stesse scelte, stessi valori)', async () => {
    const trained = copioneDa(vistaDel(['Dragonite', 'Gholdengo', 'Urshifu-Rapid-Strike', 'Kingambit']), { portati: ['Dragonite', 'Gholdengo', 'Urshifu-Rapid-Strike', 'Kingambit'], avversari: AVV });
    assert.ok(Cop.fiducia(trained) > 0.9);
    const base = await anteprima(undefined);
    const basePrimo = await primoTurno(undefined);
    assert.equal(base.ia.copione, null); assert.equal(base.ia.fiduciaCopione, 0);
    const casi = { 'copione null': null, 'zero lezioni': Cop.vuoto(), 'versione sbagliata': { v: 99, lezioni: 4, memoria: Mem.vuota(), contro: {} }, 'un numero': 5, 'una stringa': 'boh' };
    for (const [nome, c] of Object.entries(casi)) {
        const a = await anteprima(c), p = await primoTurno(c);
        assert.equal(a.scelta, base.scelta, nome); assert.equal(p.scelta, basePrimo.scelta, nome);
        assert.deepEqual(p.ia.ultimaValutazione, basePrimo.ia.ultimaValutazione, `${nome}: stessi valori`);
        assert.equal(a.ia.fiduciaCopione, 0, nome);
    }
    // un copione allenato ma spento dai parametri
    const spento = await anteprima(trained, { parametri: { copione: 0 } });
    assert.equal(spento.scelta, base.scelta); assert.equal(spento.ia.copione, null);
    // un copione con dentro roba rotta non rompe niente (vale quanto uno senza dati)
    const rotto = await anteprima({ v: 1, lezioni: 4, partite: 4, memoria: 'x', contro: 5 });
    assert.match(rotto.scelta, /^team [1-6]{4}$/);
    // i parametri nuovi ci sono, con valori che non spengono niente
    for (const k of ['copione', 'copioneAnteprima', 'copioneApertura', 'copioneMosse', 'copionePrimoTurno', 'copioneFiducia', 'copioneForza', 'copioneCambi', 'copioneForzaCambi']) assert.ok(IA.PARAMETRI_BASE[k] > 0, k);
});

test('anteprima: con le lezioni fatte porta e apre come il proprietario; con poche lezioni si fida poco', async () => {
    const base = await anteprima(undefined);
    const gruppi = base.ia.ultimaAnteprima.gruppi.slice().sort((a, b) => b.tattico - a.tattico);
    assert.equal(gruppi.length, 15, 'i gruppi di quattro tra sei');
    // l'abitudine: il quarto gruppo per valore tattico (plausibile, non il migliore), con le sue due aperture
    const abitudine = gruppi[3].gruppo;
    const portati = abitudine.map(nomeSpecie);
    assert.notDeepEqual(sorted(abitudine), sorted(base.ordine), 'in partenza la CPU sceglie altro: la prova ha senso');
    const per = L => anteprima(copioneDa(vistaDel(portati), { lezioni: L, portati, avversari: AVV }));
    const [una, due, quattro] = [await per(1), await per(2), await per(4)];
    const bonus = r => r.ia.ultimaAnteprima.gruppi.find(g => sorted(g.gruppo).join('') === sorted(abitudine).join('')).copione;
    assert.ok(bonus(una) > 0 && bonus(una) < bonus(due) && bonus(due) < bonus(quattro), `il bonus cresce con le lezioni: ${bonus(una)} ${bonus(due)} ${bonus(quattro)}`);
    // con tutte le lezioni dell'obiettivo: i quattro e le due aperture sono i suoi
    assert.deepEqual(sorted(quattro.ordine), sorted(abitudine), 'porta i suoi quattro');
    assert.deepEqual(sorted(quattro.ordine.slice(0, 2)), sorted(abitudine.slice(0, 2)), 'apre con le sue due');
    // con una lezione sola (fiducia un quarto) il bonus è piccolo: non basta a spostare la scelta tattica
    assert.deepEqual(una.ordine, base.ordine, 'poche lezioni: come prima');
    // quanto pesa il bonus: lo scarto dalla quota media, quindi le abitudini più forti pesano di più e chi non porta mai è sfavorito
    const tutti = quattro.ia.ultimaAnteprima.gruppi.map(g => g.copione);
    assert.ok(Math.max(...tutti) > 0 && Math.min(...tutti) < 0, 'in su per chi somiglia a lui, in giù per chi non gli somiglia');
    assert.ok(Math.max(...tutti) <= IA.PARAMETRI_BASE.copioneAnteprima * (1 - 4 / 6) + 1e-9, 'al massimo il peso per lo scarto di una quota piena');
});

test('anteprima: un\'abitudine chiaramente cattiva non la segue fino in fondo (tiene la parte buona e cambia il resto)', async () => {
    const base = await anteprima(undefined);
    const gruppi = base.ia.ultimaAnteprima.gruppi.slice().sort((a, b) => b.tattico - a.tattico);
    const pessima = gruppi[gruppi.length - 1];
    assert.ok(gruppi[0].tattico - pessima.tattico > 0.3, 'il gruppo peggiore è davvero peggiore');
    const portati = pessima.gruppo.map(nomeSpecie);
    const r = await anteprima(copioneDa(vistaDel(portati), { lezioni: 4, portati, avversari: AVV }));
    assert.match(r.scelta, /^team [1-6]{4}$/);
    assert.notDeepEqual(sorted(r.ordine), sorted(pessima.gruppo), 'non porta il gruppo peggiore tutto intero');
    const comuni = r.ordine.filter(i => pessima.gruppo.includes(i)).length;
    assert.ok(comuni >= 2, `ma ne tiene una parte (${comuni} su 4): ${r.scelta}`);
    const scelto = r.ia.ultimaAnteprima.gruppi.find(g => sorted(g.gruppo).join('') === sorted(r.ordine).join(''));
    assert.ok(scelto.tattico > pessima.tattico, 'il gruppo scelto è tatticamente meglio del suo');
});

test('anteprima: contro una squadra che il proprietario ha già affrontato conta quello che portava contro di lei', async () => {
    // contro Incineroar e Rillaboom (nei sei) portava sempre il gruppo A; senza di loro il gruppo B: i due gruppi sono scambiati solo dalla squadra avversaria
    const base = await anteprima(undefined);
    const gruppi = base.ia.ultimaAnteprima.gruppi.slice().sort((a, b) => b.tattico - a.tattico);
    const A = gruppi[2].gruppo, B = gruppi[3].gruppo;
    const lezione = (portati, avversari) => ({ vista: { v: Mem.VERSIONE, partite: 1, categorie: { attacco: 12, protezione: 3, cambio: 0, altro: 1 }, specie: vistaDel(portati) }, portati, avversari, turni: 8 });
    let c = null;
    for (let i = 0; i < 4; i++) {
        c = Cop.fondi(c, Cop.lezione(lezione(A.map(nomeSpecie), ['Incineroar', 'Rillaboom', 'Pikachu', 'Raichu', 'Mew', 'Mewtwo'])));
        c = Cop.fondi(c, Cop.lezione(lezione(B.map(nomeSpecie), ['Zubat', 'Golbat', 'Pikachu', 'Raichu', 'Mew', 'Mewtwo'])));
    }
    const r = await anteprima(c);
    const bonus = g => r.ia.ultimaAnteprima.gruppi.find(x => sorted(x.gruppo).join('') === sorted(g).join('')).copione;
    assert.ok(bonus(A) > bonus(B), `contro Incineroar e Rillaboom è più vicino A (${bonus(A).toFixed(3)} contro ${bonus(B).toFixed(3)})`);
});

test('in battaglia: lo stile del proprietario sposta il valore delle mosse (si para, usa mosse di stato) e la mossa con cui apre vale di più al primo turno', async () => {
    const { ia: base } = await primoTurno(undefined);
    const stato = base.ultimoStato.stato0, opzioni = base.ultimoStato.opzioni;     // lo stato del turno e le azioni possibili per slot
    const azione = (slot, nome) => opzioni[slot].find(a => a.nome === nome);
    const valore = (ia, scelta) => ia._bonusCopione(scelta, stato);
    const garchomp = (extra, categorie) => copioneDa({ garchomp: reg({ n: 6, portato: 6, ...extra }) }, { categorie });
    // chi si para sempre al primo turno: Protect vale di più, gli attacchi di meno
    const protegge = IA.crea({ Dex: (await caricaSim()).sim.Dex, lato: 'p2', copione: garchomp({ mosse: { protect: 6 }, mosseT1: { protect: 6 } }) });
    const prot = azione(0, 'Protect'), eq = azione(0, 'Earthquake');
    assert.ok(prot && eq);
    assert.ok(valore(protegge, [prot, null]) > valore(protegge, [eq, null]) + 0.5, `Protect ${valore(protegge, [prot, null])} contro Earthquake ${valore(protegge, [eq, null])}`);
    // chi non si para mai: il contrario
    const attacca = IA.crea({ Dex: (await caricaSim()).sim.Dex, lato: 'p2', copione: garchomp({ mosse: { earthquake: 20, rockslide: 4 }, mosseT1: { earthquake: 6 } }) });
    assert.ok(valore(attacca, [eq, null]) > valore(attacca, [prot, null]) + 0.3);
    // la mossa di apertura: Rock Slide sempre al primo turno vale di più di Dragon Claw (stessa categoria: conta solo il piano di apertura)
    const apre = IA.crea({ Dex: (await caricaSim()).sim.Dex, lato: 'p2', copione: garchomp({ mosse: { rockslide: 6, earthquake: 6 }, mosseT1: { rockslide: 6 } }) });
    const rs = azione(0, 'Rock Slide'), dc = azione(0, 'Dragon Claw');
    assert.ok(valore(apre, [rs, null]) - valore(apre, [dc, null]) > 0.2, 'la mossa di apertura vale di più');
    // senza dati su quel Pokémon (Dragonite) non cambia niente
    assert.equal(valore(apre, [null, azione(1, 'Fire Punch')]), valore(apre, [null, azione(1, 'Protect')]));
    // niente copione, niente bonus
    assert.equal(base._bonusCopione([prot, null], stato), 0);
    // l'apertura vale solo al primo turno in campo: dal secondo turno resta solo lo stile
    apre.turno = 5; for (const m of Object.values(stato.mie)) if (m && m.ref) m.ref.turnoEntrata = 0;
    assert.ok(Math.abs(valore(apre, [rs, null]) - valore(apre, [dc, null])) < 1e-9, 'non è più il primo turno: Rock Slide e Dragon Claw sono due attacchi come gli altri');
});

test('in battaglia: se cambia più (o meno) della lega i cambi valgono di più (o di meno); una mossa chiaramente migliore vince lo stesso', async () => {
    const { sim } = await caricaSim();
    const { ia: base } = await primoTurno(undefined);
    const stato = base.ultimoStato.stato0;
    const cambio = base.ultimoStato.opzioni[0].find(a => a.tipo === 'cambio');
    // questa squadra di due non ha panchina: il cambio lo si prova con un'azione finta
    const finto = cambio || { tipo: 'cambio', slot: 0, verso: 3, nome: 'Altro', testo: 'switch 3' };
    const copioneCambi = (cambi, tot) => copioneDa({ garchomp: reg({ n: 6, portato: 6, mosse: { earthquake: 6 }, mosseT1: { earthquake: 6 } }) }, { categorie: { attacco: tot - cambi, protezione: 0, cambio: cambi, altro: 0 } });
    const cambia = IA.crea({ Dex: sim.Dex, lato: 'p2', copione: copioneCambi(40, 100) }), maiCambia = IA.crea({ Dex: sim.Dex, lato: 'p2', copione: copioneCambi(0, 100) });
    assert.ok(cambia._bonusCopione([finto, null], stato) > 0.05, `chi cambia spesso: ${cambia._bonusCopione([finto, null], stato)}`);
    assert.ok(maiCambia._bonusCopione([finto, null], stato) < -0.05, `chi non cambia mai: ${maiCambia._bonusCopione([finto, null], stato)}`);
    // una mossa chiaramente migliore vince lo stesso: Rock Slide sempre al primo turno non basta contro Earthquake (e Dragon Claw sull'altro)
    const rock = await primoTurno(copioneDa({ garchomp: reg({ n: 6, portato: 6, mosse: { rockslide: 6 }, mosseT1: { rockslide: 6 } }) }));
    const senza = await primoTurno(undefined);
    assert.equal(rock.scelta, senza.scelta);
    // ma un'abitudine piena e costante pesa davvero: se Garchomp si para sempre al primo turno, lo fa
    const para = await primoTurno(copioneDa({ garchomp: reg({ n: 6, portato: 6, mosse: { protect: 6 }, mosseT1: { protect: 6 } }) }));
    assert.match(para.scelta, /^move 3,/, `Protect: ${para.scelta}`);
    // e con poche lezioni (fiducia un quarto) no
    const poche = await primoTurno(copioneDa({ garchomp: reg({ n: 6, portato: 6, mosse: { protect: 6 }, mosseT1: { protect: 6 } }) }, { lezioni: 1 }));
    assert.equal(poche.scelta, senza.scelta);
});

// ---------- una partita vera ----------
test('una partita intera con il copione finisce senza errori, anteprima compresa; e senza copione è uguale a prima', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const T = require('../docs/team-cpu.js');
    const fs = require('node:fs'), path = require('node:path');
    const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
    const regolamento = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi };
    const caricaJson = async p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', p), 'utf8'));
    const squadre = (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento, caricaJson, quanti: 4, seme: 'copione-ia-test' })).team.map(t => t.testo);
    const formato = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
    const nomi = testo => sim.Teams.import(testo).map(s => s.species || s.name);
    const nostri = nomi(squadre[0]);
    // il proprietario ha giocato quattro lezioni: porta i suoi primi quattro e apre con i primi due
    const lez = Cop.lezione({ vista: vistaGenerica(nostri.slice(0, 4), nostri), avversari: nomi(squadre[1]), portati: nostri.slice(0, 4), turni: 8 });
    function vistaGenerica(portati, sei) {
        const specie = {};
        sei.forEach(s => { specie[Cop.chiaveSpecie(s)] = reg({ portato: 0 }); });
        portati.forEach((p, i) => { const r = specie[Cop.chiaveSpecie(p)]; r.portato = 1; if (i < 2) r.apertura = 1; r.mosse = { protect: 2, tailwind: 1, closecombat: 3 }; r.mosseT1 = { protect: 1 }; });
        return { v: Mem.VERSIONE, partite: 1, categorie: { attacco: 12, protezione: 4, cambio: 1, altro: 3 }, specie };
    }
    let copione = null;
    for (let i = 0; i < 4; i++) copione = Cop.fondi(copione, lez);
    assert.ok(Cop.fiducia(copione) >= 1);
    const gioca = async (conCopione, seme) => {
        const cpu = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(seme), avversario: true, ...(conCopione ? { copione } : {}) });
        const altro = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(seme + 1) });
        const e = await giocaPartita({ sim, formato, team1: squadre[1], team2: squadre[0], agente1: { tipo: 'cpu', cerebro: altro }, agente2: { tipo: 'cpu', cerebro: cpu }, casuale: creaCasuale(seme + 2), seme: [seme, 2, 3, 4] });
        return { cpu, e };
    };
    const con = await gioca(true, 31);
    assert.equal(con.e.errori.length, 0, JSON.stringify(con.e.errori.slice(0, 2)));
    assert.ok(con.e.vincitore === 'p1' || con.e.vincitore === 'p2', 'la partita finisce');
    assert.match(con.e.scelte.p2[0].scelta, /^team [1-6]{4}$/);
    const a = await gioca(false, 41), b = await gioca(false, 41);
    const senzaOra = righe => righe.filter(r => !r.startsWith('|t:|'));
    assert.deepEqual(senzaOra(a.e.righe), senzaOra(b.e.righe), 'senza copione due partite uguali sono identiche');
});

// ---------- il collegamento della pagina ----------
test('la pagina: cpu-copione.js si carica prima di cpu-ia.js e il copione arriva al cervello', () => {
    const fs = require('node:fs'), path = require('node:path');
    const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
    const partita = leggi('cpu-partita.js');
    assert.ok(partita.indexOf("import './cpu-copione.js'") > partita.indexOf("import './cpu-memoria.js'"), 'dopo la memoria, che gli serve');
    assert.ok(partita.indexOf("import './cpu-copione.js'") < partita.indexOf("import './cpu-ia.js'"), 'prima del cervello');
    assert.match(partita, /export function nuovoCervello\(lato = 'p2', \{[^}]*copione = null[^}]*\}/);
    assert.match(partita, /CpuIa\.crea\(\{ Dex, lato, piano, meccaniche, avversario, memoria, copione \}\)/);
    // il modulo non usa niente di Node a parte il require della memoria (gira anche nel browser)
    const modulo = leggi('cpu-copione.js');
    assert.match(modulo, /radice\.CpuCopione = fabbrica\(radice\.CpuMemoria\)/);
    assert.match(leggi('cpu-ia.js'), /radice\.CpuIa = fabbrica\([^)]*radice\.CpuMemoria, radice\.CpuCopione\)/);
});
