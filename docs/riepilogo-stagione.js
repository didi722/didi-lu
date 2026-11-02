// =====================================================
// RIEPILOGO DI FINE STAGIONE — Poké-Tournament
//
// Una stagione chiusa, aperta in matches.html, mostra questo riepilogo invece dell'elenco dei showdown (che resta a un tocco: "Calendar").
// Dentro: il vincitore e la classifica finale, i numeri della stagione, l'MVP, il miglior Pokémon di ogni formato, i premi (più KO, il muro, la
// rimonta...) e i Pokémon più usati. Tutto si calcola dai numeri che il sito ha già (Statistiche.calcola su QUELLA stagione): niente di nuovo da salvare.
//
// Due parti:
//   - calcola(dati) -> il riepilogo come dati: pura, niente DOM e niente Firebase (provata in test/riepilogo-stagione.test.js);
//   - html(riepilogo) / monta(...): come si vede nella pagina (sito e app).
//
// I PREMI sono gli stessi per tutti i tipi di stagione. Un premio compare solo se qualcuno lo merita davvero (un minimo di partite giocate e un valore
// sopra zero); a pari merito si premiano tutti, fino a tre. Quelli che parlano di Pokémon mancano nelle stagioni senza team (Randomize).
// Funziona nel browser (window.RiepilogoStagione) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./mvp.js'));
    else radice.RiepilogoStagione = fabbrica(radice.Mvp);
})(typeof self !== 'undefined' ? self : this, function (Mvp) {
    'use strict';

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = (c, vuoto) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : vuoto);
    const uno = n => Math.round(n * 10) / 10;

    // Il trofeo della stagione, per tipo (gli stessi PNG di tipo-stagione.js: TIPI[tipo].icona). Per la league (Sant'Alvise) è la coppa standard con i fiocchi blu e rosso
    // (season-winner-color.png), non quella che nel profilo si colora con il colore dell'allenatore (season-winner.png).
    const TROFEI = { league: 'immagini/season-winner-color.png', monoformat: 'immagini/coppa-monoformat.png', random: 'immagini/coppa-random.png', cup: 'immagini/coppa-cup.png' };
    const trofeoDi = info => {
        const t = idDi(info && info.tipo);
        const tipo = TROFEI[t] ? t : 'league';       // le prime stagioni non hanno tipo: sono league; la beta non dà trofei, ma qui ne serve uno
        return { tipo, icona: tipo === 'cup' && info && info.icona ? String(info.icona) : TROFEI[tipo] };
    };

    // Le immagini a tema Pokémon (strumenti) al posto delle emoji. Dove manca ancora l'immagine resta l'emoji.
    const IMG = 'immagini/riepilogo/';
    const IMMAGINI = {
        ko: { src: `${IMG}choice-band.webp` },
        muro: { src: `${IMG}assault-vest.png` },
        pulito: { src: `${IMG}focus-sash.png` },
        rimonta: { src: `${IMG}focus-band.png` },
        elo: { src: `${IMG}rare-candy.png` },
        sfortuna: { src: `${IMG}destiny-knot.png` },
        collezione: { src: `${IMG}poke-ball.png` },
        sorpresa: { src: `${IMG}scope-lens.png` }
    };
    const IMMAGINE_MVP = 'immagini/ribbon-mvp-gold.png';   // l'adesivo dell'MVP: il fiocco "Season MVP" dorato, qualunque sia il numero di MVP vinti da quel Pokémon
    const IMMAGINE_RISERVA = `${IMG}poke-ball.png`;         // se un'immagine non si carica

    // I colori dei tipi (gli stessi di dettagli.js e di tutto il sito): il medaglione di un Pokémon è sul colore del suo primo tipo, come nel Box
    const COLORI_TIPO = {
        normal: '#aaaa99', fire: '#ff4422', water: '#3399ff', electric: '#ffcc33', grass: '#77cc55', ice: '#66ccff',
        fighting: '#bb5544', poison: '#aa5599', ground: '#ddbb55', flying: '#8899ff', psychic: '#ff5599', bug: '#aabb22',
        rock: '#bbaa66', ghost: '#6666bb', dragon: '#7766ee', dark: '#775544', steel: '#aaaabb', fairy: '#ee99ee'
    };
    const nomePokeApi = specie => String(specie || '').toLowerCase().trim().replace(/ /g, '-').replace(/[.'é’%]/g, '').replace(/-?\*$/, '');

    const MIN_SET = 6;              // sotto questi set giocati non si premiano le medie (il muro...)
    const MAX_PARI = 3;             // a pari merito si premiano al più tanti allenatori

    /** Come nella classifica della pagina (risultati-match.js): punti, match vinti, set vinti, poi il nome */
    function confrontaClassifica(a, b) {
        return num(b.points) - num(a.points) || num(b.won) - num(a.won) || num(b.setW) - num(a.setW) || String(a.name || '').localeCompare(String(b.name || ''));
    }

    // -----------------------------------------------------
    // Dai match: chi ha perso di un solo set e la più grande sorpresa (vince chi aveva meno Elo)
    // -----------------------------------------------------
    function dagliShowdown(showdowns) {
        const persiPerUno = {};       // id -> match persi per un solo set (con almeno un set vinto)
        let sorpresa = null;          // { vincitore, perdente, scarto, formato, data, punteggio }
        for (const sd of valori(showdowns)) {
            const info = (sd && sd.info) || {};
            for (const m of valori(sd && sd.matches)) {
                const a = num(m.p1score), b = num(m.p2score);
                if (a === b || !m.player1Id || !m.player2Id) continue;
                const [vinc, perd, sv, sp] = a > b ? [m.player1Id, m.player2Id, a, b] : [m.player2Id, m.player1Id, b, a];
                if (sv - sp === 1 && sp >= 1) persiPerUno[idDi(perd)] = (persiPerUno[idDi(perd)] || 0) + 1;
                const eloV = num(a > b ? m.p1EloAtMatch : m.p2EloAtMatch), eloP = num(a > b ? m.p2EloAtMatch : m.p1EloAtMatch);
                const scarto = eloP - eloV;     // positivo: ha vinto chi aveva meno Elo
                if (eloV && eloP && scarto > 0 && (!sorpresa || scarto > sorpresa.scarto)) {
                    sorpresa = { vincitore: idDi(vinc), perdente: idDi(perd), scarto, formato: m.categoria || info.categoria || '', data: m.data || info.data || '', punteggio: `${sv}-${sp}` };
                }
            }
        }
        return { persiPerUno, sorpresa };
    }

    // -----------------------------------------------------
    // I premi
    // -----------------------------------------------------
    /**
     * Chi vince un premio: i migliori per `punto` (maggiore = meglio), a patto che `minimo(g)` sia vero e il valore superi `soglia`.
     * Restituisce { vincitori: [giocatori], valore } oppure null.
     */
    function migliori(giocatori, valoreDi, { piccolo = false, soglia = 0, vale = () => true } = {}) {
        const elenco = giocatori.filter(vale).map(g => ({ g, v: valoreDi(g) })).filter(x => Number.isFinite(x.v) && (piccolo ? true : x.v > soglia));
        if (!elenco.length) return null;
        const meglio = elenco.reduce((m, x) => (piccolo ? Math.min(m, x.v) : Math.max(m, x.v)), piccolo ? Infinity : -Infinity);
        const pari = elenco.filter(x => x.v === meglio).slice(0, MAX_PARI);
        return { vincitori: pari.map(x => x.g), valore: meglio };
    }

    function costruisciPremi(r, extra) {
        const g = r.players || [];
        const setConDati = x => num(x.ko && x.ko.setConDati);
        const defs = [
            { id: 'ko', icona: '💥', titolo: 'KO King', testo: 'Most KOs', calc: () => migliori(g, x => num(x.ko && x.ko.fatti)), valore: v => `${v} KOs` },
            { id: 'muro', icona: '🛡️', titolo: 'The Wall', testo: 'Fewest KOs taken per set',
              calc: () => migliori(g, x => uno(num(x.ko && x.ko.subiti) / Math.max(1, setConDati(x))), { piccolo: true, vale: x => setConDati(x) >= MIN_SET }),
              valore: v => `${v} per set` },
            { id: 'pulito', icona: '✨', titolo: 'Flawless', testo: 'Most sets won without losing a Pokémon', calc: () => migliori(g, x => num(x.ko && x.ko.setPerfetti)), valore: v => `${v} sets` },
            { id: 'rimonta', icona: '💪', titolo: 'Never Say Die', testo: 'Most sets won on the last Pokémon', calc: () => migliori(g, x => num(x.ko && x.ko.setAlLimite)), valore: v => `${v} sets` },
            { id: 'elo', icona: '📈', titolo: 'Elo Climber', testo: 'Biggest Elo gain', calc: () => migliori(g, x => num(x.eloDelta)), valore: v => `+${v} Elo` },
            { id: 'sfortuna', icona: '💔', titolo: 'Heartbreaker', testo: 'Most matches lost by a single set',
              calc: () => migliori(g, x => num(extra.persiPerUno[idDi(x.id)]), { soglia: 1 }), valore: v => `${v} matches` }
        ];
        // chi porta in campo più specie diverse: solo con i team
        if ((r.pokemon || []).length) {
            const specie = {};
            for (const m of r.pokemon) if (num(m.portato) > 0) (specie[idDi(m.player)] = specie[idDi(m.player)] || new Set()).add(m.specieId);
            defs.push({ id: 'collezione', icona: '🔎', titolo: 'Collector', testo: 'Most different Pokémon used', calc: () => migliori(g, x => (specie[idDi(x.id)] || new Set()).size), valore: v => `${v} species` });
        }
        const premi = [];
        for (const d of defs) {
            const esito = d.calc();
            if (esito) premi.push({ id: d.id, icona: d.icona, immagine: IMMAGINI[d.id] || null, titolo: d.titolo, descrizione: d.testo, vincitori: esito.vincitori.map(persona), valore: esito.valore, testoValore: d.valore(esito.valore) });
        }
        // la sorpresa: ha vinto chi aveva meno Elo (e di quanto)
        const s = extra.sorpresa;
        if (s && s.scarto >= 20) {
            const v = g.find(x => idDi(x.id) === s.vincitore), p = g.find(x => idDi(x.id) === s.perdente);
            if (v) premi.push({ id: 'sorpresa', icona: '⚡', immagine: IMMAGINI.sorpresa, titolo: 'Upset of the Season', descrizione: `Beat ${p ? p.nome : s.perdente} with ${s.scarto} less Elo`, vincitori: [persona(v)], valore: s.scarto, testoValore: `${s.punteggio}${s.formato ? ` · ${s.formato}` : ''}` });
        }
        return premi;
    }

    function persona(x) { return { id: x.id, nome: x.nome || x.id, colore: x.colore || '', avatar: x.avatar || '' }; }

    // -----------------------------------------------------
    // Il riepilogo
    // -----------------------------------------------------
    /**
     * @param {object} dati
     *   risultato  Statistiche.calcola(dati, { stagione }) della sola stagione
     *   info       seasons/{id}/info
     *   leaderboard seasons/{id}/leaderboard
     *   showdowns  seasons/{id}/showdowns
     *   mvp        seasons/{id}/mvp (voti e risultato)
     * @returns {object|null} null se non c'è niente da riassumere (nessun match)
     */
    function calcola(dati) {
        const r = (dati && dati.risultato) || {};
        const info = (dati && dati.info) || {};
        if (!r.totali || !num(r.totali.match)) return null;
        const giocatori = r.players || [];
        const colori = new Map(giocatori.map(x => [idDi(x.id), x]));

        const classifica = Object.entries((dati && dati.leaderboard) || {}).map(([name, v]) => ({ name, ...v })).sort(confrontaClassifica).map((v, i) => {
            const p = colori.get(idDi(v.name)) || {};
            return { posizione: i + 1, id: idDi(v.name), nome: p.nome || v.name, colore: p.colore || '', avatar: p.avatar || '', punti: num(v.points), vinti: num(v.won), persi: num(v.lost), sdVinti: num(v.sdWon), sdPersi: num(v.sdLost) };
        });
        // provvisorio: la stagione non è chiusa (anteprima con ?riepilogo=1): il "campione" è chi guida la classifica
        const provvisorio = !['closed', 'terminata'].includes(String(info.status || '').toLowerCase().trim());
        const idVincitore = (provvisorio ? '' : idDi(info.winner)) || (classifica[0] ? classifica[0].id : '');
        const base = classifica.find(x => x.id === idVincitore) || null;
        // i numeri del campione sono quelli della sua scheda in /stats (stessa fonte: Statistiche.calcola). Con la stagione scelta l'Elo è quello a FINE STAGIONE
        // (l'ultimo match della stagione: Elo prima + variazione), non il ranking di oggi; con meno di 3 showdown è unranked (N/A)
        const sc = base ? colori.get(base.id) : null;
        const vincitore = base && sc ? {
            ...base,
            stat: {
                elo: sc.classificato === false ? 0 : num(sc.elo), percMatch: sc.percMatch == null ? null : num(sc.percMatch),
                set: { vinti: num(sc.set && sc.set.vinti), persi: num(sc.set && sc.set.persi) },
                ko: { fatti: num(sc.ko && sc.ko.fatti), subiti: num(sc.ko && sc.ko.subiti) },
                serie: num(sc.serie && sc.serie.vittorieMax)
            }
        } : base;

        // MVP: il risultato dello spoglio, se c'è già; altrimenti, se ci sono voti, "si sta ancora votando"
        const mvpNodo = (dati && dati.mvp) || {};
        const mv = valori(mvpNodo.risultato && mvpNodo.risultato.vincitori).filter(Boolean)[0] || null;
        const proprietario = mv ? colori.get(idDi(mv.player)) : null;       // di chi è il Pokémon: il suo nome e il suo colore
        const mvp = mv ? { specie: String(mv.specie || ''), team: String(mv.team || ''), player: String((proprietario && proprietario.nome) || mv.player || ''), colore: (proprietario && proprietario.colore) || '', voti: num(mv.voti) } : null;
        const mvpInCorso = !mvp && !!mvpNodo.voti;

        const formati = [];
        const nomiFormati = Array.isArray(info.selected_formats) && info.selected_formats.length ? info.selected_formats : (r.formati || []);
        for (const f of nomiFormati) {
            const top = Mvp && Mvp.classifica ? Mvp.classifica((r.pokemon || []).filter(m => m.formato === f), 1)[0] : null;
            if (top) formati.push({ formato: f, specie: top.specie, team: top.team, player: top.playerNome || top.player, colore: top.colore || '', koFatti: num(top.ko), set: num(top.presenze) });
        }

        const usate = {};
        for (const m of r.pokemon || []) if (num(m.portato) > 0) { const k = m.specieId; usate[k] = usate[k] || { specie: m.specie, set: 0 }; usate[k].set += num(m.portato); }
        const piuUsati = Object.values(usate).sort((a, b) => b.set - a.set || a.specie.localeCompare(b.specie)).slice(0, 3);

        const date = valori(dati.showdowns).map(sd => String((sd && sd.info && sd.info.data) || '')).filter(Boolean).sort();
        const koTotali = giocatori.reduce((s, x) => s + num(x.ko && x.ko.fatti), 0);

        return {
            id: String(info.id || ''), nome: String(info.name || info.nome || r.stagioni && r.stagioni[0] && r.stagioni[0].nome || 'Season'),
            formati: nomiFormati, dal: date[0] || '', al: date[date.length - 1] || '',
            numeri: { showdown: num(r.totali.showdown), match: num(r.totali.match), set: num(r.totali.set), ko: koTotali, giocatori: classifica.length || giocatori.length },
            provvisorio, trofeo: trofeoDi(info), vincitore, classifica, mvp, mvpInCorso, formatiMigliori: formati,
            premi: costruisciPremi(r, dagliShowdown(dati.showdowns)), piuUsati
        };
    }

    /** Il riepilogo come testo da condividere in una chat */
    function testo(riep) {
        if (!riep) return '';
        const righe = [`🏁 ${riep.nome} — season recap`];
        if (riep.vincitore) righe.push(`${riep.provvisorio ? '🥇 Leader' : '🏆 Champion'}: ${riep.vincitore.nome} (${riep.vincitore.punti} pts)`);
        riep.classifica.slice(0, 3).forEach(c => righe.push(`${['🥇', '🥈', '🥉'][c.posizione - 1]} ${c.nome} — ${c.punti} pts (${c.vinti}-${c.persi})`));
        if (riep.mvp) righe.push(`⭐ MVP: ${riep.mvp.specie} (${riep.mvp.player})`);
        riep.premi.forEach(p => righe.push(`${p.icona} ${p.titolo}: ${p.vincitori.map(v => v.nome).join(', ')} — ${p.testoValore}`));
        righe.push(`${riep.numeri.match} matches · ${riep.numeri.set} sets · ${riep.numeri.ko} KOs`);
        return righe.join('\n');
    }

    // -----------------------------------------------------
    // Come si vede: una pagina a BLOCCHI (griglia a 12 colonne, blocchi affiancati e di misure diverse), nello stile del sito: bordi neri, ombre piene, colori
    // degli allenatori, etichette che sporgono dall'angolo. Colori, ombre, angoli, rotazioni e caratteri seguono il tema scelto da ciascuno (temi.css: --nb-*);
    // nell'app le misure seguono --u (riepilogo-stagione.css). Niente giallo: gli accenti sono il nero e il colore dell'allenatore.
    //   hero (12)            nome della stagione, trofeo, formati, numeri di tutta la lega, tasto per condividere
    //   campione (8) | MVP (4)
    //   classifica (5) | colonna (7): migliori di ogni formato + Pokémon più usati
    //   premi (12)           un riquadro per premio, sul colore di chi lo ha vinto
    // -----------------------------------------------------
    const dataBreve = iso => { const p = String(iso || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : ''; };
    const linkGiocatore = nome => `public.html?player=${encodeURIComponent(String(nome || '').trim())}`;
    const COLORE_NEUTRO = '#d9dde6';

    /** L'etichetta che sporge dall'angolo di un blocco, con (se c'è) la sua immagine davanti al testo */
    const etichetta = (testo, icona = '') => `<span class="rs-t">${icona ? `<img class="rs-t-img" src="${esc(icona)}" alt="" decoding="async" onerror="this.onerror=null;this.src='${IMMAGINE_RISERVA}'">` : ''}${esc(testo)}</span>`;

    const avatarImg = (p, classe) => (p.avatar
        ? `<img class="${classe}" src="${esc(p.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
        : `<span class="${classe} rs-av-vuoto"></span>`);

    /** Un allenatore: avatar e nome, link alla sua pagina */
    const htmlPersona = p => `<a class="rs-persona" href="${esc(linkGiocatore(p.nome))}" style="--c:${coloreSicuro(p.colore, COLORE_NEUTRO)}">${avatarImg(p, 'rs-av')}<span class="rs-nome">${esc(p.nome)}</span></a>`;

    /** Il medaglione di un Pokémon, come nel Box: lo sprite su un disco a mezzatinta del colore del suo tipo (che arriva appena PokeAPI risponde: monta()) */
    const medaglione = (specie, gif, classe) => (gif && specie
        ? `<span class="rs-med ${classe}" data-pkm="${esc(specie)}"><img src="${esc(gif(specie))}" alt="${esc(specie)}" loading="lazy" onerror="if(window.SpritePkm)SpritePkm.ritenta(this)"></span>` : '');

    /** Una riga della classifica finale: la stessa di quella a lato (le classi .cl-*, classifica.css) */
    function htmlRiga(c) {
        const avatar = c.avatar ? `<img src="${esc(c.avatar)}" class="cl-avatar" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="cl-avatar cl-avatar-vuoto" aria-hidden="true"></span>';
        return `<a class="cl-riga${c.posizione === 1 ? ' cl-primo' : ''}" href="${esc(linkGiocatore(c.nome))}" style="--cl-colore:${coloreSicuro(c.colore, '#31c489')}">`
            + `<span class="cl-pos">#${c.posizione}</span>${avatar}<span class="cl-testi"><span class="cl-nome">${esc(c.nome)}</span>`
            + `<span class="cl-dati">SD ${c.sdVinti}-${c.sdPersi} · MATCH ${c.vinti}-${c.persi}</span></span><span class="cl-punti">${c.punti}</span></a>`;
    }

    /** L'icona di un premio: l'immagine se c'è (con la palla di riserva se non si carica), altrimenti l'emoji */
    function htmlIconaPremio(p) {
        if (!p.immagine) return `<span class="rs-icona-emoji">${esc(p.icona)}</span>`;
        return `<img src="${esc(p.immagine.src)}" alt="" decoding="async" onerror="this.onerror=null;this.src='${IMMAGINE_RISERVA}'">`;
    }

    /** Il trofeo della stagione: il PNG del suo tipo (la league ha la coppa standard con i fiocchi blu e rosso) */
    function htmlTrofeo(riep) {
        const t = riep.trofeo || { tipo: 'league', icona: TROFEI.league };
        return `<span class="rs-trofeo" aria-hidden="true"><img src="${esc(t.icona)}" alt="" decoding="async" onerror="this.onerror=null;this.src='${TROFEI.league}'"></span>`;
    }

    const vp = (v, p) => `<span class="rs-wl"><b class="v">${v}</b><i>–</i><b class="p">${p}</b></span>`;
    const dato = (et, val, extra = '') => `<div class="rs-dato"><span class="rs-dato-et">${et}</span><span class="rs-dato-va">${val}</span>${extra}</div>`;

    /** Il riepilogo come HTML (tutto il testo che viene dal database è protetto). `gif(specie)` dà l'immagine animata di un Pokémon. */
    function html(riep, { gif } = {}) {
        if (!riep) return '<p class="rs-vuoto">No recap available for this season.</p>';
        const v = riep.vincitore, st = v && v.stat;
        const colore = coloreSicuro(v && v.colore, COLORE_NEUTRO);
        const periodo = riep.dal ? `${dataBreve(riep.dal)}${riep.al && riep.al !== riep.dal ? ` → ${dataBreve(riep.al)}` : ''}` : '';
        const n = riep.numeri;

        // ---- l'apertura: solo i numeri di tutta la stagione, a blocchetti (il nome della stagione è già nell'intestazione della pagina), e il tasto per condividere
        const hero = `<section class="rs-stagione rs-s12" style="--c:${colore}">${etichetta(riep.provvisorio ? 'SEASON STATS · PREVIEW' : 'SEASON STATS')}`
            + `<div class="rs-lega" aria-label="Whole league">${[['Showdowns', n.showdown], ['Matches', n.match], ['Sets', n.set], ['KOs', n.ko]]
                .map(([e, x]) => `<div class="rs-lega-voce"><b>${x}</b><span>${e}</span></div>`).join('')}</div>`
            + '<button type="button" class="rs-condividi" data-azione="condividi">SHARE RECAP</button></section>';

        // ---- il campione: i numeri della sua scheda in /stats
        const diff = st ? st.ko.fatti - st.ko.subiti : 0;
        const dati = [dato('Points', v ? v.punti : 0)];
        if (v) {
            if (st) dati.push(dato('Final Elo', st.elo || 'N/A'));
            dati.push(dato('Showdowns', vp(v.sdVinti, v.sdPersi)), dato('Matches', vp(v.vinti, v.persi)));
            if (st) {
                dati.push(dato('Sets', vp(st.set.vinti, st.set.persi)),
                    dato('Win %', st.percMatch == null ? 'N/A' : `${st.percMatch}%`, st.percMatch == null ? '' : `<span class="rs-barra"><span style="width:${Math.max(0, Math.min(100, st.percMatch))}%"></span></span>`),
                    dato('Best streak', st.serie),
                    dato('KOs', vp(st.ko.fatti, st.ko.subiti), `<small class="rs-sub ${diff >= 0 ? 'v' : 'p'}">${diff > 0 ? '+' : ''}${diff}</small>`));
            }
        }
        const campione = v
            ? `<section class="rs-b rs-campione ${riep.mvp || riep.mvpInCorso ? 'rs-s8' : 'rs-s12'}" style="--c:${colore}">${etichetta(riep.provvisorio ? 'CURRENT LEADER' : 'CHAMPION')}`
              + `<div class="rs-campione-testa">${avatarImg(v, 'rs-av-grande')}<div class="rs-campione-id"><a class="rs-campione-nome" href="${esc(linkGiocatore(v.nome))}">${esc(v.nome)}</a>`
              + `<span class="rs-campione-sotto">${v.punti} pts · #${v.posizione} of ${riep.classifica.length}</span></div>${htmlTrofeo(riep)}</div><div class="rs-dati">${dati.join('')}</div></section>`
            : '';

        // ---- l'MVP
        const mvp = riep.mvp
            ? `<section class="rs-b rs-mvp rs-s4" style="--c:${coloreSicuro(riep.mvp.colore, COLORE_NEUTRO)}">${etichetta('SEASON MVP')}<img class="rs-sticker" src="${IMMAGINE_MVP}" alt="" decoding="async">`
              + `<div class="rs-mvp-scena">${medaglione(riep.mvp.specie, gif, 'rs-med-grande')}</div><b class="rs-banner">${esc(riep.mvp.specie)}</b>`
              + `<span class="rs-mvp-sotto">${esc(riep.mvp.team)} · ${esc(riep.mvp.player)}</span><span class="rs-voti">${riep.mvp.voti} vote${riep.mvp.voti === 1 ? '' : 's'}</span></section>`
            : riep.mvpInCorso
                ? `<section class="rs-b rs-mvp rs-mvp-attesa rs-s4">${etichetta('SEASON MVP')}<img class="rs-sticker rs-sticker-grande" src="${IMMAGINE_MVP}" alt="" decoding="async"><p class="rs-nota">The votes are still being counted.</p></section>`
                : '';

        // ---- la classifica finale
        const haColonna = riep.formatiMigliori.length || riep.piuUsati.length;
        const classifica = riep.classifica.length
            ? `<section class="rs-b rs-classifica ${haColonna ? 'rs-s5' : 'rs-s12'}">${etichetta('FINAL STANDINGS')}<div class="rs-righe">${riep.classifica.map(htmlRiga).join('')}</div></section>`
            : '';

        // ---- a fianco della classifica: il miglior Pokémon di ogni formato e i più usati
        const formati = riep.formatiMigliori.length
            ? `<section class="rs-b rs-formati">${etichetta('BEST OF EACH FORMAT')}<div class="rs-formati-lista">${riep.formatiMigliori.map(f =>
                `<div class="rs-fcard" style="--c:${coloreSicuro(f.colore, COLORE_NEUTRO)}"><span class="rs-tag-nero">${esc(f.formato)}</span>${medaglione(f.specie, gif, 'rs-med-medio')}`
                + `<b class="rs-banner rs-banner-piccolo">${esc(f.specie)}</b><span>${esc(f.player)} · ${f.koFatti} KOs</span></div>`).join('')}</div></section>`
            : '';
        const massimo = Math.max(1, ...riep.piuUsati.map(u => u.set));
        const usati = riep.piuUsati.length
            ? `<section class="rs-b rs-usati">${etichetta('MOST USED POKÉMON')}<div class="rs-usati-lista">${riep.piuUsati.map((u, i) =>
                `<div class="rs-uso"><span class="rs-pos">#${i + 1}</span>${medaglione(u.specie, gif, 'rs-med-piccolo')}<div class="rs-uso-testo"><b>${esc(u.specie)}</b>`
                + `<span class="rs-barra"><span style="width:${Math.round(100 * u.set / massimo)}%"></span></span></div><i>${u.set} sets</i></div>`).join('')}</div></section>`
            : '';
        const colonna = haColonna ? `<div class="rs-colonna rs-s7">${formati}${usati}</div>` : '';

        // ---- i premi: un riquadro ciascuno, sul colore di chi lo ha vinto
        const premi = riep.premi.length
            ? `<section class="rs-b rs-premi rs-s12">${etichetta('AWARDS')}<div class="rs-premi-lista">${riep.premi.map(p =>
                `<article class="rs-premio" style="--c:${coloreSicuro(p.vincitori[0] && p.vincitori[0].colore, COLORE_NEUTRO)}"><div class="rs-premio-testa"><span class="rs-icona" aria-hidden="true">${htmlIconaPremio(p)}</span>`
                + `<div><b>${esc(p.titolo)}</b><small>${esc(p.descrizione)}</small></div></div>`
                + `<div class="rs-premio-pie"><div class="rs-premio-chi"><div class="rs-vincitori">${p.vincitori.map(x => `<a class="rs-nome-tag" href="${esc(linkGiocatore(x.nome))}">${esc(x.nome)}</a>`).join('')}</div>`
                + `<span class="rs-valore">${esc(p.testoValore)}</span></div><div class="rs-avatar-premio">${p.vincitori.map(x => avatarImg(x, 'rs-av-premio')).join('')}</div></div></article>`).join('')}</div></section>`
            : '';

        return `<div class="rs">${hero}${campione}${mvp}${classifica}${colonna}${premi}</div>`;
    }

    // -----------------------------------------------------
    // La card da condividere: un'immagine (1080x1350) disegnata sul canvas, nello stile del sito (carta chiara, striscia nera, righe colorate)
    // -----------------------------------------------------
    const CARD = { W: 1080, H: 1350 };

    /** Carica un'immagine senza sporcare il canvas: se il server non dà il permesso (CORS) o non risponde, si salta e basta */
    function caricaImmagine(win, src) {
        return new Promise(ok => {
            if (!src || !win.Image) return ok(null);
            const img = new win.Image();
            img.crossOrigin = 'anonymous';
            const t = win.setTimeout(() => ok(null), 5000);
            img.onload = () => { win.clearTimeout(t); ok(img); };
            img.onerror = () => { win.clearTimeout(t); ok(null); };
            img.src = src;
        });
    }

    /**
     * Disegna la card. `gif(specie)` dà l'immagine del Pokémon (l'MVP). Restituisce il canvas.
     * Lo stile è quello del tema classico: la card è la stessa per tutti, così le immagini che girano in chat si riconoscono.
     */
    async function disegnaCard(win, riep, { gif } = {}) {
        const doc = win.document;
        const { W, H } = CARD;
        const canvas = doc.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const c = canvas.getContext('2d');
        try { await Promise.all([doc.fonts.load('900 40px "Josefin Sans"'), doc.fonts.load('700 28px "Montserrat"')]); } catch (e) { /* si usano i caratteri di riserva */ }
        const FT = '"Josefin Sans", "Arial Black", Arial, sans-serif', FX = '"Montserrat", Arial, sans-serif';
        const INK = '#000', CARTA = '#ffffff', SFONDO = '#e6e9ef', NEUTRO = '#d9dde6';       // niente giallo: la card è bianca, nera e dei colori degli allenatori

        const trofeo = riep.trofeo || { tipo: 'league', icona: TROFEI.league };
        const mostrati = riep.premi.slice(0, 8);
        const [avatarCampione, avatarClassifica, spriteMvp, imgTrofeo, immaginiPremi, ballMvp] = await Promise.all([
            caricaImmagine(win, riep.vincitore && riep.vincitore.avatar),
            Promise.all(riep.classifica.slice(0, 5).map(x => caricaImmagine(win, x.avatar))),
            caricaImmagine(win, riep.mvp && gif ? gif(riep.mvp.specie) : ''),
            caricaImmagine(win, trofeo.icona),
            Promise.all(mostrati.map(p => caricaImmagine(win, p.immagine && p.immagine.src))),
            caricaImmagine(win, riep.mvp ? IMMAGINE_MVP : '')
        ]);

        const testoFit = (t, x, y, maxW, px, peso, famiglia, colore, allinea = 'left') => {
            let d = px;
            c.font = `${peso} ${d}px ${famiglia}`;
            while (c.measureText(t).width > maxW && d > 12) { d -= 1; c.font = `${peso} ${d}px ${famiglia}`; }
            c.fillStyle = colore; c.textAlign = allinea; c.textBaseline = 'alphabetic';
            c.fillText(t, x, y);
        };
        const riquadro = (x, y, w, h, riempi, bordo = 6, ombra = 0) => {
            if (ombra) { c.fillStyle = INK; c.fillRect(x + ombra, y + ombra, w, h); }
            c.fillStyle = riempi; c.fillRect(x, y, w, h);
            c.lineWidth = bordo; c.strokeStyle = INK; c.strokeRect(x + bordo / 2, y + bordo / 2, w - bordo, h - bordo);
        };
        const tondo = (img, cx, cy, r, vuoto) => {
            c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.closePath(); c.fillStyle = vuoto || '#ddd'; c.fill();
            if (img) { c.clip(); c.drawImage(img, cx - r, cy - r, r * 2, r * 2); }
            c.restore(); c.lineWidth = 5; c.strokeStyle = INK; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
        };

        // sfondo e carta
        c.fillStyle = SFONDO; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(0,0,0,.07)';
        for (let y = 8; y < H; y += 24) for (let x = 8; x < W; x += 24) { c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
        const X = 40, L = W - 80;
        riquadro(X, 36, L, H - 90, CARTA, 10, 14);
        // il trofeo della stagione dentro un'area quadrata (il PNG del tipo di stagione)
        const disegnaTrofeo = (x, y, lato) => {
            if (!imgTrofeo) return false;
            const k = Math.min(lato / imgTrofeo.width, lato / imgTrofeo.height);
            c.drawImage(imgTrofeo, x + (lato - imgTrofeo.width * k) / 2, y + (lato - imgTrofeo.height * k) / 2, imgTrofeo.width * k, imgTrofeo.height * k);
            return true;
        };

        // striscia nera con i tre pallini
        c.fillStyle = INK; c.fillRect(X + 5, 41, L - 10, 70);
        [['#ff5f57', 50], ['#febc2e', 90], ['#28c840', 130]].forEach(([col, dx]) => { c.fillStyle = col; c.beginPath(); c.arc(X + dx, 76, 13, 0, Math.PI * 2); c.fill(); });
        testoFit(riep.provvisorio ? 'SEASON RECAP · PREVIEW' : 'SEASON RECAP', X + 175, 90, L - 200, 34, 800, FT, '#fff');

        // titolo
        testoFit(String(riep.nome).toUpperCase(), X + 40, 190, L - 80, 74, 900, FT, INK);
        const periodo = riep.dal ? `${dataBreve(riep.dal)}${riep.al && riep.al !== riep.dal ? ` → ${dataBreve(riep.al)}` : ''}` : '';
        testoFit(`${riep.formati.join(' · ')}${periodo ? ` · ${periodo}` : ''}`, X + 40, 232, L - 80, 26, 700, FX, 'rgba(0,0,0,.7)');

        // campione
        let y = 262;
        if (riep.vincitore) {
            const v = riep.vincitore;
            riquadro(X + 30, y, L - 60, 150, coloreSicuro(v.colore, NEUTRO), 7, 8);
            if (!disegnaTrofeo(X + 46, y + 20, 110)) { c.font = '84px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = INK; c.fillText('🏆', X + 56, y + 98); }
            tondo(avatarCampione, X + 238, y + 75, 56, '#fff');
            c.fillStyle = INK; c.fillRect(X + 326, y + 18, 214, 34);
            testoFit(riep.provvisorio ? 'CURRENT LEADER' : 'CHAMPION', X + 338, y + 44, 190, 23, 900, FT, '#fff');
            testoFit(String(v.nome).toUpperCase(), X + 326, y + 100, L - 60 - 310, 54, 900, FT, INK);
            testoFit(`${v.punti} pts · ${v.vinti}W ${v.persi}L · SD ${v.sdVinti}-${v.sdPersi}${v.stat ? ` · ${v.stat.percMatch == null ? '' : `${v.stat.percMatch}% · `}Elo ${v.stat.elo || 'N/A'}` : ''}`, X + 326, y + 132, L - 60 - 310, 23, 700, FX, 'rgba(0,0,0,.75)');
            y += 150 + 24;
        }

        // classifica (le prime cinque)
        riep.classifica.slice(0, 5).forEach((r, i) => {
            const ry = y + i * 68;
            riquadro(X + 30, ry, L - 60, 60, coloreSicuro(r.colore, '#8a8a8a'), 5, 5);
            c.fillStyle = INK; c.fillRect(X + 44, ry + 12, 62, 36);
            testoFit(`#${r.posizione}`, X + 75, ry + 39, 56, 26, 900, FT, '#fff', 'center');
            tondo(avatarClassifica[i], X + 150, ry + 30, 22, '#fff');
            testoFit(String(r.nome).toUpperCase(), X + 192, ry + 39, 430, 30, 900, FT, INK);
            testoFit(`${r.vinti}W ${r.persi}L`, X + 790, ry + 39, 130, 24, 800, FX, INK, 'right');
            riquadro(X + 810, ry + 6, 120, 48, '#fff', 4);
            testoFit(String(r.punti), X + 870, ry + 43, 100, 30, 900, FT, INK, 'center');
        });
        y += Math.min(5, riep.classifica.length) * 68 + 14;

        // MVP
        if (riep.mvp) {
            riquadro(X + 30, y, L - 60, 116, '#fff', 6, 6);
            if (spriteMvp) { const k = Math.min(110 / spriteMvp.width, 110 / spriteMvp.height, 3); c.drawImage(spriteMvp, X + 70, y + 58 - spriteMvp.height * k / 2, spriteMvp.width * k, spriteMvp.height * k); }
            const dx = ballMvp ? 40 : 0;       // la palla davanti all'etichetta
            if (ballMvp) c.drawImage(ballMvp, X + 190, y + 10, 36, 36);
            c.fillStyle = INK; c.fillRect(X + 190 + dx, y + 14, 150, 30);
            testoFit('SEASON MVP', X + 202 + dx, y + 37, 130, 20, 900, FT, '#fff');
            testoFit(String(riep.mvp.specie).toUpperCase(), X + 190, y + 80, L - 60 - 180, 40, 900, FT, INK);
            testoFit(`${riep.mvp.team} · ${riep.mvp.player} · ${riep.mvp.voti} vote${riep.mvp.voti === 1 ? '' : 's'}`, X + 190, y + 106, L - 60 - 180, 20, 700, FX, 'rgba(0,0,0,.7)');
            y += 116 + 20;
        }

        // premi (i primi sei che ci stanno)
        const spazio = (H - 54 - 56) - y;      // fino al piede della carta (resta posto per la riga dei numeri)
        const righe = Math.max(0, Math.min(4, Math.floor(spazio / 94)));
        mostrati.slice(0, righe * 2).forEach((p, i) => {
            const px = X + 30 + (i % 2) * ((L - 60) / 2 + 8), py = y + Math.floor(i / 2) * 94;
            const pw = (L - 60) / 2 - 8;
            riquadro(px, py, pw, 84, '#fff', 5, 5);
            const im = immaginiPremi[i];
            if (im) {
                // piccola (24 px): ingrandita di un numero intero e senza sfumare; le altre rimpicciolite normalmente
                const piccola = im.width <= 32;
                const lato = piccola ? im.width * Math.max(1, Math.round(48 / im.width)) : 52;
                const k = Math.min(lato / im.width, lato / im.height);
                c.save(); if (piccola) c.imageSmoothingEnabled = false;
                c.drawImage(im, px + 14 + (52 - im.width * k) / 2, py + 14 + (52 - im.height * k) / 2, im.width * k, im.height * k);
                c.restore();
            } else { c.font = '44px sans-serif'; c.textAlign = 'left'; c.fillStyle = INK; c.fillText(p.icona, px + 14, py + 56); }
            testoFit(p.titolo.toUpperCase(), px + 76, py + 30, pw - 92, 23, 900, FT, INK);
            testoFit(p.vincitori.map(v => v.nome).join(', '), px + 76, py + 57, pw - 92, 23, 800, FX, INK);
            testoFit(p.testoValore, px + 76, py + 77, pw - 92, 17, 700, FX, 'rgba(0,0,0,.65)');
        });

        testoFit(`${riep.numeri.match} matches · ${riep.numeri.set} sets · ${riep.numeri.ko} KOs`, W / 2, H - 76, L - 60, 22, 800, FX, 'rgba(0,0,0,.6)', 'center');
        return canvas;
    }

    // -----------------------------------------------------
    // Nella pagina: il riepilogo e, sul sito, i due tasti "SEASON RECAP | CALENDAR"
    // (nell'app la scelta è nei tag in alto: app-matches.js)
    // -----------------------------------------------------
    /** La finestra con l'immagine pronta: da lì si condivide (se il telefono lo permette) o si salva */
    function mostraAnteprima(win, blob, testoCondivisione) {
        const doc = win.document;
        const url = win.URL.createObjectURL(blob);
        const file = typeof win.File === 'function' ? new win.File([blob], 'season-recap.png', { type: 'image/png' }) : null;
        const nav = win.navigator || {};
        const puoCondividere = !!(file && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) && typeof nav.share === 'function');
        const velo = doc.createElement('div');
        velo.className = 'rs-velo';
        velo.setAttribute('role', 'dialog');
        velo.setAttribute('aria-modal', 'true');
        velo.innerHTML = `<div class="rs-dialogo"><img src="${url}" alt="Season recap card"><div class="rs-dialogo-azioni">`
            + `${puoCondividere ? '<button type="button" data-fai="condividi">SHARE</button>' : ''}<a class="rs-salva" href="${url}" download="season-recap.png">SAVE IMAGE</a>`
            + '<button type="button" data-fai="chiudi">CLOSE</button></div></div>';
        const chiudi = () => { velo.remove(); win.URL.revokeObjectURL(url); doc.removeEventListener('keydown', tasto); };
        const tasto = e => { if (e.key === 'Escape') chiudi(); };
        velo.addEventListener('click', async e => {
            if (e.target === velo) return chiudi();
            const b = e.target.closest ? e.target.closest('[data-fai]') : null;
            if (!b) return;
            if (b.dataset.fai === 'chiudi') return chiudi();
            try { await nav.share({ files: [file], title: 'Season recap', text: testoCondivisione }); } catch (err) { /* annullato */ }
        });
        doc.addEventListener('keydown', tasto);
        doc.body.appendChild(velo);
        return velo;
    }

    const cacheTipo = new Map();      // specie -> promessa del colore del suo primo tipo (o null)
    function colorePerSpecie(win, specie) {
        const k = nomePokeApi(specie);
        if (!k || typeof win.fetch !== 'function') return Promise.resolve(null);
        if (!cacheTipo.has(k)) {
            cacheTipo.set(k, win.fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(k)}`)
                .then(r => (r.ok ? r.json() : null))
                .then(j => (j && j.types && j.types[0] ? COLORI_TIPO[j.types[0].type.name] || null : null))
                .catch(() => null));
        }
        return cacheTipo.get(k);
    }
    /** Ogni medaglione prende il colore del tipo del suo Pokémon (finché non arriva resta grigio) */
    function coloraMedaglioni(win, radice) {
        radice.querySelectorAll('[data-pkm]').forEach(el => {
            colorePerSpecie(win, el.getAttribute('data-pkm')).then(c => { if (c && el.isConnected) el.style.setProperty('--tipo', c); });
        });
    }

    /**
     * Disegna il riepilogo nella colonna dei match (sopra l'elenco). Si può richiamare: aggiorna senza cambiare la vista scelta.
     * @returns {HTMLElement|null}
     */
    function monta(win, riep, { gif, vistaIniziale = 'riepilogo' } = {}) {
        const doc = win.document;
        const colonna = doc && doc.querySelector('.hub-left-column');
        const elenco = doc && doc.getElementById('matchList');
        if (!colonna || !elenco || !riep) return null;
        let corpo = doc.getElementById('riepilogoStagione');
        if (!corpo) {
            corpo = doc.createElement('div');
            corpo.id = 'riepilogoStagione';
            const scelta = doc.createElement('div');
            scelta.id = 'riepilogoScelta';
            scelta.className = 'rs-scelta';
            scelta.setAttribute('role', 'tablist');
            scelta.innerHTML = '<button type="button" role="tab" data-vista="riepilogo">SEASON RECAP</button><button type="button" role="tab" data-vista="calendario">CALENDAR</button>';
            elenco.parentNode.insertBefore(scelta, elenco);
            elenco.parentNode.insertBefore(corpo, elenco);
            const layout = colonna.parentNode;
            const sito = !doc.documentElement.classList.contains('app-shell');
            const vai = v => {
                colonna.setAttribute('data-vista', v);
                // sul sito, con il riepilogo (che ha già la classifica finale) la classifica a lato non serve: la colonna dei match prende tutta la larghezza
                if (sito && layout && layout.classList) layout.classList.toggle('rs-solo-riepilogo', v === 'riepilogo');
                // e in alto non servono "Registered teams" e "Vote MVP" (i team e l'MVP sono nel riepilogo)
                if (sito && doc.body) doc.body.classList.toggle('rs-vista-riepilogo', v === 'riepilogo');
                scelta.querySelectorAll('button').forEach(b => { const su = b.dataset.vista === v; b.classList.toggle('su', su); b.setAttribute('aria-selected', String(su)); });
            };
            scelta.addEventListener('click', e => { const b = e.target.closest ? e.target.closest('button[data-vista]') : null; if (b) vai(b.dataset.vista); });
            corpo.addEventListener('click', async e => {
                const b = e.target.closest ? e.target.closest('[data-azione="condividi"]') : null;
                if (!b) return;
                const prima = b.textContent;
                b.disabled = true; b.textContent = 'CREATING…';
                try {
                    const canvas = await disegnaCard(win, corpo._riepilogo, { gif: corpo._gif });
                    const blob = await new Promise((ok, no) => canvas.toBlob(x => (x ? ok(x) : no(new Error('immagine non creata'))), 'image/png'));
                    mostraAnteprima(win, blob, testo(corpo._riepilogo));
                } catch (err) {
                    // l'immagine non si è potuta fare: si condivide il testo
                    const t = testo(corpo._riepilogo);
                    try { if (win.navigator && typeof win.navigator.share === 'function') await win.navigator.share({ title: 'Season recap', text: t }); else if (win.navigator && win.navigator.clipboard) await win.navigator.clipboard.writeText(t); } catch (e2) { /* niente */ }
                }
                b.disabled = false; b.textContent = prima;
            });
            vai(vistaIniziale);
        }
        corpo._riepilogo = riep;
        corpo._gif = gif;
        corpo.innerHTML = html(riep, { gif });
        coloraMedaglioni(win, corpo);
        return corpo;
    }

    return { calcola, html, testo, monta, nomePokeApi, COLORI_TIPO, disegnaCard, mostraAnteprima, confrontaClassifica, CARD };
});
