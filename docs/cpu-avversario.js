// =====================================================
// L'AVVERSARIO DELLA CPU — Poké-Tournament
//
// Quello che la CPU sa di chi ha davanti: come gioca di solito. Finora per la CPU l'avversario faceva sempre la stessa cosa, l'attacco
// migliore. Un allenatore vero invece, in un turno, ogni tanto si para, ogni tanto cambia, ogni tanto usa una mossa di stato: e come
// lo fa dipende dall'allenatore. Questo modulo tiene quelle abitudini (sono le stesse scelte da cui nasce la sua personalità, vedi
// personalita.js) e le trasforma negli scenari che la CPU valuta a ogni turno (cpu-ia.js).
//
// Le abitudini sono quattro quote che sommano a 1, per ogni decisione di un suo Pokémon in un turno:
//   attacco      una mossa che fa danni
//   protezione   una Protezione e simili (Protect, Detect, Wide Guard, Substitute...)
//   cambio       un cambio scelto a inizio turno
//   altro        una mossa di stato (si cura, si potenzia, mette il campo, aiuta il compagno, disturba)
// Da dove arrivano: players/<id>/stile (stile-giocatore.js le somma dai set giocati sul sito; le scrive il workflow "Stile dei giocatori").
//
// Quanto fidarsi di un allenatore: con pochi set le sue quote sono poco affidabili, quindi si mescolano con quelle medie della lega
// (forzaLega = quante decisioni "valgono" quanto la media: con tante decisioni conta lui, con poche la lega). Durante la partita la CPU
// guarda cosa fa davvero (osserva): le decisioni viste si sommano alle quote di partenza (forzaPartita = quante decisioni vale il
// punto di partenza), così si adatta a chi ha davanti anche senza nessun dato.
//
//   CpuAvversario.CATEGORIE, QUOTE_LEGA
//   CpuAvversario.daStile(stile)               -> { giocatore: { n, quote } | null, lega: { n, quote } | null, set }   (da players/<id>/stile; null = nessun dato)
//   CpuAvversario.crea(profilo, opzioni?)      -> il modello: .quote() .osserva(categoria) .visti() .nVisti() .nPrecedenti() .partenza()
//   CpuAvversario.scenari(quote, slot, opz)    -> [{ peso, categorie: { [slot]: categoria }, variante }]  gli scenari di un turno
//   CpuAvversario.categoriaMossa(mossa)        -> 'attacco' | 'protezione' | 'altro'   (per le mosse viste in battaglia)
//
// Funziona nel browser (window.CpuAvversario) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./azioni-mosse.js'));
    else radice.CpuAvversario = fabbrica(radice.AzioniMosse);
})(typeof self !== 'undefined' ? self : this, function (AzioniMosse) {
    'use strict';

    const CATEGORIE = ['attacco', 'protezione', 'cambio', 'altro'];

    // Le abitudini medie della lega (4.816 decisioni nei set giocati sul sito): quello che si sa di un allenatore di cui non si sa niente.
    // Il workflow ricalcola la media vera e la salva insieme al profilo di ognuno, quindi queste servono solo se mancano.
    const QUOTE_LEGA = { attacco: 0.734, protezione: 0.099, cambio: 0.038, altro: 0.129 };

    const FORZA_LEGA = 100;        // decisioni di un allenatore che valgono quanto la media della lega (con 100 decisioni, metà e metà)
    const FORZA_PARTITA = 40;      // decisioni viste in partita che valgono quanto il punto di partenza
    const FORZA_PRECEDENTI = 60;   // al massimo quante decisioni delle partite di prima (memoria della serie) contano come punto di partenza

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    /** Quote che sommano a 1 (valori negativi o mancanti valgono 0); se non c'è niente di valido, quelle della lega */
    function normalizza(q) {
        const out = {};
        let somma = 0;
        for (const k of CATEGORIE) { out[k] = Math.max(0, num(q && q[k])); somma += out[k]; }
        if (!(somma > 0)) return Object.assign({}, QUOTE_LEGA);
        for (const k of CATEGORIE) out[k] /= somma;
        return out;
    }

    /** Le quote (e quante decisioni sono) da una somma di scelte: { attacco, protezione, cambi, recupero, potenziamento, campo, supporto, disturbo, altro } */
    function quoteDaAzioni(a) {
        if (!a || typeof a !== 'object') return null;
        const attacco = Math.max(0, num(a.attacco));
        const protezione = Math.max(0, num(a.protezione));
        const cambio = Math.max(0, num(a.cambi));
        const altro = ['recupero', 'potenziamento', 'campo', 'supporto', 'disturbo', 'altro'].reduce((s, k) => s + Math.max(0, num(a[k])), 0);
        const n = attacco + protezione + cambio + altro;
        return n > 0 ? { n, quote: { attacco: attacco / n, protezione: protezione / n, cambio: cambio / n, altro: altro / n } } : null;
    }

    /** Il profilo di un allenatore dal nodo players/<id>/stile ({ set, azioni: {...}, lega: { azioni: {...} } }); null o vuoto = nessun dato */
    function daStile(stile) {
        const s = stile && typeof stile === 'object' ? stile : null;
        return {
            giocatore: s ? quoteDaAzioni(s.azioni) : null,
            lega: s && s.lega ? quoteDaAzioni(s.lega.azioni) : null,
            set: s ? Math.max(0, Math.round(num(s.set))) : 0,
            // le regole sulle situazioni imparate dai replay della lega (cpu-situazioni.js): { singoli, doppi }, ognuna { pesi } oppure assente
            situazioni: s && s.situazioni && typeof s.situazioni === 'object' ? s.situazioni : null
        };
    }

    /**
     * Le quote di partenza: quelle dell'allenatore tirate verso la media della lega tanto più, quanto meno decisioni ha alle spalle.
     * giocatore, lega: { n, quote } oppure null.
     */
    function stima(giocatore, lega, forzaLega) {
        const L = normalizza(lega && lega.quote ? lega.quote : QUOTE_LEGA);
        if (!giocatore || !(num(giocatore.n) > 0)) return L;
        const G = normalizza(giocatore.quote);
        const w = num(giocatore.n) / (num(giocatore.n) + forzaLega);
        const out = {};
        for (const k of CATEGORIE) out[k] = w * G[k] + (1 - w) * L[k];
        return normalizza(out);
    }

    /**
     * Il modello dell'avversario per una partita. profilo: il risultato di daStile (o null: si parte dalla media della lega).
     * opzioni: { forzaLega, forzaPartita, precedenti }. precedenti: le decisioni viste nelle partite di prima contro lo stesso allenatore
     * ({ attacco, protezione, cambio, altro }, dalla memoria della CPU: cpu-memoria.js); si sommano a quelle di questa partita, ma al massimo
     * valgono `forzaPrecedenti` decisioni, così durante la partita ci si adatta ancora.
     */
    function crea(profilo, opzioni = {}) {
        const forzaLega = opzioni.forzaLega != null ? opzioni.forzaLega : FORZA_LEGA;
        const forzaPartita = opzioni.forzaPartita != null ? opzioni.forzaPartita : FORZA_PARTITA;
        let partenza = stima(profilo && profilo.giocatore, profilo && profilo.lega, forzaLega);
        let situazioni = profilo && profilo.situazioni ? profilo.situazioni : null;
        const visti = { attacco: 0, protezione: 0, cambio: 0, altro: 0 };
        let nVisti = 0;
        // le partite di prima: le decisioni viste, tenute entro un tetto (le proporzioni restano)
        const forzaPrec = opzioni.forzaPrecedenti != null ? opzioni.forzaPrecedenti : FORZA_PRECEDENTI;
        const prec = { attacco: 0, protezione: 0, cambio: 0, altro: 0 };
        let nPrec = 0;
        if (opzioni.precedenti && typeof opzioni.precedenti === 'object') {
            const somma = CATEGORIE.reduce((t, k) => t + Math.max(0, num(opzioni.precedenti[k])), 0);
            if (somma > 0) {
                const f = Math.min(1, forzaPrec / somma);
                for (const k of CATEGORIE) { prec[k] = Math.max(0, num(opzioni.precedenti[k])) * f; nPrec += prec[k]; }
            }
        }
        return {
            /** Le quote di adesso: la partenza, più quello che si è visto fare nelle partite di prima e in questa */
            quote() {
                if (!nVisti && !nPrec) return Object.assign({}, partenza);
                const out = {};
                for (const k of CATEGORIE) out[k] = (forzaPartita * partenza[k] + prec[k] + visti[k]) / (forzaPartita + nPrec + nVisti);
                return normalizza(out);
            },
            /** Una decisione vista in partita ('attacco' | 'protezione' | 'cambio' | 'altro') */
            osserva(categoria) {
                if (CATEGORIE.includes(categoria)) { visti[categoria]++; nVisti++; }
            },
            visti: () => Object.assign({}, visti),
            nVisti: () => nVisti,
            nPrecedenti: () => nPrec,
            partenza: () => Object.assign({}, partenza),
            /** Le regole sulle situazioni del profilo ({ singoli, doppi }), o null */
            situazioni: () => situazioni,
            /** Cambia il profilo di partenza a partita iniziata (è arrivato dopo): quello che si è già visto resta */
            impostaProfilo(nuovo) { partenza = stima(nuovo && nuovo.giocatore, nuovo && nuovo.lega, forzaLega); situazioni = nuovo && nuovo.situazioni ? nuovo.situazioni : null; }
        };
    }

    /** Che tipo di scelta è una mossa vista in battaglia: attacco, protezione, o una mossa di stato (altro). Stessa classificazione delle statistiche. */
    function categoriaMossa(mossa) {
        const classe = AzioniMosse ? AzioniMosse.classeDi(mossa) : 'attacco';
        return classe === 'attacco' ? 'attacco' : classe === 'protezione' ? 'protezione' : 'altro';
    }

    // Le probabilità di un solo slot, dopo aver tolto ciò che non può fare in questo turno (il peso passa alle altre scelte, in proporzione)
    function pesiSlot(quote, s) {
        const w = {
            attacco: quote.attacco,
            protezione: quote.protezione * (s && s.fattoreProtezione != null ? Math.max(0, s.fattoreProtezione) : 1),
            cambio: s && s.puoCambiare === false ? 0 : quote.cambio,
            altro: quote.altro
        };
        // le regole della situazione in cui si trova il Pokémon (cpu-situazioni.js): ogni categoria vale di più o di meno
        if (s && s.moltiplicatori) for (const k of CATEGORIE) if (s.moltiplicatori[k] != null) w[k] *= Math.max(0, num(s.moltiplicatori[k]));
        return normalizza(w);
    }

    /**
     * Gli scenari di un turno: per ogni slot avversario in campo una scelta (attacco, protezione, cambio, altro) e la probabilità che
     * tutte insieme succedano (gli slot si scelgono per conto loro). Nel doppio, quando qualcuno attacca, ogni scenario si divide in
     * due varianti: attacca il bersaglio migliore (pesoVariante0) oppure l'altro. Si tengono i più probabili (almeno `soglia` ciascuno, al
     * massimo `max`) e i pesi si riportano a somma 1.
     *   quote: le quote di adesso (modello.quote())
     *   slot: per ogni slot, null (nessuno in campo) oppure { fattoreProtezione?: 0..1 (quanto è possibile che si pari: 0 se non può, meno se ha
     *         appena protetto), puoCambiare?: bool, moltiplicatori?: { attacco, protezione, cambio, altro } (la situazione, vedi cpu-situazioni.js) }
     *   opz: { doppio, soglia = 0.03, max = 8, pesoVariante0 = 0.65 }
     */
    function scenari(quote, slot, opz = {}) {
        const q = normalizza(quote);
        const doppio = !!opz.doppio;
        const soglia = opz.soglia != null ? opz.soglia : 0.03;
        const max = Math.max(1, opz.max != null ? opz.max : 8);
        const pesoVar0 = opz.pesoVariante0 != null ? opz.pesoVariante0 : 0.65;
        const attivi = (slot || []).map((s, i) => (s ? i : -1)).filter(i => i >= 0);
        if (!attivi.length) return [];

        let combinazioni = [{ peso: 1, categorie: {} }];
        for (const i of attivi) {
            const p = pesiSlot(q, slot[i]);
            const nuove = [];
            for (const c of combinazioni) {
                for (const k of CATEGORIE) {
                    if (p[k] > 0) nuove.push({ peso: c.peso * p[k], categorie: Object.assign({}, c.categorie, { [i]: k }) });
                }
            }
            combinazioni = nuove;
        }

        const tutti = [];
        for (const c of combinazioni) {
            const attacca = Object.values(c.categorie).includes('attacco');
            if (doppio && attacca) {
                tutti.push({ peso: c.peso * pesoVar0, categorie: c.categorie, variante: 0 });
                tutti.push({ peso: c.peso * (1 - pesoVar0), categorie: c.categorie, variante: 1 });
            } else tutti.push({ peso: c.peso, categorie: c.categorie, variante: 0 });
        }
        tutti.sort((a, b) => b.peso - a.peso);
        const tenuti = tutti.filter((s, i) => i === 0 || (i < max && s.peso >= soglia));
        const somma = tenuti.reduce((t, s) => t + s.peso, 0) || 1;
        return tenuti.map(s => ({ peso: s.peso / somma, categorie: s.categorie, variante: s.variante }));
    }

    return { CATEGORIE, QUOTE_LEGA, FORZA_LEGA, FORZA_PARTITA, FORZA_PRECEDENTI, normalizza, quoteDaAzioni, daStile, stima, crea, categoriaMossa, scenari };
});
