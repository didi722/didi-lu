'use strict';
// Le scelte di ogni set (functions/statistiche-set.js, "azioni"): quante mosse di ogni tipo e quanti cambi, per lato.
// Sono ciò da cui nasce la personalità dell'allenatore (docs/personalita.js).
//   - le mosse si classificano con docs/azioni-mosse.js (generato dal Dex del simulatore: tools/genera-azioni-mosse.cjs);
//   - un cambio "scelto" è quello a inizio turno: non i Pokémon KO sostituiti, non U-turn, non Roar;
//   - le mosse che partono da sole ([from]: Sleep Talk, Magic Bounce, mossa bloccata...) non sono scelte;
//   - partite vere: i cambi coincidono con quelli scelti dai giocatori, e le mosse con le loro scelte (meno quelle che non partono).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { analizzaSet } = require('../functions/statistiche-set.js');
const A = require('../docs/azioni-mosse.js');
const { caricaSim, giocaPartita, creaCasuale } = require('./ayuda-sim.js');
const T = require('../docs/team-cpu.js');
const IA = require('../docs/cpu-ia.js');

const testa = ['|player|p1|Didi|1|', '|player|p2|Lu|2|', '|poke|p1|Garchomp, M|', '|poke|p1|Gengar, M|', '|poke|p2|Kyurem|', '|poke|p2|Zapdos|',
    '|teamsize|p1|2', '|teamsize|p2|2', '|start', '|switch|p1a: Garchomp|Garchomp, M|100/100', '|switch|p2a: Kyurem|Kyurem|100/100'];

test('classi delle mosse: protezione, recupero, potenziamento, campo, supporto, disturbo; il resto attacca', () => {
    const atteso = {
        Protect: 'protezione', 'Wide Guard': 'protezione', Substitute: 'protezione', Recover: 'recupero', Roost: 'recupero',
        'Swords Dance': 'potenziamento', 'Calm Mind': 'potenziamento', 'Rain Dance': 'campo', 'Trick Room': 'campo', 'Stealth Rock': 'campo', Tailwind: 'campo', Reflect: 'campo',
        'Helping Hand': 'supporto', 'Follow Me': 'supporto', 'Thunder Wave': 'disturbo', Taunt: 'disturbo', Toxic: 'disturbo', Spore: 'disturbo', Haze: 'disturbo',
        Splash: 'altro', Earthquake: 'attacco', 'Fake Out': 'attacco', 'U-turn': 'attacco', 'Make It Rain': 'attacco'
    };
    for (const [mossa, classe] of Object.entries(atteso)) assert.equal(A.classeDi(mossa), classe, mossa);
    assert.equal(A.classeDi('stealthrock'), 'campo', 'anche come id');
    assert.equal(A.classeDi('una mossa che non esiste'), 'attacco');
    assert.deepEqual(A.CLASSI, ['attacco', 'protezione', 'recupero', 'potenziamento', 'campo', 'supporto', 'disturbo', 'altro']);
});

test('docs/ e functions/ hanno lo stesso file delle classi (è generato: si rifà con tools/genera-azioni-mosse.cjs)', () => {
    const a = fs.readFileSync(path.join(__dirname, '..', 'docs', 'azioni-mosse.js'), 'utf8');
    const b = fs.readFileSync(path.join(__dirname, '..', 'functions', 'azioni-mosse.js'), 'utf8');
    assert.equal(a, b);
    assert.match(a, /FILE GENERATO da tools\/genera-azioni-mosse\.cjs/);
});

test('un set a mano: mosse per tipo e cambi scelti, turno per turno', () => {
    const r = analizzaSet([...testa,
        '|turn|1',
        '|move|p1a: Garchomp|Swords Dance|p1a: Garchomp', '|move|p2a: Kyurem|Protect|p2a: Kyurem', '|upkeep',
        '|turn|2',
        '|switch|p2a: Zapdos|Zapdos|100/100',                       // cambio scelto da Lu (a inizio turno)
        '|move|p1a: Garchomp|Earthquake|p2a: Zapdos', '|upkeep',
        '|turn|3',
        '|move|p2a: Zapdos|Roost|p2a: Zapdos', '|move|p1a: Garchomp|Stealth Rock|p2a: Zapdos', '|upkeep',
        '|turn|4',
        '|move|p1a: Garchomp|Earthquake|p2a: Zapdos', '|faint|p2a: Zapdos', '|upkeep',
        '|switch|p2a: Kyurem|Kyurem|100/100',                      // sostituto di un KO: non è una scelta
        '|turn|5', '|move|p1a: Garchomp|Earthquake|p2a: Kyurem', '|win|Didi']);
    assert.equal(r.v, 3);
    assert.deepEqual(r.p1.azioni, { decisioni: 5, mosse: 5, cambi: 0, attacco: 3, protezione: 0, recupero: 0, potenziamento: 1, campo: 1, supporto: 0, disturbo: 0, altro: 0 });
    assert.deepEqual(r.p2.azioni, { decisioni: 3, mosse: 2, cambi: 1, attacco: 0, protezione: 1, recupero: 1, potenziamento: 0, campo: 0, supporto: 0, disturbo: 0, altro: 0 });
});

test('quello che non è una scelta non si conta: mosse con [from], U-turn e Roar, sostituti dei KO, i primi Pokémon in campo', () => {
    const r = analizzaSet([...testa,
        '|turn|1',
        '|move|p1a: Garchomp|U-turn|p2a: Kyurem', '|-damage|p2a: Kyurem|80/100',
        '|switch|p1a: Gengar|Gengar, M|100/100|[from] U-turn',      // dopo una mossa: lo ha fatto la mossa
        '|move|p2a: Kyurem|Roar|p1a: Gengar', '|drag|p1a: Garchomp|Garchomp, M|100/100',
        '|move|p1a: Garchomp|Thunder Wave|p2a: Kyurem|[from]ability: Magic Bounce',      // non l'ha scelta
        '|move|p2a: Kyurem|Outrage|p1a: Garchomp|[from]lockedmove', '|upkeep',
        '|turn|2', '|move|p1a: Garchomp|Earthquake|p2a: Kyurem', '|upkeep']);
    // p1: solo U-turn al turno 1 e Earthquake al turno 2; nessun cambio scelto
    assert.deepEqual([r.p1.azioni.mosse, r.p1.azioni.cambi, r.p1.azioni.attacco, r.p1.azioni.disturbo], [2, 0, 2, 0]);
    // p2: solo Roar (disturbo); Outrage bloccato non conta
    assert.deepEqual([r.p2.azioni.mosse, r.p2.azioni.cambi, r.p2.azioni.disturbo, r.p2.azioni.attacco], [1, 0, 1, 0]);
});

test('doppio: due Pokémon per lato, i cambi e le mosse di ciascuno contano', () => {
    const r = analizzaSet(['|player|p1|Didi|1|', '|player|p2|Lu|2|', '|start',
        '|switch|p1a: A|Garchomp, M|100/100', '|switch|p1b: B|Gengar, M|100/100', '|switch|p2a: C|Kyurem|100/100', '|switch|p2b: D|Zapdos|100/100',
        '|turn|1',
        '|move|p1a: A|Protect|p1a: A', '|move|p1b: B|Helping Hand|p1a: A', '|move|p2a: C|Icy Wind|p1a: A', '|move|p2b: D|Tailwind|', '|upkeep',
        '|turn|2',
        '|switch|p1b: E|Whimsicott, M|100/100', '|move|p1a: A|Earthquake|p2a: C', '|move|p2a: C|Freeze-Dry|p1a: A', '|upkeep']);
    assert.deepEqual([r.p1.azioni.protezione, r.p1.azioni.supporto, r.p1.azioni.cambi, r.p1.azioni.attacco, r.p1.azioni.decisioni], [1, 1, 1, 1, 4]);
    assert.deepEqual([r.p2.azioni.attacco, r.p2.azioni.campo, r.p2.azioni.cambi, r.p2.azioni.decisioni], [2, 1, 0, 3]);
});

test('log vuoto o rovinato: azioni a zero, mai un errore; i valori sono tutti numeri interi (Firebase)', () => {
    for (const log of ['', [], ['|move|', '|switch|', '|move|p9z: ?|Protect|', '|turn|x', 'testo']]) {
        const r = analizzaSet(log);
        for (const lato of ['p1', 'p2']) {
            for (const [k, v] of Object.entries(r[lato].azioni)) assert.ok(Number.isInteger(v) && v >= 0, `${lato}.${k}`);
            assert.equal(r[lato].azioni.decisioni, r[lato].azioni.mosse + r[lato].azioni.cambi);
        }
    }
});

// ---------- partite vere ----------
const leggi = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', p), 'utf8'));
const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
const FORMATI = [
    ['singolo', { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles', strutturaSito: 'custom', restrizioni: permessi }, 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod'],
    ['doppio', { genRuleType: 'within', genRuleValue: '9', baseTier: 'OU', battleStyle: 'doubles', strutturaSito: 'custom', generationalMechanics: true, restrizioni: permessi }, 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod']
];
for (const [nome, reg, formato] of FORMATI) {
    test(`partite vere (${nome}): i cambi coincidono con quelli scelti, le mosse con le scelte che sono partite`, { timeout: 180000 }, async () => {
        const { sim } = await caricaSim();
        const squadre = await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: reg, caricaJson: async p => leggi(p), quanti: 6 });
        let scelteMosse = 0, contate = 0, classi = {};
        for (let i = 0; i < 6; i++) {
            const t1 = squadre.team[i % 6], t2 = squadre.team[(i + 2) % 6];
            const e = await giocaPartita({ sim, formato, team1: t1.testo, team2: t2.testo, casuale: creaCasuale(i + 1), seme: [i + 1, 5, 9, 13],
                agente1: { tipo: 'cpu', cerebro: IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 1) }) },
                agente2: i % 2 ? { tipo: 'casuale' } : { tipo: 'cpu', cerebro: IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 9) }) } });
            const r = analizzaSet(e.righe);
            for (const lato of ['p1', 'p2']) {
                let cambi = 0, mosse = 0;
                for (const s of e.scelte[lato]) {
                    if (s.richiesta.teamPreview || s.richiesta.forceSwitch || !s.richiesta.active) continue;
                    for (const c of s.scelta.split(',').map(x => x.trim())) { if (c.startsWith('switch')) cambi++; else if (c.startsWith('move')) mosse++; }
                }
                assert.equal(r[lato].azioni.cambi, cambi, `partita ${i} ${lato}: cambi`);
                assert.ok(r[lato].azioni.mosse <= mosse, `partita ${i} ${lato}: più mosse contate (${r[lato].azioni.mosse}) di quelle scelte (${mosse})`);
                scelteMosse += mosse; contate += r[lato].azioni.mosse;
                for (const k of A.CLASSI) classi[k] = (classi[k] || 0) + r[lato].azioni[k];
            }
        }
        // alcune scelte non partono: soprattutto chi è più lento e viene messo KO prima di muovere (nei set brevi, uno su cinque), poi sonno e
        // tentennamenti. Dal log non si possono sapere: non si contano. Ma non devono essere di più.
        assert.ok(contate >= scelteMosse * 0.7, `contate ${contate} su ${scelteMosse} scelte`);
        assert.ok(classi.attacco > 0 && classi.attacco > contate * 0.4, JSON.stringify(classi));
    });
}
