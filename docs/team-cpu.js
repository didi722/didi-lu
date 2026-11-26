// =====================================================
// TEAM DELLA CPU
// Compone da sola una dozzina di team sensati per un formato, partendo dal suo pool di Pokémon
// (formato-pool.js) e dalle sue regole. Niente liste scritte a mano: un formato nuovo funziona subito.
//
//   1. Dal pool si tengono i Pokémon più forti del formato (tier e statistiche: 110 nel singolo, 170 nel doppio) più qualche scelta fuori moda (fino a 170 e 260).
//   2. Per ognuno si leggono le mosse che può imparare nella generazione del formato, si scartano
//      quelle bandite o che la CPU non sa usare (cpu-conoscenza.js) e si classificano.
//   3. Ogni team parte da un "asso" e si completa un Pokémon alla volta scegliendo quello che migliora
//      di più la squadra: copertura dei tipi in attacco, debolezze in difesa, ruoli (controllo della
//      velocità, Fake Out, deviatori, trappole, recupero), accoppiate meteo, velocità. Ogni team ha un
//      "piano" diverso (Tailwind, Camerone, pioggia, sole, sabbia, neve, equilibrato, offensivo...).
//   4. Ai Pokémon scelti si dà un set: abilità, strumento (mai due uguali), natura, EV e quattro mosse.
//      Ogni mossa è controllata dal validatore del simulatore. Le scelte di ruolo (chi mette Tailwind, chi ha Fake Out...) vengono
//      prima; per il resto si preferiscono mosse, strumento e abilità che di solito si giocano su quel Pokémon (i consigli di
//      consigli.js, gli stessi che il Team Builder mette in cima alle liste), sempre dentro ciò che la CPU sa usare. Natura, EV e IV nel singolo (e in Little Cup) sono quelli dei set di
//      Smogon che somigliano di più alle mosse scelte (campo `spread` dei consigli); nel doppio la distribuzione a ruoli, che lì rende di più (vedi le manopole probSpread).
//
// Tutto è deterministico: stesso formato e stesso seme, stessi team. Mai due team troppo simili,
// e nessun Pokémon in più di un terzo dei team.
// Rispetta le regole del sito: Species Clause, Item Clause, livello, Uber limit del formato STANDARD,
// mosse e abilità bandite, restrizioni su mosse/strumenti/natura e "stesso ... per tutto il team".
// Anything Goose (nessuna clausola): niente limite di tier (ci sono anche gli AG), Pokémon e strumenti si possono doppiare
// (due Calyrex-Shadow vanno bene) e i team sono molto offensivi, con solo un po' di strategia (Tailwind, meteo, Stanza Magica).
//
// La personalità (cpu-personalita.js, opzione `personalita` di generaTeam, squadrePerFormato, unTeam e nuovoTeam): un team nasce per uno stile. Pesa diversamente i piani (un team
// "velocità" parte quasi sempre da Tailwind o dalla Stanza Magica, uno "campo" dal meteo) e sposta le manopole dei ruoli (più perni, più stati, più aiuto, meno Protezioni...).
//
// Il Dex di @pkmn/sim arriva da fuori. Funziona nel browser (window.TeamCpu) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica(require('./cpu-conoscenza.js'), require('./formato-pool.js'), require('./consigli.js'), require('./cpu-personalita.js'));
    else radice.TeamCpu = fabbrica(radice.CpuConoscenza, radice.FormatoPool, radice.Consigli, radice.CpuPersonalita);
})(typeof self !== 'undefined' ? self : this, function (K, Pool, Consigli, Pers) {
    'use strict';

    const id = K.id;

    // Le "manopole" del team (come i parametri della CPU in battaglia: si possono cambiare con opzioni.parametriTeam, e si provano con tools/prova-team.cjs).
    // Servono a far somigliare i team della CPU a quelli di chi gioca davvero: in un team vero non tutti hanno Protect, c'è al massimo un Helping Hand e
    // quasi sempre qualcuno con una mossa prioritaria.
    //   maxAiuto          quanti Pokémon per team possono avere Helping Hand (prima: tutti quelli che potevano)
    //   probAiuto         probabilità che un team ne abbia uno, se c'è chi può (meno se ha già un altro supporto: Fake Out, Tailwind, deviatore...)
    //   probProtezione    probabilità che un Pokémon senza ruolo di supporto abbia la Protezione (doppio; prima: sempre)
    //   maxSenzaProt      al massimo quanti Pokémon per team ne sono privi
    //   priorita          quante mosse d'attacco prioritarie (Aqua Jet, Sucker Punch, Extreme Speed...) cerca il team: la prima quasi sempre, la seconda
    //                     con probabilità priorita - 1 (Fake Out è un ruolo a parte)
    //   sogliaPriorita    valore minimo (potenza × precisione × STAB × categoria) perché una mossa prioritaria valga un posto nel set: Sucker Punch, Extreme Speed sì;
    //                     Aqua Jet o Mach Punch senza forza no (non valgono il posto di un attacco di copertura)
    //   bonusPriorita     quanto vale in squadra avere chi ha una mossa prioritaria buona (punteggio del team)
    //   probPerno         probabilità che un team del doppio abbia un Pokémon col pivot (U-turn, Volt Switch, Flip Turn: chi le usa esce e fa entrare un compagno senza
    //                     perdere il turno), se c'è chi può; maxPerno: al massimo quanti per team (la seconda con probabilità minore). Prima non ce n'erano mai nel doppio
    //   sogliaPerno       valore minimo (potenza × precisione × STAB × categoria) perché il pivot valga un posto nel set (U-turn con un Pokémon che non attacca non vale)
    //   bonusPerno        quanto vale in squadra avere chi ha un pivot buono (punteggio del team)
    //   pesoSpecieMeta    con la meta della lega (opzioni.meta, vedi meta-lega.js): quanto pesa, nella scelta dei membri, l'essere un Pokémon che la lega gioca
    //                     (per un Pokémon in un terzo dei team: il peso intero); pesoMossaMeta: quanto pesano le mosse che la lega gioca su quel Pokémon
    //   maxStato, probStato   al massimo quanti Pokémon per team portano una mossa che dà uno stato (Onda Tuono, Glare, Fungospora, Sonnifero, Fuocopira) e la probabilità che
    //                     il team ne abbia uno (la seconda con probabilità minore); chi la porta attacca poco (offesaMaxStato). Prima: solo paralisi e sonno, solo a chi ha poca offesa
    //   offesaMaxStato    la statistica offensiva oltre la quale un Pokémon non spreca una mossa su uno stato
    //   bonusFakeOut      quanto vale in squadra avere chi ha Colpo Fortunato (punteggio del team); prima 1,3
    //   bonusStato        avere chi può dare uno stato; bonusIntimidazione: avere Prepotenza (Intimidate), che in doppio toglie attacco a due avversari ogni volta che entra
    //   bonusRedirezione  avere chi devia gli attacchi (Furia Polvere, Mi Segui)
    //   pesoStato         quanto vale, per ogni Pokémon del team (fino a tre) che può dare uno stato (e non ha troppo da attaccare), averlo: senza, i Pokémon con Fuocopira o Onda Tuono
    //                     restavano in panchina, perché valgono meno degli altri per tier e statistiche
    //   pesoVelocita, pesoCampo, pesoPerno
    //                     (le personalità, cpu-personalita.js; di base 0) lo stesso per poter controllare la velocità (Vento in Poppa, Stanza Magica, Vento Gelato, Rete Elettrica,
    //                     paralisi), il campo (schermi, trappole, aiuto, deviazione, meteo) o avere un perno (fino a quattro, quattro, tre)
    //   rallentaAnche     (1 = sì) chi ha Rete Elettrica la porta come chi ha Vento Gelato (di base solo Vento Gelato); probStatoSeguenti: la probabilità di dare uno stato anche al secondo
    //                     e al terzo Pokémon (di base 0,4 di probStato)
    //   probSpread, probSpreadDoppio, genMinSpread
    //                     con quale probabilità natura, EV e IV sono quelli dei set di Smogon (consigli.js, campo `spread`: il set che somiglia di più alle mosse scelte) invece della
    //                     distribuzione a ruoli (252/252/4: tutto sull'attacco e sulla velocità), nel singolo e nel doppio. Misurato con coppie di team identici che cambiano solo gli EV:
    //                     nel singolo gli spread veri vincono il 55% in Gen 9 e il 52% in Gen 7, pareggiano in Gen 5 e 6 e perdono in Gen 4 (47%: i set di quegli anni, pensati per
    //                     altre meccaniche e per altri avversari, non servono a una CPU); nel doppio da VGC perdono (45%: lì conta far più danno, non reggere di più) e nel doppio OU
    //                     pareggiano; in Little Cup (livello 5, qualunque generazione) vincono dal 65% al 70%. Per questo di base: singolo dalla Gen `genMinSpread` (7) in poi
    //                     e Little Cup (probSpread 1), mai nel doppio (probSpreadDoppio 0)
    //   probScelta, probSceltaDoppio
    //                     con quale probabilità un Pokémon con soli attacchi (tre o quattro, nessuna Protezione né altra mossa di stato, niente Colpo Fortunato) porta lo strumento Scelta
    //                     (Choice Band, Specs, Scarf) se i consigli ce l'hanno tra i primi tre, nel singolo e nel doppio. Misurato con coppie di team identici che cambiano solo lo strumento:
    //                     nel singolo vince il 51% in Gen 9, il 52% in Gen 7 e il 53% in Gen 4; nel doppio da VGC pareggia (pochi Pokémon senza Protezione): di base 1 nel singolo, 0 nel doppio
    //   probEncore, probTrick, probSostituto, probRiposo, probDesiderio, probPassaBoost, probEsplosione, probCura, probCoaching
    //                     le mosse di utilità che il cervello sa giocare (Encore; Trick e Switcheroo; Substitute; Rest con Sleep Talk; Wish; Baton Pass; Explosion, Self-Destruct e Misty Explosion;
    //                     Heal Pulse e Floral Healing; Coaching: MOSSE_UTILI in cpu-conoscenza.js). Un Pokémon le porta solo se i consigli (consigli.js) le hanno tra le prime `utiliTop`
    //                     consigliate, con questa probabilità per ognuna, e nei limiti di `maxUtili` per team (`maxEsplosione` per Explosion e simili). Trick vuole anche lo strumento Scelta tra i primi tre
    //                     consigliati (e lo porta); Baton Pass solo a chi ha una mossa di potenziamento (singolo); Sleep Talk solo con Rest; Heal Pulse e Coaching solo nel doppio. 0 = mai.
    //                     Misurate una per volta con team gemelli (stessi sei Pokémon, cambia solo chi porta quella mossa; si contano le sole coppie in cui i gemelli differiscono, stesso
    //                     cervello; tools/duello-cpu.cjs --gemelli --solo-diversi), percentuale di vittorie dei team con la mossa:
    //                       Trick            Gen 4 56%, Gen 5 52%, Gen 7 55%, Gen 9 53%, VGC 54%    -> accesa
    //                       Wish             Gen 7 51%, Gen 9 52%                                  -> accesa
    //                       Baton Pass       Gen 4 51%                                             -> accesa (rara)
    //                       Heal Pulse       VGC 52%                                               -> accesa
    //                       Coaching         VGC 50% e 48%, doppio OU 48% e 50%                    -> accesa (neutra, rara)
    //                       Encore           Gen 9 singolo 49%, VGC 51% e 49%, doppio OU 47% e 42% -> spenta: il posto nel set rende meno di un attacco, anche pesando meno la mossa
    //                       Rest/Sleep Talk  Gen 5 48%, Gen 7 44%, Gen 9 51%                       -> spenta: i due posti nel set rendono meno di due attacchi
    //                       Substitute       Gen 4 46%, Gen 7 44% (anche con costoSostituto)       -> spenta: quasi mai conviene a una scelta fatta un turno alla volta
    //                       Explosion        Gen 4 46%, Gen 7 42% (anche con costoEsplosione)      -> spenta
    //                     Il cervello le gioca tutte (anche quando le porta un team fatto da una persona): spente sono solo nei team che compone la CPU
    //   coerenzaOffensiva (1 = sì) chi porta Swords Dance, Bulk Up, Nasty Plot o Calm Mind attacca con quella statistica (prima Iron Valiant aveva Swords Dance con Moonblast e gli EV sull'Att. Sp.),
    //                     e uno spread fatto per l'altra statistica non va a chi attacca solo con mosse fisiche (o solo speciali): Landorus-Therian con Terremoto e Rock Slide ma EV sull'Att. Sp.
    //   hiddenPower, bonusHiddenPower
    //                     (1 = sì) nella 3ª-7ª generazione Hidden Power è un attacco del tipo che i consigli indicano ("Hidden Power Fire": gli IV seguono il tipo); prima non c'era.
    //                     bonusHiddenPower scala quanto i consigli la fanno preferire agli altri attacchi (1 = come per ogni mossa consigliata, 0 = vale solo per la copertura che dà). Misurato nel
    //                     singolo di Gen 7 con coppie di team identici tranne i set con Hidden Power: con il peso dei consigli intero perde (44% su 1886 coppie), con 0,4 perde ancora (40%),
    //                     a 0 vince il 57% (468 coppie): i consigli la mettono in alto perché nei set di Smogon accompagna mosse che la CPU non porta, e una CPU che la preferisce a un attacco da 90 perde
    //   candFissi, candMax, candFissiDoppio, candMaxDoppio
    //                     i candidati da cui la CPU compone i team: i `candFissi` migliori del formato (per tier e statistiche) più, a caso, altri fino a `candMax`; nel singolo e nel doppio.
    //                     Nel doppio i tier dicono poco (quasi tutti i Pokémon da VGC sono "(DUU)"): con 110 e 170 metà dei Pokémon da VGC (Volcarona, Iron Bundle, Heatran, Corviknight...) non usciva
    //                     mai, con 170 e 260 i team di 300 sono 173 specie invece di 108 e hanno la stessa forza (50% contro 49%). Nel singolo OU il tier invece è una buona guida e allargare
    //                     la scelta toglie 3,6 punti (54,8% contro 51,2%): lì restano 110 e 170. Un tetto agli Uber (provato, nel VGC) toglie sei punti: gli Uber sono davvero i più forti
    const PARAMETRI_TEAM = { maxAiuto: 1, probAiuto: 0.45, probProtezione: 0.85, maxSenzaProt: 2, priorita: 1.35, sogliaPriorita: 85, bonusPriorita: 0.6, pesoSpecieMeta: 0.6, pesoMossaMeta: 0.5,
        probPerno: 0.65, maxPerno: 1, sogliaPerno: 50, bonusPerno: 0.1,
        maxStato: 2, probStato: 0.85, offesaMaxStato: 125, bonusFakeOut: 2.1, bonusStato: 1.2, bonusIntimidazione: 0.5, bonusRedirezione: 0.9,
        pesoStato: 1, pesoVelocita: 0, pesoCampo: 0, pesoPerno: 0, rallentaAnche: 0, probStatoSeguenti: 0.4, candFissi: 110, candMax: 170, candFissiDoppio: 170, candMaxDoppio: 260, probSpread: 1, probSpreadDoppio: 0, genMinSpread: 7, probScelta: 1, probSceltaDoppio: 0,
        probEncore: 0, probTrick: 1, probSostituto: 0, probRiposo: 0, probDesiderio: 1, probPassaBoost: 1, probEsplosione: 0, probCura: 1, probCoaching: 1, utiliTop: 4, maxUtili: 3, maxEsplosione: 1, hiddenPower: 1, bonusHiddenPower: 0, coerenzaOffensiva: 1, meteoConMosse: 1, pesoMeteo: 2 };
    // com'era prima (per i confronti)
    const PARAMETRI_TEAM_VECCHI = { maxAiuto: 99, probAiuto: 1, probProtezione: 1, maxSenzaProt: 0, priorita: 0, sogliaPriorita: 40, bonusPriorita: 0, probPerno: 0, maxPerno: 0, sogliaPerno: 50, bonusPerno: 0,
        maxStato: 0, probStato: 0, offesaMaxStato: 100, bonusFakeOut: 1.3, bonusStato: 0, bonusIntimidazione: 0, bonusRedirezione: 0.6,
        pesoStato: 0, pesoVelocita: 0, pesoCampo: 0, pesoPerno: 0, rallentaAnche: 0, probStatoSeguenti: 0.4, candFissi: 110, candMax: 170, candFissiDoppio: 110, candMaxDoppio: 170, probSpread: 0, probSpreadDoppio: 0, genMinSpread: 7, probScelta: 0, probSceltaDoppio: 0,
        probEncore: 0, probTrick: 0, probSostituto: 0, probRiposo: 0, probDesiderio: 0, probPassaBoost: 0, probEsplosione: 0, probCura: 0, probCoaching: 0, utiliTop: 4, maxUtili: 0, maxEsplosione: 0, hiddenPower: 0, bonusHiddenPower: 1, coerenzaOffensiva: 0, meteoConMosse: 0, pesoMeteo: 1 };
    // com'erano prima dei ruoli di stato, di Intimidate e del peso maggiore di Colpo Fortunato (per confrontare team vecchi e nuovi con tools/prova-team.cjs --confronto precedenti)
    const PARAMETRI_TEAM_PRECEDENTI = { maxAiuto: 1, probAiuto: 0.45, probProtezione: 0.85, maxSenzaProt: 2, priorita: 1.35, sogliaPriorita: 85, bonusPriorita: 0.1, pesoSpecieMeta: 0.6, pesoMossaMeta: 0.5,
        probPerno: 0.65, maxPerno: 1, sogliaPerno: 50, bonusPerno: 0.1, maxStato: 0, probStato: 0, offesaMaxStato: 100, bonusFakeOut: 1.3, bonusStato: 0, bonusIntimidazione: 0, bonusRedirezione: 0.6,
        pesoStato: 0, pesoVelocita: 0, pesoCampo: 0, pesoPerno: 0, rallentaAnche: 0, probStatoSeguenti: 0.4, candFissi: 110, candMax: 170, candFissiDoppio: 110, candMaxDoppio: 170, probSpread: 0, probSpreadDoppio: 0, genMinSpread: 7, probScelta: 0, probSceltaDoppio: 0,
        probEncore: 0, probTrick: 0, probSostituto: 0, probRiposo: 0, probDesiderio: 0, probPassaBoost: 0, probEsplosione: 0, probCura: 0, probCoaching: 0, utiliTop: 4, maxUtili: 0, maxEsplosione: 0, hiddenPower: 0, bonusHiddenPower: 1, coerenzaOffensiva: 0, meteoConMosse: 0, pesoMeteo: 1 };

    // =================================================
    // UTILITÀ
    // =================================================
    function hashStringa(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function creaCasuale(seme) {
        let a = hashStringa(String(seme)) || 1;
        return () => {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Stesse regole di team-sito.js (generazioneFormato, livelloFormato, formatoSimulatore): un test le confronta
    function generazioneFormato(regolamento) {
        return parseInt(regolamento.genRuleValue, 10) ||
            parseInt(String(regolamento.vgcGen || '').replace(/\D/g, ''), 10) || 9;
    }
    function livelloFormato(regolamento) {
        const struttura = String(regolamento.strutturaSito || 'custom').toLowerCase().trim();
        if (struttura === 'vgc') return 50;
        return String(regolamento.baseTier || '').toUpperCase() === 'LC' ? 5 : 100;
    }
    function formatoInDoppio(regolamento) {
        const struttura = String(regolamento.strutturaSito || 'custom').toLowerCase().trim();
        let doppio = struttura === 'vgc'
            ? !String(regolamento.vgcFormat || 'doubles').toLowerCase().startsWith('singles')
            : regolamento.battleStyle === 'doubles';
        if (generazioneFormato(regolamento) < 3) doppio = false;
        return doppio;
    }
    function meccaniche(regolamento) { return regolamento.generationalMechanics === true; }

    function contestoDa(regolamento) {
        return {
            gen: generazioneFormato(regolamento),
            livello: livelloFormato(regolamento),
            doppio: formatoInDoppio(regolamento),
            meccaniche: meccaniche(regolamento),
            struttura: String(regolamento.strutturaSito || 'custom').toLowerCase().trim(),
            // "within" (e il VGC) = solo il Pokédex di quella generazione; "up to" = anche i Pokémon e le mosse delle generazioni passate (come nel Team Builder)
            within: regolamento.genRuleType === 'within' || String(regolamento.strutturaSito || 'custom').toLowerCase().trim() === 'vgc',
            baseTier: String(regolamento.baseTier || '').toUpperCase(),
            // Anything Goose: nessuna clausola e nessun limite di tier. Si può doppiare Pokémon e strumenti (due Calyrex-Shadow vanno bene)
            goose: String(regolamento.strutturaSito || '').toLowerCase().trim() === 'anything_goes',
            // le regole del tier STANDARD (al massimo 2 Uber, niente mitici) non valgono in Anything Goose
            standard: String(regolamento.baseTier || '').toUpperCase() === 'STANDARD' && String(regolamento.strutturaSito || '').toLowerCase().trim() !== 'anything_goes'
        };
    }

    // ---------- ban list e restrizioni ----------
    // Come voceBannata di box.html: "Hidden Power [Fire]" è bandita anche se in lista c'è solo "Hidden Power"
    function voceBannata(restrizioni, categoria, nome) {
        const lista = restrizioni && restrizioni[categoria] && restrizioni[categoria].banned_list;
        if (!lista || lista.mode !== 'BANLIST' || !lista.value || !nome) return false;
        const k = id(nome);
        const presente = x => Object.prototype.hasOwnProperty.call(lista.value, x);
        return presente(k) || (k.startsWith('hiddenpower') && presente('hiddenpower'));
    }

    function confrontaOperatore(valore, regola) {
        // più righe sullo stesso campo (tipo Spettro e tipo Buio): vale chi rispetta una qualunque
        if (regola.operator === 'equals' && Array.isArray(regola.oppure) && regola.oppure.length) {
            return regola.oppure.some(v => confrontaOperatore(valore, { ...regola, value: v, oppure: null }));
        }
        let target = regola.value;
        if (target === 'true') target = true;
        if (target === 'false') target = false;
        if (valore === 'true') valore = true;
        if (valore === 'false') valore = false;
        if (Array.isArray(valore) && regola.operator === 'equals') return valore.includes(target);
        switch (regola.operator) {
            case 'lt': return valore < target;
            case 'gt': return valore > target;
            case 'lte': return valore <= target;
            case 'gte': return valore >= target;
            case 'between': return valore >= regola.min && valore <= regola.max;
            default: return valore === target;
        }
    }

    // Una mossa rispetta le restrizioni "mosse" del formato? (stessi campi che box.html legge da PokeAPI)
    function mossaAmmessa(dex, m, restrizioni) {
        const r = restrizioni && restrizioni.mosse;
        if (!r) return true;
        if (voceBannata(restrizioni, 'mosse', m.nome)) return false;
        const mossa = dex.moves.get(m.id);
        const campi = {
            power: m.potenza, category: m.categoria, type: m.tipo, max_pp: Math.floor((mossa.pp || 0) * 8 / 5), accuracy: m.precisione,
            priority: m.priorita, is_protect: m.protezione, is_contact: !!m.flags.contact, sound_based: !!m.flags.sound,
            punch: !!m.flags.punch, healing: m.recupero
        };
        for (const campo of Object.keys(r)) {
            const regola = r[campo];
            if (campo === 'banned_list' || !regola || regola.mode !== 'SPECIFIC' || !(campo in campi)) continue;
            if (!confrontaOperatore(campi[campo], regola)) return false;
        }
        return true;
    }

    // Dati di uno strumento come li legge box.html dalla PokeAPI
    function datiStrumento(item) {
        const k = item.id;
        return {
            is_berry: !!item.isBerry,
            is_consumable: !!(item.isBerry || item.isGem || /herb$/.test(k) || ['focussash', 'weaknesspolicy', 'airballoon', 'redcard', 'ejectbutton', 'ejectpack', 'whiteherb', 'mentalherb', 'powerherb', 'throatspray', 'blunderpolicy', 'roomservice', 'adrenalineorb', 'abilityshield'].includes(k)),
            is_healing: !!(item.isBerry && /restor|heal|recover/i.test(item.desc || item.shortDesc || '')),
            has_negative_effect: k.includes('choice') || k.includes('toxicorb') || k.includes('flameorb') || k.includes('lifeorb')
        };
    }
    function strumentoAmmesso(item, restrizioni) {
        const r = restrizioni && restrizioni.strumenti;
        if (!r) return true;
        const dati = datiStrumento(item);
        for (const campo of Object.keys(r)) {
            const regola = r[campo];
            if (!regola || regola.mode !== 'SPECIFIC' || !(campo in dati)) continue;
            if (!confrontaOperatore(dati[campo], regola)) return false;
        }
        return true;
    }

    function naturaImposta(restrizioni) {
        const r = restrizioni && restrizioni.pokemon && restrizioni.pokemon.nature;
        if (r && r.mode === 'SPECIFIC' && (!r.operator || r.operator === 'equals') && r.value) return String(r.value);
        return null;
    }

    // =================================================
    // TIER E VALORE DEI POKÉMON
    // =================================================
    const PUNTI_TIER = {
        AG: 9, UBER: 8, DUBER: 8, OU: 7, DOU: 7, UUBL: 6, DBL: 6, UU: 5, DUU: 5, RUBL: 4, RU: 4, NUBL: 3, NU: 3,
        PUBL: 2, PU: 2, ZUBL: 1, ZU: 1, NFE: 0, LC: 0
    };
    function puntiTier(tier) {
        const t = String(tier || '').replace(/[()]/g, '').toUpperCase().trim();
        return t in PUNTI_TIER ? PUNTI_TIER[t] : 0;
    }
    // Quanto vale una specie per ordinare i candidati: i punti del tier (del doppio o del singolo) più le statistiche
    function valoreSpecie(specie, ctx) {
        return puntiTier(ctx.doppio ? specie.doublesTier : specie.tier) * 18 + (specie.bst || 0) / 12;
    }
    // =================================================
    // ANALISI DI UN POKÉMON DEL POOL
    // =================================================
    function nomeBase(specie) {
        // le forme "solo in battaglia" (Mega) entrano nel team col nome della specie base
        const b = specie.battleOnly;
        return Array.isArray(b) ? b[0] : (typeof b === 'string' ? b : specie.name);
    }

    async function mosseApprese(dex, specie, gen) {
        const catena = [];
        let s = specie;
        const viste = new Set();
        while (s && s.exists && !viste.has(s.id)) {
            viste.add(s.id);
            catena.push(s);
            s = s.prevo ? dex.species.get(s.prevo) : null;
        }
        // le mosse sono retroattive: valgono le fonti di ogni generazione fino a quella del formato (anche in quelli "within")
        const raccogli = async () => {
            const out = new Set(), conCova = new Set(), senzaCova = new Set();
            for (const sp of catena) {
                // le forme che si assumono in battaglia o con uno strumento (Rotom-Wash e le altre cinque, Necrozma Criniera del Vespro, Zacian e Zamazenta Eroi Coronati) hanno nel Dex
                // solo una mossa propria (Hydro Pump, Behemoth Blade...): le altre sono quelle della forma da cui cambiano (`changesFrom`), come fa il validatore. Prima non ne avevano nessuna
                // e restavano fuori da ogni team (Rotom-Wash è tra i migliori dell'OU dalla 4ª generazione)
                const sorgenti = [sp];
                if (sp.changesFrom) sorgenti.push(dex.species.get(sp.changesFrom));
                for (const sorgente of sorgenti) {
                    let dati = await dex.learnsets.get(sorgente.id);
                    if ((!dati || !dati.learnset) && sorgente.baseSpecies && sorgente.baseSpecies !== sorgente.name) dati = await dex.learnsets.get(id(sorgente.baseSpecies));
                    if (!dati || !dati.learnset) continue;
                    for (const [mossa, fonti] of Object.entries(dati.learnset)) {
                        for (const src of fonti) {
                            const g = parseInt(src, 10);
                            const via = src.charAt(1);
                            if (g > gen) continue;
                            // livello, MT e tutor; dalla 6ª generazione anche le mosse di cova (E): ognuno le eredita liberamente. Senza, Colpo Fortunato mancava a Incineroar, Rillaboom, Sneasler...
                            // (ci arrivano dalla cova dello stadio precedente) e i team della CPU avevano pochissimo del gioco in doppio
                            // R = la mossa che una forma ha di suo (Hydro Pump di Rotom-Wash, Behemoth Blade di Zacian Eroe Coronato, Sunsteel Strike di Necrozma Criniera del Vespro)
                            if ('MLTR'.includes(via)) { senzaCova.add(mossa); out.add(mossa); }
                            else if (via === 'E' && gen >= 6) { conCova.add(mossa); out.add(mossa); }
                        }
                    }
                }
            }
            // quelle che si hanno solo per cova: una cova recente non si può avere insieme a certe mosse di generazioni vecchie (vedi correggiUova)
            out.soloUova = new Set([...conCova].filter(m => !senzaCova.has(m)));
            return out;
        };
        return raccogli();
    }

    // Quanto vale Parting Shot come perno (come un U-turn da 70 di potenza: non è un attacco ma abbassa Attacco e Att. Sp. del bersaglio e fa cambiare)
    const VALORE_PARTING_SHOT = 70;
    // Una mossa di attacco vale quanto potenza x precisione x STAB, corretta dalla categoria
    function valoreAttacco(m, cand, ctx) {
        const off = m.categoria === 'Physical' ? cand.basi.atk : cand.basi.spa;
        const migliore = Math.max(cand.basi.atk, cand.basi.spa);
        const rapporto = migliore ? off / migliore : 1;
        let v = m.potenza * (m.precisione / 100) * (cand.tipiBase.includes(m.tipo) ? 1.5 : 1) * rapporto * rapporto;
        if (m.priorita > 0) v *= 1.15;
        if (m.rinculo) v *= 0.9;
        if (m.boostSelf && Object.values(m.boostSelf).some(x => x < 0)) v *= 0.85;
        if (m.id === 'fakeout' || m.id === 'firstimpression') v = Math.min(v, 40);
        if (ctx.doppio) {
            if (m.target === 'allAdjacent') v *= 0.85;          // colpisce anche l'alleato
            else if (m.target === 'allAdjacentFoes') v *= 1.15;
        }
        return v;
    }

    // Ciò che di solito si gioca su un Pokémon (mosse, strumenti, abilità; id, dalla più consigliata) dai dati di consigli.js
    function consigliDi(dati, cand, ctx) {
        if (!dati || !Consigli) return { mosse: [], oggetti: [], abilita: [], spread: [] };
        return Consigli.per(dati, cand.id, { doppio: ctx.doppio, baseId: id(cand.base.baseSpecies || cand.base.name) });
    }

    // Hidden Power con il tipo (3ª-7ª generazione). Nel Dex i Pokémon imparano "Hidden Power" (Normale, 60) e basta: "Hidden Power Fire" è una mossa a parte che nessuno ha tra quelle che
    // impara. Si aggiunge ai suoi attacchi, per i tipi che i consigli indicano (non per tutti i diciassette), così partecipa alla scelta della copertura come un attacco qualunque
    function tipiHiddenPower(c, dex, ctx, mosseBandite, restrizioni) {
        if (!c.haHP || !c.cons) return;
        let nuovi = 0;
        for (const k of c.cons.mosse) {
            if (!/^hiddenpower[a-z]+$/.test(k) || c.mosseDa.has(k)) continue;
            const d0 = K.descriviMossa(dex, k);
            if (!d0 || !(d0.potenza > 0) || d0.tipo === 'Normal' || !K.mossaUsabile(dex, k)) continue;
            // nel Dex tutte le Hidden Power con il tipo hanno id "hiddenpower": qui ognuna ha il suo ("hiddenpowerfire"), con il nome per il testo del set ("Hidden Power Fire")
            const d = Object.assign({}, d0, { id: k });
            if (c.tipiBase.includes(d.tipo) || mosseBandite(d.nome) || !mossaAmmessa(dex, d, restrizioni)) continue;
            c.mosseDa.set(d.id, d);
            c.mosse.push(d);
            c.attacchi.push({ m: d, v: valoreAttacco(d, c, ctx) });
            nuovi++;
        }
        if (nuovi) {
            c.attacchi.sort((x, y) => y.v - x.v);
            c.tipiAttacco = Array.from(new Set(c.attacchi.slice(0, 5).filter(a => a.v >= 40).map(a => a.m.tipo)));
        }
    }

    async function analizza(dex, validatore, voce, ctx, restrizioni, mosseBandite, abilitaBandite, pokedexBase) {
        const specie = dex.species.get(voce.id);
        if (!specie.exists || specie.isNonstandard === 'CAP') return null;
        const isMega = !!specie.isMega;
        if (isMega && !ctx.meccaniche) return null;
        if (specie.isPrimal) return null;
        const richiesto = specie.requiredItem || (specie.requiredItems && specie.requiredItems[0]) || null;
        if (specie.battleOnly && !isMega && !richiesto) return null;

        const base = isMega ? dex.species.get(nomeBase(specie)) : specie;
        if (!base.exists) return null;
        // lo strumento obbligato (pietra, maschera, sfera...) deve rispettare le restrizioni sugli strumenti del formato
        if (richiesto && !strumentoAmmesso(dex.items.get(richiesto), restrizioni)) return null;
        if (ctx.standard && pokedexBase) {
            const dett = pokedexBase[id(voce.id)] || pokedexBase[id(base.baseSpecies)];
            if (dett && (dett.is_mythical === true || String(dett.is_mythical) === 'true')) return null;
        }

        const apprese = await mosseApprese(dex, base, ctx.gen);
        const mosse = [];
        for (const nome of apprese) {
            const m = K.descriviMossa(dex, nome);
            if (!m || !K.mossaUsabile(dex, m.id)) continue;
            if (mosseBandite(m.nome)) continue;
            if (!mossaAmmessa(dex, m, restrizioni)) continue;
            if (dex.moves.get(m.id).gen > ctx.gen) continue;
            // 'Past' = tolta dal gioco di quella generazione (Wake-Up Slap in Gen 8 e 9, Fishious Rend in Gen 9): con le fonti retroattive non basta più la generazione
            // della fonte. Vale nei formati "within"; in quelli "up to" le mosse delle generazioni passate sono ammesse, come i Pokémon che le imparano (Dracovish).
            const nonStandard = dex.moves.get(m.id).isNonstandard;
            if (nonStandard && (ctx.within || nonStandard !== 'Past')) continue;
            // la mossa deve essere davvero legale per questa specie nella generazione
            const problema = validatore ? validatore.checkCanLearn(dex.moves.get(m.id), base, validatore.allSources(base), { species: base.name, moves: [m.nome], level: ctx.livello }) : null;
            if (problema) continue;
            mosse.push(m);
        }

        // Hidden Power: fino alla 5ª generazione nel Dex ha potenza 0 (dipende dagli IV) e non passa per "usabile"; qui si ricorda solo se il Pokémon la impara (legale per questa generazione),
        // poi tipiHiddenPower aggiunge le versioni con il tipo che i consigli indicano
        let haHP = false;
        if (ctx.gen >= 3 && ctx.gen <= 7 && apprese.has('hiddenpower') && !mosseBandite('Hidden Power')) {
            const mHP = dex.moves.get('hiddenpower');
            haHP = mHP.exists && !(validatore && validatore.checkCanLearn(mHP, base, validatore.allSources(base), { species: base.name, moves: ['Hidden Power'], level: ctx.livello }));
        }

        const abilita = Object.values(base.abilities || {}).filter(a => a && !abilitaBandite(a) && !K.ABILITA_SCARTATE.has(id(a)));
        if (ctx.gen >= 3 && !abilita.length) return null;

        const cand = {
            id: voce.id, nome: base.name, specie, base, isMega, richiesto,
            tipiBase: base.types.slice(), tipi: specie.types.slice(), basi: specie.baseStats, bst: specie.bst || 0,
            tier: ctx.doppio ? specie.doublesTier : specie.tier, abilita, mosse, haHP,
            mosseDa: new Map(mosse.map(m => [m.id, m])), soloUova: apprese.soloUova || new Set()
        };
        cand.basi = { hp: specie.baseStats.hp, atk: specie.baseStats.atk, def: specie.baseStats.def, spa: specie.baseStats.spa, spd: specie.baseStats.spd, spe: specie.baseStats.spe };
        cand.valore = valoreSpecie(specie, ctx);

        // Explosion e simili (chi le usa cade) e l'Hidden Power senza tipo (Normale da 60) non sono attacchi comuni: Explosion si porta solo dove i consigli la vogliono (assegnaUtili),
        // l'Hidden Power solo con il suo tipo (tipiHiddenPower)
        const attacchi = mosse.filter(m => m.categoria !== 'Status' && m.potenza > 0 && m.id !== 'fakeout' && m.id !== 'firstimpression' && !m.perno && !m.autoKo && m.id !== 'hiddenpower')
            .map(m => ({ m, v: valoreAttacco(m, cand, ctx) })).sort((a, b) => b.v - a.v);
        // i perni: gli attacchi che fanno uscire chi li usa (U-turn, Volt Switch, Flip Turn) e Parting Shot, che non fa danno ma abbassa Attacco e Att. Sp. del bersaglio
        // prima di cambiare (il pivot di Incineroar e Grimmsnarl): vale come un U-turn da 70 di potenza
        const perni = mosse.filter(m => m.perno && (m.categoria !== 'Status' || m.id === 'partingshot'))
            .map(m => ({ m, v: m.categoria === 'Status' ? VALORE_PARTING_SHOT : valoreAttacco(m, cand, ctx) })).sort((a, b) => b.v - a.v);
        cand.attacchi = attacchi;
        cand.perni = perni;
        // le mosse d'attacco prioritarie (Fake Out e Prima Impressione sono già un ruolo a parte; fuori dagli attacchi anche le mosse che non fanno danno vero)
        cand.prioritarie = attacchi.filter(a => a.m.priorita > 0 && a.m.potenza >= 30 && !a.m.ricarica && !a.m.dueTurni);
        cand.tipiAttacco = Array.from(new Set(attacchi.slice(0, 5).filter(a => a.v >= 40).map(a => a.m.tipo)));
        const ha = k => cand.mosseDa.has(k);
        cand.opz = {
            protezione: mosse.find(m => m.protezione) || null,
            fakeout: ha('fakeout'), tailwind: ha('tailwind'), trickroom: ha('trickroom'), helpinghand: ha('helpinghand'),
            redirezione: mosse.find(m => m.redirezione) || null,
            schermi: ['reflect', 'lightscreen'].every(ha) || (ha('auroraveil')),
            paralisi: ['thunderwave', 'glare', 'nuzzle'].find(ha) || null,
            scottatura: ha('willowisp'), sonno: ['spore', 'sleeppowder'].find(ha) || null, tossina: ha('toxic'),
            taunt: ha('taunt'), rallenta: ['icywind', 'electroweb', 'bulldoze', 'rocktomb', 'snarl'].find(ha) || null,
            roccia: ha('stealthrock'), spuntoni: ha('spikes'), recupero: mosse.find(m => m.recupero) || null,
            setup: mosse.filter(m => m.potenziamento),
            meteoMossa: { rain: ha('raindance'), sun: ha('sunnyday'), sand: ha('sandstorm'), snow: ha('snowscape') || ha('hail') },
            pivot: perni.length ? perni[0].m : null, wideguard: ha('wideguard'), aurora: ha('auroraveil'), leechseed: ha('leechseed')
        };
        cand.supporto = !!(cand.opz.fakeout || cand.opz.tailwind || cand.opz.trickroom || cand.opz.redirezione || cand.opz.helpinghand || cand.opz.schermi);
        cand.offesa = Math.max(cand.basi.atk, cand.basi.spa);
        cand.robustezza = cand.basi.hp * (cand.basi.def + cand.basi.spd) / 100;
        cand.lento = cand.basi.spe <= 60;
        cand.veloce = cand.basi.spe >= 95;
        if (attacchi.length < (ctx.doppio ? 1 : 2) && !cand.supporto) return null;
        return cand;
    }

    // =================================================
    // SINERGIE DI SQUADRA
    // =================================================
    // Chi mette il meteo, chi ne approfitta e il tipo rafforzato: la conoscenza è condivisa con l'IA (cpu-conoscenza.js),
    // qui con i nomi dei piani (pioggia, sole, sabbia, neve)
    const SETTER = {}, SFRUTTATORI = {}, TIPO_METEO = {};
    Object.keys(K.PIANO_METEO).forEach(piano => {
        const w = K.PIANO_METEO[piano];
        SETTER[piano] = K.METEO_SETTER[w]; SFRUTTATORI[piano] = K.METEO_SFRUTTATORI[w]; TIPO_METEO[piano] = K.METEO_TIPO[w];
    });

    function abilitaPossibili(cand) { return cand.abilita.map(id); }
    // tutte le abilità che mettono un meteo (qualunque): chi le ha prepara il campo
    const SETTER_QUALUNQUE = new Set(Object.values(SETTER).flat());

    // Debolezze e resistenze dei membri (per attacco di ciascun tipo)
    function tabellaTipi(dex, membri, tipi) {
        const out = {};
        for (const t of tipi) {
            let deboli = 0, resistenti = 0;
            for (const c of membri) {
                const m = K.moltiplicatoreTipo(dex, t, c.tipi);
                if (m > 1) deboli += m >= 4 ? 2 : 1;
                else if (m < 1) resistenti++;
            }
            out[t] = { deboli, resistenti };
        }
        return out;
    }

    function punteggio(dex, membri, piano, ctx, tipi) {
        if (!membri.length) return 0;
        let s = 0;
        for (const c of membri) s += c.valore * 0.06 * (piano.pesoValore || 1);

        // copertura offensiva: quanti tipi si colpiscono super efficaci
        const coperti = new Set();
        for (const c of membri) for (const t of c.tipiAttacco) {
            for (const dif of tipi) if (K.moltiplicatoreTipo(dex, t, [dif]) > 1) coperti.add(dif);
        }
        s += (coperti.size / tipi.length) * 3.2;

        // difesa: nessuna debolezza condivisa da molti (in Anything Goose conta la metà: si vince colpendo per primi)
        const tab = tabellaTipi(dex, membri, tipi);
        const pesoDifesa = ctx.goose ? 0.5 : 1;
        for (const t of tipi) {
            const { deboli, resistenti } = tab[t];
            const eccesso = deboli - resistenti - 1;
            if (eccesso > 0) s -= eccesso * 0.7 * pesoDifesa;
            if (deboli >= 3 && resistenti === 0) s -= 1.2 * pesoDifesa;
        }
        // tipi ripetuti
        const conteggio = {};
        for (const c of membri) for (const t of c.tipiBase) conteggio[t] = (conteggio[t] || 0) + 1;
        for (const t in conteggio) if (conteggio[t] > 2) s -= (conteggio[t] - 2) * 0.9;

        const ab = membri.map(abilitaPossibili);
        const ha = f => membri.some(f);
        if (ctx.doppio) {
            const parQ = ctx.parametriTeam || PARAMETRI_TEAM;
            if (ha(c => c.opz.fakeout)) s += parQ.bonusFakeOut;
            if (ha(c => c.opz.tailwind || c.opz.trickroom)) s += 1.1;
            if (membri.filter(c => c.opz.tailwind || c.opz.trickroom || c.opz.rallenta || c.opz.paralisi).length >= 2) s += 0.5;
            if (ha(c => c.opz.redirezione)) s += parQ.bonusRedirezione;
            // uno stato (paralisi, scottatura, sonno) da dare a chi minaccia di più: lo porta chi non ha troppo da attaccare
            if (parQ.bonusStato > 0 && ha(c => (c.opz.paralisi || c.opz.scottatura || c.opz.sonno) && c.offesa < parQ.offesaMaxStato)) s += parQ.bonusStato;
            if (parQ.bonusIntimidazione > 0 && ab.some(l => l.includes('intimidate'))) s += parQ.bonusIntimidazione;
            if (ha(c => c.opz.protezione)) s += 0.4;
            if (membri.filter(c => c.supporto).length > 3) s -= (membri.filter(c => c.supporto).length - 3) * 1.1;
            if (ha(c => c.opz.helpinghand)) s += 0.2;
            const parP = ctx.parametriTeam || PARAMETRI_TEAM;
            if (ha(c => c.opz.pivot && c.perni[0] && c.perni[0].v >= parP.sogliaPerno && c.offesa >= 70)) s += parP.bonusPerno || 0;
        } else {
            if (ha(c => c.opz.roccia || c.opz.spuntoni)) s += 0.9;
            if (ha(c => c.opz.recupero && c.robustezza > 70)) s += 0.6;
            if (ha(c => c.opz.pivot)) s += 0.4;
            if (ha(c => c.opz.setup.length && c.veloce)) s += 0.6;
            if (ha(c => c.opz.sonno || c.opz.paralisi || c.opz.scottatura)) s += 0.3;
            if (membri.filter(c => c.veloce).length >= 2) s += 0.4;
        }
        // la personalità del team (cpu-personalita.js): ogni Pokémon con un ruolo di quello stile vale un po' (fino a quattro), così il team nasce intorno a quello
        const parS = ctx.parametriTeam || PARAMETRI_TEAM;
        const quanti = (peso, f, massimo = 4) => (peso > 0 ? peso * Math.min(massimo, membri.filter(f).length) : 0);
        s += quanti(parS.pesoVelocita, c => c.opz.tailwind || c.opz.trickroom || c.opz.rallenta === 'icywind' || c.opz.rallenta === 'electroweb' || c.opz.paralisi);
        s += quanti(parS.pesoCampo, c => c.opz.schermi || c.opz.helpinghand || c.opz.redirezione || c.opz.roccia || c.opz.spuntoni || c.opz.wideguard || c.opz.aurora
            || (SETTER_QUALUNQUE.size && abilitaPossibili(c).some(a => SETTER_QUALUNQUE.has(a))));
        s += quanti(parS.pesoStato, c => (c.opz.paralisi || c.opz.scottatura || c.opz.sonno || c.opz.tossina) && c.offesa < parS.offesaMaxStato, 3);
        s += quanti(parS.pesoPerno, c => c.opz.pivot && c.perni[0] && c.perni[0].v >= parS.sogliaPerno && c.offesa >= 70, 3);
        // almeno un Pokémon che attacca davvero col tipo giusto: evita squadre di soli supporti
        s += Math.min(membri.filter(c => c.offesa >= 100).length, 3) * 0.5;
        // Anything Goose: team molto offensivi. Contano la potenza (attacco o attacco speciale) e la velocità di ognuno,
        // fino a sei Pokémon; i supporti (Fake Out, Tailwind, schermi...) valgono molto meno
        if (ctx.goose) {
            for (const c of membri) {
                s += Math.max(0, Math.min((c.offesa - 90) / 40, 1.6)) * 0.9 + Math.max(0, Math.min((c.basi.spe - 80) / 60, 1)) * 0.5;
            }
            s -= membri.filter(c => c.supporto).length * 0.5;
        }

        // piano della squadra
        const p = piano.nome;
        if (SETTER[p]) {
            const setter = ab.some(l => SETTER[p].some(x => l.includes(x)));
            const sfrutt = ab.filter(l => SFRUTTATORI[p].some(x => l.includes(x))).length +
                membri.filter(c => c.tipiBase.includes(TIPO_METEO[p])).length * 0.5;
            if (setter) s += 1.6 + Math.min(sfrutt, 3) * 0.7; else s -= 1.5;
        } else if (p === 'trickroom') {
            // chi mette la Stanza Magica conta: uno lento (che ci resta dentro) vale molto più di uno veloce che la sfrutterebbe male
            if (ha(c => c.opz.trickroom)) s += 1.0 + (ha(c => c.opz.trickroom && c.basi.spe <= 80) ? 0.8 : 0); else s -= 1.8;
            s += membri.filter(c => c.lento && c.offesa >= 95).length * 0.8;
            s -= membri.filter(c => c.veloce).length * 0.7;
        } else if (p === 'tailwind') {
            if (ha(c => c.opz.tailwind)) s += 1.6; else s -= 1.8;
            s += membri.filter(c => c.veloce).length * 0.3;
        } else if (p === 'offensivo') {
            s += membri.filter(c => c.offesa >= 110).length * 0.5 + membri.filter(c => c.veloce).length * 0.4;
        } else if (p === 'bulky') {
            s += membri.filter(c => c.robustezza >= 75).length * 0.6;
        }
        // chi ha una buona mossa prioritaria (finisce i Pokémon quasi KO e batte la velocità): il primo vale, il secondo molto meno
        const parT = ctx.parametriTeam || PARAMETRI_TEAM;
        const conPriorita = membri.filter(c => c.prioritarie && c.prioritarie[0] && c.prioritarie[0].v >= parT.sogliaPriorita && c.offesa >= 75).length;
        if (conPriorita) s += parT.bonusPriorita * (1 + Math.min(1, conPriorita - 1) * 0.4);
        return s;
    }

    // =================================================
    // SET DI UN POKÉMON
    // =================================================
    function mosseDelSet(cand, ruolo, ctx, piano) {
        const scelte = [];
        // una sola Hidden Power per Pokémon (ha un tipo solo)
        const eHP = m => /^hiddenpower[a-z]+$/.test(m.id);
        const giaPresa = m => scelte.some(x => x.id === m.id) || (eHP(m) && scelte.some(eHP));
        const aggiungi = m => { if (m && !giaPresa(m) && scelte.length < 4) scelte.push(m); };
        const get = k => cand.mosseDa.get(k) || null;
        const o = cand.opz;
        // le mosse consigliate che la CPU può davvero usare (legali, ammesse dal formato, che sa giocare), dalla più consigliata
        const consigliate = ((cand.cons && cand.cons.mosse) || []).map(k => cand.mosseDa.get(k)).filter(Boolean);
        const posCons = new Map(consigliate.map((m, k) => [m.id, k]));
        // le mosse che la lega gioca su questo Pokémon (meta-lega.js), se ci sono i dati: quota dei suoi set che le hanno
        const pesoMeta = (ctx.parametriTeam || PARAMETRI_TEAM).pesoMossaMeta;
        const quotaMeta = m => (cand.metaMosse && cand.metaMosse[m.id]) || 0;
        // Hidden Power ha 60 di potenza: i consigli la mettono in alto perché in quei set serve alla copertura, ma una CPU che la sceglie al posto di un attacco da 90 perde (Gen 7: -4,5 punti);
        // il suo peso nei consigli si scala con `bonusHiddenPower`
        const pesoHP = (ctx.parametriTeam || PARAMETRI_TEAM).bonusHiddenPower;
        const bonusCons = m => ((posCons.has(m.id) ? Math.max(0.3, 0.9 - posCons.get(m.id) * 0.06) : 0) + pesoMeta * quotaMeta(m)) * (eHP(m) ? pesoHP : 1);
        // il pivot del set: tra quelli che il Pokémon ha, il più consigliato (Parting Shot per Incineroar, non U-turn); senza consigli, il più forte
        const pivotDelSet = () => {
            const consigliato = cand.perni.filter(p => posCons.has(p.m.id)).sort((a, b) => posCons.get(a.m.id) - posCons.get(b.m.id))[0];
            return consigliato ? consigliato.m : o.pivot;
        };

        if (ctx.doppio) {
            // Le mosse di supporto non possono riempire tutti e quattro gli slot: almeno un attacco resta sempre (altrimenti, con gli schermi già su e la
            // Stanza Magica già messa, il Pokémon non ha niente di utile da fare e perde i turni). Il supporto si aggiunge in ordine di importanza.
            const attaccoRiservato = cand.attacchi.length ? 1 : 0;
            const supporto = m => { if (m && scelte.length < 4 - attaccoRiservato) aggiungi(m); };
            // Anything Goose: solo chi ha un ruolo di supporto si protegge, gli altri attaccano con tutte e quattro le mosse
            if (!(ctx.goose && !ruolo.supporto) && !ruolo.senzaProt) supporto(o.protezione);
            if (ruolo.fakeout) supporto(get('fakeout'));
            if (ruolo.velocita === 'tailwind') supporto(get('tailwind'));
            if (ruolo.velocita === 'trickroom') supporto(get('trickroom'));
            if (ruolo.redirezione) supporto(o.redirezione);
            if (ruolo.schermi) { if (piano.nome === 'neve') supporto(get('auroraveil')); supporto(get('reflect')); supporto(get('lightscreen')); }
            if (ruolo.aiuto) supporto(get('helpinghand'));
            // la mossa prioritaria è un attacco: viene prima delle mosse di supporto "in più" (rallentare, uno stato, il pivot), che altrimenti la lasciano fuori dal set
            if (ruolo.priorita) aggiungi(ruolo.priorita);
            if (ruolo.rallenta) supporto(get(o.rallenta));
            if (ruolo.stato) supporto((ruolo.statoMossa && get(ruolo.statoMossa)) || get(o.paralisi) || get(o.sonno) || get('willowisp'));
            if (ruolo.perno) supporto(pivotDelSet());
            if (ruolo.meteoMossa) supporto(get(ruolo.meteoMossa));
            for (const m of ruolo.utili || []) supporto(m);
        } else {
            if (ruolo.trappola) aggiungi(get(o.roccia ? 'stealthrock' : 'spikes'));
            if (ruolo.recupero) aggiungi(o.recupero);
            if (ruolo.setup) aggiungi(ruolo.setup);
            if (ruolo.stato) aggiungi(get(o.sonno) || get(o.paralisi) || get('willowisp') || get('toxic'));
            if (ruolo.perno) aggiungi(pivotDelSet());
            if (ruolo.meteoMossa) aggiungi(get(ruolo.meteoMossa));
            for (const m of ruolo.utili || []) aggiungi(m);
        }

        // attacchi: i due migliori STAB, poi copertura sui tipi che ancora non si colpiscono bene
        const coperti = new Set();
        const copre = m => { for (const t of K.TIPI) if (K.moltiplicatoreTipo(ruolo.dex, m.tipo, [t]) > 1) coperti.add(t); };
        scelte.filter(m => m.categoria !== 'Status').forEach(copre);
        const liberi = 4 - scelte.length;
        const daFare = Math.max(ruolo.attacchi != null ? ruolo.attacchi : liberi, 0);
        let usabili = cand.attacchi.filter(a => a.m.categoria !== 'Status');
        let preferita = cand.basi.atk >= cand.basi.spa ? 'Physical' : 'Special';
        // chi porta Swords Dance, Bulk Up (Attacco) o Nasty Plot, Calm Mind (Att. Sp.) attacca con quella statistica: senza questo Iron Valiant (Attacco e Att. Sp. pari) aveva Swords Dance
        // con Moonblast e Thunderbolt, gli EV sull'Att. Sp. e il potenziamento sprecato (60 mosse su 389 del singolo)
        const pot = ruolo.setup && ruolo.setup.potenziamento;
        const orient = pot ? ((pot.atk || 0) > 0 && !((pot.spa || 0) > 0) ? 'Physical' : (pot.spa || 0) > 0 && !((pot.atk || 0) > 0) ? 'Special' : null) : null;
        if (orient && (ctx.parametriTeam || PARAMETRI_TEAM).coerenzaOffensiva > 0) {
            const coerenti = usabili.filter(a => a.m.categoria === orient);
            if (coerenti.length >= 2) { usabili = coerenti; preferita = orient; }
        }
        let presi = ruolo.priorita && scelte.some(m => m.id === ruolo.priorita.id) ? 1 : 0;      // la mossa prioritaria è già un attacco
        // STAB: il migliore per ogni tipo (il valore tiene già conto della categoria)
        for (const t of cand.tipiBase) {
            if (presi >= daFare || scelte.length >= 4) break;
            const dellTipo = usabili.filter(x => x.m.tipo === t && !giaPresa(x.m));
            // tra gli attacchi di quel tipo vince quello consigliato, se non è molto più debole del migliore
            const chiave = x => (posCons.has(x.m.id) ? posCons.get(x.m.id) : 30 - quotaMeta(x.m) * 30);       // prima i consigliati, poi quelli della lega
            const consigliato = dellTipo.filter(x => (posCons.has(x.m.id) || quotaMeta(x.m) >= 0.4) && dellTipo[0] && x.v >= dellTipo[0].v * 0.6)
                .sort((x, y) => chiave(x) - chiave(y))[0];
            const a = consigliato || dellTipo[0];
            if (a && a.v >= 55) { aggiungi(a.m); copre(a.m); presi++; }
        }
        // copertura: si cercano tipi nuovi; due mosse dello stesso tipo valgono molto meno
        while (presi < daFare && scelte.length < 4) {
            let migliore = null, mv = -1;
            const tipiScelti = new Set(scelte.filter(m => m.categoria !== 'Status').map(m => m.tipo));
            for (const a of usabili) {
                if (giaPresa(a.m)) continue;
                if (a.m.categoria !== preferita && cand.offesa > 0 && (a.m.categoria === 'Physical' ? cand.basi.atk : cand.basi.spa) < cand.offesa * 0.8) continue;
                let nuovi = 0;
                for (const t of K.TIPI) if (!coperti.has(t) && K.moltiplicatoreTipo(ruolo.dex, a.m.tipo, [t]) > 1) nuovi++;
                let v = a.v * (1 + nuovi * 0.18) * (1 + bonusCons(a.m));
                if (tipiScelti.has(a.m.tipo)) v *= 0.4;
                if (v > mv) { mv = v; migliore = a; }
            }
            if (!migliore) break;
            aggiungi(migliore.m); copre(migliore.m); presi++;
        }
        // se mancano mosse: prima le consigliate che attaccano (o potenziano chi attacca), poi qualunque attacco, poi qualunque mossa utile
        // (le mosse di utilità, Explosion e Hidden Power senza tipo non riempiono i posti rimasti: le porta solo chi le ha avute dai ruoli)
        const daRuolo = m => !!(m.utile || m.curaAltri > 0 || m.boostAlleato || m.autoKo || m.id === 'hiddenpower');
        for (const m of consigliate) {
            if (scelte.length >= 4) break;
            if (m.categoria !== 'Status' && !m.perno && !daRuolo(m)) aggiungi(m);
        }
        for (const a of cand.attacchi) { if (scelte.length >= 4) break; aggiungi(a.m); }
        for (const a of cand.perni) { if (scelte.length >= 4) break; aggiungi(a.m); }
        for (const m of cand.mosse) { if (scelte.length >= 4) break; if (m.categoria === 'Status' && !daRuolo(m)) aggiungi(m); }
        return scelte;
    }

    // Quanti attacchi e di che tipo servono nel set, dato il ruolo
    function ruoloDi(cand, ctx, piano, assegnati) {
        const r = { dex: assegnati.dex };
        if (ctx.doppio) {
            r.fakeout = assegnati.fakeout === cand.id;
            r.velocita = assegnati.velocita[cand.id] || null;
            r.redirezione = assegnati.redirezione === cand.id;
            r.schermi = assegnati.schermi === cand.id;
            r.aiuto = assegnati.aiuto.includes(cand.id);
            r.rallenta = assegnati.rallenta.includes(cand.id);
            r.stato = assegnati.stato.includes(cand.id);
            r.statoMossa = (assegnati.statoMossa || {})[cand.id] || null;
            r.priorita = (assegnati.priorita || {})[cand.id] || null;
            r.senzaProt = (assegnati.senzaProt || []).includes(cand.id);
            r.perno = (assegnati.perni || []).includes(cand.id);
            r.utili = (assegnati.utili || {})[cand.id] || [];
            r.meteoMossa = (assegnati.meteoMossa || {})[cand.id] || null;
            // il pivot è un attacco che fa anche cambiare: ma occupa un posto che altrimenti sarebbe di un altro attacco
            const nSupp = [r.fakeout, r.velocita, r.redirezione, r.schermi, r.aiuto, r.rallenta, r.stato, r.perno, r.meteoMossa].filter(Boolean).length + r.utili.length;
            // senza Protezione c'è una mossa in più per attaccare
            r.attacchi = ctx.goose ? Math.max(2, 4 - nSupp) : Math.max(1, (r.senzaProt ? 4 : 3) - nSupp);
            r.supporto = nSupp > 0;
        } else {
            r.trappola = assegnati.trappola === cand.id;
            r.recupero = assegnati.recupero.includes(cand.id);
            r.setup = assegnati.setup[cand.id] || null;
            r.stato = assegnati.stato.includes(cand.id);
            r.perno = assegnati.perno === cand.id;
            r.utili = (assegnati.utili || {})[cand.id] || [];
            r.meteoMossa = (assegnati.meteoMossa || {})[cand.id] || null;
            const nUtili = [r.trappola, r.recupero, r.setup, r.stato, r.perno, r.meteoMossa].filter(Boolean).length + r.utili.length;
            r.attacchi = Math.max(r.utili.length ? 1 : 2, 4 - nUtili);
        }
        return r;
    }

    // Le mosse di utilità (Encore, Trick, Substitute, Rest e Sleep Talk, Wish, Baton Pass, Explosion, Heal Pulse, Coaching): il cervello le sa giocare (cpu-ia.js), ma un Pokémon le porta
    // solo dove i consigli (le prime `utiliTop` mosse consigliate) le hanno, con la probabilità della loro manopola e nei limiti di quante ne vuole un team. Ogni classe: il nome della
    // manopola, le mosse (in ordine di preferenza), quante per team al massimo, in che stile di partita.
    const CLASSI_UTILI = [
        { k: 'Encore', mosse: ['encore'], max: 2 },
        { k: 'Trick', mosse: ['trick', 'switcheroo'], max: 1, scelta: true },
        { k: 'Sostituto', mosse: ['substitute'], max: 2 },
        { k: 'Riposo', mosse: ['rest'], max: 2, con: 'sleeptalk' },
        { k: 'Desiderio', mosse: ['wish'], max: 2 },
        { k: 'PassaBoost', mosse: ['batonpass'], max: 1, singolo: true, setup: true },
        { k: 'Esplosione', mosse: ['explosion', 'selfdestruct', 'mistyexplosion'], max: 1, tetto: 'maxEsplosione' },
        { k: 'Cura', mosse: ['healpulse', 'floralhealing'], max: 1, doppio: true },
        { k: 'Coaching', mosse: ['coaching'], max: 1, doppio: true }
    ];
    function assegnaUtili(membri, ctx, a, rnd, par) {
        const out = {};
        // niente nei formati a livello 5 (Little Cup): Trick, l'unica che lì compare, perde (41% su 98 coppie) e i consigli di quei formati vengono da altre partite
        if (ctx.goose || ctx.livello <= 10 || !(par.maxUtili > 0)) return out;
        const top = par.utiliTop || 4;
        // quante mosse hanno già per ruolo (così resta sempre almeno un attacco)
        const occupate = c => {
            if (ctx.doppio) {
                return [c.id === a.fakeout, !!a.velocita[c.id], c.id === a.redirezione, c.id === a.schermi, a.aiuto.includes(c.id), a.rallenta.includes(c.id), a.stato.includes(c.id), (a.perni || []).includes(c.id),
                    !(a.senzaProt || []).includes(c.id) && !(ctx.goose)].filter(Boolean).length;
            }
            return [a.trappola === c.id, a.recupero.includes(c.id), !!a.setup[c.id], a.stato.includes(c.id), a.perno === c.id].filter(Boolean).length;
        };
        const proposte = [];
        for (const c of membri) {
            const mosseConsigliate = (c.cons && c.cons.mosse) || [];
            for (const classe of CLASSI_UTILI) {
                if (par['prob' + classe.k] <= 0) continue;
                if (classe.doppio && !ctx.doppio) continue;
                if (classe.singolo && ctx.doppio) continue;
                // la mossa consigliata più in alto tra quelle della classe che il Pokémon ha davvero
                let pos = -1, mossa = null;
                for (const k of classe.mosse) {
                    const i = mosseConsigliate.indexOf(k);
                    if (i >= 0 && i < top && c.mosseDa.has(k) && (pos < 0 || i < pos)) { pos = i; mossa = c.mosseDa.get(k); }
                }
                if (!mossa) continue;
                const moves = [mossa];
                if (classe.con) {
                    // Rest va con Sleep Talk (se il Pokémon ce l'ha e i consigli la vogliono): da solo (con la Bacca Chesto) funziona lo stesso
                    const j = mosseConsigliate.indexOf(classe.con);
                    if (c.mosseDa.has(classe.con) && j >= 0 && j < top + 2) moves.push(c.mosseDa.get(classe.con));
                }
                if (classe.scelta && !(c.cons.oggetti || []).slice(0, 3).some(k => K.STRUMENTI_SCELTA.has(k))) continue;      // Trick vale con lo strumento Scelta
                if (classe.setup && !a.setup[c.id]) continue;                                                                // Baton Pass: serve qualcosa da passare
                if (classe.k === 'Riposo' && (a.recupero || []).includes(c.id)) continue;                                    // un solo modo di curarsi
                proposte.push({ c, classe, moves, pos: pos + rnd() * 1.5 });
            }
        }
        proposte.sort((x, y) => x.pos - y.pos);
        const perClasse = {}, perMembro = {};
        let totale = 0;
        for (const p of proposte) {
            if (totale >= par.maxUtili) break;
            const { c, classe, moves } = p;
            if ((perClasse[classe.k] || 0) >= Math.min(classe.max, classe.tetto ? par[classe.tetto] : 99)) continue;
            // al massimo due classi per Pokémon, e un attacco resta sempre
            const gia = perMembro[c.id] || [];
            if (gia.length >= 2 || occupate(c) + gia.reduce((s, q) => s + q.length, 0) + moves.length > 3) continue;
            if (rnd() >= par['prob' + classe.k]) continue;
            perClasse[classe.k] = (perClasse[classe.k] || 0) + 1;
            perMembro[c.id] = gia.concat([moves]);
            totale++;
        }
        for (const [cid, gruppi] of Object.entries(perMembro)) out[cid] = [].concat(...gruppi);
        return out;
    }

    // Chi fa cosa: la squadra decide quale membro ha le mosse di supporto
    function assegnaRuoli(dex, membri, ctx, piano, rnd = Math.random, par = PARAMETRI_TEAM) {
        const a = { dex, fakeout: null, velocita: {}, redirezione: null, schermi: null, aiuto: [], rallenta: [], stato: [], statoMossa: {}, priorita: {}, senzaProt: [],
            trappola: null, recupero: [], setup: {}, perno: null, perni: [], meteoMossa: {} };
        const per = (lista, f) => lista.slice().sort((x, y) => f(y) - f(x));
        if (ctx.doppio) {
            const conVel = piano.nome === 'trickroom' ? membri.filter(puoMettereStanza) : membri.filter(c => c.opz.tailwind);
            const setterVel = per(conVel, c => (c.supporto ? 2 : 0) + (piano.nome === 'trickroom' ? -c.basi.spe / 100 : c.basi.spe / 100))[0] ||
                per(membri.filter(c => c.opz.tailwind || puoMettereStanza(c)), c => (c.supporto ? 2 : 0))[0];
            if (setterVel) a.velocita[setterVel.id] = (piano.nome === 'trickroom' && puoMettereStanza(setterVel)) || !setterVel.opz.tailwind ? 'trickroom' : 'tailwind';
            const fo = per(membri.filter(c => c.opz.fakeout && c.id !== (setterVel && setterVel.id)), c => (c.supporto ? 1 : 0) + (c.robustezza > 60 ? 0.3 : 0))[0] ||
                membri.find(c => c.opz.fakeout);
            if (fo) a.fakeout = fo.id;
            const red = per(membri.filter(c => c.opz.redirezione && c.id !== (fo && fo.id)), c => c.robustezza)[0];
            if (red) a.redirezione = red.id;
            // gli schermi (due mosse su quattro, più Protezione) li mette chi ha poco da attaccare, o chi li mette in priorità (Prankster)
            const sch = ctx.goose ? null : membri.find(c => c.opz.schermi && ![fo, red].some(x => x && x.id === c.id) && c.supporto &&
                (c.offesa < 105 || abilitaPossibili(c).includes('prankster')));
            if (sch) a.schermi = sch.id;
            const preso = c => c.id === a.fakeout || a.velocita[c.id] || c.id === a.redirezione || c.id === a.schermi;
            // Helping Hand: al massimo par.maxAiuto per team, e non sempre (chi ha già altro supporto ne ha meno bisogno). Lo prende chi attacca meno.
            const nSupportoPreso = membri.filter(preso).length;
            const possono = per(membri.filter(c => c.opz.helpinghand && c.supporto && !preso(c) && c.opz.helpinghand), c => -c.offesa);
            const pAiuto = par.probAiuto >= 1 ? 1 : par.probAiuto * (nSupportoPreso >= 2 ? 0.5 : nSupportoPreso === 1 ? 0.8 : 1);
            for (const c of possono) { if (a.aiuto.length >= par.maxAiuto || rnd() >= pAiuto) break; a.aiuto.push(c.id); }
            for (const c of membri) {
                if (a.aiuto.includes(c.id)) continue;
                if (ctx.goose) continue;                       // Anything Goose: niente rallentamenti e stati, si attacca
                else if (!preso(c) && (c.opz.rallenta === 'icywind' || (par.rallentaAnche > 0 && c.opz.rallenta === 'electroweb'))) a.rallenta.push(c.id);
                else if (par.maxStato <= 0 && !preso(c) && (c.opz.paralisi || c.opz.sonno) && c.offesa < 100) a.stato.push(c.id);      // com'era: solo paralisi e sonno, solo a chi attacca poco
            }
            // gli stati (Onda Tuono, Glare, Fungospora, Sonnifero, Fuocopira): un team su due o tre ne ha uno, a volte due, e li porta chi non ha troppo da attaccare e nessun altro ruolo.
            // Il sonno vale più di tutti, la scottatura è la risposta ai Pokémon fisici, la paralisi la risposta ai veloci
            if (!ctx.goose && par.maxStato > 0) {
                // chi devia gli attacchi può portare anche il sonno (Amoonguss: Furia Polvere e Fungospora): è il suo set classico
                const adatti = membri.filter(c => (!preso(c) || (c.id === a.redirezione && c.opz.sonno)) && !a.aiuto.includes(c.id) && !a.rallenta.includes(c.id) && (c.opz.paralisi || c.opz.sonno || c.opz.scottatura) && c.offesa < par.offesaMaxStato);
                const valeDi = c => (c.opz.sonno ? 2 : 0) + (c.opz.scottatura ? 1 : 0) + (c.opz.paralisi ? 1 : 0) + (c.robustezza > 60 ? 0.4 : 0) - c.offesa / 200 + rnd() * 0.8;
                for (const c of per(adatti, valeDi)) {
                    if (a.stato.length >= par.maxStato || rnd() >= par.probStato * (a.stato.length ? par.probStatoSeguenti : 1)) break;
                    a.stato.push(c.id);
                    // quale mossa: il sonno se c'è, altrimenti a sorte tra scottatura e paralisi (se le ha tutte e due)
                    const scelte = c.opz.sonno ? [c.opz.sonno] : [c.opz.scottatura ? 'willowisp' : null, c.opz.paralisi].filter(Boolean);
                    a.statoMossa[c.id] = scelte[Math.min(scelte.length - 1, Math.floor(rnd() * scelte.length))];
                }
            }
            // la mossa prioritaria: uno, spesso due Pokémon che attaccano (chi ha già un ruolo di supporto no). Vale di più per i lenti, che non muovono mai prima.
            const conPrio = per(membri.filter(c => c.prioritarie && c.prioritarie[0] && c.prioritarie[0].v >= par.sogliaPriorita && c.offesa >= 75 && !preso(c) && !a.aiuto.includes(c.id)),
                c => c.prioritarie[0].v * (c.offesa / 100) * (c.basi.spe < 70 ? 1.2 : 1));
            const quanteP = par.priorita <= 0 ? 0 : 1 + (rnd() < par.priorita - 1 ? 1 : 0);
            for (const c of conPrio.slice(0, quanteP)) a.priorita[c.id] = c.prioritarie[0].m;
            // il pivot (U-turn, Volt Switch, Flip Turn): lo porta chi attacca già e non ha troppo altro da fare; uno per team, il secondo molto più di rado
            if (!ctx.goose && par.maxPerno > 0 && par.probPerno > 0) {
                const altriRuoli = c => [c.id === a.fakeout, !!a.velocita[c.id], c.id === a.redirezione, c.id === a.schermi, a.aiuto.includes(c.id), a.rallenta.includes(c.id), a.stato.includes(c.id)].filter(Boolean).length;
                const conPerno = per(membri.filter(c => c.opz.pivot && c.perni[0] && c.perni[0].v >= par.sogliaPerno && c.offesa >= 70 && altriRuoli(c) <= 1),
                    c => c.perni[0].v * (c.offesa / 100) + rnd() * 15);
                for (const c of conPerno) {
                    if (a.perni.length >= par.maxPerno || rnd() >= par.probPerno * (a.perni.length ? 0.4 : 1)) break;
                    a.perni.push(c.id);
                }
            }
            // Protect non ce l'hanno tutti: chi attacca forte, con quattro buone mosse e senza ruoli di supporto, spesso gioca senza (Anything Goose già lo fa)
            if (!ctx.goose && par.probProtezione < 1) {
                const liberi = membri.filter(c => !preso(c) && !a.aiuto.includes(c.id) && !a.rallenta.includes(c.id) && !a.stato.includes(c.id) && c.attacchi.length >= 3 && c.offesa >= 85);
                for (const c of per(liberi, c => c.offesa + c.basi.spe / 2 + rnd() * 20)) {
                    if (a.senzaProt.length >= par.maxSenzaProt) break;
                    if (rnd() < (1 - par.probProtezione) * 2.4) a.senzaProt.push(c.id);
                }
            }
        } else {
            const mu = membri.filter(c => c.opz.roccia || c.opz.spuntoni);
            const tr = per(mu, c => c.robustezza + (c.opz.roccia ? 20 : 0))[0];
            if (tr) a.trappola = tr.id;
            for (const c of per(membri, c => c.robustezza)) {
                if (!ctx.goose && c.opz.recupero && c.robustezza > 60 && a.recupero.length < 2) a.recupero.push(c.id);
            }
            for (const c of per(membri.filter(c => c.opz.setup.length), c => c.offesa + c.basi.spe / 2)) {
                if (Object.keys(a.setup).length >= 2) break;
                if (a.recupero.includes(c.id) && c.robustezza > 90) continue;
                const fisico = c.basi.atk >= c.basi.spa;
                const buona = c.opz.setup.filter(m => {
                    const b = m.potenziamento;
                    return fisico ? ((b.atk || 0) > 0) : ((b.spa || 0) > 0);
                }).sort((x, y) => Object.values(y.potenziamento).reduce((s, v) => s + v, 0) - Object.values(x.potenziamento).reduce((s, v) => s + v, 0))[0];
                if (buona) a.setup[c.id] = buona;
            }
            for (const c of membri) {
                if (a.recupero.includes(c.id) && !a.setup[c.id] && (c.opz.sonno || c.opz.paralisi || c.opz.scottatura || c.opz.tossina)) a.stato.push(c.id);
            }
            const perno = per(membri.filter(c => c.opz.pivot && !a.setup[c.id]), c => c.basi.spe)[0];
            if (perno) a.perno = perno.id;
        }
        // le mosse di utilità si scelgono con un generatore a parte, che parte dai membri (non dal generatore del team: non ne consuma estrazioni): così due team composti con manopole
        // diverse hanno gli stessi membri e cambia solo chi porta quelle mosse (il confronto a coppie di tools/duello-cpu.cjs --gemelli), e i team senza novità restano quelli di prima
        a.utili = assegnaUtili(membri, ctx, a, creaCasuale('utili|' + membri.map(c => c.id).join('|')), par);
        // il meteo con una mossa (Rain Dance, Sunny Day, Sandstorm, Snowscape): solo se nessuno del team lo mette con l'abilità; lo porta chi regge di più tra chi la impara
        if (SETTER[piano.nome] && piano.conMosse && !membri.some(c => mettePerAbilita(piano, c))) {
            const w = METEO_DEL_PIANO[piano.nome];
            const chi = per(membri.filter(c => conMossaMeteo(piano, c)), c => c.robustezza)[0];
            if (chi) a.meteoMossa[chi.id] = w === 'rain' ? 'raindance' : w === 'sun' ? 'sunnyday' : w === 'sand' ? 'sandstorm' : (chi.opz.meteoMossa.snow && chi.mosseDa.has('snowscape') ? 'snowscape' : 'hail');
        }
        return a;
    }

    function scegliAbilita(cand, piano, ctx, ruolo) {
        if (ctx.gen < 3) return null;
        let migliore = null, mv = -99;
        for (const nome of cand.abilita) {
            const k = id(nome);
            const ab = ruolo.dex.abilities.get(nome);
            let v = ab.rating != null ? ab.rating : 0;
            // fino alla Gen 7 l'abilità nascosta toglie le mosse che si imparano solo nelle generazioni vecchie (Quagsire con Double-Edge):
            // si prende solo se serve al piano (setter del meteo) o se non ce n'è altra
            if (ctx.gen < 8 && cand.base.abilities && cand.base.abilities.H === nome && cand.abilita.length > 1 && !(SETTER[piano.nome] && SETTER[piano.nome].some(x => k.includes(x)))) v -= 20;
            if (SETTER[piano.nome] && SETTER[piano.nome].some(x => k.includes(x))) v += 9;   // chi può mettere il meteo del piano lo mette: prima di tutto il resto
            if (SFRUTTATORI[piano.nome] && SFRUTTATORI[piano.nome].includes(k)) v += 7;   // chi approfitta del meteo lo fa davvero: l'abilità del piano batte anche una più quotata
            if (k === 'intimidate' && ctx.doppio) v += 0.5;
            // quella che di solito si gioca su questo Pokémon (la più consigliata vale di più). Vale meno di ciò che serve al piano
            // (meteo: +3 chi lo mette, +2 chi ne approfitta) e, fino alla Gen 7, non si prende l'abilità nascosta: certe mosse delle
            // generazioni vecchie non si possono avere con quella
            const posizione = cand.cons ? cand.cons.abilita.indexOf(k) : -1;
            const nascosta = cand.base.abilities && cand.base.abilities.H === nome;
            if (posizione >= 0 && !(nascosta && ctx.gen < 8)) v += Math.max(0.5, 1.5 - posizione * 0.5);
            if (v > mv) { mv = v; migliore = nome; }
        }
        return migliore;
    }

    function itemValido(dex, nome, ctx, restrizioni, usati, conScelta = false) {
        const it = dex.items.get(nome);
        // niente strumenti fuori dalla generazione (anche 'Past': in Gen 8 e 9 sono Red Orb, Blue Orb... che il validatore rifiuta)
        if (!it.exists || it.gen > ctx.gen || it.isNonstandard) return null;
        if ((!ctx.goose && usati.has(it.id)) || (K.STRUMENTI_SCELTA.has(it.id) && !conScelta)) return null;   // Anything Goose: niente Item Clause
        if (it.megaStone || it.zMove) return null;
        if (!strumentoAmmesso(it, restrizioni)) return null;
        return it.name;
    }

    function scegliStrumento(cand, ruolo, ctx, restrizioni, usati, piano, mosse, rnd) {
        const dex = ruolo.dex;
        if (ctx.gen < 2) return '';
        if (cand.isMega) return cand.richiesto || '';
        if (cand.richiesto) return cand.richiesto;
        const attacchi = mosse.filter(m => m.categoria !== 'Status');
        const stato = mosse.some(m => m.categoria === 'Status' && !m.protezione);
        const qualunqueStato = mosse.some(m => m.categoria === 'Status');          // il Gilet d'assalto vieta anche la Protezione
        const fragile = cand.basi.hp + cand.basi.def + cand.basi.spd < 230;
        const nomi = [];
        // Trick e Switcheroo: servono con uno strumento Scelta in mano (scambiato, blocca l'avversario su una mossa): il primo dei consigli che il formato ammette
        if (mosse.some(m => m.utile === 'trick')) {
            for (const k of ((cand.cons && cand.cons.oggetti) || []).slice(0, 4)) {
                if (!K.STRUMENTI_SCELTA.has(k)) continue;
                const v = itemValido(dex, k, ctx, restrizioni, usati, true);
                if (v) return v;
            }
        }
        // lo strumento Scelta: solo a chi ha soli attacchi (la mossa bloccata non è mai una Protezione o uno stato inutile), se i consigli ce l'hanno tra i primi tre
        const par = ctx.parametriTeam || PARAMETRI_TEAM;
        const probScelta = ctx.doppio ? par.probSceltaDoppio : par.probScelta;
        if (probScelta > 0 && !cand.isMega && attacchi.length === mosse.length && attacchi.length >= 3 && !mosse.some(m => m.id === 'fakeout' || m.id === 'firstimpression')
            && (probScelta >= 1 || (rnd || Math.random)() < probScelta)) {
            for (const k of ((cand.cons && cand.cons.oggetti) || []).slice(0, 3)) {
                if (!K.STRUMENTI_SCELTA.has(k)) continue;
                const v = itemValido(dex, k, ctx, restrizioni, usati, true);
                if (v) return v;
            }
        }
        if (ruolo.schermi) nomi.push('Light Clay');
        if (ctx.doppio && ruolo.fakeout) nomi.push('Sitrus Berry', 'Safety Goggles', 'Mental Herb');
        // gli strumenti consigliati per questo Pokémon, se vanno d'accordo con il suo set (e con ciò che la CPU sa fare)
        for (const k of ((cand.cons && cand.cons.oggetti) || [])) {
            const it = dex.items.get(k);
            if (!it.exists) continue;
            if (it.id === 'assaultvest' && qualunqueStato) continue;                        // con il Gilet d'assalto le mosse di stato non si usano
            if (it.id === 'eviolite' && !(cand.base.evos && cand.base.evos.length)) continue;   // serve solo a chi può ancora evolversi
            if (it.id === 'toxicorb' || it.id === 'flameorb') continue;                     // servono con un'abilità o una mossa che la CPU non pianifica
            nomi.push(it.name);
        }
        if (!attacchi.length) nomi.push('Leftovers', 'Sitrus Berry');
        const tipoMigliore = attacchi.slice().sort((a, b) => b.potenza - a.potenza)[0];
        const robusto = cand.robustezza >= 75;
        if (robusto && !qualunqueStato && cand.basi.spd >= cand.basi.def && !(ctx.goose && cand.offesa >= 100)) nomi.push('Assault Vest');
        if (ruolo.setup || ruolo.velocita === 'trickroom') nomi.push('Leftovers', 'Sitrus Berry');
        if (cand.offesa >= (ctx.goose ? 90 : 100) && (!robusto || ctx.goose)) {
            nomi.push(fragile && ctx.doppio ? 'Focus Sash' : 'Life Orb');
            if (tipoMigliore) nomi.push(K.STRUMENTI_TIPO[tipoMigliore.tipo]);
            nomi.push('Expert Belt', 'Life Orb', 'Focus Sash');
        }
        nomi.push('Sitrus Berry', 'Leftovers', 'Lum Berry', 'Covert Cloak', 'Mental Herb', 'Rocky Helmet', 'Shell Bell', 'Scope Lens', 'Quick Claw', 'Wide Lens',
            'Black Sludge', 'Metronome', 'Muscle Band', 'Wise Glasses');
        for (const n of nomi) {
            const v = n && itemValido(dex, n, ctx, restrizioni, usati);
            if (v) return v;
        }
        // l'ultima spiaggia: un qualunque strumento ammesso
        for (const it of dex.items.all()) {
            if (it.gen > ctx.gen || it.isNonstandard) continue;
            const v = itemValido(dex, it.name, ctx, restrizioni, usati);
            if (v && (it.isBerry || /^(Charcoal|Mystic Water|Magnet|Never-Melt Ice|Black Belt|Soft Sand|Sharp Beak)$/.test(it.name))) return v;
        }
        return '';
    }

    // Lo spread (natura, EV, IV) dei set di Smogon che somiglia di più alle mosse scelte: quello con più mosse in comune (almeno due, la Protezione non conta),
    // a parità il più giocato. Con la Stanza Magica serve uno spread senza velocità; senza, non uno fatto per la Stanza Magica (IV di velocità a 0).
    function spreadVero(cand, mosse, trickRoom, coerente) {
        const lista = (cand.cons && cand.cons.spread) || [];
        if (!lista.length) return null;
        const mie = new Set(mosse.filter(m => !m.protezione).map(m => m.id));
        // chi attacca solo con mosse fisiche (o solo speciali) non prende uno spread fatto per l'altra statistica (Landorus-Therian con Terremoto e Rock Slide, gli EV sull'Att. Sp. e IV Attacco 0)
        const nFisiche = mosse.filter(m => m.categoria === 'Physical' && m.id !== 'bodypress' && m.id !== 'foulplay').length;
        const nSpeciali = mosse.filter(m => m.categoria === 'Special').length;
        let migliore = null, mv = 0;
        lista.forEach((sp, k) => {
            if (trickRoom ? sp.e[5] > 0 : !!(sp.i && sp.i.spe === 0)) return;
            if (coerente && nFisiche > 0 && !nSpeciali && (sp.e[3] > sp.e[1] || (sp.i && sp.i.atk === 0))) return;
            if (coerente && nSpeciali > 0 && !nFisiche && sp.e[1] > sp.e[3]) return;
            const comuni = sp.m.filter(m => mie.has(m)).length;
            const v = comuni - k * 0.01;
            if (comuni >= Math.min(2, mie.size) && v > mv) { mv = v; migliore = sp; }
        });
        return migliore;
    }

    function distribuzione(cand, ruolo, ctx, mosse, piano, natura, rnd) {
        // natura ed EV in base a cosa fa il Pokémon
        const fisiche = mosse.filter(m => m.categoria === 'Physical' && m.id !== 'bodypress' && m.id !== 'foulplay');
        const speciali = mosse.filter(m => m.categoria === 'Special');
        const attaccaFisico = fisiche.length > speciali.length || (fisiche.length === speciali.length && cand.basi.atk >= cand.basi.spa);
        const offensivo = mosse.filter(m => m.categoria !== 'Status').length >= 2 && cand.offesa >= 80;
        const trickRoom = ruolo.velocita === 'trickroom' || piano.nome === 'trickroom' && cand.lento;
        const evs = {};
        let nat;
        const ivs = {};
        if (!fisiche.length) ivs.atk = 0;
        if (trickRoom) ivs.spe = 0;
        if (!offensivo || mosse.filter(m => m.categoria !== 'Status').length <= 1) {
            // supporto resistente
            const fisicoDif = cand.basi.def >= cand.basi.spd;
            evs.hp = 252; evs[fisicoDif ? 'def' : 'spd'] = 252; evs[fisicoDif ? 'spd' : 'def'] = 4;
            nat = fisicoDif ? (fisiche.length ? 'Impish' : 'Bold') : (fisiche.length ? 'Careful' : 'Calm');
            if (ruolo.velocita === 'tailwind' && cand.basi.spe >= 80) { evs.hp = 4; evs.spe = 252; evs.spd = 252; evs.def = 0; nat = attaccaFisico ? 'Jolly' : 'Timid'; }
        } else if (trickRoom) {
            evs.hp = 252; evs[attaccaFisico ? 'atk' : 'spa'] = 252; evs[attaccaFisico ? 'def' : 'spd'] = 4;
            nat = attaccaFisico ? 'Brave' : 'Quiet';
        } else if (cand.basi.spe >= 70) {
            evs.hp = 4; evs[attaccaFisico ? 'atk' : 'spa'] = 252; evs.spe = 252;
            nat = attaccaFisico ? 'Jolly' : 'Timid';
            // se non c'è nessuna mossa dell'altra categoria, la natura può abbassare quella inutile
            if (attaccaFisico && speciali.length) nat = 'Adamant';
            if (!attaccaFisico && fisiche.length) nat = 'Modest';
        } else {
            evs.hp = 252; evs[attaccaFisico ? 'atk' : 'spa'] = 252; evs[attaccaFisico ? 'def' : 'spd'] = 4;
            nat = attaccaFisico ? 'Adamant' : 'Modest';
        }
        // gli spread veri: natura, EV e IV del set di Smogon più somigliante (se ce n'è uno e la manopola lo vuole)
        const par = ctx.parametriTeam || PARAMETRI_TEAM;
        // a livello basso (Little Cup, livello 5) gli EV e gli IV pesano molto di più in proporzione: gli spread veri vincono dal 65% al 70% (nel doppio come nel singolo, in ogni generazione)
        const lc = ctx.livello <= 10;
        const probSpread = lc ? par.probSpread : (ctx.doppio ? par.probSpreadDoppio : (ctx.gen >= par.genMinSpread ? par.probSpread : 0));
        if (probSpread > 0 && ctx.gen >= 3 && (probSpread >= 1 || (rnd || Math.random)() < probSpread)) {
            const sp = spreadVero(cand, mosse, trickRoom, par.coerenzaOffensiva > 0);
            if (sp) {
                const nomi = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
                const evsVeri = {};
                nomi.forEach((k, j) => { if (sp.e[j] > 0) evsVeri[k] = sp.e[j]; });
                const ivsVeri = Object.assign({}, ivs, sp.i || {});
                return { evs: evsVeri, nat: natura || sp.n, ivs: ivsVeri };
            }
        }
        if (natura) nat = natura;
        return { evs, nat, ivs };
    }

    // Una mossa di cova si eredita, ma non può stare nello stesso set di una mossa che si impara solo da una generazione vecchia (Skarmory con Brave Bird di cova della 6ª e
    // Double-Edge del tutor della 3ª): il simulatore dice "incompatible". Un set che ha una mossa di cova (e solo per cova) si ricontrolla intero; se non regge, le mosse di cova si
    // tolgono e si completa con i migliori attacchi che non lo sono.
    function correggiUova(cand, mosse, ctx) {
        const uova = cand.soloUova;
        if (!uova || !uova.size || !ctx.validatore || !mosse.some(m => uova.has(m.id))) return mosse;
        let legale = true;
        try {
            const problemi = ctx.validatore.validateSet({ name: cand.nome, species: cand.base.name, level: ctx.livello, moves: mosse.map(m => m.nome), ability: cand.abilita[0] || '', item: '', evs: {}, ivs: {}, nature: '' }, {}) || [];
            legale = !problemi.some(p => /incompatible/i.test(p));
        } catch (e) { legale = true; }
        if (legale) return mosse;
        const resto = mosse.filter(m => !uova.has(m.id));
        for (const a of cand.attacchi) {
            if (resto.length >= 4) break;
            if (!uova.has(a.m.id) && !resto.some(m => m.id === a.m.id)) resto.push(a.m);
        }
        return resto.length ? resto : mosse;
    }

    function testoSet(cand, ctx, ruolo, piano, restrizioni, usati, tera, natura, rnd) {
        const dex = ruolo.dex;
        let mosse = correggiUova(cand, mosseDelSet(cand, ruolo, ctx, piano), ctx);
        const strumento = scegliStrumento(cand, ruolo, ctx, restrizioni, usati, piano, mosse, rnd);
        // Trick e Switcheroo servono con uno strumento Scelta: se non c'è (già preso da un altro del team, o non ammesso) la mossa si cambia con un attacco
        if (mosse.some(m => m.utile === 'trick') && !(strumento && K.STRUMENTI_SCELTA.has(id(strumento)))) {
            const presenti = new Set(mosse.map(m => m.id));
            const sostituta = cand.attacchi.map(a => a.m).find(m => !presenti.has(m.id));
            mosse = mosse.map(m => (m.utile === 'trick' ? sostituta : m)).filter(Boolean);
        }
        if (strumento) usati.add(id(strumento));
        const abilita = scegliAbilita(cand, piano, ctx, ruolo);
        const { evs, nat, ivs } = distribuzione(cand, ruolo, ctx, mosse, piano, natura, rnd);
        // Hidden Power con un tipo (3ª-7ª generazione): gli IV sono quelli che danno quel tipo. Un IV a 0 scelto sopra (Attacco a un attaccante speciale, Velocità per la Stanza Magica)
        // li contraddirebbe, e dalla 3ª alla 6ª generazione il validatore rifiuta il set
        const conHP = mosse.find(m => /^hiddenpower[a-z]+$/.test(m.id));
        if (conHP) {
            const t = dex.types.get(conHP.tipo);
            for (const k of Object.keys(ivs)) delete ivs[k];
            if (t && t.HPivs) Object.assign(ivs, t.HPivs);
        }
        const righe = [];
        righe.push(strumento ? `${cand.nome} @ ${strumento}` : cand.nome);
        if (abilita) righe.push(`Ability: ${abilita}`);
        righe.push(`Level: ${ctx.livello}`);
        if (ctx.gen >= 9 && ctx.meccaniche && !cand.isMega) righe.push(`Tera Type: ${tera}`);
        if (ctx.gen < 3) righe.push('EVs: 252 HP / 252 Atk / 252 Def / 252 SpA / 252 SpD / 252 Spe');   // nelle prime due generazioni i punti base sono al massimo
        if (ctx.gen >= 3) {
            const nomiEv = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
            const ev = Object.keys(evs).filter(k => evs[k] > 0).map(k => `${evs[k]} ${nomiEv[k]}`).join(' / ');
            if (ev) righe.push(`EVs: ${ev}`);
            righe.push(`${nat} Nature`);
            const iv = Object.keys(ivs).map(k => `${ivs[k]} ${nomiEv[k]}`).join(' / ');
            if (iv) righe.push(`IVs: ${iv}`);
        }
        mosse.forEach(m => righe.push(`- ${m.nome}`));
        return { testo: righe.join('\n'), mosse, strumento, abilita };
    }

    // Gen 7 con le meccaniche accese: la CPU porta un Cristallo Z. La Mossa Z si fa una volta sola per partita, quindi un solo cristallo
    // per team (più di uno sarebbe sprecato). Lo prende chi ha l'attacco con più da guadagnare dalla Mossa Z (la potenza della Mossa Z
    // per la sua statistica offensiva, col bonus STAB) tra chi non ha già uno strumento obbligato (Megapietra, strumento della forma).
    const CRISTALLI_Z = {
        Normal: 'Normalium Z', Fire: 'Firium Z', Water: 'Waterium Z', Electric: 'Electrium Z', Grass: 'Grassium Z', Ice: 'Icium Z',
        Fighting: 'Fightinium Z', Poison: 'Poisonium Z', Ground: 'Groundium Z', Flying: 'Flyinium Z', Psychic: 'Psychium Z',
        Bug: 'Buginium Z', Rock: 'Rockium Z', Ghost: 'Ghostium Z', Dragon: 'Dragonium Z', Dark: 'Darkinium Z', Steel: 'Steelium Z',
        Fairy: 'Fairium Z'
    };
    function cristalloZDelTeam(dex, ctx, restrizioni, usati, infoMembri) {
        if (ctx.gen !== 7 || !ctx.meccaniche) return null;
        let migliore = null;
        infoMembri.forEach((info, i) => {
            const c = info.cand;
            if (c.isMega || c.richiesto) return;
            for (const m of info.mosse) {
                if (m.categoria === 'Status' || !(m.potenza >= 60) || m.dueTurni || m.ricarica) continue;
                const nome = CRISTALLI_Z[m.tipo];
                const it = nome ? dex.items.get(nome) : null;
                if (!it || !it.exists || !it.zMove || it.gen > ctx.gen || it.isNonstandard) continue;
                if (!strumentoAmmesso(it, restrizioni) || (!ctx.goose && usati.has(it.id))) continue;
                const statOffensiva = m.categoria === 'Physical' ? c.basi.atk : c.basi.spa;
                const valore = K.potenzaZDaTabella(m.potenza) * (c.tipiBase.includes(m.tipo) ? 1.5 : 1) * statOffensiva;
                if (!migliore || valore > migliore.valore) migliore = { i, it, valore };
            }
        });
        return migliore;
    }

    function scegliTera(cand, mosse, rnd) {
        // il tipo dell'attacco più forte se non è già uno dei suoi, altrimenti il tipo principale
        const att = mosse.filter(m => m.categoria !== 'Status').sort((a, b) => b.potenza - a.potenza)[0];
        if (att && !cand.tipiBase.includes(att.tipo) && att.potenza >= 80 && rnd() < 0.6) return att.tipo;
        return cand.tipiBase[0];
    }

    // =================================================
    // COMPOSIZIONE DEI TEAM
    // =================================================
    const PIANI_DOPPIO = ['tailwind', 'trickroom', 'pioggia', 'sole', 'bilanciato', 'offensivo', 'sabbia', 'neve', 'bulky'];
    const PIANI_SINGOLO = ['bilanciato', 'offensivo', 'bulky', 'pioggia', 'sole', 'sabbia', 'neve'];
    const ETICHETTE = {
        tailwind: 'Tailwind', trickroom: 'Trick Room', pioggia: 'Rain', sole: 'Sun', sabbia: 'Sand', neve: 'Snow',
        bilanciato: 'Balance', offensivo: 'Offense', bulky: 'Bulky'
    };

    function pianiPossibili(cand, ctx) {
        const nomi = ctx.doppio ? PIANI_DOPPIO : PIANI_SINGOLO;
        const ab = new Set();
        cand.forEach(c => abilitaPossibili(c).forEach(a => ab.add(a)));
        const par = ctx.parametriTeam || PARAMETRI_TEAM;
        // un piano meteo ha senso se ci sono Pokémon che ne approfittano (almeno due, uno con l'abilità giusta: Swift Swim, Chlorophyll, Sand Rush...) e se il meteo non indebolisce
        // il tipo che fa la maggior parte del pool (il sole in un formato monotipo Acqua, la pioggia nel Fuoco)
        const sensato = p => {
            const sfruttano = cand.filter(c => sfruttaIlPiano({ nome: p }, c));
            if (sfruttano.length < 2) return false;
            if (!sfruttano.some(c => abilitaPossibili(c).some(a => SFRUTTATORI[p].includes(a))) && sfruttano.length < 6) return false;      // senza chi ha l'abilità (Swift Swim...) ce ne vogliono molti col tipo giusto
            const contrario = { sole: 'Water', pioggia: 'Fire' }[p];
            return !(contrario && cand.filter(c => c.tipiBase.includes(contrario)).length >= cand.length * 0.5);
        };
        const perAbilita = nomi.filter(p => SETTER[p] && SETTER[p].some(x => ab.has(x)) && sensato(p));
        // il meteo con una mossa (Rain Dance...) solo dove il meteo con l'abilità è raro (meno di due piani nel pool: formati con pochi Pokémon, monotipo, restrizioni): un posto in meno
        // per attaccare e un turno per metterlo, dove c'è Pelipper o Tyranitar le squadre con la mossa perdevano (misura: -4 e -9 punti)
        const conMosse = par.meteoConMosse > 0 && perAbilita.length < 2;
        const perMossa = conMosse ? nomi.filter(p => SETTER[p] && !perAbilita.includes(p) && cand.some(c => conMossaMeteo({ nome: p, conMosse: true }, c)) && sensato(p)) : [];
        ctx.pianiMosse = new Set(perMossa);
        return nomi.filter(p => {
            if (SETTER[p]) return perAbilita.includes(p) || perMossa.includes(p);
            if (p === 'tailwind') return cand.some(c => c.opz.tailwind);
            if (p === 'trickroom') return cand.some(puoMettereStanza) && cand.some(c => c.lento && c.offesa >= 95);
            return true;
        });
    }

    // Anything Goose: la CPU punta sull'attacco. "Offensivo" pesa quanto tutti gli altri piani insieme (compare più volte nell'elenco,
    // da cui si pesca), gli altri restano come un po' di strategia; "bilanciato" e "bulky" non servono.
    function pianiDelFormato(cand, ctx) {
        let piani = pianiPossibili(cand, ctx);
        // i piani meteo contano `pesoMeteo` volte
        // (solo nei formati dove il meteo è raro, cioè dove serve la mossa: nei formati con Pelipper o Tyranitar i team meteo sono già tanti e raddoppiarli faceva perdere, -4 punti in un campione)
        const pm = ctx.pianiMosse && ctx.pianiMosse.size ? Math.round(((ctx.parametriTeam || PARAMETRI_TEAM).pesoMeteo || 1)) : 1;
        if (pm > 1) piani = piani.concat(...Array.from({ length: pm - 1 }, () => piani.filter(p => SETTER[p])));
        if (!ctx.goose) return piani;
        const altri = piani.filter(p => p !== 'offensivo' && p !== 'bilanciato' && p !== 'bulky');
        return Array.from({ length: Math.max(3, altri.length) }, () => 'offensivo').concat(altri);
    }

    // La Stanza Magica la mette chi non è veloce: Calyrex-Shadow (150 di velocità) la impara, ma con la Stanza Magica perderebbe l'unica cosa che lo rende il migliore
    const VELOCITA_MASSIMA_SETTER_STANZA = 90;
    const puoMettereStanza = c => !!c.opz.trickroom && c.basi.spe <= VELOCITA_MASSIMA_SETTER_STANZA;
    // Chi può impostare il piano del team: Tailwind, Stanza Magica (chi non è veloce), il meteo (abilità)
    function impostaIlPiano(piano, c) {
        if (piano.nome === 'tailwind') return !!c.opz.tailwind;
        if (piano.nome === 'trickroom') return puoMettereStanza(c);
        if (SETTER[piano.nome]) return abilitaPossibili(c).some(a => SETTER[piano.nome].includes(a)) || conMossaMeteo(piano, c);
        return false;
    }
    // Chi può mettere il meteo con una mossa (Rain Dance, Sunny Day, Sandstorm, Snowscape/Hail): vale quando nel pool non c'è chi lo mette con l'abilità (formati con pochi Pokémon: monotype, restrizioni)
    const METEO_DEL_PIANO = { pioggia: 'rain', sole: 'sun', sabbia: 'sand', neve: 'snow' };
    function conMossaMeteo(piano, c) {
        const w = METEO_DEL_PIANO[piano.nome];
        return !!(piano.conMosse && w && c.opz && c.opz.meteoMossa && c.opz.meteoMossa[w] && c.basi.hp * (c.basi.def + c.basi.spd) / 100 >= 45);
    }
    const mettePerAbilita = (piano, c) => SETTER[piano.nome] && abilitaPossibili(c).some(a => SETTER[piano.nome].includes(a));
    const pianoConSetter = piano => piano.nome === 'tailwind' || piano.nome === 'trickroom' || !!SETTER[piano.nome];
    // Chi ne approfitta (e quanti ne servono): attaccanti lenti per la Stanza Magica, chi ama il meteo (abilità o tipo) per il meteo
    function sfruttaIlPiano(piano, c) {
        if (piano.nome === 'trickroom') return c.lento && c.offesa >= 95;
        if (SETTER[piano.nome]) {
            return abilitaPossibili(c).some(a => SFRUTTATORI[piano.nome].includes(a)) ||
                (c.tipiAttacco.includes(TIPO_METEO[piano.nome]) && c.offesa >= 80);
        }
        return false;
    }
    const abusatoriNecessari = piano => piano.nome === 'trickroom' ? 2 : (SETTER[piano.nome] ? 1 : 0);

    // Anything Goose: lo stesso Pokémon può comparire più volte (la seconda copia è un duplicato con un altro `id`, così i ruoli
    // - chi mette Tailwind, chi ha Fake Out... - si assegnano a una copia sola). Ogni copia in più costa un po' di punteggio: due
    // Calyrex-Shadow succedono, ma non sempre e non tre alla volta.
    const COPIE_MASSIME = 3;
    const PROBABILITA_COPIA = 0.3;
    const radiceDi = m => m.origine || m;
    function copiaDi(c, numero) { return Object.assign(Object.create(Object.getPrototypeOf(c)), c, { origine: c, id: `${c.id}~${numero}` }); }

    function compone(dex, cand, ctx, piano, rnd, usoGlobale, asso, tipi, massimo, pesoUso = 0.25) {
        const membri = [asso];
        const usate = new Set([id(asso.base.baseSpecies || asso.base.name)]);
        let uber = ctx.standard && /^D?UBER$/i.test(String(asso.tier).replace(/[()]/g, '')) ? 1 : 0;
        let guardia = 0;
        const eUberDi = c => /^D?UBER$/i.test(String(c.tier).replace(/[()]/g, ''));
        const copie = c => membri.filter(m => radiceDi(m) === c).length;
        // chi si può ancora aggiungere: senza clausole (Anything Goose) anche chi c'è già, fino a tre copie
        const libero = c => ctx.goose ? copie(c) < COPIE_MASSIME : !membri.includes(c) && !usate.has(id(c.base.baseSpecies || c.base.name));
        // Anything Goose: circa un team su tre ha apposta una copia di un suo Pokémon (le copie in più, mai senza motivo, costano)
        let cercaCopia = ctx.goose && rnd() < PROBABILITA_COPIA;
        const costoCopia = c => { const n = copie(c); return n ? (n === 1 && cercaCopia ? -2.2 : 0.8 + (n - 1) * 2.2) : 0; };
        // un Pokémon che la lega gioca (meta-lega.js) vale un po' di più; uno che nessuno ha mai portato non perde niente: la CPU può sempre inventare
        const pesoSpecie = (ctx.parametriTeam || PARAMETRI_TEAM).pesoSpecieMeta;
        const bonusMeta = c => (c.uso ? pesoSpecie * Math.min(1, c.uso / 0.3) : 0);
        const aggiungi = scelto => {
            const n = ctx.goose ? copie(scelto) : 0;
            if (n) cercaCopia = false;                    // una copia sola per volta: il bonus finisce qui
            membri.push(n ? copiaDi(scelto, n + 1) : scelto);
            usate.add(id(scelto.base.baseSpecies || scelto.base.name));
            if (ctx.standard && eUberDi(scelto)) uber++;
        };
        // Un team con un piano parte da chi lo imposta: se l'asso non può farlo, il secondo membro è il miglior setter disponibile
        // (altrimenti il piano resterebbe un'etichetta senza nessuno che lo faccia)
        if (pianoConSetter(piano) && !impostaIlPiano(piano, asso)) {
            let scelto = null, mv = -1e9;
            for (const c of cand) {
                if (!impostaIlPiano(piano, c) || !libero(c)) continue;
                if (ctx.standard && eUberDi(c) && uber >= 2) continue;
                const uso = usoGlobale.get(chiaveUso(c)) || 0;
                let v = punteggio(dex, membri.concat(c), piano, ctx, tipi) + (rnd() - 0.5) * 1.1 - (uso >= massimo ? 3 + (uso - massimo) * 2 : uso * pesoUso) - costoCopia(c) + bonusMeta(c);
                if (piano.nome === 'trickroom' && c.basi.spe <= 80) v += 0.6;
                if (v > mv) { mv = v; scelto = c; }
            }
            if (scelto) aggiungi(scelto);
        }
        // ...e da chi ne approfitta: senza, il setter metterebbe un meteo (o una Stanza Magica) che non serve a nessuno
        // (per il meteo il setter non conta: ci vuole qualcun altro che ne approfitti)
        const abusatoriPresenti = () => membri.filter(c => sfruttaIlPiano(piano, c) && !(SETTER[piano.nome] && impostaIlPiano(piano, c))).length;
        // per il meteo basta uno che ne approfitta con l'abilità (Swift Swim, Chlorophyll, Sand Rush...) oppure due col tipo giusto; chi ha l'abilità si preferisce
        const conAbilitaDelMeteo = c => !!SFRUTTATORI[piano.nome] && abilitaPossibili(c).some(a => SFRUTTATORI[piano.nome].includes(a));
        const abusatoriBastano = () => {
            if (!SETTER[piano.nome]) return abusatoriPresenti() >= abusatoriNecessari(piano);
            const abusa = membri.filter(c => sfruttaIlPiano(piano, c) && !impostaIlPiano(piano, c));
            return abusa.some(conAbilitaDelMeteo) || abusa.length >= 2;
        };
        while ((abusatoriNecessari(piano) || SETTER[piano.nome]) && !abusatoriBastano() && membri.length < 5 && guardia++ < 100) {
            let scelto = null, mv = -1e9;
            for (const c of cand) {
                if (!sfruttaIlPiano(piano, c) || (SETTER[piano.nome] && impostaIlPiano(piano, c)) || !libero(c)) continue;
                if (ctx.standard && eUberDi(c) && uber >= 2) continue;
                const uso = usoGlobale.get(chiaveUso(c)) || 0;
                const v = punteggio(dex, membri.concat(c), piano, ctx, tipi) + (rnd() - 0.5) * 1.1 - (uso >= massimo ? 3 + (uso - massimo) * 2 : uso * pesoUso) - costoCopia(c) + bonusMeta(c) + (conAbilitaDelMeteo(c) ? 4 : 0);
                if (v > mv) { mv = v; scelto = c; }
            }
            if (!scelto) break;
            aggiungi(scelto);
        }
        while (membri.length < 6 && guardia++ < 400) {
            const attuale = punteggio(dex, membri, piano, ctx, tipi);
            let migliori = [];
            for (const c of cand) {
                if (!libero(c)) continue;
                if (ctx.standard && eUberDi(c) && uber >= 2) continue;
                let v = punteggio(dex, membri.concat(c), piano, ctx, tipi) - attuale;
                const uso = usoGlobale.get(chiaveUso(c)) || 0;
                if (uso >= massimo) v -= 3 + (uso - massimo) * 2;
                else v -= uso * pesoUso;
                v -= costoCopia(c);
                v += bonusMeta(c);
                v += (rnd() - 0.5) * 1.1;
                migliori.push({ c, v });
            }
            if (!migliori.length) break;
            migliori.sort((a, b) => b.v - a.v);
            aggiungi(migliori[Math.min(migliori.length - 1, Math.floor(rnd() * rnd() * 3))].c);
        }
        return membri;
    }

    // =================================================
    // LA STRATEGIA DEL TEAM
    // =================================================
    // Un team ha un piano solo se i suoi set lo realizzano davvero: chi lo imposta (Tailwind, Stanza Magica, meteo) e chi ne
    // approfitta. Si guarda quello che c'è nei set finali (mosse e abilità scelte), non quello che i Pokémon potrebbero fare.
    // `info`: [{ cand, mosse (descritte), abilita }]. Restituisce { piano, richiesto, coerente, setter[], abusatori[], nucleo[] }:
    // `piano` è quello realizzato (se il richiesto non regge diventa "bilanciato": meglio un team onesto che un'etichetta falsa).
    function strategiaDelTeam(richiesto, info) {
        const mosseDi = i => i.mosse.map(m => m.id);
        const attacca = i => i.mosse.some(m => m.categoria !== 'Status');
        const abil = i => id(i.abilita || '');
        const nomi = lista => lista.map(i => i.cand.nome);
        let setter = [], abusatori = [], coerente = true;
        if (richiesto === 'tailwind') {
            setter = info.filter(i => mosseDi(i).includes('tailwind'));
            abusatori = info.filter(i => !setter.includes(i) && attacca(i) && i.cand.basi.spe >= 40);
            coerente = setter.length >= 1 && abusatori.length >= 2;
        } else if (richiesto === 'trickroom') {
            setter = info.filter(i => mosseDi(i).includes('trickroom'));
            abusatori = info.filter(i => attacca(i) && i.cand.lento && i.cand.offesa >= 95);
            coerente = setter.length >= 1 && abusatori.length >= 2;
        } else if (SETTER[richiesto]) {
            // chi mette il meteo: con l'abilità o con la mossa (Rain Dance, Sunny Day, Sandstorm, Snowscape/Hail)
            const mossaMeteo = { rain: ['raindance'], sun: ['sunnyday'], sand: ['sandstorm'], snow: ['snowscape', 'hail'] }[K.PIANO_METEO[richiesto]];
            setter = info.filter(i => SETTER[richiesto].includes(abil(i)) || mosseDi(i).some(m => mossaMeteo.includes(m)));
            // chi ne approfitta: con l'abilità giusta (Swift Swim, Chlorophyll, Sand Rush, Slush Rush...), o con attacchi del tipo rafforzato. Il piano regge con almeno uno dell'abilità
            // o con almeno due del tipo: un team "sabbia" con attaccanti di Roccia ma nessuno con Sand Rush o Sand Force è un team come un altro
            const conAbilita = info.filter(i => !setter.includes(i) && attacca(i) && SFRUTTATORI[richiesto].includes(abil(i)));
            const conTipo = info.filter(i => !setter.includes(i) && attacca(i) && !conAbilita.includes(i) && i.mosse.some(m => m.categoria !== 'Status' && m.tipo === TIPO_METEO[richiesto]) && i.cand.offesa >= 80);
            abusatori = conAbilita.concat(conTipo);
            coerente = setter.length >= 1 && (conAbilita.length >= 1 || conTipo.length >= 2);
        } else {
            // bilanciato, offensivo, bulky: il nucleo sono i due Pokémon di maggior valore
            abusatori = info.slice().sort((a, b) => b.cand.valore - a.cand.valore).slice(0, 2);
        }
        const piano = coerente ? richiesto : 'bilanciato';
        return {
            piano, richiesto, coerente, trovati: { setter: setter.length, abusatori: abusatori.length },
            setter: coerente ? nomi(setter) : [], abusatori: coerente ? nomi(abusatori).slice(0, 3) : [],
            nucleo: coerente ? Array.from(new Set(nomi(setter).concat(nomi(abusatori)))).slice(0, 4) : []
        };
    }

    function sovrapposizione(a, b) { return Array.from(new Set(a)).filter(x => b.includes(x)).length; }   // per specie: le copie non contano due volte
    const chiaveUso = c => id(c.base.baseSpecies || c.base.name);

    // Il cuore, in tre pezzi:
    //   preparaFormato(): la parte lenta. Dal pool si scelgono i candidati e di ognuno si leggono le mosse che può imparare (il
    //                     validatore del simulatore le controlla una per una). Si fa una volta per formato e si può tenere in memoria;
    //   costruisciTeam(): dati i sei membri e il piano, i set (mosse, strumento, abilità, natura, EV) e la strategia verificata;
    //   generaTeam():     una dozzina di team in fila, sempre gli stessi per lo stesso seme (i test);
    //   unTeam():         un team solo, a caso, da una preparazione già fatta (la prova contro la CPU, un team per ogni sfida).
    //   opzioni: { Dex, TeamValidator, pool, regolamento, seme, pokedexBase, consigli }   (consigli: i dati di consigli.js della generazione, se ci sono)
    // `rnd` è il generatore da cui la preparazione pesca i candidati fuori dal comune: generaTeam gli passa il suo (la serie di numeri
    // continua nella composizione dei team), una sessione lo ricava dal seme del formato.
    async function preparaFormato(opzioni, rnd = creaCasuale(opzioni.seme || 'cpu')) {
        const { Dex, TeamValidator } = opzioni;
        const regolamento = opzioni.regolamento;
        const ctx = contestoDa(regolamento);
        const dex = Dex.forGen(ctx.gen);
        const restrizioni = regolamento.restrizioni || {};
        const avvisi = [];
        const mosseBandite = nome => voceBannata(restrizioni, 'mosse', nome);
        const abilitaBandite = nome => voceBannata(restrizioni, 'abilita', nome);
        if (restrizioni.mosse && Object.values(restrizioni.mosse).some(r => r && r.mode === 'SAME_ACROSS_TEAM')) avvisi.push('Rule not supported by the CPU: same move property across the team');
        if (restrizioni.strumenti && Object.values(restrizioni.strumenti).some(r => r && r.mode === 'SAME_ACROSS_TEAM')) avvisi.push('Rule not supported by the CPU: same item property across the team');

        let validatore = null;
        if (TeamValidator) {
            const candidati = [`gen${ctx.gen}anythinggoes`, `gen${ctx.gen}ubers`, `gen${ctx.gen}ou`];
            const f = candidati.find(x => Dex.formats.get(x).exists);
            if (f) validatore = TeamValidator.get(f);
        }

        // la meta della lega per questo formato (meta-lega.js): senza, o di un'altra versione, tutto è come prima
        const meta = opzioni.meta && opzioni.meta.v === 1 && opzioni.meta.specie ? opzioni.meta : null;
        // con la meta, Helping Hand e Protezione seguono quanto li giocano in lega (a metà con le manopole): chi li gioca poco ne ha meno.
        // Pokémon e mosse pesano tanto meno quanto più piccola è la lega (sotto i dodici team): con pochi team le quote coincidono quasi con quelle di un team
        // vero, e la CPU non deve copiare.
        const daMeta = {};
        if (meta) {
            const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
            const scala = clamp((meta.team || 0) / 12, 0, 1);
            daMeta.pesoSpecieMeta = PARAMETRI_TEAM.pesoSpecieMeta * scala;
            daMeta.pesoMossaMeta = PARAMETRI_TEAM.pesoMossaMeta * scala;
            if (meta.squadra && meta.classi) {
                if (meta.squadra.aiuto != null) {
                    daMeta.probAiuto = clamp(0.5 * PARAMETRI_TEAM.probAiuto + 0.5 * meta.squadra.aiuto / 0.55, 0.05, 0.95);
                    daMeta.maxAiuto = meta.squadra.aiuto > 1.2 ? 2 : 1;
                }
                // i pivot (U-turn, Parting Shot...): quanti ne portano i team della lega (0,8 a team è la norma dei team veri)
                if (meta.squadra.perno != null) {
                    daMeta.probPerno = clamp(0.5 * PARAMETRI_TEAM.probPerno + 0.5 * meta.squadra.perno / 0.8, 0.1, 0.95);
                    daMeta.maxPerno = meta.squadra.perno > 1.3 ? 2 : 1;
                }
                if (meta.classi.protezione != null) daMeta.probProtezione = clamp(0.5 * PARAMETRI_TEAM.probProtezione + 0.5 * (meta.classi.protezione + 0.05), 0.5, 1);
            }
        }
        const parametriTeam = Object.assign({}, PARAMETRI_TEAM, daMeta, opzioni.parametriTeam || {});

        // 1) i candidati: i più forti del formato, più qualche scelta fuori dal comune
        const ordinati = opzioni.pool.map(v => {
            const s = dex.species.get(v.id);
            // Anything Goose: conta anche quanto il Pokémon colpisce forte (a parità di tier vince chi attacca di più)
            const potenza = ctx.goose ? Math.max(s.baseStats.atk, s.baseStats.spa) / 10 : 0;
            // la lega gioca questo Pokémon: tra i candidati ci entra anche se il suo tier è basso (fino a +12 punti, come un tier in più)
            const usoLega = meta && meta.specie ? (meta.specie[id(v.id)] || 0) : 0;
            return { v, valore: valoreSpecie(s, ctx) + potenza + rnd() * 4 + Math.min(1, usoLega / 0.3) * 12 * parametriTeam.pesoSpecieMeta };
        }).sort((a, b) => b.valore - a.valore);
        const MAX_CAND = ctx.doppio ? parametriTeam.candMaxDoppio : parametriTeam.candMax;
        const fissiBase = ctx.doppio ? parametriTeam.candFissiDoppio : parametriTeam.candFissi;
        const NUM_FISSI = Math.min(MAX_CAND, ctx.goose ? Math.round(fissiBase * 0.86) : fissiBase);
        const fissi = ordinati.slice(0, Math.min(ordinati.length, NUM_FISSI));
        const resto = ordinati.slice(fissi.length);
        const extra = [];
        for (let i = 0; i < MAX_CAND - NUM_FISSI && resto.length; i++) extra.push(resto.splice(Math.floor(rnd() * resto.length), 1)[0]);
        const voci = fissi.concat(extra).slice(0, MAX_CAND).map(x => x.v);

        const cand = [];
        for (const voce of voci) {
            const c = await analizza(dex, validatore, voce, ctx, restrizioni, mosseBandite, abilitaBandite, opzioni.pokedexBase);
            if (c) {
                c.cons = consigliDi(opzioni.consigli, c, ctx);
                if (parametriTeam.hiddenPower > 0 && ctx.gen >= 3 && ctx.gen <= 7) tipiHiddenPower(c, dex, ctx, mosseBandite, restrizioni);
                if (meta) { c.uso = meta.specie[id(c.id)] || 0; c.metaMosse = (meta.mosse || {})[id(c.id)] || null; }
                cand.push(c);
            }
        }
        if (cand.length < 6) {
            return { insufficiente: true, avvisi: avvisi.concat(`Not enough Pokémon in this format for the CPU (${cand.length} usable)`) };
        }

        ctx.parametriTeam = parametriTeam;
        ctx.validatore = validatore;        // per ricontrollare i set che hanno una mossa di cova (correggiUova)
        return {
            insufficiente: false, avvisi, dex, ctx, restrizioni, cand, parametriTeam,
            tipi: K.tipiDellaGenerazione(dex),
            piani: pianiDelFormato(cand, ctx),
            natura: naturaImposta(restrizioni),
            // gli assi: i più forti, distinti per specie
            assi: cand.slice().sort((a, b) => b.valore - a.valore)
        };
    }

    // Dai sei membri e dal piano: set e strategia. null se un Pokémon non riesce ad avere nemmeno una mossa.
    function costruisciTeam(prep, rnd, membri, piano, asso) {
        const { dex, ctx, restrizioni, natura } = prep;
        const assegnati = assegnaRuoli(dex, membri, ctx, piano, rnd, prep.parametriTeam);
        const usati = new Set();
        const testi = [];
        const infoMembri = [];
        for (const c of membri) {
            const ruolo = ruoloDi(c, ctx, piano, assegnati);
            ruolo.dex = dex;
            const tera = ctx.gen >= 9 ? scegliTera(c, mosseDelSet(c, ruolo, ctx, piano), rnd) : null;
            const s = testoSet(c, ctx, ruolo, piano, restrizioni, usati, tera, natura, rnd);
            if (s.mosse.length < 1) return null;
            testi.push(s.testo);
            infoMembri.push({ cand: c, mosse: s.mosse, abilita: s.abilita, strumento: s.strumento });
        }
        // Gen 7 con le meccaniche: un Cristallo Z al posto dello strumento di chi ne ha più bisogno
        const z = cristalloZDelTeam(dex, ctx, restrizioni, usati, infoMembri);
        if (z) {
            const vecchio = infoMembri[z.i].strumento;
            if (vecchio) usati.delete(id(vecchio));
            usati.add(z.it.id);
            const righe = testi[z.i].split('\n');
            righe[0] = `${membri[z.i].nome} @ ${z.it.name}`;
            testi[z.i] = righe.join('\n');
            infoMembri[z.i].strumento = z.it.name;
        }
        // il piano vale solo se i set lo realizzano (altrimenti il team è "bilanciato" e basta)
        const strategia = strategiaDelTeam(piano.nome, infoMembri);
        return {
            nome: `CPU ${ETICHETTE[strategia.piano] || strategia.piano} · ${asso.nome}`,
            piano: strategia.piano,
            strategia,
            testo: testi.join('\n\n'),
            specie: membri.map(m => m.nome)
        };
    }

    // Il Pokémon di un team conta per la sua specie base (due forme dello stesso Pokémon sono lo stesso Pokémon)
    const pianoDi = (nome, ctx) => ({ nome, pesoValore: nome === 'bilanciato' ? 1.1 : 1, conMosse: !!(ctx && ctx.pianiMosse && ctx.pianiMosse.has(nome)) });

    // La personalità del team (cpu-personalita.js): i piani con il loro peso (di base 1) e le manopole dei ruoli che sposta. Senza personalità, o `equilibrata`, il team è quello di sempre.
    function stileDelTeam(personalita) {
        if (!Pers || !personalita || !Pers.esiste(personalita)) return null;
        const t = Pers.team(personalita);
        return { id: personalita, piani: t.piani || {}, parametri: t.parametri || {} };
    }
    // L'elenco dei piani da cui pescare, con ogni piano ripetuto per il suo peso (mezzi pesi: peso × 2 copie); se i pesi li azzerano tutti resta l'elenco com'era
    function pianiPesati(piani, stile) {
        if (!stile || !Object.keys(stile.piani).length) return piani;
        const out = [];
        for (const p of piani) {
            const w = stile.piani[p] == null ? 1 : Number(stile.piani[p]);
            for (let i = 0; i < Math.round(Math.max(0, w) * 2); i++) out.push(p);
        }
        return out.length ? out : piani;
    }
    // La preparazione di un formato con le manopole dei ruoli della personalità: il contesto e i parametri sono copie, quelli della sessione restano com'erano
    function conStile(prep, stile) {
        if (!stile || !Object.keys(stile.parametri).length) return prep;
        const parametriTeam = Object.assign({}, prep.parametriTeam, stile.parametri);
        const ctx = Object.assign({}, prep.ctx, { parametriTeam });
        return Object.assign({}, prep, { parametriTeam, ctx });
    }

    // Una dozzina di team (o quanti ne servono), deterministici: stesso formato e stesso seme, stessi team.
    // Restituisce { team: [{ nome, piano, strategia, testo, specie[] }], avvisi: [] }
    async function generaTeam(opzioni) {
        const quanti = opzioni.quanti || 12;
        const rnd = creaCasuale(opzioni.seme || 'cpu');
        const prepBase = await preparaFormato(opzioni, rnd);
        if (prepBase.insufficiente) return { team: [], avvisi: prepBase.avvisi };

        const stile = stileDelTeam(opzioni.personalita);
        const prep = conStile(prepBase, stile);
        const { dex, ctx, cand, tipi, assi } = prep;
        const piani = pianiPesati(prep.piani, stile);
        const usoGlobale = new Map();
        const massimo = Math.max(2, Math.ceil(quanti / 3));
        const team = [];
        const firme = [];

        for (let tentativo = 0; tentativo < quanti * 6 && team.length < quanti; tentativo++) {
            const n = team.length;
            const piano = pianoDi(piani[(n + Math.floor(tentativo / quanti)) % piani.length], ctx);
            // asso: tra i migliori ancora poco usati
            const poolAssi = assi.filter(c => (usoGlobale.get(chiaveUso(c)) || 0) < massimo).slice(0, 24);
            if (!poolAssi.length) break;
            const asso = poolAssi[Math.floor(rnd() * Math.min(poolAssi.length, 8 + tentativo))] || poolAssi[0];
            const membri = compone(dex, cand, ctx, piano, rnd, usoGlobale, asso, tipi, massimo);
            if (membri.length < 6) continue;
            const specie = membri.map(chiaveUso);
            // team troppo simile a uno già fatto: si riprova
            if (firme.some(f => sovrapposizione(f, specie) >= 4)) continue;

            const fatto = costruisciTeam(prep, rnd, membri, piano, asso);
            if (!fatto) continue;
            if (stile) fatto.personalita = stile.id;
            team.push(fatto);
            firme.push(specie);
            new Set(specie).forEach(x => usoGlobale.set(x, (usoGlobale.get(x) || 0) + 1));   // un team conta una volta per specie, anche con le copie
        }
        return { team, avvisi: prepBase.avvisi };
    }

    // Un team solo, a caso, da una preparazione già fatta (preparaFormato). Piano e asso sono a caso; `recenti` sono i team già
    // incontrati nella sessione (liste di `chiavi`, dal più vecchio al più nuovo). Per non vedere sempre gli stessi Pokémon:
    //   - regole dure sui più recenti: con il team di prima al massimo UN Pokémon in comune, con quello ancora prima al massimo due,
    //     con gli altri al massimo tre;
    //   - memoria lunga: ogni Pokémon pesa tanto quanto è comparso di recente e spesso (i più recenti contano di più, ma anche quelli
    //     di dieci team fa lasciano una traccia), così a lungo andare escono tutti e non i soliti dieci;
    //   - ogni volta una parte dei candidati (circa un terzo) resta "in panchina", a caso: il team non si costruisce sempre intorno
    //     agli stessi pezzi migliori.
    // Restituisce il team (con `chiavi`, da passare poi tra i `recenti`) o null.
    const PESI_RECENTI = [4, 3, 2.4, 1.8, 1.4, 1.1, .9, .7, .6, .5, .4, .3];       // dal team più recente al più vecchio
    const PESO_USO_CPU = 0.8;                                                      // quanto costa un Pokémon già visto (compone: uso × peso)
    const MASSIMO_COMUNI = [1, 2, 3];                                              // con il team di prima, con quello prima ancora, con gli altri
    function troppoSimile(chiavi, recenti) {
        for (let i = 0; i < recenti.length; i++) {
            const eta = recenti.length - 1 - i;                                    // 0 = il team di prima
            if (sovrapposizione(recenti[i], chiavi) > MASSIMO_COMUNI[Math.min(eta, MASSIMO_COMUNI.length - 1)]) return true;
        }
        return false;
    }
    function unTeam(prepBase, rnd, { recenti = [], personalita = null } = {}) {
        const stile = stileDelTeam(personalita);
        const prep = conStile(prepBase, stile);
        const { dex, ctx, cand, tipi, assi } = prep;
        const piani = pianiPesati(prep.piani, stile);
        const massimo = 2;
        // Prima si cerca un team che non somigli ai recenti; se il formato ha pochi Pokémon (una sola lettera, un solo tipo) può non
        // esserci, e allora ci si accontenta: meglio un team un po' simile che nessun team.
        let ripiego = null;     // un team con il tema non riuscito (niente setter nel gruppo): lo si usa solo se non ne esce uno coerente
        for (const evita of recenti.length ? [recenti, []] : [[]]) {
            const usoGlobale = new Map();
            evita.forEach((chiavi, i) => {
                const peso = PESI_RECENTI[Math.min(PESI_RECENTI.length - 1, evita.length - 1 - i)];
                for (const k of chiavi) usoGlobale.set(k, (usoGlobale.get(k) || 0) + peso);
            });
            for (let tentativo = 0; tentativo < (evita.length ? 14 : 6); tentativo++) {
                const piano = pianoDi(piani[Math.floor(rnd() * piani.length)], ctx);
                // la panchina: circa un terzo dei candidati non gioca in questo team (mai se così ne restano troppo pochi)
                const inCampo = cand.filter(() => rnd() > 0.33);
                const scelta = inCampo.length >= 40 ? inCampo : cand;
                const poolAssi = assi.filter(c => scelta.includes(c) && (usoGlobale.get(chiaveUso(c)) || 0) < massimo).slice(0, 36);
                if (!poolAssi.length) continue;
                const asso = poolAssi[Math.floor(rnd() * Math.min(poolAssi.length, 8 + Math.floor(rnd() * 20)))] || poolAssi[0];
                const membri = compone(dex, scelta, ctx, piano, rnd, usoGlobale, asso, tipi, massimo, PESO_USO_CPU);
                if (membri.length < 6) continue;
                const chiavi = Array.from(new Set(membri.map(chiaveUso)));
                if (evita.length && troppoSimile(chiavi, evita)) continue;
                const fatto = costruisciTeam(prep, rnd, membri, piano, asso);
                if (!fatto) continue;
                if (stile) fatto.personalita = stile.id;
                if (fatto.strategia && fatto.strategia.coerente === false) { if (!ripiego) ripiego = Object.assign(fatto, { chiavi }); continue; }
                return Object.assign(fatto, { chiavi });
            }
        }
        return ripiego;
    }

    // =================================================
    // DAL REGOLAMENTO AI TEAM
    // =================================================
    // Gestisce le scelte che alcuni formati lasciano a chi compone il team:
    //   - iniziale del nome (name_starts = PLAYER_INITIAL): la CPU usa le iniziali date, o una a caso con abbastanza Pokémon;
    //   - "stesso ... in tutto il team" (SAME_ACROSS_TEAM): un valore diverso per ogni team, tra quelli con abbastanza Pokémon.
    // Ognuna di queste scelte è una "variante" del regolamento, con il suo pool di Pokémon.
    // opzioni: { regolamento, caricaJson, pokedexBase, consigli, iniziali }
    // Restituisce { varianti: [{ regolamento, etichetta, pool?, scelte? }], pokedexBase, consigli, poolDi(regolamento) }
    async function elencaVarianti(opzioni) {
        const regolamento = opzioni.regolamento;
        const caricaJson = opzioni.caricaJson;
        let pokedexBase = opzioni.pokedexBase;
        if (!pokedexBase) pokedexBase = Pool.minuscole(await caricaJson('pkm-gens/pokedex_base.json'));
        // i consigli (mosse, strumenti, abilità di solito giocati) della generazione: senza il file i team si fanno lo stesso
        let consigli = opzioni.consigli;
        if (consigli === undefined && Consigli) consigli = await Consigli.carica(generazioneFormato(regolamento), caricaJson);

        const rPoke = regolamento.restrizioni && regolamento.restrizioni.pokemon;
        const nameStarts = rPoke && rPoke.name_starts;
        const same = Pool.chiaviSameAcross(regolamento);

        // varianti del regolamento: ognuna produce un gruppo di team
        let varianti = [{ regolamento, etichetta: '' }];
        const poolDi = async (reg, opz) => (await Pool.caricaPool(reg, caricaJson, Object.assign({ pokedexBase }, opz || {}))).pokemon;

        if (nameStarts && nameStarts.mode === 'PLAYER_INITIAL') {
            const reg0 = JSON.parse(JSON.stringify(regolamento));
            let lettere = (opzioni.iniziali || []).map(x => String(x).trim().charAt(0).toLowerCase()).filter(Boolean);
            if (!lettere.length) {
                // tutte le lettere con almeno 9 Pokémon nel pool: se ne pescano a caso
                const tutti = await poolDi(Object.assign({}, reg0, { restrizioni: Object.assign({}, reg0.restrizioni, { pokemon: Object.assign({}, reg0.restrizioni.pokemon, { name_starts: undefined }) }) }));
                const conta = {};
                tutti.forEach(p => { const l = p.name.charAt(0).toLowerCase(); conta[l] = (conta[l] || 0) + 1; });
                lettere = Object.keys(conta).filter(l => conta[l] >= 9).sort();
            }
            varianti = lettere.map(l => {
                const reg = JSON.parse(JSON.stringify(regolamento));
                reg.restrizioni.pokemon.name_starts = { mode: 'VALUE', operator: 'STARTS_WITH', value: l };
                return { regolamento: reg, etichetta: l.toUpperCase() };
            });
        }

        if (same.length) {
            const ampliate = [];
            for (const v of varianti) {
                const base = Pool.senzaSameAcross(v.regolamento);
                const pool = await poolDi(base);
                // tutte le combinazioni di valori (di solito è una sola caratteristica)
                let combinazioni = [{}];
                for (const chiave of same) {
                    const conteggio = Pool.valoriPossibili(pokedexBase, pool, chiave);
                    const valori = Object.keys(conteggio).filter(x => conteggio[x] >= 8);
                    const nuove = [];
                    for (const c of combinazioni) for (const val of valori) nuove.push(Object.assign({}, c, { [chiave]: val }));
                    combinazioni = nuove;
                }
                combinazioni.forEach(c => ampliate.push({ regolamento: v.regolamento, base, pool, scelte: c, etichetta: [v.etichetta].concat(Object.values(c)).filter(Boolean).join(' ') }));
            }
            varianti = ampliate;
        }
        return { varianti, pokedexBase, consigli, poolDi };
    }

    // Il pool di una variante (i Pokémon che quella variante ammette)
    async function poolDellaVariante(v, pokedexBase, poolDi) {
        if (v.scelte) return v.pool.filter(p => Object.keys(v.scelte).every(k => Pool.corrispondeAllaScelta(pokedexBase, p, k, v.scelte[k])));
        return poolDi(v.regolamento);
    }

    // opzioni: { Dex, TeamValidator, regolamento, caricaJson, pokedexBase, quanti, seme, iniziali }
    async function squadrePerFormato(opzioni) {
        const regolamento = opzioni.regolamento;
        const quanti = opzioni.quanti || 12;
        const seme = opzioni.seme || ('cpu|' + (regolamento.categoria || '') + '|' + (regolamento.genRuleValue || ''));
        const rnd = creaCasuale(seme + '|orchestratore');
        const avvisi = [];
        const { varianti, pokedexBase, consigli, poolDi } = await elencaVarianti(opzioni);

        // numero di team per variante
        const perVariante = Math.max(1, Math.ceil(quanti / Math.max(1, varianti.length)));
        let scelte = varianti;
        if (varianti.length > quanti) {
            scelte = [];
            const copia = varianti.slice();
            while (scelte.length < quanti && copia.length) scelte.push(copia.splice(Math.floor(rnd() * copia.length), 1)[0]);
        }

        const out = [];
        for (let i = 0; i < scelte.length && out.length < quanti; i++) {
            const v = scelte[i];
            const pool = await poolDellaVariante(v, pokedexBase, poolDi);
            const quantiQui = Math.min(perVariante, quanti - out.length);
            const r = await generaTeam({
                Dex: opzioni.Dex, TeamValidator: opzioni.TeamValidator, pool, regolamento: v.regolamento,
                quanti: quantiQui, seme: `${seme}|${i}|${v.etichetta}`, pokedexBase, consigli, parametriTeam: opzioni.parametriTeam, meta: opzioni.meta, personalita: opzioni.personalita
            });
            r.avvisi.forEach(a => avvisi.push(a));
            r.team.forEach(t => out.push(Object.assign(t, v.etichetta ? { nome: `${t.nome} (${v.etichetta})` } : {})));
        }
        // numerazione stabile
        out.forEach((t, i) => { t.numero = i + 1; });
        return { team: out, avvisi };
    }

    // =================================================
    // UN TEAM ALLA VOLTA (la prova contro la CPU)
    // =================================================
    // Invece di una dozzina di team fatti in anticipo e ricordati, il team si compone quando inizia la sfida, a caso.
    // La parte lenta (preparaFormato: leggere le mosse di un centinaio di Pokémon) si fa una volta per formato e per variante e si
    // tiene in memoria finché la pagina resta aperta: il primo team costa una frazione di secondo, quelli dopo pochi millisecondi.
    //   const sessione = await preparaSessione({ Dex, TeamValidator, regolamento, caricaJson, iniziali });
    //   const { team, avvisi } = await nuovoTeam(sessione, { recenti });     // team = null se il formato non ha abbastanza Pokémon
    async function preparaSessione(opzioni) {
        const { varianti, pokedexBase, consigli, poolDi } = await elencaVarianti(opzioni);
        const regolamento = opzioni.regolamento;
        const semeBase = opzioni.seme || ('cpu|' + (regolamento.categoria || '') + '|' + (regolamento.genRuleValue || ''));
        return { opzioni, varianti, pokedexBase, consigli, poolDi, semeBase, preparati: new Map() };
    }

    // La preparazione di una variante, la prima volta; poi quella in memoria (anche se due richieste arrivano insieme)
    function preparaVariante(sessione, indice) {
        if (!sessione.preparati.has(indice)) {
            const v = sessione.varianti[indice];
            const lavoro = (async () => {
                const pool = await poolDellaVariante(v, sessione.pokedexBase, sessione.poolDi);
                // la scelta dei candidati fuori dal comune dipende solo dal formato: così la preparazione è sempre la stessa
                return preparaFormato({
                    Dex: sessione.opzioni.Dex, TeamValidator: sessione.opzioni.TeamValidator, pool, regolamento: v.regolamento,
                    pokedexBase: sessione.pokedexBase, consigli: sessione.consigli, parametriTeam: sessione.opzioni.parametriTeam, meta: sessione.opzioni.meta
                }, creaCasuale(`${sessione.semeBase}|prep|${indice}|${v.etichetta}`));
            })();
            // un errore (rete...) non si ricorda: la volta dopo si riprova
            lavoro.catch(() => sessione.preparati.delete(indice));
            sessione.preparati.set(indice, lavoro);
        }
        return sessione.preparati.get(indice);
    }

    // opzioni: { seme (a caso se manca), recenti: [chiavi di team già incontrati], variantiDaProvare, personalita (cpu-personalita.js: lo stile per cui compone il team; il team lo riporta in `personalita`) }
    async function nuovoTeam(sessione, opzioni = {}) {
        const rnd = creaCasuale(opzioni.seme || `${Date.now()}|${Math.random()}`);
        const recenti = opzioni.recenti || [];
        const ordine = sessione.varianti.map((_, i) => i);
        for (let i = ordine.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ordine[i], ordine[j]] = [ordine[j], ordine[i]]; }
        const avvisi = [];
        // una variante può non avere abbastanza Pokémon (una lettera rara): se ne prova un'altra
        for (const i of ordine.slice(0, opzioni.variantiDaProvare || 4)) {
            const prep = await preparaVariante(sessione, i);
            prep.avvisi.forEach(a => { if (!avvisi.includes(a)) avvisi.push(a); });
            if (prep.insufficiente) continue;
            const team = unTeam(prep, rnd, { recenti, personalita: opzioni.personalita });
            if (!team) continue;
            const etichetta = sessione.varianti[i].etichetta;
            if (etichetta) team.nome = `${team.nome} (${etichetta})`;
            return { team, avvisi };
        }
        return { team: null, avvisi };
    }

    return {
        generaTeam, squadrePerFormato, preparaFormato, unTeam, preparaSessione, nuovoTeam,
        contestoDa, generazioneFormato, livelloFormato, formatoInDoppio, meccaniche, mosseApprese,
        voceBannata, creaCasuale, puntiTier, datiStrumento, strategiaDelTeam, PARAMETRI_TEAM, PARAMETRI_TEAM_VECCHI, PARAMETRI_TEAM_PRECEDENTI, PIANI_DOPPIO, PIANI_SINGOLO
    };
});
