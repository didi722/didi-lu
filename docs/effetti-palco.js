// =====================================================
// EFFETTI DEL PALCO — animati su canvas (neve, scintille, coriandoli, stelle, temporale, aurora, fuochi d'artificio, bolle, synthwave)
//
// Ogni elemento con data-effetto-palco="palco-…" (la pagina pubblica, le anteprime del negozio, l'intro della palestra) riceve un <canvas> che gli sta davanti. Le particelle
// sono vere: ognuna ha la sua profondità, la sua velocità, il suo sfasamento (il vento soffia a raffiche, i coriandoli girano su se stessi, i razzi salgono e scoppiano...), quindi
// niente "piastrelle" che si ripetono come negli effetti solo-CSS di effetti-pagina.css. Quegli effetti restano come ripiego (se questo file non c'è o il canvas non parte);
// i petali di ciliegio (palco-sakura) restano solo CSS.
//
// Le misure sono in "punti" u = 1/100 dell'altezza dell'elemento (come 1cqh nel CSS); nelle anteprime del negozio, piccole, --ef-u le ingrandisce (3cqh = x3).
// Un solo ciclo requestAnimationFrame muove tutti gli effetti visibili (IntersectionObserver); a schermata nascosta o con "riduci animazioni" non si anima (un solo fotogramma).
//
//   EffettiPalco.EFFETTI            { 'palco-neve': (S) => ({ frame(ctx, dt, t), tracce? }), ... }; S = { w, h, u, tela(w, h) }
//   EffettiPalco.PRESENTI           gli id che sono su canvas
//   EffettiPalco.avvia(elemento)    mette (o toglie) il canvas, secondo il suo data-effetto-palco
//   EffettiPalco.cerca(radice)      lo fa per tutti gli elementi sotto `radice` (parte da sola, e a ogni cambio della pagina)
//
// Funziona nel browser (window.EffettiPalco) e in Node (require): lì si provano le particelle con un finto contesto.
// =====================================================
(function (radice, fabbrica) {
    const M = fabbrica(radice);
    if (typeof module === 'object' && module.exports) module.exports = M;
    else radice.EffettiPalco = M;
    if (M.nelBrowser) M.parti();
})(typeof self !== 'undefined' ? self : this, function (radice) {
    'use strict';

    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = lista => lista[Math.floor(Math.random() * lista.length)];
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const mix = (a, b, k) => a + (b - a) * k;
    const liscio = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
    const TAU = Math.PI * 2;
    const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1).toFixed(3)})`;
    const mixCol = (a, b, k) => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

    /** Un alone morbido (cerchio sfumato) di colore c e raggio r */
    function alone(ctx, x, y, r, c, a) {
        if (r <= 0 || a <= 0) return;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(c, a));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    // =================================================
    // NEVE: fiocchi di tre profondità; i vicini sono grandi, sfocati e lenti a cambiare, i lontani piccoli; il vento va e viene a raffiche
    // =================================================
    function neve(S) {
        const { w, h, u } = S;
        const nuovo = inizio => {
            const d = Math.pow(Math.random(), 0.8);
            return { x: rnd(0, w), y: inizio ? rnd(0, h) : rnd(-8 * u, 0), d, r: (0.32 + d * 1.1) * u, v: (4 + d * 9) * u, ph: rnd(0, TAU), f: rnd(0.5, 1.5), amp: rnd(1, 3) * u * (0.4 + d) };
        };
        const fiocchi = Array.from({ length: clamp(Math.round(w * h / 3600), 36, 150) }, () => nuovo(true));
        fiocchi.sort((a, b) => a.d - b.d);
        return {
            frame(ctx, dt, t) {
                const raffica = Math.max(0, Math.sin(t * 0.11 + 1)) * Math.sin(t * 0.9) * 2.4 * u;
                const vento = Math.sin(t * 0.27) * 2 * u + raffica;
                for (const f of fiocchi) {
                    f.y += f.v * dt;
                    f.x += (vento * (0.35 + f.d) + Math.cos(t * f.f + f.ph) * f.amp) * dt;
                    if (f.y > h + f.r * 3) Object.assign(f, nuovo(false));
                    if (f.x > w + 4 * u) f.x -= w + 8 * u; else if (f.x < -4 * u) f.x += w + 8 * u;
                }
                // la nebbiolina di neve a terra
                const g = ctx.createLinearGradient(0, h * 0.78, 0, h);
                g.addColorStop(0, 'rgba(255,255,255,0)');
                g.addColorStop(1, 'rgba(235,245,255,0.22)');
                ctx.fillStyle = g; ctx.fillRect(0, h * 0.78, w, h * 0.22);
                for (const f of fiocchi) {
                    if (f.d > 0.84) alone(ctx, f.x, f.y, f.r * 2.4, [255, 255, 255], 0.5);
                    else {
                        ctx.fillStyle = `rgba(255,255,255,${(0.4 + f.d * 0.55).toFixed(2)})`;
                        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
                    }
                }
            }
        };
    }

    // =================================================
    // SCINTILLE: braci che salgono dal pavimento, ondeggiano, sfarfallano e si spengono diventando rosse; il calore illumina il fondo
    // =================================================
    function scintille(S) {
        const { w, h, u } = S;
        const nuova = inizio => {
            const vita = rnd(2.8, 6.5);
            return { x: rnd(0, w), y: inizio ? rnd(0, h) : h + rnd(0, 4 * u), vy: -rnd(7, 17) * u, ph: rnd(0, TAU), f: rnd(1.4, 3.6), amp: rnd(1, 4.5) * u, r: rnd(0.45, 1.2) * u, vita, eta: inizio ? rnd(0, vita) : 0, fl: rnd(12, 26) };
        };
        const brace = Array.from({ length: clamp(Math.round(w * h / 3000), 24, 120) }, () => nuova(true));
        const CALDO = [255, 244, 176], ARANCIO = [255, 120, 28], ROSSO = [150, 28, 12];
        return {
            frame(ctx, dt, t) {
                const g = ctx.createLinearGradient(0, h * 0.7, 0, h);
                const pulsa = 0.16 + 0.05 * Math.sin(t * 2.3) + 0.03 * Math.sin(t * 5.1);
                g.addColorStop(0, 'rgba(255,110,30,0)');
                g.addColorStop(1, `rgba(255,100,25,${pulsa.toFixed(3)})`);
                ctx.fillStyle = g; ctx.fillRect(0, h * 0.7, w, h * 0.3);
                ctx.globalCompositeOperation = 'lighter';
                for (const b of brace) {
                    b.eta += dt;
                    if (b.eta >= b.vita) Object.assign(b, nuova(false));
                    const k = b.eta / b.vita;
                    b.y += b.vy * dt * (1 - 0.35 * k);
                    b.x += (Math.sin(t * b.f + b.ph) * b.amp + Math.sin(t * 0.4) * 1.2 * u) * dt;
                    const c = k < 0.45 ? mixCol(CALDO, ARANCIO, k / 0.45) : mixCol(ARANCIO, ROSSO, (k - 0.45) / 0.55);
                    const a = Math.pow(1 - k, 0.8) * (0.62 + 0.38 * Math.sin(t * b.fl + b.ph));
                    const r = b.r * (1 - 0.45 * k);
                    alone(ctx, b.x, b.y, r * 5, c, a * 0.5);
                    ctx.fillStyle = rgba(mixCol(c, [255, 255, 235], 0.45), a);
                    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
            }
        };
    }

    // =================================================
    // CORIANDOLI: pezzetti che girano su se stessi (cambiano luminosità mentre si voltano), con la resistenza dell'aria; ogni tanto un cannoncino ne spara una raffica dai lati
    // =================================================
    function coriandoli(S) {
        const { w, h, u } = S;
        const COLORI = ['#ff4d6d', '#ffd23f', '#3ba8ff', '#3be07a', '#b04dff', '#ff8a1f', '#ffffff', '#ff7bd0'];
        const pezzo = (x, y, vx, vy, raffica) => ({
            x, y, vx, vy, raffica,
            ang: rnd(0, TAU), spin: rnd(-4, 4), ph: rnd(0, TAU), fs: rnd(0.8, 1.8), ff: rnd(4, 9),
            sw: rnd(1.2, 2.4) * u, sh: rnd(0.65, 1.2) * u, col: pick(COLORI), drag: rnd(0.9, 1.7), term: rnd(7, 13) * u
        });
        const lista = [];
        const nBase = clamp(Math.round(w * h / 6000), 14, 70);
        for (let i = 0; i < nBase; i++) lista.push(pezzo(rnd(0, w), rnd(0, h), 0, rnd(4, 10) * u, false));
        let prossimo = rnd(1.2, 2.5), lato = Math.random() < 0.5 ? 0 : 1;
        function spara() {
            const x = lato ? w : 0, dir = lato ? -1 : 1;
            lato = 1 - lato;
            for (let i = 0; i < clamp(Math.round(w / 8), 18, 40); i++) {
                const a = rnd(55, 82) * Math.PI / 180, v = rnd(45, 90) * u;
                lista.push(pezzo(x, h * rnd(0.8, 0.95), Math.cos(a) * v * dir, -Math.sin(a) * v, true));
            }
        }
        return {
            frame(ctx, dt, t) {
                prossimo -= dt;
                if (prossimo <= 0) { spara(); prossimo = rnd(4, 7); }
                for (let i = lista.length - 1; i >= 0; i--) {
                    const p = lista[i];
                    p.vx += (Math.sin(t * p.fs + p.ph) * 3 * u - p.vx) * Math.min(1, dt * p.drag);
                    p.vy += (p.term - p.vy) * Math.min(1, dt * p.drag);
                    p.x += p.vx * dt; p.y += p.vy * dt; p.ang += p.spin * dt;
                    if (p.y > h + 3 * u || p.x < -6 * u || p.x > w + 6 * u) {
                        if (p.raffica) { lista.splice(i, 1); continue; }
                        p.y = -2 * u; p.x = rnd(0, w); p.vx = 0; p.vy = rnd(4, 10) * u;
                    }
                }
                for (const p of lista) {
                    const c = Math.cos(t * p.ff + p.ph);
                    ctx.save();
                    ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(1, c);
                    ctx.globalAlpha = 0.72 + 0.28 * Math.abs(c);
                    ctx.fillStyle = p.col;
                    ctx.fillRect(-p.sw / 2, -p.sh / 2, p.sw, p.sh);
                    ctx.restore();
                }
                ctx.globalAlpha = 1;
            }
        };
    }

    // =================================================
    // STELLE: un cielo che brilla a ritmi diversi, le più grandi con i raggi a croce, che scorre lentissimo; ogni tanto passa una stella cadente
    // =================================================
    function stelle(S) {
        const { w, h, u } = S;
        const COL = [[255, 255, 255], [255, 246, 168], [190, 220, 255], [255, 214, 232]];
        const lista = Array.from({ length: clamp(Math.round(w * h / 1700), 16, 100) }, () => {
            const r = rnd(0.16, 0.52) * u;
            return { x: rnd(0, w), y: rnd(0, h), r, ph: rnd(0, TAU), sp: rnd(0.9, 3.4), col: pick(COL), grande: r > 0.4 };
        });
        let cadente = null, attesa = rnd(1.5, 3.5);
        return {
            frame(ctx, dt, t) {
                ctx.globalCompositeOperation = 'lighter';
                for (const s of lista) {
                    s.x -= 0.7 * u * dt * (0.5 + s.r / u);
                    if (s.x < -4 * u) s.x += w + 8 * u;
                    const a = 0.22 + 0.78 * Math.pow(0.5 + 0.5 * Math.sin(t * s.sp + s.ph), 1.6);
                    alone(ctx, s.x, s.y, s.r * 4.2, s.col, a * 0.4);
                    ctx.fillStyle = rgba(s.col, a);
                    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
                    if (s.grande) {
                        const L = s.r * 7.5 * (0.4 + 0.6 * a);
                        ctx.strokeStyle = rgba(s.col, a * 0.7); ctx.lineWidth = Math.max(0.6, s.r * 0.35);
                        ctx.beginPath(); ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y); ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L); ctx.stroke();
                    }
                }
                attesa -= dt;
                if (!cadente && attesa <= 0) {
                    cadente = { x: rnd(0.4, 1) * w, y: rnd(0, 0.4) * h, vx: -rnd(55, 75) * u, vy: rnd(20, 34) * u, eta: 0, vita: rnd(0.8, 1.2) };
                    attesa = rnd(3, 6.5);
                }
                if (cadente) {
                    const c = cadente;
                    c.eta += dt; c.x += c.vx * dt; c.y += c.vy * dt;
                    const k = c.eta / c.vita, a = Math.sin(clamp(k, 0, 1) * Math.PI);
                    const L = 16 * u, m = Math.hypot(c.vx, c.vy);
                    const tx = c.x - c.vx / m * L, ty = c.y - c.vy / m * L;
                    const g = ctx.createLinearGradient(c.x, c.y, tx, ty);
                    g.addColorStop(0, `rgba(255,255,255,${(a * 0.95).toFixed(3)})`);
                    g.addColorStop(1, 'rgba(160,200,255,0)');
                    ctx.strokeStyle = g; ctx.lineWidth = Math.max(0.8, 0.5 * u); ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tx, ty); ctx.stroke();
                    alone(ctx, c.x, c.y, 2.2 * u, [255, 255, 255], a * 0.7);
                    if (k >= 1) cadente = null;
                }
                ctx.globalCompositeOperation = 'source-over';
            }
        };
    }

    // =================================================
    // TEMPORALE: pioggia obliqua di tre profondità, schizzi a terra, cielo scuro e fulmini veri (ramificati) con il lampo che illumina tutto
    // =================================================
    function temporale(S) {
        const { w, h, u } = S;
        const inclina = 0.27;
        const goccia = inizio => { const d = rnd(0.35, 1); return { x: rnd(-0.25 * w, w), y: inizio ? rnd(0, h) : rnd(-0.3 * h, 0), d, len: (2 + 4.5 * d) * u, v: (55 + 65 * d) * u, a: 0.16 + 0.42 * d, lw: Math.max(0.6, (0.14 + 0.2 * d) * u) }; };
        const gocce = Array.from({ length: clamp(Math.round(w * h / 430), 40, 280) }, () => goccia(true));
        const schizzi = [];
        let fulmine = null, attesa = rnd(2, 4);
        function saetta(x0, y1) {
            const rami = [];
            const ramo = (x, y, ang, lunghezza, spessore) => {
                const pts = [[x, y]];
                let px = x, py = y, fatto = 0;
                while (fatto < lunghezza) {
                    const passo = rnd(3, 6.5) * u;
                    ang += rnd(-0.5, 0.5);
                    px += Math.sin(ang) * passo; py += Math.cos(ang) * passo; fatto += passo;
                    pts.push([px, py]);
                    if (spessore > 0.5 && Math.random() < 0.16 && rami.length < 9) ramo(px, py, ang + rnd(-1, 1) * 0.9 + (Math.random() < 0.5 ? 0.5 : -0.5), lunghezza * 0.35, spessore * 0.5);
                }
                rami.push({ pts, spessore });
            };
            ramo(x0, -2 * u, rnd(-0.18, 0.18), y1 + 2 * u, 1);
            return rami;
        }
        return {
            frame(ctx, dt, t) {
                ctx.fillStyle = 'rgba(14,24,52,0.09)'; ctx.fillRect(0, 0, w, h);
                for (const g of gocce) {
                    g.y += g.v * dt; g.x -= g.v * dt * inclina;
                    if (g.y > h * (0.9 + 0.1 * Math.random()) && g.d > 0.55 && schizzi.length < 70 && g.y < h + 4 * u) schizzi.push({ x: g.x, y: h - rnd(0, 0.06) * h, eta: 0, vita: rnd(0.22, 0.34), d: g.d });
                    if (g.y > h + 3 * u || g.x < -0.3 * w) Object.assign(g, goccia(false), { x: rnd(0, 1.25 * w), y: rnd(-0.2 * h, 0) });
                }
                ctx.lineCap = 'round';
                for (const g of gocce) {
                    ctx.strokeStyle = `rgba(200,222,255,${g.a.toFixed(2)})`; ctx.lineWidth = g.lw;
                    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + g.len * inclina, g.y - g.len); ctx.stroke();
                }
                for (let i = schizzi.length - 1; i >= 0; i--) {
                    const s = schizzi[i];
                    s.eta += dt;
                    if (s.eta >= s.vita) { schizzi.splice(i, 1); continue; }
                    const k = s.eta / s.vita, rx = (0.5 + k * 2.2) * u;
                    ctx.strokeStyle = `rgba(210,230,255,${((1 - k) * 0.45).toFixed(3)})`; ctx.lineWidth = Math.max(0.5, 0.18 * u);
                    ctx.beginPath(); ctx.ellipse(s.x, s.y, rx, rx * 0.32, 0, 0, TAU); ctx.stroke();
                }
                attesa -= dt;
                if (!fulmine && attesa <= 0) { fulmine = { rami: saetta(rnd(0.2, 0.8) * w, rnd(0.5, 0.85) * h), eta: 0 }; attesa = rnd(5, 9); }
                if (fulmine) {
                    const f = fulmine; f.eta += dt;
                    const e = f.eta;
                    const a = e < 0.06 ? 1 : e < 0.11 ? 0.18 : e < 0.2 ? 0.95 : Math.max(0, 0.95 - (e - 0.2) * 2.4);
                    if (a <= 0) fulmine = null;
                    else {
                        ctx.fillStyle = `rgba(225,235,255,${(a * 0.36).toFixed(3)})`; ctx.fillRect(0, 0, w, h);
                        for (const r of f.rami) {
                            ctx.beginPath();
                            r.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
                            ctx.strokeStyle = `rgba(170,195,255,${(a * 0.4).toFixed(3)})`; ctx.lineWidth = 1.7 * u * r.spessore; ctx.stroke();
                            ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; ctx.lineWidth = Math.max(0.8, 0.5 * u * r.spessore); ctx.stroke();
                        }
                    }
                }
            }
        };
    }

    // =================================================
    // AURORA: tendaggi di luce che ondeggiano, con i raggi verticali; i colori scorrono dal verde al viola. Si calcola su una griglia piccola e si stira (è già morbida)
    // =================================================
    function aurora(S) {
        const { w, h } = S;
        const sw = clamp(Math.round(w / 5), 24, 170), sh = clamp(Math.round(h / 5), 16, 110);
        const tela = S.tela(sw, sh);
        const img = tela.ctx.createImageData(sw, sh);
        const VERDE = [60, 255, 160], CIANO = [80, 210, 255], VIOLA = [175, 95, 255];
        const tende = [{ ph: 0.4, base: 0.10, lung: 3.0 }, { ph: 2.7, base: 0.20, lung: 3.8 }, { ph: 5.1, base: 0.30, lung: 4.6 }];
        const colore = x => (x < 0.5 ? mixCol(VERDE, CIANO, x * 2) : mixCol(CIANO, VIOLA, (x - 0.5) * 2));
        return {
            mezzo: 'screen',
            frame(ctx, dt, t) {
                const d = img.data;
                for (let x = 0; x < sw; x++) {
                    const xn = x / (sw - 1);
                    const bordo = liscio(0, 0.12, xn) * liscio(0, 0.12, 1 - xn);
                    const cond = tende.map(k => ({
                        top: k.base + 0.07 * Math.sin(xn * 5 + t * 0.35 + k.ph) + 0.04 * Math.sin(xn * 11 - t * 0.5 + k.ph * 2),
                        raggi: 0.62 + 0.38 * Math.sin(xn * 38 + k.ph * 3 + Math.sin(t * 0.4 + xn * 6) * 2.2),
                        col: colore(clamp(xn + 0.25 * Math.sin(t * 0.18 + k.ph), 0, 1)), lung: k.lung
                    }));
                    for (let y = 0; y < sh; y++) {
                        const yn = y / (sh - 1);
                        let r = 0, g = 0, b = 0, a = 0;
                        for (const c of cond) {
                            const dd = yn - c.top;
                            if (dd <= 0) continue;
                            const k = Math.exp(-dd * c.lung) * liscio(0, 0.05, dd) * c.raggi;
                            r += c.col[0] * k; g += c.col[1] * k; b += c.col[2] * k; a += k;
                        }
                        const i = (y * sw + x) * 4;
                        const m = a > 0 ? 1 / a : 0;
                        d[i] = r * m; d[i + 1] = g * m; d[i + 2] = b * m;
                        d[i + 3] = clamp(a * 0.6, 0, 0.8) * bordo * 255;
                    }
                }
                tela.ctx.putImageData(img, 0, 0);
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(tela.canvas, 0, 0, w, h);
            }
        };
    }

    // =================================================
    // FUOCHI D'ARTIFICIO: un razzo sale con la sua scia e scoppia in una sfera, un anello, un salice o una doppia corona; le scintille cadono, sfarfallano e lasciano una coda
    // =================================================
    function fuochi(S) {
        const { w, h, u } = S;
        const SERIE = [[[255, 210, 63], [255, 77, 109]], [[95, 240, 255], [176, 77, 255]], [[90, 255, 140], [255, 240, 120]], [[255, 140, 60], [255, 230, 120]], [[255, 120, 210], [140, 160, 255]], [[255, 255, 255], [255, 210, 120]]];
        const razzi = [], scintille = [], lampi = [];
        let prossimo = 0.2;
        function scoppia(x, y, serie) {
            const tipo = pick(['sfera', 'sfera', 'anello', 'salice', 'doppio']);
            const n = clamp(Math.round(w / 5), 40, 90) * (tipo === 'doppio' ? 0.8 : 1);
            lampi.push({ x, y, eta: 0, vita: 0.45, col: serie[0] });
            for (let i = 0; i < n; i++) {
                const a = tipo === 'anello' ? (i / n) * TAU : rnd(0, TAU);
                let v = tipo === 'anello' ? rnd(33, 38) : tipo === 'doppio' ? (i % 2 ? rnd(16, 21) : rnd(36, 44)) : rnd(12, 44);
                v *= u;
                scintille.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, col: (tipo === 'doppio' ? (i % 2) : Math.random() < 0.5) ? serie[0] : serie[1], eta: 0, vita: (tipo === 'salice' ? rnd(1.8, 2.8) : rnd(1.1, 1.9)), g: (tipo === 'salice' ? 15 : 10) * u, att: tipo === 'salice' ? 0.992 : 0.975, fl: rnd(18, 36), ph: rnd(0, TAU) });
            }
        }
        return {
            tracce: true,
            frame(ctx, dt, t) {
                // le code: invece di cancellare tutto si schiarisce di poco (il canvas è trasparente: "destination-out")
                ctx.globalCompositeOperation = 'destination-out';
                ctx.fillStyle = `rgba(0,0,0,${clamp(dt * 7, 0.08, 0.5).toFixed(3)})`; ctx.fillRect(0, 0, w, h);
                ctx.globalCompositeOperation = 'lighter';
                prossimo -= dt;
                if (prossimo <= 0 && razzi.length < 3) {
                    razzi.push({ x: rnd(0.15, 0.85) * w, y: h + 2 * u, vy: -rnd(52, 70) * u, quota: rnd(0.14, 0.46) * h, serie: pick(SERIE), vx: rnd(-3, 3) * u });
                    prossimo = rnd(0.7, 1.7);
                }
                for (let i = razzi.length - 1; i >= 0; i--) {
                    const r = razzi[i];
                    r.y += r.vy * dt; r.x += r.vx * dt; r.vy *= 1 - 0.28 * dt;
                    alone(ctx, r.x, r.y, 1.8 * u, [255, 220, 150], 0.9);
                    scintille.push({ x: r.x + rnd(-0.4, 0.4) * u, y: r.y + 1 * u, vx: rnd(-2, 2) * u, vy: rnd(3, 9) * u, col: [255, 190, 110], eta: 0, vita: rnd(0.3, 0.6), g: 0, att: 0.97, fl: 20, ph: 0, piccola: true });
                    if (r.y <= r.quota) { scoppia(r.x, r.y, r.serie); razzi.splice(i, 1); }
                }
                for (let i = lampi.length - 1; i >= 0; i--) {
                    const l = lampi[i]; l.eta += dt;
                    if (l.eta >= l.vita) { lampi.splice(i, 1); continue; }
                    alone(ctx, l.x, l.y, 11 * u * (0.5 + l.eta / l.vita), l.col, 0.4 * (1 - l.eta / l.vita));
                }
                for (let i = scintille.length - 1; i >= 0; i--) {
                    const s = scintille[i];
                    s.eta += dt;
                    if (s.eta >= s.vita) { scintille.splice(i, 1); continue; }
                    s.vy += s.g * dt; s.vx *= Math.pow(s.att, dt * 60); s.vy *= Math.pow(s.att, dt * 60);
                    s.x += s.vx * dt; s.y += s.vy * dt;
                    const k = s.eta / s.vita;
                    const a = (1 - k) * (k > 0.6 ? 0.5 + 0.5 * Math.sin(t * s.fl + s.ph) : 1);
                    const r = (s.piccola ? 0.32 : 0.5) * u * (1 - 0.4 * k);
                    ctx.fillStyle = rgba(mixCol(s.col, [255, 255, 255], (1 - k) * 0.5), a);
                    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.5, r), 0, TAU); ctx.fill();
                }
                ctx.globalCompositeOperation = 'source-over';
            }
        };
    }

    // =================================================
    // BOLLE: bolle di tutte le misure con il bordo iridescente e i riflessi, che salgono dondolando (le piccole più svelte) e ogni tanto scoppiano
    // =================================================
    function bolle(S) {
        const { w, h, u } = S;
        const nuova = inizio => {
            const r = Math.pow(Math.random(), 1.6) * 3.6 * u + 0.8 * u;
            return { x: rnd(0, w), y: inizio ? rnd(0, h) : h + r + rnd(0, 6 * u), r, v: (11 - r / u * 1.8) * u * rnd(0.55, 1) + 2 * u, ph: rnd(0, TAU), f: rnd(0.6, 1.6), amp: rnd(0.8, 2.6) * u, tinta: rnd(0, 360), vita: rnd(0.2, 1), scoppio: 0 };
        };
        const lista = Array.from({ length: clamp(Math.round(w * h / 5200), 9, 60) }, () => nuova(true));
        return {
            frame(ctx, dt, t) {
                for (const b of lista) {
                    if (b.scoppio > 0) { b.scoppio += dt; if (b.scoppio > 0.22) Object.assign(b, nuova(false)); continue; }
                    b.y -= b.v * dt; b.x += Math.cos(t * b.f + b.ph) * b.amp * dt * 1.6;
                    if (b.y < -b.r) Object.assign(b, nuova(false));
                    else if (b.y < h * 0.12 && b.r > 1.8 * u && Math.random() < dt * 0.35) b.scoppio = 0.001;
                }
                for (const b of lista) {
                    if (b.scoppio > 0) {
                        const k = b.scoppio / 0.22;
                        ctx.strokeStyle = `rgba(215,240,255,${((1 - k) * 0.6).toFixed(3)})`; ctx.lineWidth = Math.max(0.6, 0.18 * u);
                        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1 + k * 0.5), 0, TAU); ctx.stroke();
                        continue;
                    }
                    const r = b.r;
                    const g = ctx.createRadialGradient(b.x, b.y, r * 0.55, b.x, b.y, r);
                    g.addColorStop(0, 'rgba(210,240,255,0)');
                    g.addColorStop(0.82, 'rgba(210,240,255,0.14)');
                    g.addColorStop(1, 'rgba(235,250,255,0.7)');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
                    // il bordo iridescente: un arco rosa in alto a destra e uno azzurro in basso a sinistra
                    ctx.lineWidth = Math.max(0.6, r * 0.09);
                    ctx.strokeStyle = `hsla(${(b.tinta + t * 20) % 360},90%,78%,0.55)`;
                    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.93, -0.9, 0.5); ctx.stroke();
                    ctx.strokeStyle = `hsla(${(b.tinta + 160 + t * 20) % 360},90%,78%,0.45)`;
                    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.93, 2.2, 3.7); ctx.stroke();
                    // i riflessi
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.beginPath(); ctx.ellipse(b.x - r * 0.4, b.y - r * 0.42, r * 0.2, r * 0.11, -0.7, 0, TAU); ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.beginPath(); ctx.arc(b.x + r * 0.42, b.y + r * 0.4, r * 0.07, 0, TAU); ctx.fill();
                }
            }
        };
    }

    // =================================================
    // SYNTHWAVE: neutro, senza orizzonte (l'orizzonte del palco cambia con le misure della card): bagliori rosa e azzurri agli angoli, una griglia piatta che scorre,
    // le righe di uno schermo a tubo, una barra di luce che scende e dei segni al neon che salgono
    // =================================================
    function synthwave(S) {
        const { w, h, u } = S;
        const ROSA = [255, 60, 200], AZZURRO = [70, 230, 255];
        const segni = Array.from({ length: clamp(Math.round(w * h / 9000), 5, 24) }, () => ({ x: rnd(0, w), y: rnd(0, h), v: rnd(3, 8) * u, ph: rnd(0, TAU), tipo: Math.random() < 0.5 ? 'croce' : 'rombo', col: Math.random() < 0.5 ? ROSA : AZZURRO, r: rnd(0.5, 1.1) * u }));
        return {
            frame(ctx, dt, t) {
                // i bagliori agli angoli, che respirano
                const r1 = Math.max(w, h) * (0.55 + 0.05 * Math.sin(t * 0.9));
                alone(ctx, 0, 0, r1, ROSA, 0.3);
                alone(ctx, w, h, r1, AZZURRO, 0.3);
                alone(ctx, w, 0, r1 * 0.6, [170, 90, 255], 0.16);
                alone(ctx, 0, h, r1 * 0.6, [170, 90, 255], 0.16);
                // la griglia piatta: sfuma verso l'alto e il basso e scorre piano
                const passo = 9 * u, off = (t * 2.2 * u) % passo;
                ctx.save();
                ctx.lineWidth = Math.max(0.6, 0.2 * u);
                ctx.strokeStyle = 'rgba(70,230,255,0.38)';
                ctx.beginPath();
                for (let x = (-off % passo) - passo; x < w + passo; x += passo) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255,60,200,0.4)';
                ctx.beginPath();
                for (let y = off - passo; y < h + passo; y += passo) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
                ctx.stroke();
                // la griglia svanisce al centro (dove sta l'allenatore) e resta più viva ai bordi
                ctx.globalCompositeOperation = 'destination-out';
                const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.65);
                v.addColorStop(0, 'rgba(0,0,0,0.75)'); v.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
                ctx.restore();
                ctx.globalCompositeOperation = 'source-over';
                // le righe dello schermo
                ctx.fillStyle = 'rgba(0,0,0,0.07)';
                for (let y = 0; y < h; y += 3 * Math.max(1, u * 0.5)) ctx.fillRect(0, y, w, Math.max(1, u * 0.3));
                // i segni al neon che salgono
                ctx.globalCompositeOperation = 'lighter';
                for (const s of segni) {
                    s.y -= s.v * dt;
                    if (s.y < -2 * u) { s.y = h + 2 * u; s.x = rnd(0, w); }
                    const a = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + s.ph));
                    ctx.strokeStyle = rgba(s.col, a); ctx.lineWidth = Math.max(0.8, 0.28 * u);
                    ctx.beginPath();
                    if (s.tipo === 'croce') { ctx.moveTo(s.x - s.r, s.y); ctx.lineTo(s.x + s.r, s.y); ctx.moveTo(s.x, s.y - s.r); ctx.lineTo(s.x, s.y + s.r); }
                    else { ctx.moveTo(s.x, s.y - s.r); ctx.lineTo(s.x + s.r, s.y); ctx.lineTo(s.x, s.y + s.r); ctx.lineTo(s.x - s.r, s.y); ctx.closePath(); }
                    ctx.stroke();
                }
                // la riga di luce che scende
                const yl = ((t * 0.2) % 1.3 - 0.15) * h;
                const l = ctx.createLinearGradient(0, yl - 8 * u, 0, yl + 8 * u);
                l.addColorStop(0, 'rgba(80,240,255,0)'); l.addColorStop(0.5, 'rgba(80,240,255,0.24)'); l.addColorStop(1, 'rgba(80,240,255,0)');
                ctx.fillStyle = l; ctx.fillRect(0, yl - 8 * u, w, 16 * u);
                ctx.globalCompositeOperation = 'source-over';
            }
        };
    }

    const EFFETTI = {
        'palco-neve': neve, 'palco-scintille': scintille, 'palco-coriandoli': coriandoli, 'palco-stelle': stelle, 'palco-temporale': temporale,
        'palco-aurora': aurora, 'palco-fuochi': fuochi, 'palco-bolle': bolle, 'palco-synthwave': synthwave
    };
    const PRESENTI = Object.keys(EFFETTI);

    // =================================================
    // Il browser: il canvas di ogni elemento, un solo ciclo, solo gli elementi visibili
    // =================================================
    const doc = radice.document;
    const nelBrowser = !!(doc && doc.documentElement && typeof radice.requestAnimationFrame === 'function');
    const istanze = new Map();          // elemento -> { id, canvas, ctx, eff, visibile, t, w, h }
    let osservaVista = null, osservaMisura = null, ciclo = 0, ultimo = 0, riduci = false;

    function creaTela(w, h) {
        const c = doc.createElement('canvas');
        c.width = w; c.height = h;
        return { canvas: c, ctx: c.getContext('2d') };
    }

    function misura(el, ist) {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return false;
        const r = el.getBoundingClientRect();
        const zoom = r.width && w ? r.width / w : 1;
        const sc = clamp((radice.devicePixelRatio || 1) * zoom, 1, 2.5);
        let u = h / 100;
        const m = /^([\d.]+)cqh$/.exec((radice.getComputedStyle(el).getPropertyValue('--ef-u') || '').trim());
        if (m) u *= Number(m[1]);
        if (ist.w === w && ist.h === h && ist.sc === sc && ist.eff) return true;
        Object.assign(ist, { w, h, sc, u });
        ist.canvas.width = Math.round(w * sc); ist.canvas.height = Math.round(h * sc);
        ist.ctx.setTransform(sc, 0, 0, sc, 0, 0);
        ist.eff = EFFETTI[ist.id]({ w, h, u, tela: creaTela });
        ist.canvas.style.mixBlendMode = ist.eff.mezzo || '';
        if (riduci) fotogramaFermo(ist);
        return true;
    }

    // con "riduci animazioni": si fa girare la simulazione per qualche secondo e si lascia un solo fotogramma
    function fotogramaFermo(ist) {
        for (let i = 0; i < 70; i++) { ist.t += 0.05; passo(ist, 0.05); }
    }

    function passo(ist, dt) {
        const { ctx, w, h, eff } = ist;
        if (!eff) return;
        if (!eff.tracce) ctx.clearRect(0, 0, w, h);
        eff.frame(ctx, dt, ist.t);
    }

    function gira(ora) {
        ciclo = 0;
        const dt = Math.min(0.05, Math.max(0.001, (ora - ultimo) / 1000 || 0.016));
        ultimo = ora;
        let attivi = 0;
        for (const [el, ist] of istanze) {
            if (!el.isConnected) { ferma(el); continue; }
            if (!ist.visibile || !ist.eff) continue;
            attivi++;
            ist.t += dt;
            try { passo(ist, dt); } catch (e) { ferma(el); }
        }
        if (attivi && !riduci && !doc.hidden) ciclo = radice.requestAnimationFrame(gira);
    }
    function sveglia() {
        if (ciclo || riduci || doc.hidden) return;
        ultimo = radice.performance ? radice.performance.now() : 0;
        ciclo = radice.requestAnimationFrame(gira);
    }

    function ferma(el) {
        const ist = istanze.get(el);
        if (!ist) return;
        istanze.delete(el);
        if (osservaVista) osservaVista.unobserve(el);
        if (osservaMisura) osservaMisura.unobserve(el);
        if (ist.canvas.parentNode) ist.canvas.parentNode.removeChild(ist.canvas);
        el.removeAttribute('data-ef-canvas');
    }

    function avvia(el) {
        const id = el.getAttribute('data-effetto-palco') || '';
        const ist0 = istanze.get(el);
        if (!EFFETTI[id]) { if (ist0) ferma(el); return; }
        if (ist0 && ist0.id === id) return;
        if (ist0) ferma(el);
        const canvas = doc.createElement('canvas');
        canvas.className = 'ef-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;                       // senza canvas restano gli effetti CSS
        el.appendChild(canvas);
        el.setAttribute('data-ef-canvas', '1');
        const ist = { id, canvas, ctx, eff: null, visibile: true, t: rnd(0, 20), w: 0, h: 0 };
        istanze.set(el, ist);
        if (osservaVista) osservaVista.observe(el);
        if (osservaMisura) osservaMisura.observe(el);
        if (misura(el, ist)) sveglia();
    }

    function cerca(base) {
        const r = base || doc;
        if (r.nodeType === 1 && r.hasAttribute && r.hasAttribute('data-effetto-palco')) avvia(r);
        if (r.querySelectorAll) r.querySelectorAll('[data-effetto-palco]').forEach(avvia);
        // gli elementi che hanno perso l'attributo (o non sono più nella pagina)
        for (const [el] of istanze) if (!el.isConnected || !EFFETTI[el.getAttribute('data-effetto-palco') || '']) ferma(el);
    }

    function parti() {
        const mq = radice.matchMedia ? radice.matchMedia('(prefers-reduced-motion: reduce)') : null;
        riduci = !!(mq && mq.matches);
        if (mq && mq.addEventListener) mq.addEventListener('change', e => { riduci = e.matches; if (!riduci) sveglia(); });
        if (typeof radice.IntersectionObserver === 'function') {
            osservaVista = new radice.IntersectionObserver(voci => {
                for (const v of voci) { const ist = istanze.get(v.target); if (ist) ist.visibile = v.isIntersecting; }
                sveglia();
            });
        }
        if (typeof radice.ResizeObserver === 'function') {
            osservaMisura = new radice.ResizeObserver(voci => {
                for (const v of voci) { const ist = istanze.get(v.target); if (ist) misura(v.target, ist); }
                sveglia();
            });
        }
        doc.addEventListener('visibilitychange', sveglia);
        const avviaTutto = () => {
            cerca(doc);
            if (typeof radice.MutationObserver === 'function') {
                let attesa = false;
                new radice.MutationObserver(() => { if (!attesa) { attesa = true; radice.requestAnimationFrame(() => { attesa = false; cerca(doc); }); } })
                    .observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-effetto-palco'] });
            }
        };
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', avviaTutto); else avviaTutto();
    }

    return { EFFETTI, PRESENTI, avvia, cerca, nelBrowser, parti, ferma };
});
