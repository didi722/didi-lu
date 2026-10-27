// =====================================================
// APP — Play: l'hub per giocare (stagioni, amichevoli, contro la CPU)
// ---------------------------------------------------------------------
// La pagina "PLAY" dell'app (practice.html): qui si sceglie come giocare, con tre grandi locandine affiancate:
//   - RANKED: le stagioni in corso. Se ce n'è una sola si apre direttamente, altrimenti si sceglie quale; dentro, i giocatori contro cui mancano ancora
//     showdown da sfidare (formato per formato), le sfide ricevute, gli showdown da riprendere e il tasto per aprire showdown e classifica (Matches);
//   - UNRANKED: le partite amichevoli con un altro allenatore, senza punti. Toccarne uno apre la finestra di sempre (amichevoli.js);
//   - VS CPU: i tuoi team (ognuno gioca nel suo formato) e i Random Battle di Showdown. Si apre battle.html come prima.
// I calcoli sulle stagioni (cosa manca contro chi) sono quelli del profilo (profilo-personale.js); le sfide si lanciano con sfide.js (Sfide.apriSfida).
// Ogni locandina è una scena come quelle del menù (app-scena.js: cielo, figure ferme, effetti che si muovono). Un'immagine propria si mette in immagini/app/play-<ranked|unranked|cpu>.png (o .webp) e prende il posto delle figure.
// La parte pura (cosa mostrare, gli indirizzi, l'HTML) è provata in test/app-practice.test.js; funziona nel browser (window.AppPractice) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const P = fabbrica(inNode ? require('./app-comune.js') : radice.AppComune, inNode ? require('./profilo-personale.js') : radice.ProfiloPersonale, inNode ? require('./app-scena.js') : radice.AppScena);
    if (inNode) module.exports = P;
    else {
        radice.AppPractice = P;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => P.avvia(radice)); else P.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (C, PP, S) {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#31c489');
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const AVATAR_VUOTO = 'immagini/magikarp.png';
    const MIN_SD_CLASSIFICA = 3;                    // come Statistiche.MIN_SD_CLASSIFICA: con meno showdown non si ha un Elo
    const ICONA = nome => (C && C.svg ? C.svg(nome) : '');
    const COLORI_TEAM = ['#ffbd44', '#6fa8ff', '#ff7b6b', '#b388eb', '#31c489', '#ff93c8'];
    const MAX_FORMATI = 3;                          // quanti formati si scrivono su una scheda prima di "+n"

    // ---------- parti pure ----------

    /** I team del giocatore come elenco: id, nome, formato e le specie dei Pokémon (al massimo sei), in ordine di nome. */
    function elencoTeam(dati) {
        const fuori = [];
        for (const [id, t] of Object.entries(dati || {})) {
            if (!t || typeof t !== 'object') continue;
            const lista = Array.isArray(t.pokemon) ? t.pokemon : Object.values(t.pokemon || {});
            fuori.push({
                id,
                nome: String(t.nome || 'Team').trim() || 'Team',
                formato: String(t.categoria || '').trim(),
                specie: lista.map(p => (p && p.nome) || '').filter(Boolean).slice(0, 6)
            });
        }
        return fuori.sort((a, b) => a.nome.toLowerCase().localeCompare(b.nome.toLowerCase()) || a.id.localeCompare(b.id));
    }

    /** Gli altri allenatori per le partite amichevoli (non tu): prima chi ha un Elo, dal più alto; poi per nome. */
    function elencoGiocatori(players, ioId) {
        const io = idDi(ioId);
        const fuori = [];
        for (const [id, g] of Object.entries(players || {})) {
            if (!g || idDi(id) === io) continue;
            const info = g.info || {};
            const ind = (g.stats && g.stats['individual-stats']) || {};
            const classificato = Number(ind.showdownsPlayed || 0) >= MIN_SD_CLASSIFICA && ind.ranking !== undefined;
            fuori.push({ id: idDi(id), nome: String(info.name || id).trim(), avatar: info.avatar || '', colore: info.color || '', elo: classificato ? Math.round(Number(ind.ranking)) : null });
        }
        return fuori.sort((a, b) => ((b.elo != null) - (a.elo != null)) || ((b.elo || 0) - (a.elo || 0)) || a.nome.toLowerCase().localeCompare(b.nome.toLowerCase()));
    }

    /** Dove porta un team contro la CPU */
    const indirizzoTeam = id => 'battle.html?cpu=1&team=' + encodeURIComponent(id);
    /** Dove porta un Random Battle contro la CPU (`formato`: una voce di FormatoRandom.FORMATI) */
    const indirizzoRandom = formato => 'battle.html?cpu=1&random=' + encodeURIComponent(formato.id) + '&nome=' + encodeURIComponent(formato.nome);
    /** Dove si riprende uno showdown (come linkBattaglia di sfide.js) */
    const indirizzoShowdown = (stagione, id, match) => 'battle.html?stagione=' + encodeURIComponent(stagione) + '&showdown=' + encodeURIComponent(id) + '&match=' + encodeURIComponent(match || 1);
    /** Showdown e classifica di una stagione (la pagina Matches) */
    const indirizzoStagione = id => 'matches.html?id=' + encodeURIComponent(id);

    const VISTE = ['home', 'ranked', 'cpu', 'amichevole'];

    // ----- le stagioni (ranked) -----

    /** Una stagione con le iscrizioni scadute è già in corso, anche se nel database c'è ancora scritto "open" (come nella home del sito) */
    function normalizzaInfo(info, adesso) {
        const i = info && typeof info === 'object' ? { ...info } : {};
        let st = String(i.status || 'open').toLowerCase().trim();
        if (st === 'open' && i.deadline && (adesso == null ? Date.now() : adesso) >= new Date(i.deadline).getTime()) st = 'playing';
        i.status = st;
        return i;
    }

    /** Le stagioni in corso tra tutte quelle trovate (`[{ id, info }]`, la più vecchia per prima): quelle in cui si gioca adesso, con lo stato già sistemato */
    function stagioniInCorso(trovate, adesso) {
        return (trovate || []).filter(x => x && x.info).map(x => ({ id: x.id, info: normalizzaInfo(x.info, adesso) })).filter(x => x.info.status === 'playing');
    }

    /**
     * Per ogni stagione in corso: a che punto sono io e cosa c'è da fare. `stagioni`: { id: { info, iscritti, showdowns } }, `sfide`: { id: { idSfida: {...} } } (come profile.html).
     * Il risultato è la più recente per prima: { id, nome, iscritto, giocati, richiesti, scadenza, mancanti, ricevute, inviate, inCorso }; `mancanti` sono i giocatori
     * ancora da sfidare (nelle stagioni senza tetto per formato, tutti gli altri iscritti).
     */
    function riepilogoRanked(io, stagioni, sfide, adesso) {
        const e = idDi(io);
        if (!PP || !e) return [];
        const d = PP.daFare(e, stagioni, sfide);
        const per = (lista, id) => (lista || []).filter(x => x.stagione === id);
        return (d.stagioni || []).filter(s => s.stato === 'PLAYING').map(s => {
            let mancanti = per(d.mancanti, s.id);
            if (s.iscritto && !s.richiesti) {      // senza tetto per formato non c'è un "mancano": si può sfidare chiunque
                const S = (stagioni || {})[s.id] || {};
                const formati = PP.formatiStagione(S.info);
                mancanti = PP.nomiIscritti(S.iscritti).filter(n => idDi(n) !== e).map(n => ({
                    stagione: s.id, nomeStagione: s.nome, avversario: idDi(n), nome: n, totale: Infinity,
                    formati: formati.map(formato => ({ formato, rimasti: Infinity, occupato: false }))
                }));
            }
            return { ...s, mancanti, ricevute: per(d.sfideRicevute, s.id), inviate: per(d.sfideInviate, s.id), inCorso: per(d.inCorso, s.id), adesso: adesso == null ? Date.now() : adesso };
        }).reverse();
    }

    /** Quante cose aspettano una mossa di chi gioca in una stagione: sfide ricevute, showdown da riprendere, giocatori da sfidare */
    const dafare = s => (s ? s.ricevute.length + s.inCorso.length + s.mancanti.filter(m => m.formati.some(f => !f.occupato)).length : 0);

    /** La riga sotto il tag RANKED nella locandina: com'è la situazione */
    function sottoRanked(stagioni) {
        const l = stagioni || [];
        if (!l.length) return 'No season in progress';
        if (l.length > 1) return l.length + ' seasons in progress';
        const n = dafare(l[0]);
        return l[0].nome + (n ? ' · ' + n + ' to do' : '');
    }

    // ----- l'HTML: la scelta -----

    const LOCANDINE = [
        { id: 'ranked', vista: 'ranked', et: 'Ranked', icona: 'matches', colore: '#ffbd44' },
        { id: 'unranked', vista: 'amichevole', et: 'Unranked', icona: 'amici', colore: '#ff93c8', sotto: 'Friendly matches, no points' },
        { id: 'cpu', vista: 'cpu', et: 'VS CPU', icona: 'cpu', colore: '#6fa8ff', sotto: 'Practice on your own' }
    ];

    /** Gli indirizzi da provare, in ordine, per l'immagine di una locandina */
    const immaginiDi = id => ['immagini/app/play-' + id + '.png', 'immagini/app/play-' + id + '.webp'];

    /**
     * La scelta iniziale: tre locandine affiancate, ognuna con la sua immagine (o l'icona grande), l'alone nel suo colore e il tag col nome.
     * `ranked`: le stagioni in corso (per la riga sotto il tag e il numero di cose da fare), se già caricate.
     */
    function htmlHome({ ranked } = {}) {
        return '<div class="pr-home">' + LOCANDINE.map((l, i) => {
            const sotto = l.id === 'ranked' ? (ranked ? sottoRanked(ranked) : 'Seasons') : l.sotto;
            const n = l.id === 'ranked' && ranked ? ranked.reduce((t, s) => t + s.ricevute.length + s.inCorso.length, 0) : 0;
            return `<button type="button" class="pr-poster pr-p-${l.id}" data-vista="${l.vista}"${l.id === 'ranked' ? ' data-stagione=""' : ''} style="--c:${l.colore}; --i:${i}" data-suono="scegli">
                <span class="pr-arte">${S.htmlScena(S.LOCANDINE[l.id], { indice: i, scintille: 8, escF: esc, immagine: `<img class="pr-img" data-id="${l.id}" alt="" hidden>` })}${n ? `<i class="pr-bolla" aria-label="${n} waiting">${n}</i>` : ''}</span>
                <b class="pr-tag"><span>${esc(l.et)}</span></b><small class="pr-sotto-tag">${esc(sotto)}</small>
            </button>`;
        }).join('') + '</div>';
    }

    const testa = (titolo, sotto, indietro) => `<header class="pr-testa">
            <button type="button" class="pr-torna" data-vista="${esc(indietro && indietro.vista || 'home')}"${indietro && indietro.stagione != null ? ` data-stagione="${esc(indietro.stagione)}"` : ''} data-suono="indietro" aria-label="Back">${ICONA('indietro')}<span>Back</span></button>
            <h2>${esc(titolo)}</h2>${sotto ? `<span class="pr-sotto">${esc(sotto)}</span>` : ''}
        </header>`;

    const mini = (specie, dex) => specie.map(s => `<img class="pr-mini" src="${esc(dex ? dex(s) : '')}" alt="" onerror="this.style.visibility='hidden'">`).join('');

    // ----- l'HTML: ranked -----

    const palco = avatar => `<span class="pr-palco" aria-hidden="true"><span class="pal-aura"></span><span class="pal-pedana"></span><img class="pr-avatar" draggable="false" src="${esc(avatar || AVATAR_VUOTO)}" alt="" onerror="this.onerror=null;this.src='${AVATAR_VUOTO}'"></span>`;

    /** I formati su una scheda ("OU ×2"), al massimo MAX_FORMATI, poi "+n"; chi ha già qualcosa di attivo in quel formato è spento */
    function htmlFormati(formati) {
        const l = formati || [];
        const visti = l.slice(0, MAX_FORMATI).map(f => `<i class="pr-fm${f.occupato ? ' pr-fm-su' : ''}">${esc(f.formato)}${f.rimasti === Infinity ? '' : ` <b>×${f.rimasti}</b>`}</i>`).join('');
        return `<span class="pr-formati">${visti}${l.length > MAX_FORMATI ? `<i class="pr-fm">+${l.length - MAX_FORMATI}</i>` : ''}</span>`;
    }

    /**
     * Una scheda di giocatore dentro la stagione. `tipo`: 'ricevuta' (ti ha sfidato: accetta o rifiuta), 'inCorso' (showdown da riprendere), 'mancano' (da sfidare),
     * 'inviata' (aspetta la sua risposta: si può ritirare). `info(id)`: avatar e colore del giocatore.
     */
    function htmlSchedaRanked(tipo, x, stagione, info) {
        const g = info ? info(x.avversario) || {} : {};
        const nome = x.nome || x.avversario;
        const etichetta = { ricevuta: 'Challenged you', inCorso: 'In progress', mancano: 'To play', inviata: 'Waiting' }[tipo];
        const classe = { ricevuta: 'pr-s-ricevuta', inCorso: 'pr-s-inCorso', mancano: 'pr-s-mancano', inviata: 'pr-s-inviata' }[tipo];
        let corpo = '', azioni = '';
        if (tipo === 'mancano') {
            const libero = x.formati.some(f => !f.occupato);
            corpo = htmlFormati(x.formati);
            azioni = libero
                ? `<button type="button" class="pr-azione" data-sfida-ranked="${esc(nome)}" data-stagione="${esc(stagione)}" data-suono="apri">Challenge</button>`
                : '<span class="pr-nota">Challenge pending</span>';
        } else if (tipo === 'inCorso') {
            corpo = `<span class="pr-formati"><i class="pr-fm">${esc(x.categoria)}</i><i class="pr-fm">Match ${esc(x.match)} · ${esc(x.mioPunteggio)}</i></span>`;
            azioni = `<a class="pr-azione" href="${esc(indirizzoShowdown(stagione, x.id, x.match))}" data-suono="apri">Resume</a>`;
        } else if (tipo === 'ricevuta') {
            corpo = `<span class="pr-formati"><i class="pr-fm">${esc(x.categoria)}</i><i class="pr-fm">Bo${esc(x.bestOf)}</i></span>`;
            azioni = `<span class="pr-doppia"><button type="button" class="pr-azione" data-risposta="accetta" data-sfida-id="${esc(x.id)}" data-stagione="${esc(stagione)}" data-suono="ok">Accept</button><button type="button" class="pr-azione pr-no" data-risposta="rifiuta" data-sfida-id="${esc(x.id)}" data-stagione="${esc(stagione)}" data-suono="indietro">Decline</button></span>`;
        } else {
            corpo = `<span class="pr-formati"><i class="pr-fm">${esc(x.categoria)}</i></span>`;
            azioni = `<button type="button" class="pr-azione pr-no" data-risposta="ritira" data-sfida-id="${esc(x.id)}" data-stagione="${esc(stagione)}" data-suono="indietro">Withdraw</button>`;
        }
        return `<article class="pr-sfida ${classe}" style="--c:${coloreSicuro(g.color || g.colore)}">
            <span class="pr-etichetta">${etichetta}</span>${palco(g.avatar)}
            <b class="pr-nome">${esc(nome)}</b>${corpo}${azioni}
        </article>`;
    }

    /** La stagione scelta: l'avanzamento, il tasto per showdown e classifica, e le schede (sfide ricevute, da riprendere, da sfidare, in attesa) che scorrono di lato */
    function htmlRankedStagione(s, { info, indietro } = {}) {
        const pct = s.richiesti ? Math.min(100, Math.round((s.giocati / s.richiesti) * 100)) : 0;
        const resto = s.scadenza && PP ? PP.tempoRimasto(s.scadenza, s.adesso) : '';
        const schede = [
            ...s.ricevute.map(x => htmlSchedaRanked('ricevuta', x, s.id, info)),
            ...s.inCorso.map(x => htmlSchedaRanked('inCorso', x, s.id, info)),
            ...s.mancanti.map(x => htmlSchedaRanked('mancano', x, s.id, info)),
            ...s.inviate.map(x => htmlSchedaRanked('inviata', x, s.id, info))
        ];
        const vuoto = !s.iscritto
            ? 'You are not in this season. You can still follow showdowns and rankings.'
            : (schede.length ? '' : 'You have played everyone. Nothing left to challenge!');
        return `<div class="pr-vista">${testa('Ranked', s.nome, indietro)}
            <div class="pr-barra-stagione">
                <span class="pr-avanza">${s.richiesti
                    ? `<span class="pr-barra" role="progressbar" aria-valuemin="0" aria-valuemax="${s.richiesti}" aria-valuenow="${s.giocati}"><i style="width:${pct}%"></i></span><b>${s.giocati} / ${s.richiesti} <small>showdowns played</small></b>`
                    : `<b>${s.giocati} <small>showdowns played</small></b>`}${resto ? `<small class="pr-resto">${esc(resto)} left</small>` : ''}</span>
                <a class="pr-bottone-g" href="${esc(indirizzoStagione(s.id))}" data-suono="apri">Showdowns &amp; rankings</a>
            </div>
            <div class="pr-corpo">${schede.length ? `<div class="pr-griglia pr-g-giocatori pr-g-sfide">${schede.join('')}</div>` : ''}${vuoto ? `<p class="pr-vuoto">${esc(vuoto)}</p>` : ''}</div></div>`;
    }

    /** Più stagioni in corso: si sceglie quale aprire (la più recente per prima), con le stesse locandine della scelta iniziale: nel disco i showdown giocati, sotto il tag col nome */
    function htmlRankedScelta(stagioni) {
        const l = stagioni || [];
        const carte = l.map((s, i) => {
            const n = s.ricevute.length + s.inCorso.length;
            const sotto = dafare(s) ? dafare(s) + ' to do' : (s.iscritto ? 'All done' : 'Not registered');
            return `<button type="button" class="pr-poster pr-stagione" data-vista="ranked" data-stagione="${esc(s.id)}" style="--c:${COLORI_TEAM[i % COLORI_TEAM.length]}; --i:${i}" data-suono="scegli">
                <span class="pr-arte"><span class="pr-alone" aria-hidden="true"></span><span class="pr-ico pr-ico-num"><b>${s.giocati}${s.richiesti ? `<small>/${s.richiesti}</small>` : ''}</b><em>played</em></span>${n ? `<i class="pr-bolla" aria-label="${n} waiting">${n}</i>` : ''}</span>
                <b class="pr-tag"><span>${esc(s.nome)}</span></b><small class="pr-sotto-tag">${esc(sotto)}</small>
            </button>`;
        }).join('');
        return `<div class="pr-vista">${testa('Ranked', 'Pick a season')}
            <div class="pr-home pr-home-stagioni" style="--n:${Math.min(Math.max(l.length, 1), 3)}">${carte}</div></div>`;
    }

    /** Nessuna stagione in corso */
    const htmlRankedVuoto = () => `<div class="pr-vista">${testa('Ranked', 'Seasons')}
            <div class="pr-corpo"><p class="pr-vuoto">No season is in progress right now.<br><a href="index.html">See the seasons</a></p></div></div>`;

    // ----- l'HTML: contro la CPU, amichevole -----

    /**
     * Contro la CPU: i team (con `dex(specie)` per gli sprite), poi i Random Battle. `random`: le voci di FormatoRandom.FORMATI.
     * Senza team lo dice e rimanda al Box.
     */
    function htmlCpu({ team, random, dex } = {}) {
        const carte = (team || []).map((t, i) => `<button type="button" class="pr-carta" data-team="${esc(t.id)}" style="--c:${COLORI_TEAM[i % 6]}" data-suono="ok">
                <b class="pr-nome">${esc(t.nome)}</b>${t.formato ? `<span class="pr-tag">${esc(t.formato)}</span>` : ''}
                <span class="pr-mini-riga">${mini(t.specie, dex)}</span>
            </button>`).join('');
        const vuoto = !(team || []).length
            ? '<p class="pr-vuoto">You have no teams yet. <a href="box.html">Build one in the Box</a>, or try a Random Battle.</p>' : '';
        const casuali = (random || []).map(f => `<button type="button" class="pr-chip" data-random="${esc(f.id)}" data-nome="${esc(f.nome)}" data-suono="ok">${esc(f.nome)}</button>`).join('');
        return `<div class="pr-vista">${testa('VS CPU', 'Pick a team')}
            <div class="pr-corpo">
                ${vuoto}<div class="pr-griglia">${carte}</div>
                ${casuali ? `<h3 class="pr-titolo">Random battles <small>no team needed</small></h3><div class="pr-chips">${casuali}</div>` : ''}
            </div></div>`;
    }

    /** Amichevole (unranked): gli altri allenatori, ognuno in piedi sul suo palco tondo (niente sfondo), col nome e l'Elo; si scorre di lato */
    function htmlAmichevole({ giocatori } = {}) {
        const carte = (giocatori || []).map(g => `<button type="button" class="pr-giocatore" data-sfida="${esc(g.nome)}" style="--c:${coloreSicuro(g.colore)}" data-suono="scegli">
                ${palco(g.avatar)}
                <b class="pr-nome">${esc(g.nome)}</b><span class="pr-elo">${g.elo != null ? g.elo + ' <small>Elo</small>' : 'N/A'}</span>
            </button>`).join('');
        return `<div class="pr-vista">${testa('Unranked', 'Pick a trainer')}
            <div class="pr-corpo">${carte ? `<div class="pr-griglia pr-g-giocatori">${carte}</div>` : '<p class="pr-vuoto">There is nobody to play with yet.</p>'}</div></div>`;
    }

    /** Senza accesso: un invito */
    const htmlAccedi = () => `<div class="pr-accedi"><b>Log in to play</b><small>Your teams and your friends are waiting.</small>
            <button type="button" class="pr-bottone" data-accedi="1" data-suono="apri">Log in</button></div>`;
    const htmlCarico = () => '<div class="pr-carico" role="status"><i class="pr-ball" aria-hidden="true"></i><span>Loading…</span></div>';

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        const pagina = doc && doc.getElementById('practice');
        if (!pagina || !doc.documentElement.classList.contains('app-shell')) return null;
        const db = () => win.firebase.database();
        const dex = win.SpritePkm ? s => (typeof win.SpritePkm.gif === 'function' ? win.SpritePkm.gif(s) : win.SpritePkm.dex(s)) : null;      // i Pokémon si muovono (GIF), non figurine ferme
        const stato = { vista: 'home', io: null, utente: false, pronto: false, team: null, giocatori: null, players: null, stagioni: null, sfide: {}, ranked: null, stagione: null };
        let ascolti = [];

        const info = id => { const g = stato.players && stato.players[idDi(id)]; return g && g.info ? g.info : null; };

        const caricaImmagini = () => {
            pagina.querySelectorAll('.pr-img').forEach(img => {
                const prove = immaginiDi(img.dataset.id);
                let k = 0;
                img.addEventListener('load', () => { img.hidden = false; img.closest('.pr-arte').classList.add('ha-immagine'); });
                img.addEventListener('error', () => { k += 1; if (k < prove.length) img.src = prove[k]; });
                img.src = prove[0];
            });
        };

        const ricalcolaRanked = () => {
            stato.ranked = riepilogoRanked(stato.io, stato.stagioni, stato.sfide, Date.now());
        };

        // se l'HTML è identico a quello già in pagina non si tocca niente: ogni ridisegno inutile rifaceva le locandine (immagini, entrata) e sembrava che si caricassero due volte
        let ultimo = null;
        const metti = html => { if (html === ultimo) return false; ultimo = html; pagina.innerHTML = html; return true; };
        const disegna = () => {
            pagina.dataset.vista = stato.vista;
            if (!stato.pronto) { metti(htmlCarico()); return; }
            if (!stato.utente) { metti(htmlAccedi()); return; }
            if (stato.vista === 'cpu') {
                if (!stato.team) { metti(htmlCarico()); return; }
                metti(htmlCpu({ team: stato.team, random: win.FormatoRandom ? win.FormatoRandom.FORMATI : [], dex }));
            } else if (stato.vista === 'amichevole') {
                if (!stato.giocatori) { metti(htmlCarico()); return; }
                metti(htmlAmichevole({ giocatori: stato.giocatori }));
            } else if (stato.vista === 'ranked') {
                if (!stato.ranked) { metti(htmlCarico()); return; }
                const l = stato.ranked;
                const scelta = l.find(s => s.id === stato.stagione) || (l.length === 1 ? l[0] : null);
                if (!l.length) metti(htmlRankedVuoto());
                else if (!scelta) metti(htmlRankedScelta(l));
                else metti(htmlRankedStagione(scelta, { info, indietro: l.length > 1 ? { vista: 'ranked', stagione: '' } : { vista: 'home' } }));
            } else {
                // la schermata di scelta compare quando i dati ci sono (una volta sola), non prima e poi di nuovo
                if (stato.io && !stato.ranked) { metti(htmlCarico()); return; }
                if (metti(htmlHome({ ranked: stato.ranked }))) caricaImmagini();
            }
        };

        const staccaAscolti = () => { ascolti.forEach(([ref, fn]) => ref.off('value', fn)); ascolti = []; };
        let pianificato = false;
        const ridisegnaPresto = () => {
            if (pianificato) return;
            pianificato = true;
            win.setTimeout(() => { pianificato = false; ricalcolaRanked(); if (stato.vista === 'ranked' || stato.vista === 'home') disegna(); }, 60);
        };

        /** Le stagioni in corso con showdown e sfide dal vivo (cambiano mentre si guarda: una sfida accettata, uno showdown finito) */
        const caricaRanked = async () => {
            if (!stato.io || !win.firebase) return;
            const leggi = percorso => db().ref(percorso).once('value').then(s => s.val());
            const leggiInfo = id => leggi('seasons/' + id + '/info').then(i => ({ id, info: i })).catch(() => ({ id, info: null }));
            try {
                const tutte = [await leggiInfo('sbeta')];
                for (let da = 0; da < 200; da += 10) {
                    const blocco = await Promise.all(Array.from({ length: 10 }, (_, i) => leggiInfo('s' + (da + i))));
                    tutte.push(...blocco);
                    if (!blocco[blocco.length - 1].info) break;
                }
                const inCorso = stagioniInCorso(tutte, Date.now());
                staccaAscolti();
                stato.stagioni = {}; stato.sfide = {};
                // prima tutte le stagioni, in ordine (le letture finiscono quando vogliono): poi si riempiono
                inCorso.forEach(({ id, info: i }) => { stato.stagioni[id] = { info: i, iscritti: {}, teams_iscritti: {}, showdowns: {} }; stato.sfide[id] = {}; });
                const [players] = await Promise.all([stato.players ? stato.players : leggi('players'), ...inCorso.map(async ({ id }) => {
                    stato.stagioni[id].iscritti = (await leggi('seasons/' + id + '/iscritti').catch(() => null)) || {};
                    const segui = (percorso, applica) => new Promise(ok => {
                        let primo = true;
                        const ref = db().ref(percorso);
                        const fn = snap => { applica(snap.val() || {}); if (primo) { primo = false; ok(); } else ridisegnaPresto(); };
                        ref.on('value', fn, () => { if (primo) { primo = false; ok(); } });
                        ascolti.push([ref, fn]);
                    });
                    await Promise.all([
                        segui('seasons/' + id + '/showdowns', v => { stato.stagioni[id].showdowns = v; }),
                        segui('sfide/' + id, v => { stato.sfide[id] = v; })
                    ]);
                })]);
                stato.players = players || {};
                ricalcolaRanked();
            } catch (e) {
                stato.ranked = [];
            }
        };

        const vai = async vista => {
            if (!VISTE.includes(vista)) return;
            stato.vista = vista;
            disegna();
            try {
                if (vista === 'cpu' && stato.io && !stato.team) {
                    stato.team = elencoTeam((await db().ref('players/' + stato.io + '/teams').once('value')).val());
                    if (stato.vista === 'cpu') disegna();
                } else if (vista === 'amichevole' && !stato.giocatori) {
                    if (!stato.players) stato.players = (await db().ref('players').once('value')).val() || {};
                    stato.giocatori = elencoGiocatori(stato.players, stato.io);
                    if (stato.vista === 'amichevole') disegna();
                } else if (vista === 'ranked' && stato.io && !stato.ranked) {
                    await caricaRanked();
                    if (stato.vista === 'ranked') disegna();
                }
            } catch (e) {
                ultimo = null; pagina.innerHTML = '<p class="pr-vuoto">Couldn\'t load this. Check your connection and try again.</p>';
            }
        };

        pagina.addEventListener('click', async e => {
            const el = e.target.closest ? e.target.closest('[data-vista],[data-team],[data-random],[data-sfida],[data-sfida-ranked],[data-risposta],[data-accedi]') : null;
            if (!el) return;
            if (el.dataset.vista) {
                if (el.dataset.stagione != null) stato.stagione = el.dataset.stagione || null;
                else if (el.dataset.vista !== 'ranked') stato.stagione = null;
                return vai(el.dataset.vista);
            }
            if (el.dataset.team) { win.location.href = indirizzoTeam(el.dataset.team); return; }
            if (el.dataset.random) {
                const f = win.FormatoRandom && win.FormatoRandom.trova(el.dataset.random);
                if (f) win.location.href = indirizzoRandom(f);
                return;
            }
            if (el.dataset.sfida) { if (win.Amichevoli) win.Amichevoli.apri(el.dataset.sfida); return; }
            if (el.dataset.sfidaRanked) { if (win.Sfide) win.Sfide.apriSfida(el.dataset.sfidaRanked, el.dataset.stagione); return; }
            if (el.dataset.risposta) {
                if (!win.Sfide) return;
                el.disabled = true;
                try { await win.Sfide.rispondi(el.dataset.stagione, el.dataset.sfidaId, el.dataset.risposta); } finally { ridisegnaPresto(); }
                return;
            }
            if (el.dataset.accedi && typeof win.handleAuthClick === 'function') win.handleAuthClick();
        });

        if (win.firebase && win.firebase.apps && win.firebase.apps.length) {
            win.firebase.auth().onAuthStateChanged(async user => {
                staccaAscolti();
                stato.team = null; stato.giocatori = null; stato.ranked = null; stato.stagioni = null; stato.players = null; stato.stagione = null;
                const r = user && C ? await C.leggiGiocatore(win, user) : null;
                stato.utente = !!(r && r.giocatore);
                stato.io = stato.utente ? r.giocatore.id : null;
                stato.pronto = true;
                disegna();
                if (stato.utente) { await caricaRanked(); if (stato.vista === 'home' || stato.vista === 'ranked') disegna(); }
            });
        } else { stato.pronto = true; disegna(); }
        disegna();
        return { vai, stato };
    }

    return {
        VISTE, LOCANDINE, elencoTeam, elencoGiocatori, indirizzoTeam, indirizzoRandom, indirizzoShowdown, indirizzoStagione, immaginiDi,
        normalizzaInfo, stagioniInCorso, riepilogoRanked, dafare, sottoRanked,
        htmlHome, htmlRankedStagione, htmlRankedScelta, htmlRankedVuoto, htmlSchedaRanked, htmlFormati, htmlCpu, htmlAmichevole, htmlAccedi, avvia
    };
});
