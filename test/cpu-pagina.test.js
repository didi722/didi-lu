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
// nuovoTeamCpu (cpu-partita.js): un team a caso a ogni sfida, la parte lenta una volta sola per pagina
// ===================================================
// cpu-partita.js è un modulo ES che importa i file del sito: lo si esegue qui con gli stessi file e un browser finto
async function creaCpuPartita({ fetchFallisce = 0 } = {}) {
    const { sim } = await caricaSim();
    const src = leggi('cpu-partita.js').replace(/^import .*$/gm, '').replace(/^export (async )?function/gm, '$1function').replace(/^export const/gm, 'const');
    // il localStorage di un browser: i metodi non si elencano, le voci sì (Object.keys(localStorage) le dà)
    const memoriaBrowser = {};
    const localStorage = {};
    for (const [nome, f] of Object.entries({
        getItem: k => (k in memoriaBrowser ? memoriaBrowser[k] : null), setItem: (k, v) => { memoriaBrowser[k] = String(v); localStorage[k] = String(v); },
        removeItem: k => { delete memoriaBrowser[k]; delete localStorage[k]; }
    })) Object.defineProperty(localStorage, nome, { value: f, enumerable: false });
    const scaricati = [];
    let fallimenti = fetchFallisce;
    const ambiente = {
        self: { TeamCpu: T, CpuIa: require('../docs/cpu-ia.js') },
        Dex: sim.Dex, TeamValidator: sim.TeamValidator, localStorage,
        fetch: async p => {
            scaricati.push(p);
            if (fallimenti-- > 0) throw new Error('rete assente');
            return { ok: true, json: async () => leggiJson(p) };
        }
    };
    const modulo = new Function(...Object.keys(ambiente), src + '\nreturn { nuovoTeamCpu, nuovoCervello, nomeNeutro };')(...Object.values(ambiente));
    return { modulo, memoriaBrowser, localStorage, scaricati };
}
const regPiccolo = (extra = {}) => ({ ...regOU, restrizioni: { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' } } }, ...extra });
const specieDi = t => t.specie.map(x => x.toLowerCase());
const insieme = (a, b) => a.filter(x => b.includes(x)).length;

test('nuovoTeamCpu: un team legale, nuovo a ogni chiamata, numerato "Team 1", "Team 2"...', async () => {
    const { modulo } = await creaCpuPartita();
    const viste = [];
    for (let i = 1; i <= 6; i++) {
        const r = await modulo.nuovoTeamCpu(regPiccolo());
        assert.ok(r.team, `team ${i}`);
        assert.equal(r.team.numero, i, 'numero progressivo della pagina');
        assert.equal(modulo.nomeNeutro(r.team), `Team ${i}`);
        assert.equal(r.team.specie.length, 6);
        assert.match(r.team.testo, /^[^\n]+(\n[^\n]*)*$/);
        assert.ok(['bilanciato', 'offensivo', 'bulky', 'pioggia', 'sole', 'sabbia', 'neve'].includes(r.team.piano), r.team.piano);
        assert.ok(r.team.strategia && r.team.strategia.coerente === true);
        viste.push(r.team);
    }
    assert.equal(new Set(viste.map(t => t.testo)).size, 6, 'mai lo stesso team due volte');
    // team consecutivi: mai quattro Pokémon uguali (i "recenti" della sessione)
    for (let i = 1; i < viste.length; i++) assert.ok(insieme(specieDi(viste[i - 1]), specieDi(viste[i])) < 4, `team ${i} e ${i + 1} troppo simili`);
});

test('nuovoTeamCpu: la parte lenta si fa una volta sola per formato, poi niente scaricamenti né memoria nel browser', async () => {
    const { modulo, memoriaBrowser, scaricati } = await creaCpuPartita();
    await modulo.nuovoTeamCpu(regPiccolo());
    assert.ok(scaricati.length > 0);
    const prima = scaricati.length;
    for (let i = 0; i < 3; i++) await modulo.nuovoTeamCpu(regPiccolo());
    assert.equal(scaricati.length, prima, 'le volte dopo non scarica nulla');
    assert.deepEqual(Object.keys(memoriaBrowser), [], 'nessun team salvato nel browser');
    // due richieste insieme condividono la stessa preparazione
    const { modulo: altro, scaricati: scaricatiAltro } = await creaCpuPartita();
    const [a, b] = await Promise.all([altro.nuovoTeamCpu(regPiccolo()), altro.nuovoTeamCpu(regPiccolo())]);
    assert.ok(a.team && b.team);
    assert.equal(scaricatiAltro.filter(p => p.includes('pokedex_base')).length, 1, 'il pokédex si scarica una volta');
});

test('nuovoTeamCpu: con lo stesso seme, nella stessa pagina appena aperta, esce lo stesso team (serve alle prove)', async () => {
    const { modulo: uno } = await creaCpuPartita();
    const { modulo: due } = await creaCpuPartita();
    const a = await uno.nuovoTeamCpu(regPiccolo(), { seme: 'prova' });
    const b = await due.nuovoTeamCpu(regPiccolo(), { seme: 'prova' });
    assert.equal(a.team.testo, b.team.testo);
    const c = await due.nuovoTeamCpu(regPiccolo(), { seme: 'altro' });
    assert.notEqual(c.team.testo, a.team.testo);
});

test('nuovoTeamCpu: se il formato cambia (regole nuove) si prepara quello nuovo da solo', async () => {
    const { modulo, scaricati } = await creaCpuPartita();
    const a = await modulo.nuovoTeamCpu(regPiccolo(), { seme: 's' });
    const prima = scaricati.length;
    const b = await modulo.nuovoTeamCpu(regPiccolo({ battleStyle: 'doubles' }), { seme: 's' });
    assert.ok(scaricati.length > prima, 'un formato diverso ha la sua preparazione');
    assert.notEqual(a.team.testo, b.team.testo);
    const dopo = scaricati.length;
    await modulo.nuovoTeamCpu(regPiccolo(), { seme: 't' });
    assert.equal(scaricati.length, dopo, 'quello di prima è ancora in memoria');
    // un formato mai visto, con un altro nome, ha i suoi team e i suoi numeri continuano
    const d = await modulo.nuovoTeamCpu(regPiccolo({ categoria: 'Formato nuovo' }));
    assert.ok(d.team);
    assert.equal(d.team.numero, 4);
});

test('nuovoTeamCpu: i team vecchi salvati nel browser (di quando si facevano in anticipo) si ripuliscono', async () => {
    const { modulo, localStorage } = await creaCpuPartita();
    localStorage.setItem('squadreCpu|ou', JSON.stringify({ firma: 'x', team: [] }));
    localStorage.setItem('squadreCpu|vgc', 'altro');
    localStorage.setItem('temaSito', 'arcade');
    await modulo.nuovoTeamCpu(regPiccolo());
    assert.deepEqual(Object.keys(localStorage), ['temaSito'], 'le altre voci restano');
});

test('nuovoTeamCpu: un formato senza abbastanza Pokémon dà nessun team e un avviso', async () => {
    const { modulo } = await creaCpuPartita();
    const r = await modulo.nuovoTeamCpu(regPiccolo({ categoria: 'Piccolo', restrizioni: { pokemon: { is_legendary: { mode: 'SPECIFIC', value: 'allowed' }, name_starts: { mode: 'VALUE', operator: 'STARTS_WITH', value: 'x' } } } }));
    assert.equal(r.team, null);
    assert.ok(r.avvisi.length);
});

test('nuovoTeamCpu: se il caricamento fallisce (rete) l\'errore arriva a chi chiama e la volta dopo si riprova', async () => {
    const { modulo } = await creaCpuPartita({ fetchFallisce: 1 });
    await assert.rejects(modulo.nuovoTeamCpu(regPiccolo()), /rete assente/);
    const r = await modulo.nuovoTeamCpu(regPiccolo());
    assert.ok(r.team, 'al secondo tentativo funziona');
});

test('nomeNeutro: la CPU si presenta come "Team N", mai col piano di gioco né col Pokémon asso', async () => {
    const { modulo } = await creaCpuPartita();
    assert.equal(modulo.nomeNeutro({ numero: 7, nome: 'CPU Tailwind · Calyrex-Shadow' }), 'Team 7');
    assert.equal(modulo.nomeNeutro({ nome: 'CPU Trick Room · Hatterene' }), 'Team 1');
    assert.equal(modulo.nomeNeutro(undefined), 'Team 1');
    // sui team veri: nessun nome mostrato contiene il piano o la specie
    for (let i = 0; i < 5; i++) {
        const { team } = await modulo.nuovoTeamCpu(regPiccolo());
        const nome = modulo.nomeNeutro(team);
        assert.match(nome, /^Team \d+$/);
        assert.ok(!/cpu|tailwind|trick|rain|sun|sand|snow|balanced|offense|stall/i.test(nome), nome);
    }
});

// ===================================================
// CABLAGGIO NELLE PAGINE
// ===================================================
test('battle-ui.js: la modalità CPU è collegata (avvio, log, richieste, errori, fine partita)', () => {
    const ui = leggi('battle-ui.js');
    assert.match(ui, /import \{ nuovoTeamCpu, nuovoCervello, nomeNeutro \} from '\.\/cpu-partita\.js'/);
    assert.match(ui, /import \{ caricaMatch, caricaPerProva \} from '\.\/team-sito\.js'/);
    assert.match(ui, /parametri\.get\('cpu'\)[\s\S]{0,60}preparaCpu\(parametri\.get\('team'\)\)/);
    assert.match(ui, /return !online && lato === 'p2' && \(!!cpu \|\| \$\('bot-p2'\)\.checked\)/, 'con la CPU il lato 2 è sempre automatico');
    assert.match(ui, /if \(cpu && cpu\.cerebro\) cpu\.cerebro\.osserva\(righe\)/, 'la CPU legge il log');
    assert.match(ui, /cpu\.cerebro\.scegli\(p\.grezza, \{ errori: cpu\.errori \}\)/, 'e sceglie con il numero di rifiuti');
    assert.match(ui, /if \(cpu && lato === 'p2'\) cpu\.errori\+\+/, 'dopo un rifiuto prova la scelta successiva');
    assert.match(ui, /richiesta\.rqid !== cpu\.rqid/, 'ogni richiesta nuova riparte dalla scelta migliore');
    assert.match(ui, /else if \(cpu\) \{\s*mostraFineCpu\(vincitore\);/);
    assert.match(ui, /cpu\.cerebro = nuovoCervello\('p2', \{ piano: cpu\.team && cpu\.team\.piano \}\)/, 'un cervello nuovo a ogni partita, che conosce il piano del team');
    // il giocatore non vede il team della CPU (solo le specie, come in una partita vera)
    assert.match(ui, /openSheet: false,\s*latiNoti: \['p1'\]/);
    // se la CPU va in errore si gioca una mossa valida a caso: la partita non si blocca
    assert.match(ui, /catch \(errore\) \{\s*console\.error\('CPU:', errore\);\s*scelta = sceltaCasuale/);
});

test('battle-ui.js: il team della CPU compare ovunque col nome neutro, mai col suo nome vero', () => {
    const ui = leggi('battle-ui.js');
    assert.match(ui, /config\.p2\.nomeTeam = nomeNeutro\(team\)/);
    assert.match(ui, /return `\$\{config\.p1\.nomeTeam\} vs \$\{config\.p2\.nomeTeam\}\$\{nota \? ` · \$\{nota\}` : ''\}`/, 'anche nel cartello di fine partita');
    assert.match(ui, /mostraEsito\(titolo, \{ sotto: riepilogoFineCpu\(\), azioni: azioniCpu\(\) \}\)/);
    assert.ok(!/cpu\.team\.nome/.test(ui), 'nessun punto legge il nome vero del team della CPU');
    assert.ok(!/config\.p2\.nomeTeam = t\.nome/.test(ui));
});

test('battle-ui.js: la CPU compone un team a caso quando inizia la sfida; a fine partita rivincita (stesso team), un team nuovo, ritorno al Box', () => {
    const ui = leggi('battle-ui.js');
    // all'inizio della prova: un team, composto adesso (non più uno scelto da un elenco già pronto)
    assert.match(ui, /primo = await nuovoTeamCpu\(dati\.regolamento, \{ iniziali: dati\.iniziali \}\);/);
    assert.match(ui, /function iniziaContro\(team\) \{\s*cpu\.team = team;/);
    // rivincita: lo stesso team; altro team: se ne compone uno nuovo (il pulsante si disabilita mentre lavora)
    assert.match(ui, /iniziaContro\(cpu\.team\) \}, 'Rematch · same CPU team'/);
    assert.match(ui, /ev\.currentTarget\.disabled = true; altroTeamCpu\(\); \} \}, 'Another random CPU team'/);
    assert.match(ui, /async function altroTeamCpu\(\) \{[\s\S]*nuovoTeamCpu\(cpu\.giocatore\.regolamento, \{ iniziali: cpu\.giocatore\.iniziali \}\)[\s\S]*iniziaContro\(r\.team\)/);
    // se non si riesce, resta il cartello con un avviso (e i pulsanti tornano attivi)
    assert.match(ui, /cpu\.avviso = `Couldn't build another CPU team: \$\{errore\.message\}`;\s*aggiornaFineCpu\(\);/);
    assert.ok(!/sceglieTeam|squadreCpu/.test(ui), 'i team in anticipo non ci sono più');
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
    assert.match(box, /\$\{!isBloccato \? `\s*<button type="button" class="card-azione azione-modifica" onclick="event\.stopPropagation\(\); caricaTeamPerModifica/);
    // la striscia della card (box-team.css) tiene in una riga sola categoria, le tre azioni e il bilancio, anche sui telefoni stretti:
    // niente più riga a capo (le regole di prima sono tolte da style-box.css) e sotto i 360px i pallini lasciano il posto alla categoria
    assert.ok(!/\.card-actions \{ order: 3/.test(leggi('style-box.css')), 'la regola vecchia (azioni a capo) non c\'è più');
    const striscia = leggi('box-team.css');
    assert.match(striscia, /\.azione-cpu:hover/);
    assert.match(striscia, /@media \(max-width: 360px\) \{[^}]*\.card-header \{ padding-left: 10px;/);
    const css = leggi('dettagli.css');
    assert.match(css, /#teamModal \.tb-prova-cpu \{/);
    assert.match(css, /#teamModal \.tb-prova-cpu:focus-visible/);
});

test('battle.html ha i pezzi che la modalità CPU usa e nessun file nuovo da caricare a mano', () => {
    const html = leggi('battle.html');
    for (const id of ['opzione-bot', 'link-hub', 'azioni-vittoria', 'sotto-vittoria', 'testo-vittoria']) assert.match(html, new RegExp(`id="${id}"`));
    // i moduli della CPU si caricano da soli dagli import di battle-ui.js
    const partita = leggi('cpu-partita.js');
    for (const f of ['cpu-conoscenza.js', 'cpu-calcolo.js', 'cpu-ia.js', 'formato-pool.js', 'consigli.js', 'team-cpu.js', 'pkmn-sim.js']) assert.match(partita, new RegExp(`import '?[^;]*\\./${f.replace('.', '\\.')}`), f);
});
