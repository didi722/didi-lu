'use strict';
// La regola di somiglianza tra team nelle pagine (somiglianza-team.js ne ha la logica, qui il collegamento):
//   - Box: al salvataggio il team si confronta solo con i team che non si possono più modificare; le card dei team modificabili troppo simili a uno
//     non modificabile sono grigie, con il fumetto (e l'avviso nel dettaglio) che dice con quale team rompono la regola;
//   - Hub: un team grigio non si seleziona per l'iscrizione alla stagione.
// Le funzioni delle pagine si eseguono davvero (estratte dal sorgente, con un documento e un database finti).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const box = docs('box.html');
const hub = docs('hub.html');
const css = docs('box-team.css');
const cssHub = docs('style-hub.css');
const S = require('../docs/somiglianza-team.js');
const TB = require('../docs/team-bloccati.js');

const tra = (testo, da, a) => {
    const i = testo.indexOf(da);
    const f = testo.indexOf(a, i + da.length);
    assert.ok(i >= 0 && f > i, `non trovo "${da}" ... "${a}"`);
    return testo.slice(i, f);
};
const squadra = (id, nome, specie, categoria = 'Little Cup') => ({
    id, nome, categoria, vittorie: 0, sconfitte: 0,
    pokemon: specie.map(n => ({ nome: n, strumento: 'Focus Sash', abilita: 'Pressure', evs: '252 HP', mosse: ['Protect'] }))
});
const SEI = p => [`${p}1`, `${p}2`, `${p}3`, `${p}4`, `${p}5`, `${p}6`];

// ---------- il Box: i collegamenti ----------

test('box.html carica somiglianza-team.js dopo team-bloccati.js; hub.html tutti e due', () => {
    assert.ok(box.indexOf('<script src="team-bloccati.js">') >= 0);
    assert.ok(box.indexOf('<script src="somiglianza-team.js">') > box.indexOf('<script src="team-bloccati.js">'));
    assert.ok(hub.includes('<script src="team-bloccati.js">') && hub.includes('<script src="somiglianza-team.js">'));
});

test('box.html: una sola validaSovrapposizioneTeam (era scritta due volte), che usa la regola condivisa', () => {
    assert.equal((box.match(/function validaSovrapposizioneTeam\(/g) || []).length, 1);
    const fn = tra(box, 'function validaSovrapposizioneTeam(', '// ID stile Showdown');
    assert.match(fn, /SomiglianzaTeam\.inComune\(/);
    assert.match(fn, /SomiglianzaTeam\.MASSIMO_COMUNI/);
});

// ---------- il Box: il salvataggio ----------

function validaSovrapposizione() {
    const sorgente = tra(box, 'function validaSovrapposizioneTeam(', '// ID stile Showdown') + '\nreturn validaSovrapposizioneTeam;';
    return new Function('SomiglianzaTeam', sorgente)(S);
}

test('validaSovrapposizioneTeam: più di 2 Pokémon in comune con un team non modificabile è un errore, con il nome del team e i Pokémon', () => {
    const valida = validaSovrapposizione();
    const nuovo = SEI('A').map(nome => ({ name: nome }));        // come arriva dalla validazione: { name }
    nuovo[0].name = 'Great Tusk'; nuovo[1].name = 'Gholdengo'; nuovo[2].name = 'Kingambit';
    const bloccato = squadra('b1', 'Team Beta', ['Great Tusk', 'Gholdengo', 'Kingambit', 'X4', 'X5', 'X6']);
    const errori = valida(nuovo, [bloccato], null);
    assert.equal(errori.length, 1);
    assert.match(errori[0], /shares too many Pokémon \(3: Great Tusk, Gholdengo, Kingambit\)/);
    assert.match(errori[0], /"Team Beta"/);
    assert.match(errori[0], /can no longer be edited/);
});

test('validaSovrapposizioneTeam: 2 in comune vanno bene; il team stesso (stesso id) e nessun altro team non contano', () => {
    const valida = validaSovrapposizione();
    const nuovo = [{ name: 'A' }, { name: 'B' }, { name: 'C1' }, { name: 'C2' }, { name: 'C3' }, { name: 'C4' }];
    assert.deepEqual(valida(nuovo, [squadra('b', 'B', ['A', 'B', 'X3', 'X4', 'X5', 'X6'])], null), [], 'due uguali: ok');
    assert.deepEqual(valida(nuovo, [], null), []);
    const tre = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' }];
    const stesso = squadra('mio', 'Vecchia versione di me', ['A', 'B', 'C', 'D', 'E', 'F']);
    assert.deepEqual(valida(tre, [stesso], 'mio'), [], 'modificando un team non ci si confronta con la sua versione salvata');
    assert.equal(valida(tre, [stesso], 'altro').length, 1);
});

test('il salvataggio confronta solo con i team non modificabili: rilegge chi è bloccato e filtra con la stessa regola della matita', () => {
    const salva = tra(box, 'let altriTeamEsistenti = [];', 'const datiPokeAPI = await preparaDatiTeamPerValidazione');
    assert.match(salva, /SomiglianzaTeam\.valeNelFormato\(strutturaFormatoSalvataggio\)/, 'dove la regola non c\'è (VGC) non si cerca niente');
    assert.match(salva, /await caricaTeamBloccati\(\)/, 'una stagione può essere partita da quando la pagina è aperta');
    assert.match(salva, /TeamBloccati\.eBloccato\(window\.nomiTeamBloccati, teamVal\.nome\)/);
    assert.match(salva, /altriTeamEsistenti\.push\(/);
    // il filtro è nella stessa condizione che sceglie il formato: non c'è più un elenco di "tutti i team del formato"
    assert.match(salva, /teamVal\.categoria\.toLowerCase\(\) === regolamento\.categoria\.toLowerCase\(\)\s*&&\s*TeamBloccati\.eBloccato/);
});

// ---------- il Box: chi è fuori regola ----------

function funzioniSomiglianza({ regolamenti, teams, bloccati = [], dbRotto = false }) {
    const sorgente = tra(box, 'let struttureFormati = null;', '// ---------- Aperto dal simulatore (iframe)') + '\nreturn { caricaStruttureFormati, conflittiSomiglianza, riparti: () => { struttureFormati = null; } };';
    let letture = 0;
    const db = {
        ref: nodo => ({
            once: async () => {
                if (dbRotto) throw new Error('rete');
                letture++;
                assert.equal(nodo, 'regolamenti');
                const voci = Object.entries(regolamenti).map(([k, v]) => ({ key: k, val: () => v }));
                return { forEach: f => voci.forEach(f) };
            }
        })
    };
    const finestra = { nomiTeamBloccati: new Set(bloccati) };
    const f = new Function('db', 'tuttiITeam', 'window', 'SomiglianzaTeam', 'TeamBloccati', sorgente)(db, teams, finestra, S, TB);
    return { ...f, letture: () => letture };
}

test('conflittiSomiglianza: i team modificabili troppo simili a uno bloccato, solo nei formati con la regola', async () => {
    const teams = [
        squadra('a', 'Team a', SEI('P'), 'Little Cup'), squadra('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3'], 'Little Cup'),
        squadra('va', 'VGC a', SEI('P'), 'VGC Gen 8'), squadra('vb', 'VGC b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3'], 'VGC Gen 8'),
        squadra('ga', 'AG a', SEI('P'), 'Silly Goose'), squadra('gb', 'AG b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3'], 'Silly Goose'),
        squadra('ua', 'Senza formato a', SEI('P'), 'Formato sparito'), squadra('ub', 'Senza formato b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3'], 'Formato sparito')
    ];
    const regolamenti = {
        k1: { categoria: 'Little Cup', strutturaSito: 'custom' }, k2: { categoria: 'VGC Gen 8', strutturaSito: 'vgc' },
        k3: { categoria: 'Silly Goose', strutturaSito: 'anything_goes' }
    };
    // nessuno bloccato: nessuno è fuori regola (si provano i team come si vuole)
    const libero = funzioniSomiglianza({ regolamenti, teams });
    assert.equal((await libero.conflittiSomiglianza()).size, 0);
    // i "b" diventano non modificabili: gli "a" dei formati con la regola sono fuori regola; in VGC no; un formato che non si trova neppure
    const f = funzioniSomiglianza({ regolamenti, teams, bloccati: ['team b', 'vgc b', 'ag b', 'senza formato b'] });
    const m = await f.conflittiSomiglianza();
    assert.deepEqual([...m.keys()].sort(), ['a', 'ga']);
    assert.equal(m.get('a')[0].con.nome, 'Team b');
    assert.deepEqual(m.get('a')[0].comuni, ['P1', 'P2', 'P3']);
});

test('conflittiSomiglianza: un formato senza struttura vale come "custom"; i formati si leggono una volta sola, e si riprova se la lettura fallisce', async () => {
    const teams = [squadra('a', 'Team a', SEI('P')), squadra('b', 'Team b', SEI('P'))];
    const f = funzioniSomiglianza({ regolamenti: { k: { categoria: 'Little Cup' } }, teams, bloccati: ['team b'] });
    assert.deepEqual([...(await f.conflittiSomiglianza()).keys()], ['a']);
    await f.conflittiSomiglianza();
    assert.equal(f.letture(), 1, 'una sola lettura dei formati');

    const rotto = funzioniSomiglianza({ regolamenti: {}, teams, bloccati: ['team b'], dbRotto: true });
    assert.equal((await rotto.conflittiSomiglianza()).size, 0, 'senza i formati non si segna nessuno (e non si rompe la pagina)');
    assert.equal(rotto.letture(), 0);
});

// ---------- il Box: le card ----------

function eseguiRenderizza(lista, { conflitti, bloccati = [] } = {}) {
    const sorgente = tra(box, 'async function renderizza(lista, contenitore)', 'async function caricaInfoAbilita') + '\nreturn renderizza;';
    const griglia = { innerHTML: '', dataset: {}, classList: { toggle() {}, remove() {}, add() {}, contains: () => false } };
    const finestra = { nomiTeamBloccati: new Set(bloccati) };
    const chiamate = [];
    const ambiente = {
        window: finestra,
        document: { getElementById: id => (id === 'teamsGrid' ? griglia : null) },
        caricaTeamBloccati: async () => {},
        applicaColoreBordo: () => {},
        setTimeout: () => 0,
        EFFETTI_NATURE: {},
        formattaEffettoNatura: () => '',
        SpritePkm: require('../docs/sprite-pkm.js'),
        vistaBox: 'griglia', renderizzaCartelle() {}, EtichetteTeam: require('../docs/etichette-team.js'), etichetteDef: {}, escEtichetta: t => String(t),
        SomiglianzaTeam: S,
        avviaFumettoSimile: g => chiamate.push(g)
    };
    if (conflitti) ambiente.conflittiSomiglianza = async () => conflitti;
    const renderizza = new Function(...Object.keys(ambiente), sorgente)(...Object.values(ambiente));
    return renderizza(lista).then(() => ({ html: griglia.innerHTML, finestra, griglia, chiamate }));
}

test('renderizza: un team fuori regola ha la classe card-simile e il testo del fumetto; gli altri la card di sempre', async () => {
    const a = squadra('a', 'Team a', SEI('P'));
    const b = squadra('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const libero = squadra('l', 'Libero', SEI('Q'));
    const conflitti = S.mappaConflitti([a, b, libero], { bloccato: t => t.nome === 'Team b' });
    const { html, finestra, griglia, chiamate } = await eseguiRenderizza([a, b, libero], { conflitti, bloccati: ['team b'] });
    assert.equal((html.match(/<div class="card card-simile" style=/g) || []).length, 1, 'solo Team a è grigio');
    assert.equal((html.match(/<div class="card" style=/g) || []).length, 2, 'Team b (bloccato) e Libero come sempre');
    assert.match(html, /data-simile="Breaks the similarity rule with &quot;Team b&quot;\n3 Pokémon in common: P1, P2, P3\.\n/);
    assert.equal((html.match(/data-simile=/g) || []).length, 1);
    assert.equal(finestra.fuoriRegolaSomiglianza, conflitti, 'la mappa resta alla pagina: la usa anche il dettaglio del team');
    assert.deepEqual(chiamate, [griglia], 'il fumetto si avvia sulla griglia');
});

test('renderizza: un team fuori regola resta modificabile e cancellabile (è grigio, non bloccato)', async () => {
    const a = squadra('a', 'Team a', SEI('P'));
    const b = squadra('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const conflitti = S.mappaConflitti([a, b], { bloccato: t => t.nome === 'Team b' });
    const { html } = await eseguiRenderizza([a], { conflitti, bloccati: ['team b'] });
    assert.match(html, /azione-modifica/);
    assert.match(html, /azione-elimina/);
    assert.match(html, /azione-cpu/, 'si può ancora provare contro la CPU');
});

test('renderizza: i nomi dei team nel fumetto non rompono l\'attributo (virgolette, < e &)', async () => {
    const a = squadra('a', 'Team a', SEI('P'));
    const b = squadra('b', 'Il "Bello" <b>&Co</b>', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']);
    const conflitti = S.mappaConflitti([a, b], { bloccato: t => t.id === 'b' });
    const { html } = await eseguiRenderizza([a], { conflitti });
    const attributo = html.match(/data-simile="([^"]*)"/)[1];
    assert.ok(!/[<>"]/.test(attributo), 'nell\'attributo non restano caratteri che lo chiudono o aprono tag');
    assert.match(attributo, /&quot;Il &quot;Bello&quot; &lt;b&gt;&amp;Co&lt;\/b&gt;&quot;/);
});

test('renderizza: senza conflitti (o se la pagina non sa calcolarli) tutte le card sono come prima', async () => {
    const t = squadra('a', 'A', SEI('P'));
    const senza = await eseguiRenderizza([t], { conflitti: new Map() });
    assert.ok(!senza.html.includes('card-simile') && !senza.html.includes('data-simile'));
    const nonSa = await eseguiRenderizza([t]);
    assert.ok(!nonSa.html.includes('card-simile'));
    assert.ok(nonSa.finestra.fuoriRegolaSomiglianza instanceof Map && nonSa.finestra.fuoriRegolaSomiglianza.size === 0);
});

// ---------- il Box: il fumetto ----------

function elementoFinto(nome, { classi = [], padre = null, dataset = {} } = {}) {
    const e = {
        nome, dataset, padre, classi: new Set(classi), figli: [], stile: {}, testo: '', attributi: {},
        classList: { add: c => e.classi.add(c), remove: c => e.classi.delete(c), contains: c => e.classi.has(c) },
        style: {},
        setAttribute(k, v) { e.attributi[k] = v; },
        appendChild(f) { e.figli.push(f); return f; },
        getBoundingClientRect: () => ({ left: 100, top: 100, right: 400, bottom: 500 }),
        offsetWidth: 200, offsetHeight: 80,
        // closest("a, b"): risale i padri guardando le classi
        closest(selettori) {
            const classiCercate = selettori.split(',').map(x => x.trim().replace(/^\./, ''));
            for (let n = e; n; n = n.padre) if (classiCercate.some(c => n.classi.has(c))) return n;
            return null;
        }
    };
    Object.defineProperty(e, 'textContent', { get: () => e.testo + e.figli.map(f => (f.textContent !== undefined ? f.textContent : f.valore || '')).join(''), set: v => { e.testo = v; e.figli = []; } });
    Object.defineProperty(e, 'className', { get: () => [...e.classi].join(' '), set: v => { e.classi = new Set(String(v).split(/\s+/).filter(Boolean)); } });
    return e;
}

function fumetto({ hover = true } = {}) {
    const sorgente = tra(box, 'function avviaFumettoSimile(grid) {', 'async function renderizza(lista, contenitore)') + '\nreturn avviaFumettoSimile;';
    const ascoltatori = {};
    const grid = elementoFinto('grid');
    grid.addEventListener = (ev, f) => { ascoltatori[ev] = f; };
    const corpo = elementoFinto('body');
    const creati = [];
    const document = {
        createElement: tag => { const e = elementoFinto(tag); if (tag === 'strong') e.testo = ''; creati.push(e); return e; },
        createTextNode: valore => ({ valore }),
        body: corpo
    };
    const finestra = {
        matchMedia: q => ({ matches: hover && /hover: hover/.test(q) }), innerWidth: 1400, innerHeight: 900,
        addEventListener: (ev, f) => { ascoltatori['finestra:' + ev] = f; }
    };
    const posizioni = [];
    const TooltipCoach = { posiziona: (r, d, v) => { posizioni.push({ r, d, v }); return { left: 50, top: 60, sopra: false }; } };
    const avvia = new Function('window', 'document', 'TooltipCoach', sorgente)(finestra, document, TooltipCoach);
    return { avvia, grid, ascoltatori, corpo, posizioni, creati };
}

test('il fumetto: passando sulla card grigia compare con il titolo in grassetto e i dettagli; sopra i pulsanti, le note e i Pokémon sparisce', () => {
    const f = fumetto();
    f.avvia(f.grid);
    assert.equal(f.grid.dataset.fumettoSimile, '1');
    const card = elementoFinto('card', { classi: ['card', 'card-simile'], padre: f.grid, dataset: { simile: 'Breaks the similarity rule with "Team b"\n3 Pokémon in common: P1, P2, P3.\nMax 2.' } });
    const titolo = elementoFinto('h3', { padre: card });
    f.ascoltatori.mouseover({ target: titolo });
    const bolla = f.corpo.figli[0];
    assert.ok(bolla.classi.has('tip-coach') && bolla.classi.has('tip-globale') && bolla.classi.has('tip-visibile'));
    assert.equal(bolla.attributi.role, 'tooltip');
    assert.equal(bolla.figli[0].testo, 'Breaks the similarity rule with "Team b"', 'la prima riga è il titolo');
    assert.equal(bolla.figli[1].valore, '3 Pokémon in common: P1, P2, P3.\nMax 2.');
    assert.equal(bolla.style.left, '50px');
    assert.equal(bolla.style.top, '60px');
    assert.deepEqual(f.posizioni[0].r, card.getBoundingClientRect(), 'ancorato alla card');
    // sopra un pulsante, una tessera Pokémon o un badge: via (ognuno ha il suo suggerimento)
    for (const classe of ['card-azione', 'azione-note', 'pkm-box', 'bt-card']) {
        f.ascoltatori.mouseover({ target: titolo });
        assert.ok(bolla.classi.has('tip-visibile'), 'di nuovo sul titolo: visibile');
        f.ascoltatori.mouseover({ target: elementoFinto('x', { classi: [classe], padre: card }) });
        assert.ok(!bolla.classi.has('tip-visibile'), `sopra .${classe} non c'è`);
    }
    // fuori dalla card (lo spazio tra le card) e uscendo dalla griglia sparisce
    f.ascoltatori.mouseover({ target: titolo });
    f.ascoltatori.mouseover({ target: f.grid });
    assert.ok(!bolla.classi.has('tip-visibile'));
    f.ascoltatori.mouseover({ target: titolo });
    f.ascoltatori.mouseleave();
    assert.ok(!bolla.classi.has('tip-visibile'));
    f.ascoltatori['finestra:scroll']();
});

test('il fumetto: una card di un team normale non lo mostra; si avvia una volta sola; senza "passaggio" del mouse (telefono) non si avvia', () => {
    const f = fumetto();
    f.avvia(f.grid);
    const normale = elementoFinto('card', { classi: ['card'], padre: f.grid });
    f.ascoltatori.mouseover({ target: normale });
    assert.equal(f.corpo.figli.length, 0, 'nessuna bolla per una card normale');
    const prima = f.ascoltatori.mouseover;
    f.avvia(f.grid);
    assert.equal(f.ascoltatori.mouseover, prima, 'secondo avvio: niente doppi ascoltatori');

    const telefono = fumetto({ hover: false });
    telefono.avvia(telefono.grid);
    assert.deepEqual(Object.keys(telefono.ascoltatori), []);
    assert.doesNotThrow(() => telefono.avvia(null));
});

test('il fumetto: lo stile è quello dei suggerimenti del sito (tip-coach, tooltip.css), che c\'è già in box.html', () => {
    assert.match(docs('tooltip.css'), /\.tip-coach\.tip-globale\.tip-visibile \{ opacity: 1; \}/);
    assert.match(box, /<link rel="stylesheet" href="tooltip.css">/);
    assert.match(box, /<script src="tooltip.js" defer><\/script>/);
});

// ---------- il Box: il dettaglio del team e lo stile ----------

test('apriDettagli: l\'avviso del perché sta fuori dall\'intestazione (nell\'app l\'intestazione nasconde tutto) e usa i testi della regola, protetti', () => {
    const fn = tra(box, 'async function apriDettagli(id, opzioni = {}) {', 'function fermaNoteDettaglio()');
    assert.match(fn, /window\.fuoriRegolaSomiglianza\.get\(team\.id\)/);
    assert.match(fn, /SomiglianzaTeam\.testo\(conflittoSimile\)\.split\('\\n'\)/);
    assert.match(fn, /tbEsc\(righeSimile\[0\]\)/);
    const dopoIntestazione = fn.indexOf('</div>\n        ${avvisoSimile}\n        <div class="modal-grid">');
    assert.ok(dopoIntestazione > fn.indexOf('tbHtmlTagDettaglio(team.id)'), 'dopo l\'intestazione, prima della griglia dei Pokémon');
    assert.match(fn, /class="team-simile-avviso" role="note"/);
});

test('box-team.css: la card fuori regola è grigia e più tenue; l\'avviso del dettaglio è una striscia gialla', () => {
    assert.match(css, /\.card\.card-simile \{ filter: grayscale\(\.95\)[^}]*opacity: \.82;/);
    assert.match(css, /\.team-simile-avviso \{[^}]*background: var\(--nb-giallo, #ffbd44\)[^}]*border: 3px solid var\(--nb-ink, #000\)/);
    assert.match(css, /\.team-simile-avviso b \{[^}]*text-transform: uppercase/);
});

// ---------- l'Hub: l'iscrizione ----------

function apriSelezione({ format, teams, stagioni, regolamenti, giaSelezionati = [], dbRotto = false }) {
    const sorgente = tra(hub, 'async function leggiControlloSomiglianza(', 'async function apriDettaglioTeam') + '\nreturn openTeamPicker;';
    const elementi = {};
    const nuovo = (nome = 'el') => {
        const e = {
            nome, classi: new Set(), style: {}, figli: [], title: '', innerHTML: '', innerText: '', disabled: false,
            classList: { add: c => e.classi.add(c), remove: c => e.classi.delete(c), contains: c => e.classi.has(c), toggle: (c, on) => (on ? e.classi.add(c) : e.classi.delete(c)) },
            appendChild: f => { e.figli.push(f); return f; },
            querySelector: () => nuovo('interno'),
            set className(v) { e.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
            get className() { return [...e.classi].join(' '); }
        };
        return e;
    };
    const documento = {
        getElementById: id => {
            if (!['modal-overlay', 'modal-select-team', 'user-teams-list', 'modal-format-title', 'btn-confirm-selection', 'global-team-tooltip'].includes(id)) return null;
            return (elementi[id] = elementi[id] || nuovo(id));
        },
        createElement: tag => nuovo(tag),
        body: nuovo('body')
    };
    const voci = obj => Object.entries(obj || {}).map(([key, v]) => ({ key, val: () => v }));
    const db = {
        ref: nodo => ({
            once: async () => {
                if (dbRotto && (nodo === 'seasons' || nodo === 'regolamenti')) throw new Error('rete');
                let v;
                if (nodo === 'seasons') v = stagioni;
                else if (nodo === 'regolamenti') v = regolamenti;
                else if (/\/info$/.test(nodo)) v = { teams_per_format: 3 };
                else if (/teams_iscritti/.test(nodo)) v = { teamIds: giaSelezionati };
                else if (/\/teams$/.test(nodo)) v = teams;
                else v = null;
                return { val: () => v, forEach: f => voci(v).forEach(f) };
            }
        })
    };
    const avvisi = [];
    const ambiente = {
        document: documento, db, seasonId: 's1', alert: t => avvisi.push(t),
        TeamBloccati: TB, SomiglianzaTeam: S,
        SpritePkm: { gif: () => 'x.gif', id: () => 'x' }, escapeHtmlFormato: t => t,
        closeTeamModal() {}, apriDettaglioTeam() {}, inviaSelezioneTeam() {}
    };
    const aprire = new Function(...Object.keys(ambiente), sorgente)(...Object.values(ambiente));
    return aprire(format, 'didi').then(() => {
        const lista = elementi['user-teams-list'].figli;
        const click = div => div.onclick({ target: { classList: { contains: () => false } } });
        return { lista, avvisi, click, titolo: elementi['modal-format-title'], conferma: elementi['btn-confirm-selection'] };
    });
}

const nomeDi = div => div.innerHTML.match(/<strong>([^<]*)<\/strong>/)[1];
const iscritti = (...nomi) => ({ info: { status: 'playing' }, teams_iscritti: { 'Little Cup': { didi: { datiTeams: nomi.map(nome => ({ nome })) } } } });
const scenarioHub = () => {
    const teams = {
        a: squadra('a', 'Team a', SEI('P')), b: squadra('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']),
        c: squadra('c', 'Team c', SEI('Q')), v: squadra('v', 'VGC v', SEI('P'), 'VGC Gen 8')
    };
    const regolamenti = { k1: { categoria: 'Little Cup', strutturaSito: 'custom' }, k2: { categoria: 'VGC Gen 8', strutturaSito: 'vgc' } };
    return { teams, regolamenti, stagioni: { s0: iscritti('Team b') } };
};

test('Hub: un team modificabile troppo simile a uno non modificabile compare grigio, con il perché, e non si seleziona', async () => {
    const { lista, avvisi, click } = await apriSelezione({ format: 'Little Cup', ...scenarioHub() });
    const perNome = Object.fromEntries(lista.map(d => [nomeDi(d), d]));
    assert.deepEqual(Object.keys(perNome).sort(), ['Team a', 'Team b', 'Team c']);
    const a = perNome['Team a'];
    assert.ok(a.classi.has('team-option-simile'));
    assert.match(a.title, /^Breaks the similarity rule with "Team b"\n3 Pokémon in common: P1, P2, P3\./);
    assert.ok(!perNome['Team b'].classi.has('team-option-simile'), 'il bloccato non è grigio');
    assert.ok(!perNome['Team c'].classi.has('team-option-simile'));
    assert.equal(perNome['Team c'].title, '');
    click(a);
    assert.ok(!a.classi.has('selected'), 'non si seleziona');
    assert.equal(avvisi.length, 1);
    assert.match(avvisi[0], /Breaks the similarity rule with "Team b"/, 'si spiega perché (anche dal telefono, senza mouse)');
    // gli altri si selezionano come sempre
    click(perNome['Team c']);
    assert.ok(perNome['Team c'].classi.has('selected'));
    assert.equal(avvisi.length, 1);
});

test('Hub: se nessun team è non modificabile, anche team molto simili si selezionano (tra team modificabili la regola non c\'è)', async () => {
    const s = scenarioHub();
    s.stagioni = { s0: { info: { status: 'open' }, teams_iscritti: { 'Little Cup': { didi: { datiTeams: [{ nome: 'Team b' }] } } } } };      // iscritto a una stagione ancora aperta: modificabile
    const { lista, click } = await apriSelezione({ format: 'Little Cup', ...s });
    assert.ok(lista.every(d => !d.classi.has('team-option-simile')));
    const a = lista.find(d => nomeDi(d) === 'Team a');
    click(a);
    assert.ok(a.classi.has('selected'));
});

test('Hub: nei formati senza la regola (VGC) niente grigio; un team grigio già iscritto si può togliere dalla selezione', async () => {
    const s = scenarioHub();
    s.stagioni = { s0: { info: { status: 'playing' }, teams_iscritti: { 'VGC Gen 8': { didi: { datiTeams: [{ nome: 'VGC w' }] } } } } };
    s.teams.w = squadra('w', 'VGC w', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3'], 'VGC Gen 8');
    const vgc = await apriSelezione({ format: 'VGC Gen 8', ...s });
    assert.ok(vgc.lista.length === 2 && vgc.lista.every(d => !d.classi.has('team-option-simile')));

    const g = await apriSelezione({ format: 'Little Cup', ...scenarioHub(), giaSelezionati: ['a'] });
    const a = g.lista.find(d => nomeDi(d) === 'Team a');
    assert.ok(a.classi.has('selected') && a.classi.has('team-option-simile'));
    g.click(a);
    assert.ok(!a.classi.has('selected'), 'si toglie dalla selezione');
    assert.equal(g.avvisi.length, 0);
    g.click(a);
    assert.ok(!a.classi.has('selected'), 'ma non si rimette');
    assert.equal(g.avvisi.length, 1);
});

test('Hub: se le stagioni o i formati non si leggono, nessun team è bloccato (l\'iscrizione funziona come sempre)', async () => {
    const { lista } = await apriSelezione({ format: 'Little Cup', ...scenarioHub(), dbRotto: true });
    assert.equal(lista.length, 3);
    assert.ok(lista.every(d => !d.classi.has('team-option-simile')));
});

test('style-hub.css: la voce del team fuori regola è grigia e tenue, senza il verde del passaggio', () => {
    assert.match(cssHub, /\.team-option\.team-option-simile \{[^}]*filter: grayscale\(\.95\);[^}]*opacity: \.62;[^}]*cursor: not-allowed;/);
    assert.match(cssHub, /\.team-option\.team-option-simile:not\(\.selected\):hover \{[^}]*background: white;/);
});

// ---------- l'Hub: due team simili non si iscrivono insieme ----------

const foto = (t) => ({ id: t.id, nome: t.nome, pokemon: t.pokemon });
const iscrizioneDi = (...squadre) => ({ teamIds: squadre.map(t => t.id), datiTeams: squadre.map(foto), count: squadre.length });
const duePiuUno = () => ({
    a: squadra('a', 'Team a', SEI('P')), b: squadra('b', 'Team b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3']),
    c: squadra('c', 'Team c', SEI('Q'))
});
const formatoLibero = { k1: { categoria: 'Little Cup', strutturaSito: 'custom' } };

test('Hub: due team che si somigliano non si scelgono insieme — il secondo si spegne con il perché, e si riaccende se il primo si toglie', async () => {
    const teams = duePiuUno();
    const { lista, avvisi, click } = await apriSelezione({ format: 'Little Cup', teams, stagioni: {}, regolamenti: formatoLibero });
    const [a, b, c] = ['Team a', 'Team b', 'Team c'].map(n => lista.find(d => nomeDi(d) === n));
    assert.ok(lista.every(d => !d.classi.has('team-option-simile')), 'all\'inizio nessuno è fuori regola: nessuno è scelto');
    click(a);
    assert.ok(a.classi.has('selected'));
    assert.ok(b.classi.has('team-option-simile'), 'Team b somiglia a Team a, che ora è scelto');
    assert.ok(!c.classi.has('team-option-simile'));
    assert.ok(!a.classi.has('team-option-simile'), 'il team scelto non è in conflitto con se stesso');
    const righe = b.title.split('\n');
    assert.equal(righe[0], 'Breaks the similarity rule with "Team a"');
    assert.match(righe[2], /^You've selected "Team a" too: two teams with more than 2 Pokémon in common can't be registered together/);
    click(b);
    assert.ok(!b.classi.has('selected'), 'non si sceglie');
    assert.equal(avvisi.length, 1);
    assert.equal(avvisi[0], b.title, 'l\'avviso dice la stessa cosa del suggerimento (dal telefono non c\'è il passaggio del mouse)');
    // il primo si toglie: il secondo si può scegliere, e ora è lui a spegnere il primo
    click(a);
    assert.ok(!a.classi.has('selected') && !b.classi.has('team-option-simile'));
    assert.equal(b.title, '', 'il suggerimento sparisce con il conflitto');
    click(b);
    assert.ok(b.classi.has('selected') && a.classi.has('team-option-simile'));
    assert.equal(avvisi.length, 1);
});

test('Hub: un team simile a uno già iscritto a un\'altra stagione con le iscrizioni aperte non si iscrive, e il perché nomina quella stagione', async () => {
    const teams = duePiuUno();
    const stagioni = {
        s2: { info: { status: 'open', name: 'Friuli DOC I' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a) } } }
    };
    const { lista, avvisi, click, conferma } = await apriSelezione({ format: 'Little Cup', teams, stagioni, regolamenti: formatoLibero });
    const b = lista.find(d => nomeDi(d) === 'Team b');
    const a = lista.find(d => nomeDi(d) === 'Team a');
    assert.ok(b.classi.has('team-option-simile'), 'Team b somiglia a Team a, già iscritto a Friuli DOC I, che sta per iniziare');
    assert.ok(!a.classi.has('team-option-simile'), 'Team a stesso si può iscrivere anche qui');
    assert.match(b.title.split('\n')[2], /^"Team a" is already registered in "Friuli DOC I": two teams with more than 2 Pokémon in common can't be registered while registrations are open/);
    click(b);
    assert.ok(!b.classi.has('selected'));
    assert.equal(avvisi.length, 1);
    click(a);
    assert.ok(a.classi.has('selected'), 'lo stesso team in due stagioni va bene');
    assert.equal(conferma.disabled, false);
});

test('Hub: le iscrizioni a stagioni già iniziate o chiuse non contano come "altrove" (quei team sono bloccati: vale la regola di prima), e nemmeno quelle di un altro giocatore o formato', async () => {
    const teams = duePiuUno();
    const stagioni = {
        s2: { info: { status: 'playing', name: 'In corso' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a) } } },
        s3: { info: { status: 'open', name: 'Aperta' }, teams_iscritti: { 'Little Cup': { lu: iscrizioneDi(teams.a) }, OU: { didi: iscrizioneDi(teams.a) } } }
    };
    const { lista } = await apriSelezione({ format: 'Little Cup', teams, stagioni, regolamenti: formatoLibero });
    const nomi = lista.filter(d => d.classi.has('team-option-simile')).map(nomeDi);
    // Team a è bloccato (iscritto a una stagione in corso): Team b è fuori regola per quello, non per le altre iscrizioni
    assert.deepEqual(nomi, ['Team b']);
    assert.match(lista.find(d => nomeDi(d) === 'Team b').title.split('\n')[2], /^Max 2 are allowed with a team already registered in a season/);
});

test('Hub: la stagione che si sta scegliendo non conta come "altrove": i suoi team sono la selezione di adesso', async () => {
    const teams = duePiuUno();
    const stagioni = { s1: { info: { status: 'open', name: 'Questa' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a) } } } };
    const { lista, click } = await apriSelezione({ format: 'Little Cup', teams, stagioni, regolamenti: formatoLibero, giaSelezionati: ['a'] });
    const [a, b] = ['Team a', 'Team b'].map(n => lista.find(d => nomeDi(d) === n));
    assert.ok(a.classi.has('selected'));
    assert.match(b.title.split('\n')[2], /^You've selected "Team a" too/, 'è "insieme" (selezione di adesso), non "altrove"');
    click(a);       // si toglie dalla selezione: la sua iscrizione di prima non lo tiene più in conflitto
    assert.ok(!b.classi.has('team-option-simile'), 'tolto dalla selezione, l\'iscrizione di questa stagione non pesa più');
});

test('Hub: se tra i team già scelti ce ne sono due fuori regola (iscrizioni di prima), il pulsante è spento ("Similar teams!") finché non se ne toglie uno', async () => {
    const teams = duePiuUno();
    const { lista, click, conferma } = await apriSelezione({ format: 'Little Cup', teams, stagioni: {}, regolamenti: formatoLibero, giaSelezionati: ['a', 'b'] });
    const [a, b] = ['Team a', 'Team b'].map(n => lista.find(d => nomeDi(d) === n));
    assert.ok(a.classi.has('selected') && b.classi.has('selected'));
    assert.ok(a.classi.has('team-option-simile') && b.classi.has('team-option-simile'), 'tutti e due segnati');
    assert.equal(conferma.innerText, 'Similar teams!');
    assert.equal(conferma.disabled, true);
    click(b);
    assert.equal(conferma.innerText, 'Save selection');
    assert.equal(conferma.disabled, false);
});

test('Hub: nei formati senza la regola (VGC) due team simili si scelgono insieme', async () => {
    const teams = { a: squadra('a', 'VGC a', SEI('P'), 'VGC Gen 8'), b: squadra('b', 'VGC b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3'], 'VGC Gen 8') };
    const regolamenti = { k2: { categoria: 'VGC Gen 8', strutturaSito: 'vgc' } };
    const { lista, click, conferma } = await apriSelezione({ format: 'VGC Gen 8', teams, stagioni: {}, regolamenti });
    click(lista[0]);
    click(lista[1]);
    assert.ok(lista.every(d => d.classi.has('selected') && !d.classi.has('team-option-simile')));
    assert.equal(conferma.disabled, false);
});

test('Hub: il suggerimento si aggiorna anche mentre il fumetto del sito lo tiene da parte (tooltip.js sposta il title in data-tip-titolo)', async () => {
    const teams = duePiuUno();
    const { lista, click } = await apriSelezione({ format: 'Little Cup', teams, stagioni: {}, regolamenti: formatoLibero });
    const [a, b] = ['Team a', 'Team b'].map(n => lista.find(d => nomeDi(d) === n));
    // il fumetto, passandoci sopra, toglie il title e lo tiene in un attributo di servizio
    const attributi = { 'data-tip-titolo': '' };
    b.getAttribute = k => (k in attributi ? attributi[k] : null);
    b.setAttribute = (k, v) => { attributi[k] = v; };
    click(a);
    assert.match(attributi['data-tip-titolo'], /^Breaks the similarity rule with "Team a"/, 'il testo nuovo va dove il fumetto lo rimetterà');
    assert.equal(b.title, '', 'il title resta vuoto mentre il fumetto lo tiene');
});

// ---------- l'Hub: il salvataggio dell'iscrizione ----------

function salvaSelezione({ format = 'Little Cup', teams, stagioni, regolamenti = formatoLibero, selezionati, dbRotto = false, nessunTeamConferma = true }) {
    const sorgente = tra(hub, 'async function leggiControlloSomiglianza(', 'async function openTeamPicker') + tra(hub, 'async function inviaSelezioneTeam(', 'async function gestisciAccessoHub') + '\nreturn inviaSelezioneTeam;';
    const voci = obj => Object.entries(obj || {}).map(([key, v]) => ({ key, val: () => v }));
    const scritture = [];
    const letture = [];
    const db = {
        ref: nodo => ({
            once: async () => {
                letture.push(nodo);
                if (dbRotto && (nodo === 'seasons' || nodo === 'regolamenti')) throw new Error('rete');
                const v = nodo === 'seasons' ? stagioni : nodo === 'regolamenti' ? regolamenti : (/\/iscritti$/.test(nodo) ? { didi: { uid: 'u' } } : null);
                return { val: () => v, forEach: f => voci(v).forEach(f) };
            },
            set: async valore => { scritture.push({ nodo, valore }); }
        })
    };
    const avvisi = [];
    const chiusure = [];
    const ambiente = {
        db, seasonId: 's1', TeamBloccati: TB, SomiglianzaTeam: S,
        alert: t => avvisi.push(t), confirm: () => nessunTeamConferma, closeTeamModal: () => chiusure.push(1),
        firebase: { database: { ServerValue: { TIMESTAMP: 'ORA' } } }
    };
    const salva = new Function(...Object.keys(ambiente), sorgente)(...Object.values(ambiente));
    return salva(format, 'didi', teams, selezionati).then(() => ({ scritture, avvisi, chiusure, letture }));
}

test('salvataggio dell\'iscrizione: due team che si somigliano non si salvano insieme (nemmeno se la finestra è rimasta aperta con dati vecchi)', async () => {
    const teams = duePiuUno();
    const r = await salvaSelezione({ teams, stagioni: {}, selezionati: ['a', 'b'] });
    assert.deepEqual(r.scritture, [], 'niente scritto');
    assert.equal(r.avvisi.length, 1);
    assert.match(r.avvisi[0], /^Breaks the similarity rule with "Team (a|b)"/);
    assert.deepEqual(r.chiusure, [], 'la finestra resta aperta: si sceglie quale togliere');
});

test('salvataggio dell\'iscrizione: un team simile a uno già iscritto a un\'altra stagione con le iscrizioni aperte non si salva', async () => {
    const teams = duePiuUno();
    const stagioni = { s2: { info: { status: 'open', name: 'Friuli DOC I' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a) } } } };
    const r = await salvaSelezione({ teams, stagioni, selezionati: ['b', 'c'] });
    assert.deepEqual(r.scritture, []);
    assert.match(r.avvisi[0], /"Team a" is already registered in "Friuli DOC I"/);
});

test('salvataggio dell\'iscrizione: se la regola è rispettata si salva come sempre (team, fotografie, conteggio)', async () => {
    const teams = duePiuUno();
    const stagioni = { s2: { info: { status: 'open', name: 'Altra' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a) } } } };
    const r = await salvaSelezione({ teams, stagioni, selezionati: ['a', 'c'] });
    assert.deepEqual(r.avvisi, []);
    assert.equal(r.scritture.length, 1);
    assert.equal(r.scritture[0].nodo, 'seasons/s1/teams_iscritti/Little Cup/didi');
    assert.deepEqual(r.scritture[0].valore.teamIds, ['a', 'c']);
    assert.equal(r.scritture[0].valore.count, 2);
    assert.deepEqual(r.scritture[0].valore.datiTeams.map(t => t.nome), ['Team a', 'Team c']);
    assert.equal(r.scritture[0].valore.timestamp, 'ORA');
    assert.equal(r.chiusure.length, 1);
});

test('salvataggio dell\'iscrizione: senza la regola (VGC) o se la lettura fallisce non si blocca niente; togliere l\'iscrizione non legge nulla', async () => {
    const vgc = { a: squadra('a', 'VGC a', SEI('P'), 'VGC Gen 8'), b: squadra('b', 'VGC b', ['P1', 'P2', 'P3', 'X1', 'X2', 'X3'], 'VGC Gen 8') };
    const r1 = await salvaSelezione({ format: 'VGC Gen 8', teams: vgc, stagioni: {}, regolamenti: { k: { categoria: 'VGC Gen 8', strutturaSito: 'vgc' } }, selezionati: ['a', 'b'] });
    assert.equal(r1.scritture.length, 1);
    const r2 = await salvaSelezione({ teams: duePiuUno(), stagioni: {}, selezionati: ['a', 'b'], dbRotto: true });
    assert.equal(r2.scritture.length, 1, 'senza poter leggere, l\'iscrizione funziona come sempre');
    const r3 = await salvaSelezione({ teams: duePiuUno(), stagioni: {}, selezionati: [] });
    assert.equal(r3.scritture.length, 1);
    assert.deepEqual(r3.scritture[0].valore.teamIds, []);
    assert.ok(!r3.letture.includes('seasons') && !r3.letture.includes('regolamenti'), 'con la selezione vuota non c\'è niente da controllare');
});

// ---------- il Box: salvare un team che è già iscritto a una stagione con le iscrizioni aperte ----------

function bloccoIscritti({ editingId, teams, stagioni, playerID = 'didi', altri = [] }) {
    const sorgente = tra(box, 'const iscrittiAperti = TeamBloccati.iscrittiInStagioniAperte(', '            } catch (e) {\n                console.warn("Error: Error during retrieval of existing teams:"');
    const altriTeamEsistenti = [...altri];
    const teamsSnap = { child: id => ({ val: () => (teams[id] ? { ...teams[id] } : null) }) };
    new Function('TeamBloccati', 'window', 'playerID', 'regolamento', 'editingId', 'altriTeamEsistenti', 'teamsSnap', sorgente)(
        TB, { stagioniLette: stagioni }, playerID, { categoria: 'Little Cup' }, editingId, altriTeamEsistenti, teamsSnap);
    return altriTeamEsistenti;
}

test('Box, salvataggio: un team iscritto a una stagione con le iscrizioni aperte si confronta anche con gli altri team iscritti (nel Box come sono adesso)', () => {
    const teams = duePiuUno();
    const stagioni = {
        s1: { info: { status: 'open', name: 'Friuli DOC I' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a) } } },
        s2: { info: { status: 'open', name: 'Sant\'Alvise II' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.b) } } }
    };
    // il Box ha cambiato Team a dopo l'iscrizione: conta com'è adesso, non la fotografia
    const cambiato = { ...teams, a: squadra('a', 'Team a', ['N1', 'N2', 'N3', 'N4', 'N5', 'N6']) };
    const altri = bloccoIscritti({ editingId: 'b', teams: cambiato, stagioni });
    assert.equal(altri.length, 1);
    assert.equal(altri[0].id, 'a');
    assert.equal(altri[0].iscrittoA, 'Friuli DOC I');
    assert.equal(altri[0].pokemon[0].nome, 'N1', 'i Pokémon sono quelli del Box');
    // e il controllo di sovrapposizione lo usa, con il testo giusto
    const valida = validaSovrapposizione();
    const nuovoB = [{ name: 'N1' }, { name: 'N2' }, { name: 'N3' }, { name: 'X1' }, { name: 'X2' }, { name: 'X3' }];
    const errori = valida(nuovoB, altri, 'b');
    assert.equal(errori.length, 1);
    assert.match(errori[0], /This team is registered in a season with open registrations and would share too many Pokémon \(3: N1, N2, N3\) with "Team a", also registered \("Friuli DOC I"\)/);
    assert.match(errori[0], /withdraw one of the two teams from its season first/);
});

test('Box, salvataggio: un team non iscritto (o nuovo) si prova come vuole; né contano le stagioni già iniziate, gli altri formati o gli altri giocatori', () => {
    const teams = duePiuUno();
    const stagioni = {
        s1: { info: { status: 'open', name: 'Aperta' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a) }, OU: { didi: iscrizioneDi(teams.c) } } },
        s2: { info: { status: 'playing', name: 'In corso' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.b) } } },
        s3: { info: { status: 'open', name: 'Altrui' }, teams_iscritti: { 'Little Cup': { lu: iscrizioneDi(teams.c) } } }
    };
    assert.deepEqual(bloccoIscritti({ editingId: 'b', teams, stagioni }), [], 'Team b non è iscritto a nessuna stagione aperta: nessun confronto');
    assert.deepEqual(bloccoIscritti({ editingId: null, teams, stagioni }), [], 'un team nuovo non è iscritto a niente');
    assert.deepEqual(bloccoIscritti({ editingId: 'a', teams, stagioni }), [], 'iscritto, ma gli altri iscritti non ci sono (le altre iscrizioni sono altrove, o già iniziate)');
    assert.deepEqual(bloccoIscritti({ editingId: 'a', teams, stagioni: undefined }), [], 'senza stagioni lette non si rompe niente');
});

test('Box, salvataggio: chi è già tra i team non modificabili non si aggiunge due volte; se il team iscritto non è più nel Box vale la fotografia', () => {
    const teams = duePiuUno();
    const stagioni = {
        s1: { info: { status: 'open', name: 'Aperta' }, teams_iscritti: { 'Little Cup': { didi: iscrizioneDi(teams.a, teams.b, teams.c) } } }
    };
    const giaBloccato = { ...teams.c, id: 'c' };
    const altri = bloccoIscritti({ editingId: 'a', teams: { a: teams.a, b: teams.b }, stagioni, altri: [giaBloccato] });
    assert.deepEqual(altri.map(t => t.id), ['c', 'b'], 'c c\'era già (è bloccato); b si aggiunge');
    const c = altri.find(t => t.id === 'c');
    assert.equal(c.iscrittoA, undefined, 'il team non modificabile resta com\'era');
    const b = altri.find(t => t.id === 'b');
    assert.equal(b.iscrittoA, 'Aperta');
    // c non è più nel Box (e non è nell'elenco dei bloccati passato qui): si usa la sua fotografia
    const soloFoto = bloccoIscritti({ editingId: 'a', teams: { a: teams.a }, stagioni });
    assert.deepEqual(soloFoto.map(t => t.id), ['b', 'c']);
    assert.equal(soloFoto[0].nome, 'Team b');
    assert.equal(soloFoto[0].pokemon.length, 6, 'i Pokémon della fotografia');
});

test('box.html: il salvataggio legge le stagioni (le stesse dei team bloccati) e passa il nome della stagione ai team iscritti', () => {
    assert.match(box, /window\.stagioniLette = snap\.val\(\);/);
    assert.match(box, /TeamBloccati\.iscrittiInStagioniAperte\(window\.stagioniLette, \{ giocatore: playerID, formato: regolamento\.categoria \}\)/);
    assert.match(box, /if \(editingId && iscrittiAperti\.some\(i => i\.id === editingId\)\)/, 'solo se il team che si salva è iscritto: gli altri si provano come vogliono');
    assert.match(box, /iscrittoA: i\.nomeStagione/);
});

test('hub.html: la finestra di scelta e il salvataggio usano la stessa lettura (leggiControlloSomiglianza) e lo stesso calcolo (conflittiDiIscrizione)', () => {
    assert.equal((hub.match(/async function leggiControlloSomiglianza\(/g) || []).length, 1);
    assert.equal((hub.match(/await leggiControlloSomiglianza\(format, nomeUtenteClean, allTeams\)/g) || []).length, 2, 'finestra e salvataggio');
    assert.match(hub, /escludi: seasonId/, 'la stagione che si sta scegliendo non conta come "altrove"');
    assert.match(hub, /confirmBtn\.disabled = isOverLimit \|\| sceltiInConflitto > 0;/);
});

