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
    // l'attesa della partita ha un tetto (oltre, la diagonale si apre lo stesso) e i primi istanti sono protetti da un clic per sbaglio
    assert.ok(T.attesaMax >= 5000 && T.attesaMax <= 20000, `attesaMax ${T.attesaMax}`);
    assert.ok(T.protezione >= 200 && T.protezione < T.apertura, `protezione ${T.protezione}`);
});

test('ritardoApertura: mai prima del tempo fisso, subito se è già passato', () => {
    assert.equal(B.ritardoApertura(0), B.T.apertura);
    assert.equal(B.ritardoApertura(500), B.T.apertura - 500);
    assert.equal(B.ritardoApertura(B.T.apertura), 0);
    assert.equal(B.ritardoApertura(B.T.apertura + 4000), 0);
    for (const no of [undefined, null, NaN, 'x', -5]) assert.equal(B.ritardoApertura(no), B.T.apertura, String(no));
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

test('testiIntro, nelle stagioni: match, punteggio dei set, set, punteggio dei match (sempre) e formato', () => {
    const t = B.testiIntro({ tipo: 'ufficiale', formato: 'Monotype Doubles', match: 2, matchTotali: 3, set: 2, setTotali: 3, punti: { sx: 1, dx: 0 }, showdown: { sx: 1, dx: 0 } });
    assert.deepEqual(t, { etichetta: 'MATCH 2/3', punteggio: '1 – 0', righe: ['SET 2/3', 'MATCH SCORE 1 – 0', 'MONOTYPE DOUBLES'] });
    // primo match, primo set: niente showdown da dire
    const primo = B.testiIntro({ tipo: 'ufficiale', match: 1, matchTotali: 3, set: 1, setTotali: 3, punti: { sx: 0, dx: 0 }, showdown: { sx: 0, dx: 0 } });
    assert.deepEqual(primo, { etichetta: 'MATCH 1/3', punteggio: '0 – 0', righe: ['SET 1/3', 'MATCH SCORE 0 – 0'] });
    assert.ok(primo.righe.includes('MATCH SCORE 0 – 0'), 'tutti i punteggi si dicono, anche 0 – 0');
    // al meglio di 5
    assert.equal(B.testiIntro({ tipo: 'ufficiale', match: 3, matchTotali: 3, set: 5, setTotali: 5, punti: { sx: 2, dx: 2 }, showdown: { sx: 1, dx: 1 } }).righe[0], 'SET 5/5');
    // senza dati dei set il match si dice lo stesso
    assert.deepEqual(B.testiIntro({ tipo: 'ufficiale', match: 2 }), { etichetta: 'MATCH 2/3', punteggio: '0 – 0', righe: [] });      // il punteggio sta sempre al centro, anche 0 – 0
});

test('testiIntro, nelle amichevoli: il punteggio c\'è sempre (anche una partita sola: 0 – 0); i set solo se sono più di uno', () => {
    assert.deepEqual(B.testiIntro({ tipo: 'amichevole', setTotali: 1, set: 1, punti: { sx: 0, dx: 0 } }), { etichetta: 'FRIENDLY MATCH', punteggio: '0 – 0', righe: [] });
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

test('puoRiprodurre: sì in una pagina normale e in palestra; no nell\'app, a pagina nascosta, con "riduci movimento", senza Web Animations', () => {
    assert.equal(B.puoRiprodurre(finestra()), true);
    assert.equal(B.puoRiprodurre(finestra({ app: true })), false);
    assert.equal(B.puoRiprodurre(finestra({ palestra: true })), true, 'anche la palestra ha la sua intro');
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
/** Le funzioni vere di battle-ui.js, con uno stato finto: dentro `with (S)` le variabili della pagina (config, online, introSet...) sono le proprietà di S */
function funzioniUi(stato, ...nomi) {
    const nomeDi = (battleUi.match(/^const nomeDi = [^\n]+$/m) || [])[0];
    assert.ok(nomeDi, 'const nomeDi in battle-ui.js');
    const corpo = `with (S) {\n${nomeDi}\n${nomi.map(n => funzione(battleUi, n)).join('\n')}\nreturn { ${nomi.join(', ')} };\n}`;
    return new Function('S', corpo)(stato);
}
const statoBase = (extra = {}) => ({
    MATCH_PER_SHOWDOWN: 3, self: { BattleIntro: B }, config: null, mioLato: null, cpu: null, online: null,
    ...extra
});
function contestoIntroCon(stato) {
    return funzioniUi(statoBase(stato), 'punteggio', 'contestoIntro').contestoIntro;
}
const nomiDue = { p1: { nome: 'Anna' }, p2: { nome: 'Bruno' } };

test('contestoIntro, CPU: battaglia e serie della sessione', () => {
    const cfg = { p1: { nome: 'Didi' }, p2: { nome: 'CPU' } };
    let c = contestoIntroCon({ config: cfg, cpu: {} })(1);
    assert.deepEqual(c, { nomi: { sx: 'Didi', dx: 'CPU' }, dati: { tipo: 'cpu', battaglia: 1, serie: { v: 0, p: 0, n: 0 } } });
    c = contestoIntroCon({ config: cfg, cpu: { sessione: { v: 2, p: 1, n: 1 } } })();
    assert.equal(c.dati.battaglia, 5);
    assert.deepEqual(B.testiIntro(c.dati), { etichetta: 'BATTLE 5', punteggio: '2 – 1', righe: ['SERIES SCORE · 1 TIE'] });
    assert.equal(contestoIntroCon({ config: null, cpu: {} })(1), null);
    assert.equal(contestoIntroCon({ config: cfg })(1), null, 'né CPU né partita online');
});

test('contestoIntro, palestra: a sinistra il capopalestra, a destra il suo compagno (niente sfidante); tappa, vantaggio e formato nel tabellone', () => {
    const cfg = { p1: { nome: 'Didi' }, p2: { nome: 'Capo' } };
    const palestra = { nome: 'Capo', tappa: 1, categoria: 'VGC Gen 9', vantaggio: { nome: 'Rain' }, aspetto: { compagno: { nome: 'umbreon' } } };
    const S = statoBase({ config: cfg, cpu: { palestra }, self: { BattleIntro: B, Palestra: { TAPPE: 3 } } });
    const c = funzioniUi(S, 'punteggio', 'contestoIntro').contestoIntro(1);
    assert.equal(c.palestra, true);
    assert.deepEqual(c.nomi, { sx: 'Capo', dx: '' }, 'il compagno non ha il tag del nome');
    assert.deepEqual(B.testiIntro(c.dati), { etichetta: 'STAGE 2/3', punteggio: null, righe: ["CAPO'S GYM", 'EDGE: RAIN', 'VGC GEN 9'] });
    // senza compagno a destra resta chi sfida
    const senza = funzioniUi(statoBase({ config: cfg, cpu: { palestra: { ...palestra, aspetto: {} } }, self: { BattleIntro: B, Palestra: { TAPPE: 3 } } }), 'punteggio', 'contestoIntro').contestoIntro(1);
    assert.deepEqual(senza.nomi, { sx: 'Capo', dx: '' });
});

test('testiIntro, palestra: tappa, di chi è la palestra, vantaggio di campo e formato; senza il resto non si rompe', () => {
    assert.deepEqual(B.testiIntro({ tipo: 'palestra', nome: 'Elderoak', tappa: 3, tappe: 3, vantaggio: 'Rain Dance', formato: 'Monotype Doubles' }), { etichetta: 'STAGE 3/3', punteggio: null, righe: ["ELDEROAK'S GYM", 'EDGE: RAIN DANCE', 'MONOTYPE DOUBLES'] });
    assert.deepEqual(B.testiIntro({ tipo: 'palestra' }), { etichetta: 'GYM BATTLE', punteggio: null, righe: [] });
});

test('scurisci: la tinta più scura di un colore #rrggbb (per la metà del compagno in palestra); altro resta com\'è', () => {
    const { scurisci } = funzioniUi(statoBase(), 'scurisci');
    assert.equal(scurisci('#ff8800', 0.5), '#804400');
    assert.equal(scurisci('#FFFFFF', 0), '#ffffff');
    assert.equal(scurisci('#000000', 0.4), '#000000');
    for (const no of ['rosso', '#abc', '', null, undefined]) assert.equal(scurisci(no, 0.4), no);
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
    assert.deepEqual(B.testiIntro(io2.dati), { etichetta: 'MATCH 2/3', punteggio: '2 – 1', righe: ['SET 3/3', 'MATCH SCORE 0 – 1', 'GEN9 VGC'] });
});

test('contestoIntro, stagioni: i match di prima non ancora letti (o non leggibili) non bloccano l\'intro', () => {
    const info = { categoria: 'Gen9 VGC', bestOf: 5, match: 3, showdown: 'sd1', stagione: 's1' };
    for (const matchPrecedenti of [undefined, null, {}]) {
        const c = contestoIntroCon({ config: nomiDue, online: { info, risultati: {}, matchPrecedenti }, mioLato: 'p1' })();
        assert.deepEqual(c.dati.showdown, { sx: 0, dx: 0 });
        assert.equal(c.dati.set, 1, 'senza numero di set è il primo');
        assert.ok(B.testiIntro(c.dati).righe.includes('MATCH SCORE 0 – 0'));
    }
});

test('contestoIntro, amichevoli: tipo amichevole, niente match né showdown', () => {
    const online = { amichevole: true, info: { categoria: 'Gen9 OU', bestOf: 3 }, risultati: { set1: { vincitore: 'p2' } } };
    const c = contestoIntroCon({ config: nomiDue, online, mioLato: 'p1' })(2);
    assert.deepEqual(c.dati, { tipo: 'amichevole', formato: 'Gen9 OU', set: 2, setTotali: 3, punti: { sx: 0, dx: 1 } });
    assert.deepEqual(B.testiIntro(c.dati), { etichetta: 'FRIENDLY MATCH', punteggio: '0 – 1', righe: ['SET 2/3', 'GEN9 OU'] });
    const una = contestoIntroCon({ config: nomiDue, online: { ...online, info: { categoria: 'Gen9 OU', bestOf: 1 }, risultati: {} }, mioLato: 'p1' })(1);
    assert.deepEqual(B.testiIntro(una.dati), { etichetta: 'FRIENDLY MATCH', punteggio: '0 – 0', righe: ['GEN9 OU'] });
});

// ---------- il collegamento con il simulatore ----------
test('battle.html: carica lo stile e lo script dell\'intro, prima di quelli che usano il tavolo', () => {
    const stile = html.indexOf('<link rel="stylesheet" href="battle-intro.css">');
    const script = html.indexOf('<script src="battle-intro.js"></script>');
    assert.ok(stile > html.indexOf('href="battle-vista.css"'), 'lo stile dopo quello della vista');
    assert.ok(script > 0 && script < html.indexOf('<script src="battle-layout.js"></script>'), 'lo script prima di battle-layout.js');
});

test('battle-ui.js: l\'intro parte con ogni battaglia contro la CPU (anche in palestra), con ogni set nuovo e, online, appena si apre la pagina', () => {
    const avvia = funzione(battleUi, 'avviaBattaglia');
    assert.match(avvia, /nuovoSet\(\);\s*disegnaInfo\(\);\s*if \(cpu\) \{[^}]*introVersus\(undefined, \{ attendi: true \}\);/, 'anche in palestra');
    // i set dal secondo in poi: quando il set nuovo entra in scena, con il suo numero
    assert.match(funzione(battleUi, 'avviaProssimaScena'), /^function avviaProssimaScena\(\) \{\s*const conIntro = !!prossimaScena;\s*if \(conIntro && !introSet\) introVersus\(prossimoSet\);/);
    // il primo set di un match online: appena si sa chi gioca, prima della lobby (anticipaIntroOnline); non per chi arriva a partita già iniziata
    assert.match(funzione(battleUi, 'preparaOnline'), /nuovoSet\(\);\s*anticipaIntroOnline\(\);/);
    assert.match(funzione(battleUi, 'preparaAmichevole'), /nuovoSet\(\);\s*anticipaIntroOnline\(\);/);
    const fase = funzione(battleUi, 'aggiornaFase');
    assert.doesNotMatch(fase, /daLobby/, 'il primo set non rifà l\'intro all\'uscita dalla lobby');
});

test('battle-ui.js: l\'intro non c\'è nell\'app, e aspetta lo sfondo nuovo (le sfide contro la CPU lo rifanno a ogni partita)', () => {
    const intro = funzione(battleUi, 'introVersus');
    assert.match(intro, /!self\.BattleIntro/);
    assert.match(intro, /inApp\(\)/);
    assert.doesNotMatch(intro, /classList\.contains\('palestra'\)|cpu\.palestra/, 'la palestra ha la sua intro');
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
    assert.match(css, /\.vs-sfondo\.vi-in-corso :is\(\.vs-avatar, \.vs-compagno\) \{ visibility: hidden; \}/, 'anche il compagno della palestra');
    // palestra: il capopalestra specchiato e il compagno no, qualunque lato abbiano; chi vola è sollevato come sullo sfondo vero
    assert.match(css, /\.vi-avatar\.vi-specchia \{ transform: scaleX\(-1\); \}/);
    assert.match(css, /\.vi-avatar\.vi-diritto \{ transform: none; \}/);
    assert.match(css, /\.vi-avatar\.sc-vola \{ translate: 0 calc\(var\(--alza, 0px\) \* -1\); \}/);
    // la riga nera in diagonale (60% in alto, 40% in basso, come lo sfondo vero) su entrambe le metà
    assert.match(css, /\.vi \.vs-sx::after \{[^}]*clip-path: polygon\(calc\(60% - 8px\) 0, 60% 0, 40% 100%, calc\(40% - 8px\) 100%\);/);
    assert.match(css, /\.vi \.vs-dx::after \{[^}]*clip-path: polygon\(60% 0, calc\(60% \+ 8px\) 0, calc\(40% \+ 8px\) 100%, 40% 100%\);/);
    // colori e forme del tema del giocatore, non scritti a mano
    for (const v of ['--raggio', '--sh-5', '--sh-7', '--shs-4', '--nb-font-titoli', '--ambra', '--carta', '--inchiostro', '--bordo-forte']) assert.ok(css.includes(`var(${v}`), v);
    // il tabellone segue il tema: i colori vengono dalle variabili del tema, non sono scritti a mano (niente blocco nero fisso)
    const tabellone = css.match(/\.vi-tabellone \{([^}]*)\}/)[1];
    assert.match(tabellone, /background: var\(--carta/);
    assert.match(tabellone, /color: var\(--inchiostro/);
    assert.doesNotMatch(tabellone, /background: #|border: [^;]*#000(?!\))/);
    // niente "VS": al centro c'è il punteggio, grande; il tabellone non lo ripete
    assert.doesNotMatch(css, /vi-vs-img|ha-img|\.vi-pt/);
    // la targa del punteggio: scura come quella dello showdown, con i colori, i bordi, gli angoli e l'ombra del tema (niente colori scritti a mano)
    const targa = css.match(/\.vi-vs \{([^}]*)\}/)[1];
    assert.match(targa, /font-size: clamp\(60px, min\(11vw, 22vh\), 170px\);/);
    assert.match(targa, /background: var\(--inchiostro, #000\)/);
    assert.match(targa, /color: var\(--carta, #fff\);/);
    assert.match(targa, /border: var\(--bordo-forte, 4px solid #000\); border-radius: var\(--raggio, 0px\);/);
    assert.match(targa, /var\(--nb-shcol-titolo, rgba\(0, 0, 0, \.3\)\)/, 'ombra trasparente, come gli adesivi scuri');
    assert.match(targa, /font-family: var\(--nb-font-titoli,/);
    assert.match(targa, /rotate: calc\(-2\.5deg \* var\(--nb-rot, 1\)\);/, 'storta quanto il tema');
    assert.match(targa, /padding: \.17em \.24em 0;/, 'le cifre sono al centro della targa (misurato: stesso spazio sopra e sotto)');
    assert.match(css, /\.vi-cifra\.vi-avanti \{ color: var\(--ambra, #ffbd44\); \}/, 'chi è avanti: la cifra in ambra, come nello showdown');
    assert.match(css, /\.vi-sep::before, \.vi-sep::after \{[^}]*background: var\(--ambra[^}]*border-radius: var\(--raggio, 0px\);/, 'i due punti: quadratini ambra, tondi nei temi tondi');
    assert.doesNotMatch(css, /vi-fascia/, 'niente fascia dei colori');
    assert.match(css, /\.vi-centro \{[^}]*gap: calc\(clamp\(12px, 2\.4vh, 26px\) \+ 8px \* var\(--nb-rot, 1\)\);/, 'più storto il tema, più spazio tra targa e tabellone');
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

test('battle-intro.js: le animazioni di apertura restano al loro posto (fill forwards) e nascono all\'apertura; l\'intro si può saltare e se ne chiude una prima di aprirne un\'altra', () => {
    // l'apertura si crea quando la partita è pronta (non all'inizio): parte dal tempo fisso, ma mai prima
    const apri = battleIntro.slice(battleIntro.indexOf('const apri = () => {'), battleIntro.indexOf('// dopo il tempo fisso, se la partita non è pronta, compare la riga'));
    assert.match(apri, /const ritardo = ritardoApertura\(trascorso\(\)\);/);
    assert.match(apri, /const B = \(e, keyframes, opzioni\) => \{\s*const a = e\.animate\(keyframes, \{ fill: 'forwards', delay: ritardo, \.\.\.opzioni \}\);/);
    const aperture = apri.split('\n').filter(r => /\bB\(/.test(r) && !/const B =/.test(r));
    assert.ok(aperture.length >= 6, `${aperture.length} animazioni di apertura`);
    // nessuna animazione "fissa" parte dal tempo di apertura (sarebbero create prima di sapere se la partita è pronta), tranne le oscillazioni dell'attesa
    const fisse = battleIntro.split('\n').filter(r => /\bA\(/.test(r) && /delay: T\.apertura\b/.test(r));
    assert.deepEqual(fisse, [], 'animazioni di apertura create all\'inizio');
    // le oscillazioni dell'attesa non coprono niente prima di cominciare
    assert.match(battleIntro, /const O = \(e, keyframes, opzioni\) => \{\s*const a = e\.animate\(keyframes, \{ fill: 'none', delay: T\.apertura, iterations: Infinity/);
    // i tempi vengono da T, non scritti in giro
    assert.doesNotMatch(battleIntro.replace(/const T = \{[\s\S]*?\};/, ''), /delay: \d{3,}/);
    // salto: clic o tocco, Invio, Spazio, Esc; i tasti non arrivano al simulatore; nei primi istanti un clic per sbaglio non la chiude
    assert.match(battleIntro, /addEventListener\('pointerdown', suClic\)/);
    assert.match(battleIntro, /e\.key === 'Enter' \|\| e\.key === ' ' \|\| e\.key === 'Escape'/);
    assert.match(battleIntro, /doc\.addEventListener\('keydown', suTasto, true\)/);
    assert.match(battleIntro, /e\.stopPropagation\(\)/);
    assert.match(battleIntro, /if \(trascorso\(\) < T\.protezione\) return;/);
    // un'intro nuova chiude quella in corso; a pagina nascosta e, se la partita non arriva mai, dopo l'attesa massima si chiude da sola
    assert.match(battleIntro, /if \(win\.__introVs\) win\.__introVs\.termina\(true\);/);
    assert.match(battleIntro, /attesaMax \+ T\.totale \+ 2500/);
    assert.match(battleIntro, /Promise\.race\(\[pronta, scaduta\]\)/);
    assert.match(battleIntro, /Promise\.resolve\(opz\.attesa\)\.catch\(\(\) => null\)/, 'senza attesa o con un errore è subito pronta');
    // gli avatar veri tornano visibili comunque
    assert.match(battleIntro, /sfondo\.classList\.remove\('vi-in-corso'\)/);
    // la riga che dice che si aspetta si può cambiare da fuori
    assert.match(battleIntro, /win\.__introVs = \{ radice, termina, stato: scriviStato \};/);
});

test('battle-intro.js: niente scritta "VS" né immagine: al centro, sulla riga nera, la targa del punteggio (le palestre, che non ne hanno, restano col solo tabellone)', () => {
    assert.doesNotMatch(battleIntro, /'VS'|IMMAGINE_VS|seasons-vs|caricaImmagineVs|vi-vs-img/);
    assert.doesNotMatch(battleIntro, /elemento\(doc, 'div', 'vi-pt'/, 'il tabellone non ripete il punteggio');
    // la targa: due cifre (chi è avanti ha la classe vi-avanti), e i due punti
    assert.match(battleIntro, /if \(testi\.punteggio\) \{\s*vs = elemento\(doc, 'div', 'vi-vs'\);\s*const cifre = dividiPunteggio\(testi\.punteggio\);/);
    assert.match(battleIntro, /elemento\(doc, 'span', 'vi-cifra' \+ \(\(i === 0 \? a > b : b > a\) \? ' vi-avanti' : ''\), c\)/);
    assert.match(battleIntro, /separatore = elemento\(doc, 'i', 'vi-sep'\);/);
    assert.doesNotMatch(battleIntro, /fascia/, 'niente fascia dei colori');
    assert.match(battleIntro, /vs\.appendChild\(elemento\(doc, 'span', 'vi-cifra', String\(testi\.punteggio\)\)\);/, 'se è scritto in modo strano resta com\'è');
    assert.match(battleIntro, /if \(vs\) centro\.appendChild\(vs\);/);
    // le animazioni: la targa arriva con un colpo (storta come il tema), poi le cifre una dopo l'altra, e i due punti
    assert.match(battleIntro, /getPropertyValue\('--nb-rot'\)/, 'quanto è storto il tema');
    assert.match(battleIntro, /A\(vs, \{ scale: \[3\.2, 0\.9, 1\], rotate: \[gradi\(-12\), gradi\(-1\.5\), gradi\(-2\.5\)\]/);
    assert.match(battleIntro, /cifreVs\.forEach\(\(c, i\) => A\(c, \{ scale: \[0\.3, 1\.28, 1\][^\n]*delay: T\.ritardoCifre \+ i \* T\.scarto/);
    assert.match(battleIntro, /if \(separatore\) A\(separatore, /);
    assert.match(battleIntro, /if \(vs\) O\(vs, \{ scale: \[1, 1\.05\] \}/, 'in attesa la targa pulsa piano');
});

test('T: le cifre della targa compaiono dopo che è arrivata e prima che la diagonale si apra', () => {
    const { T } = B;
    assert.ok(T.ritardoCifre >= T.ritardoVs + T.vs * 0.5, 'la targa è già lì (a metà del suo colpo)');
    assert.ok(T.ritardoCifre + T.scarto + T.cifra < T.apertura, 'le cifre hanno finito prima che si apra');
});

test('dividiPunteggio: "2 – 1" diventa le due cifre; ogni altra cosa null (la targa lo scrive com\'è)', () => {
    assert.deepEqual(B.dividiPunteggio('2 – 1'), ['2', '1']);
    assert.deepEqual(B.dividiPunteggio('12 – 10'), ['12', '10']);
    assert.deepEqual(B.dividiPunteggio('0 - 0'), ['0', '0'], 'anche col trattino normale');
    assert.deepEqual(B.dividiPunteggio(' 3 – 3 '), ['3', '3']);
    for (const no of [null, undefined, '', 'VS', '2 – ', '– 1', '2 – x', '2 – 1 – 0', 5, {}]) assert.equal(B.dividiPunteggio(no), null, String(no));
    // quello che scrive testiIntro (sempre "a – b") si rilegge sempre
    for (const c of [{ tipo: 'cpu' }, { tipo: 'amichevole' }, { tipo: 'ufficiale', match: 2 }, { tipo: 'cpu', serie: { v: 11, p: 9, n: 1 } }]) {
        const t = B.testiIntro(c);
        assert.equal(B.dividiPunteggio(t.punteggio).length, 2, JSON.stringify(c));
    }
    assert.equal(B.dividiPunteggio(B.testiIntro({ tipo: 'palestra' }).punteggio), null, 'la palestra non ha un punteggio');
});

// ---------- l'intro che copre i caricamenti (battle-ui.js) ----------
function ambienteIntro(extra = {}) {
    const chiamate = [];
    const terminate = [];
    const S = statoBase({
        introSet: null, timerProntaCpu: null, introGenerazione: 0, versusInCorso: 0, versusPronto: Promise.resolve(), ultimoProgresso: '',
        window: {}, document: { body: { classList: { contains: () => !!extra.palestra } } },
        inApp: () => !!extra.app, console: { warn() {} },
        ...extra
    });
    S.self = {
        BattleIntro: {
            ...B,
            riproduci: opz => { chiamate.push(opz); if (extra.riproduciLancia) throw new Error('boom'); return Promise.resolve(true); }
        },
        __introVs: { termina: subito => terminate.push(subito) }
    };
    S.self.BattleIntro.togliCopertura = () => { S.copertureTolte = (S.copertureTolte || 0) + 1; };
    const f = funzioniUi(S, 'punteggio', 'contestoIntro', 'introVersus', 'togliCopertura', 'introPronta', 'introAbbandona', 'introSePronti');
    return { S, f, chiamate, terminate };
}
const configCpu = { p1: { nome: 'Didi' }, p2: { nome: 'CPU' } };

test('introVersus con attendi: parte subito e resta in attesa finché introPronta non la libera (una volta sola)', async () => {
    const { S, f, chiamate } = ambienteIntro({ config: configCpu, cpu: {} });
    f.introVersus(undefined, { attendi: true });
    assert.equal(chiamate.length, 1);
    assert.ok(chiamate[0].attesa instanceof Promise, 'la promessa di attesa');
    assert.deepEqual(chiamate[0].nomi, { sx: 'Didi', dx: 'CPU' });
    assert.equal(chiamate[0].testi.etichetta, 'BATTLE 1');
    assert.ok(S.introSet, 'in attesa');
    let aperta = false;
    chiamate[0].attesa.then(() => { aperta = true; });
    await new Promise(ok => setTimeout(ok, 5));
    assert.equal(aperta, false, 'finché la partita non è pronta resta chiusa');
    f.introPronta();
    await new Promise(ok => setTimeout(ok, 5));
    assert.equal(aperta, true);
    assert.equal(S.introSet, null);
    f.introPronta();                       // di nuovo: niente
    assert.equal(chiamate.length, 1);
});

test('introVersus senza attendi: nessuna attesa; l\'ultimo messaggio di caricamento passa alla sua riga', () => {
    const { S, f, chiamate } = ambienteIntro({ config: configCpu, cpu: {}, ultimoProgresso: 'Building a CPU team for VGC Gen 9…' });
    f.introVersus(2);
    assert.equal(chiamate.length, 1);
    assert.equal(chiamate[0].attesa, null);
    assert.equal(S.introSet, null);
    assert.equal(chiamate[0].stato, 'Building a CPU team for VGC Gen 9…');
});

test('introVersus: con un contesto parte anche prima che la pagina abbia config e cpu (la partenza anticipata)', () => {
    const { f, chiamate } = ambienteIntro({ config: null, cpu: null });
    f.introVersus(1, { attendi: true, contesto: { nomi: { sx: 'Didi', dx: 'Aquarush' }, dati: { tipo: 'cpu', battaglia: 1, serie: { v: 0, p: 0, n: 0 } } } });
    assert.equal(chiamate.length, 1);
    assert.deepEqual(chiamate[0].nomi, { sx: 'Didi', dx: 'Aquarush' });
    // senza né config né contesto non c'è niente da dire
    const vuota = ambienteIntro({ config: null, cpu: null });
    vuota.f.introVersus(1, { attendi: true });
    assert.equal(vuota.chiamate.length, 0);
    assert.equal(vuota.S.introSet, null);
});

test('introVersus: non nell\'app; in palestra sì (con i lati del capopalestra e del compagno)', () => {
    const { S, f, chiamate } = ambienteIntro({ config: configCpu, cpu: {}, app: true });
    f.introVersus(1, { attendi: true });
    assert.equal(chiamate.length, 0);
    assert.equal(S.introSet, null);
    const palestra = ambienteIntro({ config: configCpu, cpu: { palestra: { nome: 'Capo', tappa: 0, aspetto: {} } }, palestra: true });
    palestra.S.self.Palestra = { TAPPE: 3 };
    palestra.f.introVersus(1);
    assert.equal(palestra.chiamate.length, 0, 'senza sfondo della palestra (latiPalestra) niente intro, e niente copertura');
    assert.equal(palestra.S.copertureTolte, 1);
});

test('introVersus: se il disegno dell\'intro fallisce la promessa di attesa si scioglie da sola (niente resta ad aspettare)', async () => {
    const { f, chiamate } = ambienteIntro({ config: configCpu, cpu: {}, riproduciLancia: true });
    f.introVersus(1, { attendi: true });
    assert.equal(chiamate.length, 1);
    let sciolta = false;
    chiamate[0].attesa.then(() => { sciolta = true; });
    await new Promise(ok => setTimeout(ok, 5));
    assert.equal(sciolta, true);
});

test('introAbbandona: chiude subito l\'intro, toglie l\'attesa e cambia la generazione (una partenza anticipata in ritardo non parte)', () => {
    const { S, f, terminate } = ambienteIntro({ config: configCpu, cpu: {} });
    f.introVersus(1, { attendi: true });
    const prima = S.introGenerazione;
    f.introAbbandona();
    assert.equal(S.introSet, null);
    assert.equal(S.introGenerazione, prima + 1);
    assert.deepEqual(terminate, [true]);
});

test('introSePronti: il primo set non rifà l\'intro (è già partita aprendo la pagina); tra i set delle amichevoli con team cambiabili parte quando i due sono pronti', () => {
    const online = (extra = {}) => ({ info: { categoria: 'Gen9 OU', bestOf: 3, match: 1 }, risultati: {}, pronti: { p1: true, p2: true }, stato: 'lobby', giaSalvato: false, ...extra });
    // prima lobby: niente (l'intro del primo set è quella dell'apertura)
    let t = ambienteIntro({ config: nomiDue, online: online() });
    t.f.introSePronti();
    assert.equal(t.chiamate.length, 0);
    // tra i set, uno solo pronto: niente
    t = ambienteIntro({ config: nomiDue, online: online({ amichevole: true, stato: 'tra_set', pronti: { p1: true, p2: false } }) });
    t.f.introSePronti();
    assert.equal(t.chiamate.length, 0);
    // già in attesa: niente doppioni
    t = ambienteIntro({ config: nomiDue, online: online({ amichevole: true, stato: 'tra_set' }), introSet: { pronta() {} } });
    t.f.introSePronti();
    assert.equal(t.chiamate.length, 0);
    // una partita già salvata non rifà l'intro; senza partita online niente
    t = ambienteIntro({ config: nomiDue, online: online({ amichevole: true, stato: 'tra_set', giaSalvato: true }) });
    t.f.introSePronti();
    assert.equal(t.chiamate.length, 0);
    t = ambienteIntro({ config: nomiDue, online: null });
    t.f.introSePronti();
    assert.equal(t.chiamate.length, 0);
});

test('introSePronti: tra un set e l\'altro (amichevoli con team cambiabili) parte con il numero del set che sta per cominciare; nelle stagioni no', () => {
    const risultati = { set1: { vincitore: 'p1' }, set2: { vincitore: 'p2' } };
    const amichevole = { amichevole: true, info: { categoria: 'Gen9 OU', bestOf: 5, cambioTeam: true }, risultati, pronti: { p1: true, p2: true }, stato: 'tra_set' };
    const t = ambienteIntro({ config: nomiDue, online: amichevole });
    t.f.introSePronti();
    assert.equal(t.chiamate.length, 1);
    assert.equal(t.chiamate[0].testi.righe[0], 'SET 3/5');
    assert.equal(t.chiamate[0].testi.punteggio, '1 – 1');
    const ufficiale = ambienteIntro({ config: nomiDue, online: { ...amichevole, amichevole: false } });
    ufficiale.f.introSePronti();
    assert.equal(ufficiale.chiamate.length, 0);
});

test('battle-ui.js: i passi del caricamento non chiudono l\'intro, un messaggio sul campo (un errore) sì', () => {
    const msg = funzione(battleUi, 'mostraMessaggioCampo');
    assert.match(msg, /introAbbandona\(\);/);
    const progresso = funzione(battleUi, 'mostraProgresso');
    assert.doesNotMatch(progresso, /introAbbandona/);
    assert.match(progresso, /ultimoProgresso = testo;/);
    assert.match(progresso, /self\.__introVs\.stato\(testo\)/);
    assert.match(funzione(battleUi, 'nascondiMessaggio'), /self\.__introVs\.stato\(''\)/);
    // i sei passi del caricamento
    for (const t of ["'Loading the showdown…'", "'Loading your team…'", '`Building a CPU team for ${dati.categoria}…`', '`Getting ${formato.nome} ready…`', "'Connecting to the match…'", "'Connecting to the friendly match…'"]) {
        assert.ok(battleUi.includes(`mostraProgresso(${t})`), t);
        assert.ok(!battleUi.includes(`mostraMessaggioCampo(${t})`), `${t} è un passo, non un errore`);
    }
    // gli errori restano messaggi sul campo
    for (const t of ["`Couldn't start the practice:", "`Couldn't open the match:", "`Couldn't open the friendly match:", "`Couldn't load the match:"]) {
        assert.ok(battleUi.includes(`mostraMessaggioCampo(${t}`), t);
    }
});

test('battle-ui.js, contro la CPU: l\'intro parte appena si sa chi gioca, mentre il resto si carica, e la prima battaglia riprende avversario e sfondo senza rifarli', () => {
    // prova di un team: subito dopo il login e prima di leggere team e formato
    const cpuTeam = funzione(battleUi, 'preparaCpu');
    assert.ok(cpuTeam.indexOf('anticipaIntroCpu(leggiNomeUtente(utente));') > 0);
    assert.ok(cpuTeam.indexOf('anticipaIntroCpu(') < cpuTeam.indexOf('await caricaPerProva('), 'prima del caricamento del team');
    assert.ok(cpuTeam.indexOf('anticipaIntroCpu(') < cpuTeam.indexOf('await nuovoTeamCpu('), 'prima della costruzione del team della CPU');
    // Random: appena si sa il nome, prima di aspettare i generatori
    const random = funzione(battleUi, 'preparaCpuRandom');
    assert.ok(random.indexOf('const generatori = caricaGeneratoriRandom();') < random.indexOf('io = await profiloDiChiGioca();'), 'i generatori si scaricano in parallelo');
    assert.ok(random.indexOf('anticipaIntroCpu(io.nome);') < random.indexOf('await generatori;'));
    assert.match(random, /generatori\.catch\(/, 'un errore dei generatori prima dell\'await non resta "non gestito"');
    // la partenza anticipata: avversario, sfondo, poi l'intro in attesa; non parte se nel frattempo c'è un errore
    const anticipa = funzione(battleUi, 'anticipaIntroCpu');
    assert.match(anticipa, /await vestiVersus\(nome, p\.nome, aspettoPersona\(p\)\);/);
    assert.match(anticipa, /generazione !== introGenerazione\) return/);
    assert.match(anticipa, /introVersus\(1, \{ attendi: true, contesto: \{ nomi: \{ sx: nome, dx: p\.nome \}, dati: \{ tipo: 'cpu', battaglia: 1,/);
    assert.match(anticipa, /inApp\(\)/);
    assert.match(anticipa, /document\.body\.classList\.contains\('palestra'\)/);
    // la prima battaglia riprende l'avversario scelto (e aspetta che la partenza anticipata abbia finito: niente due avversari)
    const persona = funzione(battleUi, 'assegnaPersonaCpu');
    assert.match(persona, /const anticipata = personaAnticipata \? await personaAnticipata : null;/);
    assert.match(persona, /if \(!anticipata \|\| !anticipata\.sfondo\) vestiVersus\(config\.p1\.nome, p\.nome, aspettoPersona\(p\)\);/);
    assert.match(persona, /personaAnticipata = null;/);
});

test('battle-ui.js, contro la CPU: l\'intro si apre alla prima richiesta del simulatore (o dopo 5 s), una sola intro per battaglia', () => {
    const avvia = funzione(battleUi, 'avviaBattaglia');
    assert.match(avvia, /if \(!introSet\) introVersus\(undefined, \{ attendi: true \}\);/, 'la prima è già partita; le rivincite la fanno partire qui');
    assert.match(avvia, /timerProntaCpu = setTimeout\(introPronta, 5000\);/);
    const eventi = funzione(battleUi, 'collegaEventi');
    assert.match(eventi, /b\.on\('richiesta', \(lato, richiesta\) => \{\s*if \(cpu\) introPronta\(\);/, 'solo contro la CPU: online la pronta la danno aggiornaFase e avviaProssimaScena');
});

test('battle-ui.js, online: l\'intro è la prima cosa (prima della lobby), si apre sulla lobby; tra i set si rifà e si apre al set in scena', () => {
    // il primo set: parte appena si sa chi gioca e si apre appena la pagina ha il suo stato (la prima aggiornaFase), non a "pronti" né a "in corso"
    const fase = funzione(battleUi, 'aggiornaFase');
    assert.match(fase, /if \(!online\.paginaPronta\) \{ online\.paginaPronta = true; introPronta\(\); \}/, 'solo la prima volta');
    assert.doesNotMatch(fase, /introVersus/);
    const anticipa = funzione(battleUi, 'anticipaIntroOnline');
    assert.match(anticipa, /partite\/\$\{mia\.id\}\/stato/);
    assert.match(anticipa, /if \(stato && stato !== 'lobby'\) return togliCopertura\(\);/, 'chi arriva a set già iniziato non la vede');
    assert.match(anticipa, /mia\.giaSalvato/);
    assert.match(anticipa, /Promise\.race\(\[mia\.matchPrecedentiPronti, new Promise\(ok => setTimeout\(ok, 1500\)\)\]\)/, 'il punteggio dei match di prima, al massimo un attimo');
    assert.match(anticipa, /generazione !== introGenerazione/);
    assert.match(anticipa, /introVersus\(1, \{ attendi: true \}\);\s*if \(mia\.paginaPronta\) introPronta\(\);/);
    // tra i set (amichevoli con team cambiabili): "pronti" la fa partire, il set in scena la apre
    assert.equal((battleUi.match(/introSePronti\(\); \}\);/g) || []).length, 2, 'match di stagione e amichevole');
    const nuovo = funzione(battleUi, 'nuovoSet');
    assert.match(nuovo, /creaScena\(\{ recupera \}\);\s*if \(numero\) introPronta\(\);/, 'solo con il numero del set (online): contro la CPU si apre alla prima richiesta');
    const prossima = funzione(battleUi, 'avviaProssimaScena');
    assert.match(prossima, /const conIntro = !!prossimaScena;/);
    assert.match(prossima, /if \(conIntro && !introSet\) introVersus\(prossimoSet\);/);
    assert.ok(prossima.indexOf('creaScena();') < prossima.indexOf('if (conIntro) introPronta();'), 'si apre dopo aver rifatto la scena');
    assert.match(funzione(battleUi, 'leggiMatchPrecedenti'), /online\.matchPrecedentiPronti = firebase\.database\(\)/);
});

test('battle-ui.js, palestra: le due metà sono il capopalestra (specchiato) e il suo compagno, costruite come quelle dello sfondo "sfida", e atterrano sullo sfondo della palestra', () => {
    const lati = funzione(battleUi, 'latiPalestra');
    assert.match(lati, /document\.querySelector\('\.vs-sfondo\.pal-decor'\)/);
    assert.match(lati, /creaLatoVersus\(base, g\.nome, 'vs-sx'\)/);
    assert.match(lati, /colore: scurisci\(base\.colore, 0\.4\)/, 'la metà del compagno più scura');
    assert.match(lati, /\{ reale: sx, avatar, specchia: true \}, \{ reale: dx, avatar: compagno, specchia: false \}/);
    assert.match(lati, /pulisci: \(\) => contenitore\.remove\(\)/);
    // la metà dello sfondo "sfida" è la stessa funzione per le partite tra due allenatori e per la palestra
    assert.match(funzione(battleUi, 'vestiVersus'), /creaLatoVersus\(a1, nomeP1, 'vs-sx'\), destra = creaLatoVersus\(a2, nomeP2, 'vs-dx'\)/);
    // l'intro aspetta che il compagno abbia la sua misura (ScalaPkm.scena), e la palestra la salva nella tappa
    assert.match(funzione(battleUi, 'vestiPalestra'), /scenaPalestra = scala\(\);/);
    assert.match(funzione(battleUi, 'introVersus'), /Promise\.race\(\[scenaPalestra, new Promise\(ok => setTimeout\(ok, 3500\)\)\]\)/);
    assert.match(funzione(battleUi, 'preparaPalestra'), /timerAnnuncio: 0, aspetto: gym\.aspetto/);
});

test('battle-intro.js: l\'intro prende i lati da fuori (palestra) e l\'avatar eredita distanza dal bordo, specchio e volo di quello vero', () => {
    assert.match(battleIntro, /const sfondo = opz\.sfondo \|\| doc\.querySelector/);
    assert.match(battleIntro, /const dati = opz\.lati \|\| null;/);
    assert.match(battleIntro, /s\.specchia === true \? ' vi-specchia' : s\.specchia === false \? ' vi-diritto' : ''/);
    assert.match(battleIntro, /classList\.contains\('sc-vola'\)/);
    assert.match(battleIntro, /ancora\.style\.bottom = sotto/);
});

test('riproduci con lati dati: senza sfondo o con meno di due lati vale false subito', async () => {
    const win = finestra();
    assert.equal(await B.riproduci({ win, nomi: {}, testi: {}, lati: [{ reale: {} }, { reale: {} }] }), false, 'senza sfondo');
    win.document.querySelector = () => ({});
    assert.equal(await B.riproduci({ win, nomi: {}, testi: {}, sfondo: {}, lati: [{ reale: {} }] }), false, 'un lato solo');
});

test('battle-intro.css: la riga "in attesa" sta sotto il tabellone, compare solo in attesa e usa il tema', () => {
    assert.match(css, /\.vi-attesa \{[^}]*position: absolute;[^}]*top: 100%;[^}]*opacity: 0;/);
    assert.match(css, /\.vi\.vi-in-attesa \.vi-attesa \{ opacity: 1;/);
    const regola = css.match(/\.vi-attesa \{([^}]*)\}/)[1];
    assert.match(regola, /background: var\(--inchiostro/);
    assert.match(regola, /box-shadow: var\(--shs-3/, 'adesivo scuro: ombra trasparente');
    assert.match(css, /@keyframes vi-punti/);
});

test('la copertura di prima dell\'intro: scura (solo «Getting ready», niente VS) dal primo istante nelle partite (CPU, palestre, amichevoli, stagioni), tolta quando l\'intro è partita o se non ci sarà', () => {
    // battle.html: l'elemento è il primo del body; la classe la mette uno script in testa, solo contro la CPU (non in palestra, non nell'app, non con "riduci movimento")
    assert.match(html, /<body>\s*<div class="vs-copertura" id="vs-copertura" aria-hidden="true"><p>Getting ready<\/p><\/div>/);
    assert.doesNotMatch(html, /seasons-vs/);
    const script = html.match(/<script>\s*\/\/ Nelle partite[\s\S]*?<\/script>/)[0];
    assert.match(script, /\[\?&\]\(cpu\|amichevole\)=\[\^&\]/);
    assert.match(script, /\[\?&\]showdown=\[\^&\]\/\.test\(q\) && !\/\[\?&\]locale=/, 'non la modalità locale di prova');
    assert.doesNotMatch(script, /palestra=/, 'anche le palestre');
    assert.match(script, /classList\.contains\('app'\)/);
    assert.match(script, /prefers-reduced-motion: reduce/);
    assert.match(script, /setTimeout\(togli, 15000\)/, 'si toglie da sola');
    assert.match(script, /addEventListener\('error', togli, true\)/, 'e se uno script non si carica');
    assert.ok(html.indexOf('vs-copre') < html.indexOf('<body>'), 'lo script sta in testa: la copertura c\'è al primo disegno');
    // css: nascosta di norma, sotto l'intro (9500) ma sopra a tutto il resto
    assert.match(css, /\.vs-copertura \{ display: none; \}/);
    assert.match(css, /html\.vs-copre \.vs-copertura \{[^}]*position: fixed;[^}]*z-index: 9400;[^}]*background: var\(--inchiostro/);
    // la toglie l'intro quando le due metà si sono incontrate; e battle-ui se l'intro non c'è o fallisce, e a ogni errore
    assert.match(battleIntro, /win\.setTimeout\(\(\) => togliCopertura\(win\), T\.entraMeta \+ 40\)/);
    assert.equal(typeof B.togliCopertura, 'function');
    assert.match(funzione(battleUi, 'introAbbandona'), /togliCopertura\(\);/);
    assert.match(funzione(battleUi, 'avviaBattaglia'), /if \(!introSet\) togliCopertura\(\);/);
    const intro = funzione(battleUi, 'introVersus');
    assert.match(intro, /\.then\(partita => \{ if \(!partita\) togliCopertura\(\); \}\)/);
    const anticipa = funzione(battleUi, 'anticipaIntroCpu');
    assert.ok((anticipa.match(/togliCopertura\(\)/g) || []).length >= 3, 'tutte le uscite senza intro');
});

test('togliCopertura: toglie la classe da <html> e non si rompe senza finestra', () => {
    const tolte = [];
    B.togliCopertura({ document: { documentElement: { classList: { remove: c => tolte.push(c) } } } });
    assert.deepEqual(tolte, ['vs-copre']);
    for (const no of [null, undefined, {}, { document: {} }]) assert.doesNotThrow(() => B.togliCopertura(no));
});

test('rivincita e "un altro team CPU": la copertura scura torna subito, prima che si veda il simulatore', () => {
    assert.equal(typeof B.mettiCopertura, 'function');
    const aggiunte = [];
    const finestra = (extra = {}) => ({
        document: { body: {}, hidden: false, documentElement: { classList: { contains: () => false, add: c => aggiunte.push(c) } } },
        matchMedia: () => ({ matches: false }), Element: { prototype: { animate() {} } }, setTimeout: () => 0, ...extra
    });
    assert.equal(B.mettiCopertura(finestra()), true);
    assert.deepEqual(aggiunte, ['vs-copre']);
    // non nell'app, non con "riduci movimento"
    const app = finestra(); app.document.documentElement.classList.contains = c => c === 'app';
    assert.equal(B.mettiCopertura(app), false);
    assert.equal(B.mettiCopertura(finestra({ matchMedia: () => ({ matches: true }) })), false);
    assert.doesNotThrow(() => B.mettiCopertura(null));
    // collegamento: parte appena si preme, e se la squadra nuova non si può fare si toglie
    assert.match(funzione(battleUi, 'iniziaRandom'), /^[^]*?\{\s*copriSubito\(\);\s*await assegnaPersonaCpu\(\)/);
    const altro = funzione(battleUi, 'altroTeamCpu');
    assert.match(altro, /cpu\.generando = true;\s*copriSubito\(\);/);
    assert.match(altro, /catch \(errore\) \{[^]*togliCopertura\(\);/);
});

test('lati del simulatore: il nome del team è un riquadro in evidenza sopra i Pokémon; ogni casella ha il tooltip, anche quelle dell\'avversario', () => {
    const extra = fs.readFileSync(path.join(__dirname, '../docs/battle-extra.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '../docs/style-battle.css'), 'utf8');
    // il riquadro del team sta dopo la scheda e prima dei Pokémon, senza etichette; i badge del team sono DENTRO il riquadro, sotto il nome
    assert.match(extra, /SB\.htmlScheda\(sc\)[^]*?class="lato-team-riquadro"><p class="lato-team nome-scorrevole"[^]*?<\/p>\$\{badgeTeam\}<\/div>[^]*?<ol class="lato-pkm">/);
    assert.ok(!/lato-team-et/.test(extra) && !/lato-team-et/.test(css), 'niente tag "Team" sopra il nome');
    assert.match(css, /\.lato-team \{[^}]*font: 800 1\.3rem/, 'più grande di prima (era .78rem)');
    assert.match(css, /\.lato-team-riquadro \{[^}]*align-self: stretch;/);
    // tooltip: tutte le caselle tranne le ignote; chi non ha il set (l'avversario) mostra quello che mostra il simulatore sul suo Pokémon
    assert.match(extra, /<li class="membro\$\{x\.ignoto \? '' : ' con-tooltip'\}/);
    const f = /function tooltipMembro\(e, lato\) \{[^]*?\n\}/.exec(extra)[0];
    assert.match(f, /if \(puoVedereSet\(lato\) && setCompleto\(set\)\) \{/);
    assert.match(f, /const cliente = sceso \|\| trovato;\s*if \(!cliente\) return;\s*html = htmlPokemon\(tt, cliente, null, \{ attivo: false, daSheet: false, lato \}\);/);
});

test('doppi: sul secondo Pokémon si ricorda cosa si è scelto per il primo, e contro chi', () => {
    const attivo = (nome, mosse) => ({ pokemon: { nome }, mosse: mosse.map(([numero, n]) => ({ numero, nome: n, target: 'normal', max: { nome: `Max ${n}`, target: 'adjacentFoe' } })) });
    const S = {
        ETICHETTA_POTENZIAMENTO: { terastallize: 'Terastallize', zmove: 'Z-Move', dynamax: 'Dynamax' },
        mossaEffettiva: (a, m, pot) => (pot === 'dynamax' && m.max ? { ...m.max } : { nome: m.nome, target: m.target }),
        avversarioDi: l => (l === 'p1' ? 'p2' : 'p1'),
        stato: { campo: { p1: [{ nome: 'Abomasnow' }, { nome: 'Rillaboom' }], p2: [{ nome: 'Zacian' }, { nome: 'Koraidon' }] } },
        pannelli: { p1: { bozza: [], r: { attivi: [attivo('Abomasnow', [[1, 'Blizzard'], [2, 'Giga Drain']]), attivo('Rillaboom', [[1, 'Fake Out']])], squadra: [{ indice: 3, nome: 'Garchomp' }] } } }
    };
    const { riepilogoScelte } = funzioniUi(S, 'riepilogoScelte');
    const con = (...bozza) => { S.pannelli.p1.bozza = bozza; return riepilogoScelte('p1'); };
    assert.deepEqual(con(), [], 'sul primo Pokémon non c\'è niente da ricordare');
    assert.deepEqual(con('move 2 2'), ['Abomasnow will use Giga Drain on Koraidon']);
    assert.deepEqual(con('move 2 1'), ['Abomasnow will use Giga Drain on Zacian']);
    assert.deepEqual(con('move 1 -2'), ['Abomasnow will use Blizzard on Rillaboom'], 'l\'alleato ha il valore negativo');
    assert.deepEqual(con('move 1 -1'), ['Abomasnow will use Blizzard on itself']);
    assert.deepEqual(con('move 1'), ['Abomasnow will use Blizzard'], 'una mossa senza bersaglio');
    assert.deepEqual(con('switch 3'), ['Abomasnow will switch to Garchomp']);
    assert.deepEqual(con('move 2 1 terastallize'), ['Abomasnow will use Giga Drain on Zacian (Terastallize)']);
    assert.deepEqual(con('move 2 1 dynamax'), ['Abomasnow will use Max Giga Drain on Zacian (Dynamax)']);
    assert.deepEqual(con('pass'), [], 'nessuno da muovere: niente');
    // collegamento: solo nei doppi, sotto le mosse (dopo il piede con cambi e meccaniche)
    const mosse = funzione(battleUi, 'disegnaMosse');
    assert.match(mosse, /const fatte = doppio \? riepilogoScelte\(lato\) : \[\];/);
    assert.match(mosse, /if \(fatte\.length\) piede\.append\(el\('p', \{ class: 'scelta-fatta' \}[^\n]*\n\s*if \(piede\.childNodes\.length\) corpo\.append\(piede\);/, 'nel piede, a destra dei cambi');
    assert.match(fs.readFileSync(path.join(__dirname, '../docs/style-battle.css'), 'utf8'), /\.scelta-fatta \{[^}]*flex: 1 1 13rem;[^}]*margin: 0 0 0 auto;/);
});

test('colonne del simulatore: l\'elenco dei fiocchi non finisce sotto il tooltip del Pokémon', () => {
    const extra = fs.readFileSync(path.join(__dirname, '../docs/battle-extra.js'), 'utf8');
    assert.match(funzione(extra, 'apriFumettoFiocchi'), /medaglie\.classList\.add\('aperto'\);\s*nascondiTooltip\(\);/, 'aprendo i fiocchi il tooltip del Pokémon si chiude');
    assert.match(funzione(extra, 'tooltipMembro'), /\|\| e\.target\.closest\?\.\('\.fiocco-medaglie'\)\) return;/, 'sulle medagliette non si riapre');
});

test('colonne del simulatore: il riquadro del team è bianco come la scheda dell\'allenatore; i badge hanno il fumetto con la lista', () => {
    const css = fs.readFileSync(path.join(__dirname, '../docs/style-battle.css'), 'utf8');
    const riquadro = /\.lato-team-riquadro \{[^}]*\}/.exec(css)[0];
    assert.match(riquadro, /background: var\(--carta\)/);
    assert.match(riquadro, /border: var\(--bordo\)/);
    assert.doesNotMatch(riquadro, /var\(--inchiostro\);\s*color: var\(--carta\)/, 'non più il blocco scuro');
    assert.match(css, /\.membro \.fiocco-t-tip, \.badge-elenco \.fiocco-t-tip \{/);
    assert.match(css, /\.badge-elenco\.aperto \.fiocco-t-tip \{ display: block; \}/);
    // lo apre lo stesso codice dei fiocchi dei Pokémon: cerca .fiocco-medaglie dentro la colonna
    const extra = fs.readFileSync(path.join(__dirname, '../docs/battle-extra.js'), 'utf8');
    assert.match(extra, /closest\('\.fiocco-medaglie'\)/);
});

test('fumetto dei fiocchi/badge: il tag del livello ha davvero il colore (bronzo, argento, oro, platino)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../docs/style-battle.css'), 'utf8');
    // le variabili dei colori devono valere dentro il fumetto, non solo sulle medagliette (.bt-mini): senza, il tag resta grigio
    assert.match(css, /\.bt-mini, \.fiocco-t-tip \{ --bt-bronzo: #d98a3d; --bt-argento: #cfd6de; --bt-oro: #ffd23f; --bt-platino: #9ad9f5; \}/);
    for (const [classe, v] of [['bronze', 'bronzo'], ['silver', 'argento'], ['gold', 'oro'], ['platinum', 'platino']])
        assert.match(css, new RegExp(`\\.fiocco-t-riga\\.fiocco-${classe} \\{ --livello: var\\(--bt-${v}\\); \\}`));
});

test('fumetto di badge e fiocchi nel simulatore: il tag del livello segue il tema (angoli, carattere, ombra, inclinazione)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../docs/style-battle.css'), 'utf8');
    const tag = /\.fiocco-t-livello \{[^}]*\}/.exec(css)[0];
    assert.match(tag, /border-radius: min\(var\(--nb-raggio, 0px\), 10px\)/);
    assert.match(tag, /font-family: var\(--nb-font-titoli,/);
    assert.match(tag, /box-shadow: var\(--sh-2\)/);
    assert.match(tag, /rotate: calc\(var\(--nb-rot, 1\) \* -1\.5deg\)/);
    assert.match(tag, /background: var\(--livello, #999\)/, 'il colore del livello resta');
});

test('tag del livello nel fumetto: il testo è centrato in verticale (più margine sopra, il carattere ha più vuoto sotto)', () => {
    const css = fs.readFileSync(path.join(__dirname, '../docs/style-battle.css'), 'utf8');
    assert.match(/\.fiocco-t-livello \{[^}]*\}/.exec(css)[0], /padding: 3px 6px 0;/);
});
