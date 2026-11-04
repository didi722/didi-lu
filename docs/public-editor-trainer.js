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
// Avatar, colore e canzone non si scelgono più qui: costano monete e si cambiano nello Shop (shop.html, scheda Trainer), dove si provano sulla tua pagina prima di scegliere. Qui restano
// titolo, motto e Pokémon preferito, che sono gratis e si salvano con SAVE.
// =====================================================
(function () {
    'use strict';

    const P = window.PaginaPubblica;

    const MAX_RIGHE = 150;           // le righe mostrate in una lista; per il resto si scrive nella ricerca

    let pokemon = null;              // [{ name, id }], 'errore' o null (non ancora caricato)
    let ricerca = { pokemon: '' };
    let boxAperto = false;           // "From my Box" aperto o chiuso (resta così se il pannello si ridisegna)
    let teamAperto = null;           // l'id del team aperto, uno solo alla volta

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

    // Una voce già scelta da un altro allenatore: grigia, non si clicca
    const PRESA = 'Already taken by another trainer';
    function comePresa(bottone, titolo, motivo) {
        bottone.disabled = true;
        bottone.classList.add('is-preso');
        bottone.title = titolo ? `${titolo} · ${motivo || PRESA}` : (motivo || PRESA);
        bottone.setAttribute('aria-label', bottone.title);
        return bottone;
    }

    // ---- Disegno ------------------------------------------------------------------------------

    function disegna(ctx) {
        const { C, h, sezione, cambiaProfilo, ridisegna, cosmetici } = ctx;
        const dati = C.stato.dati;
        const profilo = C.profilo();
        const presi = P.scelteDegliAltri(dati.chiave, dati.tutti);
        caricaPokemon(ridisegna);

        // il valore scelto in questo momento, per segnare la voce giusta senza ridisegnare tutto
        const scegli = (nuovi, opzioni) => { cambiaProfilo(nuovi, { senzaPannello: true, ...opzioni }); segna(); };

        // ---- avatar, colore e canzone: si cambiano nello Shop
        const sezioneShop = sezione('Avatar, colour & song',
            h('div', { class: 'pe-attuale' },
                h('span', { class: 'pe-avatar-grande' }, h('img', { id: 'pe-avatar-attuale', src: profilo.avatar || 'immagini/profile/1.png', alt: 'Current avatar' })),
                h('span', { class: 'pe-conferma-colore', id: 'pe-colore-attuale', stile: { '--c': profilo.color || '#31c489', width: '28px', height: '28px' }, title: 'Your colour' }),
                h('b', { id: 'pe-canzone-attuale', testo: profilo.musicName || 'No song' })),
            h('p', { class: 'pe-nota', testo: 'They cost coins (your first of each is free) and are changed in the Shop, where you can try them on this page before you choose.' }),
            h('button', { type: 'button', class: 'pe-bottone pe-primario', onclick: () => cosmetici.vaiAlloShop(), testo: 'Change them in the Shop →' }));

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
            h('p', { class: 'pe-nota', testo: 'Everything you pick here shows on your card straight away and is saved with SAVE. Avatar, colour and song are changed in the Shop. Pokémon that another trainer has already picked stay in the list, greyed out.' }),
            sezioneShop,
            sezione('Title', selettore, h('p', { class: 'pe-nota', testo: 'Only the titles you have earned.' })),
            sezione('Motto', motto, conto),
            sezionePokemon(ctx, presi, scegli)
        ];

        // l'attenzione alla voce scelta: si cambia la classe, non si ridisegna (la lista non torna in cima)
        function segna() {
            const p = C.profilo();
            document.querySelectorAll('#pe-lista-pokemon .pe-scelta').forEach(b => b.classList.toggle('is-on', !p.pkmBox && b.dataset.v === String(p.pkmPreferito || '').toLowerCase()));
            document.querySelectorAll('#pe-box-pokemon .pe-scelta').forEach(b => b.classList.toggle('is-on', b.dataset.box === String(p.pkmBox || '')));
            const nomePkm = document.getElementById('pe-pokemon-attuale');
            if (nomePkm) nomePkm.textContent = p.pkmPreferito ? p.pkmPreferito.toUpperCase() : 'None';
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

    window.PublicEditor.estendi({ id: 'trainer', nome: 'Trainer', disegna });
})();
