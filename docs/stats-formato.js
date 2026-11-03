// =====================================================
// STATISTICHE DI UN FORMATO — Poké-Tournament
//
// StatsFormato.calcola(dati, { formato, stagione }) mette insieme, per UN formato (la scheda "Stats" della finestra della pagina Formats),
// i numeri che il sito calcola già altrove:
//   - uso, strumenti, mosse, abilità e compagni di squadra: da UsoGlobale (uso-globale.js), cioè dai team ISCRITTI alle stagioni che hanno
//     giocato almeno un set ufficiale (un team mai sceso in campo non si vede: l'uso non deve rivelare team ancora segreti);
//   - set vinti, KO per set, lead (i due Pokémon che aprono il set): da Statistiche (statistiche.js), con lo stesso formato e la stessa stagione.
// È una funzione pura: niente DOM, niente Firebase. StatsFormato.html(r, opzioni) ne fa il markup (una stringa), che la pagina mette nella finestra.
// Si prova in Node (test/stats-formato.test.js).
//
// Soglie: sotto MIN_SET_PERC set (3) la percentuale di vittorie e i KO per set non si mostrano né ordinano; le lead sotto MIN_SET_LEAD set (2) non si elencano.
// Ogni numero dice su quanti set si basa.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./statistiche.js'), require('./uso-globale.js'));
    else radice.StatsFormato = fabbrica(radice.Statistiche, radice.UsoGlobale);
})(typeof self !== 'undefined' ? self : this, function (Statistiche, UsoGlobale) {
    'use strict';

    const MIN_SET_PERC = 3;      // set con un vincitore per mostrare % vittorie e KO per set di un Pokémon
    const MIN_SET_LEAD = 2;      // set per elencare una coppia di lead
    const LEAD_MAX = 8;
    const VISIBILI = 10;         // quanti Pokémon si vedono prima di "Show all"

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const giocati = b => (b ? num(b.vinti) + num(b.persi) : 0);

    /** Le stagioni (non cup) in cui il formato ha almeno un match salvato: [{ id, nome, match }], come le ordina Statistiche (la più recente prima, la beta in fondo). */
    function stagioniDelFormato(dati, formato, tutteLeStagioni) {
        const conta = {};
        for (const [id, s] of Object.entries(dati?.seasons || {})) {
            if (idDi(s?.info?.tipo) === 'cup') continue;
            for (const sd of valori(s?.showdowns)) {
                for (const m of valori(sd?.matches)) {
                    if (!m || m.p1score == null || m.p2score == null) continue;
                    if (String(m.categoria || sd?.info?.categoria || '') === formato) conta[id] = (conta[id] || 0) + 1;
                }
            }
        }
        return tutteLeStagioni.filter(s => conta[s.id]).map(s => ({ id: s.id, nome: s.nome, match: conta[s.id], beta: !!s.beta }));
    }

    function calcola(dati, filtro = {}) {
        const formato = String(filtro.formato || '');
        const stagione = filtro.stagione && filtro.stagione !== 'all' ? String(filtro.stagione) : 'all';
        const r = Statistiche.calcola(dati, { stagione, formato, senzaSquadre: true });
        const uso = UsoGlobale.calcola(dati, { stagione, formato }, r.pokemon);

        const pokemon = uso.specie.map(s => ({
            specieId: s.specieId, nome: s.nome,
            team: s.team, perc: s.perc, giocatori: s.giocatori,
            istanze: s.istanze, setVisibili: s.setVisibili,
            schedaChiusa: s.istanze > 0 && s.setVisibili === 0,       // le stagioni a scheda chiusa non mostrano cosa porta
            strumenti: s.strumenti.slice(0, 3), mosse: s.mosse.slice(0, 4), abilita: s.abilita.slice(0, 2),
            compagni: s.compagni.slice(0, 4),
            battaglia: s.battaglia ? {
                portato: s.battaglia.portato, vinti: s.battaglia.vinti, persi: s.battaglia.persi,
                percVinti: s.battaglia.percVinti, koPerSet: s.battaglia.koPerSet
            } : null
        }));

        const lead = (r.lead || []).filter(l => l.set >= MIN_SET_LEAD).slice(0, LEAD_MAX)
            .map(l => ({ specie: l.specie, specieId: l.specieId, set: l.set, vinti: l.vinti, persi: l.persi, percVinti: l.percVinti }));

        return {
            filtro: { formato, stagione },
            stagioni: stagioniDelFormato(dati, formato, r.stagioni),
            totali: { team: uso.totali.team, giocatori: uso.totali.giocatori, match: r.totali.match, set: r.totali.set, setConDati: r.totali.setConDati },
            pokemon, lead,
            vuoto: r.totali.match === 0 && uso.totali.team === 0
        };
    }

    /** L'ordine dell'elenco: 'uso' (come arriva), 'vinti' (% di set vinti) o 'ko' (KO per set); chi non ha abbastanza set va in fondo. */
    function ordina(pokemon, criterio) {
        const elenco = pokemon.slice();
        if (criterio === 'vinti') {
            const valido = p => giocati(p.battaglia) >= MIN_SET_PERC;
            return elenco.sort((a, b) => (valido(b) - valido(a))
                || (valido(a) ? b.battaglia.percVinti - a.battaglia.percVinti || giocati(b.battaglia) - giocati(a.battaglia) : 0)
                || b.team - a.team || a.nome.localeCompare(b.nome));
        }
        if (criterio === 'ko') {
            const valido = p => p.battaglia && p.battaglia.portato >= MIN_SET_PERC && p.battaglia.koPerSet != null;
            return elenco.sort((a, b) => (valido(b) - valido(a))
                || (valido(a) ? b.battaglia.koPerSet - a.battaglia.koPerSet || b.battaglia.portato - a.battaglia.portato : 0)
                || b.team - a.team || a.nome.localeCompare(b.nome));
        }
        return elenco;
    }

    // ---------------------------------------------------------------- markup
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pct = n => (n == null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(1)}%`);
    const barra = n => (n == null ? '' : `<span class="fs-barra"><span style="width:${Math.max(0, Math.min(100, n))}%"></span></span>`);
    const plurale = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

    function righe(voci, vuoto) {
        if (!voci || !voci.length) return `<p class="fs-niente">${esc(vuoto)}</p>`;
        return `<ul class="fs-righe">${voci.map(v => `<li><span class="fs-r-nome">${esc(v.nome)}</span>${barra(v.perc)}<b class="fs-r-perc">${pct(v.perc)}</b></li>`).join('')}</ul>`;
    }

    function dettaglio(p, sprite) {
        if (p.schedaChiusa) return `<div class="fs-dettaglio"><p class="fs-niente">Items and moves are hidden: the sheet is closed in this season.</p></div>`;
        const compagni = p.compagni.length
            ? `<div class="fs-compagni">${p.compagni.map(c => `<span class="fs-compagno">${sprite(c.nome)}<span>${esc(c.nome)}</span><b>${pct(c.perc)}</b></span>`).join('')}</div>`
            : '<p class="fs-niente">No teammates yet.</p>';
        return `<div class="fs-dettaglio">
            <div class="fs-blocco"><h4>Items</h4>${righe(p.strumenti, 'No items recorded.')}</div>
            <div class="fs-blocco"><h4>Moves</h4>${righe(p.mosse, 'No moves recorded.')}</div>
            ${p.abilita.length ? `<div class="fs-blocco"><h4>Ability</h4>${righe(p.abilita, '')}</div>` : ''}
            <div class="fs-blocco"><h4>Often with</h4>${compagni}</div>
        </div>`;
    }

    function voce(p, i, sprite, nascosta) {
        const b = p.battaglia, g = giocati(b);
        const vinti = g >= MIN_SET_PERC ? pct(b.percVinti) : '—';
        const ko = b && b.portato >= MIN_SET_PERC && b.koPerSet != null ? Number(b.koPerSet).toFixed(1) : '—';
        const setTxt = g ? plurale(g, 'set', 'sets') : 'no sets';
        return `<li class="fs-voce"${nascosta ? ' hidden data-fs-extra' : ''}><details>
            <summary>
                <span class="fs-pos">${i + 1}</span>
                <span class="fs-sprite">${sprite(p.nome)}</span>
                <span class="fs-chi"><span class="fs-nome">${esc(p.nome)}</span>${barra(p.perc)}</span>
                <span class="fs-num"><b>${pct(p.perc)}</b><small>${esc(plurale(p.team, 'team', 'teams'))}</small></span>
                <span class="fs-num"><b>${vinti}</b><small>${esc(setTxt)}</small></span>
                <span class="fs-num"><b>${ko}</b><small>KO/set</small></span>
            </summary>
            ${dettaglio(p, sprite)}
        </details></li>`;
    }

    function sezioneLead(lead, sprite) {
        if (!lead.length) return `<p class="fs-niente">Not enough sets yet: a pair needs at least ${MIN_SET_LEAD}.</p>`;
        return `<ol class="fs-lead">${lead.map(l => {
            const g = l.vinti + l.persi;
            return `<li class="fs-lead-riga"><span class="fs-lead-sprite">${l.specie.map(sprite).join('')}</span>
                <span class="fs-lead-nomi">${l.specie.map(esc).join(' + ')}</span>
                <span class="fs-num"><b>${g >= MIN_SET_PERC ? pct(l.percVinti) : '—'}</b><small>${esc(plurale(l.set, 'set', 'sets'))}</small></span></li>`;
        }).join('')}</ol>`;
    }

    /**
     * Il markup della scheda Stats.
     * @param {object} r   risultato di calcola
     * @param {{ ordine?: 'uso'|'vinti'|'ko', tutti?: boolean, sprite?: function(string): string }} [opz]
     */
    function html(r, opz = {}) {
        const sprite = opz.sprite || (() => '');
        const ordine = ['uso', 'vinti', 'ko'].includes(opz.ordine) ? opz.ordine : 'uso';
        const scelta = r.filtro.stagione;
        const select = `<label class="fs-campo"><span>Season</span><select class="fs-stagione" data-fs-stagione aria-label="Season">
            <option value="all"${scelta === 'all' ? ' selected' : ''}>All seasons</option>
            ${r.stagioni.map(s => `<option value="${esc(s.id)}"${scelta === s.id ? ' selected' : ''}>${esc(s.nome)}${s.beta ? ' (beta)' : ''}</option>`).join('')}
        </select></label>`;
        if (r.vuoto) {
            // "tutte le stagioni" non include la beta: se il formato è stato giocato solo lì, lo si dice
            const testo = scelta !== 'all' ? 'No matches played in this format in this season.'
                : r.stagioni.length ? 'No matches played outside the beta yet: pick the beta season above to see its stats.'
                : 'No matches played in this format yet.';
            return `<div class="fs">${select}<p class="fs-niente">${testo}</p></div>`;
        }
        const t = r.totali;
        const lista = ordina(r.pokemon, ordine);
        const tasto = (id, testo) => `<button type="button" class="fs-ordine-tasto" data-fs-ordine="${id}" aria-pressed="${ordine === id}">${testo}</button>`;
        return `<div class="fs">
            ${select}
            <p class="fs-riepilogo"><b>${t.team}</b> ${t.team === 1 ? 'team' : 'teams'} · <b>${t.giocatori}</b> ${t.giocatori === 1 ? 'player' : 'players'} · <b>${t.match}</b> ${t.match === 1 ? 'match' : 'matches'} · <b>${t.set}</b> ${t.set === 1 ? 'set' : 'sets'}</p>
            <section class="fs-sezione" aria-label="Pokémon">
                <div class="fs-intesta"><h3>Pokémon</h3><div class="fs-ordine" role="group" aria-label="Sort by">${tasto('uso', 'Usage')}${tasto('vinti', 'Win %')}${tasto('ko', 'KO/set')}</div></div>
                ${lista.length
                    ? `<ol class="fs-lista">${lista.map((p, i) => voce(p, i, sprite, !opz.tutti && i >= VISIBILI)).join('')}</ol>
                       ${lista.length > VISIBILI && !opz.tutti ? `<button type="button" class="fs-altri" data-fs-altri>Show all ${lista.length}</button>` : ''}`
                    : '<p class="fs-niente">No team has played a set here yet.</p>'}
            </section>
            <section class="fs-sezione" aria-label="Lead pairs">
                <div class="fs-intesta"><h3>Lead pairs</h3></div>
                ${sezioneLead(r.lead, sprite)}
            </section>
            <p class="fs-nota">Usage = registered teams that have played at least one official set. Win % and KO/set count the sets where the Pokémon was brought (shown from ${MIN_SET_PERC} sets). Items, moves and teammates come from the registered sets.</p>
        </div>`;
    }

    return { calcola, ordina, html, stagioniDelFormato, MIN_SET_PERC, MIN_SET_LEAD, VISIBILI };
});
