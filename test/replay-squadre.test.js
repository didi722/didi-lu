'use strict';
// Il replay mostra le squadre nell'intestazione: chi è sceso in campo e chi è andato KO (semitrasparente), fino al punto in cui è il replay.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const replay = fs.readFileSync(path.join(DOCS, 'replay-sito.js'), 'utf8');
const matches = fs.readFileSync(path.join(DOCS, 'matches.html'), 'utf8');
const finestre = fs.readFileSync(path.join(DOCS, 'finestre.css'), 'utf8');

function squadre(coda, currentStep) {
    const inizio = replay.indexOf('const baseSpecie = ');
    const fine = replay.indexOf('        function inviaSquadre()', inizio);
    assert.ok(inizio > 0 && fine > inizio);
    const ctx = vm.createContext({ battle: { stepQueue: coda, currentStep }, Math, String, JSON });
    vm.runInContext(replay.slice(inizio, fine) + '\nthis.calcola = calcolaSquadre;', ctx);
    return JSON.parse(JSON.stringify(ctx.calcola()));
}

const LOG = [
    '|poke|p1|Incineroar, L50, M|', '|poke|p1|Rillaboom, L50, M|', '|poke|p1|Urshifu-*, L50, M|', '|poke|p1|Amoonguss, L50, F|',
    '|poke|p2|Torkoal, L50, M|', '|poke|p2|Pelipper, L50, F|', '|poke|p2|Dragapult, L50, F|',
    '|start',
    '|switch|p1a: Incineroar|Incineroar, L50, M|100/100', '|switch|p1b: Rillaboom|Rillaboom, L50, M|100/100',
    '|switch|p2a: Torkoal|Torkoal, L50, M|100/100', '|switch|p2b: Pelipper|Pelipper, L50, F|100/100',
    '|turn|1', '|faint|p2b: Pelipper', '|upkeep', '|switch|p2b: Draga|Dragapult, L50, F|100/100',
    '|switch|p1a: Uru|Urshifu-Rapid-Strike, L50, M|100/100'
];
const stato = (r, lato, specie) => r[lato].find(x => x.s === specie).st;

test('squadre: all\'inizio nessuno è sceso; poi chi è in campo (1) e chi è KO (2), solo con le righe già eseguite', () => {
    const prima = squadre(LOG, 8);
    assert.deepEqual(prima.p1.map(x => x.st), [0, 0, 0, 0]);
    assert.equal(prima.p2.length, 3, 'l\'elenco è quello della presentazione (|poke|)');
    const dopo = squadre(LOG, 13);
    assert.equal(stato(dopo, 'p1', 'Incineroar'), 1);
    assert.equal(stato(dopo, 'p2', 'Pelipper'), 1);
    assert.equal(stato(dopo, 'p2', 'Dragapult'), 0);
    const ko = squadre(LOG, 15);
    assert.equal(stato(ko, 'p2', 'Pelipper'), 2);
});

test('squadre: un Pokémon con soprannome o forma diversa dalla presentazione si riconosce (Urshifu-* -> Urshifu-Rapid-Strike, Draga -> Dragapult); i KO non tornano in campo', () => {
    const r = squadre(LOG, LOG.length);
    assert.equal(r.p1.length, 4, 'nessun doppione');
    assert.equal(stato(r, 'p1', 'Urshifu-Rapid-Strike'), 1);
    assert.equal(stato(r, 'p2', 'Dragapult'), 1);
    assert.equal(stato(r, 'p2', 'Pelipper'), 2);
});

test('squadre: senza |poke| (Random) l\'elenco si costruisce da chi scende in campo', () => {
    const r = squadre(['|switch|p1a: A|Pikachu, L82|100/100', '|switch|p2a: B|Eevee, L90|100/100', '|faint|p2a: B'], 3);
    assert.deepEqual(r.p1, [{ s: 'Pikachu', st: 1 }]);
    assert.deepEqual(r.p2, [{ s: 'Eevee', st: 2 }]);
});

test('squadre: il replay le manda alla pagina a ogni cambio (non uguali a prima), la pagina le mostra nelle file dell\'intestazione: KO semitrasparente e grigio, non ancora sceso più tenue', () => {
    assert.match(replay, /aggiornaCampo\(\);\s*inviaSquadre\(\);\s*aggiornaComandi\(\);/);
    assert.match(replay, /setInterval\(\(\) => \{ impostaAvatar\(\); aggiornaCampo\(\); inviaSquadre\(\); \}, 400\)/);
    assert.match(replay, /if \(firma === ultimeSquadre\) return;/);
    assert.match(matches, /e\.data\.tipo !== 'replay-squadre'/);
    assert.match(matches, /img\.dataset\.pkm = p\.nome;/);
    assert.match(matches, /img\.classList\.toggle\('rg-ko', st === 2\)/);
    assert.match(finestre, /\.mini-gifs-row\.rg-attiva img\.rg-ko \{ opacity: \.5; filter: grayscale\(1\); \}/, 'tenue quanto chi è in panchina');
    assert.match(finestre, /\.mini-gifs-row\.rg-attiva img \{ opacity: \.5;/);
});

// Il gestore della pagina, eseguito con un DOM finto: nelle Random la fila dell'intestazione parte vuota e cresce man mano che i Pokémon scendono in campo
function paginaConFile(opzioni = {}) {
    const letti = [];
    const inizio = matches.indexOf("    const chiaveSquadra = t => ");
    const fine = matches.indexOf("    window.addEventListener('message', e => {", matches.indexOf("e.data.tipo !== 'replay-squadre'"));
    assert.ok(inizio > 0 && fine > inizio);
    const creaFila = () => {
        const fila = { figli: [], dataset: {}, classi: new Set(), classList: { add: c => fila.classi.add(c), remove: c => fila.classi.delete(c) }, replaceChildren: () => { fila.figli = []; fila.contenitori = []; }, appendChild: img => { img.parentNode = fila; fila.figli.push(img); }, insertBefore: (nuovo, prima) => { nuovo.parentNode = fila; fila.contenitori.push(nuovo); }, contenitori: [], querySelector: s => (s === 'img' ? fila.figli[0] || null : null), querySelectorAll: () => fila.figli };
        return fila;
    };
    const file = { 'header-gifs-didi': creaFila(), 'header-gifs-lu': creaFila() };
    let gestore;
    const ctx = vm.createContext({
        Array, Number, String, Set, SpritePkm: { gif: s => 'gif/' + s },
        window: { SpritePkm: { gif: s => 'gif/' + s }, addEventListener: (t, f) => { gestore = f; }, replayAttuale: opzioni.replayAttuale || null },
        db: { ref: percorso => ({ once: async () => { letti.push(percorso); return { val: () => (opzioni.statistiche ? opzioni.statistiche[percorso] : null) || null }; } }) },
        frame: () => ({ contentWindow: 'f' }),
        document: {
            querySelector: sel => (sel === '.btn-set.is-selected' && opzioni.setAperto ? { dataset: { set: opzioni.setAperto } } : null),
            getElementById: id => file[id],
            createElement: () => { const el = { dataset: {}, className: '', classi: new Set(), figli: [], parentNode: null, appendChild: f => { f.parentNode = el; el.figli.push(f); }, set title(v) {} }; el.classList = { toggle: (c, on) => (on ? el.classi.add(c) : el.classi.delete(c)), contains: c => el.className.split(' ').includes(c), add: c => el.classi.add(c) }; return el; }
        }
    });
    vm.runInContext(matches.slice(inizio, fine), ctx);
    return { file, letti, azzera: () => ctx.window.azzeraSquadreReplay(), manda: dati => gestore({ source: 'f', data: { tipo: 'replay-squadre', ...dati } }), pkm: lato => file[lato].figli.map(i => i.dataset.pkm) };
}

test('squadre, Random: la fila costruita dal replay si allunga con i Pokémon che scendono in campo (prima restava ai primi), senza doppioni', () => {
    const p = paginaConFile();
    p.manda({ p1: [{ s: 'Dhelmise', st: 1 }], p2: [{ s: 'Arceus', st: 1 }] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Dhelmise']);
    p.manda({ p1: [{ s: 'Dhelmise', st: 2 }, { s: 'Kingambit', st: 1 }], p2: [{ s: 'Arceus', st: 1 }, { s: 'Toxapex', st: 1 }] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Dhelmise', 'Kingambit']);
    assert.deepEqual(p.pkm('header-gifs-lu'), ['Arceus', 'Toxapex']);
    p.manda({ p1: [{ s: 'Dhelmise', st: 2 }, { s: 'Kingambit', st: 1 }], p2: [{ s: 'Arceus', st: 1 }, { s: 'Toxapex', st: 1 }] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Dhelmise', 'Kingambit'], 'lo stesso messaggio non aggiunge niente');
    // tornando indietro i Pokémon già visti restano (tenui), non sparisce niente
    p.manda({ p1: [{ s: 'Dhelmise', st: 1 }], p2: [{ s: 'Arceus', st: 1 }] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Dhelmise', 'Kingambit']);
});

test('squadre: una fila con il team vero dell\'intestazione non si tocca (nessun Pokémon aggiunto); renderGifs azzera il segno "costruita dal replay"', () => {
    const p = paginaConFile();
    const fila = p.file['header-gifs-didi'];
    fila.figli.push({ dataset: { pkm: 'Garchomp' }, classList: { toggle() {} } });
    p.manda({ p1: [{ s: 'Garchomp', st: 1 }, { s: 'Rotom', st: 1 }], p2: [] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Garchomp'], 'il team dell\'intestazione resta quello');
    assert.match(matches, /delete container\.dataset\.daReplay;/);
});

test('squadre: ogni sprite sta in un contenitore con la sua barra rossa in diagonale (lo "barra") se è KO (non sull\'immagine, che diventa grigia e trasparente), e il CSS la disegna', () => {
    const p = paginaConFile();
    p.manda({ p1: [{ s: 'Dhelmise', st: 2 }, { s: 'Kingambit', st: 1 }], p2: [{ s: 'Arceus', st: 0 }] });
    const fila = p.file['header-gifs-didi'];
    assert.equal(fila.contenitori.length, 2, 'uno per sprite');
    assert.ok(fila.contenitori.every(c => c.className === 'rg-voce' && c.figli.length === 1));
    assert.deepEqual(fila.contenitori.map(c => c.classi.has('rg-voce-ko')), [true, false], 'solo chi è andato KO ha la barra');
    p.manda({ p1: [{ s: 'Dhelmise', st: 2 }, { s: 'Kingambit', st: 1 }, { s: 'Corviknight', st: 1 }], p2: [{ s: 'Arceus', st: 0 }] });
    assert.equal(fila.contenitori.length, 3, 'i contenitori non si raddoppiano e il nuovo sprite ha il suo');
    const css = fs.readFileSync(path.join(DOCS, 'finestre.css'), 'utf8');
    assert.match(css, /\.mini-gifs-row \.rg-voce\.rg-voce-ko::before \{ opacity: 1; transform: rotate\(-45deg\); \}/, 'in diagonale');
    assert.match(css, /\.mini-gifs-row \.rg-voce::before \{[^}]*background: #e53935;/);
    assert.match(css, /#replayModal\.tel \.replay-mini-header \.mini-gifs-row \.rg-voce \{ flex: 1 1 0;/, 'anche da telefono gli sprite si dividono la fila');
});

test('squadre: il replay manda anche chi è sceso in campo in un momento qualsiasi del set (non solo fino al punto in cui è) e quanti Pokémon portava ognuno', () => {
    const log = ['|poke|p1|Incineroar, L50, M|', '|poke|p1|Rillaboom, L50, M|', '|poke|p1|Urshifu-*, L50, M|', '|poke|p1|Amoonguss, L50, F|', '|poke|p1|Garchomp, L50, M|', '|poke|p1|Kyogre, L50|',
        '|poke|p2|Torkoal, L50, M|', '|poke|p2|Pelipper, L50, F|', '|teamsize|p1|4', '|teamsize|p2|4', '|start',
        '|switch|p1a: Incineroar|Incineroar, L50, M|100/100', '|switch|p2a: Torkoal|Torkoal, L50, M|100/100', '|turn|1',
        '|faint|p2a: Torkoal', '|switch|p2a: Pelipper|Pelipper, L50, F|100/100', '|switch|p1b: Uru|Urshifu-Rapid-Strike, L50, M|100/100'];
    const presto = squadre(log, 12);
    assert.deepEqual(presto.scesi, { p1: ['Incineroar', 'Urshifu-Rapid-Strike'], p2: ['Torkoal', 'Pelipper'] }, 'anche chi scende dopo, con la forma');
    assert.deepEqual(presto.dim, { p1: 4, p2: 4 });
    assert.equal(stato(presto, 'p1', 'Urshifu'), 0, 'ma lo stato è ancora "non sceso"');
    assert.deepEqual(squadre(['|switch|p1a: A|Pikachu, L82|100/100'], 1).dim, { p1: 0, p2: 0 }, 'senza |teamsize| nessun numero');
});

test('squadre, formati con team preview: nell\'intestazione restano solo i Pokémon portati (scesi in campo in un momento del set), quelli rimasti a casa spariscono; i KO e chi non è ancora sceso restano tenui', () => {
    const p = paginaConFile();
    for (const lato of ['header-gifs-didi', 'header-gifs-lu']) {
        for (const s of lato === 'header-gifs-didi' ? ['Incineroar', 'Rillaboom', 'Urshifu', 'Amoonguss', 'Garchomp', 'Kyogre'] : ['Torkoal', 'Pelipper', 'Dragapult', 'Tyranitar', 'Gengar', 'Mew']) {
            const img = { dataset: { pkm: s }, classList: { toggle() {} } };
            p.file[lato].figli.push(img);
        }
    }
    const rosa1 = [{ s: 'Incineroar', st: 1 }, { s: 'Rillaboom', st: 1 }, { s: 'Urshifu-*', st: 0 }, { s: 'Amoonguss', st: 0 }, { s: 'Garchomp', st: 0 }, { s: 'Kyogre', st: 0 }];
    // prima che il replay dica chi è sceso, nessuno si toglie
    p.manda({ p1: rosa1, p2: [{ s: 'Torkoal', st: 1 }], scesi: { p1: [], p2: [] }, dim: { p1: 4, p2: 4 } });
    const fuori = lato => p.file[lato].contenitori.filter(c => c.classi.has('rg-voce-fuori')).length;
    assert.equal(fuori('header-gifs-didi'), 0);
    // chi è sceso in un momento del set (anche più avanti: Urshifu) resta; chi non è mai sceso e non è dichiarato sparisce
    p.manda({ p1: rosa1, p2: [{ s: 'Torkoal', st: 1 }, { s: 'Pelipper', st: 2 }], scesi: { p1: ['Incineroar', 'Rillaboom', 'Urshifu-Rapid-Strike'], p2: ['Torkoal', 'Pelipper'] }, dim: { p1: 4, p2: 4 } });
    const nomiFuori = lato => p.file[lato].contenitori.filter(c => c.classi.has('rg-voce-fuori')).map(c => c.figli[0].dataset.pkm);
    assert.deepEqual(nomiFuori('header-gifs-didi'), ['Amoonguss', 'Garchomp', 'Kyogre']);
    assert.deepEqual(nomiFuori('header-gifs-lu'), ['Dragapult', 'Tyranitar', 'Gengar', 'Mew']);
    // chi è sceso non sparisce mai, nemmeno se KO
    assert.ok(!nomiFuori('header-gifs-lu').includes('Pelipper'));
});

test('squadre: i Pokémon che le statistiche del set segnano come portati restano anche se non sono mai scesi in campo (letti solo per il set aperto); senza statistiche restano quelli scesi', async () => {
    const chiave = 's0/sd1/match1/set2';
    const p = paginaConFile({ replayAttuale: { stagione: 's0', sd: 'sd1', match: 'match1' }, setAperto: '2',
        statistiche: { ['setStats/' + chiave]: { p1: { pokemon: [{ specie: 'Incineroar', portato: true }, { specie: 'Amoonguss', portato: true }, { specie: 'Garchomp', portato: false }] }, p2: { pokemon: [] } } } });
    for (const s of ['Incineroar', 'Amoonguss', 'Garchomp']) p.file['header-gifs-didi'].figli.push({ dataset: { pkm: s }, classList: { toggle() {} } });
    p.manda({ p1: [{ s: 'Incineroar', st: 1 }, { s: 'Amoonguss', st: 0 }, { s: 'Garchomp', st: 0 }], p2: [], scesi: { p1: ['Incineroar'], p2: [] }, dim: { p1: 2, p2: 0 } });
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(p.letti, ['setStats/' + chiave], 'una sola lettura, solo di questo set');
    const fuori = p.file['header-gifs-didi'].contenitori.filter(c => c.classi.has('rg-voce-fuori')).map(c => c.figli[0].dataset.pkm);
    assert.deepEqual(fuori, ['Garchomp'], 'Amoonguss è portato (dalle statistiche) anche se non è sceso; Garchomp è rimasto a casa');
    p.manda({ p1: [{ s: 'Incineroar', st: 1 }, { s: 'Amoonguss', st: 0 }, { s: 'Garchomp', st: 0 }], p2: [], scesi: { p1: ['Incineroar'], p2: [] }, dim: { p1: 2, p2: 0 } });
    assert.equal(p.letti.length, 1, 'non si rilegge a ogni messaggio');
});

test('squadre, Random: cambiando set (un altro documento del replay) la fila costruita dal replay riparte da zero, senza i Pokémon dei set visti prima', () => {
    const p = paginaConFile();
    p.manda({ doc: 'set1', p1: [{ s: 'Dhelmise', st: 1 }, { s: 'Kingambit', st: 1 }], p2: [{ s: 'Arceus', st: 1 }] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Dhelmise', 'Kingambit']);
    // l'altro set: la fila è solo la sua
    p.manda({ doc: 'set2', p1: [{ s: 'Gengar', st: 1 }], p2: [{ s: 'Pikachu', st: 1 }, { s: 'Eevee', st: 0 }] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Gengar']);
    assert.deepEqual(p.pkm('header-gifs-lu'), ['Pikachu', 'Eevee']);
    // dentro lo stesso replay la fila continua a crescere
    p.manda({ doc: 'set2', p1: [{ s: 'Gengar', st: 2 }, { s: 'Mimikyu', st: 1 }], p2: [{ s: 'Pikachu', st: 1 }] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Gengar', 'Mimikyu']);
    // e a ogni cambio di set la pagina svuota subito le file (senza aspettare il primo messaggio del nuovo replay)
    p.azzera();
    assert.deepEqual(p.pkm('header-gifs-didi'), []);
    assert.deepEqual(p.pkm('header-gifs-lu'), []);
    p.manda({ doc: 'set3', p1: [{ s: 'Dragapult', st: 1 }], p2: [] });
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Dragapult']);
    // il replay dà a ogni documento il suo identificativo, e caricaVideoDirect (cambio di set) azzera le file
    assert.match(replay, /const ID_DOC = Math\.random\(\)/);
    assert.match(replay, /tipo: 'replay-squadre', doc: ID_DOC,/);
    assert.match(matches, /if \(window\.azzeraSquadreReplay\) window\.azzeraSquadreReplay\(\);/);
});

test('squadre: una fila con il team vero dell\'intestazione resta anche cambiando set (solo quelle costruite dal replay si svuotano)', () => {
    const p = paginaConFile();
    const fila = p.file['header-gifs-didi'];
    fila.figli.push({ dataset: { pkm: 'Garchomp' }, classList: { toggle() {} } });
    p.manda({ doc: 'a', p1: [{ s: 'Garchomp', st: 1 }], p2: [] });
    p.manda({ doc: 'b', p1: [{ s: 'Garchomp', st: 0 }], p2: [] });
    p.azzera();
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Garchomp']);
});

test('squadre, Random: la fila costruita dal replay mostra tutti quelli visti, niente viene tolto', () => {
    const p = paginaConFile();
    p.manda({ p1: [{ s: 'Dhelmise', st: 1 }, { s: 'Kingambit', st: 0 }], p2: [{ s: 'Arceus', st: 1 }], scesi: { p1: ['Dhelmise'], p2: ['Arceus'] }, dim: { p1: 0, p2: 0 } });
    assert.equal(p.file['header-gifs-didi'].contenitori.filter(c => c.classi.has('rg-voce-fuori')).length, 0);
    assert.deepEqual(p.pkm('header-gifs-didi'), ['Dhelmise', 'Kingambit']);
});

test('squadre: matches.html dice al gestore quale stagione e quale set sono aperti, e il CSS nasconde chi è rimasto a casa', () => {
    assert.match(matches, /window\.replayAttuale\.stagione = stagione;/);
    assert.match(matches, /db\.ref\('setStats\/' \+ chiave\)\.once\('value'\)/);
    assert.match(finestre, /\.mini-gifs-row \.rg-voce\.rg-voce-fuori \{ display: none; \}/);
});

test('squadre, forme diverse della stessa specie (quattro Rotom): ognuno si riconosce dal nome esatto, per gli stati e per i portati', async () => {
    // nel replay: scende Rotom-Heat, non il primo Rotom della presentazione
    const log = ['|poke|p1|Rotom-Wash, L50|', '|poke|p1|Rotom-Heat, L50|', '|poke|p1|Rotom-Frost, L50|', '|poke|p1|Rotom-Mow, L50|', '|poke|p1|Gengar, L50, M|', '|poke|p1|Mew, L50|',
        '|teamsize|p1|4', '|start', '|switch|p1a: Rotom|Rotom-Heat, L50|100/100', '|switch|p1b: Gengar|Gengar, L50, M|100/100', '|turn|1', '|faint|p1a: Rotom'];
    const r = squadre(log, log.length);
    assert.equal(stato(r, 'p1', 'Rotom-Heat'), 2, 'è Rotom-Heat che è sceso ed è andato KO');
    assert.equal(stato(r, 'p1', 'Rotom-Wash'), 0, 'gli altri Rotom restano dove sono');
    assert.equal(stato(r, 'p1', 'Rotom-Frost'), 0);
    assert.equal(r.p1.length, 6, 'nessun doppione');
    assert.deepEqual(r.scesi.p1, ['Rotom-Heat', 'Gengar']);
    // nella pagina: sei sprite (4 Rotom, Gengar, Mew); portati Rotom-Heat, Gengar e, dalle statistiche, Rotom-Mow
    const p = paginaConFile({ replayAttuale: { stagione: 's0', sd: 'sd1', match: 'match1' }, setAperto: '1',
        statistiche: { 'setStats/s0/sd1/match1/set1': { p1: { pokemon: [{ specie: 'Rotom-Mow', portato: true }] }, p2: { pokemon: [] } } } });
    for (const n of ['Rotom-Wash', 'Rotom-Heat', 'Rotom-Frost', 'Rotom-Mow', 'Gengar', 'Mew']) p.file['header-gifs-didi'].figli.push({ dataset: { pkm: n }, classList: { toggle() {} } });
    p.manda({ p1: r.p1, p2: [], scesi: r.scesi, dim: r.dim });
    await new Promise(res => setTimeout(res, 5));
    const fuori = p.file['header-gifs-didi'].contenitori.filter(c => c.classi.has('rg-voce-fuori')).map(c => c.figli[0].dataset.pkm);
    assert.deepEqual(fuori, ['Rotom-Wash', 'Rotom-Frost', 'Mew'], 'restano Rotom-Heat e Gengar (scesi) e Rotom-Mow (dalle statistiche); gli altri Rotom e Mew sono rimasti a casa');
    const ko = p.file['header-gifs-didi'].contenitori.filter(c => c.classi.has('rg-voce-ko')).map(c => c.figli[0].dataset.pkm);
    assert.deepEqual(ko, ['Rotom-Heat'], 'il KO è di Rotom-Heat, non del primo Rotom');
});
