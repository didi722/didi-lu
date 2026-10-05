// =====================================================
// BADGE DEI TEAM — Poké-Tournament
//
// I badge sono i riconoscimenti di UN team (di un giocatore), come i fiocchi (fiocchi.js) lo sono di un Pokémon e i badge
// degli allenatori (badge-allenatore.js) di un allenatore. Si calcolano sui numeri reali: Statistiche.calcola(...).teams, un elemento per team:
//   stagioniVinte / stagioniGiocate     stagioni vinte dal suo allenatore in cui il team ha giocato / stagioni giocate
//   showdown.vinti                      showdown vinti con il team
//   match.vinti, match.giocati, percMatch   match vinti e % di match vinti
//   serie.vittorieMax                   match vinti di fila
//   serie.pulitaMax                     match vinti di fila senza lasciare set all'avversario
//   serie.showdownMax                   showdown vinti di fila
//   ko.setPerfetti, ko.fatti            set vinti senza perdere un Pokémon, KO fatti (solo set giocati sul sito)
//
// Ogni badge ha 3 livelli (bronzo, argento, oro) con le soglie di CATALOGO: se la stagione tipica cambia si cambiano solo
// quei numeri. Funzione pura, niente DOM e niente Firebase (le colle ricevono db e Fiocchi): funziona nel browser
// (window.BadgeTeam) e in Node (test/badge-team.test.js).
//
// Immagini: tutte in docs/immagini/ e tutte col prefisso "badge-team-": badge-team-<id>-<bronze|silver|gold>.png (un file per livello)
// oppure badge-team-<id>.png (un file solo, uguale per tutti i livelli: le serie). Finché un file non c'è, al suo posto compare una
// medaglia disegnata con il CSS (immagineMancante). IMMAGINI elenca i file che il catalogo usa; `node tools/elenco-immagini.cjs` dice
// quali mancano.
// Prima c'erano tre badge di serie solo nella pagina pubblica (7 vittorie di fila, 4 match puliti, 3 showdown): ora sono
// qui, con tre livelli, e si vedono ovunque si apra un team.
//
// Il meccanismo (soglie, livelli, scaffale, medagliette) è generico: costruisci(catalogo, opzioni) lo applica a un altro catalogo.
// Lo usa badge-allenatore.js per i badge degli allenatori, con gli stessi stili (badge-team.css).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(null);
    else radice.BadgeTeam = fabbrica(radice);
})(typeof self !== 'undefined' ? self : this, function (finestra) {
    'use strict';

    const LIVELLI = ['bronze', 'silver', 'gold'];
    const NOMI_LIVELLO = ['Bronze', 'Silver', 'Gold'];
    const ROMANI = ['I', 'II', 'III'];
    const CARTELLA = 'immagini/';

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const tre = base => LIVELLI.map(l => `${CARTELLA}${base.replace('{l}', l)}`);

    // 0 = non preso, 1 = bronzo, 2 = argento, 3 = oro
    function livelloDi(valore, soglie) {
        let l = 0;
        for (let i = 0; i < soglie.length; i++) if (valore >= soglie[i]) l = i + 1;
        return l;
    }

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Se la PNG non c'è (ancora), la sostituisce con una medaglia disegnata dal CSS con l'icona del badge
    function immagineMancante(img, icona) {
        if (!img || !img.parentNode || !img.ownerDocument) return;
        img.onerror = null;
        const span = img.ownerDocument.createElement('span');
        span.className = 'bt-finto';
        span.textContent = icona || '★';
        span.setAttribute('aria-hidden', 'true');
        img.parentNode.replaceChild(span, img);
    }

    // =====================================================
    // Il meccanismo, per un catalogo qualunque
    //   soglie    valori per bronzo, argento, oro
    //   immagini  3 file (uno per livello) oppure 1 file per tutti
    //   minimo    se presente, sotto questo numero di base il valore non conta ancora (serve per le percentuali)
    //   valore    funzione del "contesto" (un team, un allenatore...) che dà il numero da confrontare con le soglie
    // opzioni: { titolo: titolo dello scaffale, chiedi: testo del tasto }
    // =====================================================
    function costruisci(CATALOGO, opzioni = {}) {
        const titoloPredefinito = opzioni.titolo || 'BADGES';

        // Tutti i file che il catalogo usa (nomi, senza cartella)
        const IMMAGINI = [...new Set(CATALOGO.flatMap(b => b.immagini).map(p => p.replace(CARTELLA, '')))];

        const immagineDi = (def, livello) => {
            const l = Math.max(1, livello || 1);
            return def.immagini.length === 1 ? def.immagini[0] : def.immagini[Math.min(l, def.immagini.length) - 1];
        };

        /**
         * @param {object|null} contesto  quello che serve ai `valore` del catalogo (null: niente dati, tutto a zero)
         * @returns {Array} un elemento per badge del catalogo, nell'ordine del catalogo
         */
        function calcola(contesto) {
            const t = contesto || {};
            return CATALOGO.map(def => {
                const valore = def.valore(t);
                let nota = '', conta = true, sblocco = null;
                if (def.minimo) {
                    const base = def.minimo.campo(t);
                    if (base < def.minimo.valore) {
                        conta = false;
                        nota = `needs ${def.minimo.valore} ${def.minimo.etichetta} (now ${base})`;
                        sblocco = { valore: base, serve: def.minimo.valore, etichetta: def.minimo.etichetta };
                    }
                }
                const livello = conta ? livelloDi(valore, def.soglie) : 0;
                const prossima = livello >= def.soglie.length ? null : def.soglie[livello];
                const precedente = livello === 0 ? 0 : def.soglie[livello - 1];
                const progresso = sblocco ? Math.max(0, Math.min(1, sblocco.valore / sblocco.serve))
                    : prossima == null ? 1 : Math.max(0, Math.min(1, (valore - precedente) / (prossima - precedente)));
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

        // I badge presi, dal più alto al più basso (a parità, l'ordine del catalogo)
        function guadagnati(lista) {
            return lista.map((b, i) => ({ b, i })).filter(x => x.b.livello > 0)
                .sort((a, c) => c.b.livello - a.b.livello || a.i - c.i).map(x => x.b);
        }

        const htmlImmagine = (b, classe) =>
            `<img class="${classe}" src="${esc(b.immagine)}" alt="" loading="lazy" onerror="BadgeTeam.immagineMancante(this,'${esc(b.icona)}')">`;

        function htmlBadge(b) {
            const stato = b.livello ? `bt-${b.classeLivello}` : 'bt-bloccato';
            const fino = b.prossima == null ? b.soglie[b.soglie.length - 1] : b.prossima;
            // al livello massimo il traguardo è già passato: "7 MAX" invece di "7 / 6"
            const valore = b.sblocco ? `${esc(b.sblocco.valore)} <i>/ ${esc(b.sblocco.serve)}</i>`
                : b.prossima == null ? `${esc(b.valore)} <i>MAX</i>` : `${esc(b.valore)} <i>/ ${esc(fino)}</i>`;
            const titolo = b.livello ? `${esc(b.nome)} · ${esc(b.livelloNome)}` : `${esc(b.nome)} · locked`;
            const prossima = b.prossima == null ? 'Top level reached.' : `Next level: ${esc(b.prossima)} ${esc(b.unita)}.`;
            return `<div class="bt ${stato}" tabindex="0" data-badge="${esc(b.id)}">` +
                `<div class="bt-medaglia">${htmlImmagine(b, 'bt-img')}${b.livello ? `<span class="bt-livello">${ROMANI[b.livello - 1]}</span>` : ''}</div>` +
                `<div class="bt-nome">${esc(b.nome)}</div>` +
                `<div class="bt-barra"><span style="width:${Math.round(b.progresso * 100)}%"></span></div>` +
                `<div class="bt-valore">${valore}</div>` +
                `<div class="bt-tip" role="tooltip"><strong>${titolo}</strong><p>${esc(b.descrizione)}</p><p class="bt-tip-nota">${b.nota ? esc(b.nota) : prossima}</p></div>` +
                `</div>`;
        }

        // Lo scaffale completo: tutti i badge, quelli non presi in grigio con la barra del progresso
        function htmlScaffale(lista, opz = {}) {
            const presi = lista.filter(b => b.livello > 0).length;
            const titolo = opz.titolo === undefined ? titoloPredefinito : opz.titolo;
            return (titolo ? `<h4 class="bt-titolo">${esc(titolo)} <small class="bt-conto">${presi}/${lista.length}</small></h4>` : '') +
                `<div class="bt-lista">${lista.map(htmlBadge).join('')}</div>`;
        }

        // Le medagliette (sulla card e nella testata): i badge più alti, al massimo "max"
        function htmlMini(lista, max = 4) {
            const presi = guadagnati(lista);
            if (!presi.length) return '';
            const visibili = presi.slice(0, max);
            const resto = presi.length - visibili.length;
            return visibili.map(b =>
                `<span class="bt-mini bt-${b.classeLivello}" title="${esc(b.nome)} · ${esc(b.livelloNome)}: ${esc(b.valore)} ${esc(b.unita)}">${htmlImmagine(b, 'bt-mini-img')}</span>`
            ).join('') + (resto > 0 ? `<span class="bt-mini bt-altri" title="${resto} more badge${resto > 1 ? 's' : ''}">+${resto}</span>` : '');
        }

        return { CATALOGO, IMMAGINI, calcola, guadagnati, htmlBadge, htmlScaffale, htmlMini };
    }

    // =====================================================
    // I badge dei team
    // =====================================================
    const CATALOGO = [
        { id: 'champion', nome: 'Champion', icona: '👑', unita: 'seasons won', soglie: [1, 2, 3],
          descrizione: 'Seasons won by its trainer while the team played in them.',
          valore: t => num(t.stagioniVinte), immagini: tre('badge-team-champion-{l}.png') },
        { id: 'showdown', nome: 'Showdown Winner', icona: '⚔️', unita: 'showdowns won', soglie: [2, 5, 10],
          descrizione: 'Showdowns won with this team.',
          valore: t => num(t.showdown && t.showdown.vinti), immagini: tre('badge-team-showdown-{l}.png') },
        { id: 'sdstreak', nome: 'SD Streak', icona: '🎯', unita: 'showdowns in a row', soglie: [2, 3, 5],
          descrizione: 'Showdowns won in a row with this team.',
          valore: t => num(t.serie && t.serie.showdownMax), immagini: [CARTELLA + 'badge-team-sdstreak.png'] },
        { id: 'winner', nome: 'Winner', icona: '🏆', unita: 'matches won', soglie: [5, 15, 30],
          descrizione: 'Matches won with this team.',
          valore: t => num(t.match && t.match.vinti), immagini: tre('badge-team-winner-{l}.png') },
        { id: 'winrate', nome: 'Win Rate', icona: '📈', unita: '% of matches won', soglie: [55, 65, 75],
          descrizione: 'Share of matches won, once the team has played enough of them.',
          valore: t => num(t.percMatch), minimo: { campo: p => num(p.match && p.match.giocati), valore: 10, etichetta: 'matches played' },
          immagini: tre('badge-team-winrate-{l}.png') },
        { id: 'winstreak', nome: 'Win Streak', icona: '🔥', unita: 'matches in a row', soglie: [3, 5, 7],
          descrizione: 'Matches won in a row with this team.',
          valore: t => num(t.serie && t.serie.vittorieMax), immagini: [CARTELLA + 'badge-team-winstreak.png'] },
        { id: 'cleanstreak', nome: 'Clean Streak', icona: '✨', unita: 'clean wins in a row', soglie: [2, 3, 4],
          descrizione: 'Matches won in a row without dropping a set.',
          valore: t => num(t.serie && t.serie.pulitaMax), immagini: [CARTELLA + 'badge-team-cleanstreak.png'] },
        { id: 'flawless', nome: 'Flawless', icona: '🛡️', unita: 'flawless sets', soglie: [1, 3, 6],
          descrizione: 'Sets won without losing a single Pokémon.',
          valore: t => num(t.ko && t.ko.setPerfetti), immagini: tre('badge-team-flawless-{l}.png') },
        { id: 'knockout', nome: 'Knockout', icona: '💥', unita: 'KOs', soglie: [30, 100, 250],
          descrizione: 'Opposing Pokémon knocked out by this team.',
          valore: t => num(t.ko && t.ko.fatti), immagini: tre('badge-team-knockout-{l}.png') },
        { id: 'veteran', nome: 'Veteran', icona: '🎖️', unita: 'seasons played', soglie: [2, 3, 5],
          descrizione: 'Seasons this team has played in.',
          valore: t => num(t.stagioniGiocate), immagini: tre('badge-team-veteran-{l}.png') }
    ];

    const squadra = costruisci(CATALOGO, { titolo: 'TEAM BADGES' });
    const { IMMAGINI, calcola, guadagnati, htmlBadge, htmlScaffale, htmlMini } = squadra;

    // Il team di un giocatore tra quelli di Statistiche.calcola(...).teams
    function trova(risultato, { player, team } = {}) {
        const elenco = (risultato && risultato.teams) || [];
        const p = idDi(player), n = idDi(team);
        if (!p || !n) return null;
        return elenco.find(t => idDi(t.player) === p && idDi(t.nome) === n) || null;
    }

    // -----------------------------------------------------
    // Colla per le pagine (Box e pagina pubblica). Usano i numeri che Fiocchi.carica(db) ha già calcolato per tutto il sito
    // (stessa lettura di Firebase). "valido" serve quando la finestra può cambiare mentre i dati arrivano.
    // -----------------------------------------------------
    // La barra dei badge nella testata di un team: medagliette dei più alti e un tasto che apre lo scaffale con tutti
    async function montaBarra(db, casella, { giocatore, team, valido } = {}) {
        if (!casella || !giocatore || !team) return false;
        let entry = null, nota = '';
        try {
            const risultato = await finestra.Fiocchi.carica(db);
            entry = trova(risultato, { player: giocatore, team: team.nome });
            if (!entry) nota = 'No match data yet for this team: its badges start from zero.';
        } catch (e) { nota = 'Live badge data is not available right now.'; }
        if (valido && !valido()) return false;
        const lista = calcola(entry);
        const presi = lista.filter(b => b.livello > 0).length;
        casella.innerHTML =
            `<span class="bt-barra-mini">${htmlMini(lista, 4)}</span>` +
            `<button type="button" class="bt-apri" aria-expanded="false" title="All the badges of this team">🏅 Badges <b>${presi}/${lista.length}</b></button>` +
            `<div class="bt-pop" hidden>${htmlScaffale(lista, { titolo: '' })}${nota ? `<p class="bt-nota">${esc(nota)}</p>` : ''}</div>`;
        const tasto = casella.querySelector('.bt-apri'), pop = casella.querySelector('.bt-pop');
        tasto.addEventListener('click', e => {
            e.stopPropagation();
            const aperto = pop.hidden;
            pop.hidden = !aperto;
            tasto.setAttribute('aria-expanded', String(aperto));
        });
        pop.addEventListener('click', e => e.stopPropagation());
        return true;
    }

    // Le medagliette sulle card dei team nel Box: ogni .bt-card[data-team-badge="<id del team>"]
    async function riempiCard(db, contenitore, { giocatore, squadre, valido } = {}) {
        if (!contenitore || !giocatore) return false;
        const caselle = [...contenitore.querySelectorAll('.bt-card[data-team-badge]')];
        if (!caselle.length) return false;
        let risultato;
        try { risultato = await finestra.Fiocchi.carica(db); } catch (e) { return false; }
        if (valido && !valido()) return false;
        for (const casella of caselle) {
            const t = (squadre || []).find(x => String(x.id) === casella.dataset.teamBadge);
            if (!t) continue;
            casella.innerHTML = htmlMini(calcola(trova(risultato, { player: giocatore, team: t.nome })), 2);
        }
        return true;
    }

    return {
        CATALOGO, LIVELLI, NOMI_LIVELLO, IMMAGINI,
        livelloDi, calcola, guadagnati, trova,
        htmlBadge, htmlScaffale, htmlMini, immagineMancante,
        montaBarra, riempiCard,
        // per altri cataloghi (badge-allenatore.js)
        costruisci, tre, CARTELLA, esc
    };
});
