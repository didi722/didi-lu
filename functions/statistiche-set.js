// =====================================================
// STATISTICHE DI UN SET — Poké-Tournament
//
// analizzaSet() legge il log PUBBLICO di un set (le stesse righe che finiscono
// nel replay) e ne ricava i numeri che servono alla pagina delle statistiche:
// quanti Pokémon sono stati mandati KO, da chi, chi è rimasto per ultimo,
// chi era titolare...
//
// Parte solo dal log, quindi dà lo stesso risultato a partire da:
//   - il log salvato da partita.js (Cloud Functions, set giocati sul sito);
//   - il log dentro un replay HTML di Showdown (in futuro, replay caricati a mano).
//
// Funziona sia nelle Cloud Functions (require) sia nel browser (window.StatisticheSet).
// Nessuna dipendenza.
//
// Risultato (solo valori semplici: niente undefined, Firebase non li accetta):
//   {
//     v: 3,
//     turni: 9,                    // ultimo turno
//     vincitore: 'p1' | 'p2' | '', // '' = pareggio o log incompleto
//     p1: {
//       nome: 'Didi',
//       portati: 4,                // Pokémon portati (4 su 6 nei formati con team preview)
//       svenuti: 2,                // Pokémon di questo lato rimasti KO a fine set
//       azioni: {                  // cosa ha scelto di fare, turno per turno (serve alla personalità dell'allenatore)
//         decisioni: 31,           // mosse scelte + cambi volontari
//         mosse: 28, cambi: 3,     // i cambi sono quelli scelti a inizio turno: non i Pokémon KO sostituiti, non U-turn né Roar
//         attacco: 19, protezione: 3, recupero: 1, potenziamento: 2, campo: 1, supporto: 0, disturbo: 2, altro: 0   // somma = mosse
//       },
//       pokemon: [{
//         specie: 'Calyrex-Shadow',// come scritta nel team preview
//         nome: '',                // soprannome, solo se diverso dalla specie
//         portato: true,           // sceso in campo (o dichiarato portato)
//         sceso: true,             // è sceso davvero in campo (portato = anche solo scelto prima del set)
//         titolare: true,          // tra i primi a scendere in campo
//         koFatti: 2,              // avversari mandati KO da lui (diretti + indiretti)
//         koDiretti: 1,            // ...di cui con una mossa
//         svenuto: true,           // è KO a fine set
//         turnoKo: 7,              // turno in cui è andato KO (0 = no)
//         ultimo: false            // è stato l'unico rimasto della sua squadra
//       }, ...]
//     },
//     p2: { ... }
//   }
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./azioni-mosse'));
    else radice.StatisticheSet = fabbrica(radice.AzioniMosse);
})(typeof self !== 'undefined' ? self : this, function (AzioniMosse) {
    'use strict';

    const VERSIONE = 3;      // 2: aggiunto "sceso" (chi è entrato davvero in campo); 3: aggiunte le "azioni" di ogni lato

    const idDi = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');
    // "move: Stealth Rock" -> "stealthrock"
    const idEffetto = t => idDi(String(t || '').replace(/^(move|ability|item|pokemon)\s*:\s*/i, ''));
    // "Urshifu-Rapid-Strike" -> "urshifu" (per riconoscere le forme)
    const baseDi = specie => idDi(String(specie || '').split('-')[0]);

    const LATI = ['p1', 'p2'];

    // Le scelte di un lato: quante mosse di ogni tipo (azioni-mosse.js) e quanti cambi volontari
    const nuoveAzioni = () => ({ mosse: 0, cambi: 0, attacco: 0, protezione: 0, recupero: 0, potenziamento: 0, campo: 0, supporto: 0, disturbo: 0, altro: 0 });

    // "p1a: Garchomp" | "p1: Garchomp" | "p1a" -> { lato, pos, nick }
    function leggiIdent(ident) {
        const m = /^(p[1-4])([a-d])?(?::\s?(.*))?$/.exec(String(ident || '').trim());
        if (!m) return null;
        return { lato: m[1], pos: m[2] ? m[1] + m[2] : '', nick: m[3] == null ? '' : m[3] };
    }

    const campoDi = (parti, prefisso) => {
        const c = parti.find(x => x.startsWith(prefisso));
        return c ? c.slice(prefisso.length) : '';
    };

    // Come nomi-unici.js battezza un Pokémon senza soprannome: la specie ("Garchomp"), o la forma davanti alla specie base ("Shadow
    // Calyrex"); un secondo uguale prende un numero ("Garchomp 2"). Restituisce i nomi possibili senza il numero.
    function radiciDiNome(specie) {
        const parti = String(specie || '').split('-');
        const radici = [idDi(specie), idDi(parti[0])];
        if (parti.length > 1) radici.push(idDi(parti.slice(1).join(' ') + ' ' + parti[0]));
        return radici;
    }

    function nuovaEntry(lato, specie, extra) {
        return {
            lato, specie, id: idDi(specie), base: baseDi(specie), nome: '', nomeDichiarato: '',
            extra: !!extra,          // non c'era nel team preview (es. Illusion, formati senza preview)
            apparso: false, apparizioni: 0, portato: false, titolare: false,
            koFatti: 0, koDiretti: 0, svenuto: false, turnoKo: 0, ultimo: false,
            snap: { koFatti: 0, koDiretti: 0 }
        };
    }

    /**
     * @param {string|string[]} log   righe del log pubblico del set
     * @param {object} [opzioni]
     * @param {{p1?: Array<string|{specie: string, nome: string}>, p2?: Array}} [opzioni.portati]  specie dei Pokémon portati (o
     *        { specie, nome } col soprannome), se il server li conosce già (altrimenti valgono quelli scesi in campo)
     * @param {{p1?: string[], p2?: string[]}} [opzioni.nomi]  i soprannomi dei Pokémon del team nell'ordine del team (come
     *        nel team preview: nomi-unici.js li rende tutti diversi, "Garchomp" e "Garchomp 2"). Con due Pokémon della stessa
     *        specie servono a sapere QUALE dei due è sceso in campo (il log dice solo "p1a: Garchomp 2|Garchomp")
     * @param {boolean} [opzioni.debug]  aggiunge al risultato l'elenco dei KO con la causa (per i test)
     */
    function analizzaSet(log, opzioni = {}) {
        const righe = Array.isArray(log) ? log : String(log || '').split('\n');

        const S = {
            nomi: { p1: '', p2: '' },
            lati: { p1: { entries: [], porNick: new Map(), dim: 0 }, p2: { entries: [], porNick: new Map(), dim: 0 } },
            attivo: {},                 // 'p1a' -> entry in campo in quella posizione
            turno: 0, iniziata: false,
            fase: '',                   // dentro un turno: 'scelte' (i cambi scelti), 'mosse', 'fine' (dopo |upkeep|: i sostituti dei KO)
            azioni: { p1: nuoveAzioni(), p2: nuoveAzioni() },
            vincitoreNome: '', pareggio: false,
            // attribuzione dei KO
            ultimoMover: null,          // chi ha usato l'ultima mossa
            ultimoBersaglio: null,      // ...e chi l'ha subita
            attivazioneAbilita: null,   // chi ha appena attivato un'abilità (riga precedente)
            appenaEntrato: false,       // l'ultima cosa successa è un ingresso in campo (trappole d'ingresso)
            statoDa: new Map(),         // entry -> chi le ha dato veleno/scottatura
            latoDa: { p1: {}, p2: {} }, // condizioni di lato (Stealth Rock, Spikes...) -> chi le ha create
            meteoDa: null,
            volatileDa: new Map(),      // entry -> { effetto: chi lo ha causato } (Curse, Salt Cure, Fire Spin...)
            futuroDa: {},               // 'p2a' -> chi ha usato Future Sight / Doom Desire su quella posizione
            fonteDiretta: null,         // Future Sight che sta per colpire
            perish0: new Set(),         // entry a cui scade Perish Song
            perishDa: null,
            destinyBond: null,          // entry che ha appena attivato Destiny Bond
            koPendente: new Map(),      // entry -> { fonte, diretto } (danno letale visto, in attesa di |faint|)
            eventiKo: []                // solo con opzioni.debug
        };

        const entryDa = (ident) => {
            const id = leggiIdent(ident);
            if (!id || !S.lati[id.lato]) return null;
            if (id.pos && S.attivo[id.pos]) return S.attivo[id.pos];
            return S.lati[id.lato].porNick.get(id.nick) || null;
        };

        const trovaOCrea = (lato, specie, nick) => {
            const L = S.lati[lato];
            let e = L.porNick.get(nick);
            if (e && e.base !== baseDi(specie)) e = null;          // stesso soprannome ma un altro Pokémon
            // Con due Pokémon della stessa specie il log non dice quale dei due entra: lo dice il soprannome.
            // 1) quelli dichiarati dal server (nell'ordine del team); 2) altrimenti il numero che nomi-unici.js dà al secondo, al terzo...
            if (!e && nick) e = L.entries.find(x => !x.apparso && !x.extra && x.nomeDichiarato === idDi(nick) && (x.id === idDi(specie) || x.base === baseDi(specie))) || null;
            if (!e && nick) {
                const m = /^(.*\S)\s+(\d+)$/.exec(nick);
                if (m && radiciDiNome(specie).includes(idDi(m[1]))) {
                    const stessi = L.entries.filter(x => !x.extra && x.id === idDi(specie));
                    const candidato = stessi[parseInt(m[2], 10) - 1];
                    if (candidato && !candidato.apparso) e = candidato;
                }
            }
            if (!e && nick && radiciDiNome(specie).includes(idDi(nick))) {       // il primo dei doppioni ha il nome senza numero
                const primo = L.entries.find(x => !x.extra && x.id === idDi(specie));
                if (primo && !primo.apparso && L.entries.filter(x => !x.extra && x.id === idDi(specie)).length > 1) e = primo;
            }
            if (!e) e = L.entries.find(x => !x.apparso && x.id === idDi(specie))
                || L.entries.find(x => !x.apparso && x.base === baseDi(specie));
            if (!e) { e = nuovaEntry(lato, specie, true); L.entries.push(e); }
            // Showdown chiama "Weezing" un Weezing-Galar senza soprannome: non è un soprannome
            if (nick && ![e.id, e.base, idDi(specie), baseDi(specie)].includes(idDi(nick))) e.nome = nick;
            if (nick) L.porNick.set(nick, e);
            return e;
        };

        // Chi è rimasto per ultimo: quando alla squadra resta un solo Pokémon vivo
        const aggiornaUltimo = (lato) => {
            const L = S.lati[lato];
            if (!L.dim || L.entries.some(e => e.ultimo)) return;
            const vivi = L.dim - L.entries.filter(e => e.svenuto).length;
            if (vivi !== 1) return;
            const incampo = L.entries.filter(e => e.apparso && !e.svenuto);
            if (incampo.length === 1) incampo[0].ultimo = true;   // se è ancora in panchina lo si saprà quando entra
        };

        const registraKo = (e, fonte, diretto, causa) => {
            if (!e || e.svenuto) return;
            if (opzioni.debug) S.eventiKo.push({ turno: S.turno, specie: e.specie, lato: e.lato, da: fonte ? fonte.specie : '', diretto, causa });
            e.svenuto = true;
            e.turnoKo = S.turno;
            if (fonte && fonte !== e && fonte.lato !== e.lato) {
                fonte.koFatti++;
                if (diretto) fonte.koDiretti++;
            }
            aggiornaUltimo(e.lato);
        };

        for (const riga of righe) {
            if (typeof riga !== 'string' || riga.charCodeAt(0) !== 124) continue;   // solo righe che iniziano con "|"
            const parti = riga.split('|');
            const tipo = parti[1];
            const attivazione = S.attivazioneAbilita;     // vale solo per la riga subito dopo
            S.attivazioneAbilita = null;
            try {
                switch (tipo) {
                    case 'player':
                        if (S.nomi[parti[2]] !== undefined && parti[3]) S.nomi[parti[2]] = parti[3];
                        break;

                    case 'poke': {      // |poke|p1|Golem, L86, F|
                        const L = S.lati[parti[2]];
                        if (!L) break;
                        const specie = String(parti[3] || '').split(',')[0].trim();
                        if (specie) {
                            const nuova = nuovaEntry(parti[2], specie, false);
                            const dichiarati = (opzioni.nomi && opzioni.nomi[parti[2]]) || [];
                            nuova.nomeDichiarato = idDi(dichiarati[L.entries.filter(x => !x.extra).length]);
                            L.entries.push(nuova);
                        }
                        break;
                    }

                    case 'teamsize':    // |teamsize|p1|4  (dopo la scelta: quanti se ne portano)
                        if (S.lati[parti[2]]) S.lati[parti[2]].dim = parseInt(parti[3], 10) || 0;
                        break;

                    case 'start':
                        S.iniziata = true;
                        break;

                    case 'turn':
                        S.turno = parseInt(parti[2], 10) || S.turno;
                        S.fase = 'scelte';
                        S.appenaEntrato = false;
                        S.fonteDiretta = null;
                        S.destinyBond = null;
                        break;

                    case 'upkeep':
                        S.fase = 'fine';
                        break;

                    case 'switch': case 'drag': {   // |switch|p1a: Nick|Specie, L50, M|100/100
                        const id = leggiIdent(parti[2]);
                        if (!id || !S.lati[id.lato] || !id.pos) break;
                        // un cambio scelto: a inizio turno, prima di qualunque mossa (dopo una mossa è U-turn o simili, dopo |upkeep| un KO sostituito)
                        if (tipo === 'switch' && S.fase === 'scelte' && S.turno >= 1) S.azioni[id.lato].cambi++;
                        const specie = String(parti[3] || '').split(',')[0].trim();
                        const e = trovaOCrea(id.lato, specie, id.nick);
                        S.attivo[id.pos] = e;
                        if (!e.apparso) {
                            e.apparso = true;
                            e.portato = true;
                            if (S.iniziata && S.turno === 0) e.titolare = true;
                        }
                        e.apparizioni++;
                        e.snap = { koFatti: e.koFatti, koDiretti: e.koDiretti };
                        S.appenaEntrato = true;
                        aggiornaUltimo(id.lato);    // se era l'ultimo vivo ma ancora in panchina
                        break;
                    }

                    case 'replace': {   // Illusion svelata: |replace|p1a: Zoroark|Zoroark, L50, M
                        const id = leggiIdent(parti[2]);
                        if (!id || !S.lati[id.lato] || !id.pos) break;
                        const finto = S.attivo[id.pos];
                        const specie = String(parti[3] || '').split(',')[0].trim();
                        const vero = trovaOCrea(id.lato, specie, id.nick);
                        let titolareDelFinto = false;
                        if (finto && finto !== vero) {
                            // quello che il "finto" ha fatto da quando era in campo lo ha fatto il vero
                            vero.koFatti += finto.koFatti - finto.snap.koFatti;
                            vero.koDiretti += finto.koDiretti - finto.snap.koDiretti;
                            finto.koFatti = finto.snap.koFatti;
                            finto.koDiretti = finto.snap.koDiretti;
                            if (S.koPendente.has(finto)) {      // il danno letale è stato preso dal vero
                                S.koPendente.set(vero, S.koPendente.get(finto));
                                S.koPendente.delete(finto);
                            }
                            if (--finto.apparizioni <= 0) {
                                titolareDelFinto = finto.titolare;     // era lui a stare al posto del finto
                                finto.apparso = false; finto.portato = false; finto.titolare = false;
                                if (finto.extra) S.lati[id.lato].entries.splice(S.lati[id.lato].entries.indexOf(finto), 1);
                            }
                        }
                        if (!vero.apparso) {
                            vero.apparso = true; vero.portato = true;
                            if (S.iniziata && S.turno === 0) vero.titolare = true;
                        }
                        if (titolareDelFinto) vero.titolare = true;
                        vero.apparizioni++;
                        vero.snap = { koFatti: vero.koFatti, koDiretti: vero.koDiretti };
                        S.attivo[id.pos] = vero;
                        break;
                    }

                    case 'swap': {      // Ally Switch: |swap|p1a: X|1|...
                        const id = leggiIdent(parti[2]);
                        const verso = id && id.lato + 'abcd'[parseInt(parti[3], 10)];
                        if (id && id.pos && verso) [S.attivo[id.pos], S.attivo[verso]] = [S.attivo[verso], S.attivo[id.pos]];
                        break;
                    }

                    case 'move': {      // |move|p1a: Golem|Rock Slide|p2b: Braviary|...
                        S.fase = 'mosse';
                        { // una mossa scelta (non quelle che partono da sole: [from] = mossa bloccata, Sleep Talk, Dancer, Magic Bounce...)
                            const chi = leggiIdent(parti[2]);
                            if (chi && S.azioni[chi.lato] && !parti.some(x => x.startsWith('[from]'))) {
                                const a = S.azioni[chi.lato];
                                a.mosse++;
                                a[AzioniMosse ? AzioniMosse.classeDi(parti[3]) : 'attacco']++;
                            }
                        }
                        const mover = entryDa(parti[2]);
                        S.ultimoMover = mover;
                        S.ultimoBersaglio = entryDa(parti[4]);
                        S.appenaEntrato = false;
                        S.fonteDiretta = null;
                        const mossa = idDi(parti[3]);
                        if (mossa === 'perishsong') S.perishDa = mover;
                        if ((mossa === 'futuresight' || mossa === 'doomdesire') && mover) {
                            const bersaglio = leggiIdent(parti[4]);
                            if (bersaglio && bersaglio.pos) S.futuroDa[bersaglio.pos] = mover;
                        }
                        break;
                    }

                    case '-status': {   // |-status|p2a: X|brn[|[from] ...|[of] ...]
                        const t = entryDa(parti[2]);
                        if (!t) break;
                        const da = campoDi(parti, '[from] '), di = campoDi(parti, '[of] ');
                        let fonte = null;
                        if (di) fonte = entryDa(di);
                        else if (!da) {
                            // appena entrato = Toxic Spikes; altrimenti la mossa appena usata.
                            // Se lo stato lo prende chi ha attaccato (Beak Blast...) è merito di chi l'ha subita.
                            if (S.appenaEntrato) fonte = S.latoDa[t.lato].toxicspikes || null;
                            else fonte = t === S.ultimoMover ? S.ultimoBersaglio : S.ultimoMover;
                        }
                        S.statoDa.set(t, fonte);
                        break;
                    }

                    case '-curestatus':
                        { const t = entryDa(parti[2]); if (t) S.statoDa.delete(t); }
                        break;

                    case '-sidestart': {   // |-sidestart|p2: Lu|move: Stealth Rock
                        const id = leggiIdent(parti[2]);
                        if (!id || !S.latoDa[id.lato]) break;
                        const di = campoDi(parti, '[of] ');
                        // Toxic Debris: la trappola la mette l'abilità di chi è stato colpito, non chi ha attaccato
                        S.latoDa[id.lato][idEffetto(parti[3])] = di ? entryDa(di) : (attivazione || S.ultimoMover);
                        break;
                    }

                    case '-sideend': {
                        const id = leggiIdent(parti[2]);
                        if (id && S.latoDa[id.lato]) delete S.latoDa[id.lato][idEffetto(parti[3])];
                        break;
                    }

                    case '-weather': {
                        const w = idDi(parti[2]);
                        if (w === 'none') { S.meteoDa = null; break; }
                        if (parti.includes('[upkeep]')) break;
                        const di = campoDi(parti, '[of] ');
                        S.meteoDa = di ? entryDa(di) : S.ultimoMover;
                        break;
                    }

                    case '-start': case '-activate': {
                        const t = entryDa(parti[2]);
                        const effetto = idEffetto(parti[3]);
                        if (!t || !effetto) break;
                        if (tipo === '-activate' && /^ability\s*:/i.test(parti[3] || '')) S.attivazioneAbilita = t;
                        if (effetto === 'perish0') { S.perish0.add(t); break; }
                        if (effetto === 'destinybond' && tipo === '-activate') { S.destinyBond = t; break; }
                        const di = campoDi(parti, '[of] ');
                        let fonte = null;
                        if (di) fonte = entryDa(di);
                        else if (tipo === '-start') fonte = S.ultimoMover;
                        if (!fonte) break;
                        if (!S.volatileDa.has(t)) S.volatileDa.set(t, {});
                        S.volatileDa.get(t)[effetto] = fonte;
                        break;
                    }

                    case '-end': {      // Future Sight / Doom Desire stanno per colpire
                        const effetto = idEffetto(parti[3]);
                        if (effetto === 'futuresight' || effetto === 'doomdesire') {
                            const id = leggiIdent(parti[2]);
                            S.fonteDiretta = (id && S.futuroDa[id.pos]) || null;
                        }
                        break;
                    }

                    case '-heal': {     // Revival Blessing: |-heal|p1: Shedinja|100/100|[from] move: Revival Blessing
                        if (idEffetto(campoDi(parti, '[from] ')) !== 'revivalblessing') break;
                        const t = entryDa(parti[2]);
                        if (t && t.svenuto) { t.svenuto = false; t.turnoKo = 0; }
                        break;
                    }

                    case '-damage': {   // |-damage|p2a: X|0 fnt[|[from] ...|[of] ...]
                        if (!/\bfnt\b/.test(parti[3] || '')) break;
                        const t = entryDa(parti[2]);
                        if (!t) break;
                        const da = campoDi(parti, '[from] '), di = campoDi(parti, '[of] ');
                        let fonte = null, diretto = false;
                        if (!da) {
                            fonte = S.fonteDiretta || S.ultimoMover;     // danno di una mossa
                            diretto = true;
                            S.fonteDiretta = null;
                        } else if (di) {
                            fonte = entryDa(di);                         // Rocky Helmet, Rough Skin, Leech Seed...
                        } else {
                            const eff = idEffetto(da);
                            if (eff === 'psn' || eff === 'tox' || eff === 'brn') fonte = S.statoDa.get(t) || null;
                            else if (S.latoDa[t.lato][eff]) fonte = S.latoDa[t.lato][eff];          // Stealth Rock, Spikes...
                            else if (eff === 'sandstorm' || eff === 'hail') fonte = S.meteoDa;
                            else fonte = (S.volatileDa.get(t) || {})[eff] || null;                  // Curse, Salt Cure, Fire Spin...
                        }
                        if (fonte && (fonte === t || fonte.lato === t.lato)) fonte = null;         // contraccolpo, fuoco amico
                        S.koPendente.set(t, { fonte, diretto, causa: da || 'mossa' });
                        break;
                    }

                    case 'faint': {
                        const e = entryDa(parti[2]);
                        if (!e) break;
                        let info = S.koPendente.get(e);
                        S.koPendente.delete(e);
                        if (!info) {
                            // KO senza danno: Destiny Bond, Perish Song, oppure l'ha causato lui stesso (Explosion, Memento...)
                            let fonte = null;
                            if (S.destinyBond && S.destinyBond.lato !== e.lato) { fonte = S.destinyBond; S.destinyBond = null; }
                            else if (S.perish0.has(e) && S.perishDa && S.perishDa.lato !== e.lato) fonte = S.perishDa;
                            info = { fonte, diretto: false, causa: fonte ? 'Destiny Bond / Perish Song' : 'senza danno' };
                        }
                        registraKo(e, info.fonte, info.diretto, info.causa);
                        break;
                    }

                    case 'win':
                        S.vincitoreNome = parti[2] || '';
                        break;

                    case 'tie':
                        S.pareggio = true;
                        break;

                    default:
                }
            } catch (errore) {
                // una riga strana non deve far perdere tutto il resto
            }
        }

        // Specie dichiarate "portate" dal server (anche se non sono mai scese in campo)
        const dichiarati = opzioni.portati || {};
        for (const lato of LATI) {
            const L = S.lati[lato];
            for (const voce of dichiarati[lato] || []) {
                // una specie ("Garchomp") o { specie, nome } (col soprannome, per distinguere due Pokémon della stessa specie)
                const specie = typeof voce === 'string' ? voce : voce && voce.specie;
                const nome = typeof voce === 'string' || !voce ? '' : idDi(voce.nome);
                // col soprannome si sa QUALE dei due (anche se è già segnato: non si passa al fratello con la stessa specie)
                const esatto = nome && L.entries.find(x => !x.extra && x.nomeDichiarato === nome && (x.id === idDi(specie) || x.base === baseDi(specie)));
                const e = esatto
                    || L.entries.find(x => !x.portato && x.id === idDi(specie))
                    || L.entries.find(x => !x.portato && x.base === baseDi(specie));
                if (e) e.portato = true;
            }
            if (!L.dim) L.dim = L.entries.filter(e => e.portato).length;

            // L'unico superstite può essere ancora in panchina (la partita è finita prima che entrasse):
            // lo si riconosce solo se si sa quali erano i portati
            if (!L.entries.some(e => e.ultimo) && L.dim - L.entries.filter(e => e.svenuto).length === 1) {
                const rimasti = L.entries.filter(e => e.portato && !e.svenuto);
                if (rimasti.length === 1) rimasti[0].ultimo = true;
            }
        }

        const vincitore = S.pareggio ? ''
            : S.vincitoreNome && S.vincitoreNome === S.nomi.p1 ? 'p1'
            : S.vincitoreNome && S.vincitoreNome === S.nomi.p2 ? 'p2' : '';

        const lato = l => {
            const L = S.lati[l];
            return {
                nome: S.nomi[l],
                portati: L.dim,
                svenuti: L.entries.filter(e => e.svenuto).length,
                azioni: { decisioni: S.azioni[l].mosse + S.azioni[l].cambi, ...S.azioni[l] },
                pokemon: L.entries.map(e => ({
                    specie: e.specie,
                    nome: e.nome,
                    portato: e.portato,
                    sceso: e.apparso,
                    titolare: e.titolare,
                    koFatti: e.koFatti,
                    koDiretti: e.koDiretti,
                    svenuto: e.svenuto,
                    turnoKo: e.turnoKo,
                    ultimo: e.ultimo
                }))
            };
        };

        const risultato = { v: VERSIONE, turni: S.turno, vincitore, p1: lato('p1'), p2: lato('p2') };
        if (opzioni.debug) risultato.debug = S.eventiKo;
        return risultato;
    }

    return { analizzaSet, VERSIONE };
});
