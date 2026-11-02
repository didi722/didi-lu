// =====================================================
// MATCH DELLA SETTIMANA — Poké-Tournament
//
// Nella home, sotto le stagioni: il set più bello degli ultimi sette giorni, con il replay a un tocco. Si sceglie da solo, dai numeri che il sito ha già
// (seasons/{id}/showdowns/{sd}/matches/{m}/setStats: un'analisi del log di ogni set, e replays/{set}/url). Niente da salvare.
//
// COME SI SCEGLIE. Ogni set riceve un PUNTEGGIO DI SPETTACOLO; vince il più alto tra i set giocati negli ultimi 7 giorni. Se in questi 7 giorni non si è
// giocato (tra una stagione e l'altra) si prende la settimana dell'ultima partita giocata: il blocco c'è sempre finché esiste un replay.
//   - com'è finito:     vinto con 1 solo Pokémon rimasto +40 (con 0, cioè l'ultimo KO decide: +46), con 2 +14, con 3 o più 0 (una passeggiata)
//   - la rimonta:       il vincitore è arrivato a essere sotto di 2 Pokémon +26, di 3 +48 (di 1 solo: +4)
//   - la durata:        1,2 punti per turno, fino a 24 turni
//   - i KO:             2 punti per ogni Pokémon andato KO (di entrambi i lati)
//   - l'ultimo in piedi: ogni KO oltre il primo fatto dall'ultimo Pokémon rimasto al vincitore, +7 (fino a 3)
//   - la sorpresa:      se ha vinto chi aveva meno Elo, un punto ogni 8 di scarto (fino a 12)
//   - il match stretto: +6 se il match è finito con un solo set di scarto
// A parità vince il set giocato più di recente. Si escludono la stagione beta e i set senza replay (non ci sarebbe niente da guardare).
//
// Due parti:
//   - scegli(seasons, { adesso }) / analizzaSet(setStats): pure, niente DOM e niente Firebase (provate in test/match-settimana.test.js);
//   - html(scelto, { giocatori, gif }) / linkReplay(scelto): il blocco della home (match-settimana.css) e il link a matches.html?replay=...
// Funziona nel browser (window.MatchSettimana) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.MatchSettimana = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const GIORNI = 7;
    const GIORNO_MS = 86400000;

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

    /**
     * Il set più bello degli ultimi `giorni` giorni (o della settimana dell'ultima partita, se in questi giorni non si è giocato).
     * @param {object} seasons  il nodo `seasons` di Firebase
     * @returns {object|null}   il set scelto (analizzaSet + dove sta + chi lo ha giocato), con `corrente` (true: è davvero degli ultimi giorni) e `quanti` (set in gara)
     */
    function scegli(seasons, { adesso = Date.now(), giorni = GIORNI } = {}) {
        const tutti = candidati(seasons).filter(c => c.quando <= adesso + GIORNO_MS);
        if (!tutti.length) return null;
        let corrente = true;
        let gara = tutti.filter(c => c.quando > adesso - giorni * GIORNO_MS);
        if (!gara.length) {
            const ultimo = Math.max(...tutti.map(c => c.quando));
            gara = tutti.filter(c => c.quando > ultimo - giorni * GIORNO_MS);
            corrente = false;
        }
        gara.sort((x, y) => y.punteggio - x.punteggio || y.quando - x.quando || String(x.showdown + x.match + x.set).localeCompare(String(y.showdown + y.match + y.set)));
        return { ...gara[0], corrente, quanti: gara.length };
    }

    /** Il link che apre il replay di quel set: matches.html?id=<stagione>&replay=<showdown>~<match>~<set> (matches.html lo apre da solo) */
    function linkReplay(s) {
        return `matches.html?id=${encodeURIComponent(s.stagione)}&replay=${encodeURIComponent(s.showdown)}~${encodeURIComponent(s.match)}~${encodeURIComponent(s.set)}`;
    }

    // -----------------------------------------------------
    // Come si vede (match-settimana.css)
    // -----------------------------------------------------
    const dataBreve = iso => {
        const t = giornoDi(iso);
        if (t == null) return '';
        const d = new Date(t);
        return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
    };
    const COLORE_NEUTRO = '#d9dde6';

    /**
     * Il blocco della home: un nastro basso (si legge a colpo d'occhio, senza rubare la pagina alle stagioni).
     *   in alto: i due allenatori sui loro colori, uno di fronte all'altro (avatar, nome, team, i Pokémon portati) e in mezzo formato e set
     *   in basso: il Pokémon protagonista, perché è bello e il tasto del replay
     * @param {object} s  il risultato di scegli()
     * @param {object} extra  giocatori: { id: { colore, avatar } }; gif(specie): l'immagine animata di un Pokémon
     */
    function html(s, { giocatori = {}, gif } = {}) {
        if (!s) return '';
        const sprite = (p, classe) => (gif && p.specie
            ? `<img class="${classe}${p.svenuto ? ' ms-ko' : ''}" src="${esc(gif(p.specie))}" alt="${esc(p.specie)}" title="${esc(p.specie)}${p.svenuto ? ' (fainted)' : ''}" loading="lazy" onerror="if(window.SpritePkm)SpritePkm.ritenta(this)">` : '');
        const lato = (k, n) => {
            const g = s.giocatori[k], extra = giocatori[g.id] || {};
            const vince = s.vincitore === k;
            const pagina = `public.html?player=${encodeURIComponent(g.nome)}`;
            const avatar = extra.avatar ? `<img class="ms-av" src="${esc(extra.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="ms-av ms-av-vuoto"></span>';
            return `<div class="ms-lato ms-l${n}${vince ? ' ms-vince' : ''}" style="--c:${coloreSicuro(extra.colore, COLORE_NEUTRO)}">`
                + `${vince ? '<span class="ms-win">WINNER</span>' : ''}`
                + `<a class="ms-av-link" href="${esc(pagina)}">${avatar}</a>`
                + `<div class="ms-testi"><a class="ms-nome-link" href="${esc(pagina)}"><b class="ms-nome">${esc(g.nome)}</b></a>`
                + `<span class="ms-team">${esc(g.team || 'Random teams')}</span>`
                + `<div class="ms-sprites">${s.lati[k].pokemon.map(p => sprite(p, 'ms-spr')).join('')}</div></div></div>`;
        };
        const prot = s.protagonista;
        const medaglione = prot && gif
            ? `<div class="ms-prot"><span class="ms-med" data-pkm="${esc(prot.specie)}"><img src="${esc(gif(prot.specie))}" alt="${esc(prot.specie)}" loading="lazy" onerror="if(window.SpritePkm)SpritePkm.ritenta(this)"></span>`
              + `<div class="ms-prot-testo"><b class="ms-banner">${esc(prot.specie)}</b><span class="ms-didascalia">${prot.ultimo ? 'Last one standing' : 'Top performer'}</span></div></div>`
            : '';
        const quando = dataBreve(s.data);
        return `<span class="ms-t">MATCH OF THE WEEK</span>`
            + `<div class="ms-scontro">${lato('p1', 1)}`
            + `<div class="ms-centro"><span class="ms-tag">${esc(s.categoria || 'Showdown')}</span><b class="ms-vs">VS</b>`
            + `<span class="ms-set">Set ${s.numeroSet} · Match ${s.numeroMatch}</span>${quando ? `<span class="ms-data">${esc(quando)}</span>` : ''}</div>`
            + `${lato('p2', 2)}</div>`
            + `<div class="ms-pie">${medaglione}<div class="ms-motivi">${s.motivi.map(m => `<span class="ms-chip">${esc(m)}</span>`).join('')}</div>`
            + `<a class="ms-replay" href="${esc(linkReplay(s))}">WATCH THE REPLAY</a></div>`;
    }

    return { GIORNI, analizzaSet, candidati, scegli, linkReplay, html, giornoDi };
});
