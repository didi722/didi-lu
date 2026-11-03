'use strict';
// lega-box.js: la lega nei tooltip del Team Builder (velocità, debolezze, copertura, suggerimenti): solo fatti, conti fatti a mano.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../docs/lega-box.js');
const U = require('../docs/uso-globale.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// 4 team del formato: Garchomp in 3, Incineroar in 2, Rillaboom in 2, Dragonite e Kingambit in 1
const specie = (id, nome, team, vinti = null, persi = null) => ({ specieId: id, nome, team, perc: Math.round(team / 4 * 1000) / 10, battaglia: vinti == null ? null : { vinti, persi, percVinti: Math.round(vinti / (vinti + persi) * 1000) / 10 } });
const uso = () => ({
    totali: { team: 4 },
    specie: [specie('incineroar', 'Incineroar', 2, 6, 4), specie('garchomp', 'Garchomp', 3, 9, 1), specie('rillaboom', 'Rillaboom', 2, 1, 1), specie('dragonite', 'Dragonite', 1), specie('kingambit', 'Kingambit', 1, 3, 0)],
    squadre: [
        { giocatore: 'didi', stagione: 's1', specieId: ['garchomp', 'incineroar'] },
        { giocatore: 'lu', stagione: 's1', specieId: ['garchomp', 'rillaboom', 'dragonite'] },
        { giocatore: 'ada', stagione: 's1', specieId: ['garchomp', 'kingambit'] },
        { giocatore: 'tom', stagione: 's1', specieId: ['incineroar', 'rillaboom'] }
    ]
});
const TIPI = { garchomp: ['Dragon', 'Ground'], incineroar: ['Fire', 'Dark'], rillaboom: ['Grass'], dragonite: ['Dragon', 'Flying'], kingambit: ['Dark', 'Steel'] };
const lega = () => L.prepara(uso());

test('prepara: i Pokémon più usati prima (a parità in ordine alfabetico), % di vittorie solo da tre set in su, null senza team', () => {
    const l = lega();
    assert.equal(l.team, 4);
    assert.deepEqual(l.specie.map(s => s.specieId), ['garchomp', 'incineroar', 'rillaboom', 'dragonite', 'kingambit']);
    assert.deepEqual([l.perId.get('garchomp').set, l.perId.get('garchomp').percVinti], [10, 90]);
    assert.equal(l.perId.get('rillaboom').percVinti, null, 'due set: troppo pochi');
    assert.equal(l.perId.get('dragonite').set, 0);
    assert.equal(L.prepara(null), null);
    assert.equal(L.prepara({ totali: { team: 0 }, specie: [] }), null);
    assert.deepEqual(L.top(l, 2).map(s => s.nome), ['Garchomp', 'Incineroar']);
    assert.deepEqual(L.top(null), []);
});

test('velocita: quanti dei più usati si superano, chi resta più veloce (dal più vicino) e i pari; i Pokémon senza velocità nota non contano', () => {
    const VEL = { garchomp: 169, incineroar: 120, rillaboom: 100, dragonite: 136, kingambit: 50 };
    const v = L.velocita(lega(), 130, id => VEL[id] ?? null);
    assert.deepEqual([v.considerati, v.superati], [5, 3]);
    assert.deepEqual(v.piuVeloci.map(s => [s.nome, s.vel]), [['Dragonite', 136], ['Garchomp', 169]]);
    assert.deepEqual(v.pari, []);
    assert.deepEqual(L.velocita(lega(), 120, id => VEL[id]).pari.map(s => s.nome), ['Incineroar']);
    const solo2 = L.velocita(lega(), 130, id => VEL[id], 2);
    assert.deepEqual([solo2.considerati, solo2.superati], [2, 1], 'solo i 2 più usati: Garchomp e Incineroar');
    assert.equal(L.velocita(lega(), 130, id => (id === 'garchomp' ? 169 : null)).considerati, 1);
    assert.equal(L.velocita(null, 130, () => 1).considerati, 0);
});

test('teamConTipo: quanti team hanno almeno un Pokémon di quel tipo (maiuscole e doppi tipi compresi), uno per team anche se ne ha due', () => {
    const tipiDi = id => TIPI[id];
    assert.equal(L.teamConTipo(lega(), tipiDi, 'Ground'), 3, 'Garchomp: didi, lu e ada');
    assert.equal(L.teamConTipo(lega(), tipiDi, 'dragon'), 3, 'minuscolo vale uguale; lu ha due Pokémon Drago ma è un team solo');
    assert.equal(L.teamConTipo(lega(), tipiDi, 'Dark'), 3, 'Incineroar (didi, tom) e Kingambit (ada)');
    assert.equal(L.teamConTipo(lega(), tipiDi, 'Grass'), 2);
    assert.equal(L.teamConTipo(lega(), tipiDi, 'Water'), 0);
    assert.equal(L.teamConTipo(lega(), id => undefined, 'Ground'), 0, 'specie sconosciute: nessun tipo');
    assert.equal(L.teamConTipo(null, tipiDi, 'Ground'), 0);
});

test('copertura: contro i più usati, quanti si colpiscono superefficace, alla pari al massimo, e chi resiste a tutto', () => {
    const EFF = { garchomp: 2, incineroar: 1, rillaboom: 4, dragonite: 0.5, kingambit: 0.25 };
    const c = L.copertura(lega(), id => EFF[id]);
    assert.deepEqual([c.considerati, c.superEfficaci, c.alMassimoAllaPari], [5, 2, 1]);
    assert.deepEqual(c.resistono.map(s => s.nome), ['Dragonite', 'Kingambit']);
    assert.equal(L.copertura(lega(), id => (id === 'garchomp' ? 2 : null)).considerati, 1, 'senza dato non conta');
});

test('ordinaPerUso: chi si gioca nella lega prima (i più usati per primi), gli altri nell\'ordine di partenza; senza lega non cambia niente', () => {
    const pool = ['mew', 'rillaboom', 'ditto', 'garchomp', 'kingambit'].map(specieId => ({ specieId, nome: specieId }));
    assert.deepEqual(L.ordinaPerUso(lega(), pool, v => v.specieId).map(v => v.specieId), ['garchomp', 'rillaboom', 'kingambit', 'mew', 'ditto']);
    assert.deepEqual(L.ordinaPerUso(null, pool, v => v.specieId).map(v => v.specieId), pool.map(v => v.specieId));
    assert.equal(pool[0].specieId, 'mew', 'la lista di partenza non si tocca');
});

test('etichette: uso e vittorie per i chip; niente per chi nessuno porta; la % di vittorie compare solo da tre set', () => {
    const l = lega();
    assert.equal(L.etichetta(l, 'garchomp'), '75% · 90% win');
    assert.equal(L.etichetta(l, 'rillaboom'), '50%', 'due set: niente % di vittorie');
    assert.equal(L.etichetta(l, 'mew'), '');
    assert.equal(L.frase(l, 'garchomp'), '75% of league teams · 90% of sets won (10)');
    assert.equal(L.frase(l, 'rillaboom'), '50% of league teams');
    assert.equal(L.frase(null, 'garchomp'), '');
});

test('con i dati veri di UsoGlobale: prepara e teamConTipo funzionano sui team iscritti che hanno giocato', () => {
    const mon = nome => ({ nome, strumento: '', abilita: '', natura: '', mosse: [] });
    const m = (p1, t1, p2, t2) => ({ player1Id: p1, team1: t1, player2Id: p2, team2: t2, p1score: 2, p2score: 1 });
    const dati = { players: {}, seasons: { s1: {
        showdowns: { sd1: { info: { categoria: 'VGC' }, matches: { match1: m('didi', 'A', 'lu', 'B') } } },
        teams_iscritti: { VGC: {
            didi: { datiTeams: [{ id: 't1', nome: 'A', pokemon: [mon('Garchomp'), mon('Incineroar')] }] },
            lu: { datiTeams: [{ id: 't2', nome: 'B', pokemon: [mon('Rillaboom'), mon('Garchomp')] }] },
            ada: { datiTeams: [{ id: 't3', nome: 'Mai giocato', pokemon: [mon('Kingambit')] }] }
        } } } } };
    const l = L.prepara(U.calcola(dati, { formato: 'VGC' }, []));
    assert.equal(l.team, 2, 'il team mai sceso in campo non si vede');
    assert.equal(L.teamConTipo(l, id => TIPI[id], 'dragon'), 2);
    assert.equal(L.teamConTipo(l, id => TIPI[id], 'Grass'), 1);
    assert.equal(L.teamConTipo(l, id => TIPI[id], 'Steel'), 0, 'Kingambit è di un team che non ha giocato');
    assert.deepEqual(l.specie.map(s => s.nome), ['Garchomp', 'Incineroar', 'Rillaboom']);
});

test('cablaggio: il Box carica la lega in background all\'apertura del builder e la mette nei quattro tooltip (velocità, difesa, copertura, suggerimenti)', () => {
    const b = leggi('docs', 'box.html');
    assert.match(b, /<script src="uso-globale\.js"><\/script>\s*<script src="lega-box\.js"><\/script>/);
    assert.match(b, /async function tbCaricaLega\(\)/);
    assert.match(b, /tbCaricaLega\(\);\s+\/\/ i numeri della lega per i tooltip, in background/);
    assert.match(b, /LegaBox\.velocita\(lega, mia,/);
    assert.match(b, /LegaBox\.teamConTipo\(lega,/);
    assert.match(b, /LegaBox\.copertura\(lega,/);
    assert.equal((b.match(/tbEsempiLega\(g\.pokemon\)/g) || []).length, 2, 'gli esempi dei suggerimenti in difesa e in copertura');
    assert.equal((b.match(/\+ tbEtichettaLega\(v\)/g) || []).length, 2);
    assert.match(b, /function tbLegaCorrente\(\)/);
    assert.ok(leggi('docs', 'style-box.css').includes('.tb-lega-uso'));
    // senza lega i tooltip restano quelli di sempre: ogni sezione è condizionata
    assert.match(b, /const sezioneLega = lega && problemi\.length/);
    assert.match(b, /const sezioneLega = cl && cl\.considerati/);
    assert.match(b, /const sezioneLega = vsLega && vsLega\.considerati/);
});

test('il collegamento del Box (tbCaricaLega e gli aiuti), eseguito con i moduli veri: legge le stagioni una volta, vale solo per il formato aperto, un errore lascia i tooltip di sempre', async () => {
    const vm = require('node:vm');
    const sorgente = leggi('docs', 'box.html');
    const estrai = nome => {
        const i = sorgente.indexOf(nome);
        assert.ok(i >= 0, nome);
        let aperte = 0, j = sorgente.indexOf('{', i);
        const inizio = i;
        for (; j < sorgente.length; j++) {
            if (sorgente[j] === '{') aperte++;
            else if (sorgente[j] === '}' && --aperte === 0) break;
        }
        return sorgente.slice(inizio, j + 1);
    };
    const codice = ['async function tbCaricaLega()', 'function tbLegaCorrente()', 'function tbEsempiLega(', 'function tbEtichettaLega('].map(estrai).join('\n');
    const mon = nome => ({ nome, strumento: '', abilita: '', natura: '', mosse: [] });
    const stagioni = { s1: {
        showdowns: { sd1: { info: { categoria: 'VGC' }, matches: { match1: { player1Id: 'didi', team1: 'A', player2Id: 'lu', team2: 'B', p1score: 2, p2score: 1 } } } },
        teams_iscritti: { VGC: { didi: { datiTeams: [{ id: 't1', nome: 'A', pokemon: [mon('Garchomp')] }] }, lu: { datiTeams: [{ id: 't2', nome: 'B', pokemon: [mon('Garchomp'), mon('Rillaboom')] }] } } } } };
    let letture = 0, errore = false;
    const ctx = {
        console: { warn() {} }, window: {}, tbEsc: t => String(t),
        tbStato: { regolamento: { categoria: 'VGC' } },
        db: { ref: percorso => ({ once: async () => { letture++; if (errore) throw new Error('rete'); assert.equal(percorso, 'seasons'); return { val: () => stagioni }; } }) },
        Statistiche: require('../docs/statistiche.js'), UsoGlobale: U, LegaBox: L
    };
    vm.createContext(ctx);
    vm.runInContext(`const tbLega = { formato: '', dati: null, caricando: false };\n${codice}\nthis.api = { tbLega, tbCaricaLega, tbLegaCorrente, tbEsempiLega, tbEtichettaLega };`, ctx);
    const api = ctx.api;
    assert.equal(api.tbLegaCorrente(), null, 'prima del caricamento niente lega');
    assert.equal(api.tbEtichettaLega({ specieId: 'garchomp' }), '');
    assert.deepEqual(api.tbEsempiLega([{ specieId: 'mew' }, { specieId: 'garchomp' }]).map(v => v.specieId), ['mew', 'garchomp'], 'senza lega l\'ordine non cambia');
    await api.tbCaricaLega();
    assert.equal(letture, 1);
    const l = api.tbLegaCorrente();
    assert.equal(l.team, 2);
    assert.deepEqual(l.specie.map(s => s.specieId), ['garchomp', 'rillaboom']);
    assert.deepEqual(api.tbEsempiLega([{ specieId: 'mew' }, { specieId: 'rillaboom' }, { specieId: 'garchomp' }], 2).map(v => v.specieId), ['garchomp', 'rillaboom']);
    assert.match(api.tbEtichettaLega({ specieId: 'garchomp' }), /^ <small class="tb-lega-uso" title="100% of league teams">100%<\/small>$/);
    await api.tbCaricaLega();
    assert.equal(letture, 1, 'stesso formato: niente di nuovo');
    ctx.tbStato.regolamento = { categoria: 'OU' };
    assert.equal(api.tbLegaCorrente(), null, 'un altro formato non usa i numeri del primo');
    await api.tbCaricaLega();
    assert.equal(letture, 1, 'le stagioni si leggono una volta sola');
    assert.equal(api.tbLegaCorrente(), null, 'nessun team ha giocato OU');
    // un errore di rete lascia i tooltip come sono
    const ctx2 = { ...ctx, window: {}, tbStato: { regolamento: { categoria: 'VGC' } } };
    errore = true;
    vm.createContext(ctx2);
    vm.runInContext(`const tbLega = { formato: '', dati: null, caricando: false };\n${codice}\nthis.api = { tbLega, tbCaricaLega, tbLegaCorrente };`, ctx2);
    await ctx2.api.tbCaricaLega();
    assert.equal(ctx2.api.tbLegaCorrente(), null);
    assert.equal(ctx2.api.tbLega.caricando, false, 'si può riprovare');
});
