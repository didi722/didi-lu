'use strict';
// L'allenamento della CPU nella pagina della palestra (docs/palestra-ui.js + docs/palestra.js): la pagina vera girata in Node con un DOM finto e un database finto.
//   - dove si imposta la palestra: il pannello "Train CPU" con il totale e il tasto grande, e in ogni carta di tappa la barra di quel team e il suo tasto "Train";
//   - il tasto vale solo per la palestra com'è salvata (se la bozza è diversa si accende dopo il salvataggio);
//   - a chi sfida la palestra il tabellone dice quanto è allenata la CPU (senza leggere i team di nessuno);
//   - la parte pura (palestra.js: pianoAllenamento, urlAllenamento).
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

const CODICE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'palestra-ui.js'), 'utf8');
const copia = x => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

const FORMATI = ['VGC Gen 8', 'QWERTY', 'Little Cup'];
const SEI = ['Garchomp', 'Incineroar', 'Rillaboom', 'Amoonguss', 'Tornadus', 'Urshifu-Rapid-Strike'];
const team = (nome, categoria) => ({ nome, categoria, pokemon: SEI.map(nome => ({ nome })) });
// il copione di un team: `lezioni` lezioni da 8 turni in cui si sono visti giocare i primi `visti` Pokémon
function copione(lezioni, visti) {
    const specie = {};
    SEI.forEach((n, i) => { specie[Cop.chiaveSpecie(n)] = { n: 1, portato: i < visti ? 1 : 0, apertura: i < 2 ? 1 : 0, mosse: i < visti ? { protect: 2, closecombat: 3 } : {}, mosseT1: {}, abilita: null, strumento: null, tera: null }; });
    let c = null;
    for (let i = 0; i < lezioni; i++) c = Cop.fondi(c, Cop.lezione({ vista: { v: Mem.VERSIONE, partite: 1, categorie: { attacco: 10, protezione: 3, cambio: 0, altro: 2 }, specie }, avversari: ['Pikachu'], portati: SEI.slice(0, visti), turni: 8 }));
    return c;
}

/** La pagina con i suoi dati. `search`: '?edit=1' (la propria palestra) o '?player=lukiani' (sfidare). Ritorna l'html, i clic, le scritture nel database */
async function apri({ search = '?edit=1', dati = {} } = {}) {
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
        'players/didi/teams': Object.fromEntries(FORMATI.flatMap((f, i) => [[`t${i}a`, team(`${f} A`, f)], [`t${i}b`, team(`${f} B`, f)]])),
        'players/didi/info/palestra': { tappe: FORMATI.map((f, i) => ({ formato: `f${i}`, categoria: f, team: `t${i}a`, vantaggio: 'rain' })) },
        'players/lukiani/info': { name: 'Lukiani', color: '#3399ff', palestra: { tappe: FORMATI.map((f, i) => ({ formato: `f${i}`, categoria: f, team: `g${i}`, vantaggio: 'rain' })) } }
    };
    const db = Object.assign(base, dati);
    let avvia = null;
    const finestra = {
        Palestra: P, PalestraStat: ST, Cosmetici: C, CpuCopione: Cop,
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
        messaggio: () => el('pal-msg').textContent,
        // cambia un campo di una tappa (formato, team, vantaggio)
        cambia: (i, campo, valore) => { const sel = { dataset: { campo }, value: valore, closest: s => (s === '.pal-tappa' ? { dataset: { i: String(i) } } : null) }; for (const f of corpo.gestori.change || []) f({ target: { closest: s => (s === 'select[data-campo]' ? sel : null) } }); },
        salva: () => clic({ target: { closest: () => ({ id: 'pal-salva', disabled: false, dataset: {} }) } }),
        togli: () => clic({ target: { closest: () => ({ id: 'pal-togli', disabled: false, dataset: {} }) } })
    };
}
const pannello = html => (html.match(/<section class="pal-allena-pannello"[^>]*>[\s\S]*?<\/section>/) || [''])[0];
const rigaTappa = (html, i) => (html.split('<article class="pal-tappa"')[i + 1] || '').split('</article>')[0];

// ---------------------------------------------------------------- la parte pura
test('pianoAllenamento: per ogni tappa il team, la barra e se si può allenare (solo se la palestra salvata ha lo stesso team nella stessa tappa); il tasto grande allena la più indietro', () => {
    const salvata = { tappe: [{ formato: 'f0', categoria: 'A', team: 'a', vantaggio: 'rain' }, { formato: 'f1', categoria: 'B', team: 'b', vantaggio: 'sun' }, { formato: 'f2', categoria: 'C', team: 'c', vantaggio: 'rain' }] };
    const progressi = { a: { percento: 80, livello: 'quasi' }, b: { percento: 20, livello: 'impara' }, c: { percento: 0, livello: 'nuova' }, x: { percento: 100, livello: 'pronta' } };
    const di = id => progressi[id] || null;
    // tutto salvato: parte la tappa con meno allenamento (la 3), la media è 33
    let p = P.pianoAllenamento([{ team: 'a' }, { team: 'b' }, { team: 'c' }], salvata, di);
    assert.deepEqual(p.tappe.map(t => [t.i, t.team, t.percento, t.allenabile, t.perche]), [[0, 'a', 80, true, ''], [1, 'b', 20, true, ''], [2, 'c', 0, true, '']]);
    assert.equal(p.totale, 33); assert.equal(p.prossima, 2);
    assert.equal(p.tappe[0].livello, 'quasi');
    // la bozza cambia il team della tappa 2 e svuota la 3: la 2 vale (ha la sua barra) ma non si allena finché non si salva; la 3 non ha team
    p = P.pianoAllenamento([{ team: 'a' }, { team: 'x' }, { team: '' }], salvata, di);
    assert.deepEqual(p.tappe.map(t => [t.allenabile, t.perche]), [[true, ''], [false, 'save-first'], [false, 'pick-team']]);
    assert.equal(p.tappe[1].percento, 100, 'la barra segue il team, anche se non è ancora nella palestra salvata');
    assert.equal(p.prossima, 0);
    assert.equal(p.totale, 60);
    // senza palestra salvata niente si allena
    p = P.pianoAllenamento([{ team: 'a' }, { team: 'b' }, { team: 'c' }], null, di);
    assert.equal(p.prossima, -1); assert.ok(p.tappe.every(t => t.perche === 'save-first'));
    // a pari allenamento vince la tappa più avanti nell'ordine (la prima)
    p = P.pianoAllenamento([{ team: 'c' }, { team: 'c' }, { team: 'c' }], { tappe: [{ team: 'c' }, { team: 'c' }, { team: 'c' }] }, di);
    assert.equal(p.prossima, 0);
    // dati strani non rompono niente
    p = P.pianoAllenamento(null, undefined, () => ({ percento: 'boh', livello: 3 }));
    assert.equal(p.tappe.length, 3); assert.equal(p.totale, 0); assert.equal(p.prossima, -1);
    p = P.pianoAllenamento([{ team: 'a' }], salvata, () => ({ percento: 250 }));
    assert.equal(p.tappe[0].percento, 100, 'mai oltre il 100%');
});

test('urlAllenamento: la partita di allenamento di una tappa, con il team nell\'indirizzo', () => {
    assert.equal(P.urlAllenamento(1, '-NAbc_d'), 'battle.html?cpu=1&allenamento=1&team=-NAbc_d');
    assert.equal(P.urlAllenamento(0, 'a b&c'), 'battle.html?cpu=1&allenamento=0&team=a%20b%26c');
    assert.equal(P.urlAllenamento('x', null), 'battle.html?cpu=1&allenamento=0&team=');
});

// ---------------------------------------------------------------- dove si imposta la palestra
test('propria palestra: il pannello "Train CPU" con il totale, e in ogni carta la barra di quel team con il suo tasto "Train"', async () => {
    const pag = await apri({ dati: { 'players/didi/palestraAllenamento': { t0a: copione(4, 6), t1a: copione(2, 4) } } });
    const h = pag.html(), pan = pannello(h);
    assert.match(pan, /Train your gym's CPU/);
    assert.match(pan, /The CPU watches who you bring, who you lead with and how you play every move/);
    // tappa 1: 4 lezioni con tutti e sei visti = 100%; tappa 2: 2 lezioni, 4 su 6 visti = 0,5 × 0,833 = 42%; tappa 3: niente = 0% -> media 47
    const barre = [...h.matchAll(/<div class="pal-allena" data-livello="(\w+)"><span class="pal-allena-barra"[^>]*aria-label="Your CPU is (\d+)% trained on this team">/g)].map(m => [m[1], Number(m[2])]);
    assert.deepEqual(barre, [['pronta', 100], ['impara', 42], ['nuova', 0]]);
    assert.match(pan, /<b class="pal-allena-percento">47%<\/b>/);
    assert.match(pan, /data-livello="impara"/);
    assert.match(pan, /Learning your style/);
    // il tasto grande porta alla tappa più indietro (la 3), con il suo team
    assert.match(pan, /<a class="ng-bottone ng-compra pal-allena-via" href="battle\.html\?cpu=1&amp;allenamento=2&amp;team=t2a">Train CPU<\/a>/);
    assert.match(pan, /Next up: stage 3 · 0% trained/);
    // ogni carta ha il suo tasto Train con la sua tappa e il suo team
    for (let i = 0; i < 3; i++) assert.match(rigaTappa(h, i), new RegExp(`<a class="ng-bottone pal-allena-btn" href="battle\\.html\\?cpu=1&amp;allenamento=${i}&amp;team=t${i}a">Train</a>`));
    assert.match(rigaTappa(h, 0), /CPU <b>100%<\/b>/);
    // niente allenamento ancora: tutto a zero, e la CPU "non sa niente"
    const nuova = await apri({});
    assert.match(pannello(nuova.html()), /<b class="pal-allena-percento">0%<\/b>/);
    assert.match(pannello(nuova.html()), /It doesn&#39;t know how you play yet/);
    assert.match(pannello(nuova.html()), /allenamento=0&amp;team=t0a/, 'a pari allenamento parte dalla prima tappa');
});

test('propria palestra: il tasto vale per la palestra com\'è salvata; cambiando un team nella bozza si spegne finché non si salva, e salvando si accende', async () => {
    const pag = await apri({ dati: { 'players/didi/palestraAllenamento': { t1b: copione(3, 5) } } });
    assert.match(rigaTappa(pag.html(), 1), /href="battle\.html\?cpu=1&amp;allenamento=1&amp;team=t1a">Train<\/a>/);
    // la tappa 2 passa al team B (che ha già le sue lezioni): la barra è quella di B, ma il tasto è spento ("Save your gym first")
    pag.cambia(1, 'team', 't1b');
    let r = rigaTappa(pag.html(), 1);
    assert.match(r, /CPU <b>(\d+)%<\/b>/);
    assert.ok(Number(r.match(/CPU <b>(\d+)%/)[1]) > 0, 'la barra segue il team nuovo');
    assert.match(r, /<button type="button" class="ng-bottone pal-allena-btn" disabled title="Save your gym first">Train<\/button>/);
    // il tasto grande non propone una tappa non salvata
    assert.doesNotMatch(pannello(pag.html()), /allenamento=1/);
    // una tappa senza team non ha riga di allenamento
    pag.cambia(2, 'team', '');
    assert.doesNotMatch(rigaTappa(pag.html(), 2), /pal-allena/);
    assert.match(pannello(pag.html()), /allenamento=0/);
    pag.cambia(2, 'team', 't2a');
    // si salva: la palestra salvata è la bozza, e il tasto si accende
    await pag.salva();
    assert.equal(pag.scritture.filter(s => s[0] === 'set' && s[1] === 'players/didi/info/palestra').length, 1);
    r = rigaTappa(pag.html(), 1);
    assert.match(r, /<a class="ng-bottone pal-allena-btn" href="battle\.html\?cpu=1&amp;allenamento=1&amp;team=t1b">Train<\/a>/);
    // togliere la palestra: niente più da allenare
    await pag.togli();
    assert.match(pannello(pag.html()), /<button type="button" class="ng-bottone ng-compra pal-allena-via" disabled>Train CPU<\/button>/);
    assert.match(pannello(pag.html()), /Pick a team for a stage to start training/, 'la bozza si svuota con la palestra');
});

test('propria palestra: senza palestra salvata (e senza copioni) il pannello c\'è ma non parte; un copione rotto nel database vale zero', async () => {
    const pag = await apri({ dati: { 'players/didi/info/palestra': null, 'players/didi/palestraAllenamento': { t0a: { v: 99 }, t1a: 'boh', t2a: { v: 1, lezioni: 'tante', memoria: 4 } } } });
    const pan = pannello(pag.html());
    assert.match(pan, /<button type="button" class="ng-bottone ng-compra pal-allena-via" disabled>Train CPU<\/button>/);
    assert.match(pan, /Pick a team for a stage to start training/);
    assert.match(pan, /<b class="pal-allena-percento">0%<\/b>/);
    assert.doesNotMatch(pag.html(), /allenamento=\d/);
});

// ---------------------------------------------------------------- sfidare la palestra di un altro
test('sfida: il tabellone di chi sfida non dice quanto è allenata la CPU (e non legge i team della palestra)', async () => {
    const pag = await apri({ search: '?player=lukiani', dati: { 'players/lukiani/palestraAllenamento': { g0: copione(4, 6), g1: copione(4, 6), g2: copione(4, 3) } } });
    const h = pag.html();
    assert.doesNotMatch(h, /CPU trained|pal-chip-allena/);
    assert.match(h, /<li class="pal-chip pal-chip-espugnata">/, 'le tre cifre della palestra restano');
    assert.doesNotMatch(h, /pal-allena-btn|pal-allena-pannello|allenamento=/, 'chi sfida non vede i tasti di allenamento');
});

test('la pagina carica i moduli dell\'allenamento prima di palestra-ui.js (e la memoria prima del copione)', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'palestra.html'), 'utf8');
    const pos = f => html.indexOf(`<script src="${f}"></script>`);
    assert.ok(pos('cpu-memoria.js') > -1 && pos('cpu-copione.js') > pos('cpu-memoria.js'), 'prima la memoria, di cui il copione ha bisogno');
    assert.ok(pos('palestra-ui.js') > pos('cpu-copione.js'));
    assert.ok(pos('palestra.js') < pos('palestra-ui.js'));
    // il database: solo lettura per chi sfida e per l'allenamento (la scrittura la fa il simulatore, battle-ui.js)
    assert.match(CODICE, /players\/\$\{S\.io\}\/palestraAllenamento/);
    assert.match(CODICE, /players\/\$\{altro\}\/palestraAllenamento/);
    assert.doesNotMatch(CODICE, /palestraAllenamento[^\n]*\.(set|update|transaction)\(/);
});
