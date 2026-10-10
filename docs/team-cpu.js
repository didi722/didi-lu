// =====================================================
// TEAM DELLA CPU
// Compone da sola una dozzina di team sensati per un formato, partendo dal suo pool di Pokémon
// (formato-pool.js) e dalle sue regole. Niente liste scritte a mano: un formato nuovo funziona subito.
//
//   1. Dal pool si tengono i Pokémon più forti del formato (tier e statistiche) più qualche scelta fuori moda.
//   2. Per ognuno si leggono le mosse che può imparare nella generazione del formato, si scartano
//      quelle bandite o che la CPU non sa usare (cpu-conoscenza.js) e si classificano.
//   3. Ogni team parte da un "asso" e si completa un Pokémon alla volta scegliendo quello che migliora
//      di più la squadra: copertura dei tipi in attacco, debolezze in difesa, ruoli (controllo della
//      velocità, Fake Out, deviatori, trappole, recupero), accoppiate meteo, velocità. Ogni team ha un
//      "piano" diverso (Tailwind, Camerone, pioggia, sole, sabbia, neve, equilibrato, offensivo...).
//   4. Ai Pokémon scelti si dà un set: abilità, strumento (mai due uguali), natura, EV e quattro mosse.
//      Ogni mossa è controllata dal validatore del simulatore. Le scelte di ruolo (chi mette Tailwind, chi ha Fake Out...) vengono
//      prima; per il resto si preferiscono mosse, strumento e abilità che di solito si giocano su quel Pokémon (i consigli di
//      consigli.js, gli stessi che il Team Builder mette in cima alle liste), sempre dentro ciò che la CPU sa usare.
//
// Tutto è deterministico: stesso formato e stesso seme, stessi team. Mai due team troppo simili,
// e nessun Pokémon in più di un terzo dei team.
// Rispetta le regole del sito: Species Clause, Item Clause, livello, Uber limit del formato STANDARD,
// mosse e abilità bandite, restrizioni su mosse/strumenti/natura e "stesso ... per tutto il team".
// Anything Goose (nessuna clausola): niente limite di tier (ci sono anche gli AG), Pokémon e strumenti si possono doppiare
// (due Calyrex-Shadow vanno bene) e i team sono molto offensivi, con solo un po' di strategia (Tailwind, meteo, Stanza Magica).
//
// Il Dex di @pkmn/sim arriva da fuori. Funziona nel browser (window.TeamCpu) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./cpu-conoscenza.js'), require('./formato-pool.js'), require('./consigli.js'));
    else radice.TeamCpu = fabbrica(radice.CpuConoscenza, radice.FormatoPool, radice.Consigli);
})(typeof self !== 'undefined' ? self : this, function (K, Pool, Consigli) {
    'use strict';

    const id = K.id;

    // =================================================
    // UTILITÀ
    // =================================================
    function hashStringa(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function creaCasuale(seme) {
        let a = hashStringa(String(seme)) || 1;
        return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Stesse regole di team-sito.js (generazioneFormato, livelloFormato, formatoSimulatore): un test le confronta
    function generazioneFormato(regolamento) {
        return parseInt(regolamento.genRuleValue, 10) ||
            parseInt(String(regolamento.vgcGen || '').replace(/\D/g, ''), 10) || 9;
    }
    function livelloFormato(regolamento) {
        const struttura = String(regolamento.strutturaSito || 'custom').toLowerCase().trim();
        if (struttura === 'vgc') return 50;
        return String(regolamento.baseTier || '').toUpperCase() === 'LC' ? 5 : 100;
    }
    function formatoInDoppio(regolamento) {
        const struttura = String(regolamento.strutturaSito || 'custom').toLowerCase().trim();
        let doppio = struttura === 'vgc'
            ? !String(regolamento.vgcFormat || 'doubles').toLowerCase().startsWith('singles')
            : regolamento.battleStyle === 'doubles';
        if (generazioneFormato(regolamento) < 3) doppio = false;
        return doppio;
    }
    function meccaniche(regolamento) { return regolamento.generationalMechanics === true; }

    function contestoDa(regolamento) {
        return {
            gen: generazioneFormato(regolamento),
            livello: livelloFormato(regolamento),
            doppio: formatoInDoppio(regolamento),
            meccaniche: meccaniche(regolamento),
            struttura: String(regolamento.strutturaSito || 'custom').toLowerCase().trim(),
            baseTier: String(regolamento.baseTier || '').toUpperCase(),
            // Anything Goose: nessuna clausola e nessun limite di tier. Si può doppiare Pokémon e strumenti (due Calyrex-Shadow vanno bene)
            goose: String(regolamento.strutturaSito || '').toLowerCase().trim() === 'anything_goes',
            // le regole del tier STANDARD (al massimo 2 Uber, niente mitici) non valgono in Anything Goose
            standard: String(regolamento.baseTier || '').toUpperCase() === 'STANDARD' && String(regolamento.strutturaSito || '').toLowerCase().trim() !== 'anything_goes'
        };
    }

    // ---------- ban list e restrizioni ----------
    // Come voceBannata di box.html: "Hidden Power [Fire]" è bandita anche se in lista c'è solo "Hidden Power"
    function voceBannata(restrizioni, categoria, nome) {
        const lista = restrizioni && restrizioni[categoria] && restrizioni[categoria].banned_list;
        if (!lista || lista.mode !== 'BANLIST' || !lista.value || !nome) return false;
        const k = id(nome);
        const presente = x => Object.prototype.hasOwnProperty.call(lista.value, x);
        return presente(k) || (k.startsWith('hiddenpower') && presente('hiddenpower'));
    }

    function confrontaOperatore(valore, regola) {
        let target = regola.value;
        if (target === 'true') target = true;
        if (target === 'false') target = false;
        if (valore === 'true') valore = true;
        if (valore === 'false') valore = false;
        if (Array.isArray(valore) && regola.operator === 'equals') return valore.includes(target);
        switch (regola.operator) {
            case 'lt': return valore < target;
            case 'gt': return valore > target;
            case 'lte': return valore <= target;
            case 'gte': return valore >= target;
            case 'between': return valore >= regola.min && valore <= regola.max;
            default: return valore === target;
        }
    }

    // Una mossa rispetta le restrizioni "mosse" del formato? (stessi campi che box.html legge da PokeAPI)
    function mossaAmmessa(dex, m, restrizioni) {
        const r = restrizioni && restrizioni.mosse;
        if (!r) return true;
        if (voceBannata(restrizioni, 'mosse', m.nome)) return false;
        const mossa = dex.moves.get(m.id);
        const campi = {
            power: m.potenza, category: m.categoria, type: m.tipo, max_pp: Math.floor((mossa.pp || 0) * 8 / 5), accuracy: m.precisione,
            priority: m.priorita, is_protect: m.protezione, is_contact: !!m.flags.contact, sound_based: !!m.flags.sound,
            punch: !!m.flags.punch, healing: m.recupero
        };
        for (const campo of Object.keys(r)) {
            const regola = r[campo];
            if (campo === 'banned_list' || !regola || regola.mode !== 'SPECIFIC' || !(campo in campi)) continue;
            if (!confrontaOperatore(campi[campo], regola)) return false;
        }
        return true;
    }

    // Dati di uno strumento come li legge box.html dalla PokeAPI
    function datiStrumento(item) {
        const k = item.id;
        return {
            is_berry: !!item.isBerry,
            is_consumable: !!(item.isBerry || item.isGem || /herb$/.test(k) || ['focussash', 'weaknesspolicy', 'airballoon', 'redcard', 'ejectbutton', 'ejectpack', 'whiteherb', 'mentalherb', 'powerherb', 'throatspray', 'blunderpolicy', 'roomservice', 'adrenalineorb', 'abilityshield'].includes(k)),
            is_healing: !!(item.isBerry && /restor|heal|recover/i.test(item.desc || item.shortDesc || '')),
            has_negative_effect: k.includes('choice') || k.includes('toxicorb') || k.includes('flameorb') || k.includes('lifeorb')
        };
    }
    function strumentoAmmesso(item, restrizioni) {
        const r = restrizioni && restrizioni.strumenti;
        if (!r) return true;
        const dati = datiStrumento(item);
        for (const campo of Object.keys(r)) {
            const regola = r[campo];
            if (!regola || regola.mode !== 'SPECIFIC' || !(campo in dati)) continue;
            if (!confrontaOperatore(dati[campo], regola)) return false;
        }
        return true;
    }

    function naturaImposta(restrizioni) {
        const r = restrizioni && restrizioni.pokemon && restrizioni.pokemon.nature;
        if (r && r.mode === 'SPECIFIC' && (!r.operator || r.operator === 'equals') && r.value) return String(r.value);
        return null;
    }

    // =================================================
    // TIER E VALORE DEI POKÉMON
    // =================================================
    const PUNTI_TIER = {
        AG: 9, UBER: 8, DUBER: 8, OU: 7, DOU: 7, UUBL: 6, DBL: 6, UU: 5, DUU: 5, RUBL: 4, RU: 4, NUBL: 3, NU: 3,
        PUBL: 2, PU: 2, ZUBL: 1, ZU: 1, NFE: 0, LC: 0
    };
    function puntiTier(tier) {
        const t = String(tier || '').replace(/[()]/g, '').toUpperCase().trim();
        return t in PUNTI_TIER ? PUNTI_TIER[t] : 0;
    }

    // =================================================
    // ANALISI DI UN POKÉMON DEL POOL
    // =================================================
    function nomeBase(specie) {
        // le forme "solo in battaglia" (Mega) entrano nel team col nome della specie base
        const b = specie.battleOnly;
        return Array.isArray(b) ? b[0] : (typeof b === 'string' ? b : specie.name);
    }

    async function mosseApprese(dex, specie, gen) {
        const catena = [];
        let s = specie;
        const viste = new Set();
        while (s && s.exists && !viste.has(s.id)) {
            viste.add(s.id);
            catena.push(s);
            s = s.prevo ? dex.species.get(s.prevo) : null;
        }
        // le mosse sono retroattive: valgono le fonti di ogni generazione fino a quella del formato (anche in quelli "within")
        const raccogli = async () => {
            const out = new Set();
            for (const sp of catena) {
                let dati = await dex.learnsets.get(sp.id);
                if ((!dati || !dati.learnset) && sp.baseSpecies && sp.baseSpecies !== sp.name) dati = await dex.learnsets.get(id(sp.baseSpecies));
                if (!dati || !dati.learnset) continue;
                for (const [mossa, fonti] of Object.entries(dati.learnset)) {
                    const ok = fonti.some(src => {
                        const g = parseInt(src, 10);
                        const via = src.charAt(1);
                        if (!'MLT'.includes(via)) return false;
                        return g <= gen;
                    });
                    if (ok) out.add(mossa);
                }
            }
            return out;
        };
        return raccogli();
    }

    // Una mossa di attacco vale quanto potenza x precisione x STAB, corretta dalla categoria
    function valoreAttacco(m, cand, ctx) {
        const off = m.categoria === 'Physical' ? cand.basi.atk : cand.basi.spa;
        const migliore = Math.max(cand.basi.atk, cand.basi.spa);
        const rapporto = migliore ? off / migliore : 1;
        let v = m.potenza * (m.precisione / 100) * (cand.tipiBase.includes(m.tipo) ? 1.5 : 1) * rapporto * rapporto;
        if (m.priorita > 0) v *= 1.15;
        if (m.rinculo) v *= 0.9;
        if (m.boostSelf && Object.values(m.boostSelf).some(x => x < 0)) v *= 0.85;
        if (m.id === 'fakeout' || m.id === 'firstimpression') v = Math.min(v, 40);
        if (ctx.doppio) {
            if (m.target === 'allAdjacent') v *= 0.85;          // colpisce anche l'alleato
            else if (m.target === 'allAdjacentFoes') v *= 1.15;
        }
        return v;
    }

    // Ciò che di solito si gioca su un Pokémon (mosse, strumenti, abilità; id, dalla più consigliata) dai dati di consigli.js
    function consigliDi(dati, cand, ctx) {
        if (!dati || !Consigli) return { mosse: [], oggetti: [], abilita: [] };
        return Consigli.per(dati, cand.id, { doppio: ctx.doppio, baseId: id(cand.base.baseSpecies || cand.base.name) });
    }

    async function analizza(dex, validatore, voce, ctx, restrizioni, mosseBandite, abilitaBandite, pokedexBase) {
        const specie = dex.species.get(voce.id);
        if (!specie.exists || specie.isNonstandard === 'CAP') return null;
        const isMega = !!specie.isMega;
        if (isMega && !ctx.meccaniche) return null;
        if (specie.isPrimal) return null;
        const richiesto = specie.requiredItem || (specie.requiredItems && specie.requiredItems[0]) || null;
        if (specie.battleOnly && !isMega && !richiesto) return null;

        const base = isMega ? dex.species.get(nomeBase(specie)) : specie;
        if (!base.exists) return null;
        // lo strumento obbligato (pietra, maschera, sfera...) deve rispettare le restrizioni sugli strumenti del formato
        if (richiesto && !strumentoAmmesso(dex.items.get(richiesto), restrizioni)) return null;
        if (ctx.standard && pokedexBase) {
            const dett = pokedexBase[id(voce.id)] || pokedexBase[id(base.baseSpecies)];
            if (dett && (dett.is_mythical === true || String(dett.is_mythical) === 'true')) return null;
        }

        const apprese = await mosseApprese(dex, base, ctx.gen);
        const mosse = [];
        for (const nome of apprese) {
            const m = K.descriviMossa(dex, nome);
            if (!m || !K.mossaUsabile(dex, m.id)) continue;
            if (mosseBandite(m.nome)) continue;
            if (!mossaAmmessa(dex, m, restrizioni)) continue;
            if (dex.moves.get(m.id).gen > ctx.gen) continue;
            // 'Past' = tolta dal gioco di quella generazione (Wake-Up Slap in Gen 8 e 9): con le fonti retroattive non basta più la generazione della fonte
            if (dex.moves.get(m.id).isNonstandard) continue;
            // la mossa deve essere davvero legale per questa specie nella generazione
            const problema = validatore ? validatore.checkCanLearn(dex.moves.get(m.id), base, validatore.allSources(base), { species: base.name, moves: [m.nome], level: ctx.livello }) : null;
            if (problema) continue;
            mosse.push(m);
        }

        const abilita = Object.values(base.abilities || {}).filter(a => a && !abilitaBandite(a) && !K.ABILITA_SCARTATE.has(id(a)));
        if (ctx.gen >= 3 && !abilita.length) return null;

        const cand = {
            id: voce.id, nome: base.name, specie, base, isMega, richiesto,
            tipiBase: base.types.slice(), tipi: specie.types.slice(), basi: specie.baseStats, bst: specie.bst || 0,
            tier: ctx.doppio ? specie.doublesTier : specie.tier, abilita, mosse,
            mosseDa: new Map(mosse.map(m => [m.id, m]))
        };
        cand.basi = { hp: specie.baseStats.hp, atk: specie.baseStats.atk, def: specie.baseStats.def, spa: specie.baseStats.spa, spd: specie.baseStats.spd, spe: specie.baseStats.spe };
        cand.valore = puntiTier(cand.tier) * 18 + cand.bst / 12;

        const attacchi = mosse.filter(m => m.categoria !== 'Status' && m.potenza > 0 && m.id !== 'fakeout' && m.id !== 'firstimpression' && !m.perno)
            .map(m => ({ m, v: valoreAttacco(m, cand, ctx) })).sort((a, b) => b.v - a.v);
        const perni = mosse.filter(m => m.perno && m.categoria !== 'Status').map(m => ({ m, v: valoreAttacco(m, cand, ctx) }));
        cand.attacchi = attacchi;
        cand.perni = perni;
        cand.tipiAttacco = Array.from(new Set(attacchi.slice(0, 5).filter(a => a.v >= 40).map(a => a.m.tipo)));
        const ha = k => cand.mosseDa.has(k);
        cand.opz = {
            protezione: mosse.find(m => m.protezione) || null,
            fakeout: ha('fakeout'), tailwind: ha('tailwind'), trickroom: ha('trickroom'), helpinghand: ha('helpinghand'),
            redirezione: mosse.find(m => m.redirezione) || null,
            schermi: ['reflect', 'lightscreen'].every(ha) || (ha('auroraveil')),
            paralisi: ['thunderwave', 'glare', 'nuzzle'].find(ha) || null,
            scottatura: ha('willowisp'), sonno: ['spore', 'sleeppowder'].find(ha) || null, tossina: ha('toxic'),
            taunt: ha('taunt'), rallenta: ['icywind', 'electroweb', 'bulldoze', 'rocktomb', 'snarl'].find(ha) || null,
            roccia: ha('stealthrock'), spuntoni: ha('spikes'), recupero: mosse.find(m => m.recupero) || null,
            setup: mosse.filter(m => m.potenziamento),
            pivot: perni.length ? perni[0].m : null, wideguard: ha('wideguard'), aurora: ha('auroraveil'), leechseed: ha('leechseed')
        };
        cand.supporto = !!(cand.opz.fakeout || cand.opz.tailwind || cand.opz.trickroom || cand.opz.redirezione || cand.opz.helpinghand || cand.opz.schermi);
        cand.offesa = Math.max(cand.basi.atk, cand.basi.spa);
        cand.robustezza = cand.basi.hp * (cand.basi.def + cand.basi.spd) / 100;
        cand.lento = cand.basi.spe <= 60;
        cand.veloce = cand.basi.spe >= 95;
        if (attacchi.length < (ctx.doppio ? 1 : 2) && !cand.supporto) return null;
        return cand;
    }

    // =================================================
    // SINERGIE DI SQUADRA
    // =================================================
    // Chi mette il meteo, chi ne approfitta e il tipo rafforzato: la conoscenza è condivisa con l'IA (cpu-conoscenza.js),
    // qui con i nomi dei piani (pioggia, sole, sabbia, neve)
    const SETTER = {}, SFRUTTATORI = {}, TIPO_METEO = {};
    Object.keys(K.PIANO_METEO).forEach(piano => {
        const w = K.PIANO_METEO[piano];
        SETTER[piano] = K.METEO_SETTER[w]; SFRUTTATORI[piano] = K.METEO_SFRUTTATORI[w]; TIPO_METEO[piano] = K.METEO_TIPO[w];
    });

    function abilitaPossibili(cand) { return cand.abilita.map(id); }

    // Debolezze e resistenze dei membri (per attacco di ciascun tipo)
    function tabellaTipi(dex, membri, tipi) {
        const out = {};
        for (const t of tipi) {
            let deboli = 0, resistenti = 0;
            for (const c of membri) {
                const m = K.moltiplicatoreTipo(dex, t, c.tipi);
                if (m > 1) deboli += m >= 4 ? 2 : 1;
                else if (m < 1) resistenti++;
            }
            out[t] = { deboli, resistenti };
        }
        return out;
    }

    function punteggio(dex, membri, piano, ctx, tipi) {
        if (!membri.length) return 0;
        let s = 0;
        for (const c of membri) s += c.valore * 0.06 * (piano.pesoValore || 1);

        // copertura offensiva: quanti tipi si colpiscono super efficaci
        const coperti = new Set();
        for (const c of membri) for (const t of c.tipiAttacco) {
            for (const dif of tipi) if (K.moltiplicatoreTipo(dex, t, [dif]) > 1) coperti.add(dif);
        }
        s += (coperti.size / tipi.length) * 3.2;

        // difesa: nessuna debolezza condivisa da molti (in Anything Goose conta la metà: si vince colpendo per primi)
        const tab = tabellaTipi(dex, membri, tipi);
        const pesoDifesa = ctx.goose ? 0.5 : 1;
        for (const t of tipi) {
            const { deboli, resistenti } = tab[t];
            const eccesso = deboli - resistenti - 1;
            if (eccesso > 0) s -= eccesso * 0.7 * pesoDifesa;
            if (deboli >= 3 && resistenti === 0) s -= 1.2 * pesoDifesa;
        }
        // tipi ripetuti
        const conteggio = {};
        for (const c of membri) for (const t of c.tipiBase) conteggio[t] = (conteggio[t] || 0) + 1;
        for (const t in conteggio) if (conteggio[t] > 2) s -= (conteggio[t] - 2) * 0.9;

        const ab = membri.map(abilitaPossibili);
        const ha = f => membri.some(f);
        if (ctx.doppio) {
            if (ha(c => c.opz.fakeout)) s += 1.3;
            if (ha(c => c.opz.tailwind || c.opz.trickroom)) s += 1.1;
            if (membri.filter(c => c.opz.tailwind || c.opz.trickroom || c.opz.rallenta || c.opz.paralisi).length >= 2) s += 0.5;
            if (ha(c => c.opz.redirezione)) s += 0.6;
            if (ha(c => c.opz.protezione)) s += 0.4;
            if (membri.filter(c => c.supporto).length > 3) s -= (membri.filter(c => c.supporto).length - 3) * 1.1;
            if (ha(c => c.opz.helpinghand)) s += 0.2;
        } else {
            if (ha(c => c.opz.roccia || c.opz.spuntoni)) s += 0.9;
            if (ha(c => c.opz.recupero && c.robustezza > 70)) s += 0.6;
            if (ha(c => c.opz.pivot)) s += 0.4;
            if (ha(c => c.opz.setup.length && c.veloce)) s += 0.6;
            if (ha(c => c.opz.sonno || c.opz.paralisi || c.opz.scottatura)) s += 0.3;
            if (membri.filter(c => c.veloce).length >= 2) s += 0.4;
        }
        // almeno un Pokémon che attacca davvero col tipo giusto: evita squadre di soli supporti
        s += Math.min(membri.filter(c => c.offesa >= 100).length, 3) * 0.5;
        // Anything Goose: team molto offensivi. Contano la potenza (attacco o attacco speciale) e la velocità di ognuno,
        // fino a sei Pokémon; i supporti (Fake Out, Tailwind, schermi...) valgono molto meno
        if (ctx.goose) {
            for (const c of membri) {
                s += Math.max(0, Math.min((c.offesa - 90) / 40, 1.6)) * 0.9 + Math.max(0, Math.min((c.basi.spe - 80) / 60, 1)) * 0.5;
            }
            s -= membri.filter(c => c.supporto).length * 0.5;
        }

        // piano della squadra
        const p = piano.nome;
        if (SETTER[p]) {
            const setter = ab.some(l => SETTER[p].some(x => l.includes(x)));
            const sfrutt = ab.filter(l => SFRUTTATORI[p].some(x => l.includes(x))).length +
                membri.filter(c => c.tipiBase.includes(TIPO_METEO[p])).length * 0.5;
            if (setter) s += 1.6 + Math.min(sfrutt, 3) * 0.7; else s -= 1.5;
        } else if (p === 'trickroom') {
            // chi mette la Stanza Magica conta: uno lento (che ci resta dentro) vale molto più di uno veloce che la sfrutterebbe male
            if (ha(c => c.opz.trickroom)) s += 1.0 + (ha(c => c.opz.trickroom && c.basi.spe <= 80) ? 0.8 : 0); else s -= 1.8;
            s += membri.filter(c => c.lento && c.offesa >= 95).length * 0.8;
            s -= membri.filter(c => c.veloce).length * 0.7;
        } else if (p === 'tailwind') {
            if (ha(c => c.opz.tailwind)) s += 1.6; else s -= 1.8;
            s += membri.filter(c => c.veloce).length * 0.3;
        } else if (p === 'offensivo') {
            s += membri.filter(c => c.offesa >= 110).length * 0.5 + membri.filter(c => c.veloce).length * 0.4;
        } else if (p === 'bulky') {
            s += membri.filter(c => c.robustezza >= 75).length * 0.6;
        }
        return s;
    }

    // =================================================
    // SET DI UN POKÉMON
    // =================================================
    function mosseDelSet(cand, ruolo, ctx, piano) {
        const scelte = [];
        const aggiungi = m => { if (m && !scelte.some(x => x.id === m.id) && scelte.length < 4) scelte.push(m); };
        const get = k => cand.mosseDa.get(k) || null;
        const o = cand.opz;
        // le mosse consigliate che la CPU può davvero usare (legali, ammesse dal formato, che sa giocare), dalla più consigliata
        const consigliate = ((cand.cons && cand.cons.mosse) || []).map(k => cand.mosseDa.get(k)).filter(Boolean);
        const posCons = new Map(consigliate.map((m, k) => [m.id, k]));
        const bonusCons = m => (posCons.has(m.id) ? Math.max(0.3, 0.9 - posCons.get(m.id) * 0.06) : 0);

        if (ctx.doppio) {
            // Anything Goose: solo chi ha un ruolo di supporto si protegge, gli altri attaccano con tutte e quattro le mosse
            if (!(ctx.goose && !ruolo.supporto)) aggiungi(o.protezione);
            if (ruolo.fakeout) aggiungi(get('fakeout'));
            if (ruolo.velocita === 'tailwind') aggiungi(get('tailwind'));
            if (ruolo.velocita === 'trickroom') aggiungi(get('trickroom'));
            if (ruolo.redirezione) aggiungi(o.redirezione);
            if (ruolo.schermi) { if (piano.nome === 'neve') aggiungi(get('auroraveil')); aggiungi(get('reflect')); aggiungi(get('lightscreen')); }
            if (ruolo.aiuto) aggiungi(get('helpinghand'));
            if (ruolo.rallenta) aggiungi(get(o.rallenta));
            if (ruolo.stato) aggiungi(get(o.paralisi) || get(o.sonno) || get('willowisp'));
        } else {
            if (ruolo.trappola) aggiungi(get(o.roccia ? 'stealthrock' : 'spikes'));
            if (ruolo.recupero) aggiungi(o.recupero);
            if (ruolo.setup) aggiungi(ruolo.setup);
            if (ruolo.stato) aggiungi(get(o.sonno) || get(o.paralisi) || get('willowisp') || get('toxic'));
            if (ruolo.perno) aggiungi(o.pivot);
        }

        // attacchi: i due migliori STAB, poi copertura sui tipi che ancora non si colpiscono bene
        const coperti = new Set();
        const copre = m => { for (const t of K.TIPI) if (K.moltiplicatoreTipo(ruolo.dex, m.tipo, [t]) > 1) coperti.add(t); };
        scelte.filter(m => m.categoria !== 'Status').forEach(copre);
        const liberi = 4 - scelte.length;
        const daFare = Math.max(ruolo.attacchi != null ? ruolo.attacchi : liberi, 0);
        const usabili = cand.attacchi.filter(a => a.m.categoria !== 'Status');
        const preferita = cand.basi.atk >= cand.basi.spa ? 'Physical' : 'Special';
        let presi = 0;
        // STAB: il migliore per ogni tipo (il valore tiene già conto della categoria)
        for (const t of cand.tipiBase) {
            if (presi >= daFare || scelte.length >= 4) break;
            const dellTipo = usabili.filter(x => x.m.tipo === t && !scelte.some(s => s.id === x.m.id));
            // tra gli attacchi di quel tipo vince quello consigliato, se non è molto più debole del migliore
            const consigliato = dellTipo.filter(x => posCons.has(x.m.id) && dellTipo[0] && x.v >= dellTipo[0].v * 0.6)
                .sort((x, y) => posCons.get(x.m.id) - posCons.get(y.m.id))[0];
            const a = consigliato || dellTipo[0];
            if (a && a.v >= 55) { aggiungi(a.m); copre(a.m); presi++; }
        }
        // copertura: si cercano tipi nuovi; due mosse dello stesso tipo valgono molto meno
        while (presi < daFare && scelte.length < 4) {
            let migliore = null, mv = -1;
            const tipiScelti = new Set(scelte.filter(m => m.categoria !== 'Status').map(m => m.tipo));
            for (const a of usabili) {
                if (scelte.some(s => s.id === a.m.id)) continue;
                if (a.m.categoria !== preferita && cand.offesa > 0 && (a.m.categoria === 'Physical' ? cand.basi.atk : cand.basi.spa) < cand.offesa * 0.8) continue;
                let nuovi = 0;
                for (const t of K.TIPI) if (!coperti.has(t) && K.moltiplicatoreTipo(ruolo.dex, a.m.tipo, [t]) > 1) nuovi++;
                let v = a.v * (1 + nuovi * 0.18) * (1 + bonusCons(a.m));
                if (tipiScelti.has(a.m.tipo)) v *= 0.4;
                if (v > mv) { mv = v; migliore = a; }
            }
            if (!migliore) break;
            aggiungi(migliore.m); copre(migliore.m); presi++;
        }
        // se mancano mosse: prima le consigliate che attaccano (o potenziano chi attacca), poi qualunque attacco, poi qualunque mossa utile
        for (const m of consigliate) {
            if (scelte.length >= 4) break;
            if (m.categoria !== 'Status' && !m.perno) aggiungi(m);
        }
        for (const a of cand.attacchi) { if (scelte.length >= 4) break; aggiungi(a.m); }
        for (const a of cand.perni) { if (scelte.length >= 4) break; aggiungi(a.m); }
        for (const m of cand.mosse) { if (scelte.length >= 4) break; if (m.categoria === 'Status') aggiungi(m); }
        return scelte;
    }

    // Quanti attacchi e di che tipo servono nel set, dato il ruolo
    function ruoloDi(cand, ctx, piano, assegnati) {
        const r = { dex: assegnati.dex };
        if (ctx.doppio) {
            r.fakeout = assegnati.fakeout === cand.id;
            r.velocita = assegnati.velocita[cand.id] || null;
            r.redirezione = assegnati.redirezione === cand.id;
            r.schermi = assegnati.schermi === cand.id;
            r.aiuto = assegnati.aiuto.includes(cand.id);
            r.rallenta = assegnati.rallenta.includes(cand.id);
            r.stato = assegnati.stato.includes(cand.id);
            const nSupp = [r.fakeout, r.velocita, r.redirezione, r.schermi, r.aiuto, r.rallenta, r.stato].filter(Boolean).length;
            r.attacchi = ctx.goose ? Math.max(2, 4 - nSupp) : Math.max(1, 3 - nSupp);
            r.supporto = nSupp > 0;
        } else {
            r.trappola = assegnati.trappola === cand.id;
            r.recupero = assegnati.recupero.includes(cand.id);
            r.setup = assegnati.setup[cand.id] || null;
            r.stato = assegnati.stato.includes(cand.id);
            r.perno = assegnati.perno === cand.id;
            const nUtili = [r.trappola, r.recupero, r.setup, r.stato, r.perno].filter(Boolean).length;
            r.attacchi = Math.max(2, 4 - nUtili);
        }
        return r;
    }

    // Chi fa cosa: la squadra decide quale membro ha le mosse di supporto
    function assegnaRuoli(dex, membri, ctx, piano) {
        const a = { dex, fakeout: null, velocita: {}, redirezione: null, schermi: null, aiuto: [], rallenta: [], stato: [],
            trappola: null, recupero: [], setup: {}, perno: null };
        const per = (lista, f) => lista.slice().sort((x, y) => f(y) - f(x));
        if (ctx.doppio) {
            const conVel = piano.nome === 'trickroom' ? membri.filter(c => c.opz.trickroom) : membri.filter(c => c.opz.tailwind);
            const setterVel = per(conVel, c => (c.supporto ? 2 : 0) + (piano.nome === 'trickroom' ? -c.basi.spe / 100 : c.basi.spe / 100))[0] ||
                per(membri.filter(c => c.opz.tailwind || c.opz.trickroom), c => (c.supporto ? 2 : 0))[0];
            if (setterVel) a.velocita[setterVel.id] = (piano.nome === 'trickroom' && setterVel.opz.trickroom) || !setterVel.opz.tailwind ? 'trickroom' : 'tailwind';
            const fo = per(membri.filter(c => c.opz.fakeout && c.id !== (setterVel && setterVel.id)), c => (c.supporto ? 1 : 0) + (c.robustezza > 60 ? 0.3 : 0))[0] ||
                membri.find(c => c.opz.fakeout);
            if (fo) a.fakeout = fo.id;
            const red = per(membri.filter(c => c.opz.redirezione && c.id !== (fo && fo.id)), c => c.robustezza)[0];
            if (red) a.redirezione = red.id;
            // gli schermi (due mosse su quattro, più Protezione) li mette chi ha poco da attaccare, o chi li mette in priorità (Prankster)
            const sch = ctx.goose ? null : membri.find(c => c.opz.schermi && ![fo, red].some(x => x && x.id === c.id) && c.supporto &&
                (c.offesa < 105 || abilitaPossibili(c).includes('prankster')));
            if (sch) a.schermi = sch.id;
            for (const c of membri) {
                const preso = c.id === a.fakeout || a.velocita[c.id] || c.id === a.redirezione || c.id === a.schermi;
                if (c.opz.helpinghand && c.supporto && !preso) a.aiuto.push(c.id);
                else if (ctx.goose) continue;                       // Anything Goose: niente rallentamenti e stati, si attacca
                else if (!preso && c.opz.rallenta === 'icywind') a.rallenta.push(c.id);
                else if (!preso && (c.opz.paralisi || c.opz.sonno) && c.offesa < 100) a.stato.push(c.id);
            }
        } else {
            const mu = membri.filter(c => c.opz.roccia || c.opz.spuntoni);
            const tr = per(mu, c => c.robustezza + (c.opz.roccia ? 20 : 0))[0];
            if (tr) a.trappola = tr.id;
            for (const c of per(membri, c => c.robustezza)) {
                if (!ctx.goose && c.opz.recupero && c.robustezza > 60 && a.recupero.length < 2) a.recupero.push(c.id);
            }
            for (const c of per(membri.filter(c => c.opz.setup.length), c => c.offesa + c.basi.spe / 2)) {
                if (Object.keys(a.setup).length >= 2) break;
                if (a.recupero.includes(c.id) && c.robustezza > 90) continue;
                const fisico = c.basi.atk >= c.basi.spa;
                const buona = c.opz.setup.filter(m => {
                    const b = m.potenziamento;
                    return fisico ? ((b.atk || 0) > 0) : ((b.spa || 0) > 0);
                }).sort((x, y) => Object.values(y.potenziamento).reduce((s, v) => s + v, 0) - Object.values(x.potenziamento).reduce((s, v) => s + v, 0))[0];
                if (buona) a.setup[c.id] = buona;
            }
            for (const c of membri) {
                if (a.recupero.includes(c.id) && !a.setup[c.id] && (c.opz.sonno || c.opz.paralisi || c.opz.scottatura || c.opz.tossina)) a.stato.push(c.id);
            }
            const perno = per(membri.filter(c => c.opz.pivot && !a.setup[c.id]), c => c.basi.spe)[0];
            if (perno) a.perno = perno.id;
        }
        return a;
    }

    function scegliAbilita(cand, piano, ctx, ruolo) {
        if (ctx.gen < 3) return null;
        let migliore = null, mv = -99;
        for (const nome of cand.abilita) {
            const k = id(nome);
            const ab = ruolo.dex.abilities.get(nome);
            let v = ab.rating != null ? ab.rating : 0;
            if (SETTER[piano.nome] && SETTER[piano.nome].some(x => k.includes(x))) v += 9;   // chi può mettere il meteo del piano lo mette: prima di tutto il resto
            if (SFRUTTATORI[piano.nome] && SFRUTTATORI[piano.nome].includes(k)) v += 7;   // chi approfitta del meteo lo fa davvero: l'abilità del piano batte anche una più quotata
            if (k === 'intimidate' && ctx.doppio) v += 0.5;
            // quella che di solito si gioca su questo Pokémon (la più consigliata vale di più). Vale meno di ciò che serve al piano
            // (meteo: +3 chi lo mette, +2 chi ne approfitta) e, fino alla Gen 7, non si prende l'abilità nascosta: certe mosse delle
            // generazioni vecchie non si possono avere con quella
            const posizione = cand.cons ? cand.cons.abilita.indexOf(k) : -1;
            const nascosta = cand.base.abilities && cand.base.abilities.H === nome;
            if (posizione >= 0 && !(nascosta && ctx.gen < 8)) v += Math.max(0.5, 1.5 - posizione * 0.5);
            if (v > mv) { mv = v; migliore = nome; }
        }
        return migliore;
    }

    function itemValido(dex, nome, ctx, restrizioni, usati) {
        const it = dex.items.get(nome);
        // niente strumenti fuori dalla generazione (anche 'Past': in Gen 8 e 9 sono Red Orb, Blue Orb... che il validatore rifiuta)
        if (!it.exists || it.gen > ctx.gen || it.isNonstandard) return null;
        if ((!ctx.goose && usati.has(it.id)) || K.STRUMENTI_SCELTA.has(it.id)) return null;   // Anything Goose: niente Item Clause
        if (it.megaStone || it.zMove) return null;
        if (!strumentoAmmesso(it, restrizioni)) return null;
        return it.name;
    }

    function scegliStrumento(cand, ruolo, ctx, restrizioni, usati, piano, mosse) {
        const dex = ruolo.dex;
        if (ctx.gen < 2) return '';
        if (cand.isMega) return cand.richiesto || '';
        if (cand.richiesto) return cand.richiesto;
        const attacchi = mosse.filter(m => m.categoria !== 'Status');
        const stato = mosse.some(m => m.categoria === 'Status' && !m.protezione);
        const qualunqueStato = mosse.some(m => m.categoria === 'Status');          // il Gilet d'assalto vieta anche la Protezione
        const fragile = cand.basi.hp + cand.basi.def + cand.basi.spd < 230;
        const nomi = [];
        if (ruolo.schermi) nomi.push('Light Clay');
        if (ctx.doppio && ruolo.fakeout) nomi.push('Sitrus Berry', 'Safety Goggles', 'Mental Herb');
        // gli strumenti consigliati per questo Pokémon, se vanno d'accordo con il suo set (e con ciò che la CPU sa fare)
        for (const k of ((cand.cons && cand.cons.oggetti) || [])) {
            const it = dex.items.get(k);
            if (!it.exists) continue;
            if (it.id === 'assaultvest' && qualunqueStato) continue;                        // con il Gilet d'assalto le mosse di stato non si usano
            if (it.id === 'eviolite' && !(cand.base.evos && cand.base.evos.length)) continue;   // serve solo a chi può ancora evolversi
            if (it.id === 'toxicorb' || it.id === 'flameorb') continue;                     // servono con un'abilità o una mossa che la CPU non pianifica
            nomi.push(it.name);
        }
        if (!attacchi.length) nomi.push('Leftovers', 'Sitrus Berry');
        const tipoMigliore = attacchi.slice().sort((a, b) => b.potenza - a.potenza)[0];
        const robusto = cand.robustezza >= 75;
        if (robusto && !qualunqueStato && cand.basi.spd >= cand.basi.def && !(ctx.goose && cand.offesa >= 100)) nomi.push('Assault Vest');
        if (ruolo.setup || ruolo.velocita === 'trickroom') nomi.push('Leftovers', 'Sitrus Berry');
        if (cand.offesa >= (ctx.goose ? 90 : 100) && (!robusto || ctx.goose)) {
            nomi.push(fragile && ctx.doppio ? 'Focus Sash' : 'Life Orb');
            if (tipoMigliore) nomi.push(K.STRUMENTI_TIPO[tipoMigliore.tipo]);
            nomi.push('Expert Belt', 'Life Orb', 'Focus Sash');
        }
        nomi.push('Sitrus Berry', 'Leftovers', 'Lum Berry', 'Covert Cloak', 'Mental Herb', 'Rocky Helmet', 'Shell Bell', 'Scope Lens', 'Quick Claw', 'Wide Lens',
            'Black Sludge', 'Metronome', 'Muscle Band', 'Wise Glasses');
        for (const n of nomi) {
            const v = n && itemValido(dex, n, ctx, restrizioni, usati);
            if (v) return v;
        }
        // l'ultima spiaggia: un qualunque strumento ammesso
        for (const it of dex.items.all()) {
            if (it.gen > ctx.gen || it.isNonstandard) continue;
            const v = itemValido(dex, it.name, ctx, restrizioni, usati);
            if (v && (it.isBerry || /^(Charcoal|Mystic Water|Magnet|Never-Melt Ice|Black Belt|Soft Sand|Sharp Beak)$/.test(it.name))) return v;
        }
        return '';
    }

    function distribuzione(cand, ruolo, ctx, mosse, piano, natura) {
        // natura ed EV in base a cosa fa il Pokémon
        const fisiche = mosse.filter(m => m.categoria === 'Physical' && m.id !== 'bodypress' && m.id !== 'foulplay');
        const speciali = mosse.filter(m => m.categoria === 'Special');
        const attaccaFisico = fisiche.length > speciali.length || (fisiche.length === speciali.length && cand.basi.atk >= cand.basi.spa);
        const offensivo = mosse.filter(m => m.categoria !== 'Status').length >= 2 && cand.offesa >= 80;
        const trickRoom = ruolo.velocita === 'trickroom' || piano.nome === 'trickroom' && cand.lento;
        const evs = {};
        let nat;
        const ivs = {};
        if (!fisiche.length) ivs.atk = 0;
        if (trickRoom) ivs.spe = 0;
        if (!offensivo || mosse.filter(m => m.categoria !== 'Status').length <= 1) {
            // supporto resistente
            const fisicoDif = cand.basi.def >= cand.basi.spd;
            evs.hp = 252; evs[fisicoDif ? 'def' : 'spd'] = 252; evs[fisicoDif ? 'spd' : 'def'] = 4;
            nat = fisicoDif ? (fisiche.length ? 'Impish' : 'Bold') : (fisiche.length ? 'Careful' : 'Calm');
            if (ruolo.velocita === 'tailwind' && cand.basi.spe >= 80) { evs.hp = 4; evs.spe = 252; evs.spd = 252; evs.def = 0; nat = attaccaFisico ? 'Jolly' : 'Timid'; }
        } else if (trickRoom) {
            evs.hp = 252; evs[attaccaFisico ? 'atk' : 'spa'] = 252; evs[attaccaFisico ? 'def' : 'spd'] = 4;
            nat = attaccaFisico ? 'Brave' : 'Quiet';
        } else if (cand.basi.spe >= 70) {
            evs.hp = 4; evs[attaccaFisico ? 'atk' : 'spa'] = 252; evs.spe = 252;
            nat = attaccaFisico ? 'Jolly' : 'Timid';
            // se non c'è nessuna mossa dell'altra categoria, la natura può abbassare quella inutile
            if (attaccaFisico && speciali.length) nat = 'Adamant';
            if (!attaccaFisico && fisiche.length) nat = 'Modest';
        } else {
            evs.hp = 252; evs[attaccaFisico ? 'atk' : 'spa'] = 252; evs[attaccaFisico ? 'def' : 'spd'] = 4;
            nat = attaccaFisico ? 'Adamant' : 'Modest';
        }
        if (natura) nat = natura;
        return { evs, nat, ivs };
    }

    function testoSet(cand, ctx, ruolo, piano, restrizioni, usati, tera, natura) {
        const dex = ruolo.dex;
        const mosse = mosseDelSet(cand, ruolo, ctx, piano);
        const strumento = scegliStrumento(cand, ruolo, ctx, restrizioni, usati, piano, mosse);
        if (strumento) usati.add(id(strumento));
        const abilita = scegliAbilita(cand, piano, ctx, ruolo);
        const { evs, nat, ivs } = distribuzione(cand, ruolo, ctx, mosse, piano, natura);
        const righe = [];
        righe.push(strumento ? `${cand.nome} @ ${strumento}` : cand.nome);
        if (abilita) righe.push(`Ability: ${abilita}`);
        righe.push(`Level: ${ctx.livello}`);
        if (ctx.gen >= 9 && ctx.meccaniche && !cand.isMega) righe.push(`Tera Type: ${tera}`);
        if (ctx.gen < 3) righe.push('EVs: 252 HP / 252 Atk / 252 Def / 252 SpA / 252 SpD / 252 Spe');   // nelle prime due generazioni i punti base sono al massimo
        if (ctx.gen >= 3) {
            const nomiEv = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
            const ev = Object.keys(evs).filter(k => evs[k] > 0).map(k => `${evs[k]} ${nomiEv[k]}`).join(' / ');
            if (ev) righe.push(`EVs: ${ev}`);
            righe.push(`${nat} Nature`);
            const iv = Object.keys(ivs).map(k => `${ivs[k]} ${nomiEv[k]}`).join(' / ');
            if (iv) righe.push(`IVs: ${iv}`);
        }
        mosse.forEach(m => righe.push(`- ${m.nome}`));
        return { testo: righe.join('\n'), mosse, strumento, abilita };
    }

    // Gen 7 con le meccaniche accese: la CPU porta un Cristallo Z. La Mossa Z si fa una volta sola per partita, quindi un solo cristallo
    // per team (più di uno sarebbe sprecato). Lo prende chi ha l'attacco con più da guadagnare dalla Mossa Z (la potenza della Mossa Z
    // per la sua statistica offensiva, col bonus STAB) tra chi non ha già uno strumento obbligato (Megapietra, strumento della forma).
    const CRISTALLI_Z = {
        Normal: 'Normalium Z', Fire: 'Firium Z', Water: 'Waterium Z', Electric: 'Electrium Z', Grass: 'Grassium Z', Ice: 'Icium Z',
        Fighting: 'Fightinium Z', Poison: 'Poisonium Z', Ground: 'Groundium Z', Flying: 'Flyinium Z', Psychic: 'Psychium Z',
        Bug: 'Buginium Z', Rock: 'Rockium Z', Ghost: 'Ghostium Z', Dragon: 'Dragonium Z', Dark: 'Darkinium Z', Steel: 'Steelium Z',
        Fairy: 'Fairium Z'
    };
    function cristalloZDelTeam(dex, ctx, restrizioni, usati, infoMembri) {
        if (ctx.gen !== 7 || !ctx.meccaniche) return null;
        let migliore = null;
        infoMembri.forEach((info, i) => {
            const c = info.cand;
            if (c.isMega || c.richiesto) return;
            for (const m of info.mosse) {
                if (m.categoria === 'Status' || !(m.potenza >= 60) || m.dueTurni || m.ricarica) continue;
                const nome = CRISTALLI_Z[m.tipo];
                const it = nome ? dex.items.get(nome) : null;
                if (!it || !it.exists || !it.zMove || it.gen > ctx.gen || it.isNonstandard) continue;
                if (!strumentoAmmesso(it, restrizioni) || (!ctx.goose && usati.has(it.id))) continue;
                const statOffensiva = m.categoria === 'Physical' ? c.basi.atk : c.basi.spa;
                const valore = K.potenzaZDaTabella(m.potenza) * (c.tipiBase.includes(m.tipo) ? 1.5 : 1) * statOffensiva;
                if (!migliore || valore > migliore.valore) migliore = { i, it, valore };
            }
        });
        return migliore;
    }

    function scegliTera(cand, mosse, rnd) {
        // il tipo dell'attacco più forte se non è già uno dei suoi, altrimenti il tipo principale
        const att = mosse.filter(m => m.categoria !== 'Status').sort((a, b) => b.potenza - a.potenza)[0];
        if (att && !cand.tipiBase.includes(att.tipo) && att.potenza >= 80 && rnd() < 0.6) return att.tipo;
        return cand.tipiBase[0];
    }

    // =================================================
    // COMPOSIZIONE DEI TEAM
    // =================================================
    const PIANI_DOPPIO = ['tailwind', 'trickroom', 'pioggia', 'sole', 'bilanciato', 'offensivo', 'sabbia', 'neve', 'bulky'];
    const PIANI_SINGOLO = ['bilanciato', 'offensivo', 'bulky', 'pioggia', 'sole', 'sabbia', 'neve'];
    const ETICHETTE = {
        tailwind: 'Tailwind', trickroom: 'Trick Room', pioggia: 'Rain', sole: 'Sun', sabbia: 'Sand', neve: 'Snow',
        bilanciato: 'Balance', offensivo: 'Offense', bulky: 'Bulky'
    };

    function pianiPossibili(cand, ctx) {
        const nomi = ctx.doppio ? PIANI_DOPPIO : PIANI_SINGOLO;
        const ab = new Set();
        cand.forEach(c => abilitaPossibili(c).forEach(a => ab.add(a)));
        return nomi.filter(p => {
            if (SETTER[p]) return SETTER[p].some(x => ab.has(x));
            if (p === 'tailwind') return cand.some(c => c.opz.tailwind);
            if (p === 'trickroom') return cand.some(c => c.opz.trickroom) && cand.some(c => c.lento && c.offesa >= 95);
            return true;
        });
    }

    // Anything Goose: la CPU punta sull'attacco. "Offensivo" pesa quanto tutti gli altri piani insieme (compare più volte nell'elenco,
    // da cui si pesca), gli altri restano come un po' di strategia; "bilanciato" e "bulky" non servono.
    function pianiDelFormato(cand, ctx) {
        const piani = pianiPossibili(cand, ctx);
        if (!ctx.goose) return piani;
        const altri = piani.filter(p => p !== 'offensivo' && p !== 'bilanciato' && p !== 'bulky');
        return Array.from({ length: Math.max(3, altri.length) }, () => 'offensivo').concat(altri);
    }

    // Chi può impostare il piano del team: Tailwind, Stanza Magica (meglio se non troppo veloce), il meteo (abilità)
    function impostaIlPiano(piano, c) {
        if (piano.nome === 'tailwind') return !!c.opz.tailwind;
        if (piano.nome === 'trickroom') return !!c.opz.trickroom;
        if (SETTER[piano.nome]) return abilitaPossibili(c).some(a => SETTER[piano.nome].includes(a));
        return false;
    }
    const pianoConSetter = piano => piano.nome === 'tailwind' || piano.nome === 'trickroom' || !!SETTER[piano.nome];
    // Chi ne approfitta (e quanti ne servono): attaccanti lenti per la Stanza Magica, chi ama il meteo (abilità o tipo) per il meteo
    function sfruttaIlPiano(piano, c) {
        if (piano.nome === 'trickroom') return c.lento && c.offesa >= 95;
        if (SETTER[piano.nome]) {
            return abilitaPossibili(c).some(a => SFRUTTATORI[piano.nome].includes(a)) ||
                (c.tipiAttacco.includes(TIPO_METEO[piano.nome]) && c.offesa >= 80);
        }
        return false;
    }
    const abusatoriNecessari = piano => piano.nome === 'trickroom' ? 2 : (SETTER[piano.nome] ? 1 : 0);

    // Anything Goose: lo stesso Pokémon può comparire più volte (la seconda copia è un duplicato con un altro `id`, così i ruoli
    // - chi mette Tailwind, chi ha Fake Out... - si assegnano a una copia sola). Ogni copia in più costa un po' di punteggio: due
    // Calyrex-Shadow succedono, ma non sempre e non tre alla volta.
    const COPIE_MASSIME = 3;
    const PROBABILITA_COPIA = 0.3;
    const radiceDi = m => m.origine || m;
    function copiaDi(c, numero) { return Object.assign(Object.create(Object.getPrototypeOf(c)), c, { origine: c, id: `${c.id}~${numero}` }); }

    function compone(dex, cand, ctx, piano, rnd, usoGlobale, asso, tipi, massimo) {
        const membri = [asso];
        const usate = new Set([id(asso.base.baseSpecies || asso.base.name)]);
        let uber = ctx.standard && /^D?UBER$/i.test(String(asso.tier).replace(/[()]/g, '')) ? 1 : 0;
        let guardia = 0;
        const eUberDi = c => /^D?UBER$/i.test(String(c.tier).replace(/[()]/g, ''));
        const copie = c => membri.filter(m => radiceDi(m) === c).length;
        // chi si può ancora aggiungere: senza clausole (Anything Goose) anche chi c'è già, fino a tre copie
        const libero = c => ctx.goose ? copie(c) < COPIE_MASSIME : !membri.includes(c) && !usate.has(id(c.base.baseSpecies || c.base.name));
        // Anything Goose: circa un team su tre ha apposta una copia di un suo Pokémon (le copie in più, mai senza motivo, costano)
        let cercaCopia = ctx.goose && rnd() < PROBABILITA_COPIA;
        const costoCopia = c => { const n = copie(c); return n ? (n === 1 && cercaCopia ? -2.2 : 0.8 + (n - 1) * 2.2) : 0; };
        const aggiungi = scelto => {
            const n = ctx.goose ? copie(scelto) : 0;
            if (n) cercaCopia = false;                    // una copia sola per volta: il bonus finisce qui
            membri.push(n ? copiaDi(scelto, n + 1) : scelto);
            usate.add(id(scelto.base.baseSpecies || scelto.base.name));
            if (ctx.standard && eUberDi(scelto)) uber++;
        };
        // Un team con un piano parte da chi lo imposta: se l'asso non può farlo, il secondo membro è il miglior setter disponibile
        // (altrimenti il piano resterebbe un'etichetta senza nessuno che lo faccia)
        if (pianoConSetter(piano) && !impostaIlPiano(piano, asso)) {
            let scelto = null, mv = -1e9;
            for (const c of cand) {
                if (!impostaIlPiano(piano, c) || !libero(c)) continue;
                if (ctx.standard && eUberDi(c) && uber >= 2) continue;
                const uso = usoGlobale.get(chiaveUso(c)) || 0;
                let v = punteggio(dex, membri.concat(c), piano, ctx, tipi) + (rnd() - 0.5) * 1.1 - (uso >= massimo ? 3 + (uso - massimo) * 2 : uso * 0.25) - costoCopia(c);
                if (piano.nome === 'trickroom' && c.basi.spe <= 80) v += 0.6;
                if (v > mv) { mv = v; scelto = c; }
            }
            if (scelto) aggiungi(scelto);
        }
        // ...e da chi ne approfitta: senza, il setter metterebbe un meteo (o una Stanza Magica) che non serve a nessuno
        // (per il meteo il setter non conta: ci vuole qualcun altro che ne approfitti)
        const abusatoriPresenti = () => membri.filter(c => sfruttaIlPiano(piano, c) && !(SETTER[piano.nome] && impostaIlPiano(piano, c))).length;
        while (abusatoriNecessari(piano) && abusatoriPresenti() < abusatoriNecessari(piano) && membri.length < 5 && guardia++ < 100) {
            let scelto = null, mv = -1e9;
            for (const c of cand) {
                if (!sfruttaIlPiano(piano, c) || (SETTER[piano.nome] && impostaIlPiano(piano, c)) || !libero(c)) continue;
                if (ctx.standard && eUberDi(c) && uber >= 2) continue;
                const uso = usoGlobale.get(chiaveUso(c)) || 0;
                const v = punteggio(dex, membri.concat(c), piano, ctx, tipi) + (rnd() - 0.5) * 1.1 - (uso >= massimo ? 3 + (uso - massimo) * 2 : uso * 0.25) - costoCopia(c);
                if (v > mv) { mv = v; scelto = c; }
            }
            if (!scelto) break;
            aggiungi(scelto);
        }
        while (membri.length < 6 && guardia++ < 400) {
            const attuale = punteggio(dex, membri, piano, ctx, tipi);
            let migliori = [];
            for (const c of cand) {
                if (!libero(c)) continue;
                if (ctx.standard && eUberDi(c) && uber >= 2) continue;
                let v = punteggio(dex, membri.concat(c), piano, ctx, tipi) - attuale;
                const uso = usoGlobale.get(chiaveUso(c)) || 0;
                if (uso >= massimo) v -= 3 + (uso - massimo) * 2;
                else v -= uso * 0.25;
                v -= costoCopia(c);
                v += (rnd() - 0.5) * 1.1;
                migliori.push({ c, v });
            }
            if (!migliori.length) break;
            migliori.sort((a, b) => b.v - a.v);
            aggiungi(migliori[Math.min(migliori.length - 1, Math.floor(rnd() * rnd() * 3))].c);
        }
        return membri;
    }

    // =================================================
    // LA STRATEGIA DEL TEAM
    // =================================================
    // Un team ha un piano solo se i suoi set lo realizzano davvero: chi lo imposta (Tailwind, Stanza Magica, meteo) e chi ne
    // approfitta. Si guarda quello che c'è nei set finali (mosse e abilità scelte), non quello che i Pokémon potrebbero fare.
    // `info`: [{ cand, mosse (descritte), abilita }]. Restituisce { piano, richiesto, coerente, setter[], abusatori[], nucleo[] }:
    // `piano` è quello realizzato (se il richiesto non regge diventa "bilanciato": meglio un team onesto che un'etichetta falsa).
    function strategiaDelTeam(richiesto, info) {
        const mosseDi = i => i.mosse.map(m => m.id);
        const attacca = i => i.mosse.some(m => m.categoria !== 'Status');
        const abil = i => id(i.abilita || '');
        const nomi = lista => lista.map(i => i.cand.nome);
        let setter = [], abusatori = [], coerente = true;
        if (richiesto === 'tailwind') {
            setter = info.filter(i => mosseDi(i).includes('tailwind'));
            abusatori = info.filter(i => !setter.includes(i) && attacca(i) && i.cand.basi.spe >= 40);
            coerente = setter.length >= 1 && abusatori.length >= 2;
        } else if (richiesto === 'trickroom') {
            setter = info.filter(i => mosseDi(i).includes('trickroom'));
            abusatori = info.filter(i => attacca(i) && i.cand.lento && i.cand.offesa >= 95);
            coerente = setter.length >= 1 && abusatori.length >= 2;
        } else if (SETTER[richiesto]) {
            setter = info.filter(i => SETTER[richiesto].includes(abil(i)));
            abusatori = info.filter(i => !setter.includes(i) && attacca(i) && (SFRUTTATORI[richiesto].includes(abil(i)) ||
                (i.mosse.some(m => m.categoria !== 'Status' && m.tipo === TIPO_METEO[richiesto]) && i.cand.offesa >= 80)));
            coerente = setter.length >= 1 && abusatori.length >= 1;
        } else {
            // bilanciato, offensivo, bulky: il nucleo sono i due Pokémon di maggior valore
            abusatori = info.slice().sort((a, b) => b.cand.valore - a.cand.valore).slice(0, 2);
        }
        const piano = coerente ? richiesto : 'bilanciato';
        return {
            piano, richiesto, coerente, trovati: { setter: setter.length, abusatori: abusatori.length },
            setter: coerente ? nomi(setter) : [], abusatori: coerente ? nomi(abusatori).slice(0, 3) : [],
            nucleo: coerente ? Array.from(new Set(nomi(setter).concat(nomi(abusatori)))).slice(0, 4) : []
        };
    }

    function sovrapposizione(a, b) { return Array.from(new Set(a)).filter(x => b.includes(x)).length; }   // per specie: le copie non contano due volte
    const chiaveUso = c => id(c.base.baseSpecies || c.base.name);

    // Il cuore, in tre pezzi:
    //   preparaFormato(): la parte lenta. Dal pool si scelgono i candidati e di ognuno si leggono le mosse che può imparare (il
    //                     validatore del simulatore le controlla una per una). Si fa una volta per formato e si può tenere in memoria;
    //   costruisciTeam(): dati i sei membri e il piano, i set (mosse, strumento, abilità, natura, EV) e la strategia verificata;
    //   generaTeam():     una dozzina di team in fila, sempre gli stessi per lo stesso seme (i test);
    //   unTeam():         un team solo, a caso, da una preparazione già fatta (la prova contro la CPU, un team per ogni sfida).
    //   opzioni: { Dex, TeamValidator, pool, regolamento, seme, pokedexBase, consigli }   (consigli: i dati di consigli.js della generazione, se ci sono)
    // `rnd` è il generatore da cui la preparazione pesca i candidati fuori dal comune: generaTeam gli passa il suo (la serie di numeri
    // continua nella composizione dei team), una sessione lo ricava dal seme del formato.
    async function preparaFormato(opzioni, rnd = creaCasuale(opzioni.seme || 'cpu')) {
        const { Dex, TeamValidator } = opzioni;
        const regolamento = opzioni.regolamento;
        const ctx = contestoDa(regolamento);
        const dex = Dex.forGen(ctx.gen);
        const restrizioni = regolamento.restrizioni || {};
        const avvisi = [];
        const mosseBandite = nome => voceBannata(restrizioni, 'mosse', nome);
        const abilitaBandite = nome => voceBannata(restrizioni, 'abilita', nome);
        if (restrizioni.mosse && Object.values(restrizioni.mosse).some(r => r && r.mode === 'SAME_ACROSS_TEAM')) avvisi.push('Rule not supported by the CPU: same move property across the team');
        if (restrizioni.strumenti && Object.values(restrizioni.strumenti).some(r => r && r.mode === 'SAME_ACROSS_TEAM')) avvisi.push('Rule not supported by the CPU: same item property across the team');

        let validatore = null;
        if (TeamValidator) {
            const candidati = [`gen${ctx.gen}anythinggoes`, `gen${ctx.gen}ubers`, `gen${ctx.gen}ou`];
            const f = candidati.find(x => Dex.formats.get(x).exists);
            if (f) validatore = TeamValidator.get(f);
        }

        // 1) i candidati: i più forti del formato, più qualche scelta fuori dal comune
        const ordinati = opzioni.pool.map(v => {
            const s = dex.species.get(v.id);
            const t = ctx.doppio ? s.doublesTier : s.tier;
            // Anything Goose: conta anche quanto il Pokémon colpisce forte (a parità di tier vince chi attacca di più)
            const potenza = ctx.goose ? Math.max(s.baseStats.atk, s.baseStats.spa) / 10 : 0;
            return { v, valore: puntiTier(t) * 18 + (s.bst || 0) / 12 + potenza + rnd() * 4 };
        }).sort((a, b) => b.valore - a.valore);
        const MAX_CAND = 130;
        const NUM_FISSI = ctx.goose ? 85 : 100;
        const fissi = ordinati.slice(0, Math.min(ordinati.length, NUM_FISSI));
        const resto = ordinati.slice(fissi.length);
        const extra = [];
        for (let i = 0; i < MAX_CAND - NUM_FISSI && resto.length; i++) extra.push(resto.splice(Math.floor(rnd() * resto.length), 1)[0]);
        const voci = fissi.concat(extra).slice(0, MAX_CAND).map(x => x.v);

        const cand = [];
        for (const voce of voci) {
            const c = await analizza(dex, validatore, voce, ctx, restrizioni, mosseBandite, abilitaBandite, opzioni.pokedexBase);
            if (c) { c.cons = consigliDi(opzioni.consigli, c, ctx); cand.push(c); }
        }
        if (cand.length < 6) {
            return { insufficiente: true, avvisi: avvisi.concat(`Not enough Pokémon in this format for the CPU (${cand.length} usable)`) };
        }

        return {
            insufficiente: false, avvisi, dex, ctx, restrizioni, cand,
            tipi: K.tipiDellaGenerazione(dex),
            piani: pianiDelFormato(cand, ctx),
            natura: naturaImposta(restrizioni),
            // gli assi: i più forti, distinti per specie
            assi: cand.slice().sort((a, b) => b.valore - a.valore)
        };
    }

    // Dai sei membri e dal piano: set e strategia. null se un Pokémon non riesce ad avere nemmeno una mossa.
    function costruisciTeam(prep, rnd, membri, piano, asso) {
        const { dex, ctx, restrizioni, natura } = prep;
        const assegnati = assegnaRuoli(dex, membri, ctx, piano);
        const usati = new Set();
        const testi = [];
        const infoMembri = [];
        for (const c of membri) {
            const ruolo = ruoloDi(c, ctx, piano, assegnati);
            ruolo.dex = dex;
            const tera = ctx.gen >= 9 ? scegliTera(c, mosseDelSet(c, ruolo, ctx, piano), rnd) : null;
            const s = testoSet(c, ctx, ruolo, piano, restrizioni, usati, tera, natura);
            if (s.mosse.length < 1) return null;
            testi.push(s.testo);
            infoMembri.push({ cand: c, mosse: s.mosse, abilita: s.abilita, strumento: s.strumento });
        }
        // Gen 7 con le meccaniche: un Cristallo Z al posto dello strumento di chi ne ha più bisogno
        const z = cristalloZDelTeam(dex, ctx, restrizioni, usati, infoMembri);
        if (z) {
            const vecchio = infoMembri[z.i].strumento;
            if (vecchio) usati.delete(id(vecchio));
            usati.add(z.it.id);
            const righe = testi[z.i].split('\n');
            righe[0] = `${membri[z.i].nome} @ ${z.it.name}`;
            testi[z.i] = righe.join('\n');
            infoMembri[z.i].strumento = z.it.name;
        }
        // il piano vale solo se i set lo realizzano (altrimenti il team è "bilanciato" e basta)
        const strategia = strategiaDelTeam(piano.nome, infoMembri);
        return {
            nome: `CPU ${ETICHETTE[strategia.piano] || strategia.piano} · ${asso.nome}`,
            piano: strategia.piano,
            strategia,
            testo: testi.join('\n\n'),
            specie: membri.map(m => m.nome)
        };
    }

    // Il Pokémon di un team conta per la sua specie base (due forme dello stesso Pokémon sono lo stesso Pokémon)
    const pianoDi = nome => ({ nome, pesoValore: nome === 'bilanciato' ? 1.1 : 1 });

    // Una dozzina di team (o quanti ne servono), deterministici: stesso formato e stesso seme, stessi team.
    // Restituisce { team: [{ nome, piano, strategia, testo, specie[] }], avvisi: [] }
    async function generaTeam(opzioni) {
        const quanti = opzioni.quanti || 12;
        const rnd = creaCasuale(opzioni.seme || 'cpu');
        const prep = await preparaFormato(opzioni, rnd);
        if (prep.insufficiente) return { team: [], avvisi: prep.avvisi };

        const { dex, ctx, cand, tipi, piani, assi } = prep;
        const usoGlobale = new Map();
        const massimo = Math.max(2, Math.ceil(quanti / 3));
        const team = [];
        const firme = [];

        for (let tentativo = 0; tentativo < quanti * 6 && team.length < quanti; tentativo++) {
            const n = team.length;
            const piano = pianoDi(piani[(n + Math.floor(tentativo / quanti)) % piani.length]);
            // asso: tra i migliori ancora poco usati
            const poolAssi = assi.filter(c => (usoGlobale.get(chiaveUso(c)) || 0) < massimo).slice(0, 24);
            if (!poolAssi.length) break;
            const asso = poolAssi[Math.floor(rnd() * Math.min(poolAssi.length, 8 + tentativo))] || poolAssi[0];
            const membri = compone(dex, cand, ctx, piano, rnd, usoGlobale, asso, tipi, massimo);
            if (membri.length < 6) continue;
            const specie = membri.map(chiaveUso);
            // team troppo simile a uno già fatto: si riprova
            if (firme.some(f => sovrapposizione(f, specie) >= 4)) continue;

            const fatto = costruisciTeam(prep, rnd, membri, piano, asso);
            if (!fatto) continue;
            team.push(fatto);
            firme.push(specie);
            new Set(specie).forEach(x => usoGlobale.set(x, (usoGlobale.get(x) || 0) + 1));   // un team conta una volta per specie, anche con le copie
        }
        return { team, avvisi: prep.avvisi };
    }

    // Un team solo, a caso, da una preparazione già fatta (preparaFormato). Piano e asso sono a caso; `recenti` sono i team già
    // incontrati nella sessione (liste di `chiavi`): chi vi compare spesso pesa meno e un team con quattro Pokémon uguali a uno
    // di quelli non si fa. Restituisce il team (con `chiavi`, da passare poi tra i `recenti`) o null.
    function unTeam(prep, rnd, { recenti = [] } = {}) {
        const { dex, ctx, cand, tipi, piani, assi } = prep;
        const massimo = 2;
        // Prima si cerca un team che non somigli ai recenti; se il formato ha pochi Pokémon (una sola lettera, un solo tipo) può non
        // esserci, e allora ci si accontenta: meglio un team un po' simile che nessun team.
        for (const evita of recenti.length ? [recenti, []] : [[]]) {
            const usoGlobale = new Map();
            for (const chiavi of evita) for (const k of chiavi) usoGlobale.set(k, (usoGlobale.get(k) || 0) + 1);
            for (let tentativo = 0; tentativo < (evita.length ? 10 : 6); tentativo++) {
                const piano = pianoDi(piani[Math.floor(rnd() * piani.length)]);
                const poolAssi = assi.filter(c => (usoGlobale.get(chiaveUso(c)) || 0) < massimo).slice(0, 24);
                if (!poolAssi.length) break;
                const asso = poolAssi[Math.floor(rnd() * Math.min(poolAssi.length, 8 + Math.floor(rnd() * 12)))] || poolAssi[0];
                const membri = compone(dex, cand, ctx, piano, rnd, usoGlobale, asso, tipi, massimo);
                if (membri.length < 6) continue;
                const chiavi = Array.from(new Set(membri.map(chiaveUso)));
                if (evita.some(f => sovrapposizione(f, chiavi) >= 4)) continue;
                const fatto = costruisciTeam(prep, rnd, membri, piano, asso);
                if (fatto) return Object.assign(fatto, { chiavi });
            }
        }
        return null;
    }

    // =================================================
    // DAL REGOLAMENTO AI TEAM
    // =================================================
    // Gestisce le scelte che alcuni formati lasciano a chi compone il team:
    //   - iniziale del nome (name_starts = PLAYER_INITIAL): la CPU usa le iniziali date, o una a caso con abbastanza Pokémon;
    //   - "stesso ... in tutto il team" (SAME_ACROSS_TEAM): un valore diverso per ogni team, tra quelli con abbastanza Pokémon.
    // Ognuna di queste scelte è una "variante" del regolamento, con il suo pool di Pokémon.
    // opzioni: { regolamento, caricaJson, pokedexBase, consigli, iniziali }
    // Restituisce { varianti: [{ regolamento, etichetta, pool?, scelte? }], pokedexBase, consigli, poolDi(regolamento) }
    async function elencaVarianti(opzioni) {
        const regolamento = opzioni.regolamento;
        const caricaJson = opzioni.caricaJson;
        let pokedexBase = opzioni.pokedexBase;
        if (!pokedexBase) pokedexBase = Pool.minuscole(await caricaJson('pkm-gens/pokedex_base.json'));
        // i consigli (mosse, strumenti, abilità di solito giocati) della generazione: senza il file i team si fanno lo stesso
        let consigli = opzioni.consigli;
        if (consigli === undefined && Consigli) consigli = await Consigli.carica(generazioneFormato(regolamento), caricaJson);

        const rPoke = regolamento.restrizioni && regolamento.restrizioni.pokemon;
        const nameStarts = rPoke && rPoke.name_starts;
        const same = Pool.chiaviSameAcross(regolamento);

        // varianti del regolamento: ognuna produce un gruppo di team
        let varianti = [{ regolamento, etichetta: '' }];
        const poolDi = async (reg, opz) => (await Pool.caricaPool(reg, caricaJson, Object.assign({ pokedexBase }, opz || {}))).pokemon;

        if (nameStarts && nameStarts.mode === 'PLAYER_INITIAL') {
            const reg0 = JSON.parse(JSON.stringify(regolamento));
            let lettere = (opzioni.iniziali || []).map(x => String(x).trim().charAt(0).toLowerCase()).filter(Boolean);
            if (!lettere.length) {
                // tutte le lettere con almeno 9 Pokémon nel pool: se ne pescano a caso
                const tutti = await poolDi(Object.assign({}, reg0, { restrizioni: Object.assign({}, reg0.restrizioni, { pokemon: Object.assign({}, reg0.restrizioni.pokemon, { name_starts: undefined }) }) }));
                const conta = {};
                tutti.forEach(p => { const l = p.name.charAt(0).toLowerCase(); conta[l] = (conta[l] || 0) + 1; });
                lettere = Object.keys(conta).filter(l => conta[l] >= 9).sort();
            }
            varianti = lettere.map(l => {
                const reg = JSON.parse(JSON.stringify(regolamento));
                reg.restrizioni.pokemon.name_starts = { mode: 'VALUE', operator: 'STARTS_WITH', value: l };
                return { regolamento: reg, etichetta: l.toUpperCase() };
            });
        }

        if (same.length) {
            const ampliate = [];
            for (const v of varianti) {
                const base = Pool.senzaSameAcross(v.regolamento);
                const pool = await poolDi(base);
                // tutte le combinazioni di valori (di solito è una sola caratteristica)
                let combinazioni = [{}];
                for (const chiave of same) {
                    const conteggio = Pool.valoriPossibili(pokedexBase, pool, chiave);
                    const valori = Object.keys(conteggio).filter(x => conteggio[x] >= 8);
                    const nuove = [];
                    for (const c of combinazioni) for (const val of valori) nuove.push(Object.assign({}, c, { [chiave]: val }));
                    combinazioni = nuove;
                }
                combinazioni.forEach(c => ampliate.push({ regolamento: v.regolamento, base, pool, scelte: c, etichetta: [v.etichetta].concat(Object.values(c)).filter(Boolean).join(' ') }));
            }
            varianti = ampliate;
        }
        return { varianti, pokedexBase, consigli, poolDi };
    }

    // Il pool di una variante (i Pokémon che quella variante ammette)
    async function poolDellaVariante(v, pokedexBase, poolDi) {
        if (v.scelte) return v.pool.filter(p => Object.keys(v.scelte).every(k => Pool.corrispondeAllaScelta(pokedexBase, p, k, v.scelte[k])));
        return poolDi(v.regolamento);
    }

    // opzioni: { Dex, TeamValidator, regolamento, caricaJson, pokedexBase, quanti, seme, iniziali }
    async function squadrePerFormato(opzioni) {
        const regolamento = opzioni.regolamento;
        const quanti = opzioni.quanti || 12;
        const seme = opzioni.seme || ('cpu|' + (regolamento.categoria || '') + '|' + (regolamento.genRuleValue || ''));
        const rnd = creaCasuale(seme + '|orchestratore');
        const avvisi = [];
        const { varianti, pokedexBase, consigli, poolDi } = await elencaVarianti(opzioni);

        // numero di team per variante
        const perVariante = Math.max(1, Math.ceil(quanti / Math.max(1, varianti.length)));
        let scelte = varianti;
        if (varianti.length > quanti) {
            scelte = [];
            const copia = varianti.slice();
            while (scelte.length < quanti && copia.length) scelte.push(copia.splice(Math.floor(rnd() * copia.length), 1)[0]);
        }

        const out = [];
        for (let i = 0; i < scelte.length && out.length < quanti; i++) {
            const v = scelte[i];
            const pool = await poolDellaVariante(v, pokedexBase, poolDi);
            const quantiQui = Math.min(perVariante, quanti - out.length);
            const r = await generaTeam({
                Dex: opzioni.Dex, TeamValidator: opzioni.TeamValidator, pool, regolamento: v.regolamento,
                quanti: quantiQui, seme: `${seme}|${i}|${v.etichetta}`, pokedexBase, consigli
            });
            r.avvisi.forEach(a => avvisi.push(a));
            r.team.forEach(t => out.push(Object.assign(t, v.etichetta ? { nome: `${t.nome} (${v.etichetta})` } : {})));
        }
        // numerazione stabile
        out.forEach((t, i) => { t.numero = i + 1; });
        return { team: out, avvisi };
    }

    // =================================================
    // UN TEAM ALLA VOLTA (la prova contro la CPU)
    // =================================================
    // Invece di una dozzina di team fatti in anticipo e ricordati, il team si compone quando inizia la sfida, a caso.
    // La parte lenta (preparaFormato: leggere le mosse di un centinaio di Pokémon) si fa una volta per formato e per variante e si
    // tiene in memoria finché la pagina resta aperta: il primo team costa una frazione di secondo, quelli dopo pochi millisecondi.
    //   const sessione = await preparaSessione({ Dex, TeamValidator, regolamento, caricaJson, iniziali });
    //   const { team, avvisi } = await nuovoTeam(sessione, { recenti });     // team = null se il formato non ha abbastanza Pokémon
    async function preparaSessione(opzioni) {
        const { varianti, pokedexBase, consigli, poolDi } = await elencaVarianti(opzioni);
        const regolamento = opzioni.regolamento;
        const semeBase = opzioni.seme || ('cpu|' + (regolamento.categoria || '') + '|' + (regolamento.genRuleValue || ''));
        return { opzioni, varianti, pokedexBase, consigli, poolDi, semeBase, preparati: new Map() };
    }

    // La preparazione di una variante, la prima volta; poi quella in memoria (anche se due richieste arrivano insieme)
    function preparaVariante(sessione, indice) {
        if (!sessione.preparati.has(indice)) {
            const v = sessione.varianti[indice];
            const lavoro = (async () => {
                const pool = await poolDellaVariante(v, sessione.pokedexBase, sessione.poolDi);
                // la scelta dei candidati fuori dal comune dipende solo dal formato: così la preparazione è sempre la stessa
                return preparaFormato({
                    Dex: sessione.opzioni.Dex, TeamValidator: sessione.opzioni.TeamValidator, pool, regolamento: v.regolamento,
                    pokedexBase: sessione.pokedexBase, consigli: sessione.consigli
                }, creaCasuale(`${sessione.semeBase}|prep|${indice}|${v.etichetta}`));
            })();
            // un errore (rete...) non si ricorda: la volta dopo si riprova
            lavoro.catch(() => sessione.preparati.delete(indice));
            sessione.preparati.set(indice, lavoro);
        }
        return sessione.preparati.get(indice);
    }

    // opzioni: { seme (a caso se manca), recenti: [chiavi di team già incontrati], variantiDaProvare }
    async function nuovoTeam(sessione, opzioni = {}) {
        const rnd = creaCasuale(opzioni.seme || `${Date.now()}|${Math.random()}`);
        const recenti = opzioni.recenti || [];
        const ordine = sessione.varianti.map((_, i) => i);
        for (let i = ordine.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ordine[i], ordine[j]] = [ordine[j], ordine[i]]; }
        const avvisi = [];
        // una variante può non avere abbastanza Pokémon (una lettera rara): se ne prova un'altra
        for (const i of ordine.slice(0, opzioni.variantiDaProvare || 4)) {
            const prep = await preparaVariante(sessione, i);
            prep.avvisi.forEach(a => { if (!avvisi.includes(a)) avvisi.push(a); });
            if (prep.insufficiente) continue;
            const team = unTeam(prep, rnd, { recenti });
            if (!team) continue;
            const etichetta = sessione.varianti[i].etichetta;
            if (etichetta) team.nome = `${team.nome} (${etichetta})`;
            return { team, avvisi };
        }
        return { team: null, avvisi };
    }

    return {
        generaTeam, squadrePerFormato, preparaFormato, unTeam, preparaSessione, nuovoTeam,
        contestoDa, generazioneFormato, livelloFormato, formatoInDoppio, meccaniche, mosseApprese,
        voceBannata, creaCasuale, puntiTier, datiStrumento, strategiaDelTeam
    };
});
