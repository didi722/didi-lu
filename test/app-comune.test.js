'use strict';
// Le parti che il menù principale e le pagine dell'app hanno in comune (docs/app-comune.js):
//   - le icone (ogni nome usato dall'app c'è, ogni disegno è ben fatto);
//   - il giocatore per l'app (avatar, nome, colore, titolo, Elo solo se classificato, stagioni vinte) e la sua lettura da Firebase;
//   - le tessere della finestra delle impostazioni (suono, vibrazione, avvisi, tema, ricarica, amministrazione, esci/entra);
//   - la finestra in sé, con una pagina finta: apre e chiude (X, sfondo, Esc, tasto indietro), ogni tessera fa la sua cosa.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../docs/app-comune.js');
const A = require('../docs/app.js');
const Statistiche = require('../docs/statistiche.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const passaUnGiro = () => new Promise(ok => setImmediate(ok));

// ---------- le icone ----------

test('icone: ogni nome che l\'app usa esiste; sono disegni 24x24 fatti di tratti semplici; svg() sa come scriverle', () => {
    // le tessere del menù e della finestra delle impostazioni, la barra in alto
    for (const v of A.VOCI) assert.ok(C.ICONE[v.id], `manca l'icona della tessera ${v.id}`);
    const sorgenti = ['app-gioco.js', 'app-menu.js', 'app-comune.js'].map(docs).join('\n');
    const usate = new Set([...sorgenti.matchAll(/svg\('(\w+)'/g)].map(m => m[1]));
    for (const m of sorgenti.matchAll(/icona:\s*([^,}]+)[,}]/g)) for (const n of m[1].matchAll(/'(\w+)'/g)) usate.add(n[1]);
    for (const m of sorgenti.matchAll(/svg\(([^)]*\?[^)]*)\)/g)) for (const n of m[1].matchAll(/'(\w+)'/g)) usate.add(n[1]);
    for (const v of A.VOCI) usate.add(v.id);                // le tessere del menù le disegna app-menu.js con svg(v.id)
    assert.ok(usate.size >= 20, 'icone usate trovate: ' + [...usate].join(', '));
    for (const n of usate) assert.ok(C.ICONE[n], `l'icona "${n}" è usata ma non esiste`);
    // niente icone orfane (si perdono nel file)
    for (const n of Object.keys(C.ICONE)) assert.ok(usate.has(n), `l'icona "${n}" non la usa nessuno`);
    for (const [nome, d] of Object.entries(C.ICONE)) {
        assert.match(d, /^(<(path|circle|rect) [^<>]*\/>)+$/, `${nome}: solo path, circle e rect`);
        assert.doesNotMatch(d, /fill=|stroke=|style=/, `${nome}: i colori li decide il foglio`);
    }
    assert.equal(C.svg('indietro'), '<svg class="gx-icona" viewBox="0 0 24 24" aria-hidden="true">' + C.ICONE.indietro + '</svg>');
    assert.match(C.svg('casa', 'altra'), /^<svg class="altra" /);
    assert.equal(C.svg('inesistente'), '<svg class="gx-icona" viewBox="0 0 24 24" aria-hidden="true"></svg>');
});

test('idDi / esc: gli id dei giocatori sono minuscoli e ripuliti; il testo che finisce nella pagina non può aprire tag', () => {
    assert.equal(C.idDi('  DiDi '), 'didi');
    assert.equal(C.idDi(null), '');
    assert.equal(C.idDi(undefined), '');
    assert.equal(C.esc('<img src="x" onerror=\'y\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;y&#39;&gt;&amp;');
    assert.equal(C.esc(null), '');
    assert.equal(C.esc(12), '12');
});

// ---------- il giocatore ----------

test('riassuntoGiocatore: avatar, nome, colore, titolo; l\'Elo solo con abbastanza showdown; le stagioni vinte dallo storico o dal contatore', () => {
    const dati = {
        info: { name: 'Didi', avatar: 'immagini/didi.png', color: '#ff00aa', title: '  The Champ ' },
        stats: {
            'individual-stats': { ranking: 1203.6, showdownsPlayed: 5 },
            seasons: { won: 1, history: { s1: { rank: 1 }, s2: { rank: '1' }, sbeta: { rank: 1 }, s3: { rank: 2 }, s4: null } }
        }
    };
    assert.deepEqual(C.riassuntoGiocatore('Didi', dati), { id: 'didi', nome: 'Didi', avatar: 'immagini/didi.png', colore: '#ff00aa', titolo: 'The Champ', elo: 1204, vinte: 2 });
    // meno di tre showdown (o nessun Elo): senza Elo, come nella classifica del sito
    assert.equal(C.riassuntoGiocatore('x', { info: {}, stats: { 'individual-stats': { ranking: 1500, showdownsPlayed: 2 } } }).elo, null);
    assert.equal(C.riassuntoGiocatore('x', { info: {}, stats: { 'individual-stats': { showdownsPlayed: 9 } } }).elo, null);
    assert.equal(C.riassuntoGiocatore('x', { info: {}, stats: { 'individual-stats': { ranking: 1500, showdownsPlayed: 3 } } }).elo, 1500);
    assert.equal(C.MIN_SD_CLASSIFICA, Statistiche.MIN_SD_CLASSIFICA, 'la soglia è quella delle statistiche del sito');
    // il contatore delle stagioni vinte vale se è più alto dello storico (la beta non conta nello storico)
    assert.equal(C.riassuntoGiocatore('x', { stats: { seasons: { won: 3, history: { s1: { rank: 1 } } } } }).vinte, 3);
    // dati mancanti: valori di riserva, mai errori
    assert.deepEqual(C.riassuntoGiocatore('Nuovo', null), { id: 'nuovo', nome: 'Nuovo', avatar: 'immagini/magikarp.png', colore: '', titolo: '', elo: null, vinte: 0 });
    assert.equal(C.riassuntoGiocatore('x', { info: { color: 'rosso' } }).colore, '', 'solo colori veri');
    assert.equal(C.riassuntoGiocatore('x', { info: { color: '#abc' } }).colore, '#abc');
    assert.equal(C.riassuntoGiocatore(undefined, {}).nome, '');
});

function firebaseFinto({ utenti = {}, giocatori = {}, rotto = false } = {}) {
    const leggiPercorso = (radice, p) => p.split('/').reduce((x, k) => (x == null ? x : x[k]), radice);
    return {
        database: () => ({
            ref: p => ({
                once: async () => {
                    if (rotto) throw new Error('offline');
                    const v = p.startsWith('users/') ? leggiPercorso({ users: utenti }, p) : leggiPercorso({ players: giocatori }, p);
                    return { val: () => (v === undefined ? null : v) };
                }
            })
        })
    };
}

test('leggiGiocatore: dall\'account (users/<uid>) alla scheda (players/<nome>); l\'amministratore dal ruolo; account senza scheda e letture fallite non rompono nulla', async () => {
    const giocatori = {
        didi: { info: { name: 'Didi', avatar: 'a.png' }, stats: { 'individual-stats': { ranking: 1100, showdownsPlayed: 4 }, seasons: { won: 2 } } },
        luca: { info: { name: 'Luca' } }
    };
    const utenti = { u1: { name: 'Didi', role: 'admin' }, u2: { name: 'Luca' }, u3: {}, u4: { name: 'Sconosciuto' } };
    const win = firebase => ({ firebase });
    const r1 = await C.leggiGiocatore(win(firebaseFinto({ utenti, giocatori })), { uid: 'u1' });
    assert.equal(r1.admin, true);
    assert.deepEqual(r1.giocatore, { id: 'didi', nome: 'Didi', avatar: 'a.png', colore: '', titolo: '', elo: 1100, vinte: 2 });
    const r2 = await C.leggiGiocatore(win(firebaseFinto({ utenti, giocatori })), { uid: 'u2' });
    assert.equal(r2.admin, false);
    assert.equal(r2.giocatore.nome, 'Luca');
    assert.equal(r2.giocatore.elo, null);
    assert.deepEqual(await C.leggiGiocatore(win(firebaseFinto({ utenti, giocatori })), { uid: 'u3' }), { giocatore: null, admin: false }, 'account senza nome');
    assert.equal((await C.leggiGiocatore(win(firebaseFinto({ utenti, giocatori })), { uid: 'u4' })).giocatore.nome, 'Sconosciuto', 'senza scheda: il nome dell\'account');
    assert.equal(await C.leggiGiocatore(win(firebaseFinto({ rotto: true })), { uid: 'u1' }), null, 'lettura fallita');
    assert.equal(await C.leggiGiocatore(win(firebaseFinto({ utenti })), null), null, 'non collegato');
    assert.equal(await C.leggiGiocatore({}, { uid: 'u1' }), null, 'senza Firebase');
});

// ---------- le tessere delle impostazioni ----------

test('tessereOpzioni: suono e vibrazione sempre; gli avvisi solo per chi è collegato e se il telefono li può avere; Admin solo agli amministratori; in fondo esci/entra', () => {
    const etichette = s => C.tessereOpzioni(s).map(t => t.etichetta);
    assert.deepEqual(etichette({}), ['Sound', 'Vibration', 'Theme', 'Refresh', 'Log in']);
    assert.deepEqual(etichette(null), ['Sound', 'Vibration', 'Theme', 'Refresh', 'Log in']);
    assert.deepEqual(etichette({ utente: true, nome: 'Didi', push: 'spento' }), ['Sound', 'Vibration', 'Alerts', 'Theme', 'Refresh', 'Log out']);
    assert.deepEqual(etichette({ utente: true, push: 'non-supportato' }), ['Sound', 'Vibration', 'Theme', 'Refresh', 'Log out']);
    assert.deepEqual(etichette({ utente: true, push: '' }), ['Sound', 'Vibration', 'Theme', 'Refresh', 'Log out'], 'finché non si sa se può averli, niente tessera');
    assert.deepEqual(etichette({ utente: false, push: 'acceso' }), ['Sound', 'Vibration', 'Theme', 'Refresh', 'Log in'], 'senza account niente avvisi');
    assert.deepEqual(etichette({ utente: true, admin: true, push: 'acceso' }), ['Sound', 'Vibration', 'Alerts', 'Theme', 'Refresh', 'Admin', 'Log out']);
    // gli stati
    const t = s => Object.fromEntries(C.tessereOpzioni(s).map(x => [x.etichetta, x]));
    assert.equal(t({ suono: true }).Sound.stato, 'ON');
    assert.equal(t({ suono: true }).Sound.icona, 'suonoOn');
    assert.equal(t({ suono: false }).Sound.stato, 'OFF');
    assert.equal(t({ suono: false }).Sound.icona, 'suonoOff');
    assert.equal(t({ vibra: true }).Vibration.stato, 'ON');
    assert.equal(t({ vibra: false }).Vibration.stato, 'OFF');
    const avvisi = push => t({ utente: true, push }).Alerts;
    assert.equal(avvisi('acceso').stato, 'ON');
    assert.equal(avvisi('spento').stato, 'OFF');
    assert.equal(avvisi('negato').stato, 'BLOCKED');
    assert.equal(avvisi('negato').classe, 'gx-spenta');
    assert.equal(t({ utente: true, push: 'acceso', occupato: true }).Alerts.stato, '…');
    // cosa fa ogni tessera
    assert.equal(t({}).Sound.azione, 'suono');
    assert.equal(t({}).Vibration.azione, 'vibra');
    assert.equal(t({}).Refresh.azione, 'ricarica');
    assert.equal(t({}).Theme.href, 'profile.html#pf-tema', 'il tema si sceglie nella scheda del Profile');
    assert.equal(t({ utente: true, admin: true }).Admin.href, 'admin.html');
    assert.deepEqual([t({ utente: true, nome: 'Didi' })['Log out'].azione, t({ utente: true, nome: 'Didi' })['Log out'].stato, t({ utente: true })['Log out'].classe], ['esci', 'Didi', 'gx-rossa']);
    assert.deepEqual([t({})['Log in'].azione, t({})['Log in'].classe], ['entra', 'gx-verde']);
    // ogni tessera ha la sua icona, e le pagine che citano esistono
    for (const s of [{}, { utente: true, admin: true, push: 'negato', suono: true, vibra: true }]) {
        for (const x of C.tessereOpzioni(s)) {
            assert.ok(C.ICONE[x.icona], `${x.etichetta}: icona ${x.icona}`);
            assert.ok(x.azione || x.href, x.etichetta);
            if (x.href) assert.ok(fs.existsSync(path.join(DOCS, x.href.split('#')[0])), x.href);
        }
    }
    assert.ok(docs('profile.html').includes('id="pf-tema"'), 'la scheda del tema c\'è nel Profile');
});

// ---------- la finestra delle impostazioni, con una pagina finta ----------

function elemento(tag) {
    const e = {
        tagName: tag.toUpperCase(), id: '', hidden: false, textContent: '', attributi: {}, ascoltatori: {}, figli: [], _html: '', _dentro: {}, onload: null
    };
    e.className = '';
    Object.defineProperty(e, 'innerHTML', {
        get: () => e._html,
        set: v => {
            e._html = String(v);
            // gli elementi con un id dentro il contenuto si trovano con querySelector('#id')
            e._dentro = {};
            for (const m of e._html.matchAll(/\bid="([^"]+)"/g)) { const f = elemento('x'); f.id = m[1]; e._dentro[m[1]] = f; }
        }
    });
    e.setAttribute = (k, v) => { e.attributi[k] = String(v); };
    e.getAttribute = k => (k in e.attributi ? e.attributi[k] : null);
    e.appendChild = f => { e.figli.push(f); return f; };
    e.addEventListener = (ev, f) => { (e.ascoltatori[ev] = e.ascoltatori[ev] || []).push(f); };
    e.querySelector = sel => (sel.startsWith('#') ? e._dentro[sel.slice(1)] || null : null);
    return e;
}

function paginaImpostazioni({ push, memoria = {}, scripts = [{ getAttribute: () => 'app-comune.js' }], storageRotto = false } = {}) {
    const classiHtml = new Set();
    const registro = { suoni: [], vibrazioni: [], ricaricata: 0, pushState: [], indietro: 0, scripts: [] };
    const doc = {
        ascoltatori: {},
        documentElement: { classList: { toggle: (c, on) => { if (on) classiHtml.add(c); else classiHtml.delete(c); }, contains: c => classiHtml.has(c) } },
        body: elemento('body'), head: elemento('head'), scripts,
        createElement: tag => elemento(tag),
        getElementById: id => doc.body.figli.find(f => f.id === id) || null,
        querySelector: sel => (sel === '.gx-dialogo:not([hidden])' ? doc.body.figli.find(f => f.className === 'gx-dialogo' && !f.hidden) || null : null),
        addEventListener: (ev, f) => { (doc.ascoltatori[ev] = doc.ascoltatori[ev] || []).push(f); }
    };
    const win = {
        document: doc, ascoltatori: {}, registro,
        localStorage: storageRotto
            ? { getItem() { throw new Error('bloccato'); }, setItem() { throw new Error('bloccato'); } }
            : { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); } },
        location: { reload() { registro.ricaricata++; } },
        history: { state: null, pushState(s) { registro.pushState.push(s); win.history.state = s; }, back() { registro.indietro++; win.history.state = null; win.ascoltatori.popstate.forEach(f => f()); } },
        Suoni: { fai: n => registro.suoni.push(n), vibra: n => registro.vibrazioni.push(n) },
        addEventListener: (ev, f) => { (win.ascoltatori[ev] = win.ascoltatori[ev] || []).push(f); }
    };
    if (push) win.Push = push;
    const stato = { suono: true, utente: '', admin: false, accessi: 0, uscite: 0, cambi: 0 };
    const host = {
        suonoAcceso: () => stato.suono,
        cambiaSuono: () => { stato.cambi++; stato.suono = !stato.suono; },
        utente: () => stato.utente,
        admin: () => stato.admin,
        accedi: () => { stato.accessi++; },
        esci: () => { stato.uscite++; }
    };
    const opzioni = C.creaOpzioni(win, host);
    const dialogo = () => doc.getElementById('gx-opzioni');
    const griglia = () => dialogo().querySelector('#gx-opzioni-griglia').innerHTML;
    const tocca = azione => dialogo().ascoltatori.click.forEach(f => f({ target: { closest: sel => (sel === '[data-azione]' ? { getAttribute: () => azione } : null) } }));
    const chiudiConX = () => dialogo().ascoltatori.click.forEach(f => f({ target: { closest: sel => (sel === '[data-chiudi]' ? {} : null) } }));
    return { win, doc, opzioni, host, stato, memoria, registro, dialogo, griglia, tocca, chiudiConX, classiHtml };
}

test('finestra delle impostazioni: nasce alla prima apertura (con le classi dell\'app), mostra le tessere dello stato di quel momento e tiene la pagina ferma finché è aperta', () => {
    const p = paginaImpostazioni();
    assert.equal(p.dialogo(), null, 'non esiste finché non serve');
    p.opzioni.apri();
    const d = p.dialogo();
    assert.equal(d.className, 'gx-dialogo');
    assert.equal(d.attributi.role, 'dialog');
    assert.equal(d.attributi['aria-modal'], 'true');
    assert.match(d.innerHTML, /<h2 id="gx-opzioni-titolo">Settings<\/h2>/);
    assert.equal(d.hidden, false);
    assert.equal(p.opzioni.aperta(), true);
    assert.ok(p.classiHtml.has('gx-dialogo-aperto'), 'la pagina sotto non scorre');
    assert.deepEqual(p.registro.pushState.map(s => s.appOpzioni), [1], 'il tasto indietro del telefono chiude la finestra');
    // senza account: suono, vibrazione, tema, ricarica, accedi
    const g = p.griglia();
    assert.equal((g.match(/class="gx-opzione/g) || []).length, 5);
    assert.match(g, /data-azione="suono"/);
    assert.match(g, /<small>ON<\/small>/);
    assert.match(g, /<a class="gx-opzione" href="profile\.html#pf-tema" data-suono="scegli">/);
    assert.match(g, /class="gx-opzione gx-verde" data-azione="entra"/);
    assert.doesNotMatch(g, /Admin|Alerts/);
    // una seconda apertura riusa la stessa finestra
    p.opzioni.chiudi();
    p.opzioni.apri();
    assert.equal(p.doc.body.figli.filter(f => f.id === 'gx-opzioni').length, 1);
});

test('finestra delle impostazioni: si chiude con la X, toccando lo sfondo, con Esc e con il tasto indietro del telefono (una volta sola, senza tornare alla pagina prima)', () => {
    const p = paginaImpostazioni();
    p.opzioni.apri();
    p.chiudiConX();
    assert.equal(p.dialogo().hidden, true);
    assert.ok(!p.classiHtml.has('gx-dialogo-aperto'));
    assert.equal(p.registro.indietro, 1, 'la voce di cronologia messa all\'apertura si toglie');
    assert.equal(p.win.history.state, null);
    // sullo sfondo
    p.opzioni.apri();
    p.dialogo().ascoltatori.click.forEach(f => f({ target: p.dialogo() }));
    assert.equal(p.dialogo().hidden, true);
    assert.equal(p.registro.indietro, 2);
    // Esc
    p.opzioni.apri();
    p.doc.ascoltatori.keydown.forEach(f => f({ key: 'Enter' }));
    assert.equal(p.opzioni.aperta(), true, 'altri tasti no');
    p.doc.ascoltatori.keydown.forEach(f => f({ key: 'Escape' }));
    assert.equal(p.opzioni.aperta(), false);
    // tasto indietro del telefono: il browser toglie già la voce di cronologia, la finestra si chiude senza tornare di nuovo indietro
    p.opzioni.apri();
    const prima = p.registro.indietro;
    p.win.history.state = null;
    p.win.ascoltatori.popstate.forEach(f => f());
    assert.equal(p.opzioni.aperta(), false);
    assert.equal(p.registro.indietro, prima, 'nessun secondo "indietro"');
    // chiudere una finestra già chiusa non fa niente
    assert.doesNotThrow(() => p.opzioni.chiudi());
    assert.equal(p.registro.indietro, prima);
});

test('finestra delle impostazioni: suono e vibrazione si accendono e spengono subito, con il loro rumore di conferma; la vibrazione si ricorda', () => {
    const p = paginaImpostazioni();
    p.opzioni.apri();
    // suono: lo cambia la pagina (host); acceso, la tessera lo conferma con un bip
    p.tocca('suono');
    assert.equal(p.stato.cambi, 1);
    assert.match(p.griglia(), /Sound<\/b><small>OFF<\/small>/);
    assert.deepEqual(p.registro.suoni, [], 'appena spento: silenzio');
    p.tocca('suono');
    assert.match(p.griglia(), /Sound<\/b><small>ON<\/small>/);
    assert.deepEqual(p.registro.suoni, ['scegli']);
    // vibrazione: la ricorda l'app (appVibra), spenta non vibra
    p.tocca('vibra');
    assert.equal(p.memoria[C.CHIAVE_VIBRA], 'off');
    assert.match(p.griglia(), /Vibration<\/b><small>OFF<\/small>/);
    assert.deepEqual(p.registro.vibrazioni, []);
    p.tocca('vibra');
    assert.equal(p.memoria[C.CHIAVE_VIBRA], 'on');
    assert.match(p.griglia(), /Vibration<\/b><small>ON<\/small>/);
    assert.deepEqual(p.registro.vibrazioni, ['ok']);
    // senza il modulo dei suoni (o con lo storage bloccato) non succede niente di strano
    const b = paginaImpostazioni({ storageRotto: true });
    delete b.win.Suoni;
    b.opzioni.apri();
    assert.doesNotThrow(() => { b.tocca('suono'); b.tocca('vibra'); });
});

test('finestra delle impostazioni: ricarica, accedi ed esci; esci e accedi chiudono prima la finestra', () => {
    const p = paginaImpostazioni();
    p.opzioni.apri();
    p.tocca('ricarica');
    assert.equal(p.win.registro.ricaricata, 1);
    assert.equal(p.opzioni.aperta(), true);
    p.tocca('entra');
    assert.equal(p.stato.accessi, 1);
    assert.equal(p.opzioni.aperta(), false);
    p.stato.utente = 'Didi';
    p.opzioni.apri();
    assert.match(p.griglia(), /class="gx-opzione gx-rossa" data-azione="esci"/);
    assert.match(p.griglia(), /<small>Didi<\/small>/);
    p.tocca('esci');
    assert.equal(p.stato.uscite, 1);
    assert.equal(p.opzioni.aperta(), false);
    // una tessera che non conosce non fa niente
    p.opzioni.apri();
    assert.doesNotThrow(() => p.tocca('boh'));
    // il nome dell'amministratore: la tessera Admin
    p.stato.admin = true;
    p.opzioni.aggiorna();
    assert.match(p.griglia(), /href="admin\.html"/);
});

test('finestra delle impostazioni: gli avvisi (push) si caricano solo quando servono; accendere, spegnere, e il caso "bloccati" con la spiegazione', async () => {
    const chiamate = [];
    const push = {
        stato: async () => 'spento',
        attiva: async () => { chiamate.push('attiva'); return 'acceso'; },
        disattiva: async () => { chiamate.push('disattiva'); return 'spento'; },
        ripristina: () => {}
    };
    const p = paginaImpostazioni({ push });
    p.stato.utente = 'Didi';
    p.opzioni.apri();
    await passaUnGiro();
    assert.match(p.griglia(), /Alerts<\/b><small>OFF<\/small>/);
    p.tocca('avvisi');
    assert.match(p.griglia(), /Alerts<\/b><small>…<\/small>/, 'mentre aspetta una risposta');
    p.tocca('avvisi');
    assert.deepEqual(chiamate, ['attiva'], 'un secondo tocco nel frattempo non parte');
    await passaUnGiro();
    assert.match(p.griglia(), /Alerts<\/b><small>ON<\/small>/);
    p.tocca('avvisi');
    await passaUnGiro();
    assert.deepEqual(chiamate, ['attiva', 'disattiva']);
    assert.match(p.griglia(), /Alerts<\/b><small>OFF<\/small>/);
    // errore del telefono: si dice quale
    push.attiva = async () => { throw new Error('Permission denied by the phone'); };
    p.tocca('avvisi');
    await passaUnGiro();
    assert.equal(p.dialogo().querySelector('#gx-opzioni-avviso').textContent, 'Permission denied by the phone');
    assert.equal(p.dialogo().querySelector('#gx-opzioni-avviso').hidden, false);
    // bloccati dal telefono: la tessera è spenta e il tocco spiega cosa fare
    push.stato = async () => 'negato';
    p.opzioni.chiudi();
    p.opzioni.apri();
    await passaUnGiro();
    assert.match(p.griglia(), /gx-opzione gx-spenta" data-azione="avvisi"/);
    p.tocca('avvisi');
    assert.match(p.dialogo().querySelector('#gx-opzioni-avviso').textContent, /blocked/);
    // riaprendo la finestra l'avviso sparisce
    p.opzioni.chiudi();
    p.opzioni.apri();
    assert.equal(p.dialogo().querySelector('#gx-opzioni-avviso').hidden, true);
});

test('finestra delle impostazioni: se push.js non c\'è ancora lo carica dalla stessa cartella di app-comune.js (versione compresa) e poi lo ripristina', async () => {
    let ripristinato = 0;
    const p = paginaImpostazioni({ scripts: [{ getAttribute: () => 'https://x.test/didi-lu/app-comune.js?v=3' }] });
    p.opzioni.apri();
    const s = p.doc.head.figli[0];
    assert.equal(s.tagName, 'SCRIPT');
    assert.equal(s.src, 'https://x.test/didi-lu/push.js?v=3');
    p.win.Push = { stato: async () => 'acceso', ripristina: () => { ripristinato++; } };
    p.stato.utente = 'Didi';
    s.onload();
    await passaUnGiro();
    assert.equal(ripristinato, 1);
    assert.match(p.griglia(), /Alerts<\/b><small>ON<\/small>/);
    // senza nessuno script riconoscibile: nella cartella della pagina
    const q = paginaImpostazioni({ scripts: [] });
    q.opzioni.apri();
    assert.equal(q.doc.head.figli[0].src, 'push.js');
});
