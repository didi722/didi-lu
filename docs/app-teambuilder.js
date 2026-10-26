// =====================================================
// APP — Team Builder a step
// ---------------------------------------------------------------------
// Sul sito il Team Builder mostra tutto insieme (sprite, statistiche, strumento, abilità, mosse, EV): sul telefono, in orizzontale, voleva scroll dappertutto.
// Nell'app è un percorso a tappe, come in un gioco: si sceglie il Pokémon, poi strumento e abilità, poi le quattro mosse, poi EV e natura, infine il team
// (salva, importa/esporta, controlli). Un menù in alto dice a che punto si è e permette di andare da una tappa all'altra; a sinistra restano i sei posti del team.
// Non c'è un secondo Team Builder: è lo stesso di box.html, con la stessa logica e gli stessi dati. Qui si sceglie solo QUALE PARTE mostrare (attributo
// `data-tb-step` sull'overlay) e si disegna il menù; il resto lo fa app-gioco-pagine.css (nascondere le altre parti, impaginare la tappa nello schermo).
// La parte pura (tappe, quali sono raggiungibili, la tappa dopo una scelta, l'HTML del menù) è provata in test/app-teambuilder.test.js;
// funziona nel browser (window.AppTeamBuilder) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const T = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = T;
    else {
        radice.AppTeamBuilder = T;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => T.avvia(radice)); else T.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const FRECCIA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

    /** Le tappe, nell'ordine. `serve`: ha senso solo se lo slot ha già un Pokémon. */
    const PASSI = [
        { id: 'pokemon', titolo: 'Pokémon', serve: false },
        { id: 'oggetto', titolo: 'Item & ability', serve: true },
        { id: 'mosse', titolo: 'Moves', serve: true },
        { id: 'ev', titolo: 'EVs', serve: true },
        { id: 'team', titolo: 'Team', serve: false }
    ];
    const ID = PASSI.map(p => p.id);

    /** L'indice della tappa (-1 se non esiste) */
    const indice = id => ID.indexOf(id);

    /** Si può andare a questa tappa? Strumento, mosse ed EV si decidono su un Pokémon: senza, restano chiuse. */
    function abilitato(id, haPokemon) {
        const p = PASSI[indice(id)];
        return !!p && (!p.serve || !!haPokemon);
    }

    /** La tappa dopo un passo avanti (+1) o indietro (-1), saltando quelle chiuse; ai capi resta dov'è. */
    function prossimo(id, verso, haPokemon) {
        let i = indice(id);
        if (i < 0) return PASSI[0].id;
        const v = verso < 0 ? -1 : 1;
        for (let k = i + v; k >= 0 && k < PASSI.length; k += v) if (abilitato(PASSI[k].id, haPokemon)) return PASSI[k].id;
        return id;
    }

    /**
     * La tappa da mostrare dopo che il Team Builder ha ridisegnato il corpo.
     * `prima` e `ora`: cosa c'era e cosa c'è ('scelta' = elenco dei Pokémon di uno slot vuoto, 'editor' = Pokémon scelto, 'altro' = altro, ad esempio il caricamento).
     * - appena scelto un Pokémon (da 'scelta' a 'editor', mentre si è nella tappa del Pokémon) si passa a strumento e abilità;
     * - toccare uno slot vuoto riporta alla scelta del Pokémon (a chi lo sta riempiendo non serve altro);
     * - nel resto la tappa resta; se non è più raggiungibile si torna al Pokémon.
     */
    function dopoRender(prima, ora, passo) {
        if (ora === 'altro') return passo;
        if (ora === 'scelta') return 'pokemon';
        if (prima === 'scelta' && passo === 'pokemon') return 'oggetto';
        return abilitato(passo, true) ? passo : 'pokemon';
    }

    /** Il menù in alto: ‹ tappe › (la tappa attiva evidenziata, quelle chiuse spente) */
    function htmlMenu(passo, haPokemon) {
        const attivo = indice(passo);
        const voci = PASSI.map((p, i) => {
            const aperto = abilitato(p.id, haPokemon);
            return `<button type="button" class="tbw-passo${p.id === passo ? ' attivo' : ''}${i < attivo && aperto ? ' fatto' : ''}" data-tbw-passo="${esc(p.id)}"${aperto ? '' : ' disabled'} aria-current="${p.id === passo ? 'step' : 'false'}" data-suono="scegli"><b>${i + 1}</b><span>${esc(p.titolo)}</span></button>`;
        }).join('<i class="tbw-filo" aria-hidden="true"></i>');
        return `<button type="button" class="tbw-freccia" data-tbw-verso="-1" aria-label="Previous step" data-suono="scegli"${prossimo(passo, -1, haPokemon) === passo ? ' disabled' : ''}>${FRECCIA}</button>
            <div class="tbw-passi" role="tablist" aria-label="Team Builder steps">${voci}</div>
            <button type="button" class="tbw-freccia tbw-avanti" data-tbw-verso="1" aria-label="Next step" data-suono="scegli"${prossimo(passo, 1, haPokemon) === passo ? ' disabled' : ''}>${FRECCIA}</button>`;
    }

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.documentElement || !doc.documentElement.classList.contains('app-shell')) return null;
        let passo = 'pokemon', prima = null, aperto = false;
        let overlay = null, menu = null;

        const cosaMostra = corpo => (!corpo ? 'altro' : corpo.querySelector('.tb-editor') ? 'editor' : corpo.querySelector('.tb-picker-top') ? 'scelta' : 'altro');

        // `ridisegnato`: il Team Builder ha appena rifatto il corpo (cambio di slot, scelta del Pokémon...) e la tappa può cambiare da sola;
        // altrimenti è stato l'utente a scegliere la tappa e si rispetta (anche il team con uno slot vuoto da guardare)
        const aggiorna = (ridisegnato = true) => {
            if (!overlay || !menu) return;
            const corpo = doc.getElementById('tb-body');
            const ora = cosaMostra(corpo);
            if (ridisegnato) passo = dopoRender(prima, ora, passo);
            if (ora !== 'altro') prima = ora;
            const ha = ora === 'editor' || (ora === 'altro' && prima === 'editor');
            overlay.dataset.tbStep = passo;
            overlay.dataset.tbHa = ha ? '1' : '0';
            menu.innerHTML = htmlMenu(passo, ha);
            // nella tappa del Pokémon già scelto, il tasto per cambiarlo sta nel pannello (il Team Builder lo ridisegna a ogni cambio di slot)
            const lato = corpo && corpo.querySelector('.tb-side');
            if (lato && !lato.querySelector('.tbw-cambia')) lato.insertAdjacentHTML('beforeend', '<button type="button" class="tbw-cambia" data-tbw-cambia="1" data-suono="scegli">Change Pokémon</button>');
            const attivo = menu.querySelector('.tbw-passo.attivo');
            if (attivo && attivo.scrollIntoView) { try { attivo.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* senza: resta dov'è */ } }
        };
        const vai = id => { if (id === passo) return; passo = id; aggiorna(false); };

        const monta = el => {
            if (overlay === el) return;
            overlay = el;
            const wrapper = el.querySelector('.tb-wrapper');
            if (!wrapper) return;
            menu = doc.createElement('nav');
            menu.className = 'tbw-menu';
            const testa = wrapper.querySelector('.tb-header');
            if (testa && testa.nextSibling) wrapper.insertBefore(menu, testa.nextSibling); else wrapper.appendChild(menu);
            menu.addEventListener('click', e => {
                const b = e.target.closest ? e.target.closest('button') : null;
                if (!b || b.disabled) return;
                const ha = overlay.dataset.tbHa === '1';
                if (b.dataset.tbwPasso) vai(b.dataset.tbwPasso);
                else if (b.dataset.tbwVerso) vai(prossimo(passo, Number(b.dataset.tbwVerso), ha));
            });
            const corpo = doc.getElementById('tb-body');
            if (corpo) {
                new win.MutationObserver(() => aggiorna(true)).observe(corpo, { childList: true });
                corpo.addEventListener('click', e => {
                    const b = e.target.closest ? e.target.closest('[data-tbw-cambia]') : null;
                    if (b && typeof win.tbRimuoviPokemon === 'function') win.tbRimuoviPokemon();
                });
            }
            // ogni volta che si apre si riparte dalla scelta del Pokémon
            new win.MutationObserver(() => {
                const ora = el.classList.contains('open');
                if (ora && !aperto) { passo = 'pokemon'; prima = null; aggiorna(false); }
                aperto = ora;
            }).observe(el, { attributes: true, attributeFilter: ['class'] });
            aperto = el.classList.contains('open');
            aggiorna(false);
        };

        const cerca = () => { const el = doc.getElementById('tb-overlay'); if (el) monta(el); return !!el; };
        if (!cerca()) {
            const o = new win.MutationObserver(() => { if (cerca()) o.disconnect(); });
            o.observe(doc.body, { childList: true });
        }
        return { vai, aggiorna };
    }

    return { PASSI, indice, abilitato, prossimo, dopoRender, htmlMenu, avvia };
});
