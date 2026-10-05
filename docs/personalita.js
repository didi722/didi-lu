// =====================================================
// PERSONALITÀ DELL'ALLENATORE — Poké-Tournament
//
// Dallo stile di lotta di un allenatore si ricava una "personalità" e un diagramma a ragnatela (Kiviat) con sei assi.
// I numeri sono le sue SCELTE nei set giocati sul sito, turno per turno (functions/statistiche-set.js le conta, Statistiche.calcola
// le somma in players[].azioni): quante volte ha attaccato, si è parato o curato, ha cambiato Pokémon, si è potenziato, ha messo il
// campo a suo favore, ha aiutato il compagno o disturbato l'avversario.
//
// Perché contano gli SCARTI e non i numeri: tutti attaccano più di quanto si proteggano. Quindi ogni asse confronta la quota di
// scelte dell'allenatore con quella media di TUTTI gli allenatori della lega (su tutti i set di tutti): chi usa Protezione un
// po' più della media risulta più difensivo anche se attacca sempre molto di più di quanto si protegga.
//
//   asse            conta (sul totale delle sue scelte)                   famiglia
//   attacco         mosse che fanno danni                                  offensiva
//   guardia         Protezione e simili + mosse che curano                 difensiva
//   cambio          cambi di Pokémon scelti a inizio turno                 difensiva
//   potenziamento   Swords Dance, Calm Mind, Dragon Dance...               stratega
//   campo           meteo, terreni, stanze, trappole, schermi, Tailwind    stratega
//   trucchi         stati e trucchi sull'avversario + aiuto al compagno    stratega
//
// Per ogni asse: scarto relativo = (quota sua - quota della lega) / quota della lega. Si divide per quanto gli allenatori si
// distinguono tra loro su quell'asse (z), si tempera con la quantità di dati (pochi set: ci si fida meno) e si porta su una
// scala 0-100 con 50 = "come la media della lega". La famiglia col punteggio più alto dà il nome alla personalità.
//
// Si sblocca dopo MIN_SET set analizzati (e quando almeno MIN_ALLENATORI allenatori hanno dati da confrontare).
// Funzione pura, niente DOM: funziona nel browser (window.Personalita) e in Node (test/personalita.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Personalita = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MIN_SET = 25;              // set con dati sulle scelte per sbloccare la personalità
    const MIN_ALLENATORI = 3;        // allenatori con dati da confrontare, per avere una "media della lega"
    const MIN_SET_CONFRONTO = 5;     // un allenatore con meno set non conta per capire quanto gli altri si distinguono
    const TEMPERA = 15;              // ogni z si moltiplica per set / (set + TEMPERA)
    const SCALA_MINIMA = 0.05;       // gli allenatori non si distinguono mai meno di così (scarto relativo)
    const PASSO = 22;                // punti sulla scala 0-100 per ogni z
    const SOGLIA_TIPO = 0.35;        // sotto questo z medio nessuna famiglia spicca: personalità equilibrata

    // somma delle chiavi di Statistiche.calcola(...).players[].azioni che formano la quota dell'asse
    const ASSI = [
        { id: 'attacco', nome: 'Attack', famiglia: 'offensiva', chiavi: ['attacco'], scalaBase: 0.12,
          descrizione: 'Moves that deal damage.' },
        { id: 'guardia', nome: 'Guard', famiglia: 'difensiva', chiavi: ['protezione', 'recupero'], scalaBase: 0.45,
          descrizione: 'Protect and its relatives, plus healing moves.' },
        { id: 'cambio', nome: 'Switch', famiglia: 'difensiva', chiavi: ['cambi'], scalaBase: 0.45,
          descrizione: 'Switching a Pokémon out on purpose at the start of the turn.' },
        { id: 'potenziamento', nome: 'Setup', famiglia: 'stratega', chiavi: ['potenziamento'], scalaBase: 0.45,
          descrizione: 'Boosting stats before attacking (Swords Dance, Calm Mind, Dragon Dance...).' },
        { id: 'campo', nome: 'Field', famiglia: 'stratega', chiavi: ['campo'], scalaBase: 0.45,
          descrizione: 'Weather, terrain, Trick Room, Tailwind, hazards and screens.' },
        { id: 'trucchi', nome: 'Tricks', famiglia: 'stratega', chiavi: ['disturbo', 'supporto'], scalaBase: 0.45,
          descrizione: 'Status conditions and tricks on the opponent, and helping a teammate.' }
    ];

    const FAMIGLIE = {
        offensiva: { id: 'offensiva', nome: 'Aggressor', icona: '⚔️',
            descrizione: 'You take the fight to the opponent.' },
        difensiva: { id: 'difensiva', nome: 'Guardian', icona: '🛡️',
            descrizione: 'You play it safe:  protect, healing and safe-switching.' },
        stratega: { id: 'stratega', nome: 'Strategist', icona: '♟️',
            descrizione: 'You win with plans: setup, field control, support and tricks.' },
        equilibrata: { id: 'equilibrata', nome: 'All-rounder', icona: '⚖️',
            descrizione: 'You calibrate every match adapting to your opponent.' }
    };

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const limita = (x, a, b) => Math.max(a, Math.min(b, x));
    const arrotonda = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();

    const sommaChiavi = (azioni, chiavi) => chiavi.reduce((s, k) => s + num(azioni && azioni[k]), 0);
    const quota = (azioni, asse) => {
        const dec = num(azioni && azioni.decisioni);
        return dec > 0 ? sommaChiavi(azioni, asse.chiavi) / dec : 0;
    };
    const mediaSemplice = lista => (lista.length ? lista.reduce((s, x) => s + x, 0) / lista.length : 0);
    const deviazione = lista => {
        if (lista.length < 2) return 0;
        const m = mediaSemplice(lista);
        return Math.sqrt(mediaSemplice(lista.map(x => (x - m) ** 2)));
    };

    /**
     * Le quote medie della lega (su tutte le scelte di tutti) e quanto gli allenatori si distinguono tra loro.
     * @param {Array} giocatori  Statistiche.calcola(...).players
     * @returns {{ allenatori: number, set: number, assi: { [asse]: { quota, scala } } }}
     */
    function lega(giocatori) {
        const con = (giocatori || []).filter(g => g && g.azioni && num(g.azioni.decisioni) > 0);
        const totale = {};
        for (const g of con) for (const k of Object.keys(g.azioni)) totale[k] = (totale[k] || 0) + num(g.azioni[k]);
        const confrontabili = con.filter(g => num(g.azioni.setConDati) >= MIN_SET_CONFRONTO);
        const assi = {};
        for (const a of ASSI) {
            const q = quota(totale, a);
            // quanto si distinguono i singoli allenatori (scarto relativo): con pochi allenatori si usa una scala di base
            let scala = a.scalaBase;
            if (confrontabili.length >= 4 && q > 0) {
                const scarti = confrontabili.map(g => (quota(g.azioni, a) - q) / q);
                scala = Math.max(SCALA_MINIMA, deviazione(scarti));
            }
            assi[a.id] = { quota: q, scala };
        }
        return { allenatori: con.length, set: num(totale.setConDati), assi };
    }

    /**
     * La personalità di un allenatore.
     * @param {Array} giocatori  Statistiche.calcola(...).players
     * @param {string} idAllenatore
     * @returns {{ id, stato: 'nessun-dato'|'bloccata'|'in-attesa'|'pronta', set, setServono, decisioni, allenatoriConDati,
     *             assi?: Array, famiglie?: object, tipo?: object, frasi?: string[] }}
     */
    function calcola(giocatori, idAllenatore) {
        const id = idDi(idAllenatore);
        const g = (giocatori || []).find(x => idDi(x && x.id) === id);
        const azioni = (g && g.azioni) || {};
        const set = num(azioni.setConDati);
        const base = { id, set, setServono: MIN_SET, decisioni: num(azioni.decisioni), allenatoriConDati: 0 };
        const L = lega(giocatori);
        base.allenatoriConDati = L.allenatori;
        if (set < MIN_SET) return { ...base, stato: set ? 'bloccata' : 'nessun-dato' };
        if (L.allenatori < MIN_ALLENATORI) return { ...base, stato: 'in-attesa', allenatoriServono: MIN_ALLENATORI };

        const fiducia = set / (set + TEMPERA);
        const assi = ASSI.map(a => {
            const mia = quota(azioni, a), media = L.assi[a.id].quota, scala = L.assi[a.id].scala;
            const scarto = media > 0 ? (mia - media) / media : 0;
            const z = (scarto / scala) * fiducia;
            return {
                id: a.id, nome: a.nome, famiglia: a.famiglia, descrizione: a.descrizione,
                quota: mia, quotaLega: media,
                scartoPerc: arrotonda(scarto * 100, 0),
                z: arrotonda(z, 2),
                valore: Math.round(limita(50 + PASSO * z, 4, 96))
            };
        });

        const famiglie = {};
        for (const f of ['offensiva', 'difensiva', 'stratega']) {
            famiglie[f] = arrotonda(mediaSemplice(assi.filter(a => a.famiglia === f).map(a => a.z)), 2);
        }
        const migliore = Object.entries(famiglie).sort((a, b) => b[1] - a[1])[0];
        const tipo = migliore[1] >= SOGLIA_TIPO ? FAMIGLIE[migliore[0]] : FAMIGLIE.equilibrata;

        // gli assi che si notano di più (in più o in meno), per le frasi
        const spiccano = assi.filter(a => Math.abs(a.scartoPerc) >= 15)
            .sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
        const frasi = spiccano.map(a => `${a.nome}: ${arrotonda(a.quota * 100, 0)}% of your choices against ${arrotonda(a.quotaLega * 100, 0)}% for the league (${a.scartoPerc > 0 ? '+' : ''}${a.scartoPerc}%).`);

        return { ...base, stato: 'pronta', assi, famiglie, tipo, frasi };
    }

    /**
     * I vertici di un diagramma a ragnatela: il primo asse in alto, gli altri in senso orario.
     * @param {number[]} valori  0-100 (50 = media della lega)
     * @returns {{ x: number, y: number }[]}  in unità del disegno, con il centro in (cx, cy)
     */
    function vertici(valori, raggio, cx = raggio, cy = raggio) {
        const n = valori.length || 1;
        return valori.map((v, i) => {
            const angolo = -Math.PI / 2 + (i * 2 * Math.PI) / n;
            const r = (raggio * limita(num(v), 0, 100)) / 100;
            return { x: arrotonda(cx + r * Math.cos(angolo), 1), y: arrotonda(cy + r * Math.sin(angolo), 1), angolo };
        });
    }

    return { MIN_SET, MIN_ALLENATORI, ASSI, FAMIGLIE, lega, calcola, quota, vertici };
});
