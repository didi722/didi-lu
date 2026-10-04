// =====================================================
// BATTLE UI
// Campo, animazioni, cronaca e tooltip sono quelli di Pokémon Showdown
// (lo stesso motore grafico dei replay: battle.js, caricato in battle.html).
// Questo file aggiunge ciò che è del sito: lobby, comandi, set, salvataggio.
// I testi visibili sono in inglese, come il resto del sito.
//
// Quattro modi di aprire la pagina:
//   battle.html?stagione=S&showdown=ID&match=N           -> match ONLINE (turni sul server)
//   battle.html?stagione=S&showdown=ID&match=N&locale=1  -> stessi team, stesso schermo (prove)
//   battle.html?cpu=1&team=ID                            -> prova del proprio team (dal Box) contro la CPU
//   battle.html                                           -> team di prova (sviluppo)
// =====================================================

import {
    BattagliaLocale, StatoCampo, leggiRichiesta, richiedeBersaglio,
    bersagliScegliibili, candidatiCambio, mossaEffettiva, sceltaCasuale, setDaTeam
} from './motore-battaglia.js';
import { Dex as DexSim, Teams } from './pkmn-sim.js';
import { caricaMatch, caricaPerProva } from './team-sito.js';
import { squadreCpu, nuovoCervello, sceglieTeam, nomeNeutro } from './cpu-partita.js';
import { BattagliaOnline } from './motore-online.js';
import { TEAM_PROVA_1, TEAM_PROVA_2 } from './team-prova.js';
import './nomi-unici.js';       // self.NomiUnici
import './nomi-log.js';         // self.NomiLog
import './team-bloccati.js';    // self.TeamBloccati: quali team non si modificano più
import './editor-team.js';      // self.EditorTeam: il Box aperto in una finestra per modificare il team
   import { installa as installaSchede, impostaPartita, seguiBattaglia, efficaciaBersaglio } from './battle-extra.js';
const CONFIG_PROVA = {
    formato: 'gen8vgc2022',
    etichetta: 'Test · VGC Gen 8',
    p1: { nome: 'Didi', team: TEAM_PROVA_1 },
    p2: { nome: 'Luca', team: TEAM_PROVA_2 }
};
const MATCH_PER_SHOWDOWN = 3;

// Pokémon identici nello stesso team (due Calyrex-Shadow): il client di Showdown non li distingue.
// Le righe del log passano di qui prima di arrivargli: i doppioni prendono nomi diversi. Se il server
// manda già nomi unici (functions/nomi-unici.js, dopo il deploy) non cambia nulla. Vedi nomi-log.js.
const riscrittoreLog = self.NomiLog.creaRiscrittore({
    baseDi: specie => DexSim.species.get(specie).baseSpecies,
    nomeForma: self.NomiUnici.nomeForma,
    conNumero: self.NomiUnici.conNumero
});
const PAUSA_TRA_SET = 10;   // secondi di pausa tra un set e il successivo (si può saltare col tasto)

// Classi del client di Showdown, raccolte in battle.html
const PS = window.PSClient || null;
const jq = window.jQuery;

const $ = id => document.getElementById(id);
let config = null;          // { formato, etichetta, p1: { nome, team }, p2: { nome, team } }
let battaglia, stato, pannelli, finita;

// Solo nella prova contro la CPU: { cerebro, team[] (quelli della CPU), indice (quale sta giocando), giocatore, errori, rqid,
// chiaveTeam (il team nel Box), modificabile (null mentre si controlla, poi true/false), avviso (testo sul cartello di fine
// partita), problemi (perché il team, dopo una modifica, non si può giocare), ultimoVincitore }
let cpu = null;
let editor = null;          // { frame, pronto } mentre la finestra dell'editor del team è aperta

// Solo online
let mioLato = null;         // 'p1' o 'p2'; null = locale (entrambi i lati) o spettatore
let online = null;          // { id, info, funzioni, stato, pronti, risultati, sceltaAvversario, datiMatch, giaSalvato }

// Scena di Showdown del set in corso
let scena = null;           // { battle, tooltips, righe, turnoVisto }
let prossimaScena = null;   // righe di un nuovo set arrivato mentre il set precedente si sta ancora animando
const attesaScena = [];     // cose da fare quando le animazioni arrivano in fondo
let setVisti = 0;
let titoloFineSet = '';     // "Didi wins set 1": il titolo del cartello a fine set
let prossimoSet = 0;        // numero del set che aspetta in prossimaScena
let pausaSet = null;        // { secondi, timer } mentre il cartello conta alla rovescia verso il set successivo
let squadraTooltip = null;  // ultima squadra (dalla richiesta) del lato che i tooltip conoscono


// -----------------------------------------------------
// Avvio della pagina
// -----------------------------------------------------
preparaAudio();
$('bot-p2').addEventListener('change', cambioBot);
   if (PS) installaSchede({ BattleTooltips: PS.BattleTooltips, ritardoMosse: 350 });
if (!PS || !PS.Battle || !jq) {
    mostraMessaggioCampo("Showdown's battle engine didn't load. Check your connection and reload the page.");
} else {
    const parametri = new URLSearchParams(location.search);
    if (parametri.get('showdown')) {
        const chiavi = {
            stagione: parametri.get('stagione'),
            showdown: parametri.get('showdown'),
            match: parametri.get('match') || '1'
        };
        if (parametri.get('locale')) preparaDaSito(chiavi);
        else preparaOnline(chiavi);
    } else if (parametri.get('cpu')) {
        preparaCpu(parametri.get('team'));
    } else {
        config = CONFIG_PROVA;
                   schedeLocali();
        impostaPannelli();
        avviaBattaglia();
    }
}
window.battagliaPronta = true;


// -----------------------------------------------------
// Modalità locale: team scelti da Firebase, stesso schermo
// -----------------------------------------------------
async function preparaDaSito(chiavi) {
    mostraMessaggioCampo('Loading the showdown…');

    let dati;
    try {
        if (!window.firebase) throw new Error('Firebase did not load: check the scripts in battle.html.');
        await new Promise(ok => { const stop = firebase.auth().onAuthStateChanged(() => { stop(); ok(); }); });
        dati = await caricaMatch(firebase.database(), chiavi);
    } catch (errore) {
        console.error(errore);
        return mostraMessaggioCampo(`Couldn't load the match: ${errore.message}`);
    }
    if (!DexSim.formats.get(dati.formato).exists) {
        return mostraMessaggioCampo(`The simulator format "${dati.formato}" doesn't exist. Fix the formatoSimulatore field of the ${dati.categoria} ruleset.`);
    }

    const scelte = { p1: null, p2: null };
    const pronti = { p1: false, p2: false };
    config = { formato: dati.formato, etichetta: dati.categoria, p1: { nome: dati.giocatori.p1.nome }, p2: { nome: dati.giocatori.p2.nome } };
    impostaPannelli();

    for (const lato of ['p1', 'p2']) {
        const g = dati.giocatori[lato];
        impostaNomeGiocatore(lato, g.nome);
        if (g.colore) document.documentElement.style.setProperty(`--colore-${lato}`, g.colore);
                   config[lato].avatar = g.avatar;
        const bloccato = dati.bloccati && dati.bloccati[lato];
        scelte[lato] = (bloccato && g.teams.find(t => t.nome === bloccato)) || g.teams[0] || null;
    }
    disegnaInfo();
    nascondiMessaggio();

    const disegna = () => {
        const colonne = ['p1', 'p2'].map(lato => {
            const g = dati.giocatori[lato];
            const bloccato = dati.bloccati && dati.bloccati[lato];
            return sceltaTeam({
                titolo: g.nome,
                teams: g.teams,
                scelto: scelte[lato],
                bloccato,
                pronto: pronti[lato],
                vuoto: `${g.nome} has no teams registered in ${dati.categoria}.`,
                onScegli: t => { scelte[lato] = t; disegna(); },
                onPronto: () => {
                    pronti[lato] = !pronti[lato];
                    if (pronti.p1 && pronti.p2) {
                        config.p1.team = scelte.p1.testo;
                        config.p2.team = scelte.p2.testo;
                                                   config.p1.nomeTeam = scelte.p1.nome;
                           config.p2.nomeTeam = scelte.p2.nome;
                           schedeLocali();
                        $('lobby').hidden = true;
                        return avviaBattaglia();
                    }
                    disegna();
                }
            });
        });
        mostraLobby(el('h2', { class: 'lobby-titolo', testo: 'Pick both teams' }), el('div', { class: 'lobby-colonne' }, colonne));
    };
    disegna();
}


// -----------------------------------------------------
// Prova contro la CPU: il team del Box del giocatore contro uno della CPU, dello stesso formato
// -----------------------------------------------------
// I team della CPU li compone cpu-partita.js dal pool del formato, quindi esistono per ogni formato, anche nuovo.
// La CPU sceglie le mosse con cpu-ia.js. A fine partita: stessa squadra della CPU, un'altra a caso, o ritorno al Box.
async function preparaCpu(chiaveTeam) {
    $('opzione-bot').hidden = true;
    const ritorno = $('link-hub');
    ritorno.href = 'box.html';
    ritorno.textContent = '← Box';
    mostraMessaggioCampo('Loading your team…');

    let dati, squadre;
    try {
        if (!window.firebase) throw new Error('Firebase did not load: check the scripts in battle.html.');
        await new Promise(ok => { const stop = firebase.auth().onAuthStateChanged(() => { stop(); ok(); }); });
        const utente = firebase.auth().currentUser;
        if (!utente) throw new Error('Log in on the site to practice against the CPU.');
        if (!chiaveTeam) throw new Error('No team selected: open this page from your Box.');
        dati = await caricaPerProva(firebase.database(), utente, chiaveTeam);
        if (!DexSim.formats.get(dati.formato).exists) {
            throw new Error(`The simulator format "${dati.formato}" doesn't exist. Fix the formatoSimulatore field of the ${dati.categoria} ruleset.`);
        }
        if (dati.problemi.length) throw new Error(`This team can't be used in ${dati.categoria}: ${dati.problemi.join('; ')}`);
        mostraMessaggioCampo(`Building the CPU teams for ${dati.categoria}…`);
        squadre = await squadreCpu(dati.regolamento, { iniziali: dati.iniziali });
        if (!squadre.team.length) {
            throw new Error(`The CPU couldn't build teams for ${dati.categoria}${squadre.avvisi.length ? ' (' + squadre.avvisi[0] + ')' : ''}.`);
        }
    } catch (errore) {
        console.error(errore);
        return mostraMessaggioCampo(`Couldn't start the practice: ${errore.message}`);
    }

    document.body.classList.add('prova-cpu');
    cpu = {
        cerebro: null, team: squadre.team, indice: sceglieTeam(squadre.team), giocatore: dati, errori: 0, rqid: null,
        chiaveTeam, modificabile: null, avviso: '', problemi: [], ultimoVincitore: null
    };
    config = {
        formato: dati.formato,
        etichetta: `Practice vs CPU · ${dati.categoria}`,
        p1: { nome: dati.nome, team: dati.team.testo, nomeTeam: dati.team.nome, avatar: dati.avatar },
        p2: { nome: 'CPU', team: '', nomeTeam: '' }
    };
    if (dati.colore) document.documentElement.style.setProperty('--colore-p1', dati.colore);
    impostaPannelli();
    verificaModificabile(dati.team.nome);     // in sottofondo: a fine partita si sa già se il team si può modificare
    iniziaContro(cpu.indice);
}

// Mette in campo il team della CPU indicato e fa partire la battaglia
function iniziaContro(indice) {
    cpu.indice = indice;
    cpu.avviso = '';
    cpu.ultimoVincitore = null;
    const t = cpu.team[indice];
    config.p2.team = t.testo;
    config.p2.nomeTeam = nomeNeutro(t, indice);     // "Team 7", mai il piano di gioco: si saprebbe già cosa farà
    schedeCpu();
    avviaBattaglia();
}

// Colonne dei player: il team del giocatore si vede, quello della CPU solo come in una partita vera (le specie)
function schedeCpu() {
    impostaPartita({
        openSheet: false,
        latiNoti: ['p1'],
        p1: { nome: config.p1.nome, avatar: config.p1.avatar || '', candidati: [{ nome: config.p1.nomeTeam, set: setDaTeam(config.p1.team) }] },
        p2: { nome: 'CPU', avatar: '', candidati: [{ nome: config.p2.nomeTeam, set: setDaTeam(config.p2.team).map(x => ({ species: x.species, name: x.name })) }] }
    });
}

// I pulsanti di fine partita: rivincita, un altro team della CPU, modifica del proprio team (solo se si può) e ritorno al Box.
// Su schermi larghi stanno nel cartello sullo schermo, sui telefoni (dove il cartello è piccolo) nel pannello sotto lo
// schermo: vedi style-battle.css
function azioniCpu() {
    const azioni = [];
    // dopo una modifica il team può non essere più giocabile nel simulatore: allora niente rivincita finché non si sistema
    if (!cpu.problemi.length) {
        azioni.push(
            el('button', { type: 'button', class: 'btn primario', onclick: () => iniziaContro(cpu.indice) }, 'Rematch · same CPU team'),
            el('button', { type: 'button', class: 'btn secondario', onclick: () => iniziaContro(sceglieTeam(cpu.team, cpu.indice)) }, 'Another random CPU team'));
    }
    // Come nel Box, il team si modifica solo se non è già iscritto a una stagione iniziata (team-bloccati.js)
    if (cpu.modificabile === true) azioni.push(el('button', { type: 'button', class: 'btn secondario', onclick: apriEditorTeam }, 'Edit my team'));
    azioni.push(el('a', { class: 'btn secondario', href: 'box.html' }, 'Back to Box'));
    return azioni;
}

// Quello che sta scritto sul cartello sotto il titolo: i due team, e se serve una nota (team aggiornato, team bloccato, errori)
function riepilogoFineCpu() {
    const nota = cpu.avviso || (cpu.modificabile === false ? '🔒 Locked team: it can\'t be edited' : '');
    return `${config.p1.nomeTeam} vs ${config.p2.nomeTeam}${nota ? ` · ${nota}` : ''}`;
}

function mostraFineCpu(vincitore) {
    cpu.ultimoVincitore = vincitore;
    const vinto = !!vincitore && vincitore === config.p1.nome;
    const titolo = !vincitore ? "It's a tie!" : vinto ? 'You win!' : 'The CPU wins!';
    mostraEsito(titolo, { sotto: riepilogoFineCpu(), azioni: azioniCpu() });
}

// Cambia qualcosa dopo la fine della partita (si è saputo se il team è bloccato, il team è stato modificato...): si ridisegna
function aggiornaFineCpu() {
    // non è finita, o il cartello non c'è ancora (le animazioni stanno finendo): lo mostrerà la fine partita, già aggiornato
    if (!cpu || !finita || $('vittoria').hidden) return;
    mostraFineCpu(cpu.ultimoVincitore);
    ridisegnaComandi();
}

// Il team del Box di chi gioca può essere ancora modificato? La stessa regola del tasto con la matita (team-bloccati.js).
// Nel dubbio (errore di rete, permessi) no: è la regola che protegge i team già iscritti.
async function verificaModificabile(nomeTeam) {
    try {
        const snap = await firebase.database().ref('seasons').once('value');
        cpu.modificabile = !self.TeamBloccati.eBloccato(snap.val(), nomeTeam);
    } catch (errore) {
        console.warn("Couldn't check whether the team is locked", errore);
        cpu.modificabile = false;
    }
    aggiornaFineCpu();
}


// -----------------------------------------------------
// Modifica del proprio team a fine partita (prova contro la CPU)
// -----------------------------------------------------
// Il Box si apre in una finestra sopra il simulatore (iframe, vedi editor-team.js): è lo stesso editor del Box, con le
// stesse regole e lo stesso salvataggio. Chiusa la finestra il team si rilegge da Firebase e la prossima partita lo usa.
function apriEditorTeam() {
    if (!cpu || cpu.modificabile !== true || editor) return;
    const frame = el('iframe', { title: 'Team editor', allow: 'clipboard-write', src: EditorTeam.urlEditor(cpu.chiaveTeam) });
    $('editor-team-titolo').textContent = `Edit team · ${config.p1.nomeTeam}`;
    $('editor-team-corpo').append(frame);
    $('editor-team').hidden = false;
    document.body.classList.add('con-editor');
    editor = { frame, pronto: false };
    $('editor-team-chiudi').focus();
}

function chiudiEditorTeam() {
    if (!editor) return;
    editor.frame.remove();             // tolto, non portato su about:blank: così il browser non chiede "Leave site?"
    editor = null;
    $('editor-team').hidden = true;
    document.body.classList.remove('con-editor');
}

// "Back" (o Esc, quando la tastiera è sul simulatore e non dentro l'editor): se l'editor è aperto si passa dalle sue chiusure
// (chiedono conferma se ci sono modifiche non salvate)
function chiediChiusuraEditor() {
    if (!editor) return;
    if (editor.pronto) editor.frame.contentWindow.postMessage({ sito: EditorTeam.SITO, comando: 'chiudi' }, location.origin);
    else chiudiEditorTeam();
}
$('editor-team-chiudi').addEventListener('click', chiediChiusuraEditor);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && editor) chiediChiusuraEditor(); });

window.addEventListener('message', e => {
    if (!editor) return;
    const m = EditorTeam.leggiMessaggio(e, { origine: location.origin, sorgente: editor.frame.contentWindow });
    if (!m) return;
    if (m.evento === 'pronto') editor.pronto = true;
    else if (m.evento === 'salvato') { chiudiEditorTeam(); dopoModificaTeam(); }
    else if (m.evento === 'chiuso') chiudiEditorTeam();
    else if (m.evento === 'bloccato') {
        chiudiEditorTeam();
        cpu.modificabile = false;
        aggiornaFineCpu();
    } else if (m.evento === 'errore') {
        chiudiEditorTeam();
        cpu.avviso = m.messaggio || "The editor couldn't open.";
        aggiornaFineCpu();
    }
});

// Il team è stato salvato nel Box: si rilegge e si aggiornano colonne e pulsanti
async function dopoModificaTeam() {
    let dati;
    try {
        dati = await caricaPerProva(firebase.database(), firebase.auth().currentUser, cpu.chiaveTeam);
    } catch (errore) {
        console.error(errore);
        cpu.avviso = `Team saved, but it couldn't be reloaded (${errore.message}). Reload the page to use it.`;
        return aggiornaFineCpu();
    }
    // Se la modifica ha cambiato il formato del team, la CPU e il simulatore non sono più quelli giusti: si riparte da capo
    if (dati.formato !== config.formato) return location.reload();
    cpu.giocatore = dati;
    cpu.problemi = dati.problemi;
    config.p1.team = dati.team.testo;
    config.p1.nomeTeam = dati.team.nome;
    cpu.avviso = dati.problemi.length ? `Team updated, but it can't be used here: ${dati.problemi.join('; ')}` : 'Team updated ✓';
    schedeCpu();
    verificaModificabile(dati.team.nome);     // il nome può essere cambiato
    aggiornaFineCpu();
}


// -----------------------------------------------------
// Match ONLINE: ognuno sul proprio dispositivo
// -----------------------------------------------------
async function preparaOnline(chiavi) {
    $('opzione-bot').hidden = true;
    mostraMessaggioCampo('Connecting to the match…');

    if (!window.firebase || !firebase.functions) {
        return mostraMessaggioCampo('Firebase did not load: check the scripts in battle.html.');
    }
    await new Promise(ok => { const stop = firebase.auth().onAuthStateChanged(() => { stop(); ok(); }); });
    if (!firebase.auth().currentUser) return mostraMessaggioCampo('Log in on the site to play or watch this match.');

    const funzioni = firebase.app().functions('europe-west1');
    let aperta;
    try {
        aperta = (await funzioni.httpsCallable('apriPartita')(chiavi)).data;
    } catch (e) {
        return mostraMessaggioCampo(`Couldn't open the match: ${e.message}`);
    }

    const { id, lato, info, giaSalvato } = aperta;
    mioLato = lato;
    document.body.classList.toggle('spettatore', !mioLato);
    document.body.classList.toggle('vista-p2', mioLato === 'p2');   // chi gioca sta sempre a sinistra
    $('badge-live').hidden = !!mioLato;
    $('link-hub').href = `matches.html?id=${encodeURIComponent(info.stagione)}`;
    online = { id, info, funzioni, giaSalvato, stato: null, pronti: {}, risultati: {}, sceltaAvversario: null, datiMatch: null };
    config = { formato: info.formato, etichetta: info.categoria, p1: { nome: info.p1.nome }, p2: { nome: info.p2.nome } };
    impostaNomeGiocatore('p1', info.p1.nome);
    impostaNomeGiocatore('p2', info.p2.nome);
    impostaPannelli();
    nuovoSet();

    // Colori dei giocatori e team per la lobby (letti da Firebase come nel resto del sito)
    try {
        online.datiMatch = await caricaMatch(firebase.database(), chiavi);
        for (const l of ['p1', 'p2']) {
            const colore = online.datiMatch.giocatori[l].colore;
            if (colore) document.documentElement.style.setProperty(`--colore-${l}`, colore);
        }
                   schedeOnline();
    } catch (e) {
        console.warn('Match data not loaded', e);
    }

    battaglia = new BattagliaOnline({ id, lato, db: firebase.database(), funzioni });
    collegaEventi(battaglia);
    battaglia.on('stato', s => { online.stato = s; aggiornaFase(); });
    battaglia.on('pronti', p => { online.pronti = p; if (online.stato === 'lobby') disegnaLobby(); aggiornaStati(); });
    battaglia.on('risultati', r => { online.risultati = r; disegnaInfo(); });
    battaglia.on('avversario', passo => {
        online.sceltaAvversario = passo;
        aggiornaStati();
        if (pannelli && pannelli[mioLato] && pannelli[mioLato].inviata) disegnaPannello(mioLato);   // il pulsante "Cancel" sparisce
    });
    battaglia.on('set', n => { nuovoSet(n); disegnaInfo(); ridisegnaComandi(); });
    battaglia.avvia();
}

const avversarioDi = lato => (lato === 'p1' ? 'p2' : 'p1');
const nomeDi = lato => (config && config[lato] ? config[lato].nome : lato.toUpperCase());

// Cosa mostrare a seconda della fase del match
function aggiornaFase() {
    const s = online.stato;
    const eraInGioco = ['in_corso', 'da_salvare', 'salvataggio'].includes(online.statoPrima);
    online.statoPrima = s;
    disegnaInfo();

    if (s === 'lobby') {
        if (online.giaSalvato) {
            nascondiLobby();
            mostraEsito('Already played', { sotto: 'This match has already been recorded.', azioni: azioniFineMatch(false) });
        } else {
            disegnaLobby();
        }
    } else {
        nascondiLobby();
        nascondiMessaggio();
        // a match finito il conto alla rovescia verso un nuovo set non ha più senso (e non deve coprire l'esito)
        if (s !== 'in_corso') fermaPausaSet();
        if (s === 'da_salvare' || s === 'salvataggio') {
            quandoScenaFerma(() => mostraEsito('Match over', { sotto: 'Saving the result…' }));
        } else if (s === 'salvata') {
            quandoScenaFerma(() => {
                const { s1, s2 } = punteggio();
                const ultimo = Number(online.info.match) >= MATCH_PER_SHOWDOWN;
                mostraEsito(`${nomeDi('p1')} ${s1} – ${s2} ${nomeDi('p2')}`, {
                    sotto: ultimo ? 'Match saved. The showdown is complete.' : 'Match saved.',
                    azioni: azioniFineMatch(eraInGioco)
                });
            });
        } else if (s === 'errore_salvataggio') {
            quandoScenaFerma(() => mostraEsito('Match over', {
                sotto: "The result couldn't be saved. Let an admin know.",
                azioni: [el('a', { class: 'btn secondario', href: $('link-hub').href }, 'Back to hub')]
            }));
        }
    }
    aggiornaStati();
    ridisegnaComandi();
}

function punteggio(risultati = online.risultati) {
    let s1 = 0, s2 = 0;
    for (const r of Object.values(risultati || {})) {
        if (r.vincitore === 'p1') s1++;
        if (r.vincitore === 'p2') s2++;
    }
    return { s1, s2 };
}

// Bottoni a fine match: prossimo match (con partenza automatica) e ritorno all'hub
function azioniFineMatch(avantiDaSolo) {
    const { stagione, showdown, match } = online.info;
    const prossimo = Number(match) + 1;
    const hub = `matches.html?id=${encodeURIComponent(stagione)}`;
    const azioni = [];
    if (prossimo <= MATCH_PER_SHOWDOWN) {
        const link = `battle.html?stagione=${encodeURIComponent(stagione)}&showdown=${encodeURIComponent(showdown)}&match=${prossimo}`;
        azioni.push(el('a', { class: 'btn primario', href: link }, `Match ${prossimo} ➜`));
        azioni.push(el('a', { class: 'btn secondario', href: hub }, 'Back to hub'));
        if (avantiDaSolo) contoAllaRovescia(link, prossimo);
    } else {
        azioni.push(el('a', { class: 'btn primario', href: hub }, 'See the showdown'));
    }
    return azioni;
}

function contoAllaRovescia(link, prossimo) {
    let secondi = 6;
    const scrivi = () => { $('sotto-vittoria').textContent = `Match saved. Match ${prossimo} starts in ${secondi} s.`; };
    setTimeout(function tic() {
        scrivi();
        if (secondi-- <= 0) { location.href = link; return; }
        setTimeout(tic, 1000);
    }, 0);
}


// -----------------------------------------------------
// Lobby: scelta del team per tutto il match
// -----------------------------------------------------
function disegnaLobby() {
    nascondiMessaggio();
    if (!mioLato) {
        const riga = lato => el('li', { testo: `${nomeDi(lato)}: ${online.pronti[lato] ? 'ready ✓' : 'picking a team…'}` });
        return mostraLobby(
            el('h2', { class: 'lobby-titolo', testo: `Match ${online.info.match}: players are picking their teams` }),
            el('ul', { class: 'lobby-stati' }, riga('p1'), riga('p2'))
        );
    }

    const mio = online.datiMatch && online.datiMatch.giocatori[mioLato];
    const teams = mio ? mio.teams : [];
    online.teamScelto ||= teams[0] && teams[0].nome;
    const scelto = teams.find(t => t.nome === online.teamScelto) || teams[0] || null;
    const pronto = !!online.pronti[mioLato];
    const avv = avversarioDi(mioLato);

    mostraLobby(
        el('h2', { class: 'lobby-titolo', testo: `Match ${online.info.match}: pick your team` }),
        el('p', { class: 'lobby-sotto' },
            'You keep it for every set of this match. ',
            el('strong', { testo: online.pronti[avv] ? `${nomeDi(avv)} is ready.` : `${nomeDi(avv)} is still picking.` })),
        sceltaTeam({
            teams,
            scelto,
            pronto,
            occupato: online.invioLobby,
            errore: online.erroreLobby,
            vuoto: `You have no teams registered in ${online.info.categoria}.`,
            onScegli: t => { online.teamScelto = t.nome; online.erroreLobby = ''; disegnaLobby(); },
            onPronto: async () => {
                online.invioLobby = true;
                online.erroreLobby = '';
                disegnaLobby();
                try {
                    await online.funzioni.httpsCallable('prontoPartita')({ id: online.id, team: pronto ? null : scelto.nome });
                } catch (e) {
                    online.erroreLobby = e.message;
                }
                online.invioLobby = false;
                if (online.stato === 'lobby') disegnaLobby();
            }
        })
    );
}

// Scelta del team: una scheda per team con le icone dei Pokémon, poi "Ready"
function sceltaTeam({ titolo, teams, scelto, bloccato, pronto, occupato, errore, vuoto, onScegli, onPronto }) {
    const box = el('div', { class: 'scelta-team' });
    if (titolo) box.append(el('h3', { class: 'scelta-team-titolo', testo: titolo }));

    if (!teams.length) return box.append(el('p', { class: 'errore', testo: vuoto })), box;
    if (bloccato && !teams.some(t => t.nome === bloccato)) {
        return box.append(el('p', { class: 'errore', testo: `The locked team "${bloccato}" is no longer registered.` })), box;
    }

    box.append(el('div', { class: 'schede-team', role: 'radiogroup', 'aria-label': 'Team' }, teams.map(t => {
        const attivo = scelto && t.nome === scelto.nome;
        const specie = (Teams.import(t.testo) || []).map(s => s.species);
        return el('button', {
            type: 'button',
            class: 'scheda-team' + (attivo ? ' scelta' : ''),
            role: 'radio',
            'aria-checked': attivo ? 'true' : 'false',
            disabled: !!pronto || !!(bloccato && t.nome !== bloccato),
            onclick: () => onScegli(t)
        },
        el('span', { class: 'scheda-team-nome', testo: t.nome }),
        el('span', { class: 'scheda-team-icone' }, specie.map(sp => icona(sp))));
    })));

    const problemi = (scelto && scelto.problemi) || [];
    if (problemi.length) {
        box.append(el('div', { class: 'errore' },
            el('strong', { testo: "This team can't be used. Save it again from the Box." }),
            el('ul', {}, problemi.map(t => el('li', { testo: t })))));
    }
    if (scelto && scelto.completo === false) {
        box.append(el('p', { class: 'avviso', testo: 'Saved before the Box update: level, Gigantamax, gender and happiness use default values. Save it again from the Box by pasting the original text.' }));
    }
    if (errore) box.append(el('p', { class: 'errore', testo: errore }));

    box.append(el('div', { class: 'riga-azioni' }, el('button', {
        type: 'button',
        class: 'btn ' + (pronto ? 'scelto' : 'primario'),
        disabled: !scelto || problemi.length > 0 || !!occupato,
        onclick: onPronto
    }, pronto ? 'Ready ✓ (undo)' : 'Ready')));
    return box;
}

function mostraLobby(...figli) {
    const box = $('lobby');
    box.replaceChildren(el('div', { class: 'lobby-interno' }, figli));
    box.hidden = false;
}
function nascondiLobby() {
    $('lobby').hidden = true;
}


// -----------------------------------------------------
// Scena di Showdown (campo + cronaca)
// -----------------------------------------------------
function creaScena({ recupera = false } = {}) {
    distruggiScena();
    jq('#log').empty();
    const battle = new PS.Battle({
        id: `battle-sito-${Math.floor(Math.random() * 1e6)}`,
        $frame: jq('#campo'),
        $logFrame: jq('#log'),
        autoresize: true
    });
    battle.setViewpoint(mioLato || 'p1');
    battle.setMute(audioSpento());
    if (squadraTooltip) battle.myPokemon = squadraPerTooltip(battle, squadraTooltip);
    battle.subscribe(evento => {
        if (evento === 'atqueueend') {
            while (attesaScena.length) attesaScena.shift()();
            disegnaInfo();
            ridisegnaComandi();
        }
    });

    const tooltips = battle.scene.tooltips;
    tooltips.listen($('comandi'));
    scena = { battle, tooltips, righe: 0, turnoVisto: false };
       seguiBattaglia(battle);
    // Chi arriva a set iniziato non rivede tutte le animazioni: si salta al turno in corso
    if (recupera) {
        const questa = scena;
        setTimeout(() => {
            if (scena === questa && questa.turnoVisto) questa.battle.seekTurn(Infinity);
        }, 800);
    }
}

// I tooltip di Showdown vogliono la squadra della richiesta già "letta"
// (specie, livello, HP): è quello che fa BattleChoiceBuilder.fixRequest nel client ufficiale
function squadraPerTooltip(battle, pokemon) {
    return pokemon.map(p => {
        const sp = { ...p };
        try {
            battle.parseDetails(sp.ident.substr(4), sp.ident, sp.details, sp);
            battle.parseHealth(sp.condition, sp);
        } catch (e) {
            console.warn('Tooltip data not parsed', e);
        }
        return sp;
    });
}

function distruggiScena() {
    if (!scena) return;
    scena.tooltips.unlisten($('comandi'));
    PS.BattleTooltips.hideTooltip();
    scena.battle.destroy();
    scena = null;
    jq('#log').empty();
}

function aggiungiAScena(righe) {
    if (!PS) return;
    if (prossimaScena) { prossimaScena.push(...righe); return; }
    if (!scena) creaScena();
    if (righe.some(r => r.startsWith('|turn|'))) scena.turnoVisto = true;
    scena.battle.addBatch(righe);
    scena.righe += righe.length;
}

// Il campo sta ancora animando qualcosa?
function scenaInCorsa() {
    return !!prossimaScena || (!!scena && !scena.battle.atQueueEnd);
}

// Le animazioni di Showdown stanno ancora girando? (a differenza di scenaInCorsa non conta la pausa tra i set)
// Finché girano, nulla di ciò che sta fuori dallo schermo deve dire come è andata a finire: un turno
// che chiude il set o il match deve essere indistinguibile da uno qualsiasi (vedi disegnaPannello e disegnaInfo).
function animazioneInCorso() {
    return !!scena && !scena.battle.atQueueEnd;
}

// Esegue fn quando le animazioni sono arrivate in fondo (mai oltre 30 s)
function quandoScenaFerma(fn) {
    if (!scenaInCorsa()) return fn();
    attesaScena.push(fn);
    setTimeout(() => {
        const i = attesaScena.indexOf(fn);
        if (i >= 0) { attesaScena.splice(i, 1); fn(); }
    }, 30000);
}

function avviaProssimaScena() {
    const righe = prossimaScena || [];
    prossimaScena = null;
    fermaPausaSet();
    titoloFineSet = '';
    nascondiEsito();
    creaScena();
    if (righe.length) aggiungiAScena(righe);
    ridisegnaComandi();
}


// Tra un set e l'altro: il risultato resta in vista col conto alla rovescia e il tasto per proseguire,
// come a fine match. La logica del set successivo è già partita sul server; qui si decide solo
// quando mostrarlo (chi sceglie il team preview aspetta che questo cartello se ne vada).
function avviaPausaSet() {
    if (!prossimaScena) return;                 // nel frattempo il set è già partito
    fermaPausaSet();
    pausaSet = { secondi: PAUSA_TRA_SET, timer: null };
    mostraFineSet();
    pausaSet.timer = setInterval(() => {
        if (--pausaSet.secondi <= 0) return avviaProssimaScena();
        $('sotto-vittoria').textContent = testoPausaSet();
    }, 1000);
    ridisegnaComandi();
}

function fermaPausaSet() {
    if (pausaSet) clearInterval(pausaSet.timer);
    pausaSet = null;
}

const testoPausaSet = () => `Set ${prossimoSet} starts in ${pausaSet.secondi} s.`;

// Cartello di fine set: col conto alla rovescia se il set successivo è già arrivato
function mostraFineSet() {
    const titolo = titoloFineSet || 'Set over';
    if (!pausaSet) return mostraEsito(titolo);
    mostraEsito(titolo, {
        sotto: testoPausaSet(),
        azioni: [el('button', { type: 'button', class: 'btn primario', onclick: avviaProssimaScena }, `Set ${prossimoSet} ➜`)]
    });
}


// -----------------------------------------------------
// Avvio di una battaglia (un set)
// -----------------------------------------------------
function avviaBattaglia() {
    impostaNomeGiocatore('p1', config.p1.nome);
    impostaNomeGiocatore('p2', config.p2.nome);
    nascondiMessaggio();
    nuovoSet();
    disegnaInfo();
    // il cervello conosce la strategia del team che sta giocando (non si vede da nessuna parte: il team si chiama "Team N")
    if (cpu) { cpu.cerebro = nuovoCervello('p2', { piano: cpu.team[cpu.indice] && cpu.team[cpu.indice].piano }); cpu.errori = 0; cpu.rqid = null; }
    battaglia = new BattagliaLocale({ formato: config.formato, p1: config.p1, p2: config.p2 });
    collegaEventi(battaglia);
    battaglia.avvia();
}

// Nuovo set: la logica riparte subito, il campo solo quando il set
// precedente ha finito di animarsi (così si vede come è andato a finire)
function nuovoSet(numero) {
    stato = new StatoCampo();
    pannelli = { p1: nuovoPannello(), p2: nuovoPannello() };
    finita = false;
    if (!PS) return;

    const recupera = !!numero && setVisti++ === 0;
    if (numero && scena && scena.righe) {
        // Il set precedente resta in vista (finché non ha finito di animarsi, poi per PAUSA_TRA_SET secondi
        // o finché non si preme il tasto); intanto le righe del nuovo set si accumulano in prossimaScena
        const animando = !scena.battle.atQueueEnd;
        prossimaScena = [];
        prossimoSet = numero;
        if (animando) quandoScenaFerma(avviaPausaSet);
        else avviaPausaSet();
    } else {
        nascondiEsito();
        creaScena({ recupera });
    }
}

// Eventi comuni a battaglia locale e online
function collegaEventi(b) {
    b.on('log', righe => {
        if (cpu && cpu.cerebro) cpu.cerebro.osserva(righe);     // la CPU legge il log com'è uscito dal simulatore
        righe = riscrittoreLog.riscrivi(righe);
        stato.aggiorna(righe);
        aggiungiAScena(righe);
        disegnaInfo();
        ridisegnaComandi();
    });

    b.on('richiesta', (lato, richiesta) => {
        if (cpu && lato === 'p2' && richiesta.rqid !== cpu.rqid) { cpu.rqid = richiesta.rqid; cpu.errori = 0; }   // richiesta nuova: si riparte dalla scelta migliore
        const p = pannelli[lato];
        const errore = p.erroreInSospeso;   // es. "[Unavailable choice]": il simulatore manda subito una richiesta aggiornata
        Object.assign(p, nuovoPannello(), { grezza: richiesta, r: leggiRichiesta(richiesta), errore });
        // I tooltip di Showdown leggono le statistiche esatte dei propri Pokémon da qui
        if (richiesta.side && lato === latoTooltip()) {
            squadraTooltip = richiesta.side.pokemon;
            if (scena) scena.battle.myPokemon = squadraPerTooltip(scena.battle, squadraTooltip);
        }
        if (botAttivo(lato)) return giocaBot(lato);
        avanza(lato);
    });

    b.on('errore', (lato, messaggio) => {
        if (cpu && lato === 'p2') cpu.errori++;                 // la CPU prova la scelta successiva
        const p = pannelli[lato];
        if (messaggio.startsWith('[Unavailable choice]')) { p.erroreInSospeso = messaggio; return; }
        Object.assign(p, nuovoPannello(), { grezza: p.grezza, r: p.r, errore: messaggio });
        if (botAttivo(lato)) return giocaBot(lato);
        avanza(lato);
    });

    b.on('fine', ({ vincitore }) => {
        finita = true;
        ridisegnaComandi();
        const numeroSet = online && battaglia.set;
        if (online) {
            // il set successivo parte da solo, dopo la pausa: basta un cartello
            titoloFineSet = vincitore ? `${vincitore} wins set ${numeroSet}` : `Set ${numeroSet} is a tie`;
            if (pausaSet) mostraFineSet();     // il set dopo era già arrivato: il cartello c'è, si aggiorna il titolo
        }
        quandoScenaFerma(() => {
            if (online) {
                if (!pausaSet) mostraFineSet();
            } else if (cpu) {
                mostraFineCpu(vincitore);
            } else {
                mostraEsito(vincitore ? `${vincitore} wins!` : "It's a tie!", {
                    azioni: [el('button', { type: 'button', class: 'btn primario', onclick: avviaBattaglia }, 'New battle')]
                });
            }
        });
    });
}

function nuovoPannello() {
    return {
        grezza: null,            // richiesta originale del simulatore
        r: null,                 // richiesta "letta" (leggiRichiesta)
        bozza: [],               // scelte già fatte, una per slot
        potenziamento: null,     // 'dynamax', 'terastallize', 'mega', 'zmove'... scelto per lo slot corrente
        usati: [],               // potenziamenti già assegnati in questo turno
        attesaBersaglio: null,
        ordine: [],              // anteprima: ordine dei Pokémon scelti
        inviata: false,
        annullando: false,       // il ritiro della scelta è in corso (si aspetta la risposta)
        erroreAnnulla: '',       // perché non si è potuto ritirare (es. "Too late: your opponent has already chosen.")
        errore: '',
        erroreInSospeso: ''
    };
}


// -----------------------------------------------------
// Bot (solo per P2, solo in prova)
// -----------------------------------------------------
function botAttivo(lato) {
    return !online && lato === 'p2' && (!!cpu || $('bot-p2').checked);
}

function giocaBot(lato) {
    const p = pannelli[lato];
    if (!p.grezza || p.grezza.wait || finita) return ridisegnaComandi();
    setTimeout(() => {
        let scelta;
        if (cpu && cpu.cerebro) {
            // la CPU ragiona; se per qualche motivo non riesce, gioca una mossa valida a caso
            try { scelta = cpu.cerebro.scegli(p.grezza, { errori: cpu.errori }); } catch (errore) {
                console.error('CPU:', errore);
                scelta = sceltaCasuale(p.grezza, stato, lato);
            }
        } else scelta = sceltaCasuale(p.grezza, stato, lato);
        if (scelta) {
            p.inviata = true;
            battaglia.scegli(lato, scelta);
        }
        ridisegnaComandi();
    }, cpu ? 650 : 400);     // la CPU aspetta un attimo: il log del turno deve esserle arrivato, e sembra meno istantanea
}

function cambioBot() {
    impostaPannelli();
    const p = pannelli && pannelli.p2;
    if (botAttivo('p2') && p && p.grezza && !p.inviata) giocaBot('p2');
    else ridisegnaComandi();
}


// -----------------------------------------------------
// Costruzione della scelta
// -----------------------------------------------------
// Riempie da solo gli slot che non richiedono decisioni
// e invia quando tutti gli slot hanno una scelta.
function avanza(lato) {
    const p = pannelli[lato];
    const r = p.r;

    if (!r || r.tipo === 'attesa' || r.tipo === 'anteprima') return disegnaPannello(lato);

    const numSlot = r.tipo === 'cambio' ? r.slotDaCambiare.length : r.attivi.length;

    while (p.bozza.length < numSlot) {
        const i = p.bozza.length;
        if (r.tipo === 'cambio' && (!r.slotDaCambiare[i] || candidati(lato, i).length === 0)) { p.bozza.push('pass'); continue; }
        if (r.tipo === 'mossa' && r.attivi[i].esausto) { p.bozza.push('pass'); continue; }
        break;
    }

    if (p.bozza.length === numSlot) return invia(lato, p.bozza.join(', '));
    disegnaPannello(lato);
}

function scegliSlot(lato, scelta) {
    const p = pannelli[lato];
    if (p.potenziamento) p.usati.push(p.potenziamento);
    p.bozza.push(scelta);
    p.potenziamento = null;
    p.attesaBersaglio = null;
    avanza(lato);
}

function invia(lato, scelta) {
    const p = pannelli[lato];
    p.inviata = true;
    p.errore = '';
    battaglia.scegli(lato, scelta);
    disegnaPannello(lato);
}

function ricomincia(lato) {
    const p = pannelli[lato];
    Object.assign(p, { bozza: [], potenziamento: null, usati: [], attesaBersaglio: null, ordine: [] });
    avanza(lato);
}

// Ritirare la scelta già inviata: si può finché l'avversario non ha scelto (poi il turno si gioca da solo).
// Mai contro la CPU (sceglie subito) né contro il bot.
function puoAnnullare(lato) {
    const p = pannelli && pannelli[lato];
    if (!p || !p.inviata || finita || cpu || !battaglia || typeof battaglia.annulla !== 'function') return false;
    if (online) {
        if (lato !== mioLato || online.stato !== 'in_corso') return false;
        return !(online.sceltaAvversario && online.sceltaAvversario === battaglia.passo);
    }
    // locale, due giocatori sullo stesso schermo: finché l'altro non ha scelto
    const altro = avversarioDi(lato);
    return !botAttivo(altro) && !!pannelli[altro] && !pannelli[altro].inviata;
}

function bottoneAnnulla(lato) {
    const p = pannelli[lato];
    return el('span', { class: 'annulla-scelta' },
        el('button', {
            type: 'button',
            class: 'btn secondario piccolo',
            disabled: p.annullando,
            onclick: () => annullaScelta(lato)
        }, p.annullando ? 'Cancelling…' : 'Cancel my choice'),
        p.erroreAnnulla ? el('span', { class: 'annulla-errore', role: 'alert', testo: p.erroreAnnulla }) : null);
}

async function annullaScelta(lato) {
    const p = pannelli[lato];
    if (!puoAnnullare(lato) || p.annullando) return;
    const richiesta = p.grezza;
    p.annullando = true;
    p.erroreAnnulla = '';
    disegnaPannello(lato);
    const esito = await battaglia.annulla(lato);
    // nel frattempo è arrivata un'altra richiesta (il turno è andato avanti): il pannello è già un altro
    if (!pannelli || pannelli[lato] !== p || p.grezza !== richiesta) return;
    p.annullando = false;
    if (!esito.ok) {
        p.erroreAnnulla = esito.messaggio;
        return disegnaPannello(lato);
    }
    // la scelta non c'è più: si torna a sceglierla con la richiesta che c'era già
    p.inviata = false;
    p.errore = '';
    if (p.r && p.r.tipo === 'anteprima') disegnaPannello(lato);   // l'ordine scelto resta: basta ritoccarlo
    else ricomincia(lato);
}

// Chi può entrare nello slot indicato (esclusi quelli già scelti in questo turno)
function candidati(lato, slot) {
    const p = pannelli[lato];
    const giaScelti = p.bozza.filter(s => s.startsWith('switch')).map(s => parseInt(s.split(' ')[1]));
    return candidatiCambio(p.r, slot, giaScelti);
}

function bersagliValidi(lato, tipoTarget, slot) {
    const avversario = avversarioDi(lato);
    const pkmIn = b => stato.campo[b.lato === 'mio' ? lato : avversario][b.slot];
    return bersagliScegliibili(tipoTarget, slot, b => { const x = pkmIn(b); return x && x.hp > 0; })
        .map(b => ({ ...b, pkm: pkmIn(b), se: b.lato === 'mio' && b.slot === slot }));
}

function sceltaMossa(lato, attivo, mossa) {
    const p = pannelli[lato];
    const eff = mossaEffettiva(attivo, mossa, p.potenziamento);
    const base = `move ${mossa.numero}`;
    const suffisso = p.potenziamento ? ` ${p.potenziamento}` : '';

    if (richiedeBersaglio(eff.target, p.r.attivi.length)) {
        const validi = bersagliValidi(lato, eff.target, attivo.slot);
        if (validi.length > 1) {
               p.attesaBersaglio = { base, suffisso, validi, nomeMossa: eff.nome, slot: attivo.slot };            return disegnaPannello(lato);
        }
        return scegliSlot(lato, `${base} ${validi[0].valore}${suffisso}`);
    }
    scegliSlot(lato, base + suffisso);
}


// -----------------------------------------------------
// Pannelli dei comandi
// -----------------------------------------------------
// Lati di cui questa pagina mostra i comandi
function latiConComandi() {
    if (online) return mioLato ? [mioLato] : [];
    return botAttivo('p2') ? ['p1'] : ['p1', 'p2'];
}

// Di quale lato i tooltip di Showdown conoscono le statistiche esatte
function latoTooltip() {
    return mioLato || 'p1';
}

function impostaPannelli() {
    const lati = latiConComandi();
    for (const l of ['p1', 'p2']) $(`comandi-${l}`).hidden = !lati.includes(l);
    $('striscia-spettatore').hidden = !(online && !mioLato);
    $('comandi').classList.toggle('doppio', lati.length === 2);
}

function ridisegnaComandi() {
    if (!pannelli) return;
    for (const l of latiConComandi()) disegnaPannello(l);
    aggiornaStati();
}

// Riga di stato: cosa sta facendo l'avversario (o i due giocatori, per chi guarda)
function aggiornaStati() {
    if (!online) return;
    // a campo che anima il testo resta quello di prima: aggiornarlo direbbe come è finito il turno
    if (animazioneInCorso() && online.stato !== 'lobby') return;
    if (!mioLato) {
        const testo = online.stato === 'lobby'
            ? `${nomeDi('p1')}: ${online.pronti.p1 ? 'ready ✓' : 'picking a team…'} · ${nomeDi('p2')}: ${online.pronti.p2 ? 'ready ✓' : 'picking a team…'}`
            : online.stato === 'in_corso' ? `You're watching live${battaglia && battaglia.set ? `, set ${battaglia.set}` : ''}.` : 'The match is over.';
        $('striscia-spettatore').textContent = testo;
        return;
    }
    const avv = nomeDi(avversarioDi(mioLato));
    let testo = '', scelto = false;
    if (online.stato === 'in_corso' && !finita) {
        const mio = pannelli[mioLato];
        scelto = !!(mio && mio.grezza && !mio.grezza.wait && online.sceltaAvversario && battaglia && online.sceltaAvversario === battaglia.passo);
        testo = scelto ? `${avv} has chosen ✓` : `${avv} is choosing…`;
    }
    const stato = $(`stato-${mioLato}`);
    stato.textContent = testo;
    stato.dataset.stato = testo ? (scelto ? 'scelto' : 'attesa') : '';   // giallo mentre sceglie, verde quando ha scelto
}

function disegnaPannello(lato) {
    if (!latiConComandi().includes(lato) || !pannelli) return;
    if (PS) PS.BattleTooltips.hideTooltip();
    const corpo = $(`corpo-${lato}`);
    corpo.replaceChildren();
    const p = pannelli[lato];
    const avv = nomeDi(avversarioDi(lato));

    if (online && online.stato === 'lobby') return corpo.append(messaggio('Pick your team above.'));
    // Finché il campo anima il pannello è sempre lo stesso, col tasto per saltare l'animazione, anche se è
    // l'ultimo turno del set o del match (senza una nuova richiesta, con "Set over" o "The match is over"
    // si capirebbe in anticipo che sta per finire)
    if (animazioneInCorso()) {
        return corpo.append(messaggio('The turn is playing out.',
            el('button', { type: 'button', class: 'btn secondario piccolo', onclick: () => scena && scena.battle.seekTurn(Infinity) }, 'Skip animation')));
    }
    if (online && online.stato && online.stato !== 'in_corso') return corpo.append(messaggio('The match is over.'));
    if (pausaSet) return corpo.append(messaggio('Set over. Get ready for the next one.'));
    if (p.errore) corpo.append(el('p', { class: 'errore', testo: p.errore }));
    if (finita) {
        return corpo.append(cpu
            ? messaggio(cpu.avviso ? `Battle over. ${cpu.avviso}` : 'Battle over.', el('div', { class: 'riga-azioni centrata azioni-cpu' }, azioniCpu()))
            : messaggio(online ? 'Set over. The next one starts by itself.' : 'Battle over.'));
    }
    if (!p.r || p.r.tipo === 'attesa') return corpo.append(messaggio(`Waiting for ${avv}…`));
    if (p.inviata) {
        return corpo.append(messaggio(`Choice sent. Waiting for ${avv}…`, puoAnnullare(lato) ? bottoneAnnulla(lato) : null));
    }
    if (scenaInCorsa()) return corpo.append(messaggio('The next set is about to start.'));

    if (p.r.tipo === 'anteprima') return disegnaAnteprima(lato, corpo);
    if (p.attesaBersaglio) return disegnaBersagli(lato, corpo);
    if (p.r.tipo === 'cambio') return disegnaCambio(lato, corpo);
    disegnaMosse(lato, corpo);
}

function messaggio(testo, ...extra) {
    return el('div', { class: 'messaggio' }, el('span', { testo }), ...extra);
}

// Attributi per i tooltip di Showdown (solo per il lato che i tooltip conoscono)
function tooltip(lato, codice) {
    return scena && lato === latoTooltip() ? { 'data-tooltip': codice } : {};
}
// Classe + attributi: "has-tooltip" solo se il tooltip c'è davvero
function conTooltip(lato, codice, classe) {
    const t = tooltip(lato, codice);
    return { class: classe + (t['data-tooltip'] ? ' has-tooltip' : ''), ...t };
}

// Anteprima: si scelgono i Pokémon cliccando le loro GIF, nell'ordine in cui scendono in campo
function disegnaAnteprima(lato, corpo) {
    const p = pannelli[lato];
    const { squadra, daScegliere } = p.r;
    const inCampo = /doubles|vgc/i.test(config.formato) ? 2 : 1;
    const apripista = inCampo === 1 ? 'The first one leads.' : `The first ${inCampo} lead.`;

    corpo.append(el('div', { class: 'testa-scelta' },
        el('p', { class: 'domanda', testo: `Pick ${daScegliere} Pokémon in order. ${apripista}` }),
        el('div', { class: 'riga-azioni' },
            el('button', { type: 'button', class: 'btn secondario', disabled: !p.ordine.length, onclick: () => { p.ordine = []; disegnaPannello(lato); } }, 'Clear'),
            el('button', {
                type: 'button', class: 'btn primario', disabled: p.ordine.length !== daScegliere,
                onclick: () => invia(lato, 'team ' + p.ordine.join(''))
            }, 'Lock in team'))));

    corpo.append(el('div', { class: 'anteprima-griglia' }, squadra.map(pkm => {
        const pos = p.ordine.indexOf(pkm.indice);
        const pieno = pos < 0 && p.ordine.length >= daScegliere;
        return el('button', {
            type: 'button',
            ...conTooltip(lato, `switchpokemon|${pkm.indice - 1}`, 'tessera' + (pos >= 0 ? ' scelta' : '') + (pieno ? ' spenta' : '')),
            'aria-pressed': pos >= 0 ? 'true' : 'false',
            'aria-label': pos >= 0 ? `${pkm.nome}, pick ${pos + 1}` : pkm.nome,
            onclick: () => {
                if (pos >= 0) p.ordine.splice(pos, 1);
                else if (!pieno) p.ordine.push(pkm.indice);
                disegnaPannello(lato);
            }
        },
        pos >= 0 ? el('span', { class: 'tessera-numero', testo: String(pos + 1) }) : null,
        pos >= 0 && pos < inCampo ? el('span', { class: 'tessera-lead', testo: 'Lead' }) : null,
        el('span', { class: 'tessera-sprite' }, sprite(pkm.nome, false)),
        );
    })));
}

function disegnaMosse(lato, corpo) {
    const p = pannelli[lato];
    const attivo = p.r.attivi[p.bozza.length];
    const doppio = p.r.attivi.length > 1;

    corpo.append(el('div', { class: 'testa-scelta' },
        el('p', { class: 'domanda' },
            `What will ${attivo.pokemon.nome} do?`,
            doppio ? el('small', { testo: ` ${p.bozza.length + 1} of ${p.r.attivi.length}` }) : null),
        // Sempre nel layout, anche quando non c'è nulla da annullare: se comparisse solo dopo
        // la prima mossa di un doppio, la riga si alzerebbe e il testo "What will … do?" scenderebbe un poco
        el('button', {
            type: 'button',
            class: 'btn secondario piccolo' + (p.bozza.some(s => s !== 'pass') ? '' : ' nascosto'),
            onclick: () => ricomincia(lato)
        }, 'Undo this turn')));

    corpo.append(el('div', { class: 'mosse' }, attivo.mosse.map(m => {
        const eff = mossaEffettiva(attivo, m, p.potenziamento);
        const nome = eff ? eff.nome : m.nome;
        const tipo = DexSim.moves.get(nome).type || '???';
        const massima = (p.potenziamento === 'dynamax' || attivo.dinamizzato) && m.max;
        const gmax = massima && /^G-Max/.test(nome) ? `|${nome.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
        const codice = !eff ? `move|${m.nome}|${attivo.slot}`
            : p.potenziamento === 'zmove' ? `zmove|${m.nome}|${attivo.slot}`
            : massima ? `maxmove|${m.nome}|${attivo.slot}${gmax}`
            : `move|${m.nome}|${attivo.slot}`;
        const spenta = !eff || m.disabilitata || m.pp === 0;
        return el('button', {
            type: 'button',
            ...conTooltip(lato, codice, `mossa t-${tipo.toLowerCase()}` + (spenta ? ' spenta' : '')),
            'aria-disabled': spenta ? 'true' : 'false',
            onclick: () => { if (!spenta) sceltaMossa(lato, attivo, m); }
        },
        el('span', { class: 'mossa-nome', testo: nome }),
        el('span', { class: 'mossa-info' },
            el('span', { testo: tipo }),
            el('span', { testo: m.ppMax ? `${m.pp}/${m.ppMax}` : '—' })));
    })));

    const potenziamenti = attivo.potenziamenti.filter(x => !p.usati.includes(x.tipo));
    const squadra = p.r.squadra.filter(x => !x.attivo);
    const liberi = attivo.bloccato ? [] : candidati(lato, attivo.slot).map(x => x.indice);

    const piede = el('div', { class: 'piede-mosse' });
    if (potenziamenti.length) {
        piede.append(el('div', { class: 'meccaniche' }, potenziamenti.map(x => el('button', {
            type: 'button',
            class: 'btn meccanica' + (p.potenziamento === x.tipo ? ' attivo' : ''),
            'aria-pressed': p.potenziamento === x.tipo ? 'true' : 'false',
            onclick: () => { p.potenziamento = p.potenziamento === x.tipo ? null : x.tipo; disegnaPannello(lato); }
        }, x.etichetta))));
    }
    if (squadra.length) {
        piede.append(el('div', { class: 'cambi' },
            el('span', { class: 'etichetta', testo: attivo.bloccato ? "Trapped: can't switch" : 'Switch' }),
            squadra.map(pkm => bottonePokemon({
                specie: pkm.nome,
                condizione: pkm.condizione,
                spento: !liberi.includes(pkm.indice),
                attrTooltip: tooltip(lato, `switchpokemon|${pkm.indice - 1}`),
                compatto: true,
                onclick: () => scegliSlot(lato, `switch ${pkm.indice}`)
            }))));
    }
    if (piede.childNodes.length) corpo.append(piede);
}

function disegnaBersagli(lato, corpo) {
    const p = pannelli[lato];
    const { base, suffisso, validi, nomeMossa, slot } = p.attesaBersaglio;
    const lato2 = avversarioDi(lato);

    // Come sul campo: gli avversari (specchiati) e i tuoi, due gruppi sulla stessa riga.
    // I bersagli veri sono gli avversari, grandi; il compagno (o te stesso) è piccolo e grigio: colpirlo per sbaglio costa caro
    const gruppo = (nome, chi, lista) => el('div', { class: 'bersagli-gruppo' + (chi === 0 ? ' alleati' : '') },
        el('p', { class: 'etichetta', testo: nome }),
        el('div', { class: 'bersagli-riga' }, lista.map(b => bottonePokemon({
            specie: b.pkm ? b.pkm.specie : '',
            nome: b.pkm ? b.pkm.nome : 'Empty spot',
            condizione: b.pkm ? `${b.pkm.hp}/${b.pkm.hpMax}${b.pkm.stato ? ' ' + b.pkm.stato : ''}` : '',
            nota: b.se ? 'you' : null,
            efficacia: chi === 1 ? efficaciaSu(lato, slot, nomeMossa, b) : null,
            attrTooltip: b.pkm ? tooltip(lato, `activepokemon|${chi}|${b.slot}`) : {},
            grande: chi === 1,
            alleato: chi === 0,
            onclick: () => scegliSlot(lato, `${base} ${b.valore}${suffisso}`)
        }))));
    const avversari = validi.filter(b => b.lato === 'avversario').sort((a, b) => b.slot - a.slot);
    const miei = validi.filter(b => b.lato === 'mio').sort((a, b) => a.slot - b.slot);

    corpo.append(el('div', { class: 'testa-scelta' },
        el('p', { class: 'domanda', testo: `${nomeMossa}: pick a target` }),
        el('button', { type: 'button', class: 'btn secondario piccolo', onclick: () => { p.attesaBersaglio = null; disegnaPannello(lato); } }, 'Back')));
    corpo.append(el('div', { class: 'bersagli' },
        avversari.length ? gruppo(nomeDi(lato2), 1, avversari) : null,
        miei.length ? gruppo(nomeDi(lato), 0, miei) : null));
}

function disegnaCambio(lato, corpo) {
    const p = pannelli[lato];
    const slot = p.bozza.length;
    const rianima = p.r.squadra[slot] && p.r.squadra[slot].rianima;
    const uscente = stato.campo[lato][slot];
    const liberi = candidati(lato, slot).map(x => x.indice);

    corpo.append(el('div', { class: 'testa-scelta' },
        el('p', { class: 'domanda', testo: rianima ? 'Pick a Pokémon to revive' : `Who replaces ${uscente ? uscente.nome : 'this Pokémon'}?` })));
    corpo.append(el('div', { class: 'cambi grandi' }, p.r.squadra.filter(x => !x.attivo || rianima).map(pkm => bottonePokemon({
        specie: pkm.nome,
        condizione: pkm.condizione,
        spento: !liberi.includes(pkm.indice),
        attrTooltip: tooltip(lato, `switchpokemon|${pkm.indice - 1}`),
        grande: true,
        onclick: () => scegliSlot(lato, `switch ${pkm.indice}`)
    }))));
}

// Bottone con icona, nome, salute e stato (cambi e bersagli).
// "compatto": solo icona e barra della salute (il nome sta nel tooltip e nell'etichetta per i lettori di schermo)
function bottonePokemon({ specie, nome, condizione, spento, attrTooltip = {}, nota, efficacia, grande, compatto, alleato, onclick }) {
    const c = leggiCondizione(condizione);
    const chiamato = nome || specie;
    const barra = classe => el('span', { class: classe, role: 'img', 'aria-label': `${c.pct}% HP` },
        el('span', { class: 'hp-' + (c.pct > 50 ? 'g' : c.pct > 20 ? 'y' : 'r'), style: `width:${c.pct}%` }));
    return el('button', {
        type: 'button',
        class: 'btn-pkm' + (attrTooltip['data-tooltip'] ? ' has-tooltip' : '') + (spento ? ' spento' : '') + (grande ? ' grande' : '') + (compatto ? ' compatto' : '') + (alleato ? ' alleato' : ''),
        'aria-disabled': spento ? 'true' : 'false',
        title: compatto && !attrTooltip['data-tooltip'] ? chiamato : null,
        'aria-label': compatto ? chiamato : null,
        ...attrTooltip,
        onclick: () => { if (!spento) onclick(); }
    },
    specie ? icona(specie) : null,
    compatto
        ? (c.ko ? el('span', { class: 'btn-pkm-ko', testo: 'KO' }) : condizione ? barra('btn-pkm-hp') : null)
        : el('span', { class: 'btn-pkm-testo' },
            el('span', { class: 'btn-pkm-nome', testo: chiamato }),
            c.ko ? el('span', { class: 'btn-pkm-ko', testo: 'Fainted' }) : condizione ? barra('btn-pkm-hp') : null),
    c.stato ? el('span', { class: `tag-stato ${c.stato}`, testo: c.stato.toUpperCase() }) : null,
    nota ? el('span', { class: 'btn-pkm-nota', testo: nota }) : null,
    efficacia ? el('span', { class: `eff ${efficacia.classe}`, testo: `${efficacia.segno} ${efficacia.testo}` }) : null);
}

// "123/175 par" -> { pct: 70, stato: 'par' }; "0 fnt" -> { ko: true }
function leggiCondizione(condizione) {
    if (!condizione) return { pct: 100, stato: '' };
    if (condizione.endsWith(' fnt') || condizione === '0') return { ko: true, pct: 0, stato: '' };
    const [hp, st = ''] = condizione.split(' ');
    const [a, b] = hp.split('/').map(Number);
    return { pct: b ? Math.max(1, Math.round(a / b * 100)) : 100, stato: st };
}


// -----------------------------------------------------
// Grafica: icone, sprite, intestazione, messaggi sul campo
// -----------------------------------------------------
function icona(specie) {
    return el('span', { class: 'picon', style: PS ? PS.Dex.getPokemonIcon(specie) : '', 'aria-hidden': 'true' });
}

function sprite(specie, retro) {
    const id = DexSim.species.get(specie).spriteid || specie.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const img = el('img', {
        alt: '',
        src: `https://play.pokemonshowdown.com/sprites/${retro ? 'ani-back' : 'ani'}/${id}.gif`
    });
    img.addEventListener('error', () => {
        img.src = `https://play.pokemonshowdown.com/sprites/${retro ? 'gen5-back' : 'gen5'}/${id}.png`;
    }, { once: true });
    return img;
}

// Quello che l'insegna sa del match: numero del set e punteggio. Si aggiorna solo a campo fermo, altrimenti
// il tabellone anticiperebbe come è finito il set che si sta ancora guardando.
let vistoInsegna = { set: 0, risultati: {} };
function aggiornaVistoInsegna() {
    if (!online || animazioneInCorso()) return;
    vistoInsegna = { set: battaglia ? battaglia.set : 0, risultati: online.risultati || {} };
}

// Insegna sopra lo schermo: formato, match e tabellone dei set (stile in style-battle.css)
function disegnaInfo() {
    if (!config) return;
    aggiornaVistoInsegna();
    const voci = [el('span', { class: 'ins-formato', testo: config.etichetta, title: config.etichetta })];
    if (online) {
        voci.push(el('span', { class: 'ins-match' }, 'Match ', el('b', { testo: `${online.info.match}/${MATCH_PER_SHOWDOWN}` })));
        if (vistoInsegna.set) {
            const { s1, s2 } = punteggio(vistoInsegna.risultati);
            const punti = { p1: s1, p2: s2 };
            // chi gioca sta a sinistra, come nelle colonne e nello schermo
            const [sx, dx] = mioLato === 'p2' ? ['p2', 'p1'] : ['p1', 'p2'];
            const cella = lato => el('b', { class: `ins-punti ${lato}`, testo: String(punti[lato]), title: nomeDi(lato) });
            voci.push(el('span', {
                class: 'ins-tabellone', role: 'img',
                'aria-label': `Set ${vistoInsegna.set} of ${online.info.bestOf}. ${nomeDi(sx)} ${punti[sx]}, ${nomeDi(dx)} ${punti[dx]}`
            },
            cella(sx),
            el('span', { class: 'ins-set', testo: `Set ${vistoInsegna.set}/${online.info.bestOf}` }),
            cella(dx)));
        }
    }
    $('info-turno').replaceChildren(...voci);
}

   // -----------------------------------------------------
   // Colonne dei player, tooltip ed efficacia (battle-extra.js)
   // -----------------------------------------------------
   // In locale e in prova i due team sono sullo stesso schermo: si vedono entrambi
   function schedeLocali() {
       const lato = l => ({
           nome: config[l].nome,
                      avatar: config[l].avatar || '',
           candidati: [{ nome: config[l].nomeTeam || 'Test team', set: setDaTeam(config[l].team || '') }]
       });
       impostaPartita({ openSheet: true, latiNoti: ['p1', 'p2'], p1: lato('p1'), p2: lato('p2') });
   }

   // Online: il mio team sempre; quello dell'avversario solo in una stagione open sheet.
   // Senza open sheet passano solo le specie, che il team preview mostra comunque:
   // servono a riconoscere quale team ha scelto, per scriverne il nome.
   function schedeOnline() {
       const d = online.datiMatch;
       if (!d) return;
       const lato = l => {
           const vedo = d.openSheet || l === mioLato;
           return {
               nome: d.giocatori[l].nome,
                              avatar: d.giocatori[l].avatar || '',
               candidati: d.giocatori[l].teams.map(t => {
                   const sets = setDaTeam(t.testo);
                   return { nome: t.nome, set: vedo ? sets : sets.map(x => ({ species: x.species, name: x.name })) };
               })
           };
       };
       impostaPartita({ openSheet: !!d.openSheet, latiNoti: mioLato ? [mioLato] : [], p1: lato('p1'), p2: lato('p2') });
   }

   // Cartellino sul bottone del bersaglio: superefficace, poco efficace, nessun effetto
   function efficaciaSu(lato, slot, nomeMossa, b) {
       if (!scena || !b.pkm) return null;
       const battle = scena.battle;
       return efficaciaBersaglio(battle, nomeMossa, battle[lato].active[slot], battle[avversarioDi(lato)].active[b.slot]);
   }

   function impostaNomeGiocatore(lato, nome) {
       $(`nome-${lato}`).textContent = nome;
       $(`titolo-${lato}`).textContent = nome;
       impostaPartita({ [lato]: { nome } });
   }

function mostraMessaggioCampo(testo) {
    $('testo-palco').textContent = testo;
    $('messaggio-palco').hidden = false;
}
function nascondiMessaggio() {
    $('messaggio-palco').hidden = true;
}

function mostraEsito(titolo, { sotto = '', azioni = [] } = {}) {
    $('testo-vittoria').textContent = titolo;
    $('sotto-vittoria').textContent = sotto;
    $('sotto-vittoria').hidden = !sotto;
    $('azioni-vittoria').replaceChildren(...azioni);
    $('azioni-vittoria').hidden = !azioni.length;
    $('vittoria').hidden = false;
}
function nascondiEsito() {
    $('vittoria').hidden = true;
}


// -----------------------------------------------------
// Audio: segue la stessa preferenza del bottone volume del sito
// -----------------------------------------------------
function audioSpento() {
    try { return localStorage.getItem('userMusicPref') === 'off'; } catch { return false; }
}

function preparaAudio() {
    const btn = $('btn-audio');
    const aggiorna = () => {
        const spento = audioSpento();
        btn.classList.toggle('muted', spento);
        btn.setAttribute('aria-pressed', spento ? 'false' : 'true');
        btn.title = spento ? 'Sound off' : 'Sound on';
        if (scena) scena.battle.setMute(spento);
    };
    btn.addEventListener('click', () => {
        try { localStorage.setItem('userMusicPref', audioSpento() ? 'on' : 'off'); } catch {}
        aggiorna();
    });
    aggiorna();
    // Il browser blocca la musica finché non si interagisce con la pagina: al primo clic la si riavvia
    document.addEventListener('pointerdown', () => {
        if (PS && !audioSpento()) { PS.BattleSound.setMute(true); PS.BattleSound.setMute(false); }
    }, { once: true });
}


// -----------------------------------------------------
// Utilità DOM
// -----------------------------------------------------
function el(tag, attributi = {}, ...figli) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attributi)) {
        if (v === false || v == null) continue;
        if (k === 'class') e.className = v;
        else if (k === 'testo') e.textContent = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
    }
    figli.flat().forEach(f => { if (f != null) e.append(f); });
    return e;
}
