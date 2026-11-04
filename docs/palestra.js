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

    // Un vantaggio di campo mette un effetto per `turni` turni, senza che nessuno l'abbia attivato; uno di boost alza le statistiche dei due Pokémon in campo all'inizio.
    // `cond`: l'id della condizione del simulatore; `dove`: 'meteo' | 'terreno' | 'campo' (effetto che vale per tutti) | 'lato' (solo per la palestra); `gen`: generazione minima.
    const VANTAGGI = [
        { id: 'tailwind', tipo: 'campo', icona: '🌪️', nome: 'Tailwind', descr: 'Tailwind on the gym side for 3 turns', annuncio: "A roaring tailwind blows behind the gym's team: its Pokémon are twice as fast for 3 turns!", cond: 'tailwind', dove: 'lato', turni: 3, gen: 4 },
        { id: 'rain', tipo: 'campo', icona: '🌧️', nome: 'Rain', descr: 'Rain for 5 turns', annuncio: 'Rain hammers the arena for 5 turns. Water moves get stronger, Fire moves get soaked!', cond: 'raindance', dove: 'meteo', turni: 5, gen: 2 },
        { id: 'sun', tipo: 'campo', icona: '☀️', nome: 'Sun', descr: 'Harsh sunlight for 5 turns', annuncio: 'The sun blazes over the arena for 5 turns. Fire moves get stronger, Water moves fizzle!', cond: 'sunnyday', dove: 'meteo', turni: 5, gen: 2 },
        { id: 'sand', tipo: 'campo', icona: '🏜️', nome: 'Sandstorm', descr: 'A sandstorm for 5 turns', annuncio: 'A sandstorm sweeps the arena for 5 turns. Everyone except Rock, Ground and Steel gets battered every turn!', cond: 'sandstorm', dove: 'meteo', turni: 5, gen: 2 },
        { id: 'snow', tipo: 'campo', icona: '❄️', nome: 'Snow / Hail', descr: 'Snow (Hail before Gen 9) for 5 turns', annuncio: 'A blizzard rolls over the arena for 5 turns. Ice types toughen up, and Blizzard never misses!', annuncioAntica: 'A hailstorm pelts the arena for 5 turns. Everyone except Ice types gets battered every turn, and Blizzard never misses!', cond: 'snowscape', condAntica: 'hail', dove: 'meteo', turni: 5, gen: 3 },
        { id: 'electric', tipo: 'campo', icona: '⚡', nome: 'Electric Terrain', descr: 'Electric Terrain for 5 turns', annuncio: 'The floor crackles with Electric Terrain for 5 turns: grounded Electric moves hit harder and nobody can fall asleep!', cond: 'electricterrain', dove: 'terreno', turni: 5, gen: 6 },
        { id: 'grassy', tipo: 'campo', icona: '🌿', nome: 'Grassy Terrain', descr: 'Grassy Terrain for 5 turns', annuncio: 'Grass sprouts across the arena for 5 turns: grounded Grass moves hit harder and grounded Pokémon heal a little each turn!', cond: 'grassyterrain', dove: 'terreno', turni: 5, gen: 6 },
        { id: 'psychic', tipo: 'campo', icona: '🔮', nome: 'Psychic Terrain', descr: 'Psychic Terrain for 5 turns', annuncio: 'A strange aura fills the arena for 5 turns: grounded Psychic moves hit harder and priority moves are blocked!', cond: 'psychicterrain', dove: 'terreno', turni: 5, gen: 7 },
        { id: 'misty', tipo: 'campo', icona: '🌫️', nome: 'Misty Terrain', descr: 'Misty Terrain for 5 turns', annuncio: 'A soft mist covers the arena for 5 turns: grounded Pokémon cannot be put into a status condition and Dragon moves are weakened!', cond: 'mistyterrain', dove: 'terreno', turni: 5, gen: 6 },
        { id: 'trickroom', tipo: 'campo', icona: '🌀', nome: 'Trick Room', descr: 'Trick Room for 5 turns', annuncio: 'The arena twists into a Trick Room for 5 turns: the slowest Pokémon move first!', cond: 'trickroom', dove: 'campo', turni: 5, gen: 4 },
        { id: 'boost-att', tipo: 'boost', icona: '🗡️', nome: '+2 Attack & Sp. Atk', descr: '+2 Attack and Special Attack to the gym leads', annuncio: "The gym's lead Pokémon step in fired up: +2 Attack and +2 Sp. Atk from the very first turn!", boost: { atk: 2, spa: 2 }, gen: 1 },
        { id: 'boost-dif', tipo: 'boost', icona: '🛡️', nome: '+2 Defense & Sp. Def', descr: '+2 Defense and Special Defense to the gym leads', annuncio: "The gym's lead Pokémon step in armoured up: +2 Defense and +2 Sp. Def from the very first turn!", boost: { def: 2, spd: 2 }, gen: 1 },
        { id: 'boost-vel', tipo: 'boost', icona: '💨', nome: '+2 Speed', descr: '+2 Speed to the gym leads', annuncio: "The gym's lead Pokémon step in at full tilt: +2 Speed from the very first turn!", boost: { spe: 2 }, gen: 1 }
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
    /**
     * Applica il vantaggio a una battaglia del simulatore (Battle di @pkmn/sim) i cui Pokémon sono già in campo ma il turno 1 non è ancora cominciato.
     * Il lato della palestra è `lato` ('p2' di solito). Ritorna { ok, righe? } (niente se il vantaggio non esiste in quella generazione).
     * Gli effetti di campo partono come se nessuno li avesse attivati (si vede nel log come un effetto "naturale"); i boost vanno ai Pokémon in campo della palestra.
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
            return { ok: true };
        }
        const gen = battle.gen || 9;
        if (v.gen > gen) return { ok: false };       // il simulatore ha i dati di tutte le generazioni, ma l'effetto in quella non esisteva
        const cond = v.condAntica && gen < 9 ? v.condAntica : v.cond;
        const esiste = battle.dex.conditions.get(cond);
        if (!esiste || !esiste.exists) return { ok: false };
        annuncia();
        if (v.dove === 'meteo') {
            battle.field.setWeather(cond, fonte);
            if (battle.field.weatherState) battle.field.weatherState.duration = v.turni;
        } else if (v.dove === 'terreno') {
            battle.field.setTerrain(cond, fonte);
            if (battle.field.terrainState) battle.field.terrainState.duration = v.turni;
        } else if (v.dove === 'campo') {
            battle.field.addPseudoWeather(cond, fonte);
            const st = battle.field.pseudoWeather && battle.field.pseudoWeather[cond];
            if (st) st.duration = v.turni;
        } else {
            side.addSideCondition(cond, fonte);
            const st = side.sideConditions && side.sideConditions[cond];
            if (st) st.duration = v.turni;
        }
        return { ok: true };
    }

    return { TAPPE, VANTAGGI, perId, vantaggiPer, generazioneDi, eDoppio, tappeDi, problemi, nuovaSfida, avanza, azzera, finita, chiaveSfida, leggiSfida, salvaSfida, applica, testoAnnuncio, temaPalestra };
});
