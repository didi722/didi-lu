'use strict';
// L'avvio di battle.html: il messaggio sul palco finché i moduli (il simulatore pesa 6,6 MB, circa 1 MB compresso) non partono.
// Su una rete lenta, dal telefono, la pagina può metterci più di 6 secondi e poi parte da sola: per questo "non è partita" non si
// dice più dopo 6 secondi ma quando c'è davvero un problema (file://, uno script o un modulo che non si carica) o dopo un minuto.
// Lo script in pagina gira qui con una finestra finta, un orologio a mano e gli eventi "error" sparati a mano.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'battle.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('battagliaPronta'));

function pagina({ protocollo = 'https:' } = {}) {
    const palco = { textContent: 'Loading the battle engine…' };
    const timer = [];
    const ascoltatori = [];
    const finestra = {
        battagliaPronta: false,
        addEventListener: (tipo, f, cattura) => ascoltatori.push({ tipo, f, cattura })
    };
    const contesto = {
        window: finestra, location: { protocol: protocollo },
        document: { getElementById: id => (id === 'testo-palco' ? palco : null) },
        setTimeout: (f, ms) => timer.push({ f, ms }),
        String, Object
    };
    vm.runInNewContext(script, contesto);
    return {
        palco, finestra,
        // passa il tempo: esegue i timer scaduti fino a `ms`
        trascorsi(ms) { timer.filter(t => t.ms <= ms && !t.fatto).forEach(t => { t.fatto = true; t.f(); }); },
        errore(e) { ascoltatori.filter(a => a.tipo === 'error').forEach(a => a.f(e)); },
        ascoltatori
    };
}

test('lo script di avvio c\'è, e ascolta gli errori in cattura (quelli degli script non risalgono alla finestra)', () => {
    assert.ok(script, 'lo script con battagliaPronta in battle.html');
    const p = pagina();
    assert.equal(p.ascoltatori.length, 1);
    assert.equal(p.ascoltatori[0].tipo, 'error');
    assert.equal(p.ascoltatori[0].cattura, true);
});

test('rete lenta: dopo 6 secondi dice che sta ancora caricando (non che non è partita); l\'errore solo dopo un minuto', () => {
    const p = pagina();
    assert.equal(p.palco.textContent, 'Loading the battle engine…');
    p.trascorsi(5999);
    assert.equal(p.palco.textContent, 'Loading the battle engine…');
    p.trascorsi(6000);
    assert.match(p.palco.textContent, /^Still loading/);
    assert.doesNotMatch(p.palco.textContent, /didn't start/);
    p.trascorsi(60000);
    assert.match(p.palco.textContent, /^The battle didn't start\. Open this page from the site/);
});

test('se la pagina parte (battagliaPronta) i messaggi dell\'attesa non scrivono più nulla, nemmeno gli errori che arrivano dopo', () => {
    const p = pagina();
    p.finestra.battagliaPronta = true;
    p.palco.textContent = 'Building a CPU team for gen8doublesou…';
    p.trascorsi(60000);
    p.errore({ target: { tagName: 'SCRIPT', src: 'https://x/y/fiocchi.js' } });
    p.errore({ target: null, message: 'Uncaught SyntaxError: The requested module' });
    assert.equal(p.palco.textContent, 'Building a CPU team for gen8doublesou…');
});

test('uno script che non si carica: lo dice subito, con il nome del file', () => {
    const p = pagina();
    p.errore({ target: { tagName: 'SCRIPT', src: 'https://didi722.github.io/didi-lu/battle-ui.js' } });
    assert.match(p.palco.textContent, /^A script didn't load \(battle-ui\.js\)\. Check your connection or content blocker, then reload the page\.$/);
});

test('un modulo che non si collega (una copia vecchia in cache): lo dice subito, con il motivo e cosa fare', () => {
    const p = pagina();
    p.errore({ target: null, message: "Uncaught SyntaxError: The requested module './cpu-partita.js' does not provide an export named 'meccanicheDelFormato'" });
    assert.match(p.palco.textContent, /^The battle didn't start: SyntaxError: The requested module '\.\/cpu-partita\.js' does not provide an export named 'meccanicheDelFormato'\./);
    assert.match(p.palco.textContent, /Reload the page; if it keeps happening, clear the site's cache\.$/);
});

test('gli altri errori (immagini, script di terzi che non c\'entrano con i moduli) non cambiano il messaggio', () => {
    const p = pagina();
    p.errore({ target: { tagName: 'IMG', src: 'https://x/sprite.png' } });
    p.errore({ target: null, message: 'Uncaught TypeError: x is not a function' });
    assert.equal(p.palco.textContent, 'Loading the battle engine…');
});

test('aperta con doppio clic (file://) i moduli non partono mai: l\'errore storico è subito, senza aspettare', () => {
    const p = pagina({ protocollo: 'file:' });
    assert.match(p.palco.textContent, /^The battle didn't start\. Open this page from the site \(or a local server like Live Server\), not by double-clicking the file\./);
});
