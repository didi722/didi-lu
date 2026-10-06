#!/usr/bin/env node
'use strict';
// Genera docs/pkm-gens/delta-gen1.json ... delta-gen8.json: cosa cambia in ogni generazione rispetto ai dati di oggi (Gen 9).
// I dati che il sito legge (Pokédex e mosse di Showdown, PokeAPI, pokedex_base.json) sono quelli di oggi: in un formato "Gen 4" Mawile
// comparirebbe Acciaio/Folletto (il tipo Folletto è arrivato in Gen 6), Bite sarebbe una mossa Buio fisica, e così via.
// Qui si confronta il simulatore (docs/pkmn-sim.js, che conosce tutte le generazioni) con la Gen 9 e si salva solo la differenza:
//   specie: { id: { t: [tipi], s: [hp, atk, def, spa, spd, spe], a: { 0, 1, H, S } } }   (solo i campi che cambiano)
//   mosse:  { id: { t: tipo, c: categoria, p: potenza, a: precisione, pp, pr: priorità } }   (idem)
//   tipi:   { Difensore: { Attaccante: moltiplicatore } }  solo dove la tabella dei tipi cambia (Gen 1-5)
//   esistenti: i tipi che esistono in quella generazione
// docs/dati-gen.js li applica ai dati di oggi. Le stesse copie vanno in functions/pkm-gens/ (le Cloud Functions non vedono docs/).
//
//   node tools/genera-dati-gen.cjs      (dalla cartella principale; rifarlo quando si aggiorna docs/pkmn-sim.js)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const QUI = path.join(__dirname, '..');
const CARTELLA = path.join(QUI, 'docs', 'pkm-gens');
const CARTELLA_SERVER = path.join(QUI, 'functions', 'pkm-gens');     // il server (Cloud Functions) controlla i team con gli stessi dati
const GEN_ATTUALE = 9;
const STAT = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const MOLTIPLICATORE = [1, 2, 0.5, 0];          // codici di damageTaken: normale, debole, resiste, immune
// I tipi arrivati dopo: Buio e Acciaio in Gen 2, Folletto in Gen 6 (Stellar è solo di Gen 9, e solo in battaglia)
const TIPI_ARRIVATI = { Dark: 2, Steel: 2, Fairy: 6 };
const tipiDellaGenerazione = (dex, gen) => dex.types.all().map(t => t.name).filter(n => n !== 'Stellar' && n !== '???' && (TIPI_ARRIVATI[n] || 1) <= gen);

async function caricaDex() {
    const copia = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dati-gen-')), 'pkmn-sim.mjs');
    fs.copyFileSync(path.join(QUI, 'docs', 'pkmn-sim.js'), copia);
    return (await import(pathToFileURL(copia).href)).Dex;
}

// L'abilità nascosta c'è solo dalla Gen 5: prima non conta, quindi non è una differenza
const abilitaDi = (specie, gen) => {
    const o = {};
    for (const [k, v] of Object.entries(specie.abilities || {})) if (v && !(k === 'H' && gen < 5)) o[k] = v;
    return o;
};
const uguali = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function deltaDiGenerazione(Dex, gen) {
    const dex = Dex.forGen(gen), oggi = Dex.forGen(GEN_ATTUALE);
    const specie = {}, mosse = {}, tipi = {};

    for (const s of dex.species.all()) {
        if (!s.exists || s.num <= 0 || s.gen > gen) continue;     // le specie arrivate dopo non esistono in questa generazione
        // Le specie di Leggende Arceus (forme di Hisui, Wyrdeer, Kleavor...) sono Gen 8 per il sito, ma nella Gen 8 del simulatore (Spada e
        // Scudo) sono "Future" e portano dati provvisori e superati (Samurott di Hisui senza Sharpness...): valgono quelli di oggi.
        if (s.isNonstandard === 'Future') continue;
        const b = oggi.species.get(s.id);
        if (!b.exists) continue;
        const d = {};
        if (!uguali(s.types, b.types)) d.t = s.types;
        if (!uguali(STAT.map(k => s.baseStats[k]), STAT.map(k => b.baseStats[k]))) d.s = STAT.map(k => s.baseStats[k]);
        if (gen >= 3 && !uguali(abilitaDi(s, gen), abilitaDi(b, gen))) d.a = abilitaDi(s, gen);   // prima della Gen 3 non ci sono abilità
        if (Object.keys(d).length) specie[s.id] = d;
    }

    for (const m of dex.moves.all()) {
        if (!m.exists || m.id.startsWith('hiddenpower')) continue;   // Introiettabile: ogni tipo è una voce a parte, con lo stesso id
        const b = oggi.moves.get(m.id);
        if (!b.exists) continue;
        const d = {};
        if (m.type !== b.type) d.t = m.type;
        if (m.category !== b.category) d.c = m.category;
        if (m.basePower !== b.basePower) d.p = m.basePower;
        if (m.accuracy !== b.accuracy) d.a = m.accuracy;
        if (m.pp !== b.pp) d.pp = m.pp;
        if (m.priority !== b.priority) d.pr = m.priority;
        if (Object.keys(d).length) mosse[m.id] = d;
    }

    const esistenti = tipiDellaGenerazione(dex, gen);
    for (const dif of esistenti) {
        const oggiDif = oggi.types.get(dif), difGen = dex.types.get(dif);
        for (const att of esistenti) {
            const m = MOLTIPLICATORE[difGen.damageTaken[att]], mOggi = MOLTIPLICATORE[oggiDif.damageTaken[att]];
            if (m !== mOggi) (tipi[dif] ||= {})[att] = m;
        }
    }
    return { gen, esistenti, specie, mosse, tipi };
}

(async () => {
    const Dex = await caricaDex();
    for (let gen = 1; gen < GEN_ATTUALE; gen++) {
        const d = deltaDiGenerazione(Dex, gen);
        // una specie e una mossa per riga: le differenze fra una versione e l'altra si leggono
        const righe = obj => '{\n' + Object.entries(obj).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n  }';
        const testo = `{\n  "gen": ${gen},\n  "esistenti": ${JSON.stringify(d.esistenti)},\n  "tipi": ${JSON.stringify(d.tipi)},\n` +
            `  "specie": ${righe(d.specie)},\n  "mosse": ${righe(d.mosse)}\n}\n`;
        fs.writeFileSync(path.join(CARTELLA, `delta-gen${gen}.json`), testo);
        fs.mkdirSync(CARTELLA_SERVER, { recursive: true });
        fs.writeFileSync(path.join(CARTELLA_SERVER, `delta-gen${gen}.json`), testo);
        console.log(`gen${gen}: ${Object.keys(d.specie).length} specie, ${Object.keys(d.mosse).length} mosse, ${Object.keys(d.tipi).length} tipi con tabella diversa (${(testo.length / 1024).toFixed(1)} KB)`);
    }
})();
