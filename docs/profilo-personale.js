// =====================================================
// PROFILO PERSONALE — Poké-Tournament
//
// I due calcoli che stanno dietro a profile.html, senza nessun riferimento al DOM né a Firebase:
//   - rivali():  il bilancio contro ogni avversario (match, set, showdown, ultimi risultati)
//   - daFare():  cosa c'è da fare adesso (sfide in attesa, showdown in corso, showdown ancora da giocare
//                contro ciascun avversario formato per formato, iscrizioni aperte)
//
// Dati in ingresso (li legge profile.html da Firebase):
//   stagioni = { sbeta: { info, iscritti, teams_iscritti, showdowns }, s1: { … } }
//   sfide    = { sbeta: { idSfida: { da, daId, a, aId, categoria, bestOf, stato, creata } }, … }
// Un showdown è una serie di 3 match; ogni match ha p1score / p2score (set vinti) e winnerId.
// Le regole sono le stesse di sfide.js: "showdown ancora da giocare" = showdowns_per_format meno quelli
// già fatti (in qualsiasi stato) e le sfide in attesa, per ogni coppia di giocatori e ogni formato.
//
// Funziona nel browser (window.ProfiloPersonale) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.ProfiloPersonale = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MATCH_PER_SHOWDOWN = 3;
    const FORMA_MAX = 5;         // quanti risultati recenti mostrare su ogni rivale
    const MIN_MATCH_RIVALE = 2;  // sotto questa soglia nessuno è "nemesi" o "preda"

    const idDi = n => String(n == null ? '' : n).toLowerCase().trim();
    const oggetti = x => (x && typeof x === 'object' ? x : {});
    const valori = x => Object.values(oggetti(x));

    // ---------- showdown e match (stesse regole di sfide.js) ----------
    const matchValido = m => !!m && m.p1score != null && m.p2score != null;
    const matchSalvati = sd => valori(sd && sd.matches).filter(matchValido).length;
    const completato = sd => !!sd && ((sd.info && sd.info.isCompleted === true) || matchSalvati(sd) >= MATCH_PER_SHOWDOWN);

    function prossimoMatch(sd) {
        for (let n = 1; n <= MATCH_PER_SHOWDOWN; n++) {
            if (!matchValido(oggetti(sd && sd.matches)['match' + n])) return n;
        }
        return MATCH_PER_SHOWDOWN;
    }

    const coppia = (x, y, a, b) => {
        [x, y, a, b] = [x, y, a, b].map(idDi);
        return (x === a && y === b) || (x === b && y === a);
    };

    const giocatoriShowdown = sd => {
        const i = oggetti(sd && sd.info);
        return [idDi(i.player1Id || i.player1), idDi(i.player2Id || i.player2)];
    };

    // Chi ha vinto il match ('' se non è finito o è pari). winnerId vale più dei punteggi.
    function vincitoreMatch(m, sd) {
        if (!matchValido(m)) return '';
        if (m.winnerId) return idDi(m.winnerId);
        const a = Number(m.p1score), b = Number(m.p2score);
        const [p1, p2] = giocatoriShowdown(sd);
        if (a > b) return idDi(m.player1Id || m.player1) || p1;
        if (b > a) return idDi(m.player2Id || m.player2) || p2;
        return '';
    }

    // Chi ha vinto la serie: chi ha vinto più match; a parità vale il campo salvato dal sito.
    function vincitoreShowdown(sd) {
        const [p1, p2] = giocatoriShowdown(sd);
        let v1 = 0, v2 = 0;
        for (const m of valori(sd && sd.matches)) {
            const v = vincitoreMatch(m, sd);
            if (v && v === p1) v1++;
            else if (v && v === p2) v2++;
        }
        if (v1 !== v2) return v1 > v2 ? p1 : p2;
        const salvato = idDi(sd && sd.info && sd.info.vincitoreShowdown);
        return salvato === p1 || salvato === p2 ? salvato : '';
    }

    const stato = info => String((info && info.status) || 'OPEN').toUpperCase().trim();
    const formatiStagione = info => {
        const f = oggetti(info).selected_formats;
        return (Array.isArray(f) ? f : valori(f)).filter(Boolean);
    };
    const nomiIscritti = iscritti => (Array.isArray(iscritti) ? iscritti : Object.keys(oggetti(iscritti)));
    const perFormato = info => parseInt(oggetti(info).showdowns_per_format, 10) || 0;

    // Millisecondi di un campo data (ISO, "2026-10-02", timestamp); 0 se manca
    const tempoDi = v => {
        if (typeof v === 'number') return v;
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : 0;
    };


    // =================================================
    // RIVALI
    // =================================================
    function nuovoRivale(id, nome) {
        return {
            id, nome: nome || id,
            matchV: 0, matchP: 0, setV: 0, setP: 0,
            sdV: 0, sdP: 0, sdInCorso: 0,
            ultimo: 0, forma: [],
            formati: {},
            stagioni: []
        };
    }

    // Bilancio di `io` contro ogni avversario con cui ha almeno uno showdown, in tutte le stagioni date.
    // Ordinato: più match giocati per primi, poi per nome.
    function rivali(io, stagioni) {
        io = idDi(io);
        const per = new Map();
        const risultatiRecenti = new Map();   // id → [{ t, vinto }]

        for (const [idStagione, S] of Object.entries(oggetti(stagioni))) {
            for (const sd of valori(oggetti(S).showdowns)) {
                if (!sd || !sd.info) continue;
                const [p1, p2] = giocatoriShowdown(sd);
                if (!p1 || !p2 || (io !== p1 && io !== p2)) continue;
                const avv = io === p1 ? p2 : p1;
                if (!avv || avv === io) continue;

                const r = per.get(avv) || nuovoRivale(avv, io === p1 ? sd.info.player2 : sd.info.player1);
                per.set(avv, r);
                if (!r.stagioni.includes(idStagione)) r.stagioni.push(idStagione);

                const formato = sd.info.categoria || '';
                const f = r.formati[formato] || (r.formati[formato] = { matchV: 0, matchP: 0, sdV: 0, sdP: 0 });

                for (const m of valori(sd.matches)) {
                    const v = vincitoreMatch(m, sd);
                    if (!v) continue;
                    const mioP1 = (idDi(m.player1Id || m.player1) || p1) === io;
                    const miei = Number(mioP1 ? m.p1score : m.p2score) || 0;
                    const suoi = Number(mioP1 ? m.p2score : m.p1score) || 0;
                    const vinto = v === io;
                    r.setV += miei; r.setP += suoi;
                    if (vinto) { r.matchV++; f.matchV++; } else { r.matchP++; f.matchP++; }

                    const t = tempoDi(m.lastEdit) || tempoDi(m.data) || tempoDi(sd.info.lastUpdate) || tempoDi(sd.info.timestamp) || tempoDi(sd.info.data);
                    r.ultimo = Math.max(r.ultimo, t);
                    if (!risultatiRecenti.has(avv)) risultatiRecenti.set(avv, []);
                    risultatiRecenti.get(avv).push({ t, vinto });
                }

                if (completato(sd)) {
                    const v = vincitoreShowdown(sd);
                    if (v === io) { r.sdV++; f.sdV++; }
                    else if (v === avv) { r.sdP++; f.sdP++; }
                } else {
                    r.sdInCorso++;
                }
            }
        }

        for (const [id, r] of per) {
            r.forma = (risultatiRecenti.get(id) || [])
                .sort((a, b) => a.t - b.t)
                .slice(-FORMA_MAX)
                .map(x => (x.vinto ? 'V' : 'P'));
            r.stagioni.sort();
        }

        return [...per.values()].sort((a, b) =>
            (b.matchV + b.matchP) - (a.matchV + a.matchP) || a.nome.localeCompare(b.nome));
    }

    const giocati = r => r.matchV + r.matchP;
    const percentuale = r => (giocati(r) ? r.matchV / giocati(r) : 0);

    // Totali e rivali che raccontano qualcosa: il più affrontato, la nemesi (chi ti batte più spesso),
    // la preda (chi batti più spesso). Nemesi e preda servono almeno MIN_MATCH_RIVALE match e un bilancio
    // davvero in pareggio non fa né l'una né l'altra.
    function riepilogoRivali(elenco) {
        const lista = Array.isArray(elenco) ? elenco : [];
        const totali = { matchV: 0, matchP: 0, setV: 0, setP: 0, sdV: 0, sdP: 0, sdInCorso: 0, avversari: lista.length };
        for (const r of lista) for (const k of Object.keys(totali)) if (k in r) totali[k] += r[k];

        const abbastanza = lista.filter(r => giocati(r) >= MIN_MATCH_RIVALE);
        const migliore = (candidati, confronta) => candidati.sort(confronta)[0] || null;
        const piuGiocato = migliore(lista.filter(r => giocati(r) > 0).slice(), (a, b) => giocati(b) - giocati(a) || a.nome.localeCompare(b.nome));
        const nemesi = migliore(abbastanza.filter(r => r.matchP > r.matchV),
            (a, b) => percentuale(a) - percentuale(b) || giocati(b) - giocati(a) || a.nome.localeCompare(b.nome));
        const preda = migliore(abbastanza.filter(r => r.matchV > r.matchP),
            (a, b) => percentuale(b) - percentuale(a) || giocati(b) - giocati(a) || a.nome.localeCompare(b.nome));
        return { totali, piuGiocato, nemesi, preda };
    }


    // =================================================
    // COSA DEVO FARE
    // =================================================
    const sfideDiStagione = (sfide, id) => Object.entries(oggetti(oggetti(sfide)[id]));

    // Quanti showdown si possono ancora lanciare contro `avv` in un formato (come rimasti() di sfide.js)
    function showdownRimasti(info, showdowns, sfideStagione, io, avv, formato) {
        const massimo = perFormato(info);
        if (!massimo) return Infinity;
        const fatti = valori(showdowns).filter(sd => {
            const i = oggetti(sd && sd.info);
            return coppia(i.player1Id || i.player1, i.player2Id || i.player2, io, avv) && i.categoria === formato;
        }).length;
        const inAttesa = sfideStagione.filter(([, s]) => s && s.stato === 'in_attesa'
            && coppia(s.daId, s.aId, io, avv) && s.categoria === formato).length;
        return Math.max(0, massimo - fatti - inAttesa);
    }

    // "3d 4h", "5h 12m", "9m": il tempo che manca a una scadenza; '' se non c'è, null se è già passata
    function tempoRimasto(scadenza, adesso) {
        const t = tempoDi(scadenza);
        if (!t) return '';
        const ms = t - (adesso == null ? Date.now() : adesso);
        if (ms <= 0) return null;
        const min = Math.floor(ms / 60000);
        const g = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
        if (g) return h ? `${g}d ${h}h` : `${g}d`;
        if (h) return m ? `${h}h ${m}m` : `${h}h`;
        return `${Math.max(1, m)}m`;
    }

    // -> { stagioni: [{ id, nome, stato, iscritto, scadenza, richiesti, giocati, inCorso }],
    //      iscrizioni: [{ tipo: 'iscriviti' | 'squadre', stagione, nome, scadenza, formati? }],
    //      sfideRicevute, sfideInviate: [{ stagione, id, avversario, categoria, bestOf, creata }],
    //      inCorso: [{ stagione, id, avversario, categoria, match, mioPunteggio, aggiornato }],
    //      mancanti: [{ stagione, nomeStagione, avversario, nome, totale, formati: [{ formato, rimasti, occupato }] }] }
    // Le stagioni chiuse non entrano.
    function daFare(io, stagioni, sfide) {
        io = idDi(io);
        const fuori = { stagioni: [], iscrizioni: [], sfideRicevute: [], sfideInviate: [], inCorso: [], mancanti: [] };
        if (!io) return fuori;

        for (const [id, S] of Object.entries(oggetti(stagioni))) {
            const info = oggetti(S && S.info);
            const st = stato(info);
            if (st === 'CLOSED') continue;

            const nomeStagione = info.name || id;
            const iscritti = nomiIscritti(S && S.iscritti);
            const iscritto = iscritti.some(n => idDi(n) === io);
            const formati = formatiStagione(info);
            const showdowns = oggetti(S && S.showdowns);
            const mie = Object.entries(showdowns).filter(([, sd]) => giocatoriShowdown(sd).includes(io));
            const sfideStagione = sfideDiStagione(sfide, id);
            const massimo = perFormato(info);

            const scheda = {
                id, nome: nomeStagione, stato: st, iscritto,
                scadenza: info.deadline || '',
                richiesti: massimo ? Math.max(0, iscritti.length - 1) * formati.length * massimo : 0,
                giocati: mie.filter(([, sd]) => completato(sd)).length,
                inCorso: mie.filter(([, sd]) => !completato(sd)).length
            };
            fuori.stagioni.push(scheda);

            // ---- iscrizioni: stagione aperta ----
            if (st === 'OPEN') {
                if (!iscritto) {
                    fuori.iscrizioni.push({ tipo: 'iscriviti', stagione: id, nome: nomeStagione, scadenza: scheda.scadenza });
                } else {
                    const teams = oggetti(S.teams_iscritti);
                    const senza = formati.filter(f => !(oggetti(oggetti(teams[f])[io]).count > 0));
                    if (senza.length) {
                        fuori.iscrizioni.push({ tipo: 'squadre', stagione: id, nome: nomeStagione, scadenza: scheda.scadenza, formati: senza });
                    }
                }
            }
            if (!iscritto) continue;

            // ---- sfide in attesa ----
            for (const [idSfida, s] of sfideStagione) {
                if (!s || s.stato !== 'in_attesa') continue;
                const voce = {
                    stagione: id, id: idSfida, categoria: s.categoria || '',
                    bestOf: s.bestOf || 3, creata: s.creata || 0
                };
                if (idDi(s.aId) === io) fuori.sfideRicevute.push({ ...voce, avversario: idDi(s.daId), nome: s.da || s.daId });
                else if (idDi(s.daId) === io) fuori.sfideInviate.push({ ...voce, avversario: idDi(s.aId), nome: s.a || s.aId });
            }

            // ---- showdown in corso ----
            for (const [idSd, sd] of mie) {
                if (completato(sd)) continue;
                const [p1] = giocatoriShowdown(sd);
                let v1 = 0, v2 = 0;
                for (const m of valori(sd.matches)) {
                    const v = vincitoreMatch(m, sd);
                    if (!v) continue;
                    if (v === p1) v1++; else v2++;
                }
                const sono1 = p1 === io;
                const avv = sono1 ? idDi(sd.info.player2Id || sd.info.player2) : p1;
                fuori.inCorso.push({
                    stagione: id, id: idSd, avversario: avv,
                    nome: (sono1 ? sd.info.player2 : sd.info.player1) || avv,
                    categoria: sd.info.categoria || '',
                    match: prossimoMatch(sd),
                    mioPunteggio: sono1 ? `${v1} - ${v2}` : `${v2} - ${v1}`,
                    aggiornato: tempoDi(sd.info.lastUpdate) || tempoDi(sd.info.timestamp)
                });
            }

            // ---- showdown ancora da giocare (solo a stagione in corso e con un tetto per formato) ----
            if (st !== 'PLAYING' || !massimo) continue;
            for (const nome of iscritti) {
                const avv = idDi(nome);
                if (avv === io) continue;
                const elenco = [];
                for (const formato of formati) {
                    const rimasti = showdownRimasti(info, showdowns, sfideStagione, io, avv, formato);
                    if (!(rimasti > 0)) continue;
                    const occupato = sfideStagione.some(([, s]) => s && s.stato === 'in_attesa' && s.categoria === formato && coppia(s.daId, s.aId, io, avv))
                        || mie.some(([, sd]) => !completato(sd) && sd.info.categoria === formato && giocatoriShowdown(sd).includes(avv));
                    elenco.push({ formato, rimasti, occupato });
                }
                if (!elenco.length) continue;
                fuori.mancanti.push({
                    stagione: id, nomeStagione, avversario: avv, nome,
                    totale: elenco.reduce((s, f) => s + f.rimasti, 0),
                    formati: elenco
                });
            }
        }

        const piuRecenti = (a, b) => (b.creata || 0) - (a.creata || 0);
        fuori.sfideRicevute.sort(piuRecenti);
        fuori.sfideInviate.sort(piuRecenti);
        fuori.inCorso.sort((a, b) => b.aggiornato - a.aggiornato);
        fuori.mancanti.sort((a, b) => b.totale - a.totale || a.nome.localeCompare(b.nome));
        return fuori;
    }

    return {
        MATCH_PER_SHOWDOWN, FORMA_MAX, MIN_MATCH_RIVALE,
        idDi, matchValido, completato, prossimoMatch, vincitoreMatch, vincitoreShowdown,
        stato, formatiStagione, nomiIscritti, tempoRimasto,
        rivali, riepilogoRivali, showdownRimasti, daFare
    };
});
