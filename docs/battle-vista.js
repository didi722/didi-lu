// =====================================================
// VISTA DEL SIMULATORE — due scelte che si fanno dentro la battaglia, ricordate in questo browser
//
//   1. IL COLORE DEI NEUTRI. I neutri del simulatore sono la carta (il bianco delle schede e dei pannelli), la crema (la fascia dei comandi) e l'inchiostro (bordi, ombre,
//      testi e cornice dello schermo). Si sceglie un colore e i neutri prendono quella tinta: carta e crema diventano toni chiarissimi di quel colore, l'inchiostro un nero che
//      ne ha un velo. Restano sempre chiari i chiari e scuro lo scuro, quindi il testo si legge qualunque colore si scelga. Si scrive su <html> con le tre variabili del tema
//      (--nb-carta, --nb-tip-bg, --nb-ink): così seguono anche i tooltip, le note del team e i badge. Senza scelta valgono quelli del tema del giocatore (temi.css).
//   2. LA CRONACA DI SHOWDOWN. La fascia a destra con il testo della partita si può nascondere: html[data-cronaca="nascosta"]. Il tavolo si accorcia di una colonna e il resto
//      si riaccentra da solo (style-battle.css / battle-vista.css, e battle-layout.js che misura di nuovo).
//
// Nell'app (html.app) non c'è niente di questo: lo stile è quello dell'app. Funzioni pure (colori, memoria) provate in test/battle-vista.test.js; il resto è il collegamento
// ai due tasti nei servizi della pagina (#btn-cronaca, #btn-colori) e al pannello dei colori (#pannello-colori).
// =====================================================
(function (radice, fabbrica) {
    const M = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = M;
    else {
        radice.BattleVista = M;
        if (radice.document) M.avvia(radice);
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CHIAVE_COLORE = 'simNeutri';      // "#rrggbb" oppure niente (i neutri del tema)
    const CHIAVE_CRONACA = 'simCronaca';    // 'nascosta' oppure niente (visibile)

    // Le tinte proposte (il colore è quello da cui si ricavano i neutri); "Classic" toglie la scelta e lascia quelli del tema
    const TINTE = [
        { id: 'sky', nome: 'Sky', colore: '#4a90e2' },
        { id: 'mint', nome: 'Mint', colore: '#2fbf7f' },
        { id: 'lilac', nome: 'Lilac', colore: '#8f6fe0' },
        { id: 'rose', nome: 'Rose', colore: '#e0568a' },
        { id: 'sun', nome: 'Sun', colore: '#e8b923' },
        { id: 'peach', nome: 'Peach', colore: '#f08a4b' },
        { id: 'slate', nome: 'Slate', colore: '#6b7a8f' },
        { id: 'stone', nome: 'Stone', colore: '#8a8478' }
    ];

    // ---- colori ----
    /** "#rrggbb" (o "#rgb") in minuscolo, altrimenti null */
    function normalizzaColore(c) {
        if (typeof c !== 'string') return null;
        const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
        if (!m) return null;
        const h = m[1].toLowerCase();
        return '#' + (h.length === 3 ? h.replace(/./g, x => x + x) : h);
    }

    /** [tinta 0-360, saturazione 0-1, luminosità 0-1] di un "#rrggbb" */
    function hslDa(hex) {
        const n = parseInt(hex.slice(1), 16);
        const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
        if (d === 0) return [0, 0, l];
        const s = d / (1 - Math.abs(2 * l - 1));
        let h;
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return [(h * 60 + 360) % 360, s, l];
    }

    /** "#rrggbb" da tinta (0-360), saturazione e luminosità (0-1) */
    function hexDa(h, s, l) {
        const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) [r, g, b] = [c, x, 0];
        else if (h < 120) [r, g, b] = [x, c, 0];
        else if (h < 180) [r, g, b] = [0, c, x];
        else if (h < 240) [r, g, b] = [0, x, c];
        else if (h < 300) [r, g, b] = [x, 0, c];
        else [r, g, b] = [c, 0, x];
        const v = u => Math.max(0, Math.min(255, Math.round((u + m) * 255))).toString(16).padStart(2, '0');
        return '#' + v(r) + v(g) + v(b);
    }

    /**
     * I tre neutri che nascono da un colore: { carta, crema, ink } ("#rrggbb"), oppure null se non è un colore.
     * Luminosità fisse (carta 94%, crema 90%, inchiostro 8%): chiari e scuri restano tali, cambia solo la tinta; un grigio dà neutri grigi.
     */
    function neutriDa(colore) {
        const c = normalizzaColore(colore);
        if (!c) return null;
        const [h, s] = hslDa(c);
        return {
            carta: hexDa(h, 0.7 * s, 0.94),
            crema: hexDa(h, 0.75 * s, 0.90),
            ink: hexDa(h, 0.4 * s, 0.08)
        };
    }

    // ---- memoria del browser (può non esserci, o lanciare: si ignora e basta) ----
    function memoria(radice) { try { return radice.localStorage || null; } catch (e) { return null; } }
    function legge(mem, chiave) { try { return mem ? mem.getItem(chiave) : null; } catch (e) { return null; } }
    function scrive(mem, chiave, valore) {
        try { if (mem) { if (valore == null) mem.removeItem(chiave); else mem.setItem(chiave, valore); } } catch (e) { /* si resta com'è */ }
    }

    /** Le scelte ricordate: { colore: '#rrggbb' | null, cronaca: 'visibile' | 'nascosta' } */
    function leggiScelte(mem) {
        return {
            colore: normalizzaColore(legge(mem, CHIAVE_COLORE)),
            cronaca: legge(mem, CHIAVE_CRONACA) === 'nascosta' ? 'nascosta' : 'visibile'
        };
    }

    // ---- applicazione alla pagina ----
    const inApp = doc => !!(doc && doc.documentElement && doc.documentElement.classList && doc.documentElement.classList.contains('app'));

    /** Scrive (o toglie) i neutri su <html>. Ritorna i neutri applicati o null. */
    function applicaColore(radice, colore) {
        const doc = radice.document;
        if (!doc || !doc.documentElement || inApp(doc)) return null;
        const stile = doc.documentElement.style;
        const n = neutriDa(colore);
        if (n) {
            stile.setProperty('--nb-carta', n.carta);
            stile.setProperty('--nb-tip-bg', n.crema);
            stile.setProperty('--nb-ink', n.ink);
        } else {
            stile.removeProperty('--nb-carta');
            stile.removeProperty('--nb-tip-bg');
            stile.removeProperty('--nb-ink');
        }
        return n;
    }

    /** Mostra o nasconde la cronaca (attributo su <html>) */
    function applicaCronaca(radice, stato) {
        const doc = radice.document;
        if (!doc || !doc.documentElement || inApp(doc)) return;
        if (stato === 'nascosta') doc.documentElement.setAttribute('data-cronaca', 'nascosta');
        else doc.documentElement.removeAttribute('data-cronaca');
    }

    const stato = { colore: null, cronaca: 'visibile' };

    /** All'apertura della pagina: subito le scelte ricordate (prima del primo disegno), poi il collegamento ai tasti */
    function avvia(radice) {
        const s = leggiScelte(memoria(radice));
        stato.colore = s.colore;
        stato.cronaca = s.cronaca;
        applicaColore(radice, stato.colore);
        applicaCronaca(radice, stato.cronaca);
        const doc = radice.document;
        const parti = () => monta(radice);
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', parti);
        else parti();
    }

    // ---- i tasti e il pannello ----
    function el(doc, tag, attributi, figli) {
        const e = doc.createElement(tag);
        Object.keys(attributi || {}).forEach(k => e.setAttribute(k, attributi[k]));
        (figli || []).forEach(f => e.appendChild(typeof f === 'string' ? doc.createTextNode(f) : f));
        return e;
    }

    // Il fumetto dei title (tooltip.js) toglie il title del tasto sotto il mouse e lo tiene in data-tip-titolo, per rimetterlo quando il mouse se ne va: il testo nuovo va
    // dove sta ora, altrimenti tornerebbe quello vecchio. E dopo un clic il fumetto si chiude (non resta a coprire il pannello né a dire il contrario di com'è adesso).
    function scriviTitolo(e, testo) {
        e.setAttribute('aria-label', testo);
        e.setAttribute(e.getAttribute('data-tip-titolo') !== null ? 'data-tip-titolo' : 'title', testo);
    }
    function chiudiFumetto(radice, e) {
        try { if (radice.MouseEvent && e.dispatchEvent) e.dispatchEvent(new radice.MouseEvent('mouseout', { bubbles: true })); } catch (err) { /* resta com'è */ }
    }

    function monta(radice) {
        const doc = radice.document;
        if (!doc || inApp(doc)) return;
        const tastoCronaca = doc.getElementById('btn-cronaca');
        const tastoColori = doc.getElementById('btn-colori');
        const pannello = doc.getElementById('pannello-colori');
        const mem = memoria(radice);

        // ---- la cronaca ----
        const segnaCronaca = () => {
            if (!tastoCronaca) return;
            const visibile = stato.cronaca !== 'nascosta';
            tastoCronaca.setAttribute('aria-pressed', visibile ? 'true' : 'false');
            scriviTitolo(tastoCronaca, visibile ? 'Hide the battle log' : 'Show the battle log');
        };
        if (tastoCronaca) {
            tastoCronaca.addEventListener('click', () => {
                stato.cronaca = stato.cronaca === 'nascosta' ? 'visibile' : 'nascosta';
                scrive(mem, CHIAVE_CRONACA, stato.cronaca === 'nascosta' ? 'nascosta' : null);
                applicaCronaca(radice, stato.cronaca);
                segnaCronaca();
                chiudiFumetto(radice, tastoCronaca);
            });
            segnaCronaca();
        }

        // ---- il colore dei neutri ----
        if (!tastoColori || !pannello) return;
        const lista = el(doc, 'div', { class: 'vc-lista', role: 'radiogroup', 'aria-label': 'Colour of the neutrals' });
        const voci = [{ id: 'classic', nome: 'Classic', colore: null }].concat(TINTE).map(t => {
            const n = neutriDa(t.colore);
            const b = el(doc, 'button', { type: 'button', class: 'vc-tinta', role: 'radio', 'aria-checked': 'false', 'aria-label': t.nome, 'data-colore': t.colore || '' }, [
                el(doc, 'span', { class: 'vc-campione', style: n ? `--vc-carta:${n.carta};--vc-crema:${n.crema};--vc-ink:${n.ink}` : '' }),
                el(doc, 'span', { class: 'vc-nome' }, [t.nome])
            ]);
            lista.appendChild(b);
            return b;
        });
        const libero = el(doc, 'input', { type: 'color', class: 'vc-libero', id: 'vc-libero', value: '#4a90e2', 'aria-label': 'Pick any colour' });
        const rigaLibera = el(doc, 'label', { class: 'vc-riga-libera', for: 'vc-libero' }, [el(doc, 'span', {}, ['Any colour']), libero]);
        pannello.textContent = '';
        pannello.appendChild(el(doc, 'p', { class: 'vc-titolo' }, ['Colour of the neutrals']));
        pannello.appendChild(el(doc, 'p', { class: 'vc-nota' }, ['Tints the whites and blacks of the simulator: panels, borders and text.']));
        pannello.appendChild(lista);
        pannello.appendChild(rigaLibera);

        const segnaColore = () => {
            voci.forEach(b => {
                const c = normalizzaColore(b.getAttribute('data-colore'));
                const si = (c || null) === (stato.colore || null);
                b.setAttribute('aria-checked', si ? 'true' : 'false');
                b.classList.toggle('scelta', si);
            });
            if (stato.colore) libero.value = stato.colore;
        };
        const scegli = colore => {
            stato.colore = normalizzaColore(colore);
            scrive(mem, CHIAVE_COLORE, stato.colore);
            applicaColore(radice, stato.colore);
            segnaColore();
        };
        lista.addEventListener('click', e => {
            const b = e.target.closest && e.target.closest('.vc-tinta');
            if (b) scegli(b.getAttribute('data-colore') || null);
        });
        libero.addEventListener('input', () => scegli(libero.value));
        segnaColore();

        const apri = si => {
            pannello.hidden = !si;
            tastoColori.setAttribute('aria-expanded', si ? 'true' : 'false');
            tastoColori.classList.toggle('aperto', si);
            if (si) chiudiFumetto(radice, tastoColori);
        };
        tastoColori.addEventListener('click', e => { e.stopPropagation(); apri(pannello.hidden); });
        pannello.addEventListener('click', e => e.stopPropagation());
        doc.addEventListener('click', () => { if (!pannello.hidden) apri(false); });
        doc.addEventListener('keydown', e => { if (e.key === 'Escape' && !pannello.hidden) { apri(false); tastoColori.focus(); } });
    }

    return { TINTE, CHIAVE_COLORE, CHIAVE_CRONACA, normalizzaColore, hslDa, hexDa, neutriDa, leggiScelte, applicaColore, applicaCronaca, avvia, monta };
});
