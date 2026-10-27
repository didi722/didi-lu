'use strict';
// Mette nel sito il motore grafico dei replay (docs/motore-replay/): gli script e i fogli di stile che il replay carica da play.pokemonshowdown.com.
// Perché: Showdown non manda il CORS, quindi il browser non può scaricarli per tenerli in cache; così ogni replay li chiedeva di nuovo (qualche MB) e partiva piano.
// Dal sito stesso (stesso indirizzo della pagina) si scaricano e si tengono senza problemi (docs/replay-carica.js).
// Lo lancia il workflow "Sprites" (ogni giorno e a mano). Tutto o niente: se un file non arriva, quelli che ci sono restano com'erano (versioni di file diverse
// fra loro fanno più danni di una vecchia).
//   node tools/sprites/motore.cjs
const fs = require('node:fs');
const path = require('node:path');
const Replay = require('../../docs/replay-sito.js');

const CARTELLA = path.join(__dirname, '..', '..', 'docs', 'motore-replay');

/** Dove sta nel sito un file del motore: la cartella e il percorso che aveva su Showdown (/js/battle.js -> motore-replay/js/battle.js) */
function fileDi(indirizzo) {
    return path.join(CARTELLA, ...new URL(indirizzo).pathname.split('/').filter(Boolean));
}

/** Vero se il testo è un file del motore e non una pagina d'errore travestita */
function eFileDelMotore(testo) {
    return typeof testo === 'string' && testo.length > 200 && !/^\s*<(!doctype|html)/i.test(testo);
}

async function scaricaTutto(indirizzi, fetchFn = fetch) {
    const testi = await Promise.all(indirizzi.map(async u => {
        const r = await fetchFn(u);
        if (!r.ok) throw new Error(`${u}: ${r.status}`);
        const t = await r.text();
        if (!eFileDelMotore(t)) throw new Error(`${u}: non è un file del motore`);
        return t;
    }));
    return new Map(indirizzi.map((u, i) => [u, testi[i]]));
}

/** Scrive i file che sono cambiati; ritorna quali */
function salva(testi) {
    const cambiati = [];
    for (const [u, t] of testi) {
        const file = fileDi(u);
        if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === t) continue;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, t);
        cambiati.push(path.relative(CARTELLA, file));
    }
    return cambiati;
}

async function principale({ fetchFn = fetch, log = console.log } = {}) {
    const indirizzi = Replay.MOTORE.stili.concat(Replay.MOTORE.script);
    const cambiati = salva(await scaricaTutto(indirizzi, fetchFn));
    log(cambiati.length ? `Motore del replay: aggiornati ${cambiati.join(', ')}` : 'Motore del replay: già aggiornato');
    return cambiati;
}

if (require.main === module) {
    principale().catch(e => { console.error('Motore del replay non scaricato:', e.message); process.exit(1); });
}

module.exports = { fileDi, eFileDelMotore, scaricaTutto, salva, principale, CARTELLA };
