// =====================================================
// TEAM SITO
// Collega i dati del sito (Firebase) al simulatore:
//   - converte un team salvato nel testo che Showdown capisce
//   - decide con quale formato del simulatore giocare un regolamento
//   - carica da Firebase tutto ciò che serve per un match
// Nessun riferimento al DOM.
// =====================================================

import { Teams } from './pkmn-sim.js';


// -----------------------------------------------------
// 1. REGOLAMENTO -> FORMATO DEL SIMULATORE
// -----------------------------------------------------
// Stesse regole del team builder di box.html (tbInizializzaStato).
export function generazioneFormato(regolamento) {
    return parseInt(regolamento.genRuleValue, 10) ||
        parseInt(String(regolamento.vgcGen || '').replace(/\D/g, ''), 10) || 9;
}

export function livelloFormato(regolamento) {
    const struttura = String(regolamento.strutturaSito || 'custom').toLowerCase().trim();
    if (struttura === 'vgc') return 50;
    return String(regolamento.baseTier || '').toUpperCase() === 'LC' ? 5 : 100;
}

// Il formato del simulatore si costruisce dal regolamento del sito
// (formats.html), sempre a partire dalla "custom game" della generazione:
//   - tutte le partite: anteprima squadre, bring 6 pick 4
//   - Official VGC: singolo o doppio secondo vgcFormat, nessuna clausola in battaglia
//   - Custom Format: clausole standard di Showdown attive in battaglia
//     (Sleep Clause Mod, Endless Battle Clause). Le altre clausole standard
//     (Species, Item, Uber, leggendari) riguardano il team e le controlla box.html
//   - Anything Goose: nessuna clausola
//   - Generational Mechanics disattivato: niente Dynamax (Gen 8) o Teracristal (Gen 9).
//     Mega e Mosse Z dipendono dagli strumenti, quindi le decide il team builder.
// Il livello NON viene toccato: è già scritto nel team da box.html.
//
// Se nel regolamento su Firebase esiste il campo "formatoSimulatore",
// vince sempre lui (serve solo per casi eccezionali).
export function formatoSimulatore(regolamento) {
    if (regolamento.formatoSimulatore) return regolamento.formatoSimulatore;

    const struttura = String(regolamento.strutturaSito || 'custom').toLowerCase().trim();
    const gen = generazioneFormato(regolamento);

    let doppio = struttura === 'vgc'
        ? !String(regolamento.vgcFormat || 'doubles').toLowerCase().startsWith('singles')
        : regolamento.battleStyle === 'doubles';
    if (gen < 3) doppio = false;   // il doppio esiste dalla Gen 3

    const regole = ['Picked Team Size = 4'];
    if (struttura === 'custom') regole.push('Sleep Clause Mod', 'Endless Battle Clause');
    if (regolamento.generationalMechanics === false) {
        if (gen === 8) regole.push('Dynamax Clause');
        if (gen === 9) regole.push('Terastal Clause');
    }

    return `gen${gen}${doppio ? 'doubles' : ''}customgame@@@${regole.join(',')}`;
}

// Elenco dei Pokémon che non sono al livello del formato.
// Il simulatore non corregge i livelli: se un team non è conforme, non si gioca.
export function controllaLivelli(testo, livello) {
    const sets = Teams.import(testo) || [];
    return sets
        .filter(set => (set.level || 100) !== livello)
        .map(set => `${set.species} è al livello ${set.level || 100} invece di ${livello}`);
}


// -----------------------------------------------------
// 2. TEAM DEL SITO -> TESTO SHOWDOWN
// -----------------------------------------------------
// Se il team ha il testo originale (campo testoShowdown) si usa quello:
// è l'unica fonte completa. Altrimenti lo si ricostruisce dai campi,
// perdendo ciò che box.html non salvava (livello, Gigantamax, sesso,
// shiny, felicità).
export function testoShowdownDaTeam(team, livello = 100) {
    if (team.testoShowdown && team.testoShowdown.trim()) return team.testoShowdown.trim();

    const lista = Array.isArray(team.pokemon) ? team.pokemon : Object.values(team.pokemon || {});

    return lista.filter(p => p && p.nome).map(p => {
        const righe = [];
        const strumento = (p.strumento || '').trim();
        righe.push(strumento && strumento !== 'None' ? `${p.nome} @ ${strumento}` : p.nome);
        if (p.abilita) righe.push(`Ability: ${p.abilita}`);
        righe.push(`Level: ${p.livello || livello}`);
        if (p.tera) righe.push(`Tera Type: ${p.tera}`);
        if (p.evs && p.evs !== '-') righe.push(`EVs: ${p.evs}`);
        if (p.natura) righe.push(`${p.natura} Nature`);
        if (p.ivs) righe.push(`IVs: ${p.ivs}`);
        (p.mosse || []).filter(m => m && m.trim() && m !== '-').forEach(m => righe.push(`- ${m.trim()}`));
        return righe.join('\n');
    }).join('\n\n');
}

function nomeTeam(t) {
    if (!t) return '';
    return typeof t.nome === 'object' && t.nome ? (t.nome.valore || '') : (t.nome || '');
}


// -----------------------------------------------------
// 3. CARICAMENTO DI UN MATCH DA FIREBASE
// -----------------------------------------------------
// Restituisce:
// {
//   categoria, regolamento, formato, livello,
//   giocatori: { p1: { nome, id, colore, teams: [{ nome, testo }] }, p2: {...} },
//   bloccati: { p1: 'nome team', p2: 'nome team' } oppure null
// }
export async function caricaMatch(db, { stagione, showdown, match }) {
    const infoSnap = await db.ref(`seasons/${stagione}/showdowns/${showdown}/info`).once('value');
    const info = infoSnap.val();
    if (!info) throw new Error(`Showdown "${showdown}" non trovato nella stagione "${stagione}".`);

    const categoria = info.categoria;
    const regolamentiSnap = await db.ref('regolamenti').once('value');
    const regolamento = Object.values(regolamentiSnap.val() || {})
        .find(r => r && r.categoria && String(r.categoria).toLowerCase() === String(categoria).toLowerCase());
    if (!regolamento) throw new Error(`Regolamento "${categoria}" non trovato.`);

    const livello = livelloFormato(regolamento);
    const giocatori = {};

    for (const [lato, nome] of [['p1', info.player1], ['p2', info.player2]]) {
        const id = String(nome || '').toLowerCase().trim();
        const [iscrittiSnap, boxSnap, coloreSnap] = await Promise.all([
            db.ref(`seasons/${stagione}/teams_iscritti/${categoria}/${id}/datiTeams`).once('value'),
            db.ref(`players/${id}/teams`).once('value'),
            db.ref(`players/${id}/info/color`).once('value')
        ]);

        const box = Object.values(boxSnap.val() || {});
        const teams = Object.values(iscrittiSnap.val() || {}).map(iscritto => {
            const nomeT = nomeTeam(iscritto);
            const dalBox = box.find(b => nomeTeam(b).toLowerCase() === nomeT.toLowerCase());
            // La copia iscritta alla stagione ha la precedenza; il box fa da riserva
            const sorgente = (iscritto && iscritto.pokemon) ? iscritto : (dalBox || {});
            const testoSalvato = (iscritto && iscritto.testoShowdown) || (dalBox && dalBox.testoShowdown) || '';
            const testo = testoShowdownDaTeam({ ...sorgente, testoShowdown: testoSalvato }, livello);
            return { nome: nomeT, testo, completo: !!testoSalvato, problemi: controllaLivelli(testo, livello) };
        }).filter(t => t.nome && t.testo);

        giocatori[lato] = { nome, id, colore: coloreSnap.val(), teams };
    }

    const matchSnap = await db.ref(`seasons/${stagione}/showdowns/${showdown}/matches/match${match}`).once('value');
    const datiMatch = matchSnap.val();
    const bloccati = datiMatch && datiMatch.team1 && datiMatch.team2
        ? { p1: datiMatch.team1, p2: datiMatch.team2 }
        : null;

    return { categoria, regolamento, formato: formatoSimulatore(regolamento), livello, giocatori, bloccati };
}
