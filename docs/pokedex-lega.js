// =====================================================
// POKÉDEX DELLA LEGA — Poké-Tournament
//
// La scheda "Pokédex" di Stats: tutti i Pokémon in ordine di Pokédex nazionale, a colori quelli che sono stati usati e in grigio quelli mai usati, con quanti ne mancano
// per regione (Kanto, Johto...). Si guarda quello della lega (tutti gli allenatori insieme) o quello di un allenatore.
//
// È pura: niente DOM, niente Firebase. Riceve il risultato di UsoGlobale.calcola (uso-globale.js), quindi vale lo stesso perimetro di Stats (la stagione e il formato scelti) e
// la stessa regola dell'uso: un Pokémon è "usato" se sta in un team che ha giocato almeno un set ufficiale (i team iscritti ma mai scesi in campo, o solo provati nel
// Box, non contano: non si rivela nulla che gli avversari non abbiano già visto). Una forma (Mega, regionale, Urshifu-Rapid-Strike...) conta per la sua specie base:
// la casella del Pokédex è una sola, e la scheda dice quali forme sono state usate.
//
// Le specie e i numeri vengono da pokedex-nazionale.js (generato dai dati del simulatore: tools/pokedex-nazionale/genera.cjs). Le icone sono quelle di Showdown
// (un'unica immagine con tutte le icone da 40x30, in 12 colonne: la casella n. N sta alla colonna N % 12, riga floor(N / 12)): pokedex-lega.css le mette al loro posto.
//
//   PokedexLega.REGIONI                       [{ id, nome, da, a }]: le regioni, con l'intervallo dei numeri
//   PokedexLega.numeroDi(id)                  il numero nel Pokédex nazionale di una specie o forma ("urshifurapidstrike" → 892); 0 se non la conosce
//   PokedexLega.giocatori(uso)                gli id degli allenatori che hanno team nel perimetro, in ordine alfabetico
//   PokedexLega.calcola(uso, { chi })         il modello: { chi, totale, usati, perc, regioni: [{ id, nome, da, a, totale, usati, celle: [...] }], sconosciute }
//   PokedexLega.htmlPokedex(modello, opz)     l'HTML della scheda (regioni e caselle); opz: cerca (nome, forma o numero), esc
//
// Funziona nel browser (window.PokedexLega) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./pokedex-nazionale.js'));
    else radice.PokedexLega = fabbrica(radice.PokedexNazionale);
})(typeof self !== 'undefined' ? self : this, function (Nazionale) {
    'use strict';

    const COLONNE_ICONE = 12;       // l'immagine delle icone di Showdown: 12 per riga, ognuna 40x30

    // Le regioni (generazioni) e i numeri che comprendono
    const REGIONI = [
        { id: 'kanto', nome: 'Kanto', da: 1, a: 151 },
        { id: 'johto', nome: 'Johto', da: 152, a: 251 },
        { id: 'hoenn', nome: 'Hoenn', da: 252, a: 386 },
        { id: 'sinnoh', nome: 'Sinnoh', da: 387, a: 493 },
        { id: 'unova', nome: 'Unova', da: 494, a: 649 },
        { id: 'kalos', nome: 'Kalos', da: 650, a: 721 },
        { id: 'alola', nome: 'Alola', da: 722, a: 809 },
        { id: 'galar', nome: 'Galar & Hisui', da: 810, a: 905 },
        { id: 'paldea', nome: 'Paldea', da: 906, a: 1025 }
    ];

    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const idSpecie = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const esc0 = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const tre = n => String(n).padStart(3, '0');
    const perc = (parte, tutto) => (tutto > 0 ? Math.round((parte / tutto) * 1000) / 10 : 0);

    const tabella = (Nazionale && Nazionale.ids) ? Nazionale : { nomi: [], ids: {} };
    const TOTALE = tabella.nomi.length;
    // le specie base (non le forme), per riconoscere le forme che il simulatore non elenca ("alcremieribbonsweet" comincia con "alcremie")
    let basi = null;
    const speciBase = () => basi || (basi = tabella.nomi.map((nome, i) => ({ id: idSpecie(nome), num: i + 1 })).filter(x => x.id.length >= 4).sort((a, b) => b.id.length - a.id.length));

    /** Il numero nel Pokédex nazionale di una specie o forma; 0 se non si sa (nomi strani, Pokémon fan-made) */
    function numeroDi(id) {
        const k = idSpecie(id);
        if (!k) return 0;
        if (tabella.ids[k]) return tabella.ids[k];
        // una forma solo estetica che il simulatore non elenca: vale la specie base più lunga con cui comincia il nome
        const base = speciBase().find(b => k.length > b.id.length && k.startsWith(b.id));
        return base ? base.num : 0;
    }

    /** Gli allenatori che hanno team (che hanno giocato) nel perimetro del risultato di UsoGlobale */
    function giocatori(uso) {
        return [...new Set((uso && Array.isArray(uso.squadre) ? uso.squadre : []).map(s => idDi(s && s.giocatore)).filter(Boolean))].sort();
    }

    /**
     * Il Pokédex di `chi` (l'id di un allenatore; vuoto: tutta la lega) a partire dal risultato di UsoGlobale.calcola.
     * Ogni casella: { num, nome, usato, team (in quanti team), giocatori (quanti allenatori), forme: [{ specieId, nome, team }] dalla più usata, specieId (la forma più usata) }.
     * `sconosciute`: le specie usate che non hanno un posto nel Pokédex (non si perdono: la scheda dice quante).
     */
    function calcola(uso, { chi = '' } = {}) {
        const quale = idDi(chi);
        const nomiForme = new Map(((uso && Array.isArray(uso.specie)) ? uso.specie : []).map(s => [idSpecie(s.specieId), s.nome]));
        const perNumero = new Map();
        const sconosciute = new Set();
        let team = 0;
        for (const sq of ((uso && Array.isArray(uso.squadre)) ? uso.squadre : [])) {
            if (!sq || (quale && idDi(sq.giocatore) !== quale)) continue;
            team++;
            const visti = new Set();
            for (const sid of (Array.isArray(sq.specieId) ? sq.specieId : [])) {
                const n = numeroDi(sid);
                if (!n) { if (idSpecie(sid)) sconosciute.add(nomiForme.get(idSpecie(sid)) || String(sid)); continue; }
                const e = perNumero.get(n) || { team: 0, giocatori: new Set(), forme: new Map() };
                perNumero.set(n, e);
                e.forme.set(idSpecie(sid), (e.forme.get(idSpecie(sid)) || 0) + 1);
                e.giocatori.add(idDi(sq.giocatore));
                if (!visti.has(n)) { visti.add(n); e.team++; }
            }
        }

        let usati = 0;
        const regioni = REGIONI.map(r => {
            const celle = [];
            let usatiRegione = 0;
            for (let num = r.da; num <= r.a; num++) {
                const e = perNumero.get(num);
                const forme = e ? [...e.forme.entries()].map(([specieId, n]) => ({ specieId, nome: nomiForme.get(specieId) || specieId, team: n }))
                    .sort((a, b) => b.team - a.team || a.nome.localeCompare(b.nome)) : [];
                if (e) usatiRegione++;
                celle.push({
                    num, nome: tabella.nomi[num - 1] || `#${tre(num)}`, usato: !!e, team: e ? e.team : 0, giocatori: e ? e.giocatori.size : 0,
                    forme, specieId: forme[0] ? forme[0].specieId : ''
                });
            }
            usati += usatiRegione;
            return { ...r, totale: r.a - r.da + 1, usati: usatiRegione, celle };
        });
        return { chi: quale, team, totale: TOTALE, usati, perc: perc(usati, TOTALE), regioni, sconosciute: [...sconosciute].sort((a, b) => a.localeCompare(b)) };
    }

    // =================================================
    // L'HTML (stringhe: la pagina le mette in un contenitore)
    // =================================================
    const quanti = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;

    // il fumetto: solo il numero e il nome (quanto è usato lo dicono il colore, il numero di team e la scheda che si apre col clic)
    const titoloCella = c => `#${tre(c.num)} ${c.nome}`;

    function htmlCella(c, { esc }) {
        const titolo = titoloCella(c);
        const x = c.num % COLONNE_ICONE, y = Math.floor(c.num / COLONNE_ICONE);
        const dentro = `<span class="pdx-icona" aria-hidden="true" style="--x:${x};--y:${y}"></span><span class="pdx-num" aria-hidden="true">${tre(c.num)}</span>${c.usato && c.team > 1 ? `<span class="pdx-n" aria-hidden="true">${esc(c.team)}</span>` : ''}`;
        // una casella usata si apre sulla scheda di uso della sua forma più usata; una mai usata non fa niente
        return c.usato
            ? `<button type="button" class="pdx-cella pdx-usato" data-apri="usage" data-chiave="${esc(c.specieId)}" data-num="${c.num}" title="${esc(titolo)}" aria-label="${esc(titolo)}">${dentro}</button>`
            : `<span class="pdx-cella pdx-mai" data-num="${c.num}" title="${esc(titolo)}" role="img" aria-label="${esc(titolo)}">${dentro}</span>`;
    }

    /**
     * Le regioni con le loro caselle. opzioni: esc, cerca (nome o numero).
     * Una regione senza caselle da mostrare non compare; senza niente da mostrare dice perché.
     */
    function htmlPokedex(m, { esc = esc0, cerca = '' } = {}) {
        const q = String(cerca || '').trim().toLowerCase().replace(/^#/, '');
        const passa = c => {
            if (!q) return true;
            if (/^\d+$/.test(q)) return Number(q) === c.num;        // un numero (anche "#038"): quella casella e basta
            return c.nome.toLowerCase().includes(q) || c.forme.some(f => f.nome.toLowerCase().includes(q));
        };
        const parti = [];
        let mostrate = 0;
        for (const r of m.regioni) {
            const celle = r.celle.filter(passa);
            if (!celle.length) continue;
            mostrate += celle.length;
            const p = perc(r.usati, r.totale);
            parti.push(`<section class="pdx-regione" data-regione="${esc(r.id)}" aria-label="${esc(r.nome)}">
                <header class="pdx-testa"><h3>${esc(r.nome)}</h3><span class="pdx-intervallo">#${tre(r.da)}–#${tre(r.a)}</span><span class="pdx-conto"><b>${r.usati}</b>/${r.totale}</span>
                    <span class="pdx-barra" role="img" aria-label="${esc(`${r.usati} of ${r.totale} used`)}"><i style="width:${p}%"></i></span></header>
                <div class="pdx-griglia">${celle.map(c => htmlCella(c, { esc })).join('')}</div>
            </section>`);
        }
        if (!mostrate) {
            const motivo = q ? `Nothing matches “${esc(cerca)}”.` : 'Nothing to show.';
            return `<p class="vuoto">${motivo}</p>`;
        }
        return parti.join('');
    }

    return { REGIONI, COLONNE_ICONE, TOTALE, idSpecie, numeroDi, giocatori, calcola, htmlPokedex };
});
