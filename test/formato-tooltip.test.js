'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../docs/formato-tooltip.js');

const doc = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

test('mappa dei regolamenti: per id e per categoria, in minuscolo, saltando i nodi vuoti', () => {
    const m = T.costruisciMappaRegolamenti({ AbC: { categoria: 'Gen9 OU', x: 1 }, vuoto: null, solo: { y: 2 } });
    assert.equal(m.abc.x, 1);
    assert.equal(m['gen9 ou'].x, 1);
    assert.equal(m.solo.y, 2);
    assert.equal(m.vuoto, undefined);
    assert.deepEqual(T.costruisciMappaRegolamenti(null), {});
});

test('riepilogo: titolo, descrizione, griglia del formato e clausole, con il testo di chi scrive protetto', () => {
    const html = T.generaRiepilogoFormatoHtml('OU <b>', {
        descrizioneBreve: 'Niente "leggendari" & co',
        strutturaSito: 'custom', battleStyle: 'singles', genRuleValue: 9, baseTier: 'OU', generationalMechanics: false,
        restrizioni: { items: { 'Focus Sash': { mode: 'BANNED' } }, species: { x: { mode: 'SPECIFIC', operator: 'between', min: 1, max: 3 } } }
    });
    assert.match(html, /<div class="frt-title">OU &lt;b&gt;<\/div>/);
    assert.match(html, /Niente &quot;leggendari&quot; &amp; co/);
    assert.match(html, /frt-cell critical/, 'meccaniche generazionali spente = cella critica');
    assert.match(html, /frt-badge banned">Banned/);
    assert.match(html, /frt-badge specific">1 - 3/);
    assert.match(html, /Clauses &amp; Restrictions|Clauses & Restrictions/);
});

test('formato senza regolamento: il messaggio vuoto, nello stesso fumetto', () => {
    assert.match(T.generaRiepilogoFormatoHtml('X', null), /frt-header[\s\S]*No configurations found/);
    assert.match(T.generaRiepilogoFormatoHtml('X', {}), /No description provided/);
});

test('Hub e Index usano lo stesso modulo e nessuna delle due ha più la copia del tooltip', () => {
    for (const f of ['hub.html', 'index.html']) {
        const h = doc(f);
        assert.match(h, /<script src="formato-tooltip\.js"><\/script>/, f);
        assert.match(h, /href="formato-tooltip\.css"/, f);
        assert.doesNotMatch(h, /function generaRiepilogoFormatoHtml|function posizionaTooltipFormato|DIZIONARIO_TERMINI_FORMATO =/, `${f}: copia locale`);
    }
    // l'Index non ridefinisce lo stile del fumetto (era blu): resta solo quello condiviso
    assert.doesNotMatch(doc('style-index.css'), /\.format-rules-tooltip\s*\{|\.frt-title\s*\{/);
});
