'use strict';
// Come gioca la CPU in doppio, nei team che giocano le persone (Incineroar, Rillaboom, Flutter Mane...):
//   - in anteprima porta in campo per primo chi ha Fake Out insieme a un compagno che attacca, e al primo turno lo usa;
//   - la scelta a sorte tra piani quasi pari (temperatura) non rompe le partite e, spenta, dà sempre la stessa scelta;
//   - tabella() conta come gioca (per situazione) con lo stesso modulo che legge i replay.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const { caricaSim, giocaPartita, creaCasuale } = require('./ayuda-sim.js');
const IA = require('../docs/cpu-ia.js');
const Sit = require('../docs/cpu-situazioni.js');
const { A, B } = require('./dati/squadre-vgc.js');

const FORMATO = 'gen9doublescustomgame@@@Picked Team Size = 4,HP Percentage Mod,Terastal Clause';
// A: 1 Incineroar, 2 Rillaboom (Fake Out), 3 Flutter Mane, 4 Urshifu, 5 Landorus, 6 Amoonguss
const CON_FAKE_OUT = [1, 2];

async function gioca(seme, parametri = {}) {
    const { sim } = await caricaSim();
    const a = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(seme * 3 + 1), parametri, debug: true });
    const b = IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(seme * 5 + 2) });
    const orig = a.scegli.bind(a);
    const scelte = [];
    a.scegli = (r, o) => { const s = orig(r, o); scelte.push({ anteprima: !!r.teamPreview, scelta: s }); return s; };
    const e = await giocaPartita({ sim, formato: FORMATO, team1: A, team2: B, agente1: { tipo: 'cpu', cerebro: a }, agente2: { tipo: 'cpu', cerebro: b }, casuale: creaCasuale(seme * 11 + 9), seme: [seme + 1, 7, 11, 13] });
    return { e, scelte, anteprima: scelte.find(x => x.anteprima).scelta };
}
const aperture = anteprima => anteprima.replace('team ', '').split('').slice(0, 2).map(Number);

test('anteprima: chi ha Fake Out apre in campo, con un compagno che attacca; senza il bonus (antFakeOut 0) la CPU apriva solo con chi fa più danno', async () => {
    for (const seme of [1, 2]) {
        const { anteprima, e } = await gioca(seme);
        const lead = aperture(anteprima);
        assert.ok(lead.some(i => CON_FAKE_OUT.includes(i)), `aperture ${lead} (${anteprima})`);
        assert.ok(lead.some(i => !CON_FAKE_OUT.includes(i)), 'e un compagno che non è l\'altro Fake Out');
        assert.deepEqual(e.errori, []);
    }
    const vecchia = await gioca(1, { antFakeOut: 0 });
    assert.ok(!aperture(vecchia.anteprima).some(i => CON_FAKE_OUT.includes(i)), `senza il bonus: ${vecchia.anteprima}`);
});

test('primo turno: con Fake Out in campo la CPU lo usa (toglie la mossa a un avversario) e la partita finisce senza scelte rifiutate', async () => {
    const { e, scelte } = await gioca(1);
    const primo = scelte.find(x => !x.anteprima).scelta;
    assert.match(primo, /^move 1 [12], /, `primo turno: ${primo}`);        // Incineroar/Rillaboom: la mossa 1 è Fake Out
    assert.ok(e.righe.some(r => /^\|move\|p1[ab]: (Incineroar|Rillaboom)\|Fake Out\|/.test(r)));
    assert.deepEqual(e.errori, []);
    assert.ok(!e.bloccata && !e.scaduta);
});

test('temperatura: spenta (0) la CPU fa sempre la stessa scelta nella stessa posizione; accesa gioca partite complete e valide', async () => {
    const x = await gioca(3), y = await gioca(3);
    assert.deepEqual(x.scelte, y.scelte);
    for (const seme of [4, 5]) {
        const t = await gioca(seme, { temperatura: 0.1 });
        assert.deepEqual(t.e.errori, []);
        assert.ok(!t.e.bloccata && !t.e.scaduta);
        assert.ok(t.e.vincitore === 'p1' || t.e.vincitore === 'p2');
    }
});

test('tabella: percentuali di scelta per situazione dai log; la prima riga è "tutte"; una caratteristica senza casi dà zeri', () => {
    const log = [
        '|gametype|doubles', '|teamsize|p1|4', '|teamsize|p2|4', '|start',
        '|switch|p1a: A|Garchomp, L50|100/100', '|switch|p1b: B|Incineroar, L50|100/100',
        '|switch|p2a: C|Rillaboom, L50|100/100', '|switch|p2b: D|Flutter Mane, L50|100/100',
        '|turn|1',
        '|move|p1a: A|Protect|p1a: A', '|move|p1b: B|Fake Out|p2a: C', '|move|p2a: C|Grassy Glide|p1a: A', '|move|p2b: D|Moonblast|p1b: B', '|upkeep'
    ];
    const t = Sit.tabella(Sit.decisioni(log), { doppio: true });
    assert.equal(t[0].nome, 'tutte');
    assert.equal(t[0].n, 4);
    assert.equal(t[0].protezione, 0.25);
    assert.equal(t[0].attacco, 0.75);
    const primo = t.find(r => r.nome === 'primoTurno');
    assert.equal(primo.n, 4);
    const stato = t.find(r => r.nome === 'conStato');
    assert.deepEqual([stato.n, stato.attacco, stato.protezione], [0, 0, 0]);
    assert.equal(Sit.tabella(Sit.decisioni(log), { doppio: false })[0].n, 0, 'nessuna decisione in singolo');
    assert.match(Sit.tabellaInTesto(t), /tutte\s+4\s+attacco\s+75\.0%\s+protezione\s+25\.0%/);
    assert.deepEqual(Sit.tabella(null, {})[0].n, 0);
});

// ---------- il modo di giocare della lega (pesoStile) ----------
const PROTEGGE = [{ tipo: 'mossa', mossa: { protezione: true, id: 'protect', categoria: 'Status' } }];
const FA_ALTRO = [{ tipo: 'mossa', mossa: { protezione: false, id: 'lightscreen', categoria: 'Status' } }];
const ATTACCA = [{ tipo: 'mossa', mossa: { protezione: false, id: 'earthquake', categoria: 'Physical' } }];
const CAMBIA = [{ tipo: 'cambio', verso: 3 }];
const squadraLog = (lato, n) => [`|switch|${lato}a: A${lato}|Garchomp, L50|100/100`, `|switch|${lato}b: B${lato}|Rillaboom, L50|100/100`];
const apertura = ['|gametype|doubles', '|teamsize|p1|4', '|teamsize|p2|4', '|start', ...squadraLog('p1'), ...squadraLog('p2')];

test('pesoStile: al primo turno proteggersi o fare altro vale di più, da soli in campo a fine partita di meno; attaccare non cambia mai; nel singolo e spento non c\'è niente', async () => {
    const { sim } = await caricaSim();
    const nuovo = parametri => IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: () => 0.5, parametri });
    const a = nuovo({ pesoStile: 0.5 });
    a.osserva([...apertura, '|turn|1']);
    assert.ok(a._bonusStile(PROTEGGE) > 0.2, `proteggersi al primo turno: ${a._bonusStile(PROTEGGE)}`);
    assert.equal(a._bonusStile(ATTACCA), 0, 'attaccare è il riferimento');
    // il compagno cade, passano i turni: da solo in campo, a fine partita
    const righe = ['|move|p2a: Ap2|Earthquake|p1b: Bp1', '|faint|p1b: Bp1', '|upkeep'];
    for (let t = 2; t <= 8; t++) righe.push(`|turn|${t}`, '|move|p2a: Ap2|Earthquake|p1a: Ap1', '|upkeep');
    righe.push('|turn|9');
    a.osserva(righe);
    const solo = a._bonusStile(PROTEGGE);
    assert.ok(solo < -0.15, `da solo in campo, a fine partita, proteggersi vale meno: ${solo}`);
    assert.ok(a._bonusStile(FA_ALTRO) < -0.1, 'e anche una mossa di stato');
    assert.equal(typeof a._bonusStile(CAMBIA), 'number');
    // pesi proporzionali; spento = 0; nel singolo = 0
    const doppio = nuovo({ pesoStile: 1 });
    doppio.osserva([...apertura, '|turn|1']);
    assert.ok(Math.abs(doppio._bonusStile(PROTEGGE) - 2 * (() => { const m = nuovo({ pesoStile: 0.5 }); m.osserva([...apertura, '|turn|1']); return m._bonusStile(PROTEGGE); })()) < 1e-9);
    const spento = nuovo({ pesoStile: 0 });
    spento.osserva([...apertura, '|turn|1']);
    assert.equal(spento._bonusStile(PROTEGGE), 0);
    const singolo = nuovo({ pesoStile: 0.5 });
    singolo.osserva(['|gametype|singles', '|switch|p1a: A|Garchomp, L50|100/100', '|switch|p2a: B|Rillaboom, L50|100/100', '|turn|1']);
    assert.equal(singolo._bonusStile(PROTEGGE), 0);
});

test('pesoStile: una partita intera con la correzione accesa finisce senza scelte rifiutate', async () => {
    const r = await gioca(7, { pesoStile: 0.5 });
    assert.deepEqual(r.e.errori, []);
    assert.ok(!r.e.bloccata && !r.e.scaduta);
});
