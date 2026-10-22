'use strict';
// =====================================================
// PARTITA ONLINE — logica del server
// Usa il pacchetto ufficiale "pokemon-showdown" (Smogon, Zarel):
// lo stesso codice che gira su play.pokemonshowdown.com.
//
// Idea di fondo: il server non tiene la battaglia in memoria.
// Salva seed, team e l'elenco delle scelte già giocate, e a ogni
// passo ricostruisce la battaglia da capo. Il simulatore è
// deterministico, quindi il risultato è sempre identico.
// =====================================================

const crypto = require('crypto');
const PS = require('pokemon-showdown');
const { creaReplayHtml } = require('./replay-sito');
const { analizzaSet } = require('./statistiche-set');
const { nomiUnici } = require('./nomi-unici');
const { ritiraScelta } = require('./ritira-scelta');
const EsitoSet = require('./esito-set');
const DatiGen = require('./dati-gen');
const ControlloTeam = require('./controllo-team');
const FormatoRandom = require('./formato-random');
const fs = require('fs');
const path = require('path');

class ErroreUtente extends Error {}


// -----------------------------------------------------
// 1. REGOLE DEL SITO (le stesse di team-sito.js)
// -----------------------------------------------------
function generazioneFormato(reg) {
    return parseInt(reg.genRuleValue, 10) ||
        parseInt(String(reg.vgcGen || '').replace(/\D/g, ''), 10) || 9;
}

function livelloFormato(reg) {
    const struttura = String(reg.strutturaSito || 'custom').toLowerCase().trim();
    if (struttura === 'vgc') return 50;
    return String(reg.baseTier || '').toUpperCase() === 'LC' ? 5 : 100;
}

function meccanicheAttive(reg) {
    return reg.generationalMechanics === true;
}

function formatoSimulatore(reg) {
    if (FormatoRandom.eRandom(reg)) return FormatoRandom.idSimulatore(reg);   // il Random Battle di Showdown, com'è
    if (reg.formatoSimulatore) return reg.formatoSimulatore;
    const struttura = String(reg.strutturaSito || 'custom').toLowerCase().trim();
    const gen = generazioneFormato(reg);
    let doppio = struttura === 'vgc'
        ? !String(reg.vgcFormat || 'doubles').toLowerCase().startsWith('singles')
        : reg.battleStyle === 'doubles';
    if (gen < 3) doppio = false;

    // "Scegli 4 su 6" richiede l'anteprima squadre: dalla quinta generazione c'è già, prima va chiesta a parte.
    // "HP Percentage Mod" nelle prime tre generazioni è già nel formato (aggiungerlo di nuovo dà errore).
    const regole = [];
    if (gen < 5) regole.push('Team Preview');
    regole.push('Picked Team Size = 4');
    if (gen >= 4) regole.push('HP Percentage Mod');
    if (struttura === 'custom') regole.push('Sleep Clause Mod', 'Endless Battle Clause');
    if (!meccanicheAttive(reg)) {
        if (gen === 8) regole.push('Dynamax Clause');
        if (gen === 9) regole.push('Terastal Clause');
    }
    return `gen${gen}${doppio ? 'doubles' : ''}customgame@@@${regole.join(',')}`;
}

// Modalità libera delle partite amichevoli: ognuno porta un suo team di qualunque formato, tutti a livello 50. Si gioca nella generazione
// più recente tra i due team, con le regole di sempre (anteprima, 4 su 6, clausole standard) e senza vietare le meccaniche di generazione.
const LIVELLO_LIBERO = 50;
function formatoLibero(gen, doppio) {
    if (gen < 3) doppio = false;   // il doppio esiste dalla Gen 3
    const regole = [];
    if (gen < 5) regole.push('Team Preview');
    regole.push('Picked Team Size = 4');
    if (gen >= 4) regole.push('HP Percentage Mod');
    regole.push('Sleep Clause Mod', 'Endless Battle Clause');
    return `gen${gen}${doppio ? 'doubles' : ''}customgame@@@${regole.join(',')}`;
}

function trovaRegolamento(regolamenti, categoria) {
    return Object.values(regolamenti || {}).find(r =>
        r && r.categoria && String(r.categoria).toLowerCase() === String(categoria).toLowerCase()) || null;
}

function nomeTeam(t) {
    if (!t) return '';
    return typeof t.nome === 'object' && t.nome ? (t.nome.valore || '') : (t.nome || '');
}

// Team senza testo originale (salvati prima degli aggiornamenti del Box)
function testoShowdownDaTeam(team, livello) {
    if (team.testoShowdown && String(team.testoShowdown).trim()) return String(team.testoShowdown).trim();
    const lista = Array.isArray(team.pokemon) ? team.pokemon : Object.values(team.pokemon || {});
    return lista.filter(p => p && p.nome).map(p => {
        const righe = [];
        const strumento = String(p.strumento || '').trim();
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
        (p.mosse || []).filter(m => m && String(m).trim() && m !== '-').forEach(m => righe.push(`- ${String(m).trim()}`));
        return righe.join('\n');
    }).join('\n\n');
}


// -----------------------------------------------------
// 2. TEAM: IMPORTAZIONE E CONTROLLI
// -----------------------------------------------------
// Teams.import ufficiale non legge la riga "Dynamax Level": la leggiamo noi.
// I soprannomi doppi (Calyrex-Ice e Calyrex-Shadow, entrambi "Calyrex") si distinguono: vedi nomi-unici.js
function importaTeam(testo) {
    const sets = nomiUnici(PS.Teams.import(testo) || [], specie => PS.Dex.species.get(specie).baseSpecies);
    const blocchi = String(testo).trim().split(/\n\s*\n/)
        .map(b => b.split('\n').map(r => r.trim()).filter(Boolean))
        .filter(righe => righe.length >= 2);
    blocchi.forEach((righe, i) => {
        const riga = righe.find(r => /^Dynamax Level:/i.test(r));
        if (riga && sets[i]) sets[i].dynamaxLevel = Math.max(0, Math.min(10, parseInt(riga.split(':')[1], 10) || 10));
    });
    return sets;
}

// I dati per generazione (functions/pkm-gens/, gli stessi del Box): le abilità delle specie di allora, i tipi...
const deltaDi = gen => DatiGen.carica(gen, url => JSON.parse(fs.readFileSync(path.join(__dirname, url), 'utf8'))).catch(() => null);

// Il server non corregge i team: se non sono conformi, non si gioca.
// Il controllo è lo STESSO del Box e del simulatore sul sito (controllo-team.js): un team che il Box salva non viene rifiutato qui.
async function controllaTeam(testo, reg) {
    const sets = importaTeam(testo);
    if (!sets.length) return ['Il team è vuoto o illeggibile'];
    const gen = generazioneFormato(reg);
    const regole = {
        gen, livello: livelloFormato(reg), meccaniche: meccanicheAttive(reg),
        controllaSpecie: String(reg.strutturaSito || 'custom').toLowerCase().trim() !== 'anything_goes',
        delta: await deltaDi(gen)
    };
    return ControlloTeam.problemiDeiSetShowdown(sets, regole, PS.Dex);
}


// -----------------------------------------------------
// 3. BATTAGLIA
// -----------------------------------------------------
function creaBattaglia(stato, teams, send) {
    const b = new PS.Battle({ formatid: stato.formato, seed: stato.seed, send });
    b.setPlayer('p1', { name: stato.nomi.p1, team: teams.p1 });
    b.setPlayer('p2', { name: stato.nomi.p2, team: teams.p2 });
    for (const passo of (stato.scelte || [])) {
        if (!b.choose(passo.l, passo.s)) throw new Error(`Scelta non riproducibile: ${passo.l} ${passo.s}`);
    }
    return b;
}

// Un team dei formati Random: lo compone il generatore di Showdown (lo stesso del Random Battle ufficiale), impacchettato come gli altri
function generaTeamRandom(formato) {
    return PS.Teams.pack(PS.Teams.generate(formato, { seed: PS.PRNG.generateSeed() }));
}

// Righe che può vedere chiunque. Le "custom game" di Showdown mostrano la
// salute esatta anche all'avversario e aggiungono righe di debug: qui si
// riportano alla forma dei formati ufficiali (salute in percentuale).
function righePubbliche(log) {
    const out = [];
    for (let i = 0; i < log.length; i++) {
        const riga = log[i];
        if (riga.startsWith('|split|')) {
            out.push(inPercentuale(log[i + 2]));   // [i+1] = versione segreta, [i+2] = versione pubblica
            i += 2;
            continue;
        }
        if (riga.startsWith('|debug|')) continue;
        out.push(riga);
    }
    // i pareggi non esistono: "|tie" diventa la vittoria di chi è caduto per ultimo (esito-set.js)
    return EsitoSet.risolviPareggio(out);
}

function inPercentuale(riga) {
    return riga.split('|').map(campo => {
        const m = campo.match(/^(\d+)\/(\d+)((?: \w+)?)$/);
        if (!m) return campo;
        const [, hp, max, resto] = m;
        let pct = Math.ceil(100 * Number(hp) / Number(max));
        if (pct === 100 && Number(hp) < Number(max)) pct = 99;
        return `${pct}/100${resto}`;
    }).join('|');
}

// Chiave che identifica il momento in cui un giocatore deve scegliere
function chiavePasso(stato) {
    return `${stato.set}:${(stato.scelte || []).length}`;
}

function latiCheDevonoScegliere(b) {
    return ['p1', 'p2'].filter(l => {
        const r = b[l].activeRequest;
        return r && !r.wait && !b.ended;
    });
}


// -----------------------------------------------------
// 4. REPLAY
// -----------------------------------------------------
// Il file del replay ha l'estetica del simulatore del sito: lo costruisce
// creaReplayHtml() di replay-sito.js (motore grafico di Showdown, schermo nostro).


// -----------------------------------------------------
// 5. CIFRATURA DELLE SCELTE IN ATTESA
// -----------------------------------------------------
// La scelta di chi ha già deciso resta cifrata finché l'avversario non sceglie.
function creaCifratura(segreto) {
    const chiave = crypto.createHash('sha256').update(String(segreto || '')).digest();
    return {
        cifra(testo) {
            const iv = crypto.randomBytes(12);
            const c = crypto.createCipheriv('aes-256-gcm', chiave, iv);
            const dati = Buffer.concat([c.update(testo, 'utf8'), c.final()]);
            return [iv, c.getAuthTag(), dati].map(x => x.toString('base64')).join('.');
        },
        decifra(pacchetto) {
            const [iv, tag, dati] = pacchetto.split('.').map(x => Buffer.from(x, 'base64'));
            const d = crypto.createDecipheriv('aes-256-gcm', chiave, iv);
            d.setAuthTag(tag);
            return Buffer.concat([d.update(dati), d.final()]).toString('utf8');
        }
    };
}


// -----------------------------------------------------
// 6. SERVIZIO
// -----------------------------------------------------
const PERCORSO_SFIDE = 'sfide/amichevoli';                    // le sfide amichevoli (una "stagione" che non è una stagione)
const idPartitaAmichevole = idSfida => `amichevole__${idSfida}`;
const DURATA_SFIDA = 24 * 3600 * 1000;                        // una sfida senza risposta scade dopo un giorno
const DURATA_DATI = 6 * 3600 * 1000;                          // sfide e partite finite restano 6 ore: il tempo di vedere l'esito
const MASSIMO_SFIDE_IN_ATTESA = 5;                            // per chi sfida
const SERIE_AMMESSE = [1, 3, 5, 7];                           // una partita sola, o al meglio dei 3, 5 o 7 set
const serieDi = n => (SERIE_AMMESSE.includes(Number(n)) ? Number(n) : 1);
const vittorieNecessarie = serie => Math.floor(serie / 2) + 1;

// db: database Admin; salvaReplay(percorso, html) -> url;
// registraRisultato(r) -> registraRisultatoMatch di risultati-match.js
// sito: indirizzo del sito, per gli avatar salvati con un percorso relativo
function creaServizio({ db, salvaReplay, registraRisultato, segreto, sito = '', ora = () => Date.now() }) {
    const { cifra, decifra } = creaCifratura(segreto);
    const leggi = async percorso => (await db.ref(percorso).once('value')).val();

    function latoDi(info, uid) {
        if (uid && info.p1 && uid === info.p1.uid) return 'p1';
        if (uid && info.p2 && uid === info.p2.uid) return 'p2';
        return null;
    }

    async function teamIscritti(info, lato) {
        const g = info[lato];
        const [iscritti, box] = await Promise.all([
            leggi(`seasons/${info.stagione}/teams_iscritti/${info.categoria}/${g.id}/datiTeams`),
            leggi(`players/${g.id}/teams`)
        ]);
        const dalBox = Object.values(box || {});
        return Object.values(iscritti || {}).map(t => {
            const nome = nomeTeam(t);
            const b = dalBox.find(x => nomeTeam(x).toLowerCase() === nome.toLowerCase());
            const sorgente = t && t.pokemon ? t : (b || {});
            const testoSalvato = (t && t.testoShowdown) || (b && b.testoShowdown) || '';
            return { nome, testo: testoShowdownDaTeam({ ...sorgente, testoShowdown: testoSalvato }, info.livello) };
        }).filter(t => t.nome && t.testo);
    }

    // --- apertura (crea la partita la prima volta) ---
    async function apriPartita(uid, parametri = {}) {
        if (parametri.amichevole) return apriAmichevole(uid, parametri.amichevole);
        const { stagione, showdown, match } = parametri;
        const valido = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x);
        if (!valido(stagione) || !valido(showdown) || !['1', '2', '3'].includes(String(match))) {
            throw new ErroreUtente('Parametri della partita non validi');
        }
        const id = `${stagione}__${showdown}__m${match}`;
        let info = await leggi(`partite/${id}/info`);

        if (!info) {
            const sd = await leggi(`seasons/${stagione}/showdowns/${showdown}/info`);
            if (!sd) throw new ErroreUtente('Showdown non trovato');
            const [stag, regolamenti, utenti] = await Promise.all([
                leggi(`seasons/${stagione}/info`), leggi('regolamenti'), leggi('users')
            ]);
            const reg = trovaRegolamento(regolamenti, sd.categoria);
            if (!reg) throw new ErroreUtente(`Regolamento "${sd.categoria}" non trovato`);

            const uidDi = nome => Object.keys(utenti || {}).find(u =>
                String(utenti[u]?.name || '').toLowerCase().trim() === String(nome).toLowerCase().trim()) || '';
            const giocatore = nome => ({ nome, id: String(nome).toLowerCase().trim(), uid: uidDi(nome) });

            const nuovo = {
                stagione, showdown, match: Number(match),
                categoria: sd.categoria,
                formato: formatoSimulatore(reg),
                livello: livelloFormato(reg),
                bestOf: parseInt(stag?.best_of, 10) === 5 ? 5 : 3,
                data: sd.data || new Date(ora()).toISOString().slice(0, 10),
                p1: giocatore(sd.player1),
                p2: giocatore(sd.player2),
                creata: ora()
            };
            // formato Random (nelle stagioni come nelle amichevoli): nessun team da portare, a ogni set due team nuovi di Showdown
            if (FormatoRandom.eRandom(reg)) nuovo.random = true;
            const esito = await db.ref(`partite/${id}/info`).transaction(cur => cur || nuovo);
            info = esito.snapshot.val();
            await db.ref(`partite/${id}/stato`).transaction(cur => cur || 'lobby');
        }

        const matchSalvato = await leggi(`seasons/${stagione}/showdowns/${showdown}/matches/match${match}`);
        return { id, lato: latoDi(info, uid), info, giaSalvato: !!(matchSalvato && matchSalvato.score) };
    }

    // --- scelta del team e "pronto" ---
    async function pronto(uid, parametri = {}) {
        const { id, team } = parametri;
        const info = await leggi(`partite/${id}/info`);
        if (!info) throw new ErroreUtente('Partita inesistente');
        const lato = latoDi(info, uid);
        if (!lato) throw new ErroreUtente('Non sei uno dei due giocatori di questo match');
        const statoPrima = await leggi(`partite/${id}/stato`);
        // nelle amichevoli con team cambiabili i team si scelgono anche tra un set e l'altro
        if (statoPrima !== 'lobby' && !(info.amichevole && statoPrima === 'tra_set')) throw new ErroreUtente('Il match è già iniziato');
        // un formato Random non ha team da iscrivere (li dà Showdown, nuovi a ogni set); le amichevoli portano i team dal Box
        if (info.amichevole || info.random) return prontoLobby(parametri, info, lato, statoPrima);

        if (!team) {   // annulla il "pronto"
            await db.ref(`partite/${id}/pronti/${lato}`).set(false);
            return { ok: true };
        }

        const reg = trovaRegolamento(await leggi('regolamenti'), info.categoria);
        const scelto = (await teamIscritti(info, lato)).find(t => t.nome === team);
        if (!scelto) throw new ErroreUtente(`Il team "${team}" non è tra i tuoi iscritti in ${info.categoria}`);
        const problemi = await controllaTeam(scelto.testo, reg);
        if (problemi.length) throw new ErroreUtente(`Team non conforme: ${problemi.join('; ')}`);

        await db.ref(`partiteServer/${id}/team/${lato}`).set({
            nome: scelto.nome,
            testo: scelto.testo,
            packed: PS.Teams.pack(importaTeam(scelto.testo))
        });
        await db.ref(`partite/${id}/pronti/${lato}`).set(true);

        const pronti = await leggi(`partite/${id}/pronti`) || {};
        if (pronti.p1 && pronti.p2) {
            const esito = await db.ref(`partite/${id}/stato`).transaction(cur =>
                cur === null ? null : (cur === 'lobby' ? 'in_corso' : undefined));
            if (esito.committed && esito.snapshot.val() === 'in_corso') {
                const t = await leggi(`partiteServer/${id}/team`);
                await db.ref(`partite/${id}/team`).set({ p1: t.p1.nome, p2: t.p2.nome });
                await avviaSet(id, info, 1);
            }
        }
        return { ok: true };
    }

    // --- avvio di un set ---
    async function avviaSet(id, info, n) {
        let teams;
        if (info.random) {
            // formato Random: a ogni set due team nuovi, composti da Showdown e tenuti solo sul server (nessuno li vede prima)
            teams = { p1: generaTeamRandom(info.formato), p2: generaTeamRandom(info.formato) };
            await db.ref(`partiteServer/${id}/team`).set({ p1: { packed: teams.p1 }, p2: { packed: teams.p2 } });
        } else {
            const t = await leggi(`partiteServer/${id}/team`);
            teams = { p1: t.p1.packed, p2: t.p2.packed };
        }
        const stato = {
            set: n,
            formato: info.formato,
            seed: PS.PRNG.generateSeed(),
            nomi: { p1: info.p1.nome, p2: info.p2.nome },
            scelte: [],
            righe: 0
        };
        const b = creaBattaglia(stato, teams);
        await pubblica(id, stato, b);
    }

    // --- scrive log pubblico e richieste private ---
    async function pubblica(id, stato, b) {
        const pubbliche = righePubbliche(b.log);
        const nuove = pubbliche.slice(stato.righe || 0);
        stato.righe = pubbliche.length;

        const agg = {};
        agg[`partiteServer/${id}/corrente`] = stato;
        agg[`partiteServer/${id}/inAttesa`] = null;
        agg[`partite/${id}/haScelto`] = null;
        agg[`partite/${id}/setCorrente`] = stato.set;
        if (nuove.length) {
            const chiave = db.ref(`partite/${id}/log/set${stato.set}`).push().key;
            agg[`partite/${id}/log/set${stato.set}/${chiave}`] = nuove.join('\n');
        }
        const passo = chiavePasso(stato);
        for (const lato of ['p1', 'p2']) {
            const r = b[lato].activeRequest;
            agg[`partite/${id}/privato/${lato}/richiesta`] = (r && !b.ended)
                ? { set: stato.set, passo, json: JSON.stringify(r) }
                : null;
        }
        await db.ref().update(agg);
    }

    // --- scelta di un giocatore ---
    async function inviaScelta(uid, { id, passo, scelta }) {
        const info = await leggi(`partite/${id}/info`);
        if (!info) throw new ErroreUtente('Partita inesistente');
        const lato = latoDi(info, uid);
        if (!lato) throw new ErroreUtente('Non sei uno dei due giocatori di questo match');
        if (typeof scelta !== 'string' || !scelta.trim() || scelta.length > 300) throw new ErroreUtente('Scelta non valida');

        const [stato, t] = await Promise.all([leggi(`partiteServer/${id}/corrente`), leggi(`partiteServer/${id}/team`)]);
        if (!stato) throw new ErroreUtente('Il match non è ancora iniziato');
        if (chiavePasso(stato) !== passo) throw new ErroreUtente('Questa richiesta è scaduta: la pagina si aggiorna da sola');

        const teams = { p1: t.p1.packed, p2: t.p2.packed };
        const b = creaBattaglia(stato, teams);
        if (!latiCheDevonoScegliere(b).includes(lato)) throw new ErroreUtente('Ora non devi scegliere nulla');

        // Si prova la scelta su una copia: così un errore torna subito al giocatore
        const errori = [];
        const prova = creaBattaglia(stato, teams, (tipo, dati) => {
            if (tipo === 'sideupdate') {
                const r = String(dati).split('\n').find(x => x.startsWith('|error|'));
                if (r) errori.push(r.slice(7));
            }
        });
        if (!prova.choose(lato, scelta)) throw new ErroreUtente(errori[0] || 'Scelta non valida');

        await db.ref(`partiteServer/${id}/inAttesa/${lato}`).set({ passo, scelta: cifra(scelta), n: ora() });
        await db.ref(`partite/${id}/haScelto/${lato}`).set(passo);   // solo "ha scelto", mai cosa
        await elabora(id, info, teams);
        return { ok: true };
    }

    // --- ritirare la propria scelta, finché l'avversario non ha scelto ---
    async function annullaScelta(uid, { id, passo }) {
        const info = await leggi(`partite/${id}/info`);
        if (!info) throw new ErroreUtente('Partita inesistente');
        const lato = latoDi(info, uid);
        if (!lato) throw new ErroreUtente('Non sei uno dei due giocatori di questo match');
        const stato = await leggi(`partiteServer/${id}/corrente`);
        if (!stato) throw new ErroreUtente('Il match non è ancora iniziato');
        if (chiavePasso(stato) !== passo) throw new ErroreUtente('Questa richiesta è scaduta: la pagina si aggiorna da sola');

        const esito = await ritiraScelta(db, id, lato, passo);
        if (esito === 'tardi') throw new ErroreUtente("Troppo tardi: l'avversario ha già scelto");
        if (esito === 'nessuna') throw new ErroreUtente('Non c\'è nessuna scelta da annullare');
        return { ok: true };
    }

    // --- quando tutti hanno scelto, il turno si gioca (una sola volta) ---
    async function elabora(id, info, teams) {
        const [stato, attesa] = await Promise.all([leggi(`partiteServer/${id}/corrente`), leggi(`partiteServer/${id}/inAttesa`)]);
        const b = creaBattaglia(stato, teams);
        const servono = latiCheDevonoScegliere(b);
        const passo = chiavePasso(stato);
        if (!servono.length || !servono.every(l => attesa && attesa[l] && attesa[l].passo === passo)) return;

        const nuove = servono.map(l => ({ l, s: decifra(attesa[l].scelta) }));
        const versione = (stato.scelte || []).length;

        const esito = await db.ref(`partiteServer/${id}/corrente`).transaction(cur => {
            if (cur === null) return null;
            if ((cur.scelte || []).length !== versione || cur.set !== stato.set) return;   // già giocato
            return { ...cur, scelte: [...(cur.scelte || []), ...nuove] };
        });
        if (!esito.committed || !esito.snapshot.val()) return;

        const nuovoStato = esito.snapshot.val();
        for (const { l, s } of nuove) b.choose(l, s);
        await pubblica(id, nuovoStato, b);
        if (b.ended) await fineSet(id, info, nuovoStato, b);
    }

    // --- fine di un set ---
    async function fineSet(id, info, stato, b) {
        if (info.amichevole) return fineSetAmichevole(id, info, stato, b);
        const righe = righePubbliche(b.log);
        // chi vince lo dice il log già senza pareggi; se il log non basta, il motore
        const vincitore = EsitoSet.vincitoreDelLog(righe).lato
            || (b.winner === b.p1.name ? 'p1' : (b.winner === b.p2.name ? 'p2' : ''));

        // Statistiche del set (KO, ultimo rimasto...). Se qualcosa va storto il set si salva lo stesso.
        let stats = null;
        try {
            const portati = lato => b[lato].pokemon.filter(p => p.set && p.set.species).map(p => ({ specie: p.set.species, nome: p.set.name || '' }));
            // i soprannomi nell'ordine del team: con due Pokémon della stessa specie dicono quale dei due è sceso in campo
            const nomi = lato => (b[lato].team || []).map(s => s.name || s.species);
            stats = analizzaSet(righe, { portati: { p1: portati('p1'), p2: portati('p2') }, nomi: { p1: nomi('p1'), p2: nomi('p2') } });
        } catch (e) {
            console.error('Statistiche del set non calcolate', id, stato.set, e);
        }

        let url = '';
        try {
            // Colore e avatar come nel resto del sito: players/{id}/info
            const [anag1, anag2] = await Promise.all([
                leggi(`players/${info.p1.id}/info`).catch(() => null),
                leggi(`players/${info.p2.id}/info`).catch(() => null)
            ]);
            const giocatore = (g, anag) => ({ nome: g.nome, colore: anag?.color || '', avatar: anag?.avatar || '' });
            const html = creaReplayHtml({
                log: righe,
                p1: giocatore(info.p1, anag1),
                p2: giocatore(info.p2, anag2),
                etichetta: info.categoria,
                match: info.match,
                set: stato.set,
                sito
            });
            url = await salvaReplay(`replays/${info.showdown}/match${info.match}/set${stato.set}.html`, html);
        } catch (e) {
            console.error('Replay non salvato', id, stato.set, e);
        }
        const risultato = { vincitore, url, turni: b.turn };
        if (stats) risultato.stats = stats;
        await db.ref(`partite/${id}/risultati/set${stato.set}`).set(risultato);

        if (stato.set < info.bestOf) await avviaSet(id, info, stato.set + 1);
        else await db.ref(`partite/${id}/stato`).set('da_salvare');
    }

    // --- salvataggio del match concluso (stessi dati dell'inserimento manuale) ---
    async function salvaPartita(id) {
        const esito = await db.ref(`partite/${id}/stato`).transaction(cur =>
            cur === null ? null : (cur === 'da_salvare' ? 'salvataggio' : undefined));
        if (!esito.committed || esito.snapshot.val() !== 'salvataggio') return;

        try {
            const [info, risultati, team] = await Promise.all([
                leggi(`partite/${id}/info`), leggi(`partite/${id}/risultati`), leggi(`partite/${id}/team`)
            ]);
            let s1 = 0, s2 = 0;
            const replays = {};
            const setStats = {};
            for (let n = 1; n <= info.bestOf; n++) {
                const r = (risultati || {})[`set${n}`] || {};
                let vincitore = r.vincitore;
                if (vincitore !== 'p1' && vincitore !== 'p2') {
                    // un set chiuso in pareggio prima di questa regola: il vincitore si ricava dal suo log
                    const blocchi = await leggi(`partite/${id}/log/set${n}`);
                    const righe = Object.values(blocchi || {}).join('\n').split('\n').filter(Boolean);
                    vincitore = EsitoSet.vincitoreDelLog(righe).lato;
                    if (vincitore && r.stats) r.stats.vincitore = vincitore;
                }
                if (vincitore === 'p1') s1++;
                if (vincitore === 'p2') s2++;
                replays[`set${n}`] = { url: r.url || '', vincitore: vincitore === 'p1' ? '1' : (vincitore === 'p2' ? '2' : '') };
                if (r.stats) setStats[`set${n}`] = r.stats;
            }
            await registraRisultato({
                stagione: info.stagione,
                showdownId: info.showdown,
                matchNum: info.match,
                player1: info.p1.nome,
                player2: info.p2.nome,
                // nei Random non ci sono team da registrare (e quindi niente statistiche di team e di Pokémon: contano il match e l'Elo)
                team1: (team && team.p1) || '',
                team2: (team && team.p2) || '',
                score: `${s1}-${s2}`,
                data: info.data,
                categoria: info.categoria,
                replays,
                setStats
            });
            await db.ref(`partite/${id}`).update({ stato: 'salvata', errore: null });
        } catch (e) {
            console.error('Salvataggio fallito', id, e);
            await db.ref(`partite/${id}`).update({ stato: 'errore_salvataggio', errore: String(e.message || e) });
        }
    }

    // =================================================
    // PARTITE AMICHEVOLI
    // =================================================
    // Una sfida amichevole non c'entra con le stagioni: niente punti, niente statistiche, niente replay, niente storico.
    // La sfida vive in sfide/amichevoli/{id}. Quando l'altro accetta nasce la partita partite/amichevole__{id}, con la stessa struttura
    // di quelle ufficiali (lobby, set, richieste private): la pagina di battaglia è la stessa. A fine partita non si salva nulla: i
    // dati restano poche ore (il tempo di vedere l'esito) e poi li cancella pulisciAmichevoli().
    //
    // Tre modi di sfidare:
    //   - un formato dell'elenco: ognuno gioca con un team del proprio Box fatto per quel formato;
    //   - un formato Random: nessun team da scegliere, ne dà uno Showdown a ognuno (nuovo a ogni set);
    //   - la modalità libera: ognuno sceglie un team qualunque del proprio Box, tutti i Pokémon a livello 50.
    // La serie è una partita sola o al meglio dei 3, 5, 7 set. In una serie i team possono essere fissi (si sceglie all'inizio e si tiene)
    // oppure cambiabili dopo ogni set (stato 'tra_set': si resta nello stesso formato, tranne in modalità libera, dove cambia anche
    // quello); nei Random i team cambiano sempre da soli. A fine partita (anche di una serie) ciascuno può offrire la rivincita: è una
    // sfida nuova, con lo stesso avversario e lo stesso formato, dove si sceglie di nuovo la serie e i team.
    async function chiSono(uid) {
        const nome = await leggi(`users/${uid}/name`);
        if (!nome) throw new ErroreUtente('Your profile has no name on the site');
        return { uid, nome, id: String(nome).toLowerCase().trim() };
    }

    async function giocatorePerNome(nome) {
        const cercato = String(nome || '').trim().toLowerCase();
        if (!cercato || cercato.length > 60) throw new ErroreUtente('Choose a trainer to challenge');
        const utenti = await leggi('users') || {};
        const uidTrovato = Object.keys(utenti).find(u => String(utenti[u]?.name || '').trim().toLowerCase() === cercato);
        if (!uidTrovato) throw new ErroreUtente(`Trainer "${String(nome).trim()}" not found`);
        const trovato = String(utenti[uidTrovato].name);
        return { uid: uidTrovato, nome: trovato, id: trovato.toLowerCase().trim() };
    }

    // I team del Box di un giocatore, con i loro problemi per questa partita:
    // [{ nome, categoria, testo, problemi }]. Per un formato dell'elenco solo i team fatti per quel formato (con i controlli di quel
    // formato); in modalità libera tutti, controllando solo che si leggano.
    async function teamUtilizzabili(idGiocatore, { libera, categoria }, regolamenti) {
        const box = Object.values(await leggi(`players/${idGiocatore}/teams`) || {}).filter(t => t);
        const risultato = [];
        for (const t of box) {
            const nome = nomeTeam(t);
            const cat = String(t.categoria || t.category || '').trim();
            const reg = trovaRegolamento(regolamenti, cat);
            const testo = testoShowdownDaTeam(t, reg ? livelloFormato(reg) : 100);
            if (!nome || !testo) continue;
            if (!libera) {
                if (cat.toLowerCase() !== String(categoria).toLowerCase()) continue;
                const regFormato = trovaRegolamento(regolamenti, categoria);
                risultato.push({ nome, categoria: cat, testo, problemi: regFormato ? await controllaTeam(testo, regFormato) : ['The format of this team no longer exists'] });
                continue;
            }
            let problemi = [];
            try {
                const sets = importaTeam(testo);
                const sconosciuti = sets.filter(x => !PS.Dex.species.get(x.species || x.name).exists);
                const mosseStrane = sets.flatMap(x => (x.moves || []).filter(m => !PS.Dex.moves.get(m).exists));
                if (!sets.length) problemi = ['The team is empty or unreadable'];
                else if (sets.length > 6) problemi = ['A team has at most 6 Pokémon'];
                else if (sconosciuti.length) problemi = [`Unknown Pokémon: ${sconosciuti.map(x => x.species || x.name).join(', ')}`];
                else if (mosseStrane.length) problemi = [`Unknown moves: ${mosseStrane.join(', ')}`];
            } catch (e) { problemi = ['The team is unreadable']; }
            risultato.push({ nome, categoria: cat, testo, problemi });
        }
        return risultato;
    }

    const eRandomSfida = reg => FormatoRandom.eRandom(reg);

    // La sfida cambia stato solo se è ancora in attesa (due risposte insieme: vince la prima)
    async function cambiaStatoSfida(id, nuovo) {
        const esito = await db.ref(`${PERCORSO_SFIDE}/${id}`).transaction(cur => {
            if (cur === null) return null;
            if (cur.stato !== 'in_attesa') return;
            return { ...cur, stato: nuovo, risposta: ora() };
        });
        if (!esito.committed) throw new ErroreUtente('This challenge was already answered');
        await segnaRivincita(esito.snapshot.val(), id, nuovo);
        return { ok: true };
    }

    // Una rivincita è una sfida nuova (stesso avversario e stesso formato) offerta a fine partita: la partita appena finita ne tiene lo
    // stato (partite/{id}/rivincita), perché i due che sono ancora lì lo vedano e rispondano senza uscire dalla pagina
    async function segnaRivincita(sfida, idSfida, stato, extra = {}) {
        if (!sfida || !sfida.rivincitaDi) return;
        const percorso = `partite/${idPartitaAmichevole(sfida.rivincitaDi)}/rivincita`;
        const attuale = await leggi(percorso);
        if (!attuale || attuale.sfida !== idSfida) return;      // la partita vecchia è già stata pulita, o c'è un'offerta più recente
        await db.ref(percorso).update({ stato, ...extra });
    }

    // Cancella le sfide e le partite amichevoli vecchie: nulla di una partita amichevole resta nel database
    async function pulisciAmichevoli() {
        const sfide = await leggi(PERCORSO_SFIDE) || {};
        const adesso = ora();
        const aggiornamento = {};
        for (const [k, sf] of Object.entries(sfide)) {
            if (!sf) { aggiornamento[`${PERCORSO_SFIDE}/${k}`] = null; continue; }
            const finita = ['conclusa', 'rifiutata', 'annullata', 'scaduta'].includes(sf.stato);
            const riferimento = sf.risposta || sf.creata || 0;
            const durata = finita ? DURATA_DATI : DURATA_SFIDA;
            if (adesso - riferimento <= durata) continue;
            aggiornamento[`${PERCORSO_SFIDE}/${k}`] = null;
            aggiornamento[`partite/${idPartitaAmichevole(k)}`] = null;
            aggiornamento[`partiteServer/${idPartitaAmichevole(k)}`] = null;
        }
        if (Object.keys(aggiornamento).length) await db.ref().update(aggiornamento);
    }

    // --- lanciare una sfida ---
    // { a: nome dell'avversario, tipo: 'formato' | 'libera', categoria (formato), stile ('singles' | 'doubles', libera),
    //   bestOf (1, 3, 5 o 7), cambioTeam (si può cambiare team dopo ogni set della serie; nei Random i team cambiano sempre da soli),
    //   rivincita: id della sfida appena conclusa (a fine partita: stesso avversario e stesso formato, serie nuova) }
    async function sfidaAmichevole(uid, { a, tipo, categoria, stile, bestOf, cambioTeam, rivincita } = {}) {
        await pulisciAmichevoli().catch(e => console.error('Pulizia amichevoli', e));
        const io = await chiSono(uid);

        // una rivincita ripete avversario e formato della partita appena finita: chi la offre sceglie solo la serie
        let precedente = null;
        if (rivincita !== undefined && rivincita !== null && rivincita !== '') {
            if (typeof rivincita !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(rivincita)) throw new ErroreUtente('Invalid challenge');
            const p = await leggi(`${PERCORSO_SFIDE}/${rivincita}`);
            if (!p) throw new ErroreUtente('This friendly match is no longer available');
            if (p.daUid !== uid && p.aUid !== uid) throw new ErroreUtente('This friendly match is not yours');
            if (p.stato !== 'conclusa') throw new ErroreUtente('This friendly match is not over yet');
            precedente = { ...p, id: rivincita };
            a = p.daUid === uid ? p.a : p.da;
            tipo = p.tipo;
            categoria = p.libera ? undefined : p.categoria;
            stile = p.stile;
        }

        const lui = await giocatorePerNome(a);
        if (lui.uid === uid || lui.id === io.id) throw new ErroreUtente("You can't challenge yourself");
        if (tipo !== 'formato' && tipo !== 'libera') throw new ErroreUtente('Pick a format, or the free mode');
        const serie = serieDi(bestOf);

        const regolamenti = await leggi('regolamenti') || {};
        let reg = null;
        if (tipo === 'formato') {
            reg = trovaRegolamento(regolamenti, categoria);
            if (!reg) throw new ErroreUtente(`Format "${String(categoria || '')}" not found`);
        }
        const random = !!reg && eRandomSfida(reg);

        // chi sfida deve poter giocare: almeno un team utilizzabile (non nei Random, dove i team li dà Showdown)
        if (!random) {
            const miei = await teamUtilizzabili(io.id, { libera: tipo === 'libera', categoria: reg && reg.categoria }, regolamenti);
            if (!miei.some(t => !t.problemi.length)) {
                throw new ErroreUtente(tipo === 'libera'
                    ? 'You have no usable team in your Box'
                    : `You have no usable team for ${reg.categoria}: build one in the Box first`);
            }
        }

        const sfide = await leggi(PERCORSO_SFIDE) || {};
        const attive = Object.entries(sfide).filter(([, x]) => x && x.stato === 'in_attesa');
        const traNoi = attive.filter(([, x]) => (x.daUid === uid && x.aUid === lui.uid) || (x.daUid === lui.uid && x.aUid === uid));
        if (traNoi.length) {
            // se l'altro ha offerto la rivincita nello stesso momento, offrirla a propria volta vuol dire accettare la sua
            const sua = precedente && traNoi.find(([, x]) => x.daUid === lui.uid && x.rivincitaDi === precedente.id);
            if (sua) {
                const r = await rispondiAmichevole(uid, { id: sua[0], risposta: 'accetta' });
                return { ...r, accettata: true };
            }
            throw new ErroreUtente(`There is already a pending friendly challenge between you and ${lui.nome}`);
        }
        if (attive.filter(([, x]) => x.daUid === uid).length >= MASSIMO_SFIDE_IN_ATTESA) {
            throw new ErroreUtente('You have too many friendly challenges waiting for an answer');
        }

        const id = db.ref(PERCORSO_SFIDE).push().key;
        const sfida = {
            da: io.nome, daId: io.id, daUid: uid,
            a: lui.nome, aId: lui.id, aUid: lui.uid,
            tipo, libera: tipo === 'libera', random,
            categoria: tipo === 'libera' ? 'Free battle' : reg.categoria,
            stile: tipo === 'libera' && stile === 'doubles' ? 'doubles' : 'singles',
            bestOf: serie,
            // team cambiabili tra un set e l'altro: ha senso solo in una serie, e non nei Random (lì cambiano comunque a ogni set)
            cambioTeam: serie > 1 && !random && cambioTeam === true,
            stato: 'in_attesa',
            creata: ora()
        };
        if (precedente) sfida.rivincitaDi = precedente.id;
        await db.ref(`${PERCORSO_SFIDE}/${id}`).set(sfida);
        if (precedente) {
            // la partita appena finita ricorda l'offerta: chi è ancora lì la vede e risponde senza uscire dalla pagina
            const percorso = `partite/${idPartitaAmichevole(precedente.id)}/rivincita`;
            if (await leggi(`partite/${idPartitaAmichevole(precedente.id)}/info`)) {
                await db.ref(percorso).set({ sfida: id, daUid: uid, da: io.nome, bestOf: serie, cambioTeam: sfida.cambioTeam, stato: 'in_attesa', creata: ora() });
            }
        }
        return { ok: true, id };
    }

    // --- rispondere: 'accetta' | 'rifiuta' (chi è sfidato) o 'ritira' (chi ha sfidato) ---
    async function rispondiAmichevole(uid, { id, risposta } = {}) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new ErroreUtente('Invalid challenge');
        const sf = await leggi(`${PERCORSO_SFIDE}/${id}`);
        if (!sf) throw new ErroreUtente('This challenge no longer exists');

        if (risposta === 'ritira') {
            if (sf.daUid !== uid) throw new ErroreUtente('Only who sent the challenge can withdraw it');
            return cambiaStatoSfida(id, 'annullata');
        }
        if (sf.aUid !== uid) throw new ErroreUtente('This challenge is not for you');
        if (risposta === 'rifiuta') return cambiaStatoSfida(id, 'rifiutata');
        if (risposta !== 'accetta') throw new ErroreUtente('Unknown answer');

        if (sf.stato === 'accettata' && sf.partita) return { ok: true, partita: sf.partita, id };      // già accettata: si riapre
        if (sf.stato !== 'in_attesa') throw new ErroreUtente('This challenge is no longer available');
        if (ora() - (sf.creata || 0) > DURATA_SFIDA) {
            await cambiaStatoSfida(id, 'scaduta').catch(() => {});
            throw new ErroreUtente('This challenge has expired');
        }

        const regolamenti = await leggi('regolamenti') || {};
        const reg = sf.libera ? null : trovaRegolamento(regolamenti, sf.categoria);
        if (!sf.libera && !reg) throw new ErroreUtente(`The format "${sf.categoria}" no longer exists`);
        // chi accetta deve poter giocare (nei Random i team li dà Showdown)
        if (!sf.random) {
            const miei = await teamUtilizzabili(sf.aId, { libera: !!sf.libera, categoria: sf.categoria }, regolamenti);
            if (!miei.some(t => !t.problemi.length)) {
                throw new ErroreUtente(sf.libera
                    ? 'You have no usable team in your Box'
                    : `You have no usable team for ${sf.categoria}: build one in the Box first`);
            }
        }

        const idPartita = idPartitaAmichevole(id);
        const esito = await db.ref(`${PERCORSO_SFIDE}/${id}`).transaction(cur => {
            if (cur === null) return null;
            if (cur.stato !== 'in_attesa') return;
            return { ...cur, stato: 'accettata', risposta: ora(), partita: idPartita };
        });
        if (!esito.committed) throw new ErroreUtente('This challenge was already answered');

        const adesso = new Date(ora());
        const info = {
            amichevole: true, sfida: id,
            categoria: sf.categoria,
            libera: !!sf.libera, random: !!sf.random,
            stile: sf.stile || 'singles',
            // in modalità libera la generazione si sa solo quando i due hanno scelto il team: finché non si sa, quella di oggi
            formato: sf.libera ? formatoLibero(9, sf.stile === 'doubles') : formatoSimulatore(reg),
            livello: sf.libera ? LIVELLO_LIBERO : livelloFormato(reg),
            bestOf: serieDi(sf.bestOf),
            cambioTeam: !!sf.cambioTeam && !sf.random,       // si sceglie il team anche tra un set e l'altro
            match: 1,
            data: `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, '0')}-${String(adesso.getDate()).padStart(2, '0')}`,
            p1: { nome: sf.da, id: sf.daId, uid: sf.daUid },
            p2: { nome: sf.a, id: sf.aId, uid: sf.aUid },
            creata: ora()
        };
        await db.ref(`partite/${idPartita}/info`).set(info);
        await db.ref(`partite/${idPartita}/stato`).set('lobby');
        await segnaRivincita(sf, id, 'accettata', { partita: idPartita });
        return { ok: true, partita: idPartita, id };
    }

    // --- aprire la partita amichevole (di chi gioca, o di chi guarda) ---
    async function apriAmichevole(uid, idSfida) {
        if (typeof idSfida !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(idSfida)) throw new ErroreUtente('Invalid challenge');
        const sf = await leggi(`${PERCORSO_SFIDE}/${idSfida}`);
        if (!sf || !sf.partita) throw new ErroreUtente('This friendly match is not available (not accepted yet, or too old)');
        const info = await leggi(`partite/${sf.partita}/info`);
        if (!info) throw new ErroreUtente('This friendly match is no longer available');
        return { id: sf.partita, lato: latoDi(info, uid), info, giaSalvato: false };
    }

    // --- team scelto e "pronto" (amichevoli, e Random delle stagioni) ---
    // parametri: { id, team } (nome del team del Box), oppure { id, pronto } nei Random (nessun team da scegliere: li dà Showdown).
    // Nelle amichevoli con team cambiabili si torna qui anche tra un set e l'altro (statoPrima = 'tra_set'): quando i due sono pronti
    // parte il set successivo, con i team che hanno scelto (anche gli stessi).
    async function prontoLobby(parametri, info, lato, statoPrima = 'lobby') {
        const { id, team } = parametri;
        const vuolePartire = info.random ? parametri.pronto !== false : !!team;
        if (!vuolePartire) {
            await db.ref(`partite/${id}/pronti/${lato}`).set(false);
            return { ok: true };
        }

        const regolamenti = await leggi('regolamenti') || {};
        if (!info.random) {
            const mioId = info[lato].id;
            const usabili = await teamUtilizzabili(mioId, { libera: !!info.libera, categoria: info.categoria }, regolamenti);
            const scelto = usabili.find(t => t.nome === team);
            if (!scelto) throw new ErroreUtente(`"${team}" is not one of your ${info.libera ? '' : info.categoria + ' '}teams`);
            if (scelto.problemi.length) throw new ErroreUtente(`This team can't be used: ${scelto.problemi.join('; ')}`);
            const sets = importaTeam(scelto.testo);
            if (info.libera) sets.forEach(x => { x.level = LIVELLO_LIBERO; });
            await db.ref(`partiteServer/${id}/team/${lato}`).set({ nome: scelto.nome, categoria: scelto.categoria, packed: PS.Teams.pack(sets) });
        }
        await db.ref(`partite/${id}/pronti/${lato}`).set(true);

        const pronti = await leggi(`partite/${id}/pronti`) || {};
        if (!(pronti.p1 && pronti.p2)) return { ok: true };
        const esito = await db.ref(`partite/${id}/stato`).transaction(cur =>
            cur === null ? null : (cur === statoPrima ? 'in_corso' : undefined));
        if (!esito.committed || esito.snapshot.val() !== 'in_corso') return { ok: true };

        const t = await leggi(`partiteServer/${id}/team`) || {};
        let partita = info;
        if (info.libera) {
            // la generazione è la più recente tra i due team (quella del formato per cui sono stati fatti): se i team cambiano
            // tra un set e l'altro può cambiare anche lei
            const gen = Math.max(...['p1', 'p2'].map(l => {
                const r = trovaRegolamento(regolamenti, t[l] && t[l].categoria);
                return r ? generazioneFormato(r) : 9;
            }));
            partita = { ...info, formato: formatoLibero(gen, info.stile === 'doubles') };
            await db.ref(`partite/${id}/info/formato`).set(partita.formato);
        }
        if (!info.random) await db.ref(`partite/${id}/team`).set({ p1: t.p1.nome, p2: t.p2.nome });
        const set = statoPrima === 'tra_set' ? (Number(await leggi(`partite/${id}/setProssimo`)) || 1) : 1;
        await avviaSet(id, partita, set);
        return { ok: true };
    }

    // --- fine di un set di una partita amichevole: si decide se continuare, e non si salva nulla ---
    async function fineSetAmichevole(id, info, stato, b) {
        const righe = righePubbliche(b.log);
        const vincitore = EsitoSet.vincitoreDelLog(righe).lato
            || (b.winner === b.p1.name ? 'p1' : (b.winner === b.p2.name ? 'p2' : ''));
        await db.ref(`partite/${id}/risultati/set${stato.set}`).set({ vincitore, turni: b.turn });

        const risultati = await leggi(`partite/${id}/risultati`) || {};
        const vinti = { p1: 0, p2: 0 };
        for (const r of Object.values(risultati)) if (r && vinti[r.vincitore] !== undefined) vinti[r.vincitore]++;
        const servono = vittorieNecessarie(info.bestOf);
        const finita = vinti.p1 >= servono || vinti.p2 >= servono || stato.set >= info.bestOf;
        if (!finita) {
            if (info.cambioTeam && !info.random) {
                // team cambiabili: prima del set successivo ognuno sceglie il suo (può tenere lo stesso) e preme "pronto"
                await db.ref().update({
                    [`partite/${id}/stato`]: 'tra_set',
                    [`partite/${id}/pronti`]: null,
                    [`partite/${id}/setProssimo`]: stato.set + 1
                });
                return;
            }
            return avviaSet(id, info, stato.set + 1);
        }

        await db.ref(`partite/${id}/stato`).set('conclusa');
        if (info.sfida) await db.ref(`${PERCORSO_SFIDE}/${info.sfida}`).update({ stato: 'conclusa', risposta: ora() });
        // i team e le scelte restano sul server solo finché servono
        await db.ref(`partiteServer/${id}`).remove();
    }

    return { apriPartita, pronto, inviaScelta, annullaScelta, salvaPartita, sfidaAmichevole, rispondiAmichevole, pulisciAmichevoli };
}

module.exports = {
    creaServizio, ErroreUtente,
    // esportate per i test
    formatoSimulatore, formatoLibero, livelloFormato, controllaTeam, importaTeam, righePubbliche, creaReplayHtml, creaCifratura, EsitoSet,
    generaTeamRandom
};
