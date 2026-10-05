// =====================================================
// DIAGRAMMA DELLA PERSONALITÀ — Poké-Tournament
//
// Il diagramma a ragnatela (Kiviat) dei sei assi di personalita.js, disegnato in SVG. Lo usano il profilo (con i numeri sugli assi)
// e la pagina pubblica (più piccolo, solo i nomi). Qui c'è solo la forma: i colori e i caratteri li decide il foglio di stile di
// ogni pagina, sulle classi pers-radar-*. Il testo entra solo come testo (mai HTML).
//
//   PersonalitaGrafico.radar(assi, valori, { piccolo })
//     assi     Personalita.ASSI (nomi e ordine)
//     valori   0-100 per asse (50 = media della lega), oppure null per il diagramma vuoto (personalità ancora bloccata)
//     piccolo  per una carta stretta: più largo che alto, con le etichette più grandi e senza numeri
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(null);
    else radice.PersonalitaGrafico = fabbrica(radice);
})(typeof self !== 'undefined' ? self : this, function (finestra) {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Le due forme: la grandezza del disegno (viewBox), il centro e il raggio (in unità del disegno)
    const FORME = {
        grande:  { larghezza: 300, altezza: 300, cx: 150, cy: 150, raggio: 104, distanza: 16 },
        piccolo: { larghezza: 400, altezza: 272, cx: 200, cy: 134, raggio: 84,  distanza: 12 }
    };

    function svg(doc, tag, attributi, ...figli) {
        const e = doc.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attributi || {})) if (v != null) e.setAttribute(k, String(v));
        for (const f of figli.flat()) if (f != null) e.append(f && f.nodeType ? f : doc.createTextNode(String(f)));
        return e;
    }

    /** Il testo letto da chi non vede il disegno */
    function descrizione(assi, valori) {
        return valori
            ? `Personality diagram: ${assi.map((a, i) => `${a.nome} ${valori[i]}`).join(', ')}. 50 is the league average.`
            : 'Personality diagram, still locked.';
    }

    // documento e Personalita servono solo alle prove in Node: nel browser sono quelli della pagina
    function radar(assi, valori, { piccolo = false, documento, Personalita } = {}) {
        const doc = documento || finestra.document;
        const Pers = Personalita || finestra.Personalita;
        const forma = piccolo ? FORME.piccolo : FORME.grande;
        const { cx, cy, raggio, distanza } = forma;
        const n = assi.length;
        const vertici = lista => Pers.vertici(lista, raggio, cx, cy);
        const punti = lista => lista.map(p => `${p.x},${p.y}`).join(' ');
        const anello = pct => punti(vertici(Array(n).fill(pct)));

        const radiceSvg = svg(doc, 'svg', {
            class: `pers-radar${piccolo ? ' pers-radar-piccolo' : ''}`,
            viewBox: `0 0 ${forma.larghezza} ${forma.altezza}`, role: 'img', 'aria-label': descrizione(assi, valori)
        });
        for (const pct of [25, 75, 100]) radiceSvg.append(svg(doc, 'polygon', { class: 'pers-radar-anello', points: anello(pct) }));
        radiceSvg.append(svg(doc, 'polygon', { class: 'pers-radar-media', points: anello(50) }));
        const esterni = vertici(Array(n).fill(100));
        esterni.forEach(p => radiceSvg.append(svg(doc, 'line', { class: 'pers-radar-asse', x1: cx, y1: cy, x2: p.x, y2: p.y })));
        if (valori) {
            const mie = vertici(valori);
            radiceSvg.append(svg(doc, 'polygon', { class: 'pers-radar-area', points: punti(mie) }));
            mie.forEach(p => radiceSvg.append(svg(doc, 'circle', { class: 'pers-radar-punto', cx: p.x, cy: p.y, r: piccolo ? 4 : 4.5 })));
        }
        // le etichette, fuori dal diagramma (con i numeri sotto, tranne nella forma piccola)
        esterni.forEach((p, i) => {
            const dx = Math.cos(p.angolo), dy = Math.sin(p.angolo);
            const x = cx + (raggio + distanza) * dx;
            const y = cy + (raggio + distanza) * dy + (dy > 0.3 ? (piccolo ? 10 : 8) : dy < -0.3 ? -2 : 4);
            const ancora = dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle';
            radiceSvg.append(svg(doc, 'text', { class: 'pers-radar-et', x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': ancora },
                svg(doc, 'tspan', {}, assi[i].nome.toUpperCase()),
                valori && !piccolo ? svg(doc, 'tspan', { class: 'pers-radar-val', x: x.toFixed(1), dy: '1.15em' }, valori[i]) : null));
        });
        return radiceSvg;
    }

    return { FORME, descrizione, radar };
});
