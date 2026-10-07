// =====================================================
// IA DELLA CPU
// Sceglie le mosse dell'avversario controllato dal computer. Non tira a caso: per ogni turno
//   1. legge il log pubblico (chi è in campo, HP, stati, potenziamenti, meteo, Tailwind, Camera Magica,
//      trappole, mosse già viste dell'avversario, quante Protezioni di fila ha fatto ognuno);
//   2. elenca le sue azioni (ogni mossa su ogni bersaglio, i cambi, la Teracristal);
//   3. prevede cosa farà l'avversario (la sua mossa migliore sul suo bersaglio migliore; per le mosse che non ha ancora
//      mostrato presume la più forte che la sua specie può imparare) e simula il turno in ordine di priorità e velocità:
//      danni attesi, KO, Protezione, Fake Out, Follow Me, Helping Hand, cambi a inizio turno, mosse che colpiscono anche
//      l'alleato, tentennamenti, stati, potenziamenti, recupero, campo, abilità che agiscono in ingresso;
//   4. sceglie l'azione (nel doppio, la coppia di azioni dei due slot) con il valore più alto.
// Così "usa la mossa super efficace", "cambia se sta per essere messo KO e c'è chi regge meglio",
// "Terremoto solo se l'alleato non lo subisce (vola, levita, si protegge o esce)", "Protezione quando serve"
// vengono dalla stessa valutazione, non da regole sparse:
//   - Protezione: una seconda di fila riesce una volta su tre, quindi si gioca solo se il vantaggio è enorme;
//   - mossa super efficace: vale più del solo danno in più (e una resistita meno), purché non sia peggio per altri motivi;
//   - cambio sicuro: chi entra deve reggere la mossa prevista contro chi esce e anche la risposta migliore dell'avversario
//     contro di lui; U-turn/Volt Switch/Flip Turn fanno entrare chi regge meglio; a fine turno conta la posizione (chi
//     minaccia chi, chi muove prima) e non solo il danno del turno.
//
// Strategia del team: ogni team ha un piano (Tailwind, Stanza Magica, pioggia, sole, sabbia, neve, bilanciato...) deciso da
// team-cpu.js. L'IA lo legge dai set (chi lo imposta, chi ne approfitta) e lo applica: in anteprima porta il nucleo del piano e
// manda in campo per primo chi lo imposta; in battaglia valuta di più Tailwind, Stanza Magica e il proprio meteo, anche
// rimesso in campo dopo un cambio.
//
// Anteprima squadra: guarda i sei Pokémon dell'avversario e sceglie i quattro da portare (e chi mandare per primo) cercando il
// gruppo con una risposta per ognuno dei loro (chi fa più paura conta di più), forte contro di loro in media, senza debolezze
// condivise ai tipi con cui colpiscono, con il nucleo del piano; in campo per primo chi apre meglio contro i loro sei.
// Il Dex di @pkmn/sim arriva da fuori. Funziona nel browser (window.CpuIa) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./cpu-conoscenza.js'), require('./cpu-calcolo.js'));
    else radice.CpuIa = fabbrica(radice.CpuConoscenza, radice.CpuCalcolo);
})(typeof self !== 'undefined' ? self : this, function (K, C) {
    'use strict';

    const id = K.id;
    const STAT = ['atk', 'def', 'spa', 'spd', 'spe'];
    const STAT_NOMI = { atk: 'atk', def: 'def', spa: 'spa', spd: 'spd', spe: 'spe', accuracy: 'accuracy', evasion: 'evasion' };
    const lato2 = l => (l === 'p1' ? 'p2' : 'p1');

    // Le "manopole" della valutazione. Si possono cambiare creando il cervello con { parametri: { ... } } (utile per provare).
    //   penalitaProt        una protezione ripetuta riesce una volta su tre (poi una su nove): si gioca solo se il vantaggio è enorme,
    //                       quindi ogni protezione di fila costa questo nel valore del piano (oltre alla probabilità di fallire, già contata)
    //   bonusSE2/4          mossa super efficace (2x / 4x): vale di più del solo danno in più (frazione dei punti-danno)
    //   malusRes05/025      mossa resistita (0,5x / 0,25x): vale di meno
    //   pesoPosizione       quanto pesa la posizione a fine turno (chi minaccia chi, chi è più veloce): è ciò che rende sensato
    //                       un cambio sicuro
    //   rispostaAlCambio    quanta parte del peso va all'avversario che risponde a chi entra (non a chi esce): un cambio è "sicuro"
    //                       se chi entra regge anche la mossa migliore contro di lui; nel doppio pesa meno (due avversari, due bersagli)
    //   presunteDex         le mosse che non ha ancora mostrato si presumono dal Dex: la mossa di attacco più forte del suo tipo che può
    //                       imparare (1) invece di una potenza fissa (0); in mezzo si media
    //   ant*                anteprima: peso della copertura (una risposta per ogni loro Pokémon), della forza media, delle debolezze
    //                       condivise, di chi fa più paura, del nucleo del piano e del setter tra i primi in campo
    //   utilPianoTailwind, scalaTailwind, maxTailwind, bonusPianoStanza, bonusPianoMeteo
    //                       quanto vale mettere Tailwind (per ogni sorpasso che crea, con un tetto; almeno utilPianoTailwind per il team costruito
    //                       su di esso), la Stanza Magica o rimettere il meteo del piano
    //   aggressivita, aggressivitaDoppio
    //                       il danno che faccio vale (1 + aggressivita) volte: contro tutto ciò che non colpisce (proteggersi, cambiare,
    //                       curarsi, mosse di stato) un attacco pesa di più. 0 = la valutazione "neutra". Nel doppio conviene meno
    //                       (le protezioni, i deviatori e la Stanza Magica sono parte del gioco): in prova non serve e perde partite
    //   costoCambio, costoCambioDoppio, costoCambioSano
    //                       cambiare costa un turno; se chi esce sta ancora bene costa di più (costoCambioSano, solo nel singolo): si cambia
    //                       per scappare da un guaio, non per ripicca. Nel doppio il cambio è raro e vale com'era (provato: costare di più
    //                       fa perdere partite)
    //   costoProtezione     proteggersi non fa niente da solo: un piccolo costo fisso per ogni protezione
    //   sogliaRecupero      curarsi vale solo per gli HP che mancano oltre questa frazione (con quasi tutta la salute non serve)
    const PARAMETRI_BASE = {
        penalitaProt: 1.5, bonusSE2: 0.4, bonusSE4: 0.6, malusRes05: 0.3, malusRes025: 0.5, pesoPosizione: 0.3,
        rispostaAlCambio: 0.4, rispostaAlCambioDoppio: 0.25, presunteDex: 0.5,
        antCopertura: 0.3, antMedia: 1, antDeboli: 0.5, antPesoMinaccia: 1, antPiano: 0.25, antLeadSetter: 0.7,
        utilPianoTailwind: 0.9, scalaTailwind: 1.2, maxTailwind: 2.4, bonusPianoStanza: 1, bonusPianoMeteo: 0.5,
        aggressivita: 0.35, aggressivitaDoppio: 0, costoCambio: 0.3, costoCambioDoppio: 0.22, costoCambioSano: 0.2, costoProtezione: 0.08, sogliaRecupero: 0.25
    };
    // Abilità che agiscono quando il Pokémon entra in campo
    const ABILITA_METEO = { drizzle: 'rain', drought: 'sun', orichalcumpulse: 'sun', sandstream: 'sand', snowwarning: 'snow' };
    const ABILITA_TERRENO = { electricsurge: 'electric', hadronengine: 'electric', grassysurge: 'grassy', psychicsurge: 'psychic', mistysurge: 'misty' };
    // Mosse che "non hanno effetto" (|-immune|) per un motivo che non è il tipo del bersaglio: dalla loro immunità non si impara
    // niente sul tipo (Mangiasogni vuole un bersaglio addormentato, Sincrorumore un tipo in comune)
    const IMMUNITA_NON_DI_TIPO = new Set(['dreameater', 'synchronoise', 'skydrop']);
    // Mosse il cui tipo cambia (con il meteo, il terreno, lo strumento, il Pokémon): il tipo "della mossa" non dice quale è stato
    const TIPO_VARIABILE = new Set(['weatherball', 'terrainpulse', 'judgment', 'multiattack', 'revelationdance', 'ivycudgel', 'terablast',
        'terastarstorm', 'technoblast', 'naturalgift', 'hiddenpower', 'aurawheel', 'ragingbull']);
    const ABILITA_CONTRO_INTIMIDATE = new Set(['clearbody', 'whitesmoke', 'hypercutter', 'innerfocus', 'oblivious', 'owntempo', 'scrappy', 'guarddog', 'fullmetalbody', 'mirrorarmor']);
    const boostVuoti = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 });
    const campoVuoto = () => ({ tailwind: 0, reflect: 0, lightscreen: 0, auroraveil: 0, rocce: 0, punte: 0, tossine: 0, ragnatela: 0 });

    // "p1a: Nome" -> { lato: 'p1', slot: 0, nome: 'Nome' }
    function posizione(ident) {
        const m = /^(p[12])([a-c])?: (.*)$/.exec(ident || '');
        if (!m) return null;
        return { lato: m[1], slot: m[2] === 'b' ? 1 : m[2] === 'c' ? 2 : 0, nome: m[3] };
    }
    function leggiHp(testo) {
        // "73/100", "73/100 brn", "0 fnt", oppure "45/137 par" (propria squadra nella richiesta)
        if (!testo) return {};
        const [parte, stato = ''] = String(testo).split(' ');
        if (parte === '0') return { hp: 0, hpMax: 0, pct: 0, stato: 'fnt' };
        const [hp, hpMax] = parte.split('/').map(Number);
        return { hp, hpMax, pct: hpMax ? hp / hpMax * 100 : 0, stato };
    }
    function leggiDettagli(d) {
        // "Calyrex-Shadow, L50, M" -> { specie, livello }
        const p = String(d || '').split(', ');
        const m = /^L(\d+)$/.exec(p.find(x => /^L\d+$/.test(x)) || '');
        return { specie: p[0], livello: m ? parseInt(m[1], 10) : 100 };
    }

    // =================================================
    // CERVELLO
    // =================================================
    class Cerebro {
        // opzioni: { Dex, lato: 'p2', casuale: () => numero tra 0 e 1 (per i pareggi), debug: bool }
        constructor(opzioni) {
            this.DexSim = opzioni.Dex;
            this.lato = opzioni.lato || 'p2';
            this.casuale = opzioni.casuale || Math.random;
            this.debug = !!opzioni.debug;
            this.par = Object.assign({}, PARAMETRI_BASE, opzioni.parametri || {});
            this.pianoDato = opzioni.piano || null;     // il piano del team deciso da chi lo ha composto (team-cpu.js), se c'è
            this.strategia = null;
            this.impostaGenerazione(9);
            this.tipo = 'singles';
            this.resetta();
        }

        impostaGenerazione(gen) {
            this.gen = gen;
            this.dex = this.DexSim.forGen(gen);
            this.cacheMosse = new Map();
            this.cacheSpecie = new Map();
        }

        resetta() {
            this.turno = 0;
            this.meteo = null;
            this.terreno = null;
            this.stanzaMagica = false;
            this.lati = { p1: this._latoVuoto(), p2: this._latoVuoto() };
            this.finita = false;
            this.ultimeAzioni = {};        // per slot: l'ultima azione che ho scelto
            this.cambiRecenti = [0, 0];
            this.ultimoUscito = [null, null, null];      // per slot: chi è appena uscito dal campo (per non farlo rientrare subito)
            this.teraUsata = false;
        }

        _latoVuoto() {
            return { mons: {}, attivi: [null, null, null], squadra: [], campo: campoVuoto(), caduti: 0 };
        }

        // ---------- dati statici ----------
        specie(nome) {
            const k = id(nome);
            let s = this.cacheSpecie.get(k);
            if (!s) { s = this.dex.species.get(nome); this.cacheSpecie.set(k, s); }
            return s;
        }
        mossa(nome) {
            const k = id(nome);
            let m = this.cacheMosse.get(k);
            if (m === undefined) { m = K.descriviMossa(this.dex, nome); this.cacheMosse.set(k, m); }
            return m;
        }

        // =================================================
        // 1. LETTURA DEL LOG
        // =================================================
        osserva(righe) {
            for (const riga of righe) {
                if (typeof riga !== 'string' || riga.charAt(0) !== '|') continue;
                const p = riga.split('|').slice(1);
                try { this._riga(p); } catch (e) { if (this.debug) console.warn('CPU: riga non letta', riga, e); }
            }
        }

        // Protezione, Individua, Scudo Spino... e anche Guardia Ampia/Rapida: condividono lo stesso conto (1, 1/3, 1/9...)
        _registraProtezione(m) {
            if (m.ultimaProtezione === this.turno) return;      // già contata in questo turno (scelta e log arrivano tutte e due)
            m.protezioniDiFila = m.ultimaProtezione === this.turno - 1 ? (m.protezioniDiFila || 0) + 1 : 1;
            m.ultimaProtezione = this.turno;
        }

        // "Non ha effetto": la mossa appena usata non può toccare questo Pokémon. Se la mossa colpisce (non è di stato) e ha un tipo
        // fisso, ricordiamo che è immune a quel tipo: sotto Illusion si vede un'altra specie (uno Zorua di Hisui travestito da
        // Magnemite prende Lottaiuto come se fosse d'Acciaio, ma è Spettro) e senza questo la CPU riproverebbe a ogni turno.
        // Una mossa di stato (Onda d'Urto, Prepotenza...) si ricorda per chi l'ha provata: Prankster, per dire, non vale per gli altri.
        _imparaImmunita(m) {
            const u = this._ultimaMossa;
            if (!u || u.turno !== this.turno) return;
            const d = this.mossa(u.mossa);
            if (!d) return;
            if (d.categoria === 'Status') { m.immuneMosse.add(`${u.da}|${u.mossa}`); return; }
            if (IMMUNITA_NON_DI_TIPO.has(u.mossa) || TIPO_VARIABILE.has(u.mossa) || !d.tipo) return;
            m.immuneTipi.add(d.tipo);
        }

        // Quante protezioni di fila ha già fatto questo Pokémon fino al turno scorso (0 se non ha protetto ieri)
        _protezioniDiFila(m) {
            return m && m.ultimaProtezione === this.turno - 1 ? (m.protezioniDiFila || 0) : 0;
        }

        _mon(ident, crea) {
            const pos = posizione(ident);
            if (!pos) return null;
            const l = this.lati[pos.lato];
            let m = l.mons[pos.nome];
            if (!m && crea) {
                m = l.mons[pos.nome] = this._nuovoMon(pos.lato, pos.nome, crea.specie, crea.livello);
            }
            return m || null;
        }

        _nuovoMon(lato, nome, specie, livello) {
            return {
                lato, nome, specie, livello: livello || 100, pct: 100, stato: '', boost: boostVuoti(), mosseViste: new Set(),
                abilita: null, strumento: null, tera: null, vivo: true, turnoEntrata: this.turno, ultimaMossa: null, protettoNelTurno: -9,
                posto: -1, megaDi: null, protezioniDiFila: 0, ultimaProtezione: -9,
                // cosa ha già "non avuto effetto" contro di lui (|-immune|): i tipi delle mosse, e le mosse di stato di chi le ha provate.
                // Vale finché resta in campo: sotto Illusion il suo tipo vero non si vede, ma una mossa che non fa niente lo dice
                immuneTipi: new Set(), immuneMosse: new Set()
            };
        }

        _riga(p) {
            const cmd = p[0];
            switch (cmd) {
                case 'gen': this.impostaGenerazione(parseInt(p[1], 10) || 9); break;
                case 'gametype': this.tipo = p[1] === 'doubles' ? 'doubles' : 'singles'; break;
                case 'turn': this.turno = parseInt(p[1], 10); break;
                case 'poke': {
                    const d = leggiDettagli(p[2]);
                    this.lati[p[1]].squadra.push(d.specie);
                    this.lati[p[1]].livelloSquadra = d.livello;
                    break;
                }
                case 'switch': case 'drag': case 'replace': {
                    const pos = posizione(p[1]);
                    if (!pos) break;
                    const d = leggiDettagli(p[2]);
                    const l = this.lati[pos.lato];
                    let m = l.mons[pos.nome];
                    if (!m) m = l.mons[pos.nome] = this._nuovoMon(pos.lato, pos.nome, d.specie, d.livello);
                    if (cmd !== 'replace') {
                        // chi esce dal campo perde potenziamenti e il conto delle protezioni; chi entra parte pulito
                        const uscente = l.attivi[pos.slot] && l.attivi[pos.slot] !== pos.nome ? l.mons[l.attivi[pos.slot]] : null;
                        if (uscente) { uscente.boost = boostVuoti(); uscente.protezioniDiFila = 0; uscente.ultimaProtezione = -9; uscente.immuneTipi.clear(); uscente.immuneMosse.clear(); }
                        m.boost = boostVuoti(); m.turnoEntrata = this.turno; m.ultimaMossa = null; m.posto = pos.slot;
                        m.protezioniDiFila = 0; m.ultimaProtezione = -9;
                    }
                    m.specie = d.specie; m.livello = d.livello;
                    const h = leggiHp(p[3]);
                    m.pct = h.pct != null ? h.pct : m.pct; m.stato = h.stato || ''; m.vivo = true;
                    // chi è in campo: un solo Pokémon per posto
                    if (cmd === 'switch' && pos.lato === this.lato) {
                        this.cambiRecenti[pos.slot] = this.turno;
                        if (l.attivi[pos.slot] && l.attivi[pos.slot] !== pos.nome) this.ultimoUscito[pos.slot] = l.attivi[pos.slot];
                    }
                    l.attivi[pos.slot] = pos.nome;
                    break;
                }
                case 'detailschange': case '-formechange': {
                    const m = this._mon(p[1]);
                    if (m) { const d = leggiDettagli(p[2]); m.specie = d.specie; m.immuneTipi.clear(); }
                    break;
                }
                case '-start': {
                    // un cambio di tipo (Inzuppa, Camuffamento, Maledizione del bosco...): i tipi non sono più quelli di prima
                    const m = this._mon(p[1]);
                    if (m && /typechange|typeadd/i.test(p[2] || '')) m.immuneTipi.clear();
                    break;
                }
                case '-mega': { const m = this._mon(p[1]); if (m) m.megaDi = p[2]; break; }
                case 'move': {
                    const m = this._mon(p[1]);
                    if (!m) break;
                    const mossa = id(p[2]);
                    this._ultimaMossa = { da: m.nome, mossa, turno: this.turno };      // serve a capire a cosa si riferisce un |-immune|
                    m.mosseViste.add(mossa);
                    m.ultimaMossa = mossa;
                    if (K.PROTEZIONI.has(mossa) || K.PROTEZIONI_DI_AREA.has(mossa)) {
                        this._registraProtezione(m);
                        if (K.PROTEZIONI.has(mossa)) m.protettoNelTurno = this.turno;
                    } else { m.protezioniDiFila = 0; m.ultimaProtezione = -9; }
                    break;
                }
                case '-fail': {
                    // una protezione che fallisce azzera il conto: la prossima riesce di nuovo sempre
                    const m = this._mon(p[1]);
                    if (m && m.ultimaMossa && (K.PROTEZIONI.has(m.ultimaMossa) || K.PROTEZIONI_DI_AREA.has(m.ultimaMossa)) && m.ultimaProtezione === this.turno) {
                        m.protezioniDiFila = 0; m.ultimaProtezione = -9; m.protettoNelTurno = -9;
                    }
                    break;
                }
                case '-singleturn': {
                    const m = this._mon(p[1]);
                    if (m && /protect|detect|spiky|king|baneful|obstruct|silk|burning/i.test(p[2] || '')) m.protettoNelTurno = this.turno;
                    break;
                }
                case '-damage': case '-heal': case '-sethp': {
                    const m = this._mon(p[1]);
                    if (m) { const h = leggiHp(p[2]); if (h.pct != null) m.pct = h.pct; if (h.stato) m.stato = h.stato; }
                    break;
                }
                case 'faint': {
                    const pos = posizione(p[1]);
                    const m = this._mon(p[1]);
                    if (m) { m.vivo = false; m.pct = 0; m.stato = 'fnt'; }
                    if (pos) { this.lati[pos.lato].caduti++; if (this.lati[pos.lato].attivi[pos.slot] === pos.nome) this.lati[pos.lato].attivi[pos.slot] = null; }
                    break;
                }
                case '-status': { const m = this._mon(p[1]); if (m) m.stato = p[2]; break; }
                case '-curestatus': { const m = this._mon(p[1]); if (m) m.stato = ''; break; }
                case '-cureteam': {
                    const pos = posizione(p[1]);
                    if (pos) Object.values(this.lati[pos.lato].mons).forEach(m => { if (m.vivo) m.stato = ''; });
                    break;
                }
                case '-boost': case '-unboost': {
                    const m = this._mon(p[1]);
                    if (m && STAT_NOMI[p[2]]) {
                        const n = parseInt(p[3], 10) || 0;
                        m.boost[p[2]] = Math.max(-6, Math.min(6, m.boost[p[2]] + (cmd === '-boost' ? n : -n)));
                    }
                    break;
                }
                case '-setboost': { const m = this._mon(p[1]); if (m && STAT_NOMI[p[2]]) m.boost[p[2]] = parseInt(p[3], 10) || 0; break; }
                case '-clearboost': case '-clearallboost': {
                    if (cmd === '-clearallboost') { for (const l of ['p1', 'p2']) Object.values(this.lati[l].mons).forEach(m => { m.boost = boostVuoti(); }); }
                    else { const m = this._mon(p[1]); if (m) m.boost = boostVuoti(); }
                    break;
                }
                case '-clearpositiveboost': { const m = this._mon(p[1]); if (m) Object.keys(m.boost).forEach(k => { if (m.boost[k] > 0) m.boost[k] = 0; }); break; }
                case '-clearnegativeboost': { const m = this._mon(p[1]); if (m) Object.keys(m.boost).forEach(k => { if (m.boost[k] < 0) m.boost[k] = 0; }); break; }
                case '-invertboost': { const m = this._mon(p[1]); if (m) Object.keys(m.boost).forEach(k => { m.boost[k] = -m.boost[k]; }); break; }
                case '-copyboost': {
                    const da = this._mon(p[2]), a = this._mon(p[1]);
                    if (da && a) a.boost = Object.assign({}, da.boost);
                    break;
                }
                case '-swapboost': {
                    const a = this._mon(p[1]), b = this._mon(p[2]);
                    if (a && b) { const t = a.boost; a.boost = b.boost; b.boost = t; }
                    break;
                }
                case '-weather': {
                    const w = p[1];
                    this.meteo = /Sun|Desolate/i.test(w) ? 'sun' : /Rain|Primordial/i.test(w) ? 'rain' : /Sand/i.test(w) ? 'sand' : /Snow|Hail/i.test(w) ? 'snow' : null;
                    break;
                }
                case '-fieldstart': {
                    const e = p[1] || '';
                    if (/Trick Room/i.test(e)) this.stanzaMagica = true;
                    else if (/Electric Terrain/i.test(e)) this.terreno = 'electric';
                    else if (/Grassy Terrain/i.test(e)) this.terreno = 'grassy';
                    else if (/Misty Terrain/i.test(e)) this.terreno = 'misty';
                    else if (/Psychic Terrain/i.test(e)) this.terreno = 'psychic';
                    break;
                }
                case '-fieldend': {
                    const e = p[1] || '';
                    if (/Trick Room/i.test(e)) this.stanzaMagica = false;
                    else if (/Terrain/i.test(e)) this.terreno = null;
                    break;
                }
                case '-sidestart': case '-sideend': {
                    const lato = (p[1] || '').slice(0, 2);
                    if (!this.lati[lato]) break;
                    const e = p[2] || '';
                    const c = this.lati[lato].campo;
                    const on = cmd === '-sidestart';
                    if (/Tailwind/i.test(e)) c.tailwind = on ? 4 : 0;
                    else if (/Reflect/i.test(e)) c.reflect = on ? 5 : 0;
                    else if (/Light Screen/i.test(e)) c.lightscreen = on ? 5 : 0;
                    else if (/Aurora Veil/i.test(e)) c.auroraveil = on ? 5 : 0;
                    else if (/Stealth Rock/i.test(e)) c.rocce = on ? 1 : 0;
                    else if (/Toxic Spikes/i.test(e)) c.tossine = on ? Math.min(2, c.tossine + 1) : 0;
                    else if (/Spikes/i.test(e)) c.punte = on ? Math.min(3, c.punte + 1) : 0;
                    else if (/Sticky Web/i.test(e)) c.ragnatela = on ? 1 : 0;
                    break;
                }
                case '-ability': { const m = this._mon(p[1]); if (m && p[2]) m.abilita = id(p[2]); break; }
                case '-activate': case '-immune': {
                    // "[from] ability: Levitate" o "ability: Levitate": l'abilità si è rivelata
                    const m = this._mon(p[1]);
                    const trovato = p.slice(2).join('|').match(/ability: ([^|\]]+)/i);
                    if (m && trovato) m.abilita = id(trovato[1]);
                    // "|-immune|p1a: Nome" da solo (senza abilità né altro): la mossa non ha effetto per il suo tipo
                    if (cmd === '-immune' && m && p.length === 2) this._imparaImmunita(m);
                    break;
                }
                case '-item': { const m = this._mon(p[1]); if (m && p[2]) m.strumento = id(p[2]); break; }
                case '-enditem': { const m = this._mon(p[1]); if (m) m.strumento = ''; break; }
                case '-terastallize': {
                    const m = this._mon(p[1]);
                    if (m) { m.tera = p[2]; m.immuneTipi.clear(); }
                    const pos = posizione(p[1]);
                    if (pos && pos.lato === this.lato) this.teraUsata = true;
                    break;
                }
                case 'swap': {
                    const pos = posizione(p[1]);
                    if (!pos) break;
                    const l = this.lati[pos.lato];
                    const nuovo = /^\d+$/.test(p[2]) ? parseInt(p[2], 10) : (posizione(p[2]) || {}).slot;
                    if (nuovo != null && nuovo !== pos.slot) { const t = l.attivi[pos.slot]; l.attivi[pos.slot] = l.attivi[nuovo]; l.attivi[nuovo] = t; }
                    break;
                }
                case 'win': case 'tie': this.finita = true; break;
            }
        }

        // =================================================
        // 2. VISTA DI CALCOLO DI UN POKÉMON
        // =================================================
        // m: Pokémon tracciato; info: dati esatti dalla richiesta (solo per la propria squadra)
        vista(m, info) {
            const sp = this.specie(m.specie);
            const base = sp.baseStats;
            const basi = { hp: base.hp, atk: base.atk, def: base.def, spa: base.spa, spd: base.spd, spe: base.spe };
            const stimate = C.statStimate(basi, m.livello, this.gen);
            let stat = { atk: stimate.atk, def: stimate.def, spa: stimate.spa, spd: stimate.spd, spe: stimate.spe };
            let hpMax = stimate.hp, hp = Math.round(hpMax * m.pct / 100);
            let abilita = m.abilita, strumento = m.strumento, tera = m.tera;
            if (info) {
                if (info.stats) stat = { atk: info.stats.atk, def: info.stats.def, spa: info.stats.spa, spd: info.stats.spd, spe: info.stats.spe };
                if (info.hpMax) { hpMax = info.hpMax; hp = info.hp; }
                abilita = info.ability ? id(info.ability) : (info.baseAbility ? id(info.baseAbility) : abilita);
                strumento = info.item != null ? id(info.item) : strumento;
                if (info.terastallized) tera = info.terastallized;
            }
            const tipiBase = sp.types.slice();
            const vista = {
                nome: m.nome, specie: sp.name, tipi: tera ? [tera] : tipiBase, tipiBase, livello: m.livello, stat,
                hp, hpMax: Math.max(1, hpMax), boost: m.boost, stato: m.stato === 'fnt' ? '' : m.stato, abilita: abilita || null,
                abilitaPossibili: Object.values(sp.abilities || {}).map(id), strumento: strumento || null, tera: tera || null,
                peso: sp.weightkg, nfe: !!(sp.nfe), caduti: this.lati[m.lato].caduti, ref: m, basi,
                immuneTipi: m.immuneTipi, immuneMosse: m.immuneMosse
            };
            if (!vista.abilita && vista.abilitaPossibili.length === 1) vista.abilita = vista.abilitaPossibili[0];
            return vista;
        }

        contesto() {
            return { meteo: this.meteo, terreno: this.terreno, stanzaMagica: this.stanzaMagica, doppio: this.tipo === 'doubles' };
        }

        // Le mosse che si presume abbia un Pokémon avversario: quelle viste, più i suoi attacchi tipici (STAB)
        mosseAvversario(v) {
            const out = Array.from(v.ref.mosseViste).map(k => this.mossa(k)).filter(m => m && m.categoria !== 'Status');
            if (out.length < 4) {
                const fisico = v.stat.atk >= v.stat.spa;
                for (const t of v.tipiBase) {
                    if (out.some(m => m.tipo === t)) continue;
                    const tipica = this.par.presunteDex ? this._stabTipico(v.specie, t, v.stat) : null;
                    out.push(tipica || {
                        id: 'stab-' + t, nome: `${t} STAB`, categoria: fisico ? 'Physical' : 'Special', tipo: t, potenza: 85, precisione: 100,
                        priorita: 0, target: 'normal', flags: {}, secondari: null, presunta: true, multi: null
                    });
                }
            }
            return out;
        }

        // Le mosse che una specie può imparare in questa generazione (anche dai suoi pre-evoluti): serve a presumere cosa porta
        _mosseImparabili(nomeSpecie) {
            const k = 'imp|' + id(nomeSpecie);
            let out = this.cacheSpecie.get(k);
            if (out) return out;
            out = new Set();
            const dati = this.dex.data && this.dex.data.Learnsets;
            if (dati) {
                // retroattive: valgono le fonti di ogni generazione fino a quella della partita
                const raccogli = () => {
                    let sp = this.specie(nomeSpecie);
                    const viste = new Set();
                    while (sp && sp.exists && !viste.has(sp.id)) {
                        viste.add(sp.id);
                        let d = dati[sp.id];
                        if ((!d || !d.learnset) && sp.baseSpecies && sp.baseSpecies !== sp.name) d = dati[id(sp.baseSpecies)];
                        if (d && d.learnset) {
                            for (const [mossa, fonti] of Object.entries(d.learnset)) {
                                if (fonti.some(src => 'MLT'.includes(src.charAt(1)) && parseInt(src, 10) <= this.gen)) out.add(mossa);
                            }
                        }
                        sp = sp.prevo ? this.dex.species.get(sp.prevo) : null;
                    }
                };
                raccogli();
            }
            this.cacheSpecie.set(k, out);
            return out;
        }

        // La mossa di attacco di un tipo che farebbe più male a chi la usa (potenza x precisione x la statistica con cui attacca, un po'
        // meno con rinculo o potenziamenti negativi) tra quelle che la specie può imparare: è ciò che di solito porta chi ha quel tipo.
        // null se non ne ha. `stat`: le statistiche stimate del Pokémon (conta quale tra Attacco e Attacco Speciale è la migliore).
        _stabTipico(nomeSpecie, tipo, stat) {
            const k = `stab|${id(nomeSpecie)}|${tipo}`;
            if (this.cacheSpecie.has(k)) return this.cacheSpecie.get(k);
            let migliore = null, mv = 0;
            for (const nome of this._mosseImparabili(nomeSpecie)) {
                const m = this.mossa(nome);
                if (!m || m.categoria === 'Status' || m.tipo !== tipo) continue;
                if (!(m.potenza > 0) || m.esclusa || m.dueTurni || m.ricarica || m.ohko || m.dannoFisso || m.id === 'fakeout' || m.id === 'firstimpression') continue;
                let val = m.potenza * (m.precisione / 100) * (m.categoria === 'Physical' ? stat.atk : stat.spa);
                if (m.rinculo) val *= 0.9;
                if (m.boostSelf && Object.values(m.boostSelf).some(x => x < 0)) val *= 0.85;
                if (m.priorita > 0) val *= 0.7;
                if (m.target === 'allAdjacent') val *= 0.9;
                if (m.rinculoMax) val *= 0.6;
                if (val > mv) { mv = val; migliore = m; }
            }
            // quanto fidarsi della mossa più forte che potrebbe avere: 1 = tutta, 0 = la potenza media di un attacco principale (85)
            const w = Math.max(0, Math.min(1, this.par.presunteDex));
            const r = migliore ? Object.assign({}, migliore, { presunta: true, potenza: Math.round((1 - w) * 85 + w * migliore.potenza) }) : null;
            this.cacheSpecie.set(k, r);
            return r;
        }

        // =================================================
        // 3. SCELTA
        // =================================================
        // richiesta: oggetto grezzo del simulatore. opz: { errori: numero di scelte già rifiutate in questa richiesta }
        scegli(richiesta, opz) {
            opz = opz || {};
            if (!richiesta || richiesta.wait) return null;
            const errori = opz.errori || 0;
            try {
                if (errori < 3) {
                    if (richiesta.teamPreview) return this.anteprima(richiesta);
                    if (richiesta.forceSwitch) return this.cambioForzato(richiesta);
                    return this.turnoDiMosse(richiesta, errori);
                }
            } catch (e) {
                if (this.debug) console.warn('CPU: errore nella scelta, uso la scelta di riserva', e);
            }
            return this.rispostaDiRiserva(richiesta, errori);
        }

        _squadra(richiesta) {
            return richiesta.side.pokemon.map((p, i) => {
                const d = leggiDettagli(p.details);
                const nome = p.ident.replace(/^p[12]: /, '');
                const h = leggiHp(p.condition);
                const esausto = p.condition.endsWith(' fnt');
                let m = this.lati[this.lato].mons[nome];
                if (!m) m = this.lati[this.lato].mons[nome] = this._nuovoMon(this.lato, nome, d.specie, d.livello);
                m.specie = d.specie; m.livello = d.livello;
                if (!esausto) m.pct = h.pct; else { m.pct = 0; m.vivo = false; }
                if (h.stato) m.stato = h.stato; else if (!esausto) m.stato = '';
                m.abilita = p.ability ? id(p.ability) : (p.baseAbility ? id(p.baseAbility) : m.abilita);
                m.strumento = p.item != null ? id(p.item) : m.strumento;
                if (p.teraType) m.teraTipo = p.teraType;
                return {
                    indice: i + 1, p, m, nome, attivo: !!p.active, esausto, comanda: !!p.commanding,
                    info: { stats: p.stats, hp: h.hp, hpMax: h.hpMax, ability: p.ability, baseAbility: p.baseAbility, item: p.item, terastallized: p.terastallized || (m.tera || null) }
                };
            });
        }

        // ---------- strategia del team ----------
        // Cosa fa il team e chi lo fa, letto dai set dei Pokémon portati: chi mette Tailwind, Stanza Magica, il meteo, gli schermi,
        // chi ne approfitta. Il piano ("tailwind", "trickroom", "pioggia"...) è quello deciso da chi ha composto il team, se è
        // davvero realizzabile con chi c'è; altrimenti si deduce da ciò che il team sa fare.
        _leggiStrategia(squadra) {
            const idm = k => id(k);
            const dati = squadra.map(s => {
                const sp = this.specie(s.m.specie || leggiDettagli(s.p.details).specie);
                const b = sp.baseStats;
                const moves = s.p.moves.map(idm);
                const abilita = idm(s.p.baseAbility || s.p.ability);
                const offesa = Math.max(b.atk, b.spa);
                return {
                    indice: s.indice, vivo: !s.esausto, moves, abilita, offesa, tipi: sp.types.slice(),
                    ha: k => moves.includes(k),
                    lento: b.spe <= 70 && offesa >= 95
                };
            });
            const vivi = dati.filter(d => d.vivo);
            const con = f => vivi.filter(f).map(d => d.indice);
            const meteoDi = d => Object.keys(K.METEO_SETTER).find(w => K.METEO_SETTER[w].includes(d.abilita)) || null;
            const setterMeteo = {};
            vivi.forEach(d => { const w = meteoDi(d); if (w) (setterMeteo[w] = setterMeteo[w] || []).push(d.indice); });
            const sfrutta = (d, w) => K.METEO_SFRUTTATORI[w].includes(d.abilita) || (d.tipi.includes(K.METEO_TIPO[w]) && d.offesa >= 80) ||
                (w === 'rain' && d.ha('thunder')) || (w === 'sun' && (d.ha('solarbeam') || d.ha('weatherball')));
            const abusatori = {};
            Object.keys(setterMeteo).forEach(w => { abusatori[w] = vivi.filter(d => !setterMeteo[w].includes(d.indice) && sfrutta(d, w)).map(d => d.indice); });
            const S = {
                vento: con(d => d.ha('tailwind')), stanza: con(d => d.ha('trickroom')), lenti: con(d => d.lento),
                meteoSetter: setterMeteo, abusatori,
                fakeout: con(d => d.ha('fakeout')), redirezione: con(d => d.ha('followme') || d.ha('ragepowder'))
            };
            // il piano
            const dato = this.pianoDato;
            const meteoDato = dato && K.PIANO_METEO[dato];
            let piano = null, meteo = null;
            if (dato === 'tailwind' && S.vento.length) piano = 'tailwind';
            else if (dato === 'trickroom' && S.stanza.length) piano = 'trickroom';
            else if (meteoDato && (setterMeteo[meteoDato] || []).length) { piano = dato; meteo = meteoDato; }
            else if (dato && !['tailwind', 'trickroom'].includes(dato) && !meteoDato) piano = dato;     // bilanciato, offensivo, bulky
            if (!piano) {
                // dedotto: la Stanza Magica con chi ne approfitta, poi il meteo con chi ne approfitta, poi Tailwind
                const meteoVero = Object.keys(setterMeteo).find(w => abusatori[w].length) || null;
                if (S.stanza.length && S.lenti.length >= 2) piano = 'trickroom';
                else if (meteoVero) { piano = Object.keys(K.PIANO_METEO).find(n => K.PIANO_METEO[n] === meteoVero); meteo = meteoVero; }
                else if (S.vento.length) piano = 'tailwind';
                else piano = 'bilanciato';
            }
            S.piano = piano;
            S.meteo = meteo;
            return S;
        }

        // ---------- anteprima ----------
        // Si sceglie guardando i 6 Pokémon dell'avversario (l'anteprima mostra solo le specie): per ognuno dei miei, chi gli fa più
        // male, chi lo mette in difficoltà e chi muove prima; poi si cerca il gruppo che ha una risposta per tutti i loro, senza
        // debolezze condivise, con il nucleo del piano (chi mette Tailwind/Stanza Magica/meteo e chi ne approfitta).
        // I due in campo per primi (uno nel singolo) sono la coppia con più sinergia e che meglio apre contro i loro 6.
        anteprima(richiesta) {
            const squadra = this._squadra(richiesta);
            const quanti = Math.min(richiesta.maxChosenTeamSize || squadra.length, squadra.length);
            const strat = this.strategia = this._leggiStrategia(squadra);
            const ctx = this.contesto();
            const latoAvv = this.lati[lato2(this.lato)];
            const lvl = latoAvv.livelloSquadra || squadra[0].m.livello;
            const avversari = latoAvv.squadra.map(nome => {
                const s = this.specie(nome);
                return this.vista(this._nuovoMon(lato2(this.lato), nome, s.name, lvl));
            });
            const miei = squadra.map(s => ({ s, v: this.vista(s.m, s.info), mosse: s.p.moves.map(k => this.mossa(k)).filter(Boolean) }));
            const n = miei.length;

            // gli scontri: per ognuno dei miei contro ognuno dei loro
            const nessunoAvv = !avversari.length;
            const M = miei.map(x => avversari.map(o => {
                const dato = this._miglioreSu(x.v, o, x.mosse, ctx);
                const preso = this._miglioreSu(o, x.v, this.mosseAvversario(Object.assign({}, o, { ref: { mosseViste: new Set() } })), ctx);
                const prima = C.confrontoVelocita(x.v, o, ctx) > 0;
                // vantaggio dello scontro: quanto fa (al massimo il 120% dell'avversario), quanto prende, chi muove prima
                const adv = Math.min(1.2, dato) - 0.85 * Math.min(1.2, preso) + (prima ? 0.25 : -0.1);
                return { dato, preso, prima, adv: Math.max(-1.5, Math.min(1.8, adv)) };
            }));
            // chi fa più paura: pesa di più nella ricerca delle risposte
            const peso = avversari.map((o, j) => 1 + this.par.antPesoMinaccia * 0.5 * Math.min(1.5, miei.reduce((s, x, i) => s + M[i][j].preso, 0) / Math.max(1, n)));
            const pesoTot = peso.reduce((s, x) => s + x, 0) || 1;
            const forza = i => nessunoAvv ? this._bst(miei[i].s.p.details) / 600 : M[i].reduce((s, e) => s + e.adv, 0) / M[i].length;

            // i tipi con cui colpiscono (STAB) e quanti dei loro li hanno: servono a non portare 3 Pokémon deboli alla stessa cosa
            const tipiLoro = {};
            avversari.forEach(o => o.tipiBase.forEach(tp => { tipiLoro[tp] = (tipiLoro[tp] || 0) + 1; }));
            const debole = (i, tp) => K.moltiplicatoreTipo(this.dex, tp, miei[i].v.tipi) > 1;

            const ruoloPiano = i => {
                const ind = miei[i].s.indice;
                if (strat.piano === 'tailwind') return strat.vento.includes(ind) ? 'setter' : (miei[i].v.basi.spe >= 70 && Math.max(miei[i].v.basi.atk, miei[i].v.basi.spa) >= 90 ? 'abusatore' : null);
                if (strat.piano === 'trickroom') return strat.stanza.includes(ind) ? 'setter' : (strat.lenti.includes(ind) ? 'abusatore' : null);
                if (strat.meteo) {
                    if ((strat.meteoSetter[strat.meteo] || []).includes(ind)) return 'setter';
                    if ((strat.abusatori[strat.meteo] || []).includes(ind)) return 'abusatore';
                }
                return null;
            };
            const haSetter = Boolean(strat.piano === 'tailwind' || strat.piano === 'trickroom' || strat.meteo) && miei.some((x, i) => ruoloPiano(i) === 'setter');

            const punteggioGruppo = idx => {
                let copertura = 0;
                if (!nessunoAvv) {
                    avversari.forEach((o, j) => { copertura += peso[j] * Math.max(...idx.map(i => M[i][j].adv)); });
                    copertura /= pesoTot;
                }
                const media = idx.reduce((s, i) => s + forza(i), 0) / idx.length;
                let s = this.par.antCopertura * copertura + this.par.antMedia * media;
                // debolezze condivise rispetto a ciò con cui colpiscono i loro
                for (const tp of Object.keys(tipiLoro)) {
                    const deboli = idx.filter(i => debole(i, tp)).length;
                    if (deboli >= 2) s -= this.par.antDeboli * (deboli - 1) * 0.3 * (tipiLoro[tp] / Math.max(1, avversari.length)) * 2;
                }
                // il nucleo del piano
                if (haSetter) {
                    const setter = idx.filter(i => ruoloPiano(i) === 'setter').length;
                    const abus = idx.filter(i => ruoloPiano(i) === 'abusatore').length;
                    s += this.par.antPiano * (setter ? 0.9 : -1.2);
                    s += this.par.antPiano * Math.min(2, abus) * 0.3;
                    if (strat.piano === 'trickroom') s -= this.par.antPiano * idx.filter(i => miei[i].v.basi.spe >= 100 && ruoloPiano(i) !== 'setter').length * 0.3;
                }
                return s + this.casuale() * 0.03;
            };

            // tutti i gruppi di `quanti` tra i miei
            const gruppi = [];
            const scelgo = (da, k, cur) => {
                if (cur.length === k) { gruppi.push(cur.slice()); return; }
                for (let i = da; i < n; i++) { cur.push(i); scelgo(i + 1, k, cur); cur.pop(); }
            };
            scelgo(0, quanti, []);
            let migliore = gruppi[0], mv = -1e9;
            for (const g of gruppi) { const v = punteggioGruppo(g); if (v > mv) { mv = v; migliore = g; } }

            // chi in campo per primo
            const nCampo = this.tipo === 'doubles' ? 2 : 1;
            const aperturaContro = idx => {
                if (nessunoAvv) return idx.reduce((s, i) => s + forza(i), 0) / idx.length;
                let s = 0;
                avversari.forEach((o, j) => { s += peso[j] * Math.max(...idx.map(i => M[i][j].adv)); });
                return s / pesoTot;
            };
            let ordine;
            if (nCampo === 2 && migliore.length >= 2) {
                let coppia = null, cv = -1e9;
                for (let a = 0; a < migliore.length; a++) for (let b = a + 1; b < migliore.length; b++) {
                    const A = migliore[a], B = migliore[b];
                    let v = aperturaContro([A, B]);
                    if (haSetter) {
                        const ruoli = [ruoloPiano(A), ruoloPiano(B)];
                        if (ruoli.includes('setter')) v += this.par.antPiano * 0.8;
                        if (strat.piano === 'trickroom' && ruoli.includes('setter')) {
                            // chi mette la Stanza Magica va protetto: Fake Out, deviatore o almeno un compagno che regge
                            const altro = ruoli[0] === 'setter' ? B : A;
                            const ind = miei[altro].s.indice;
                            if (strat.fakeout.includes(ind) || strat.redirezione.includes(ind)) v += 0.4;
                        }
                    }
                    if (v > cv) { cv = v; coppia = [A, B]; }
                }
                const resto = migliore.filter(i => !coppia.includes(i)).sort((x, y) => forza(y) - forza(x));
                ordine = coppia.concat(resto);
            } else {
                let primo = migliore[0], pv = -1e9;
                for (const i of migliore) {
                    let v = aperturaContro([i]);
                    if (haSetter && ruoloPiano(i) === 'setter') v += this.par.antLeadSetter;
                    if (v > pv) { pv = v; primo = i; }
                }
                ordine = [primo].concat(migliore.filter(i => i !== primo).sort((x, y) => forza(y) - forza(x)));
            }
            return 'team ' + ordine.map(i => miei[i].s.indice).join('');
        }

        // Miglior danno atteso (frazione dell'HP del bersaglio) tra le mosse date
        _miglioreSu(att, dif, mosse, ctx) {
            let migliore = 0;
            for (const m of mosse) {
                if (!m || m.categoria === 'Status') continue;
                const d = C.danno(this.dex, att, dif, m, ctx, {});
                const v = d.fraz * C.precisione(att, dif, m, ctx);
                if (v > migliore) migliore = v;
            }
            return migliore;
        }

        // ---------- cambio forzato (un Pokémon è caduto) ----------
        cambioForzato(richiesta) {
            const squadra = this._squadra(richiesta);
            this.squadraCorrente = squadra;
            this.strategia = this._leggiStrategia(squadra);
            const ctx = this.contesto();
            const usati = new Set();
            const nemici = this._avversariInCampo();
            return richiesta.forceSwitch.map((deve, slot) => {
                if (!deve) return 'pass';
                if (squadra[slot] && squadra[slot].p.reviving) {
                    // Revival Blessing: si sceglie chi rianimare, il più forte tra i caduti
                    const caduti = squadra.filter(s => s.esausto && !usati.has(s.indice));
                    if (!caduti.length) return 'pass';
                    const forte = caduti.slice().sort((a, b) => this._bst(b.p.details) - this._bst(a.p.details))[0];
                    usati.add(forte.indice);
                    return `switch ${forte.indice}`;
                }
                const liberi = squadra.filter(s => !s.attivo && !s.esausto && !s.comanda && !usati.has(s.indice));
                if (!liberi.length) return 'pass';
                let migliore = null, mv = -1e9;
                for (const s of liberi) {
                    const v = this.vista(s.m, s.info);
                    let val = this._valoreEntrata(v, nemici, ctx, s.p.moves.map(k => this.mossa(k)).filter(Boolean));
                    // cosa fa entrando (meteo, terreno, Intimidazione) e se serve al piano
                    val += this._abilitaIngresso(this._clona(v), Object.assign({}, ctx), nemici.map(o => this._clona(o)));
                    if (val > mv) { mv = val; migliore = s; }
                }
                usati.add(migliore.indice);
                return `switch ${migliore.indice}`;
            }).join(', ');
        }

        _bst(dettagli) {
            const b = this.specie(leggiDettagli(dettagli).specie).baseStats;
            return b.hp + b.atk + b.def + b.spa + b.spd + b.spe;
        }

        _avversariInCampo() {
            const l = this.lati[lato2(this.lato)];
            return l.attivi.slice(0, this.tipo === 'doubles' ? 2 : 1).map(n => n && l.mons[n]).filter(m => m && m.vivo).map(m => this.vista(m));
        }

        // Quanto male fa `x` a `o` con la sua mossa migliore (frazione dell'HP di `o`)
        _minaccia(x, o, ctx) {
            const mosse = x.moves ? x.moves.map(k => this.mossa(k)).filter(Boolean) : this.mosseAvversario(x);
            return this._miglioreSu(x, o, mosse, ctx);
        }

        // Quanto va bene mandare questo Pokémon contro chi c'è in campo
        _valoreEntrata(v, nemici, ctx, mosse) {
            if (!nemici.length) return v.hp / v.hpMax;
            let s = 0;
            for (const o of nemici) {
                const dato = this._miglioreSu(v, o, mosse, ctx);
                const preso = this._miglioreSu(o, v, this.mosseAvversario(o), ctx);
                const prima = C.confrontoVelocita(v, o, ctx) > 0;
                s += Math.min(1.2, dato) * (prima ? 1.15 : 1) - 0.9 * Math.min(1.5, preso);
            }
            return s / nemici.length + 0.6 * (v.hp / v.hpMax);
        }

        // =================================================
        // 4. TURNO DI MOSSE
        // =================================================
        turnoDiMosse(richiesta, errori) {
            const squadra = this._squadra(richiesta);
            this.squadraCorrente = squadra;
            this.strategia = this._leggiStrategia(squadra);
            const doppio = this.tipo === 'doubles' || richiesta.active.length > 1;
            const nSlot = richiesta.active.length;
            const ctx = this.contesto();
            ctx.doppio = doppio;

            const mie = [];     // viste dei miei attivi per slot
            for (let i = 0; i < nSlot; i++) {
                const s = squadra[i];
                mie.push(s && !s.esausto && !s.comanda ? Object.assign(this.vista(s.m, s.info), { indice: s.indice, slot: i, req: richiesta.active[i], moves: s.p.moves }) : null);
            }
            const avvL = this.lati[lato2(this.lato)];
            const avv = [];
            for (let i = 0; i < nSlot; i++) {
                const n = avvL.attivi[i];
                const m = n && avvL.mons[n];
                avv.push(m && m.vivo ? this.vista(m) : null);
            }

            // elenco delle azioni possibili per slot
            const opzioni = mie.map((v, slot) => v ? this._azioniDelloSlot(v, slot, squadra, mie, avv, ctx) : [{ tipo: 'passa', testo: 'pass', slot }]);

            const stato0 = { mie, avv, squadra, ctx, doppio, richiesta };
            stato0.matrice = this._preparaMatrice(stato0);
            const alternative = this._scenariAvversari(stato0);
            if (this.debug) this.ultimoStato = { stato0, alternative, opzioni };

            let migliori = [];
            const combina = (idx, scelta) => {
                if (idx === nSlot) {
                    // due slot non possono cambiare con lo stesso Pokémon
                    const cambi = scelta.filter(a => a.tipo === 'cambio').map(a => a.verso);
                    if (new Set(cambi).size !== cambi.length) return;
                    if (scelta.filter(a => a.gimmick === 'terastallize').length > 1) return;
                    if (scelta.filter(a => a.gimmick && a.gimmick !== 'terastallize').length > 1) return;
                    const val = this._valutaPiano(scelta, stato0, alternative);
                    migliori.push({ scelta: scelta.slice(), val });
                    return;
                }
                for (const a of opzioni[idx]) { scelta.push(a); combina(idx + 1, scelta); scelta.pop(); }
            };
            combina(0, []);
            if (!migliori.length) return this.rispostaDiRiserva(richiesta, errori);

            // un pizzico di casualità solo tra scelte quasi pari: non essere prevedibile
            for (const x of migliori) x.val += this.casuale() * 0.02;
            migliori.sort((a, b) => b.val - a.val);
            // dopo un rifiuto del simulatore si passa alla seconda, terza scelta...
            const pick = migliori[Math.min(errori, migliori.length - 1)];
            this._ricorda(pick.scelta, stato0);
            if (this.debug) this.ultimaValutazione = migliori.slice(0, 5).map(x => ({ val: +x.val.toFixed(3), azioni: x.scelta.map(a => a.testo + (a.nome ? ` [${a.nome}]` : '')) }));
            return pick.scelta.map(a => a.testo).join(', ');
        }

        _ricorda(scelta, S) {
            scelta.forEach((a, slot) => {
                this.ultimeAzioni[slot] = a;
                const m = S && S.mie[slot] && S.mie[slot].ref;
                if (m) {
                    if (a.tipo === 'mossa' && a.mossa && (a.mossa.protezione || a.mossa.id === 'wideguard' || a.mossa.id === 'quickguard')) this._registraProtezione(m);
                    else { m.protezioniDiFila = 0; m.ultimaProtezione = -9; }
                }
                if (a.gimmick === 'terastallize') this.teraUsata = true;
            });
        }

        // ---------- enumerazione ----------
        _azioniDelloSlot(v, slot, squadra, mie, avv, ctx) {
            const req = v.req;
            const azioni = [];
            const doppio = ctx.doppio;

            // mosse
            const mosse = req.moves || [];
            // mossa obbligata (carica, ricarica, blocco): una sola e senza scelta
            const usabili = mosse.map((m, j) => ({ m, j })).filter(x => !x.m.disabled && x.m.pp !== 0);
            if (!usabili.length) return [{ tipo: 'mossa', testo: 'move 1', slot, mossa: null, nome: 'forced' }];
            // Mega e Teracristal sono varianti di ogni mossa: una sola Mega per turno, una sola Teracristal per partita
            const gimmicks = [null];
            if (req.canMegaEvo) gimmicks.push('mega');
            if (req.canMegaEvoX) gimmicks.push('megax');
            if (req.canMegaEvoY) gimmicks.push('megay');
            if (req.canTerastallize && !this.teraUsata) gimmicks.push('terastallize');

            for (const { m, j } of usabili) {
                const d = this.mossa(m.id || m.move);
                if (!d) { azioni.push({ tipo: 'mossa', testo: `move ${j + 1}`, slot, mossa: null, nome: m.move, mossaIdx: j + 1 }); continue; }
                const bersagli = this._bersagli(m.target, slot, doppio, avv, mie);
                for (const g of gimmicks) {
                    if (g === 'terastallize' && d.categoria === 'Status' && !d.potenziamento) continue;
                    for (const t of bersagli) {
                        const suff = g ? ` ${g}` : '';
                        azioni.push({
                            tipo: 'mossa', slot, mossa: d, nome: d.nome, mossaIdx: j + 1, bersaglio: t, gimmick: g,
                            testo: `move ${j + 1}${t != null ? ' ' + t : ''}${suff}`
                        });
                    }
                }
            }

            // cambi
            if (!req.trapped) {
                for (const s of squadra) {
                    if (s.attivo || s.esausto || s.comanda) continue;
                    azioni.push({ tipo: 'cambio', slot, verso: s.indice, nome: s.nome, testo: `switch ${s.indice}`, squadraInfo: s });
                }
            }
            return azioni;
        }

        // Quali bersagli ha senso provare (numerazione del simulatore: avversari 1,2; alleati -1,-2)
        _bersagli(tipoTarget, slot, doppio, avv, mie) {
            if (!doppio) return [null];
            const altro = slot === 0 ? 1 : 0;
            const nemici = [0, 1].filter(i => avv[i]).map(i => i + 1);
            switch (tipoTarget) {
                case 'normal': case 'any': case 'adjacentFoe':
                    return nemici.length ? nemici : [1];
                case 'adjacentAlly': return [-(altro + 1)];
                case 'adjacentAllyOrSelf': return [-(slot + 1), -(altro + 1)];
                default: return [null];
            }
        }

        // ---------- avversario previsto ----------
        // Restituisce due scenari: l'avversario fa la mossa migliore sul bersaglio migliore; oppure punta l'altro bersaglio
        _scenariAvversari(S) {
            const piani = [];
            for (const variante of [0, 1]) {
                const azioni = [];
                S.avv.forEach((o, i) => {
                    if (!o) return;
                    azioni.push(this._azioneAvversaria(o, i, S, variante));
                });
                piani.push(azioni);
            }
            return [{ peso: 0.65, azioni: piani[0] }, { peso: 0.35, azioni: piani[1] }];
        }

        _azioneAvversaria(o, slot, S, variante) {
            const ctx = S.ctx;
            const bersagli = S.mie.map((v, i) => v ? i : -1).filter(i => i >= 0);
            const mosse = this.mosseAvversario(o);
            const forte = [];
            for (const m of mosse) {
                if (m.categoria === 'Status') continue;
                for (const b of bersagli) {
                    const dif = S.mie[b];
                    const d = C.danno(this.dex, o, dif, m, ctx, { bersagliMultipli: S.doppio && ['allAdjacent', 'allAdjacentFoes'].includes(m.target) });
                    let v = d.fraz * C.precisione(o, dif, m, ctx) * (1 + (d.frazMax >= dif.hp / dif.hpMax ? 0.4 : 0));
                    if (m.priorita > 0) v *= 1.1;
                    // chi si farebbe male da solo (rinculo) non usa quella mossa se rischia di cadere per questo
                    if (m.rinculoMax && o.hp <= o.hpMax * m.rinculoMax) v *= 0.1;
                    else if (m.rinculo && o.abilita !== 'rockhead' && o.abilita !== 'magicguard' && d.medio * m.rinculo[0] / m.rinculo[1] >= o.hp) v *= 0.4;
                    forte.push({ m, b, v });
                }
            }
            forte.sort((a, b) => b.v - a.v);
            let migliore = forte[0] || null;
            if (variante === 1 && forte.length > 1 && S.doppio) {
                const alt = forte.find(x => x.b !== migliore.b);
                if (alt) migliore = alt;
            }
            if (!migliore) return { tipo: 'passa', slot };
            return { tipo: 'mossa', slot, mossa: migliore.m, bersaglio: migliore.b, lato: 'avv' };
        }

        // =================================================
        // 5. SIMULAZIONE DEL TURNO
        // =================================================
        _clona(v) {
            const c = Object.assign({}, v);
            c.boost = Object.assign({}, v.boost);
            c.protetto = false;
            return c;
        }

        // Valore di un piano di azioni: media sugli scenari dell'avversario, e sugli esiti della Protezione
        // (la seconda di fila riesce una volta su tre: va pesata come una scommessa, non come uno sconto sul danno)
        _valutaPiano(scelta, S, scenari) {
            const incerte = [];
            let penalita = 0;
            scelta.forEach((a, i) => {
                if (a.tipo === 'mossa' && a.mossa && a.mossa.protezione) {
                    const consecutive = this._protezioniDiFila(S.mie[i] && S.mie[i].ref);
                    const p = consecutive === 0 ? 1 : Math.pow(1 / 3, consecutive);
                    incerte.push({ slot: i, p });
                    penalita += this.par.penalitaProt * consecutive;
                }
            });
            // tutte le combinazioni di riuscita/fallimento delle protezioni incerte
            let esiti = [{ peso: 1, riesce: {} }];
            for (const x of incerte) {
                const nuovi = [];
                for (const e of esiti) {
                    if (x.p > 0) nuovi.push({ peso: e.peso * x.p, riesce: Object.assign({}, e.riesce, { [x.slot]: true }) });
                    if (x.p < 1) nuovi.push({ peso: e.peso * (1 - x.p), riesce: Object.assign({}, e.riesce, { [x.slot]: false }) });
                }
                esiti = nuovi;
            }
            // con un cambio l'avversario può anche rispondere a chi entra (non solo a chi esce): una parte del peso va alla sua
            // risposta migliore contro i nuovi arrivati. È questo che rende "sicuro" un cambio: chi entra deve reggere anche quella.
            const lam = scelta.some(a => a.tipo === 'cambio') ? (S.doppio ? this.par.rispostaAlCambioDoppio : this.par.rispostaAlCambio) : 0;
            let tot = 0;
            scenari.forEach((sc, k) => {
                const parti = lam > 0
                    ? [{ peso: sc.peso * (1 - lam), azioni: sc.azioni }, { peso: sc.peso * lam, azioni: this._rispostaAlCambio(scelta, S, k) }]
                    : [sc];
                for (const q of parti) for (const e of esiti) tot += q.peso * e.peso * this._simula(scelta, S, q.azioni, e.riesce);
            });
            return tot - penalita;
        }

        // Le azioni dell'avversario se a rispondere a chi entra dopo i miei cambi (la mossa migliore contro i nuovi arrivati)
        _rispostaAlCambio(scelta, S, variante) {
            const chiave = scelta.map(a => (a.tipo === 'cambio' ? a.verso : '-')).join(',') + '|' + variante;
            const cache = S.cacheRisposte || (S.cacheRisposte = new Map());
            if (cache.has(chiave)) return cache.get(chiave);
            const mie = S.mie.map((v, i) => {
                const a = scelta[i];
                if (!a || a.tipo !== 'cambio') return v;
                const sq = a.squadraInfo;
                return Object.assign(this.vista(sq.m, sq.info), { indice: sq.indice, slot: i, moves: sq.p.moves });
            });
            const S2 = Object.assign({}, S, { mie });
            const azioni = [];
            S.avv.forEach((o, i) => { if (o) azioni.push(this._azioneAvversaria(o, i, S2, variante)); });
            cache.set(chiave, azioni);
            return azioni;
        }

        _pesoMon(v) { return 0.7 + (v.basi ? (v.basi.hp + v.basi.atk + v.basi.def + v.basi.spa + v.basi.spd + v.basi.spe) / 1500 : 0.3); }

        _simula(scelta, S, azioniAvv, riesceProtezione) {
            const ctx = Object.assign({}, S.ctx);
            const doppio = S.doppio;
            const mie = S.mie.map(v => v ? this._clona(v) : null);
            const avv = S.avv.map(v => v ? this._clona(v) : null);
            const campoMio = Object.assign({}, this.lati[this.lato].campo);
            const campoAvv = Object.assign({}, this.lati[lato2(this.lato)].campo);
            const inizio = { mie: mie.map(v => v && v.hp / v.hpMax), avv: avv.map(v => v && v.hp / v.hpMax) };
            const peso = { mie: mie.map(v => v && this._pesoMon(v)), avv: avv.map(v => v && this._pesoMon(v)) };
            let valore = 0;
            const flinch = { mie: [false, false], avv: [false, false] };
            const aiuto = { mie: [false, false], avv: [false, false] };
            const deviatore = { mie: -1, avv: -1 };
            let teraUsataQui = false;
            let bonus = 0;

            // 1) cambi e Teracristal/Mega: avvengono prima delle mosse
            const azioni = [];
            scelta.forEach((a, i) => { azioni.push({ lato: 'mie', slot: i, a }); });
            azioniAvv.forEach(a => { if (a.tipo !== 'passa') azioni.push({ lato: 'avv', slot: a.slot, a }); });

            for (const x of azioni) {
                if (x.lato !== 'mie') continue;
                const a = x.a;
                if (a.tipo === 'cambio') {
                    const s = a.squadraInfo;
                    const uscente = mie[x.slot];
                    const nuovo = this._clona(Object.assign(this.vista(s.m, s.info), { indice: s.indice, slot: x.slot, moves: s.p.moves }));
                    mie[x.slot] = nuovo;   // chi esce perde i potenziamenti, chi entra parte pulito
                    peso.mie[x.slot] = this._pesoMon(nuovo);
                    inizio.mie[x.slot] = nuovo.hp / nuovo.hpMax;
                    // trappole all'ingresso
                    const dannoTrappole = this._dannoTrappole(nuovo, campoMio, ctx);
                    nuovo.hp = Math.max(0, nuovo.hp - dannoTrappole);
                    bonus -= doppio ? this.par.costoCambioDoppio : this.par.costoCambio;      // cambiare costa un turno
                    if (!doppio && uscente && uscente.hpMax) bonus -= this.par.costoCambioSano * Math.max(0, uscente.hp / uscente.hpMax - 0.4) / 0.6;   // ...di più se chi esce sta bene
                    if (this.cambiRecenti[x.slot] === this.turno - 1) bonus -= 0.25;   // evita i va e vieni
                    if (this.ultimoUscito[x.slot] === s.nome) bonus -= 0.3;            // rientrare subito chi è appena uscito
                    bonus += this._abilitaIngresso(nuovo, ctx, avv);
                } else if (a.gimmick === 'terastallize') {
                    const v = mie[x.slot];
                    if (v) { v.tera = (v.ref && v.ref.teraTipo) || v.tipiBase[0]; v.tipi = [v.tera]; }
                    teraUsataQui = true;
                } else if (a.gimmick === 'mega' || a.gimmick === 'megax' || a.gimmick === 'megay') {
                    const v = mie[x.slot];
                    if (v) this._applicaMega(v);
                    bonus += 0.2;       // la Mega si fa appena si può: è un vantaggio che dura tutta la partita
                }
            }

            // 2) ordine delle altre azioni
            const priorita = (x) => {
                const a = x.a, v = (x.lato === 'mie' ? mie : avv)[x.slot];
                if (a.tipo === 'cambio') return 8;
                if (!a.mossa) return 0;
                let p = a.mossa.priorita || 0;
                if (v && v.abilita === 'prankster' && a.mossa.categoria === 'Status') p += 1;
                if (v && v.abilita === 'galewings' && a.mossa.tipo === 'Flying' && v.hp >= v.hpMax) p += 1;
                return p;
            };
            const ventoDi = (lato, slot) => (lato === 'mie' ? campoMio.tailwind : campoAvv.tailwind) > 0;
            const ordine = azioni.filter(x => x.a.tipo !== 'cambio').map(x => ({ x, p: priorita(x), v: (x.lato === 'mie' ? mie : avv)[x.slot] }))
                .filter(o => o.v)
                .sort((A, B) => {
                    if (A.p !== B.p) return B.p - A.p;
                    const c = C.confrontoVelocita(A.v, B.v, ctx, ventoDi(A.x.lato, A.x.slot), ventoDi(B.x.lato, B.x.slot));
                    return c !== 0 ? -c : (A.x.lato === 'mie' ? 1 : -1);   // a pari velocità si ipotizza il peggio
                });

            const insiemi = lato => (lato === 'mie' ? mie : avv);
            const nemici = lato => (lato === 'mie' ? avv : mie);
            const keyL = lato => (lato === 'mie' ? 'mie' : 'avv');
            const chiave = lato => (lato === 'mie' ? 'avv' : 'mie');
            const schermiDi = lato => (lato === 'mie' ? campoMio : campoAvv);

            // Chi può non agire (tentennamento, "flinch"): la probabilità che il suo turno si giochi davvero.
            // Un Pokémon colpito prima da una mossa che fa tentennare al 30% agisce con probabilità 0,7: la sua mossa
            // pesa il 70% (danni, KO, effetti), non tutto o niente.
            const agisce = { mie: [1, 1, 1], avv: [1, 1, 1] };
            const usatiDaPerno = new Set(scelta.filter(a => a.tipo === 'cambio').map(a => a.verso));

            // Una singola azione dell'ordine, applicata allo stato. `f` = probabilità che l'attore agisca (per i tentennamenti).
            const eseguiAzione = (x, lato, a, me, m, f) => {
                // ---- protezioni ----
                if (m.protezione) {
                    // proteggersi non fa mai niente da solo: il valore sta nei danni evitati
                    if (lato !== 'mie' || (riesceProtezione || {})[x.slot] !== false) me.protetto = 1;
                    bonus -= lato === 'mie' ? this.par.costoProtezione : 0.08;
                    return;
                }
                if (m.id === 'wideguard') { me.protettoDaDiffusi = true; bonus -= lato === 'mie' ? this.par.costoProtezione : 0.08; return; }
                if (m.id === 'fakeout' || m.id === 'firstimpression') {
                    const primoTurno = lato === 'mie' ? (me.ref.turnoEntrata === this.turno || me.ref.ultimaMossa == null) : true;
                    if (!primoTurno) { bonus -= 0.4; return; }
                }
                if (m.id === 'helpinghand') {
                    const altro = x.slot === 0 ? 1 : 0;
                    if (insiemi(lato)[altro] && insiemi(lato)[altro].hp > 0) aiuto[keyL(lato)][altro] = true;
                    return;
                }
                if (m.redirezione) { deviatore[keyL(lato)] = x.slot; return; }

                // ---- mosse di stato e di supporto ----
                if (m.categoria === 'Status') {
                    bonus += this._valoreStato(m, lato, x.slot, { campoMio, campoAvv, ctx, doppio, nemici, insiemi });
                    if (m.potenziamento) {
                        for (const k of Object.keys(m.potenziamento)) me.boost[k] = Math.max(-6, Math.min(6, (me.boost[k] || 0) + m.potenziamento[k]));
                    }
                    if (m.recupero) me.hp = Math.min(me.hpMax, me.hp + me.hpMax * 0.5);
                    return;
                }

                // ---- attacchi ----
                const avversari = nemici(lato);
                let bersagli = [];
                const tutti = ['allAdjacent', 'allAdjacentFoes'].includes(m.target);
                if (!doppio) bersagli = [{ lato: chiave(lato), slot: 0 }];
                else if (tutti) {
                    avversari.forEach((o, i) => { if (o && o.hp > 0) bersagli.push({ lato: chiave(lato), slot: i }); });
                    if (m.target === 'allAdjacent') {
                        const altro = x.slot === 0 ? 1 : 0;
                        const al = insiemi(lato)[altro];
                        if (al && al.hp > 0) bersagli.push({ lato: keyL(lato), slot: altro });
                    }
                } else if (m.target === 'self' || m.target === 'allySide' || m.target === 'foeSide') {
                    bersagli = [];
                } else {
                    // bersaglio scelto: per le mie azioni arriva con numerazione del simulatore, per l'avversario è lo slot mio
                    if (lato === 'mie') {
                        const t = a.bersaglio;
                        if (t == null) bersagli = [{ lato: 'avv', slot: 0 }];
                        else if (t > 0) bersagli = [{ lato: 'avv', slot: t - 1 }];
                        else bersagli = [{ lato: 'mie', slot: (-t) - 1 }];
                    } else bersagli = [{ lato: 'mie', slot: a.bersaglio }];
                    // redirezione
                    const latoDif = bersagli[0] && bersagli[0].lato;
                    if (latoDif && latoDif !== keyL(lato) && deviatore[latoDif] >= 0 && bersagli[0].slot !== deviatore[latoDif]) {
                        bersagli = [{ lato: latoDif, slot: deviatore[latoDif] }];
                    }
                }
                const vivi = bersagli.filter(b => { const t = insiemi(b.lato === 'mie' ? 'mie' : 'avv')[b.slot]; return t && t.hp > 0; });
                if (!vivi.length && bersagli.length) {
                    // il bersaglio è già caduto: in doppio la mossa passa all'altro avversario
                    const altro = avversari.findIndex((o, i) => o && o.hp > 0);
                    if (altro >= 0 && !tutti) vivi.push({ lato: chiave(lato), slot: altro });
                }
                const piu = vivi.length > 1;
                for (const b of vivi) {
                    const dif = (b.lato === 'mie' ? mie : avv)[b.slot];
                    if (!dif || dif.hp <= 0) continue;
                    if (dif.protetto) continue;   // la protezione ha parato l'attacco
                    if (dif.protettoDaDiffusi && tutti) continue;
                    const colpo = this._colpo(me, dif, m, ctx, piu, lato, aiuto, x.slot, schermiDi(b.lato));
                    const prima = dif.hp;
                    // un KO probabile (>= 50%) si considera avvenuto; altrimenti il bersaglio scende del danno atteso
                    const preso = colpo.pKO >= 0.5 ? prima : Math.min(prima - 1, colpo.atteso);
                    dif.hp = colpo.pKO >= 0.5 ? 0 : Math.max(1, prima - colpo.atteso);
                    // recupero/rinculo/drenaggio dell'attaccante
                    if (m.assorbe) me.hp = Math.min(me.hpMax, me.hp + preso * m.assorbe[0] / m.assorbe[1]);
                    if (m.rinculo && me.abilita !== 'rockhead' && me.abilita !== 'magicguard') me.hp = Math.max(0, me.hp - preso * m.rinculo[0] / m.rinculo[1]);
                    let puntiColpo = this._puntiDanno(b, dif, Math.min(prima, colpo.atteso), peso);
                    if (lato === 'mie' && b.lato === 'avv') puntiColpo *= 1 + (doppio ? this.par.aggressivitaDoppio : this.par.aggressivita);
                    valore += puntiColpo;
                    if (lato === 'mie' && b.lato === 'avv') valore += this._bonusEfficacia(colpo.mult, puntiColpo);
                    if (colpo.pKO > 0) {
                        const latoKo = b.lato;
                        const frazPrima = Math.min(1, prima / dif.hpMax);
                        valore += (latoKo === 'avv' ? 1 : -1) * colpo.pKO * (0.7 + 0.45 * frazPrima) * (peso[latoKo][b.slot] || 1);
                    }
                    if ((m.id === 'fakeout' || m.id === 'firstimpression') && dif.hp > 0) {
                        flinch[b.lato === 'mie' ? 'mie' : 'avv'][b.slot] = true;
                        bonus += (lato === 'mie' ? 1 : -1) * 0.3;   // un turno gratis per il compagno e niente mossa di apertura per chi è colpito
                    }
                    // effetti secondari
                    if (m.secondari && dif.hp > 0) {
                        const sec = m.secondari;
                        const p = (sec.chance || 0) / 100 * C.precisione(me, dif, m, ctx);
                        if (sec.status && !dif.stato && p) {
                            const val = { brn: 0.25, par: 0.25, slp: 0.5, psn: 0.15, tox: 0.2, frz: 0.5 }[sec.status] || 0.1;
                            bonus += (b.lato === 'avv' ? 1 : -1) * val * p;
                        }
                        if (sec.volatileStatus === 'flinch' && p) {
                            // tentenna solo chi deve ancora muovere, e solo con quella probabilità (se chi attacca agisce)
                            const ordineDopo = ordine.findIndex(o => o.x.lato === b.lato && o.x.slot === b.slot) > ordine.findIndex(o => o.x === x);
                            if (ordineDopo) { const kb = b.lato === 'mie' ? 'mie' : 'avv'; agisce[kb][b.slot] *= 1 - Math.min(1, p * f); }
                        }
                    }
                }
                // Steel Beam e simili: chi attacca perde metà dei propri HP
                if (m.rinculoMax && me.abilita !== 'magicguard') {
                    const perso = Math.min(me.hp, me.hpMax * m.rinculoMax);
                    me.hp -= perso;
                    valore += (lato === 'mie' ? -1 : 1) * 0.9 * (perso / me.hpMax) * (peso[lato][x.slot] || 1);
                    if (me.hp <= 0) valore += (lato === 'mie' ? -1 : 1) * 1.15 * (peso[lato][x.slot] || 1);
                }
                // le mosse con "perno" (U-turn, Volt Switch, Flip Turn): dopo il colpo chi le usa esce e al suo posto entra, senza
                // perdere un turno, chi regge meglio (è il cambio sicuro per eccellenza: gli attacchi che seguono colpiscono lui)
                if (m.perno && lato === 'mie' && me.hp > 0) {
                    const s = this._sostitutoPerno(x.slot, S, mie, avv, usatiDaPerno);
                    if (s) {
                        usatiDaPerno.add(s.indice);
                        const nuovo = this._clona(Object.assign(this.vista(s.m, s.info), { indice: s.indice, slot: x.slot, moves: s.p.moves }));
                        mie[x.slot] = nuovo;
                        peso.mie[x.slot] = this._pesoMon(nuovo);
                        nuovo.hp = Math.max(0, nuovo.hp - this._dannoTrappole(nuovo, campoMio, ctx));
                        bonus += this._abilitaIngresso(nuovo, ctx, avv) - 0.05;
                    } else bonus += 0.04;
                }
                // il potenziamento che accompagna l'attacco (Flame Charge...) è già nella mossa
                if (m.boostSelf && lato === 'mie') {
                    for (const k of Object.keys(m.boostSelf)) bonus += (m.boostSelf[k] > 0 ? 0.1 : -0.12) * Math.abs(m.boostSelf[k]);
                }
            };

            for (const { x } of ordine) {
                const lato = x.lato, a = x.a;
                const me = insiemi(lato)[x.slot];
                if (!me || me.hp <= 0) continue;
                if (flinch[keyL(lato)][x.slot]) continue;
                if (a.tipo !== 'mossa') continue;
                const m = a.mossa;
                if (!m) continue;
                const f = agisce[keyL(lato)][x.slot];
                if (f <= 0.02) continue;
                if (f >= 0.98) { eseguiAzione(x, lato, a, me, m, 1); continue; }
                // agisce solo con probabilità f: stato e valore sono la media tra "agisce" e "non agisce"
                const prima = { valore, bonus, mie: mie.map(v => v && v.hp), avv: avv.map(v => v && v.hp) };
                eseguiAzione(x, lato, a, me, m, f);
                valore = prima.valore + f * (valore - prima.valore);
                bonus = prima.bonus + f * (bonus - prima.bonus);
                mie.forEach((v, i) => { if (v && prima.mie[i] != null) v.hp = prima.mie[i] + f * (v.hp - prima.mie[i]); });
                avv.forEach((v, i) => { if (v && prima.avv[i] != null) v.hp = prima.avv[i] + f * (v.hp - prima.avv[i]); });
            }

            // 3) bilancio finale: i potenziamenti che restano a chi sopravvive (i danni sono già contati)
            for (const v of mie) if (v && v.hp > 0) bonus += this._valoreBoost(v);
            for (const v of avv) if (v && v.hp > 0) bonus -= this._valoreBoost(v);

            if (teraUsataQui) bonus -= 0.35;   // la Teracristal si usa una volta sola: va spesa quando conta

            // 4) la posizione in cui si resta: chi minaccia chi e chi muove prima al turno dopo. È ciò che dice se conviene
            // restare in un brutto scontro o fare un cambio sicuro verso chi regge e risponde
            if (S.matrice) bonus += this.par.pesoPosizione * this._posizione(mie, avv, S);

            return valore + bonus;
        }

        // Chi entra dopo un U-turn/Volt Switch/Flip Turn: il compagno in panchina che regge meglio gli attacchi che stanno per
        // arrivare e che risponde meglio (cambi sicuri). null se non c'è nessuno.
        _sostitutoPerno(slot, S, mie, avv, usati) {
            let migliore = null, mv = -1e9;
            const inCampo = new Set(mie.filter(v => v).map(v => v.indice));
            for (const s of S.squadra) {
                if (s.attivo || s.esausto || s.comanda || usati.has(s.indice) || inCampo.has(s.indice)) continue;
                let val = 0, n = 0;
                avv.forEach((o, j) => {
                    if (!o || o.hp <= 0) return;
                    const d = S.matrice.get(s.indice + '|' + j);
                    if (!d) return;
                    val += Math.min(1.2, d.dato) * 0.6 - Math.min(1.5, d.preso) - (d.prima ? 0 : 0.1);
                    n++;
                });
                val = (n ? val / n : 0) + 0.3 * (s.info.hp / Math.max(1, s.info.hpMax));
                if (val > mv) { mv = val; migliore = s; }
            }
            return migliore;
        }

        // Cosa fa un Pokémon mio quando entra in campo (la simulazione lo applica a `ctx` e ai potenziamenti degli avversari):
        // meteo e terreni, Intimidazione. Restituisce il valore strategico (il meteo giusto, il meteo di squadra tolto...).
        _abilitaIngresso(v, ctx, avv) {
            const ab = v.abilita;
            if (!ab) return 0;
            let valore = 0;
            const meteo = ABILITA_METEO[ab];
            if (meteo && ctx.meteo !== meteo) {
                const mio = this.strategia && this.strategia.meteo;
                // il meteo del piano rimesso in campo vale molto; togliere il proprio meteo per metterne un altro, il contrario
                if (mio === meteo) valore += this.par.bonusPianoMeteo;
                else if (mio && ctx.meteo === mio) valore -= this.par.bonusPianoMeteo;
                else valore += 0.12;
                ctx.meteo = meteo;
            }
            if (ABILITA_TERRENO[ab]) ctx.terreno = ABILITA_TERRENO[ab];
            if (ab === 'intimidate') {
                for (const o of avv) {
                    if (!o || o.hp <= 0) continue;
                    const possibili = o.abilitaPossibili || [];
                    const immune = o.abilita ? ABILITA_CONTRO_INTIMIDATE.has(o.abilita) : (possibili.length > 0 && possibili.every(a => ABILITA_CONTRO_INTIMIDATE.has(a)));
                    if (immune) continue;
                    o.boost.atk = Math.max(-6, (o.boost.atk || 0) - 1);
                    valore += 0.06;
                }
            }
            return valore;
        }

        // Minacce reciproche: per ogni mio Pokémon che potrebbe stare in campo (chi c'è e chi è in panchina) contro ognuno
        // degli avversari in campo: quanto fa (frazione dell'HP massimo) con la sua mossa migliore, quanto prende, chi muove prima
        _preparaMatrice(S) {
            const ctx = S.ctx;
            const campoMio = this.lati[this.lato].campo, campoLoro = this.lati[lato2(this.lato)].campo;
            const candidati = [];
            S.mie.forEach(v => { if (v) candidati.push(v); });
            for (const s of S.squadra) {
                if (s.attivo || s.esausto || s.comanda) continue;
                candidati.push(Object.assign(this.vista(s.m, s.info), { indice: s.indice, moves: s.p.moves }));
            }
            const M = new Map();
            for (const v of candidati) {
                const mosse = (v.moves || []).map(k => this.mossa(k)).filter(Boolean);
                S.avv.forEach((o, j) => {
                    if (!o) return;
                    M.set(v.indice + '|' + j, {
                        dato: this._miglioreSu(v, o, mosse, ctx),
                        preso: this._miglioreSu(o, v, this.mosseAvversario(o), ctx),
                        prima: C.confrontoVelocita(v, o, ctx, campoMio.tailwind > 0, campoLoro.tailwind > 0) > 0
                    });
                });
            }
            return M;
        }

        // Valore della posizione a fine turno per i miei Pokémon in campo (positivo: sto meglio io). Per ogni coppia:
        // quanti "avversari" mi toglie il mio colpo migliore al turno dopo contro quanti "me" toglie il loro, con chi muove prima
        _posizione(mie, avv, S) {
            let somma = 0, n = 0;
            for (const a of mie) {
                if (!a || a.hp <= 0) continue;
                const ha = Math.max(0.08, a.hp / a.hpMax);
                avv.forEach((b, j) => {
                    if (!b || b.hp <= 0) return;
                    const d = S.matrice.get(a.indice + '|' + j);
                    if (!d) return;
                    const hb = Math.max(0.08, b.hp / b.hpMax);
                    const tA = Math.min(1.5, d.dato / hb), tB = Math.min(1.5, d.preso / ha);
                    let adv = tA * (d.prima ? 1.2 : 1) - tB * (d.prima ? 1 : 1.2);
                    if (d.prima && tA >= 1) adv += 0.4;           // lo mette KO prima che muova
                    if (!d.prima && tB >= 1) adv -= 0.4;          // è lui a metterlo KO prima
                    somma += adv * this._pesoMon(a);
                    n++;
                });
            }
            if (n) return somma / n;
            if (!mie.some(a => a && a.hp > 0)) return -0.6;
            return 0.3;
        }

        // Un colpo: danno atteso (già pesato per la precisione) e probabilità di KO (tiro di danno x precisione)
        _colpo(att, dif, m, ctx, piu, lato, aiuto, slotAtt, schermiDif) {
            const k = lato === 'mie' ? 'mie' : 'avv';
            const d = C.danno(this.dex, att, dif, m, ctx, {
                bersagliMultipli: piu, aiuto: aiuto[k][slotAtt],
                schermi: { reflect: schermiDif.reflect > 0, lightscreen: schermiDif.lightscreen > 0, auroraveil: schermiDif.auroraveil > 0 }
            });
            const prec = C.precisione(att, dif, m, ctx);
            let max = d.max, min = d.min, medio = d.medio;
            // Focus Sash e simili: a HP pieno non si scende sotto 1
            if (dif.strumento === 'focussash' && dif.hp >= dif.hpMax) { max = Math.min(max, dif.hp - 1); min = Math.min(min, dif.hp - 1); medio = Math.min(medio, dif.hp - 1); }
            let pTiro = 0;
            if (max >= dif.hp) pTiro = min >= dif.hp ? 1 : max > min ? (max - dif.hp) / (max - min) : 1;
            return { atteso: medio * prec, pKO: pTiro * prec, medio, mult: d.mult };
        }

        // Quanto in più (o in meno) vale un colpo per la sua efficacia: la super efficace si preferisce a una neutra quasi pari,
        // la resistita si evita se c'è di meglio. `punti` sono i punti-danno del colpo.
        _bonusEfficacia(mult, punti) {
            if (!(mult > 0)) return 0;
            if (mult >= 4) return punti * this.par.bonusSE4;
            if (mult >= 2) return punti * this.par.bonusSE2;
            if (mult <= 0.25) return -punti * this.par.malusRes025;
            if (mult <= 0.5) return -punti * this.par.malusRes05;
            return 0;
        }

        // Punti per il danno inflitto (positivi se a subirlo è l'avversario, negativi se sono io)
        _puntiDanno(b, dif, preso, peso) {
            const p = peso[b.lato][b.slot] || 1;
            return (b.lato === 'avv' ? 1 : -1) * (preso / dif.hpMax) * 0.9 * p;
        }

        _dannoTrappole(v, campo, ctx) {
            let d = 0;
            if (campo.rocce) {
                const m = K.moltiplicatoreTipo(this.dex, 'Rock', v.tipi);
                d += v.hpMax * 0.125 * m;
            }
            if (campo.punte && C.aTerra(v)) d += v.hpMax * [0, 0.125, 1 / 6, 0.25][campo.punte];
            return d;
        }

        _applicaMega(v) {
            const it = v.strumento ? this.dex.items.get(v.strumento) : null;
            const mega = it && it.megaStone ? (typeof it.megaStone === 'string' ? it.megaStone : Object.values(it.megaStone)[0]) : null;
            if (!mega) return;
            const s = this.dex.species.get(mega);
            if (!s.exists) return;
            const prima = C.statStimate(v.basi, v.livello, this.gen);
            const dopo = C.statStimate({ hp: s.baseStats.hp, atk: s.baseStats.atk, def: s.baseStats.def, spa: s.baseStats.spa, spd: s.baseStats.spd, spe: s.baseStats.spe }, v.livello, this.gen);
            for (const k of STAT) v.stat[k] = Math.round(v.stat[k] * dopo[k] / Math.max(1, prima[k]));
            v.tipi = s.types.slice();
            v.tipiBase = s.types.slice();
            v.abilita = id(s.abilities['0']);
        }

        // Valore dei potenziamenti in corso di un Pokémon
        _valoreBoost(v) {
            let s = 0;
            const off = v.stat.atk >= v.stat.spa ? 'atk' : 'spa';
            s += (v.boost[off] || 0) * 0.14;
            s += (v.boost.spe || 0) * 0.08;
            s += ((v.boost.def || 0) + (v.boost.spd || 0)) * 0.05;
            return s * this._pesoMon(v);
        }

        // Valore di una mossa di stato (non danneggia)
        _valoreStato(m, lato, slot, E) {
            const { campoMio, campoAvv, ctx, doppio, nemici, insiemi } = E;
            const me = insiemi(lato)[slot];
            const avversari = nemici(lato).filter(o => o && o.hp > 0);
            const segno = lato === 'mie' ? 1 : -1;
            const mioCampo = lato === 'mie' ? campoMio : campoAvv;
            const loroCampo = lato === 'mie' ? campoAvv : campoMio;
            const mieiVivi = insiemi(lato).filter(v => v && v.hp > 0);
            let v = 0;

            if (m.potenziamento) {
                // utile se chi lo usa non rischia di essere messo KO subito e c'è margine per potenziarsi
                const pot = m.potenziamento;
                const off = me.stat.atk >= me.stat.spa ? 'atk' : 'spa';
                let guadagno = 0;
                for (const k of Object.keys(pot)) {
                    const attuale = me.boost[k] || 0;
                    const util = (k === off || k === 'spe') ? 0.2 : 0.1;
                    const residuo = Math.max(0, Math.min(pot[k], 6 - attuale));
                    guadagno += (pot[k] > 0 ? residuo : pot[k]) * util;
                }
                // è inutile potenziare l'attacco di un Pokémon che non attacca con quella statistica
                if (pot.atk && me.stat.atk < me.stat.spa * 0.8) guadagno *= 0.3;
                if (pot.spa && me.stat.spa < me.stat.atk * 0.8) guadagno *= 0.3;
                v += guadagno * this._pesoMon(me);
                return v * segno;
            }
            if (m.recupero) {
                const mancante = Math.max(0, 1 - me.hp / me.hpMax - (lato === 'mie' ? this.par.sogliaRecupero : 0));
                v += Math.min(0.5, mancante) * 0.9 * this._pesoMon(me);
                return v * segno;
            }
            if (m.stato) {
                const bersagli = avversari;
                let best = 0;
                for (const o of bersagli) {
                    if (o.stato) continue;
                    if (m.stato.immuni.some(t => (o.tipi || []).includes(t))) continue;
                    if (o.immuneMosse && o.immuneMosse.has(`${me.nome}|${m.id}`)) continue;      // già provata: non ha effetto su di lui
                    if (m.stato.polvere && (o.abilita === 'overcoat' || o.strumento === 'safetygoggles')) continue;
                    if (o.abilita === 'magicbounce' || o.abilita === 'goodasgold') continue;
                    const base = { par: 0.3, brn: 0.3, slp: 0.65, psn: 0.15, tox: 0.25 }[m.stato.stato] || 0.1;
                    let val = base;
                    if (m.stato.stato === 'brn') val *= o.stat.atk > o.stat.spa ? 1.4 : 0.4;
                    if (m.stato.stato === 'par') val *= (C.confrontoVelocita(o, me, ctx) > 0 ? 1.4 : 0.8);
                    const prec = m.precisione / 100;
                    val *= prec;
                    if (val > best) best = val;
                }
                // il bersaglio è scelto da chi usa la mossa; qui si prende il migliore
                v += best;
                return v * segno;
            }
            if (m.velocitaSquadra) {
                if (m.id === 'tailwind') {
                    if (mioCampo.tailwind > 0) return -0.3 * segno;
                    // raddoppia la velocità di squadra per 4 turni: vale per ogni sorpasso che prima non c'era,
                    // tanto più se chi sorpassa fa davvero male a chi supera (un turno solo non lo vedrebbe)
                    let sorpassi = 0, giaPiuVeloci = 0;
                    for (const x of mieiVivi) for (const o of avversari) {
                        const vm = C.velocitaEffettiva(x, ctx), vo = C.velocitaEffettiva(o, ctx);
                        if (vm < vo && vm * 2 > vo) sorpassi += 0.25 + 0.5 * Math.min(1, this._minaccia(x, o, ctx));
                        else if (vm >= vo) giaPiuVeloci++;
                    }
                    let util;
                    if (ctx.stanzaMagica) util = 0.1;
                    else if (sorpassi) util = Math.min(this.par.maxTailwind, 0.2 + this.par.scalaTailwind * sorpassi);
                    else if (giaPiuVeloci >= mieiVivi.length * avversari.length) util = 0.1;
                    else util = 0.25;
                    // è il piano del team: Tailwind è ciò per cui è stato fatto, si usa appena serve a superare qualcuno
                    if (lato === 'mie' && this.strategia && this.strategia.piano === 'tailwind' && !ctx.stanzaMagica && giaPiuVeloci < mieiVivi.length * avversari.length) util = Math.max(util, this.par.utilPianoTailwind);
                    mioCampo.tailwind = 4;
                    v += util * (mieiVivi.length >= 2 || !doppio ? 1 : 0.6);
                } else if (m.id === 'trickroom') {
                    const mieiMedia = mieiVivi.reduce((s, x) => s + C.velocitaEffettiva(x, ctx), 0) / Math.max(1, mieiVivi.length);
                    const loroMedia = avversari.reduce((s, x) => s + C.velocitaEffettiva(x, ctx), 0) / Math.max(1, avversari.length);
                    let conviene = ctx.stanzaMagica ? (mieiMedia > loroMedia) : (mieiMedia < loroMedia * 0.85);
                    // team costruito sulla Stanza Magica: conta la velocità di chi ne approfitta (anche in panchina), non solo chi è in campo
                    const strat = lato === 'mie' ? this.strategia : null;
                    let bonusPiano = 0;
                    if (strat && strat.piano === 'trickroom' && !ctx.stanzaMagica && this.squadraCorrente) {
                        const lenti = this.squadraCorrente.filter(s => !s.esausto && strat.lenti.includes(s.indice)).map(s => C.velocitaEffettiva(this.vista(s.m, s.info), ctx));
                        if (lenti.length) {
                            const lentiMedia = lenti.reduce((s, x) => s + x, 0) / lenti.length;
                            conviene = lentiMedia < loroMedia * 0.95;
                            if (conviene) bonusPiano = this.par.bonusPianoStanza;
                        }
                    }
                    v += conviene ? 0.7 + bonusPiano : -0.5;
                }
                return v * segno;
            }
            if (m.schermo) {
                const gia = mioCampo[m.id === 'auroraveil' ? 'auroraveil' : m.id];
                if (gia > 0) return -0.2 * segno;
                if (m.id === 'auroraveil' && this.meteo !== 'snow') return -0.3 * segno;
                const attaccanti = avversari.filter(o => (m.id === 'reflect' ? o.stat.atk >= o.stat.spa : o.stat.spa >= o.stat.atk)).length;
                v += 0.25 + 0.15 * attaccanti;
                return v * segno;
            }
            if (m.trappola) {
                const rimasti = (this.lati[lato === 'mie' ? lato2(this.lato) : this.lato].squadra.length || 6) - this.lati[lato === 'mie' ? lato2(this.lato) : this.lato].caduti;
                if (rimasti <= 2) return 0;
                const gia = { stealthrock: loroCampo.rocce, spikes: loroCampo.punte >= 3 ? 1 : 0, toxicspikes: loroCampo.tossine >= 2 ? 1 : 0, stickyweb: loroCampo.ragnatela }[m.id];
                if (gia) return -0.1 * segno;
                v += m.id === 'stealthrock' ? 0.42 : 0.28;
                return v * segno;
            }
            if (m.id === 'taunt') {
                const o = avversari[0];
                v += o ? 0.12 : 0;
                return v * segno;
            }
            if (m.id === 'leechseed') {
                v += 0.22;
                return v * segno;
            }
            return 0;
        }

        // =================================================
        // 6. SCELTA DI RISERVA
        // =================================================
        // Quando tutto il resto fallisce (scelta rifiutata più volte) si gioca qualcosa di valido
        rispostaDiRiserva(richiesta, errori) {
            const squadra = richiesta.side.pokemon;
            if (richiesta.teamPreview) {
                const n = richiesta.maxChosenTeamSize || squadra.length;
                return 'team ' + squadra.map((_, i) => i + 1).slice(0, n).join('');
            }
            const usati = new Set();
            if (richiesta.forceSwitch) {
                return richiesta.forceSwitch.map((deve, slot) => {
                    if (!deve) return 'pass';
                    const k = squadra.findIndex((p, i) => !p.active && !p.condition.endsWith(' fnt') && !usati.has(i));
                    if (k < 0) return 'pass';
                    usati.add(k);
                    return `switch ${k + 1}`;
                }).join(', ');
            }
            return richiesta.active.map((a, slot) => {
                const lui = squadra[slot];
                if (lui.condition.endsWith(' fnt') || lui.commanding) return 'pass';
                const mosse = (a.moves || []).map((m, j) => ({ m, j })).filter(x => !x.m.disabled && x.m.pp !== 0);
                if (!mosse.length) return 'move 1';
                const scelta = mosse[(errori + slot) % mosse.length];
                const t = scelta.m.target;
                const doppio = richiesta.active.length > 1;
                const bers = doppio && ['normal', 'any', 'adjacentFoe'].includes(t) ? ' 1' : (doppio && t === 'adjacentAlly' ? ` ${-(slot === 0 ? 2 : 1)}` : '');
                return `move ${scelta.j + 1}${bers}`;
            }).join(', ');
        }
    }

    function crea(opzioni) { return new Cerebro(opzioni); }

    return { crea, Cerebro, posizione, leggiHp, leggiDettagli };
});
