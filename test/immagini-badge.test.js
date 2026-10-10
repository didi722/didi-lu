'use strict';
// Le immagini dei badge in docs/immagini/ e i nomi con cui il sito le cerca:
//   - ribbon-<badge>-<livello>.png per i Pokémon, badge-team-<badge>-<livello>.png per i team, badge-allenatore-<badge>-<livello>.png per gli
//     allenatori (anche le serie di titoli.js), con -bronze, -silver o -gold: ogni badge ha i tre livelli (solo il fondatore ha un file solo);
//   - nessun file con uno di questi prefissi resta senza un badge che lo usa (un nome sbagliato, o un file inutile, non passa inosservato);
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
test('ogni PNG con un prefisso dei badge è usata da un badge (e si chiama come il sito la cerca)', () => {
    const presenti = fs.readdirSync(IMMAGINI);
    for (const g of GRUPPI) {
        const usati = new Set(g.file);
        const orfani = presenti.filter(f => f.startsWith(g.prefisso) && !usati.has(f));
        assert.deepEqual(orfani, [], `file ${g.prefisso}* che nessun badge usa: controlla il nome (badge, livello bronze|silver|gold) o cancellalo`);
    }
    // e un file non ha due prefissi: ognuno sta in un solo gruppo
    for (const f of presenti) assert.ok(GRUPPI.filter(g => f.startsWith(g.prefisso)).length <= 1, f);
});

test('i nomi attesi seguono lo schema <prefisso><badge>-<livello>.png (solo il fondatore ha un file solo) e ogni badge ha i tre livelli', () => {
    for (const g of GRUPPI) {
        for (const f of g.file) assert.match(f, new RegExp(`^${g.prefisso}[a-z]+(-(bronze|silver|gold))?\\.png$`), f);
        for (const f of g.file.filter(f => f !== 'badge-allenatore-founder.png')) assert.match(f, /-(bronze|silver|gold)\.png$/, `${f}: manca il livello`);
    }
    // i tre livelli di un badge sono sempre le stesse tre parole, in questo ordine
    for (const [nome, catalogo] of [['fiocchi', Fiocchi.CATALOGO], ['team', BadgeTeam.CATALOGO], ['allenatore', BadgeAllenatore.CATALOGO]]) {
        for (const b of catalogo) {
            assert.deepEqual(b.immagini.map(p => /-(bronze|silver|gold)\.png$/.exec(p)[1]), ['bronze', 'silver', 'gold'], `${nome}/${b.id}`);
        }
    }
    // e ogni badge è un achievement vero: ha soglie crescenti e un valore che si legge dai numeri del Pokémon, del team o dell'allenatore
    for (const catalogo of [Fiocchi.CATALOGO, BadgeTeam.CATALOGO, BadgeAllenatore.CATALOGO]) {
        for (const b of catalogo) {
            assert.equal(b.soglie.length, 3, b.id);
            assert.ok(b.soglie[0] < b.soglie[1] && b.soglie[1] < b.soglie[2], `${b.id}: soglie crescenti`);
            assert.equal(typeof b.valore, 'function', b.id);
        }
    }
});

test('i badge già caricati ci sono con il loro nome (allenatore, team, Pokémon)', () => {
    const previsti = [
        // allenatore: le serie e il campione, ex badge_clean_*, badge_won_*, badge_sd_*, champion-*, badge_founder.png
        ...['cleanstreak', 'winstreak', 'sdstreak', 'champion'].flatMap(b => ['bronze', 'silver', 'gold'].map(l => `badge-allenatore-${b}-${l}.png`)),
        'badge-allenatore-founder.png',
        // team: il campione, e le tre serie che avevano un file solo (ex team-sd.png, team-wins.png, team-clean.png): i disegni gialli sono l'oro
        ...['bronze', 'silver', 'gold'].map(l => `badge-team-champion-${l}.png`),
        'badge-team-sdstreak-gold.png', 'badge-team-winstreak-gold.png', 'badge-team-cleanstreak-gold.png',
        // Pokémon: Winner, Survivor e Champion (tre livelli) e i tre fiocchi che avevano un file solo (ex victory-ribbon.png, strike-ribbon.png,
        // friend-ribbon.png): anche questi sono l'oro
        ...['winner', 'survivor', 'champion'].flatMap(b => ['bronze', 'silver', 'gold'].map(l => `ribbon-${b}-${l}.png`)),
        'ribbon-winstreak-gold.png', 'ribbon-cleanstreak-gold.png', 'ribbon-friendship-gold.png'
    ];
    for (const f of previsti) assert.ok(esiste(f), f);
    // ...e i vecchi nomi non ci sono più
    const vecchi = fs.readdirSync(IMMAGINI).filter(f => /^(badge_(clean|won|sd|founder)|champion-|victory-ribbon|strike-ribbon|friend-ribbon|team-(sd|wins|clean)|(galar|hoenn|sinnoh)-)/.test(f)
        || /^(ribbon-(winstreak|cleanstreak|friendship)|badge-team-(sdstreak|winstreak|cleanstreak))\.png$/.test(f) || /-ghost\.png$/.test(f));
    assert.deepEqual(vecchi, [], 'vecchi nomi (o sagome inutilizzate) ancora in docs/immagini/');
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
    // gli stessi file che compaiono nei dati di badgeSbloccati: oro per la pulita, bronzo per le vittorie, argento per lo showdown
    const [clean, won, sd] = Titoli.BADGE;
    const b = Titoli.badgeSbloccati({ maxcleanstrike: clean.steps[2], maxwonstrike: won.steps[0], maxshowdownstrike: sd.steps[1] }, 'didi');
    assert.deepEqual(b.map(x => x.img), [
        'immagini/badge-allenatore-founder.png', 'immagini/badge-allenatore-cleanstreak-gold.png',
        'immagini/badge-allenatore-winstreak-bronze.png', 'immagini/badge-allenatore-sdstreak-silver.png'
    ]);
});

test('profilo, pagina Trainers e pagina pubblica leggono le serie da titoli.js (nomi, chiavi, soglie e file in un posto solo)', () => {
    const profilo = leggi('profile.html'), trainers = leggi('players.html'), carta = leggi('public-card.js');
    // nessuna delle tre pagine ha più la sua copia delle serie: niente `file:`, `steps:` o chiavi dei dati scritte a mano
    for (const [nome, testo] of [['profile.html', profilo], ['players.html', trainers], ['public-card.js', carta]]) {
        assert.doesNotMatch(testo, /\bfile:\s*'(cleanstreak|winstreak|sdstreak)'/, `${nome}: una copia delle serie`);
        assert.doesNotMatch(testo, /steps:\s*\[\d+,\s*\d+,\s*\d+\]/, `${nome}: soglie scritte a mano`);
        assert.doesNotMatch(testo, /maxsdstrike|maxcleanstrike|maxwonstrike/, `${nome}: chiavi dei dati scritte a mano`);
        // il profilo e la pagina pubblica calcolano livello e avanzamento da titoli.js; la pagina Trainers mostra solo le medaglie già prese
        // (Titoli.badgeSbloccati: nome, livello, descrizione e immagine), tutte nel cerchio del colore del livello
        if (nome === 'players.html') assert.match(testo, /Titoli\.badgeSbloccati\(/, `${nome}: le medaglie prese da Titoli.badgeSbloccati`);
        else assert.match(testo, /Titoli\.statoSerie\(/, `${nome}: livello e avanzamento da Titoli.statoSerie`);
    }
    assert.match(profilo, /Titoli\.immagineSerie\(b,/);
    assert.match(carta, /Titoli\.immagineSerie\(b,/);
    assert.match(profilo, /\$\{Titoli\.IMMAGINE_FONDATORE\}/);
    assert.match(trainers, /BadgeTeam\.htmlMedaglietta\(/, 'players.html: ogni badge nel suo cerchio (come i badge del team)');
    assert.match(carta, /immagini\/badge-allenatore-founder\.png/);
    assert.match(trainers, /<script src="titoli\.js"><\/script>/, 'players.html carica titoli.js');
});

test('tools/elenco-immagini.cjs: elenca solo file che mancano davvero e i colori che mancano a ogni badge', () => {
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
    // nessun badge è senza i tre livelli nel catalogo
    for (const g of r.gruppi) assert.deepEqual(g.senzaLivelli, [], g.g.prefisso);
    // i "parziali" sono badge che hanno già qualche livello e ne aspettano altri: i colori che mancano sono quelli che non ci sono
    for (const g of r.gruppi) {
        for (const x of g.parziali) {
            for (const l of ['bronze', 'silver', 'gold']) {
                const f = x.b.immagini.map(p => p.replace(/^immagini\//, '')).find(p => p.endsWith(`-${l}.png`));
                assert.equal(x.mancanti.includes(l), !esiste(f), f);
            }
        }
    }
    assert.match(r.testo, /# Immagini dei badge/);
});
