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

    const S = { uid: '', io: '', regolamenti: {}, mieiTeam: [], bozza: [], gym: '', gymNome: '', gymConfig: null, passo: 0, scelte: [], tornaARiepilogo: false };
    const SP = window.SpritePkm;

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
            id, nome: nomeTeam(t), categoria: String(t.categoria || t.category || ''), quanti: elenco(t.pokemon).filter(p => p && p.nome).length,
            pokemon: elenco(t.pokemon).filter(p => p && p.nome).map(p => ({ nome: String(p.nome), shiny: !!p.shiny }))
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
    // Un passo per format: "Stage 1 · VGC Gen 9 → scegli il team", poi il 2 e il 3, e infine il riepilogo (passo 3) con i tre team scelti e il tasto per entrare.
    // Con una sfida già cominciata (tappe vinte) si apre direttamente il riepilogo, da cui si può cambiare il team di una tappa e tornare qui.
    const stagioneDa = () => P.leggiSfida(window.localStorage, P.chiaveSfida(S.io, S.gym)) || P.nuovaSfida([]);
    const tappeGym = () => P.tappeDi(S.gymConfig);
    const teamPerId = id => S.mieiTeam.find(t => t.id === id) || null;
    const salvaScelte = () => {
        const att = stagioneDa();
        P.salvaSfida(window.localStorage, P.chiaveSfida(S.io, S.gym), { squadre: S.scelte.slice(0, P.TAPPE), vinte: att.vinte || 0 });
    };
    const sprites = (t, classe = '') => `<span class="pal-sprites ${classe}">${(t.pokemon || []).slice(0, 6).map(p => `<img src="${esc(SP ? SP.gif(p.nome, p.shiny) : '')}" alt="" loading="lazy" draggable="false" data-pkm="${esc(p.nome)}">`).join('')}</span>`;

    function disegnaSfida() {
        const tappe = tappeGym();
        const att = stagioneDa();
        const vinte = att.vinte;
        const finita = P.finita(att);
        const validi = i => { const t = teamPerId(S.scelte[i]); return !!t && tappe[i] && teamPer(tappe[i].categoria).some(x => x.id === t.id); };
        const pronte = tappe.every((_, i) => validi(i));
        const intro = `<h2 class="pal-titolo">${esc(S.gymNome)}'s gym</h2>`;
        const passi = tappe.map((t, i) => {
            const stato = S.passo === i ? 'ora' : validi(i) ? 'fatto' : 'resta';
            return `<li class="pal-passo pal-passo-${stato}"><b>${i + 1}</b><span>${esc(t.categoria)}</span></li>`;
        }).join('') + `<li class="pal-passo pal-passo-${S.passo === P.TAPPE ? 'ora' : 'resta'}"><b>★</b><span>Go!</span></li>`;
        const barra = `<ol class="pal-passi" aria-label="Steps">${passi}</ol>`;

        if (S.passo < P.TAPPE) {
            const i = S.passo, t = tappe[i], miei = teamPer(t.categoria);
            const carte = miei.length ? miei.map(x => `<button type="button" class="pal-squadra${S.scelte[i] === x.id ? ' pal-scelta' : ''}" data-team="${esc(x.id)}" aria-pressed="${S.scelte[i] === x.id}">
                    <span class="pal-squadra-nome">${esc(x.nome)}</span>${sprites(x)}<span class="pal-squadra-spunta" aria-hidden="true">✔</span></button>`).join('')
                : `<p class="pal-vuoto">You don't have a team for <b>${esc(t.categoria)}</b> yet. <a href="box.html">Build one in your Box</a>, then come back!</p>`;
            const ultimo = i === P.TAPPE - 1;
            $('pal-corpo').innerHTML = `${intro}${barra}
                <section class="pal-passo-corpo">
                    <p class="pal-passo-su">Stage ${i + 1} of ${P.TAPPE}</p>
                    <h3 class="pal-passo-titolo">${esc(t.categoria)}</h3>
                    <p class="pal-aiuto">${i === 0 ? "Doubles, bring 6 and pick 4 once you see the opposing team. You won't know what's coming, so choose the team you trust." : 'Now the next format: which team do you bring?'}</p>
                    <div class="pal-squadre">${carte}</div>
                </section>
                <div class="pal-azioni">
                    ${i > 0 || S.tornaARiepilogo ? `<button type="button" class="ng-bottone" data-az="indietro">← ${S.tornaARiepilogo ? 'Cancel' : 'Back'}</button>` : `<a class="ng-bottone pal-link" href="public.html?player=${encodeURIComponent(S.gym)}">← ${esc(S.gymNome)}'s page</a>`}
                    <button type="button" class="ng-bottone ng-compra" data-az="avanti"${validi(i) ? '' : ' disabled'}>${S.tornaARiepilogo ? 'Done ✔' : ultimo ? 'Review →' : `Next: stage ${i + 2} →`}</button>
                </div>`;
            return;
        }
        const righe = tappe.map((t, i) => {
            const stato = i < vinte ? 'done' : i === vinte && !finita ? 'next' : 'lock';
            const x = teamPerId(S.scelte[i]);
            return `<article class="pal-riga pal-${stato}"><span class="pal-riga-num">${i + 1}</span>
                <div class="pal-riga-testo"><p class="pal-formato">${esc(t.categoria)}</p><p class="pal-riga-team">${x ? esc(x.nome) : '—'}</p></div>
                ${x ? sprites(x, 'pal-sprites-piccoli') : ''}
                <span class="pal-stato">${stato === 'done' ? '✓ Cleared' : stato === 'next' ? '▶ Up next' : '🔒 Locked'}</span>
                <button type="button" class="ng-bottone" data-az="cambia" data-i="${i}">Change</button></article>`;
        }).join('');
        $('pal-corpo').innerHTML = `${intro}${barra}
            <section class="pal-passo-corpo">
                <p class="pal-passo-su">${finita ? 'Gym conquered!' : vinte > 0 ? 'Your run so far' : 'Ready?'}</p>
                <h3 class="pal-passo-titolo">${finita ? 'You beat every stage 🏆' : vinte > 0 ? `Stage ${vinte + 1} is waiting` : 'Your three teams'}</h3>
                <p class="pal-aiuto">${P.TAPPE} stages, one after the other, against teams you've never seen. One defeat sends you right back to stage 1: no pressure!</p>
                <div class="pal-righe">${righe}</div>
            </section>
            <div class="pal-azioni">
                <button type="button" class="ng-bottone ng-compra" data-az="via"${pronte ? '' : ' disabled'}>${finita ? 'Take it on again' : vinte > 0 ? `On to stage ${vinte + 1}` : 'Enter the gym'}</button>
                ${vinte > 0 && !finita ? '<button type="button" class="ng-bottone" data-az="da-capo">Start over</button>' : ''}
                <a class="ng-bottone pal-link" href="public.html?player=${encodeURIComponent(S.gym)}">Back to ${esc(S.gymNome)}'s page</a>
            </div>`;
    }

    function collegaSfida() {
        const c = $('pal-corpo');
        // le GIF che non si caricano ripiegano sull'immagine del Pokédex (come nel resto del sito)
        c.addEventListener('error', e => { const img = e.target; if (img && img.tagName === 'IMG' && SP && img.dataset.pkm) SP.riserva(img, SP.id(img.dataset.pkm)); }, true);
        c.addEventListener('click', e => {
            const carta = e.target.closest('.pal-squadra');
            if (carta) { S.scelte[S.passo] = carta.dataset.team; salvaScelte(); return disegnaSfida(); }
            const b = e.target.closest('button[data-az]');
            if (!b) return;
            const az = b.dataset.az;
            if (az === 'avanti') {
                if (S.tornaARiepilogo) { S.tornaARiepilogo = false; S.passo = P.TAPPE; }
                else S.passo = Math.min(P.TAPPE, S.passo + 1);
                disegnaSfida(); window.scrollTo({ top: 0, behavior: 'smooth' });
            } else if (az === 'indietro') {
                if (S.tornaARiepilogo) { S.tornaARiepilogo = false; S.passo = P.TAPPE; } else S.passo = Math.max(0, S.passo - 1);
                disegnaSfida();
            } else if (az === 'cambia') { S.tornaARiepilogo = true; S.passo = Number(b.dataset.i) || 0; disegnaSfida(); }
            else if (az === 'da-capo') { P.salvaSfida(window.localStorage, P.chiaveSfida(S.io, S.gym), { squadre: S.scelte.slice(0, P.TAPPE), vinte: 0 }); disegnaSfida(); msg('Back to stage 1: fresh start!'); }
            else if (az === 'via') {
                if (S.scelte.slice(0, P.TAPPE).some(x => !x)) return msg('Pick a team for every stage before you walk in!', true);
                const att = stagioneDa();
                const vinte = P.finita(att) ? 0 : att.vinte;
                P.salvaSfida(window.localStorage, P.chiaveSfida(S.io, S.gym), { squadre: S.scelte.slice(0, P.TAPPE), vinte });
                window.location.href = `battle.html?cpu=1&palestra=${encodeURIComponent(S.gym)}&tappa=${vinte}&team=${encodeURIComponent(S.scelte[vinte])}`;
            }
        });
    }

    /** Da dove si riparte: con i tre team già scelti (e magari tappe vinte) il riepilogo, altrimenti il primo format senza team */
    function passoIniziale() {
        const tappe = tappeGym(), att = stagioneDa();
        S.scelte = tappe.map((t, i) => (att.squadre[i] && teamPer(t.categoria).some(x => x.id === att.squadre[i]) ? att.squadre[i] : ''));
        const primo = S.scelte.findIndex(x => !x);
        S.passo = primo === -1 ? P.TAPPE : primo;
        S.tornaARiepilogo = false;
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
                else { passoIniziale(); disegnaSfida(); collegaSfida(); }
            }
        } catch (e) { msg("Couldn't load the gym. Check your connection and reload the page.", true); }
        fine();
    }
    firebase.auth().onAuthStateChanged(avvia);
})();
