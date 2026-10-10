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
    const PROTEZIONI = insieme('protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'obstruct', 'silktrap', 'burningbulwark', 'maxguard');
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

    // ---------- meteo di squadra ----------
    // Chi mette il meteo (abilità), chi ne approfitta (abilità) e il tipo di mossa che ne esce rafforzata.
    // Le chiavi sono quelle del log di Showdown: rain, sun, sand, snow.
    const METEO_SETTER = { rain: ['drizzle'], sun: ['drought', 'orichalcumpulse'], sand: ['sandstream'], snow: ['snowwarning'] };
    const METEO_SFRUTTATORI = {
        rain: ['swiftswim', 'raindish', 'dryskin', 'hydration'],
        sun: ['chlorophyll', 'solarpower', 'protosynthesis', 'leafguard', 'flowergift'],
        sand: ['sandrush', 'sandforce', 'sandveil'],
        snow: ['slushrush', 'snowcloak', 'icebody', 'iceface']
    };
    const METEO_TIPO = { rain: 'Water', sun: 'Fire', sand: 'Rock', snow: 'Ice' };
    // I nomi dei piani di team (team-cpu.js) e il meteo che li caratterizza
    const PIANO_METEO = { pioggia: 'rain', sole: 'sun', sabbia: 'sand', neve: 'snow' };

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

    // ---------- mosse Max (Dynamax, Gen 8) e Mosse Z (Gen 7) ----------
    // Sono varianti di una mossa normale: stesso tipo e stessa categoria, potenza che dipende dalla mossa di partenza, non sbagliano mai
    // il bersaglio e non hanno gli effetti della mossa originale. Qui si ricavano dal descrittore della mossa di partenza
    // (descriviMossa) e da ciò che offre il simulatore nella richiesta, così l'IA le valuta come qualunque altra mossa.
    const NEUTRE = {
        secondari: null, assorbe: null, rinculo: null, rinculoMax: 0, multi: null, dannoFisso: null, ohko: false, ricarica: false, dueTurni: false,
        perno: false, boostSelf: null, flags: {}, stato: null, potenziamento: null, recupero: false, redirezione: false, schermo: false,
        trappola: false, velocitaSquadra: false, terra: false, colpisceAlleato: false, esclusa: false, protezione: false
    };
    // Se il Dex non dà la potenza (mosse di partenza a potenza variabile): le tabelle di Showdown
    function potenzaMaxDaTabella(potenza, tipo) {
        const bassa = tipo === 'Fighting' || tipo === 'Poison';
        const soglie = [[40, 90, 70], [50, 100, 75], [60, 110, 80], [70, 120, 85], [100, 130, 90], [140, 140, 95]];
        for (const [fino, alta, piu] of soglie) if (potenza <= fino) return bassa ? piu : alta;
        return bassa ? 100 : 150;
    }
    function potenzaZDaTabella(potenza) {
        const soglie = [[55, 100], [65, 120], [75, 140], [85, 160], [95, 175], [100, 180], [110, 185], [125, 190], [130, 195]];
        for (const [fino, z] of soglie) if (potenza <= fino) return z;
        return 200;
    }

    // La mossa Max di ogni tipo (quella "normale", non la G-Max: quella la dice la richiesta del simulatore)
    const MOSSE_MAX = {
        Fire: 'maxflare', Water: 'maxgeyser', Electric: 'maxlightning', Ground: 'maxquake', Dragon: 'maxwyrmwind', Rock: 'maxrockfall',
        Flying: 'maxairstream', Normal: 'maxstrike', Fighting: 'maxknuckle', Steel: 'maxsteelspike', Psychic: 'maxmindstorm', Dark: 'maxdarkness',
        Ghost: 'maxphantasm', Grass: 'maxovergrowth', Ice: 'maxhailstorm', Poison: 'maxooze', Bug: 'maxflutterby', Fairy: 'maxstarfall'
    };

    /** Max Guard: protegge da (quasi) tutto per un turno, con la priorità di una protezione. Per ogni mossa di stato di un Pokémon in Dynamax. */
    function maxGuard() {
        return Object.assign({}, NEUTRE, {
            id: 'maxguard', nome: 'Max Guard', categoria: 'Status', tipo: 'Normal', potenza: 0, precisione: 100, priorita: 4,
            target: 'self', protezione: true, max: true
        });
    }

    /**
     * La mossa Max che prende il posto di `base` (descrittore di descriviMossa) per un Pokémon in Dynamax.
     * idMax: l'id della mossa Max nella richiesta ("maxflare", "gmaxwildfire", "maxguard"), se si conosce.
     */
    function mossaMax(dex, base, idMax) {
        if (!idMax && base && base.categoria !== 'Status') idMax = MOSSE_MAX[base.tipo];
        const dmax = idMax ? dex.moves.get(idMax) : null;
        const esiste = !!(dmax && dmax.exists);
        if (!base || base.categoria === 'Status' || (esiste && dmax.id === 'maxguard')) return maxGuard();
        const dbase = dex.moves.get(base.id);
        const potenza = (dbase.maxMove && dbase.maxMove.basePower) || potenzaMaxDaTabella(base.potenza || 0, base.tipo);
        return Object.assign({}, base, NEUTRE, {
            id: esiste ? dmax.id : 'max' + base.id, nome: esiste ? dmax.name : 'Max ' + base.nome, tipo: esiste ? dmax.type : base.tipo,
            potenza, precisione: 100, priorita: 0, target: 'adjacentFoe', max: true, base: base.id
        });
    }

    /**
     * La Mossa Z che prende il posto di `base`. voce: la voce di `canZMove` nella richiesta ({ move: 'Gigavolt Havoc', target: 'normal' }).
     * null per le mosse di stato (la Mossa Z di stato dà solo un bonus alla mossa: la CPU non la usa).
     */
    function mossaZ(dex, base, voce) {
        if (!base || base.categoria === 'Status') return null;
        const dz = voce && voce.move ? dex.moves.get(voce.move) : null;
        const esiste = !!(dz && dz.exists);
        const dbase = dex.moves.get(base.id);
        // le Mosse Z "uniche" (Catastropika...) hanno la loro potenza; quelle comuni la ricavano dalla mossa di partenza
        const potenza = esiste && dz.basePower > 1 ? dz.basePower : ((dbase.zMove && dbase.zMove.basePower) || potenzaZDaTabella(base.potenza || 0));
        const target = (voce && voce.target) || base.target;
        return Object.assign({}, base, NEUTRE, {
            id: esiste ? dz.id : 'z' + base.id, nome: esiste ? dz.name : 'Z-' + base.nome, tipo: esiste && dz.basePower > 1 ? dz.type : base.tipo,
            potenza, precisione: 100, target, colpisceAlleato: target === 'allAdjacent', z: true, base: base.id
        });
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
        METEO_SETTER, METEO_SFRUTTATORI, METEO_TIPO, PIANO_METEO,
        moltiplicatoreTipo, tipiDellaGenerazione, descriviMossa, mossaUsabile, mossaMax, mossaZ, maxGuard, potenzaMaxDaTabella, potenzaZDaTabella, MOSSE_MAX
    };
});
