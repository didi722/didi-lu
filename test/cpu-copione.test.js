'use strict';
// Il copione della palestra (docs/cpu-copione.js): il quaderno di appunti con cui la CPU impara come il proprietario gioca i team della sua palestra.
//   - la lezione (da quello che la CPU ha visto giocare), la fusione lezione dopo lezione con il decadimento, il database (oggetti al posto delle liste);
//   - il progresso per la barra (lezioni e Pokémon visti) e la fiducia;
//   - le affinità in anteprima (chi porta, chi apre) e le quote delle mosse.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../docs/cpu-copione.js');
const Mem = require('../docs/cpu-memoria.js');

const reg = (extra = {}) => Object.assign({ n: 1, portato: 1, apertura: 0, mosse: {}, mosseT1: {}, abilita: null, strumento: null, tera: null }, extra);
const SEI = ['incineroar', 'rillaboom', 'amoonguss', 'tornadus', 'urshifurapidstrike', 'garchomp'];

/** Quello che il cervello della CPU ha visto giocare il proprietario in una partita (memoriaDellaPartita) */
function vista({ aperti = ['incineroar', 'rillaboom'], fuori = ['amoonguss', 'tornadus'], extra = {} } = {}) {
    const specie = {};
    for (const s of SEI) specie[s] = reg({ portato: 0 });
    for (const s of [...aperti, ...fuori]) specie[s].portato = 1;
    for (const s of aperti) specie[s].apertura = 1;
    Object.assign(specie.incineroar, { mosse: { fakeout: 2, flareblitz: 3, knockoff: 1 }, mosseT1: { fakeout: 2 } });
    Object.assign(specie.rillaboom, { mosse: { grassyglide: 4, woodhammer: 2 }, mosseT1: { grassyglide: 1 } });
    Object.assign(specie.amoonguss, { mosse: { ragepowder: 3, spore: 2, protect: 1 }, mosseT1: { ragepowder: 1 } });
    return Object.assign({ v: Mem.VERSIONE, partite: 1, categorie: { attacco: 8, protezione: 2, cambio: 1, altro: 5 }, specie }, extra);
}
const AVV = ['Garchomp', 'Tornadus', 'Urshifu-Rapid-Strike', 'Pelipper', 'Kingdra', 'Whimsicott'];

// ---------------------------------------------------------------- la lezione
test('lezione: da quello che la CPU ha visto + chi ha scelto in anteprima; troppo corta o senza scelte = niente da imparare', () => {
    const l = C.lezione({ vista: vista(), avversari: AVV, portati: ['Incineroar', 'Rillaboom', 'Amoonguss', 'Tornadus'], turni: 9 });
    assert.equal(l.peso, 1, 'da 6 turni una lezione vale intera');
    assert.equal(l.turni, 9);
    assert.equal(l.scelte, 19, 'le mosse viste (6 + 6 + 6) e il cambio (1)');
    // contro ognuno dei sei della CPU: ha portato i quattro, due hanno aperto
    assert.deepEqual(Object.keys(l.contro).sort(), ['garchomp', 'kingdra', 'pelipper', 'tornadus', 'urshifu', 'whimsicott']);
    assert.deepEqual(l.contro.garchomp, { n: 1, p: { incineroar: 1, rillaboom: 1, amoonguss: 1, tornadus: 1 }, l: { incineroar: 1, rillaboom: 1 } });
    // metà lezione: vale la metà
    assert.equal(C.lezione({ vista: vista(), avversari: AVV, portati: ['Incineroar'], turni: 3 }).peso, 0.5);
    // sotto i turni minimi, o senza decisioni, o con una memoria rotta: niente
    assert.equal(C.lezione({ vista: vista(), avversari: AVV, portati: [], turni: C.MIN_TURNI - 1 }), null);
    assert.ok(C.lezione({ vista: vista({ extra: { categorie: { attacco: 0, protezione: 0, cambio: 0, altro: 0 } } }), turni: 9 }), 'anche senza le categorie ci sono pur sempre le mosse');
    const povera = vista(); for (const r of Object.values(povera.specie)) { r.mosse = {}; r.mosseT1 = {}; } povera.categorie = { attacco: 1, protezione: 0, cambio: 1, altro: 0 };
    assert.equal(C.lezione({ vista: povera, avversari: AVV, portati: [], turni: 9 }), null, 'meno di MIN_DECISIONI scelte');
    assert.equal(C.lezione({ vista: null, turni: 9 }), null);
    assert.equal(C.lezione({ vista: 'boh', turni: 9 }), null);
    assert.equal(C.lezione(), null);
    // chi ha scelto in anteprima è "portato" anche se non è sceso in campo
    const v = vista({ fuori: ['amoonguss'] });     // tornadus non è mai sceso
    const l2 = C.lezione({ vista: v, avversari: AVV, portati: ['incineroar', 'rillaboom', 'amoonguss', 'tornadus'], turni: 9 });
    assert.equal(l2.memoria.specie.tornadus.portato, 1);
});

test('portatiDaScelta: "team 1342" nella richiesta di anteprima: gli id in ordine, i primi due aprono', () => {
    const richiesta = { teamPreview: true, side: { pokemon: SEI.map(s => ({ details: `${s === 'urshifurapidstrike' ? 'Urshifu-Rapid-Strike' : s[0].toUpperCase() + s.slice(1)}, L50, M`, ident: 'p1: x' })) } };
    assert.deepEqual(C.portatiDaScelta(richiesta, 'team 1342'), ['incineroar', 'amoonguss', 'tornadus', 'rillaboom']);
    assert.deepEqual(C.portatiDaScelta(richiesta, 'team 5'), ['urshifu'], 'la forma nascosta in anteprima: la specie intera');
    assert.equal(C.portatiDaScelta(richiesta, 'move 1'), null);
    assert.equal(C.portatiDaScelta(richiesta, 'team 9'), null, 'un indice che non c\'è');
    assert.equal(C.portatiDaScelta({ side: richiesta.side }, 'team 12'), null, 'non è una anteprima');
    assert.equal(C.portatiDaScelta(null, 'team 12'), null);
});

test('forme nascoste in anteprima ("Urshifu-*"): il Pokémon del Box, quello dell\'anteprima e quello in campo sono lo stesso, con un solo record', () => {
    assert.equal(C.chiaveSpecie('Urshifu-Rapid-Strike'), 'urshifu'); assert.equal(C.chiaveSpecie('Urshifu-*'), 'urshifu'); assert.equal(C.chiaveSpecie('urshifusinglestrike'), 'urshifu');
    assert.equal(C.chiaveSpecie('Arceus-Fairy'), 'arceus'); assert.equal(C.chiaveSpecie('Silvally-Fire'), 'silvally'); assert.equal(C.chiaveSpecie('Dudunsparce-Three-Segment'), 'dudunsparce');
    assert.equal(C.chiaveSpecie('Zacian-Crowned'), 'zaciancrowned', 'quelle che l\'anteprima mostra intere restano come sono');
    assert.equal(C.chiaveSpecie('Rillaboom'), 'rillaboom'); assert.equal(C.chiaveSpecie('Tapu Koko'), 'tapukoko'); assert.equal(C.chiaveSpecie('Porygon-Z'), 'porygonz'); assert.equal(C.chiaveSpecie(null), '');
    // la CPU vede "Urshifu-*" nell'anteprima (n: 1, mai portato) e "Urshifu-Rapid-Strike" quando scende in campo: due record per lo stesso Pokémon
    const v = vista();
    v.specie.urshifu = reg({ portato: 0 });
    v.specie.urshifurapidstrike = reg({ portato: 1, mosse: { surgingstrikes: 3, closecombat: 1 }, mosseT1: { surgingstrikes: 1 } });
    delete v.specie.garchomp;
    const l = C.lezione({ vista: v, avversari: ['Urshifu-*', 'Arceus-Water'], portati: ['Incineroar', 'Urshifu-Rapid-Strike'], turni: 9 });
    assert.deepEqual(Object.keys(l.memoria.specie).filter(k => k.startsWith('urshifu')), ['urshifu']);
    const u = l.memoria.specie.urshifu;
    assert.deepEqual([u.n, u.portato], [1, 1], 'un Pokémon, una partita');
    assert.deepEqual(u.mosse, { surgingstrikes: 3, closecombat: 1 });
    assert.deepEqual(Object.keys(l.contro).sort(), ['arceus', 'urshifu']);
    assert.deepEqual(Object.keys(l.contro.arceus.p).sort(), ['incineroar', 'urshifu']);
    // si ritrova da qualunque nome: Box, anteprima o campo
    const c = C.fondi(null, l);
    for (const nome of ['Urshifu-Rapid-Strike', 'Urshifu-*', 'Urshifu']) assert.equal(C.quotaMossa(c, nome, 'surgingstrikes', true).quota, 1, nome);
    assert.deepEqual(C.progresso(c, ['Incineroar', 'Urshifu-Rapid-Strike']).viste, ['Incineroar', 'Urshifu-Rapid-Strike']);
    assert.ok(C.affinitaGruppo(c, ['Arceus-Fairy'], ['Urshifu-Rapid-Strike']).v > 0.9, 'contro "Arceus-Fairy" vale quello visto contro "Arceus-Water"');
    // singolo: uno solo in apertura
    const s1 = C.lezione({ vista: vista({ aperti: ['incineroar'], fuori: ['rillaboom', 'amoonguss'] }), avversari: AVV, portati: ['Incineroar', 'Rillaboom', 'Amoonguss'], turni: 9, aperti: 1 });
    assert.deepEqual(C.riassuntoLezione(s1).aperture, ['incineroar']);
    assert.deepEqual(Object.keys(s1.contro.garchomp.l), ['incineroar']);
});

// ---------------------------------------------------------------- il copione: fusione e database
test('fondi: lezione dopo lezione le lezioni si sommano (al massimo MAX_LEZIONI), quelle di prima valgono un po\' meno e le cose mai più riviste si dimenticano', () => {
    const l = C.lezione({ vista: vista(), avversari: AVV, portati: ['incineroar', 'rillaboom', 'amoonguss', 'tornadus'], turni: 9 });
    let c = C.fondi(null, l, { adesso: 1000 });
    assert.equal(c.v, C.VERSIONE);
    assert.equal(c.lezioni, 1); assert.equal(c.partite, 1); assert.equal(c.scelte, 19); assert.equal(c.t, 1000);
    assert.equal(c.memoria.specie.incineroar.mosse.flareblitz, 3);
    c = C.fondi(c, l, { adesso: 2000 });
    assert.equal(c.lezioni, 2); assert.equal(c.partite, 2);
    assert.ok(Math.abs(c.memoria.specie.incineroar.mosse.flareblitz - (3 * C.DECADIMENTO + 3)) < 1e-6, 'la lezione di prima vale un po\' meno');
    assert.ok(Math.abs(c.contro.garchomp.n - (C.DECADIMENTO + 1)) < 1e-6);
    // una lezione corta pesa meno
    const corta = C.lezione({ vista: vista(), avversari: AVV, portati: ['incineroar'], turni: 3 });
    assert.equal(C.fondi(null, corta).lezioni, 0.5);
    // tante lezioni: il conteggio si ferma
    let x = null;
    for (let i = 0; i < 30; i++) x = C.fondi(x, l);
    assert.equal(x.lezioni, C.MAX_LEZIONI);
    assert.equal(x.partite, 30);
    // chi non si vede più si dimentica (una mossa, un avversario)
    let y = C.fondi(null, l);
    const altra = C.lezione({ vista: vista({ extra: {} }), avversari: ['Pelipper'], portati: ['incineroar'], turni: 9 });
    altra.memoria.specie.incineroar.mosse = { knockoff: 1 };
    for (let i = 0; i < 60; i++) y = C.fondi(y, altra);
    assert.ok(!('flareblitz' in y.memoria.specie.incineroar.mosse), 'una mossa mai più rivista si dimentica');
    assert.ok(!('garchomp' in y.contro), 'un avversario mai più visto si dimentica');
    assert.ok(y.contro.pelipper.n > 5);
    // niente lezione: resta com'era (ripulito); un copione rotto non rompe niente
    assert.deepEqual(C.fondi(x, null).lezioni, x.lezioni);
    assert.equal(C.fondi({ v: 99 }, l).partite, 1);
    assert.equal(C.fondi('boh', l).lezioni, 1);
});

test('normalizza: solo un copione di questa versione, numeri validi, solo chiavi sicure; il database dà oggetti al posto delle liste e toglie i vuoti', () => {
    assert.equal(C.normalizza(null), null); assert.equal(C.normalizza({}), null); assert.equal(C.normalizza({ v: 99 }), null); assert.equal(C.normalizza('boh'), null);
    const sporco = C.normalizza({ v: 1, lezioni: 99, partite: 2.9, scelte: -4, t: 'x', memoria: 'rotta',
        contro: { garchomp: { n: 2, p: { incineroar: 1, 'a.b': 3, 'x/y': 2, strano: -1, nan: NaN }, l: null }, 'Strana Chiave': { n: 1, p: {} }, vuota: { n: 0, p: { a: 1 } }, ['a'.repeat(50)]: { n: 1 }, rotta: 'x' } });
    assert.equal(sporco.lezioni, C.MAX_LEZIONI, 'un numero di lezioni esagerato si ferma al massimo');
    assert.equal(sporco.partite, 2); assert.equal(sporco.scelte, 0); assert.equal(sporco.t, 0);
    assert.deepEqual(sporco.memoria, Mem.vuota());
    assert.deepEqual(Object.keys(sporco.contro), ['garchomp']);
    assert.deepEqual(sporco.contro.garchomp.p, { incineroar: 1 });
    assert.deepEqual(sporco.contro.garchomp.l, {});
    // un giro nel database: JSON, e le liste diventano oggetti con le chiavi 0, 1... (le "anteprime" qui sono mappe: nessuna lista)
    const l = C.lezione({ vista: vista(), avversari: AVV, portati: ['incineroar', 'rillaboom'], turni: 9 });
    const c = C.fondi(null, l, { adesso: 5 });
    const giro = JSON.parse(JSON.stringify(c));
    assert.deepEqual(C.normalizza(giro), C.normalizza(c));
    // tutto quello che serve è una mappa di numeri: niente di eseguibile finisce nel copione
    assert.ok(Object.keys(C.normalizza(c).contro).every(k => /^[a-z0-9]{1,40}$/.test(k)));
});

// ---------------------------------------------------------------- il progresso
test('progresso: dalle lezioni (OBIETTIVO piene = tutto) e da quanti Pokémon del team sono stati visti giocare; mancano = chi non si è mai visto', () => {
    const l = C.lezione({ vista: vista(), avversari: AVV, portati: ['incineroar', 'rillaboom', 'amoonguss', 'tornadus'], turni: 9 });
    assert.deepEqual(C.progresso(null, SEI), { percento: 0, lezioni: 0, obiettivo: C.OBIETTIVO_LEZIONI, livello: 'nuova', viste: [], mancano: SEI, copertura: 0 });
    let c = null;
    const passi = [];
    for (let i = 0; i < 6; i++) { c = C.fondi(c, l); passi.push(C.progresso(c, SEI)); }
    // quattro Pokémon su sei visti: la copertura è 4/6 e il massimo è 83% (0,5 + 0,5 × 4/6)
    assert.deepEqual(passi[0].viste, ['incineroar', 'rillaboom', 'amoonguss', 'tornadus']);
    assert.deepEqual(passi[0].mancano, ['urshifurapidstrike', 'garchomp']);
    assert.deepEqual(passi.map(p => p.percento), [21, 42, 63, 83, 83, 83]);
    assert.deepEqual(passi.map(p => p.livello), ['impara', 'impara', 'quasi', 'quasi', 'quasi', 'quasi']);
    // con tutti i sei visti si arriva al 100%
    const tutti = C.lezione({ vista: vista({ aperti: ['incineroar', 'rillaboom'], fuori: ['amoonguss', 'tornadus', 'urshifurapidstrike', 'garchomp'] }), avversari: AVV, portati: SEI, turni: 9 });
    let d = null;
    for (let i = 0; i < 4; i++) d = C.fondi(d, tutti);
    assert.equal(C.progresso(d, SEI).percento, 100); assert.equal(C.progresso(d, SEI).livello, 'pronta');
    assert.deepEqual(C.progresso(d, SEI).mancano, []);
    // se il team cambia (due Pokémon nuovi) la barra scende: non si sa come si giocano
    assert.equal(C.progresso(d, ['incineroar', 'rillaboom', 'amoonguss', 'tornadus', 'pikachu', 'raichu']).percento, 83);
    // i nomi veri vanno bene come gli id
    assert.equal(C.progresso(d, ['Incineroar', 'Rillaboom', 'Amoonguss', 'Tornadus', 'Urshifu-Rapid-Strike', 'Garchomp']).percento, 100);
    // senza team niente copertura
    assert.equal(C.progresso(d, []).percento, 50);
});

test('fiducia: cresce con le lezioni fino all\'obiettivo', () => {
    assert.equal(C.fiducia(null), 0);
    assert.equal(C.fiducia(C.vuoto()), 0);
    const l = C.lezione({ vista: vista(), avversari: AVV, portati: ['incineroar', 'rillaboom'], turni: 9 });
    let c = null; const f = [];
    for (let i = 0; i < 5; i++) { c = C.fondi(c, l); f.push(C.fiducia(c)); }
    assert.deepEqual(f, [0.25, 0.5, 0.75, 1, 1]);
});

// ---------------------------------------------------------------- le affinità
test('affinità in anteprima: chi porta di solito contro quella squadra, e in generale', () => {
    // il proprietario contro Garchomp porta sempre Incineroar e Rillaboom; contro Pelipper porta Amoonguss e Tornadus (e apre con loro)
    const controGarchomp = C.lezione({ vista: vista(), avversari: ['Garchomp', 'Kingdra'], portati: ['incineroar', 'rillaboom', 'garchomp', 'urshifurapidstrike'], turni: 9 });
    const controPelipper = C.lezione({ vista: vista({ aperti: ['amoonguss', 'tornadus'], fuori: ['incineroar', 'rillaboom'] }), avversari: ['Pelipper', 'Whimsicott'], portati: ['amoonguss', 'tornadus', 'incineroar', 'rillaboom'], turni: 9 });
    let c = null;
    for (let i = 0; i < 3; i++) { c = C.fondi(c, contro_(controGarchomp)); c = C.fondi(c, contro_(controPelipper)); }
    function contro_(x) { return x; }
    const a = C.affinitaGruppo(c, ['garchomp', 'kingdra', 'x1', 'x2', 'x3', 'x4'], ['incineroar', 'rillaboom', 'garchomp', 'urshifurapidstrike']);
    const b = C.affinitaGruppo(c, ['garchomp', 'kingdra', 'x1', 'x2', 'x3', 'x4'], ['amoonguss', 'tornadus', 'tornadus', 'amoonguss']);
    assert.ok(a.v > b.v + 0.2, `contro Garchomp è più vicino il gruppo che porta di solito (${a.v.toFixed(2)} contro ${b.v.toFixed(2)})`);
    const ap = C.affinitaApertura(c, ['pelipper', 'whimsicott'], ['amoonguss', 'tornadus']);
    const aq = C.affinitaApertura(c, ['pelipper', 'whimsicott'], ['incineroar', 'urshifurapidstrike']);
    assert.ok(ap.v > aq.v, 'contro Pelipper apre con Amoonguss e Tornadus');
    for (const x of [a, b, ap, aq]) { assert.ok(x.v >= 0 && x.v <= 1); assert.ok(x.conf > 0 && x.conf <= 1); }
    // contro una squadra mai vista conta solo quello che porta in generale; di chi non si sa niente non si dice niente
    const generale = C.affinitaGruppo(c, ['mewtwo'], ['incineroar', 'rillaboom']);
    assert.ok(generale && generale.v > 0 && generale.conf > 0);
    assert.equal(C.affinitaGruppo(c, ['mewtwo'], ['pikachu', 'raichu']), null);
    assert.equal(C.affinitaGruppo(null, ['garchomp'], ['incineroar']), null);
    assert.equal(C.affinitaGruppo(c, ['garchomp'], []), null);
    // più lezioni, più sicura
    const una = C.fondi(null, contro_(controGarchomp));
    assert.ok(C.affinitaGruppo(c, ['garchomp'], ['incineroar', 'rillaboom']).conf > C.affinitaGruppo(una, ['garchomp'], ['incineroar', 'rillaboom']).conf);
});

test('quote delle mosse e dei cambi: per Pokémon, primo turno e dopo; il copione le legge come la memoria della serie', () => {
    const l = C.lezione({ vista: vista(), avversari: AVV, portati: ['incineroar'], turni: 9 });
    const c = C.fondi(null, l);
    const t1 = C.quotaMossa(c, 'Incineroar', 'fakeout', true);
    assert.equal(t1.quota, 1); assert.equal(t1.n, 2, 'al primo turno in campo ha fatto solo Fake Out');
    const dopo = C.quotaMossa(c, 'incineroar', 'flareblitz', false);
    assert.equal(dopo.quota, 0.75); assert.equal(dopo.n, 4);
    assert.deepEqual(C.quotaMossa(c, 'pikachu', 'thunderbolt', false), { quota: 0, n: 0 });
    assert.deepEqual(C.quotaMossa(null, 'incineroar', 'fakeout', true), { quota: 0, n: 0 });
    const cambi = C.quotaCambio(c);
    assert.equal(cambi.n, 16); assert.equal(cambi.quota, 1 / 16);
    assert.deepEqual(C.quotaCambio(null), { quota: 0, n: 0 });
});

test('riassuntoLezione: chi ha aperto e le mosse più usate di ogni Pokémon (per dire cosa ha imparato la CPU)', () => {
    const l = C.lezione({ vista: vista(), avversari: AVV, portati: ['incineroar', 'rillaboom', 'amoonguss', 'tornadus'], turni: 9 });
    const r = C.riassuntoLezione(l);
    assert.deepEqual(r.aperture.sort(), ['incineroar', 'rillaboom']);
    assert.equal(r.mosse[0].specie, 'incineroar', 'chi ha fatto più mosse viene prima');
    assert.deepEqual(r.mosse[0].mosse.map(m => m.mossa), ['flareblitz', 'fakeout', 'knockoff']);
    assert.equal(r.mosse[0].mosse.find(m => m.mossa === 'fakeout').primoTurno, true, 'Fake Out è la mossa del primo turno');
    assert.equal(r.mosse[0].mosse.find(m => m.mossa === 'flareblitz').primoTurno, false);
    assert.deepEqual(C.riassuntoLezione(null), { aperture: [], mosse: [] });
});
