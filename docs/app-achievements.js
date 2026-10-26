// =====================================================
// APP — gli Achievements dell'allenatore, nella schermata iniziale
// ---------------------------------------------------------------------
// Sul sito stanno nel Profilo (una finestra a tre colonne: badge, titoli, Pokémon). Nell'app c'è un posto solo, accanto all'avatar nel menù principale: una
// finestra con i badge dell'allenatore, uno per carta, dal più vicino al livello successivo; in fondo quelli già al massimo. Sono gli stessi badge e gli
// stessi numeri del sito (badge-allenatore.js e titoli.js: le serie Clean, Win e SD Streak e, per i due fondatori, il badge speciale); qui si tolgono solo
// le spiegazioni lunghe e si tengono il livello, i quattro traguardi, la barra e cosa manca.
// La parte pura (elenco e HTML) è provata in test/app-achievements.test.js; funziona nel browser (window.AppAchievements) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const A = fabbrica();
    if (inNode) module.exports = A;
    else radice.AppAchievements = A;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const maiuscola = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
    const LIVELLI = ['bronze', 'silver', 'gold', 'platinum'];
    const FONDATORI = ['didi', 'lukiani'];

    /**
     * I badge di un allenatore, pronti da disegnare. `esito`: BadgeAllenatore.carica(db, id) ({ lista, risultato, dati }); `badgeSalvati`: players/<id>/stats/badges;
     * `M`: i moduli del sito { Titoli, BadgeAllenatore, BadgeTeam }. Restituisce { voci, sbloccati, totale }: `sbloccati` sono i livelli presi (su `totale`).
     */
    function elenco(esito, badgeSalvati, id, M) {
        const { Titoli, BadgeAllenatore, BadgeTeam } = M;
        const catalogo = ((esito && esito.lista) || []).map(b => {
            const d = BadgeAllenatore.scheda(b);
            // cosa serve per il livello dopo (e non quanto manca): il traguardo del prossimo livello; se conta solo dopo un minimo di match, la frase del sito lo dice già
            const prossimo = (d.livelli || []).find(l => l.stato === 'next');
            const frase = prossimo && !d.completo && !/^Counts after/.test(d.frase || '') ? `Next level, ${prossimo.nome}: ${prossimo.soglia}${d.suffisso ? '' : ' ' + String(d.etichetta || '').toLowerCase()}.` : d.frase;
            return {
                tipo: 'badge', id: d.id, nome: d.nome, immagine: d.immagine, icona: d.icona, livello: d.livello, classe: d.classe, completo: d.completo, bloccato: d.bloccato,
                descrizione: d.descrizione || '', livelli: d.livelli, barra: d.barra, frase, prossima: b.prossima, progresso: b.progresso
            };
        });
        // le serie (Clean, Win, SD Streak) dai match veri, se si riesce a leggerli; altrimenti restano i numeri salvati
        const salvati = badgeSalvati || {};
        const serieBadge = esito && esito.risultato ? Titoli.serieAggiornate(salvati, esito.risultato, id) : salvati;
        const serie = Titoli.BADGE.map(b => {
            const st = Titoli.statoSerie(serieBadge, b);
            const nomeProssimo = st.completo ? '' : maiuscola(LIVELLI[st.livello]);
            return {
                tipo: 'serie', id: 'serie-' + b.id, nome: b.label, icona: b.icona, livello: st.livello, classe: st.livello ? LIVELLI[st.livello - 1] : 'locked', completo: st.completo, bloccato: st.livello === 0,
                immagine: Titoli.immagineSerie(b, LIVELLI[Math.max(st.livello, 1) - 1]),
                livelli: b.steps.map((s, i) => ({ nome: maiuscola(LIVELLI[i]), classe: LIVELLI[i], soglia: String(s), stato: i < st.livello ? 'done' : (i === st.livello ? 'next' : '') })),
                barra: st.completo ? null : { etichetta: 'Current streak', valore: st.attuale, obiettivo: st.obiettivo },
                descrizione: b.testo || '',
                frase: st.completo ? `${maiuscola(LIVELLI[LIVELLI.length - 1])} reached: badge complete!` : `Next level, ${nomeProssimo}: ${st.obiettivo} ${b.unita} in a row.`,
                prossima: st.completo ? null : st.obiettivo, progresso: st.progresso
            };
        });
        const tutte = catalogo.concat(serie);
        const ordinate = BadgeTeam && BadgeTeam.perVicinanza ? BadgeTeam.perVicinanza(tutte) : tutte;
        const fondatore = FONDATORI.includes(String(id || '').toLowerCase().trim())
            ? [{ tipo: 'fondatore', id: 'founder', nome: 'League Founder', immagine: Titoli.IMMAGINE_FONDATORE, icona: '👑', livello: LIVELLI.length, classe: 'founder', completo: true, bloccato: false, livelli: [], barra: null, descrizione: '', frase: 'Hail to the kings' }]
            : [];
        return { voci: fondatore.concat(ordinate), sbloccati: tutte.reduce((n, v) => n + (v.livello || 0), 0), totale: tutte.length * LIVELLI.length };
    }

    const pips = v => (v.livelli || []).map(l => `<i class="ach-pip ach-${esc(l.classe)} ${esc(l.stato)}" title="${esc(l.nome)} ${esc(l.soglia)}"></i>`).join('');

    /** Una carta: la medaglia (col livello preso), il nome, i quattro livelli, la barra e cosa manca */
    function htmlVoce(v) {
        const pct = v.barra && v.barra.obiettivo > 0
            ? Math.max(0, Math.min(100, (((Number(v.barra.valore) || 0) - (Number(v.barra.partenza) || 0)) / (v.barra.obiettivo - (Number(v.barra.partenza) || 0))) * 100)) : 0;
        return `<article class="ach-voce ach-lv-${esc(v.classe)}${v.bloccato ? ' ach-bloccato' : ''}${v.completo ? ' ach-completo' : ''}" data-badge="${esc(v.id)}">
            <img class="ach-img" src="${esc(v.immagine)}" alt="" loading="lazy" onerror="window.BadgeTeam&&BadgeTeam.immagineMancante(this,'${esc(v.icona)}')">
            <div class="ach-testi">
                <b class="ach-nome">${esc(v.nome)}</b>
                ${v.descrizione ? `<small class="ach-desc">${esc(v.descrizione)}</small>` : ''}
                ${v.livelli && v.livelli.length ? `<span class="ach-pips">${pips(v)}</span>` : ''}
                ${v.barra ? `<span class="ach-riga-barra"><span class="ach-barra"><i style="width:${pct.toFixed(0)}%"></i></span><small class="ach-num">${esc(v.barra.valore)} / ${esc(v.barra.obiettivo)}</small></span>` : ''}
                ${v.tipo === 'fondatore' ? `<small class="ach-frase">${esc(v.frase)}</small>` : ''}
            </div>
        </article>`;
    }

    const htmlElenco = voci => (voci && voci.length ? voci.map(htmlVoce).join('') : '<p class="ach-vuoto">No badges yet.</p>');
    const somma = e => `${e.sbloccati} of ${e.totale} levels`;

    /** Legge da Firebase quello che serve e prepara l'elenco (nel browser) */
    async function carica(win, id) {
        const M = { Titoli: win.Titoli, BadgeAllenatore: win.BadgeAllenatore, BadgeTeam: win.BadgeTeam };
        if (!M.Titoli || !M.BadgeAllenatore || !M.BadgeTeam) throw new Error('badge modules missing');
        const db = win.firebase.database();
        const [esito, salvati] = await Promise.all([
            M.BadgeAllenatore.carica(db, id),
            db.ref('players/' + String(id).toLowerCase().trim() + '/stats/badges').once('value').then(s => s.val() || {}).catch(() => ({}))
        ]);
        return elenco(esito, salvati, id, M);
    }

    return { LIVELLI, FONDATORI, elenco, htmlVoce, htmlElenco, somma, carica };
});
