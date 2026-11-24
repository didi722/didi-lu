'use strict';
// La schermata per sfidare la palestra di un altro (docs/palestra-ui.js, disegnaSfida): la pagina vera girata in Node con un DOM finto e un database finto. Si controlla quello che
// l'utente vede (porte, team da scegliere, tasto per entrare) e quello che succede quando sceglie: si passa alla tappa che ne ha bisogno, i team si ricordano, il tasto parte con la
// tappa giusta.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../docs/palestra.js');
const ST = require('../docs/palestra-stat.js');
const C = require('../docs/cosmetici.js');

const CODICE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'palestra-ui.js'), 'utf8');
const copia = x => (x === undefined ? null : JSON.parse(JSON.stringify(x)));

const FORMATI = ['VGC Gen 8', 'QWERTY', 'Little Cup'];
const pokemon = nomi => nomi.map(nome => ({ nome }));
// i team di chi sfida: due per format (id t<n>), tranne dove si toglie
const teamDi = (saltaFormato) => {
    const t = {};
    FORMATI.forEach((f, i) => {
        if (f === saltaFormato) return;
        t[`t${i}a`] = { nome: `${f} A`, categoria: f, pokemon: pokemon(['garchomp', 'incineroar', 'rillaboom', 'amoonguss', 'tornadus', 'urshifu']) };
        t[`t${i}b`] = { nome: `${f} B`, categoria: f, pokemon: pokemon(['pelipper', 'kingdra', 'ludicolo']) };
    });
    return t;
};

/** La pagina con i suoi dati: ritorna lo schermo (html), i clic, la memoria del browser e dove è andata a finire */
async function apri({ stat = null, premio = null, teams = teamDi(), salvata = null, gymSenzaPalestra = false } = {}) {
    const elementi = {};
    const nuovo = id => ({
        id, innerHTML: '', hidden: true, textContent: '', style: {}, gestori: {}, dataset: {},
        classList: { add() {}, toggle() {}, remove() {}, contains: () => false },
        addEventListener(t, f) { (this.gestori[t] = this.gestori[t] || []).push(f); },
        querySelector: () => null, querySelectorAll: () => [], append() {}, prepend() {}, remove() {}, setAttribute() {}, focus() {}
    });
    const el = id => elementi[id] || (elementi[id] = nuovo(id));
    const memoria = new Map();
    if (salvata) memoria.set('palestra:didi:lukiani', JSON.stringify(salvata));
    const dati = {
        'users/u1/name': 'Didi',
        regolamenti: Object.fromEntries(FORMATI.map((f, i) => [`f${i}`, { categoria: f, battleStyle: 'doubles', genRuleValue: 9 }])),
        'players/didi/teams': teams,
        'players/lukiani/info': { name: 'Lukiani', color: '#3399ff', musicaPreferita: 'https://x.example/a.mp3', musicName: 'Tema',
            palestra: gymSenzaPalestra ? null : { tappe: FORMATI.map((f, i) => ({ formato: `f${i}`, categoria: f, team: `g${i}`, vantaggio: 'rain' })) } },
        'players/lukiani/palestraStat': stat,
        'wallet/u1/premioPalestra': premio
    };
    let avvia = null;
    const redirect = { href: '' };
    const finestra = {
        Palestra: P, PalestraStat: ST, Cosmetici: C,
        SpritePkm: { gif: (n, s) => `gif/${n}${s ? '-s' : ''}.gif`, riserva() {}, id: x => x },
        location: { search: '?player=lukiani', get href() { return redirect.href; }, set href(v) { redirect.href = v; } },
        localStorage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, v) },
        scrollTo() {}, addEventListener() {}
    };
    const contesto = {
        window: finestra, URLSearchParams, Date, Promise, Math, JSON, Object, Array, String, Number, encodeURIComponent, setTimeout, console,
        document: { getElementById: el, title: '', createElement: () => nuovo('x'), querySelector: () => null, body: nuovo('body'), head: nuovo('head'), documentElement: { style: { setProperty() {} } } },
        firebase: {
            auth: () => ({ onAuthStateChanged: cb => { avvia = cb; } }),
            database: () => ({ ref: p => ({ once: async () => ({ val: () => copia(dati[p]) }) }) })
        }
    };
    finestra.window = finestra;
    contesto.window = finestra;
    vm.createContext(contesto);
    vm.runInContext(CODICE, contesto);
    await avvia({ uid: 'u1' });
    const corpo = el('pal-corpo');
    const clic = e => { for (const f of corpo.gestori.click || []) f(e); };
    return {
        html: () => corpo.innerHTML,
        titolo: () => el('hub-title-display').textContent,
        salvata: () => JSON.parse(memoria.get('palestra:didi:lukiani') || 'null'),
        redirect,
        scegli: id => clic({ target: { closest: s => (s === '.pal-team' ? { dataset: { team: id }, closest: () => ({ style: {} }) } : null) } }),
        azione: (az, i) => clic({ target: { closest: s => (s === 'button[data-az]' ? { dataset: { az, i: i === undefined ? '' : String(i) } } : null) } }),
        messaggio: () => el('pal-msg').textContent
    };
}

/** La porta i (0..2) del percorso, con le sue classi */
const porta = (html, i) => {
    const m = [...html.matchAll(/<li class="pal-porta pal-porta-(\w+)([^"]*)" style="--i:(\d+)">/g)].find(x => Number(x[3]) === i);
    return m ? { stato: m[1], classi: m[2], attiva: /pal-porta-attiva/.test(m[2]), piena: /pal-porta-piena/.test(m[2]) } : null;
};
const attiva = html => [0, 1, 2].find(i => porta(html, i).attiva);
const bottoneVia = html => (html.match(/<button type="button" class="pal-via" data-az="via"([^>]*)>([^<]*)/) || []);

test('sfida: una schermata sola con il tabellone, tre porte (una per format), il distintivo con le monete, i team della porta accesa e il tasto per entrare', async () => {
    const pag = await apri({ stat: { v: 1, tentativi: 12, tenuta: 9, espugnata: 3, tappe: [{ giocate: 12, vinte: 10 }, { giocate: 10, vinte: 6 }, { giocate: 6, vinte: 3 }], ultime: [], espugnatori: {}, t: 1 } });
    const h = pag.html();
    assert.equal(pag.titolo(), "Lukiani's gym", 'il titolo della pagina è il nome di chi tiene la palestra');
    // il tabellone: l'insegna e i tre numeri
    assert.match(h, /<header class="pal-piatto">/);
    assert.match(h, /GYM LEADER/);
    assert.match(h, /<li class="pal-chip pal-chip-tentativi"><b>12<\/b><span>Attempts<\/span>/);
    assert.match(h, /<li class="pal-chip pal-chip-tenuta"><b>9<\/b><span>Gym wins<\/span><small>75%<\/small>/);
    assert.match(h, /<li class="pal-chip pal-chip-espugnata"><b>3<\/b><span>Gym beaten<\/span>/);
    assert.match(h, /♪ Tema/, 'la canzone che suona');
    // le regole in tre parole
    assert.match(h, /<ul class="pal-regole"><li>Doubles<\/li><li>Bring 6 · pick 4<\/li><li>One loss: back to stage 1<\/li><\/ul>/);
    // tre porte, una per format, nell'ordine della palestra, e il distintivo
    FORMATI.forEach((f, i) => { assert.ok(porta(h, i), `porta ${i + 1}`); assert.match(h, new RegExp(`<span class="pal-porta-formato">${f}</span>`)); });
    assert.equal((h.match(/class="pal-porta pal-porta-/g) || []).length, 4, 'tre porte e il distintivo');
    assert.match(h, /<li class="pal-porta pal-porta-premio" style="--i:3"[^>]*title="Gym coins are paid once a week in total, whichever gym you conquer\. They reset on Monday\.">/);
    assert.match(h, new RegExp(`🪙 \\+${C.PREMI.palestra}<small>once a week</small>`), 'le monete in palio');
    assert.match(h, /Secret edge: \?\?\?/, 'il vantaggio della palestra non si vede prima di entrare');
    // parte dalla prima tappa senza team, che è la porta accesa; è la prossima da giocare, le altre chiuse
    assert.equal(attiva(h), 0);
    assert.deepEqual([0, 1, 2].map(i => porta(h, i).stato), ['prossima', 'chiusa', 'chiusa']);
    assert.match(h, /Stage 1 of 3<\/p><h3 class="pal-sel-titolo">VGC Gen 8<\/h3>/);
    assert.match(h, /against teams you've never seen/, 'la prima volta si spiega cosa aspettarsi');
    // i team per quella porta: solo quelli del suo format
    assert.deepEqual([...h.matchAll(/data-team="(\w+)"/g)].map(m => m[1]), ['t0a', 't0b']);
    // niente team scelti: tasto spento e il conto
    assert.match(h, /0\/3 teams ready/);
    assert.match(bottoneVia(h)[1], /disabled/);
    assert.match(bottoneVia(h)[2], /Enter the gym/);
});

test('sfida: scelto il team di una tappa si passa alla prossima che ne ha bisogno; con i tre pronti il tasto si accende e porta alla prima tappa', async () => {
    const pag = await apri();
    pag.scegli('t0b');
    assert.deepEqual(pag.salvata().squadre, ['t0b', '', ''].map(x => x), 'il team si ricorda subito (anche se si chiude la pagina)');
    assert.equal(attiva(pag.html()), 1, 'si passa da sola alla tappa 2');
    assert.match(pag.html(), /1\/3 teams ready/);
    assert.ok(porta(pag.html(), 0).piena, 'la porta 1 mostra il suo team');
    assert.match(pag.html(), /<span class="pal-slot-nome">VGC Gen 8 B<\/span>/);
    pag.scegli('t1a');
    assert.equal(attiva(pag.html()), 2);
    assert.match(pag.html(), /Which team do you bring to this one\?/, 'dopo la prima tappa niente più spiegone');
    assert.match(bottoneVia(pag.html())[1], /disabled/, 'finché ne manca uno il tasto resta spento');
    pag.scegli('t2b');
    assert.deepEqual(pag.salvata().squadre, ['t0b', 't1a', 't2b']);
    assert.equal(attiva(pag.html()), 2, 'con tutti pronti si resta dove si è');
    assert.match(pag.html(), /3\/3 teams ready/);
    assert.doesNotMatch(bottoneVia(pag.html())[1], /disabled/);
    assert.match(pag.html(), /class="pal-team pal-team-scelto" data-team="t2b" aria-pressed="true"/, 'il team scelto è segnato');
    pag.azione('via');
    assert.equal(pag.redirect.href, 'battle.html?cpu=1&palestra=lukiani&tappa=0&team=t0b', 'si parte dalla prima tappa, con il suo team');
});

test('sfida: si può tornare a una porta e cambiare il suo team; saltando una tappa la scelta ricomincia da quella che manca', async () => {
    const pag = await apri();
    pag.scegli('t0a'); pag.scegli('t1a'); pag.scegli('t2a');
    pag.azione('vai', 0);
    assert.equal(attiva(pag.html()), 0);
    assert.match(pag.html(), /class="pal-team pal-team-scelto" data-team="t0a"/);
    pag.scegli('t0b');
    assert.deepEqual(pag.salvata().squadre, ['t0b', 't1a', 't2a']);
    assert.equal(attiva(pag.html()), 0, 'sono tutti a posto: si resta sulla porta che si stava cambiando');
    // si salta la porta 1 e si sceglie la 3: poi manca la 1
    const altra = await apri();
    altra.azione('vai', 2); altra.scegli('t2a');
    assert.equal(attiva(altra.html()), 0, 'manca la tappa 1 (la 2 viene dopo)');
    assert.deepEqual(altra.salvata().squadre, ['', '', 't2a']);
    altra.azione('via');
    assert.equal(altra.redirect.href, '', 'senza tutti i team non si entra');
    assert.match(altra.messaggio(), /Pick a team for every stage/);
});

test('sfida: una sfida cominciata (tappe vinte) apre dalla tappa da giocare, dice a che punto sei e il tasto porta a quella tappa', async () => {
    const salvata = { squadre: ['t0a', 't1b', 't2a'], vinte: 1 };
    const pag = await apri({ salvata });
    const h = pag.html();
    assert.deepEqual([0, 1, 2].map(i => porta(h, i).stato), ['fatta', 'prossima', 'chiusa']);
    assert.equal(attiva(h), 1, 'si apre sulla tappa che si deve giocare');
    assert.match(h, /Your run so far: 1 of 3 stages cleared\. Stage 2 is waiting!/);
    assert.match(h, /✓ Cleared/); assert.match(h, /▶ Up next/); assert.match(h, /🔒 Locked/);
    assert.match(h, /data-az="da-capo">Start over/);
    assert.match(bottoneVia(h)[2], /On to stage 2/);
    pag.azione('via');
    assert.equal(pag.redirect.href, 'battle.html?cpu=1&palestra=lukiani&tappa=1&team=t1b');
    // ricominciare azzera le tappe vinte (non i team) e riporta alla prima
    pag.azione('da-capo');
    assert.equal(pag.salvata().vinte, 0);
    assert.deepEqual(pag.salvata().squadre, ['t0a', 't1b', 't2a']);
    assert.equal(attiva(pag.html()), 0);
    assert.doesNotMatch(pag.html(), /Start over/);
    assert.match(pag.messaggio(), /Back to stage 1/);
});

test('sfida: palestra conquistata (tre tappe vinte): tutte le porte superate, il distintivo, e si può rifare da capo', async () => {
    const pag = await apri({ salvata: { squadre: ['t0a', 't1a', 't2a'], vinte: 3 }, premio: { settimana: ST.settimanaDi(Date.now()), gym: 'x', t: 1 } });
    const h = pag.html();
    assert.deepEqual([0, 1, 2].map(i => porta(h, i).stato), ['fatta', 'fatta', 'fatta']);
    assert.match(h, /🏆 You beat every stage!/);
    assert.match(h, /li class="pal-porta pal-porta-premio pal-porta-fatta"/);
    assert.match(h, /🪙 ✓ collected<small>back on Monday<\/small>/, 'le monete di questa settimana sono già state prese');
    assert.match(bottoneVia(h)[2], /Take it on again/);
    assert.doesNotMatch(h, /Start over/);
    pag.azione('via');
    assert.equal(pag.redirect.href, 'battle.html?cpu=1&palestra=lukiani&tappa=0&team=t0a', 'rifacendola si riparte dalla prima tappa');
    // il premio di una settimana scorsa non conta
    const vecchio = await apri({ premio: { settimana: '2020-W01', gym: 'x', t: 1 } });
    assert.match(vecchio.html(), new RegExp(`🪙 \\+${C.PREMI.palestra}<small>once a week</small>`));
});

test('sfida: senza un team per un format lo dice (e rimanda al Box); i team di un altro format non si offrono; un team sparito dal Box non conta', async () => {
    const pag = await apri({ teams: teamDi('QWERTY') });
    pag.scegli('t0a');
    const h = pag.html();
    assert.equal(attiva(h), 1);
    assert.match(h, /You don't have a team for <b>QWERTY<\/b> yet\. <a href="box\.html">Build one in your Box<\/a>/);
    assert.doesNotMatch(h, /data-team=/, 'nessun team di un altro format al posto suo');
    assert.match(bottoneVia(h)[1], /disabled/);
    // il team scelto una volta non c'è più: la tappa torna senza team
    const sparito = await apri({ salvata: { squadre: ['t0a', 'cancellato', 't2a'], vinte: 0 } });
    assert.deepEqual([0, 1, 2].map(i => porta(sparito.html(), i).piena), [true, false, true]);
    assert.equal(attiva(sparito.html()), 1, 'si riparte dalla tappa che manca');
});

test('sfida: una palestra non ancora costruita non ha niente da sfidare (e il titolo dice comunque di chi è)', async () => {
    const pag = await apri({ gymSenzaPalestra: true });
    assert.match(pag.html(), /Lukiani hasn't built a gym yet\. Check back soon!/);
    assert.doesNotMatch(pag.html(), /pal-percorso/);
    assert.equal(pag.titolo(), "Lukiani's gym");
});

test('sfida: le entrate animate partono solo alla prima volta (scegliere un team ridisegna la pagina e non deve far ripartire tutto)', async () => {
    const pag = await apri();
    assert.match(pag.html(), /<div class="pal-sfida pal-prima">/);
    pag.scegli('t0a');
    assert.match(pag.html(), /<div class="pal-sfida">/);
    assert.doesNotMatch(pag.html(), /pal-prima/);
});
