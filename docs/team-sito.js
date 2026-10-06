// =====================================================
// TEAM SITO
// Collega i dati del sito (Firebase) al simulatore:
//   - converte un team salvato nel testo che Showdown capisce
//   - decide con quale formato del simulatore giocare un regolamento
//   - carica da Firebase tutto ciò che serve per un match
// Nessun riferimento al DOM.
// =====================================================

import { Teams, Dex } from './pkmn-sim.js';
import './dati-gen.js';          // self.DatiGen: i dati per generazione (gli stessi del Box)
import './controllo-team.js';    // self.ControlloTeam: la regola per generazione, quella del Box e del server


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
//   - Generational Mechanics: attive solo se spuntate nel formato. Se spente,
//     niente Dynamax (Gen 8) o Teracristal (Gen 9); Mega e Mosse Z dipendono
//     dagli strumenti, quindi un team con Megapietre o Cristalli Z viene rifiutato.
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

    // "Scegli 4 su 6" richiede l'anteprima squadre: dalla quinta generazione c'è già, prima va chiesta a parte.
    // "HP Percentage Mod" nelle prime tre generazioni è già nel formato (aggiungerlo di nuovo dà errore).
    const regole = [];
    if (gen < 5) regole.push('Team Preview');
    regole.push('Picked Team Size = 4');
    if (gen >= 4) regole.push('HP Percentage Mod');
    if (struttura === 'custom') regole.push('Sleep Clause Mod', 'Endless Battle Clause');
    if (!meccanicheAttive(regolamento)) {
        if (gen === 8) regole.push('Dynamax Clause');
        if (gen === 9) regole.push('Terastal Clause');
    }

    return `gen${gen}${doppio ? 'doubles' : ''}customgame@@@${regole.join(',')}`;
}

export function meccanicheAttive(regolamento) {
    return regolamento.generationalMechanics === true;
}

// I dati della generazione del formato (null per la Gen 9 o se non si caricano: restano quelli di oggi)
export function caricaDeltaFormato(regolamento) {
    return self.DatiGen.carica(generazioneFormato(regolamento)).catch(() => null);
}

// Problemi che impediscono di giocare con un team. Il simulatore non
// corregge nulla: se un team non è conforme, non si gioca.
// Il controllo è lo STESSO del Box (quando salva un team) e del server (functions/partita.js): vedi controllo-team.js.
// `delta` = caricaDeltaFormato(regolamento) (le abilità delle specie di allora).
export function controllaTeam(testo, regolamento, delta = null) {
    const sets = Teams.import(testo) || [];
    if (!sets.length) return ['The team is empty or unreadable'];
    const regole = {
        gen: generazioneFormato(regolamento), livello: livelloFormato(regolamento), meccaniche: meccanicheAttive(regolamento),
        controllaSpecie: String(regolamento.strutturaSito || 'custom').toLowerCase().trim() !== 'anything_goes',
        delta
    };
    return self.ControlloTeam.problemiDeiSetShowdown(sets, regole, Dex);
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
        const sesso = p.sesso === 'M' || p.sesso === 'F' ? ` (${p.sesso})` : '';
        righe.push(strumento && strumento !== 'None' ? `${p.nome}${sesso} @ ${strumento}` : `${p.nome}${sesso}`);
        if (p.abilita) righe.push(`Ability: ${p.abilita}`);
        righe.push(`Level: ${p.livello || livello}`);
        if (p.shiny) righe.push('Shiny: Yes');
        if (Number.isInteger(p.felicita) && p.felicita !== 255) righe.push(`Happiness: ${p.felicita}`);
        if (Number.isInteger(p.livelloDynamax) && p.livelloDynamax !== 10) righe.push(`Dynamax Level: ${p.livelloDynamax}`);
        if (p.gigantamax) righe.push('Gigantamax: Yes');
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
    if (!info) throw new Error(`Showdown "${showdown}" not found in season "${stagione}".`);

    const categoria = info.categoria;
    const regolamentiSnap = await db.ref('regolamenti').once('value');
    const regolamento = Object.values(regolamentiSnap.val() || {})
        .find(r => r && r.categoria && String(r.categoria).toLowerCase() === String(categoria).toLowerCase());
    if (!regolamento) throw new Error(`Ruleset "${categoria}" not found.`);

    const livello = livelloFormato(regolamento);
    const delta = await caricaDeltaFormato(regolamento);
    const giocatori = {};

    for (const [lato, nome] of [['p1', info.player1], ['p2', info.player2]]) {
        const id = String(nome || '').toLowerCase().trim();
        const [iscrittiSnap, boxSnap, coloreSnap, avatarSnap] = await Promise.all([
            db.ref(`seasons/${stagione}/teams_iscritti/${categoria}/${id}/datiTeams`).once('value'),
            db.ref(`players/${id}/teams`).once('value'),
            db.ref(`players/${id}/info/color`).once('value'),
            db.ref(`players/${id}/info/avatar`).once('value')
        ]);

        const box = Object.values(boxSnap.val() || {});
        const teams = Object.values(iscrittiSnap.val() || {}).map(iscritto => {
            const nomeT = nomeTeam(iscritto);
            const dalBox = box.find(b => nomeTeam(b).toLowerCase() === nomeT.toLowerCase());
            // La copia iscritta alla stagione ha la precedenza; il box fa da riserva
            const sorgente = (iscritto && iscritto.pokemon) ? iscritto : (dalBox || {});
            const testoSalvato = (iscritto && iscritto.testoShowdown) || (dalBox && dalBox.testoShowdown) || '';
            const testo = testoShowdownDaTeam({ ...sorgente, testoShowdown: testoSalvato }, livello);
            return { nome: nomeT, testo, completo: !!testoSalvato, problemi: controllaTeam(testo, regolamento, delta) };
        }).filter(t => t.nome && t.testo);

           giocatori[lato] = { nome, id, colore: coloreSnap.val(), avatar: avatarSnap.val() || '', teams };    }

    const matchSnap = await db.ref(`seasons/${stagione}/showdowns/${showdown}/matches/match${match}`).once('value');
    const datiMatch = matchSnap.val();
    const bloccati = datiMatch && datiMatch.team1 && datiMatch.team2
        ? { p1: datiMatch.team1, p2: datiMatch.team2 }
        : null;

    const openSheet = (await db.ref(`seasons/${stagione}/info/open_sheet`).once('value')).val() === true;

    return { categoria, regolamento, formato: formatoSimulatore(regolamento), livello, giocatori, bloccati, openSheet };
}

// -----------------------------------------------------
// 4. PROVA CONTRO LA CPU: IL TEAM DEL GIOCATORE DAL SUO BOX
// -----------------------------------------------------
// Restituisce:
// { nome, id, colore, avatar, iniziali: ['m', 'r'], team: { nome, testo }, categoria, regolamento, formato, livello, problemi }
// "problemi" è l'elenco di cosa impedisce di giocare con quel team (vuoto se va bene).
export async function caricaPerProva(db, utente, chiaveTeam) {
    const nome = (await db.ref(`users/${utente.uid}/name`).once('value')).val();
    if (!nome) throw new Error('Your profile has no name on the site.');
    const id = String(nome).toLowerCase().trim();

    const [teamSnap, coloreSnap, avatarSnap, regolamentiSnap, utenteSnap, infoSnap] = await Promise.all([
        db.ref(`players/${id}/teams/${chiaveTeam}`).once('value'),
        db.ref(`players/${id}/info/color`).once('value'),
        db.ref(`players/${id}/info/avatar`).once('value'),
        db.ref('regolamenti').once('value'),
        db.ref(`users/${utente.uid}`).once('value'),
        db.ref(`players/${id}/info`).once('value')
    ]);
    const team = teamSnap.val();
    if (!team) throw new Error('That team is not in your Box anymore.');

    // Il formato del team: per categoria o per id del regolamento (come fa il Box)
    const candidati = [team.categoria, team.category].map(v => String(v || '').toLowerCase().trim()).filter(Boolean);
    const regolamenti = regolamentiSnap.val() || {};
    let regolamento = null;
    for (const cand of candidati) {
        regolamento = Object.values(regolamenti).find(r => r && String(r.categoria || '').toLowerCase().trim() === cand) ||
            (Object.keys(regolamenti).find(k => k.toLowerCase() === cand) ? regolamenti[Object.keys(regolamenti).find(k => k.toLowerCase() === cand)] : null);
        if (regolamento) break;
    }
    if (!regolamento) throw new Error("This team's format was not found.");

    const livello = livelloFormato(regolamento);
    const delta = await caricaDeltaFormato(regolamento);
    const testo = testoShowdownDaTeam(team, livello);
    const u = utenteSnap.val() || {}, info = infoSnap.val() || {};
    const iniziali = [u.real_name || info.real_name, u.last_name || info.last_name]
        .map(x => String(x || '').trim().charAt(0).toLowerCase()).filter(Boolean);

    return {
        nome, id, colore: coloreSnap.val(), avatar: avatarSnap.val() || '', iniziali,
        team: { nome: nomeTeam(team), testo }, categoria: regolamento.categoria, regolamento,
        formato: formatoSimulatore(regolamento), livello, problemi: testo ? controllaTeam(testo, regolamento, delta) : ['The team is empty']
    };
}
