// =====================================================
// SOMIGLIANZA TRA TEAM — Poké-Tournament
//
// La regola: nello stesso formato, due team dello stesso giocatore non possono avere più di 2 Pokémon uguali (specie con lo stesso nome).
// Vale solo verso un team che non si può più modificare (iscritto a una stagione iniziata: team-bloccati.js). Tra team ancora modificabili
// no: chi sta provando i suoi team può farne quanti vuole, anche simili tra loro. Quando uno di quelli diventa non modificabile, gli altri che
// lo ricordano troppo sono "fuori regola": il Box li mostra grigi con la spiegazione, e l'Hub non li lascia iscrivere a una stagione.
//
// C'è un secondo pezzo: finché le iscrizioni di una stagione sono aperte i team iscritti si possono ancora modificare, ma alla chiusura diventano tutti non
// modificabili insieme. Due team modificabili che si somigliano troppo non possono quindi essere iscritti nello stesso momento, né alla stessa stagione né a due
// stagioni con le iscrizioni aperte (altrimenti la regola sarebbe rotta tra due team non più modificabili): si sceglie quale iscrivere.
//
//   SomiglianzaTeam.MASSIMO_COMUNI                     2
//   SomiglianzaTeam.valeNelFormato(struttura)          la regola c'è in questo formato? (strutturaSito del regolamento: custom e anything_goes; vuoto = custom)
//   SomiglianzaTeam.specieDi(team)                     i nomi dei Pokémon del team, in minuscolo (un team del Box, uno dei dati di validazione o un elenco)
//   SomiglianzaTeam.inComune(a, b)                     i Pokémon di `a` che ha anche `b`, con il nome che ha in `a`
//   SomiglianzaTeam.troppoSimili(a, b)                 hanno più di 2 Pokémon in comune?
//   SomiglianzaTeam.conflittiDi(team, altri, opz)      [{ con, comuni }] verso i team non modificabili di `altri`, dal più simile
//   SomiglianzaTeam.mappaConflitti(teams, opz)         Map id -> [{ con, comuni }] per i team modificabili fuori regola
//   SomiglianzaTeam.conflittiIscrizione(team, ctx)     [{ con, comuni, tipo, stagione? }]: perché il team non si può iscrivere adesso (vedi sotto)
//   SomiglianzaTeam.testo(conflitti)                   il testo da mostrare (la prima riga è il titolo)
//
//   opz: { bloccato(team) -> bool (obbligatoria: il team non si può più modificare),
//          vale(team) -> bool (solo per mappaConflitti: la regola c'è nel formato di questo team?) }
//
//   ctx di conflittiIscrizione: { delFormato: tutti i team del giocatore in quel formato, bloccato(team): bool,
//                                 scelti: i team che si stanno iscrivendo insieme (la selezione corrente),
//                                 altrove: i team già iscritti ad altre stagioni con le iscrizioni aperte, [{ ...team, nomeStagione }] }
//   tipo di un conflitto: "bloccato" (troppo simile a un team non modificabile), "insieme" (a un team che si sta iscrivendo con lui),
//                         "altrove" (a un team già iscritto a un'altra stagione con le iscrizioni aperte; `stagione` ne è il nome)
//
// Due team sono "dello stesso formato" se hanno la stessa categoria (minuscolo, senza spazi ai lati). Il confronto salta il team stesso (stesso id).
// Funziona nel browser (window.SomiglianzaTeam) e in Node (test/somiglianza-team.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.SomiglianzaTeam = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MASSIMO_COMUNI = 2;
    const STRUTTURE_CON_REGOLA = ['custom', 'anything_goes'];

    const chiave = t => String(t == null ? '' : t).trim().toLowerCase();
    const valori = x => (Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.values(x) : []));

    /** La regola c'è in questo formato? `struttura` è la strutturaSito del regolamento; se manca vale come "custom" (così si è sempre fatto al salvataggio). */
    function valeNelFormato(struttura) {
        return STRUTTURE_CON_REGOLA.includes(chiave(struttura) || 'custom');
    }

    /** Il nome di una specie come è scritto: stringa, { nome } del Box, { name } o { species: { name } } dei dati di validazione, { pokemon } */
    function nomeDi(p) {
        if (typeof p === 'string') return p.trim();
        if (!p || typeof p !== 'object') return '';
        return String((p.species && p.species.name) || p.name || p.nome || p.pokemon || '').trim();
    }

    /** I Pokémon di un team: un team del Box ({ pokemon | teamDati }), un elenco o un oggetto di Pokémon */
    const pokemonDi = team => (Array.isArray(team) ? team : valori(team && (team.pokemon || team.teamDati)));

    /** I nomi dei Pokémon di un team, in minuscolo */
    function specieDi(team) {
        return pokemonDi(team).map(p => chiave(nomeDi(p))).filter(Boolean);
    }

    /** I Pokémon di `a` che ha anche `b`, nell'ordine di `a` e col nome che hanno in `a` (una specie ripetuta in `a` conta ogni volta, come sempre) */
    function inComune(a, b) {
        const presenti = new Set(specieDi(b));
        return pokemonDi(a).map(nomeDi).filter(nome => nome && presenti.has(chiave(nome)));
    }

    const troppoSimili = (a, b) => inComune(a, b).length > MASSIMO_COMUNI;

    const stessoFormato = (a, b) => chiave(a && (a.categoria || a.category)) === chiave(b && (b.categoria || b.category));

    /**
     * I team non modificabili di `altri` (stesso formato) con cui `team` ha troppi Pokémon in comune, dal più simile al meno.
     * Un team che si può ancora modificare non conta: la regola vale solo verso quelli bloccati.
     */
    function conflittiDi(team, altri, opz = {}) {
        const bloccato = opz.bloccato;
        if (typeof bloccato !== 'function') throw new TypeError('SomiglianzaTeam: serve opz.bloccato(team)');
        const trovati = [];
        for (const altro of valori(altri)) {
            if (!altro || altro === team) continue;
            if (team && altro.id != null && altro.id === team.id) continue;       // il team stesso
            if (!stessoFormato(team, altro) || !bloccato(altro)) continue;
            const comuni = inComune(team, altro);
            if (comuni.length > MASSIMO_COMUNI) trovati.push({ con: altro, comuni });
        }
        return trovati.sort((x, y) => y.comuni.length - x.comuni.length);       // a parità resta l'ordine di `altri` (la sort è stabile)
    }

    /**
     * Quali team modificabili del Box sono fuori regola: Map id -> conflitti verso i team non modificabili.
     * I team già bloccati non compaiono (non si possono più cambiare), e nemmeno quelli di un formato senza la regola (opz.vale).
     */
    function mappaConflitti(teams, opz = {}) {
        const bloccato = opz.bloccato;
        if (typeof bloccato !== 'function') throw new TypeError('SomiglianzaTeam: serve opz.bloccato(team)');
        const vale = typeof opz.vale === 'function' ? opz.vale : () => true;
        const lista = valori(teams);
        const mappa = new Map();
        for (const team of lista) {
            if (!team || team.id == null || bloccato(team) || !vale(team)) continue;
            const c = conflittiDi(team, lista, { bloccato });
            if (c.length) mappa.set(team.id, c);
        }
        return mappa;
    }

    /**
     * Perché `team` non si può iscrivere adesso: [] se si può. Un team già non modificabile non conta (non è lui che può cambiare), e un team che non è dello stesso
     * formato nemmeno. I conflitti sono tre, ognuno una volta sola per team (se lo stesso team compare in più elenchi vale il primo): verso i team non modificabili
     * del formato ("bloccato"), verso quelli che si iscrivono insieme ("insieme") e verso quelli già iscritti ad altre stagioni con le iscrizioni aperte ("altrove").
     * Dal più simile al meno.
     */
    function conflittiIscrizione(team, ctx = {}) {
        const bloccato = ctx.bloccato;
        if (typeof bloccato !== 'function') throw new TypeError('SomiglianzaTeam: serve ctx.bloccato(team)');
        if (!team || bloccato(team)) return [];
        const visti = new Set(team.id != null ? [team.id] : []);
        const trovati = [];
        const aggiungi = (elenco, tipo, extra) => {
            for (const c of conflittiDi(team, elenco, { bloccato: () => true })) {
                if (c.con.id != null) {
                    if (visti.has(c.con.id)) continue;
                    visti.add(c.con.id);
                }
                trovati.push(Object.assign({}, c, { tipo }, extra ? extra(c.con) : null));
            }
        };
        aggiungi(valori(ctx.delFormato).filter(t => t && bloccato(t)), 'bloccato');
        aggiungi(valori(ctx.scelti).filter(t => t && !bloccato(t)), 'insieme');
        aggiungi(valori(ctx.altrove).filter(t => t && !bloccato(t)), 'altrove', t => ({ stagione: t.nomeStagione || '' }));
        return trovati.sort((x, y) => y.comuni.length - x.comuni.length);
    }

    const nomeTeam = t => String((t && t.nome) || '').trim() || 'another team';

    /** L'ultima riga del testo: cosa fare, a seconda del tipo del primo conflitto */
    function spiegazione(c) {
        const nome = `"${nomeTeam(c.con)}"`;
        if (c.tipo === 'insieme') {
            return `You've selected ${nome} too: two teams with more than ${MASSIMO_COMUNI} Pokémon in common can't be registered together, because both would become non-editable when the season starts.`;
        }
        if (c.tipo === 'altrove') {
            return `${nome} is already registered${c.stagione ? ` in "${c.stagione}"` : ''}: two teams with more than ${MASSIMO_COMUNI} Pokémon in common can't be registered while registrations are open, because both would become non-editable when the seasons start.`;
        }
        return `Max ${MASSIMO_COMUNI} are allowed with a team already registered in a season: change some Pokémon to enter this team in one.`;
    }

    /**
     * Il testo del fumetto: la prima riga è il titolo, le altre i dettagli (il fumetto del sito mette la prima riga in grassetto).
     * Nomina il team più simile; se ce ne sono altri fuori regola li elenca. L'ultima riga dice cosa fare, secondo il tipo del primo conflitto
     * (senza tipo: verso un team non modificabile, il caso del Box).
     */
    function testo(conflitti) {
        const c = valori(conflitti);
        if (!c.length) return '';
        const [primo, ...altri] = c;
        const righe = [`Breaks the similarity rule with "${nomeTeam(primo.con)}"`];
        righe.push(`${primo.comuni.length} Pokémon in common: ${primo.comuni.join(', ')}.`);
        for (const altro of altri) righe.push(`Also too similar to "${nomeTeam(altro.con)}" (${altro.comuni.length} in common).`);
        righe.push(spiegazione(primo));
        return righe.join('\n');
    }

    return { MASSIMO_COMUNI, STRUTTURE_CON_REGOLA, valeNelFormato, nomeDi, specieDi, inComune, troppoSimili, stessoFormato, conflittiDi, mappaConflitti, conflittiIscrizione, testo };
});
