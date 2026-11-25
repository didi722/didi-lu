// =====================================================
// LE PERSONALITÀ DELLA CPU — Poké-Tournament
//
// Una CPU che gioca sempre allo stesso modo diventa prevedibile. Ogni personalità è uno stile: sposta le manopole del cervello (cpu-ia.js: quanto costa
// proteggersi o cambiare, quanto vale uno stato, il controllo della velocità, il campo...) e, quando la CPU compone da sola il suo team (team-cpu.js), quali
// piani e quali ruoli preferisce (più perni, più stati, più Vento in Poppa...). Non cambia le regole né toglie il calcolo: è un modo di dare i pesi.
//
//   equilibrata  quella di sempre: pesa attacco, protezione e cambi come chiede la situazione
//   aggressiva   mira ai KO e al ritmo: poche protezioni, pochi cambi, pochi stati; team offensivi con mosse prioritarie
//   pivot        tiene l'iniziativa con i cambi: perni (Retromarcia, Invertivolt, Dietrofront), Prepotenza, uscite e rientri
//   campo        prepara il campo: meteo e terreni, schermi, trappole, aiuto, deviazione degli attacchi
//   velocita     decide chi muove per primo: Vento in Poppa, Stanza Magica, Vento Gelato, Rete Elettrica, paralisi
//   stato        logora l'avversario: Fuocopira, Onda Tuono, Fungospora, Tossina
//
// Prima di ogni partita si "pesca" una personalità (scegli); nella palestra la sceglie il capopalestra, o la CPU ne propone una dall'allenamento (suggerisci).
//
//   CpuPersonalita.ELENCO                                 gli id, nell'ordine in cui si mostrano
//   CpuPersonalita.info(id)                               { id, nome, breve, descrizione } (testi inglesi, per la pagina) o null
//   CpuPersonalita.esiste(id)                             true se è una personalità
//   CpuPersonalita.cervello(id)                           le manopole di cpu-ia.js che sposta (una copia)
//   CpuPersonalita.team(id)                               { piani: { <piano>: peso }, parametri: { <parametro di team-cpu.js>: valore } } (copie)
//   CpuPersonalita.scegli(casuale, { pesi, escludi })     un id a sorte (di base l'equilibrata pesa una volta e mezza le altre); `pesi`: { id: moltiplicatore }
//   CpuPersonalita.tratti(...)                            le quote dello stile di un team o di un copione (vedi sotto)
//   CpuPersonalita.suggerisci({ copione, team })          { id, punteggi, origine, motivi } la personalità che gli somiglia di più, dall'allenamento (se c'è) e dal team
//   CpuPersonalita.affinita(team, { doppio })             { id: 0..1 }: quanto il team (le sue mosse) si presta a ogni stile
//   CpuPersonalita.pesiDaAffinita(aff)                    i pesi per scegli(): chi si presta di più esce più spesso
//   CpuPersonalita.mosseDaTesto(testo)                    le mosse di ogni Pokémon di un team in testo Showdown, nella forma che affinita e suggerisci leggono
//   CpuPersonalita.sceltaDellaTappa(x)                    'auto' | id: la scelta salvata dal capopalestra, ripulita
//
// Funziona nel browser (window.CpuPersonalita) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./cpu-conoscenza.js'), require('./cpu-copione.js'));
    else radice.CpuPersonalita = fabbrica(radice.CpuConoscenza, radice.CpuCopione);
})(typeof self !== 'undefined' ? self : this, function (K, Cop) {
    'use strict';

    const ELENCO = ['equilibrata', 'aggressiva', 'pivot', 'campo', 'velocita', 'stato'];
    const PREDEFINITA = 'equilibrata';

    // Ogni personalità: i testi (inglesi, per la pagina), le manopole del cervello e quelle del team builder.
    //   cervello          sovrascrive PARAMETRI_BASE di cpu-ia.js
    //   team.piani        peso di ogni piano di team (di base 1; 0 = mai, 3 = tre volte più spesso); i nomi sono quelli di team-cpu.js
    //   team.parametri    sovrascrive PARAMETRI_TEAM di team-cpu.js
    const PERSONALITA = {
        equilibrata: {
            nome: 'Balanced', breve: 'Weighs everything as the situation asks',
            descrizione: 'No special habit: it attacks, protects, switches and uses support moves as the position calls for.',
            peso: 1.5,
            cervello: {},
            team: { piani: {}, parametri: {} }
        },
        aggressiva: {
            nome: 'Aggressive', breve: 'Goes for knockouts, rarely protects',
            descrizione: 'It hunts knockouts and tempo: few protects, few switches, little status. Its teams lean on strong attackers and priority moves.',
            peso: 1,
            cervello: { aggressivita: 0.6, aggressivitaDoppio: 0.2, costoProtezione: 1, costoCambio: 0.45, costoCambioDoppio: 0.4, moltStati: 0.5, moltCampo: 0.5, pesoPosizione: 0.2, valoreFakeOut: 1.1 },
            team: {
                piani: { offensivo: 4, tailwind: 1.5, sole: 1.5, pioggia: 1.2, bilanciato: 0.5, bulky: 0.2, trickroom: 0.5 },
                parametri: { probProtezione: 0.6, maxSenzaProt: 3, priorita: 1.8, bonusPriorita: 0.4, maxAiuto: 0, probAiuto: 0, maxStato: 1, probStato: 0.35, probPerno: 0.4 }
            }
        },
        pivot: {
            nome: 'Pivot', breve: 'Keeps the initiative with switches',
            descrizione: 'It rotates its team: U-turn, Volt Switch, Flip Turn and Parting Shot keep the initiative and bring in the better matchup. Its teams are built around pivots, with Intimidate to soften the hits.',
            peso: 1,
            cervello: { bonusPerno: 0.3, costoCambio: 0.15, costoCambioDoppio: 0.1, costoCambioSano: 0.1, pesoPosizione: 0.45, rispostaAlCambioDoppio: 0.35 },
            team: {
                piani: { bilanciato: 3, bulky: 1.5, offensivo: 1, tailwind: 0.8, trickroom: 0.5, pioggia: 0.8, sole: 0.8 },
                parametri: { probPerno: 1, maxPerno: 2, sogliaPerno: 40, bonusPerno: 1.1, pesoPerno: 0.9, bonusIntimidazione: 1.1, maxSenzaProt: 1, maxAiuto: 1 }
            }
        },
        campo: {
            nome: 'Field control', breve: 'Sets weather, screens and hazards',
            descrizione: 'It prepares the field: weather and terrain, screens, hazards, Helping Hand and redirection. Its teams are built around a setter and its beneficiaries.',
            peso: 1,
            cervello: { moltCampo: 2.2, bonusPianoStanza: 1.3, bonusPianoMeteo: 0.9, utilPianoTailwind: 1.1 },
            team: {
                piani: { pioggia: 1.5, sole: 1.5, sabbia: 0.8, neve: 0.8, tailwind: 1.5, trickroom: 1.5, bilanciato: 0.7, offensivo: 0.7, bulky: 1 },
                parametri: { probAiuto: 0.6, bonusRedirezione: 1.2, pesoCampo: 0.5 }
            }
        },
        velocita: {
            nome: 'Speed control', breve: 'Decides who moves first',
            descrizione: 'Tailwind, Trick Room, Icy Wind, Electroweb and paralysis: it makes sure its team is the one that moves first. Its teams carry speed control on several Pokémon.',
            peso: 1,
            cervello: { moltVelocita: 1.9, valoreRallenta: 1.5, valoreStatoSpeed: 0.7, valorePar: 0.8, utilPianoTailwind: 1.25, bonusPianoStanza: 1.4 },
            team: {
                piani: { tailwind: 4, trickroom: 3, bilanciato: 0.5, offensivo: 0.6, pioggia: 0.5, sole: 0.5, sabbia: 0.4, neve: 0.4, bulky: 0.4 },
                parametri: { maxStato: 3, probStato: 1, probStatoSeguenti: 0.8, bonusStato: 1.3, offesaMaxStato: 135, pesoVelocita: 1.2, rallentaAnche: 1, maxSenzaProt: 1 }
            }
        },
        stato: {
            nome: 'Status', breve: 'Wears you down with burns, sleep and paralysis',
            descrizione: 'Will-O-Wisp, Thunder Wave, Spore, Toxic: it spreads status and lets time do the work. Its teams carry status moves on the Pokémon that do not need to attack.',
            peso: 1,
            cervello: { moltStati: 1.9, valoreBrn: 1.1, valoreSlp: 1.3, valorePar: 0.8, costoProtezione: 0.4 },
            team: {
                piani: { bilanciato: 2.5, bulky: 2.5, offensivo: 0.5, tailwind: 0.8, trickroom: 1.2, pioggia: 0.8, sole: 0.8, sabbia: 0.8, neve: 0.8 },
                parametri: { maxStato: 3, probStato: 1, probStatoSeguenti: 0.8, bonusStato: 1.6, offesaMaxStato: 135, pesoStato: 1.8 }
            }
        }
    };

    const copia = o => JSON.parse(JSON.stringify(o));
    const esiste = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PERSONALITA, id);
    function info(id) {
        if (!esiste(id)) return null;
        const p = PERSONALITA[id];
        return { id, nome: p.nome, breve: p.breve, descrizione: p.descrizione };
    }
    const cervello = id => (esiste(id) ? copia(PERSONALITA[id].cervello) : {});
    const team = id => (esiste(id) ? copia(PERSONALITA[id].team) : { piani: {}, parametri: {} });

    /** La scelta salvata per una tappa della palestra: 'auto' (o niente, o un valore strano) oppure l'id di una personalità */
    function sceltaDellaTappa(x) {
        const s = typeof x === 'string' ? x.trim().toLowerCase() : '';
        return esiste(s) ? s : 'auto';
    }

    /**
     * Un id a sorte. `casuale`: funzione che dà un numero tra 0 e 1 (Math.random se manca); `pesi`: moltiplicatori per id (0 = mai), per scegliere di più chi si adatta
     * (affinita); `escludi`: id da non pescare (la volta di prima, per cambiare).
     */
    function scegli(casuale, { pesi = null, escludi = [] } = {}) {
        const rnd = typeof casuale === 'function' ? casuale : Math.random;
        const voci = ELENCO.filter(i => !escludi.includes(i)).map(i => ({ i, p: PERSONALITA[i].peso * (pesi && Number.isFinite(pesi[i]) ? Math.max(0, pesi[i]) : 1) })).filter(v => v.p > 0);
        if (!voci.length) return PREDEFINITA;
        let t = rnd() * voci.reduce((s, v) => s + v.p, 0);
        for (const v of voci) { t -= v.p; if (t < 0) return v.i; }
        return voci[voci.length - 1].i;
    }

    // ---------- lo stile di un team o di un copione ----------
    // I gruppi di mosse che dicono lo stile. Nei team una mossa conta una volta per Pokémon, nei copioni tante volte quante è stata usata.
    const INSIEME = (...liste) => { const s = new Set(); for (const l of liste) for (const x of l) s.add(x); return s; };
    const GRUPPI = {
        protezione: INSIEME(K.PROTEZIONI),
        perno: INSIEME(K.PERNO),
        // il controllo del campo: schermi, trappole, meteo e terreni (che la CPU sa mettere con le abilità, ma un set può averli), aiuto, deviazione, protezioni di area
        campo: INSIEME(K.SCHERMI, K.TRAPPOLE, K.REDIREZIONE, ['helpinghand', 'raindance', 'sunnyday', 'sandstorm', 'snowscape', 'hail', 'chillyreception', 'electricterrain', 'grassyterrain',
            'mistyterrain', 'psychicterrain', 'wideguard', 'quickguard', 'defog', 'rapidspin']),
        // il controllo della velocità: i due di squadra e tutto ciò che rallenta o paralizza il bersaglio
        velocita: INSIEME(K.VELOCITA_DI_SQUADRA, ['icywind', 'electroweb', 'thunderwave', 'glare', 'nuzzle', 'stunspore', 'bulldoze', 'rocktomb', 'mudshot', 'scaryface', 'cottonspore',
            'stickyweb', 'lowsweep']),
        // gli stati e le mosse che tolgono libertà (Provocazione, Ripeti)
        stato: INSIEME(Object.keys(K.STATI), ['taunt', 'encore', 'confuseray', 'swagger', 'flatter', 'leechseed', 'torment', 'disable'])
    };
    // Mosse di stato che non attaccano e non fanno parte di nessun gruppo (potenziamenti, recuperi...): non sono attacchi nemmeno loro
    const NON_ATTACCO = INSIEME(Object.keys(K.POTENZIAMENTI), K.RECUPERO, ['wish', 'substitute', 'haze', 'painsplit', 'imprison', 'allyswitch', 'afteryou', 'coaching', 'decorate',
        'lifedew', 'pollenpuff', 'aromatherapy', 'healbell', 'strengthsap', 'soak', 'magicpowder']);
    // Mosse che appartengono a due gruppi (Onda Tuono e Stunspore paralizzano e rallentano: contano per lo stato e per la velocità)
    const gruppiDi = idMossa => Object.keys(GRUPPI).filter(g => GRUPPI[g].has(idMossa));

    const idMossa = m => String(m == null ? '' : m).toLowerCase().replace(/[^a-z0-9]/g, '');
    const limita = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
    const rapporto = (x, tot) => (tot > 0 ? x / tot : 0);
    const arrotonda = x => Math.round(x * 100) / 100;

    /**
     * Le quote dello stile di un insieme di mosse: quante sono protezioni, perni, controllo del campo, della velocità, stati e attacchi (`n` è il totale). `mosse` può essere un array di
     * id/nomi oppure una mappa { id: quante volte è stata usata } (il copione). `attacco(id)` (facoltativo) dice se una mossa attacca: senza, "attacco" è tutto ciò che non è in un
     * gruppo né un potenziamento, un recupero o un'altra mossa di stato che non attacca.
     */
    function tratti(mosse, attacco) {
        const voci = Array.isArray(mosse) ? mosse.map(m => [idMossa(m), 1]) : Object.entries(mosse || {}).map(([k, v]) => [idMossa(k), Number(v) || 0]);
        const t = { n: 0, protezione: 0, perno: 0, campo: 0, velocita: 0, stato: 0, attacco: 0 };
        for (const [m, peso] of voci) {
            if (!m || !(peso > 0)) continue;
            t.n += peso;
            const g = gruppiDi(m);
            if (g.length) for (const k of g) t[k] += peso;
            else if (attacco ? attacco(m) : !NON_ATTACCO.has(m)) t.attacco += peso;
        }
        return t;
    }

    // Da quanto una quota è "normale" a quanto ne fa uno stile (sotto il normale: 0; al massimo: 1). Sono quote delle mosse usate (copione).
    const SCALE = {
        stato: [0.03, 0.2],
        velocita: [0.05, 0.22],
        campo: [0.03, 0.18],
        perno: [0.03, 0.15],
        cambi: [0.05, 0.25]        // quota delle decisioni che sono cambi
    };
    const sale = (q, [da, a]) => limita((q - da) / (a - da));
    const MIN_DECISIONI = 6, MIN_MOSSE = 6;

    /**
     * Quanto lo stile osservato (copione: come il capopalestra ha giocato quel team) somiglia a ogni personalità: { p: { id: 0..1 }, n, quote }. Dal copione servono le quote di
     * protezione, attacchi e cambi tra le decisioni (categorie) e quelle del tipo di mosse usate da ogni Pokémon. null se il copione è vuoto o ha visto troppo poco.
     */
    function stileDalCopione(copione, attacco) {
        const c = Cop && Cop.normalizza ? Cop.normalizza(copione) : null;
        if (!c) return null;
        const k = c.memoria.categorie, decisioni = k.attacco + k.protezione + k.cambio + k.altro;
        if (!(decisioni >= MIN_DECISIONI)) return null;
        const usi = {};
        for (const r of Object.values(c.memoria.specie)) for (const [m, v] of Object.entries(r.mosse || {})) usi[m] = (usi[m] || 0) + v;
        const t = tratti(usi, attacco), mosse = t.n;
        if (!(mosse >= MIN_MOSSE)) return null;
        const qProt = rapporto(k.protezione, decisioni), qCambi = rapporto(k.cambio, decisioni), qAtt = rapporto(k.attacco, decisioni);
        const qStato = rapporto(t.stato, mosse), qVel = rapporto(t.velocita, mosse), qCampo = rapporto(t.campo, mosse), qPerno = rapporto(t.perno, mosse);
        const p = {
            aggressiva: limita(0.5 * limita((qAtt - 0.7) / 0.2) + 0.3 * limita((0.1 - qProt) / 0.1) + 0.2 * limita((0.05 - qCambi) / 0.05)),
            pivot: Math.max(sale(qCambi, SCALE.cambi), sale(qPerno, SCALE.perno)),
            campo: sale(qCampo, SCALE.campo),
            velocita: sale(qVel, SCALE.velocita),
            stato: sale(qStato, SCALE.stato)
        };
        return { p, n: decisioni, quote: { protezione: qProt, cambi: qCambi, attacco: qAtt, stato: qStato, velocita: qVel, campo: qCampo, perno: qPerno } };
    }

    /**
     * Quanto un team (le sue mosse) si presta a ogni stile, da 0 a 1: { id: x }. `team`: i Pokémon con le loro mosse ({ mosse: [nomi o id] } o direttamente la lista delle mosse). Conta
     * quanti Pokémon (non quante mosse) hanno qualcosa del gruppo: uno o due non fanno uno stile, tre o quattro sì. `doppio`: senza Protezione un team del singolo non dice niente
     * (non la gioca nessuno), in doppio sì.
     */
    function affinita(squadra, { doppio = true, attacco = null } = {}) {
        const lista = (Array.isArray(squadra) ? squadra : []).map(x => (Array.isArray(x) ? x : (x && x.mosse) || [])).filter(m => m.length);
        const out = {};
        for (const i of ELENCO) out[i] = i === PREDEFINITA ? 0.35 : 0;
        if (!lista.length) return out;
        const quanti = g => lista.filter(m => m.some(x => GRUPPI[g].has(idMossa(x)))).length;
        const forte = g => limita((quanti(g) - 1) / 3);          // 1 Pokémon: niente; 2: poco; 3: bene; 4: molto
        const attaccanti = lista.filter(m => { const t = tratti(m, attacco); return t.n > 0 && rapporto(t.attacco, t.n) >= 0.75; }).length;
        const senzaProt = lista.length - quanti('protezione');
        out.aggressiva = doppio
            ? limita((rapporto(senzaProt, lista.length) - 0.2) / 0.5) * (0.5 + 0.5 * rapporto(attaccanti, lista.length))
            : 0.7 * limita((rapporto(attaccanti, lista.length) - 0.75) / 0.25);
        out.pivot = limita(quanti('perno') / 3);
        out.campo = forte('campo');
        out.velocita = forte('velocita');
        out.stato = forte('stato');
        return out;
    }

    /** Le mosse di ogni Pokémon di un team in testo Showdown (le righe "- Mossa"): [{ mosse: [nomi] }], uno per Pokémon che ne ha */
    function mosseDaTesto(testo) {
        return String(testo || '').split(/\n\s*\n/).map(blocco => ({
            mosse: blocco.split('\n').map(r => /^\s*-\s*(.+?)\s*$/.exec(r)).filter(Boolean).map(m => m[1])
        })).filter(x => x.mosse.length);
    }

    /** I pesi per `scegli` da quanto un team si presta a ogni stile ({ id: moltiplicatore }): chi si presta di più esce più spesso, nessuno resta escluso */
    function pesiDaAffinita(aff) {
        const out = {};
        for (const i of ELENCO) out[i] = 1 + 3 * limita(Number(aff && aff[i]) || 0);
        return out;
    }

    // Come la pagina spiega perché propone uno stile: da cosa ha fatto il capopalestra nell'allenamento, o da cosa può fare il team
    const FRASI = {
        allenamento: {
            aggressiva: 'you mostly attack and rarely protect or switch',
            pivot: 'you switch and pivot a lot',
            campo: 'you often set up the field',
            velocita: 'you use a lot of speed control',
            stato: 'you spread a lot of status'
        },
        team: {
            aggressiva: 'most of its Pokémon go all-out on attacks',
            pivot: 'several of its Pokémon can pivot',
            campo: 'several of its Pokémon can set up the field',
            velocita: 'several of its Pokémon can control speed',
            stato: 'several of its Pokémon can spread status'
        }
    };
    const SOGLIA = 0.42;            // sotto questo punteggio nessuno stile spicca: equilibrata

    /**
     * La personalità che somiglia di più a come si gioca quel team. `copione`: l'allenamento della CPU (cpu-copione.js) del team; `team`: i suoi Pokémon con le mosse (come in
     * affinita); `doppio`: se il formato è in doppio. Con poche lezioni conta di più cosa può fare il team (le sue mosse), con più lezioni come lo gioca il capopalestra.
     * Restituisce { id, punteggi: { id: 0..1 }, origine: 'allenamento' | 'team' | 'nessuna', motivi: [frasi inglesi], fiducia }: `equilibrata` se niente spicca.
     */
    function suggerisci({ copione = null, team: squadra = null, doppio = true, attacco = null } = {}) {
        const dalTeam = squadra ? affinita(squadra, { doppio, attacco }) : null;
        const visto = copione ? stileDalCopione(copione, attacco) : null;
        const fiducia = visto && Cop ? Math.min(1, Cop.fiducia(copione) * 0.6 + Math.min(1, visto.n / 40) * 0.4) : 0;
        const punteggi = {}, dalleLezioni = {};
        for (const i of ELENCO) {
            if (i === PREDEFINITA) continue;
            const t = dalTeam ? dalTeam[i] : 0;
            // senza allenamento conta solo il team (e un po' meno: dice cosa può fare, non cosa fa); con l'allenamento conta soprattutto come lo gioca
            const lezioni = visto ? fiducia * visto.p[i] : 0, mosse = (visto ? 1 - fiducia : 1) * t * 0.8;
            punteggi[i] = limita(lezioni + mosse);
            dalleLezioni[i] = lezioni >= mosse && lezioni > 0;
        }
        punteggi[PREDEFINITA] = 0.3;
        const [primo, valore] = Object.entries(punteggi).sort((a, b) => b[1] - a[1])[0];
        const id = valore >= SOGLIA ? primo : PREDEFINITA;
        // da dove viene: dall'allenamento se è lui che ha pesato di più nel punteggio dello stile scelto, altrimenti dalle mosse del team
        const origine = !visto && !dalTeam ? 'nessuna' : (id === PREDEFINITA ? (visto && fiducia >= 0.3 ? 'allenamento' : 'team') : dalleLezioni[id] ? 'allenamento' : 'team');
        const motivi = id === PREDEFINITA ? [] : [`${origine === 'allenamento' ? 'from your training' : 'from the team'}: ${FRASI[origine][id]}`];
        return { id, punteggi: Object.fromEntries(Object.entries(punteggi).map(([k, v]) => [k, arrotonda(v)])), origine, motivi, fiducia: arrotonda(fiducia) };
    }

    return { ELENCO, PREDEFINITA, PERSONALITA, GRUPPI, info, esiste, cervello, team, scegli, tratti, suggerisci, affinita, pesiDaAffinita, mosseDaTesto, stileDalCopione, sceltaDellaTappa, gruppiDi };
});
