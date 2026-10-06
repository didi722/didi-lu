// =====================================================
// CONTROLLO DEL TEAM PER GENERAZIONE — Poké-Tournament
//
// Un team è giocabile in un formato di generazione N solo se tutto ciò che contiene esisteva già in quella generazione: la specie,
// l'abilità (ed è una di quelle della specie di allora), lo strumento e le mosse. Questo file è LA regola: la usano
//   - il Box (box.html, validaCoerenzaGenerazione) quando si salva un team,
//   - il simulatore sul sito (team-sito.js, controllaTeam) quando due giocatori scelgono il team,
//   - le Cloud Functions (partita.js, controllaTeam) quando il server avvia la partita.
// Così un team che il Box accetta non può essere rifiutato dal simulatore, e viceversa.
//
// "Esisteva" vuol dire "è stato introdotto in quella generazione o prima", non "è giocabile nei giochi di quella generazione":
//   - le forme di Hisui e i Pokémon di Leggende Arceus (Wyrdeer, Kleavor, Ursaluna, Basculegion, Sneasler, Overqwil, Enamorus) sono Gen 8;
//   - le mosse di Leggende Arceus (da Dire Claw a Take Heart) e la sua abilità, Sharpness, sono Gen 8.
// Showdown nella Gen 8 li segna "Future" perché non ci sono in Spada e Scudo: il sito NON si fida di quel segno, ma solo della generazione
// di debutto (le funzioni genSpecie, genMossa, genAbilita, genStrumento qui sotto).
//
//   ControlloTeam.problemiDelSet(set, regole, fonti)  -> [testo dei problemi]
//     set    { nome, specie, abilita, strumento, mosse: [...], livello? }       (`specie` è il nome per cercarla, `nome` come lo si mostra)
//     regole { gen, delta, livello?, meccaniche?, controllaSpecie? }            (delta: DatiGen.carica(gen), null per la Gen 9)
//     fonti  { specie(nome), abilita(nome), strumento(nome), mossa(nome), base(sp) }
//                    ognuna restituisce la voce dei dati di Showdown ({ num, gen?, forme, baseSpecies, abilities... }) o null se non esiste
//
// Funziona nel browser (window.ControlloTeam) e in Node (require). ATTENZIONE: questo file esiste in due copie identiche,
// docs/controllo-team.js (Box e simulatore sul sito) e functions/controllo-team.js (Cloud Functions): modificane una e copiala sull'altra.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./dati-gen'));
    else radice.ControlloTeam = fabbrica(radice.DatiGen);
})(typeof self !== 'undefined' ? self : this, function (DatiGen) {
    'use strict';

    const idDi = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, '');

    // -----------------------------------------------------
    // 1. LA GENERAZIONE DI DEBUTTO
    // -----------------------------------------------------
    // Si calcola SEMPRE dal numero (e dalla forma): il campo "gen" che il simulatore aggiunge ad alcune voci non si usa, così il Box (che
    // legge i dati di Showdown del browser, senza quel campo) e il simulatore e il server arrivano sempre alla stessa risposta.
    /** Generazione in cui è nata una specie. `trovaBase(nome)` serve alle forme cosmetiche senza numero (Gastrodon-East): contano come la specie base. */
    function genSpecie(sp, trovaBase) {
        if (!sp) return 0;
        const forme = sp.forme || '';
        const n = sp.num || 0;
        if (n < 1) {
            const base = sp.baseSpecies && trovaBase ? trovaBase(sp.baseSpecies) : null;
            return base && base !== sp ? genSpecie(base, trovaBase) : 99;
        }
        if (n >= 906 || forme.includes('Paldea')) return 9;
        if (n >= 810 || ['Gmax', 'Galar', 'Galar-Zen', 'Hisui'].includes(forme)) return 8;
        if (n >= 722 || forme.startsWith('Alola') || forme === 'Starter') return 7;
        if (n >= 650 || /^(Mega|Primal)/.test(forme)) return 6;
        if (n >= 494) return 5;
        if (n >= 387) return 4;
        if (n >= 252) return 3;
        if (n >= 152) return 2;
        return 1;
    }

    /** Generazione in cui è nata una mossa. Le mosse di Leggende Arceus (Dire Claw → Take Heart) valgono Gen 8, come le forme di Hisui. */
    function genMossa(m) {
        if (!m) return 0;
        const n = m.num || 0;
        if (n >= 827 && n <= 850 && !m.isMax && !m.isZ) return 8;
        if (n >= 827) return 9;
        if (n >= 743) return 8;
        if (n >= 622) return 7;
        if (n >= 560) return 6;
        if (n >= 468) return 5;
        if (n >= 355) return 4;
        if (n >= 252) return 3;
        if (n >= 166) return 2;
        return 1;
    }

    /** Generazione in cui è nata un'abilità (senza dati: la Gen 3, la prima che le ha). Sharpness, di Leggende Arceus, vale Gen 8. */
    function genAbilita(a) {
        if (!a) return 3;
        if (a.num === 292) return 8;        // Sharpness (Kleavor, Samurott di Hisui): nata in Leggende Arceus
        const n = a.num || 0;
        if (n >= 268) return 9;
        if (n >= 234) return 8;
        if (n >= 192) return 7;
        if (n >= 165) return 6;
        if (n >= 124) return 5;
        if (n >= 77) return 4;
        return 3;
    }

    /** Generazione in cui è nato uno strumento (0 = non lo dice: vale in ogni generazione). */
    const genStrumento = i => (i && i.gen) || 0;

    // -----------------------------------------------------
    // 2. I PROBLEMI DI UN SET
    // -----------------------------------------------------
    function problemiDelSet(set, regole, fonti) {
        const problemi = [];
        const gen = regole.gen || 9;
        const nome = set.nome || set.specie || 'Pokémon';
        const sp = fonti.specie ? fonti.specie(set.specie || set.nome) : null;

        if (regole.livello && set.livello && Number(set.livello) !== Number(regole.livello)) {
            problemi.push(`${nome} is level ${set.livello} instead of ${regole.livello}.`);
        }

        // la specie (i formati senza limiti di specie, Anything Goes, non controllano questo: le abilità sì)
        if (sp && regole.controllaSpecie !== false && genSpecie(sp, n => fonti.specie(n)) > gen) {
            problemi.push(`${nome} does not exist in Gen ${gen} (it first appears in Gen ${genSpecie(sp, n => fonti.specie(n))}).`);
        }

        const strumento = set.strumento && String(set.strumento).toLowerCase() !== 'none' ? fonti.strumento(set.strumento) : null;
        if (strumento && !regole.meccaniche && (strumento.megaStone || strumento.zMove)) {
            problemi.push(`${nome} holds ${strumento.name || set.strumento}, but this format has no generational mechanics.`);
        }

        // abilità, strumento, mosse: la stessa funzione del Team Builder (dati-gen.js), con le generazioni di debutto di qui
        const base = sp && fonti.base ? fonti.base(sp) : null;
        const lette = {
            abilitaGen: n => { const a = fonti.abilita(n); return a ? genAbilita(a) : null; },
            strumentoGen: n => { const i = fonti.strumento(n); return i ? genStrumento(i) : null; },
            mossaGen: n => { const m = fonti.mossa(n); return m ? genMossa(m) : null; }
        };
        const comune = { id: idDi(sp ? sp.name : (set.specie || set.nome)), nome, abilita: set.abilita, strumento: set.strumento, mosse: set.mosse };
        let trovati = DatiGen.controllaSet(Object.assign({}, comune), gen, regole.delta || null, Object.assign({ specie: sp }, lette));
        // una forma di battaglia (Mega, Zacian-Crowned...) ha le sue abilità, o quelle della specie da cui parte: va bene l'una o l'altra
        if (base && trovati.some(x => x.includes('is not one of its abilities'))) {
            const dalBase = DatiGen.controllaSet(Object.assign({}, comune, { id: idDi(base.name) }), gen, regole.delta || null, Object.assign({ specie: base }, lette));
            if (!dalBase.some(x => x.includes('is not one of its abilities'))) trovati = trovati.filter(x => !x.includes('is not one of its abilities'));
        }
        problemi.push(...trovati);
        return problemi;
    }

    /** I problemi di tutto il team. `sets` è una lista di set come sopra. */
    function problemiDelTeam(sets, regole, fonti) {
        const out = [];
        for (const s of sets || []) out.push(...problemiDelSet(s, regole, fonti));
        return out;
    }

    // -----------------------------------------------------
    // 3. FONTI DAL SIMULATORE (sito e Cloud Functions)
    // -----------------------------------------------------
    /** Le fonti lette dal Dex del simulatore (Dex di pkmn-sim.js sul sito, PS.Dex sul server): i dati di oggi, con la generazione di debutto di ciascuna voce. */
    function fontiDaDex(Dex) {
        const trova = voce => (voce && voce.exists ? voce : null);
        const base = sp => {
            if (!sp) return null;
            if (sp.battleOnly) {
                const nome = Array.isArray(sp.battleOnly) ? sp.battleOnly[0] : sp.battleOnly;
                return trova(Dex.species.get(nome)) || sp;
            }
            if (/^(Mega|Primal)/.test(sp.forme || '') && sp.baseSpecies) return trova(Dex.species.get(sp.baseSpecies)) || sp;
            return sp;
        };
        return {
            specie: nome => trova(Dex.species.get(nome)),
            abilita: nome => trova(Dex.abilities.get(nome)),
            strumento: nome => trova(Dex.items.get(nome)),
            mossa: nome => trova(Dex.moves.get(nome)),
            base: sp => (sp && (sp.battleOnly || /^(Mega|Primal)/.test(sp.forme || '')) ? base(sp) : null)
        };
    }

    /** Il team scritto in testo Showdown (già letto in `sets` da Teams.import) → i problemi, con le regole del regolamento. */
    function problemiDeiSetShowdown(sets, regole, Dex) {
        const lista = (sets || []).map(s => ({
            nome: s.species || s.name, specie: s.species || s.name, livello: s.level || 100,
            abilita: s.ability, strumento: s.item, mosse: s.moves || []
        }));
        return problemiDelTeam(lista, regole, fontiDaDex(Dex));
    }

    return { genSpecie, genMossa, genAbilita, genStrumento, problemiDelSet, problemiDelTeam, fontiDaDex, problemiDeiSetShowdown };
});
