// =====================================================
// SFIDE — Poké-Tournament
// Sfide lanciate dalla classifica, campanella delle notifiche,
// accettazione (crea lo showdown e apre battle.html),
// elenco degli showdown in corso con accesso da spettatore.
//
// Dati:
//   sfide/{stagione}/{idSfida} = {
//     da, daId, a, aId, categoria, bestOf,
//     stato: 'in_attesa' | 'accettata' | 'rifiutata' | 'annullata',
//     creata, risposta, showdownId
//   }
//
// Usa solo Firebase compat (auth + database). Non dipende dalle
// variabili di matches.html: la pagina chiama Sfide.avvia(...).
// =====================================================
(function () {
    'use strict';

    const MATCH_PER_SHOWDOWN = 3;

    const S = {
        stagione: null,
        ascolti: null,            // stagione su cui sono attivi gli ascoltatori
        info: {},                 // seasons/{s}/info
        iscritti: [],             // nomi come in seasons/{s}/iscritti
        utente: null,
        io: '', ioId: '',
        admin: false,
        sfide: {},
        showdowns: {},
        firma: null,              // cambia quando si salva un match o nasce/sparisce uno showdown
        vistePendenti: new Set(), // sfide mie viste "in attesa" in questa sessione
        inPartenza: false,
        ricevutePrima: 0
    };

    const db = () => firebase.database();
    const $ = id => document.getElementById(id);
    const idDi = n => String(n || '').toLowerCase().trim();
    const esc = t => String(t ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));


    // -----------------------------------------------------
    // 1. Showdown: stato e conteggi
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
    function showdownTra(a, b, formato) {
        return Object.entries(S.showdowns).filter(([, sd]) => {
            const i = sd?.info || {};
            return coppia(i.player1, i.player2, a, b) && (!formato || i.categoria === formato);
        });
    }

    function sfideInAttesaTra(a, b) {
        return Object.entries(S.sfide).filter(([, s]) => s?.stato === 'in_attesa' && coppia(s.daId, s.aId, a, b));
    }

    // Stesso campo usato da matches.html: 0 = nessun limite
    const massimo = () => parseInt(S.info.showdowns_per_format, 10) || 0;

    function rimasti(a, b, formato) {
        if (!massimo()) return Infinity;
        const inAttesa = sfideInAttesaTra(a, b).filter(([, s]) => s.categoria === formato).length;
        return Math.max(0, massimo() - showdownTra(a, b, formato).length - inAttesa);
    }

    const stagioneChiusa = () => String(S.info.status || '').toUpperCase().trim() === 'CLOSED';
    const formatiStagione = () => Object.values(S.info.selected_formats || {});
    const bestOf = () => parseInt(S.info.best_of, 10) === 5 ? 5 : 3;
    const nomeIscritto = nome => S.iscritti.find(p => idDi(p) === idDi(nome)) || nome;

    function linkBattaglia(sdId, n) {
        return `battle.html?stagione=${encodeURIComponent(S.stagione)}&showdown=${encodeURIComponent(sdId)}&match=${n}`;
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


    // -----------------------------------------------------
    // 2. Avvio (la pagina lo chiama; si può richiamare più volte)
    // -----------------------------------------------------
    function utenteCorrente() {
        return new Promise(ok => {
            if (firebase.auth().currentUser) return ok(firebase.auth().currentUser);
            const stop = firebase.auth().onAuthStateChanged(u => { stop(); ok(u); });
        });
    }

    async function avvia({ stagione, infoStagione } = {}) {
        if (!window.firebase || !firebase.apps.length) return;
        S.utente = await utenteCorrente();
        if (!stagione) stagione = (await db().ref('settings/currentSeason').once('value')).val();
        if (!stagione) return;
        S.stagione = stagione;

        const [snapInfo, snapIscritti, snapUtente] = await Promise.all([
            infoStagione ? null : db().ref(`seasons/${stagione}/info`).once('value'),
            db().ref(`seasons/${stagione}/iscritti`).once('value'),
            S.utente ? db().ref(`users/${S.utente.uid}`).once('value') : null
        ]);
        S.info = infoStagione || snapInfo?.val() || {};
        S.iscritti = Object.keys(snapIscritti.val() || {});
        const utente = snapUtente?.val() || {};
        S.admin = utente.role === 'admin';
        S.io = S.iscritti.find(p => idDi(p) === idDi(utente.name)) || '';
        S.ioId = idDi(S.io);

        preparaCampanella();

        if (S.ascolti !== stagione) {
            S.ascolti = stagione;

            db().ref(`seasons/${stagione}/showdowns`).on('value', snap => {
                S.showdowns = snap.val() || {};
                const firma = Object.keys(S.showdowns).sort()
                    .map(id => `${id}:${matchSalvati(S.showdowns[id])}`).join('|');
                const cambiata = S.firma !== null && firma !== S.firma;
                S.firma = firma;

                disegnaLive();
                controllaAccettate();
                disegnaCampanella();
                // Un match salvato o uno showdown concluso: ricarico griglia e classifica
                if (cambiata && typeof window.inizializzaPaginaArchivio === 'function') {
                    window.inizializzaPaginaArchivio();
                }
            });

            if (S.utente) {
                db().ref(`sfide/${stagione}`).on('value', snap => {
                    S.sfide = snap.val() || {};
                    controllaAccettate();
                    disegnaCampanella();
                }, err => console.warn('Sfide non leggibili: controlla le regole del database', err));
            }
        }

        disegnaLive();
        disegnaCampanella();
    }


    // -----------------------------------------------------
    // 3. Bottone nella classifica
    // -----------------------------------------------------
    function bottoneRanking(nome) {
        if (!S.utente || !S.io || stagioneChiusa()) return '';
        if (idDi(nome) === S.ioId) return '';
        if (!S.iscritti.some(p => idDi(p) === idDi(nome))) return '';
        return `<button type="button" class="sfida-rank-btn" data-nome="${esc(nome)}"
                    title="Challenge ${esc(nome)}" aria-label="Challenge ${esc(nome)}"
                    onclick="event.stopPropagation(); Sfide.apriSfida(this.dataset.nome)">VS</button>`;
    }


    // -----------------------------------------------------
    // 4. Finestra per lanciare la sfida
    // -----------------------------------------------------
    function chiudiModale() {
        $('sfida-overlay')?.remove();
        document.removeEventListener('keydown', escModale);
    }
    function escModale(e) {
        if (e.key === 'Escape') chiudiModale();
    }

    function apriSfida(nome) {
        nome = nomeIscritto(nome);
        if (!S.utente) {
            if (typeof window.toggleLoginModal === 'function') window.toggleLoginModal();
            return;
        }
        if (!S.io) return alert('You are not registered in this season.');
        if (idDi(nome) === S.ioId || stagioneChiusa()) return;

        chiudiModale();
        const overlay = document.createElement('div');
        overlay.id = 'sfida-overlay';
        overlay.className = 'sfida-overlay';
        overlay.innerHTML = `
            <div class="sfida-card" role="dialog" aria-modal="true" aria-labelledby="sfida-titolo">
                <span class="sfida-sticker">Challenge</span>
                <h2 id="sfida-titolo">${esc(S.io)} <small>vs</small> ${esc(nome)}</h2>
                <p class="sfida-sotto">${MATCH_PER_SHOWDOWN} matches, best of ${bestOf()} each. Pick the format.</p>
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

        // Uno showdown già in corso tra voi due: si riprende quello
        const inCorso = showdownTra(S.io, nome).find(([, sd]) => !completato(sd));
        if (inCorso) {
            const [sdId, sd] = inCorso;
            messaggio(`You already have a showdown in progress against ${nome}.`);
            invia.textContent = 'Resume showdown';
            invia.disabled = false;
            invia.addEventListener('click', () => { location.href = linkBattaglia(sdId, prossimoMatch(sd)); });
            return;
        }

        // Una sola sfida in attesa per coppia
        const pendente = sfideInAttesaTra(S.io, nome)[0];
        if (pendente) {
            const s = pendente[1];
            messaggio(s.daId === S.ioId
                ? `Your ${s.categoria} challenge is still waiting for ${nome}.`
                : `${nome} already challenged you in ${s.categoria}. Answer from the bell.`);
            invia.hidden = true;
            return;
        }

        // Solo i formati con showdown ancora da giocare
        const formati = formatiStagione().map(f => [f, rimasti(S.io, nome, f)]).filter(([, r]) => r > 0);
        if (!formati.length) {
            messaggio(`You have played every showdown against ${nome} this season.`);
            invia.hidden = true;
            return;
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
        invia.addEventListener('click', () => { if (scelto) lancia(nome, scelto, invia); });
    }

    async function lancia(nome, formato, bottone) {
        bottone.disabled = true;
        // Ricontrollo con i dati più freschi
        if (sfideInAttesaTra(S.io, nome).length) {
            chiudiModale();
            return mostraAvviso(`There is already a pending challenge with ${nome}`);
        }
        if (rimasti(S.io, nome, formato) <= 0) {
            chiudiModale();
            return mostraAvviso(`No ${formato} showdowns left against ${nome}`);
        }
        try {
            await db().ref(`sfide/${S.stagione}`).push({
                da: S.io, daId: S.ioId,
                a: nome, aId: idDi(nome),
                categoria: formato,
                bestOf: bestOf(),
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
    // 5. Risposte: accetta, rifiuta, annulla
    // -----------------------------------------------------
    // Cambia stato solo se la sfida è ancora in attesa
    async function cambiaStato(id, nuovo) {
        try {
            await db().ref(`sfide/${S.stagione}/${id}`).transaction(cur => {
                if (cur === null) return null;          // cache vuota: Firebase riprova col valore vero
                if (cur.stato !== 'in_attesa') return;  // già gestita: annullo
                return { ...cur, stato: nuovo, risposta: Date.now() };
            });
        } catch (e) {
            alert(`Error: ${e.message}`);
        }
    }

    async function accetta(id) {
        const sf = S.sfide[id];
        if (!sf || sf.aId !== S.ioId || sf.stato !== 'in_attesa') return;

        if (massimo() && showdownTra(sf.daId, sf.aId, sf.categoria).length >= massimo()) {
            alert(`You have already played every ${sf.categoria} showdown against ${sf.da}.`);
            return cambiaStato(id, 'annullata');
        }

        const rif = db().ref(`sfide/${S.stagione}/${id}`);
        const sdId = db().ref(`seasons/${S.stagione}/showdowns`).push().key;

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
            await db().ref(`seasons/${S.stagione}/showdowns/${sdId}`).set({
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
        location.href = linkBattaglia(sdId, 1);
    }

    // Lo sfidante viene portato in battaglia quando l'altro accetta
    function controllaAccettate() {
        if (!S.ioId || S.inPartenza) return;
        for (const [id, s] of Object.entries(S.sfide)) {
            if (!s || s.daId !== S.ioId) continue;
            if (s.stato === 'in_attesa') { S.vistePendenti.add(id); continue; }
            if (s.stato === 'accettata' && s.showdownId && S.vistePendenti.has(id) && S.showdowns[s.showdownId]) {
                S.inPartenza = true;
                mostraAvviso(`${s.a} accepted. Opening the battle…`);
                setTimeout(() => { location.href = linkBattaglia(s.showdownId, 1); }, 1500);
                return;
            }
        }
    }


    // -----------------------------------------------------
    // 6. Campanella e menu delle notifiche
    // -----------------------------------------------------
    function preparaCampanella() {
        const btn = $('sfide-control'), box = $('sfide-dropdown');
        if (!btn || !box) return;
        btn.hidden = !(S.utente && S.io);
        if (!S.io) box.hidden = true;
        if (btn.dataset.pronto) return;
        btn.dataset.pronto = '1';

        btn.addEventListener('click', e => {
            e.stopPropagation();
            box.hidden = !box.hidden;
            btn.setAttribute('aria-expanded', String(!box.hidden));
        });
        box.addEventListener('click', e => e.stopPropagation());
        document.addEventListener('click', () => {
            if (!box.hidden) { box.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !box.hidden) { box.hidden = true; btn.focus(); }
        });
    }

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

    function voce({ classe = '', tag, quando, testo, dettagli, azioni = [] }) {
        const v = el('div', `sfide-voce ${classe}`);
        const top = el('div', 'sfide-voce-top');
        top.append(el('span', 'sfide-tag', esc(tag)), el('span', 'sfide-quando', esc(quandoFa(quando))));
        v.append(top, el('p', '', testo));
        if (dettagli) v.append(el('p', 'sfide-dettagli', esc(dettagli)));
        if (azioni.length) {
            const riga = el('div', 'sfide-azioni');
            riga.append(...azioni);
            v.append(riga);
        }
        return v;
    }

    function disegnaCampanella() {
        const btn = $('sfide-control'), badge = $('sfide-badge'), box = $('sfide-dropdown');
        if (!btn || !badge || !box || !S.io) return;

        const tutte = Object.entries(S.sfide).filter(([, s]) => s)
            .sort((x, y) => (y[1].creata || 0) - (x[1].creata || 0));
        const mia = s => s.daId === S.ioId || s.aId === S.ioId;
        const avversario = s => (s.daId === S.ioId ? s.a : s.da);
        const ieri = Date.now() - 24 * 3600 * 1000;

        const daGiocare = tutte.filter(([, s]) => s.stato === 'accettata' && mia(s)
            && S.showdowns[s.showdownId] && !completato(S.showdowns[s.showdownId]));
        const ricevute = tutte.filter(([, s]) => s.stato === 'in_attesa' && s.aId === S.ioId);
        const inviate = tutte.filter(([, s]) => s.stato === 'in_attesa' && s.daId === S.ioId);
        const rifiutate = tutte.filter(([, s]) => s.stato === 'rifiutata' && s.daId === S.ioId && (s.risposta || 0) > ieri);

        // Contatore, titolo della scheda e scossa quando arriva una sfida nuova
        const n = ricevute.length;
        badge.textContent = n;
        badge.hidden = n === 0;
        btn.setAttribute('aria-label', n ? `Challenges: ${n} waiting for you` : 'Challenges');
        if (n > S.ricevutePrima) {
            btn.classList.remove('squilla');
            void btn.offsetWidth;
            btn.classList.add('squilla');
        }
        S.ricevutePrima = n;
        const titoloBase = document.title.replace(/^\(\d+\)\s*/, '');
        document.title = n ? `(${n}) ${titoloBase}` : titoloBase;

        const regole = `${MATCH_PER_SHOWDOWN} matches, best of `;
        const parti = [el('h3', '', 'Challenges')];
        const sezione = (titolo, voci) => {
            if (voci.length) parti.push(el('div', 'sfide-sezione', esc(titolo)), ...voci);
        };

        sezione('Ready to play', daGiocare.map(([, s]) => {
            const sd = S.showdowns[s.showdownId];
            const n = prossimoMatch(sd);
            return voce({
                classe: 'da-giocare', tag: s.categoria, quando: s.risposta,
                testo: `Showdown against <strong>${esc(avversario(s))}</strong> is on`,
                dettagli: `Next up: match ${n} of ${MATCH_PER_SHOWDOWN}`,
                azioni: [collegamento('Play', 'si', linkBattaglia(s.showdownId, n))]
            });
        }));

        sezione('Waiting for you', ricevute.map(([id, s]) => voce({
            classe: 'ricevuta', tag: s.categoria, quando: s.creata,
            testo: `<strong>${esc(s.da)}</strong> challenges you`,
            dettagli: `${regole}${s.bestOf || bestOf()} each`,
            azioni: [
                azione('Accept', 'si', () => accetta(id)),
                azione('Decline', 'no', () => cambiaStato(id, 'rifiutata'))
            ]
        })));

        sezione('Sent', inviate.map(([id, s]) => voce({
            tag: s.categoria, quando: s.creata,
            testo: `Waiting for <strong>${esc(s.a)}</strong> to answer`,
            azioni: [azione('Withdraw', 'no', () => cambiaStato(id, 'annullata'))]
        })));

        sezione('Declined', rifiutate.map(([, s]) => voce({
            classe: 'rifiutata', tag: s.categoria, quando: s.risposta,
            testo: `<strong>${esc(s.a)}</strong> declined your challenge`
        })));

        if (parti.length === 1) {
            parti.push(el('p', 'sfide-vuoto', 'No challenges right now. Press VS next to a player in the rankings to send one.'));
        }
        box.replaceChildren(...parti);
    }


    // -----------------------------------------------------
    // 7. Showdown in corso (giocatori: riprendi, altri: guarda)
    // -----------------------------------------------------
    function disegnaLive() {
        const box = $('liveList');
        if (!box) return;

        const live = Object.entries(S.showdowns)
            .filter(([, sd]) => sd?.info && !completato(sd))
            .sort((x, y) => String(y[1].info.timestamp || '').localeCompare(String(x[1].info.timestamp || '')));

        if (!live.length) {
            box.hidden = true;
            box.replaceChildren();
            return;
        }
        box.hidden = false;

        const testa = el('div', 'live-testa', '<span class="live-punto" aria-hidden="true"></span>Live now');
        const griglia = el('div', 'live-griglia');

        for (const [id, sd] of live) {
            const i = sd.info;
            const n = prossimoMatch(sd);
            let v1 = 0, v2 = 0;
            Object.values(sd.matches || {}).filter(matchValido).forEach(m => {
                if (+m.p1score > +m.p2score) v1++;
                else if (+m.p2score > +m.p1score) v2++;
            });
            const gioco = !!S.ioId && (idDi(i.player1) === S.ioId || idDi(i.player2) === S.ioId);

            const card = el('div', 'live-card', `
                <div class="live-card-testa">
                    <span class="sd-category-tag">${esc(i.categoria)}</span>
                    <span class="live-match">Match ${n}/${MATCH_PER_SHOWDOWN}</span>
                </div>
                <div class="live-nomi">
                    <span>${esc(i.player1)}</span>
                    <b>${v1} - ${v2}</b>
                    <span>${esc(i.player2)}</span>
                </div>`);

            const azioni = el('div', 'live-azioni');
            const vai = el('a', `live-btn${gioco ? ' gioca' : ''}`);
            if (!S.utente) {
                vai.textContent = 'Log in to watch';
                vai.href = '#';
                vai.addEventListener('click', e => {
                    e.preventDefault();
                    if (typeof window.toggleLoginModal === 'function') window.toggleLoginModal();
                });
            } else {
                vai.textContent = gioco ? 'Play' : 'Watch live';
                vai.href = linkBattaglia(id, n);
            }
            azioni.append(vai);


            card.append(azioni);
            griglia.append(card);
        }
        box.replaceChildren(testa, griglia);
    }


    // -----------------------------------------------------
    // 8. Avviso a comparsa
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


    window.Sfide = { avvia, bottoneRanking, apriSfida, completato };
})();
