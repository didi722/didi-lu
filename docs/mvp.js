// =====================================================
// MVP DELLA STAGIONE — Poké-Tournament
//
// Ogni stagione (League e Monoformat: servono i Pokémon veri) elegge un MVP: UN SINGOLO Pokémon, cioè quell'individuo di quel team, non la
// specie. Come funziona:
//   1. Durante la stagione c'è una classifica dei Pokémon (classifica()): un punteggio pesato sulle loro statistiche di QUELLA stagione
//      (Statistiche.calcola(dati, { stagione }).pokemon). Si aggiorna da sola a ogni set giocato.
//   2. Quando mancano pochi showdown alla fine (finestraVoto(): gli ultimi 3, o meno nelle stagioni corte) compare in matches.html il tasto
//      per votare. Si apre un modale con i primi 5; ogni giocatore della stagione ha 2 voti, su Pokémon diversi e non suoi.
//   3. Alla chiusura della stagione i voti si contano (spoglioMvp in risultati-match.js, gira anche nelle Cloud Functions): vince chi ha più
//      voti, a parità vincono tutti i primi. Il risultato sta in seasons/{id}/mvp/risultato; il titolo conta nelle statistiche
//      (Statistiche: mvpVinti) e dà il fiocco "Season MVP" al Pokémon (fiocchi.js).
//
// PUNTEGGIO. Si somma, per un Pokémon: KO fatti x3, set vinti mentre era in campo x4, presenze (set giocati) x1, set in cui è rimasto in piedi
// x1,5, set vinti come ultimo Pokémon rimasto x6, match vinti con lui in campo x2. Con questi pesi un Pokémon che gioca spesso, fa KO e vince
// emerge, ma uno che gioca poco e fa tutto bene non scompare. A parità: più KO, poi più presenze, poi il nome. Chi non è mai sceso in campo non c'è.
//
// Funzione pura, niente DOM e niente Firebase: funziona nel browser (window.Mvp) e in Node (test/mvp.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Mvp = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PESI = { ko: 3, setVinto: 4, presenza: 1, sopravvissuto: 1.5, ultimoRimasto: 6, matchVinto: 2 };
    const TOP = 5;                // i candidati tra cui si vota
    const VOTI = 2;               // voti a testa
    const SHOWDOWN_FINALI = 3;    // il voto si apre quando mancano al massimo tanti showdown...
    const FRAZIONE_MASSIMA = 3;   // ...ma mai più di un terzo della stagione (una stagione corta non apre il voto al primo showdown)
    const VOTA_I_PROPRI = false;  // un giocatore non può votare un suo Pokémon

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const arrotonda = x => Math.round(x * 10) / 10;
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();

    /** La stagione ha l'MVP? Solo League e Monoformat (le Random non hanno i team, le cup e la beta non fanno statistica). */
    function stagioneConMvp(info, idStagione) {
        if (idStagione === 'sbeta') return false;
        const tipo = idDi((info && info.tipo) || 'league');
        return tipo === 'league' || tipo === 'monoformat';
    }

    /** Il punteggio di un Pokémon di Statistiche.calcola(...).pokemon. */
    function punteggio(m) {
        const portato = num(m && m.portato);
        const sopravvissuti = Math.max(0, portato - num(m && m.svenuto));
        return arrotonda(PESI.ko * num(m && m.koFatti)
            + PESI.setVinto * num(m && m.setPortatoVinti)
            + PESI.presenza * portato
            + PESI.sopravvissuto * sopravvissuti
            + PESI.ultimoRimasto * num(m && m.ultimoVinto)
            + PESI.matchVinto * num(m && m.serie && m.serie.matchVinti));
    }

    /**
     * La classifica dell'MVP: i Pokémon scesi in campo, dal punteggio più alto. `max` limita l'elenco (di solito TOP).
     * Ogni voce: { posizione, chiave, player, playerNome, colore, team, formato, specie, specieId, punteggio, ko, presenze, setVinti }.
     */
    function classifica(pokemon, max = 0) {
        const voci = (pokemon || []).filter(m => m && num(m.portato) > 0).map(m => ({
            chiave: m.chiave, player: m.player, playerNome: m.playerNome || m.player, colore: m.colore || '',
            team: m.team, formato: m.formato || '', specie: m.specie, specieId: m.specieId,
            punteggio: punteggio(m), ko: num(m.koFatti), presenze: num(m.portato), setVinti: num(m.setPortatoVinti)
        })).sort((a, b) => b.punteggio - a.punteggio || b.ko - a.ko || b.presenze - a.presenze
            || String(a.specie).localeCompare(String(b.specie)) || String(a.chiave).localeCompare(String(b.chiave)));
        voci.forEach((v, i) => { v.posizione = i + 1; });
        return max > 0 ? voci.slice(0, max) : voci;
    }

    /** Quanti showdown devono mancare perché si apra il voto (almeno 1). */
    const sogliaVoto = richiesti => Math.max(1, Math.min(SHOWDOWN_FINALI, Math.floor(num(richiesti) / FRAZIONE_MASSIMA)));

    /**
     * Si può votare? `avanzamento` è avanzamentoStagione(...) di risultati-match.js, `info` le info della stagione.
     * Restituisce { aperta, chiusa, mancano, soglia, motivo }.
     */
    function finestraVoto(info, avanzamento, idStagione) {
        const stato = idDi(info && info.status);
        const richiesti = num(avanzamento && avanzamento.richiesti), giocati = num(avanzamento && avanzamento.giocati);
        const mancano = Math.max(0, richiesti - giocati);
        const base = { aperta: false, chiusa: stato === 'closed', mancano, soglia: sogliaVoto(richiesti) };
        if (!stagioneConMvp(info, idStagione)) return { ...base, motivo: 'no-mvp' };
        if (stato === 'closed') return { ...base, motivo: 'chiusa' };
        if (!richiesti) return { ...base, motivo: 'senza-calendario' };       // senza showdown per formato la stagione non ha una fine calcolabile
        if (!giocati) return { ...base, motivo: 'non-iniziata' };
        if (mancano > base.soglia) return { ...base, motivo: 'presto' };
        return { ...base, aperta: true, motivo: '' };
    }

    /** I dati di un Pokémon che si salvano nel voto (bastano a contarlo e a mostrarlo anche se la classifica cambia). */
    const candidato = v => ({ chiave: String(v.chiave || ''), player: String(v.player || ''), team: String(v.team || ''), specie: String(v.specie || ''), specieId: String(v.specieId || '') });

    /**
     * Le scelte di un giocatore sono valide? `candidati` = la classifica dei primi TOP. Restituisce { ok, scelte, errore }:
     * scelte pulite (niente doppioni, solo candidati, mai i propri se VOTA_I_PROPRI è falso, al massimo VOTI).
     */
    function controllaScelte(chiavi, candidati, votante) {
        const mappa = new Map((candidati || []).map(c => [c.chiave, c]));
        const scelte = [];
        for (const k of chiavi || []) {
            const c = mappa.get(k);
            if (!c || scelte.some(x => x.chiave === k)) continue;
            if (!VOTA_I_PROPRI && idDi(c.player) === idDi(votante)) continue;
            scelte.push(c);
        }
        if (scelte.length > VOTI) return { ok: false, scelte: scelte.slice(0, VOTI), errore: `You have ${VOTI} votes.` };
        if (!scelte.length) return { ok: false, scelte, errore: 'Pick at least one Pokémon.' };
        return { ok: true, scelte, errore: '' };
    }

    /** I vincitori MVP registrati in una stagione (seasons/{id}/mvp/risultato/vincitori), come lista. */
    function vincitoriDi(datiStagione) {
        const v = datiStagione && datiStagione.mvp && datiStagione.mvp.risultato && datiStagione.mvp.risultato.vincitori;
        return (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : [])).filter(x => x && x.chiave);
    }

    return { PESI, TOP, VOTI, SHOWDOWN_FINALI, VOTA_I_PROPRI, stagioneConMvp, punteggio, classifica, sogliaVoto, finestraVoto, candidato, controllaScelte, vincitoriDi };
});
