// =====================================================
// NOTE DEL TEAM — Poké-Tournament
//
// Mentre si prova un team contro la CPU si scoprono cose da sistemare ("il Calyrex soffre il Fake Out", "manca una Protezione"):
// qui si appuntano, per quel team, e si ritrovano dopo, nel Box e nel Team Builder, per fare le modifiche con calma. Una nota
// si cancella quando è risolta.
//
// Dove stanno: dentro il team, players/{giocatore}/teams/{team}/note/{id} = { testo, creata, contro?, turno? }.
//   - il Box salva un team con update() (e un team nuovo non ha note): le note non si perdono quando il team si modifica;
//   - quando il team si cancella si cancellano con lui;
//   - le iscrizioni alle stagioni copiano solo id, nome e Pokémon: le note non ci finiscono.
//   - contro: { nome: 'Team 3', specie: [...] } il team della CPU contro cui si giocava, turno: il turno in cui si è scritta.
//
// Funzioni pure in cima (si provano in Node: test/note-team.test.js), poi il collegamento a Firebase e il pannello, che le pagine
// montano dove serve (la battaglia contro la CPU, il dettaglio del team nel Box, il Team Builder). Lo stile è note-team.css.
// Il testo delle note entra nella pagina solo come testo (textContent), mai come HTML.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(null);
    else radice.NoteTeam = fabbrica(radice);
})(typeof self !== 'undefined' ? self : this, function (finestra) {
    'use strict';

    const MAX_TESTO = 500;       // caratteri di una nota
    const MAX_NOTE = 60;         // note per team: oltre, prima se ne risolvono alcune
    const MAX_SPECIE = 6;

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const stringa = v => String(v == null ? '' : v);

    // -----------------------------------------------------
    // Pure
    // -----------------------------------------------------
    /** Il testo come si salva: a capo uniformi, niente righe vuote a catena, senza spazi attorno, al massimo MAX_TESTO caratteri */
    function pulisciTesto(testo) {
        return stringa(testo).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TESTO).trim();
    }

    // { nome, specie[] } del team della CPU, o null
    function pulisciContro(contro) {
        if (!contro || typeof contro !== 'object') return null;
        const specie = (Array.isArray(contro.specie) ? contro.specie : []).map(x => stringa(x).trim().slice(0, 40)).filter(Boolean).slice(0, MAX_SPECIE);
        const nome = stringa(contro.nome).trim().slice(0, 40);
        if (!nome && !specie.length) return null;
        return { nome, specie };
    }

    /**
     * Una nota nuova pronta da salvare (solo valori semplici: Firebase non accetta undefined). null se il testo è vuoto.
     * @param {{ testo: string, contro?: { nome, specie[] }, turno?: number }} dati
     */
    function nuovaNota(dati, adesso = Date.now()) {
        const testo = pulisciTesto(dati && dati.testo);
        if (!testo) return null;
        const nota = { testo, creata: Math.floor(adesso) };
        const contro = pulisciContro(dati && dati.contro);
        if (contro) nota.contro = contro;
        const turno = Math.floor(Number(dati && dati.turno));
        if (turno >= 1 && turno < 1000) nota.turno = turno;
        return nota;
    }

    /** Le note di un team come le dà Firebase (oggetto id -> nota, o un array) -> elenco, dalla più recente; quelle vuote si scartano */
    function leggiNote(grezzo) {
        const voci = Array.isArray(grezzo) ? grezzo.map((n, i) => [String(i), n]) : (grezzo && typeof grezzo === 'object' ? Object.entries(grezzo) : []);
        return voci
            .filter(([, n]) => n && typeof n === 'object' && pulisciTesto(n.testo))
            .map(([id, n]) => {
                const nota = { id, testo: pulisciTesto(n.testo), creata: Number(n.creata) || 0 };
                const contro = pulisciContro(n.contro);
                if (contro) nota.contro = contro;
                const turno = Math.floor(Number(n.turno));
                if (turno >= 1 && turno < 1000) nota.turno = turno;
                return nota;
            })
            .sort((a, b) => b.creata - a.creata || (a.id < b.id ? 1 : -1));
    }

    const contaNote = grezzo => leggiNote(grezzo).length;

    /** "vs Garchomp, Gholdengo +4 · turn 7": contro chi e quando, in breve (vuoto se non si sa) */
    function etichettaContesto(nota) {
        const parti = [];
        const c = nota && nota.contro;
        if (c && c.specie.length) {
            const prime = c.specie.slice(0, 2).join(', ');
            parti.push(`vs ${prime}${c.specie.length > 2 ? ` +${c.specie.length - 2}` : ''}`);
        } else if (c && c.nome) parti.push(`vs ${c.nome}`);
        if (nota && nota.turno) parti.push(`turn ${nota.turno}`);
        return parti.join(' · ');
    }

    /** "just now", "5 min ago", "3 h ago", "2 d ago", poi la data */
    function quando(creata, adesso = Date.now()) {
        if (!creata) return '';
        const s = Math.max(0, Math.round((adesso - creata) / 1000));
        if (s < 60) return 'just now';
        const m = Math.round(s / 60);
        if (m < 60) return `${m} min ago`;
        const h = Math.round(m / 60);
        if (h < 24) return `${h} h ago`;
        const g = Math.round(h / 24);
        if (g < 14) return `${g} d ago`;
        return new Date(creata).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const percorso = (giocatore, team) => `players/${idDi(giocatore)}/teams/${String(team == null ? '' : team).trim()}/note`;

    const chiaveBozza = (giocatore, team) => `noteBozza|${idDi(giocatore)}|${String(team == null ? '' : team).trim()}`;

    // -----------------------------------------------------
    // Firebase
    // -----------------------------------------------------
    // Gli errori più comuni, in parole: soprattutto "le regole del database non lo permettono" (una scrittura mai fatta prima)
    function errorePerUtente(errore) {
        const codice = String(errore && (errore.code || errore.message) || '');
        if (/permission[_ -]?denied/i.test(codice)) return new Error("The database didn't allow saving the note. Ask the admin to let you write inside your own teams (players/<you>/teams).");
        if (/network|offline|unavailable|disconnected/i.test(codice)) return new Error('No connection: the note was not saved. Try again in a moment.');
        return errore instanceof Error ? errore : new Error('Could not save the note.');
    }

    /** Resta in ascolto delle note di un team: alCambio(elenco) subito e a ogni cambiamento. Restituisce la funzione per smettere. */
    function ascolta(db, giocatore, team, alCambio, alErrore) {
        const rif = db.ref(percorso(giocatore, team));
        const f = snap => alCambio(leggiNote(snap.val()));
        rif.on('value', f, errore => { if (alErrore) alErrore(errorePerUtente(errore)); });
        return () => rif.off('value', f);
    }

    /** Aggiunge una nota (dati come in nuovaNota). Restituisce la nota salvata, con il suo id. */
    async function aggiungi(db, giocatore, team, dati) {
        const nota = nuovaNota(dati);
        if (!nota) throw new Error('The note is empty.');
        try {
            const rif = db.ref(percorso(giocatore, team)).push();
            await rif.set(nota);
            return { id: rif.key, ...nota };
        } catch (errore) { throw errorePerUtente(errore); }
    }

    /** Cancella una nota (risolta) */
    async function elimina(db, giocatore, team, idNota) {
        if (!idNota) return;
        try { await db.ref(`${percorso(giocatore, team)}/${idNota}`).remove(); } catch (errore) { throw errorePerUtente(errore); }
    }

    // -----------------------------------------------------
    // Il pannello: un'area per scrivere e l'elenco delle note del team, ognuna con "Done"
    // -----------------------------------------------------
    function el(tag, classe, testo) {
        const e = finestra.document.createElement(tag);
        if (classe) e.className = classe;
        if (testo != null) e.textContent = testo;
        return e;
    }

    function leggiBozza(giocatore, team) {
        try { return finestra.localStorage.getItem(chiaveBozza(giocatore, team)) || ''; } catch (e) { return ''; }
    }
    function salvaBozza(giocatore, team, testo) {
        try {
            if (testo) finestra.localStorage.setItem(chiaveBozza(giocatore, team), testo);
            else finestra.localStorage.removeItem(chiaveBozza(giocatore, team));
        } catch (e) { /* senza memoria locale la bozza non si ricorda */ }
    }

    /**
     * Monta il pannello dentro `contenitore`.
     * @param {Element} contenitore
     * @param {{ db, giocatore: string, team: string, contesto?: () => { contro?, turno? }, alCambio?: (note) => void }} opzioni
     * @returns {{ note: () => Array, focus: () => void, distruggi: () => void }}
     */
    function montaPannello(contenitore, { db, giocatore, team, contesto, alCambio } = {}) {
        let note = [];
        let pronto = false;
        let invio = false;
        const radiceDom = el('div', 'nt');

        const form = el('form', 'nt-nuova');
        const testo = el('textarea', 'nt-testo');
        testo.rows = 3;
        testo.maxLength = MAX_TESTO;
        testo.placeholder = 'Write what to fix or try on this team…';
        testo.setAttribute('aria-label', 'New note');
        testo.value = leggiBozza(giocatore, team);
        const riga = el('div', 'nt-riga');
        const conto = el('span', 'nt-conto');
        const aggiungiBtn = el('button', 'nt-aggiungi', 'Add note');
        aggiungiBtn.type = 'submit';
        riga.append(conto, aggiungiBtn);
        form.append(testo, riga);

        const errore = el('p', 'nt-errore');
        errore.setAttribute('role', 'alert');
        errore.hidden = true;
        const vuoto = el('p', 'nt-vuoto', 'No notes yet. Jot down what to fix: each note can be deleted once it is done.');
        const lista = el('ul', 'nt-lista');
        radiceDom.append(form, errore, vuoto, lista);
        contenitore.append(radiceDom);

        const mostraErrore = messaggio => { errore.textContent = messaggio || ''; errore.hidden = !messaggio; };

        const aggiornaForm = () => {
            conto.textContent = `${testo.value.length}/${MAX_TESTO}`;
            aggiungiBtn.disabled = invio || !pulisciTesto(testo.value) || note.length >= MAX_NOTE;
            if (note.length >= MAX_NOTE) mostraErrore(`This team has ${MAX_NOTE} notes: delete the ones you have solved to add more.`);
        };

        const disegna = () => {
            lista.replaceChildren(...note.map(n => {
                const voce = el('li', 'nt-nota');
                voce.dataset.nota = n.id;
                voce.append(el('p', 'nt-nota-testo', n.testo));
                const pie = el('div', 'nt-nota-pie');
                const contestoTesto = etichettaContesto(n);
                const meta = el('span', 'nt-nota-meta', [contestoTesto, quando(n.creata)].filter(Boolean).join(' · '));
                if (n.contro && n.contro.specie.length) meta.title = `Against ${n.contro.nome ? n.contro.nome + ': ' : ''}${n.contro.specie.join(', ')}`;
                const fatto = el('button', 'nt-fatto', '✓ Done');
                fatto.type = 'button';
                fatto.title = 'Solved: delete this note';
                fatto.setAttribute('aria-label', `Done: delete the note "${n.testo.slice(0, 40)}"`);
                fatto.addEventListener('click', async () => {
                    fatto.disabled = true;
                    mostraErrore('');
                    try { await elimina(db, giocatore, team, n.id); } catch (e) { fatto.disabled = false; mostraErrore(e.message); }
                });
                pie.append(meta, fatto);
                voce.append(pie);
                return voce;
            }));
            vuoto.hidden = note.length > 0 || !pronto;
            aggiornaForm();
        };

        testo.addEventListener('input', () => { salvaBozza(giocatore, team, testo.value); aggiornaForm(); });
        // Ctrl/Cmd + Invio aggiunge; Esc lo lascia alla pagina (chiude la finestra)
        testo.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : aggiungiBtn.click(); } });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (invio || aggiungiBtn.disabled) return;
            invio = true;
            aggiornaForm();
            mostraErrore('');
            try {
                await aggiungi(db, giocatore, team, { testo: testo.value, ...(contesto ? contesto() : {}) });
                testo.value = '';
                salvaBozza(giocatore, team, '');
            } catch (errore2) { mostraErrore(errore2.message); }
            invio = false;
            aggiornaForm();
            testo.focus();
        });

        let smetti = () => {};
        if (!db || !giocatore || !team) {
            mostraErrore('Log in to keep notes on your teams.');
            testo.disabled = true;
            aggiungiBtn.disabled = true;
            pronto = true;
            disegna();
        } else {
            smetti = ascolta(db, giocatore, team, elenco => {
                note = elenco;
                pronto = true;
                disegna();
                if (alCambio) alCambio(note);
            }, e => { pronto = true; mostraErrore(e.message); disegna(); });
        }
        aggiornaForm();

        return {
            note: () => note,
            focus: () => testo.focus(),
            distruggi: () => { smetti(); radiceDom.remove(); }
        };
    }

    // -----------------------------------------------------
    // Il pulsante con il pannello a comparsa (il dettaglio del team nel Box e il Team Builder)
    // -----------------------------------------------------
    /**
     * Mette in `casella` il pulsante "Notes n" e, sotto, il pannello che si apre al clic. Restituisce { distruggi, apri, chiudi }.
     * @param {{ db, giocatore, team, alCambio?: (note) => void, aperto?: boolean, alAprire?: (aperto: boolean) => void }} opzioni
     *   alAprire: chiamata quando il bloc notes si apre o si chiude (serve a chi deve portarlo sopra al resto della pagina)
     */
    function montaBarra(casella, { db, giocatore, team, alCambio, aperto, alAprire } = {}) {
        if (!casella) return null;
        casella.replaceChildren();
        const tasto = el('button', 'nt-apri');
        tasto.type = 'button';
        tasto.setAttribute('aria-expanded', 'false');
        tasto.title = 'Notes on this team: what to fix or try';
        const etichetta = el('span', 'nt-apri-testo', '📝 Notes');
        const numero = el('b', 'nt-apri-conto', '0');
        tasto.append(etichetta, numero);
        const pop = el('div', 'nt-pop');
        pop.hidden = true;
        const testa = el('div', 'nt-pop-testa');
        const chiudi = el('button', 'nt-chiudi', '×');
        chiudi.type = 'button';
        chiudi.setAttribute('aria-label', 'Close the notes');
        testa.append(el('strong', null, 'Notes'), el('small', null, 'Delete a note when it is solved'), chiudi);
        pop.append(testa);
        casella.append(tasto, pop);

        // Se sotto al pulsante non c'è posto per tutto il bloc notes, l'elenco delle note si accorcia (e scorre dentro). Sul telefono
        // il bloc notes è una finestra a sé, con il suo scorrimento: lì non serve.
        const adattaAltezza = () => {
            const lista = pop.querySelector('.nt-lista');
            if (!lista || pop.hidden || finestra.getComputedStyle(pop).position === 'fixed') return;
            lista.style.maxHeight = '';
            const sfora = pop.getBoundingClientRect().bottom - (finestra.innerHeight - 12);
            if (sfora > 0) lista.style.maxHeight = Math.max(90, lista.getBoundingClientRect().height - sfora) + 'px';
        };
        const pannello = montaPannello(pop, {
            db, giocatore, team,
            alCambio: note => {
                numero.textContent = String(note.length);
                tasto.classList.toggle('nt-ci-sono', note.length > 0);
                adattaAltezza();
                if (alCambio) alCambio(note);
            }
        });
        // un clic fuori dal pulsante e dal bloc notes lo richiude (si ascolta solo finché è aperto)
        const doc = finestra.document;
        const fuori = e => { if (!casella.contains(e.target)) imposta(false); };
        const imposta = visibile => {
            pop.hidden = !visibile;
            tasto.setAttribute('aria-expanded', String(visibile));
            if (alAprire) alAprire(visibile);
            doc.removeEventListener('click', fuori);
            if (visibile) {
                adattaAltezza();
                pannello.focus();
                setTimeout(() => { if (!pop.hidden) doc.addEventListener('click', fuori); }, 0);
            }
        };
        tasto.addEventListener('click', e => { e.stopPropagation(); imposta(pop.hidden); });
        pop.addEventListener('click', e => e.stopPropagation());
        chiudi.addEventListener('click', () => { imposta(false); tasto.focus(); });
        // la tastiera dentro il bloc notes resta lì (le frecce non devono cambiare team nel dettaglio); Esc chiude solo il bloc notes
        pop.addEventListener('keydown', e => {
            e.stopPropagation();
            if (e.key === 'Escape') { imposta(false); tasto.focus(); }
        });
        if (aperto) imposta(true);
        return {
            distruggi: () => { doc.removeEventListener('click', fuori); if (alAprire) alAprire(false); pannello.distruggi(); casella.replaceChildren(); },
            apri: () => imposta(true), chiudi: () => imposta(false)
        };
    }

    return {
        MAX_TESTO, MAX_NOTE,
        pulisciTesto, nuovaNota, leggiNote, contaNote, etichettaContesto, quando, percorso, chiaveBozza,
        ascolta, aggiungi, elimina, errorePerUtente,
        montaPannello, montaBarra
    };
});
