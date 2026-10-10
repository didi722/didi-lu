'use strict';
// La scheda dei due allenatori nel simulatore (docs/scheda-battaglia.js): titolo, ELO e posizione, medaglie da allenatore, badge del
// team in campo e il tondino con i fiocchi su ogni Pokémon. Sono dati e HTML: si provano con i moduli veri del sito, senza browser.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SB = require('../docs/scheda-battaglia.js');
const Fiocchi = require('../docs/fiocchi.js');
const BadgeTeam = require('../docs/badge-team.js');
const BadgeAllenatore = require('../docs/badge-allenatore.js');
const Titoli = require('../docs/titoli.js');
const PaginaPubblica = require('../docs/pagina-pubblica.js');
const Statistiche = require('../docs/statistiche.js');

const DOCS = path.join(__dirname, '..', 'docs');
const DIP = { Fiocchi, BadgeTeam, BadgeAllenatore, Titoli, PaginaPubblica, Statistiche };

// ---------- un piccolo campionato: Didi (primo, titolo visibile) e Lu (secondo, titolo nascosto) ----------
const lato = (portati, svenuti, pokemon) => ({
    nome: '', portati, svenuti,
    pokemon: pokemon.map(([specie, o = {}]) => ({ specie, nome: '', portato: true, titolare: false, koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false, ...o }))
});
const set = (vincitore, mioLato, altro) => ({ v: 1, turni: 6, vincitore, p1: mioLato, p2: altro });
const avversario = lato(4, 4, [['Dragonite'], ['Tornadus'], ['Amoonguss'], ['Rillaboom']]);
const match = (numero, s1, s2, sets) => ({
    player1: 'Didi', player1Id: 'didi', player2: 'Lu', player2Id: 'lu', winnerId: s1 > s2 ? 'didi' : 'lu', team1: 'Alfa', team2: 'Beta',
    score: `${s1}-${s2}`, p1score: s1, p2score: s2, p1points: 0, p2points: 0, categoria: 'VGC', data: `2026-03-0${numero}`,
    setStats: Object.fromEntries(sets.map((st, i) => ['set' + (i + 1), st]))
});
// due Garchomp nello stesso team: il tondino deve andare al giusto
const G = ['Garchomp', { koFatti: 2 }], G2 = ['Garchomp', { koFatti: 0, svenuto: true }], R = ['Rotom-Wash', { koFatti: 1 }];
const partite = { };
for (let n = 1; n <= 6; n++) partite['match' + n] = match(n, 2, 0, [set('p1', lato(3, 0, [G, G2, R]), avversario), set('p1', lato(3, 0, [G, G2, R]), avversario)]);
const DATI = {
    seasons: { s1: { info: { name: 'Season 1', status: 'closed' }, showdowns: { sd1: { info: { categoria: 'VGC', data: '2026-03-01' }, matches: partite } } } },
    players: {
        didi: {
            info: { name: 'Didi', color: '#31c489', title: 'Ghost Gym Leader' },
            stats: { badges: { maxcleanstrike: 7, maxwonstrike: 10, maxsdstrike: 5 }, 'individual-stats': { ranking: 1210, showdownsPlayed: 5 } },
            teams: { t1: { nome: 'Alfa', categoria: 'VGC', pokemon: [{ nome: 'Garchomp' }, { nome: 'Garchomp' }, { nome: 'Rotom-Wash' }] } }
        },
        lu: {
            info: { name: 'Lu', title: 'Rain Dancer', pagina: { targhette: { titolo: 'nessuno' } } },   // la pagina pubblica sta in info/pagina
            stats: { badges: { maxcleanstrike: 0, maxwonstrike: 0, maxsdstrike: 0 }, 'individual-stats': { ranking: 1100, showdownsPlayed: 4 } },
            teams: { t1: { nome: 'Beta', categoria: 'VGC', pokemon: [{ nome: 'Dragonite' }] } }
        },
        zed: { info: { name: 'Zed' }, stats: { 'individual-stats': { ranking: 900, showdownsPlayed: 1 } }, teams: {} }
    }
};
function dbFinto() {
    const letture = [];
    return {
        letture,
        ref(percorso) {
            letture.push(percorso);
            const valore = percorso === 'seasons' ? DATI.seasons : DATI.players;
            return { once: async () => ({ val: () => valore }) };
        }
    };
}
const carica = (ids, db = dbFinto()) => { Fiocchi.svuotaCache(); return SB.carica(db, ids, DIP); };

// ---------- il titolo ----------
test('titoloVisibile: quello scelto, a meno che nella pagina pubblica la targhetta del titolo sia nascosta', () => {
    assert.equal(SB.titoloVisibile({ title: 'Ghost Gym Leader' }, PaginaPubblica), 'Ghost Gym Leader');
    assert.equal(SB.titoloVisibile({ title: '  Ghost Gym Leader ' }, PaginaPubblica), 'Ghost Gym Leader');
    assert.equal(SB.titoloVisibile({ title: 'Rain Dancer', pagina: { targhette: { titolo: 'nessuno' } } }, PaginaPubblica), '', 'nascosto nella pagina pubblica: nascosto anche qui');
    assert.equal(SB.titoloVisibile({ title: 'Rain Dancer', pagina: { targhette: { titolo: 'palco' } } }, PaginaPubblica), 'Rain Dancer', 'sul palco o nel nome: si vede');
    assert.equal(SB.titoloVisibile({ title: '' }, PaginaPubblica), '');
    assert.equal(SB.titoloVisibile(null, PaginaPubblica), '');
    assert.equal(SB.titoloVisibile({ title: 'Rain Dancer', pagina: { targhette: { titolo: 'nessuno' } } }), '', 'anche senza il modulo della pagina pubblica');
});

// ---------- le medaglie da allenatore ----------
test('medaglieAllenatore: il fondatore per primo, poi per livello; senza badge, niente', () => {
    const m = SB.medaglieAllenatore({ id: 'didi', statsBadge: { maxcleanstrike: 7, maxwonstrike: 10, maxsdstrike: 5 }, lista: null }, DIP);
    assert.deepEqual(m.map(x => x.id), ['founder', 'clean', 'won', 'sd']);
    assert.deepEqual(m.map(x => x.livello), ['founder', 'silver', 'silver', 'bronze']);
    assert.ok(m.every(x => x.nome && x.img && x.livelloNome), 'ogni medaglia ha nome, immagine e livello');
    assert.deepEqual(SB.medaglieAllenatore({ id: 'zed', statsBadge: {}, lista: null }, DIP), []);
    assert.deepEqual(SB.medaglieAllenatore({ id: 'zed' }, {}), [], 'senza moduli non si rompe');
});

// ---------- il caricamento ----------
test('carica: titolo, ELO, posizione e medaglie di tutti e due; la CPU (senza id) non ha scheda', async () => {
    const r = await carica({ p1: 'didi', p2: 'lu' });
    assert.equal(r.p1.id, 'didi');
    assert.equal(r.p1.nome, 'Didi');
    assert.equal(r.p1.titolo, 'Ghost Gym Leader');
    assert.equal(r.p1.elo, 1210);
    assert.equal(r.p1.posizione, '#1');
    assert.ok(r.p1.medaglie.length >= 4);
    assert.equal(r.p2.titolo, '', 'Lu ha nascosto il titolo');
    assert.equal(r.p2.elo, 1100);
    assert.equal(r.p2.posizione, '#2');
    assert.ok(r.risultato && r.risultato.pokemon.length > 0);
    const cpu = await carica({ p1: 'didi', p2: '' });
    assert.ok(cpu.p1 && cpu.p2 === null);
});

test('carica: id con maiuscole diverse, giocatore che non esiste, nessuno da cercare, lettura che fallisce', async () => {
    const r = await carica({ p1: 'DIDI', p2: 'nessuno' });
    assert.equal(r.p1.id, 'didi');
    assert.equal(r.p2, null);
    const db = dbFinto();
    assert.deepEqual(await carica({ p1: '', p2: '' }, db), { p1: null, p2: null, risultato: null });
    assert.equal(db.letture.length, 0, 'senza nessuno da cercare non si legge nulla');
    assert.deepEqual(await SB.carica(null, { p1: 'didi' }, DIP), { p1: null, p2: null, risultato: null });
    Fiocchi.svuotaCache();
    const rotto = { ref: () => ({ once: async () => { throw new Error('offline'); } }) };
    const orig = console.warn; console.warn = () => {};
    try { assert.deepEqual(await SB.carica(rotto, { p1: 'didi' }, DIP), { p1: null, p2: null, risultato: null }); }
    finally { console.warn = orig; }
    Fiocchi.svuotaCache();
});

test('carica: un giocatore con poche partite non ha la posizione ("Unranked" non si mostra)', async () => {
    const r = await carica({ p1: 'zed', p2: 'didi' });
    assert.equal(r.p1.posizione, '');
    assert.equal(r.p1.elo, 900);
    assert.deepEqual(r.p1.medaglie, []);
    assert.equal(r.p2.posizione, '#1');
});

// ---------- l'HTML ----------
test('htmlScheda: titolo, ELO, posizione e medaglie; senza titolo o medaglie le righe non ci sono', async () => {
    const r = await carica({ p1: 'didi', p2: 'lu' });
    const a = SB.htmlScheda(r.p1);
    assert.match(a, /class="scheda-titolo">Ghost Gym Leader</);
    assert.match(a, /ELO <b>1210<\/b>/);
    assert.match(a, /class="scheda-posizione"[^>]*>#1</);
    assert.equal((a.match(/class="bt-mini /g) || []).length, Math.min(SB.MAX_MEDAGLIE, r.p1.medaglie.length) + (r.p1.medaglie.length > SB.MAX_MEDAGLIE ? 1 : 0), 'al massimo cinque medaglie e "+n"');
    const b = SB.htmlScheda(r.p2);
    assert.doesNotMatch(b, /scheda-titolo/);
    assert.doesNotMatch(b, /scheda-medaglie/);
    assert.match(b, /ELO <b>1100<\/b>/);
    assert.equal(SB.htmlScheda(null), '');
});

test('htmlScheda: il testo che entra nell\'HTML è protetto', () => {
    const h = SB.htmlScheda({ id: 'x', titolo: '<img src=x onerror=alert(1)>', elo: 1000, posizione: '', medaglie: [{ id: 'a', nome: '"><b>', livello: 'gold', livelloNome: 'Gold', img: 'a.png', testo: '<i>', icona: '★' }] });
    assert.doesNotMatch(h, /<img src=x/);
    assert.doesNotMatch(h, /<b>"/);
    assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('htmlBadgeTeam: le medagliette vinte dal team in campo (senza conto né progresso); vuoto se non si sa il team o non ha badge', async () => {
    const r = await carica({ p1: 'didi', p2: 'lu' });
    const h = SB.htmlBadgeTeam(r.risultato, r.p1, 'Alfa', DIP);
    assert.match(h, /class="scheda-team-badge"/);
    assert.match(h, /class="bt-barra-mini"/);
    assert.match(h, /class="bt-mini /);
    assert.match(h, /title="[^"]*\n?[^"]*"/, 'la descrizione al passaggio');
    assert.doesNotMatch(h, /🏅 \d+\/\d+|bt-conto-chip|bt-apri|bt-pop/, 'niente conto x/10 né progresso: quello è solo nel Box del giocatore');
    assert.equal(SB.htmlBadgeTeam(r.risultato, r.p1, 'alfa', DIP), h, 'maiuscole del nome del team non contano');
    assert.equal(SB.htmlBadgeTeam(r.risultato, r.p1, 'Altro team', DIP), '');
    assert.equal(SB.htmlBadgeTeam(r.risultato, r.p1, '', DIP), '');
    assert.equal(SB.htmlBadgeTeam(r.risultato, null, 'Alfa', DIP), '');
    assert.equal(SB.htmlBadgeTeam(null, r.p1, 'Alfa', DIP), '');
});

test('htmlFiocchiPokemon: le medagliette dei fiocchi di ciascun Pokémon (con l\'elenco al passaggio), anche con la stessa specie due volte', async () => {
    const r = await carica({ p1: 'didi', p2: 'lu' });
    const nomi = ['Garchomp', 'Garchomp', 'Rotom-Wash', 'Amoonguss'];
    const t = i => SB.htmlFiocchiPokemon(r.risultato, r.p1, 'Alfa', nomi, i, DIP);
    assert.match(t(0), /class="fiocco-medaglie"/);
    assert.match(t(2), /class="fiocco-medaglie"/);
    assert.equal(t(3), '', 'chi non è mai sceso in campo non ha fiocchi');
    // il numero dei fiocchi presi sta nell'etichetta ("3 ribbons") e nel titolo dell'elenco ("Ribbons 3/9")
    const conto = h => Number((h.match(/aria-label="(\d+) ribbons?"/) || [])[1]);
    // i due Garchomp sono Pokémon diversi: il primo ha KO e non è mai svenuto, il secondo è sempre svenuto (Survivor e KO diversi)
    const primo = Fiocchi.trova(r.risultato, { player: 'didi', team: 'Alfa', specie: 'Garchomp', ordinale: 1 });
    const secondo = Fiocchi.trova(r.risultato, { player: 'didi', team: 'Alfa', specie: 'Garchomp', ordinale: 2 });
    assert.ok(primo && secondo && primo !== secondo, 'due righe di statistiche distinte');
    assert.equal(conto(t(0)), Fiocchi.guadagnati(Fiocchi.calcola(primo)).length);
    assert.equal(conto(t(1)), Fiocchi.guadagnati(Fiocchi.calcola(secondo)).length);
    assert.match(t(0), /<ul>.*<li class="fiocco-t-riga/, 'l\'elenco con livello e numeri');
    assert.doesNotMatch(t(0), /fiocco-tondino|bt-pop|bt-apri/);
    assert.equal(t(9), '');
    assert.equal(SB.htmlFiocchiPokemon(r.risultato, r.p1, '', nomi, 0, DIP), '');
    assert.equal(SB.htmlFiocchiPokemon(null, r.p1, 'Alfa', nomi, 0, DIP), '');
    assert.equal(SB.htmlFiocchiPokemon(r.risultato, r.p2, 'Beta', ['Garchomp'], 0, DIP), '', 'un Pokémon che non è di quel team non prende i fiocchi di un altro');
});

// ---------- la pagina del simulatore ----------
test('battle.html carica i moduli della scheda e il suo CSS; battle-extra.js li usa; battle-ui.js passa l\'id dei giocatori', () => {
    const html = fs.readFileSync(path.join(DOCS, 'battle.html'), 'utf8');
    for (const f of ['statistiche.js', 'fiocchi.js', 'badge-team.js', 'titoli.js', 'badge-allenatore.js', 'pagina-pubblica.js', 'scheda-battaglia.js']) {
        assert.match(html, new RegExp(`<script src="${f.replace('.', '\\.')}"></script>`), f);
    }
    assert.match(html, /<link rel="stylesheet" href="badge-team\.css">/);
    assert.ok(html.indexOf('<script src="scheda-battaglia.js">') > html.indexOf('<script src="badge-allenatore.js">'), 'prima le dipendenze');
    const extra = fs.readFileSync(path.join(DOCS, 'battle-extra.js'), 'utf8');
    assert.match(extra, /SchedaBattaglia/);
    assert.match(extra, /htmlFiocchiPokemon\(/);
    assert.match(extra, /htmlBadgeTeam\(/);
    assert.match(extra, /htmlScheda\(/);
    assert.match(extra, /if \(dati\.id !== undefined\) S\.info\[lato\]\.id/);
    const ui = fs.readFileSync(path.join(DOCS, 'battle-ui.js'), 'utf8');
    assert.match(ui, /id: dati\.id/, 'la prova contro la CPU: il giocatore');
    assert.match(ui, /id: d\.giocatori\[l\]\.id/, 'online: i due giocatori');
    const css = fs.readFileSync(path.join(DOCS, 'style-battle.css'), 'utf8');
    for (const c of ['.lato-scheda', '.scheda-titolo', '.scheda-elo', '.scheda-posizione', '.scheda-team-badge', '.membro .fiocco-medaglie', '.membro .fiocco-medaglie .bt-mini']) assert.ok(css.includes(c), c);
    assert.doesNotMatch(css, /\.membro img/, 'le immagini del fumetto non prendono le regole dello sprite');
});
