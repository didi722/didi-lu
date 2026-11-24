// =====================================================
// INTRO "VS" (senza la scritta: al centro il punteggio) — prima di ogni set del simulatore (CPU, amichevoli, stagioni ufficiali)
//
// Parte dalla schermata a due colori già disegnata dietro il tavolo (style-versus.css, vestiVersus in battle-ui.js) e la mette sopra a tutto:
//   1. le due metà (il colore, il motivo e il nome gigante di ciascun allenatore) scivolano dai lati e si incontrano sulla diagonale nera;
//   2. gli avatar entrano dal loro lato, ognuno con il tag del nome sopra la testa;
//   3. in centro, sulla riga nera, compare il punteggio (niente scritta "VS": una targa scura con le due cifre) e sotto un tabellone: nelle stagioni match, set e punteggio; contro la CPU il numero della battaglia e la
//      serie; nelle amichevoli (se sono al meglio di più set) set e punteggio;
//   4. la diagonale si apre: le due metà escono ai lati e gli avatar scivolano al loro posto sullo sfondo, esattamente dove stanno ora.
// Parte prima che la partita sia pronta e ne copre i caricamenti: la diagonale si apre solo quando la pagina lo dice (`attesa`), non prima del tempo fisso e non oltre
// T.attesaMax. Nel frattempo il punteggio pulsa piano, gli avatar ondeggiano e una riga dice cosa si sta aspettando.
// Chi ha comprato un'entrata nello Shop ha un effetto in più quando il suo avatar arriva (entrate-vs.js).
// Un clic, un tocco o Invio / Spazio / Esc la saltano (non nei primi istanti). Non c'è nell'app o con "riduci movimento".
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
        cifra: 360, ritardoCifre: 760, scarto: 110,       // le cifre della targa (poco dopo che è arrivata), una dopo l'altra
        tabellone: 320, ritardoTabellone: 800,
        apertura: 2300, durataApertura: 720,
        uscitaCentro: 300,
        pausaFine: 60,
        attesaMax: 12000,         // se la partita non è pronta entro tanto, la diagonale si apre lo stesso
        protezione: 350           // nei primi istanti un clic o un tasto non la salta (chi ha appena premuto "Ready" non deve chiuderla per sbaglio)
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
     * c: { tipo: 'cpu' | 'amichevole' | 'ufficiale' | 'palestra', formato?, nome?, tappa?, tappe?, vantaggio?, match?, matchTotali?, set?, setTotali?, punti?: { sx, dx }, showdown?: { sx, dx } | null,
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
        if (c.tipo === 'palestra') {
            // una palestra: capopalestra e compagno, niente sfidante; si dice la tappa, di chi è, il vantaggio di campo e il formato
            const gym = c.nome ? `${String(c.nome).toUpperCase()}'S GYM` : '';
            const tappe = num(c.tappe) || 0;
            return {
                etichetta: tappe > 1 ? `STAGE ${num(c.tappa) || 1}/${tappe}` : 'GYM BATTLE',
                punteggio: null,
                righe: con([gym, c.vantaggio ? `EDGE: ${String(c.vantaggio).toUpperCase()}` : ''], formato)
            };
        }
        const punti = c.punti || { sx: 0, dx: 0 };
        const setRiga = c.setTotali > 1 ? `SET ${c.set || 1}/${c.setTotali}` : '';
        if (c.tipo === 'ufficiale') {
            const sd = c.showdown ? `MATCH SCORE ${trat(num(c.showdown.sx), num(c.showdown.dx))}` : '';       // sempre, anche 0 – 0: match, punteggio dei match, set e punteggio dei set
            return {
                etichetta: `MATCH ${c.match || 1}/${c.matchTotali || 3}`,
                punteggio: trat(num(punti.sx), num(punti.dx)),
                righe: con([setRiga, sd], formato)
            };
        }
        // amichevole: il punteggio (dei set) sta sempre al centro, anche se è una partita sola (0 – 0)
        return {
            etichetta: 'FRIENDLY MATCH',
            punteggio: trat(num(punti.sx), num(punti.dx)),
            righe: con([setRiga], formato)
        };
    }

    /** "2 – 1" → ["2", "1"]; qualunque altra cosa → null. Il punteggio arriva già scritto (testiIntro): per disegnarlo a cifre separate si rilegge */
    function dividiPunteggio(testo) {
        const m = /^\s*(\d+)\s*[–-]\s*(\d+)\s*$/.exec(String(testo == null ? '' : testo));
        return m ? [m[1], m[2]] : null;
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

    /** Fra quanti ms deve cominciare l'apertura, se la partita è pronta quando ne sono passati `trascorsi` dall'inizio: mai prima del tempo fisso, subito se è già passato */
    function ritardoApertura(trascorsi) {
        const t = Number(trascorsi);
        return Math.max(0, T.apertura - (Number.isFinite(t) && t > 0 ? t : 0));
    }

    // ---------------------------------------------------------------- disegno
    const pausa = ms => new Promise(ok => setTimeout(ok, ms));

    /** Si può fare? Non nell'app (lì lo sfondo non c'è), non a pagina nascosta, non con "riduci movimento", non senza Web Animations */
    function puoRiprodurre(win) {
        const doc = win && win.document;
        if (!doc || !doc.body || !doc.documentElement) return false;
        if (doc.documentElement.classList.contains('app')) return false;
        if (doc.hidden) return false;
        if (typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
        return typeof (win.Element && win.Element.prototype.animate) === 'function';
    }

    /** Toglie la copertura scura di prima dell'intro (battle.html, classe vs-copre su <html>): l'intro la sostituisce, o non ci sarà e si deve vedere la pagina */
    function togliCopertura(win) {
        try { (win || (typeof window !== 'undefined' ? window : null)).document.documentElement.classList.remove('vs-copre'); } catch (e) { /* niente copertura */ }
    }

    /** Rimette la copertura scura (rivincita, "un altro team"): da subito, prima che la partita nuova si prepari e il simulatore si veda. Come quella di battle.html: mai nell'app né con "riduci movimento"; si toglie da sola dopo 15 secondi */
    function mettiCopertura(win) {
        try {
            const w = win || (typeof window !== 'undefined' ? window : null);
            if (!puoRiprodurre(w)) return false;
            w.document.documentElement.classList.add('vs-copre');
            w.setTimeout(() => togliCopertura(w), 15000);
            return true;
        } catch (e) { return false; }
    }

    function elemento(doc, tag, classe, testo) {
        const e = doc.createElement(tag);
        if (classe) e.className = classe;
        if (testo != null) e.textContent = testo;
        return e;
    }

    /**
     * Fa partire l'intro. opz: { win, nomi: { sx, dx }, testi: testiIntro(...), attesa?, attesaMax?, stato? }.
     * `attesa` è una promessa: finché non si risolve (la partita non è ancora pronta, la pagina sta caricando) l'intro resta com'è, con il punteggio che pulsa e una
     * riga "Getting ready…" (`stato`, o `win.__introVs.stato(testo)` per cambiarla), poi la diagonale si apre. Non si apre mai prima del tempo fisso (T.apertura)
     * né oltre `attesaMax`. Senza `attesa` si apre al tempo fisso.
     * Ritorna una promessa che si risolve a intro finita (true) o subito (false) se non c'è niente da fare. Se un'intro è già in corso, quella si chiude.
     */
    function riproduci(opz) {
        const win = (opz && opz.win) || (typeof window !== 'undefined' ? window : null);
        if (!puoRiprodurre(win)) return Promise.resolve(false);
        const doc = win.document;
        // lo sfondo "sfida" (due metà con i loro avatar) o, in palestra, i lati dati da fuori: { sfondo, lati: [{ reale, avatar, specchia }, ...] }
        const sfondo = opz.sfondo || doc.querySelector('.vs-sfondo:not(.pal-decor)');
        const dati = opz.lati || null;
        if (dati) { if (!sfondo || dati.length < 2 || !dati[0].reale || !dati[1].reale) return Promise.resolve(false); }
        else if (!sfondo || !sfondo.querySelector('.vs-lato.vs-sx') || !sfondo.querySelector('.vs-lato.vs-dx')) return Promise.resolve(false);
        if (win.__introVs) win.__introVs.termina(true);
        // gli avatar devono essere già caricati: servono le loro misure (di solito lo sono da un pezzo; al primo set ci può voler un attimo)
        const immagini = dati ? dati.map(l => l.avatar).filter(Boolean) : Array.from(sfondo.querySelectorAll('.vs-avatar'));
        const pronte = immagini.every(i => i.complete);
        if (pronte) return costruisci(win, opz, sfondo);
        const caricate = immagini.map(i => (i.complete ? Promise.resolve() : new Promise(ok => { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); })));
        return Promise.race([Promise.all(caricate), pausa(1500)]).then(() => costruisci(win, opz, sfondo));
    }

    function costruisci(win, opz, sfondo) {
        const doc = win.document;
        // si può essere finiti in un'altra intro nel frattempo, o la pagina può aver cambiato sfondo
        const dati = opz.lati || null;
        if (!dati && !doc.body.contains(sfondo)) sfondo = doc.querySelector('.vs-sfondo:not(.pal-decor)');
        const realeSx = dati ? dati[0].reale : sfondo && sfondo.querySelector('.vs-lato.vs-sx');
        const realeDx = dati ? dati[1].reale : sfondo && sfondo.querySelector('.vs-lato.vs-dx');
        if (!sfondo || !realeSx || !realeDx) return Promise.resolve(false);
        if (win.__introVs) win.__introVs.termina(true);

        const L = win.innerWidth || doc.documentElement.clientWidth || 1280;
        const nomi = opz.nomi || {};
        const testi = opz.testi || { etichetta: '', punteggio: null, righe: [] };
        const radice = elemento(doc, 'div', 'vi');
        radice.setAttribute('aria-hidden', 'true');

        const lati = [
            { dir: -1, classe: 'vi-sx', reale: realeSx, nome: nomi.sx, specchia: dati ? dati[0].specchia : undefined, avatarDato: dati ? dati[0].avatar : undefined },
            { dir: 1, classe: 'vi-dx', reale: realeDx, nome: nomi.dx, specchia: dati ? dati[1].specchia : undefined, avatarDato: dati ? dati[1].avatar : undefined }
        ].map(s => {
            const avatar = dati ? (s.avatarDato || null) : s.reale.querySelector('.vs-avatar');
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
            if (s.avatar) { const sotto = win.getComputedStyle(s.avatar).bottom; if (sotto && sotto !== 'auto') ancora.style.bottom = sotto; }      // il compagno in palestra sta un po' sopra il bordo
            const corpo = elemento(doc, 'div', 'vi-corpo');
            let imgAvatar = null;
            corpo.style.scale = String(ingr);
            // senza nome niente tag (in palestra il compagno non ne ha)
            const tag = s.nome ? elemento(doc, 'div', 'vi-tag', String(s.nome).toUpperCase()) : null;
            if (tag) {
                tag.style.background = colore;
                tag.style.color = testoSu(colore);
                corpo.appendChild(tag);
            }
            if (s.avatar) {
                const img = doc.createElement('img');
                img.className = 'vi-avatar' + (s.specchia === true ? ' vi-specchia' : s.specchia === false ? ' vi-diritto' : '') + (s.avatar.classList && s.avatar.classList.contains('sc-vola') ? ' sc-vola' : '');
                img.alt = '';
                img.draggable = false;
                img.src = s.avatar.currentSrc || s.avatar.src;
                const stile = s.avatar.getAttribute('style');       // l'alone (--pal-aura) dell'avatar
                if (stile) img.setAttribute('style', stile);
                const aura = s.avatar.getAttribute('data-aura');        // quale aura (come sulla pagina: l'arcobaleno cambia colore)
                if (aura) img.setAttribute('data-aura', aura);
                img.style.height = `${s.altezza}px`;
                corpo.appendChild(img);
                imgAvatar = img;
            } else {
                corpo.style.bottom = '36vh';
            }
            ancora.appendChild(corpo);
            radice.appendChild(ancora);
            return { ancora, corpo, tag, img: imgAvatar };
        });

        // il punteggio sulla riga nera e il tabellone sotto
        const centro = elemento(doc, 'div', 'vi-centro');
        // niente "VS": al centro, grande, c'è il punteggio: una targa scura con le due cifre (come quella dello showdown, ma da tabellone) e sotto, a metà ciascuno, i colori
        // dei due allenatori; chi è avanti ha la cifra in ambra. Le palestre non hanno un punteggio e restano col solo tabellone.
        let vs = null, cifreVs = [], separatore = null;
        if (testi.punteggio) {
            vs = elemento(doc, 'div', 'vi-vs');
            const cifre = dividiPunteggio(testi.punteggio);
            if (cifre) {
                const [a, b] = cifre.map(Number);
                cifreVs = cifre.map((c, i) => elemento(doc, 'span', 'vi-cifra' + ((i === 0 ? a > b : b > a) ? ' vi-avanti' : ''), c));
                separatore = elemento(doc, 'i', 'vi-sep');
                [cifreVs[0], separatore, cifreVs[1]].forEach(e => vs.appendChild(e));
            } else {
                vs.appendChild(elemento(doc, 'span', 'vi-cifra', String(testi.punteggio)));      // scritto in un modo strano: così com'è
            }
        }
        const tabellone = elemento(doc, 'div', 'vi-tabellone');
        if (testi.etichetta) tabellone.appendChild(elemento(doc, 'div', 'vi-et', testi.etichetta));
        if (testi.righe && testi.righe.length) {
            const righe = elemento(doc, 'div', 'vi-righe');
            testi.righe.forEach(t => righe.appendChild(elemento(doc, 'span', '', t)));
            tabellone.appendChild(righe);
        }
        if (vs) centro.appendChild(vs);
        if (tabellone.childNodes.length) centro.appendChild(tabellone);
        radice.appendChild(centro);
        const lampo = elemento(doc, 'div', 'vi-lampo');
        radice.appendChild(lampo);
        doc.body.appendChild(radice);
        win.setTimeout(() => togliCopertura(win), T.entraMeta + 40);       // le due metà si sono incontrate e coprono tutto: sotto la copertura non serve più
        sfondo.classList.add('vi-in-corso');        // gli avatar veri aspettano sotto: ricompaiono, al loro posto, quando l'intro finisce (altrimenti si vedrebbero doppi)

        // la riga che dice che si sta aspettando (appare solo se la partita non è pronta quando il tabellone è stato letto)
        const rigaAttesa = elemento(doc, 'div', 'vi-attesa');
        const scriviStato = testo => {
            const t = String(testo == null ? '' : testo).replace(/[….]+\s*$/, '').trim();
            rigaAttesa.textContent = (t || 'Getting ready').toUpperCase();
        };
        scriviStato(opz.stato);
        centro.appendChild(rigaAttesa);

        // ---- le animazioni di quello che si vede mentre si legge: tutte insieme, con i loro ritardi ----
        const animazioni = [];
        const A = (e, keyframes, opzioni) => {
            const a = e.animate(keyframes, { fill: 'both', ...opzioni });
            animazioni.push(a);
            return a;
        };
        const t0 = Date.now();
        const trascorso = () => Date.now() - t0;
        const ritardoFuori = '104%';

        // 1. le metà si incontrano (con un piccolo rimbalzo) e c'è un lampo
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
            // l'entrata comprata nello Shop (entrate-vs.js): parte quando l'avatar arriva al suo posto
            const entrata = lati[i].avatar && lati[i].avatar.dataset ? lati[i].avatar.dataset.entrata : '';
            if (entrata && p.img && win.EntrateVs) win.EntrateVs.suona(entrata, { doc, ancora: p.ancora, corpo: p.corpo, img: p.img, dir: lati[i].dir, h: lati[i].altezza * ingr, A, t0: T.ritardoAvatar + T.entraAvatar });
        });
        // 3. il punteggio e il tabellone: la targa arriva con un colpo (storta quanto è storto il tema: -2,5°, e dritta se il tema è dritto), poi le cifre scattano al
        //    loro posto una dopo l'altra, e i due puntini si accendono
        let storto = 1;
        try { const v = parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--nb-rot')); if (Number.isFinite(v)) storto = v; } catch (e) { /* tema senza --nb-rot: com'è */ }
        const gradi = n => `${(n * storto).toFixed(2)}deg`;
        if (vs) {
            A(vs, { scale: [3.2, 0.9, 1], rotate: [gradi(-12), gradi(-1.5), gradi(-2.5)], opacity: [0, 1, 1], offset: [0, 0.62, 1] }, { duration: T.vs, delay: T.ritardoVs, easing: CURVE.pop });
            cifreVs.forEach((c, i) => A(c, { scale: [0.3, 1.28, 1], opacity: [0, 1, 1], offset: [0, 0.6, 1] }, { duration: T.cifra, delay: T.ritardoCifre + i * T.scarto, easing: CURVE.pop }));
            if (separatore) A(separatore, { scale: [0, 1], opacity: [0, 1] }, { duration: T.cifra, delay: T.ritardoCifre + T.scarto / 2, easing: CURVE.pop });
        }
        A(tabellone, { translate: ['0 46px', '0 0'], opacity: [0, 1] }, { duration: T.tabellone, delay: T.ritardoTabellone, easing: CURVE.entra });
        // 3b. dopo il tempo fisso, se la partita non è ancora pronta, tutto resta in vita: il punteggio pulsa piano e gli avatar ondeggiano
        const oscillazioni = [];
        const O = (e, keyframes, opzioni) => {
            const a = e.animate(keyframes, { fill: 'none', delay: T.apertura, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', ...opzioni });
            animazioni.push(a);
            oscillazioni.push({ e, a });
        };
        if (vs) O(vs, { scale: [1, 1.05] }, { duration: 700 });
        personaggi.forEach((p, i) => O(p.corpo, { rotate: ['-1.2deg', '1.2deg'] }, { duration: 1100 + i * 140 }));

        // ---- fine, o salto ----
        let finita = false, aperta = false, chiudi;
        let timerAttesa = null, timerMisura = [], scadenza = null;
        const promessa = new Promise(ok => { chiudi = ok; });
        const scollega = () => {
            doc.removeEventListener('keydown', suTasto, true);
            radice.removeEventListener('pointerdown', suClic);
        };
        const fermaTimer = () => {
            [timerAttesa, scadenza, sicurezza, ...timerMisura].forEach(t => win.clearTimeout(t));
        };
        const smonta = esito => {
            if (finita) return;
            finita = true;
            fermaTimer();
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
            fermaTimer();
            animazioni.forEach(a => { try { a.cancel(); } catch (e) { /* già fermata */ } });
            scollega();
            const d = radice.animate({ opacity: [1, 0] }, { duration: 160, fill: 'forwards' });
            d.finished.then(() => smonta(false), () => smonta(false));
        };
        const suClic = e => {
            if (trascorso() < T.protezione) return;
            e.preventDefault();
            termina(false);
        };
        const suTasto = e => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                e.preventDefault(); e.stopPropagation();
                if (trascorso() >= T.protezione) termina(false);
            }
        };
        radice.addEventListener('pointerdown', suClic);
        doc.addEventListener('keydown', suTasto, true);
        // a pagina nascosta i fotogrammi si fermano: si chiude comunque
        const attesaMax = Number(opz.attesaMax) > 0 ? Number(opz.attesaMax) : T.attesaMax;
        const sicurezza = win.setTimeout(() => smonta(true), attesaMax + T.totale + 2500);

        // 4. la diagonale si apre: le metà escono ai lati, il centro e i tag spariscono, gli avatar vanno al loro posto.
        //    Si apre al tempo fisso, ma non prima che la partita sia pronta. Le animazioni nascono qui (e non all'inizio) perché il punto d'arrivo degli avatar
        //    si legge adesso: la scena sotto si è disegnata nel frattempo e il tavolo può essersi spostato.
        //    (fill 'forwards' e non 'both': prima del loro inizio non devono coprire le animazioni di prima sulla stessa proprietà)
        const apri = () => {
            if (aperta || finita) return;
            aperta = true;
            win.clearTimeout(timerAttesa);
            radice.classList.remove('vi-in-attesa');
            const ritardo = ritardoApertura(trascorso());
            const aperture = [], arrivi = [];
            const B = (e, keyframes, opzioni) => {
                const a = e.animate(keyframes, { fill: 'forwards', delay: ritardo, ...opzioni });
                animazioni.push(a);
                aperture.push(a);
                return a;
            };
            // gli avatar che ondeggiavano si fermano piano (fermarli di colpo li farebbe scattare)
            personaggi.forEach(p => {
                let attuale = 'none';
                try { attuale = win.getComputedStyle(p.corpo).rotate; } catch (e) { /* niente */ }
                if (attuale && attuale !== 'none' && !/^0(deg)?$/.test(attuale)) B(p.corpo, { rotate: [attuale, '0deg'] }, { duration: 260, delay: 0, easing: 'ease-out' });
            });
            oscillazioni.filter(o => o.e !== vs).forEach(o => { try { o.a.cancel(); } catch (e) { /* già fermata */ } });
            B(metà[0], { translate: ['0% 0', `-${ritardoFuori} 0`] }, { duration: T.durataApertura, easing: CURVE.apre });
            B(metà[1], { translate: ['0% 0', `${ritardoFuori} 0`] }, { duration: T.durataApertura, easing: CURVE.apre });
            B(centro, { opacity: [1, 0], scale: [1, 1.35] }, { duration: T.uscitaCentro, easing: 'ease-in' });
            personaggi.forEach((p, i) => {
                if (p.tag) B(p.tag, { opacity: [1, 0], translate: ['0 0', '0 -18px'] }, { duration: T.uscitaCentro, easing: 'ease-in' });
                B(p.corpo, { scale: [ingr * 1.06, 1] }, { duration: T.durataApertura, easing: CURVE.apre });
                arrivi.push(B(p.ancora, { left: [`${lati[i].riposo}px`, `${lati[i].finale()}px`] }, { duration: T.durataApertura, easing: CURVE.apre }));
            });
            // il tavolo può ancora spostarsi mentre si apre: il punto d'arrivo si rimisura appena prima di partire e a metà corsa
            const rimisura = () => arrivi.forEach((a, i) => {
                try { a.effect.setKeyframes({ left: [`${lati[i].riposo}px`, `${lati[i].finale()}px`] }); } catch (e) { /* resta com'è */ }
            });
            if (ritardo >= 80) timerMisura.push(win.setTimeout(rimisura, ritardo - 60));
            timerMisura.push(win.setTimeout(rimisura, ritardo + 220));
            Promise.all(aperture.map(a => a.finished.catch(() => null))).then(() => { if (!finita) win.setTimeout(() => smonta(true), T.pausaFine); });
        };

        // dopo il tempo fisso, se la partita non è pronta, compare la riga che lo dice
        timerAttesa = win.setTimeout(() => { if (!aperta && !finita) radice.classList.add('vi-in-attesa'); }, T.apertura);
        const pronta = Promise.resolve(opz.attesa).catch(() => null);          // senza `attesa` (o con un errore) è subito pronta
        const scaduta = new Promise(ok => { scadenza = win.setTimeout(ok, attesaMax); });
        Promise.race([pronta, scaduta]).then(() => { win.clearTimeout(scadenza); apri(); });

        win.__introVs = { radice, termina, stato: scriviStato };
        return promessa;
    }

    return { T, CURVE, INGRANDIMENTO, VISIBILE, testiIntro, dividiPunteggio, punteggioShowdown, disposizione, ritardoApertura, testoSu, puoRiprodurre, togliCopertura, mettiCopertura, riproduci };
});
