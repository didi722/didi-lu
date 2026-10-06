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
// Immagini: tutte in docs/immagini/ e tutte col prefisso "badge-team-": badge-team-<id>-<bronze|silver|gold>.png, un file per livello per
// ogni badge. Finché un file non c'è, al suo posto compare una medaglia disegnata con il CSS (immagineMancante). IMMAGINI elenca i file
// che il catalogo usa; `node tools/elenco-immagini.cjs` dice quali mancano.
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

    const maiuscola = t => { const x = String(t == null ? '' : t); return x.charAt(0).toUpperCase() + x.slice(1); };
    const arrotonda = v => Math.round(num(v) * 10) / 10;
    const tra01 = x => Math.max(0, Math.min(1, x));

    // =====================================================
    // Il meccanismo, per un catalogo qualunque
    //   soglie    valori per bronzo, argento, oro
    //   immagini  3 file, uno per livello (bronzo, argento, oro)
    //   minimo    se presente, sotto questo numero di base il valore non conta ancora (serve per le percentuali)
    //   valore    funzione del "contesto" (un team, un allenatore...) che dà il numero da confrontare con le soglie
    //   partenza  (opzionale) da dove parte la barra: l'Elo parte da 1000, non da zero
    //   suffisso / etichetta  (opzionali) "%" dopo i numeri e il nome della barra
    // opzioni: { titolo: titolo dello scaffale, chiedi: testo del tasto }
    // =====================================================
    function costruisci(CATALOGO, opzioni = {}) {
        const titoloPredefinito = opzioni.titolo || 'BADGES';

        // Tutti i file che il catalogo usa (nomi, senza cartella)
        const IMMAGINI = [...new Set(CATALOGO.flatMap(b => b.immagini).map(p => p.replace(CARTELLA, '')))];

        const immagineDi = (def, livello) => def.immagini[Math.min(Math.max(1, livello || 1), def.immagini.length) - 1];

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
                // quanta strada è fatta verso il prossimo traguardo: è la barra dei numeri "2 / 3" (da `partenza`, di solito zero)
                const progresso = sblocco ? tra01(sblocco.valore / sblocco.serve)
                    : prossima == null ? 1 : tra01((valore - num(def.partenza)) / (prossima - num(def.partenza)));
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

        // Dal più vicino al prossimo livello al più lontano (la barra più piena prima); a parità l'ordine del catalogo. In fondo chi ha già
        // l'oro, che non ha più niente da prendere. Va bene per qualunque elenco di oggetti con `prossima` (null a livello massimo) e `progresso`.
        function perVicinanza(lista) {
            return lista.map((b, i) => ({ b, i }))
                .sort((x, y) => (x.b.prossima == null) - (y.b.prossima == null) || y.b.progresso - x.b.progresso || x.i - y.i)
                .map(x => x.b);
        }

        /**
         * La scheda di un badge: dati e testi per disegnarlo (si provano in Node, la pagina li disegna nel suo stile).
         * @param {object} b  un elemento di calcola(...)
         * @returns {{ id, nome, icona, descrizione, immagine, livello, classe, bloccato, completo, etichetta, suffisso,
         *             livelli: { nome, classe, soglia, stato }[], numeri: [string, string][],
         *             barra: { etichetta, valore, obiettivo, partenza, suffisso }|null, frase: string }}
         */
        function scheda(b) {
            const def = CATALOGO.find(d => d.id === b.id) || {};
            const suffisso = def.suffisso || '';
            const completo = b.prossima == null;
            const prossimo = completo ? '' : NOMI_LIVELLO[b.livello];
            const livelli = b.soglie.map((soglia, i) => ({
                nome: NOMI_LIVELLO[i], classe: LIVELLI[i], soglia: `${soglia}${suffisso}`, stato: i < b.livello ? 'done' : (i === b.livello ? 'next' : '')
            }));
            let barra = null, frase = 'Gold reached: badge complete!';
            if (!completo && b.sblocco) {
                // una percentuale conta solo dopo abbastanza match: la barra è quella dei match giocati
                barra = { etichetta: maiuscola(b.sblocco.etichetta), valore: b.sblocco.valore, obiettivo: b.sblocco.serve, partenza: 0, suffisso: '' };
                frase = `Counts after ${b.sblocco.serve} ${b.sblocco.etichetta} (${b.sblocco.valore} so far).`;
            } else if (!completo) {
                barra = { etichetta: def.etichetta || maiuscola(b.unita), valore: arrotonda(b.valore), obiettivo: b.prossima, partenza: num(def.partenza), suffisso };
                // l'unità sta già sulla barra: qui solo quanto manca (per percentuali ed Elo, il traguardo)
                frase = suffisso || def.partenza ? `Reach ${b.prossima}${suffisso} to unlock ${prossimo}.` : `${Math.max(arrotonda(b.prossima - b.valore), 0)} more to unlock ${prossimo}.`;
            }
            return {
                id: b.id, nome: b.nome, icona: b.icona, descrizione: b.descrizione, immagine: b.immagine,
                livello: b.livello, classe: b.livello ? LIVELLI[b.livello - 1] : 'locked', bloccato: b.livello === 0, completo,
                etichetta: def.etichetta || maiuscola(b.unita), suffisso,
                livelli,
                numeri: [['Level', b.livello ? b.livelloNome : 'None yet'], ['Now', `${arrotonda(b.valore)}${suffisso}`]],
                barra, frase
            };
        }

        const htmlImmagine = (b, classe) =>
            `<img class="${classe}" src="${esc(b.immagine)}" alt="" loading="lazy" onerror="BadgeTeam.immagineMancante(this,'${esc(b.icona)}')">`;

        // Una riga dello scaffale: medaglia, nome e livello preso, spiegazione, i tre livelli con i loro traguardi, la barra e cosa manca.
        // Tutto è sempre visibile (niente fumetti da cercare con il mouse: sul telefono non esistono).
        function htmlBadge(b) {
            const d = scheda(b);
            const stato = b.livello ? `bt-${b.classeLivello}` : 'bt-bloccato';
            const pct = Math.round(b.progresso * 100);
            const livelli = d.livelli.map(l => `<span class="bt-lv bt-lv-${l.classe} ${l.stato}">${esc(l.nome)} <b>${esc(l.soglia)}</b></span>`).join('');
            const numeri = d.barra
                ? `<span class="bt-et">${esc(d.barra.etichetta)}</span><span class="bt-val"><b>${esc(d.barra.valore)}${esc(d.barra.suffisso)}</b> <i>/ ${esc(d.barra.obiettivo)}${esc(d.barra.suffisso)}</i></span>`
                : `<span class="bt-et">${esc(d.etichetta)}</span><span class="bt-val"><b>${esc(arrotonda(b.valore))}${esc(d.suffisso)}</b> <i>MAX</i></span>`;
            return `<article class="bt ${stato}${d.completo ? ' bt-completo' : ` bt-p-${LIVELLI[b.livello]}`}" data-badge="${esc(b.id)}">` +
                `<div class="bt-medaglia">${htmlImmagine(b, 'bt-img')}${b.livello ? `<span class="bt-livello">${ROMANI[b.livello - 1]}</span>` : ''}</div>` +
                `<div class="bt-corpo">` +
                `<div class="bt-testa"><span class="bt-nome">${esc(b.nome)}</span><span class="bt-stato">${b.livello ? esc(b.livelloNome) : 'Locked'}</span></div>` +
                `<p class="bt-desc">${esc(b.descrizione)}</p>` +
                `<div class="bt-livelli">${livelli}</div>` +
                `<div class="bt-numeri">${numeri}</div>` +
                `<div class="bt-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>` +
                `<div class="bt-frase">${esc(d.frase)}</div>` +
                `</div></article>`;
        }

        // Lo scaffale completo: il riepilogo (badge e livelli presi) e tutti i badge, dal più vicino al prossimo livello al più lontano.
        // opz: { titolo (vuoto: nessun titolo), ordina: false per tenere l'ordine del catalogo }
        function htmlScaffale(lista, opz = {}) {
            const presi = lista.filter(b => b.livello > 0).length;
            const livelli = lista.reduce((n, b) => n + b.livello, 0);
            const totali = lista.reduce((n, b) => n + b.soglie.length, 0);
            const titolo = opz.titolo === undefined ? titoloPredefinito : opz.titolo;
            const ordinati = opz.ordina === false ? lista : perVicinanza(lista);
            return (titolo ? `<h4 class="bt-titolo">${esc(titolo)} <small class="bt-conto">${presi}/${lista.length}</small></h4>` : '') +
                `<div class="bt-riepilogo"><span><b>${presi}</b>/${lista.length} badges</span><span><b>${livelli}</b>/${totali} levels</span>` +
                `<span class="bt-totale" aria-hidden="true"><i style="width:${totali ? Math.round(100 * livelli / totali) : 0}%"></i></span></div>` +
                `<p class="bt-ordine">Closest to the next level first.</p>` +
                `<div class="bt-lista">${ordinati.map(htmlBadge).join('')}</div>`;
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

        return { CATALOGO, IMMAGINI, calcola, guadagnati, perVicinanza, scheda, htmlBadge, htmlScaffale, htmlMini };
    }

    // =====================================================
    // I badge dei team
    // =====================================================
    const CATALOGO = [
        { id: 'champion', nome: 'Champion', icona: '👑', unita: 'seasons won', soglie: [1, 2, 4],
          descrizione: 'Seasons won.',
          valore: t => num(t.stagioniVinte), immagini: tre('badge-team-champion-{l}.png') },
        { id: 'showdown', nome: 'Showdown Winner', icona: '⚔️', unita: 'showdowns won', soglie: [4, 8, 12],
          descrizione: 'Showdowns won.',
          valore: t => num(t.showdown && t.showdown.vinti), immagini: tre('badge-team-showdown-{l}.png') },
        { id: 'sdstreak', nome: 'SD Streak', icona: '🎯', unita: 'showdowns in a row', soglie: [2, 3, 5],
          descrizione: 'Showdowns won in a row.',
          valore: t => num(t.serie && t.serie.showdownMax), immagini: tre('badge-team-sdstreak-{l}.png') },
        { id: 'winner', nome: 'Winner', icona: '🏆', unita: 'matches won', soglie: [8, 15, 30],
          descrizione: 'Matches won.',
          valore: t => num(t.match && t.match.vinti), immagini: tre('badge-team-winner-{l}.png') },
        { id: 'winrate', nome: 'Win Rate', icona: '📈', unita: '% of matches won', soglie: [65, 75, 80], etichetta: 'Win rate', suffisso: '%',
          descrizione: 'Share of matches won, once the team has played enough of them.',
          valore: t => num(t.percMatch), minimo: { campo: p => num(p.match && p.match.giocati), valore: 7, etichetta: 'matches played' },
          immagini: tre('badge-team-winrate-{l}.png') },
        { id: 'winstreak', nome: 'Win Streak', icona: '🔥', unita: 'matches in a row', soglie: [4, 7, 9],
          descrizione: 'Matches won in a row.',
          valore: t => num(t.serie && t.serie.vittorieMax), immagini: tre('badge-team-winstreak-{l}.png') },
        { id: 'cleanstreak', nome: 'Clean Streak', icona: '✨', unita: 'clean wins in a row', soglie: [2, 4, 6],
          descrizione: 'Matches won in a row without dropping a set.',
          valore: t => num(t.serie && t.serie.pulitaMax), immagini: tre('badge-team-cleanstreak-{l}.png') },
        { id: 'flawless', nome: 'Flawless', icona: '🛡️', unita: 'flawless sets', soglie: [3, 6, 10],
          descrizione: 'Sets won without losing a single Pokémon.',
          valore: t => num(t.ko && t.ko.setPerfetti), immagini: tre('badge-team-flawless-{l}.png') },
        { id: 'knockout', nome: 'Knockout', icona: '💥', unita: 'KOs', soglie: [150, 350, 600],
          descrizione: 'Opposing Pokémon knocked out.',
          valore: t => num(t.ko && t.ko.fatti), immagini: tre('badge-team-knockout-{l}.png') },
        { id: 'veteran', nome: 'Veteran', icona: '🎖️', unita: 'seasons played', soglie: [2, 3, 5],
          descrizione: 'Seasons played.',
          valore: t => num(t.stagioniGiocate), immagini: tre('badge-team-veteran-{l}.png') }
    ];

    const squadra = costruisci(CATALOGO, { titolo: 'TEAM BADGES' });
    const { IMMAGINI, calcola, guadagnati, perVicinanza, scheda, htmlBadge, htmlScaffale, htmlMini } = squadra;

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
            `<button type="button" class="bt-apri" aria-expanded="false" aria-haspopup="dialog">🏅 Badges <b>${presi}/${lista.length}</b></button>` +
            `<div class="bt-pop" role="dialog" aria-label="Team badges" hidden>${htmlScaffale(lista, { titolo: 'TEAM BADGES' })}${nota ? `<p class="bt-nota">${esc(nota)}</p>` : ''}</div>`;
        const tasto = casella.querySelector('.bt-apri'), pop = casella.querySelector('.bt-pop');
        // Si chiude con un clic fuori, con Esc e di nuovo col tasto; aprendosi resta dentro lo schermo (il pannello è largo)
        const fuori = e => { if (!pop.contains(e.target) && !tasto.contains(e.target)) chiudi(); };
        const tastiera = e => { if (e.key === 'Escape') { chiudi(); tasto.focus(); } };
        function chiudi() {
            pop.hidden = true;
            tasto.setAttribute('aria-expanded', 'false');
            document.removeEventListener('click', fuori, true);
            document.removeEventListener('keydown', tastiera);
        }
        function apri() {
            pop.hidden = false;
            tasto.setAttribute('aria-expanded', 'true');
            pop.style.left = '0px';
            const r = pop.getBoundingClientRect(), margine = 12;
            if (r.right > window.innerWidth - margine) pop.style.left = `${Math.min(0, window.innerWidth - margine - r.right)}px`;
            // sotto il tasto c'è posto fino al bordo dello schermo: oltre, il pannello scorre
            if (window.innerWidth > 560) pop.style.maxHeight = `${Math.max(260, window.innerHeight - r.top - margine)}px`;
            document.addEventListener('click', fuori, true);
            document.addEventListener('keydown', tastiera);
        }
        tasto.addEventListener('click', e => { e.stopPropagation(); pop.hidden ? apri() : chiudi(); });
        return true;
    }

    // Una versione piccola per le testate strette (il replay): le medagliette dei badge più alti e quanti ne ha il team, senza scaffale
    async function montaMini(db, casella, { giocatore, team, valido, max = 4 } = {}) {
        if (!casella || !giocatore || !team) return false;
        let entry = null;
        try { entry = trova(await finestra.Fiocchi.carica(db), { player: giocatore, team: team.nome }); } catch (e) { return false; }
        if (valido && !valido()) return false;
        const lista = calcola(entry);
        const presi = lista.filter(b => b.livello > 0).length;
        casella.innerHTML =
            `<span class="bt-barra-mini">${htmlMini(lista, max)}</span>` +
            `<span class="bt-conto-chip" title="${presi} of ${lista.length} team badges earned">🏅 ${presi}/${lista.length}</span>`;
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
        livelloDi, calcola, guadagnati, perVicinanza, scheda, trova,
        htmlBadge, htmlScaffale, htmlMini, immagineMancante,
        montaBarra, montaMini, riempiCard,
        // per altri cataloghi (badge-allenatore.js)
        costruisci, tre, CARTELLA, esc
    };
});
