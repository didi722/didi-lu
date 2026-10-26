// =====================================================
// APP — Practice: allenarsi, da soli contro la CPU o con un amico
// ---------------------------------------------------------------------
// La pagina nuova dell'app (practice.html, la tessera accanto a Matches). Tre schermate, una alla volta:
//   - la scelta: contro la CPU, oppure una partita amichevole con un altro allenatore;
//   - contro la CPU: i tuoi team (ognuno gioca nel suo formato) e i Random Battle di Showdown (nessun team da portare). Si apre battle.html come prima;
//   - amichevole: gli altri allenatori. Toccarne uno apre la finestra di sempre (amichevoli.js: formato, serie, team fissi o cambiabili).
// "Practice vs CPU" nel Box e la spada per sfidare un allenatore nella sua scheda non ci sono più nell'app: si parte tutto da qui.
// La parte pura (cosa mostrare, gli indirizzi, l'HTML) è provata in test/app-practice.test.js; funziona nel browser (window.AppPractice) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const P = fabbrica(inNode ? require('./app-comune.js') : radice.AppComune);
    if (inNode) module.exports = P;
    else {
        radice.AppPractice = P;
        const d = radice.document;
        if (d) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => P.avvia(radice)); else P.avvia(radice); }
    }
})(typeof self !== 'undefined' ? self : this, function (C) {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = c => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '#31c489');
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const AVATAR_VUOTO = 'immagini/magikarp.png';
    const MIN_SD_CLASSIFICA = 3;                    // come Statistiche.MIN_SD_CLASSIFICA: con meno showdown non si ha un Elo
    const ICONA = nome => (C && C.svg ? C.svg(nome) : '');

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

    const VISTE = ['home', 'cpu', 'amichevole'];

    /** La scelta iniziale: due grandi tessere */
    function htmlHome() {
        return `<div class="pr-home">
            <button type="button" class="pr-tessera pr-t-cpu" data-vista="cpu" style="--c:#6fa8ff" data-suono="scegli">
                <span class="pr-ico">${ICONA('cpu')}</span><b>VS CPU</b><small>Test your teams against the computer</small>
            </button>
            <button type="button" class="pr-tessera pr-t-amici" data-vista="amichevole" style="--c:#ff93c8" data-suono="scegli">
                <span class="pr-ico">${ICONA('amici')}</span><b>Friendly</b><small>A match with another trainer, no points</small>
            </button>
        </div>`;
    }

    const testa = (titolo, sotto) => `<header class="pr-testa">
            <button type="button" class="pr-torna" data-vista="home" data-suono="indietro" aria-label="Back to Practice">${ICONA('indietro')}<span>Back</span></button>
            <h2>${esc(titolo)}</h2>${sotto ? `<span class="pr-sotto">${esc(sotto)}</span>` : ''}
        </header>`;

    const mini = (specie, dex) => specie.map(s => `<img class="pr-mini" src="${esc(dex ? dex(s) : '')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`).join('');

    /**
     * Contro la CPU: i team (con `dex(specie)` per gli sprite), poi i Random Battle. `random`: le voci di FormatoRandom.FORMATI.
     * Senza team lo dice e rimanda al Box.
     */
    function htmlCpu({ team, random, dex } = {}) {
        const carte = (team || []).map((t, i) => `<button type="button" class="pr-carta" data-team="${esc(t.id)}" style="--c:${['#ffbd44', '#6fa8ff', '#ff7b6b', '#b388eb', '#31c489', '#ff93c8'][i % 6]}" data-suono="ok">
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

    /** Amichevole: gli altri allenatori, ognuno una carta del suo colore */
    function htmlAmichevole({ giocatori } = {}) {
        const carte = (giocatori || []).map(g => `<button type="button" class="pr-giocatore" data-sfida="${esc(g.nome)}" style="--c:${coloreSicuro(g.colore)}" data-suono="scegli">
                <img class="pr-avatar" src="${esc(g.avatar || AVATAR_VUOTO)}" alt="" onerror="this.onerror=null;this.src='${AVATAR_VUOTO}'">
                <b class="pr-nome">${esc(g.nome)}</b><span class="pr-elo">${g.elo != null ? g.elo + ' <small>Elo</small>' : 'N/A'}</span>
            </button>`).join('');
        return `<div class="pr-vista">${testa('Friendly', 'Pick a trainer')}
            <div class="pr-corpo">${carte ? `<div class="pr-griglia pr-g-giocatori">${carte}</div>` : '<p class="pr-vuoto">There is nobody to play with yet.</p>'}</div></div>`;
    }

    /** Senza accesso: un invito */
    const htmlAccedi = () => `<div class="pr-accedi"><b>Log in to practice</b><small>Your teams and your friends are waiting.</small>
            <button type="button" class="pr-bottone" data-accedi="1" data-suono="apri">Log in</button></div>`;
    const htmlCarico = () => '<p class="pr-carico">Loading…</p>';

    // ---------- nella pagina ----------

    function avvia(win) {
        const doc = win.document;
        const pagina = doc && doc.getElementById('practice');
        if (!pagina || !doc.documentElement.classList.contains('app-shell')) return null;
        const db = () => win.firebase.database();
        const dex = win.SpritePkm ? s => win.SpritePkm.dex(s) : null;
        const stato = { vista: 'home', io: null, utente: false, pronto: false, team: null, giocatori: null };

        const disegna = () => {
            pagina.dataset.vista = stato.vista;
            if (!stato.pronto) { pagina.innerHTML = htmlCarico(); return; }
            if (!stato.utente) { pagina.innerHTML = htmlAccedi(); return; }
            if (stato.vista === 'cpu') {
                if (!stato.team) { pagina.innerHTML = htmlCarico(); return; }
                pagina.innerHTML = htmlCpu({ team: stato.team, random: win.FormatoRandom ? win.FormatoRandom.FORMATI : [], dex });
            } else if (stato.vista === 'amichevole') {
                if (!stato.giocatori) { pagina.innerHTML = htmlCarico(); return; }
                pagina.innerHTML = htmlAmichevole({ giocatori: stato.giocatori });
            } else pagina.innerHTML = htmlHome();
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
                    stato.giocatori = elencoGiocatori((await db().ref('players').once('value')).val(), stato.io);
                    if (stato.vista === 'amichevole') disegna();
                }
            } catch (e) {
                pagina.innerHTML = '<p class="pr-vuoto">Couldn\'t load this. Check your connection and try again.</p>';
            }
        };

        pagina.addEventListener('click', e => {
            const el = e.target.closest ? e.target.closest('[data-vista],[data-team],[data-random],[data-sfida],[data-accedi]') : null;
            if (!el) return;
            if (el.dataset.vista) return vai(el.dataset.vista);
            if (el.dataset.team) { win.location.href = indirizzoTeam(el.dataset.team); return; }
            if (el.dataset.random) {
                const f = win.FormatoRandom && win.FormatoRandom.trova(el.dataset.random);
                if (f) win.location.href = indirizzoRandom(f);
                return;
            }
            if (el.dataset.sfida) { if (win.Amichevoli) win.Amichevoli.apri(el.dataset.sfida); return; }
            if (el.dataset.accedi && typeof win.handleAuthClick === 'function') win.handleAuthClick();
        });

        if (win.firebase && win.firebase.apps && win.firebase.apps.length) {
            win.firebase.auth().onAuthStateChanged(async user => {
                stato.team = null; stato.giocatori = null;
                const r = user && C ? await C.leggiGiocatore(win, user) : null;
                stato.utente = !!(r && r.giocatore);
                stato.io = stato.utente ? r.giocatore.id : null;
                stato.pronto = true;
                disegna();
            });
        } else { stato.pronto = true; disegna(); }
        disegna();
        return { vai, stato };
    }

    return { VISTE, elencoTeam, elencoGiocatori, indirizzoTeam, indirizzoRandom, htmlHome, htmlCpu, htmlAmichevole, htmlAccedi, avvia };
});
