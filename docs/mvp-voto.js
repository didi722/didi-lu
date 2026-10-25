// =====================================================
// MVP DELLA STAGIONE: il voto e il risultato in matches.html
//
// matches.html chiama MvpVoto.avvia({ stagione, info, showdowns, teamsIscritti, players, votante }) a ogni disegno della pagina.
//   - quando mancano pochi showdown alla fine (Mvp.finestraVoto), e per 24 ore dopo la chiusura della stagione, compare in alto il tasto "VOTE MVP";
//   - il tasto apre un modale con i primi 5 Pokémon della classifica dell'MVP (punteggio pesato sulle statistiche della stagione), CONGELATA al
//     momento in cui si è aperto il voto: i set giocati dopo non la cambiano, e vale anche per gli spareggi;
//     ogni giocatore della stagione ha 2 voti, su Pokémon diversi e non suoi; si può cambiare idea finché la stagione è aperta;
//   - passate le 24 ore, sotto la classifica compare l'MVP con i suoi voti. Il conteggio (Mvp.spoglio, con la classifica dell'MVP a stagione
//     congelata per gli spareggi) lo scrive in seasons/{id}/mvp/risultato la prima pagina che lo trova scaduto: matches.html per la stagione
//     che mostra, stats.html per tutte (concludiScadute).
// I voti stanno in seasons/{id}/mvp/voti/{giocatore}.
// La parte che decide cosa è valido è in mvp.js (provata in test/mvp.test.js); qui c'è solo la pagina.
// Richiede: db, firebase, Mvp, Statistiche, SpritePkm, avanzamentoStagione (risultati-match.js).
// =====================================================
(function () {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const colorePulito = c => String(c || '').replace(/[^#0-9a-zA-Z(),.%\s-]/g, '');

    let ctx = null;            // l'ultimo contesto con cui è stata disegnata la pagina
    let stato = null;          // lo stato del modale aperto: { candidati, scelte (Set di chiavi), puoVotare, ... }

    const gif = specie => {
        const id = window.SpritePkm.id(specie);
        return `<img class="mvp-sprite" src="${esc(window.SpritePkm.gif(specie))}" alt="" loading="lazy" onerror="SpritePkm.riserva(this,'${esc(id)}')">`;
    };

    /**
     * La classifica dell'MVP congelata al momento in cui si è aperto il voto (Mvp.showdownAllApertura): le statistiche dei soli showdown giocati fino a lì.
     * Se per qualche motivo il momento non si trova, si usano tutti gli showdown.
     */
    function classificaCongelata({ stagione, info, showdowns, teamsIscritti, iscritti, players }) {
        const apertura = window.Mvp.showdownAllApertura(info, iscritti, showdowns, teamsIscritti, avanzamentoStagione);
        const r = window.Statistiche.calcola({ players, seasons: { [stagione]: { info, showdowns: apertura ? apertura.showdowns : showdowns } } }, { stagione });
        return window.Mvp.classifica(r.pokemon);
    }

    // "3 more hours" / "40 more minutes"
    function tempoRimasto(scade) {
        const min = Math.max(1, Math.round((scade - Date.now()) / 60000));
        if (min >= 90) return `${Math.round(min / 60)} more hours`;
        return `${min} more minute${min === 1 ? '' : 's'}`;
    }

    // ---------- il tasto in alto ----------
    function tasto() {
        let b = document.getElementById('btn-mvp');
        if (b) return b;
        const barra = document.querySelector('.top-auth-bar');
        if (!barra) return null;
        b = document.createElement('button');
        b.type = 'button';
        b.id = 'btn-mvp';
        b.className = 'btn-mvp blur-target';
        b.hidden = true;
        b.addEventListener('click', apriModale);
        const dopo = barra.querySelector('.btn-registered-teams');
        if (dopo && dopo.nextSibling) barra.insertBefore(b, dopo.nextSibling); else barra.insertBefore(b, barra.firstChild);
        return b;
    }

    // ---------- il risultato sotto la classifica ----------
    function cardMvp() {
        let s = document.getElementById('mvp-risultato');
        if (!s) {
            const colonna = document.querySelector('.hub-right-column');
            if (!colonna) return null;
            s = document.createElement('section');
            s.id = 'mvp-risultato';
            s.className = 'cl-finestra cl-laterale mvp-risultato';
            s.setAttribute('aria-label', 'Season MVP');
            colonna.appendChild(s);
        }
        return s;
    }

    // la stagione è chiusa ma il voto è ancora aperto: dice quanto manca e quanti hanno già votato
    function schedaAttesa(scade, hanno, su) {
        const s = cardMvp();
        if (!s) return;
        s.innerHTML = `<div class="cl-barra"><span class="cl-barra-titolo">SEASON MVP</span></div>
            <div class="cl-corpo"><p class="mvp-nota">The season is over. MVP voting stays open for ${esc(tempoRimasto(scade))}.</p>
            <p class="mvp-nota">${esc(hanno)} of ${esc(su)} players have voted.</p>
            <button type="button" class="mvp-conferma mvp-apri">VOTE MVP</button></div>`;
        s.querySelector('.mvp-apri').onclick = apriModale;
    }

    function schedaRisultato(vincitori, spareggio) {
        if (!vincitori) { const x = document.getElementById('mvp-risultato'); if (x) x.remove(); return; }
        const s = cardMvp();
        if (!s) return;
        const corpo = vincitori.length ? vincitori.slice(0, 1).map(v => `
            <div class="mvp-vincitore">
                ${gif(v.specie)}
                <span class="mvp-vincitore-testi">
                    <b class="mvp-vincitore-nome">${esc(v.specie)}</b>
                    <span class="mvp-vincitore-sub">${esc(nomeGiocatore(v.player))} · ${esc(v.team)}</span>
                </span>
                <span class="mvp-vincitore-voti"><b>${esc(v.voti)}</b>${v.voti === 1 ? ' vote' : ' votes'}</span>
            </div>`).join('')
            : '<p class="mvp-nessuno">Nobody voted: no MVP this season.</p>';
        s.innerHTML = `<div class="cl-barra"><span class="cl-barra-titolo">SEASON MVP</span></div>
            <div class="cl-corpo">${corpo}${vincitori.length && spareggio ? '<p class="mvp-nota">Tied on votes: the Pokémon ahead in the season MVP ranking wins.</p>' : ''}</div>`;
    }

    const nomeGiocatore = id => (ctx && ctx.players && ctx.players[idDi(id)] && ctx.players[idDi(id)].info && ctx.players[idDi(id)].info.name) || id;

    // ---------- il modale ----------
    function velo() {
        let v = document.getElementById('modal-mvp');
        if (v) return v;
        v = document.createElement('div');
        v.id = 'modal-mvp';
        v.className = 'mvp-velo';
        v.hidden = true;
        v.innerHTML = '<div class="mvp-modale" role="dialog" aria-modal="true" aria-labelledby="mvp-titolo"></div>';
        v.addEventListener('click', e => { if (e.target === v) chiudi(); });
        document.body.appendChild(v);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(); });
        return v;
    }
    function chiudi() { const v = document.getElementById('modal-mvp'); if (v) v.hidden = true; document.body.classList.remove('mvp-aperto'); }

    function rigaHtml(c, stat) {
        const mio = !window.Mvp.VOTA_I_PROPRI && idDi(c.player) === idDi(ctx.votante);
        const scelto = stato.scelte.has(c.chiave);
        const colore = colorePulito(c.colore) || '#31c489';
        const pieno = !scelto && stato.scelte.size >= window.Mvp.VOTI;
        const disabilitato = !stato.puoVotare || mio || pieno;
        const etichetta = scelto ? 'VOTED ✓' : mio ? 'YOURS' : 'VOTE';
        return `<li class="mvp-riga${scelto ? ' scelto' : ''}${mio ? ' mio' : ''}" style="--mvp-colore:${colore}">
            <span class="mvp-pos">#${esc(c.posizione)}</span>
            ${gif(c.specie)}
            <span class="mvp-testi">
                <b class="mvp-nome">${esc(c.specie)}</b>
                <span class="mvp-sub">${esc(c.playerNome)} · ${esc(c.team)}</span>
            </span>
            <span class="mvp-punti"><b>${esc(c.punteggio)}</b><small>pts</small></span>
            <button type="button" class="mvp-vota" data-chiave="${esc(c.chiave)}" ${disabilitato ? 'disabled' : ''} aria-pressed="${scelto}">${etichetta}</button>
            <ul class="mvp-stat" aria-label="Season stats of ${esc(c.specie)}">${stat.map(x => `<li class="mvp-dato${x.migliore ? ' migliore' : ''}"${x.migliore ? ' title="Best of the top 5"' : ''}><span class="mvp-dato-et">${esc(x.et)}</span><b>${esc(x.testo)}</b><small>${esc(x.sub)}</small></li>`).join('')}</ul>
        </li>`;
    }

    function disegnaModale() {
        const m = document.querySelector('#modal-mvp .mvp-modale');
        const P = window.Mvp.PESI;
        const restanti = window.Mvp.VOTI - stato.scelte.size;
        let nota;
        if (stato.salvato) nota = `Your vote is in. You can change it until voting ends.`;
        else if (!ctx.votante) nota = 'Log in to vote.';
        else if (!stato.puoVotare) nota = 'Only the players of this season can vote.';
        else nota = `You have ${restanti} vote${restanti === 1 ? '' : 's'} left. Not for your own Pokémon, and one vote per Pokémon.`;
        m.innerHTML = `
            <button type="button" class="mvp-x" aria-label="Close">✖</button>
            <div class="mvp-testa"><h2 id="mvp-titolo" class="mvp-titolo">MVP VOTE</h2><span class="mvp-stagione">${esc(ctx.info.name || ctx.stagione)}</span></div>
            <p class="mvp-intro">${esc(stato.intro)}</p>
            ${stato.candidati.length ? `<ol class="mvp-elenco">${(() => { const stat = window.Mvp.statVoto(stato.candidati); return stato.candidati.map((c, i) => rigaHtml(c, stat[i])).join(''); })()}</ol>` : '<p class="mvp-nessuno">No Pokémon has played yet.</p>'}
            <p class="mvp-regola">Highlighted: the best of the top 5 in each stat. Score: KO ×${P.ko} · set won ×${P.setVinto} · set played ×${P.presenza} · set survived ×${P.sopravvissuto} · last Pokémon standing ×${P.ultimoRimasto} · match won ×${P.matchVinto}</p>
            <p class="mvp-nota" role="status">${esc(stato.errore || nota)}</p>
            <div class="mvp-azioni">
                <button type="button" class="mvp-conferma" ${stato.puoVotare && stato.scelte.size && !stato.occupato ? '' : 'disabled'}>${stato.occupato ? 'SAVING…' : stato.salvato ? 'UPDATE VOTE' : 'CONFIRM VOTE'}</button>
                <button type="button" class="mvp-chiudi">CLOSE</button>
            </div>`;
        m.querySelector('.mvp-x').onclick = chiudi;
        m.querySelector('.mvp-chiudi').onclick = chiudi;
        m.querySelectorAll('.mvp-vota').forEach(b => {
            b.onclick = () => {
                const k = b.dataset.chiave;
                if (stato.scelte.has(k)) stato.scelte.delete(k); else if (stato.scelte.size < window.Mvp.VOTI) stato.scelte.add(k);
                stato.errore = ''; stato.salvato = false;
                disegnaModale();
            };
        });
        m.querySelector('.mvp-conferma').onclick = salva;
    }

    async function salva() {
        if (stato.occupato) return;
        const esito = window.Mvp.controllaScelte([...stato.scelte], stato.candidati, ctx.votante);
        if (!esito.ok) { stato.errore = esito.errore; disegnaModale(); return; }
        stato.occupato = true; disegnaModale();
        try {
            // nel frattempo la stagione può essersi chiusa da più di 24 ore (o i voti già contati): dopo, il voto non vale più
            const [i, r] = await Promise.all([db.ref(`seasons/${ctx.stagione}/info`).once('value'), db.ref(`seasons/${ctx.stagione}/mvp/risultato`).once('value')]);
            const ora = window.Mvp.finestraVoto(i.val() || {}, { richiesti: 1, giocati: 1 }, ctx.stagione);
            if (r.exists() || (ora.chiusa && !ora.aperta)) throw new Error('Voting is over for this season.');
            await db.ref(`seasons/${ctx.stagione}/mvp/voti/${idDi(ctx.votante)}`).set({ ts: Date.now(), scelte: esito.scelte.map(window.Mvp.candidato) });
            stato.salvato = true; stato.errore = '';
            ctx.mioVoto = esito.scelte.map(c => c.chiave);
            aggiornaTasto();
        } catch (e) {
            console.error('MVP: voto non salvato', e);
            stato.errore = e && e.message ? e.message : 'Could not save your vote. Try again.';
        }
        stato.occupato = false;
        disegnaModale();
    }

    async function apriModale() {
        if (!ctx) return;
        const v = velo();
        v.hidden = false;
        document.body.classList.add('mvp-aperto');
        const m = v.querySelector('.mvp-modale');
        m.innerHTML = '<p class="mvp-nota">Loading the ranking…</p>';
        try {
            // la classifica dell'MVP è quella delle statistiche della sola stagione, congelata all'apertura del voto: uguale per tutti
            const tutti = classificaCongelata({ ...ctx, iscritti: ctx.iscrittiGrezzi });
            const candidati = tutti.slice(0, window.Mvp.TOP);
            // un Pokémon già votato che nel frattempo è uscito dai primi 5 resta nell'elenco, così il voto si vede e si può togliere
            for (const k of ctx.mioVoto || []) { const x = tutti.find(t => t.chiave === k); if (x && !candidati.includes(x)) candidati.push(x); }
            stato = {
                candidati, scelte: new Set((ctx.mioVoto || []).filter(k => candidati.some(c => c.chiave === k))),
                puoVotare: !!ctx.votante && ctx.iscritti.has(idDi(ctx.votante)) && ctx.finestra.aperta,
                intro: ctx.finestra.fase === 'dopo'
                    ? `The season is over, but you can still vote for ${tempoRimasto(ctx.finestra.scade)}. These are the top 5 when voting opened. The MVP is the Pokémon with the most votes; a tie goes to the one ahead in this ranking.`
                    : 'The top 5 Pokémon when voting opened: the ranking is frozen, so everyone votes on the same numbers. The MVP is the Pokémon with the most votes (a tie goes to the one ahead in this ranking). Voting stays open for 24 hours after the season ends.',
                salvato: !!(ctx.mioVoto && ctx.mioVoto.length), occupato: false, errore: ''
            };
            disegnaModale();
        } catch (e) {
            console.error('MVP: classifica non calcolata', e);
            m.innerHTML = '<button type="button" class="mvp-x" aria-label="Close">✖</button><p class="mvp-nota">Could not build the ranking. Reload the page.</p>';
            m.querySelector('.mvp-x').onclick = chiudi;
        }
    }

    function aggiornaTasto() {
        const b = tasto();
        if (!b || !ctx) return;
        b.hidden = !ctx.finestra.aperta;
        const votato = !!(ctx.mioVoto && ctx.mioVoto.length);
        b.textContent = votato ? 'MVP VOTE ✓' : 'VOTE MVP';
        b.title = votato ? 'You voted. Open to change your vote.' : `${ctx.finestra.mancano} showdown${ctx.finestra.mancano === 1 ? '' : 's'} to the end: vote for the season MVP`;
        b.classList.toggle('votato', votato);
    }

    /**
     * Si chiama a ogni disegno di matches.html.
     * @param {{ stagione: string, info: object, showdowns: object, teamsIscritti: object, players: object, votante?: string }} dati
     */
    async function avvia(dati) {
        const stagione = dati.stagione, info = dati.info || {};
        if (!window.Mvp || !window.Mvp.stagioneConMvp(info, stagione)) {
            ctx = null; schedaRisultato(null);
            const b = document.getElementById('btn-mvp'); if (b) b.hidden = true;
            return;
        }
        const [iscrSnap, mvpSnap] = await Promise.all([
            db.ref(`seasons/${stagione}/iscritti`).once('value'),
            db.ref(`seasons/${stagione}/mvp`).once('value')
        ]);
        const iscritti = iscrSnap.val() || {};
        const mvp = mvpSnap.val() || {};
        const avanzamento = avanzamentoStagione(info, iscritti, dati.showdowns, dati.teamsIscritti);
        const votante = idDi(dati.votante);
        const mio = votante && mvp.voti && mvp.voti[votante] ? valori(mvp.voti[votante].scelte).map(c => c && c.chiave).filter(Boolean) : [];
        ctx = {
            stagione, info, showdowns: dati.showdowns || {}, players: dati.players || {}, votante, teamsIscritti: dati.teamsIscritti || {},
            iscritti: new Set(Object.keys(iscritti).map(idDi)), mioVoto: mio, iscrittiGrezzi: iscritti,
            finestra: window.Mvp.finestraVoto(info, avanzamento, stagione)
        };
        aggiornaTasto();
        // scaduto il tempo del voto: si contano i voti (se non l'ha già fatto qualcun altro) e l'MVP compare sotto la classifica
        if (window.Mvp.daContare(ctx.finestra, mvp) && dati.votante) {
            try { mvp.risultato = await concludi({ stagione, info, showdowns: ctx.showdowns, teamsIscritti: ctx.teamsIscritti, players: ctx.players, iscritti, mvp }); }
            catch (e) { console.warn('MVP: conteggio non salvato', e); }
        }
        const vincitori = ctx.finestra.scaduta && mvp.risultato ? window.Mvp.vincitoriDi({ mvp }) : null;
        if (ctx.finestra.fase === 'dopo') {
            const hanno = Object.keys(mvp.voti || {}).filter(k => ctx.iscritti.has(idDi(k))).length;
            schedaAttesa(ctx.finestra.scade, hanno, ctx.iscritti.size);
        } else schedaRisultato(vincitori, !!(mvp.risultato && mvp.risultato.spareggio));
    }

    /**
     * Conta i voti di una stagione scaduta e li scrive (una volta sola, anche se due pagine ci provano insieme). Restituisce il risultato.
     * Lo spareggio usa la classifica dell'MVP congelata all'apertura del voto, la stessa da cui si è scelta la top 5.
     */
    async function concludi({ stagione, info, showdowns, teamsIscritti, players, iscritti, mvp }) {
        const ranking = classificaCongelata({ stagione, info, showdowns, teamsIscritti, iscritti, players });
        const esito = window.Mvp.spoglio(mvp.voti, iscritti, ranking);
        const nuovo = JSON.parse(JSON.stringify({ ...esito, contatoIl: new Date().toISOString() }));
        const tx = await db.ref(`seasons/${stagione}/mvp/risultato`).transaction(corrente => (corrente ? undefined : nuovo));
        return tx.committed ? nuovo : tx.snapshot.val();
    }

    /**
     * Per index.html e stats.html: conta i voti di tutte le stagioni scadute che non hanno ancora il risultato (`seasons` è il nodo seasons). Restituisce { stagione: risultato } di quelle
     * contate, da aggiungere ai dati in memoria prima di calcolare le statistiche.
     */
    async function concludiScadute(seasons, players) {
        const fatti = {};
        // `players` può essere l'oggetto dei giocatori o una funzione che lo legge: così chi non ha niente da contare (quasi sempre) non lo legge affatto
        let giocatori = typeof players === 'function' ? null : players;
        for (const [id, s] of Object.entries(seasons || {})) {
            if (!s || !s.info || !window.Mvp.stagioneConMvp(s.info, id)) continue;
            const f = window.Mvp.finestraVoto(s.info, { richiesti: 1, giocati: 1 }, id);
            if (!window.Mvp.daContare(f, s.mvp)) continue;
            try {
                if (!giocatori) giocatori = await players();
                fatti[id] = await concludi({ stagione: id, info: s.info, showdowns: s.showdowns || {}, teamsIscritti: s.teams_iscritti || {}, players: giocatori, iscritti: s.iscritti || {}, mvp: s.mvp });
            } catch (e) { console.warn(`MVP: conteggio della stagione ${id} non salvato`, e); }
        }
        return fatti;
    }

    window.MvpVoto = { avvia, apriModale, concludi, concludiScadute };
})();
