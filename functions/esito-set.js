// =====================================================
// ESITO DI UN SET — Poké-Tournament
//
// Nel torneo i pareggi non esistono: ogni set ha un vincitore. Il simulatore di Showdown, però, nei formati fino alla quarta
// generazione chiude con "|tie" quando gli ultimi due Pokémon cadono insieme (Destiny Bond, Explosion, rinculo, Perish Song...),
// e lo stesso fa se si arriva al limite dei turni. Da quel "|tie" il sito non ricavava nessun vincitore: il set non contava
// per nessuno e il match chiudeva con un punteggio sbagliato.
//
// La regola del sito: vince chi cade PER ULTIMO. Il log lo dice: l'ultima riga "|faint|" prima del pareggio è del Pokémon
// caduto per ultimo, e il suo lato vince. (Dalla quinta generazione Showdown fa già così e scrive "|win|".)
// Se il pareggio non nasce da un KO (limite dei turni, battaglia senza fine) si guarda chi ha ancora più Pokémon, poi chi ha più
// salute; solo se è davvero tutto uguale decide una moneta, la stessa ogni volta per lo stesso log.
//
//   risolviPareggio(righe)  -> le stesse righe, con "|tie" sostituito da "|win|<nome del vincitore>" (se non c'è "|tie" non cambia nulla)
//   vincitoreDelLog(righe)  -> { lato: 'p1' | 'p2' | '', nome } (anche per un log con "|tie"); lato vuoto se il log non è finito
//   decidiLato(righe)       -> 'p1' | 'p2': chi vince un log che finisce in pareggio
//
// Funziona sia nelle Cloud Functions (require) sia nel browser (self.EsitoSet).
// ATTENZIONE: questo file esiste in due copie identiche, functions/esito-set.js (partite online)
// e docs/esito-set.js (partite locali e pagine). Modificane una e copiala sull'altra.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.EsitoSet = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const eTie = riga => riga === '|tie' || riga === '|tie|';
    const latoDi = ident => { const l = String(ident || '').slice(0, 2); return l === 'p1' || l === 'p2' ? l : ''; };

    /** I nomi dei due giocatori, dalle righe "|player|p1|Nome|avatar|...". */
    function nomiDelLog(righe) {
        const nomi = { p1: '', p2: '' };
        for (const r of righe) {
            if (!r.startsWith('|player|')) continue;
            const p = r.split('|');
            if (p[2] === 'p1' || p[2] === 'p2') { if (p[3]) nomi[p[2]] = p[3]; }
        }
        return nomi;
    }

    // Una piccola stringa → numero, per la moneta (stesso log, stessa moneta)
    function impronta(righe) {
        let h = 7;
        const testo = righe.join('\n');
        for (let i = 0; i < testo.length; i++) h = (h * 31 + testo.charCodeAt(i)) >>> 0;
        return h;
    }

    // Salute in percentuale: "56/100", "0 fnt", "100/100 par" -> 56, 0, 100
    function percentuale(campo) {
        if (!campo) return null;
        if (/\bfnt\b/.test(campo)) return 0;
        const m = /^(\d+)\s*\/\s*(\d+)/.exec(campo);
        return m && Number(m[2]) > 0 ? Math.round(100 * Number(m[1]) / Number(m[2])) : null;
    }

    /** Chi vince un log che finisce con un pareggio. `righe` sono quelle PRIMA del "|tie" (o tutte). */
    function decidiLato(righe) {
        const prima = [];
        for (const r of righe) { if (eTie(r)) break; prima.push(r); }

        // ultima caduta, e se dopo c'è stato ancora un turno
        let ultimaCaduta = -1, turnoDopo = false;
        prima.forEach((r, i) => {
            if (r.startsWith('|faint|')) { ultimaCaduta = i; turnoDopo = false; }
            else if (r.startsWith('|turn|')) turnoDopo = true;
        });

        // 1. il pareggio nasce da un KO (nessun turno dopo l'ultima caduta): vince chi è caduto per ultimo
        if (ultimaCaduta >= 0 && !turnoDopo) {
            const lato = latoDi(prima[ultimaCaduta].split('|')[2]);
            if (lato) return lato;
        }

        // 2. limite dei turni e simili: meno Pokémon caduti, poi più salute
        const cadute = { p1: new Set(), p2: new Set() };
        const salute = { p1: new Map(), p2: new Map() };
        for (const r of prima) {
            const p = r.split('|');
            const tipo = p[1];
            if (tipo === 'faint') { const l = latoDi(p[2]); if (l) cadute[l].add(String(p[2]).slice(5)); }
            if (['switch', 'drag', '-damage', '-heal', '-sethp'].includes(tipo)) {
                const l = latoDi(p[2]);
                const pct = percentuale(tipo === 'switch' || tipo === 'drag' ? p[4] : p[3]);
                if (l && pct !== null) salute[l].set(String(p[2]).slice(5), pct);
            }
        }
        if (cadute.p1.size !== cadute.p2.size) return cadute.p1.size < cadute.p2.size ? 'p1' : 'p2';
        const somma = l => [...salute[l].values()].reduce((a, b) => a + b, 0);
        if (somma('p1') !== somma('p2')) return somma('p1') > somma('p2') ? 'p1' : 'p2';

        // 3. tutto uguale: una moneta che non cambia per lo stesso log
        return impronta(prima) % 2 === 0 ? 'p1' : 'p2';
    }

    /** Le righe con "|tie" al posto del quale c'è "|win|<vincitore>". Le righe restano tante quante erano. */
    function risolviPareggio(righe) {
        if (!Array.isArray(righe) || !righe.some(eTie)) return righe;
        const nomi = nomiDelLog(righe);
        const lato = decidiLato(righe);
        const nome = nomi[lato] || (lato === 'p1' ? 'Player 1' : 'Player 2');
        return righe.map(r => (eTie(r) ? `|win|${nome}` : r));
    }

    /** { lato, nome } del vincitore di un log. Per un log in pareggio vale la regola del sito. Lato vuoto: il set non è finito. */
    function vincitoreDelLog(righe) {
        const risolte = risolviPareggio(righe || []);
        const nomi = nomiDelLog(risolte);
        for (let i = risolte.length - 1; i >= 0; i--) {
            if (!risolte[i].startsWith('|win|')) continue;
            const nome = risolte[i].slice(5);
            const lato = nome === nomi.p1 ? 'p1' : (nome === nomi.p2 ? 'p2' : '');
            return { lato, nome };
        }
        return { lato: '', nome: '' };
    }

    return { risolviPareggio, vincitoreDelLog, decidiLato, nomiDelLog };
});
