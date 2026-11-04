// =====================================================
// PALESTRA — Poké-Tournament
//
// La palestra di un allenatore: tre format, un team del suo Box per ognuno, l'ordine in cui si affrontano e un vantaggio per format
// che si attiva a inizio partita. Chi la sfida porta un suo team per ogni format e li affronta di fila contro la CPU (che gioca i team
// della palestra): se perde una partita si ricomincia da capo. Le battaglie sono sempre doppie, portando 6 e scegliendo 4.
//
// Dati (players/<id>/info/palestra):  { tappe: [ { formato: <chiave del regolamento>, categoria: <nome del format>, team: <id del team nel Box>, vantaggio: <id> } x3 ] }
// (in ordine: la prima tappa si affronta per prima). I team seguono il Box: se si modificano, cambia anche la palestra.
//
//   Palestra.VANTAGGI                      il catalogo dei vantaggi: { id, tipo: 'campo' | 'boost', nome, descr, gen (generazione minima) ... }
//   Palestra.vantaggiPer(gen)              quelli che esistono in quella generazione
//   Palestra.perId(id)
//   Palestra.eDoppio(regolamento)          il format si gioca in doppio? (la palestra ammette solo quelli)
//   Palestra.tappeDi(config)               le tre tappe in ordine, anche se Firebase le ha date come oggetto
//   Palestra.problemi(config, { regolamenti, teams })   cosa non va nella configurazione ([] se è a posto)
//   Palestra.nuovaSfida(squadre) / avanza(sfida) / azzera(sfida) / finita(sfida)   lo stato di chi sfida (puro)
//   Palestra.chiaveSfida / leggiSfida / salvaSfida   i progressi di chi sfida, nel suo browser (localStorage passato da fuori)
//   Palestra.applica(battle, vantaggio)    applica il vantaggio a una battaglia del simulatore appena iniziata (prima del turno 1), annunciandolo nel log
//   Palestra.proteggi(battle, vantaggio)   i boost del vantaggio non si abbassano per abilità (da chiamare appena creata la partita)
//   Palestra.testoAnnuncio(vantaggio, gen) il testo che avvisa chi sfida del vantaggio
//   Palestra.temaPalestra(aspetto, PaginaPubblica, Cosmetici)   colori, sfondo ed effetti della palestra in battaglia (dalla pagina pubblica del capopalestra)
//
// Niente DOM, niente Firebase: si prova in Node (test/palestra.test.js).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Palestra = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TAPPE = 3;

    // Un vantaggio di campo vale per TUTTA la partita: nessuno lo può togliere né sostituire (Drizzle non spegne il sole, un altro Trick Room non annulla il primo, Psychic Surge non
    // cancella il campo erboso...). Uno di boost alza le statistiche dei due Pokémon in campo all'inizio e le abilità (Intimidate...) non le possono abbassare, le mosse sì.
    // `cond`: l'id della condizione del simulatore; `dove`: 'meteo' | 'terreno' | 'campo' (effetto che vale per tutti) | 'lato' (solo per la palestra); `gen`: generazione minima.
    const VANTAGGI = [
        { id: 'tailwind', tipo: 'campo', icona: '🌪️', nome: 'Tailwind', descr: 'Tailwind on the gym side, all battle long', annuncio: "A roaring tailwind blows behind the gym's team for the whole battle: its Pokémon are twice as fast, and nothing can stop it!", cond: 'tailwind', dove: 'lato', gen: 4 },
        { id: 'rain', tipo: 'campo', icona: '🌧️', nome: 'Rain', descr: 'Rain all battle long', annuncio: 'Rain pours over the arena for the whole battle. Water moves get stronger, Fire moves get soaked, and nobody can change the weather!', cond: 'raindance', dove: 'meteo', gen: 2 },
        { id: 'sun', tipo: 'campo', icona: '☀️', nome: 'Sun', descr: 'Harsh sunlight all battle long', annuncio: 'The sun blazes over the arena for the whole battle. Fire moves get stronger, Water moves fizzle, and nobody can change the weather!', cond: 'sunnyday', dove: 'meteo', gen: 2 },
        { id: 'sand', tipo: 'campo', icona: '🏜️', nome: 'Sandstorm', descr: 'A sandstorm all battle long', annuncio: 'A sandstorm sweeps the arena for the whole battle. Everyone except Rock, Ground and Steel gets battered every turn, and nobody can change the weather!', cond: 'sandstorm', dove: 'meteo', gen: 2 },
        { id: 'snow', tipo: 'campo', icona: '❄️', nome: 'Snow / Hail', descr: 'Snow (Hail before Gen 9) all battle long', annuncio: 'A blizzard rolls over the arena for the whole battle. Ice types toughen up, Blizzard never misses, and nobody can change the weather!', annuncioAntica: 'A hailstorm pelts the arena for the whole battle. Everyone except Ice types gets battered every turn, Blizzard never misses, and nobody can change the weather!', cond: 'snowscape', condAntica: 'hail', dove: 'meteo', gen: 3 },
        { id: 'electric', tipo: 'campo', icona: '⚡', nome: 'Electric Terrain', descr: 'Electric Terrain all battle long', annuncio: 'The floor crackles with Electric Terrain for the whole battle: grounded Electric moves hit harder, nobody can fall asleep, and no other terrain can take its place!', cond: 'electricterrain', dove: 'terreno', gen: 6 },
        { id: 'grassy', tipo: 'campo', icona: '🌿', nome: 'Grassy Terrain', descr: 'Grassy Terrain all battle long', annuncio: 'Grass sprouts across the arena for the whole battle: grounded Grass moves hit harder, grounded Pokémon heal a little each turn, and no other terrain can take its place!', cond: 'grassyterrain', dove: 'terreno', gen: 6 },
        { id: 'psychic', tipo: 'campo', icona: '🔮', nome: 'Psychic Terrain', descr: 'Psychic Terrain all battle long', annuncio: 'A strange aura fills the arena for the whole battle: grounded Psychic moves hit harder, priority moves are blocked, and no other terrain can take its place!', cond: 'psychicterrain', dove: 'terreno', gen: 7 },
        { id: 'misty', tipo: 'campo', icona: '🌫️', nome: 'Misty Terrain', descr: 'Misty Terrain all battle long', annuncio: 'A soft mist covers the arena for the whole battle: grounded Pokémon cannot be put into a status condition, Dragon moves are weakened, and no other terrain can take its place!', cond: 'mistyterrain', dove: 'terreno', gen: 6 },
        { id: 'trickroom', tipo: 'campo', icona: '🌀', nome: 'Trick Room', descr: 'Trick Room all battle long', annuncio: 'The arena twists into a Trick Room for the whole battle: the slowest Pokémon move first, and using Trick Room again will not undo it!', cond: 'trickroom', dove: 'campo', gen: 4 },
        { id: 'boost-att', tipo: 'boost', icona: '🗡️', nome: '+2 Attack & Sp. Atk', descr: '+2 Attack and Special Attack to the gym leads', annuncio: "The gym's lead Pokémon step in fired up: +2 Attack and +2 Sp. Atk from the very first turn. Abilities like Intimidate can't bring them down!", boost: { atk: 2, spa: 2 }, gen: 1 },
        { id: 'boost-dif', tipo: 'boost', icona: '🛡️', nome: '+2 Defense & Sp. Def', descr: '+2 Defense and Special Defense to the gym leads', annuncio: "The gym's lead Pokémon step in armoured up: +2 Defense and +2 Sp. Def from the very first turn. Abilities can't bring them down!", boost: { def: 2, spd: 2 }, gen: 1 },
        { id: 'boost-vel', tipo: 'boost', icona: '💨', nome: '+2 Speed', descr: '+2 Speed to the gym leads', annuncio: "The gym's lead Pokémon step in at full tilt: +2 Speed from the very first turn. Abilities can't slow them down!", boost: { spe: 2 }, gen: 1 }
    ];
    const perId = id => VANTAGGI.find(v => v.id === id) || null;
    const vantaggiPer = gen => VANTAGGI.filter(v => v.gen <= (Number(gen) || 9));

    /** Il testo che avvisa chi sfida del vantaggio (`gen`: la generazione del format, per la neve che prima era grandine) */
    function testoAnnuncio(vantaggio, gen) {
        const v = typeof vantaggio === 'string' ? perId(vantaggio) : vantaggio;
        if (!v) return '';
        return v.annuncioAntica && (Number(gen) || 9) < 9 ? v.annuncioAntica : v.annuncio;
    }

    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

    /** La generazione di un regolamento, come la legge il sito (team-sito.js, generazioneFormato): genRuleValue, o vgcGen ("Gen 8"), o 9 */
    function generazioneDi(r) {
        const c = r || {};
        return parseInt(c.genRuleValue, 10) || parseInt(String(c.vgcGen || '').replace(/\D/g, ''), 10) || 9;
    }

    /** Il format si gioca in doppio? (stessa regola di formatoSimulatore in team-sito.js: il doppio esiste dalla Gen 3; il Random non conta) */
    function eDoppio(regolamento) {
        const r = regolamento || {};
        if (/random/i.test(String(r.categoria || r.nome || ''))) return false;
        const struttura = String(r.strutturaSito || 'custom').toLowerCase().trim();
        const doppio = struttura === 'vgc'
            ? !String(r.vgcFormat || 'doubles').toLowerCase().startsWith('singles')
            : r.battleStyle === 'doubles';
        return !!doppio && generazioneDi(r) >= 3;
    }

    const valori = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.keys(x).sort((a, b) => num(a) - num(b)).map(k => x[k]) : []);

    /** Le tre tappe in ordine: [{ formato, categoria, team, vantaggio }] (anche se Firebase ha dato un oggetto) */
    function tappeDi(config) {
        return valori(config && config.tappe).filter(t => t && typeof t === 'object').slice(0, TAPPE).map(t => ({
            formato: String(t.formato || ''), categoria: String(t.categoria || ''), team: String(t.team || ''), vantaggio: String(t.vantaggio || '')
        }));
    }

    /**
     * Cosa non va in una configurazione (testi per chi la imposta); [] se è a posto.
     * `regolamenti`: l'oggetto regolamenti di Firebase; `teams`: l'oggetto o l'elenco dei team del Box di chi la imposta (con id).
     */
    function problemi(config, { regolamenti = {}, teams = {} } = {}) {
        const out = [];
        const tappe = tappeDi(config);
        if (tappe.length !== TAPPE) return [`The gym needs ${TAPPE} formats, one team and one advantage for each.`];
        const elencoTeam = Array.isArray(teams) ? teams : Object.entries(teams || {}).map(([id, t]) => ({ id, ...(t || {}) }));
        const visti = new Set();
        tappe.forEach((t, i) => {
            const n = i + 1;
            const r = regolamenti && regolamenti[t.formato];
            if (!r) { out.push(`Stage ${n}: pick a format.`); return; }
            if (visti.has(t.formato)) out.push(`Stage ${n}: this format is already in the gym.`);
            visti.add(t.formato);
            if (!eDoppio(r)) out.push(`Stage ${n}: only doubles formats are allowed.`);
            const team = elencoTeam.find(x => x && x.id === t.team);
            if (!team) out.push(`Stage ${n}: pick a team from your Box.`);
            else if (String(team.categoria || team.category || '').toLowerCase().trim() !== String(r.categoria || '').toLowerCase().trim()) out.push(`Stage ${n}: that team is not for this format.`);
            const v = perId(t.vantaggio);
            if (!v) out.push(`Stage ${n}: pick an advantage.`);
            else if (v.gen > generazioneDi(r)) out.push(`Stage ${n}: ${v.nome} doesn't exist in this format's generation.`);
        });
        return out;
    }

    // ---- lo stato di chi sfida ------------------------------------------------------------------
    /** Una sfida nuova: i team che lo sfidante porta (uno per tappa) e nessuna tappa vinta */
    const nuovaSfida = squadre => ({ squadre: (squadre || []).slice(0, TAPPE).map(String), vinte: 0 });
    const finita = sfida => !!sfida && sfida.vinte >= TAPPE;
    /** Vinta una tappa: si passa alla prossima */
    const avanza = sfida => ({ ...sfida, vinte: Math.min(TAPPE, (sfida.vinte || 0) + 1) });
    /** Persa (o pareggiata) una tappa: da capo, con gli stessi team */
    const azzera = sfida => ({ ...sfida, vinte: 0 });

    /** Dove chi sfida tiene i progressi (nel suo browser): una sfida per ogni coppia sfidante/palestra */
    const chiaveSfida = (sfidante, palestra) => `palestra:${String(sfidante).toLowerCase().trim()}:${String(palestra).toLowerCase().trim()}`;
    function leggiSfida(storage, chiave) {
        try {
            const j = JSON.parse(storage.getItem(chiave));
            if (j && Array.isArray(j.squadre)) return { squadre: j.squadre.slice(0, TAPPE).map(String), vinte: Math.max(0, Math.min(TAPPE, num(j.vinte))) };
        } catch (e) { /* nessuna sfida salvata */ }
        return null;
    }
    function salvaSfida(storage, chiave, sfida) { try { storage.setItem(chiave, JSON.stringify(sfida)); } catch (e) { /* senza: si riparte dalla prima tappa */ } }

    // ---- l'aspetto della palestra in battaglia -------------------------------------------------------
    /**
     * Come deve sembrare la palestra di un allenatore nel simulatore: i colori, lo sfondo e gli effetti della sua pagina pubblica (players/<id>/info: color, pagina, aura,
     * effettoNome, effettoPalco). `PaginaPubblica` e `Cosmetici` sono i moduli del sito (passati da fuori: questo file non dipende da loro). Ritorna
     *   { variabili: { '--pp-*': ..., '--pal-*': ... } (da scrivere sul <html>), colore, avatar, aura: {id, colore} | null, effettoNome, effettoPalco, scritta (testo del nome gigante o ''), scorre }
     * Qualunque cosa ci sia nel database passa dalle liste di scelte ammesse di PaginaPubblica.normalizza e dal catalogo dei cosmetici: niente testo libero arriva al CSS.
     */
    function temaPalestra(aspetto, PaginaPubblica, Cosmetici) {
        const a = aspetto || {};
        const P = PaginaPubblica;
        const colore = P.esadecimale(a.colore, '#ff7b6b');
        const config = P.normalizza(a.pagina);
        const sf = P.sfondoCss(config.sfondo, colore);
        const variabili = Object.assign({}, P.variabiliCss(config, colore), {
            '--pal-colore': colore,
            '--pal-colore-ink': P.inchiostroSu(colore),
            '--pal-cielo-a': P.mescola(sf.colore, P.luminanza(sf.colore) < 0.3 ? 0.14 : -0.1),
            '--pal-cielo-b': P.mescola(sf.colore, P.luminanza(sf.colore) < 0.3 ? 0.3 : 0.55),
            '--pal-pavimento-a': P.mescola(sf.colore, P.luminanza(sf.colore) < 0.3 ? 0.12 : -0.2),
            '--pal-pavimento-b': P.mescola(sf.colore, P.luminanza(sf.colore) < 0.3 ? -0.2 : -0.5)
        });
        const cosmetico = (id, tipo) => { const c = Cosmetici && Cosmetici.perId ? Cosmetici.perId(id) : null; return c && c.tipo === tipo ? c : null; };
        const aura = cosmetico(a.aura, 'aura');
        const nome = cosmetico(a.effettoNome, 'nome');
        const palco = cosmetico(a.effettoPalco, 'palco');
        return {
            variabili, colore,
            avatar: typeof a.avatar === 'string' ? a.avatar : '',
            aura: aura ? { id: aura.id, colore: aura.colore || colore } : null,
            effettoNome: nome ? nome.id : null,
            effettoPalco: palco ? palco.id : null,
            scritta: config.sfondo.scritta ? 'on' : '',
            scorre: !!config.sfondo.animato && sf.periodo > 0,
            inchiostro: P.inchiostroSu(sf.colore)
        };
    }

    // ---- il simulatore -----------------------------------------------------------------------------
    /** Gli id delle condizioni del simulatore che un vantaggio di campo tiene fisse (per scrivere "all battle" invece dei turni che restano) */
    function condizioniFisse(vantaggio) {
        const v = typeof vantaggio === 'string' ? perId(vantaggio) : vantaggio;
        return v && v.tipo === 'campo' ? [v.cond, v.condAntica].filter(Boolean) : [];
    }

    /**
     * Applica il vantaggio a una battaglia del simulatore (Battle di @pkmn/sim) i cui Pokémon sono già in campo ma il turno 1 non è ancora cominciato.
     * Il lato della palestra è `lato` ('p2' di solito). Ritorna { ok } (ok: false se il vantaggio non esiste in quella generazione).
     * Gli effetti di campo partono come se nessuno li avesse attivati, durano tutta la partita (durata 0 = infinita) e non si possono più togliere né sostituire; i boost vanno ai
     * Pokémon in campo della palestra e le abilità (Intimidate...) non possono abbassarli, le mosse sì.
     * Prima dell'effetto scrive nel log una riga che lo annuncia ("GYM ADVANTAGE: ..."), così chi sfida non se lo perde: `nome` è il nome della palestra.
     */
    function applica(battle, vantaggio, lato = 'p2', nome = '') {
        const v = typeof vantaggio === 'string' ? perId(vantaggio) : vantaggio;
        if (!battle || !v) return { ok: false };
        const side = battle.sides.find(s => s.id === lato);
        const attivi = side ? side.active.filter(p => p && !p.fainted) : [];
        const fonte = attivi[0];
        if (!fonte) return { ok: false };
        const annuncia = () => battle.add('-message', `${v.icona || '🏟️'} GYM ADVANTAGE${nome ? ` · ${String(nome).replace(/[|\r\n]+/g, ' ')}'s gym` : ''}: ${v.nome}! ${testoAnnuncio(v, battle.gen)}`);
        if (v.tipo === 'boost') {
            annuncia();
            for (const p of attivi) battle.boost(v.boost, p, p, null, true, true);
            proteggi(battle, v, lato);
            return { ok: true };
        }
        const gen = battle.gen || 9;
        if (v.gen > gen) return { ok: false };       // il simulatore ha i dati di tutte le generazioni, ma l'effetto in quella non esisteva
        const cond = v.condAntica && gen < 9 ? v.condAntica : v.cond;
        const esiste = battle.dex.conditions.get(cond);
        if (!esiste || !esiste.exists) return { ok: false };
        annuncia();
        const field = battle.field;
        if (v.dove === 'meteo') {
            field.setWeather(cond, fonte);
            if (field.weatherState) field.weatherState.duration = 0;
            // niente più cambi di meteo (Drizzle, Rain Dance, Sunny Day...) né fine anticipata
            field.setWeather = () => false;
            field.clearWeather = () => false;
        } else if (v.dove === 'terreno') {
            field.setTerrain(cond, fonte);
            if (field.terrainState) field.terrainState.duration = 0;
            field.setTerrain = () => false;
            field.clearTerrain = () => false;
        } else if (v.dove === 'campo') {
            field.addPseudoWeather(cond, fonte);
            const st = field.pseudoWeather && field.pseudoWeather[cond];
            if (st) st.duration = 0;
            // un secondo Trick Room di solito annulla il primo: qui non succede
            const togli = field.removePseudoWeather.bind(field);
            field.removePseudoWeather = id => (String(id).replace(/[^a-z0-9]/gi, '').toLowerCase() === cond ? false : togli(id));
        } else {
            side.addSideCondition(cond, fonte);
            const st = side.sideConditions && side.sideConditions[cond];
            if (st) st.duration = 0;
            const togli = side.removeSideCondition.bind(side);
            side.removeSideCondition = id => (String(id).replace(/[^a-z0-9]/gi, '').toLowerCase() === cond ? false : togli(id));
        }
        return { ok: true };
    }

    /**
     * Da chiamare appena la partita è creata (i Pokémon d'apertura, con Intimidate, entrano in campo prima che il vantaggio parta): da lì le abilità avversarie non abbassano
     * le statistiche che il vantaggio di boost alza. Per gli altri vantaggi non fa niente. Si può chiamare più volte.
     */
    function proteggi(battle, vantaggio, lato = 'p2') {
        const v = typeof vantaggio === 'string' ? perId(vantaggio) : vantaggio;
        if (!battle || !v || v.tipo !== 'boost' || battle.gymProtetto) return false;
        const side = battle.sides.find(s => s.id === lato);
        if (!side) return false;
        battle.gymProtetto = true;
        proteggiBoost(battle, side, Object.keys(v.boost));
        return true;
    }

    /** Le statistiche alzate dal vantaggio non scendono per colpa di un'abilità avversaria (Intimidate...): sono le abilità a contare, le mosse (Parting Shot...) le abbassano lo stesso */
    function proteggiBoost(battle, side, stat) {
        const originale = battle.boost.bind(battle);
        battle.boost = function (boost, target, source, effect, ...resto) {
            const bersaglio = target || (this.event && this.event.target);
            const chi = source || (this.event && this.event.source);
            const causa = effect || this.effect;
            if (bersaglio && bersaglio.side === side && chi && chi !== bersaglio && causa && causa.effectType === 'Ability' && boost) {
                const resta = {};
                let tolto = false;
                for (const [k, n] of Object.entries(boost)) {
                    if (n < 0 && stat.includes(k)) tolto = true;
                    else resta[k] = n;
                }
                if (tolto) {
                    this.add('-message', `${bersaglio.name}'s gym boost can't be shaken by abilities!`);
                    if (!Object.keys(resta).length) return false;
                    boost = resta;
                }
            }
            return originale(boost, target, source, effect, ...resto);
        };
    }

    return { TAPPE, VANTAGGI, perId, vantaggiPer, generazioneDi, eDoppio, tappeDi, problemi, nuovaSfida, avanza, azzera, finita, chiaveSfida, leggiSfida, salvaSfida, applica, proteggi, condizioniFisse, testoAnnuncio, temaPalestra };
});
