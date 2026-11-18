'use strict';
// Genera docs/visibile-pkm.js: per ogni sprite animato (docs/sprites/ani/<id>.gif) quanta parte dell'altezza dell'immagine è occupata dal Pokémon.
// Perché: la GIF di un Pokémon che salta, rimbalza o vola (Spoink, Zubat, Golbat...) ha una tela molto più alta del Pokémon, e scalando sull'altezza dell'immagine
// il Pokémon visibile viene molto più piccolo di quello che dice la sua altezza vera. docs/scala-pkm.js e la pagina pubblica dividono per questa quota.
// Si usa l'altezza tipica (la mediana dei fotogrammi: non quella allungata a metà salto) del disegno composto, e solo per chi sta sotto il 95%.
// Quando arrivano sprite nuovi (docs/sprites): node tools/visibile-pkm/genera.cjs, e si commita il file generato.
const fs = require('node:fs');
const path = require('node:path');
const { leggiGif, misura } = require('./gif.cjs');

const CARTELLA = path.join(__dirname, '..', '..', 'docs', 'sprites', 'ani');
const FUORI = path.join(__dirname, '..', '..', 'docs', 'visibile-pkm.js');

function costruisci() {
    const tabella = {};
    for (const f of fs.readdirSync(CARTELLA).filter(n => n.endsWith('.gif')).sort()) {
        let m;
        try { m = misura(leggiGif(fs.readFileSync(path.join(CARTELLA, f)))); } catch (e) { continue; }
        if (!(m.altezzaTela > 0) || !(m.tipico > 0)) continue;
        const quota = Math.round((m.tipico / m.altezzaTela) * 100) / 100;
        if (quota < 0.95) tabella[f.slice(0, -4)] = quota;
    }
    return tabella;
}

function sorgente(tabella) {
    const righe = Object.entries(tabella).map(([k, v]) => `        ${JSON.stringify(k)}: ${v}`).join(',\n');
    return `// =====================================================
// QUOTA VISIBILE DEGLI SPRITE — file generato da tools/visibile-pkm/genera.cjs (non si modifica a mano)
// ---------------------------------------------------------------------
// Per ogni sprite animato (id di Showdown: "spoink", "urshifu-rapidstrike") che occupa meno del 95% dell'altezza della sua immagine: la quota occupata dal Pokémon
// (0,58 = il Pokémon è alto il 58% dell'immagine, il resto è vuoto trasparente: salti, voli). Gli sprite che non ci sono riempiono la loro immagine (quota 1).
// Funziona nel browser (window.VisibilePkm) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const T = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = T;
    else radice.VisibilePkm = T;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    return {
${righe}
    };
});
`;
}

if (require.main === module) {
    const tabella = costruisci();
    fs.writeFileSync(FUORI, sorgente(tabella));
    console.log(`${Object.keys(tabella).length} sprite sotto il 95%: ${path.relative(process.cwd(), FUORI)}`);
}
module.exports = { costruisci, sorgente };
