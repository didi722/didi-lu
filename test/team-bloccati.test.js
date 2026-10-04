'use strict';
// La regola dei team non più modificabili (team-bloccati.js), usata dal Box e dal simulatore:
// un team è bloccato se è stato iscritto almeno una volta a una stagione iniziata (in corso o chiusa), anche se non ha mai giocato.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TB = require('../docs/team-bloccati.js');

const iscritti = (...allenatori) => Object.fromEntries(allenatori.map(([id, ...nomi]) => [id, { datiTeams: nomi.map(nome => ({ nome })) }]));
const stagioni = {
    sbeta: { info: { status: 'playing' }, teams_iscritti: { OU: iscritti(['didi', 'Team Beta']) } },
    s1: { info: { status: 'closed' }, teams_iscritti: { OU: iscritti(['didi', 'Rain Dance'], ['lu', 'Sun Team']), 'VGC Reg G': iscritti(['didi', '  Martiri di al-Aqsa  ']) } },
    s2: { info: { status: 'playing' }, teams_iscritti: { Monotype: iscritti(['didi', 'Monotype Ghost']) } },
    s3: { info: { status: 'open' }, teams_iscritti: { OU: iscritti(['didi', 'Appena iscritto']) } },
    s4: { info: { status: 'draft' }, teams_iscritti: { OU: iscritti(['lu', 'Bozza']) } },
    s5: { teams_iscritti: { OU: iscritti(['lu', 'Senza info']) } }
};

test('nomiBloccati: i team iscritti a stagioni in corso o chiuse, in minuscolo e senza spazi ai lati', () => {
    const b = TB.nomiBloccati(stagioni);
    for (const nome of ['rain dance', 'sun team', 'martiri di al-aqsa', 'monotype ghost']) assert.ok(b.has(nome), nome);
    assert.equal(b.size, 4);
});

test('nomiBloccati: una stagione aperta (iscrizioni in corso), una bozza o senza info non blocca nulla', () => {
    const b = TB.nomiBloccati(stagioni);
    for (const nome of ['appena iscritto', 'bozza', 'senza info']) assert.ok(!b.has(nome), nome);
});

test('nomiBloccati: la stagione di prova "sbeta" non blocca, anche se è in corso', () => {
    assert.ok(!TB.nomiBloccati(stagioni).has('team beta'));
    assert.deepEqual(TB.STAGIONI_CHE_NON_BLOCCANO, ['sbeta']);
});

test('nomiBloccati: regge dati mancanti o fatti in modo diverso (array, nome come { valore }, nulli)', () => {
    assert.equal(TB.nomiBloccati(null).size, 0);
    assert.equal(TB.nomiBloccati({}).size, 0);
    const strano = {
        s1: {
            info: { status: 'playing' },
            teams_iscritti: {
                OU: {
                    a: { datiTeams: [{ nome: 'In un array' }, null, { nome: '' }, {}] },
                    b: { datiTeams: { x: { nome: { valore: 'Con valore' } }, y: { nome: { } } } },
                    c: null,
                    d: {}
                },
                VGC: null
            }
        },
        s2: null,
        s3: { info: { status: 'closed' } }
    };
    const b = TB.nomiBloccati(strano);
    assert.deepEqual([...b].sort(), ['con valore', 'in un array']);
});

test('eBloccato: accetta il Set già calcolato o direttamente le stagioni; maiuscole e spazi non contano; nome vuoto mai', () => {
    const b = TB.nomiBloccati(stagioni);
    assert.equal(TB.eBloccato(b, 'Rain Dance'), true);
    assert.equal(TB.eBloccato(b, '  rain DANCE '), true);
    assert.equal(TB.eBloccato(stagioni, 'Monotype Ghost'), true);
    assert.equal(TB.eBloccato(b, 'Appena iscritto'), false);
    assert.equal(TB.eBloccato(b, ''), false);
    assert.equal(TB.eBloccato(b, null), false);
    assert.equal(TB.eBloccato(null, 'Rain Dance'), false);
});

test('il Box usa questa regola (non più una copia sua) e carica lo script prima del proprio codice', () => {
    const box = fs.readFileSync(path.join(__dirname, '..', 'docs', 'box.html'), 'utf8');
    assert.match(box, /<script src="team-bloccati\.js"><\/script>/);
    assert.ok(box.indexOf('team-bloccati.js') < box.indexOf('async function caricaTeamBloccati'));
    assert.match(box, /window\.nomiTeamBloccati = TeamBloccati\.nomiBloccati\(snap\.val\(\)\);/);
    assert.ok(!/status === 'playing' \|\| status === 'closed'/.test(box), 'la regola non è più scritta dentro box.html');
});
