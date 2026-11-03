// =====================================================
// COSMETICI DEL NEGOZIO E ECONOMIA — Poké-Tournament
//
// Cose che si comprano con le monete (wallet/{uid}) e cambiano solo l'aspetto.
//   - Il catalogo fisso (CATALOGO): il Pokémon compagno shiny, l'aura dell'allenatore, i motivi dello sfondo della pagina pubblica. Aggiungere una voce basta a metterla in vendita.
//   - Le famiglie: avatar (avatar-<n>) e canzoni (canzone-<impronta dell'indirizzo>) non si comprano, si CAMBIANO (functions/monete.js: cambia). Ogni cambio costa (PREZZI) e il server lo fa
//     subito, scrivendo il profilo. Il primo avatar e la prima canzone sono "di casa": quello che si sceglie gratis (chi ha ancora l'avatar o la canzone di partenza) o, per chi ne aveva già
//     uno, quello che aveva, resta suo PER SEMPRE e nessun altro lo può prendere. Quello che si porta è riservato finché lo si porta: cambiando di nuovo torna libero per tutti.
//     Così l'unicità, com'è sempre stata, non si rompe e non si paga mai qualcosa che poi non si può usare.
//   - Lo shiny di un Pokémon di un team: costa PREZZI.shinyPokemon e si compra dal Box (non ha un id: il segno sta nel team, vedi functions/monete.js).
//   - L'economia: PREMI (quanto si guadagna) e PREZZI (quanto costano le famiglie), calibrati sulla stagione tipo con stimaStagione().
// ATTENZIONE: questo file esiste in due copie identiche, functions/cosmetici.js (il server controlla prezzi e acquisti) e docs/cosmetici.js (il sito).
// Modificane una e copiala sull'altra (lo controlla test/monete.test.js).
//
//   Cosmetici.CATALOGO, Cosmetici.perId(id), Cosmetici.TIPI, Cosmetici.PREMI, Cosmetici.PREZZI
//   Cosmetici.possiede(id, { wallet, info, pagina })   comprato, oppure già in uso (chi usava un motivo che ora è a pagamento lo tiene); per avatar e canzoni: quello che porti o quello di casa
//   Cosmetici.possedutiDa({ wallet, info, pagina })    l'insieme degli id posseduti del catalogo fisso
//   Cosmetici.motivoBloccato(motivo, contesto)         true se quel motivo dello sfondo è a pagamento e non è posseduto
//   Cosmetici.idAvatar(testo), Cosmetici.idCanzone(url) l'id di un avatar (da "…/profile/12.png") o di una canzone (dal suo indirizzo)
//   Cosmetici.eDiDefault(tipo, info)                   ha ancora l'avatar / la canzone di partenza?
//   Cosmetici.idCorrente(tipo, info)                   l'id dell'avatar / della canzone che porta adesso ('' se è quello di partenza o nessuno)
//   Cosmetici.prezzoCambio(tipo, { wallet, info })     { prezzo, gratis }: quanto costa cambiare avatar o canzone, oggi (0 la prima volta, se ha ancora quello di partenza)
//   Cosmetici.prezzoPer(id, { wallet, info })          { prezzo, gratis }: quanto costa un cosmetico del catalogo, o un cambio per gli id degli avatar e delle canzoni
//   Cosmetici.stimaStagione({ ... })                   quante monete fa una stagione, per tarare i prezzi
//   Cosmetici.testoConShiny(testo, indice, nome, specie)  il testo Showdown di un team con "Shiny: Yes" nel Pokémon indicato (lo scrive il server dopo l'acquisto)
//   Cosmetici.senzaShinyAbusivi(testo, teamPrecedente)    toglie "Shiny: Yes" ai Pokémon che non erano già shiny: lo shiny si compra, non si scrive (il Box lo usa al salvataggio)
//
// Funziona nel browser (window.Cosmetici) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Cosmetici = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
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
    // Le famiglie: tanti pezzi piccoli (un cambio di avatar è il 4% di una stagione, di canzone il 6%, uno shiny di team il 10%); il catalogo fisso sta nel 10–45% (vedi CATALOGO).
    const PREZZI = { avatar: 40, canzone: 60, shinyPokemon: 100 };

    const TIPI = {
        shiny: { nome: 'Shiny companion', frase: 'Your favourite Pokémon in its shiny colours.' },
        aura: { nome: 'Trainer aura', frase: 'A glow around your trainer on your page.' },
        sfondo: { nome: 'Page patterns', frase: 'More patterns for the background of your page.' }
    };

    // `campo`: dove si scrive quando si equipaggia (players/{id}/info/<campo>); per i motivi non c'è: li sceglie l'editor della pagina
    const CATALOGO = [
        { id: 'shiny', tipo: 'shiny', nome: 'Shiny companion', prezzo: 200, campo: 'pkmShiny', descr: 'Your favourite Pokémon shows up shiny on your page, in the rankings and on share cards.' },
        { id: 'aura-oro', tipo: 'aura', nome: 'Gold aura', prezzo: 200, campo: 'aura', colore: '#ffcc33', descr: 'A warm golden glow around your trainer.' },
        { id: 'aura-fiamma', tipo: 'aura', nome: 'Flame aura', prezzo: 200, campo: 'aura', colore: '#ff5a1f', descr: 'A fiery orange glow.' },
        { id: 'aura-ghiaccio', tipo: 'aura', nome: 'Ice aura', prezzo: 200, campo: 'aura', colore: '#5fd4ff', descr: 'A cold blue glow.' },
        { id: 'aura-arcobaleno', tipo: 'aura', nome: 'Rainbow aura', prezzo: 350, campo: 'aura', colore: '#ff66cc', descr: 'A glow that cycles through every colour.' },
        { id: 'sfondo-raggi', tipo: 'sfondo', nome: 'Sunburst', prezzo: 100, motivo: 'raggi', descr: 'Rays from the stage.' },
        { id: 'sfondo-pokeball', tipo: 'sfondo', nome: 'Pokéballs', prezzo: 100, motivo: 'pokeball', descr: 'A field of tiny Poké Balls.' },
        { id: 'sfondo-anelli', tipo: 'sfondo', nome: 'Rings', prezzo: 100, motivo: 'anelli', descr: 'Overlapping rings.' },
        { id: 'sfondo-stelle', tipo: 'sfondo', nome: 'Stars', prezzo: 100, motivo: 'stelle', descr: 'A sky of little stars.' },
        { id: 'sfondo-onde', tipo: 'sfondo', nome: 'Waves', prezzo: 100, motivo: 'onde', descr: 'Soft rolling waves.' }
    ];

    // ---- Le famiglie: avatar e canzoni ---------------------------------------------------------
    // Gli avatar sono immagini/profile/<n>.png con n da 1 a 292, tranne 162 e 168 (come P.elencoAvatar in pagina-pubblica.js)
    const AVATAR_MAX = 292;
    const AVATAR_MANCANTI = [162, 168];
    const avatarValido = n => Number.isInteger(n) && n >= 1 && n <= AVATAR_MAX && !AVATAR_MANCANTI.includes(n);

    const objOr = x => (x && typeof x === 'object' ? x : {});

    /** "https://x.io/immagini/profile/12.png?v=2", "profile/12.png" -> "avatar-12"; '' se non è un avatar della lista (il segnaposto, un'immagine qualunque) */
    function idAvatar(testo) {
        const m = /(?:^|\/)profile\/(\d{1,3})\.png$/i.exec(String(testo == null ? '' : testo).split('?')[0].split('#')[0].trim());
        const n = m ? Number(m[1]) : 0;
        return avatarValido(n) ? `avatar-${n}` : '';
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
        return null;
    };

    /** Ha ancora quello di partenza? Avatar: nessuno, il segnaposto dell'account nuovo o un'immagine fuori dalla lista. Canzone: nessuna scelta. */
    function eDiDefault(tipo, info) {
        const i = objOr(info);
        if (tipo === 'avatar') return !idAvatar(i.avatar);
        if (tipo === 'canzone') return !String(i.musicaPreferita == null ? '' : i.musicaPreferita).trim();
        return false;
    }

    /** L'id dell'avatar o della canzone che porta adesso; '' se è quello di partenza o nessuno */
    function idCorrente(tipo, info) {
        const i = objOr(info);
        return tipo === 'avatar' ? idAvatar(i.avatar) : tipo === 'canzone' ? idCanzone(i.musicaPreferita) : '';
    }

    /** Comprato (wallet.posseduti), oppure già in uso: chi usava un motivo che ora è a pagamento, ha già il compagno shiny o l'aura di adesso, li tiene. Avatar e canzoni non si comprano: vedi sotto */
    function possiede(id, { wallet, info, pagina } = {}) {
        const c = perId(id);
        if (!c) return false;
        if (objOr(objOr(wallet).posseduti)[id]) return true;
        const i = objOr(info);
        if (c.tipo === 'shiny') return !!i.pkmShiny;
        if (c.tipo === 'aura') return i.aura === id;
        if (c.tipo === 'sfondo') return objOr(objOr(pagina).sfondo).motivo === c.motivo;
        // avatar e canzoni: quello che porti, o quello di casa (il primo, tuo per sempre)
        if (c.tipo === 'avatar' || c.tipo === 'canzone') return idCorrente(c.tipo, i) === id || objOr(objOr(wallet).casa)[c.tipo] === id;
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

    /** Quanto costa cambiare avatar o canzone, oggi: sempre PREZZI, tranne la prima volta per chi ha ancora quello di partenza (e non ha ancora un "di casa"): quella è gratis */
    function prezzoCambio(tipo, { wallet, info } = {}) {
        if (!objOr(objOr(wallet).casa)[tipo] && eDiDefault(tipo, info)) return { prezzo: 0, gratis: true };
        return { prezzo: PREZZI[tipo] || 0, gratis: false };
    }

    /** Quanto costa un cosmetico del catalogo; per gli id degli avatar e delle canzoni, quanto costa cambiare */
    function prezzoPer(id, contesto = {}) {
        const c = perId(id);
        if (!c) return null;
        if (c.tipo === 'avatar' || c.tipo === 'canzone') return prezzoCambio(c.tipo, contesto);
        return { prezzo: c.prezzo, gratis: false };
    }

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

    return { PREMI, PREZZI, CATALOGO, TIPI, perId, possiede, possedutiDa, motivoBloccato, idAvatar, idCanzone, eDiDefault, idCorrente, prezzoCambio, prezzoPer, stimaStagione, idSpecie, testoConShiny, senzaShinyAbusivi, AVATAR_MAX, AVATAR_MANCANTI };
});
