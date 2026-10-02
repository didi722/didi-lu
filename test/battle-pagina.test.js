'use strict';
// battle.html: gli elementi che gli script cercano per id ci sono, e HTML, CSS e battle-layout.js
// parlano delle stesse cose (modalità, misure del tavolo, aree della griglia).
// Non guarda come viene la pagina: per quello serve un browser.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leggi = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');
const html = leggi('battle.html');
const css = leggi('style-battle.css');
const layout = leggi('battle-layout.js');
const idInHtml = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const classiInHtml = new Set([...html.matchAll(/\bclass="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));

// id cercati da uno script: $('x'), getElementById('x') e i modelli $(`x-${lato}`) / ($`x-${l}`) per p1 e p2
function idCercati(sorgente) {
    const trovati = new Set();
    for (const m of sorgente.matchAll(/(?:\$|getElementById)\(\s*'([\w-]+)'\s*\)/g)) trovati.add(m[1]);
    for (const m of sorgente.matchAll(/(?:\$|getElementById)\(\s*`([\w-]+)-\$\{\w+\}`\s*\)/g)) {
        trovati.add(`${m[1]}-p1`);
        trovati.add(`${m[1]}-p2`);
    }
    return trovati;
}

// Creati dagli script stessi (o da Showdown: il suo tooltip), non scritti in battle.html
const CREATI_DAGLI_SCRIPT = new Set(['condizioni-p1', 'condizioni-p2', 'tooltipwrapper']);

test('ogni id che gli script cercano esiste in battle.html', () => {
    for (const file of ['battle-ui.js', 'battle-extra.js', 'battle-layout.js']) {
        const cercati = idCercati(leggi(file));
        assert.ok(cercati.size > 0, `${file}: non ho trovato nessun id, il test è da aggiornare`);
        for (const id of cercati) {
            if (CREATI_DAGLI_SCRIPT.has(id)) continue;
            assert.ok(idInHtml.has(id), `${file} cerca #${id}, che battle.html non ha`);
        }
    }
});

test('le condizioni dei lati sono create da battle-extra.js (nella colonna del player)', () => {
    const extra = leggi('battle-extra.js');
    assert.match(extra, /id="condizioni-\$\{lato\}"/);
    assert.match(extra, /getElementById\(`condizioni-\$\{lato\}`\)/);
});

test('il layout "una schermata": HTML, CSS e battle-layout.js usano le stesse modalità', () => {
    // la modalità la scrive battle-layout.js, e la riga nell'<head> evita il lampo del layout a colonna
    assert.match(layout, /setAttribute\('data-modo', 'fit'\)/);
    assert.match(layout, /setAttribute\('data-modo', 'scorri'\)/);
    assert.match(html, /setAttribute\('data-modo', 'fit'\)/);
    // il CSS conosce 'fit' e il resto è il layout a colonna
    assert.match(css, /html\[data-modo="fit"\] \.scala/);
    assert.match(css, /html\[data-modo="fit"\] \.tavolo/);
    assert.ok(!/data-modo="scorri"/.test(css), 'il layout a colonna è quello di base: niente regole solo per "scorri"');
});

test('battle-layout.js è caricato prima del modulo, dopo il markup', () => {
    const iLayout = html.indexOf('<script src="battle-layout.js"></script>');
    const iUi = html.indexOf('<script type="module" src="battle-ui.js"></script>');
    assert.ok(iLayout > html.indexOf('id="scala"'), 'battle-layout.js deve stare dopo il markup che misura');
    assert.ok(iLayout > 0 && iUi > iLayout);
});

test('le misure del tavolo stanno nel CSS e sono usate', () => {
    const radice = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/:root\s*\{([^}]*)\}/)[1];   // senza commenti: ce n'è uno con {id}
    for (const v of ['--w-lato', '--w-console', '--w-log', '--h-comandi', '--h-comandi-doppio']) {
        assert.ok(radice.includes(`${v}:`), `${v} manca in :root`);
        assert.ok(css.split(`var(${v})`).length > 1, `${v} non è usata`);
    }
});

test('ogni area della griglia del tavolo ha il suo elemento', () => {
    const aree = {
        hub: '#link-hub', servizi: '.servizi', cons: '.console', p1: '.lato.p1', p2: '.lato.p2', log: '.colonna-log'
    };
    const usate = new Set([...css.matchAll(/grid-template-areas:([^;]*);/g)].flatMap(m => [...m[1].matchAll(/"([^"]*)"/g)].flatMap(r => r[1].split(/\s+/))));
    assert.deepEqual([...usate].sort(), Object.keys(aree).sort());
    for (const [area, selettore] of Object.entries(aree)) {
        assert.match(css, new RegExp(`${selettore.replace(/[.#]/g, '\\$&')}\\s*\\{[^}]*grid-area:\\s*${area}\\b`), `${selettore} dovrebbe stare nell'area "${area}"`);
        const nome = selettore.split('.').pop();
        if (selettore.startsWith('#')) assert.ok(idInHtml.has(selettore.slice(1)), selettore);
        else assert.ok(classiInHtml.has(nome) || ['lato'].includes(nome) || html.includes(`class="lato`), `${selettore} non è in battle.html`);
    }
});

test('il cabinato con la plancia dei comandi non c\'è più', () => {
    for (const vecchio of ['cab-plancia', 'cab-leva', 'cab-gettone', 'class="cabinato"', 'class="sotto"', 'class="arena"']) {
        assert.ok(!html.includes(vecchio), `battle.html ha ancora ${vecchio}`);
    }
    for (const vecchio of ['.cab-plancia', '.cab-leva', '.cab-gettone', '.cabinato', '.arena', '.sotto ']) {
        assert.ok(!css.includes(vecchio), `style-battle.css ha ancora ${vecchio}`);
    }
});

test('i comandi stanno dentro la console, subito sotto lo schermo', () => {
    const console_ = html.slice(html.indexOf('<section class="console"'), html.indexOf('<aside class="lato p2"'));
    assert.ok(console_.indexOf('id="palco"') > 0);
    assert.ok(console_.indexOf('id="comandi"') > console_.indexOf('id="cab-campo"'));
    assert.ok(console_.indexOf('id="cab-campo"') > console_.indexOf('id="palco"'));
});

test('il CSS ha le parentesi graffe in pari', () => {
    let livello = 0;
    for (const c of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
        if (c === '{') livello++;
        if (c === '}') livello--;
        assert.ok(livello >= 0, 'una } di troppo');
    }
    assert.equal(livello, 0);
});

// ---------- modifiche al simulatore: layout, comandi, pausa tra set ----------
const ui = leggi('battle-ui.js');

test('chi gioca sta sempre a sinistra: battle-ui.js scrive body.vista-p2 e il CSS scambia le colonne', () => {
    assert.match(ui, /classList\.toggle\('vista-p2', mioLato === 'p2'\)/);
    assert.match(css, /body\.vista-p2 \.lato\.p1\s*\{[^}]*grid-area:\s*p2/);
    assert.match(css, /body\.vista-p2 \.lato\.p2\s*\{[^}]*grid-area:\s*p1/);
    // la direzione delle colonne non deve battere quella del layout "una schermata" (colonna)
    assert.match(css, /:where\(body\.vista-p2\) \.lato\.p1\s*\{\s*flex-direction:\s*row-reverse/);
});

test('il pulsante "Undo this turn" è sempre nel layout (nascosto, non assente): il testo non si sposta alla seconda mossa', () => {
    assert.match(ui, /class: 'btn secondario piccolo' \+ \(p\.bozza\.some\(s => s !== 'pass'\) \? '' : ' nascosto'\)/);
    assert.match(css, /\.btn\.nascosto\s*\{\s*visibility:\s*hidden/);
});

test('con un solo player la barra col nome sparisce e lo stato dell\'avversario è un adesivo staccato', () => {
    assert.match(css, /\.comandi:not\(\.doppio\) \.pannello-testa\s*\{[^}]*position:\s*absolute/);
    assert.match(css, /\.comandi \{[^}]*position:\s*relative/);
    assert.match(ui, /stato\.dataset\.stato = /);
});

test('schermo intero: il bottone è in battle.html e lo gestisce battle-layout.js', () => {
    assert.ok(idInHtml.has('btn-schermo-intero'));
    assert.match(layout, /requestFullscreen/);
    assert.match(layout, /fullscreenchange/);
    assert.match(layout, /SCALA_MAX_INTERO/);
    assert.match(css, /\.btn-schermo-intero\[aria-pressed="true"\] \.ico-entra/);
});

test('l\'insegna sopra lo schermo scrive formato, match e tabellone dei set', () => {
    for (const classe of ['ins-formato', 'ins-match', 'ins-tabellone', 'ins-punti', 'ins-set']) {
        assert.ok(ui.includes(classe), `battle-ui.js non scrive .${classe}`);
        assert.ok(css.includes(`.${classe}`), `style-battle.css non conosce .${classe}`);
    }
});

test('tra un set e l\'altro il cartello ha il conto alla rovescia e il tasto per proseguire', () => {
    assert.match(ui, /const PAUSA_TRA_SET = \d+/);
    assert.ok(!/setTimeout\(avviaProssimaScena, 2500\)/.test(ui), 'la pausa fissa da 2,5 s non deve tornare');
    assert.match(ui, /`Set \$\{prossimoSet\} starts in \$\{pausaSet\.secondi\} s\.`/);
    assert.match(ui, /onclick: avviaProssimaScena/);
});

test('i tooltip stanno dentro la finestra e quello della colonna si apre accanto alla colonna', () => {
    const extra = leggi('battle-extra.js');
    assert.match(extra, /P\.placeTooltip = function/);
    assert.match(extra, /tooltipAccanto\(li\)/);
    assert.match(extra, /tt-compatto/);
    assert.match(css, /#tooltipwrapper \.tooltip:has\(\.tt-compatto\)/);
});
