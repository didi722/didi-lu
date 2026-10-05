// =====================================================
// CALCOLO DELLA CPU
// Quanto fa male una mossa e chi muove per primo: il metro con cui la CPU confronta le sue scelte.
//   - statistiche stimate di un Pokémon avversario (di cui si conosce solo la specie e il livello);
//   - velocità effettiva (potenziamenti, paralisi, Tailwind, Sciarpa Scelta, abilità di meteo, Camera Magica);
//   - danno atteso di una mossa: tipi, STAB, meteo, terreno, schermi, scottatura, bersagli multipli,
//     strumenti e abilità più comuni, mosse a potenza variabile.
// È una stima (tiro medio, nessun critico): serve a decidere, non a prevedere al punto.
//
// Il Dex di @pkmn/sim arriva da fuori. Funziona nel browser (window.CpuCalcolo) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./cpu-conoscenza.js'));
    else radice.CpuCalcolo = fabbrica(radice.CpuConoscenza);
})(typeof self !== 'undefined' ? self : this, function (K) {
    'use strict';

    const STAT = ['atk', 'def', 'spa', 'spd', 'spe'];
    const id = K.id;

    function moltiplicatoreBoost(livello) {
        const l = Math.max(-6, Math.min(6, livello || 0));
        return l >= 0 ? (2 + l) / 2 : 2 / (2 - l);
    }

    // Statistiche di un Pokémon di cui non si sa nulla, come nelle partite casuali (85 EV ovunque, IV 31, natura neutra)
    function statStimate(basi, livello, gen) {
        const ev = gen <= 2 ? 63 : 21;   // 85 EV valgono 21 punti; nelle prime due generazioni gli "stat exp" sono al massimo
        const stat = b => Math.floor((Math.floor((2 * b + 31 + ev) * livello / 100)) + 5);
        const hp = basi.hp === 1 ? 1 : Math.floor((2 * basi.hp + 31 + ev) * livello / 100) + livello + 10;
        return { hp, atk: stat(basi.atk), def: stat(basi.def), spa: stat(basi.spa), spd: stat(basi.spd), spe: stat(basi.spe) };
    }

    // ---------- campo ----------
    // ctx = { meteo: 'sun'|'rain'|'sand'|'snow'|null, terreno: 'electric'|'grassy'|'misty'|'psychic'|null,
    //         stanzaMagica: bool, doppio: bool }
    function velocitaEffettiva(mon, ctx, vento) {
        let v = (mon.stat && mon.stat.spe) || 1;
        v = Math.floor(v * moltiplicatoreBoost(mon.boost && mon.boost.spe));
        if (mon.stato === 'par') v = Math.floor(v * 0.5);
        if (mon.strumento === 'choicescarf') v = Math.floor(v * 1.5);
        const ab = mon.abilita;
        if (ab && ((ab === 'swiftswim' && ctx.meteo === 'rain') || (ab === 'chlorophyll' && ctx.meteo === 'sun') ||
            (ab === 'sandrush' && ctx.meteo === 'sand') || (ab === 'slushrush' && ctx.meteo === 'snow') ||
            (ab === 'surgesurfer' && ctx.terreno === 'electric'))) v *= 2;
        if (vento) v *= 2;
        return v;
    }

    // Chi muove prima a parità di priorità: >0 se `a` è più veloce di `b`, <0 se più lento, 0 se pari
    function confrontoVelocita(a, b, ctx, ventoA, ventoB) {
        const va = velocitaEffettiva(a, ctx, ventoA), vb = velocitaEffettiva(b, ctx, ventoB);
        const d = va - vb;
        return ctx.stanzaMagica ? -d : d;
    }

    // ---------- abilità e strumenti ----------
    const PLACCHE = {
        flameplate: 'Fire', splashplate: 'Water', zapplate: 'Electric', meadowplate: 'Grass', icicleplate: 'Ice', fistplate: 'Fighting',
        toxicplate: 'Poison', earthplate: 'Ground', skyplate: 'Flying', mindplate: 'Psychic', insectplate: 'Bug', stoneplate: 'Rock',
        spookyplate: 'Ghost', dracoplate: 'Dragon', dreadplate: 'Dark', ironplate: 'Steel', pixieplate: 'Fairy'
    };
    function tipoDelloStrumento(strumento) {
        if (!strumento) return null;
        if (PLACCHE[strumento]) return PLACCHE[strumento];
        for (const t in K.STRUMENTI_TIPO) if (id(K.STRUMENTI_TIPO[t]) === strumento) return t;
        return null;
    }
    const CAMBIA_TIPO = { aerilate: 'Flying', pixilate: 'Fairy', refrigerate: 'Ice', galvanize: 'Electric' };

    function immuneAbilita(abilita, tipoMossa, mossa) {
        if (!abilita) return false;
        const lista = K.IMMUNITA_ABILITA[abilita];
        if (lista && lista.includes(tipoMossa)) return true;
        if (abilita === 'windrider' && mossa && mossa.flags && mossa.flags.wind) return false;
        if (abilita === 'soundproof' && mossa && mossa.flags && mossa.flags.sound) return true;
        if (abilita === 'bulletproof' && mossa && mossa.flags && mossa.flags.bullet) return true;
        return false;
    }

    // Probabilità che l'abilità (non nota) di `dif` annulli la mossa: la specie ne può avere più d'una
    function probImmunitaAbilita(dif, tipoMossa, mossa) {
        if (dif.abilita) return immuneAbilita(dif.abilita, tipoMossa, mossa) ? 1 : 0;
        const possibili = dif.abilitaPossibili || [];
        if (!possibili.length) return 0;
        const n = possibili.filter(a => immuneAbilita(a, tipoMossa, mossa)).length;
        return n / possibili.length;
    }

    // Il Pokémon tocca terra? (Terreno, mosse a terra, Levitate)
    function aTerra(mon) {
        if (mon.strumento === 'airballoon') return false;
        if ((mon.tipi || []).includes('Flying')) return false;
        const ab = mon.abilita;
        if (ab === 'levitate') return false;
        if (!ab && (mon.abilitaPossibili || []).length === 1 && mon.abilitaPossibili[0] === 'levitate') return false;
        return true;
    }

    // ---------- danno ----------
    // Potenza effettiva (mosse a potenza variabile e condizionali)
    function potenzaEffettiva(att, dif, m, ctx) {
        let p = m.potenza;
        switch (m.id) {
            case 'lowkick': case 'grassknot': {
                const kg = dif.peso || 50;
                p = kg >= 200 ? 120 : kg >= 100 ? 100 : kg >= 50 ? 80 : kg >= 25 ? 60 : kg >= 10 ? 40 : 20; break;
            }
            case 'heavyslam': case 'heatcrash': {
                const r = (att.peso || 50) / Math.max(1, dif.peso || 50);
                p = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; break;
            }
            case 'gyroball': p = Math.min(150, Math.floor(25 * velocitaEffettiva(dif, ctx) / Math.max(1, velocitaEffettiva(att, ctx))) + 1); break;
            case 'electroball': {
                const r = velocitaEffettiva(att, ctx) / Math.max(1, velocitaEffettiva(dif, ctx));
                p = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; break;
            }
            case 'facade': if (att.stato) p = 140; break;
            case 'hex': if (dif.stato) p = 130; break;
            case 'venoshock': if (dif.stato === 'psn' || dif.stato === 'tox') p = 130; break;
            case 'acrobatics': if (!att.strumento) p = 110; break;
            case 'knockoff': if (dif.strumento !== 'none' && dif.strumento !== '') p = 97; break;
            case 'brine': if (dif.hpMax && dif.hp / dif.hpMax <= 0.5) p = 130; break;
            case 'eruption': case 'waterspout': case 'dragonenergy': p = Math.max(1, Math.floor(150 * att.hp / att.hpMax)); break;
            case 'storedpower': case 'powertrip': {
                const su = STAT.concat(['accuracy', 'evasion']).reduce((s, k) => s + Math.max(0, (att.boost && att.boost[k]) || 0), 0);
                p = 20 + 20 * su; break;
            }
            case 'weatherball': if (ctx.meteo) p = 100; break;
            case 'flail': case 'reversal': {
                const f = Math.floor(48 * att.hp / att.hpMax);
                p = f <= 1 ? 200 : f <= 4 ? 150 : f <= 9 ? 100 : f <= 16 ? 80 : f <= 32 ? 40 : 20; break;
            }
            case 'lastrespects': p = 50 + 50 * (att.caduti || 0); break;
            case 'ragefist': p = 50; break;
            case 'terrainpulse': if (ctx.terreno && aTerra(att)) p = 100; break;
            case 'suckerpunch': case 'thunderclap': p = Math.round(p * 0.7); break;   // funziona solo se l'avversario attacca
            case 'fakeout': case 'firstimpression': break;
        }
        return p;
    }

    function tipoEffettivoMossa(att, m, ctx) {
        let t = m.tipo;
        if (m.id === 'weatherball') {
            if (ctx.meteo === 'sun') t = 'Fire'; else if (ctx.meteo === 'rain') t = 'Water';
            else if (ctx.meteo === 'sand') t = 'Rock'; else if (ctx.meteo === 'snow') t = 'Ice';
        }
        if (m.id === 'terrainpulse' && ctx.terreno && aTerra(att)) {
            t = { electric: 'Electric', grassy: 'Grass', misty: 'Fairy', psychic: 'Psychic' }[ctx.terreno] || t;
        }
        if (m.id === 'terablast' && att.tera) t = att.tera;
        if (t === 'Normal' && CAMBIA_TIPO[att.abilita]) t = CAMBIA_TIPO[att.abilita];
        return t;
    }

    // Quanti colpi fa la mossa in media
    function colpi(m, att) {
        if (!m.multi) return 1;
        if (Array.isArray(m.multi)) return att.abilita === 'skilllink' ? m.multi[1] : (m.multi[0] === 2 && m.multi[1] === 5 ? 3.1 : (m.multi[0] + m.multi[1]) / 2);
        return m.multi;
    }

    // Danno di `m` (descritta da CpuConoscenza.descriviMossa) di `att` su `dif`.
    // opz: { bersagliMultipli: bool (la mossa colpisce più d'un Pokémon: -25%), aiuto: bool (Helping Hand),
    //        schermi: { reflect, lightscreen, auroraveil } del lato di chi difende, tera: tipo della Teracristal in uso }
    // Restituisce frazioni dell'HP massimo del bersaglio e dell'HP attuale.
    function danno(dex, att, dif, m, ctx, opz) {
        opz = opz || {};
        const nullo = { min: 0, max: 0, medio: 0, mult: 1, immune: false, precisione: 1, colpi: 1, fraz: 0, frazMin: 0, frazMax: 0 };
        if (!m || m.categoria === 'Status') return nullo;

        const tipoMossa = tipoEffettivoMossa(att, m, ctx);
        const tipiDif = dif.tera ? [dif.tera] : (dif.tipi || []);
        let mult = K.moltiplicatoreTipo(dex, tipoMossa, tipiDif);
        if (dex.gen >= 6 && m.id === 'freezedry' && tipiDif.includes('Water')) mult = mult === 0 ? 0 : mult * 4;
        if (m.id === 'flyingpress') mult *= K.moltiplicatoreTipo(dex, 'Flying', tipiDif);
        // le mosse di terra non toccano chi vola o levita; tranne con Gravità e Radicamento (ignorato)
        if (tipoMossa === 'Ground' && m.categoria !== 'Status' && !aTerra(dif) && m.id !== 'thousandarrows') mult = 0;
        const probAbilita = probImmunitaAbilita(dif, tipoMossa, m);
        // ha già "non avuto effetto" contro di lui (Illusion: il tipo che si vede non è quello vero); Scrappy e Occhio Mentale
        // colpiscono i Pokémon Spettro anche con mosse Normale e Lotta, quindi per loro l'osservazione non vale
        const giaImmune = !!(dif.immuneTipi && dif.immuneTipi.has(tipoMossa)) && !(att.abilita === 'scrappy' || att.abilita === 'mindseye');
        if (mult === 0 || probAbilita === 1 || giaImmune) return Object.assign({}, nullo, { mult: 0, immune: true });
        if (dif.abilita === 'wonderguard' && mult <= 1) return Object.assign({}, nullo, { mult, immune: true });

        const fisica = m.categoria === 'Physical';
        const potenza = potenzaEffettiva(att, dif, m, ctx);
        if (!potenza) return nullo;

        // statistiche in uso
        let usaAtk = fisica ? 'atk' : 'spa';
        if (m.id === 'bodypress') usaAtk = 'def';
        const bersaglioAtk = m.id === 'foulplay' ? dif : att;
        let A = bersaglioAtk.stat[m.id === 'foulplay' ? 'atk' : usaAtk];
        let boostA = (bersaglioAtk.boost && bersaglioAtk.boost[m.id === 'foulplay' ? 'atk' : usaAtk]) || 0;
        const usaDif = (m.id === 'psyshock' || m.id === 'psystrike' || m.id === 'secretsword') ? 'def' : (fisica ? 'def' : 'spd');
        let D = dif.stat[usaDif];
        let boostD = (dif.boost && dif.boost[usaDif]) || 0;
        // i potenziamenti negativi dell'attaccante e quelli positivi del difensore contano; un critico li ignorerebbe: qui no
        A = Math.floor(A * moltiplicatoreBoost(boostA));
        D = Math.floor(D * moltiplicatoreBoost(boostD));

        const abA = att.abilita, abD = dif.abilita;
        const hpFrac = att.hp / att.hpMax;
        if (fisica && (abA === 'hugepower' || abA === 'purepower')) A *= 2;
        if (fisica && abA === 'hustle') A = Math.floor(A * 1.5);
        if (fisica && abA === 'guts' && att.stato) A = Math.floor(A * 1.5);
        if (!fisica && abA === 'solarpower' && ctx.meteo === 'sun') A = Math.floor(A * 1.5);
        if (abA === 'orichalcumpulse' && fisica && ctx.meteo === 'sun') A = Math.floor(A * 1.33);
        if (abA === 'hadronengine' && !fisica && ctx.terreno === 'electric') A = Math.floor(A * 1.33);
        if (att.strumento === 'choiceband' && fisica) A = Math.floor(A * 1.5);
        if (att.strumento === 'choicespecs' && !fisica) A = Math.floor(A * 1.5);
        if (!fisica && dif.strumento === 'assaultvest') D = Math.floor(D * 1.5);
        if (dif.strumento === 'eviolite' && dif.nfe) D = Math.floor(D * 1.5);
        if (ctx.meteo === 'sand' && !fisica && tipiDif.includes('Rock')) D = Math.floor(D * 1.5);
        if (ctx.meteo === 'snow' && fisica && tipiDif.includes('Ice')) D = Math.floor(D * 1.5);
        if (abD === 'furcoat' && fisica) D *= 2;
        if (abD === 'marvelscale' && dif.stato && fisica) D = Math.floor(D * 1.5);
        if (abD === 'icescales' && !fisica) D *= 2;

        let bp = potenza;
        if (abA === 'technician' && bp <= 60) bp = Math.floor(bp * 1.5);
        if (abA === 'ironfist' && m.flags && m.flags.punch) bp = Math.floor(bp * 1.2);
        if (abA === 'strongjaw' && m.flags && m.flags.bite) bp = Math.floor(bp * 1.5);
        if (abA === 'toughclaws' && m.flags && m.flags.contact) bp = Math.floor(bp * 1.3);
        if (abA === 'sharpness' && m.flags && m.flags.slicing) bp = Math.floor(bp * 1.5);
        if (abA === 'sheerforce' && m.secondari) bp = Math.floor(bp * 1.3);
        if (abA === 'reckless' && m.rinculo) bp = Math.floor(bp * 1.2);
        if (abA === 'dragonsmaw' && tipoMossa === 'Dragon') bp = Math.floor(bp * 1.5);
        if (abA === 'transistor' && tipoMossa === 'Electric') bp = Math.floor(bp * 1.3);
        if (abA === 'steelworker' && tipoMossa === 'Steel') bp = Math.floor(bp * 1.5);
        if (abA === 'waterbubble' && tipoMossa === 'Water') bp *= 2;
        if (abA === 'sandforce' && ctx.meteo === 'sand' && ['Rock', 'Ground', 'Steel'].includes(tipoMossa)) bp = Math.floor(bp * 1.3);
        if (CAMBIA_TIPO[abA] && m.tipo === 'Normal') bp = Math.floor(bp * 1.2);
        if (hpFrac <= 1 / 3 && ((abA === 'blaze' && tipoMossa === 'Fire') || (abA === 'torrent' && tipoMossa === 'Water') ||
            (abA === 'overgrow' && tipoMossa === 'Grass') || (abA === 'swarm' && tipoMossa === 'Bug'))) bp = Math.floor(bp * 1.5);
        if (ctx.terreno && aTerra(att)) {
            const t = { electric: 'Electric', grassy: 'Grass', psychic: 'Psychic' }[ctx.terreno];
            if (t && tipoMossa === t) bp = Math.floor(bp * (dex.gen >= 8 ? 1.3 : 1.5));
        }
        if (ctx.terreno === 'misty' && tipoMossa === 'Dragon' && aTerra(dif)) bp = Math.floor(bp * 0.5);
        if (ctx.terreno === 'grassy' && ['earthquake', 'bulldoze', 'magnitude'].includes(m.id) && aTerra(dif)) bp = Math.floor(bp * 0.5);

        const L = att.livello || 50;
        let base = Math.floor(Math.floor(Math.floor(2 * L / 5 + 2) * bp * A / Math.max(1, D)) / 50) + 2;

        // fattori
        let f = 1;
        if (opz.bersagliMultipli) f *= 0.75;
        if (ctx.meteo === 'sun') { if (tipoMossa === 'Fire') f *= 1.5; else if (tipoMossa === 'Water') f *= 0.5; }
        if (ctx.meteo === 'rain') { if (tipoMossa === 'Water') f *= 1.5; else if (tipoMossa === 'Fire') f *= 0.5; }
        // STAB
        const tipiAtt = att.tera ? Array.from(new Set([att.tera].concat(att.tipiBase || att.tipi || []))) : (att.tipi || []);
        if (tipiAtt.includes(tipoMossa)) {
            f *= abA === 'adaptability' ? 2 : (att.tera && att.tera === tipoMossa && (att.tipiBase || att.tipi || []).includes(tipoMossa) ? 2 : 1.5);
        }
        f *= mult;
        if (fisica && att.stato === 'brn' && abA !== 'guts' && m.id !== 'facade') f *= 0.5;
        const sc = opz.schermi || {};
        if (sc.auroraveil || (fisica && sc.reflect) || (!fisica && sc.lightscreen)) f *= ctx.doppio ? 2 / 3 : 0.5;
        if (att.strumento === 'lifeorb') f *= 1.3;
        if (att.strumento === 'expertbelt' && mult > 1) f *= 1.2;
        if (att.strumento === 'muscleband' && fisica) f *= 1.1;
        if (att.strumento === 'wiseglasses' && !fisica) f *= 1.1;
        if (tipoDelloStrumento(att.strumento) === tipoMossa) f *= 1.2;
        if (abA === 'tintedlens' && mult < 1) f *= 2;
        if ((abD === 'solidrock' || abD === 'filter' || abD === 'prismarmor') && mult > 1) f *= 0.75;
        if ((abD === 'multiscale' || abD === 'shadowshield') && dif.hp >= dif.hpMax) f *= 0.5;
        if (abD === 'thickfat' && (tipoMossa === 'Fire' || tipoMossa === 'Ice')) f *= 0.5;
        if (abD === 'heatproof' && tipoMossa === 'Fire') f *= 0.5;
        if (abD === 'waterbubble' && tipoMossa === 'Fire') f *= 0.5;
        if (abD === 'fluffy') { if (m.flags && m.flags.contact) f *= 0.5; if (tipoMossa === 'Fire') f *= 2; }
        if (abD === 'dryskin' && tipoMossa === 'Fire') f *= 1.25;
        if (abD === 'punkrock' && m.flags && m.flags.sound) f *= 0.5;
        if (opz.aiuto) f *= 1.5;
        if (opz.potenziamenti) f *= opz.potenziamenti;

        const nColpi = colpi(m, att);
        const piccolo = Math.floor(base * f * 0.85), grande = Math.floor(base * f), medio = base * f * 0.925;
        // se l'abilità dell'avversario è incerta, il danno atteso scende in proporzione
        const sicuro = 1 - probAbilita;
        const hpMax = dif.hpMax || 1;
        const r = {
            min: piccolo * nColpi, max: grande * nColpi, medio: medio * nColpi * sicuro, mult, immune: false,
            colpi: nColpi, precisione: 1
        };
        r.frazMin = r.min / hpMax; r.frazMax = r.max / hpMax; r.fraz = r.medio / hpMax;
        return r;
    }

    // Precisione effettiva della mossa (meteo e potenziamenti compresi), da 0 a 1
    function precisione(att, dif, m, ctx) {
        let a = m.precisione;
        if (m.id === 'thunder' || m.id === 'hurricane') { if (ctx.meteo === 'rain') a = 100; else if (ctx.meteo === 'sun') a = 50; }
        if (m.id === 'blizzard' && ctx.meteo === 'snow') a = 100;
        if (att.abilita === 'noguard' || dif.abilita === 'noguard') a = 100;
        else {
            const stadio = ((att.boost && att.boost.accuracy) || 0) - ((dif.boost && dif.boost.evasion) || 0);
            a = a * moltiplicatoreBoost(stadio);
            if (att.abilita === 'compoundeyes') a *= 1.3;
            if (att.abilita === 'hustle' && m.categoria === 'Physical') a *= 0.8;
            if (dif.abilita === 'sandveil' && ctx.meteo === 'sand') a *= 0.8;
            if (dif.abilita === 'snowcloak' && ctx.meteo === 'snow') a *= 0.8;
        }
        return Math.max(0, Math.min(1, a / 100));
    }

    return {
        moltiplicatoreBoost, statStimate, velocitaEffettiva, confrontoVelocita, danno, precisione, aTerra,
        potenzaEffettiva, tipoEffettivoMossa, immuneAbilita, tipoDelloStrumento
    };
});
