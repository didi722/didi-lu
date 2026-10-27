// =====================================================
// SCALA DEI POKÉMON — quanto è alto un Pokémon sul palco, e se sta a terra o fluttua
// ---------------------------------------------------------------------
// Le regole sono quelle della pagina pubblica dell'allenatore (public-card.js e pagina-pubblica.js, scalaScena): altezza vera da PokeAPI, l'allenatore alto 1,70 m,
// qualche Pokémon rimpicciolito o ingrandito a mano (Kyogre, Wailord, Charizard...), chi vola (tipo Volante, abilità Levitazione, la lista di quelli che galleggiano) è
// staccato da terra, tranne la lista di quelli che volano per modo di dire e stanno a terra. Le liste qui sotto sono le stesse di public-card.js (le prove le confrontano).
// Due modi:
//   - con l'allenatore (scenaConAllenatore): il Pokémon è alto quanto lo sarebbe accanto a lui; se non sta nel palco si rimpicciolisce la scena intera, allenatore compreso;
//   - da solo (altezzaDaSolo), per le Stats dove non c'è nessun allenatore: i Pokémon sono in scala tra loro con una curva logaritmica, così Rayquaza resta più imponente
//     di Archen anche se non sta in un palco alto 15 metri, e un Joltik non sparisce ma si vede che è piccolo.
// Le misure vere sono in altezze-pkm.js (generato dai dati del simulatore: istantanee); le specie che non ci sono si leggono da PokeAPI una volta e si ricordano (anche
// tra una visita e l'altra).
// Funziona nel browser (window.ScalaPkm) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const S = fabbrica(radice);
    if (typeof module === 'object' && module.exports) module.exports = S;
    else radice.ScalaPkm = S;
})(typeof self !== 'undefined' ? self : this, function (radice) {
    'use strict';

    const FORME_SPECIALI = {
        mimikyu: 'mimikyu-disguised', giratina: 'giratina-altered', deoxys: 'deoxys-normal',
        shaymin: 'shaymin-land', aegislash: 'aegislash-shield'
    };
    const RIMPICCIOLISCI = ['kyogre', 'wailord'];
    const INGRANDISCI = ['charizard'];
    const A_TERRA = ['regieleki', 'iron-moth', 'poipole', 'naganadel', 'nihilego', 'cosmog', 'cosmoem', 'hoopa', 'sinistea', 'polteageist', 'sinistcha', 'poltchageist', 'phantump', 'runerigus', 'lampent', 'chandelure', 'gyarados', 'porygon', 'porygon-2', 'porygon-z', 'dodrio', 'umbreon', 'garchomp', 'murkrow', 'honchkrow', 'bronzong', 'scyther', 'tyranitar'];
    const GALLEGGIANO = ['yamask', 'cofagrigus', 'orbeetle', 'shedinja', 'castform', 'beedrill', 'dustox', 'venomoth', 'volcarona', 'ribombee', 'frosmoth', 'darkrai', 'celebi', 'jirachi', 'mew', 'reuniclus', 'florges', 'magnemite', 'magneton', 'magnezone', 'klefki', 'kyogre', 'haunter', 'lunala'];

    const ALTEZZA_ALLENATORE = 170;       // px di progetto
    const ALTEZZA_ALLENATORE_M = 1.7;
    const POKEMON_MIN = 90;               // px di progetto (su un allenatore di 170)
    const POKEMON_MAX = 255;
    const POKEMON_MAX_IN_VOLO = 215;
    const ALLENATORE_MIN = 0.55;
    const ALTEZZA_NON_NOTA_M = 1.2;
    const CHIAVE_MEMORIA = 'scalaPkm1';

    /** "Mr. Mime" -> "mr-mime"; le forme senza nome di forma ("giratina") diventano quella base che PokeAPI conosce */
    function nomeApi(nome) {
        const n = String(nome == null ? '' : nome).toLowerCase().trim().replace(/ /g, '-').replace(/[.'é]/g, '');
        return FORME_SPECIALI[n] || n;
    }

    /** Il Pokémon fluttua? tipo Volante, Levitazione o nella lista di quelli che galleggiano; mai se è tra quelli che stanno a terra. */
    function fluttua(nome, tipi, abilita) {
        const n = nomeApi(nome);
        const vola = (tipi || []).includes('flying') || (abilita || []).includes('levitate') || GALLEGGIANO.includes(n) || n.includes('rayquaza');
        return vola && !A_TERRA.includes(n);
    }

    const regolaDi = nome => { const n = nomeApi(nome); return RIMPICCIOLISCI.includes(n) ? 'rimpicciolisci' : INGRANDISCI.includes(n) ? 'ingrandisci' : undefined; };

    /**
     * Pokémon accanto all'allenatore: stesse formule della pagina pubblica (scalaScena), ma in pixel dello schermo.
     * @param {number} altezzaM altezza vera
     * @param {{allenatorePx: number, spazioPx: number, vola?: boolean, regola?: string}} o
     *        allenatorePx: quanto è alto l'allenatore ora; spazioPx: quanto può essere alto al massimo il Pokémon sul palco (a terra)
     * @returns {{allenatore: number, pokemon: number, scala: number}} le altezze da usare (l'allenatore si rimpicciolisce se il Pokémon è troppo alto)
     */
    function scenaConAllenatore(altezzaM, o) {
        const { allenatorePx, spazioPx, vola = false, regola } = o || {};
        const k = allenatorePx / ALTEZZA_ALLENATORE;               // pixel dello schermo per pixel di progetto
        const altezza = Number(altezzaM) > 0 ? Number(altezzaM) : ALTEZZA_NON_NOTA_M;
        let px = altezza * ALTEZZA_ALLENATORE / ALTEZZA_ALLENATORE_M;
        if (regola === 'rimpicciolisci') px *= 0.5;
        else if (regola === 'ingrandisci') px *= 1.5;
        else if (altezza < 0.6) px *= 1.6;
        else if (altezza < 1.3) px *= 1.35;
        px = Math.max(px, POKEMON_MIN);
        const spazio = (vola ? POKEMON_MAX_IN_VOLO / POKEMON_MAX : 1) * (spazioPx / k);
        const scala = Math.max(Math.min(1, spazio / px), ALLENATORE_MIN);
        const pokemon = Math.min(px * scala, spazio);
        return { allenatore: allenatorePx * scala, pokemon: pokemon * k, scala };
    }

    /**
     * Pokémon da solo sul palco (Stats): una curva logaritmica sull'altezza vera, da 0,25 m (un quarto di palco circa) a 20 m (tutto il palco).
     * Rayquaza (7 m) viene alto l'80% circa, Archen (0,5 m) il 38%: l'imponenza resta, e il piccolo resta piccolo.
     */
    function altezzaDaSolo(altezzaM, palcoPx) {
        const MIN = 0.25, MAX = 20;
        const m = Math.min(Math.max(Number(altezzaM) > 0 ? Number(altezzaM) : ALTEZZA_NON_NOTA_M, MIN), MAX);
        const t = (Math.log(m) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN));
        return (0.26 + 0.74 * t) * palcoPx;
    }

    /** Di quanto è staccato da terra chi fluttua (px), in proporzione alla sua altezza */
    const sollevamento = altezzaPx => Math.round(altezzaPx * 0.2);

    // ---------- la lettura delle misure (solo nel browser) ----------

    const cache = new Map();         // nome api -> Promise<{ altezzaM, vola }>
    let memoria = null;              // quello che è salvato nel browser
    const leggiMemoria = () => {
        if (memoria) return memoria;
        try { memoria = JSON.parse(radice.localStorage.getItem(CHIAVE_MEMORIA) || '{}') || {}; } catch (e) { memoria = {}; }
        return memoria;
    };
    const scriviMemoria = () => { try { radice.localStorage.setItem(CHIAVE_MEMORIA, JSON.stringify(memoria)); } catch (e) { /* senza memoria si rilegge */ } };

    const pausa = ms => new Promise(r => radice.setTimeout(r, ms));

    /** La tabella delle altezze (altezze-pkm.js): nel browser, se la pagina l'ha caricata; in Node, il file */
    const tabella = () => {
        if (radice.AltezzePkm) return radice.AltezzePkm;
        try { return typeof module === 'object' && module.exports ? require('./altezze-pkm.js') : {}; } catch (e) { return {}; }
    };
    const dallaTabella = n => { const t = tabella(); const v = t[n] || (n.includes('-') ? t[n.split('-')[0]] : null); return v ? { altezzaM: v[0], vola: !!v[1] } : null; };

    /** PokeAPI, con un secondo tentativo se la rete si impunta (errore, 429, 5xx); una specie che non conosce (404) è null */
    async function leggiApi(n) {
        let r = null;
        for (let tentativo = 0; tentativo < 2; tentativo++) {
            try { r = await radice.fetch('https://pokeapi.co/api/v2/pokemon/' + encodeURIComponent(n)); } catch (e) { if (tentativo) throw e; await pausa(600); continue; }
            if (r.status === 429 || r.status >= 500) { if (tentativo) return null; await pausa(600); continue; }
            break;
        }
        if (!r || !r.ok) return null;
        const j = await r.json();
        return {
            altezzaM: Number(j.height) / 10 || ALTEZZA_NON_NOTA_M,
            vola: fluttua(n, (j.types || []).map(t => t.type.name), (j.abilities || []).map(a => a.ability.name))
        };
    }

    /** Altezza vera e se fluttua, per specie: { altezzaM, vola }. Dalla tabella; se la specie non c'è, da PokeAPI (che, se non la conosce, prova la specie base); se non risponde una taglia media. */
    function misure(nome) {
        const n = nomeApi(nome);
        if (cache.has(n)) return cache.get(n);
        const m = leggiMemoria()[n];
        if (m) { const p = Promise.resolve({ altezzaM: m.h, vola: !!m.v }); cache.set(n, p); return p; }
        const t = dallaTabella(n);
        if (t) { const p = Promise.resolve(t); cache.set(n, p); return p; }
        const p = (async () => {
            let d = null;
            try { d = await leggiApi(n); if (!d && n.includes('-')) d = await leggiApi(n.split('-')[0]); } catch (e) { d = null; }
            if (!d) { cache.delete(n); return { altezzaM: ALTEZZA_NON_NOTA_M, vola: fluttua(n, [], []) }; }
            leggiMemoria()[n] = { h: d.altezzaM, v: d.vola ? 1 : 0 };
            scriviMemoria();
            return d;
        })();
        cache.set(n, p);
        return p;
    }

    /**
     * Mette in scala un'immagine di Pokémon (con data-pkm = il nome) da sola sul palco alto `palcoPx`: ne fissa l'altezza e, se fluttua, la stacca da terra
     * (classe sc-vola e variabile --alza). Quando ha finito segna l'immagine (data-sc), che prima è invisibile.
     */
    async function dimensiona(img, palcoPx) {
        if (!img || !img.dataset || !img.dataset.pkm) return null;
        const nome = img.dataset.pkm;
        const d = await misure(nome);
        let h = altezzaDaSolo(d.altezzaM, palcoPx);
        let alza = d.vola ? sollevamento(h) : 0;
        if (h + alza > palcoPx) { const f = palcoPx / (h + alza); h *= f; alza *= f; }
        img.style.height = Math.round(h) + 'px';
        img.style.width = 'auto';
        img.style.maxHeight = 'none';
        img.style.setProperty('--alza', Math.round(alza) + 'px');
        img.classList.toggle('sc-vola', d.vola);
        img.dataset.sc = '1';
        return { h, alza, vola: d.vola };
    }

    const pronta = img => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise(r => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', r, { once: true });
        radice.setTimeout(r, 4000);
    }));

    /**
     * L'allenatore e il suo Pokémon compagno sullo stesso palco, in scala (le formule della pagina pubblica): il Pokémon è alto quanto lo sarebbe accanto a lui, e se non sta
     * nel palco si rimpicciolisce la scena intera. `larghezzaMax`: i due insieme non devono essere più larghi di così (il cerchio del palco); `spazioPx`: l'altezza massima
     * del Pokémon a terra. L'immagine del Pokémon porta data-pkm; chi fluttua prende la classe sc-vola e la variabile --alza.
     */
    async function scena({ allenatore, pokemon, spazioPx, larghezzaMax }) {
        if (!allenatore || !pokemon || !pokemon.dataset || !pokemon.dataset.pkm) return null;
        await Promise.all([pronta(allenatore), pronta(pokemon)]);
        allenatore.style.height = ''; allenatore.style.width = '';
        const bA = allenatore.getBoundingClientRect ? { w: allenatore.offsetWidth, h: allenatore.offsetHeight } : { w: 0, h: 0 };
        const nA = { w: allenatore.naturalWidth || 1, h: allenatore.naturalHeight || 1 };
        const aPx = Math.min(bA.h, bA.w * nA.h / nA.w) || bA.h;
        if (!(aPx > 0)) return null;
        const nome = pokemon.dataset.pkm;
        const d = await misure(nome);
        const r = scenaConAllenatore(d.altezzaM, { allenatorePx: aPx, spazioPx, vola: d.vola, regola: regolaDi(nome) });
        let hA = r.allenatore, hP = r.pokemon;
        const wA = hA * nA.w / nA.h, wP = hP * (pokemon.naturalWidth || 1) / (pokemon.naturalHeight || 1);
        // se non ci stanno uno accanto all'altro, prima il Pokémon si sovrappone un po' all'allenatore (fino a un terzo della sua larghezza), poi si rimpicciolisce tutto
        let sovrapposto = 0;
        if (larghezzaMax && wA + wP > larghezzaMax) {
            sovrapposto = Math.min(0.35 * wP, wA + wP - larghezzaMax);
            const resto = wA + wP - sovrapposto;
            if (resto > larghezzaMax) { const f = larghezzaMax / resto; hA *= f; hP *= f; sovrapposto *= f; }
        }
        pokemon.style.marginLeft = sovrapposto ? '-' + Math.round(sovrapposto) + 'px' : '';
        allenatore.style.height = Math.round(hA) + 'px'; allenatore.style.width = 'auto'; allenatore.style.maxHeight = 'none';
        pokemon.style.height = Math.round(hP) + 'px'; pokemon.style.width = 'auto'; pokemon.style.maxHeight = 'none';
        pokemon.style.setProperty('--alza', (d.vola ? sollevamento(hP) : 0) + 'px');
        pokemon.classList.toggle('sc-vola', d.vola);
        pokemon.dataset.sc = '1';
        return { allenatore: hA, pokemon: hP, vola: d.vola };
    }

    return {
        FORME_SPECIALI, RIMPICCIOLISCI, INGRANDISCI, A_TERRA, GALLEGGIANO,
        nomeApi, fluttua, regolaDi, scenaConAllenatore, altezzaDaSolo, sollevamento, dallaTabella, misure, dimensiona, scena
    };
});
