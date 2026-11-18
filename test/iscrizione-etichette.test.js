'use strict';
// hub.html: scegliendo i team da iscrivere a una stagione si filtra per etichetta (le etichette del Box), (solo il filtro: le etichette non si mostrano accanto ai team).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const hub = fs.readFileSync(path.join(__dirname, '..', 'docs', 'hub.html'), 'utf8');

test('hub.html carica etichette-team.js e il suo stile', () => {
    assert.match(hub, /<script src="etichette-team\.js"><\/script>/);
    assert.match(hub, /<link rel="stylesheet" href="etichette-team\.css">/);
});

test('il selettore dei team: filtro per etichetta solo se il giocatore ne ha, nessuna pillola accanto ai team, filtro applicato alla lista', () => {
    const i = hub.indexOf('async function openTeamPicker(');
    const f = hub.slice(i, hub.indexOf('\nasync function apriDettaglioTeam', i));
    assert.match(f, /players\/\$\{nomeUtenteClean\}\/etichette/);
    assert.match(f, /if \(elencoEtichette\.length\) \{[\s\S]*?container\.before\(sel\)/, 'il filtro c\'è solo con delle etichette');
    assert.match(f, /All labels[\s\S]*No label/);
    assert.match(f, /EtichetteTeam\.corrisponde\(allTeams\[o\.id\], etichetteDef, filtroEtichetta\)/);
    assert.ok(!/etichetta-pillola|EtichetteTeam\.diTeam/.test(f), 'le etichette servono solo a filtrare: nessuna pillola accanto al team');
    assert.match(f, /applicaFiltroEtichetta\(\);\s*updateTitleAndUI\(\);/, 'dopo aver disegnato la lista');
    // la selezione non si perde filtrando: si nasconde soltanto
    assert.match(f, /o\.div\.hidden = /);
});

test('la logica del filtro è quella del Box (EtichetteTeam.corrisponde)', () => {
    const ET = require('../docs/etichette-team.js');
    const def = { a: { nome: 'Rain', colore: '#ff0000' }, b: { nome: 'Sun', colore: '#00ff00' } };
    const t1 = { etichette: { a: true } }, t2 = {};
    assert.equal(ET.corrisponde(t1, def, 'a'), true);
    assert.equal(ET.corrisponde(t2, def, 'a'), false);
    assert.equal(ET.corrisponde(t2, def, ET.NESSUNA), true);
    assert.equal(ET.corrisponde(t1, def, ET.NESSUNA), false);
    assert.equal(ET.corrisponde(t2, def, ''), true);
});
