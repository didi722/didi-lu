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

// ---------- i team iscritti a stagioni con le iscrizioni aperte (regola di somiglianza) ----------

const foto = (id, nome, pokemon = []) => ({ id, nome, pokemon });
const iscrizione = (...fotografie) => ({ teamIds: fotografie.map(f => f.id), datiTeams: fotografie, count: fotografie.length });

test('iscrittiInStagioniAperte: i team del giocatore, nel formato, iscritti a stagioni che non sono ancora iniziate', () => {
    const seasons = {
        s1: { info: { status: 'open', name: 'Friuli DOC I' }, teams_iscritti: { 'Little Cup': { didi: iscrizione(foto('a', 'Team a', [{ nome: 'Ditto' }]), foto('b', 'Team b')), lu: iscrizione(foto('z', 'Z')) }, OU: { didi: iscrizione(foto('o', 'O')) } } },
        s2: { info: { status: 'coming soon', name: 'Sant\'Alvise II' }, teams_iscritti: { 'Little Cup': { didi: iscrizione(foto('c', 'Team c')) } } },
        s3: { info: { status: 'playing', name: 'In corso' }, teams_iscritti: { 'Little Cup': { didi: iscrizione(foto('d', 'Team d')) } } },
        s4: { info: { status: 'closed', name: 'Chiusa' }, teams_iscritti: { 'Little Cup': { didi: iscrizione(foto('e', 'Team e')) } } }
    };
    const r = TB.iscrittiInStagioniAperte(seasons, { giocatore: 'didi', formato: 'Little Cup' });
    assert.deepEqual(r.map(x => [x.id, x.nome, x.stagione, x.nomeStagione]), [
        ['a', 'Team a', 's1', 'Friuli DOC I'], ['b', 'Team b', 's1', 'Friuli DOC I'], ['c', 'Team c', 's2', 'Sant\'Alvise II']
    ], 'non quelle in corso o chiuse (quei team sono già bloccati), né di altri giocatori o formati');
    assert.deepEqual(r[0].pokemon, [{ nome: 'Ditto' }], 'i Pokémon della fotografia dell\'iscrizione');
});

test('iscrittiInStagioniAperte: si può saltare una stagione (quella che si sta scegliendo); maiuscole e spazi non contano; la prova "sbeta" no', () => {
    const seasons = {
        s1: { info: { status: 'open' }, teams_iscritti: { 'Little Cup': { didi: iscrizione(foto('a', 'A')) } } },
        s2: { info: { status: 'open', name: 'Due' }, teams_iscritti: { ' little cup ': { ' Didi ': iscrizione(foto('b', 'B')) } } },
        sbeta: { info: { status: 'open' }, teams_iscritti: { 'Little Cup': { didi: iscrizione(foto('s', 'S')) } } }
    };
    assert.deepEqual(TB.iscrittiInStagioniAperte(seasons, { giocatore: 'didi', formato: 'Little Cup', escludi: 's1' }).map(x => x.id), ['b']);
    assert.deepEqual(TB.iscrittiInStagioniAperte(seasons, { giocatore: 'DIDI', formato: 'LITTLE CUP' }).map(x => x.id), ['a', 'b'], 'sbeta non blocca niente, quindi non conta');
    assert.equal(TB.iscrittiInStagioniAperte(seasons, { giocatore: 'didi', formato: 'Little Cup' })[0].nomeStagione, 's1', 'senza nome si usa l\'id');
});

test('iscrittiInStagioniAperte: una stagione senza stato è aperta (come per l\'Hub); teamIds mancanti o a oggetto non rompono; dati vuoti danno un elenco vuoto', () => {
    const senzaStato = { s1: { info: {}, teams_iscritti: { F: { didi: iscrizione(foto('a', 'A')) } } } };
    assert.deepEqual(TB.iscrittiInStagioniAperte(senzaStato, { giocatore: 'didi', formato: 'F' }).map(x => x.id), ['a']);
    const aOggetto = { s1: { info: { status: 'open' }, teams_iscritti: { F: { didi: { teamIds: { 0: 'a', 1: 'b' }, datiTeams: { 0: foto('a', 'A'), 1: foto('b', 'B') } } } } } };
    assert.deepEqual(TB.iscrittiInStagioniAperte(aOggetto, { giocatore: 'didi', formato: 'F' }).map(x => [x.id, x.nome]), [['a', 'A'], ['b', 'B']]);
    const soloFoto = { s1: { info: { status: 'open' }, teams_iscritti: { F: { didi: { datiTeams: [foto('a', 'A')] } } } } };
    assert.deepEqual(TB.iscrittiInStagioniAperte(soloFoto, { giocatore: 'didi', formato: 'F' }).map(x => x.id), ['a'], 'senza teamIds valgono gli id della fotografia');
    const senzaFoto = { s1: { info: { status: 'open' }, teams_iscritti: { F: { didi: { teamIds: ['x'] } } } } };
    assert.deepEqual(TB.iscrittiInStagioniAperte(senzaFoto, { giocatore: 'didi', formato: 'F' }).map(x => [x.id, x.nome, x.pokemon]), [['x', '', []]]);
    for (const vuoto of [null, undefined, {}, { s1: null }, { s1: {} }]) assert.deepEqual(TB.iscrittiInStagioniAperte(vuoto, { giocatore: 'didi', formato: 'F' }), []);
    assert.deepEqual(TB.iscrittiInStagioniAperte(aOggetto), [], 'senza giocatore né formato non c\'è niente da trovare');
});
