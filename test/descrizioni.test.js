'use strict';
// descrizioni.js: la spiegazione di mosse, strumenti e abilità nel Team Builder. I dati di Showdown non portano più i testi
// (shortDesc / desc): senza la tabella del sito (docs/descrizioni.json) liste e fumetti dicevano "No description available".
// In più: il fumetto in hover non compare subito (se ne aprirebbero a decine muovendo il mouse).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../docs/descrizioni.js');
const { caricaSim } = require('./ayuda-sim.js');

const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');
const box = docs('box.html');

const tabella = {
    mosse: { earthquake: ['Hits adjacent Pokemon. Double damage on Dig.', 'Damage doubles if the target is using Dig.'], splash: ['Does nothing.'] },
    strumenti: { rockyhelmet: ['If holder is hit by a contact move, the attacker loses 1/6 of its max HP.'] },
    abilita: { roughskin: ['Pokemon making contact lose 1/8 of their max HP.', 'Pokemon making contact lose 1/8 of their maximum HP, rounded down.'] }
};

test('breve: il testo di Showdown se c\'è, altrimenti quello della tabella; vuoto se non c\'è nessuno dei due', () => {
    assert.equal(D.breve(tabella, 'mossa', 'earthquake', { shortDesc: 'Suo testo.' }), 'Suo testo.');
    assert.equal(D.breve(tabella, 'mossa', 'earthquake', { desc: 'Solo il lungo.' }), 'Solo il lungo.');
    assert.equal(D.breve(tabella, 'mossa', 'earthquake', {}), 'Hits adjacent Pokemon. Double damage on Dig.', 'i dati di Showdown senza testi');
    assert.equal(D.breve(tabella, 'mossa', 'earthquake', null), 'Hits adjacent Pokemon. Double damage on Dig.', 'senza nemmeno i dati');
    assert.equal(D.breve(tabella, 'oggetto', 'rockyhelmet', { name: 'Rocky Helmet' }), 'If holder is hit by a contact move, the attacker loses 1/6 of its max HP.');
    assert.equal(D.breve(tabella, 'abilita', 'roughskin', {}), 'Pokemon making contact lose 1/8 of their max HP.');
    assert.equal(D.breve(tabella, 'mossa', 'nonesiste', {}), '');
    assert.equal(D.breve(null, 'mossa', 'earthquake', {}), '', 'la tabella non è arrivata');
});

test('breve: l\'id si normalizza (maiuscole, spazi, trattini) e le voci inventate non pescano dal prototipo', () => {
    assert.equal(D.breve(tabella, 'oggetto', 'Rocky Helmet', {}), 'If holder is hit by a contact move, the attacker loses 1/6 of its max HP.');
    assert.equal(D.breve(tabella, 'abilita', 'Rough-Skin', {}).slice(0, 7), 'Pokemon');
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '']) assert.equal(D.breve(tabella, 'mossa', id, {}), '', id);
    assert.equal(D.voce(tabella, 'tipoSconosciuto', 'earthquake'), null);
});

test('completa: il testo lungo se non supera 260 caratteri, altrimenti il breve', () => {
    assert.equal(D.completa(tabella, 'mossa', 'earthquake', {}), 'Damage doubles if the target is using Dig.');
    assert.equal(D.completa(tabella, 'mossa', 'splash', {}), 'Does nothing.', 'senza testo lungo si legge il breve');
    const lungo = 'x'.repeat(D.LUNGA_MAX + 1);
    assert.equal(D.completa(tabella, 'mossa', 'earthquake', { shortDesc: 'Corto.', desc: lungo }), 'Corto.');
    assert.equal(D.completa(tabella, 'mossa', 'earthquake', { shortDesc: 'Corto.', desc: 'Medio.' }), 'Medio.');
    assert.equal(D.completa(tabella, 'mossa', 'earthquake', { desc: lungo }), lungo, 'se c\'è solo il lungo, quello');
    assert.equal(D.completa(tabella, 'oggetto', 'nonesiste', {}), '');
});

test('carica: la tabella si legge una volta sola; se il file manca o è rotto si prosegue senza e la volta dopo si riprova', async () => {
    // (un modulo nuovo per ogni prova: la promessa è tenuta in memoria)
    const fresco = () => { delete require.cache[require.resolve('../docs/descrizioni.js')]; return require('../docs/descrizioni.js'); };
    let letture = 0;
    const A = fresco();
    const ok = () => { letture++; return Promise.resolve(tabella); };
    assert.deepEqual(await A.carica(ok), tabella);
    assert.deepEqual(await A.carica(ok), tabella);
    assert.equal(letture, 1);

    const B = fresco();
    assert.equal(await B.carica(() => Promise.reject(new Error('rete'))), null);
    assert.equal(await B.carica(() => Promise.resolve({ mosse: {} })), null, 'un file a metà non vale (e poi si riprova)');
    assert.deepEqual(await B.carica(() => Promise.resolve(tabella)), tabella, 'ora il file c\'è');
    const C = fresco();
    assert.equal(await C.carica(() => Promise.resolve(null)), null);
    fresco();
});

test('docs/descrizioni.json è aggiornato: ha il testo di ogni mossa, strumento e abilità del simulatore del sito', async () => {
    const { sim } = await caricaSim();
    const json = JSON.parse(docs('descrizioni.json'));
    assert.equal(json.v, 1);
    const pulisci = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    for (const [elenco, chiave] of [[sim.Dex.moves.all(), 'mosse'], [sim.Dex.items.all(), 'strumenti'], [sim.Dex.abilities.all(), 'abilita']]) {
        let n = 0;
        const conTesto = new Set(elenco.filter(o => o.exists && (pulisci(o.shortDesc) || pulisci(o.desc))).map(o => o.id));
        const visti = new Set();
        for (const o of elenco) {
            if (!o.exists) continue;
            const breve = pulisci(o.shortDesc) || pulisci(o.desc);
            // (più voci con lo stesso id, come Hidden Power di ogni tipo: conta quella che ha il testo)
            if (!breve) { if (!conTesto.has(o.id)) assert.ok(!(o.id in json[chiave]), `${chiave}.${o.id} non ha testo`); continue; }
            if (visti.has(o.id)) continue;
            visti.add(o.id);
            n++;
            assert.equal(json[chiave][o.id] && json[chiave][o.id][0], breve, `${chiave}.${o.id}`);
            const lunga = pulisci(o.desc);
            if (lunga && lunga !== breve && lunga.length <= D.LUNGA_MAX) assert.equal(json[chiave][o.id][1], lunga, `${chiave}.${o.id} (lungo)`);
            else assert.equal(json[chiave][o.id].length, 1, `${chiave}.${o.id} non ha un testo lungo da tenere`);
        }
        assert.equal(Object.keys(json[chiave]).length, n, `${chiave}: nessuna voce in più`);
        assert.ok(n > 300, `${chiave}: ${n}`);
    }
    // le voci che il Team Builder usa di più
    for (const [t, id] of [['mosse', 'drainpunch'], ['mosse', 'earthquake'], ['strumenti', 'rockyhelmet'], ['strumenti', 'choicescarf'], ['abilita', 'roughskin'], ['abilita', 'levitate']]) {
        assert.ok(json[t][id] && json[t][id][0], `${t}.${id}`);
    }
});

test('box.html: le spiegazioni passano dalla tabella del sito e nessun punto legge solo i testi di Showdown', () => {
    assert.match(box, /<script src="consigli\.js"><\/script>\s*<script src="descrizioni\.js"><\/script>/);
    assert.match(box, /tbDescrizioni = await Descrizioni\.carica\(\)/, 'si caricano all\'apertura del Team Builder');
    // le sole due letture dirette di shortDesc/desc stanno nei due helper (il ripiego se descrizioni.js non c'è)
    const dirette = box.split('\n').filter(r => /shortDesc/.test(r));
    assert.equal(dirette.length, 2, dirette.join('\n'));
    for (const nome of ['tbDescBreve', 'tbTestoDesc']) assert.match(box, new RegExp(`function ${nome}\\(tipo, id, d\\)`));
    // le mosse delle righe, la lista delle mosse, quella degli strumenti, l'abilità e lo strumento sotto i campi, il fumetto
    assert.match(box, /tbDescBreve\('mossa', id, d\)/);
    assert.match(box, /tbDescBreve\('mossa', v\.id, d\)/);
    assert.match(box, /tbDescBreve\('oggetto', v\.id, v\.dati\)/);
    assert.match(box, /tbDescBreve\('abilita', tbToID\(s\.abilita\), ab\)/);
    assert.match(box, /tbDescBreve\('oggetto', s\.oggetto, it\)/);
    assert.match(box, /tbTestoDesc\('abilita', tbToID\(a\), tbDex\.abilities\[tbToID\(a\)\]\)/);
    assert.match(box, /const testo = tbTestoDesc\(tipo, id \|\| tbToID\(nome\), dati\);/);
    assert.match(box, /tbHtmlHint\(tipo, v\.dati \|\| tbDatiPerHint\(tipo, v\.id\), v\.nome \|\| v\.dati\?\.name \|\| v\.id, v\.consigliata, v\.id\)/);
    assert.match(box, /tbHtmlHint\(tipo, dati, dati\.name \|\| id, consigliata, id\)/);
});

test('box.html: i fumetti in hover del Team Builder aspettano un po\' prima di comparire e non restano in attesa dopo l\'uscita del mouse', () => {
    const primo = box.match(/const TB_RITARDO_COACH = (\d+);/), cambio = box.match(/const TB_RITARDO_COACH_CAMBIO = (\d+);/);
    assert.ok(primo && cambio);
    assert.ok(Number(primo[1]) >= 300 && Number(primo[1]) <= 800, `primo fumetto: ${primo[1]}ms`);
    assert.ok(Number(cambio[1]) < Number(primo[1]) && Number(cambio[1]) >= 80, `da un elemento all'altro: ${cambio[1]}ms`);
    const hover = box.match(/function tbHoverCoach\(el, id, costruisci\) \{[\s\S]*?\n\}/);
    assert.ok(hover, 'tbHoverCoach');
    assert.match(hover[0], /setTimeout\(/);
    assert.match(hover[0], /el\.isConnected && el\.matches\(':hover'\)/, 'compare solo se il mouse è ancora lì');
    assert.match(hover[0], /tbCoachAncora\.el === el\) return tbApriCoach/, 'tornando sullo stesso elemento è subito');
    assert.match(box, /function tbChiudiCoachPresto\(id\) \{\s*clearTimeout\(tbHoverTimer\);/);
    assert.match(box, /function tbNascondiTooltip\(id\) \{\s*clearTimeout\(tbTooltipTimer\);\s*if \(id === undefined\) clearTimeout\(tbHoverTimer\);/);
    // tutti i punti in cui un tooltip nasce dal passaggio del mouse usano il ritardo: nessun onmouseenter chiama tbApriCoach direttamente
    assert.doesNotMatch(box, /onmouseenter="tbApriCoach\(/);
    const apri = [...box.matchAll(/tbApriCoach\(/g)].length;
    // solo la funzione stessa, tbHoverCoach (due volte: subito / a ritardo) e tbAggiornaCoach (dopo un click nel fumetto)
    assert.equal(apri, 4, 'chiamate a tbApriCoach');
    for (const coach of ['cov-def', 'cov-off', 'cov-roles']) assert.match(box, new RegExp(`onmouseenter="tbHoverCoach\\(this, '${coach}'`));
    assert.match(box, /function tbApriCoachStat[\s\S]*?tbHoverCoach\(el, id, tbHtmlSpeedTier\)/);
    assert.match(box, /function tbApriCoachDettaglio\(el, id, costruisci\) \{\s*tbHoverCoach\(/);
    // le card del picker avevano già il loro secondo di attesa
    assert.match(box, /function tbProgrammaTooltip[\s\S]*?\}, 1000\);/);
});
