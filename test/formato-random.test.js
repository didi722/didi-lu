'use strict';
// I formati Random di Showdown (docs/formato-random.js, docs/pkmn-randoms.js):
//   - l'elenco dei formati che il sito sa giocare esiste davvero nel simulatore, con la generazione e lo stile giusti;
//   - un formato Random del sito si riconosce dal regolamento e dice quale formato di Showdown giocare;
//   - i team li compone il generatore di Showdown (nel browser pkmn-randoms.js, agganciato a Teams.generate): sempre 6 set,
//     uguali con lo stesso seme, diversi con semi diversi;
//   - la CPU gioca partite intere con quei team in ogni generazione, senza che il simulatore rifiuti nessuna scelta.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { caricaSim, caricaRandoms, giocaPartita, creaCasuale } = require('./ayuda-sim.js');
const FR = require('../docs/formato-random.js');
const IA = require('../docs/cpu-ia.js');

const leggi = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('docs/ e functions/ hanno la stessa copia di formato-random.js', () => {
    assert.equal(leggi('docs/formato-random.js'), leggi('functions/formato-random.js'));
});

test('i formati Random del sito: dalla Gen 1 alla Gen 9 in singolo, in doppio solo in Gen 9, con il nome di Showdown', () => {
    assert.deepEqual(FR.FORMATI.map(f => f.id), [
        'gen9randombattle', 'gen9randomdoublesbattle', 'gen8randombattle', 'gen7randombattle', 'gen6randombattle',
        'gen5randombattle', 'gen4randombattle', 'gen3randombattle', 'gen2randombattle', 'gen1randombattle'
    ]);
    assert.equal(FR.PREDEFINITO.id, 'gen9randombattle');
    assert.equal(FR.trova('gen9randomdoublesbattle').nome, '[Gen 9] Random Doubles Battle');
    assert.equal(FR.trova('gen1randombattle').nome, '[Gen 1] Random Battle');
    assert.equal(new Set(FR.FORMATI.map(f => f.id)).size, FR.FORMATI.length);
});

test('un regolamento Random si riconosce, e dice quale formato di Showdown giocare', () => {
    assert.equal(FR.eRandom({ strutturaSito: 'random' }), true);
    assert.equal(FR.eRandom({ strutturaSito: ' Random ' }), true);
    for (const s of ['custom', 'vgc', 'anything_goes', '', undefined]) assert.equal(FR.eRandom({ strutturaSito: s }), false, String(s));
    assert.equal(FR.eRandom(null), false);

    assert.equal(FR.idSimulatore({ strutturaSito: 'random', formatoSimulatore: 'gen7randombattle' }), 'gen7randombattle');
    assert.equal(FR.idSimulatore({ strutturaSito: 'random', formatoSimulatore: 'Gen7 Random Battle' }), 'gen7randombattle', 'maiuscole e spazi non contano');
    // un id che il sito non sa giocare (formato strano scritto a mano nel database) o mancante: il Random di oggi, mai un errore
    assert.equal(FR.idSimulatore({ strutturaSito: 'random', formatoSimulatore: 'gen9ou' }), 'gen9randombattle');
    assert.equal(FR.idSimulatore({ strutturaSito: 'random' }), 'gen9randombattle');
    assert.equal(FR.generazione({ strutturaSito: 'random', formatoSimulatore: 'gen4randombattle' }), 4);
});

test('campiRegolamento: solo il formato di Showdown e i campi che i formati normali hanno sempre, niente restrizioni né tier', () => {
    const singolo = FR.campiRegolamento('gen8randombattle');
    assert.deepEqual(singolo, {
        strutturaSito: 'random', formatoSimulatore: 'gen8randombattle',
        genRuleType: 'within', genRuleValue: '8', battleStyle: 'singles', generationalMechanics: true
    });
    const doppio = FR.campiRegolamento('gen9randomdoublesbattle');
    assert.equal(doppio.battleStyle, 'doubles');
    assert.equal(doppio.genRuleValue, '9');
    for (const f of FR.FORMATI) {
        const c = FR.campiRegolamento(f.id);
        assert.equal(c.formatoSimulatore, f.id);
        assert.equal(c.genRuleValue, String(f.gen));
        assert.equal('restrizioni' in c || 'baseTier' in c, false, 'un formato Random non ha nulla da impostare');
    }
    assert.equal(FR.campiRegolamento('qualcosa').formatoSimulatore, 'gen9randombattle', 'id sconosciuto: il predefinito');
});

test('ogni formato dell\'elenco esiste nel simulatore del sito come formato Random, con generazione e stile giusti', async () => {
    const { sim } = await caricaSim();
    for (const f of FR.FORMATI) {
        const formato = sim.Dex.formats.get(f.id);
        assert.equal(formato.exists, true, f.id);
        assert.equal(formato.team, 'random', `${f.id}: i team li compone Showdown`);
        assert.equal(formato.mod, `gen${f.gen}`, f.id);
        assert.equal(formato.gameType === 'doubles', f.doppio, f.id);
        assert.equal(formato.name, f.nome, `${f.id}: il nome è quello di Showdown`);
    }
});

test('il simulatore del sito esporta PRNG, Tags e toID (servono ai generatori dei team Random) e li condivide con pkmn-randoms.js', async () => {
    const { sim } = await caricaRandoms();
    for (const nome of ['BattleStreams', 'Dex', 'TeamValidator', 'Teams', 'PRNG', 'Tags', 'toID']) assert.ok(sim[nome], nome);
    assert.equal(sim.toID('Mr. Mime'), 'mrmime');
    // pkmn-randoms.js non porta con sé una seconda copia del simulatore: importa quella del sito
    const randoms = leggi('docs/pkmn-randoms.js');
    assert.match(randoms, /from"\.\/pkmn-sim\.js"/);
    assert.doesNotMatch(randoms, /@pkmn\/sim/);
    assert.ok(randoms.length < 2 * 1024 * 1024, 'solo i generatori e i loro dati');
});

test('Teams.generate: sei set per ogni formato, con specie, mosse e livello; stesso seme stesso team, semi diversi team diversi', async () => {
    const { sim } = await caricaRandoms();
    for (const f of FR.FORMATI) {
        const dex = sim.Dex.forGen(f.gen);
        const a = sim.Teams.generate(f.id, { seed: [1, 2, 3, 4] });
        assert.equal(a.length, 6, f.id);
        for (const s of a) {
            assert.ok(dex.species.get(s.species).exists, `${f.id}: ${s.species} esiste`);
            assert.ok(s.moves.length >= 1 && s.moves.length <= 4, `${f.id}: ${s.species} ha mosse`);
            assert.ok(s.level >= 1 && s.level <= 100, `${f.id}: ${s.species} livello ${s.level}`);
            for (const m of s.moves) assert.ok(dex.moves.get(m).exists, `${f.id}: ${s.species} ${m}`);
        }
        const stesso = sim.Teams.generate(f.id, { seed: [1, 2, 3, 4] });
        assert.equal(sim.Teams.pack(stesso), sim.Teams.pack(a), `${f.id}: stesso seme, stesso team`);
        const altro = sim.Teams.generate(f.id, { seed: [9, 8, 7, 6] });
        assert.notEqual(sim.Teams.pack(altro), sim.Teams.pack(a), `${f.id}: semi diversi, team diversi`);
        // senza seme: a caso ogni volta
        assert.notEqual(sim.Teams.pack(sim.Teams.generate(f.id)), sim.Teams.pack(sim.Teams.generate(f.id)), `${f.id}: senza seme sempre diversi`);
    }
});

test('un team Random si può impacchettare e rimettere in campo (è quello che fa il simulatore del sito)', async () => {
    const { sim } = await caricaRandoms();
    for (const f of FR.FORMATI) {
        const team = sim.Teams.generate(f.id, { seed: [5, 5, 5, 5] });
        const pacchetto = sim.Teams.pack(team);
        const indietro = sim.Teams.unpack(pacchetto);
        assert.equal(indietro.length, 6, f.id);
        assert.deepEqual(indietro.map(s => sim.toID(s.species)), team.map(s => sim.toID(s.species)), f.id);
    }
});

for (const f of FR.FORMATI) {
    test(`partita vera (${f.nome}): la CPU gioca con team Random fino in fondo, senza scelte rifiutate dal simulatore`, { timeout: 180000 }, async () => {
        const { sim } = await caricaRandoms();
        for (let i = 0; i < 2; i++) {
            const t1 = sim.Teams.generate(f.id, { seed: [i + 1, 3, 5, 7] }), t2 = sim.Teams.generate(f.id, { seed: [i + 2, 4, 6, 8] });
            const cpu = IA.crea({ Dex: sim.Dex, lato: 'p1', casuale: creaCasuale(i + 1) });
            const contro = i === 0 ? { tipo: 'casuale' } : { tipo: 'cpu', cerebro: IA.crea({ Dex: sim.Dex, lato: 'p2', casuale: creaCasuale(i + 50) }) };
            const e = await giocaPartita({ sim, formato: f.id, team1: t1, team2: t2, agente1: { tipo: 'cpu', cerebro: cpu }, agente2: contro, casuale: creaCasuale(i + 9), seme: [i + 1, 7, 11, 13] });
            assert.deepEqual(e.errori.map(x => `${x.lato} ${x.scelta} => ${x.messaggio}`), [], 'nessuna scelta rifiutata');
            assert.ok(!e.bloccata && !e.scaduta, `la partita deve finire (turni ${e.turni})`);
            assert.ok(e.vincitore === 'p1' || e.vincitore === 'p2' || e.vincitore === null);
            assert.ok(e.turni >= 3, 'una partita vera, non un ritiro');
        }
    });
}

test('tools/costruisci-simulatore.cjs fissa le versioni dei pacchetti, così il risultato è sempre lo stesso', () => {
    const tool = leggi('tools/costruisci-simulatore.cjs');
    assert.match(tool, /'@pkmn\/sim': '0\.10\.11'/);
    assert.match(tool, /'@pkmn\/randoms': '0\.10\.11'/);
    assert.match(tool, /esbuild: '0\.28\.2'/);
    assert.match(tool, /--alias:@pkmn\/sim=\.\/pkmn-sim\.js/);
});

// ---------- le pagine del sito ----------
const T = require('../docs/formato-tooltip.js');

test('tooltip del formato (Hub e Index): un formato Random mostra il formato di Showdown e i team di Showdown, senza tier né meccaniche', () => {
    const html = T.generaRiepilogoFormatoHtml('Random Gen 9', { ...FR.campiRegolamento('gen9randombattle'), descrizioneBreve: 'Team a caso' });
    assert.match(html, />Random Battle</);
    assert.match(html, /frt-value frt-lower">gen9randombattle</);
    assert.match(html, /Random, given by Showdown/);
    assert.doesNotMatch(html, /Max\. Tier|Gen Mechanics|Battle Style|Pok.mon Origin/);
});

test('Formats: il tipo Random si sceglie, si salva con i campi del modulo condiviso, si modifica e ha la sua scheda con "Play vs CPU"', () => {
    const html = leggi('docs/formats.html');
    assert.match(html, /<script src="formato-random\.js"><\/script>/);
    assert.match(html, /<option value="random">Random Battle<\/option>/);
    assert.match(html, /id="section-random"/);
    assert.match(html, /id="row-showdown-meccaniche"/, 'la riga del formato di validazione e delle meccaniche si nasconde nei Random');
    assert.match(html, /FormatoRandom\.FORMATI\.forEach\(f => select\.add\(new Option\(f\.nome, f\.id\)\)\)/);
    assert.match(html, /Object\.assign\(payload, FormatoRandom\.campiRegolamento\(scelto\.value\)\)/);
    // la modifica rimette la scelta del Random al suo posto
    assert.match(html, /sceltaRandom\.value = FormatoRandom\.idSimulatore\(formato\)/);
    // la scheda: il pulsante per provarlo contro la CPU, e la classifica come quella degli altri formati (un Random può essere in una stagione)
    assert.match(html, /FormatoRandom\.eRandom\(formatoDati\)/);
    assert.match(html, /battle\.html\?cpu=1&random=\$\{encodeURIComponent\(random\.id\)\}/);
    assert.ok(!html.includes('conClassifica'), 'la classifica c\'è anche per i Random');
    assert.match(html, /<section class="fmt-classifica" aria-label="Format ranking">/);
    assert.match(leggi('docs/style-formats.css'), /\.fmt-gioca-cpu \{/);
    assert.ok(!leggi('docs/style-formats.css').includes('.fmt-senza-classifica'));
});

test('un formato Random non si usa dove servono i team (Team Builder del Box), ma può essere una categoria di stagione', () => {
    const box = leggi('docs/box.html');
    assert.match(box, /<script src="formato-random\.js"><\/script>/);
    assert.equal((box.match(/FormatoRandom\.eRandom\(/g) || []).length, 2, 'il filtro dei team e la scelta del formato per un team nuovo');
    // l'admin lo offre tra i formati di una stagione (nessun team da iscrivere: li dà Showdown a ogni set)
    const admin = leggi('docs/admin.html');
    assert.match(admin, /<script src="formato-random\.js"><\/script>/);
    assert.ok(!/nomeCat && !FormatoRandom\.eRandom\(regs\[idReg\]\)/.test(admin), 'non è più escluso dalle stagioni');
    assert.match(admin, /FormatoRandom\.eRandom\(regs\[idReg\]\) \? ' \(Random\)' : ''/);
});

test('battle.html: il Random Battle contro la CPU parte da ?cpu=1&random=ID con due team di Showdown e senza anteprima', () => {
    const ui = leggi('docs/battle-ui.js');
    assert.match(ui, /import '\.\/formato-random\.js';/);
    assert.match(ui, /if \(parametri\.get\('random'\)\) preparaCpuRandom\(parametri\.get\('random'\), parametri\.get\('nome'\)\)/);
    assert.match(ui, /import\('\.\/pkmn-randoms\.js'\)/, 'i generatori si scaricano solo qui');
    assert.match(ui, /Teams\.generate\(cpu\.random\.id\)/);
    assert.match(ui, /senzaAnteprima: true/);
    assert.match(ui, /Rematch · new random teams/);
    // le battaglie dei Random usano `global` (regola PotD di Showdown): nel browser va definito
    assert.match(leggi('docs/motore-battaglia.js'), /globalThis\.global = globalThis/);
    // nelle colonne dei player: caselle con il punto interrogativo finché i Pokémon non scendono in campo
    const extra = leggi('docs/battle-extra.js');
    assert.match(extra, /senzaAnteprima/);
    assert.match(extra, /ignoto: true/);
    assert.match(leggi('docs/style-battle.css'), /\.membro\.ignoto/);
});
