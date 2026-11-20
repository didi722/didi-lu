// =====================================================
// SCONTRI DIRETTI — Poké-Tournament
//
// Il testa a testa tra due allenatori (pagina Trainers, e l'app): chi ha vinto più showdown, match e set, gli ultimi incontri, la forma recente, la serie
// in corso, come va formato per formato e il verdetto (nemesi, preda, alla pari, rivali storici).
//
// È pura: niente DOM, niente Firebase (la finestra e la lettura dei dati stanno in scontri-diretti-ui.js). I numeri sono quelli del profilo
// (profilo-personale.js, Profile > Rivals): stesse stagioni escluse (la beta e le cup, che non fanno statistica), stesse regole su chi ha vinto un match e una
// serie. Se cambiano lì, cambiano qui: i test confrontano i due conti.
//
// Dati in ingresso: le stagioni come stanno nel database, { id: { info, showdowns: { id: { info, matches: { match1: {...} } } } } }. Uno showdown è una serie di
// match; un match è al meglio di N set (p1score / p2score sono i set vinti da ciascuno). Gli id degli allenatori sono in minuscolo (come in `players`).
//
//   ScontriDiretti.confronta(a, b, stagioni, { beta, nomi })     il testa a testa di `a` contro `b`: `a` è il punto di vista (i suoi match vinti sono "a")
//   ScontriDiretti.coppiaIniziale(io, avversario, giocatori)     { a, b }: chi si confronta quando si apre la finestra: a = chi è collegato (o il primo della classifica), b = `avversario` o, senza, il primo degli altri
//   ScontriDiretti.verdetto(confronto, { io })                   { id, etichetta, testo, chi }: nemesi, preda, alla pari, rivali storici...
//   ScontriDiretti.htmlTesta(confronto, { giocatori, io, esc })  i due allenatori, ognuno con avatar e selettore
//   ScontriDiretti.htmlScheda(confronto, opzioni)                verdetto, numeri, forma, formati e ultimi incontri
//   ScontriDiretti.dataBreve(ms)                                 "22 Oct 2026"
//
// Funziona nel browser (window.ScontriDiretti) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./profilo-personale.js'));
    else radice.ScontriDiretti = fabbrica(radice.ProfiloPersonale);
})(typeof self !== 'undefined' ? self : this, function (P) {
    'use strict';

    const FORMA_MAX = P.FORMA_MAX;              // quanti risultati recenti mostrare
    const MIN_MATCH = P.MIN_MATCH_RIVALE;       // sotto questa soglia non c'è né nemesi né preda
    const MATCH_RIVALI = 6;                     // da qui, con i conti in pari (o a un match di distanza), sono rivali storici
    const MAX_INCONTRI = 5;                     // quanti showdown elencare prima di "Show all"
    const AVATAR_PREDEFINITO = 'immagini/magikarp.png';
    const COLORE_PREDEFINITO = '#31c489';
    const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const idDi = P.idDi;
    const oggetti = x => (x && typeof x === 'object' ? x : {});
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const esc0 = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : COLORE_PREDEFINITO);

    // l'ultimo numero di una chiave ("match2" → 2, "s10" → 10); la beta viene prima di tutte
    const cifre = t => { const m = /(\d+)\s*$/.exec(String(t)); return m ? parseInt(m[1], 10) : Infinity; };
    const ordineStagione = id => (idDi(id) === P.BETA ? -1 : cifre(id));
    const perNumero = (x, y) => (cifre(x) - cifre(y)) || String(x).localeCompare(String(y));
    const perStagione = (x, y) => (ordineStagione(x) - ordineStagione(y)) || String(x).localeCompare(String(y));

    /** "22 Oct 2026" (in UTC: le date degli showdown sono giorni, non istanti); '' se manca */
    function dataBreve(ms) {
        if (!ms) return '';
        const d = new Date(ms);
        return Number.isNaN(d.getTime()) ? '' : `${d.getUTCDate()} ${MESI[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }

    // =================================================
    // IL CALCOLO
    // =================================================
    /**
     * Il testa a testa di `a` contro `b`, in tutte le stagioni date tranne la beta e le cup (con { beta: true } anche la beta). Tutto dal punto di vista di `a`:
     *   match / set / showdown: { a, b } (showdown anche inCorso) quanti ne ha vinti ciascuno
     *   giocati        i match giocati (match.a + match.b)
     *   forma          gli ultimi risultati di `a`, dal più vecchio: 'V' vinto, 'P' perso
     *   serie          { chi: 'a'|'b'|'', quanti } i match vinti di fila più di recente
     *   formati        [{ formato, match: {a, b}, showdown: {a, b} }] dal più giocato
     *   stagioni       gli id delle stagioni in cui si sono incontrati
     *   primo, ultimo  quando (ms; 0 se non si sa)
     *   incontri       gli showdown giocati, dal più recente: { stagione, nomeStagione, id, formato, data, inCorso, vincitore: 'a'|'b'|'', punteggio: {a, b},
     *                  match: [{ n, a, b, vincitore, squadre: {a, b}, t }] } (a e b sono i set vinti nel match)
     * `nomi`: { id: nome da mostrare }; senza, si usano i nomi scritti negli showdown.
     */
    function confronta(a, b, stagioni, { beta = false, nomi = {} } = {}) {
        a = idDi(a); b = idDi(b);
        const c = {
            a: { id: a, nome: (nomi && nomi[a]) || a }, b: { id: b, nome: (nomi && nomi[b]) || b },
            match: { a: 0, b: 0 }, set: { a: 0, b: 0 }, showdown: { a: 0, b: 0, inCorso: 0 },
            giocati: 0, forma: [], serie: { chi: '', quanti: 0 }, formati: [], stagioni: [], primo: 0, ultimo: 0, incontri: []
        };
        if (!a || !b || a === b) return c;

        const risultati = [];                   // { t, chi } di ogni match, per la forma e la serie
        const perFormato = new Map();
        const viste = new Set();
        const nomeDato = id => !!(nomi && nomi[id]);

        for (const [idStagione, S] of Object.entries(oggetti(stagioni))) {
            if (!beta && idDi(idStagione) === P.BETA) continue;
            const info = oggetti(oggetti(S).info);
            if (idDi(info.tipo) === 'cup') continue;      // le cup non fanno statistica
            for (const [idSd, sd] of Object.entries(oggetti(oggetti(S).showdowns))) {
                if (!sd || !sd.info) continue;
                const [p1, p2] = P.giocatoriShowdown(sd);
                if (!p1 || !p2 || !((p1 === a && p2 === b) || (p1 === b && p2 === a))) continue;
                const aInP1 = p1 === a;
                viste.add(idStagione);
                if (!nomeDato(a)) c.a.nome = (aInP1 ? sd.info.player1 : sd.info.player2) || c.a.nome;
                if (!nomeDato(b)) c.b.nome = (aInP1 ? sd.info.player2 : sd.info.player1) || c.b.nome;

                const formato = String(sd.info.categoria || '');
                const f = perFormato.get(formato) || { formato, match: { a: 0, b: 0 }, showdown: { a: 0, b: 0 } };
                perFormato.set(formato, f);

                const incontro = {
                    stagione: idStagione, nomeStagione: info.name || idStagione, id: idSd, formato, data: 0,
                    inCorso: false, vincitore: '', punteggio: { a: 0, b: 0 }, match: []
                };
                const matches = oggetti(sd.matches);
                for (const chiave of Object.keys(matches).sort(perNumero)) {
                    const m = matches[chiave];
                    const v = P.vincitoreMatch(m, sd);
                    if (!v) continue;
                    const aInMatchP1 = (idDi(m.player1Id || m.player1) || p1) === a;
                    const sa = num(aInMatchP1 ? m.p1score : m.p2score);
                    const sb = num(aInMatchP1 ? m.p2score : m.p1score);
                    const chi = v === a ? 'a' : 'b';
                    const t = P.tempoDi(m.lastEdit) || P.tempoDi(m.data) || P.tempoDi(sd.info.lastUpdate) || P.tempoDi(sd.info.timestamp) || P.tempoDi(sd.info.data);
                    c.set.a += sa; c.set.b += sb;
                    c.match[chi]++; f.match[chi]++; incontro.punteggio[chi]++;
                    risultati.push({ t, chi });
                    incontro.data = Math.max(incontro.data, t);
                    incontro.match.push({
                        n: cifre(chiave) === Infinity ? incontro.match.length + 1 : cifre(chiave), a: sa, b: sb, vincitore: chi, t,
                        squadre: { a: String((aInMatchP1 ? m.team1 : m.team2) || ''), b: String((aInMatchP1 ? m.team2 : m.team1) || '') }
                    });
                }

                if (P.completato(sd)) {
                    const v = P.vincitoreShowdown(sd);
                    if (v === a) { c.showdown.a++; f.showdown.a++; incontro.vincitore = 'a'; }
                    else if (v === b) { c.showdown.b++; f.showdown.b++; incontro.vincitore = 'b'; }
                } else {
                    c.showdown.inCorso++;
                    incontro.inCorso = true;
                }
                if (!incontro.data) incontro.data = P.tempoDi(sd.info.lastUpdate) || P.tempoDi(sd.info.timestamp) || P.tempoDi(sd.info.data);
                if (incontro.match.length) c.incontri.push(incontro);
            }
        }

        c.giocati = c.match.a + c.match.b;
        risultati.sort((x, y) => x.t - y.t);          // ordine stabile: a pari data resta quello di lettura
        c.forma = risultati.slice(-FORMA_MAX).map(x => (x.chi === 'a' ? 'V' : 'P'));
        if (risultati.length) {
            const chi = risultati[risultati.length - 1].chi;
            let quanti = 0;
            for (let i = risultati.length - 1; i >= 0 && risultati[i].chi === chi; i--) quanti++;
            c.serie = { chi, quanti };
        }
        const tempi = risultati.map(x => x.t).filter(Boolean);
        c.primo = tempi.length ? Math.min(...tempi) : 0;
        c.ultimo = tempi.length ? Math.max(...tempi) : 0;
        c.stagioni = [...viste].sort(perStagione);
        c.formati = [...perFormato.values()].filter(f => f.formato)
            .sort((x, y) => (y.match.a + y.match.b) - (x.match.a + x.match.b) || x.formato.localeCompare(y.formato));
        c.incontri.sort((x, y) => (y.data - x.data) || perStagione(y.stagione, x.stagione) || String(y.id).localeCompare(String(x.id)));
        return c;
    }

    /**
     * Chi si confronta aprendo la finestra dal tasto di `avversario`: chi guarda (`io`, se è tra gli allenatori e non è l'avversario) contro di lui; senza login, o se chi guarda
     * è proprio l'avversario, il primo della classifica che non sia lui. `giocatori`: [{ id, ... }] in ordine di classifica. Dà { a, b } (id in minuscolo; a vuoto se non c'è nessun altro).
     */
    function coppiaIniziale(io, avversario, giocatori) {
        const ids = (Array.isArray(giocatori) ? giocatori : []).map(g => idDi(g && g.id)).filter(Boolean);
        const mio = idDi(io);
        const scelto = idDi(avversario);
        const a = scelto ? (mio && mio !== scelto && ids.includes(mio) ? mio : (ids.find(id => id !== scelto) || ''))
                         : (mio && ids.includes(mio) ? mio : (ids[0] || ''));
        const b = scelto || ids.find(id => id !== a) || '';
        return { a, b };
    }

    // =================================================
    // IL VERDETTO
    // =================================================
    /**
     * Cosa dicono i numeri, dal punto di vista di `a`:
     *   nessuno   non si sono mai incontrati            inizio  meno di MIN_MATCH match: presto per dirlo
     *   rivali    almeno MATCH_RIVALI match e conti in pari o a un match di distanza (rivali storici)
     *   pari      conti in pari                         nemesi  `b` ha vinto più match di `a`        preda  `a` ha vinto più match di `b`
     * `io`: l'id di chi guarda la pagina: nel testo diventa "you" / "your". `chi` è chi è avanti ('a', 'b' o '').
     */
    function verdetto(c, { io = '' } = {}) {
        const tu = p => !!idDi(io) && idDi(io) === p.id;
        const nome = (p, mezzo = false) => (tu(p) ? (mezzo ? 'you' : 'You') : p.nome);       // "you" in mezzo alla frase
        const suo = p => (tu(p) ? 'your' : `${p.nome}'s`);
        const verbo = p => (tu(p) ? 'are' : 'is');
        const { a, b } = c;
        const ma = c.match.a, mb = c.match.b, tot = ma + mb;
        if (!tot) {
            return {
                id: 'nessuno', etichetta: 'No clash yet', chi: '',
                testo: c.showdown.inCorso ? `${nome(a)} and ${nome(b, true)} are playing their first showdown right now.` : `${nome(a)} and ${nome(b, true)} haven't met in a showdown yet.`
            };
        }
        const diff = ma - mb;
        if (tot < MIN_MATCH) return { id: 'inizio', etichetta: 'Just started', chi: diff > 0 ? 'a' : diff < 0 ? 'b' : '', testo: `Only ${tot} match played so far: too early to call it.` };
        if (tot >= MATCH_RIVALI && Math.abs(diff) <= 1) {
            return { id: 'rivali', etichetta: 'Arch-rivals', chi: diff > 0 ? 'a' : diff < 0 ? 'b' : '', testo: `${nome(a)} and ${nome(b, true)} have played ${tot} matches and are still neck and neck.` };
        }
        if (!diff) return { id: 'pari', etichetta: 'All square', chi: '', testo: `${nome(a)} and ${nome(b, true)} are level at ${ma}–${mb} in matches.` };
        if (diff < 0) return { id: 'nemesi', etichetta: 'Nemesis', chi: 'b', testo: `${nome(b)} ${verbo(b)} ${suo(a)} nemesis (${mb}–${ma} in matches).` };
        return { id: 'preda', etichetta: 'Prey', chi: 'a', testo: `${nome(b)} ${verbo(b)} ${suo(a)} prey (${ma}–${mb} in matches).` };
    }

    // =================================================
    // L'HTML (stringhe: la pagina le mette in un contenitore). Tutto il testo che viene dal database passa da esc.
    // =================================================
    const quanti = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

    /** I due allenatori, ognuno con l'avatar nel suo colore e un selettore per cambiarlo. `giocatori`: [{ id, nome, avatar, colore }] */
    function htmlTesta(c, { giocatori = [], io = '', esc = esc0 } = {}) {
        const lato = (p, chi, altro) => {
            const g = giocatori.find(x => idDi(x.id) === p.id) || {};
            const nomeMostrato = g.nome || p.nome;
            const mio = x => !!idDi(io) && idDi(io) === idDi(x);
            const opzioni = giocatori.map(x => {
                const id = idDi(x.id);
                return `<option value="${esc(id)}"${id === p.id ? ' selected' : ''}${id === altro.id ? ' disabled' : ''}>${esc(x.nome || x.id)}${mio(id) ? ' (you)' : ''}</option>`;
            }).join('');
            return `<div class="h2h-lato h2h-lato-${chi}" style="--c: ${esc(coloreSicuro(g.colore))}">
                <img class="h2h-avatar" src="${esc(P.percorsoAvatar(g.avatar, AVATAR_PREDEFINITO))}" alt="" draggable="false" onerror="this.onerror=null;this.src='${AVATAR_PREDEFINITO}'">
                ${giocatori.length
                    ? `<select class="h2h-scelta" data-h2h-scelta="${chi}" aria-label="${chi === 'a' ? 'First' : 'Second'} trainer">${opzioni}</select>`
                    : `<span class="h2h-nome">${esc(nomeMostrato)}${mio(p.id) ? ' (you)' : ''}</span>`}
            </div>`;
        };
        return `<div class="h2h-versus">${lato(c.a, 'a', c.b)}
            <button type="button" class="h2h-vs" data-h2h-scambia title="Swap the two trainers" aria-label="Swap the two trainers"><span>VS</span></button>
            ${lato(c.b, 'b', c.a)}</div>`;
    }

    function htmlTabellone(c, esc) {
        const riga = (voce, x, y, classe = '') => `<div class="h2h-riga ${classe}">
                <b class="h2h-num h2h-num-a${x > y ? ' h2h-avanti' : ''}">${esc(x)}</b><span class="h2h-voce">${esc(voce)}</span><b class="h2h-num h2h-num-b${y > x ? ' h2h-avanti' : ''}">${esc(y)}</b>
            </div>`;
        const pa = c.giocati ? Math.round((c.match.a / c.giocati) * 100) : 50;
        return `<div class="h2h-tabellone">
            ${riga('Matches', c.match.a, c.match.b, 'h2h-riga-grande')}
            <div class="h2h-barra" role="img" aria-label="${esc(c.a.nome)} won ${pa}% of the matches"><span class="h2h-barra-a" style="width:${pa}%"></span><span class="h2h-barra-b" style="width:${100 - pa}%"></span></div>
            ${riga('Sets', c.set.a, c.set.b)}
            ${riga('Showdowns', c.showdown.a, c.showdown.b)}
            ${c.showdown.inCorso ? `<p class="h2h-nota">${esc(quanti(c.showdown.inCorso, 'showdown', 'showdowns'))} in progress</p>` : ''}
        </div>`;
    }

    function htmlForma(c, esc, io) {
        if (!c.forma.length) return '';
        const lettere = c.forma.map(x => `<i class="${x === 'V' ? 'h2h-w' : 'h2h-l'}">${x === 'V' ? 'W' : 'L'}</i>`).join('');
        let serie = '';
        if (c.serie.quanti >= 2) {
            const p = c.serie.chi === 'a' ? c.a : c.b;
            const tu = !!idDi(io) && idDi(io) === p.id;
            serie = `<span class="h2h-serie">${esc(tu ? 'You have' : p.nome + ' has')} won the last ${c.serie.quanti} matches</span>`;
        }
        return `<div class="h2h-forma"><span class="h2h-titoletto">${esc(c.a.nome)}'s latest matches</span><span class="h2h-pallini" role="img" aria-label="Latest results, oldest first">${lettere}</span>${serie}</div>`;
    }

    function htmlFormati(c, esc) {
        if (!c.formati.length) return '';
        const voci = c.formati.map(f => `<span class="h2h-formato"><b>${esc(f.formato)}</b> ${f.match.a}–${f.match.b}</span>`).join('');
        return `<div class="h2h-formati"><span class="h2h-titoletto">By format (matches)</span><span class="h2h-formati-lista">${voci}</span></div>`;
    }

    function htmlIncontro(i, c, { esc, data, linkStagione }) {
        const esito = i.inCorso ? `In progress · ${i.punteggio.a}–${i.punteggio.b}`
            : i.vincitore === 'a' ? `${c.a.nome} won ${i.punteggio.a}–${i.punteggio.b}`
                : i.vincitore === 'b' ? `${c.b.nome} won ${i.punteggio.b}–${i.punteggio.a}`
                    : `Draw ${i.punteggio.a}–${i.punteggio.b}`;
        const chip = i.match.map(m => {
            const squadre = m.squadre.a && m.squadre.b ? ` · ${m.squadre.a} vs ${m.squadre.b}` : '';
            return `<span class="h2h-m h2h-m-${m.vincitore}" title="${esc(`Match ${m.n}${squadre}`)}">${esc(m.a)}–${esc(m.b)}</span>`;
        }).join('');
        const quando = data(i.data);
        return `<li class="h2h-incontro ${i.inCorso ? 'h2h-in-corso' : i.vincitore ? `h2h-vince-${i.vincitore}` : 'h2h-pari'}">
            <div class="h2h-inc-testa">
                <a class="h2h-inc-stagione" href="${esc(linkStagione(i.stagione))}">${esc(i.nomeStagione)}</a>
                ${i.formato ? `<span class="h2h-inc-formato">${esc(i.formato)}</span>` : ''}
                ${quando ? `<time class="h2h-inc-data">${esc(quando)}</time>` : ''}
            </div>
            <div class="h2h-inc-corpo"><span class="h2h-inc-esito">${esc(esito)}</span><span class="h2h-inc-match" aria-label="Sets won in each match">${chip}</span></div>
        </li>`;
    }

    /**
     * Il corpo della finestra: verdetto, numeri, forma, formati e ultimi incontri.
     * opzioni: esc, io (l'id di chi guarda), colori { a, b } (le barre), tutti (elenca tutti gli showdown), massimo, data(ms), linkStagione(id)
     */
    function htmlScheda(c, opzioni = {}) {
        const { esc = esc0, io = '', tutti = false, massimo = MAX_INCONTRI, data = dataBreve, colori = {}, linkStagione = id => `matches.html?id=${encodeURIComponent(id)}` } = opzioni;
        const stile = `--ca: ${esc(coloreSicuro(colori.a))}; --cb: ${esc(coloreSicuro(colori.b))}`;
        if (!c.a.id || !c.b.id || c.a.id === c.b.id) return `<section class="h2h-corpo" style="${stile}"><p class="h2h-vuoto">Pick two different trainers to compare.</p></section>`;
        const v = verdetto(c, { io });
        const visibili = tutti ? c.incontri : c.incontri.slice(0, massimo);
        const incontri = c.incontri.length
            ? `<div class="h2h-incontri-box"><h3 class="h2h-sotto">${tutti || c.incontri.length <= massimo ? 'Meetings' : 'Latest meetings'}</h3>
                <ol class="h2h-incontri">${visibili.map(i => htmlIncontro(i, c, { esc, data, linkStagione })).join('')}</ol>
                ${!tutti && c.incontri.length > massimo ? `<button type="button" class="h2h-altri" data-h2h-altri>Show all ${c.incontri.length} showdowns</button>` : ''}</div>`
            : '';
        // due gruppi: la sintesi (verdetto e numeri) e i dettagli (forma, formati, incontri); nella pagina stanno uno sopra l'altro, nell'app affiancati
        return `<section class="h2h-corpo" style="${stile}">
            <div class="h2h-sintesi">
                <p class="h2h-verdetto h2h-v-${v.id}${v.chi ? ` h2h-avanti-${v.chi}` : ''}"><span class="h2h-sticker">${esc(v.etichetta)}</span><span class="h2h-frase">${esc(v.testo)}</span></p>
                ${c.giocati || c.showdown.inCorso ? htmlTabellone(c, esc) : ''}
            </div>
            <div class="h2h-dettagli">
                ${htmlForma(c, esc, io)}
                ${htmlFormati(c, esc)}
                ${incontri}
            </div>
        </section>`;
    }

    return {
        FORMA_MAX, MIN_MATCH, MATCH_RIVALI, MAX_INCONTRI,
        confronta, coppiaIniziale, verdetto, htmlTesta, htmlScheda, dataBreve
    };
});
