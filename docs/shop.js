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
    // l'icona delle monete (immagini/moneta.png) al posto dell'emoji, nel markup già protetto (mai dentro gli attributi)
    const conMoneta = h => String(h).replace(/🪙/g, '<img class="shop-moneta" src="immagini/moneta.png" alt="coins">');
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const URL_PLAYLIST = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRBD7fZsWUtQ-UqcSaG-2lzeQnbxUdCUlTc8D6b4dCmSLq4-sDpIJGVzKmwwZF0p1uF-Ln3--4jpGk/pub?gid=775181727&single=true&output=csv';
    const MAX_RIGHE = 150;
    const TAB_CON_ANTEPRIMA = ['pagina', 'allenatore'];

    const S = {
        uid: '', giocatore: '', saldo: 0, posseduti: {}, casa: {}, info: {}, pagina: {}, movimenti: [], stagioni: {}, nomiStagioni: {}, registro: {}, teams: [],
        tutti: null, shinyPkm: {}, scelta: null, canzoni: null, ricerca: '', anteprime: {}, tab: 'pagina', occupato: false, prova: {}, provando: '', squadra: '', armato: null
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
        S.saldo = num(wallet.saldo); S.posseduti = wallet.posseduti || {}; S.casa = wallet.casa || {}; S.shinyPkm = wallet.shinyPkm || {};
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
    const mostraSaldo = () => { $('shop-saldo').innerHTML = conMoneta(`🪙 ${S.saldo}`); };

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
        // una prova alla volta: sceglierne un'altra toglie la precedente
        S.scelta = null;
        if (S.provando === id) { S.prova = {}; S.provando = ''; } else { S.prova = { [campo]: valore }; S.provando = id; }
        aggiornaAnteprima(); disegna(true);
    }
    function azzeraProva() { S.prova = {}; S.provando = ''; S.scelta = null; aggiornaAnteprima(); disegna(true); }

    // ---------------------------------------------------------------- Your page
    const compagnoBox = () => { const b = C.compagnoDelBox(S.info, S.teams); return b ? String(b.nome || b.name || 'that Pokémon') : ''; };
    const statoCatalogo = () => ({ saldo: S.saldo, posseduti: S.posseduti, info: S.info, pagina: S.pagina, anteprime: S.anteprime, stagioni: S.stagioni, nomiStagioni: S.nomiStagioni, occupato: S.occupato, provando: S.provando, compagnoBox: compagnoBox() });
    const htmlPagina = () => `<p class="shop-aiuto">Tap anything to see it on your page.</p>${N.catalogoHtml(statoCatalogo())}`;

    // ---------------------------------------------------------------- Trainer: avatar, colore, canzone
    // Si comprano e si hanno (massimo C.LIMITI per tipo): quelli che hai si indossano gratis o si rilasciano; per prenderne un altro a quota piena se ne rilascia uno. Sono unici: gli altri li vedono grigi.
    const contestoW = () => ({ wallet: { posseduti: S.posseduti, casa: S.casa }, info: S.info });
    const possedute = tipo => C.possedutiDiTipo(tipo, contestoW());
    const presoDa = id => { const o = S.registro[id]; return o && o !== S.giocatore ? String(o) : ''; };
    const bello = t => String(t).replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
    /** Indirizzo e nome di una canzone che si ha: dal portafoglio, da quella che si porta o dalla playlist */
    function brano(id) {
        const v = S.posseduti[id];
        if (v && typeof v === 'object' && v.url) return { url: String(v.url), nome: String(v.nome || 'Song') };
        if (S.info.musicaPreferita && C.idCanzone(S.info.musicaPreferita) === id) return { url: S.info.musicaPreferita, nome: S.info.musicName || 'Song' };
        const c = Array.isArray(S.canzoni) ? S.canzoni.find(x => C.idCanzone(x.url) === id) : null;
        return c ? { url: c.url, nome: c.nome } : null;
    }
    /** Come si presenta un avatar, un colore o una canzone che si ha: { nome, immagine?, colore?, extra? } */
    function voceDi(tipo, id) {
        if (tipo === 'avatar') return { nome: `Avatar ${id.replace('avatar-', '')}`, immagine: `immagini/profile/${id.replace('avatar-', '')}.png` };
        if (tipo === 'colore') return { nome: C.coloreDaId(id), colore: C.coloreDaId(id) };
        const b = brano(id);
        return { nome: b ? b.nome : 'Song', extra: b ? { url: b.url, nome: b.nome } : null };
    }
    const attributiDi = (tipo, id) => { const v = voceDi(tipo, id); return `data-tipo="${tipo}" data-id="${esc(id)}" data-nome="${esc(v.nome)}"${v.extra ? ` data-url="${esc(v.extra.url)}"` : ''}${v.immagine ? ` data-img="${esc(v.immagine)}"` : ''}${v.colore ? ` data-c="${esc(v.colore)}"` : ''}`; };

    /** Quelli che hai: chi è addosso, e per gli altri "Wear" (gratis) e "Release" */
    function htmlMiei(tipo) {
        const portato = C.idCorrente(tipo, S.info);
        const righe = possedute(tipo).map(id => {
            const v = voceDi(tipo, id), su = id === portato;
            const testa = tipo === 'avatar' ? `<img class="shop-miio-img" src="${esc(v.immagine)}" alt="">` : tipo === 'colore' ? `<span class="shop-miio-col" style="--c:${esc(v.colore)}"></span>` : '<span class="shop-miio-nota">♪</span>';
            const ascolta = tipo === 'canzone' && v.extra ? `<button type="button" class="shop-ascolta" data-ng="ascolta" data-url="${esc(v.extra.url)}" title="Listen" aria-label="Listen to ${esc(v.nome)}">▶</button>` : '';
            return `<li class="shop-miio${su ? ' is-on' : ''}">${testa}<span class="shop-miio-nome"><b>${esc(v.nome)}</b><small>${su ? 'You wear it' : 'Yours'}</small></span>${ascolta}`
                + (su ? '<span class="shop-miio-su">On now</span>' : `<button type="button" class="ng-bottone" data-ng="indossa" ${attributiDi(tipo, id)}>Wear</button><button type="button" class="ng-bottone" data-ng="rilascia" ${attributiDi(tipo, id)}>Release</button>`) + '</li>';
        }).join('');
        const nessuna = tipo === 'canzone' ? '<p class="ng-nota">No song. Your first one is free.</p>' : `<p class="ng-nota">You have no ${cosaDi(tipo)} of your own yet. Your first one is free.</p>`;
        const senza = tipo === 'canzone' && S.info.musicaPreferita ? '<button type="button" class="ng-bottone" data-ng="canzone-nessuna" title="Play no song (free)">No song</button>' : '';
        return `<ul class="shop-miei">${righe || ''}</ul>${righe ? '' : nessuna}${senza}`;
    }
    const cosaDi = tipo => (tipo === 'avatar' ? 'avatar' : tipo === 'colore' ? 'colour' : 'song');
    const conta = tipo => `<span class="shop-conta" title="The most you can have">${possedute(tipo).length}/${C.LIMITI[tipo]}</span>`;
    const notaCollezione = tipo => {
        const pr = C.prezzoAcquisto(tipo, contestoW());
        return pr.gratis ? `Your first ${cosaDi(tipo)} is free. Every ${cosaDi(tipo)} belongs to one trainer only: the ones you have are yours, nobody else can take them.`
            : `A new ${cosaDi(tipo)} costs ${pr.prezzo} 🪙. You can have ${C.LIMITI[tipo]} at most: to get another one you release one of yours (free), and it goes back to the pool for everyone. Wearing the ones you have is free.`;
    };

    /** Avatar e colore si provano sulla tua pagina (a destra) prima di comprare: un tocco li sceglie (il precedente si toglie), "Buy" apre la conferma */
    function scegli(d) {
        if (S.scelta && S.scelta.id === d.id) { S.scelta = null; S.prova = {}; }
        else { S.scelta = d; S.provando = ''; S.prova = d.tipo === 'avatar' ? { avatar: d.immagine } : { color: d.colore }; }
        aggiornaAnteprima(); disegna(true);
    }
    function barraScelta(tipo) {
        if (!S.scelta || S.scelta.tipo !== tipo) return '';
        const pr = C.prezzoAcquisto(tipo, contestoW());
        return `<div class="shop-barra"><span><b>${esc(S.scelta.nome)}</b> on your page</span><button type="button" class="ng-bottone ng-compra" data-ng="compra-scelta">${pr.gratis ? 'Take it for free' : `Buy · ${pr.prezzo} 🪙`}</button><button type="button" class="ng-bottone" data-ng="annulla-scelta">Cancel</button></div>`;
    }
    function htmlAvatar(presi) {
        const mie = new Set(possedute('avatar')), pr = C.prezzoAcquisto('avatar', contestoW());
        const bottoni = P.elencoAvatar().map(f => {
            const n = f.replace('.png', ''), id = `avatar-${n}`, chiave = `profile/${f}`.toLowerCase();
            if (mie.has(id)) return '';
            const altro = presi.avatar.has(chiave) || presoDa(id);
            const titolo = altro ? `Avatar ${n} · taken${presoDa(id) ? ` by ${bello(presoDa(id))}` : ' by another trainer'}` : `Avatar ${n} · ${pr.gratis ? 'free (your first one)' : `${pr.prezzo} coins`}`;
            return `<button type="button" class="shop-av${altro ? ' is-preso' : ''}${S.scelta && S.scelta.id === id ? ' is-prova' : ''}" data-ng="prendi" data-tipo="avatar" data-id="${id}" data-nome="Avatar ${n}" data-img="immagini/profile/${f}" title="${esc(titolo)}" aria-label="${esc(titolo)}"${altro ? ' disabled' : ''}><img src="immagini/profile/${f}" alt="" loading="lazy"></button>`;
        }).join('');
        return `<section class="ng-gruppo"><h3>Avatar ${conta('avatar')}</h3><p>${notaCollezione('avatar')}</p>${htmlMiei('avatar')}<h4 class="shop-sotto">${pr.gratis ? 'Pick your first one' : 'Get another'}</h4>${barraScelta('avatar')}<div class="shop-avatar-griglia">${bottoni}</div></section>`;
    }

    function htmlColore(presi) {
        const mie = new Set(possedute('colore')), pr = C.prezzoAcquisto('colore', contestoW());
        const bottoni = P.PALETTE_FIRMA.map(c => {
            const K = c.toUpperCase(), id = C.idColore(K);
            if (!id || mie.has(id)) return '';
            const altro = presi.colori.has(K) || presoDa(id);
            const titolo = altro ? `${K} · taken` : `${K} · ${pr.gratis ? 'free (your first one)' : `${pr.prezzo} coins`}`;
            return `<button type="button" class="shop-col${altro ? ' is-preso' : ''}${S.scelta && S.scelta.id === id ? ' is-prova' : ''}" style="--c:${esc(K)}" data-ng="prendi" data-tipo="colore" data-id="${id}" data-nome="${esc(K)}" data-c="${esc(K)}" title="${esc(titolo)}" aria-label="${esc(titolo)}"${altro ? ' disabled' : ''}></button>`;
        }).join('');
        return `<section class="ng-gruppo"><h3>Signature colour ${conta('colore')}</h3><p>It colours your name, stats and trophy. ${notaCollezione('colore')}</p>${htmlMiei('colore')}<h4 class="shop-sotto">${pr.gratis ? 'Pick your first one' : 'Get another'}</h4>${barraScelta('colore')}<div class="shop-colori">${bottoni}</div></section>`;
    }

    function htmlCanzone(presi) {
        const mie = new Set(possedute('canzone')), pr = C.prezzoAcquisto('canzone', contestoW());
        let corpo;
        if (S.canzoni === 'errore') corpo = '<p class="ng-nota">Could not load the playlist. Check your connection and reopen this tab.</p>';
        else if (!S.canzoni || S.canzoni === 'carico') corpo = '<p class="ng-nota">Loading the playlist…</p>';
        else {
            const q = S.ricerca.trim().toLowerCase();
            const trovate = S.canzoni.filter(c => !mie.has(C.idCanzone(c.url)) && (!q || c.nome.toLowerCase().includes(q)));
            corpo = trovate.slice(0, MAX_RIGHE).map(c => {
                const id = C.idCanzone(c.url);
                const altro = presi.canzoniUrl.has(c.url.trim()) || presi.canzoniNomi.has(c.nome.trim().toLowerCase()) || presoDa(id);
                return `<div class="shop-canzone${altro ? ' is-preso' : ''}"><button type="button" class="shop-scelta" data-ng="prendi" data-tipo="canzone" data-id="${id}" data-nome="${esc(c.nome)}" data-url="${esc(c.url)}"${altro ? ' disabled' : ''}>`
                    + `<span>${esc(c.nome)}</span><small>${altro ? 'taken' : pr.gratis ? 'free' : `${pr.prezzo} 🪙`}</small></button>`
                    + `<button type="button" class="shop-ascolta" data-ng="ascolta" data-url="${esc(c.url)}" title="Listen" aria-label="Listen to ${esc(c.nome)}">▶</button></div>`;
            }).join('') + (trovate.length > MAX_RIGHE ? `<p class="ng-nota">${trovate.length - MAX_RIGHE} more: type in the search box to narrow it down.</p>` : '') + (trovate.length ? '' : '<p class="ng-nota">No songs found.</p>');
        }
        return `<section class="ng-gruppo"><h3>Favourite song ${conta('canzone')}</h3><p>${notaCollezione('canzone')} Tap ▶ to listen before you choose. The song plays from the Music block of your card.</p>${htmlMiei('canzone')}`
            + `<h4 class="shop-sotto">${pr.gratis ? 'Pick your first one' : 'Get another'}</h4><input type="search" class="shop-ricerca" id="shop-ricerca" placeholder="Search a song…" aria-label="Search a song" value="${esc(S.ricerca)}"><div class="shop-canzoni">${corpo}</div></section>`;
    }

    function htmlAllenatore() {
        if (!S.tutti) return '<p class="ng-nota">Loading…</p>';
        const presi = P.scelteDegliAltri(S.giocatore, S.tutti);
        return htmlAvatar(presi) + htmlColore(presi) + htmlCanzone(presi);
    }

    // ---- le finestrelle: comprare (a quota piena, scegliendo cosa rilasciare) e rilasciare
    function finestra(html, alClick, alloAnnullo) {
        const velo = document.createElement('div');
        velo.className = 'shop-conferma-velo';
        velo.innerHTML = conMoneta(`<div class="shop-conferma" role="dialog" aria-modal="true">${html}</div>`);
        const togli = () => { velo.remove(); document.removeEventListener('keydown', tasto); };
        const annulla = () => { togli(); if (alloAnnullo) alloAnnullo(); };
        const tasto = e => { if (e.key === 'Escape') annulla(); };
        velo.addEventListener('click', e => { if (e.target === velo || (e.target.dataset && e.target.dataset.x === 'annulla')) return annulla(); alClick(e, velo, togli); });
        document.addEventListener('keydown', tasto);
        document.body.append(velo);
        return velo;
    }
    const testaConferma = d => (d.immagine ? `<img src="${esc(d.immagine)}" alt="">` : d.colore ? `<span class="shop-conferma-colore" style="--c:${esc(d.colore)}"></span>` : '');

    /** Prendere un avatar, un colore o una canzone: quanto costa e, a quota piena, quale dei tuoi rilasciare (e intanto si vede sulla pagina a destra) */
    function chiediAcquisto({ tipo, id, nome, immagine, colore, extra }) {
        const pr = C.prezzoAcquisto(tipo, contestoW()), mie = possedute(tipo), limite = C.LIMITI[tipo], piena = mie.length >= limite;
        let scelta = '';
        const frasi = () => N.frasiAcquisto({ tipo, nome, prezzo: pr.prezzo, gratis: pr.gratis, saldo: S.saldo, piena, limite, scelta });
        const scelte = !piena ? '' : `<div class="shop-rilascia" role="radiogroup" aria-label="Release one">${mie.map(x => { const v = voceDi(tipo, x); return `<label><input type="radio" name="shop-rilascia" value="${esc(x)}"><span>${tipo === 'avatar' ? `<img src="${esc(v.immagine)}" alt="">` : tipo === 'colore' ? `<i style="--c:${esc(v.colore)}"></i>` : ''}${esc(v.nome)}${x === C.idCorrente(tipo, S.info) ? ' (you wear it)' : ''}</span></label>`; }).join('')}</div>`;
        const corpo = f => `${testaConferma({ immagine, colore })}<b>${esc(nome)}</b>${f.righe.map(r => `<p>${esc(r)}</p>`).join('')}${scelte}<div class="shop-conferma-azioni"><button type="button" class="ng-bottone" data-x="annulla">Cancel</button><button type="button" class="ng-bottone ng-compra" data-x="ok"${f.ok ? '' : ' disabled'}>${esc(f.conferma)}</button></div>`;
        finestra(corpo(frasi()), async (e, velo, togli) => {
            if (e.target.name === 'shop-rilascia') { scelta = e.target.value; velo.querySelector('[data-x=ok]').disabled = !frasi().ok; return; }
            if (!(e.target.dataset && e.target.dataset.x === 'ok') || e.target.disabled) return;
            e.target.disabled = true; e.target.textContent = 'Working…';
            let r;
            try { r = await N.chiama(window, 'acquistaCosmetico', { id, ...(extra || {}), ...(scelta ? { rilascia: scelta } : {}) }); } catch (err) { r = { ok: false, motivo: 'error' }; }
            togli();
            if (r.ok) {
                S.prova = {}; S.scelta = null;
                await leggi(); mostraSaldo();
                msg(r.gratis ? `${nome} is yours, for free!` : `${nome} is yours!${r.rilasciato ? ' The other one went back to the pool.' : ''}`);
                aggiornaAnteprima(); disegna(true);
            } else {
                msg(N.frase(r.motivo), true);
                if (r.motivo === 'taken' || r.motivo === 'limit') { await leggi(); disegna(true); }
            }
        });
    }

    // ---- lo shiny dei Pokémon di un team
    const squadraAttuale = () => S.teams.find(x => x.id === S.squadra);
    /** Tornare normale (gratis) o rimettere shiny un Pokémon già comprato (gratis) */
    function cambiaShiny(i, attivo) {
        const t = squadraAttuale(), p = t && t.pokemon[i];
        if (!p) return;
        return operazione(() => N.chiama(window, 'shinyPokemonTeam', { team: t.id, indice: i, attivo }), async r => {
            msg(r.ok ? (attivo ? `${p.nome} is shiny again!` : `${p.nome} is back to normal.`) : N.frase(r.motivo), !r.ok);
            await leggi(); mostraSaldo();
        });
    }
    /** Comprare lo shiny di un Pokémon: la conferma con il Pokémon in grande, normale e shiny */
    function chiediShiny(i) {
        const t = squadraAttuale(), p = t && t.pokemon[i];
        if (!p) return;
        const gif = (nome, shiny) => (SP && SP.gif ? SP.gif(nome, shiny) : '');
        const f = C.prezzoShiny(p.nome), poco = S.saldo < f.prezzo;
        const img = src => (src ? `<img class="shop-pkm-grande" src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'">` : '');
        finestra(`<div class="shop-pkm-coppia">${img(gif(p.nome, false))}<i>→</i>${img(gif(p.nome, true))}</div><b>${esc(p.nome)}</b>`
            + `<p>Shiny ${esc(p.nome)} costs ${f.prezzo} 🪙 and you have ${S.saldo} 🪙.${poco ? ' Play some sets to earn more coins.' : ''}</p>${poco ? '' : '<p><b>Are you sure you want to buy it?</b></p>'}<p>You can go back to normal colours any time, and make it shiny again for free.</p>`
            + `<div class="shop-conferma-azioni"><button type="button" class="ng-bottone" data-x="annulla">Cancel</button><button type="button" class="ng-bottone ng-compra" data-x="ok"${poco ? ' disabled' : ''}>Yes, buy · ${f.prezzo} 🪙</button></div>`, (e, velo, togli) => {
            if (!(e.target.dataset && e.target.dataset.x === 'ok') || e.target.disabled) return;
            togli();
            operazione(() => N.chiama(window, 'shinyPokemonTeam', { team: t.id, indice: i }), async r => {
                msg(r.ok ? `${p.nome} is shiny now!` : N.frase(r.motivo), !r.ok);
                await leggi(); mostraSaldo();
            });
        });
    }

    /** Comprare una voce del catalogo: prima una finestra con la voce in grande e la domanda "sei sicuro?" */
    function chiediCatalogo(c) {
        if (!c) return;
        const grande = `<div class="ng-voce shop-grande" data-tipo="${esc(c.tipo)}" data-id="${esc(c.id)}">${N.anteprima(c, S.anteprime[c.id], S.info.color)}</div>`;
        const poco = S.saldo < c.prezzo;
        finestra(`${grande}<b>${esc(c.nome)}</b><p>${esc(c.descr || '')}</p><p>It costs ${c.prezzo} 🪙 and you have ${S.saldo} 🪙.${poco ? ' Play some sets to earn more coins.' : ''}</p>${poco ? '' : '<p><b>Are you sure you want to buy it?</b></p>'}`
            + `<div class="shop-conferma-azioni"><button type="button" class="ng-bottone" data-x="annulla">Cancel</button><button type="button" class="ng-bottone ng-compra" data-x="ok"${poco ? ' disabled' : ''}>Yes, buy · ${c.prezzo} 🪙</button></div>`, (e, velo, togli) => {
            if (!(e.target.dataset && e.target.dataset.x === 'ok') || e.target.disabled) return;
            togli();
            operazione(() => N.chiama(window, 'acquistaCosmetico', { id: c.id }), async r => {
                msg(r.ok ? `${c.nome} is yours! Put it on whenever you like.` : N.frase(r.motivo), !r.ok);
                if (r.ok) { S.prova = {}; S.provando = ''; }
                await leggi(); mostraSaldo(); aggiornaAnteprima();
            });
        });
    }

    /** Lasciare andare uno di quelli che si hanno */
    function chiediRilascio({ tipo, id, nome, immagine, colore }) {
        const f = N.frasiRilascio({ tipo, nome });
        finestra(`${testaConferma({ immagine, colore })}<b>${esc(nome)}</b>${f.righe.map(r => `<p>${esc(r)}</p>`).join('')}<div class="shop-conferma-azioni"><button type="button" class="ng-bottone" data-x="annulla">Cancel</button><button type="button" class="ng-bottone ng-compra" data-x="ok">${esc(f.conferma)}</button></div>`, async (e, velo, togli) => {
            if (!(e.target.dataset && e.target.dataset.x === 'ok') || e.target.disabled) return;
            e.target.disabled = true; e.target.textContent = 'Working…';
            let r;
            try { r = await N.chiama(window, 'rilasciaCosmetico', { id }); } catch (err) { r = { ok: false, motivo: 'error' }; }
            togli();
            msg(r.ok ? `${nome} is free again for everyone.` : N.frase(r.motivo), !r.ok);
            await leggi(); disegna(true);
        });
    }

    /** Indossare uno di quelli che si hanno (gratis): si vede subito sulla pagina a destra */
    async function indossa(tipo, id, extra) {
        await operazione(() => N.cambia(window, { tipo, id, ...(extra || {}) }), async r => {
            msg(r.ok ? (id ? 'Done: you wear it now.' : 'Song removed.') : N.frase(r.motivo), !r.ok);
            await leggi(); mostraSaldo(); aggiornaAnteprima();
        });
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
            + N.shinyTeamHtml({ pokemon: t.pokemon.map(p => ({ nome: p.nome, shiny: !!p.shiny, comprato: !!S.shinyPkm[`${t.id}_${C.idSpecie(p.nome)}`], normale: gif(p.nome, false), brillante: gif(p.nome, true) })), saldo: S.saldo, occupato: S.occupato })
            + `<p class="ng-nota">You will see it in your <a href="box.html">Box</a>, in battle, in the rankings and on your page.</p></section>`;
    }

    // ---------------------------------------------------------------- Coins
    const htmlMonete = () => `<section class="ng-gruppo"><h3>Earning coins</h3><p>${esc(N.notaPremi())}</p></section>${N.guidaHtml()}${N.movimentiHtml(S.movimenti)}`;

    // ---------------------------------------------------------------- disegno
    function disegna(tieniScorrimento) {
        const el = $('shop-contenuto');
        const y = window.scrollY;
        const interni = [...el.querySelectorAll('.shop-avatar-griglia, .shop-colori, .shop-canzoni')].map(x => x.scrollTop);
        el.innerHTML = conMoneta(S.tab === 'pagina' ? htmlPagina() : S.tab === 'allenatore' ? htmlAllenatore() : S.tab === 'pokemon' ? htmlPokemon() : htmlMonete());
        $('shop-corpo').classList.toggle('senza-anteprima', !TAB_CON_ANTEPRIMA.includes(S.tab));
        adattaAnteprima();
        document.querySelectorAll('.shop-scheda').forEach(b => { const su = b.dataset.tab === S.tab; b.classList.toggle('attiva', su); b.setAttribute('aria-selected', String(su)); });
        const r = $('shop-ricerca');
        if (r && document.activeElement === document.body && S.ricerca) { /* la ricerca si riscrive da sola: non si ruba il fuoco */ }
        el.querySelectorAll('.shop-avatar-griglia, .shop-colori, .shop-canzoni').forEach((x, i) => { if (interni[i]) x.scrollTop = interni[i]; });
        if (tieniScorrimento) window.scrollTo(0, y);
    }
    function vai(tab) {
        S.tab = ['pagina', 'allenatore', 'pokemon', 'monete'].includes(tab) ? tab : 'pagina';
        S.armato = null; S.scelta = null; S.prova = {}; S.provando = ''; msg('');
        aggiornaAnteprima();
        if (ascolto) { ascolto.pause(); ascolto = null; }
        try { const u = new URL(window.location.href); u.searchParams.set('tab', S.tab); window.history.replaceState(null, '', u.toString()); } catch (e) { /* niente */ }
        if (S.tab === 'allenatore') caricaTutti();
        disegna();
    }

    async function operazione(fn, ok) {
        if (S.occupato) return;
        S.occupato = true; msg(''); disegna(true);
        try { const r = await fn(); await ok(r); } catch (e) { msg("Couldn't do that. Try again in a moment.", true); }
        S.occupato = false; disegna(true);
    }

    // ---------------------------------------------------------------- i tocchi
    $('shop-contenuto').addEventListener('click', async e => {
        const b = e.target.closest ? e.target.closest('[data-ng]') : null;
        if (!b || b.disabled) { if (S.armato) { S.armato = null; disegna(true); } return; }
        const ng = b.dataset.ng;
        if (ng === 'prova') return provaVoce(b.dataset.id);
        if (ng === 'compra') return chiediCatalogo(C.perId(b.dataset.id));
        if (ng === 'equipa') {
            return operazione(() => N.chiama(window, 'equipaCosmetico', { id: b.dataset.id, attivo: b.dataset.attivo !== '0' }), async r => {
                msg(r.ok ? 'Done.' : N.frase(r.motivo), !r.ok);
                await leggi(); mostraSaldo(); aggiornaAnteprima();
            });
        }
        const dati = () => ({ tipo: b.dataset.tipo, id: b.dataset.id, nome: b.dataset.nome, immagine: b.dataset.img, colore: b.dataset.c, extra: b.dataset.url ? { url: b.dataset.url, nome: b.dataset.nome } : null });
        if (ng === 'prendi') { if (ascolto) { ascolto.pause(); ascolto = null; } return dati().tipo === 'canzone' ? chiediAcquisto(dati()) : scegli(dati()); }
        if (ng === 'compra-scelta') return S.scelta && chiediAcquisto(S.scelta);
        if (ng === 'annulla-scelta') return azzeraProva();
        if (ng === 'rilascia') return chiediRilascio(dati());
        if (ng === 'indossa') { const d = dati(); return indossa(d.tipo, d.id, d.extra); }
        if (ng === 'canzone-nessuna') return indossa('canzone', '', null);
        if (ng === 'ascolta') {
            const gia = ascolto && ascolto.src === b.dataset.url;
            if (ascolto) { ascolto.pause(); ascolto = null; }
            if (gia) return;
            ascolto = new Audio(b.dataset.url); ascolto.volume = 0.4; ascolto.play().catch(() => {});
            return;
        }
        if (ng === 'squadra') { S.squadra = b.dataset.id; S.armato = null; return disegna(true); }
        if (ng === 'shiny') return chiediShiny(Number(b.dataset.i));
        if (ng === 'shiny-on' || ng === 'shiny-off') return cambiaShiny(Number(b.dataset.i), ng === 'shiny-on');
    });
    $('shop-contenuto').addEventListener('input', e => { if (e.target.id === 'shop-ricerca') { S.ricerca = e.target.value; const pos = e.target.selectionStart; disegna(true); const r = $('shop-ricerca'); if (r) { r.focus(); r.setSelectionRange(pos, pos); } } });
    $('shop-schede').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) vai(b.dataset.tab); });
    $('shop-reset').addEventListener('click', azzeraProva);
    // l'anteprima si può ingrandire (la colonna della pagina diventa più larga)
    $('shop-ingrandisci').addEventListener('click', () => {
        const grande = $('shop-corpo').classList.toggle('grande');
        $('shop-ingrandisci').textContent = grande ? 'Smaller' : 'Bigger';
        $('shop-ingrandisci').setAttribute('aria-pressed', String(grande));
        adattaAnteprima();
    });

    // ---------------------------------------------------------------- avvio
    function avvia(utente) {
        const accedi = $('shop-accedi'), corpo = $('shop-corpo'), schede = $('shop-schede');
        const loader = $('poke-loader');
        const finito = () => { if (loader) loader.style.display = 'none'; };
        if (!utente) { accedi.hidden = false; corpo.hidden = true; schede.hidden = true; $('shop-saldo').innerHTML = conMoneta('🪙 –'); finito(); return; }
        accedi.hidden = true; schede.hidden = false;
        S.uid = utente.uid;
        if (!document.getElementById('ng-stile')) { const st = document.createElement('style'); st.id = 'ng-stile'; st.textContent = N.STILE; document.head.appendChild(st); }
        leggi().then(() => {
            mostraSaldo();
            corpo.hidden = false;
            const modifica = $('shop-edit-card');
            modifica.href = `public.html?player=${encodeURIComponent(S.giocatore)}&edit=1`; modifica.hidden = false;
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
