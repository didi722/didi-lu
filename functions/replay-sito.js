// =====================================================
// REPLAY DEL SITO — Poké-Tournament
//
// creaReplayHtml() restituisce l'HTML di un replay con l'estetica del
// nostro simulatore (lo schermo di battle.html: barre HP, adesivo del
// turno, nomi, scanline) al posto della pagina replay di Showdown.
//
// Il file è autosufficiente: lo si carica su Storage come prima e
// matches.html lo apre nell'iframe dentro la scocca dell'Advance.
// Il motore grafico resta quello di Showdown (stessi script di battle.html).
//
// Nel riquadro piccolo (iframe dell'Advance, telefono) lo schermo si scala
// sulla larghezza ed è posizionato esattamente come lo schermo dei replay di
// Showdown: così il ritaglio di #replayFrame in matches.html inquadra il
// campo come prima, senza toccare la scocca.
//
// Niente hover sui Pokémon: nei replay non compaiono le schede di Showdown.
//
// adattaReplayShowdown() fa la stessa cosa (e porta le stesse barre della salute) ai
// replay scaricati da Showdown e caricati a mano da matches.html.
//
// Funziona sia nelle Cloud Functions (require) sia nel browser (window.ReplaySito).
// ATTENZIONE: questo file esiste in due copie identiche, functions/replay-sito.js (replay
// del simulatore) e docs/replay-sito.js (caricamento a mano). Modificane una e copiala sull'altra.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.ReplaySito = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SHOWDOWN = 'https://play.pokemonshowdown.com';

    // Gli stessi file che carica battle.html
    const STILI = [
        '/style/font-awesome.css',
        '/style/battle.css',
        '/style/utilichart.css',
    ];
    const SCRIPT = [
        '/js/lib/ps-polyfill.js',
        '/config/config.js',
        '/js/lib/jquery-1.11.0.min.js',
        '/js/lib/html-sanitizer-minified.js',
        '/js/battle-sound.js',
        '/js/battledata.js',
        '/data/pokedex-mini.js',
        '/data/pokedex-mini-bw.js',
        '/data/graphics.js',
        '/data/pokedex.js',
        '/data/moves.js',
        '/data/abilities.js',
        '/data/items.js',
        '/data/teambuilder-tables.js',
        '/js/battle-tooltips.js',
        '/js/battle.js',
    ];

    // -------------------------------------------------
    // Barre della salute, nomi e stati: le regole di style-battle.css (.palco .statbar ...)
    // con il prefisso scelto. Il replay usa '.palco', i replay di Showdown caricati a mano
    // (adattaReplayShowdown) usano '.battle', che è la classe che Showdown dà al suo campo.
    // -------------------------------------------------
    const barreSalute = radice => `
${radice} .statbar strong {
    font: 700 10px/11px 'Josefin Sans', sans-serif; text-transform: uppercase; letter-spacing: .02em;
    color: var(--inchiostro);
    margin-bottom: 1px;
}
${radice} .statbar .hpbar {
    box-sizing: content-box;
    width: 148px; height: 6px; padding: 0;
    background: var(--carta);
    border: 2px solid var(--inchiostro); border-radius: 0;
    box-shadow: 2px 2px 0 var(--inchiostro);
}
${radice} .statbar .hpbar .hp,
${radice} .statbar .hpbar .prevhp { height: 6px; border: 0; border-radius: 0; }
${radice} .statbar .hpbar .hp { background: var(--conferma); }
${radice} .statbar .hpbar .hp-yellow { background: var(--ambra); }
${radice} .statbar .hpbar .hp-red { background: var(--pericolo); }
${radice} .statbar .hpbar .prevhp { background: #b9efc9; }
${radice} .statbar .hpbar .prevhp-yellow { background: #ffe4b0; }
${radice} .statbar .hpbar .prevhp-red { background: #ffc4c4; }
${radice} .statbar .hpbar .hptext {
    top: -2px; height: 10px; width: 30px;
    background: var(--inchiostro); color: var(--carta);
    border-radius: 0; text-shadow: none;
    font: 700 8px/11px 'Josefin Sans', sans-serif;
}
${radice} .rstatbar .hpbar .hptext { right: -32px; border-radius: 0; }
${radice} .lstatbar .hpbar .hptext { left: -32px; border-radius: 0; }
${radice} .statbar .hpbar .hptextborder { display: none; }
${radice} .rstatbar.rightstatbar { margin-top: 6px; }
${radice} .statbar .status { margin-top: 2px; }
${radice} .statbar span {
    display: inline-block; margin: 0 2px 2px 0; padding: 0 3px;
    border: 1px solid var(--inchiostro); border-radius: 0;
    font: 700 8px/11px 'Montserrat', sans-serif;
}
${radice} .statbar span.brn { background: #ff4422; color: var(--carta); border: 1px solid var(--inchiostro); border-radius: 0; }
${radice} .statbar span.psn,
${radice} .statbar span.tox { background: #aa5599; color: var(--carta); border: 1px solid var(--inchiostro); border-radius: 0; }
${radice} .statbar span.par { background: #ffcc33; color: var(--inchiostro); border: 1px solid var(--inchiostro); border-radius: 0; }
${radice} .statbar span.slp { background: #c8c8a8; color: var(--inchiostro); border: 1px solid var(--inchiostro); border-radius: 0; }
${radice} .statbar span.frz { background: #66ccff; color: var(--inchiostro); border: 1px solid var(--inchiostro); border-radius: 0; }
${radice} .statbar span.good { background: #d4f7df; color: var(--conferma-scuro); border-color: var(--inchiostro); }
${radice} .statbar span.bad { background: #ffd9d9; color: #a10d0d; border-color: var(--inchiostro); }
${radice} .statbar span.neutral { background: var(--crema); color: var(--inchiostro); border-color: var(--inchiostro); }

`;

    // -------------------------------------------------
    // Stile: le regole dello schermo vengono da style-battle.css
    // (.palco); il resto è solo del replay.
    // -------------------------------------------------
    const CSS = String.raw`
:root {
    --inchiostro: #000;
    --carta: #fff;
    --crema: #fffdf6;
    --sfondo-a: #f4f4f4;
    --sfondo-b: #d3d3d3;
    --ambra: #ffbd44;
    --conferma: #09ca49;
    --conferma-scuro: #056425;
    --pericolo: #ea1818;
    --colore-p1: #6fa8ff;
    --colore-p2: #ff7b6b;
    --bordo: 3px solid var(--inchiostro);
    --bordo-forte: 4px solid var(--inchiostro);
    --alza: translate(-3px, -3px) rotate(0deg);
    --atterra: translate(3px, 3px) rotate(0deg);
    --tempo: .12s ease;
}
[hidden] { display: none !important; }
html, body { margin: 0; padding: 0; }
body {
    min-height: 100vh;
    font-family: 'Montserrat', sans-serif;
    color: var(--inchiostro);
    background: linear-gradient(135deg, var(--sfondo-a) -50%, var(--sfondo-b) 100%);
}

/* ---------- Pagina intera (replay aperto da solo) ---------- */
.replay {
    box-sizing: border-box;
    max-width: 760px;
    margin: 0 auto;
    padding: 22px 20px 40px;
    display: flex; flex-direction: column; gap: 22px;
}
.replay-testa { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
.replay-titolo { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin: 0; font-size: inherit; }
.replay-nome {
    display: inline-block;
    padding: 9px 12px 5px;
    border: var(--bordo-forte);
    box-shadow: 6px 6px 0 var(--inchiostro);
    font: 700 1.6rem 'Josefin Sans', sans-serif; line-height: 1; text-transform: uppercase;
    transform: rotate(-3deg);
}
.replay-nome.p1 { background: var(--colore-p1); }
.replay-nome.p2 { background: var(--colore-p2); transform: rotate(3deg); }
.replay-vs { font: 700 1rem 'Josefin Sans', sans-serif; text-transform: uppercase; }
.replay-info { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
.replay-info span {
    padding: 5px 9px 3px;
    background: var(--crema); border: 2px solid var(--inchiostro);
    font: 700 .75rem 'Josefin Sans', sans-serif; text-transform: uppercase;
}
.replay-info span:first-child { background: var(--inchiostro); color: var(--carta); border-color: var(--inchiostro); }

/* Cornice nera dello schermo, come .cab-schermo */
.replay-cornice {
    position: relative;
    align-self: center;
    padding: 14px;
    background: var(--inchiostro);
    border: var(--bordo);
    box-shadow: 12px 12px 0 var(--inchiostro);
}
.replay-cornice::before {
    content: ''; position: absolute; inset: 9px;
    border: 2px solid #3a3a3a;
    pointer-events: none;
}

.cronaca.battle-log {
    position: relative; top: auto; left: auto; right: auto; bottom: auto;
    box-sizing: border-box;
    height: 280px;
    background: var(--carta);
    border: var(--bordo);
    box-shadow: 8px 8px 0 var(--inchiostro);
    font-family: 'Montserrat', sans-serif;
    font-size: .78rem;
    scrollbar-color: var(--inchiostro) #eee;
}
.cronaca h2.battle-history {
    display: inline-block;
    margin: 14px 0 6px;
    padding: 4px 10px 2px;
    background: var(--inchiostro); color: var(--carta);
    border: 0;
    font: 700 .85rem 'Josefin Sans', sans-serif; text-transform: uppercase;
    transform: rotate(-1.5deg);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, .25);
}

/* ---------- Riquadro piccolo: iframe dell'Advance, telefono ----------
   Solo lo schermo, su fondo nero. Lo schermo sta a 22px dall'alto come il
   campo dei replay di Showdown (12px di margine + 9px + 1px di bordo):
   il ritaglio di #replayFrame in matches.html è tarato su quella posizione. */
@media (max-width: 719px) {
    body { min-height: 0; background: #000; overflow: hidden; }
    .replay { display: block; max-width: none; padding: 0; }
    .replay-testa, .cronaca { display: none; }
    .replay-cornice { position: static; padding: 0; border: 0; box-shadow: none; background: none; }
    .replay-cornice::before { display: none; }
    .palco { position: absolute; top: 22px; left: 0; transform-origin: 0 0; }
    /* lo schermo è piccolo: il grande "Play" e il cartello di fine set si riducono, la scritta sotto il Play (c'è già la testata della pagina) sparisce */
    .velo-avvio { gap: 0; }
    .velo-avvio .btn-avvio { padding: 11px 22px 8px; font-size: 1.2rem; box-shadow: 6px 6px 0 var(--inchiostro); }
    .velo-avvio .btn-avvio svg { width: 17px; height: 17px; }
    .velo-avvio p { display: none; }
    .esito-card { padding: 12px 14px 12px; }
    .esito-card h2 { font-size: 1.05rem; }
    .esito-card .btn { margin-top: 10px; padding: 7px 12px 5px; font-size: .75rem; }
}


/* =====================================================
   LO SCHERMO — come .palco in style-battle.css
   ===================================================== */
.palco {
    position: relative;
    width: 640px; height: 360px;
    background: #cfd5da;
    overflow: hidden;
}
.palco .battle { position: absolute; top: 0; left: 0; border: 0; }

/* righe di scansione leggerissime sopra la partita */
.palco::after {
    content: ''; position: absolute; inset: 0; z-index: 12;
    background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, .05) 0 1px, transparent 1px 3px);
    pointer-events: none;
}

.palco .trainer div.teamicons { display: none; }
.palco .trainer-near, .palco .trainer-far2 { bottom: 135px; }
.palco .trainer-far, .palco .trainer-near2 { bottom: 292px; }
.palco .trainer strong {
    display: table;
    margin: 0 auto 6px;
    padding: 4px 7px 2px;
    background: var(--inchiostro); color: var(--carta);
    border: 2px solid var(--carta);
    font: 700 .68rem 'Josefin Sans', sans-serif; text-transform: uppercase;
    transform: rotate(-3deg);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, .35);
}
.palco .rightbar .trainer strong { transform: rotate(3deg); }
.palco .trainer div.trainersprite { opacity: 1; }

/* Il testo di meteo e terreni diventa i cartellini in alto a destra */
.palco .weather em { display: none; }

/* Contatore del turno: adesivo nero (2px più in basso che in battle.html,
   per restare tutto dentro l'inquadratura dell'Advance) */
.palco .turn {
    top: 10px; left: 112px;
    padding: 4px 9px 2px;
    background: var(--inchiostro); color: var(--carta);
    border: 2px solid var(--carta); border-radius: 0;
    font: 700 .95rem 'Josefin Sans', sans-serif; text-transform: uppercase;
    transform: rotate(-3deg);
    box-shadow: 3px 3px 0 rgba(0, 0, 0, .35);
}

${barreSalute('.palco')}

/* "seeking..." di Showdown: velo crema con l'adesivo nero */
.palco .seeking { z-index: 11; background: rgba(255, 253, 246, .96); }
.palco .seeking strong {
    display: table; margin: 160px auto 0; padding: 6px 13px 4px;
    background: var(--inchiostro); color: var(--carta);
    font: 700 1rem 'Josefin Sans', sans-serif; text-transform: uppercase;
    transform: rotate(-2deg);
}


/* ---------- Effetti di campo: cartellini in alto a destra ---------- */
.effetti {
    position: absolute; top: 12px; right: 114px; z-index: 14;
    max-width: 270px;
    display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px;
    pointer-events: none;
}
.campo-voce {
    display: inline-flex; align-items: baseline; gap: 4px;
    padding: 3px 6px 1px;
    background: var(--crema);
    border: 2px solid var(--inchiostro); box-shadow: 2px 2px 0 var(--inchiostro);
    font: 700 10px/1.2 'Josefin Sans', sans-serif; text-transform: uppercase;
    transform: rotate(1.5deg);
}
.campo-voce:nth-child(even) { transform: rotate(-1.2deg); }
.campo-voce small { font: 600 9px 'Montserrat', sans-serif; text-transform: none; }
.campo-voce.meteo { background: var(--ambra); }
.campo-voce.meteo.annullato { text-decoration: line-through 2px; }
.campo-voce.terreno { background: #d4f7df; }
.campo-voce.campo { background: var(--inchiostro); color: var(--carta); }
.campo-voce.lato-cond.p1 { background: var(--colore-p1); }
.campo-voce.lato-cond.p2 { background: var(--colore-p2); }


/* ---------- Bottoni (come .btn di battle.html) ---------- */
.btn {
    --tilt: -1.5deg;
    position: relative;
    box-sizing: border-box;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 10px 16px 8px;
    background: var(--carta); color: var(--inchiostro);
    border: var(--bordo); box-shadow: 4px 4px 0 var(--inchiostro);
    font: 700 .85rem 'Josefin Sans', sans-serif; text-transform: uppercase;
    cursor: pointer;
    transform: rotate(var(--tilt));
    transition: transform var(--tempo), box-shadow var(--tempo), background-color var(--tempo), color var(--tempo);
}
.btn:hover { z-index: 2; transform: var(--alza); box-shadow: 7px 7px 0 var(--inchiostro); }
.btn:active { transform: var(--atterra); box-shadow: 0 0 0 var(--inchiostro); }
.btn:focus-visible { outline: 3px dashed var(--inchiostro); outline-offset: 4px; }
.btn.primario { background: var(--conferma); }
.btn.primario:hover { background: var(--conferma-scuro); color: var(--carta); }
.btn svg { display: block; width: 14px; height: 14px; fill: currentColor; }


/* ---------- Avvio: velo con il grande "Play" ---------- */
.velo-avvio {
    position: absolute; inset: 0; z-index: 40;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
    background: rgba(0, 0, 0, .28);
    cursor: pointer;
}
.velo-avvio .btn-avvio {
    --tilt: -3deg;
    padding: 16px 30px 12px;
    font-size: 1.6rem;
    border: var(--bordo-forte);
    box-shadow: 8px 8px 0 var(--inchiostro);
    background: var(--ambra);
}
.velo-avvio .btn-avvio:hover { box-shadow: 11px 11px 0 var(--inchiostro); }
.velo-avvio .btn-avvio svg { width: 22px; height: 22px; }
.velo-avvio p {
    margin: 0; max-width: 380px;
    padding: 5px 11px 3px;
    background: var(--inchiostro); color: var(--carta);
    font: 700 .8rem 'Josefin Sans', sans-serif; text-transform: uppercase; text-align: center;
    transform: rotate(2deg);
}


/* ---------- Fine del set: cartello come .esito-card ---------- */
.esito {
    position: absolute; inset: 0; z-index: 35;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, .25);
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
}
.esito-card {
    box-sizing: border-box; max-width: 370px;
    padding: 20px 22px 18px;
    background: var(--ambra);
    border: var(--bordo-forte); box-shadow: 9px 9px 0 var(--inchiostro);
    text-align: center;
    transform: rotate(-2deg);
    animation: esitoEntra .2s cubic-bezier(.175, .885, .32, 1.275);
}
@keyframes esitoEntra {
    from { opacity: 0; transform: rotate(-2deg) scale(.9) translateY(12px); }
    to   { opacity: 1; transform: rotate(-2deg) scale(1) translateY(0); }
}
.esito-card h2 {
    display: inline-block; margin: 0;
    padding: 6px 14px 4px;
    background: var(--inchiostro); color: var(--carta);
    font: 700 1.35rem 'Josefin Sans', sans-serif; text-transform: uppercase;
    transform: rotate(-2deg);
    box-shadow: 5px 5px 0 rgba(0, 0, 0, .3);
}
.esito-card .btn { margin-top: 16px; }


/* ---------- Comandi: compaiono in pausa o muovendo il mouse ---------- */
.comandi-replay {
    position: absolute; left: 50%; bottom: 10px; z-index: 30;
    box-sizing: border-box;
    width: 396px;
    padding: 8px 10px 9px;
    background: var(--carta);
    border: var(--bordo); box-shadow: 5px 5px 0 var(--inchiostro);
    transform: translateX(-50%) rotate(-1deg);
    opacity: 0; visibility: hidden;
    transition: opacity .18s ease, visibility .18s;
}
.palco.comandi-visibili .comandi-replay { opacity: 1; visibility: visible; }

.barra-turni {
    position: relative;
    height: 10px; margin-bottom: 8px;
    background: var(--carta);
    border: 2px solid var(--inchiostro);
    cursor: pointer;
}
.barra-turni > span { display: block; height: 100%; width: 0; background: var(--ambra); border-right: 2px solid var(--inchiostro); box-sizing: border-box; }
.barra-turni:focus-visible { outline: 3px dashed var(--inchiostro); outline-offset: 3px; }
/* la pagina che contiene il replay ha già la sua barra (fuori dallo schermo): quella interna non serve */
.barra-fuori .barra-turni { display: none; }
/* con la barra dei turni fuori dallo schermo i comandi sono una pillola piccola: indietro, play, avanti, velocità, suono
   (il contatore e "dall'inizio" stanno già nella barra della pagina) e non coprono il campo */
.barra-fuori .comandi-replay { width: auto; padding: 5px 7px 6px; }
.barra-fuori .contatore-turni, .barra-fuori #btn-inizio { display: none; }
.barra-fuori .riga-comandi { gap: 6px; }
.barra-fuori .tasto { width: 30px; height: 28px; }
.barra-fuori .tasto.play { width: 38px; }
.barra-fuori .tasto.velocita { width: 34px; }
.barra-fuori .tasto svg { width: 12px; height: 12px; }

.riga-comandi { display: flex; align-items: center; gap: 7px; }
.tasto {
    --tilt: -2deg;
    flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 34px; padding: 0;
    background: var(--carta); color: var(--inchiostro);
    border: 2px solid var(--inchiostro); box-shadow: 3px 3px 0 var(--inchiostro);
    font: 700 .8rem 'Josefin Sans', sans-serif; text-transform: uppercase;
    cursor: pointer;
    transform: rotate(var(--tilt));
    transition: transform var(--tempo), box-shadow var(--tempo), background-color var(--tempo);
}
.tasto:nth-child(even) { --tilt: 1.5deg; }
.tasto:hover { transform: var(--alza); box-shadow: 5px 5px 0 var(--inchiostro); }
.tasto:active { transform: var(--atterra); box-shadow: 0 0 0 var(--inchiostro); }
.tasto:focus-visible { outline: 3px dashed var(--inchiostro); outline-offset: 3px; }
.tasto svg { display: block; width: 14px; height: 14px; fill: currentColor; }
.tasto.play { width: 46px; background: var(--ambra); }
.tasto.velocita { width: 40px; padding-top: 3px; }
.contatore-turni {
    flex: 1; text-align: center;
    font: 700 .78rem 'Josefin Sans', sans-serif; text-transform: uppercase; white-space: nowrap;
    padding-top: 2px;
}


/* ---------- Niente hover sui Pokémon ----------
   Showdown mostra una scheda quando si passa col mouse su un Pokémon, sul contatore del turno
   o sulle icone: nei replay non serve e copre il campo. Si staccano anche gli ascoltatori
   (giocaReplay), qui si spegne tutto ciò che potrebbe riceverli. */
.palco .has-tooltip, .palco .tooltips { pointer-events: none; cursor: default; }
#tooltipwrapper { display: none !important; }

@media (prefers-reduced-motion: reduce) {
    .btn, .tasto, .comandi-replay { transition: none; }
    .esito-card { animation: none; }
}
`;

    // -------------------------------------------------
    // Icone dei comandi (SVG 16×16)
    // -------------------------------------------------
    const ICONE = {
        play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 1.5v13l11-6.5z"/></svg>',
        pausa: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 1.5h4v13h-4zM9.5 1.5h4v13h-4z"/></svg>',
        inizio: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2a6 6 0 1 1-5.66 8h2.2A4 4 0 1 0 8 4v2.5L4 3.25 8 0z"/></svg>',
        indietro: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h2.5v12H2zM14 2v12L5.5 8z"/></svg>',
        avanti: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2H14v12h-2.5zM2 2v12l8.5-6z"/></svg>',
        audio: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 5.5h3L8 2v12l-4-3.5H1zM10.5 4.6a4.6 4.6 0 0 1 0 6.8l-1-1.1a3.1 3.1 0 0 0 0-4.6zM12.6 2.4a7.6 7.6 0 0 1 0 11.2l-1-1.1a6.1 6.1 0 0 0 0-9z"/></svg>',
        muto: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 5.5h3L8 2v12l-4-3.5H1zM10 5.6l1-1 2 2 2-2 1 1-2 2 2 2-1 1-2-2-2 2-1-1 2-2z"/></svg>',
    };


    // -------------------------------------------------
    // Codice che gira nella pagina del replay.
    // Viene copiato nel file così com'è (toString): niente variabili esterne.
    // -------------------------------------------------
    function giocaReplay() {
        'use strict';
        const $ = id => document.getElementById(id);
        const dati = JSON.parse($('dati-replay').textContent);
        const radice = document.documentElement;
        const palco = $('palco');
        const ICONE = dati.icone;

        for (const lato of ['p1', 'p2']) {
            if (dati[lato].colore) radice.style.setProperty('--colore-' + lato, dati[lato].colore);
        }

        // --- Scala: nel riquadro piccolo lo schermo prende tutta la larghezza ---
        const piccolo = window.matchMedia('(max-width: 719px)');
        function adatta() {
            if (piccolo.matches) {
                const w = radice.clientWidth || window.innerWidth;
                const s = Math.min(1, w / 640);
                palco.style.transform = 'scale(' + s + ')';
                palco.style.left = Math.max(0, (w - 640 * s) / 2) + 'px';
            } else {
                palco.style.transform = '';
                palco.style.left = '';
            }
        }
        adatta();
        window.addEventListener('resize', adatta);

        function errore(testo) {
            $('btn-avvio').hidden = true;
            $('testo-avvio').textContent = testo;
            $('velo-avvio').hidden = false;
        }

        if (!window.Battle || !window.jQuery) {
            return errore("Showdown's battle engine didn't load. Check your connection and reload.");
        }

        // Avatar del sito: un indirizzo d'immagine passa così com'è (come in battle-extra.js)
        const Dex = window.Dex;
        if (Dex && Dex.resolveAvatar && !Dex.resolveAvatar.sito) {
            const risolvi = Dex.resolveAvatar.bind(Dex);
            Dex.resolveAvatar = a => String(a).startsWith('sito:') ? String(a).slice(5) : risolvi(a);
            Dex.resolveAvatar.sito = true;
        }

        let battle;
        try {
            battle = new window.Battle({
                id: dati.id,
                $frame: window.jQuery('#campo'),
                $logFrame: window.jQuery('#log'),
                log: dati.log,
                isReplay: true,
                paused: true,
            });
            battle.isReplay = true;
        } catch (e) {
            console.error(e);
            return errore("This replay couldn't be read.");
        }

        // Niente tooltip al passaggio del mouse sui Pokémon: il motore li aggancia al campo, qui si staccano
        try { battle.scene.tooltips.unlisten(window.jQuery('#campo')); } catch (e) { /* al peggio resta il CSS */ }

        // --- Preferenze del replay (audio, velocità) ---
        const leggi = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
        const scrivi = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* niente */ } };
        const VELOCITA = [
            { etichetta: '1×', fade: 300, mostrato: 1 },
            { etichetta: '2×', fade: 50, mostrato: 1 },
            { etichetta: '3×', fade: 40, mostrato: 1 },
        ];
        let velocita = Math.min(VELOCITA.length - 1, Math.max(0, parseInt(leggi('replaySitoVelocita'), 10) || 0));
        let muto = leggi('replaySitoMuto') === '1';

        function applicaVelocita() {
            const v = VELOCITA[velocita];
            battle.messageFadeTime = v.fade;
            battle.messageShownTime = v.mostrato;
            if (battle.scene && battle.scene.updateAcceleration) battle.scene.updateAcceleration();
            $('btn-velocita').textContent = v.etichetta;
            $('btn-velocita').setAttribute('aria-label', 'Speed ' + v.etichetta);
        }
        function applicaAudio() {
            battle.setMute(muto);
            const b = $('btn-audio');
            b.innerHTML = muto ? ICONE.muto : ICONE.audio;
            b.setAttribute('aria-pressed', muto ? 'false' : 'true');
            b.setAttribute('aria-label', muto ? 'Sound off' : 'Sound on');
        }
        applicaVelocita();
        applicaAudio();

        // --- Avatar e nomi del sito al posto di quelli di Showdown ---
        function impostaAvatar() {
            for (const lato of ['p1', 'p2']) {
                const side = battle[lato];
                if (!side) continue;
                const scelto = dati[lato].avatar;
                const voluto = !scelto ? 'unknown' : /[/.]/.test(scelto) ? 'sito:' + scelto : scelto;
                if (side.avatar !== voluto) {
                    side.setAvatar(voluto);
                    if (battle.scene && battle.scene.updateSidebar) battle.scene.updateSidebar(side);
                }
            }
        }

        // --- Meteo, terreni, Trick Room e condizioni dei lati (come #cab-campo) ---
        const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        function turniRimasti(min, max) {
            if (min && max && min !== max) return min + ' or ' + max + ' turns';
            const n = min || max;
            return n ? n + (n === 1 ? ' turn' : ' turns') : '';
        }
        function nomeMossa(nome) {
            try { return battle.dex.moves.get(nome).name || nome; } catch (e) { return nome; }
        }
        function aggiornaCampo() {
            const box = $('effetti');
            const voci = [];
            if (battle.weather) {
                let nome = battle.weather;
                try { nome = window.BattleTextParser.weatherName(battle.weather) || nome; } catch (e) { /* nome grezzo */ }
                let annullato = false;
                try { annullato = !!battle.abilityActive(['Air Lock', 'Cloud Nine']); } catch (e) { /* no */ }
                voci.push({ classe: 'meteo' + (annullato ? ' annullato' : ''), nome, turni: turniRimasti(battle.weatherMinTimeLeft, battle.weatherTimeLeft) });
            }
            for (const [nome, min, max] of battle.pseudoWeather || []) {
                voci.push({ classe: /terrain/i.test(nome) ? 'terreno' : 'campo', nome: nomeMossa(nome), turni: turniRimasti(min, max) });
            }
            for (const lato of ['p1', 'p2']) {
                const condizioni = (battle[lato] && battle[lato].sideConditions) || {};
                for (const [nome, livelli, min, max] of Object.values(condizioni)) {
                    voci.push({
                        classe: 'lato-cond ' + lato,
                        nome: nomeMossa(nome) + (livelli > 1 ? ' ×' + livelli : ''),
                        turni: turniRimasti(min, max),
                        di: dati[lato].nome,
                    });
                }
            }
            const firma = JSON.stringify(voci);
            if (box.dataset.firma === firma) return;
            box.dataset.firma = firma;
            box.innerHTML = voci.map(v =>
                '<span class="campo-voce ' + v.classe + '"' + (v.di ? ' title="' + esc(v.di) + '\'s side"' : '') + '>' +
                esc(v.nome) + (v.turni ? '<small>' + esc(v.turni) + '</small>' : '') + '</span>').join('');
        }

        // --- Comandi ---
        const totaleTurni = dati.turni;
        function aggiornaComandi() {
            const inPausa = battle.paused || !!(battle.ended && battle.atQueueEnd);
            const play = $('btn-play');
            play.innerHTML = inPausa ? ICONE.play : ICONE.pausa;
            play.setAttribute('aria-label', inPausa ? 'Play' : 'Pause');

            // La barra conta i turni conclusi: all'inizio del turno N ne sono finiti N - 1
            const turno = Math.max(0, battle.turn);
            const finito = battle.ended && battle.atQueueEnd;
            const fatto = finito ? 1 : totaleTurni ? Math.min(1, Math.max(0, turno - 1) / totaleTurni) : 0;
            $('avanzamento').style.width = (fatto * 100) + '%';
            const barra = $('barra-turni');
            barra.setAttribute('aria-valuenow', String(turno));
            barra.setAttribute('aria-valuetext', 'Turn ' + turno + ' of ' + totaleTurni);
            $('contatore-turni').textContent = turno ? 'Turn ' + turno + ' / ' + totaleTurni : dati.etichettaInizio;

            palco.classList.toggle('in-pausa', !!inPausa);
            mostraComandi();
            avvisaGenitore(turno, finito, fatto);
        }

        // Dentro la scocca del Game Boy (matches.html) la barra dei turni sta fuori dallo schermo: il replay
        // dice alla pagina a che turno è e la pagina gli manda i clic. La pagina, appena sente il replay,
        // risponde "barra-fuori": solo allora la barra interna sparisce (con una pagina che non sa
        // nulla di tutto questo, per esempio un replay aperto da solo, resta quella interna).
        let ultimoAvviso = '';
        function avvisaGenitore(turno, finito, fatto) {
            if (window.parent === window) return;
            const messaggio = { tipo: 'replay-turni', turno, totale: totaleTurni, finito, fatto: Math.round(fatto * 1000) / 1000 };
            const chiave = JSON.stringify(messaggio);
            if (chiave === ultimoAvviso) return;
            ultimoAvviso = chiave;
            try { window.parent.postMessage(messaggio, '*'); } catch (e) { /* la pagina non ascolta */ }
        }

        let timerComandi = null;
        function mostraComandi() {
            if (!$('velo-avvio').hidden) { palco.classList.remove('comandi-visibili'); return; }
            palco.classList.add('comandi-visibili');
            clearTimeout(timerComandi);
            timerComandi = setTimeout(() => {
                const fermo = palco.classList.contains('in-pausa');
                const sopra = $('comandi-replay').matches(':hover, :focus-within');
                if (!fermo && !sopra) palco.classList.remove('comandi-visibili');
            }, 2200);
        }

        let timerEsito = null;
        function aggiornaEsito() {
            clearTimeout(timerEsito);
            if (!(battle.ended && battle.atQueueEnd)) { $('esito').hidden = true; return; }
            if (!$('esito').hidden) return;
            // un attimo per vedere l'ultimo KO prima del cartello
            timerEsito = setTimeout(() => {
                if (battle.ended && battle.atQueueEnd) $('esito').hidden = false;
            }, 900);
        }

        function aggiorna() {
            impostaAvatar();
            aggiornaCampo();
            aggiornaComandi();
            aggiornaEsito();
        }

        function avvia() {
            $('velo-avvio').hidden = true;
            if (battle.ended && battle.atQueueEnd) battle.reset();
            battle.play();
            aggiorna();
        }
        function playPausa() {
            if (!$('velo-avvio').hidden) return avvia();
            if (battle.ended && battle.atQueueEnd) { battle.reset(); battle.play(); return; }
            if (battle.paused) battle.play(); else battle.pause();
        }
        function daCapo() {
            $('velo-avvio').hidden = true;
            $('esito').hidden = true;
            battle.reset();
            battle.play();
        }
        function spostaTurno(delta) {
            $('velo-avvio').hidden = true;
            battle.seekBy(delta);
        }

        $('velo-avvio').addEventListener('click', avvia);
        $('btn-play').addEventListener('click', playPausa);
        $('btn-inizio').addEventListener('click', daCapo);
        $('btn-indietro').addEventListener('click', () => spostaTurno(-1));
        $('btn-avanti').addEventListener('click', () => spostaTurno(1));
        $('btn-ancora').addEventListener('click', daCapo);
        $('btn-velocita').addEventListener('click', () => {
            velocita = (velocita + 1) % VELOCITA.length;
            scrivi('replaySitoVelocita', String(velocita));
            applicaVelocita();
        });
        $('btn-audio').addEventListener('click', () => {
            muto = !muto;
            scrivi('replaySitoMuto', muto ? '1' : '0');
            applicaAudio();
        });

        // Barra dei turni: un clic porta lì (in fondo = fine del set)
        const barra = $('barra-turni');
        function vaiAFrazione(frazione) {
            if (!totaleTurni) return;
            const conclusi = Math.round(Math.min(1, Math.max(0, frazione)) * totaleTurni);
            $('velo-avvio').hidden = true;
            battle.seekTurn(conclusi >= totaleTurni ? Infinity : conclusi === 0 ? 0 : conclusi + 1);
        }
        barra.addEventListener('click', e => {
            const r = barra.getBoundingClientRect();
            vaiAFrazione((e.clientX - r.left) / r.width);
        });

        // La pagina che contiene il replay (matches.html) può avere la sua barra dei turni
        window.addEventListener('message', e => {
            if (e.source !== window.parent || !e.data || typeof e.data !== 'object') return;
            if (e.data.tipo === 'replay-barra-fuori') document.documentElement.classList.add('barra-fuori');
            else if (e.data.tipo === 'replay-vai' && typeof e.data.frazione === 'number') vaiAFrazione(e.data.frazione);
            else if (e.data.tipo === 'replay-passo' && (e.data.delta === 1 || e.data.delta === -1)) spostaTurno(e.data.delta);
        });
        ultimoAvviso = '';
        aggiornaComandi();
        barra.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); spostaTurno(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); spostaTurno(1); }
        });

        // Tastiera: spazio = play/pausa, frecce = turno prima/dopo.
        // Su un bottone lo spazio lo preme già il browser; la barra ha le sue frecce.
        document.addEventListener('keydown', e => {
            const su = sel => !!(e.target && e.target.closest && e.target.closest(sel));
            if (e.key === ' ' || e.key === 'k') {
                if (su('button, input, textarea')) return;
                e.preventDefault();
                playPausa();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                if (su('[role="slider"], input, textarea')) return;
                spostaTurno(e.key === 'ArrowLeft' ? -1 : 1);
            }
            mostraComandi();
        });

        palco.addEventListener('mousemove', mostraComandi);
        palco.addEventListener('touchstart', mostraComandi, { passive: true });
        $('comandi-replay').addEventListener('focusin', mostraComandi);

        battle.subscribe(aggiorna);
        setInterval(() => { impostaAvatar(); aggiornaCampo(); }, 400);
        aggiorna();
    }


    // -------------------------------------------------
    // Utilità per costruire il file
    // -------------------------------------------------
    const escHtml = t => String(t == null ? '' : t).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // JSON sicuro dentro <script>: niente "</script>" né separatori di riga JS
    const jsonInScript = v => JSON.stringify(v)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');

    function righeDi(log) {
        const testo = Array.isArray(log) ? log.join('\n') : String(log || '');
        return testo.split('\n').map(r => r.replace(/\r$/, '')).filter(r => r.startsWith('|') && !r.startsWith('|debug|'));
    }

    // Avatar: nome di un allenatore di Showdown (es. "cynthia") oppure immagine.
    // Un percorso relativo (es. "immagini/avatar/didi.png") si risolve sul sito,
    // perché il file del replay vive su Storage e non accanto alle pagine.
    function risolviAvatar(avatar, sito) {
        const a = String(avatar || '').trim();
        if (!a) return '';
        if (!/[/.]/.test(a)) return a;
        if (/^(https?:)?\/\//i.test(a) || a.startsWith('data:')) return a;
        if (!sito) return '';
        try { return new URL(a, sito.endsWith('/') ? sito : sito + '/').href; } catch (e) { return ''; }
    }

    // Numero stabile per il replay: Showdown ne ricava lo sfondo del campo
    function numeroDi(testo) {
        let h = 0;
        for (let i = 0; i < testo.length; i++) h = (h * 31 + testo.charCodeAt(i)) >>> 0;
        return (h % 999999) + 1;
    }

    function giocatore(dato, righe, lato) {
        const g = typeof dato === 'string' ? { nome: dato } : (dato || {});
        const riga = righe.find(r => r.startsWith(`|player|${lato}|`));
        const daLog = riga ? riga.split('|')[3] : '';
        return { nome: g.nome || daLog || lato.toUpperCase(), colore: g.colore || '', avatar: g.avatar || '' };
    }


    /**
     * HTML del replay di UN set.
     *
     *  log        righe pubbliche del set (array o stringa con "\n"): le stesse che
     *             finivano in <script class="battle-log-data"> del replay di Showdown,
     *             ma NON passate per la sostituzione "/" → "\/" di Showdown
     *  p1, p2     nome del giocatore, oppure { nome, colore, avatar }
     *             (colore = players/{id}/info/color; avatar come in battle.html)
     *  etichetta  categoria del match (es. "VGC"), per la testata
     *  match, set numeri del match e del set
     *  sito       indirizzo del sito (es. "https://pokemonsuite-didi-lu.web.app"):
     *             serve solo per gli avatar con un percorso relativo
     */
    function creaReplayHtml({ log, p1, p2, etichetta = '', match = '', set = '', sito = '' } = {}) {
        const righe = righeDi(log);
        if (!righe.length) throw new Error('creaReplayHtml: il log del set è vuoto');

        const g1 = giocatore(p1, righe, 'p1');
        const g2 = giocatore(p2, righe, 'p2');
        g1.avatar = risolviAvatar(g1.avatar, sito);
        g2.avatar = risolviAvatar(g2.avatar, sito);

        const vittoria = righe.find(r => r.startsWith('|win|'));
        const pareggio = righe.includes('|tie');
        const vincitore = vittoria ? vittoria.slice(5) : '';
        const setTesto = set ? `set ${set}` : 'the set';
        const titoloEsito = vincitore ? `${vincitore} wins ${setTesto}` : pareggio ? `${setTesto} is a tie` : 'Replay over';

        const info = [etichetta, match ? `Match ${match}` : '', set ? `Set ${set}` : ''].filter(Boolean);
        const titolo = `${g1.nome} vs ${g2.nome}${set ? ` · Set ${set}` : ''} | Poké-Tournament replay`;

        const dati = {
            id: `replay-sito-${numeroDi(righe.join('\n'))}`,
            log: righe,
            turni: righe.filter(r => r.startsWith('|turn|')).length,
            etichettaInizio: righe.some(r => r.startsWith('|teampreview')) ? 'Team preview' : 'Start',
            p1: g1,
            p2: g2,
            icone: { play: ICONE.play, pausa: ICONE.pausa, audio: ICONE.audio, muto: ICONE.muto },
        };

        const stili = STILI.map(s => `<link rel="stylesheet" href="${SHOWDOWN}${s}">`).join('\n');
        const script = SCRIPT.map(s => `<script src="${SHOWDOWN}${s}"></script>`).join('\n');
        const codice = `(${giocaReplay.toString()})();`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Poke-Tournament replay 1">
<title>${escHtml(titolo)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;700&family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
<!-- Motore grafico di Pokémon Showdown (la parte battle-* del client è sotto licenza MIT) -->
${stili}
<style>${CSS}</style>
<script>window.exports = window;</script>
${script}
</head>
<body>
<main class="replay">
    <header class="replay-testa">
        <h1 class="replay-titolo">
            <span class="replay-nome p1">${escHtml(g1.nome)}</span>
            <span class="replay-vs">vs</span>
            <span class="replay-nome p2">${escHtml(g2.nome)}</span>
        </h1>
        ${info.length ? `<div class="replay-info">${info.map(t => `<span>${escHtml(t)}</span>`).join('')}</div>` : ''}
    </header>

    <div class="replay-cornice">
        <section class="palco" id="palco" aria-label="Battle replay">
            <div id="campo"></div>
            <div class="effetti" id="effetti" aria-label="Field effects"></div>

            <div class="comandi-replay" id="comandi-replay" aria-label="Replay controls">
                <div class="barra-turni" id="barra-turni" role="slider" tabindex="0" aria-label="Turn"
                     aria-valuemin="0" aria-valuemax="${dati.turni}" aria-valuenow="0"><span id="avanzamento"></span></div>
                <div class="riga-comandi">
                    <button type="button" class="tasto" id="btn-inizio" aria-label="Watch from the start" title="From the start">${ICONE.inizio}</button>
                    <button type="button" class="tasto" id="btn-indietro" aria-label="Previous turn" title="Previous turn">${ICONE.indietro}</button>
                    <button type="button" class="tasto play" id="btn-play" aria-label="Play">${ICONE.play}</button>
                    <button type="button" class="tasto" id="btn-avanti" aria-label="Next turn" title="Next turn">${ICONE.avanti}</button>
                    <span class="contatore-turni" id="contatore-turni" aria-live="polite">${dati.etichettaInizio}</span>
                    <button type="button" class="tasto velocita" id="btn-velocita" title="Speed">1×</button>
                    <button type="button" class="tasto" id="btn-audio" title="Sound">${ICONE.audio}</button>
                </div>
            </div>

            <div class="esito" id="esito" aria-live="polite" hidden>
                <div class="esito-card">
                    <h2>${escHtml(titoloEsito)}</h2>
                    <div><button type="button" class="btn primario" id="btn-ancora">${ICONE.inizio} Watch again</button></div>
                </div>
            </div>

            <div class="velo-avvio" id="velo-avvio">
                <button type="button" class="btn btn-avvio" id="btn-avvio">${ICONE.play} Play</button>
                <p id="testo-avvio">${escHtml(info.length ? info.join(' / ') : `${g1.nome} vs ${g2.nome}`)}</p>
            </div>
        </section>
    </div>

    <aside class="cronaca battle-log" id="log" aria-label="Battle log"></aside>
</main>
<script type="application/json" id="dati-replay">${jsonInScript(dati)}</script>
<script>${codice}</script>
</body>
</html>
`;
    }

    // -------------------------------------------------
    // Replay di Showdown caricati a mano (matches.html)
    // -------------------------------------------------
    const MARCA_ADATTATO = 'sito-replay-adattato';

    /**
     * Prende l'HTML di un replay scaricato da Showdown (quello che si carica a mano nell'admin)
     * e ci aggiunge due cose, così si vede come i replay del simulatore del sito:
     *   - le barre della salute del sito (le stesse di battle.html);
     *   - niente scheda al passaggio del mouse sui Pokémon.
     * Il resto del file non si tocca. Si può chiamare più volte: la seconda non fa nulla.
     * Se il testo non è un replay (o è vuoto) lo restituisce com'è.
     */
    function adattaReplayShowdown(html) {
        const testo = String(html == null ? '' : html);
        if (!testo.trim() || testo.indexOf(MARCA_ADATTATO) !== -1) return testo;
        if (!/battle-log-data|replay-embed|class="battle"/i.test(testo)) return testo;   // non sembra un replay

        const aggiunta = `
<!-- ${MARCA_ADATTATO}: barre della salute del sito, niente scheda al passaggio del mouse -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;700&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
<style id="${MARCA_ADATTATO}">
:root {
    --inchiostro: #000; --carta: #fff; --crema: #fffdf6; --ambra: #ffbd44;
    --conferma: #09ca49; --conferma-scuro: #056425; --pericolo: #ea1818;
}
${barreSalute('.battle')}
/* Niente hover sui Pokémon */
.battle .has-tooltip, .battle .tooltips { pointer-events: none !important; cursor: default !important; }
#tooltipwrapper { display: none !important; }
</style>
`;
        // in fondo alla pagina: dopo il CSS di Showdown, che a parità di peso perde
        if (/<\/body\s*>/i.test(testo)) return testo.replace(/<\/body\s*>/i, () => aggiunta + '</body>');
        if (/<\/html\s*>/i.test(testo)) return testo.replace(/<\/html\s*>/i, () => aggiunta + '</html>');
        return testo + aggiunta;
    }

    return { creaReplayHtml, adattaReplayShowdown };
});
