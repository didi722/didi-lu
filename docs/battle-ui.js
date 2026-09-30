// =====================================================
// BATTLE UI — prototipo (grafica provvisoria)
// Disegna campo, comandi e cronaca usando motore-battaglia.js.
//
// Due modi di aprire la pagina:
//   battle.html?stagione=S&showdown=ID&match=N  -> dati veri da Firebase
//   battle.html                                  -> team di prova (sviluppo)
// Per ora entrambi i giocatori stanno sulla stessa pagina,
// oppure P2 è giocato dal bot casuale.
// =====================================================

import {
    BattagliaLocale, StatoCampo, leggiRichiesta, richiedeBersaglio,
    bersagliScegliibili, candidatiCambio, mossaEffettiva, formattaRiga, sceltaCasuale
} from './motore-battaglia.js';
import { Dex, Teams } from './pkmn-sim.js';
import { caricaMatch } from './team-sito.js';
import { TEAM_PROVA_1, TEAM_PROVA_2 } from './team-prova.js';

const CONFIG_PROVA = {
    formato: 'gen8vgc2022',
    etichetta: 'Prova · VGC Gen 8',
    p1: { nome: 'Didi', team: TEAM_PROVA_1 },
    p2: { nome: 'Luca', team: TEAM_PROVA_2 }
};

const $ = id => document.getElementById(id);
let config = null;          // { formato, etichetta, p1: { nome, team }, p2: { nome, team } }
let battaglia, stato, pannelli, finita;


// -----------------------------------------------------
// Avvio della pagina
// -----------------------------------------------------
const parametri = new URLSearchParams(location.search);
if (parametri.get('showdown')) {
    preparaDaSito({
        stagione: parametri.get('stagione'),
        showdown: parametri.get('showdown'),
        match: parametri.get('match') || '1'
    });
} else {
    config = CONFIG_PROVA;
    avviaBattaglia();
}
window.battagliaPronta = true;

$('btn-rigioca').addEventListener('click', avviaBattaglia);


// -----------------------------------------------------
// Preparazione da Firebase: scelta dei team
// -----------------------------------------------------
async function preparaDaSito(chiavi) {
    mostraMessaggioCampo('Carico lo showdown…');

    let dati;
    try {
        if (!window.firebase) throw new Error('Firebase non caricato: controlla gli script in battle.html.');
        await new Promise(ok => { const stop = firebase.auth().onAuthStateChanged(() => { stop(); ok(); }); });
        dati = await caricaMatch(firebase.database(), chiavi);
    } catch (errore) {
        console.error(errore);
        return mostraMessaggioCampo(`Impossibile caricare il match: ${errore.message}`);
    }

    if (!Dex.formats.get(dati.formato).exists) {
        return mostraMessaggioCampo(`Il formato del simulatore "${dati.formato}" non esiste. Correggi il campo formatoSimulatore del regolamento ${dati.categoria}.`);
    }

    const scelte = { p1: null, p2: null };
    const pronti = { p1: false, p2: false };

    for (const lato of ['p1', 'p2']) {
        const g = dati.giocatori[lato];
        impostaNomeGiocatore(lato, g.nome);
        if (g.colore) document.documentElement.style.setProperty(`--colore-${lato}`, g.colore);
        const bloccato = dati.bloccati && dati.bloccati[lato];
        scelte[lato] = (bloccato && g.teams.find(t => t.nome === bloccato)) || g.teams[0] || null;
    }

    $('info-turno').replaceChildren(
        el('span', { testo: dati.categoria }),
        el('span', { testo: `Match ${chiavi.match}` })
    );
    mostraMessaggioCampo('Scegliete i team, poi premete Pronto.');

    const disegna = lato => {
        const g = dati.giocatori[lato];
        const corpo = $(`corpo-${lato}`);
        corpo.replaceChildren();

        if (!g.teams.length) {
            return corpo.append(el('p', { class: 'errore', testo: `${g.nome} non ha team iscritti in ${dati.categoria}.` }));
        }

        const bloccato = dati.bloccati && dati.bloccati[lato];
        if (bloccato && !g.teams.some(t => t.nome === bloccato)) {
            return corpo.append(el('p', { class: 'errore', testo: `Il team bloccato "${bloccato}" non è più tra gli iscritti.` }));
        }

        const select = el('select', { class: 'scelta-team', disabled: !!bloccato || pronti[lato], 'aria-label': `Team di ${g.nome}` },
            g.teams.map(t => el('option', { value: t.nome, selected: scelte[lato] && t.nome === scelte[lato].nome }, t.nome)));
        select.addEventListener('change', () => { scelte[lato] = g.teams.find(t => t.nome === select.value); disegna(lato); });

        corpo.append(el('p', { class: 'domanda', testo: bloccato ? 'Team bloccato per questo match' : 'Scegli il team' }), select);

        const sets = Teams.import(scelte[lato].testo) || [];
        corpo.append(el('div', { class: 'anteprima-fila' }, sets.map(s => sprite(s.species, false))));
        const problemi = scelte[lato].problemi || [];
        if (problemi.length) {
            corpo.append(el('div', { class: 'errore' },
                el('strong', { testo: `Questo team non è al livello del formato (${dati.livello}). Risalvalo dal Box.` }),
                el('ul', {}, problemi.map(t => el('li', { testo: t })))));
        }
        if (!scelte[lato].completo) {
            corpo.append(el('p', { class: 'avviso', testo: 'Team salvato prima dell\'aggiornamento del Box: livello, Gigantamax, sesso e felicità usano i valori predefiniti. Risalvalo dal Box incollando il testo originale.' }));
        }

        corpo.append(el('div', { class: 'riga-azioni' }, el('button', {
            class: 'btn ' + (pronti[lato] ? 'scelto' : 'primario'),
            disabled: problemi.length > 0,
            onclick: () => {
                pronti[lato] = !pronti[lato];
                if (pronti.p1 && pronti.p2) {
                    config = {
                        formato: dati.formato,
                        etichetta: dati.categoria,
                        p1: { nome: dati.giocatori.p1.nome, team: scelte.p1.testo },
                        p2: { nome: dati.giocatori.p2.nome, team: scelte.p2.testo },
                        teamScelti: { p1: scelte.p1.nome, p2: scelte.p2.nome }
                    };
                    return avviaBattaglia();
                }
                disegna(lato);
            }
        }, pronti[lato] ? 'Pronto ✓ (annulla)' : 'Pronto')));
    };

    disegna('p1');
    disegna('p2');
}


// -----------------------------------------------------
// Avvio di una battaglia (un set)
// -----------------------------------------------------
function avviaBattaglia() {
    stato = new StatoCampo();
    pannelli = { p1: nuovoPannello(), p2: nuovoPannello() };
    finita = false;

    $('log').innerHTML = '';
    $('vittoria').classList.remove('visibile');
    impostaNomeGiocatore('p1', config.p1.nome);
    impostaNomeGiocatore('p2', config.p2.nome);

    battaglia = new BattagliaLocale({ formato: config.formato, p1: config.p1, p2: config.p2 });

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
        const errore = p.erroreInSospeso;   // es. "[Unavailable choice]": il simulatore manda subito una richiesta aggiornata
        Object.assign(p, nuovoPannello(), { grezza: richiesta, r: leggiRichiesta(richiesta), errore });
        if (botAttivo(lato)) return giocaBot(lato);
        avanza(lato);
    });

    battaglia.on('errore', (lato, messaggio) => {
        const p = pannelli[lato];
        if (messaggio.startsWith('[Unavailable choice]')) { p.erroreInSospeso = messaggio; return; }
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
}

function nuovoPannello() {
    return {
        grezza: null,            // richiesta originale del simulatore
        r: null,                 // richiesta "letta" (leggiRichiesta)
        bozza: [],               // scelte già fatte, una per slot
        potenziamento: null,     // 'dynamax', 'terastallize', 'mega', 'zmove'... scelto per lo slot corrente
        usati: [],               // potenziamenti già assegnati in questo turno
        attesaBersaglio: null,
        ordine: [],              // anteprima: ordine dei Pokémon scelti
        inviata: false,
        errore: '',
        erroreInSospeso: ''
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
    const p = pannelli && pannelli.p2;
    if (botAttivo('p2') && p && p.grezza && !p.inviata) giocaBot('p2');
    else if (p) disegnaPannello('p2');
});


// -----------------------------------------------------
// Costruzione della scelta
// -----------------------------------------------------
// Riempie da solo gli slot che non richiedono decisioni
// e invia quando tutti gli slot hanno una scelta.
function avanza(lato) {
    const p = pannelli[lato];
    const r = p.r;

    if (!r || r.tipo === 'attesa' || r.tipo === 'anteprima') return disegnaPannello(lato);

    const numSlot = r.tipo === 'cambio' ? r.slotDaCambiare.length : r.attivi.length;

    while (p.bozza.length < numSlot) {
        const i = p.bozza.length;
        if (r.tipo === 'cambio' && (!r.slotDaCambiare[i] || candidati(lato, i).length === 0)) { p.bozza.push('pass'); continue; }
        if (r.tipo === 'mossa' && r.attivi[i].esausto) { p.bozza.push('pass'); continue; }
        break;
    }

    if (p.bozza.length === numSlot) return invia(lato, p.bozza.join(', '));
    disegnaPannello(lato);
}

function scegliSlot(lato, scelta) {
    const p = pannelli[lato];
    if (p.potenziamento) p.usati.push(p.potenziamento);
    p.bozza.push(scelta);
    p.potenziamento = null;
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
    Object.assign(p, { bozza: [], potenziamento: null, usati: [], attesaBersaglio: null, ordine: [] });
    avanza(lato);
}

// Chi può entrare nello slot indicato (esclusi quelli già scelti in questo turno)
function candidati(lato, slot) {
    const p = pannelli[lato];
    const giaScelti = p.bozza.filter(s => s.startsWith('switch')).map(s => parseInt(s.split(' ')[1]));
    return candidatiCambio(p.r, slot, giaScelti);
}

function bersagliValidi(lato, tipoTarget, slot) {
    const avversario = lato === 'p1' ? 'p2' : 'p1';
    const pkmIn = b => stato.campo[b.lato === 'mio' ? lato : avversario][b.slot];
    return bersagliScegliibili(tipoTarget, slot, b => { const x = pkmIn(b); return x && x.hp > 0; })
        .map(b => ({
            ...b,
            pkm: pkmIn(b),
            chi: b.lato === 'avversario' ? 'avversario' : (b.slot === slot ? 'se stesso' : 'alleato')
        }));
}

function sceltaMossa(lato, attivo, mossa) {
    const p = pannelli[lato];
    const eff = mossaEffettiva(attivo, mossa, p.potenziamento);
    const base = `move ${mossa.numero}`;
    const suffisso = p.potenziamento ? ` ${p.potenziamento}` : '';

    if (richiedeBersaglio(eff.target, p.r.attivi.length)) {
        const validi = bersagliValidi(lato, eff.target, attivo.slot);
        if (validi.length > 1) {
            p.attesaBersaglio = { base, suffisso, validi, nomeMossa: eff.nome };
            return disegnaPannello(lato);
        }
        return scegliSlot(lato, `${base} ${validi[0].valore}${suffisso}`);
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
    const testo = daScegliere < squadra.length
        ? `Scegli ${daScegliere} Pokémon: i primi scendono in campo.`
        : 'Scegli l\'ordine: i primi scendono in campo.';

    corpo.append(el('p', { class: 'domanda', testo }));
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

    corpo.append(el('p', { class: 'domanda', testo: `Cosa fa ${attivo.pokemon.nome}?` }));

    corpo.append(el('div', { class: 'griglia' }, attivo.mosse.map(m => {
        const eff = mossaEffettiva(attivo, m, p.potenziamento);
        const nome = eff ? eff.nome : m.nome;
        const tipo = (Dex.moves.get(nome).type || '').toLowerCase();
        return el('button', {
            class: `btn mossa t-${tipo}`,
            disabled: !eff || m.disabilitata || m.pp === 0,
            onclick: () => sceltaMossa(lato, attivo, m)
        }, nome, el('small', { testo: m.ppMax ? `${m.pp}/${m.ppMax}` : '' }));
    })));

    const potenziamenti = attivo.potenziamenti.filter(x => !p.usati.includes(x.tipo));
    if (potenziamenti.length) {
        corpo.append(el('div', { class: 'riga-azioni' }, potenziamenti.map(x => el('button', {
            class: 'btn' + (p.potenziamento === x.tipo ? ' attivo' : ''),
            'aria-pressed': p.potenziamento === x.tipo ? 'true' : 'false',
            onclick: () => { p.potenziamento = p.potenziamento === x.tipo ? null : x.tipo; disegnaPannello(lato); }
        }, x.etichetta))));
    }

    const libero = attivo.bloccato ? [] : candidati(lato, attivo.slot);
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
            b.pkm ? b.pkm.nome : 'Posizione vuota', el('small', { testo: b.chi }))
    )));
    corpo.append(el('div', { class: 'riga-azioni' },
        el('button', { class: 'btn secondario', onclick: () => { p.attesaBersaglio = null; disegnaPannello(lato); } }, 'Indietro')));
}

function disegnaCambio(lato, corpo) {
    const p = pannelli[lato];
    const slot = p.bozza.length;
    const rianima = p.r.squadra[slot] && p.r.squadra[slot].rianima;
    const uscente = stato.campo[lato][slot];

    corpo.append(el('p', {
        class: 'domanda',
        testo: rianima ? 'Chi vuoi rianimare?' : `Chi entra al posto di ${uscente ? uscente.nome : 'questo slot'}?`
    }));
    corpo.append(el('div', { class: 'griglia' }, candidati(lato, slot).map(pkm =>
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

    // In singolo c'è un solo slot per lato
    const slot = lato => stato.campo[lato].filter((pkm, i) => i === 0 || pkm);
    campo.replaceChildren(
        el('div', { class: 'fila avversario' }, slot('p2').map(pkm => scheda(pkm, false))),
        el('div', { class: 'fila mia' }, slot('p1').map(pkm => scheda(pkm, true)))
    );
}

function mostraMessaggioCampo(testo) {
    $('campo').replaceChildren(el('div', { class: 'caricamento', testo }));
}

function scheda(pkm, retro) {
    if (!pkm) return el('div', { class: 'scheda vuota' }, el('div', { class: 'sprite' }), el('div', { class: 'nome-pkm', testo: '—' }));

    const pct = pkm.hpMax ? Math.round(pkm.hp / pkm.hpMax * 100) : 0;
    const colore = pct > 50 ? '#09ca49' : pct > 20 ? '#ffbd44' : '#d6002a';
    const classi = 'scheda' + (pkm.hp === 0 ? ' ko' : '') + (pkm.dinamax ? ' dinamax' : '');

    return el('div', { class: classi },
        el('div', { class: 'sprite' }, sprite(pkm.specie, retro)),
        el('div', {},
            el('div', { class: 'nome-pkm' }, pkm.nome, el('small', { class: 'livello', testo: ` Lv ${pkm.livello}` })),
            el('div', { class: 'barra', role: 'img', 'aria-label': `Salute ${pct}%` },
                el('div', { style: `width:${pct}%;background:${colore}` })),
            el('div', { class: 'dettagli' },
                el('span', { testo: `${pct}%` }),
                pkm.tera ? el('span', { class: 'stato', testo: `tera ${pkm.tera}` }) : null,
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
    $('info-turno').replaceChildren(...[
        el('span', { testo: config.etichetta }),
        el('span', { testo: stato.turno ? `Turno ${stato.turno}` : 'Anteprima squadre' }),
        stato.meteo ? el('span', { testo: stato.meteo }) : null,
        stato.terreno ? el('span', { testo: stato.terreno }) : null
    ].filter(Boolean));
}

function impostaNomeGiocatore(lato, nome) {
    $(`nome-${lato}`).textContent = nome;
    $(`titolo-${lato}`).textContent = nome;
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
    // "123/175 par" -> "70% par"; "0 fnt" -> "KO"
    if (condizione.endsWith(' fnt')) return 'KO';
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
