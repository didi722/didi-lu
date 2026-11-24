// =====================================================
// IL COPIONE DELLA PALESTRA — Poké-Tournament
//
// La CPU che difende una palestra gioca con i team del proprietario. Perché li giochi come li giocherebbe lui, il proprietario la allena: dalla pagina della sua
// palestra fa partire delle partite di allenamento (come una prova dal Box) e la CPU guarda come gioca con quel team. Questo modulo è il suo quaderno di appunti:
// un "copione" per ogni team della palestra, che si arricchisce lezione dopo lezione.
//
// Cosa si ricorda (tutto aggregato: niente partite intere):
//   memoria    come il proprietario ha giocato ogni Pokémon (la memoria della serie, cpu-memoria.js): quante volte l'ha portato e quante volte l'ha mandato in campo per primo,
//              che mosse usa (e quali al primo turno in campo), quanto si para, cambia o usa mosse di stato
//   contro     in anteprima, cosa porta e chi manda in campo per primo quando nei sei dell'avversario c'è un certo Pokémon:
//              { <specie avversaria>: { n: quante volte c'era, p: { <mio Pokémon>: quante volte l'ha portato }, l: { <mio Pokémon>: quante volte l'ha messo in apertura } } }
//   lezioni    quante lezioni pesate: una lezione di almeno TURNI_LEZIONE_PIENA turni vale 1, una più corta in proporzione (si può smettere quando si vuole)
//   partite, scelte, t     quante lezioni si sono salvate, quante scelte si sono viste, quando è stata l'ultima
// I numeri "invecchiano": a ogni lezione quelle di prima valgono un po' meno (DECADIMENTO), così se il proprietario cambia modo di giocare la CPU se ne accorge.
//
// Dove sta: players/<proprietario>/palestraAllenamento/<id del team nel Box> (il sito lo scrive a fine lezione, lo legge chi sfida la palestra: cpu-ia.js lo usa in
// anteprima e nelle mosse). Il progresso dell'allenamento (la barra: progresso) dipende dalle lezioni e da quanti Pokémon del team sono già stati visti giocare.
//
//   CpuCopione.VERSIONE, OBIETTIVO_LEZIONI, TURNI_LEZIONE_PIENA, MIN_TURNI
//   CpuCopione.idSpecie(nome)                         "Urshifu-Rapid-Strike" -> "urshifurapidstrike"
//   CpuCopione.chiaveSpecie(nome)                     la chiave di un Pokémon nel copione: come idSpecie, ma le forme che il simulatore nasconde in anteprima ("Urshifu-*") sono la specie intera -> "urshifu"
//   CpuCopione.vuoto()                                un copione senza niente
//   CpuCopione.normalizza(x)                          un copione pulito (numeri validi, solo chiavi sicure) o null se non lo è
//   CpuCopione.lezione({ vista, avversari, portati, turni, aperti })   la lezione appena finita (vista = memoriaDellaPartita() del cervello; avversari = i sei della CPU; portati = i miei, in ordine; aperti = quanti scendono in campo per primi: 1 nel singolo, 2 nel doppio) o null se è troppo corta
//   CpuCopione.fondi(vecchio, lezione, opz?)          il copione di prima con la lezione in più
//   CpuCopione.progresso(copione, specieDelTeam?)     { percento, lezioni, obiettivo, livello, viste, mancano, copertura } per la barra (senza l'elenco: i Pokémon che la CPU ha visto nelle lezioni)
//   CpuCopione.fiducia(copione)                       0..1: quanto la CPU si fida (cresce con le lezioni)
//   CpuCopione.affinitaGruppo(copione, avversari, gruppo)    { v, conf } o null: quanto il gruppo da portare somiglia a quello che porterebbe lui
//   CpuCopione.affinitaApertura(copione, avversari, coppia)  { v, conf } o null: lo stesso per chi mandare in campo per primo
//   CpuCopione.quotaMossa(copione, specie, mossa, primoTurno)  { quota, n }: quanto spesso quel Pokémon usa quella mossa
//   CpuCopione.quoteCategorie(copione, specie, primoTurno, classe)   { attacco, protezione, altro, n }: come usa quel Pokémon le mosse; classe(mossa) dice di che categoria è
//   CpuCopione.quotaCambio(copione)                   la sua quota di cambi (tra le decisioni viste) e quante sono
//   CpuCopione.portatiDaScelta(richiesta, scelta)     "team 1342" + la richiesta di anteprima -> gli id dei Pokémon scelti, in ordine (o null)
//   CpuCopione.riassuntoLezione(lezione)              { aperture, mosse } per dire cosa ha imparato la CPU
//
// Funziona nel browser (window.CpuCopione) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./cpu-memoria.js'));
    else radice.CpuCopione = fabbrica(radice.CpuMemoria);
})(typeof self !== 'undefined' ? self : this, function (Mem) {
    'use strict';

    const VERSIONE = 1;
    const OBIETTIVO_LEZIONI = 4;         // con quattro lezioni piene la CPU è allenata (con tutti i Pokémon visti giocare)
    const TURNI_LEZIONE_PIENA = 6;       // da questi turni in poi una lezione vale intera (una partita in doppio dura di solito 6-9 turni)
    const MIN_TURNI = 3;                 // sotto questi turni non c'è niente da imparare: la lezione non si salva
    const MIN_DECISIONI = 4;
    const MAX_LEZIONI = 12;              // oltre, le lezioni non fanno più salire il numero (continuano ad aggiornare il copione)
    const DECADIMENTO = 0.92;
    const MINIMO = 0.05;
    const MAX_AVVERSARI = 80;            // quante specie avversarie si ricordano in anteprima

    const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
    const arrotonda = x => Math.round(x * 1000) / 1000;
    const idSpecie = nome => String(nome == null ? '' : nome).toLowerCase().replace(/[^a-z0-9]/g, '');
    // Il simulatore nasconde la forma di alcune specie nell'anteprima ("Urshifu-*", "Arceus-*"): per la CPU, che guarda il log, sono la specie intera. Le chiavi del copione
    // sono sempre queste, così "Urshifu-Rapid-Strike" del Box e "Urshifu-*" dell'anteprima sono lo stesso Pokémon
    const FORME_NASCOSTE = /^(arceus|genesect|gourgeist|pumpkaboo|xerneas|silvally|urshifu|dudunsparce)/;
    const chiaveSpecie = nome => { const i = idSpecie(nome); const m = FORME_NASCOSTE.exec(i); return m ? m[1] : i; };
    const chiaveBuona = k => typeof k === 'string' && /^[a-z0-9]{1,40}$/.test(k);
    const unici = lista => [...new Set(lista)];

    function vuoto() {
        return { v: VERSIONE, lezioni: 0, partite: 0, scelte: 0, t: 0, memoria: Mem.vuota(), contro: {} };
    }

    /** Una mappa { chiave sicura: numero > 0 }, ognuno per `fattore` */
    function mappa(o, fattore = 1) {
        const out = {};
        if (!o || typeof o !== 'object') return out;
        for (const [k, v] of Object.entries(o)) { const x = num(v) * fattore; if (x > 0 && chiaveBuona(k)) out[k] = x; }
        return out;
    }

    function normalizzaContro(contro, fattore = 1) {
        const out = {};
        if (!contro || typeof contro !== 'object') return out;
        const voci = Object.entries(contro).filter(([k, r]) => chiaveBuona(k) && r && typeof r === 'object');
        for (const [k, r] of voci.slice(0, MAX_AVVERSARI * 2)) {
            const n = num(r.n) * fattore;
            if (!(n > 0)) continue;
            out[k] = { n, p: mappa(r.p, fattore), l: mappa(r.l, fattore) };
        }
        return out;
    }

    // I copioni già puliti (li fa normalizza e non si toccano più): chi li ripassa a normalizza (il cervello lo fa a ogni scelta) non li rifà ogni volta
    const PULITI = new WeakSet();

    /** Un copione da un oggetto qualunque (quello che c'è nel database): numeri validi, solo ciò che serve; null se non è un copione di questa versione */
    function normalizza(x) {
        if (x && typeof x === 'object' && PULITI.has(x)) return x;
        if (!x || typeof x !== 'object' || x.v !== VERSIONE) return null;
        const out = vuoto();
        out.memoria = Mem.normalizza(x.memoria) || Mem.vuota();
        out.contro = normalizzaContro(x.contro);
        out.lezioni = Math.min(MAX_LEZIONI, num(x.lezioni));
        out.partite = Math.floor(num(x.partite));
        out.scelte = Math.floor(num(x.scelte));
        out.t = Math.floor(num(x.t));
        PULITI.add(out);
        return out;
    }

    /** Gli id dei Pokémon scelti in anteprima ("team 1342": il primo e il secondo aprono), dalla richiesta del simulatore. null se non è una scelta di anteprima */
    function portatiDaScelta(richiesta, scelta) {
        const m = /^team\s+([1-9]+)\s*$/.exec(String(scelta == null ? '' : scelta));
        const squadra = richiesta && richiesta.side && Array.isArray(richiesta.side.pokemon) ? richiesta.side.pokemon : null;
        if (!m || !richiesta || !richiesta.teamPreview || !squadra) return null;
        const out = [];
        for (const c of m[1]) {
            const p = squadra[Number(c) - 1];
            if (!p || !p.details) return null;
            const id = chiaveSpecie(String(p.details).split(',')[0]);
            if (!id) return null;
            if (!out.includes(id)) out.push(id);
        }
        return out.length ? out : null;
    }

    /**
     * La lezione appena finita. `vista`: quello che la CPU ha visto giocare il proprietario (memoriaDellaPartita del cervello: per ogni suo Pokémon se è sceso in campo, se ha
     * aperto, le mosse usate e quelle del primo turno; quanto si è parato, ha cambiato...); `avversari`: le specie dei sei della CPU; `portati`: i suoi Pokémon scelti in anteprima,
     * nell'ordine (i primi due aprono); `turni`: quanti turni sono stati giocati. null se la lezione è troppo corta per insegnare qualcosa.
     */
    function lezione({ vista, avversari = [], portati = [], turni = 0, aperti = 2 } = {}) {
        const mem = Mem.normalizza(vista);
        if (!mem || !(turni >= MIN_TURNI)) return null;
        // un Pokémon che l'anteprima mostra con la forma nascosta (Urshifu-*) e il simulatore con quella vera (Urshifu-Rapid-Strike) è lo stesso: un record solo
        const unito = {};
        for (const [k, r] of Object.entries(mem.specie)) {
            const c = chiaveSpecie(k), e = unito[c];
            if (!e) { unito[c] = r; continue; }
            const somma = (x, y) => { const o = Object.assign({}, x); for (const [m, n] of Object.entries(y)) o[m] = (o[m] || 0) + n; return o; };
            unito[c] = { n: Math.max(e.n, r.n), portato: Math.max(e.portato, r.portato), apertura: Math.max(e.apertura, r.apertura), mosse: somma(e.mosse, r.mosse), mosseT1: somma(e.mosseT1, r.mosseT1),
                abilita: r.abilita || e.abilita, strumento: r.strumento || e.strumento, tera: r.tera || e.tera };
        }
        mem.specie = unito;
        let scelte = num(mem.categorie.cambio);
        for (const r of Object.values(mem.specie)) scelte += Object.values(r.mosse).reduce((s, x) => s + x, 0);
        if (scelte < MIN_DECISIONI) return null;
        const scelti = unici((portati || []).map(chiaveSpecie).filter(Boolean)).slice(0, 6);
        // chi ha scelto in anteprima l'ha "portato" anche se poi non è sceso in campo; i primi due aprono
        for (const b of scelti) {
            const r = mem.specie[b];
            if (r) r.portato = Math.max(r.portato, 1);
        }
        const nAperti = Math.max(1, Math.min(2, Math.floor(Number(aperti)) || 2));
        scelti.slice(0, nAperti).forEach(b => { const r = mem.specie[b]; if (r) r.apertura = Math.max(r.apertura, 1); });
        const contro = {};
        for (const o of unici((avversari || []).map(chiaveSpecie).filter(chiaveBuona)).slice(0, 6)) {
            const p = {}, l = {};
            scelti.forEach((b, i) => { p[b] = 1; if (i < nAperti) l[b] = 1; });
            contro[o] = { n: 1, p, l };
        }
        return { v: VERSIONE, peso: Math.min(1, turni / TURNI_LEZIONE_PIENA), scelte, turni: Math.floor(turni), memoria: mem, contro };
    }

    /** Il copione di prima (ogni numero per `decadimento`) con la lezione in più */
    function fondi(vecchio, lez, opz = {}) {
        const dec = opz.decadimento != null ? opz.decadimento : DECADIMENTO;
        const base = normalizza(vecchio) || vuoto();
        if (!lez || typeof lez !== 'object') return base;
        const nuova = Mem.normalizza(lez.memoria);
        const out = vuoto();
        out.memoria = nuova ? Mem.fondi(base.memoria.partite || Object.keys(base.memoria.specie).length ? base.memoria : null, nuova, { decadimento: dec }) : base.memoria;
        // in anteprima: i numeri di prima valgono un po' meno, poi si somma la lezione
        const vecchioContro = normalizzaContro(base.contro, dec), nuovoContro = normalizzaContro(lez.contro);
        const somma = (a, b) => { const o = {}; for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) { const v = ((a && a[k]) || 0) + ((b && b[k]) || 0); if (v >= MINIMO) o[k] = arrotonda(v); } return o; };
        const contro = {};
        for (const k of new Set([...Object.keys(vecchioContro), ...Object.keys(nuovoContro)])) {
            const a = vecchioContro[k], b = nuovoContro[k];
            const n = ((a && a.n) || 0) + ((b && b.n) || 0);
            if (n >= MINIMO) contro[k] = { n: arrotonda(n), p: somma(a && a.p, b && b.p), l: somma(a && a.l, b && b.l) };
        }
        out.contro = Object.fromEntries(Object.entries(contro).sort((x, y) => y[1].n - x[1].n).slice(0, MAX_AVVERSARI));
        out.lezioni = arrotonda(Math.min(MAX_LEZIONI, base.lezioni + Math.max(0, Math.min(1, Number(lez.peso) || 0))));
        out.partite = base.partite + 1;
        out.scelte = base.scelte + Math.floor(num(lez.scelte));
        out.t = Number(opz.adesso) > 0 ? Math.floor(opz.adesso) : Date.now();
        return out;
    }

    /**
     * Quanto è allenata la CPU con quel team, per la barra: dalle lezioni (OBIETTIVO_LEZIONI piene = tutto) e da quanti Pokémon del team l'hanno vista giocare (chi non è mai stato
     * portato non si sa come lo si gioca). `specieDelTeam`: i Pokémon del team (nomi o id); senza, quelli che la CPU ha visto nell'anteprima delle lezioni (i sei del team: serve a chi non
     * vede i team della palestra e vuole comunque la barra). livello: 'nuova' | 'impara' | 'quasi' | 'pronta'.
     */
    function progresso(copione, specieDelTeam) {
        const c = normalizza(copione) || vuoto();
        const team = [], chiavi = new Set();
        for (const nome of specieDelTeam == null ? Object.keys(c.memoria.specie) : specieDelTeam) { const k = chiaveSpecie(nome); if (k && !chiavi.has(k)) { chiavi.add(k); team.push({ nome, k }); } }
        const vista = x => { const r = c.memoria.specie[x.k]; return !!r && r.portato >= 0.15; };
        const viste = team.filter(vista), copertura = team.length ? viste.length / team.length : 0;
        const base = Math.min(1, c.lezioni / OBIETTIVO_LEZIONI);
        const percento = Math.round(100 * base * (0.5 + 0.5 * copertura) + 1e-9);
        const livello = percento >= 90 ? 'pronta' : percento >= 55 ? 'quasi' : percento > 0 ? 'impara' : 'nuova';
        return { percento, lezioni: arrotonda(c.lezioni), obiettivo: OBIETTIVO_LEZIONI, livello, viste: viste.map(x => x.nome), mancano: team.filter(x => !vista(x)).map(x => x.nome), copertura };
    }

    /** Quanto si fida la CPU del copione: 0 senza lezioni, 1 con quelle dell'obiettivo */
    function fiducia(copione) {
        const c = normalizza(copione);
        return c ? Math.min(1, c.lezioni / OBIETTIVO_LEZIONI) : 0;
    }

    // la quota (0..1) con cui il proprietario porta (o apre con) un Pokémon, dalle sue partite; null se non lo si è mai visto nel team
    const quotaMemoria = (c, b, campo) => { const r = c.memoria.specie[b]; return r && r.n > 0.3 ? { q: Math.min(1, r[campo] / r.n), conf: r.n / (r.n + 1) } : null; };

    /**
     * Quanto un gruppo di Pokémon (i miei quattro, o i due in apertura) somiglia a quello che porterebbe il proprietario contro quella squadra: unisce quello che faceva quando nei sei
     * dell'avversario c'era ciascuno dei loro Pokémon (contro) e quanto in generale porta ogni suo Pokémon. { v: 0..1, conf: 0..1 } o null se non si sa niente.
     */
    function affinita(copione, avversari, gruppo, campoContro, campoMemoria) {
        const c = normalizza(copione);
        if (!c || !gruppo || !gruppo.length) return null;
        const g = gruppo.map(chiaveSpecie);
        let somma = 0, pesi = 0;
        for (const o of unici((avversari || []).map(chiaveSpecie))) {
            const r = c.contro[o];
            if (!r || !(r.n > 0.3)) continue;
            const w = r.n / (r.n + 1);
            somma += w * (g.reduce((s, b) => s + Math.min(1, ((r[campoContro] && r[campoContro][b]) || 0) / r.n), 0) / g.length);
            pesi += w;
        }
        const cond = pesi > 0 ? { v: somma / pesi, conf: pesi / (pesi + 1.5) } : null;
        const noti = g.map(b => quotaMemoria(c, b, campoMemoria));
        // i Pokémon di cui non si sa niente valgono "a metà": non spostano il gruppo né in su né in giù
        const marg = noti.some(Boolean) ? { v: noti.reduce((s, x) => s + (x ? x.q : 0.5), 0) / g.length, conf: noti.reduce((s, x) => s + (x ? x.conf : 0), 0) / g.length } : null;
        if (!cond && !marg) return null;
        const wc = cond ? cond.conf * 2 : 0, wm = marg ? marg.conf : 0;
        if (!(wc + wm > 0)) return null;
        return { v: ((cond ? cond.v * wc : 0) + (marg ? marg.v * wm : 0)) / (wc + wm), conf: Math.min(1, (wc + wm) / 2) };
    }
    const affinitaGruppo = (copione, avversari, gruppo) => affinita(copione, avversari, gruppo, 'p', 'portato');
    const affinitaApertura = (copione, avversari, coppia) => affinita(copione, avversari, coppia, 'l', 'apertura');

    /** Quanto spesso quel Pokémon usa quella mossa (al primo turno in campo, o dopo) e su quanti usi si basa */
    function quotaMossa(copione, specie, mossa, primoTurno) {
        const c = normalizza(copione);
        return Mem.quotaMossa(c ? c.memoria.specie[chiaveSpecie(specie)] : null, mossa, !!primoTurno);
    }

    /** Come usa quel Pokémon le mosse (al primo turno in campo, o dopo): { attacco, protezione, altro, n } con quante volte ha fatto ognuna; `classe` dice di che categoria è una mossa */
    function quoteCategorie(copione, specie, primoTurno, classe) {
        const c = normalizza(copione);
        return Mem.quoteCategorie(c ? c.memoria.specie[chiaveSpecie(specie)] : null, !!primoTurno, classe);
    }

    /** Quanta parte delle sue decisioni sono cambi, e quante decisioni si sono viste */
    function quotaCambio(copione) {
        const c = normalizza(copione);
        if (!c) return { quota: 0, n: 0 };
        const k = c.memoria.categorie, n = k.attacco + k.protezione + k.cambio + k.altro;
        return { quota: n > 0 ? k.cambio / n : 0, n };
    }

    /** Cosa ha imparato la CPU in questa lezione, per dirlo: chi ha aperto, e per ogni Pokémon le mosse più usate (con quella del primo turno) */
    function riassuntoLezione(lez) {
        const mem = lez && Mem.normalizza(lez.memoria);
        if (!mem) return { aperture: [], mosse: [] };
        const aperture = Object.entries(mem.specie).filter(([, r]) => r.apertura > 0).map(([s]) => s);
        const mosse = [];
        for (const [specie, r] of Object.entries(mem.specie)) {
            const usi = Object.entries(r.mosse).sort((a, b) => b[1] - a[1]).slice(0, 3);
            if (!usi.length) continue;
            mosse.push({ specie, mosse: usi.map(([m, n]) => ({ mossa: m, n, primoTurno: (r.mosseT1[m] || 0) >= n / 2 })) , totale: usi.reduce((s, x) => s + x[1], 0) });
        }
        mosse.sort((a, b) => b.totale - a.totale);
        return { aperture, mosse };
    }

    return {
        VERSIONE, OBIETTIVO_LEZIONI, TURNI_LEZIONE_PIENA, MIN_TURNI, MIN_DECISIONI, MAX_LEZIONI, DECADIMENTO,
        idSpecie, chiaveSpecie, vuoto, normalizza, lezione, fondi, progresso, fiducia, affinitaGruppo, affinitaApertura, quotaMossa, quoteCategorie, quotaCambio, portatiDaScelta, riassuntoLezione
    };
});
