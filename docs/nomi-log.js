// =====================================================
// NOMI LOG — Poké-Tournament
//
// Il client grafico di Showdown identifica i Pokémon di un lato dal soprannome e dai dettagli
// ("p1a: Calyrex" + "Calyrex-Shadow, L50"). Due Pokémon dello stesso team con lo stesso nome e,
// peggio, la stessa forma (due Calyrex-Shadow) per lui sono lo stesso Pokémon: lo schermo ne
// mostra uno solo o ne nasconde uno, e la colonna del player segna un solo "IN" e un solo KO.
//
// nomi-unici.js risolve il problema alla fonte, ma solo per i match che partono dopo il deploy
// delle Cloud Functions. Questo file lo risolve in lettura: riscrive le righe del log pubblico
// prima che arrivino al client, dando ai Pokémon doppi gli stessi nomi che darebbe nomi-unici.js
// ("Shadow Calyrex", "Shadow Calyrex 2"). Con il server già aggiornato i nomi arrivano unici e
// qui non si tocca niente.
//
// Cosa fa, riga per riga:
//   - dal team preview (|poke|) sa quali specie ci sono in ogni lato: solo i Pokémon la cui specie
//     base compare più volte, e il cui nome è quello di default (la specie), vengono rinominati;
//   - a ogni |switch| |drag| |replace| decide chi è entrato. Due Pokémon identici non si
//     distinguono dal testo: li si distingue come farebbe una persona, cioè uno non può
//     stare in due posti, uno svenuto non rientra, e chi rientra ha la salute che aveva quando è uscito;
//   - ogni altro riferimento "p1a: Nome" prende il nome di chi occupa quella posizione.
//
// Funziona nel browser (window.NomiLog) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.NomiLog = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const chiave = n => String(n == null ? '' : n).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const IDENT = /^((?:\[of\] )?)(p[1-4])([a-d]): (.*)$/;

    // "175/175 par" -> 100, "0 fnt" -> 0, senza salute -> null
    function percento(testo) {
        const m = /^(\d+)(?:\/(\d+))?/.exec(String(testo || '').trim());
        if (!m) return null;
        if (m[2] === undefined) return Number(m[1]) === 0 ? 0 : null;
        return Number(m[2]) ? Math.round(Number(m[1]) / Number(m[2]) * 100) : null;
    }

    /**
     * @param {object} opzioni
     * @param {(specie: string) => string} opzioni.baseDi        "Calyrex-Ice" -> "Calyrex"
     * @param {(specie: string, base: string) => string} opzioni.nomeForma   "Calyrex-Ice" -> "Ice Calyrex" ('' se non è una forma)
     * @param {(radice: string, n: number) => string} opzioni.conNumero      "Ice Calyrex", 2 -> "Ice Calyrex 2"
     */
    function creaRiscrittore({ baseDi, nomeForma, conNumero }) {
        let lati = {};

        const nuovoLato = () => ({
            specie: [],                 // forme viste nel team preview
            occupanti: {},              // 'a' | 'b' -> { alias, gemello } di chi è in campo (null se non rinominato)
            gemelli: new Map()          // chiave della forma -> [{ n, alias, visto, ko, slot, hp }]
        });
        const lato = l => (lati[l] ||= nuovoLato());
        const baseChiave = specie => chiave(baseDi(specie));

        function reset() { lati = {}; }

        // Quanti Pokémon del team hanno questa specie base / questa forma
        const quantiDiBase = (L, specie) => L.specie.filter(s => baseChiave(s) === baseChiave(specie)).length;
        const quantiDiForma = (L, specie) => L.specie.filter(s => chiave(s) === chiave(specie)).length;

        // Si rinomina solo chi ha il nome di default e ha un "gemello" di specie base nel team
        function daRinominare(L, nome, forma) {
            if (quantiDiBase(L, forma) < 2) return false;
            return chiave(nome) === chiave(forma) || chiave(nome) === baseChiave(forma);
        }

        const aliasDi = (forma, n) => {
            const radiceNome = nomeForma(forma, baseDi(forma)) || forma;
            return n > 1 ? conNumero(radiceNome, n) : radiceNome;
        };

        // Chi è entrato tra i Pokémon identici di quella forma
        function scegliGemello(L, forma, hp) {
            const k = chiave(forma);
            let lista = L.gemelli.get(k);
            if (!lista) {
                lista = Array.from({ length: Math.max(1, quantiDiForma(L, forma)) }, (_, i) => ({
                    n: i + 1, alias: aliasDi(forma, i + 1), visto: false, ko: false, slot: null, hp: null
                }));
                L.gemelli.set(k, lista);
            }
            const liberi = lista.filter(g => !g.ko && g.slot === null);
            const candidati = liberi.length ? liberi : lista.filter(g => g.slot === null);
            const vistiConLaStessaSalute = candidati.filter(g => g.visto && g.hp === hp);
            return vistiConLaStessaSalute[0]
                || candidati.find(g => !g.visto)
                || [...candidati].sort((x, y) => Math.abs((x.hp ?? 0) - (hp ?? 0)) - Math.abs((y.hp ?? 0) - (hp ?? 0)))[0]
                || lista[0];
        }

        function entra(l, slot, nome, dettagli, salute) {
            const L = lato(l);
            const prima = L.occupanti[slot];
            if (prima && prima.gemello) prima.gemello.slot = null;       // chi usciva torna in panchina
            L.occupanti[slot] = null;

            const forma = String(dettagli || '').split(',')[0].trim();
            if (!daRinominare(L, nome, forma)) return null;

            const hp = percento(salute);
            let alias, gemello = null;
            if (quantiDiForma(L, forma) > 1) {
                gemello = scegliGemello(L, forma, hp);
                gemello.visto = true;
                gemello.slot = slot;
                gemello.hp = hp;
                alias = gemello.alias;
            } else {
                alias = aliasDi(forma, 1);
            }
            L.occupanti[slot] = { alias, gemello };
            return alias;
        }

        const occupante = (l, slot) => lato(l).occupanti[slot] || null;

        function salute(l, slot, testo) {
            const o = occupante(l, slot);
            if (!o || !o.gemello) return;
            const hp = percento(testo);
            if (hp !== null) o.gemello.hp = hp;
        }

        // Riscrive i riferimenti "p1a: Nome" di una parte della riga
        function riscriviParte(parte) {
            const m = IDENT.exec(parte);
            if (!m) return parte;
            const o = occupante(m[2], m[3]);
            return o ? `${m[1]}${m[2]}${m[3]}: ${o.alias}` : parte;
        }

        function riga(testo) {
            if (testo.charCodeAt(0) !== 124) return testo;               // non inizia con "|"
            const p = testo.split('|');
            const comando = p[1];

            if (comando === 'clearpoke') { reset(); return testo; }
            if (comando === 'poke') {
                const forma = String(p[3] || '').split(',')[0].trim();
                if (forma && /^p[1-4]$/.test(p[2])) lato(p[2]).specie.push(forma);
                return testo;
            }

            if (comando === 'switch' || comando === 'drag' || comando === 'replace') {
                const m = /^(p[1-4])([a-d]): (.*)$/.exec(p[2] || '');
                if (!m) return testo;
                const alias = entra(m[1], m[2], m[3], p[3], p[4]);
                if (alias === null) return testo;
                p[2] = `${m[1]}${m[2]}: ${alias}`;
                return p.join('|');
            }

            // salute e KO di chi occupa la posizione, letti prima di riscrivere
            if (comando === '-damage' || comando === '-heal') {
                const m = /^(p[1-4])([a-d]): /.exec(p[2] || '');
                if (m) salute(m[1], m[2], p[3]);
            } else if (comando === '-sethp') {
                for (const i of [2, 4]) {
                    const m = /^(p[1-4])([a-d]): /.exec(p[i] || '');
                    if (m) salute(m[1], m[2], p[i + 1]);
                }
            } else if (comando === 'faint') {
                const m = /^(p[1-4])([a-d]): /.exec(p[2] || '');
                const o = m && occupante(m[1], m[2]);
                if (o && o.gemello) { o.gemello.ko = true; o.gemello.hp = 0; }
            }

            let cambiata = false;
            for (let i = 2; i < p.length; i++) {
                const nuova = riscriviParte(p[i]);
                if (nuova !== p[i]) { p[i] = nuova; cambiata = true; }
            }
            const risultato = cambiata ? p.join('|') : testo;

            // Ally Switch: chi era lì cambia posto (dopo aver riscritto la riga, che parla di prima dello scambio)
            if (comando === 'swap') {
                const m = /^(p[1-4])([a-d]): /.exec(p[2] || '');
                if (m) {
                    const L = lato(m[1]);
                    const verso = /^\d+$/.test(p[3] || '') ? 'ab'[Number(p[3])] : (/^p[1-4]([a-d])/.exec(p[3] || '') || [])[1];
                    if (verso && verso !== m[2]) {
                        [L.occupanti[m[2]], L.occupanti[verso]] = [L.occupanti[verso] || null, L.occupanti[m[2]] || null];
                        for (const [s, o] of Object.entries(L.occupanti)) if (o && o.gemello) o.gemello.slot = s;
                    }
                }
            }
            return risultato;
        }

        return {
            reset,
            riscrivi: righe => righe.map(riga)
        };
    }

    return { creaRiscrittore, percento };
});
