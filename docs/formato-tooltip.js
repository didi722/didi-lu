/* =====================================================================
   TOOLTIP CON IL RIEPILOGO DELLE REGOLE DI UN FORMATO (Hub e Index)
   ---------------------------------------------------------------------
   Prima l'Hub e l'Index avevano ognuno la propria copia, e si erano allontanate: nell'Index (iscrizione a una stagione)
   il fumetto era blu e senza sezioni, nell'Hub (squadre già iscritte) era il fumetto "coach" del sito. Ora il contenuto,
   il posizionamento e il comportamento stanno qui, lo stile in formato-tooltip.css, e le due pagine collegano solo
   l'elemento che lo fa comparire.
   Le funzioni sono globali (le pagine le chiamano per nome); in Node si usa module.exports, solo per i test.
   ===================================================================== */
(function (radice) {
    'use strict';

    const DIZIONARIO_TERMINI_FORMATO = {
        'custom': 'Custom', 'vgc': 'Official VGC', 'singles': 'Singles', 'doubles': 'Doubles',
        'anything_goes': 'Goose',
        'pokemon': 'Pokémon', 'items': 'Items', 'abilities': 'Abilities', 'moves': 'Moves',
        'species': 'Specific Pokémon', 'duplicates': 'Duplicate Clause', 'total_allowed': 'Total Allowed',
        'same_across_team': 'Same Across Team', 'uber_limit': 'Uber / Legendary Limit',
        'specific_item': 'Specific Item', 'specific_name': 'Specific Name', 'color': 'Color',
        'bst': 'BST', 'type': 'Type', 'is_mega': 'Mega evolutions', 'player_initial': "Player's Initial",
        'equals': '=', 'is': 'Is', 'up_to': 'Max', 'at_least': 'Min', 'exact': 'Exact',
        'unique': 'Unique (No Duplicates)', 'between': 'Between', 'lt': '<', 'gt': '>',
        'lte': '≤', 'gte': '≥',
        'is_legendary': 'Legendary', 'is_mythical': 'Mythical', 'true': 'Allowed',
        'name_starts': 'Name starts with:'
    };

    function umanizzaTermineFormato(valore) {
        if (valore === undefined || valore === null || valore === '') return '';
        if (Array.isArray(valore)) return valore.map(umanizzaTermineFormato).join(', ');
        const chiave = valore.toString().toLowerCase().trim();
        return DIZIONARIO_TERMINI_FORMATO[chiave] || valore.toString();
    }

    function escapeHtmlFormato(testo) {
        return String(testo ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Da regolamenti/ (come lo restituisce Firebase) alla mappa "nome del formato o id → regolamento", in minuscolo
    function costruisciMappaRegolamenti(regolamenti) {
        const mappa = {};
        Object.entries(regolamenti || {}).forEach(([idReg, datiReg]) => {
            if (!datiReg) return;
            mappa[String(idReg).toLowerCase().trim()] = datiReg;
            if (datiReg.categoria) mappa[String(datiReg.categoria).toLowerCase().trim()] = datiReg;
        });
        return mappa;
    }

    // Costruisce l'HTML del riepilogo a partire dal nodo regolamenti/<id>
    function generaRiepilogoFormatoHtml(nomeFormato, dati) {
        const cella = (label, valore, extraClass = '', classeCella = '') => `
        <div class="frt-cell ${classeCella}">
            <small>${label}</small>
            <span class="frt-value ${extraClass}">${escapeHtmlFormato(valore)}</span>
        </div>`;

        let html = `<div class="frt-header"><div class="frt-title">${escapeHtmlFormato(nomeFormato)}</div></div>`;

        if (!dati) {
            return html + `<p class="frt-empty">No configurations found for this format.</p>`;
        }

        // Descrizione
        const descr = (dati.descrizioneBreve || '').trim();
        html += `<div class="frt-section-title">Description / Rules</div>`;
        html += descr
            ? `<p class="frt-desc">${escapeHtmlFormato(descr)}</p>`
            : `<p class="frt-empty">No description provided for this format.</p>`;

        // Griglia dati principali
        let celle = cella('Format Type', umanizzaTermineFormato(dati.strutturaSito || 'custom'));

        if (dati.strutturaSito === 'vgc') {
            if (dati.vgcGen) celle += cella('Generation', `GEN ${dati.vgcGen}`);
            if (dati.vgcFormat) celle += cella('VGC Regulation', dati.vgcFormat);
        } else {
            if (dati.battleStyle) celle += cella('Battle Style', umanizzaTermineFormato(dati.battleStyle));
            if (dati.genRuleValue) {
                const tipoGen = dati.genRuleType ? ` (${umanizzaTermineFormato(dati.genRuleType)})` : '';
                celle += cella('Pokémon Origin', `GEN ${dati.genRuleValue}${tipoGen}`);
            }
            if (dati.baseTier) celle += cella('Max. Tier', dati.baseTier);
        }

        if (dati.showdownFormat && dati.showdownFormat.trim() !== '') {
            celle += cella('Showdown Format', dati.showdownFormat.trim(), 'frt-lower');
        }

        celle += cella(
            'Gen Mechanics',
            dati.generationalMechanics ? 'Enabled' : 'Disabled',
            '',
            dati.generationalMechanics ? 'strong' : 'critical'
        );

        html += `<div class="frt-section"><div class="frt-section-title">Format</div><div class="frt-grid">${celle}</div></div>`;

        // Clausole e restrizioni
        if (dati.restrizioni && Object.keys(dati.restrizioni).length > 0) {
            let righe = '';

            Object.entries(dati.restrizioni).forEach(([categoria, campi]) => {
                Object.entries(campi || {}).forEach(([campo, regola]) => {
                    regola = regola || {};
                    let badge = '';

                    if (regola.mode === 'BANNED') {
                        badge = `<span class="frt-badge banned">Banned</span>`;
                    } else if (regola.mode === 'ALLOWED') {
                        badge = `<span class="frt-badge allowed">Allowed</span>`;
                    } else if (regola.mode === 'PLAYER_INITIAL') {
                        badge = `<span class="frt-badge initial">Player initial</span>`;
                    } else if (regola.mode === 'SAME_ACROSS_TEAM') {
                        badge = `<span class="frt-badge allowed">Same across team</span>`;
                    } else if (regola.mode === 'SPECIFIC') {
                        let dettaglio;
                        if (regola.operator === 'between') {
                            dettaglio = `${regola.min} - ${regola.max}`;
                        } else {
                            const op = umanizzaTermineFormato(regola.operator);
                            const val = umanizzaTermineFormato(regola.value);
                            dettaglio = (op === '=' || !op) ? val : `${op} ${val}`;
                        }
                        badge = `<span class="frt-badge specific">${escapeHtmlFormato(dettaglio)}</span>`;
                    }

                    righe += `
                    <div class="frt-rule">
                        <span>
                            <b>${escapeHtmlFormato(umanizzaTermineFormato(categoria))}</b>
                            <span class="frt-sep">›</span>
                            ${escapeHtmlFormato(umanizzaTermineFormato(campo))}
                        </span>
                        ${badge}
                    </div>`;
                });
            });

            html += `<div class="frt-section"><div class="frt-section-title">Clauses & Restrictions</div><div class="frt-rules">${righe}</div></div>`;
        }

        return html;
    }

    // -----------------------------------------------------
    // Il fumetto (uno solo per pagina) e i suoi collegamenti
    // -----------------------------------------------------
    if (typeof document === 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = { DIZIONARIO_TERMINI_FORMATO, umanizzaTermineFormato, escapeHtmlFormato, costruisciMappaRegolamenti, generaRiepilogoFormatoHtml };
        }
        return;
    }

    let timerMostra = null;
    let timerNascondi = null;

    function getTooltipFormato() {
        let tip = document.getElementById('format-rules-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'format-rules-tooltip';
            tip.className = 'format-rules-tooltip';
            document.body.appendChild(tip);

            // Il mouse può entrare nel tooltip (per scorrere le regole) senza farlo sparire
            tip.addEventListener('mouseenter', () => clearTimeout(timerNascondi));
            tip.addEventListener('mouseleave', () => programmaNascondiTooltipFormato());
            tip.addEventListener('click', (e) => e.stopPropagation());

            // Tap fuori dal tooltip (touch) → chiude
            document.addEventListener('click', () => nascondiTooltipFormato());

            // Scroll della pagina o di una finestra → chiude (ma non lo scroll interno al tooltip)
            window.addEventListener('scroll', (e) => {
                if (e.target !== tip) nascondiTooltipFormato();
            }, true);
        }
        return tip;
    }

    function posizionaTooltipFormato(ancora, tip) {
        const r = ancora.getBoundingClientRect();
        const w = tip.offsetWidth;
        const h = tip.offsetHeight;
        const margine = 14;
        const bordo = 10;

        let left, top;

        if (r.right + margine + w <= window.innerWidth - bordo) {
            left = r.right + margine;                 // a destra
            top = r.top + r.height / 2 - h / 2;
        } else if (r.left - margine - w >= bordo) {
            left = r.left - margine - w;              // a sinistra
            top = r.top + r.height / 2 - h / 2;
        } else {
            left = r.left + r.width / 2 - w / 2;      // schermo stretto: sotto o sopra
            top = (window.innerHeight - r.bottom >= h + margine) ? r.bottom + margine : r.top - margine - h;
        }

        left = Math.max(bordo, Math.min(left, window.innerWidth - w - bordo));
        top = Math.max(bordo, Math.min(top, window.innerHeight - h - bordo));

        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
    }

    function mostraTooltipFormato(ancora, html, chiave) {
        clearTimeout(timerNascondi);
        const tip = getTooltipFormato();
        tip.innerHTML = html;
        tip.scrollTop = 0;
        tip.style.display = 'block';
        tip.dataset.ancora = chiave == null ? '' : String(chiave);
        posizionaTooltipFormato(ancora, tip);
    }

    function programmaNascondiTooltipFormato() {
        clearTimeout(timerNascondi);
        timerNascondi = setTimeout(nascondiTooltipFormato, 180);
    }

    function nascondiTooltipFormato() {
        clearTimeout(timerMostra);
        clearTimeout(timerNascondi);
        const tip = document.getElementById('format-rules-tooltip');
        if (tip) {
            tip.style.display = 'none';
            tip.dataset.ancora = '';
        }
    }

    const giaApertoPer = (chiave) => {
        const tip = document.getElementById('format-rules-tooltip');
        return !!tip && tip.style.display === 'block' && tip.dataset.ancora === String(chiave);
    };

    // Hub: collega il tooltip al rettangolo di un team. Col mouse compare passandoci sopra (dopo un attimo, per non coprire
    // la pagina a chi passa solo per cliccare); su touch, toccando l'icona "i". Il clic sul rettangolo apre la scelta e chiude il fumetto.
    function collegaTooltipFormato(elemento, html, chiave, iconaInfo = null) {
        elemento.addEventListener('pointerenter', (e) => {
            if (e.pointerType !== 'mouse') return;
            clearTimeout(timerMostra);
            clearTimeout(timerNascondi);
            timerMostra = setTimeout(() => mostraTooltipFormato(elemento, html, chiave), 300);
        });

        elemento.addEventListener('pointerleave', (e) => {
            if (e.pointerType !== 'mouse') return;
            clearTimeout(timerMostra);
            programmaNascondiTooltipFormato();
        });

        elemento.addEventListener('click', () => nascondiTooltipFormato());

        if (iconaInfo) {
            iconaInfo.addEventListener('click', (e) => {
                e.stopPropagation(); // non apre la scelta della squadra
                giaApertoPer(chiave) ? nascondiTooltipFormato() : mostraTooltipFormato(elemento, html, chiave);
            });
        }
    }

    // Index: collega il tooltip a una voce della lista dei formati (stesso fumetto; col mouse subito, su touch con un tap)
    function collegaTooltipFormatoVoce(voce, html, chiave) {
        let ultimoPuntatore = 'mouse';

        voce.addEventListener('pointerdown', (e) => { ultimoPuntatore = e.pointerType; });
        voce.addEventListener('pointerenter', (e) => {
            if (e.pointerType === 'mouse') mostraTooltipFormato(voce, html, chiave);
        });
        voce.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'mouse') programmaNascondiTooltipFormato();
        });
        voce.addEventListener('click', (e) => {
            if (ultimoPuntatore === 'mouse') return;
            e.stopPropagation();
            giaApertoPer(chiave) ? nascondiTooltipFormato() : mostraTooltipFormato(voce, html, chiave);
        });
    }

    Object.assign(radice, {
        DIZIONARIO_TERMINI_FORMATO, umanizzaTermineFormato, escapeHtmlFormato, costruisciMappaRegolamenti,
        generaRiepilogoFormatoHtml, getTooltipFormato, posizionaTooltipFormato, mostraTooltipFormato,
        programmaNascondiTooltipFormato, nascondiTooltipFormato, collegaTooltipFormato, collegaTooltipFormatoVoce
    });
})(typeof window !== 'undefined' ? window : globalThis);
