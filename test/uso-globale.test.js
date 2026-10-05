'use strict';
// uso-globale.js: quali Pokémon si usano di più nella lega, e cosa si gioca su ognuno (solo dai team iscritti alle stagioni
// che hanno giocato almeno un set ufficiale: un team appena iscritto non si vede, o l'uso rivelerebbe i team agli avversari)
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../docs/uso-globale.js');

const mon = (nome, strumento, abilita, natura, mosse, extra = {}) => ({ nome, strumento, abilita, natura, mosse, ...extra });
const team = (id, nome, pokemon) => ({ id, nome, pokemon });
const iscr = (...teams) => ({ datiTeams: teams, teamIds: teams.map(t => t.id), count: teams.length });
// un match salvato (di default 2-1: tre set giocati) e uno showdown che li raccoglie
const match = (p1, t1, p2, t2, extra = {}) => ({ player1Id: p1, team1: t1, player2Id: p2, team2: t2, p1score: 2, p2score: 1, ...extra });
const showdown = (categoria, ...matches) => ({ info: { categoria }, matches: Object.fromEntries(matches.map((m, i) => [`match${i + 1}`, m])) });

function dati() {
    const garchomp = (item, mosse, nat = 'Jolly') => mon('Garchomp', item, 'Rough Skin', nat, mosse);
    return {
        players: {},
        seasons: {
            sbeta: {
                teams_iscritti: { OU: { didi: iscr(team('b1', 'Beta', [mon('Magikarp', 'None', 'Swift Swim', 'Calm', ['Splash'])])) } },
                showdowns: { sd1: showdown('OU', match('didi', 'Beta', 'lu', 'Altro')) }
            },
            s1: {
                showdowns: { sd1: showdown('OU', match('didi', 'Alfa', 'lu', 'Beta')), sd2: showdown('VGC Reg G', match('didi', 'Gamma', 'ada', 'Delta')) },
                teams_iscritti: {
                    OU: {
                        // iscritto ma mai sceso in campo: non deve comparire da nessuna parte
                        gio: iscr(team('t9', 'Segreta', [mon('Dragonite', 'Choice Band', 'Inner Focus', 'Adamant', ['Outrage', 'Extreme Speed']), mon('Garchomp', 'Choice Band', 'Rough Skin', 'Adamant', ['Outrage', 'Earthquake'])])),
                        didi: iscr(team('t1', 'Alfa', [garchomp('Rocky Helmet', ['Earthquake', 'Stealth Rock', 'Swords Dance', 'Dragon Claw']), mon('Gholdengo', 'Air Balloon', 'Good as Gold', 'Timid', ['Make It Rain', 'Shadow Ball', '', '-'])])),
                        lu: iscr(team('t2', 'Beta', [garchomp('Life Orb', ['Earthquake', 'Outrage', 'Swords Dance', 'Fire Fang'], 'Adamant'), mon('Kingambit', 'Leftovers', 'Defiant', 'Adamant', ['Kowtow Cleave', 'Sucker Punch'])]))
                    },
                    'VGC Reg G': {
                        didi: iscr(team('t3', 'Gamma', [mon('Incineroar', 'Safety Goggles', 'Intimidate', 'Careful', ['Fake Out', 'Knock Off']), mon('Rillaboom', 'Assault Vest', 'Grassy Surge', 'Adamant', ['Grassy Glide']), mon('Pippo (Chi-Yu)', 'Choice Specs', 'Beads of Ruin', 'Timid', ['Heat Wave'], { tera: 'Fire' })]))
                    }
                }
            },
            s2: {
                // maiuscole e spazi nel nome del team non contano
                showdowns: { sd1: showdown('OU', match('lu', 'Beta', 'didi', '  ALFA ')) },
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
        seasons: { s1: { showdowns: { sd: showdown('OU', match('didi', 'dal box', 'lu', 'Altro')) }, teams_iscritti: { OU: { Didi: { teamIds: ['a1'], count: 1 }, lu: { count: 1 }, gio: null }, VGC: null } } }
    };
    const r = U.calcola(d);
    assert.deepEqual(r.specie.map(s => s.specieId), ['rotomwash']);
    assert.equal(r.totali.team, 1);
    assert.deepEqual(U.calcola({}), { filtro: { stagione: 'all', formato: 'all' }, formati: [], totali: { team: 0, pokemon: 0, giocatori: 0, specie: 0 }, specie: [], perFormato: {} });
    assert.equal(U.calcola(null).totali.team, 0);
    // anche i team salvati come oggetto invece che come array (è così che Firebase restituisce gli array)
    const comeOggetto = { seasons: { s1: { showdowns: { 0: { matches: { 0: match('didi', 'X', 'lu', 'Y') } } }, teams_iscritti: { OU: { didi: { datiTeams: { 0: team('x', 'X', { 0: mon('Ditto', 'Choice Scarf', 'Imposter', 'Jolly', { 0: 'Transform' }) }) } } } } } } };
    assert.equal(U.calcola(comeOggetto).specie[0].mosse[0].nome, 'Transform');
});

test('stats.html: la scheda "Usage" è collegata (tag, script e modulo)', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'stats.html'), 'utf8');
    assert.match(html, /data-tab="usage"/);
    assert.match(html, /<script src="uso-globale\.js"><\/script>/);
    const js = fs.readFileSync(path.join(__dirname, '..', 'docs', 'stats.js'), 'utf8');
    assert.match(js, /UsoGlobale\.calcola\(STATO\.dati/);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Solo i team che hanno giocato almeno un set ufficiale
// ---------------------------------------------------------------------------------------------------------------------------

test('un team iscritto che non è mai sceso in campo non conta: né i suoi Pokémon, né le sue mosse, né il suo formato', () => {
    const r = U.calcola(dati());
    assert.equal(r.specie.find(s => s.specieId === 'dragonite'), undefined, 'la Segreta di Gio non ha giocato');
    const g = r.specie.find(s => s.specieId === 'garchomp');
    assert.equal(g.istanze, 3, 'il Garchomp della Segreta non è tra i set');
    assert.ok(!g.strumenti.some(s => s.nome === 'Choice Band'));
    assert.equal(g.mosse.find(m => m.nome === 'Outrage').perc, 33.3, 'solo quello di Lu: con la Segreta sarebbe il 50%');
    assert.equal(r.totali.giocatori, 2, 'Gio non ha giocato con nessun team');
    assert.equal(r.perFormato.OU.team, 3);
});

test('una stagione appena aperta (iscrizioni senza nessun match) non mostra niente', () => {
    const aperta = { seasons: { s3: { teams_iscritti: { OU: { didi: iscr(team('t1', 'Appena iscritto', [mon('Garchomp', 'Rocky Helmet', 'Rough Skin', 'Jolly', ['Earthquake'])])) } } } } };
    const r = U.calcola(aperta);
    assert.deepEqual(r.specie, []);
    assert.deepEqual(r.formati, [], 'nemmeno il formato: dice che qualcuno si è iscritto');
    assert.equal(r.totali.team, 0);
    assert.deepEqual(U.calcola(aperta, { stagione: 's3', formato: 'OU' }).specie, []);
    assert.deepEqual(U.calcola(aperta, { stagione: 's3' }).formati, []);
});

test('il team conta dal primo set giocato, in quella stagione e in quel formato', () => {
    const iscritto = (...f) => ({ OU: { didi: iscr(team('t1', 'Alfa', [mon('Garchomp', 'Rocky Helmet', 'Rough Skin', 'Jolly', ['Earthquake'])])) }, ...Object.fromEntries(f) });
    const con = sd => ({ seasons: { s1: { teams_iscritti: iscritto(), showdowns: sd } } });
    const conta = sd => U.calcola(con(sd)).totali.team;
    // finché il match non è salvato (nessun punteggio) o non ha un set giocato, non conta
    assert.equal(conta({}), 0);
    assert.equal(conta({ a: showdown('OU', match('didi', 'Alfa', 'lu', 'X', { p1score: null, p2score: null })) }), 0, 'match senza punteggio');
    assert.equal(conta({ a: showdown('OU', { player1Id: 'didi', team1: 'Alfa', player2Id: 'lu', team2: 'X' }) }), 0, 'match senza punteggio');
    assert.equal(conta({ a: showdown('OU', match('didi', 'Alfa', 'lu', 'X', { p1score: 0, p2score: 0 })) }), 0, '0-0: nessun set');
    assert.equal(conta({ a: showdown('OU', match('didi', 'Alfa', 'lu', 'X', { p1score: '0', p2score: '0' })) }), 0, 'punteggi come testo');
    // un solo set basta, da qualunque lato del match
    assert.equal(conta({ a: showdown('OU', match('didi', 'Alfa', 'lu', 'X', { p1score: 1, p2score: 0 })) }), 1);
    assert.equal(conta({ a: showdown('OU', match('lu', 'X', 'didi', 'Alfa', { p1score: 0, p2score: 1 })) }), 1);
    assert.equal(conta({ a: showdown('OU', match('didi', 'Alfa', 'lu', 'X', { p1score: '1', p2score: '2' })) }), 1);
    // il match deve essere di quel giocatore con quel team: un altro giocatore, o un altro team, no
    assert.equal(conta({ a: showdown('OU', match('lu', 'Alfa', 'gio', 'X')) }), 0, 'un altro giocatore con un team dello stesso nome');
    assert.equal(conta({ a: showdown('OU', match('didi', 'Altro team', 'lu', 'X')) }), 0);
    // il formato: lo stesso team giocato in un altro formato non lo fa comparire in questo
    assert.equal(conta({ a: showdown('VGC', match('didi', 'Alfa', 'lu', 'X')) }), 0);
    assert.equal(conta({ a: { info: {}, matches: { m: match('didi', 'Alfa', 'lu', 'X', { categoria: 'OU' }) } } }), 1, 'il formato scritto nel match');
    assert.equal(conta({ a: { info: { categoria: 'VGC' }, matches: { m: match('didi', 'Alfa', 'lu', 'X', { categoria: 'OU' }) } } }), 1, 'il match batte lo showdown');
    assert.equal(conta({ a: { matches: { m: match('didi', 'Alfa', 'lu', 'X') } } }), 1, 'vecchi match senza formato: valgono per il giocatore e il team');
    // maiuscole, spazi e nomi nella forma { valore }
    assert.equal(conta({ a: showdown('ou', match(' DIDI ', ' alfa', 'lu', 'X')) }), 1);
    assert.equal(conta({ a: showdown('OU', match('didi', { valore: 'Alfa' }, 'lu', 'X')) }), 1);
    // dati strani non rompono niente
    assert.equal(conta({ a: null, b: { matches: null }, c: { matches: { m: null } }, d: showdown('OU', match('didi', '', 'lu', 'X')) }), 0);
});

test('il match di una stagione non fa comparire lo stesso team iscritto a un\'altra stagione', () => {
    const t = () => iscr(team('t1', 'Alfa', [mon('Garchomp', 'Rocky Helmet', 'Rough Skin', 'Jolly', ['Earthquake'])]));
    const d = {
        seasons: {
            s1: { teams_iscritti: { OU: { didi: t() } }, showdowns: { a: showdown('OU', match('didi', 'Alfa', 'lu', 'X')) } },
            s2: { teams_iscritti: { OU: { didi: t() } } }   // iscritto di nuovo, ancora nessun set
        }
    };
    assert.equal(U.calcola(d).totali.team, 1, 'solo la s1');
    assert.equal(U.calcola(d, { stagione: 's2' }).totali.team, 0);
    assert.deepEqual(U.calcola(d, { stagione: 's2' }).formati, []);
    assert.equal(U.calcola(d, { stagione: 's1' }).totali.team, 1);
    d.seasons.s2.showdowns = { a: showdown('OU', match('lu', 'X', 'didi', 'Alfa')) };
    assert.equal(U.calcola(d).totali.team, 2, 'ora ha giocato anche in s2: conta due volte');
});

test('la beta resta fuori da "tutte le stagioni" anche se i suoi team hanno giocato; scelta, si vede', () => {
    const r = U.calcola(dati(), { stagione: 'sbeta' });
    assert.equal(r.totali.team, 1);
    assert.deepEqual(r.specie.map(s => s.specieId), ['magikarp']);
    assert.equal(U.calcola(dati()).specie.find(s => s.specieId === 'magikarp'), undefined);
});

test('stats.html e stats.js dicono che l\'uso conta solo i team che hanno giocato', () => {
    const doc = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
    const html = doc('stats.html'), js = doc('stats.js');
    assert.match(html, /have played at least one official set/);
    assert.doesNotMatch(html, /Teams that were never registered to a season do not count/);
    assert.match(js, /played at least one official set/);
    assert.doesNotMatch(js, /registered team/, 'nessun testo parla ancora di team iscritti');
});

// ---------------------------------------------------------------------------------------------------------------------------
// Stagioni a scheda chiusa: i Pokémon contano, i loro set no (gli avversari non li vedono nemmeno nella pagina dei match)
// ---------------------------------------------------------------------------------------------------------------------------

function datiSchedaChiusa(openSheet) {
    const info = openSheet === undefined ? {} : { open_sheet: openSheet };
    return {
        seasons: {
            // chiusa: Didi ha giocato con Garchomp + Kingambit
            s1: {
                info,
                showdowns: { a: showdown('OU', match('didi', 'Alfa', 'lu', 'Beta')) },
                teams_iscritti: { OU: { didi: iscr(team('t1', 'Alfa', [mon('Garchomp', 'Rocky Helmet', 'Rough Skin', 'Jolly', ['Earthquake', 'Stealth Rock']), mon('Kingambit', 'Leftovers', 'Defiant', 'Adamant', ['Kowtow Cleave'])])) } }
            },
            // aperta: Lu ha giocato con Garchomp (altri set)
            s2: {
                info: { open_sheet: true },
                showdowns: { a: showdown('OU', match('lu', 'Beta', 'didi', 'Altro')) },
                teams_iscritti: { OU: { lu: iscr(team('t2', 'Beta', [mon('Garchomp', 'Life Orb', 'Sand Veil', 'Adamant', ['Earthquake', 'Outrage'])])) } }
            }
        }
    };
}

test('scheda chiusa: i Pokémon contano per l\'uso e per i compagni, ma non le loro mosse, strumenti, abilità e nature', () => {
    const r = U.calcola(datiSchedaChiusa(false));
    assert.equal(r.totali.team, 2);
    const g = r.specie.find(s => s.specieId === 'garchomp');
    assert.equal(g.team, 2, 'tutti e due i team lo hanno');
    assert.equal(g.perc, 100);
    assert.equal(g.istanze, 2);
    assert.equal(g.setVisibili, 1, 'solo il set della stagione a scheda aperta');
    // le percentuali sono sui set che si vedono
    assert.deepEqual(g.strumenti.map(x => [x.nome, x.perc]), [['Life Orb', 100]]);
    assert.deepEqual(g.mosse.map(x => [x.nome, x.perc]).sort(), [['Earthquake', 100], ['Outrage', 100]]);
    assert.ok(!g.mosse.some(m => m.nome === 'Stealth Rock'), 'Stealth Rock è del team a scheda chiusa');
    assert.deepEqual(g.abilita.map(x => x.nome), ['Sand Veil']);
    assert.deepEqual(g.nature.map(x => x.nome), ['Adamant']);
    // il compagno si vede: i 6 Pokémon sì
    assert.deepEqual(g.compagni.map(c => [c.specieId, c.n]), [['kingambit', 1]]);
    // un Pokémon che c'è solo in una stagione a scheda chiusa: lo si sa, non si sa cosa porta
    const k = r.specie.find(s => s.specieId === 'kingambit');
    assert.equal(k.team, 1);
    assert.equal(k.istanze, 1);
    assert.equal(k.setVisibili, 0);
    assert.deepEqual([k.mosse, k.strumenti, k.abilita, k.nature, k.tera], [[], [], [], [], []]);
    // lo stesso vale per il confronto per formato
    assert.equal(r.perFormato.OU.specie.find(x => x.specieId === 'kingambit').perc, 50);
});

test('scheda aperta (o senza l\'indicazione, come nella pagina dei match): si vede tutto', () => {
    for (const aperta of [true, undefined]) {
        const r = U.calcola(datiSchedaChiusa(aperta));
        const g = r.specie.find(s => s.specieId === 'garchomp');
        assert.equal(g.setVisibili, 2, `open_sheet ${aperta}`);
        assert.equal(g.istanze, 2);
        assert.deepEqual(g.strumenti.map(x => x.nome).sort(), ['Life Orb', 'Rocky Helmet']);
        assert.equal(r.specie.find(s => s.specieId === 'kingambit').mosse[0].nome, 'Kowtow Cleave');
    }
});

test('stats.js e stats.html dicono cosa succede nelle stagioni a scheda chiusa', () => {
    const doc = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
    assert.match(doc('stats.js'), /Hidden: closed sheet season\./);
    assert.match(doc('stats.js'), /x\.setVisibili/);
    assert.match(doc('stats.html'), /In closed sheet seasons only the Pokémon of a team count/);
});
