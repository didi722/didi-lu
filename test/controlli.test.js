'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../docs/controlli.js');

const doc = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
const opt = (index, testo, extra = {}) => ({ tagName: 'OPTION', index, textContent: testo, disabled: false, parentNode: { disabled: false }, ...extra });

test('vociDi: le opzioni di un select, anche dentro i gruppi, con il testo ripulito e le disabilitate segnate', () => {
    const select = {
        children: [
            opt(0, '  Category…  '),
            { tagName: 'OPTGROUP', label: 'Singles', disabled: false, children: [opt(1, 'OU'), opt(2, 'UU', { disabled: true })] },
            { tagName: 'OPTGROUP', label: 'Locked', disabled: true, children: [opt(3, 'Ubers', { parentNode: { disabled: true } })] },
            { tagName: 'OPTION', index: 4, textContent: 'Monotype\n  Ghost', disabled: false, parentNode: select0() }
        ]
    };
    function select0() { return { disabled: false }; }
    const v = C.vociDi(select);
    assert.deepEqual(v.map(x => x.testo), ['Category…', 'OU', 'UU', 'Ubers', 'Monotype Ghost']);
    assert.deepEqual(v.map(x => x.gruppo), [null, 'Singles', 'Singles', 'Locked', null]);
    assert.deepEqual(v.map(x => x.disabilitata), [false, false, true, true, false]);
    assert.deepEqual(v.map(x => x.indice), [0, 1, 2, 3, 4]);
});

test('cercaPerIniziali: scrivendo si va alla voce che inizia così, saltando le disabilitate e ripartendo dall\'inizio', () => {
    const voci = [
        { testo: 'Alpha', disabilitata: false }, { testo: 'Beta', disabilitata: true },
        { testo: 'Bravo', disabilitata: false }, { testo: 'Brass', disabilitata: false }
    ];
    assert.equal(C.cercaPerIniziali(voci, 'b', -1), 2, 'la disabilitata Beta non conta');
    assert.equal(C.cercaPerIniziali(voci, 'br', 2), 3, 'si va alla successiva dopo quella attuale');
    assert.equal(C.cercaPerIniziali(voci, 'br', 3), 2, 'in fondo si riparte dall\'inizio');
    assert.equal(C.cercaPerIniziali(voci, 'z', -1), -1);
    assert.equal(C.cercaPerIniziali(voci, '', -1), -1);
    assert.equal(C.cercaPerIniziali(voci, 'AL', -1), 0, 'senza badare alle maiuscole');
});

test('prossima: frecce su e giù saltano le voci spente e si fermano ai bordi', () => {
    const voci = [{ disabilitata: false }, { disabilitata: true }, { disabilitata: true }, { disabilitata: false }, { disabilitata: true }];
    assert.equal(C.prossima(voci, 0, 1), 3);
    assert.equal(C.prossima(voci, 3, -1), 0);
    assert.equal(C.prossima(voci, 3, 1), 3, 'dopo l\'ultima abilitata non c\'è altro: resta ferma');
    assert.equal(C.prossima(voci, 0, -1), 0);
});

test('i tasti in più (campanella, battaglie, Team Builder, New format) sono tutti nel dock e non hanno più una posizione fissa propria', () => {
    for (const f of ['box.html', 'formats.html', 'matches.html', 'hub.html', 'index.html', 'players.html', 'profile.html', 'rules.html', 'stats.html']) {
        const h = doc(f);
        assert.match(h, /href="controlli\.css"/, `${f}: foglio dei controlli`);
        assert.match(h, /<script src="controlli\.js"><\/script>/, `${f}: script dei controlli`);
    }
    const css = doc('style-box.css') + doc('style-formats.css');
    assert.doesNotMatch(css, /\.btn-floating-admin\s*\{[^}]*position:\s*fixed/, 'il tasto del Box non è più fisso in un angolo');
    // il tasto + del Box che importava solo da Showdown non esiste più: l'import sta nel Team Builder
    const box = doc('box.html');
    assert.doesNotMatch(box, /class="btn-floating-admin"/);
    assert.match(box, /tb-btn-import|tbApriShowdown/);
});

test('il suono sta nella barra del titolo come "chip" e il tasto tondo fisso non c\'è più', () => {
    const css = doc('temi.css');
    assert.match(css, /body\.nb \.top-bar > \.music-btn\s*\{/);
    assert.match(css, /content:\s*"SOUND ON"/);
    assert.match(css, /content:\s*"SOUND OFF"/);
    assert.doesNotMatch(css, /body\.pg-box \.music-btn/);
});

test('vociDi: la spiegazione di una voce (data-desc) viaggia con la voce e viene mostrata nel fumetto', () => {
    const select = { children: [opt(0, 'Rough Skin', { dataset: { desc: 'Chi la tocca perde 1/8 dei PS.' } }), opt(1, 'Sand Veil')] };
    const v = C.vociDi(select);
    assert.equal(v[0].desc, 'Chi la tocca perde 1/8 dei PS.');
    assert.equal(v[1].desc, '');
    assert.match(doc('controlli.css'), /\.ts-fumetto \{/);
});
