// =====================================================
// PUBLIC CARD — la carta di presentazione dell'allenatore (docs/public.html)
//
// Disegna la pagina pubblica di un allenatore come una "trainer card": il ritratto sul palco con il
// suo Pokémon preferito, il nome, il titolo, le statistiche, il team in vista, trofei, medaglie e
// la canzone. Come sono disposti i blocchi, lo sfondo, lo stile della carta e gli adesivi dipende
// dalla configurazione salvata dall'allenatore (players/{id}/info/pagina, vedi pagina-pubblica.js).
//
// Tutto il testo che viene dal database (nome, motto, nomi di team e Pokémon) entra nella pagina
// solo come testo (textContent), mai come HTML.
//
// L'editor che permette al proprietario di cambiare la pagina è in public-editor.js e si carica
// soltanto quando chi guarda è il proprietario.
// =====================================================
(function () {
    'use strict';

    const P = window.PaginaPubblica;
    const ZONE = P.ZONE;

    const COLORI_TIPO = {
        fire: '#ff4422', water: '#3399ff', grass: '#77cc55', electric: '#ffcc33', ice: '#66ccff', fighting: '#bb5544',
        poison: '#aa5599', ground: '#ddbb55', flying: '#8899ff', psychic: '#ff5599', bug: '#aabb22', rock: '#bbaa66',
        ghost: '#6666bb', dragon: '#7766ee', dark: '#775544', steel: '#aaaabb', fairy: '#ee99ee', normal: '#aaaa99'
    };

    const FORME_SPECIALI = {
        mimikyu: 'mimikyu-disguised', giratina: 'giratina-altered', deoxys: 'deoxys-normal',
        shaymin: 'shaymin-land', aegislash: 'aegislash-shield'
    };
    const RIMPICCIOLISCI = ['kyogre', 'wailord'];
    const INGRANDISCI = ['charizard'];
    const A_TERRA = ['regieleki', 'iron-moth', 'poipole', 'naganadel', 'nihilego', 'lunala', 'cosmog', 'cosmoem', 'hoopa', 'sinistea', 'polteageist', 'sinistcha', 'poltchageist', 'phantump', 'runerigus', 'lampent', 'chandelure', 'gyarados', 'porygon', 'porygon-2', 'porygon-z', 'dodrio', 'umbreon', 'garchomp', 'murkrow', 'honchkrow', 'bronzong', 'scyther', 'tyranitar'];
    const GALLEGGIANO = ['yamask', 'cofagrigus', 'orbeetle', 'shedinja', 'castform', 'beedrill', 'dustox', 'venomoth', 'volcarona', 'ribombee', 'frosmoth', 'darkrai', 'celebi', 'jirachi', 'mew', 'reuniclus', 'florges', 'magnemite', 'magneton', 'magnezone', 'klefki', 'kyogre', 'haunter'];
    const SEMPRE_DAVANTI = ['regieleki', 'iron-moth', 'poipole', 'naganadel', 'nihilego', 'cosmog', 'cosmoem', 'hoopa', 'sinistea', 'polteageist', 'sinistcha', 'poltchageist', 'phantump', 'runerigus', 'lampent', 'chandelure', 'yamask', 'cofagrigus', 'orbeetle', 'shedinja', 'castform', 'porygon', 'porygon-2', 'porygon-z', 'beedrill', 'dustox', 'venomoth', 'volcarona', 'ribombee', 'frosmoth', 'darkrai', 'celebi', 'jirachi', 'mew', 'reuniclus', 'florges', 'magnemite', 'magneton', 'magnezone', 'klefki', 'kyogre', 'haunter', 'misdreavus', 'salamence', 'rapidash', 'butterfree', 'scyther', 'charizard', 'honchkrow'];
    const SEMPRE_DIETRO = ['lunala', 'metagross'];

    const stato = {
        dati: null,            // tutto quello che serve a disegnare (vedi initPublicProfile)
        config: P.predefinita(),
        salvata: P.predefinita(),
        riepilogo: null,       // le statistiche già calcolate
        blocchi: {},           // id -> elemento
        vuoti: {},             // id -> true se non c'è niente da mostrare (niente canzone, niente team...)
        zone: {},
        modifica: false,
        proprietario: false,
        adesivoScelto: -1,
        dopoApplica: null,     // l'editor si aggancia qui
        dopoAdatta: null,      // e qui: la tela è stata ridimensionata
        griglia: null,         // la griglia dello schermo intero in uso (P.griglia)
        lineeIntero: null,     // com'è costruita la pagina: con i blocchi affiancati raggruppati (schermo intero) o tutti in fila
        versioneTarghe: 0      // cresce quando cambia qualcosa da cui dipendono le targhette (il titolo): così si rifanno
    };

    // ---- Utilità ------------------------------------------------------------------------------

    /** Crea un elemento. I figli stringa diventano nodi di testo: niente HTML dal database. */
    function h(tag, proprieta, ...figli) {
        const e = document.createElement(tag);
        for (const [k, v] of Object.entries(proprieta || {})) {
            if (v == null || v === false) continue;
            if (k === 'class') e.className = v;
            else if (k === 'testo') e.textContent = v;
            else if (k === 'stile') for (const [p, val] of Object.entries(v)) e.style.setProperty(p, String(val));
            else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
            else e.setAttribute(k, v === true ? '' : String(v));
        }
        for (const f of figli.flat()) if (f != null && f !== false) e.append(f);
        return e;
    }

    const pulisci = nome => String(nome || '').toLowerCase().replace(/ /g, '-').replace(/[.'é]/g, '');
    const gifShowdown = nome => `https://play.pokemonshowdown.com/sprites/ani/${pulisci(nome)}.gif`;
    const elenco = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

    // I tipi di un Pokémon (PokeAPI), una sola richiesta per specie
    const cacheTipi = new Map();
    function tipiDi(nome) {
        const k = pulisci(nome);
        if (!cacheTipi.has(k)) {
            cacheTipi.set(k, fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(k)}`)
                .then(r => (r.ok ? r.json() : null))
                .then(j => (j ? j.types.map(t => t.type.name) : []))
                .catch(() => []));
        }
        return cacheTipi.get(k);
    }

    const blocco = (id, classe, ...figli) => h('section', { class: `pp-blocco ${classe}`, 'data-blocco': id },
        ...figli, h('span', { class: 'pp-fantasma' }));

    // ---- Palco: l'allenatore e il suo Pokémon preferito ---------------------------------------

    function costruisciPalco(d) {
        const set = h('div', { class: 'pp-set' });
        set.append(d.info.avatar
            ? h('div', { class: 'pp-allenatore' }, h('img', { src: d.info.avatar, alt: '' }))
            : h('div', { class: 'pp-allenatore pp-allenatore-vuoto', testo: '?' }));
        const posto = h('div', { class: 'pp-pkm' });
        set.append(posto);
        if (d.info.pkmPreferito) montaPokemonPreferito(set, posto, d.info.pkmPreferito);
        return blocco('palco', 'pp-palco', h('div', { class: 'pp-quadro' },
            h('div', { class: 'pp-raggi' }),
            h('div', { class: 'pp-puntini' }),
            h('div', { class: 'pp-pavimento' }),
            set,
            h('div', { class: 'pp-targhette', hidden: true })));     // le targhette scelte per il palco (riempiTarghe)
    }

    // Il Pokémon preferito in scala con l'allenatore, davanti o dietro a lui, a terra o in volo.
    // Le misure (e cosa succede se è troppo grande) sono in scalaScena, pagina-pubblica.js.
    let giri = 0;
    async function montaPokemonPreferito(set, posto, nomeGrezzo) {
        const mio = ++giri;
        posto.dataset.giro = String(mio);
        let nome = String(nomeGrezzo).toLowerCase().trim();
        if (FORME_SPECIALI[nome]) nome = FORME_SPECIALI[nome];

        let gif = null, altezzaM = 1.2, vola = false;
        try {
            const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(nome)}`);
            if (!r.ok) throw new Error('Pokémon not found');
            const j = await r.json();
            gif = (j.sprites && j.sprites.other && j.sprites.other.showdown && j.sprites.other.showdown.front_default)
                || (j.sprites && j.sprites.other && j.sprites.other['official-artwork'] && j.sprites.other['official-artwork'].front_default)
                || null;
            altezzaM = j.height / 10;
            vola = (j.types.some(t => t.type.name === 'flying')
                || j.abilities.some(a => a.ability.name === 'levitate')
                || GALLEGGIANO.includes(nome)
                || nome.includes('rayquaza')) && !A_TERRA.includes(nome);
        } catch (e) {
            // PokeAPI non lo conosce o non risponde: si usa lo sprite di Showdown e una taglia media
            vola = GALLEGGIANO.includes(nome);
        }
        if (posto.dataset.giro !== String(mio)) return;     // nel frattempo ne è stato scelto un altro
        if (!gif) gif = gifShowdown(nomeGrezzo);

        const regola = RIMPICCIOLISCI.includes(nome) ? 'rimpicciolisci' : INGRANDISCI.includes(nome) ? 'ingrandisci' : undefined;
        const misure = P.scalaScena(altezzaM, { regola, vola });

        let dietro;
        if (SEMPRE_DIETRO.includes(nome)) dietro = true;
        else if (SEMPRE_DAVANTI.includes(nome)) dietro = false;
        else dietro = vola || altezzaM >= P.SCENA.ALTEZZA_ALLENATORE_M * 1.2;

        set.style.setProperty('--ht', String(misure.allenatore));
        posto.className = `pp-pkm ${dietro ? 'pp-dietro' : 'pp-davanti'}${vola ? ' pp-vola' : ''}`;
        posto.style.setProperty('--h', String(misure.pokemon));
        // Il nome non è scritto sul palco (lo si riconosce a vista): resta solo nell'alt per chi legge lo schermo
        posto.replaceChildren(h('img', { src: gif, alt: nomeGrezzo, class: 'pp-pkm-img' }));
    }

    // ---- Nome, titolo, motto ------------------------------------------------------------------

    function costruisciTitolo(d) {
        const salvato = d.info.title;
        if (!salvato || salvato === 'No Title') return null;

        const aperto = x => ((x && typeof x.val === 'function' ? x.val() : x) || {});
        let tipiUso = aperto(d.tipi);
        if (tipiUso.stats) tipiUso = tipiUso.stats;
        if (tipiUso['team-stats']) tipiUso = tipiUso['team-stats'];
        if (tipiUso.typeusage) tipiUso = tipiUso.typeusage;

        const desc = Titoli.descriviTitolo(salvato, tipiUso, aperto(d.pokemon));
        const classeTipo = desc && desc.tipo ? desc.tipo : (desc ? 'pokemon' : salvato.split(' ')[0].toLowerCase().replace(/[^a-z]/g, ''));
        const prog = desc ? desc.progresso : null;

        const ETICHETTE = { played: 'Played', won: 'Won', ko: 'KOs' };
        // Con un prossimo scaglione: una barra per ogni requisito; al massimo: i numeri raggiunti
        const righe = !prog ? [] : prog.prossimo
            ? prog.barre.map(b => ({ et: ETICHETTE[b.c], valore: b.valore, obiettivo: b.obiettivo, pct: b.pct * 100 }))
            : ['played', 'won', 'ko'].map(c => ({ et: ETICHETTE[c], valore: prog.uso[c], obiettivo: 0, pct: 100 }));

        const tooltip = h('span', { class: 'neubrutal-tooltip pp-tip pp-tip-titolo' },
            h('span', { class: 'pp-tip-nome', testo: (desc ? desc.nome : salvato).toUpperCase() }),
            prog && prog.prossimo
                ? h('span', { class: 'pp-tip-next', testo: `Next: ${prog.prossimo.nome(desc.categoria === 'tipo' ? desc.chiave : desc.nome)}` })
                : null,
            righe.map(r => h('span', { class: 'pp-tip-blocco' },
                h('span', { class: 'pp-tip-riga' }, h('span', { testo: `${r.et}: ${r.valore}` }), r.obiettivo ? h('span', { class: 'pp-tip-obiettivo', testo: String(r.obiettivo) }) : null),
                h('span', { class: 'pp-barra' }, h('i', { stile: { width: `${r.pct}%` } })))));

        return h('div', { id: 'player-active-title-badge', class: `hub-title-badge pp-titolo pp-tip-host tipo-${classeTipo}`, tabindex: '0' }, salvato, tooltip);
    }

    // Il sigillo ufficiale: un anello di testo che gira intorno alla posizione in classifica
    function costruisciSigillo(centro) {
        const NS = 'http://www.w3.org/2000/svg';
        const el = (tag, attr, testo) => {
            const e = document.createElementNS(NS, tag);
            for (const [k, v] of Object.entries(attr || {})) e.setAttribute(k, v);
            if (testo) e.textContent = testo;
            return e;
        };
        const svg = el('svg', { viewBox: '0 0 100 100' });
        const anello = el('g', { class: 'pp-sigillo-anello' });
        anello.append(
            el('circle', { cx: 50, cy: 50, r: 48, fill: '#ffde4d', stroke: '#000', 'stroke-width': 3 }),
            el('path', { id: 'pp-cerchio-testo', d: 'M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0', fill: 'none' }));
        const testo = el('text', { 'font-size': 9.5, 'letter-spacing': 0.4 });
        testo.append(el('textPath', { href: '#pp-cerchio-testo', textLength: 224, lengthAdjust: 'spacing' },
            "OFFICIAL TRAINER \u2605 SANT'ALVISE PKMN LEAGUE \u2605 "));
        anello.append(testo);
        svg.append(anello,
            el('circle', { cx: 50, cy: 50, r: 26, fill: '#fff', stroke: '#000', 'stroke-width': 3 }),
            el('text', { class: 'pp-sigillo-centro', x: 50, y: 51 }, centro));
        return h('div', { class: 'pp-sigillo', 'aria-hidden': 'true' }, svg);
    }

    function costruisciIdentita(d) {
        const nome = String(d.nome || '').toUpperCase();
        const motto = d.info.bio ? h('p', { class: 'pp-motto' }, h('span', { testo: String(d.info.bio).toUpperCase() })) : null;
        const posizione = stato.riepilogo && stato.riepilogo.rank && /^#\d+$/.test(stato.riepilogo.rank.grande) ? stato.riepilogo.rank.grande : '\u2605';
        return blocco('identita', 'pp-identita',
            costruisciSigillo(posizione),
            h('h1', { class: 'pp-nome', stile: { '--len': nome.length || 1 } }, h('span', { id: 'player-name-display', testo: nome })),
            h('div', { class: 'pp-titolo-riga', hidden: true }),     // le targhette scelte per questo blocco (riempiTarghe)
            motto);
    }

    // ---- Targhette: il titolo e il nome della personalità, nel blocco del nome o sul palco -----------------

    // Il nome della personalità come una targhetta, dello stesso aspetto del titolo (e come lui con il suggerimento al passaggio)
    function costruisciTargaPersonalita(d) {
        const p = d.personalita;
        if (!p || p.stato !== 'pronta' || !p.tipo) return null;
        const tooltip = h('span', { class: 'neubrutal-tooltip pp-tip pp-tip-titolo' },
            h('span', { class: 'pp-tip-nome', testo: `${p.tipo.nome.toUpperCase()} · PERSONALITY` }),
            h('span', { class: 'pp-tip-testo', testo: p.tipo.descrizione }),
            (p.frasi || []).slice(0, 2).map(f => h('span', { class: 'pp-tip-testo', testo: f })));
        return h('div', { class: `hub-title-badge pp-titolo pp-targa-personalita pp-tip-host famiglia-${p.tipo.id}`, tabindex: '0' },
            h('span', { 'aria-hidden': 'true', testo: p.tipo.icona }), ` ${p.tipo.nome}`, tooltip);
    }

    const TARGHETTE = { titolo: d => costruisciTitolo(d), personalita: d => costruisciTargaPersonalita(d) };

    /** Mette ogni targhetta dove l'allenatore l'ha voluta (config.targhette); un contenitore si rifà solo se cambia cosa ci sta dentro */
    function riempiTarghe() {
        const posti = stato.config.targhette;
        const contenitori = {
            identita: stato.blocchi.identita && stato.blocchi.identita.querySelector('.pp-titolo-riga'),
            palco: stato.blocchi.palco && stato.blocchi.palco.querySelector('.pp-targhette')
        };
        for (const [posto, contenitore] of Object.entries(contenitori)) {
            if (!contenitore) continue;
            const chi = Object.keys(TARGHETTE).filter(k => posti[k] === posto);
            const firma = `${chi.join(',')}|${stato.versioneTarghe}`;
            if (contenitore.dataset.firma === firma) continue;
            contenitore.dataset.firma = firma;
            const nodi = chi.map(k => TARGHETTE[k](stato.dati)).filter(Boolean);
            contenitore.replaceChildren(...nodi);
            contenitore.hidden = !nodi.length;
        }
    }

    // ---- Statistiche --------------------------------------------------------------------------

    function costruisciStatistiche() {
        return blocco('statistiche', 'pp-statistiche', h('div', { class: 'pp-stat-griglia' }));
    }

    function riempiStatistiche() {
        const griglia = stato.blocchi.statistiche.querySelector('.pp-stat-griglia');
        griglia.replaceChildren();
        // 1-3 statistiche in una riga, 4 in due da due, 5-6 in due righe da tre: mai una riga con un solo riquadro
        const quante = stato.config.statistiche.length;
        griglia.style.setProperty('--col', String(quante <= 3 ? quante : quante === 4 ? 2 : 3));
        stato.config.statistiche.forEach((id, i) => {
            const v = stato.riepilogo[id];
            if (!v) return;
            const apre = v.clic && typeof window.mostraGraficoElo === 'function';
            griglia.append(h(apre ? 'button' : 'div', {
                class: `pp-stat${apre ? ' pp-stat-clic' : ''}`,
                'data-stat': id,
                type: apre ? 'button' : null,
                stile: { '--i': i, '--n': v.grande.length },
                onclick: apre ? () => window.mostraGraficoElo(stato.dati.chiave) : null
            },
            h('span', { class: 'pp-stat-et', testo: P.STAT[id].nome }),
            h('span', { class: 'pp-stat-val', testo: v.grande }),
            h('span', { class: 'pp-stat-sub', testo: v.piccolo }),
            v.pct !== null ? h('span', { class: 'pp-stat-barra' }, h('i', { stile: { width: `${v.pct}%` } })) : null,
            apre ? h('span', { class: 'pp-stat-freccia', 'aria-hidden': 'true', testo: '↗' }) : null));
        });
    }

    // ---- Party: il team in vista --------------------------------------------------------------

    const partite = t => (t.stats && typeof t.stats.played !== 'undefined' ? Number(t.stats.played) : Number(t.partite)) || 0;
    const vittorie = t => Number(t.stats && t.stats.won) || 0;

    /** Il team scelto dall'allenatore; con "auto" quello con più vittorie, purché abbia giocato */
    function sceltaTeam(config) {
        const lista = (stato.dati.teams || []).filter(t => t && typeof t === 'object');
        if (config.team !== 'auto') {
            const t = lista.find(x => x.id === config.team);
            if (t) return t;
        }
        const migliori = lista.filter(t => partite(t) >= 1)
            .sort((a, b) => vittorie(b) - vittorie(a) || (Number(b.stats && b.stats.points) || 0) - (Number(a.stats && a.stats.points) || 0));
        return migliori[0] || null;
    }

    function costruisciParty() {
        return blocco('party', 'pp-party');
    }

    function riempiParty() {
        const el = stato.blocchi.party;
        el.querySelector('.pp-party-corpo')?.remove();
        const team = sceltaTeam(stato.config);
        stato.vuoti.party = !team;
        if (!team) return;

        const s = team.stats || {};
        const nome = team.nome || team.name || 'My team';
        const categoria = team.categoria || team.category || 'VGC';
        const pokemon = elenco(team.pokemon).filter(p => p && (p.nome || p.name));
        const meta = [categoria, `${vittorie(team)}W ${Number(s.lose ?? s.lost) || 0}L`, `${Number(s.points) || 0} PTS`].join(' · ');

        el.prepend(h('div', { class: 'pp-party-corpo' },
            h('div', { class: 'pp-party-testa' },
                h('span', { class: 'pp-chip', testo: 'PARTY' }),
                h('button', { class: 'pp-party-nome', type: 'button', title: 'See the whole team', testo: nome,
                    onclick: () => { if (typeof window.apriDettagli === 'function') window.apriDettagli(team.id); } }),
                h('span', { class: 'pp-party-meta', testo: meta })),
            h('div', { class: 'pp-party-slots', stile: { '--quanti': Math.max(pokemon.length, 1) } }, pokemon.map((p, i) => {
                const nomePkm = p.nome || p.name;
                const slot = h('button', { class: 'pp-slot', type: 'button', stile: { '--i': i, '--t1': '#e8e8e8', '--t2': '#e8e8e8' },
                    title: nomePkm, 'aria-label': nomePkm,   // il nome non è scritto sulla card: resta nel suggerimento e per chi legge lo schermo
                    onclick: () => {
                        window.squadraAperta = team;     // i fiocchi del Pokémon sono quelli DI QUEL team
                        if (typeof window.apriPkmDettaglio === 'function' && Array.isArray(p.mosse)) window.apriPkmDettaglio(p, pulisci(nomePkm));
                    } },
                    h('img', { class: 'pp-slot-img', src: gifShowdown(nomePkm), alt: '',
                        onerror: e => { e.target.onerror = null; e.target.src = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'; } }));
                tipiDi(nomePkm).then(tipi => {
                    const c = tipi.map(t => COLORI_TIPO[t]).filter(Boolean);
                    if (c.length) { slot.style.setProperty('--t1', c[0]); slot.style.setProperty('--t2', c[1] || c[0]); }
                });
                return slot;
            }))));
    }

    // ---- Trofei e medaglie --------------------------------------------------------------------

    function costruisciTrofei(d) {
        const stagioni = d.stagioni || {};
        const conteggio = Number(stagioni.won) || 0;
        const vinte = Object.values(stagioni.history || {}).filter(s => s && (s.rank === 1 || s.rank === '1'));
        const ha = conteggio > 0;
        const maschera = `url('immagini/${ha ? 'season-winner-color' : 'season-no-winner-color'}.png')`;

        const tip = vinte.length ? h('span', { class: 'neubrutal-tooltip pp-tip' }, vinte.map(s => {
            let data = s.enddate || 'N/D';
            if (typeof s.enddate === 'string' && s.enddate.includes('-')) {
                const p = s.enddate.split('-');
                if (p.length === 3) data = `${p[2]}/${p[1]}/${p[0]}`;
            }
            return h('span', { class: 'pp-tip-riga' }, h('span', { testo: `🏆 ${s.name || 'Season'}` }), h('span', { class: 'pp-tip-obiettivo', testo: data }));
        })) : null;

        const colore = h('div', { class: 'pp-coppa-colore' });
        colore.style.setProperty('-webkit-mask-image', maschera);
        colore.style.setProperty('mask-image', maschera);

        return blocco('trofei', 'pp-trofei',
            h('span', { class: 'pp-chip', testo: 'TROPHIES' }),
            h('div', { class: `pp-coppa pp-tip-host${tip ? '' : ' pp-senza-tip'}`, tabindex: tip ? '0' : null },
                colore,
                h('img', { class: 'pp-coppa-img', src: `immagini/${ha ? 'season-winner' : 'season-no-winner'}.png`, alt: 'Season trophy', decoding: 'async' }),
                tip),
            h('span', { class: 'pp-coppa-conto', testo: `x${conteggio}` }));
    }

    const formattaData = dataRaw => {
        if (!dataRaw || dataRaw === '--/--/--' || dataRaw === 'Data N.D.') return '--/--/----';
        const d = new Date(dataRaw);
        if (isNaN(d.getTime())) return String(dataRaw);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const MEDAGLIE_ALLENATORE = 4;     // badge dell'allenatore sulla carta (oltre alle serie)

    function costruisciMedaglie(d) {
        const st = d.badges || {};
        const serie = [
            { id: 'clean', etichetta: 'Clean Streak', desc: n => `${n} matches undefeated`, max: parseInt(st.maxcleanstrike) || 0, corrente: parseInt(st.cleanstrike) || 0, data: formattaData(st.maxcleanstrikedate), passi: [3, 5, 7] },
            { id: 'won', etichetta: 'Win Streak', desc: n => `${n} matches in a row`, max: parseInt(st.maxwonstrike) || 0, corrente: parseInt(st.wonstrike) || 0, data: formattaData(st.maxwonstrikedate), passi: [5, 7, 10] },
            { id: 'sd', etichetta: 'SD Streak', desc: n => `${n} showdowns in a row`, max: parseInt(st.maxsdstrike) || 0, corrente: parseInt(st.sdstrike) || 0, data: formattaData(st.sdwonstrikedate), passi: [3, 5, 7] }
        ];
        // `icona`: se la PNG non c'è ancora (badge nuovi) al suo posto compare una medaglia disegnata dal CSS (badge-team.js)
        const medaglia = (img, alt, tip, icona) => h('div', { class: 'pp-medaglia pp-tip-host', tabindex: '0' },
            h('img', { src: img, alt, onerror: icona && window.BadgeTeam ? ev => window.BadgeTeam.immagineMancante(ev.target, icona) : null }), tip);
        const lista = [];

        const chiavi = [d.chiave, d.nome].map(x => String(x || '').trim().toLowerCase());
        if (chiavi.includes('didi') || chiavi.includes('lukiani')) {
            lista.push(medaglia('immagini/badge_founder.png', 'Founder', h('div', { class: 'neubrutal-tooltip pp-tip' },
                h('span', { class: 'pp-tip-nome', testo: 'LEAGUE FOUNDER' }), h('span', { class: 'pp-tip-testo', testo: 'Hail to the kings' }))));
        }
        for (const b of serie) {
            let livello = '', raggiunto = 0, prossimo = b.passi[0];
            if (b.max >= b.passi[2]) { livello = 'gold'; raggiunto = b.passi[2]; prossimo = b.passi[2]; }
            else if (b.max >= b.passi[1]) { livello = 'silver'; raggiunto = b.passi[1]; prossimo = b.passi[2]; }
            else if (b.max >= b.passi[0]) { livello = 'bronze'; raggiunto = b.passi[0]; prossimo = b.passi[1]; }
            if (!livello) continue;
            const pct = Math.min((b.corrente / prossimo) * 100, 100);
            lista.push(medaglia(`immagini/badge_${b.id}_${livello}.png`, `${b.etichetta} ${livello}`, h('div', { class: 'neubrutal-tooltip pp-tip' },
                h('span', { class: 'pp-tip-riga' }, h('span', { class: 'pp-tip-nome', testo: b.etichetta.toUpperCase() }), h('span', { class: 'pp-tip-obiettivo', testo: b.data })),
                h('span', { class: 'pp-tip-testo', testo: b.desc(raggiunto) }),
                h('span', { class: 'pp-barra' }, h('i', { stile: { width: `${pct}%` } })),
                h('span', { class: 'pp-tip-obiettivo', testo: `CURRENT: ${b.corrente} / ${prossimo}` }))));
        }
        // i badge dell'allenatore (badge-allenatore.js): i quattro più alti; gli altri in un "+N" (tutti si vedono nel profilo, Achievements).
        // Il blocco deve starci anche negli schermi interi senza scroll: poche medaglie, mai una fila infinita.
        const presi = d.badgeAllenatore || [];
        for (const b of presi.slice(0, MEDAGLIE_ALLENATORE)) {
            const prossimo = b.prossima == null ? 'TOP LEVEL' : `NEXT: ${b.valore} / ${b.prossima}`;
            lista.push(medaglia(b.immagine, `${b.nome} ${b.livelloNome}`, h('div', { class: 'neubrutal-tooltip pp-tip' },
                h('span', { class: 'pp-tip-riga' }, h('span', { class: 'pp-tip-nome', testo: b.nome.toUpperCase() }), h('span', { class: 'pp-tip-obiettivo', testo: b.livelloNome.toUpperCase() })),
                h('span', { class: 'pp-tip-testo', testo: b.descrizione }),
                h('span', { class: 'pp-barra' }, h('i', { stile: { width: `${Math.round(b.progresso * 100)}%` } })),
                h('span', { class: 'pp-tip-obiettivo', testo: prossimo })), b.icona));
        }
        if (presi.length > MEDAGLIE_ALLENATORE) {
            lista.push(h('div', { class: 'pp-medaglia pp-medaglia-altri', tabindex: '0', title: `${presi.length - MEDAGLIE_ALLENATORE} more trainer badge${presi.length - MEDAGLIE_ALLENATORE > 1 ? 's' : ''}: see them all in your profile (Achievements)`,
                testo: `+${presi.length - MEDAGLIE_ALLENATORE}` }));
        }
        stato.vuoti.medaglie = lista.length === 0;
        return blocco('medaglie', 'pp-medaglie', h('span', { class: 'pp-chip', testo: 'MEDALS' }), h('div', { class: 'pp-medaglie-riga' }, lista));
    }

    // ---- Personalità: il diagramma a ragnatela e il nome --------------------------------------

    function costruisciPersonalita(d) {
        const p = d.personalita;
        const pronta = !!p && p.stato === 'pronta' && !!p.tipo && !!window.PersonalitaGrafico && !!window.Personalita;
        stato.vuoti.personalita = !pronta;
        // in un blocco largo il diagramma sta a sinistra e a destra il nome con la sua spiegazione; in uno stretto, il nome sotto
        const corpo = !pronta ? null : h('div', { class: 'pp-pers-corpo' },
            h('div', { class: 'pp-pers-grafico' },
                window.PersonalitaGrafico.radar(window.Personalita.ASSI, p.assi.map(a => a.valore), { piccolo: true })),
            h('div', { class: 'pp-pers-testo' },
                h('p', { class: 'pp-pers-tipo', title: p.tipo.descrizione },
                    h('span', { 'aria-hidden': 'true', testo: p.tipo.icona }), ` ${p.tipo.nome.toUpperCase()}`),
                h('p', { class: 'pp-pers-desc', testo: p.tipo.descrizione })));
        return blocco('personalita', 'pp-personalita', h('span', { class: 'pp-chip', testo: 'PERSONALITY' }), corpo);
    }

    // ---- Musica -------------------------------------------------------------------------------

    function costruisciMusica(d) {
        const nome = d.info.musicName || (d.info.musicaPreferita ? 'Favourite song' : '');
        stato.vuoti.musica = !nome;
        const el = blocco('musica', 'pp-musica', h('button', { class: 'pp-musica-btn', type: 'button', title: 'Play / pause',
            onclick: () => { if (typeof window.toggleMusic === 'function') window.toggleMusic(); } },
        h('span', { class: 'pp-disco', 'aria-hidden': 'true' }, h('i')),
        h('span', { class: 'pp-musica-testo' }, h('small', { testo: 'NOW PLAYING' }), h('b', { testo: nome })),
        h('span', { class: 'pp-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'))));
        const audio = document.getElementById('bg-music-home');
        if (audio) {
            const EVENTI = ['play', 'pause', 'volumechange', 'ended'];
            if (stato.sincMusica) EVENTI.forEach(ev => audio.removeEventListener(ev, stato.sincMusica));
            const sync = () => el.classList.toggle('is-playing', !audio.paused && !audio.muted);
            stato.sincMusica = sync;
            EVENTI.forEach(ev => audio.addEventListener(ev, sync));
            sync();
        }
        return el;
    }

    // ---- Cornice: testata, piede, tessera -----------------------------------------------------

    function riempiCornice(d) {
        const numero = P.numeroTessera(d.chiave, Object.keys(d.tutti || {}));
        const set = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
        set('pp-numero', `Nº ${numero}`);
        set('pp-id', `${String(d.chiave).toUpperCase()}-${numero}`);
        set('pp-firma', d.nome);

        const barre = document.getElementById('pp-barre');
        if (barre) {
            barre.replaceChildren(...P.codiceBarre(d.chiave).map((w, i) => h('i', { stile: { '--w': w, '--g': (i % 3) + 1 } })));
        }
        // il nome gigante dietro la carta
        const scritta = document.getElementById('pp-scritta');
        if (scritta) {
            scritta.replaceChildren(...[0, 1, 2, 3].map(i => h('span', { class: 'pp-scritta-riga', stile: { '--k': i }, testo: `${String(d.nome).toUpperCase()} `.repeat(4) })));
        }
    }

    // ---- Adesivi ------------------------------------------------------------------------------

    function disegnaAdesivi() {
        const strato = document.getElementById('pp-adesivi');
        if (!strato) return;
        strato.replaceChildren(...stato.config.adesivi.map((a, i) => {
            const def = P.ADESIVI[a.id];
            return h('span', {
                class: `pp-adesivo${def.testo ? ' pp-adesivo-testo' : ''}${i === stato.adesivoScelto ? ' is-scelto' : ''}`,
                'data-i': i, 'data-id': a.id, title: def.nome,
                stile: { left: `${a.x}%`, top: `${a.y}%`, '--s': a.s, '--r': `${a.r}deg`, '--tinta': def.tinta },
                testo: def.glifo
            });
        }));
    }

    // ---- Applicare la configurazione ----------------------------------------------------------

    /** Il widget della canzone è in vista (acceso dall'allenatore e c'è una canzone)? */
    function musicaAttiva() {
        const b = stato.config.blocchi.find(x => x.id === 'musica');
        return !!(b && b.on) && !stato.vuoti.musica;
    }

    const NOMI_BLOCCHI = P.BLOCCHI;

    function applica() {
        const c = stato.config;
        const radice = document.documentElement;
        const colore = stato.dati.colore;
        const variabili = P.variabiliCss(c, colore);
        for (const [k, v] of Object.entries(variabili)) radice.style.setProperty(k, v);

        const pagina = document.getElementById('pp-pagina');
        pagina.dataset.layout = c.layout;
        pagina.classList.toggle('pp-holo-on', !!c.carta.holo);
        pagina.classList.toggle('pp-tondi', c.carta.angoli === 'tondi');

        const sfondo = document.getElementById('pp-sfondo');
        sfondo.classList.toggle('pp-scorre', c.sfondo.animato && variabili['--pp-periodo'] !== '0px');
        const scritta = document.getElementById('pp-scritta');
        if (scritta) scritta.hidden = !c.sfondo.scritta;

        riempiStatistiche();
        riempiParty();
        riempiTarghe();

        const per = P.blocchiPerZona(c);
        const intero = schermoIntero();
        stato.lineeIntero = intero;
        const lineePerZona = P.lineeDiZona(c);
        for (const z of ZONE) {
            const zona = stato.zone[z];
            let visibili = 0;
            const desiderati = per[z].map(b => {
                const el = stato.blocchi[b.id];
                const vuoto = !!stato.vuoti[b.id];
                const mostrato = b.on && !vuoto;
                if (mostrato) visibili += 1;
                el.classList.toggle('pp-spento', !b.on);
                el.classList.toggle('pp-vuoto', b.on && vuoto);
                el.hidden = !stato.modifica && !mostrato;
                const fantasma = el.querySelector(':scope > .pp-fantasma');
                if (fantasma) fantasma.textContent = !b.on
                    ? `${NOMI_BLOCCHI[b.id].nome} · hidden — click to show`
                    : `${NOMI_BLOCCHI[b.id].nome} · ${(NOMI_BLOCCHI[b.id].vuoto || 'nothing to show yet').toLowerCase()}`;
                return el;
            });
            // Si ricostruisce la zona solo se cambia come sono messi i blocchi (le GIF non ripartono per niente). A schermo
            // intero i blocchi affiancati stanno dentro una .pp-linea; sugli schermi stretti tutto è in fila, una riga per blocco.
            const righe = lineePerZona[z];
            const firma = `${intero ? 'I' : 'S'}|${righe.map(r => r.join(',')).join('/')}`;
            if (zona.dataset.firma !== firma) {
                const nodi = [];
                for (const riga of righe) {
                    const elementi = riga.map(id => stato.blocchi[id]);
                    if (intero && elementi.length > 1) nodi.push(h('div', { class: 'pp-linea' }, elementi)); else nodi.push(...elementi);
                }
                zona.replaceChildren(...nodi);
                zona.dataset.firma = firma;
            }
            zona.dataset.vuota = String(visibili === 0);
        }

        applicaGriglia();
        disegnaAdesivi();
        adattaSchermo();
        // senza il widget della canzone in vista la musica non resta accesa: non ci sarebbe modo di spegnerla
        const audio = document.getElementById('bg-music-home');
        if (audio && !musicaAttiva()) audio.pause();
        if (typeof stato.dopoApplica === 'function') stato.dopoApplica();
    }

    // La griglia dello schermo intero (aree, colonne e righe, pesi dei blocchi): la calcola pagina-pubblica.js
    // (griglia), qui si passa al CSS. Vale solo con body.pp-fisso, altrove le variabili non servono a niente.
    const visibiliDi = c => c.blocchi.filter(b => b.on && !stato.vuoti[b.id]).map(b => b.id);

    /**
     * Scrive nel CSS la griglia di una configurazione e la restituisce.
     * garantisci: false = senza ingrandire il palco (l'editor prova così misure che il palco deve rispettare da solo)
     */
    function scriviGriglia(c, garantisci = true) {
        // in modifica anche le zone vuote hanno il loro posto: sono i bersagli dove lasciare un blocco
        const g = P.griglia(c, visibiliDi(c), { garantisciPalco: garantisci, zoneVuote: stato.modifica });
        const corpo = document.querySelector('.pp-corpo');
        const fr = pesi => pesi.map(x => `${Math.round(x * 1000) / 1000}fr`).join(' ');
        corpo.style.setProperty('--pp-aree', g.aree.map(riga => `"${riga.join(' ')}"`).join(' '));
        corpo.style.setProperty('--pp-colonne', fr(g.colonne));
        corpo.style.setProperty('--pp-righe', fr(g.righe));
        for (const z of ZONE) {
            const zona = stato.zone[z], p = g.zone[z];
            zona.dataset.dir = p ? p.dir : P.GEOMETRIA[c.layout].dir[z];
            if (p) { zona.dataset.c0 = String(p.c0); zona.dataset.r0 = String(p.r0); } else { delete zona.dataset.c0; delete zona.dataset.r0; }
        }
        for (const [id, el] of Object.entries(stato.blocchi)) el.style.setProperty('--pp-peso', String(g.blocchi[id] != null ? Math.round(g.blocchi[id] * 1000) / 1000 : 1));
        // le righe di blocchi affiancati: pesano come il blocco più pesante; senza blocchi in vista sparisce (in modifica resta
        // solo se ci sono segnaposto da mostrare)
        for (const zona of Object.values(stato.zone)) {
            for (const linea of zona.querySelectorAll(':scope > .pp-linea')) {
                const ids = Array.from(linea.children).map(e => e.dataset.blocco).filter(id => g.blocchi[id] != null);
                linea.classList.toggle('pp-linea-fantasma', !ids.length);
                linea.hidden = !ids.length && !stato.modifica;
                linea.style.setProperty('--pp-peso-linea', String(ids.length ? Math.round(Math.max(...ids.map(id => g.blocchi[id])) * 1000) / 1000 : 1));
            }
        }
        return g;
    }

    function applicaGriglia() { stato.griglia = scriviGriglia(stato.config); }

    // ---- Tutto a schermo intero, senza scroll (su PC) ------------------------------------------

    // Su un monitor la pagina è una "tela" che riempie esattamente la finestra: ha almeno 1280 x 640 pixel di
    // progetto e viene ingrandita (transform: scale) quanto serve per arrivare ai bordi. Quindi non scorre mai
    // e ogni layout, anche quelli a sorpresa, si vede intero. Se i blocchi scelti non ci stanno (per esempio
    // tutti nella stessa colonna) la tela viene rimpicciolita finché ci stanno: più testo sta in meno spazio.
    // Su telefono e finestre piccole la pagina resta a scorrimento normale.
    const PANNELLO_PX = 400;            // larghezza del pannello dell'editor (style-public-editor.css)
    const TELA_MIN_W = 1280, TELA_MIN_H = 640;
    const PC_MIN_W = 1100, PC_MIN_H = 560;

    function sfora(carta) {
        // il collage è fatto di tessere storte: il loro ingombro sporge di qualche pixel
        const tolleranza = carta.closest('[data-layout="collage"]') ? 30 : 4;
        if (carta.scrollHeight > carta.clientHeight + tolleranza || carta.scrollWidth > carta.clientWidth + tolleranza) return true;
        // Anche dentro il corpo: se i blocchi non ci stanno sporgono sul codice a barre e sulla firma (il piede), che stanno
        // ancora dentro la carta e quindi il controllo qui sopra non se ne accorge. Si guardano le misure vere delle righe
        // e delle colonne della griglia (non scrollHeight: conterebbe anche le animazioni d'entrata e le tessere storte)
        const corpo = carta.querySelector('.pp-corpo');
        if (!corpo) return false;
        const stile = getComputedStyle(corpo);
        const totale = (tracce, spazio) => {
            const v = tracce.split(/\s+/).map(parseFloat).filter(Number.isFinite);
            return v.reduce((a, b) => a + b, 0) + (parseFloat(spazio) || 0) * Math.max(0, v.length - 1);
        };
        if (totale(stile.gridTemplateRows, stile.rowGap) > corpo.clientHeight + 4
            || totale(stile.gridTemplateColumns, stile.columnGap) > corpo.clientWidth + 4) return true;
        // e i blocchi dentro una zona che occupa più righe o colonne della griglia: la griglia non le allarga per loro
        // (offsetTop e simili, come sopra, non contano le trasformazioni)
        for (const zona of corpo.querySelectorAll('.pp-zona')) {
            if (zona.offsetParent === null) continue;
            const fondo = zona.offsetTop + zona.offsetHeight, destra = zona.offsetLeft + zona.offsetWidth;
            for (const f of zona.children) {
                if (f.offsetParent === null) continue;
                if (f.offsetTop + f.offsetHeight > fondo + 4 || f.offsetLeft + f.offsetWidth > destra + 4) return true;
            }
        }
        return false;
    }

    // Quanto è più grande il palco (l'area che occupa davvero) del blocco più grande tra gli altri; Infinity se non
    // c'è niente da confrontare. A schermo piccolo gli altri blocchi hanno già la loro misura minima e il palco
    // prende solo quello che resta: se non basta a farlo il più grande, la tela si rimpicciolisce (più spazio, a
    // parità di misure minime) fino a RAPPORTO_PALCO_MIN, ma non sotto K_MIN_PALCO per non rendere tutto minuscolo.
    const RAPPORTO_PALCO_MIN = 1.25, K_MIN_PALCO = 0.68;

    function rapportoPalco() {
        const visibile = e => e && !e.hidden && e.offsetParent !== null && !e.classList.contains('pp-spento') && !e.classList.contains('pp-vuoto');
        const area = e => { const r = e.getBoundingClientRect(); return r.width * r.height; };
        if (!visibile(stato.blocchi.palco)) return Infinity;
        let altro = 0;
        for (const [id, el] of Object.entries(stato.blocchi)) if (id !== 'palco' && visibile(el)) altro = Math.max(altro, area(el));
        return altro ? area(stato.blocchi.palco) / altro : Infinity;
    }

    const schermoIntero = () => window.innerWidth >= PC_MIN_W && window.innerHeight >= PC_MIN_H;

    function adattaSchermo() {
        const radice = document.documentElement;
        const pc = schermoIntero();
        // passando da schermo intero a schermo stretto (o al contrario) i blocchi affiancati vanno rimessi in fila (o raggruppati)
        if (stato.lineeIntero != null && stato.lineeIntero !== pc) { applica(); return; }
        document.body.classList.toggle('pp-fisso', pc);
        if (!pc) {
            for (const v of ['--pp-k', '--pp-w', '--pp-h']) radice.style.removeProperty(v);
            if (typeof stato.dopoAdatta === 'function') stato.dopoAdatta();
            return;
        }
        const larghezza = window.innerWidth - (stato.modifica ? PANNELLO_PX : 0);
        const altezza = window.innerHeight;
        const imposta = k => {
            radice.style.setProperty('--pp-k', k.toFixed(4));
            radice.style.setProperty('--pp-w', `${(larghezza / k).toFixed(1)}px`);
            radice.style.setProperty('--pp-h', `${(altezza / k).toFixed(1)}px`);
        };
        let k = Math.min(larghezza / TELA_MIN_W, altezza / TELA_MIN_H);
        imposta(k);
        const carta = document.getElementById('pp-carta');
        for (let i = 0; carta && i < 40 && k > 0.3 && (sfora(carta) || (k > K_MIN_PALCO && rapportoPalco() < RAPPORTO_PALCO_MIN)); i++) {
            k *= 0.97;
            imposta(k);
        }
        stato.scala = k;
        if (typeof stato.dopoAdatta === 'function') stato.dopoAdatta();
    }

    let attesaAdatta = 0;
    function adattaSubito() {
        cancelAnimationFrame(attesaAdatta);
        attesaAdatta = requestAnimationFrame(adattaSchermo);
    }
    window.addEventListener('resize', adattaSubito);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(adattaSubito);

    // ---- Effetto "carta olografica" -----------------------------------------------------------

    function attivaInclinazione() {
        const carta = document.getElementById('pp-carta');
        if (!carta || !window.matchMedia('(hover: hover)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let attesa = 0;
        carta.addEventListener('pointermove', e => {
            if (stato.modifica || attesa) return;
            attesa = requestAnimationFrame(() => {
                attesa = 0;
                const r = carta.getBoundingClientRect();
                carta.style.setProperty('--mx', ((e.clientX - r.left) / r.width).toFixed(3));
                carta.style.setProperty('--my', ((e.clientY - r.top) / r.height).toFixed(3));
                carta.classList.add('is-sopra');
            });
        });
        carta.addEventListener('pointerleave', () => {
            carta.classList.remove('is-sopra');
            carta.style.setProperty('--mx', '0.5');
            carta.style.setProperty('--my', '0.5');
        });
    }

    // ---- Tooltip che non escono dallo schermo -------------------------------------------------

    function tieniTooltipInSchermo(e) {
        const host = e.target.closest && e.target.closest('.pp-tip-host');
        const tip = host && host.querySelector(':scope > .neubrutal-tooltip');
        if (!tip) return;
        host.classList.remove('pp-tip-su');
        tip.style.setProperty('--dx', '0px');
        let r = tip.getBoundingClientRect();
        const margine = 10, larghezza = document.documentElement.clientWidth, altezza = document.documentElement.clientHeight;
        // in basso non c'è posto (la tela arriva al bordo della finestra): si apre verso l'alto
        if (r.bottom > altezza - margine && host.getBoundingClientRect().top > r.height + margine) {
            host.classList.add('pp-tip-su');
            r = tip.getBoundingClientRect();
        }
        let dx = 0;
        if (r.left < margine) dx = margine - r.left;
        else if (r.right > larghezza - margine) dx = larghezza - margine - r.right;
        tip.style.setProperty('--dx', `${Math.round(dx)}px`);
    }
    document.addEventListener('mouseover', tieniTooltipInSchermo);
    document.addEventListener('focusin', tieniTooltipInSchermo);

    // ---- Proprietario -------------------------------------------------------------------------

    /** Chi è loggato? Se è il proprietario di questa pagina compare il pulsante per modificarla. */
    function controllaProprietario() {
        const utente = String(window.__nomeUtente || '').toLowerCase().trim();
        if (!stato.dati || !utente || utente !== String(stato.dati.chiave).toLowerCase()) return;
        stato.proprietario = true;
        if (document.getElementById('pp-modifica-btn')) return;
        // dal profilo si arriva con ?edit=1: l'editor si apre da solo, una volta
        const daProfilo = new URLSearchParams(window.location.search).get('edit') === '1';
        if (daProfilo) setTimeout(apriEditor, 300);
        (document.getElementById('pp-nav') || document.body).append(h('button', { id: 'pp-modifica-btn', class: 'pp-modifica-btn', type: 'button', onclick: apriEditor },
            h('span', { class: 'pp-modifica-icona', 'aria-hidden': 'true', testo: '✎' }), ' CUSTOMIZE'));
        adattaSubito();
    }

    // L'editor (con la scheda Trainer) si scarica solo quando serve, solo al proprietario
    let caricamentoEditor = null;
    function caricaScript(src) {
        return new Promise((ok, no) => document.head.append(h('script', { src, onload: ok, onerror: () => no(new Error(src)) })));
    }
    function apriEditor() {
        if (!caricamentoEditor) {
            document.head.append(h('link', { rel: 'stylesheet', href: 'style-public-editor.css' }));
            caricamentoEditor = caricaScript('public-editor.js').then(() => caricaScript('public-editor-trainer.js'))
                .catch(err => { caricamentoEditor = null; throw err; });
        }
        caricamentoEditor.then(() => window.PublicEditor.apri(window.PublicCard)).catch(() => alert('Could not load the editor. Try again.'));
    }

    // ---- Montaggio ----------------------------------------------------------------------------

    /**
     * @param {object} d  chiave, nome, colore, info, badges, stagioni, tipi, pokemon, teams, tutti (il nodo players)
     */
    const COSTRUTTORI = {
        palco: d => costruisciPalco(d),
        identita: d => costruisciIdentita(d),
        statistiche: () => costruisciStatistiche(),
        party: () => costruisciParty(),
        trofei: d => costruisciTrofei(d),
        medaglie: d => costruisciMedaglie(d),
        musica: d => costruisciMusica(d),
        personalita: d => costruisciPersonalita(d)
    };

    function preparaBlocco(id, el) {
        el.style.setProperty('--b', Object.keys(COSTRUTTORI).indexOf(id));
        // in modifica un blocco spento si riaccende toccandolo
        el.addEventListener('click', () => {
            if (stato.modifica && el.classList.contains('pp-spento') && window.PublicEditor) window.PublicEditor.accendi(id);
        });
    }

    /** Rifà un blocco da capo (cambiati i dati da cui dipende) e lo rimette dov'era */
    function ricostruisci(id) {
        const vecchio = stato.blocchi[id];
        const nuovo = COSTRUTTORI[id](stato.dati);
        nuovo.classList.add('pp-ricostruito');      // non rifà l'animazione d'entrata
        preparaBlocco(id, nuovo);
        stato.blocchi[id] = nuovo;
        if (vecchio && vecchio.parentNode) vecchio.replaceWith(nuovo);
    }

    // ---- Profilo: i campi di players/{id}/info che si scelgono nell'editor --------------------------

    // quali blocchi cambiano quando cambia un campo
    const DIPENDE = { avatar: ['palco'], pkmPreferito: ['palco'], bio: ['identita'], title: ['identita'], musicName: ['musica'], musicaPreferita: ['musica'], color: [] };

    function profiloAttuale() {
        const info = stato.dati.info || {};
        return Object.fromEntries(P.CAMPI_PROFILO.map(k => [k, info[k] == null ? '' : String(info[k])]));
    }

    /** Applica subito (anteprima) nuovi valori dei campi del profilo */
    function impostaProfilo(nuovi) {
        const info = stato.dati.info, daFare = new Set();
        for (const k of P.CAMPI_PROFILO) {
            if (!(k in nuovi)) continue;
            const valore = nuovi[k] == null ? '' : String(nuovi[k]);
            if ((info[k] == null ? '' : String(info[k])) === valore) continue;
            info[k] = valore;
            for (const id of DIPENDE[k]) daFare.add(id);
            if (k === 'title') stato.versioneTarghe += 1;      // il titolo può stare anche sul palco
            if (k === 'color') {
                stato.dati.colore = valore || '#31c489';
                if (typeof window.getPlayerPalette === 'function') {
                    const pal = window.getPlayerPalette(stato.dati.colore);
                    for (const [v, c] of [['--accent-color', pal.base], ['--bright-color', pal.bright], ['--dark-color', pal.dark]]) document.documentElement.style.setProperty(v, c);
                }
            }
        }
        for (const id of daFare) ricostruisci(id);
        applica();
    }

    function monta(d) {
        stato.dati = d;
        stato.salvata = P.normalizza(d.info && d.info.pagina);
        stato.config = P.copia(stato.salvata);
        stato.riepilogo = P.riepilogoStat(d.chiave, d.tutti);
        stato.vuoti = {};
        stato.infoSalvata = profiloAttuale();
        stato.zone = Object.fromEntries(ZONE.map(z => [z, document.querySelector(`.pp-zona[data-zona="${z}"]`)]));

        stato.blocchi = {};
        for (const id of Object.keys(COSTRUTTORI)) {
            stato.blocchi[id] = COSTRUTTORI[id](d);
            preparaBlocco(id, stato.blocchi[id]);
        }

        riempiCornice(d);
        applica();
        const carta = document.getElementById('pp-carta');
        carta.classList.add('pp-entra');
        // l'entrata dura meno di un secondo e mezzo: dopo, un blocco rimesso in un'altra riga non deve rifarla (ricomparirebbe da vuoto)
        setTimeout(() => carta.classList.remove('pp-entra'), 1800);
        attivaInclinazione();
        controllaProprietario();
        window.addEventListener('load', adattaSubito);
        setTimeout(adattaSubito, 900);
    }

    function mostraMessaggio(testo) {
        const m = document.getElementById('pp-messaggio');
        if (m) { m.textContent = testo; m.hidden = false; }
        const t = document.getElementById('pp-tela');
        if (t) t.hidden = true;
    }

    window.PublicCard = {
        h, monta, mostraMessaggio, controllaProprietario, musicaAttiva,
        get stato() { return stato; },
        /** Applica una configurazione (anteprima mentre si modifica o ritorno al salvato) */
        imposta(config) { stato.config = P.normalizza(config); applica(); },
        /** Dopo un salvataggio riuscito: quella in vista diventa la salvata */
        salvata(config) { stato.salvata = P.normalizza(config); },
        /** I campi del profilo di adesso (avatar, color, bio, pkmPreferito, title, musicName, musicaPreferita) */
        profilo: profiloAttuale,
        impostaProfilo,
        /** Dopo un salvataggio riuscito: questi valori diventano quelli salvati (e la nuova canzone parte, se può) */
        profiloSalvato(valori) {
            const prima = stato.infoSalvata;
            stato.infoSalvata = { ...profiloAttuale(), ...valori };
            if (prima && prima.musicaPreferita !== stato.infoSalvata.musicaPreferita && stato.infoSalvata.musicaPreferita
                && musicaAttiva() && typeof window.avviaMusicaGiocatore === 'function') window.avviaMusicaGiocatore(stato.infoSalvata.musicaPreferita);
        },
        modifica(on) {
            stato.modifica = !!on;
            document.body.classList.toggle('pp-modifica', stato.modifica);
            if (!stato.modifica) stato.adesivoScelto = -1;
            applica();
        },
        scegliAdesivo(i) { stato.adesivoScelto = i; disegnaAdesivi(); },
        /** Per chi ridimensiona: prova le misure di una configurazione (con il palco ingrandito se serve, come la pagina) senza ridisegnare né adattare la tela */
        provaMisure(config) { return scriviGriglia(P.normalizza(config), true); },
        /** La carta sfora (i blocchi non ci stanno alla scala di adesso)? */
        sfora() { return sfora(document.getElementById('pp-carta')); },
        rapportoPalco, RAPPORTO_PALCO_MIN,
        adatta: adattaSchermo,
        disegnaAdesivi,
        sceltaTeam
    };
})();
