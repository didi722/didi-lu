// =====================================================
// POOL DEL FORMATO
// Dato il regolamento di un formato (formats.html), dice quali Pokémon ci si possono giocare:
// generazione ("within" = solo il Pokédex di quella generazione, "up_to" = fino a quella), tier
// massima, singolo o doppio, restrizioni biologiche (tipo, statistiche, leggendari, iniziale...).
//
// È la stessa logica del Team Builder di box.html (lo stesso file la usa, non ne esistono due
// copie): la lista che vede il giocatore e quella da cui pesca la CPU sono per forza identiche,
// e un formato creato domani funziona senza toccare nulla.
//
// Nessun riferimento al DOM né a Firebase: i dati arrivano da fuori.
//   calcolaPool(regolamento, dati, { inizialeNome })   dati già caricati  -> { tipoLayout, pokemon }
//   fileNecessari(regolamento)                          quali JSON servono
//   caricaPool(regolamento, caricaJson, opzioni)        li carica con la funzione data e calcola
// dove dati = { gens: { 1: {...}, ... }, natdex: {...}, pokedexBase: { nome minuscolo: {...} } }
//
// Funziona nel browser (window.FormatoPool) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.FormatoPool = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CHIAVI_BIOLOGICHE_VALIDE = [
        'is_legendary', 'is_mythical', 'height', 'weight', 'bst',
        'types', 'highest_stat', 'num', 'type', 'color', 'egg_group',
        'hp', 'attack', 'defense', 'sp. attack', 'sp. defense', 'speed', 'shape',
        'base_friendship', 'habitat', 'name_length', 'name_starts',
        'evolutions_count', 'evolution_stage'
    ];
    const OPERATORI_VALIDI = ['lt', 'gt', 'lte', 'gte', 'equals', 'neq', 'between', 'starts_with', 'prefix'];

    const GERARCHIA_TIER = {
        "": 0, "ILLEGAL": 0, "PAST": 0, "UNTIERED": 1, "LC": 2, "NFE": 3,
        "ZU": 4, "ZUBL": 5, "PU": 6, "PUBL": 7, "NU": 8, "NUBL": 9,
        "RU": 10, "RUBL": 11, "UU": 12, "UUBL": 13, "OU": 14,
        "STANDARD": 15, "UBER": 15, "UBERS": 15, "AG": 16
    };

    const TIER_ESCLUSE = {
        "AG": [],
        "STANDARD": ["AG"],
        "UBER": ["AG"],
        "UBERS": ["AG"],
        "OU": ["AG", "UBER", "UBERS"],
        "UU": ["AG", "UBER", "UBERS", "OU", "UUBL"],
        "RU": ["AG", "UBER", "UBERS", "OU", "UUBL", "UU", "RUBL"],
        "NU": ["AG", "UBER", "UBERS", "OU", "UUBL", "UU", "RUBL", "RU", "NUBL"],
        "PU": ["AG", "UBER", "UBERS", "OU", "UUBL", "UU", "RUBL", "RU", "NUBL", "NU", "PUBL"],
        "ZU": ["AG", "UBER", "UBERS", "OU", "UUBL", "UU", "RUBL", "RU", "NUBL", "NU", "PUBL", "PU", "ZUBL"]
    };

    // Il file con i dati dei Pokémon usa alcune chiavi con refusi: si leggono sotto il nome giusto
    function normalizzaChiaveDatabase(chiave) {
        const mappa = { 'name_lenght': 'name_length', 'base_frienship': 'base_friendship' };
        return mappa[chiave] || chiave;
    }

    // ---------- nomi e forme ----------
    function calcolaSpriteId(id) {
        const idLower = id.toLowerCase().trim();
        if (idLower.includes('-')) return idLower;
        const prefissiConTrattino = ['rotom', 'shaymin', 'kyurem', 'lycanroc', 'necrozma'];
        for (const pref of prefissiConTrattino) {
            if (idLower.startsWith(pref) && idLower !== pref) return pref + '-' + idLower.substring(pref.length);
        }
        const suffissiRegionali = ['alola', 'galar', 'hisui', 'paldea'];
        for (const suf of suffissiRegionali) {
            if (idLower.endsWith(suf) && idLower !== suf) return idLower.slice(0, -suf.length) + '-' + suf;
        }
        return idLower;
    }

    function determinaRadice(id, spriteId) {
        const idLower = id.toLowerCase().trim();
        const spriteLower = spriteId.toLowerCase().trim();
        if (idLower.includes('-')) return idLower.split('-')[0];
        if (spriteLower.includes('-')) return spriteLower.split('-')[0];
        return idLower;
    }

    // ---------- tier ----------
    function ottieniTierDaOggetto(dato, proprietaDinamica, baseTier) {
        if (!dato) return "";
        if (typeof dato === 'string') return dato.toUpperCase().trim();

        const isTargetLC = baseTier && baseTier.toUpperCase().trim() === "LC";

        if (isTargetLC) {
            const singleTier = dato.single_tier ? String(dato.single_tier).toUpperCase().trim() : "";
            const doublesTier = dato.doubles_tier ? String(dato.doubles_tier).toUpperCase().trim() : "";
            if (singleTier === "LC" || doublesTier === "LC") return "LC";
        }

        const tier = dato[proprietaDinamica] || "";
        return String(tier).toUpperCase().trim();
    }

    function ottieniTierMaggiore(tierA, tierB) {
        const tA = tierA ? tierA.toUpperCase().trim() : "";
        const tB = tierB ? tierB.toUpperCase().trim() : "";
        return (GERARCHIA_TIER[tA] || 0) >= (GERARCHIA_TIER[tB] || 0) ? tA : tB;
    }

    function controllaTierAmmessa(pkmTier, baseTier) {
        if (!baseTier) return true;
        const target = baseTier.toUpperCase().trim();
        const current = pkmTier ? pkmTier.toUpperCase().trim() : "";
        if (target === "LC") return current === "LC";
        if (target === "NFE") return current === "NFE";
        if (TIER_ESCLUSE[target] !== undefined) return !TIER_ESCLUSE[target].includes(current);
        return true;
    }

    // ---------- confronti delle restrizioni ----------
    function valutaOperatore(valoreJson, operatore, regola) {
        const op = operatore.toLowerCase().trim();

        if (Array.isArray(valoreJson)) {
            const arrLower = valoreJson.map(v => String(v).toLowerCase().trim());
            const target = String(regola.value || '').toLowerCase().trim();
            switch (op) {
                case 'equals':
                case 'contains':
                    return arrLower.includes(target);
                case 'neq':
                    return !arrLower.includes(target);
                default:
                    return true;
            }
        }

        if (op === 'between') {
            const vMin = parseFloat(regola.min);
            const vMax = parseFloat(regola.max);
            if (isNaN(vMin) || isNaN(vMax)) return true;
            return parseFloat(valoreJson) >= vMin && parseFloat(valoreJson) <= vMax;
        }

        if (['lt', 'gt', 'lte', 'gte'].includes(op)) {
            const vFire = parseFloat(regola.value);
            const vJson = parseFloat(valoreJson);
            if (isNaN(vFire) || isNaN(vJson)) return true;
            switch (op) {
                case 'lt': return vJson < vFire;
                case 'gt': return vJson > vFire;
                case 'lte': return vJson <= vFire;
                case 'gte': return vJson >= vFire;
            }
        }

        const strJson = String(valoreJson).toLowerCase().trim();
        const strFire = String(regola.value || '').toLowerCase().trim();
        switch (op) {
            case 'equals': return strJson === strFire;
            case 'neq': return strJson !== strFire;
            case 'prefix':
            case 'starts_with': return strJson.startsWith(strFire);
            default: return true;
        }
    }

    // Quali file JSON servono per calcolare il pool di un regolamento
    function fileNecessari(regolamento) {
        const genLimite = parseInt(regolamento.genRuleValue);
        const gens = [];
        if (regolamento.genRuleType === 'up_to') for (let i = 1; i <= genLimite; i++) gens.push(i);
        else if (regolamento.genRuleType === 'within') gens.push(genLimite);
        return { gens, natdex: regolamento.genRuleType === 'up_to', pokedexBase: true };
    }

    // =================================================
    // IL POOL
    // =================================================
    function calcolaPool(regolamento, dati, opzioni) {
        dati = dati || {};
        const gens = dati.gens || {};
        const natdexTiers = dati.natdex || {};
        const pokedexBase = dati.pokedexBase || null;
        const genLimite = parseInt(regolamento.genRuleValue);
        const poolFiltrato = [];
        let contatoreOrdine = 0;

        const restrizioniPokemon = regolamento.restrizioni && regolamento.restrizioni.pokemon;

        // Iniziale del nome (o del cognome) del giocatore, per i formati "name_starts"
        let inizialeNomeUtente = "";
        const regolaNameStarts = restrizioniPokemon && restrizioniPokemon.name_starts;
        if (regolaNameStarts) {
            if (regolaNameStarts.mode === "PLAYER_INITIAL") {
                inizialeNomeUtente = String((opzioni && opzioni.inizialeNome) || '').trim().charAt(0).toLowerCase();
            } else if (regolaNameStarts.value) {
                inizialeNomeUtente = String(regolaNameStarts.value).trim().charAt(0).toLowerCase();
            }
        }

        const proprietaTierDinamica = regolamento.battleStyle === "doubles" ? "doubles_tier" : "single_tier";
        // Anything Goose: nessun limite di tier (come nella validazione del Box, che salta il controllo del tier): ci sono anche gli AG
        const senzaLimiteDiTier = String(regolamento.strutturaSito || '').toLowerCase().trim() === 'anything_goes';
        const tierAmmessa = tier => senzaLimiteDiTier || controllaTierAmmessa(tier, regolamento.baseTier);

        function controllaRestrizioniBiologiche(nomeChiave) {
            if (!pokedexBase) return true;

            const ruleLegendary = restrizioniPokemon && restrizioniPokemon.is_legendary;
            const ruleMythical = restrizioniPokemon && restrizioniPokemon.is_mythical;

            const valLegendary = ruleLegendary && ruleLegendary.value ? String(ruleLegendary.value).toLowerCase().trim() : '';
            const valMythical = ruleMythical && ruleMythical.value ? String(ruleMythical.value).toLowerCase().trim() : '';

            const onlyLegendaryActive = valLegendary === "only" || valLegendary === "only legendary";
            const onlyMythicalActive = valMythical === "only" || valMythical === "only mythical";

            let haFiltriAttivi = onlyLegendaryActive || onlyMythicalActive || (regolamento.strutturaSito === "custom");

            if (restrizioniPokemon) {
                for (const chiave in restrizioniPokemon) {
                    if (!CHIAVI_BIOLOGICHE_VALIDE.includes(chiave)) continue;
                    const r = restrizioniPokemon[chiave];
                    if (r) {
                        if (r.mode === "PLAYER_INITIAL" || r.value || r.operator || chiave === 'name_starts') haFiltriAttivi = true;
                        if (r.operator && r.mode !== "SAME_ACROSS_TEAM") {
                            const op = r.operator.toLowerCase().trim();
                            if (OPERATORI_VALIDI.includes(op)) haFiltriAttivi = true;
                        }
                    }
                }
            }

            if (!haFiltriAttivi) return true;

            let pkmDettaglio = pokedexBase[nomeChiave.toLowerCase().trim()];
            if (!pkmDettaglio) {
                const spriteId = calcolaSpriteId(nomeChiave);
                const radice = determinaRadice(nomeChiave, spriteId);
                pkmDettaglio = pokedexBase[radice.toLowerCase().trim()];
            }

            if (!pkmDettaglio) return false;

            const isPkmLegendary = pkmDettaglio.is_legendary === true || pkmDettaglio.is_legendary === 1 || String(pkmDettaglio.is_legendary).trim() === "true";
            const isPkmMythical = pkmDettaglio.is_mythical === true || pkmDettaglio.is_mythical === 1 || String(pkmDettaglio.is_mythical).trim() === "true";

            if (regolamento.strutturaSito === "custom") {
                const ammessoLegendary = valLegendary === "allowed" || valLegendary === "only" || valLegendary === "only legendary";
                const ammessoMythical = valMythical === "allowed" || valMythical === "only" || valMythical === "only mythical";

                if (isPkmLegendary && !ammessoLegendary) return false;
                if (isPkmMythical && !ammessoMythical) return false;
            }

            if (onlyLegendaryActive || onlyMythicalActive) {
                if (onlyLegendaryActive && onlyMythicalActive) {
                    if (!isPkmLegendary && !isPkmMythical) return false;
                } else if (onlyLegendaryActive) {
                    if (!isPkmLegendary) return false;
                } else if (onlyMythicalActive) {
                    if (!isPkmMythical) return false;
                }
            }

            if (restrizioniPokemon) {
                for (const chiaveRestrizione in restrizioniPokemon) {
                    if (!CHIAVI_BIOLOGICHE_VALIDE.includes(chiaveRestrizione)) continue;
                    if (chiaveRestrizione === 'is_legendary' || chiaveRestrizione === 'is_mythical') continue;

                    const regola = restrizioniPokemon[chiaveRestrizione];
                    if (!regola) continue;

                    // Iniziale del nome del Pokémon (valore fisso o iniziale del giocatore)
                    if (chiaveRestrizione === 'name_starts') {
                        let letteraTarget = "";
                        if (regola.mode === "PLAYER_INITIAL") {
                            letteraTarget = inizialeNomeUtente;
                        } else if (regola.value) {
                            letteraTarget = String(regola.value).toLowerCase().trim();
                        }

                        if (!letteraTarget) return false;

                        const nomePkm = (pkmDettaglio.name || nomeChiave).toLowerCase().trim();
                        if (!nomePkm.startsWith(letteraTarget)) return false;
                        continue;
                    }

                    if (!regola.operator || regola.mode === "SAME_ACROSS_TEAM") continue;

                    const op = regola.operator.toLowerCase().trim();
                    if (!OPERATORI_VALIDI.includes(op)) continue;

                    if (chiaveRestrizione === 'evolution_stage' && String(regola.value).toLowerCase().trim() === 'only') {
                        let evCount = pkmDettaglio['evolutions_count'];
                        if (evCount === undefined && pkmDettaglio.stats) evCount = pkmDettaglio.stats['evolutions_count'];

                        let evStage = pkmDettaglio['evolution_stage'];
                        if (evStage === undefined && pkmDettaglio.stats) evStage = pkmDettaglio.stats['evolution_stage'];

                        if (Number(evCount) !== 1 || Number(evStage) !== 1) return false;
                        continue;
                    }

                    const chiaveProprietareale = normalizzaChiaveDatabase(chiaveRestrizione) || chiaveRestrizione;

                    let valoreJson = pkmDettaglio[chiaveProprietareale];
                    if (valoreJson === undefined && pkmDettaglio.stats) {
                        valoreJson = pkmDettaglio.stats[chiaveProprietareale];
                    }

                    if (valoreJson === undefined && chiaveProprietareale.includes('.')) {
                        valoreJson = chiaveProprietareale.split('.').reduce((obj, key) => obj && obj[key], pkmDettaglio);
                    }

                    if (valoreJson === undefined || valoreJson === null) continue;

                    if (chiaveProprietareale === 'height') valoreJson = valoreJson * 100;

                    if (!valutaOperatore(valoreJson, op, regola)) return false;
                }
            }

            return true;
        }

        function escludeFormeInvalide(id) {
            const idLower = id.toLowerCase().trim();

            if (idLower.includes('gmax') || idLower === 'pichuspikyeared' || idLower.includes('-partner')) return false;
            if (idLower.includes('-cap-') || (idLower.startsWith('cap-') && idLower !== 'capsakid')) return false;

            const isMega = idLower.endsWith('-mega') || idLower.endsWith('-megax') || idLower.endsWith('-megay');
            const isFalsoMega = idLower === 'meganium' || idLower === 'yanmega';
            if (isMega && !isFalsoMega) {
                const rawValue = regolamento.restrizioni && regolamento.restrizioni.pokemon && regolamento.restrizioni.pokemon.is_mega
                    ? regolamento.restrizioni.pokemon.is_mega.value : undefined;
                return [true, "true", "yes", "allowed"].includes(String(rawValue).toLowerCase().trim());
            }

            return true;
        }

        function aggiungi(nomeChiave, datoGrezzo) {
            const nomeVisualizzato = datoGrezzo.name || (nomeChiave.charAt(0).toUpperCase() + nomeChiave.slice(1));
            const spriteId = calcolaSpriteId(nomeChiave);
            const radice = determinaRadice(nomeChiave, spriteId);

            poolFiltrato.push({
                id: nomeChiave,
                name: nomeVisualizzato,
                spriteId: spriteId,
                radice: radice,
                num: datoGrezzo.num || null,
                ordineIniziale: contatoreOrdine++,
                stats: datoGrezzo.stats || null,
                type: datoGrezzo.type || datoGrezzo.types || [],
                abilities: datoGrezzo.abilities || []
            });
        }

        if (regolamento.genRuleType === "up_to") {
            const tuttiIKnots = {};
            const genLimiteJson = {};

            for (let i = 1; i <= genLimite; i++) {
                const jsonGen = gens[i];
                if (!jsonGen) continue;
                Object.keys(jsonGen).forEach(key => {
                    const lowKey = key.toLowerCase().trim();
                    if (!tuttiIKnots[lowKey]) {
                        tuttiIKnots[lowKey] = Object.assign({ originalKey: key }, jsonGen[key]);
                    } else {
                        tuttiIKnots[lowKey] = Object.assign({}, tuttiIKnots[lowKey], jsonGen[key]);
                    }

                    if (i === genLimite) genLimiteJson[lowKey] = jsonGen[key];
                });
            }

            Object.keys(tuttiIKnots).forEach(lowKey => {
                const nomeChiave = tuttiIKnots[lowKey].originalKey;
                if (!escludeFormeInvalide(nomeChiave)) return;

                const datoGenX = genLimiteJson[lowKey];
                const tierGenX = ottieniTierDaOggetto(datoGenX, proprietaTierDinamica, regolamento.baseTier);

                let tierFinale = tierGenX;

                if (!tierFinale || tierFinale === "PAST" || tierFinale === "ILLEGAL") {
                    const datoNatDex = natdexTiers[lowKey];
                    let tierNatDex = ottieniTierDaOggetto(datoNatDex, proprietaTierDinamica, regolamento.baseTier);

                    const isMegaReale = (nomeChiave.toLowerCase().endsWith('-mega') ||
                        nomeChiave.toLowerCase().endsWith('-megax') ||
                        nomeChiave.toLowerCase().endsWith('-megay'));

                    if (isMegaReale && (tierNatDex === "ILLEGAL" || !tierNatDex)) {
                        const baseKey = nomeChiave.toLowerCase().replace(/-mega[xy]?$/, '').trim();
                        const datoBaseNatDex = natdexTiers[baseKey];
                        tierNatDex = ottieniTierDaOggetto(datoBaseNatDex, proprietaTierDinamica, regolamento.baseTier);
                    }

                    tierFinale = tierNatDex;
                }

                if (!tierFinale || tierFinale === "ILLEGAL" || tierFinale === "PAST") return;

                if (!tierAmmessa(tierFinale)) return;
                if (!controllaRestrizioniBiologiche(nomeChiave)) return;

                aggiungi(nomeChiave, tuttiIKnots[lowKey]);
            });
        } else if (regolamento.genRuleType === "within") {
            const jsonDati = gens[genLimite] || {};
            Object.keys(jsonDati).forEach(nomeChiave => {
                if (!escludeFormeInvalide(nomeChiave)) return;
                const datoGrezzo = jsonDati[nomeChiave];
                if (!datoGrezzo) return;

                let tierUpper = ottieniTierDaOggetto(datoGrezzo, proprietaTierDinamica, regolamento.baseTier);

                if (nomeChiave.toLowerCase().includes('-mega')) {
                    const baseKey = nomeChiave.toLowerCase().split('-mega')[0];
                    const datoBase = jsonDati[baseKey];
                    const tierBase = ottieniTierDaOggetto(datoBase, proprietaTierDinamica, regolamento.baseTier);
                    tierUpper = ottieniTierMaggiore(tierUpper, tierBase);
                }

                if (tierUpper === "ILLEGAL" || tierUpper === "PAST") return;
                if (!tierAmmessa(tierUpper)) return;
                if (!controllaRestrizioniBiologiche(nomeChiave)) return;

                aggiungi(nomeChiave, datoGrezzo);
            });
        }

        // Ordine del Pokédex: le forme di una stessa specie restano vicine
        const mappaAncoraggioRadici = {};
        poolFiltrato.forEach(pkm => {
            if (!mappaAncoraggioRadici[pkm.radice]) {
                mappaAncoraggioRadici[pkm.radice] = { num: pkm.num, ordineIniziale: pkm.ordineIniziale };
            } else {
                if (!mappaAncoraggioRadici[pkm.radice].num && pkm.num) mappaAncoraggioRadici[pkm.radice].num = pkm.num;
                if (pkm.ordineIniziale < mappaAncoraggioRadici[pkm.radice].ordineIniziale) mappaAncoraggioRadici[pkm.radice].ordineIniziale = pkm.ordineIniziale;
            }
        });

        poolFiltrato.sort((a, b) => {
            if (a.radice === b.radice) return a.ordineIniziale - b.ordineIniziale;
            const ancoraA = mappaAncoraggioRadici[a.radice];
            const ancoraB = mappaAncoraggioRadici[b.radice];
            if (ancoraA.num && ancoraB.num) return ancoraA.num - ancoraB.num;
            return ancoraA.ordineIniziale - ancoraB.ordineIniziale;
        });

        return { tipoLayout: "FLAT", pokemon: poolFiltrato };
    }

    // Carica i file che servono con caricaJson(percorso) -> Promise<oggetto> e calcola il pool.
    // pokedexBase (chiavi minuscole) si può passare già pronto per non scaricarlo di nuovo.
    // opzioni.cache: { percorso: json } già in mano al chiamante (non si riscarica)
    async function caricaPool(regolamento, caricaJson, opzioni) {
        opzioni = opzioni || {};
        const cache = opzioni.cache || {};
        const leggi = percorso => cache[percorso] ? Promise.resolve(cache[percorso]) : caricaJson(percorso);
        const serve = fileNecessari(regolamento);
        const dati = { gens: {}, natdex: {}, pokedexBase: opzioni.pokedexBase || null };

        const lavori = [];
        if (serve.natdex) lavori.push(leggi('pkm-gens/natdex-tiers.json').then(j => { dati.natdex = j; }, () => { }));
        serve.gens.forEach(i => lavori.push(leggi(`pkm-gens/gen${i}.json`).then(j => { dati.gens[i] = j; }, () => { })));
        if (!dati.pokedexBase) {
            lavori.push(leggi('pkm-gens/pokedex_base.json').then(grezzo => {
                dati.pokedexBase = minuscole(grezzo);
            }, () => { }));
        }
        await Promise.all(lavori);
        return calcolaPool(regolamento, dati, opzioni);
    }

    function minuscole(grezzo) {
        const out = {};
        Object.keys(grezzo || {}).forEach(k => { out[k.toLowerCase().trim()] = grezzo[k]; });
        return out;
    }

    // ---------- "tutti i Pokémon con lo stesso ..." ----------
    // Le restrizioni "SAME_ACROSS_TEAM" non filtrano il pool: chi compone il team sceglie un valore
    // (un colore, un tipo...) e il pool si restringe ai Pokémon che lo hanno.
    function chiaviSameAcross(regolamento) {
        const out = [];
        const r = regolamento.restrizioni && regolamento.restrizioni.pokemon;
        if (!r) return out;
        for (const chiave in r) {
            const x = r[chiave];
            if (x && (x.mode === "SAME_ACROSS_TEAM" || x.value === "SAME_ACROSS_TEAM" || x.operator === "SAME_ACROSS_TEAM")) out.push(chiave);
        }
        return out;
    }

    // Valore di una caratteristica per un Pokémon, come lo mostra il Team Builder (altezza in cm)
    function valoreCaratteristica(pokedexBase, id, chiave) {
        const dettagli = pokedexBase && pokedexBase[String(id).toLowerCase().trim()];
        if (!dettagli) return undefined;
        const reale = normalizzaChiaveDatabase(chiave) || chiave;
        let val = dettagli[reale];
        if (val === undefined && dettagli.stats) val = dettagli.stats[reale];
        if (val !== undefined && reale === 'height') val = Math.round(val * 100);
        return val;
    }

    function corrispondeAllaScelta(pokedexBase, pkm, chiave, scelta) {
        const val = valoreCaratteristica(pokedexBase, pkm.id, chiave);
        if (val === undefined) return false;
        if (Array.isArray(val)) return val.map(v => String(v).toLowerCase().trim()).includes(String(scelta).toLowerCase().trim());
        if (typeof val === 'number') return Math.abs(parseFloat(val) - parseFloat(scelta)) < 0.001;
        return String(val).toLowerCase().trim() === String(scelta).toLowerCase().trim();
    }

    // Come chiaviSameAcross, ma restituisce il pool "di base" senza quelle restrizioni
    function senzaSameAcross(regolamento) {
        const copia = JSON.parse(JSON.stringify(regolamento));
        chiaviSameAcross(regolamento).forEach(c => { delete copia.restrizioni.pokemon[c]; });
        return copia;
    }

    // Quanti Pokémon del pool hanno ciascun valore della caratteristica (per scegliere quale usare)
    function valoriPossibili(pokedexBase, pool, chiave) {
        const conteggio = {};
        pool.forEach(pkm => {
            const val = valoreCaratteristica(pokedexBase, pkm.id, chiave);
            if (val === undefined) return;
            (Array.isArray(val) ? val : [val]).forEach(item => {
                const k = String(item).trim();
                conteggio[k] = (conteggio[k] || 0) + 1;
            });
        });
        return conteggio;
    }

    return {
        calcolaPool, caricaPool, fileNecessari, minuscole, normalizzaChiaveDatabase,
        chiaviSameAcross, senzaSameAcross, valoreCaratteristica, corrispondeAllaScelta, valoriPossibili,
        calcolaSpriteId, determinaRadice
    };
});
