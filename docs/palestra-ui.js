// =====================================================
// PALESTRA — la pagina (palestra.html)
//
//   palestra.html?edit=1            impostare la propria palestra: 3 format (in ordine), un team del Box per ognuno e un vantaggio per ognuno
//   palestra.html?player=<id>       sfidare la palestra di un altro allenatore: si scelgono subito i 3 team da portare (uno per format, dal proprio Box) e si
//                                   affrontano di fila contro la CPU (battle.html, palestra.js); chi perde una partita ricomincia dalla prima tappa
//
// I team della palestra non si vedono mai da qui: allo sfidante si mostrano solo i format e l'ordine. Le regole (doppio, 6 portati, 4 scelti), i vantaggi e lo stato di chi sfida
// sono di palestra.js (puro, provato in Node); i dati stanno in players/<id>/info/palestra.
// =====================================================
(function () {
    'use strict';

    const P = window.Palestra;
    if (!P) return;

    const $ = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ricerca = new URLSearchParams(window.location.search);

    const S = { uid: '', io: '', regolamenti: {}, mieiTeam: [], bozza: [], gym: '', gymNome: '', gymConfig: null };

    function msg(testo, errore) {
        const m = $('pal-msg');
        m.textContent = testo || ''; m.hidden = !testo; m.classList.toggle('shop-errore', !!errore);
    }

    // ---------------------------------------------------------------- dati
    const nomeTeam = t => String((t && t.nome && typeof t.nome === 'object' ? t.nome.valore : t && t.nome) || 'Team');
    const categoriaDi = t => String((t && (t.categoria || t.category)) || '').toLowerCase().trim();
    const elenco = x => (Array.isArray(x) ? x : Object.values(x || {}));
    async function leggi(percorso) { return (await firebase.database().ref(percorso).once('value')).val(); }

    async function leggiMiei() {
        const [nome, regolamenti] = await Promise.all([leggi(`users/${S.uid}/name`), leggi('regolamenti')]);
        S.io = String(nome || '').toLowerCase().trim();
        S.regolamenti = regolamenti || {};
        const grezzi = (await leggi(`players/${S.io}/teams`)) || {};
        S.mieiTeam = Object.entries(grezzi).filter(([, t]) => t && typeof t === 'object').map(([id, t]) => ({
            id, nome: nomeTeam(t), categoria: String(t.categoria || t.category || ''), quanti: elenco(t.pokemon).filter(p => p && p.nome).length
        }));
    }
    const formatiDoppi = () => Object.entries(S.regolamenti).filter(([, r]) => r && r.categoria && P.eDoppio(r)).sort((a, b) => String(a[1].categoria).localeCompare(String(b[1].categoria)));
    const teamPer = categoria => S.mieiTeam.filter(t => t.categoria.toLowerCase().trim() === String(categoria || '').toLowerCase().trim() && t.quanti > 0);
    const opzioni = (lista, scelto, vuoto) => `<option value="">${esc(vuoto)}</option>` + lista.map(([v, testo]) => `<option value="${esc(v)}"${v === scelto ? ' selected' : ''}>${esc(testo)}</option>`).join('');

    // ---------------------------------------------------------------- impostare la propria palestra
    function disegnaImposta() {
        const tappe = S.bozza.map((t, i) => {
            const r = S.regolamenti[t.formato];
            const vantaggi = r ? P.vantaggiPer(P.generazioneDi(r)) : [];
            const v = P.perId(t.vantaggio);
            const gruppo = tipo => vantaggi.filter(x => x.tipo === tipo).map(x => [x.id, x.nome]);
            const optV = `<option value="">Pick an advantage</option><optgroup label="Field effects">${gruppo('campo').map(([id, n]) => `<option value="${esc(id)}"${id === t.vantaggio ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`
                + `<optgroup label="Boosts">${gruppo('boost').map(([id, n]) => `<option value="${esc(id)}"${id === t.vantaggio ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`;
            return `<article class="pal-tappa" data-i="${i}">
                <header><h3>Stage ${i + 1}</h3><span class="pal-ordine"><button type="button" class="ng-bottone" data-az="su" aria-label="Move stage ${i + 1} up"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" class="ng-bottone" data-az="giu" aria-label="Move stage ${i + 1} down"${i === S.bozza.length - 1 ? ' disabled' : ''}>▼</button></span></header>
                <label>Format<select data-campo="formato">${opzioni(formatiDoppi().map(([k, x]) => [k, x.categoria]), t.formato, 'Pick a format')}</select></label>
                <label>Team<select data-campo="team"${r ? '' : ' disabled'}>${opzioni(r ? teamPer(r.categoria).map(x => [x.id, `${x.nome} (${x.quanti})`]) : [], t.team, r ? (teamPer(r.categoria).length ? 'Pick a team from your Box' : 'You have no team for this format') : 'Pick a format first')}</select></label>
                <label>Advantage<select data-campo="vantaggio"${r ? '' : ' disabled'}>${optV}</select></label>
                <p class="pal-descr">${v ? esc(v.descr) : 'It starts at the beginning of the battle, before turn 1.'}</p>
            </article>`;
        }).join('');
        $('pal-corpo').innerHTML = `<h2 class="pal-titolo">Build your gym</h2>
            <p class="pal-aiuto">Three stages, three doubles formats, one team each: pick them, and the order challengers will face them in. Every stage also hands you an edge that kicks in before turn 1 (a tailwind, a storm, a power-up…). The CPU plays your teams straight from your Box, so tweak a team and the gym changes with it. Challengers never get to peek at your teams. Make it tough!</p>
            <div class="pal-tappe">${tappe}</div>
            <div class="pal-azioni"><button type="button" class="ng-bottone ng-compra" id="pal-salva">Save my gym</button><button type="button" class="ng-bottone" id="pal-togli">Remove my gym</button><a class="ng-bottone pal-link" href="public.html?player=${encodeURIComponent(S.io)}">Back to my page</a></div>`;
    }

    function bozzaDa(config) {
        const salvate = P.tappeDi(config);
        return Array.from({ length: P.TAPPE }, (_, i) => salvate[i] || { formato: '', categoria: '', team: '', vantaggio: '' });
    }

    function collegaImposta() {
        const c = $('pal-corpo');
        c.addEventListener('change', e => {
            const sel = e.target.closest('select[data-campo]');
            if (!sel) return;
            const i = Number(sel.closest('.pal-tappa').dataset.i), t = S.bozza[i], campo = sel.dataset.campo;
            t[campo] = sel.value;
            if (campo === 'formato') {
                // cambiando format il team e il vantaggio si riscelgono (il team deve essere di quel format, il vantaggio deve esistere nella sua generazione)
                const r = S.regolamenti[t.formato];
                t.categoria = r ? String(r.categoria) : '';
                if (!r || !teamPer(r.categoria).some(x => x.id === t.team)) t.team = '';
                if (!r || !P.vantaggiPer(P.generazioneDi(r)).some(x => x.id === t.vantaggio)) t.vantaggio = '';
            }
            disegnaImposta();
        });
        c.addEventListener('click', async e => {
            const b = e.target.closest('button, a');
            if (!b || b.disabled) return;
            if (b.dataset.az) {
                const i = Number(b.closest('.pal-tappa').dataset.i), j = b.dataset.az === 'su' ? i - 1 : i + 1;
                if (j < 0 || j >= S.bozza.length) return;
                [S.bozza[i], S.bozza[j]] = [S.bozza[j], S.bozza[i]];
                return disegnaImposta();
            }
            if (b.id === 'pal-salva') {
                const config = { tappe: S.bozza.map(t => ({ ...t, categoria: (S.regolamenti[t.formato] || {}).categoria || '' })) };
                const problemi = P.problemi(config, { regolamenti: S.regolamenti, teams: S.mieiTeam.map(t => ({ id: t.id, categoria: t.categoria })) });
                if (problemi.length) return msg(problemi[0], true);
                try { await firebase.database().ref(`players/${S.io}/info/palestra`).set(config); msg('Your gym is open for business. Challengers, beware!'); } catch (err) { msg("Couldn't save: check your connection and try again.", true); }
            }
            if (b.id === 'pal-togli') {
                try { await firebase.database().ref(`players/${S.io}/info/palestra`).remove(); S.bozza = bozzaDa(null); msg('Your gym is closed. See you next time!'); disegnaImposta(); } catch (err) { msg("Couldn't remove it: try again.", true); }
            }
        });
    }

    // ---------------------------------------------------------------- sfidare la palestra di un altro
    function disegnaSfida() {
        const tappe = P.tappeDi(S.gymConfig);
        const chiave = P.chiaveSfida(S.io, S.gym);
        const sfida = P.leggiSfida(window.localStorage, chiave) || P.nuovaSfida([]);
        const vinte = sfida.vinte;
        const finita = P.finita(sfida);
        const carte = tappe.map((t, i) => {
            const stato = i < vinte ? 'done' : i === vinte ? 'next' : 'lock';
            const miei = teamPer(t.categoria);
            const scelto = sfida.squadre[i] && miei.some(x => x.id === sfida.squadre[i]) ? sfida.squadre[i] : '';
            return `<article class="pal-tappa pal-${stato}" data-i="${i}">
                <header><h3>Stage ${i + 1}</h3><span class="pal-stato">${stato === 'done' ? '✓ Cleared' : stato === 'next' ? '▶ Up next' : '🔒 Locked'}</span></header>
                <p class="pal-formato">${esc(t.categoria)}</p>
                <label>Your team<select data-squadra="${i}">${opzioni(miei.map(x => [x.id, `${x.nome} (${x.quanti})`]), scelto, miei.length ? 'Pick a team from your Box' : 'You have no team for this format')}</select></label>
            </article>`;
        }).join('');
        $('pal-corpo').innerHTML = `<h2 class="pal-titolo">${esc(S.gymNome)}'s gym</h2>
            <p class="pal-aiuto">${P.TAPPE} stages, one after the other, against teams you've never seen. Every battle is doubles: bring 6, pick 4. And no pressure, but one defeat sends you right back to stage 1! Choose the team you'll bring for each format, then walk in.</p>
            <div class="pal-tappe">${carte}</div>
            <div class="pal-azioni">
                <button type="button" class="ng-bottone ng-compra" id="pal-via">${finita ? 'Take it on again' : vinte > 0 ? `On to stage ${vinte + 1}` : 'Enter the gym'}</button>
                ${vinte > 0 && !finita ? '<button type="button" class="ng-bottone" id="pal-da-capo">Start over</button>' : ''}
                <a class="ng-bottone pal-link" href="public.html?player=${encodeURIComponent(S.gym)}">Back to ${esc(S.gymNome)}'s page</a>
            </div>`;
    }

    function collegaSfida() {
        const c = $('pal-corpo');
        const squadreScelte = () => [...c.querySelectorAll('select[data-squadra]')].map(s => s.value);
        const salva = vinte => {
            const sfida = { squadre: squadreScelte(), vinte };
            P.salvaSfida(window.localStorage, P.chiaveSfida(S.io, S.gym), sfida);
            return sfida;
        };
        const parti = vinte => {
            const sq = squadreScelte();
            if (sq.some(x => !x)) return msg('Pick a team for every stage before you walk in!', true);
            const sfida = salva(vinte);
            window.location.href = `battle.html?cpu=1&palestra=${encodeURIComponent(S.gym)}&tappa=${vinte}&team=${encodeURIComponent(sfida.squadre[vinte])}`;
        };
        c.addEventListener('change', e => { if (e.target.matches('select[data-squadra]')) { const att = P.leggiSfida(window.localStorage, P.chiaveSfida(S.io, S.gym)); salva(att ? att.vinte : 0); } });
        c.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            const att = P.leggiSfida(window.localStorage, P.chiaveSfida(S.io, S.gym));
            if (b.id === 'pal-via') parti(att && !P.finita(att) ? att.vinte : 0);
            if (b.id === 'pal-da-capo') { salva(0); disegnaSfida(); msg('Back to stage 1: fresh start!'); }
        });
    }

    // ---------------------------------------------------------------- avvio
    async function avvia(utente) {
        const loader = $('poke-loader'), fine = () => { if (loader) loader.style.display = 'none'; };
        if (!utente) { $('pal-accedi').hidden = false; fine(); return; }
        S.uid = utente.uid;
        try {
            await leggiMiei();
            const altro = String(ricerca.get('player') || '').toLowerCase().trim();
            if (ricerca.get('edit') === '1' || !altro || altro === S.io) {
                S.bozza = bozzaDa(await leggi(`players/${S.io}/info/palestra`));
                $('pal-corpo').hidden = false;
                disegnaImposta(); collegaImposta();
            } else {
                S.gym = altro;
                const [config, nome] = await Promise.all([leggi(`players/${altro}/info/palestra`), leggi(`players/${altro}/info/name`)]);
                S.gymConfig = config; S.gymNome = String(nome || altro);
                $('pal-corpo').hidden = false;
                if (P.tappeDi(config).length !== P.TAPPE) $('pal-corpo').innerHTML = `<h2 class="pal-titolo">${esc(S.gymNome)}'s gym</h2><p class="pal-aiuto">${esc(S.gymNome)} hasn't built a gym yet. Check back soon!</p><div class="pal-azioni"><a class="ng-bottone pal-link" href="public.html?player=${encodeURIComponent(altro)}">Back to ${esc(S.gymNome)}'s page</a></div>`;
                else { disegnaSfida(); collegaSfida(); }
            }
        } catch (e) { msg("Couldn't load the gym. Check your connection and reload the page.", true); }
        fine();
    }
    firebase.auth().onAuthStateChanged(avvia);
})();
