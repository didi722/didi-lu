// =====================================================
// TIPI DI STAGIONE — Poké-Tournament
//
// Ogni stagione (seasons/{id}/info) ha un `tipo`:
//   league       la Sant'Alvise League: il campionato lungo, "la serie A"
//   monoformat   le stagioni brevi con un solo formato fisso, "la coppa Italia"
//   random       le stagioni giocate nel formato Random
//   cup          le cup: una serata, 1 showdown contro ciascun giocatore, un solo formato, legate a un evento (Christmas Cup...)
// Le stagioni senza `tipo` (le prime) sono league; la stagione di prova "sbeta" è la beta.
//
// FANNO STATISTICA (allenatore, e per league/monoformat anche team, Pokémon, titoli, badge, Elo, serie): league, monoformat, random.
// NON la fanno: le cup (come le partite amichevoli, ma danno un trofeo) e la beta.
// Il formato Random non fa statistica per team e Pokémon, ma solo per l'allenatore: lo decide il match (senza nomi di team), non il tipo.
// Dare un trofeo: tutte le stagioni e le cup, non la beta.
//
// I NOMI. league: "Sant'Alvise I", "Sant'Alvise II"...; random: "Friuli DOC I"...; monoformat: "Martiri di Marzabotto Memorial I"...
// (numero progressivo in numeri romani, per tipo). Le cup hanno il nome che dà l'amministratore.
//
// I TROFEI si ricavano dalle info delle stagioni chiuse (winner, status, endDate/chiusaIl): niente contatori da tenere allineati.
//
//   TipoStagione.tipoDi(info, id)               'league' | 'monoformat' | 'random' | 'cup' | 'beta'
//   TipoStagione.faStatistica(info, id)         true per league, monoformat, random
//   TipoStagione.daTrofeo(info, id)             true per league, monoformat, random, cup
//   TipoStagione.nomeProgressivo(tipo, stagioni)  il nome della prossima stagione di quel tipo (league/random/monoformat)
//   TipoStagione.regoleDi(tipo)                 cosa fissa quel tipo nella creazione (nome automatico, n. formati, showdown, formato Random)
//   TipoStagione.squadreMax(showdown)           squadre iscrivibili al massimo per quel numero di showdown per formato
//   TipoStagione.estraiFormati(formati, n)      l'estrazione casuale dei formati di una League (tipi diversi)
//   TipoStagione.romano(n)
//   TipoStagione.trofei(stagioni, giocatore)    [{ stagione, tipo, nome, data, icona }] del giocatore, i più recenti per primi
//   TipoStagione.raggruppa(trofei)              per tipo: [{ tipo, etichetta, icona, conteggio, vittorie: [...] }]
//   TipoStagione.palmares(stagioni)             tutte le stagioni e le cup chiuse (con il vincitore), le più recenti per prime
//   TipoStagione.leggiInfo(db)                  { id: info } di tutte le stagioni (una lettura per stagione, solo le info)
//
// Funziona nel browser (window.TipoStagione) e in Node (test/tipo-stagione.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.TipoStagione = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const BETA = 'sbeta';
    const TIPI = {
        league:     { id: 'league',     etichetta: "Sant'Alvise League",              base: "Sant'Alvise",                       icona: 'immagini/season-winner.png',   statistica: true,  trofeo: true, segnaposto: null },
        monoformat: { id: 'monoformat', etichetta: 'Martiri di Marzabotto Memorial',  base: 'Martiri di Marzabotto Memorial',    icona: 'immagini/coppa-monoformat.png', statistica: true,  trofeo: true, segnaposto: '#f4b942' },
        random:     { id: 'random',     etichetta: 'Friuli DOC',                      base: 'Friuli DOC',                        icona: 'immagini/coppa-random.png',     statistica: true,  trofeo: true, segnaposto: '#4cc9a4' },
        cup:        { id: 'cup',        etichetta: 'Cup',                             base: '',                                  icona: 'immagini/coppa-cup.png',        statistica: false, trofeo: true, segnaposto: '#e8685a' }
    };
    // La coppa della league è l'immagine di sempre (colorata con il colore dell'allenatore). Le altre sono PNG da caricare
    // (immagini/coppa-<tipo>.png, anche l'icona scelta per una cup): finché mancano, al loro posto c'è la coppa della league nel colore `segnaposto`.
    const ORDINE = ['league', 'monoformat', 'random', 'cup'];

    // Cosa fissa ogni tipo nella creazione di una stagione (admin.html):
    //   nomeAutomatico  il nome è base + numero romano progressivo (le cup lo scrive l'admin)
    //   formati         numero di formati fisso (null = lo sceglie l'admin)
    //   showdowns       showdown per formato fissi (null = li sceglie l'admin)
    //   formatoRandom   true = solo formati Random; false = niente formati Random; null = qualunque (le cup)
//   formatoFisso    il formato è quello Random, scelto in automatico e non modificabile (Friuli DOC)
    const REGOLE = {
        league:     { nomeAutomatico: true,  formati: null, showdowns: null, formatoRandom: false },
        monoformat: { nomeAutomatico: true,  formati: 1,    showdowns: null, formatoRandom: false },
        random:     { nomeAutomatico: true,  formati: 1,    showdowns: null, formatoRandom: true, formatoFisso: true },
        cup:        { nomeAutomatico: false, formati: 1,    showdowns: 1,    formatoRandom: null }
    };
    const regoleDi = tipo => REGOLE[TIPI_VALIDI(tipo)] || REGOLE.league;

    /** Squadre iscrivibili al massimo per ogni numero di showdown per formato (tabella del regolamento): 1→2, 2→3, 3→4, 4→6, 5 o più→7. */
    function squadreMax(showdown) {
        const n = Math.floor(Number(showdown) || 0);
        if (n < 1) return 0;
        return ({ 1: 2, 2: 3, 3: 4, 4: 6 })[n] || 7;
    }

    const STRUTTURE = ['anything_goes', 'custom', 'vgc'];
    /**
     * Estrae n formati da [{ nome, struttura }] per una Sant'Alvise League: da 3 in su almeno uno Anything Goose, uno Custom e uno VGC;
     * con 2 due formati di struttura diversa; con 1 uno qualsiasi. I Random non si estraggono mai. `caso` è un Math.random sostituibile nei test.
     */
    function estraiFormati(formati, n, caso = Math.random) {
        const mischia = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(caso() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
        const pool = mischia((formati || []).filter(f => f && f.nome && f.struttura !== 'random'));
        const scelti = [];
        const prendi = f => { if (f && !scelti.includes(f)) scelti.push(f); };
        const dellaStruttura = st => pool.find(f => f.struttura === st && !scelti.includes(f));
        n = Math.max(0, Math.floor(Number(n) || 0));
        if (n >= 3) STRUTTURE.forEach(st => prendi(dellaStruttura(st)));
        else if (n === 2) {
            const disponibili = mischia(STRUTTURE.filter(st => dellaStruttura(st)));
            disponibili.slice(0, 2).forEach(st => prendi(dellaStruttura(st)));
        }
        for (const f of pool) { if (scelti.length >= n) break; prendi(f); }
        return scelti.slice(0, n).map(f => f.nome);
    }

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const TIPI_VALIDI = t => (TIPI[idDi(t)] ? idDi(t) : 'league');
    const oggetto = x => (x && typeof x === 'object' ? x : {});

    function tipoDi(info, id) {
        if (idDi(id) === BETA) return 'beta';
        const t = idDi(oggetto(info).tipo);
        return TIPI[t] ? t : 'league';
    }
    const faStatistica = (info, id) => !!(TIPI[tipoDi(info, id)] && TIPI[tipoDi(info, id)].statistica);
    const daTrofeo = (info, id) => !!(TIPI[tipoDi(info, id)] && TIPI[tipoDi(info, id)].trofeo);

    // ---------- numeri romani ----------
    function romano(n) {
        n = Math.max(1, Math.floor(Number(n) || 1));
        const tabella = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
        let out = '';
        for (const [v, s] of tabella) while (n >= v) { out += s; n -= v; }
        return out;
    }

    /** Il nome della prossima stagione di quel tipo: base + numero romano (quante ce ne sono già di quel tipo + 1). Per le cup nessun nome automatico. */
    function nomeProgressivo(tipo, stagioni) {
        const t = TIPI[tipo];
        if (!t || tipo === 'cup') return '';
        const gia = Object.entries(oggetto(stagioni)).filter(([id, s]) => tipoDi(oggetto(s).info || s, id) === tipo).length;
        return `${t.base} ${romano(gia + 1)}`;
    }

    // ---------- trofei ----------
    const infoDi = s => oggetto(oggetto(s).info || s);
    const chiusa = info => idDi(info.status) === 'closed';

    // Quando è stata vinta: la fine dell'ultimo showdown, o la chiusura, o l'ultimo aggiornamento
    function dataVittoria(info) {
        for (const c of [info.endDate, info.chiusaIl, info.updated_at, info.created_at]) {
            const grezza = String(c == null ? '' : c).trim();
            if (!grezza) continue;
            // GG/MM/AAAA (come le date degli showdown): Date.parse leggerebbe mese e giorno al contrario
            const it = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(grezza);
            if (it) return `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`;
            const t = Date.parse(grezza);
            if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
        }
        return '';
    }

    function voce(id, info) {
        const tipo = tipoDi(info, id);
        const t = TIPI[tipo];
        return {
            stagione: id, tipo, nome: info.name || id, data: dataVittoria(info),
            icona: (tipo === 'cup' && info.icona) ? String(info.icona) : (t ? t.icona : ''), vincitore: String(info.winner || '')
        };
    }
    const piuRecenti = (a, b) => String(b.data).localeCompare(String(a.data)) || String(b.stagione).localeCompare(String(a.stagione), undefined, { numeric: true });

    function trofei(stagioni, giocatore) {
        const io = idDi(giocatore);
        const out = [];
        for (const [id, s] of Object.entries(oggetto(stagioni))) {
            const info = infoDi(s);
            if (!daTrofeo(info, id) || !chiusa(info) || idDi(info.winner) !== io || !io) continue;
            out.push(voce(id, info));
        }
        return out.sort(piuRecenti);
    }

    function raggruppa(lista) {
        const per = {};
        for (const t of (lista || [])) (per[t.tipo] ||= []).push(t);
        return ORDINE.filter(tipo => per[tipo]).map(tipo => ({
            tipo, etichetta: TIPI[tipo].etichetta, icona: per[tipo][0].icona || TIPI[tipo].icona, conteggio: per[tipo].length, vittorie: per[tipo]
        }));
    }

    function palmares(stagioni) {
        const out = [];
        for (const [id, s] of Object.entries(oggetto(stagioni))) {
            const info = infoDi(s);
            if (!daTrofeo(info, id) || !chiusa(info)) continue;
            out.push(voce(id, info));
        }
        return out.sort(piuRecenti);
    }

    // ---------- lettura ----------
    // Le info di ogni stagione, una lettura ciascuna (le stagioni intere pesano: showdown e match): sbeta, s0, s1, … e settings/currentSeason
    async function leggiInfo(db) {
        const leggi = p => db.ref(p).once('value').then(s => s.val()).catch(() => null);
        const trovate = {};
        const aggiungi = (id, info) => { if (info) trovate[id] = info; };
        aggiungi(BETA, await leggi(`seasons/${BETA}/info`));
        for (let da = 0; da < 500; da += 10) {
            const blocco = await Promise.all(Array.from({ length: 10 }, (_, i) => leggi(`seasons/s${da + i}/info`)));
            blocco.forEach((info, i) => aggiungi(`s${da + i}`, info));
            if (!blocco[blocco.length - 1]) break;
        }
        const corrente = await leggi('settings/currentSeason');
        if (corrente && !trovate[corrente]) aggiungi(corrente, await leggi(`seasons/${corrente}/info`));
        return trovate;
    }

    return { BETA, TIPI, ORDINE, REGOLE, regoleDi, squadreMax, estraiFormati, tipoDi, faStatistica, daTrofeo, romano, nomeProgressivo, dataVittoria, trofei, raggruppa, palmares, leggiInfo };
});
