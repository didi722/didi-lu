// =====================================================
// BATTLE-EXTRA — Poké-Tournament
//
// 1. Tooltip dei Pokémon rifatti nel nostro stile (stesso linguaggio dei
//    tooltip "coach" del box): abilità possibili, range di velocità, stat.
//    In una stagione open sheet le stat dell'avversario sono esatte e tengono
//    conto di boost, strumenti e abilità (Swords Dance → Atk esatto).
// 2. Tooltip delle mosse: compaiono con un breve ritardo e dicono su quale
//    avversario la mossa è superefficace, poco efficace o nulla.
// 3. Colonne laterali dei player: tag col nome, nome del team, i 6 Pokémon
//    (in campo, KO, HP). In open sheet ogni Pokémon ha il suo tooltip.
// 4. efficaciaBersaglio(): l'etichetta da scrivere sui bottoni dei bersagli.
// 5. Dentro lo schermo: l'avatar di ciascun player al posto di quello a caso
//    di Showdown. Fuori dallo schermo, con i turni rimasti: meteo, terreni e
//    Trick Room nella riga sotto lo schermo (#cab-campo); le condizioni di
//    ciascun lato (Stealth Rock, Tailwind…) nella colonna del suo player.
// 6. Posizione dei tooltip: tutti restano dentro la finestra; quelli dei Pokémon
//    in campo sono la versione compatta (.tt-compatto); quello di una carta della
//    colonna laterale si apre accanto alla colonna, mai sul Pokémon che si guarda.
//    Le carte si abbinano ai Pokémon di Showdown per forma e soprannome (abbina()),
//    non per specie base: due forme dello stesso Pokémon nel team non si confondono.
//
// Si appoggia ai file di Showdown già caricati dalla pagina
// (BattleTooltips, Dex, BattleNatures). Non tocca il motore della battaglia.
// =====================================================

const S = {
    installato: false,
    ritardoMosse: 350,          // ms prima che compaia il tooltip di una mossa
    openSheet: false,
    latiNoti: [],               // lati di cui si vedono sempre i set (il proprio; in locale entrambi)
    candidati: { p1: [], p2: [] }, // team registrati: [{ nome, set: [...] }]
    squadre: { p1: [], p2: [] },// set del team in uso, alla Showdown: { name, species, item, ability, nature, evs, ivs, level, moves }
    info: { p1: {}, p2: {} },   // { id, nome, team, avatar }
    schede: { p1: null, p2: null, risultato: null },   // titolo, ELO, badge e fiocchi dei due allenatori (scheda-battaglia.js)
    schedeChiave: '',
    battle: null,
    timerLati: null,
};

const idDi = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const esc = t => String(t ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STAT = ['atk', 'def', 'spa', 'spd', 'spe'];
const NOME_STAT = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };


// -----------------------------------------------------
// Configurazione (la chiama battle-ui.js)
// -----------------------------------------------------

/**
 * Da chiamare quando si sa qualcosa di nuovo sulla partita (si può richiamare).
 *  openSheet: seasons/{id}/info/open_sheet
 *  latiNoti:  ['p1'] per chi gioca P1, [] per chi guarda, ['p1', 'p2'] in locale
 *  p1/p2:     { nome, avatar, candidati: [{ nome, set }] }
 *             avatar = indirizzo di un'immagine (anche relativo) oppure il nome
 *             di un allenatore di Showdown (es. "cynthia"); senza avatar si usa
 *             la sagoma neutra di Showdown, non un allenatore a caso.
 *             candidati = i team registrati; quello in uso si riconosce dal team
 *             preview. Per un lato che non si può vedere basta { species } nei set.
 */
export function impostaPartita({ openSheet, latiNoti, p1, p2 } = {}) {
    if (openSheet !== undefined) S.openSheet = !!openSheet;
    if (latiNoti !== undefined) S.latiNoti = latiNoti || [];
    for (const [lato, dati] of [['p1', p1], ['p2', p2]]) {
        if (!dati) continue;
        if (dati.id !== undefined) S.info[lato].id = dati.id || '';
        if (dati.nome !== undefined) S.info[lato].nome = dati.nome;
        if (dati.avatar !== undefined) S.info[lato].avatar = dati.avatar || '';
        if (Array.isArray(dati.candidati)) {
            S.candidati[lato] = dati.candidati;
            S.squadre[lato] = [];
            S.info[lato].team = '';
        }
    }
    risolviSquadre();
    disegnaLati();
    caricaSchede();
}

// Titolo, ELO, posizione e badge dei due allenatori (e i fiocchi dei loro Pokémon): numeri pubblici, letti in disparte. Se non
// arrivano, o chi gioca non ha un profilo (la CPU), la colonna resta com'era.
function caricaSchede() {
    const SB = window.SchedaBattaglia;
    const ids = { p1: S.info.p1.id || '', p2: S.info.p2.id || '' };
    const chiave = JSON.stringify(ids);
    if (S.schedeChiave === chiave) return;
    S.schedeChiave = chiave;
    if (!SB || !window.firebase || (!ids.p1 && !ids.p2)) {
        if (S.schede.p1 || S.schede.p2) { S.schede = { p1: null, p2: null, risultato: null }; disegnaLati(); }
        return;
    }
    SB.carica(window.firebase.database(), ids).then(r => {
        if (S.schedeChiave !== chiave) return;      // nel frattempo sono cambiati i giocatori
        S.schede = r;
        disegnaLati();
    }).catch(e => console.warn('Trainer cards not available:', e));
}

// Il fumetto dei fiocchi di un Pokémon (sul tondino): si apre dove c'è posto, sopra o sotto, e non esce mai dallo schermo.
// Le misure sono quelle a schermo: nel layout "tutto in una schermata" la pagina è in scala, i valori CSS no.
function apriFumettoFiocchi(tondino) {
    const tip = tondino && tondino.querySelector('.fiocco-t-tip');
    if (!tip) return;
    const t = tondino.getBoundingClientRect();
    const scala = tondino.offsetWidth ? t.width / tondino.offsetWidth : 1;
    const larghezza = document.documentElement.clientWidth, altezza = window.innerHeight || document.documentElement.clientHeight;
    // lo si misura aperto ma invisibile, e solo dopo si mostra (aperto altrove allargherebbe la pagina)
    tip.style.display = 'block'; tip.style.visibility = 'hidden'; tip.style.left = '0px'; tip.style.right = 'auto';
    const misura = tip.getBoundingClientRect();
    const sotto = altezza - t.bottom, sopra = t.top;
    const inAlto = misura.height + 10 * scala > sotto && sopra > sotto;
    const sinistra = Math.max(6, Math.min(t.left, larghezza - 6 - misura.width));
    tip.style.left = `${(sinistra - t.left) / scala}px`;
    tip.style.top = inAlto ? 'auto' : 'calc(100% + 8px)';
    tip.style.bottom = inAlto ? 'calc(100% + 8px)' : 'auto';
    tip.style.display = ''; tip.style.visibility = '';
    tondino.classList.add('aperto');
}
function chiudiFumettoFiocchi(tondino) { if (tondino) tondino.classList.remove('aperto'); }
const tondinoDi = e => { const t = e.target && e.target.closest && e.target.closest('.fiocco-tondino'); return t && t.closest('.lato') ? t : null; };
// (si collega da installa(), con gli altri ascoltatori della pagina)
function collegaFumettiFiocchi() {
    document.addEventListener('mouseover', e => apriFumettoFiocchi(tondinoDi(e)));
    document.addEventListener('focusin', e => apriFumettoFiocchi(tondinoDi(e)));
    document.addEventListener('mouseout', e => { const t = tondinoDi(e); if (t && !t.contains(e.relatedTarget)) chiudiFumettoFiocchi(t); });
    document.addEventListener('focusout', e => chiudiFumettoFiocchi(tondinoDi(e)));
}

// Quale dei team registrati è in campo: quello con le stesse 6 specie del team preview
function risolviSquadre() {
    for (const lato of ['p1', 'p2']) {
        if (S.squadre[lato].length) continue;
        const candidati = S.candidati[lato] || [];
        if (!candidati.length) continue;
        let scelto = candidati.length === 1 ? candidati[0] : null;
        const anteprima = S.battle?.[lato]?.pokemon || [];
        if (!scelto && anteprima.length && window.Dex) {
            const firma = specie => specie.map(x => idDi(window.Dex.species.get(x).baseSpecies)).sort().join('|');
            const vista = firma(anteprima.map(p => p.speciesForme));
            scelto = candidati.find(c => firma(c.set.map(x => x.species)) === vista) || null;
        }
        if (scelto) {
            S.squadre[lato] = scelto.set;
            S.info[lato].team = scelto.nome;
        }
    }
}

/** Da chiamare ogni volta che nasce un nuovo campo (nuovo set). */
export function seguiBattaglia(battle) {
    S.battle = battle;
    risolviSquadre();
    clearInterval(S.timerLati);
    // Showdown aggiorna il campo a ogni animazione: le colonne si allineano da sole
    S.timerLati = setInterval(aggiornaLati, 400);
    disegnaLati();
}


// -----------------------------------------------------
// Installazione: estende BattleTooltips di Showdown
// -----------------------------------------------------
export function installa({ ritardoMosse, BattleTooltips } = {}) {
    if (ritardoMosse !== undefined) S.ritardoMosse = ritardoMosse;
    if (S.installato) return;
    const BT = BattleTooltips || window.BattleTooltips;
    if (!BT) {
        console.warn('battle-extra: BattleTooltips non trovato, carica prima i file di Showdown');
        return;
    }
    S.installato = true;
    S.BT = BT;

    // Avatar del sito: un indirizzo d'immagine passa così com'è
    const Dex = window.Dex;
    if (Dex?.resolveAvatar && !Dex.resolveAvatar.sito) {
        const risolvi = Dex.resolveAvatar.bind(Dex);
        Dex.resolveAvatar = avatar => String(avatar).startsWith('sito:') ? String(avatar).slice(5) : risolvi(avatar);
        Dex.resolveAvatar.sito = true;
    }
    const P = BT.prototype;
    collegaFumettiFiocchi();

    // Passare col mouse da una parte all'altra dello stesso bottone (nome, tipo, PP)
    // per il browser è uscire ed entrare: Showdown nasconderebbe e rimostrerebbe il
    // tooltip, e col ritardo il tooltip non resterebbe mai a schermo.
    // Questi movimenti interni non arrivano a Showdown (come mouseenter/mouseleave).
    const interno = e => {
        const t = e.target.closest?.('.has-tooltip');
        return !!t && !!e.relatedTarget && t.contains(e.relatedTarget);
    };
    document.addEventListener('mouseover', e => { if (interno(e)) e.stopPropagation(); }, true);

    // --- 0. Tutti i tooltip restano dentro la finestra ---
    // Showdown li piazza sopra l'elemento senza sapere che la pagina è rimpicciolita e può scorrere:
    // un Pokémon vicino al bordo, o un tooltip alto, uscirebbe dalla finestra.
    const piazzaOriginale = P.placeTooltip;
    if (typeof piazzaOriginale === 'function') {
        P.placeTooltip = function () {
            const ris = piazzaOriginale.apply(this, arguments);
            try { dentroFinestra(); } catch (e) { console.warn('battle-extra: tooltip non riposizionato', e); }
            return ris;
        };
    }

    // --- 1. Ritardo sui tooltip delle mosse ---
    // Un clic tenuto premuto (blocco del tooltip) o il tocco li mostrano subito.
    let attesa = null;
    let premuto = false;
    document.addEventListener('pointerdown', () => { premuto = true; setTimeout(() => { premuto = false; }); }, true);
    document.addEventListener('mouseout', e => {
        if (interno(e)) { e.stopPropagation(); return; }
        if (attesa && e.target.closest?.('.has-tooltip') === attesa.elem) annullaAttesa();
    }, true);
    function annullaAttesa() {
        if (attesa) clearTimeout(attesa.timer);
        attesa = null;
    }
    const mostraOriginale = P.showTooltip;
    P.showTooltip = function (elem) {
        annullaAttesa();
        const tipo = (elem.dataset.tooltip || '').split('|')[0];
        const eMossa = tipo === 'move' || tipo === 'zmove' || tipo === 'maxmove';
        if (!eMossa || premuto || BT.isLocked || S.ritardoMosse <= 0) return mostraOriginale.call(this, elem);
        BT.hideTooltip();
        attesa = {
            elem,
            timer: setTimeout(() => {
                attesa = null;
                const ancoraLi = elem.isConnected && (elem.matches(':hover') || document.activeElement === elem);
                if (ancoraLi && !BT.isLocked) mostraOriginale.call(this, elem);
            }, S.ritardoMosse),
        };
        return true;
    };

    // --- 2. Tooltip delle mosse: aggiungo l'efficacia sugli avversari ---
    const mossaOriginale = P.showMoveTooltip;
    P.showMoveTooltip = function (move, isZOrMax, pokemon, serverPokemon, gmaxMove) {
        const html = mossaOriginale.apply(this, arguments);
        try {
            return html + sezioneEfficacia(this, move, isZOrMax, pokemon, serverPokemon, gmaxMove);
        } catch (e) {
            console.warn('battle-extra: efficacia non calcolata', e);
            return html;
        }
    };

    // --- 3. Tooltip dei Pokémon nel nostro stile ---
    const pokemonOriginale = P.showPokemonTooltip;
    P.showPokemonTooltip = function (clientPokemon, serverPokemon, isActive, illusionIndex) {
        if (illusionIndex) return pokemonOriginale.apply(this, arguments);
        try {
            let daSheet = false;
            if (!serverPokemon && clientPokemon) {
                serverPokemon = serverDaSheet(this.battle, clientPokemon);
                daSheet = !!serverPokemon;
            }
            return htmlPokemon(this, clientPokemon, serverPokemon, { attivo: !!isActive, daSheet });
        } catch (e) {
            console.warn('battle-extra: tooltip Pokémon di riserva', e);
            return pokemonOriginale.apply(this, arguments);
        }
    };
}


// -----------------------------------------------------
// Posizione dei tooltip
// -----------------------------------------------------
const MARGINE_TOOLTIP = 8;

function tooltipVisibile() {
    const w = document.getElementById('tooltipwrapper');
    const tt = w?.querySelector('.tooltip');
    return tt ? { w, tt } : null;
}

// Sposta il tooltip (con una translate sul suo contenitore) in modo che il suo angolo
// in alto a sinistra arrivi a (x, y), in coordinate della finestra
function portaTooltipIn(w, tt, x, y) {
    w.style.transform = '';
    const r = tt.getBoundingClientRect();
    w.style.transform = `translate(${(x - r.left).toFixed(1)}px, ${(y - r.top).toFixed(1)}px)`;
}

// Tiene il tooltip dentro la finestra, spostandolo il minimo
function dentroFinestra() {
    const a = tooltipVisibile();
    if (!a) return;
    const { w, tt } = a;
    w.style.transform = '';
    const r = tt.getBoundingClientRect();
    const L = document.documentElement.clientWidth, A = window.innerHeight, m = MARGINE_TOOLTIP;
    let x = r.left, y = r.top;
    if (x + r.width > L - m) x = L - m - r.width;
    if (x < m) x = m;
    if (y + r.height > A - m) y = A - m - r.height;
    if (y < m) y = m;
    if (x !== r.left || y !== r.top) portaTooltipIn(w, tt, x, y);
}

// Tooltip di una carta della colonna laterale: mai sopra il Pokémon che si sta guardando né sugli altri
// della colonna. Nel layout "una schermata" (colonne ai lati dello schermo) sta accanto alla colonna,
// dalla parte dello schermo; nel layout a colonna (carte in riga sotto lo schermo) sopra la carta, o sotto se non c'è posto.
function tooltipAccanto(li) {
    const a = tooltipVisibile();
    if (!a) return;
    const { w, tt } = a;
    w.style.transform = '';
    const c = li.getBoundingClientRect();
    const r = tt.getBoundingClientRect();
    const L = document.documentElement.clientWidth, A = window.innerHeight, m = MARGINE_TOOLTIP;
    const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
    let x, y;
    if (document.documentElement.getAttribute('data-modo') === 'fit') {
        const colonna = (li.closest('.lato') || li).getBoundingClientRect();
        const aSinistra = colonna.left + colonna.width / 2 < L / 2;
        x = aSinistra ? colonna.right + 12 : colonna.left - 12 - r.width;
        y = c.top;
    } else {
        x = c.left + c.width / 2 - r.width / 2;
        y = c.top - 10 - r.height;
        if (y < m) y = c.bottom + 10;
    }
    x = clamp(x, m, Math.max(m, L - m - r.width));
    y = clamp(y, m, Math.max(m, A - m - r.height));
    portaTooltipIn(w, tt, x, y);
}


// -----------------------------------------------------
// Open sheet: dal set alle stat esatte
// -----------------------------------------------------
function latoDi(battle, side) {
    if (!side) return null;
    if (side.sideid) return side.sideid;           // 'p1' | 'p2' (side.id è il nome utente)
    return side.n === 1 ? 'p2' : 'p1';
}

// Il set del team che corrisponde a un Pokémon in campo: lo stesso abbinamento delle carte della colonna
// (abbina), così carta, tooltip e suggerimenti di efficacia parlano sempre dello stesso set. Se il Pokémon
// non è tra quelli di Showdown (o il lato non ha ancora un battle) si ripiega sulla forma e sul soprannome.
function setDi(lato, pokemon, dex) {
    const squadra = S.squadre[lato] || [];
    if (!squadra.length || !pokemon) return null;
    const battle = S.battle || { dex };
    const trovati = abbinaLato(lato, elencoLato(lato), battle);
    const i = trovati.indexOf(pokemon);
    if (i >= 0 && squadra[i]) return squadra[i];
    const forma = idDi(pokemon.speciesForme), nome = idDi(pokemon.name);
    const nomeDi = x => idDi(x.name || x.species);
    return squadra.find(x => idDi(x.species) === forma && nomeDi(x) === nome)
        || squadra.find(x => idDi(x.species) === forma)
        || squadra.find(x => nomeDi(x) === nome)
        || null;
}

function puoVedereSet(lato) {
    return S.openSheet || S.latiNoti.includes(lato);
}

// Un set "vero" (con mosse), non solo la specie
const setCompleto = set => !!set && Array.isArray(set.moves) && set.moves.length > 0;

function serverDaSheet(battle, clientPokemon) {
    const lato = latoDi(battle, clientPokemon.side);
    if (!puoVedereSet(lato)) return null;
    const set = setDi(lato, clientPokemon, battle.dex);
    return setCompleto(set) ? serverDaSet(battle, set, clientPokemon) : null;
}

const troncato = Math.trunc;

export function calcolaStat(baseStats, set, livello, gen = 8) {
    const natura = window.BattleNatures?.[set.nature] || {};
    const out = {};
    for (const stat of ['hp', ...STAT]) {
        const base = baseStats[stat];
        const iv = set.ivs?.[stat] ?? 31;
        const ev = set.evs?.[stat] ?? (gen <= 2 ? 252 : 0);
        let v = troncato(troncato(2 * base + iv + troncato(ev / 4)) * livello / 100);
        if (stat === 'hp') {
            out.hp = base === 1 ? 1 : v + livello + 10;
        } else {
            v += 5;
            if (natura.plus === stat) v = troncato(v * 1.1);
            else if (natura.minus === stat) v = troncato(v * 0.9);
            out[stat] = v;
        }
    }
    return out;
}

// Oggetto con la stessa forma dei "serverPokemon" della richiesta di Showdown
function serverDaSet(battle, set, clientPokemon) {
    const dex = battle.dex;
    const specie = dex.species.get(clientPokemon?.speciesForme || set.species);
    const livello = set.level || clientPokemon?.level || 100;
    const stats = calcolaStat(specie.baseStats, set, livello, battle.gen);
    const maxhp = stats.hp;
    let hp = maxhp;
    if (clientPokemon) {
        hp = clientPokemon.fainted ? 0
            : Math.round((clientPokemon.hp / (clientPokemon.maxhp || 100)) * maxhp);
    }
    const consumato = clientPokemon?.prevItem && !clientPokemon.item;
    return {
        ident: '', details: '',
        condition: `${hp}/${maxhp}`,
        name: set.name || specie.name,
        speciesForme: specie.name,
        level: livello,
        hp, maxhp,
        fainted: hp <= 0,
        status: clientPokemon?.status || '',
        gender: set.gender || clientPokemon?.gender || '',
        stats: { atk: stats.atk, def: stats.def, spa: stats.spa, spd: stats.spd, spe: stats.spe },
        moves: (set.moves || []).map(idDi),
        baseAbility: idDi(set.ability),
        ability: idDi(set.ability),
        item: consumato ? '' : idDi(set.item),
        pokeball: '', teraType: set.teraType || '', terastallized: '',
        hpApprossimato: !!clientPokemon,
        set,
    };
}


// -----------------------------------------------------
// Efficacia dei tipi
// -----------------------------------------------------
const TABELLA = {
    Normal: { 0.5: ['Rock', 'Steel'], 0: ['Ghost'] },
    Fire: { 2: ['Grass', 'Ice', 'Bug', 'Steel'], 0.5: ['Fire', 'Water', 'Rock', 'Dragon'] },
    Water: { 2: ['Fire', 'Ground', 'Rock'], 0.5: ['Water', 'Grass', 'Dragon'] },
    Electric: { 2: ['Water', 'Flying'], 0.5: ['Electric', 'Grass', 'Dragon'], 0: ['Ground'] },
    Grass: { 2: ['Water', 'Ground', 'Rock'], 0.5: ['Fire', 'Grass', 'Poison', 'Flying', 'Bug', 'Dragon', 'Steel'] },
    Ice: { 2: ['Grass', 'Ground', 'Flying', 'Dragon'], 0.5: ['Fire', 'Water', 'Ice', 'Steel'] },
    Fighting: { 2: ['Normal', 'Ice', 'Rock', 'Dark', 'Steel'], 0.5: ['Poison', 'Flying', 'Psychic', 'Bug', 'Fairy'], 0: ['Ghost'] },
    Poison: { 2: ['Grass', 'Fairy'], 0.5: ['Poison', 'Ground', 'Rock', 'Ghost'], 0: ['Steel'] },
    Ground: { 2: ['Fire', 'Electric', 'Poison', 'Rock', 'Steel'], 0.5: ['Grass', 'Bug'], 0: ['Flying'] },
    Flying: { 2: ['Grass', 'Fighting', 'Bug'], 0.5: ['Electric', 'Rock', 'Steel'] },
    Psychic: { 2: ['Fighting', 'Poison'], 0.5: ['Psychic', 'Steel'], 0: ['Dark'] },
    Bug: { 2: ['Grass', 'Psychic', 'Dark'], 0.5: ['Fire', 'Fighting', 'Poison', 'Flying', 'Ghost', 'Steel', 'Fairy'] },
    Rock: { 2: ['Fire', 'Ice', 'Flying', 'Bug'], 0.5: ['Fighting', 'Ground', 'Steel'] },
    Ghost: { 2: ['Psychic', 'Ghost'], 0.5: ['Dark'], 0: ['Normal'] },
    Dragon: { 2: ['Dragon'], 0.5: ['Steel'], 0: ['Fairy'] },
    Dark: { 2: ['Psychic', 'Ghost'], 0.5: ['Fighting', 'Dark', 'Fairy'] },
    Steel: { 2: ['Ice', 'Rock', 'Fairy'], 0.5: ['Fire', 'Water', 'Electric', 'Steel'] },
    Fairy: { 2: ['Fighting', 'Dragon', 'Dark'], 0.5: ['Fire', 'Poison', 'Steel'] },
};
function moltTipo(attacco, difesa, gen) {
    if (gen < 6 && difesa === 'Steel' && (attacco === 'Ghost' || attacco === 'Dark')) return 0.5;
    const r = TABELLA[attacco];
    if (!r) return 1;
    for (const k of [2, 0.5, 0]) if (r[k]?.includes(difesa)) return k;
    return 1;
}

// Abilità che annullano un tipo (se l'attaccante non ha Mold Breaker & co.)
const IMMUNITA = {
    levitate: 'Ground', eartheater: 'Ground',
    flashfire: 'Fire', wellbakedbody: 'Fire',
    waterabsorb: 'Water', stormdrain: 'Water', dryskin: 'Water',
    voltabsorb: 'Electric', lightningrod: 'Electric', motordrive: 'Electric',
    sapsipper: 'Grass',
};
const ROMPI_ABILITA = ['moldbreaker', 'teravolt', 'turboblaze'];

/**
 * Moltiplicatore della mossa su un bersaglio.
 * Ritorna { molt, forse } dove "forse" è un'abilità possibile (non ancora
 * rivelata) che renderebbe il bersaglio immune. null per le mosse di stato.
 */
function efficacia(tt, move, tipoMossa, categoria, attaccante, serverAtt, bersaglio) {
    if (categoria === 'Status') return null;
    const battle = tt.battle;
    const tipi = tt.getPokemonTypes(bersaglio);
    const abilitaAtt = idDi(serverAtt?.ability || attaccante?.ability || serverAtt?.baseAbility);
    const vedeFantasmi = abilitaAtt === 'scrappy' || abilitaAtt === 'mindseye';

    let molt = 1;
    for (const t of tipi) {
        let x = moltTipo(tipoMossa, t, battle.gen);
        if (move.id === 'freezedry' && t === 'Water') x = 2;
        if (move.id === 'thousandarrows' && t === 'Flying') x = 1;
        if (x === 0 && t === 'Ghost' && vedeFantasmi && (tipoMossa === 'Normal' || tipoMossa === 'Fighting')) x = 1;
        molt *= x;
    }
    if (move.id === 'flyingpress') for (const t of tipi) molt *= moltTipo('Flying', t, battle.gen);

    const gravita = !!battle.hasPseudoWeather?.('Gravity');
    if (tipoMossa === 'Ground' && gravita && molt === 0 && tipi.includes('Flying')) {
        molt = tipi.filter(t => t !== 'Flying').reduce((m, t) => m * moltTipo('Ground', t, battle.gen), 1);
    }
    if (molt === 0) return { molt: 0 };

    // Abilità e strumento del bersaglio (note, o dal team sheet)
    const lato = latoDi(battle, bersaglio.side);
    let set = puoVedereSet(lato) ? setDi(lato, bersaglio, battle.dex) : null;
    if (!setCompleto(set)) set = null;
    const abilita = idDi(bersaglio.ability || bersaglio.baseAbility || set?.ability);
    const strumento = bersaglio.prevItem && !bersaglio.item ? '' : idDi(bersaglio.item || set?.item);
    const ignora = ROMPI_ABILITA.includes(abilitaAtt);

    if (!ignora && abilita) {
        if (IMMUNITA[abilita] === tipoMossa && !(tipoMossa === 'Ground' && gravita)) return { molt: 0 };
        if (abilita === 'wonderguard' && molt <= 1) return { molt: 0 };
    }
    if (tipoMossa === 'Ground' && strumento === 'airballoon' && !gravita) return { molt: 0 };

    let forse = '';
    if (!ignora && !abilita) {
        const possibili = Object.values(battle.dex.species.get(bersaglio.speciesForme).abilities || {});
        forse = possibili.find(a => IMMUNITA[idDi(a)] === tipoMossa && !(tipoMossa === 'Ground' && gravita)) || '';
    }
    return { molt, forse };
}

function etichetta(molt) {
    if (molt === 0) return { testo: 'No effect', classe: 'nullo', segno: '×0' };
    if (molt >= 4) return { testo: 'Super effective', classe: 'super', segno: '×4' };
    if (molt >= 2) return { testo: 'Super effective', classe: 'super', segno: '×2' };
    if (molt <= 0.25) return { testo: 'Not very effective', classe: 'poco', segno: '×¼' };
    if (molt < 1) return { testo: 'Not very effective', classe: 'poco', segno: '×½' };
    return { testo: 'Neutral', classe: 'neutro', segno: '×1' };
}

// Tipo e categoria effettivi della mossa (Pixilate, Weather Ball, mosse Max…)
function tipoEffettivo(tt, move, isZOrMax, pokemon, serverPokemon, gmaxMove) {
    try {
        if (typeof ModifiableValue !== 'undefined' && serverPokemon) {
            // eslint-disable-next-line no-undef
            const valore = new ModifiableValue(tt.battle, pokemon, serverPokemon);
            const [tipo, categoria] = tt.getMoveType(move, valore, gmaxMove || isZOrMax === 'maxmove');
            return { tipo, categoria };
        }
    } catch (e) { /* uso il tipo base */ }
    return { tipo: move.type, categoria: move.category };
}

function sezioneEfficacia(tt, move, isZOrMax, pokemon, serverPokemon, gmaxMove) {
    const { tipo, categoria } = tipoEffettivo(tt, move, isZOrMax, pokemon, serverPokemon, gmaxMove);
    if (categoria === 'Status' || isZOrMax === 'maxmove' && move.category === 'Status') return '';

    const avversari = (pokemon.side.foe?.active || []).filter(p => p && !p.fainted);
    // Mosse che colpiscono anche il compagno (Earthquake, Surf…)
    const colpisceAlleato = move.target === 'allAdjacent';
    const alleati = colpisceAlleato ? pokemon.side.active.filter(p => p && p !== pokemon && !p.fainted) : [];
    if (!avversari.length && !alleati.length) return '';

    const riga = (bersaglio, alleato) => {
        const e = efficacia(tt, move, tipo, categoria, pokemon, serverPokemon, bersaglio);
        if (!e) return '';
        const et = etichetta(e.molt);
        const nota = e.forse ? `<span class="tt-nota">${esc(e.forse)}?</span>` : '';
        return `<div class="tt-riga">
            <span class="tt-nomi">${esc(bersaglio.name)}${alleato ? ' <small>(ally)</small>' : ''}${nota}</span>
            <span class="tt-badge ${et.classe}">${et.segno} ${et.testo}</span>
        </div>`;
    };
    const righe = [...avversari.map(p => riga(p, false)), ...alleati.map(p => riga(p, true))].join('');
    if (!righe) return '';
    return `<div class="tt-sezione tt-efficacia">
        <div class="tt-titolo">${tipoTag(tipo)} Against</div>
        ${righe}
    </div>`;
}

// Il Pokémon in campo nella richiesta del simulatore (stesso soprannome e stessa forma:
// due Pokémon dello stesso team possono avere lo stesso soprannome)
function pokemonDellaRichiesta(battle, pokemon) {
    const nome = idDi(pokemon.name);
    const forma = idDi(pokemon.speciesForme);
    const formaDi = p => idDi(p.speciesForme || String(p.details || '').split(',')[0]);
    const tutti = (battle.myPokemon || []).filter(p => p.ident);
    // il nome nel log può essere stato reso unico (nomi-log.js) e non coincidere più con quello della richiesta
    const trovati = tutti.filter(p => idDi(p.ident.slice(4)) === nome);
    const candidati = trovati.length ? trovati : tutti;
    return candidati.find(p => formaDi(p) === forma) || trovati[0] || null;
}

/**
 * Per i bottoni dei bersagli in battle-ui.js.
 *  battle:     scena.battle
 *  nomeMossa:  nome della mossa (anche la mossa Max o Z)
 *  attaccante: il Pokémon che usa la mossa (battle.p1.active[slot]...)
 *  bersaglio:  il Pokémon colpito
 * Ritorna { molt, testo, classe, segno, forse } oppure null (mossa di stato o dati mancanti).
 */
export function efficaciaBersaglio(battle, nomeMossa, attaccante, bersaglio) {
    const tt = battle?.scene?.tooltips;
    if (!tt || !attaccante || !bersaglio) return null;
    const move = battle.dex.moves.get(nomeMossa);
    if (!move?.exists) return null;
    const mio = attaccante.side === battle.mySide ? pokemonDellaRichiesta(battle, attaccante) : null;
    const serverAtt = mio || serverDaSheet(battle, attaccante);
    const potenziamento = move.isMax ? 'maxmove' : move.isZ ? 'zmove' : '';
    const { tipo, categoria } = tipoEffettivo(tt, move, potenziamento, attaccante, serverAtt, undefined);
    const e = efficacia(tt, move, tipo, categoria, attaccante, serverAtt, bersaglio);
    return e ? { ...etichetta(e.molt), molt: e.molt, forse: e.forse || '' } : null;
}


// -----------------------------------------------------
// HTML dei tooltip
// -----------------------------------------------------
function tipoTag(tipo) {
    return `<span class="tt-tipo t-${idDi(tipo)}">${esc(tipo)}</span>`;
}

function stadio(n) {
    return n > 0 ? (2 + n) / 2 : 2 / (2 - n);
}

function classeHp(perc) {
    return perc > 50 ? 'hp-g' : perc > 20 ? 'hp-y' : 'hp-r';
}

function htmlPokemon(tt, clientPokemon, serverPokemon, { attivo, daSheet, lato: latoDato }) {
    const battle = tt.battle;
    const dex = battle.dex;
    const pk = clientPokemon || serverPokemon;
    const specie = dex.species.get(pk.speciesForme);
    const lato = latoDato || (clientPokemon ? latoDi(battle, clientPokemon.side) : (S.latiNoti[0] || 'p1'));

    // --- Testata: nome, specie, livello, tipi ---
    const nome = pk.name || specie.name;
    const sottoNome = idDi(nome) !== idDi(specie.name) ? `<small>${esc(specie.name)}</small>` : '';
    const livello = pk.level && pk.level !== 100 ? `<small>Lv ${pk.level}</small>` : '';
    const tipi = tt.getPokemonTypes(pk);
    let cambi = '';
    if (clientPokemon?.volatiles?.formechange) cambi += '<span class="tt-nota">forme changed</span>';
    if (clientPokemon?.volatiles?.typechange || clientPokemon?.volatiles?.typeadd) cambi += '<span class="tt-nota">type changed</span>';
    if (clientPokemon?.volatiles?.dynamax) cambi += '<span class="tt-nota">Dynamax</span>';
    let html = `<div class="tt-testa ${lato}">
        <div class="tt-nome">${esc(nome)} ${sottoNome} ${livello}</div>
        <div class="tt-tipi">${tipi.map(tipoTag).join('')}${cambi}</div>
    </div><div class="tt-corpo">`;

    // --- HP e stato ---
    const fuori = pk.fainted;
    let percento = 0, testoHp = '';
    if (serverPokemon && !daSheet) {
        percento = serverPokemon.maxhp ? (serverPokemon.hp / serverPokemon.maxhp) * 100 : 0;
        testoHp = `${serverPokemon.hp}/${serverPokemon.maxhp}`;
    } else if (clientPokemon) {
        percento = clientPokemon.maxhp ? (clientPokemon.hp / clientPokemon.maxhp) * 100 : 0;
        testoHp = `${Math.round(percento)}%`;
        if (daSheet) testoHp += ` <small>≈ ${serverPokemon.hp}/${serverPokemon.maxhp}</small>`;
    } else if (serverPokemon) {
        percento = 100;
        testoHp = `${serverPokemon.maxhp}/${serverPokemon.maxhp}`;
    }
    const stato = pk.status ? `<span class="tag-stato ${esc(pk.status)}">${esc(pk.status.toUpperCase())}</span>` : '';
    let extraStato = '';
    if (clientPokemon?.status === 'slp' && clientPokemon.statusData) extraStato = `<small>asleep ${clientPokemon.statusData.sleepTurns} turn(s)</small>`;
    if (clientPokemon?.status === 'tox' && clientPokemon.statusData) extraStato = `<small>next: ${Math.floor(100 / 16 * Math.min(clientPokemon.statusData.toxicTurns + 1, 15))}%</small>`;
    html += `<div class="tt-hp">
        <div class="tt-barra"><span class="${classeHp(percento)}" style="width:${fuori ? 0 : Math.max(0, Math.min(100, percento))}%"></span></div>
        <b>${fuori ? 'Fainted' : testoHp}</b>${stato}${extraStato}
    </div>`;

    // --- Abilità e strumento ---
    const supportaAbilita = battle.gen > 2;
    let righe = '';
    if (supportaAbilita) {
        const a = tt.getPokemonAbilityData(clientPokemon, serverPokemon);
        if (a.ability) {
            const base = a.baseAbility && idDi(a.baseAbility) !== idDi(a.ability)
                ? ` <small>(base: ${esc(dex.abilities.get(a.baseAbility).name)})</small>` : '';
            righe += `<div class="tt-riga"><span class="tt-etichetta">Ability</span><span class="tt-valore">${esc(dex.abilities.get(a.ability).name)}${base}</span></div>`;
        } else if (a.possibilities.length) {
            righe += `<div class="tt-riga a-capo"><span class="tt-etichetta">Possible abilities</span><span class="tt-chips">${
                a.possibilities.map(x => `<span class="tt-chip">${esc(dex.abilities.get(x).name)}</span>`).join('')}</span></div>`;
        }
    }
    let strumento = '';
    if (clientPokemon?.prevItem && !clientPokemon.item) {
        const prima = dex.items.get(clientPokemon.prevItem).name;
        strumento = `None <small>(${esc(prima)} ${esc(clientPokemon.prevItemEffect || 'lost')})</small>`;
    } else {
        const id = serverPokemon?.item || clientPokemon?.item;
        if (id) strumento = esc(dex.items.get(id).name) + (clientPokemon?.itemEffect ? ` <small>(${esc(clientPokemon.itemEffect)})</small>` : '');
        else if (serverPokemon) strumento = 'None';
    }
    righe += `<div class="tt-riga"><span class="tt-etichetta">Item</span><span class="tt-valore">${strumento || '<span class="tt-ignoto">unknown</span>'}</span></div>`;
    const set = serverPokemon?.set;
    if (set?.nature) {
        const n = window.BattleNatures?.[set.nature] || {};
        const effetto = n.plus ? ` <small>+${NOME_STAT[n.plus]} −${NOME_STAT[n.minus]}</small>` : '';
        righe += `<div class="tt-riga"><span class="tt-etichetta">Nature</span><span class="tt-valore">${esc(set.nature)}${effetto}</span></div>`;
    } else if (clientPokemon?.nature && !serverPokemon) {
        righe += `<div class="tt-riga"><span class="tt-etichetta">Nature</span><span class="tt-valore">${esc(clientPokemon.nature)}</span></div>`;
    }
    html += `<div class="tt-sezione">${righe}</div>`;

    // --- Statistiche ---
    html += sezioneStat(tt, clientPokemon, serverPokemon, daSheet);

    // --- Mosse ---
    html += sezioneMosse(tt, clientPokemon, serverPokemon, attivo, daSheet);

    html += '</div>';
    // Dentro lo schermo di gioco (Pokémon in campo) il tooltip è la versione compatta
    return attivo ? `<div class="tt-compatto">${html}</div>` : html;
}

function sezioneStat(tt, clientPokemon, serverPokemon, daSheet) {
    const battle = tt.battle;
    const boosts = clientPokemon?.boosts || {};
    const trasformato = clientPokemon?.volatiles?.transform;

    // Stat esatte: i miei Pokémon, o tutti in open sheet
    if (serverPokemon && !trasformato) {
        const base = serverPokemon.stats;
        const finali = tt.calculateModifiedStats(clientPokemon, serverPokemon);
        const celle = STAT.map(stat => {
            if (battle.gen === 1 && stat === 'spd') return '';
            const b = base[stat], f = finali[stat];
            const st = boosts[stat] ? `<em>${boosts[stat] > 0 ? '+' : ''}${boosts[stat]}</em>` : '';
            if (f === b) return `<div class="tt-cella"><span>${NOME_STAT[stat]}</span><b>${b}</b>${st}</div>`;
            return `<div class="tt-cella ${f > b ? 'su' : 'giu'}"><span>${NOME_STAT[stat]}</span><b>${f}</b><small>${b}</small>${st}</div>`;
        }).join('');
        const evs = serverPokemon.set?.evs;
        const testoEv = evs ? Object.entries(evs).filter(([, v]) => v).map(([k, v]) => `${v} ${NOME_STAT[k]}`).join(' / ') : '';
        const etichettaStat = daSheet ? 'Stats · open sheet' : 'Stats';
        return `<div class="tt-sezione">
            <div class="tt-titolo">${etichettaStat}</div>
            <div class="tt-griglia-stat">${celle}</div>
            ${testoEv ? `<div class="tt-sub">EVs ${esc(testoEv)}</div>` : ''}
            ${clientPokemon ? '<div class="tt-sub tt-nota-lunga">Big numbers already include boosts, items, abilities and field.</div>' : ''}
        </div>`;
    }

    // Avversario senza open sheet: range di velocità e boost visibili
    if (!clientPokemon) return '';
    const r = tt.getSpeedRange(clientPokemon);
    const st = boosts.spe || 0;
    const conBoost = st ? `<div class="tt-sub">at ${st > 0 ? '+' : ''}${st}: <b>${Math.floor(r.min * stadio(st))}–${Math.floor(r.max * stadio(st))}</b></div>` : '';
    const altri = STAT.filter(s => s !== 'spe' && boosts[s])
        .map(s => `<span class="tt-chip ${boosts[s] > 0 ? 'su' : 'giu'}">${NOME_STAT[s]} ${boosts[s] > 0 ? '+' : ''}${boosts[s]}</span>`).join('');
    return `<div class="tt-sezione">
        <div class="tt-titolo">Possible speed</div>
        <div class="tt-grande">${r.min}–${r.max}</div>
        <div class="tt-barra-range"><span style="left:0;width:100%"></span></div>
        <div class="tt-sub">0 EVs ${r.ev0} · 252 EVs ${r.ev252} · before items, abilities and field</div>
        ${conBoost}
        ${altri ? `<div class="tt-chips">${altri}</div>` : ''}
    </div>`;
}

function sezioneMosse(tt, clientPokemon, serverPokemon, attivo, daSheet) {
    const dex = tt.battle.dex;
    const usate = new Map((clientPokemon?.moveTrack || []).map(([nome, pp]) => [idDi(nome.replace(/^\*/, '')), pp]));
    const riga = (id, pp) => {
        const m = dex.moves.get(id);
        let max = m.noPPBoosts || m.pp === 1 ? m.pp : Math.floor(m.pp * 8 / 5);
        let resto = '';
        if (typeof pp === 'number' && pp > 0) resto = `${max - pp}/${max}`;
        else if (pp === Infinity) resto = `0/${max}`;
        else if (Array.isArray(pp)) resto = `${max - pp[1]}–${max - pp[0]}/${max}`;
        return `<div class="tt-mossa">${tipoTag(m.type)}<span>${esc(m.name)}</span>${resto ? `<small>${resto}</small>` : ''}</div>`;
    };

    // Il set completo: miei Pokémon fuori dal campo, o avversari in open sheet
    if (serverPokemon?.moves?.length && (!attivo || daSheet)) {
        return `<div class="tt-sezione"><div class="tt-titolo">Moves</div>${
            serverPokemon.moves.map(id => riga(id, usate.get(idDi(id)))).join('')}</div>`;
    }
    // Solo le mosse già viste in battaglia
    if (!serverPokemon && usate.size) {
        return `<div class="tt-sezione"><div class="tt-titolo">Revealed moves</div>${
            [...usate.entries()].map(([id, pp]) => riga(id, pp)).join('')}</div>`;
    }
    return '';
}


// -----------------------------------------------------
// Colonne laterali dei player
// -----------------------------------------------------
// Le stesse GIF animate del resto del sito (sprites/ani di Showdown, come
// getGifUrl e generaHtmlGifs in matches.html). Il nome del file lo dà Showdown
// (spriteid), così anche le forme hanno la GIF giusta: "urshifu-rapidstrike".
const POKEBALL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png';
function slugSprite(specie) {
    const sp = window.Dex?.species?.get?.(specie);
    return sp?.spriteid || String(specie ?? '').toLowerCase().replace(/\s+/g, '').replace(/[.'é’%]/g, '');
}
function sprite(specie) {
    return `https://play.pokemonshowdown.com/sprites/ani/${slugSprite(specie)}.gif`;
}
// GIF mancante: PNG del Pokédex, poi la Poké Ball (come gestisciErroreSprite del sito)
function spriteDiRiserva(img) {
    const fase = Number(img.dataset.fase || 0);
    img.dataset.fase = String(fase + 1);
    if (fase === 0) img.src = `https://play.pokemonshowdown.com/sprites/dex/${img.dataset.slug}.png`;
    else if (fase === 1) img.src = POKEBALL;
}

// I 6 da mostrare: dal set (se lo conosco), altrimenti dal team preview di Showdown
function elencoLato(lato) {
    const squadra = S.squadre[lato];
    if (squadra?.length) return squadra.map(s => ({ specie: s.species, nome: s.name || s.species, set: s }));
    const side = S.battle?.[lato];
    return (side?.pokemon || []).map(p => ({ specie: p.speciesForme, nome: p.name, set: null }));
}

function disegnaLati() {
    for (const lato of ['p1', 'p2']) {
        const box = document.getElementById(`lato-${lato}`);
        if (!box) continue;
        const elenco = elencoLato(lato);
        const nome = S.info[lato].nome || S.battle?.[lato]?.name || (lato === 'p1' ? 'Player 1' : 'Player 2');
        const sc = S.schede[lato] || null;
        const firma = JSON.stringify([nome, S.info[lato].team, elenco.map(x => x.nome), S.openSheet, S.latiNoti, sc && [sc.id, sc.elo, sc.posizione, sc.titolo, sc.medaglie.length]]);
        if (box.dataset.firma === firma) continue;
        box.dataset.firma = firma;

        const conTooltip = puoVedereSet(lato);
        risolviSquadre();
        // i fiocchi di ogni Pokémon e i badge del team (di chi ha un profilo): chi lo ha guadagnato lo mostra
        const SB = window.SchedaBattaglia;
        const nomeTeam = S.info[lato].team;
        const nomiTeam = elenco.map(x => x.nome === x.specie ? x.specie : `${x.nome} (${x.specie})`);
        const badgeTeam = SB && sc ? SB.htmlBadgeTeam(S.schede.risultato, sc, nomeTeam) : '';
        box.innerHTML = `
            <h2 class="lato-nome nome-scorrevole" title="${esc(nome)}">${esc(nome)}</h2>
            ${nomeTeam ? `<p class="lato-team nome-scorrevole">${esc(nomeTeam)}</p>` : ''}
            ${SB && sc ? SB.htmlScheda(sc) : ''}
            ${badgeTeam}
            <ol class="lato-pkm">${elenco.map((x, i) => `
                <li class="membro${conTooltip && setCompleto(x.set) ? ' con-tooltip' : ''}" data-indice="${i}" data-specie="${esc(x.specie)}"
                    ${conTooltip && setCompleto(x.set) ? 'tabindex="0"' : ''} aria-label="${esc(x.nome)}">
                    <img src="${esc(sprite(x.specie))}" data-slug="${esc(slugSprite(x.specie))}" alt="" loading="lazy" width="64" height="64">
                    <span class="membro-hp" aria-hidden="true"><span></span></span>
                    ${SB && sc ? SB.htmlTondinoPokemon(S.schede.risultato, sc, nomeTeam, nomiTeam, i) : ''}
                </li>`).join('')}
            </ol>
            <div class="lato-condizioni" id="condizioni-${lato}" aria-label="Side effects"></div>`;
        if (!box.dataset.ascolto) {
            box.dataset.ascolto = '1';
            // gli errori delle immagini non risalgono: li si prende in cattura
            box.addEventListener('error', e => { if (e.target.tagName === 'IMG') spriteDiRiserva(e.target); }, true);
            box.addEventListener('mouseover', e => tooltipMembro(e, lato));
            box.addEventListener('focusin', e => tooltipMembro(e, lato));
            box.addEventListener('mouseout', e => {
                const li = e.target.closest('.membro');
                if (li && !(e.relatedTarget && li.contains(e.relatedTarget))) nascondiTooltip();
            });
            box.addEventListener('focusout', nascondiTooltip);
        }
    }
    aggiornaLati();
}

// Stato di ciascun Pokémon: in campo, KO, HP (da quello che Showdown sa)
const visti = new WeakSet();   // Pokémon che sono già scesi in campo

const baseDi = (battle, specie) => idDi(battle.dex.species.get(specie).baseSpecies);

// A ogni carta il Pokémon che le corrisponde tra i candidati (o null). I candidati sono Pokémon
// di Showdown ({ speciesForme, name }) o voci della richiesta del simulatore, già normalizzate.
// Showdown rimescola side.pokemon a ogni cambio e due Pokémon dello stesso team possono avere
// la stessa specie base e lo stesso soprannome (Calyrex-Ice e Calyrex-Shadow, entrambi "Calyrex"):
// perciò si abbina per gradi, dal più preciso al più largo, e ogni candidato serve una carta sola.
//   1. stessa forma e stesso soprannome   2. stessa forma
//   3. stessa specie base e stesso soprannome   4. stessa specie base (forme cambiate: Mega, ecc.)
function abbina(battle, carte, candidati) {
    const abbinati = carte.map(() => null);
    // forma, specie base e soprannome di ognuno, calcolati una volta sola (il Dex costa)
    const dati = x => {
        const forma = idDi(x.speciesForme ?? x.specie);
        return { forma, base: baseDi(battle, x.speciesForme ?? x.specie), nome: idDi(x.name ?? x.nome) };
    };
    const delleCarte = carte.map(dati);
    const liberi = candidati.map(p => ({ p, ...dati(p) }));
    const gradi = [
        (c, p) => p.forma === c.forma && p.nome === c.nome,
        (c, p) => p.forma === c.forma,
        (c, p) => p.base === c.base && p.nome === c.nome,
        (c, p) => p.base === c.base,
    ];
    for (const combacia of gradi) {
        delleCarte.forEach((carta, i) => {
            if (abbinati[i]) return;
            const k = liberi.findIndex(p => combacia(carta, p));
            if (k >= 0) abbinati[i] = liberi.splice(k, 1)[0].p;
        });
    }
    return abbinati;
}

// I Pokémon di Showdown che corrispondono alle carte di un lato
function abbinaLato(lato, elenco, battle = S.battle) {
    const side = battle?.[lato];
    return abbina(battle, elenco, side?.pokemon || []);
}

// Si portano meno Pokémon di quelli mostrati nel team preview (es. 4 su 6)?
function sceltaRidotta(battle, side) {
    return !!battle.teamPreviewCount && battle.teamPreviewCount < (side.pokemon?.length || 0);
}

// I Pokémon portati, se si conoscono: solo per il proprio lato, dopo il team preview
function portatiNoti(battle, side) {
    if (side !== battle.mySide || !battle.myPokemon?.length) return null;
    if (!sceltaRidotta(battle, side) || battle.myPokemon.length >= side.pokemon.length) return null;
    return battle.myPokemon.map(p => ({ speciesForme: p.speciesForme || String(p.details || '').split(',')[0], name: String(p.ident || '').slice(4) }));
}

// L'avatar scelto per il player (Showdown altrimenti ne tira uno a caso a ogni set)
function impostaAvatar(battle) {
    for (const lato of ['p1', 'p2']) {
        const side = battle[lato];
        if (!side) continue;
        const scelto = S.info[lato].avatar;
        const voluto = !scelto ? 'unknown' : /[/.]/.test(scelto) ? `sito:${scelto}` : scelto;
        if (side.avatar !== voluto) {
            side.setAvatar(voluto);
            battle.scene?.updateSidebar?.(side);
        }
    }
}

// Meteo, terreni, Trick Room e condizioni dei lati, fuori dallo schermo
function turniRimasti(min, max) {
    if (min && max && min !== max) return `${min} or ${max} turns`;
    const n = min || max;
    return n ? `${n} turn${n === 1 ? '' : 's'}` : '';
}
function aggiornaCampo(battle) {
    const globali = [];
    const deiLati = { p1: [], p2: [] };
    if (battle.weather) {
        const nome = window.BattleTextParser?.weatherName?.(battle.weather) || battle.weather;
        const annullato = !!battle.abilityActive?.(['Air Lock', 'Cloud Nine']);
        globali.push({ classe: 'meteo' + (annullato ? ' annullato' : ''), nome, turni: turniRimasti(battle.weatherMinTimeLeft, battle.weatherTimeLeft) });
    }
    for (const [nome, min, max] of battle.pseudoWeather || []) {
        globali.push({ classe: /terrain/i.test(nome) ? 'terreno' : 'campo', nome: battle.dex.moves.get(nome).name || nome, turni: turniRimasti(min, max) });
    }
    for (const lato of ['p1', 'p2']) {
        for (const [nome, livelli, min, max] of Object.values(battle[lato]?.sideConditions || {})) {
            const strati = livelli > 1 ? ` ×${livelli}` : '';
            deiLati[lato].push({ classe: 'lato-cond', nome: (battle.dex.moves.get(nome).name || nome) + strati, turni: turniRimasti(min, max) });
        }
    }
    scriviVoci(document.getElementById('cab-campo'), globali, '<span class="campo-vuoto">No field effects</span>');
    for (const lato of ['p1', 'p2']) scriviVoci(document.getElementById(`condizioni-${lato}`), deiLati[lato], '');
}

// Scrive le voci in un contenitore, solo se sono cambiate
function scriviVoci(box, voci, vuoto) {
    if (!box) return;
    const firma = JSON.stringify(voci);
    if (box.dataset.firma === firma) return;
    box.dataset.firma = firma;
    box.innerHTML = voci.length
        ? voci.map(v => `<span class="campo-voce ${v.classe}">${esc(v.nome)}${v.turni ? `<small>${esc(v.turni)}</small>` : ''}</span>`).join('')
        : vuoto;
}

function aggiornaLati() {
    const battle = S.battle;
    if (!battle) return;
    impostaAvatar(battle);
    aggiornaCampo(battle);
    // Il team preview è arrivato: ora si sa quale team registrato è in campo
    const primaNote = S.squadre.p1.length + S.squadre.p2.length;
    risolviSquadre();
    if (S.squadre.p1.length + S.squadre.p2.length !== primaNote) { disegnaLati(); return; }
    for (const lato of ['p1', 'p2']) {
        const box = document.getElementById(`lato-${lato}`);
        const side = battle[lato];
        if (!box || !side) continue;
        // Nessun set passato: appena Showdown riceve il team preview disegno i 6
        if (!box.querySelector('.membro') && side.pokemon?.length) { box.dataset.firma = ''; disegnaLati(); return; }
        for (const p of side.active) if (p) visti.add(p);
        const elenco = elencoLato(lato);
        const abbinati = abbinaLato(lato, elenco);
        // Bring 6 pick 4: del proprio team si sa già chi è stato portato, dalla richiesta
        const portati = portatiNoti(battle, side);
        const sonoPortati = portati && abbina(battle, elenco, portati);
        for (const li of box.querySelectorAll('.membro')) {
            const p = abbinati[+li.dataset.indice] || null;
            // ident vuoto = visto solo nel team preview, mai sceso in campo
            const sceso = !!p && (visti.has(p) || !!p.ident || !!p.fainted);
            const ko = !!p?.fainted;
            li.classList.toggle('in-campo', sceso && side.active.includes(p) && !ko);
            li.classList.toggle('ko', ko);
            // Finché non scende in campo non si sa se è tra i 4 portati (a meno che non sia del proprio team)
            li.classList.toggle('non-portato', !!sonoPortati && !sceso && !sonoPortati[+li.dataset.indice]);
            li.classList.toggle('incerto', !sonoPortati && !sceso && sceltaRidotta(battle, side));
            const perc = sceso && p.maxhp ? Math.max(0, Math.min(100, (p.hp / p.maxhp) * 100)) : 100;
            const barra = li.querySelector('.membro-hp');
            barra.classList.toggle('visibile', sceso);
            barra.firstElementChild.style.width = `${ko ? 0 : perc}%`;
            barra.firstElementChild.className = classeHp(perc);
        }
    }
}

let tooltipAperto = null;
function tooltipMembro(e, lato) {
    const li = e.target.closest?.('.membro.con-tooltip');
    if (!li || li === tooltipAperto) return;
    const tt = S.battle?.scene?.tooltips;
    const set = elencoLato(lato)[+li.dataset.indice]?.set;
    const BT = S.BT || window.BattleTooltips;
    if (!tt || !setCompleto(set) || !BT || BT.isLocked) return;

    // Se il Pokémon è già sceso in campo uso i suoi dati veri (boost, HP, mosse usate)
    const trovato = abbinaLato(lato, elencoLato(lato))[+li.dataset.indice];
    const clientPokemon = trovato && (visti.has(trovato) || trovato.ident) ? trovato : null;
    const server = serverDaSet(S.battle, set, clientPokemon);
    const html = htmlPokemon(tt, clientPokemon, server, { attivo: false, daSheet: true, lato });
    tooltipAperto = li;
    BT.prototype.placeTooltip.call(tt, html, li, true, 'membro');
    tooltipAccanto(li);
}
function nascondiTooltip() {
    tooltipAperto = null;
    const BT = S.BT || window.BattleTooltips;
    if (BT && !BT.isLocked) BT.hideTooltip();
}
