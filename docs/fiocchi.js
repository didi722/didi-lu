// =====================================================
// FIOCCHI DEI POKÉMON — Poké-Tournament
//
// I fiocchi sono i riconoscimenti di UN Pokémon (quel Pokémon di quel team, non la specie), calcolati sui numeri
// reali dei set giocati sul sito. Niente più serie "per team": un Pokémon che è rimasto in panchina non prende
// nulla, uno che scende in campo e vince sì.
//
// Da dove vengono i numeri: Statistiche.calcola(...).pokemon (statistiche.js), un elemento per Pokémon:
//   portato            set in cui è davvero sceso in campo (le presenze reali)
//   koFatti            KO fatti (diretti e indiretti)
//   setPortatoVinti    set vinti mentre era in campo
//   ultimoVinto        set vinti restando l'ultimo Pokémon in piedi
//   sopravvivenza      % di set in campo senza essere andato KO
//   serie.vittorieMax  match vinti di fila, contando solo quelli in cui è sceso in campo
//   serie.pulitaMax    match vinti di fila senza lasciare set all'avversario (stessa regola)
//   stagioniVinteInCampo  stagioni vinte dal suo team in cui è sceso in campo
//   stagioniInCampo       stagioni giocate dal suo team in cui è sceso in campo
//
// Ogni fiocco ha 3 livelli (bronzo, argento, oro) con le sue soglie qui sotto: se la stagione tipica cambia, si
// cambiano solo i numeri di CATALOGO. Funzione pura, niente DOM e niente Firebase (carica() riceve il db):
// funziona nel browser (window.Fiocchi) e in Node (test/fiocchi.test.js).
//
// Immagini: tutte in docs/immagini/ e tutte col prefisso "ribbon-": ribbon-<id>-<bronze|silver|gold>.png, un file per livello per ogni
// fiocco. Finché un file non c'è, al suo posto compare una medaglia disegnata con il CSS (immagineMancante). IMMAGINI elenca i file che
// il catalogo usa; `node tools/elenco-immagini.cjs` dice quali mancano.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(null);
    else radice.Fiocchi = fabbrica(radice);
})(typeof self !== 'undefined' ? self : this, function (finestra) {
    'use strict';

    const LIVELLI = ['bronze', 'silver', 'gold'];
    const NOMI_LIVELLO = ['Bronze', 'Silver', 'Gold'];
    const ROMANI = ['I', 'II', 'III'];
    const CARTELLA = 'immagini/';

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const idSpecie = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const specieDaNome = nome => {
        const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(String(nome || '').trim());
        return m ? m[2].trim() : String(nome || '').trim();
    };
    const tre = base => LIVELLI.map(l => `${CARTELLA}${base.replace('{l}', l)}`);

    // -----------------------------------------------------
    // Catalogo
    //   soglie    valori per bronzo, argento, oro
    //   immagini  3 file, uno per livello (bronzo, argento, oro)
    //   minimo    se presente, sotto questo numero di set in campo il valore non conta ancora (serve per le percentuali)
    // -----------------------------------------------------
    const CATALOGO = [
        { id: 'regular', nome: 'Regular', icona: '🎖️', unita: 'sets fielded', soglie: [15, 40, 80],
          descrizione: 'Actually sent out in a set: benched games do not count.',
          valore: p => num(p.portato), immagini: tre('ribbon-regular-{l}.png') },
        { id: 'ko', nome: 'Knockout', icona: '💥', unita: 'KOs', soglie: [15, 40, 80],
          descrizione: 'Opposing Pokémon knocked out (direct and indirect).',
          valore: p => num(p.koFatti), immagini: tre('ribbon-ko-{l}.png') },
        { id: 'winner', nome: 'Winner', icona: '🏆', unita: 'sets won', soglie: [10, 30, 60],
          descrizione: 'Sets won while on the field.',
          valore: p => num(p.setPortatoVinti), immagini: tre('ribbon-winner-{l}.png') },
        { id: 'laststand', nome: 'Last Stand', icona: '🛡️', unita: 'last-standing wins', soglie: [1, 3, 6],
          descrizione: 'Sets won as the very last Pokémon standing.',
          valore: p => num(p.ultimoVinto), immagini: tre('ribbon-laststand-{l}.png') },
        { id: 'survivor', nome: 'Survivor', icona: '❤️', unita: '% survival', soglie: [60, 75, 90],
          descrizione: 'Share of sets on the field without fainting.',
          valore: p => num(p.sopravvivenza), minimo: { campo: 'portato', valore: 15, etichetta: 'sets fielded' },
          immagini: tre('ribbon-survivor-{l}.png') },
        { id: 'winstreak', nome: 'Win Streak', icona: '🔥', unita: 'matches in a row', soglie: [3, 5, 8],
          descrizione: 'Matches won in a row, counting only the ones it actually played.',
          valore: p => num(p.serie && p.serie.vittorieMax), immagini: tre('ribbon-winstreak-{l}.png') },
        { id: 'cleanstreak', nome: 'Clean Streak', icona: '✨', unita: 'clean wins in a row', soglie: [2, 3, 5],
          descrizione: 'Matches won without dropping a set, counting only the ones it actually played.',
          valore: p => num(p.serie && p.serie.pulitaMax), immagini: tre('ribbon-cleanstreak-{l}.png') },
        { id: 'champion', nome: 'Champion', icona: '👑', unita: 'seasons won', soglie: [1, 2, 3],
          descrizione: 'Seasons won with its team while actually playing in them.',
          valore: p => num(p.stagioniVinteInCampo), immagini: tre('ribbon-champion-{l}.png') },
        { id: 'friendship', nome: 'Friendship', icona: '🎀', unita: 'seasons together', soglie: [2, 3, 5],
          descrizione: 'A bond that lasts: seasons on the field with the same trainer and team.',
          valore: p => num(p.stagioniInCampo), immagini: tre('ribbon-friendship-{l}.png') }
    ];

    // Tutti i file che il catalogo usa (nomi, senza cartella). Quali ci sono davvero in docs/immagini/ lo dice tools/elenco-immagini.cjs
    const IMMAGINI = [...new Set(CATALOGO.flatMap(f => f.immagini).map(p => p.replace(CARTELLA, '')))];

    // -----------------------------------------------------
    // Calcolo
    // -----------------------------------------------------
    // 0 = non preso, 1 = bronzo, 2 = argento, 3 = oro
    function livelloDi(valore, soglie) {
        let l = 0;
        for (let i = 0; i < soglie.length; i++) if (valore >= soglie[i]) l = i + 1;
        return l;
    }

    const immagineDi = (def, livello) => def.immagini[Math.min(Math.max(1, livello || 1), def.immagini.length) - 1];

    /**
     * @param {object|null} pokemon  un elemento di Statistiche.calcola(...).pokemon (null se il Pokémon non ha mai giocato)
     * @param {{ amicizia?: boolean }} [extra]  amicizia: il fiocco dell'amicizia assegnato a mano (almeno bronzo)
     * @returns {Array} un elemento per fiocco del catalogo, nell'ordine del catalogo
     */
    function calcola(pokemon, extra = {}) {
        const p = pokemon || {};
        return CATALOGO.map(def => {
            let valore = def.valore(p);
            let nota = '';
            let conta = true;
            // finché il Pokémon non ha giocato abbastanza, il fiocco non conta: la scheda mostra quanto manca (es. 8 / 15)
            let sblocco = null;
            if (def.minimo) {
                const base = num(p[def.minimo.campo]);
                if (base < def.minimo.valore) {
                    conta = false;
                    nota = `needs ${def.minimo.valore} ${def.minimo.etichetta} (now ${base})`;
                    sblocco = { valore: base, serve: def.minimo.valore, etichetta: def.minimo.etichetta };
                }
            }
            let livello = conta ? livelloDi(valore, def.soglie) : 0;
            if (def.id === 'friendship' && extra && extra.amicizia && livello < 1) livello = 1;
            const prossima = livello >= def.soglie.length ? null : def.soglie[livello];
            // quanta strada è fatta verso il prossimo traguardo: è la barra dei numeri "7 / 8"
            const progresso = sblocco ? Math.max(0, Math.min(1, sblocco.valore / sblocco.serve))
                : prossima == null ? 1 : Math.max(0, Math.min(1, valore / prossima));
            return {
                id: def.id, nome: def.nome, icona: def.icona, descrizione: def.descrizione, unita: def.unita,
                soglie: def.soglie.slice(), valore, livello,
                livelloNome: livello ? NOMI_LIVELLO[livello - 1] : '',
                classeLivello: livello ? LIVELLI[livello - 1] : 'locked',
                prossima, progresso, nota, sblocco,
                immagine: immagineDi(def, livello)
            };
        });
    }

    // I fiocchi presi, dal più alto al più basso (a parità, l'ordine del catalogo)
    function guadagnati(lista) {
        return lista.map((f, i) => ({ f, i })).filter(x => x.f.livello > 0)
            .sort((a, b) => b.f.livello - a.f.livello || a.i - b.i).map(x => x.f);
    }

    // Dal più vicino al prossimo livello al più lontano (la barra più piena prima); a parità l'ordine del catalogo. In fondo chi ha già
    // l'oro. (Stessa regola di BadgeTeam.perVicinanza per i badge dei team e degli allenatori.)
    function perVicinanza(lista) {
        return lista.map((f, i) => ({ f, i }))
            .sort((a, b) => (a.f.prossima == null) - (b.f.prossima == null) || b.f.progresso - a.f.progresso || a.i - b.i)
            .map(x => x.f);
    }

    // -----------------------------------------------------
    // Ricerca del Pokémon nei risultati delle statistiche
    // -----------------------------------------------------
    function trova(risultato, ident) {
        const elenco = (risultato && risultato.pokemon) || [];
        const player = idDi(ident && ident.player), team = idDi(ident && ident.team);
        const specie = idSpecie(specieDaNome(ident && ident.specie));
        if (!player || !team || !specie) return null;
        return elenco.find(e => idDi(e.player) === player && idDi(e.team) === team && e.specieId === specie) || null;
    }

    // Una sola lettura per pagina: stagioni e giocatori da Firebase, poi il calcolo (lo stesso di stats.html)
    let cache = null;
    function carica(db, Stat) {
        const S = Stat || (finestra && finestra.Statistiche);
        if (!S) return Promise.reject(new Error('Statistiche non disponibile'));
        if (!cache) {
            cache = Promise.all([db.ref('seasons').once('value'), db.ref('players').once('value')])
                .then(([s, p]) => S.calcola({ seasons: s.val() || {}, players: p.val() || {} }, { stagione: 'all' }))
                .catch(e => { cache = null; throw e; });
        }
        return cache;
    }
    const svuotaCache = () => { cache = null; };

    // -----------------------------------------------------
    // HTML (stringhe: le pagine le mettono in un contenitore)
    // -----------------------------------------------------
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const htmlImmagine = (f, classe) =>
        `<img class="${classe}" src="${esc(f.immagine)}" alt="" loading="lazy" onerror="Fiocchi.immagineMancante(this,'${esc(f.icona)}')">`;

    function htmlFiocco(f) {
        const stato = f.livello ? `fiocco-${f.classeLivello}` : 'fiocco-bloccato';
        const fino = f.prossima == null ? f.soglie[f.soglie.length - 1] : f.prossima;
        // al livello massimo il traguardo è già passato: "7 MAX" invece di "7 / 6"
        const valore = f.sblocco ? `${esc(f.sblocco.valore)} <i>/ ${esc(f.sblocco.serve)}</i>` : f.prossima == null ? `${esc(f.valore)} <i>MAX</i>` : `${esc(f.valore)} <i>/ ${esc(fino)}</i>`;
        const titolo = f.livello ? `${esc(f.nome)} · ${esc(f.livelloNome)}` : `${esc(f.nome)} · locked`;
        const prossima = f.prossima == null ? 'Top level reached.' : `Next level: ${esc(f.prossima)} ${esc(f.unita)}.`;
        return `<div class="fiocco ${stato}" tabindex="0" data-fiocco="${esc(f.id)}">` +
            `<div class="fiocco-medaglia">${htmlImmagine(f, 'fiocco-img')}${f.livello ? `<span class="fiocco-livello">${ROMANI[f.livello - 1]}</span>` : ''}</div>` +
            `<div class="fiocco-nome">${esc(f.nome)}</div>` +
            `<div class="fiocco-barra"><span style="width:${Math.round(f.progresso * 100)}%"></span></div>` +
            `<div class="fiocco-valore">${valore}</div>` +
            `<div class="fiocco-tip tip-coach" role="tooltip"><strong>${titolo}</strong><p>${esc(f.descrizione)}</p><p class="fiocco-tip-nota">${f.nota ? esc(f.nota) : prossima}</p></div>` +
            `</div>`;
    }

    // Lo scaffale completo (scheda del Pokémon): tutti i fiocchi, dal più vicino al prossimo livello al più lontano; quelli non presi in grigio
    // con la barra del progresso. opzioni.ordina === false tiene l'ordine del catalogo
    function htmlScaffale(lista, opzioni = {}) {
        const presi = lista.filter(f => f.livello > 0).length;
        const titolo = opzioni.titolo || 'RIBBONS';
        const ordinati = opzioni.ordina === false ? lista : perVicinanza(lista);
        return `<h4 class="panel-title">${esc(titolo)} <small class="fiocchi-conto">${presi}/${lista.length}</small></h4>` +
            `<div class="fiocchi-lista">${ordinati.map(htmlFiocco).join('')}</div>`;
    }

    // Le medagliette sulla card della squadra: i fiocchi più alti (al massimo "max")
    function htmlMini(lista, max = 3) {
        const presi = guadagnati(lista);
        if (!presi.length) return '';
        const visibili = presi.slice(0, max);
        const resto = presi.length - visibili.length;
        return visibili.map(f =>
            `<span class="fiocco-mini fiocco-${f.classeLivello}" title="${esc(f.nome)} · ${esc(f.livelloNome)}: ${esc(f.valore)} ${esc(f.unita)}">${htmlImmagine(f, 'fiocco-mini-img')}</span>`
        ).join('') + (resto > 0 ? `<span class="fiocco-mini fiocco-altri" title="${resto} more ribbon${resto > 1 ? 's' : ''}">+${resto}</span>` : '');
    }

    // Se la PNG non c'è (ancora), la sostituisce con una medaglia disegnata dal CSS con l'icona del fiocco
    function immagineMancante(img, icona) {
        if (!img || !img.parentNode || !img.ownerDocument) return;
        img.onerror = null;
        const span = img.ownerDocument.createElement('span');
        span.className = 'fiocco-finto';
        span.textContent = icona || '★';
        span.setAttribute('aria-hidden', 'true');
        img.parentNode.replaceChild(span, img);
    }

    // -----------------------------------------------------
    // Colla per le pagine (Box e pagina pubblica): leggono i dati e riempiono i contenitori.
    // "valido" serve quando la finestra può cambiare mentre i dati arrivano: se restituisce false non si scrive più nulla.
    // -----------------------------------------------------
    const elencoPokemon = team => {
        const p = team && team.pokemon;
        return Array.isArray(p) ? p : (p && typeof p === 'object' ? Object.values(p) : []);
    };

    // Le medagliette sulle card della squadra: ogni .pkm-badges-overlay[data-fiocchi-pkm="<posizione>"]
    async function riempiMini(db, contenitore, { giocatore, team, valido, amicizia } = {}) {
        if (!contenitore || !giocatore || !team) return false;
        const caselle = [...contenitore.querySelectorAll('.pkm-badges-overlay[data-fiocchi-pkm]')];
        if (!caselle.length) return false;
        let risultato;
        try { risultato = await carica(db); } catch (e) { return false; }
        if (valido && !valido()) return false;
        const pokemon = elencoPokemon(team);
        for (const casella of caselle) {
            const p = pokemon[Number(casella.dataset.fiocchiPkm)];
            if (!p) continue;
            const lista = calcola(trova(risultato, { player: giocatore, team: team.nome, specie: p.nome }), { amicizia: !!(amicizia && amicizia(p)) });
            casella.innerHTML = htmlMini(lista, 3);
        }
        return true;
    }

    // Lo scaffale completo nella scheda di un Pokémon
    async function montaScaffale(db, casella, { giocatore, team, pokemon, amicizia, valido } = {}) {
        if (!casella) return false;
        let entry = null, nota = '';
        try {
            const risultato = await carica(db);
            entry = trova(risultato, { player: giocatore, team: team && team.nome, specie: pokemon && pokemon.nome });
            if (!entry) nota = 'No set data yet for this Pokémon: its ribbons start from zero.';
        } catch (e) { nota = 'Live ribbon data is not available right now.'; }
        if (valido && !valido()) return false;
        casella.innerHTML = htmlScaffale(calcola(entry, { amicizia: !!amicizia })) + (nota ? `<p class="fiocchi-nota">${esc(nota)}</p>` : '');
        return true;
    }

    return {
        CATALOGO, LIVELLI, NOMI_LIVELLO, IMMAGINI,
        livelloDi, calcola, guadagnati, perVicinanza, trova, carica, svuotaCache,
        htmlFiocco, htmlScaffale, htmlMini, immagineMancante,
        riempiMini, montaScaffale
    };
});
