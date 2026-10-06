// =====================================================
// TEAM VISIBILI (stagioni a scheda chiusa)
// In una stagione "closed sheet" (seasons/<id>/info/open_sheet === false) i team iscritti degli avversari non si vedono
// finché non sono scesi in campo almeno una volta contro di te: allora si vedono, ma solo i 6 Pokémon (niente strumenti,
// mosse, abilità). I tuoi team li vedi sempre. Con la scheda aperta non cambia nulla: si vedono tutti.
//
//   squadreAffrontate(showdowns, io)             -> Set delle squadre (giocatore|team|formato) che hanno giocato contro "io"
//                                                    in questa stagione. showdowns = seasons/<id>/showdowns
//   dividiTeam({ chiusa, io, giocatore, teams, affrontate, formato? })
//                                                -> { visibili: [...], nascosti: n } i team di un giocatore da mostrare
//
// "Sceso in campo" = c'è un match registrato di quella stagione in cui quel team (per nome E formato) ha affrontato "io".
// Il formato conta: un giocatore può avere due team con lo stesso nome in formati diversi, e uno solo dei due ha giocato contro di te.
// Si confrontano nomi in minuscolo e senza spazi ai lati, come fanno già il Box e la pagina dei match.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.TeamVisibili = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const chiave = nome => String(nome == null ? '' : nome).trim().toLowerCase();
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const nomeDi = t => (t && typeof t.nome === 'object' && t.nome ? t.nome.valore : t && t.nome);
    const squadra = (giocatore, team, formato) => `${chiave(giocatore)}|${chiave(team)}${formato ? `|${chiave(formato)}` : ''}`;

    function squadreAffrontate(showdowns, io) {
        const mio = chiave(io);
        const trovate = new Set();
        if (!mio) return trovate;
        for (const sd of valori(showdowns)) {
            const info = (sd && sd.info) || {};
            for (const m of valori(sd && sd.matches)) {
                if (!m) continue;
                const p1 = chiave(m.player1Id || info.player1Id || m.player1 || info.player1);
                const p2 = chiave(m.player2Id || info.player2Id || m.player2 || info.player2);
                if (!p1 || !p2) continue;
                const formato = m.categoria || info.categoria;
                if (p1 === mio && m.team2) trovate.add(squadra(p2, m.team2, formato));
                else if (p2 === mio && m.team1) trovate.add(squadra(p1, m.team1, formato));
            }
        }
        return trovate;
    }

    // un team è stato affrontato se c'è un match giocato contro "io" con quel nome e in quel formato (un match senza formato vale per ogni formato);
    // se il formato non si sa si guarda soltanto il nome
    function affrontato(visti, giocatore, nome, formato) {
        if (visti.has(squadra(giocatore, nome))) return true;
        if (formato) return visti.has(squadra(giocatore, nome, formato));
        const inizio = `${squadra(giocatore, nome)}|`;
        for (const v of visti) if (v.startsWith(inizio)) return true;
        return false;
    }

    function dividiTeam({ chiusa, io, giocatore, teams, affrontate, formato }) {
        const lista = Array.isArray(teams) ? teams : valori(teams);
        if (!chiusa || (chiave(io) && chiave(io) === chiave(giocatore))) return { visibili: lista, nascosti: 0 };
        const visti = affrontate || new Set();
        const visibili = lista.filter(t => affrontato(visti, giocatore, nomeDi(t), formato));
        return { visibili, nascosti: lista.length - visibili.length };
    }

    return { squadreAffrontate, dividiTeam, chiave, nomeDi };
});
