'use strict';
// Ritirare la propria scelta in un match online (functions/ritira-scelta.js e il suo collegamento nel server).
// Il database è finto ma si comporta come quello di Firebase dove conta: una transazione parte con la copia locale vuota
// (null), il server la rifiuta se il dato vero è diverso e la funzione viene richiamata col dato vero; se restituisce
// undefined la transazione si annulla.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ritiraScelta } = require('../functions/ritira-scelta.js');

const clona = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

function creaDbFinto(iniziale = {}) {
    const radice = clona(iniziale);
    const chiavi = p => p.split('/').filter(Boolean);
    const leggi = p => { let n = radice; for (const k of chiavi(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : clona(n); };
    const scrivi = (p, v) => {
        const k = chiavi(p);
        let n = radice;
        for (const parte of k.slice(0, -1)) { if (n[parte] == null || typeof n[parte] !== 'object') n[parte] = {}; n = n[parte]; }
        if (v === null || v === undefined) delete n[k[k.length - 1]]; else n[k[k.length - 1]] = clona(v);
    };
    const db = {
        radice,
        scritture: [],
        // chiamata dopo la prima volta che la funzione della transazione ha guardato il dato, prima del salvataggio:
        // permette di far arrivare "nello stesso istante" la scelta dell'avversario
        dopoPrimaVisione: null,
        ref(p) {
            return {
                async once() { return { val: () => leggi(p) }; },
                async set(v) { db.scritture.push(['set', p]); scrivi(p, v); },
                async transaction(fn) {
                    let copia = null;                                     // la prima chiamata arriva con la copia locale vuota
                    for (let giro = 0; giro < 6; giro++) {
                        const proposta = fn(clona(copia));
                        if (giro === 0 && db.dopoPrimaVisione) { const f = db.dopoPrimaVisione; db.dopoPrimaVisione = null; f(); }
                        if (proposta === undefined) return { committed: false, snapshot: { val: () => leggi(p) } };
                        const vero = leggi(p);
                        if (JSON.stringify(vero) !== JSON.stringify(copia)) { copia = vero; continue; }   // il server ha altro: si riprova
                        db.scritture.push(['transazione', p]);
                        scrivi(p, proposta);
                        return { committed: true, snapshot: { val: () => leggi(p) } };
                    }
                    throw new Error('transazione senza fine');
                }
            };
        }
    };
    return db;
}

const ID = 's1__sd1__m1';
const scelta = (passo, testo = 'cifrata') => ({ passo, scelta: testo, n: 1 });
const prepara = ({ p1, p2, ha = {} }) => creaDbFinto({
    partiteServer: { [ID]: { inAttesa: { ...(p1 ? { p1 } : {}), ...(p2 ? { p2 } : {}) } } },
    partite: { [ID]: { haScelto: ha } }
});

test('ritiraScelta: l\'avversario non ha ancora scelto → la scelta sparisce e lui torna a vedere "sta scegliendo"', async () => {
    const db = prepara({ p1: scelta('1:4'), ha: { p1: '1:4' } });
    assert.equal(await ritiraScelta(db, ID, 'p1', '1:4'), 'ok');
    assert.equal(db.radice.partiteServer[ID].inAttesa, undefined, 'nessuna scelta in attesa');
    assert.equal(db.radice.partite[ID].haScelto.p1, undefined, 'il segno "ha scelto" è tolto');
});

test('ritiraScelta: vale per tutti e due i lati, e lascia stare la scelta di chi non ritira', async () => {
    const db = prepara({ p2: scelta('1:4', 'di-p2'), ha: { p2: '1:4' } });
    assert.equal(await ritiraScelta(db, ID, 'p2', '1:4'), 'ok');
    assert.equal(db.radice.partiteServer[ID].inAttesa, undefined);
    // se in attesa c'è solo la scelta dell'altro (un passo diverso), per chi ritira non c'è nulla
    const db2 = prepara({ p1: scelta('1:5') });
    assert.equal(await ritiraScelta(db2, ID, 'p2', '1:5'), 'nessuna');
    assert.deepEqual(db2.radice.partiteServer[ID].inAttesa.p1, scelta('1:5'));
});

test('ritiraScelta: se l\'avversario ha già scelto è troppo tardi, e non si tocca niente (il turno si gioca)', async () => {
    const db = prepara({ p1: scelta('1:4', 'mia'), p2: scelta('1:4', 'sua'), ha: { p1: '1:4', p2: '1:4' } });
    assert.equal(await ritiraScelta(db, ID, 'p1', '1:4'), 'tardi');
    assert.deepEqual(Object.keys(db.radice.partiteServer[ID].inAttesa).sort(), ['p1', 'p2']);
    assert.equal(db.radice.partite[ID].haScelto.p1, '1:4');
    assert.equal(db.scritture.length, 0, 'nessuna scrittura');
});

test('ritiraScelta: niente da ritirare (non ho scelto, o la mia scelta è di un passo vecchio)', async () => {
    const vuoto = creaDbFinto({ partiteServer: { [ID]: {} }, partite: { [ID]: {} } });
    assert.equal(await ritiraScelta(vuoto, ID, 'p1', '1:4'), 'nessuna');
    const vecchia = prepara({ p1: scelta('1:3') });
    assert.equal(await ritiraScelta(vecchia, ID, 'p1', '1:4'), 'nessuna');
    assert.deepEqual(vecchia.radice.partiteServer[ID].inAttesa.p1, scelta('1:3'), 'la scelta di un altro passo non si tocca');
});

test('ritiraScelta: l\'avversario sceglie nello stesso istante → vince chi arriva prima, mai uno stato a metà', async () => {
    // la scelta dell'avversario si salva dopo che il ritiro ha guardato ma prima che salvi: la transazione si ripete e vede tutte e due
    const db = prepara({ p1: scelta('1:4', 'mia'), ha: { p1: '1:4' } });
    db.dopoPrimaVisione = () => { db.radice.partiteServer[ID].inAttesa.p2 = scelta('1:4', 'sua'); };
    assert.equal(await ritiraScelta(db, ID, 'p1', '1:4'), 'tardi');
    assert.deepEqual(Object.keys(db.radice.partiteServer[ID].inAttesa).sort(), ['p1', 'p2'], 'tutte e due le scelte restano: il turno si gioca');
});

test('ritiraScelta: dopo il ritiro si può scegliere di nuovo (e ritirare ancora)', async () => {
    const db = prepara({ p1: scelta('1:4', 'prima'), ha: { p1: '1:4' } });
    assert.equal(await ritiraScelta(db, ID, 'p1', '1:4'), 'ok');
    // nuova scelta, come fa inviaScelta
    await db.ref(`partiteServer/${ID}/inAttesa/p1`).set(scelta('1:4', 'seconda'));
    await db.ref(`partite/${ID}/haScelto/p1`).set('1:4');
    assert.equal(await ritiraScelta(db, ID, 'p1', '1:4'), 'ok');
    assert.equal(db.radice.partiteServer[ID].inAttesa, undefined);
});

test('functions: annullaScelta è un servizio del server e una funzione richiamabile, con i controlli di inviaScelta', () => {
    const partita = fs.readFileSync(path.join(__dirname, '..', 'functions', 'partita.js'), 'utf8');
    assert.match(partita, /const \{ ritiraScelta \} = require\('\.\/ritira-scelta'\);/);
    const f = /async function annullaScelta\(uid, \{ id, passo \}\) \{([\s\S]*?)\n    \}\n/.exec(partita);
    assert.ok(f, 'funzione non trovata');
    assert.match(f[1], /if \(!lato\) throw new ErroreUtente\('Non sei uno dei due giocatori/, 'solo i due giocatori');
    assert.match(f[1], /if \(chiavePasso\(stato\) !== passo\) throw new ErroreUtente\('Questa richiesta è scaduta/, 'solo per il passo in corso');
    assert.match(f[1], /ritiraScelta\(db, id, lato, passo\)/);
    assert.match(f[1], /esito === 'tardi'\) throw new ErroreUtente\("Troppo tardi/);
    assert.match(partita, /return \{ apriPartita, pronto, inviaScelta, annullaScelta, salvaPartita \};/);
    const indice = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    assert.match(indice, /exports\.annullaScelta = richiamabile\('annullaScelta'\);/);
});
