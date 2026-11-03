// =====================================================
// LA LEGA NEI TOOLTIP DEL BOX — Poké-Tournament
//
// I tooltip del Team Builder (velocità, debolezze, copertura, suggerimenti) confrontano il team con TUTTI i Pokémon legali del formato.
// Qui c'è il livello in più: gli stessi confronti con quello che si gioca DAVVERO nella lega, in quel formato. Solo fatti, niente
// "minacce" decise da un'euristica: quanti team lo portano, quanti set vince, chi supera chi.
//
// LegaBox.prepara(uso, battaglia) → { team, specie: [...], perId } oppure null se nessun team ha ancora giocato in quel formato.
//   `uso` è il risultato di UsoGlobale.calcola(dati, { formato }, battaglia) (con `squadre`): vale solo per i team iscritti che hanno
//   già giocato un set ufficiale, quindi non rivela team ancora segreti.
// Funzioni pure: niente DOM, niente Firebase, niente dati del Pokédex (le passa il Box con le funzioni `velMax`, `tipiDi`...).
// Si prova in Node (test/lega-box.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.LegaBox = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TOP_PREDEFINITO = 10;     // quanti dei Pokémon più usati contano nei confronti (velocità, copertura)
    const MIN_SET_PERC = 3;         // set con un vincitore per mostrare la % di vittorie di un Pokémon

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const perc = (parte, tutto) => (tutto > 0 ? Math.round((parte / tutto) * 100) : null);

    /** I numeri della lega per un formato, nella forma che serve ai tooltip; null se non c'è nessun team che ha giocato. */
    function prepara(uso) {
        if (!uso || !uso.totali || !uso.totali.team || !Array.isArray(uso.specie)) return null;
        const specie = uso.specie.filter(s => s && s.specieId && s.team > 0).map(s => {
            const b = s.battaglia;
            const giocati = b ? num(b.vinti) + num(b.persi) : 0;
            return {
                specieId: s.specieId, nome: s.nome, team: s.team, perc: s.perc,
                set: giocati, percVinti: giocati >= MIN_SET_PERC ? b.percVinti : null
            };
        }).sort((a, b) => b.team - a.team || a.nome.localeCompare(b.nome));
        return { team: uso.totali.team, specie, perId: new Map(specie.map(s => [s.specieId, s])), squadre: uso.squadre || [] };
    }

    /** I `quanti` Pokémon più usati (a parità di team, in ordine alfabetico). */
    const top = (lega, quanti = TOP_PREDEFINITO) => (lega ? lega.specie.slice(0, quanti) : []);

    /** Uso e vittorie di una specie: { team, perc, set, percVinti } oppure null se nessun team la porta. */
    const uso = (lega, specieId) => (lega && lega.perId.get(specieId)) || null;

    /**
     * Quanti dei Pokémon più usati la tua velocità supera (a 252 EV / 31 IV e natura +Spe, come il resto del tooltip).
     * @param {number} mia           la velocità del tuo Pokémon
     * @param {function(string): (number|null)} velMax   specieId → velocità massima di quella specie (null se non la si sa)
     */
    function velocita(lega, mia, velMax, quanti = TOP_PREDEFINITO) {
        const noti = top(lega, quanti).map(s => ({ ...s, vel: velMax(s.specieId) })).filter(s => Number.isFinite(s.vel));
        const piuLenti = noti.filter(s => s.vel < mia);
        const pari = noti.filter(s => s.vel === mia);
        const piuVeloci = noti.filter(s => s.vel > mia).sort((a, b) => a.vel - b.vel);
        return { considerati: noti.length, superati: piuLenti.length, pari, piuVeloci };
    }

    /** Quanti team della lega hanno almeno un Pokémon di quel tipo. `tipiDi(specieId)` → ['Ground', ...] */
    function teamConTipo(lega, tipiDi, tipo) {
        if (!lega || !lega.squadre.length) return 0;
        const t = String(tipo).toLowerCase();
        return lega.squadre.filter(sq => sq.specieId.some(id => (tipiDi(id) || []).some(x => String(x).toLowerCase() === t))).length;
    }

    /**
     * Contro i `quanti` Pokémon più usati: quanti il team colpisce superefficace, quanti al massimo alla pari, quanti resistono a tutto.
     * @param {function(string): (number|null)} miglioreContro   specieId → la miglior efficacia del team su quella specie (null se non la si sa)
     */
    function copertura(lega, miglioreContro, quanti = TOP_PREDEFINITO) {
        const noti = top(lega, quanti).map(s => ({ ...s, eff: miglioreContro(s.specieId) })).filter(s => Number.isFinite(s.eff));
        return {
            considerati: noti.length,
            superEfficaci: noti.filter(s => s.eff > 1).length,
            alMassimoAllaPari: noti.filter(s => s.eff === 1).length,
            resistono: noti.filter(s => s.eff < 1)
        };
    }

    /** Mette prima chi si gioca nella lega (i più usati per primi); gli altri restano nell'ordine di partenza. `idDi(voce)` → specieId */
    function ordinaPerUso(lega, voci, idDi) {
        if (!lega) return voci.slice();
        return voci.map((v, i) => ({ v, i, u: lega.perId.get(idDi(v)) }))
            .sort((a, b) => (!!b.u - !!a.u) || (a.u && b.u ? b.u.team - a.u.team : 0) || a.i - b.i)
            .map(x => x.v);
    }

    /** "33% of teams · 51% of sets won" per un Pokémon della lega; '' se nessuno lo porta */
    function frase(lega, specieId) {
        const u = uso(lega, specieId);
        if (!u) return '';
        return `${u.perc}% of league teams${u.percVinti != null ? ` · ${u.percVinti}% of sets won (${u.set})` : ''}`;
    }

    /** Etichetta corta per i chip: "33% · 51% win"; '' se nessuno lo porta */
    function etichetta(lega, specieId) {
        const u = uso(lega, specieId);
        if (!u) return '';
        return `${u.perc}%${u.percVinti != null ? ` · ${u.percVinti}% win` : ''}`;
    }

    return { prepara, top, uso, velocita, teamConTipo, copertura, ordinaPerUso, frase, etichetta, perc, TOP_PREDEFINITO, MIN_SET_PERC };
});
