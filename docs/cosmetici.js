// =====================================================
// COSMETICI DEL NEGOZIO E ECONOMIA — Poké-Tournament
//
// Cose che si comprano con le monete (wallet/{uid}) e cambiano solo l'aspetto.
//   - Il catalogo fisso (CATALOGO): il Pokémon compagno shiny, l'aura dell'allenatore, gli effetti del nome e del palco, i motivi dello sfondo della pagina pubblica. Aggiungere una voce basta a metterla in vendita
//     (gli effetti grafici di una voce nuova stanno in effetti-pagina.css e style-public-card.css).
//   - Le edizioni limitate: voci del catalogo con `edizione: { stagione, nome }`. Si comprano solo finché quella stagione non è chiusa (disponibilita); dopo restano solo a chi le ha comprate.
//   - Le famiglie: avatar (avatar-<n>), colore firma (colore-<rrggbb>) e canzoni (canzone-<impronta dell'indirizzo>) si comprano come le altre cose (PREZZI) e sono UNICHE: quelle che hai sono tue,
//     nessun altro le può avere. Per non lasciare gli altri senza, ognuno ne può avere al massimo LIMITI per tipo: per prenderne un'altra a quota piena se ne rilascia una (gratis), che torna libera
//     per tutti. Il primo avatar, il primo colore e la prima canzone sono gratis per chi ha ancora quello di partenza; chi ne aveva già uno lo ha già (conta come il primo). Si indossa solo
//     quello che si ha, e indossarlo non costa (functions/monete.js: prendi, rilascia, cambia).
//   - Lo shiny di un Pokémon di un team: si compra dal Box (non ha un id: il segno sta nel team, vedi functions/monete.js). Il prezzo dipende dalla specie: PREZZI.shinyPokemon per una
//     "standard", meno per le comuni (Pichu, Magikarp), di più per le forti (pseudo-leggendari, OU), le rare (sub-leggendari) e le leggendarie (FASCE_SHINY; la fascia di ogni specie sta in rarita-pkm.js).
//   - L'economia: PREMI (quanto si guadagna) e PREZZI (quanto costano le famiglie), calibrati sulla stagione tipo con stimaStagione().
// ATTENZIONE: questo file esiste in due copie identiche, functions/cosmetici.js (il server controlla prezzi e acquisti) e docs/cosmetici.js (il sito).
// Modificane una e copiala sull'altra (lo controlla test/monete.test.js). Lo stesso vale per rarita-pkm.js, che questo file legge (nel sito va caricato prima: <script src="rarita-pkm.js">).
//
//   Cosmetici.CATALOGO, Cosmetici.perId(id), Cosmetici.TIPI, Cosmetici.PREMI, Cosmetici.PREZZI
//   Cosmetici.possiede(id, { wallet, info, pagina })   comprato, oppure già in uso (chi usava un motivo che ora è a pagamento lo tiene); per avatar, colori e canzoni: quelli che hai (comprati o in uso)
//   Cosmetici.possedutiDa({ wallet, info, pagina })    l'insieme degli id posseduti del catalogo fisso
//   Cosmetici.motivoBloccato(motivo, contesto)         true se quel motivo dello sfondo è a pagamento e non è posseduto
//   Cosmetici.disponibilita(voce, stagioni)            'si' (si compra), 'presto' (la stagione dell'edizione non c'è ancora) o 'finita' (è chiusa); stagioni = { <idStagione>: <info/status> }; le voci normali: sempre 'si'
//   Cosmetici.stagioniEdizioni()                       gli id delle stagioni a cui sono legate le edizioni limitate (il negozio ne legge lo stato)
//   Cosmetici.idAvatar(testo), idColore(testo), idCanzone(url)   l'id di un avatar (da "…/profile/12.png"), di un colore (da "#FF8800") o di una canzone (dal suo indirizzo)
//   Cosmetici.COLORI_FIRMA, coloreDaId(id)             i colori che si possono scegliere (gli stessi di PALETTE_FIRMA in pagina-pubblica.js) e il colore di un id
//   Cosmetici.eDiDefault(tipo, info)                   ha ancora l'avatar / il colore / la canzone di partenza?
//   Cosmetici.idCorrente(tipo, info)                   l'id dell'avatar / del colore / della canzone che porta adesso ('' se è quello di partenza o nessuno)
//   Cosmetici.LIMITI                                   quanti avatar, colori e canzoni al massimo ha un allenatore: { avatar, colore, canzone }
//   Cosmetici.possedutiDiTipo(tipo, { wallet, info })  gli id di avatar / colori / canzoni che ha: comprati (wallet.posseduti), "di casa" delle versioni precedenti (wallet.casa) e quello che porta
//   Cosmetici.prezzoAcquisto(tipo, { wallet, info })   { prezzo, gratis }: quanto costa prenderne un altro (0 il primo, per chi ha ancora quello di partenza)
//   Cosmetici.prezzoPer(id, { wallet, info })          { prezzo, gratis }: quanto costa un cosmetico del catalogo, o prenderne un altro per gli id degli avatar, dei colori e delle canzoni
//   Cosmetici.stimaStagione({ ... })                   quante monete fa una stagione, per tarare i prezzi
//   Cosmetici.compagnoDelBox(info, teams)              il Pokémon del Box che è il compagno (info.pkmBox = "idTeam|posizione"), se c'è ancora e è davvero lui; altrimenti null (compagno "generico")
//   Cosmetici.compagnoShiny(info, teams)               il compagno è shiny? Se viene dal Box lo è se lo è quel Pokémon del Box; se è generico, se si è comprato e messo il compagno shiny (info.pkmShiny)
//   Cosmetici.prezzoShiny(specie)                      { fascia, nome, prezzo }: quanto costa lo shiny di un Pokémon di quella specie ("standard" se la specie non è nell'elenco delle rarità)
//   Cosmetici.fasciaShiny(specie), Cosmetici.fasceShiny()   la fascia di una specie; l'elenco delle fasce, dalla più economica: [{ fascia, nome, prezzo }]
//   Cosmetici.testoConShiny(testo, indice, nome, specie)  il testo Showdown di un team con "Shiny: Yes" nel Pokémon indicato (lo scrive il server dopo l'acquisto)
//   Cosmetici.senzaShinyAbusivi(testo, teamPrecedente)    toglie "Shiny: Yes" ai Pokémon che non erano già shiny: lo shiny si compra, non si scrive (il Box lo usa al salvataggio)
//
// Funziona nel browser (window.Cosmetici) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./rarita-pkm.js'));
    else radice.Cosmetici = fabbrica(radice.RaritaPkm);
})(typeof self !== 'undefined' ? self : this, function (RaritaPkm) {
    'use strict';

    // ---- Quanto si guadagna -------------------------------------------------------------------
    // Calibrato su Sant'Alvise I (5 allenatori, 27 showdown, 3 set a match): da 90 a 108 set ufficiali a testa (media 97), 17–79 vinti. Con questi premi un allenatore fa
    // circa 550–1000 monete di soli set in una stagione (media ~780), più i bonus; un'amichevole vale poco (2/5, al massimo 10 al giorno): è un bonus, non una miniera.
    const PREMI = {
        set: { ufficiale: { giocato: 5, vinto: 6 }, amichevole: { giocato: 2, vinto: 3 } },     // "vinto" è in più di "giocato": vincere un set di stagione vale 11
        tettoAmichevoliGiorno: 10,
        badge: [0, 25, 50, 100],            // bronzo, argento, oro
        stagioneVinta: 300,
        mvp: 100
    };

    // ---- Quanto costa -------------------------------------------------------------------------
    // Rispetto alla stagione tipo (~780 monete di soli set): un cambio di avatar o di colore è il 13%, di canzone il 19%, uno shiny di un Pokémon di un team "standard" il 51% (mezza stagione: uno shiny è
    // un trofeo; una squadra intera di standard ne costa tre). Il catalogo fisso (qui sotto) vale circa cinque stagioni: un motivo il 32%, un'aura il 51%; l'aura arcobaleno e il compagno shiny una stagione intera.
    const PREZZI = { avatar: 100, colore: 100, canzone: 150, shinyPokemon: 400 };

    // Lo shiny di un Pokémon di un team costa PREZZI.shinyPokemon × il moltiplicatore della fascia della specie (rarita-pkm.js): da un quarto di stagione (comune) a una stagione e mezza (leggendaria).
    // Le fasce sono in ordine, dalla più economica.
    const FASCE_SHINY = {
        comune: { nome: 'Common', moltiplicatore: 0.5 },
        standard: { nome: 'Standard', moltiplicatore: 1 },
        forte: { nome: 'Strong', moltiplicatore: 1.5 },
        raro: { nome: 'Rare', moltiplicatore: 2 },
        mitico: { nome: 'Legendary', moltiplicatore: 3 }
    };

    const TIPI = {
        shiny: { nome: 'Shiny companion', frase: 'Your favourite Pokémon in its shiny colours.' },
        aura: { nome: 'Trainer aura', frase: 'A glow around your trainer on your page.' },
        nome: { nome: 'Name effects', frase: 'Make your name stand out on your page.' },
        palco: { nome: 'Stage effects', frase: 'Animated effects in front of your stage.' },
        sfondo: { nome: 'Page patterns', frase: 'More patterns for the background of your page.' }
    };

    // Edizioni limitate: nessuna per ora. Una voce con `edizione: { stagione, nome }` si vende solo finché quella stagione non è chiusa (vedi disponibilita).

    // `campo`: dove si scrive quando si equipaggia (players/{id}/info/<campo>); per i motivi non c'è: li sceglie l'editor della pagina
    const CATALOGO = [
        { id: 'shiny', tipo: 'shiny', nome: 'Shiny companion', prezzo: 800, campo: 'pkmShiny', descr: 'Your favourite Pokémon, when you pick it from the list, shows up shiny on your page, in the rankings and on share cards. A companion from your Box follows that Pokémon instead.' },
        { id: 'aura-oro', tipo: 'aura', nome: 'Gold aura', prezzo: 400, campo: 'aura', colore: '#ffcc33', descr: 'A warm golden glow around your trainer.' },
        { id: 'aura-fiamma', tipo: 'aura', nome: 'Flame aura', prezzo: 400, campo: 'aura', colore: '#ff5a1f', descr: 'A fiery orange glow.' },
        { id: 'aura-ghiaccio', tipo: 'aura', nome: 'Ice aura', prezzo: 400, campo: 'aura', colore: '#5fd4ff', descr: 'A cold blue glow.' },
        { id: 'aura-arcobaleno', tipo: 'aura', nome: 'Rainbow aura', prezzo: 800, campo: 'aura', colore: '#ff66cc', descr: 'A glow that cycles through every colour.' },
        { id: 'aura-smeraldo', tipo: 'aura', nome: 'Emerald aura', prezzo: 400, campo: 'aura', colore: '#2ee66b', descr: 'A fresh green glow.' },
        { id: 'aura-viola', tipo: 'aura', nome: 'Violet aura', prezzo: 400, campo: 'aura', colore: '#a855ff', descr: 'A mysterious purple glow.' },
        { id: 'aura-rosa', tipo: 'aura', nome: 'Rose aura', prezzo: 400, campo: 'aura', colore: '#ff5fa8', descr: 'A soft pink glow.' },
        { id: 'aura-rosso', tipo: 'aura', nome: 'Crimson aura', prezzo: 400, campo: 'aura', colore: '#ff2d3d', descr: 'A fierce red glow.' },
        { id: 'aura-lime', tipo: 'aura', nome: 'Lime aura', prezzo: 400, campo: 'aura', colore: '#b6ff2e', descr: 'An electric lime glow.' },
        { id: 'nome-oro', tipo: 'nome', nome: 'Gold name', prezzo: 400, campo: 'effettoNome', descr: 'Your name in shimmering gold.' },
        { id: 'nome-neon', tipo: 'nome', nome: 'Neon name', prezzo: 400, campo: 'effettoNome', descr: 'Your name glows in your own colour.' },
        { id: 'nome-fuoco', tipo: 'nome', nome: 'Flame name', prezzo: 400, campo: 'effettoNome', descr: 'Your name on fire.' },
        { id: 'nome-arcobaleno', tipo: 'nome', nome: 'Rainbow name', prezzo: 800, campo: 'effettoNome', descr: 'Colours flow through your name.' },
        { id: 'nome-ghiaccio', tipo: 'nome', nome: 'Ice name', prezzo: 400, campo: 'effettoNome', descr: 'Your name in frosty blue and white.' },
        { id: 'nome-viola', tipo: 'nome', nome: 'Galaxy name', prezzo: 400, campo: 'effettoNome', descr: 'Purple, pink and blue drifting through your name.' },
        { id: 'nome-smeraldo', tipo: 'nome', nome: 'Emerald name', prezzo: 400, campo: 'effettoNome', descr: 'Your name in shimmering green.' },
        { id: 'nome-tramonto', tipo: 'nome', nome: 'Sunset name', prezzo: 400, campo: 'effettoNome', descr: 'Orange, pink and purple, like the sky at dusk.' },
        { id: 'nome-argento', tipo: 'nome', nome: 'Silver name', prezzo: 400, campo: 'effettoNome', descr: 'Polished silver with a passing flash.' },
        { id: 'palco-neve', tipo: 'palco', nome: 'Snowfall', prezzo: 500, campo: 'effettoPalco', descr: 'Snow drifting across your stage.' },
        { id: 'palco-scintille', tipo: 'palco', nome: 'Embers', prezzo: 500, campo: 'effettoPalco', descr: 'Sparks rising from the floor.' },
        { id: 'palco-coriandoli', tipo: 'palco', nome: 'Confetti', prezzo: 500, campo: 'effettoPalco', descr: 'A never-ending victory party.' },
        { id: 'palco-stelle', tipo: 'palco', nome: 'Starlight', prezzo: 500, campo: 'effettoPalco', descr: 'Twinkling stars in front of your stage.' },
        { id: 'sfondo-raggi', tipo: 'sfondo', nome: 'Sunburst', prezzo: 250, motivo: 'raggi', descr: 'Rays from the stage.' },
        { id: 'sfondo-pokeball', tipo: 'sfondo', nome: 'Pokéballs', prezzo: 250, motivo: 'pokeball', descr: 'A field of tiny Poké Balls.' },
        { id: 'sfondo-anelli', tipo: 'sfondo', nome: 'Rings', prezzo: 250, motivo: 'anelli', descr: 'Overlapping rings.' },
        { id: 'sfondo-stelle', tipo: 'sfondo', nome: 'Stars', prezzo: 250, motivo: 'stelle', descr: 'A sky of little stars.' },
        { id: 'sfondo-onde', tipo: 'sfondo', nome: 'Waves', prezzo: 250, motivo: 'onde', descr: 'Soft rolling waves.' }
    ];

    // ---- Le famiglie: avatar e canzoni ---------------------------------------------------------
    // Gli avatar sono immagini/profile/<n>.png con n da 1 a 292, tranne 162 e 168 (come P.elencoAvatar in pagina-pubblica.js)
    const AVATAR_MAX = 292;
    const AVATAR_MANCANTI = [162, 168];
    const avatarValido = n => Number.isInteger(n) && n >= 1 && n <= AVATAR_MAX && !AVATAR_MANCANTI.includes(n);

    const objOr = x => (x && typeof x === 'object' ? x : {});

    // Il colore firma di un allenatore (players/{id}/info/color): il suo, unico, scelto tra questi. ATTENZIONE: è la stessa lista di PALETTE_FIRMA in pagina-pubblica.js (lo controlla test/monete.test.js).
    const COLORI_FIRMA = [
        '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAFFF0', '#BAE1FF', '#D6CAFF', '#E8CAFF', '#FFCAFF', '#FFC2D1',
        '#C25959', '#D48C5F', '#D9B462', '#8F9E6C', '#699E98', '#6B93B0', '#7A89A8', '#9582A3', '#B07D9A', '#C7889B',
        '#FF3333', '#FF8800', '#FFDD00', '#33CC66', '#00BFA5', '#3399FF', '#0055FF', '#7A29FF', '#D11A7A', '#FF4D8D',
        '#FF1744', '#FF5E00', '#FFEA00', '#00FF66', '#00FFCC', '#00F0FF', '#0066FF', '#7B00FF', '#CC00FF', '#FF0099',
        '#FF7B6B', '#F28C28', '#F4C430', '#A7C957', '#2A9D8F', '#1D7874', '#118AB2', '#264653',
        '#5E60CE', '#6A0572', '#AB4E68', '#8D5524', '#5B3A29', '#0B3D2E', '#1B2A49', '#4A1942'
    ];
    const COLORE_DEFAULT = '#31C489';        // quello degli account nuovi (admin.html): finché c'è, il colore è "di partenza"

    /** "https://x.io/immagini/profile/12.png?v=2", "profile/12.png" -> "avatar-12"; '' se non è un avatar della lista (il segnaposto, un'immagine qualunque) */
    function idAvatar(testo) {
        const m = /(?:^|\/)profile\/(\d{1,3})\.png$/i.exec(String(testo == null ? '' : testo).split('?')[0].split('#')[0].trim());
        const n = m ? Number(m[1]) : 0;
        return avatarValido(n) ? `avatar-${n}` : '';
    }

    /** "#FF8800" (o "ff8800") -> "colore-ff8800"; '' se non è un colore a sei cifre */
    function idColore(testo) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(testo == null ? '' : testo).trim());
        return m ? `colore-${m[1].toLowerCase()}` : '';
    }
    /** "colore-ff8800" -> "#FF8800"; '' se non è l'id di un colore */
    function coloreDaId(id) {
        const m = /^colore-([0-9a-f]{6})$/.exec(String(id == null ? '' : id));
        return m ? `#${m[1].toUpperCase()}` : '';
    }

    /** L'impronta (FNV-1a a 32 bit, in esadecimale) dell'indirizzo di una canzone: stabile e uguale nel sito e nel server */
    function impronta(testo) {
        let h = 0x811c9dc5;
        for (let i = 0; i < testo.length; i++) { h ^= testo.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
        return h.toString(16).padStart(8, '0');
    }
    /** "canzone-1a2b3c4d" per l'indirizzo di una canzone; '' se non c'è */
    function idCanzone(url) {
        const u = String(url == null ? '' : url).trim();
        return u ? `canzone-${impronta(u)}` : '';
    }

    const perId = id => {
        const c = CATALOGO.find(x => x.id === id);
        if (c) return c;
        const sid = String(id == null ? '' : id);
        const a = /^avatar-(\d{1,3})$/.exec(sid);
        if (a && avatarValido(Number(a[1]))) return { id: sid, tipo: 'avatar', nome: `Avatar ${Number(a[1])}`, prezzo: PREZZI.avatar };
        if (/^canzone-[0-9a-f]{8}$/.test(sid)) return { id: sid, tipo: 'canzone', nome: 'Song', prezzo: PREZZI.canzone };
        const col = coloreDaId(sid);
        if (col && COLORI_FIRMA.includes(col)) return { id: sid, tipo: 'colore', nome: `Colour ${col}`, prezzo: PREZZI.colore };
        return null;
    };

    /** Ha ancora quello di partenza? Avatar: nessuno, il segnaposto dell'account nuovo o un'immagine fuori dalla lista. Colore: nessuno o il verde degli account nuovi. Canzone: nessuna scelta. */
    function eDiDefault(tipo, info) {
        const i = objOr(info);
        if (tipo === 'avatar') return !idAvatar(i.avatar);
        if (tipo === 'colore') return !idColore(i.color) || String(i.color).trim().toUpperCase() === COLORE_DEFAULT;
        if (tipo === 'canzone') return !String(i.musicaPreferita == null ? '' : i.musicaPreferita).trim();
        return false;
    }

    /** L'id dell'avatar, del colore o della canzone che porta adesso; '' se è quello di partenza o nessuno */
    function idCorrente(tipo, info) {
        const i = objOr(info);
        if (tipo === 'colore') return eDiDefault('colore', i) ? '' : idColore(i.color);
        return tipo === 'avatar' ? idAvatar(i.avatar) : tipo === 'canzone' ? idCanzone(i.musicaPreferita) : '';
    }

    /** I tipi unici che si comprano e si indossano (famiglie) */
    const FAMIGLIE = ['avatar', 'colore', 'canzone'];
    /**
     * Quanti ne può avere al massimo un allenatore (comprati o già suoi): per prenderne un altro, a quota piena, se ne rilascia uno (gratis, torna libero per tutti). I colori sono i più rari (56 nella
     * palette): con pochi per testa bastano anche a una lega grande; gli avatar sono 290, le canzoni quelle della playlist. Si cambiano qui.
     */
    const LIMITI = { avatar: 3, colore: 2, canzone: 3 };

    /** Comprato (wallet.posseduti), oppure già in uso: chi usava un motivo che ora è a pagamento, ha già il compagno shiny o l'aura di adesso, li tiene. Avatar e canzoni non si comprano: vedi sotto */
    function possiede(id, { wallet, info, pagina } = {}) {
        const c = perId(id);
        if (!c) return false;
        if (objOr(objOr(wallet).posseduti)[id]) return true;
        const i = objOr(info);
        if (c.tipo === 'shiny') return !!i.pkmShiny;
        if (c.tipo === 'aura') return i.aura === id;
        if (c.tipo === 'sfondo') return objOr(objOr(pagina).sfondo).motivo === c.motivo;
        // avatar, colori e canzoni: quelli che hai (comprati, o quello che porti: chi lo aveva già prima del negozio lo ha)
        if (FAMIGLIE.includes(c.tipo)) return possedutiDiTipo(c.tipo, { wallet, info: i }).includes(id);
        return false;
    }

    function possedutiDa(contesto) {
        return new Set(CATALOGO.filter(c => possiede(c.id, contesto)).map(c => c.id));
    }

    /** Il motivo dello sfondo è a pagamento e chi guarda non lo possiede? */
    function motivoBloccato(motivo, contesto) {
        const c = CATALOGO.find(x => x.tipo === 'sfondo' && x.motivo === motivo);
        return !!c && !possiede(c.id, contesto);
    }

    /**
     * Le edizioni limitate si comprano solo finché la loro stagione non è chiusa; poi restano solo a chi le ha già (e si possono mettere e togliere come le altre).
     * `stagioni` = { <idStagione>: <seasons/<id>/info/status> }. → 'si' (si può comprare), 'presto' (la stagione non c'è ancora) o 'finita' (la stagione è chiusa). Le voci normali: sempre 'si'.
     */
    function disponibilita(c, stagioni) {
        const e = c && c.edizione;
        if (!e) return 'si';
        const stato = objOr(stagioni)[e.stagione];
        if (stato == null || String(stato).trim() === '') return 'presto';
        return String(stato).trim().toLowerCase() === 'closed' ? 'finita' : 'si';
    }
    /** Gli id delle stagioni a cui sono legate le edizioni limitate */
    const stagioniEdizioni = () => [...new Set(CATALOGO.filter(c => c.edizione).map(c => c.edizione.stagione))];

    /**
     * Gli id di avatar, colori o canzoni (`tipo`) che un allenatore ha: quelli comprati (wallet.posseduti), quello "di casa" delle versioni precedenti (wallet.casa) e quello che porta adesso
     * (chi lo aveva prima del negozio, o lo ha scelto gratis, lo ha già).
     */
    function possedutiDiTipo(tipo, { wallet, info } = {}) {
        const w = objOr(wallet), fuori = new Set();
        for (const [id, v] of Object.entries(objOr(w.posseduti))) { const c = v && perId(id); if (c && c.tipo === tipo) fuori.add(id); }
        const casa = objOr(w.casa)[tipo];
        if (casa && perId(casa) && perId(casa).tipo === tipo) fuori.add(casa);
        const corrente = idCorrente(tipo, info);
        if (corrente) fuori.add(corrente);
        return [...fuori];
    }

    /** Quanto costa prenderne un altro: PREZZI, tranne il primo avatar, il primo colore e la prima canzone di chi ha ancora quello di partenza (gratis) */
    function prezzoAcquisto(tipo, contesto = {}) {
        const gratis = !possedutiDiTipo(tipo, contesto).length;
        return { prezzo: gratis ? 0 : PREZZI[tipo] || 0, gratis };
    }

    /** Quanto costa un cosmetico del catalogo; per gli id degli avatar, dei colori e delle canzoni, quanto costa prenderne un altro (se già lo hai, niente) */
    function prezzoPer(id, contesto = {}) {
        const c = perId(id);
        if (!c) return null;
        if (FAMIGLIE.includes(c.tipo)) return prezzoAcquisto(c.tipo, contesto);
        return { prezzo: c.prezzo, gratis: false };
    }

    // ---- Il compagno: del Box o generico --------------------------------------------------------------
    // Il compagno (info.pkmPreferito) si sceglie dalla lista (generico) o dal proprio Box (info.pkmBox = "idTeam|posizione"). Se viene dal Box è proprio quel Pokémon: è shiny o no come
    // quel Pokémon del team. Il "Shiny companion" del negozio vale solo per il compagno generico.
    const chiaveSpecie = n => String(n == null ? '' : n).toLowerCase().replace(/ /g, '-').replace(/[.'é]/g, '');      // come pulisci() di public-card.js
    const elencoDi = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

    /** Il Pokémon del Box che è il compagno: `teams` è l'elenco dei team ({ id, pokemon }) o l'oggetto id → team. null se il compagno è generico o il Box è cambiato (non è più lui) */
    function compagnoDelBox(info, teams) {
        const i = objOr(info);
        const [idTeam, pos] = String(i.pkmBox == null ? '' : i.pkmBox).split('|');
        const indice = Number(pos);
        if (!idTeam || !Number.isInteger(indice) || indice < 0) return null;
        const lista = Array.isArray(teams) ? teams : Object.entries(objOr(teams)).map(([id, t]) => (t && typeof t === 'object' ? { id, ...t } : null));
        const team = lista.find(t => t && t.id === idTeam);
        const pokemon = team ? elencoDi(team.pokemon)[indice] : null;
        const nome = pokemon && (pokemon.nome || pokemon.name);
        if (!nome || chiaveSpecie(nome) !== chiaveSpecie(i.pkmPreferito)) return null;
        return pokemon;
    }

    /** Il compagno è shiny? Del Box: come quel Pokémon; generico: se ha il compagno shiny (info.pkmShiny) */
    function compagnoShiny(info, teams) {
        const dalBox = compagnoDelBox(info, teams);
        return dalBox ? !!dalBox.shiny : !!objOr(info).pkmShiny;
    }

    // ---- Lo shiny di un Pokémon di un team: il prezzo ---------------------------------------------------
    /** La fascia di una specie ("Garchomp", "Mr. Mime", "calyrexshadow"): 'standard' se l'elenco delle rarità non c'è o non la conosce */
    function fasciaShiny(specie) {
        const f = RaritaPkm && typeof RaritaPkm.fascia === 'function' ? RaritaPkm.fascia(specie) : 'standard';
        return FASCE_SHINY[f] ? f : 'standard';
    }
    const prezzoFascia = fascia => Math.round(PREZZI.shinyPokemon * FASCE_SHINY[fascia].moltiplicatore);
    /** Quanto costa lo shiny di un Pokémon di quella specie: { fascia, nome, prezzo } */
    function prezzoShiny(specie) {
        const fascia = fasciaShiny(specie);
        return { fascia, nome: FASCE_SHINY[fascia].nome, prezzo: prezzoFascia(fascia) };
    }
    /** Le fasce, dalla più economica: [{ fascia, nome, prezzo }] */
    const fasceShiny = () => Object.keys(FASCE_SHINY).map(fascia => ({ fascia, nome: FASCE_SHINY[fascia].nome, prezzo: prezzoFascia(fascia) }));

    // ---- Lo shiny di un Pokémon di un team: il testo Showdown -----------------------------------------
    // Il simulatore legge il testo Showdown del team (campo testoShowdown): lo shiny è una riga "Shiny: Yes" nel blocco del Pokémon. Qui si aggiunge (dopo l'acquisto) e si toglie
    // quando non è stato comprato (al salvataggio di un team dal Box).
    const idSpecie = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');

    /** La specie scritta nella prima riga di un blocco Showdown: "Soprannome (Specie) (M) @ Strumento", "Specie @ Strumento", "Specie" */
    function specieDiRiga(riga) {
        const r = String(riga || '').split(' @ ')[0].replace(/\s+\((?:M|F)\)\s*$/, '').trim();
        const m = /^(.*\S)\s+\(([^()]+)\)$/.exec(r);
        return (m ? m[2] : r).trim();
    }

    /** I blocchi di un testo Showdown: `pezzi` (blocchi e separatori in alternanza, per ricomporlo uguale) e `blocchi` (le posizioni di quelli che sono Pokémon: almeno due righe, come importaTeam) */
    function bloccatura(testo) {
        const pezzi = String(testo == null ? '' : testo).split(/(\r?\n[ \t]*\r?\n)/);
        const blocchi = [];
        pezzi.forEach((b, k) => { if (k % 2 === 0 && b.split(/\r?\n/).filter(r => r.trim()).length >= 2) blocchi.push(k); });
        return { pezzi, blocchi };
    }
    const specieDelBlocco = (pezzi, k) => idSpecie(specieDiRiga(pezzi[k].split(/\r?\n/).find(r => r.trim())));

    /**
     * Il testo Showdown di un team con "Shiny: Yes" nel Pokémon numero `indice` (contando solo i blocchi dei Pokémon). `nome` è la specie che quel Pokémon deve avere: se il blocco non
     * coincide si prova con l'n-esimo blocco di quella specie (n = quante volte compare prima in `specieDegliAltri`, le specie del team in ordine). Ritorna null se non trova il blocco
     * giusto. Il resto del testo (a capo, spazi, righe vuote) resta com'è.
     */
    function testoConShiny(testo, indice, nome, specieDegliAltri = []) {
        const { pezzi, blocchi } = bloccatura(testo);
        let k = blocchi[indice];
        if (k == null || specieDelBlocco(pezzi, k) !== idSpecie(nome)) {
            const prima = specieDegliAltri.slice(0, indice).filter(x => idSpecie(x) === idSpecie(nome)).length;
            k = blocchi.filter(b => specieDelBlocco(pezzi, b) === idSpecie(nome))[prima];
            if (k == null) return null;
        }
        const eol = /\r\n/.test(pezzi[k]) ? '\r\n' : '\n';
        const righe = pezzi[k].split(/\r?\n/);
        const esistente = righe.findIndex(r => /^\s*Shiny\s*:/i.test(r));
        if (esistente >= 0) righe[esistente] = 'Shiny: Yes';
        else {
            const dopo = [/^\s*Level\s*:/i, /^\s*Ability\s*:/i].map(re => righe.findIndex(r => re.test(r))).find(x => x >= 0);
            righe.splice(dopo == null ? righe.findIndex(r => r.trim()) + 1 : dopo + 1, 0, 'Shiny: Yes');
        }
        pezzi[k] = righe.join(eol);
        return pezzi.join('');
    }

    /**
     * Lo shiny si compra, non si scrive: toglie "Shiny: Yes" ai Pokémon che non erano già shiny nel team di prima. Si confronta per specie (un team di prima con un Garchomp shiny
     * ne lascia uno), così riordinare i Pokémon non fa perdere niente e cambiare specie sì.
     * @param {string} testo  il testo che si sta salvando
     * @param {{ pokemon?: Array<{ nome: string, shiny?: boolean }> } | null} precedente  il team com'era salvato (null per un team nuovo)
     */
    function senzaShinyAbusivi(testo, precedente) {
        const credito = {};
        const prima = precedente && precedente.pokemon;
        for (const p of Array.isArray(prima) ? prima : Object.values(objOr(prima))) if (p && p.shiny) credito[idSpecie(p.nome)] = (credito[idSpecie(p.nome)] || 0) + 1;
        const { pezzi, blocchi } = bloccatura(testo);
        for (const k of blocchi) {
            const eol = /\r\n/.test(pezzi[k]) ? '\r\n' : '\n';
            const righe = pezzi[k].split(/\r?\n/);
            const riga = righe.findIndex(r => /^\s*Shiny\s*:\s*Yes\b/i.test(r));
            if (riga < 0) continue;
            const id = specieDelBlocco(pezzi, k);
            if (credito[id] > 0) { credito[id]--; continue; }
            righe.splice(riga, 1);
            pezzi[k] = righe.join(eol);
        }
        return pezzi.join('');
    }

    // ---- La stima di una stagione ---------------------------------------------------------------
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    /**
     * Quante monete fa un allenatore in una stagione. Serve a tarare PREMI e PREZZI (test/monete.test.js la confronta con i numeri di Sant'Alvise I).
     * @param {{ setUfficiali?: number, setVinti?: number, amichevoliSet?: number, amichevoliVinti?: number, giorniAmichevoli?: number, badge?: number, stagioneVinta?: boolean, mvp?: boolean }} p
     *   badge: le monete dei badge presi; giorniAmichevoli: in quanti giorni diversi ha giocato amichevoli (vale il tetto al giorno)
     */
    function stimaStagione(p = {}) {
        const o = PREMI.set.ufficiale, a = PREMI.set.amichevole;
        const set = num(p.setUfficiali) * o.giocato + num(p.setVinti) * o.vinto;
        const amichevoli = Math.min(num(p.amichevoliSet) * a.giocato + num(p.amichevoliVinti) * a.vinto, num(p.giorniAmichevoli) * PREMI.tettoAmichevoliGiorno);
        const badge = num(p.badge);
        const stagione = p.stagioneVinta ? PREMI.stagioneVinta : 0;
        const mvp = p.mvp ? PREMI.mvp : 0;
        return { set, amichevoli, badge, stagione, mvp, totale: set + amichevoli + badge + stagione + mvp };
    }

    return { PREMI, PREZZI, LIMITI, FASCE_SHINY, CATALOGO, TIPI, FAMIGLIE, COLORI_FIRMA, COLORE_DEFAULT, perId, possiede, possedutiDa, motivoBloccato, disponibilita, stagioniEdizioni, idAvatar, idColore, coloreDaId, idCanzone, eDiDefault, idCorrente, possedutiDiTipo, prezzoAcquisto, prezzoPer, stimaStagione, compagnoDelBox, compagnoShiny, fasciaShiny, prezzoShiny, fasceShiny, idSpecie, testoConShiny, senzaShinyAbusivi, AVATAR_MAX, AVATAR_MANCANTI };
});
