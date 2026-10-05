'use strict';
// matches.html: i quadrati dei showdown, la finestra delle squadre iscritte e il replay nello stile dei temi (colori, angoli, ombre e
// caratteri dal tema attivo), il replay senza la scritta "SET N" e con i badge dei due team.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const matches = leggi('matches.html');
const showdownCss = leggi('showdown.css');
const finestreCss = leggi('finestre.css');

test('i quadrati dei showdown: una finestrina con striscia, i due allenatori sul loro colore, punteggio, data', () => {
    const markup = matches.slice(matches.indexOf("sdCard.className = 'showdown-summary-card'"), matches.indexOf('container.appendChild(sdCard)'));
    for (const parte of ['sd-card-barra', 'sd-category-tag', 'sd-lato sd-lato-1', 'sd-lato sd-lato-2', 'sd-result-badge', 'sd-final-score', 'sd-card-footer', 'sd-date-text']) {
        assert.ok(markup.includes(parte), parte);
    }
    // i colori dei due allenatori e chi vince (adesivo WIN, numero giallo) arrivano come variabili e classi
    assert.match(markup, /setProperty\('--lato1', colorePlayer\(p1Name\)\)/);
    assert.match(markup, /setProperty\('--lato2', colorePlayer\(p2Name\)\)/);
    assert.match(markup, /classList\.add\(`vince-\$\{chiVince\}`\)/);
    assert.match(markup, /<i class="sd-win">WIN<\/i>/);
    // i nomi si escono dal markup con escape (un nome non può rompere la pagina), e il nome intero sta nel title
    assert.match(markup, /title="\$\{esc\(p1Name\)\}"/);
    assert.match(markup, /\$\{esc\(info\.categoria \|\| "OU"\)\}/);
    // niente più nomi a scorrimento con la larghezza fissa a 5 caratteri
    assert.doesNotMatch(markup, /sd-name-container|scrollBounce/);
});

test('showdown.css: i quadrati e la finestra delle squadre usano solo le variabili del tema (niente colori o angoli fissi)', () => {
    const quadrati = showdownCss.slice(showdownCss.indexOf('I QUADRATI DEI SHOWDOWN NELL\'ELENCO'), showdownCss.indexOf('LA FINESTRA DELLE SQUADRE ISCRITTE'));
    const finestra = showdownCss.slice(showdownCss.indexOf('LA FINESTRA DELLE SQUADRE ISCRITTE'));
    for (const [nome, css] of [['quadrati', quadrati], ['finestra', finestra]]) {
        assert.ok(css.length > 1500, nome);
        for (const v of ['--nb-ink', '--nb-raggio', '--nb-sh-s', '--nb-rot', '--nb-font-titoli', '--nb-giallo']) assert.ok(css.includes(v), `${nome}: ${v}`);
        // i temi cambiano colori, ombre e angoli, mai spessori dei bordi: i bordi sono 2, 3 o 4 px in tutti
        for (const m of css.matchAll(/border(?:-top)?:\s*(\d+)px/g)) assert.ok([0, 2, 3, 4].includes(+m[1]), `${nome}: bordo di ${m[1]}px`);
        assert.doesNotMatch(css, /data-tema/, `${nome}: nessun tema scritto a mano, solo variabili`);
    }
    // il vincitore si alza, il suo numero è giallo; la striscia ha i tre pallini
    assert.match(quadrati, /\.vince-1 \.sd-lato-1,[\s\S]*?\.vince-2 \.sd-lato-2[\s\S]*?translateY\(-4px\)/);
    assert.match(quadrati, /\.vince-1 \.sd-final-score b:first-child,\s*\.showdown-summary-card\.vince-2 \.sd-final-score b:last-child \{ color: var\(--nb-giallo/);
    assert.match(quadrati, /#ff5f57[\s\S]*#febc2e[\s\S]*#28c840/);
    // movimento ridotto
    assert.match(quadrati, /prefers-reduced-motion: reduce/);
    assert.match(finestra, /prefers-reduced-motion: reduce/);
});

test('squadre iscritte: i tasti degli allenatori prendono il colore dalla variabile --tab (niente più stili in linea a forza)', () => {
    const tab = matches.slice(matches.indexOf("const btnTab = document.createElement('button')"), matches.indexOf('tabsContainer.appendChild(btnTab)'));
    assert.match(tab, /btnTab\.style\.setProperty\('--tab', player\.color\)/);
    assert.doesNotMatch(tab, /'important'/, 'niente !important in linea');
    assert.match(tab, /class="player-tab-avatar"/);
    assert.match(matches, /Pick a trainer to see their registered teams\./);
    assert.match(showdownCss, /#modal-registered-teams \.player-tab-btn \{[\s\S]*?background: var\(--tab\) !important/);
    // la finestra ha la striscia, la X gialla e il titolo nero come le altre
    assert.match(showdownCss, /#modal-registered-teams \.pokemon-theme-modal::before \{\s*content: "TEAMS · SANT'ALVISE PKMN LEAGUE"/);
    assert.match(showdownCss, /#modal-registered-teams \.close-modal-btn \{[\s\S]*?background: var\(--nb-giallo/);
});

test('replay: niente "SET N" accanto ai tasti dei set (il numero sta nel tasto), e i badge dei due team nella testata', () => {
    const replay = matches.slice(matches.indexOf('async function apriMatch('), matches.indexOf('window.gestisciClickReplay'));
    assert.doesNotMatch(replay, /set-etichetta|set-riga|SET \$\{numSet\}/);
    assert.match(replay, /<span class="set-num" aria-hidden="true">\$\{numSet\}<\/span>\$\{winInitial\}/);
    assert.match(replay, /aria-label="Set \$\{numSet\}, won by \$\{winInitial\}"/);
    // la testata: nome e badge di ogni team, e i badge si montano per i due giocatori con il loro team
    assert.match(replay, /data-replay-badge="1"[\s\S]*data-replay-badge="2"/);
    assert.match(replay, /BadgeTeam\.montaMini\(db, miniHeader\.querySelector\(`\[data-replay-badge="\$\{lato\}"\]`\)/);
    assert.match(replay, /\[sdData\.info\.player1, teamDidi, '1'\], \[sdData\.info\.player2, teamLu, '2'\]/);
    assert.ok(!finestreCss.includes('.set-etichetta') && !finestreCss.includes('.set-riga'), 'finestre.css non stila più la scritta');
    assert.match(finestreCss, /#replayModal \.btn-set \.set-num \{/);
    const badge = leggi('badge-team.js');
    assert.match(badge, /async function montaMini\(db, casella, \{ giocatore, team, valido, max = 4 \} = \{\}\)/);
    assert.match(badge, /montaBarra, montaMini, riempiCard/);
    assert.match(leggi('badge-team.css'), /\.bt-conto-chip \{/);
    // matches.html carica quello che serve ai badge
    for (const f of ['statistiche.js', 'fiocchi.js', 'badge-team.js']) assert.match(matches, new RegExp(`<script src="${f}"></script>`));
});
