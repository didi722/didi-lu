// Il riassunto del Match of the week per la home: per ogni settimana il set più bello e i badge dei due team e del Pokémon protagonista, già calcolati.
// Lo salva in matchSettimana (lo legge la home al posto delle statistiche di tutto il sito: ~700 KB di setStats + 210 KB di players a ogni visita, contro pochi KB).
// Se il riassunto manca o ha più di 12 ore la home si calcola il banner da sé (come prima): se questo workflow smette di funzionare il sito non si rompe, costa solo di più.
// La logica è in docs/match-settimana.js (riassunto, provata in test/match-settimana.test.js); qui si legge, si calcola e si scrive.
//
//   node .github/workflows/riassunto-home.js            scrive il riassunto
//   node .github/workflows/riassunto-home.js --prova    non scrive niente: dice cosa scriverebbe
const path = require('path');
const docs = nome => require(path.join(__dirname, '..', '..', 'docs', nome));

/** Il riassunto da scrivere dato quello che c'è nel database (puro: lo prova test/riassunto-home.test.js) */
function calcola({ seasons, setStats, players, adesso = Date.now() }) {
    const DbLeggero = docs('db-leggero.js');
    const unite = DbLeggero.unisciSetStats(seasons || {}, setStats || {});
    return docs('match-settimana.js').riassunto({ seasons: unite, players: players || {}, adesso },
        { Statistiche: docs('statistiche.js'), Fiocchi: docs('fiocchi.js'), BadgeTeam: docs('badge-team.js') });
}

async function main() {
    const prova = process.argv.includes('--prova');
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getDatabase } = require('firebase-admin/database');
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
        databaseURL: 'https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app'
    });
    const db = getDatabase();
    const leggi = async p => (await db.ref(p).once('value')).val();
    const [seasons, setStats, players] = await Promise.all([leggi('seasons'), leggi('setStats'), leggi('players')]);
    const r = calcola({ seasons, setStats, players });
    const dim = JSON.stringify(r).length;
    console.log(`Settimane: ${r.settimane.length}; riassunto di ${(dim / 1024).toFixed(1)} KB (le statistiche che la home non scarica più: ~${(JSON.stringify(setStats || {}).length / 1024).toFixed(0)} KB).`);
    for (const w of r.settimane.slice(-3)) {
        const g = w.scelto.giocatori;
        console.log(`  ${new Date(w.inizio).toISOString().slice(0, 10)}: ${g.p1.nome} (${g.p1.team || '—'}) – ${g.p2.nome} (${g.p2.team || '—'}), vince ${w.scelto.vincitore}; MVP ${w.scelto.protagonista ? w.scelto.protagonista.specie : '—'}; badge ${w.badge.p1.length}/${w.badge.p2.length}/${w.badge.prot.length}`);
    }
    if (prova) { console.log('Prova: non scrivo niente.'); return; }
    await db.ref('matchSettimana').set(r);
    console.log('Riassunto scritto in matchSettimana.');
}

module.exports = { calcola };
if (require.main === module) main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
