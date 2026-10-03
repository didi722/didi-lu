/* =====================================================================
   TEMI DEL SITO — quattro aspetti, uno per giocatore.
   Il tema è l'attributo data-tema su <html>; temi.css descrive ogni tema con le variabili --nb-*.
   Qui si decide quale tema usare:
     1. subito (prima del primo disegno): quello salvato in questo browser (localStorage);
     2. appena si sa chi è collegato: quello salvato nel suo profilo, players/<nome>/info/temaSito,
        che da quel momento vale anche per il browser.
   Il colore del giocatore (players/<nome>/info/color) diventa --nb-accento: tinge la carta della pagina.
   I caratteri di ogni tema sono in fonts/tema-<id>.css e prendono il posto di Josefin Sans e Montserrat.
   Modulo UMD: la parte pura (elenco, normalizzazione, URL) si prova anche in Node (test/temi.test.js).
   ===================================================================== */
(function (root, factory) {
    const M = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = M;
    else root.TemiSito = M;
    if (typeof document !== 'undefined' && root.document === document) M.avvia(root);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PREDEFINITO = 'neubrutal';
    const CHIAVE_TEMA = 'temaSito';
    const CHIAVE_COLORE = 'coloreSito';
    const COLORE_OSPITE = '#ffa500';   // lo stesso arancione che le pagine danno alla barra in alto quando non sei collegato

    // L'ordine è quello in cui compaiono nel selettore. "colori" serve alle anteprime del selettore.
    const TEMI = {
        neubrutal: {
            nome: 'Neubrutal',
            frase: 'Hard black shadows and thick borders. The classic look.',
            caratteri: 'Josefin Sans + Montserrat'
        },
        sticker: {
            nome: 'Sticker',
            frase: 'Louder colors, bigger shadows, everything a bit crooked.',
            caratteri: 'Titan One + Fredoka'
        },
        morbido: {
            nome: 'Soft',
            frase: 'Rounded corners, light shadows, almost straight.',
            caratteri: 'Nunito'
        },
        arcade: {
            nome: 'Arcade',
            frase: 'Dark screen, neon shadows, terminal type.',
            caratteri: 'Chakra Petch + Inconsolata'
        }
    };
    const ELENCO = Object.keys(TEMI);

    /** L'id se è un tema che esiste, altrimenti quello predefinito. */
    function normalizza(id) {
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TEMI, id) ? id : PREDEFINITO;
    }

    /** Colore "#rrggbb" (o "#rgb") in minuscolo, oppure null se non è un colore esadecimale. */
    function coloreValido(c) {
        if (typeof c !== 'string') return null;
        const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
        if (!m) return null;
        const h = m[1].toLowerCase();
        return '#' + (h.length === 3 ? h.replace(/./g, x => x + x) : h);
    }

    /** Foglio con i caratteri del tema, oppure null per il tema predefinito (che usa quelli del sito). */
    function cssCaratteri(id) {
        const t = normalizza(id);
        return t === PREDEFINITO ? null : `fonts/tema-${t}.css`;
    }

    // ---- memoria del browser (può non esserci, o lanciare: si ignora e basta) ----
    function legge(storage, chiave) {
        try { return storage ? storage.getItem(chiave) : null; } catch (e) { return null; }
    }
    function scrive(storage, chiave, valore) {
        try { if (storage) { if (valore == null) storage.removeItem(chiave); else storage.setItem(chiave, valore); } } catch (e) { /* niente */ }
    }
    function memoria(root) {
        try { return root.localStorage || null; } catch (e) { return null; }
    }

    // ---- applicazione alla pagina ----
    function linkCaratteri(doc) {
        let l = doc.getElementById('temi-caratteri');
        if (!l) {
            l = doc.createElement('link');
            l.id = 'temi-caratteri';
            l.rel = 'stylesheet';
            (doc.head || doc.documentElement).appendChild(l);
        }
        return l;
    }

    /** Mette il tema sulla pagina: attributo su <html> e foglio dei caratteri. Ritorna l'id applicato. */
    function applica(root, id) {
        const doc = root.document;
        const t = normalizza(id);
        if (!doc || !doc.documentElement) return t;
        doc.documentElement.setAttribute('data-tema', t);
        const css = cssCaratteri(t);
        const l = doc.getElementById('temi-caratteri');
        if (css) {
            const link = l || linkCaratteri(doc);
            if (link.getAttribute('href') !== css) link.setAttribute('href', css);
        } else if (l) {
            l.remove();
        }
        return t;
    }

    /** Il colore del giocatore come --nb-accento (null/non valido: il verde della lega, tolto l'inline). */
    function applicaColore(root, colore) {
        const doc = root.document;
        if (!doc || !doc.documentElement) return;
        const c = coloreValido(colore);
        if (c) doc.documentElement.style.setProperty('--nb-accento', c);
        else doc.documentElement.style.removeProperty('--nb-accento');
    }

    // ---- stato condiviso con la pagina (il selettore del profilo lo legge) ----
    const stato = { chiave: null, tema: PREDEFINITO, colore: null, pronto: false, manuale: null, ascoltatori: [] };
    function avvisa() {
        stato.ascoltatori.slice().forEach(f => { try { f(stato); } catch (e) { /* un ascoltatore rotto non ferma gli altri */ } });
    }

    /** Salva la scelta: subito nel browser, poi (se si sa chi sei) nel profilo. Ritorna una promessa. */
    function scegli(root, id) {
        const t = applica(root, id);
        stato.tema = t;
        stato.manuale = t;
        scrive(memoria(root), CHIAVE_TEMA, t);
        avvisa();
        const fb = root.firebase;
        if (!stato.chiave || !fb || !fb.apps || !fb.apps.length) return Promise.resolve({ salvato: false, motivo: 'locale' });
        return fb.database().ref(`players/${stato.chiave}/info`).update({ temaSito: t })
            .then(() => ({ salvato: true }))
            .catch(e => ({ salvato: false, motivo: e && e.code === 'PERMISSION_DENIED' ? 'permessi' : 'rete' }));
    }

    /** Dopo l'accesso: legge il profilo del giocatore e adotta tema e colore. */
    function sincronizza(root, tentativo) {
        const fb = root.firebase;
        if (!fb || !fb.apps || !fb.apps.length || typeof fb.auth !== 'function') {
            // la pagina non ha ancora chiamato firebase.initializeApp(): si riprova per qualche secondo
            const n = tentativo || 0;
            if (n < 60 && typeof root.setTimeout === 'function') root.setTimeout(() => sincronizza(root, n + 1), 150);
            return;
        }
        const mem = memoria(root);
        fb.auth().onAuthStateChanged(async utente => {
            if (!utente) {
                // ospite: resta il tema scelto su questo browser, ma il colore torna quello degli ospiti
                stato.chiave = null;
                stato.colore = COLORE_OSPITE;
                scrive(mem, CHIAVE_COLORE, null);
                applicaColore(root, COLORE_OSPITE);
                stato.pronto = true;
                avvisa();
                return;
            }
            try {
                const db = fb.database();
                const nome = (await db.ref(`users/${utente.uid}/name`).once('value')).val();
                if (!nome) return;
                const chiave = String(nome).toLowerCase().trim();
                const info = (await db.ref(`players/${chiave}/info`).once('value')).val() || {};
                stato.chiave = chiave;
                if (stato.manuale) {
                    // ha già scelto qui mentre il profilo si leggeva: vale la sua scelta, e la si salva nel profilo
                    stato.tema = applica(root, stato.manuale);
                    scrive(mem, CHIAVE_TEMA, stato.tema);
                    db.ref(`players/${chiave}/info`).update({ temaSito: stato.tema }).catch(() => { /* resta valida qui */ });
                } else {
                    // chi è collegato e non ha mai scelto usa il tema predefinito (non quello di chi c'era prima su questo browser)
                    stato.tema = applica(root, info.temaSito);
                    scrive(mem, CHIAVE_TEMA, stato.tema);
                }
                const col = coloreValido(info.color);
                stato.colore = col;
                scrive(mem, CHIAVE_COLORE, col);
                applicaColore(root, col);
            } catch (e) {
                /* senza rete o permessi si tiene quello che c'è già */
            }
            stato.pronto = true;
            avvisa();
        });
    }

    /** "index.html", "/box.html?x=1", "/sito/" → nome del file della pagina (una cartella senza file è index.html). */
    function paginaDi(percorso) {
        const p = String(percorso == null ? '' : percorso).split('?')[0].split('#')[0];
        const nome = p.slice(p.lastIndexOf('/') + 1);
        return nome ? nome.toLowerCase() : 'index.html';
    }

    /** Nel menu dell'utente segna la voce della pagina in cui si è (aria-current="page", la colora temi.css). Ritorna quante voci ha segnato. */
    function segnaPagina(doc, percorso) {
        if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
        const qui = paginaDi(percorso);
        let n = 0;
        for (const voce of doc.querySelectorAll('.user-dropdown .menu-item[href]')) {
            if (paginaDi(voce.getAttribute('href')) === qui) { voce.setAttribute('aria-current', 'page'); n++; }
            else if (voce.getAttribute('aria-current')) voce.removeAttribute('aria-current');
        }
        return n;
    }

    /** All'apertura della pagina: subito il tema e il colore ricordati, poi la sincronizzazione col profilo. */
    function avvia(root) {
        // ogni apertura di pagina riparte da zero
        stato.chiave = null; stato.manuale = null; stato.pronto = false;
        const mem = memoria(root);
        stato.tema = applica(root, legge(mem, CHIAVE_TEMA));
        const col = coloreValido(legge(mem, CHIAVE_COLORE));
        stato.colore = col;
        applicaColore(root, col || COLORE_OSPITE);
        const parti = () => { segnaPagina(root.document, root.location && root.location.pathname); sincronizza(root); };
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', parti);
        else parti();
    }

    /** Chiede di essere avvisato quando cambia qualcosa (tema scelto, profilo letto). Ritorna la funzione per smettere. */
    function ascolta(f) {
        stato.ascoltatori.push(f);
        return () => { const i = stato.ascoltatori.indexOf(f); if (i >= 0) stato.ascoltatori.splice(i, 1); };
    }

    // ---- selettore (pagina del profilo) ----
    function el(doc, tag, attributi, figli) {
        const e = doc.createElement(tag);
        Object.keys(attributi || {}).forEach(k => e.setAttribute(k, attributi[k]));
        (figli || []).forEach(f => e.appendChild(typeof f === 'string' ? doc.createTextNode(f) : f));
        return e;
    }

    const NOTE = {
        profilo: 'Saved to your profile: it follows you on every device.',
        locale: 'Saved on this device. Log in to keep it on your profile.',
        permessi: 'Applied here, but the database refused to save it on your profile (permissions).',
        rete: 'Applied here, but saving it on your profile failed. Try again later.'
    };

    /** Costruisce dentro "contenitore" la fila di anteprime dei temi; ogni clic applica e salva la scelta. */
    function montaSelettore(root, contenitore) {
        const doc = root.document;
        if (!doc || !contenitore) return null;
        if (!doc.getElementById('temi-anteprime')) {
            // le anteprime mostrano ogni tema con i suoi caratteri veri (non con quelli del tema attivo)
            (doc.head || doc.documentElement).appendChild(el(doc, 'link', { id: 'temi-anteprime', rel: 'stylesheet', href: 'fonts/anteprime.css' }));
        }
        contenitore.textContent = '';
        const lista = el(doc, 'div', { class: 'tm-lista', role: 'radiogroup', 'aria-label': 'Site theme' });
        const nota = el(doc, 'p', { class: 'tm-nota', role: 'status', 'aria-live': 'polite' });
        const opzioni = ELENCO.map(id => {
            const t = TEMI[id];
            const anteprima = el(doc, 'span', { class: 'tm-anteprima', 'aria-hidden': 'true' }, [
                el(doc, 'span', { class: 'tm-titolo' }, ['SEASON HUB']),
                el(doc, 'span', { class: 'tm-card' }, [
                    el(doc, 'span', { class: 'tm-card-nome' }, ['DIDI']),
                    el(doc, 'span', { class: 'tm-card-punti' }, ['1032'])
                ]),
                el(doc, 'span', { class: 'tm-chip' }, ['OPEN'])
            ]);
            const b = el(doc, 'button', { type: 'button', class: 'tm-opzione', role: 'radio', 'aria-checked': 'false', 'data-tema': id, 'data-scelta': id }, [
                anteprima,
                el(doc, 'span', { class: 'tm-nome' }, [t.nome]),
                el(doc, 'span', { class: 'tm-frase' }, [t.frase]),
                el(doc, 'span', { class: 'tm-attivo' }, ['\u2713 ACTIVE'])
            ]);
            lista.appendChild(b);
            return b;
        });

        function segna(id) {
            opzioni.forEach(b => {
                const si = b.getAttribute('data-scelta') === id;
                b.setAttribute('aria-checked', si ? 'true' : 'false');
                b.setAttribute('tabindex', si ? '0' : '-1');
                b.classList.toggle('attivo', si);
            });
        }
        function scelto(id) {
            segna(id);
            nota.textContent = 'Saving\u2026';
            scegli(root, id).then(r => {
                nota.textContent = r.salvato ? NOTE.profilo : (NOTE[r.motivo] || NOTE.locale);
                nota.classList.toggle('problema', !r.salvato && r.motivo !== 'locale');
            });
        }
        lista.addEventListener('click', e => {
            const b = e.target.closest && e.target.closest('.tm-opzione');
            if (b) scelto(b.getAttribute('data-scelta'));
        });
        // frecce: sposta e sceglie, come un gruppo di radio
        lista.addEventListener('keydown', e => {
            const verso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!verso) return;
            e.preventDefault();
            const i = opzioni.findIndex(b => b.getAttribute('aria-checked') === 'true');
            const prossimo = opzioni[(Math.max(i, 0) + verso + opzioni.length) % opzioni.length];
            prossimo.focus();
            scelto(prossimo.getAttribute('data-scelta'));
        });

        segna(stato.tema);
        contenitore.appendChild(lista);
        contenitore.appendChild(nota);
        // se il profilo viene letto dopo, il tema segnato può cambiare
        ascolta(s => segna(s.tema));
        return { lista, nota, segna };
    }

    return { PREDEFINITO, TEMI, ELENCO, CHIAVE_TEMA, CHIAVE_COLORE, COLORE_OSPITE, normalizza, coloreValido, cssCaratteri, applica, applicaColore, scegli, sincronizza, avvia, ascolta, montaSelettore, paginaDi, segnaPagina, stato };
});
