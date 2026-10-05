'use strict';
// Il diagramma a ragnatela della personalità (docs/personalita-grafico.js), che disegnano il profilo e la pagina pubblica:
//   - la struttura: anelli, anello della media, assi, area e punti (solo con i valori), una etichetta per asse;
//   - due forme (grande, con i numeri; piccolo, solo i nomi) con tutto dentro il disegno;
//   - il testo per chi non vede il disegno; il testo entra solo come testo;
//   - tutte le classi del disegno hanno uno stile in ogni foglio che lo usa.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../docs/personalita-grafico.js');
const Personalita = require('../docs/personalita.js');

const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

// un mini DOM: registra gli elementi creati
function documentoFinto() {
    const elemento = (ns, tag) => ({ nodeType: 1, ns, tag, attrs: {}, figli: [], setAttribute(k, v) { this.attrs[k] = v; }, append(...x) { this.figli.push(...x); } });
    return { createElementNS: elemento, createTextNode: testo => ({ nodeType: 3, testo }) };
}
const tutti = (nodo, f) => [nodo].concat(...nodo.figli.filter(x => x.nodeType === 1).map(x => tutti(x, f))).filter(f);
const classi = nodo => String(nodo.attrs.class || '').split(' ');
const con = (radice, classe) => tutti(radice, n => classi(n).includes(classe));
const testoDi = nodo => (nodo.figli || []).map(f => (f.nodeType === 3 ? f.testo : testoDi(f))).join('');
const disegna = (valori, opzioni = {}) => G.radar(Personalita.ASSI, valori, { documento: documentoFinto(), Personalita, ...opzioni });

test('con i valori: tre anelli, la media, sei assi, l\'area, sei punti e una etichetta per asse', () => {
    const svg = disegna([60, 40, 50, 70, 30, 55]);
    assert.equal(svg.tag, 'svg');
    assert.equal(svg.attrs.role, 'img');
    assert.equal(con(svg, 'pers-radar-anello').length, 3);
    assert.equal(con(svg, 'pers-radar-media').length, 1);
    assert.equal(con(svg, 'pers-radar-asse').length, 6);
    assert.equal(con(svg, 'pers-radar-area').length, 1);
    assert.equal(con(svg, 'pers-radar-punto').length, 6);
    const etichette = con(svg, 'pers-radar-et');
    assert.equal(etichette.length, 6);
    assert.deepEqual(etichette.map(e => testoDi(e.figli[0])), Personalita.ASSI.map(a => a.nome.toUpperCase()));
    // il diagramma grande scrive anche i numeri sotto i nomi
    assert.deepEqual(con(svg, 'pers-radar-val').map(testoDi), ['60', '40', '50', '70', '30', '55']);
});

test('senza i valori (personalità ancora bloccata) c\'è solo la griglia, e lo dice a chi non la vede', () => {
    const svg = disegna(null);
    assert.equal(con(svg, 'pers-radar-area').length, 0);
    assert.equal(con(svg, 'pers-radar-punto').length, 0);
    assert.equal(con(svg, 'pers-radar-val').length, 0);
    assert.equal(con(svg, 'pers-radar-anello').length, 3);
    assert.match(svg.attrs['aria-label'], /still locked/);
});

test('il testo per chi non vede il disegno ha i nomi e i valori', () => {
    const t = G.descrizione(Personalita.ASSI, [61, 39, 50, 72, 28, 55]);
    assert.match(t, /^Personality diagram: Attack 61, Guard 39, Switch 50, Setup 72, Field 28, Tricks 55\. 50 is the league average\.$/);
    assert.equal(disegna([61, 39, 50, 72, 28, 55]).attrs['aria-label'], t);
});

test('la forma piccola ha solo i nomi, la sua classe e un disegno più largo che alto; tutto sta dentro il disegno', () => {
    const piccolo = disegna([95, 5, 95, 5, 95, 5], { piccolo: true });
    assert.ok(classi(piccolo).includes('pers-radar-piccolo'));
    assert.equal(con(piccolo, 'pers-radar-val').length, 0, 'niente numeri nella forma piccola');
    const grande = disegna([95, 5, 95, 5, 95, 5]);
    assert.ok(!classi(grande).includes('pers-radar-piccolo'));
    for (const [nome, svg, forma] of [['piccolo', piccolo, G.FORME.piccolo], ['grande', grande, G.FORME.grande]]) {
        assert.equal(svg.attrs.viewBox, `0 0 ${forma.larghezza} ${forma.altezza}`, nome);
        for (const poligono of tutti(svg, n => n.tag === 'polygon')) {
            for (const punto of poligono.attrs.points.split(' ')) {
                const [x, y] = punto.split(',').map(Number);
                assert.ok(x >= 0 && x <= forma.larghezza && y >= 0 && y <= forma.altezza, `${nome}: punto fuori dal disegno ${punto}`);
            }
        }
        // le etichette partono dentro il disegno con spazio per il testo: a destra e a sinistra lo spazio che resta basta per il nome
        // più lungo (sei lettere, larghe circa 0,68 della grandezza del carattere: 11 nel profilo, 21 nella carta)
        const carattere = nome === 'piccolo' ? 21 : 11;
        for (const e of con(svg, 'pers-radar-et')) {
            const x = Number(e.attrs.x), y = Number(e.attrs.y);
            assert.ok(Number.isFinite(x) && Number.isFinite(y), nome);
            assert.ok(y > 0 && y < forma.altezza + 8, `${nome}: etichetta ${testoDi(e.figli[0])} a y=${y}`);
            const serve = testoDi(e.figli[0]).length * carattere * 0.68;
            if (e.attrs['text-anchor'] === 'start') assert.ok(forma.larghezza - x >= serve, `${nome}: poco spazio a destra per ${testoDi(e.figli[0])} (${(forma.larghezza - x).toFixed(0)} su ${serve.toFixed(0)})`);
            if (e.attrs['text-anchor'] === 'end') assert.ok(x >= serve, `${nome}: poco spazio a sinistra per ${testoDi(e.figli[0])} (${x.toFixed(0)} su ${serve.toFixed(0)})`);
        }
        // le dimensioni dei caratteri dichiarate qui sono quelle dei fogli di stile
        const css = docs(nome === 'piccolo' ? 'style-public-card.css' : 'style-profile.css');
        assert.match(css, new RegExp(`\\.pers-radar-et \\{[^}]*font: 900 ${carattere}px`), `${nome}: la grandezza del carattere nello stile`);
    }
    assert.ok(G.FORME.piccolo.larghezza > G.FORME.piccolo.altezza);
});

test('i valori stanno tra 0 e 100: oltre si fermano al bordo, e i vertici dell\'area stanno sugli assi', () => {
    const svg = disegna([150, -20, 50, 50, 50, 50]);
    const area = con(svg, 'pers-radar-area')[0];
    const forma = G.FORME.grande;
    const punti = area.attrs.points.split(' ').map(p => p.split(',').map(Number));
    // il primo asse è in alto: x = centro, y sopra il centro di (raggio) al massimo; il secondo valore (-20) cade al centro
    assert.equal(punti[0][0], forma.cx);
    assert.equal(punti[0][1], forma.cy - forma.raggio);
    assert.deepEqual(punti[1], [forma.cx, forma.cy]);
});

test('il testo entra solo come testo, mai come HTML', () => {
    const src = docs('personalita-grafico.js');
    for (const vietato of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) assert.ok(!src.includes(vietato), vietato);
    assert.match(src, /createElementNS\(SVG_NS/);
    // nomi pericolosi non diventano markup
    const assi = [{ nome: '<img src=x onerror=alert(1)>' }, ...Personalita.ASSI.slice(1)];
    const svg = G.radar(assi, null, { documento: documentoFinto(), Personalita });
    const prima = con(svg, 'pers-radar-et')[0];
    assert.equal(prima.figli[0].figli[0].nodeType, 3, 'è un nodo di testo');
});

test('ogni classe del diagramma ha il suo stile nel profilo e nella pagina pubblica', () => {
    const svg = G.radar(Personalita.ASSI, [50, 50, 50, 50, 50, 50], { documento: documentoFinto(), Personalita });
    const usate = new Set(tutti(svg, () => true).flatMap(classi).filter(c => c.startsWith('pers-radar-')));
    assert.deepEqual([...usate].sort(), ['pers-radar-anello', 'pers-radar-area', 'pers-radar-asse', 'pers-radar-et', 'pers-radar-media', 'pers-radar-punto', 'pers-radar-val']);
    for (const foglio of ['style-profile.css', 'style-public-card.css']) {
        const css = docs(foglio);
        for (const c of usate) {
            if (c === 'pers-radar-val' && foglio === 'style-public-card.css') continue;       // nella carta i numeri non ci sono
            assert.ok(css.includes(`.${c}`), `${foglio}: manca .${c}`);
        }
        assert.ok(css.includes('.pers-radar'), `${foglio}: manca .pers-radar`);
    }
    assert.ok(docs('style-public-card.css').includes('.pers-radar-piccolo') || docs('style-public-card.css').includes('.pp-pers-grafico .pers-radar'), 'la forma piccola');
});
