'use strict';
// palestra.js: i vantaggi, le regole della configurazione, lo stato di chi sfida e l'applicazione al simulatore (quello vero, di docs/pkmn-sim.js); il cablaggio nelle pagine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const P = require('../docs/palestra.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const REG = {
    vgc9: { categoria: 'VGC Gen 9', strutturaSito: 'vgc', vgcFormat: 'doubles', vgcGen: 'Gen 9' },
    dou: { categoria: 'Doubles OU', battleStyle: 'doubles', genRuleValue: 9 },
    g8: { categoria: 'Gen 8 Doubles', battleStyle: 'doubles', genRuleValue: 8 },
    ou: { categoria: 'Singles OU', battleStyle: 'singles', genRuleValue: 9 },
    vgcs: { categoria: 'VGC Singles', strutturaSito: 'vgc', vgcFormat: 'singles', vgcGen: 'Gen 9' },
    rnd: { categoria: 'Random Doubles', battleStyle: 'doubles', genRuleValue: 9 },
    g2: { categoria: 'Gen 2 Doubles', battleStyle: 'doubles', genRuleValue: 2 },
    g5: { categoria: 'Gen 5 Doubles', battleStyle: 'doubles', genRuleValue: 5 }
};
const TEAMS = { A: { categoria: 'VGC Gen 9' }, B: { categoria: 'Doubles OU' }, C: { categoria: 'Gen 8 Doubles' }, D: { categoria: 'Singles OU' }, E: { categoria: 'Gen 5 Doubles' } };
const CONFIG = { tappe: [{ formato: 'dou', categoria: 'Doubles OU', team: 'B', vantaggio: 'rain' }, { formato: 'vgc9', categoria: 'VGC Gen 9', team: 'A', vantaggio: 'boost-att' }, { formato: 'g8', categoria: 'Gen 8 Doubles', team: 'C', vantaggio: 'tailwind' }] };

test('vantaggi: id unici, campo o boost, con la loro descrizione; quelli che esistono in una generazione', () => {
    assert.equal(new Set(P.VANTAGGI.map(v => v.id)).size, P.VANTAGGI.length);
    for (const v of P.VANTAGGI) {
        assert.ok(['campo', 'boost'].includes(v.tipo) && v.nome && v.descr, v.id);
        assert.ok(v.icona && v.annuncio && v.annuncio.length > 30, `${v.id}: icona e testo dell'annuncio`);
        if (v.tipo === 'campo') assert.ok(v.cond && ['meteo', 'terreno', 'campo', 'lato'].includes(v.dove) && v.turni === undefined, `${v.id}: dura tutta la partita, niente turni`);
        else assert.ok(v.boost && Object.values(v.boost).every(n => n === 2), v.id);
    }
    assert.deepEqual(P.condizioniFisse('tailwind'), ['tailwind']);
    assert.deepEqual(P.condizioniFisse('snow'), ['snowscape', 'hail']);
    assert.deepEqual(P.condizioniFisse('boost-att'), []);
    assert.equal(P.perId('boh'), null);
    const gen3 = P.vantaggiPer(3).map(v => v.id);
    assert.ok(gen3.includes('rain') && gen3.includes('boost-vel') && !gen3.includes('tailwind') && !gen3.includes('electric'));
    assert.ok(P.vantaggiPer(9).length === P.VANTAGGI.length);
});

test('eDoppio e generazione: solo i format in doppio (dalla Gen 3), niente singolo e niente Random', () => {
    assert.deepEqual(['vgc9', 'dou', 'g8', 'g5', 'ou', 'vgcs', 'rnd', 'g2'].filter(k => P.eDoppio(REG[k])), ['vgc9', 'dou', 'g8', 'g5']);
    assert.equal(P.generazioneDi(REG.vgc9), 9);
    assert.equal(P.generazioneDi(REG.g8), 8);
    assert.equal(P.generazioneDi({}), 9);
});

test('tappeDi: tre tappe in ordine, anche se Firebase dà un oggetto con chiavi numeriche', () => {
    assert.equal(P.tappeDi(CONFIG).length, 3);
    const oggetto = { tappe: { 0: CONFIG.tappe[0], 1: CONFIG.tappe[1], 2: CONFIG.tappe[2], 3: CONFIG.tappe[0] } };
    assert.deepEqual(P.tappeDi(oggetto).map(t => t.formato), ['dou', 'vgc9', 'g8'], 'al massimo tre');
    assert.deepEqual(P.tappeDi(null), []);
    assert.deepEqual(P.tappeDi({ tappe: [{ formato: 'x' }, null] }).length, 1);
});

test('problemi: tre format diversi e in doppio, un team del format dal Box, un vantaggio che esiste nella generazione', () => {
    const ok = P.problemi(CONFIG, { regolamenti: REG, teams: TEAMS });
    assert.deepEqual(ok, []);
    assert.equal(P.problemi({ tappe: CONFIG.tappe.slice(0, 2) }, { regolamenti: REG, teams: TEAMS }).length, 1, 'ne servono tre');
    const con = (i, cambio) => ({ tappe: CONFIG.tappe.map((t, k) => (k === i ? { ...t, ...cambio } : t)) });
    const p = c => P.problemi(c, { regolamenti: REG, teams: TEAMS });
    assert.match(p(con(0, { formato: 'ou' }))[0], /only doubles/);
    assert.match(p(con(1, { formato: 'dou' }))[0], /already in the gym/);
    assert.match(p(con(0, { team: 'A' }))[0], /not for this format/);
    assert.match(p(con(0, { team: 'zzz' }))[0], /pick a team/i);
    assert.match(p(con(0, { team: '' }))[0], /pick a team/i);
    assert.deepEqual(p(con(2, { vantaggio: 'electric' })), [], 'Electric Terrain in Gen 8 c\'è');
    assert.match(p(con(2, { formato: 'g5', team: 'E', vantaggio: 'electric' }))[0], /doesn't exist in this format's generation/, 'in Gen 5 no');
});

test('sfida: i progressi si avanzano di tappa in tappa e una sconfitta riparte da capo con gli stessi team; si salvano nel browser di chi sfida', () => {
    let s = P.nuovaSfida(['A', 'B', 'C', 'D']);
    assert.deepEqual(s, { squadre: ['A', 'B', 'C'], vinte: 0 });
    s = P.avanza(s); s = P.avanza(s);
    assert.equal(s.vinte, 2); assert.equal(P.finita(s), false);
    s = P.avanza(s); s = P.avanza(s);
    assert.equal(s.vinte, 3, 'non oltre la fine'); assert.equal(P.finita(s), true);
    assert.deepEqual(P.azzera(s), { squadre: ['A', 'B', 'C'], vinte: 0 });
    const memoria = {}; const storage = { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = v; } };
    const k = P.chiaveSfida(' Didi ', 'DODO');
    assert.equal(k, 'palestra:didi:dodo');
    assert.equal(P.leggiSfida(storage, k), null);
    P.salvaSfida(storage, k, { squadre: ['A', 'B', 'C'], vinte: 2 });
    assert.deepEqual(P.leggiSfida(storage, k), { squadre: ['A', 'B', 'C'], vinte: 2 });
    memoria[k] = '{rotto'; assert.equal(P.leggiSfida(storage, k), null);
    memoria[k] = JSON.stringify({ squadre: ['A'], vinte: 99 }); assert.equal(P.leggiSfida(storage, k).vinte, 3);
});

test('applica: nel simulatore vero gli effetti partono prima del turno 1 (meteo, terreni, Tailwind, Trick Room) e i boost vanno ai due Pokémon in campo della palestra; durata come promessa', async () => {
    const copia = path.join(os.tmpdir(), `pkmn-sim-palestra-${process.pid}.mjs`);
    fs.copyFileSync(path.join(__dirname, '..', 'docs', 'pkmn-sim.js'), copia);
    let sim;
    try { sim = await import(pathToFileURL(copia).href); } finally { fs.unlinkSync(copia); }
    const { BattleStreams, Teams } = sim;
    const team = Teams.pack(Teams.import('Garchomp @ Rocky Helmet\nAbility: Rough Skin\nLevel: 50\n- Protect\n- Earthquake\n\nIncineroar @ Safety Goggles\nAbility: Intimidate\nLevel: 50\n- Fake Out\n- Flare Blitz\n\nRillaboom\nAbility: Grassy Surge\n- Grassy Glide\n\nAmoonguss\n- Spore\n\nTornadus\n- Tailwind\n\nUrshifu\n- Close Combat'));
    async function gioca(vantaggio, formatid, turni = 0) {
        const flusso = new BattleStreams.BattleStream();
        const s = BattleStreams.getPlayerStreams(flusso);
        const log = []; (async () => { for await (const c of s.spectator) log.push(...c.split('\n')); })();
        for (const l of ['p1', 'p2']) (async () => { for await (const c of s[l]) { /* le richieste */ void c; } })();
        s.omniscient.write(`>start ${JSON.stringify({ formatid })}\n>player p1 ${JSON.stringify({ name: 'A', team })}\n>player p2 ${JSON.stringify({ name: 'B', team })}`);
        const originale = flusso.battle.endTurn.bind(flusso.battle); let esito;
        flusso.battle.endTurn = function () { if (this.turn === 0) esito = P.applica(this, vantaggio, 'p2'); return originale(); };
        s.p1.write('team 1234'); s.p2.write('team 1234');
        await new Promise(r => setTimeout(r, 150));
        for (let t = 0; t < turni; t++) { s.p1.write('default'); s.p2.write('default'); await new Promise(r => setTimeout(r, 100)); }
        return { esito, log, battle: flusso.battle };
    }
    const G9 = 'gen9doublescustomgame@@@Picked Team Size = 4';
    const prima = r => r.log.slice(0, r.log.findIndex(l => l.startsWith('|turn|1')));
    const casi = [['rain', /\|-weather\|RainDance/], ['sun', /\|-weather\|SunnyDay/], ['sand', /\|-weather\|Sandstorm/], ['snow', /\|-weather\|Snowscape/], ['electric', /\|-fieldstart\|move: Electric Terrain/],
        ['psychic', /\|-fieldstart\|move: Psychic Terrain/], ['trickroom', /\|-fieldstart\|move: Trick Room/], ['tailwind', /\|-sidestart\|p2: B\|move: Tailwind/]];
    for (const [id, re] of casi) {
        const r = await gioca(id, G9);
        assert.equal(r.esito.ok, true, id);
        assert.match(prima(r).join('\n'), re, `${id}: l'effetto esce prima del turno 1`);
    }
    // i boost: due Pokémon in campo della palestra, nessuno dello sfidante
    const att = await gioca('boost-att', G9);
    const righe = prima(att).filter(l => l.startsWith('|-boost|'));
    assert.deepEqual(righe.map(l => l.split('|').slice(2, 5).join(' ')).sort(), ['p2a: Garchomp atk 2', 'p2a: Garchomp spa 2', 'p2b: Incineroar atk 2', 'p2b: Incineroar spa 2']);
    assert.match(prima(await gioca('boost-vel', G9)).join('\n'), /\|-boost\|p2a: Garchomp\|spe\|2/);
    // Neve prima della Gen 9 è la Grandine; un effetto che non c'è in quella generazione non si applica
    assert.match(prima(await gioca('snow', 'gen8doublescustomgame@@@Picked Team Size = 4')).join('\n'), /\|-weather\|Hail/);
    const vecchia = await gioca('electric', 'gen5doublescustomgame@@@Picked Team Size = 4');
    assert.equal(vecchia.esito.ok, false);
    // dura tutta la partita: dopo molti turni Tailwind, pioggia e Trick Room ci sono ancora, e non finiscono mai
    const tail = await gioca('tailwind', G9, 6);
    assert.ok(!tail.log.some(l => /\|-sideend\|p2: B/.test(l)), 'Tailwind della palestra non finisce');
    assert.ok(tail.battle.sides[1].sideConditions.tailwind);
    const pioggia = await gioca('rain', G9, 8);
    assert.ok(!pioggia.log.some(l => /\|-weather\|none/.test(l)), 'la pioggia non finisce');
    assert.equal(pioggia.battle.field.weather, 'raindance');
    const stanza = await gioca('trickroom', G9, 8);
    assert.ok(stanza.battle.field.pseudoWeather.trickroom && !stanza.log.some(l => /\|-fieldend/.test(l)), 'Trick Room non finisce');
    assert.deepEqual(P.applica(null, 'rain'), { ok: false });
    assert.deepEqual(P.applica(att.battle, 'non-esiste'), { ok: false });
});

test('cablaggio: motore (vantaggio prima del turno 1), battle.html?cpu=1&palestra=…, tappa dal Box di chi la tiene, tasti sulla card e nel profilo, pagina di impostazione e sfida', () => {
    const mb = leggi('docs', 'motore-battaglia.js');
    assert.match(mb, /constructor\(\{ formato, p1, p2, vantaggio = null \}\)/);
    assert.match(mb, /if \(!fatto && this\.turn === 0\) \{/);
    assert.match(mb, /self\.Palestra\.applica\(this, v\.id, v\.lato \|\| 'p2', v\.nome \|\| ''\)/);
    assert.match(mb, /if \(this\.vantaggio\) this\._preparaVantaggio\(flusso\.battle\);/);
    const bu = leggi('docs', 'battle-ui.js');
    assert.match(bu, /else if \(parametri\.get\('palestra'\)\) preparaPalestra\(parametri\.get\('palestra'\), parseInt\(parametri\.get\('tappa'\), 10\) \|\| 0, parametri\.get\('team'\)\);/);
    assert.match(bu, /vantaggio: cpu && cpu\.palestra && cpu\.palestra\.vantaggio \? \{ id: cpu\.palestra\.vantaggio\.id, lato: 'p2', nome: cpu\.palestra\.nome \} : null/);
    assert.match(bu, /if \(cpu\.palestra\) return mostraFinePalestra\(vincitore\);/);
    assert.match(bu, /the challenge starts over from stage 1/, 'una sconfitta ricomincia da capo, con parole che incoraggiano');
    assert.ok(!/A defeat sends you back to the first stage/.test(bu), 'niente più il testo freddo di prima');
    assert.match(bu, /String\(dati\.categoria[^\n]*\) !== String\(gym\.categoria[^\n]*\)\) throw new Error\(`That team is not for/);
    assert.match(bu, /nomeTeam: `\$\{gym\.nome\}'s gym team`/, 'il team della palestra non si presenta col nome del team del Box');
    assert.match(leggi('docs', 'battle.html'), /<script src="palestra\.js"><\/script>/);
    const ts = leggi('docs', 'team-sito.js');
    assert.match(ts, /export async function caricaTappaPalestra\(db, idGym, numeroTappa\)/);
    assert.match(ts, /self\.Palestra\.tappeDi\(info\.palestra\)/, 'la configurazione della palestra viene da players/<id>/info');
    assert.match(ts, /players\/\$\{id\}\/teams\/\$\{tappa\.team\}/, 'il team segue il Box');
    const pc = leggi('docs', 'public-card.js');
    assert.match(pc, /function montaTastoPalestra\(mio, chiave\)/);
    assert.match(pc, /palestra\.html\?edit=1/);
    assert.match(pc, /palestra\.html\?player=\$\{encodeURIComponent\(chiave\)\}/);
    assert.match(pc, /if \(!mio && !pronta\) return;/, 'su un\'altra card il tasto c\'è solo se ha una palestra');
    assert.match(leggi('docs', 'public.html'), /<script src="palestra\.js"><\/script>\s*<script src="cosmetici\.js">/);
    assert.match(leggi('docs', 'profile.html'), /href="palestra\.html\?edit=1">Set up your gym<\/a>/);
    const ui = leggi('docs', 'palestra-ui.js');
    assert.match(ui, /players\/\$\{S\.io\}\/info\/palestra/);
    assert.match(ui, /Challengers never get to peek at your teams/);
    assert.match(ui, /against teams you've never seen/);
    assert.match(ui, /battle\.html\?cpu=1&palestra=/);
    // ingresso a passi: un format alla volta, poi il riepilogo; i team si scelgono con le carte dei propri team (con i Pokémon)
    assert.match(ui, /function passoIniziale\(\)/);
    assert.match(ui, /Next: stage \$\{i \+ 2\} →/);
    assert.match(ui, /class="pal-squadra\$\{S\.scelte\[i\] === x\.id \? ' pal-scelta' : ''\}"/);
    assert.match(ui, /SP\.riserva\(img, SP\.id\(img\.dataset\.pkm\)\)/, 'le GIF che mancano ripiegano sul Pokédex');
    assert.match(leggi('docs', 'palestra.html'), /<script src="sprites\/indice\.js"><\/script>\s*<script src="sprite-pkm\.js"><\/script>\s*<script src="palestra\.js">/);
    assert.match(leggi('docs', 'style-palestra.css'), /\.pal-passi \{/);
    // vantaggio di campo fisso: il campo mostra "all battle" invece dei turni
    assert.match(bu, /permanenti: cpu && cpu\.palestra \? self\.Palestra\.condizioniFisse\(cpu\.palestra\.vantaggio\) : \[\]/);
    assert.match(leggi('docs', 'battle-extra.js'), /S\.permanenti\.has\(idDi\(battle\.weather\)\) \? ALL_BATTLE/);
    assert.match(mb, /self\.Palestra\.proteggi\(battle, v\.id, v\.lato \|\| 'p2'\)/, 'la protezione dei boost parte prima dei Pokémon d\'apertura');
    assert.match(leggi('docs', 'palestra.html'), /<script src="palestra\.js"><\/script>\s*<script src="palestra-ui\.js"><\/script>/);
    assert.match(leggi('docs', 'style-palestra.css'), /body\.pg-palestra \{ overflow-x: hidden; overflow-y: auto; \}/);
});

test('annuncio: ogni vantaggio ha il suo testo (la neve diventa grandine prima della Gen 9) e il log lo scrive prima dell\'effetto', async () => {
    assert.match(P.testoAnnuncio('tailwind', 9), /tailwind/i);
    assert.match(P.testoAnnuncio('snow', 9), /blizzard/i);
    assert.match(P.testoAnnuncio('snow', 8), /hailstorm/i);
    assert.equal(P.testoAnnuncio('boh', 9), '');
    // nel simulatore vero: una riga |-message| con "GYM ADVANTAGE" subito prima dell'effetto, il nome della palestra ripulito dai separatori del protocollo
    const copia = path.join(os.tmpdir(), `pkmn-sim-annuncio-${process.pid}.mjs`);
    fs.copyFileSync(path.join(__dirname, '..', 'docs', 'pkmn-sim.js'), copia);
    try {
        const { BattleStreams, Teams } = await import(pathToFileURL(copia).href);
        const team = Teams.pack(Teams.import('Garchomp\nAbility: Rough Skin\nLevel: 50\n- Protect\n- Earthquake\n\nIncineroar\nAbility: Intimidate\nLevel: 50\n- Fake Out\n- Flare Blitz\n\nRillaboom\nLevel: 50\n- Fake Out\n- U-turn\n\nAmoonguss\nLevel: 50\n- Spore\n- Protect'));
        for (const [id, nome, effetto] of [['tailwind', "Dodo|'s\nclub", /\|-sidestart\|p2: B\|move: Tailwind/], ['boost-att', 'Dodo', /\|-boost\|p2a: Garchomp\|atk\|2/]]) {
            const flusso = new BattleStreams.BattleStream();
            const s = BattleStreams.getPlayerStreams(flusso);
            const log = []; (async () => { for await (const c of s.spectator) log.push(...c.split('\n')); })();
            for (const l of ['p1', 'p2']) (async () => { for await (const c of s[l]) void c; })();
            s.omniscient.write(`>start ${JSON.stringify({ formatid: 'gen9doublescustomgame@@@Picked Team Size = 4' })}\n>player p1 ${JSON.stringify({ name: 'A', team })}\n>player p2 ${JSON.stringify({ name: 'B', team })}`);
            const originale = flusso.battle.endTurn.bind(flusso.battle);
            flusso.battle.endTurn = function () { if (this.turn === 0) P.applica(this, id, 'p2', nome); return originale(); };
            s.p1.write('team 1234'); s.p2.write('team 1234');
            await new Promise(r => setTimeout(r, 150));
            const prima = log.slice(0, log.findIndex(l => l.startsWith('|turn|1')));
            const iMsg = prima.findIndex(l => l.startsWith('|-message|') && /GYM ADVANTAGE/.test(l));
            assert.ok(iMsg >= 0, `${id}: la riga dell'annuncio c'è`);
            assert.ok(iMsg < prima.findIndex(l => effetto.test(l)), `${id}: viene prima dell'effetto`);
            assert.equal(prima[iMsg].split('|').length, 3, 'il nome non rompe il protocollo (nessun | in più)');
            assert.match(prima[iMsg], /Dodo/);
            assert.match(prima[iMsg], new RegExp(P.perId(id).nome.replace(/[+&.]/g, '.')));
        }
    } finally { fs.unlinkSync(copia); }
});

test('tema: i colori e gli effetti della pagina del capopalestra, solo da liste ammesse', () => {
    const PP = require('../docs/pagina-pubblica.js'), C = require('../docs/cosmetici.js');
    const t = P.temaPalestra({ colore: '#3399FF', avatar: 'immagini/profile/7.png', aura: 'aura-oro', effettoNome: 'nome-neon', effettoPalco: 'palco-neve',
        pagina: { sfondo: { colore: '#17171C', motivo: 'stelle', forza: 3, scritta: true, animato: true } } }, PP, C);
    assert.equal(t.colore, '#3399ff');
    assert.deepEqual(t.aura, { id: 'aura-oro', colore: '#ffcc33' });
    assert.equal(t.effettoNome, 'nome-neon');
    assert.equal(t.effettoPalco, 'palco-neve');
    assert.equal(t.scritta, 'on');
    assert.equal(t.scorre, true, 'le stelle si ripetono: scorrono');
    assert.equal(t.variabili['--pp-sfondo'], '#17171c');
    assert.match(t.variabili['--pp-sfondo-img'], /^url\(/);
    for (const k of ['--pal-colore', '--pal-colore-ink', '--pal-cielo-a', '--pal-cielo-b', '--pal-pavimento-a', '--pal-pavimento-b', '--pp-font', '--pp-nome']) assert.ok(t.variabili[k], k);
    for (const k of ['--pal-cielo-a', '--pal-cielo-b', '--pal-pavimento-a', '--pal-pavimento-b']) assert.match(t.variabili[k], /^#[0-9a-f]{6}$/, k);
    // niente di strano dal database: un cosmetico che non esiste o di un altro tipo, colori e motivi fuori lista, tutto torna alle scelte sicure
    const sporco = P.temaPalestra({ colore: 'red; background:url(x)', avatar: 42, aura: 'palco-neve', effettoNome: 'aura-oro', effettoPalco: '"><img src=x>', pagina: { sfondo: { colore: 'expression(1)', motivo: '../../x', scritta: 1 } } }, PP, C);
    assert.equal(sporco.aura, null); assert.equal(sporco.effettoNome, null); assert.equal(sporco.effettoPalco, null); assert.equal(sporco.avatar, '');
    assert.match(sporco.colore, /^#[0-9a-f]{6}$/);
    for (const [k, v] of Object.entries(sporco.variabili)) assert.ok(!/[;<>"]|expression|url\(x/.test(v) || k === '--pp-sfondo-img', `${k}: ${v}`);
    // senza niente (un allenatore che non ha mai toccato la sua pagina): il suo colore con i puntini, come la sua pagina
    const vuoto = P.temaPalestra({ colore: '#FF7B6B' }, PP, C);
    assert.equal(vuoto.variabili['--pp-sfondo'], '#ff7b6b');
    assert.equal(vuoto.effettoPalco, null);
    // sfondo scuro: il muro non si schiarisce troppo, il pavimento è più scuro del muro
    const lum = h => PP.luminanza(h);
    assert.ok(lum(t.variabili['--pal-pavimento-b']) < lum(t.variabili['--pal-cielo-b']));
});

test('cablaggio del tema: pagina di battaglia, stili, vantaggio sempre in vista e cartello all\'ingresso e alla partenza', () => {
    const html = leggi('docs', 'battle.html');
    assert.match(html, /<link rel="stylesheet" href="style-battle\.css">\s*<link rel="stylesheet" href="effetti-pagina\.css">\s*<link rel="stylesheet" href="style-palestra-battaglia\.css">/, 'gli stili della palestra vengono dopo quelli della battaglia');
    assert.match(html, /<script src="cosmetici\.js"><\/script>\s*<script src="pagina-pubblica\.js"><\/script>/);
    assert.match(html, /id="pal-effetto"/); assert.match(html, /id="pal-annuncio"/);
    const bu = leggi('docs', 'battle-ui.js');
    assert.match(bu, /cpu\.palestra\.tema = vestiPalestra\(gym\);/);
    assert.match(bu, /self\.Palestra\.temaPalestra\(gym\.aspetto, self\.PaginaPubblica, self\.Cosmetici\)/);
    assert.match(bu, /document\.body\.classList\.add\('palestra'\)/);
    assert.match(bu, /voci = cpu && cpu\.palestra \? vociInsegnaPalestra\(\)/, 'l\'insegna mostra chi tiene la palestra e il vantaggio');
    assert.match(bu, /if \(cpu && cpu\.palestra\) mostraAnnuncioPalestra\(false\);/, 'cartello intero quando si entra');
    assert.ok(!/mostraAnnuncioPalestra\(true\)/.test(bu), 'il cartello non ricompare a inizio partita');
    assert.match(bu, /nome: cpu && cpu\.palestra \? config\.p2\.nome : 'CPU'/, 'nelle colonne l\'avversario è il capopalestra, non "CPU"');
    const ts = leggi('docs', 'team-sito.js');
    assert.match(ts, /players\/\$\{id\}\/info`/);
    assert.match(ts, /const aspetto = \{ colore: info\.color, avatar: info\.avatar, pagina: info\.pagina, aura: info\.aura, effettoNome: info\.effettoNome, effettoPalco: info\.effettoPalco \};/);
    const css = leggi('docs', 'style-palestra-battaglia.css');
    for (const re of [/body\.palestra \{ background: var\(--pp-sfondo\); \}/, /body\.palestra \.cab-insegna/, /\.pal-annuncio \{/, /\.ins-vantaggio \{/, /\.pal-effetto \{/, /prefers-reduced-motion/, /max-width: 720px/]) assert.match(css, re);
    // il nero ha ombre scure semitrasparenti (regola del sito)
    assert.match(css, /\.pal-annuncio \{[^}]*box-shadow: 8px 8px 0 rgba\(0, 0, 0, \.55\)/);
});

test('permanente: meteo, terreno, Trick Room e Tailwind non si tolgono né si sostituiscono; Intimidate non abbassa i boost (le mosse sì)', async () => {
    const copia = path.join(os.tmpdir(), `pkmn-sim-perm-${process.pid}.mjs`);
    fs.copyFileSync(path.join(__dirname, '..', 'docs', 'pkmn-sim.js'), copia);
    try {
        const { BattleStreams, Teams } = await import(pathToFileURL(copia).href);
        const mk = t => Teams.pack(Teams.import(t));
        const gym = mk('Snorlax\nLevel: 50\n- Protect\n- Splash\n\nBlissey\nLevel: 50\n- Protect\n- Splash\n\nChansey\nLevel: 50\n- Protect\n- Splash\n\nMunchlax\nLevel: 50\n- Protect\n- Splash');
        const sfid = mk('Pelipper\nAbility: Drizzle\nLevel: 50\n- Trick Room\n- Tailwind\n- Sunny Day\n- Splash\n\nIncineroar\nAbility: Intimidate\nLevel: 50\n- Parting Shot\n- Splash\n\nIndeedee-F\nAbility: Psychic Surge\nLevel: 50\n- Protect\n- Splash\n\nTornadus\nLevel: 50\n- Protect\n- Splash');
        const sfid2 = mk('Indeedee-F\nAbility: Psychic Surge\nLevel: 50\n- Protect\n- Splash\n\nIncineroar\nAbility: Intimidate\nLevel: 50\n- Parting Shot\n- Splash\n\nPelipper\nLevel: 50\n- Protect\n- Splash\n\nTornadus\nLevel: 50\n- Protect\n- Splash');
        async function gioca(vantaggio, squadra, mosse) {
            const flusso = new BattleStreams.BattleStream();
            const s = BattleStreams.getPlayerStreams(flusso);
            const log = []; (async () => { for await (const c of s.spectator) log.push(...c.split('\n')); })();
            for (const l of ['p1', 'p2']) (async () => { for await (const c of s[l]) void c; })();
            s.omniscient.write(`>start ${JSON.stringify({ formatid: 'gen9doublescustomgame@@@Picked Team Size = 4' })}\n>player p1 ${JSON.stringify({ name: 'A', team: squadra })}\n>player p2 ${JSON.stringify({ name: 'B', team: gym })}`);
            P.proteggi(flusso.battle, vantaggio, 'p2');
            const originale = flusso.battle.endTurn.bind(flusso.battle);
            flusso.battle.endTurn = function () { if (this.turn === 0) P.applica(this, vantaggio, 'p2'); return originale(); };
            s.p1.write('team 1234'); s.p2.write('team 1234');
            await new Promise(r => setTimeout(r, 200));
            for (const m of mosse) { s.p1.write(m); s.p2.write('move 2, move 2'); await new Promise(r => setTimeout(r, 120)); }
            return { log, battle: flusso.battle };
        }
        // Pelipper (Drizzle) e Sunny Day non tolgono il sole
        let r = await gioca('sun', sfid, ['move 3, move 2', 'move 3, move 2']);
        assert.equal(r.battle.field.weather, 'sunnyday');
        // un altro Trick Room non annulla quello della palestra
        r = await gioca('trickroom', sfid, ['move 1, move 2', 'move 1, move 2']);
        assert.ok(r.battle.field.pseudoWeather.trickroom);
        assert.ok(!r.log.some(l => /\|-fieldend/.test(l)));
        // Psychic Surge non toglie il campo erboso
        r = await gioca('grassy', sfid2, ['move 2, move 2']);
        assert.equal(r.battle.field.terrain, 'grassyterrain');
        // Intimidate (abilità) non abbassa l'attacco, nemmeno quando entra prima che il vantaggio parta; Parting Shot (mossa) sì
        r = await gioca('boost-att', sfid2, ['move 2, move 2']);
        assert.deepEqual(r.battle.sides[1].active.map(p => [p.boosts.atk, p.boosts.spa]), [[2, 2], [2, 2]]);
        assert.ok(r.log.some(l => /can't be shaken by abilities/.test(l)));
        r = await gioca('boost-att', sfid2, ['move 2, move 1 1', 'move 2, move 1 1']);
        assert.ok(r.log.some(l => /\|-unboost\|p2a: Snorlax\|atk\|1/.test(l)), 'Parting Shot abbassa');
        assert.deepEqual(r.battle.sides[1].active[0].boosts.atk, 1);
    } finally { fs.unlinkSync(copia); }
});
