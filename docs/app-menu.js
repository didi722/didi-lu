// =====================================================
// APP — il menù principale (menu.html)
// ---------------------------------------------------------------------
// La prima schermata dell'app: a sinistra il giocatore (avatar, nome, titolo, Elo, la stagione del momento), a destra le pagine del gioco come grandi
// tessere (poche: giocare e vedere i risultati). Prima volta di ogni visita: la schermata del titolo ("Tap to start", che serve anche a sbloccare l'audio
// del telefono). Se c'è una stagione con le iscrizioni aperte a cui il giocatore non è ancora iscritto, un messaggio la annuncia (una volta per stagione).
// Dal browser (senza la classe "app" su <html>) non c'è: si torna alla home del sito.
//   - il giocatore: app-comune.js (users/<uid>/name -> players/<nome>: avatar, colore, titolo, Elo, stagioni vinte);
//   - la stagione: la prima con le iscrizioni aperte, altrimenti quella in corso, altrimenti l'ultima conclusa (seasons/<id>/info, e gli iscritti se aperta);
//   - accesso e impostazioni (suono, vibrazione, avvisi, ricarica, esci) in due finestre.
// La parte pura (quale stagione mostrare, il tempo che manca, quando annunciarla) è provata in test/app-menu.test.js; funziona nel browser (window.MenuApp) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const comune = inNode ? require('./app-comune.js') : radice.AppComune;
    const M = fabbrica(comune, inNode ? require('./app-carosello.js') : radice.AppCarosello, inNode ? require('./app-scena.js') : radice.AppScena);
    if (typeof module === 'object' && module.exports) module.exports = M;
    else {
        radice.MenuApp = M;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => M.avvia(radice)); else M.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (C, Car, S) {
    'use strict';

    const CHIAVE_SPLASH = 'menuSplashVisto';          // sessionStorage: la schermata del titolo si vede una volta a visita
    const CHIAVE_AVVISI = 'appAvvisiChiesti';         // localStorage: la richiesta delle notifiche è già stata fatta (una volta sola)
    const CHIAVE_ANNUNCIO = 'appStagioneVista';       // localStorage: l'ultima stagione annunciata (il messaggio compare una volta per stagione)
    const PASSO_NASTRO = 4000;                        // ms: ogni quanto il nastro passa alla stagione dopo
    const LINK_MP3 = 'https://dn721900.ca.archive.org/0/items/pkmn-rse-soundtrack/Disc%201/13%20-%20Pok%C3%A9mon%20Center.mp3';

    // ---------- parti pure ----------

    /** Lo stato di una stagione: quello scritto, ma con le iscrizioni scadute è "playing" (come nella home del sito). */
    function statoStagione(info, adesso) {
        if (!info) return '';
        let st = String(info.status || 'open').toLowerCase();
        if (st === 'terminata') st = 'closed';
        if (st === 'open' && info.deadline && Number.isFinite(Date.parse(info.deadline)) && (adesso || Date.now()) >= Date.parse(info.deadline)) st = 'playing';
        return st;
    }

    /**
     * Quale stagione mostrare nel menù: prima quella con le iscrizioni aperte (la più vicina alla scadenza), poi quella in corso (l'ultima), poi l'ultima conclusa.
     * `elenco`: [{ id, info }] (le assenti si ignorano); la beta (sbeta) conta solo se non c'è altro.
     * Restituisce { id, info, stato, mancano (ms alla scadenza, solo con le iscrizioni aperte) } o null.
     */
    function stagioneDaMostrare(elenco, adesso) {
        const ora = adesso || Date.now();
        const tutte = (elenco || []).filter(x => x && x.info).map(x => ({ id: x.id, info: x.info, stato: statoStagione(x.info, ora) }));
        const vere = tutte.filter(x => x.id !== 'sbeta');
        const lista = vere.length ? vere : tutte;
        const numero = id => { const m = /(\d+)$/.exec(String(id)); return m ? Number(m[1]) : -1; };
        const piuRecente = (a, b) => numero(b.id) - numero(a.id);
        const aperte = lista.filter(x => x.stato === 'open').sort((a, b) => (Date.parse(a.info.deadline) || Infinity) - (Date.parse(b.info.deadline) || Infinity));
        const scelta = aperte[0] || lista.filter(x => x.stato === 'playing').sort(piuRecente)[0] || lista.filter(x => x.stato === 'closed').sort(piuRecente)[0] || lista.sort(piuRecente)[0];
        if (!scelta) return null;
        const scad = Date.parse(scelta.info.deadline);
        return { ...scelta, mancano: scelta.stato === 'open' && Number.isFinite(scad) ? Math.max(0, scad - ora) : null };
    }

    /**
     * Le stagioni da mostrare nel menù, tutte quelle che contano ora: prima le aperte (la più vicina alla scadenza), poi quelle in corso (la più recente prima);
     * se non c'è né l'una né l'altra, l'ultima conclusa. Con più di una il nastro del menù scorre da solo tra loro.
     */
    function stagioniDaMostrare(elenco, adesso) {
        const ora = adesso || Date.now();
        const tutte = (elenco || []).filter(x => x && x.info).map(x => ({ id: x.id, info: x.info, stato: statoStagione(x.info, ora) }));
        const vere = tutte.filter(x => x.id !== 'sbeta');
        const lista = vere.length ? vere : tutte;
        const numero = id => { const m = /(\d+)$/.exec(String(id)); return m ? Number(m[1]) : -1; };
        const piuRecente = (a, b) => numero(b.id) - numero(a.id);
        const aperte = lista.filter(x => x.stato === 'open').sort((a, b) => (Date.parse(a.info.deadline) || Infinity) - (Date.parse(b.info.deadline) || Infinity));
        const incorso = lista.filter(x => x.stato === 'playing').sort(piuRecente);
        const scelte = aperte.concat(incorso);
        if (!scelte.length) { const ultima = lista.filter(x => x.stato === 'closed').sort(piuRecente)[0] || lista.slice().sort(piuRecente)[0]; if (ultima) scelte.push(ultima); }
        return scelte.map(x => {
            const scad = Date.parse(x.info.deadline);
            return { ...x, mancano: x.stato === 'open' && Number.isFinite(scad) ? Math.max(0, scad - ora) : null };
        });
    }

    /** "2d 23h", "5h 12m", "12m", "now": il tempo che manca, scritto corto */
    function tempoCheManca(ms) {
        if (!Number.isFinite(ms) || ms <= 0) return 'now';
        const min = Math.floor(ms / 60000);
        const g = Math.floor(min / 1440), o = Math.floor((min % 1440) / 60), m = min % 60;
        if (g > 0) return `${g}d ${o}h`;
        if (o > 0) return `${o}h ${m}m`;
        return `${Math.max(1, m)}m`;
    }

    /** La riga della stagione per il menù: titolo, stato in parole, dove porta il tasto. `iscritto`: il giocatore è già dentro (con le iscrizioni aperte). */
    function riassuntoStagione(s, iscritto) {
        if (!s) return null;
        const nome = (s.info && s.info.name) || `Season ${String(s.id).replace(/^s/, '')}`;
        if (s.stato === 'open') {
            const chiude = tempoCheManca(s.mancano);
            return {
                nome, stato: 'open', testo: iscritto ? `You're in · closes in ${chiude}` : `Sign-ups close in ${chiude}`,
                azione: iscritto ? 'TEAMS' : 'JOIN', href: `hub.html?id=${encodeURIComponent(s.id)}`
            };
        }
        if (s.stato === 'playing') return { nome, stato: 'playing', testo: 'Showdowns in progress', azione: 'PLAY', href: `matches.html?id=${encodeURIComponent(s.id)}` };
        const vincitore = s.info && s.info.winner ? ` · ${s.info.winner} won` : '';
        return { nome, stato: 'closed', testo: `Season over${vincitore}`, azione: 'VIEW', href: `matches.html?id=${encodeURIComponent(s.id)}` };
    }

    /** Il giocatore è tra gli iscritti della stagione? `iscritti`: i nomi (come sono scritti nel database); il confronto non guarda le maiuscole. */
    function giaIscritto(iscritti, giocatoreId) {
        const id = String(giocatoreId == null ? '' : giocatoreId).toLowerCase().trim();
        return !!id && (iscritti || []).some(n => String(n).toLowerCase().trim() === id);
    }

    /**
     * Va annunciata una stagione con le iscrizioni aperte? Sì se: c'è un giocatore collegato, la stagione è aperta, lui non è ancora iscritto e non gliel'abbiamo già
     * annunciata (`vista`: l'id dell'ultima annunciata). Restituisce { id, nome, testo, href } per il messaggio, o null.
     */
    function daAnnunciare({ stagione, giocatoreId, iscritti, vista }) {
        if (!stagione || stagione.stato !== 'open' || !giocatoreId || !Array.isArray(iscritti)) return null;
        if (vista && String(vista) === String(stagione.id)) return null;
        if (giaIscritto(iscritti, giocatoreId)) return null;
        const r = riassuntoStagione(stagione, false);
        return { id: stagione.id, nome: r.nome, tempo: tempoCheManca(stagione.mancano), href: r.href };
    }

    // ---------- le scene del menù ----------

    const CHIAVE_CARTA = 'menuCarta';                 // sessionStorage: la scena guardata, per ritrovarla tornando dalle pagine
    const PAUSA_SCORRIMENTO = 460;                    // ms: dopo aver scorso, le animazioni ripartono quando la scena è arrivata
    const SCINTILLE = 10;                             // quante ne sale per scena (poche: ogni scena ha le sue)

    /**
     * Una scena del menù (com'è fatta: app-scena.js e app-scena.css): un cielo colorato con raggi, nuvole e scintille, le figure grandi ferme in primo piano con gli
     * effetti che si muovono (folgori, onde d'urto, Poké Ball che gira, quadrante...), il tag storto col nome in basso al centro e la riga sotto. È un link (tutta la
     * scena): toccata, apre la pagina. L'immagine vera (tessera-<id>) prende il posto delle figure di ripiego.
     */
    function htmlCarta(v, indice, esc) {
        const sc = S.SCENE[v.id] || { cielo: 'cielo-blu', eroi: [], sotto: '' };
        return '<a class="gx-carta gx-c-' + esc(v.id) + '" href="' + esc(v.href) + '" data-i="' + indice + '" data-id="' + esc(v.id) + '" style="--c:' + esc(v.colore) + '" data-suono="scegli">' +
            S.htmlScena(sc, { indice, scintille: SCINTILLE, escF: esc, immagine: '<img class="gx-immagine" data-id="' + esc(v.id) + '"' + (sc.arte ? ' data-arte="' + esc(sc.arte) + '"' : '') + (sc.bordo ? ' data-bordo' : '') + ' alt="' + esc(sc.alt || '') + '" hidden>' }) +
            '<span class="gx-blocco"><b class="gx-tag"><span>' + esc(v.et) + '</span></b></span></a>';
    }

    const MINIMO_CARICAMENTO_MS = 1800;

    /** Gli indirizzi da provare, in ordine, per l'immagine di una scena */
    const immaginiDi = id => S.proveDi('tessera-' + id);

    // ---------- il menù nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        if (!doc || !doc.body) return null;
        const html = doc.documentElement;
        // dal browser il menù non c'è
        if (!html.classList.contains('app')) {
            if (win.location && typeof win.location.replace === 'function') win.location.replace('index.html');
            return null;
        }
        if (!C) return null;
        const { svg, esc } = C;
        const $ = id => doc.getElementById(id);
        const leggi = k => { try { return win.localStorage.getItem(k); } catch (e) { return null; } };
        const scrivi = (k, v) => { try { win.localStorage.setItem(k, v); } catch (e) { /* senza memoria si riparte da acceso */ } };
        const suoni = () => win.Suoni && typeof win.Suoni.fai === 'function' ? win.Suoni : null;
        const fai = nome => { const s = suoni(); if (s) s.fai(nome); };
        const db = () => win.firebase.database();
        const auth = () => win.firebase.auth();

        // ----- le scene -----
        const voci = (win.AppSito && win.AppSito.VOCI) || [];
        $('gx-tessere').innerHTML = '<div class="gx-pista">' + voci.map((v, i) => htmlCarta(v, i, esc)).join('') + '</div>';
        // le immagini vere, se ci sono (se manca una .png si prova la .webp; se mancano tutte resta la scena di ripiego)
        $('gx-tessere').querySelectorAll('.gx-immagine').forEach(img => {
            const prove = immaginiDi(img.dataset.id).concat(img.dataset.arte ? [img.dataset.arte] : []);       // prima la tua (tessera-<id>), poi quella già pronta della scena
            let k = 0;
            img.addEventListener('load', () => { img.hidden = false; if (img.hasAttribute('data-bordo')) img.classList.add('gx-bordo'); img.closest('.gx-carta').classList.add('ha-immagine'); });       // le scene "a filo" (Play) stanno a tutta altezza, contro i bordi dello schermo
            img.addEventListener('error', () => { k += 1; if (k < prove.length) img.src = prove[k]; });
            img.src = prove[0];
        });
        // e quelle delle singole figure (per ora gli allenatori: trainers-1 e trainers-2), al posto degli avatar di ripiego
        S.cercaImmagini($('gx-tessere'), '.gx-eroe[data-prova]', (el, src) => { el.src = src; el.classList.add('propria'); });
        // le figure si decodificano subito: così scorrendo la scena vicina è già pronta, senza scatti
        $('gx-tessere').querySelectorAll('.gx-eroe').forEach(img => { if (typeof img.decode === 'function') img.decode().catch(() => { /* non si è caricata: sparisce da sola */ }); });

        // ----- il carosello: una scena alla volta (le altre stanno fuori dallo schermo); si scorre di lato seguendo il dito e le vicine entrano mentre si trascina -----
        const stato = { corrente: 0 };
        let timerCentro = null, timerFerma = null;
        const DURATA_SCORRIMENTO_MS = 360;   // quanto dura lo scorrimento di una scena verso il centro
        const DOPO_SCORRIMENTO_MS = 400;     // un po' più della transizione delle scene (.38s)
        // le immagini delle scene si decodificano subito (a riposo), non alla prima volta che entrano mentre si scorre
        try { [...$('gx-tessere').querySelectorAll('.gx-carta img')].forEach(im => { if (typeof im.decode === 'function') im.decode().catch(() => { /* si vedrà comunque */ }); }); } catch (e) { /* pazienza */ }
        const pista = $('gx-tessere').querySelector('.gx-pista');
        const carte = [...$('gx-tessere').querySelectorAll('.gx-carta')];
        /** Mentre una scena scorre le animazioni di tutte le scene stanno ferme (se ne stanno muovendo decine, e il telefono ha altro da fare); ripartono quando è arrivata */
        const annulla = id => { if (id !== null && typeof win.clearTimeout === 'function') win.clearTimeout(id); };
        const fermaAnimazioni = () => { pista.classList.add('gx-ferma'); annulla(timerFerma); timerFerma = null; };
        const riprendiDopo = () => { annulla(timerFerma); timerFerma = win.setTimeout(() => { timerFerma = null; pista.classList.remove('gx-ferma'); }, PAUSA_SCORRIMENTO); };
        const xPrima = new Map();
        const raf = f => (typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame(f) : f());
        try { const salvata = Number(win.sessionStorage.getItem(CHIAVE_CARTA)); if (Number.isInteger(salvata) && salvata >= 0 && salvata < carte.length) stato.corrente = salvata; } catch (e) { /* si parte dalla prima */ }
        /** Dove sta ogni scena (--x: 0 al centro, ±1 appena fuori): è l'unica cosa che cambia mentre il dito si muove */
        const posiziona = (frac = 0) => {
            const n = carte.length;
            carte.forEach((el, i) => {
                const d = Car.distanza(i, stato.corrente, n, true);
                const x = Math.max(-2, Math.min(2, d + frac));
                // una scena che passa dall'altra parte del giro (da -1 a +2) non deve attraversare lo schermo: salta senza animarsi (chi esce o entra da un lato scorre)
                const prima = xPrima.get(el);
                if (prima !== undefined && prima * x < 0 && Math.abs(x - prima) > 1.5) { el.style.transition = 'none'; el.classList.add('gx-salta'); raf(() => raf(() => { el.style.transition = ''; el.classList.remove('gx-salta'); })); }
                xPrima.set(el, x);
                el.style.setProperty('--x', x);
                // mai 'hidden': una scena nascosta il telefono non la prepara, e quando tocca a lei (quella dall'altra parte del giro, soprattutto tornando indietro) va disegnata da
                // capo nello stesso fotogramma in cui parte lo scorrimento. Fuori schermo (x = ±2) resta preparata, e non si vede né si tocca (le tessere fuori sono aria-hidden)
                el.style.visibility = 'visible';
            });
        };
        /** Quale scena è quella guardata (per chi scorre da tastiera e per chi legge lo schermo): si aggiorna solo quando cambia */
        const segnaCentro = () => carte.forEach((el, i) => {
            el.classList.toggle('gx-centro', i === stato.corrente);
            el.tabIndex = i === stato.corrente ? 0 : -1;
            el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
        });
        // Lo scorrimento finale lo fa il codice, un fotogramma alla volta, esattamente come quando si accompagna la scena col dito (che è fluido); la transizione CSS, usata
        // prima per gli swipe veloci e i tocchi, a scatti sul telefono. Senza requestAnimationFrame o orologio (prove) si salta direttamente alla posizione finale.
        let animazione = 0, fraDito = 0;
        const sa = win.performance && typeof win.performance.now === 'function' && typeof win.requestAnimationFrame === 'function';
        const anima = da => {
            const id = ++animazione, t0 = win.performance.now();
            posiziona(da);
            const passoAnim = t => {
                if (id !== animazione) return;
                const k = Math.min(1, (win.performance.now() - t0) / DURATA_SCORRIMENTO_MS);
                const e = 1 - Math.pow(1 - k, 3);
                posiziona(da * (1 - e));
                if (k < 1) win.requestAnimationFrame(passoAnim);
            };
            win.requestAnimationFrame(passoAnim);
        };
        const vai = i => {
            const n = Car.dentro(i, carte.length);
            if (n === stato.corrente) return;
            const prima = stato.corrente;
            stato.corrente = n;
            // anche con uno swipe veloce (o un tocco sulla scena di lato), dove il dito non ha "accompagnato" niente: le animazioni stanno ferme finché la scena non è arrivata
            fermaAnimazioni(); riprendiDopo();
            if (sa) {
                // si parte da dove sono le scene adesso (la scena nuova era a `da` passi dal centro, più quanto il dito l'aveva già portata) e si arriva a zero
                const da = Car.distanza(n, prima, carte.length, true) + fraDito;
                fraDito = 0;
                anima(da);
            } else posiziona();
            // appena la scena parte l'unica cosa da fare è spostarla: cambiare le classi del centro (che ferma e fa ripartire le animazioni di tutte le scene, centinaia di
            // elementi) e il resto si fa a scorrimento finito, non nello stesso fotogramma (era lì lo scatto)
            if (timerCentro !== null && typeof win.clearTimeout === 'function') win.clearTimeout(timerCentro);
            timerCentro = win.setTimeout(() => {
                timerCentro = null;
                try { win.sessionStorage.setItem(CHIAVE_CARTA, String(stato.corrente)); } catch (e) { /* non si ricorda */ }
                segnaCentro();
                fai('scegli');
            }, DOPO_SCORRIMENTO_MS);
        };
        const passo = verso => vai(Car.passo(stato.corrente, carte.length, verso, true));
        if (carte.length) {
            segnaCentro();
            posiziona();
            // mentre il dito si muove si aggiorna una volta per fotogramma (non a ogni evento: ce ne sono di più) e si tocca solo --x
            let ultima = null, inAttesa = false;
            const segui = (f, fine) => {
                if (!fine) { animazione++; fraDito = f; } else if (sa) raf(() => { fraDito = 0; });
                if (!fine) fermaAnimazioni(); else riprendiDopo();
                // dito alzato: se non c'è un cambio di scena (vai lo sostituisce subito) le scene tornano al loro posto con lo stesso movimento
                if (fine) { ultima = null; if (sa) { if (fraDito !== 0) anima(fraDito); } else posiziona(0); return; }
                ultima = f;
                if (!inAttesa) { inAttesa = true; raf(() => { inAttesa = false; if (ultima !== null) posiziona(ultima); }); }
            };
            // si scorre da qualunque punto dello schermo (anche sopra il giocatore), non solo sulla scena
            Car.collegaGesti($('gx-lobby') || $('gx-tessere'), {
                avanti: () => passo(1), indietro: () => passo(-1), passoPx: () => doc.documentElement.clientWidth || 740 * Car.unitaPx(win), trascina: segui, senzaScorrimento: true
            });
            $('gx-tessere').addEventListener('click', e => {
                const c = e.target.closest ? e.target.closest('.gx-carta') : null;
                if (c && Number(c.dataset.i) !== stato.corrente) { e.preventDefault(); vai(Number(c.dataset.i)); }
            });
            doc.addEventListener('keydown', e => { if (e.key === 'ArrowRight') passo(1); else if (e.key === 'ArrowLeft') passo(-1); });
        }

        // ----- barra in alto: suono e impostazioni -----
        const suonoAcceso = () => leggi(C.CHIAVE_SUONO) !== 'off';
        const disegnaHud = () => {
            $('gx-suono').innerHTML = svg(suonoAcceso() ? 'suonoOn' : 'suonoOff');
            $('gx-suono').setAttribute('aria-pressed', suonoAcceso() ? 'true' : 'false');
            $('gx-opzioni-apri').innerHTML = svg('ingranaggio');
        };

        // ----- musica: parte al primo tocco (il telefono non la lascia partire da sola), se non è stata spenta -----
        const musica = $('bg-music-home');
        const avviaMusica = () => {
            if (!musica || !suonoAcceso()) return;
            if (!musica.getAttribute('src')) { musica.src = LINK_MP3; musica.volume = .6; }
            musica.muted = false;
            const p = musica.play();
            if (p && typeof p.catch === 'function') p.catch(() => { /* bloccata dal telefono: si riprova al prossimo tocco */ });
        };
        doc.addEventListener('pointerdown', avviaMusica, { once: true });
        const cambiaSuono = () => {
            const acceso = !suonoAcceso();
            scrivi(C.CHIAVE_SUONO, acceso ? 'on' : 'off');
            if (musica) { if (acceso) avviaMusica(); else { musica.pause(); musica.muted = true; } }
            disegnaHud();
            if (acceso) fai('scegli');
        };
        $('gx-suono').addEventListener('click', () => { cambiaSuono(); if (opzioni && opzioni.aperta()) opzioni.aggiorna(); });

        // ----- la schermata del titolo -----
        const splash = $('gx-splash');
        const giaVisto = (() => { try { return !!win.sessionStorage.getItem(CHIAVE_SPLASH); } catch (e) { return false; } })();
        let caricando = false;                           // finché le immagini non sono arrivate la schermata del titolo non si chiude
        // le GIF dei Pokémon (compagni, team di Stats...) si scaricano all'apertura (app-precarica.js): partono quando Firebase c'è, e il menù dà gli id delle stagioni appena li ha trovati
        let risolviIds = () => {};
        const idsStagioni = new Promise(r => { risolviIds = r; });
        let gifAvviate = false, barraGif = {};
        const avviaGif = () => {
            if (gifAvviate) return;
            gifAvviate = true;
            const P = win.AppPrecarica;
            if (!P) { if (barraGif.fine) barraGif.fine(); return; }
            P.avvia(win, { idsStagioni, giocatore: () => (giocatore ? giocatore.id : ''), setTempo: (f, ms) => win.setTimeout(f, ms), avanza: barraGif.avanza, fine: barraGif.fine })
                .catch(() => { if (barraGif.fine) barraGif.fine(); })
                .then(() => (typeof P.scaldaScript === 'function' ? P.scaldaScript(win) : null))        // poi gli script del simulatore, in silenzio
                .catch(() => {});
        };
        const chiudiSplash = () => {
            if (!splash || splash.hidden || caricando) return;
            try { win.sessionStorage.setItem(CHIAVE_SPLASH, '1'); } catch (e) { /* la prossima volta si rivede */ }
            fai('avvio');
            avviaMusica();
            splash.classList.add('esce');
            html.classList.add('gx-pronto');
            win.setTimeout(() => { splash.hidden = true; provaAnnuncio(); }, 520);
        };
        if (splash && !giaVisto) {
            const scintilleSplash = $('gx-splash-scintille');
            if (scintilleSplash) scintilleSplash.innerHTML = S.htmlScintille(16, 11);
            splash.hidden = false;
            // la barra di caricamento: le immagini delle scene (un quinto) e le GIF dei Pokémon (il resto) si scaricano ora, così scorrere, aprire Play, Stats o una stagione è subito pronto
            const tocca = splash.querySelector ? splash.querySelector('.gx-splash-tocca') : null, barra = splash.querySelector ? splash.querySelector('.gx-splash-carica') : null;
            const testo = tocca ? tocca.textContent : '';
            // il caricamento ha la sua schermata scura sopra al titolo (gx-avvio); il titolo mostra "Tap to start" solo quando quella si dissolve
            const avvio = $('gx-avvio');
            const bAvvio = avvio && avvio.querySelector ? avvio.querySelector('.gx-avvio-barra') : null, tAvvio = avvio && avvio.querySelector ? avvio.querySelector('.gx-avvio-testo') : null;
            const mostra = f => { const v = Math.min(1, f); if (bAvvio) bAvvio.style.setProperty('--p', String(v)); if (tAvvio) tAvvio.textContent = 'Loading ' + Math.round(v * 100) + '%'; };
            const parte = { scene: 0, gif: 0 }, finito = { scene: false, gif: false };
            const aggiorna = () => mostra(.2 * parte.scene + .8 * parte.gif);
            const inizio = Date.now();
            const prova = () => {
                if (finito.scene && finito.gif && caricando) {
                    caricando = false; splash.classList.remove('carica');
                    if (avvio) {                    // dissolvenza, poi "Tap to start" (anche se è già tutto pronto la schermata si vede un attimo: non è un lampo)
                        const resta = Math.max(0, MINIMO_CARICAMENTO_MS - (Date.now() - inizio));
                        win.setTimeout(() => { avvio.classList.add('esce'); win.setTimeout(() => { avvio.hidden = true; }, 800); }, resta);
                    }
                }
            };
            caricando = true; splash.classList.add('carica'); mostra(0);
            S.precarica(S.immaginiScene(), { setTempo: (f, ms) => win.setTimeout(f, ms), avanza: f => { parte.scene = f; aggiorna(); }, fine: () => { finito.scene = true; parte.scene = 1; aggiorna(); prova(); } });
            barraGif = { avanza: f => { parte.gif = f; aggiorna(); }, fine: () => { finito.gif = true; parte.gif = 1; aggiorna(); prova(); } };
            win.setTimeout(() => { finito.scene = finito.gif = true; prova(); }, 32000);         // la rete non tiene mai ferma l'app
            splash.addEventListener('click', chiudiSplash);
            splash.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') chiudiSplash(); });
        } else { html.classList.add('gx-pronto'); S.precarica(S.immaginiScene(), { setTempo: (f, ms) => win.setTimeout(f, ms) }); }       // niente schermata del titolo: le immagini si scaldano lo stesso, in silenzio (e le GIF, se ne mancano)

        // ----- la finestra di accesso -----
        const aggiornaClasse = () => html.classList.toggle('gx-dialogo-aperto', !!doc.querySelector('.gx-dialogo:not([hidden])'));
        const apriLogin = () => { const el = $('gx-login'); el.hidden = false; aggiornaClasse(); win.setTimeout(() => $('gx-email').focus(), 60); };
        const chiudiLogin = () => { $('gx-login').hidden = true; aggiornaClasse(); };
        $('gx-login').addEventListener('click', e => { if ((e.target.closest && e.target.closest('[data-chiudi]')) || e.target === $('gx-login')) chiudiLogin(); });
        doc.addEventListener('keydown', e => { if (e.key === 'Escape') { chiudiLogin(); chiudiAnnuncio(); chiudiAch(); } });
        const errore = $('gx-login-errore');
        const mostraErrore = t => { errore.textContent = t; errore.hidden = !t; };
        $('gx-login-form').addEventListener('submit', e => {
            e.preventDefault();
            mostraErrore('');
            auth().signInWithEmailAndPassword($('gx-email').value, $('gx-password').value)
                .then(() => { chiudiLogin(); fai('ok'); })
                .catch(() => { mostraErrore('Wrong email or password.'); fai('errore'); });
        });
        $('gx-password-dimenticata').addEventListener('click', () => {
            const mail = $('gx-email').value.trim();
            if (!mail) { mostraErrore('Type your email first, then tap "Forgot password?".'); return; }
            auth().sendPasswordResetEmail(mail).then(() => mostraErrore('Check your inbox: we sent you a link.')).catch(() => mostraErrore('Could not send the email. Check the address.'));
        });

        // ----- il giocatore -----
        let giocatore = null;           // riassunto, o null se non si è collegati
        let ach = null;                 // gli achievements del giocatore ({ voci, sbloccati, totale }), una volta caricati; false se non si sono potuti leggere
        let utente = null;
        let admin = false;
        let stagione = null;            // la stagione principale (la prima della lista: serve all'annuncio)
        let stagioni = [];              // tutte quelle da mostrare nel nastro
        let indiceNastro = 0;
        let posizione = null;           // il posto nella classifica della lega (null: non classificato o non ancora letto)
        let posizioneLetta = false;
        const htmlNastro = () => {
            const st = stagioni[indiceNastro % (stagioni.length || 1)];
            if (!st) return '';
            const s = riassuntoStagione(st, !!giocatore && giaIscritto(st.iscritti, giocatore.id));
            const punti = stagioni.length > 1 ? '<span class="gx-st-punti" aria-hidden="true">' + stagioni.map((x, k) => '<i' + (k === indiceNastro % stagioni.length ? ' class="su"' : '') + '></i>').join('') + '</span>' : '';
            return '<a class="gx-stagione gx-st-' + s.stato + '" href="' + esc(s.href) + '"' + (s.azione === 'JOIN' ? ' data-iscrivi="' + esc(String(st.id)) + '"' : '') + ' data-suono="scegli"><i class="gx-pallino"></i><span class="gx-st-testi"><b>' + esc(s.nome) + '</b></span>' + punti + '<em>' + esc(s.azione) + '</em></a>';
        };
        const pannelloGiocatore = () => {
            const nastro = '<div class="gx-nastro" id="gx-nastro">' + htmlNastro() + '</div>';
            if (!giocatore) {
                return '<div class="gx-palco gx-ospite"><span class="gx-aura"></span><span class="gx-avatar gx-sagoma" aria-hidden="true">?</span><span class="gx-piattaforma"></span></div>' +
                    '<div class="gx-targa"><b class="gx-nome">Welcome!</b><small class="gx-titolo-g">Log in to play and vote</small></div>' +
                    '<button type="button" class="gx-bottone gx-primario gx-largo-b" id="gx-accedi" data-suono="apri">' + svg('entra', 'gx-icona-pic') + 'Log in</button>' + nastro;
            }
            const numeri = [
                '<li><b>' + (giocatore.elo == null ? 'N/A' : (posizioneLetta ? (posizione ? '#' + posizione : 'N/A') : '…')) + '</b><span>Ranking</span></li>',
                '<li><b>' + (giocatore.elo == null ? 'N/A' : giocatore.elo) + '</b><span>Elo</span></li>'
            ].join('');
            const medaglia = '<button type="button" class="gx-ach-apri" data-ach="1" aria-label="Achievements" data-suono="apri">' + svg('medaglia') + '<span>Achievements</span>' + (ach ? '<b>' + ach.sbloccati + '</b>' : '') + '</button>';
            return '<div class="gx-palco"><span class="gx-aura"></span><img class="gx-avatar" src="' + esc(giocatore.avatar) + '" alt="" onerror="this.onerror=null;this.src=\'immagini/magikarp.png\'"><span class="gx-piattaforma"></span>' + medaglia + '</div>' +
                '<div class="gx-targa"><b class="gx-nome">' + esc(giocatore.nome) + '</b>' + (giocatore.titolo ? '<small class="gx-titolo-g">' + esc(giocatore.titolo) + '</small>' : '') + '</div>' +
                '<ul class="gx-numeri">' + numeri + '</ul>' + nastro;
        };
        const disegnaGiocatore = () => {
            $('gx-giocatore').innerHTML = pannelloGiocatore();
            const accedi = $('gx-accedi');
            if (accedi) accedi.addEventListener('click', apriLogin);
        };
        disegnaGiocatore();

        // ----- gli achievements: un tasto accanto all'avatar, una finestra con i badge (app-achievements.js) -----
        const dialogoAch = $('gx-ach');
        const disegnaAch = () => {
            const A = win.AppAchievements;
            $('gx-ach-somma').textContent = ach && A ? A.somma(ach) : '';
            $('gx-ach-lista').innerHTML = ach && A ? A.htmlElenco(ach.voci) : '<p class="ach-vuoto">' + (ach === false ? 'Could not load your achievements. Try again later.' : 'Loading…') + '</p>';
        };
        const apriAch = () => {
            if (!dialogoAch) return;
            disegnaAch();
            dialogoAch.hidden = false;
            aggiornaClasse();
            if (ach === null) caricaAch();
        };
        function chiudiAch() { if (!dialogoAch || dialogoAch.hidden) return; dialogoAch.hidden = true; aggiornaClasse(); }
        if (dialogoAch) dialogoAch.addEventListener('click', e => { if ((e.target.closest && e.target.closest('[data-chiudi]')) || e.target === dialogoAch) chiudiAch(); });
        $('gx-giocatore').addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-ach]')) apriAch(); });
        async function caricaAch() {
            const per = giocatore;
            if (!per || !win.AppAchievements) return;
            ach = null;
            try {
                const r = await win.AppAchievements.carica(win, per.id);
                if (giocatore !== per) return;
                ach = r;
            } catch (e) { if (giocatore === per) ach = false; }
            disegnaGiocatore();
            if (dialogoAch && !dialogoAch.hidden) disegnaAch();
        }

        const caricaGiocatore = async user => {
            utente = user;
            giocatore = null;
            ach = null;
            admin = false;
            const r = user ? await C.leggiGiocatore(win, user) : null;
            if (r) { giocatore = r.giocatore; admin = r.admin; }
            posizione = null; posizioneLetta = false;
            disegnaGiocatore();
            if (giocatore) {
                const per = giocatore;
                C.leggiPosizione(win, per.id).then(n => { if (giocatore !== per) return; posizione = n; posizioneLetta = true; disegnaGiocatore(); });
            }
            if (opzioni && opzioni.aperta()) opzioni.aggiorna();
            provaAnnuncio();
            if (giocatore) caricaAch();
        };

        // ----- la stagione -----
        const caricaStagione = async () => {
            try {
                const leggiInfo = id => db().ref('seasons/' + id + '/info').once('value').then(s => ({ id, info: s.val() })).catch(() => ({ id, info: null }));
                const trovate = [await leggiInfo('sbeta')];
                for (let da = 0; da < 200; da += 10) {
                    const blocco = await Promise.all(Array.from({ length: 10 }, (_, i) => leggiInfo('s' + (da + i))));
                    trovate.push(...blocco);
                    if (!blocco[blocco.length - 1].info) break;
                }
                risolviIds(trovate.filter(t => t.info && String(t.info.tipo || '').toLowerCase().trim() !== 'cup').map(t => t.id));      // per le GIF dei team di Stats
                stagioni = stagioniDaMostrare(trovate, Date.now());
                stagione = stagioni[0] || null;
                // con le iscrizioni aperte serve sapere chi è già dentro (per il tasto del nastro e per l'annuncio)
                for (const st of stagioni.filter(x => x.stato === 'open')) {
                    try {
                        const v = (await db().ref('seasons/' + st.id + '/iscritti').once('value')).val();
                        st.iscritti = v ? Object.keys(v) : [];
                    } catch (e) { st.iscritti = undefined; }
                }
            } catch (e) { stagione = null; stagioni = []; risolviIds([]); }
            indiceNastro = 0;
            disegnaGiocatore();
            provaAnnuncio();
        };

        // ----- l'annuncio delle iscrizioni aperte: una volta per stagione, a chi non è ancora iscritto, dopo la schermata del titolo -----
        const annuncio = $('gx-annuncio');
        let annunciato = false;
        function provaAnnuncio() {
            if (!annuncio || !giocatore) return;
            if (splash && !splash.hidden) return;
            if (!annunciato && stagione) {
                const a = daAnnunciare({ stagione, giocatoreId: giocatore.id, iscritti: stagione.iscritti, vista: leggi(CHIAVE_ANNUNCIO) });
                if (a) {
                    annunciato = true;
                    scrivi(CHIAVE_ANNUNCIO, String(a.id));
                    $('gx-annuncio-nome').textContent = a.nome;
                    $('gx-annuncio-tempo').textContent = 'Closes in ' + a.tempo;
                    $('gx-annuncio-vai').setAttribute('href', a.href);
                    $('gx-annuncio-vai').setAttribute('data-iscrivi', String(a.id));
                    annuncio.hidden = false;
                    aggiornaClasse();
                    fai('ok');
                    return;
                }
            }
            provaAvvisi();
        }
        // ----- la richiesta delle notifiche: una volta sola, la prima volta che si apre il menù da collegati (e mai sopra l'annuncio di una stagione) -----
        const avvisi = $('gx-avvisi');
        let avvisiProvati = false;
        const caricaPush = () => new Promise(ok => {
            if (win.Push) { ok(win.Push); return; }
            const sc = doc.createElement('script');
            sc.src = 'push.js';
            sc.onload = () => ok(win.Push || null);
            sc.onerror = () => ok(null);
            doc.head.appendChild(sc);
        });
        function provaAvvisi() {
            if (avvisiProvati || !avvisi || !giocatore || (annuncio && !annuncio.hidden) || leggi(CHIAVE_AVVISI)) return;
            avvisiProvati = true;
            caricaPush().then(P => (P ? P.stato() : null)).then(st => {
                if (st === 'acceso' || st === 'negato') { scrivi(CHIAVE_AVVISI, '1'); return; }      // già decise: non si chiede
                if (st !== 'spento') return;                                                              // questo telefono non può riceverle
                avvisi.hidden = false;
                aggiornaClasse();
                fai('ok');
            }).catch(() => { /* niente richiesta: si riprova alla prossima apertura */ });
        }
        // ----- l'iscrizione a una stagione aperta: riepilogo e conferma qui, poi l'hub (prima JOIN portava all'hub senza iscrivere: si finiva con team iscritti e giocatore no) -----
        const iscr = $('gx-iscr');
        let iscrStagione = '';
        const chiudiIscr = () => { if (!iscr || iscr.hidden) return; iscr.hidden = true; aggiornaClasse(); };
        async function apriIscr(id) {
            if (!iscr || !id) return;
            iscrStagione = id;
            const errore = $('gx-iscr-errore');
            errore.hidden = true;
            try {
                const info = (await db().ref(`seasons/${id}/info`).once('value')).val() || {};
                $('gx-iscr-nome').textContent = info.name || `Season ${String(id).replace(/^s/, '')}`;
                const formati = info.selected_formats ? Object.values(info.selected_formats).join(' · ') : '';
                $('gx-iscr-info').textContent = [formati, info.showdowns_per_format ? `${info.showdowns_per_format} showdowns per format` : ''].filter(Boolean).join(' — ') || 'Confirm to register your profile to this competition.';
            } catch (e) { $('gx-iscr-nome').textContent = `Season ${String(id).replace(/^s/, '')}`; $('gx-iscr-info').textContent = ''; }
            iscr.hidden = false;
            aggiornaClasse();
        }
        if (iscr) {
            iscr.addEventListener('click', e => { if ((e.target.closest && e.target.closest('[data-chiudi]')) || e.target === iscr) chiudiIscr(); });
            const si = $('gx-iscr-si');
            if (si) si.addEventListener('click', async () => {
                const errore = $('gx-iscr-errore');
                const utenteAuth = auth().currentUser;
                if (!utenteAuth || !iscrStagione) { errore.textContent = 'Log in first.'; errore.hidden = false; return; }
                si.disabled = true;
                try {
                    const nome = (await db().ref(`users/${utenteAuth.uid}/name`).once('value')).val();
                    if (!nome) throw new Error('No player name');
                    const gia = (await db().ref(`seasons/${iscrStagione}/iscritti/${nome}`).once('value')).exists();
                    if (!gia) await db().ref(`seasons/${iscrStagione}/iscritti/${nome}`).set({ uid: utenteAuth.uid, timestamp: win.firebase.database.ServerValue.TIMESTAMP });
                    win.location.href = `hub.html?id=${encodeURIComponent(iscrStagione)}`;
                } catch (err) { errore.textContent = 'Could not register. Try again.'; errore.hidden = false; si.disabled = false; }
            });
        }
        // JOIN (il nastro, l'annuncio) non porta all'hub: prima si conferma l'iscrizione
        doc.addEventListener('click', e => {
            const a = e.target.closest ? e.target.closest('[data-iscrivi]') : null;
            if (!a) return;
            e.preventDefault();
            chiudiAnnuncio();
            apriIscr(a.getAttribute('data-iscrivi'));
        }, true);
        function chiudiAvvisi() { if (!avvisi || avvisi.hidden) return; scrivi(CHIAVE_AVVISI, '1'); avvisi.hidden = true; aggiornaClasse(); }
        if (avvisi) {
            avvisi.addEventListener('click', e => { if ((e.target.closest && e.target.closest('[data-chiudi]')) || e.target === avvisi) chiudiAvvisi(); });
            const si = $('gx-avvisi-si');
            if (si) si.addEventListener('click', () => {
                chiudiAvvisi();
                // il telefono mostra da sé la sua richiesta di permesso; se si rifiuta si può sempre riaccendere dalle impostazioni (tessera Alerts)
                if (win.Push) win.Push.attiva().catch(() => { /* resta spento */ });
            });
        }
        function chiudiAnnuncio() { if (!annuncio || annuncio.hidden) return; annuncio.hidden = true; aggiornaClasse(); provaAvvisi(); }
        if (annuncio) {
            annuncio.addEventListener('click', e => { if ((e.target.closest && e.target.closest('[data-chiudi]')) || e.target === annuncio) chiudiAnnuncio(); });
        }
        // il conto alla rovescia sta al minuto
        win.setInterval(() => {
            for (const st of stagioni) {
                if (st.stato !== 'open') continue;
                const scad = Date.parse(st.info.deadline);
                if (Number.isFinite(scad)) st.mancano = Math.max(0, scad - Date.now());
            }
            const nastro = $('gx-nastro');
            if (nastro && stagioni.length) nastro.innerHTML = htmlNastro();
        }, 30000);
        // con più stagioni da mostrare il nastro passa da una all'altra da solo (ogni quattro secondi, con una piccola animazione)
        win.setInterval(() => {
            if (stagioni.length < 2 || doc.hidden) return;
            indiceNastro = (indiceNastro + 1) % stagioni.length;
            const nastro = $('gx-nastro');
            if (!nastro) return;
            nastro.innerHTML = htmlNastro();
            nastro.classList.remove('cambia'); void nastro.offsetWidth; nastro.classList.add('cambia');
        }, PASSO_NASTRO);

        // ----- impostazioni -----
        const opzioni = C.creaOpzioni(win, {
            suonoAcceso, cambiaSuono,
            utente: () => (giocatore ? giocatore.nome : utente ? (utente.displayName || utente.email || 'Player') : ''),
            admin: () => admin,
            accedi: apriLogin,
            esci: () => { auth().signOut(); }
        });
        $('gx-opzioni-apri').addEventListener('click', () => opzioni.apri());

        disegnaHud();
        // le transizioni tra pagine (dove il browser le sa fare)
        const stile = doc.createElement('style');
        stile.textContent = '@view-transition { navigation: auto; }';
        doc.head.appendChild(stile);

        const parti = () => {
            auth().onAuthStateChanged(user => { caricaGiocatore(user); });
            caricaStagione();
            avviaGif();
        };
        if (win.firebase && win.firebase.apps && win.firebase.apps.length) parti();
        else { let n = 0; const t = win.setInterval(() => { if (win.firebase && win.firebase.apps && win.firebase.apps.length) { win.clearInterval(t); parti(); } else if (++n > 50) { win.clearInterval(t); risolviIds([]); avviaGif(); } }, 150); }

        return { opzioni, disegnaGiocatore };
    }

    return { statoStagione, stagioneDaMostrare, stagioniDaMostrare, tempoCheManca, riassuntoStagione, giaIscritto, daAnnunciare, htmlCarta, immaginiDi, avvia };
});
