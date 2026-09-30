// =====================================================
// TEAM SITO
// Collega i dati del sito (Firebase) al simulatore:
//   - converte un team salvato nel testo che Showdown capisce
//   - decide con quale formato del simulatore giocare un regolamento
//   - carica da Firebase tutto ciò che serve per un match
// Nessun riferimento al DOM.
// =====================================================


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

// Formati VGC ufficiali usati come base, per generazione.
const VGC_PER_GEN = {
    5: 'gen5vgc2013',
    6: 'gen6vgc2016',
    7: 'gen7vgc2019',
    8: 'gen8vgc2022',
    9: 'gen9vgc2025regi'
};

// Se nel regolamento su Firebase esiste il campo "formatoSimulatore",
// vince sempre lui (es. "gen9customgame@@@Sleep Clause Mod").
// Altrimenti il formato viene dedotto.
export function formatoSimulatore(regolamento) {
    if (regolamento.formatoSimulatore) return regolamento.formatoSimulatore;

    const struttura = String(regolamento.strutturaSito || 'custom').toLowerCase().trim();
    const gen = generazioneFormato(regolamento);

    if (struttura === 'vgc' && VGC_PER_GEN[gen]) return VGC_PER_GEN[gen];

    const doppio = (struttura === 'vgc' || regolamento.battleStyle === 'doubles') && gen >= 3;
    return `gen${gen}${doppio ? 'doubles' : ''}customgame`;
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
        if (livello !== 100) righe.push(`Level: ${livello}`);
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
            return { nome: nomeT, testo, completo: !!testoSalvato };
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
