'use strict';
// Le bozze nel Box e nel Team Builder (box.html + bozze-team.js):
//   - "Save draft" mette da parte un team anche a metà (cinque Pokémon, niente nome, niente mosse): sta in players/<id>/bozze, non è un team;
//   - chiudendo il Team Builder con un team non salvato si sceglie: bozza, scartare o continuare (nell'editor del simulatore resta la conferma di prima);
//   - una copia di sicurezza nel browser permette di riprendere un team rimasto aperto quando la pagina si è chiusa;
//   - le card delle bozze stanno in testa alla griglia, in ogni vista, e seguono la ricerca e il formato;
//   - salvando il team nel Box la bozza (e il backup) spariscono.
// Il comportamento delle funzioni di box.html si prova compilandole qui, con una pagina finta; l'aspetto si prova nel browser.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BozzeTeam = require('../docs/bozze-team.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const box = docs('box.html');
const cssBox = docs('box-team.css');
const cssApp = docs('app-gioco-pagine.css');

/** Il testo di una funzione di primo livello di box.html (fino alla sua graffa di chiusura in prima colonna) */
const sorgente = nome => {
    const m = new RegExp(`^(async )?function ${nome}\\(`, 'm').exec(box);
    assert.ok(m, `function ${nome}`);
    const fine = box.indexOf('\n}\n', m.index);
    assert.ok(fine > 0, `la fine di ${nome}`);
    return box.slice(m.index, fine + 2);
};
/**
 * Compila alcune funzioni di box.html dentro un ambiente `S`: i nomi che usano (variabili e funzioni della pagina) si cercano in `S`,
 * e quelli che riassegnano (tbBozzaId, tbModifica...) si riscrivono lì, così si vede cosa succede dopo la chiamata.
 */
const compila = (nomi, S) => new Function('S', `with (S) { ${nomi.map(sorgente).join('\n')}\n return { ${nomi.join(', ')} }; }`)(S);

const TESTO = 'Garchomp @ Rocky Helmet\nAbility: Rough Skin\n- Earthquake\n\nIncineroar\nAbility: Intimidate\n- Fake Out';

/** Una pagina finta con il Team Builder aperto su un team con un Pokémon */
function pagina(extra = {}) {
    const memoria = new Map();
    const S = {
        INCORPORATO: false, playerID: 'didi', bozzeTeam: [],
        tbBozzaId: null, tbBozzaSalvata: '', tbBackupScritto: false, tbTimerBackup: null, tbModifica: null,
        aperto: true, nome: 'Rain', testo: TESTO, scritti: [], rimossi: [], avvisi: [], chiamate: [], conferma: true, fallisci: false,
        BozzeTeam,
        storage: { getItem: k => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: k => memoria.delete(k) },
        memoriaBrowser: () => S.storage,
        tbStato: { slot: [{ specieId: 'garchomp' }, null, null, null, null, null], regolamento: { categoria: 'VGC Gen 9' } },
        tbNomeTeam: () => S.nome,
        tbTestoShowdown: () => S.testo,
        tbImpronta: () => `${S.nome}\u0001${S.testo}`,
        tbRenderRiepilogo: () => S.chiamate.push('riepilogo'),
        tbApriDialogoChiusura: () => S.chiamate.push('dialogo'),
        tbChiudiDialogoChiusura: () => S.chiamate.push('chiudiDialogo'),
        chiudiTeamBuilder: () => S.chiamate.push('chiudiBuilder'),
        tbChiudiDefinitivo: () => S.chiamate.push('chiudiDefinitivo'),
        alert: m => S.avvisi.push(m),
        confirm: m => { S.chiamate.push('conferma'); return S.conferma; },
        setTimeout: () => 0,
        console: { error() {}, warn() {}, log() {} },
        bottone: { textContent: 'Save draft', disabled: false, isConnected: true },
        document: {
            getElementById: id => {
                if (id === 'tb-overlay') return { classList: { contains: c => S.aperto && c === 'open' } };
                if (id === 'tb-btn-bozza') return S.bottone;
                return null;
            }
        },
        db: {
            ref: percorso => ({
                push: () => ({ key: 'nuova1' }),
                set: async dati => { if (S.fallisci) throw new Error('rete'); S.scritti.push([percorso, dati]); },
                remove: async () => { S.rimossi.push(percorso); }
            })
        },
        ...extra
    };
    return S;
}

// ---------- quando "ci sono modifiche" ----------

test('chiusura del Team Builder: un team nuovo con almeno un Pokémon è da salvare, uno vuoto o un builder chiuso no', () => {
    const S = pagina();
    const { tbCiSonoModifiche } = compila(['tbCiSonoModifiche'], S);
    assert.equal(tbCiSonoModifiche(), true, 'team nuovo con un Pokémon');
    S.tbStato.slot = [null, null, null, null, null, null];
    assert.equal(tbCiSonoModifiche(), false, 'nessun Pokémon: niente da perdere');
    S.tbStato.slot[0] = {};
    S.aperto = false;
    assert.equal(tbCiSonoModifiche(), false, 'builder chiuso');
});

test('chiusura del Team Builder: un team del Box conta solo se è diverso da com\'era', () => {
    const S = pagina({ tbModifica: { teamId: 't1', testoIniziale: TESTO } });
    const { tbCiSonoModifiche } = compila(['tbCiSonoModifiche'], S);
    assert.equal(tbCiSonoModifiche(), false, 'uguale a quello salvato');
    S.testo = TESTO + '\n\nRillaboom';
    assert.equal(tbCiSonoModifiche(), true, 'un Pokémon in più');
});

test('chiusura del Team Builder: aperto da una bozza conta ciò che è cambiato rispetto alla bozza, anche solo il nome', () => {
    const S = pagina({ tbModifica: { teamId: null, nome: 'Rain', testoIniziale: TESTO } });
    const { tbCiSonoModifiche } = compila(['tbCiSonoModifiche'], S);
    S.tbBozzaId = 'b1';
    S.tbBozzaSalvata = S.tbImpronta();          // com'è appena aperta
    assert.equal(tbCiSonoModifiche(), false, 'appena aperta: niente da perdere');
    S.nome = 'Rain v2';
    assert.equal(tbCiSonoModifiche(), true, 'cambiato solo il nome della bozza');
    S.tbBozzaSalvata = S.tbImpronta();          // rimessa da parte
    assert.equal(tbCiSonoModifiche(), false, 'appena rimessa da parte');
    S.testo = TESTO + '\n\nRillaboom';
    assert.equal(tbCiSonoModifiche(), true, 'un Pokémon in più dopo l\'ultimo salvataggio');
});

test('chiusura del Team Builder: ripreso dal backup non è salvato da nessuna parte, quindi si chiede cosa farne', () => {
    // il backup non ha un testo "iniziale" uguale a niente: tbModifica.testoIniziale è un segnaposto
    const senzaBozza = pagina({ tbModifica: { teamId: null, daBackup: true, testoIniziale: '\u0000' } });
    assert.equal(compila(['tbCiSonoModifiche'], senzaBozza).tbCiSonoModifiche(), true);
    // il backup di una sessione che aveva già una bozza: la bozza salvata non è quella di adesso
    const conBozza = pagina({ tbModifica: { teamId: null, daBackup: true, testoIniziale: '\u0000' }, tbBozzaId: 'b1', tbBozzaSalvata: '' });
    assert.equal(compila(['tbCiSonoModifiche'], conBozza).tbCiSonoModifiche(), true);
});

// ---------- chiudere il Team Builder ----------

test('X, fuori o Esc: senza modifiche si chiude; con modifiche si sceglie (bozza, scartare, continuare); nell\'editor del simulatore resta la conferma', () => {
    const S = pagina();
    const { tbChiediChiusura } = compila(['tbCiSonoModifiche', 'tbChiediChiusura'], S);
    S.tbStato.slot = [null, null, null, null, null, null];
    tbChiediChiusura();
    assert.deepEqual(S.chiamate, ['chiudiDefinitivo'], 'niente da perdere: si chiude');

    S.chiamate.length = 0; S.tbStato.slot[0] = {};
    tbChiediChiusura();
    assert.deepEqual(S.chiamate, ['dialogo'], 'con un team non salvato compare la scelta, senza confirm del browser');

    const sim = pagina({ INCORPORATO: true, conferma: false });
    const chiediSim = compila(['tbCiSonoModifiche', 'tbChiediChiusura'], sim).tbChiediChiusura;
    chiediSim();
    assert.deepEqual(sim.chiamate, ['conferma'], 'nel simulatore: la conferma, e se si risponde no resta aperto');
    sim.chiamate.length = 0; sim.conferma = true;
    chiediSim();
    assert.deepEqual(sim.chiamate, ['conferma', 'chiudiDefinitivo']);
});

test('chiudere davvero: il prossimo team riparte da zero e il backup di questa sessione si cancella', () => {
    const S = pagina({ tbModifica: { teamId: 't1' }, tbBozzaId: 'b1', tbBozzaSalvata: 'x', tbBackupScritto: true });
    S.storage.setItem(BozzeTeam.chiaveBackup('didi'), '{}');
    S.tbStato.firma = 'abc';
    compila(['tbChiudiDefinitivo'], S).tbChiudiDefinitivo();
    assert.equal(S.tbModifica, null);
    assert.equal(S.tbBozzaId, null);
    assert.equal(S.tbBozzaSalvata, '');
    assert.equal(S.tbBackupScritto, false);
    assert.equal(S.tbStato.firma, '');
    assert.equal(S.storage.getItem(BozzeTeam.chiaveBackup('didi')), null, 'il backup non serve più');
    assert.deepEqual(S.chiamate, ['chiudiDialogo', 'chiudiBuilder']);

    // un backup di un'altra sessione (questa non ne ha scritti) non si tocca
    const altra = pagina({ tbBackupScritto: false });
    altra.storage.setItem(BozzeTeam.chiaveBackup('didi'), '{}');
    compila(['tbChiudiDefinitivo'], altra).tbChiudiDefinitivo();
    assert.notEqual(altra.storage.getItem(BozzeTeam.chiaveBackup('didi')), null);
});

// ---------- "Save draft" ----------

test('Save draft: scrive la bozza del team (anche a metà, senza nome), la ricorda per i salvataggi dopo e toglie il backup', async () => {
    const S = pagina({ nome: '' });
    S.storage.setItem(BozzeTeam.chiaveBackup('didi'), '{}');
    S.tbBackupScritto = true;
    const { tbSalvaBozza } = compila(['tbSalvaBozza'], S);
    assert.equal(await tbSalvaBozza(), true);
    assert.equal(S.scritti.length, 1);
    const [percorso, dati] = S.scritti[0];
    assert.equal(percorso, 'players/didi/bozze/nuova1', 'sotto il giocatore, in una bozza nuova');
    assert.equal(dati.categoria, 'VGC Gen 9');
    assert.deepEqual(dati.specie, ['Garchomp', 'Incineroar']);
    assert.equal(dati.quanti, 2);
    assert.equal(dati.nome, '', 'senza nome: va bene lo stesso');
    assert.equal(dati.daTeam, '', 'un team nuovo non viene da un team del Box');
    assert.equal(S.tbBozzaId, 'nuova1');
    assert.equal(S.tbBozzaSalvata, S.tbImpronta(), 'da qui in poi conta solo ciò che cambia');
    assert.equal(S.storage.getItem(BozzeTeam.chiaveBackup('didi')), null, 'la bozza ha preso il posto del backup');
    assert.equal(S.tbBackupScritto, false);
    assert.equal(S.bottone.textContent, 'Draft saved ✓');
    assert.deepEqual(S.avvisi, []);
});

test('Save draft: il secondo salvataggio aggiorna la stessa bozza; da un team del Box ricorda quale', async () => {
    const S = pagina({ tbModifica: { teamId: 't9', testoIniziale: 'altro' }, tbBozzaId: 'b1' });
    const { tbSalvaBozza } = compila(['tbSalvaBozza'], S);
    assert.equal(await tbSalvaBozza(), true);
    assert.equal(S.scritti[0][0], 'players/didi/bozze/b1', 'stessa bozza, non una nuova');
    assert.equal(S.scritti[0][1].daTeam, 't9');
});

test('Save draft: niente da mettere da parte, troppe bozze, errore di rete, editor del simulatore', async () => {
    const vuoto = pagina();
    vuoto.testo = '';
    assert.equal(await compila(['tbSalvaBozza'], vuoto).tbSalvaBozza(), false);
    assert.match(vuoto.avvisi[0], /at least one Pokémon/);
    assert.equal(vuoto.scritti.length, 0);

    const piena = pagina({ bozzeTeam: Array.from({ length: BozzeTeam.MASSIMO }, (_, i) => ({ id: 'b' + i })) });
    assert.equal(await compila(['tbSalvaBozza'], piena).tbSalvaBozza(), false);
    assert.match(piena.avvisi[0], new RegExp(`up to ${BozzeTeam.MASSIMO} drafts`));
    // a quota piena una bozza già esistente si può comunque aggiornare
    const aggiorna = pagina({ bozzeTeam: piena.bozzeTeam, tbBozzaId: 'b3' });
    assert.equal(await compila(['tbSalvaBozza'], aggiorna).tbSalvaBozza(), true);

    const rotta = pagina({ fallisci: true });
    assert.equal(await compila(['tbSalvaBozza'], rotta).tbSalvaBozza(), false);
    assert.match(rotta.avvisi[0], /could not be saved/);
    assert.equal(rotta.tbBozzaId, null, 'se non si è scritta non si finge che lo sia');
    assert.equal(rotta.bottone.textContent, 'Save draft');
    assert.equal(rotta.bottone.disabled, false);

    const sim = pagina({ INCORPORATO: true });
    assert.equal(await compila(['tbSalvaBozza'], sim).tbSalvaBozza(), false, 'nell\'editor del simulatore le bozze non ci sono');
    assert.equal(sim.scritti.length, 0);
});

test('Save draft e chiudi: la finestra di chiusura chiude solo se la bozza è stata scritta', async () => {
    const S = pagina();
    const { tbChiudiConBozza } = compila(['tbSalvaBozza', 'tbChiudiConBozza'], S);
    await tbChiudiConBozza();
    assert.ok(S.chiamate.includes('chiudiDefinitivo'));
    const rotta = pagina({ fallisci: true });
    await compila(['tbSalvaBozza', 'tbChiudiConBozza'], rotta).tbChiudiConBozza();
    assert.ok(!rotta.chiamate.includes('chiudiDefinitivo'), 'con un errore il team resta aperto e non si perde');
});

// ---------- il backup nel browser ----------

test('backup: a ogni cambiamento si scrive la copia nel browser, con la bozza di origine; se non c\'è più niente da salvare si toglie', () => {
    const S = pagina({ tbBozzaId: 'b1', tbBozzaSalvata: 'diversa' });
    const { tbScriviBackup } = compila(['tbCiSonoModifiche', 'tbScriviBackup'], S);
    tbScriviBackup();
    const b = BozzeTeam.leggiBackup(S.storage, 'didi');
    assert.ok(b, 'il backup c\'è');
    assert.equal(b.bozzaId, 'b1');
    assert.equal(b.categoria, 'VGC Gen 9');
    assert.equal(b.quanti, 2);
    assert.equal(S.tbBackupScritto, true);
    // salvato come bozza: non c'è più niente da perdere
    S.tbBozzaSalvata = S.tbImpronta();
    tbScriviBackup();
    assert.equal(BozzeTeam.leggiBackup(S.storage, 'didi'), null);
    assert.equal(S.tbBackupScritto, false);
    // builder chiuso o editor del simulatore: non si scrive niente
    const sim = pagina({ INCORPORATO: true });
    compila(['tbCiSonoModifiche', 'tbScriviBackup'], sim).tbScriviBackup();
    assert.equal(BozzeTeam.leggiBackup(sim.storage, 'didi'), null);
});

test('backup: tornando nel Box si propone di riprendere il team rimasto aperto (e non si propone se è già una bozza uguale)', () => {
    const elementi = [];
    const crea = () => { const el = { id: '', className: '', innerHTML: '', attr: {}, setAttribute(k, v) { this.attr[k] = v; }, remove() { elementi.splice(elementi.indexOf(this), 1); } }; return el; };
    const doc = {
        getElementById: id => elementi.find(e => e.id === id) || null,
        createElement: crea,
        body: { appendChild: el => elementi.push(el) }
    };
    const S = pagina({ document: doc, escEtichetta: t => String(t).replace(/</g, '&lt;') });
    const { proponiBackup, chiudiBannerBackup, scartaBackup } = compila(['proponiBackup', 'chiudiBannerBackup', 'scartaBackup'], S);

    proponiBackup();
    assert.equal(elementi.length, 0, 'nessun backup, nessun banner');

    BozzeTeam.scriviBackup(S.storage, 'didi', { nome: 'Rain <b>', categoria: 'VGC Gen 9', testo: TESTO, bozzaId: 'b1' });
    proponiBackup();
    assert.equal(elementi.length, 1);
    assert.equal(elementi[0].id, 'bozza-ripresa');
    assert.match(elementi[0].innerHTML, /Rain &lt;b>/, 'il nome del team è escluso dall\'HTML');
    assert.match(elementi[0].innerHTML, /onclick="riprendiBackup\(\)"/);
    assert.match(elementi[0].innerHTML, /onclick="scartaBackup\(\)"/);
    assert.match(elementi[0].innerHTML, /2\/6 Pokémon/);
    proponiBackup();
    assert.equal(elementi.length, 1, 'un banner solo');

    scartaBackup();
    assert.equal(elementi.length, 0, 'Discard toglie il banner');
    assert.equal(BozzeTeam.leggiBackup(S.storage, 'didi'), null, '...e il backup');
    chiudiBannerBackup();

    // il backup è uguale alla bozza già salvata: non c'è niente da recuperare
    const pari = pagina({ document: doc, escEtichetta: t => t });
    const dati = BozzeTeam.perSalvare({ nome: 'Rain', categoria: 'VGC Gen 9', testo: TESTO });
    pari.bozzeTeam = [{ id: 'b1', ...dati }];
    BozzeTeam.scriviBackup(pari.storage, 'didi', { nome: 'Rain', categoria: 'VGC Gen 9', testo: TESTO, bozzaId: 'b1' });
    compila(['proponiBackup', 'chiudiBannerBackup', 'scartaBackup'], pari).proponiBackup();
    assert.equal(elementi.length, 0);
    assert.equal(BozzeTeam.leggiBackup(pari.storage, 'didi'), null, 'il backup inutile si cancella');
});

// ---------- le card nella griglia ----------

test('griglia del Box: le bozze si mettono in testa e seguono la ricerca e il formato (non nell\'editor del simulatore)', () => {
    const valori = { searchInput: '', categoryFilter: '', labelFilter: '' };
    const doc = { getElementById: id => (id in valori ? { value: valori[id] } : null) };
    const html = [];
    const grid = { insertAdjacentHTML: (dove, h) => html.push([dove, h]) };
    const bozze = BozzeTeam.elenco({
        b1: { nome: 'Rain nuovo', categoria: 'VGC Gen 9', testoShowdown: TESTO, aggiornata: 2 },
        b2: { nome: 'Fiore', categoria: 'Monotype', testoShowdown: 'Rillaboom\n- Grassy Glide', aggiornata: 1 }
    });
    const S = pagina({
        document: doc, bozzeTeam: bozze, escEtichetta: t => String(t),
        SpritePkm: { gif: nome => `gif/${nome}.gif` }, applicaFiltri: () => {}
    });
    const { aggiungiBozze } = compila(['filtriDelBox', 'aggiungiBozze'], S);
    const colore = () => '#abc';

    aggiungiBozze(grid, colore);
    assert.equal(html.length, 1);
    assert.equal(html[0][0], 'afterbegin', 'in testa alla griglia');
    assert.equal((html[0][1].match(/class="card card-bozza"/g) || []).length, 2);
    assert.ok(html[0][1].indexOf('Rain nuovo') < html[0][1].indexOf('Fiore'), 'la più recente prima');

    html.length = 0; valori.searchInput = 'fior';
    aggiungiBozze(grid, colore);
    assert.equal((html[0][1].match(/card-bozza"/g) || []).length, 1, 'la ricerca vale anche per le bozze');
    html.length = 0; valori.searchInput = ''; valori.categoryFilter = 'VGC Gen 9';
    aggiungiBozze(grid, colore);
    assert.match(html[0][1], /Rain nuovo/);
    assert.doesNotMatch(html[0][1], /Fiore/, 'il formato scelto vale anche per le bozze');
    html.length = 0; valori.categoryFilter = ''; valori.labelFilter = 'rain';
    aggiungiBozze(grid, colore);
    assert.equal(html.length, 0, 'le bozze non hanno etichette: con un filtro per etichetta non ce n\'è');

    html.length = 0; valori.labelFilter = '';
    const sim = pagina({ INCORPORATO: true, document: doc, bozzeTeam: bozze, escEtichetta: t => t, SpritePkm: { gif: () => '' } });
    compila(['filtriDelBox', 'aggiungiBozze'], sim).aggiungiBozze(grid, colore);
    assert.equal(html.length, 0, 'nell\'editor del simulatore le bozze non si vedono');
});

test('ascolto delle bozze: la prima lettura sblocca il caricamento, poi ogni cambiamento ridisegna il Box; senza giocatore o nel simulatore non si ascolta', async () => {
    let ascolto = null, ridisegni = 0;
    const db = { ref: percorso => ({ on: (ev, ok, ko) => { ascolto = { percorso, ev, ok, ko }; } }) };
    const S = pagina({ db, applicaFiltri: () => { ridisegni++; } });
    const { ascoltaBozze } = compila(['ascoltaBozze'], S);
    const pronta = ascoltaBozze();
    assert.equal(ascolto.percorso, 'players/didi/bozze');
    assert.equal(ascolto.ev, 'value');
    ascolto.ok({ val: () => ({ b1: { nome: 'A', categoria: 'VGC Gen 9', testoShowdown: TESTO, aggiornata: 5 } }) });
    const prime = await pronta;
    assert.equal(prime.length, 1);
    assert.equal(ridisegni, 0, 'la prima lettura non ridisegna: lo fa il caricamento della pagina');
    ascolto.ok({ val: () => ({}) });
    assert.equal(S.bozzeTeam.length, 0, 'una bozza tolta (qui o in un\'altra scheda) sparisce');
    assert.equal(ridisegni, 1);

    // errore di lettura: il Box si apre lo stesso
    const S2 = pagina({ db });
    const p2 = compila(['ascoltaBozze'], S2).ascoltaBozze();
    ascolto.ko(new Error('permesso'));
    assert.deepEqual(await p2, []);

    ascolto = null;
    assert.deepEqual(await compila(['ascoltaBozze'], pagina({ db, playerID: '' })).ascoltaBozze(), []);
    assert.deepEqual(await compila(['ascoltaBozze'], pagina({ db, INCORPORATO: true })).ascoltaBozze(), []);
    assert.equal(ascolto, null, 'niente ascolto');
});

// ---------- il collegamento in box.html ----------

test('box.html: lo script delle bozze è incluso prima del suo uso e le card stanno in testa alla griglia in tutte le viste', () => {
    assert.match(box, /<script src="bozze-team\.js"><\/script>/);
    assert.ok(box.indexOf('bozze-team.js') < box.indexOf('let bozzeTeam'), 'lo script prima del codice che lo usa');
    assert.match(box, /if \(principale\) aggiungiBozze\(grid, coloreFormato\);/, 'griglia e lista');
    assert.match(box, /if \(principale && vistaBox === 'cartelle'\) \{ renderizzaCartelle\(lista, grid, coloreFormato\); aggiungiBozze\(grid, coloreFormato\); return; \}/, 'cartelle');
    assert.match(box, /await ascoltaBozze\(\);/, 'le bozze si leggono prima del primo disegno');
    assert.match(box, /if \(INCORPORATO\) avviaEditorIncorporato\(\);\s*else proponiBackup\(\);/, 'il banner del backup non compare nell\'editor del simulatore');
});

test('box.html: salvare il team nel Box toglie la bozza da cui veniva (e il backup)', () => {
    const salva = sorgente('tbSalvaNelBox');
    assert.match(salva, /bozzaId: tbBozzaId/, 'il builder dice a quale bozza corrisponde');
    const firebase = sorgente('salvaTeamSuFirebase');
    assert.match(firebase, /\{ nome, categoria, testo, editingId = null, bozzaId = null \} = \{\}/);
    assert.match(firebase, /if \(bozzaId\) \{\s*try \{ await databaseRef\.child\(`\$\{BozzeTeam\.percorso\(playerID\)\}\/\$\{bozzaId\}`\)\.remove\(\); \}/);
    assert.match(firebase, /BozzeTeam\.cancellaBackup\(memoriaBrowser\(\), playerID\);/);
    // la bozza si toglie solo dopo che il team è stato scritto
    assert.ok(firebase.indexOf('await newTeamRef.set(datiTeamDaSalvare)') < firebase.indexOf('BozzeTeam.percorso(playerID)'), 'prima il team, poi la bozza: se il salvataggio fallisce la bozza resta');
});

test('box.html: aprire una bozza o il backup passa dal Team Builder di sempre (il team del Box d\'origine, se c\'è ancora e non è bloccato)', () => {
    assert.match(sorgente('continuaBozza'), /modificaTeamNelBuilder\(await teamDiOrigineDellaBozza\(b\.daTeam\), b\)/);
    assert.match(sorgente('riprendiBackup'), /modificaTeamNelBuilder\(await teamDiOrigineDellaBozza\(b\.daTeam\), \{ id: b\.bozzaId \|\| null, nome: b\.nome, categoria: b\.categoria, testoShowdown: b\.testoShowdown, daBackup: true \}\)/);
    const origine = sorgente('teamDiOrigineDellaBozza');
    assert.match(origine, /TeamBloccati\.eBloccato\(window\.nomiTeamBloccati, team\.nome\) \? null : team\.id/, 'un team nel frattempo iscritto a una stagione non si sovrascrive: la bozza diventa un team nuovo');
    assert.match(sorgente('cancellaBozza'), /confirm\(`Delete the draft/, 'cancellare una bozza chiede conferma');
});

test('box.html: la finestra di chiusura ha le tre scelte e il pulsante Save draft c\'è solo fuori dall\'editor del simulatore', () => {
    const dialogo = sorgente('tbApriDialogoChiusura');
    assert.match(dialogo, /onclick="tbChiudiConBozza\(\)">Save as draft</);
    assert.match(dialogo, /onclick="tbChiudiDefinitivo\(\)">Discard</);
    assert.match(dialogo, /onclick="tbChiudiDialogoChiusura\(\)">Keep editing</);
    assert.match(dialogo, /e\.key === 'Escape'\) \{ e\.stopPropagation\(\); tbChiudiDialogoChiusura\(\)/, 'Esc chiude la finestra, non il Team Builder');
    assert.match(dialogo, /e\.target === dialogo\) tbChiudiDialogoChiusura\(\)/, 'un clic fuori = continuare a modificare');
    assert.match(box, /\$\{INCORPORATO \? '' : `<button type="button" id="tb-btn-bozza"/, 'nel simulatore non c\'è');
    assert.match(box, /<div class="tb-actions \$\{variante === 'riga' \? 'tb-actions-row' : ''\}\$\{INCORPORATO \? '' : ' tb-con-bozza'\}">/);
    // X, clic fuori ed Esc passano tutti dalla stessa domanda
    assert.match(box, /<button type="button" class="tb-close" onclick="tbChiediChiusura\(\)"/);
    assert.match(box, /if \(clicSulloSfondo\(e, overlay\)\) tbChiediChiusura\(\);/);
    assert.match(box, /if \(builder && builder\.classList\.contains\('open'\)\) return tbChiediChiusura\(\);/, 'Esc dal Box');
    assert.match(sorgente('tbChiediChiusura'), /if \(INCORPORATO\) \{\s*if \(!confirm\("Are you sure you want to close the Team Builder\?/);
    assert.equal((box.match(/Are you sure you want to close the Team Builder\?/g) || []).length, 1, 'il vecchio avviso c\'è solo nel ramo del simulatore');
});

test('box.html: il fumetto del salvataggio bloccato rimanda a Save draft, e il pulsante si spegne senza Pokémon', () => {
    const riepilogo = sorgente('tbRenderRiepilogo');
    assert.match(riepilogo, /tb-bubble-bozza">Not finished\? <b>Save draft<\/b> keeps it as it is\./);
    assert.match(riepilogo, /btnBozza\.disabled = !tbStato\.slot\.some\(Boolean\)/);
    assert.match(riepilogo, /tbProgrammaBackup\(\);/, 'ogni cambiamento aggiorna il backup');
    assert.match(box, /window\.addEventListener\('pagehide'/, 'il backup si scrive anche quando la pagina sparisce');
    assert.match(box, /document\.addEventListener\('visibilitychange'/);
});

test('stile: card tratteggiata, caselle vuote, banner del backup e tre tasti nella riga (browser e app)', () => {
    assert.match(cssBox, /\.card\.card-bozza \{ border-style: dashed !important;/);
    assert.match(cssBox, /\.card \.pkm-box\.pkm-vuoto \{/);
    assert.match(cssBox, /\.bozza-ripresa \{/);
    assert.match(cssBox, /\.tb-actions-row\.tb-con-bozza \.tb-actions-io \.tb-btn \{ flex: 0 0 auto; white-space: nowrap; \}/, 'nella riga i tre tasti non si stringono fino a tagliare il testo');
    assert.match(cssApp, /\[data-tb-step="team"\] \.tb-actions\.tb-con-bozza \.tb-actions-io \.tb-btn \{ grid-column: span 2; \}/, 'nell\'app Import, Export e Save draft stanno nella stessa riga');
});

test('regole del database: le bozze sono documentate (nessuna regola in più)', () => {
    const regole = fs.readFileSync(path.join(__dirname, '..', 'REGOLE-DATABASE.md'), 'utf8');
    assert.match(regole, /players\/<id>\/bozze\/<idBozza>/);
    assert.match(regole, /boxBackup:<giocatore>/);
});
