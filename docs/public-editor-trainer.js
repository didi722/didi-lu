// =====================================================
// PUBLIC EDITOR · scheda "Trainer"
//
// Le scelte che prima stavano in profile.html, ora dentro l'editor della pagina pubblica: avatar,
// colore firma, titolo, motto, Pokémon preferito e canzone. Si vedono subito sulla carta e si salvano
// con SAVE (players/{id}/info, insieme alla configurazione della pagina).
//
// Colore, avatar, Pokémon preferito e canzone sono unici: quelli che un altro allenatore ha già
// scelto non compaiono proprio tra le scelte (P.scelteDegliAltri). Per i colori restano a ognuno
// quelli che aveva già. Al salvataggio la regola si ricontrolla sui dati di adesso (public-editor.js).
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

    // ---- Disegno ------------------------------------------------------------------------------

    function disegna(ctx) {
        const { C, h, sezione, campione, cambiaProfilo, ridisegna } = ctx;
        const dati = C.stato.dati;
        const profilo = C.profilo();
        const presi = P.scelteDegliAltri(dati.chiave, dati.tutti);
        caricaPokemon(ridisegna);
        caricaCanzoni(ridisegna);

        // il valore scelto in questo momento, per segnare la voce giusta senza ridisegnare tutto
        const scegli = (nuovi, opzioni) => { cambiaProfilo(nuovi, { senzaPannello: true, ...opzioni }); segna(); };

        // ---- avatar
        const avatarAttuale = P.chiaveAvatar(profilo.avatar);
        const avatarLiberi = P.elencoAvatar().filter(f => `profile/${f}`.toLowerCase() === avatarAttuale || !presi.avatar.has(`profile/${f}`.toLowerCase()));
        const griglia = h('div', { class: 'pe-avatar-griglia', id: 'pe-avatar-griglia' }, avatarLiberi.map(f =>
            h('button', { type: 'button', class: `pe-avatar-item${`profile/${f}`.toLowerCase() === avatarAttuale ? ' is-on' : ''}`, 'data-v': `profile/${f}`.toLowerCase(), title: `Avatar ${f.replace('.png', '')}`,
                onclick: () => scegli({ avatar: new URL(`immagini/profile/${f}`, window.location.href).href }) },
            h('img', { src: `immagini/profile/${f}`, alt: '', loading: 'lazy' }))));

        // ---- colore firma: quelli non presi da altri, più il tuo di adesso
        const attuale = String(profilo.color || '').toUpperCase();
        const colori = P.PALETTE_FIRMA.filter(c => !presi.colori.has(c.toUpperCase()));
        if (attuale && !colori.some(c => c.toUpperCase() === attuale)) colori.unshift(attuale);
        const swatch = h('div', { class: 'pe-campioni pe-campioni-fitti', id: 'pe-colori' }, colori.map(c =>
            campione(c, c.toUpperCase() === attuale, c.toUpperCase(), () => scegli({ color: c.toUpperCase() }), null)));
        for (const b of swatch.children) b.dataset.v = b.title;

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
            h('p', { class: 'pe-nota', testo: 'Everything you pick here shows on your card straight away and is saved with SAVE. Colours, avatars, Pokémon and songs that another trainer already has are hidden.' }),
            sezione('Avatar',
                h('div', { class: 'pe-avatar-riga' },
                    h('span', { class: 'pe-avatar-grande' }, h('img', { id: 'pe-avatar-attuale', src: profilo.avatar || 'immagini/profile/1.png', alt: 'Current avatar' })),
                    h('span', { class: 'pe-nota', testo: `${avatarLiberi.length} avatars available` })),
                griglia),
            sezione('Signature colour', swatch,
                h('p', { class: 'pe-nota', testo: 'It colours your name, stats and trophy. Yours is always kept.' })),
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
            document.querySelectorAll('#pe-lista-pokemon .pe-scelta').forEach(b => b.classList.toggle('is-on', b.dataset.v === String(p.pkmPreferito || '').toLowerCase()));
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
            const trovati = pokemon.filter(p => (p.name === mio || !presi.pokemon.has(p.name)) && (!q || p.name.includes(q)));
            lista.append(...trovati.slice(0, MAX_RIGHE).map(p =>
                h('button', { type: 'button', class: `pe-scelta${p.name === mio ? ' is-on' : ''}`, 'data-v': p.name, onclick: () => scegli({ pkmPreferito: p.name }) },
                    h('img', { src: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`, alt: '', loading: 'lazy' }),
                    h('span', { testo: p.name.toUpperCase() }))));
            if (trovati.length > MAX_RIGHE) lista.append(h('p', { class: 'pe-nota', testo: `${trovati.length - MAX_RIGHE} more: type in the search box to narrow it down.` }));
            if (!trovati.length) lista.append(h('p', { class: 'pe-nota', testo: 'No Pokémon found (or the ones that match are already taken).' }));
        };
        riempi();

        const cerca = h('input', { type: 'search', class: 'pe-ricerca', placeholder: 'Search a Pokémon…', 'aria-label': 'Search a Pokémon', value: ricerca.pokemon,
            oninput: e => { ricerca.pokemon = e.target.value; riempi(); } });

        return sezione('Favourite Pokémon',
            h('div', { class: 'pe-attuale' }, h('span', { testo: 'Now: ' }), h('b', { id: 'pe-pokemon-attuale', testo: profilo.pkmPreferito ? profilo.pkmPreferito.toUpperCase() : 'None' }),
                h('button', { type: 'button', class: 'pe-bottone pe-piccolo', onclick: () => scegli({ pkmPreferito: '' }), testo: 'None' })),
            cerca, lista);
    }

    // ---- Canzone ------------------------------------------------------------------------------

    function sezioneCanzone(ctx, presi, scegli) {
        const { C, h, sezione } = ctx;
        const profilo = C.profilo();
        const lista = h('div', { class: 'pe-scorri', id: 'pe-lista-canzoni' });

        const riempi = () => {
            lista.replaceChildren();
            if (canzoni === 'errore') { lista.append(h('p', { class: 'pe-nota', testo: 'Could not load the playlist. Check your connection and reopen this tab.' })); return; }
            if (!canzoni || canzoni === 'carico') { lista.append(h('p', { class: 'pe-nota', testo: 'Loading the playlist…' })); return; }
            const q = ricerca.canzoni.trim().toLowerCase();
            const mio = profilo.musicaPreferita;
            const libere = canzoni.filter(c => (c.url === mio || (!presi.canzoniUrl.has(c.url.trim()) && !presi.canzoniNomi.has(c.nome.trim().toLowerCase()))) && (!q || c.nome.toLowerCase().includes(q)));
            lista.append(...libere.map(c => h('div', { class: 'pe-canzone' },
                h('button', { type: 'button', class: `pe-scelta${c.url === mio ? ' is-on' : ''}`, 'data-v': c.url, onclick: () => { fermaAnteprima(); scegli({ musicName: c.nome, musicaPreferita: c.url }); } },
                    h('span', { testo: c.nome })),
                h('button', { type: 'button', class: 'pe-icona', title: 'Listen', 'aria-label': `Listen to ${c.nome}`, onclick: ev => {
                    ev.stopPropagation();
                    const gia = anteprima && anteprima.src === c.url;
                    fermaAnteprima();
                    if (gia) return;
                    anteprima = new Audio(c.url);
                    anteprima.volume = 0.4;
                    anteprima.play().catch(() => {});
                }, testo: '▶' }))));
            if (!libere.length) lista.append(h('p', { class: 'pe-nota', testo: 'No songs found (or the ones that match are already taken).' }));
        };
        riempi();

        const cerca = h('input', { type: 'search', class: 'pe-ricerca', placeholder: 'Search a song…', 'aria-label': 'Search a song', value: ricerca.canzoni,
            oninput: e => { ricerca.canzoni = e.target.value; riempi(); } });

        return sezione('Favourite song',
            h('div', { class: 'pe-attuale' }, h('span', { testo: 'Now: ' }), h('b', { id: 'pe-canzone-attuale', testo: profilo.musicName || (profilo.musicaPreferita ? 'Favourite song' : 'None') }),
                h('button', { type: 'button', class: 'pe-bottone pe-piccolo', onclick: () => { fermaAnteprima(); scegli({ musicName: '', musicaPreferita: '' }); }, testo: 'None' })),
            cerca, lista,
            h('p', { class: 'pe-nota', testo: 'The song plays from the Music block of your card. If you turn that block off, no music plays.' }));
    }

    // esci: l'editor si chiude o si cambia scheda (l'anteprima di una canzone non deve continuare a suonare)
    window.PublicEditor.estendi({ id: 'trainer', nome: 'Trainer', disegna, esci: fermaAnteprima });
})();
