'use strict';
// Il carosello dell'app (docs/app-carosello.js): la meccanica comune a Trainers, Stats e alla classifica di Matches.
//   - dove sta ogni elemento rispetto a quello al centro, anche in giro (dall'ultimo si torna al primo);
//   - cosa vuol dire un gesto del dito e come si collega a un elemento.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const Car = require('../docs/app-carosello.js');

test('dentro: l\'indice torna nella fila, anche negativo o oltre la fine; fila vuota = 0', () => {
    assert.equal(Car.dentro(0, 5), 0);
    assert.equal(Car.dentro(5, 5), 0);
    assert.equal(Car.dentro(-1, 5), 4);
    assert.equal(Car.dentro(-6, 5), 4);
    assert.equal(Car.dentro(12, 5), 2);
    assert.equal(Car.dentro(3, 0), 0);
    assert.equal(Car.dentro(2.9, 5), 2);
});

test('distanza: quanti posti dal centro; in giro si prende la strada più corta (dal primo l\'ultimo è a -1)', () => {
    assert.equal(Car.distanza(2, 2, 5, true), 0);
    assert.equal(Car.distanza(3, 2, 5, true), 1);
    assert.equal(Car.distanza(1, 2, 5, true), -1);
    assert.equal(Car.distanza(4, 0, 5, true), -1, 'l\'ultimo, visto dal primo, sta dietro');
    assert.equal(Car.distanza(0, 4, 5, true), 1, 'e il primo, visto dall\'ultimo, sta avanti');
    assert.equal(Car.distanza(4, 0, 5, false), 4, 'senza giro la distanza è quella vera');
    assert.equal(Car.distanza(1, 0, 0, true), 0);
});

test('passo: avanti e indietro; in giro oltre i capi si ricomincia, senza giro ci si ferma', () => {
    assert.equal(Car.passo(0, 4, 1, true), 1);
    assert.equal(Car.passo(3, 4, 1, true), 0);
    assert.equal(Car.passo(0, 4, -1, true), 3);
    assert.equal(Car.passo(3, 4, 1, false), 3);
    assert.equal(Car.passo(0, 4, -1, false), 0);
    assert.equal(Car.passo(2, 0, 1, true), 0);
    assert.equal(Car.passo(1, 4, -9, true), 0, 'ogni verso negativo è un passo indietro');
});

test('visibili: gli elementi attorno al centro, senza ripeterne nessuno anche se la fila è corta', () => {
    assert.deepEqual(Car.visibili(5, 0), [{ i: 4, d: -1 }, { i: 0, d: 0 }, { i: 1, d: 1 }]);
    assert.deepEqual(Car.visibili(2, 0), [{ i: 1, d: 1 }, { i: 0, d: 0 }], 'con due elementi l\'altro compare una volta sola');
    assert.deepEqual(Car.visibili(1, 0), [{ i: 0, d: 0 }]);
    assert.deepEqual(Car.visibili(0, 0), []);
    assert.deepEqual(Car.visibili(5, 0, { circolare: false }).map(v => v.i), [0, 1], 'senza giro non si esce dai capi');
    assert.deepEqual(Car.visibili(9, 4, { prima: 2, dopo: 2 }).map(v => v.i), [2, 3, 4, 5, 6]);
});

test('seguenti: il centro e i successivi (la classifica: il primo grande, sotto i due che seguono)', () => {
    assert.deepEqual(Car.seguenti(5, 0, 3, true), [0, 1, 2]);
    assert.deepEqual(Car.seguenti(5, 4, 3, true), [4, 0, 1], 'dall\'ultimo si ricomincia');
    assert.deepEqual(Car.seguenti(2, 0, 3, true), [0, 1], 'fila corta: nessun doppione');
    assert.deepEqual(Car.seguenti(5, 4, 3, false), [4], 'senza giro finisce al capo');
    assert.deepEqual(Car.seguenti(1, 0, 3, true), [0]);
});

test('aspetto: il centro grande e pieno, i vicini più piccoli e un po\' trasparenti, gli altri nascosti dietro', () => {
    assert.deepEqual(Car.aspetto(0), { x: 0, scala: 1, opacita: 1, z: 3 });
    assert.deepEqual(Car.aspetto(1), { x: 1, scala: 0.82, opacita: 0.62, z: 2 });
    assert.deepEqual(Car.aspetto(-1), { x: -1, scala: 0.82, opacita: 0.62, z: 2 });
    assert.equal(Car.aspetto(2).opacita, 0);
    assert.equal(Car.aspetto(7).x, 2, 'la posizione si ferma a due passi');
    assert.equal(Car.aspetto(-7).x, -2);
    assert.equal(Car.aspetto(2, 2).opacita, 0.62, 'con due vicini per lato si vedono anche i secondi');
});

test('gesto: scorrere di lato vale, poco o più in verticale no; il dito a sinistra va avanti', () => {
    assert.equal(Car.gesto(-80, 5), 1);
    assert.equal(Car.gesto(80, -5), -1);
    assert.equal(Car.gesto(-20, 0), 0, 'troppo corto');
    assert.equal(Car.gesto(-60, 70), 0, 'più in verticale che di lato: resta alla pagina');
    assert.equal(Car.gesto(-60, 45), 1, 'un po\' storto ma di lato');
    assert.equal(Car.gesto(-50, 0, 60), 0, 'la soglia si può cambiare');
});

// un elemento finto: tiene i gestori e li fa scattare
function elementoFinto() {
    const g = {};
    return {
        style: {},
        addEventListener(t, f) { (g[t] ||= []).push(f); },
        removeEventListener(t, f) { g[t] = (g[t] || []).filter(x => x !== f); },
        manda(t, e) { for (const f of g[t] || []) f(e); },
        quanti: t => (g[t] || []).length
    };
}

test('collegaGesti: un gesto di lato chiama avanti o indietro una volta sola; il dito in verticale lascia scorrere la pagina', () => {
    const el = elementoFinto();
    const chiamate = [];
    const c = Car.collegaGesti(el, { avanti: () => chiamate.push('avanti'), indietro: () => chiamate.push('indietro') });
    assert.equal(el.style.touchAction, 'pan-y', 'la pagina scorre in verticale come sempre');
    const gesto = (x0, y0, x1, y1, tipo = 'touch') => { el.manda('pointerdown', { clientX: x0, clientY: y0, pointerType: tipo, button: 0 }); el.manda('pointermove', { clientX: x1, clientY: y1 }); el.manda('pointerup', { clientX: x1, clientY: y1 }); };
    gesto(200, 100, 100, 104);
    gesto(100, 100, 220, 96);
    gesto(200, 100, 190, 100);
    gesto(200, 100, 190, 220);
    assert.deepEqual(chiamate, ['avanti', 'indietro']);
    el.manda('pointerup', { clientX: 0, clientY: 0 });
    assert.deepEqual(chiamate, ['avanti', 'indietro'], 'un rilascio senza tocco prima non fa niente');
    el.manda('pointerdown', { clientX: 200, clientY: 100, pointerType: 'mouse', button: 2 });
    el.manda('pointerup', { clientX: 50, clientY: 100 });
    assert.deepEqual(chiamate, ['avanti', 'indietro'], 'il tasto destro del mouse non conta');
    el.manda('pointerdown', { clientX: 200, clientY: 100, pointerType: 'touch', button: 0 });
    el.manda('pointercancel', {});
    el.manda('pointerup', { clientX: 50, clientY: 100 });
    assert.deepEqual(chiamate, ['avanti', 'indietro'], 'un gesto annullato (il browser prende lo scorrimento) non conta');
    c.stacca();
    assert.equal(el.quanti('pointerdown'), 0);
    assert.equal(el.quanti('click'), 0);
});

test('collegaGesti: il clic che chiude un trascinamento non vale (scorrere sopra una scheda non la apre); un tocco fermo sì', () => {
    const el = elementoFinto();
    Car.collegaGesti(el, { avanti() {}, indietro() {} });
    const clic = () => { const e = { fermato: false, annullato: false, stopPropagation() { this.fermato = true; }, preventDefault() { this.annullato = true; } }; el.manda('click', e); return e; };
    el.manda('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse', button: 0 });
    el.manda('pointermove', { clientX: 160, clientY: 100 });
    el.manda('pointerup', { clientX: 160, clientY: 100 });
    const dopoTrascinamento = clic();
    assert.ok(dopoTrascinamento.fermato && dopoTrascinamento.annullato);
    el.manda('pointerdown', { clientX: 100, clientY: 100, pointerType: 'mouse', button: 0 });
    el.manda('pointermove', { clientX: 103, clientY: 101 });
    el.manda('pointerup', { clientX: 103, clientY: 101 });
    const tocco = clic();
    assert.ok(!tocco.fermato && !tocco.annullato, 'sotto gli 8 pixel è un tocco');
});

test('collegaGesti con `ignora`: un gesto che parte da un cursore o da un campo non fa scorrere', () => {
    const el = elementoFinto();
    const chiamate = [];
    Car.collegaGesti(el, { avanti: () => chiamate.push('avanti'), indietro: () => chiamate.push('indietro'), ignora: 'input, .tb-ev-row' });
    const su = (dentro) => { const target = { closest: sel => (dentro && sel.includes('input') ? {} : null) }; el.manda('pointerdown', { clientX: 200, clientY: 100, pointerType: 'touch', button: 0, target }); el.manda('pointerup', { clientX: 60, clientY: 100 }); };
    su(true);
    assert.deepEqual(chiamate, [], 'sul cursore il dito serve al cursore');
    su(false);
    assert.deepEqual(chiamate, ['avanti']);
});

// timer finti per le prove: si fanno scattare a mano
function tempiFinti() {
    const attivi = new Map(); let n = 0;
    return { set: (f, ms) => { attivi.set(++n, { f, ms }); return n; }, clear: id => attivi.delete(id), scatta: ms => { for (const [id, t] of [...attivi]) if (t.ms <= ms) { attivi.delete(id); t.f(); } }, quanti: () => attivi.size };
}

test('collegaPressione: un tocco mostra la spiegazione per qualche secondo (e toccando di nuovo sparisce); tenendo premuto resta finché non si lascia; scorrere non vale', () => {
    const el = elementoFinto();
    const t = tempiFinti();
    const log = [];
    const badge = { id: 'b1' };
    const target = { closest: sel => (sel === '.at-badge' ? badge : null) };
    const c = Car.collegaPressione(el, '.at-badge', { mostra: (b, lungo) => log.push(['mostra', b.id, lungo]), nascondi: () => log.push(['nascondi']), ms: 350, durata: 3000, tempi: t });
    // tocco breve
    el.manda('pointerdown', { clientX: 10, clientY: 10, target }); el.manda('pointerup', { clientX: 10, clientY: 10, target });
    assert.deepEqual(log, [['mostra', 'b1', false]]);
    t.scatta(3000);
    assert.deepEqual(log.slice(1), [['nascondi']], 'dopo qualche secondo sparisce da sola');
    // tocco, poi di nuovo lo stesso: la toglie
    log.length = 0;
    el.manda('pointerdown', { clientX: 10, clientY: 10, target }); el.manda('pointerup', { clientX: 10, clientY: 10, target });
    el.manda('pointerdown', { clientX: 10, clientY: 10, target }); el.manda('pointerup', { clientX: 10, clientY: 10, target });
    assert.deepEqual(log, [['mostra', 'b1', false], ['nascondi']]);
    // tenuto premuto: compare e resta; lasciando sparisce
    log.length = 0;
    el.manda('pointerdown', { clientX: 10, clientY: 10, target });
    t.scatta(350);
    assert.deepEqual(log, [['mostra', 'b1', true]]);
    el.manda('pointerup', { clientX: 10, clientY: 10, target });
    assert.deepEqual(log, [['mostra', 'b1', true], ['nascondi']], 'lasciando, sparisce');
    // il dito scorre (un gesto di lato): né tocco né tenuta
    log.length = 0;
    el.manda('pointerdown', { clientX: 10, clientY: 10, target }); el.manda('pointermove', { clientX: 90, clientY: 12 });
    t.scatta(350); el.manda('pointerup', { clientX: 90, clientY: 12, target });
    assert.ok(!log.some(x => x[2] === true));
    // fuori dagli elementi non succede niente
    log.length = 0;
    el.manda('pointerdown', { clientX: 1, clientY: 1, target: { closest: () => null } }); el.manda('pointerup', { clientX: 1, clientY: 1 });
    assert.deepEqual(log, []);
    // il menu contestuale (la pressione lunga di Android) sugli elementi non si apre
    let fermato = false;
    el.manda('contextmenu', { target, preventDefault: () => { fermato = true; } });
    assert.ok(fermato);
    c.stacca();
    assert.equal(el.quanti('pointerdown'), 0);
});
