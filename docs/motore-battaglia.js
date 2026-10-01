// =====================================================
// MOTORE BATTAGLIA
// Fa da ponte tra il simulatore di Showdown e la pagina.
// Nessun riferimento al DOM: la grafica sta in battle-ui.js.
//
// BattagliaLocale: il simulatore gira nel browser (prove e modalità locale).
// La partita online usa BattagliaOnline (motore-online.js), stessa interfaccia.
// =====================================================

import { BattleStreams, Teams, TeamValidator } from './pkmn-sim.js';


// -----------------------------------------------------
// 1. BATTAGLIA LOCALE
// -----------------------------------------------------
// Eventi:
//   'log'       (righe)             righe pubbliche del protocollo
//   'richiesta' (lato, richiesta)   il simulatore chiede una scelta a p1/p2
//   'errore'    (lato, messaggio)   scelta non valida
//   'fine'      ({ vincitore })     nome del vincitore, null se pareggio
export class BattagliaLocale {
    constructor({ formato, p1, p2 }) {
        this.formato = formato;
        this.giocatori = { p1, p2 };          // { nome, team } — team in formato export o array di set
        this.righeLog = [];                    // log pubblico completo (servirà per il replay)
        this.ascoltatori = {};
        this.streams = null;
    }

    on(evento, fn) {
        (this.ascoltatori[evento] ||= []).push(fn);
        return this;
    }

    _emetti(evento, ...args) {
        (this.ascoltatori[evento] || []).forEach(fn => fn(...args));
    }

    avvia() {
        this.streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());

        this._ascoltaSpettatore();
        this._ascoltaGiocatore('p1');
        this._ascoltaGiocatore('p2');

        const spec = { formatid: this.formato };
        const g1 = { name: this.giocatori.p1.nome, team: impacchettaTeam(this.giocatori.p1.team) };
        const g2 = { name: this.giocatori.p2.nome, team: impacchettaTeam(this.giocatori.p2.team) };

        this.streams.omniscient.write(
            `>start ${JSON.stringify(spec)}\n` +
            `>player p1 ${JSON.stringify(g1)}\n` +
            `>player p2 ${JSON.stringify(g2)}`
        );
    }

    scegli(lato, scelta) {
        this.streams[lato].write(scelta);
    }

    async _ascoltaSpettatore() {
        for await (const blocco of this.streams.spectator) {
            const righe = blocco.split('\n').filter(r => r.startsWith('|'));
            this.righeLog.push(...righe);
            this._emetti('log', righe);

            for (const r of righe) {
                if (r.startsWith('|win|')) this._emetti('fine', { vincitore: r.slice(5) });
                if (r === '|tie') this._emetti('fine', { vincitore: null });
            }
        }
    }

    async _ascoltaGiocatore(lato) {
        for await (const blocco of this.streams[lato]) {
            for (const r of blocco.split('\n')) {
                if (r.startsWith('|request|')) {
                    const json = r.slice(9);
                    if (json) this._emetti('richiesta', lato, JSON.parse(json));
                } else if (r.startsWith('|error|')) {
                    this._emetti('errore', lato, r.slice(7));
                }
            }
        }
    }
}


// -----------------------------------------------------
// 2. TEAM
// -----------------------------------------------------
export function impacchettaTeam(team) {
    const sets = typeof team === 'string' ? Teams.import(team) : team;
    return Teams.pack(sets);
}

// Restituisce null se il team è valido, altrimenti l'elenco dei problemi.
export function validaTeam(formato, team) {
    const sets = typeof team === 'string' ? Teams.import(team) : team;
    if (!sets || !sets.length) return ['The team is empty or unreadable'];
    return TeamValidator.get(formato).validateTeam(sets);
}


// -----------------------------------------------------
// 3. BERSAGLI (doppio)
// -----------------------------------------------------
// Numerazione di Showdown: avversari 1 e 2, alleati -1 e -2.
// Il mio slot 0 è -1, il mio slot 1 è -2.
const TARGET_CON_SCELTA = ['normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf'];

export function richiedeBersaglio(tipoTarget, numAttivi) {
    return numAttivi > 1 && TARGET_CON_SCELTA.includes(tipoTarget);
}

export function bersagliPossibili(tipoTarget, mioSlot) {
    const altroSlot = mioSlot === 0 ? 1 : 0;
    const avversari = [{ valore: 1, lato: 'avversario', slot: 0 }, { valore: 2, lato: 'avversario', slot: 1 }];
    const alleato = { valore: -(altroSlot + 1), lato: 'mio', slot: altroSlot };
    const se = { valore: -(mioSlot + 1), lato: 'mio', slot: mioSlot };

    switch (tipoTarget) {
        case 'adjacentFoe': return avversari;
        case 'adjacentAlly': return [alleato];
        case 'adjacentAllyOrSelf': return [se, alleato];
        case 'normal':
        case 'any': return [...avversari, alleato];
        default: return [];
    }
}


// -----------------------------------------------------
// 4. LETTURA DELLA RICHIESTA
// -----------------------------------------------------
// Trasforma la richiesta grezza in qualcosa di comodo per la pagina.
export function leggiRichiesta(richiesta) {
    if (!richiesta || richiesta.wait) return { tipo: 'attesa' };

    const squadra = richiesta.side.pokemon.map((p, i) => ({
        indice: i + 1,
        nome: p.details.split(',')[0],
        condizione: p.condition,
        esausto: p.condition.endsWith(' fnt'),
        attivo: !!p.active,
        rianima: !!p.reviving,       // Revival Blessing: deve scegliere un Pokémon esausto
        comanda: !!p.commanding,     // Commander (Tatsugiri): non agisce
        strumento: p.item,
        abilita: p.ability || p.baseAbility,
        mosse: p.moves
    }));

    if (richiesta.teamPreview) {
        return { tipo: 'anteprima', squadra, daScegliere: richiesta.maxChosenTeamSize || squadra.length };
    }

    if (richiesta.forceSwitch) {
        return { tipo: 'cambio', squadra, slotDaCambiare: richiesta.forceSwitch };
    }

    const attivi = richiesta.active.map((a, i) => {
        const pkm = squadra[i];
        const dinamizzato = !!a.maxMoves && !a.canDynamax;
        const mosseMax = a.maxMoves ? a.maxMoves.maxMoves : null;
        const mosseZ = Array.isArray(a.canZMove) ? a.canZMove : null;

        // Meccaniche speciali disponibili in questo turno (una per volta)
        // (etichette in inglese: sono i testi dei bottoni della pagina)
        const potenziamenti = [];
        if (a.canDynamax) potenziamenti.push({ tipo: 'dynamax', etichetta: 'Dynamax' });
        if (a.canTerastallize) potenziamenti.push({ tipo: 'terastallize', etichetta: `Terastallize (${a.canTerastallize})` });
        if (a.canMegaEvo) potenziamenti.push({ tipo: 'mega', etichetta: 'Mega Evolve' });
        if (a.canMegaEvoX) potenziamenti.push({ tipo: 'megax', etichetta: 'Mega Evolve X' });
        if (a.canMegaEvoY) potenziamenti.push({ tipo: 'megay', etichetta: 'Mega Evolve Y' });
        if (a.canUltraBurst) potenziamenti.push({ tipo: 'ultra', etichetta: 'Ultra Burst' });
        if (mosseZ) potenziamenti.push({ tipo: 'zmove', etichetta: 'Z-Move' });

        return {
            slot: i,
            pokemon: pkm,
            esausto: pkm.esausto || pkm.comanda,   // in entrambi i casi lo slot passa
            bloccato: !!a.trapped,
            dinamizzato,
            potenziamenti,
            mosse: a.moves.map((m, j) => ({
                numero: j + 1,
                nome: m.move,
                pp: m.pp,
                ppMax: m.maxpp,
                target: m.target,
                disabilitata: !!m.disabled,
                max: mosseMax && mosseMax[j] ? { nome: mosseMax[j].move, target: mosseMax[j].target } : null,
                z: mosseZ && mosseZ[j] ? { nome: mosseZ[j].move, target: mosseZ[j].target } : null
            }))
        };
    });

    return { tipo: 'mossa', squadra, attivi };
}


// Chi può entrare in uno slot. Con Revival Blessing si sceglie
// invece un Pokémon esausto da rianimare.
export function candidatiCambio(r, slot, esclusi = []) {
    const rianima = r.tipo === 'cambio' && r.squadra[slot] && r.squadra[slot].rianima;
    return r.squadra.filter(p => !esclusi.includes(p.indice) && !p.attivo &&
        (rianima ? p.esausto : !p.esausto));
}

// Bersagli selezionabili. Se nessun bersaglio è in piedi (es. Helping Hand
// con l'alleato esausto) il simulatore vuole comunque una posizione:
// in quel caso si restituiscono le posizioni valide anche se vuote.
export function bersagliScegliibili(tipoTarget, slot, vivo) {
    const tutti = bersagliPossibili(tipoTarget, slot);
    const inPiedi = tutti.filter(vivo);
    return inPiedi.length ? inPiedi : tutti.slice(0, 1);
}

// Nome e bersaglio effettivi di una mossa, dato il potenziamento scelto.
// Restituisce null se con quel potenziamento la mossa non si può usare
// (es. mossa senza versione Z).
export function mossaEffettiva(attivo, mossa, potenziamento) {
    if (potenziamento === 'zmove') return mossa.z ? { ...mossa.z } : null;
    if ((potenziamento === 'dynamax' || attivo.dinamizzato) && mossa.max) return { ...mossa.max };
    return { nome: mossa.nome, target: mossa.target };
}


// -----------------------------------------------------
// 5. STATO DEL CAMPO (dal log pubblico)
// -----------------------------------------------------
// Tiene traccia di chi è in campo, HP in %, stato, dinamax.
// È la base su cui la grafica disegnerà barre e sprite.
export class StatoCampo {
    constructor() {
        this.turno = 0;
        this.nomi = { p1: '', p2: '' };
        this.campo = { p1: [null, null], p2: [null, null] };
        this.anteprima = { p1: [], p2: [] };  // squadre mostrate in anteprima
        this.meteo = null;
        this.terreno = null;
        this.vincitore = undefined;
    }

    aggiorna(righe) {
        for (const riga of righe) this._riga(riga.split('|').slice(1));
    }

    _riga(p) {
        const [cmd] = p;
        switch (cmd) {
            case 'player': if (p[2]) this.nomi[p[1]] = p[2]; break;
            case 'turn': this.turno = parseInt(p[1]); break;
            case 'poke': this.anteprima[p[1]].push(p[2].split(',')[0]); break;
            case 'switch': case 'drag': case 'replace': {
                const { lato, slot } = posizione(p[1]);
                this.campo[lato][slot] = {
                    nome: p[1].split(': ')[1],
                    specie: p[2].split(',')[0],
                    livello: leggiLivello(p[2]),
                    ...leggiHp(p[3]),
                    dinamax: false
                };
                break;
            }
                        case 'swap': {
                // Ally Switch: "|swap|p1a: Oranguru|1" = Oranguru va nello slot 1
                // e chi era lì prende il suo posto.
                const { lato, slot } = posizione(p[1]);
                const nuovo = /^\d+$/.test(p[2]) ? parseInt(p[2], 10) : posizione(p[2]).slot;
                const c = this.campo[lato];
                if (c && nuovo !== slot) [c[slot], c[nuovo]] = [c[nuovo] || null, c[slot]];
                break;
            }
            case 'detailschange': case '-formechange': {
                const pkm = this._pkm(p[1]);
                if (pkm) pkm.specie = p[2].split(',')[0];
                break;
            }
            case '-damage': case '-heal': case '-sethp': {
                const pkm = this._pkm(p[1]);
                if (pkm) Object.assign(pkm, leggiHp(p[2]));
                break;
            }
            case 'faint': {
                const pkm = this._pkm(p[1]);
                if (pkm) { pkm.hp = 0; pkm.stato = 'fnt'; }
                break;
            }
            case '-status': { const pkm = this._pkm(p[1]); if (pkm) pkm.stato = p[2]; break; }
            case '-curestatus': { const pkm = this._pkm(p[1]); if (pkm) pkm.stato = ''; break; }
            case '-start': if (p[2] === 'Dynamax') { const pkm = this._pkm(p[1]); if (pkm) pkm.dinamax = true; } break;
            case '-end': if (p[2] === 'Dynamax') { const pkm = this._pkm(p[1]); if (pkm) pkm.dinamax = false; } break;
            case '-terastallize': { const pkm = this._pkm(p[1]); if (pkm) pkm.tera = p[2]; break; }
            case '-weather': this.meteo = (p[1] === 'none') ? null : p[1]; break;
            case '-fieldstart': if (/Terrain/.test(p[1])) this.terreno = p[1].replace('move: ', ''); break;
            case '-fieldend': if (/Terrain/.test(p[1])) this.terreno = null; break;
            case 'win': this.vincitore = p[1]; break;
            case 'tie': this.vincitore = null; break;
        }
    }

    _pkm(ident) {
        const { lato, slot } = posizione(ident);
        return this.campo[lato]?.[slot] || null;
    }
}

function posizione(ident) {
    // "p1a: Rillaboom" -> { lato: 'p1', slot: 0 }
    const lato = ident.slice(0, 2);
    const lettera = ident.charAt(2);
    return { lato, slot: lettera === 'b' ? 1 : 0 };
}

function leggiLivello(dettagli) {
    // "Calyrex-Shadow, L50, M" -> 50; senza "L" il livello è 100
    const m = String(dettagli || '').match(/, L(\d+)/);
    return m ? parseInt(m[1], 10) : 100;
}

function leggiHp(testo) {
    // "73/100", "73/100 brn", "0 fnt"
    if (!testo) return {};
    const [hpParte, stato = ''] = testo.split(' ');
    if (hpParte === '0') return { hp: 0, hpMax: 100, stato: 'fnt' };
    const [hp, hpMax] = hpParte.split('/').map(Number);
    return { hp, hpMax, stato };
}


// -----------------------------------------------------
// 6. SCELTA CASUALE (bot di prova)
// -----------------------------------------------------
// Serve per provare la pagina da soli: il bot sceglie a caso
// tra le opzioni valide. Più avanti si potrà togliere.
export function sceltaCasuale(richiesta, stato, lato) {
    const r = leggiRichiesta(richiesta);
    const caso = arr => arr[Math.floor(Math.random() * arr.length)];
    const avversario = lato === 'p1' ? 'p2' : 'p1';

    if (r.tipo === 'attesa') return null;

    if (r.tipo === 'anteprima') {
        const ordine = r.squadra.map(p => p.indice).sort(() => Math.random() - 0.5);
        return 'team ' + ordine.slice(0, r.daScegliere).join('');
    }

    const giaScelti = new Set();
    const panchinaLibera = (slot = 0) => candidatiCambio(r, slot, [...giaScelti]);

    if (r.tipo === 'cambio') {
        return r.slotDaCambiare.map((deveCambiare, slot) => {
            if (!deveCambiare) return 'pass';
            const libero = panchinaLibera(slot);
            if (!libero.length) return 'pass';
            const scelto = caso(libero);
            giaScelti.add(scelto.indice);
            return `switch ${scelto.indice}`;
        }).join(', ');
    }

    const usati = new Set();
    const numAttivi = r.attivi.length;

    return r.attivi.map(a => {
        if (a.esausto) return 'pass';

        const libero = a.bloccato ? [] : panchinaLibera();
        if (libero.length && Math.random() < 0.1) {
            const scelto = caso(libero);
            giaScelti.add(scelto.indice);
            return `switch ${scelto.indice}`;
        }

        const disponibili = a.potenziamenti.filter(p => !usati.has(p.tipo));
        let potenziamento = disponibili.length && Math.random() < 0.3 ? caso(disponibili).tipo : null;

        let mosseUsabili = a.mosse.filter(m => !m.disabilitata && m.pp !== 0 && mossaEffettiva(a, m, potenziamento));
        if (!mosseUsabili.length && potenziamento) {
            potenziamento = null;
            mosseUsabili = a.mosse.filter(m => !m.disabilitata && m.pp !== 0);
        }
        if (!mosseUsabili.length) return 'move 1';
        if (potenziamento) usati.add(potenziamento);

        const mossa = caso(mosseUsabili);
        const { target } = mossaEffettiva(a, mossa, potenziamento);
        let scelta = `move ${mossa.numero}`;

        if (richiedeBersaglio(target, numAttivi)) {
            const validi = bersagliScegliibili(target, a.slot, b => {
                const pkm = stato.campo[b.lato === 'mio' ? lato : avversario][b.slot];
                return pkm && pkm.hp > 0;
            });
            scelta += ` ${caso(validi).valore}`;
        }
        if (potenziamento) scelta += ` ${potenziamento}`;
        return scelta;
    }).join(', ');
}
