'use strict';
// Ritocchi grafici e privacy delle pagine (card dei formati e finestre, ricerca del Box, matches, players, pagina pubblica):
//   - Formats: card, scheda del formato e "Add new format" seguono il tema (carta, inchiostro, giallo, angoli, ombre, rotazioni, caratteri)
//     e hanno la cornice delle altre finestre; niente colori o stili in linea scritti a mano; i nomi e i colori del database sono protetti;
//   - Box: ricerca e ordinamento nella stessa famiglia dei filtri di Stats (etichetta a tag sul bordo del campo);
//   - Matches: le colonne dei match seguono la larghezza; la classifica compatta non ripete il nome nel fumetto;
//   - Players: ogni badge dell'allenatore è nel suo cerchio e il trofeo non si sovrappone;
//   - pagina pubblica: dei team e dei Pokémon si vedono le specie e i badge, mai mosse, abilità, strumenti, EV o natura;
//     il dettaglio di un team in un match solo in una stagione a scheda aperta.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DOCS = path.join(__dirname, '..', 'docs');
const leggi = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const formats = leggi('formats.html');
const cssFormats = leggi('style-formats.css');
const finestre = leggi('finestre.css');

// la parte del foglio dei formati che disegna card e finestre (da qui in giù tutto segue il tema)
const inizioTema = cssFormats.indexOf('LE CARD DEI FORMATI E LA LORO SCHEDA');
assert.ok(inizioTema > 0, 'il foglio dei formati ha la sezione con le card e le finestre');
const cssTema = cssFormats.slice(inizioTema);
const regola = (css, selettore) => {
    const i = css.indexOf(selettore + ' {');
    assert.ok(i >= 0, `regola ${selettore} mancante`);
    return css.slice(i, css.indexOf('}', i));
};

// ===================================================
// FORMATS
// ===================================================
test('formats: le card non hanno più stili in linea (carta, bordo, ombra e carattere li decide il tema)', () => {
    const i = formats.indexOf('const cardHtml = `');
    const card = formats.slice(i, formats.indexOf('gridContainer.innerHTML += cardHtml;', i));
    assert.match(card, /<div class="format-card-nb" role="button" tabindex="0"/);
    assert.match(card, /<div class="fmt-azioni">/);
    assert.match(card, /class="fmt-azione fmt-modifica"/);
    assert.match(card, /class="fmt-azione fmt-elimina"/);
    assert.doesNotMatch(card, /background-color: #fff|background: #fff|font-size: \d+px|border: 0px/, 'niente colori e misure scritti nella card');
    // l'unico stile in linea è il colore del leader, dato come variabile CSS e solo se è un colore vero
    assert.ok((card.match(/style="/g) || []).length <= 1);
    assert.match(card, /style="--fmt-leader: \$\{colore\}"/);
    // matita e cestino: i titoli restano (li usa il fumetto del tema) e si arrivano con la tastiera
    assert.match(card, /aria-label="Edit format" title="Edit format"/);
    assert.match(card, /aria-label="Delete format" title="Delete format"/);
    assert.match(card, /title="\$\{format\.hasLeader \? 'Current leader' : 'No leader for this format'\}"/, 'in inglese come il resto del sito');
    // Invio e Spazio aprono la card, ma non quando si preme su matita e cestino
    assert.match(card, /event\.target === this && \(event\.key === 'Enter' \|\| event\.key === ' '\)/);
});

test('formats: i nomi e i colori che arrivano dal database si proteggono prima di entrare nella pagina', () => {
    const estratto = nome => {
        const i = formats.indexOf(`const ${nome} = `);
        assert.ok(i >= 0, nome);
        return formats.slice(i, formats.indexOf('\n', i));
    };
    const { escHtml, coloreSicuro } = vm.runInNewContext(`${estratto('escHtml')}\n${estratto('coloreSicuro')}\n({ escHtml, coloreSicuro })`);
    assert.equal(escHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
    assert.equal(escHtml(null), '');
    assert.equal(coloreSicuro('#31c489'), '#31c489');
    assert.equal(coloreSicuro('#fff'), '#fff');
    assert.equal(coloreSicuro('rgb(10, 20, 30)'), 'rgb(10, 20, 30)');
    assert.equal(coloreSicuro('hsl(120, 50%, 40%)'), 'hsl(120, 50%, 40%)');
    for (const cattivo of ['red; background: url(x)', 'url(javascript:alert(1))', '#zzz', '"><script>', 'expression(alert(1))', '']) {
        assert.equal(coloreSicuro(cattivo), '', cattivo);
    }
    assert.equal(coloreSicuro('', '#31c489'), '#31c489', 'il ripiego');
    // il nome del formato nella card, nella scheda e nei giocatori passa da escHtml; il nome nell'onclick è protetto per il JavaScript e per l'HTML
    assert.match(formats, /<div class="format-nb-title-badge">\$\{escHtml\(format\.formatName\)\}<\/div>/);
    assert.match(formats, /const formatEscaped = escHtml\(format\.formatName\.replace\(\/\\\\\/g, '\\\\\\\\'\)\.replace\(\/'\/g, "\\\\'"\)\);/);
    assert.match(formats, /<h2 class="fmt-titolo" id="fmt-titolo-scheda">\$\{escHtml\(formatName\)\}<\/h2>/);
    assert.match(formats, /<span class="fmt-nome">\$\{escHtml\(player\.name\)\}<\/span>/);
    assert.match(formats, /color: coloreSicuro\(pData\.info\?\.color, '#31c489'\)/);
});

test('formats: la scheda di un formato è una finestra come le altre (titolo, riquadri con tab gialla, classifica) e non scrive colori a mano', () => {
    const i = formats.indexOf('async function apriModaleFormato(');
    const scheda = formats.slice(i, formats.indexOf('async function renderRankingsDelFormato(', i));
    for (const classe of ['fmt-finestra', 'fmt-chiudi', 'fmt-titolo', 'fmt-corpo', 'fmt-regole', 'fmt-griglia', 'fmt-blocco', 'fmt-etichetta', 'fmt-classifica']) {
        assert.ok(scheda.includes(classe), classe);
    }
    assert.match(scheda, /role="dialog" aria-modal="true" aria-labelledby="fmt-titolo-scheda"/);
    assert.doesNotMatch(scheda, /#ffffff|#ffde00|#fff\b|background: #|color: #000|font-family: 'Josefin Sans'/, 'niente bianchi, gialli, neri e caratteri scritti a mano');
    assert.doesNotMatch(scheda, /style="/, 'nessuno stile in linea nella scheda (il colore del giocatore passa dalla variabile --fmt-colore)');
    // si chiude con la X, toccando il velo e con Esc
    assert.match(scheda, /onclick="chiudiModaleFormato\(\)"/);
    assert.match(scheda, /if \(e\.target === modalOverlay\) chiudiModaleFormato\(\)/);
    assert.match(formats, /if \(e\.key === 'Escape'\) chiudiModaleFormato\(\);/);
    assert.match(formats, /function chiudiModaleFormato\(\) \{[^}]*classList\.remove\('aperto'\)/);
    // le righe della classifica sono link alla pagina pubblica del giocatore (non div con un onclick)
    const righe = formats.slice(formats.indexOf('async function renderRankingsDelFormato('));
    assert.match(righe, /<a class="player-rank-row" href="public\.html\?player=\$\{encodeURIComponent\(player\.name\.trim\(\)\)\}" style="--fmt-colore: \$\{player\.color\}">/);
    assert.doesNotMatch(righe, /onmouseenter|onmouseleave|window\.location\.href/);
    // i colori degli stati (vietato, permesso...) li dà il foglio
    for (const chip of ['fmt-chip-no', 'fmt-chip-si', 'fmt-chip-info', 'fmt-chip-lista']) assert.ok(scheda.includes(chip), chip);
});

test('formats: "Add new format" non inietta più stili e non scrive colori negli script (chip, errori, righe in conflitto, campi dei valori)', () => {
    assert.doesNotMatch(formats, /nb-tooltip-core-styles/, 'il fumetto delle clausole è nel foglio, non iniettato dallo script');
    assert.doesNotMatch(formats, /chip\.style\.cssText|boxErrore\.style\.cssText|rElement\.style\.(border|background)/);
    assert.match(formats, /classList\.add\('in-conflitto'\)/);
    assert.match(formats, /classList\.remove\('in-conflitto'\)/);
    assert.match(formats, /<span class="fmt-errore-titolo">/);
    assert.match(formats, /class="fmt-banlist"/);
    assert.match(formats, /class="fmt-banlist-ban"/);
    assert.match(formats, /<label for="format-generational-mechanics" class="fmt-spunta">/);
    // le caselle dei valori tengono solo la misura (classi), non bordo, angoli, carattere e riempimento
    assert.match(formats, /class="input-value fmt-valore-stretto fmt-largo-120"/);
    assert.doesNotMatch(formats, /class="input-value[^"]*"[^>]*style="[^"]*(border|font-weight|padding)/);
    // il testo degli errori entra nell'HTML protetto
    assert.match(formats, /\.map\(msg => `• \$\{escHtml\(msg\)\}`\)/);
});

test('formats: il foglio segue il tema (variabili --nb-*), la rotazione cresce e cala con il tema, nessun bianco o giallo fisso', () => {
    // card
    const card = regola(cssTema, '.format-card-nb');
    for (const v of ['var(--nb-carta', 'var(--nb-ink', 'var(--nb-raggio', 'var(--nb-sh-m']) assert.ok(card.includes(v), `card: ${v}`);
    assert.match(card, /background-color: var\(--nb-carta, #fff\)/);
    assert.doesNotMatch(card, /!important/);
    assert.match(regola(cssTema, '.format-card-nb::before'), /content: "FORMAT"/);
    assert.match(regola(cssTema, '.format-nb-title-badge'), /box-shadow: var\(--nb-sh-s-scuro, none\)/, 'un cartellino nero ha l\'ombra grigia, non nera su nero');
    assert.match(regola(cssTema, '.format-nb-leader-box'), /background: var\(--fmt-leader, var\(--nb-carta/);
    // tab e riquadri della scheda
    assert.match(regola(cssTema, '.fmt-etichetta'), /background: var\(--nb-giallo/);
    assert.match(regola(cssTema, '.fmt-blocco'), /background: var\(--nb-carta/);
    // modale di creazione: campi, etichette, bottoni
    assert.match(regola(cssTema, '.format-input-group label'), /background: var\(--nb-giallo/);
    assert.match(regola(cssTema, '.btn-save-format'), /background: var\(--nb-verde/);
    assert.match(regola(cssTema, '.btn-add-rule'), /background: var\(--nb-giallo/);
    assert.match(regola(cssTema, '.btn-remove-rule'), /background: var\(--nb-rosso/);
    assert.match(regola(cssTema, '.format-rule-row'), /background: var\(--nb-carta/);
    assert.match(cssTema, /\.format-modal-content :is\(input\[type="text"\], input\[type="number"\], textarea, select\) \{[^}]*background: var\(--nb-carta/);
    assert.match(cssTema, /\.format-modal-content :is\(input, textarea, select\) \{ font-family: var\(--nb-font-testo/);
    // nessun colore pieno scritto a mano come sfondo (sono i colori del tema)
    assert.doesNotMatch(cssTema, /background(?:-color)?:\s*#(?:fff|ffffff|ffde00|ffde4d|4ade80|ef4444|e5e7eb)\b/i);
    // ogni rotazione passa dal moltiplicatore del tema: diritta nell'Arcade, storta nello Sticker
    const rotazioni = cssTema.match(/rotate\([^)]*\)/g) || [];
    assert.ok(rotazioni.length >= 15, `ci sono le rotazioni (${rotazioni.length})`);
    for (const r of rotazioni) assert.match(r, /var\(--nb-rot/, `rotazione fissa: ${r}`);
});

test('formats: la finestra della scheda e quella di modifica hanno la cornice delle altre (striscia con i tre pallini, carta calda, ombra del tema)', () => {
    assert.match(finestre, /:is\(\.fmt-finestra, #format-modal \.format-modal-content, #login-modal \.modal-content,/);
    assert.match(finestre, /\.fmt-finestra,\s*#format-modal \.format-modal-content,\s*#login-modal \.modal-content,[^{]*\{\s*box-sizing: border-box;[^}]*var\(--nb-tip-bg/);
    assert.match(cssTema, /\.fmt-finestra \{\s*--fin-etichetta: "FORMAT";/);
    assert.match(cssTema, /\.format-modal-content \{\s*--fin-etichetta: "FORMAT EDITOR";/);
    // il velo ha la mezzatinta e la sfocatura di quello dell'iscrizione alla stagione
    assert.match(regola(cssTema, '#format-modal-overlay,\n#format-modal'), /backdrop-filter: blur\(7px\)/);
    // la X gialla nella striscia e il tasto Save verde
    assert.match(regola(cssTema, '.fmt-chiudi'), /background: var\(--nb-giallo/);
    assert.match(regola(cssTema, '.format-close-btn'), /background: var\(--nb-giallo/);
    assert.doesNotMatch(cssTema, /\.format-close-btn \{[^}]*display: none/, 'la X ora si vede (prima si chiudeva solo toccando fuori)');
});

test('formats: la griglia riempie la larghezza che c\'è (tante colonne quante ci stanno) e parte dopo la colonna delle pubblicità', () => {
    const griglia = regola(cssTema, '.formats-neubrutalist-grid');
    assert.match(griglia, /grid-template-columns: repeat\(auto-fill, minmax\(210px, 1fr\)\)/);
    assert.match(griglia, /margin: 34px 0 0 calc\(var\(--nb-ads, 220px\) \+ 30px\)/);
    assert.doesNotMatch(cssFormats, /\.formats-neubrutalist-grid \{ grid-template-columns: repeat\((2|3|4), 1fr\) !important; \}/, 'via le colonne fisse');
    // sotto il nome lungo di un formato c'è il posto per matita, cestino e leader: il nome non ci finisce sopra
    assert.match(regola(cssTema, '.format-card-nb'), /padding: 34px 16px 88px/);
    assert.match(regola(cssTema, '.format-nb-title-badge'), /overflow-wrap: anywhere/);
});

// ===================================================
// BOX: ricerca e ordinamento
// ===================================================
test('box: ricerca, formato e ordinamento hanno l\'etichetta a tag sul bordo del campo, come i filtri di Stats', () => {
    const box = leggi('box.html');
    const i = box.indexOf('<div class="controls">');
    const barra = box.slice(i, box.indexOf('</main>', i));
    assert.match(barra, /<label class="box-filtro box-filtro-cerca">\s*<span>Search<\/span>\s*<input type="text" id="searchInput"/);
    assert.match(barra, /<label class="box-filtro">\s*<span>Format<\/span>\s*<select id="categoryFilter"/);
    assert.match(barra, /<label class="box-filtro">\s*<span>Sort by<\/span>\s*<select id="sortFilter"/);
    assert.match(barra, /<option value="">All formats<\/option>/);
    assert.doesNotMatch(barra, /data-nativo/, 'l\'elenco che si apre è quello del tema (controlli.js)');
    // i tre punti dove si riempie il filtro dei formati usano lo stesso testo
    assert.equal((box.match(/<option value="">All formats<\/option>/g) || []).length, 3);
    assert.doesNotMatch(box, /<option value="">Category/);
    // id e funzioni di prima: la logica dei filtri non è cambiata
    for (const id of ['searchInput', 'categoryFilter', 'sortFilter']) assert.match(box, new RegExp(`document\\.getElementById\\('${id}'\\)`));

    const css = leggi('style-box.css');
    const tag = regola(css, '.box-filtro > span');
    assert.match(tag, /background: var\(--nb-ink/);
    assert.match(tag, /transform: rotate\(calc\(var\(--nb-rot, 1\) \* -3deg\)\)/);
    assert.match(tag, /font: 800 \.68rem\/1\.3 var\(--nb-font-titoli/);
    const campo = regola(css, '.controls .box-filtro :is(input, select)');
    for (const v of ['var(--nb-carta', 'var(--nb-ink', 'var(--nb-raggio', 'var(--nb-sh-4', 'var(--nb-font-testo']) assert.ok(campo.includes(v), `campo: ${v}`);
    assert.match(campo, /box-shadow: var\(--nb-sh-4, 4px 4px 0 #000\) !important/, 'batte l\'ombra fissa dei campi globali');
    assert.match(css, /\.controls \.box-filtro :is\(input, select\):hover,\s*\.controls \.box-filtro :is\(input, select\):focus \{ transform: translate\(-2px, -2px\)/);
    assert.match(css, /\.controls \.box-filtro-cerca input \{[^}]*background-image: url\("data:image\/svg\+xml/, 'la lente a destra');
    // chi preferisce meno movimento non vede i campi sollevarsi
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.controls \.box-filtro :is\(input, select\) \{ transition: none; \}/);
});

// ===================================================
// MATCHES
// ===================================================
test('matches: le colonne dei match seguono la larghezza dello schermo (con più zoom una colonna in meno, non tutto schiacciato)', () => {
    const css = leggi('style-matches.css');
    const griglie = css.match(/\.showdown-grid[^{]*\{[^}]*\}/g) || [];
    assert.ok(griglie.length >= 2, 'le griglie dei showdown (singoli e doppi)');
    for (const g of griglie.filter(x => /grid-template-columns/.test(x))) {
        assert.match(g, /grid-template-columns: repeat\(auto-fill, minmax\(var\(--sd-colonna, 220px\), 1fr\)\)/, g.slice(0, 60));
        assert.doesNotMatch(g, /repeat\(3,/, 'niente più tre colonne fisse');
    }
    assert.match(css, /--sd-colonna: 100%/, 'sul telefono una colonna');
});

test('matches: la classifica compatta non ripete il nome nel fumetto (la riga lo dice già) e il dettaglio di un team vuole una stagione a scheda aperta', () => {
    const matches = leggi('matches.html');
    const i = matches.indexOf('<a class="cl-riga');
    assert.ok(i >= 0);
    assert.doesNotMatch(matches.slice(i, matches.indexOf('>', i)), /title=/, 'la riga della classifica non ha un title ridondante');
    const f = matches.slice(matches.indexOf('async function apriDettaglioTeam('), matches.indexOf('async function apriDettaglioTeam(') + 3000);
    assert.match(f, /const seasonId = \(typeof stagioneAttiva !== 'undefined' && stagioneAttiva\) \? stagioneAttiva : null;/);
    assert.match(f, /if \(!seasonId \|\| isOpenSheet === false\)/, 'senza stagione, o a scheda chiusa, non si carica niente');
    assert.match(f, /🔒 This is a closed sheet season/);
    // il controllo sta prima di leggere i team dal database
    assert.ok(f.indexOf('isOpenSheet === false') < f.indexOf('players/${idLower}/teams'), 'prima il controllo, poi i dati');
});

// ===================================================
// PLAYERS
// ===================================================
test('players: ogni badge dell\'allenatore sta nel suo cerchio colorato (anche il fondatore e le serie) e il trofeo non copre i badge', () => {
    const html = leggi('players.html');
    const i = html.indexOf('function generaHTMLBadge(');
    const f = html.slice(i, html.indexOf('async function initTrainersPage', i));
    assert.match(f, /Titoli\.badgeSbloccati\(statsBadges, playerKey\)/);
    assert.match(f, /BadgeTeam\.htmlMedaglietta\(/);
    assert.match(f, /classeLivello: fondatore \? 'gold' : b\.livello/);
    assert.doesNotMatch(f, /<img|trainer-mini-badge/, 'nessuna immagine nuda');
    assert.doesNotMatch(leggi('style-players.css'), /trainer-mini-badge/);
    assert.match(html, /<script src="badge-team\.js"><\/script>/);
    assert.match(html, /href="badge-team\.css"/);
    // il trofeo sta davanti ai badge, sulla stessa riga (prima era sospeso a metà riga e li copriva quando andavano a capo)
    const trofeo = regola(leggi('style-players.css'), '.trainer-card-trophy');
    assert.match(trofeo, /position: static/);
    assert.doesNotMatch(trofeo, /position: absolute|left: 40%/);
});

// ===================================================
// PAGINA PUBBLICA: solo specie e badge
// ===================================================
test('public: la versione pubblica di un team ha le specie e i badge, mai mosse, abilità, strumenti, EV, natura o il testo Showdown', () => {
    const html = leggi('public.html');
    const src = html.slice(html.indexOf('function versionePubblica(id, t) {'), html.indexOf('async function initPublicProfile()'));
    const versionePubblica = new Function(`${src}\nreturn versionePubblica;`)();
    const team = {
        nome: { valore: 'Sun Squad' }, categoria: 'gen8doublesou', segreto: 'x', testoShowdown: 'Zapdos @ Heavy-Duty Boots\nAbility: Pressure\n- Tailwind',
        stats: { won: 12, lost: 4, setW: 28, setL: 14, points: 36, played: 16, nascosto: 99 },
        pokemon: {
            0: { nome: 'Zapdos', abilita: 'Pressure', strumento: 'Heavy-Duty Boots', mosse: ['Tailwind', 'Thunderbolt'], evs: '4 HP / 252 SpA / 252 Spe', natura: 'Timid', badges: { loyaltybadge: true } },
            1: { nome: 'Garchomp', abilita: 'Rough Skin', strumento: 'Rocky Helmet', mosse: ['Earthquake'], evs: '252 Atk', natura: 'Jolly', badges: {} },
            2: null, 3: { strumento: 'senza nome' }
        }
    };
    const v = versionePubblica('t1', team);
    assert.deepEqual(Object.keys(v).sort(), ['categoria', 'id', 'nome', 'pokemon', 'stats', 'vittorie']);
    assert.deepEqual(v.pokemon, [{ nome: 'Zapdos', amicizia: true }, { nome: 'Garchomp', amicizia: false }]);
    assert.deepEqual(v.stats, { won: 12, lost: 4, lose: undefined, setW: 28, setL: 14, points: 36, played: 16 });
    assert.equal(v.nome, 'Sun Squad');
    assert.equal(v.vittorie, 12);
    assert.doesNotMatch(JSON.stringify(v), /Tailwind|Thunderbolt|Pressure|Boots|Rocky|Earthquake|252|Timid|Jolly|testoShowdown|segreto|nascosto|Ability/);
    // team vuoto o mancante: non si rompe
    assert.deepEqual(versionePubblica('x', null).pokemon, []);
    assert.equal(versionePubblica('x', {}).nome, '');
});

test('public: né la pagina né la carta leggono i dettagli di un set, e dei giocatori si tengono solo info e stats', () => {
    const html = leggi('public.html'), card = leggi('public-card.js');
    for (const [nome, testo] of [['public.html', html], ['public-card.js', card]]) {
        assert.doesNotMatch(testo, /\.mosse\b|\.abilita\b|\.strumento\b|\.evs\b|\.natura\b|testoShowdown|\.moves\b/, `${nome}: legge i dettagli di un set`);
    }
    assert.match(html, /const tuttiPubblico = Object\.fromEntries\(Object\.entries\(tutti \|\| \{\}\)\.map\(\(\[k, g\]\) => \[k, \{ info: g && g\.info, stats: g && g\.stats \}\]\)\);/);
    assert.match(html, /tutti: tuttiPubblico/);
    // le due finestre della pagina mostrano solo ciò che è pubblico
    assert.match(html, /\/\/ Il Pokémon di un team, visto da chiunque: lo sprite, il nome, il team e le medagliette dei fiocchi vinti/);
    assert.match(html, /<h4 class="pp-pkm-etichetta">RIBBONS<\/h4>/);
    assert.match(html, /async function apriDettagli\(id\)/);
});

test('public: le finestre della pagina (team e Pokémon) hanno la cornice delle altre', () => {
    const html = leggi('public.html');
    assert.match(html, /class="modal pp-modale"/);
    const css = leggi('dettagli.css');
    assert.match(css, /\.pp-pkm-scheda/);
    assert.match(css, /\.pp-pkm-fiocchi/);
});
