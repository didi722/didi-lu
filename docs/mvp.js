// =====================================================
// MVP DELLA STAGIONE — Poké-Tournament
//
// Ogni stagione (League e Monoformat: servono i Pokémon veri) elegge un MVP: UN SINGOLO Pokémon, cioè quell'individuo di quel team, non la
// specie. Come funziona:
//   1. Durante la stagione c'è una classifica dei Pokémon (classifica()): un punteggio pesato sulle loro statistiche di QUELLA stagione
//      (Statistiche.calcola(dati, { stagione }).pokemon). Si aggiorna da sola a ogni set giocato.
//   2. Quando mancano pochi showdown alla fine (finestraVoto(): gli ultimi 3, o meno nelle stagioni corte) compare in matches.html il tasto
//      per votare. Si apre un modale con i primi 5; ogni giocatore della stagione ha 2 voti, su Pokémon diversi e non suoi.
//      La top 5 è CONGELATA al momento in cui si apre il voto (showdownAllApertura): i set giocati dopo non la cambiano, per tutti i votanti.
//   3. Il voto resta aperto anche per 24 ore DOPO la chiusura della stagione (info.chiusaIl): chi aveva già finito i suoi showdown mentre gli
//      altri giocavano non perde il voto se la stagione si chiude in una sera.
//   4. Passate le 24 ore i voti si contano (spoglio()): vince il Pokémon con più voti; a parità, quello che era più avanti nella classifica
//      dell'MVP congelata da cui si è scelta la top 5 (stesse statistiche mostrate a chi ha votato). Nessun voto = nessun MVP.
//      Il conteggio lo scrive la prima pagina del sito che lo trova scaduto (mvp-voto.js) in seasons/{id}/mvp/risultato; il titolo conta nelle
//      statistiche (Statistiche: mvpVinti) e dà il fiocco "Season MVP" al Pokémon (fiocchi.js).
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
    const ORE_DOPO_CHIUSURA = 24; // il voto resta aperto ancora per tante ore dopo la chiusura della stagione

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
     * Ogni voce: { posizione, chiave, player, playerNome, colore, team, formato, specie, specieId, punteggio, ko, koPerSet, presenze, setVinti, setPersi,
     * sopravvissuti, ultimoVinto, matchVinti, matchPortato }.
     */
    function classifica(pokemon, max = 0) {
        const voci = (pokemon || []).filter(m => m && num(m.portato) > 0).map(m => ({
            chiave: m.chiave, player: m.player, playerNome: m.playerNome || m.player, colore: m.colore || '',
            team: m.team, formato: m.formato || '', specie: m.specie, specieId: m.specieId,
            punteggio: punteggio(m), ko: num(m.koFatti), presenze: num(m.portato), setVinti: num(m.setPortatoVinti),
            // i numeri che dicono perché votarlo (la scheda del voto ne mostra i più importanti)
            setPersi: num(m.setPortatoPersi), koPerSet: num(m.portato) ? arrotonda(num(m.koFatti) / num(m.portato)) : 0,
            sopravvissuti: Math.max(0, num(m.portato) - num(m.svenuto)), ultimoVinto: num(m.ultimoVinto), matchVinti: num(m.serie && m.serie.matchVinti),
            matchPortato: num(m.serie && m.serie.matchPortato)
        })).sort((a, b) => b.punteggio - a.punteggio || b.ko - a.ko || b.presenze - a.presenze
            || String(a.specie).localeCompare(String(b.specie)) || String(a.chiave).localeCompare(String(b.chiave)));
        voci.forEach((v, i) => { v.posizione = i + 1; });
        return max > 0 ? voci.slice(0, max) : voci;
    }

    // Le statistiche che la scheda del voto mette in evidenza, nell'ordine: id, etichetta, valore da confrontare (più alto = meglio), come si scrive
    const STAT_VOTO = [
        { id: 'ko', et: 'KOs', val: v => v.ko, testo: v => String(v.ko), sub: v => `${v.koPerSet} per set` },
        { id: 'set', et: 'Sets won', val: v => v.setVinti, testo: v => `${v.setVinti}/${v.presenze}`, sub: v => (v.presenze ? `${Math.round(100 * v.setVinti / v.presenze)}% won` : '') },
        { id: 'vivo', et: 'Survived', val: v => (v.presenze ? v.sopravvissuti / v.presenze : 0), testo: v => `${v.sopravvissuti}/${v.presenze}`, sub: v => (v.presenze ? `${Math.round(100 * v.sopravvissuti / v.presenze)}% of sets` : '') },
        { id: 'ultimo', et: 'Last standing', val: v => v.ultimoVinto, testo: v => String(v.ultimoVinto), sub: () => 'sets won alone' },
        { id: 'match', et: 'Matches won', val: v => v.matchVinti, testo: v => `${v.matchVinti}/${v.matchPortato}`, sub: () => 'when brought' }
    ];

    /**
     * Le statistiche in evidenza di ogni candidato, con chi è il migliore di ognuna (ex aequo compresi; nessuno se tutti hanno lo stesso valore o zero),
     * così a colpo d'occhio si vede chi vince dove. Restituisce, per ogni candidato (nello stesso ordine), [{ id, et, testo, sub, migliore }].
     */
    function statVoto(candidati) {
        const migliori = Object.fromEntries(STAT_VOTO.map(s => [s.id, Math.max(0, ...candidati.map(s.val))]));
        // si evidenzia solo chi sta davanti a qualcuno: se tutti hanno lo stesso valore (o zero) nessuno è "il migliore"
        const distingue = Object.fromEntries(STAT_VOTO.map(s => [s.id, migliori[s.id] > 0 && candidati.some(v => s.val(v) < migliori[s.id])]));
        return candidati.map(v => STAT_VOTO.map(s => ({ id: s.id, et: s.et, testo: s.testo(v), sub: s.sub(v), migliore: distingue[s.id] && s.val(v) === migliori[s.id] })));
    }

    /** Quanti showdown devono mancare perché si apra il voto (almeno 1). */
    const sogliaVoto = richiesti => Math.max(1, Math.min(SHOWDOWN_FINALI, Math.floor(num(richiesti) / FRAZIONE_MASSIMA)));

    // Quando si è concluso uno showdown: il giorno e poi l'ultimo match salvato (come ordine-showdown.js, qui in ordine cronologico)
    const giornoDi = d => {
        const t = String(d == null ? '' : d).trim();
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(t);
        return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
    };
    const orarioDi = t => { const n = Date.parse(t); return Number.isFinite(n) ? n : 0; };
    const ultimoMatch = sd => {
        const info = (sd && sd.info) || {};
        const salvati = Object.values((sd && sd.matches) || {}).map(m => orarioDi(m && m.lastEdit));
        return Math.max(0, ...salvati) || Math.max(orarioDi(info.ultimoAggiornamento), orarioDi(info.lastUpdate), orarioDi(info.timestamp));
    };

    /**
     * Gli showdown della stagione com'erano nel momento in cui si è aperto il voto: la top 5 si CONGELA lì, anche se mancano ancora 3 showdown, così
     * per tutti (e per lo spareggio) è la stessa. Non si salva nulla: è sempre lo stesso risultato dai dati, perché si rigiocano gli showdown in
     * ordine cronologico finché ne mancano pochi alla fine. `avanzamento` è avanzamentoStagione di risultati-match.js.
     * Restituisce { showdowns: { id: showdown }, ultimo: id dello showdown che ha aperto il voto } o null se il voto non si apre mai.
     */
    function showdownAllApertura(info, iscritti, showdowns, teamsIscritti, avanzamento) {
        const totale = avanzamento(info, iscritti, showdowns, teamsIscritti);
        const richiesti = num(totale && totale.richiesti);
        if (!richiesti) return null;
        const soglia = sogliaVoto(richiesti);
        const ids = Object.keys(showdowns || {}).filter(id => showdowns[id])
            .map(id => ({ id, giorno: giornoDi((showdowns[id].info || {}).data), mossa: ultimoMatch(showdowns[id]) }))
            .sort((a, b) => a.giorno.localeCompare(b.giorno) || a.mossa - b.mossa || a.id.localeCompare(b.id)).map(x => x.id);
        const finora = {};
        for (const id of ids) {
            finora[id] = showdowns[id];
            const a = avanzamento(info, iscritti, finora, teamsIscritti);
            if (num(a.giocati) > 0 && richiesti - num(a.giocati) <= soglia) return { showdowns: { ...finora }, ultimo: id };
        }
        return null;
    }

    /** Il momento (ms) in cui si chiude la stagione, se è chiusa e lo sappiamo (info.chiusaIl lo scrivono la chiusura automatica e l'amministratore). */
    function chiusuraDi(info) {
        const t = Date.parse(info && info.chiusaIl);
        return Number.isFinite(t) ? t : null;
    }

    /**
     * Si può votare? `avanzamento` è avanzamentoStagione(...) di risultati-match.js, `info` le info della stagione.
     * Restituisce { aperta, fase, chiusa, scaduta, scade, mancano, soglia, motivo }:
     *   fase 'durante' (mancano pochi showdown) o 'dopo' (stagione chiusa da meno di 24 ore; `scade` è il momento in cui finisce, in ms);
     *   scaduta: la stagione è chiusa e le 24 ore sono passate (è ora di contare i voti).
     */
    function finestraVoto(info, avanzamento, idStagione, adesso = Date.now()) {
        const stato = idDi(info && info.status);
        const richiesti = num(avanzamento && avanzamento.richiesti), giocati = num(avanzamento && avanzamento.giocati);
        const mancano = Math.max(0, richiesti - giocati);
        const base = { aperta: false, fase: '', chiusa: stato === 'closed', scaduta: false, scade: null, mancano, soglia: sogliaVoto(richiesti) };
        if (!stagioneConMvp(info, idStagione)) return { ...base, motivo: 'no-mvp' };
        if (stato === 'closed') {
            const chiusura = chiusuraDi(info);
            if (chiusura == null) return { ...base, motivo: 'chiusa' };        // chiusa senza data (a mano, in passato): niente tempo supplementare
            const scade = chiusura + ORE_DOPO_CHIUSURA * 3600000;
            if (adesso < scade) return { ...base, aperta: true, fase: 'dopo', scade, motivo: '' };
            return { ...base, scaduta: true, scade, motivo: 'chiusa' };
        }
        if (!richiesti) return { ...base, motivo: 'senza-calendario' };       // senza showdown per formato la stagione non ha una fine calcolabile
        if (!giocati) return { ...base, motivo: 'non-iniziata' };
        if (mancano > base.soglia) return { ...base, motivo: 'presto' };
        return { ...base, aperta: true, fase: 'durante', motivo: '' };
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

    /**
     * Il conteggio dei voti. `voti` è seasons/{id}/mvp/voti, `iscritti` i giocatori della stagione (nomi o chiavi),
     * `ranking` la classifica dell'MVP congelata all'apertura del voto (classifica(), tutti i Pokémon).
     * Contano solo i voti degli iscritti, mai per un proprio Pokémon (se VOTA_I_PROPRI è falso), un Pokémon una volta sola per votante e al
     * massimo VOTI voti a testa. Vince chi ha più voti; a parità, chi è più avanti in `ranking` (chi non c'è sta dietro a tutti).
     * Restituisce { vincitori: [uno o nessuno], classifica: [{ chiave, player, team, specie, specieId, voti, posizione, punteggio }], votanti, spareggio }
     * dove `spareggio` dice che c'era una parità sui voti decisa dalla classifica (`pari`: i Pokémon a pari voti).
     */
    function spoglio(voti, iscritti, ranking) {
        const ammessi = new Set((Array.isArray(iscritti) ? iscritti : Object.keys(iscritti || {})).map(idDi).filter(Boolean));
        const posizioni = new Map((ranking || []).map((v, i) => [v.chiave, { posizione: v.posizione || i + 1, punteggio: num(v.punteggio) }]));
        const per = new Map();
        let votanti = 0;
        for (const [votante, voto] of Object.entries(voti || {})) {
            const id = idDi(votante);
            if (!ammessi.has(id) || !voto) continue;
            const visti = new Set();
            let validi = 0;
            const scelte = Array.isArray(voto.scelte) ? voto.scelte : Object.values(voto.scelte || {});
            for (const c of scelte) {
                if (validi >= VOTI) break;
                if (!c || !c.chiave || visti.has(c.chiave) || (!VOTA_I_PROPRI && idDi(c.player) === id)) continue;
                visti.add(c.chiave);
                validi++;
                const r = posizioni.get(c.chiave);
                const voce = per.get(c.chiave) || { chiave: String(c.chiave), player: String(c.player || ''), team: String(c.team || ''), specie: String(c.specie || ''),
                    specieId: String(c.specieId || ''), voti: 0, posizione: r ? r.posizione : 0, punteggio: r ? r.punteggio : 0 };
                voce.voti++;
                per.set(c.chiave, voce);
            }
            if (validi) votanti++;
        }
        // più voti prima; a parità la classifica dell'MVP (chi non ci sta in fondo), poi il nome per non lasciare nulla al caso
        const davanti = v => (v.posizione > 0 ? v.posizione : Infinity);
        const classificaVoti = [...per.values()].sort((a, b) => b.voti - a.voti || davanti(a) - davanti(b) || a.specie.localeCompare(b.specie) || a.chiave.localeCompare(b.chiave));
        const massimo = classificaVoti.length ? classificaVoti[0].voti : 0;
        const pari = classificaVoti.filter(v => v.voti === massimo && massimo > 0);
        return { vincitori: pari.length ? [pari[0]] : [], classifica: classificaVoti, votanti, spareggio: pari.length > 1, pari: pari.length > 1 ? pari.map(v => v.chiave) : [] };
    }

    /** Si può contare adesso? La stagione è chiusa da più di 24 ore, ci sono voti e il risultato non c'è ancora. */
    const daContare = (finestra, mvp) => !!(finestra && finestra.scaduta && mvp && mvp.voti && !mvp.risultato);

    /** I vincitori MVP registrati in una stagione (seasons/{id}/mvp/risultato/vincitori), come lista. */
    function vincitoriDi(datiStagione) {
        const v = datiStagione && datiStagione.mvp && datiStagione.mvp.risultato && datiStagione.mvp.risultato.vincitori;
        return (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : [])).filter(x => x && x.chiave);
    }

    return { PESI, TOP, VOTI, SHOWDOWN_FINALI, VOTA_I_PROPRI, ORE_DOPO_CHIUSURA, stagioneConMvp, punteggio, classifica, sogliaVoto, chiusuraDi, finestraVoto, showdownAllApertura, STAT_VOTO, statVoto, candidato, controllaScelte, spoglio, daContare, vincitoriDi };
});
