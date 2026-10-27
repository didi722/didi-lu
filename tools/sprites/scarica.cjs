'use strict';
// Mette nel sito le immagini dei Pokémon della lega (docs/sprites/ani/<id>.gif, docs/sprites/dex/<id>.png) e ne scrive l'elenco (docs/sprites/indice.js).
// Perché: le GIF arrivavano da play.pokemonshowdown.com, un altro server, a ogni apertura e a volte non arrivavano; dal sito stesso (GitHub Pages, stesso indirizzo
// della pagina) sono molto più veloci e il service worker le tiene per sempre. Le specie che non ci sono si chiedono ancora a Showdown (docs/sprite-pkm.js).
// Quali: quelle che l'app mostra (app-precarica.js, specieDa): compagni di tutti gli allenatori, Pokémon dei team iscritti alle stagioni, dei Box.
// Lo lancia il workflow "Sprites" (ogni giorno e a mano: i Pokémon nuovi arrivano da soli) con le credenziali di Firebase. Non tocca quelle già scaricate.
//   FIREBASE_SERVICE_ACCOUNT=... node tools/sprites/scarica.cjs
const fs = require('node:fs');
const path = require('node:path');
const Sprite = require('../../docs/sprite-pkm.js');
const Precarica = require('../../docs/app-precarica.js');

const DOCS = path.join(__dirname, '..', '..', 'docs');
const CARTELLA = path.join(DOCS, 'sprites');
const SD = Sprite.SD;
const DATABASE_URL = 'https://pokemonsuite-didi-lu-default-rtdb.europe-west1.firebasedatabase.app';

/** Tutte le specie dei dati: i compagni e i team iscritti (come l'app) e i Pokémon dei Box di tutti, senza doppioni (due nomi con lo stesso file contano uno) */
function elencoSpecie(players, stagioni) {
    const nomi = new Map();
    const dai = lista => { for (const n of lista) nomi.set(Sprite.id(n), nomi.get(Sprite.id(n)) || n); };
    dai(Precarica.specieDa({ players, stagioni }));
    for (const g of Object.keys(players || {})) dai(Precarica.specieDa({ players: { [g]: players[g] }, stagioni: {}, giocatore: g }));
    return [...nomi.entries()].map(([id, nome]) => ({ id, nome }));
}

/** Da dove scaricare una specie, in ordine, e dove metterla: la GIF animata, la GIF Gen 5 (salvata come animata), il PNG del Pokédex */
function fontiDi({ id, nome }) {
    const { completo, base } = Sprite.idSprite(nome);
    const ids = [completo].concat(base && base !== completo ? [base] : []);
    const fonti = [];
    for (const i of ids) fonti.push({ url: `${SD}/ani/${i}.gif`, tipo: 'ani' });
    fonti.push({ url: `${SD}/gen5ani/${completo}.gif`, tipo: 'ani' });
    for (const i of ids) fonti.push({ url: `${SD}/dex/${i}.png`, tipo: 'dex' });
    return fonti.map(f => ({ ...f, file: path.join(CARTELLA, f.tipo, `${id}.${f.tipo === 'ani' ? 'gif' : 'png'}`) }));
}

/** Vero se i byte sono una GIF o un PNG (Showdown, per i file che non ha, può rispondere con una pagina) */
function eImmagine(byte, tipo) {
    if (!byte || byte.length < 64) return false;
    const testa = Buffer.from(byte.subarray(0, 8));
    return tipo === 'ani' ? testa.subarray(0, 4).toString('latin1') === 'GIF8' : testa.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

/** Il contenuto di sprites/indice.js dai file che ci sono */
function indiceDa({ ani, dex, back = [] }) {
    const lista = l => JSON.stringify([...l].sort());
    return `// Elenco delle immagini dei Pokémon che stanno nel sito (sprites/ani, sprites/dex e, di schiena, sprites/ani-back): lo riscrive il workflow "Sprites" (tools/sprites/scarica.cjs). Non si modifica a mano.\nwindow.SpriteLocali = { ani: ${lista(ani)}, dex: ${lista(dex)}, back: ${lista(back)} };\n`;
}

const idsIn = (cartella, estensione) => (fs.existsSync(cartella) ? fs.readdirSync(cartella).filter(f => f.endsWith(estensione)).map(f => f.slice(0, -estensione.length)) : []);

async function scarica(url, tipo, fetchFn, tentativi = 3) {
    for (let t = 0; t < tentativi; t++) {
        try {
            const r = await fetchFn(url);
            if (r.status === 404) return null;
            if (r.ok) { const b = Buffer.from(await r.arrayBuffer()); return eImmagine(b, tipo) ? b : null; }
        } catch (e) { /* si riprova */ }
        await new Promise(r => setTimeout(r, 400 * (t + 1)));
    }
    return null;
}

async function principale(specie, { fetchFn = fetch, concorrenza = 6, log = console.log } = {}) {
    for (const t of ['ani', 'dex']) fs.mkdirSync(path.join(CARTELLA, t), { recursive: true });
    let nuove = 0, senza = [];
    let prossimo = 0;
    const lavoratore = async () => {
        while (prossimo < specie.length) {
            const s = specie[prossimo++];
            const fonti = fontiDi(s);
            if (fonti.some(f => fs.existsSync(f.file))) continue;                        // già nel sito
            let fatto = false;
            for (const f of fonti) {
                const b = await scarica(f.url, f.tipo, fetchFn);
                if (b) { fs.writeFileSync(f.file, b); nuove++; fatto = true; break; }
            }
            if (!fatto) senza.push(s.nome);
        }
    };
    await Promise.all(Array.from({ length: concorrenza }, lavoratore));
    // le GIF "di schiena" (i tuoi Pokémon nel simulatore): il service worker le serve dal sito al posto di Showdown. Chi non ce l'ha si ricorda in assenti.json
    fs.mkdirSync(path.join(CARTELLA, 'ani-back'), { recursive: true });
    const fileAssenti = path.join(CARTELLA, 'ani-back', 'assenti.json');
    const assenti = new Set(fs.existsSync(fileAssenti) ? JSON.parse(fs.readFileSync(fileAssenti, 'utf8')) : []);
    const conGif = idsIn(path.join(CARTELLA, 'ani'), '.gif').filter(i => !fs.existsSync(path.join(CARTELLA, 'ani-back', i + '.gif')) && !assenti.has(i));
    let prossimoRetro = 0, retroNuove = 0;
    await Promise.all(Array.from({ length: concorrenza }, async () => {
        while (prossimoRetro < conGif.length) {
            const i = conGif[prossimoRetro++];
            const b = await scarica(`${SD}/ani-back/${i}.gif`, 'ani', fetchFn);
            if (b) { fs.writeFileSync(path.join(CARTELLA, 'ani-back', i + '.gif'), b); retroNuove++; } else assenti.add(i);
        }
    }));
    fs.writeFileSync(fileAssenti, JSON.stringify([...assenti].sort()));
    log(`di schiena: nuove ${retroNuove}`);
    fs.writeFileSync(path.join(CARTELLA, 'indice.js'), indiceDa({ ani: idsIn(path.join(CARTELLA, 'ani'), '.gif'), dex: idsIn(path.join(CARTELLA, 'dex'), '.png'), back: idsIn(path.join(CARTELLA, 'ani-back'), '.gif') }));
    log(`specie: ${specie.length}, nuove: ${nuove}, senza immagine: ${senza.length}${senza.length ? ' (' + senza.join(', ') + ')' : ''}`);
    return { nuove, senza };
}

async function leggiDati() {
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getDatabase } = require('firebase-admin/database');
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), databaseURL: DATABASE_URL });
    const db = getDatabase();
    const val = async p => (await db.ref(p).once('value')).val();
    const players = (await val('players')) || {};
    const stagioni = {};
    const ids = ['sbeta'];
    for (let i = 0; i < 200; i++) ids.push('s' + i);
    for (let da = 0; da < ids.length; da += 10) {
        const blocco = await Promise.all(ids.slice(da, da + 10).map(async id => [id, await val(`seasons/${id}/info`)]));
        for (const [id, info] of blocco) if (info && String(info.tipo || '').toLowerCase().trim() !== 'cup') stagioni[id] = (await val(`seasons/${id}/teams_iscritti`)) || {};
        if (da > 0 && blocco.every(([, info]) => !info)) break;
    }
    return { players, stagioni };
}

if (require.main === module) {
    leggiDati().then(({ players, stagioni }) => principale(elencoSpecie(players, stagioni))).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { elencoSpecie, fontiDi, eImmagine, indiceDa, scarica, principale, CARTELLA };
