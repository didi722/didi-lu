// =====================================================
// AMICHEVOLI — Poké-Tournament
// Sfidare un altro allenatore a una partita amichevole: fuori dalle stagioni, niente punti, niente statistiche, niente replay,
// niente storico. Si sceglie il formato (uno dell'elenco, un Random Battle di Showdown, oppure la modalità libera: ognuno porta
// un suo team di qualunque formato, tutti a livello 50), se è una partita sola o al meglio dei 3, 5 o 7 (e, in libera, singolo o doppio)
// e, in una serie, se i team restano fissi (si sceglie all'inizio e si tiene) o si possono cambiare dopo ogni partita della serie.
//
// Questo file è la finestra per lanciare la sfida e il collegamento con le Cloud Functions (sfidaAmichevole, rispondiAmichevole).
// La campanella delle notifiche (accetta, rifiuta, ritira, "riprendi la partita") sta in sfide.js, che carica questo file quando serve.
// La partita vera si gioca in battle.html?amichevole=ID, con le stesse funzioni di quelle ufficiali.
//
// Dati letti:
//   regolamenti                    i formati
//   players/{id}/teams             i team del Box, per sapere se si può giocare un formato (lo ricontrolla il server)
//   sfide/amichevoli               le sfide (per non farne due uguali)
//
//   Amichevoli.apri(nome)          la finestra per sfidare l'allenatore "nome"
//   Amichevoli.rispondi(id, r)     'accetta' | 'rifiuta' | 'ritira' -> risposta del server
//   Amichevoli.messaggioErrore(e)  l'errore di una chiamata, in parole del sito
//
// Funziona su qualsiasi pagina con Firebase (app, auth, database). Le Functions si caricano al primo uso.
// =====================================================
(function () {
    'use strict';

    const REGIONE = 'europe-west1';
    const SDK_FUNZIONI = 'https://www.gstatic.com/firebasejs/9.17.1/firebase-functions-compat.js';
    const UN_GIORNO = 24 * 3600 * 1000;
    const PERCORSO_SFIDE = 'sfide/amichevoli';

    const db = () => firebase.database();
    const idDi = n => String(n || '').toLowerCase().trim();
    const chiaveFormato = n => String(n || '').toLowerCase().trim();
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const eRandom = reg => !!(reg && String(reg.strutturaSito || '').toLowerCase().trim() === 'random');
    // partita sola, o al meglio dei 3, 5, 7 (come il server: functions/partita.js, SERIE_AMMESSE)
    const SERIE = [{ valore: 1, testo: 'One battle' }, { valore: 3, testo: 'Best of 3' }, { valore: 5, testo: 'Best of 5' }, { valore: 7, testo: 'Best of 7' }];


    // -----------------------------------------------------
    // 1. Cloud Functions
    // -----------------------------------------------------
    let promessaSdk = null;
    function caricaSdkFunzioni() {
        if (firebase.functions) return Promise.resolve();
        if (!promessaSdk) {
            promessaSdk = new Promise((ok, no) => {
                const sc = document.createElement('script');
                sc.src = SDK_FUNZIONI;
                sc.onload = ok;
                sc.onerror = () => { promessaSdk = null; no(new Error("The server connection didn't load. Check your connection and try again.")); };
                document.head.append(sc);
            });
        }
        return promessaSdk;
    }

    async function chiama(nome, dati) {
        await caricaSdkFunzioni();
        const funzioni = firebase.app().functions(REGIONE);
        return (await funzioni.httpsCallable(nome)(dati)).data;
    }

    // L'errore di una chiamata in parole del sito: il server risponde con testi già leggibili (failed-precondition), il resto no
    function messaggioErrore(e) {
        const codice = String((e && e.code) || '');
        const testo = String((e && e.message) || e || '');
        if (/unauthenticated/.test(codice)) return 'Log in to play friendly matches.';
        if (/not-found|unavailable|deadline|network/i.test(codice + ' ' + testo) && !/failed-precondition/.test(codice)) {
            return "The friendly matches aren't available right now. If this keeps happening, the server functions may not be published yet.";
        }
        if (/internal/.test(codice)) return 'The server had a problem. Try again in a moment.';
        return testo || 'Something went wrong. Try again.';
    }

    // risposta: 'accetta' | 'rifiuta' | 'ritira'
    const rispondi = (id, risposta) => chiama('rispondiAmichevole', { id, risposta });


    // -----------------------------------------------------
    // 2. Chi sono e cosa so
    // -----------------------------------------------------
    function utenteCorrente() {
        return new Promise(ok => {
            if (firebase.auth().currentUser) return ok(firebase.auth().currentUser);
            const stop = firebase.auth().onAuthStateChanged(u => { stop(); ok(u); });
        });
    }

    async function chiSono() {
        const utente = await utenteCorrente();
        if (!utente) return null;
        const nome = (await db().ref(`users/${utente.uid}/name`).once('value')).val();
        return nome ? { uid: utente.uid, nome, id: idDi(nome) } : null;
    }

    // Quanti team ha un giocatore nel Box: in tutto e per formato (per nome del formato, senza badare alle maiuscole)
    async function contaTeam(id) {
        const box = Object.values((await db().ref(`players/${id}/teams`).once('value')).val() || {}).filter(t => t);
        const perFormato = {};
        for (const t of box) {
            const k = chiaveFormato(t.categoria || t.category);
            if (k) perFormato[k] = (perFormato[k] || 0) + 1;
        }
        return { totale: box.length, perFormato };
    }


    // -----------------------------------------------------
    // 3. La finestra per lanciare la sfida
    // -----------------------------------------------------
    function el(tag, classe, html) {
        const e = document.createElement(tag);
        if (classe) e.className = classe;
        if (html != null) e.innerHTML = html;
        return e;
    }

    function avviso(testo) {
        let t = document.getElementById('sfide-toast');
        if (!t) {
            t = el('div', 'sfide-toast');
            t.id = 'sfide-toast';
            t.setAttribute('role', 'status');
            document.body.append(t);
        }
        t.textContent = testo;
        t.classList.add('visibile');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('visibile'), 4000);
    }

    function chiudiModale() {
        document.getElementById('amic-overlay')?.remove();
        document.removeEventListener('keydown', escModale);
        document.body.classList.remove('amic-aperta');
    }
    function escModale(e) { if (e.key === 'Escape') chiudiModale(); }

    // Gruppo di scelte "una sola": [{ valore, testo }] -> elemento; onCambio(valore)
    function scelte(etichetta, voci, iniziale, onCambio) {
        const gruppo = el('div', 'amic-gruppo');
        gruppo.setAttribute('role', 'radiogroup');
        gruppo.setAttribute('aria-label', etichetta);
        gruppo.append(el('span', 'amic-gruppo-nome', esc(etichetta)));
        const bottoni = voci.map(v => {
            const b = el('button', 'amic-scelta', esc(v.testo));
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.addEventListener('click', () => { seleziona(v.valore); onCambio(v.valore); });
            gruppo.append(b);
            return [v.valore, b];
        });
        function seleziona(valore) {
            for (const [v, b] of bottoni) {
                b.classList.toggle('scelta', v === valore);
                b.setAttribute('aria-checked', String(v === valore));
            }
        }
        seleziona(iniziale);
        return gruppo;
    }

    async function apri(nomeAvversario) {
        if (!window.firebase || !firebase.apps.length) return;
        const io = await chiSono();
        if (!io) {
            if (typeof window.toggleLoginModal === 'function') window.toggleLoginModal();
            else alert('Log in to challenge other trainers.');
            return;
        }
        const lui = { nome: String(nomeAvversario || '').trim(), id: idDi(nomeAvversario) };
        if (!lui.id || lui.id === io.id) return avviso("You can't challenge yourself");

        chiudiModale();
        const sopra = el('div', 'sfida-overlay');
        sopra.id = 'amic-overlay';
        const carta = el('div', 'sfida-card amic-card');
        carta.setAttribute('role', 'dialog');
        carta.setAttribute('aria-modal', 'true');
        carta.setAttribute('aria-labelledby', 'amic-titolo');
        carta.innerHTML = `
            <span class="sfida-sticker">Friendly match</span>
            <h2 id="amic-titolo">${esc(io.nome)} <small>vs</small> ${esc(lui.nome)}</h2>
            <p class="sfida-sotto">Just for fun: no points, no stats, no replay, nothing saved. Pick what to play.</p>
            <div class="sfida-corpo amic-corpo"><p class="sfida-messaggio">Loading…</p></div>
            <div class="sfida-azioni">
                <button type="button" class="amic-invia" id="amic-invia" disabled>Send challenge</button>
                <button type="button" class="amic-annulla" id="amic-annulla">Cancel</button>
            </div>`;
        sopra.append(carta);
        document.body.append(sopra);
        document.body.classList.add('amic-aperta');
        sopra.addEventListener('click', e => { if (e.target === sopra) chiudiModale(); });
        carta.querySelector('#amic-annulla').addEventListener('click', chiudiModale);
        document.addEventListener('keydown', escModale);

        const corpo = carta.querySelector('.amic-corpo');
        const invia = carta.querySelector('#amic-invia');
        const messaggio = testo => el('p', 'sfida-messaggio', esc(testo));

        let regolamenti, miei, suoi, sfide;
        try {
            [regolamenti, miei, suoi, sfide] = await Promise.all([
                db().ref('regolamenti').once('value').then(s => s.val() || {}),
                contaTeam(io.id),
                contaTeam(lui.id),
                db().ref(PERCORSO_SFIDE).once('value').then(s => s.val() || {}).catch(() => ({}))
            ]);
        } catch (e) {
            corpo.replaceChildren(messaggio("Couldn't load the formats. Close this window and try again."));
            return;
        }
        if (!document.body.contains(sopra)) return;      // chiusa nel frattempo

        // già una sfida in attesa tra i due (come dice il server): niente da lanciare
        const inAttesa = Object.values(sfide).find(s => s && s.stato === 'in_attesa' && (s.creata || 0) > Date.now() - UN_GIORNO
            && ((s.daId === io.id && s.aId === lui.id) || (s.daId === lui.id && s.aId === io.id)));
        if (inAttesa) {
            corpo.replaceChildren(messaggio(inAttesa.daId === io.id
                ? `Your friendly challenge is still waiting for ${lui.nome}. You can withdraw it from the bell.`
                : `${lui.nome} already challenged you to a friendly match. Answer from the bell.`));
            invia.hidden = true;
            return;
        }

        // Le voci: i formati (alfabetici, i Random in fondo) e la modalità libera
        const formati = Object.values(regolamenti).filter(r => r && r.categoria)
            .map(r => ({ nome: r.categoria, random: eRandom(r), reg: r }))
            .sort((a, b) => (a.random - b.random) || a.nome.localeCompare(b.nome));
        const voci = formati.map(f => {
            const nostri = miei.perFormato[chiaveFormato(f.nome)] || 0;
            const loro = suoi.perFormato[chiaveFormato(f.nome)] || 0;
            return { tipo: 'formato', nome: f.nome, random: f.random, nostri, loro, giocabile: f.random || nostri > 0 };
        });
        voci.push({ tipo: 'libera', nome: 'Free battle', random: false, nostri: miei.totale, loro: suoi.totale, giocabile: miei.totale > 0 });

        let scelta = null, serie = 1, stile = 'singles', cambioTeam = false;
        const elenco = el('div', 'sfida-formati amic-formati');
        elenco.setAttribute('role', 'radiogroup');
        elenco.setAttribute('aria-label', 'Format');
        const opzioniLibera = el('div', 'amic-opzioni');
        opzioniLibera.hidden = true;
        opzioniLibera.append(scelte('Battle style', [{ valore: 'singles', testo: 'Singles' }, { valore: 'doubles', testo: 'Doubles' }], stile, v => { stile = v; }));
        const nota = el('p', 'sfida-sotto amic-nota');
        nota.hidden = true;

        // I team in una serie: fissi, o cambiabili dopo ogni partita. Con una partita sola non c'è nulla da scegliere; nei Random i team
        // cambiano comunque a ogni partita, da soli.
        const opzioniSquadre = el('div', 'amic-opzioni');
        opzioniSquadre.append(scelte('Teams', [{ valore: false, testo: 'Fixed' }, { valore: true, testo: 'Change after each battle' }], cambioTeam, v => { cambioTeam = v; aggiornaSquadre(); }));
        const notaSquadre = el('p', 'sfida-sotto amic-nota');
        opzioniSquadre.append(notaSquadre);
        function aggiornaSquadre() {
            const random = !!(scelta && scelta.random);
            const sceglibili = serie > 1 && !random;
            opzioniSquadre.hidden = serie === 1;
            opzioniSquadre.querySelector('.amic-gruppo').hidden = !sceglibili;
            notaSquadre.textContent = random ? 'Showdown gives each of you new random teams in every battle.'
                : cambioTeam ? (scelta && scelta.tipo === 'libera' ? 'After every battle each of you can pick another team from your Box: any format goes.'
                    : 'After every battle each of you can pick another team, always in this format.')
                : 'Each of you picks a team at the start and keeps it for the whole series.';
        }

        const bottoniFormato = voci.map(v => {
            const b = el('button', 'sfida-formato amic-formato');
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', 'false');
            b.disabled = !v.giocabile;
            const etichetta = v.tipo === 'libera' ? 'Any team · level 50'
                : v.random ? 'Random teams'
                : v.giocabile ? `${v.nostri} of your teams` : 'no team of yours';
            b.innerHTML = `<span>${esc(v.nome)}</span><span class="sfida-rimasti">${esc(etichetta)}</span>`;
            b.addEventListener('click', () => {
                scelta = v;
                bottoniFormato.forEach(([, x]) => { x.classList.toggle('scelto', x === b); x.setAttribute('aria-checked', String(x === b)); });
                opzioniLibera.hidden = v.tipo !== 'libera';
                aggiornaSquadre();
                // chi sfidi non ha team: può accettare lo stesso dopo averne fatto uno (lo controlla il server), ma meglio saperlo
                const senzaTeam = !v.random && v.loro === 0;
                nota.hidden = !senzaTeam;
                nota.textContent = senzaTeam ? `${lui.nome} has no team for this yet: they'll have to build one in the Box before accepting.` : '';
                invia.disabled = false;
            });
            elenco.append(b);
            return [v, b];
        });

        const riga = el('div', 'amic-opzioni');
        riga.append(scelte('Length', SERIE, serie, v => { serie = v; aggiornaSquadre(); }));
        aggiornaSquadre();

        if (!voci.some(v => v.giocabile)) {
            corpo.replaceChildren(messaggio("You have no team in your Box yet: build one first, or challenge in a Random Battle format if there is one."), elenco);
        } else {
            corpo.replaceChildren(elenco, opzioniLibera, riga, opzioniSquadre, nota);
        }
        elenco.querySelector('button:not(:disabled)')?.focus();

        invia.addEventListener('click', async () => {
            if (!scelta) return;
            invia.disabled = true;
            invia.textContent = 'Sending…';
            try {
                await chiama('sfidaAmichevole', {
                    a: lui.nome, tipo: scelta.tipo, categoria: scelta.tipo === 'formato' ? scelta.nome : undefined,
                    stile: scelta.tipo === 'libera' ? stile : undefined, bestOf: serie,
                    cambioTeam: serie > 1 && !scelta.random && cambioTeam
                });
                chiudiModale();
                avviso(`Friendly challenge sent to ${lui.nome}`);
            } catch (e) {
                invia.disabled = false;
                invia.textContent = 'Send challenge';
                carta.querySelector('.amic-errore')?.remove();
                const errore = el('p', 'sfida-messaggio amic-errore', esc(messaggioErrore(e)));
                errore.setAttribute('role', 'alert');
                corpo.append(errore);
            }
        });
    }

    // -----------------------------------------------------
    // 4. I tasti per sfidare (Trainers, pagina pubblica)
    // -----------------------------------------------------
    const ICONA_SPADE = `
        <svg viewBox="-5 -5 34 34" fill="none" stroke="currentColor" stroke-width="3.2"
             stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
            <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline>
            <line x1="13" y1="19" x2="19" y2="13"></line>
            <line x1="16" y1="16" x2="20" y2="20"></line>
            <polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"></polyline>
            <line x1="5" y1="14" x2="9" y2="18"></line>
            <line x1="7" y1="17" x2="4" y2="20"></line>
        </svg>`;

    // Il tasto da scrivere dentro una pagina fatta di testo HTML (nascosto finché aggiornaTasti() non sa chi sei: il proprio non c'è).
    // Sta accanto alla card dell'allenatore, non dentro: la card è un collegamento e coi badge sarebbe troppo piena.
    function htmlTasto(nome) {
        return `<button type="button" class="tasto-amichevole" data-nome="${esc(nome)}" hidden
                title="Challenge ${esc(nome)} to a friendly match" aria-label="Challenge ${esc(nome)} to a friendly match"
                onclick="Amichevoli.clic(event, this)">${ICONA_SPADE}</button>`;
    }

    // Il clic sul tasto di un allenatore
    function clic(evento, tasto) {
        evento.preventDefault();
        apri(tasto.dataset.nome);
    }

    // Nasconde il proprio tasto (non ci si sfida da soli); chi non ha fatto il login li vede tutti: il clic apre il login
    async function aggiornaTasti(radice = document) {
        let mio = '';
        try { mio = ((await chiSono()) || {}).id || ''; } catch (e) { /* senza profilo si vedono tutti */ }
        radice.querySelectorAll('.tasto-amichevole[data-nome]').forEach(t => { t.hidden = !!mio && idDi(t.dataset.nome) === mio; });
    }

    window.Amichevoli = { apri, rispondi, chiama, messaggioErrore, htmlTasto, clic, aggiornaTasti, ICONA_SPADE };
})();
