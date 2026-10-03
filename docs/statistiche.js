// =====================================================
// STATISTICHE — Poké-Tournament
//
// Statistiche.calcola(dati, filtro) trasforma i dati grezzi di Firebase
// ({ seasons, players }) nelle statistiche di player, team e Pokémon,
// per tutte le stagioni insieme ("globali") o per una sola.
//
// È una funzione pura: niente DOM, niente Firebase. La usa stats.html,
// e si può provare in Node (test/statistiche.test.js).
//
// Da dove vengono i numeri
//   - Risultati (showdown, match, set, punti, Elo): dai match salvati in
//     seasons/{id}/showdowns/{sd}/matches/matchN, come per il resto del sito.
//   - KO, Pokémon portati, ultimo rimasto: da matchN/setStats/setN, che il
//     server calcola a fine set (functions/statistiche-set.js). I match
//     inseriti a mano non li hanno: contano per i risultati ma non per i KO,
//     e ogni statistica di KO dice su quanti set si basa.
//   - Come il resto del sito, le stagioni "globali" escludono la beta (sbeta);
//     la si può comunque scegliere come stagione.
//
// Un "Pokémon" è QUEL Pokémon di QUEL team (non la specie): la chiave è
// giocatore + nome del team + specie (+ numero, se la specie compare due volte).
// Le serie di un Pokémon (serie.vittorieMax, serie.pulitaMax) contano solo i match in cui è DAVVERO sceso in
// campo (almeno un set con "portato"): i match in cui è rimasto in panchina non le allungano né le spezzano.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Statistiche = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const BETA = 'sbeta';
    const ELO_INIZIALE = 1000;

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const idSpecie = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    // Nel Box un Pokémon con soprannome è salvato come "Soprannome (Specie)"
    const specieDaNome = nome => {
        const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(String(nome || '').trim());
        return m ? m[2].trim() : String(nome || '').trim();
    };
    // percentuale con un decimale; null se non c'è nulla su cui calcolarla
    const perc = (parte, tutto) => (tutto > 0 ? Math.round((parte / tutto) * 1000) / 10 : null);
    const media = (somma, n) => (n > 0 ? Math.round((somma / n) * 10) / 10 : null);
    const piuAlto = (mappa, chiave = 'n') => {
        let meglio = null;
        for (const [nome, v] of Object.entries(mappa)) {
            if (!meglio || v[chiave] > meglio[chiave]) meglio = { nome, ...v };
        }
        return meglio;
    };

    // -----------------------------------------------------
    // 1. Stagioni
    // -----------------------------------------------------
    // Ordine: la più recente prima (s12, s3, s1), la beta in fondo
    function ordineStagioni(a, b) {
        if (a === BETA) return 1;
        if (b === BETA) return -1;
        const na = parseInt(String(a).replace(/\D/g, ''), 10), nb = parseInt(String(b).replace(/\D/g, ''), 10);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
        return String(b).localeCompare(String(a));
    }

    const stagioneChiusa = info => ['closed', 'terminata'].includes(String(info?.status || '').toLowerCase().trim());

    // -----------------------------------------------------
    // 2. Tutti i match salvati, in una forma uniforme
    // -----------------------------------------------------
    function elencoPartite(seasons) {
        const out = [];
        for (const [stagione, dati] of Object.entries(seasons || {})) {
            for (const [sdId, sd] of Object.entries(dati?.showdowns || {})) {
                const info = sd?.info || {};
                for (const [chiave, m] of Object.entries(sd?.matches || {})) {
                    if (!m || m.p1score == null || m.p2score == null) continue;      // match non salvato
                    const p1 = idDi(m.player1Id), p2 = idDi(m.player2Id);
                    if (!p1 || !p2) continue;
                    const s1 = num(m.p1score), s2 = num(m.p2score);
                    let vincitore = idDi(m.winnerId);
                    if (vincitore !== p1 && vincitore !== p2) vincitore = s1 > s2 ? p1 : s2 > s1 ? p2 : '';
                    out.push({
                        stagione, sdId, sd: `${stagione}/${sdId}`,
                        numero: parseInt(String(chiave).replace(/\D/g, ''), 10) || 0,
                        data: String(m.data || info.data || ''),
                        categoria: String(m.categoria || info.categoria || ''),
                        p1, p2,
                        nome1: m.player1 || p1, nome2: m.player2 || p2,
                        team1: String(m.team1 || ''), team2: String(m.team2 || ''),
                        s1, s2, vincitore,
                        punti1: num(m.p1points), punti2: num(m.p2points),
                        elo1: m.p1EloAtMatch == null ? null : num(m.p1EloAtMatch),
                        elo2: m.p2EloAtMatch == null ? null : num(m.p2EloAtMatch),
                        delta1: num(m.p1DeltaElo), delta2: num(m.p2DeltaElo),
                        vincitoreSd: idDi(info.vincitoreShowdown),
                        setStats: m.setStats && typeof m.setStats === 'object' ? m.setStats : null
                    });
                }
            }
        }
        // ordine cronologico (per le serie e per l'Elo)
        return out
            .map((p, i) => ({ p, i }))
            .sort((x, y) => x.p.data.localeCompare(y.p.data) || x.p.numero - y.p.numero || x.i - y.i)
            .map(x => x.p);
    }

    // Classifica di una stagione (come in matches.html: punti, poi match vinti, poi set vinti).
    // I punti sono quelli dei match + 1 per ogni showdown vinto.
    function classificaStagione(partite) {
        const g = {};
        const scheda = id => (g[id] ||= { id, punti: 0, vinti: 0, setV: 0 });
        const sdVisti = new Set();
        for (const p of partite) {
            const a = scheda(p.p1), b = scheda(p.p2);
            a.punti += p.punti1; b.punti += p.punti2;
            a.setV += p.s1; b.setV += p.s2;
            if (p.vincitore === p.p1) a.vinti++; else if (p.vincitore === p.p2) b.vinti++;
            if (p.vincitoreSd && !sdVisti.has(p.sd)) { sdVisti.add(p.sd); scheda(p.vincitoreSd).punti += 1; }
        }
        return Object.values(g).sort((a, b) => b.punti - a.punti || b.vinti - a.vinti || b.setV - a.setV);
    }

    // -----------------------------------------------------
    // 3. Contenitori dei numeri
    // -----------------------------------------------------
    const vuotoKo = () => ({ fatti: 0, subiti: 0, setConDati: 0, setPerfetti: 0, setAlLimite: 0, turni: 0 });
    const nuovoRisultati = () => ({
        match: { giocati: 0, vinti: 0, persi: 0 },
        set: { giocati: 0, vinti: 0, persi: 0 },
        showdown: { giocati: 0, vinti: 0, persi: 0 },
        punti: 0, ko: vuotoKo()
    });

    // Un match, visto da uno dei due lati
    function aggiungiMatch(r, vinto, setV, setP, punti) {
        r.match.giocati++;
        if (vinto) r.match.vinti++; else r.match.persi++;
        r.set.vinti += setV; r.set.persi += setP; r.set.giocati += setV + setP;
        r.punti += punti;
    }

    // Un set con statistiche, visto da uno dei due lati ('p1' | 'p2')
    function aggiungiKoSet(ko, st, lato) {
        const mio = st[lato], altro = st[lato === 'p1' ? 'p2' : 'p1'];
        if (!mio || !altro) return false;
        ko.setConDati++;
        ko.fatti += num(altro.svenuti);
        ko.subiti += num(mio.svenuti);
        ko.turni += num(st.turni);
        if (st.vincitore === lato) {
            if (num(mio.svenuti) === 0) ko.setPerfetti++;
            else if (num(mio.portati) > 1 && num(mio.portati) - num(mio.svenuti) === 1) ko.setAlLimite++;
        }
        return true;
    }

    function finisciKo(ko) {
        return {
            fatti: ko.fatti, subiti: ko.subiti, differenza: ko.fatti - ko.subiti,
            setConDati: ko.setConDati, setPerfetti: ko.setPerfetti, setAlLimite: ko.setAlLimite,
            turniMedi: media(ko.turni, ko.setConDati),
            fattiPerSet: media(ko.fatti, ko.setConDati)
        };
    }

    // Set con statistiche di un match: [{ n, st }]
    function setConStatistiche(p) {
        if (!p.setStats) return [];
        return Object.entries(p.setStats)
            .map(([k, st]) => ({ n: parseInt(k.replace(/\D/g, ''), 10) || 0, st }))
            .filter(x => x.st && x.st.p1 && x.st.p2)
            .sort((a, b) => a.n - b.n);
    }

    // -----------------------------------------------------
    // 4. Il calcolo
    // -----------------------------------------------------
    /**
     * @param {{ seasons: object, players: object }} dati   i nodi `seasons` e `players` di Firebase
     * @param {{ stagione?: string, formato?: string }} [filtro]
     *        stagione: 'all' (tutte, beta esclusa) oppure l'id di una stagione (anche 'sbeta')
     *        formato:  'all' oppure il nome di una categoria (es. "VGC")
     */
    function calcola(dati, filtro = {}) {
        const seasons = dati?.seasons || {};
        const players = dati?.players || {};
        const stagioneScelta = filtro.stagione && filtro.stagione !== 'all' ? String(filtro.stagione) : 'all';
        const formatoScelto = filtro.formato && filtro.formato !== 'all' ? String(filtro.formato) : 'all';

        const tutte = elencoPartite(seasons);
        const perStagione = {};
        for (const p of tutte) (perStagione[p.stagione] ||= []).push(p);

        // Vincitori delle stagioni chiuse (su TUTTI i match della stagione, qualunque formato)
        const vincitoreStagione = {};
        for (const [id, stagioneDati] of Object.entries(seasons)) {
            if (!stagioneChiusa(stagioneDati?.info)) continue;
            const classifica = classificaStagione(perStagione[id] || []);
            if (classifica.length) vincitoreStagione[id] = classifica[0].id;
        }

        const stagioni = Object.keys(seasons).sort(ordineStagioni).map(id => ({
            id,
            nome: seasons[id]?.info?.name || id,
            stato: String(seasons[id]?.info?.status || '').toLowerCase().trim(),
            beta: id === BETA,
            partite: (perStagione[id] || []).length,
            vincitore: vincitoreStagione[id] || ''
        }));

        // Perimetro: la stagione scelta (o tutte tranne la beta) e, se serve, un formato
        const inStagione = tutte.filter(p => stagioneScelta === 'all' ? p.stagione !== BETA : p.stagione === stagioneScelta);
        const formati = [...new Set(inStagione.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const partite = formatoScelto === 'all' ? inStagione : inStagione.filter(p => p.categoria === formatoScelto);

        // ---------- contenitori ----------
        const giocatori = {};   // id -> scheda
        const squadre = {};     // chiave -> scheda
        const mostri = {};      // chiave -> scheda

        const giocatore = id => (giocatori[id] ||= {
            id, ...nuovoRisultati(),
            stagioni: new Set(), stagioniVinte: new Set(),
            formati: {}, teams: {}, elenco: [], eloDopo: [], delta: 0
        });
        const info = id => players[id]?.info || {};
        const rosterDi = (id, nomeTeam) => {
            const t = valori(players[id]?.teams).find(x => idDi(x?.nome) === idDi(nomeTeam));
            return t ? { formato: t.categoria || '', specie: valori(t.pokemon).map(p => p && p.nome).filter(Boolean).map(specieDaNome) } : null;
        };
        const squadra = (id, nome, formato) => {
            const chiave = `${id}::${nome}`;
            if (!squadre[chiave]) {
                const roster = rosterDi(id, nome);
                squadre[chiave] = {
                    chiave, player: id, nome, formato: roster?.formato || formato,
                    roster: (roster?.specie || []).map(s => ({ nome: s })),
                    ...nuovoRisultati(),
                    stagioni: new Set(), stagioniVinte: new Set(), sdVisti: new Set(), ultimoUso: ''
                };
            }
            if (formato && !squadre[chiave].formato) squadre[chiave].formato = formato;
            return squadre[chiave];
        };
        // Pokémon di un team: chiave = specie + numero d'ordine se la specie è doppia
        const chiaviPokemon = (specie) => {
            const visti = {};
            return specie.map(s => {
                const id = idSpecie(s);
                visti[id] = (visti[id] || 0) + 1;
                return visti[id] > 1 ? `${id}#${visti[id]}` : id;
            });
        };
        const mostro = (team, chiaveSpecie, nomeSpecie) => {
            const chiave = `${team.chiave}::${chiaveSpecie}`;
            if (!mostri[chiave]) {
                mostri[chiave] = {
                    chiave, squadra: team.chiave, player: team.player, team: team.nome, formato: team.formato,
                    specie: nomeSpecie, specieId: chiaveSpecie.split('#')[0],
                    apparsoInSet: 0, portato: 0, titolare: 0, koFatti: 0, koDiretti: 0, svenuto: 0,
                    ultimo: 0, ultimoVinto: 0, setPortatoVinti: 0, setPortatoPersi: 0, setStats: 0,
                    // serie di match "veri": contano solo i match in cui è sceso in campo almeno una volta
                    matchPortato: 0, matchVinti: 0, serieAttuale: 0, serieMax: 0, pulitaAttuale: 0, pulitaMax: 0,
                    stagioniInCampo: new Set()
                };
            }
            return mostri[chiave];
        };

        // ---------- match per match ----------
        const sdDelPlayer = {};   // `${player}|${sd}` -> { vinto, deciso, teams: Set }
        for (const p of partite) {
            for (const lato of ['p1', 'p2']) {
                const io = lato === 'p1' ? p.p1 : p.p2;
                const altro = lato === 'p1' ? p.p2 : p.p1;
                const mio = lato === 'p1';
                const g = giocatore(io);
                const nomeTeam = mio ? p.team1 : p.team2;
                const vinto = p.vincitore === io;
                const setV = mio ? p.s1 : p.s2, setP = mio ? p.s2 : p.s1;
                const punti = mio ? p.punti1 : p.punti2;

                aggiungiMatch(g, vinto, setV, setP, punti);
                g.stagioni.add(p.stagione);
                g.formati[p.categoria] ||= { n: 0, vinti: 0 };
                g.formati[p.categoria].n++;
                if (vinto) g.formati[p.categoria].vinti++;
                g.elenco.push({ vinto, setV, setP });
                const eloPrima = mio ? p.elo1 : p.elo2, delta = mio ? p.delta1 : p.delta2;
                g.delta += delta;
                if (eloPrima != null) g.eloDopo.push(eloPrima + delta);

                // showdown di questo giocatore
                const k = `${io}|${p.sd}`;
                const sdp = (sdDelPlayer[k] ||= { io, sd: p.sd, deciso: !!p.vincitoreSd, vinto: p.vincitoreSd === io, teams: new Set(), stagione: p.stagione });
                if (nomeTeam) sdp.teams.add(nomeTeam);

                // team
                let team = null;
                if (nomeTeam) {
                    team = squadra(io, nomeTeam, p.categoria);
                    aggiungiMatch(team, vinto, setV, setP, punti);
                    team.stagioni.add(p.stagione);
                    if (vincitoreStagione[p.stagione] === io) team.stagioniVinte.add(p.stagione);
                    if (!team.ultimoUso || p.data > team.ultimoUso) team.ultimoUso = p.data;
                    g.teams[nomeTeam] ||= { n: 0, vinti: 0 };
                    g.teams[nomeTeam].n++;
                    if (vinto) g.teams[nomeTeam].vinti++;
                }

                // set con statistiche (KO, Pokémon portati...)
                const scesiNelMatch = new Set();
                for (const { st } of setConStatistiche(p)) {
                    if (!aggiungiKoSet(g.ko, st, lato)) continue;
                    if (!team) continue;
                    aggiungiKoSet(team.ko, st, lato);

                    const mioLato = st[lato];
                    const chiavi = chiaviPokemon(valori(mioLato.pokemon).map(x => x.specie));
                    const vintoSet = st.vincitore === lato;
                    valori(mioLato.pokemon).forEach((x, i) => {
                        const m = mostro(team, chiavi[i], x.specie);
                        m.setStats++;
                        if (x.portato) {
                            scesiNelMatch.add(m);
                            m.portato++;
                            if (vintoSet) m.setPortatoVinti++; else if (st.vincitore) m.setPortatoPersi++;
                        }
                        if (x.titolare) m.titolare++;
                        m.koFatti += num(x.koFatti);
                        m.koDiretti += num(x.koDiretti);
                        if (x.svenuto) m.svenuto++;
                        if (x.ultimo) { m.ultimo++; if (vintoSet) m.ultimoVinto++; }
                    });
                }

                // serie del match: chi non è mai sceso in campo non la allunga e non la spezza
                const pulito = vinto && setP === 0;
                for (const m of scesiNelMatch) {
                    m.matchPortato++;
                    m.stagioniInCampo.add(p.stagione);
                    if (vinto) {
                        m.matchVinti++;
                        m.serieAttuale++;
                        if (m.serieAttuale > m.serieMax) m.serieMax = m.serieAttuale;
                        if (pulito) {
                            m.pulitaAttuale++;
                            if (m.pulitaAttuale > m.pulitaMax) m.pulitaMax = m.pulitaAttuale;
                        } else m.pulitaAttuale = 0;
                    } else { m.serieAttuale = 0; m.pulitaAttuale = 0; }
                }
            }
        }

        // ---------- showdown e stagioni ----------
        for (const s of Object.values(sdDelPlayer)) {
            const g = giocatore(s.io);
            g.showdown.giocati++;
            if (s.deciso) {
                if (s.vinto) { g.showdown.vinti++; g.punti += 1; } else g.showdown.persi++;
            }
            for (const nome of s.teams) {
                const t = squadra(s.io, nome, '');
                t.showdown.giocati++;
                if (s.deciso) { if (s.vinto) t.showdown.vinti++; else t.showdown.persi++; }
            }
        }
        // Il bonus dello showdown vinto va anche ai punti del team che lo ha giocato?
        // No: i punti di un team sono quelli dei suoi match (il bonus è del giocatore).

        // Stagioni vinte: il vincitore di una stagione chiusa (i suoi team le hanno già contate nel ciclo dei match)
        for (const g of Object.values(giocatori)) {
            for (const id of g.stagioni) if (vincitoreStagione[id] === g.id) g.stagioniVinte.add(id);
        }
        // ---------- Pokémon: anche quelli del team che non hanno dati di set ----------
        for (const t of Object.values(squadre)) {
            const chiavi = chiaviPokemon(t.roster.map(r => r.nome));
            t.roster.forEach((r, i) => { mostro(t, chiavi[i], r.nome); });
        }
        // KO totali dei team (per la quota di KO di ogni Pokémon): somma dei KO attribuiti
        const koAttribuitiTeam = {};
        for (const m of Object.values(mostri)) koAttribuitiTeam[m.squadra] = (koAttribuitiTeam[m.squadra] || 0) + m.koFatti;

        // ---------- risultato ----------
        const elencoPlayers = Object.values(giocatori).map(g => {
            const piuUsatoTeam = piuAlto(g.teams), piuUsatoFormato = piuAlto(g.formati);
            const picco = g.eloDopo.length ? Math.max(...g.eloDopo) : null;
            const eloStagione = g.eloDopo.length ? g.eloDopo[g.eloDopo.length - 1] : null;
            const dbElo = players[g.id]?.stats?.['individual-stats']?.ranking;
            // globali: il ranking salvato (lo stesso della pagina Trainers); per stagione: Elo a fine stagione
            const elo = stagioneScelta === 'all'
                ? (dbElo != null ? num(dbElo) : ELO_INIZIALE + g.delta)
                : (eloStagione != null ? eloStagione : ELO_INIZIALE);
            const serie = { vittorieMax: 0, vittorieAttuale: 0, cleanSweep: 0 };
            let corrente = 0;
            for (const m of g.elenco) {
                if (m.vinto) {
                    corrente++;
                    serie.vittorieMax = Math.max(serie.vittorieMax, corrente);
                    if (m.setP === 0) serie.cleanSweep++;
                } else corrente = 0;
            }
            serie.vittorieAttuale = corrente;
            return {
                id: g.id,
                nome: info(g.id).name || g.id,
                colore: info(g.id).color || '',
                avatar: info(g.id).avatar || '',
                elo, eloDelta: g.delta, eloPicco: picco,
                punti: g.punti,
                stagioniGiocate: g.stagioni.size,
                stagioniVinte: g.stagioniVinte.size,
                showdown: g.showdown,
                match: g.match, set: g.set,
                percMatch: perc(g.match.vinti, g.match.giocati),
                percSet: perc(g.set.vinti, g.set.giocati),
                serie,
                ko: finisciKo(g.ko),
                preferiti: {
                    formato: piuUsatoFormato && piuUsatoFormato.nome ? piuUsatoFormato : null,
                    team: piuUsatoTeam
                },
                formati: g.formati
            };
        });

        const elencoTeams = Object.values(squadre).map(t => ({
            chiave: t.chiave, player: t.player,
            playerNome: info(t.player).name || t.player,
            colore: info(t.player).color || '',
            nome: t.nome, formato: t.formato,
            specie: t.roster.map(r => r.nome),
            stagioniGiocate: t.stagioni.size,
            stagioniVinte: t.stagioniVinte.size,
            showdown: t.showdown, match: t.match, set: t.set,
            percMatch: perc(t.match.vinti, t.match.giocati),
            percSet: perc(t.set.vinti, t.set.giocati),
            punti: t.punti,
            ko: finisciKo(t.ko),
            ultimoUso: t.ultimoUso
        }));

        const squadreMappa = Object.fromEntries(elencoTeams.map(t => [t.chiave, t]));
        const elencoPokemon = Object.values(mostri).map(m => {
            const t = squadreMappa[m.squadra];
            const totaleTeam = koAttribuitiTeam[m.squadra] || 0;
            const portato = m.portato;
            return {
                chiave: m.chiave, squadra: m.squadra, player: m.player,
                playerNome: info(m.player).name || m.player,
                colore: info(m.player).color || '',
                team: m.team, formato: m.formato,
                specie: m.specie, specieId: m.specieId,
                stagioniVinte: t ? t.stagioniVinte : 0,
                stagioniGiocate: t ? t.stagioniGiocate : 0,
                // a differenza dei due numeri qui sopra (del team), contano solo le stagioni in cui è sceso in campo
                stagioniInCampo: m.stagioniInCampo.size,
                stagioniVinteInCampo: [...m.stagioniInCampo].filter(id => vincitoreStagione[id] === m.player).length,
                showdown: t ? t.showdown : { giocati: 0, vinti: 0, persi: 0 },
                match: t ? t.match : { giocati: 0, vinti: 0, persi: 0 },
                set: t ? t.set : { giocati: 0, vinti: 0, persi: 0 },
                setConDati: m.setStats,
                portato, titolare: m.titolare,
                percPortato: perc(portato, m.setStats),
                koFatti: m.koFatti, koDiretti: m.koDiretti, koIndiretti: m.koFatti - m.koDiretti,
                svenuto: m.svenuto,
                koPerSet: media(m.koFatti, portato),
                quotaKo: perc(m.koFatti, totaleTeam),
                sopravvivenza: portato ? perc(portato - m.svenuto, portato) : null,
                ultimo: m.ultimo, ultimoVinto: m.ultimoVinto,
                serie: {
                    matchPortato: m.matchPortato, matchVinti: m.matchVinti,
                    vittorieMax: m.serieMax, vittorieAttuale: m.serieAttuale,
                    pulitaMax: m.pulitaMax, pulitaAttuale: m.pulitaAttuale
                },
                setPortatoVinti: m.setPortatoVinti, setPortatoPersi: m.setPortatoPersi,
                percVintiPortato: perc(m.setPortatoVinti, m.setPortatoVinti + m.setPortatoPersi)
            };
        });

        // Il Pokémon con più KO di ogni giocatore
        for (const pl of elencoPlayers) {
            const suoi = elencoPokemon.filter(x => x.player === pl.id && x.koFatti > 0);
            suoi.sort((a, b) => b.koFatti - a.koFatti || b.portato - a.portato);
            pl.mvp = suoi[0] ? { specie: suoi[0].specie, team: suoi[0].team, koFatti: suoi[0].koFatti } : null;
        }

        // Ordine predefinito: Elo (globali) o punti (stagione), poi vittorie
        elencoPlayers.sort((a, b) => stagioneScelta === 'all'
            ? b.elo - a.elo || b.punti - a.punti
            : b.punti - a.punti || b.match.vinti - a.match.vinti || b.set.vinti - a.set.vinti);
        elencoTeams.sort((a, b) => b.match.vinti - a.match.vinti || b.set.vinti - a.set.vinti || b.match.giocati - a.match.giocati);
        elencoPokemon.sort((a, b) => b.koFatti - a.koFatti || b.portato - a.portato || b.match.vinti - a.match.vinti);

        return {
            filtro: { stagione: stagioneScelta, formato: formatoScelto },
            stagioni, formati,
            totali: {
                match: partite.length,
                set: partite.reduce((n, p) => n + p.s1 + p.s2, 0),
                setConDati: partite.reduce((n, p) => n + setConStatistiche(p).length, 0),
                showdown: new Set(partite.map(p => p.sd)).size
            },
            players: elencoPlayers,
            teams: elencoTeams,
            pokemon: elencoPokemon
        };
    }

    return { calcola, idSpecie, BETA };
});
