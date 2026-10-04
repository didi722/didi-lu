'use strict';
// Mosse, strumenti e abilità consigliati (tools/consigli-lib.cjs + docs/consigli.js + docs/consigli/genN.json)
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../tools/consigli-lib.cjs');
const C = require('../docs/consigli.js');

const DATI = path.join(__dirname, '..', 'docs', 'consigli');

test('formati: quelli veri pesano 1, i speciali 0,5, quelli di sperimentazione non contano; doppio da nome', () => {
    assert.equal(L.pesoFormato('ou'), 1);
    assert.equal(L.pesoFormato('vgc2024'), 1);
    assert.equal(L.pesoFormato('lc'), 0.5);
    assert.equal(L.pesoFormato('1v1'), 0.5);
    assert.equal(L.pesoFormato('stabmons'), 0);
    assert.equal(L.pesoFormato('godlygift'), 0);
    assert.equal(L.pesoFormato('balancedhackmons'), 0);
    assert.equal(L.eDoppio('doublesou'), true);
    assert.equal(L.eDoppio('vgc2025'), true);
    assert.equal(L.eDoppio('battlestadiumsingles'), false);
    assert.equal(L.eDoppio('ou'), false);
});

test('costruisci: le mosse dei set votano, le alternative pesano la metà, i formati esclusi non contano', () => {
    const smogon = {
        Garchomp: {
            ou: {
                A: { moves: ['Earthquake', 'Swords Dance', ['Stone Edge', 'Scale Shot'], 'Stealth Rock'], item: 'Rocky Helmet', ability: 'Rough Skin' },
                B: { moves: ['Earthquake', 'Outrage', 'Fire Fang', 'Stone Edge'], item: ['Life Orb', 'Choice Band'], ability: 'Rough Skin' }
            },
            stabmons: { C: { moves: ['Spore', 'Spore', 'Spore', 'Spore'], item: 'Leppa Berry' } },
            vgc2024: { D: { moves: ['Earthquake', 'Protect', 'Rock Slide', 'Dragon Claw'], item: 'Life Orb' } }
        }
    };
    const r = L.costruisci({ gen: 9, smogon, casualiSingoli: null, casualiDoppi: null });
    assert.equal(r.gen, 9);
    assert.deepEqual(r.s.garchomp.m.slice(0, 2), ['earthquake', 'stoneedge'], 'Earthquake in 2 set, Stone Edge 1 + 0,5');
    assert.ok(!r.s.garchomp.m.includes('spore'), 'STABmons escluso');
    assert.deepEqual(r.s.garchomp.i.slice(0, 2), ['rockyhelmet', 'lifeorb'], 'a parità di voti, dal primo set');
    assert.deepEqual(r.s.garchomp.a, ['roughskin']);
    assert.deepEqual(r.d.garchomp.m, ['earthquake', 'protect', 'rockslide', 'dragonclaw'], 'il doppio ha la sua lista (a parità, come compaiono nel set)');
    assert.deepEqual(r.d.garchomp.i, ['lifeorb']);
});

test('costruisci: le battaglie casuali fanno da ripiego per chi Smogon non analizza, dopo i set veri', () => {
    const smogon = { Rotom: { ou: { A: { moves: ['Volt Switch', 'Hydro Pump', 'Will-O-Wisp', 'Protect'], ability: 'Levitate' } } } };
    const casuali = {
        rotom: { level: 84, sets: [{ role: 'Fast Attacker', movepool: ['Volt Switch', 'Shadow Ball', 'Thunderbolt'], abilities: ['Levitate'] }] },
        magikarp: { level: 100, sets: [{ role: 'Bulky Support', movepool: ['Tackle', 'Flail'], abilities: ['Swift Swim'] }] }
    };
    const r = L.costruisci({ gen: 9, smogon, casualiSingoli: casuali, casualiDoppi: null });
    assert.equal(r.s.rotom.m[0], 'voltswitch', 'il voto di Smogon (1) più quello casuale (0,35)');
    assert.ok(r.s.rotom.m.indexOf('hydropump') < r.s.rotom.m.indexOf('shadowball'), 'prima i set di Smogon');
    assert.ok(r.s.rotom.m.includes('shadowball'), 'poi quelli delle battaglie casuali');
    assert.deepEqual(r.s.magikarp.m.sort(), ['flail', 'tackle'], 'senza Smogon restano quelli casuali');
    assert.deepEqual(r.s.magikarp.a, ['swiftswim']);
});

test('per: la lista del formato, il ripiego sulla specie base e sul singolo, e il caricamento di una generazione', async () => {
    const dati = {
        v: 1, gen: 9,
        s: { garchomp: { m: ['earthquake', 'swordsdance'], i: ['rockyhelmet'], a: ['roughskin'] }, ursaluna: { m: ['facade', 'headlongrush'], i: ['flameorb'], a: ['guts'] } },
        d: { garchomp: { m: ['earthquake', 'protect', 'rockslide', 'dragonclaw', 'swordsdance', 'scaleshot'], i: ['lifeorb'], a: ['roughskin'] } }
    };
    assert.deepEqual(C.per(dati, 'garchomp', { doppio: false }).mosse, ['earthquake', 'swordsdance']);
    assert.equal(C.per(dati, 'garchomp', { doppio: true }).mosse[1], 'protect');
    assert.deepEqual(C.per(dati, 'ursaluna', { doppio: true }).mosse, ['facade', 'headlongrush'], 'senza lista doppia: quella del singolo');
    assert.deepEqual(C.per(dati, 'garchompmega', { baseId: 'garchomp' }).oggetti, ['rockyhelmet'], 'la forma senza set usa la specie base');
    assert.deepEqual(C.per(dati, 'sconosciuto'), { mosse: [], oggetti: [], abilita: [] });
    assert.deepEqual(C.per(null, 'garchomp'), { mosse: [], oggetti: [], abilita: [] });
    // lista del doppio corta: si completa con quella del singolo
    const corta = { s: { x: { m: ['a', 'b', 'c', 'd', 'e', 'f'], i: ['i1'], a: [] } }, d: { x: { m: ['b', 'z'], i: [], a: ['ab'] } } };
    assert.deepEqual(C.per(corta, 'x', { doppio: true }).mosse, ['b', 'z', 'a', 'c', 'd', 'e', 'f']);
    assert.deepEqual(C.per(corta, 'x', { doppio: true }).oggetti, ['i1']);

    let richiesti = [];
    const caricati = await C.carica(9, url => { richiesti.push(url); return Promise.resolve(dati); });
    assert.deepEqual(richiesti, ['consigli/gen9.json']);
    assert.equal(await C.carica(9, () => { throw new Error('già in cache'); }), caricati, 'una sola lettura per generazione');
    assert.equal(await C.carica(5, () => Promise.reject(new Error('rete'))), null, 'se manca il file, nessun consiglio');
    assert.equal(await C.carica(12, () => Promise.resolve(dati)), null);
});

test('ordina: i consigliati in cima nell\'ordine dei consigli, il resto com\'era, le mosse inutili in fondo', () => {
    const voci = ['splash', 'tackle', 'earthquake', 'bulldoze', 'swordsdance', 'celebrate', 'aerialace'].map(id => ({ id }));
    const { consigliate, altre } = C.ordina(voci, ['swordsdance', 'earthquake', 'nonlegale'], v => v.id, C.MOSSE_POCO_UTILI);
    assert.deepEqual(consigliate.map(v => v.id), ['swordsdance', 'earthquake']);
    assert.deepEqual(altre.map(v => v.id), ['tackle', 'bulldoze', 'aerialace', 'splash', 'celebrate']);
    assert.deepEqual(C.ordina(voci, [], v => v.id).consigliate, []);
});

test('i file dei dati: una generazione per file, id minuscoli, singolo e doppio, e Pokémon noti con mosse sensate', () => {
    for (let g = 1; g <= 9; g++) {
        const d = JSON.parse(fs.readFileSync(path.join(DATI, `gen${g}.json`), 'utf8'));
        assert.equal(d.gen, g);
        assert.ok(Object.keys(d.s).length > 100, `gen${g}: pochi Pokémon`);
        for (const lista of [d.s, d.d]) for (const [id, x] of Object.entries(lista)) {
            assert.match(id, /^[a-z0-9]+$/, `${g}/${id}`);
            for (const k of ['m', 'i', 'a']) assert.ok(Array.isArray(x[k]), `${g}/${id}.${k}`);
            for (const mossa of x.m) assert.match(mossa, /^[a-z0-9]+$/);
        }
    }
    const g9 = JSON.parse(fs.readFileSync(path.join(DATI, 'gen9.json'), 'utf8'));
    assert.ok(g9.s.garchomp.m.slice(0, 4).includes('earthquake'));
    assert.ok(g9.s.gholdengo.m.slice(0, 3).includes('makeitrain'));
    assert.ok(g9.d.incineroar.m.slice(0, 3).includes('fakeout'), 'in doppio Incineroar gioca Fake Out');
    assert.ok(g9.s.incineroar.a.includes('intimidate'));
});

test('Team Builder: carica i consigli della generazione, li mette in cima a mosse e strumenti e spiega ogni voce in hover', () => {
    const box = fs.readFileSync(path.join(__dirname, '..', 'docs', 'box.html'), 'utf8');
    assert.match(box, /<script src="consigli\.js"><\/script>/);
    assert.match(box, /tbStato\.consigli = typeof Consigli !== 'undefined' \? await Consigli\.carica\(tbStato\.gen\)/);
    assert.match(box, /Consigli\.ordina\(voci, tipo === 'mossa' \? c\.mosse : c\.oggetti/);
    assert.match(box, /★ Recommended/);
    // la spiegazione: sulle voci delle liste, sui campi scelti e sulle abilità (data-desc, mostrata da controlli.js)
    assert.match(box, /onmouseenter="tbHintVoce\(this, \$\{i\}\)"/);
    assert.match(box, /tbHintCampo\(this, 'mossa'/);
    assert.match(box, /tbHintCampo\(this, 'oggetto'/);
    assert.match(box, /tbHintCampo\(this, 'abilita'/);
    assert.match(box, /data-desc="\$\{tbEsc\(tbTestoDesc\(tbDex\.abilities/);
    // l'elenco che si apre dopo un altro non lascia il precedente aperto
    assert.match(box, /if \(tbCombo\.input && tbCombo\.input !== input\) tbChiudiCombo\(\);/);
});
