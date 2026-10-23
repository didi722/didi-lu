'use strict';
// Le serie (clean streak, vittorie di fila) si spezzano alla prima sconfitta: l'ordine dei match deve essere quello vero.
// Due showdown dello stesso giorno non si mescolano (prima tutto quello giocato prima), e le date si leggono sia come AAAA-MM-GG sia
// come GG/MM/AAAA (con "13/10/2026" Date.parse da' una data non valida, e con "10/11/2026" scambia giorno e mese).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { creaDb } = require('./db-finto');
const { calcola } = require('../docs/statistiche.js');

function caricaSito(db) {
    const file = path.join(__dirname, '..', 'docs', 'risultati-match.js');
    const contesto = vm.createContext({ console: { log() {}, warn() {}, error() {} }, fetch: async () => ({ ok: false, json: async () => ({}) }), db });
    vm.runInContext(fs.readFileSync(file, 'utf8'), contesto, { filename: file });
    return contesto;
}

// un match di Lukiani contro Ada: i set di Lukiani, i set di Ada, e quando è stato salvato
const match = (s1, s2, lastEdit) => ({
    player1Id: 'lukiani', player2Id: 'ada', player1: 'Lukiani', player2: 'Ada', winnerId: s1 > s2 ? 'lukiani' : 'ada',
    team1: '', team2: '', p1score: s1, p2score: s2, p1points: 0, p2points: 0, lastEdit
});
// A: 3-0, 3-0, 2-3 (sconfitta) · B: 3-0, 3-0 — tutti e due nello stesso giorno. Uniti per numero di match (A1 B1 A2 B2) sembrerebbero 4 pulite di fila;
// nell'ordine vero (A1 A2 A3 B1 B2) la serie pulita più lunga è 2
function stagione(data) {
    return {
        s1: {
            info: { name: 'S' },
            showdowns: {
                d1: { info: { categoria: 'VGC', data, vincitoreShowdown: 'ada' }, matches: {
                    match1: match(3, 0, '2026-10-12T10:00:00Z'), match2: match(3, 0, '2026-10-12T10:10:00Z'), match3: match(2, 3, '2026-10-12T10:20:00Z') } },
                d2: { info: { categoria: 'OU', data, vincitoreShowdown: 'lukiani' }, matches: {
                    match1: match(3, 0, '2026-10-12T15:00:00Z'), match2: match(3, 0, '2026-10-12T15:10:00Z') } }
            }
        }
    };
}

for (const data of ['2026-10-12', '12/10/2026', '13/10/2026']) {
    test(`badge: due showdown dello stesso giorno (${data}) non si mescolano, la serie pulita non unisce match che una sconfitta separa`, async () => {
        const db = creaDb({ players: { lukiani: {}, ada: {} }, seasons: stagione(data) });
        await caricaSito(db).ricalcolaStatisticheGlobali('lukiani');
        const badge = db.leggi('players/lukiani/stats/badges');
        assert.equal(badge.maxcleanstrike, 2);
        assert.equal(badge.maxwonstrike, 2);
    });

    test(`stats: la serie pulita (${data}) segue l'ordine vero degli showdown`, () => {
        const r = calcola({ players: { lukiani: { info: {} }, ada: { info: {} } }, seasons: stagione(data) });
        const luk = r.players.find(p => p.id === 'lukiani');
        assert.equal(luk.serie.pulitaMax, 2);
        assert.equal(luk.serie.vittorieMax, 2);
    });
}

test('nell\'ordine vero, la serie pulita si forma anche tra due showdown di giorni diversi', async () => {
    const s = stagione('2026-10-12');
    s.s1.showdowns.d1.matches = { match1: match(3, 0, '2026-10-12T10:00:00Z'), match2: match(3, 0, '2026-10-12T10:10:00Z') };
    s.s1.showdowns.d2.info.data = '2026-10-13';
    const db = creaDb({ players: { lukiani: {}, ada: {} }, seasons: s });
    await caricaSito(db).ricalcolaStatisticheGlobali('lukiani');
    assert.equal(db.leggi('players/lukiani/stats/badges').maxcleanstrike, 4);
});
