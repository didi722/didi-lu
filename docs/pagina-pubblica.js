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

    // larghezza: quanto è largo il carattere rispetto a Josefin Sans (serve a far stare il nome nello spazio)
    const FONT = {
        josefin:   { nome: 'Josefin Sans',     pila: "'Josefin Sans', 'Montserrat', sans-serif",          larghezza: 1 },
        archivo:   { nome: 'Archivo Black',    pila: "'Archivo Black', 'Arial Black', Impact, sans-serif", larghezza: 1.12 },
        bungee:    { nome: 'Bungee',           pila: "'Bungee', 'Arial Black', Impact, sans-serif",        larghezza: 1.22 },
        rubik:     { nome: 'Rubik Mono One',   pila: "'Rubik Mono One', 'Arial Black', sans-serif",        larghezza: 1.32 },
        orbitron:  { nome: 'Orbitron',         pila: "'Orbitron', 'Arial Black', sans-serif",              larghezza: 1.2 },
        righteous: { nome: 'Righteous',        pila: "'Righteous', 'Arial Black', sans-serif",             larghezza: 0.98 },
        fredoka:   { nome: 'Fredoka',          pila: "'Fredoka', 'Comic Sans MS', sans-serif",             larghezza: 0.98 },
        comic:     { nome: 'Bangers',          pila: "'Bangers', 'Comic Sans MS', 'Marker Felt', cursive", larghezza: 0.86 },
        marker:    { nome: 'Permanent Marker', pila: "'Permanent Marker', 'Marker Felt', cursive",         larghezza: 1.02 },
        lobster:   { nome: 'Lobster',          pila: "'Lobster', 'Brush Script MT', cursive",              larghezza: 0.92 },
        playfair:  { nome: 'Playfair Display', pila: "'Playfair Display', Georgia, serif",                 larghezza: 1.02 },
        mono:      { nome: 'Space Mono',       pila: "'Space Mono', 'Courier New', monospace",             larghezza: 1.08 },
        silk:      { nome: 'Silkscreen',       pila: "'Silkscreen', 'Courier New', monospace",             larghezza: 1.22 },
        pixel:     { nome: 'Press Start 2P',   pila: "'Press Start 2P', 'Courier New', monospace",         larghezza: 1.55 }
    };

    // I colori della pagina del profilo, nello stesso ordine (HONEYCOMB_COLORS in profile.html)
    const PALETTE_PROFILO = [
        '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAFFF0', '#BAE1FF', '#D6CAFF', '#E8CAFF', '#FFCAFF', '#FFC2D1',
        '#C25959', '#D48C5F', '#D9B462', '#8F9E6C', '#699E98', '#6B93B0', '#7A89A8', '#9582A3', '#B07D9A', '#C7889B',
        '#FF3333', '#FF8800', '#FFDD00', '#33CC66', '#00BFA5', '#3399FF', '#0055FF', '#7A29FF', '#D11A7A', '#FF4D8D',
        '#FF1744', '#FF5E00', '#FFEA00', '#00FF66', '#00FFCC', '#00F0FF', '#0066FF', '#7B00FF', '#CC00FF', '#FF0099'
    ];

    // Qualcuno in più: terre e scuri profondi (la riga di sotto è per sfondi e carte, non per il colore firma)
    const PALETTE_EXTRA = [
        '#FF7B6B', '#F28C28', '#F4C430', '#A7C957', '#2A9D8F', '#1D7874', '#118AB2', '#264653',
        '#5E60CE', '#6A0572', '#AB4E68', '#8D5524', '#5B3A29', '#0B3D2E', '#1B2A49', '#4A1942'
    ];

    // Neutri, solo per sfondi e carte
    const PALETTE_NEUTRI = ['#FFFFFF', '#FFF4D6', '#E8F7FF', '#EDEDED', '#BDBDBD', '#7A7A7A', '#3A3A40', '#17171C', '#000000'];

    // Il colore firma di un allenatore (info.color): il suo, unico, scelto tra questi
    const PALETTE_FIRMA = [...PALETTE_PROFILO, ...PALETTE_EXTRA];
    // Sfondi e carte: tutti, neutri compresi
    const PALETTE_SFONDO = [...PALETTE_FIRMA, ...PALETTE_NEUTRI];

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
                tema: Object.keys(TEMI).includes(c.tema) ? c.tema : esadecimale(c.tema, D.carta.tema),
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

    // `tema` è il nome di un tema pronto (TEMI) oppure un colore qualunque (#rrggbb)
    function temaCarta(tema, coloreGiocatore) {
        const t = TEMI[tema];
        const superficie = t ? (t.colore || esadecimale(coloreGiocatore, '#31c489')) : esadecimale(tema, '#ffffff');
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
            '--pp-nome': tema.superficie === giocatore ? '#ffffff' : giocatore,
            '--pp-bordo': `${config.carta.bordo}px`,
            '--pp-ombra': `${config.carta.ombra}px`,
            '--pp-raggio': config.carta.angoli === 'tondi' ? '20px' : '0px',
            '--pp-inclina': `${INCLINAZIONI[config.carta.inclinazione]}deg`,
            '--pp-font': FONT[config.carta.font].pila,
            '--pp-font-w': String(FONT[config.carta.font].larghezza)
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

    // ---- Il palco -----------------------------------------------------------------------------

    // Misure in "pixel di progetto" di un palco largo 400 e alto 320 (vedi style-public-card.css)
    const SCENA = {
        ALTEZZA_ALLENATORE: 170,       // l'allenatore, alto 1,70 m
        ALTEZZA_ALLENATORE_M: 1.7,
        POKEMON_MIN: 90,
        POKEMON_MAX: 255,              // quanto può essere alto il Pokémon, sopra al pavimento
        POKEMON_MAX_IN_VOLO: 215,      // chi vola è sollevato da terra: ha meno spazio sopra
        ALLENATORE_MIN: 0.55           // quanto si può rimpicciolire l'allenatore, in proporzione
    };

    /**
     * Quanto sono alti allenatore e Pokémon sul palco. Il Pokémon è in scala con l'allenatore (1,70 m): più
     * alto di lui se lo è davvero. Se è troppo alto per il palco non sfora e non si deforma: si rimpicciolisce
     * tutta la scena, allenatore compreso, così la proporzione resta quella vera. Solo se l'allenatore dovrebbe
     * diventare minuscolo (oltre il 55%) il Pokémon resta al massimo consentito e la proporzione si comprime.
     * @param {number} altezzaM  altezza reale in metri
     * @param {{regola?: 'rimpicciolisci'|'ingrandisci', vola?: boolean}} opzioni
     *        regola: correzioni su misura per certi Pokémon (Kyogre, Wailord, Charizard...)
     * @returns {{allenatore: number, pokemon: number, scala: number, compresso: boolean}}
     */
    function scalaScena(altezzaM, opzioni = {}) {
        const { regola, vola = false } = opzioni;
        const altezza = Number(altezzaM) > 0 ? Number(altezzaM) : 1.2;
        let px = altezza * SCENA.ALTEZZA_ALLENATORE / SCENA.ALTEZZA_ALLENATORE_M;
        if (regola === 'rimpicciolisci') px *= 0.5;
        else if (regola === 'ingrandisci') px *= 1.5;
        else if (altezza < 0.6) px *= 1.6;
        else if (altezza < 1.3) px *= 1.35;
        px = Math.max(px, SCENA.POKEMON_MIN);

        const spazio = vola ? SCENA.POKEMON_MAX_IN_VOLO : SCENA.POKEMON_MAX;
        const scala = Math.max(Math.min(1, spazio / px), SCENA.ALLENATORE_MIN);
        const pokemon = Math.min(px * scala, spazio);
        return {
            allenatore: Math.round(SCENA.ALTEZZA_ALLENATORE * scala),
            pokemon: Math.round(pokemon),
            scala: Math.round(scala * 1000) / 1000,
            compresso: px * scala > spazio + 0.5
        };
    }

    // ---- Cosa si sceglie nel profilo e non si può condividere ----------------------------------

    // Questi campi di players/{id}/info stanno nell'editor della pagina (prima erano in profile.html)
    const CAMPI_PROFILO = ['avatar', 'color', 'bio', 'pkmPreferito', 'title', 'musicName', 'musicaPreferita'];
    const BIO_MAX = 100;

    /** "https://x.io/immagini/profile/3.png?v=2" -> "profile/3.png": le ultime due parti, in minuscolo */
    function chiaveAvatar(testo) {
        if (!testo) return '';
        const percorso = String(testo).split('?')[0].split('#')[0].replace(/^[a-z]+:\/\/[^/]*/i, '');
        return percorso.split('/').filter(Boolean).slice(-2).join('/').toLowerCase().trim();
    }

    /** I numeri dei Pokémon preferiti, delle canzoni... confrontabili: stesse regole di sempre, in minuscolo o senza spazi */
    const chiaveColore = c => String(c || '').trim().toUpperCase();
    const chiavePokemon = n => String(n || '').trim().toLowerCase();
    const chiaveCanzoneNome = n => String(n || '').trim().toLowerCase();
    const chiaveCanzoneUrl = u => String(u || '').trim();

    /**
     * Quello che gli ALTRI allenatori hanno già scelto, e quindi non si può scegliere.
     * @param {string} chiave   l'allenatore che sta scegliendo (i suoi valori non contano)
     * @param {object} giocatori il nodo `players` di Firebase
     */
    function scelteDegliAltri(chiave, giocatori) {
        const presi = { colori: new Set(), avatar: new Set(), pokemon: new Set(), canzoniUrl: new Set(), canzoniNomi: new Set() };
        const io = String(chiave || '').toLowerCase();
        for (const [id, g] of Object.entries(giocatori && typeof giocatori === 'object' ? giocatori : {})) {
            if (String(id).toLowerCase() === io) continue;
            const info = g && g.info;
            if (!info) continue;
            if (info.color) presi.colori.add(chiaveColore(info.color));
            if (info.avatar) presi.avatar.add(chiaveAvatar(info.avatar));
            if (info.pkmPreferito) presi.pokemon.add(chiavePokemon(info.pkmPreferito));
            if (info.musicaPreferita) presi.canzoniUrl.add(chiaveCanzoneUrl(info.musicaPreferita));
            if (info.musicName && String(info.musicName).trim()) presi.canzoniNomi.add(chiaveCanzoneNome(info.musicName));
        }
        return presi;
    }

    /** Quali di queste scelte coincidono con quelle di un altro? (nomi dei campi: color, avatar, pkmPreferito, musica) */
    function conflitti(chiave, scelte, giocatori) {
        const presi = scelteDegliAltri(chiave, giocatori);
        const trovati = [];
        if (scelte.color && presi.colori.has(chiaveColore(scelte.color))) trovati.push('color');
        if (scelte.avatar && presi.avatar.has(chiaveAvatar(scelte.avatar))) trovati.push('avatar');
        if (scelte.pkmPreferito && presi.pokemon.has(chiavePokemon(scelte.pkmPreferito))) trovati.push('pkmPreferito');
        const stessoUrl = scelte.musicaPreferita && presi.canzoniUrl.has(chiaveCanzoneUrl(scelte.musicaPreferita));
        const stessoNome = scelte.musicName && String(scelte.musicName).trim() && presi.canzoniNomi.has(chiaveCanzoneNome(scelte.musicName));
        if (stessoUrl || stessoNome) trovati.push('musica');
        return trovati;
    }

    /** I numeri di avatar disponibili (profile/1.png ... 292, tranne i due che mancano) */
    function elencoAvatar() {
        const lista = [];
        for (let n = 1; n <= 292; n++) if (n !== 162 && n !== 168) lista.push(`${n}.png`);
        return lista;
    }

    /** Un CSV con virgolette ("Nome, con virgola",url) letto come si deve; la prima riga (intestazione) si salta */
    function leggiCsvCanzoni(testo) {
        const righe = String(testo || '').split(/\r?\n/);
        const campi = riga => {
            const fuori = [];
            let corrente = '', virgolette = false;
            for (let i = 0; i < riga.length; i++) {
                const ch = riga[i];
                if (virgolette) {
                    if (ch === '"' && riga[i + 1] === '"') { corrente += '"'; i++; }
                    else if (ch === '"') virgolette = false;
                    else corrente += ch;
                } else if (ch === '"') virgolette = true;
                else if (ch === ',') { fuori.push(corrente); corrente = ''; }
                else corrente += ch;
            }
            fuori.push(corrente);
            return fuori.map(x => x.trim());
        };
        return righe.slice(1).map(campi).filter(c => c[0] && c[1]).map(c => ({ nome: c[0], url: c[1] }));
    }

    // ---- A sorpresa ---------------------------------------------------------------------------

    /** Una configurazione di stile a caso; i blocchi, le statistiche e il team restano come sono. */
    function casuale(config, rnd = Math.random) {
        const scegli = lista => lista[Math.floor(rnd() * lista.length) % lista.length];
        const nuova = copia(config);

        nuova.layout = scegli(Object.keys(LAYOUT));
        nuova.sfondo = {
            colore: rnd() < 0.4 ? 'giocatore' : scegli(PALETTE_SFONDO).toLowerCase(),
            motivo: scegli(Object.keys(MOTIVI).filter(m => m !== 'nessuno')),
            forza: scegli([1, 2, 3]),
            scritta: rnd() < 0.7,
            animato: rnd() < 0.3
        };
        nuova.carta = {
            tema: rnd() < 0.6 ? scegli(Object.keys(TEMI)) : scegli(PALETTE_SFONDO),
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
        LAYOUT, BLOCCHI, STAT, MOTIVI, TEMI, FONT, PALETTE_PROFILO, PALETTE_EXTRA, PALETTE_NEUTRI, PALETTE_FIRMA, PALETTE_SFONDO, OMBRE, BORDI, ANGOLI, INCLINAZIONI, ADESIVI,
        predefinita, normalizza, copia, uguali,
        blocchiPerZona, sposta, accendi,
        esadecimale, luminanza, inchiostroSu, mescola, sfondoCss, temaCarta, variabiliCss,
        CAMPI_PROFILO, BIO_MAX, chiaveAvatar, scelteDegliAltri, conflitti, elencoAvatar, leggiCsvCanzoni,
        SCENA, scalaScena, codiceBarre, numeroTessera, riepilogoStat, casuale
    };
});
