// =====================================================
// PAGINA PUBBLICA — Poké-Tournament
//
// La pagina pubblica di un allenatore è la sua "carta di presentazione". Ogni allenatore può
// cambiarla: layout, quali blocchi mostrare e dove, sfondo, stile della carta, adesivi, quali
// statistiche e quale team mettere in vista. La configurazione sta in
//
//     players/{id}/info/pagina
//
// Questo file è lo schema di quella configurazione, senza niente che tocchi il DOM o Firebase,
// così lo usano uguale la pagina (window.PaginaPubblica) e i test (require):
//   - le liste di ciò che si può scegliere (layout, blocchi, sfondi, temi, adesivi...);
//   - normalizza(): qualunque cosa ci sia nel database diventa una configurazione valida. Il
//     database è scrivibile dall'allenatore e letto da tutti, quindi ogni valore passa da una
//     lista di scelte ammesse o da un intervallo; niente testo libero arriva mai alla pagina;
//   - funzioni pure per spostare i blocchi, calcolare lo sfondo, le variabili CSS, il codice a
//     barre della tessera e la configurazione a sorpresa.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.PaginaPubblica = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSIONE = 1;
    const ZONE = ['a', 'b', 'c'];
    const MAX_ADESIVI = 12;

    // ---- Cosa si può scegliere ----------------------------------------------------------------

    // Le zone hanno un significato diverso in ogni layout; i blocchi invece vanno in una zona e basta,
    // così cambiando layout la disposizione resta sensata.
    const LAYOUT = {
        carta:   { nome: 'Trainer Card', desc: 'One big card, like a real ID',        zone: { a: 'Left panel',  b: 'Right panel',      c: 'Bottom strip' } },
        poster:  { nome: 'Poster',       desc: 'Stacked rows, full width',            zone: { a: 'Top row',     b: 'Middle row',       c: 'Bottom row' } },
        dossier: { nome: 'Dossier',      desc: 'A side column and a main column',     zone: { a: 'Side column', b: 'Main column',      c: 'Under the main column' } },
        collage: { nome: 'Collage',      desc: 'Loose tiles, a bit crooked',          zone: { a: 'First row',   b: 'Second row',       c: 'Third row' } }
    };

    const BLOCCHI = {
        palco:       { nome: 'Stage',    desc: 'Your trainer and favourite Pokémon' },
        identita:    { nome: 'Name',     desc: 'Name, title and motto' },
        statistiche: { nome: 'Stats',    desc: 'Ranking, points and win rates' },
        party:       { nome: 'Party',    desc: 'The team you want to show off' },
        trofei:      { nome: 'Trophies', desc: 'Season trophies' },
        medaglie:    { nome: 'Medals',   desc: 'Streak badges' },
        musica:      { nome: 'Music',    desc: 'Your favourite song' }
    };

    const STAT = {
        rank:    { nome: 'Ranking' },
        punti:   { nome: 'Global points' },
        sd:      { nome: 'Showdown rate' },
        match:   { nome: 'Match rate' },
        set:     { nome: 'Set rate' },
        formato: { nome: 'Best format' }
    };

    const MOTIVI = {
        nessuno:  'Plain',
        punti:    'Dots',
        righe:    'Stripes',
        griglia:  'Grid',
        zigzag:   'Zigzag',
        scacchi:  'Checkers',
        anelli:   'Rings',
        raggi:    'Sunburst',
        pokeball: 'Pokéballs'
    };

    // colore: null = il colore dell'allenatore
    const TEMI = {
        bianco:  { nome: 'White',  colore: '#ffffff' },
        colore:  { nome: 'Trainer colour', colore: null },
        giallo:  { nome: 'Yellow', colore: '#ffde4d' },
        rosa:    { nome: 'Pink',   colore: '#ff9ecf' },
        azzurro: { nome: 'Sky',    colore: '#8fd3ff' },
        menta:   { nome: 'Mint',   colore: '#a7f3c7' },
        scuro:   { nome: 'Night',  colore: '#17171c' }
    };

    const FONT = {
        josefin: { nome: 'Josefin Sans', pila: "'Josefin Sans', 'Montserrat', sans-serif" },
        archivo: { nome: 'Archivo Black', pila: "'Archivo Black', 'Arial Black', Impact, sans-serif" },
        mono:    { nome: 'Space Mono',   pila: "'Space Mono', 'Courier New', monospace" },
        comic:   { nome: 'Bangers',      pila: "'Bangers', 'Comic Sans MS', 'Marker Felt', cursive" }
    };

    const OMBRE = [0, 6, 10, 16];
    const BORDI = [3, 4, 6];
    const ANGOLI = ['netti', 'tondi'];
    const INCLINAZIONI = { nessuna: 0, lieve: -0.8, forte: -2.2 };

    // glifo: quello che si vede; tinta: lo sfondo dell'adesivo
    const ADESIVI = {
        stella:    { nome: 'Star',     glifo: '★',     tinta: '#ffde4d' },
        fulmine:   { nome: 'Bolt',     glifo: '⚡',    tinta: '#ffffff' },
        fuoco:     { nome: 'Fire',     glifo: '🔥',    tinta: '#ffffff' },
        cuore:     { nome: 'Heart',    glifo: '❤️',    tinta: '#ffffff' },
        corona:    { nome: 'Crown',    glifo: '👑',    tinta: '#ffffff' },
        teschio:   { nome: 'Skull',    glifo: '💀',    tinta: '#ffffff' },
        nota:      { nome: 'Note',     glifo: '🎵',    tinta: '#ffffff' },
        occhi:     { nome: 'Eyes',     glifo: '👀',    tinta: '#ffffff' },
        scintille: { nome: 'Sparkles', glifo: '✨',    tinta: '#ffffff' },
        diamante:  { nome: 'Gem',      glifo: '💎',    tinta: '#ffffff' },
        wow:       { nome: 'WOW!',     glifo: 'WOW!',  tinta: '#ff6b9d', testo: true },
        nuovo:     { nome: 'NEW!',     glifo: 'NEW!',  tinta: '#7cf29a', testo: true },
        gg:        { nome: 'GG',       glifo: 'GG',    tinta: '#ffde4d', testo: true },
        ko:        { nome: 'K.O.',     glifo: 'K.O.',  tinta: '#ff5a3c', testo: true }
    };

    // ---- Configurazione di partenza -----------------------------------------------------------

    const ZONA_DEFAULT = { palco: 'a', musica: 'a', identita: 'b', statistiche: 'b', party: 'c', trofei: 'c', medaglie: 'c' };

    function predefinita() {
        return {
            v: VERSIONE,
            layout: 'carta',
            blocchi: ['palco', 'musica', 'identita', 'statistiche', 'party', 'trofei', 'medaglie']
                .map(id => ({ id, zona: ZONA_DEFAULT[id], on: true })),
            sfondo: { colore: 'giocatore', motivo: 'punti', forza: 2, scritta: true, animato: false },
            carta: { tema: 'bianco', ombra: 10, bordo: 4, angoli: 'netti', inclinazione: 'lieve', font: 'josefin', holo: true },
            statistiche: Object.keys(STAT),
            team: 'auto',
            adesivi: []
        };
    }

    // ---- Normalizzazione ----------------------------------------------------------------------

    // Firebase restituisce un array come oggetto {0:..,1:..} quando mancano degli indici
    function comeElenco(x) {
        if (Array.isArray(x)) return x;
        if (x && typeof x === 'object') return Object.keys(x).sort((p, q) => Number(p) - Number(q)).map(k => x[k]);
        return [];
    }

    const unOf = (valore, ammessi, predefinito) => (ammessi.includes(valore) ? valore : predefinito);
    const booleano = (valore, predefinito) => (typeof valore === 'boolean' ? valore : predefinito);
    const numero = (valore, min, max, predefinito, decimali = 1) => {
        const n = typeof valore === 'number' ? valore : NaN;
        if (!Number.isFinite(n)) return predefinito;
        const f = Math.pow(10, decimali);
        return Math.round(Math.min(max, Math.max(min, n)) * f) / f;
    };

    // "#abc" o "#aabbcc" (qualunque maiuscola) -> "#aabbcc"; altrimenti il valore di riserva
    function esadecimale(valore, riserva) {
        const t = typeof valore === 'string' ? valore.trim() : '';
        let m = /^#([0-9a-f]{3})$/i.exec(t);
        if (m) return ('#' + m[1].split('').map(c => c + c).join('')).toLowerCase();
        m = /^#([0-9a-f]{6})$/i.exec(t);
        return m ? ('#' + m[1]).toLowerCase() : riserva;
    }

    function normalizza(grezza) {
        const D = predefinita();
        if (!grezza || typeof grezza !== 'object' || Array.isArray(grezza)) return D;

        // blocchi: ognuno una volta sola, tutti presenti; i mancanti si accodano nella loro zona di default
        const visti = new Set();
        const blocchi = [];
        for (const b of comeElenco(grezza.blocchi)) {
            if (!b || typeof b !== 'object' || !BLOCCHI[b.id] || visti.has(b.id)) continue;
            visti.add(b.id);
            blocchi.push({ id: b.id, zona: unOf(b.zona, ZONE, ZONA_DEFAULT[b.id]), on: b.on !== false });
        }
        for (const d of D.blocchi) if (!visti.has(d.id)) blocchi.push(d);

        const s = grezza.sfondo && typeof grezza.sfondo === 'object' ? grezza.sfondo : {};
        const c = grezza.carta && typeof grezza.carta === 'object' ? grezza.carta : {};

        const statistiche = [];
        for (const id of comeElenco(grezza.statistiche)) if (STAT[id] && !statistiche.includes(id)) statistiche.push(id);

        const adesivi = [];
        for (const a of comeElenco(grezza.adesivi)) {
            if (adesivi.length >= MAX_ADESIVI) break;
            if (!a || typeof a !== 'object' || !ADESIVI[a.id]) continue;
            adesivi.push({
                id: a.id,
                x: numero(a.x, 0, 100, 50),
                y: numero(a.y, 0, 100, 50),
                s: numero(a.s, 0.6, 2.2, 1),
                r: numero(a.r, -45, 45, 0, 0)
            });
        }

        return {
            v: VERSIONE,
            layout: unOf(grezza.layout, Object.keys(LAYOUT), D.layout),
            blocchi,
            sfondo: {
                colore: s.colore === 'giocatore' ? 'giocatore' : esadecimale(s.colore, D.sfondo.colore),
                motivo: unOf(s.motivo, Object.keys(MOTIVI), D.sfondo.motivo),
                forza: unOf(s.forza, [1, 2, 3], D.sfondo.forza),
                scritta: booleano(s.scritta, D.sfondo.scritta),
                animato: booleano(s.animato, D.sfondo.animato)
            },
            carta: {
                tema: unOf(c.tema, Object.keys(TEMI), D.carta.tema),
                ombra: unOf(c.ombra, OMBRE, D.carta.ombra),
                bordo: unOf(c.bordo, BORDI, D.carta.bordo),
                angoli: unOf(c.angoli, ANGOLI, D.carta.angoli),
                inclinazione: unOf(c.inclinazione, Object.keys(INCLINAZIONI), D.carta.inclinazione),
                font: unOf(c.font, Object.keys(FONT), D.carta.font),
                holo: booleano(c.holo, D.carta.holo)
            },
            statistiche: statistiche.length ? statistiche : D.statistiche,
            // l'id di un team è una chiave di Firebase: solo caratteri innocui
            team: typeof grezza.team === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(grezza.team) ? grezza.team : 'auto',
            adesivi
        };
    }

    const copia = x => JSON.parse(JSON.stringify(x));
    const uguali = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // ---- Blocchi ------------------------------------------------------------------------------

    // { a: [...], b: [...], c: [...] }, nell'ordine in cui compaiono; comprende anche i blocchi spenti
    function blocchiPerZona(config) {
        const per = { a: [], b: [], c: [] };
        for (const b of config.blocchi) per[b.zona].push(b);
        return per;
    }

    /**
     * Sposta un blocco in una zona, in una certa posizione tra i blocchi di quella zona
     * (0 = in cima; un indice troppo grande = in fondo). Restituisce una configurazione nuova.
     */
    function sposta(config, id, zona, indice) {
        const nuova = copia(config);
        if (!ZONE.includes(zona)) return nuova;
        const da = nuova.blocchi.findIndex(b => b.id === id);
        if (da < 0) return nuova;
        const [blocco] = nuova.blocchi.splice(da, 1);
        blocco.zona = zona;

        const dellaZona = nuova.blocchi.map((b, i) => ({ b, i })).filter(x => x.b.zona === zona);
        const k = Math.min(Math.max(0, indice | 0), dellaZona.length);
        let posto;
        if (k < dellaZona.length) posto = dellaZona[k].i;
        else if (dellaZona.length) posto = dellaZona[dellaZona.length - 1].i + 1;
        else posto = nuova.blocchi.length;
        nuova.blocchi.splice(posto, 0, blocco);
        return nuova;
    }

    function accendi(config, id, on) {
        const nuova = copia(config);
        const b = nuova.blocchi.find(x => x.id === id);
        if (b) b.on = !!on;
        return nuova;
    }

    // ---- Colori e sfondo ----------------------------------------------------------------------

    function rgb(hex) {
        const h = esadecimale(hex, '#000000');
        return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    }

    // 0 (nero) .. 1 (bianco), formula della luminanza relativa semplificata
    function luminanza(hex) {
        const [r, g, b] = rgb(hex);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    const inchiostroSu = hex => (luminanza(hex) < 0.42 ? '#ffffff' : '#000000');

    // t > 0 schiarisce verso il bianco, t < 0 scurisce verso il nero
    function mescola(hex, t) {
        const verso = t < 0 ? 0 : 255;
        const k = Math.abs(t);
        return '#' + rgb(hex).map(v => Math.round(v + (verso - v) * k).toString(16).padStart(2, '0')).join('');
    }

    const SVG_POKEBALL = c =>
        "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>" +
        `<g fill='none' stroke='${c}' stroke-width='3'>` +
        "<circle cx='24' cy='24' r='14'/><path d='M10 24h28'/><circle cx='24' cy='24' r='4'/>" +
        "<circle cx='72' cy='72' r='14'/><path d='M58 72h28'/><circle cx='72' cy='72' r='4'/>" +
        '</g></svg>';

    /**
     * Lo sfondo della pagina: colore di base + motivo disegnato con soli gradienti (o un SVG in linea).
     * `periodo` è la misura in px dopo cui il motivo si ripete: serve per farlo scorrere senza scatti
     * (0 = il motivo non si ripete, quindi non può scorrere).
     */
    function sfondoCss(sfondo, coloreGiocatore) {
        const base = sfondo.colore === 'giocatore' ? esadecimale(coloreGiocatore, '#31c489') : sfondo.colore;
        const alfa = [0, 0.1, 0.18, 0.3][sfondo.forza] ?? 0.18;
        const c = luminanza(base) < 0.42 ? `rgba(255,255,255,${alfa})` : `rgba(0,0,0,${alfa})`;
        const r = (immagine, dimensione, posizione, periodo) =>
            ({ colore: base, immagine, dimensione, posizione: posizione || '0 0', periodo });

        switch (sfondo.motivo) {
            case 'punti':
                return r(`radial-gradient(${c} 2.4px, transparent 3px)`, '24px 24px', '0 0', 24);
            case 'righe':
                return r(`repeating-linear-gradient(135deg, ${c} 0 4px, transparent 4px 20px)`, 'auto', '0 0', 0);
            case 'griglia':
                return r(`linear-gradient(${c} 2px, transparent 2px), linear-gradient(90deg, ${c} 2px, transparent 2px)`, '36px 36px', '0 0', 36);
            case 'zigzag':
                return r(
                    `linear-gradient(135deg, ${c} 25%, transparent 25%), linear-gradient(225deg, ${c} 25%, transparent 25%), ` +
                    `linear-gradient(315deg, ${c} 25%, transparent 25%), linear-gradient(45deg, ${c} 25%, transparent 25%)`,
                    '32px 32px', '-16px 0, -16px 0, 0 0, 0 0', 32);
            case 'scacchi':
                return r(`conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`, '64px 64px', '0 0', 64);
            case 'anelli':
                return r(`radial-gradient(circle, transparent 10px, ${c} 10.5px 14px, transparent 14.5px)`, '52px 52px', '0 0', 52);
            case 'raggi':
                return r(`repeating-conic-gradient(from 0deg at 50% 34%, ${c} 0 5deg, transparent 5deg 10deg)`, '100% 100%', '0 0', 0);
            case 'pokeball':
                return r(`url("data:image/svg+xml,${encodeURIComponent(SVG_POKEBALL(c))}")`, '96px 96px', '0 0', 96);
            default:
                return r('none', 'auto', '0 0', 0);
        }
    }

    function temaCarta(tema, coloreGiocatore) {
        const t = TEMI[tema] || TEMI.bianco;
        const superficie = t.colore || esadecimale(coloreGiocatore, '#31c489');
        return { superficie, inchiostro: inchiostroSu(superficie) };
    }

    /** Le variabili CSS (nome -> valore) che descrivono lo stile; la pagina le imposta sul contenitore. */
    function variabiliCss(config, coloreGiocatore) {
        const sf = sfondoCss(config.sfondo, coloreGiocatore);
        const tema = temaCarta(config.carta.tema, coloreGiocatore);
        const giocatore = esadecimale(coloreGiocatore, '#31c489');
        return {
            '--pp-sfondo': sf.colore,
            '--pp-sfondo-img': sf.immagine,
            '--pp-sfondo-dim': sf.dimensione,
            '--pp-sfondo-pos': sf.posizione,
            '--pp-periodo': `${sf.periodo}px`,
            '--pp-sfondo-ink': inchiostroSu(sf.colore),
            '--pp-sup': tema.superficie,
            '--pp-ink': tema.inchiostro,
            '--pp-sup-2': tema.inchiostro === '#ffffff' ? mescola(tema.superficie, 0.12) : mescola(tema.superficie, -0.06),
            '--pp-giocatore': giocatore,
            '--pp-giocatore-ink': inchiostroSu(giocatore),
            '--pp-giocatore-scuro': mescola(giocatore, -0.35),
            '--pp-giocatore-chiaro': mescola(giocatore, 0.55),
            // sulla carta che ha già il colore dell'allenatore il nome sarebbe invisibile: diventa bianco
            '--pp-nome': config.carta.tema === 'colore' ? '#ffffff' : giocatore,
            '--pp-bordo': `${config.carta.bordo}px`,
            '--pp-ombra': `${config.carta.ombra}px`,
            '--pp-raggio': config.carta.angoli === 'tondi' ? '20px' : '0px',
            '--pp-inclina': `${INCLINAZIONI[config.carta.inclinazione]}deg`,
            '--pp-font': FONT[config.carta.font].pila
        };
    }

    // ---- Tessera ------------------------------------------------------------------------------

    function hash(testo) {
        let h = 2166136261;
        for (const ch of String(testo)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
        return h >>> 0;
    }

    /** Larghezze (1..4) delle barre di un codice a barre che dipende solo dal nome: la tessera è sua. */
    function codiceBarre(seme, quante = 36) {
        let x = hash(seme) || 1;
        const barre = [];
        for (let i = 0; i < quante; i++) {
            x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
            barre.push(1 + ((x >>> 24) % 4));
        }
        return barre;
    }

    /** "№ 003": posizione dell'allenatore in ordine alfabetico tra tutti quelli iscritti */
    function numeroTessera(chiave, tutte) {
        const k = String(chiave).toLowerCase();
        const ordine = [...new Set((tutte || []).map(x => String(x).toLowerCase()).concat(k))].sort();
        return String(ordine.indexOf(k) + 1).padStart(3, '0');
    }

    // ---- Statistiche --------------------------------------------------------------------------

    const MIN_SD_CLASSIFICA = 3;

    const percentuale = (vinte, perse) => (vinte + perse > 0 ? Math.round(vinte / (vinte + perse) * 1000) / 10 : null);
    const comePercento = p => (p === null ? '\u2014' : `${p.toFixed(1)}%`);

    /**
     * Le sei statistiche della scheda dell'allenatore, già pronte da mostrare.
     * `giocatori` è il nodo `players` di Firebase: serve a tutti perché la posizione in classifica
     * dipende dagli altri (conta solo chi ha giocato almeno 3 showdown).
     * Ogni voce: { grande, piccolo, pct (0..100 o null), clic (true se apre il grafico dell'ELO) }
     */
    function riepilogoStat(chiave, giocatori) {
        giocatori = giocatori && typeof giocatori === 'object' ? giocatori : {};
        const n = x => Number(x) || 0;
        const individuali = k => (giocatori[k] && giocatori[k].stats && giocatori[k].stats['individual-stats']) || {};
        const id = giocatori[chiave] ? chiave : Object.keys(giocatori).find(k => k.toLowerCase() === String(chiave).toLowerCase());
        const s = id ? individuali(id) : {};

        const vinte = n(s.won), perse = n(s.lost);
        const sdGiocati = n(s.showdownsPlayed), sdVinti = n(s.showdownsWon), sdPersi = Math.max(0, sdGiocati - sdVinti);
        const setV = n(s.setW), setP = n(s.setL);
        const elo = n(s.ranking) || 1000;

        const classifica = Object.keys(giocatori)
            .filter(k => n(individuali(k).showdownsPlayed) >= MIN_SD_CLASSIFICA)
            .map(k => ({ k, elo: n(individuali(k).ranking) || 1000 }))
            .sort((a, b) => b.elo - a.elo);
        const posizione = classifica.findIndex(x => x.k === id) + 1;
        const inClassifica = sdGiocati >= MIN_SD_CLASSIFICA && posizione > 0;

        const formato = s.format || {};
        const nomeFormato = formato['format-name'] && formato['format-name'] !== '-' ? String(formato['format-name']) : '';
        const fV = n(formato['format-showdownsWon']), fP = n(formato['format-showdownsLost']);

        const voce = (v, p) => ({ grande: comePercento(percentuale(v, p)), piccolo: `${v}W \u00b7 ${p}L`, pct: percentuale(v, p), clic: false });
        return {
            rank: {
                grande: inClassifica ? `#${posizione}` : 'Unranked',
                piccolo: inClassifica ? `ELO ${elo}` : `${Math.min(sdGiocati, MIN_SD_CLASSIFICA)}/${MIN_SD_CLASSIFICA} showdowns`,
                pct: null,
                clic: true
            },
            punti: { grande: String(n(s.points)), piccolo: 'league points', pct: null, clic: false },
            sd: voce(sdVinti, sdPersi),
            match: voce(vinte, perse),
            set: voce(setV, setP),
            formato: nomeFormato
                ? { grande: nomeFormato, piccolo: `${fV}W \u00b7 ${fP}L`, pct: percentuale(fV, fP), clic: false }
                : { grande: '\u2014', piccolo: 'no format yet', pct: null, clic: false }
        };
    }

    // ---- A sorpresa ---------------------------------------------------------------------------

    /** Una configurazione di stile a caso; i blocchi, le statistiche e il team restano come sono. */
    function casuale(config, rnd = Math.random) {
        const scegli = lista => lista[Math.floor(rnd() * lista.length) % lista.length];
        const nuova = copia(config);
        const palette = ['#ff6b9d', '#ffde4d', '#7cf29a', '#8fd3ff', '#c4a3ff', '#ff9a4d', '#31c489', '#ff5a3c'];

        nuova.layout = scegli(Object.keys(LAYOUT));
        nuova.sfondo = {
            colore: rnd() < 0.4 ? 'giocatore' : scegli(palette),
            motivo: scegli(Object.keys(MOTIVI).filter(m => m !== 'nessuno')),
            forza: scegli([1, 2, 3]),
            scritta: rnd() < 0.7,
            animato: rnd() < 0.3
        };
        nuova.carta = {
            tema: scegli(Object.keys(TEMI)),
            ombra: scegli(OMBRE.filter(o => o > 0)),
            bordo: scegli(BORDI),
            angoli: scegli(ANGOLI),
            inclinazione: scegli(Object.keys(INCLINAZIONI)),
            font: scegli(Object.keys(FONT)),
            holo: rnd() < 0.8
        };
        const quanti = 3 + Math.floor(rnd() * 4);
        nuova.adesivi = Array.from({ length: quanti }, () => ({
            id: scegli(Object.keys(ADESIVI)),
            x: Math.round(rnd() * 960) / 10 + 2,
            y: Math.round(rnd() * 960) / 10 + 2,
            s: Math.round((0.8 + rnd() * 0.9) * 10) / 10,
            r: Math.round(rnd() * 50 - 25)
        }));
        return normalizza(nuova);
    }

    return {
        VERSIONE, ZONE, MAX_ADESIVI,
        LAYOUT, BLOCCHI, STAT, MOTIVI, TEMI, FONT, OMBRE, BORDI, ANGOLI, INCLINAZIONI, ADESIVI,
        predefinita, normalizza, copia, uguali,
        blocchiPerZona, sposta, accendi,
        esadecimale, luminanza, inchiostroSu, mescola, sfondoCss, temaCarta, variabiliCss,
        codiceBarre, numeroTessera, riepilogoStat, casuale
    };
});
