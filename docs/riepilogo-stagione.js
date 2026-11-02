// =====================================================
// RIEPILOGO DI FINE STAGIONE — Poké-Tournament
//
// Una stagione chiusa, aperta in matches.html, mostra questo riepilogo invece dell'elenco dei showdown (che resta a un tocco: "Calendar").
// Dentro: il vincitore e la classifica finale, i numeri della stagione, l'MVP, il miglior Pokémon di ogni formato, i premi (più KO, il muro, la
// rimonta...) e i Pokémon più usati. Tutto si calcola dai numeri che il sito ha già (Statistiche.calcola su QUELLA stagione): niente di nuovo da salvare.
//
// Due parti:
//   - calcola(dati) -> il riepilogo come dati: pura, niente DOM e niente Firebase (provata in test/riepilogo-stagione.test.js);
//   - html(riepilogo) / monta(...): come si vede nella pagina (sito e app).
//
// I PREMI sono gli stessi per tutti i tipi di stagione. Un premio compare solo se qualcuno lo merita davvero (un minimo di partite giocate e un valore
// sopra zero); a pari merito si premiano tutti, fino a tre. Quelli che parlano di Pokémon mancano nelle stagioni senza team (Randomize).
// Funziona nel browser (window.RiepilogoStagione) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./mvp.js'));
    else radice.RiepilogoStagione = fabbrica(radice.Mvp);
})(typeof self !== 'undefined' ? self : this, function (Mvp) {
    'use strict';

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const coloreSicuro = (c, vuoto) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : vuoto);
    const uno = n => Math.round(n * 10) / 10;

    const MIN_SET = 6;              // sotto questi set giocati non si premiano le medie (il muro, il cambio...)
    const MAX_PARI = 3;             // a pari merito si premiano al più tanti allenatori

    /** Come nella classifica della pagina (risultati-match.js): punti, match vinti, set vinti, poi il nome */
    function confrontaClassifica(a, b) {
        return num(b.points) - num(a.points) || num(b.won) - num(a.won) || num(b.setW) - num(a.setW) || String(a.name || '').localeCompare(String(b.name || ''));
    }

    // -----------------------------------------------------
    // Dai match: chi ha perso di un solo set e la più grande sorpresa (vince chi aveva meno Elo)
    // -----------------------------------------------------
    function dagliShowdown(showdowns) {
        const persiPerUno = {};       // id -> match persi per un solo set (con almeno un set vinto)
        let sorpresa = null;          // { vincitore, perdente, scarto, formato, data, punteggio }
        for (const sd of valori(showdowns)) {
            const info = (sd && sd.info) || {};
            for (const m of valori(sd && sd.matches)) {
                const a = num(m.p1score), b = num(m.p2score);
                if (a === b || !m.player1Id || !m.player2Id) continue;
                const [vinc, perd, sv, sp] = a > b ? [m.player1Id, m.player2Id, a, b] : [m.player2Id, m.player1Id, b, a];
                if (sv - sp === 1 && sp >= 1) persiPerUno[idDi(perd)] = (persiPerUno[idDi(perd)] || 0) + 1;
                const eloV = num(a > b ? m.p1EloAtMatch : m.p2EloAtMatch), eloP = num(a > b ? m.p2EloAtMatch : m.p1EloAtMatch);
                const scarto = eloP - eloV;     // positivo: ha vinto chi aveva meno Elo
                if (eloV && eloP && scarto > 0 && (!sorpresa || scarto > sorpresa.scarto)) {
                    sorpresa = { vincitore: idDi(vinc), perdente: idDi(perd), scarto, formato: m.categoria || info.categoria || '', data: m.data || info.data || '', punteggio: `${sv}-${sp}` };
                }
            }
        }
        return { persiPerUno, sorpresa };
    }

    // -----------------------------------------------------
    // I premi
    // -----------------------------------------------------
    /**
     * Chi vince un premio: i migliori per `punto` (maggiore = meglio), a patto che `minimo(g)` sia vero e il valore superi `soglia`.
     * Restituisce { vincitori: [giocatori], valore } oppure null.
     */
    function migliori(giocatori, valoreDi, { piccolo = false, soglia = 0, vale = () => true } = {}) {
        const elenco = giocatori.filter(vale).map(g => ({ g, v: valoreDi(g) })).filter(x => Number.isFinite(x.v) && (piccolo ? true : x.v > soglia));
        if (!elenco.length) return null;
        const meglio = elenco.reduce((m, x) => (piccolo ? Math.min(m, x.v) : Math.max(m, x.v)), piccolo ? Infinity : -Infinity);
        const pari = elenco.filter(x => x.v === meglio).slice(0, MAX_PARI);
        return { vincitori: pari.map(x => x.g), valore: meglio };
    }

    function costruisciPremi(r, extra) {
        const g = r.players || [];
        const setConDati = x => num(x.ko && x.ko.setConDati);
        const defs = [
            { id: 'ko', icona: '💥', titolo: 'KO King', testo: 'Most KOs', calc: () => migliori(g, x => num(x.ko && x.ko.fatti)), valore: v => `${v} KOs` },
            { id: 'muro', icona: '🛡️', titolo: 'The Wall', testo: 'Fewest KOs taken per set',
              calc: () => migliori(g, x => uno(num(x.ko && x.ko.subiti) / Math.max(1, setConDati(x))), { piccolo: true, vale: x => setConDati(x) >= MIN_SET }),
              valore: v => `${v} per set` },
            { id: 'pulito', icona: '✨', titolo: 'Flawless', testo: 'Most sets won without losing a Pokémon', calc: () => migliori(g, x => num(x.ko && x.ko.setPerfetti)), valore: v => `${v} sets` },
            { id: 'rimonta', icona: '💪', titolo: 'Never Say Die', testo: 'Most sets won on the last Pokémon', calc: () => migliori(g, x => num(x.ko && x.ko.setAlLimite)), valore: v => `${v} sets` },
            { id: 'serie', icona: '🔥', titolo: 'Hot Streak', testo: 'Longest winning streak (matches)', calc: () => migliori(g, x => num(x.serie && x.serie.vittorieMax), { soglia: 2 }), valore: v => `${v} in a row` },
            { id: 'elo', icona: '📈', titolo: 'Elo Climber', testo: 'Biggest Elo gain', calc: () => migliori(g, x => num(x.eloDelta)), valore: v => `+${v} Elo` },
            { id: 'cambi', icona: '🔄', titolo: 'Switch Doctor', testo: 'Most switches per set',
              calc: () => migliori(g, x => uno(num(x.azioni && x.azioni.cambi) / Math.max(1, num(x.azioni && x.azioni.setConDati))), { soglia: 0, vale: x => num(x.azioni && x.azioni.setConDati) >= MIN_SET }),
              valore: v => `${v} per set` },
            { id: 'sfortuna', icona: '💔', titolo: 'Heartbreaker', testo: 'Most matches lost by a single set',
              calc: () => migliori(g, x => num(extra.persiPerUno[idDi(x.id)]), { soglia: 1 }), valore: v => `${v} matches` }
        ];
        // chi porta in campo più specie diverse: solo con i team
        if ((r.pokemon || []).length) {
            const specie = {};
            for (const m of r.pokemon) if (num(m.portato) > 0) (specie[idDi(m.player)] = specie[idDi(m.player)] || new Set()).add(m.specieId);
            defs.push({ id: 'collezione', icona: '🔎', titolo: 'Collector', testo: 'Most different Pokémon used', calc: () => migliori(g, x => (specie[idDi(x.id)] || new Set()).size), valore: v => `${v} species` });
        }
        const premi = [];
        for (const d of defs) {
            const esito = d.calc();
            if (esito) premi.push({ id: d.id, icona: d.icona, titolo: d.titolo, descrizione: d.testo, vincitori: esito.vincitori.map(persona), valore: esito.valore, testoValore: d.valore(esito.valore) });
        }
        // la sorpresa: ha vinto chi aveva meno Elo (e di quanto)
        const s = extra.sorpresa;
        if (s && s.scarto >= 20) {
            const v = g.find(x => idDi(x.id) === s.vincitore), p = g.find(x => idDi(x.id) === s.perdente);
            if (v) premi.push({ id: 'sorpresa', icona: '⚡', titolo: 'Upset of the Season', descrizione: `Beat ${p ? p.nome : s.perdente} with ${s.scarto} less Elo`, vincitori: [persona(v)], valore: s.scarto, testoValore: `${s.punteggio}${s.formato ? ` · ${s.formato}` : ''}` });
        }
        return premi;
    }

    function persona(x) { return { id: x.id, nome: x.nome || x.id, colore: x.colore || '', avatar: x.avatar || '' }; }

    // -----------------------------------------------------
    // Il riepilogo
    // -----------------------------------------------------
    /**
     * @param {object} dati
     *   risultato  Statistiche.calcola(dati, { stagione }) della sola stagione
     *   info       seasons/{id}/info
     *   leaderboard seasons/{id}/leaderboard
     *   showdowns  seasons/{id}/showdowns
     *   mvp        seasons/{id}/mvp (voti e risultato)
     * @returns {object|null} null se non c'è niente da riassumere (nessun match)
     */
    function calcola(dati) {
        const r = (dati && dati.risultato) || {};
        const info = (dati && dati.info) || {};
        if (!r.totali || !num(r.totali.match)) return null;
        const giocatori = r.players || [];
        const colori = new Map(giocatori.map(x => [idDi(x.id), x]));

        const classifica = Object.entries((dati && dati.leaderboard) || {}).map(([name, v]) => ({ name, ...v })).sort(confrontaClassifica).map((v, i) => {
            const p = colori.get(idDi(v.name)) || {};
            return { posizione: i + 1, id: idDi(v.name), nome: p.nome || v.name, colore: p.colore || '', avatar: p.avatar || '', punti: num(v.points), vinti: num(v.won), persi: num(v.lost), sdVinti: num(v.sdWon), sdPersi: num(v.sdLost) };
        });
        const idVincitore = idDi(info.winner) || (classifica[0] ? classifica[0].id : '');
        const vincitore = classifica.find(x => x.id === idVincitore) || null;

        // MVP: il risultato dello spoglio, se c'è già; altrimenti, se ci sono voti, "si sta ancora votando"
        const mvpNodo = (dati && dati.mvp) || {};
        const mv = valori(mvpNodo.risultato && mvpNodo.risultato.vincitori).filter(Boolean)[0] || null;
        const mvp = mv ? { specie: String(mv.specie || ''), team: String(mv.team || ''), player: String(mv.player || ''), voti: num(mv.voti) } : null;
        const mvpInCorso = !mvp && !!mvpNodo.voti;

        const formati = [];
        const nomiFormati = Array.isArray(info.selected_formats) && info.selected_formats.length ? info.selected_formats : (r.formati || []);
        for (const f of nomiFormati) {
            const top = Mvp && Mvp.classifica ? Mvp.classifica((r.pokemon || []).filter(m => m.formato === f), 1)[0] : null;
            if (top) formati.push({ formato: f, specie: top.specie, team: top.team, player: top.playerNome || top.player, koFatti: num(top.ko), set: num(top.presenze) });
        }

        const usate = {};
        for (const m of r.pokemon || []) if (num(m.portato) > 0) { const k = m.specieId; usate[k] = usate[k] || { specie: m.specie, set: 0 }; usate[k].set += num(m.portato); }
        const piuUsati = Object.values(usate).sort((a, b) => b.set - a.set || a.specie.localeCompare(b.specie)).slice(0, 5);

        const date = valori(dati.showdowns).map(sd => String((sd && sd.info && sd.info.data) || '')).filter(Boolean).sort();
        const koTotali = giocatori.reduce((s, x) => s + num(x.ko && x.ko.fatti), 0);

        return {
            id: String(info.id || ''), nome: String(info.name || info.nome || r.stagioni && r.stagioni[0] && r.stagioni[0].nome || 'Season'),
            formati: nomiFormati, dal: date[0] || '', al: date[date.length - 1] || '',
            numeri: { showdown: num(r.totali.showdown), match: num(r.totali.match), set: num(r.totali.set), ko: koTotali, giocatori: classifica.length || giocatori.length },
            vincitore, classifica, mvp, mvpInCorso, formatiMigliori: formati,
            premi: costruisciPremi(r, dagliShowdown(dati.showdowns)), piuUsati
        };
    }

    /** Il riepilogo come testo da condividere in una chat */
    function testo(riep) {
        if (!riep) return '';
        const righe = [`🏁 ${riep.nome} — season recap`];
        if (riep.vincitore) righe.push(`🏆 Champion: ${riep.vincitore.nome} (${riep.vincitore.punti} pts)`);
        riep.classifica.slice(0, 3).forEach(c => righe.push(`${['🥇', '🥈', '🥉'][c.posizione - 1]} ${c.nome} — ${c.punti} pts (${c.vinti}-${c.persi})`));
        if (riep.mvp) righe.push(`⭐ MVP: ${riep.mvp.specie} (${riep.mvp.player})`);
        riep.premi.forEach(p => righe.push(`${p.icona} ${p.titolo}: ${p.vincitori.map(v => v.nome).join(', ')} — ${p.testoValore}`));
        righe.push(`${riep.numeri.match} matches · ${riep.numeri.set} sets · ${riep.numeri.ko} KOs`);
        return righe.join('\n');
    }

    // -----------------------------------------------------
    // Come si vede
    // -----------------------------------------------------
    const dataBreve = iso => { const p = String(iso || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : ''; };
    const linkGiocatore = nome => `public.html?player=${encodeURIComponent(String(nome || '').trim())}`;

    function htmlPersona(p, extraClasse = '') {
        const colore = coloreSicuro(p.colore, '#8a8a8a');
        const faccia = p.avatar ? `<img class="rs-avatar" src="${esc(p.avatar)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="rs-avatar rs-avatar-vuoto"></span>';
        return `<a class="rs-persona ${extraClasse}" href="${esc(linkGiocatore(p.nome))}" style="--c:${colore}">${faccia}<span class="rs-nome">${esc(p.nome)}</span></a>`;
    }

    const imgPkm = (specie, gif) => (gif && specie
        ? `<img class="rs-pkm" src="${esc(gif(specie))}" alt="${esc(specie)}" loading="lazy" onerror="if(window.SpritePkm)SpritePkm.ritenta(this)">` : '');

    /** Il riepilogo come HTML (tutto il testo che viene dal database è protetto). `gif(specie)` dà l'immagine animata di un Pokémon. */
    function html(riep, { gif } = {}) {
        if (!riep) return '<p class="rs-vuoto">No recap available for this season.</p>';
        const periodo = riep.dal ? `${dataBreve(riep.dal)}${riep.al && riep.al !== riep.dal ? ` → ${dataBreve(riep.al)}` : ''}` : '';
        const testa = `<header class="rs-testa"><span class="rs-etichetta">SEASON RECAP</span><h2>${esc(riep.nome)}</h2>`
            + `<p>${esc(riep.formati.join(' · '))}${periodo ? ` · ${esc(periodo)}` : ''}</p></header>`;

        const campione = riep.vincitore
            ? `<section class="rs-campione" style="--c:${coloreSicuro(riep.vincitore.colore, '#ffbd44')}"><span class="rs-coppa" aria-hidden="true">🏆</span>`
              + `<div><span class="rs-etichetta">CHAMPION</span>${htmlPersona(riep.vincitore, 'rs-grande')}`
              + `<span class="rs-dati">${riep.vincitore.punti} pts · ${riep.vincitore.vinti}W ${riep.vincitore.persi}L · SD ${riep.vincitore.sdVinti}-${riep.vincitore.sdPersi}</span></div></section>`
            : '';

        const n = riep.numeri;
        const numeri = `<section class="rs-numeri">${[['Showdowns', n.showdown], ['Matches', n.match], ['Sets', n.set], ['KOs', n.ko]]
            .map(([e, v]) => `<div class="rs-numero"><b>${v}</b><span>${e}</span></div>`).join('')}</section>`;

        const classifica = riep.classifica.length
            ? `<section class="rs-sezione"><h3>Final standings</h3><ol class="rs-classifica">${riep.classifica.map(c =>
                `<li class="rs-riga${c.posizione === 1 ? ' rs-primo' : ''}" style="--c:${coloreSicuro(c.colore, '#8a8a8a')}"><span class="rs-pos">#${c.posizione}</span>`
                + `${htmlPersona(c)}<span class="rs-dati">${c.vinti}W ${c.persi}L</span><b class="rs-punti">${c.punti}</b></li>`).join('')}</ol></section>`
            : '';

        const mvp = riep.mvp
            ? `<section class="rs-sezione rs-mvp"><h3>Season MVP</h3><div class="rs-mvp-corpo">${imgPkm(riep.mvp.specie, gif)}<div><b>${esc(riep.mvp.specie)}</b>`
              + `<span>${esc(riep.mvp.team)} · ${esc(riep.mvp.player)}</span><span>${riep.mvp.voti} vote${riep.mvp.voti === 1 ? '' : 's'}</span></div></div></section>`
            : riep.mvpInCorso ? '<section class="rs-sezione rs-mvp"><h3>Season MVP</h3><p class="rs-nota">The votes are still being counted.</p></section>' : '';

        const formati = riep.formatiMigliori.length
            ? `<section class="rs-sezione"><h3>Best of each format</h3><div class="rs-formati">${riep.formatiMigliori.map(f =>
                `<div class="rs-formato">${imgPkm(f.specie, gif)}<span class="rs-etichetta">${esc(f.formato)}</span><b>${esc(f.specie)}</b><span>${esc(f.player)} · ${f.koFatti} KOs</span></div>`).join('')}</div></section>`
            : '';

        const premi = riep.premi.length
            ? `<section class="rs-sezione"><h3>Awards</h3><div class="rs-premi">${riep.premi.map(p =>
                `<article class="rs-premio"><span class="rs-icona" aria-hidden="true">${p.icona}</span><div><b>${esc(p.titolo)}</b>`
                + `<small>${esc(p.descrizione)}</small><div class="rs-vincitori">${p.vincitori.map(v => htmlPersona(v)).join('')}</div><span class="rs-valore">${esc(p.testoValore)}</span></div></article>`).join('')}</div></section>`
            : '';

        const usati = riep.piuUsati.length
            ? `<section class="rs-sezione"><h3>Most used Pokémon</h3><div class="rs-usati">${riep.piuUsati.map((u, i) =>
                `<div class="rs-usato">${imgPkm(u.specie, gif)}<span>${i + 1}. ${esc(u.specie)}</span><i>${u.set} sets</i></div>`).join('')}</div></section>`
            : '';

        return `<div class="rs">${testa}${campione}${numeri}${classifica}${mvp}${formati}${premi}${usati}`
            + `<div class="rs-azioni"><button type="button" class="rs-condividi" data-azione="condividi">SHARE RECAP</button></div></div>`;
    }

    // -----------------------------------------------------
    // Nella pagina: il riepilogo e, sul sito, i due tasti "SEASON RECAP | CALENDAR"
    // (nell'app la scelta è nei tag in alto: app-matches.js)
    // -----------------------------------------------------
    /**
     * Disegna il riepilogo nella colonna dei match (sopra l'elenco). Si può richiamare: aggiorna senza cambiare la vista scelta.
     * @returns {HTMLElement|null}
     */
    function monta(win, riep, { gif } = {}) {
        const doc = win.document;
        const colonna = doc && doc.querySelector('.hub-left-column');
        const elenco = doc && doc.getElementById('matchList');
        if (!colonna || !elenco || !riep) return null;
        let corpo = doc.getElementById('riepilogoStagione');
        if (!corpo) {
            corpo = doc.createElement('div');
            corpo.id = 'riepilogoStagione';
            const scelta = doc.createElement('div');
            scelta.id = 'riepilogoScelta';
            scelta.className = 'rs-scelta';
            scelta.setAttribute('role', 'tablist');
            scelta.innerHTML = '<button type="button" role="tab" data-vista="riepilogo">SEASON RECAP</button><button type="button" role="tab" data-vista="calendario">CALENDAR</button>';
            elenco.parentNode.insertBefore(scelta, elenco);
            elenco.parentNode.insertBefore(corpo, elenco);
            const vai = v => {
                colonna.setAttribute('data-vista', v);
                scelta.querySelectorAll('button').forEach(b => { const su = b.dataset.vista === v; b.classList.toggle('su', su); b.setAttribute('aria-selected', String(su)); });
            };
            scelta.addEventListener('click', e => { const b = e.target.closest ? e.target.closest('button[data-vista]') : null; if (b) vai(b.dataset.vista); });
            corpo.addEventListener('click', async e => {
                const b = e.target.closest ? e.target.closest('[data-azione="condividi"]') : null;
                if (!b) return;
                const t = testo(corpo._riepilogo);
                try {
                    if (win.navigator && typeof win.navigator.share === 'function') await win.navigator.share({ title: 'Season recap', text: t });
                    else if (win.navigator && win.navigator.clipboard) { await win.navigator.clipboard.writeText(t); b.textContent = 'COPIED!'; win.setTimeout(() => { b.textContent = 'SHARE RECAP'; }, 1800); }
                } catch (err) { /* annullato: niente da fare */ }
            });
            vai('riepilogo');
        }
        corpo._riepilogo = riep;
        corpo.innerHTML = html(riep, { gif });
        return corpo;
    }

    return { calcola, html, testo, monta, confrontaClassifica };
});
