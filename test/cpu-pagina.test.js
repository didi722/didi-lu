'use strict';
// La prova contro la CPU nelle pagine del sito:
//   - caricaPerProva (team-sito.js): dal Box del giocatore prende team, formato e iniziali, e dice cosa impedirebbe di giocare;
//   - squadreCpu (cpu-partita.js): i team della CPU si fanno una volta, si ricordano, e si rifanno da soli se il formato cambia
//     (un formato nuovo o modificato funziona senza toccare nulla);
//   - battle-ui.js, box.html e i fogli di stile: cablaggio, pulsanti, mobile.
// Non guarda come viene la pagina: per quello serve un browser (vedi le prove con Playwright).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { caricaSim, caricaTeamSito } = require('./ayuda-sim.js');
const T = require('../docs/team-cpu.js');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const leggiJson = p => JSON.parse(leggi(p));

// ---------- un Firebase finto: percorso -> valore ----------
function dbFinto(dati) {
    const prendi = percorso => percorso.split('/').reduce((o, k) => (o == null ? undefined : o[k]), dati);
    return { ref: percorso => ({ once: async () => ({ val: () => { const v = prendi(percorso); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }) }) };
}
const utente = { uid: 'u1' };
const regOU = { categoria: 'OU', strutturaSito: 'custom', battleStyle: 'singles', genRuleValue: 9, genRuleType: 'up_to', baseTier: 'OU', restrizioni: {} };
const testoValido = `Garchomp @ Leftovers
Ability: Rough Skin
Level: 100
EVs: 252 Atk / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Swords Dance
- Protect`;
const datiBase = () => ({
    users: { u1: { name: 'Didi', real_name: 'Davide', last_name: 'Rossi' } },
    players: { didi: { info: { color: '#31c489', avatar: 'immagini/profile/3.png' }, teams: { t1: { nome: 'Il mio OU', categoria: 'OU', testoShowdown: testoValido } } } },
    regolamenti: { r2: regOU }
});

// ===================================================
// caricaPerProva
// ===================================================
test('caricaPerProva: team, formato, colore e iniziali del giocatore', async () => {
    const S = await caricaTeamSito();
    const d = await S.caricaPerProva(dbFinto(datiBase()), utente, 't1');
    assert.equal(d.nome, 'Didi');
    assert.equal(d.team.nome, 'Il mio OU');
    assert.equal(d.team.testo, testoValido);
    assert.equal(d.categoria, 'OU');
    assert.equal(d.formato, 'gen9customgame@@@Picked Team Size = 4,HP Percentage Mod,Sleep Clause Mod,Endless Battle Clause,Terastal Clause');
    assert.equal(d.livello, 100);
    assert.equal(d.colore, '#31c489');
    assert.deepEqual(d.iniziali, ['d', 'r']);
    assert.deepEqual(d.problemi, []);
});

test('caricaPerProva: il formato si trova anche per id del regolamento, e le iniziali anche in players/info', async () => {
    const S = await caricaTeamSito();
    const dati = datiBase();
    dati.players.didi.teams.t1.categoria = 'r2';
    dati.users.u1 = { name: 'Didi' };
    dati.players.didi.info.real_name = 'Luca';
    const d = await S.caricaPerProva(dbFinto(dati), utente, 't1');
    assert.equal(d.categoria, 'OU');
    assert.deepEqual(d.iniziali, ['l']);
});

test('caricaPerProva: errori chiari se manca il team, il formato o il nome', async () => {
    const S = await caricaTeamSito();
    await assert.rejects(S.caricaPerProva(dbFinto(datiBase()), utente, 'nonesiste'), /not in your Box/);
    const senzaFormato = datiBase();
    senzaFormato.regolamenti = {};
    await assert.rejects(S.caricaPerProva(dbFinto(senzaFormato), utente, 't1'), /format was not found/);
    const senzaNome = datiBase();
    senzaNome.users.u1 = {};
    await assert.rejects(S.caricaPerProva(dbFinto(senzaNome), utente, 't1'), /no name/);
});

test('caricaPerProva: un team che nel formato non si può giocare lo dice (livello sbagliato, Mega senza meccaniche)', async () => {
    const S = await caricaTeamSito();
    const dati = datiBase();
    dati.players.didi.teams.t1.testoShowdown = testoValido.replace('Level: 100', 'Level: 50');
    let d = await S.caricaPerProva(dbFinto(dati), utente, 't1');
    assert.ok(d.problemi.some(p => /level 50 instead of 100/.test(p)), d.problemi.join(' | '));

    dati.players.didi.teams.t1.testoShowdown = testoValido.replace('Garchomp @ Leftovers', 'Garchomp @ Garchompite');
    d = await S.caricaPerProva(dbFinto(dati), utente, 't1');
    assert.ok(d.problemi.some(p => /no generational mechanics/.test(p)), d.problemi.join(' | '));
});

test('caricaPerProva: un team salvato senza testo originale si ricostruisce dai campi', async () => {
    const S = await caricaTeamSito();
    const dati = datiBase();
    dati.players.didi.teams.t1 = {
        nome: 'Vecchio team', categoria: 'OU',
        pokemon: [{ nome: 'Garchomp', strumento: 'Leftovers', abilita: 'Rough Skin', natura: 'Jolly', evs: '252 Atk / 252 Spe', mosse: ['Earthquake', 'Dragon Claw', 'Swords Dance', 'Protect'] }]
    };
    const d = await S.caricaPerProva(dbFinto(dati), utente, 't1');
    assert.match(d.team.testo, /^Garchomp @ Leftovers\nAbility: Rough Skin\nLevel: 100/);
    assert.match(d.team.testo, /- Earthquake/);
    assert.deepEqual(d.problemi, []);
});

// ===================================================
// squadreCpu (cpu-partita.js): memoria e "firma" del formato
// ===================================================
// cpu-partita.js è un modulo ES che importa i file del sito: lo si esegue qui con gli stessi file e un browser finto
async function creaCpuPartita() {
    const { sim } = await caricaSim();
    const src = leggi('cpu-partita.js').replace(/^import .*$/gm, '').replace(/^export (async )?function/gm, '$1function').replace(/^export const/gm, 'const');
    const memoriaBrowser = new Map();
    const scaricati = [];
    const ambiente = {
        self: { TeamCpu: T, CpuIa: require('../docs/cpu-ia.js') },
        Dex: sim.Dex, TeamValidator: sim.TeamValidator,
        localStorage: { getItem: k => (memoriaBrowser.has(k) ? memoriaBrowser.get(k) : null), setItem: (k, v) => memoriaBrowser.set(k, v) },
        fetch: async p => { scaricati.push(p); return { ok: true, json: async () => leggiJson(p) }; }
    };
    const modulo = new Function(...Object.keys(ambiente), src + '\nreturn { squadreCpu, nuovoCervello, sceglieTeam, VERSIONE_TEAM_CPU };')(...Object.values(ambiente));
    return { modulo, memoriaBrowser, scaricati };
}
const regPiccolo = (extra = {}) => ({ ...regOU, restrizioni: { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } }, ...extra });

test('squadreCpu: dodici team per il formato, ricordati per la volta dopo', async () => {
    const { modulo, memoriaBrowser, scaricati } = await creaCpuPartita();
    const a = await modulo.squadreCpu(regPiccolo());
    assert.equal(a.team.length, 12);
    assert.ok(scaricati.length > 0);
    assert.equal(memoriaBrowser.size, 1, 'i team vanno nella memoria del browser');

    const prima = scaricati.length;
    const b = await modulo.squadreCpu(regPiccolo());
    assert.deepEqual(b.team, a.team);
    assert.equal(scaricati.length, prima, 'la seconda volta non scarica nulla');

    // da una pagina nuova (memoria interna vuota) si legge dal browser senza rifare i team né scaricare file
    const { modulo: altro, scaricati: scaricatiAltro } = await creaCpuPartita();
    scaricatiAltro.length = 0;
    const origine = [...memoriaBrowser.entries()][0];
    // si copia la memoria del browser nel nuovo ambiente: stesso formato → stessi team
    const c = await altro.squadreCpu(regPiccolo());
    assert.deepEqual(c.team.map(t => t.testo), a.team.map(t => t.testo), `team deterministici (${origine[0]})`);
});

test('squadreCpu: se il formato cambia (regole nuove) i team si rifanno da soli', async () => {
    const { modulo, memoriaBrowser } = await creaCpuPartita();
    const a = await modulo.squadreCpu(regPiccolo());
    const b = await modulo.squadreCpu(regPiccolo({ battleStyle: 'doubles' }));
    assert.notDeepEqual(a.team.map(t => t.testo), b.team.map(t => t.testo));
    const c = await modulo.squadreCpu(regPiccolo({ restrizioni: { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' }, bst: { mode: 'SPECIFIC', operator: 'lt', value: 500 } } } }));
    assert.notDeepEqual(a.team.map(t => t.testo), c.team.map(t => t.testo));
    // stessa categoria, firma diversa: nel browser resta l'ultima
    assert.equal(memoriaBrowser.size, 1);
    // un formato mai visto, con un altro nome, ha i suoi team
    const d = await modulo.squadreCpu(regPiccolo({ categoria: 'Formato nuovo' }));
    assert.equal(d.team.length, 12);
    assert.equal(memoriaBrowser.size, 2);
});

test('squadreCpu: la memoria del browser vecchia o rovinata non fa danni', async () => {
    const { modulo, memoriaBrowser } = await creaCpuPartita();
    memoriaBrowser.set('squadreCpu|ou', 'questo non è json');
    const a = await modulo.squadreCpu(regPiccolo());
    assert.equal(a.team.length, 12);
    memoriaBrowser.set('squadreCpu|ou', JSON.stringify({ firma: 'vecchia', team: [{ nome: 'x', testo: 'y', specie: [] }] }));
    const { modulo: nuovo } = await creaCpuPartita();
    const b = await nuovo.squadreCpu(regPiccolo());
    assert.equal(b.team.length, 12, 'con una firma diversa si rifanno');
});

test('squadreCpu: un formato senza abbastanza Pokémon dà zero team e un avviso', async () => {
    const { modulo } = await creaCpuPartita();
    const r = await modulo.squadreCpu(regPiccolo({ categoria: 'Piccolo', restrizioni: { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' }, name_starts: { mode: 'VALUE', operator: 'STARTS_WITH', value: 'x' } } } }));
    assert.equal(r.team.length, 0);
    assert.ok(r.avvisi.length);
});

test('sceglieTeam: a caso, diverso dal precedente quando si può', async () => {
    const { modulo } = await creaCpuPartita();
    const team = Array.from({ length: 12 }, (_, i) => ({ nome: 'T' + i }));
    const viste = new Set();
    for (let i = 0; i < 200; i++) {
        const k = modulo.sceglieTeam(team, 4);
        assert.notEqual(k, 4);
        viste.add(k);
    }
    assert.ok(viste.size >= 8, 'tutti gli altri team possono uscire');
    assert.equal(modulo.sceglieTeam([{ nome: 'unico' }], 0), 0, 'con un solo team si rigioca quello');
});

// ===================================================
// CABLAGGIO NELLE PAGINE
// ===================================================
test('battle-ui.js: la modalità CPU è collegata (avvio, log, richieste, errori, fine partita)', () => {
    const ui = leggi('battle-ui.js');
    assert.match(ui, /import \{ squadreCpu, nuovoCervello, sceglieTeam \} from '\.\/cpu-partita\.js'/);
    assert.match(ui, /import \{ caricaMatch, caricaPerProva \} from '\.\/team-sito\.js'/);
    assert.match(ui, /parametri\.get\('cpu'\)[\s\S]{0,60}preparaCpu\(parametri\.get\('team'\)\)/);
    assert.match(ui, /return !online && lato === 'p2' && \(!!cpu \|\| \$\('bot-p2'\)\.checked\)/, 'con la CPU il lato 2 è sempre automatico');
    assert.match(ui, /if \(cpu && cpu\.cerebro\) cpu\.cerebro\.osserva\(righe\)/, 'la CPU legge il log');
    assert.match(ui, /cpu\.cerebro\.scegli\(p\.grezza, \{ errori: cpu\.errori \}\)/, 'e sceglie con il numero di rifiuti');
    assert.match(ui, /if \(cpu && lato === 'p2'\) cpu\.errori\+\+/, 'dopo un rifiuto prova la scelta successiva');
    assert.match(ui, /richiesta\.rqid !== cpu\.rqid/, 'ogni richiesta nuova riparte dalla scelta migliore');
    assert.match(ui, /else if \(cpu\) \{\s*mostraFineCpu\(vincitore\);/);
    assert.match(ui, /cpu\.cerebro = nuovoCervello\('p2'\)/, 'un cervello nuovo a ogni partita');
    // il giocatore non vede il team della CPU (solo le specie, come in una partita vera)
    assert.match(ui, /openSheet: false,\s*latiNoti: \['p1'\]/);
    // se la CPU va in errore si gioca una mossa valida a caso: la partita non si blocca
    assert.match(ui, /catch \(errore\) \{\s*console\.error\('CPU:', errore\);\s*scelta = sceltaCasuale/);
});

test('battle-ui.js: a fine partita rivincita, altro team CPU a caso, ritorno al Box', () => {
    const ui = leggi('battle-ui.js');
    assert.match(ui, /iniziaContro\(cpu\.indice\)\s*\}, 'Rematch · same CPU team'/);
    assert.match(ui, /iniziaContro\(sceglieTeam\(cpu\.team, cpu\.indice\)\)\s*\}, 'Another random CPU team'/);
    assert.match(ui, /href: 'box\.html' \}, 'Back to Box'/);
    assert.match(ui, /'You win!'/);
    assert.match(ui, /'The CPU wins!'/);
    // i pulsanti stanno anche nel pannello sotto lo schermo (telefoni)
    assert.match(ui, /class: 'riga-azioni centrata azioni-cpu'/);
    assert.match(ui, /document\.body\.classList\.add\('prova-cpu'\)/);
});

test('style-battle.css: sui telefoni i pulsanti di fine partita passano nel pannello e il cartello resta piccolo', () => {
    const css = leggi('style-battle.css');
    assert.match(css, /\.riga-azioni\.azioni-cpu \{ display: none;/, 'di base il pannello non li mostra (c\'è il cartello)');
    const telefono = css.slice(css.indexOf('@media (max-width: 699px)'));
    assert.match(telefono, /\.riga-azioni\.azioni-cpu \{ display: flex; \}/);
    assert.match(telefono, /body\.prova-cpu #azioni-vittoria \{ display: none; \}/);
    assert.match(telefono, /\.esito-card \{ max-width: calc\(100% - 16px\)/);
});

test('box.html: il pulsante per provare un team contro la CPU è sulla card (anche se il team è bloccato) e nel dettaglio', () => {
    const box = leggi('box.html');
    assert.match(box, /function provaControCpu\(id\) \{\s*window\.location\.href = 'battle\.html\?cpu=1&team=' \+ encodeURIComponent\(id\);/);
    assert.match(box, /provaControCpu\('\$\{team\.id\}'\)/, 'sulla card');
    assert.match(box, /title="Practice this team against the CPU">🎮<\/button>/);
    assert.match(box, /class="tb-prova-cpu"/, 'nel dettaglio');
    assert.match(box, /\$\{tbHtmlTagDettaglio\(team\.id\)\}/);
    // le azioni di modifica e cancellazione restano solo per i team non bloccati
    assert.match(box, /\$\{!isBloccato \? `\s*<button onclick="event\.stopPropagation\(\); caricaTeamPerModifica/);
    // sui telefoni stretti l'intestazione della card va a capo: tre azioni, categoria e punteggio non stanno in una riga
    assert.match(leggi('style-box.css'), /@media \(max-width: 400px\) \{\s*\.card-header \{ flex-wrap: wrap;[\s\S]*?\.card-actions \{ order: 3; flex-basis: 100%;/);
    const css = leggi('dettagli.css');
    assert.match(css, /#teamModal \.tb-prova-cpu \{/);
    assert.match(css, /#teamModal \.tb-prova-cpu:focus-visible/);
});

test('battle.html ha i pezzi che la modalità CPU usa e nessun file nuovo da caricare a mano', () => {
    const html = leggi('battle.html');
    for (const id of ['opzione-bot', 'link-hub', 'azioni-vittoria', 'sotto-vittoria', 'testo-vittoria']) assert.match(html, new RegExp(`id="${id}"`));
    // i moduli della CPU si caricano da soli dagli import di battle-ui.js
    const partita = leggi('cpu-partita.js');
    for (const f of ['cpu-conoscenza.js', 'cpu-calcolo.js', 'cpu-ia.js', 'formato-pool.js', 'team-cpu.js', 'pkmn-sim.js']) assert.match(partita, new RegExp(`import '?[^;]*\\./${f.replace('.', '\\.')}`), f);
});
