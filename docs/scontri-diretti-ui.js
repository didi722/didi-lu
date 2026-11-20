// =====================================================
// SCONTRI DIRETTI — la finestra (pagina Trainers e app)
//
// Il tasto "VS" accanto a ogni allenatore apre il testa a testa: chi guarda (se ha fatto il login) contro quell'allenatore, con due selettori per
// confrontare qualunque coppia e il VS in mezzo per scambiare i lati. I calcoli e l'HTML sono in scontri-diretti.js (puro, provato in Node);
// qui si legge il database e si gestisce la finestra.
//
// I dati sono le stagioni (showdown e match): quelle che la pagina Trainers ha già letto per i badge (DbLeggero.stagioniConStats, con la cache tra le pagine),
// quindi aprire la finestra non scarica niente di nuovo. Chi non può leggerle (senza login) vede un avviso con "try again".
//
//   ScontriDirettiUI.imposta({ db, giocatori })    il database e gli allenatori [{ id, nome, avatar, colore }] in ordine di classifica
//   ScontriDirettiUI.apri(idAvversario)            apre la finestra: chi è collegato contro `idAvversario` (senza login: il primo della classifica)
//   ScontriDirettiUI.chiudi()
//   ScontriDirettiUI.htmlTasto(id, nome)           il tasto "VS" da scrivere nella pagina; clic(evento, tasto) lo collega
//   ScontriDirettiUI.aggiornaTasti(radice)         nasconde il proprio (non ci si confronta con se stessi)
//
// Chi è collegato lo dice window.__nomeUtente (lo scrive la pagina dopo il login).
// =====================================================
(function () {
    'use strict';
    const SD = window.ScontriDiretti;
    if (!SD) return;

    const stato = { db: null, giocatori: [], stagioni: null, promessa: null, errore: false, a: '', b: '', tutti: false, velo: null, fuoco: null, premutoSulVelo: false };

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const io = () => idDi(window.__nomeUtente);
    const giocatore = id => stato.giocatori.find(g => idDi(g.id) === idDi(id)) || null;

    function imposta({ db, giocatori } = {}) {
        if (db) stato.db = db;
        if (Array.isArray(giocatori)) stato.giocatori = giocatori.filter(g => g && g.id);
    }

    // Le stagioni con i showdown e i match: una sola lettura per pagina (e la cache tra le pagine di db-leggero.js)
    function caricaStagioni() {
        if (stato.stagioni) return Promise.resolve(stato.stagioni);
        if (!stato.promessa) {
            const db = stato.db || (window.firebase && window.firebase.database ? window.firebase.database() : null);
            if (!db) return Promise.reject(new Error('No database'));
            const leggi = window.DbLeggero && window.DbLeggero.stagioniConStats
                ? window.DbLeggero.stagioniConStats(db)
                : db.ref('seasons').once('value').then(s => s.val() || {});
            stato.promessa = Promise.resolve(leggi)
                .then(s => (stato.stagioni = s || {}))
                .catch(e => { stato.promessa = null; throw e; });
        }
        return stato.promessa;
    }

    function disegna(focoSu) {
        const velo = stato.velo;
        if (!velo || velo.hidden) return;
        const nomi = Object.fromEntries(stato.giocatori.map(g => [idDi(g.id), g.nome || g.id]));
        const c = SD.confronta(stato.a, stato.b, stato.stagioni || {}, { nomi });
        const colore = id => (giocatore(id) || {}).colore;
        let corpo;
        if (stato.stagioni) corpo = SD.htmlScheda(c, { io: io(), tutti: stato.tutti, colori: { a: colore(stato.a), b: colore(stato.b) } });
        else if (stato.errore) corpo = '<p class="h2h-vuoto">The results could not be loaded. Check your connection (you may need to log in), then <button type="button" class="h2h-riprova" data-h2h-riprova>try again</button></p>';
        else corpo = '<p class="h2h-attesa" role="status">Loading the results…</p>';
        velo.querySelector('.h2h-contenuto').innerHTML = SD.htmlTesta(c, { giocatori: stato.giocatori, io: io() }) + corpo;
        if (focoSu) {
            const s = velo.querySelector(`[data-h2h-scelta="${focoSu}"]`);
            if (s) s.focus();
        }
    }

    function leggiEDisegna() {
        stato.errore = false;
        caricaStagioni().then(() => disegna(), () => { stato.errore = true; disegna(); });
    }

    // Tab resta dentro la finestra
    function trattieniFuoco(e) {
        const dentro = Array.from(stato.velo.querySelectorAll('button:not([disabled]), select:not([disabled]), a[href]')).filter(el => !el.closest('[hidden]'));
        if (!dentro.length) return;
        const primo = dentro[0], ultimo = dentro[dentro.length - 1];
        if (!stato.velo.contains(document.activeElement)) { e.preventDefault(); primo.focus(); }
        else if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    }

    function creaVelo() {
        if (stato.velo) return;
        const velo = document.createElement('div');
        velo.id = 'h2h-velo';
        velo.className = 'h2h-velo';
        velo.hidden = true;
        velo.setAttribute('role', 'dialog');
        velo.setAttribute('aria-modal', 'true');
        velo.setAttribute('aria-labelledby', 'h2h-titolo');
        velo.innerHTML = '<div class="h2h-scheda"><button type="button" class="h2h-x" data-h2h-chiudi aria-label="Close">&times;</button><h2 class="h2h-titolo" id="h2h-titolo">Head to head</h2><div class="h2h-contenuto"></div></div>';
        document.body.appendChild(velo);
        stato.velo = velo;

        // si chiude toccando fuori, ma non se la pressione è cominciata dentro la finestra (selezionare trascinando fuori)
        velo.addEventListener('mousedown', e => { stato.premutoSulVelo = e.target === velo; });
        velo.addEventListener('touchstart', e => { stato.premutoSulVelo = e.target === velo; }, { passive: true });
        velo.addEventListener('click', e => {
            const t = e.target;
            if (t === velo) { if (stato.premutoSulVelo) chiudi(); return; }
            if (t.closest('[data-h2h-chiudi]')) return chiudi();
            if (t.closest('[data-h2h-scambia]')) { [stato.a, stato.b] = [stato.b, stato.a]; return disegna(); }
            if (t.closest('[data-h2h-altri]')) { stato.tutti = true; return disegna(); }
            if (t.closest('[data-h2h-riprova]')) { disegna(); return leggiEDisegna(); }
        });
        velo.addEventListener('change', e => {
            const s = e.target && e.target.closest ? e.target.closest('[data-h2h-scelta]') : null;
            if (!s) return;
            const lato = s.dataset.h2hScelta === 'b' ? 'b' : 'a';
            const altro = lato === 'a' ? stato.b : stato.a;
            const scelto = idDi(s.value);
            if (scelto && scelto !== altro) { stato[lato] = scelto; stato.tutti = false; }
            disegna(lato);
        });
        document.addEventListener('keydown', e => {
            if (!stato.velo || stato.velo.hidden || e.defaultPrevented) return;
            if (e.key === 'Escape') {
                if (document.querySelector('.ts-lista')) return;      // un menu a tendina aperto: Esc chiude quello (controlli.js)
                e.preventDefault();
                chiudi();
            } else if (e.key === 'Tab') trattieniFuoco(e);
        });
    }

    function apri(idAvversario) {
        const { a, b } = SD.coppiaIniziale(io(), idAvversario, stato.giocatori);
        if (!b) return;
        Object.assign(stato, { a, b, tutti: false });
        stato.fuoco = document.activeElement;
        creaVelo();
        stato.velo.hidden = false;
        document.documentElement.classList.add('h2h-aperto');
        disegna();
        const x = stato.velo.querySelector('.h2h-x');
        if (x) x.focus();
        if (!stato.stagioni) leggiEDisegna();
    }

    function chiudi() {
        if (!stato.velo || stato.velo.hidden) return;
        stato.velo.hidden = true;
        document.documentElement.classList.remove('h2h-aperto');
        const f = stato.fuoco;
        stato.fuoco = null;
        if (f && typeof f.focus === 'function' && document.contains(f)) f.focus();
    }

    // Il tasto da scrivere dentro la pagina (accanto alla card dell'allenatore)
    function htmlTasto(id, nome) {
        return `<button type="button" class="tasto-scontro" data-id="${esc(idDi(id))}" title="Head to head with ${esc(nome)}" aria-label="Head to head with ${esc(nome)}" onclick="ScontriDirettiUI.clic(event, this)"><span>VS</span></button>`;
    }

    function clic(evento, tasto) {
        evento.preventDefault();
        evento.stopPropagation();
        apri(tasto.dataset.id);
    }

    // Nasconde il proprio tasto; chi non ha fatto il login li vede tutti (il primo della classifica fa da punto di vista)
    function aggiornaTasti(radice) {
        const mio = io();
        (radice || document).querySelectorAll('.tasto-scontro[data-id]').forEach(t => { t.hidden = !!mio && t.dataset.id === mio; });
    }
    document.addEventListener('app-utente', () => aggiornaTasti(document));

    window.ScontriDirettiUI = { imposta, apri, chiudi, clic, htmlTasto, aggiornaTasti };
})();
