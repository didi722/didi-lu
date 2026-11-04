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
        if (v.tipo === 'campo') assert.ok(v.cond && ['meteo', 'terreno', 'campo', 'lato'].includes(v.dove) && v.turni > 0, v.id);
        else assert.ok(v.boost && Object.values(v.boost).every(n => n === 2), v.id);
    }
    assert.equal(P.perId('tailwind').turni, 3);
    assert.equal(P.perId('rain').turni, 5);
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
    // durata: Tailwind 3 turni, pioggia 5 (il meteo dura dal turno 1 fino al quinto compreso)
    const tail = await gioca('tailwind', G9, 4);
    assert.ok(tail.log.some(l => /\|-sideend\|p2: B\|move: Tailwind/.test(l)), 'Tailwind finisce');
    assert.ok(tail.log.findIndex(l => /\|-sideend/.test(l)) > 0);
    const pioggia = await gioca('rain', G9, 3);
    assert.ok(!pioggia.log.some(l => /\|-weather\|none/.test(l)), 'dopo 3 turni la pioggia c\'è ancora');
    assert.deepEqual(P.applica(null, 'rain'), { ok: false });
    assert.deepEqual(P.applica(att.battle, 'non-esiste'), { ok: false });
});

test('cablaggio: motore (vantaggio prima del turno 1), battle.html?cpu=1&palestra=…, tappa dal Box di chi la tiene, tasti sulla card e nel profilo, pagina di impostazione e sfida', () => {
    const mb = leggi('docs', 'motore-battaglia.js');
    assert.match(mb, /constructor\(\{ formato, p1, p2, vantaggio = null \}\)/);
    assert.match(mb, /if \(!fatto && this\.turn === 0\) \{/);
    assert.match(mb, /self\.Palestra\.applica\(this, v\.id, v\.lato \|\| 'p2'\)/);
    assert.match(mb, /if \(this\.vantaggio\) this\._preparaVantaggio\(flusso\.battle\);/);
    const bu = leggi('docs', 'battle-ui.js');
    assert.match(bu, /else if \(parametri\.get\('palestra'\)\) preparaPalestra\(parametri\.get\('palestra'\), parseInt\(parametri\.get\('tappa'\), 10\) \|\| 0, parametri\.get\('team'\)\);/);
    assert.match(bu, /vantaggio: cpu && cpu\.palestra && cpu\.palestra\.vantaggio \? \{ id: cpu\.palestra\.vantaggio\.id, lato: 'p2' \} : null/);
    assert.match(bu, /if \(cpu\.palestra\) return mostraFinePalestra\(vincitore\);/);
    assert.match(bu, /A defeat sends you back to the first stage: the gym starts over\./);
    assert.match(bu, /String\(dati\.categoria[^\n]*\) !== String\(gym\.categoria[^\n]*\)\) throw new Error\(`That team is not for/);
    assert.match(bu, /nomeTeam: 'Gym team'/, 'il team della palestra non si presenta col suo nome');
    assert.match(leggi('docs', 'battle.html'), /<script src="palestra\.js"><\/script>/);
    const ts = leggi('docs', 'team-sito.js');
    assert.match(ts, /export async function caricaTappaPalestra\(db, idGym, numeroTappa\)/);
    assert.match(ts, /players\/\$\{id\}\/info\/palestra/);
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
    assert.match(ui, /Challengers never see your teams/);
    assert.match(ui, /You don't know the gym's teams/);
    assert.match(ui, /battle\.html\?cpu=1&palestra=/);
    assert.match(leggi('docs', 'palestra.html'), /<script src="palestra\.js"><\/script>\s*<script src="palestra-ui\.js"><\/script>/);
    assert.match(leggi('docs', 'style-palestra.css'), /body\.pg-palestra \{ overflow-x: hidden; overflow-y: auto; \}/);
});
