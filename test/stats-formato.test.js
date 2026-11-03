'use strict';
// stats-formato.js: la scheda Stats di un formato (pagina Formats): uso, % di set vinti, KO per set, lead, strumenti e mosse; con i conti fatti a mano.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SF = require('../docs/stats-formato.js');
const { calcola: statistiche } = require('../docs/statistiche.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// un lato di un set: [specie, opzioni]; titolare = apre il set
const lato = (portati, svenuti, pokemon) => ({
    nome: 'x', portati, svenuti,
    pokemon: pokemon.map(([specie, o = {}]) => ({ specie, nome: '', portato: true, titolare: false, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o }))
});
const set = (vincitore, p1, p2) => ({ v: 3, turni: 8, vincitore, p1, p2 });
const mon = (nome, strumento, mosse, extra = {}) => ({ nome, strumento, abilita: 'Intimidate', natura: 'Jolly', mosse, ...extra });
const match = (p1, t1, p2, t2, s1, s2, data, setStats, categoria = 'VGC') => ({
    player1: p1, player1Id: p1, player2: p2, player2Id: p2, winnerId: s1 > s2 ? p1 : p2, team1: t1, team2: t2, score: `${s1}-${s2}`,
    p1score: s1, p2score: s2, p1points: s1, p2points: s2, data, categoria, ...(setStats ? { setStats } : {})
});

// VGC: Didi (Alfa: Garchomp + Incineroar) contro Lu (Beta: Dragonite + Rillaboom), tre set, 2-1 per Didi.
//   set1: Didi vince, Garchomp + Incineroar aprono, Garchomp 2 KO; set2: Didi vince; set3: Lu vince con Dragonite + Rillaboom in apertura.
//   OU: un match senza statistiche di set. In s2 un altro VGC.
function dati() {
    const s1 = set('p1',
        lato(2, 1, [['Garchomp', { titolare: true, koFatti: 2, koDiretti: 2 }], ['Incineroar', { titolare: true, koFatti: 0, svenuto: true }]]),
        lato(2, 2, [['Dragonite', { titolare: true, koFatti: 0, svenuto: true }], ['Rillaboom', { titolare: true, svenuto: true }]]));
    const s2 = set('p1',
        lato(2, 0, [['Garchomp', { titolare: true, koFatti: 1 }], ['Incineroar', { titolare: true, koFatti: 1 }]]),
        lato(2, 2, [['Dragonite', { titolare: true, svenuto: true }], ['Rillaboom', { titolare: true, svenuto: true }]]));
    const s3 = set('p2',
        lato(2, 2, [['Garchomp', { titolare: true, svenuto: true }], ['Incineroar', { titolare: true, svenuto: true }]]),
        lato(2, 0, [['Dragonite', { titolare: true, koFatti: 2 }], ['Rillaboom', { titolare: true, koFatti: 2 }]]));
    const iscr = (...teams) => ({ datiTeams: teams, teamIds: teams.map(t => t.id) });
    return {
        players: { didi: { info: { name: 'Didi' }, teams: {} }, lu: { info: { name: 'Lu' }, teams: {} } },
        seasons: {
            s1: {
                info: { name: 'Season One', status: 'closed' },
                showdowns: {
                    sd1: { info: { categoria: 'VGC', data: '2026-03-01' }, matches: { match1: match('didi', 'Alfa', 'lu', 'Beta', 2, 1, '2026-03-01', { set1: s1, set2: s2, set3: s3 }) } },
                    sd2: { info: { categoria: 'OU', data: '2026-03-02' }, matches: { match1: match('didi', 'Omega', 'lu', 'Sigma', 2, 0, '2026-03-02', null, 'OU') } }
                },
                teams_iscritti: {
                    VGC: {
                        didi: iscr({ id: 't1', nome: 'Alfa', pokemon: [mon('Garchomp', 'Rocky Helmet', ['Earthquake', 'Protect', 'Dragon Claw', 'Rock Slide']), mon('Incineroar', 'Safety Goggles', ['Fake Out', 'Knock Off', 'Parting Shot', 'Flare Blitz'])] }),
                        lu: iscr({ id: 't2', nome: 'Beta', pokemon: [mon('Dragonite', 'Loaded Dice', ['Extreme Speed', 'Protect']), mon('Rillaboom', 'Assault Vest', ['Grassy Glide', 'Fake Out'])] })
                    },
                    OU: { didi: iscr({ id: 't3', nome: 'Omega', pokemon: [mon('Gholdengo', 'Air Balloon', ['Make It Rain'])] }) }
                }
            },
            s2: {
                info: { name: 'Season Two', status: 'playing' },
                showdowns: { sd1: { info: { categoria: 'VGC', data: '2026-04-01' }, matches: { match1: match('didi', 'Alfa', 'lu', 'Beta', 2, 0, '2026-04-01', JSON.parse(JSON.stringify({ set1: s1, set2: s2 }))) } } },
                teams_iscritti: {
                    VGC: {
                        didi: iscr({ id: 't1', nome: 'Alfa', pokemon: [mon('Garchomp', 'Rocky Helmet', ['Earthquake', 'Protect', 'Swords Dance', 'Rock Slide']), mon('Incineroar', 'Safety Goggles', ['Fake Out', 'Knock Off'])] }),
                        lu: iscr({ id: 't2', nome: 'Beta', pokemon: [mon('Dragonite', 'Loaded Dice', ['Extreme Speed']), mon('Rillaboom', 'Assault Vest', ['Grassy Glide'])] })
                    }
                }
            }
        }
    };
}

test('statistiche: le lead sono i due titolari del set, senza ordine, con i set vinti e persi; le più giocate prima', () => {
    const r = statistiche(dati(), { formato: 'VGC', senzaSquadre: true });
    // s1: 3 set, s2: 2 set; ogni lato apre sempre con la stessa coppia
    const garchomp = r.lead.find(l => l.specieId.join('+') === 'garchomp+incineroar');
    assert.deepEqual([garchomp.set, garchomp.vinti, garchomp.persi, garchomp.percVinti], [5, 4, 1, 80]);
    assert.deepEqual(garchomp.specie, ['Garchomp', 'Incineroar']);
    const dragonite = r.lead.find(l => l.specieId.join('+') === 'dragonite+rillaboom');
    assert.deepEqual([dragonite.set, dragonite.vinti, dragonite.persi, dragonite.percVinti], [5, 1, 4, 20]);
    assert.equal(r.lead.length, 2);
    assert.equal(statistiche(dati(), { formato: 'OU', senzaSquadre: true }).lead.length, 0, 'senza statistiche di set non ci sono lead');
    // un solo titolare (singoli): una lead da sola; tre titolari (dati strani): ignorati
    const d = dati();
    d.seasons.s1.showdowns.sd1.matches.match1.setStats.set1.p1.pokemon.forEach(p => { p.titolare = false; });
    d.seasons.s1.showdowns.sd1.matches.match1.setStats.set1.p1.pokemon[0].titolare = true;
    const solo = statistiche(d, { formato: 'VGC', senzaSquadre: true }).lead.find(l => l.specieId.join('+') === 'garchomp');
    assert.deepEqual([solo.set, solo.vinti], [1, 1]);
});

test('calcola: il formato si rispetta, sempre su tutte le stagioni; totali, uso e battaglia', () => {
    const r = SF.calcola(dati(), { formato: 'VGC' });
    assert.deepEqual(r.filtro, { formato: 'VGC' });
    assert.equal(r.stagioni, undefined, 'niente selettore di stagione');
    assert.deepEqual([r.totali.team, r.totali.giocatori, r.totali.match, r.totali.set, r.totali.setConDati], [4, 2, 2, 5, 5]);
    assert.equal(r.vuoto, false);
    const g = r.pokemon.find(p => p.specieId === 'garchomp');
    assert.deepEqual([g.team, g.perc, g.giocatori], [2, 50, 1], 'su 4 team ne ha 2 (Alfa in due stagioni)');
    assert.deepEqual([g.battaglia.portato, g.battaglia.vinti, g.battaglia.persi, g.battaglia.percVinti], [10 - 5, 4, 1, 80]);
    assert.deepEqual(g.strumenti.map(x => [x.nome, x.perc]), [['Rocky Helmet', 100]]);
    assert.equal(g.mosse.find(x => x.nome === 'Earthquake').perc, 100);
    assert.equal(g.mosse.length, 4, 'le prime quattro');
    assert.equal(g.mosse.find(x => x.nome === 'Dragon Claw').perc, 50, 'solo uno dei due set la porta');
    assert.ok(g.compagni.some(c => c.nome === 'Incineroar'));
    assert.equal(r.pokemon.find(p => p.specieId === 'gholdengo'), undefined, 'un altro formato non si vede');
    assert.deepEqual(SF.calcola(dati(), { formato: 'VGC', stagione: 's2' }).totali, r.totali, 'una stagione chiesta non cambia niente');
    assert.equal(SF.calcola(dati(), { formato: 'Mai giocato' }).vuoto, true);
});

test('ordina: usa il criterio scelto e mette in fondo chi ha troppo pochi set; le lead rare (un solo set) non si elencano', () => {
    const r = SF.calcola(dati(), { formato: 'VGC' });
    const porVinti = SF.ordina(r.pokemon, 'vinti').map(p => p.specieId);
    assert.deepEqual(porVinti.slice(0, 2).sort(), ['garchomp', 'incineroar'], 'l\'80% in cima');
    const poco = [
        { specieId: 'a', nome: 'A', team: 1, battaglia: { portato: 1, vinti: 1, persi: 0, percVinti: 100, koPerSet: 5 } },
        { specieId: 'b', nome: 'B', team: 1, battaglia: { portato: 6, vinti: 3, persi: 3, percVinti: 50, koPerSet: 1 } },
        { specieId: 'c', nome: 'C', team: 3, battaglia: null }
    ];
    assert.deepEqual(SF.ordina(poco, 'vinti').map(p => p.specieId), ['b', 'c', 'a'], 'A ha un solo set: non conta anche se è al 100%');
    assert.deepEqual(SF.ordina(poco, 'ko').map(p => p.specieId), ['b', 'c', 'a']);
    assert.deepEqual(SF.ordina(poco, 'uso').map(p => p.specieId), ['a', 'b', 'c'], 'l\'uso è l\'ordine di arrivo');
    const d = dati();
    d.seasons.s1.showdowns.sd1.matches.match1.setStats.set3.p1.pokemon[0].titolare = false;
    assert.ok(SF.calcola(d, { formato: 'VGC' }).lead.every(l => l.set >= SF.MIN_SET_LEAD));
});

test('html: il riepilogo, un Pokémon con i dettagli, le lead e la nota; niente selettore di stagione; niente HTML dai nomi', () => {
    const d = dati();
    d.seasons.s1.showdowns.sd1.matches.match1.team1 = 'Alfa';
    const h = SF.html(SF.calcola(d, { formato: 'VGC' }), { sprite: n => `<img alt="${n}">` });
    assert.doesNotMatch(h, /<select|data-fs-stagione|Season/);
    assert.doesNotMatch(SF.html(SF.calcola(d, { formato: 'VGC' }), {}), /fs-campo/);
    assert.match(h, /<b>4<\/b> teams · <b>2<\/b> players · <b>2<\/b> matches · <b>5<\/b> sets/);
    assert.match(h, /<span class="fs-nome">Garchomp<\/span>/);
    assert.match(h, /<h4>Items<\/h4>.*Rocky Helmet/s);
    assert.match(h, /Garchomp \+ Incineroar/);
    assert.match(h, /data-fs-ordine="vinti" aria-pressed="false"/);
    assert.match(h, /<img alt="Garchomp">/);
    assert.match(SF.html(SF.calcola(dati(), { formato: 'Nessuno' })), /No matches played in this format yet\./);
    // la beta non conta (come nel resto del sito): un formato giocato solo lì risulta vuoto
    const soloBeta = dati();
    soloBeta.seasons.sbeta = { info: { name: 'Beta', status: 'closed' }, showdowns: { sd1: { info: { categoria: 'Monotype' }, matches: { match1: match('didi', 'X', 'lu', 'Y', 2, 0, '2026-01-01', null, 'Monotype') } } } };
    assert.equal(SF.calcola(soloBeta, { formato: 'Monotype' }).vuoto, true);
    assert.match(SF.html(SF.calcola(dati(), { formato: 'VGC' }), { ordine: 'ko' }), /data-fs-ordine="ko" aria-pressed="true"/);
});

test('html: oltre dieci Pokémon il resto è nascosto dietro "Show all"; senza strumenti (scheda chiusa) lo dice', () => {
    const molti = { filtro: { formato: 'X' }, totali: { team: 3, giocatori: 2, match: 3, set: 6, setConDati: 6 }, lead: [], vuoto: false,
        pokemon: Array.from({ length: 13 }, (_, i) => ({ specieId: `p${i}`, nome: `P${i}`, team: 3 - (i % 3), perc: 50, giocatori: 1, istanze: 1, setVisibili: i === 12 ? 0 : 1, schedaChiusa: i === 12, strumenti: [], mosse: [], abilita: [], compagni: [], battaglia: null })) };
    const h = SF.html(molti, {});
    assert.equal((h.match(/data-fs-extra/g) || []).length, 3);
    assert.match(h, /data-fs-altri>Show all 13<\/button>/);
    assert.match(h, /the sheet is closed in this season/);
    assert.doesNotMatch(SF.html(molti, { tutti: true }), /data-fs-extra|data-fs-altri/);
});

test('cablaggio: la pagina Formats ha il doppio tasto Ranking | Stats, carica gli script solo al primo tocco e legge le stagioni una volta', () => {
    const f = leggi('docs', 'formats.html');
    assert.match(f, /data-vista="ranking"/);
    assert.match(f, /data-vista="stats"/);
    assert.match(f, /caricaScriptStatsFormato/);
    for (const s of ['statistiche.js', 'uso-globale.js', 'sprite-pkm.js', 'stats-formato.js']) assert.ok(f.includes(`'${s}'`), s);
    assert.match(f, /db\.ref\('seasons'\)\.once\('value'\)/);
    assert.doesNotMatch(f, /data-fs-stagione|statsFormato\.stagione/, 'niente selettore di stagione');
    assert.doesNotMatch(f, /<script src="stats-formato\.js"/, 'non si carica con la pagina');
    const css = leggi('docs', 'style-formats.css');
    for (const c of ['.fmt-vista', '.fs-voce', '.fs-lead-riga']) assert.ok(css.includes(c), c);
    assert.ok(!css.includes('.fs-stagione') && !css.includes('.fs-campo'));
});
