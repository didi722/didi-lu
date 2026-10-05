'use strict';
// Le immagini dei badge in docs/immagini/ e i nomi con cui il sito le cerca:
//   - ribbon-<badge>[-livello].png per i Pokémon, badge-team-<badge>[-livello].png per i team, badge-allenatore-<badge>[-livello].png per gli
//     allenatori (anche le serie e il fondatore di titoli.js), con -bronze, -silver o -gold;
//   - nessun file con uno di questi prefissi resta senza un badge che lo usa (un nome sbagliato non passa inosservato);
//   - i vecchi nomi (badge_won_*, champion-*, victory-ribbon.png, team-sd.png, galar-ghost.png...) non si usano più da nessuna parte;
//   - le pagine che costruiscono il nome dell'immagine (profilo, Trainers, pagina pubblica) puntano a file che esistono;
//   - tools/elenco-immagini.cjs elenca solo file che mancano davvero.
// I file che non ci sono ancora NON fanno fallire il test: il sito mostra una medaglia disegnata con il CSS al loro posto.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOCS = path.join(__dirname, '..', 'docs');
const IMMAGINI = path.join(DOCS, 'immagini');
const leggi = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const esiste = n => fs.existsSync(path.join(IMMAGINI, n));

const Fiocchi = require('../docs/fiocchi.js');
const BadgeTeam = require('../docs/badge-team.js');
const BadgeAllenatore = require('../docs/badge-allenatore.js');
const Titoli = require('../docs/titoli.js');
const { controlla } = require('../tools/elenco-immagini.cjs');

const nomi = lista => lista.map(p => p.replace(/^immagini\//, ''));
const GRUPPI = [
    { prefisso: 'ribbon-', file: nomi(Fiocchi.IMMAGINI) },
    { prefisso: 'badge-team-', file: nomi(BadgeTeam.IMMAGINI) },
    { prefisso: 'badge-allenatore-', file: nomi(BadgeAllenatore.IMMAGINI).concat(nomi(Titoli.IMMAGINI)) }
];
const SAGOME = /-ghost\.png$/;      // sagome dello stato "bloccato", ancora non usate

test('ogni PNG con un prefisso dei badge è usata da un badge (e si chiama come il sito la cerca)', () => {
    const presenti = fs.readdirSync(IMMAGINI);
    for (const g of GRUPPI) {
        const usati = new Set(g.file);
        const orfani = presenti.filter(f => f.startsWith(g.prefisso) && !usati.has(f) && !SAGOME.test(f));
        assert.deepEqual(orfani, [], `file ${g.prefisso}* che nessun badge usa: controlla il nome (badge, livello bronze|silver|gold)`);
    }
    // e un file non ha due prefissi: ognuno sta in un solo gruppo
    for (const f of presenti) assert.ok(GRUPPI.filter(g => f.startsWith(g.prefisso)).length <= 1, f);
});

test('i nomi attesi seguono lo schema <prefisso><badge>[-livello].png, e un badge ha un file solo oppure tre', () => {
    for (const g of GRUPPI) {
        for (const f of g.file) assert.match(f, new RegExp(`^${g.prefisso}[a-z]+(-(bronze|silver|gold))?\\.png$`), f);
    }
    for (const catalogo of [Fiocchi.CATALOGO, BadgeTeam.CATALOGO, BadgeAllenatore.CATALOGO]) {
        for (const b of catalogo) assert.ok(b.immagini.length === 1 || b.immagini.length === 3, `${b.id}: ${b.immagini.length} immagini`);
    }
    // i tre livelli di un badge sono sempre le stesse tre parole
    for (const b of BadgeAllenatore.CATALOGO) {
        assert.deepEqual(b.immagini.map(p => /-(bronze|silver|gold)\.png$/.exec(p)[1]), ['bronze', 'silver', 'gold'], b.id);
    }
});

test('i badge già caricati ci sono con il loro nome nuovo (allenatore, team, Pokémon)', () => {
    const previsti = [
        // allenatore: le serie e il campione, ex badge_clean_*, badge_won_*, badge_sd_*, champion-*, badge_founder.png
        ...['cleanstreak', 'winstreak', 'sdstreak', 'champion'].flatMap(b => ['bronze', 'silver', 'gold'].map(l => `badge-allenatore-${b}-${l}.png`)),
        'badge-allenatore-founder.png',
        // team: il campione e le tre serie (un file solo, ex team-sd.png, team-wins.png, team-clean.png)
        ...['bronze', 'silver', 'gold'].map(l => `badge-team-champion-${l}.png`),
        'badge-team-sdstreak.png', 'badge-team-winstreak.png', 'badge-team-cleanstreak.png',
        // Pokémon: Winner, Survivor e Champion (tre livelli) e i tre fiocchi con un file solo (ex victory-ribbon.png, strike-ribbon.png, friend-ribbon.png)
        ...['winner', 'survivor', 'champion'].flatMap(b => ['bronze', 'silver', 'gold'].map(l => `ribbon-${b}-${l}.png`)),
        'ribbon-winstreak.png', 'ribbon-cleanstreak.png', 'ribbon-friendship.png'
    ];
    for (const f of previsti) assert.ok(esiste(f), f);
    // ...e i vecchi nomi non ci sono più
    const vecchi = fs.readdirSync(IMMAGINI).filter(f => /^(badge_(clean|won|sd|founder)|champion-|victory-ribbon|strike-ribbon|friend-ribbon|team-(sd|wins|clean)|(galar|hoenn|sinnoh)-)/.test(f));
    assert.deepEqual(vecchi, [], 'vecchi nomi ancora in docs/immagini/');
});

test('nessuna pagina o script cerca più i vecchi nomi delle immagini', () => {
    // (il vecchio nome è quello intero: "badge-allenatore-champion-{l}.png" è il nuovo, non va segnalato)
    const vecchio = /badge_(clean|won|sd|founder|\$\{)|(?<![\w-])champion-(bronze|silver|gold|ghost|\{l\})|victory-ribbon|strike-ribbon|friend-ribbon|(?<![\w-])team-(sd|wins|clean)\.png|(galar|hoenn|sinnoh)-ghost/;
    const file = fs.readdirSync(DOCS).filter(f => /\.(js|html|css)$/.test(f) && f !== 'pkmn-sim.js');
    for (const f of file) assert.doesNotMatch(leggi(f), vecchio, `${f} cita ancora un vecchio nome di immagine`);
});

test('titoli.js: le serie e il fondatore usano badge-allenatore-<serie>-<livello>.png, e i file ci sono', () => {
    assert.deepEqual(Titoli.BADGE.map(b => b.file), ['cleanstreak', 'winstreak', 'sdstreak']);
    assert.equal(Titoli.IMMAGINE_FONDATORE, 'immagini/badge-allenatore-founder.png');
    assert.equal(Titoli.IMMAGINI.length, 10);
    for (const p of Titoli.IMMAGINI) assert.ok(esiste(p.replace(/^immagini\//, '')), p);
    // gli stessi file che compaiono nei dati di badgeSbloccati
    const b = Titoli.badgeSbloccati({ maxcleanstrike: 7, maxwonstrike: 5, maxsdstrike: 3 }, 'didi');
    assert.deepEqual(b.map(x => x.img), [
        'immagini/badge-allenatore-founder.png', 'immagini/badge-allenatore-cleanstreak-gold.png',
        'immagini/badge-allenatore-winstreak-bronze.png', 'immagini/badge-allenatore-sdstreak-bronze.png'
    ]);
});

test('profilo, pagina Trainers e pagina pubblica costruiscono lo stesso nome (badge-allenatore-<file>-<livello>.png)', () => {
    const serie = ['cleanstreak', 'winstreak', 'sdstreak'];
    const profilo = leggi('profile.html'), trainers = leggi('players.html'), carta = leggi('public-card.js');
    // nelle tre pagine ogni serie dichiara il suo `file`, ed è quello di titoli.js
    for (const [nome, testo] of [['profile.html', profilo], ['players.html', trainers], ['public-card.js', carta]]) {
        const dichiarati = [...testo.matchAll(/\bfile:\s*'([a-z]+)'/g)].map(m => m[1]);
        assert.deepEqual(dichiarati, serie, `${nome}: serie e file`);
        assert.match(testo, /immagini\/badge-allenatore-\$\{b\.file\}-\$\{/, `${nome}: il nome si costruisce da b.file e dal livello`);
    }
    assert.match(profilo, /\$\{Titoli\.IMMAGINE_FONDATORE\}/);
    assert.match(trainers, /immagini\/badge-allenatore-founder\.png/);
    assert.match(carta, /immagini\/badge-allenatore-founder\.png/);
});

test('tools/elenco-immagini.cjs: elenca solo file che mancano davvero, e dice quali badge hanno un file solo', () => {
    const r = controlla();
    assert.equal(r.gruppi.length, 3);
    let totale = 0;
    for (const g of r.gruppi) {
        for (const f of g.mancanti) assert.ok(!esiste(f), `${f} è elencato come mancante ma c'è`);
        for (const f of g.attesi.filter(f => !g.mancanti.includes(f))) assert.ok(esiste(f), f);
        assert.deepEqual(g.orfani, [], `${g.g.prefisso}: file senza badge`);
        totale += g.mancanti.length;
    }
    assert.equal(r.mancanti, totale);
    const unFile = r.gruppi.map(g => g.unFile.map(b => b.id));
    assert.deepEqual(unFile[0], ['winstreak', 'cleanstreak', 'friendship']);        // fiocchi dei Pokémon
    assert.deepEqual(unFile[1], ['sdstreak', 'winstreak', 'cleanstreak']);           // badge dei team
    assert.deepEqual(unFile[2], []);                                                  // allenatori: tre livelli per tutti (il fondatore è speciale)
    assert.match(r.testo, /# Immagini dei badge/);
    assert.match(r.testo, /ribbon-winstreak-bronze\.png/);
});
