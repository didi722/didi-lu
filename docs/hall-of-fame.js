// =====================================================
// HALL OF FAME — Poké-Tournament
//
// Le sezioni della Hall of Fame (la pagina che prima si chiamava Archive) oltre alle stagioni giocate:
//   RECORDS               i primati di sempre di allenatori, team e Pokémon (serie di vittorie, Elo massimo, KO, % di vittorie...), con il podio
//   MVP & DREAM TEAMS     per ogni stagione chiusa: il Pokémon MVP e la squadra ideale
//   MATCH OF THE WEEK     l'archivio dei set scelti ogni settimana, col replay a un tocco
//
//   HallOfFame.records(risultato)                 [{ id, gruppo, titolo, nota, voci: [{ nome, sotto, valore, specie, colore, link }] }]  (risultato = Statistiche.calcola(dati, { stagione: 'all' }))
//   HallOfFame.stagioni(dati, { Statistiche, Mvp })   [{ stagione, nome, data, mvp: [...], dream: [...] }] (le chiuse, la più recente prima)
//   HallOfFame.settimane(elenco, MatchSettimana)  l'archivio dei Match of the week, dal più recente
//   HallOfFame.htmlRecords / htmlStagioni / htmlSettimane(...)   il markup (testo sempre protetto)
//
// Funzioni pure: niente DOM, niente Firebase. Si provano in Node (test/hall-of-fame.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.HallOfFame = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PODIO = 3;
    const MIN_MATCH_ALLENATORE = 10;   // match giocati per entrare nella classifica delle % di vittorie
    const MIN_MATCH_TEAM = 5;
    const MIN_SET_POKEMON = 8;         // set portati per la media dei KO

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = (c, vuoto) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : vuoto);
    const dataIt = iso => { const p = String(iso || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso || ''); };
    const pagina = nome => `public.html?player=${encodeURIComponent(nome)}`;

    // ---------------------------------------------------------------- i record
    // Ogni record: da quale elenco (players | teams | pokemon), che numero conta (più alto = meglio), chi può entrare e come si scrive.
    const DEFINIZIONI = [
        { id: 'serie-allenatore', gruppo: 'Trainers', titolo: 'Longest winning streak', nota: 'Matches won in a row', da: 'players', val: x => num(x.serie && x.serie.vittorieMax), testo: v => `${v} in a row`, quando: x => x.serie && x.serie.vittorieMaxData },
        { id: 'pulita-allenatore', gruppo: 'Trainers', titolo: 'Longest clean streak', nota: 'Matches won without losing a set, in a row', da: 'players', val: x => num(x.serie && x.serie.pulitaMax), testo: v => `${v} in a row`, quando: x => x.serie && x.serie.pulitaMaxData },
        { id: 'elo', gruppo: 'Trainers', titolo: 'Highest Elo ever', nota: 'The best rating reached', da: 'players', val: x => (x.eloPicco == null ? 0 : num(x.eloPicco)), testo: v => String(Math.round(v)), filtro: x => x.eloPicco != null && x.classificato !== false },
        { id: 'showdown', gruppo: 'Trainers', titolo: 'Most showdowns won', da: 'players', val: x => num(x.showdown && x.showdown.vinti), testo: v => String(v) },
        { id: 'match', gruppo: 'Trainers', titolo: 'Most matches won', da: 'players', val: x => num(x.match && x.match.vinti), testo: v => String(v) },
        { id: 'percentuale', gruppo: 'Trainers', titolo: 'Best win rate', nota: `Matches won, from ${MIN_MATCH_ALLENATORE} matches played`, da: 'players', val: x => num(x.percMatch), testo: v => `${v}%`, filtro: x => num(x.match && x.match.giocati) >= MIN_MATCH_ALLENATORE, sotto: x => `${num(x.match.vinti)}W · ${num(x.match.persi)}L` },
        { id: 'stagioni', gruppo: 'Trainers', titolo: 'Most seasons won', da: 'players', val: x => num(x.stagioniVinte), testo: v => String(v) },
        { id: 'mvp', gruppo: 'Trainers', titolo: 'Most MVP titles', nota: "Titles won by the trainer's Pokémon", da: 'players', val: x => num(x.mvpVinti), testo: v => String(v) },
        { id: 'serie-team', gruppo: 'Teams', titolo: 'Longest winning streak', nota: 'Matches won in a row', da: 'teams', val: x => num(x.serie && x.serie.vittorieMax), testo: v => `${v} in a row`, quando: x => x.serie && x.serie.vittorieMaxData },
        { id: 'percentuale-team', gruppo: 'Teams', titolo: 'Best win rate', nota: `Matches won, from ${MIN_MATCH_TEAM} matches played`, da: 'teams', val: x => num(x.percMatch), testo: v => `${v}%`, filtro: x => num(x.match && x.match.giocati) >= MIN_MATCH_TEAM, sotto: x => `${num(x.match.vinti)}W · ${num(x.match.persi)}L` },
        { id: 'ko', gruppo: 'Pokémon', titolo: 'Most KOs', nota: 'Opponents knocked out', da: 'pokemon', val: x => num(x.koFatti), testo: v => String(v) },
        { id: 'ko-per-set', gruppo: 'Pokémon', titolo: 'Most KOs per set', nota: `Average, from ${MIN_SET_POKEMON} sets played`, da: 'pokemon', val: x => num(x.koPerSet), testo: v => v.toFixed(1), filtro: x => num(x.portato) >= MIN_SET_POKEMON && x.koPerSet != null },
        { id: 'serie-pokemon', gruppo: 'Pokémon', titolo: 'Longest winning streak', nota: 'Matches won in a row while on the field', da: 'pokemon', val: x => num(x.serie && x.serie.vittorieMax), testo: v => `${v} in a row` }
    ];

    function voceDi(def, x) {
        const e = def.da === 'players' ? x : x;
        const nome = def.da === 'pokemon' ? String(x.specie || '') : String(x.nome || '');
        const chi = x.playerNome || '';
        return {
            nome,
            sotto: def.sotto ? def.sotto(x) : (def.da === 'players' ? '' : (def.da === 'teams' ? chi : `${x.team || ''}${chi ? ` · ${chi}` : ''}`)),
            valore: def.testo(def.val(e)),
            numero: def.val(e),
            specie: def.da === 'pokemon' ? String(x.specie || '') : '',
            colore: coloreSicuro(x.colore, '#d9dde6'),
            avatar: def.da === 'players' ? String(x.avatar || '') : '',
            link: def.da === 'players' ? pagina(x.nome) : (chi ? pagina(chi) : ''),
            quando: def.quando ? String(def.quando(x) || '') : ''
        };
    }

    /** I record di sempre, dal risultato di Statistiche.calcola(dati, { stagione: 'all' }): il podio di ognuno (i record a zero non ci sono) */
    function records(risultato) {
        const r = risultato || {};
        return DEFINIZIONI.map(def => {
            const lista = valori(r[def.da]).filter(x => x && (!def.filtro || def.filtro(x)))
                .map(x => ({ x, v: def.val(x) })).filter(o => o.v > 0)
                .sort((a, b) => b.v - a.v || String(a.x.nome || a.x.specie).localeCompare(String(b.x.nome || b.x.specie)));
            return { id: def.id, gruppo: def.gruppo, titolo: def.titolo, nota: def.nota || '', voci: lista.slice(0, PODIO).map(o => voceDi(def, o.x)) };
        }).filter(rec => rec.voci.length);
    }

    // ---------------------------------------------------------------- MVP e squadre ideali
    /**
     * Per ogni stagione chiusa (non la beta): l'MVP registrato e la squadra ideale, dal numero di set e di KO di QUELLA stagione.
     * @param {{ seasons: object, players: object }} dati
     * @param {{ Statistiche, Mvp }} lib
     */
    function stagioni(dati, { Statistiche, Mvp }) {
        const out = [];
        for (const [id, s] of Object.entries((dati && dati.seasons) || {})) {
            const info = (s && s.info) || {};
            if (id === 'sbeta' || String(info.status || '').toLowerCase().trim() !== 'closed') continue;
            if (Mvp && Mvp.stagioneConMvp && !Mvp.stagioneConMvp(info, id)) continue;
            const mvp = (Mvp ? Mvp.vincitoriDi(s) : []).map(v => ({ specie: String(v.specie || ''), player: String(v.player || ''), team: String(v.team || '') }));
            let dream = [];
            try {
                const rs = Statistiche.calcola(dati, { stagione: id, senzaSquadre: true });
                const formati = Array.isArray(info.selected_formats) && info.selected_formats.length ? info.selected_formats : rs.formati;
                dream = Mvp.squadraIdeale(rs.pokemon, formati).membri.map(m => ({ specie: String(m.specie || ''), player: String(m.playerNome || m.player || ''), team: String(m.team || ''), formato: String(m.formato || '') }));
            } catch (e) { /* senza la squadra ideale si vede lo stesso l'MVP */ }
            if (!mvp.length && !dream.length) continue;
            out.push({ stagione: id, nome: String(info.name || id), data: String(info.chiusaIl || info.endDate || info.deadline || ''), mvp, dream });
        }
        return out.sort((a, b) => b.data.localeCompare(a.data) || (parseInt(String(b.stagione).replace(/\D/g, ''), 10) || 0) - (parseInt(String(a.stagione).replace(/\D/g, ''), 10) || 0));
    }

    // ---------------------------------------------------------------- Match of the week
    /** L'archivio: le settimane dalla più recente, ognuna col suo set (MatchSettimana.settimane().elenco) */
    function settimane(elenco, MatchSettimana) {
        return (elenco || []).slice().reverse().map(w => {
            const e = MatchSettimana.etichettaSettimana(w);
            const s = w.scelto;
            return {
                titolo: e.titolo, intervallo: e.intervallo, quanti: w.quanti,
                p1: s.giocatori.p1, p2: s.giocatori.p2, vincitore: s.vincitore, formato: s.categoria, stagione: s.nomeStagione,
                motivi: s.motivi || [], protagonista: s.protagonista ? s.protagonista.specie : '',
                // senza ?da=home (che riporta alla home): chiudendo il replay si resta nella pagina dei match della stagione
                link: `matches.html?id=${encodeURIComponent(s.stagione)}&replay=${encodeURIComponent(s.showdown)}~${encodeURIComponent(s.match)}~${encodeURIComponent(s.set)}`
            };
        });
    }

    // ---------------------------------------------------------------- markup
    const sprite = (gif, specie, classe) => (gif && specie ? `<img class="${classe}" src="${esc(gif(specie))}" data-pkm="${esc(specie)}" alt="" loading="lazy" onerror="if(window.SpritePkm)SpritePkm.ritenta(this)">` : '');

    function htmlRecords(lista, { gif, giocatori = {} } = {}) {
        if (!lista || !lista.length) return '<p class="hof-vuoto">No records yet: they appear as the league plays.</p>';
        const gruppi = [];
        for (const rec of lista) { let g = gruppi.find(x => x.nome === rec.gruppo); if (!g) gruppi.push(g = { nome: rec.gruppo, lista: [] }); g.lista.push(rec); }
        return gruppi.map(g => `<section class="hof-gruppo" aria-label="${esc(g.nome)}"><h3 class="hof-gruppo-titolo">${esc(g.nome)}</h3><div class="hof-griglia">`
            + g.lista.map(rec => `<article class="hof-record"><h4>${esc(rec.titolo)}</h4>${rec.nota ? `<p class="hof-nota">${esc(rec.nota)}</p>` : ''}<ol>`
                + rec.voci.map((v, i) => {
                    const av = (giocatori[idDi(v.nome)] || {}).avatar || v.avatar;
                    const testa = v.specie ? sprite(gif, v.specie, 'hof-spr') : (av ? `<img class="hof-av" src="${esc(av)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '');
                    const nome = v.link ? `<a href="${esc(v.link)}">${esc(v.nome)}</a>` : esc(v.nome);
                    return `<li class="hof-voce${i === 0 ? ' hof-primo' : ''}" style="--c:${esc(v.colore)}"><span class="hof-pos">${i + 1}</span>${testa}`
                        + `<span class="hof-chi"><b>${nome}</b>${v.sotto ? `<small>${esc(v.sotto)}</small>` : ''}${v.quando ? `<small>${esc(dataIt(v.quando))}</small>` : ''}</span><span class="hof-valore">${esc(v.valore)}</span></li>`;
                }).join('') + '</ol></article>').join('') + '</div></section>').join('');
    }

    function htmlStagioni(lista, { gif } = {}) {
        if (!lista || !lista.length) return '<p class="hof-vuoto">No MVP or Dream Team yet: they are chosen when a season closes.</p>';
        const chip = (m, ruolo) => `<li class="hof-membro">${sprite(gif, m.specie, 'hof-spr')}<span class="hof-chi"><b>${esc(m.specie)}</b><small>${esc([m.team, m.player].filter(Boolean).join(' · '))}${ruolo && m.formato ? `${m.team || m.player ? ' · ' : ''}${esc(m.formato)}` : ''}</small></span></li>`;
        return lista.map(s => `<article class="hof-stagione"><h3><a href="matches.html?id=${encodeURIComponent(s.stagione)}">${esc(s.nome)}</a>${s.data ? `<time>${esc(dataIt(s.data))}</time>` : ''}</h3>`
            + (s.mvp.length ? `<div class="hof-blocco"><h4>MVP</h4><ul>${s.mvp.map(m => chip(m, false)).join('')}</ul></div>` : '')
            + (s.dream.length ? `<div class="hof-blocco"><h4>Dream Team</h4><ul>${s.dream.map(m => chip(m, true)).join('')}</ul></div>` : '')
            + '</article>').join('');
    }

    function htmlSettimane(lista, { gif, giocatori = {} } = {}) {
        if (!lista || !lista.length) return '<p class="hof-vuoto">No Match of the week yet.</p>';
        return `<ol class="hof-settimane">${lista.map(w => {
            const lato = (g, k) => {
                const extra = giocatori[idDi(g.id)] || {};
                return `<span class="hof-lato${w.vincitore === k ? ' hof-vince' : ''}" style="--c:${esc(coloreSicuro(extra.color, '#d9dde6'))}"><b>${esc(g.nome)}</b>${g.team ? `<small>${esc(g.team)}</small>` : ''}</span>`;
            };
            return `<li class="hof-sett"><div class="hof-sett-testa"><b>${esc(w.titolo)}</b><span>${esc(w.intervallo)}</span></div>`
                + `<div class="hof-sett-corpo">${sprite(gif, w.protagonista, 'hof-spr')}<div class="hof-scontro">${lato(w.p1, 'p1')}<i>vs</i>${lato(w.p2, 'p2')}</div>`
                + `<div class="hof-sett-info"><small>${esc([w.formato, w.stagione].filter(Boolean).join(' · '))}</small>${w.motivi.length ? `<span class="hof-motivo">${esc(w.motivi[0])}</span>` : ''}</div>`
                + `<a class="hof-replay" href="${esc(w.link)}">WATCH</a></div></li>`;
        }).join('')}</ol>`;
    }

    return { records, stagioni, settimane, htmlRecords, htmlStagioni, htmlSettimane, DEFINIZIONI, MIN_MATCH_ALLENATORE, MIN_MATCH_TEAM, MIN_SET_POKEMON };
});
