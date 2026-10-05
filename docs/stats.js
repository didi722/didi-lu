// =====================================================
// STATS — interfaccia della pagina delle statistiche
//
// I numeri li calcola statistiche.js (funzione pura); qui ci sono solo
// Firebase, i controlli (categoria, stagione, formato, ricerca, ordinamento),
// la griglia di card e la scheda di dettaglio.
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
    const ND = '<span class="nd">—</span>';
    const numero = (n, f = fmt) => (n == null ? ND : f(n));

    const PASSO = 36;                       // card mostrate per volta
    const COLORE_BASE = { players: '#31c489', teams: '#ffbd44', pokemon: '#6fa8ff', usage: '#ff93c8' };

    const STATO = {
        tab: 'players',
        stagione: 'all',
        formato: 'all',
        cerca: '',
        ordine: {},          // tab -> { id, dir }
        limite: PASSO,
        dati: null,          // { seasons, players }
        r: null,             // ultimo risultato di Statistiche.calcola (con r.usage: la lista di UsoGlobale)
        uso: null,           // ultimo risultato di UsoGlobale.calcola
        ultimoUid: undefined,
        aperta: null         // scheda di dettaglio aperta { tipo, chiave }
    };


    // -----------------------------------------------------
    // Colori e inclinazione delle card
    // -----------------------------------------------------
    // Testo nero o bianco a seconda di quanto è scuro il colore del player
    function testoSu(colore) {
        let h = String(colore || '').replace('#', '');
        if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('');
        h = h.slice(0, 6);
        if (!/^[0-9a-f]{6}$/i.test(h)) return '#000';
        const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255)
            .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179 ? '#fff' : '#000';
    }
    const stileColore = (colore, base) => {
        const c = coloreSicuro(colore) || base;
        return `--c:${c};--t:${testoSu(c)}`;
    };
    // Sempre la stessa inclinazione per la stessa card (non "balla" quando si riordina)
    function inclinazione(chiave) {
        let h = 7;
        for (const ch of String(chiave)) h = (h * 31 + ch.charCodeAt(0)) | 0;
        return ((Math.abs(h) % 201) / 100 - 1).toFixed(2);
    }


    // -----------------------------------------------------
    // Sprite dei Pokémon
    //   GIF animate di Showdown; se mancano (Pokémon nuovi, forme alternative)
    //   si prova la GIF in stile Gen 5, poi i PNG, poi la forma base, poi
    //   Pokémon Database, e solo alla fine la Poké Ball.
    // -----------------------------------------------------
    const SD = 'https://play.pokemonshowdown.com/sprites';
    const POKEBALL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
    // specie il cui nome base contiene già un trattino
    const BASI_CON_TRATTINO = ['ho-oh', 'porygon-z', 'jangmo-o', 'hakamo-o', 'kommo-o',
        'wo-chien', 'chien-pao', 'ting-lu', 'chi-yu', 'nidoran-f', 'nidoran-m'];

    const senzaAccenti = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const toId = t => senzaAccenti(t).toLowerCase().replace(/[^a-z0-9]/g, '');

    function pulisciSpecie(specie) {
        let s = String(specie || '').trim().replace(/\s*\((?:m|f)\)\s*$/i, '');   // "Garchomp (M)"
        const m = s.match(/\(([^()]+)\)\s*$/);                                     // "Soprannome (Garchomp)"
        if (m) s = m[1].trim();
        return s;
    }

    function idSprite(specie) {
        const s = senzaAccenti(pulisciSpecie(specie)).toLowerCase();
        let base = s, forma = '';
        const conTrattino = BASI_CON_TRATTINO.find(b => s === b || s.startsWith(b + '-'));
        if (conTrattino) { base = conTrattino; forma = s.slice(conTrattino.length + 1); }
        else if (s.includes('-')) { base = s.slice(0, s.indexOf('-')); forma = s.slice(s.indexOf('-') + 1); }
        const idBase = toId(base);
        return {
            completo: forma ? `${idBase}-${toId(forma)}` : idBase,   // stesso schema di Showdown: "urshifu-rapidstrike"
            base: idBase,
            db: base.replace(/[.'’:]/g, '').trim().replace(/\s+/g, '-')   // Pokémon Database: "mr-mime", "great-tusk"
        };
    }

    const CATENE = new Map();      // chiave -> lista di indirizzi da provare
    const RIUSCITO = new Map();    // chiave -> indice dell'indirizzo che ha funzionato

    function catenaSprite(specie, animato) {
        const chiave = (animato ? 'a:' : 's:') + specie;
        if (CATENE.has(chiave)) return chiave;
        const { completo, base, db } = idSprite(specie);
        const per = id => (animato
            ? [`${SD}/ani/${id}.gif`, `${SD}/gen5ani/${id}.gif`, `${SD}/dex/${id}.png`, `${SD}/gen5/${id}.png`]
            : [`${SD}/dex/${id}.png`, `${SD}/gen5/${id}.png`, `${SD}/gen5ani/${id}.gif`, `${SD}/ani/${id}.gif`]);
        const lista = [...per(completo)];
        if (base && base !== completo) lista.push(...per(base));
        if (db) lista.push(`https://img.pokemondb.net/sprites/home/normal/${db}.png`);
        lista.push(POKEBALL);
        CATENE.set(chiave, [...new Set(lista)]);
        return chiave;
    }

    function sprite(specie, classe, animato = true) {
        const chiave = catenaSprite(specie, animato);
        const i = RIUSCITO.get(chiave) || 0;
        return `<img class="${classe}" src="${esc(CATENE.get(chiave)[i])}" data-sprite="${esc(chiave)}" data-i="${i}" alt="" loading="lazy">`;
    }

    // Un'immagine che non si carica passa all'indirizzo successivo; quella che funziona viene ricordata
    document.addEventListener('error', e => {
        const img = e.target;
        if (!img || img.tagName !== 'IMG' || !img.dataset.sprite) return;
        const lista = CATENE.get(img.dataset.sprite);
        const i = Number(img.dataset.i || 0) + 1;
        if (!lista || i >= lista.length) return;
        img.dataset.i = String(i);
        img.src = lista[i];
    }, true);
    document.addEventListener('load', e => {
        const img = e.target;
        if (!img || img.tagName !== 'IMG' || !img.dataset.sprite) return;
        const lista = CATENE.get(img.dataset.sprite);
        const i = Number(img.dataset.i || 0);
        RIUSCITO.set(img.dataset.sprite, i);
        img.classList.toggle('e-pokeball', !!lista && lista[i] === POKEBALL);
    }, true);


    // -----------------------------------------------------
    // Pezzi di HTML
    // -----------------------------------------------------
    const wl = o => (!o || !o.giocati
        ? ND
        : `<span class="wl"><b class="v">${fmt(o.vinti)}</b><i>–</i><b class="p">${fmt(o.persi)}</b></span>`);

    const barra = n => (n == null ? '' :
        `<span class="barra"><span style="width:${Math.max(0, Math.min(100, n))}%"></span></span>`);

    const koWl = ko => (!ko || !ko.setConDati ? ND
        : `<span class="wl"><b class="v">${fmt(ko.fatti)}</b><i>–</i><b class="p">${fmt(ko.subiti)}</b></span>`);
    const koDiff = ko => (!ko || !ko.setConDati ? '' : `<small class="sub ${ko.differenza >= 0 ? 'v' : 'p'}">${segno(ko.differenza)}</small>`);

    const trofei = (vinti, giocate) => `<span class="trofei${vinti ? ' ha' : ''}"><img src="immagini/season-winner-color.png" alt="" width="18" height="18"><b>${fmt(vinti)}</b>${giocate != null ? `<small>/ ${fmt(giocate)}</small>` : ''}</span>`;

    const avatar = (p, classe) => `<img class="${classe}" src="${esc(p.avatar || 'immagini/magikarp.png')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='immagini/magikarp.png'">`;

    // le medagliette dei badge del team (badge-team.js) sulla sua card
    const miniBadgeTeam = t => {
        if (!window.BadgeTeam) return '';
        const m = BadgeTeam.htmlMini(BadgeTeam.calcola(t), 4);
        return m ? `<div class="carta-badge-team">${m}</div>` : '';
    };

    const chipPlayer = nome => `<span class="chip-player">${esc(nome)}</span>`;
    const tagFormato = f => `<span class="tag-formato">${esc(f || '—')}</span>`;
    const chipStagione = () => `<span class="chip chip-nero">${esc(nomeStagione())}</span>`;
    const chipVinte = n => (n ? `<span class="chip chip-oro"><img src="immagini/season-winner-color.png" alt="" width="18" height="18"> ${fmt(n)} season${n === 1 ? '' : 's'} won</span>` : '');


    // -----------------------------------------------------
    // Statistiche di ogni categoria
    //   id, titolo, tip, val (per ordinare), dir (verso di partenza),
    //   html (il numero), sotto (riga piccola sotto il numero), testo (solo per ordinare, non è un numero)
    // -----------------------------------------------------
    const STAT = {
        players: () => [
            { id: 'elo', titolo: 'Elo', val: p => p.elo, dir: -1,
                tip: STATO.stagione === 'all' ? "The trainer's ranking" : 'Rating at the end of the season (change below)',
                html: p => numero(p.elo),
                sotto: p => (STATO.stagione === 'all' || !p.eloDelta ? '' : `<small class="sub ${p.eloDelta >= 0 ? 'v' : 'p'}">${segno(p.eloDelta)}</small>`) },
            { id: 'punti', titolo: 'Points', val: p => p.punti, dir: -1, tip: 'Match points + 1 for every showdown won',
                html: p => numero(p.punti) },
            { id: 'stagioni', titolo: 'Seasons won', val: p => p.stagioniVinte * 1000 + p.stagioniGiocate, dir: -1, tip: 'Seasons won / seasons played',
                html: p => trofei(p.stagioniVinte, p.stagioniGiocate) },
            { id: 'showdown', titolo: 'Showdowns', val: p => p.showdown.vinti * 1000 - p.showdown.persi, dir: -1, tip: 'Won – lost',
                html: p => wl(p.showdown) },
            { id: 'match', titolo: 'Matches', val: p => p.match.vinti * 1000 - p.match.persi, dir: -1, tip: 'Won – lost',
                html: p => wl(p.match) },
            { id: 'set', titolo: 'Sets', val: p => p.set.vinti * 1000 - p.set.persi, dir: -1, tip: 'Won – lost',
                html: p => wl(p.set) },
            { id: 'perc', titolo: 'Win %', val: p => p.percMatch, dir: -1, tip: 'Matches won',
                html: p => numero(p.percMatch, pct), sotto: p => barra(p.percMatch) },
            { id: 'serie', titolo: 'Best streak', val: p => p.serie.vittorieMax, dir: -1, tip: 'Most matches won in a row',
                html: p => numero(p.serie.vittorieMax) },
            { id: 'ko', titolo: 'KOs', val: p => (p.ko.setConDati ? p.ko.differenza : null), dir: -1, tip: "Opponents KO'd – own Pokémon KO'd (difference below)",
                html: p => koWl(p.ko), sotto: p => koDiff(p.ko) },
            { id: 'nome', titolo: 'Name', val: p => p.nome.toLowerCase(), dir: 1, testo: true }
        ],
        teams: () => [
            { id: 'match', titolo: 'Matches', val: t => t.match.vinti * 1000 - t.match.persi, dir: -1, tip: 'Won – lost',
                html: t => wl(t.match) },
            { id: 'perc', titolo: 'Win %', val: t => t.percMatch, dir: -1, tip: 'Matches won',
                html: t => numero(t.percMatch, pct), sotto: t => barra(t.percMatch) },
            { id: 'showdown', titolo: 'Showdowns', val: t => t.showdown.vinti * 1000 - t.showdown.persi, dir: -1, tip: 'Won – lost, in the showdowns where the team was used',
                html: t => wl(t.showdown) },
            { id: 'set', titolo: 'Sets', val: t => t.set.vinti * 1000 - t.set.persi, dir: -1, tip: 'Won – lost',
                html: t => wl(t.set) },
            { id: 'stagioni', titolo: 'Seasons won', val: t => t.stagioniVinte * 1000 + t.stagioniGiocate, dir: -1, tip: 'Seasons won by its trainer in which the team played / seasons played',
                html: t => trofei(t.stagioniVinte, t.stagioniGiocate) },
            { id: 'ko', titolo: 'KOs', val: t => (t.ko.setConDati ? t.ko.differenza : null), dir: -1, tip: "Opponents KO'd – own Pokémon KO'd (difference below)",
                html: t => koWl(t.ko), sotto: t => koDiff(t.ko) },
            { id: 'nome', titolo: 'Name', val: t => t.nome.toLowerCase(), dir: 1, testo: true },
            { id: 'player', titolo: 'Trainer', val: t => t.playerNome.toLowerCase(), dir: 1, testo: true },
            { id: 'formato', titolo: 'Format', val: t => String(t.formato || '').toLowerCase(), dir: 1, testo: true }
        ],
        pokemon: () => [
            { id: 'ko', titolo: 'KOs', val: m => (m.setConDati ? m.koFatti : null), dir: -1, tip: "Opponents it KO'd (direct moves + indirect)",
                html: m => (m.setConDati ? fmt(m.koFatti) : ND),
                sotto: m => (m.setConDati && m.koFatti ? `<small class="sub">${fmt(m.koDiretti)} direct</small>` : '') },
            { id: 'quota', titolo: 'KO share', val: m => m.quotaKo, dir: -1, tip: "Part of its team's KOs scored by this Pokémon",
                html: m => numero(m.quotaKo, pct), sotto: m => barra(m.quotaKo) },
            { id: 'portato', titolo: 'Used', val: m => (m.setConDati ? m.portato : null), dir: -1, tip: 'Sets it was brought to / sets of its team with data',
                html: m => (m.setConDati ? `${fmt(m.portato)}<small>/${fmt(m.setConDati)}</small>` : ND) },
            { id: 'svenuto', titolo: 'Fainted', val: m => (m.portato ? m.svenuto : null), dir: -1, tip: "Times it was KO'd",
                html: m => (m.portato ? fmt(m.svenuto) : ND) },
            { id: 'ultimo', titolo: 'Last standing', val: m => (m.setConDati ? m.ultimo : null), dir: -1, tip: 'Times it was the only Pokémon left on its team (and how many of those sets were won)',
                html: m => (m.setConDati ? fmt(m.ultimo) : ND),
                sotto: m => (m.setConDati && m.ultimo ? `<small class="sub v">${fmt(m.ultimoVinto)} won</small>` : '') },
            { id: 'match', titolo: 'Matches', val: m => m.match.vinti * 1000 - m.match.persi, dir: -1, tip: 'Won – lost, with its team',
                html: m => wl(m.match) },
            { id: 'showdown', titolo: 'Showdowns', val: m => m.showdown.vinti * 1000 - m.showdown.persi, dir: -1, tip: 'Won – lost, with its team',
                html: m => wl(m.showdown) },
            { id: 'stagioni', titolo: 'Seasons won', val: m => m.stagioniVinte, dir: -1, tip: 'Seasons won by its trainer in which its team played',
                html: m => trofei(m.stagioniVinte) },
            { id: 'nome', titolo: 'Name', val: m => m.specie.toLowerCase(), dir: 1, testo: true },
            { id: 'player', titolo: 'Trainer', val: m => m.playerNome.toLowerCase(), dir: 1, testo: true }
        ],
        // uso globale delle specie: dai team iscritti che hanno giocato almeno un set ufficiale (uso-globale.js)
        usage: () => [
            { id: 'uso', titolo: 'Usage', val: x => x.perc, dir: -1, tip: 'Share of the teams that have played at least one official set and include it',
                html: x => numero(x.perc, pct), sotto: x => barra(x.perc) },
            { id: 'team', titolo: 'Teams', val: x => x.team, dir: -1, tip: 'Teams that include it, among those that have played at least one official set (the same team in two seasons counts twice)',
                html: x => numero(x.team) },
            { id: 'giocatori', titolo: 'Trainers', val: x => x.giocatori, dir: -1, tip: 'Different trainers who use it',
                html: x => numero(x.giocatori) },
            { id: 'portato', titolo: 'Brought', val: x => (x.battaglia ? x.battaglia.portato : null), dir: -1, tip: 'Sets it was brought to (only sets played on the site)',
                html: x => (x.battaglia ? fmt(x.battaglia.portato) : ND) },
            { id: 'vinti', titolo: 'Win %', val: x => (x.battaglia ? x.battaglia.percVinti : null), dir: -1, tip: 'Sets won when it was brought',
                html: x => (x.battaglia ? numero(x.battaglia.percVinti, pct) : ND), sotto: x => (x.battaglia ? barra(x.battaglia.percVinti) : '') },
            { id: 'ko', titolo: 'KOs per set', val: x => (x.battaglia ? x.battaglia.koPerSet : null), dir: -1, tip: "Opponents it KO'd per set when brought",
                html: x => (x.battaglia ? fmt(x.battaglia.koPerSet, 1) : ND) },
            { id: 'nome', titolo: 'Name', val: x => x.nome.toLowerCase(), dir: 1, testo: true }
        ]
    };

    // le statistiche che compaiono nelle caselle della card (quella dell'ordinamento va nel box grande)
    const TESSERE = {
        players: ['elo', 'punti', 'stagioni', 'showdown', 'match', 'set', 'perc', 'serie', 'ko'],
        teams: ['match', 'perc', 'showdown', 'set', 'stagioni', 'ko'],
        pokemon: ['ko', 'quota', 'portato', 'svenuto', 'ultimo', 'match'],
        usage: ['uso', 'team', 'giocatori', 'portato', 'vinti', 'ko']
    };

    const CHIAVE = { players: 'id', teams: 'chiave', pokemon: 'chiave', usage: 'specieId' };
    const TITOLO_TAB = { players: 'Players', teams: 'Teams', pokemon: 'Pokémon', usage: 'Usage' };

    // Ordine di partenza: Elo (globali) o punti (stagione) per i giocatori; KO per i Pokémon...
    function ordinePredefinito(tab) {
        if (tab === 'players') return { id: STATO.stagione === 'all' ? 'elo' : 'punti', dir: -1 };
        if (tab === 'teams') return { id: 'match', dir: -1 };
        if (tab === 'usage') return { id: 'uso', dir: -1 };
        return { id: 'ko', dir: -1 };
    }
    const ordineAttuale = tab => STATO.ordine[tab] || ordinePredefinito(tab);

    function righeOrdinate(tab) {
        const lista = STATO.r[tab];
        const stats = STAT[tab]();
        const ord = ordineAttuale(tab);
        const stat = stats.find(s => s.id === ord.id) || stats[0];
        const q = STATO.cerca.trim().toLowerCase();
        const filtrate = !q ? lista : lista.filter(x => {
            const testo = tab === 'players' ? [x.nome]
                : tab === 'teams' ? [x.nome, x.playerNome, ...x.specie]
                    : tab === 'usage' ? [x.nome]
                        : [x.specie, x.team, x.playerNome];
            return testo.some(t => String(t).toLowerCase().includes(q));
        });
        const confronta = (a, b) => {
            const va = stat.val(a), vb = stat.val(b);
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
    // Card
    // -----------------------------------------------------
    const casella = (s, x) => `<div class="dato"${s.tip ? ` title="${esc(s.tip)}"` : ''}>
            <span class="dato-et">${esc(s.titolo)}</span>
            <span class="dato-va">${s.html(x)}</span>${s.sotto ? s.sotto(x) : ''}
        </div>`;

    const punteggio = (s, x) => `<div class="carta-punteggio"${s.tip ? ` title="${esc(s.tip)}"` : ''}>
            <span class="carta-punteggio-et">${esc(s.titolo)}</span>
            <span class="carta-punteggio-va">${s.html(x)}</span>${s.sotto ? s.sotto(x) : ''}
        </div>`;

    function testaCarta(tab, x) {
        if (tab === 'players') {
            return `<span class="carta-av-box">${avatar(x, 'carta-av')}</span>
                <div class="carta-id"><h3 class="carta-nome">${esc(x.nome)}</h3></div>`;
        }
        if (tab === 'teams') {
            return `<div class="carta-id">
                    <h3 class="carta-nome">${esc(x.nome)}</h3>
                    <div class="carta-chip">${chipPlayer(x.playerNome)}${tagFormato(x.formato)}</div>
                    <div class="carta-roster">${x.specie.slice(0, 6).map(s => sprite(s, 'carta-mini')).join('')}</div>
                    ${miniBadgeTeam(x)}
                </div>`;
        }
        if (tab === 'usage') {
            return `<span class="carta-sprite-box">${sprite(x.nome, 'carta-sprite')}</span>
                <div class="carta-id">
                    <h3 class="carta-nome">${esc(x.nome)}</h3>
                    <div class="carta-chip">${x.formati.slice(0, 2).map(f => tagFormato(`${f.formato} ${pct(f.perc)}`)).join('')}</div>
                </div>`;
        }
        return `<span class="carta-sprite-box">${sprite(x.specie, 'carta-sprite')}</span>
            <div class="carta-id">
                <h3 class="carta-nome">${esc(x.specie)}</h3>
                <span class="carta-sotto">${esc(x.team)}</span>
                <div class="carta-chip">${chipPlayer(x.playerNome)}</div>
            </div>`;
    }

    function carta(tab, x, i, grande, tessere) {
        const chiave = x[CHIAVE[tab]];
        const nome = tab === 'pokemon' ? x.specie : x.nome;   // (nelle schede Usage il nome è la specie)
        return `<article class="carta carta-${tab}" role="button" tabindex="0" data-chiave="${esc(chiave)}"
                style="${stileColore(x.colore, COLORE_BASE[tab])};--tilt:${inclinazione(chiave)}deg"
                aria-label="#${i + 1} ${esc(nome)}: open details">
            <span class="carta-pos pos-${i < 3 ? i + 1 : 'x'}" aria-hidden="true">#${i + 1}</span>
            <div class="carta-testa">${testaCarta(tab, x)}${punteggio(grande, x)}</div>
            <div class="carta-dati">${tessere.map(s => casella(s, x)).join('')}</div>
        </article>`;
    }

    function disegnaOrdina() {
        const tab = STATO.tab;
        const ord = ordineAttuale(tab);
        $('stats-ordina').innerHTML = '<span class="stats-ordina-et" aria-hidden="true">Sort by</span>' + STAT[tab]().map(s => {
            const attivo = s.id === ord.id;
            return `<button type="button" class="ordina-chip" data-ordina="${esc(s.id)}" aria-pressed="${attivo}"${s.tip ? ` title="${esc(s.tip)}"` : ''}>${esc(s.titolo)}${attivo
                ? `<span class="freccia" aria-hidden="true">${ord.dir < 0 ? '▼' : '▲'}</span><span class="solo-lettori">${ord.dir < 0 ? ', descending' : ', ascending'}</span>`
                : ''}</button>`;
        }).join('');
    }

    // "Most used by format": con tutti i formati insieme, i primi cinque di ognuno (cliccando si apre la scheda del Pokémon)
    function disegnaUsoFormati() {
        const el = $('stats-uso-formati');
        if (!el) return;
        const f = STATO.uso && STATO.uso.perFormato ? Object.entries(STATO.uso.perFormato) : [];
        if (STATO.tab !== 'usage' || STATO.formato !== 'all' || !f.length) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        el.innerHTML = '<h2 class="uso-formati-titolo">Most used by format</h2><div class="uso-formati-lista">' + f
            .sort((a, b) => b[1].team - a[1].team || a[0].localeCompare(b[0]))
            .map(([nome, x]) => `<section class="uso-formato">
                <h3>${esc(nome)}<small>${fmt(x.team)} team${x.team === 1 ? '' : 's'}</small></h3>
                <ol>${x.specie.slice(0, 5).map(c => `<li><button type="button" class="uso-voce" data-apri="usage" data-chiave="${esc(c.specieId)}" data-formato="${esc(nome)}">
                    ${sprite(c.nome, 'uso-mini')}<span class="uso-nome">${esc(c.nome)}</span><span class="uso-perc">${pct(c.perc)}</span>${barra(c.perc)}</button></li>`).join('')}</ol>
            </section>`).join('') + '</div>';
    }

    function disegnaGriglia() {
        disegnaUsoFormati();
        const tab = STATO.tab;
        const stats = STAT[tab]();
        const ord = ordineAttuale(tab);
        const griglia = $('stats-griglia');
        const altri = $('stats-altri');

        disegnaOrdina();
        griglia.className = `stats-griglia vista-${tab}`;
        griglia.setAttribute('aria-label', `${TITOLO_TAB[tab]}, ${nomeStagione()}`);

        const righe = righeOrdinate(tab);
        if (!righe.length) {
            griglia.innerHTML = messaggioVuoto();
            altri.innerHTML = '';
            return;
        }

        // Il box grande mostra la statistica con cui si ordina (o quella di partenza, se si ordina per nome)
        const attiva = stats.find(s => s.id === ord.id);
        const grande = attiva && !attiva.testo ? attiva : stats.find(s => s.id === ordinePredefinito(tab).id);
        const tessere = TESSERE[tab].filter(id => id !== grande.id).map(id => stats.find(s => s.id === id)).filter(Boolean);

        const visibili = righe.slice(0, STATO.limite);
        griglia.innerHTML = visibili.map((x, i) => carta(tab, x, i, grande, tessere)).join('');

        const resto = righe.length - visibili.length;
        altri.innerHTML = resto > 0
            ? `<button type="button" class="btn-altri" id="btn-altri">Show ${fmt(Math.min(PASSO, resto))} more<small>${fmt(visibili.length)} of ${fmt(righe.length)}</small></button>`
            : '';
    }

    function messaggioVuoto() {
        const q = STATO.cerca.trim();
        if (q) return `<p class="vuoto">Nothing matches “${esc(q)}”.<small>Try a trainer, team or Pokémon name.</small></p>`;
        if (STATO.tab === 'usage') return '<p class="vuoto">No teams have played here yet.<small>Usage counts only the teams that have played at least one official set of a season.</small></p>';
        const beta = STATO.r.stagioni.find(s => s.beta && s.partite > 0);
        if (STATO.stagione === 'all' && beta) {
            return `<p class="vuoto">No matches in the global stats yet.</p>`;
        }
        return '<p class="vuoto">No matches recorded here yet.</p>';
    }

    const nomeStagione = () => {
        if (STATO.stagione === 'all') return 'Global';
        const s = STATO.r && STATO.r.stagioni.find(x => x.id === STATO.stagione);
        return s ? s.nome : STATO.stagione;
    };

    function disegnaRiepilogo() {
        if (STATO.tab === 'usage' && STATO.uso) {
            const u = STATO.uso.totali;
            $('stats-riepilogo').innerHTML = [
                `<span class="chip chip-nero">${esc(nomeStagione())}${STATO.formato !== 'all' ? ` · ${esc(STATO.formato)}` : ''}</span>`,
                `<span class="chip">${fmt(u.team)} team${u.team === 1 ? '' : 's'} played</span>`,
                `<span class="chip">${fmt(u.giocatori)} trainer${u.giocatori === 1 ? '' : 's'}</span>`,
                `<span class="chip">${fmt(u.specie)} different Pokémon</span>`
            ].join('');
            return;
        }
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
        const stagioni = r.stagioni.filter(s => !s.beta);
        const selS = $('sel-stagione');
        if (!selS.dataset.pronto || selS.dataset.n !== String(stagioni.length)) {
            selS.innerHTML = '<option value="all">Global (all seasons)</option>' + stagioni.map(s =>
                `<option value="${esc(s.id)}">${esc(s.nome)}${s.stato ? ` · ${esc(s.stato)}` : ''}</option>`
            ).join('');
            selS.dataset.pronto = '1';
            selS.dataset.n = String(stagioni.length);
        }
        if (STATO.stagione !== 'all' && !stagioni.some(s => String(s.id) === String(STATO.stagione))) {
            STATO.stagione = 'all';
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
        const filtro = () => ({ stagione: STATO.stagione, formato: STATO.formato });
        const calcola = () => Statistiche.calcola(STATO.dati, filtro());
        const usoDi = r => UsoGlobale.calcola(STATO.dati, filtro(), r.pokemon);
        let r = calcola();
        // Un filtro che non esiste (indirizzo vecchio, formato sparito) torna a "tutto"
        if (STATO.stagione !== 'all' && !r.stagioni.some(s => s.id === STATO.stagione)) { STATO.stagione = 'all'; r = calcola(); }
        let uso = usoDi(r);
        // i formati: quelli con partite e quelli con team che hanno giocato (per l'uso)
        const formati = [...new Set([...r.formati, ...uso.formati])].sort((a, b) => a.localeCompare(b));
        if (STATO.formato !== 'all' && !formati.includes(STATO.formato)) { STATO.formato = 'all'; r = calcola(); uso = usoDi(r); }
        r.formati = formati;
        r.usage = uso.specie;
        STATO.uso = uso;
        STATO.r = r;
        STATO.limite = PASSO;
        riempiSelettori();
        disegnaTag();
        disegnaRiepilogo();
        disegnaGriglia();
        aggiornaUrl();
    }


    // -----------------------------------------------------
    // Scheda di dettaglio
    // -----------------------------------------------------
    const tessera = (etichetta, valore, sotto = '', classe = '') =>
        `<div class="tessera ${classe}"><span class="et">${esc(etichetta)}</span><b class="va">${valore}</b>${sotto ? `<small class="so">${sotto}</small>` : ''}</div>`;
    const sezione = (titolo, corpo) => `<section class="scheda-sezione"><h3 class="scheda-titolo">${esc(titolo)}</h3>${corpo}</section>`;
    const griglia = tessere => `<div class="tessere">${tessere.join('')}</div>`;
    const testaScheda = (titolo, figura, chip, premi = '') => `<header class="scheda-testa">
            <h2 class="scheda-nome" id="stats-modal-titolo">${esc(titolo)}</h2>
            <div class="scheda-riga">${figura}<div class="scheda-tag">${chip}</div></div>
            ${premi}
        </header>`;

    // Titolo e badge del giocatore, come nella sua pagina pubblica (titoli.js): al passaggio del mouse
    // (o col fuoco della tastiera) compare la descrizione, con l'avanzamento verso il prossimo livello
    const barraPremio = (pct) => `<span class="premio-barra"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></span>`;
    const ETICHETTA_USO = { played: 'Played', won: 'Won', ko: 'KOs' };

    function premiPlayer(p) {
        if (!window.Titoli) return '';
        const d = (STATO.dati && STATO.dati.players && STATO.dati.players[p.id]) || {};
        const stats = d.stats || {};
        const team = stats['team-stats'] || {};
        const titolo = String((d.info && d.info.title) || '').trim();
        const pezzi = [];

        if (titolo && titolo !== 'No Title') {
            const desc = Titoli.descriviTitolo(titolo, team.typeusage, team.pokemonusage);
            const colore = desc && desc.tipo ? Titoli.TIPI[desc.tipo].colore : '#fff';
            const prog = desc ? desc.progresso : null;
            const righe = !prog ? '' : prog.prossimo
                ? prog.barre.map(b => `<span class="premio-riga"><span>${ETICHETTA_USO[b.c]}: <b>${fmt(b.valore)}</b></span><i>${fmt(b.obiettivo)}</i></span>${barraPremio(b.pct * 100)}`).join('')
                : ['played', 'won', 'ko'].map(c => `<span class="premio-riga"><span>${ETICHETTA_USO[c]}: <b>${fmt(prog.uso[c])}</b></span></span>`).join('');
            const prossimo = prog && prog.prossimo ? `<span class="premio-desc">Next: <b>${esc(prog.prossimo.nome(desc.categoria === 'tipo' ? desc.chiave : desc.nome))}</b></span>`
                : prog ? '<span class="premio-desc">Highest level reached</span>' : '';
            pezzi.push(`<span class="premio premio-titolo" tabindex="0" style="--pc:${esc(colore)};--pt:${esc(testoSu(colore))}">
                <span class="premio-titolo-testo">${esc(titolo)}</span>
                <span class="premio-tip"><span class="premio-nome">${esc(desc ? desc.nome : titolo)}</span>${prossimo}${righe}</span>
            </span>`);
        }

        for (const b of Titoli.badgeSbloccati(stats.badges, p.id)) {
            const avanzamento = b.livello === 'founder' ? '' : `<span class="premio-barra-et">${barraPremio(b.pct)}<small>Current: ${fmt(b.attuale)} / ${fmt(b.obiettivo)}</small></span>`;
            pezzi.push(`<span class="premio premio-badge" tabindex="0">
                <img src="${esc(b.img)}" alt="${esc(b.label)} ${esc(b.livello)}" width="44" height="44">
                <span class="premio-tip"><span class="premio-testa"><span class="premio-nome">${esc(b.label)}</span>${b.data ? `<small>${esc(b.data)}</small>` : ''}</span>
                    <span class="premio-desc">${esc(b.descrizione)}</span>${avanzamento}</span>
            </span>`);
        }
        // i badge dell'allenatore (badge-allenatore.js): sui numeri di tutte le stagioni, qualunque filtro ci sia nella pagina
        if (window.BadgeAllenatore && window.Statistiche) {
            STATO.globale = STATO.globale || Statistiche.calcola(STATO.dati, { stagione: 'all' });
            for (const b of BadgeAllenatore.guadagnati(BadgeAllenatore.calcola(STATO.globale, p.id))) {
                const prossimo = b.prossima == null ? 'Top level reached' : `Next: ${fmt(b.valore)} / ${fmt(b.prossima)} ${esc(b.unita)}`;
                pezzi.push(`<span class="premio premio-badge" tabindex="0">
                    <img src="${esc(b.immagine)}" alt="${esc(b.nome)} ${esc(b.livelloNome)}" width="44" height="44" onerror="BadgeTeam.immagineMancante(this,'${esc(b.icona)}')">
                    <span class="premio-tip"><span class="premio-testa"><span class="premio-nome">${esc(b.nome)}</span><small>${esc(b.livelloNome)}</small></span>
                        <span class="premio-desc">${esc(b.descrizione)}</span>
                        <span class="premio-barra-et">${barraPremio(b.progresso * 100)}<small>${prossimo}</small></span></span>
                </span>`);
            }
        }
        return pezzi.length ? `<div class="scheda-premi">${pezzi.join('')}</div>` : '';
    }

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

    const voceTeam = t => `<button type="button" class="voce" data-apri="teams" data-chiave="${esc(t.chiave)}">
            <span class="voce-nome"><b>${esc(t.nome)}</b>${tagFormato(t.formato)}</span>
            <span class="voce-roster">${t.specie.slice(0, 6).map(x => sprite(x, 'mini')).join('')}</span>
            <span class="voce-dati">${wl(t.match)}<span class="voce-perc">${pct(t.percMatch)}</span></span>
        </button>`;

    function schedaPlayer(p) {
        const suoiTeam = STATO.r.teams.filter(t => t.player === p.id).sort((a, b) => b.match.giocati - a.match.giocati);
        const preferito = p.preferiti.team;
        const formato = p.preferiti.formato;
        return `${testaScheda(p.nome, avatar(p, 'scheda-avatar'), chipStagione() + chipVinte(p.stagioniVinte), premiPlayer(p))}
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
            ${suoiTeam.length ? sezione('Teams', `<div class="scheda-lista">${suoiTeam.map(voceTeam).join('')}</div>`) : ''}`;
    }

    function schedaTeam(t) {
        const suoi = STATO.r.pokemon.filter(m => m.squadra === t.chiave);
        const ordine = [...suoi].sort((a, b) => b.koFatti - a.koFatti || b.portato - a.portato);
        const roster = `<div class="scheda-roster">${t.specie.slice(0, 6).map(x => sprite(x, 'scheda-mini')).join('')}</div>`;
        return `${testaScheda(t.nome, roster, chipPlayer(t.playerNome) + tagFormato(t.formato) + chipStagione() + chipVinte(t.stagioniVinte))}
            ${sezione('Results', tessereRisultati(t) + griglia([
                tessera('Points', fmt(t.punti), 'from its matches'),
                tessera('Seasons', `${fmt(t.stagioniVinte)} <small>won of ${fmt(t.stagioniGiocate)}</small>`),
                tessera('Last used', t.ultimoUso ? esc(t.ultimoUso) : '—')
            ]))}
            ${window.BadgeTeam ? sezione('Badges', BadgeTeam.htmlScaffale(BadgeTeam.calcola(t), { titolo: '' })) : ''}
            ${sezione('KOs', tessereKo(t.ko))}
            ${ordine.length ? sezione('Roster', `<div class="scheda-lista">${ordine.map(m => `
                <button type="button" class="voce" data-apri="pokemon" data-chiave="${esc(m.chiave)}">
                    <span class="voce-nome">${sprite(m.specie, 'voce-sprite')}<b>${esc(m.specie)}</b></span>
                    <span class="voce-dati">${m.setConDati
                        ? `<span><b>${fmt(m.koFatti)}</b> KOs</span><span>used <b>${fmt(m.portato)}</b>/${fmt(m.setConDati)}</span>${m.quotaKo == null ? '' : `<span>${pct(m.quotaKo)} ${barra(m.quotaKo)}</span>`}`
                        : '<span class="nd">no KO data</span>'}</span>
                </button>`).join('')}</div>`) : ''}`;
    }

    function schedaPokemon(m) {
        const t = STATO.r.teams.find(x => x.chiave === m.squadra);
        const dati = m.setConDati > 0;
        const chip = chipPlayer(m.playerNome)
            + `<button type="button" class="chip chip-bottone" data-apri="teams" data-chiave="${esc(m.squadra)}">${esc(m.team)}</button>`
            + tagFormato(m.formato) + chipStagione();
        return `${testaScheda(m.specie, sprite(m.specie, 'scheda-grande'), chip)}
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
            ${t ? sezione('Its team', `<div class="scheda-lista">${voceTeam(t)}</div>`) : ''}`;
    }

    // Un elenco di voci con la barra della percentuale (mosse, strumenti, abilità, nature...)
    const righeUso = (voci, vuoto) => (voci.length
        ? `<ul class="uso-lista">${voci.map(v => `<li class="uso-riga"><span class="uso-nome">${esc(v.nome)}</span>${barra(v.perc)}<b class="uso-perc">${pct(v.perc)}</b></li>`).join('')}</ul>`
        : `<p class="vuoto piccolo">${esc(vuoto)}</p>`);

    function schedaUso(x) {
        const u = STATO.uso && STATO.uso.totali;
        const chip = chipStagione() + (STATO.formato !== 'all' ? tagFormato(STATO.formato) : '')
            + `<span class="chip">${fmt(x.team)} team${x.team === 1 ? '' : 's'}</span>`;
        const b = x.battaglia;
        // le sue schede sono tutte di stagioni a scheda chiusa: gli avversari non vedono nemmeno là cosa porta, quindi qui nemmeno
        const vuotoSet = testo => (x.istanze && !x.setVisibili ? 'Hidden: closed sheet season.' : testo);
        return `${testaScheda(x.nome, sprite(x.nome, 'scheda-grande'), chip)}
            ${sezione('Usage', griglia([
                tessera('Usage', pct(x.perc), `of ${fmt(u ? u.team : 0)} team${u && u.team === 1 ? '' : 's'} that played`),
                tessera('Teams', fmt(x.team), x.team === 1 ? 'team that played' : 'teams that played'),
                tessera('Trainers', fmt(x.giocatori), x.giocatori === 1 ? 'trainer uses it' : 'different trainers'),
                tessera('Sets', fmt(x.setVisibili), x.setVisibili === x.istanze ? 'with its moves, item and ability' : `of ${fmt(x.istanze)}: closed sheet seasons hide the rest`)
            ]))}
            ${sezione('In battle', b ? griglia([
                tessera('Brought', fmt(b.portato), `to ${fmt(b.portato)} of ${fmt(b.setConDati)} sets of its teams`),
                tessera('Win %', pct(b.percVinti), `${fmt(b.vinti)} won · ${fmt(b.persi)} lost`),
                tessera('KOs per set', fmt(b.koPerSet, 1), `${fmt(b.koFatti)} KOs in all`)
            ]) : '<p class="vuoto piccolo">No battle data yet: only sets played on the site have it.</p>')}
            ${sezione('Moves', righeUso(x.mosse, vuotoSet('No moves recorded.')))}
            ${sezione('Items', righeUso(x.strumenti, vuotoSet('No items recorded.')))}
            ${sezione('Abilities', righeUso(x.abilita, vuotoSet('No abilities recorded.')))}
            ${sezione('Natures', righeUso(x.nature, vuotoSet('No natures recorded.')))}
            ${x.tera.length ? sezione('Tera types', righeUso(x.tera, '')) : ''}
            ${x.compagni.length ? sezione('Teammates', `<div class="scheda-lista">${x.compagni.map(c => `
                <button type="button" class="voce" data-apri="usage" data-chiave="${esc(c.specieId)}">
                    <span class="voce-nome">${sprite(c.nome, 'voce-sprite')}<b>${esc(c.nome)}</b></span>
                    <span class="voce-dati"><span>together in <b>${fmt(c.n)}</b> team${c.n === 1 ? '' : 's'}</span><span>${pct(c.perc)} ${barra(c.perc)}</span></span>
                </button>`).join('')}</div>`) : ''}
            ${x.formati.length ? sezione('By format', `<ul class="uso-lista">${x.formati.map(f => `<li class="uso-riga"><span class="uso-nome">${esc(f.formato)}</span>${barra(f.perc)}<b class="uso-perc">${pct(f.perc)}</b><small class="uso-n">${fmt(f.team)} team${f.team === 1 ? '' : 's'}</small></li>`).join('')}</ul>`) : ''}`;
    }

    let ultimoFocus = null;
    function apriScheda(tipo, chiave) {
        const lista = STATO.r[tipo];
        const oggetto = lista && lista.find(x => x[CHIAVE[tipo]] === chiave);
        if (!oggetto) return;
        STATO.aperta = { tipo, chiave };
        const modale = $('stats-modal');
        const card = modale.querySelector('.stats-modal-card');
        const colore = coloreSicuro(oggetto.colore) || COLORE_BASE[tipo];
        card.style.setProperty('--c', colore);
        card.style.setProperty('--t', testoSu(colore));
        $('stats-modal-corpo').innerHTML = tipo === 'players' ? schedaPlayer(oggetto) : tipo === 'teams' ? schedaTeam(oggetto)
            : tipo === 'usage' ? schedaUso(oggetto) : schedaPokemon(oggetto);
        if (modale.hidden) ultimoFocus = document.activeElement;
        modale.hidden = false;
        document.body.classList.add('modale-aperta');
        modale.scrollTop = 0;
        $('stats-modal-chiudi').focus();
    }

    function chiudiScheda() {
        const modale = $('stats-modal');
        if (modale.hidden) return;
        modale.hidden = true;
        STATO.aperta = null;
        document.body.classList.remove('modale-aperta');
        if (ultimoFocus && ultimoFocus.isConnected && ultimoFocus.focus) ultimoFocus.focus();
    }


    // -----------------------------------------------------
    // Eventi
    // -----------------------------------------------------
    function collega() {
        document.querySelectorAll('.stats-tag .tag').forEach(b => b.addEventListener('click', () => {
            if (STATO.tab === b.dataset.tab) return;
            STATO.tab = b.dataset.tab;
            STATO.limite = PASSO;
            disegnaTag();
            disegnaRiepilogo();
            disegnaGriglia();
            aggiornaUrl();
        }));
        $('sel-stagione').addEventListener('change', e => {
            STATO.stagione = e.target.value;
            STATO.ordine = {};          // l'ordine di partenza dipende dalla stagione (Elo / punti)
            disegna();
        });
        $('sel-formato').addEventListener('change', e => { STATO.formato = e.target.value; disegna(); });
        $('cerca').addEventListener('input', e => { STATO.cerca = e.target.value; STATO.limite = PASSO; disegnaGriglia(); });

        $('stats-ordina').addEventListener('click', e => {
            const chip = e.target.closest('[data-ordina]');
            if (!chip) return;
            const tab = STATO.tab;
            const id = chip.dataset.ordina;
            const attuale = ordineAttuale(tab);
            const stat = STAT[tab]().find(s => s.id === id);
            STATO.ordine[tab] = attuale.id === id ? { id, dir: -attuale.dir } : { id, dir: stat ? stat.dir : -1 };
            STATO.limite = PASSO;
            disegnaGriglia();
            const stessa = $('stats-ordina').querySelector(`[data-ordina="${id}"]`);
            if (stessa) stessa.focus();
        });

        const grigliaEl = $('stats-griglia');
        grigliaEl.addEventListener('click', e => {
            const c = e.target.closest('.carta');
            if (c) apriScheda(STATO.tab, c.dataset.chiave);
        });
        grigliaEl.addEventListener('keydown', e => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.carta')) {
                e.preventDefault();
                apriScheda(STATO.tab, e.target.dataset.chiave);
            }
        });

        // "Most used by format": un clic sul Pokémon apre la sua scheda
        const usoFormati = $('stats-uso-formati');
        if (usoFormati) usoFormati.addEventListener('click', e => {
            const v = e.target.closest('[data-apri]');
            if (v) apriScheda(v.dataset.apri, v.dataset.chiave);
        });

        $('stats-altri').addEventListener('click', e => {
            if (!e.target.closest('#btn-altri')) return;
            const prima = STATO.limite;
            STATO.limite += PASSO;
            disegnaGriglia();
            const nuova = $('stats-griglia').children[prima];
            if (nuova) nuova.focus();
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
        $('stats-ordina').innerHTML = '';
        $('stats-altri').innerHTML = '';
        $('stats-griglia').innerHTML = `<p class="vuoto">${html}</p>`;
    }

    async function carica() {
        try {
            const [seasons, players] = await Promise.all([db.ref('seasons').once('value'), db.ref('players').once('value')]);
            STATO.dati = { seasons: seasons.val() || {}, players: players.val() || {} };
            STATO.globale = null;
            disegna();
        } catch (errore) {
            console.error('Statistics not loaded', errore);
            const nonAutorizzato = errore && (errore.code === 'PERMISSION_DENIED' || /permission/i.test(errore.message || ''));
            messaggio(nonAutorizzato && !auth.currentUser
                ? 'Log in to see the statistics.<button type="button" class="btn-accedi" onclick="toggleLoginModal()">Login</button>'
                : "The statistics couldn't be loaded.<small>Check your connection and reload the page.</small>");
        } finally {
            nascondiLoader();
        }
    }

    function leggiUrl() {
        const p = new URLSearchParams(location.search);
        if (['players', 'teams', 'pokemon', 'usage'].includes(p.get('tab'))) STATO.tab = p.get('tab');
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
