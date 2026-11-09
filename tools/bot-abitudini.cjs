'use strict';
// Giocatori con delle abitudini (per le prove della CPU: prova-cpu-avversario.cjs, tara-cpu.cjs): decidono come la CPU di sempre, ma a ogni decisione di ogni
// loro Pokémon, con le probabilità del loro profilo, si parano, cambiano o usano una mossa di stato.

// le abitudini aggiuntive del bot (probabilità per decisione di ogni suo Pokémon), prese dalle quote vere della lega (set giocati sul sito)
const BOT = {
    aggressore: { protezione: 0, cambio: 0, altro: 0 },
    lega: { protezione: 0.099, cambio: 0.038, altro: 0.129 },
    ilaria: { protezione: 0.163, cambio: 0.039, altro: 0.087 },       // si para molto (Guardian)
    pivot: { protezione: 0.08, cambio: 0.2, altro: 0.08 },            // cambia molto (Pivot)
    stratega: { protezione: 0.09, cambio: 0.024, altro: 0.268 },      // molte mosse di stato (Strategist)
    guardiano: { protezione: 0.3, cambio: 0.05, altro: 0.05 }         // il caso estremo: si para tre volte su dieci
};

// ---------------------------------------------------------------------------------
// Il giocatore con delle abitudini: la CPU di sempre, ma ogni tanto si para, cambia o fa una mossa di stato
// ---------------------------------------------------------------------------------
function creaGiocatore({ sim, IA, K, lato, casuale, abitudini }) {
    const base = IA.crea({ Dex: sim.Dex, lato, casuale });
    const caso = a => a[Math.floor(casuale() * a.length)];
    return {
        osserva: righe => base.osserva(righe),
        scegli(richiesta, opz) {
            const scelta = base.scegli(richiesta, opz);
            if (richiesta.teamPreview || richiesta.forceSwitch || richiesta.wait || !richiesta.active) return scelta;
            const squadra = richiesta.side.pokemon;
            const usati = new Set(scelta.split(', ').filter(x => x.startsWith('switch')).map(x => parseInt(x.split(' ')[1], 10)));
            const doppio = richiesta.active.length > 1;
            return scelta.split(', ').map((parte, slot) => {
                const a = richiesta.active[slot];
                if (!a || parte === 'pass') return parte;
                const x = casuale();
                const mosse = a.moves.map((m, j) => ({ m, j })).filter(y => !y.m.disabled && y.m.pp !== 0);
                if (x < abitudini.protezione) {
                    const prot = mosse.filter(y => K.PROTEZIONI.has(y.m.id));
                    return prot.length ? `move ${caso(prot).j + 1}` : parte;
                }
                if (x < abitudini.protezione + abitudini.cambio) {
                    if (a.trapped) return parte;
                    const liberi = squadra.map((p, i) => ({ p, i })).filter(y => !y.p.active && !y.p.condition.endsWith(' fnt') && !usati.has(y.i + 1));
                    if (!liberi.length) return parte;
                    const scelto = caso(liberi);
                    usati.add(scelto.i + 1);
                    return `switch ${scelto.i + 1}`;
                }
                if (x < abitudini.protezione + abitudini.cambio + abitudini.altro) {
                    const stato = mosse.filter(y => {
                        const d = sim.Dex.moves.get(y.m.id);
                        return d.category === 'Status' && !K.PROTEZIONI.has(y.m.id) && (!doppio || ['self', 'allySide', 'foeSide', 'all', 'allyTeam', 'normal', 'adjacentFoe', 'any'].includes(y.m.target));
                    });
                    if (!stato.length) return parte;
                    const { m, j } = caso(stato);
                    return `move ${j + 1}${doppio && ['normal', 'adjacentFoe', 'any'].includes(m.target) ? ` ${1 + Math.floor(casuale() * 2)}` : ''}`;
                }
                return parte;
            }).join(', ');
        }
    };
}

module.exports = { BOT, creaGiocatore };
