'use strict';
// La meta della lega (meta-lega.js) e il suo uso nel team building della CPU (team-cpu.js):
//   - si contano Pokémon, mosse, Helping Hand, Protezioni e mosse prioritarie di tutti i team iscritti, senza giocatori, senza accoppiamenti, solo stagioni chiuse;
//   - le soglie di riservatezza sono spente di base (la CPU usa tutto); con { riservatezza: true } tornano: ciò che compare poco non si dà, quote arrotondate;
//   - il builder con la meta sceglie più spesso ciò che la lega gioca, ma non copia mai un team della lega;
//   - le manopole nuove (Helping Hand al massimo uno, Protect non per tutti, mosse prioritarie forti) funzionano e le vecchie si possono rimettere.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../docs/meta-lega.js');
const T = require('../docs/team-cpu.js');
const { caricaSim } = require('./ayuda-sim.js');

// ---------- un piccolo mondo di team scritti a mano ----------
const mon = (nome, mosse, extra = {}) => Object.assign({ nome, mosse, strumento: 'Sitrus Berry', abilita: 'Pressure' }, extra);
function team(...pokemon) { return { id: 't' + Math.random(), nome: 'x', pokemon }; }
const stagione = (stato, formato, giocatori) => ({ info: { status: stato }, teams_iscritti: { [formato]: giocatori } });
const gioc = (...teams) => ({ datiTeams: teams });

function casuale(seme) {
    let a = seme >>> 0 || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// una lega finta: 20 team presi a caso tra 14 Pokémon, ognuno con le sue mosse tipiche
const POPOLARI = {
    Incineroar: ['Fake Out', 'Flare Blitz', 'Knock Off', 'Parting Shot'],
    Rillaboom: ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn'],
    'Flutter Mane': ['Protect', 'Moonblast', 'Shadow Ball', 'Dazzling Gleam'],
    'Urshifu-Rapid-Strike': ['Protect', 'Surging Strikes', 'Close Combat', 'Aqua Jet'],
    'Landorus-Therian': ['Earthquake', 'Rock Slide', 'U-turn', 'Protect'],
    Amoonguss: ['Protect', 'Spore', 'Rage Powder', 'Pollen Puff'],
    Garchomp: ['Protect', 'Earthquake', 'Dragon Claw', 'Rock Slide'],
    Tornadus: ['Tailwind', 'Bleakwind Storm', 'Taunt', 'Protect'],
    'Ogerpon-Wellspring': ['Ivy Cudgel', 'Follow Me', 'Spiky Shield', 'Horn Leech'],
    'Chien-Pao': ['Protect', 'Icicle Crash', 'Sucker Punch', 'Sacred Sword'],
    Kingambit: ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Protect'],
    Gholdengo: ['Make It Rain', 'Shadow Ball', 'Trick', 'Protect'],
    Grimmsnarl: ['Thunder Wave', 'Spirit Break', 'Foul Play', 'Light Screen'],
    'Iron Hands': ['Fake Out', 'Wild Charge', 'Drain Punch', 'Heavy Slam']
};
function legaFinta(n = 20, seme = 5) {
    const rnd = casuale(seme);
    const nomi = Object.keys(POPOLARI);
    return Array.from({ length: n }, () => {
        const scelti = nomi.slice().sort(() => rnd() - 0.5).slice(0, 6);
        return team(...scelti.map(nome => mon(nome, POPOLARI[nome])));
    });
}

// ---------- l'aggregazione ----------
test('leggiTeam: da pokemon[] o dal testo di Showdown (con soprannomi, sesso, strumenti), senza rompersi', () => {
    const t = M.leggiTeam(team(mon('Incineroar', ['Fake Out', 'Flare Blitz']), mon('Rillaboom', ['Grassy Glide'])));
    assert.deepEqual(t.set.map(s => s.specie), ['incineroar', 'rillaboom']);
    assert.deepEqual(t.set[0].mosse, ['fakeout', 'flareblitz']);
    const testo = M.leggiTeam({ testoShowdown: 'Mimmo (Incineroar) (M) @ Safety Goggles\nAbility: Intimidate\n- Fake Out\n- Hidden Power [Fire]\n\nRillaboom @ Assault Vest\nAbility: Grassy Surge\n- Grassy Glide' });
    assert.deepEqual(testo.set.map(s => s.specie), ['incineroar', 'rillaboom']);
    assert.deepEqual(testo.set[0].mosse, ['fakeout', 'hiddenpower']);
    assert.equal(testo.set[0].strumento, 'safetygoggles');
    for (const strano of [null, undefined, {}, { pokemon: [] }, { pokemon: [null, {}] }, { testoShowdown: '   ' }, 'boh', 5]) assert.equal(M.leggiTeam(strano), null);
});

test('aggrega: quote di Pokémon e mosse, classi e media per team; sotto le soglie non si dà niente; quote arrotondate', () => {
    const lega = legaFinta(20);
    const meta = M.aggregaTeam(lega.map(t => M.leggiTeam(t)));
    assert.equal(meta.v, M.VERSIONE);
    assert.equal(meta.team, 20);
    assert.equal(meta.set, 120);
    // ogni Pokémon sta in circa 6/14 dei team
    for (const nome of Object.keys(POPOLARI)) {
        const q = meta.specie[nome.toLowerCase().replace(/[^a-z0-9]/g, '')];
        assert.ok(q > 0.1 && q < 0.8, `${nome}: ${q}`);
        assert.ok(Math.abs(q * 20 - Math.round(q * 20)) < 1e-6, 'arrotondata a un ventesimo');
    }
    assert.deepEqual(Object.keys(meta.mosse.incineroar).sort(), ['fakeout', 'flareblitz', 'knockoff', 'partingshot']);
    assert.equal(meta.mosse.incineroar.fakeout, 1);
    assert.ok(meta.classi.protezione > 0.3 && meta.classi.protezione < 0.8);
    assert.ok(meta.classi.fakeout > 0 && meta.classi.redirezione > 0 && meta.classi.vento > 0 && meta.classi.priorita > 0);
    assert.equal(meta.classi.aiuto, 0);
    assert.ok(meta.squadra.protezioni > 2 && meta.squadra.protezioni < 5);
    assert.ok(meta.squadra.priorita > 0);
    // con la riservatezza: troppo pochi team (sotto otto) niente meta; un Pokémon in meno di tre team non compare, e le sue mosse nemmeno
    const tutti = lega.map(t => M.leggiTeam(t));
    assert.equal(M.aggregaTeam(tutti.slice(0, 7), { riservatezza: true }), null);
    const rari = lega.map(t => M.leggiTeam(t)); rari[0].set.push({ specie: 'smeargle', mosse: ['spore'], strumento: '', abilita: '' }); rari[1].set.push({ specie: 'smeargle', mosse: ['spore'], strumento: '', abilita: '' });
    const m2 = M.aggregaTeam(rari, { riservatezza: true });
    assert.ok(!('smeargle' in m2.specie) && !('smeargle' in m2.mosse));
    assert.ok(Object.values(m2.specie).every(q => Math.abs(q * 20 - Math.round(q * 20)) < 1e-6), 'quote a passi di 0,05');
    // di base niente soglie: anche sette team hanno una meta, e un Pokémon in due team compare con le sue mosse; il minimo di tre team resta (con meno, la meta sarebbe un team)
    assert.ok(M.aggregaTeam(tutti.slice(0, 7)));
    assert.equal(M.aggregaTeam(tutti.slice(0, 2)), null);
    const m3 = M.aggregaTeam(rari);
    assert.equal(m3.specie.smeargle, 0.1);
    assert.equal(m3.mosse.smeargle.spore, 1);
    assert.ok(Object.keys(m3.specie).length >= Object.keys(m2.specie).length);
});

test('aggrega: i pivot (U-turn, Volt Switch, Flip Turn, Parting Shot...) si contano una volta per set, come quota e come media per team', () => {
    const lega = legaFinta(20);
    const meta = M.aggregaTeam(lega.map(t => M.leggiTeam(t)));
    // nella lega finta hanno un pivot Incineroar (Parting Shot), Rillaboom e Landorus-Therian (U-turn): 3 Pokémon su 14
    assert.ok(meta.classi.perno > 0.1 && meta.classi.perno < 0.35, `quota dei set con un pivot: ${meta.classi.perno}`);
    assert.ok(meta.squadra.perno > 0.6 && meta.squadra.perno < 1.8, `pivot per team: ${meta.squadra.perno}`);
    // un set con due pivot conta uno solo
    const doppio = M.aggregaTeam([1, 2, 3].map(() => M.leggiTeam(team(mon('Rillaboom', ['U-turn', 'Volt Switch', 'Grassy Glide']), mon('Garchomp', ['Earthquake'])))));
    assert.equal(doppio.squadra.perno, 1);
    assert.equal(doppio.classi.perno, 0.5);
    // una lega senza pivot
    const nessuno = M.aggregaTeam([1, 2, 3].map(() => M.leggiTeam(team(mon('Garchomp', ['Earthquake', 'Protect'])))));
    assert.equal(nessuno.squadra.perno, 0);
    assert.equal(nessuno.classi.perno, 0);
});

test('aggrega: dal nodo seasons — solo stagioni chiuse, mai la beta né quella in corso; un formato per chiave; senza giocatori né team nell\'uscita', () => {
    const lega = legaFinta(20);
    const dieci = lega.slice(0, 10), altri = lega.slice(10);
    const seasons = {
        s1: stagione('closed', 'VGC Gen 9', { dodo: gioc(...dieci.slice(0, 5)), didi: gioc(...dieci.slice(5)) }),
        s2: stagione('closed', 'VGC Gen 9', { dodo: gioc(...altri) }),
        s3: stagione('playing', 'VGC Gen 9', { dodo: gioc(...legaFinta(20, 99)) }),                  // in corso: non conta
        sbeta: stagione('closed', 'VGC Gen 9', { dodo: gioc(...legaFinta(20, 77)) }),                // beta: non conta
        s4: stagione('closed', 'Piccolo', { luciano: gioc(...lega.slice(0, 3)) }),                        // pochi team: niente meta
        s5: null
    };
    const m = M.aggrega(seasons);
    assert.deepEqual(Object.keys(m).sort(), ['piccolo', 'vgcgen9'], 'senza soglie anche un formato con tre team ha la sua meta');
    assert.deepEqual(Object.keys(M.aggrega(seasons, { riservatezza: true })), ['vgcgen9'], 'con la riservatezza no');
    assert.equal(m.vgcgen9.team, 20, 'solo le due stagioni chiuse (10 + 10)');
    const testo = JSON.stringify(m);
    for (const vietato of ['dodo', 'didi', 'luciano', 'sitrus', 'abilita', 'strumento', 'Piccolo']) assert.ok(!testo.includes(vietato), `non deve comparire "${vietato}"`);
    assert.equal(Object.keys(M.aggrega(seasons, { soloChiuse: false })).length, 2);
    assert.equal(M.aggrega(seasons, { soloChiuse: false }).vgcgen9.team, 40, 'senza il filtro conta anche quella in corso (la beta resta fuori)');
    assert.deepEqual(M.aggrega(null), {});
    assert.deepEqual(M.aggrega({ x: { teams_iscritti: 'boh' } }), {});
    assert.equal(M.chiaveCategoria('VGC Gen 9'), 'vgcgen9');
});

test('nella meta non c\'è niente per ricostruire un team: nessun accoppiamento, nessun set completo', () => {
    const meta = M.aggregaTeam(legaFinta(20).map(t => M.leggiTeam(t)));
    assert.deepEqual(Object.keys(meta).sort(), ['classi', 'mosse', 'set', 'specie', 'squadra', 'team', 'v']);
    for (const q of Object.values(meta.specie)) assert.equal(typeof q, 'number');
    for (const mosse of Object.values(meta.mosse)) assert.ok(Object.keys(mosse).length <= 8);
});

// ---------- il builder ----------
const permessi = { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } };
const VGC = { genRuleType: 'within', genRuleValue: '9', baseTier: 'STANDARD', battleStyle: 'doubles', strutturaSito: 'vgc', vgcGen: 'Gen9', vgcFormat: 'doubles', restrizioni: permessi, categoria: 'VGC Gen 9' };
const leggi = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', p), 'utf8'));
async function squadre(sim, opz = {}) {
    return (await T.squadrePerFormato({ Dex: sim.Dex, TeamValidator: sim.TeamValidator, regolamento: VGC, caricaJson: async p => leggi(p), quanti: 36, seme: 'meta-test', ...opz })).team;
}
const specieDi = t => t.specie.map(x => x.toLowerCase().replace(/[^a-z0-9]/g, ''));
const mosseDi = (sim, t) => sim.Teams.import(t.testo).map(s => ({ specie: s.species.toLowerCase().replace(/[^a-z0-9]/g, ''), mosse: s.moves.map(m => sim.Dex.moves.get(m).id) }));

test('team con la meta: i Pokémon e le mosse che la lega gioca si vedono di più, ma nessun team della lega viene copiato', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const lega = legaFinta(24);
    const meta = M.aggregaTeam(lega.map(t => M.leggiTeam(t)));
    const popolari = new Set(Object.keys(POPOLARI).map(n => n.toLowerCase().replace(/[^a-z0-9]/g, '')));
    const conta = ts => ts.reduce((n, t) => n + specieDi(t).filter(s => popolari.has(s)).length, 0) / ts.length;
    const senza = await squadre(sim);
    const con = await squadre(sim, { meta });
    assert.ok(conta(con) > conta(senza) + 0.5, `Pokémon della lega per team: ${conta(con).toFixed(2)} contro ${conta(senza).toFixed(2)}`);
    // le mosse tipiche su un Pokémon della lega (Incineroar con Fake Out e Knock Off...)
    const quoteMossa = (ts, specie, mossa) => { const tutti = ts.flatMap(t => mosseDi(sim, t)).filter(s => s.specie === specie); return tutti.length ? tutti.filter(s => s.mosse.includes(mossa)).length / tutti.length : null; };
    const knockCon = quoteMossa(con, 'incineroar', 'knockoff');
    assert.ok(knockCon == null || knockCon >= 0.5, `Knock Off su Incineroar: ${knockCon}`);

    // niente copie: nessun team uguale (per specie) a uno della lega, e di solito ne ha in comune al massimo quattro
    const leghe = lega.map(t => new Set(t.pokemon.map(p => p.nome.toLowerCase().replace(/[^a-z0-9]/g, ''))));
    let sommaMax = 0;
    for (const t of con) {
        const mie = specieDi(t);
        const sovrap = leghe.map(l => mie.filter(s => l.has(s)).length);
        const max = Math.max(...sovrap);
        assert.ok(max < 6, `copia di un team della lega: ${t.specie.join(', ')}`);
        sommaMax += max;
    }
    assert.ok(sommaMax / con.length < 4.2, `in media al massimo ${(sommaMax / con.length).toFixed(2)} Pokémon in comune con il team più vicino`);
});

test('team con la meta: quanto Helping Hand e Protect gioca la lega cambia i team (e una meta di un\'altra versione si ignora)', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const conta = (ts, id) => ts.reduce((n, t) => n + mosseDi(sim, t).filter(s => s.mosse.includes(id)).length, 0) / ts.length;
    const metaBase = M.aggregaTeam(legaFinta(24).map(t => M.leggiTeam(t)));
    const senzaAiuto = await squadre(sim, { meta: Object.assign({}, metaBase, { squadra: Object.assign({}, metaBase.squadra, { aiuto: 0 }) }) });
    const moltiAiuti = await squadre(sim, { meta: Object.assign({}, metaBase, { squadra: Object.assign({}, metaBase.squadra, { aiuto: 1.8 }) }) });
    assert.ok(conta(moltiAiuti, 'helpinghand') > conta(senzaAiuto, 'helpinghand'), 'se la lega ne gioca di più, anche la CPU');
    const vecchia = await squadre(sim, { meta: Object.assign({}, metaBase, { v: 99 }) });
    const nessuna = await squadre(sim);
    assert.deepEqual(vecchia.map(t => t.testo), nessuna.map(t => t.testo), 'una meta di un\'altra versione non cambia niente');
});

test('manopole del team: Helping Hand al massimo uno, Protect non per tutti, mosse prioritarie forti; i parametri vecchi rimettono il comportamento di prima', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const stat = ts => {
        let aiuto = 0, maxAiuto = 0, prot = 0, mon = 0, prio = 0;
        const dex = sim.Dex.forGen(9);
        for (const t of ts) {
            let a = 0;
            for (const s of mosseDi(sim, t)) {
                mon++;
                if (s.mosse.includes('helpinghand')) a++;
                if (s.mosse.some(m => dex.moves.get(m).flags && dex.moves.get(m).flags.protect === undefined && ['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct'].includes(m))) prot++;
                prio += s.mosse.filter(m => { const d = dex.moves.get(m); return d.priority > 0 && d.category !== 'Status' && m !== 'fakeout'; }).length;
            }
            aiuto += a; maxAiuto = Math.max(maxAiuto, a);
        }
        return { aiuto: aiuto / ts.length, maxAiuto, prot: prot / mon, prio: prio / ts.length };
    };
    const nuovi = stat(await squadre(sim, { quanti: 48 }));
    const vecchi = stat(await squadre(sim, { quanti: 48, parametriTeam: T.PARAMETRI_TEAM_VECCHI }));
    assert.ok(nuovi.maxAiuto <= 1, `mai più di un Helping Hand per team (${nuovi.maxAiuto})`);
    assert.ok(nuovi.aiuto < 0.7, `Helping Hand a team: ${nuovi.aiuto.toFixed(2)}`);
    assert.ok(vecchi.aiuto > nuovi.aiuto + 0.5, `prima: ${vecchi.aiuto.toFixed(2)}`);
    assert.ok(nuovi.prot < 0.95 && nuovi.prot > 0.6, `Protect sul ${(nuovi.prot * 100).toFixed(0)}% dei Pokémon`);
    assert.ok(vecchi.prot > 0.97, 'prima su tutti');
    assert.ok(nuovi.prio > vecchi.prio + 0.15, `mosse prioritarie a team: ${nuovi.prio.toFixed(2)} contro ${vecchi.prio.toFixed(2)}`);
});

// ---------- il pivot nel doppio ----------
const PERNI_D_ATTACCO = ['uturn', 'voltswitch', 'flipturn'];
function pivotDi(sim, ts) {
    let conPerno = 0, maxPerTeam = 0, senzaAltroAttacco = [];
    const dex = sim.Dex.forGen(9);
    for (const t of ts) {
        let n = 0;
        for (const s of mosseDi(sim, t)) {
            if (!s.mosse.some(m => PERNI_D_ATTACCO.includes(m))) continue;
            n++;
            // chi porta il pivot ha anche un attacco vero (il pivot non è l'unica mossa che fa danno)
            if (!s.mosse.some(m => !PERNI_D_ATTACCO.includes(m) && dex.moves.get(m).category !== 'Status' && dex.moves.get(m).basePower > 0)) senzaAltroAttacco.push(`${s.specie}: ${s.mosse.join(', ')}`);
        }
        if (n) conPerno++;
        maxPerTeam = Math.max(maxPerTeam, n);
    }
    return { quotaTeam: conPerno / ts.length, maxPerTeam, senzaAltroAttacco };
}

test('pivot nel doppio: i team di base ne hanno uno in molti team (mai più di uno), il set ha sempre un attacco vero, e i parametri vecchi non ne mettono', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const nuovi = pivotDi(sim, await squadre(sim, { quanti: 60, seme: 'perno-test' }));
    const vecchi = pivotDi(sim, await squadre(sim, { quanti: 60, seme: 'perno-test', parametriTeam: T.PARAMETRI_TEAM_VECCHI }));
    assert.equal(vecchi.quotaTeam, 0, 'com\'era prima: nessun pivot nel doppio');
    assert.ok(nuovi.quotaTeam >= 0.25 && nuovi.quotaTeam <= 0.85, `team con un pivot: ${(nuovi.quotaTeam * 100).toFixed(0)}%`);
    assert.equal(nuovi.maxPerTeam, 1, 'al massimo uno per team');
    assert.deepEqual(nuovi.senzaAltroAttacco, []);
    // la manopola
    const nessuno = pivotDi(sim, await squadre(sim, { quanti: 60, seme: 'perno-test', parametriTeam: { probPerno: 0 } }));
    const sempre = pivotDi(sim, await squadre(sim, { quanti: 60, seme: 'perno-test', parametriTeam: { probPerno: 1 } }));
    assert.equal(nessuno.quotaTeam, 0);
    assert.ok(sempre.quotaTeam > nuovi.quotaTeam, `${sempre.quotaTeam} contro ${nuovi.quotaTeam}`);
});

test('pivot nel doppio: con la meta, più pivot gioca la lega più ne mette la CPU (e una lega che non ne gioca ne ha meno)', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const metaBase = M.aggregaTeam(legaFinta(24).map(t => M.leggiTeam(t)));
    const conMeta = perno => squadre(sim, { quanti: 60, seme: 'perno-meta', meta: Object.assign({}, metaBase, { squadra: Object.assign({}, metaBase.squadra, { perno }) }) });
    const pochi = pivotDi(sim, await conMeta(0)), tanti = pivotDi(sim, await conMeta(1.8));
    assert.ok(tanti.quotaTeam > pochi.quotaTeam + 0.1, `lega con molti pivot: ${tanti.quotaTeam.toFixed(2)}, lega senza: ${pochi.quotaTeam.toFixed(2)}`);
    assert.ok(tanti.maxPerTeam <= 2, 'mai più di due');
});

test('set dei team in doppio: nessun Pokémon senza un attacco (le mosse di supporto, schermi e Stanza Magica compresi, non riempiono tutti e quattro gli slot)', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const dex = sim.Dex.forGen(9);
    let totale = 0, senzaAttacco = [];
    for (const t of await squadre(sim, { quanti: 60, seme: 'attacchi' })) {
        for (const s of mosseDi(sim, t)) {
            totale++;
            if (!s.mosse.some(m => dex.moves.get(m).category !== 'Status')) senzaAttacco.push(`${s.specie}: ${s.mosse.join(', ')}`);
        }
    }
    assert.ok(totale >= 300);
    assert.deepEqual(senzaAttacco, [], 'ogni Pokémon ha almeno un attacco');
});

test('anti-copia anche con la lega più piccola ammessa (4 team) e senza soglie: nessun team della CPU è una copia di uno della lega', { timeout: 300000 }, async () => {
    const { sim } = await caricaSim();
    const lega = legaFinta(4, 21);
    const meta = M.aggregaTeam(lega.map(t => M.leggiTeam(t)));
    assert.ok(meta && meta.team === 4);
    const con = await squadre(sim, { meta, quanti: 36 });
    const leghe = lega.map(t => new Set(t.pokemon.map(p => p.nome.toLowerCase().replace(/[^a-z0-9]/g, ''))));
    let somma = 0;
    for (const t of con) {
        const mie = specieDi(t);
        const max = Math.max(...leghe.map(l => mie.filter(s => l.has(s)).length));
        assert.ok(max < 6, `copia di un team della lega: ${t.specie.join(', ')}`);
        somma += max;
    }
    assert.ok(somma / con.length < 3.5, `in media al massimo ${(somma / con.length).toFixed(2)} Pokémon in comune con il team più vicino`);
});
