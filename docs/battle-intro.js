// =====================================================
// INTRO "VS" — prima di ogni set del simulatore (CPU, amichevoli, stagioni ufficiali)
//
// Parte dalla schermata a due colori già disegnata dietro il tavolo (style-versus.css, vestiVersus in battle-ui.js) e la mette sopra a tutto:
//   1. le due metà (il colore, il motivo e il nome gigante di ciascun allenatore) scivolano dai lati e si incontrano sulla diagonale nera;
//   2. gli avatar entrano dal loro lato, ognuno con il tag del nome sopra la testa;
//   3. in centro, sulla riga nera, compare "VS" e sotto un tabellone: nelle stagioni match, set e punteggio; contro la CPU il numero della battaglia e la
//      serie; nelle amichevoli (se sono al meglio di più set) set e punteggio;
//   4. la diagonale si apre: le due metà escono ai lati e gli avatar scivolano al loro posto sullo sfondo, esattamente dove stanno ora.
// Un clic, un tocco o Invio / Spazio / Esc la saltano. Non c'è nell'app, in palestra, o con "riduci movimento".
//
// Le parti pure (testi del tabellone, punteggio dello showdown, colore del testo) si provano in Node (test/battle-intro.test.js); il resto disegna con
// il Web Animations API: tutte le animazioni nascono insieme (così si possono fermare e guardare a un istante preciso) e il disegno finale coincide
// con lo sfondo vero, che è sempre rimasto lì sotto.
// =====================================================
(function (radice, fabbrica) {
    const M = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = M;
    else radice.BattleIntro = M;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // I tempi (ms): le metà si incontrano, entrano gli avatar, compare il VS e il tabellone, si tiene un po' perché si legga, poi la diagonale si apre
    const T = {
        entraMeta: 300,
        entraAvatar: 560, ritardoAvatar: 150,
        vs: 380, ritardoVs: 520,
        tabellone: 320, ritardoTabellone: 800,
        apertura: 2300, durataApertura: 720,
        uscitaCentro: 300,
        pausaFine: 60
    };
    T.totale = T.apertura + T.durataApertura + T.pausaFine;
    const CURVE = {
        entra: 'cubic-bezier(.16, .84, .3, 1)',
        rimbalzo: 'cubic-bezier(.2, .9, .25, 1.12)',
        pop: 'cubic-bezier(.2, 1.4, .4, 1)',
        apre: 'cubic-bezier(.65, 0, .35, 1)'
    };
    const INGRANDIMENTO = 1.2;          // gli avatar nell'intro sono più grandi di com'è lo sfondo: tornano a 1 aprendosi
    const VISIBILE = 0.65;              // quanta parte della larghezza di uno sprite è davvero disegnata (il resto è margine trasparente)

    const trat = (a, b) => `${a} – ${b}`;
    const num = n => (Number.isFinite(Number(n)) ? Number(n) : 0);

    // ---------------------------------------------------------------- parti pure
    /**
     * Quello che scrive il tabellone sotto il VS.
     * c: { tipo: 'cpu' | 'amichevole' | 'ufficiale', formato?, match?, matchTotali?, set?, setTotali?, punti?: { sx, dx }, showdown?: { sx, dx } | null,
     *      battaglia?, serie?: { v, p, n } }
     * Ritorna { etichetta, punteggio (o null), righe: [testo] }. sx / dx sono i lati dello schermo (chi gioca sta a sinistra).
     */
    function testiIntro(c) {
        c = c || {};
        const formato = c.formato ? String(c.formato).toUpperCase() : '';
        const con = (righe, extra) => righe.concat(extra ? [extra] : []).filter(Boolean);
        if (c.tipo === 'cpu') {
            const s = c.serie || {};
            const v = num(s.v), p = num(s.p), n = num(s.n);
            const battaglia = c.battaglia || (v + p + n + 1);
            return {
                etichetta: `BATTLE ${battaglia}`,
                punteggio: trat(v, p),
                righe: con([n ? `SERIES SCORE · ${n} ${n === 1 ? 'TIE' : 'TIES'}` : 'SERIES SCORE'], formato)
            };
        }
        const punti = c.punti || { sx: 0, dx: 0 };
        const setRiga = c.setTotali > 1 ? `SET ${c.set || 1}/${c.setTotali}` : '';
        if (c.tipo === 'ufficiale') {
            const sd = c.showdown && (num(c.showdown.sx) + num(c.showdown.dx)) > 0 ? `SHOWDOWN ${trat(num(c.showdown.sx), num(c.showdown.dx))}` : '';
            return {
                etichetta: `MATCH ${c.match || 1}/${c.matchTotali || 3}`,
                punteggio: c.setTotali > 1 ? trat(num(punti.sx), num(punti.dx)) : null,
                righe: con([setRiga, sd], formato)
            };
        }
        // amichevole: una partita sola non ha né set né punteggio da dire
        return {
            etichetta: 'FRIENDLY MATCH',
            punteggio: c.setTotali > 1 ? trat(num(punti.sx), num(punti.dx)) : null,
            righe: con([setRiga], formato)
        };
    }

    /**
     * Quanti match di uno showdown ha vinto ciascuno, prima di quello che si sta per giocare. matches: il nodo "matches" dello showdown
     * ({ match1: { score: "2-1", ... }, ... }); il punteggio è nell'ordine player1 - player2 dello showdown. Ritorna { p1, p2 }.
     */
    function punteggioShowdown(matches, corrente) {
        let p1 = 0, p2 = 0;
        for (const [chiave, m] of Object.entries(matches && typeof matches === 'object' ? matches : {})) {
            const n = /^match(\d+)$/.exec(chiave);
            if (!n || Number(n[1]) >= Number(corrente)) continue;
            const s = /^(\d+)\s*-\s*(\d+)$/.exec(String((m && m.score) || '').trim());
            if (!s) continue;
            if (Number(s[1]) > Number(s[2])) p1++;
            else if (Number(s[2]) > Number(s[1])) p2++;
        }
        return { p1, p2 };
    }

    /**
     * Dove stanno gli avatar mentre si legge il VS e di quanto sono ingranditi. L: larghezza della finestra; larghSx / larghDx: larghezza (px) dei due avatar
     * sullo sfondo. In una finestra larga stanno a un quarto e a tre quarti, ingranditi di INGRANDIMENTO. In una stretta (telefono in verticale, dove sullo
     * sfondo vero i due avatar si sovrappongono) nell'intro si rimpiccioliscono quel tanto che basta per stare uno per lato, interi nella finestra.
     * Ritorna { ingrandimento, riposo: [xSinistra, xDestra] } (le x sono i centri, in px).
     */
    function disposizione(L, larghSx, larghDx) {
        L = num(L) > 0 ? num(L) : 1280;
        const larg = Math.max(num(larghSx), num(larghDx), 1);
        const ingrandimento = Math.max(0.5, Math.min(INGRANDIMENTO, (0.47 * L) / (larg * VISIBILE)));
        const mezza = (larg * VISIBILE * ingrandimento) / 2;
        const dentro = x => Math.min(Math.max(x, mezza + 8), Math.max(L - mezza - 8, mezza + 8));
        return { ingrandimento, riposo: [dentro(L * 0.25), dentro(L * 0.75)] };
    }

    /** "#000" o "#fff": quello che si legge meglio su un colore ("rgb(r, g, b)", "rgba(...)" o "#rrggbb"); nel dubbio nero */
    function testoSu(colore) {
        let r, g, b;
        const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(String(colore || ''));
        const hex = /^#([0-9a-f]{6})$/i.exec(String(colore || '').trim());
        if (rgb) [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
        else if (hex) [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
        else return '#000';
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#000' : '#fff';
    }

    // ---------------------------------------------------------------- disegno
    const pausa = ms => new Promise(ok => setTimeout(ok, ms));

    /** Si può fare? Non nell'app (lì lo sfondo non c'è), non in palestra, non a pagina nascosta, non con "riduci movimento", non senza Web Animations */
    function puoRiprodurre(win) {
        const doc = win && win.document;
        if (!doc || !doc.body || !doc.documentElement) return false;
        if (doc.documentElement.classList.contains('app') || doc.body.classList.contains('palestra')) return false;
        if (doc.hidden) return false;
        if (typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        return typeof (win.Element && win.Element.prototype.animate) === 'function';
    }

    function elemento(doc, tag, classe, testo) {
        const e = doc.createElement(tag);
        if (classe) e.className = classe;
        if (testo != null) e.textContent = testo;
        return e;
    }

    /**
     * Fa partire l'intro. opz: { win, nomi: { sx, dx }, testi: testiIntro(...) }.
     * Ritorna una promessa che si risolve a intro finita (true) o subito (false) se non c'è niente da fare. Se un'intro è già in corso, quella si chiude.
     */
    function riproduci(opz) {
        const win = (opz && opz.win) || (typeof window !== 'undefined' ? window : null);
        if (!puoRiprodurre(win)) return Promise.resolve(false);
        const doc = win.document;
        const sfondo = doc.querySelector('.vs-sfondo:not(.pal-decor)');
        if (!sfondo || !sfondo.querySelector('.vs-lato.vs-sx') || !sfondo.querySelector('.vs-lato.vs-dx')) return Promise.resolve(false);
        if (win.__introVs) win.__introVs.termina(true);
        // gli avatar devono essere già caricati: servono le loro misure (di solito lo sono da un pezzo; al primo set ci può voler un attimo)
        const immagini = Array.from(sfondo.querySelectorAll('.vs-avatar'));
        const pronte = immagini.every(i => i.complete);
        if (pronte) return costruisci(win, opz, sfondo);
        const caricate = immagini.map(i => (i.complete ? Promise.resolve() : new Promise(ok => { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); })));
        return Promise.race([Promise.all(caricate), pausa(1500)]).then(() => costruisci(win, opz, sfondo));
    }

    function costruisci(win, opz, sfondo) {
        const doc = win.document;
        // si può essere finiti in un'altra intro nel frattempo, o la pagina può aver cambiato sfondo
        if (!doc.body.contains(sfondo)) sfondo = doc.querySelector('.vs-sfondo:not(.pal-decor)');
        const realeSx = sfondo && sfondo.querySelector('.vs-lato.vs-sx'), realeDx = sfondo && sfondo.querySelector('.vs-lato.vs-dx');
        if (!realeSx || !realeDx) return Promise.resolve(false);
        if (win.__introVs) win.__introVs.termina(true);

        const L = win.innerWidth || doc.documentElement.clientWidth || 1280;
        const nomi = opz.nomi || {};
        const testi = opz.testi || { etichetta: '', punteggio: null, righe: [] };
        const radice = elemento(doc, 'div', 'vi');
        radice.setAttribute('aria-hidden', 'true');

        const lati = [
            { dir: -1, classe: 'vi-sx', reale: realeSx, nome: nomi.sx },
            { dir: 1, classe: 'vi-dx', reale: realeDx, nome: nomi.dx }
        ].map(s => {
            const avatar = s.reale.querySelector('.vs-avatar');
            const r = avatar ? avatar.getBoundingClientRect() : null;
            const altezza = r ? r.height : 0, larghezza = r ? r.width : 0;
            const finale = () => {
                if (!avatar) return s.dir < 0 ? L * 0.12 : L * 0.88;
                const v = parseFloat(avatar.style.getPropertyValue('--vs-x'));
                if (Number.isFinite(v)) return v;
                const q = avatar.getBoundingClientRect();
                return q.left + q.width / 2;
            };
            return { ...s, avatar, altezza, larghezza, finale };
        });
        // dove stanno mentre si legge il VS e quanto sono grandi (nelle finestre strette di meno, per non sovrapporsi)
        const disp = disposizione(L, lati[0].larghezza, lati[1].larghezza);
        const ingr = disp.ingrandimento;
        lati.forEach((s, i) => { s.riposo = disp.riposo[i]; });

        // le due metà: l'intero lato dello sfondo (colore, motivo, nome gigante) senza l'avatar, che sta sopra
        const metà = lati.map(s => {
            const m = s.reale.cloneNode(true);
            const av = m.querySelector('.vs-avatar');
            if (av) av.remove();
            m.classList.add('vi-meta');
            return m;
        });
        metà.forEach(m => radice.appendChild(m));

        // gli avatar con il tag del nome sopra la testa
        const personaggi = lati.map(s => {
            const colore = win.getComputedStyle(s.reale).backgroundColor;
            const ancora = elemento(doc, 'div', `vi-pg ${s.classe}`);
            ancora.setAttribute('style', s.reale.getAttribute('style') || '');
            ancora.style.left = `${s.riposo}px`;
            const corpo = elemento(doc, 'div', 'vi-corpo');
            corpo.style.scale = String(ingr);
            const tag = elemento(doc, 'div', 'vi-tag', String(s.nome == null ? '' : s.nome).toUpperCase());
            tag.style.background = colore;
            tag.style.color = testoSu(colore);
            corpo.appendChild(tag);
            if (s.avatar) {
                const img = doc.createElement('img');
                img.className = 'vi-avatar';
                img.alt = '';
                img.draggable = false;
                img.src = s.avatar.currentSrc || s.avatar.src;
                const stile = s.avatar.getAttribute('style');       // l'alone (--pal-aura) dell'avatar
                if (stile) img.setAttribute('style', stile);
                img.style.height = `${s.altezza}px`;
                corpo.appendChild(img);
            } else {
                corpo.style.bottom = '36vh';
            }
            ancora.appendChild(corpo);
            radice.appendChild(ancora);
            return { ancora, corpo, tag };
        });

        // il VS sulla riga nera e il tabellone sotto
        const centro = elemento(doc, 'div', 'vi-centro');
        const vs = elemento(doc, 'div', 'vi-vs', 'VS');
        const tabellone = elemento(doc, 'div', 'vi-tabellone');
        if (testi.etichetta) tabellone.appendChild(elemento(doc, 'div', 'vi-et', testi.etichetta));
        if (testi.punteggio) tabellone.appendChild(elemento(doc, 'div', 'vi-pt', testi.punteggio));
        if (testi.righe && testi.righe.length) {
            const righe = elemento(doc, 'div', 'vi-righe');
            testi.righe.forEach(t => righe.appendChild(elemento(doc, 'span', '', t)));
            tabellone.appendChild(righe);
        }
        centro.appendChild(vs);
        if (tabellone.childNodes.length) centro.appendChild(tabellone);
        radice.appendChild(centro);
        const lampo = elemento(doc, 'div', 'vi-lampo');
        radice.appendChild(lampo);
        doc.body.appendChild(radice);
        sfondo.classList.add('vi-in-corso');        // gli avatar veri aspettano sotto: ricompaiono, al loro posto, quando l'intro finisce (altrimenti si vedrebbero doppi)

        // ---- le animazioni: tutte insieme, con i loro ritardi ----
        const animazioni = [];
        const A = (e, keyframes, opzioni) => {
            const a = e.animate(keyframes, { fill: 'both', ...opzioni });
            animazioni.push(a);
            return a;
        };
        const aperte = [];       // le animazioni di apertura degli avatar: il punto d'arrivo si ricontrolla un attimo prima

        // 1. le metà si incontrano (con un piccolo rimbalzo) e c'è un lampo
        const ritardoFuori = '104%';
        A(metà[0], { translate: [`-${ritardoFuori} 0`, '2% 0', '0% 0'] }, { duration: T.entraMeta, easing: CURVE.entra });
        A(metà[1], { translate: [`${ritardoFuori} 0`, '-2% 0', '0% 0'] }, { duration: T.entraMeta, easing: CURVE.entra });
        A(lampo, { opacity: [0, 0.5, 0] }, { duration: 240, delay: T.entraMeta - 40 });
        // i nomi giganti scorrono piano mentre si legge
        metà.forEach((m, i) => {
            const righe = m.querySelector('.vs-scritta');
            if (righe) A(righe, { translate: ['0 0', `${i === 0 ? -3 : 3}vw 0`] }, { duration: T.apertura, easing: 'linear' });
        });
        // 2. gli avatar entrano dal loro lato, ognuno con il suo tag
        personaggi.forEach((p, i) => {
            A(p.ancora, { translate: [`${lati[i].dir * 80}vw 0`, '0px 0'] }, { duration: T.entraAvatar, delay: T.ritardoAvatar, easing: CURVE.rimbalzo });
            A(p.corpo, { scale: [ingr, ingr * 1.06] }, { duration: T.apertura - T.ritardoAvatar - T.entraAvatar, delay: T.ritardoAvatar + T.entraAvatar, easing: 'ease-out' });
        });
        // 3. il VS e il tabellone
        A(vs, { scale: [3.2, 0.9, 1], rotate: ['-16deg', '-3deg', '-4deg'], opacity: [0, 1, 1], offset: [0, 0.62, 1] }, { duration: T.vs, delay: T.ritardoVs, easing: CURVE.pop });
        A(tabellone, { translate: ['0 46px', '0 0'], opacity: [0, 1] }, { duration: T.tabellone, delay: T.ritardoTabellone, easing: CURVE.entra });
        // 4. la diagonale si apre: le metà escono ai lati, il centro e i tag spariscono, gli avatar vanno al loro posto.
        //    (fill 'forwards' e non 'both': prima del loro inizio non devono coprire le animazioni di prima sulla stessa proprietà)
        A(metà[0], { translate: ['0% 0', `-${ritardoFuori} 0`] }, { duration: T.durataApertura, delay: T.apertura, easing: CURVE.apre, fill: 'forwards' });
        A(metà[1], { translate: ['0% 0', `${ritardoFuori} 0`] }, { duration: T.durataApertura, delay: T.apertura, easing: CURVE.apre, fill: 'forwards' });
        A(centro, { opacity: [1, 0], scale: [1, 1.35] }, { duration: T.uscitaCentro, delay: T.apertura, easing: 'ease-in', fill: 'forwards' });
        personaggi.forEach((p, i) => {
            A(p.tag, { opacity: [1, 0], translate: ['0 0', '0 -18px'] }, { duration: T.uscitaCentro, delay: T.apertura, easing: 'ease-in', fill: 'forwards' });
            A(p.corpo, { scale: [ingr * 1.06, 1] }, { duration: T.durataApertura, delay: T.apertura, easing: CURVE.apre, fill: 'forwards' });
            aperte.push(A(p.ancora, { left: [`${lati[i].riposo}px`, `${lati[i].finale()}px`] }, { duration: T.durataApertura, delay: T.apertura, easing: CURVE.apre, fill: 'forwards' }));
        });
        // il tavolo può essersi spostato mentre si leggeva (la scena sotto si è disegnata): il punto d'arrivo si rimisura appena prima di aprire
        const ricontrolla = win.setTimeout(() => {
            aperte.forEach((a, i) => {
                try { a.effect.setKeyframes({ left: [`${lati[i].riposo}px`, `${lati[i].finale()}px`] }); } catch (e) { /* resta com'è */ }
            });
        }, Math.max(0, T.apertura - 60));

        // ---- fine, o salto ----
        let finita = false, chiudi;
        const promessa = new Promise(ok => { chiudi = ok; });
        const scollega = () => {
            doc.removeEventListener('keydown', suTasto, true);
            radice.removeEventListener('pointerdown', suClic);
        };
        const smonta = esito => {
            if (finita) return;
            finita = true;
            win.clearTimeout(ricontrolla);
            win.clearTimeout(sicurezza);
            scollega();
            animazioni.forEach(a => { try { a.cancel(); } catch (e) { /* già fermata */ } });
            sfondo.classList.remove('vi-in-corso');
            if (radice.parentNode) radice.parentNode.removeChild(radice);
            if (win.__introVs && win.__introVs.radice === radice) win.__introVs = null;
            chiudi(esito);
        };
        const termina = subito => {
            if (finita) return;
            if (subito) return smonta(false);
            // saltata: si dissolve in fretta
            animazioni.forEach(a => { try { a.cancel(); } catch (e) { /* già fermata */ } });
            scollega();
            const d = radice.animate({ opacity: [1, 0] }, { duration: 160, fill: 'forwards' });
            d.finished.then(() => smonta(false), () => smonta(false));
        };
        const suClic = e => { e.preventDefault(); termina(false); };
        const suTasto = e => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); termina(false); }
        };
        radice.addEventListener('pointerdown', suClic);
        doc.addEventListener('keydown', suTasto, true);
        const sicurezza = win.setTimeout(() => smonta(true), T.totale + 2500);      // a pagina nascosta i fotogrammi si fermano: si chiude comunque
        const finali = animazioni.map(a => a.finished.catch(() => null));
        Promise.all(finali).then(() => { if (!finita) win.setTimeout(() => smonta(true), T.pausaFine); });

        win.__introVs = { radice, termina };
        return promessa;
    }

    return { T, CURVE, INGRANDIMENTO, VISIBILE, testiIntro, punteggioShowdown, disposizione, testoSu, puoRiprodurre, riproduci };
});
