// =====================================================
// CONOSCENZA DELLA CPU
// Quello che la CPU "sa" di Pokémon, in un posto solo: la usano sia chi compone i suoi team
// (team-cpu.js) sia chi sceglie le mosse in battaglia (cpu-ia.js), così le due cose parlano
// la stessa lingua: se un team ha Tailwind, l'IA sa cos'è e quando conviene usarla.
//   - elenchi di mosse per ruolo (protezione, potenziamento, recupero, stati, campo...);
//   - tabella dei tipi (efficacia) calcolata sul Dex della generazione del formato;
//   - abilità che annullano una mossa, strumenti che si possono dare.
// Il Dex di @pkmn/sim arriva da fuori: nel browser è quello del sito, nei test quello di Node.
//
// Funziona nel browser (window.CpuConoscenza) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.CpuConoscenza = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const id = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const insieme = (...nomi) => new Set(nomi);

    // ---------- mosse per ruolo ----------
    const PROTEZIONI = insieme('protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark');
    const PROTEZIONI_DI_AREA = insieme('wideguard', 'quickguard');

    // Potenziamenti: quanto alzano (o abbassano) ciascuna statistica
    const POTENZIAMENTI = {
        swordsdance: { atk: 2 }, nastyplot: { spa: 2 }, dragondance: { atk: 1, spe: 1 },
        calmmind: { spa: 1, spd: 1 }, quiverdance: { spa: 1, spd: 1, spe: 1 }, bulkup: { atk: 1, def: 1 },
        shellsmash: { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 }, agility: { spe: 2 }, rockpolish: { spe: 2 },
        irondefense: { def: 2 }, amnesia: { spd: 2 }, coil: { atk: 1, def: 1 }, workup: { atk: 1, spa: 1 },
        honeclaws: { atk: 1 }, tailglow: { spa: 3 }, cosmicpower: { def: 1, spd: 1 }, autotomize: { spe: 2 },
        victorydance: { atk: 1, def: 1, spe: 1 }, tidyup: { atk: 1, spe: 1 }, growth: { atk: 1, spa: 1 },
        howl: { atk: 1 }, barrier: { def: 2 }, acidarmor: { def: 2 }, defendorder: { def: 1, spd: 1 },
        geomancy: { spa: 2, spd: 2, spe: 2 }
    };

    const RECUPERO = insieme('recover', 'roost', 'softboiled', 'slackoff', 'milkdrink', 'synthesis', 'moonlight',
        'morningsun', 'shoreup', 'healorder', 'junglehealing', 'lifedew');

    // Stati: quale stato dà la mossa e chi ne è immune (tipi)
    const STATI = {
        thunderwave: { stato: 'par', immuni: ['Electric', 'Ground'] },
        glare: { stato: 'par', immuni: ['Electric'] },
        stunspore: { stato: 'par', immuni: ['Electric', 'Grass'], polvere: true },
        willowisp: { stato: 'brn', immuni: ['Fire'] },
        toxic: { stato: 'tox', immuni: ['Poison', 'Steel'] },
        poisonpowder: { stato: 'psn', immuni: ['Poison', 'Steel', 'Grass'], polvere: true },
        spore: { stato: 'slp', immuni: ['Grass'], polvere: true },
        sleeppowder: { stato: 'slp', immuni: ['Grass'], polvere: true },
        hypnosis: { stato: 'slp', immuni: [] },
        yawn: { stato: 'slp', immuni: [] },
        nuzzle: { stato: 'par', immuni: ['Electric', 'Ground'] }
    };

    const VELOCITA_DI_SQUADRA = insieme('tailwind', 'trickroom');
    const SCHERMI = insieme('reflect', 'lightscreen', 'auroraveil');
    const TRAPPOLE = insieme('stealthrock', 'spikes', 'toxicspikes', 'stickyweb');
    const REDIREZIONE = insieme('followme', 'ragepowder');
    const PERNO = insieme('uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'batonpass');

    // Mosse che la CPU non sa usare bene: fuori dai suoi team
    const ESCLUSE = insieme(
        'darkvoid', 'fissure', 'sheercold', 'horndrill', 'guillotine',          // KO in un colpo / addormenta tutti
        'explosion', 'selfdestruct', 'mistyexplosion', 'memento', 'finalgambit', 'healingwish', 'lunardance', 'destinybond',
        'perishsong', 'curse', 'transform', 'sketch', 'mimic', 'metronome', 'copycat', 'mirrormove', 'assist', 'sleeptalk',
        'rest', 'focuspunch', 'dreameater', 'lastresort', 'belch', 'steelroller', 'icespinner', 'poltergeist', 'synchronoise',
        'counter', 'mirrorcoat', 'metalburst', 'bide', 'endeavor', 'substitute', 'batonpass', 'rage', 'present',
        'splash', 'celebrate', 'holdhands', 'happyhour', 'afteryou', 'allyswitch', 'instruct', 'bestow', 'trick', 'switcheroo',
        'covet', 'thief', 'fling', 'naturalgift', 'spitup', 'swallow', 'stockpile', 'hiddenpower', 'return', 'frustration',
        'skydrop', 'beatup', 'psywave', 'wringout', 'crushgrip', 'electricterrain', 'grassyterrain', 'mistyterrain', 'psychicterrain',
        'raindance', 'sunnyday', 'sandstorm', 'hail', 'snowscape', 'chillyreception', 'haze', 'painsplit', 'sandattack'
    );
    // Mosse in due turni o che costringono a fermarsi
    const DUE_TURNI = insieme('solarbeam', 'solarblade', 'fly', 'dig', 'dive', 'bounce', 'phantomforce', 'shadowforce', 'skullbash',
        'razorwind', 'skyattack', 'freezeshock', 'iceburn', 'geomancy', 'meteorbeam', 'electroshot', 'gigaimpact', 'hyperbeam',
        'blastburn', 'frenzyplant', 'hydrocannon', 'rockwrecker', 'roaroftime', 'prismaticlaser', 'eternabeam', 'focuspunch',
        'futuresight', 'doomdesire');

    // Mosse che colpiscono tutti (compreso l'alleato nel doppio)
    const TARGET_CON_ALLEATO = insieme('allAdjacent');
    const MOSSE_TERRA = insieme('earthquake', 'bulldoze', 'highhorsepower', 'magnitude', 'precipiceblades');

    // Abilità che rendono immuni a un tipo (e quindi annullano la mossa di quel tipo)
    const IMMUNITA_ABILITA = {
        levitate: ['Ground'], flashfire: ['Fire'], waterabsorb: ['Water'], stormdrain: ['Water'], dryskin: ['Water'],
        voltabsorb: ['Electric'], lightningrod: ['Electric'], motordrive: ['Electric'], sapsipper: ['Grass'],
        eartheater: ['Ground'], wellbakedbody: ['Fire'], windrider: [], thickfat: [], fluffy: [], purifyingsalt: []
    };
    // Abilità che alzano una statistica quando vengono colpite: da non colpire a vuoto
    const ABILITA_PERICOLOSE = insieme('stormdrain', 'lightningrod', 'sapsipper', 'motordrive', 'eartheater', 'wellbakedbody', 'flashfire', 'voltabsorb', 'waterabsorb', 'dryskin', 'levitate');

    // Abilità da evitare nei team della CPU
    const ABILITA_SCARTATE = insieme('truant', 'slowstart', 'defeatist', 'stall', 'klutz', 'normalize', 'zenmode', 'schooling', 'shieldsdown', 'powerconstruct', 'hungerswitch', 'gulpmissile', 'disguise', 'iceface', 'commander', 'zerotohero', 'imposter', 'trace', 'receiver', 'powerofalchemy', 'illusion', 'wonderguard', 'minds', 'multitype', 'rkssystem', 'battlebond', 'stancechange', 'neutralizinggas', 'asone', 'asoneglastrier', 'asonespectrier');

    // Strumenti: li sceglie team-cpu.js dal Dex; qui l'elenco di quelli che la CPU sa usare
    const STRUMENTI_OFFENSIVI = ['Life Orb', 'Expert Belt', 'Muscle Band', 'Wise Glasses', 'Focus Sash'];
    const STRUMENTI_TIPO = {
        Normal: 'Silk Scarf', Fire: 'Charcoal', Water: 'Mystic Water', Electric: 'Magnet', Grass: 'Miracle Seed', Ice: 'Never-Melt Ice',
        Fighting: 'Black Belt', Poison: 'Poison Barb', Ground: 'Soft Sand', Flying: 'Sharp Beak', Psychic: 'Twisted Spoon',
        Bug: 'Silver Powder', Rock: 'Hard Stone', Ghost: 'Spell Tag', Dragon: 'Dragon Fang', Dark: 'Black Glasses',
        Steel: 'Metal Coat', Fairy: 'Fairy Feather'
    };

    // Strumenti che bloccano la scelta (la CPU non li dà: dovrebbe gestire il blocco sulla mossa)
    const STRUMENTI_SCELTA = insieme('choiceband', 'choicespecs', 'choicescarf');

    // ---------- tipi ----------
    const TIPI = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying',
        'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];

    // Moltiplicatore di un tipo di attacco contro i tipi di un difensore (0, .25, .5, 1, 2, 4)
    function moltiplicatoreTipo(dex, tipoAttacco, tipiDifesa) {
        let m = 1;
        for (const t of tipiDifesa || []) {
            if (!t) continue;
            if (!dex.getImmunity(tipoAttacco, t)) return 0;
            const e = dex.getEffectiveness(tipoAttacco, t);
            m *= e > 0 ? 2 : e < 0 ? 0.5 : 1;
        }
        return m;
    }

    // Tipi che esistono in questa generazione (Fairy dalla 6, Dark e Steel dalla 2)
    function tipiDellaGenerazione(dex) {
        const gen = dex.gen || 9;
        return TIPI.filter(t => !(t === 'Fairy' && gen < 6) && !((t === 'Dark' || t === 'Steel') && gen < 2));
    }

    // Caratteristiche utili di una mossa, lette dal Dex una volta
    function descriviMossa(dex, nome) {
        const m = dex.moves.get(nome);
        if (!m.exists) return null;
        const k = m.id;
        const potenza = m.basePower || POTENZA_STIMATA[k] || 0;
        return {
            id: k, nome: m.name, categoria: m.category, tipo: m.type, potenza,
            precisione: m.accuracy === true ? 100 : (m.accuracy || 100), priorita: m.priority || 0, target: m.target,
            flags: m.flags || {}, secondari: m.secondary || (m.secondaries && m.secondaries[0]) || null,
            ricarica: !!(m.self && m.self.volatileStatus === 'mustrecharge') || !!(m.flags && m.flags.recharge),
            rinculo: m.recoil || null, rinculoMax: m.mindBlownRecoil ? 0.5 : 0, assorbe: m.drain || null, multi: m.multihit || null,
            ohko: !!m.ohko, dannoFisso: m.damage || null,
            boostSelf: (m.self && m.self.boosts) || null,
            protezione: PROTEZIONI.has(k), recupero: RECUPERO.has(k), potenziamento: POTENZIAMENTI[k] || null,
            stato: STATI[k] || null, perno: PERNO.has(k), redirezione: REDIREZIONE.has(k), schermo: SCHERMI.has(k),
            trappola: TRAPPOLE.has(k), velocitaSquadra: VELOCITA_DI_SQUADRA.has(k), terra: MOSSE_TERRA.has(k),
            colpisceAlleato: TARGET_CON_ALLEATO.has(m.target), dueTurni: DUE_TURNI.has(k), esclusa: ESCLUSE.has(k)
        };
    }

    // Una mossa è ammessa nei team della CPU se la sa usare
    function mossaUsabile(dex, nome) {
        const d = descriviMossa(dex, nome);
        if (!d || d.esclusa || d.dueTurni || d.ricarica || d.ohko || d.dannoFisso) return false;
        if (d.categoria === 'Status') {
            return d.protezione || !!d.potenziamento || d.recupero || !!d.stato || d.velocitaSquadra || d.schermo || d.trappola
                || d.redirezione || ['helpinghand', 'taunt', 'leechseed', 'wideguard'].includes(d.id);
        }
        return d.potenza > 0;
    }

    // Mosse con potenza variabile che la CPU stima a mano (id -> potenza media)
    const POTENZA_STIMATA = {
        gyroball: 70, electroball: 80, lowkick: 70, grassknot: 70, heavyslam: 70, heatcrash: 70, storedpower: 60,
        punishment: 60, acrobatics: 90, facade: 70, hex: 65, venoshock: 65, brine: 65, knockoff: 80, foulplay: 95,
        bodypress: 80, terrainpulse: 70, weatherball: 50, flail: 50, reversal: 50, seismictoss: 0, nightshade: 0,
        eruption: 150, waterspout: 150, dragonenergy: 150, boltbeak: 85, fishiousrend: 85, payback: 50, revenge: 60,
        avalanche: 60, assurance: 60, suckerpunch: 70, thunderclap: 70, hardpress: 60, ragefist: 50, lastrespects: 50,
        trumpcard: 40, naturalpower: 80, ficklebeam: 80
    };

    return {
        id, TIPI, PROTEZIONI, PROTEZIONI_DI_AREA, POTENZIAMENTI, RECUPERO, STATI, VELOCITA_DI_SQUADRA, SCHERMI, TRAPPOLE,
        REDIREZIONE, PERNO, ESCLUSE, DUE_TURNI, MOSSE_TERRA, IMMUNITA_ABILITA, ABILITA_PERICOLOSE, ABILITA_SCARTATE,
        STRUMENTI_OFFENSIVI, STRUMENTI_TIPO, STRUMENTI_SCELTA, POTENZA_STIMATA,
        moltiplicatoreTipo, tipiDellaGenerazione, descriviMossa, mossaUsabile
    };
});
