// =====================================================
// RISULTATI MATCH — logica condivisa
// Usata da matches.html (inserimento manuale) e, in futuro,
// da battle.html (battaglie giocate sul sito).
// Nessun riferimento al DOM, nessun alert: solo dati e Firebase.
// Richiede che la variabile globale `db` sia già definita
// nella pagina che carica questo file.
// =====================================================


// Punti classifica in base ai set vinti.
// NB: si giocano sempre tutti i set (3 o 5).
function calcolaPuntiMatch(setVinti, isBO3) {
    if (isBO3) {
        if (setVinti >= 2) return 2;
        if (setVinti === 1) return 1;
        return 0;
    }
    if (setVinti === 5) return 3;
    if (setVinti >= 3) return 2;
    if (setVinti === 2) return 1;
    return 0;
}


/**
 * Salva un match e aggiorna tutto ciò che ne dipende:
 * Elo, vincitore dello showdown, chiusura stagione, statistiche.
 *
 * r = {
 *   stagione, showdownId, matchNum,
 *   player1, player2,          // nomi come nello showdown, es. "Didi"
 *   team1, team2,              // nomi dei team
 *   score,                     // es. "3-2" oppure "2-1"
 *   data, categoria,
 *   replays,                   // { set1: { url, vincitore: "1"|"2" }, ... }
 *   setStats                   // (facoltativo) { set1: <analizzaSet() di statistiche-set.js>, ... }
 *                              // dei set giocati sul sito; se manca si tengono quelli già salvati
 * }
 *
 * Restituisce { stagioneChiusa, vincitoreStagione, totalDays }
 * così la pagina che chiama decide come mostrarlo.
 */
async function registraRisultatoMatch(r) {
    const { stagione, showdownId, matchNum } = r;
    const pathShowdown = `seasons/${stagione}/showdowns/${showdownId}`;
    const pathMatch = `${pathShowdown}/matches/match${matchNum}`;

    // --- 1. PUNTEGGIO, VINCITORE E PUNTI ---
    const [s1, s2] = r.score.split('-').map(v => parseInt(v) || 0);
    const p1Id = r.player1.toLowerCase().trim();
    const p2Id = r.player2.toLowerCase().trim();
    const winnerId = s1 > s2 ? p1Id : p2Id;
    const isBO3 = (s1 + s2) <= 3;

    const p1points = calcolaPuntiMatch(s1, isBO3);
    const p2points = calcolaPuntiMatch(s2, isBO3);

    // --- 2. ELO ---
    const [snapP1, snapP2, snapEsistente] = await Promise.all([
        db.ref(`players/${p1Id}/stats/individual-stats/ranking`).once('value'),
        db.ref(`players/${p2Id}/stats/individual-stats/ranking`).once('value'),
        db.ref(pathMatch).once('value')
    ]);

    const eloP1_pre = snapP1.val() || 1000;
    const eloP2_pre = snapP2.val() || 1000;
    const matchEsistente = snapEsistente.val();

    let delta1, delta2;
    const K = 32;

    if (matchEsistente &&
        matchEsistente.player1Id === p1Id &&
        matchEsistente.player2Id === p2Id &&
        matchEsistente.winnerId === winnerId &&
        matchEsistente.p1DeltaElo !== undefined) {
        // Modifica di un match esistente con stesso esito: riuso i delta
        delta1 = matchEsistente.p1DeltaElo;
        delta2 = matchEsistente.p2DeltaElo;
    } else {
        const exp1 = 1 / (1 + Math.pow(10, (eloP2_pre - eloP1_pre) / 400));
        const exp2 = 1 / (1 + Math.pow(10, (eloP1_pre - eloP2_pre) / 400));
        delta1 = Math.round(K * ((winnerId === p1Id ? 1 : 0) - exp1));
        delta2 = Math.round(K * ((winnerId === p2Id ? 1 : 0) - exp2));
    }

    // --- 3. SALVATAGGIO MATCH ---
    const datiMatch = {
        player1: r.player1,
        player1Id: p1Id,
        player2: r.player2,
        player2Id: p2Id,
        winnerId: winnerId,
        team1: r.team1,
        team2: r.team2,
        score: r.score,
        p1score: s1,
        p2score: s2,
        p1points: p1points,
        p2points: p2points,
        data: r.data,
        categoria: r.categoria,
        replays: r.replays || {},
        lastEdit: new Date().toISOString(),
        showdownId: showdownId,
        p1EloAtMatch: eloP1_pre,
        p2EloAtMatch: eloP2_pre,
        p1DeltaElo: delta1,
        p2DeltaElo: delta2
    };

    // Statistiche per set (KO, ultimo rimasto...): le calcola il server a fine set.
    // Una modifica fatta a mano non le ha: in quel caso restano quelle già salvate.
    const setStats = (r.setStats && Object.keys(r.setStats).length)
        ? r.setStats
        : (matchEsistente && matchEsistente.setStats) || null;
    if (setStats) datiMatch.setStats = setStats;

    await db.ref(pathMatch).set(datiMatch);

    await db.ref(`players/${p1Id}/stats/individual-stats`).update({ ranking: eloP1_pre + delta1 });
    await db.ref(`players/${p2Id}/stats/individual-stats`).update({ ranking: eloP2_pre + delta2 });
    console.log(`Elo aggiornato con Delta: ${p1Id} (${delta1}), ${p2Id} (${delta2})`);

    // --- 4. VINCITORE SHOWDOWN ---
    const sdSnap = await db.ref(`${pathShowdown}/matches`).once('value');
    const allMatches = sdSnap.val() || {};
    const matchesArray = Object.values(allMatches);

    const winsRecord = {};
    matchesArray.forEach(m => {
        if (!m.winnerId) return;
        winsRecord[m.winnerId] = (winsRecord[m.winnerId] || 0) + 1;
    });

    let seriesWinnerId = null;
    let maxWins = 0;
    let isTie = false;

    Object.entries(winsRecord).forEach(([id, count]) => {
        if (count > maxWins) {
            maxWins = count;
            seriesWinnerId = id;
            isTie = false;
        } else if (count === maxWins) {
            isTie = true;
        }
    });

    const infoUpdate = {
        punteggioSerie: Object.entries(winsRecord).map(([id, w]) => `${id}: ${w}`).join(' vs '),
        ultimoAggiornamento: new Date().toISOString()
    };

    if (seriesWinnerId && !isTie && matchesArray.length >= 2) {
        infoUpdate.vincitoreShowdown = seriesWinnerId;
    } else {
        await db.ref(`${pathShowdown}/info/vincitoreShowdown`).remove();
    }

    await db.ref(`${pathShowdown}/info`).update(infoUpdate);

    // --- 5. CHIUSURA AUTOMATICA STAGIONE ---
    const esito = { stagioneChiusa: false, vincitoreStagione: null, totalDays: 0 };

    const [snapStagioneInfo, snapTuttiShowdowns] = await Promise.all([
        db.ref(`seasons/${stagione}/info`).once('value'),
        db.ref(`seasons/${stagione}/showdowns`).once('value')
    ]);

    const stagioneInfo = snapStagioneInfo.val() || {};
    const tuttiShowdowns = snapTuttiShowdowns.val() || {};

    if (stagioneInfo.status === 'playing' && stagioneInfo.total_days) {
        const numeroShowdownAttuali = Object.keys(tuttiShowdowns).length;
        const totalDaysPrevisti = parseInt(stagioneInfo.total_days) || 0;
        const matchInQuestoShowdown = Object.keys(allMatches).length;

        if (numeroShowdownAttuali >= totalDaysPrevisti && matchInQuestoShowdown >= 3) {
            await db.ref(`seasons/${stagione}/info`).update({ status: 'closed' });
            console.log(`La stagione ${stagione} è stata impostata automaticamente su CLOSED.`);

            const snapPlayers = await db.ref('players').once('value');
            const tuttiIPlayers = snapPlayers.val() || {};

            let vincitoreStagioneId = "Nessuno";
            let punteggioMassimo = -1;

            Object.entries(tuttiIPlayers).forEach(([idPlayer, datiPlayer]) => {
                const rankingActual = datiPlayer.stats?.['individual-stats']?.ranking || 1000;
                if (rankingActual > punteggioMassimo) {
                    punteggioMassimo = rankingActual;
                    vincitoreStagioneId = idPlayer.toUpperCase();
                }
            });

            esito.stagioneChiusa = true;
            esito.vincitoreStagione = vincitoreStagioneId;
            esito.totalDays = totalDaysPrevisti;
        }
    }

    // --- 6. SINCRONIZZAZIONE STATISTICHE ---
    await aggiornaLeaderboard(stagione);
    await ricalcolaStatisticheGlobali(p1Id);
    await ricalcolaStatisticheGlobali(p2Id);

    return esito;
}


// =====================================================
// FUNZIONI SPOSTATE DA matches.html
// Incolla qui sotto, così come sono, le due funzioni
// tagliate da matches.html:
//   async function ricalcolaStatisticheGlobali(pId) { ... }
//   async function aggiornaLeaderboard(stagione) { ... }
// =====================================================

async function ricalcolaStatisticheGlobali(pId) {
    try {
        const seasonsSnap = await db.ref(`seasons`).once('value');
        const seasons = seasonsSnap.val() || {};
        
        const playerSnap = await db.ref(`players/${pId}`).once('value');
        const playerData = playerSnap.val() || {};
        
        const teamCompositionMap = {};
        const teamTypesMap = {}; 

        // --- 1A. CONFIGURAZIONE CACHE E FUNZIONE LOCALE POKEAPI ---
        const pokemonTypesCache = {};

        async function ottieniTipiDaPokeAPI(nomePokemon) {
            if (!nomePokemon) return [];
            if (/^\d+$/.test(nomePokemon.trim())) {
                console.warn(`⚠️ Saltato nome Pokémon non valido (ID numerico): "${nomePokemon}"`);
                return [];
            }
            let nomeClean = nomePokemon.toLowerCase().trim()
                .replace(/\s+/g, '-')      
                .replace(/[^a-z0-9-]/g, ''); 

            const dizionarioEccezioni = {
                "darmanitan-galar": "darmanitan-galar-standard",
                "darmanitan-galar-zen": "darmanitan-galar-zen",
                "meloetta": "meloetta-aria",
                "meowstic": "meowstic-male",
                "aegislash": "aegislash-shield",
                "indeedee" : "indeedee-male",
                "tapufini" : "tapu-fini",
                "kommoo": "kommo-o",
                "pumpkaboo": "pumpkaboo-average",
                "gourgeist": "gourgeist-average",
                "mimikyu": "mimikyu-disguised",
                "toxtricity": "toxtricity-amped",
                "eiscue": "eiscue-ice",
                "morpeko": "morpeko-full-belly",
                "urshifu": "urshifu-single-strike",
                "urshifu-rapidstrike" : "urshifu-rapid-strike",
                "tornadus" : "tornadus-incarnate",
                "basculegion": "basculegion-male",
                "enamorus": "enamorus-incarnate",
                "mrmime": "mr-mime",
                "keldeo": "keldeo-ordinary",
                "lycanroc": "lycanroc-midday",
                "wishiwashi": "wishiwashi-solo",
                "minior": "minior-red-meteor"
            };

            if (dizionarioEccezioni[nomeClean]) {
                nomeClean = dizionarioEccezioni[nomeClean];
            }
            if (pokemonTypesCache[nomeClean]) {
                return pokemonTypesCache[nomeClean];
            }

            try {
                const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${nomeClean}`);
                if (!response.ok) throw new Error(`Pokémon ${nomeClean} not found`);
                const data = await response.json();
                const types = data.types.map(t => t.type.name.toLowerCase());
                pokemonTypesCache[nomeClean] = types;
                return types;
            } catch (err) {
                console.warn(`⚠️ Impossibile recuperare i tipi per "${nomePokemon}" (Provato come: ${nomeClean}):`, err.message);
                return []; 
            }
        }

        if (playerData.teams) {
            for (const t of Object.values(playerData.teams)) {
                teamCompositionMap[t.nome] = (t.pokemon || []).map(p => p.nome);
                const promesseTipi = (t.pokemon || []).map(p => ottieniTipiDaPokeAPI(p.nome));
                teamTypesMap[t.nome] = await Promise.all(promesseTipi);
            }
        }

        let cronologiaMatchPiatta = [];
        let listaShowdownPartecipati = [];
        let statsLeaderboard = { won: 0, lost: 0, setW: 0, setL: 0, points: 0, formats: {} };
        
        // Struttura di supporto temporanea per tracciare gli Showdown per ciascun formato
        const sdStatsPerFormato = {};
        
        // 🌟 CONTATORI GLOBALI PER GLI SHOWDOWN DELL'ALLENATORE
        let globalShowdownsPlayed = 0;
        let globalShowdownsWon = 0;
        let globalShowdownsLost = 0;

        // 1. ESTRAZIONE DATI
        Object.entries(seasons).forEach(([sId, stagione]) => {
            // 🚫 ESCLUSIONE STAGIONE BETA
            if (sId === 'sbeta') return;

            if (stagione.leaderboard && stagione.leaderboard[pId]) {
                const s = stagione.leaderboard[pId];
                statsLeaderboard.won += (s.won || 0);
                statsLeaderboard.lost += (s.lost || 0);
                statsLeaderboard.setW += (s.setW || 0);
                statsLeaderboard.setL += (s.setL || 0);
            }

            const showdowns = stagione.showdowns || {};
            Object.entries(showdowns).forEach(([sdId, sd]) => {
                const infoSD = sd.info || {};
                const dataSD = infoSD.data || infoSD.lastEdit || "2000-01-01";
                const categoria = infoSD.categoria || "Standard";
                let haGiocatoInQuestoSD = false;
                let lastTeamInSD = null;

                const matchesNodo = sd.matches || {};
                Object.entries(matchesNodo).forEach(([mKey, mData]) => {
                    const isP1 = mData.player1Id === pId;
                    const isP2 = mData.player2Id === pId;

                    if (isP1 || isP2) {
                        haGiocatoInQuestoSD = true;
                        const vinceMatch = (mData.winnerId === pId);
                        const scoreAvversario = isP1 ? Number(mData.p2score || 0) : Number(mData.p1score || 0);
                        const teamUsato = isP1 ? mData.team1 : mData.team2;
                        const matchPoints = isP1 ? Number(mData.p1points || 0) : Number(mData.p2points || 0);
                        lastTeamInSD = teamUsato;

                        const matchNumber = parseInt(mKey.replace(/\D/g, '')) || 0;

                        cronologiaMatchPiatta.push({
                            data: dataSD,
                            ordineInterno: matchNumber,
                            vittoria: vinceMatch,
                            punteggioAvversario: scoreAvversario,
                            team: teamUsato,
                            categoria: categoria,
                            deltaElo: isP1 ? Number(mData.p1DeltaElo || 0) : Number(mData.p2DeltaElo || 0),
                            points: matchPoints,
                            setW: isP1 ? Number(mData.p1score || 0) : Number(mData.p2score || 0),
                            setL: isP1 ? Number(mData.p2score || 0) : Number(mData.p1score || 0)
                        });

                        if (!statsLeaderboard.formats[categoria]) {
                            statsLeaderboard.formats[categoria] = { won: 0, lost: 0 };
                        }
                        if (vinceMatch) {
                            statsLeaderboard.formats[categoria].won++;
                        } else {
                            statsLeaderboard.formats[categoria].lost++;
                        }
                    }
                });

                if (haGiocatoInQuestoSD && lastTeamInSD) {
                    const haVintoSD = (infoSD.vincitoreShowdown === pId);

                    listaShowdownPartecipati.push({
                        data: dataSD,
                        vintoTorneo: haVintoSD,
                        team: lastTeamInSD,
                        pokemon: [...new Set(teamCompositionMap[lastTeamInSD] || [])]
                    });

                    // Aggiornamento contatori Showdown globali dell'allenatore
                    globalShowdownsPlayed += 1;
                    if (haVintoSD) {
                        globalShowdownsWon += 1;
                    } else {
                        globalShowdownsLost += 1;
                    }

                    // Inizializza e traccia le statistiche dello Showdown divise per formato
                    if (!sdStatsPerFormato[categoria]) {
                        sdStatsPerFormato[categoria] = { showdownsPlayed: 0, showdownsWon: 0, showdownsLost: 0 };
                    }
                    sdStatsPerFormato[categoria].showdownsPlayed += 1;
                    if (haVintoSD) {
                        sdStatsPerFormato[categoria].showdownsWon += 1;
                    } else {
                        sdStatsPerFormato[categoria].showdownsLost += 1;
                    }
                }
            });
        });

        // 2. ORDINAMENTO
        cronologiaMatchPiatta.sort((a, b) => {
            const d1 = new Date(a.data);
            const d2 = new Date(b.data);
            if (d1.getTime() !== d2.getTime()) return d1 - d2;
            return a.ordineInterno - b.ordineInterno;
        });

        listaShowdownPartecipati.sort((a, b) => new Date(a.data) - new Date(b.data));

        // 3. FUNZIONE CALCOLO BADGE
        const calcolaParametriBadge = (matchList, showdownList, filtro = null, tipoFiltro = 'global') => {
            let matches = matchList;
            if (tipoFiltro === 'team') matches = matchList.filter(m => m.team === filtro);
            if (tipoFiltro === 'pokemon') matches = matchList.filter(m => teamCompositionMap[m.team]?.includes(filtro));
            
            let curWS = 0, maxWS = 0, maxWSD = "-";
            let curCS = 0, maxCS = 0, maxCSD = "-";

            matches.forEach(m => {
                if (m.vittoria) {
                    curWS++;
                    if (curWS > maxWS) { maxWS = curWS; maxWSD = m.data; }
                    if (m.punteggioAvversario === 0) {
                        curCS++;
                        if (curCS > maxCS) { maxCS = curCS; maxCSD = m.data; }
                    } else { curCS = 0; }
                } else { curWS = 0; curCS = 0; }
            });

            let sds = showdownList;
            if (tipoFiltro === 'team') sds = showdownList.filter(s => s.team === filtro);
            if (tipoFiltro === 'pokemon') sds = showdownList.filter(s => s.pokemon.includes(filtro));
            
            let curSS = 0, maxSS = 0, maxSSD = "-";
            sds.forEach(s => {
                if (s.vintoTorneo) {
                    curSS++;
                    if (curSS > maxSS) { maxSS = curSS; maxSSD = s.data; }
                } else { curSS = 0; }
            });

            return {
                wonstrike: curWS, maxwonstrike: maxWS, maxwonstrikedate: maxWSD,
                cleanstrike: curCS, maxcleanstrike: maxCS, maxcleanstrikedate: maxCSD,
                showdownstrike: curSS, maxshowdownstrike: maxSS, maxshowdownstrikedate: maxSSD,
                played: matches.length
            };
        };

        // 4. CALCOLO RANKING E TOTALIZZAZIONE PUNTI ASSOLUTI
        let ranking = 1000;
        let totalPointsCalculated = 0;
        cronologiaMatchPiatta.forEach(m => {
            ranking += m.deltaElo;
            totalPointsCalculated += m.points; 
        });

        // 5. SALVATAGGIO E ANALISI TEAM
        const badgeGlobali = calcolaParametriBadge(cronologiaMatchPiatta, listaShowdownPartecipati);

        let bestTeamData = { name: "-", played: 0, won: 0, lose: 0, setW: 0, setL: 0, points: 0 };
        let mostUsedData = { name: "-", played: 0 };
        let maxWinsRecord = -1;
        let maxPlayedRecord = -1;

        if (playerData.teams) {
            for (const [tId, tObj] of Object.entries(playerData.teams)) {
                const bTeam = calcolaParametriBadge(cronologiaMatchPiatta, listaShowdownPartecipati, tObj.nome, 'team');
                
                const matchDelTeam = cronologiaMatchPiatta.filter(m => m.team === tObj.nome);
                const winT = matchDelTeam.filter(m => m.vittoria).length;
                const lostT = bTeam.played - winT;
                
                const sW = matchDelTeam.reduce((acc, curr) => acc + Number(curr.setW || 0), 0);
                const sL = matchDelTeam.reduce((acc, curr) => acc + Number(curr.setL || 0), 0);
                const ptsT = matchDelTeam.reduce((acc, curr) => acc + Number(curr.points || 0), 0);

                await db.ref(`players/${pId}/teams/${tId}/stats`).update({ 
                    played: bTeam.played, 
                    won: winT, 
                    lost: lostT,
                    setW: sW,
                    setL: sL,
                    points: ptsT
                });
                
                await db.ref(`players/${pId}/teams/${tId}/badges`).set(bTeam);

                if (winT > maxWinsRecord) {
                    maxWinsRecord = winT;
                    bestTeamData = { 
                        name: tObj.nome, 
                        played: bTeam.played, 
                        won: winT, 
                        lose: lostT, 
                        setW: sW, 
                        setL: sL, 
                        points: ptsT 
                    };
                }

                if (bTeam.played > maxPlayedRecord) {
                    maxPlayedRecord = bTeam.played;
                    mostUsedData = { name: tObj.nome, played: bTeam.played };
                }
            }
        }

        // --- 5B. ANALISI E CONTEGGIO TYPEUSAGE ---
        const typeUsage = {};

        cronologiaMatchPiatta.forEach(m => {
            const listaTipiDelTeam = teamTypesMap[m.team] || []; 
            const countTipiInMatch = {};
            
            listaTipiDelTeam.forEach(tipiPokemon => {
                tipiPokemon.forEach(tipo => {
                    countTipiInMatch[tipo] = (countTipiInMatch[tipo] || 0) + 1;
                });
            });

            Object.entries(countTipiInMatch).forEach(([tipo, numeroPresenze]) => {
                if (!typeUsage[tipo]) {
                    typeUsage[tipo] = { played: 0, won: 0 };
                }
                typeUsage[tipo].played += numeroPresenze;
                if (m.vittoria && numeroPresenze >= 2) {
                    typeUsage[tipo].won++;
                }
            });
        });

        // --- AGGREGAZIONE PARAMETRI PER SINGOLO FORMATO ---
        const formatsStats = {};

        cronologiaMatchPiatta.forEach(m => {
            const cat = m.categoria || "Standard";
            
            if (!formatsStats[cat]) {
                formatsStats[cat] = { 
                    played: 0, won: 0, lost: 0, setW: 0, setL: 0, points: 0,
                    showdownsPlayed: 0, showdownsWon: 0, showdownsLost: 0 
                };
            }

            formatsStats[cat].played += 1;
            formatsStats[cat].won += (m.vittoria ? 1 : 0);
            formatsStats[cat].lost += (m.vittoria ? 0 : 1);
            formatsStats[cat].setW += Number(m.setW || 0);
            formatsStats[cat].setL += Number(m.setL || 0);
            formatsStats[cat].points += Number(m.points || 0);
        });

        // Iniettiamo i conteggi degli Showdown calcolati al punto 1 nel rispettivo formato dentro formatsStats
        Object.entries(sdStatsPerFormato).forEach(([cat, sdData]) => {
            if (formatsStats[cat]) {
                formatsStats[cat].showdownsPlayed = sdData.showdownsPlayed;
                formatsStats[cat].showdownsWon = sdData.showdownsWon;
                formatsStats[cat].showdownsLost = sdData.showdownsLost;
            }
        });

        // Calcolo Pokemon Badges
        const allPokemon = [...new Set(Object.values(teamCompositionMap).flat())];
        const pkmBadges = {};
        allPokemon.forEach(pkm => {
            pkmBadges[pkm] = calcolaParametriBadge(cronologiaMatchPiatta, listaShowdownPartecipati, pkm, 'pokemon');
        });
        await db.ref(`players/${pId}/pokemon-badges`).set(pkmBadges);

        // Calcolo Best Format e caricamento dei relativi Showdown vinti/giocati/persi
        let bestFormatName = "-";
        let bestFormatWon = 0;
        let bestFormatLose = 0;
        let maxWinsF = -1;
        
        let bestFormatSDPlayed = 0;
        let bestFormatSDWon = 0;
        let bestFormatSDLost = 0;

        Object.entries(statsLeaderboard.formats).forEach(([fName, fStats]) => { 
            if (fStats.won > maxWinsF) { 
                maxWinsF = fStats.won; 
                bestFormatName = fName;
                bestFormatWon = fStats.won;
                bestFormatLose = fStats.lost;
                
                const fSD = sdStatsPerFormato[fName] || {};
                bestFormatSDPlayed = fSD.showdownsPlayed || 0;
                bestFormatSDWon = fSD.showdownsWon || 0;
                bestFormatSDLost = fSD.showdownsLost || 0;
            } 
        });

        // 6. SALVATAGGIO FINALE STATS GLOBALI
        await db.ref(`players/${pId}/stats`).update({
            'formats-stats': formatsStats, 
            'individual-stats': {
                played: statsLeaderboard.won + statsLeaderboard.lost,
                won: statsLeaderboard.won,
                lost: statsLeaderboard.lost,
                setW: statsLeaderboard.setW,
                setL: statsLeaderboard.setL,
                points: totalPointsCalculated + globalShowdownsWon,
                ranking: ranking,
                showdownsPlayed: globalShowdownsPlayed,
                showdownsWon: globalShowdownsWon,
                showdownsLost: globalShowdownsLost,
                format: { 
                    'format-name': bestFormatName,
                    'format-won': bestFormatWon,
                    'format-lose': bestFormatLose,
                    'format-showdownsPlayed': bestFormatSDPlayed,
                    'format-showdownsWon': bestFormatSDWon,
                    'format-showdownsLost': bestFormatSDLost
                }
            },
            'team-stats': {
                bestteam: bestTeamData,
                mostusedteam: mostUsedData,
                typeusage: typeUsage
            },
            'badges': badgeGlobali
        });

        console.log(`✅ Recalculation completed for ${pId} with Showdown data per format (excluding beta).`);

    } catch (err) {
        console.error("❌ Critical error in recalculation:", err);
    }
}

async function aggiornaLeaderboard(stagione) {
    try {
        // 1. Recupero dati necessari
        const showdownsSnap = await db.ref(`seasons/${stagione}/showdowns`).once('value');
        const showdowns = showdownsSnap.val() || {};
        
        const playersRegistrySnap = await db.ref(`players`).once('value');
        const playersRegistry = playersRegistrySnap.val() || {};

        const stats = {}; 

        // 2. Iteriamo attraverso ogni showdown
        Object.values(showdowns).forEach(sd => {
            const matches = sd.matches || {};
            const infoSD = sd.info || {};
            const vincitoreSerieID = infoSD.vincitoreShowdown;

            // Identifichiamo i due player dello showdown per assegnare S: W/L
            // Usiamo un Set per estrarre gli ID unici dai match di questo showdown
            const playerIdsInShowdown = new Set();

            // --- A. Processamento Match Singoli ---
            Object.values(matches).forEach(m => {
                if (m.player1Id) playerIdsInShowdown.add(m.player1Id);
                if (m.player2Id) playerIdsInShowdown.add(m.player2Id);

                const pData = [
                    { id: m.player1Id, teamNomeMatch: m.team1, score: m.p1score, oppScore: m.p2score, points: m.p1points },
                    { id: m.player2Id, teamNomeMatch: m.team2, score: m.p2score, oppScore: m.p1score, points: m.p2points }
                ];

                pData.forEach(p => {
                    if (!p.id) return;
                    
                    // Inizializzazione stats estesa con sdWon e sdLost
                    if (!stats[p.id]) {
                        stats[p.id] = { 
                            won: 0, lost: 0, setW: 0, setL: 0, points: 0,
                            sdWon: 0, sdLost: 0, // <--- NUOVI CAMPI
                            teams: {}, 
                            pkmnCounter: {}, 
                            records: {
                                mostUsedTeam: { name: "", presence: 0, won: 0, lost: 0, setW: 0, setL: 0 },
                                mostUsedPokemon: { name: "-", count: 0 },
                                mvpPokemon: { name: "-", wins: 0, played: 0, lose: 0, setW: 0, setL: 0 }
                            }
                        };
                    }

                    const s = stats[p.id];
                    const isWinner = p.score > p.oppScore;

                    s.won += isWinner ? 1 : 0;
                    s.lost += isWinner ? 0 : 1;
                    s.setW += (p.score || 0);
                    s.setL += (p.oppScore || 0);
                    s.points += (p.points || 0);

                    // Stats Team e Pokemon (Logica invariata)
                    const tNome = p.teamNomeMatch;
                    if (tNome) {
                        if (!s.teams[tNome]) s.teams[tNome] = { played: 0, won: 0, lost: 0, setW: 0, setL: 0 };
                        const st = s.teams[tNome];
                        st.played += 1;
                        st.won += isWinner ? 1 : 0;
                        st.lost += isWinner ? 0 : 1;
                        st.setW += (p.score || 0);
                        st.setL += (p.oppScore || 0);
                    }

                    const playerEntry = playersRegistry[p.id];
                    if (playerEntry && playerEntry.teams && tNome) {
                        const teamTrovato = Object.values(playerEntry.teams).find(t => t.nome === tNome);
                        if (teamTrovato && teamTrovato.pokemon) {
                            const nomiUnici = new Set();
                            Object.values(teamTrovato.pokemon).forEach(pObj => {
                                if (pObj && pObj.nome) nomiUnici.add(pObj.nome);
                            });
                            nomiUnici.forEach(nPkmn => {
                                if (!s.pkmnCounter[nPkmn]) s.pkmnCounter[nPkmn] = { count: 0, wins: 0, setW: 0, setL: 0 };
                                s.pkmnCounter[nPkmn].count += 1;
                                if (isWinner) s.pkmnCounter[nPkmn].wins += 1;
                                s.pkmnCounter[nPkmn].setW += (p.score || 0);
                                s.pkmnCounter[nPkmn].setL += (p.oppScore || 0);
                            });
                        }
                    }
                });
            });

            // --- B. Assegnazione S: W/L (Showdown Vinti/Persi) ---
            if (vincitoreSerieID && playerIdsInShowdown.has(vincitoreSerieID)) {
                // Chi ha vinto lo showdown
                if (stats[vincitoreSerieID]) {
                    stats[vincitoreSerieID].points += 1; // Punto bonus
                    stats[vincitoreSerieID].sdWon += 1;  // Vittoria Showdown
                }

                // Chi ha perso lo showdown
                playerIdsInShowdown.forEach(pid => {
                    if (pid !== vincitoreSerieID && stats[pid]) {
                        stats[pid].sdLost += 1; // Sconfitta Showdown
                    }
                });
            }
        });

        // 3. Elaborazione Record Finali (Invariata)
        for (const pid in stats) {
            const s = stats[pid];
            const getWinRate = (w, tot) => tot > 0 ? (w / tot) : 0;

            let bestT = { name: "", presence: -1, winRate: -1 };
            for (const [tn, td] of Object.entries(s.teams)) {
                const wr = getWinRate(td.won, td.played);
                if (td.played > bestT.presence || (td.played === bestT.presence && wr > bestT.winRate)) {
                    bestT = { name: tn, presence: td.played, winRate: wr };
                }
            }
            if (bestT.name) {
                const b = s.teams[bestT.name];
                s.records.mostUsedTeam = { name: bestT.name, presence: b.played, won: b.won, lost: b.lost, setW: b.setW, setL: b.setL };
            }

            let topPk = { name: "-", count: -1, winRate: -1 };
            let topMv = { name: "-", wins: -1, winRate: -1, data: null, setRate: -1 };
            for (const [pkName, pkData] of Object.entries(s.pkmnCounter)) {
                const wr = getWinRate(pkData.wins, pkData.count);
                const sr = getWinRate(pkData.setW, (pkData.setW + pkData.setL));
                if (pkData.count > topPk.count || (pkData.count === topPk.count && wr > topPk.winRate)) {
                    topPk = { name: pkName, count: pkData.count, winRate: wr };
                }
                if (pkData.wins > topMv.wins || (pkData.wins === topMv.wins && wr > topMv.winRate) || (pkData.wins === topMv.wins && wr === topMv.winRate && sr > topMv.setRate)) {
                    topMv = { name: pkName, wins: pkData.wins, winRate: wr, setRate: sr, data: pkData };
                }
            }
            s.records.mostUsedPokemon = { name: topPk.name, count: topPk.count };
            if (topMv.data) {
                s.records.mvpPokemon = { 
                    name: topMv.name, wins: topMv.wins, played: topMv.data.count,
                    lose: topMv.data.count - topMv.data.wins, setW: topMv.data.setW, setL: topMv.data.setL
                };
            }
            delete s.pkmnCounter; 
        }

        // 4. Salvataggio finale
        await db.ref(`seasons/${stagione}/leaderboard`).set(stats);
        console.log(`Leaderboard aggiornata con Bonus e SD W/L per: ${stagione}`);

    } catch (e) {
        console.error("Error recalculation leaderboard:", e);
    }
}