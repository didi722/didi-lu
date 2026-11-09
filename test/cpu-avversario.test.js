'use strict';
// Il modello dell'avversario della CPU (cpu-avversario.js): le abitudini di chi ha davanti (attacco, protezione, cambio, altro), tirate verso la media
// della lega quando i dati sono pochi, aggiornate con quello che si vede in partita, e gli scenari del turno che ne vengono.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../docs/cpu-avversario.js');

const somma = q => A.CATEGORIE.reduce((t, k) => t + q[k], 0);
const vicino = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} non è vicino a ${b}`);

// il nodo players/<id>/stile come lo scrive il workflow
const stile = (azioni, lega) => ({ v: 1, set: 40, azioni, ...(lega ? { lega: { set: 200, azioni: lega } } : {}) });
const AZ_GUARDIANO = { mosse: 190, cambi: 10, attacco: 130, protezione: 40, recupero: 5, potenziamento: 5, campo: 5, supporto: 3, disturbo: 2, altro: 0 };
const AZ_LEGA = { mosse: 960, cambi: 40, attacco: 740, protezione: 100, recupero: 30, potenziamento: 30, campo: 30, supporto: 15, disturbo: 10, altro: 5 };

test('daStile: le quote di attacco, protezione, cambio e "altro" (tutte le altre mosse di stato) dalle somme di un allenatore', () => {
    const p = A.daStile(stile(AZ_GUARDIANO, AZ_LEGA));
    assert.equal(p.set, 40);
    assert.equal(p.giocatore.n, 200);
    vicino(p.giocatore.quote.attacco, 130 / 200);
    vicino(p.giocatore.quote.protezione, 40 / 200);
    vicino(p.giocatore.quote.cambio, 10 / 200);
    vicino(p.giocatore.quote.altro, 20 / 200, 1e-9);
    assert.equal(p.lega.n, 1000);
    vicino(p.lega.quote.protezione, 0.1);
    vicino(somma(p.giocatore.quote), 1);
});

test('daStile: senza dati (nodo mancante, vuoto, sporco) non c\'è un profilo, ma nessun errore', () => {
    for (const vuoto of [null, undefined, {}, { azioni: {} }, { azioni: { attacco: 0 } }, { azioni: { attacco: -5, protezione: 'x' } }, 7, 'testo']) {
        const p = A.daStile(vuoto);
        assert.equal(p.giocatore, null, JSON.stringify(vuoto));
        assert.equal(p.lega, null);
    }
    assert.equal(A.daStile(null).set, 0);
    const soloLega = A.daStile({ lega: { azioni: AZ_LEGA } });
    assert.equal(soloLega.giocatore, null);
    assert.ok(soloLega.lega);
});

test('modello: senza dati si parte dalla media della lega; con un profilo si tiene conto di quanti dati ci sono dietro', () => {
    assert.deepEqual(A.crea(null).quote(), A.QUOTE_LEGA);
    assert.deepEqual(A.crea(A.daStile(null)).quote(), A.QUOTE_LEGA);
    vicino(somma(A.QUOTE_LEGA), 1, 1e-6);
    // 200 decisioni, forza della lega 100: due terzi lui, un terzo la lega
    const m = A.crea(A.daStile(stile(AZ_GUARDIANO, AZ_LEGA)));
    const q = m.quote();
    vicino(q.protezione, (200 / 300) * 0.2 + (100 / 300) * 0.1);
    assert.ok(q.protezione > A.QUOTE_LEGA.protezione + 0.04, 'si para molto più della media');
    vicino(somma(q), 1);
    // con tante decisioni conta quasi solo lui; con poche quasi solo la lega
    const tanti = A.crea({ giocatore: { n: 10000, quote: { attacco: 0.5, protezione: 0.3, cambio: 0.1, altro: 0.1 } }, lega: null }).quote();
    vicino(tanti.protezione, 0.3, 0.005);
    const pochi = A.crea({ giocatore: { n: 5, quote: { attacco: 0.5, protezione: 0.3, cambio: 0.1, altro: 0.1 } }, lega: null }).quote();
    vicino(pochi.protezione, A.QUOTE_LEGA.protezione, 0.015);
});

test('modello: la media della lega scritta nel profilo vale più di quella di riserva; si può cambiare la forza della lega', () => {
    const lega = { n: 1000, quote: { attacco: 0.5, protezione: 0.3, cambio: 0.1, altro: 0.1 } };
    assert.deepEqual(A.crea({ giocatore: null, lega }).quote(), lega.quote);
    const g = { n: 100, quote: { attacco: 1, protezione: 0, cambio: 0, altro: 0 } };
    const meta = A.crea({ giocatore: g, lega }).quote();
    vicino(meta.attacco, 0.75);                  // 100 decisioni, forza 100: metà e metà
    const forte = A.crea({ giocatore: g, lega }, { forzaLega: 0 }).quote();
    vicino(forte.attacco, 1);                    // forza 0: conta solo lui
});

test('osserva: quello che si vede in partita sposta le quote (verso le abitudini vere), poco alla volta', () => {
    const m = A.crea(null);                     // parte dalla media: 73% attacco, 10% protezione
    const prima = m.quote();
    for (let i = 0; i < 10; i++) m.osserva('protezione');          // si para dieci volte di fila
    const dopo = m.quote();
    assert.ok(dopo.protezione > prima.protezione + 0.1, 'la protezione è molto più probabile');
    assert.ok(dopo.attacco < prima.attacco);
    vicino(somma(dopo), 1);
    assert.equal(m.nVisti(), 10);
    assert.deepEqual(m.visti(), { attacco: 0, protezione: 10, cambio: 0, altro: 0 });
    // dopo tanti turni conta quello che si è visto, non la partenza
    for (let i = 0; i < 300; i++) m.osserva('protezione');
    assert.ok(m.quote().protezione > 0.85);
    // categorie sconosciute non contano
    m.osserva('boh'); m.osserva(undefined);
    assert.equal(m.nVisti(), 310);
});

test('osserva: chi gioca come la media non sposta niente; la partenza non cambia (si guarda sempre da lì)', () => {
    const m = A.crea(null);
    const partenza = m.partenza();
    const attese = { attacco: 73, protezione: 10, cambio: 4, altro: 13 };
    for (const k of A.CATEGORIE) for (let i = 0; i < attese[k]; i++) m.osserva(k);
    for (const k of A.CATEGORIE) vicino(m.quote()[k], partenza[k], 0.01);
    assert.deepEqual(m.partenza(), partenza);
});

test('impostaProfilo: un profilo che arriva a partita iniziata cambia la partenza e tiene quello che si è già visto', () => {
    const m = A.crea(null);
    for (let i = 0; i < 20; i++) m.osserva('cambio');
    m.impostaProfilo(A.daStile(stile(AZ_GUARDIANO, AZ_LEGA)));
    assert.equal(m.nVisti(), 20);
    vicino(m.partenza().protezione, A.crea(A.daStile(stile(AZ_GUARDIANO, AZ_LEGA))).partenza().protezione);
    assert.ok(m.quote().cambio > 0.3, 'i venti cambi visti pesano ancora');
});

test('categoriaMossa: la stessa classificazione delle statistiche — attacco, protezione, tutto il resto è "altro"', () => {
    assert.equal(A.categoriaMossa('Earthquake'), 'attacco');
    assert.equal(A.categoriaMossa('fakeout'), 'attacco');
    assert.equal(A.categoriaMossa('Protect'), 'protezione');
    assert.equal(A.categoriaMossa('Wide Guard'), 'protezione');
    for (const m of ['Swords Dance', 'Tailwind', 'Trick Room', 'Helping Hand', 'Thunder Wave', 'Recover', 'Splash']) assert.equal(A.categoriaMossa(m), 'altro', m);
});

// ---------- gli scenari del turno ----------

const pesoTotale = lista => lista.reduce((t, s) => t + s.peso, 0);

test('scenari, singolo: uno per ogni scelta possibile, con le probabilità delle quote', () => {
    const q = { attacco: 0.6, protezione: 0.2, cambio: 0.1, altro: 0.1 };
    const s = A.scenari(q, [{}], { doppio: false });
    assert.deepEqual(s.map(x => x.categorie[0]), ['attacco', 'protezione', 'cambio', 'altro'].sort((a, b) => q[b] - q[a] || 0));
    vicino(pesoTotale(s), 1);
    vicino(s.find(x => x.categorie[0] === 'attacco').peso, 0.6);
    vicino(s.find(x => x.categorie[0] === 'protezione').peso, 0.2);
    assert.ok(s.every(x => x.variante === 0), 'nel singolo non c\'è un altro bersaglio');
});

test('scenari, doppio: gli slot scelgono per conto loro; chi attacca ha due varianti (bersaglio migliore o l\'altro)', () => {
    const q = { attacco: 0.8, protezione: 0.2, cambio: 0, altro: 0 };
    const s = A.scenari(q, [{}, {}], { doppio: true, soglia: 0 });
    vicino(pesoTotale(s), 1);
    // tutti e due attaccano: 0,64 diviso in 0,65 / 0,35
    const aa = s.filter(x => x.categorie[0] === 'attacco' && x.categorie[1] === 'attacco');
    assert.deepEqual(aa.map(x => x.variante).sort(), [0, 1]);
    vicino(aa.find(x => x.variante === 0).peso, 0.64 * 0.65);
    vicino(aa.find(x => x.variante === 1).peso, 0.64 * 0.35);
    // tutti e due si parano: 0,04, nessuna variante (nessuno attacca)
    const pp = s.filter(x => x.categorie[0] === 'protezione' && x.categorie[1] === 'protezione');
    assert.equal(pp.length, 1);
    vicino(pp[0].peso, 0.04);
    // uno attacca e l'altro si para: 0,16 per ciascuno dei due modi, con le due varianti
    const ap = s.filter(x => x.categorie[0] === 'attacco' && x.categorie[1] === 'protezione');
    assert.equal(ap.length, 2);
    vicino(ap[0].peso + ap[1].peso, 0.16);
});

test('scenari: con quasi solo attacco (o senza abitudini da usare) restano le due varianti di oggi, 65/35', () => {
    const s = A.scenari({ attacco: 1, protezione: 0, cambio: 0, altro: 0 }, [{}, {}], { doppio: true });
    assert.equal(s.length, 2);
    vicino(s[0].peso, 0.65);
    vicino(s[1].peso, 0.35);
    assert.ok(s.every(x => x.categorie[0] === 'attacco' && x.categorie[1] === 'attacco'));
    // nel singolo con tutto l'attacco: uno scenario solo
    const singolo = A.scenari({ attacco: 1, protezione: 0, cambio: 0, altro: 0 }, [{}], { doppio: false });
    assert.equal(singolo.length, 1);
    vicino(singolo[0].peso, 1);
});

test('scenari: gli scenari poco probabili si scartano (soglia, massimo) e i pesi restano a somma 1', () => {
    const q = A.QUOTE_LEGA;
    const tutti = A.scenari(q, [{}, {}], { doppio: true, soglia: 0, max: 100 });
    const pochi = A.scenari(q, [{}, {}], { doppio: true, soglia: 0.03, max: 6 });
    assert.ok(tutti.length > pochi.length, 'con la soglia se ne tengono meno');
    assert.ok(pochi.length <= 6);
    assert.ok(pochi.every(x => x.peso > 0));
    vicino(pesoTotale(pochi), 1);
    for (let i = 1; i < pochi.length; i++) assert.ok(pochi[i - 1].peso >= pochi[i].peso, 'dal più probabile');
    // anche con una soglia altissima il più probabile resta
    assert.equal(A.scenari(q, [{}], { soglia: 0.99 }).length, 1);
});

test('scenari: chi non può proteggersi o cambiare non lo fa (il suo peso passa alle altre scelte); chi ha appena protetto lo fa meno', () => {
    const q = { attacco: 0.5, protezione: 0.3, cambio: 0.1, altro: 0.1 };
    const senza = A.scenari(q, [{ fattoreProtezione: 0, puoCambiare: false }], { soglia: 0 });
    assert.deepEqual(senza.map(x => x.categorie[0]).sort(), ['altro', 'attacco']);
    vicino(pesoTotale(senza), 1);
    vicino(senza.find(x => x.categorie[0] === 'attacco').peso, 0.5 / 0.6);
    const dopoProtezione = A.scenari(q, [{ fattoreProtezione: 0.15 }], { soglia: 0 });
    const normale = A.scenari(q, [{}], { soglia: 0 });
    const p = ss => ss.find(x => x.categorie[0] === 'protezione').peso;
    assert.ok(p(dopoProtezione) < p(normale) / 2, 'la seconda protezione di fila è molto meno probabile');
});

test('scenari: gli slot vuoti non entrano, e senza nessuno in campo non ci sono scenari; quote strane non rompono niente', () => {
    const s = A.scenari(A.QUOTE_LEGA, [null, {}], { doppio: true });
    assert.ok(s.every(x => Object.keys(x.categorie).join() === '1'), 'solo lo slot 1');
    assert.deepEqual(A.scenari(A.QUOTE_LEGA, [null, null], { doppio: true }), []);
    assert.deepEqual(A.scenari(A.QUOTE_LEGA, [], {}), []);
    assert.deepEqual(A.scenari(A.QUOTE_LEGA, undefined, {}), []);
    const strane = A.scenari({ attacco: NaN, protezione: -1 }, [{}], {});
    vicino(pesoTotale(strane), 1);
    assert.ok(strane.length >= 1);
});

test('scenari: una abitudine marcata (come Ilaria, che si para nel 16% dei turni) pesa di più nel doppio di quella di Dodo (11%) e di chi non si para mai', () => {
    const ilaria = A.crea({ giocatore: { n: 900, quote: { attacco: 0.71, protezione: 0.163, cambio: 0.039, altro: 0.087 } }, lega: null }).quote();
    const mai = A.crea({ giocatore: { n: 900, quote: { attacco: 0.9, protezione: 0, cambio: 0, altro: 0.1 } }, lega: null }).quote();
    const pesoPara = (q) => A.scenari(q, [{}, {}], { doppio: true, soglia: 0, max: 100 })
        .filter(x => Object.values(x.categorie).includes('protezione')).reduce((t, x) => t + x.peso, 0);
    assert.ok(pesoPara(ilaria) > pesoPara(A.QUOTE_LEGA));
    assert.ok(pesoPara(A.QUOTE_LEGA) > pesoPara(mai));
    assert.ok(pesoPara(mai) < 0.02);
});
