'use strict';
// uso-globale.js: quali Pokémon si usano di più nella lega, e cosa si gioca su ognuno (solo dai team iscritti alle stagioni)
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../docs/uso-globale.js');

const mon = (nome, strumento, abilita, natura, mosse, extra = {}) => ({ nome, strumento, abilita, natura, mosse, ...extra });
const team = (id, nome, pokemon) => ({ id, nome, pokemon });
const iscr = (...teams) => ({ datiTeams: teams, teamIds: teams.map(t => t.id), count: teams.length });

function dati() {
    const garchomp = (item, mosse, nat = 'Jolly') => mon('Garchomp', item, 'Rough Skin', nat, mosse);
    return {
        players: {},
        seasons: {
            sbeta: { teams_iscritti: { OU: { didi: iscr(team('b1', 'Beta', [mon('Magikarp', 'None', 'Swift Swim', 'Calm', ['Splash'])])) } } },
            s1: {
                teams_iscritti: {
                    OU: {
                        didi: iscr(team('t1', 'Alfa', [garchomp('Rocky Helmet', ['Earthquake', 'Stealth Rock', 'Swords Dance', 'Dragon Claw']), mon('Gholdengo', 'Air Balloon', 'Good as Gold', 'Timid', ['Make It Rain', 'Shadow Ball', '', '-'])])),
                        lu: iscr(team('t2', 'Beta', [garchomp('Life Orb', ['Earthquake', 'Outrage', 'Swords Dance', 'Fire Fang'], 'Adamant'), mon('Kingambit', 'Leftovers', 'Defiant', 'Adamant', ['Kowtow Cleave', 'Sucker Punch'])]))
                    },
                    'VGC Reg G': {
                        didi: iscr(team('t3', 'Gamma', [mon('Incineroar', 'Safety Goggles', 'Intimidate', 'Careful', ['Fake Out', 'Knock Off']), mon('Rillaboom', 'Assault Vest', 'Grassy Surge', 'Adamant', ['Grassy Glide']), mon('Pippo (Chi-Yu)', 'Choice Specs', 'Beads of Ruin', 'Timid', ['Heat Wave'], { tera: 'Fire' })]))
                    }
                }
            },
            s2: {
                teams_iscritti: {
                    OU: { didi: iscr(team('t1', 'Alfa', [garchomp('Rocky Helmet', ['Earthquake', 'Stealth Rock', 'Dragon Tail', 'Spikes'])])) }
                }
            }
        }
    };
}

test('uso: percentuale dei team iscritti che contengono il Pokémon; la beta non conta, lo stesso team in due stagioni conta due volte', () => {
    const r = U.calcola(dati());
    assert.equal(r.totali.team, 4, 'Alfa (s1 e s2), Beta, Gamma; il team della beta è escluso');
    assert.equal(r.totali.giocatori, 2);
    const g = r.specie.find(s => s.specieId === 'garchomp');
    assert.equal(g.team, 3);
    assert.equal(g.perc, 75);
    assert.equal(g.giocatori, 2);
    assert.equal(r.specie[0].specieId, 'garchomp', 'il più usato per primo');
    assert.equal(r.specie.find(s => s.specieId === 'magikarp'), undefined);
    assert.equal(r.specie.find(s => s.specieId === 'chiyu').nome, 'Chi-Yu', 'il soprannome non conta: è la specie');
});

test('uso: con la beta scelta si vede solo la beta, con una stagione solo quella', () => {
    assert.equal(U.calcola(dati(), { stagione: 'sbeta' }).totali.team, 1);
    const s2 = U.calcola(dati(), { stagione: 's2' });
    assert.equal(s2.totali.team, 1);
    assert.deepEqual(s2.specie.map(s => s.specieId), ['garchomp']);
    assert.deepEqual(U.calcola(dati(), { stagione: 's1' }).formati, ['OU', 'VGC Reg G']);
});

test('uso: per formato (filtro) le percentuali sono sui team di quel formato, e il confronto tra formati resta disponibile', () => {
    const ou = U.calcola(dati(), { formato: 'OU' });
    assert.equal(ou.totali.team, 3);
    assert.equal(ou.specie.find(s => s.specieId === 'garchomp').perc, 100);
    assert.equal(ou.specie.find(s => s.specieId === 'incineroar'), undefined);
    const tutti = U.calcola(dati());
    assert.equal(tutti.perFormato.OU.team, 3);
    assert.equal(tutti.perFormato['VGC Reg G'].team, 1);
    assert.equal(tutti.perFormato['VGC Reg G'].specie[0].perc, 100);
    assert.deepEqual(tutti.perFormato.OU.specie[0], { specieId: 'garchomp', nome: 'Garchomp', team: 3, perc: 100 });
    const g = tutti.specie.find(s => s.specieId === 'garchomp');
    assert.deepEqual(g.formati, [{ formato: 'OU', team: 3, perc: 100 }]);
    const inc = tutti.specie.find(s => s.specieId === 'incineroar');
    assert.deepEqual(inc.formati, [{ formato: 'VGC Reg G', team: 1, perc: 100 }]);
});

test('mosse, strumenti, abilità e nature: percentuali sui set di quel Pokémon, senza voci vuote', () => {
    const g = U.calcola(dati()).specie.find(s => s.specieId === 'garchomp');
    assert.equal(g.istanze, 3);
    const mosse = Object.fromEntries(g.mosse.map(m => [m.nome, m.perc]));
    assert.equal(mosse.Earthquake, 100);
    assert.equal(mosse['Swords Dance'], 66.7);
    assert.equal(mosse['Stealth Rock'], 66.7);
    assert.equal(g.mosse[0].nome, 'Earthquake');
    assert.deepEqual(g.strumenti.map(s => [s.nome, s.perc]), [['Rocky Helmet', 66.7], ['Life Orb', 33.3]]);
    assert.deepEqual(g.abilita.map(s => [s.nome, s.perc]), [['Rough Skin', 100]]);
    assert.deepEqual(g.nature.map(s => [s.nome, s.perc]), [['Jolly', 66.7], ['Adamant', 33.3]]);
    const gh = U.calcola(dati()).specie.find(s => s.specieId === 'gholdengo');
    assert.deepEqual(gh.mosse.map(m => m.nome), ['Make It Rain', 'Shadow Ball'], 'le caselle vuote o "-" non sono mosse');
    const chi = U.calcola(dati()).specie.find(s => s.specieId === 'chiyu');
    assert.deepEqual(chi.tera.map(t => t.nome), ['Fire']);
    assert.deepEqual(U.calcola(dati()).specie.find(s => s.specieId === 'rillaboom').tera, [], 'senza Tera Type non c\'è nulla');
});

test('compagni: i Pokémon che compaiono più spesso nello stesso team', () => {
    const g = U.calcola(dati()).specie.find(s => s.specieId === 'garchomp');
    const c = Object.fromEntries(g.compagni.map(x => [x.specieId, x]));
    assert.equal(c.gholdengo.n, 1, 'solo l\'Alfa di s1 ha Gholdengo: l\'Alfa di s2 ha il solo Garchomp');
    assert.equal(c.gholdengo.perc, 33.3);
    assert.equal(c.kingambit.n, 1);
    assert.equal(c.incineroar, undefined, 'un altro formato, un altro team');
});

test('battaglia: i set portati, vinti e i KO si sommano per specie, dai Pokémon dei team di Statistiche', () => {
    const battaglia = [
        { specieId: 'garchomp', setConDati: 10, portato: 8, setPortatoVinti: 5, setPortatoPersi: 3, koFatti: 12 },
        { specieId: 'garchomp', setConDati: 6, portato: 2, setPortatoVinti: 2, setPortatoPersi: 0, koFatti: 3 },
        { specie: 'Kingambit', setConDati: 4, portato: 0, setPortatoVinti: 0, setPortatoPersi: 0, koFatti: 0 }
    ];
    const r = U.calcola(dati(), {}, battaglia);
    const g = r.specie.find(s => s.specieId === 'garchomp');
    assert.deepEqual(g.battaglia, { setConDati: 16, portato: 10, vinti: 7, persi: 3, percVinti: 70, koFatti: 15, koPerSet: 1.5 });
    assert.equal(r.specie.find(s => s.specieId === 'kingambit').battaglia, null, 'mai portato: nessun dato di battaglia');
    assert.equal(r.specie.find(s => s.specieId === 'gholdengo').battaglia, null);
});

test('iscrizioni senza la fotografia dei team: si usano i team del Box del giocatore; dati strani non rompono nulla', () => {
    const d = {
        players: { didi: { teams: { a1: { nome: 'Dal Box', pokemon: [mon('Rotom-Wash', 'Leftovers', 'Levitate', 'Bold', ['Hydro Pump'])] } } } },
        seasons: { s1: { teams_iscritti: { OU: { Didi: { teamIds: ['a1'], count: 1 }, lu: { count: 1 }, gio: null }, VGC: null } } }
    };
    const r = U.calcola(d);
    assert.deepEqual(r.specie.map(s => s.specieId), ['rotomwash']);
    assert.equal(r.totali.team, 1);
    assert.deepEqual(U.calcola({}), { filtro: { stagione: 'all', formato: 'all' }, formati: [], totali: { team: 0, pokemon: 0, giocatori: 0, specie: 0 }, specie: [], perFormato: {} });
    assert.equal(U.calcola(null).totali.team, 0);
    // anche i team salvati come oggetto invece che come array (è così che Firebase restituisce gli array)
    const comeOggetto = { seasons: { s1: { teams_iscritti: { OU: { didi: { datiTeams: { 0: team('x', 'X', { 0: mon('Ditto', 'Choice Scarf', 'Imposter', 'Jolly', { 0: 'Transform' }) }) } } } } } } };
    assert.equal(U.calcola(comeOggetto).specie[0].mosse[0].nome, 'Transform');
});

test('stats.html: la scheda "Usage" è collegata (tag, script e modulo)', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'stats.html'), 'utf8');
    assert.match(html, /data-tab="usage"/);
    assert.match(html, /<script src="uso-globale\.js"><\/script>/);
    const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'stats.js'), 'utf8');
    assert.match(js, /UsoGlobale\.calcola\(STATO\.dati/);
});
