// =====================================================
// MATCH DELLA SETTIMANA — Poké-Tournament
//
// Nella home, sotto le stagioni: un BANNER lungo e basso con il set più bello di una settimana e il replay a un tocco. Con le frecce (o i tasti ←/→, o
// scorrendo col dito) si passa da una settimana all'altra. Si sceglie da solo, dai numeri che il sito ha già (seasons/{id}/showdowns/{sd}/matches/{m}/
// setStats: un'analisi del log di ogni set, e replays/{set}/url). Niente da salvare.
//
// LE SETTIMANE sono quelle di calendario: da lunedì a domenica (non "gli ultimi 7 giorni"). Un set appartiene alla settimana del giorno in cui è stato
// giocato. Le settimane con almeno un set sono quelle che si possono scorrere; all'apertura si vede l'ultima. Se nella settimana in corso non si è ancora
// giocato, resta quella dell'ultima settimana in cui si è giocato: il banner c'è sempre finché esiste un replay.
//
// COME SI SCEGLIE, dentro una settimana. Ogni set riceve un PUNTEGGIO DI SPETTACOLO; vince il più alto.
//   - com'è finito:     vinto con 1 solo Pokémon rimasto +40 (con 0, cioè l'ultimo KO decide: +46), con 2 +14, con 3 o più 0 (una passeggiata)
//   - la rimonta:       il vincitore è arrivato a essere sotto di 2 Pokémon +26, di 3 +48 (di 1 solo: +4)
//   - la durata:        1,2 punti per turno, fino a 24 turni
//   - i KO:             2 punti per ogni Pokémon andato KO (di entrambi i lati)
//   - l'ultimo in piedi: ogni KO oltre il primo fatto dall'ultimo Pokémon rimasto al vincitore, +7 (fino a 3)
//   - la sorpresa:      se ha vinto chi aveva meno Elo, un punto ogni 8 di scarto (fino a 12)
//   - il match stretto: +6 se il match è finito con un solo set di scarto
// A parità vince il set giocato più di recente. Si escludono la stagione beta e i set senza replay (non ci sarebbe niente da guardare).
//
// Tre parti:
//   - settimane(seasons, { adesso }) / scegli() / analizzaSet(setStats): pure, niente DOM e niente Firebase (provate in test/match-settimana.test.js);
//   - html(scelto, { ... }): il banner di una settimana; badge(): le medagliette dei team e del Pokémon protagonista; linkReplay(): il link a matches.html?replay=...;
//   - monta(win, radice, { gif, leggiGiocatore }): disegna il banner, tiene la settimana guardata e collega le frecce, la tastiera e lo scorrimento.
// Funziona nel browser (window.MatchSettimana) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.MatchSettimana = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const GIORNO_MS = 86400000;
    const MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = (c, vuoto) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : vuoto);
    const arrotonda = x => Math.round(x * 10) / 10;

    /** Il giorno di un match come timestamp (mezzogiorno UTC, così i fusi orari non spostano il giorno): "2026-10-22" o "22/10/2026" */
    function giornoDi(testo) {
        const t = String(testo == null ? '' : testo).trim();
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
        if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
        m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(t);
        if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
        return null;
    }
    function quandoMatch(match, infoShowdown) {
        const g = giornoDi(match && match.data);
        if (g != null) return g;
        const h = giornoDi(infoShowdown && infoShowdown.data);
        if (h != null) return h;
        const e = Date.parse(match && match.lastEdit);
        return Number.isFinite(e) ? e : null;
    }

    // -----------------------------------------------------
    // Le settimane (da lunedì a domenica)
    // -----------------------------------------------------
    /** Il lunedì (mezzogiorno UTC) della settimana di un giorno */
    function lunediDi(ts) {
        const d = new Date(ts);
        const dow = (d.getUTCDay() + 6) % 7;          // lunedì = 0 ... domenica = 6
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow, 12);
    }
    /** Oggi come giorno (mezzogiorno UTC) nel fuso di chi guarda */
    function oggiComeGiorno(adesso) {
        const d = new Date(adesso);
        return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);
    }
    /** Il numero della settimana (ISO: quella del giovedì) di un lunedì, e il suo anno */
    function numeroSettimana(lunedi) {
        const giovedi = lunedi + 3 * GIORNO_MS;
        const anno = new Date(giovedi).getUTCFullYear();
        const giorni = Math.round((giovedi - Date.UTC(anno, 0, 1, 12)) / GIORNO_MS);
        return { numero: Math.floor(giorni / 7) + 1, anno };
    }
    /** Come si chiama una settimana: "This week", "Last week" o "Week 43", e le sue date ("19–25 Oct", "26 Oct – 1 Nov") */
    function etichettaSettimana(w, adesso = Date.now()) {
        const lunediOggi = lunediDi(oggiComeGiorno(adesso));
        const diff = Math.round((lunediOggi - w.inizio) / (7 * GIORNO_MS));
        const titolo = diff === 0 ? 'This week' : diff === 1 ? 'Last week' : `Week ${w.numero}`;
        const a = new Date(w.inizio), b = new Date(w.fine);
        const intervallo = a.getUTCMonth() === b.getUTCMonth()
            ? `${a.getUTCDate()}–${b.getUTCDate()} ${MESI[a.getUTCMonth()]}`
            : `${a.getUTCDate()} ${MESI[a.getUTCMonth()]} – ${b.getUTCDate()} ${MESI[b.getUTCMonth()]}`;
        return { titolo, intervallo };
    }
    /** La settimana a cui si passa muovendosi di `delta` (-1 più vecchia, +1 più nuova): non si esce dall'elenco */
    const spostamento = (indice, delta, totale) => Math.max(0, Math.min(Math.max(0, totale - 1), indice + delta));

    // -----------------------------------------------------
    // Quanto è bello un set
    // -----------------------------------------------------
    /**
     * @param {object} st   setStats di un set (statistiche-set.js: { turni, vincitore: 'p1'|'p2', p1: { portati, svenuti, pokemon: [...] }, p2 })
     * @param {object} ctx  { scartoElo: Elo di chi ha perso meno Elo di chi ha vinto (positivo = ha vinto chi ne aveva meno), matchStretto: bool }
     * @returns {object|null} null se il set non è leggibile (log incompleto)
     */
    function analizzaSet(st, ctx = {}) {
        if (!st || (st.vincitore !== 'p1' && st.vincitore !== 'p2') || !st.p1 || !st.p2) return null;
        const w = st.vincitore, l = w === 'p1' ? 'p2' : 'p1';
        const sw = st[w], sl = st[l];
        const portatiW = num(sw.portati), portatiL = num(sl.portati);
        if (portatiW < 1 || portatiL < 1) return null;

        const rimasti = Math.max(0, portatiW - num(sw.svenuti));

        // la partita turno per turno: quanti Pokémon vivi per lato dopo ogni turno in cui qualcuno è andato KO
        const eventi = [];
        for (const [lato, s] of [[w, sw], [l, sl]]) {
            for (const p of valori(s.pokemon)) if (p && p.svenuto && num(p.turnoKo) > 0) eventi.push({ turno: num(p.turnoKo), lato });
        }
        eventi.sort((a, b) => a.turno - b.turno);
        const vivi = { [w]: portatiW, [l]: portatiL };
        let maxSvantaggio = 0, viviQuandoSotto = null;      // di quanto è stato sotto il vincitore, e la sua situazione in quel momento
        for (let i = 0; i < eventi.length;) {
            const turno = eventi[i].turno;
            while (i < eventi.length && eventi[i].turno === turno) { vivi[eventi[i].lato] -= 1; i++; }
            const svantaggio = vivi[l] - vivi[w];
            if (svantaggio > maxSvantaggio) { maxSvantaggio = svantaggio; viviQuandoSotto = { vincitore: vivi[w], perdente: vivi[l] }; }
        }

        const koTotali = num(sw.svenuti) + num(sl.svenuti);
        const turni = num(st.turni);

        // il protagonista: l'ultimo Pokémon rimasto al vincitore (se c'è), altrimenti quello che ha fatto più KO
        const pokemonW = valori(sw.pokemon).filter(p => p && p.portato);
        const ultimo = pokemonW.find(p => p.ultimo) || null;
        const piuKo = pokemonW.slice().sort((a, b) => num(b.koFatti) - num(a.koFatti))[0] || null;
        const protagonista = ultimo || piuKo;
        const koUltimo = ultimo ? num(ultimo.koFatti) : 0;

        let punti = 0;
        punti += rimasti === 1 ? 40 : rimasti === 0 ? 46 : rimasti === 2 ? 14 : 0;
        punti += maxSvantaggio >= 3 ? 48 : maxSvantaggio === 2 ? 26 : maxSvantaggio === 1 ? 4 : 0;
        punti += Math.min(turni, 24) * 1.2;
        punti += koTotali * 2;
        punti += Math.min(3, Math.max(0, koUltimo - 1)) * 7;
        const scartoElo = num(ctx.scartoElo);
        if (scartoElo > 0) punti += Math.min(12, scartoElo / 8);
        if (ctx.matchStretto) punti += 6;

        // perché è bello, in poche parole (i più importanti per primi)
        const motivi = [];
        if (maxSvantaggio >= 2) motivi.push(`Came back from ${maxSvantaggio} down`);
        if (rimasti === 1) motivi.push('Won with 1 Pokémon left');
        else if (rimasti === 0) motivi.push('Decided by the very last KO');
        if (scartoElo >= 40) motivi.push(`Upset: ${Math.round(scartoElo)} less Elo`);
        if (ultimo && koUltimo >= 2) motivi.push(`${ultimo.specie} took ${koUltimo} KOs`);
        if (turni >= 14) motivi.push(`${turni} turns`);

        const lista = lato => valori(st[lato].pokemon).filter(p => p && p.portato).map(p => ({ specie: String(p.specie || ''), svenuto: !!p.svenuto, ultimo: !!p.ultimo, koFatti: num(p.koFatti) }));
        return {
            punteggio: arrotonda(punti),
            vincitore: w, turni, rimasti, maxSvantaggio, viviQuandoSotto, koTotali,
            protagonista: protagonista ? { specie: String(protagonista.specie || ''), lato: w, ko: num(protagonista.koFatti), ultimo: !!ultimo } : null,
            motivi: motivi.slice(0, 3),
            lati: { p1: { pokemon: lista('p1') }, p2: { pokemon: lista('p2') } }
        };
    }

    // -----------------------------------------------------
    // Tutti i set di tutte le stagioni, con il loro punteggio
    // -----------------------------------------------------
    function candidati(seasons) {
        const fuori = [];
        for (const [idStagione, stagione] of Object.entries(seasons && typeof seasons === 'object' ? seasons : {})) {
            if (idStagione === 'sbeta' || !stagione || typeof stagione !== 'object') continue;
            const infoStagione = stagione.info || {};
            for (const [idSd, sd] of Object.entries(stagione.showdowns || {})) {
                const infoSd = (sd && sd.info) || {};
                for (const [chiaveMatch, m] of Object.entries((sd && sd.matches) || {})) {
                    if (!m || !m.setStats || !m.replays || m.p1score == null || m.p2score == null) continue;
                    const quando = quandoMatch(m, infoSd);
                    if (quando == null) continue;
                    const a = num(m.p1score), b = num(m.p2score);
                    const elo1 = num(m.p1EloAtMatch), elo2 = num(m.p2EloAtMatch);
                    for (const [chiaveSet, ss] of Object.entries(m.setStats)) {
                        const replay = m.replays[chiaveSet];
                        if (!replay || !replay.url) continue;
                        const vince1 = ss && ss.vincitore === 'p1';
                        const scartoElo = elo1 && elo2 ? (vince1 ? elo2 - elo1 : elo1 - elo2) : 0;
                        const analisi = analizzaSet(ss, { scartoElo, matchStretto: Math.abs(a - b) === 1 });
                        if (!analisi) continue;
                        fuori.push({
                            ...analisi,
                            stagione: idStagione, nomeStagione: String(infoStagione.name || idStagione),
                            showdown: idSd, match: chiaveMatch, set: chiaveSet,
                            numeroMatch: parseInt(String(chiaveMatch).replace(/\D/g, ''), 10) || 1,
                            numeroSet: parseInt(String(chiaveSet).replace(/\D/g, ''), 10) || 1,
                            categoria: String(m.categoria || infoSd.categoria || ''), data: String(m.data || infoSd.data || ''), quando,
                            replayUrl: String(replay.url),
                            punteggioMatch: `${a}-${b}`,
                            giocatori: {
                                p1: { id: idDi(m.player1Id), nome: String(m.player1 || m.player1Id || ''), team: String(m.team1 || '') },
                                p2: { id: idDi(m.player2Id), nome: String(m.player2 || m.player2Id || ''), team: String(m.team2 || '') }
                            }
                        });
                    }
                }
            }
        }
        return fuori;
    }

    /** Il set che identifica una settimana scelta (per capire se è cambiato) */
    const chiaveSet = s => (s ? [s.stagione, s.showdown, s.match, s.set].join('|') : '');

    /**
     * Le settimane (da lunedì a domenica) in cui si è giocato almeno un set con replay, dalla più vecchia alla più nuova, ognuna con il suo set più bello.
     * La settimana in corso c'è solo se ha già un set: se no l'ultima è quella dell'ultima partita giocata. Niente date nel futuro.
     * @param {object} seasons  il nodo `seasons` di Firebase
     * @returns {{ elenco: Array<{ inizio, fine, numero, anno, corrente, quanti, scelto }>, indice: number }}  `indice` è la settimana da mostrare all'apertura (l'ultima)
     */
    function settimane(seasons, { adesso = Date.now() } = {}) {
        const oggi = oggiComeGiorno(adesso);
        const lunediOggi = lunediDi(oggi);
        const per = new Map();
        for (const c of candidati(seasons)) {
            if (c.quando > oggi + GIORNO_MS) continue;          // una data nel futuro è un errore (un giorno di tolleranza per i fusi orari)
            const lunedi = lunediDi(c.quando);
            if (lunedi > lunediOggi) continue;                  // una settimana che deve ancora cominciare
            if (!per.has(lunedi)) per.set(lunedi, []);
            per.get(lunedi).push(c);
        }
        const elenco = [...per.entries()].sort((a, b) => a[0] - b[0]).map(([inizio, set]) => {
            // il più bello; a parità il più recente; poi l'ordine dei nomi, perché nulla sia lasciato al caso
            set.sort((x, y) => y.punteggio - x.punteggio || y.quando - x.quando || chiaveSet(x).localeCompare(chiaveSet(y)));
            const { numero, anno } = numeroSettimana(inizio);
            return { inizio, fine: inizio + 6 * GIORNO_MS, numero, anno, corrente: inizio === lunediOggi, quanti: set.length, scelto: set[0] };
        });
        return { elenco, indice: elenco.length - 1 };
    }

    /** Il set più bello della settimana da mostrare all'apertura (la in corso o, se è vuota, l'ultima giocata); null se non c'è niente. */
    function scegli(seasons, opzioni) {
        const { elenco, indice } = settimane(seasons, opzioni);
        if (!elenco.length) return null;
        const w = elenco[indice];
        return { ...w.scelto, corrente: w.corrente, quanti: w.quanti, settimana: { inizio: w.inizio, fine: w.fine, numero: w.numero, anno: w.anno } };
    }

    /** Il link che apre il replay di quel set: matches.html?id=<stagione>&replay=<showdown>~<match>~<set> (matches.html lo apre da solo); da=home: chiudendo il replay si torna alla home */
    function linkReplay(s, daHome = true) {
        return `matches.html?id=${encodeURIComponent(s.stagione)}&replay=${encodeURIComponent(s.showdown)}~${encodeURIComponent(s.match)}~${encodeURIComponent(s.set)}${daHome ? '&da=home' : ''}`;
    }

    // -----------------------------------------------------
    // Come si vede (match-settimana.css): un banner basso e lungo
    // -----------------------------------------------------
    const dataBreve = iso => {
        const t = giornoDi(iso);
        if (t == null) return '';
        const d = new Date(t);
        return `${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`;
    };
    const COLORE_NEUTRO = '#d9dde6';
    const FRECCIA = { '-1': 'M16 3 L7 12 L16 21', '1': 'M8 3 L17 12 L8 21' };
    const bottoneFreccia = (verso, attivo) => `<button type="button" class="ms-freccia ${verso < 0 ? 'ms-prec' : 'ms-succ'}" data-ms-vai="${verso}"`
        + ` aria-label="${verso < 0 ? 'Previous week' : 'Next week'}" title="${verso < 0 ? 'Previous week' : 'Next week'}"${attivo ? '' : ' disabled'}>`
        + `<svg viewBox="0 0 24 24" width="12" height="18" aria-hidden="true" focusable="false"><path d="${FRECCIA[verso]}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter"/></svg></button>`;

    /**
     * Il banner di una settimana (il contenuto di `.ms`): una riga lunga e bassa.
     *   sul bordo in alto: l'etichetta nera a sinistra e, a destra, la settimana con le frecce per passare alla precedente e alla successiva
     *   nella riga: i due allenatori uno di fronte all'altro (avatar, nome, i Pokémon portati), in mezzo formato e set, il Pokémon protagonista con il motivo, il replay
     * @param {object} s  il set scelto di una settimana (settimane().elenco[i].scelto)
     * @param {object} extra
     *   giocatori   { id: { colore, avatar } }
     *   gif         gif(specie): l'immagine animata di un Pokémon
     *   settimana   { titolo, intervallo } (etichettaSettimana)
     *   indice, totale  quale settimana è e quante sono: con più di una compaiono le frecce
     *   animazione  'dx' | 'sx': da che parte entra il contenuto passando da una settimana all'altra
     *   daHome      false: il link del replay non riporta alla home (la Hall of Fame)
     */
    function html(s, { giocatori = {}, gif, settimana, indice = 0, totale = 1, animazione = '', daHome = true } = {}) {
        if (!s) return '';
        const sprite = (p, classe) => (gif && p.specie
            ? `<img class="${classe}${p.svenuto ? ' ms-ko' : ''}" src="${esc(gif(p.specie))}" alt="${esc(p.specie)}" title="${esc(p.specie)}${p.svenuto ? ' (fainted)' : ''}" loading="lazy" onerror="if(window.SpritePkm)SpritePkm.ritenta(this)">` : '');
        const lato = (k, n) => {
            const g = s.giocatori[k], extra = giocatori[g.id] || {};
            const vince = s.vincitore === k;
            const pagina = `public.html?player=${encodeURIComponent(g.nome)}`;
            const avatar = extra.avatar ? `<img class="ms-av" src="${esc(extra.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="ms-av ms-av-vuoto"></span>';
            // dell'allenatore resta l'avatar (il nome è nel suggerimento); il tag nero porta il nome del team (senza team, quello dell'allenatore)
            return `<div class="ms-lato ms-l${n} ${vince ? 'ms-vince' : 'ms-perde'}" style="--c:${coloreSicuro(extra.colore, COLORE_NEUTRO)}" title="${esc(g.nome)} · ${vince ? 'won' : 'lost'}">`
                + `<a class="ms-av-link" href="${esc(pagina)}" title="${esc(g.nome)}">${avatar}</a>`
                + `<div class="ms-testi"><div class="ms-riga"><a class="ms-nome-link" href="${esc(pagina)}" title="${esc(g.team ? `${g.team} · ${g.nome}` : g.nome)}"><b class="ms-nome nome-scorrevole">${esc(g.team || g.nome)}</b></a>`
                + `<span class="ms-bdg" data-ms-badge="${k}"></span></div>`
                + `<div class="ms-sprites">${s.lati[k].pokemon.map(p => sprite(p, 'ms-spr')).join('')}</div></div></div>`;
        };
        // il protagonista: medaglione (come nel Box), nome e il motivo più importante; gli altri motivi stanno nel suggerimento al passaggio del mouse
        const prot = s.protagonista;
        const motivo = s.motivi.length ? `<span class="ms-chip">${esc(s.motivi[0])}</span>` : '';
        const medaglione = prot && gif
            ? `<div class="ms-prot" title="${esc(s.motivi.join(' · '))}"><span class="ms-med" data-pkm="${esc(prot.specie)}"><img src="${esc(gif(prot.specie))}" alt="${esc(prot.specie)}" loading="lazy" onerror="if(window.SpritePkm)SpritePkm.ritenta(this)"><span class="ms-bdg ms-bdg-prot" data-ms-badge="prot"></span></span>`
              + `<div class="ms-prot-testo"><b class="ms-banner">${esc(prot.specie)}</b>${motivo}</div></div>`
            : (motivo ? `<div class="ms-prot" title="${esc(s.motivi.join(' · '))}"><div class="ms-prot-testo">${motivo}</div></div>` : '');
        const quando = dataBreve(s.data);
        const piu = totale > 1;
        // la settimana: con più di una, le frecce ai lati (la prima e l'ultima sono spente quando non c'è altro da cui andare)
        const pager = settimana
            ? `<div class="ms-pager${piu ? '' : ' ms-solo'}" role="group" aria-label="Week">${piu ? bottoneFreccia(-1, indice > 0) : ''}`
              + `<span class="ms-sett"><b>${esc(settimana.titolo)}</b><span>${esc(settimana.intervallo)}</span></span>${piu ? bottoneFreccia(1, indice < totale - 1) : ''}</div>`
            : '';
        return `<span class="ms-t">MATCH OF THE WEEK</span>${pager}`
            + `<div class="ms-corpo${animazione ? ` ms-in-${animazione === 'sx' ? 'sx' : 'dx'}` : ''}" aria-live="polite"><div class="ms-scontro">${lato('p1', 1)}`
            + `${lato('p2', 2)}</div>${medaglione}`
            + `<div class="ms-azione"><a class="ms-replay" href="${esc(linkReplay(s, daHome))}" title="${esc(['Watch the replay', [s.categoria, `Set ${s.numeroSet} · Match ${s.numeroMatch}`, quando, s.nomeStagione, `Match ${s.punteggioMatch}`].filter(Boolean).join(' · ')].join('\n'))}" aria-label="Watch the replay">&#9654; Replay</a></div></div>`;
    }

    /**
     * I badge da mettere nel banner: quelli dei due team (BadgeTeam) e quelli del Pokémon protagonista (Fiocchi), le stesse medagliette del Box e delle pagine dei team.
     * @param {object} risultato  Statistiche.calcola(...) di tutto il sito (Fiocchi.carica(db))
     * @param {object} s          il set scelto
     * @param {{ Fiocchi, BadgeTeam }} lib
     * @returns {{ p1: string, p2: string, prot: string }}  HTML delle medagliette (vuoto se non ne hanno)
     */
    function badge(risultato, s, lib) {
        const fuori = { p1: '', p2: '', prot: '' };
        if (!s || !lib || !lib.Fiocchi || !lib.BadgeTeam) return fuori;
        for (const k of ['p1', 'p2']) {
            const g = s.giocatori[k];
            if (!g.id || !g.team) continue;                         // senza team (random) non ci sono badge di team
            fuori[k] = lib.BadgeTeam.htmlMini(lib.BadgeTeam.calcola(lib.BadgeTeam.trova(risultato, { player: g.id, team: g.team })), 2);
        }
        const p = s.protagonista, g = p && s.giocatori[p.lato];
        if (p && p.specie && g && g.id && g.team) {
            // "Urshifu-*" (forma nascosta nel team preview, nei set salvati prima della correzione): si cerca la forma vera tra i Pokémon di quel team
            let specie = p.specie;
            if (/\*/.test(specie)) {
                const prefisso = specie.replace(/\*$/, '').toLowerCase();
                const forme = (risultato.pokemon || []).filter(x => idDi(x.player) === g.id && idDi(x.team) === idDi(g.team) && !/\*/.test(x.specie) && String(x.specie).toLowerCase().startsWith(prefisso));
                if (forme.length === 1) specie = forme[0].specie;
            }
            // sul medaglione stanno i due fiocchi più alti, senza il "+N" (non c'è posto)
            const presi = lib.Fiocchi.guadagnati(lib.Fiocchi.calcola(lib.Fiocchi.trova(risultato, { player: g.id, team: g.team, specie })));
            fuori.prot = presi.slice(0, 2).map(f => lib.Fiocchi.htmlMedaglietta(f)).join('');
        }
        return fuori;
    }

    // -----------------------------------------------------
    // Nella pagina: il banner con le sue settimane
    // -----------------------------------------------------
    /**
     * Disegna il banner dentro `radice` e collega le frecce, i tasti ←/→ e lo scorrimento col dito (verso sinistra = settimana più nuova).
     * @param {Window} win
     * @param {HTMLElement} radice  il contenitore (di solito `.ms`): ci si mette dentro l'HTML del banner
     * @param {object} opzioni
     *   gif(specie)        l'immagine animata di un Pokémon (senza, niente sprite)
     *   leggiGiocatore(id) -> Promise<{ colore, avatar }>: i colori e l'avatar di un allenatore (la pagina li legge da Firebase); ricordati dopo la prima volta
     *   caricaBadge()      -> Promise<risultato di Statistiche.calcola>: i numeri per i badge (di solito Fiocchi.carica(db)); i badge arrivano dopo il banner. Servono win.Fiocchi e win.BadgeTeam
     *   adesso()           l'ora di adesso (si cambia nelle prove)
     * @returns {{ aggiorna(esito): Promise<boolean>, vai(delta): Promise<boolean>, stato }}
     *   aggiorna: si chiama con settimane(...) a ogni lettura dei dati: ridisegna solo se qualcosa è cambiato, e non sposta chi sta guardando una settimana vecchia
     */
    function monta(win, radice, { gif, leggiGiocatore, caricaBadge, adesso = () => Date.now() } = {}) {
        const stato = { elenco: [], inizio: null, ultima: true, firma: '', giro: 0, trascinato: false };
        const cache = new Map();
        const info = id => {
            if (!id) return Promise.resolve({});
            // una lettura riuscita si ricorda; una fallita no, così al prossimo giro ci si riprova
            if (!cache.has(id)) cache.set(id, Promise.resolve().then(() => (leggiGiocatore ? leggiGiocatore(id) : {})).then(x => x || {}).catch(() => { cache.delete(id); return {}; }));
            return cache.get(id);
        };
        const indiceDi = () => stato.elenco.findIndex(w => w.inizio === stato.inizio);

        async function disegna(animazione) {
            const mio = ++stato.giro;
            const i = indiceDi();
            const w = stato.elenco[i];
            if (!w) return false;
            const giocatori = {};
            await Promise.all(['p1', 'p2'].map(async k => { const id = w.scelto.giocatori[k].id; if (id) giocatori[id] = await info(id); }));
            if (mio !== stato.giro) return false;                // nel frattempo è stato chiesto altro: vale l'ultima richiesta
            radice.innerHTML = html(w.scelto, { giocatori, gif, settimana: etichettaSettimana(w, adesso()), indice: i, totale: stato.elenco.length, animazione });
            if (win && win.MedaglionePkm) win.MedaglionePkm.coloraMedaglioni(win, radice);       // il colore del tipo arriva appena PokeAPI risponde
            // i badge arrivano a banner già visibile (servono le statistiche di tutto il sito): se nel frattempo si è passati a un'altra settimana non si scrive più
            if (caricaBadge && win && win.Fiocchi && win.BadgeTeam) {
                Promise.resolve().then(caricaBadge).then(risultato => {
                    if (mio !== stato.giro || !radice.querySelector) return;
                    const b = badge(risultato, w.scelto, win);
                    for (const k of ['p1', 'p2', 'prot']) { const casella = radice.querySelector(`[data-ms-badge="${k}"]`); if (casella) casella.innerHTML = b[k]; }
                }).catch(() => {});
            }
            // le settimane vicine si preparano subito: scorrendo, avatar e colori ci sono già
            [i - 1, i + 1].forEach(j => { const v = stato.elenco[j]; if (v) ['p1', 'p2'].forEach(k => info(v.scelto.giocatori[k].id)); });
            return true;
        }

        function vai(delta) {
            const i = indiceDi();
            const nuovo = spostamento(i, delta, stato.elenco.length);
            if (i < 0 || nuovo === i) return Promise.resolve(false);
            stato.inizio = stato.elenco[nuovo].inizio;
            stato.ultima = nuovo === stato.elenco.length - 1;
            stato.firma = firmaDi(nuovo);
            return disegna(delta > 0 ? 'dx' : 'sx');
        }
        const firmaDi = i => `${stato.elenco.length}|${stato.elenco[i].inizio}|${chiaveSet(stato.elenco[i].scelto)}|${stato.elenco[i].quanti}`;

        function aggiorna(esito) {
            stato.elenco = (esito && esito.elenco) || [];
            if (!stato.elenco.length) { stato.firma = ''; stato.giro++; radice.innerHTML = ''; return Promise.resolve(false); }      // giro++: un disegno ancora in corso non fa riapparire il vecchio banner
            // chi sta guardando una settimana vecchia ci resta; chi guarda l'ultima segue quella (anche se ne arriva una nuova)
            let i = !stato.ultima && stato.inizio != null ? indiceDi() : -1;
            if (i < 0) i = typeof esito.indice === 'number' ? esito.indice : stato.elenco.length - 1;
            stato.inizio = stato.elenco[i].inizio;
            stato.ultima = i === stato.elenco.length - 1;
            const firma = firmaDi(i);
            if (firma === stato.firma) return Promise.resolve(false);
            stato.firma = firma;
            return disegna('');
        }

        // le frecce (il contenuto si ridisegna: l'ascolto sta sul contenitore, che resta)
        radice.addEventListener('click', e => {
            if (stato.trascinato) { e.preventDefault(); e.stopPropagation(); return; }
            const b = e.target && e.target.closest ? e.target.closest('[data-ms-vai]') : null;
            if (!b || b.disabled) return;
            const verso = b.getAttribute('data-ms-vai');
            const datastiera = e.detail === 0;
            vai(Number(verso)).then(() => {
                // da tastiera il fuoco resta sulla freccia che si è usata (il contenuto è stato ridisegnato); se è arrivata in fondo, passa all'altra
                if (!datastiera || !radice.querySelector) return;
                const nuova = radice.querySelector(`[data-ms-vai="${verso}"]:not(:disabled)`) || radice.querySelector('[data-ms-vai]:not(:disabled)');
                if (nuova && nuova.focus) nuova.focus();
            });
        });
        radice.addEventListener('keydown', e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); vai(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); vai(1); }
        });
        // scorrere col dito (o col mouse tenuto premuto): verso sinistra la settimana più nuova, verso destra la più vecchia
        let inizioX = null, inizioY = null;
        radice.addEventListener('pointerdown', e => { inizioX = e.clientX; inizioY = e.clientY; });
        radice.addEventListener('pointerup', e => {
            if (inizioX == null) return;
            const dx = e.clientX - inizioX, dy = e.clientY - inizioY;
            inizioX = inizioY = null;
            if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
            stato.trascinato = true;                               // il click che segue la fine dello scorrimento non deve aprire un link
            if (win && win.setTimeout) win.setTimeout(() => { stato.trascinato = false; }, 0);
            vai(dx < 0 ? 1 : -1);
        });
        radice.addEventListener('pointercancel', () => { inizioX = inizioY = null; });

        return { aggiorna, vai, stato };
    }

    return { analizzaSet, candidati, settimane, scegli, spostamento, etichettaSettimana, lunediDi, numeroSettimana, linkReplay, html, badge, monta, giornoDi };
});
