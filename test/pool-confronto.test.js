'use strict';
// Team Builder: i tooltip di velocità, danno e copertura confrontano il team con TUTTO il formato, non solo con i Pokémon tra cui si può scegliere. Nel Monotype l'helper
// restringe la lista al tipo scelto (Spettro): prima anche gli avversari erano solo Spettro, e il "superi il 92% del formato" valeva per un solo tipo.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const box = fs.readFileSync(path.join(__dirname, '..', 'docs', 'box.html'), 'utf8');

function estrai(inizio) {
    const i = box.indexOf(inizio);
    assert.ok(i >= 0, inizio);
    let aperte = 0, j = box.indexOf('{', i);
    for (; j < box.length; j++) {
        if (box[j] === '{') aperte++;
        else if (box[j] === '}' && --aperte === 0) break;
    }
    return box.slice(i, j + 1);
}

// le tre funzioni vere di box.html, con pochi dati finti
function costruisci() {
    const dex = {
        gengar: { name: 'Gengar', types: ['Ghost', 'Poison'], baseStats: { spe: 110 } },
        dusknoir: { name: 'Dusknoir', types: ['Ghost'], baseStats: { spe: 45 } },
        garchomp: { name: 'Garchomp', types: ['Dragon', 'Ground'], baseStats: { spe: 102 } },
        charizard: { name: 'Charizard', types: ['Fire', 'Flying'], baseStats: { spe: 100 } },
        shedinja: { name: 'Shedinja', types: ['Bug', 'Ghost'], baseStats: { spe: 40 } }
    };
    const ctx = vm.createContext({
        deltaGenCorrente: null,
        tbStato: {},
        tbToID: t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
        tbSpecie: id => dex[id] || null,
        tbNomeBello: (sp, riserva) => (sp ? sp.name : riserva),
        tbBST: sp => (sp ? 500 : 0),
        tbSpriteId: sp => sp.name.toLowerCase(),
        tbSpecieBase: sp => sp,
        // Shedinja: tutte le abilità sono bannate → non si sceglie e non si confronta
        tbAbilitaLegali: (sp, ignoraBan) => (sp.name === 'Shedinja' ? (ignoraBan ? ['wonderguard'] : []) : ['x'])
    });
    const codice = ['function tbPoolConfronto(', 'function tbCostruisciPool(', 'function tbInizializzaStato('].map(estrai).join('\n');
    vm.runInContext(`${codice}\nthis.api = { tbPoolConfronto, tbCostruisciPool, tbInizializzaStato };`, ctx);
    return ctx;
}
const voce = id => ({ id, name: id });
const regolamento = { strutturaSito: 'custom', genRuleValue: '9', genRuleType: 'up_to', baseTier: 'OU' };
const ids = pool => pool.map(v => v.specieId).sort();

test('con una scelta del team (Monotype Spettro) le scelte sono solo quelle del tipo ma i confronti sono tutto il formato', () => {
    const ctx = costruisci();
    const scelte = ['gengar', 'dusknoir', 'shedinja'].map(voce);
    const tutti = ['gengar', 'dusknoir', 'garchomp', 'charizard', 'shedinja'].map(voce);
    ctx.api.tbInizializzaStato('mono|3', regolamento, scelte, tutti);
    assert.deepEqual(ids(ctx.tbStato.pool), ['dusknoir', 'gengar'], 'tra cui scegliere: i Pokémon Spettro (Shedinja ha tutte le abilità bannate)');
    assert.deepEqual(ids(ctx.tbStato.poolConfronto), ['charizard', 'dusknoir', 'garchomp', 'gengar'], 'con cui confrontarsi: tutto il formato');
    assert.deepEqual(ids(ctx.api.tbPoolConfronto()), ids(ctx.tbStato.poolConfronto));
});

test('senza una scelta (formato normale, o lista di confronto uguale a quella delle scelte) si confronta con la stessa lista di prima', () => {
    const ctx = costruisci();
    const lista = ['gengar', 'garchomp', 'charizard'].map(voce);
    ctx.api.tbInizializzaStato('ou|3', regolamento, lista);
    assert.equal(ctx.tbStato.poolConfronto, ctx.tbStato.pool, 'nessuna seconda lista: la stessa');
    assert.deepEqual(ids(ctx.api.tbPoolConfronto()), ['charizard', 'garchomp', 'gengar']);
    ctx.api.tbInizializzaStato('ou|3', regolamento, lista, lista);
    assert.equal(ctx.tbStato.poolConfronto, ctx.tbStato.pool, 'la stessa lista passata due volte non si costruisce due volte');
    ctx.api.tbInizializzaStato('ou|3', regolamento, lista, []);
    assert.equal(ctx.tbStato.poolConfronto, ctx.tbStato.pool, 'una lista di confronto vuota non svuota i confronti');
    // senza poolConfronto (stato vecchio) si ripiega sulla lista delle scelte
    assert.deepEqual(ids(ctx.api.tbPoolConfronto.call(null)), ids(ctx.tbStato.pool));
});

test('box.html: velocità, danni fatti e subiti e copertura usano la lista di confronto; scelte e suggerimenti restano sulla lista ristretta', () => {
    // velocità
    assert.match(estrai('function tbHtmlSpeedTier('), /const altri = tbPoolConfronto\(\)\.filter\(v => v\.sp && v\.sp\.baseStats\)/);
    // avversari dei danni (tooltip su Atk/SpA e su HP/Def/SpD)
    const minacce = estrai('function tbMinacceCalc(');
    assert.match(minacce, /const confronto = tbPoolConfronto\(\);/);
    assert.doesNotMatch(minacce, /tbStato\.pool/);
    // copertura offensiva del team
    assert.match(estrai('function tbCalcolaAttacco('), /tbPoolConfronto\(\)\.filter\(v => v\.sp && Array\.isArray\(v\.sp\.types\)\)/);
    // suggerimenti di cosa aggiungere e picker: solo tra quelli che si possono scegliere
    assert.match(estrai('function tbHtmlSuggerimenti('), /tbStato\.pool\.forEach/);
    assert.match(estrai('function tbHtmlAttacco('), /tbStato\.pool\.forEach/);
    assert.match(box, /for \(const v of tbStato\.pool\.slice\(0, TB_RUOLI_SCAN\)\)/);
});

test('l\'helper salva TUTTO il formato (senza la scelta del team) per i confronti: tipo del Monotype e iniziale; si azzera a ogni cambio di formato; builder e dettaglio dei team lo usano', () => {
    const h = estrai('async function gestisciCambioFormatoHelper(');
    assert.match(h, /if \(grid\) grid\.poolFormatoCompleto = null;/, 'si azzera a ogni cambio di formato');
    assert.match(h, /grid\.poolFormatoCompleto = poolPokemonBase;/, 'SAME_ACROSS_TEAM: tutti i tipi');
    assert.match(h, /delete senzaIniziale\.restrizioni\.pokemon\.name_starts;[\s\S]*grid\.poolFormatoCompleto = risultatoSenza\.pokemon;/, 'iniziale del nome: tutte le lettere');
    // dal tasto "Build Team"
    const apri = estrai('async function apriTeamBuilder(');
    assert.match(apri, /const listaConfronto = \(grid && Array\.isArray\(grid\.poolFormatoCompleto\)[^;]*: \(tbPoolConfrontoPerFormato\[formatId\] \|\| lista\);/);
    assert.equal((apri.match(/tbInizializzaStato\(firma, regolamento, lista, listaConfronto\)/g) || []).length, 2);
    // dal dettaglio di un team del box (la lista per formato è in cache: anche quella di tutto il formato)
    assert.match(box, /const listaConfronto = tbPoolConfrontoPerFormato\[formato\.id\] \|\| lista;/);
    assert.match(box, /formato\.regolamento, lista, listaConfronto\);/);
    assert.match(estrai('function aggiornaBottoneBuildTeam('), /tbPoolConfrontoPerFormato\[window\.currentHelperFormatId\] = \(grid && Array\.isArray\(grid\.poolFormatoCompleto\)/);
});
