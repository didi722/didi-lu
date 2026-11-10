// =====================================================
// LE SITUAZIONI DEL GIOCO — Poké-Tournament
//
// Il passo successivo a cpu-avversario.js: un allenatore non si para, non cambia, non usa una mossa di stato sempre con la stessa probabilità. Si para
// più spesso il turno in cui il Pokémon è appena entrato, cambia più spesso quando è quasi KO, gioca diversamente quando è in svantaggio. Questo
// modulo impara queste regole dalle partite giocate nella lega (i log dei set) e le dà alla CPU, che le usa per prevedere meglio cosa farà chi ha davanti.
//
//   1. IL LOG -> LE DECISIONI.  Situazioni.decisioni(log) legge un set e restituisce, per ogni Pokémon in campo a ogni turno, la situazione in cui si
//      trovava (le "caratteristiche") e cosa ha scelto di fare (attacco, protezione, cambio, altro: le stesse quattro categorie di cpu-avversario.js).
//   2. LE DECISIONI -> LE REGOLE.  Situazioni.addestra(campioni) trova, per ogni categoria, quanto ogni caratteristica la rende più o meno probabile
//      (una regressione softmax con penalità: con pochi dati i pesi restano vicini a zero, cioè "nessun effetto").
//   3. LE REGOLE -> LA CPU.  Situazioni.moltiplicatori(pesi, caratteristiche) dice di quanto cambiano le quote di un allenatore in una situazione; sono i
//      numeri che cpu-avversario.js applica a ogni suo Pokémon in campo. La stessa lettura del log (il "tracker") serve a imparare e a giocare, quindi le
//      caratteristiche sono quelle e non altre.
//   4. SERVE DAVVERO?  Situazioni.validaIncrociata(set) toglie un gruppo di set alla volta, impara sugli altri e misura quanto prevede bene i set tolti
//      (log-verosimiglianza media per decisione) con e senza le situazioni. Il workflow "Stile dei giocatori" pubblica le regole solo se il guadagno c'è.
//
// Caratteristiche (valgono 0 o 1):
//   primoTurno   è il turno 1 (i Pokémon iniziali: Fake Out, Protezione, Tailwind...)
//   appenaEntrato è entrato in campo nel turno scorso (a sua scelta o al posto di un KO)
//   psBassi      meno di un terzo dei PS
//   psMedi       tra un terzo e due terzi dei PS
//   inSvantaggio  la sua squadra ha meno Pokémon vivi dell'altra
//   inVantaggio   la sua squadra ha più Pokémon vivi dell'altra
//   soloInCampo   nel doppio: il compagno è KO e non ha ancora un sostituto
//   conStato      ha un problema di stato (scottatura, paralisi, sonno...)
//   finePartita   dal turno 7 in poi
// Il singolo e il doppio si imparano a parte (sono due giochi diversi): le regole sono { singoli, doppi } e ognuna è null se i dati sono pochi.
//
//   Situazioni.crea()            -> il tracker: .riga(r) .righe([r...]) .contesto(posizione) .doppio() (legge un log un pezzo alla volta)
//   Situazioni.decisioni(log, opz?)       -> [{ lato, doppio, f: [0|1...], categoria, giocatore }]
//   Situazioni.addestra(campioni, opz?)   -> { pesi: { protezione: {...}, cambio: {...}, altro: {...} }, n, ... } oppure null se i campioni sono pochi
//   Situazioni.moltiplicatori(pesi, f)    -> { attacco, protezione, cambio, altro } (1 = nessun cambiamento)
//   Situazioni.validaIncrociata(set, opz?) -> { n, senza, con, guadagno, ... }
//   Situazioni.costruisci(logs, opz?)     -> { regole: { singoli, doppi }, validazione } tutto insieme, come lo usa il workflow
//
// Funziona nel browser (window.CpuSituazioni) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./azioni-mosse.js'));
    else radice.CpuSituazioni = fabbrica(radice.AzioniMosse);
})(typeof self !== 'undefined' ? self : this, function (AzioniMosse) {
    'use strict';

    const VERSIONE = 1;                       // cambia quando cambiano le caratteristiche: le regole già salvate non valgono più e si reimparano
    const CATEGORIE = ['attacco', 'protezione', 'cambio', 'altro'];
    const BASE = 'attacco';                   // la categoria di riferimento: i suoi pesi sono sempre 0
    const CARATTERISTICHE = ['primoTurno', 'appenaEntrato', 'psBassi', 'psMedi', 'inSvantaggio', 'inVantaggio', 'soloInCampo', 'conStato', 'finePartita'];

    const MINIMO_DECISIONI = 400;             // sotto, le regole di quel tipo di partita non si imparano
    const PENALITA = 25;                      // quanto si tirano i pesi verso 0 (più alta = più prudente)
    const PESO_MASSIMO = 1.6;                 // nessuna situazione cambia una categoria più di e^1.6 ≈ 5 volte

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const idDi = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, '');

    // "p1a: Garchomp" -> { lato: 'p1', pos: 'p1a', nick: 'Garchomp' }
    function leggiIdent(t) {
        const m = /^(p[1-4])([a-d])?: ?(.*)$/.exec(String(t || ''));
        return m ? { lato: m[1], pos: m[2] ? m[1] + m[2] : '', nick: m[3] } : null;
    }
    // "45/100", "0 fnt", "30/100 par" -> { pct, stato, ko }
    function leggiPs(t) {
        const s = String(t || '').trim();
        if (/^0 fnt/.test(s) || s === '0') return { pct: 0, stato: '', ko: true };
        const m = /^(\d+)(?:\/(\d+))?(?: (\w+))?/.exec(s);
        if (!m) return null;
        const max = m[2] ? num(m[2]) : 100;
        return { pct: max > 0 ? Math.round(100 * num(m[1]) / max) : 0, stato: m[3] && m[3] !== 'fnt' ? m[3] : '', ko: m[3] === 'fnt' };
    }

    // ---------------------------------------------------------------------------------
    // Il tracker: legge un log un pezzo alla volta e, a ogni "|turn|", ricorda la situazione di ogni Pokémon in campo (prima che scelga).
    // ---------------------------------------------------------------------------------
    function crea(opz = {}) {
        const alDecisione = typeof opz.alDecisione === 'function' ? opz.alDecisione : null;
        const T = {
            turno: 0, fase: '', iniziata: false, doppio: false,
            attivo: {},          // 'p1a' -> { nick, pct, stato, entrata (turno in cui è entrato) }
            dim: { p1: 0, p2: 0 }, caduti: { p1: 0, p2: 0 },
            visti: { p1: new Set(), p2: new Set() },
            scatto: {},          // 'p1a' -> { f, categoria } la situazione del turno e cosa ha scelto
            contestoAttuale: {}
        };

        const posti = lato => (T.doppio ? ['a', 'b'] : ['a']).map(x => lato + x);
        const vivoAltrove = lato => Math.max(0, (T.dim[lato] || T.visti[lato].size) - T.caduti[lato]);

        function caratteristiche(pos) {
            const m = T.attivo[pos];
            if (!m) return null;
            const lato = pos.slice(0, 2);
            const altro = lato === 'p1' ? 'p2' : 'p1';
            const miei = vivoAltrove(lato), loro = vivoAltrove(altro);
            const compagno = T.doppio ? T.attivo[lato + (pos.charAt(2) === 'a' ? 'b' : 'a')] : null;
            return [
                T.turno === 1,
                T.turno > 1 && m.entrata === T.turno - 1,
                m.pct < 34,
                m.pct >= 34 && m.pct < 67,
                miei < loro,
                miei > loro,
                T.doppio && !compagno,
                !!m.stato,
                T.turno >= 7
            ].map(Boolean).map(Number);
        }

        function apriTurno() {
            T.scatto = {};
            T.contestoAttuale = {};
            for (const lato of ['p1', 'p2']) {
                for (const pos of posti(lato)) {
                    const f = caratteristiche(pos);
                    if (!f) continue;
                    T.contestoAttuale[pos] = f;
                    T.scatto[pos] = { f, categoria: '' };
                }
            }
        }

        function registra(pos, categoria) {
            const s = T.scatto[pos];
            if (!s || s.categoria) return;          // una sola decisione per Pokémon e turno (le mosse che ne seguono non sono scelte)
            s.categoria = categoria;
            if (alDecisione) alDecisione({ lato: pos.slice(0, 2), pos, doppio: T.doppio, f: s.f, categoria, turno: T.turno });
        }

        function riga(r) {
            if (typeof r !== 'string' || r.charAt(0) !== '|') return;
            const p = r.split('|');
            const tipo = p[1];
            switch (tipo) {
                case 'gametype': T.doppio = p[2] === 'doubles'; break;
                case 'teamsize': if (T.dim[p[2]] !== undefined) T.dim[p[2]] = parseInt(p[3], 10) || 0; break;
                case 'start': T.iniziata = true; break;
                case 'turn':
                    T.turno = parseInt(p[2], 10) || T.turno + 1;
                    T.fase = 'scelte';
                    apriTurno();
                    break;
                case 'upkeep': T.fase = 'fine'; break;
                case 'switch': case 'drag': {
                    const id = leggiIdent(p[2]);
                    if (!id || !id.pos || !T.dim.hasOwnProperty(id.lato)) break;
                    // un cambio scelto: a inizio turno, prima di qualunque mossa (dopo una mossa è U-turn o simili, dopo |upkeep| un KO sostituito)
                    if (tipo === 'switch' && T.fase === 'scelte' && T.turno >= 1) registra(id.pos, 'cambio');
                    const ps = leggiPs(p[4]) || { pct: 100, stato: '' };
                    T.visti[id.lato].add(idDi(String(p[3] || '').split(',')[0]) + '|' + id.nick);
                    T.attivo[id.pos] = { nick: id.nick, pct: ps.pct, stato: ps.stato, entrata: T.turno };
                    break;
                }
                case 'move': {
                    const id = leggiIdent(p[2]);
                    if (!id || !id.pos || p.some(x => String(x).startsWith('[from]'))) break;
                    const cl = AzioniMosse ? AzioniMosse.classeDi(p[3]) : 'attacco';
                    registra(id.pos, cl === 'attacco' ? 'attacco' : cl === 'protezione' ? 'protezione' : 'altro');
                    break;
                }
                case 'faint': {
                    const id = leggiIdent(p[2]);
                    if (!id || !id.pos || !T.dim.hasOwnProperty(id.lato)) break;
                    T.caduti[id.lato]++;
                    delete T.attivo[id.pos];
                    break;
                }
                case '-damage': case '-heal': case '-sethp': {
                    const id = leggiIdent(p[2]);
                    const m = id && id.pos && T.attivo[id.pos];
                    const ps = leggiPs(p[3]);
                    if (m && ps && !ps.ko) { m.pct = ps.pct; if (ps.stato) m.stato = ps.stato; }
                    break;
                }
                case '-status': {
                    const id = leggiIdent(p[2]);
                    const m = id && id.pos && T.attivo[id.pos];
                    if (m) m.stato = String(p[3] || 'st');
                    break;
                }
                case '-curestatus': {
                    const id = leggiIdent(p[2]);
                    const m = id && id.pos && T.attivo[id.pos];
                    if (m) m.stato = '';
                    break;
                }
                case 'replace': {
                    const id = leggiIdent(p[2]);
                    const m = id && id.pos && T.attivo[id.pos];
                    if (m) m.nick = id.nick;
                    break;
                }
                case 'swap': {        // Ally Switch
                    const id = leggiIdent(p[2]);
                    const verso = id && id.lato + 'abcd'[parseInt(p[3], 10)];
                    if (id && id.pos && verso) { const x = T.attivo[id.pos]; T.attivo[id.pos] = T.attivo[verso]; T.attivo[verso] = x; }
                    break;
                }
                default: break;
            }
        }

        return {
            riga,
            righe(rr) { for (const r of rr || []) riga(r); },
            /** Le caratteristiche (array di 0/1, nell'ordine di CARATTERISTICHE) del Pokémon in questa posizione ('p2a') all'inizio di questo turno; null se non c'è */
            contesto(pos) { return T.contestoAttuale[pos] || null; },
            doppio: () => T.doppio,
            turno: () => T.turno
        };
    }

    /**
     * Le decisioni di un set: una per Pokémon in campo e per turno, con la situazione e la scelta. Un Pokémon che non ha potuto scegliere (non muove perché è
     * addormentato, esitante...) non dà nessuna decisione. log: array di righe o testo.
     * Ogni elemento: { lato, doppio, f, categoria, giocatore (il suo nome nel log, se c'è), turno }.
     */
    function decisioni(log, opz = {}) {
        const righe = Array.isArray(log) ? log : String(log || '').split('\n');
        const nomi = { p1: '', p2: '' };
        const fuori = [];
        const t = crea({ alDecisione: d => fuori.push(d) });
        for (const r of righe) {
            if (typeof r === 'string' && r.startsWith('|player|')) {
                const p = r.split('|');
                if (nomi[p[2]] !== undefined && p[3]) nomi[p[2]] = p[3];
            }
            t.riga(r);
        }
        return fuori.filter(d => !opz.lato || d.lato === opz.lato).map(d => ({ lato: d.lato, doppio: d.doppio, f: d.f, categoria: d.categoria, giocatore: nomi[d.lato] || '', turno: d.turno }));
    }

    /**
     * Le percentuali di scelta per situazione: per ogni caratteristica (e in generale) quante decisioni e quante di attacco, protezione, cambio, altro.
     * Serve a confrontare come gioca la CPU con come giocano le persone (stesso calcolo sui replay della lega e sulle partite della CPU).
     * decisioni: l'elenco di decisioni() (anche di più set insieme), filtrabile con opz.doppio.
     * Restituisce [{ nome, n, attacco, protezione, cambio, altro }] con le quote che sommano a 1; la prima riga è "tutte".
     */
    function tabella(lista, opz = {}) {
        const righe = [{ nome: 'tutte', test: () => true }].concat(CARATTERISTICHE.map((nome, j) => ({ nome, test: d => d.f[j] === 1 })));
        const base = (lista || []).filter(d => opz.doppio == null || d.doppio === opz.doppio);
        return righe.map(r => {
            const sel = base.filter(r.test);
            const conto = { attacco: 0, protezione: 0, cambio: 0, altro: 0 };
            for (const d of sel) conto[d.categoria]++;
            const n = sel.length;
            return { nome: r.nome, n, attacco: n ? conto.attacco / n : 0, protezione: n ? conto.protezione / n : 0, cambio: n ? conto.cambio / n : 0, altro: n ? conto.altro / n : 0 };
        });
    }

    /** La tabella() in testo, per i log e le prove */
    function tabellaInTesto(righe) {
        const p = x => (100 * x).toFixed(1).padStart(5) + '%';
        return righe.map(r => `${r.nome.padEnd(14)} ${String(r.n).padStart(6)}   attacco ${p(r.attacco)}   protezione ${p(r.protezione)}   cambio ${p(r.cambio)}   altro ${p(r.altro)}`).join('\n');
    }

    // ---------------------------------------------------------------------------------
    // L'apprendimento: regressione softmax con la categoria BASE come riferimento, penalità L2 e una "partenza" (offset) per ogni decisione
    // ---------------------------------------------------------------------------------
    const ALTRE = CATEGORIE.filter(c => c !== BASE);

    function softmax(z) {
        const m = Math.max(...z);
        const e = z.map(x => Math.exp(x - m));
        const s = e.reduce((a, b) => a + b, 0);
        return e.map(x => x / s);
    }

    /**
     * Impara i pesi. campioni: [{ f: [0|1...], categoria, partenza?: { attacco, protezione, cambio, altro } }]: `partenza` sono le quote dell'allenatore
     * (o della lega) PRIMA di guardare la situazione: i pesi spiegano solo quanto la situazione cambia le sue quote. Senza, si parte dalle quote medie dei campioni.
     * Restituisce { pesi: { [categoria != attacco]: { [caratteristica]: peso } }, n } oppure null se i campioni sono meno di opz.minimo.
     */
    function addestra(campioni, opz = {}) {
        const minimo = opz.minimo != null ? opz.minimo : MINIMO_DECISIONI;
        const lista = (campioni || []).filter(c => c && Array.isArray(c.f) && CATEGORIE.includes(c.categoria));
        if (lista.length < minimo) return null;
        const penalita = opz.penalita != null ? opz.penalita : PENALITA;
        const K = CARATTERISTICHE.length;
        // senza una partenza propria, ogni decisione parte dalle quote medie di tutti i campioni (così i pesi misurano solo quanto la situazione si scosta dalla media)
        const medie = Object.fromEntries(CATEGORIE.map(k => [k, (lista.filter(c => c.categoria === k).length + 1) / (lista.length + 4)]));
        const offset = lista.map(c => CATEGORIE.map(k => Math.log(Math.max(1e-4, c.partenza && c.partenza[k] != null ? c.partenza[k] : medie[k]))));
        // pesi[a][j] per le categorie ALTRE (attacco = 0); l'ultimo (j = K) è l'intercetta: quanto la situazione "normale" (nessuna caratteristica) si scosta
        // dalle quote di partenza, che sono una media di tutte le situazioni. Salita del gradiente con un passo per peso (1 / curvatura massima: non oscilla mai).
        const w = ALTRE.map(() => new Array(K + 1).fill(0));
        const conInt = c => (j => (j === K ? 1 : (c.f[j] || 0)));
        const pen = j => (j === K ? Math.min(1, penalita) : penalita);
        const passo = new Array(K + 1).fill(0).map((_, j) => 1 / (0.5 * (j === K ? lista.length : lista.reduce((s, c) => s + (c.f[j] || 0), 0)) + pen(j)));
        for (let iter = 0; iter < (opz.iterazioni || 300); iter++) {
            const g = ALTRE.map(() => new Array(K + 1).fill(0));
            lista.forEach((c, i) => {
                const x = conInt(c);
                const z = CATEGORIE.map((k, ci) => offset[i][ci] + (k === BASE ? 0 : w[ALTRE.indexOf(k)].reduce((s, wj, j) => s + wj * x(j), 0)));
                const p = softmax(z);
                ALTRE.forEach((k, a) => {
                    const delta = (c.categoria === k ? 1 : 0) - p[CATEGORIE.indexOf(k)];
                    for (let j = 0; j <= K; j++) if (x(j)) g[a][j] += delta;
                });
            });
            for (let a = 0; a < ALTRE.length; a++) {
                for (let j = 0; j <= K; j++) w[a][j] = Math.max(-PESO_MASSIMO, Math.min(PESO_MASSIMO, w[a][j] + passo[j] * (g[a][j] - pen(j) * w[a][j])));
            }
        }
        const pesi = {};
        ALTRE.forEach((k, a) => {
            pesi[k] = { base: Math.round(w[a][K] * 1000) / 1000 };
            CARATTERISTICHE.forEach((nome, j) => { pesi[k][nome] = Math.round(w[a][j] * 1000) / 1000; });
        });
        return { pesi, n: lista.length };
    }

    /** Di quanto cambiano le quote di un allenatore nella situazione `f` (array di 0/1): { attacco: 1, protezione, cambio, altro }; tutti 1 se non ci sono regole */
    function moltiplicatori(pesi, f) {
        const out = { attacco: 1, protezione: 1, cambio: 1, altro: 1 };
        if (!pesi || !f) return out;
        for (const k of ALTRE) {
            const wk = pesi[k];
            if (!wk) continue;
            let z = num(wk.base);
            CARATTERISTICHE.forEach((nome, j) => { if (f[j]) z += num(wk[nome]); });
            out[k] = Math.exp(Math.max(-3, Math.min(3, z)));
        }
        return out;
    }

    /** Le quote dopo le regole: quote × moltiplicatori, riportate a somma 1 */
    function applica(quote, molt) {
        const out = {};
        let s = 0;
        for (const k of CATEGORIE) { out[k] = Math.max(0, num(quote[k])) * (molt && molt[k] != null ? molt[k] : 1); s += out[k]; }
        if (!(s > 0)) return Object.assign({}, quote);
        for (const k of CATEGORIE) out[k] /= s;
        return out;
    }

    // ---------------------------------------------------------------------------------
    // Dai set alle regole, con la prova incrociata
    // ---------------------------------------------------------------------------------
    /**
     * Prepara i campioni di una lista di set: ognuno con la partenza dell'allenatore (le sue quote, tirate verso la media della lega come fa la CPU in
     * partita, vedi cpu-avversario.js) e il gruppo (il set, per la prova incrociata).
     * set: [{ id: 'chiave del set', log: [...], giocatori?: { p1: 'idAllenatore', p2: 'idAllenatore' } }]
     */
    function campioniDeiSet(set, { forzaLega = 100 } = {}) {
        const grezzi = [];
        set.forEach((s, gruppo) => {
            for (const d of decisioni(s.log)) {
                const chi = (s.giocatori && s.giocatori[d.lato]) || d.giocatore || d.lato;
                grezzi.push({ f: d.f, categoria: d.categoria, doppio: d.doppio, allenatore: String(chi).toLowerCase(), gruppo });
            }
        });
        return grezzi;
    }

    // Le quote di ogni allenatore e della lega calcolate SOLO sui gruppi indicati (così la prova non "sbircia" i set da prevedere)
    function quotePer(grezzi, gruppiOk, forzaLega) {
        const conto = () => ({ attacco: 0, protezione: 0, cambio: 0, altro: 0, n: 0 });
        const lega = conto();
        const per = {};
        for (const c of grezzi) {
            if (!gruppiOk(c.gruppo)) continue;
            const a = per[c.allenatore] || (per[c.allenatore] = conto());
            a[c.categoria]++; a.n++; lega[c.categoria]++; lega.n++;
        }
        const quoteLega = {};
        for (const k of CATEGORIE) quoteLega[k] = lega.n ? (lega[k] + 1) / (lega.n + 4) : 0.25;
        return allenatore => {
            const a = per[allenatore];
            if (!a || !a.n) return quoteLega;
            const w = a.n / (a.n + forzaLega);
            const out = {};
            for (const k of CATEGORIE) out[k] = w * (a[k] / a.n) + (1 - w) * quoteLega[k];
            return out;
        };
    }

    function conPartenza(grezzi, gruppiOk, forzaLega) {
        const quote = quotePer(grezzi, gruppiOk, forzaLega);
        return grezzi.map(c => Object.assign({}, c, { partenza: quote(c.allenatore) }));
    }

    const logVerosimiglianza = (quote, categoria) => Math.log(Math.max(1e-6, quote[categoria]));

    /**
     * Quanto prevede bene la scelta di un allenatore la CPU con e senza le situazioni, su set che non ha mai visto: i set si dividono in `gruppi` parti,
     * a turno una è la prova e le altre servono a imparare (sia le quote degli allenatori sia le regole).
     * Restituisce { n, senza, con, guadagno, perGruppo: [..] }: log-verosimiglianza media per decisione (più alta = meglio), `guadagno` = con - senza.
     * Un guadagno positivo in quasi tutti i gruppi vuol dire che le situazioni servono.
     */
    function validaIncrociata(set, opz = {}) {
        const gruppi = Math.max(2, Math.min(opz.gruppi || 5, set.length));
        const forzaLega = opz.forzaLega != null ? opz.forzaLega : 100;
        const grezzi = opz.campioni || campioniDeiSet(set, { forzaLega });
        let somma = { senza: 0, con: 0, n: 0 };
        const perGruppo = [];
        for (let g = 0; g < gruppi; g++) {
            const prova = c => c.gruppo % gruppi === g;
            const campioni = conPartenza(grezzi, gr => gr % gruppi !== g, forzaLega).filter(c => !prova(c));
            const pesi = {};
            for (const doppio of [false, true]) {
                const r = addestra(campioni.filter(c => c.doppio === doppio), opz);
                pesi[doppio ? 'doppi' : 'singoli'] = r && r.pesi;
            }
            const test = conPartenza(grezzi, gr => gr % gruppi !== g, forzaLega).filter(prova);
            let s = 0, c2 = 0;
            for (const c of test) {
                s += logVerosimiglianza(c.partenza, c.categoria);
                const molt = moltiplicatori(pesi[c.doppio ? 'doppi' : 'singoli'], c.f);
                c2 += logVerosimiglianza(applica(c.partenza, molt), c.categoria);
            }
            if (test.length) perGruppo.push({ n: test.length, senza: s / test.length, con: c2 / test.length });
            somma.senza += s; somma.con += c2; somma.n += test.length;
        }
        const senza = somma.n ? somma.senza / somma.n : 0, con = somma.n ? somma.con / somma.n : 0;
        const migliori = perGruppo.filter(x => x.con > x.senza).length;
        return { n: somma.n, senza, con, guadagno: con - senza, gruppi: perGruppo.length, gruppiMigliori: migliori, perGruppo };
    }

    /**
     * Tutto insieme: dai log dei set alle regole da pubblicare. `regole` sono { singoli, doppi }, ognuna { pesi, n } oppure null (pochi dati, oppure la
     * prova incrociata dice che non servono: soglia opz.guadagnoMinimo di log-verosimiglianza media per decisione e la maggior parte dei gruppi in positivo).
     */
    function costruisci(set, opz = {}) {
        const forzaLega = opz.forzaLega != null ? opz.forzaLega : 100;
        const grezzi = campioniDeiSet(set, { forzaLega });
        const guadagnoMinimo = opz.guadagnoMinimo != null ? opz.guadagnoMinimo : 0.002;
        const regole = { singoli: null, doppi: null };
        const validazione = {};
        // come giocano le persone, per situazione (solo per i log: non si salva)
        const tabelle = { singoli: tabella(grezzi, { doppio: false }), doppi: tabella(grezzi, { doppio: true }) };
        for (const doppio of [false, true]) {
            const chiave = doppio ? 'doppi' : 'singoli';
            const usati = grezzi.filter(c => c.doppio === doppio);
            const gruppiUsati = [...new Set(usati.map(c => c.gruppo))];
            validazione[chiave] = { decisioni: usati.length, set: gruppiUsati.length };
            if (usati.length < (opz.minimo != null ? opz.minimo : MINIMO_DECISIONI)) { validazione[chiave].esito = 'pochi dati'; continue; }
            // la prova incrociata riguarda solo questo tipo di partita
            const v = validaIncrociata(set, Object.assign({}, opz, { campioni: usati.map(c => Object.assign({}, c)) }));
            validazione[chiave] = Object.assign(validazione[chiave], { senza: v.senza, con: v.con, guadagno: v.guadagno, gruppi: v.gruppi, gruppiMigliori: v.gruppiMigliori });
            const serve = v.guadagno >= guadagnoMinimo && v.gruppiMigliori > v.gruppi / 2;
            validazione[chiave].esito = serve ? 'pubblicate' : 'non servono';
            if (serve) {
                const campioni = conPartenza(grezzi, () => true, forzaLega).filter(c => c.doppio === doppio);
                regole[chiave] = addestra(campioni, opz);
            }
        }
        return { regole, validazione, tabelle };
    }

    return {
        VERSIONE, CATEGORIE, CARATTERISTICHE, MINIMO_DECISIONI, PENALITA,
        crea, decisioni, tabella, tabellaInTesto, addestra, moltiplicatori, applica, campioniDeiSet, validaIncrociata, costruisci
    };
});
