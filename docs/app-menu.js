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
    const comune = typeof module === 'object' && module.exports ? require('./app-comune.js') : radice.AppComune;
    const M = fabbrica(comune);
    if (typeof module === 'object' && module.exports) module.exports = M;
    else {
        radice.MenuApp = M;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => M.avvia(radice)); else M.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (C) {
    'use strict';

    const CHIAVE_SPLASH = 'menuSplashVisto';          // sessionStorage: la schermata del titolo si vede una volta a visita
    const CHIAVE_ANNUNCIO = 'appStagioneVista';       // localStorage: l'ultima stagione annunciata (il messaggio compare una volta per stagione)
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

        // ----- le tessere -----
        const voci = (win.AppSito && win.AppSito.VOCI) || [];
        const sottotitoli = { matches: 'Play & watch the showdowns', box: 'Your teams', trainers: 'Rankings & challenges', stats: 'League numbers' };
        $('gx-tessere').innerHTML = voci.map((v, i) =>
            '<a class="gx-tessera gx-t-' + v.id + '" href="' + esc(v.href) + '" style="--c:' + esc(v.colore) + ';--i:' + i + '" data-suono="scegli">' +
                '<span class="gx-ico">' + svg(v.id) + '</span>' +
                '<b>' + esc(v.et) + '</b><small>' + esc(sottotitoli[v.id] || '') + '</small>' +
            '</a>').join('');

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
        const chiudiSplash = () => {
            if (!splash || splash.hidden) return;
            try { win.sessionStorage.setItem(CHIAVE_SPLASH, '1'); } catch (e) { /* la prossima volta si rivede */ }
            fai('avvio');
            avviaMusica();
            splash.classList.add('esce');
            html.classList.add('gx-pronto');
            win.setTimeout(() => { splash.hidden = true; provaAnnuncio(); }, 520);
        };
        if (splash && !giaVisto) {
            splash.hidden = false;
            splash.addEventListener('click', chiudiSplash);
            splash.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') chiudiSplash(); });
        } else html.classList.add('gx-pronto');

        // ----- la finestra di accesso -----
        const aggiornaClasse = () => html.classList.toggle('gx-dialogo-aperto', !!doc.querySelector('.gx-dialogo:not([hidden])'));
        const apriLogin = () => { const el = $('gx-login'); el.hidden = false; aggiornaClasse(); win.setTimeout(() => $('gx-email').focus(), 60); };
        const chiudiLogin = () => { $('gx-login').hidden = true; aggiornaClasse(); };
        $('gx-login').addEventListener('click', e => { if ((e.target.closest && e.target.closest('[data-chiudi]')) || e.target === $('gx-login')) chiudiLogin(); });
        doc.addEventListener('keydown', e => { if (e.key === 'Escape') { chiudiLogin(); chiudiAnnuncio(); } });
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
        let utente = null;
        let admin = false;
        let stagione = null;
        const pannelloGiocatore = () => {
            const s = stagione ? riassuntoStagione(stagione, !!giocatore && giaIscritto(stagione.iscritti, giocatore.id)) : null;
            const nastro = s
                ? '<a class="gx-stagione gx-st-' + s.stato + '" href="' + esc(s.href) + '" data-suono="scegli"><i class="gx-pallino"></i><span class="gx-st-testi"><b>' + esc(s.nome) + '</b><small>' + esc(s.testo) + '</small></span><em>' + esc(s.azione) + '</em></a>'
                : '';
            if (!giocatore) {
                return '<div class="gx-palco gx-ospite"><span class="gx-aura"></span><span class="gx-avatar gx-sagoma" aria-hidden="true">?</span><span class="gx-piattaforma"></span></div>' +
                    '<div class="gx-targa"><b class="gx-nome">Welcome!</b><small class="gx-titolo-g">Log in to play and vote</small></div>' +
                    '<button type="button" class="gx-bottone gx-primario gx-largo-b" id="gx-accedi" data-suono="apri">' + svg('entra', 'gx-icona-pic') + 'Log in</button>' + nastro;
            }
            const numeri = [
                '<li><b>' + (giocatore.elo == null ? 'N/A' : giocatore.elo) + '</b><span>Elo</span></li>',
                '<li><b>' + giocatore.vinte + '</b><span>Seasons won</span></li>'
            ].join('');
            return '<div class="gx-palco"><span class="gx-aura"></span><img class="gx-avatar" src="' + esc(giocatore.avatar) + '" alt="" onerror="this.onerror=null;this.src=\'immagini/magikarp.png\'"><span class="gx-piattaforma"></span></div>' +
                '<div class="gx-targa"><b class="gx-nome">' + esc(giocatore.nome) + '</b>' + (giocatore.titolo ? '<small class="gx-titolo-g">' + esc(giocatore.titolo) + '</small>' : '') + '</div>' +
                '<ul class="gx-numeri">' + numeri + '</ul>' + nastro;
        };
        const disegnaGiocatore = () => {
            $('gx-giocatore').innerHTML = pannelloGiocatore();
            const accedi = $('gx-accedi');
            if (accedi) accedi.addEventListener('click', apriLogin);
        };
        disegnaGiocatore();

        const caricaGiocatore = async user => {
            utente = user;
            giocatore = null;
            admin = false;
            const r = user ? await C.leggiGiocatore(win, user) : null;
            if (r) { giocatore = r.giocatore; admin = r.admin; }
            disegnaGiocatore();
            if (opzioni && opzioni.aperta()) opzioni.aggiorna();
            provaAnnuncio();
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
                stagione = stagioneDaMostrare(trovate, Date.now());
                // con le iscrizioni aperte serve sapere chi è già dentro (per il tasto del nastro e per l'annuncio)
                if (stagione && stagione.stato === 'open') {
                    try {
                        const v = (await db().ref('seasons/' + stagione.id + '/iscritti').once('value')).val();
                        stagione.iscritti = v ? Object.keys(v) : [];
                    } catch (e) { stagione.iscritti = undefined; }
                }
            } catch (e) { stagione = null; }
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
            if (!stagione || stagione.stato !== 'open') return;
            const scad = Date.parse(stagione.info.deadline);
            if (!Number.isFinite(scad)) return;
            stagione.mancano = Math.max(0, scad - Date.now());
            const t = doc.querySelector('.gx-stagione small');
            if (t) t.textContent = riassuntoStagione(stagione, !!giocatore && giaIscritto(stagione.iscritti, giocatore.id)).testo;
        }, 30000);

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
        };
        if (win.firebase && win.firebase.apps && win.firebase.apps.length) parti();
        else { let n = 0; const t = win.setInterval(() => { if (win.firebase && win.firebase.apps && win.firebase.apps.length) { win.clearInterval(t); parti(); } else if (++n > 50) win.clearInterval(t); }, 150); }

        return { opzioni, disegnaGiocatore };
    }

    return { statoStagione, stagioneDaMostrare, tempoCheManca, riassuntoStagione, giaIscritto, daAnnunciare, avvia };
});
