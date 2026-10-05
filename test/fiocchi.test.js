'use strict';
// I fiocchi dei Pokémon (docs/fiocchi.js) e le serie reali per Pokémon di docs/statistiche.js:
// - livelli e soglie, progresso verso il livello successivo, soglia minima per le percentuali;
// - i match in panchina non allungano né spezzano le serie;
// - ricerca del Pokémon (soprannomi, maiuscole), una sola lettura da Firebase;
// - HTML dello scaffale e delle medagliette, medaglia di ripiego quando manca la PNG;
// - ogni immagine citata esiste nel sito oppure è nell'elenco di quelle ancora da caricare.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../docs/fiocchi.js');
const { calcola: calcolaStatistiche } = require('../docs/statistiche.js');

const DOCS = path.join(__dirname, '..', 'docs');
const perId = (lista, id) => lista.find(f => f.id === id);

// ---------- livelli e soglie ----------
test('livelloDi: bronzo, argento e oro alle soglie (incluse)', () => {
    assert.equal(F.livelloDi(0, [10, 30, 60]), 0);
    assert.equal(F.livelloDi(9, [10, 30, 60]), 0);
    assert.equal(F.livelloDi(10, [10, 30, 60]), 1);
    assert.equal(F.livelloDi(29, [10, 30, 60]), 1);
    assert.equal(F.livelloDi(30, [10, 30, 60]), 2);
    assert.equal(F.livelloDi(60, [10, 30, 60]), 3);
    assert.equal(F.livelloDi(500, [10, 30, 60]), 3);
});

test('il catalogo ha nove fiocchi con tre soglie crescenti e almeno un\'immagine ciascuno', () => {
    assert.equal(F.CATALOGO.length, 9);
    const ids = new Set();
    for (const f of F.CATALOGO) {
        assert.ok(!ids.has(f.id), 'id doppio ' + f.id);
        ids.add(f.id);
        assert.equal(f.soglie.length, 3, f.id);
        assert.ok(f.soglie[0] < f.soglie[1] && f.soglie[1] < f.soglie[2], 'soglie non crescenti: ' + f.id);
        assert.ok(f.immagini.length === 1 || f.immagini.length === 3, 'immagini: ' + f.id);
        assert.ok(f.descrizione && f.unita && f.icona && f.nome, 'testi mancanti: ' + f.id);
    }
});

test('un Pokémon che non ha mai giocato (o senza dati) non prende nulla e ha il progresso a zero', () => {
    for (const p of [null, undefined, {}]) {
        const lista = F.calcola(p);
        assert.equal(lista.length, 9);
        assert.ok(lista.every(f => f.livello === 0 && f.progresso === 0 && f.classeLivello === 'locked'));
        assert.deepEqual(F.guadagnati(lista), []);
    }
});

test('calcola: i livelli dai numeri reali, con progresso verso il successivo', () => {
    const p = {
        portato: 45, koFatti: 80, setPortatoVinti: 9, ultimoVinto: 3, sopravvivenza: 76,
        serie: { vittorieMax: 5, pulitaMax: 1 }, stagioniVinteInCampo: 1, stagioniInCampo: 2
    };
    const l = F.calcola(p);
    assert.equal(perId(l, 'regular').livello, 2);            // 45 sets: argento (40), manca 80 per l'oro
    assert.equal(perId(l, 'regular').prossima, 80);
    assert.equal(perId(l, 'regular').progresso, 45 / 80);        // la barra è quella dei numeri "45 / 80"
    assert.equal(perId(l, 'ko').livello, 3);                  // 80 KO: oro
    assert.equal(perId(l, 'ko').prossima, null);
    assert.equal(perId(l, 'ko').progresso, 1);
    assert.equal(perId(l, 'winner').livello, 0);              // 9 set vinti: manca 1 al bronzo
    assert.equal(perId(l, 'winner').prossima, 10);
    assert.ok(Math.abs(perId(l, 'winner').progresso - 0.9) < 1e-9);
    assert.equal(perId(l, 'laststand').livello, 2);
    assert.equal(perId(l, 'survivor').livello, 2);            // 76% con 45 sets in campo
    assert.equal(perId(l, 'winstreak').livello, 2);           // 5 di fila
    assert.equal(perId(l, 'cleanstreak').livello, 0);
    assert.equal(perId(l, 'champion').livello, 1);
    assert.equal(perId(l, 'friendship').livello, 1);
    assert.equal(perId(l, 'ko').livelloNome, 'Gold');
    assert.equal(perId(l, 'ko').classeLivello, 'gold');
});

test('percentuale di sopravvivenza: sotto i 15 set in campo non conta, e dice quanto manca', () => {
    const poco = perId(F.calcola({ portato: 8, sopravvivenza: 100 }), 'survivor');
    assert.equal(poco.livello, 0);
    assert.equal(poco.progresso, 8 / 15, 'la barra mostra quanto manca ai 15 set');
    assert.deepEqual({ v: poco.sblocco.valore, s: poco.sblocco.serve }, { v: 8, s: 15 });
    assert.match(poco.nota, /needs 15 sets fielded \(now 8\)/);
    // sulla scheda il valore è "8 / 15" come per gli altri fiocchi, la spiegazione sta solo nel tooltip
    const html = F.htmlFiocco(poco);
    assert.match(html, /<div class="fiocco-valore">8 <i>\/ 15<\/i><\/div>/);
    assert.doesNotMatch(html.replace(/<div class="fiocco-tip[\s\S]*$/, ''), /needs/);
    assert.match(html, /fiocco-tip-nota">needs 15 sets fielded \(now 8\)/);
    const abbastanza = perId(F.calcola({ portato: 15, sopravvivenza: 100 }), 'survivor');
    assert.equal(abbastanza.livello, 3);
    assert.equal(abbastanza.nota, '');
});

test('amicizia assegnata a mano: almeno bronzo anche senza stagioni insieme', () => {
    assert.equal(perId(F.calcola({}, { amicizia: true }), 'friendship').livello, 1);
    assert.equal(perId(F.calcola({}, {}), 'friendship').livello, 0);
    assert.equal(perId(F.calcola({ stagioniInCampo: 5 }, { amicizia: true }), 'friendship').livello, 3);   // l'automatico può andare oltre
});

test('guadagnati: dal livello più alto, a parità nell\'ordine del catalogo', () => {
    const l = F.calcola({ portato: 80, koFatti: 15, setPortatoVinti: 30, ultimoVinto: 1, serie: { vittorieMax: 8 } });
    assert.deepEqual(F.guadagnati(l).map(f => f.id), ['regular', 'winstreak', 'winner', 'ko', 'laststand']);
});

test('le immagini: ogni livello usa il suo file (anche le serie e l\'amicizia); il non preso mostra il bronzo', () => {
    const l = F.calcola({ koFatti: 45, serie: { vittorieMax: 8, pulitaMax: 3 }, stagioniInCampo: 2 });
    assert.equal(perId(l, 'ko').immagine, 'immagini/ribbon-ko-silver.png');
    assert.equal(perId(l, 'winstreak').immagine, 'immagini/ribbon-winstreak-gold.png');            // 8 match di fila: la soglia dell'oro
    assert.equal(perId(l, 'cleanstreak').immagine, 'immagini/ribbon-cleanstreak-silver.png');      // 3 di fila: argento
    assert.equal(perId(l, 'friendship').immagine, 'immagini/ribbon-friendship-bronze.png');        // 2 stagioni: bronzo
    assert.equal(perId(l, 'winner').immagine, 'immagini/ribbon-winner-bronze.png');                // non preso: mostra il bronzo
    assert.equal(perId(l, 'champion').immagine, 'immagini/ribbon-champion-bronze.png');
});

// ---------- immagini ----------
test('le immagini dei fiocchi si chiamano tutte ribbon-<id>-<livello>.png, tre per fiocco (i file che mancano li elenca tools/elenco-immagini.cjs)', () => {
    const citate = new Set(F.CATALOGO.flatMap(f => f.immagini).map(p => p.replace(/^immagini\//, '')));
    assert.deepEqual([...citate].sort(), [...F.IMMAGINI].sort());
    // nove fiocchi × tre livelli
    assert.equal(F.IMMAGINI.length, 9 * 3);
    for (const n of F.IMMAGINI) assert.match(n, /^ribbon-[a-z]+-(bronze|silver|gold)\.png$/);
    for (const f of F.CATALOGO) assert.deepEqual(f.immagini.map(p => /-(bronze|silver|gold)\.png$/.exec(p)[1]), ['bronze', 'silver', 'gold'], f.id);
    // quelli già caricati ci sono (con il loro nome): Winner, Survivor e Champion a tre livelli; le serie e l'amicizia, che avevano un file
    // solo, sono l'oro (le immagini sono gialle: argento e bronzo ancora da fare)
    for (const n of ['ribbon-winner-bronze.png', 'ribbon-survivor-gold.png', 'ribbon-champion-silver.png', 'ribbon-winstreak-gold.png', 'ribbon-cleanstreak-gold.png', 'ribbon-friendship-gold.png']) {
        assert.ok(fs.existsSync(path.join(DOCS, 'immagini', n)), n);
    }
});

// ---------- le serie reali per Pokémon (statistiche.js) ----------
const lato = (portati, svenuti, pokemon) => ({
    nome: '', portati, svenuti,
    pokemon: pokemon.map(([specie, o = {}]) => ({ specie, nome: '', portato: true, titolare: false, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o }))
});
const set = (vincitore, mioLato, altro) => ({ v: 1, turni: 6, vincitore, p1: mioLato, p2: altro });
const avversario = lato(4, 4, [['Dragonite'], ['Tornadus'], ['Amoonguss'], ['Rillaboom']]);
function matchDi(numero, s1, s2, sets) {
    return {
        player1: 'Didi', player1Id: 'didi', player2: 'Lu', player2Id: 'lu',
        winnerId: s1 > s2 ? 'didi' : 'lu', team1: 'Alfa', team2: 'Beta', score: `${s1}-${s2}`,
        p1score: s1, p2score: s2, p1points: 0, p2points: 0, categoria: 'VGC', data: `2026-03-0${numero}`,
        setStats: Object.fromEntries(sets.map((st, i) => ['set' + (i + 1), st]))
    };
}
// A: vince 2-0 (Garchomp, Rotom, Incineroar nel set 1) · B: vince 2-1 (Rotom in panchina) · C: vince 2-0 · D: perde 0-2
const G = ['Garchomp', { koFatti: 2 }], R = ['Rotom-Wash', { koFatti: 1 }], I = ['Incineroar', { svenuto: true }];
const Rpanchina = ['Rotom-Wash', { portato: false }];
const matchA = matchDi(1, 2, 0, [set('p1', lato(3, 1, [G, R, I]), avversario), set('p1', lato(2, 0, [G, R, ['Incineroar', { portato: false }]]), avversario)]);
const matchB = matchDi(2, 2, 1, [set('p1', lato(3, 0, [G, Rpanchina, ['Incineroar']]), avversario), set('p2', lato(3, 3, [G, Rpanchina, ['Incineroar', { svenuto: true }]]), avversario), set('p1', lato(2, 0, [G, Rpanchina, ['Incineroar']]), avversario)]);
const matchC = matchDi(3, 2, 0, [set('p1', lato(2, 0, [G, R]), avversario), set('p1', lato(2, 0, [G, R]), avversario)]);
const matchD = matchDi(4, 0, 2, [set('p2', lato(2, 2, [G, R]), avversario), set('p2', lato(2, 2, [G, R]), avversario)]);
const DATI = {
    seasons: {
        s1: { info: { name: 'Season 1', status: 'closed' }, showdowns: { sd1: { info: { categoria: 'VGC', data: '2026-03-01' }, matches: { match1: matchA, match2: matchB, match3: matchC, match4: matchD } } } }
    },
    players: {
        didi: { info: { name: 'Didi' }, teams: { t1: { nome: 'Alfa', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }, { nome: 'Rotom-Wash' }, { nome: 'Incineroar' }, { nome: 'Amoonguss' }] } } },
        lu: { info: { name: 'Lu' }, teams: { t1: { nome: 'Beta', categoria: 'VGC', pokemon: [{ nome: 'Dragonite' }] } } }
    }
};
const stat = calcolaStatistiche(DATI, { stagione: 'all' });
const mostro = specie => F.trova(stat, { player: 'Didi', team: 'alfa', specie });

test('serie reali: contano solo i match in cui il Pokémon è sceso in campo', () => {
    const g = mostro('Garchomp'), r = mostro('Rotom-Wash'), i = mostro('Incineroar');
    // Garchomp: sempre in campo → A, B, C vinti di fila, poi D perso
    assert.equal(g.serie.matchPortato, 4);
    assert.equal(g.serie.matchVinti, 3);
    assert.equal(g.serie.vittorieMax, 3);
    assert.equal(g.serie.vittorieAttuale, 0);
    // pulita: A (2-0) sì, B (2-1) la spezza, C (2-0) di nuovo → massimo 1
    assert.equal(g.serie.pulitaMax, 1);
    // Rotom: in panchina nel match B, che non spezza la serie: A e C vinti di fila, poi D perso
    assert.equal(r.serie.matchPortato, 3);
    assert.equal(r.serie.vittorieMax, 2);
    assert.equal(r.serie.pulitaMax, 2);
    // Incineroar: in campo in A (set 1) e in B → due vittorie; in C e D non c'era
    assert.equal(i.serie.matchPortato, 2);
    assert.equal(i.serie.vittorieMax, 2);
    assert.equal(i.serie.vittorieAttuale, 2);
});

test('statistiche: presenze reali, KO, set vinti, sopravvivenza e stagioni arrivano fino al singolo Pokémon', () => {
    const g = mostro('Garchomp'), r = mostro('Rotom-Wash'), i = mostro('Incineroar');
    assert.equal(g.portato, 9);                 // A 2 + B 3 + C 2 + D 2
    assert.equal(g.koFatti, 18);
    assert.equal(g.setPortatoVinti, 6);
    assert.equal(g.setPortatoPersi, 3);
    assert.equal(g.sopravvivenza, 100);
    assert.equal(r.portato, 6);                 // in panchina in tutto il match B
    assert.equal(r.koFatti, 6);
    assert.equal(r.setPortatoVinti, 4);
    assert.equal(r.setPortatoPersi, 2);
    assert.equal(i.portato, 4);                 // A set 1 e B set 1, 2, 3
    assert.equal(i.sopravvivenza, 50);          // 2 volte KO su 4 set
    // stagioni: il team ha giocato e vinto la stagione, e questi tre sono scesi in campo
    for (const x of [g, r, i]) { assert.equal(x.stagioniGiocate, 1); assert.equal(x.stagioniVinte, 1); assert.equal(x.stagioniInCampo, 1); assert.equal(x.stagioniVinteInCampo, 1); }
});

test('chi non scende mai in campo non prende nulla dalla stagione del suo team', () => {
    const a = mostro('Amoonguss');
    assert.ok(a, 'il Pokémon del roster esiste anche senza set');
    assert.equal(a.portato, 0);
    assert.equal(a.stagioniGiocate, 1);          // il team sì
    assert.equal(a.stagioniVinte, 1);
    assert.equal(a.stagioniInCampo, 0);          // lui no
    assert.equal(a.stagioniVinteInCampo, 0);
    const l = F.calcola(a);
    assert.equal(perId(l, 'champion').livello, 0);
    assert.equal(perId(l, 'friendship').livello, 0);
    assert.deepEqual(F.guadagnati(l), []);
});

test('i fiocchi di un Pokémon vero: calcolati dalle sue statistiche', () => {
    const g = F.calcola(mostro('Garchomp')), r = F.calcola(mostro('Rotom-Wash'));
    assert.equal(perId(g, 'winstreak').livello, 1);      // 3 match di fila: bronzo
    assert.equal(perId(g, 'cleanstreak').livello, 0);    // massimo 1
    assert.equal(perId(r, 'cleanstreak').livello, 1);    // 2 puliti di fila (il match in panchina non li spezza)
    assert.equal(perId(r, 'regular').livello, 0);        // 6 set su 15
    assert.equal(perId(r, 'regular').valore, 6);
    assert.equal(perId(g, 'champion').livello, 1);       // il suo team ha vinto la stagione e lui c'era
    assert.equal(perId(g, 'survivor').livello, 0);       // 100%, ma solo 9 set in campo su 15 richiesti
    assert.match(perId(g, 'survivor').nota, /now 9/);
});

// ---------- ricerca ----------
test('trova: maiuscole, spazi e soprannomi del Box non contano; se non c\'è, null', () => {
    assert.equal(F.trova(stat, { player: ' DIDI ', team: 'ALFA', specie: 'garchomp' }).specie, 'Garchomp');
    assert.equal(F.trova(stat, { player: 'didi', team: 'Alfa', specie: 'Chompy (Garchomp)' }).specie, 'Garchomp');
    assert.equal(F.trova(stat, { player: 'didi', team: 'Alfa', specie: 'Rotom Wash' }).specie, 'Rotom-Wash');   // senza trattino
    assert.equal(F.trova(stat, { player: 'didi', team: 'Gamma', specie: 'Garchomp' }), null);
    assert.equal(F.trova(stat, { player: 'tom', team: 'Alfa', specie: 'Garchomp' }), null);
    assert.equal(F.trova(stat, { player: 'didi', team: 'Alfa' }), null);
    assert.equal(F.trova(null, { player: 'didi', team: 'Alfa', specie: 'Garchomp' }), null);
});

// ---------- caricamento ----------
function dbFinto() {
    const letture = [];
    const nodo = valore => ({ once: async () => ({ val: () => valore }) });
    return {
        letture,
        ref(percorso) { letture.push(percorso); return nodo(percorso === 'seasons' ? DATI.seasons : DATI.players); }
    };
}
test('carica: una sola lettura di stagioni e giocatori per pagina, anche con più richieste insieme', async () => {
    F.svuotaCache();
    const db = dbFinto();
    const [a, b] = await Promise.all([F.carica(db, { calcola: calcolaStatistiche }), F.carica(db, { calcola: calcolaStatistiche })]);
    assert.equal(a, b);
    assert.deepEqual(db.letture.sort(), ['players', 'seasons']);
    assert.ok(F.trova(a, { player: 'didi', team: 'Alfa', specie: 'Garchomp' }));
    await F.carica(db, { calcola: calcolaStatistiche });
    assert.equal(db.letture.length, 2, 'la seconda richiesta usa la cache');
});

test('carica: se la lettura fallisce l\'errore arriva e la prossima richiesta riprova', async () => {
    F.svuotaCache();
    const rotto = { ref: () => ({ once: async () => { throw new Error('offline'); } }) };
    await assert.rejects(F.carica(rotto, { calcola: calcolaStatistiche }), /offline/);
    const db = dbFinto();
    const ok = await F.carica(db, { calcola: calcolaStatistiche });
    assert.ok(ok.pokemon.length > 0);
    F.svuotaCache();
});

// ---------- HTML ----------
test('htmlScaffale: un blocco per fiocco, il conto di quelli presi, i non presi in grigio con il progresso', () => {
    const html = F.htmlScaffale(F.calcola({ portato: 40, koFatti: 0 }));
    assert.equal((html.match(/class="fiocco /g) || []).length, 9);
    assert.match(html, /RIBBONS <small class="fiocchi-conto">1\/9<\/small>/);
    assert.match(html, /fiocco-silver[^>]*data-fiocco="regular"/);
    assert.match(html, /fiocco-bloccato[^>]*data-fiocco="ko"/);
    assert.match(html, /<span class="fiocco-livello">II<\/span>/);
    assert.match(html, /style="width:0%"/);                       // KO: progresso a zero
    assert.match(html, /Next level: 80 sets fielded\./);
    assert.match(html, /onerror="Fiocchi\.immagineMancante\(this,'💥'\)"/);
});

test('htmlScaffale e htmlMini: il testo che entra nell\'HTML è protetto', () => {
    const lista = F.calcola({ portato: 40 });
    lista[0].nome = '<script>alert(1)</script>';
    lista[0].descrizione = 'a "b" & <c>';
    const html = F.htmlScaffale(lista, { titolo: 'X<Y' });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.match(html, /X&lt;Y/);
    assert.match(html, /a &quot;b&quot; &amp; &lt;c&gt;/);
    assert.ok(!F.htmlMini(lista).includes('<script>alert(1)'));
});

test('htmlMini: al massimo tre medagliette (le più alte) e "+n" per le altre; vuoto se non c\'è nulla', () => {
    assert.equal(F.htmlMini(F.calcola({})), '');
    const tutti = F.calcola({ portato: 80, koFatti: 80, setPortatoVinti: 60, ultimoVinto: 6, serie: { vittorieMax: 8, pulitaMax: 5 }, stagioniVinteInCampo: 3, stagioniInCampo: 5 });
    const html = F.htmlMini(tutti, 3);
    assert.equal((html.match(/class="fiocco-mini fiocco-gold"/g) || []).length, 3);
    assert.match(html, /fiocco-altri" title="5 more ribbons">\+5</);
    assert.match(F.htmlMini(F.calcola({ portato: 15 }), 3), /title="Regular · Bronze: 15 sets fielded"/);
});

test('immagineMancante: al posto della PNG compare la medaglia disegnata con l\'icona', () => {
    const creato = [];
    const img = {
        onerror: () => {}, ownerDocument: { createElement: tag => { const e = { tag, attributi: {}, setAttribute(k, v) { this.attributi[k] = v; } }; creato.push(e); return e; } },
        parentNode: { sostituito: null, replaceChild(nuovo, vecchio) { this.sostituito = [nuovo, vecchio]; } }
    };
    F.immagineMancante(img, '🔥');
    assert.equal(img.onerror, null);
    assert.equal(creato[0].tag, 'span');
    assert.equal(creato[0].className, 'fiocco-finto');
    assert.equal(creato[0].textContent, '🔥');
    assert.equal(img.parentNode.sostituito[1], img);
    assert.doesNotThrow(() => F.immagineMancante(null, 'x'));
    assert.doesNotThrow(() => F.immagineMancante({ parentNode: null }, 'x'));
});

// ---------- ordine per vicinanza al prossimo livello ----------
test('perVicinanza: i fiocchi più vicini al prossimo livello in alto, i più lontani in basso, chi ha l\'oro in fondo', () => {
    const l = F.calcola({
        portato: 45, koFatti: 80, setPortatoVinti: 9, ultimoVinto: 3, sopravvivenza: 76,
        serie: { vittorieMax: 5, pulitaMax: 1 }, stagioniVinteInCampo: 1, stagioniInCampo: 2
    });
    const ordine = F.perVicinanza(l).map(f => f.id);
    assert.equal(ordine[0], 'winner', '9 set vinti su 10 per il bronzo: il più vicino');
    assert.equal(ordine[ordine.length - 1], 'ko', '80 KO: oro, non c\'è più niente da prendere');
    for (let i = 1; i < ordine.length - 1; i++) {
        assert.ok(perId(l, ordine[i - 1]).progresso >= perId(l, ordine[i]).progresso, `${ordine[i - 1]} prima di ${ordine[i]}`);
    }
    assert.equal(l[0].id, 'regular', 'la lista di partenza resta nell\'ordine del catalogo');
    // lo scaffale della scheda Pokémon segue lo stesso ordine
    const ids = html => [...html.matchAll(/data-fiocco="([a-z]+)"/g)].map(m => m[1]);
    assert.deepEqual(ids(F.htmlScaffale(l)), ordine);
    assert.deepEqual(ids(F.htmlScaffale(l, { ordina: false })), l.map(f => f.id));
});
