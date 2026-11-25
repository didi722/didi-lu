'use strict';
// L'allenamento della CPU nel simulatore (docs/battle-ui.js: preparaAllenamento, salvaLezione, mostraFineAllenamento...). battle-ui.js è un modulo di pagina che non si può
// caricare in Node: qui si prende la sezione dell'allenamento dal sorgente e la si fa girare con un database finto e un cervello finto, per provarne la logica:
//   - la lezione (cosa ha visto la CPU, chi hai portato, contro chi) e la barra che sale mentre giochi;
//   - il salvataggio nel copione (una volta sola per battaglia, in una transazione, con i tentativi che si possono ripetere);
//   - il cartello di fine lezione e l'insegna;
// più il cablaggio della pagina (route, battle.html, app, CSS, database).
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Cop = require('../docs/cpu-copione.js');
const Mem = require('../docs/cpu-memoria.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
const SORGENTE = leggi('battle-ui.js');

// la sezione dell'allenamento: da nomeSpecieDex fino all'avvio di una battaglia
const da = SORGENTE.indexOf('const nomeSpecieDex = ');
const a = SORGENTE.indexOf('// Avvio di una battaglia (un set)');
assert.ok(da > 0 && a > da, 'la sezione dell\'allenamento c\'è nel sorgente');
const SEZIONE = SORGENTE.slice(da, a);

const SEI = ['Garchomp', 'Incineroar', 'Rillaboom', 'Amoonguss', 'Tornadus', 'Urshifu-Rapid-Strike'];
const AVVERSARI = ['Rayquaza', 'Hatterene', 'Iron Hands', 'Kyogre', 'Incineroar', 'Ogerpon'];

/** Quello che la CPU ha visto giocare il proprietario (memoriaDellaPartita) */
function vista({ turniMosse = 3 } = {}) {
    const specie = {};
    SEI.forEach(n => { specie[Cop.chiaveSpecie(n)] = { n: 1, portato: 0, apertura: 0, mosse: {}, mosseT1: {}, abilita: null, strumento: null, tera: null }; });
    ['garchomp', 'incineroar', 'rillaboom', 'amoonguss'].forEach((k, i) => { specie[k].portato = 1; if (i < 2) specie[k].apertura = 1; });
    specie.garchomp.mosse = { earthquake: turniMosse, protect: 1 }; specie.garchomp.mosseT1 = { protect: 1 };
    specie.incineroar.mosse = { fakeout: 2, flareblitz: 2 }; specie.incineroar.mosseT1 = { fakeout: 1 };
    return { v: Mem.VERSIONE, partite: 1, categorie: { attacco: 6, protezione: 1, cambio: 0, altro: 1 }, specie };
}

/**
 * La pagina finta: il database (una transazione che si può far fallire), un cervello con turno e memoria, i nodi come oggetti semplici.
 * Ritorna l'ambiente: le funzioni dell'allenamento e tutto quello che la pagina ha fatto (esiti mostrati, scritture, navigazioni).
 */
function ambiente({ turno = 8, tipo = 'doubles', copione = null, vistaPartita = vista(), fallisce = 0 } = {}) {
    const diario = { esiti: [], scritture: [], transazioni: 0, info: 0, comandi: 0, fine: [], altroTeam: 0 };
    const archivio = { valore: copione ? JSON.parse(JSON.stringify(copione)) : null };
    let rotti = fallisce;
    const riferimento = {
        transaction: async fn => {
            diario.transazioni++;
            if (rotti > 0) { rotti--; throw new Error('permission_denied'); }
            const nuovo = fn(archivio.valore === null ? null : JSON.parse(JSON.stringify(archivio.valore)));
            archivio.valore = nuovo == null ? null : JSON.parse(JSON.stringify(nuovo));
            diario.scritture.push(archivio.valore);
            return { committed: true, snapshot: { val: () => JSON.parse(JSON.stringify(archivio.valore)) } };
        }
    };
    const el = (tag, attributi = {}, ...figli) => ({ tag, attributi: attributi || {}, figli: figli.flat(Infinity).filter(x => x != null && x !== false), append(...altri) { this.figli.push(...altri.flat(Infinity).filter(x => x != null && x !== false)); } });
    const testo = n => (n == null ? '' : typeof n === 'string' || typeof n === 'number' ? String(n) : [n.attributi && n.attributi.testo, ...(n.figli || []).map(testo)].filter(Boolean).join(' '));
    const sandbox = {
        el, console, Math, Date, Promise, Object, Array, String, Number, JSON, Set, Map, setTimeout, parseInt,
        self: { CpuCopione: Cop },
        DexSim: { species: { get: id => ({ exists: true, name: id[0].toUpperCase() + id.slice(1) }) }, moves: { get: id => ({ exists: true, name: id.replace(/(^|\s)\w/g, c => c.toUpperCase()) }) } },
        $: id => ({ id, hidden: false }),
        config: { etichetta: 'Training · Stage 1 · VGC Gen 9', p1: { nome: 'Didi' } },
        finita: false, location: { href: '' },
        window: {}, document: {},
        mostraEsito: (titolo, opz) => { diario.esiti.push({ titolo, sotto: (opz && opz.sotto) || '', corpo: opz && opz.corpo ? testo(opz.corpo) : '', azioni: Array.from((opz && opz.azioni) || [], testo) }); },
        disegnaInfo: () => { diario.info++; }, ridisegnaComandi: () => { diario.comandi++; },
        mostraFineCpu: v => { diario.fine.push(v); }, altroTeamCpu: () => { diario.altroTeam++; }
    };
    sandbox.cpu = {
        cerebro: { turno, tipo, memoriaDellaPartita: () => (turno >= 2 ? vistaPartita : null) },
        team: { specie: AVVERSARI }, problemi: [], avviso: '',
        allenamento: { tappa: 0, riferimento, copione: Cop.normalizza(copione), specieTeam: SEI, portati: ['garchomp', 'incineroar', 'rillaboom', 'amoonguss'], esito: null, salvando: null }
    };
    vm.createContext(sandbox);
    vm.runInContext(`${SEZIONE}\nthis.__f = { lezioneAllenamento, progressoAllenamento, salvaLezione, finisciLezione, mostraFineAllenamento, vociInsegnaAllenamento, azioniAllenamento, cosaHaImparato, barraAllenamento, collegaUscitaAllenamento };`, sandbox);
    return { ...sandbox.__f, sandbox, diario, archivio, testo, riferimento, a: sandbox.cpu.allenamento };
}

// ---------------------------------------------------------------- la lezione
test('lezione: quello che la CPU ha visto, chi hai portato (nell\'ordine: i primi due aprono nel doppio, uno solo nel singolo) e contro chi; troppo presto = niente', () => {
    const e = ambiente();
    const l = e.lezioneAllenamento();
    assert.equal(l.peso, 1, 'otto turni: una lezione piena');
    assert.deepEqual(Object.keys(l.contro).sort(), ['hatterene', 'incineroar', 'ironhands', 'kyogre', 'ogerpon', 'rayquaza'], 'i sei della CPU');
    assert.deepEqual(Object.keys(l.contro.kyogre.l).sort(), ['garchomp', 'incineroar'], 'nel doppio aprono in due');
    assert.deepEqual(Object.keys(l.contro.kyogre.p).sort(), ['amoonguss', 'garchomp', 'incineroar', 'rillaboom']);
    assert.equal(l.memoria.specie.garchomp.mosse.earthquake, 3);
    // singolo: apre uno
    assert.deepEqual(Object.keys(ambiente({ tipo: 'singles' }).lezioneAllenamento().contro.kyogre.l), ['garchomp']);
    // metà partita: pesa meno; troppo presto (la CPU non ha ancora visto niente, o due turni soltanto): niente
    assert.equal(ambiente({ turno: 3 }).lezioneAllenamento().peso, 0.5);
    assert.equal(ambiente({ turno: 2 }).lezioneAllenamento(), null);
    assert.equal(ambiente({ turno: 1 }).lezioneAllenamento(), null);
    // senza anteprima registrata (la scelta non è passata di qui) si impara lo stesso, ma non chi apre dall'anteprima
    const senza = ambiente(); senza.a.portati = null;
    assert.ok(senza.lezioneAllenamento(), 'le mosse ci sono lo stesso');
    // un cervello che si rompe non rompe la pagina
    const rotto = ambiente(); rotto.sandbox.cpu.cerebro.memoriaDellaPartita = () => { throw new Error('boh'); };
    assert.equal(rotto.lezioneAllenamento(), null);
    assert.equal(ambiente({ copione: null }).sandbox.cpu.cerebro.turno, 8);
});

test('barra: la CPU è allenata quanto dicono le lezioni salvate e sale mentre giochi (la lezione in corso conta, più turni più pesa)', () => {
    const e = ambiente({ turno: 3 });
    const { prima, ora } = e.progressoAllenamento();
    assert.equal(prima.percento, 0);
    assert.ok(ora.percento > 0 && ora.percento < 15, `mezza lezione, quattro Pokémon su sei: ${ora.percento}%`);
    const piena = ambiente({ turno: 8 }).progressoAllenamento();
    assert.ok(piena.ora.percento > ora.percento, 'a otto turni vale di più che a tre');
    assert.equal(ambiente({ turno: 1 }).progressoAllenamento().ora.percento, 0, 'all\'inizio ancora niente');
    // con un copione già allenato si parte da lì
    let c = null;
    for (let i = 0; i < 4; i++) c = Cop.fondi(c, Cop.lezione({ vista: vista(), avversari: AVVERSARI, portati: ['garchomp', 'incineroar', 'rillaboom', 'amoonguss'], turni: 8 }));
    const allenata = ambiente({ turno: 8, copione: c }).progressoAllenamento();
    assert.equal(allenata.prima.percento, 83, 'quattro lezioni piene con quattro Pokémon su sei visti');
    assert.ok(allenata.ora.percento >= allenata.prima.percento);
});

// ---------------------------------------------------------------- il salvataggio
test('salvaLezione: una transazione che somma la lezione al copione, una volta sola per battaglia (anche se la chiamano in due); la barra dopo è quella nuova', async () => {
    const e = ambiente();
    const [x, y] = [e.salvaLezione(), e.salvaLezione()];
    assert.equal(x, y, 'due chiamate insieme sono la stessa operazione');
    const esito = await x;
    assert.equal(esito.stato, 'salvata');
    assert.equal(e.diario.transazioni, 1);
    assert.equal(esito.prima.percento, 0);
    assert.ok(esito.dopo.percento > 0);
    const salvato = e.archivio.valore;
    assert.equal(salvato.v, Cop.VERSIONE); assert.equal(salvato.partite, 1); assert.equal(salvato.lezioni, 1);
    assert.equal(salvato.memoria.specie.incineroar.mosse.fakeout, 2);
    assert.ok(salvato.contro.rayquaza, 'cosa porta contro chi');
    assert.deepEqual(Object.keys(e.diario.scritture[0]).sort(), ['contro', 'lezioni', 'memoria', 'partite', 'scelte', 't', 'v'], 'solo il copione, niente altro');
    // una chiamata dopo non scrive più
    assert.equal((await e.salvaLezione()).stato, 'salvata');
    assert.equal(e.diario.transazioni, 1);
    // il copione in pagina è quello nuovo (la battaglia dopo parte da lì)
    assert.equal(e.a.copione.lezioni, 1);
    assert.equal(e.a.esito.stato, 'salvata');
    // con un copione già nel database la lezione si somma (la transazione parte dal valore che c'è)
    const gia = Cop.fondi(null, Cop.lezione({ vista: vista(), avversari: AVVERSARI, portati: ['garchomp', 'incineroar'], turni: 8 }));
    const e2 = ambiente({ copione: gia });
    const esito2 = await e2.salvaLezione();
    assert.equal(e2.archivio.valore.lezioni, 2); assert.equal(e2.archivio.valore.partite, 2);
    assert.ok(esito2.dopo.percento > esito2.prima.percento);
});

test('salvaLezione: troppo corta = niente scritto; se il database rifiuta la lezione resta in sospeso e si può riprovare', async () => {
    const corta = ambiente({ turno: 2 });
    const esito = await corta.salvaLezione();
    assert.equal(esito.stato, 'corta'); assert.equal(esito.lezione, null); assert.equal(corta.diario.transazioni, 0);
    // il database dice di no: errore, e la lezione resta
    const e = ambiente({ fallisce: 1 });
    const male = await e.salvaLezione();
    assert.equal(male.stato, 'errore'); assert.match(male.messaggio, /permission_denied/);
    assert.ok(e.a.pendente, 'la lezione non si perde');
    assert.equal(e.archivio.valore, null);
    // riprovando riesce, con la stessa lezione, e senza contarla due volte
    const bene = await e.salvaLezione();
    assert.equal(bene.stato, 'salvata');
    assert.equal(e.archivio.valore.lezioni, 1);
    assert.equal(e.a.pendente, null);
    assert.equal(e.diario.transazioni, 2);
    // senza allenamento (una prova normale) non fa niente
    const normale = ambiente(); normale.sandbox.cpu.allenamento = undefined;
    assert.equal(await normale.salvaLezione(), null);
});

// ---------------------------------------------------------------- il cartello di fine lezione
test('fine lezione: il titolo dice com\'è andata, il corpo ha la barra con quanto è salita e cosa ha notato la CPU, i pulsanti ripartono o tornano alla palestra', async () => {
    const e = ambiente();
    await e.mostraFineAllenamento('Didi');
    const ultimo = e.diario.esiti[e.diario.esiti.length - 1];
    assert.ok(e.diario.esiti.some(x => x.titolo === 'Saving the lesson…'), 'prima si dice che si sta salvando');
    assert.equal(ultimo.titolo, 'Lesson learned!');
    assert.match(ultimo.sotto, /You won · 8 turns/);
    assert.match(ultimo.corpo, /\d+%\s+Learning\s+1 \/ 4 lessons/i, 'la barra: quanto, a che punto, quante lezioni');
    assert.match(ultimo.corpo, /What the CPU noticed/);
    assert.match(ultimo.corpo, /Leads\s+Garchomp \+ Incineroar/, 'chi apre');
    assert.match(ultimo.corpo, /Incineroar\s+Fake\s?out \(opens\)/i, 'le mosse che usa di più, con quella di apertura');
    assert.match(ultimo.corpo, /Not seen yet:\s+Tornadus, Urshifu-Rapid-Strike/, 'chi non ha ancora visto giocare');
    assert.deepEqual(ultimo.azioni, ['Another training battle', 'Back to my gym']);
    // sconfitta e pareggio, e una lezione corta conta in proporzione
    const p = ambiente({ turno: 3 }); await p.mostraFineAllenamento('CPU');
    const u2 = p.diario.esiti[p.diario.esiti.length - 1];
    assert.equal(u2.titolo, 'Lesson saved');
    assert.match(u2.sotto, /The CPU won · 3 turns: it counts as 50% of a lesson \(a full one is 6 turns\)/);
    const t = ambiente(); await t.mostraFineAllenamento(null);
    assert.match(t.diario.esiti[t.diario.esiti.length - 1].sotto, /It's a tie · 8 turns/);
    // troppo corta
    const c = ambiente({ turno: 2 }); await c.mostraFineAllenamento('Didi');
    const u3 = c.diario.esiti[c.diario.esiti.length - 1];
    assert.equal(u3.titolo, 'Too short to learn from');
    assert.match(u3.sotto, /at least 3 turns/);
    // il database non risponde: lo dice e offre di riprovare (prima azione)
    const r = ambiente({ fallisce: 1 }); await r.mostraFineAllenamento('Didi');
    const u4 = r.diario.esiti[r.diario.esiti.length - 1];
    assert.equal(u4.titolo, "Couldn't save the lesson");
    assert.equal(u4.azioni[0], 'Try again');
    // allenata del tutto: lo dice
    let pronta = null;
    const tutti = ['garchomp', 'incineroar', 'rillaboom', 'amoonguss', 'tornadus', 'urshifu'];
    const vistaTutti = vista(); tutti.forEach(k => { vistaTutti.specie[k].portato = 1; vistaTutti.specie[k].mosse = Object.keys(vistaTutti.specie[k].mosse).length ? vistaTutti.specie[k].mosse : { protect: 2 }; });
    for (let i = 0; i < 3; i++) pronta = Cop.fondi(pronta, Cop.lezione({ vista: vistaTutti, avversari: AVVERSARI, portati: tutti, turni: 8 }));
    const f = ambiente({ copione: pronta, vistaPartita: vistaTutti }); f.a.portati = tutti; await f.mostraFineAllenamento('Didi');
    assert.match(f.diario.esiti[f.diario.esiti.length - 1].corpo, /ready to defend this team/i);
});

test('"End lesson": si smette lì (la partita non va avanti) e si passa al cartello come a fine partita, con la lezione segnata come chiusa prima; "Another battle" parte con un altro team della CPU', () => {
    const e = ambiente({ turno: 4 });
    e.finisciLezione();
    assert.equal(e.sandbox.finita, true);
    assert.equal(e.a.anticipata, true);
    assert.deepEqual(e.diario.fine, [null], 'mostraFineCpu(null)');
    assert.ok(e.diario.comandi >= 1, 'i comandi si ridisegnano (partita finita)');
    // una seconda pressione non fa niente
    e.finisciLezione(); assert.equal(e.diario.fine.length, 1);
    // il cartello dice che si è chiusa prima
    const f = ambiente({ turno: 4 }); f.a.anticipata = true;
    return f.mostraFineAllenamento(null).then(() => { assert.match(f.diario.esiti[f.diario.esiti.length - 1].sotto, /Lesson ended early · 4 turns/); });
});

test('insegna: la tappa, la barra della CPU (sale mentre giochi), a che punto è la lezione (turni su quelli di una lezione intera) e il tasto per chiuderla solo se c\'è già qualcosa da imparare', () => {
    const e = ambiente({ turno: 3 });
    const [etichetta, barra, lezione, fine] = e.vociInsegnaAllenamento();
    assert.equal(etichetta.attributi.testo, 'Training · Stage 1 · VGC Gen 9');
    assert.match(barra.attributi.class, /ins-allenamento/);
    assert.match(barra.attributi['aria-label'], /^CPU training \d+%$/);
    assert.match(e.testo(lezione), /Lesson\s+3\/6/);
    assert.equal(fine.attributi.class, 'ins-lezione-fine');
    assert.equal(fine.figli[0], 'End lesson');
    // piena: la spunta
    const sette = ambiente({ turno: 7 }); assert.match(sette.testo(sette.vociInsegnaAllenamento()[2]), /Lesson\s+✔/);
    // all'inizio niente da chiudere
    assert.equal(ambiente({ turno: 1 }).vociInsegnaAllenamento()[3], null);
    // a partita finita neanche
    const finita = ambiente({ turno: 5 }); finita.sandbox.finita = true;
    assert.equal(finita.vociInsegnaAllenamento()[3], null);
});

// ---------------------------------------------------------------- il cablaggio della pagina
test('la pagina: la route, la validazione della tappa, la registrazione dell\'anteprima, il cervello senza memoria della serie e il copione della palestra', () => {
    assert.match(SORGENTE, /else if \(parametri\.get\('allenamento'\) != null\) preparaAllenamento\(parametri\.get\('team'\), parseInt\(parametri\.get\('allenamento'\), 10\) \|\| 0\);/);
    const blocco = (da, a) => SORGENTE.slice(SORGENTE.indexOf(da), SORGENTE.indexOf(a, SORGENTE.indexOf(da)));
    const prepara = blocco('async function preparaAllenamento(', 'const nomeSpecieDex');
    assert.match(prepara, /ritorno\.href = 'palestra\.html\?edit=1';/);
    assert.match(prepara, /tappa\.team !== chiaveTeam\) throw new Error\('That team is not in your gym: save the gym first\.'\)/, 'si allena solo un team della palestra salvata');
    assert.match(prepara, /players\/\$\{dati\.id\}\/palestraAllenamento\/\$\{chiaveTeam\}/, 'dove sta il copione');
    assert.match(prepara, /conMemoria: false, memoria: null/, 'chi si affronta è la CPU normale: niente memoria della serie');
    assert.ok(!/copione:/.test(blocco('cpu = {', 'config = {')) || /allenamento: \{/.test(prepara), 'la CPU di allenamento non gioca con il copione');
    assert.match(prepara, /collegaUscitaAllenamento\(\);\s*iniziaContro\(cpu\.team\);/);
    // l'anteprima si registra dalla scelta (prima di mandarla al simulatore), solo del giocatore
    assert.match(SORGENTE, /if \(cpu && cpu\.allenamento && lato === 'p1' && p\.grezza && p\.grezza\.teamPreview\) cpu\.allenamento\.portati = self\.CpuCopione\.portatiDaScelta\(p\.grezza, scelta\)/);
    assert.ok(SORGENTE.indexOf('cpu.allenamento.portati = self.CpuCopione.portatiDaScelta') < SORGENTE.indexOf('battaglia.scegli(lato, scelta);\n    disegnaPannello(lato);'));
    // a fine partita: il cartello della lezione al posto di quello della prova; i pulsanti anche nel pannello dei telefoni
    assert.match(SORGENTE, /if \(cpu\.allenamento\) return mostraFineAllenamento\(vincitore\);/);
    assert.match(SORGENTE, /function azioniCpu\(\) \{\s*if \(cpu\.allenamento\) return azioniAllenamento\(\);/);
    // ogni battaglia riparte da capo e il cervello della palestra riceve il copione
    assert.match(SORGENTE, /if \(cpu\.allenamento\) Object\.assign\(cpu\.allenamento, \{ portati: null, esito: null, salvando: null, pendente: null, anticipata: false \}\);/);
    assert.match(SORGENTE, /copione: cpu\.palestra \? cpu\.palestra\.copione : null/);
    assert.match(SORGENTE, /copione: gym\.copione \|\| null, personalita: gym\.personalita \|\| null \}/, 'preparaPalestra tiene il copione del team della tappa e lo stile della CPU');
    // il salvataggio scrive solo il copione di quel team, con una transazione
    assert.match(SEZIONE, /a\.riferimento\.transaction\(attuale => P\.fondi\(attuale, lezione\)\)/);
    assert.equal((SEZIONE.match(/\.set\(|\.update\(|\.remove\(/g) || []).length, 0, 'niente altro viene scritto nel database');
    // l'insegna e l'uscita
    assert.match(SORGENTE, /cpu && cpu\.allenamento \? vociInsegnaAllenamento\(\)\.filter\(Boolean\)/);
    assert.match(SEZIONE, /window\.__primaDiUscire = /);
    assert.match(SEZIONE, /window\.__notaUscita = 'The CPU keeps what it has seen so far\.'/);
});

test('battle.html, app e stile: il pezzo per il cartello, il foglio di stile, e nell\'app la conferma di uscita salva prima la lezione', () => {
    const html = leggi('battle.html');
    assert.match(html, /<div class="esito-corpo" id="corpo-vittoria" hidden><\/div>/);
    assert.match(html, /<link rel="stylesheet" href="style-allenamento\.css">/);
    assert.ok(html.indexOf('style-palestra-battaglia.css') < html.indexOf('style-allenamento.css'), 'dopo il resto');
    const css = leggi('style-allenamento.css');
    for (const c of ['.ins-allenamento', '.ins-all-barra', '.ins-all-riempi', '.ins-lezione-fine', '.esito-corpo', '.all-progresso', '.all-barra', '.all-riempi', '.all-cifre', '.all-nota', '@keyframes all-riempi', 'prefers-reduced-motion']) assert.ok(css.includes(c), c);
    const app = leggi('app-battaglia.css');
    for (const c of ['html.app .ins-allenamento', 'html.app .ins-lezione-fine', 'html.app .all-barra', 'html.app .ins-all-titolo']) assert.ok(app.includes(c), c);
    const js = leggi('app-battaglia.js');
    assert.match(js, /win\.__primaDiUscire/);
    assert.match(js, /win\.__notaUscita/);
    assert.match(js, /esci = \(\) => \{ chiudi\(\);/);
    // le classi che il JS dell'insegna e del cartello scrive hanno il loro stile
    for (const c of ['ins-allenamento', 'ins-lezione', 'all-corpo', 'all-progresso', 'all-percento', 'all-livello', 'all-lezioni', 'all-pronta', 'all-mancano']) assert.ok(SORGENTE.includes(c) || css.includes(c), c);
});

test('database e documentazione: il copione sta in players/<id>/palestraAllenamento/<team>, senza regole nuove, e la CPU di una palestra lo legge dal team della tappa', () => {
    const ts = leggi('team-sito.js');
    assert.match(ts, /players\/\$\{id\}\/palestraAllenamento\/\$\{tappa\.team\}/);
    assert.match(ts, /self\.CpuCopione\.normalizza\(/, 'quello che arriva dal database si ripulisce');
    assert.match(ts, /musica: aspetto\.musica, copione, personalita \}/);
    const regole = fs.readFileSync(path.join(__dirname, '..', 'REGOLE-DATABASE.md'), 'utf8');
    assert.match(regole, /players\/<id>\/palestraAllenamento\/<team>/);
});
