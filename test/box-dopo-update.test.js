'use strict';
// Box: dopo l'update di un team la pagina si ricarica e deve tornare com'era (ricerca, formato, etichetta, ordine, vista, spunta dei bloccati,
// cartella aperta, scorrimento) — solo in quel caso. Qui: il cablaggio in box.html e le funzioni che mettono da parte e rimettono lo stato,
// eseguite con una pagina finta.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const box = fs.readFileSync(path.join(__dirname, '..', 'docs', 'box.html'), 'utf8');
const estrai = (testo, da, a) => { const i = testo.indexOf(da); const j = testo.indexOf(a, i + da.length); assert.ok(i >= 0 && j > i, `non trovo ${da} … ${a}`); return testo.slice(i, j); };

test('cablaggio: lo stato si mette da parte solo nell\'update di un team (dopo il ritorno al simulatore, prima del reload), non nella cancellazione', () => {
    const salva = estrai(box, 'async function salvaTeamSuFirebase', '// Funzione per ELIMINARE');
    const parte = salva.indexOf('if (editingId) mettiDaParteIlBox(editingId);');
    assert.ok(parte > 0, 'chiamata sotto if (editingId)');
    assert.ok(salva.indexOf('if (INCORPORATO)') < parte && parte < salva.indexOf('location.reload()'));
    assert.equal((salva.match(/mettiDaParteIlBox/g) || []).length, 1);
    const elimina = estrai(box, 'function cancellaTeamDaFirebase', '// MODIFICA uno specifico team');
    assert.ok(!/mettiDaParteIlBox/.test(elimina), 'la cancellazione non conserva niente');
    // la fotografia si prende all'apertura della modifica
    const apri = estrai(box, 'async function modificaTeamNelBuilder', 'tbModifica = {');
    assert.match(apri, /fotoBoxPrimaDiModificare = fotografiaBox\(teamId\)/);
});

test('cablaggio: all\'apertura si legge una volta lo stato messo da parte, dopo ordine e vista salvati e prima del disegno, e si rimette il punto dopo il disegno', () => {
    const init = estrai(box, "ripristinaPreferenze();     // l'ordine", 'if (INCORPORATO) avviaEditorIncorporato();');
    const lettura = init.indexOf('leggiBoxMessoDaParte()');
    const campi = init.indexOf('rimettiIlBox(comeEra)');
    const disegno = init.indexOf('await applicaFiltri()');
    const punto = init.indexOf('rimettiIlPuntoDelBox(comeEra)');
    assert.ok(lettura >= 0 && lettura < campi && campi < disegno && disegno < punto, 'ordine: leggi, campi, disegno, scorrimento');
    assert.match(box, /async function applicaFiltri\(\) \{/);
    assert.match(box, /await renderizza\(filtrati\);\s*if \(cartellaAperta\) await disegnaCartellaAperta\(\);/, 'applicaFiltri aspetta il disegno (anche della cartella)');
    assert.match(box, /sortFilter\.value = 'win';\s*}\s*ripristinaPreferenze\(\);/);
});

// ---------- le funzioni, con una pagina finta ----------
function pagina({ vista = 'griglia', cartella = null, scorri = 0, scorriCartella = 0 } = {}) {
    const campo = (tag, value, opzioni = []) => ({ tagName: tag, value, options: opzioni.map(v => ({ value: v })), checked: false, appendChild(o) { this.options.push(o); } });
    const campi = {
        searchInput: campo('INPUT', 'zoro'),
        categoryFilter: campo('SELECT', 'Little Cup', ['', 'Little Cup']),
        labelFilter: campo('SELECT', 'lab1', ['', 'lab1']),
        sortFilter: campo('SELECT', 'format', ['win', 'alpha', 'format']),
        viewFilter: campo('SELECT', vista, ['griglia', 'cartelle']),            // nell'app la lista non c'è
        hideLockedFilter: campo('INPUT', '')
    };
    campi.hideLockedFilter.checked = true;
    const fondo = { scrollTop: scorriCartella };
    const archivio = new Map();
    const ctx = {
        playerID: 'didi', VISTE: ['griglia', 'lista', 'cartelle'], vistaBox: vista, cartellaAperta: cartella,
        campoBox: id => campi[id] || null,
        document: { getElementById: id => (id === 'cartella-fondo' && cartella ? fondo : null), documentElement: { scrollTop: scorri } },
        window: { scrollY: scorri },
        sessionStorage: { getItem: k => (archivio.has(k) ? archivio.get(k) : null), setItem: (k, v) => archivio.set(k, String(v)), removeItem: k => archivio.delete(k) },
        Option: function (testo, value) { return { value, testo }; },
        Date
    };
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    // le funzioni stanno in box.html: tra la chiave e il commento che apre la parte del disegno
    const codice = estrai(box, 'const CHIAVE_DOPO_UPDATE', '// Dopo il disegno: la pagina');
    vm.runInContext(codice + '\nthis.fn = { fotografiaBox, mettiDaParteIlBox, leggiBoxMessoDaParte, rimettiIlBox, chiave: CHIAVE_DOPO_UPDATE, imposta(f) { fotoBoxPrimaDiModificare = f; }, vista: () => vistaBox, cartella: () => cartellaAperta };', ctx);
    return { ctx, campi, archivio, fn: ctx.fn };
}

test('fotografiaBox: tutto quello che si vede nel Box; la cartella conta solo in vista a cartelle', () => {
    const a = pagina({ vista: 'cartelle', cartella: 'Little Cup', scorri: 640, scorriCartella: 120 });
    const f = a.fn.fotografiaBox('T1');
    assert.deepEqual({ ...f, t: 0 }, { t: 0, team: 'T1', cerca: 'zoro', formato: 'Little Cup', etichetta: 'lab1', ordine: 'format', vista: 'cartelle', bloccati: true, cartella: 'Little Cup', scorri: 640, scorriCartella: 120 });
    const b = pagina({ vista: 'griglia', cartella: 'Little Cup', scorri: 5 });
    assert.equal(b.fn.fotografiaBox('T1').cartella, null);
});

test('mettiDaParteIlBox + leggiBoxMessoDaParte: si rilegge una sola volta e solo se recente; usa la fotografia presa all\'apertura se è dello stesso team', () => {
    const a = pagina({ scorri: 10 });
    a.fn.imposta({ ...a.fn.fotografiaBox('T1'), scorri: 999 });             // com'era all'apertura della modifica
    a.fn.mettiDaParteIlBox('T1');
    assert.ok(a.archivio.has('boxDopoUpdate:didi'));
    const letto = a.fn.leggiBoxMessoDaParte();
    assert.equal(letto.scorri, 999, 'la fotografia dell\'apertura, non lo scorrimento di adesso');
    assert.equal(a.fn.leggiBoxMessoDaParte(), null, 'la seconda volta non c\'è più: una riapertura normale riparte da zero');
    // una fotografia di un altro team non vale: se ne prende una adesso
    a.fn.imposta({ ...a.fn.fotografiaBox('ALTRO'), scorri: 999 });
    a.fn.mettiDaParteIlBox('T1');
    assert.equal(a.fn.leggiBoxMessoDaParte().scorri, 10);
    // vecchia, rotta o assente
    a.archivio.set('boxDopoUpdate:didi', JSON.stringify({ ...a.fn.fotografiaBox('T1'), t: Date.now() - 11 * 60 * 1000 }));
    assert.equal(a.fn.leggiBoxMessoDaParte(), null, 'dopo dieci minuti non vale più');
    a.archivio.set('boxDopoUpdate:didi', '{rotto');
    assert.equal(a.fn.leggiBoxMessoDaParte(), null);
    assert.equal(a.fn.leggiBoxMessoDaParte(), null);
});

test('rimettiIlBox: rimette i campi; formato ed etichetta non ancora caricati si aggiungono, ordine e vista che non esistono (la lista nell\'app) no', () => {
    const a = pagina();
    const c = a.campi;
    c.searchInput.value = ''; c.categoryFilter.options = [{ value: '' }]; c.categoryFilter.value = ''; c.labelFilter.options = [{ value: '' }]; c.labelFilter.value = '';
    c.sortFilter.value = 'win'; c.viewFilter.value = 'griglia'; c.hideLockedFilter.checked = false;
    a.fn.rimettiIlBox({ cerca: 'tapu', formato: 'Monotype', etichetta: 'L9', ordine: 'alpha', vista: 'cartelle', bloccati: true, cartella: 'Monotype' });
    assert.equal(c.searchInput.value, 'tapu');
    assert.equal(c.categoryFilter.value, 'Monotype');
    assert.ok(c.categoryFilter.options.some(o => o.value === 'Monotype'), 'opzione aggiunta in attesa del caricamento dei formati');
    assert.equal(c.labelFilter.value, 'L9');
    assert.equal(c.sortFilter.value, 'alpha');
    assert.equal(c.viewFilter.value, 'cartelle');
    assert.equal(c.hideLockedFilter.checked, true);
    assert.equal(a.fn.vista(), 'cartelle');
    assert.equal(a.fn.cartella(), 'Monotype', 'la cartella si riapre');
    // nell'app la lista non c'è: la vista e l'ordine che non hanno l'opzione restano quelli di prima
    const b = pagina();
    b.campi.viewFilter.value = 'griglia';
    b.fn.rimettiIlBox({ cerca: '', formato: '', etichetta: '', ordine: 'inesistente', vista: 'lista', bloccati: false, cartella: 'Monotype' });
    assert.equal(b.campi.viewFilter.value, 'griglia');
    assert.equal(b.campi.sortFilter.value, 'format');
    assert.ok(!b.campi.viewFilter.options.some(o => o.value === 'lista'));
    assert.equal(b.fn.cartella(), null, 'senza vista a cartelle nessuna cartella aperta');
    assert.equal(b.campi.hideLockedFilter.checked, false);
});
