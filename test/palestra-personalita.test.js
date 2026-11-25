'use strict';
// Lo stile di gioco della CPU nella palestra (docs/palestra-ui.js, docs/palestra.js, docs/team-sito.js, docs/battle-ui.js):
//   - dove si imposta la palestra, ogni tappa ha il suo "CPU style": Auto (con lo stile che la CPU suggerisce dal team e dall'allenamento) o uno scelto dal capopalestra;
//   - "Auto" non si salva (è l'assenza del campo), una scelta sì, e un valore strano nel database vale Auto;
//   - nel simulatore la CPU della tappa gioca con lo stile scelto, o con quello suggerito se la scelta è Auto;
//   - le altre prove contro la CPU hanno il loro stile a sorte (il team lo porta con sé), e la pagina carica i moduli nell'ordine giusto.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../docs/palestra.js');
const ST = require('../docs/palestra-stat.js');
const C = require('../docs/cosmetici.js');
const Mem = require('../docs/cpu-memoria.js');
const Cop = require('../docs/cpu-copione.js');
const Pers = require('../docs/cpu-personalita.js');
const { caricaTeamSito } = require('./ayuda-sim.js');

const DOCS = path.join(__dirname, '..', 'docs');
const CODICE = fs.readFileSync(path.join(DOCS, 'palestra-ui.js'), 'utf8');
const leggiFile = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const copia = x => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

const FORMATI = ['VGC Gen 8', 'QWERTY', 'Little Cup'];
// un team con le mosse dei suoi sei Pokémon (come lo salva il Box: pokemon[].mosse)
const MOSSE_COMUNI = [['Earthquake', 'Protect', 'Rock Slide', 'Dragon Claw'], ['Flare Blitz', 'Protect', 'Knock Off', 'Fake Out'], ['Grassy Glide', 'Protect', 'Wood Hammer', 'U-turn'],
    ['Spore', 'Protect', 'Rage Powder', 'Pollen Puff'], ['Hurricane', 'Protect', 'Tailwind', 'Heat Wave'], ['Close Combat', 'Protect', 'Sucker Punch', 'Iron Head']];
const MOSSE_VELOCITA = [['Tailwind', 'Icy Wind', 'Protect', 'Heat Wave'], ['Electroweb', 'Protect', 'Thunder Wave', 'Hurricane'], ['Trick Room', 'Protect', 'Shadow Ball', 'Psychic'],
    ['Fake Out', 'U-turn', 'Protect', 'Close Combat'], ['Earthquake', 'Protect', 'Rock Slide', 'Stone Edge'], ['Surf', 'Protect', 'Ice Beam', 'Muddy Water']];
const NOMI = ['Garchomp', 'Incineroar', 'Rillaboom', 'Amoonguss', 'Tornadus', 'Urshifu'];
const team = (nome, categoria, mosse = MOSSE_COMUNI) => ({ nome, categoria, pokemon: NOMI.map((n, i) => ({ nome: n, mosse: mosse[i] })) });

/** Un copione dove il capopalestra cambia e usa perni di continuo (stile "pivot") */
function copionePivot() {
    const specie = { incineroar: { n: 4, portato: 4, apertura: 4, mosse: { fakeout: 4, uturn: 10, partingshot: 6, flareblitz: 8 }, mosseT1: {}, abilita: null, strumento: null, tera: null },
        rillaboom: { n: 4, portato: 4, apertura: 4, mosse: { grassyglide: 10, woodhammer: 6, uturn: 4 }, mosseT1: {}, abilita: null, strumento: null, tera: null } };
    return Cop.normalizza({ v: Cop.VERSIONE, lezioni: 4, partite: 4, scelte: 80, t: 1, memoria: { v: Mem.VERSIONE, partite: 4, categorie: { attacco: 30, protezione: 6, cambio: 20, altro: 6 }, specie }, contro: {} });
}

/** La pagina con i suoi dati (come in palestra-allenamento-ui.test.js). Ritorna l'html, i cambi di campo, il salvataggio e le scritture nel database */
async function apri({ search = '?edit=1', dati = {}, moduli = true } = {}) {
    const elementi = {};
    const nuovo = id => ({
        id, innerHTML: '', hidden: true, textContent: '', style: {}, gestori: {}, dataset: {},
        classList: { add() {}, toggle() {}, remove() {}, contains: () => false },
        addEventListener(t, f) { (this.gestori[t] = this.gestori[t] || []).push(f); },
        querySelector: () => null, querySelectorAll: () => [], append() {}, prepend() {}, remove() {}, setAttribute() {}, focus() {}
    });
    const el = id => elementi[id] || (elementi[id] = nuovo(id));
    const memoria = new Map();
    const scritture = [];
    const base = {
        'users/u1/name': 'Didi',
        regolamenti: Object.fromEntries(FORMATI.map((f, i) => [`f${i}`, { categoria: f, battleStyle: 'doubles', genRuleValue: 9 }])),
        'players/didi/teams': Object.fromEntries(FORMATI.flatMap((f, i) => [[`t${i}a`, team(`${f} A`, f)], [`t${i}b`, team(`${f} B`, f, MOSSE_VELOCITA)]])),
        'players/didi/info/palestra': { tappe: FORMATI.map((f, i) => ({ formato: `f${i}`, categoria: f, team: `t${i}a`, vantaggio: 'rain' })) }
    };
    const db = Object.assign(base, dati);
    let avvia = null;
    const finestra = {
        Palestra: P, PalestraStat: ST, Cosmetici: C, CpuCopione: Cop, ...(moduli ? { CpuPersonalita: Pers } : {}),
        SpritePkm: { gif: (n, s) => `gif/${n}${s ? '-s' : ''}.gif`, riserva() {}, id: x => x },
        location: { search, href: '' },
        localStorage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, v) },
        scrollTo() {}, addEventListener() {}
    };
    finestra.window = finestra;
    const contesto = {
        window: finestra, URLSearchParams, Date, Promise, Math, JSON, Object, Array, String, Number, encodeURIComponent, setTimeout, console,
        document: { getElementById: el, title: '', createElement: () => nuovo('x'), querySelector: () => null, body: nuovo('body'), head: nuovo('head'), documentElement: { style: { setProperty() {} } } },
        firebase: {
            auth: () => ({ onAuthStateChanged: cb => { avvia = cb; } }),
            database: () => ({ ref: p => ({
                once: async () => ({ val: () => copia(db[p]) }),
                set: async v => { scritture.push(['set', p, copia(v)]); db[p] = copia(v); },
                remove: async () => { scritture.push(['remove', p]); db[p] = null; }
            }) })
        }
    };
    contesto.window = finestra;
    vm.createContext(contesto);
    vm.runInContext(CODICE, contesto);
    await avvia({ uid: 'u1' });
    const corpo = el('pal-corpo');
    const clic = e => Promise.all((corpo.gestori.click || []).map(f => f(e)));
    return {
        html: () => corpo.innerHTML,
        scritture,
        // cambia un campo di una tappa (formato, team, vantaggio, personalita)
        cambia: (i, campo, valore) => { const sel = { dataset: { campo }, value: valore, closest: s => (s === '.pal-tappa' ? { dataset: { i: String(i) } } : null) }; for (const f of corpo.gestori.change || []) f({ target: { closest: s => (s === 'select[data-campo]' ? sel : null) } }); },
        salva: () => clic({ target: { closest: () => ({ id: 'pal-salva', disabled: false, dataset: {} }) } })
    };
}
const rigaTappa = (html, i) => (html.split('<article class="pal-tappa"')[i + 1] || '').split('</article>')[0];
const selectStile = riga => (riga.match(/<label>CPU style<select data-campo="personalita"([^>]*)>([\s\S]*?)<\/select><\/label>/) || []);
const opzioniDi = riga => [...(selectStile(riga)[2] || '').matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map(m => ({ valore: m[1], scelta: !!m[2], testo: m[3] }));
const notaStile = riga => ((riga.match(/<p class="pal-descr pal-stile">([^<]*)<\/p>/) || [])[1] || '').replace(/&#39;/g, "'");

// ---------------------------------------------------------------- dove si imposta la palestra
test('ogni tappa ha il suo "CPU style": Auto più i sei stili, e senza altro dati è Auto con la CPU di sempre', async () => {
    const pag = await apri();
    const h = pag.html();
    for (let i = 0; i < 3; i++) {
        const r = rigaTappa(h, i), o = opzioniDi(r);
        assert.deepEqual(o.map(x => x.valore), ['', ...Pers.ELENCO], `tappa ${i + 1}: Auto e poi ogni stile`);
        assert.deepEqual(o.filter(x => x.scelta).map(x => x.valore), [''], 'di base è Auto');
        assert.deepEqual(o.slice(1).map(x => x.testo), Pers.ELENCO.map(id => Pers.info(id).nome));
        assert.doesNotMatch(selectStile(r)[1], /disabled/, 'con un team scelto si può scegliere');
    }
    // un team comune (una mossa di velocità e di campo qua e là) non ha uno stile marcato: Auto con la CPU equilibrata, e la nota dice cosa vuol dire
    const r0 = rigaTappa(h, 0);
    assert.equal(opzioniDi(r0)[0].testo, 'Auto · Balanced');
    assert.equal(notaStile(r0), `Balanced: ${Pers.info('equilibrata').breve}.`);
    // la descrizione completa sta nel suggerimento che compare sopra la scelta
    assert.match(selectStile(r0)[1], new RegExp(`title="${Pers.info('equilibrata').descrizione.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
});

test('"Auto" suggerisce lo stile che somiglia al team (dalle sue mosse) e dice perché', async () => {
    const pag = await apri({ dati: { 'players/didi/info/palestra': { tappe: FORMATI.map((f, i) => ({ formato: `f${i}`, categoria: f, team: i === 1 ? `t${i}b` : `t${i}a`, vantaggio: 'rain' })) } } });
    const h = pag.html();
    // la tappa 2 ha il team costruito sul controllo della velocità
    const r = rigaTappa(h, 1);
    assert.equal(opzioniDi(r)[0].testo, 'Auto · Speed control');
    assert.equal(notaStile(r), `Speed control: ${Pers.info('velocita').breve}. From the team: several of its Pokémon can control speed.`);
    // le altre no
    assert.equal(opzioniDi(rigaTappa(h, 0))[0].testo.startsWith('Auto'), true);
    assert.doesNotMatch(opzioniDi(rigaTappa(h, 0))[0].testo, /Speed control/);
});

test('"Auto" suggerisce dall\'allenamento (come hai giocato il team), e quello conta più delle mosse', async () => {
    const pag = await apri({ dati: { 'players/didi/palestraAllenamento': { t0a: copionePivot() } } });
    const r = rigaTappa(pag.html(), 0);
    assert.equal(opzioniDi(r)[0].testo, 'Auto · Pivot');
    assert.equal(notaStile(r), `Pivot: ${Pers.info('pivot').breve}. From your training: you switch and pivot a lot.`);
    // la tappa 3 non ha allenamento: la sua nota non parla di allenamento
    assert.doesNotMatch(notaStile(rigaTappa(pag.html(), 2)), /training/);
});

test('chi sceglie uno stile lo vede scelto, con la sua descrizione, e salvando finisce nella tappa: Auto non si salva', async () => {
    const pag = await apri({ dati: { 'players/didi/palestraAllenamento': { t0a: copionePivot() } } });
    pag.cambia(0, 'personalita', 'aggressiva');
    pag.cambia(2, 'personalita', 'campo');
    let h = pag.html();
    assert.deepEqual(opzioniDi(rigaTappa(h, 0)).filter(x => x.scelta).map(x => x.valore), ['aggressiva']);
    assert.equal(notaStile(rigaTappa(h, 0)), `Aggressive: ${Pers.info('aggressiva').breve}.`);
    assert.deepEqual(opzioniDi(rigaTappa(h, 1)).filter(x => x.scelta).map(x => x.valore), [''], 'la tappa 2 resta Auto');
    await pag.salva();
    const salvato = pag.scritture.find(x => x[0] === 'set' && x[1] === 'players/didi/info/palestra');
    assert.ok(salvato, 'la palestra è stata salvata');
    const tappe = salvato[2].tappe;
    assert.equal(tappe[0].personalita, 'aggressiva');
    assert.ok(!('personalita' in tappe[1]), 'Auto: nessun campo nel database');
    assert.equal(tappe[2].personalita, 'campo');
    for (const t of tappe) assert.deepEqual(Object.keys(t).filter(k => !['formato', 'categoria', 'team', 'vantaggio', 'personalita'].includes(k)), [], 'niente altro nella tappa');
    // tornando ad Auto il campo sparisce
    pag.cambia(0, 'personalita', '');
    await pag.salva();
    const secondo = pag.scritture.filter(x => x[0] === 'set' && x[1] === 'players/didi/info/palestra').pop()[2].tappe;
    assert.ok(!('personalita' in secondo[0]), 'Auto di nuovo: via il campo');
    assert.equal(secondo[2].personalita, 'campo', 'l\'altra scelta resta');
});

test('una palestra salvata con uno stile lo mostra scelto; un valore strano nel database vale Auto e non si risalva', async () => {
    const tappe = FORMATI.map((f, i) => ({ formato: `f${i}`, categoria: f, team: `t${i}a`, vantaggio: 'rain', ...(i === 0 ? { personalita: 'velocita' } : i === 1 ? { personalita: 'inventata' } : {}) }));
    const pag = await apri({ dati: { 'players/didi/info/palestra': { tappe } } });
    const h = pag.html();
    assert.deepEqual(opzioniDi(rigaTappa(h, 0)).filter(x => x.scelta).map(x => x.valore), ['velocita']);
    assert.deepEqual(opzioniDi(rigaTappa(h, 1)).filter(x => x.scelta).map(x => x.valore), [''], 'uno stile che non esiste vale Auto');
    await pag.salva();
    const salvate = pag.scritture.find(x => x[0] === 'set')[2].tappe;
    assert.equal(salvate[0].personalita, 'velocita');
    assert.ok(!('personalita' in salvate[1]), 'lo stile strano non si riscrive');
});

test('senza un team nella tappa lo stile non si sceglie; senza il modulo la pagina non lo mostra e salva come prima', async () => {
    const pag = await apri({ dati: { 'players/didi/info/palestra': null } });
    for (let i = 0; i < 3; i++) {
        const r = rigaTappa(pag.html(), i);
        assert.match(selectStile(r)[1], /disabled/);
        assert.equal(opzioniDi(r)[0].testo, 'Auto');
        assert.match(notaStile(r), /^Pick a team and the CPU suggests the style that fits it best\.$/);
    }
    const senza = await apri({ moduli: false });
    assert.doesNotMatch(senza.html(), /CPU style/);
    await senza.salva();
    const salvate = senza.scritture.find(x => x[0] === 'set')[2].tappe;
    for (const t of salvate) assert.ok(!('personalita' in t));
});

// ---------------------------------------------------------------- la parte pura
test('tappeDi: lo stile scelto c\'è solo se c\'è, le tappe di prima restano uguali', () => {
    const cfg = { tappe: [{ formato: 'a', categoria: 'A', team: 't1', vantaggio: 'rain' }, { formato: 'b', categoria: 'B', team: 't2', vantaggio: 'sun', personalita: 'pivot' }, { formato: 'c', categoria: 'C', team: 't3', vantaggio: 'sand', personalita: '' }] };
    const t = P.tappeDi(cfg);
    assert.deepEqual(t[0], { formato: 'a', categoria: 'A', team: 't1', vantaggio: 'rain' }, 'senza stile la tappa è com\'era');
    assert.deepEqual(t[1], { formato: 'b', categoria: 'B', team: 't2', vantaggio: 'sun', personalita: 'pivot' });
    assert.ok(!('personalita' in t[2]), 'vuoto vale niente');
    // la validazione non chiede niente di più
    assert.deepEqual(P.problemi({ tappe: cfg.tappe.map(x => ({ ...x })) }, { regolamenti: {} }).length > 0, true);
});

// ---------------------------------------------------------------- nel simulatore
test('stileDellaTappa: la scelta del capopalestra, o (Auto) quella che la CPU suggerisce dall\'allenamento e dal team', async () => {
    globalThis.self = globalThis;
    globalThis.CpuPersonalita = Pers;
    const { stileDellaTappa } = await caricaTeamSito();
    const testo = x => x.map(m => `Pokémon\n${m.map(a => `- ${a}`).join('\n')}`).join('\n\n');
    const velocita = testo(MOSSE_VELOCITA), comune = testo(MOSSE_COMUNI);
    // scelto: vale, qualunque cosa dicano team e allenamento
    assert.equal(stileDellaTappa({ personalita: 'aggressiva' }, velocita, copionePivot()), 'aggressiva');
    assert.equal(stileDellaTappa({ personalita: 'stato' }, comune, null), 'stato');
    // Auto (nessun campo, vuoto, strano): lo stile suggerito
    for (const auto of [undefined, '', 'auto', 'inventata']) assert.equal(stileDellaTappa({ personalita: auto }, velocita, null), 'velocita', `Auto (${auto}): dalle mosse del team`);
    assert.equal(stileDellaTappa({}, velocita, copionePivot()), 'pivot', 'l\'allenamento conta più delle mosse');
    assert.equal(stileDellaTappa({}, comune, null), 'equilibrata', 'un team qualunque, senza allenamento, resta equilibrato');
    assert.equal(stileDellaTappa(undefined, '', null), 'equilibrata');
    // senza il modulo: niente stile (la CPU di sempre)
    delete globalThis.CpuPersonalita;
    assert.equal(stileDellaTappa({ personalita: 'pivot' }, velocita, null), null);
    globalThis.CpuPersonalita = Pers;
});

test('il simulatore porta lo stile della tappa alla CPU, e le altre prove hanno il loro (sorteggiato con il team)', () => {
    const battle = leggiFile('battle-ui.js'), partita = leggiFile('cpu-partita.js'), sito = leggiFile('team-sito.js');
    // palestra: caricaTappaPalestra lo calcola e lo restituisce, preparaPalestra lo mette nella CPU, avviaBattaglia lo dà al cervello
    assert.match(sito, /const personalita = stileDellaTappa\(tappa, testo, copione\);/);
    assert.match(sito, /aspetto, musica: aspetto\.musica, copione, personalita \}/);
    assert.match(battle, /copione: gym\.copione \|\| null, personalita: gym\.personalita \|\| null \}/);
    assert.match(battle, /nuovoCervello\('p2', \{[^}]*personalita: personalitaDellaPartita\(\) \}\)/);
    // altrove: quello per cui è stato composto il team; nei Random, a sorte con i pesi di quanto i Pokémon ci si adattano
    const f = battle.slice(battle.indexOf('function personalitaDellaPartita()'), battle.indexOf('// Nuovo set: la logica riparte subito'));
    assert.match(f, /if \(cpu\.palestra\) return P\.esiste\(cpu\.palestra\.personalita\) \? cpu\.palestra\.personalita : null;/);
    assert.match(f, /if \(cpu\.team && P\.esiste\(cpu\.team\.personalita\)\) return cpu\.team\.personalita;/);
    assert.match(f, /cpu\.random[\s\S]*pesiDaAffinita\(P\.affinita\(sets, \{ doppio: \/double\/i\.test\(cpu\.random\.id\) \}\)\)/);
    // il team della CPU nasce per uno stile pescato a sorte; il cervello lo riceve
    assert.match(partita, /import '\.\/cpu-personalita\.js';/);
    assert.ok(partita.indexOf("import './cpu-personalita.js'") < partita.indexOf("import './cpu-ia.js'"), 'prima lo stile, poi il cervello che lo legge');
    assert.ok(partita.indexOf("import './cpu-personalita.js'") > partita.indexOf("import './cpu-copione.js'") && partita.indexOf("import './cpu-personalita.js'") > partita.indexOf("import './cpu-conoscenza.js'"), 'dopo i moduli di cui ha bisogno');
    assert.match(partita, /const stile = pescaPersonalita\(personalita, seme\);/);
    assert.match(partita, /nuovoTeam\(sessione, \{ recenti: ultimi, personalita: stile,/);
    assert.match(partita, /export function nuovoCervello\(lato = 'p2', \{[^}]*personalita = null \} = \{\}\)/);
    assert.match(partita, /self\.CpuIa\.crea\(\{ Dex, lato, piano, meccaniche, avversario, memoria, copione, personalita \}\)/);
    // la CPU non dice mai che stile ha: il nome del team resta "Team N"
    assert.doesNotMatch(battle, /nomeTeam:[^\n]*personalita/);
});

test('la pagina della palestra carica i moduli nell\'ordine giusto: conoscenza, memoria, copione, stili, e poi palestra-ui.js', () => {
    const html = leggiFile('palestra.html');
    const pos = f => html.indexOf(`<script src="${f}"></script>`);
    assert.ok(pos('cpu-conoscenza.js') > -1, 'gli stili leggono gli elenchi di mosse');
    assert.ok(pos('cpu-conoscenza.js') < pos('cpu-personalita.js') && pos('cpu-copione.js') < pos('cpu-personalita.js'), 'dopo ciò di cui hanno bisogno');
    assert.ok(pos('cpu-personalita.js') < pos('palestra-ui.js'));
});

test('il database documenta il campo (e non servono né regole né Functions)', () => {
    const doc = leggiFile('../REGOLE-DATABASE.md');
    assert.match(doc, /personalita/);
    assert.match(doc, /stile (di gioco )?della CPU/i);
});
