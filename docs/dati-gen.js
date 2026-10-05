// =====================================================
// DATI PER GENERAZIONE
//
// I dati che il sito legge (Pokédex e mosse di Showdown, PokeAPI, pokedex_base.json) sono quelli di oggi (Gen 9). In un formato di una
// generazione precedente vanno rimessi com'erano allora: Mawile in Gen 4 è solo Acciaio (il tipo Folletto arriva in Gen 6), Bite in Gen 3
// è una mossa speciale, i Pokémon hanno statistiche e abilità diverse, la tabella dei tipi cambia.
// Le differenze stanno in pkm-gens/delta-gen1.json ... delta-gen8.json, generate da tools/genera-dati-gen.cjs dal simulatore: qui si
// caricano e si applicano. Nessun riferimento al DOM.
//
//   const delta = await DatiGen.carica(4);              // null per la Gen 9 (i dati di oggi sono già giusti)
//   DatiGen.applicaAlPokedex(tbDex.pokedex, delta);      // tipi, statistiche, abilità
//   DatiGen.applicaAlleMosse(tbDex.moves, delta);        // tipo, categoria, potenza, precisione, PP, priorità
//   DatiGen.moltiplicatore(delta, 'Ghost', 'Steel', 0)   // la tabella dei tipi di quella generazione
// Ogni "applica" prima rimette a posto quello che aveva cambiato la volta prima: si può passare da una generazione all'altra.
//
// Funziona nel browser (window.DatiGen) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.DatiGen = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const GEN_ATTUALE = 9;
    const STAT = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    const idDi = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, '');
    const maiuscola = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

    // Il tipo Folletto arriva in Gen 6, Buio e Acciaio in Gen 2: prima di quella generazione non esistono (come attaccanti né come difensori)
    const TIPI_ARRIVATI = { Dark: 2, Steel: 2, Fairy: 6 };
    const TUTTI_I_TIPI = ['Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock',
        'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
    const tipiEsistenti = gen => TUTTI_I_TIPI.filter(t => (TIPI_ARRIVATI[t] || 1) <= (gen || GEN_ATTUALE));

    function generazioneValida(gen) {
        const n = parseInt(gen, 10);
        return Number.isFinite(n) && n >= 1 && n <= 8 ? n : null;     // null: Gen 9 o generazione sconosciuta = dati di oggi
    }

    // -----------------------------------------------------
    // 1. CARICAMENTO
    // -----------------------------------------------------
    const url = gen => { const n = generazioneValida(gen); return n ? `pkm-gens/delta-gen${n}.json` : null; };
    const cache = {};

    /** Il delta di una generazione (una volta sola per generazione), null per la Gen 9. `leggi(url)` restituisce il JSON (default: fetch). */
    function carica(gen, leggi) {
        const n = generazioneValida(gen);
        if (!n) return Promise.resolve(null);
        if (!cache[n]) {
            const leggiJson = leggi || (u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }));
            cache[n] = Promise.resolve().then(() => leggiJson(url(n))).catch(err => { delete cache[n]; throw err; });
        }
        return cache[n];
    }

    // -----------------------------------------------------
    // 2. LETTURE PUNTUALI
    // -----------------------------------------------------
    const specieDi = (delta, id) => (delta && delta.specie && delta.specie[idDi(id)]) || null;
    const mossaDi = (delta, id) => (delta && delta.mosse && delta.mosse[idDi(id)]) || null;

    /** I tipi di una specie in quella generazione: `tipiOggi` se non cambiano. */
    function tipiSpecie(delta, id, tipiOggi) {
        const d = specieDi(delta, id);
        return d && d.t ? d.t.slice() : (tipiOggi || []).slice();
    }

    /** Le statistiche base [hp, atk, def, spa, spd, spe] di una specie in quella generazione, null se non cambiano. */
    function statSpecie(delta, id) {
        const d = specieDi(delta, id);
        return d && d.s ? d.s.slice() : null;
    }

    /** Le abilità di una specie in quella generazione, { 0, 1, H, S }. L'abilità nascosta c'è solo dalla Gen 5. */
    function abilitaSpecie(delta, id, abilitaOggi, gen) {
        const d = specieDi(delta, id);
        const o = {};
        for (const [k, v] of Object.entries((d && d.a) || abilitaOggi || {})) if (v && !(k === 'H' && (gen || GEN_ATTUALE) < 5)) o[k] = v;
        return o;
    }

    /** Il moltiplicatore di un attacco su un tipo difensore in quella generazione (`oggi` è quello di oggi, se la tabella non cambia). */
    function moltiplicatore(delta, attacco, difensore, oggi) {
        const d = delta && delta.tipi && delta.tipi[difensore];
        return d && d[attacco] !== undefined ? d[attacco] : oggi;
    }

    /** I tipi che esistono in quella generazione (tutti quelli di oggi per la Gen 9). */
    function tipiDellaGenerazione(delta, gen) {
        return delta && delta.esistenti ? delta.esistenti.slice() : tipiEsistenti(gen);
    }

    // -----------------------------------------------------
    // 3. APPLICARE LE DIFFERENZE (con la possibilità di tornare indietro)
    // -----------------------------------------------------
    // Ogni oggetto toccato ricorda i valori di prima: `ripristina()` li rimette, e una nuova `applica` parte sempre dai dati di oggi.
    function creaApplicatore() {
        const salvati = new Map();
        return {
            imposta(oggetto, campo, valore) {
                let s = salvati.get(oggetto);
                if (!s) salvati.set(oggetto, s = {});
                if (!(campo in s)) s[campo] = oggetto[campo];
                oggetto[campo] = valore;
            },
            ripristina() {
                for (const [oggetto, campi] of salvati) for (const [campo, valore] of Object.entries(campi)) oggetto[campo] = valore;
                salvati.clear();
            },
            tocchi() { return salvati.size; }
        };
    }
    const applicatori = new WeakMap();
    const applicatoreDi = contenitore => {
        if (!applicatori.has(contenitore)) applicatori.set(contenitore, creaApplicatore());
        return applicatori.get(contenitore);
    };

    /** Pokédex di Showdown ({ id: { types, baseStats, abilities } }). Con delta null rimette i dati di oggi. */
    function applicaAlPokedex(pokedex, delta) {
        if (!pokedex) return pokedex;
        const a = applicatoreDi(pokedex);
        a.ripristina();
        const specie = (delta && delta.specie) || {};
        for (const id of Object.keys(specie)) {
            const sp = pokedex[id], d = specie[id];
            if (!sp) continue;
            if (d.t) a.imposta(sp, 'types', d.t.slice());
            if (d.s) a.imposta(sp, 'baseStats', Object.fromEntries(STAT.map((k, i) => [k, d.s[i]])));
            if (d.a) a.imposta(sp, 'abilities', Object.assign({}, d.a));
        }
        return pokedex;
    }

    /** Mosse di Showdown ({ id: { type, category, basePower, accuracy, pp, priority } }). */
    function applicaAlleMosse(mosse, delta) {
        if (!mosse) return mosse;
        const a = applicatoreDi(mosse);
        a.ripristina();
        const lista = (delta && delta.mosse) || {};
        for (const id of Object.keys(lista)) {
            const m = mosse[id], d = lista[id];
            if (!m) continue;
            if (d.t !== undefined) a.imposta(m, 'type', d.t);
            if (d.c !== undefined) a.imposta(m, 'category', d.c);
            if (d.p !== undefined) a.imposta(m, 'basePower', d.p);
            if (d.a !== undefined) a.imposta(m, 'accuracy', d.a);
            if (d.pp !== undefined) a.imposta(m, 'pp', d.pp);
            if (d.pr !== undefined) a.imposta(m, 'priority', d.pr);
        }
        return mosse;
    }

    const STAT_POKEDEX_BASE = { hp: 'hp', atk: 'attack', def: 'defense', spa: 'sp. attack', spd: 'sp. defense', spe: 'speed' };

    /** pokedex_base.json (voci con type, stats, bst, highest_stat, abilities). Le voci possono comparire sotto più chiavi: si tocca ognuna una volta. */
    function applicaAPokedexBase(base, delta) {
        if (!base) return base;
        const a = applicatoreDi(base);
        a.ripristina();
        const specie = (delta && delta.specie) || {};
        const viste = new Set();
        for (const chiave of Object.keys(base)) {
            const voce = base[chiave];
            if (!voce || typeof voce !== 'object' || viste.has(voce)) continue;
            viste.add(voce);
            const d = specie[idDi(voce.name || chiave)];
            if (!d) continue;
            if (d.t) a.imposta(voce, 'type', d.t.map(t => t.toLowerCase()));
            if (d.s) {
                const stats = {};
                STAT.forEach((k, i) => { stats[STAT_POKEDEX_BASE[k]] = d.s[i]; });
                a.imposta(voce, 'stats', stats);
                a.imposta(voce, 'bst', d.s.reduce((t, v) => t + v, 0));
                const max = Math.max(...d.s);
                a.imposta(voce, 'highest_stat', STAT.filter((k, i) => d.s[i] === max).map(k => STAT_POKEDEX_BASE[k]));
            }
            if (d.a) a.imposta(voce, 'abilities', Object.values(d.a));
        }
        return base;
    }

    // -----------------------------------------------------
    // 4. RISPOSTE DI POKEAPI (sempre di oggi)
    // -----------------------------------------------------
    const STAT_POKEAPI = { hp: 'hp', attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe' };

    /** La risposta di /pokemon/<nome> con tipi e statistiche di quella generazione (restituisce una copia, l'originale non si tocca). */
    function rettificaPokemonPokeApi(json, delta) {
        if (!json || !delta) return json;
        const d = specieDi(delta, json.name);
        if (!d) return json;
        const copia = Object.assign({}, json);
        if (d.t) copia.types = d.t.map((t, i) => ({ slot: i + 1, type: { name: t.toLowerCase(), url: '' } }));
        if (d.s && Array.isArray(json.stats)) {
            copia.stats = json.stats.map(s => {
                const k = STAT_POKEAPI[s.stat && s.stat.name];
                const i = k ? STAT.indexOf(k) : -1;
                return i >= 0 ? Object.assign({}, s, { base_stat: d.s[i] }) : s;
            });
        }
        return copia;
    }

    /** La risposta di /move/<nome> con tipo, categoria, potenza, precisione, PP e priorità di quella generazione. */
    function rettificaMossaPokeApi(json, delta) {
        if (!json || !delta) return json;
        const d = mossaDi(delta, json.name);
        if (!d) return json;
        const copia = Object.assign({}, json);
        if (d.t !== undefined) copia.type = { name: d.t.toLowerCase(), url: '' };
        if (d.c !== undefined) copia.damage_class = { name: d.c.toLowerCase(), url: '' };
        if (d.p !== undefined) copia.power = d.p || null;
        if (d.a !== undefined) copia.accuracy = d.a === true ? null : d.a;
        if (d.pp !== undefined) copia.pp = d.pp;
        if (d.pr !== undefined) copia.priority = d.pr;
        return copia;
    }

    /**
     * Come fetch() per gli indirizzi di PokeAPI /pokemon/<nome> e /move/<nome>: con un delta restituisce una risposta con i dati di quella
     * generazione (tipi, statistiche; tipo, categoria, potenza, precisione, PP, priorità). Qualsiasi altro indirizzo passa com'è.
     */
    function fetchPokeApi(indirizzo, delta, leggi) {
        const prendi = leggi || (typeof fetch === 'function' ? fetch : null);
        const m = delta && /\/api\/v2\/(pokemon|move)\/[^/?#]+/.exec(String(indirizzo));
        if (!m) return prendi(indirizzo);
        return prendi(indirizzo).then(async res => {
            if (!res.ok) return res;
            const json = await res.json();
            const modificato = m[1] === 'pokemon' ? rettificaPokemonPokeApi(json, delta) : rettificaMossaPokeApi(json, delta);
            return { ok: true, status: res.status, json: async () => modificato };
        });
    }

    /**
     * Quanto prende un Pokémon con questi tipi da ogni tipo, nella generazione del delta (PokeAPI dà le relazioni di oggi: qui si
     * correggono con la tabella di allora, e i tipi che non esistono ancora non compaiono). { tipo: moltiplicatore } con i nomi in minuscolo.
     * `leggiTipo(nome)` restituisce la risposta di PokeAPI /type/<nome> (default: fetch).
     */
    async function moltiplicatoriContro(tipiDifesa, delta, leggiTipo) {
        const esistenti = tipiDellaGenerazione(delta, GEN_ATTUALE).map(t => t.toLowerCase());
        const prendi = leggiTipo || (nome => fetch(`https://pokeapi.co/api/v2/type/${nome}`).then(r => r.json()));
        const efficacia = {};
        esistenti.forEach(t => { efficacia[t] = 1; });
        await Promise.all((tipiDifesa || []).map(async nomeTipo => {
            const rel = (await prendi(nomeTipo)).damage_relations;
            const nomi = lista => new Set((lista || []).map(t => t.name));
            const doppio = nomi(rel.double_damage_from), meta = nomi(rel.half_damage_from), niente = nomi(rel.no_damage_from);
            for (const att of esistenti) {
                const oggi = niente.has(att) ? 0 : doppio.has(att) ? 2 : meta.has(att) ? 0.5 : 1;
                efficacia[att] *= moltiplicatore(delta, maiuscola(att), maiuscola(nomeTipo), oggi);
            }
        }));
        return efficacia;
    }

    /**
     * Il payload che box.html prepara per la validazione (preparaDatiTeamPerValidazione): tipi, BST, statistica migliore e dati delle mosse
     * di quella generazione. Cambia l'oggetto e lo restituisce.
     */
    function rettificaDatiValidazione(pkmn, delta) {
        if (!pkmn || !delta || pkmn.erroreDati) return pkmn;
        const d = specieDi(delta, pkmn.idPokeAPI || pkmn.name);
        if (d && d.t) pkmn.type = d.t.map(maiuscola);
        if (d && d.s) {
            pkmn.bst = d.s.reduce((t, v) => t + v, 0);
            const nomi = ['HP', 'Attack', 'Defense', 'Sp. Attack', 'Sp. defense', 'Speed'];
            pkmn.highest_stat = nomi[d.s.indexOf(Math.max(...d.s))];
        }
        for (const m of pkmn.movesData || []) {
            const dm = mossaDi(delta, m.name);
            if (!dm) continue;
            if (dm.t !== undefined) m.type = dm.t;
            if (dm.c !== undefined) m.category = dm.c;
            if (dm.p !== undefined) m.power = dm.p || 0;
            if (dm.a !== undefined) m.accuracy = dm.a === true ? 100 : dm.a;
            if (dm.pp !== undefined) m.max_pp = dm.pp;
            if (dm.pr !== undefined) m.priority = dm.pr;
        }
        return pkmn;
    }

    // -----------------------------------------------------
    // 5. COERENZA DI UN SET CON LA GENERAZIONE
    // -----------------------------------------------------
    /**
     * Un set (specie, abilità, strumento, mosse) è possibile in quella generazione? Elenca i problemi.
     *   set:    { nome, abilita, strumento, mosse: [nomi] }
     *   fonti:  { specie: { abilities: {0,1,H,S} } | null, abilitaGen(nome): n | null (null = non esiste), strumentoGen(nome), mossaGen(nome) }
     * Le fonti leggono i dati di Showdown (box.html li ha già caricati per il Team Builder): qui solo il confronto.
     */
    function controllaSet(set, gen, delta, fonti) {
        const problemi = [];
        const nome = set.nome || 'Pokémon';
        const g = gen || GEN_ATTUALE;
        if (set.abilita && g >= 3) {
            const nascita = fonti.abilitaGen(set.abilita);
            if (nascita === null || nascita > g) problemi.push(`${nome}: the ability ${set.abilita} does not exist in Gen ${g}.`);
            else if (fonti.specie) {
                const legali = Object.values(abilitaSpecie(delta, idDi(set.id || set.nome), fonti.specie.abilities, g)).map(idDi);
                if (legali.length && !legali.includes(idDi(set.abilita))) problemi.push(`${nome}: ${set.abilita} is not one of its abilities in Gen ${g}.`);
            }
        }
        if (set.strumento && set.strumento.toLowerCase() !== 'none') {
            const nascita = fonti.strumentoGen(set.strumento);
            if (nascita === null || nascita > g) problemi.push(`${nome}: ${set.strumento} does not exist in Gen ${g}.`);
        }
        for (const mossa of set.mosse || []) {
            if (!mossa) continue;
            const nascita = fonti.mossaGen(mossa);
            if (nascita === null || nascita > g) problemi.push(`${nome}: ${mossa} does not exist in Gen ${g}.`);
        }
        return problemi;
    }

    return {
        GEN_ATTUALE, TUTTI_I_TIPI, url, carica, generazioneValida,
        specieDi, mossaDi, tipiSpecie, statSpecie, abilitaSpecie, moltiplicatore, tipiDellaGenerazione, tipiEsistenti,
        creaApplicatore, applicaAlPokedex, applicaAlleMosse, applicaAPokedexBase,
        rettificaPokemonPokeApi, rettificaMossaPokeApi, fetchPokeApi, moltiplicatoriContro, rettificaDatiValidazione, controllaSet
    };
});
