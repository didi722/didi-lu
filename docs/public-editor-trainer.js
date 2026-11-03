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
// Avatar e canzoni nuovi si sbloccano a pagamento (cosmetici.js, il server li vende): quelli che non si hanno mostrano un lucchetto e il tasto apre una conferma;
// una volta sbloccati restano tuoi e si cambia quando si vuole. Il primo avatar e la prima canzone sono gratis per chi ha ancora quelli di partenza.
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
    function comePresa(bottone, titolo) {
        bottone.disabled = true;
        bottone.classList.add('is-preso');
        bottone.title = titolo ? `${titolo} · ${PRESA}` : PRESA;
        bottone.setAttribute('aria-label', bottone.title);
        return bottone;
    }

    // Lo sblocco di un avatar o di una canzone: una finestrella di conferma sopra al pannello. `dopo` parte a sblocco riuscito (di solito sceglie la voce appena sbloccata).
    function chiediSblocco(ctx, { id, nome, tipo, immagine, dopo }) {
        const { h, cosmetici, avvisa } = ctx;
        const p = cosmetici.prezzo(id);
        const saldo = cosmetici.saldo();
        const chiudi = () => { velo.remove(); document.removeEventListener('keydown', tasto); };
        const tasto = e => { if (e.key === 'Escape') chiudi(); };
        const conferma = h('button', { type: 'button', class: 'pe-bottone pe-primario', testo: p.gratis ? 'Unlock for free' : `Unlock · ${p.prezzo} 🪙`, onclick: async () => {
            conferma.disabled = true;
            conferma.textContent = 'Unlocking…';
            let r;
            try { r = await cosmetici.compra(id, nome); } catch (e) { r = { ok: false, motivo: 'error' }; }
            chiudi();
            if (r.ok) { avvisa(r.gratis ? `${nome} unlocked for free!` : `${nome} unlocked.`); dopo(); } else avvisa(cosmetici.frase(r.motivo), true);
        } });
        if (!p.gratis && (!cosmetici.pronto() || saldo < p.prezzo)) conferma.disabled = true;
        const velo = h('div', { class: 'pe-sblocco-velo', onclick: e => { if (e.target === velo) chiudi(); } },
            h('div', { class: 'pe-sblocco', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Unlock ${nome}` },
                immagine ? h('img', { src: immagine, alt: '' }) : null,
                h('b', { testo: nome }),
                h('p', { class: 'pe-nota', testo: !cosmetici.pronto() ? 'Loading your coins…'
                    : p.gratis ? `Your first ${tipo} is free: you still have the default one.`
                        : `Unlocking costs ${p.prezzo} 🪙 and you have ${saldo} 🪙. It stays yours: you can come back to it any time.${saldo < p.prezzo ? ' Play some sets to earn more coins.' : ''}` }),
                h('div', { class: 'pe-sblocco-azioni' }, h('button', { type: 'button', class: 'pe-bottone', onclick: chiudi, testo: 'Cancel' }), conferma)));
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
        const preso = f => `profile/${f}`.toLowerCase() !== avatarAttuale && presi.avatar.has(`profile/${f}`.toLowerCase());
        const avatarLiberi = tuttiAvatar.filter(f => !preso(f));
        const idAv = f => `avatar-${f.replace('.png', '')}`;
        const bloccato = id => !!window.Cosmetici && !cosmetici.possiede(id);
        const prezzoAv = cosmetici.prezzo('avatar-1');
        const griglia = h('div', { class: 'pe-avatar-griglia', id: 'pe-avatar-griglia' }, tuttiAvatar.map(f => {
            const n = f.replace('.png', ''), id = idAv(f), chiuso = bloccato(id);
            const url = new URL(`immagini/profile/${f}`, window.location.href).href;
            const b = h('button', { type: 'button', class: `pe-avatar-item${`profile/${f}`.toLowerCase() === avatarAttuale ? ' is-on' : ''}${chiuso ? ' pe-bloccato' : ''}`, 'data-v': `profile/${f}`.toLowerCase(),
                title: chiuso ? `Avatar ${n} · locked: ${prezzoAv.gratis ? 'free (your first one)' : `${prezzoAv.prezzo} 🪙`}` : `Avatar ${n}`,
                onclick: () => (chiuso
                    ? chiediSblocco(ctx, { id, nome: `Avatar ${n}`, tipo: 'avatar', immagine: `immagini/profile/${f}`, dopo: () => { scegli({ avatar: url }); ridisegna(); } })
                    : scegli({ avatar: url })) },
            h('img', { src: `immagini/profile/${f}`, alt: '', loading: 'lazy' }));
            return preso(f) ? comePresa(b, `Avatar ${n}`) : b;
        }));
        const notaAvatar = prezzoAv.gratis ? 'Your first new avatar is free: you still have the default one.' : `A new avatar costs ${prezzoAv.prezzo} 🪙 and stays yours. You have ${cosmetici.saldo()} 🪙.`;

        // ---- colore firma: tutti, quelli di altri in grigio (il tuo di adesso resta sempre selezionabile)
        const attuale = String(profilo.color || '').toUpperCase();
        const colori = P.PALETTE_FIRMA.slice();
        if (attuale && !colori.some(c => c.toUpperCase() === attuale)) colori.unshift(attuale);
        const swatch = h('div', { class: 'pe-campioni pe-campioni-fitti', id: 'pe-colori' }, colori.map(c => {
            const b = campione(c, c.toUpperCase() === attuale, c.toUpperCase(), () => scegli({ color: c.toUpperCase() }), null);
            return c.toUpperCase() !== attuale && presi.colori.has(c.toUpperCase()) ? comePresa(b, c.toUpperCase()) : b;
        }));
        for (const b of swatch.children) b.dataset.v = b.title.split(' · ')[0];

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
            h('p', { class: 'pe-nota', testo: 'Everything you pick here shows on your card straight away and is saved with SAVE. Colours, avatars, Pokémon and songs that another trainer already has are greyed out: they cannot be picked.' }),
            sezione('Avatar',
                h('div', { class: 'pe-avatar-riga' },
                    h('span', { class: 'pe-avatar-grande' }, h('img', { id: 'pe-avatar-attuale', src: profilo.avatar || 'immagini/profile/1.png', alt: 'Current avatar' })),
                    h('span', { class: 'pe-nota', testo: `${avatarLiberi.length} of ${tuttiAvatar.length} avatars available` })),
                h('p', { class: 'pe-nota', testo: notaAvatar }),
                griglia),
            sezione('Signature colour', swatch,
                h('p', { class: 'pe-nota', testo: 'It colours your name, stats and trophy. Greyed out colours belong to other trainers; yours is always kept.' })),
            sezione('Title', selettore, h('p', { class: 'pe-nota', testo: 'Only the titles you have earned.' })),
            sezione('Motto', motto, conto),
            sezionePokemon(ctx, presi, scegli),
            sezioneCanzone(ctx, presi, scegli)
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

    function sezioneCanzone(ctx, presi, scegli) {
        const { C, h, sezione, cosmetici } = ctx;
        const profilo = C.profilo();
        const lista = h('div', { class: 'pe-scorri', id: 'pe-lista-canzoni' });

        const riempi = () => {
            lista.replaceChildren();
            if (canzoni === 'errore') { lista.append(h('p', { class: 'pe-nota', testo: 'Could not load the playlist. Check your connection and reopen this tab.' })); return; }
            if (!canzoni || canzoni === 'carico') { lista.append(h('p', { class: 'pe-nota', testo: 'Loading the playlist…' })); return; }
            const q = ricerca.canzoni.trim().toLowerCase();
            const mio = profilo.musicaPreferita;
            const prese = c => c.url !== mio && (presi.canzoniUrl.has(c.url.trim()) || presi.canzoniNomi.has(c.nome.trim().toLowerCase()));
            const libere = canzoni.filter(c => !q || c.nome.toLowerCase().includes(q));
            lista.append(...libere.map(c => {
                const id = window.Cosmetici ? window.Cosmetici.idCanzone(c.url) : '';
                const chiusa = !!id && !cosmetici.possiede(id);
                const prezzoC = chiusa ? cosmetici.prezzo(id) : null;
                const scelta = h('button', { type: 'button', class: `pe-scelta${c.url === mio ? ' is-on' : ''}${chiusa ? ' pe-bloccato' : ''}`, 'data-v': c.url,
                    title: chiusa ? `${c.nome} · locked: ${prezzoC.gratis ? 'free (your first one)' : `${prezzoC.prezzo} 🪙`}` : null,
                    onclick: () => {
                        fermaAnteprima();
                        if (!chiusa) { scegli({ musicName: c.nome, musicaPreferita: c.url }); return; }
                        chiediSblocco(ctx, { id, nome: c.nome, tipo: 'song', dopo: () => { scegli({ musicName: c.nome, musicaPreferita: c.url }); riempi(); } });
                    } },
                h('span', { testo: chiusa ? `🔒 ${c.nome}` : c.nome }),
                chiusa ? h('small', { class: 'pe-prezzo', testo: prezzoC.gratis ? 'free' : `${prezzoC.prezzo} 🪙` }) : null);
                return h('div', { class: 'pe-canzone' },
                    prese(c) ? comePresa(scelta, c.nome) : scelta,
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
                h('button', { type: 'button', class: 'pe-bottone pe-piccolo', onclick: () => { fermaAnteprima(); scegli({ musicName: '', musicaPreferita: '' }); }, testo: 'None' })),
            cerca, lista,
            h('p', { class: 'pe-nota', testo: cosmetici.prezzo('canzone-00000000').gratis ? 'Your first new song is free: you have not picked one yet. Tap ▶ to listen before you unlock.'
                : `A new song costs ${cosmetici.prezzo('canzone-00000000').prezzo} 🪙 and stays yours: tap ▶ to listen first. You have ${cosmetici.saldo()} 🪙.` }),
            h('p', { class: 'pe-nota', testo: 'The song plays from the Music block of your card. If you turn that block off, no music plays.' }));
    }

    // esci: l'editor si chiude o si cambia scheda (l'anteprima di una canzone non deve continuare a suonare)
    window.PublicEditor.estendi({ id: 'trainer', nome: 'Trainer', disegna, esci: fermaAnteprima });
})();
