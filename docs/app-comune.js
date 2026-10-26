// =====================================================
// APP — le parti che il menù principale e le pagine hanno in comune
// ---------------------------------------------------------------------
// Lo carica app.js (nelle pagine) e menu.html (nel menù), solo quando il sito è aperto come app:
//   - le icone (tratti spessi, viewBox 24x24);
//   - il giocatore: users/<uid>/name -> players/<nome>/info (avatar, colore, titolo), stats/individual-stats (Elo) e stats/seasons (stagioni vinte);
//   - la finestra delle impostazioni ("Settings": suono, vibrazione, avvisi, ricarica, amministrazione, esci/entra), la stessa dal menù e da ogni pagina.
// Le parti pure (il giocatore per il menù, le tessere delle impostazioni) sono provate in test/app-comune.test.js;
// funziona nel browser (window.AppComune) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const C = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = C;
    else radice.AppComune = C;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CHIAVE_SUONO = 'userMusicPref';             // 'off' = spento (la stessa del resto del sito)
    const CHIAVE_VIBRA = 'appVibra';                  // 'off' = niente vibrazione
    const MIN_SD_CLASSIFICA = 3;                      // come Statistiche.MIN_SD_CLASSIFICA: con meno showdown un allenatore è senza Elo

    // le icone: tratti spessi, come il resto dell'app; il disegno sta dentro un viewBox 24x24
    const ICONE = {
        matches: '<path d="M5 19 19 5"/><path d="M19 19 5 5"/><path d="M14.5 5H19v4.5"/><path d="M9.5 5H5v4.5"/>',
        box: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5"/><path d="M12 12 4 7.5"/><path d="M12 12v9"/>',
        trainers: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16.6 14.3c2.9.3 4.9 2 4.9 5.2"/>',
        stats: '<path d="M5 20v-9"/><path d="M12 20V4"/><path d="M19 20v-6"/>',
        medaglia: '<circle cx="12" cy="9" r="5.2"/><path d="M8.6 13.4 7 21l5-2.7 5 2.7-1.6-7.6"/><path d="M12 6.8v4.4"/>',
        practice: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
        cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
        amici: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4"/><path d="M9 9.5h.01M15 9.5h.01"/>',
        suonoOn: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
        suonoOff: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M16 9l6 6"/><path d="M22 9l-6 6"/>',
        ingranaggio: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
        vibra: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8M1.5 10.5v3M22.5 10.5v3"/>',
        campana: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
        ricarica: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
        esci: '<path d="M10 4H5v16h5"/><path d="M15 8l4 4-4 4"/><path d="M9 12h10"/>',
        entra: '<path d="M14 4h5v16h-5"/><path d="M9 8l-4 4 4 4"/><path d="M5 12h10"/>',
        admin: '<path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
        indietro: '<path d="M15 5l-7 7 7 7"/>',
        casa: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
        utente: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c0-4 3.4-6.4 7.5-6.4s7.5 2.4 7.5 6.4"/>'
    };

    // ---------- parti pure ----------

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /** L'icona come elemento <svg> da scrivere nella pagina. */
    const svg = (nome, classe) => '<svg class="' + (classe || 'gx-icona') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONE[nome] || '') + '</svg>';

    /** Il giocatore per l'app, dai suoi dati di Firebase (players/<id>): avatar, nome, colore, titolo, Elo (se classificato) e stagioni vinte. */
    function riassuntoGiocatore(id, dati) {
        const d = dati || {};
        const info = d.info || {};
        const stats = d.stats || {};
        const ind = stats['individual-stats'] || {};
        const storia = (stats.seasons && stats.seasons.history) || {};
        const dalloStorico = Object.entries(storia).filter(([sId, st]) => sId !== 'sbeta' && st && (st.rank === 1 || st.rank === '1')).length;
        const vinte = Math.max(Number(stats.seasons && stats.seasons.won) || 0, dalloStorico);
        const giocati = Number(ind.showdownsPlayed || 0);
        const hoElo = ind.ranking !== undefined && giocati >= MIN_SD_CLASSIFICA;
        return {
            id: idDi(id),
            nome: String(info.name || id || '').trim(),
            avatar: info.avatar || 'immagini/magikarp.png',
            colore: /^#[0-9a-f]{3,8}$/i.test(String(info.color || '')) ? info.color : '',
            titolo: String(info.title || '').trim(),
            elo: hoElo ? Math.round(Number(ind.ranking)) : null,
            vinte
        };
    }

    /**
     * Le tessere della finestra delle impostazioni, dallo stato di quel momento.
     * `s`: { suono, vibra, push ('', 'acceso', 'spento', 'negato', 'non-supportato'), occupato, utente (collegato), nome, admin }
     * Una tessera ha `azione` (un tasto) oppure `href` (un collegamento); `classe` la colora.
     */
    function tessereOpzioni(s) {
        const x = s || {};
        const t = [
            { azione: 'suono', icona: x.suono ? 'suonoOn' : 'suonoOff', etichetta: 'Sound', stato: x.suono ? 'ON' : 'OFF' },
            { azione: 'vibra', icona: 'vibra', etichetta: 'Vibration', stato: x.vibra ? 'ON' : 'OFF' }
        ];
        if (x.utente && x.push && x.push !== 'non-supportato') {
            t.push({
                azione: 'avvisi', icona: 'campana', etichetta: 'Alerts', classe: x.push === 'negato' ? 'gx-spenta' : '',
                stato: x.occupato ? '…' : x.push === 'acceso' ? 'ON' : x.push === 'negato' ? 'BLOCKED' : 'OFF'
            });
        }
        t.push({ azione: 'ricarica', icona: 'ricarica', etichetta: 'Refresh', stato: '' });
        if (x.admin) t.push({ href: 'admin.html', icona: 'admin', etichetta: 'Admin', stato: '' });
        t.push(x.utente
            ? { azione: 'esci', icona: 'esci', etichetta: 'Log out', stato: x.nome || '', classe: 'gx-rossa' }
            : { azione: 'entra', icona: 'entra', etichetta: 'Log in', stato: '', classe: 'gx-verde' });
        return t;
    }

    // ---------- nel browser ----------

    /**
     * Il giocatore collegato, dai dati di Firebase (users/<uid>/name -> players/<nome>): promessa di { giocatore (riassuntoGiocatore, o null se l'account
     * non ha una scheda), admin (il ruolo) }, o di null se non si è collegati o la lettura è fallita.
     */
    async function leggiGiocatore(win, user) {
        if (!user || !win.firebase) return null;
        const db = win.firebase.database();
        try {
            const radiceUtente = (await db.ref('users/' + user.uid).once('value')).val() || {};
            const nome = radiceUtente.name;
            const admin = radiceUtente.role === 'admin';
            if (!nome) return { giocatore: null, admin };
            const id = idDi(nome);
            const [info, ind, stagioni] = await Promise.all([
                db.ref('players/' + id + '/info').once('value'),
                db.ref('players/' + id + '/stats/individual-stats').once('value'),
                db.ref('players/' + id + '/stats/seasons').once('value')
            ]);
            return { giocatore: riassuntoGiocatore(id, { info: info.val() || { name: nome }, stats: { 'individual-stats': ind.val() || {}, seasons: stagioni.val() || {} } }), admin };
        } catch (e) { return null; }
    }

    /**
     * La finestra delle impostazioni, uguale nel menù e nelle pagine. La crea alla prima apertura (se la pagina non l'ha già) con le classi dell'app (app-gioco.css).
     * `host`: { suonoAcceso(), cambiaSuono(), utente() (nome o ''), admin() (bool), accedi(), esci() } — quello che dipende dalla pagina.
     * Restituisce { apri, chiudi, aggiorna, aperta }.
     */
    function creaOpzioni(win, host) {
        const doc = win.document;
        const html = doc.documentElement;
        const leggi = k => { try { return win.localStorage.getItem(k); } catch (e) { return null; } };
        const scrivi = (k, v) => { try { win.localStorage.setItem(k, v); } catch (e) { /* senza memoria si riparte da acceso */ } };
        const suoni = () => win.Suoni && typeof win.Suoni.fai === 'function' ? win.Suoni : null;
        let statoPush = '', occupato = false, avviso = '';

        const dialogo = () => {
            let el = doc.getElementById('gx-opzioni');
            if (el) return el;
            el = doc.createElement('div');
            el.className = 'gx-dialogo';
            el.id = 'gx-opzioni';
            el.hidden = true;
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            el.setAttribute('aria-labelledby', 'gx-opzioni-titolo');
            el.innerHTML = '<div class="gx-pannello gx-largo">' +
                '<button type="button" class="gx-chiudi" data-chiudi aria-label="Close" data-suono="chiudi"></button>' +
                '<h2 id="gx-opzioni-titolo">Settings</h2>' +
                '<div class="gx-opzioni-griglia" id="gx-opzioni-griglia"></div>' +
                '<p class="gx-avviso" id="gx-opzioni-avviso" hidden></p>' +
                '</div>';
            doc.body.appendChild(el);
            el.addEventListener('click', e => {
                if ((e.target.closest && e.target.closest('[data-chiudi]')) || e.target === el) chiudi();
                else { const x = e.target.closest ? e.target.closest('[data-azione]') : null; if (x) azione(x.getAttribute('data-azione')); }
            });
            return el;
        };

        const stato = () => ({
            suono: !!host.suonoAcceso(), vibra: leggi(CHIAVE_VIBRA) !== 'off', push: statoPush, occupato,
            utente: !!host.utente(), nome: host.utente() || '', admin: !!(host.admin && host.admin())
        });
        function disegna() {
            const el = doc.getElementById('gx-opzioni');
            if (!el) return;
            el.querySelector('#gx-opzioni-griglia').innerHTML = tessereOpzioni(stato()).map(t => {
                const dentro = svg(t.icona, 'gx-icona-opz') + '<b>' + esc(t.etichetta) + '</b>' + (t.stato ? '<small>' + esc(t.stato) + '</small>' : '');
                return t.href
                    ? '<a class="gx-opzione' + (t.classe ? ' ' + t.classe : '') + '" href="' + esc(t.href) + '" data-suono="scegli">' + dentro + '</a>'
                    : '<button type="button" class="gx-opzione' + (t.classe ? ' ' + t.classe : '') + '" data-azione="' + t.azione + '">' + dentro + '</button>';
            }).join('');
            const av = el.querySelector('#gx-opzioni-avviso');
            av.textContent = avviso;
            av.hidden = !avviso;
        }

        // gli avvisi (push.js): si caricano solo qui, quando serve; la tessera c'è solo se questo telefono può riceverli
        const caricaPush = () => {
            const aggiorna = () => win.Push.stato().then(st => { statoPush = st; if (aperta()) disegna(); }).catch(() => { /* niente avvisi */ });
            if (win.Push) { aggiorna(); return; }
            const mio = Array.from(doc.scripts || []).find(x => /(^|\/)app-comune\.js(\?|#|$)/.test(x.getAttribute('src') || ''));
            const sc = doc.createElement('script');
            sc.src = mio ? mio.getAttribute('src').replace(/app-comune\.js/, 'push.js') : 'push.js';
            sc.onload = () => { win.Push.ripristina(); aggiorna(); };
            doc.head.appendChild(sc);
        };

        function azione(nome) {
            if (nome === 'suono') { host.cambiaSuono(); disegna(); const s = suoni(); if (s && host.suonoAcceso()) s.fai('scegli'); }
            else if (nome === 'vibra') { scrivi(CHIAVE_VIBRA, leggi(CHIAVE_VIBRA) !== 'off' ? 'off' : 'on'); const s = suoni(); if (s && leggi(CHIAVE_VIBRA) !== 'off') s.vibra('ok'); disegna(); }
            else if (nome === 'ricarica') win.location.reload();
            else if (nome === 'esci') { chiudi(); host.esci(); }
            else if (nome === 'entra') { chiudi(); host.accedi(); }
            else if (nome === 'avvisi' && win.Push && !occupato) {
                if (statoPush === 'negato') { avviso = 'Alerts are blocked: allow them for this app in the phone settings.'; disegna(); return; }
                occupato = true; avviso = ''; disegna();
                (statoPush === 'acceso' ? win.Push.disattiva() : win.Push.attiva())
                    .then(st => { statoPush = st; })
                    .catch(err => { avviso = String((err && err.message) || 'Could not turn alerts on'); })
                    .then(() => { occupato = false; disegna(); });
            }
        }

        const aperta = () => { const el = doc.getElementById('gx-opzioni'); return !!el && !el.hidden; };
        const aggiornaClasse = () => html.classList.toggle('gx-dialogo-aperto', !!doc.querySelector('.gx-dialogo:not([hidden])'));
        function apri() {
            const el = dialogo();
            avviso = '';
            disegna();
            el.hidden = false;
            aggiornaClasse();
            caricaPush();
            // il tasto "indietro" del telefono chiude la finestra invece di lasciare la pagina
            try { win.history.pushState({ appOpzioni: 1 }, ''); } catch (e) { /* senza cronologia: si chiude col tasto */ }
        }
        function chiudi(daIndietro) {
            const el = doc.getElementById('gx-opzioni');
            if (!el || el.hidden) return;
            el.hidden = true;
            aggiornaClasse();
            if (!daIndietro && win.history.state && win.history.state.appOpzioni) { try { win.history.back(); } catch (e) { /* niente */ } }
        }
        win.addEventListener('popstate', () => { if (aperta()) chiudi(true); });
        doc.addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(); });

        return { apri, chiudi, aggiorna: disegna, aperta };
    }

    return { CHIAVE_SUONO, CHIAVE_VIBRA, MIN_SD_CLASSIFICA, ICONE, idDi, esc, svg, riassuntoGiocatore, tessereOpzioni, leggiGiocatore, creaOpzioni };
});
