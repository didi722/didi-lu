// =====================================================
// BATTLE UI — prototipo (grafica provvisoria)
// Disegna campo, comandi e cronaca usando motore-battaglia.js.
// Modalità "stesso schermo": entrambi i giocatori sulla stessa pagina,
// oppure P2 giocato dal bot casuale.
// =====================================================

import {
    BattagliaLocale, StatoCampo, leggiRichiesta,
    richiedeBersaglio, bersagliPossibili, formattaRiga, sceltaCasuale
} from './motore-battaglia.js';
import { Dex } from './pkmn-sim.js';
import { TEAM_PROVA_1, TEAM_PROVA_2 } from './team-prova.js';

const FORMATO = 'gen8vgc2022';
const GIOCATORI = {
    p1: { nome: 'Didi', team: TEAM_PROVA_1 },
    p2: { nome: 'Luca', team: TEAM_PROVA_2 }
};

const $ = id => document.getElementById(id);
let battaglia, stato, pannelli, finita;


// -----------------------------------------------------
// Avvio
// -----------------------------------------------------
function avvia() {
    stato = new StatoCampo();
    pannelli = { p1: nuovoPannello(), p2: nuovoPannello() };
    finita = false;

    $('log').innerHTML = '';
    $('vittoria').classList.remove('visibile');
    for (const lato of ['p1', 'p2']) {
        $(`nome-${lato}`).textContent = GIOCATORI[lato].nome;
        $(`titolo-${lato}`).textContent = GIOCATORI[lato].nome;
    }

    battaglia = new BattagliaLocale({ formato: FORMATO, ...GIOCATORI });

    battaglia.on('log', righe => {
        stato.aggiorna(righe);
        scriviLog(righe);
        disegnaCampo();
        disegnaInfo();
        disegnaPannello('p1');
        disegnaPannello('p2');
    });

    battaglia.on('richiesta', (lato, richiesta) => {
        const p = pannelli[lato];
        Object.assign(p, nuovoPannello(), { grezza: richiesta, r: leggiRichiesta(richiesta) });
        if (botAttivo(lato)) return giocaBot(lato);
        avanza(lato);
    });

    battaglia.on('errore', (lato, messaggio) => {
        const p = pannelli[lato];
        Object.assign(p, nuovoPannello(), { grezza: p.grezza, r: p.r, errore: messaggio });
        if (botAttivo(lato)) return giocaBot(lato);
        avanza(lato);
    });

    battaglia.on('fine', ({ vincitore }) => {
        finita = true;
        $('testo-vittoria').textContent = vincitore ? `${vincitore} vince!` : 'Pareggio!';
        $('vittoria').classList.add('visibile');
        disegnaPannello('p1');
        disegnaPannello('p2');
    });

    battaglia.avvia();
    window.battagliaPronta = true;
}

function nuovoPannello() {
    return {
        grezza: null,        // richiesta originale del simulatore
        r: null,             // richiesta "letta" (leggiRichiesta)
        bozza: [],           // scelte già fatte, una per slot
        dinamaxAttivo: false,
        dinamaxSlot: null,
        attesaBersaglio: null,
        ordine: [],          // anteprima: ordine dei Pokémon scelti
        inviata: false,
        errore: ''
    };
}


// -----------------------------------------------------
// Bot (solo per P2)
// -----------------------------------------------------
function botAttivo(lato) {
    return lato === 'p2' && $('bot-p2').checked;
}

function giocaBot(lato) {
    const p = pannelli[lato];
    if (!p.grezza || p.grezza.wait || finita) return disegnaPannello(lato);
    setTimeout(() => {
        const scelta = sceltaCasuale(p.grezza, stato, lato);
        if (scelta) {
            p.inviata = true;
            battaglia.scegli(lato, scelta);
        }
        disegnaPannello(lato);
    }, 500);
}

$('bot-p2').addEventListener('change', () => {
    const p = pannelli?.p2;
    if (botAttivo('p2') && p && p.grezza && !p.inviata) giocaBot('p2');
    else disegnaPannello('p2');
});


// -----------------------------------------------------
// Costruzione della scelta
// -----------------------------------------------------
// Riempie da solo gli slot che non richiedono decisioni (es. Pokémon esausto)
// e invia quando tutti gli slot hanno una scelta.
function avanza(lato) {
    const p = pannelli[lato];
    const r = p.r;

    if (!r || r.tipo === 'attesa' || r.tipo === 'anteprima') return disegnaPannello(lato);

    const numSlot = r.tipo === 'cambio' ? r.slotDaCambiare.length : r.attivi.length;

    while (p.bozza.length < numSlot) {
        const i = p.bozza.length;
        if (r.tipo === 'cambio' && (!r.slotDaCambiare[i] || panchina(lato).length === 0)) { p.bozza.push('pass'); continue; }
        if (r.tipo === 'mossa' && r.attivi[i].esausto) { p.bozza.push('pass'); continue; }
        break;
    }

    if (p.bozza.length === numSlot) return invia(lato, p.bozza.join(', '));
    disegnaPannello(lato);
}

function scegliSlot(lato, scelta) {
    const p = pannelli[lato];
    if (p.dinamaxAttivo) p.dinamaxSlot = p.bozza.length;
    p.bozza.push(scelta);
    p.dinamaxAttivo = false;
    p.attesaBersaglio = null;
    avanza(lato);
}

function invia(lato, scelta) {
    const p = pannelli[lato];
    p.inviata = true;
    p.errore = '';
    battaglia.scegli(lato, scelta);
    disegnaPannello(lato);
}

function ricomincia(lato) {
    const p = pannelli[lato];
    Object.assign(p, { bozza: [], dinamaxAttivo: false, dinamaxSlot: null, attesaBersaglio: null, ordine: [] });
    avanza(lato);
}

// Pokémon in panchina disponibili (non in campo, non esausti, non già scelti in questo turno)
function panchina(lato) {
    const p = pannelli[lato];
    const giaScelti = p.bozza.filter(s => s.startsWith('switch')).map(s => parseInt(s.split(' ')[1]));
    return p.r.squadra.filter(pkm => !pkm.attivo && !pkm.esausto && !giaScelti.includes(pkm.indice));
}

function bersagliValidi(lato, tipoTarget, slot) {
    const avversario = lato === 'p1' ? 'p2' : 'p1';
    return bersagliPossibili(tipoTarget, slot)
        .map(b => {
            const pkm = stato.campo[b.lato === 'mio' ? lato : avversario][b.slot];
            const chi = b.lato === 'avversario' ? 'avversario' : (b.slot === slot ? 'se stesso' : 'alleato');
            return { ...b, pkm, chi };
        })
        .filter(b => b.pkm && b.pkm.hp > 0);
}

function sceltaMossa(lato, attivo, mossa) {
    const p = pannelli[lato];
    const usaMax = (p.dinamaxAttivo || attivo.dinamizzato) && mossa.max;
    const target = usaMax ? mossa.max.target : mossa.target;
    const base = `move ${mossa.numero}`;
    const suffisso = p.dinamaxAttivo ? ' dynamax' : '';

    if (richiedeBersaglio(target, p.r.attivi.length)) {
        const validi = bersagliValidi(lato, target, attivo.slot);
        if (validi.length > 1) {
            p.attesaBersaglio = { base, suffisso, validi, nomeMossa: usaMax ? mossa.max.nome : mossa.nome };
            return disegnaPannello(lato);
        }
        if (validi.length === 1) return scegliSlot(lato, `${base} ${validi[0].valore}${suffisso}`);
    }
    scegliSlot(lato, base + suffisso);
}


// -----------------------------------------------------
// Disegno: pannello comandi
// -----------------------------------------------------
function disegnaPannello(lato) {
    const corpo = $(`corpo-${lato}`);
    corpo.replaceChildren();
    const p = pannelli[lato];

    if (p.errore) corpo.append(el('div', { class: 'errore', testo: p.errore }));

    if (finita) return corpo.append(el('p', { class: 'messaggio', testo: 'Battaglia conclusa.' }));
    if (botAttivo(lato)) return corpo.append(el('p', { class: 'messaggio', testo: 'Sta giocando il bot.' }));
    if (!p.r || p.r.tipo === 'attesa') return corpo.append(el('p', { class: 'messaggio', testo: 'In attesa dell\'avversario…' }));
    if (p.inviata) return corpo.append(el('p', { class: 'messaggio', testo: 'Scelta inviata. In attesa dell\'avversario…' }));

    if (p.r.tipo === 'anteprima') return disegnaAnteprima(lato, corpo);
    if (p.attesaBersaglio) return disegnaBersagli(lato, corpo);
    if (p.r.tipo === 'cambio') return disegnaCambio(lato, corpo);
    disegnaMosse(lato, corpo);
}

function disegnaAnteprima(lato, corpo) {
    const p = pannelli[lato];
    const { squadra, daScegliere } = p.r;

    corpo.append(el('p', { class: 'domanda', testo: `Scegli ${daScegliere} Pokémon: i primi due scendono in campo.` }));
    corpo.append(el('div', { class: 'griglia' }, squadra.map(pkm => {
        const pos = p.ordine.indexOf(pkm.indice);
        return el('button', {
            class: 'btn' + (pos >= 0 ? ' scelto' : ''),
            onclick: () => {
                if (pos >= 0) p.ordine.splice(pos, 1);
                else if (p.ordine.length < daScegliere) p.ordine.push(pkm.indice);
                disegnaPannello(lato);
            }
        }, pkm.nome, el('small', { testo: pos >= 0 ? `#${pos + 1}` : (pkm.strumento || '') }));
    })));

    corpo.append(el('div', { class: 'riga-azioni' },
        el('button', {
            class: 'btn primario', disabled: p.ordine.length !== daScegliere,
            onclick: () => invia(lato, 'team ' + p.ordine.join(''))
        }, 'Conferma squadra'),
        el('button', { class: 'btn secondario', onclick: () => { p.ordine = []; disegnaPannello(lato); } }, 'Azzera')
    ));
}

function disegnaMosse(lato, corpo) {
    const p = pannelli[lato];
    const attivo = p.r.attivi[p.bozza.length];
    const usaMax = p.dinamaxAttivo || attivo.dinamizzato;
    const puoDinamizzare = attivo.puoDinamizzare && (p.dinamaxSlot === null);

    corpo.append(el('p', { class: 'domanda', testo: `Cosa fa ${attivo.pokemon.nome}?` }));

    corpo.append(el('div', { class: 'griglia' }, attivo.mosse.map(m => {
        const nome = usaMax && m.max ? m.max.nome : m.nome;
        const tipo = (Dex.moves.get(nome).type || '').toLowerCase();
        return el('button', {
            class: `btn mossa t-${tipo}`,
            disabled: m.disabilitata || m.pp === 0,
            onclick: () => sceltaMossa(lato, attivo, m)
        }, nome, el('small', { testo: m.ppMax ? `${m.pp}/${m.ppMax}` : '' }));
    })));

    if (puoDinamizzare) {
        corpo.append(el('div', { class: 'riga-azioni' }, el('button', {
            class: 'btn' + (p.dinamaxAttivo ? ' attivo' : ''),
            'aria-pressed': p.dinamaxAttivo ? 'true' : 'false',
            onclick: () => { p.dinamaxAttivo = !p.dinamaxAttivo; disegnaPannello(lato); }
        }, p.dinamaxAttivo ? 'Dynamax attivo' : 'Dynamax')));
    }

    const libero = attivo.bloccato ? [] : panchina(lato);
    if (libero.length) {
        corpo.append(el('p', { class: 'etichetta', testo: 'Oppure cambia con' }));
        corpo.append(el('div', { class: 'griglia' }, libero.map(pkm =>
            el('button', { class: 'btn', onclick: () => scegliSlot(lato, `switch ${pkm.indice}`) },
                pkm.nome, el('small', { testo: condizioneBreve(pkm.condizione) }))
        )));
    }

    if (p.bozza.some(s => s !== 'pass')) {
        corpo.append(el('div', { class: 'riga-azioni' },
            el('button', { class: 'btn secondario', onclick: () => ricomincia(lato) }, 'Ricomincia il turno')));
    }
}

function disegnaBersagli(lato, corpo) {
    const p = pannelli[lato];
    const { base, suffisso, validi, nomeMossa } = p.attesaBersaglio;

    corpo.append(el('p', { class: 'domanda', testo: `${nomeMossa}: su chi?` }));
    corpo.append(el('div', { class: 'griglia' }, validi.map(b =>
        el('button', { class: 'btn', onclick: () => scegliSlot(lato, `${base} ${b.valore}${suffisso}`) },
            b.pkm.nome, el('small', { testo: b.chi }))
    )));
    corpo.append(el('div', { class: 'riga-azioni' },
        el('button', { class: 'btn secondario', onclick: () => { p.attesaBersaglio = null; disegnaPannello(lato); } }, 'Indietro')));
}

function disegnaCambio(lato, corpo) {
    const p = pannelli[lato];
    const slot = p.bozza.length;
    const uscente = stato.campo[lato][slot];

    corpo.append(el('p', { class: 'domanda', testo: `Chi entra al posto di ${uscente ? uscente.nome : 'questo slot'}?` }));
    corpo.append(el('div', { class: 'griglia' }, panchina(lato).map(pkm =>
        el('button', { class: 'btn', onclick: () => scegliSlot(lato, `switch ${pkm.indice}`) },
            pkm.nome, el('small', { testo: condizioneBreve(pkm.condizione) }))
    )));
}


// -----------------------------------------------------
// Disegno: campo, intestazione, cronaca
// -----------------------------------------------------
function disegnaCampo() {
    const campo = $('campo');
    const inAnteprima = stato.turno === 0 && !stato.campo.p1[0] && stato.anteprima.p1.length;

    if (inAnteprima) {
        campo.replaceChildren(
            el('div', { class: 'fila avversario' }, el('div', { class: 'anteprima-fila' }, stato.anteprima.p2.map(s => sprite(s, false)))),
            el('div', { class: 'fila mia' }, el('div', { class: 'anteprima-fila' }, stato.anteprima.p1.map(s => sprite(s, false))))
        );
        return;
    }
    if (!stato.campo.p1[0] && !stato.campo.p2[0]) return;

    campo.replaceChildren(
        el('div', { class: 'fila avversario' }, stato.campo.p2.map(pkm => scheda(pkm, false))),
        el('div', { class: 'fila mia' }, stato.campo.p1.map(pkm => scheda(pkm, true)))
    );
}

function scheda(pkm, retro) {
    if (!pkm) return el('div', { class: 'scheda vuota' }, el('div', { class: 'sprite' }), el('div', { class: 'nome-pkm', testo: '—' }));

    const pct = pkm.hpMax ? Math.round(pkm.hp / pkm.hpMax * 100) : 0;
    const colore = pct > 50 ? '#09ca49' : pct > 20 ? '#ffbd44' : '#d6002a';
    const classi = 'scheda' + (pkm.hp === 0 ? ' ko' : '') + (pkm.dinamax ? ' dinamax' : '');

    return el('div', { class: classi },
        el('div', { class: 'sprite' }, sprite(pkm.specie, retro)),
        el('div', {},
            el('div', { class: 'nome-pkm', testo: pkm.nome }),
            el('div', { class: 'barra', role: 'img', 'aria-label': `Salute ${pct}%` },
                el('div', { style: `width:${pct}%;background:${colore}` })),
            el('div', { class: 'dettagli' },
                el('span', { testo: `${pct}%` }),
                pkm.stato && pkm.stato !== 'fnt' ? el('span', { class: 'stato', testo: pkm.stato }) : null)
        )
    );
}

function sprite(specie, retro) {
    const id = Dex.species.get(specie).spriteid || specie.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const img = el('img', {
        alt: specie,
        src: `https://play.pokemonshowdown.com/sprites/${retro ? 'ani-back' : 'ani'}/${id}.gif`
    });
    img.addEventListener('error', () => {
        img.src = `https://play.pokemonshowdown.com/sprites/${retro ? 'gen5-back' : 'gen5'}/${id}.png`;
    }, { once: true });
    return img;
}

function disegnaInfo() {
    const box = $('info-turno');
    box.replaceChildren(
        stato.turno ? el('span', { testo: `Turno ${stato.turno}` }) : el('span', { testo: 'Anteprima squadre' }),
        stato.meteo ? el('span', { testo: stato.meteo }) : null,
        stato.terreno ? el('span', { testo: stato.terreno }) : null
    );
}

function scriviLog(righe) {
    const log = $('log');
    for (const riga of righe) {
        const f = formattaRiga(riga, stato);
        if (f) log.append(el('p', { class: f.tipo || '', testo: f.testo }));
    }
    log.scrollTop = log.scrollHeight;
}

function condizioneBreve(condizione) {
    // "123/175 par" -> "70% par"
    const [hp, st = ''] = condizione.split(' ');
    const [a, b] = hp.split('/').map(Number);
    return (b ? Math.round(a / b * 100) + '%' : '') + (st ? ' ' + st : '');
}


// -----------------------------------------------------
// Utilità DOM
// -----------------------------------------------------
function el(tag, attributi = {}, ...figli) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attributi)) {
        if (v === false || v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'testo') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
    }
    figli.flat().forEach(f => { if (f != null) e.append(f); });
    return e;
}

$('btn-rigioca').addEventListener('click', avvia);
avvia();
