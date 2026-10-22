'use strict';
// Le partite amichevoli, lato server (functions/partita.js): sfidare un altro giocatore fuori dalle stagioni.
//   - la sfida (formato dell'elenco, formato Random o modalità libera) si valida, si accetta, si rifiuta, si ritira, scade;
//   - la partita usa la stessa macchina di quelle ufficiali (lobby, set, richieste private) ma NON salva nulla:
//     niente replay, niente statistiche, niente match in una stagione, niente storico; finita, cancella i team e le scelte;
//   - nei Random i team li compone Showdown (nuovi a ogni set); in modalità libera tutti i Pokémon sono a livello 50
//     e si gioca nella generazione più recente tra i due team.
//   - le serie sono una partita sola o al meglio dei 3, 5, 7; i team sono fissi o cambiabili dopo ogni set (stato "tra_set");
//   - a fine partita si può offrire la rivincita: una sfida nuova con lo stesso avversario e formato;
//   - un formato Random può essere anche la categoria di uno showdown di stagione: nessun team, team nuovi a ogni set.
// Il server gira qui con il simulatore del sito al posto del pacchetto "pokemon-showdown" e con un database finto in memoria.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { caricaRandoms, creaCasuale } = require('./ayuda-sim.js');
const { creaDb } = require('./db-finto.js');

// I semi della casualità (battaglie e team Random) li dà il server con PRNG.generateSeed(): qui sono sempre gli stessi, in ordine,
// così ogni prova è ripetibile. creaCasa() riparte da capo.
let contatoreSemi = 0;
let sim = null;

let server = null;
async function caricaServer() {
    if (!server) {
        ({ sim } = await caricaRandoms());
        sim.PRNG.generateSeed = () => [++contatoreSemi, 7, 11, 13];
        const originale = Module._load;
        Module._load = function (richiesta, ...resto) {
            if (richiesta === 'pokemon-showdown') return sim;
            return originale.call(this, richiesta, ...resto);
        };
        try { server = require('../functions/partita.js'); } finally { Module._load = originale; }
    }
    return server;
}

// Team di soli attaccanti (niente cure, niente Protezione): le partite a scelte casuali finiscono in pochi turni
const GARCHOMP = `Garchomp @ Life Orb
Ability: Rough Skin
Level: 100
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Outrage
- Swords Dance
- Stone Edge

Rotom-Wash @ Choice Specs
Ability: Levitate
Level: 100
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Hydro Pump
- Volt Switch
- Thunderbolt
- Shadow Ball

Dragapult @ Choice Band
Ability: Clear Body
Level: 100
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Dragon Darts
- Phantom Force
- U-turn
- Sucker Punch

Kingambit @ Black Glasses
Ability: Defiant
Level: 100
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Kowtow Cleave
- Iron Head
- Sucker Punch
- Swords Dance`;

const GEN4 = `Garchomp @ Choice Band
Ability: Sand Veil
Level: 100
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Outrage
- Stone Edge
- Fire Fang

Gengar @ Life Orb
Ability: Levitate
Level: 100
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Shadow Ball
- Focus Blast
- Thunderbolt
- Explosion

Tyranitar @ Choice Band
Ability: Sand Stream
Level: 100
EVs: 252 HP / 252 Atk / 4 SpD
Adamant Nature
- Crunch
- Stone Edge
- Pursuit
- Superpower

Salamence @ Life Orb
Ability: Intimidate
Level: 100
EVs: 252 Atk / 4 SpD / 252 Spe
Naive Nature
- Outrage
- Fire Blast
- Earthquake
- Hidden Power`;

const REGOLAMENTI = {
    r1: { categoria: 'OU', strutturaSito: 'custom', genRuleType: 'up_to', genRuleValue: '9', baseTier: 'OU', battleStyle: 'singles' },
    r2: { categoria: 'Random Gen 9', strutturaSito: 'random', formatoSimulatore: 'gen9randombattle', genRuleType: 'within', genRuleValue: '9', battleStyle: 'singles', generationalMechanics: true },
    r3: { categoria: 'Random Doubles', strutturaSito: 'random', formatoSimulatore: 'gen9randomdoublesbattle', genRuleType: 'within', genRuleValue: '9', battleStyle: 'doubles', generationalMechanics: true },
    r4: { categoria: 'Old OU', strutturaSito: 'custom', genRuleType: 'within', genRuleValue: '4', baseTier: 'OU', battleStyle: 'singles' }
};

function mondo(extra = {}) {
    return {
        users: { u1: { name: 'Didi' }, u2: { name: 'Lu' }, u3: { name: 'Terzo' } },
        regolamenti: REGOLAMENTI,
        players: {
            didi: { teams: { t1: { nome: 'Didi OU', categoria: 'OU', testoShowdown: GARCHOMP }, t2: { nome: 'Didi vecchio', categoria: 'Old OU', testoShowdown: GEN4 } } },
            lu: { teams: { t1: { nome: 'Lu OU', categoria: 'OU', testoShowdown: GARCHOMP }, t2: { nome: 'Lu vecchio', categoria: 'Old OU', testoShowdown: GEN4 } } },
            terzo: { teams: {} }
        },
        ...extra
    };
}

async function creaCasa(dati = mondo(), { ora } = {}) {
    const P = await caricaServer();
    contatoreSemi = 0;
    const db = creaDb(dati);
    const effetti = { replay: [], registrati: [] };
    let t = 1_700_000_000_000;
    const servizio = P.creaServizio({
        db,
        salvaReplay: async (percorso) => { effetti.replay.push(percorso); return 'https://replay.test/x'; },
        registraRisultato: async r => { effetti.registrati.push(r); },
        segreto: 'segreto-di-prova',
        sito: 'https://esempio.test',
        ora: ora || (() => t)
    });
    return { P, db, servizio, effetti, avanza: ms => { t += ms; }, adesso: () => t };
}

// Una scelta decisa: sempre la mossa più forte, mai un cambio se non è obbligato. Le partite finiscono in fretta
// (a scelte casuali, con i team Random, durerebbero a lungo: il server rigioca tutta la battaglia a ogni scelta)
function sceltaDecisa(richiesta) {
    const squadra = richiesta.side.pokemon;
    if (richiesta.teamPreview) {
        const n = richiesta.maxChosenTeamSize || squadra.length;
        return 'team ' + squadra.map((_, i) => i + 1).slice(0, n).join('');
    }
    const usati = new Set();
    if (richiesta.forceSwitch) {
        return richiesta.forceSwitch.map(deve => {
            if (!deve) return 'pass';
            const i = squadra.findIndex((p, k) => !p.active && !p.condition.endsWith(' fnt') && !usati.has(k));
            if (i < 0) return 'pass';
            usati.add(i);
            return `switch ${i + 1}`;
        }).join(', ');
    }
    const doppio = richiesta.active.length > 1;
    return richiesta.active.map((a, slot) => {
        if (squadra[slot].condition.endsWith(' fnt') || squadra[slot].commanding) return 'pass';
        const mosse = a.moves.map((m, j) => ({ m, j, forza: sim.Dex.moves.get(m.id || m.move).basePower || 0 })).filter(x => !x.m.disabled && x.m.pp !== 0);
        if (!mosse.length) return 'move 1';
        mosse.sort((x, y) => y.forza - x.forza);
        const { m, j } = mosse[0];
        let bersaglio = '';
        if (doppio && ['normal', 'any', 'adjacentFoe'].includes(m.target)) bersaglio = ' 1';
        else if (doppio && m.target === 'adjacentAlly') bersaglio = ` ${-(slot === 0 ? 2 : 1)}`;
        else if (doppio && m.target === 'adjacentAllyOrSelf') bersaglio = ` ${-(slot + 1)}`;
        return `move ${j + 1}${bersaglio}`;
    }).join(', ');
}

// Gioca la partita fino in fondo con scelte decise. Restituisce il numero di scelte inviate.
async function giocaFinoInFondo(servizio, db, idPartita, uids, { massimo = 600 } = {}) {
    let inviate = 0;
    for (let giro = 0; giro < massimo; giro++) {
        const stato = db.leggi(`partite/${idPartita}/stato`);
        if (stato !== 'in_corso') return { inviate, stato };
        let mosso = false;
        for (const lato of ['p1', 'p2']) {
            const r = db.leggi(`partite/${idPartita}/privato/${lato}/richiesta`);
            if (!r) continue;
            if (db.leggi(`partite/${idPartita}/haScelto/${lato}`) === r.passo) continue;
            const richiesta = JSON.parse(r.json);
            if (richiesta.wait) continue;
            const scelta = sceltaDecisa(richiesta);
            await servizio.inviaScelta(uids[lato], { id: idPartita, passo: r.passo, scelta });
            inviate++;
            mosso = true;
        }
        if (!mosso) return { inviate, stato: db.leggi(`partite/${idPartita}/stato`), fermo: true };
    }
    return { inviate, stato: db.leggi(`partite/${idPartita}/stato`), troppoLunga: true };
}

const rifiutata = async (promessa, testo) => {
    await assert.rejects(promessa, e => {
        assert.equal(e.constructor.name, 'ErroreUtente', String(e && e.stack));
        if (testo) assert.match(e.message, testo);
        return true;
    });
};

// ---------- lanciare la sfida ----------
test('sfidaAmichevole: una sfida su un formato dell\'elenco nasce in attesa, con tutto quello che serve a chi risponde', async () => {
    const { db, servizio } = await creaCasa();
    const r = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 3 });
    assert.equal(r.ok, true);
    const s = db.leggi(`sfide/amichevoli/${r.id}`);
    assert.deepEqual(
        { ...s, creata: typeof s.creata },
        { da: 'Didi', daId: 'didi', daUid: 'u1', a: 'Lu', aId: 'lu', aUid: 'u2', tipo: 'formato', libera: false, random: false,
            categoria: 'OU', stile: 'singles', bestOf: 3, cambioTeam: false, stato: 'in_attesa', creata: 'number' });
});

test('sfidaAmichevole: il nome dell\'avversario non conta maiuscole e spazi', async () => {
    const { db, servizio } = await creaCasa();
    const r = await servizio.sfidaAmichevole('u1', { a: '  lU ', tipo: 'formato', categoria: 'ou', bestOf: 5 });
    const s = db.leggi(`sfide/amichevoli/${r.id}`);
    assert.equal(s.a, 'Lu');
    assert.equal(s.categoria, 'OU', 'il nome del formato è quello del database');
});

test('sfidaAmichevole: la serie è una partita sola o al meglio dei 3, 5, 7 (qualunque altra richiesta vale una partita sola)', async () => {
    for (const [chiesta, attesa] of [[1, 1], [3, 3], [5, 5], [7, 7], ['5', 5], [2, 1], [4, 1], [9, 1], [0, 1], [undefined, 1], ['boh', 1], [-3, 1]]) {
        const { db, servizio } = await creaCasa();
        const r = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: chiesta });
        assert.equal(db.leggi(`sfide/amichevoli/${r.id}/bestOf`), attesa, `bestOf ${chiesta}`);
    }
});

test('sfidaAmichevole: i team cambiabili tra i set valgono solo in una serie, e mai nei Random (lì cambiano comunque da soli)', async () => {
    const chiedi = async (sfida) => {
        const { db, servizio } = await creaCasa();
        const r = await servizio.sfidaAmichevole('u1', { a: 'Lu', ...sfida });
        const s = db.leggi(`sfide/amichevoli/${r.id}`);
        const { partita } = await servizio.rispondiAmichevole('u2', { id: r.id, risposta: 'accetta' });
        return { sfida: s.cambioTeam, partita: db.leggi(`partite/${partita}/info/cambioTeam`) };
    };
    assert.deepEqual(await chiedi({ tipo: 'formato', categoria: 'OU', bestOf: 3, cambioTeam: true }), { sfida: true, partita: true });
    assert.deepEqual(await chiedi({ tipo: 'formato', categoria: 'OU', bestOf: 5 }), { sfida: false, partita: false }, 'di norma i team sono fissi');
    assert.deepEqual(await chiedi({ tipo: 'formato', categoria: 'OU', bestOf: 1, cambioTeam: true }), { sfida: false, partita: false }, 'una partita sola: niente da cambiare');
    assert.deepEqual(await chiedi({ tipo: 'formato', categoria: 'Random Gen 9', bestOf: 3, cambioTeam: true }), { sfida: false, partita: false }, 'i Random cambiano sempre da soli');
    assert.deepEqual(await chiedi({ tipo: 'libera', bestOf: 7, cambioTeam: true }), { sfida: true, partita: true });
    assert.deepEqual(await chiedi({ tipo: 'formato', categoria: 'OU', bestOf: 3, cambioTeam: 'si' }), { sfida: false, partita: false }, 'solo un vero "true"');
});

test('sfidaAmichevole: no a se stessi, a chi non esiste, a un formato che non c\'è, a un tipo sconosciuto', async () => {
    const { servizio } = await creaCasa();
    await rifiutata(servizio.sfidaAmichevole('u1', { a: 'Didi', tipo: 'libera' }), /yourself/);
    await rifiutata(servizio.sfidaAmichevole('u1', { a: 'Nessuno', tipo: 'libera' }), /not found/);
    await rifiutata(servizio.sfidaAmichevole('u1', { a: '', tipo: 'libera' }), /Choose a trainer/);
    await rifiutata(servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'Inesistente' }), /not found/);
    await rifiutata(servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'boh' }), /format/i);
    await rifiutata(servizio.sfidaAmichevole('uX', { a: 'Lu', tipo: 'libera' }), /no name/);
});

test('sfidaAmichevole: chi sfida deve avere un team utilizzabile (non nei Random, dove li dà Showdown)', async () => {
    const { servizio } = await creaCasa();
    await rifiutata(servizio.sfidaAmichevole('u3', { a: 'Lu', tipo: 'formato', categoria: 'OU' }), /no usable team for OU/);
    await rifiutata(servizio.sfidaAmichevole('u3', { a: 'Lu', tipo: 'libera' }), /no usable team/);
    const r = await servizio.sfidaAmichevole('u3', { a: 'Lu', tipo: 'formato', categoria: 'Random Gen 9' });
    assert.equal(r.ok, true, 'senza team si può sfidare in un Random');
});

test('sfidaAmichevole: un team non conforme al formato non conta', async () => {
    const storto = mondo();
    storto.players.didi.teams = { t1: { nome: 'Sbagliato', categoria: 'OU', testoShowdown: 'Garchomp\nAbility: Rough Skin\nLevel: 50\n- Earthquake' } };
    const { servizio } = await creaCasa(storto);
    await rifiutata(servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'OU' }), /no usable team for OU/);
});

test('sfidaAmichevole: una sola sfida in attesa per coppia (in qualunque direzione) e al massimo cinque per sfidante', async () => {
    const { servizio } = await creaCasa();
    await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'OU' });
    await rifiutata(servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'libera' }), /already a pending/);
    await rifiutata(servizio.sfidaAmichevole('u2', { a: 'Didi', tipo: 'libera' }), /already a pending/);

    const molti = mondo();
    for (let i = 0; i < 6; i++) molti.users[`x${i}`] = { name: `Altro${i}` };
    const { servizio: s2 } = await creaCasa(molti);
    for (let i = 0; i < 5; i++) await s2.sfidaAmichevole('u1', { a: `Altro${i}`, tipo: 'formato', categoria: 'Random Gen 9' });
    await rifiutata(s2.sfidaAmichevole('u1', { a: 'Altro5', tipo: 'formato', categoria: 'Random Gen 9' }), /too many/);
});

test('sfidaAmichevole: la modalità libera ricorda lo stile (singolo o doppio) e si chiama "Free battle"', async () => {
    const { db, servizio } = await creaCasa();
    const r = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'libera', stile: 'doubles' });
    const s = db.leggi(`sfide/amichevoli/${r.id}`);
    assert.equal(s.libera, true);
    assert.equal(s.stile, 'doubles');
    assert.equal(s.categoria, 'Free battle');
});

// ---------- rispondere ----------
test('rispondiAmichevole: rifiutare e ritirare; solo chi deve', async () => {
    const { db, servizio } = await creaCasa();
    const a = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'libera' });
    await rifiutata(servizio.rispondiAmichevole('u2', { id: a.id, risposta: 'ritira' }), /Only who sent/);
    await rifiutata(servizio.rispondiAmichevole('u1', { id: a.id, risposta: 'rifiuta' }), /not for you/);
    await rifiutata(servizio.rispondiAmichevole('u3', { id: a.id, risposta: 'accetta' }), /not for you/);
    await servizio.rispondiAmichevole('u2', { id: a.id, risposta: 'rifiuta' });
    assert.equal(db.leggi(`sfide/amichevoli/${a.id}/stato`), 'rifiutata');
    await rifiutata(servizio.rispondiAmichevole('u2', { id: a.id, risposta: 'accetta' }), /no longer available/);

    const b = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'libera' });
    await servizio.rispondiAmichevole('u1', { id: b.id, risposta: 'ritira' });
    assert.equal(db.leggi(`sfide/amichevoli/${b.id}/stato`), 'annullata');
    await rifiutata(servizio.rispondiAmichevole('u2', { id: b.id, risposta: 'rifiuta' }), /already answered/);
    await rifiutata(servizio.rispondiAmichevole('u2', { id: 'non-esiste', risposta: 'rifiuta' }), /no longer exists/);
    await rifiutata(servizio.rispondiAmichevole('u2', { id: 'a/b', risposta: 'rifiuta' }), /Invalid/);
});

test('rispondiAmichevole: accettare crea la partita in lobby, con le regole della sfida, e non la crea due volte', async () => {
    const { db, servizio } = await creaCasa();
    const s = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 3 });
    assert.equal((await servizio.apriPartita('u2', { amichevole: s.id }).catch(e => e.message)), 'This friendly match is not available (not accepted yet, or too old)');
    const r = await servizio.rispondiAmichevole('u2', { id: s.id, risposta: 'accetta' });
    assert.equal(r.partita, `amichevole__${s.id}`);
    const sfida = db.leggi(`sfide/amichevoli/${s.id}`);
    assert.equal(sfida.stato, 'accettata');
    assert.equal(sfida.partita, r.partita);
    assert.equal(db.leggi(`partite/${r.partita}/stato`), 'lobby');
    const info = db.leggi(`partite/${r.partita}/info`);
    assert.equal(info.amichevole, true);
    assert.equal(info.categoria, 'OU');
    assert.equal(info.bestOf, 3);
    assert.equal(info.livello, 100);
    assert.match(info.formato, /^gen9customgame@@@/);
    assert.deepEqual(info.p1, { nome: 'Didi', id: 'didi', uid: 'u1' });
    assert.deepEqual(info.p2, { nome: 'Lu', id: 'lu', uid: 'u2' });
    // riaccettare riapre la stessa partita, senza ricrearla
    const scrittePrima = db.scritture.length;
    const ancora = await servizio.rispondiAmichevole('u2', { id: s.id, risposta: 'accetta' });
    assert.equal(ancora.partita, r.partita);
    assert.equal(db.scritture.length, scrittePrima);
});

test('rispondiAmichevole: chi accetta deve avere un team utilizzabile; una sfida scaduta non si accetta', async () => {
    const { db, servizio } = await creaCasa();
    const s = await servizio.sfidaAmichevole('u1', { a: 'Terzo', tipo: 'formato', categoria: 'OU' });
    await rifiutata(servizio.rispondiAmichevole('u3', { id: s.id, risposta: 'accetta' }), /no usable team for OU/);
    assert.equal(db.leggi(`sfide/amichevoli/${s.id}/stato`), 'in_attesa', 'resta in attesa: può costruire il team e poi accettare');

    const casa = await creaCasa();
    const v = await casa.servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'libera' });
    casa.avanza(25 * 3600 * 1000);
    await rifiutata(casa.servizio.rispondiAmichevole('u2', { id: v.id, risposta: 'accetta' }), /expired/);
    assert.equal(casa.db.leggi(`sfide/amichevoli/${v.id}/stato`), 'scaduta');
});

test('apriPartita con { amichevole }: chi gioca ha il suo lato, chi guarda no; senza sfida accettata si rifiuta', async () => {
    const { servizio } = await creaCasa();
    const s = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'Random Gen 9' });
    const { partita } = await servizio.rispondiAmichevole('u2', { id: s.id, risposta: 'accetta' });
    const mia = await servizio.apriPartita('u1', { amichevole: s.id });
    assert.equal(mia.id, partita);
    assert.equal(mia.lato, 'p1');
    assert.equal(mia.giaSalvato, false);
    assert.equal((await servizio.apriPartita('u2', { amichevole: s.id })).lato, 'p2');
    assert.equal((await servizio.apriPartita('u3', { amichevole: s.id })).lato, null, 'chi guarda');
    await rifiutata(servizio.apriPartita('u1', { amichevole: 'non-esiste' }), /not available/);
    await rifiutata(servizio.apriPartita('u1', { amichevole: 'a b' }), /Invalid/);
});

// ---------- la partita ----------
async function avviaPartita(casa, sfida, scelte) {
    const { servizio, db } = casa;
    const s = await servizio.sfidaAmichevole('u1', sfida);
    const { partita } = await servizio.rispondiAmichevole('u2', { id: s.id, risposta: 'accetta' });
    for (const [uid, params] of scelte) await servizio.pronto(uid, { id: partita, ...params });
    return { id: s.id, partita, db };
}

test('formato dell\'elenco: lobby, team scelti, partita fino in fondo, e NIENTE salvato (replay, statistiche, stagioni, storico)', async () => {
    const casa = await creaCasa();
    const { servizio, db, effetti } = casa;
    const { id, partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 1 }, []);

    // un team di un altro formato, o che non esiste, non si può portare
    await rifiutata(servizio.pronto('u1', { id: partita, team: 'Didi vecchio' }), /not one of your OU teams/);
    await rifiutata(servizio.pronto('u1', { id: partita, team: 'Boh' }), /not one of your OU teams/);
    await rifiutata(servizio.pronto('u3', { id: partita, team: 'Boh' }), /Non sei uno dei due/);

    await servizio.pronto('u1', { id: partita, team: 'Didi OU' });
    assert.equal(db.leggi(`partite/${partita}/stato`), 'lobby');
    assert.equal(db.leggi(`partite/${partita}/pronti/p1`), true);
    // il team scelto sta solo sul server
    assert.equal(db.leggi(`partiteServer/${partita}/team/p1/nome`), 'Didi OU');
    assert.equal(JSON.stringify(db.leggi(`partite/${partita}`)).includes('Garchomp'), false, 'il team non si vede nella parte pubblica');

    // si può ritirare il "pronto"
    await servizio.pronto('u1', { id: partita, team: null });
    assert.equal(db.leggi(`partite/${partita}/pronti/p1`), false);
    await servizio.pronto('u1', { id: partita, team: 'Didi OU' });
    await servizio.pronto('u2', { id: partita, team: 'Lu OU' });

    assert.equal(db.leggi(`partite/${partita}/stato`), 'in_corso');
    assert.deepEqual(db.leggi(`partite/${partita}/team`), { p1: 'Didi OU', p2: 'Lu OU' });
    assert.equal(db.leggi(`partite/${partita}/setCorrente`), 1);
    assert.ok(db.leggi(`partite/${partita}/privato/p1/richiesta`), 'la prima richiesta (anteprima squadre) è pronta');

    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' });
    assert.equal(fine.stato, 'conclusa', JSON.stringify(fine));
    const risultati = db.leggi(`partite/${partita}/risultati`);
    assert.deepEqual(Object.keys(risultati), ['set1']);
    assert.ok(risultati.set1.vincitore === 'p1' || risultati.set1.vincitore === 'p2');
    assert.ok(risultati.set1.turni >= 1);
    assert.equal('url' in risultati.set1 || 'stats' in risultati.set1, false, 'niente replay né statistiche');

    // niente salvato da nessuna parte
    assert.deepEqual(effetti.replay, [], 'nessun replay');
    assert.deepEqual(effetti.registrati, [], 'nessun match registrato');
    const toccati = new Set(db.scritture.map(p => p.split('/')[0]));
    assert.deepEqual([...toccati].sort(), ['partite', 'partiteServer', 'sfide'], `solo i dati della partita: ${[...toccati]}`);
    assert.equal(db.leggi('seasons'), null);
    assert.equal(db.leggi('players/didi/stats'), null);
    assert.equal(db.leggi('players/lu/stats'), null);
    assert.equal(db.leggi(`partiteServer/${partita}`), null, 'a fine partita i team e le scelte spariscono dal server');
    assert.equal(db.leggi(`sfide/amichevoli/${id}/stato`), 'conclusa');
});

test('al meglio dei 3: si ferma appena uno arriva a 2 set (niente terzo set inutile) e i team restano gli stessi', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 3 },
        [['u1', { team: 'Didi OU' }], ['u2', { team: 'Lu OU' }]]);
    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' }, { massimo: 1500 });
    assert.equal(fine.stato, 'conclusa', JSON.stringify(fine));
    const r = db.leggi(`partite/${partita}/risultati`);
    const vittorie = { p1: 0, p2: 0 };
    Object.values(r).forEach(x => { vittorie[x.vincitore]++; });
    assert.ok(Math.max(vittorie.p1, vittorie.p2) === 2, JSON.stringify(r));
    assert.ok(Object.keys(r).length === 2 || Object.keys(r).length === 3);
    if (Object.keys(r).length === 2) assert.ok(vittorie.p1 === 2 || vittorie.p2 === 2, 'chi vince i primi due set chiude');
});

test('formato Random: nessun team da scegliere, Showdown li dà a entrambi, nuovi a ogni set, e si gioca fino in fondo', async () => {
    const casa = await creaCasa();
    const { servizio, db, effetti } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'Random Gen 9', bestOf: 3 }, []);
    const info = db.leggi(`partite/${partita}/info`);
    assert.equal(info.random, true);
    assert.equal(info.formato, 'gen9randombattle', 'il Random Battle di Showdown com\'è, senza regole del sito');

    await rifiutata(servizio.pronto('u3', { id: partita, pronto: true }), /Non sei uno dei due/);
    await servizio.pronto('u1', { id: partita, pronto: true });
    await servizio.pronto('u1', { id: partita, pronto: false });
    assert.equal(db.leggi(`partite/${partita}/pronti/p1`), false);
    await servizio.pronto('u1', { id: partita, pronto: true });
    assert.equal(db.leggi(`partite/${partita}/stato`), 'lobby');
    await servizio.pronto('u2', { id: partita, pronto: true });
    assert.equal(db.leggi(`partite/${partita}/stato`), 'in_corso');

    const squadre = [];
    const ascolta = () => { const t = db.leggi(`partiteServer/${partita}/team`); if (t) squadre.push(`${t.p1.packed}#${t.p2.packed}`); };
    ascolta();
    assert.ok(squadre[0] && squadre[0].split('#').every(p => p.split(']').length === 6), 'sei Pokémon per squadra');
    assert.notEqual(squadre[0].split('#')[0], squadre[0].split('#')[1], 'i due team sono diversi');

    // prima richiesta: niente anteprima squadre nel Random Battle, si scende subito in campo
    const prima = JSON.parse(db.leggi(`partite/${partita}/privato/p1/richiesta`).json);
    assert.ok(!prima.teamPreview, 'il Random Battle non ha anteprima');
    assert.ok(prima.active && prima.side.pokemon.length === 6);

    // un set finito: il successivo ha team nuovi
    let setVisti = new Set([1]);
    for (let giro = 0; giro < 2000 && db.leggi(`partite/${partita}/stato`) === 'in_corso'; giro++) {
        for (const lato of ['p1', 'p2']) {
            const r = db.leggi(`partite/${partita}/privato/${lato}/richiesta`);
            if (!r || db.leggi(`partite/${partita}/haScelto/${lato}`) === r.passo) continue;
            const richiesta = JSON.parse(r.json);
            if (richiesta.wait) continue;
            await servizio.inviaScelta(lato === 'p1' ? 'u1' : 'u2', { id: partita, passo: r.passo, scelta: sceltaDecisa(richiesta) });
            const set = db.leggi(`partite/${partita}/setCorrente`);
            if (!setVisti.has(set)) { setVisti.add(set); ascolta(); }
        }
    }
    assert.equal(db.leggi(`partite/${partita}/stato`), 'conclusa');
    assert.ok(squadre.length >= 2, 'almeno due set');
    assert.equal(new Set(squadre).size, squadre.length, 'a ogni set team nuovi');
    assert.deepEqual(effetti.replay, []);
    assert.deepEqual(effetti.registrati, []);
    assert.equal(db.leggi(`partiteServer/${partita}`), null);
});

test('Random in doppio: la partita parte con il formato giusto', async () => {
    const casa = await creaCasa();
    const { db, servizio } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'Random Doubles' },
        [['u1', { pronto: true }], ['u2', { pronto: true }]]);
    assert.equal(db.leggi(`partite/${partita}/info/formato`), 'gen9randomdoublesbattle');
    const prima = JSON.parse(db.leggi(`partite/${partita}/privato/p1/richiesta`).json);
    assert.equal(prima.active.length, 2, 'due Pokémon in campo');
    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' });
    assert.equal(fine.stato, 'conclusa', JSON.stringify(fine));
});

test('modalità libera: team di qualunque formato, tutti a livello 50, si gioca nella generazione più recente dei due', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'libera', stile: 'singles' }, []);
    assert.equal(db.leggi(`partite/${partita}/info/categoria`), 'Free battle');
    assert.equal(db.leggi(`partite/${partita}/info/livello`), 50);

    // qualunque team del Box, anche di formati diversi
    await servizio.pronto('u1', { id: partita, team: 'Didi vecchio' });
    await servizio.pronto('u2', { id: partita, team: 'Lu OU' });
    assert.equal(db.leggi(`partite/${partita}/stato`), 'in_corso');
    // Gen 4 contro "fino alla Gen 9": si gioca in Gen 9
    assert.match(db.leggi(`partite/${partita}/info/formato`), /^gen9customgame@@@/);
    assert.deepEqual(db.leggi(`partite/${partita}/team`), { p1: 'Didi vecchio', p2: 'Lu OU' });

    const richiesta = JSON.parse(db.leggi(`partite/${partita}/privato/p1/richiesta`).json);
    assert.ok(richiesta.teamPreview, 'anteprima squadre, come negli altri formati del sito');
    assert.equal(richiesta.side.pokemon.length, 4);
    for (const p of richiesta.side.pokemon) assert.match(p.details, /, L50/, `${p.details}: livello 50`);
    const dellAltro = JSON.parse(db.leggi(`partite/${partita}/privato/p2/richiesta`).json);
    for (const p of dellAltro.side.pokemon) assert.match(p.details, /, L50/);

    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' });
    assert.equal(fine.stato, 'conclusa', JSON.stringify(fine));
});

test('modalità libera in doppio: formato doppio; due team vecchi si giocano nella loro generazione', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'libera', stile: 'doubles' },
        [['u1', { team: 'Didi vecchio' }], ['u2', { team: 'Lu vecchio' }]]);
    const formato = db.leggi(`partite/${partita}/info/formato`);
    assert.match(formato, /^gen4doublescustomgame@@@/);
    assert.match(formato, /Team Preview/, 'prima della Gen 5 l\'anteprima si chiede a parte');
    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' });
    assert.equal(fine.stato, 'conclusa', JSON.stringify(fine));
});

test('modalità libera: un team che non si legge non si porta', async () => {
    const rotto = mondo();
    rotto.players.lu.teams.t3 = { nome: 'Rotto', categoria: 'OU', testoShowdown: 'qualcosa che non è un team\n\nne\' questo' };
    const casa = await creaCasa(rotto);
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'libera' }, []);
    await rifiutata(casa.servizio.pronto('u2', { id: partita, team: 'Rotto' }), /can't be used/);
});

// ---------- serie lunghe e team cambiabili ----------
// Un secondo team OU per ognuno (stessi Pokémon, strumento diverso per il primo): serve per cambiare team tra un set e l'altro
const GARCHOMP_B = GARCHOMP.replace('Garchomp @ Life Orb', 'Garchomp @ Leftovers');
function mondoConDueTeam() {
    const m = mondo();
    m.players.didi.teams.t3 = { nome: 'Didi OU 2', categoria: 'OU', testoShowdown: GARCHOMP_B };
    m.players.lu.teams.t3 = { nome: 'Lu OU 2', categoria: 'OU', testoShowdown: GARCHOMP_B };
    return m;
}

// Gioca la partita set dopo set: tra un set e l'altro, se si torna alla scelta del team, fa scegliere a ognuno quello della lista
// (scelte[lato] = nomi dei team, uno per set; l'ultimo si ripete). Restituisce gli stati in cui ci si è fermati.
async function giocaSerie(servizio, db, partita, { scelte = {}, massimo = 4000 } = {}) {
    const fermate = [];
    for (let set = 2; set < 30; set++) {
        const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' }, { massimo });
        fermate.push(fine.stato);
        if (fine.stato !== 'tra_set') return fermate;
        for (const [lato, uid] of [['p1', 'u1'], ['p2', 'u2']]) {
            const elenco = scelte[lato] || [];
            const team = elenco.length ? elenco[Math.min(set - 2, elenco.length - 1)] : db.leggi(`partite/${partita}/team/${lato}`);
            await servizio.pronto(uid, { id: partita, team });
        }
    }
    throw new Error('La serie non finisce');
}

test('al meglio dei 5: ci vogliono 3 vittorie (i set inutili non si giocano) e i team fissi restano gli stessi', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 5 },
        [['u1', { team: 'Didi OU' }], ['u2', { team: 'Lu OU' }]]);
    assert.equal(db.leggi(`partite/${partita}/info/bestOf`), 5);
    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' }, { massimo: 4000 });
    assert.equal(fine.stato, 'conclusa', JSON.stringify(fine));
    const r = db.leggi(`partite/${partita}/risultati`);
    const vittorie = { p1: 0, p2: 0 };
    Object.values(r).forEach(x => { vittorie[x.vincitore]++; });
    assert.equal(Math.max(vittorie.p1, vittorie.p2), 3, JSON.stringify(r));
    const set = Object.keys(r).length;
    assert.ok(set >= 3 && set <= 5, `${set} set`);
    assert.deepEqual(db.leggi(`partite/${partita}/team`), { p1: 'Didi OU', p2: 'Lu OU' }, 'team fissi: gli stessi dall\'inizio alla fine');
});

test('team cambiabili: finito un set si torna alla scelta del team, e il successivo parte solo quando i due sono pronti', async () => {
    const casa = await creaCasa(mondoConDueTeam());
    const { servizio, db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 3, cambioTeam: true },
        [['u1', { team: 'Didi OU' }], ['u2', { team: 'Lu OU' }]]);
    const primoTeam = db.leggi(`partiteServer/${partita}/team/p1/packed`);

    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' }, { massimo: 3000 });
    assert.equal(fine.stato, 'tra_set', JSON.stringify(fine));
    assert.equal(db.leggi(`partite/${partita}/setProssimo`), 2);
    assert.equal(db.leggi(`partite/${partita}/pronti`), null, 'tutti devono dire "pronto" di nuovo');
    assert.deepEqual(Object.keys(db.leggi(`partite/${partita}/risultati`)), ['set1']);
    assert.equal(db.leggi(`partite/${partita}/privato/p1/richiesta`), null, 'il set è finito: nessuna scelta da fare');

    // si sceglie solo tra i team del formato, e solo i propri
    await rifiutata(servizio.pronto('u1', { id: partita, team: 'Didi vecchio' }), /not one of your OU teams/);
    await rifiutata(servizio.pronto('u1', { id: partita, team: 'Lu OU 2' }), /not one of your OU teams/);
    await rifiutata(servizio.pronto('u3', { id: partita, team: 'x' }), /Non sei uno dei due/);
    await servizio.pronto('u1', { id: partita, team: 'Didi OU 2' });
    assert.equal(db.leggi(`partite/${partita}/stato`), 'tra_set', 'ne manca uno');
    assert.equal(db.leggi(`partite/${partita}/pronti/p1`), true);
    await servizio.pronto('u1', { id: partita, team: null });
    assert.equal(db.leggi(`partite/${partita}/pronti/p1`), false, 'si può ritirare il "pronto"');
    await servizio.pronto('u1', { id: partita, team: 'Didi OU 2' });
    await servizio.pronto('u2', { id: partita, team: 'Lu OU' });        // l'altro tiene il suo

    assert.equal(db.leggi(`partite/${partita}/stato`), 'in_corso');
    assert.equal(db.leggi(`partite/${partita}/setCorrente`), 2);
    assert.deepEqual(db.leggi(`partite/${partita}/team`), { p1: 'Didi OU 2', p2: 'Lu OU' });
    assert.notEqual(db.leggi(`partiteServer/${partita}/team/p1/packed`), primoTeam, 'il set 2 si gioca col team nuovo');
    assert.ok(db.leggi(`partite/${partita}/privato/p1/richiesta`), 'la prima richiesta del set 2 è pronta');
    // il team nuovo non si vede nella parte pubblica
    const pubblico = db.leggi(`partite/${partita}`);
    delete pubblico.privato;
    assert.equal(JSON.stringify(pubblico).includes('Leftovers'), false);
});

test('team cambiabili: la serie finisce appena uno ha le vittorie necessarie (senza una scelta del team in più) e non salva nulla', async () => {
    const casa = await creaCasa(mondoConDueTeam());
    const { servizio, db, effetti } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 3, cambioTeam: true },
        [['u1', { team: 'Didi OU' }], ['u2', { team: 'Lu OU' }]]);
    const fermate = await giocaSerie(servizio, db, partita, { scelte: { p1: ['Didi OU 2', 'Didi OU'], p2: ['Lu OU 2'] } });
    assert.equal(fermate[fermate.length - 1], 'conclusa', JSON.stringify(fermate));
    const r = db.leggi(`partite/${partita}/risultati`);
    const sets = Object.keys(r).length;
    assert.equal(fermate.filter(x => x === 'tra_set').length, sets - 1, 'si sceglie il team solo se la serie continua');
    const vittorie = { p1: 0, p2: 0 };
    Object.values(r).forEach(x => { vittorie[x.vincitore]++; });
    assert.equal(Math.max(vittorie.p1, vittorie.p2), 2, JSON.stringify(r));
    assert.deepEqual(effetti.replay, []);
    assert.deepEqual(effetti.registrati, []);
    assert.equal(db.leggi(`partiteServer/${partita}`), null);
});

test('team cambiabili in modalità libera: cambiando team può cambiare anche la generazione in cui si gioca', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'libera', stile: 'singles', bestOf: 3, cambioTeam: true },
        [['u1', { team: 'Didi vecchio' }], ['u2', { team: 'Lu vecchio' }]]);
    assert.match(db.leggi(`partite/${partita}/info/formato`), /^gen4customgame@@@/, 'due team della Gen 4: si gioca in Gen 4');
    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' }, { massimo: 3000 });
    assert.equal(fine.stato, 'tra_set', JSON.stringify(fine));

    await servizio.pronto('u1', { id: partita, team: 'Didi vecchio' });
    await servizio.pronto('u2', { id: partita, team: 'Lu OU' });         // un team moderno: ora si gioca in Gen 9
    assert.equal(db.leggi(`partite/${partita}/stato`), 'in_corso');
    assert.match(db.leggi(`partite/${partita}/info/formato`), /^gen9customgame@@@/);
    assert.deepEqual(db.leggi(`partite/${partita}/team`), { p1: 'Didi vecchio', p2: 'Lu OU' });
    const richiesta = JSON.parse(db.leggi(`partite/${partita}/privato/p2/richiesta`).json);
    for (const p of richiesta.side.pokemon) assert.match(p.details, /, L50/, 'sempre a livello 50');
    assert.ok(db.leggi(`partiteServer/${partita}/corrente`).formato.startsWith('gen9'), 'il set parte nel formato nuovo');
});

// ---------- rivincita ----------
async function partitaFinita(casa, sfida = { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 1 }, { senzaGiocare = false } = {}) {
    const { servizio, db } = casa;
    if (senzaGiocare) {       // per le regole della rivincita basta che la sfida risulti conclusa (i Random sono lunghi da rigiocare)
        const s = await servizio.sfidaAmichevole('u1', sfida);
        const { partita } = await servizio.rispondiAmichevole('u2', { id: s.id, risposta: 'accetta' });
        await db.ref(`sfide/amichevoli/${s.id}/stato`).set('conclusa');
        await db.ref(`partite/${partita}/stato`).set('conclusa');
        return { id: s.id, partita };
    }
    const scelte = sfida.tipo === 'libera' ? [['u1', { team: 'Didi OU' }], ['u2', { team: 'Lu OU' }]]
        : (sfida.categoria && sfida.categoria.startsWith('Random') ? [['u1', { pronto: true }], ['u2', { pronto: true }]]
            : [['u1', { team: 'Didi OU' }], ['u2', { team: 'Lu OU' }]]);
    const { id, partita } = await avviaPartita(casa, sfida, scelte);
    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' }, { massimo: 3000 });
    assert.equal(fine.stato, 'conclusa', JSON.stringify(fine));
    return { id, partita };
}

test('rivincita: a fine partita si offre una sfida nuova (stesso avversario e formato, serie a scelta) e la partita finita la ricorda', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { id, partita } = await partitaFinita(casa);
    const r = await servizio.sfidaAmichevole('u2', { rivincita: id, bestOf: 5, cambioTeam: true });
    assert.equal(r.ok, true);
    assert.notEqual(r.id, id);
    const s = db.leggi(`sfide/amichevoli/${r.id}`);
    assert.deepEqual(
        { ...s, creata: typeof s.creata },
        { da: 'Lu', daId: 'lu', daUid: 'u2', a: 'Didi', aId: 'didi', aUid: 'u1', tipo: 'formato', libera: false, random: false,
            categoria: 'OU', stile: 'singles', bestOf: 5, cambioTeam: true, rivincitaDi: id, stato: 'in_attesa', creata: 'number' });
    const offerta = db.leggi(`partite/${partita}/rivincita`);
    assert.deepEqual({ ...offerta, creata: typeof offerta.creata },
        { sfida: r.id, daUid: 'u2', da: 'Lu', bestOf: 5, cambioTeam: true, stato: 'in_attesa', creata: 'number' });

    // chi era già lì risponde: accettando nasce la partita nuova (serie e team come offerti), lobby da capo
    const acc = await servizio.rispondiAmichevole('u1', { id: r.id, risposta: 'accetta' });
    assert.equal(acc.partita, `amichevole__${r.id}`);
    const info = db.leggi(`partite/${acc.partita}/info`);
    assert.equal(info.bestOf, 5);
    assert.equal(info.cambioTeam, true);
    assert.equal(info.categoria, 'OU');
    assert.deepEqual(info.p1, { nome: 'Lu', id: 'lu', uid: 'u2' }, 'chi offre la rivincita è lo sfidante');
    assert.equal(db.leggi(`partite/${acc.partita}/stato`), 'lobby');
    assert.equal(db.leggi(`partite/${acc.partita}/risultati`), null, 'serie da zero');
    assert.deepEqual(db.leggi(`partite/${partita}/rivincita/stato`), 'accettata');
    assert.equal(db.leggi(`partite/${partita}/rivincita/partita`), acc.partita);
    // la partita nuova si apre dalla sfida nuova
    const aperta = await servizio.apriPartita('u2', { amichevole: r.id });
    assert.equal(aperta.id, acc.partita);
    assert.equal(aperta.lato, 'p1');
});

test('rivincita: si può rifiutare o ritirare, e poi riprovare; la partita nuova non salva nulla più della prima', async () => {
    const casa = await creaCasa();
    const { servizio, db, effetti } = casa;
    const { id, partita } = await partitaFinita(casa);
    const a = await servizio.sfidaAmichevole('u1', { rivincita: id, bestOf: 3 });
    await servizio.rispondiAmichevole('u2', { id: a.id, risposta: 'rifiuta' });
    assert.equal(db.leggi(`partite/${partita}/rivincita/stato`), 'rifiutata');
    const b = await servizio.sfidaAmichevole('u2', { rivincita: id, bestOf: 1 });
    assert.equal(db.leggi(`partite/${partita}/rivincita/stato`), 'in_attesa', 'un\'offerta nuova rimpiazza la vecchia');
    assert.equal(db.leggi(`partite/${partita}/rivincita/sfida`), b.id);
    await servizio.rispondiAmichevole('u2', { id: b.id, risposta: 'ritira' });
    assert.equal(db.leggi(`partite/${partita}/rivincita/stato`), 'annullata');
    // risposte in ritardo a un'offerta vecchia non toccano quella nuova
    const c = await servizio.sfidaAmichevole('u1', { rivincita: id, bestOf: 1 });
    await servizio.rispondiAmichevole('u1', { id: c.id, risposta: 'ritira' });
    assert.equal(db.leggi(`partite/${partita}/rivincita/sfida`), c.id);
    assert.deepEqual(effetti.replay, []);
    assert.deepEqual(effetti.registrati, []);
});

test('rivincita offerta da tutti e due insieme: la seconda vale come accettazione della prima', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { id, partita } = await partitaFinita(casa);
    const prima = await servizio.sfidaAmichevole('u1', { rivincita: id, bestOf: 3, cambioTeam: true });
    const seconda = await servizio.sfidaAmichevole('u2', { rivincita: id, bestOf: 1 });
    assert.equal(seconda.accettata, true);
    assert.equal(seconda.id, prima.id, 'vale la prima offerta');
    assert.equal(seconda.partita, `amichevole__${prima.id}`);
    assert.equal(db.leggi(`partite/${seconda.partita}/info/bestOf`), 3, 'con le regole di chi ha offerto per primo');
    assert.equal(db.leggi(`partite/${partita}/rivincita/stato`), 'accettata');
    // chi ha già offerto non può offrire due volte
    const casa2 = await creaCasa();
    const f = await partitaFinita(casa2);
    await casa2.servizio.sfidaAmichevole('u1', { rivincita: f.id, bestOf: 1 });
    await rifiutata(casa2.servizio.sfidaAmichevole('u1', { rivincita: f.id, bestOf: 3 }), /already a pending/);
});

test('rivincita: solo di una partita finita e solo di chi l\'ha giocata; nei Random e in modalità libera si ripete il formato', async () => {
    const casa = await creaCasa();
    const { servizio } = casa;
    const s = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'formato', categoria: 'OU', bestOf: 1 });
    await servizio.rispondiAmichevole('u2', { id: s.id, risposta: 'accetta' });
    await rifiutata(servizio.sfidaAmichevole('u1', { rivincita: s.id }), /not over yet/);
    await rifiutata(servizio.sfidaAmichevole('u1', { rivincita: 'non-esiste' }), /no longer available/);
    await rifiutata(servizio.sfidaAmichevole('u1', { rivincita: 'a b' }), /Invalid/);
    const finita = await creaCasa();
    const { id } = await partitaFinita(finita);
    await rifiutata(finita.servizio.sfidaAmichevole('u3', { rivincita: id }), /not yours/);

    // la modalità libera ricorda lo stile (doppio) e il tipo
    const libera = await creaCasa();
    const l = await partitaFinita(libera, { a: 'Lu', tipo: 'libera', stile: 'doubles', bestOf: 1 }, { senzaGiocare: true });
    const rl = await libera.servizio.sfidaAmichevole('u1', { rivincita: l.id, bestOf: 3, cambioTeam: true });
    const sl = libera.db.leggi(`sfide/amichevoli/${rl.id}`);
    assert.equal(sl.libera, true);
    assert.equal(sl.stile, 'doubles');
    assert.equal(sl.cambioTeam, true);
    assert.equal(sl.categoria, 'Free battle');

    // un Random si ripete Random (e non ha team da cambiare)
    const rnd = await creaCasa();
    const r1 = await partitaFinita(rnd, { a: 'Lu', tipo: 'formato', categoria: 'Random Gen 9', bestOf: 1 }, { senzaGiocare: true });
    const rr = await rnd.servizio.sfidaAmichevole('u1', { rivincita: r1.id, bestOf: 3, cambioTeam: true });
    const sr = rnd.db.leggi(`sfide/amichevoli/${rr.id}`);
    assert.equal(sr.random, true);
    assert.equal(sr.cambioTeam, false);
    assert.equal(sr.categoria, 'Random Gen 9');
});

test('rivincita: se la partita vecchia è già stata pulita, accettare la rivincita funziona lo stesso e non ne lascia avanzi', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { id, partita } = await partitaFinita(casa);
    const r = await servizio.sfidaAmichevole('u1', { rivincita: id, bestOf: 3 });
    casa.avanza(7 * 3600 * 1000);            // passano 7 ore: la partita finita e la sua sfida sono da cancellare
    await servizio.pulisciAmichevoli();
    assert.equal(db.leggi(`partite/${partita}`), null);
    assert.ok(db.leggi(`sfide/amichevoli/${r.id}`), 'la rivincita in attesa dura un giorno');
    const acc = await servizio.rispondiAmichevole('u2', { id: r.id, risposta: 'accetta' });
    assert.equal(db.leggi(`partite/${acc.partita}/stato`), 'lobby');
    assert.equal(db.leggi(`partite/${partita}`), null, 'nessun avanzo della partita vecchia');
    // e ritirare/rifiutare una rivincita la cui partita non c\'è più non rompe nulla
    const casa2 = await creaCasa();
    const f = await partitaFinita(casa2);
    const r2 = await casa2.servizio.sfidaAmichevole('u2', { rivincita: f.id, bestOf: 1 });
    casa2.avanza(7 * 3600 * 1000);
    await casa2.servizio.pulisciAmichevoli();
    await casa2.servizio.rispondiAmichevole('u1', { id: r2.id, risposta: 'rifiuta' });
    assert.equal(casa2.db.leggi(`partite/${f.partita}`), null);
});

test('rivincita: chi la offre deve avere un team utilizzabile; se il formato non c\'è più non si può', async () => {
    const senzaTeam = mondo();
    const casa = await creaCasa(senzaTeam);
    const { id } = await partitaFinita(casa);
    casa.db.ref('players/didi/teams').remove();
    await rifiutata(casa.servizio.sfidaAmichevole('u1', { rivincita: id }), /no usable team for OU/);
    casa.db.ref('regolamenti').remove();
    await rifiutata(casa.servizio.sfidaAmichevole('u2', { rivincita: id }), /not found/);
});


// ---------- Random nelle stagioni ufficiali ----------
// Un formato Random può essere la categoria di uno showdown di stagione: nessun team da iscrivere o scegliere (li dà Showdown),
// team nuovi a ogni set, replay e risultato salvati come gli altri ma senza team (e quindi senza statistiche di team e di Pokémon).
function mondoStagione() {
    return mondo({
        seasons: {
            s1: {
                info: { id: 's1', name: 'Stagione di prova', status: 'playing', best_of: 3 },
                showdowns: { sd1: { info: { player1: 'Didi', player2: 'Lu', categoria: 'Random Gen 9', data: '2026-10-20' } } }
            }
        }
    });
}

test('Random in stagione: lo showdown nasce con il formato di Showdown e senza team da portare', async () => {
    const { servizio, db } = await creaCasa(mondoStagione());
    const aperta = await servizio.apriPartita('u1', { stagione: 's1', showdown: 'sd1', match: 1 });
    assert.equal(aperta.id, 's1__sd1__m1');
    assert.equal(aperta.lato, 'p1');
    assert.equal(aperta.info.random, true);
    assert.equal(aperta.info.formato, 'gen9randombattle');
    assert.equal(aperta.info.amichevole, undefined, 'è una partita ufficiale');
    assert.equal(db.leggi('partite/s1__sd1__m1/stato'), 'lobby');
});

test('Random in stagione: basta dire "pronto" (nessuna iscrizione di team), team nuovi a ogni set, replay e match salvati senza team', async () => {
    const casa = await creaCasa(mondoStagione());
    const { servizio, db, effetti } = casa;
    const id = 's1__sd1__m1';
    await servizio.apriPartita('u1', { stagione: 's1', showdown: 'sd1', match: 1 });
    // i set dei Random sono lunghi da rigiocare (il server ricostruisce la battaglia a ogni scelta): se ne giocano due invece di tre
    await db.ref(`partite/${id}/info/bestOf`).set(2);
    await rifiutata(servizio.pronto('u3', { id, pronto: true }), /Non sei uno dei due/);
    await servizio.pronto('u1', { id, pronto: true });
    await servizio.pronto('u1', { id, pronto: false });
    assert.equal(db.leggi(`partite/${id}/pronti/p1`), false);
    await servizio.pronto('u1', { id, pronto: true });
    assert.equal(db.leggi(`partite/${id}/stato`), 'lobby');
    await servizio.pronto('u2', { id, pronto: true });
    assert.equal(db.leggi(`partite/${id}/stato`), 'in_corso');
    assert.equal(db.leggi(`partite/${id}/team`), null, 'nessun nome di team');

    const squadre = [];
    const ascolta = () => { const t = db.leggi(`partiteServer/${id}/team`); if (t) squadre.push(`${t.p1.packed}#${t.p2.packed}`); };
    ascolta();
    const visti = new Set([1]);
    for (let giro = 0; giro < 4000 && db.leggi(`partite/${id}/stato`) === 'in_corso'; giro++) {
        for (const lato of ['p1', 'p2']) {
            const r = db.leggi(`partite/${id}/privato/${lato}/richiesta`);
            if (!r || db.leggi(`partite/${id}/haScelto/${lato}`) === r.passo) continue;
            const richiesta = JSON.parse(r.json);
            if (richiesta.wait) continue;
            await servizio.inviaScelta(lato === 'p1' ? 'u1' : 'u2', { id, passo: r.passo, scelta: sceltaDecisa(richiesta) });
            const set = db.leggi(`partite/${id}/setCorrente`);
            if (!visti.has(set)) { visti.add(set); ascolta(); }
        }
    }
    assert.equal(db.leggi(`partite/${id}/stato`), 'da_salvare', 'in stagione si giocano sempre tutti i set');
    assert.equal(squadre.length, 2);
    assert.equal(new Set(squadre).size, 2, 'a ogni set team nuovi');

    await servizio.salvaPartita(id);
    assert.equal(db.leggi(`partite/${id}/stato`), 'salvata');
    assert.equal(effetti.replay.length, 2, 'un replay per set');
    assert.equal(effetti.registrati.length, 1);
    const r = effetti.registrati[0];
    assert.equal(r.stagione, 's1');
    assert.equal(r.showdownId, 'sd1');
    assert.equal(r.categoria, 'Random Gen 9');
    assert.equal(r.team1, '');
    assert.equal(r.team2, '');
    assert.equal(r.player1, 'Didi');
    assert.equal(r.player2, 'Lu');
    assert.match(r.score, /^\d-\d$/);
    assert.deepEqual(Object.keys(r.replays), ['set1', 'set2']);
    assert.deepEqual(Object.keys(r.setStats), ['set1', 'set2'], 'le statistiche del set (KO) restano: sono dell\'allenatore');
});

test('Random in stagione: un formato che non è Random continua a chiedere il team (le stagioni di prima non cambiano)', async () => {
    const dati = mondoStagione();
    dati.seasons.s1.showdowns.sd1.info.categoria = 'OU';
    const { servizio, db } = await creaCasa(dati);
    const aperta = await servizio.apriPartita('u1', { stagione: 's1', showdown: 'sd1', match: 1 });
    assert.equal(aperta.info.random, undefined);
    assert.match(aperta.info.formato, /^gen9customgame@@@/);
    await rifiutata(servizio.pronto('u1', { id: aperta.id, team: 'Didi OU' }), /non è tra i tuoi iscritti/);
    await servizio.pronto('u1', { id: aperta.id, team: null });
    assert.equal(db.leggi(`partite/${aperta.id}/pronti/p1`), false, 'annullare il "pronto" funziona come sempre');
});

// ---------- scelte ----------
test('le scelte degli altri non si possono dare né vedere; una scelta rifiutata dal simulatore torna a chi l\'ha data', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'Random Gen 9' },
        [['u1', { pronto: true }], ['u2', { pronto: true }]]);
    const r = db.leggi(`partite/${partita}/privato/p1/richiesta`);
    await rifiutata(servizio.inviaScelta('u3', { id: partita, passo: r.passo, scelta: 'move 1' }), /Non sei uno dei due/);
    await rifiutata(servizio.inviaScelta('u1', { id: partita, passo: 'vecchio', scelta: 'move 1' }), /scaduta/);
    await rifiutata(servizio.inviaScelta('u1', { id: partita, passo: r.passo, scelta: 'move 9' }));
    await servizio.inviaScelta('u1', { id: partita, passo: r.passo, scelta: 'move 1' });
    assert.equal(db.leggi(`partite/${partita}/haScelto/p1`), r.passo, 'si vede solo che ha scelto');
    assert.equal(JSON.stringify(db.leggi(`partite/${partita}`)).includes('move 1'), false, 'non cosa');
});

test('i team degli altri non stanno mai nella parte pubblica della partita', async () => {
    const casa = await creaCasa();
    const { db } = casa;
    const { partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'OU' },
        [['u1', { team: 'Didi OU' }], ['u2', { team: 'Lu OU' }]]);
    const pubblico = db.leggi(`partite/${partita}`);
    delete pubblico.privato;
    const testo = JSON.stringify(pubblico);
    for (const parola of ['Rough Skin', 'Life Orb', 'Jolly', 'Earthquake', 'packed']) assert.equal(testo.includes(parola), false, parola);
});

// ---------- pulizia ----------
test('pulisciAmichevoli: le sfide senza risposta dopo un giorno e quelle finite dopo sei ore spariscono, con la loro partita', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const vecchia = await servizio.sfidaAmichevole('u1', { a: 'Lu', tipo: 'libera' });
    const s2 = await servizio.rispondiAmichevole('u2', { id: vecchia.id, risposta: 'accetta' });
    assert.ok(db.leggi(`partite/${s2.partita}`));

    casa.avanza(5 * 3600 * 1000);
    await servizio.pulisciAmichevoli();
    assert.ok(db.leggi(`sfide/amichevoli/${vecchia.id}`), 'una partita in corso da 5 ore resta');

    casa.avanza(20 * 3600 * 1000);
    await servizio.pulisciAmichevoli();
    assert.equal(db.leggi(`sfide/amichevoli/${vecchia.id}`), null);
    assert.equal(db.leggi(`partite/${s2.partita}`), null);
    assert.equal(db.leggi(`partiteServer/${s2.partita}`), null);
});

test('pulisciAmichevoli: una partita finita resta sei ore (per vedere l\'esito) e poi se ne va', async () => {
    const casa = await creaCasa();
    const { servizio, db } = casa;
    const { id, partita } = await avviaPartita(casa, { a: 'Lu', tipo: 'formato', categoria: 'Random Gen 9' },
        [['u1', { pronto: true }], ['u2', { pronto: true }]]);
    const fine = await giocaFinoInFondo(servizio, db, partita, { p1: 'u1', p2: 'u2' });
    assert.equal(fine.stato, 'conclusa');
    casa.avanza(5 * 3600 * 1000);
    await servizio.pulisciAmichevoli();
    assert.ok(db.leggi(`partite/${partita}`), 'dopo 5 ore c\'è ancora');
    assert.equal(db.leggi(`sfide/amichevoli/${id}/stato`), 'conclusa');
    casa.avanza(2 * 3600 * 1000);
    await servizio.pulisciAmichevoli();
    assert.equal(db.leggi(`partite/${partita}`), null);
    assert.equal(db.leggi(`sfide/amichevoli/${id}`), null);
});

test('le partite ufficiali non cambiano: apriPartita senza { amichevole } cerca ancora lo showdown della stagione', async () => {
    const { servizio } = await creaCasa();
    await rifiutata(servizio.apriPartita('u1', { stagione: 's1', showdown: 'sd1', match: 1 }), /Showdown non trovato/);
    await rifiutata(servizio.apriPartita('u1', {}), /non validi/);
});
