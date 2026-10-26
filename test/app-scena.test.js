'use strict';
// Le scene a tutto schermo (docs/app-scena.js, app-scena.css): il menù principale e le tre locandine di Play sono fatti con lo stesso pezzo.
//   - la parte pura: le descrizioni delle scene, le figure (render di Pokémon HOME), le scintille, gli effetti, l'immagine propria da cercare;
//   - il foglio: le figure stanno ferme, si muovono solo gli effetti (con spostamenti, rotazioni e trasparenza), nessun livello enorme.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/app-scena.js');
const A = require('../docs/app.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

test('le scene del menù: una per voce, ognuna col suo cielo, i suoi effetti e le sue figure; Play è Mega Charizard X contro Mega Lucario', () => {
    assert.deepEqual(Object.keys(S.SCENE), A.VOCI.map(v => v.id));
    for (const [id, sc] of Object.entries(S.SCENE)) {
        assert.match(sc.cielo, /^cielo-[a-z]+$/, id);
        assert.ok(sc.eroi.length >= 1 && sc.sotto, id);
        assert.ok(S.EFFETTI[sc.fx], `${id}: effetto ${sc.fx}`);
    }
    assert.equal(new Set(Object.values(S.SCENE).map(sc => sc.cielo)).size, A.VOCI.length, 'ogni scena ha un cielo diverso');
    assert.deepEqual(S.SCENE.play.eroi.map(e => [e.pkm, e.c]), [[10034, 'e-char'], [10059, 'e-luca']]);
    assert.equal(S.SCENE.trainers.eroi.length, 2, 'Trainers: due allenatori, niente podio');
    assert.deepEqual(S.SCENE.trainers.eroi.map(e => e.prova), ['trainers-1', 'trainers-2'], 'e le loro immagini proprie');
    assert.deepEqual(Object.keys(S.LOCANDINE), ['ranked', 'unranked', 'cpu']);
    for (const l of Object.values(S.LOCANDINE)) assert.ok(S.EFFETTI[l.fx] && l.eroi.length >= 1);
});

test('htmlEroi / htmlScintille / htmlScena: le figure col loro posto (se non arrivano spariscono), le scintille sempre le stesse, la scena a strati', () => {
    assert.equal(S.ARTE(25), 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/25.png');
    const eroi = S.htmlEroi(S.SCENE.play);
    assert.equal((eroi.match(/<img class="gx-eroe e-(char|luca)"/g) || []).length, 2);
    assert.match(eroi, /alt="Mega Lucario" src="https:\/\/raw\.githubusercontent\.com\/[^"]+\/10059\.png" onerror="this\.style\.display='none'"/);
    assert.match(S.htmlEroi(S.SCENE.trainers), /src="immagini\/profile\/\d+\.png" data-prova="trainers-1"/);
    assert.equal(S.htmlEroi(null), '');
    assert.equal(S.htmlScintille(14, 3), S.htmlScintille(14, 3));
    assert.notEqual(S.htmlScintille(14, 3), S.htmlScintille(14, 4));
    assert.equal((S.htmlScintille(14, 3).match(/<i style="--l:\d+%;--z:\d;--d:[\d.]+s;--r:-?[\d.]+s"><\/i>/g) || []).length, 14);
    const h = S.htmlScena(S.SCENE.box, { indice: 1, scintille: 5, immagine: '<img class="gx-immagine">' });
    assert.match(h, /^<span class="gx-sf"><span class="gx-cielo cielo-viola" aria-hidden="true"><\/span><span class="gx-raggi"[^>]*><\/span><span class="gx-nuvole"[^>]*><\/span><span class="gx-scintille"/);
    assert.equal((h.match(/<i style=/g) || []).length, 5);
    assert.match(h, /<span class="gx-eroi">(<img [^>]*>){3}<svg class="gx-fx gx-palla"[\s\S]*<\/svg><\/span><img class="gx-immagine"><span class="gx-vignetta" aria-hidden="true"><\/span><\/span>$/);
    assert.match(S.htmlScena(null), /cielo-blu/, 'senza descrizione c\'è comunque un cielo');
    // gli effetti: Play ha tre folgori (ognuna un suo svg, così lampeggiano da sole), le onde d'urto e l'urto
    assert.equal((S.EFFETTI.folgori.match(/class="gx-fx gx-folgori/g) || []).length, 3);
    assert.match(S.EFFETTI.folgori, /gx-onda[\s\S]*gx-impatto/);
    assert.doesNotMatch(S.EFFETTI.radar, /<animate/, 'il quadrante si muove col CSS, non con SMIL (che ridisegna di continuo)');
    assert.match(S.EFFETTI.cuori, /♥/);
});

test('immagini proprie: due indirizzi (png e webp) e cercaImmagini usa il primo che carica; se nessuno c\'è non succede niente', () => {
    assert.deepEqual(S.proveDi('trainers-1'), ['immagini/app/trainers-1.png', 'immagini/app/trainers-1.webp']);
    const el = n => ({ dataset: { prova: n } });
    const radice = { querySelectorAll: () => [el('a'), el('b')] };
    const caricati = [];
    class Img { set src(v) { this._src = v; setImmediate(() => { if (v === 'immagini/app/a.webp' || v === 'immagini/app/b.png') this.onload(); else this.onerror(); }); } }
    const trovate = [];
    assert.equal(S.cercaImmagini(radice, '.x', (e, src) => trovate.push([e.dataset.prova, src]), { Immagine: Img }), 2);
    return new Promise(ok => setTimeout(() => {
        assert.deepEqual(trovate.sort(), [['a', 'immagini/app/a.webp'], ['b', 'immagini/app/b.png']]);
        assert.equal(S.cercaImmagini(null, '.x', () => {}, { Immagine: Img }), 0);
        ok();
    }, 20));
});

test('app-scena.css: ogni regola riguarda l\'app (html.app…); le figure stanno ferme e gli effetti si muovono solo con spostamenti, rotazioni e trasparenza', () => {
    const css = docs('app-scena.css');
    const sel = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^@\s{}][^{}]*(?=\{)/gm) || [];
    assert.ok(sel.length >= 60, 'regole trovate: ' + sel.length);
    for (const s of sel) for (const x of s.split(',')) assert.match(x.trim(), /^html\.app[\s.:\[]/, `regola che tocca il sito intero: "${x.trim()}"`);
    assert.doesNotMatch(css, /\.gx-eroe[^{]*\{[^}]*animation:/, 'le figure stanno ferme');
    assert.doesNotMatch(css, /\d{3,}vmax/, 'nessun livello gigante');
    for (const m of css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n?\}(?=\n|$)/g)) assert.doesNotMatch(m[2], /\b(left|top|width|height|margin|background-position):/, `@keyframes ${m[1]} anima una misura`);
    for (const c of ['cielo-blu', 'cielo-viola', 'cielo-tramonto', 'cielo-notte', 'cielo-oro', 'cielo-rosa', 'cielo-tech', 'gx-cielo', 'gx-raggi', 'gx-nuvole', 'gx-scintille', 'gx-eroi', 'gx-eroe', 'gx-folgori', 'gx-onda', 'gx-impatto',
        'gx-aura-l', 'gx-aura-r', 'gx-linee', 'gx-palla', 'gx-radar', 'gx-sole', 'gx-cuori', 'gx-griglia', 'gx-scansione', 'gx-vignetta', 'pr-p-ranked', 'pr-p-unranked', 'pr-p-cpu', 'e-char', 'e-luca', 'e-ray', 'e-pika', 'e-evee', 'e-pory']) assert.ok(css.includes('.' + c), `app-scena.css non conosce ${c}`);
    assert.doesNotMatch(css, /\.gx-podio|\.gx-riflettore/, 'niente podio né riflettori');
    // i fogli e gli script li carica l'app (app.js): il menù e Play
    assert.deepEqual(A.SCRIPT_PAGINE['practice.html'], ['app-scena.js', 'app-practice.js']);
    assert.deepEqual(A.FOGLI_SCENA, ['practice.html']);
});
