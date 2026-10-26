'use strict';
// Gli Achievements dell'allenatore nella schermata iniziale dell'app (docs/app-achievements.js): un badge per carta, dal più vicino al livello successivo.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../docs/app-achievements.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

// i moduli del sito, ridotti a quello che serve
const moduli = () => ({
    BadgeAllenatore: { scheda: b => ({ id: b.id, nome: b.nome, immagine: 'b/' + b.id + '.png', icona: '🏅', livello: b.livello, classe: b.livello ? ['bronze', 'silver', 'gold', 'platinum'][b.livello - 1] : 'locked', completo: b.livello === 4, bloccato: b.livello === 0, livelli: [], barra: b.livello < 4 ? { etichetta: 'x', valore: 3, obiettivo: 10 } : null, frase: 'Frase ' + b.nome }) },
    BadgeTeam: { perVicinanza: v => v.slice().sort((a, b) => (b.progresso || 0) - (a.progresso || 0)) },
    Titoli: {
        BADGE: [{ id: 'clean', label: 'Clean', icona: '🧹', unita: 'clean wins', steps: [2, 4, 6, 8] }],
        serieAggiornate: (salvati, risultato) => (risultato ? { clean: 5 } : salvati),
        statoSerie: (serie, b) => { const a = serie[b.id] || 0; const livello = b.steps.filter(s => a >= s).length; return { livello, attuale: a, obiettivo: b.steps[Math.min(livello, 3)], completo: livello === 4, progresso: a / 8 }; },
        immagineSerie: (b, liv) => `s/${b.id}-${liv}.png`,
        IMMAGINE_FONDATORE: 'founder.png'
    }
});

test('elenco: i badge del sito più le serie (Clean, Win, SD Streak) ordinati per vicinanza; il fondatore, per i due fondatori, sempre in cima', () => {
    const M = moduli();
    const esito = { lista: [{ id: 'a', nome: 'Alfa', livello: 1, progresso: 0.2 }, { id: 'b', nome: 'Beta', livello: 2, progresso: 0.9 }], risultato: {} };
    const e = A.elenco(esito, {}, 'lukiani', M);
    assert.equal(e.voci[0].tipo, 'fondatore');
    assert.equal(e.voci[0].nome, 'League Founder');
    assert.deepEqual(e.voci.slice(1).map(v => v.id), ['b', 'serie-clean', 'a'], 'prima chi è più vicino al livello dopo');
    assert.equal(e.totale, 3 * 4, 'tre badge, quattro livelli ciascuno (il fondatore non conta)');
    assert.equal(e.sbloccati, 1 + 2 + 2, 'livelli presi: Alfa 1, Beta 2, Clean 2 (5 vittorie di fila su 2 e 4)');
    const altro = A.elenco(esito, {}, 'anna', M);
    assert.notEqual(altro.voci[0].tipo, 'fondatore');
    assert.equal(altro.voci.length, 3);
});

test('elenco: senza le partite vere restano i numeri salvati; senza niente, nessun badge ma nessun errore', () => {
    const M = moduli();
    const e = A.elenco({ lista: [], risultato: null }, { clean: 2 }, 'anna', M);
    assert.equal(e.voci.length, 1);
    assert.equal(e.voci[0].tipo, 'serie');
    assert.equal(e.voci[0].livello, 1, 'dai numeri salvati');
    assert.match(e.voci[0].frase, /more clean wins in a row to unlock Silver/);
    assert.deepEqual(e.voci[0].livelli.map(l => l.stato), ['done', 'next', '', '']);
    const vuoto = A.elenco(null, null, 'anna', M);
    assert.equal(vuoto.voci.length, 1);
    const completa = A.elenco(null, { clean: 8 }, 'anna', M);
    assert.equal(completa.voci[0].completo, true);
    assert.equal(completa.voci[0].barra, null);
    assert.match(completa.voci[0].frase, /Platinum reached: badge complete!/);
});

test('htmlVoce e htmlElenco: la carta ha medaglia, nome, livelli, barra e frase; il testo è ripulito; elenco vuoto lo dice', () => {
    const v = { id: 'x"y', nome: 'Alfa <b>', immagine: 'a.png', icona: '🏅', classe: 'gold', bloccato: false, completo: false, livelli: [{ nome: 'Bronze', classe: 'bronze', soglia: '2', stato: 'done' }, { nome: 'Silver', classe: 'silver', soglia: '4', stato: 'next' }], barra: { valore: 5, obiettivo: 10 }, frase: 'Mancano <3>' };
    const h = A.htmlVoce(v);
    assert.match(h, /class="ach-voce ach-lv-gold" data-badge="x&quot;y"/);
    assert.match(h, /<b class="ach-nome">Alfa &lt;b&gt;<\/b>/);
    assert.match(h, /class="ach-pip ach-bronze done" title="Bronze 2"/);
    assert.match(h, /<span class="ach-barra"><i style="width:50%"><\/i><\/span>/);
    assert.match(h, /Mancano &lt;3&gt;/);
    assert.match(A.htmlVoce({ ...v, bloccato: true, completo: true }), /ach-bloccato ach-completo/);
    assert.doesNotMatch(A.htmlVoce({ ...v, barra: null, livelli: [] }), /ach-barra|ach-pips/);
    assert.match(A.htmlVoce({ ...v, barra: { valore: 99, obiettivo: 10 } }), /width:100%/, 'la barra non esce dal riquadro');
    assert.equal((A.htmlElenco([v, v]).match(/class="ach-voce/g) || []).length, 2);
    assert.match(A.htmlElenco([]), /No badges yet/);
    assert.equal(A.somma({ sbloccati: 5, totale: 12 }), '5 of 12 levels');
});

test('carica: senza i moduli del sito non può andare avanti (lo dice)', async () => {
    await assert.rejects(() => A.carica({}, 'anna'), /badge modules missing/);
});

test('menu.html e il foglio del menù: la finestra degli Achievements sta nella home, sotto html.app', () => {
    const js = docs('app-menu.js');
    assert.match(js, /AppAchievements/);
    const css = docs('app-menu.css');
    const righe = css.split('\n').filter(r => /\.ach-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 8, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app/, r.trim().slice(0, 80));
});
