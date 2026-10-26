'use strict';
// L'app come gioco da telefono: l'interfaccia delle pagine (docs/app-gioco.js), i fogli di stile (app-gioco.css, app-gioco-pagine.css, app-menu.css).
//   - la parte pura: titolo e colore del nastro, iniziale del giocatore, barra che si nasconde;
//   - i fogli in sé: ogni regola sta sotto html.app-shell (o html.app per il menù e le parti comuni) e dentro le condizioni dello schermo da telefono:
//     in una finestra larga (app installata dal computer) e nel browser il sito resta quello di sempre;
//   - il cablaggio: le classi e gli id di cui parlano i fogli e gli script esistono davvero nelle pagine (se una pagina cambia nome, il foglio va aggiornato).
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../docs/app-gioco.js');
const A = require('../docs/app.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = nome => fs.readFileSync(path.join(DOCS, nome), 'utf8');
const senzaCommenti = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// ---------- la parte pura ----------

test('titolo: il nastro porta il nome della tessera del menù; hub e pagina dell\'allenatore hanno il loro; le altre il testo della pagina, ripulito', () => {
    // ogni pagina del menù mostra il nome della sua tessera, qualunque cosa scriva la pagina
    for (const v of A.VOCI) assert.equal(G.titolo('/didi-lu/' + v.href, 'Qualcosa di lungo e diverso'), v.et, v.href);
    assert.equal(G.titolo('/didi-lu/matches.html', 'Season 3'), 'Ranked', 'showdown e classifica stanno sotto Play, ma hanno il loro titolo');
    assert.equal(G.titolo('/didi-lu/hub.html', 'Season hub'), 'Sign up');
    assert.equal(G.titolo('/didi-lu/public.html?player=didi', 'DIDI'), 'Trainer');
    // una pagina senza tessera né titolo suo: il testo scritto dalla pagina (spazi ripuliti), se è ragionevole
    assert.equal(G.titolo('/didi-lu/altra.html', '  Didi\'s \n  Box '), 'Didi\'s Box');
    assert.equal(G.titolo('/didi-lu/altra.html', ''), 'Sant\'Alvise');
    assert.equal(G.titolo('/didi-lu/altra.html', undefined), 'Sant\'Alvise');
    assert.equal(G.titolo('/didi-lu/altra.html', 'x'.repeat(29)), 'Sant\'Alvise', 'troppo lungo per il nastro');
    assert.equal(G.titolo('/didi-lu/altra.html', 'Loading...'), 'Sant\'Alvise', 'la pagina non ha ancora i dati');
    // le pagine del sito che esistono davvero
    for (const p of Object.keys(G.TITOLI)) assert.ok(fs.existsSync(path.join(DOCS, p)), p);
});

test('sottotitolo: Matches (e l\'iscrizione) mostrano accanto al nastro il nome della stagione guardata', () => {
    assert.deepEqual(G.CON_NOME_STAGIONE, ['hub.html']);
    assert.equal(G.sottotitoloDa('  Christmas   Cup '), 'Christmas Cup');
    assert.equal(G.sottotitoloDa(null), '');
    assert.equal(G.sottotitoloDa('Loading...'), '');
    assert.equal(G.sottotitoloDa('x'.repeat(29)), '');
    for (const p of G.CON_NOME_STAGIONE) assert.ok(fs.existsSync(path.join(DOCS, p)), p);
    assert.equal(G.sottotitolo('/didi-lu/matches.html', '  Season   3 '), 'Season 3');
    assert.equal(G.sottotitolo('/didi-lu/matches.html', 'Loading...'), '');
    assert.equal(G.sottotitolo('/didi-lu/matches.html', 'x'.repeat(29)), '');
    assert.equal(G.sottotitolo('/didi-lu/matches.html', ''), '');
    assert.equal(G.sottotitolo('/didi-lu/box.html', 'Season 3'), '');
    for (const p of G.CON_SOTTOTITOLO) assert.ok(fs.existsSync(path.join(DOCS, p)), p);
});

test('coloreDi: il nastro ha il colore della tessera nel menù (la pagina dell\'allenatore con Trainers); l\'iscrizione il verde della lega; le altre pagine il giallo del sito', () => {
    for (const v of A.VOCI) assert.equal(G.coloreDi(v.href), v.colore, v.href);
    assert.equal(G.coloreDi('hub.html'), '#31c489');
    assert.equal(G.coloreDi('practice.html'), A.VOCI.find(v => v.id === 'play').colore);
    assert.equal(G.coloreDi('matches.html'), A.VOCI.find(v => v.id === 'play').colore, 'Matches sta sotto Play');
    assert.equal(G.coloreDi('public.html'), '#ffbd44', 'la pagina pubblica nell\'app non c\'è più (porta a Trainers): niente tessera');
    assert.equal(G.coloreDi('battle.html'), '#ffbd44');
    assert.equal(G.coloreDi('/didi-lu/'), '#ffbd44', 'la radice (le stagioni) nell\'app non ha una tessera');
    assert.deepEqual(Object.keys(G.COLORI), ['hub.html']);
});

test('iniziale: la prima lettera o cifra in maiuscolo, "?" senza nome', () => {
    assert.equal(G.iniziale('didi'), 'D');
    assert.equal(G.iniziale('  àlex'), 'À');
    assert.equal(G.iniziale('7up'), '7');
    assert.equal(G.iniziale('***'), '?');
    assert.equal(G.iniziale(''), '?');
    assert.equal(G.iniziale(undefined), '?');
});

test('avvia: fuori dall\'app (senza app-shell), nel frame del simulatore o senza il resto dell\'app non fa niente', () => {
    const html = { classList: { contains: () => false } };
    const finestra = extra => ({ document: { documentElement: html, body: {} }, ...extra });
    const w = finestra({}); w.self = w; w.top = w;
    assert.equal(G.avvia(w), null, 'nel browser');
    const dentro = { classList: { contains: c => c === 'app-shell' } };
    const f = { document: { documentElement: dentro, body: {} } }; f.self = f; f.top = {};
    assert.equal(G.avvia(f), null, 'in un frame');
    assert.equal(G.avvia({ document: { documentElement: dentro } }), null, 'senza body');
    assert.equal(G.avvia({ document: null }), null);
});

test('ogni pagina del gioco ha la sua classe sul body (pg-...), con cui il foglio la riconosce', () => {
    // le pagine che nell'app esistono (le altre, del solo sito, rimandano al menù)
    const attese = {
        'hub.html': 'pg-hub', 'matches.html': 'pg-matches', 'players.html': 'pg-players', 'stats.html': 'pg-stats', 'box.html': 'pg-box', 'practice.html': 'pg-practice'
    };
    const css = docs('app-gioco-pagine.css');
    for (const [pagina, classe] of Object.entries(attese)) {
        assert.match(docs(pagina), new RegExp(`<body[^>]*class="[^"]*\\b${classe}\\b`), `${pagina}: manca ${classe} sul body`);
        assert.ok(A.haHud(pagina), pagina);
    }
    for (const classe of Object.values(attese)) assert.ok(css.includes(`body.${classe}`), `il foglio non conosce ${classe}`);
    // le pagine del solo sito non hanno più un posto nell'app (né un foglio): chi le apre dal telefono finisce nel menù
    for (const p of A.FUORI_APP) assert.ok(!Object.keys(attese).includes(p), p);
    for (const classe of ['pg-index', 'pg-profile', 'pg-palmares', 'pg-formats', 'pg-rules', 'pg-public']) assert.ok(!css.includes(`body.${classe}`), `${classe}: pagina fuori dall'app`);
});

test('le pagine ridisegnate usano i nomi veri delle loro classi (se una pagina cambia nome, il foglio va aggiornato)', () => {
    const css = senzaCommenti(docs('app-gioco-pagine.css'));
    // il foglio nomina le classi di ogni pagina dopo "body.pg-...": ognuna deve esistere ancora nella pagina, nei suoi script o nei suoi fogli
    const sorgenti = fs.readdirSync(DOCS).filter(f => /\.(html|js|css)$/.test(f) && !/^app-.*\.css$/.test(f)).map(docs).join('\n');
    const perPagina = {};
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
        const pre = m[1].trim();
        if (pre.startsWith('@')) continue;
        const pg = pre.match(/body\.pg-([a-z]+)/);
        if (!pg) continue;
        for (const c of pre.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
            if (/^(gx-|pg-|app)/.test(c[1]) || c[1] === 'nb') continue;
            (perPagina[pg[1]] ||= new Set()).add(c[1]);
        }
    }
    assert.deepEqual(Object.keys(perPagina).sort(), ['box', 'hub', 'matches', 'players', 'practice', 'stats']);
    for (const [pagina, classi] of Object.entries(perPagina)) {
        assert.ok(classi.size >= 5, `${pagina}: classi trovate ${classi.size}`);
        const mancano = [...classi].filter(c => !sorgenti.includes(c));
        assert.deepEqual(mancano, [], `${pagina}: classi che nessun file del sito scrive più`);
    }
    // qualche classe chiave per pagina, senza la quale lo schermo non regge
    const chiave = {
        'players.html': ['trainers-grid', 'trainer-riga', 'trainer-card'], 'stats.html': ['stats-tag', 'stats-griglia', 'carta-dati'],
        'box.html': ['card-header', 'pkm-grid', 'card-actions'], 'hub.html': ['btn-team', 'countdown-main-container'],
        'matches.html': ['hub-main-layout', 'hub-left-column', 'hub-right-column']
    };
    for (const [pagina, classi] of Object.entries(chiave)) {
        const sorg = docs(pagina) + fs.readdirSync(DOCS).filter(f => f.endsWith('.js') && !/^app-/.test(f)).map(docs).join('\n');
        for (const c of classi) {
            assert.ok(sorg.includes(c), `${pagina}: nessun file scrive la classe "${c}"`);
            assert.ok(css.includes(c), `app-gioco-pagine.css non usa più la classe "${c}"`);
        }
    }
});

// ---------- i fogli ----------

function selettori(css) {
    // le virgole dentro le parentesi (:is(a, b)) non separano i selettori
    const t = senzaCommenti(css);
    const out = [];
    for (const m of t.matchAll(/([^{}]+)\{/g)) {
        const pre = m[1].trim();
        if (pre.startsWith('@')) continue;
        if (/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(pre)) continue;
        let livello = 0, da = 0;
        for (let i = 0; i < pre.length; i++) {
            if (pre[i] === '(') livello++;
            else if (pre[i] === ')') livello--;
            else if (pre[i] === ',' && livello === 0) { out.push(pre.slice(da, i).trim()); da = i + 1; }
        }
        out.push(pre.slice(da).trim());
    }
    return out.filter(Boolean);
}
/** Le regole che non stanno dentro nessuna @media */
function fuoriDalleCondizioni(css) {
    const t = senzaCommenti(css);
    let livello = 0;
    const fuori = [];
    for (const m of t.matchAll(/[{}]|[^{}]+/g)) {
        const x = m[0];
        if (x === '{') livello++;
        else if (x === '}') livello--;
        else if (livello === 0 && x.trim() && !x.trim().startsWith('@media')) fuori.push(x.trim().slice(0, 60));
    }
    return fuori;
}

test('app-gioco-pagine.css: ogni regola riguarda l\'app ("html.app-shell") e sta dentro le condizioni dello schermo da telefono: in una finestra larga il sito resta quello di sempre', () => {
    const css = docs('app-gioco-pagine.css');
    const lista = selettori(css);
    assert.ok(lista.length >= 300, 'selettori trovati: ' + lista.length);
    for (const s of lista) {
        assert.match(s, /^(html\.app-shell|html\.gx-dialogo-aperto( body)?$|::view-transition-(old|new|group)\(|\.gx-barra$)/, `regola che tocca il sito intero: "${s}"`);
    }
    // l'unica regola fuori dalle @media nasconde la barra dove non serve (non esiste nemmeno finché l'app non la crea)
    assert.deepEqual(fuoriDalleCondizioni(css), ['.gx-barra']);
    assert.match(css, /\.gx-barra \{ display: none; \}/);
    const medie = [...new Set([...css.matchAll(/@media[^{]+/g)].map(m => m[0].trim()))];
    assert.deepEqual(medie, ['@media (max-width: 900px), (max-height: 520px)', '@media (orientation: landscape) and (max-height: 520px)']);
});

test('app-gioco.css e app-menu.css: ogni regola riguarda l\'app (html.app…); le animazioni si fermano a chi ha scelto "meno movimento"', () => {
    for (const nome of ['app-gioco.css', 'app-menu.css']) {
        const css = docs(nome);
        const lista = selettori(css);
        assert.ok(lista.length >= 40, `${nome}: selettori trovati ${lista.length}`);
        for (const s of lista) assert.match(s, /^html\.app([\s.:\[]|$)/, `${nome}: regola che tocca il sito intero: "${s}"`);
    }
    const comune = docs('app-gioco.css');
    assert.deepEqual([...new Set([...comune.matchAll(/@media[^{]+/g)].map(m => m[0].trim()))], ['@media (prefers-reduced-motion: reduce)']);
    assert.doesNotMatch(docs('app-menu.css'), /@media/, 'il menù non ha condizioni: è una schermata a sé, con misure che seguono lo schermo (--u)');
    // movimento ridotto: le animazioni infinite si fermano
    assert.match(comune, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation(-duration)?:\s*(none|\.01ms|0\.01ms)/);
});

test('le misure e i colori dell\'app sono definiti: --u, i --gx-… e le proprietà del tema; --c lo scrive il menù carta per carta, --i e --n le locandine di Play', () => {
    const fogli = ['app-gioco.css', 'app-gioco-pagine.css', 'app-menu.css'].map(f => senzaCommenti(docs(f))).join('\n');
    const js = ['app-gioco.js', 'app-menu.js', 'app-comune.js', 'app-classifica.js', 'app-trainers.js', 'app-stats.js', 'scala-pkm.js', 'dettagli.js', 'matches.html'].map(docs).join('\n');
    const tema = docs('temi.css') + docs('nb-pagine.css');
    const usate = new Set([...fogli.matchAll(/var\((--[a-z0-9-]+)/gi)].map(m => m[1]));
    const definite = new Set([...fogli.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
    for (const m of js.matchAll(/setProperty\('(--[a-z0-9-]+)'/g)) definite.add(m[1]);
    for (const m of js.matchAll(/(--[a-z0-9-]+):\$\{/g)) definite.add(m[1]);                // scritte nello stile inline dei pezzi (--c, --cols...)
    for (const m of tema.matchAll(/(--[a-z0-9-]+)\s*:/gi)) definite.add(m[1]);
    const senza = [...usate].filter(v => !definite.has(v) && !['--c', '--i', '--n', '--tipo', '--tipo2', '--ns-durata', '--ns-eccesso'].includes(v));
    assert.deepEqual(senza, [], 'proprietà usate ma mai definite');
    assert.match(docs('app-menu.js'), /style="--c:' \+ esc\(v\.colore\) \+ '"/);
    // 1u = 1px su uno schermo di 740x340: la misura dell'app si adatta allo schermo
    assert.match(fogli, /--u:\s*min\(\.294vh,\s*\.1351vw\)/);
});

test('lo stile dell\'app è uno solo: le variabili del tema del sito sono rimesse a mano sotto html.app, e nessun tema (sticker, morbido, arcade) ne cambia l\'aspetto', () => {
    const css = senzaCommenti(docs('app-gioco.css'));
    // ogni "manopola" che i temi del sito (temi.css) regolano in modo diverso è fissata anche qui, sotto html.app: le variabili che il tema predefinito
    // definisce e che almeno un altro tema ridefinisce (colori, angoli, ombre, rotazione, caratteri...)
    const temi = senzaCommenti(docs('temi.css'));
    const blocco = nome => { const i = temi.indexOf(`[data-tema="${nome}"] {`); return temi.slice(i, temi.indexOf('}', i)); };
    const variabili = blocco => new Set([...blocco.matchAll(/(--nb-[a-z-]+)\s*:/g)].map(m => m[1]));
    const predefinito = variabili(blocco('neubrutal'));
    const altri = new Set(['sticker', 'morbido', 'arcade'].flatMap(t => [...variabili(blocco(t))]));
    const manopole = [...predefinito].filter(v => altri.has(v) && !/^--nb-motivo/.test(v));         // il motivo del fondo l'app lo disegna da sé (html.app-shell body.nb)
    assert.ok(manopole.length >= 10, 'manopole dei temi trovate: ' + manopole.length);
    const base = css.slice(css.indexOf('html.app {'), css.indexOf('}', css.indexOf('html.app {')));
    const nonFissate = manopole.filter(v => !new RegExp(`${v}\\s*:`).test(base));
    assert.deepEqual(nonFissate, [], 'variabili del tema che l\'app non fissa');
    // nessuna regola per tema: l'app non li conosce
    assert.doesNotMatch(css, /data-tema/);
    for (const f of ['app-gioco-pagine.css', 'app-menu.css']) assert.doesNotMatch(senzaCommenti(docs(f)), /data-tema/, f);
    // chi lo imposta: l'app fissa il tema predefinito e temi.js non applica niente
    assert.match(docs('app.js'), /TEMA_APP\s*=\s*'neubrutal'/);
    assert.match(docs('temi.js'), /function inApp\(/);
});

test('transizioni tra pagine: attive solo nell\'app (la regola @view-transition la scrivono gli script dell\'app, mai un foglio del sito)', () => {
    assert.match(docs('app-gioco.js'), /@view-transition \{ navigation: auto; \}/);
    assert.match(docs('app-menu.js'), /@view-transition \{ navigation: auto; \}/);
    for (const f of fs.readdirSync(DOCS).filter(x => /\.(css|html)$/.test(x))) assert.doesNotMatch(docs(f), /@view-transition/, `${f}: la regola va solo negli script dell'app`);
    // le animazioni delle pagine non lasciano blocchi "contenitore" attorno ai tasti fissi (fill-mode both li terrebbe per sempre)
    const css = senzaCommenti(docs('app-gioco-pagine.css')).replace(/::view-transition-[^{]*\{[^}]*\}/g, '');       // i pezzi della transizione vivono su uno strato a parte
    assert.doesNotMatch(css, /animation(-fill-mode)?:[^;}]*\bboth\b/, 'animation con fill-mode "both" (usa "backwards")');
});

test('la barra in alto (menù e titolo) resta sempre in vista: scorrendo non si nasconde più', () => {
    assert.equal(G.barraNascosta, undefined);
    assert.doesNotMatch(docs('app-gioco.js'), /gx-barra-nascosta|addEventListener\('scroll'/);
    assert.doesNotMatch(docs('app-gioco-pagine.css'), /gx-barra-nascosta/);
});
