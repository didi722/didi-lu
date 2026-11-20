// =====================================================
// ENTRATE NELLA SCHERMATA VS — cosmetici del negozio (cosmetici.js, tipo "entrata"): come arriva un allenatore
//
// Prima di ogni set (battle-intro.js) i due avatar entrano dal loro lato e si fermano al loro posto: chi ha comprato un'entrata, nel momento in cui il suo avatar arriva, ha un effetto
// in più: una raffica di scintille, una nuvola di fumo, un'onda d'urto, un fulmine, una Poké Ball, le fiamme, un disturbo di segnale. L'effetto lavora attorno all'avatar (a un'altezza
// `h` in pixel) con il Web Animations API, e a volte lo nasconde finché non "appare" (fumo, Poké Ball, glitch).
//
//   EntrateVs.ELENCO                         gli id che esistono
//   EntrateVs.anteprima(box, id, avatar)     una scenetta che si ripete in un riquadro (il negozio); ritorna la funzione che la ferma
//   EntrateVs.suona(id, c)                   la fa partire; c = { doc, ancora, corpo, img, dir, h, A, t0 }:
//        ancora  il punto d'ancoraggio dell'avatar (largo 0, alto 0, sul bordo basso: i pezzi dell'effetto si mettono lì, in pixel dal piede dell'avatar, y verso l'alto)
//        corpo   il contenitore dell'avatar (position: absolute) dove stanno le sagome sovrapposte; img l'avatar
//        dir     -1 a sinistra, 1 a destra; h l'altezza dell'avatar com'è a schermo
//        A       (elemento, keyframes, opzioni) => animazione: l'intro registra le sue per poterle fermare; t0 il momento (ms) in cui l'avatar arriva
//      ritorna { durata (ms), pulisci() }
//
// Funziona nel browser (window.EntrateVs) e in Node (require): lì si prova con un finto documento.
// =====================================================
(function (radice, fabbrica) {
    const M = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = M;
    else radice.EntrateVs = M;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const rnd = (a, b) => a + Math.random() * (b - a);
    const TAU = Math.PI * 2;
    const px = n => `${Math.round(n * 10) / 10}px`;
    const STELLA = 'polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%)';
    const SBALZO = 'cubic-bezier(.2, .9, .25, 1.15)';
    const ESCE = 'cubic-bezier(.2, .8, .3, 1)';
    // una sagoma tutta di un colore: nero, poi grigio (invert parziale) e sepia, che si porta al colore con saturate e hue-rotate (da bianco puro non verrebbe un colore)
    const FILTRO = {
        oro: 'brightness(0) invert(.85) sepia(1) saturate(6) hue-rotate(-5deg)',
        bianco: 'brightness(0) invert(1)',
        arancio: 'brightness(0) invert(.55) sepia(1) saturate(9) hue-rotate(-25deg)',
        rosso: 'brightness(0) invert(.5) sepia(1) saturate(14) hue-rotate(-50deg)',
        ciano: 'brightness(0) invert(.6) sepia(1) saturate(10) hue-rotate(150deg)'
    };

    /** Un blocco assoluto: `css` sono le proprietà (camelCase) */
    function blocco(doc, padre, css, tipo) {
        const e = doc.createElement(tipo || 'div');
        e.className = 'vi-fx';
        Object.assign(e.style, { position: 'absolute', pointerEvents: 'none' }, css);
        padre.appendChild(e);
        return e;
    }
    /** Un blocco centrato in (x, y) (y verso l'alto dal piede), largo l e alto a */
    const centrato = (doc, padre, x, y, l, a, css) => blocco(doc, padre, { left: px(x - l / 2), bottom: px(y - a / 2), width: px(l), height: px(a), ...css });

    let contatoreSvg = 0;
    /**
     * Un ensō tracciato a pennello (il cerchio zen): non una linea di spessore fisso ma la sagoma di un tratto vero. Parte spesso, con il peso del pennello che si posa, si assottiglia
     * girando e non si chiude (il cerchio resta aperto, com'è giusto), con le setole che si staccano in fondo; i bordi sono irregolari come inchiostro su carta (feTurbulence). Si traccia
     * con una maschera a tratteggio che avanza lungo il cerchio.
     * Ritorna { disegno (da animare in opacità), maschera (il cerchio della maschera: si anima strokeDashoffset da `lunghezza` a 0), lunghezza }. Il disegno sta in `padre` ed è centrato a metà altezza.
     */
    function ensoPennello(doc, padre, h, t0) {
        const NS = 'http://www.w3.org/2000/svg';
        const el = (tag, attr) => { const e = doc.createElementNS(NS, tag); for (const k of Object.keys(attr || {})) e.setAttribute(k, String(attr[k])); return e; };
        const id = `ev-enso-${++contatoreSvg}`;
        const d = h * 1.5, raggio = h * 0.6, spessore = h * 0.085, a0 = -2.25, arco = TAU * 0.93;
        const svg = el('svg', { class: 'vi-fx', viewBox: `${-d / 2} ${-d / 2} ${d} ${d}` });
        Object.assign(svg.style, { position: 'absolute', pointerEvents: 'none', left: px(-d / 2), bottom: px(h * 0.52 - d / 2), width: px(d), height: px(d), overflow: 'visible' });
        const defs = el('defs');
        // i bordi irregolari
        const filtro = el('filter', { id: `${id}-f`, x: '-10%', y: '-10%', width: '120%', height: '120%' });
        filtro.appendChild(el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.05', numOctaves: '3', seed: String(1 + (contatoreSvg % 9)), result: 'n' }));
        filtro.appendChild(el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: String(Math.max(1.5, h * 0.018)), xChannelSelector: 'R', yChannelSelector: 'G' }));
        defs.appendChild(filtro);
        // la maschera: un cerchio spesso che si "riempie" nel verso del tratto
        const circ = TAU * raggio;
        const maschera = el('mask', { id: `${id}-m`, maskUnits: 'userSpaceOnUse', x: -d / 2, y: -d / 2, width: d, height: d });
        const cerchioM = el('circle', { r: raggio, cx: 0, cy: 0, fill: 'none', stroke: '#fff', 'stroke-width': spessore * 4, 'stroke-dasharray': `${circ} ${circ}`, 'stroke-dashoffset': circ, transform: `rotate(${(a0 * 180) / Math.PI})` });
        maschera.appendChild(cerchioM);
        defs.appendChild(maschera);
        svg.appendChild(defs);
        // il corpo del tratto: due bordi (fuori e dentro) con lo spessore che cala e un lieve ondeggiare
        const N = 96, fuori = [], dentro = [];
        for (let i = 0; i <= N; i++) {
            const f = i / N, a = a0 + f * arco;
            const peso = f < 0.05 ? 0.78 + f * 4.4 : 1 - 0.8 * Math.pow((f - 0.05) / 0.95, 1.25);      // la pressione iniziale, poi sempre più leggero
            const t = spessore * Math.max(0.08, peso) * (1 + 0.1 * Math.sin(f * 21 + 0.7));
            const r = raggio * (1 + 0.035 * Math.sin(f * 7.3 + 1.2) + 0.05 * f);                       // il cerchio non si chiude esatto: finisce un po' più largo
            fuori.push([Math.cos(a) * (r + t / 2), Math.sin(a) * (r + t / 2)]);
            dentro.push([Math.cos(a) * (r - t / 2), Math.sin(a) * (r - t / 2)]);
        }
        const punti = fuori.concat(dentro.reverse()).map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`);
        const gruppo = el('g', { filter: `url(#${id}-f)` });
        gruppo.appendChild(el('path', { d: `M${punti.join(' L')} Z`, fill: '#16122b', 'fill-opacity': '0.92' }));
        // le setole: strisce sottili lungo il tratto che si staccano e finiscono più in là del corpo, dove il pennello si è asciugato
        for (let i = 0; i < 9; i++) {
            const f0 = rnd(0.02, 0.5), f1 = Math.min(1.03, rnd(0.78, 1.08)), scost = rnd(-0.38, 0.38) * spessore * 0.9;
            const pts = [];
            for (let k = 0; k <= 28; k++) {
                const f = f0 + ((f1 - f0) * k) / 28, a = a0 + f * arco, r = raggio * (1 + 0.035 * Math.sin(f * 7.3 + 1.2) + 0.05 * f) + scost * (1 - 0.7 * f);
                pts.push(`${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`);
            }
            gruppo.appendChild(el('path', { d: `M${pts.join(' L')}`, fill: 'none', stroke: '#16122b', 'stroke-opacity': String(rnd(0.35, 0.75).toFixed(2)), 'stroke-width': String(Math.max(0.7, spessore * rnd(0.05, 0.12))), 'stroke-linecap': 'round' }));
        }
        const involucro = el('g', { mask: `url(#${id}-m)` });
        involucro.appendChild(gruppo);
        svg.appendChild(involucro);
        padre.appendChild(svg);
        return { disegno: svg, maschera: cerchioM, lunghezza: circ };
    }

    const EFFETTI = {
        // una raffica di stelline dorate dal petto, un alone caldo e un lampo dorato sulla sagoma
        'entrata-scintille'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            const alone = centrato(doc, L, 0, h * 0.5, h * 1.7, h * 1.7, { borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,232,130,.9), rgba(255,200,60,.35) 45%, transparent 70%)' });
            A(alone, { scale: [0.2, 1.1], opacity: [0, 0.9, 0] }, { duration: 720, delay: t0 - 80, easing: ESCE });
            for (let i = 0; i < 20; i++) {
                const ang = rnd(0, TAU), r = rnd(0.45, 1.2) * h, s = rnd(0.07, 0.17) * h;
                const e = centrato(doc, L, 0, h * 0.5, s, s, { background: i % 3 ? '#ffe36b' : '#fff7c2', clipPath: STELLA });
                A(e, { translate: ['0px 0px', `${px(Math.cos(ang) * r)} ${px(-Math.sin(ang) * r)}`], scale: [0, 1, 0], rotate: ['0deg', `${Math.round(rnd(-220, 220))}deg`], opacity: [1, 1, 0] },
                    { duration: rnd(650, 1050), delay: t0 - 60 + rnd(0, 160), easing: ESCE });
            }
            A(c.sagoma(FILTRO.oro), { opacity: [0, 0.9, 0] }, { duration: 460, delay: t0 - 40 });
        },

        // una nuvola di fumo: l'avatar è nascosto, poi compare dal fumo che si apre
        'entrata-fumo'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            const totale = t0 + 380;
            A(c.img, { opacity: [0, 0, 1], offset: [0, (t0 - 40) / totale, 1] }, { duration: totale, easing: 'linear' });
            for (let i = 0; i < 12; i++) {
                const d = rnd(0.42, 0.8) * h, x = rnd(-0.5, 0.5) * h, y = rnd(0.02, 0.55) * h, grigio = Math.round(rnd(190, 245));
                const e = centrato(doc, L, x, y, d, d, { borderRadius: '50%', background: `radial-gradient(circle at 40% 35%, rgb(${grigio},${grigio},${grigio}), rgba(${grigio - 40},${grigio - 40},${grigio - 30},.85) 62%, transparent 72%)`, filter: 'blur(1.5px)' });
                A(e, { scale: [0.25, 1.15, 1.5], opacity: [0, 0.95, 0], translate: ['0px 0px', `${px(x * 0.5)} ${px(-h * 0.15)}`, `${px(x * 0.9)} ${px(-h * 0.32)}`] },
                    { duration: rnd(950, 1300), delay: Math.max(0, t0 - 300 + rnd(0, 260)), easing: 'ease-out' });
            }
        },

        // tre onde d'urto sul pavimento e la polvere; l'avatar si schiaccia atterrando
        'entrata-onda'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            for (let i = 0; i < 3; i++) {
                const e = centrato(doc, L, 0, h * 0.04, h * 1.3, h * 0.34, { borderRadius: '50%', border: `${Math.max(2, Math.round(h * 0.022))}px solid ${i === 0 ? '#fff' : '#ffd54a'}`, boxSizing: 'border-box' });
                A(e, { scale: [0.15, 1.8], opacity: [0, 0.95, 0] }, { duration: 760, delay: t0 - 20 + i * 130, easing: 'ease-out' });
            }
            for (let i = 0; i < 10; i++) {
                const lato = i % 2 ? 1 : -1, d = rnd(0.12, 0.26) * h, e = centrato(doc, L, lato * rnd(0.05, 0.2) * h, d * 0.4, d, d, { borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,240,240,.9), rgba(200,200,200,.5) 60%, transparent 72%)' });
                A(e, { translate: ['0px 0px', `${px(lato * rnd(0.5, 1.1) * h)} ${px(-rnd(0.02, 0.14) * h)}`], scale: [0.4, 1.3], opacity: [0, 0.9, 0] }, { duration: rnd(600, 900), delay: t0 + rnd(0, 120), easing: 'ease-out' });
            }
            c.img.style.transformOrigin = '50% 100%';
            A(c.img, { scale: ['1 1', '1.16 0.84', '0.95 1.06', '1 1'] }, { duration: 460, delay: t0 - 20, easing: 'ease-out' });
        },

        // un fulmine dall'alto, un lampo bianco e una sagoma che si accende
        'entrata-fulmine'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            const alto = h * 2.6, larg = h * 0.7;
            const punti = [];
            for (let k = 0; k <= 14; k++) punti.push([k === 14 ? 0 : rnd(-0.16, 0.16) * h * (1 - k / 16), -alto + (alto * k) / 14]);
            const pt = punti.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
            const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', `${-larg / 2} ${-alto} ${larg} ${alto}`);
            svg.setAttribute('class', 'vi-fx');
            Object.assign(svg.style, { position: 'absolute', pointerEvents: 'none', left: px(-larg / 2), bottom: '0px', width: px(larg), height: px(alto), overflow: 'visible' });
            for (const [colore, spessore] of [['rgba(255,225,80,.75)', 0.085], ['#fff', 0.03]]) {
                const poly = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                poly.setAttribute('points', pt); poly.setAttribute('fill', 'none'); poly.setAttribute('stroke', colore);
                poly.setAttribute('stroke-width', String(Math.max(2, h * spessore))); poly.setAttribute('stroke-linejoin', 'round'); poly.setAttribute('stroke-linecap', 'round');
                svg.appendChild(poly);
            }
            L.appendChild(svg);
            A(svg, { opacity: [0, 1, 0.15, 1, 0.3, 0], easing: 'steps(1)' }, { duration: 440, delay: Math.max(0, t0 - 140), easing: 'linear' });
            const lampo = centrato(doc, L, 0, h * 0.35, h * 2, h * 2, { borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,230,.95), rgba(255,240,120,.4) 40%, transparent 68%)' });
            A(lampo, { scale: [0.2, 1.1], opacity: [0, 1, 0] }, { duration: 480, delay: Math.max(0, t0 - 60), easing: ESCE });
            A(c.sagoma(FILTRO.bianco), { opacity: [0, 1, 0, 0.8, 0], easing: 'steps(1)' }, { duration: 420, delay: Math.max(0, t0 - 40), easing: 'linear' });
        },

        // una Poké Ball cade, trema e si apre: dal lampo esce l'avatar, prima una sagoma bianca
        'entrata-pokeball'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            const d = h * 0.36, bordo = px(Math.max(2, h * 0.014));
            const palla = centrato(doc, L, 0, h * 0.62, d, d, { borderRadius: '50%', border: `${bordo} solid #151515`, boxSizing: 'border-box', background: 'linear-gradient(180deg, #e8231f 0 45%, #151515 45% 55%, #f6f6f6 55% 100%)' });
            blocco(doc, palla, { left: '50%', top: '50%', width: px(d * 0.3), height: px(d * 0.3), margin: `${px(-d * 0.15)} 0 0 ${px(-d * 0.15)}`, borderRadius: '50%', background: '#fff', border: `${bordo} solid #151515`, boxSizing: 'border-box' });
            const arriva = Math.max(0, t0 - 520);
            A(palla, { translate: [`0px ${px(-h * 1.3)}`, '0px 0px'], rotate: ['-540deg', '0deg'], opacity: [0, 1, 1] }, { duration: Math.min(520, t0), delay: arriva, easing: SBALZO });
            A(palla, { rotate: ['0deg', '-16deg', '16deg', '-9deg', '0deg'] }, { duration: 300, delay: t0, easing: 'ease-in-out' });
            A(palla, { scale: [1, 1.35], opacity: [1, 0] }, { duration: 200, delay: t0 + 320, easing: 'ease-out' });
            const lampo = centrato(doc, L, 0, h * 0.55, h * 1.9, h * 1.9, { borderRadius: '50%', background: 'radial-gradient(circle, #fff, rgba(255,255,255,.55) 38%, transparent 68%)' });
            A(lampo, { scale: [0.2, 1.1], opacity: [0, 1, 0] }, { duration: 560, delay: t0 + 320, easing: ESCE });
            A(c.img, { opacity: [0, 1] }, { duration: 120, delay: t0 + 340, easing: 'linear' });
            A(c.sagoma(FILTRO.bianco), { opacity: [0, 1, 0] , offset: [0, 0.01, 1] }, { duration: 560, delay: t0 + 340, easing: 'ease-out' });
        },

        // fiamme che salgono attorno ai piedi e una sagoma arancione che si spegne
        'entrata-fiamma'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            const base = centrato(doc, L, 0, h * 0.04, h * 1.2, h * 0.3, { borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,150,30,.85), rgba(255,80,20,.35) 55%, transparent 72%)' });
            A(base, { scale: [0.3, 1.1, 0.9], opacity: [0, 1, 0] }, { duration: 1000, delay: t0 - 100, easing: 'ease-out' });
            for (let i = 0; i < 16; i++) {
                const l = rnd(0.14, 0.24) * h, a = l * rnd(1.8, 2.4), x = rnd(-0.5, 0.5) * h;
                const e = centrato(doc, L, x, a * 0.5, l, a, { borderRadius: '50% 50% 50% 50% / 62% 62% 38% 38%', background: 'radial-gradient(ellipse at 50% 72%, #fff3a0 0 18%, #ffa11f 46%, #e8330a 76%, transparent 80%)' });
                A(e, { translate: ['0px 0px', `${px(rnd(-0.08, 0.08) * h)} ${px(-rnd(0.5, 1) * h)}`], scale: ['0.5 0.5', '1 1.3', '0.2 0.4'], opacity: [0, 1, 0] }, { duration: rnd(750, 1100), delay: Math.max(0, t0 - 140 + rnd(0, 380)), easing: 'ease-out' });
            }
            A(c.sagoma(FILTRO.arancio), { opacity: [0, 0.95, 0] }, { duration: 560, delay: t0 - 60, easing: 'ease-out' });
        },

        // un disturbo di segnale: l'avatar sfarfalla, rosso e azzurro scivolano di lato e righe orizzontali lo tagliano
        'entrata-glitch'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            const inizio = Math.max(0, t0 - 160);
            A(c.img, { opacity: [0, 1, 0, 1, 0, 1, 1, 0, 1], offset: [0, 0.12, 0.24, 0.36, 0.48, 0.58, 0.7, 0.8, 1], easing: 'steps(1)' }, { duration: 560, delay: inizio, easing: 'linear' });
            for (const [filtro, versi] of [[FILTRO.rosso, ['0 0', '-9% 0', '7% 2%', '-5% -2%', '8% 0', '0 0']], [FILTRO.ciano, ['0 0', '8% 0', '-7% -2%', '5% 2%', '-8% 0', '0 0']]]) {
                const s = c.sagoma(filtro);
                s.style.mixBlendMode = 'screen';
                A(s, { translate: versi, opacity: [0.85, 0.85, 0.85, 0.85, 0.85, 0], easing: 'steps(1)' }, { duration: 560, delay: inizio, easing: 'linear' });
            }
            for (let i = 0; i < 6; i++) {
                const a = Math.max(2, h * rnd(0.02, 0.05));
                const e = centrato(doc, L, rnd(-0.1, 0.1) * h, rnd(0.05, 0.95) * h, h * rnd(0.9, 1.4), a, { background: i % 2 ? '#7ff3ff' : '#fff' });
                A(e, { opacity: [0, 1, 0, 1, 0], easing: 'steps(1)' }, { duration: rnd(260, 420), delay: inizio + rnd(0, 220), easing: 'linear' });
            }
        },

        // un fascio di luce dall'alto: l'avatar compare dentro, tra pulviscolo che sale
        'entrata-spotlight'(c) {
            const { doc, h, t0, A } = c, L = c.strato(true);
            const totale = t0 + 300;
            A(c.img, { opacity: [0, 0, 1], offset: [0, (t0 - 80) / totale, 1] }, { duration: totale, easing: 'linear' });
            const l = h * 1.25;
            const fascio = blocco(doc, L, { left: px(-l / 2), bottom: '0px', width: px(l), height: px(h * 2.6), clipPath: 'polygon(36% 0, 64% 0, 100% 100%, 0 100%)', background: 'linear-gradient(180deg, rgba(255,255,235,.15), rgba(255,250,205,.7) 70%, rgba(255,255,255,.85))', transformOrigin: '50% 100%' });
            A(fascio, { opacity: [0, 0.95, 0.8, 0], scale: ['1 0.2', '1 1', '1 1', '1 1'], offset: [0, 0.18, 0.7, 1] }, { duration: 1300, delay: Math.max(0, t0 - 380), easing: 'ease-out' });
            const pozza = centrato(doc, L, 0, h * 0.03, h * 1.1, h * 0.26, { borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(255,250,205,.95), rgba(255,235,150,.4) 55%, transparent 72%)' });
            A(pozza, { scale: [0.2, 1], opacity: [0, 1, 0.7, 0], offset: [0, 0.2, 0.7, 1] }, { duration: 1300, delay: Math.max(0, t0 - 380), easing: 'ease-out' });
            for (let i = 0; i < 14; i++) {
                const d = rnd(0.015, 0.035) * h, x = rnd(-0.35, 0.35) * h;
                const m = centrato(doc, L, x, rnd(0.05, 0.4) * h, d, d, { borderRadius: '50%', background: 'rgba(255,255,230,.9)' });
                A(m, { translate: ['0px 0px', `${px(rnd(-0.08, 0.08) * h)} ${px(-rnd(0.5, 1.1) * h)}`], opacity: [0, 0.9, 0] }, { duration: rnd(900, 1400), delay: Math.max(0, t0 - 250 + rnd(0, 300)), easing: 'ease-out' });
            }
            A(c.sagoma(FILTRO.bianco), { opacity: [0, 0.8, 0] }, { duration: 420, delay: Math.max(0, t0 - 60), easing: 'ease-out' });
        },

        // tre immagini residue che inseguono l'avatar dal lato da cui arriva e si fondono con lui
        'entrata-immagini'(c) {
            const { h, t0, A } = c, dir = c.dir;
            const vie = [[1.7, 0.18, 'drop-shadow(0 0 5px rgba(110,200,255,.95)) saturate(1.6) brightness(1.3)'], [1.15, 0.3, 'drop-shadow(0 0 5px rgba(170,120,255,.95)) saturate(1.6) brightness(1.2)'], [0.6, 0.45, 'drop-shadow(0 0 5px rgba(255,120,200,.95)) saturate(1.6) brightness(1.1)']];
            vie.forEach(([distanza, alfa, filtro], i) => {
                const s = c.sagoma(filtro);
                A(s, { translate: [`${px(dir * distanza * h)} 0px`, `${px(dir * distanza * h * 0.55)} 0px`, '0px 0px'], opacity: [0, alfa * 2, alfa, 0], offset: [0, 0.3, 0.7, 1] }, { duration: 760, delay: Math.max(0, t0 - 560 + i * 40), easing: 'ease-out' });
            });
            const flash = c.sagoma(FILTRO.ciano);
            A(flash, { opacity: [0, 0.8, 0] }, { duration: 360, delay: Math.max(0, t0 - 40), easing: 'ease-out' });
        },

        // un vortice di petali di ciliegio che si stringe attorno all'avatar, che ne esce
        'entrata-sakura'(c) {
            const { doc, h, t0, A } = c, L = c.strato();
            const totale = t0 + 420;
            A(c.img, { opacity: [0, 0, 1], offset: [0, t0 / totale, 1] }, { duration: totale, easing: 'linear' });
            const ROSA = ['#ffb7d0', '#ffd0e0', '#ff9fc0', '#ffc2d8', '#fff0f5'];
            for (let i = 0; i < 30; i++) {
                const a0 = rnd(0, TAU), giri = rnd(1.1, 1.9), r0 = rnd(0.7, 1.25) * h, r1 = rnd(0.05, 0.3) * h, quota = rnd(0.2, 0.9) * h, passi = 6;
                const punti = [], giro = [];
                for (let k = 0; k <= passi; k++) {
                    const f = k / passi, a = a0 + f * giri * TAU, r = r0 + (r1 - r0) * f;
                    punti.push(`${px(Math.cos(a) * r)} ${px(-(quota * (1 - f * 0.35) + Math.sin(a) * r * 0.25))}`);
                    giro.push(`${Math.round(f * rnd(300, 700))}deg`);
                }
                const lung = rnd(0.07, 0.12) * h;
                const e = centrato(doc, L, 0, 0, lung, lung * 0.6, { borderRadius: '70% 30% 70% 30%', background: ROSA[i % ROSA.length] });
                A(e, { translate: punti, rotate: giro, opacity: [0, 1, 1, 1, 1, 1, 0] }, { duration: rnd(1000, 1500), delay: Math.max(0, t0 - 650 + rnd(0, 380)), easing: 'ease-in-out' });
            }
            const alone = centrato(doc, L, 0, h * 0.5, h * 1.5, h * 1.5, { borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,235,245,.8), rgba(255,183,208,.3) 45%, transparent 70%)' });
            A(alone, { scale: [0.3, 1.1], opacity: [0, 0.9, 0] }, { duration: 700, delay: t0 - 120, easing: 'ease-out' });
        },

        // un cerchio ensō tracciato con il pennello, un loto che sboccia dietro di lui e un'aureola dorata; lui compare nella luce
        'entrata-zen'(c) {
            const { doc, h, t0, A } = c, D = c.strato(true);
            const totale = t0 + 420;
            A(c.img, { opacity: [0, 0, 1], offset: [0, t0 / totale, 1] }, { duration: totale, easing: 'linear' });
            // l'aureola dietro
            const aureola = centrato(doc, D, 0, h * 0.52, h * 1.5, h * 1.5, { borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,226,130,.85), rgba(255,200,80,.35) 48%, transparent 70%)' });
            A(aureola, { scale: [0.3, 1], opacity: [0, 1, 0.55, 0], offset: [0, 0.25, 0.7, 1] }, { duration: 1500, delay: Math.max(0, t0 - 380), easing: 'ease-out' });
            // il loto: petali a ventaglio dietro i piedi
            const N = 9;
            for (let i = 0; i < N; i++) {
                const ang = (-78 + (156 * i) / (N - 1)), l = h * 0.2, a = h * (0.5 - Math.abs(ang) / 400);
                const p = blocco(doc, D, { left: px(-l / 2), bottom: px(h * 0.04), width: px(l), height: px(a), borderRadius: '50% 50% 50% 50% / 80% 80% 20% 20%', background: i % 2 ? 'linear-gradient(0deg, #ffe3ef, #ff9fc6)' : 'linear-gradient(0deg, #fff5fa, #ffb7d6)', transformOrigin: '50% 100%', border: `${px(Math.max(1, h * 0.008))} solid rgba(255,255,255,.7)`, boxSizing: 'border-box' });
                A(p, { rotate: [`${ang * 0.3}deg`, `${ang}deg`], scale: ['0.1 0.1', '1 1'], opacity: [0, 1, 1, 0], offset: [0, 0.35, 0.8, 1] }, { duration: 1300, delay: Math.max(0, t0 - 340 + Math.abs(i - (N - 1) / 2) * 50), easing: 'cubic-bezier(.2,.9,.3,1.15)' });
            }
            // l'ensō dietro di lui: un vero tratto di pennello (vedi ensoPennello), che si traccia e poi svanisce
            const enso = ensoPennello(doc, D, h, c.t0);
            A(enso.disegno, { opacity: [0, 1, 1, 0], offset: [0, 0.05, 0.72, 1] }, { duration: 1700, delay: Math.max(0, t0 - 460), easing: 'linear' });
            A(enso.maschera, { strokeDashoffset: [`${enso.lunghezza}`, '0'] }, { duration: 820, delay: Math.max(0, t0 - 440), easing: 'cubic-bezier(.45,.15,.3,1)' });
            A(c.sagoma(FILTRO.oro), { opacity: [0, 0.85, 0] }, { duration: 560, delay: t0 - 20, easing: 'ease-out' });
        }
    };
    const ELENCO = Object.keys(EFFETTI);

    function suona(id, o) {
        const f = EFFETTI[id];
        const vuoto = { durata: 0, pulisci() {} };
        if (!f || !o || !o.doc || !o.ancora || !o.corpo || !o.img || !(o.h > 0) || typeof o.A !== 'function') return vuoto;
        const creati = [], animazioni = [];
        const c = {
            doc: o.doc, img: o.img, dir: o.dir || -1, h: o.h, t0: Number.isFinite(o.t0) ? o.t0 : 700,
            A: (e, keyframes, opzioni) => { const a = o.A(e, keyframes, opzioni); animazioni.push(a); return a; },
            /** lo strato dei pezzi, sul piede dell'avatar (davanti a lui, o dietro con `dietro`) */
            strato(dietro) {
                const s = blocco(o.doc, o.ancora, { left: '0px', bottom: '0px', width: '0px', height: '0px', zIndex: dietro ? '-1' : '4', overflow: 'visible' });
                creati.push(s);
                return s;
            },
            /** una copia dell'avatar sopra di lui, tutta di un colore (filtro): serve per i lampi */
            sagoma(filtro) {
                const s = o.img.cloneNode(false);
                s.className = `${o.img.className || ''} vi-sagoma`.trim();
                Object.assign(s.style, { position: 'absolute', left: '0px', right: '0px', bottom: '0px', margin: '0 auto', pointerEvents: 'none', filter: filtro });
                o.corpo.appendChild(s);
                creati.push(s);
                return s;
            }
        };
        try { f(c); } catch (e) { /* l'entrata è un di più: se non parte, l'intro va avanti */ }
        return {
            durata: c.t0 + 1500,
            pulisci() { for (const a of animazioni) { try { a.cancel(); } catch (e) { /* già finita */ } } for (const e of creati) { if (e.remove) e.remove(); } }
        };
    }

    /**
     * Una scenetta di prova (il negozio): l'avatar su un fondo a due colori e l'entrata che si ripete, finché il riquadro sta nella pagina.
     * `box` è il riquadro (position: relative, overflow: hidden); `avatar` l'indirizzo dell'immagine. Ritorna la funzione che la ferma. Serve battle-intro.css (.vi-pg, .vi-corpo, .vi-avatar).
     */
    function anteprima(box, id, avatar) {
        const doc = box && box.ownerDocument;
        if (!doc || !EFFETTI[id] || typeof box.animate !== 'function') return () => {};
        if (box.__fermaEntrata) box.__fermaEntrata();        // se c'era già una scenetta in questo riquadro, si ferma
        const h = Math.max(24, Math.round((box.clientHeight || 56) * 0.72));
        box.textContent = '';
        const ancora = doc.createElement('div');
        ancora.className = 'vi-pg vi-sx';
        ancora.style.left = '50%';
        ancora.style.bottom = '3px';
        const corpo = doc.createElement('div');
        corpo.className = 'vi-corpo';
        const img = doc.createElement('img');
        img.className = 'vi-avatar';
        img.alt = '';
        img.src = avatar || 'immagini/magikarp.png';
        img.style.height = `${h}px`;
        corpo.appendChild(img);
        ancora.appendChild(corpo);
        box.appendChild(ancora);
        let attivo = true, timer = 0, corrente = null;
        const giro = () => {
            if (!attivo || !box.isConnected) return;
            if (corrente) corrente.pulisci();
            corrente = suona(id, { doc, ancora, corpo, img, dir: -1, h, t0: 250, A: (e, k, o) => e.animate(k, { fill: 'both', ...o }) });
            timer = setTimeout(giro, corrente.durata + 500);
        };
        giro();
        box.__fermaEntrata = () => { attivo = false; clearTimeout(timer); if (corrente) corrente.pulisci(); box.__fermaEntrata = null; };
        return box.__fermaEntrata;
    }

    return { ELENCO, suona, anteprima };
});
