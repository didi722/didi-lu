// =====================================================
// SHOP — Poké-Tournament (la pagina)
//
// Tutto quello che si compra con le monete sta qui, diviso per DOVE si vede:
//   Your page   il catalogo (edizioni limitate, compagno shiny, aure, effetti del nome e del palco, motivi dello sfondo): toccando una voce la si prova sulla TUA pagina (a destra),
//               e si compra e si mette da qui;
//   Trainer     avatar, colore e canzone (il cambio costa, il primo e il ritorno al primo no): si vede subito sulla tua pagina;
//   Pokémon     lo shiny di ogni Pokémon dei tuoi team (il prezzo dipende dalla specie): si vede nel Box, in battaglia e sul sito;
//   Coins       come si guadagna e gli ultimi movimenti.
// La pagina a destra è public.html?anteprima=1 in un riquadro: le si manda { tipo: 'shop-prova', valori } e mostra la prova senza salvare niente (public-card.js, provaCosmetici).
// Il markup del catalogo e le frasi sono di negozio.js (puri, provati in Node); le monete le muove solo il server (functions/monete.js).
// Si può arrivare con ?tab=pagina|allenatore|pokemon|monete, ?item=<id di una voce del catalogo> (la prova) e ?team=<id di un team> (Pokémon).
// =====================================================
(function () {
    'use strict';

    const N = window.Negozio, C = window.Cosmetici, P = window.PaginaPubblica, SP = window.SpritePkm;
    if (!N || !C || !P) return;

    const $ = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const URL_PLAYLIST = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRBD7fZsWUtQ-UqcSaG-2lzeQnbxUdCUlTc8D6b4dCmSLq4-sDpIJGVzKmwwZF0p1uF-Ln3--4jpGk/pub?gid=775181727&single=true&output=csv';
    const MAX_RIGHE = 150;
    const TAB_CON_ANTEPRIMA = ['pagina', 'allenatore'];

    const S = {
        uid: '', giocatore: '', saldo: 0, posseduti: {}, casa: {}, info: {}, pagina: {}, movimenti: [], stagioni: {}, nomiStagioni: {}, registro: {}, teams: [],
        tutti: null, canzoni: null, ricerca: '', anteprime: {}, tab: 'pagina', occupato: false, prova: {}, provando: '', squadra: '', armato: null
    };
    let ascolto = null;          // l'audio dell'anteprima di una canzone

    // ---------------------------------------------------------------- i dati
    async function leggi() {
        const db = firebase.database();
        S.giocatore = String((await db.ref(`users/${S.uid}/name`).once('value')).val() || '').toLowerCase().trim();
        const vuoto = { val: () => ({}) };
        const idStagioni = C.stagioniEdizioni();
        const [w, info, teams, registro, ...stagioni] = await Promise.all([
            db.ref(`wallet/${S.uid}`).once('value'),
            S.giocatore ? db.ref(`players/${S.giocatore}/info`).once('value') : Promise.resolve(vuoto),
            S.giocatore ? db.ref(`players/${S.giocatore}/teams`).once('value') : Promise.resolve(vuoto),
            db.ref('cosmeticiPresi').once('value').catch(() => vuoto),
            ...idStagioni.map(id => db.ref(`seasons/${id}/info`).once('value').then(x => x.val() || {}, () => ({})))
        ]);
        const wallet = w.val() || {};
        S.saldo = num(wallet.saldo); S.posseduti = wallet.posseduti || {}; S.casa = wallet.casa || {};
        S.movimenti = Object.keys(wallet.movimenti || {}).sort().map(k => wallet.movimenti[k]);
        S.info = info.val() || {}; S.pagina = S.info.pagina || {};
        S.registro = registro.val() || {};
        S.stagioni = {}; S.nomiStagioni = {};
        idStagioni.forEach((id, k) => { if (stagioni[k].status != null) S.stagioni[id] = stagioni[k].status; if (stagioni[k].name) S.nomiStagioni[id] = stagioni[k].name; });
        S.anteprime = N.creaAnteprime(window, S.info);
        const grezzi = teams.val() || {};
        const vecchi = Object.fromEntries(S.teams.map(t => [t.id, t]));
        S.teams = Object.entries(grezzi).filter(([, t]) => t && typeof t === 'object').map(([id, t]) => ({
            id, nome: String((t.nome && typeof t.nome === 'object' ? t.nome.valore : t.nome) || 'Team'), pokemon: (Array.isArray(t.pokemon) ? t.pokemon : Object.values(t.pokemon || {})).filter(p => p && p.nome), vecchio: vecchi[id]
        }));
    }
    /** Tutti gli allenatori (per sapere cosa hanno già scelto gli altri): si legge solo aprendo la scheda Trainer */
    async function caricaTutti() {
        if (S.tutti) return;
        S.tutti = {};
        try { S.tutti = (await firebase.database().ref('players').once('value')).val() || {}; } catch (e) { S.tutti = {}; }
        if (!S.canzoni) {
            S.canzoni = 'carico';
            fetch(`${URL_PLAYLIST}&t=${Date.now()}`).then(r => r.text()).then(t => { S.canzoni = P.leggiCsvCanzoni(t); }).catch(() => { S.canzoni = 'errore'; }).finally(() => { if (S.tab === 'allenatore') disegna(true); });
        }
        if (S.tab === 'allenatore') disegna(true);
    }

    // ---------------------------------------------------------------- messaggi, saldo, anteprima
    function msg(testo, errore) {
        const m = $('shop-msg');
        m.textContent = testo || ''; m.hidden = !testo; m.classList.toggle('shop-errore', !!errore);
    }
    const mostraSaldo = () => { $('shop-saldo').textContent = `🪙 ${S.saldo}`; };

    const base = () => ({
        aura: S.info.aura || null, effettoNome: S.info.effettoNome || null, effettoPalco: S.info.effettoPalco || null, pkmShiny: !!S.info.pkmShiny,
        sfondoMotivo: null, avatar: S.info.avatar || '', color: S.info.color || ''
    });
    // la pagina nel riquadro è larga 1100 pixel (com'è sul PC): si rimpicciolisce per stare nella colonna
    function adattaAnteprima() {
        const q = $('shop-schermo');
        if (q && q.clientWidth > 0) q.style.setProperty('--k', (q.clientWidth / 1100).toFixed(4));
    }
    window.addEventListener('resize', adattaAnteprima);
    function aggiornaAnteprima() {
        const f = $('shop-iframe');
        const prova = Object.keys(S.prova).length > 0;
        $('shop-reset').hidden = !prova;
        $('shop-anteprima-nota').textContent = prova ? 'Trying it on' : 'Tap anything to try it on';
        if (f && f.contentWindow && f.dataset.pronta) f.contentWindow.postMessage({ tipo: 'shop-prova', valori: { ...base(), ...S.prova } }, window.location.origin);
    }
    window.addEventListener('message', e => {
        if (e.origin !== window.location.origin || !e.data || e.data.tipo !== 'shop-pronta') return;
        $('shop-iframe').dataset.pronta = '1';
        aggiornaAnteprima();
    });
    function provaVoce(id) {
        const c = C.perId(id);
        if (!c) return;
        const campo = c.tipo === 'shiny' ? 'pkmShiny' : c.tipo === 'aura' ? 'aura' : c.tipo === 'nome' ? 'effettoNome' : c.tipo === 'palco' ? 'effettoPalco' : c.tipo === 'sfondo' ? 'sfondoMotivo' : '';
        if (!campo) return;
        const valore = c.tipo === 'shiny' ? true : c.tipo === 'sfondo' ? c.motivo : c.id;
        if (S.provando === id) { delete S.prova[campo]; S.provando = ''; } else { S.prova[campo] = valore; S.provando = id; }
        aggiornaAnteprima(); disegna(true);
    }
    function azzeraProva() { S.prova = {}; S.provando = ''; aggiornaAnteprima(); disegna(true); }

    // ---------------------------------------------------------------- Your page
    const statoCatalogo = () => ({ saldo: S.saldo, posseduti: S.posseduti, info: S.info, pagina: S.pagina, anteprime: S.anteprime, stagioni: S.stagioni, nomiStagioni: S.nomiStagioni, occupato: S.occupato, provando: S.provando });
    const htmlPagina = () => `<p class="shop-aiuto">Tap anything to see it on your page. <a href="public.html?player=${encodeURIComponent(S.giocatore)}&amp;edit=1">Customize your page →</a></p>${N.catalogoHtml(statoCatalogo())}`;

    // ---------------------------------------------------------------- Trainer: avatar, colore, canzone
    const casaDi = tipo => S.casa[tipo] || (!C.eDiDefault(tipo, S.info) ? C.idCorrente(tipo, S.info) : '');
    const presoDa = id => { const o = S.registro[id]; return o && o !== S.giocatore ? String(o) : ''; };
    const bello = t => String(t).replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
    const prezzoDi = (tipo, id) => C.prezzoCambio(tipo, { wallet: { casa: S.casa }, info: S.info }, id || '');

    function htmlAvatar(presi) {
        const attuale = P.chiaveAvatar(S.info.avatar), casa = casaDi('avatar'), pr = prezzoDi('avatar');
        const tutti = P.elencoAvatar();
        const bottoni = tutti.map(f => {
            const n = f.replace('.png', ''), id = `avatar-${n}`, chiave = `profile/${f}`.toLowerCase(), portato = chiave === attuale, casaMia = id === casa;
            const altro = !portato && (presi.avatar.has(chiave) || presoDa(id));
            const titolo = altro ? `Avatar ${n} · taken${presoDa(id) ? ` by ${bello(presoDa(id))}` : ' by another trainer'}` : casaMia ? `Avatar ${n} · your first avatar, yours for good · coming back is free` : portato ? `Avatar ${n} · you wear it` : `Avatar ${n} · ${pr.gratis ? 'free (your first one)' : `change for ${pr.prezzo} 🪙`}`;
            return `<button type="button" class="shop-av${portato ? ' is-on' : ''}${casaMia ? ' is-casa' : ''}${altro ? ' is-preso' : ''}" data-ng="avatar" data-id="${id}" data-n="${n}" title="${esc(titolo)}" aria-label="${esc(titolo)}"${altro || portato ? ' disabled' : ''}><img src="immagini/profile/${f}" alt="" loading="lazy"></button>`;
        }).join('');
        const nota = pr.gratis ? 'Your first avatar is free and stays yours for good (coming back to it is always free). Every avatar belongs to one trainer only.'
            : `Changing your avatar costs ${pr.prezzo} 🪙 and happens right away. Your first avatar (★) is the only personal one: yours for good, and coming back to it is free. The one you wear is yours while you wear it, then it goes back to the pool.`;
        return `<section class="ng-gruppo"><h3>Avatar</h3><p>${nota}</p><div class="shop-avatar-griglia">${bottoni}</div></section>`;
    }

    function htmlColore(presi) {
        const attuale = String(S.info.color || '').toUpperCase(), casa = casaDi('colore'), pr = prezzoDi('colore');
        const colori = P.PALETTE_FIRMA.slice();
        if (attuale && !colori.some(c => c.toUpperCase() === attuale)) colori.unshift(attuale);
        const bottoni = colori.map(c => {
            const K = c.toUpperCase(), id = C.idColore(K), portato = K === attuale, casaMia = !!id && id === casa;
            const altro = !portato && (presi.colori.has(K) || (id && presoDa(id)));
            const titolo = altro ? `${K} · taken` : casaMia ? `${K} · your first colour, yours for good · coming back is free` : portato ? `${K} · you wear it` : `${K} · ${pr.gratis ? 'free (your first one)' : `change for ${pr.prezzo} 🪙`}`;
            return `<button type="button" class="shop-col${portato ? ' is-on' : ''}${casaMia ? ' is-casa' : ''}${altro ? ' is-preso' : ''}" style="--c:${esc(K)}" data-ng="colore" data-c="${esc(K)}" title="${esc(titolo)}" aria-label="${esc(titolo)}"${altro || portato || !id ? ' disabled' : ''}></button>`;
        }).join('');
        const nota = pr.gratis ? 'Your first colour is free and stays yours for good (coming back to it is always free). Every colour belongs to one trainer only.'
            : `Changing your colour costs ${pr.prezzo} 🪙 and happens right away. Your first colour (★) is the only personal one: yours for good, and coming back to it is free.`;
        return `<section class="ng-gruppo"><h3>Signature colour</h3><p>It colours your name, stats and trophy. Greyed out colours belong to other trainers. ${nota}</p><div class="shop-colori">${bottoni}</div></section>`;
    }

    function htmlCanzone(presi) {
        const casa = casaDi('canzone'), pr = prezzoDi('canzone'), mio = S.info.musicaPreferita;
        let corpo;
        if (S.canzoni === 'errore') corpo = '<p class="ng-nota">Could not load the playlist. Check your connection and reopen this tab.</p>';
        else if (!S.canzoni || S.canzoni === 'carico') corpo = '<p class="ng-nota">Loading the playlist…</p>';
        else {
            const q = S.ricerca.trim().toLowerCase();
            const trovate = S.canzoni.filter(c => !q || c.nome.toLowerCase().includes(q));
            corpo = trovate.slice(0, MAX_RIGHE).map(c => {
                const id = C.idCanzone(c.url), casaMia = !!id && id === casa, portata = c.url === mio;
                const altro = !portata && (presi.canzoniUrl.has(c.url.trim()) || presi.canzoniNomi.has(c.nome.trim().toLowerCase()) || presoDa(id));
                return `<div class="shop-canzone${altro ? ' is-preso' : ''}${portata ? ' is-on' : ''}"><button type="button" class="shop-scelta" data-ng="canzone" data-url="${esc(c.url)}" data-nome="${esc(c.nome)}"${altro || portata ? ' disabled' : ''}>`
                    + `<span>${casaMia ? '★ ' : ''}${esc(c.nome)}</span>${portata ? '<small>on now</small>' : altro ? '<small>taken</small>' : `<small>${pr.gratis || casaMia ? 'free' : `${pr.prezzo} 🪙`}</small>`}</button>`
                    + `<button type="button" class="shop-ascolta" data-ng="ascolta" data-url="${esc(c.url)}" title="Listen" aria-label="Listen to ${esc(c.nome)}">▶</button></div>`;
            }).join('') + (trovate.length > MAX_RIGHE ? `<p class="ng-nota">${trovate.length - MAX_RIGHE} more: type in the search box to narrow it down.</p>` : '') + (trovate.length ? '' : '<p class="ng-nota">No songs found.</p>');
        }
        const nota = pr.gratis ? 'Your first song is free and stays yours for good (coming back to it is always free). Every song belongs to one trainer only. Tap ▶ to listen before you choose.'
            : `Changing your song costs ${pr.prezzo} 🪙 and happens right away; "None" is free. Your first song (★) is the only personal one: yours for good, and coming back to it is free. The song plays from the Music block of your card.`;
        return `<section class="ng-gruppo"><h3>Favourite song</h3><div class="shop-attuale">Now: <b>${esc(S.info.musicName || (mio ? 'Favourite song' : 'None'))}</b>`
            + `<button type="button" class="ng-bottone" data-ng="canzone-nessuna"${mio ? '' : ' disabled'} title="Play no song (free)">None</button></div>`
            + `<input type="search" class="shop-ricerca" id="shop-ricerca" placeholder="Search a song…" aria-label="Search a song" value="${esc(S.ricerca)}"><div class="shop-canzoni">${corpo}</div><p class="ng-nota">${nota}</p></section>`;
    }

    function htmlAllenatore() {
        if (!S.tutti) return '<p class="ng-nota">Loading…</p>';
        const presi = P.scelteDegliAltri(S.giocatore, S.tutti);
        return htmlAvatar(presi) + htmlColore(presi) + htmlCanzone(presi);
    }

    // la conferma di un cambio: una finestrella con quanto costa e che fine fa quello di adesso (e intanto lo si vede sulla pagina a destra)
    function chiediCambio({ tipo, id, nome, immagine, colore, extra, prova }) {
        const p = id ? prezzoDi(tipo, id) : { prezzo: 0, gratis: false };
        const corrente = C.idCorrente(tipo, S.info);
        const nomeCorrente = !corrente ? '' : tipo === 'avatar' ? `Avatar ${corrente.replace('avatar-', '')}` : tipo === 'colore' ? `Colour ${C.coloreDaId(corrente)}` : '';
        const f = N.frasiCambio({ tipo, id, prezzo: p.prezzo, gratis: p.gratis, ritorno: p.ritorno, saldo: S.saldo, corrente, casa: casaDi(tipo), nomeCorrente });
        if (prova) { S.prova = { ...S.prova, ...prova }; aggiornaAnteprima(); }
        const chiudi = () => { velo.remove(); document.removeEventListener('keydown', tasto); if (prova) { for (const k of Object.keys(prova)) delete S.prova[k]; aggiornaAnteprima(); } };
        const tasto = e => { if (e.key === 'Escape') chiudi(); };
        const velo = document.createElement('div');
        velo.className = 'shop-conferma-velo';
        velo.innerHTML = `<div class="shop-conferma" role="dialog" aria-modal="true" aria-label="${esc(id ? `Change to ${nome}` : 'Remove the song')}">`
            + (immagine ? `<img src="${esc(immagine)}" alt="">` : colore ? `<span class="shop-conferma-colore" style="--c:${esc(colore)}"></span>` : '')
            + `<b>${esc(nome)}</b>${f.righe.map(r => `<p>${esc(r)}</p>`).join('')}<div class="shop-conferma-azioni"><button type="button" class="ng-bottone" data-x="annulla">Cancel</button>`
            + `<button type="button" class="ng-bottone ng-compra" data-x="ok"${f.ok ? '' : ' disabled'}>${esc(f.conferma)}</button></div></div>`;
        velo.addEventListener('click', async e => {
            if (e.target === velo || (e.target.dataset && e.target.dataset.x === 'annulla')) return chiudi();
            if (!(e.target.dataset && e.target.dataset.x === 'ok') || e.target.disabled) return;
            e.target.disabled = true; e.target.textContent = 'Changing…';
            let r;
            try { r = await N.cambia(window, { tipo, id, ...(extra || {}) }); } catch (err) { r = { ok: false, motivo: 'error' }; }
            document.removeEventListener('keydown', tasto); velo.remove();
            if (r.ok) {
                S.prova = {};
                await leggi(); mostraSaldo();
                msg(!id ? 'Song removed.' : r.gratis ? `${nome} is yours for good!` : r.ritorno ? `Welcome back to ${nome}!` : `${nome} it is!`);
                aggiornaAnteprima(); disegna(true);
            } else {
                if (prova) { for (const k of Object.keys(prova)) delete S.prova[k]; aggiornaAnteprima(); }
                msg(N.frase(r.motivo), true);
                if (r.motivo === 'taken') { await leggi(); disegna(true); }
            }
        });
        document.addEventListener('keydown', tasto);
        document.body.append(velo);
    }

    // ---------------------------------------------------------------- Pokémon: lo shiny di ogni Pokémon dei team
    function htmlPokemon() {
        const squadre = S.teams.filter(t => t.pokemon.length);
        if (!squadre.length) return '<p class="ng-nota">You have no team in your Box yet: build one, then come back to make its Pokémon shiny.</p>';
        if (!squadre.some(t => t.id === S.squadra)) S.squadra = squadre[0].id;
        const t = squadre.find(x => x.id === S.squadra);
        const gif = (nome, shiny) => (SP && SP.gif ? SP.gif(nome, shiny) : '');
        const schede = squadre.map(x => `<button type="button" class="shop-squadra${x.id === S.squadra ? ' attiva' : ''}" data-ng="squadra" data-id="${esc(x.id)}">${esc(x.nome)}</button>`).join('');
        return `<section class="ng-gruppo"><h3>Shiny Pokémon</h3><div class="shop-squadre">${schede}</div>`
            + N.shinyTeamHtml({ pokemon: t.pokemon.map(p => ({ nome: p.nome, shiny: !!p.shiny, normale: gif(p.nome, false), brillante: gif(p.nome, true) })), saldo: S.saldo, occupato: S.occupato, armato: S.armato && S.armato.team === t.id ? S.armato.i : null })
            + `<p class="ng-nota">You will see it in your <a href="box.html">Box</a>, in battle, in the rankings and on your page.</p></section>`;
    }

    // ---------------------------------------------------------------- Coins
    const htmlMonete = () => `<section class="ng-gruppo"><h3>Earning coins</h3><p>${esc(N.notaPremi())}</p></section>${N.guidaHtml()}${N.movimentiHtml(S.movimenti)}`;

    // ---------------------------------------------------------------- disegno
    function disegna(tieniScorrimento) {
        const el = $('shop-contenuto');
        const y = window.scrollY;
        el.innerHTML = S.tab === 'pagina' ? htmlPagina() : S.tab === 'allenatore' ? htmlAllenatore() : S.tab === 'pokemon' ? htmlPokemon() : htmlMonete();
        $('shop-corpo').classList.toggle('senza-anteprima', !TAB_CON_ANTEPRIMA.includes(S.tab));
        adattaAnteprima();
        document.querySelectorAll('.shop-scheda').forEach(b => { const su = b.dataset.tab === S.tab; b.classList.toggle('attiva', su); b.setAttribute('aria-selected', String(su)); });
        const r = $('shop-ricerca');
        if (r && document.activeElement === document.body && S.ricerca) { /* la ricerca si riscrive da sola: non si ruba il fuoco */ }
        if (tieniScorrimento) window.scrollTo(0, y);
    }
    function vai(tab) {
        S.tab = ['pagina', 'allenatore', 'pokemon', 'monete'].includes(tab) ? tab : 'pagina';
        S.armato = null; msg('');
        if (ascolto) { ascolto.pause(); ascolto = null; }
        try { const u = new URL(window.location.href); u.searchParams.set('tab', S.tab); window.history.replaceState(null, '', u.toString()); } catch (e) { /* niente */ }
        if (S.tab === 'allenatore') caricaTutti();
        disegna();
    }

    async function operazione(fn, ok) {
        if (S.occupato) return;
        S.occupato = true; msg(''); disegna(true);
        try { const r = await fn(); ok(r); } catch (e) { msg("Couldn't do that. Try again in a moment.", true); }
        S.occupato = false; disegna(true);
    }

    // ---------------------------------------------------------------- i tocchi
    $('shop-contenuto').addEventListener('click', async e => {
        const b = e.target.closest ? e.target.closest('[data-ng]') : null;
        if (!b || b.disabled) { if (S.armato) { S.armato = null; disegna(true); } return; }
        const ng = b.dataset.ng;
        if (ng === 'prova') return provaVoce(b.dataset.id);
        if (ng === 'compra' || ng === 'equipa') {
            return operazione(() => N.chiama(window, ng === 'compra' ? 'acquistaCosmetico' : 'equipaCosmetico', { id: b.dataset.id, attivo: b.dataset.attivo !== '0' }), async r => {
                msg(r.ok ? (ng === 'compra' ? 'Bought! Put it on whenever you like.' : 'Done.') : N.frase(r.motivo), !r.ok);
                if (r.ok) { S.prova = {}; S.provando = ''; }
                await leggi(); mostraSaldo(); aggiornaAnteprima();
            });
        }
        if (ng === 'avatar') return chiediCambio({ tipo: 'avatar', id: b.dataset.id, nome: `Avatar ${b.dataset.n}`, immagine: `immagini/profile/${b.dataset.n}.png`, prova: { avatar: `immagini/profile/${b.dataset.n}.png` } });
        if (ng === 'colore') { const K = b.dataset.c; return chiediCambio({ tipo: 'colore', id: C.idColore(K), nome: `Colour ${K}`, colore: K, prova: { color: K } }); }
        if (ng === 'canzone') { if (ascolto) { ascolto.pause(); ascolto = null; } return chiediCambio({ tipo: 'canzone', id: C.idCanzone(b.dataset.url), nome: b.dataset.nome, extra: { url: b.dataset.url, nome: b.dataset.nome } }); }
        if (ng === 'canzone-nessuna') return chiediCambio({ tipo: 'canzone', id: '', nome: 'No song', extra: {} });
        if (ng === 'ascolta') {
            const gia = ascolto && ascolto.src === b.dataset.url;
            if (ascolto) { ascolto.pause(); ascolto = null; }
            if (gia) return;
            ascolto = new Audio(b.dataset.url); ascolto.volume = 0.4; ascolto.play().catch(() => {});
            return;
        }
        if (ng === 'squadra') { S.squadra = b.dataset.id; S.armato = null; return disegna(true); }
        if (ng === 'shiny') {
            const t = S.teams.find(x => x.id === S.squadra), i = Number(b.dataset.i);
            // un tocco arma il pulsante ("Sure?"), il secondo compra: le monete non si spendono per sbaglio
            if (!S.armato || S.armato.team !== t.id || S.armato.i !== i) { S.armato = { team: t.id, i }; return disegna(true); }
            S.armato = null;
            return operazione(() => N.chiama(window, 'shinyPokemonTeam', { team: t.id, indice: i }), r => {
                if (r.ok) { t.pokemon[i].shiny = true; S.saldo = num(r.saldo); mostraSaldo(); msg(`${t.pokemon[i].nome} is shiny now!`); }
                else { msg(N.frase(r.motivo), true); if (r.motivo === 'already') t.pokemon[i].shiny = true; }
            });
        }
    });
    $('shop-contenuto').addEventListener('input', e => { if (e.target.id === 'shop-ricerca') { S.ricerca = e.target.value; const pos = e.target.selectionStart; disegna(true); const r = $('shop-ricerca'); if (r) { r.focus(); r.setSelectionRange(pos, pos); } } });
    $('shop-schede').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) vai(b.dataset.tab); });
    $('shop-reset').addEventListener('click', azzeraProva);

    // ---------------------------------------------------------------- avvio
    function avvia(utente) {
        const accedi = $('shop-accedi'), corpo = $('shop-corpo'), schede = $('shop-schede');
        const loader = $('poke-loader');
        const finito = () => { if (loader) loader.style.display = 'none'; };
        if (!utente) { accedi.hidden = false; corpo.hidden = true; schede.hidden = true; $('shop-saldo').textContent = '🪙 –'; finito(); return; }
        accedi.hidden = true; schede.hidden = false;
        S.uid = utente.uid;
        if (!document.getElementById('ng-stile')) { const st = document.createElement('style'); st.id = 'ng-stile'; st.textContent = N.STILE; document.head.appendChild(st); }
        leggi().then(() => {
            mostraSaldo();
            corpo.hidden = false;
            $('shop-iframe').src = `public.html?player=${encodeURIComponent(S.giocatore)}&anteprima=1`;
            const q = new URLSearchParams(window.location.search);
            if (q.get('team') && S.teams.some(t => t.id === q.get('team'))) S.squadra = q.get('team');
            vai(q.get('tab') || (q.get('team') ? 'pokemon' : 'pagina'));
            const voce = q.get('item');
            if (voce && S.tab === 'pagina') { provaVoce(voce); const riga = document.querySelector(`.ng-voce[data-id="${voce.replace(/[^a-z0-9-]/gi, '')}"]`); if (riga && riga.scrollIntoView) riga.scrollIntoView({ block: 'center' }); }
            finito();
        }).catch(() => { msg("Couldn't load your coins. Check the connection and reload the page.", true); finito(); });
    }
    firebase.auth().onAuthStateChanged(avvia);
})();
