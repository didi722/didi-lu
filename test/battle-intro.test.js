'use strict';
// Intro "VS" prima di ogni set del simulatore (battle-intro.js, battle-intro.css, i punti di aggancio in battle-ui.js e battle.html).
// Le parti pure (testi del tabellone, punteggio dello showdown, colore del testo, disposizione degli avatar) si provano così come sono; la mappa
// "chi sta a sinistra, chi a destra" si prova eseguendo la funzione vera di battle-ui.js con uno stato finto; il collegamento con la pagina (quando parte,
// dove non c'è) si legge dal codice. Per come viene a schermo serve un browser.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const B = require('../docs/battle-intro.js');

const leggi = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');
const senzaCommenti = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const battleUi = leggi('battle-ui.js');
const battleIntro = leggi('battle-intro.js');
const css = senzaCommenti(leggi('battle-intro.css'));
const html = leggi('battle.html');

/** Il testo di una funzione di primo livello (dalla riga "function nome(" alla "}" in colonna 0) */
function funzione(src, nome) {
    const i = src.search(new RegExp(`(?:async )?function ${nome}\\(`));
    assert.ok(i >= 0, `function ${nome} in battle-ui.js`);
    const fine = src.indexOf('\n}\n', i);
    assert.ok(fine > i, `fine di ${nome}`);
    return src.slice(i, fine + 2);
}

// ---------- tempi ----------
test('T: tutto entra prima che la diagonale si apra, e l\'intro dura poco (è una mini animazione)', () => {
    const { T } = B;
    for (const [k, v] of Object.entries(T)) assert.ok(Number.isFinite(v) && v > 0, k);
    assert.ok(T.ritardoAvatar + T.entraAvatar < T.apertura, 'gli avatar sono entrati');
    assert.ok(T.ritardoVs + T.vs < T.apertura, 'il VS è comparso');
    assert.ok(T.ritardoTabellone + T.tabellone < T.apertura, 'il tabellone è comparso');
    assert.ok(T.entraMeta < T.ritardoVs, 'le metà si incontrano prima del VS');
    assert.ok(T.apertura - T.ritardoTabellone - T.tabellone >= 800, 'il tabellone resta in vista almeno 0,8 s per leggerlo');
    assert.equal(T.totale, T.apertura + T.durataApertura + T.pausaFine);
    assert.ok(T.totale <= 3500, `${T.totale} ms: troppo lunga per essere prima di ogni set`);
});

// ---------- cosa scrive il tabellone ----------
test('testiIntro, contro la CPU: numero della battaglia, serie e (solo se ci sono pareggi) i pareggi', () => {
    assert.deepEqual(B.testiIntro({ tipo: 'cpu', serie: { v: 0, p: 0, n: 0 } }), { etichetta: 'BATTLE 1', punteggio: '0 – 0', righe: ['SERIES SCORE'] });
    assert.deepEqual(B.testiIntro({ tipo: 'cpu', serie: { v: 2, p: 1, n: 0 } }), { etichetta: 'BATTLE 4', punteggio: '2 – 1', righe: ['SERIES SCORE'] });
    assert.deepEqual(B.testiIntro({ tipo: 'cpu', serie: { v: 1, p: 1, n: 1 } }).righe, ['SERIES SCORE · 1 TIE']);
    assert.deepEqual(B.testiIntro({ tipo: 'cpu', serie: { v: 3, p: 0, n: 2 } }).righe, ['SERIES SCORE · 2 TIES']);
    // il numero dato da chi chiama vince su quello ricavato dalla serie
    assert.equal(B.testiIntro({ tipo: 'cpu', battaglia: 9, serie: { v: 0, p: 0, n: 0 } }).etichetta, 'BATTLE 9');
    // senza serie: la prima
    assert.deepEqual(B.testiIntro({ tipo: 'cpu' }), { etichetta: 'BATTLE 1', punteggio: '0 – 0', righe: ['SERIES SCORE'] });
    // il formato, in maiuscolo, come ultima riga
    assert.deepEqual(B.testiIntro({ tipo: 'cpu', formato: 'gen9 vgc' }).righe, ['SERIES SCORE', 'GEN9 VGC']);
});

test('testiIntro, nelle stagioni: match, punteggio dei set, set, showdown (solo se qualcuno ha già vinto) e formato', () => {
    const t = B.testiIntro({ tipo: 'ufficiale', formato: 'Monotype Doubles', match: 2, matchTotali: 3, set: 2, setTotali: 3, punti: { sx: 1, dx: 0 }, showdown: { sx: 1, dx: 0 } });
    assert.deepEqual(t, { etichetta: 'MATCH 2/3', punteggio: '1 – 0', righe: ['SET 2/3', 'SHOWDOWN 1 – 0', 'MONOTYPE DOUBLES'] });
    // primo match, primo set: niente showdown da dire
    const primo = B.testiIntro({ tipo: 'ufficiale', match: 1, matchTotali: 3, set: 1, setTotali: 3, punti: { sx: 0, dx: 0 }, showdown: { sx: 0, dx: 0 } });
    assert.deepEqual(primo, { etichetta: 'MATCH 1/3', punteggio: '0 – 0', righe: ['SET 1/3'] });
    assert.ok(!primo.righe.some(r => /SHOWDOWN/.test(r)));
    // al meglio di 5
    assert.equal(B.testiIntro({ tipo: 'ufficiale', match: 3, matchTotali: 3, set: 5, setTotali: 5, punti: { sx: 2, dx: 2 }, showdown: { sx: 1, dx: 1 } }).righe[0], 'SET 5/5');
    // senza dati dei set il match si dice lo stesso
    assert.deepEqual(B.testiIntro({ tipo: 'ufficiale', match: 2 }), { etichetta: 'MATCH 2/3', punteggio: null, righe: [] });
});

test('testiIntro, nelle amichevoli: una partita sola non ha né set né punteggio; al meglio di più set sì', () => {
    assert.deepEqual(B.testiIntro({ tipo: 'amichevole', setTotali: 1, set: 1, punti: { sx: 0, dx: 0 } }), { etichetta: 'FRIENDLY MATCH', punteggio: null, righe: [] });
    assert.deepEqual(B.testiIntro({ tipo: 'amichevole', formato: 'gen9 ou', setTotali: 1 }).righe, ['GEN9 OU']);
    assert.deepEqual(B.testiIntro({ tipo: 'amichevole', setTotali: 3, set: 2, punti: { sx: 0, dx: 1 } }), { etichetta: 'FRIENDLY MATCH', punteggio: '0 – 1', righe: ['SET 2/3'] });
});

test('testiIntro: dati mancanti o strani non fanno cadere l\'intro', () => {
    for (const c of [undefined, null, {}, { tipo: 'boh' }, { tipo: 'cpu', serie: null }, { tipo: 'ufficiale', punti: null, showdown: null }, { tipo: 'cpu', serie: { v: 'x', p: NaN, n: undefined } }]) {
        const t = B.testiIntro(c);
        assert.equal(typeof t.etichetta, 'string', JSON.stringify(c));
        assert.ok(Array.isArray(t.righe), JSON.stringify(c));
        for (const r of t.righe) assert.ok(typeof r === 'string' && r.length, JSON.stringify(c));
        assert.ok(!/NaN|undefined|null/.test(`${t.etichetta} ${t.punteggio || ''} ${t.righe.join(' ')}`), JSON.stringify(c));
    }
});

// ---------- punteggio dello showdown ----------
test('punteggioShowdown: conta chi ha vinto i match di prima, non quello che si gioca né i seguenti', () => {
    const m = { match1: { score: '2-0' }, match2: { score: '1-2' }, match3: { score: '2-1' } };
    assert.deepEqual(B.punteggioShowdown(m, 1), { p1: 0, p2: 0 });
    assert.deepEqual(B.punteggioShowdown(m, 2), { p1: 1, p2: 0 });
    assert.deepEqual(B.punteggioShowdown(m, 3), { p1: 1, p2: 1 });
    assert.deepEqual(B.punteggioShowdown(m, '3'), { p1: 1, p2: 1 });
    assert.deepEqual(B.punteggioShowdown(m, 4), { p1: 2, p2: 1 });
});

test('punteggioShowdown: punteggi non validi, pareggi e nodi che non sono match si saltano', () => {
    const m = { match1: { score: '1-1' }, match2: { score: 'boh' }, match3: {}, altro: { score: '2-0' }, match4: null, match5: { score: ' 2 - 0 ' } };
    assert.deepEqual(B.punteggioShowdown(m, 9), { p1: 1, p2: 0 });
    for (const no of [null, undefined, 5, 'x', []]) assert.deepEqual(B.punteggioShowdown(no, 2), { p1: 0, p2: 0 }, String(no));
});

// ---------- colore del testo sul tag ----------
test('testoSu: nero sui colori chiari, bianco sugli scuri; letture di rgb(), rgba() e #rrggbb; nel dubbio nero', () => {
    assert.equal(B.testoSu('rgb(255, 255, 255)'), '#000');
    assert.equal(B.testoSu('rgb(255, 214, 10)'), '#000');
    assert.equal(B.testoSu('rgba(240, 240, 240, 0.9)'), '#000');
    assert.equal(B.testoSu('rgb(0, 0, 0)'), '#fff');
    assert.equal(B.testoSu('rgb(70, 110, 150)'), '#fff');
    assert.equal(B.testoSu('#1a2b3c'), '#fff');
    assert.equal(B.testoSu('#FFEE99'), '#000');
    for (const no of ['', 'red', 'transparent', '#abc', null, undefined, 7]) assert.equal(B.testoSu(no), '#000', String(no));
});

// ---------- dove stanno gli avatar ----------
test('disposizione: su una finestra larga a un quarto e a tre quarti, ingranditi; su una stretta più piccoli, interi nella finestra e senza sovrapporsi', () => {
    const larga = B.disposizione(1920, 475, 475);
    assert.equal(larga.ingrandimento, B.INGRANDIMENTO);
    assert.deepEqual(larga.riposo, [480, 1440]);

    for (const [L, w] of [[390, 338], [360, 300], [320, 270], [412, 360], [768, 300]]) {
        const d = B.disposizione(L, w, w);
        assert.ok(d.ingrandimento <= B.INGRANDIMENTO && d.ingrandimento >= 0.5, `${L}: ${d.ingrandimento}`);
        const disegnata = w * B.VISIBILE * d.ingrandimento;                  // larghezza che si vede davvero di ciascun avatar
        assert.ok(d.riposo[0] - disegnata / 2 >= 0, `${L}: il sinistro esce a sinistra`);
        assert.ok(d.riposo[1] + disegnata / 2 <= L, `${L}: il destro esce a destra`);
        assert.ok(d.riposo[1] - d.riposo[0] >= disegnata * 0.98, `${L}: i due avatar si sovrappongono (${d.riposo})`);
    }
    // il telefono in verticale: più piccoli di una finestra larga
    assert.ok(B.disposizione(390, 338, 338).ingrandimento < 1);
});

test('disposizione: senza avatar, con misure strane o con larghezze diverse non si rompe', () => {
    for (const [L, a, b] of [[390, 0, 0], [0, 300, 300], [undefined, undefined, undefined], [NaN, 'x', null], [390, 338, 200], [100, 400, 400]]) {
        const d = B.disposizione(L, a, b);
        assert.ok(Number.isFinite(d.ingrandimento) && d.ingrandimento >= 0.5 && d.ingrandimento <= B.INGRANDIMENTO, JSON.stringify([L, a, b]));
        assert.equal(d.riposo.length, 2);
        assert.ok(d.riposo.every(Number.isFinite), JSON.stringify([L, a, b]));
        assert.ok(d.riposo[0] <= d.riposo[1], JSON.stringify([L, a, b]));
    }
});

// ---------- quando si può fare ----------
function finestra({ app = false, palestra = false, nascosta = false, ridotto = false, animate = true, sfondo = null } = {}) {
    const classi = elenco => ({ contains: c => elenco.includes(c) });
    return {
        document: {
            hidden: nascosta,
            body: { classList: classi(palestra ? ['palestra'] : []) },
            documentElement: { classList: classi(app ? ['app'] : []) },
            querySelector: () => sfondo
        },
        matchMedia: q => ({ matches: ridotto && /prefers-reduced-motion/.test(q) }),
        Element: { prototype: animate ? { animate() {} } : {} }
    };
}

test('puoRiprodurre: sì in una pagina normale; no nell\'app, in palestra, a pagina nascosta, con "riduci movimento", senza Web Animations', () => {
    assert.equal(B.puoRiprodurre(finestra()), true);
    assert.equal(B.puoRiprodurre(finestra({ app: true })), false);
    assert.equal(B.puoRiprodurre(finestra({ palestra: true })), false);
    assert.equal(B.puoRiprodurre(finestra({ nascosta: true })), false);
    assert.equal(B.puoRiprodurre(finestra({ ridotto: true })), false);
    assert.equal(B.puoRiprodurre(finestra({ animate: false })), false);
    for (const no of [null, undefined, {}, { document: {} }]) assert.equal(B.puoRiprodurre(no), false);
});

test('riproduci: dove non si può o non c\'è lo sfondo vale false subito, senza toccare la pagina', async () => {
    assert.equal(await B.riproduci({ win: finestra({ app: true }), nomi: { sx: 'A', dx: 'B' }, testi: B.testiIntro({ tipo: 'cpu' }) }), false);
    assert.equal(await B.riproduci({ win: finestra({ ridotto: true }), nomi: {}, testi: {} }), false);
    assert.equal(await B.riproduci({ win: finestra({ sfondo: null }), nomi: { sx: 'A', dx: 'B' }, testi: B.testiIntro({ tipo: 'cpu' }) }), false);
    // uno sfondo senza le due metà (non è quello della sfida) non basta
    const mezzo = { querySelector: () => null };
    assert.equal(await B.riproduci({ win: finestra({ sfondo: mezzo }), nomi: { sx: 'A', dx: 'B' }, testi: B.testiIntro({ tipo: 'cpu' }) }), false);
});

// ---------- la mappa sinistra/destra → giocatore (la funzione vera di battle-ui.js) ----------
function contestoIntroCon(stato) {
    const nomeDi = (battleUi.match(/^const nomeDi = [^\n]+$/m) || [])[0];
    assert.ok(nomeDi, 'const nomeDi in battle-ui.js');
    const corpo = `with (S) {\n${nomeDi}\n${funzione(battleUi, 'punteggio')}\n${funzione(battleUi, 'contestoIntro')}\nreturn contestoIntro;\n}`;
    return new Function('S', corpo)({ MATCH_PER_SHOWDOWN: 3, self: { BattleIntro: B }, config: null, mioLato: null, cpu: null, online: null, ...stato });
}
const nomiDue = { p1: { nome: 'Anna' }, p2: { nome: 'Bruno' } };

test('contestoIntro, CPU: battaglia e serie della sessione; in palestra niente', () => {
    const cfg = { p1: { nome: 'Didi' }, p2: { nome: 'CPU' } };
    let c = contestoIntroCon({ config: cfg, cpu: {} })(1);
    assert.deepEqual(c, { nomi: { sx: 'Didi', dx: 'CPU' }, dati: { tipo: 'cpu', battaglia: 1, serie: { v: 0, p: 0, n: 0 } } });
    c = contestoIntroCon({ config: cfg, cpu: { sessione: { v: 2, p: 1, n: 1 } } })();
    assert.equal(c.dati.battaglia, 5);
    assert.deepEqual(B.testiIntro(c.dati), { etichetta: 'BATTLE 5', punteggio: '2 – 1', righe: ['SERIES SCORE · 1 TIE'] });
    assert.equal(contestoIntroCon({ config: cfg, cpu: { palestra: { nome: 'Capo' } } })(1), null);
    assert.equal(contestoIntroCon({ config: null, cpu: {} })(1), null);
    assert.equal(contestoIntroCon({ config: cfg })(1), null, 'né CPU né partita online');
});

test('contestoIntro, stagioni: chi gioca sta a sinistra; i punti dei set e dello showdown seguono i lati', () => {
    const info = { categoria: 'Gen9 VGC', bestOf: 3, match: 2, showdown: 'sd1', stagione: 's1' };
    const risultati = { set1: { vincitore: 'p1' }, set2: { vincitore: 'p2' }, set3: { vincitore: 'p2' } };
    const matchPrecedenti = { match1: { score: '2-0' } };            // lo showdown lo ha vinto p1 finora
    const comune = { config: nomiDue, online: { info, risultati, matchPrecedenti } };

    // sono io p2: Bruno a sinistra
    const io2 = contestoIntroCon({ ...comune, mioLato: 'p2' })(3);
    assert.deepEqual(io2.nomi, { sx: 'Bruno', dx: 'Anna' });
    assert.deepEqual(io2.dati, { tipo: 'ufficiale', formato: 'Gen9 VGC', set: 3, setTotali: 3, punti: { sx: 2, dx: 1 }, match: 2, matchTotali: 3, showdown: { sx: 0, dx: 1 } });
    // sono p1, o guardo: Anna a sinistra
    for (const lato of ['p1', null]) {
        const c = contestoIntroCon({ ...comune, mioLato: lato })(3);
        assert.deepEqual(c.nomi, { sx: 'Anna', dx: 'Bruno' });
        assert.deepEqual(c.dati.punti, { sx: 1, dx: 2 });
        assert.deepEqual(c.dati.showdown, { sx: 1, dx: 0 });
    }
    // il tabellone che ne esce
    assert.deepEqual(B.testiIntro(io2.dati), { etichetta: 'MATCH 2/3', punteggio: '2 – 1', righe: ['SET 3/3', 'SHOWDOWN 0 – 1', 'GEN9 VGC'] });
});

test('contestoIntro, stagioni: i match di prima non ancora letti (o non leggibili) non bloccano l\'intro', () => {
    const info = { categoria: 'Gen9 VGC', bestOf: 5, match: 3, showdown: 'sd1', stagione: 's1' };
    for (const matchPrecedenti of [undefined, null, {}]) {
        const c = contestoIntroCon({ config: nomiDue, online: { info, risultati: {}, matchPrecedenti }, mioLato: 'p1' })();
        assert.deepEqual(c.dati.showdown, { sx: 0, dx: 0 });
        assert.equal(c.dati.set, 1, 'senza numero di set è il primo');
        assert.equal(B.testiIntro(c.dati).righe.some(r => /SHOWDOWN/.test(r)), false);
    }
});

test('contestoIntro, amichevoli: tipo amichevole, niente match né showdown', () => {
    const online = { amichevole: true, info: { categoria: 'Gen9 OU', bestOf: 3 }, risultati: { set1: { vincitore: 'p2' } } };
    const c = contestoIntroCon({ config: nomiDue, online, mioLato: 'p1' })(2);
    assert.deepEqual(c.dati, { tipo: 'amichevole', formato: 'Gen9 OU', set: 2, setTotali: 3, punti: { sx: 0, dx: 1 } });
    assert.deepEqual(B.testiIntro(c.dati), { etichetta: 'FRIENDLY MATCH', punteggio: '0 – 1', righe: ['SET 2/3', 'GEN9 OU'] });
    const una = contestoIntroCon({ config: nomiDue, online: { ...online, info: { categoria: 'Gen9 OU', bestOf: 1 }, risultati: {} }, mioLato: 'p1' })(1);
    assert.deepEqual(B.testiIntro(una.dati), { etichetta: 'FRIENDLY MATCH', punteggio: null, righe: ['GEN9 OU'] });
});

// ---------- il collegamento con il simulatore ----------
test('battle.html: carica lo stile e lo script dell\'intro, prima di quelli che usano il tavolo', () => {
    const stile = html.indexOf('<link rel="stylesheet" href="battle-intro.css">');
    const script = html.indexOf('<script src="battle-intro.js"></script>');
    assert.ok(stile > html.indexOf('href="battle-vista.css"'), 'lo stile dopo quello della vista');
    assert.ok(script > 0 && script < html.indexOf('<script src="battle-layout.js"></script>'), 'lo script prima di battle-layout.js');
});

test('battle-ui.js: l\'intro parte con ogni battaglia contro la CPU (non in palestra) e con ogni set nuovo', () => {
    const avvia = funzione(battleUi, 'avviaBattaglia');
    assert.match(avvia, /nuovoSet\(\);\s*disegnaInfo\(\);\s*if \(cpu && !cpu\.palestra\) introVersus\(\);/);
    // i set dal secondo in poi: quando il set nuovo entra in scena, con il suo numero
    assert.match(funzione(battleUi, 'avviaProssimaScena'), /^function avviaProssimaScena\(\) \{\s*if \(prossimaScena\) introVersus\(prossimoSet\);/);
    // il primo set di un match online: all'uscita dalla lobby, non per chi arriva a partita già iniziata
    const fase = funzione(battleUi, 'aggiornaFase');
    assert.ok(fase.indexOf("const daLobby = online.statoPrima === 'lobby';") > 0);
    assert.ok(fase.indexOf('const daLobby') < fase.indexOf('online.statoPrima = s;'), 'lo stato di prima si legge prima di sovrascriverlo');
    assert.match(fase, /if \(s === 'in_corso' && daLobby\) introVersus\(1\);/);
});

test('battle-ui.js: l\'intro non c\'è nell\'app né in palestra, e aspetta lo sfondo nuovo (le sfide contro la CPU lo rifanno a ogni partita)', () => {
    const intro = funzione(battleUi, 'introVersus');
    assert.match(intro, /!self\.BattleIntro/);
    assert.match(intro, /inApp\(\)/);
    assert.match(intro, /document\.body\.classList\.contains\('palestra'\)/);
    assert.match(intro, /cpu && cpu\.palestra/);
    assert.match(intro, /Promise\.race\(\[versusPronto, new Promise\(ok => setTimeout\(ok, 2500\)\)\]\)/, 'attesa dello sfondo, al massimo 2,5 s');
    assert.match(intro, /catch/, 'un errore nell\'intro non ferma la partita');

    const versus = funzione(battleUi, 'vestiVersus');
    assert.match(versus, /versusInCorso\+\+;/);
    assert.match(versus, /finally \{\s*versusInCorso--;\s*costruito\(\);\s*\}/, 'a fine lavoro (anche con un errore) lo sfondo è "pronto"');
    assert.match(battleUi, /async function vestiVersus\(nomeP1, nomeP2, aspetto2 = null\)/, 'la firma di vestiVersus non cambia');
});

test('battle-ui.js: il punteggio dello showdown si legge una volta, solo nelle stagioni dal secondo match in poi', () => {
    assert.match(funzione(battleUi, 'preparaOnline'), /leggiMatchPrecedenti\(\);/);
    assert.doesNotMatch(funzione(battleUi, 'preparaAmichevole'), /leggiMatchPrecedenti/);
    const l = funzione(battleUi, 'leggiMatchPrecedenti');
    assert.match(l, /online\.amichevole/);
    assert.match(l, /Number\(online\.info\.match\) <= 1/);
    assert.match(l, /online\.matchPrecedenti !== undefined/, 'una lettura sola');
    assert.match(l, /seasons\/\$\{online\.info\.stagione\}\/showdowns\/\$\{online\.info\.showdown\}\/matches/);
    assert.match(l, /\.once\('value'\)/);
});

test('battle-ui.js: la serie contro la CPU si conta in ogni battaglia che non è di palestra, anche nei Random', () => {
    const fine = funzione(battleUi, 'mostraFineCpu');
    assert.match(fine, /if \(!cpu\.palestra && cpu\.cerebro && !cpu\.cerebro\.contata\)/);
    assert.doesNotMatch(fine.slice(0, fine.indexOf('mostraFinePalestra')), /conMemoria/, 'il conto non dipende dalla memoria della CPU');
    // e quello scritto sul cartello di fine partita resta solo nella prova di un team
    assert.match(funzione(battleUi, 'riepilogoFineCpu'), /const q = cpu\.conMemoria && cpu\.sessione;/);
});

// ---------- lo stile e le animazioni ----------
test('battle-intro.css: sta sopra a tutto ma non nell\'app; durante l\'intro gli avatar veri aspettano sotto; la riga nera segue le metà', () => {
    assert.match(css, /\.vi \{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: 9500;/);
    assert.match(css, /html\.app \.vi \{ display: none; \}/);
    assert.match(css, /\.vs-sfondo\.vi-in-corso \.vs-avatar \{ visibility: hidden; \}/);
    // la riga nera in diagonale (60% in alto, 40% in basso, come lo sfondo vero) su entrambe le metà
    assert.match(css, /\.vi \.vs-sx::after \{[^}]*clip-path: polygon\(calc\(60% - 8px\) 0, 60% 0, 40% 100%, calc\(40% - 8px\) 100%\);/);
    assert.match(css, /\.vi \.vs-dx::after \{[^}]*clip-path: polygon\(60% 0, calc\(60% \+ 8px\) 0, calc\(40% \+ 8px\) 100%, 40% 100%\);/);
    // colori e forme del tema del giocatore, non scritti a mano
    for (const v of ['--raggio', '--sh-5', '--shs-5', '--nb-font-titoli', '--ambra']) assert.ok(css.includes(`var(${v}`), v);
    // telefono (verticale e orizzontale)
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /@media \(max-height: 520px\)/);
});

test('battle-intro.css: le metà e lo sfondo vero hanno la stessa diagonale', () => {
    const versus = senzaCommenti(leggi('style-versus.css'));
    const poligoni = r => [...r.matchAll(/clip-path:\s*polygon\(([^)]*)\)/g)].map(m => m[1].replace(/\s+/g, ' ').trim());
    const veri = poligoni(versus);
    assert.ok(veri.includes('0 0, 60% 0, 40% 100%, 0 100%'), 'metà sinistra vera');
    assert.ok(veri.includes('60% 0, 100% 0, 100% 100%, 40% 100%'), 'metà destra vera');
});

test('battle-intro.js: le animazioni di apertura restano al loro posto (fill forwards), l\'intro si può saltare e se ne chiude una prima di aprirne un\'altra', () => {
    // tutto ciò che parte da T.apertura deve restare com'è alla fine e non coprire le animazioni di prima sulla stessa proprietà
    const chiamate = battleIntro.split('\n').filter(r => /\bA\(/.test(r) && /delay: T\.apertura\b/.test(r));
    assert.ok(chiamate.length >= 6, `${chiamate.length} animazioni di apertura`);
    for (const r of chiamate) assert.match(r, /fill: 'forwards'/, r.trim());
    // i tempi vengono da T, non scritti in giro
    assert.doesNotMatch(battleIntro.replace(/const T = \{[\s\S]*?\};/, ''), /delay: \d{3,}/);
    // salto: clic o tocco, Invio, Spazio, Esc; i tasti non arrivano al simulatore
    assert.match(battleIntro, /addEventListener\('pointerdown', suClic\)/);
    assert.match(battleIntro, /e\.key === 'Enter' \|\| e\.key === ' ' \|\| e\.key === 'Escape'/);
    assert.match(battleIntro, /doc\.addEventListener\('keydown', suTasto, true\)/);
    assert.match(battleIntro, /e\.stopPropagation\(\)/);
    // un'intro nuova chiude quella in corso; a pagina nascosta si chiude da sola
    assert.match(battleIntro, /if \(win\.__introVs\) win\.__introVs\.termina\(true\);/);
    assert.match(battleIntro, /T\.totale \+ 2500/);
    // gli avatar veri tornano visibili comunque
    assert.match(battleIntro, /sfondo\.classList\.remove\('vi-in-corso'\)/);
});
