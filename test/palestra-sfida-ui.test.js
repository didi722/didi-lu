'use strict';
// La schermata per sfidare la palestra di un altro (docs/palestra-ui.js, disegnaSfida): la pagina vera girata in Node con un DOM finto e un database finto. Si controlla quello che
// l'utente vede (porte, tasto per entrare) e quello che succede quando sceglie: toccando una porta si apre la finestra con i suoi team, scelto uno si passa alla tappa che ne ha
// bisogno, i team si ricordano, il tasto parte con la tappa giusta. Nell'app (pagina a schermo fisso) i team restano in riga sotto le porte.
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
async function apri({ stat = null, premio = null, premioVecchio = null, teams = teamDi(), salvata = null, gymSenzaPalestra = false, app = false } = {}) {
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
        'wallet/u1/premiPalestra/lukiani': premio,
        'wallet/u1/premioPalestra': premioVecchio
    };
    let avvia = null;
    const redirect = { href: '' };
    const classiBody = new Set(), tasti = {};
    const body = nuovo('body');
    body.classList = { add: c => classiBody.add(c), remove: c => classiBody.delete(c), contains: c => classiBody.has(c), toggle() {} };
    const finestra = {
        Palestra: P, PalestraStat: ST, Cosmetici: C,
        SpritePkm: { gif: (n, s) => `gif/${n}${s ? '-s' : ''}.gif`, riserva() {}, id: x => x },
        location: { search: '?player=lukiani', get href() { return redirect.href; }, set href(v) { redirect.href = v; } },
        localStorage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, v) },
        scrollTo() {}, addEventListener() {}
    };
    const contesto = {
        window: finestra, URLSearchParams, Date, Promise, Math, JSON, Object, Array, String, Number, encodeURIComponent, setTimeout, console,
        document: {
            getElementById: el, title: '', createElement: () => nuovo('x'), querySelector: () => null, body, head: nuovo('head'),
            documentElement: { style: { setProperty() {} }, classList: { contains: c => app && c === 'app-shell', add() {}, remove() {}, toggle() {} } },
            addEventListener(t, f) { (tasti[t] = tasti[t] || []).push(f); }, activeElement: null
        },
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
    const corpo = el('pal-corpo'), modale = el('pal-modale');
    const clic = e => { for (const f of corpo.gestori.click || []) f(e); };
    const clicModale = e => { for (const f of modale.gestori.click || []) f(e); };
    const carta = id => ({ target: { closest: s => (s === '.pal-team' ? { dataset: { team: id }, closest: () => ({ style: {} }) } : null) } });
    const bottone = (az, i) => ({ target: { closest: s => (s === 'button[data-az]' ? { dataset: { az, i: i === undefined ? '' : String(i) } } : null) } });
    return {
        html: () => corpo.innerHTML,
        titolo: () => el('hub-title-display').textContent,
        salvata: () => JSON.parse(memoria.get('palestra:didi:lukiani') || 'null'),
        redirect,
        // scegliere un team: nella finestra se è aperta, altrimenti in riga (app)
        scegli: id => (modale.hidden ? clic : clicModale)(carta(id)),
        // le azioni della finestra ('tappa', 'chiudi') passano dalla finestra, le altre ('vai', 'via', 'da-capo') dalla pagina
        azione: (az, i) => (az === 'tappa' || az === 'chiudi' ? clicModale : clic)(bottone(az, i)),
        sfondo: () => clicModale({ target: modale }),
        tasto: key => { let fermato = false; for (const f of tasti.keydown || []) f({ key, preventDefault() { fermato = true; } }); return fermato; },
        finestra: () => ({ aperta: !modale.hidden, html: modale.innerHTML }),
        classiBody: () => [...classiBody],
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

test('sfida: una schermata sola con il tabellone, tre porte (una per format), il distintivo con le monete e il tasto per entrare (i team si scelgono nella finestra)', async () => {
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
    assert.match(h, /<li class="pal-porta pal-porta-premio" style="--i:3"[^>]*title="Gym coins are paid once a week for each gym you conquer\. They reset on Monday\.">/);
    assert.match(h, new RegExp(`<span class="pal-moneta"><img class="pal-moneta-img" src="immagini/moneta\\.png" alt="coins"><b>\\+${C.PREMI.palestra}</b></span>`), 'in fondo al percorso la monetina con il premio');
    assert.doesNotMatch(h, /pal-stella|Gym badge|once a week<\/small>/, 'niente stellina né scritta "Gym badge"');
    assert.match(h, /Secret edge: \?\?\?/, 'il vantaggio della palestra non si vede prima di entrare');
    // parte dalla prima tappa senza team, che è la porta accesa; è la prossima da giocare, le altre chiuse
    assert.equal(attiva(h), 0);
    assert.deepEqual([0, 1, 2].map(i => porta(h, i).stato), ['prossima', 'chiusa', 'chiusa']);
    // i team non sono sotto le porte (la pagina starebbe in due schermate): si scelgono toccando una porta
    assert.doesNotMatch(h, /pal-selezione|pal-squadre|data-team=/, 'nessuna lista di team in fondo alla pagina');
    assert.equal((h.match(/class="pal-porta-btn"[^>]*aria-haspopup="dialog"/g) || []).length, 3, 'le tre porte aprono una finestra');
    assert.equal(pag.finestra().aperta, false, 'la finestra non si apre da sola');
    assert.deepEqual(pag.classiBody(), []);
    // niente team scelti: tasto spento e il conto
    assert.match(h, /0\/3 teams ready/);
    assert.match(bottoneVia(h)[1], /disabled/);
    assert.match(bottoneVia(h)[2], /Enter the gym/);
});

test('sfida: toccando una porta si apre la finestra con i team del suo format; scelto un team si passa alla tappa che ne ha bisogno e con i tre pronti si chiude e il tasto si accende', async () => {
    const pag = await apri();
    pag.azione('vai', 0);
    assert.equal(pag.finestra().aperta, true);
    assert.deepEqual(pag.classiBody(), ['pal-modale-aperta'], 'la pagina dietro non scorre');
    let f = pag.finestra().html;
    assert.match(f, /role="dialog" aria-modal="true" aria-labelledby="pal-dlg-titolo"/);
    assert.match(f, /Pick a team · stage 1 of 3/, 'la striscia nera della finestra');
    assert.match(f, /<h3 class="pal-sel-titolo" id="pal-dlg-titolo">VGC Gen 8<\/h3>/);
    assert.match(f, /against teams you've never seen/, 'la prima volta si spiega cosa aspettarsi');
    // le tre tappe in cima (si passa dall'una all'altra) e i team di quel format
    assert.deepEqual([...f.matchAll(/data-az="tappa" data-i="(\d)"/g)].map(m => m[1]), ['0', '1', '2']);
    assert.match(f, /pal-dlg-passo pal-dlg-passo-attivo" data-az="tappa" data-i="0"/);
    assert.deepEqual([...f.matchAll(/data-team="(\w+)"/g)].map(m => m[1]), ['t0a', 't0b'], 'solo i team del suo format');
    assert.match(f, /0\/3 teams ready/);
    assert.match(f, /data-az="chiudi" aria-label="Close"/); assert.match(f, />Close<\/button>/);
    // scelto il team della tappa 1 la finestra passa alla 2
    pag.scegli('t0b');
    assert.deepEqual(pag.salvata().squadre, ['t0b', '', ''], 'il team si ricorda subito (anche se si chiude la pagina)');
    assert.equal(pag.finestra().aperta, true);
    f = pag.finestra().html;
    assert.match(f, /<h3 class="pal-sel-titolo" id="pal-dlg-titolo">QWERTY<\/h3>/);
    assert.match(f, /1\/3 teams ready/);
    assert.match(f, /pal-dlg-passo pal-dlg-passo-pieno" data-az="tappa" data-i="0"[^>]*aria-label="Stage 1: VGC Gen 8, team picked"/, 'la tappa 1 ha la sua spunta');
    pag.scegli('t1a');
    f = pag.finestra().html;
    assert.match(f, /<h3 class="pal-sel-titolo" id="pal-dlg-titolo">Little Cup<\/h3>/);
    assert.match(f, /Which team do you bring to this one\?/, 'dopo la prima tappa niente più spiegone');
    // l'ultimo: la finestra si chiude da sola
    pag.scegli('t2b');
    assert.equal(pag.finestra().aperta, false, 'con i tre pronti la finestra ha finito');
    assert.deepEqual(pag.classiBody(), []);
    assert.equal(pag.finestra().html, '');
    assert.deepEqual(pag.salvata().squadre, ['t0b', 't1a', 't2b']);
    const h = pag.html();
    assert.equal(attiva(h), 0, 'la porta accesa è la prima da giocare');
    assert.deepEqual([0, 1, 2].map(i => porta(h, i).piena), [true, true, true]);
    assert.match(h, /<span class="pal-slot-nome">VGC Gen 8 B<\/span>/, 'le porte mostrano i team scelti');
    assert.match(h, /pal-porta-nuova/, 'i team appena scelti atterrano nelle porte');
    assert.match(h, /3\/3 teams ready/);
    assert.doesNotMatch(bottoneVia(h)[1], /disabled/);
    pag.azione('via');
    assert.equal(pag.redirect.href, 'battle.html?cpu=1&palestra=lukiani&tappa=0&team=t0b', 'si parte dalla prima tappa, con il suo team');
});

test('sfida: la finestra si chiude con la X, con "Close", con Esc e toccando fuori; i team scelti restano', async () => {
    const pag = await apri();
    const apertaDa = async i => { pag.azione('vai', i); assert.equal(pag.finestra().aperta, true); };
    await apertaDa(1); pag.azione('chiudi'); assert.equal(pag.finestra().aperta, false, 'X e Close');
    await apertaDa(1); assert.equal(pag.tasto('Escape'), true, 'Esc è preso dalla finestra'); assert.equal(pag.finestra().aperta, false);
    assert.equal(pag.tasto('Escape'), false, 'a finestra chiusa Esc non fa niente');
    await apertaDa(1); pag.sfondo(); assert.equal(pag.finestra().aperta, false, 'lo sfondo scuro');
    // chiusa senza scegliere: niente cambia e la porta toccata resta quella accesa
    assert.deepEqual(pag.salvata(), null);
    assert.equal(attiva(pag.html()), 1);
    assert.deepEqual(pag.classiBody(), []);
    // scelto un team e chiusa: il team resta, e il conto
    await apertaDa(0); pag.scegli('t0a'); pag.azione('chiudi');
    assert.deepEqual(pag.salvata().squadre, ['t0a', '', '']);
    assert.match(pag.html(), /1\/3 teams ready/);
    assert.ok(porta(pag.html(), 0).piena);
    assert.equal(attiva(pag.html()), 1, 'si resta sulla tappa che ha ancora bisogno di un team');
});

test('sfida: nella finestra si passa da una tappa all\'altra senza chiuderla', async () => {
    const pag = await apri();
    pag.azione('vai', 0);
    pag.azione('tappa', 2);
    assert.match(pag.finestra().html, /<h3 class="pal-sel-titolo" id="pal-dlg-titolo">Little Cup<\/h3>/);
    assert.match(pag.finestra().html, /Pick a team · stage 3 of 3/);
    assert.deepEqual([...pag.finestra().html.matchAll(/data-team="(\w+)"/g)].map(m => m[1]), ['t2a', 't2b']);
    pag.scegli('t2b');
    // dalla tappa 3 la prossima che manca è la 1, poi la 2
    assert.match(pag.finestra().html, /id="pal-dlg-titolo">VGC Gen 8</);
    pag.azione('tappa', 1);
    assert.match(pag.finestra().html, /id="pal-dlg-titolo">QWERTY</);
    pag.scegli('t1b');
    assert.match(pag.finestra().html, /id="pal-dlg-titolo">VGC Gen 8</, 'resta solo la 1');
    pag.scegli('t0a');
    assert.equal(pag.finestra().aperta, false);
    assert.deepEqual(pag.salvata().squadre, ['t0a', 't1b', 't2b']);
});

test('sfida: si può tornare a una porta e cambiare il suo team; saltando una tappa la scelta ricomincia da quella che manca', async () => {
    const pag = await apri();
    pag.azione('vai', 0); pag.scegli('t0a'); pag.scegli('t1a'); pag.scegli('t2a');
    assert.equal(pag.finestra().aperta, false);
    pag.azione('vai', 0);
    assert.equal(pag.finestra().aperta, true);
    assert.match(pag.finestra().html, /class="pal-team pal-team-scelto" data-team="t0a" aria-pressed="true"/, 'il team di prima è segnato');
    pag.scegli('t0b');
    assert.deepEqual(pag.salvata().squadre, ['t0b', 't1a', 't2a']);
    assert.equal(pag.finestra().aperta, false, 'sono tutti a posto: la finestra si chiude');
    assert.equal(attiva(pag.html()), 0);
    // si salta la porta 1 e si sceglie la 3: poi manca la 1
    const altra = await apri();
    altra.azione('vai', 2); altra.scegli('t2a');
    assert.equal(altra.finestra().aperta, true);
    assert.match(altra.finestra().html, /id="pal-dlg-titolo">VGC Gen 8</, 'manca la tappa 1 (la 2 viene dopo)');
    assert.deepEqual(altra.salvata().squadre, ['', '', 't2a']);
    altra.azione('chiudi');
    altra.azione('via');
    assert.equal(altra.redirect.href, '', 'senza tutti i team non si entra');
    assert.match(altra.messaggio(), /Pick a team for every stage/);
});

test('sfida nell\'app: i team restano in riga sotto le porte (la finestra non c\'è), e scelto uno si passa alla tappa che ne ha bisogno', async () => {
    const pag = await apri({ app: true });
    let h = pag.html();
    assert.match(h, /<section class="pal-selezione" style="--att:0">/);
    assert.match(h, /Stage 1 of 3<\/p><h3 class="pal-sel-titolo" id="pal-dlg-titolo">VGC Gen 8<\/h3>/);
    assert.deepEqual([...h.matchAll(/data-team="(\w+)"/g)].map(m => m[1]), ['t0a', 't0b']);
    assert.doesNotMatch(h, /aria-haspopup/, 'le porte non aprono niente');
    pag.azione('vai', 2);
    assert.equal(attiva(pag.html()), 2, 'toccare una porta la accende');
    assert.equal(pag.finestra().aperta, false);
    assert.deepEqual([...pag.html().matchAll(/data-team="(\w+)"/g)].map(m => m[1]), ['t2a', 't2b']);
    pag.scegli('t2b');
    assert.equal(attiva(pag.html()), 0, 'manca la tappa 1');
    pag.scegli('t0b'); pag.scegli('t1a');
    assert.deepEqual(pag.salvata().squadre, ['t0b', 't1a', 't2b']);
    assert.equal(attiva(pag.html()), 1, 'con tutti pronti si resta dove si è');
    assert.match(pag.html(), /3\/3 teams ready/);
    assert.match(pag.html(), /class="pal-team pal-team-scelto" data-team="t1a" aria-pressed="true"/, 'il team scelto è segnato');
    assert.equal(pag.finestra().aperta, false);
    assert.deepEqual(pag.classiBody(), []);
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
    assert.match(h, /<li class="pal-porta pal-porta-premio pal-porta-fatta"[^>]*>\s*<span class="pal-vinci">Win<\/span><\/li>/, 'le monete di questa settimana per questa palestra sono già state prese: niente monetina, solo "Win"');
    assert.doesNotMatch(h, /pal-moneta-img/);
    assert.match(bottoneVia(h)[2], /Take it on again/);
    assert.doesNotMatch(h, /Start over/);
    pag.azione('via');
    assert.equal(pag.redirect.href, 'battle.html?cpu=1&palestra=lukiani&tappa=0&team=t0a', 'rifacendola si riparte dalla prima tappa');
    // il premio di una settimana scorsa non conta
    const vecchio = await apri({ premio: { settimana: '2020-W01', t: 1 } });
    assert.match(vecchio.html(), new RegExp(`<b>\\+${C.PREMI.palestra}</b>`));
});

test('sfida: senza un team per un format lo dice (e rimanda al Box); i team di un altro format non si offrono; un team sparito dal Box non conta', async () => {
    const pag = await apri({ teams: teamDi('QWERTY') });
    pag.azione('vai', 0); pag.scegli('t0a');
    const f = pag.finestra().html;
    assert.match(f, /id="pal-dlg-titolo">QWERTY</, 'la finestra passa alla tappa che manca');
    assert.match(f, /You don't have a team for <b>QWERTY<\/b> yet\. <a href="box\.html">Build one in your Box<\/a>/);
    assert.doesNotMatch(f, /data-team=/, 'nessun team di un altro format al posto suo');
    pag.azione('chiudi');
    const h = pag.html();
    assert.equal(attiva(h), 1);
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

test('sfida: le entrate animate partono solo alla prima volta (chiudere la finestra o scegliere un team nell\'app ridisegna la pagina e non deve far ripartire tutto)', async () => {
    const pag = await apri();
    assert.match(pag.html(), /<div class="pal-sfida pal-prima">/);
    pag.azione('vai', 0); pag.scegli('t0a'); pag.azione('chiudi');
    assert.match(pag.html(), /<div class="pal-sfida">/);
    assert.doesNotMatch(pag.html(), /pal-prima/);
    const app = await apri({ app: true });
    app.scegli('t0a');
    assert.doesNotMatch(app.html(), /pal-prima/);
});

test('la pagina tiene la finestra dei team fuori dal corpo (che si ridisegna) e lo stile la mette sopra a tutto; su un computer la schermata si stringe per stare in una finestra bassa', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'palestra.html'), 'utf8');
    assert.match(html, /<section id="pal-corpo" hidden><\/section>\s*<\/main>\s*(<!--[^>]*-->\s*)?<div class="pal-modale" id="pal-modale" hidden><\/div>/, 'la finestra è accanto al corpo, non dentro');
    const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'style-palestra.css'), 'utf8');
    assert.match(css, /\.pal-modale \{[^}]*position: fixed; inset: 0; z-index: 10050;/, 'sopra alla pagina, ai suoi pulsanti e al menu');
    assert.match(css, /\.pal-modale\[hidden\] \{ display: none; \}/);
    assert.match(css, /body\.pal-modale-aperta \{ overflow: hidden; \}/, 'la pagina dietro non scorre');
    assert.match(css, /\.pal-dialogo \{[^}]*max-height: calc\(100dvh - 40px\)/, 'in una finestra bassa la finestra non esce dallo schermo: scorre dentro');
    // su un computer la testata e gli spazi si stringono (la targa con i quattro numeri sta in una riga, niente piccolo sotto le cifre)
    assert.match(css, /@media \(min-width: 901px\) and \(max-height: 839px\) \{\s*html:not\(\.app-shell\) body\.pal-dentro \.top-bar \{ padding: 40px 0 12px; \}/);
    assert.match(css, /@media \(min-width: 901px\) and \(max-height: 700px\) \{/);
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'docs', 'palestra-ui.js'), 'utf8'), /<small>\$\{esc\(LIVELLI\[livello\]\)\}<\/small><\/li>`;\s*\n\s*\}\s*\n\s*\n\s*\/\*\* Il pannello in cima/, 'il livello non va sotto la cifra della targa');
});

test('sfida: il premio della settimana è per palestra: quello preso in un\'altra palestra non conta (e il vecchio premio unico vale solo per la sua)', async () => {
    const settimana = ST.settimanaDi(Date.now());
    const altra = await apri({ premioVecchio: { settimana, gym: 'altrapalestra', t: 1 } });
    assert.match(altra.html(), /pal-moneta-img/, 'preso per un\'altra palestra: qui le monete ci sono ancora');
    const questa = await apri({ premioVecchio: { settimana, gym: 'lukiani', t: 1 } });
    assert.match(questa.html(), /<span class="pal-vinci">Win<\/span>/, 'il vecchio premio unico, di questa palestra, vale');
    const nuovo = await apri({ premio: { settimana, t: 1 } });
    assert.match(nuovo.html(), /<span class="pal-vinci">Win<\/span>/);
    const scaduto = await apri({ premio: { settimana: '2020-W01', t: 1 }, premioVecchio: { settimana: '2020-W01', gym: 'lukiani', t: 1 } });
    assert.match(scaduto.html(), /pal-moneta-img/, 'di una settimana fa non conta');
});
