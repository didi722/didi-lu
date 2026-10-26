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
    const T = fabbrica(typeof module === 'object' && module.exports ? require('./app-carosello.js') : radice.AppCarosello);
    if (typeof module === 'object' && module.exports) module.exports = T;
    else {
        radice.AppTeamBuilder = T;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => T.avvia(radice)); else T.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (Car) {
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

    /** Il menù in alto: le tappe (quella attiva evidenziata, quelle chiuse spente); si passa dall'una all'altra toccandole o scorrendo di lato, senza frecce */
    function htmlMenu(passo, haPokemon) {
        const attivo = indice(passo);
        const voci = PASSI.map((p, i) => {
            const aperto = abilitato(p.id, haPokemon);
            return `<button type="button" class="tbw-passo${p.id === passo ? ' attivo' : ''}${i < attivo && aperto ? ' fatto' : ''}" data-tbw-passo="${esc(p.id)}"${aperto ? '' : ' disabled'} aria-current="${p.id === passo ? 'step' : 'false'}" data-suono="scegli"><b>${i + 1}</b><span>${esc(p.titolo)}</span></button>`;
        }).join('<i class="tbw-filo" aria-hidden="true"></i>');
        return `<div class="tbw-passi" role="tablist" aria-label="Team Builder steps">${voci}</div>`;
    }

    /** La scelta del formato nell'assistente del Box: un tasto per formato, al posto del menù a tendina del browser */
    function htmlFormati(opzioni, scelto) {
        const lista = (opzioni || []).filter(o => o && String(o.valore) !== '');
        if (!lista.length) return '<span class="tbf-vuoto">No formats yet</span>';
        return lista.map(o => `<button type="button" class="tbf-chip${String(o.valore) === String(scelto) ? ' attivo' : ''}" data-tbf="${esc(o.valore)}" aria-pressed="${String(o.valore) === String(scelto)}" data-suono="scegli">${esc(o.testo)}</button>`).join('');
    }

    /** La tastiera del telefono è aperta? Lo si capisce dall'altezza visibile: molto più bassa della massima vista. */
    function tastieraAperta(altezza, massima, soglia = 90) {
        return Number(massima) > 0 && Number(altezza) > 0 && Number(massima) - Number(altezza) > soglia;
    }

    /**
     * Cosa fare a un tocco mentre si sceglie uno strumento o una mossa (campi che hanno l'elenco e anche il testo da scrivere):
     *  - 'apri-lista': primo tocco sul campo: si apre l'elenco, senza far comparire la tastiera;
     *  - 'tastiera': tocco sul campo già aperto (la casella di testo): ora sì, la tastiera;
     *  - 'chiudi-tastiera': tocco fuori dal campo con la tastiera aperta: prima si chiude la tastiera (l'elenco resta);
     *  - 'normale': tutto il resto (anche il tocco fuori a tastiera chiusa, che chiude l'elenco come sempre).
     * `s`: { suCampo (tocco sul campo di testo), campoAttivo (è già quello aperto), tastiera (aperta), listaAperta }
     */
    function azioneTocco(s) {
        const x = s || {};
        if (x.suCampo) {
            if (x.tastiera && x.campoAttivo) return 'normale';
            if (x.campoAttivo && x.listaAperta) return 'tastiera';
            return 'apri-lista';
        }
        return x.tastiera && x.listaAperta ? 'chiudi-tastiera' : 'normale';
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
                // si passa da una tappa all'altra anche scorrendo di lato (non sui cursori, i campi e le liste: lì il dito serve a loro)
                if (Car) Car.collegaGesti(corpo, {
                    avanti: () => vai(prossimo(passo, 1, overlay.dataset.tbHa === '1')),
                    indietro: () => vai(prossimo(passo, -1, overlay.dataset.tbHa === '1')),
                    ignora: 'input, select, textarea, .tb-combo-list, .tb-picker-grid, .tb-ev-row'
                });
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

        // ----- strumenti e mosse: il primo tocco apre l'elenco (senza tastiera); la tastiera compare solo toccando di nuovo la casella di testo;
        //       con la tastiera aperta, un tocco fuori chiude prima la tastiera, poi (al tocco dopo) l'elenco -----
        const stato = { campo: null, massima: win.innerHeight || 0, blocca: 0 };
        const altezzaVisibile = () => (win.visualViewport && win.visualViewport.height) || win.innerHeight;
        win.addEventListener('resize', () => { if (win.innerHeight > stato.massima) stato.massima = win.innerHeight; });
        const origBlur = win.tbBlurCombo;
        if (typeof origBlur === 'function') {
            // mentre si nasconde la tastiera il campo perde e riprende il fuoco: l'elenco non deve chiudersi
            win.tbBlurCombo = function (campo) { if (campo && campo.dataset && campo.dataset.tienilista) return undefined; return origBlur.apply(this, arguments); };
        }
        const senzaChiudere = (campo, f) => {
            campo.dataset.tienilista = '1';
            f();
            win.setTimeout(() => { delete campo.dataset.tienilista; }, 450);
        };
        const tastieraOra = () => !!stato.campo && tastieraAperta(altezzaVisibile(), stato.massima);
        // tbCombo è una costante del Box (box.html): sta nello spazio comune degli script, non su window
        const campoOra = () => { try { return tbCombo.input || null; } catch (e) { return null; } };
        const listaOra = () => !!campoOra();
        const fermaSe = e => { if (Date.now() < stato.blocca) { e.preventDefault(); e.stopPropagation(); } };
        ['mousedown', 'click', 'touchstart', 'pointerup'].forEach(t => doc.addEventListener(t, fermaSe, true));
        doc.addEventListener('pointerdown', e => {
            if (!overlay || !overlay.classList.contains('open') || !e.target || !e.target.closest) return;
            const campo = e.target.closest('.tb-combo input.tb-input');
            const dentro = !!e.target.closest('.tb-combo');
            const azione = azioneTocco({ suCampo: !!campo, campoAttivo: !!campo && campoOra() === campo, tastiera: tastieraOra(), listaAperta: listaOra() });
            if (azione === 'apri-lista') { campo.inputMode = 'none'; stato.campo = null; }
            else if (azione === 'tastiera') {
                campo.inputMode = 'text'; stato.campo = campo;
                win.setTimeout(() => senzaChiudere(campo, () => { campo.blur(); campo.focus(); }), 0);       // perché il telefono mostri la tastiera
            } else if (azione === 'chiudi-tastiera' && !dentro) {
                const c = stato.campo;
                e.preventDefault(); e.stopPropagation();
                stato.blocca = Date.now() + 500;
                stato.campo = null;
                if (c) senzaChiudere(c, () => { c.inputMode = 'none'; c.blur(); c.focus({ preventScroll: true }); });
            }
        }, true);
        doc.addEventListener('focusout', e => { if (stato.campo === e.target && !(e.target.dataset && e.target.dataset.tienilista)) stato.campo = null; });

        // ----- l'assistente del Box: il formato si sceglie con i tasti, non con il menù a tendina del browser -----
        const montaFormati = () => {
            const sel = doc.getElementById('helper-format-select');
            const contenitore = doc.querySelector('#helper-modal-overlay .format-modal-container');
            if (!sel || !contenitore || doc.getElementById('tbf-formati')) return;
            const barra = doc.createElement('div');
            barra.id = 'tbf-formati';
            barra.className = 'tbf-formati';
            contenitore.parentNode.insertBefore(barra, contenitore);
            const disegna = () => { barra.innerHTML = htmlFormati([...sel.options].map(o => ({ valore: o.value, testo: o.textContent })), sel.value); };
            barra.addEventListener('click', e => {
                const b = e.target.closest ? e.target.closest('[data-tbf]') : null;
                if (!b) return;
                sel.value = b.dataset.tbf;
                sel.dispatchEvent(new win.Event('change', { bubbles: true }));
                disegna();
            });
            new win.MutationObserver(disegna).observe(sel, { childList: true });
            disegna();
        };
        montaFormati();

        const cerca = () => { const el = doc.getElementById('tb-overlay'); if (el) monta(el); return !!el; };
        if (!cerca()) {
            const o = new win.MutationObserver(() => { if (cerca()) o.disconnect(); });
            o.observe(doc.body, { childList: true });
        }
        return { vai, aggiorna };
    }

    return { PASSI, indice, abilitato, prossimo, dopoRender, htmlMenu, htmlFormati, tastieraAperta, azioneTocco, avvia };
});
