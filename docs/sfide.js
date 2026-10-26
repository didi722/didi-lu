// =====================================================
// SFIDE — Poké-Tournament
// Sfide lanciate dalla classifica, campanella delle notifiche,
// bottone delle battaglie in corso, accettazione (crea lo
// showdown e apre battle.html), elenco "Live now" in matches.html.
//
// Funziona su qualsiasi pagina: crea da solo i bottoni e i menu,
// si avvia da solo appena Firebase è inizializzato e segue TUTTE
// le stagioni non chiuse (sbeta, s1, s2, …), così campanella e
// spade non dipendono dalla stagione che la pagina sta mostrando.
//
// matches.html chiama Sfide.avvia({ stagione, infoStagione }) per
// dire qual è la stagione della pagina (classifica, VS, Live now).
//
// Dati:
//   sfide/{stagione}/{idSfida} = {
//     da, daId, a, aId, categoria, bestOf,
//     stato: 'in_attesa' | 'accettata' | 'rifiutata' | 'annullata',
//     creata, risposta, showdownId
//   }
//   notifiche/{uid}/{stagione}/{idSfida-stato} = timestamp di lettura
//
// Le sfide AMICHEVOLI (fuori dalle stagioni: niente punti, niente statistiche, niente replay) stanno in sfide/amichevoli/{id}, come
// se "amichevoli" fosse una stagione, e usano la stessa campanella e le stesse notifiche lette. Le crea e le gestisce il server
// (Cloud Functions sfidaAmichevole / rispondiAmichevole, chiamate da amichevoli.js, che qui si carica quando serve).
// =====================================================
(function () {
    'use strict';

    const MATCH_PER_SHOWDOWN = 3;
    const UN_GIORNO = 24 * 3600 * 1000;
    const SEI_ORE = 6 * 3600 * 1000;
    const AMICHEVOLI = 'amichevoli';   // la "stagione" delle sfide amichevoli (vedi sopra)
    const PAGINA = location.pathname.split('/').pop().toLowerCase();
    const IN_BATTAGLIA = PAGINA === 'battle.html';

    const S = {
        stagione: null,           // stagione della pagina (matches.html / battle.html), se c'è
        stagioni: {},             // id → dati della stagione seguita (vedi nuovaStagione)
        ascolti: {},              // id → [[ref, callback], …] per poterli staccare
        uidAscolti: null,         // utente per cui sono attivi gli ascoltatori
        scoperta: null,           // Promise: stagioni non chiuse trovate su Firebase
        giro: 0,                  // ogni chiamata ad avvia() annulla quelle ancora in corso
        avviato: false,
        utente: null,
        ioId: '',
        admin: false,
        letteLocali: new Set(),   // "stagione/chiave" lette in questa pagina
        nuoveAperte: new Set(),   // "stagione/chiave" da mostrare come "new" a menu aperto
        vistePendenti: new Set(), // "stagione/idSfida" mie viste in attesa in questa sessione
        inPartenza: false,
        nonLettePrima: 0,
        battagliePrima: 0,
        mvp: {},                  // id → stagione in cui votare l'MVP (vedi la sezione MVP)
        recenti: []               // [id, info] delle stagioni chiuse da meno di 24 ore
    };

    const db = () => firebase.database();
    const $ = id => document.getElementById(id);
    const idDi = n => String(n || '').toLowerCase().trim();
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const nuovaStagione = id => ({
        id, info: {}, iscritti: [], io: '',
        sfide: {}, showdowns: {}, lette: {},
        pronti: { sfide: false, lette: false },
        firma: null
    });
    const elencoStagioni = () => Object.values(S.stagioni);
    const pagina = () => (S.stagione ? S.stagioni[S.stagione] : null);


    // -----------------------------------------------------
    // 1. Showdown e sfide di una stagione (D = dati della stagione)
    // -----------------------------------------------------
    const matchValido = m => m && m.p1score != null && m.p2score != null;

    function matchSalvati(sd) {
        return Object.values(sd?.matches || {}).filter(matchValido).length;
    }

    function completato(sd) {
        return sd?.info?.isCompleted === true || matchSalvati(sd) >= MATCH_PER_SHOWDOWN;
    }

    function prossimoMatch(sd) {
        for (let n = 1; n <= MATCH_PER_SHOWDOWN; n++) {
            if (!matchValido(sd?.matches?.[`match${n}`])) return n;
        }
        return MATCH_PER_SHOWDOWN;
    }

    function coppia(x, y, a, b) {
        [x, y, a, b] = [x, y, a, b].map(idDi);
        return (x === a && y === b) || (x === b && y === a);
    }

    // [[id, showdown], ...] tra due giocatori (tutti gli stati), opzionalmente in un formato
    function showdownTra(D, a, b, formato) {
        return Object.entries(D.showdowns).filter(([, sd]) => {
            const i = sd?.info || {};
            return coppia(i.player1, i.player2, a, b) && (!formato || i.categoria === formato);
        });
    }

    function sfideInAttesaTra(D, a, b) {
        return Object.entries(D.sfide).filter(([, s]) => s?.stato === 'in_attesa' && coppia(s.daId, s.aId, a, b));
    }

    // Stesso campo usato da matches.html: 0 = nessun limite
    const massimo = D => parseInt(D.info.showdowns_per_format, 10) || 0;

    function rimasti(D, a, b, formato) {
        if (!massimo(D)) return Infinity;
        const inAttesa = sfideInAttesaTra(D, a, b).filter(([, s]) => s.categoria === formato).length;
        return Math.max(0, massimo(D) - showdownTra(D, a, b, formato).length - inAttesa);
    }

    // Formati su cui due giocatori hanno già qualcosa di attivo: una sfida in attesa o uno showdown non
    // concluso. Su un formato occupato non se ne può lanciare un'altra; sugli altri formati sì.
    // -> { inAttesa: [[id, sfida]], inCorso: [[id, showdown]], occupati: Set<formato> }
    function formatiOccupati(D, a, b) {
        const inAttesa = sfideInAttesaTra(D, a, b);
        const inCorso = showdownTra(D, a, b).filter(([, sd]) => !completato(sd));
        const occupati = new Set([
            ...inAttesa.map(([, s]) => s.categoria),
            ...inCorso.map(([, sd]) => sd.info.categoria)
        ]);
        return { inAttesa, inCorso, occupati };
    }

    const chiusa = info => String(info?.status || '').toUpperCase().trim() === 'CLOSED';
    const formatiStagione = D => Object.values(D.info.selected_formats || {});
    const bestOf = D => parseInt(D.info.best_of, 10) === 5 ? 5 : 3;
    const nomeIscritto = (D, nome) => D.iscritti.find(p => idDi(p) === idDi(nome)) || nome;

    function linkBattaglia(stagione, sdId, n) {
        return `battle.html?stagione=${encodeURIComponent(stagione)}&showdown=${encodeURIComponent(sdId)}&match=${n}`;
    }

    function oggi() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function quandoFa(ts) {
        if (!ts) return '';
        const min = Math.round((Date.now() - ts) / 60000);
        if (min < 1) return 'just now';
        if (min < 60) return `${min} min ago`;
        const ore = Math.round(min / 60);
        return ore < 24 ? `${ore} h ago` : new Date(ts).toLocaleDateString();
    }

    // Showdown non conclusi di una stagione, con punteggio e "tocca a me"
    function battaglieInCorso(D) {
        if (!D) return [];
        return Object.entries(D.showdowns)
            .filter(([, sd]) => sd?.info && !completato(sd))
            .map(([id, sd]) => {
                const i = sd.info;
                let v1 = 0, v2 = 0;
                Object.values(sd.matches || {}).filter(matchValido).forEach(m => {
                    if (+m.p1score > +m.p2score) v1++;
                    else if (+m.p2score > +m.p1score) v2++;
                });
                const sono1 = !!S.ioId && idDi(i.player1) === S.ioId;
                const sono2 = !!S.ioId && idDi(i.player2) === S.ioId;
                return {
                    stagione: D.id, id, sd, i, v1, v2,
                    n: prossimoMatch(sd),
                    gioco: sono1 || sono2,
                    avversario: sono1 ? i.player2 : i.player1,
                    mioPunteggio: sono2 ? `${v2} - ${v1}` : `${v1} - ${v2}`,
                    ordine: String(i.timestamp || ''),
                    quando: Date.parse(i.lastUpdate || i.timestamp) || 0
                };
            });
    }

    const dalPiuRecente = (x, y) => y.ordine.localeCompare(x.ordine);


    // -----------------------------------------------------
    // 2. Bottoni e menu (creati dallo script, uguali su ogni pagina)
    // -----------------------------------------------------
    const ICONA_CAMPANELLA = `
        <svg viewBox="-5 -5 34 34" fill="none" stroke="currentColor" stroke-width="3.5"
             stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>`;

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

    // [bottone, badge, menu]
    const CAMPANELLA = ['sfide-control', 'sfide-badge', 'sfide-dropdown'];
    const BATTAGLIE = ['sfide-live-control', 'sfide-live-badge', 'sfide-live-dropdown'];

    function creaBottone([idBtn, idBadge, idMenu], classe, etichetta, icona) {
        if ($(idBtn)?.dataset.pronto) return;
        // Se la pagina ha ancora il vecchio markup, lo sostituisco
        $(idBtn)?.remove();
        $(idMenu)?.remove();

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = idBtn;
        btn.className = `sfide-btn ${classe}`;
        btn.hidden = true;
        btn.dataset.pronto = '1';
        btn.setAttribute('aria-label', etichetta);
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', idMenu);
        btn.innerHTML = `${icona}<span id="${idBadge}" class="sfide-badge" hidden>0</span>`;

        const menu = document.createElement('div');
        menu.id = idMenu;
        menu.className = 'sfide-dropdown';
        menu.hidden = true;

        document.body.append(btn, menu);
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (menu.hidden) apriMenu(idBtn);
            else chiudiMenu();
        });
        menu.addEventListener('click', e => e.stopPropagation());
    }

    function creaInterfaccia() {
        creaBottone(CAMPANELLA, 'sfide-campanella', 'Notifications', ICONA_CAMPANELLA);
        creaBottone(BATTAGLIE, 'sfide-live-btn', 'Battles in progress', ICONA_SPADE);
        if (document.documentElement.dataset.sfideMenu) return;
        document.documentElement.dataset.sfideMenu = '1';
        document.addEventListener('click', () => chiudiMenu());
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            const aperto = [CAMPANELLA, BATTAGLIE].find(([, , m]) => $(m) && !$(m).hidden);
            if (aperto) { chiudiMenu(); $(aperto[0])?.focus(); }
        });
    }

    function apriMenu(idBtn) {
        chiudiMenu();
        const [b, , m] = idBtn === CAMPANELLA[0] ? CAMPANELLA : BATTAGLIE;
        $(m).hidden = false;
        $(b).setAttribute('aria-expanded', 'true');
        if (b === CAMPANELLA[0]) {
            S.nuoveAperte.clear();
            disegnaCampanella();   // a menu aperto segna come lette quelle visibili
        }
    }

    function chiudiMenu() {
        for (const [b, , m] of [CAMPANELLA, BATTAGLIE]) {
            if (!$(m) || $(m).hidden) continue;
            $(m).hidden = true;
            $(b)?.setAttribute('aria-expanded', 'false');
            if (b === CAMPANELLA[0]) {
                S.nuoveAperte.clear();
                disegnaCampanella();
            }
        }
    }

    function aggiornaVisibilita() {
        const campanella = $(CAMPANELLA[0]);
        if (campanella) {
            // La campanella serve a chi è iscritto ad almeno una stagione seguita
            campanella.hidden = !(S.utente && (elencoStagioni().some(D => D.io) || Object.values(S.mvp).some(M => M.io)));
            if (campanella.hidden) $(CAMPANELLA[2]).hidden = true;
        }
        // Se la campanella non c'è, le spade prendono il suo posto
        $(BATTAGLIE[0])?.classList.toggle('senza-campanella', !campanella || campanella.hidden);
    }


    // -----------------------------------------------------
    // 3. Avvio (automatico, oppure chiamato dalla pagina)
    // -----------------------------------------------------
    function utenteCorrente() {
        return new Promise(ok => {
            if (firebase.auth().currentUser) return ok(firebase.auth().currentUser);
            const stop = firebase.auth().onAuthStateChanged(u => { stop(); ok(u); });
        });
    }

    // Tutte le stagioni non chiuse: sbeta, s1, s2, … (come l'index) + settings/currentSeason
    async function trovaStagioniAperte() {
        const leggi = id => db().ref(`seasons/${id}/info`).once('value')
            .then(s => [id, s.val()]).catch(() => [id, null]);

        const [beta, corrente] = await Promise.all([
            leggi('sbeta'),
            db().ref('settings/currentSeason').once('value').then(s => s.val()).catch(() => null)
        ]);
        const trovate = [beta];
        for (let da = 0; da < 500; da += 10) {
            const blocco = await Promise.all(Array.from({ length: 10 }, (_, i) => leggi(`s${da + i}`)));
            trovate.push(...blocco);
            if (!blocco[blocco.length - 1][1]) break;   // l'ultima del blocco non esiste: finito
        }
        if (corrente && !trovate.some(([id]) => id === corrente)) trovate.push(await leggi(corrente));
        // chiuse da meno di 24 ore: non si seguono (niente sfide), ma l'MVP si può ancora votare (vedi la sezione MVP)
        S.recenti = trovate.filter(([, info]) => info && chiusa(info) && Date.parse(info.chiusaIl) > Date.now() - UN_GIORNO);
        return trovate.filter(([, info]) => info && !chiusa(info));
    }

    function stagioneDallaPagina() {
        const p = new URLSearchParams(location.search);
        if (p.get('stagione')) return p.get('stagione');
        if (PAGINA === 'matches.html' && p.get('id')) return p.get('id');
        return null;
    }

    async function avvia({ stagione, infoStagione } = {}) {
        if (!window.firebase || !firebase.apps.length) return;
        const giro = ++S.giro;
        S.avviato = true;
        creaInterfaccia();

        stagione = stagione || S.stagione || stagioneDallaPagina();
        const utente = await utenteCorrente();
        if (!S.scoperta) S.scoperta = trovaStagioniAperte();

        const [aperte, datiUtente] = await Promise.all([
            S.scoperta,
            utente ? db().ref(`users/${utente.uid}`).once('value').then(s => s.val() || {}).catch(() => ({})) : {}
        ]);
        if (giro !== S.giro) return;

        // Stagioni da seguire: quelle non chiuse + quella della pagina (anche se chiusa)
        const desiderate = new Map(aperte);
        if (stagione) {
            const info = infoStagione || desiderate.get(stagione)
                || (await db().ref(`seasons/${stagione}/info`).once('value')).val() || {};
            desiderate.set(stagione, info);
        }
        // Le sfide amichevoli: una "stagione" a parte, per chiunque abbia fatto il login (non ha iscritti: possono giocare tutti)
        if (utente) desiderate.set(AMICHEVOLI, { name: 'Friendly matches', status: 'playing' });
        const ids = [...desiderate.keys()];
        const iscritti = await Promise.all(ids.map(id => id === AMICHEVOLI ? [] : db().ref(`seasons/${id}/iscritti`).once('value')
            .then(s => Object.keys(s.val() || {})).catch(() => [])));
        if (giro !== S.giro) return;   // nel frattempo è partita un'altra chiamata

        // ---- da qui in poi niente await: lo stato cambia tutto insieme ----
        const uid = utente?.uid || '';
        if (S.uidAscolti !== uid) {
            Object.keys(S.stagioni).forEach(stacca);
            Object.keys(S.mvp).forEach(staccaMvp);
            S.uidAscolti = uid;
        }
        S.utente = utente;
        S.admin = datiUtente.role === 'admin';
        S.ioId = idDi(datiUtente.name);
        S.stagione = stagione || null;

        Object.keys(S.stagioni).filter(id => !desiderate.has(id)).forEach(stacca);
        ids.forEach((id, k) => {
            const nuova = !S.stagioni[id];
            const D = S.stagioni[id] || (S.stagioni[id] = nuovaStagione(id));
            D.info = desiderate.get(id) || {};
            D.iscritti = iscritti[k];
            D.amichevole = id === AMICHEVOLI;
            D.io = S.ioId ? (D.amichevole ? datiUtente.name : (D.iscritti.find(p => idDi(p) === S.ioId) || '')) : '';
            if (nuova) ascolta(D);
        });

        aggiornaVisibilita();
        ridisegna();
        avviaMvp(giro);
    }

    function stacca(id) {
        (S.ascolti[id] || []).forEach(([ref, cb]) => ref.off('value', cb));
        delete S.ascolti[id];
        delete S.stagioni[id];
    }

    function ascolta(D) {
        const refs = S.ascolti[D.id] = [];
        const attiva = () => S.stagioni[D.id] === D;
        const segui = (percorso, cb, errore) => {
            const ref = db().ref(percorso);
            const fn = snap => { if (attiva()) cb(snap); };
            ref.on('value', fn, errore);
            refs.push([ref, fn]);
        };

        // (le sfide amichevoli non hanno showdown)
        if (!D.amichevole) segui(`seasons/${D.id}/showdowns`, snap => {
            D.showdowns = snap.val() || {};
            const firma = Object.keys(D.showdowns).sort()
                .map(id => `${id}:${matchSalvati(D.showdowns[id])}`).join('|');
            const cambiata = D.firma !== null && firma !== D.firma;
            D.firma = firma;

            controllaAccettate();
            ridisegna();
            // Un match salvato o uno showdown concluso: matches.html ricarica griglia e classifica
            if (cambiata && D.id === S.stagione && typeof window.inizializzaPaginaArchivio === 'function') {
                window.inizializzaPaginaArchivio();
            }
        });

        if (!S.utente) return;

        segui(`sfide/${D.id}`, snap => {
            D.sfide = snap.val() || {};
            D.pronti.sfide = true;
            controllaAccettate();
            disegnaCampanella();
        }, err => {
            console.warn(`Sfide di ${D.id} non leggibili: controlla le regole del database`, err);
            D.pronti.sfide = true;
        });

        // Notifiche lette: condivise in tempo reale tra pagine, schede e dispositivi
        segui(`notifiche/${S.utente.uid}/${D.id}`, snap => {
            D.lette = snap.val() || {};
            D.pronti.lette = true;
            disegnaCampanella();
        }, err => {
            console.warn('Notifiche lette non leggibili: controlla le regole del database', err);
            D.pronti.lette = true;
            if (attiva()) disegnaCampanella();
        });
    }

    function ridisegna() {
        disegnaLive();
        disegnaBattaglie();
        disegnaCampanella();
        aggiornaBottoniRanking();
    }

    // Su ogni pagina che carica sfide.js: parte da sola quando Firebase è pronto,
    // e riparte se l'utente fa login o logout senza ricaricare la pagina
    function avvioAutomatico() {
        let tentativi = 0;
        const prova = () => {
            if (!(window.firebase && firebase.apps.length)) {
                if (++tentativi < 50) setTimeout(prova, 200);
                return;
            }
            if (!S.avviato) avvia();
            firebase.auth().onAuthStateChanged(u => {
                if (S.uidAscolti !== null && (u?.uid || '') !== S.uidAscolti) avvia();
            });
        };
        prova();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvioAutomatico);
    else avvioAutomatico();


    // -----------------------------------------------------
    // 4. Bottone nella classifica (stagione della pagina)
    // -----------------------------------------------------
    // C'è ancora qualcosa da fare contro `nome` in questa stagione? No quando non resta nessun formato con showdown da giocare e non c'è
    // niente di attivo (una sfida in attesa o uno showdown da riprendere tengono il tasto, perché da lì si risponde o si riprende)
    function dacoSfidare(D, nome) {
        if (formatiOccupati(D, D.io, nome).occupati.size) return true;
        return formatiStagione(D).some(f => rimasti(D, D.io, nome, f) > 0);
    }

    function bottoneRanking(nome) {
        const D = pagina();
        if (!D || !S.utente || !D.io || chiusa(D.info)) return '';
        if (idDi(nome) === S.ioId) return '';
        if (!D.iscritti.some(p => idDi(p) === idDi(nome))) return '';
        if (!dacoSfidare(D, nome)) return '';
        return `<button type="button" class="sfida-rank-btn" data-nome="${esc(nome)}"
                    title="Challenge ${esc(nome)}" aria-label="Challenge ${esc(nome)}"
                    onclick="event.stopPropagation(); Sfide.apriSfida(this.dataset.nome)">VS</button>`;
    }

    // La classifica si disegna una volta sola, magari prima che arrivino gli showdown: quando i dati cambiano i tasti già in pagina si
    // nascondono (o tornano) senza ridisegnarla
    function aggiornaBottoniRanking() {
        const D = pagina();
        if (!D || !D.io) return;
        document.querySelectorAll('.sfida-rank-btn[data-nome]').forEach(b => { b.hidden = !dacoSfidare(D, b.dataset.nome); });
    }


    // -----------------------------------------------------
    // 5. Finestra per lanciare la sfida
    // -----------------------------------------------------
    function chiudiModale() {
        $('sfida-overlay')?.remove();
        document.removeEventListener('keydown', escModale);
    }
    function escModale(e) {
        if (e.key === 'Escape') chiudiModale();
    }

    // `stagione`: per le pagine che non sono una stagione (profile.html); da matches.html si lascia vuota
    function apriSfida(nome, stagione) {
        const D = stagione ? S.stagioni[stagione] : pagina();
        if (!D) return stagione ? mostraAvviso('Still loading, try again in a moment') : undefined;
        nome = nomeIscritto(D, nome);
        if (!S.utente) {
            if (typeof window.toggleLoginModal === 'function') window.toggleLoginModal();
            return;
        }
        if (!D.io) return alert('You are not registered in this season.');
        if (idDi(nome) === S.ioId || chiusa(D.info)) return;

        chiudiModale();
        const overlay = document.createElement('div');
        overlay.id = 'sfida-overlay';
        overlay.className = 'sfida-overlay';
        overlay.innerHTML = `
            <div class="sfida-card" role="dialog" aria-modal="true" aria-labelledby="sfida-titolo">
                <span class="sfida-sticker">Challenge</span>
                <h2 id="sfida-titolo">${esc(D.io)} <small>vs</small> ${esc(nome)}</h2>
                <p class="sfida-sotto">${MATCH_PER_SHOWDOWN} matches, best of ${bestOf(D)} each. Pick the format.</p>
                <div class="sfida-corpo"></div>
                <div class="sfida-azioni">
                    <button type="button" class="btn-save" id="sfida-invia" disabled>Send challenge</button>
                    <button type="button" class="btn-cancel" id="sfida-annulla">Cancel</button>
                </div>
            </div>`;
        document.body.append(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) chiudiModale(); });
        overlay.querySelector('#sfida-annulla').addEventListener('click', chiudiModale);
        document.addEventListener('keydown', escModale);

        const corpo = overlay.querySelector('.sfida-corpo');
        const invia = overlay.querySelector('#sfida-invia');
        const messaggio = testo => corpo.append(Object.assign(document.createElement('p'),
            { className: 'sfida-messaggio', textContent: testo }));

        // Per ogni coppia una sola cosa attiva per formato (sfida in attesa o showdown in corso):
        // si possono avere più sfide attive contro lo stesso giocatore, ma in formati diversi.
        const { inAttesa, inCorso, occupati } = formatiOccupati(D, D.io, nome);

        for (const [sdId, sd] of inCorso) {
            const p = document.createElement('p');
            p.className = 'sfida-messaggio';
            p.append(`You already have a showdown in progress against ${nome} (${sd.info.categoria}). `);
            const riprendi = document.createElement('a');
            riprendi.className = 'sfida-riprendi';
            riprendi.href = linkBattaglia(D.id, sdId, prossimoMatch(sd));
            riprendi.textContent = 'Resume';
            p.append(riprendi);
            corpo.append(p);
        }
        for (const [, s] of inAttesa) {
            messaggio(s.daId === S.ioId
                ? `Your ${s.categoria} challenge is still waiting for ${nome}.`
                : `${nome} already challenged you in ${s.categoria}. Answer from the bell.`);
        }

        // Solo i formati liberi e con showdown ancora da giocare
        const formati = formatiStagione(D)
            .filter(f => !occupati.has(f))
            .map(f => [f, rimasti(D, D.io, nome, f)])
            .filter(([, r]) => r > 0);
        if (!formati.length) {
            if (!occupati.size) messaggio(`You have played every showdown against ${nome} this season.`);
            else messaggio(`No other format is free to challenge ${nome} right now.`);
            invia.hidden = true;
            return;
        }
        if (occupati.size) {
            const p = document.createElement('p');
            p.className = 'sfida-sotto';
            p.textContent = 'You can still challenge in another format:';
            corpo.append(p);
        }

        let scelto = null;
        const lista = document.createElement('div');
        lista.className = 'sfida-formati';
        for (const [f, r] of formati) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'sfida-formato';
            b.setAttribute('aria-pressed', 'false');
            b.innerHTML = `<span>${esc(f)}</span><span class="sfida-rimasti">${r === Infinity ? 'no limit' : `${r} left`}</span>`;
            b.addEventListener('click', () => {
                scelto = f;
                lista.querySelectorAll('.sfida-formato').forEach(x => {
                    x.classList.toggle('scelto', x === b);
                    x.setAttribute('aria-pressed', String(x === b));
                });
                invia.disabled = false;
            });
            lista.append(b);
        }
        corpo.append(lista);
        lista.querySelector('button')?.focus();
        invia.addEventListener('click', () => { if (scelto) lancia(D, nome, scelto, invia); });
    }

    async function lancia(D, nome, formato, bottone) {
        bottone.disabled = true;
        // Ricontrollo con i dati più freschi
        if (formatiOccupati(D, D.io, nome).occupati.has(formato)) {
            chiudiModale();
            return mostraAvviso(`There is already an active ${formato} challenge or showdown with ${nome}`);
        }
        if (rimasti(D, D.io, nome, formato) <= 0) {
            chiudiModale();
            return mostraAvviso(`No ${formato} showdowns left against ${nome}`);
        }
        try {
            await db().ref(`sfide/${D.id}`).push({
                da: D.io, daId: S.ioId,
                a: nome, aId: idDi(nome),
                categoria: formato,
                bestOf: bestOf(D),
                stato: 'in_attesa',
                creata: firebase.database.ServerValue.TIMESTAMP
            });
            chiudiModale();
            mostraAvviso(`Challenge sent to ${nome}`);
        } catch (e) {
            bottone.disabled = false;
            alert(`The challenge was not sent: ${e.message}`);
        }
    }


    // -----------------------------------------------------
    // 6. Risposte: accetta, rifiuta, annulla
    // -----------------------------------------------------
    // Cambia stato solo se la sfida è ancora in attesa
    async function cambiaStato(D, id, nuovo) {
        if (D.amichevole) return rispondiAmichevole(id, nuovo === 'rifiutata' ? 'rifiuta' : 'ritira');
        try {
            await db().ref(`sfide/${D.id}/${id}`).transaction(cur => {
                if (cur === null) return null;          // cache vuota: Firebase riprova col valore vero
                if (cur.stato !== 'in_attesa') return;  // già gestita: annullo
                return { ...cur, stato: nuovo, risposta: Date.now() };
            });
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    }

    async function accetta(D, id) {
        if (D.amichevole) return accettaAmichevole(id);
        const sf = D.sfide[id];
        if (!sf || sf.aId !== S.ioId || sf.stato !== 'in_attesa') return;

        if (massimo(D) && showdownTra(D, sf.daId, sf.aId, sf.categoria).length >= massimo(D)) {
            alert(`You have already played every ${sf.categoria} showdown against ${sf.da}.`);
            return cambiaStato(D, id, 'annullata');
        }

        const rif = db().ref(`sfide/${D.id}/${id}`);
        const sdId = db().ref(`seasons/${D.id}/showdowns`).push().key;

        // 1. Blocco la sfida: se nel frattempo è stata annullata, non succede nulla
        let esito;
        try {
            esito = await rif.transaction(cur => {
                if (cur === null) return null;
                if (cur.stato !== 'in_attesa') return;
                return { ...cur, stato: 'accettata', showdownId: sdId, risposta: Date.now() };
            });
        } catch (e) {
            return alert('This challenge is no longer available.');
        }
        if (!esito.committed || esito.snapshot.val()?.showdownId !== sdId) {
            return alert('This challenge is no longer available.');
        }

        // 2. Creo lo showdown (stessa struttura di inizializzaShowdown in matches.html)
        const adesso = new Date().toISOString();
        try {
            await db().ref(`seasons/${D.id}/showdowns/${sdId}`).set({
                info: {
                    player1: sf.da, player1Id: sf.daId,
                    player2: sf.a, player2Id: sf.aId,
                    categoria: sf.categoria,
                    data: oggi(),
                    status: 'in_progress',
                    sfidaId: id,
                    timestamp: adesso,
                    lastUpdate: adesso
                }
            });
        } catch (e) {
            await rif.update({ stato: 'in_attesa', showdownId: null, risposta: null }).catch(() => {});
            return alert(`The showdown was not created: ${e.message}`);
        }

        // 3. Si parte dal match 1
        location.href = linkBattaglia(D.id, sdId, 1);
    }

    // ---- Sfide amichevoli: le risposte le dà il server (amichevoli.js, caricato quando serve) ----
    const linkAmichevole = id => `battle.html?amichevole=${encodeURIComponent(id)}`;

    // "Free battle · singles, level 50 · best of 3", "OU · best of 5, teams can change", "OU · one battle"
    function descrizioneAmichevole(s) {
        const cosa = s.libera ? `Free battle · ${s.stile === 'doubles' ? 'doubles' : 'singles'}, level 50` : s.categoria;
        const serie = s.bestOf > 1 ? `best of ${s.bestOf}${s.cambioTeam ? ', teams can change' : ''}` : 'one battle';
        return `${cosa} · ${serie}`;
    }

    let promessaAmichevoli = null;
    function caricaAmichevoli() {
        if (window.Amichevoli) return Promise.resolve(window.Amichevoli);
        if (!promessaAmichevoli) {
            promessaAmichevoli = new Promise(ok => {
                const sc = document.createElement('script');
                sc.src = 'amichevoli.js';
                sc.onload = () => ok(window.Amichevoli || null);
                sc.onerror = () => { promessaAmichevoli = null; ok(null); };
                document.head.append(sc);
            });
        }
        return promessaAmichevoli;
    }

    // risposta: 'accetta' | 'rifiuta' | 'ritira'. Restituisce la risposta del server, o null (e un avviso) se non è andata
    async function rispondiAmichevole(id, risposta) {
        const A = await caricaAmichevoli();
        if (!A) { mostraAvviso("Couldn't load the friendly matches. Reload the page and try again"); return null; }
        try {
            return await A.rispondi(id, risposta);
        } catch (e) {
            mostraAvviso(A.messaggioErrore(e));
            return null;
        }
    }

    async function accettaAmichevole(id) {
        const r = await rispondiAmichevole(id, 'accetta');
        if (r && r.partita) {
            S.inPartenza = true;
            location.href = linkAmichevole(id);
        }
    }

    // Lo sfidante viene portato in battaglia quando l'altro accetta
    // (ma non se sta già giocando un'altra battaglia)
    function controllaAccettate() {
        if (!S.ioId || S.inPartenza) return;
        for (const D of elencoStagioni()) {
            for (const [id, s] of Object.entries(D.sfide)) {
                if (!s || s.daId !== S.ioId) continue;
                const chiave = `${D.id}/${id}`;
                if (s.stato === 'in_attesa') { S.vistePendenti.add(chiave); continue; }
                // in una stagione la battaglia è pronta quando c'è lo showdown, in un'amichevole quando c'è la partita
                const pronta = D.amichevole ? !!s.partita : !!(s.showdownId && D.showdowns[s.showdownId]);
                if (s.stato === 'accettata' && pronta && S.vistePendenti.has(chiave)) {
                    S.vistePendenti.delete(chiave);
                    const cosa = D.amichevole ? 'your friendly challenge' : 'your challenge';
                    if (IN_BATTAGLIA) {
                        mostraAvviso(`${s.a} accepted ${cosa}`);
                        continue;
                    }
                    S.inPartenza = true;
                    segnaLette([{ D, chiave: chiaveNotifica(id, s) }]);
                    mostraAvviso(`${s.a} accepted. Opening the battle…`);
                    setTimeout(() => { location.href = D.amichevole ? linkAmichevole(id) : linkBattaglia(D.id, s.showdownId, 1); }, 1500);
                    return;
                }
            }
        }
    }


    // -----------------------------------------------------
    // 7. Notifiche: cosa sono e quali sono già lette
    // -----------------------------------------------------
    const chiaveNotifica = (id, s) => `${id}-${s.stato}`;
    const letta = (D, chiave) => !!D.lette[chiave] || S.letteLocali.has(`${D.id}/${chiave}`);

    // Sfide ricevute in attesa + risposte alle mie sfide nelle ultime 24 ore, in tutte le stagioni
    function notifiche() {
        if (!S.ioId) return [];
        const ieri = Date.now() - UN_GIORNO;
        const elenco = [];
        for (const D of elencoStagioni()) {
            for (const [id, s] of Object.entries(D.sfide)) {
                if (!s) continue;
                if (s.stato === 'in_attesa' && s.aId === S.ioId) {
                    if (D.amichevole && (s.creata || 0) < Date.now() - UN_GIORNO) continue;      // una sfida amichevole scade dopo un giorno
                    elenco.push({ D, id, s, tipo: 'ricevuta', quando: s.creata });
                } else if (s.daId === S.ioId && ['accettata', 'rifiutata'].includes(s.stato) && (s.risposta || 0) > ieri) {
                    elenco.push({ D, id, s, tipo: s.stato, quando: s.risposta });
                }
            }
        }
        return elenco
            .map(n => ({ ...n, chiave: chiaveNotifica(n.id, n.s) }))
            .concat(notificheMvp())
            .sort((x, y) => (y.quando || 0) - (x.quando || 0));
    }

    // voci: [{ D, chiave }]
    function segnaLette(voci) {
        if (!S.utente) return;
        const perStagione = {};
        for (const { D, chiave } of voci) {
            if (letta(D, chiave)) continue;
            S.letteLocali.add(`${D.id}/${chiave}`);
            (perStagione[D.id] ||= {})[chiave] = firebase.database.ServerValue.TIMESTAMP;
        }
        for (const [stagione, aggiornamento] of Object.entries(perStagione)) {
            db().ref(`notifiche/${S.utente.uid}/${stagione}`).update(aggiornamento)
                .catch(e => console.warn('Notifiche lette non salvate: controlla le regole del database', e));
        }
    }


    // -----------------------------------------------------
    // 7b. MVP: il voto aperto è una notifica
    //
    // Quando mancano pochi showdown alla fine di una stagione (e per 24 ore dopo la chiusura) chi è iscritto e non ha ancora votato trova in
    // campanella "Vote for the ... MVP", con il tasto che apre il voto in matches.html (mvp.js decide quando si può votare). Si guardano le
    // stagioni aperte che si seguono già e quelle chiuse da meno di 24 ore. mvp.js e risultati-match.js (avanzamentoStagione) non stanno su
    // tutte le pagine: si caricano da qui, solo se c'è una stagione dove votare. Votato, la notifica sparisce; letta o no, resta finché si può votare.
    // -----------------------------------------------------
    const stagioneConMvpPossibile = (info, id) => id !== 'sbeta' && ['', 'league', 'monoformat'].includes(String(info?.tipo || '').toLowerCase().trim());

    const promesseScript = {};
    function caricaScript(src, giaCaricato) {
        if (giaCaricato()) return Promise.resolve(true);
        if (!promesseScript[src]) {
            promesseScript[src] = new Promise(ok => {
                const sc = document.createElement('script');
                sc.src = src;
                sc.onload = () => ok(giaCaricato());
                sc.onerror = () => { delete promesseScript[src]; ok(false); };
                document.head.append(sc);
            });
        }
        return promesseScript[src];
    }
    async function preparaMvp() {
        const a = await caricaScript('risultati-match.js', () => typeof window.avanzamentoStagione === 'function');
        const b = await caricaScript('mvp.js', () => !!window.Mvp);
        return a && b;
    }

    async function avviaMvp(giro) {
        try {
            const candidati = [];
            for (const D of elencoStagioni()) {
                if (!D.amichevole && D.io && stagioneConMvpPossibile(D.info, D.id)) candidati.push({ id: D.id, info: D.info, iscritti: D.iscritti, io: D.io });
            }
            const visti = new Set(candidati.map(c => c.id));
            if (S.ioId) {
                for (const [id, info] of S.recenti) {
                    if (visti.has(id) || !stagioneConMvpPossibile(info, id)) continue;
                    const iscritti = Object.keys((await db().ref(`seasons/${id}/iscritti`).once('value')).val() || {});
                    const io = iscritti.find(p => idDi(p) === S.ioId);
                    if (io) candidati.push({ id, info, iscritti, io });
                }
            }
            if (giro !== S.giro) return;
            if (!candidati.length) { Object.keys(S.mvp).forEach(staccaMvp); disegnaCampanella(); return; }
            if (!(await preparaMvp())) return;
            await Promise.all(candidati.map(async c => { c.teams = (await db().ref(`seasons/${c.id}/teams_iscritti`).once('value')).val() || null; }));
            if (giro !== S.giro) return;
            sincronizzaMvp(candidati);
            disegnaCampanella();
        } catch (e) {
            console.warn('Voto MVP: notifica non disponibile', e);
        }
    }

    function sincronizzaMvp(candidati) {
        const ids = new Set(candidati.map(c => c.id));
        Object.keys(S.mvp).filter(id => !ids.has(id)).forEach(staccaMvp);
        for (const c of candidati) {
            const nuova = !S.mvp[c.id];
            const M = S.mvp[c.id] || (S.mvp[c.id] = { id: c.id, lette: {}, votato: false, pronti: { sfide: true, lette: false } });
            Object.assign(M, { info: c.info, iscritti: c.iscritti, io: c.io, teams: c.teams });
            if (!nuova) continue;
            const refs = S.ascolti[`mvp:${c.id}`] = [];
            const segui = (percorso, cb, errore) => {
                const ref = db().ref(percorso);
                const fn = snap => { if (S.mvp[c.id] === M) cb(snap); };
                ref.on('value', fn, errore);
                refs.push([ref, fn]);
            };
            segui(`notifiche/${S.utente.uid}/${c.id}`, snap => { M.lette = snap.val() || {}; M.pronti.lette = true; disegnaCampanella(); },
                () => { M.pronti.lette = true; disegnaCampanella(); });
            segui(`seasons/${c.id}/mvp/voti/${S.ioId}`, snap => { M.votato = snap.exists(); disegnaCampanella(); }, () => {});
        }
    }

    function staccaMvp(id) {
        (S.ascolti[`mvp:${id}`] || []).forEach(([ref, cb]) => ref.off('value', cb));
        delete S.ascolti[`mvp:${id}`];
        delete S.mvp[id];
    }

    // Le stagioni in cui il voto è aperto e non ho ancora votato, come voci di notifica
    function notificheMvp() {
        if (!S.ioId || !window.Mvp || typeof window.avanzamentoStagione !== 'function') return [];
        const elenco = [];
        for (const M of Object.values(S.mvp)) {
            if (!M.io || M.votato || !M.info) continue;
            const showdowns = S.stagioni[M.id]?.showdowns || {};
            const f = window.Mvp.finestraVoto(M.info, window.avanzamentoStagione(M.info, M.iscritti, showdowns, M.teams), M.id);
            if (!f.aperta) continue;
            const ultimo = Object.values(showdowns).flatMap(sd => Object.values(sd?.matches || {})).map(m => Date.parse(m?.lastEdit) || 0);
            elenco.push({ D: M, id: M.id, tipo: 'mvp', f, nome: M.info.name || M.id, chiave: 'mvp-aperto',
                quando: f.fase === 'dopo' ? Date.parse(M.info.chiusaIl) : (Math.max(0, ...ultimo) || Date.now()) });
        }
        return elenco;
    }


    // -----------------------------------------------------
    // 8. Disegno dei menu
    // -----------------------------------------------------
    function el(tag, classe, html) {
        const e = document.createElement(tag);
        if (classe) e.className = classe;
        if (html != null) e.innerHTML = html;
        return e;
    }

    function azione(testo, classe, fn) {
        const b = el('button', `sfide-azione ${classe}`);
        b.type = 'button';
        b.textContent = testo;
        b.addEventListener('click', async () => {
            b.disabled = true;
            try { await fn(); } finally { b.disabled = false; }
        });
        return b;
    }

    function collegamento(testo, classe, href) {
        const a = el('a', `sfide-azione ${classe}`);
        a.textContent = testo;
        a.href = href;
        return a;
    }

    function voce({ classe = '', tag, quando, nuova = false, testo, dettagli, azioni = [] }) {
        const v = el('div', `sfide-voce ${classe}`);
        const top = el('div', 'sfide-voce-top');
        top.append(el('span', 'sfide-tag', esc(tag)));
        if (nuova) top.append(el('span', 'sfide-nuova', 'New'));
        top.append(el('span', 'sfide-quando', esc(quandoFa(quando))));
        v.append(top, el('p', '', testo));
        if (dettagli) v.append(el('p', 'sfide-dettagli', esc(dettagli)));
        if (azioni.length) {
            const riga = el('div', 'sfide-azioni');
            riga.append(...azioni);
            v.append(riga);
        }
        return v;
    }

    function menuConSezioni(titolo, sezioni, vuoto) {
        const parti = [el('h3', '', esc(titolo))];
        // nell'app il menu è una finestra al centro dello schermo: ha la sua X per chiuderla
        if (document.documentElement.classList.contains('app')) {
            const x = el('button', 'sfide-chiudi', '&times;');
            x.type = 'button';
            x.setAttribute('aria-label', 'Close');
            x.addEventListener('click', () => chiudiMenu());
            parti[0].append(x);
        }
        for (const [nome, voci] of sezioni) {
            if (voci.length) parti.push(el('div', 'sfide-sezione', esc(nome)), ...voci);
        }
        if (parti.length === 1) parti.push(el('p', 'sfide-vuoto', vuoto));
        return parti;
    }

    function scuoti(btn) {
        btn.classList.remove('squilla');
        void btn.offsetWidth;
        btn.classList.add('squilla');
    }

    // ---- Campanella: solo notifiche ----
    function disegnaCampanella() {
        const [btn, badge, box] = CAMPANELLA.map($);
        if (!btn || !badge || !box) return;
        aggiornaVisibilita();
        if (btn.hidden) return;

        const tutte = notifiche();
        const caricata = D => D.pronti.sfide && D.pronti.lette;
        let nonLette = tutte.filter(n => caricata(n.D) && !letta(n.D, n.chiave));

        // Menu aperto: quello che si vede è letto (anche nelle altre pagine)
        if (!box.hidden && nonLette.length) {
            nonLette.forEach(n => S.nuoveAperte.add(`${n.D.id}/${n.chiave}`));
            segnaLette(nonLette);
            nonLette = [];
        }

        // Contatore, titolo della scheda e scossa quando arriva qualcosa di nuovo
        const n = nonLette.length;
        badge.textContent = n;
        badge.hidden = n === 0;
        btn.setAttribute('aria-label', n ? `Notifications: ${n} unread` : 'Notifications');
        if (n > S.nonLettePrima) scuoti(btn);
        S.nonLettePrima = n;
        const titoloBase = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = n ? `(${n}) ${titoloBase}` : titoloBase;

        const nuova = x => S.nuoveAperte.has(`${x.D.id}/${x.chiave}`) || !letta(x.D, x.chiave);
        const regole = `${MATCH_PER_SHOWDOWN} matches, best of `;

        const ricevute = tutte.filter(x => x.tipo === 'ricevuta').map(x => x.D.amichevole ? voce({
            classe: 'ricevuta amichevole', tag: 'Friendly', quando: x.quando, nuova: nuova(x),
            testo: `<strong>${esc(x.s.da)}</strong> ${x.s.rivincitaDi ? 'wants to play again' : 'challenges you to a friendly match'}`,
            dettagli: `${descrizioneAmichevole(x.s)} · no points, nothing saved`,
            azioni: [
                azione('Accept', 'si', () => accetta(x.D, x.id)),
                azione('Decline', 'no', () => cambiaStato(x.D, x.id, 'rifiutata'))
            ]
        }) : voce({
            classe: 'ricevuta', tag: x.s.categoria, quando: x.quando, nuova: nuova(x),
            testo: `<strong>${esc(x.s.da)}</strong> challenges you`,
            dettagli: `${regole}${x.s.bestOf || bestOf(x.D)} each`,
            azioni: [
                azione('Accept', 'si', () => accetta(x.D, x.id)),
                azione('Decline', 'no', () => cambiaStato(x.D, x.id, 'rifiutata'))
            ]
        }));

        // Solo l'avviso: la battaglia in corso si apre dal bottone con le spade (le amichevoli accettate stanno nella sezione sotto)
        const risposte = tutte.filter(x => x.tipo !== 'ricevuta' && x.tipo !== 'mvp' && !(x.D.amichevole && x.tipo === 'accettata')).map(x => voce({
            classe: x.tipo === 'rifiutata' ? 'rifiutata' : 'accettata',
            tag: x.D.amichevole ? 'Friendly' : x.s.categoria, quando: x.quando, nuova: nuova(x),
            testo: `<strong>${esc(x.s.a)}</strong> ${x.tipo === 'rifiutata' ? 'declined' : 'accepted'} your ${x.D.amichevole ? 'friendly ' : ''}challenge`
        }));

        const inviate = elencoStagioni()
            .flatMap(D => Object.entries(D.sfide)
                .filter(([, s]) => s?.stato === 'in_attesa' && s.daId === S.ioId && !(D.amichevole && (s.creata || 0) < Date.now() - UN_GIORNO))
                .map(([id, s]) => ({ D, id, s })))
            .sort((x, y) => (y.s.creata || 0) - (x.s.creata || 0))
            .map(({ D, id, s }) => voce({
                tag: D.amichevole ? 'Friendly' : s.categoria, quando: s.creata,
                testo: `Waiting for <strong>${esc(s.a)}</strong> to answer`,
                dettagli: D.amichevole ? descrizioneAmichevole(s) : '',
                azioni: [azione('Withdraw', 'no', () => cambiaStato(D, id, 'annullata'))]
            }));

        // Amichevoli accettate e non ancora finite (per chi ha chiuso la pagina della battaglia, o è arrivato dopo): si riprendono da qui
        const inCorso = elencoStagioni().filter(D => D.amichevole)
            .flatMap(D => Object.entries(D.sfide)
                .filter(([, s]) => s?.stato === 'accettata' && (s.daId === S.ioId || s.aId === S.ioId) && Date.now() - (s.risposta || 0) < SEI_ORE)
                .map(([id, s]) => ({ D, id, s })))
            .sort((x, y) => (y.s.risposta || 0) - (x.s.risposta || 0))
            .map(({ D, id, s }) => voce({
                classe: 'da-giocare', tag: 'Friendly', quando: s.risposta,
                nuova: s.daId === S.ioId && nuova({ D, chiave: chiaveNotifica(id, s) }),
                testo: `Against <strong>${esc(s.daId === S.ioId ? s.a : s.da)}</strong>`,
                dettagli: descrizioneAmichevole(s),
                azioni: [collegamento('Play', 'si', linkAmichevole(id))]
            }));

        // Il voto dell'MVP è aperto e non ho ancora votato: dice quanto manca e porta dritto al voto
        const votiMvp = tutte.filter(x => x.tipo === 'mvp').map(x => voce({
            classe: 'ricevuta', tag: 'MVP', quando: x.quando, nuova: nuova(x),
            testo: `Vote for the <strong>${esc(x.nome)}</strong> MVP`,
            dettagli: x.f.fase === 'dopo'
                ? `The season is over · voting closes ${new Date(x.f.scade).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
                : `${x.f.mancano} showdown${x.f.mancano === 1 ? '' : 's'} to the end · 2 votes among the top 5 Pokémon`,
            azioni: [collegamento('Vote', 'si', `matches.html?id=${encodeURIComponent(x.id)}&mvp=1`)]
        }));

        box.replaceChildren(...menuConSezioni('Notifications', [
            ['Waiting for you', ricevute],
            ['MVP voting', votiMvp],
            ['Friendly matches in progress', inCorso],
            ['Replies', risposte],
            ['Sent', inviate]
        ], 'No notifications. Press VS next to a player in the rankings to send a challenge, or ⚔ on the Trainers page for a friendly match.'));
    }

    // ---- Spade: battaglie in corso in tutte le stagioni (compare solo se ce ne sono) ----
    function disegnaBattaglie() {
        const [btn, badge, box] = BATTAGLIE.map($);
        if (!btn || !badge || !box) return;

        const live = S.utente ? elencoStagioni().flatMap(battaglieInCorso).sort(dalPiuRecente) : [];
        btn.hidden = live.length === 0;
        aggiornaVisibilita();
        if (!live.length) {
            box.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            S.battagliePrima = 0;
            return;
        }

        const mie = live.filter(b => b.gioco);
        const altre = live.filter(b => !b.gioco);
        badge.textContent = live.length;
        badge.hidden = false;
        btn.classList.toggle('mia', mie.length > 0);
        btn.setAttribute('aria-label', mie.length
            ? `Battles in progress: ${live.length}, ${mie.length} of yours`
            : `Battles in progress: ${live.length}`);
        if (S.battagliePrima > 0 && live.length > S.battagliePrima) scuoti(btn);
        S.battagliePrima = live.length;

        const dettagli = b => `Match ${b.n} of ${MATCH_PER_SHOWDOWN}`;
        box.replaceChildren(...menuConSezioni('Battles', [
            ['Your battles', mie.map(b => voce({
                classe: 'da-giocare', tag: b.i.categoria, quando: b.quando,
                testo: `Against <strong>${esc(b.avversario)}</strong> &middot; ${esc(b.mioPunteggio)}`,
                dettagli: dettagli(b),
                azioni: [collegamento('Play', 'si', linkBattaglia(b.stagione, b.id, b.n))]
            }))],
            ['Live now', altre.map(b => voce({
                tag: b.i.categoria, quando: b.quando,
                testo: `<strong>${esc(b.i.player1)}</strong> ${b.v1} - ${b.v2} <strong>${esc(b.i.player2)}</strong>`,
                dettagli: dettagli(b),
                azioni: [collegamento('Watch', '', linkBattaglia(b.stagione, b.id, b.n))]
            }))]
        ], 'No battles right now.'));
    }


    // -----------------------------------------------------
    // 9. Showdown in corso in matches.html (solo la stagione della pagina)
    // -----------------------------------------------------
    // Una sola riga bassa: l'etichetta "Live" e un chip per ogni showdown in corso
    // (formato, nomi e punteggio, match, azione). Non cresce mai in altezza, così lo
    // spazio resta agli showdown: con più di uno i chip scorrono in verticale, come i
    // rulli di una slot machine. Ogni chip resta TEMPO_LIVE ms, poi sale e sparisce
    // mentre entra quello dopo dal basso. Il mouse (o la tastiera) sopra la riga trattiene
    // la rotazione, così il chip non scappa mentre lo si clicca.
    // Con "riduci movimento" nessuna animazione: i chip stanno uno accanto all'altro.
    const TEMPO_LIVE = 4000;        // quanto resta fermo un chip
    const DURATA_ROLLIO = 600;      // la salita da un chip all'altro (= --rollio in style-sfide.css)

    const riduciMovimento = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Stato della rotazione: sopravvive ai ridisegni (Firebase ne chiede uno a ogni dato)
    // timer = prossimo scorrimento; riavvolgi = ritorno dalla copia in fondo al vero primo chip
    const rotazione = { firma: '', chiave: '', timer: null, riavvolgi: null };

    function fermaRotazione() {
        clearTimeout(rotazione.timer);
        clearTimeout(rotazione.riavvolgi);
        rotazione.timer = rotazione.riavvolgi = null;
    }

    function chipLive(b, interattivo) {
        const chip = el('a', `live-chip${b.gioco ? ' gioca' : ''}`);
        const azione = !S.utente ? 'Log in' : b.gioco ? 'Play' : 'Watch';
        chip.setAttribute('aria-label', `${azione}: ${b.i.player1} ${b.v1} - ${b.v2} ${b.i.player2}, ${b.i.categoria}, match ${b.n} of ${MATCH_PER_SHOWDOWN}`);
        chip.title = `${b.i.player1} vs ${b.i.player2} · ${b.i.categoria} · Match ${b.n} of ${MATCH_PER_SHOWDOWN}`;
        chip.innerHTML = `
            <span class="live-fmt">${esc(b.i.categoria)}</span>
            <span class="live-vs">
                <span class="live-n">${esc(b.i.player1)}</span>
                <b>${b.v1}-${b.v2}</b>
                <span class="live-n">${esc(b.i.player2)}</span>
            </span>
            <span class="live-m">M${b.n}/${MATCH_PER_SHOWDOWN}</span>
            <span class="live-vai">${azione}</span>`;
        if (!S.utente) {
            chip.href = '#';
            chip.addEventListener('click', e => {
                e.preventDefault();
                if (typeof window.toggleLoginModal === 'function') window.toggleLoginModal();
            });
        } else {
            chip.href = linkBattaglia(b.stagione, b.id, b.n);
        }
        if (!interattivo) chip.tabIndex = -1;
        return chip;
    }

    function disegnaLive() {
        const box = $('liveList');
        if (!box) return;

        const live = battaglieInCorso(pagina()).sort(dalPiuRecente);
        if (!live.length) {
            fermaRotazione();
            rotazione.firma = '';
            box.hidden = true;
            box.replaceChildren();
            return;
        }
        box.hidden = false;

        // Niente da ridisegnare se non è cambiato nulla di visibile: la rotazione non riparte da capo
        const chiave = b => `${b.stagione}/${b.id}`;
        const firma = JSON.stringify([!!S.utente, live.map(b => [chiave(b), b.n, b.v1, b.v2, b.gioco, b.i.player1, b.i.player2, b.i.categoria])]);
        if (firma === rotazione.firma && box.firstChild) return;
        rotazione.firma = firma;

        const testa = el('div', 'live-testa', `<span class="live-punto" aria-hidden="true"></span>Live<b>${live.length}</b>`);

        // Un solo showdown, o "riduci movimento": tutti i chip fermi, a capo se serve
        if (live.length < 2 || riduciMovimento()) {
            fermaRotazione();
            const riga = el('div', 'live-riga');
            riga.setAttribute('role', 'list');
            for (const b of live) {
                const chip = chipLive(b, true);
                chip.setAttribute('role', 'listitem');
                riga.append(chip);
            }
            box.replaceChildren(testa, riga);
            return;
        }

        // Dopo un ridisegno resta sullo stesso showdown, se c'è ancora
        fermaRotazione();
        const mostrato = rotazione.chiave;
        const rimasto = live.findIndex(b => chiave(b) === mostrato);
        let indice = rimasto >= 0 ? rimasto : 0;
        rotazione.chiave = chiave(live[indice]);

        // I chip uno sotto l'altro; in fondo una copia del primo, per il giro che si chiude
        const traccia = el('div', 'live-traccia');
        traccia.setAttribute('role', 'list');
        const slide = [...live, live[0]].map((b, i) => {
            const copia = i === live.length;
            const s = el('div', 'live-slide');
            s.append(chipLive(b, false));
            if (copia) s.setAttribute('aria-hidden', 'true');
            else s.firstChild.setAttribute('role', 'listitem');
            traccia.append(s);
            return s;
        });
        const finestra = el('div', 'live-scorri');
        finestra.append(traccia);

        // Pallini accanto all'etichetta: quale showdown si vede, e per saltare a un altro
        const punti = el('div', 'live-punti');
        const pallini = live.map((b, i) => {
            const p = el('button', 'live-pallino');
            p.type = 'button';
            p.setAttribute('aria-label', `Show ${b.i.player1} vs ${b.i.player2}`);
            p.addEventListener('click', () => vai(i));
            punti.append(p);
            return p;
        });

        function mostra(animato) {
            traccia.style.transition = animato ? '' : 'none';
            // in percentuale della traccia: regge anche se l'altezza dei chip cambia (finestra stretta)
            traccia.style.transform = `translateY(${(-indice / slide.length * 100).toFixed(4)}%)`;
            const attuale = indice % live.length;
            rotazione.chiave = chiave(live[attuale]);
            slide.forEach((s, i) => {
                // solo il chip in vista si può raggiungere con la tastiera o leggere
                const visibile = i === indice;
                s.inert = !visibile;
                s.firstChild.tabIndex = visibile ? 0 : -1;
            });
            pallini.forEach((p, i) => p.setAttribute('aria-current', i === attuale ? 'true' : 'false'));
            if (!animato) void traccia.offsetHeight;    // applica subito, senza animare il salto
        }

        function vai(prossimo) {
            clearTimeout(rotazione.timer);
            clearTimeout(rotazione.riavvolgi);
            // dalla copia in fondo si riparte dal vero primo, senza che si veda
            if (indice === live.length) { indice = 0; mostra(false); }
            indice = prossimo;
            mostra(true);
            // arrivati alla copia del primo: finita la salita si torna al vero primo
            if (indice === live.length) {
                rotazione.riavvolgi = setTimeout(() => { indice = 0; mostra(false); }, DURATA_ROLLIO + 40);
            }
            programma();
        }

        // Il mouse sulla riga (o il fuoco della tastiera, arrivato con Tab) trattiene la rotazione: chi sta per
        // cliccare un chip non lo vede scappare. Si guarda lo stato vero (:hover, :focus-visible) a ogni
        // scatto, invece di contare gli eventi: un ridisegno di Firebase sotto il mouse non fa ripartire nulla.
        // Col tocco non c'è hover (e dopo un tocco resterebbe "attaccato"): lì la rotazione non si ferma.
        const puoHover = !!(window.matchMedia && matchMedia('(hover: hover)').matches);
        const trattenuta = () =>
            (puoHover && (finestra.matches(':hover') || punti.matches(':hover'))) ||
            (box.contains(document.activeElement) && document.activeElement.matches(':focus-visible'));

        function programma() {
            clearTimeout(rotazione.timer);
            rotazione.timer = setTimeout(() => (trattenuta() ? programma() : vai(indice + 1)), TEMPO_LIVE);
        }

        box.replaceChildren(testa, punti, finestra);
        mostra(false);
        programma();
    }


    // -----------------------------------------------------
    // 10. Avviso a comparsa
    // -----------------------------------------------------
    function mostraAvviso(testo) {
        let t = $('sfide-toast');
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


    // Risposte alle sfide da fuori dalla campanella (profile.html): 'accetta' | 'rifiuta' | 'ritira'
    async function rispondi(stagione, id, risposta) {
        const D = S.stagioni[stagione];
        if (!D || !D.sfide[id]) return mostraAvviso('Still loading, try again in a moment');
        if (risposta === 'accetta') return accetta(D, id);
        const sf = D.sfide[id];
        const mia = risposta === 'ritira' ? sf.daId === S.ioId : sf.aId === S.ioId;
        if (!mia) return;
        return cambiaStato(D, id, risposta === 'ritira' ? 'annullata' : 'rifiutata');
    }

    window.Sfide = { avvia, bottoneRanking, apriSfida, rispondi, completato, caricaAmichevoli };
})();
