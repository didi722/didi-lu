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
// palestra (palestra-stat.js, scritti dal server: tentativi, quante volte ha tenuto, quante è stata espugnata, tappa per tappa) sul tabellone in cima. Chi ha la palestra vede gli
// stessi numeri nella pagina dove la imposta. La schermata (disegnaSfida) sta tutta in una pagina di computer: il tabellone, le tre porte (una per format) con il distintivo e le monete della
// settimana, il tasto per entrare. I team di una tappa si scelgono in una finestra (modale): toccando una porta si apre con i tuoi team di quel format, scelto uno si passa alla tappa che
// ne ha ancora bisogno, e con i tre pronti si chiude da sola. Nell'app (pagina a schermo fisso) la scelta resta in riga sotto le porte.
//
// Dove si imposta la palestra c'è anche l'allenamento della CPU (cpu-copione.js): per ogni tappa quanto la CPU conosce il modo in cui giochi quel team (la barra) e il tasto "Train" che
// apre una partita di allenamento (battle.html?cpu=1&allenamento=<tappa>&team=<id>, battle-ui.js: preparaAllenamento); in cima il tasto grande "Train CPU" e il totale. I numeri stanno
// in players/<tu>/palestraAllenamento/<id del team>.
// =====================================================
(function () {
    'use strict';

    const P = window.Palestra, ST = window.PalestraStat;
    if (!P || !ST) return;

    const $ = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ricerca = new URLSearchParams(window.location.search);

    const S = { uid: '', io: '', nomeIo: '', regolamenti: {}, mieiTeam: [], bozza: [], gym: '', gymNome: '', gymConfig: null, attivo: 0, disegnata: false, nuove: new Set(), scelte: [], modale: false, apertoDa: -1,
        capo: null,         // l'aspetto del capopalestra (Palestra.aspettoCapo)
        tema: null,         // i suoi colori e i suoi effetti (Palestra.temaPalestra), se la pagina ha potuto vestirsi
        stat: null,         // players/<id>/palestraStat: le statistiche della palestra (la sua o quella che si sfida)
        premio: null,       // wallet/<uid>/premiPalestra/<palestra>: l'ultimo premio preso per questa palestra ({ settimana, t })
        salvata: null,      // la mia palestra com'è salvata (players/<io>/info/palestra): la bozza che si sta modificando può essere diversa
        allena: {}          // l'allenamento della CPU della palestra (la mia o quella che sfido): { <id del team>: copione } (players/<id>/palestraAllenamento)
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
    /** Il premio che ho preso per la palestra di `gym` ({ settimana, t }) o null: ogni palestra ha il suo (wallet/<uid>/premiPalestra/<gym>); il vecchio premio unico (premioPalestra) vale per la sua palestra */
    async function leggiPremio(gym) {
        try {
            const nuovo = await leggi(`wallet/${S.uid}/premiPalestra/${gym}`);
            if (nuovo) return nuovo;
            const vecchio = await leggi(`wallet/${S.uid}/premioPalestra`);
            return vecchio && String(vecchio.gym) === String(gym) ? vecchio : null;
        } catch (e) { return null; }
    }

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
    function numeriHtml(stat, titolo) {
        const r = ST.riassunto(stat);
        const chip = (n, etichetta, nota, classe) => `<li class="pal-chip ${classe}"><b>${n}</b><span>${etichetta}</span>${nota ? `<small>${nota}</small>` : ''}</li>`;
        return `<ul class="pal-chips" aria-label="${esc(titolo)}">`
            + chip(r.tentativi, 'Attempts', '', 'pal-chip-tentativi')
            + chip(r.tenuta, 'Gym wins', r.percTenuta === null ? '' : `${r.percTenuta}%`, 'pal-chip-tenuta')
            + chip(r.espugnata, 'Gym beaten', '', 'pal-chip-espugnata')
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
        const avatarImg = decor.querySelector('.pal-avatar');
        let compImg = decor.querySelector('.vs-compagno');
        // ingrandito più del doppio della sua GIF resta nitido, come sulla pagina pubblica: pixel netti e, se si può, bordi lisci (SpriteNitido); il canvas prende il posto dell'immagine
        let nitidoInCorso = false;
        const nitido = () => {
            if (nitidoInCorso || !compImg || compImg.tagName !== 'IMG' || !window.SpriteNitido) return;
            nitidoInCorso = true;
            window.SpriteNitido.perIngrandimento(compImg).then(c => { if (c) compImg = c; }).catch(() => {}).then(() => { nitidoInCorso = false; });
        };
        const scala = () => (avatarImg && compImg && window.ScalaPkm ? window.ScalaPkm.scena({ allenatore: avatarImg, pokemon: compImg, spazioPx: Math.round(window.innerHeight * 0.9) }).then(nitido).catch(() => {}) : Promise.resolve());
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

    /** Il premio in monete: preso questa settimana? (il portafoglio è di chi sfida) */
    const premioPresoOra = () => !!S.premio && S.premio.settimana === ST.settimanaDi(Date.now());     // S.premio: il premio preso per QUESTA palestra

    /**
     * Il tabellone in cima, quando si sfida: l'insegna del capopalestra e i numeri della palestra su una targa scura con le cifre ambra (come il tabellone dell'intro prepartita) e,
     * sotto, il riquadro con i dettagli (tappa per tappa, ultime sfide).
     */
    function testataHtml() {
        return `<header class="pal-piatto">${insegnaHtml()}${numeriHtml(S.stat, `${S.gymNome}'s gym record`)}</header>`
            + dettagliHtml(S.stat, tappeGym().map(t => t.categoria), false);
    }

    // ---------------------------------------------------------------- l'allenamento della CPU (si vede dove si imposta la palestra)
    const LIVELLI = { nuova: "It doesn't know how you play yet", impara: 'Learning your style', quasi: 'Almost ready', pronta: 'Ready to defend!' };
    const livelloDa = p => (p >= 90 ? 'pronta' : p >= 55 ? 'quasi' : p > 0 ? 'impara' : 'nuova');
    /** Quanto la CPU conosce come giochi quel team del Box: { percento, livello, ... } (cpu-copione.js), o null se il modulo non c'è */
    function progressoTeam(id) {
        const CP = window.CpuCopione, t = teamPerId(id);
        return CP && t ? CP.progresso(S.allena[id], t.pokemon.map(p => p.nome)) : null;
    }
    const pianoAllenamento = () => P.pianoAllenamento(S.bozza, S.salvata, progressoTeam);

    /** Il pannello in cima: il totale (media delle tre tappe), cosa vuol dire e il tasto grande che allena la tappa più indietro */
    function allenamentoHtml(piano) {
        if (!window.CpuCopione) return '';
        const prossima = piano.prossima >= 0 ? piano.tappe[piano.prossima] : null;
        const livello = livelloDa(piano.totale);
        const via = prossima
            ? `<a class="ng-bottone ng-compra pal-allena-via" href="${esc(P.urlAllenamento(prossima.i, prossima.team))}">Train CPU</a>`
            : '<button type="button" class="ng-bottone ng-compra pal-allena-via" disabled>Train CPU</button>';
        const mancaSalvare = piano.tappe.some(x => x.perche === 'save-first');
        const nota = prossima ? `Next up: stage ${prossima.i + 1} · ${prossima.percento}% trained`
            : mancaSalvare ? 'Save your gym first: the CPU trains on your gym as it is saved.' : 'Pick a team for a stage to start training.';
        return `<section class="pal-allena-pannello" data-livello="${livello}" aria-label="Train your gym's CPU">
            <div class="pal-allena-testa"><h3>Train your gym's CPU</h3>
                <p>Play one of your teams against a CPU team, like a test battle from your Box. The CPU watches who you bring, who you lead with and how you play every move, then defends your gym the same way. About four battles per team does it.</p></div>
            <div class="pal-allena-misura"><span class="pal-allena-barra" role="img" aria-label="Your CPU is ${piano.totale}% trained"><i style="width:${piano.totale}%"></i></span>
                <b class="pal-allena-percento">${piano.totale}%</b><span class="pal-allena-livello">${esc(LIVELLI[livello])}</span></div>
            <div class="pal-allena-azione">${via}<small class="pal-allena-nota">${esc(nota)}</small></div>
        </section>`;
    }

    /** La riga in fondo a una carta di tappa: la barra di quel team e il tasto per allenarlo */
    function allenamentoTappaHtml(x) {
        if (!x.team || !window.CpuCopione) return '';
        const tasto = x.allenabile
            ? `<a class="ng-bottone pal-allena-btn" href="${esc(P.urlAllenamento(x.i, x.team))}">Train</a>`
            : `<button type="button" class="ng-bottone pal-allena-btn" disabled title="${x.perche === 'save-first' ? 'Save your gym first' : ''}">Train</button>`;
        return `<div class="pal-allena" data-livello="${x.livello}"><span class="pal-allena-barra" role="img" aria-label="Your CPU is ${x.percento}% trained on this team"><i style="width:${x.percento}%"></i></span>
            <span class="pal-allena-testo">CPU <b>${x.percento}%</b></span>${tasto}</div>`;
    }

    // ---------------------------------------------------------------- impostare la propria palestra
    function disegnaImposta() {
        const piano = pianoAllenamento();
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
                ${allenamentoTappaHtml(piano.tappe[i])}
            </article>`;
        }).join('');
        $('pal-corpo').innerHTML = `<div class="pal-cima"><h2 class="pal-titolo">Build your gym</h2>
            <section class="pal-record" aria-label="Your gym's record"><h3 class="pal-record-titolo">Your gym's record</h3>${numeriHtml(S.stat, "Your gym's record")}${dettagliHtml(S.stat, S.bozza.map(t => t.categoria), true)}</section>
            ${allenamentoHtml(piano)}</div>
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
                try { await firebase.database().ref(`players/${S.io}/info/palestra`).set(config); S.salvata = config; msg('Your gym is open for business. Challengers, beware!'); disegnaImposta(); } catch (err) { msg("Couldn't save: check your connection and try again.", true); }
            }
            if (b.id === 'pal-togli') {
                try { await firebase.database().ref(`players/${S.io}/info/palestra`).remove(); S.bozza = bozzaDa(null); S.salvata = null; msg('Your gym is closed. See you next time!'); disegnaImposta(); } catch (err) { msg("Couldn't remove it: try again.", true); }
            }
        });
    }

    // ---------------------------------------------------------------- sfidare la palestra di un altro
    // Una schermata sola, come la scelta dei personaggi di un picchiaduro: in alto il tabellone della palestra, poi il percorso (le tre tappe come tre porte, una per format, e in fondo il
    // distintivo con le monete), sotto i tuoi team per la porta accesa e, in fondo, il tasto per entrare. Scelto il team di una tappa si passa da solo alla prossima che ne ha bisogno; con
    // i tre team pronti il tasto si accende. Con una sfida già cominciata (tappe vinte) le porte dicono dov'è arrivato, e il team di una tappa si può sempre cambiare.
    const stagioneDa = () => P.leggiSfida(window.localStorage, P.chiaveSfida(S.io, S.gym)) || P.nuovaSfida([]);
    const tappeGym = () => P.tappeDi(S.gymConfig);
    const teamPerId = id => S.mieiTeam.find(t => t.id === id) || null;
    const salvaScelte = () => {
        const att = stagioneDa();
        P.salvaSfida(window.localStorage, P.chiaveSfida(S.io, S.gym), { squadre: S.scelte.slice(0, P.TAPPE), vinte: att.vinte || 0 });
    };
    /** Il team scelto per la tappa i c'è ancora ed è del format giusto? */
    const sceltaValida = i => { const tappa = tappeGym()[i], t = teamPerId(S.scelte[i]); return !!t && !!tappa && teamPer(tappa.categoria).some(x => x.id === t.id); };
    const sprites = (t, classe = '') => `<span class="pal-sprites ${classe}">${(t.pokemon || []).slice(0, 6).map(p => `<img src="${esc(SP ? SP.gif(p.nome, p.shiny) : '')}" alt="" loading="lazy" draggable="false" data-pkm="${esc(p.nome)}">`).join('')}</span>`;
    const TESTI_PORTA = { fatta: '✓ Cleared', prossima: '▶ Up next', chiusa: '🔒 Locked' };

    /** Nell'app (pagina a schermo fisso, class app-shell) i team stanno in riga sotto le porte; altrove si scelgono in una finestra */
    const inApp = () => !!(document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('app-shell'));

    /** I team della tappa `a` da scegliere: l'intestazione (tappa, format, aiuto) e le carte, uguali nella finestra e in riga */
    function selezioneHtml(a) {
        const tappe = tappeGym(), t = tappe[a], miei = teamPer(t.categoria);
        const carte = miei.length ? miei.map(x => `<button type="button" class="pal-team${S.scelte[a] === x.id ? ' pal-team-scelto' : ''}" data-team="${esc(x.id)}" aria-pressed="${S.scelte[a] === x.id}">
                <span class="pal-team-nome">${esc(x.nome)}</span>${sprites(x)}<span class="pal-team-timbro" aria-hidden="true">Picked</span></button>`).join('')
            : `<p class="pal-vuoto">You don't have a team for <b>${esc(t.categoria)}</b> yet. <a href="box.html">Build one in your Box</a>, then come back!</p>`;
        const aiuto = a === 0 ? "Doubles: bring 6 and pick 4 once you see the opposing team. You'll play against teams you've never seen, so choose the team you trust." : 'Which team do you bring to this one?';
        return {
            testa: `<header class="pal-sel-testa"><p class="pal-sel-su">Stage ${a + 1} of ${tappe.length}</p><h3 class="pal-sel-titolo" id="pal-dlg-titolo">${esc(t.categoria)}</h3><p class="pal-sel-aiuto">${aiuto}</p></header>`,
            squadre: `<div class="pal-squadre">${carte}</div>`
        };
    }
    const quantiPronti = () => tappeGym().filter((_, i) => sceltaValida(i)).length;
    const pipsHtml = () => tappeGym().map((_, i) => `<i class="pal-pip${sceltaValida(i) ? ' pal-pip-pieno' : ''}"></i>`).join('');

    function disegnaSfida() {
        const tappe = tappeGym(), att = stagioneDa(), vinte = att.vinte, finita = P.finita(att), app = inApp();
        const pronti = quantiPronti(), pronte = pronti === tappe.length;
        const a = Math.min(Math.max(S.attivo, 0), tappe.length - 1);
        S.attivo = a;
        const prima = !S.disegnata, nuove = S.nuove;
        S.disegnata = true; S.nuove = new Set();      // le entrate animate solo la prima volta (scegliere un team ridisegna la pagina, e non deve ripartire tutto); i team appena scelti hanno il loro tonfo

        // le tre porte (una per tappa) e in fondo il distintivo con le monete; toccando una porta (fuori dall'app) si apre la finestra con i suoi team
        const porte = tappe.map((t, i) => {
            const stato = i < vinte ? 'fatta' : i === vinte && !finita ? 'prossima' : 'chiusa';
            const x = sceltaValida(i) ? teamPerId(S.scelte[i]) : null;
            const slot = x ? `<span class="pal-slot pal-slot-piena"><span class="pal-slot-nome">${esc(x.nome)}</span>${sprites(x, 'pal-sprites-mini')}</span>` : '<span class="pal-slot"><span class="pal-slot-vuoto">+ Pick a team</span></span>';
            return `<li class="pal-porta pal-porta-${stato}${a === i ? ' pal-porta-attiva' : ''}${x ? ' pal-porta-piena' : ''}${nuove.has(i) ? ' pal-porta-nuova' : ''}" style="--i:${i}">
                <button type="button" class="pal-porta-btn" data-az="vai" data-i="${i}" aria-pressed="${a === i}"${app ? '' : ' aria-haspopup="dialog"'}>
                    <span class="pal-porta-num" aria-hidden="true">${i + 1}</span><span class="pal-porta-stato">${TESTI_PORTA[stato]}</span>
                    <span class="pal-porta-formato">${esc(t.categoria)}</span>${slot}<span class="pal-porta-segreto">Secret edge: ???</span></button></li>`;
        }).join('');
        const per = window.Cosmetici && window.Cosmetici.PREMI ? window.Cosmetici.PREMI.palestra : 0;
        const preso = premioPresoOra();
        // in fondo al percorso: la monetina con il premio; se per questa palestra la settimana è già pagata niente monete, solo "Win"
        const distintivo = `<li class="pal-porta pal-porta-premio${finita ? ' pal-porta-fatta' : ''}" style="--i:${tappe.length}" title="Gym coins are paid once a week for each gym you conquer. They reset on Monday.">
            ${per && !preso ? `<span class="pal-moneta"><img class="pal-moneta-img" src="immagini/moneta.png" alt="coins"><b>+${per}</b></span>` : '<span class="pal-vinci">Win</span>'}</li>`;
        const banner = finita ? '<p class="pal-banner">🏆 You beat every stage! Take it on again whenever you like.</p>'
            : vinte > 0 ? `<p class="pal-banner">Your run so far: ${vinte} of ${tappe.length} stages cleared. Stage ${vinte + 1} is waiting!</p>` : '';

        // nell'app i tuoi team per la porta accesa stanno in riga sotto le porte; altrove si scelgono nella finestra
        const sel = app ? selezioneHtml(a) : null;
        const selezione = sel ? `<section class="pal-selezione" style="--att:${a}">${sel.testa}${sel.squadre}</section>` : '';

        // il tasto per entrare, con quanti team sono pronti
        const via = finita ? 'Take it on again' : vinte > 0 ? `On to stage ${vinte + 1}` : 'Enter the gym';

        $('pal-corpo').innerHTML = `<div class="pal-sfida${prima ? ' pal-prima' : ''}">
            ${testataHtml()}
            <section class="pal-gara" aria-label="The challenge">
                <div class="pal-gara-testa"><h2 class="pal-gara-titolo">The challenge</h2><ul class="pal-regole"><li>Doubles</li><li>Bring 6 · pick 4</li><li>One loss: back to stage 1</li></ul></div>
                ${banner}
                <ol class="pal-percorso">${porte}${distintivo}</ol>
            </section>
            ${selezione}
            <div class="pal-cta">
                <a class="ng-bottone pal-link" href="public.html?player=${encodeURIComponent(S.gym)}">← ${esc(S.gymNome)}'s page</a>
                ${vinte > 0 && !finita ? '<button type="button" class="ng-bottone" data-az="da-capo">Start over</button>' : ''}
                <span class="pal-pronti" aria-live="polite"><span class="pal-pips" aria-hidden="true">${pipsHtml()}</span>${pronti}/${tappe.length} teams ready</span>
                <button type="button" class="pal-via" data-az="via"${pronte ? '' : ' disabled'}>${via}<span aria-hidden="true"> ▶</span></button>
            </div>
        </div>`;
    }

    // ---------------------------------------------------------------- la finestra per scegliere i team di una tappa
    const modale = () => $('pal-modale');
    /** La finestra: le tre tappe in cima (si può passare dall'una all'altra), la tappa di adesso con i tuoi team di quel format, in fondo quanti sono pronti */
    function modaleHtml() {
        const tappe = tappeGym(), a = S.attivo, sel = selezioneHtml(a), pronti = quantiPronti();
        const passi = tappe.map((t, i) => `<li><button type="button" class="pal-dlg-passo${i === a ? ' pal-dlg-passo-attivo' : ''}${sceltaValida(i) ? ' pal-dlg-passo-pieno' : ''}" data-az="tappa" data-i="${i}" aria-pressed="${i === a}" aria-label="Stage ${i + 1}: ${esc(t.categoria)}${sceltaValida(i) ? ', team picked' : ''}">
                <span class="pal-dlg-num" aria-hidden="true">${i + 1}</span><span class="pal-dlg-nome">${esc(t.categoria)}</span><span class="pal-dlg-spunta" aria-hidden="true">✓</span></button></li>`).join('');
        return `<section class="pal-dialogo" role="dialog" aria-modal="true" aria-labelledby="pal-dlg-titolo" style="--att:${a}">
            <span class="pal-dlg-striscia" aria-hidden="true">Pick a team · stage ${a + 1} of ${tappe.length}</span>
            <button type="button" class="pal-dlg-x" data-az="chiudi" aria-label="Close">&times;</button>
            <div class="pal-dlg-corpo">
                <ol class="pal-dlg-passi" aria-label="Stages">${passi}</ol>
                ${sel.testa}
                ${sel.squadre}
            </div>
            <footer class="pal-dlg-piede"><span class="pal-pronti" aria-live="polite"><span class="pal-pips" aria-hidden="true">${pipsHtml()}</span>${pronti}/${tappe.length} teams ready</span>
                <button type="button" class="ng-bottone pal-dlg-chiudi" data-az="chiudi">${pronti === tappe.length ? 'Done' : 'Close'}</button></footer>
        </section>`;
    }
    /** Riscrive il contenuto della finestra (cambiando tappa o scegliendo un team) e rimette il fuoco su una carta */
    function aggiornaModale(senzaFuoco) {
        const m = modale();
        m.innerHTML = modaleHtml();
        if (senzaFuoco) return;
        const f = m.querySelector('.pal-team-scelto') || m.querySelector('.pal-team') || m.querySelector('.pal-dlg-x');
        if (f && f.focus) f.focus({ preventScroll: true });
    }
    function apriModale(i, daDove) {
        const n = tappeGym().length;
        S.attivo = Math.min(Math.max(i, 0), n - 1);
        S.modale = true; S.apertoDa = daDove == null ? S.attivo : daDove;
        const m = modale();
        m.hidden = false;
        document.body.classList.add('pal-modale-aperta');
        aggiornaModale();
        // l'entrata animata solo quando si apre (non a ogni tappa)
        m.classList.add('pal-aprendo');
        setTimeout(() => m.classList.remove('pal-aprendo'), 450);
    }
    /** Chiude la finestra e ridisegna le porte (i team scelti, la porta accesa): a team pronti la porta accesa è quella da giocare e il fuoco va al tasto per entrare */
    function chiudiModale() {
        if (!S.modale) return;
        S.modale = false;
        const m = modale();
        m.hidden = true; m.innerHTML = '';
        document.body.classList.remove('pal-modale-aperta');
        const n = tappeGym().length, pronti = quantiPronti() === n;
        if (pronti) { const att = stagioneDa(); S.attivo = P.finita(att) ? 0 : Math.min(att.vinte || 0, n - 1); }
        disegnaSfida();
        const c = $('pal-corpo'), dove = pronti ? '.pal-via' : `.pal-porta-btn[data-i="${S.apertoDa}"]`, f = c.querySelector(dove);
        if (f && f.focus) f.focus({ preventScroll: true });
    }
    /** Il team scelto per la tappa di adesso: si ricorda subito e si passa alla prima tappa che ne ha ancora bisogno (-1 se sono tutte a posto) */
    function sceltoTeam(id) {
        const prima = S.attivo, n = tappeGym().length;
        S.scelte[prima] = id; S.nuove.add(prima); salvaScelte();
        let prossima = -1;
        for (let k = 1; k < n; k++) { const j = (prima + k) % n; if (!sceltaValida(j)) { prossima = j; break; } }
        if (prossima !== -1) S.attivo = prossima;
        return prossima;
    }

    function collegaSfida() {
        const c = $('pal-corpo'), m = modale();
        // le GIF che non si caricano ripiegano sull'immagine del Pokédex (come nel resto del sito)
        const riserva = e => { const img = e.target; if (img && img.tagName === 'IMG' && SP && img.dataset.pkm) SP.riserva(img, SP.id(img.dataset.pkm)); };
        c.addEventListener('error', riserva, true);
        m.addEventListener('error', riserva, true);
        // ridisegnare perde il fuoco: a chi usa la tastiera si rimette sull'elemento che si è appena usato
        const ridisegna = selettore => { disegnaSfida(); const e = selettore && c.querySelector(selettore); if (e) e.focus({ preventScroll: true }); };
        c.addEventListener('click', e => {
            // nell'app i team stanno in riga sotto le porte: scelto il team si passa alla prima tappa che ne ha ancora bisogno (se sono tutte a posto si resta qui)
            const carta = e.target.closest('.pal-team');
            if (carta) {
                const prima = S.attivo;
                sceltoTeam(carta.dataset.team);
                return ridisegna(S.attivo === prima ? '.pal-team-scelto' : `.pal-porta-btn[data-i="${S.attivo}"]`);
            }
            const b = e.target.closest('button[data-az]');
            if (!b) return;
            const az = b.dataset.az;
            if (az === 'vai') {
                const i = Number(b.dataset.i) || 0;
                if (inApp()) { S.attivo = i; ridisegna(`.pal-porta-btn[data-i="${i}"]`); }
                else apriModale(i);
            }
            else if (az === 'da-capo') { P.salvaSfida(window.localStorage, P.chiaveSfida(S.io, S.gym), { squadre: S.scelte.slice(0, P.TAPPE), vinte: 0 }); S.attivo = 0; ridisegna(); msg('Back to stage 1: fresh start!'); }
            else if (az === 'via') {
                if (S.scelte.slice(0, P.TAPPE).some((x, i) => !x || !sceltaValida(i))) return msg('Pick a team for every stage before you walk in!', true);
                const att = stagioneDa();
                const vinte = P.finita(att) ? 0 : att.vinte;
                P.salvaSfida(window.localStorage, P.chiaveSfida(S.io, S.gym), { squadre: S.scelte.slice(0, P.TAPPE), vinte });
                window.location.href = `battle.html?cpu=1&palestra=${encodeURIComponent(S.gym)}&tappa=${vinte}&team=${encodeURIComponent(S.scelte[vinte])}`;
            }
        });
        // la finestra: scegliere un team, cambiare tappa, chiudere (X, "Close", un tocco fuori o Esc)
        m.addEventListener('click', e => {
            if (e.target === m) return chiudiModale();         // lo sfondo scuro
            const carta = e.target.closest('.pal-team');
            if (carta) {
                const prossima = sceltoTeam(carta.dataset.team);
                if (prossima === -1) return chiudiModale();    // con i tre team pronti la finestra ha finito
                return aggiornaModale();
            }
            const b = e.target.closest('button[data-az]');
            if (!b) return;
            if (b.dataset.az === 'chiudi') chiudiModale();
            else if (b.dataset.az === 'tappa') { S.attivo = Number(b.dataset.i) || 0; aggiornaModale(); }
        });
        m.addEventListener('keydown', e => {
            if (e.key !== 'Tab') return;
            // il fuoco resta dentro la finestra
            const dentro = [...m.querySelectorAll('button, a[href]')].filter(x => !x.disabled);
            if (!dentro.length) return;
            const prima = dentro[0], ultima = dentro[dentro.length - 1], ora = document.activeElement;
            if (e.shiftKey && (ora === prima || !m.contains(ora))) { e.preventDefault(); ultima.focus(); }
            else if (!e.shiftKey && (ora === ultima || !m.contains(ora))) { e.preventDefault(); prima.focus(); }
        });
        if (document.addEventListener) document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.modale) { e.preventDefault(); chiudiModale(); } });
    }

    /** Da dove si parte: dalla prima tappa senza team; con i tre già scelti da quella che si deve ancora giocare (o dalla prima, a palestra conquistata) */
    function passoIniziale() {
        const tappe = tappeGym(), att = stagioneDa();
        S.scelte = tappe.map((t, i) => (att.squadre[i] && teamPer(t.categoria).some(x => x.id === att.squadre[i]) ? att.squadre[i] : ''));
        const primo = S.scelte.findIndex(x => !x);
        S.attivo = primo !== -1 ? primo : P.finita(att) ? 0 : Math.min(att.vinte || 0, tappe.length - 1);
        S.disegnata = false;
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
                const [config, stat, allena] = await Promise.all([leggi(`players/${S.io}/info/palestra`), leggi(`players/${S.io}/palestraStat`).catch(() => null), leggi(`players/${S.io}/palestraAllenamento`).catch(() => null)]);
                S.bozza = bozzaDa(config);
                S.salvata = config;
                S.stat = stat;
                S.allena = {};
                if (window.CpuCopione) for (const [id, c] of Object.entries(allena || {})) { const n = window.CpuCopione.normalizza(c); if (n) S.allena[id] = n; }
                intestazione(S.nomeIo);
                $('pal-corpo').hidden = false;
                disegnaImposta(); collegaImposta();
            } else {
                S.gym = altro;
                // tutto quello che serve per vestire la pagina da palestra, i suoi numeri e il premio della settimana (il portafoglio è mio: lo leggo io)
                const [info, stat, premio, allena] = await Promise.all([leggi(`players/${altro}/info`), leggi(`players/${altro}/palestraStat`).catch(() => null), leggiPremio(altro), leggi(`players/${altro}/palestraAllenamento`).catch(() => null)]);
                const i = info || {}, config = i.palestra;
                S.gymConfig = config; S.gymNome = String(i.name || altro); S.stat = stat; S.premio = premio;
                intestazione(S.gymNome);
                S.allena = {};
                if (window.CpuCopione) for (const [id, c] of Object.entries(allena || {})) { const n = window.CpuCopione.normalizza(c); if (n) S.allena[id] = n; }
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
