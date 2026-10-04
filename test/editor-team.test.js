'use strict';
// Modifica del proprio team a fine partita contro la CPU, senza uscire dal simulatore:
//   - editor-team.js: il protocollo tra il Box (aperto in una finestra, iframe) e il simulatore (che lo apre);
//   - box.html: quando è aperto così mostra solo l'editor, avvisa il simulatore invece di ricaricare, rispetta i team bloccati;
//   - battle-ui.js / battle.html: il pulsante c'è solo se il team si può modificare, la finestra si apre e si chiude bene.
// Non guarda come viene la pagina: per quello serve un browser (vedi le prove con Playwright).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ET = require('../docs/editor-team.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');

// ---------- il protocollo ----------
test('urlEditor: il Box in modalità editor, con l\'id del team (anche strani) ben scritto nell\'indirizzo', () => {
    assert.equal(ET.urlEditor('-Nabc123'), 'box.html?modifica=-Nabc123&incorporato=1');
    assert.equal(ET.urlEditor('a b&c=d/é'), 'box.html?modifica=a%20b%26c%3Dd%2F%C3%A9&incorporato=1');
    assert.equal(ET.urlEditor(), 'box.html?modifica=&incorporato=1');
    assert.equal(ET.urlEditor('x', 'altro/box.html'), 'altro/box.html?modifica=x&incorporato=1');
});

test('teamDaModificare: rilegge l\'id dall\'indirizzo; niente, o scritto male, è una stringa vuota', () => {
    for (const id of ['-Nabc123', 'a b&c=d/é', '0']) assert.equal(ET.teamDaModificare(new URL('http://x/' + ET.urlEditor(id)).search), id);
    assert.equal(ET.teamDaModificare('?incorporato=1&modifica=t9'), 't9');
    assert.equal(ET.teamDaModificare('?incorporato=1'), '');
    assert.equal(ET.teamDaModificare(''), '');
    assert.equal(ET.teamDaModificare(null), '');
    assert.equal(ET.teamDaModificare('?modifica=%E0%A4%A'), '');
});

test('eIncorporato: serve il parametro nell\'indirizzo E una finestra dentro un\'altra', () => {
    const dentro = { parent: {} };
    const sopra = {}; sopra.parent = sopra;
    assert.equal(ET.eIncorporato('?modifica=t1&incorporato=1', dentro), true);
    assert.equal(ET.eIncorporato('?incorporato=1', dentro), true);
    assert.equal(ET.eIncorporato('?modifica=t1&incorporato=1&x=2', dentro), true);
    assert.equal(ET.eIncorporato('?modifica=t1&incorporato=1', sopra), false, 'aperto da solo, in una scheda: è il Box normale');
    assert.equal(ET.eIncorporato('?modifica=t1', dentro), false);
    assert.equal(ET.eIncorporato('?incorporato=10', dentro), false);
    assert.equal(ET.eIncorporato('?xincorporato=1', dentro), false);
    assert.equal(ET.eIncorporato('', dentro), false);
    assert.equal(ET.eIncorporato('?incorporato=1', null), false);
});

test('messaggio + leggiMessaggio: andata e ritorno per tutti gli eventi', () => {
    for (const evento of ET.EVENTI) {
        const m = ET.messaggio(evento, { id: 't1', messaggio: 'ciao' });
        assert.deepEqual(m, { sito: 'editor-team', evento, id: 't1', messaggio: 'ciao' });
        assert.deepEqual(ET.leggiMessaggio({ data: m }), { evento, id: 't1', messaggio: 'ciao' });
    }
    assert.deepEqual(ET.EVENTI, ['pronto', 'salvato', 'chiuso', 'bloccato', 'errore']);
    assert.deepEqual(ET.leggiMessaggio({ data: ET.messaggio('chiuso') }), { evento: 'chiuso', id: '', messaggio: '' });
});

test('leggiMessaggio: accetta solo la propria origine e la propria finestra', () => {
    const finestra = {}, altra = {};
    const e = (extra = {}) => ({ data: ET.messaggio('salvato', { id: 't1' }), origin: 'https://sito.test', source: finestra, ...extra });
    const filtro = { origine: 'https://sito.test', sorgente: finestra };
    assert.equal(ET.leggiMessaggio(e(), filtro).evento, 'salvato');
    assert.equal(ET.leggiMessaggio(e({ origin: 'https://altro.test' }), filtro), null, 'un\'altra origine');
    assert.equal(ET.leggiMessaggio(e({ source: altra }), filtro), null, 'un\'altra finestra');
    // senza filtri non si controlla l'origine (lo fa chi chiama, passando il filtro)
    assert.equal(ET.leggiMessaggio(e({ origin: 'https://altro.test' })).evento, 'salvato');
});

test('leggiMessaggio: ignora tutto ciò che non è nostro o è malformato', () => {
    assert.equal(ET.leggiMessaggio(null), null);
    assert.equal(ET.leggiMessaggio({}), null);
    assert.equal(ET.leggiMessaggio({ data: null }), null);
    assert.equal(ET.leggiMessaggio({ data: 'salvato' }), null);
    assert.equal(ET.leggiMessaggio({ data: { evento: 'salvato' } }), null, 'senza il nome del sito');
    assert.equal(ET.leggiMessaggio({ data: { sito: 'altro', evento: 'salvato' } }), null);
    assert.equal(ET.leggiMessaggio({ data: { sito: 'editor-team', evento: 'cancella-tutto' } }), null, 'evento sconosciuto');
    assert.equal(ET.leggiMessaggio({ data: { sito: 'editor-team', comando: 'chiudi' } }), null, 'i comandi vanno nell\'altro verso');
    // id e messaggio non stringhe diventano vuoti: il simulatore non scrive mai nulla che non sia testo
    const r = ET.leggiMessaggio({ data: { sito: 'editor-team', evento: 'errore', id: { x: 1 }, messaggio: 42 } });
    assert.deepEqual(r, { evento: 'errore', id: '', messaggio: '' });
});

// ---------- il Box aperto in una finestra ----------
const box = leggi('box.html');
const estrai = (testo, da, a) => {
    const i = testo.indexOf(da), j = testo.indexOf(a, i);
    assert.ok(i >= 0 && j > i, `non trovo ${da} … ${a}`);
    return testo.slice(i, j);
};

test('box.html: carica il protocollo e il foglio dell\'editor; la classe "incorporato" parte prima dei fogli di stile', () => {
    assert.match(box, /<script src="editor-team\.js"><\/script>/);
    assert.match(box, /<link rel="stylesheet" href="box-incorporato\.css">/);
    assert.ok(box.indexOf('href="box-incorporato.css"') > box.indexOf('href="box-team.css"'), 'il foglio dell\'editor va dopo quelli del Box');
    const testa = box.indexOf("classList.add('incorporato')");
    assert.ok(testa > 0 && testa < box.indexOf('href="style-box.css"'), 'la pagina non deve mai farsi vedere com\'è');
    assert.ok(box.indexOf('editor-team.js') < box.indexOf('const INCORPORATO'));
});

test('box.html: salvato nell\'editor non ricarica la pagina ma avvisa il simulatore', () => {
    const salva = estrai(box, 'async function salvaTeamSuFirebase', '// Funzione per ELIMINARE');
    const avviso = salva.indexOf("notificaSimulatore('salvato'");
    assert.ok(avviso > 0);
    assert.ok(salva.indexOf('if (INCORPORATO)') < avviso && avviso < salva.indexOf('location.reload()'), 'prima dell\'ultimo reload, con return in mezzo');
    assert.match(salva.slice(avviso, salva.indexOf('location.reload()')), /return;/);
});

test('box.html: ogni modo di chiudere l\'editor avvisa il simulatore; "Back" non interrompe un salvataggio', () => {
    // pannello, Team Builder, helper
    assert.match(estrai(box, 'function chiudiAdminProtetto', '// 7.'), /INCORPORATO && !tbModifica && !salvataggioTeamInCorso\) notificaSimulatore\('chiuso'\)/);
    assert.match(estrai(box, 'function chiudiTeamBuilder', '// Il builder è aperto'), /INCORPORATO && !tbModifica\) notificaSimulatore\('chiuso'\)/);
    assert.equal(estrai(box, 'function inizializzaChiusuraHelper', 'function chiudiTuttoHelper').match(/notificaSimulatore\('chiuso'\)/g).length, 2);
    assert.match(estrai(box, 'function chiudiEditorIncorporato', 'window.addEventListener(\'message\''), /if \(salvataggioTeamInCorso\) return;/);
});

test('box.html: in modalità editor niente musica; la lista dei formati non perde la selezione del pannello', () => {
    assert.match(box, /typeof ascoltaMusicaFirebase === "function" && !INCORPORATO/);
    assert.match(estrai(box, 'function sincronizzaCategorie', "document.addEventListener('DOMContentLoaded', sincronizzaCategorie)"), /const currentCatVal = selectCat\.value;[\s\S]*selectCat\.value = currentCatVal;/);
});

// Il pezzo "editor incorporato" di box.html fatto girare con una finestra e un documento finti
function boxEditor({ team, bloccati = new Set(), incorporato = true, opzioniFormato = 3, ricerca = '?modifica=t1&incorporato=1' }) {
    const chiamate = [];
    const posta = [];
    const finestraPadre = { postMessage: (m, origine) => posta.push({ m, origine }) };
    const selectFormato = { options: { length: opzioniFormato } };
    const finestra = { parent: incorporato ? finestraPadre : null, addEventListener: (t, f) => { finestra.ascoltatori.push([t, f]); }, ascoltatori: [], nomiTeamBloccati: bloccati };
    if (!incorporato) finestra.parent = finestra;
    const contesto = {
        window: finestra, location: { search: ricerca, origin: 'https://sito.test' },
        document: { getElementById: id => id === 'admin-team-cat' ? selectFormato : null },
        tuttiITeam: team ? [team] : [],
        EditorTeam: ET, TeamBloccati: require('../docs/team-bloccati.js'),
        caricaTeamBloccati: async () => chiamate.push('caricaTeamBloccati'),
        caricaTeamPerModifica: id => chiamate.push('pannello:' + id),
        modificaTeamNelBuilder: async () => { chiamate.push('builder'); },
        tbChiediChiusura: () => chiamate.push('tbChiediChiusura'),
        chiudiAdminProtetto: () => chiamate.push('chiudiAdminProtetto'),
        salvataggioTeamInCorso: false,
        setTimeout, console
    };
    vm.createContext(contesto);
    // dal "const INCORPORATO" alla fine del listener dei messaggi
    const codice = estrai(box, 'const INCORPORATO', '// Effetto delle nature').replace(/\bconst INCORPORATO\b/, 'var INCORPORATO');
    vm.runInContext(codice, contesto);
    contesto.window.location = contesto.location;
    return { contesto, chiamate, posta, finestra, finestraPadre, selectFormato };
}
const eventi = posta => posta.map(p => p.m.evento);

test('Box editor: team presente e modificabile → pannello, "pronto" e subito il Team Builder', async () => {
    const t = boxEditor({ team: { id: 't1', nome: 'Il mio OU' } });
    await t.contesto.avviaEditorIncorporato();
    assert.deepEqual(t.chiamate, ['caricaTeamBloccati', 'pannello:t1', 'builder']);
    assert.deepEqual(eventi(t.posta), ['pronto']);
    assert.equal(t.posta[0].origine, 'https://sito.test', 'il messaggio va solo alla propria origine');
    assert.equal(t.posta[0].m.id, 't1');
});

test('Box editor: team bloccato → "bloccato" e il pannello non si apre mai', async () => {
    const t = boxEditor({ team: { id: 't1', nome: 'Rain Dance' }, bloccati: new Set(['rain dance']) });
    await t.contesto.avviaEditorIncorporato();
    assert.deepEqual(t.chiamate, ['caricaTeamBloccati']);
    assert.deepEqual(eventi(t.posta), ['bloccato']);
});

test('Box editor: team non più nel Box → "errore" con una frase leggibile', async () => {
    const t = boxEditor({ team: null });
    await t.contesto.avviaEditorIncorporato();
    assert.deepEqual(t.chiamate, []);
    assert.deepEqual(eventi(t.posta), ['errore']);
    assert.match(t.posta[0].m.messaggio, /not in your Box/);
});

test('Box editor: aspetta che la lista dei formati del pannello sia pronta, poi apre', async () => {
    const t = boxEditor({ team: { id: 't1', nome: 'Il mio OU' }, opzioniFormato: 1 });
    const fine = t.contesto.avviaEditorIncorporato();
    await new Promise(ok => setTimeout(ok, 250));
    assert.ok(!t.chiamate.includes('pannello:t1'), 'senza formati nel pannello non apre ancora');
    t.selectFormato.options.length = 5;          // arriva la risposta di Firebase
    await fine;
    assert.deepEqual(t.chiamate, ['caricaTeamBloccati', 'pannello:t1', 'builder']);
});

test('Box editor: non incorporato (Box normale) → nessun messaggio, mai', () => {
    const t = boxEditor({ team: { id: 't1', nome: 'X' }, incorporato: false });
    t.contesto.notificaSimulatore('salvato', { id: 't1' });
    assert.deepEqual(t.posta, []);
    assert.equal(t.contesto.INCORPORATO, false);
    // e il comando "chiudi" non fa nulla
    const [, ascolta] = t.finestra.ascoltatori.find(([tipo]) => tipo === 'message');
    ascolta({ source: t.finestraPadre, origin: 'https://sito.test', data: { sito: 'editor-team', comando: 'chiudi' } });
    assert.deepEqual(t.chiamate, []);
});

test('Box editor: il comando "chiudi" si ascolta solo dalla finestra che ha aperto il Box, della stessa origine', () => {
    const t = boxEditor({ team: { id: 't1', nome: 'X' } });
    const [, ascolta] = t.finestra.ascoltatori.find(([tipo]) => tipo === 'message');
    const chiudi = { sito: 'editor-team', comando: 'chiudi' };
    ascolta({ source: {}, origin: 'https://sito.test', data: chiudi });
    ascolta({ source: t.finestraPadre, origin: 'https://altro.test', data: chiudi });
    ascolta({ source: t.finestraPadre, origin: 'https://sito.test', data: { sito: 'altro', comando: 'chiudi' } });
    ascolta({ source: t.finestraPadre, origin: 'https://sito.test', data: null });
    assert.deepEqual(t.chiamate, [], 'nessuna chiusura da chi non è il simulatore');
    ascolta({ source: t.finestraPadre, origin: 'https://sito.test', data: chiudi });
    assert.equal(eventi(t.posta).at(-1), 'chiuso', 'nessun Team Builder né pannello aperti: si chiude subito');
});

test('Box editor: "chiudi" con il Team Builder aperto passa dalla sua conferma; durante un salvataggio non fa nulla', () => {
    const t = boxEditor({ team: { id: 't1', nome: 'X' } });
    const [, ascolta] = t.finestra.ascoltatori.find(([tipo]) => tipo === 'message');
    const comando = { source: t.finestraPadre, origin: 'https://sito.test', data: { sito: 'editor-team', comando: 'chiudi' } };
    const documento = t.contesto.document;
    documento.getElementById = id => id === 'tb-overlay' ? { classList: { contains: c => c === 'open' } } : null;
    ascolta(comando);
    assert.deepEqual(t.chiamate, ['tbChiediChiusura']);
    t.contesto.salvataggioTeamInCorso = true;
    ascolta(comando);
    assert.deepEqual(t.chiamate, ['tbChiediChiusura'], 'sta salvando: chiudere ora lo interromperebbe');
    assert.deepEqual(t.posta, []);
});

test('Box editor: con solo il pannello aperto "chiudi" passa dalla sua chiusura (che avvisa il simulatore)', () => {
    const t = boxEditor({ team: { id: 't1', nome: 'X' } });
    const [, ascolta] = t.finestra.ascoltatori.find(([tipo]) => tipo === 'message');
    t.contesto.document.getElementById = id => id === 'admin-panel' ? { style: { display: 'block' } } : null;
    ascolta({ source: t.finestraPadre, origin: 'https://sito.test', data: { sito: 'editor-team', comando: 'chiudi' } });
    assert.deepEqual(t.chiamate, ['chiudiAdminProtetto']);
});

// ---------- il foglio dell'editor ----------
test('box-incorporato.css: nell\'editor si vede solo l\'editor (niente pagina del Box, niente musica, niente velo)', () => {
    const css = leggi('box-incorporato.css');
    const nascosti = css.match(/html\.incorporato :is\(([^)]*)\)\s*\{[^}]*display:\s*none\s*!important/);
    assert.ok(nascosti, 'regola che nasconde la pagina');
    for (const sel of ['main', '#teamsGrid', '.btn-floating-admin', '#music-control', '#menu-overlay', '#teamModal', '#pkmDetailModal', '#login-modal']) {
        assert.ok(nascosti[1].split(',').map(s => s.trim()).includes(sel), sel);
    }
    // il pannello e il Team Builder (e l'helper del fallback) non sono tra i nascosti
    for (const sel of ['#admin-panel', '#tb-overlay', '#helper-modal-overlay']) assert.ok(!nascosti[1].includes(sel), sel);
    assert.match(css, /html\.incorporato #admin-backdrop\s*\{[^}]*background:\s*transparent/);
});

// ---------- il simulatore ----------
const ui = leggi('battle-ui.js');
const battle = leggi('battle.html');
const css = leggi('style-battle.css');

test('battle.html: la finestra dell\'editor c\'è, nascosta, con gli id che battle-ui.js usa', () => {
    const m = battle.match(/<div class="editor-team" id="editor-team"[^>]*>/);
    assert.ok(m && /\shidden(\s|>)/.test(m[0]), 'nascosta all\'inizio');
    assert.match(m[0], /role="dialog"/);
    for (const id of ['editor-team-titolo', 'editor-team-chiudi', 'editor-team-corpo']) {
        assert.match(battle, new RegExp(`id="${id}"`), id);
        assert.match(ui, new RegExp(`\\$\\('${id}'\\)`), `${id} usato da battle-ui.js`);
    }
    assert.ok(battle.indexOf('id="editor-team"') > battle.indexOf('</main>'), 'sopra tutta la pagina, non dentro la scala che si rimpicciolisce');
});

test('battle-ui.js: "Edit my team" solo se il team si può modificare; altrimenti la nota del lucchetto', () => {
    const azioni = estrai(ui, 'function azioniCpu', 'function mostraFineCpu');
    assert.match(azioni, /if \(cpu\.modificabile === true\) azioni\.push\([^;]*'Edit my team'/, 'null (si sta ancora controllando) e false: nessun pulsante');
    assert.match(azioni, /'Back to Box'/);
    assert.match(azioni, /if \(!cpu\.problemi\.length\)[\s\S]*Rematch[\s\S]*Another random CPU team/, 'dopo una modifica non giocabile niente rivincita');
    assert.match(azioni, /apriEditorTeam/);
    assert.match(ui, /cpu\.modificabile === false \? '🔒 Locked team: it can\\'t be edited'/);
    assert.match(ui, /function apriEditorTeam\(\) \{\s*if \(!cpu \|\| cpu\.modificabile !== true \|\| editor\) return;/, 'anche chiamata a mano non apre un team bloccato');
});

test('battle-ui.js: la regola del blocco è quella condivisa del Box, e nel dubbio il team non si tocca', () => {
    const v = estrai(ui, 'async function verificaModificabile', '// -----');
    assert.match(v, /ref\('seasons'\)\.once\('value'\)/);
    assert.match(v, /cpu\.modificabile = !self\.TeamBloccati\.eBloccato\(snap\.val\(\), nomeTeam\)/);
    assert.match(v, /catch[\s\S]*cpu\.modificabile = false/);
    assert.match(ui, /import '\.\/team-bloccati\.js'/);
    assert.match(ui, /import '\.\/editor-team\.js'/);
});

test('battle-ui.js: i messaggi della finestra si accettano solo dalla propria origine e dal proprio iframe', () => {
    const m = estrai(ui, "window.addEventListener('message'", '// Il team è stato salvato');
    assert.match(m, /leggiMessaggio\(e, \{ origine: location\.origin, sorgente: editor\.frame\.contentWindow \}\)/);
    assert.match(m, /if \(!editor\) return;/);
    assert.match(m, /'salvato'\) \{ chiudiEditorTeam\(\); dopoModificaTeam\(\); \}/);
    assert.match(m, /'chiuso'\) chiudiEditorTeam\(\)/);
    assert.match(m, /'bloccato'[\s\S]*cpu\.modificabile = false/);
    assert.match(m, /'errore'[\s\S]*cpu\.avviso =/);
});

test('battle-ui.js: la finestra si apre sul team giusto, si chiude togliendo l\'iframe, "Back" passa dal Box', () => {
    const apri = estrai(ui, 'function apriEditorTeam', 'function chiudiEditorTeam');
    assert.match(apri, /EditorTeam\.urlEditor\(cpu\.chiaveTeam\)/);
    assert.match(apri, /classList\.add\('con-editor'\)/);
    const chiudi = estrai(ui, 'function chiudiEditorTeam', '// "Back"');
    assert.match(chiudi, /editor\.frame\.remove\(\)/);
    assert.match(chiudi, /classList\.remove\('con-editor'\)/);
    assert.match(chiudi, /\$\('editor-team'\)\.hidden = true/);
    const back = estrai(ui, 'function chiediChiusuraEditor', "window.addEventListener('message'");
    assert.match(back, /if \(editor\.pronto\) editor\.frame\.contentWindow\.postMessage\(\{ sito: EditorTeam\.SITO, comando: 'chiudi' \}, location\.origin\)/);
    assert.match(back, /else chiudiEditorTeam\(\)/, 'se l\'editor non è ancora partito si chiude subito');
    assert.match(back, /\$\('editor-team-chiudi'\)\.addEventListener\('click', chiediChiusuraEditor\)/, '"Back"');
    assert.match(back, /e\.key === 'Escape' && editor\) chiediChiusuraEditor\(\)/, 'Esc, con la tastiera sul simulatore');
});

test('battle-ui.js: dopo il salvataggio il team si rilegge; se il formato cambia si riparte da capo', () => {
    const d = estrai(ui, 'async function dopoModificaTeam', '// -----');
    assert.match(d, /caricaPerProva\(firebase\.database\(\), firebase\.auth\(\)\.currentUser, cpu\.chiaveTeam\)/);
    assert.match(d, /if \(dati\.formato !== config\.formato\) return location\.reload\(\)/);
    assert.match(d, /config\.p1\.team = dati\.team\.testo/);
    assert.match(d, /cpu\.problemi = dati\.problemi/);
    assert.match(d, /schedeCpu\(\)/);
    assert.match(d, /verificaModificabile\(dati\.team\.nome\)/, 'il nome può essere cambiato: si ricontrolla il blocco');
});

test('style-battle.css: la finestra copre la pagina, sopra tutto, e "nascosta" vince su display:flex', () => {
    assert.match(css, /\.editor-team\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*9000/);
    assert.match(css, /\.editor-team\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(css, /body\.con-editor\s*\{\s*overflow:\s*hidden/);
});
