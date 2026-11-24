// =====================================================
// PALESTRA — la pagina (palestra.html)
//
//   palestra.html?edit=1            impostare la propria palestra: 3 format (in ordine), un team del Box per ognuno e un vantaggio per ognuno
//   palestra.html?player=<id>       sfidare la palestra di un altro allenatore: si scelgono subito i 3 team da portare (uno per format, dal proprio Box) e si
//                                   affrontano di fila contro la CPU (battle.html, palestra.js); chi perde una partita ricomincia dalla prima tappa
//
// I team della palestra non si vedono mai da qui: allo sfidante si mostrano solo i format e l'ordine. Le regole (doppio, 6 portati, 4 scelti), i vantaggi e lo stato di chi sfida
// sono di palestra.js (puro, provato in Node); i dati stanno in players/<id>/info/palestra.
//
// Sfidando un altro la pagina è già dentro la sua palestra, come il simulatore (vestiSala): sfondo del suo colore con il suo motivo e il suo nome gigante, il suo avatar con l'aura
// e il suo compagno ai lati, l'effetto del suo palco, l'insegna con il suo nome (font ed effetto compresi) e la sua canzone (palestra.html la fa suonare). Con l'insegna i numeri della
// palestra (palestra-stat.js, scritti dal server: tentativi, quante volte ha tenuto, quante è stata espugnata, tappa per tappa) e il premio in monete della settimana. Chi ha la palestra
// vede gli stessi numeri nella pagina dove la imposta.
// =====================================================
(function () {
    'use strict';

    const P = window.Palestra, ST = window.PalestraStat;
    if (!P || !ST) return;

    const $ = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ricerca = new URLSearchParams(window.location.search);

    const S = { uid: '', io: '', nomeIo: '', regolamenti: {}, mieiTeam: [], bozza: [], gym: '', gymNome: '', gymConfig: null, passo: 0, scelte: [], tornaARiepilogo: false,
        capo: null,         // l'aspetto del capopalestra (Palestra.aspettoCapo)
        tema: null,         // i suoi colori e i suoi effetti (Palestra.temaPalestra), se la pagina ha potuto vestirsi
        stat: null,         // players/<id>/palestraStat: le statistiche della palestra (la sua o quella che si sfida)
        premio: null        // wallet/<uid>/premioPalestra: l'ultimo premio preso ({ settimana, gym, t })
    };
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
        S.nomeIo = String(nome || '').trim();
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

    /**
     * Il titolo della pagina: "Didi's gym" al posto del solo "GYM" (il sito lo scrive in maiuscolo). L'h1 è anche quello che l'app legge per il nastro in alto, e il titolo della scheda del browser.
     * Sfidando un altro è il nome di chi tiene la palestra, nella propria è il proprio.
     */
    function intestazione(nome) {
        const n = String(nome || '').replace(/\s+/g, ' ').trim();
        if (!n) return;
        const titolo = `${n}'s gym`;
        const h1 = $('hub-title-display');
        if (h1) h1.textContent = titolo;
        document.title = titolo;
    }

    // ---------------------------------------------------------------- le statistiche della palestra
    /** I tre numeri grandi: tentativi (sfide finite), volte che la palestra ha tenuto e volte che è stata espugnata */
    function numeriHtml(stat, titolo, conPremio) {
        const r = ST.riassunto(stat);
        const chip = (n, etichetta, nota, classe) => `<li class="pal-chip ${classe}"><b>${n}</b><span>${etichetta}</span>${nota ? `<small>${nota}</small>` : ''}</li>`;
        return `<ul class="pal-chips" aria-label="${esc(titolo)}">`
            + chip(r.tentativi, 'Attempts', '', 'pal-chip-tentativi')
            + chip(r.tenuta, 'Gym wins', r.percTenuta === null ? '' : `${r.percTenuta}%`, 'pal-chip-tenuta')
            + chip(r.espugnata, 'Gym beaten', '', 'pal-chip-espugnata')
            + (conPremio ? premioNumeroHtml() : '')       // sfidando: nell'app, dove non c'è il cartellino del premio, è un quarto numero
            + '</ul>';
    }

    /** Tappa per tappa (quanti sfidanti l'hanno superata), chi l'ha espugnata e le ultime sfide: un riquadro che si apre. `proprio`: la sto guardando io che l'ho costruita */
    function dettagliHtml(stat, categorie, proprio) {
        const r = ST.riassunto(stat);
        const adesso = Date.now();
        if (r.vuota) return `<p class="pal-stat-vuota">${proprio ? 'Nobody has finished your gym yet. Once somebody does, the numbers show up here.' : 'Nobody has finished this gym yet. Be the first to try!'}</p>`;
        const tappe = r.tappe.map((x, i) => `<li><span class="pal-stat-nome"><b>${i + 1}</b> ${esc(categorie[i] || `Stage ${i + 1}`)}</span>`
            + `<span class="pal-stat-barra" role="img" aria-label="${x.perc === null ? 'Not played yet' : `${x.perc}% of the challengers cleared it`}"><i style="width:${x.perc || 0}%"></i></span>`
            + `<span class="pal-stat-val">${x.giocate ? `${x.vinte} of ${x.giocate} cleared` : 'not played yet'}</span></li>`).join('');
        const espugnatori = r.espugnatori.length ? `<p class="pal-stat-espugn">Conquered by ${r.espugnatori.map(x => `<b>${esc(x.nome)}</b>${x.volte > 1 ? ` ×${x.volte}` : ''}`).join(', ')}</p>` : '';
        const ultime = r.ultime.map(u => `<li><b>${esc(u.nome)}</b> ${u.e === 'v' ? 'conquered the gym' : `fell at stage ${u.s + 1}`}<time>${esc(ST.tempoFa(u.t, adesso))}</time></li>`).join('');
        return `<details class="pal-dett"><summary>Stage by stage · recent challenges</summary><div class="pal-dett-corpo">`
            + `<ol class="pal-stat-tappe">${tappe}</ol>${espugnatori}<ul class="pal-stat-ultime">${ultime}</ul></div></details>`;
    }

    // ---------------------------------------------------------------- dentro la palestra (sfidare un altro)
    /** Il font del capopalestra (uno della lista di PaginaPubblica.FONT: niente testo libero): il sito lo carica da Google Fonts solo nelle pagine che lo usano */
    function caricaFont(nome) {
        if (!nome || document.querySelector(`link[data-pal-font="${nome}"]`)) return;
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.dataset.palFont = nome;
        l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(nome).replace(/%20/g, '+')}&display=swap`;
        document.head.append(l);
    }

    /**
     * La pagina diventa la sua palestra (come battle-ui.js, vestiPalestra): le variabili dei suoi colori sul <html>, lo sfondo con il suo motivo, il suo nome gigante dietro a tutto, il suo
     * avatar (con l'aura) a sinistra e il suo compagno a destra, l'effetto del suo palco e la barra in alto nel suo colore. Ritorna il tema, o null se la pagina non può vestirsi
     * (mancano i moduli, o il capopalestra non ha niente): resta la pagina di sempre.
     */
    function vestiSala() {
        const PP = window.PaginaPubblica, CO = window.Cosmetici;
        if (!PP || !CO || !S.capo) return null;
        const a = S.capo;
        const pagina = a.pagina && typeof a.pagina === 'object' ? a.pagina : {};
        // lo sfondo come nelle partite tra due allenatori: il suo colore principale con il motivo che ha scelto per la sua pagina
        const aspetto = { ...a, pagina: { ...pagina, sfondo: { ...((typeof pagina.sfondo === 'object' && pagina.sfondo) || {}), colore: 'giocatore' } } };
        const tema = P.temaPalestra(aspetto, PP, CO);
        const radice = document.documentElement;
        for (const [nome, valore] of Object.entries(tema.variabili)) radice.style.setProperty(nome, valore);
        document.body.classList.add('palestra', 'pal-dentro');
        document.body.classList.toggle('pal-scorre', !!tema.scorre);
        const barra = document.querySelector('.top-bar');
        if (barra) barra.style.setProperty('background-color', tema.colore, 'important');
        if (tema.font && tema.font !== 'Josefin Sans') caricaFont(tema.font);      // Josefin Sans c'è già nella pagina

        // l'avatar a sinistra (specchiato: gli avatar guardano a sinistra), il compagno a destra
        const decor = document.createElement('div');
        decor.className = 'vs-sfondo pal-decor';
        decor.setAttribute('aria-hidden', 'true');
        const comp = a.compagno;
        decor.innerHTML = (tema.avatar ? `<img class="vs-avatar pal-avatar" src="${esc(tema.avatar)}" alt="" draggable="false"${tema.aura ? ` data-aura="${esc(tema.aura.id)}" style="--pal-aura:${esc(tema.aura.colore)}"` : ''}>` : '')
            + (comp && SP ? `<img class="vs-compagno" src="${esc(SP.gif(comp.nome, comp.shiny))}" alt="" draggable="false" data-pkm="${esc(comp.nome)}">` : '');
        decor.addEventListener('error', e => {
            const img = e.target;
            if (!img || img.tagName !== 'IMG') return;
            if (img.classList.contains('vs-compagno') && SP && SP.ritenta(img)) return;
            img.remove();
        }, true);
        document.body.prepend(decor);
        // il compagno è in scala con l'avatar (altezza vera del Pokémon, allenatore alto 1,70 m: ScalaPkm.scena), come nel simulatore
        const avatarImg = decor.querySelector('.pal-avatar'), compImg = decor.querySelector('.vs-compagno');
        const scala = () => (avatarImg && compImg && window.ScalaPkm ? window.ScalaPkm.scena({ allenatore: avatarImg, pokemon: compImg, spazioPx: Math.round(window.innerHeight * 0.9) }).catch(() => {}) : Promise.resolve());
        for (const img of [avatarImg, compImg]) if (img) img.addEventListener('load', scala);
        setTimeout(scala, 1500);
        window.addEventListener('resize', scala);

        // il nome gigante dietro a tutto, come sulla sua pagina (solo contorno)
        if (tema.scritta) {
            const nome = String(S.gymNome || '').toUpperCase();
            const scritta = document.createElement('div');
            scritta.className = 'pal-scritta';
            scritta.setAttribute('aria-hidden', 'true');
            scritta.innerHTML = Array.from({ length: 7 }, (_, k) => `<div class="pal-scritta-riga" style="--k:${k}">${esc(`${nome} ${nome} ${nome}`)}</div>`).join('');
            document.body.prepend(scritta);
        }
        // l'effetto del suo palco davanti a tutto (effetti-palco.js lo disegna da solo)
        if (tema.effettoPalco) {
            const effetto = document.createElement('div');
            effetto.className = 'pal-effetto';
            effetto.setAttribute('aria-hidden', 'true');
            effetto.dataset.effettoPalco = tema.effettoPalco;
            document.body.append(effetto);
        }
        return tema;
    }

    /** L'insegna: la sua faccia (con l'aura), "GYM LEADER" e il suo nome con il suo font e il suo effetto; sotto, la canzone che suona */
    function insegnaHtml() {
        const t = S.tema, nome = String(S.gymNome || '').toUpperCase();
        const faccia = t && t.avatar ? `<img class="pal-ins-faccia" src="${esc(t.avatar)}" alt="" draggable="false"${t.aura ? ` data-aura="${esc(t.aura.id)}" style="--pal-aura:${esc(t.aura.colore)}"` : ''}>` : '';
        const musica = S.capo && S.capo.musica ? `<span class="pal-ins-musica">♪ ${esc(S.capo.musica.nome || 'Gym music')}</span>` : '';
        const effetto = t && t.effettoNome ? ` data-effetto-nome="${esc(t.effettoNome)}" data-testo="${esc(nome)}"` : '';
        return `<div class="pal-insegna" title="${esc(S.gymNome)}'s gym">${faccia}<span class="pal-ins-testi"><span class="pal-ins-piccolo">GYM LEADER</span><span class="pal-ins-nome"${effetto}>${esc(nome)}</span>${musica}</span></div>`;
    }

    /** Il premio in monete: quanto vale e, se è già stato preso questa settimana, quando torna */
    const premioPresoOra = () => !!S.premio && S.premio.settimana === ST.settimanaDi(Date.now());
    function premioNumeroHtml() {
        const per = window.Cosmetici && window.Cosmetici.PREMI ? window.Cosmetici.PREMI.palestra : 0;
        if (!per) return '';
        const preso = premioPresoOra();
        return `<li class="pal-chip pal-chip-premio" title="Gym coins are paid once a week in total, whichever gym you conquer."><b>🪙${preso ? '✓' : `+${per}`}</b><span>${preso ? 'Back Monday' : 'Once a week'}</span></li>`;
    }
    function premioHtml() {
        const per = window.Cosmetici && window.Cosmetici.PREMI ? window.Cosmetici.PREMI.palestra : 0;
        if (!per) return '';
        const presa = premioPresoOra();
        return presa
            ? '<p class="pal-premio pal-premio-preso" title="Gym coins are paid once a week in total, whichever gym you conquer. They reset on Monday.">🪙 Gym coins already collected this week · back on Monday</p>'
            : `<p class="pal-premio" title="Gym coins are paid once a week in total, whichever gym you conquer. They reset on Monday.">🪙 Clear all ${P.TAPPE} stages: <b>+${per} coins</b> · once a week</p>`;
    }

    /** Sopra a tutto, quando si sfida: l'insegna, i numeri della palestra, il premio e il riquadro con i dettagli */
    function testataHtml() {
        return `<header class="pal-testata">${insegnaHtml()}${numeriHtml(S.stat, `${S.gymNome}'s gym record`, true)}</header>`
            + `<div class="pal-sotto">${premioHtml()}${dettagliHtml(S.stat, tappeGym().map(t => t.categoria), false)}</div>`;
    }

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
                <label>Team<select data-campo="team"${r ? '' : ' disabled'}>${opzioni(r ? teamPer(r.categoria).map(x => [x.id, x.nome]) : [], t.team, r ? (teamPer(r.categoria).length ? 'Pick a team from your Box' : 'You have no team for this format') : 'Pick a format first')}</select></label>
                <label>Advantage<select data-campo="vantaggio"${r ? '' : ' disabled'}>${optV}</select></label>
                <p class="pal-descr">${v ? esc(v.descr) : 'It starts at the beginning of the battle, before turn 1.'}</p>
            </article>`;
        }).join('');
        $('pal-corpo').innerHTML = `<div class="pal-cima"><h2 class="pal-titolo">Build your gym</h2>
            <section class="pal-record" aria-label="Your gym's record"><h3 class="pal-record-titolo">Your gym's record</h3>${numeriHtml(S.stat, "Your gym's record")}${dettagliHtml(S.stat, S.bozza.map(t => t.categoria), true)}</section></div>
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
        const intro = testataHtml();
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
    /** La canzone: palestra.html (musicaPalestra.imposta) fa suonare quella del capopalestra, o la solita del sito se non ne ha (o se non si sta sfidando nessuno) */
    const suona = url => { if (window.musicaPalestra) window.musicaPalestra.imposta(url || ''); };

    async function avvia(utente) {
        const loader = $('poke-loader'), fine = () => { suona(S.capo && S.capo.musica ? S.capo.musica.url : ''); if (loader) loader.style.display = 'none'; };
        if (!utente) { $('pal-accedi').hidden = false; fine(); return; }
        S.uid = utente.uid;
        try {
            await leggiMiei();
            const altro = String(ricerca.get('player') || '').toLowerCase().trim();
            if (ricerca.get('edit') === '1' || !altro || altro === S.io) {
                const [config, stat] = await Promise.all([leggi(`players/${S.io}/info/palestra`), leggi(`players/${S.io}/palestraStat`).catch(() => null)]);
                S.bozza = bozzaDa(config);
                S.stat = stat;
                intestazione(S.nomeIo);
                $('pal-corpo').hidden = false;
                disegnaImposta(); collegaImposta();
            } else {
                S.gym = altro;
                // tutto quello che serve per vestire la pagina da palestra, i suoi numeri e il premio della settimana (il portafoglio è mio: lo leggo io)
                const [info, stat, premio] = await Promise.all([leggi(`players/${altro}/info`), leggi(`players/${altro}/palestraStat`).catch(() => null), leggi(`wallet/${S.uid}/premioPalestra`).catch(() => null)]);
                const i = info || {}, config = i.palestra;
                S.gymConfig = config; S.gymNome = String(i.name || altro); S.stat = stat; S.premio = premio;
                intestazione(S.gymNome);
                // il compagno è shiny se lo è nel suo Box, come nel simulatore (team-sito.js, caricaTappaPalestra)
                let shiny = false;
                if (i.pkmBox && i.pkmPreferito && window.Cosmetici) { try { shiny = !!window.Cosmetici.compagnoShiny(i, (await leggi(`players/${altro}/teams`)) || {}); } catch (e) { /* senza shiny */ } }
                if (P.tappeDi(config).length === P.TAPPE) { S.capo = P.aspettoCapo(i, shiny); S.tema = vestiSala(); }       // una palestra non ancora costruita non si veste (e non suona)
                $('pal-corpo').hidden = false;
                if (P.tappeDi(config).length !== P.TAPPE) $('pal-corpo').innerHTML = `<h2 class="pal-titolo">${esc(S.gymNome)}'s gym</h2><p class="pal-aiuto">${esc(S.gymNome)} hasn't built a gym yet. Check back soon!</p><div class="pal-azioni"><a class="ng-bottone pal-link" href="public.html?player=${encodeURIComponent(altro)}">Back to ${esc(S.gymNome)}'s page</a></div>`;
                else { passoIniziale(); disegnaSfida(); collegaSfida(); }
            }
        } catch (e) { msg("Couldn't load the gym. Check your connection and reload the page.", true); }
        fine();
    }
    firebase.auth().onAuthStateChanged(avvia);
})();
