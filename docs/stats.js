// =====================================================
// STATS — interfaccia della pagina delle statistiche
//
// I numeri li calcola statistiche.js (funzione pura); qui ci sono solo
// Firebase, i controlli (categoria, stagione, formato, ricerca), la tabella
// ordinabile e la scheda di dettaglio.
//
// Richiede, dalla pagina: la variabile `db` (Firebase Realtime Database) e `auth`.
// =====================================================
(function () {
    'use strict';

    const $ = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '');
    const fmt = (n, dec = 0) => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
    const pct = n => (n == null ? '—' : `${fmt(n, Number.isInteger(n) ? 0 : 1)}%`);
    const segno = n => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

    const STATO = {
        tab: 'players',
        stagione: 'all',
        formato: 'all',
        cerca: '',
        ordine: {},          // tab -> { id, dir }
        dati: null,          // { seasons, players }
        r: null,             // ultimo risultato di Statistiche.calcola
        ultimoUid: undefined,
        aperta: null         // scheda di dettaglio aperta { tipo, chiave }
    };


    // -----------------------------------------------------
    // Pezzi di HTML
    // -----------------------------------------------------
    const wl = o => (!o || !o.giocati
        ? '<span class="nd">—</span>'
        : `<span class="wl"><b class="v">${fmt(o.vinti)}</b><i>–</i><b class="p">${fmt(o.persi)}</b></span>`);

    const barra = (n, colore) => (n == null ? '' :
        `<span class="barra"><span style="width:${Math.max(0, Math.min(100, n))}%${colore ? `;background:${colore}` : ''}"></span></span>`);

    const koCella = ko => (!ko || !ko.setConDati
        ? '<span class="nd" title="No KO data yet: only sets played on the site have it">—</span>'
        : `<span class="wl" title="${fmt(ko.setConDati)} sets with data"><b class="v">${fmt(ko.fatti)}</b><i>–</i><b class="p">${fmt(ko.subiti)}</b></span><small class="sub ${ko.differenza >= 0 ? 'v' : 'p'}">${segno(ko.differenza)}</small>`);

    const trofei = (vinti, giocate) => `<span class="trofei${vinti ? ' ha' : ''}"><img src="immagini/season-winner-color.png" alt="" width="20" height="20"><b>${fmt(vinti)}</b>${giocate != null ? `<small>/ ${fmt(giocate)}</small>` : ''}</span>`;

    // Sprite dei Pokémon: GIF animate di Showdown come nel resto del sito; se manca, il PNG del Pokédex, poi la Poké Ball
    const BASI_CON_TRATTINO = [['ho-oh', 'hooh'], ['porygon-z', 'porygonz'], ['jangmo-o', 'jangmoo'], ['hakamo-o', 'hakamoo'], ['kommo-o', 'kommoo'],
        ['wo-chien', 'wochien'], ['chien-pao', 'chienpao'], ['ting-lu', 'tinglu'], ['chi-yu', 'chiyu'], ['nidoran-f', 'nidoranf'], ['nidoran-m', 'nidoranm']];
    function slugSprite(specie) {
        let s = String(specie || '').toLowerCase().trim().replace(/[.'’:%é]/g, '').replace(/\s+/g, '');
        for (const [da, a] of BASI_CON_TRATTINO) if (s === da || s.startsWith(da + '-')) { s = a + s.slice(da.length); break; }
        const [base, ...forma] = s.split('-');
        return (base + (forma.length ? '-' + forma.join('') : '')).replace(/[^a-z0-9-]/g, '');
    }
    const POKEBALL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
    function sprite(specie, classe = 'pkm-sprite', statico = false) {
        const slug = slugSprite(specie);
        const src = statico ? `https://play.pokemonshowdown.com/sprites/dex/${slug}.png` : `https://play.pokemonshowdown.com/sprites/ani/${slug}.gif`;
        return `<img class="${classe}" src="${esc(src)}" data-slug="${esc(slug)}" data-fase="${statico ? 1 : 0}" alt="" loading="lazy">`;
    }
    function spriteDiRiserva(img) {
        const fase = Number(img.dataset.fase || 0);
        img.dataset.fase = String(fase + 1);
        if (fase === 0) img.src = `https://play.pokemonshowdown.com/sprites/dex/${img.dataset.slug}.png`;
        else if (fase === 1) img.src = POKEBALL;
    }

    const avatar = (p, classe = 'av') => `<img class="${classe}" src="${esc(p.avatar || 'immagini/magikarp.png')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='immagini/magikarp.png'">`;

    const chipPlayer = (nome, colore) => `<span class="chip-player" style="--c:${coloreSicuro(colore) || '#e4e4e4'}">${esc(nome)}</span>`;


    // -----------------------------------------------------
    // Colonne delle tre tabelle
    //   id, titolo, tip (suggerimento), val (valore per ordinare), html (cella), dir (verso di partenza), classe
    // -----------------------------------------------------
    const COLONNE = {
        players: () => [
            { id: 'nome', titolo: 'Trainer', val: p => p.nome.toLowerCase(), dir: 1, classe: 'col-nome',
                html: p => `<span class="cella-nome">${avatar(p)}<b>${esc(p.nome)}</b></span>` },
            { id: 'elo', titolo: 'Elo', val: p => p.elo, dir: -1,
                tip: STATO.stagione === 'all' ? "The trainer's ranking" : 'Rating at the end of the season (change in brackets)',
                html: p => `<b class="grande">${fmt(p.elo)}</b>${STATO.stagione === 'all' || !p.eloDelta ? '' : `<small class="sub ${p.eloDelta >= 0 ? 'v' : 'p'}">${segno(p.eloDelta)}</small>`}` },
            { id: 'punti', titolo: 'Points', val: p => p.punti, dir: -1, tip: 'Match points + 1 for every showdown won',
                html: p => `<b>${fmt(p.punti)}</b>` },
            { id: 'stagioni', titolo: 'Seasons won', val: p => p.stagioniVinte * 1000 + p.stagioniGiocate, dir: -1, tip: 'Seasons won / seasons played',
                html: p => trofei(p.stagioniVinte, p.stagioniGiocate) },
            { id: 'showdown', titolo: 'Showdowns', val: p => p.showdown.vinti * 1000 - p.showdown.persi, dir: -1, tip: 'Won – lost',
                html: p => wl(p.showdown) },
            { id: 'match', titolo: 'Matches', val: p => p.match.vinti * 1000 - p.match.persi, dir: -1, tip: 'Won – lost',
                html: p => wl(p.match) },
            { id: 'set', titolo: 'Sets', val: p => p.set.vinti * 1000 - p.set.persi, dir: -1, tip: 'Won – lost',
                html: p => wl(p.set) },
            { id: 'perc', titolo: 'Win %', val: p => p.percMatch, dir: -1, tip: 'Matches won',
                html: p => `<b>${pct(p.percMatch)}</b>${barra(p.percMatch)}` },
            { id: 'serie', titolo: 'Best streak', val: p => p.serie.vittorieMax, dir: -1, tip: 'Most matches won in a row',
                html: p => `<b>${fmt(p.serie.vittorieMax)}</b>` },
            { id: 'ko', titolo: 'KOs', val: p => (p.ko.setConDati ? p.ko.differenza : null), dir: -1, tip: 'Opponents KO\'d – own Pokémon KO\'d (difference below)',
                html: p => koCella(p.ko) }
        ],
        teams: () => [
            { id: 'nome', titolo: 'Team', val: t => t.nome.toLowerCase(), dir: 1, classe: 'col-nome',
                html: t => `<span class="cella-team"><b>${esc(t.nome)}</b><span class="mini-roster">${t.specie.slice(0, 6).map(s => sprite(s, 'mini', true)).join('')}</span></span>` },
            { id: 'player', titolo: 'Trainer', val: t => t.playerNome.toLowerCase(), dir: 1,
                html: t => chipPlayer(t.playerNome, t.colore) },
            { id: 'formato', titolo: 'Format', val: t => t.formato.toLowerCase(), dir: 1,
                html: t => `<span class="tag-formato">${esc(t.formato || '—')}</span>` },
            { id: 'stagioni', titolo: 'Seasons won', val: t => t.stagioniVinte * 1000 + t.stagioniGiocate, dir: -1, tip: 'Seasons won by its trainer in which the team played / seasons played',
                html: t => trofei(t.stagioniVinte, t.stagioniGiocate) },
            { id: 'showdown', titolo: 'Showdowns', val: t => t.showdown.vinti * 1000 - t.showdown.persi, dir: -1, tip: 'Won – lost, in the showdowns where the team was used',
                html: t => wl(t.showdown) },
            { id: 'match', titolo: 'Matches', val: t => t.match.vinti * 1000 - t.match.persi, dir: -1, tip: 'Won – lost',
                html: t => wl(t.match) },
            { id: 'set', titolo: 'Sets', val: t => t.set.vinti * 1000 - t.set.persi, dir: -1, tip: 'Won – lost',
                html: t => wl(t.set) },
            { id: 'perc', titolo: 'Win %', val: t => t.percMatch, dir: -1, tip: 'Matches won',
                html: t => `<b>${pct(t.percMatch)}</b>${barra(t.percMatch)}` },
            { id: 'ko', titolo: 'KOs', val: t => (t.ko.setConDati ? t.ko.differenza : null), dir: -1, tip: "Opponents KO'd – own Pokémon KO'd (difference below)",
                html: t => koCella(t.ko) }
        ],
        pokemon: () => [
            { id: 'nome', titolo: 'Pokémon', val: m => m.specie.toLowerCase(), dir: 1, classe: 'col-nome',
                html: m => `<span class="cella-pkm">${sprite(m.specie)}<span><b>${esc(m.specie)}</b><small class="sub">${esc(m.team)}</small></span></span>` },
            { id: 'player', titolo: 'Trainer', val: m => m.playerNome.toLowerCase(), dir: 1,
                html: m => chipPlayer(m.playerNome, m.colore) },
            { id: 'stagioni', titolo: 'Seasons won', val: m => m.stagioniVinte, dir: -1, tip: 'Seasons won by its trainer in which its team played',
                html: m => trofei(m.stagioniVinte) },
            { id: 'showdown', titolo: 'Showdowns', val: m => m.showdown.vinti * 1000 - m.showdown.persi, dir: -1, tip: 'Won – lost, with its team',
                html: m => wl(m.showdown) },
            { id: 'match', titolo: 'Matches', val: m => m.match.vinti * 1000 - m.match.persi, dir: -1, tip: 'Won – lost, with its team',
                html: m => wl(m.match) },
            { id: 'portato', titolo: 'Used', val: m => (m.setConDati ? m.portato : null), dir: -1, tip: 'Sets it was brought to / sets of its team with data',
                html: m => (m.setConDati ? `<b>${fmt(m.portato)}</b><small>/ ${fmt(m.setConDati)}</small>` : '<span class="nd">—</span>') },
            { id: 'ko', titolo: 'KOs', val: m => (m.setConDati ? m.koFatti : null), dir: -1, tip: 'Opponents it KO\'d (direct moves + indirect)',
                html: m => (m.setConDati ? `<b class="grande">${fmt(m.koFatti)}</b>${m.koFatti ? `<small class="sub">${fmt(m.koDiretti)} direct</small>` : ''}` : '<span class="nd">—</span>') },
            { id: 'quota', titolo: 'KO share', val: m => m.quotaKo, dir: -1, tip: "Part of its team's KOs scored by this Pokémon: how decisive it is",
                html: m => (m.quotaKo == null ? '<span class="nd">—</span>' : `<b>${pct(m.quotaKo)}</b>${barra(m.quotaKo)}`) },
            { id: 'svenuto', titolo: 'Fainted', val: m => (m.portato ? m.svenuto : null), dir: -1, tip: 'Times it was KO\'d',
                html: m => (m.portato ? `<b>${fmt(m.svenuto)}</b>` : '<span class="nd">—</span>') },
            { id: 'ultimo', titolo: 'Last standing', val: m => (m.setConDati ? m.ultimo : null), dir: -1, tip: 'Times it was the only Pokémon left on its team (and how many of those sets were won)',
                html: m => (m.setConDati ? `<b>${fmt(m.ultimo)}</b>${m.ultimo ? `<small class="sub v">${fmt(m.ultimoVinto)} won</small>` : ''}` : '<span class="nd">—</span>') }
        ]
    };

    const CHIAVE = { players: 'id', teams: 'chiave', pokemon: 'chiave' };
    const TITOLO_TAB = { players: 'Players', teams: 'Teams', pokemon: 'Pokémon' };

    // Ordine di partenza: Elo (globali) o punti (stagione) per i giocatori; KO per i Pokémon...
    function ordinePredefinito(tab) {
        if (tab === 'players') return { id: STATO.stagione === 'all' ? 'elo' : 'punti', dir: -1 };
        if (tab === 'teams') return { id: 'match', dir: -1 };
        return { id: 'ko', dir: -1 };
    }

    function righeOrdinate(tab) {
        const lista = STATO.r[tab];
        const cols = COLONNE[tab]();
        const ord = STATO.ordine[tab] || ordinePredefinito(tab);
        const col = cols.find(c => c.id === ord.id) || cols[0];
        const q = STATO.cerca.trim().toLowerCase();
        const filtrate = !q ? lista : lista.filter(x => {
            const testo = tab === 'players' ? [x.nome]
                : tab === 'teams' ? [x.nome, x.playerNome, ...x.specie]
                    : [x.specie, x.team, x.playerNome];
            return testo.some(t => String(t).toLowerCase().includes(q));
        });
        const confronta = (a, b) => {
            const va = col.val(a), vb = col.val(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;                 // i dati mancanti stanno sempre in fondo
            if (vb == null) return -1;
            const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
            return c * ord.dir;
        };
        // parità: l'ordine di partenza del calcolo (Elo/punti, KO...)
        return filtrate.map((x, i) => ({ x, i })).sort((a, b) => confronta(a.x, b.x) || a.i - b.i).map(o => o.x);
    }


    // -----------------------------------------------------
    // Tabella
    // -----------------------------------------------------
    function disegnaTabella() {
        const tab = STATO.tab;
        const cols = COLONNE[tab]();
        const ord = STATO.ordine[tab] || ordinePredefinito(tab);
        const righe = righeOrdinate(tab);
        const contenitore = $('stats-tabella');

        if (!righe.length) {
            contenitore.innerHTML = messaggioVuoto();
            return;
        }

        const testa = cols.map(c => {
            const attiva = c.id === ord.id;
            return `<th scope="col" class="${c.classe || ''}${attiva ? ' ordinata' : ''}" aria-sort="${attiva ? (ord.dir < 0 ? 'descending' : 'ascending') : 'none'}">
                <button type="button" class="ordina" data-ordina="${esc(c.id)}"${c.tip ? ` title="${esc(c.tip)}"` : ''}>${esc(c.titolo)}<span class="freccia" aria-hidden="true">${attiva ? (ord.dir < 0 ? '▼' : '▲') : ''}</span></button>
            </th>`;
        }).join('');

        const corpo = righe.map((x, i) => {
            const colore = coloreSicuro(x.colore);
            return `<tr class="riga" tabindex="0" data-chiave="${esc(x[CHIAVE[tab]])}"${colore ? ` style="--c:${colore}"` : ''}>
                <td class="col-pos"><span class="pos pos-${i < 3 ? i + 1 : 'x'}">${i + 1}</span></td>
                ${cols.map(c => `<td class="${c.classe || ''}">${c.html(x)}</td>`).join('')}
            </tr>`;
        }).join('');

        contenitore.innerHTML = `<table class="stats-tabella">
            <caption class="solo-lettori">${esc(TITOLO_TAB[tab])} — ${esc(nomeStagione())}</caption>
            <thead><tr><th scope="col" class="col-pos"><span class="solo-lettori">Position</span></th>${testa}</tr></thead>
            <tbody>${corpo}</tbody>
        </table>`;
    }

    function messaggioVuoto() {
        const q = STATO.cerca.trim();
        if (q) return `<p class="vuoto">Nothing matches “${esc(q)}”.</p>`;
        const beta = STATO.r.stagioni.find(s => s.beta && s.partite > 0);
        if (STATO.stagione === 'all' && beta) {
            return `<p class="vuoto">No matches in the global stats yet.<br><small>The Beta season is not counted here: pick <b>${esc(beta.nome)}</b> from the Season list to see its numbers.</small></p>`;
        }
        return '<p class="vuoto">No matches recorded here yet.</p>';
    }

    const nomeStagione = () => {
        if (STATO.stagione === 'all') return 'Global';
        const s = STATO.r && STATO.r.stagioni.find(x => x.id === STATO.stagione);
        return s ? s.nome : STATO.stagione;
    };

    function disegnaRiepilogo() {
        const t = STATO.r.totali;
        const chip = [
            `<span class="chip chip-nero">${esc(nomeStagione())}${STATO.formato !== 'all' ? ` · ${esc(STATO.formato)}` : ''}</span>`,
            `<span class="chip">${fmt(t.showdown)} showdown${t.showdown === 1 ? '' : 's'}</span>`,
            `<span class="chip">${fmt(t.match)} match${t.match === 1 ? '' : 'es'}</span>`,
            `<span class="chip">${fmt(t.set)} set${t.set === 1 ? '' : 's'}</span>`,
            `<span class="chip${t.set && !t.setConDati ? ' chip-avviso' : ''}" title="KO and Pokémon stats exist only for sets played on the site">KO data: ${fmt(t.setConDati)} of ${fmt(t.set)} sets</span>`
        ];
        const s = STATO.r.stagioni.find(x => x.id === STATO.stagione);
        if (s && s.vincitore) {
            const p = STATO.r.players.find(x => x.id === s.vincitore);
            chip.push(`<span class="chip chip-oro"><img src="immagini/season-winner-color.png" alt="" width="18" height="18"> ${esc(p ? p.nome : s.vincitore)}</span>`);
        }
        $('stats-riepilogo').innerHTML = chip.join('');
    }


    // -----------------------------------------------------
    // Controlli
    // -----------------------------------------------------
    function riempiSelettori() {
        const r = STATO.r;
        const selS = $('sel-stagione');
        if (!selS.dataset.pronto || selS.dataset.n !== String(r.stagioni.length)) {
            selS.innerHTML = '<option value="all">Global (all seasons, no Beta)</option>' + r.stagioni.map(s => {
                const stato = s.beta ? 'Beta' : s.stato;
                return `<option value="${esc(s.id)}">${esc(s.nome)}${stato ? ` · ${esc(stato)}` : ''}</option>`;
            }).join('');
            selS.dataset.pronto = '1';
            selS.dataset.n = String(r.stagioni.length);
        }
        selS.value = STATO.stagione;

        const selF = $('sel-formato');
        selF.innerHTML = '<option value="all">All formats</option>' + r.formati.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
        selF.value = STATO.formato;
    }

    function disegnaTag() {
        document.querySelectorAll('.stats-tag .tag').forEach(b => {
            const attivo = b.dataset.tab === STATO.tab;
            b.setAttribute('aria-selected', attivo ? 'true' : 'false');
            b.classList.toggle('attivo', attivo);
        });
    }

    function aggiornaUrl() {
        const p = new URLSearchParams();
        if (STATO.tab !== 'players') p.set('tab', STATO.tab);
        if (STATO.stagione !== 'all') p.set('season', STATO.stagione);
        if (STATO.formato !== 'all') p.set('format', STATO.formato);
        try { history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname); } catch (e) { /* file:// o iframe */ }
    }

    function disegna() {
        const calcola = () => Statistiche.calcola(STATO.dati, { stagione: STATO.stagione, formato: STATO.formato });
        let r = calcola();
        // Un filtro che non esiste (indirizzo vecchio, formato sparito) torna a "tutto"
        if (STATO.stagione !== 'all' && !r.stagioni.some(s => s.id === STATO.stagione)) { STATO.stagione = 'all'; r = calcola(); }
        if (STATO.formato !== 'all' && !r.formati.includes(STATO.formato)) { STATO.formato = 'all'; r = calcola(); }
        STATO.r = r;
        riempiSelettori();
        disegnaTag();
        disegnaRiepilogo();
        disegnaTabella();
        aggiornaUrl();
    }


    // -----------------------------------------------------
    // Scheda di dettaglio
    // -----------------------------------------------------
    const tessera = (etichetta, valore, sotto = '', classe = '') =>
        `<div class="tessera ${classe}"><span class="et">${esc(etichetta)}</span><b class="va">${valore}</b>${sotto ? `<small class="so">${sotto}</small>` : ''}</div>`;
    const sezione = (titolo, corpo, classe = '') => `<section class="scheda-sezione ${classe}"><h3 class="scheda-titolo">${esc(titolo)}</h3>${corpo}</section>`;
    const griglia = tessere => `<div class="tessere">${tessere.join('')}</div>`;

    function tessereKo(ko) {
        if (!ko.setConDati) return '<p class="vuoto piccolo">No KO data yet: only sets played on the site have it.</p>';
        return griglia([
            tessera('KOs made', fmt(ko.fatti), `${fmt(ko.fattiPerSet, 1)} per set`),
            tessera('KOs taken', fmt(ko.subiti)),
            tessera('KO difference', segno(ko.differenza), '', ko.differenza >= 0 ? 'bene' : 'male'),
            tessera('Flawless sets', fmt(ko.setPerfetti), 'won without losing a Pokémon'),
            tessera('Close calls', fmt(ko.setAlLimite), 'won with one Pokémon left'),
            tessera('Avg set length', ko.turniMedi == null ? '—' : `${fmt(ko.turniMedi, 1)}`, 'turns'),
            tessera('Sets with data', fmt(ko.setConDati))
        ]);
    }

    const tessereRisultati = o => griglia([
        tessera('Showdowns', wl(o.showdown), o.showdown.giocati ? `${fmt(o.showdown.giocati)} played` : ''),
        tessera('Matches', wl(o.match), o.percMatch == null ? '' : `${pct(o.percMatch)} won`),
        tessera('Sets', wl(o.set), o.percSet == null ? '' : `${pct(o.percSet)} won`)
    ]);

    function schedaPlayer(p) {
        const s = STATO.r;
        const suoiTeam = s.teams.filter(t => t.player === p.id).sort((a, b) => b.match.giocati - a.match.giocati);
        const preferito = p.preferiti.team;
        const formato = p.preferiti.formato;
        const colore = coloreSicuro(p.colore) || '#31c489';
        return `<header class="scheda-testa" style="--c:${colore}">
                ${avatar(p, 'scheda-avatar')}
                <div><h2 id="stats-modal-titolo">${esc(p.nome)}</h2>
                <div class="scheda-tag"><span class="chip chip-nero">${esc(nomeStagione())}</span>${p.stagioniVinte ? `<span class="chip chip-oro"><img src="immagini/season-winner-color.png" alt="" width="18" height="18"> ${fmt(p.stagioniVinte)} season${p.stagioniVinte === 1 ? '' : 's'} won</span>` : ''}</div></div>
            </header>
            ${sezione('Ranking', griglia([
                tessera(STATO.stagione === 'all' ? 'Elo' : 'Elo (end of season)', fmt(p.elo), STATO.stagione === 'all' || !p.eloDelta ? '' : `${segno(p.eloDelta)} in the season`),
                tessera('Peak Elo', p.eloPicco == null ? '—' : fmt(p.eloPicco)),
                tessera('Points', fmt(p.punti)),
                tessera('Seasons', `${fmt(p.stagioniVinte)} <small>won of ${fmt(p.stagioniGiocate)}</small>`)
            ]))}
            ${sezione('Results', tessereRisultati(p))}
            ${sezione('Streaks', griglia([
                tessera('Best win streak', fmt(p.serie.vittorieMax), 'matches in a row'),
                tessera('Current streak', fmt(p.serie.vittorieAttuale), 'matches won in a row'),
                tessera('Clean sweeps', fmt(p.serie.cleanSweep), 'matches won without losing a set')
            ]))}
            ${sezione('KOs', tessereKo(p.ko))}
            ${sezione('Favourites', griglia([
                tessera('Format', formato ? esc(formato.nome) : '—', formato ? `${fmt(formato.n)} matches` : ''),
                tessera('Team', preferito ? esc(preferito.nome) : '—', preferito ? `${fmt(preferito.n)} matches · ${pct(Math.round(preferito.vinti / preferito.n * 1000) / 10)} won` : ''),
                tessera('Top scorer', p.mvp ? esc(p.mvp.specie) : '—', p.mvp ? `${fmt(p.mvp.koFatti)} KOs · ${esc(p.mvp.team)}` : 'needs KO data')
            ]))}
            ${suoiTeam.length ? sezione('Teams', `<div class="scheda-lista">${suoiTeam.map(t => `
                <button type="button" class="voce" data-apri="teams" data-chiave="${esc(t.chiave)}">
                    <b>${esc(t.nome)}</b><span class="tag-formato">${esc(t.formato || '—')}</span>
                    <span class="mini-roster">${t.specie.slice(0, 6).map(x => sprite(x, 'mini', true)).join('')}</span>
                    ${wl(t.match)}<span class="voce-perc">${pct(t.percMatch)}</span>
                </button>`).join('')}</div>`) : ''}`;
    }

    function schedaTeam(t) {
        const suoi = STATO.r.pokemon.filter(m => m.squadra === t.chiave);
        const ordine = [...suoi].sort((a, b) => b.koFatti - a.koFatti || b.portato - a.portato);
        const colore = coloreSicuro(t.colore) || '#ffbd44';
        return `<header class="scheda-testa" style="--c:${colore}">
                <div class="scheda-roster">${t.specie.slice(0, 6).map(x => sprite(x, 'scheda-mini')).join('')}</div>
                <div><h2 id="stats-modal-titolo">${esc(t.nome)}</h2>
                <div class="scheda-tag">${chipPlayer(t.playerNome, t.colore)}<span class="tag-formato">${esc(t.formato || '—')}</span><span class="chip chip-nero">${esc(nomeStagione())}</span>${t.stagioniVinte ? `<span class="chip chip-oro"><img src="immagini/season-winner-color.png" alt="" width="18" height="18"> ${fmt(t.stagioniVinte)} season${t.stagioniVinte === 1 ? '' : 's'} won</span>` : ''}</div></div>
            </header>
            ${sezione('Results', tessereRisultati(t) + griglia([
                tessera('Points', fmt(t.punti), 'from its matches'),
                tessera('Seasons', `${fmt(t.stagioniVinte)} <small>won of ${fmt(t.stagioniGiocate)}</small>`),
                tessera('Last used', t.ultimoUso ? esc(t.ultimoUso) : '—')
            ]))}
            ${sezione('KOs', tessereKo(t.ko))}
            ${ordine.length ? sezione('Roster', `<div class="scheda-lista">${ordine.map(m => `
                <button type="button" class="voce voce-pkm" data-apri="pokemon" data-chiave="${esc(m.chiave)}">
                    ${sprite(m.specie, 'scheda-mini')}<b>${esc(m.specie)}</b>
                    ${m.setConDati ? `<span class="voce-dato"><b>${fmt(m.koFatti)}</b> KOs</span><span class="voce-dato">used <b>${fmt(m.portato)}</b>/${fmt(m.setConDati)}</span>${m.quotaKo == null ? '' : `<span class="voce-dato">${pct(m.quotaKo)} ${barra(m.quotaKo)}</span>`}` : '<span class="voce-dato nd">no KO data</span>'}
                </button>`).join('')}</div>`) : ''}`;
    }

    function schedaPokemon(m) {
        const t = STATO.r.teams.find(x => x.chiave === m.squadra);
        const colore = coloreSicuro(m.colore) || '#6fa8ff';
        const dati = m.setConDati > 0;
        return `<header class="scheda-testa" style="--c:${colore}">
                ${sprite(m.specie, 'scheda-grande')}
                <div><h2 id="stats-modal-titolo">${esc(m.specie)}</h2>
                <div class="scheda-tag">${chipPlayer(m.playerNome, m.colore)}<button type="button" class="chip chip-bottone" data-apri="teams" data-chiave="${esc(m.squadra)}">${esc(m.team)}</button><span class="tag-formato">${esc(m.formato || '—')}</span><span class="chip chip-nero">${esc(nomeStagione())}</span></div></div>
            </header>
            ${sezione('With its team', griglia([
                tessera('Seasons won', trofei(m.stagioniVinte)),
                tessera('Showdowns', wl(m.showdown)),
                tessera('Matches', wl(m.match)),
                tessera('Sets', wl(m.set))
            ]))}
            ${sezione('In battle', dati ? griglia([
                tessera('KOs', fmt(m.koFatti), `${fmt(m.koDiretti)} with moves · ${fmt(m.koIndiretti)} indirect`),
                tessera('KO share', pct(m.quotaKo), "of its team's KOs"),
                tessera('KOs per set', fmt(m.koPerSet, 1), 'when brought'),
                tessera('Brought', `${fmt(m.portato)} <small>of ${fmt(m.setConDati)} sets</small>`, m.percPortato == null ? '' : `${pct(m.percPortato)} of the sets`),
                tessera('Lead', fmt(m.titolare), 'started on the field'),
                tessera('Fainted', fmt(m.svenuto), m.sopravvivenza == null ? '' : `survives ${pct(m.sopravvivenza)} of the time`),
                tessera('Last standing', fmt(m.ultimo), m.ultimo ? `${fmt(m.ultimoVinto)} of them won` : 'only one left on its team'),
                tessera('Sets when brought', wl({ giocati: m.setPortatoVinti + m.setPortatoPersi, vinti: m.setPortatoVinti, persi: m.setPortatoPersi }), m.percVintiPortato == null ? '' : `${pct(m.percVintiPortato)} won`)
            ]) : '<p class="vuoto piccolo">No KO data yet: only sets played on the site have it.</p>')}
            ${t ? sezione('Its team', `<div class="scheda-lista"><button type="button" class="voce" data-apri="teams" data-chiave="${esc(t.chiave)}"><b>${esc(t.nome)}</b><span class="mini-roster">${t.specie.slice(0, 6).map(x => sprite(x, 'mini', true)).join('')}</span>${wl(t.match)}<span class="voce-perc">${pct(t.percMatch)}</span></button></div>`) : ''}`;
    }

    let ultimoFocus = null;
    function apriScheda(tipo, chiave) {
        const lista = STATO.r[tipo];
        const oggetto = lista && lista.find(x => x[CHIAVE[tipo]] === chiave);
        if (!oggetto) return;
        STATO.aperta = { tipo, chiave };
        $('stats-modal-corpo').innerHTML = tipo === 'players' ? schedaPlayer(oggetto) : tipo === 'teams' ? schedaTeam(oggetto) : schedaPokemon(oggetto);
        const modale = $('stats-modal');
        if (modale.hidden) ultimoFocus = document.activeElement;
        modale.hidden = false;
        document.body.classList.add('modale-aperta');
        $('stats-modal-chiudi').focus();
        modale.querySelector('.stats-modal-card').scrollTop = 0;
    }

    function chiudiScheda() {
        const modale = $('stats-modal');
        if (modale.hidden) return;
        modale.hidden = true;
        STATO.aperta = null;
        document.body.classList.remove('modale-aperta');
        if (ultimoFocus && ultimoFocus.focus) ultimoFocus.focus();
    }


    // -----------------------------------------------------
    // Eventi
    // -----------------------------------------------------
    function collega() {
        document.querySelectorAll('.stats-tag .tag').forEach(b => b.addEventListener('click', () => {
            if (STATO.tab === b.dataset.tab) return;
            STATO.tab = b.dataset.tab;
            disegnaTag();
            disegnaTabella();
            aggiornaUrl();
        }));
        $('sel-stagione').addEventListener('change', e => {
            STATO.stagione = e.target.value;
            STATO.ordine = {};          // l'ordine di partenza dipende dalla stagione (Elo / punti)
            disegna();
        });
        $('sel-formato').addEventListener('change', e => { STATO.formato = e.target.value; disegna(); });
        $('cerca').addEventListener('input', e => { STATO.cerca = e.target.value; disegnaTabella(); });

        const tabella = $('stats-tabella');
        tabella.addEventListener('click', e => {
            const ordina = e.target.closest('[data-ordina]');
            if (ordina) {
                const tab = STATO.tab;
                const id = ordina.dataset.ordina;
                const attuale = STATO.ordine[tab] || ordinePredefinito(tab);
                const col = COLONNE[tab]().find(c => c.id === id);
                STATO.ordine[tab] = attuale.id === id ? { id, dir: -attuale.dir } : { id, dir: col ? col.dir : -1 };
                disegnaTabella();
                return;
            }
            const riga = e.target.closest('tr.riga');
            if (riga) apriScheda(STATO.tab, riga.dataset.chiave);
        });
        tabella.addEventListener('keydown', e => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.riga')) {
                e.preventDefault();
                apriScheda(STATO.tab, e.target.dataset.chiave);
            }
        });

        const modale = $('stats-modal');
        modale.addEventListener('click', e => {
            if (e.target === modale) return chiudiScheda();
            const apri = e.target.closest('[data-apri]');
            // dalla scheda di un giocatore, di un team o di un Pokémon si passa a un'altra
            if (apri) apriScheda(apri.dataset.apri, apri.dataset.chiave);
        });
        $('stats-modal-chiudi').addEventListener('click', chiudiScheda);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudiScheda(); });

        // Un'immagine che non si carica non manda in errore il suo contenitore: si prende in cattura
        for (const id of ['stats-tabella', 'stats-modal']) {
            $(id).addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.dataset.slug) spriteDiRiserva(e.target); }, true);
        }
    }


    // -----------------------------------------------------
    // Caricamento dei dati
    // -----------------------------------------------------
    function nascondiLoader() {
        const loader = $('poke-loader');
        if (!loader) return;
        loader.style.transition = 'opacity 0.3s ease';
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 300);
    }

    function messaggio(html) {
        $('stats-riepilogo').innerHTML = '';
        $('stats-tabella').innerHTML = `<p class="vuoto">${html}</p>`;
    }

    async function carica() {
        try {
            const [seasons, players] = await Promise.all([db.ref('seasons').once('value'), db.ref('players').once('value')]);
            STATO.dati = { seasons: seasons.val() || {}, players: players.val() || {} };
            disegna();
        } catch (errore) {
            console.error('Statistics not loaded', errore);
            const nonAutorizzato = errore && (errore.code === 'PERMISSION_DENIED' || /permission/i.test(errore.message || ''));
            messaggio(nonAutorizzato && !auth.currentUser
                ? 'Log in to see the statistics. <br><button type="button" class="btn-accedi" onclick="toggleLoginModal()">Login</button>'
                : "The statistics couldn't be loaded. Check your connection and reload the page.");
        } finally {
            nascondiLoader();
        }
    }

    function leggiUrl() {
        const p = new URLSearchParams(location.search);
        if (['players', 'teams', 'pokemon'].includes(p.get('tab'))) STATO.tab = p.get('tab');
        if (p.get('season')) STATO.stagione = p.get('season');
        if (p.get('format')) STATO.formato = p.get('format');
    }

    leggiUrl();
    collega();
    // Si carica dopo che Firebase ha ripreso la sessione, e di nuovo se l'utente cambia (login)
    auth.onAuthStateChanged(utente => {
        const uid = utente ? utente.uid : null;
        if (STATO.ultimoUid === uid) return;
        STATO.ultimoUid = uid;
        carica();
    });
})();
