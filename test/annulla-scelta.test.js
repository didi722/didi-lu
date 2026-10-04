'use strict';
// Ritirare la propria scelta mentre l'avversario sta ancora scegliendo, e il compagno come bersaglio.
//   - BattagliaLocale.annulla: col simulatore vero (docs/pkmn-sim.js) la scelta ritirata non conta e se ne può fare un'altra;
//   - messaggioAnnulla: gli errori del server in parole del sito;
//   - battle-ui.js e style-battle.css: il pulsante c'è solo dove serve (mai contro la CPU) e il bersaglio alleato è piccolo e grigio.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');

// motore-battaglia.js e motore-online.js sono moduli ES che importano file del sito: si copiano in una cartella temporanea
// con estensione .mjs e le importazioni puntate sulle copie
let moduli = null;
function caricaMotori() {
    if (!moduli) {
        moduli = (async () => {
            globalThis.self = globalThis;     // i file del sito scrivono in self.NomiUnici
            const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'motori-'));
            const copia = (da, a, sostituzioni = []) => {
                let testo = leggi(da);
                for (const [x, y] of sostituzioni) testo = testo.replace(x, y);
                fs.writeFileSync(path.join(cartella, a), testo);
            };
            copia('pkmn-sim.js', 'pkmn-sim.mjs');
            copia('nomi-unici.js', 'nomi-unici.mjs');
            copia('motore-battaglia.js', 'motore-battaglia.mjs', [["'./pkmn-sim.js'", "'./pkmn-sim.mjs'"], ["'./nomi-unici.js'", "'./nomi-unici.mjs'"]]);
            copia('motore-online.js', 'motore-online.mjs');
            const url = nome => pathToFileURL(path.join(cartella, nome)).href;
            return { battaglia: await import(url('motore-battaglia.mjs')), online: await import(url('motore-online.mjs')) };
        })();
    }
    return moduli;
}

const TEAM = [
    'Garchomp @ Leftovers\nAbility: Rough Skin\nLevel: 100\n- Earthquake\n- Dragon Claw\n- Swords Dance\n- Protect',
    'Corviknight @ Leftovers\nAbility: Pressure\nLevel: 100\n- Brave Bird\n- Roost\n- Defog\n- U-turn',
    'Gholdengo @ Leftovers\nAbility: Good as Gold\nLevel: 100\n- Make It Rain\n- Shadow Ball\n- Nasty Plot\n- Recover',
    'Kingambit @ Leftovers\nAbility: Defiant\nLevel: 100\n- Sucker Punch\n- Iron Head\n- Swords Dance\n- Kowtow Cleave',
    'Dragonite @ Leftovers\nAbility: Multiscale\nLevel: 100\n- Extreme Speed\n- Dragon Dance\n- Earthquake\n- Roost',
    'Skarmory @ Leftovers\nAbility: Sturdy\nLevel: 100\n- Brave Bird\n- Roost\n- Spikes\n- Whirlwind'
].join('\n\n');
const FORMATO = 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod,Sleep Clause Mod,Endless Battle Clause,Terastal Clause';

const aspetta = async (condizione, ms = 4000) => {
    const t0 = Date.now();
    while (!condizione()) {
        if (Date.now() - t0 > ms) throw new Error('attesa scaduta');
        await new Promise(r => setTimeout(r, 10));
    }
};

async function partita() {
    const { battaglia } = await caricaMotori();
    const b = new battaglia.BattagliaLocale({ formato: FORMATO, p1: { nome: 'A', team: TEAM }, p2: { nome: 'B', team: TEAM } });
    const richieste = { p1: [], p2: [] }, errori = [], log = [];
    b.on('richiesta', (lato, r) => richieste[lato].push(r));
    b.on('errore', (lato, m) => errori.push([lato, m]));
    b.on('log', righe => log.push(...righe));
    b.avvia();
    await aspetta(() => richieste.p1.length === 1 && richieste.p2.length === 1);
    return { b, richieste, errori, log };
}

test('BattagliaLocale.annulla: a team preview la scelta ritirata non conta, si sceglie di nuovo', async () => {
    const { b, richieste, errori, log } = await partita();
    b.scegli('p1', 'team 1234');
    assert.deepEqual(await b.annulla('p1'), { ok: true });
    b.scegli('p1', 'team 2134');               // come capofila ora c'è il secondo Pokémon
    b.scegli('p2', 'team 1234');
    await aspetta(() => richieste.p1.length === 2);
    assert.deepEqual(errori, []);
    assert.ok(log.some(r => /^\|switch\|p1a: Corviknight/.test(r)), 'in campo c\'è Corviknight, la scelta rifatta');
    assert.ok(!log.some(r => /^\|switch\|p1a: Garchomp/.test(r)), 'e non Garchomp, la scelta ritirata');
});

test('BattagliaLocale.annulla: in un turno la mossa ritirata non si gioca, quella nuova sì', async () => {
    const { b, richieste, errori, log } = await partita();
    b.scegli('p1', 'team 1234'); b.scegli('p2', 'team 1234');
    await aspetta(() => richieste.p1.length === 2);
    b.scegli('p1', 'move 1');                                  // Earthquake
    const esito = await b.annulla('p1');
    assert.deepEqual(esito, { ok: true });
    b.scegli('p1', 'move 2');                                  // Dragon Claw
    b.scegli('p2', 'move 4');                                  // Protect
    await aspetta(() => richieste.p1.length === 3);
    assert.deepEqual(errori, []);
    const mosse = log.filter(r => r.startsWith('|move|p1a'));
    assert.equal(mosse.length, 1);
    assert.match(mosse[0], /\|Dragon Claw\|/);
    assert.ok(!log.some(r => /\|move\|p1a: Garchomp\|Earthquake/.test(r)), 'la mossa ritirata non c\'è');
});

test('BattagliaLocale.annulla: senza una scelta fatta non dà errori', async () => {
    const { b, richieste, errori } = await partita();
    assert.deepEqual(await b.annulla('p1'), { ok: true }, 'niente da ritirare: nessun errore');
    assert.deepEqual(errori, []);
    assert.equal(richieste.p1.length, 1, 'e nessuna richiesta nuova');
});

test('BattagliaLocale.annulla: se il simulatore rifiuta ("would leak information") lo dice, e non lo manda al pannello come scelta rifiutata', async () => {
    const { b, errori } = await partita();
    b.scegli('p1', 'team 1234');
    // il simulatore, a certe condizioni, risponde all'"undo" con un errore sul flusso del giocatore
    const scrivi = b.streams.p1.write.bind(b.streams.p1);
    b.streams.p1.write = dati => {
        if (dati === 'undo') b.streams.p1.push("|error|[Invalid choice] Can't undo: A trapping/disabling effect would cause undo to leak information");
        return scrivi(dati);
    };
    const esito = await b.annulla('p1');
    assert.equal(esito.ok, false);
    assert.equal(esito.messaggio, "Can't undo: A trapping/disabling effect would cause undo to leak information", 'senza il prefisso tecnico');
    assert.deepEqual(errori, [], 'l\'errore dell\'annullamento non azzera il pannello');
    // un errore vero di una scelta, fuori da un annullamento, passa ancora (il pannello deve vederlo)
    b.streams.p1.push('|error|[Invalid choice] Sorry, too late to make a different move');
    await aspetta(() => errori.length === 1);
    assert.equal(errori[0][0], 'p1');
});

test('messaggioAnnulla: gli errori del server in parole del sito, e un messaggio generico per quelli tecnici', async () => {
    const { online } = await caricaMotori();
    const m = online.messaggioAnnulla;
    assert.equal(m({ message: "Troppo tardi: l'avversario ha già scelto" }), 'Too late: your opponent has already chosen.');
    assert.equal(m({ message: "Non c'è nessuna scelta da annullare" }), "There's no choice to cancel.");
    assert.equal(m({ message: 'Questa richiesta è scaduta: la pagina si aggiorna da sola' }), 'This turn has already moved on.');
    for (const tecnico of [{ message: 'internal' }, { message: 'NOT_FOUND' }, new Error('Failed to fetch'), undefined, null, 'boh']) {
        assert.match(m(tecnico), /Couldn't cancel right now/);
    }
});

test('BattagliaOnline.annulla: chiama annullaScelta con la partita e il passo in corso, e riporta l\'esito', async () => {
    const { online } = await caricaMotori();
    const chiamate = [];
    const funzioni = { httpsCallable: nome => async dati => { chiamate.push([nome, dati]); if (funzioni.errore) throw funzioni.errore; return { data: { ok: true } }; } };
    const b = new online.BattagliaOnline({ id: 's1__sd1__m1', lato: 'p1', db: {}, funzioni });
    b.passo = '2:5';
    assert.deepEqual(await b.annulla('p1'), { ok: true });
    assert.deepEqual(chiamate, [['annullaScelta', { id: 's1__sd1__m1', passo: '2:5' }]]);
    funzioni.errore = { code: 'functions/failed-precondition', message: "Troppo tardi: l'avversario ha già scelto" };
    assert.deepEqual(await b.annulla('p1'), { ok: false, messaggio: 'Too late: your opponent has already chosen.' });
    // l'errore del ritiro non passa dal canale delle scelte rifiutate (che azzererebbe il pannello)
    const errori = [];
    b.on('errore', (l, mess) => errori.push(mess));
    await b.annulla('p1');
    assert.deepEqual(errori, []);
});

// ---------- la pagina ----------
test('battle-ui.js: "Cancel my choice" si vede solo dove ha senso (mai contro la CPU né il bot) e rimette il pannello com\'era', () => {
    const ui = leggi('battle-ui.js');
    assert.match(ui, /messaggio\(`Choice sent\. Waiting for \$\{avv\}…`, puoAnnullare\(lato\) \? bottoneAnnulla\(lato\) : null\)/);
    const f = /function puoAnnullare\(lato\) \{([\s\S]*?)\n\}\n/.exec(ui);
    assert.ok(f, 'puoAnnullare non trovata');
    assert.match(f[1], /!p\.inviata \|\| finita \|\| cpu/, 'senza scelta inviata, a set finito o contro la CPU: no');
    assert.match(f[1], /lato !== mioLato \|\| online\.stato !== 'in_corso'/, 'online: solo il proprio lato, solo a match in corso');
    assert.match(f[1], /online\.sceltaAvversario === battaglia\.passo/, 'online: non più se l\'avversario ha già scelto');
    assert.match(f[1], /!botAttivo\(altro\)/, 'locale: non contro il bot');
    assert.match(ui, /el\('button', \{[^}]*\}, p\.annullando \? 'Cancelling…' : 'Cancel my choice'\)/);
    // l'esito: errore mostrato accanto al pulsante, altrimenti si torna a scegliere (l'anteprima conserva l'ordine)
    const a = /async function annullaScelta\(lato\) \{([\s\S]*?)\n\}\n/.exec(ui);
    assert.ok(a);
    assert.match(a[1], /const esito = await battaglia\.annulla\(lato\)/);
    assert.match(a[1], /p\.erroreAnnulla = esito\.messaggio/);
    assert.match(a[1], /p\.inviata = false/);
    assert.match(a[1], /p\.r\.tipo === 'anteprima'\) disegnaPannello\(lato\);[^\n]*\n\s*else ricomincia\(lato\)/);
    assert.match(a[1], /p\.grezza !== richiesta\) return/, 'se nel frattempo il turno è andato avanti non si tocca il pannello');
    // quando l'avversario sceglie, il pulsante sparisce
    assert.match(ui, /battaglia\.on\('avversario', passo => \{[\s\S]*?disegnaPannello\(mioLato\)/);
});

test('style-battle.css: il bersaglio alleato è piccolo e grigio, quelli avversari restano grandi', () => {
    const ui = leggi('battle-ui.js');
    assert.match(ui, /grande: chi === 1,\s*alleato: chi === 0,/);
    assert.match(ui, /class: 'bersagli-gruppo' \+ \(chi === 0 \? ' alleati' : ''\)/);
    const css = leggi('style-battle.css');
    const alleato = /\.btn-pkm\.alleato \{([^}]*)\}/.exec(css);
    assert.ok(alleato, 'regola dell\'alleato mancante');
    assert.match(alleato[1], /font-size: \.6rem/, 'più piccolo di .btn-pkm.grande (.8rem)');
    assert.match(alleato[1], /background: #e4e4e4/, 'grigio');
    assert.match(alleato[1], /dashed/, 'bordo tratteggiato: si capisce che non è il bersaglio principale');
    assert.match(css, /\.btn-pkm\.grande \{ padding: 3px 11px 3px 3px; font-size: \.8rem/);
    assert.match(css, /\.btn-pkm\.alleato \.picon \{ filter: grayscale\(1\)/);
});
