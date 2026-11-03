// =====================================================
// FILTRO DEGLI SHOWDOWN — Poké-Tournament
//
// Nell'elenco dei showdown di una stagione (matches.html, e le locandine dell'app) si può cercare al volo uno showdown preciso:
// scrivendo (giocatore, team, formato, data: più parole si sommano) e/o con i filtri a tendina (giocatore, contro chi, formato, mese,
// e se quel giocatore ha vinto o perso). Più filtri insieme si sommano: restano solo i showdown che li rispettano tutti.
//
// FiltroShowdown.voce(id, sd, vince)       → la scheda di ricerca di un showdown (dai dati di Firebase: info + matches)
// FiltroShowdown.opzioni(voci)             → quello che si può scegliere: { giocatori, formati, mesi }
// FiltroShowdown.filtra(voci, criteri)     → le schede che rispettano i criteri (stesso ordine)
// FiltroShowdown.html(opzioni, criteri, conteggio, stato) → il filtro (stringa HTML): a riposo è solo un'icona, toccandola si apre; i comportamenti li collega la pagina
//
// Funzioni pure: niente DOM, niente Firebase. Si provano in Node (test/filtro-showdown.test.js); nel browser è window.FiltroShowdown.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.FiltroShowdown = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MESI = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const CRITERI_VUOTI = Object.freeze({ testo: '', giocatore: '', contro: '', formato: '', mese: '', esito: '' });

    const chiaveDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /** La data come AAAA-MM-GG (le date si trovano anche come GG/MM/AAAA o GG.MM.AAAA); '' se non si capisce */
    function normalizzaData(d) {
        const t = String(d == null ? '' : d).trim();
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(t);
        if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        return '';
    }

    const nomeMese = mese => {
        const m = /^(\d{4})-(\d{2})$/.exec(mese);
        return m && MESI[Number(m[2]) - 1] ? `${MESI[Number(m[2]) - 1]} ${m[1]}` : '';
    };

    /**
     * La scheda di ricerca di un showdown.
     * @param {string} id
     * @param {{ info?: object, matches?: object }} sd   il nodo `showdowns/{id}` di Firebase
     * @param {number} vince   chi sta vincendo: 1, 2 oppure 0 (pari o ancora aperto)
     */
    function voce(id, sd, vince = 0) {
        const info = (sd && sd.info) || {};
        const matches = (sd && sd.matches && typeof sd.matches === 'object') ? Object.values(sd.matches) : [];
        const giocatori = [info.player1 || 'TBD', info.player2 || 'TBD'];
        const data = normalizzaData(info.data);
        const mese = data.slice(0, 7);
        const team = [...new Set(matches.flatMap(m => [m && m.team1, m && m.team2]).map(t => String(t && typeof t === 'object' ? t.valore : t || '').trim()).filter(Boolean))];
        const formato = String(info.categoria || '');
        const testo = [...giocatori, ...team, formato, String(info.data || ''), data, nomeMese(mese)].join(' ').toLowerCase();
        return { id, formato, data, mese, giocatori, chiavi: giocatori.map(chiaveDi), vince: vince === 1 || vince === 2 ? vince : 0, team, testo };
    }

    /** Quello che si può scegliere dai showdown dell'elenco: i giocatori (per nome), i formati e i mesi (il più recente prima) */
    function opzioni(voci) {
        const lista = Array.isArray(voci) ? voci : [];
        const giocatori = new Map();
        for (const v of lista) v.giocatori.forEach((nome, i) => { if (v.chiavi[i] && v.chiavi[i] !== 'tbd' && !giocatori.has(v.chiavi[i])) giocatori.set(v.chiavi[i], nome); });
        const formati = [...new Set(lista.map(v => v.formato).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const mesi = [...new Set(lista.map(v => v.mese).filter(Boolean))].sort().reverse().map(valore => ({ valore, nome: nomeMese(valore) }));
        return {
            giocatori: [...giocatori].map(([chiave, nome]) => ({ chiave, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
            formati, mesi
        };
    }

    /** Quanti criteri sono attivi (il testo conta uno; "esito" non conta da solo: va con il giocatore) */
    function quantiAttivi(criteri) {
        const c = { ...CRITERI_VUOTI, ...(criteri || {}) };
        return ['testo', 'giocatore', 'contro', 'formato', 'mese'].filter(k => String(c[k] || '').trim()).length + (c.giocatore && c.esito ? 1 : 0);
    }

    /** Le schede che rispettano TUTTI i criteri; senza criteri tutte */
    function filtra(voci, criteri) {
        const lista = Array.isArray(voci) ? voci : [];
        const c = { ...CRITERI_VUOTI, ...(criteri || {}) };
        const parole = chiaveDi(c.testo).split(/\s+/).filter(Boolean);
        const giocatore = chiaveDi(c.giocatore), contro = chiaveDi(c.contro), formato = chiaveDi(c.formato);
        return lista.filter(v => {
            if (giocatore && !v.chiavi.includes(giocatore)) return false;
            if (contro && !v.chiavi.includes(contro)) return false;
            if (giocatore && contro && giocatore === contro) return false;           // contro se stesso: nessuno
            if (formato && chiaveDi(v.formato) !== formato) return false;
            if (c.mese && v.mese !== c.mese) return false;
            if (giocatore && (c.esito === 'won' || c.esito === 'lost')) {
                const lato = v.chiavi.indexOf(giocatore) + 1;
                if (!v.vince) return false;                                            // pari o aperto: né vinto né perso
                if ((v.vince === lato) !== (c.esito === 'won')) return false;
            }
            return parole.every(p => v.testo.includes(p));
        });
    }

    // l'icona dei filtri (un imbuto)
    const ICONA = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2h13L9.6 8.3V14l-3.2-1.7V8.3z"/></svg>';

    /**
     * Il filtro: a riposo è solo l'icona dei filtri (con, se ce ne sono di attivi, quanti sono, il conteggio e il tasto Clear); toccandola si apre la ricerca
     * con le tendine.
     * @param {{ giocatori: Array, formati: string[], mesi: Array }} opz   da opzioni()
     * @param {object} criteri   i criteri attuali
     * @param {{ mostrati: number, totale: number }} conteggio
     * @param {{ aperto?: boolean }} [stato]
     */
    function html(opz, criteri, conteggio, stato = {}) {
        const c = { ...CRITERI_VUOTI, ...(criteri || {}) };
        const attivi = quantiAttivi(c);
        const aperto = !!stato.aperto;
        const tendina = (campo, etichetta, voci, scelto) => `<label class="mf-campo"><span>${etichetta}</span><select data-mf="${campo}" aria-label="${etichetta}"><option value="">Any</option>${voci.map(v => `<option value="${esc(v.valore)}"${v.valore === scelto ? ' selected' : ''}>${esc(v.nome)}</option>`).join('')}</select></label>`;
        const giocatori = opz.giocatori.map(g => ({ valore: g.chiave, nome: g.nome }));
        const tasto = (valore, testo) => `<button type="button" class="mf-esito-tasto" data-mf-esito="${valore}" aria-pressed="${c.esito === valore}">${testo}</button>`;
        const conta = conteggio.mostrati === conteggio.totale ? `${conteggio.totale} ${conteggio.totale === 1 ? 'showdown' : 'showdowns'}` : `${conteggio.mostrati} of ${conteggio.totale} showdowns`;
        return `<div class="mf-testa">
            <button type="button" class="mf-apri" data-mf-apri aria-expanded="${aperto}" aria-controls="mf-corpo" aria-label="Filter showdowns" title="Filter showdowns">${ICONA}<i class="mf-n"${attivi ? '' : ' hidden'}>${attivi}</i></button>
            <span class="mf-riga"${attivi || aperto ? '' : ' hidden'}><span class="mf-conta" aria-live="polite">${conta}</span><button type="button" class="mf-pulisci" data-mf-pulisci${attivi ? '' : ' hidden'}>Clear</button></span>
        </div>
        <div class="mf-corpo" id="mf-corpo"${aperto ? '' : ' hidden'}>
            <input type="search" class="mf-testo" data-mf="testo" value="${esc(c.testo)}" placeholder="Search player, team, format, date…" aria-label="Search showdowns" autocomplete="off" enterkeyhint="search">
            <div class="mf-pannello">
                ${tendina('giocatore', 'Player', giocatori, c.giocatore)}
                ${tendina('contro', 'Versus', giocatori, c.contro)}
                ${tendina('formato', 'Format', opz.formati.map(f => ({ valore: f, nome: f })), c.formato)}
                ${tendina('mese', 'Month', opz.mesi.map(m => ({ valore: m.valore, nome: m.nome })), c.mese)}
                <div class="mf-esito" role="group" aria-label="Result for the chosen player"${c.giocatore ? '' : ' hidden'}><span>Result</span>${tasto('', 'Any')}${tasto('won', 'Won')}${tasto('lost', 'Lost')}</div>
            </div>
        </div>
        <p class="mf-vuoto" role="status"${conteggio.mostrati ? ' hidden' : ''}>No showdown matches these filters.</p>`;
    }

    return { voce, opzioni, filtra, quantiAttivi, html, normalizzaData, nomeMese, CRITERI_VUOTI };
});
