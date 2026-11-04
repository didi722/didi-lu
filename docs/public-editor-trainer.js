// =====================================================
// PUBLIC EDITOR · scheda "Trainer"
//
// Le scelte che prima stavano in profile.html, ora dentro l'editor della pagina pubblica: avatar,
// colore firma, titolo, motto, Pokémon preferito e canzone. Si vedono subito sulla carta e si salvano
// con SAVE (players/{id}/info, insieme alla configurazione della pagina).
//
// Colore, avatar, Pokémon preferito e canzone sono unici: quelli che un altro allenatore ha già
// scelto restano nella lista ma in grigio e non si possono scegliere (P.scelteDegliAltri); quello che si ha
// già resta sempre selezionabile. Al salvataggio la regola si ricontrolla sui dati di adesso (public-editor.js).
//
// Avatar, colore e canzone non si comprano, si CAMBIANO (cosmetici.js; il server fa il cambio e scrive il profilo, fuori da SAVE e da "undo"): ogni cambio costa, tranne il primo per chi ha ancora
// quello di partenza. Il primo avatar, il primo colore e la prima canzone sono "di casa" (la stella): l'unica cosa personale, tua per sempre, e tornarci non costa mai; quello che porti è
// riservato finché lo porti e cambiando di nuovo torna libero per tutti. Quello che ha riservato un altro (cosmeticiPresi, lo scrive il server) resta grigio anche se lui non lo porta.
// Un tocco apre una conferma che dice quanto costa e che fine fa quello di adesso.
// =====================================================
(function () {
    'use strict';

    const P = window.PaginaPubblica;

    // La playlist del sito: un foglio Google pubblicato come CSV (nome, url)
    const URL_PLAYLIST = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSRBD7fZsWUtQ-UqcSaG-2lzeQnbxUdCUlTc8D6b4dCmSLq4-sDpIJGVzKmwwZF0p1uF-Ln3--4jpGk/pub?gid=775181727&single=true&output=csv';
    const MAX_RIGHE = 150;           // le righe mostrate in una lista; per il resto si scrive nella ricerca

    let pokemon = null;              // [{ name, id }], 'errore' o null (non ancora caricato)
    let canzoni = null;              // [{ nome, url }], 'errore' o null
    let ricerca = { pokemon: '', canzoni: '' };
    let boxAperto = false;           // "From my Box" aperto o chiuso (resta così se il pannello si ridisegna)
    let teamAperto = null;           // l'id del team aperto, uno solo alla volta
    let anteprima = null;            // l'audio dell'anteprima di una canzone

    // ---- Dati che vengono da fuori ------------------------------------------------------------

    function caricaPokemon(ridisegna) {
        if (pokemon) return;
        pokemon = 'carico';
        fetch('https://pokeapi.co/api/v2/pokemon?limit=1025')
            .then(r => r.json())
            .then(j => { pokemon = j.results.map(p => ({ name: p.name, id: Number(String(p.url).split('/').filter(Boolean).pop()) })); })
            .catch(() => { pokemon = 'errore'; })
            .finally(ridisegna);
    }

    function caricaCanzoni(ridisegna) {
        if (canzoni) return;
        canzoni = 'carico';
        fetch(`${URL_PLAYLIST}&t=${Date.now()}`)
            .then(r => r.text())
            .then(t => { canzoni = P.leggiCsvCanzoni(t); })
            .catch(() => { canzoni = 'errore'; })
            .finally(ridisegna);
    }

    function fermaAnteprima() {
        if (anteprima) { anteprima.pause(); anteprima = null; }
    }

    // Una voce già scelta da un altro allenatore: grigia, non si clicca
    const PRESA = 'Already taken by another trainer';
    function comePresa(bottone, titolo, motivo) {
        bottone.disabled = true;
        bottone.classList.add('is-preso');
        bottone.title = titolo ? `${titolo} · ${motivo || PRESA}` : (motivo || PRESA);
        bottone.setAttribute('aria-label', bottone.title);
        return bottone;
    }

    // Il cambio di un avatar, di un colore o di una canzone: una finestrella di conferma sopra al pannello. Dice quanto costa e che fine fa quello che porti adesso (negozio.js, frasiCambio).
    // `nome`: come si chiama quello nuovo; `immagine`: l'avatar; `colore`: il colore; `extra`: per una canzone l'indirizzo e il nome da mandare al server; `id` vuoto = togliere la canzone.
    async function chiediCambio(ctx, { tipo, id, nome, immagine, colore, extra }) {
        const { h, cosmetici, avvisa } = ctx;
        try { await cosmetici.negozio(); } catch (e) { avvisa("The shop didn't load: check your connection and try again.", true); return; }
        const p = id ? cosmetici.prezzo(tipo, id) : { prezzo: 0, gratis: false };
        const corrente = cosmetici.corrente(tipo);
        const nomeCorrente = !corrente ? '' : tipo === 'avatar' ? `Avatar ${corrente.replace('avatar-', '')}` : tipo === 'colore' ? `Colour ${window.Cosmetici.coloreDaId(corrente)}` : '';
        const f = window.Negozio.frasiCambio({ tipo, id, prezzo: p.prezzo, gratis: p.gratis, ritorno: p.ritorno, saldo: cosmetici.saldo(), corrente, casa: cosmetici.casa(tipo), nomeCorrente });
        const chiudi = () => { velo.remove(); document.removeEventListener('keydown', tasto); };
        const tasto = e => { if (e.key === 'Escape') chiudi(); };
        const conferma = h('button', { type: 'button', class: 'pe-bottone pe-primario', testo: f.conferma, onclick: async () => {
            conferma.disabled = true;
            conferma.textContent = 'Changing…';
            let r;
            try { r = await cosmetici.cambia(tipo, id, extra); } catch (e) { r = { ok: false, motivo: 'error' }; }
            chiudi();
            if (r.ok) avvisa(!id ? 'Song removed.' : r.gratis ? `${nome} is yours for good!` : r.ritorno ? `Welcome back to ${nome}!${r.liberato ? ' The other one is free again.' : ''}` : `${nome} it is!${r.liberato ? ' The old one is free again.' : ''}`);
            else avvisa(cosmetici.frase(r.motivo), true);
        } });
        if (!f.ok || !cosmetici.pronto()) conferma.disabled = true;
        const velo = h('div', { class: 'pe-conferma-velo', onclick: e => { if (e.target === velo) chiudi(); } },
            h('div', { class: 'pe-conferma', role: 'dialog', 'aria-modal': 'true', 'aria-label': id ? `Change to ${nome}` : 'Remove the song' },
                immagine ? h('img', { src: immagine, alt: '' }) : colore ? h('span', { class: 'pe-conferma-colore', stile: { '--c': colore } }) : null,
                h('b', { testo: nome }),
                ...(cosmetici.pronto() ? f.righe.map(riga => h('p', { class: 'pe-nota', testo: riga })) : [h('p', { class: 'pe-nota', testo: 'Loading your coins…' })]),
                h('div', { class: 'pe-conferma-azioni' }, h('button', { type: 'button', class: 'pe-bottone', onclick: chiudi, testo: 'Cancel' }), conferma)));
        document.addEventListener('keydown', tasto);
        document.body.append(velo);
    }

    // ---- Disegno ------------------------------------------------------------------------------

    function disegna(ctx) {
        const { C, h, sezione, campione, cambiaProfilo, ridisegna, cosmetici } = ctx;
        const dati = C.stato.dati;
        const profilo = C.profilo();
        const presi = P.scelteDegliAltri(dati.chiave, dati.tutti);
        caricaPokemon(ridisegna);
        caricaCanzoni(ridisegna);

        // il valore scelto in questo momento, per segnare la voce giusta senza ridisegnare tutto
        const scegli = (nuovi, opzioni) => { cambiaProfilo(nuovi, { senzaPannello: true, ...opzioni }); segna(); };

        // ---- avatar
        const avatarAttuale = P.chiaveAvatar(profilo.avatar);
        const tuttiAvatar = P.elencoAvatar();
        const idAv = f => `avatar-${f.replace('.png', '')}`;
        const casaAv = cosmetici.casa('avatar');
        // grigio se lo porta un altro adesso, o se l'ha riservato un altro (il suo "di casa", o quello che porta); quello che porti tu resta sempre scegliabile
        const preso = f => `profile/${f}`.toLowerCase() !== avatarAttuale && presi.avatar.has(`profile/${f}`.toLowerCase());
        const doAltri = f => cosmetici.presoDa(idAv(f));
        const avatarLiberi = tuttiAvatar.filter(f => !preso(f) && !doAltri(f));
        const prezzoAv = cosmetici.prezzo('avatar');
        const griglia = h('div', { class: 'pe-avatar-griglia', id: 'pe-avatar-griglia' }, tuttiAvatar.map(f => {
            const n = f.replace('.png', ''), id = idAv(f), casaMia = id === casaAv;
            const chiave = `profile/${f}`.toLowerCase(), portato = chiave === avatarAttuale;
            const b = h('button', { type: 'button', class: `pe-avatar-item${portato ? ' is-on' : ''}${casaMia ? ' is-casa' : ''}`, 'data-v': chiave,
                title: casaMia ? `Avatar ${n} · your first avatar, yours for good · coming back is free` : `Avatar ${n}${portato ? '' : prezzoAv.gratis ? ' · free (your first one)' : ` · change for ${prezzoAv.prezzo} 🪙`}`,
                onclick: () => { if (!portato) chiediCambio(ctx, { tipo: 'avatar', id, nome: `Avatar ${n}`, immagine: `immagini/profile/${f}` }); } },
            h('img', { src: `immagini/profile/${f}`, alt: '', loading: 'lazy' }));
            if (preso(f)) return comePresa(b, `Avatar ${n}`);
            return doAltri(f) ? comePresa(b, `Avatar ${n}`, `Owned by ${cosmetici.nomeDi(doAltri(f))}`) : b;
        }));
        const notaAvatar = prezzoAv.gratis ? 'Your first avatar is free and stays yours for good (coming back to it is always free). Every avatar belongs to one trainer only.'
            : `Changing your avatar costs ${prezzoAv.prezzo} 🪙 and happens right away. Your first avatar (★) is the only personal one: yours for good, and coming back to it is free. The one you wear is yours while you wear it, then it goes back to the pool. You have ${cosmetici.saldo()} 🪙.`;

        // ---- colore firma: tutti; si cambia dal server (costa, tranne il primo e il ritorno al primo); quelli riservati o portati da altri sono grigi
        const attuale = String(profilo.color || '').toUpperCase();
        const colori = P.PALETTE_FIRMA.slice();
        if (attuale && !colori.some(c => c.toUpperCase() === attuale)) colori.unshift(attuale);
        const casaCo = cosmetici.casa('colore');
        const prezzoCo = cosmetici.prezzo('colore');
        const swatch = h('div', { class: 'pe-campioni pe-campioni-fitti', id: 'pe-colori' }, colori.map(c => {
            const C0 = c.toUpperCase(), id = window.Cosmetici.idColore(C0), portato = C0 === attuale, casaMio = !!id && id === casaCo;
            const doAltriCo = id ? cosmetici.presoDa(id) : '';
            const titolo = casaMio ? `${C0} · your first colour, yours for good · coming back is free` : portato ? C0 : `${C0} · ${prezzoCo.gratis ? 'free (your first one)' : `change for ${prezzoCo.prezzo} 🪙`}`;
            const b = campione(c, portato, titolo, () => { if (!portato && id) chiediCambio(ctx, { tipo: 'colore', id, nome: `Colour ${C0}`, colore: C0 }); }, null);
            if (casaMio) b.classList.add('is-casa');
            if (!portato && presi.colori.has(C0)) return comePresa(b, C0);
            return doAltriCo ? comePresa(b, C0, `Owned by ${cosmetici.nomeDi(doAltriCo)}`) : b;
        }));
        for (const b of swatch.children) b.dataset.v = b.title.split(' · ')[0];
        const notaColore = prezzoCo.gratis ? 'Your first colour is free and stays yours for good (coming back to it is always free). Every colour belongs to one trainer only.'
            : `Changing your colour costs ${prezzoCo.prezzo} 🪙 and happens right away. Your first colour (★) is the only personal one: yours for good, and coming back to it is free. The one you wear is yours while you wear it, then it goes back to the pool. You have ${cosmetici.saldo()} 🪙.`;

        // ---- titolo: quelli sbloccati
        const titoli = ['No Title', ...Titoli.titoliSbloccati(dati.tipi, dati.pokemon).map(t => t.testo)];
        const titoloAttuale = profilo.title || 'No Title';
        if (!titoli.includes(titoloAttuale)) titoli.push(titoloAttuale);
        const selettore = h('select', { class: 'pe-select', id: 'pe-titolo', 'aria-label': 'Trainer title',
            onchange: e => scegli({ title: e.target.value === 'No Title' ? '' : e.target.value }) },
        titoli.map(t => h('option', { value: t, testo: t, selected: t === titoloAttuale })));

        // ---- motto
        const conto = h('span', { class: 'pe-conto', testo: `${profilo.bio.length}/${P.BIO_MAX}` });
        const motto = h('textarea', { class: 'pe-testo', id: 'pe-motto', maxlength: P.BIO_MAX, rows: 3, placeholder: 'Write your trainer motto here…', 'aria-label': 'Motto',
            oninput: e => { conto.textContent = `${e.target.value.length}/${P.BIO_MAX}`; scegli({ bio: e.target.value }, { chiave: 'bio' }); } });
        motto.value = profilo.bio;

        return [
            h('p', { class: 'pe-nota', testo: 'Everything you pick here shows on your card straight away and is saved with SAVE, except the avatar, the colour and the song: they cost coins and change right away. Colours, avatars, Pokémon and songs that another trainer already has are greyed out: they cannot be picked.' }),
            sezione('Avatar',
                h('div', { class: 'pe-avatar-riga' },
                    h('span', { class: 'pe-avatar-grande' }, h('img', { id: 'pe-avatar-attuale', src: profilo.avatar || 'immagini/profile/1.png', alt: 'Current avatar' })),
                    h('span', { class: 'pe-nota', testo: `${avatarLiberi.length} of ${tuttiAvatar.length} avatars available` })),
                h('p', { class: 'pe-nota', testo: notaAvatar }),
                griglia),
            sezione('Signature colour', swatch,
                h('p', { class: 'pe-nota', testo: 'It colours your name, stats and trophy. Greyed out colours belong to other trainers.' }),
                h('p', { class: 'pe-nota', testo: notaColore })),
            sezione('Title', selettore, h('p', { class: 'pe-nota', testo: 'Only the titles you have earned.' })),
            sezione('Motto', motto, conto),
            sezionePokemon(ctx, presi, scegli),
            sezioneCanzone(ctx, presi)
        ];

        // l'attenzione alla voce scelta: si cambia la classe, non si ridisegna (la lista non torna in cima)
        function segna() {
            const p = C.profilo();
            const chiaveAv = P.chiaveAvatar(p.avatar);
            document.querySelectorAll('#pe-avatar-griglia .pe-avatar-item').forEach(b => b.classList.toggle('is-on', b.dataset.v === chiaveAv));
            const grande = document.getElementById('pe-avatar-attuale');
            if (grande && p.avatar) grande.src = p.avatar;
            const col = String(p.color || '').toUpperCase();
            document.querySelectorAll('#pe-colori .pe-campione').forEach(b => { const on = b.dataset.v === col; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
            document.querySelectorAll('#pe-lista-pokemon .pe-scelta').forEach(b => b.classList.toggle('is-on', !p.pkmBox && b.dataset.v === String(p.pkmPreferito || '').toLowerCase()));
            document.querySelectorAll('#pe-box-pokemon .pe-scelta').forEach(b => b.classList.toggle('is-on', b.dataset.box === String(p.pkmBox || '')));
            document.querySelectorAll('#pe-lista-canzoni .pe-scelta').forEach(b => b.classList.toggle('is-on', b.dataset.v === p.musicaPreferita));
            const nomePkm = document.getElementById('pe-pokemon-attuale');
            if (nomePkm) nomePkm.textContent = p.pkmPreferito ? p.pkmPreferito.toUpperCase() : 'None';
            const nomeCanzone = document.getElementById('pe-canzone-attuale');
            if (nomeCanzone) nomeCanzone.textContent = p.musicName || (p.musicaPreferita ? 'Favourite song' : 'None');
        }
    }

    // ---- Pokémon preferito --------------------------------------------------------------------

    function sezionePokemon(ctx, presi, scegli) {
        const { C, h, sezione } = ctx;
        const profilo = C.profilo();
        const lista = h('div', { class: 'pe-scorri', id: 'pe-lista-pokemon' });

        const riempi = () => {
            lista.replaceChildren();
            if (pokemon === 'errore') { lista.append(h('p', { class: 'pe-nota', testo: 'Could not load the Pokémon list. Check your connection and reopen this tab.' })); return; }
            if (!pokemon || pokemon === 'carico') { lista.append(h('p', { class: 'pe-nota', testo: 'Loading the Pokémon list…' })); return; }
            const q = ricerca.pokemon.trim().toLowerCase();
            const mio = String(profilo.pkmPreferito || '').toLowerCase();
            const trovati = pokemon.filter(p => !q || p.name.includes(q));
            lista.append(...trovati.slice(0, MAX_RIGHE).map(p => {
                const b = h('button', { type: 'button', class: `pe-scelta${p.name === mio ? ' is-on' : ''}`, 'data-v': p.name, onclick: () => scegli({ pkmPreferito: p.name, pkmBox: '' }) },
                    h('img', { src: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`, alt: '', loading: 'lazy' }),
                    h('span', { testo: p.name.toUpperCase() }));
                return p.name !== mio && presi.pokemon.has(p.name) ? comePresa(b, p.name.toUpperCase()) : b;
            }));
            if (trovati.length > MAX_RIGHE) lista.append(h('p', { class: 'pe-nota', testo: `${trovati.length - MAX_RIGHE} more: type in the search box to narrow it down.` }));
            if (!trovati.length) lista.append(h('p', { class: 'pe-nota', testo: 'No Pokémon found.' }));
        };
        riempi();

        const cerca = h('input', { type: 'search', class: 'pe-ricerca', placeholder: 'Search a Pokémon…', 'aria-label': 'Search a Pokémon', value: ricerca.pokemon,
            oninput: e => { ricerca.pokemon = e.target.value; riempi(); } });

        return sezione('Favourite Pokémon',
            h('div', { class: 'pe-attuale' }, h('span', { testo: 'Now: ' }), h('b', { id: 'pe-pokemon-attuale', testo: profilo.pkmPreferito ? profilo.pkmPreferito.toUpperCase() : 'None' }),
                h('button', { type: 'button', class: 'pe-bottone pe-piccolo', onclick: () => scegli({ pkmPreferito: '', pkmBox: '' }), testo: 'None' })),
            boxMio(ctx, presi, scegli),
            h('p', { class: 'pe-nota', testo: 'Or pick any Pokémon from the list:' }),
            cerca, lista);
    }

    /**
     * I Pokémon dei propri team: scegliendone uno il compagno è proprio lui e sulla scena si vedono i suoi badge.
     * A fisarmonica: "From my Box" si apre sull'elenco dei team, e un team alla volta mostra i suoi Pokémon (aprirne un altro chiude il primo).
     */
    function boxMio(ctx, presi, scegli) {
        const { C, h } = ctx;
        const nomeDi = p => String((p && (p.nome || p.name)) || '');
        const chiaveSpecie = n => n.toLowerCase().replace(/ /g, '-').replace(/[.'é]/g, '');
        const mio = String(C.profilo().pkmBox || '');
        const squadre = (C.stato.dati.teams || []).filter(t => t && typeof t === 'object' && t.id);

        const gruppi = squadre.map(t => {
            const lista = Array.isArray(t.pokemon) ? t.pokemon : Object.values(t.pokemon || {});
            const voci = lista.map((p, i) => ({ nome: nomeDi(p), i })).filter(v => v.nome).map(v => {
                const valore = `${t.id}|${v.i}`;
                const specie = chiaveSpecie(v.nome);
                const img = h('img', { alt: '', loading: 'lazy' });
                img.src = `https://play.pokemonshowdown.com/sprites/gen5/${specie.replace(/-/g, '')}.png`;
                img.onerror = () => { img.onerror = null; img.removeAttribute('src'); };
                const b = h('button', { type: 'button', class: `pe-scelta${valore === mio ? ' is-on' : ''}`, 'data-box': valore,
                    onclick: () => scegli({ pkmPreferito: specie, pkmBox: valore }) },
                    img, h('span', { testo: v.nome.toUpperCase() }));
                return valore !== mio && presi.pokemon.has(specie) ? comePresa(b, v.nome.toUpperCase()) : b;
            });
            if (!voci.length) return null;
            const corpo = h('div', { class: 'pe-scorri pe-acc-corpo', hidden: true }, voci);
            const testa = h('button', { type: 'button', class: 'pe-acc-testa pe-acc-team', 'aria-expanded': 'false', 'data-team': t.id },
                h('span', { testo: String(t.nome || t.name || 'My team') }), h('span', { class: 'pe-acc-freccia', testo: '▸' }));
            return { id: t.id, testa, corpo, riga: h('div', { class: 'pe-acc-voce' }, testa, corpo) };
        }).filter(Boolean);

        if (!gruppi.length) return h('p', { class: 'pe-nota', testo: 'You have no team in your Box yet: build one to pick a companion from it, with its badges.' });

        const imposta = (el, corpo, aperto) => {
            el.setAttribute('aria-expanded', String(aperto));
            el.querySelector('.pe-acc-freccia').textContent = aperto ? '▾' : '▸';
            corpo.hidden = !aperto;
        };
        const elencoTeam = h('div', { class: 'pe-acc-corpo', hidden: !boxAperto }, gruppi.map(g => g.riga));
        const testaBox = h('button', { type: 'button', class: 'pe-acc-testa', id: 'pe-box-testa', 'aria-expanded': String(boxAperto) },
            h('span', { testo: "From my Box (shows that Pokémon's badges)" }), h('span', { class: 'pe-acc-freccia', testo: boxAperto ? '▾' : '▸' }));
        testaBox.onclick = () => { boxAperto = !boxAperto; imposta(testaBox, elencoTeam, boxAperto); };

        // un solo team aperto alla volta: aprirne uno chiude gli altri; ricliccare quello aperto lo chiude
        gruppi.forEach(g => {
            const aperto = teamAperto === g.id;
            imposta(g.testa, g.corpo, aperto);
            g.testa.onclick = () => {
                teamAperto = teamAperto === g.id ? null : g.id;
                gruppi.forEach(x => imposta(x.testa, x.corpo, x.id === teamAperto));
            };
        });
        return h('div', { id: 'pe-box-pokemon', class: 'pe-acc' }, testaBox, elencoTeam);
    }

    // ---- Canzone ------------------------------------------------------------------------------

    function sezioneCanzone(ctx, presi) {
        const { C, h, sezione, cosmetici } = ctx;
        const profilo = C.profilo();
        const lista = h('div', { class: 'pe-scorri', id: 'pe-lista-canzoni' });
        const idDi = c => (window.Cosmetici ? window.Cosmetici.idCanzone(c.url) : '');
        const casaCa = cosmetici.casa('canzone');
        const prezzoC = cosmetici.prezzo('canzone');

        const riempi = () => {
            lista.replaceChildren();
            if (canzoni === 'errore') { lista.append(h('p', { class: 'pe-nota', testo: 'Could not load the playlist. Check your connection and reopen this tab.' })); return; }
            if (!canzoni || canzoni === 'carico') { lista.append(h('p', { class: 'pe-nota', testo: 'Loading the playlist…' })); return; }
            const q = ricerca.canzoni.trim().toLowerCase();
            const mio = profilo.musicaPreferita;
            const prese = c => c.url !== mio && (presi.canzoniUrl.has(c.url.trim()) || presi.canzoniNomi.has(c.nome.trim().toLowerCase()));
            // una canzone riservata da un altro (la sua "di casa", o quella che porta) è sua
            const doAltri = c => cosmetici.presoDa(idDi(c));
            const libere = canzoni.filter(c => !q || c.nome.toLowerCase().includes(q));
            lista.append(...libere.map(c => {
                const id = idDi(c), casaMia = !!id && id === casaCa, portata = c.url === mio;
                const scelta = h('button', { type: 'button', class: `pe-scelta${portata ? ' is-on' : ''}${casaMia ? ' is-casa' : ''}`, 'data-v': c.url,
                    title: casaMia ? `${c.nome} · your first song, yours for good · coming back is free` : portata ? null : `${c.nome} · ${prezzoC.gratis ? 'free (your first one)' : `change for ${prezzoC.prezzo} 🪙`}`,
                    onclick: () => {
                        fermaAnteprima();
                        if (!portata) chiediCambio(ctx, { tipo: 'canzone', id, nome: c.nome, extra: { url: c.url, nome: c.nome } });
                    } },
                h('span', { testo: casaMia ? `★ ${c.nome}` : c.nome }),
                portata ? null : h('small', { class: 'pe-prezzo', testo: prezzoC.gratis || casaMia ? 'free' : `${prezzoC.prezzo} 🪙` }));
                return h('div', { class: 'pe-canzone' },
                    prese(c) ? comePresa(scelta, c.nome) : doAltri(c) ? comePresa(scelta, c.nome, `Owned by ${cosmetici.nomeDi(doAltri(c))}`) : scelta,
                    h('button', { type: 'button', class: 'pe-icona', title: 'Listen', 'aria-label': `Listen to ${c.nome}`, onclick: ev => {
                        ev.stopPropagation();
                        const gia = anteprima && anteprima.src === c.url;
                        fermaAnteprima();
                        if (gia) return;
                        anteprima = new Audio(c.url);
                        anteprima.volume = 0.4;
                        anteprima.play().catch(() => {});
                    }, testo: '▶' }));
            }));
            if (!libere.length) lista.append(h('p', { class: 'pe-nota', testo: 'No songs found.' }));
        };
        riempi();

        const cerca = h('input', { type: 'search', class: 'pe-ricerca', placeholder: 'Search a song…', 'aria-label': 'Search a song', value: ricerca.canzoni,
            oninput: e => { ricerca.canzoni = e.target.value; riempi(); } });

        return sezione('Favourite song',
            h('div', { class: 'pe-attuale' }, h('span', { testo: 'Now: ' }), h('b', { id: 'pe-canzone-attuale', testo: profilo.musicName || (profilo.musicaPreferita ? 'Favourite song' : 'None') }),
                h('button', { type: 'button', class: 'pe-bottone pe-piccolo', disabled: !profilo.musicaPreferita, title: 'Play no song (free)',
                    onclick: () => { fermaAnteprima(); chiediCambio(ctx, { tipo: 'canzone', id: '', nome: 'No song', extra: {} }); }, testo: 'None' })),
            cerca, lista,
            h('p', { class: 'pe-nota', testo: prezzoC.gratis ? 'Your first song is free and stays yours for good (coming back to it is always free). Every song belongs to one trainer only. Tap ▶ to listen before you choose.'
                : `Changing your song costs ${prezzoC.prezzo} 🪙 and happens right away; "None" is free. Your first song (★) is the only personal one: yours for good, and coming back to it is free. The one you play is yours while you play it, then it goes back to the pool. Tap ▶ to listen first. You have ${cosmetici.saldo()} 🪙.` }),
            h('p', { class: 'pe-nota', testo: 'The song plays from the Music block of your card. If you turn that block off, no music plays.' }));
    }

    // esci: l'editor si chiude o si cambia scheda (l'anteprima di una canzone non deve continuare a suonare)
    window.PublicEditor.estendi({ id: 'trainer', nome: 'Trainer', disegna, esci: fermaAnteprima });
})();
