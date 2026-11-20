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
            /** lo strato dei pezzi, sul piede dell'avatar */
            strato() {
                const s = blocco(o.doc, o.ancora, { left: '0px', bottom: '0px', width: '0px', height: '0px', zIndex: '4', overflow: 'visible' });
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
