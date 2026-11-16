// Sposta le statistiche dei set (setStats) fuori da seasons: da seasons/{stagione}/showdowns/{sd}/matches/{match}/setStats a setStats/{stagione}/{sd}/{match}.
// Dentro ai match pesavano l'84% di una stagione (529 KB su 680) e ogni pagina che leggeva una stagione le scaricava.
//
// Tre fasi, da fare in ordine (e si possono ripetere: non rompono niente):
//   node .github/workflows/migra-setstats.js              PROVA (predefinita): dice cosa farebbe e non scrive niente
//   node .github/workflows/migra-setstats.js --copia      scrive setStats/… per ogni match che ha le statistiche dentro (le copie uguali si saltano); NON toglie niente da seasons
//   node .github/workflows/migra-setstats.js --pulisci    toglie le statistiche da dentro ai match, ma solo dove il nodo nuovo ha esattamente le stesse (altrimenti le lascia e lo dice)
//
// Prima della fase --copia le regole del database devono avere setStats (REGOLE-DATABASE.md). Il sito, dopo questa modifica, legge da tutti e due i posti: prima della
// migrazione tutto funziona come prima, dopo --copia funziona uguale, dopo --pulisci le pagine che non servono le statistiche scaricano un quinto.
const path = require('path');

/** Cosa fare: { copia: { 'stagione/sd/match': stats }, giaCopiate, pulisci: ['stagione/sd/match'], conflitti: ['stagione/sd/match'], senzaStats } (pura, provata in test/migra-setstats.test.js) */
function piano(stagioni, nodo) {
    const fuori = { copia: {}, giaCopiate: 0, pulisci: [], conflitti: [], senzaStats: 0 };
    const uguali = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    for (const [sid, s] of Object.entries(stagioni || {})) {
        for (const [sd, dati] of Object.entries((s && s.showdowns) || {})) {
            for (const [chiave, m] of Object.entries((dati && dati.matches) || {})) {
                const dentro = m && m.setStats;
                if (!dentro || typeof dentro !== 'object' || !Object.keys(dentro).length) { fuori.senzaStats++; continue; }
                const k = `${sid}/${sd}/${chiave}`;
                const nuovo = (((nodo || {})[sid] || {})[sd] || {})[chiave];
                if (nuovo === undefined) fuori.copia[k] = dentro;
                else if (uguali(nuovo, dentro)) { fuori.giaCopiate++; fuori.pulisci.push(k); }
                else fuori.conflitti.push(k);      // il nodo nuovo ha qualcosa di diverso (un set rigiocato dopo la copia?): non si tocca niente, si guarda a mano
            }
        }
    }
    return fuori;
}

async function main() {
    const copia = process.argv.includes('--copia');
    const pulisci = process.argv.includes('--pulisci');
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getDatabase } = require('firebase-admin/database');
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        databaseURL: 'https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app'
    });
    const db = getDatabase();
    const kb = x => Math.round(JSON.stringify(x).length / 102.4) / 10;

    const [stagioni, nodo] = await Promise.all([db.ref('seasons').once('value').then(s => s.val() || {}), db.ref('setStats').once('value').then(s => s.val() || {})]);
    const p = piano(stagioni, nodo);
    const dacopiare = Object.keys(p.copia).length;
    console.log(`Match con le statistiche dentro: ${dacopiare + p.giaCopiate + p.conflitti.length} (da copiare ${dacopiare} = ${kb(p.copia)} KB; già copiati identici ${p.giaCopiate}; diversi ${p.conflitti.length}); match senza: ${p.senzaStats}.`);
    if (p.conflitti.length) console.log('ATTENZIONE: il nodo nuovo ha statistiche diverse da quelle dentro al match (non si toccano):', p.conflitti.join(', '));

    if (!copia && !pulisci) { console.log('Prova: non scrivo niente. Con --copia si copia, con --pulisci si toglie dai match.'); return; }

    if (copia) {
        for (const [k, stats] of Object.entries(p.copia)) await db.ref(`setStats/${k}`).set(stats);
        console.log(`Copiati ${dacopiare} match in setStats/.`);
    }
    if (pulisci) {
        // si rilegge il nodo nuovo (la copia di prima, se fatta nella stessa esecuzione) e si toglie solo dove è identico
        const nodo2 = (await db.ref('setStats').once('value')).val() || {};
        const p2 = piano(stagioni, nodo2);
        for (const k of p2.pulisci) {
            const [sid, sd, chiave] = k.split('/');
            await db.ref(`seasons/${sid}/showdowns/${sd}/matches/${chiave}/setStats`).remove();
        }
        console.log(`Tolte le statistiche da dentro a ${p2.pulisci.length} match${p2.copia && Object.keys(p2.copia).length ? ` (${Object.keys(p2.copia).length} non ancora copiati: lasciati com'erano)` : ''}.`);
    }
}

module.exports = { piano };
// Chiude esplicitamente: la connessione di firebase-admin terrebbe vivo il processo (e il job di Actions) all'infinito.
if (require.main === module) main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
