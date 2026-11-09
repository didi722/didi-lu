'use strict';
// Log finti di set in singolo, per le prove della CPU che impara dai replay (cpu-situazioni.js): a ogni turno ognuno dei due sceglie con le probabilità
// che si danno (che possono dipendere dai PS bassi) e i PS cambiano a caso. Non sono replay veri: servono a sapere cosa dovrebbe imparare chi li legge.
const S = require('../../docs/cpu-situazioni.js');

// un generatore pseudo-casuale con seme
function casuale(seme) {
    let a = seme >>> 0 || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function scegliCategoria(p, rnd) {
    let x = rnd();
    for (const k of S.CATEGORIE) { x -= p[k]; if (x < 0) return k; }
    return 'attacco';
}
// Un set finto, in singolo: 14 turni, a ogni turno ognuno dei due sceglie con le probabilità dell'effetto e i PS cambiano a caso.
// effetto(psBassi) -> { attacco, protezione, cambio, altro }
function logFinto(rnd, effetto, nomi = ['Ada', 'Bruno']) {
    const righe = ['|player|p1|' + nomi[0] + '|1|', '|player|p2|' + nomi[1] + '|2|', '|gametype|singles', '|teamsize|p1|6', '|teamsize|p2|6', '|start',
        '|switch|p1a: A0|Garchomp, L50|100/100', '|switch|p2a: B0|Rillaboom, L50|100/100'];
    const nick = { p1: 'A0', p2: 'B0' };
    const pct = { p1: 100, p2: 100 };
    let n = 0;
    for (let turno = 1; turno <= 14; turno++) {
        righe.push(`|turn|${turno}`);
        const scelte = {};
        for (const lato of ['p1', 'p2']) scelte[lato] = scegliCategoria(effetto(pct[lato] < 34), rnd);
        for (const lato of ['p1', 'p2']) if (scelte[lato] === 'cambio') {
            nick[lato] = `${lato === 'p1' ? 'A' : 'B'}${++n}`;
            righe.push(`|switch|${lato}a: ${nick[lato]}|${lato === 'p1' ? 'Garchomp' : 'Rillaboom'}, L50|100/100`);
            pct[lato] = 100;
        }
        for (const lato of ['p1', 'p2']) {
            const altro = lato === 'p1' ? 'p2' : 'p1';
            if (scelte[lato] === 'protezione') righe.push(`|move|${lato}a: ${nick[lato]}|Protect|${lato}a: ${nick[lato]}`);
            else if (scelte[lato] === 'altro') righe.push(`|move|${lato}a: ${nick[lato]}|Swords Dance|${lato}a: ${nick[lato]}`);
            else if (scelte[lato] === 'attacco') righe.push(`|move|${lato}a: ${nick[lato]}|Tackle|${altro}a: ${nick[altro]}`);
        }
        for (const lato of ['p1', 'p2']) {                                   // i PS del prossimo turno: a caso, ma una volta su quattro bassi
            pct[lato] = rnd() < 0.25 ? 5 + Math.floor(rnd() * 25) : 40 + Math.floor(rnd() * 60);
            righe.push(`|-damage|${lato}a: ${nick[lato]}|${pct[lato]}/100`);
        }
        righe.push('|upkeep');
    }
    return righe;
}
const set = (n, effetto, seme = 7) => { const rnd = casuale(seme); return Array.from({ length: n }, (_, i) => ({ id: 's' + i, log: logFinto(rnd, effetto, i % 2 ? ['Ada', 'Bruno'] : ['Bruno', 'Ada']), giocatori: i % 2 ? { p1: 'ada', p2: 'bruno' } : { p1: 'bruno', p2: 'ada' } })); };


module.exports = { casuale, logFinto, set };
