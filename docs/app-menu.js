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
        const pista = $('gx-tessere').querySelector('.gx-pista');
        const carte = [...$('gx-tessere').querySelectorAll('.gx-carta')];
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
                el.style.visibility = Math.abs(x) <= 1.02 ? 'visible' : 'hidden';
            });
        };
        /** Quale scena è quella guardata (per chi scorre da tastiera e per chi legge lo schermo): si aggiorna solo quando cambia */
        const segnaCentro = () => carte.forEach((el, i) => {
            el.classList.toggle('gx-centro', i === stato.corrente);
            el.tabIndex = i === stato.corrente ? 0 : -1;
            el.setAttribute('aria-hidden', i === stato.corrente ? 'false' : 'true');
        });
        const vai = i => {
            const n = Car.dentro(i, carte.length);
            if (n === stato.corrente) return;
            stato.corrente = n;
            try { win.sessionStorage.setItem(CHIAVE_CARTA, String(n)); } catch (e) { /* non si ricorda */ }
            segnaCentro();
            posiziona();
            fai('scegli');
        };
        const passo = verso => vai(Car.passo(stato.corrente, carte.length, verso, true));
        if (carte.length) {
            segnaCentro();
            posiziona();
            // mentre il dito si muove si aggiorna una volta per fotogramma (non a ogni evento: ce ne sono di più) e si tocca solo --x
            let ultima = null, inAttesa = false, timerFerma = null;
            const segui = (f, fine) => {
                pista.classList.toggle('trascinando', !fine);
                if (!fine) {
                    pista.classList.add('gx-ferma');
                    if (timerFerma !== null) { win.clearTimeout(timerFerma); timerFerma = null; }
                } else timerFerma = win.setTimeout(() => { timerFerma = null; pista.classList.remove('gx-ferma'); }, PAUSA_SCORRIMENTO);
                if (fine) { ultima = null; posiziona(0); return; }
                ultima = f;
                if (!inAttesa) { inAttesa = true; raf(() => { inAttesa = false; if (ultima !== null) posiziona(ultima); }); }
            };
            // si scorre da qualunque punto dello schermo (anche sopra il giocatore), non solo sulla scena
            Car.collegaGesti($('gx-lobby') || $('gx-tessere'), {
                avanti: () => passo(1), indietro: () => passo(-1), passoPx: () => doc.documentElement.clientWidth || 740 * Car.unitaPx(win), trascina: segui, senzaScorrimento: true
            });
            $('gx-tessere').addEventListener('click', e => {
                const c = e.target.closest ? e.target.closest('.gx-carta') : null;
                if (c && !c.classList.contains('gx-centro')) { e.preventDefault(); vai(Number(c.dataset.i)); }
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
            const mostra = f => { if (barra) barra.style.setProperty('--p', String(Math.min(1, f))); if (tocca) tocca.textContent = 'Loading ' + Math.round(Math.min(1, f) * 100) + '%'; };
            const parte = { scene: 0, gif: 0 }, finito = { scene: false, gif: false };
            const aggiorna = () => mostra(.2 * parte.scene + .8 * parte.gif);
            const prova = () => { if (finito.scene && finito.gif && caricando) { caricando = false; splash.classList.remove('carica'); if (tocca) tocca.textContent = testo; } };
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
            return '<a class="gx-stagione gx-st-' + s.stato + '" href="' + esc(s.href) + '" data-suono="scegli"><i class="gx-pallino"></i><span class="gx-st-testi"><b>' + esc(s.nome) + '</b></span>' + punti + '<em>' + esc(s.azione) + '</em></a>';
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
            if (annunciato || !annuncio || !giocatore || !stagione) return;
            if (splash && !splash.hidden) return;
            const a = daAnnunciare({ stagione, giocatoreId: giocatore.id, iscritti: stagione.iscritti, vista: leggi(CHIAVE_ANNUNCIO) });
            if (!a) return;
            annunciato = true;
            scrivi(CHIAVE_ANNUNCIO, String(a.id));
            $('gx-annuncio-nome').textContent = a.nome;
            $('gx-annuncio-tempo').textContent = 'Closes in ' + a.tempo;
            $('gx-annuncio-vai').setAttribute('href', a.href);
            annuncio.hidden = false;
            aggiornaClasse();
            fai('ok');
        }
        function chiudiAnnuncio() { if (!annuncio || annuncio.hidden) return; annuncio.hidden = true; aggiornaClasse(); }
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
