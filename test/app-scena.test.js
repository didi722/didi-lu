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

test('le scene del menù: una per voce, ognuna col suo cielo e le sue figure; Play è un\'immagine sola (Mega Charizard Y contro Mega Lucario), senza effetti da CSS', () => {
    assert.deepEqual(Object.keys(S.SCENE), A.VOCI.map(v => v.id));
    for (const [id, sc] of Object.entries(S.SCENE)) {
        assert.match(sc.cielo, /^cielo-[a-z]+$/, id);
        assert.ok(sc.sotto, id);
        assert.ok(sc.eroi.length >= 1 || sc.arte, `${id}: figure o immagine`);
        if (sc.fx) assert.ok(S.EFFETTI[sc.fx], `${id}: effetto ${sc.fx}`);
    }
    assert.equal(new Set(Object.values(S.SCENE).map(sc => sc.cielo)).size, A.VOCI.length, 'ogni scena ha un cielo diverso');
    assert.deepEqual(S.SCENE.play.eroi, []);
    assert.equal(S.SCENE.play.fx, undefined, 'niente fulmini, onde d\'urto e simili: la scena è l\'immagine');
    assert.equal(S.SCENE.play.arte, 'immagini/app/scena-play.webp');
    assert.equal(S.SCENE.trainers.eroi.length, 2, 'Trainers: due allenatori, niente podio');
    assert.deepEqual(S.SCENE.trainers.eroi.map(e => e.prova), ['trainers-1', 'trainers-2'], 'e le loro immagini proprie');
    assert.deepEqual(Object.keys(S.LOCANDINE), ['ranked', 'unranked', 'cpu']);
    for (const l of Object.values(S.LOCANDINE)) assert.ok(S.EFFETTI[l.fx] && l.eroi.length >= 1);
    // l'immagine di Play c'è, è un WebP con trasparenza e non pesa troppo
    const f = path.join(__dirname, '..', 'docs', S.SCENE.play.arte);
    const buf = fs.readFileSync(f);
    assert.equal(buf.toString('latin1', 0, 4), 'RIFF');
    assert.equal(buf.toString('latin1', 8, 12), 'WEBP');
    assert.ok(buf.length < 450 * 1024, 'peso: ' + buf.length);
    assert.ok(buf.includes(Buffer.from('ALPH')) || buf.includes(Buffer.from('VP8L')), 'con trasparenza');
});

test('htmlEroi / htmlScintille / htmlScena: le figure col loro posto (se non arrivano spariscono), le scintille sempre le stesse, la scena a strati', () => {
    assert.equal(S.ARTE(25), 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/25.png');
    const eroi = S.htmlEroi(S.SCENE.box);
    assert.equal((eroi.match(/<img class="gx-eroe e-(sx|dx|cn)"/g) || []).length, 3);
    assert.match(eroi, /alt="Garchomp" src="https:\/\/raw\.githubusercontent\.com\/[^"]+\/445\.png" onerror="this\.style\.display='none'"/);
    assert.equal(S.htmlEroi(S.SCENE.play), '', 'Play non ha figure: è un\'immagine');
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
    // gli effetti: niente fulmini, onde d'urto, urti né linee di velocità (erano ridicoli)
    assert.deepEqual(Object.keys(S.EFFETTI).sort(), ['aure', 'cuori', 'griglia', 'palla', 'radar', 'sole']);
    assert.doesNotMatch(Object.values(S.EFFETTI).join(''), /folgori|gx-onda|gx-impatto|gx-linee/);
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
    assert.ok(sel.length >= 50, 'regole trovate: ' + sel.length);
    for (const s of sel) for (const x of s.split(',')) assert.match(x.trim(), /^html\.app[\s.:\[]/, `regola che tocca il sito intero: "${x.trim()}"`);
    assert.doesNotMatch(css, /\.gx-eroe[^{]*\{[^}]*animation:/, 'le figure stanno ferme');
    assert.doesNotMatch(css, /\d{3,}vmax/, 'nessun livello gigante');
    for (const m of css.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n?\}(?=\n|$)/g)) assert.doesNotMatch(m[2], /\b(left|top|width|height|margin|background-position):/, `@keyframes ${m[1]} anima una misura`);
    for (const c of ['cielo-blu', 'cielo-viola', 'cielo-tramonto', 'cielo-notte', 'cielo-oro', 'cielo-rosa', 'cielo-tech', 'gx-cielo', 'gx-raggi', 'gx-nuvole', 'gx-scintille', 'gx-eroi', 'gx-eroe',
        'gx-aura-l', 'gx-aura-r', 'gx-palla', 'gx-radar', 'gx-sole', 'gx-cuori', 'gx-griglia', 'gx-scansione', 'gx-vignetta', 'pr-p-ranked', 'pr-p-unranked', 'pr-p-cpu', 'e-ray', 'e-pika', 'e-evee', 'e-pory']) assert.ok(css.includes('.' + c), `app-scena.css non conosce ${c}`);
    assert.doesNotMatch(css, /\.gx-podio|\.gx-riflettore|\.gx-folgori|\.gx-onda|\.gx-impatto|\.gx-linee/, 'niente podio, riflettori, fulmini, onde d\'urto, urti né linee di velocità');
    assert.doesNotMatch(css, /\.gx-cielo::after/, 'niente striscia obliqua: faceva una riga diagonale tra il giocatore e la scena');
    // i fogli e gli script li carica l'app (app.js): il menù e Play
    assert.deepEqual(A.SCRIPT_PAGINE['practice.html'], ['app-scena.js', 'app-practice.js']);
    assert.deepEqual(A.FOGLI_SCENA, ['practice.html']);
});
