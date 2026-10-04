#!/usr/bin/env node
'use strict';
// Genera docs/azioni-mosse.js (e la copia in functions/): per ogni mossa di stato del simulatore, a quale "tipo di azione" appartiene.
// Serve a statistiche-set.js (sul server) per contare, per ogni set, quante volte un giocatore ha attaccato, si è protetto,
// ha potenziato, messo il campo a suo favore, aiutato il compagno o disturbato l'avversario; quelle non elencate sono attacchi.
//
//   node tools/genera-azioni-mosse.cjs          (dalla cartella principale; rifarlo quando esce una generazione nuova)
//
// Le regole stanno in `classifica` qui sotto: leggono i campi del Dex (bersaglio, stato, condizioni di campo, cura...).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const QUI = path.join(__dirname, '..');
const OBIETTIVI = [path.join(QUI, 'docs', 'azioni-mosse.js'), path.join(QUI, 'functions', 'azioni-mosse.js')];

const BERSAGLI_ALLEATO = new Set(['adjacentAlly', 'adjacentAllyOrSelf', 'allyTeam', 'allies']);
const BERSAGLI_AVVERSARIO = new Set(['normal', 'any', 'adjacentFoe', 'allAdjacentFoes', 'allAdjacent', 'foeSide', 'randomNormal']);
const PROTEZIONE_ESPLICITA = new Set(['wideguard', 'quickguard', 'matblock', 'craftyshield', 'substitute', 'shedtail']);
const CAMPO_ESPLICITO = new Set(['courtchange', 'defog']);
const SETUP_ESPLICITO = new Set(['bellydrum', 'focusenergy', 'laserfocus', 'dragoncheer', 'powertrick', 'stockpile', 'geomancy', 'tidyup', 'gearup',
    'magneticflux', 'takeheart', 'stuffcheeks']);
const RECUPERO_ESPLICITO = new Set(['wish', 'healingwish', 'lunardance', 'aquaring', 'ingrain', 'revivalblessing']);
const SUPPORTO_ESPLICITO = new Set(['followme', 'ragepowder', 'spotlight', 'allyswitch', 'afteryou', 'helpinghand', 'healpulse', 'acupressure',
    'instruct', 'coaching', 'aromaticmist', 'floralhealing', 'junglehealing', 'lifedew', 'lunarblessing', 'aromatherapy', 'healbell', 'hospitality']);
const DISTURBO_ESPLICITO = new Set(['haze', 'perishsong', 'destinybond', 'imprison', 'magiccoat', 'snatch', 'trick', 'switcheroo', 'skillswap',
    'roleplay', 'entrainment', 'worryseed', 'simplebeam', 'gastroacid', 'whirlwind', 'roar', 'taunt', 'encore', 'disable', 'torment', 'embargo',
    'healblock', 'leechseed', 'yawn', 'spite', 'painsplit', 'mefirst', 'partingshot', 'leechseed']);

// protezione: si para o si prende tempo; recupero: si cura; potenziamento: si prepara; campo: meteo, terreni, stanze, trappole, schermi,
// velocità; supporto: aiuta il compagno; disturbo: stati e trucchi sull'avversario; altro: mosse di stato senza un ruolo chiaro
function classifica(m) {
    if (m.stallingMove || PROTEZIONE_ESPLICITA.has(m.id)) return 'protezione';
    if (SUPPORTO_ESPLICITO.has(m.id) || BERSAGLI_ALLEATO.has(m.target) && !m.boosts) return 'supporto';
    if (RECUPERO_ESPLICITO.has(m.id) || (m.flags && m.flags.heal) || m.heal) return 'recupero';
    if (m.weather || m.terrain || m.pseudoWeather || m.sideCondition || CAMPO_ESPLICITO.has(m.id)) return 'campo';
    if ((m.boosts && ['self', 'allySide', 'allies', 'adjacentAlly'].includes(m.target)) || SETUP_ESPLICITO.has(m.id)) return 'potenziamento';
    if (DISTURBO_ESPLICITO.has(m.id) || m.status || m.volatileStatus && BERSAGLI_AVVERSARIO.has(m.target) || BERSAGLI_AVVERSARIO.has(m.target)) return 'disturbo';
    return 'altro';
}

async function caricaDex() {
    const copia = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'azioni-')), 'pkmn-sim.mjs');
    fs.copyFileSync(path.join(QUI, 'docs', 'pkmn-sim.js'), copia);
    return (await import(pathToFileURL(copia).href)).Dex;
}

function riga(ids) {
    const righe = [];
    let corrente = '';
    for (const id of ids) {
        if ((corrente + ' ' + id).length > 118) { righe.push(corrente); corrente = id; } else corrente = corrente ? corrente + ' ' + id : id;
    }
    if (corrente) righe.push(corrente);
    return righe.map(r => `        '${r}'`).join(' +\n        \' \' +\n') ;
}

(async () => {
    const Dex = await caricaDex();
    const classi = { protezione: [], recupero: [], potenziamento: [], campo: [], supporto: [], disturbo: [], altro: [] };
    for (const m of Dex.moves.all()) {
        if (m.category !== 'Status' || m.isMax || m.isZ) continue;
        classi[classifica(m)].push(m.id);
    }
    for (const k of Object.keys(classi)) classi[k] = [...new Set(classi[k])].sort();

    const testo = `// =====================================================
// AZIONI DELLE MOSSE — Poké-Tournament
//
// FILE GENERATO da tools/genera-azioni-mosse.cjs (non si modifica a mano). È lo stesso in docs/ e in functions/.
//
// classeDi(idMossa) dice che tipo di azione è una mossa quando un allenatore la sceglie:
//   attacco         fa danni (è il valore di tutto ciò che non è elencato qui sotto)
//   protezione      si para (Protect, Detect, Wide Guard...) o si nasconde (Substitute)
//   recupero        si cura (Recover, Roost, Rest, Wish...)
//   potenziamento   si prepara (Swords Dance, Calm Mind, Dragon Dance...)
//   campo           meteo, terreni, stanze, trappole, schermi, velocità (Rain Dance, Trick Room, Stealth Rock, Tailwind...)
//   supporto        aiuta il compagno (Helping Hand, Follow Me, Heal Pulse...)
//   disturbo        stati e trucchi sull'avversario (Thunder Wave, Taunt, Trick, Haze...)
//   altro           mosse di stato senza un ruolo chiaro (Splash, Metronome, Transform...)
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.AzioniMosse = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ELENCO = {
${Object.entries(classi).map(([k, ids]) => `        ${k}:\n${riga(ids)}`).join(',\n')}
    };

    const CLASSI = Object.keys(ELENCO);
    const PER_MOSSA = new Map();
    for (const classe of CLASSI) for (const id of ELENCO[classe].split(' ')) if (id) PER_MOSSA.set(id, classe);

    // "Stealth Rock" | "stealthrock" -> 'campo'
    function classeDi(mossa) {
        const id = String(mossa == null ? '' : mossa).toLowerCase().replace(/[^a-z0-9]+/g, '');
        return PER_MOSSA.get(id) || 'attacco';
    }

    return { classeDi, CLASSI: ['attacco'].concat(CLASSI), ELENCO };
});
`;
    for (const f of OBIETTIVI) fs.writeFileSync(f, testo);
    const conta = Object.entries(classi).map(([k, v]) => `${k} ${v.length}`).join(', ');
    console.log(`Scritto ${OBIETTIVI.map(f => path.relative(QUI, f)).join(' e ')}: ${conta}`);
})();
