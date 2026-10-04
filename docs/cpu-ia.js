// =====================================================
// IA DELLA CPU
// Sceglie le mosse dell'avversario controllato dal computer. Non tira a caso: per ogni turno
//   1. legge il log pubblico (chi è in campo, HP, stati, potenziamenti, meteo, Tailwind, Camera Magica,
//      trappole, mosse già viste dell'avversario);
//   2. elenca le sue azioni (ogni mossa su ogni bersaglio, i cambi, la Teracristal);
//   3. prevede cosa farà l'avversario (la sua mossa migliore sul suo bersaglio migliore) e simula il turno
//      in ordine di priorità e velocità: danni attesi, KO, Protezione, Fake Out, Follow Me, Helping Hand,
//      cambi a inizio turno, mosse che colpiscono anche l'alleato, stati, potenziamenti, recupero, campo;
//   4. sceglie l'azione (nel doppio, la coppia di azioni dei due slot) con il valore più alto.
// Così "usa la mossa super efficace", "cambia se sta per essere messo KO e c'è chi regge meglio",
// "Terremoto solo se l'alleato non lo subisce (vola, levita, si protegge o esce)", "Protezione quando serve"
// vengono dalla stessa valutazione, non da regole sparse.
//
// Anteprima squadra: sceglie chi portare e chi mandare in campo in base agli scontri con la squadra avversaria.
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
            this.protezioniDiFila = [0, 0];
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
                posto: -1, megaDi: null
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
                    if (cmd !== 'replace') { m.boost = boostVuoti(); m.turnoEntrata = this.turno; m.ultimaMossa = null; m.posto = pos.slot; }
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
                    if (m) { const d = leggiDettagli(p[2]); m.specie = d.specie; }
                    break;
                }
                case '-mega': { const m = this._mon(p[1]); if (m) m.megaDi = p[2]; break; }
                case 'move': {
                    const m = this._mon(p[1]);
                    if (!m) break;
                    const mossa = id(p[2]);
                    m.mosseViste.add(mossa);
                    m.ultimaMossa = mossa;
                    if (K.PROTEZIONI.has(mossa)) m.protettoNelTurno = this.turno;
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
                    break;
                }
                case '-item': { const m = this._mon(p[1]); if (m && p[2]) m.strumento = id(p[2]); break; }
                case '-enditem': { const m = this._mon(p[1]); if (m) m.strumento = ''; break; }
                case '-terastallize': {
                    const m = this._mon(p[1]);
                    if (m) m.tera = p[2];
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
                peso: sp.weightkg, nfe: !!(sp.nfe), caduti: this.lati[m.lato].caduti, ref: m, basi
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
                    out.push({
                        id: 'stab-' + t, nome: `${t} STAB`, categoria: fisico ? 'Physical' : 'Special', tipo: t, potenza: 85, precisione: 100,
                        priorita: 0, target: 'normal', flags: {}, secondari: null, presunta: true, multi: null
                    });
                }
            }
            return out;
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

        // ---------- anteprima ----------
        anteprima(richiesta) {
            const squadra = this._squadra(richiesta);
            const quanti = richiesta.maxChosenTeamSize || squadra.length;
            const avversari = this.lati[lato2(this.lato)].squadra.map(nome => {
                const s = this.specie(nome);
                const lvl = this.lati[lato2(this.lato)].livelloSquadra || squadra[0].m.livello;
                const m = this._nuovoMon(lato2(this.lato), nome, s.name, lvl);
                return this.vista(m);
            });
            const ctx = this.contesto();
            const punti = squadra.map(s => {
                const v = this.vista(s.m, s.info);
                const mosse = s.p.moves.map(k => this.mossa(k)).filter(Boolean);
                let tot = 0;
                for (const o of avversari) {
                    const dato = this._miglioreSu(v, o, mosse, ctx);
                    const preso = this._miglioreSu(o, v, this.mosseAvversario(Object.assign({}, o, { ref: { mosseViste: new Set() } })), ctx);
                    const piuVeloce = C.confrontoVelocita(v, o, ctx) > 0 ? 0.25 : -0.1;
                    tot += Math.min(1.2, dato) - 0.85 * Math.min(1.2, preso) + piuVeloce;
                }
                return { s, v, mosse, punteggio: tot / Math.max(1, avversari.length) + 0.0001 * s.indice };
            });
            // chi portare: i migliori, ma si evita di avere troppi Pokémon con la stessa debolezza
            const scelti = [];
            const ordinati = punti.slice().sort((a, b) => b.punteggio - a.punteggio);
            for (const x of ordinati) {
                if (scelti.length >= quanti) break;
                scelti.push(x);
            }
            // chi in campo per primo: nel doppio la coppia con più sinergia
            const nCampo = this.tipo === 'doubles' ? 2 : 1;
            const sinergia = (a, b) => {
                let s = 0;
                const ha = (x, k) => x.mosse.some(m => m.id === k);
                if (ha(a, 'fakeout') || ha(b, 'fakeout')) s += 0.35;
                if ((ha(a, 'tailwind') && b.v.basi.spe >= 80) || (ha(b, 'tailwind') && a.v.basi.spe >= 80)) s += 0.3;
                if ((ha(a, 'trickroom') && b.v.basi.spe <= 60) || (ha(b, 'trickroom') && a.v.basi.spe <= 60)) s += 0.3;
                if (a.v.abilita === 'intimidate' || b.v.abilita === 'intimidate') s += 0.15;
                if (a.v.tipi.some(t => b.v.tipi.includes(t))) s -= 0.2;
                if (ha(a, 'followme') || ha(a, 'ragepowder') || ha(b, 'followme') || ha(b, 'ragepowder')) s += 0.2;
                return s;
            };
            let ordine;
            if (nCampo === 2 && scelti.length >= 2) {
                let migliore = null, mv = -99;
                for (let i = 0; i < scelti.length; i++) for (let j = i + 1; j < scelti.length; j++) {
                    const v = scelti[i].punteggio + scelti[j].punteggio + sinergia(scelti[i], scelti[j]);
                    if (v > mv) { mv = v; migliore = [scelti[i], scelti[j]]; }
                }
                const resto = scelti.filter(x => !migliore.includes(x));
                ordine = migliore.concat(resto);
            } else ordine = scelti;
            return 'team ' + ordine.map(x => x.s.indice).join('');
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
                    const val = this._valoreEntrata(v, nemici, ctx, s.p.moves.map(k => this.mossa(k)).filter(Boolean));
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
            this._ricorda(pick.scelta);
            if (this.debug) this.ultimaValutazione = migliori.slice(0, 5).map(x => ({ val: +x.val.toFixed(3), azioni: x.scelta.map(a => a.testo + (a.nome ? ` [${a.nome}]` : '')) }));
            return pick.scelta.map(a => a.testo).join(', ');
        }

        _ricorda(scelta) {
            scelta.forEach((a, slot) => {
                this.ultimeAzioni[slot] = a;
                if (a.tipo === 'mossa' && a.mossa && a.mossa.protezione) this.protezioniDiFila[slot]++;
                else this.protezioniDiFila[slot] = 0;
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
            scelta.forEach((a, i) => {
                if (a.tipo === 'mossa' && a.mossa && a.mossa.protezione) {
                    const consecutive = this.protezioniDiFila[i] || 0;
                    const p = consecutive === 0 ? 1 : Math.pow(1 / 3, consecutive);
                    incerte.push({ slot: i, p });
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
            let tot = 0;
            for (const sc of scenari) for (const e of esiti) tot += sc.peso * e.peso * this._simula(scelta, S, sc.azioni, e.riesce);
            return tot;
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
                    const nuovo = this._clona(Object.assign(this.vista(s.m, s.info), { indice: s.indice, slot: x.slot, moves: s.p.moves }));
                    mie[x.slot] = nuovo;   // chi esce perde i potenziamenti, chi entra parte pulito
                    peso.mie[x.slot] = this._pesoMon(nuovo);
                    inizio.mie[x.slot] = nuovo.hp / nuovo.hpMax;
                    // trappole all'ingresso
                    const dannoTrappole = this._dannoTrappole(nuovo, campoMio, ctx);
                    nuovo.hp = Math.max(0, nuovo.hp - dannoTrappole);
                    bonus -= 0.22;                                          // cambiare costa un turno
                    if (this.cambiRecenti[x.slot] === this.turno - 1) bonus -= 0.25;   // evita i va e vieni
                    if (this.ultimoUscito[x.slot] === s.nome) bonus -= 0.3;            // rientrare subito chi è appena uscito
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

            for (const { x } of ordine) {
                const lato = x.lato, a = x.a;
                const me = insiemi(lato)[x.slot];
                if (!me || me.hp <= 0) continue;
                if (flinch[keyL(lato)][x.slot]) continue;
                if (a.tipo !== 'mossa') continue;
                const m = a.mossa;
                if (!m) continue;

                // ---- protezioni ----
                if (m.protezione) {
                    // proteggersi non fa mai niente da solo: il valore sta nei danni evitati
                    if (lato !== 'mie' || (riesceProtezione || {})[x.slot] !== false) me.protetto = 1;
                    bonus -= 0.08;
                    continue;
                }
                if (m.id === 'wideguard') { me.protettoDaDiffusi = true; bonus -= 0.08; continue; }
                if (m.id === 'fakeout' || m.id === 'firstimpression') {
                    const primoTurno = lato === 'mie' ? (me.ref.turnoEntrata === this.turno || me.ref.ultimaMossa == null) : true;
                    if (!primoTurno) { bonus -= 0.4; continue; }
                }
                if (m.id === 'helpinghand') {
                    const altro = x.slot === 0 ? 1 : 0;
                    if (insiemi(lato)[altro] && insiemi(lato)[altro].hp > 0) aiuto[keyL(lato)][altro] = true;
                    continue;
                }
                if (m.redirezione) { deviatore[keyL(lato)] = x.slot; continue; }

                // ---- mosse di stato e di supporto ----
                if (m.categoria === 'Status') {
                    bonus += this._valoreStato(m, lato, x.slot, { campoMio, campoAvv, ctx, doppio, nemici, insiemi });
                    if (m.potenziamento) {
                        for (const k of Object.keys(m.potenziamento)) me.boost[k] = Math.max(-6, Math.min(6, (me.boost[k] || 0) + m.potenziamento[k]));
                    }
                    if (m.recupero) me.hp = Math.min(me.hpMax, me.hp + me.hpMax * 0.5);
                    continue;
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
                    valore += this._puntiDanno(b, dif, Math.min(prima, colpo.atteso), peso);
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
                            const ordineDopo = ordine.findIndex(o => o.x.lato === b.lato && o.x.slot === b.slot) > ordine.findIndex(o => o.x === x);
                            if (ordineDopo) flinch[b.lato === 'mie' ? 'mie' : 'avv'][b.slot] = flinch[b.lato === 'mie' ? 'mie' : 'avv'][b.slot] || (p >= 0.3);
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
                // le mosse con "perno" (U-turn): piccolo bonus, un cambio gratuito
                if (m.perno && lato === 'mie') bonus += 0.12;
                // il potenziamento che accompagna l'attacco (Flame Charge...) è già nella mossa
                if (m.boostSelf && lato === 'mie') {
                    for (const k of Object.keys(m.boostSelf)) bonus += (m.boostSelf[k] > 0 ? 0.1 : -0.12) * Math.abs(m.boostSelf[k]);
                }
            }

            // 3) bilancio finale: i potenziamenti che restano a chi sopravvive (i danni sono già contati)
            for (const v of mie) if (v && v.hp > 0) bonus += this._valoreBoost(v);
            for (const v of avv) if (v && v.hp > 0) bonus -= this._valoreBoost(v);

            if (teraUsataQui) bonus -= 0.35;   // la Teracristal si usa una volta sola: va spesa quando conta

            return valore + bonus;
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
            return { atteso: medio * prec, pKO: pTiro * prec, medio };
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
                const mancante = 1 - me.hp / me.hpMax;
                v += Math.min(0.5, mancante) * 0.9 * this._pesoMon(me);
                return v * segno;
            }
            if (m.stato) {
                const bersagli = avversari;
                let best = 0;
                for (const o of bersagli) {
                    if (o.stato) continue;
                    if (m.stato.immuni.some(t => (o.tipi || []).includes(t))) continue;
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
                    else if (sorpassi) util = Math.min(1.3, 0.2 + 0.55 * sorpassi);
                    else if (giaPiuVeloci >= mieiVivi.length * avversari.length) util = 0.1;
                    else util = 0.25;
                    mioCampo.tailwind = 4;
                    v += util * (mieiVivi.length >= 2 || !doppio ? 1 : 0.6);
                } else if (m.id === 'trickroom') {
                    const mieiMedia = mieiVivi.reduce((s, x) => s + C.velocitaEffettiva(x, ctx), 0) / Math.max(1, mieiVivi.length);
                    const loroMedia = avversari.reduce((s, x) => s + C.velocitaEffettiva(x, ctx), 0) / Math.max(1, avversari.length);
                    const conviene = ctx.stanzaMagica ? (mieiMedia > loroMedia) : (mieiMedia < loroMedia * 0.85);
                    v += conviene ? 0.7 : -0.5;
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
