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
    assert.match(finestre, /\.mini-gifs-row\.rg-attiva img\.rg-ko \{ opacity: \.28; filter: grayscale\(1\); \}/);
    assert.match(finestre, /\.mini-gifs-row\.rg-attiva img \{ opacity: \.5;/);
});

// Il gestore della pagina, eseguito con un DOM finto: nelle Random la fila dell'intestazione parte vuota e cresce man mano che i Pokémon scendono in campo
function paginaConFile() {
    const inizio = matches.indexOf("    const chiaveSquadra = t => ");
    const fine = matches.indexOf("    window.addEventListener('message', e => {", matches.indexOf("e.data.tipo !== 'replay-squadre'"));
    assert.ok(inizio > 0 && fine > inizio);
    const creaFila = () => {
        const fila = { figli: [], dataset: {}, classi: new Set(), classList: { add: c => fila.classi.add(c) }, appendChild: img => { img.parentNode = fila; fila.figli.push(img); }, insertBefore: (nuovo, prima) => { nuovo.parentNode = fila; fila.contenitori.push(nuovo); }, contenitori: [], querySelector: s => (s === 'img' ? fila.figli[0] || null : null), querySelectorAll: () => fila.figli };
        return fila;
    };
    const file = { 'header-gifs-didi': creaFila(), 'header-gifs-lu': creaFila() };
    let gestore;
    const ctx = vm.createContext({
        Array, Number, String, Set, SpritePkm: { gif: s => 'gif/' + s },
        window: { SpritePkm: { gif: s => 'gif/' + s }, addEventListener: (t, f) => { gestore = f; } },
        frame: () => ({ contentWindow: 'f' }),
        document: {
            getElementById: id => file[id],
            createElement: () => { const el = { dataset: {}, className: '', classi: new Set(), figli: [], parentNode: null, appendChild: f => { f.parentNode = el; el.figli.push(f); }, set title(v) {} }; el.classList = { toggle: (c, on) => (on ? el.classi.add(c) : el.classi.delete(c)), contains: c => el.className.split(' ').includes(c), add: c => el.classi.add(c) }; return el; }
        }
    });
    vm.runInContext(matches.slice(inizio, fine), ctx);
    return { file, manda: dati => gestore({ source: 'f', data: { tipo: 'replay-squadre', ...dati } }), pkm: lato => file[lato].figli.map(i => i.dataset.pkm) };
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

test('squadre: ogni sprite sta in un contenitore con la sua barretta rossa se è KO (non sull\'immagine, che diventa grigia e trasparente), e il CSS la disegna', () => {
    const p = paginaConFile();
    p.manda({ p1: [{ s: 'Dhelmise', st: 2 }, { s: 'Kingambit', st: 1 }], p2: [{ s: 'Arceus', st: 0 }] });
    const fila = p.file['header-gifs-didi'];
    assert.equal(fila.contenitori.length, 2, 'uno per sprite');
    assert.ok(fila.contenitori.every(c => c.className === 'rg-voce' && c.figli.length === 1));
    assert.deepEqual(fila.contenitori.map(c => c.classi.has('rg-voce-ko')), [true, false], 'solo chi è andato KO ha la barra');
    p.manda({ p1: [{ s: 'Dhelmise', st: 2 }, { s: 'Kingambit', st: 1 }, { s: 'Corviknight', st: 1 }], p2: [{ s: 'Arceus', st: 0 }] });
    assert.equal(fila.contenitori.length, 3, 'i contenitori non si raddoppiano e il nuovo sprite ha il suo');
    const css = fs.readFileSync(path.join(DOCS, 'finestre.css'), 'utf8');
    assert.match(css, /\.mini-gifs-row \.rg-voce\.rg-voce-ko::before \{ opacity: 1;/);
    assert.match(css, /\.mini-gifs-row \.rg-voce::before \{[^}]*background: #e53935;/);
    assert.match(css, /#replayModal\.tel \.replay-mini-header \.mini-gifs-row \.rg-voce \{ flex: 1 1 0;/, 'anche da telefono gli sprite si dividono la fila');
});
