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

// Il server non corregge i team: se non sono conformi, non si gioca.
function controllaTeam(testo, reg) {
    const sets = importaTeam(testo);
    if (!sets.length) return ['Il team è vuoto o illeggibile'];
    const livello = livelloFormato(reg);
    const gen = generazioneFormato(reg);
    const problemi = [];
    for (const set of sets) {
        if ((set.level || 100) !== livello) problemi.push(`${set.species} è al livello ${set.level || 100} invece di ${livello}`);
        const strumento = PS.Dex.forGen(gen).items.get(set.item);
        if (!meccanicheAttive(reg) && strumento.exists && (strumento.megaStone || strumento.zMove)) {
            problemi.push(`${set.species} tiene ${strumento.name}, ma il formato non ha le meccaniche generazionali`);
        }
    }
    return problemi;
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
    return out;
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
    async function apriPartita(uid, { stagione, showdown, match }) {
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
            const esito = await db.ref(`partite/${id}/info`).transaction(cur => cur || nuovo);
            info = esito.snapshot.val();
            await db.ref(`partite/${id}/stato`).transaction(cur => cur || 'lobby');
        }

        const matchSalvato = await leggi(`seasons/${stagione}/showdowns/${showdown}/matches/match${match}`);
        return { id, lato: latoDi(info, uid), info, giaSalvato: !!(matchSalvato && matchSalvato.score) };
    }

    // --- scelta del team e "pronto" ---
    async function pronto(uid, { id, team }) {
        const info = await leggi(`partite/${id}/info`);
        if (!info) throw new ErroreUtente('Partita inesistente');
        const lato = latoDi(info, uid);
        if (!lato) throw new ErroreUtente('Non sei uno dei due giocatori di questo match');
        if (await leggi(`partite/${id}/stato`) !== 'lobby') throw new ErroreUtente('Il match è già iniziato');

        if (!team) {   // annulla il "pronto"
            await db.ref(`partite/${id}/pronti/${lato}`).set(false);
            return { ok: true };
        }

        const reg = trovaRegolamento(await leggi('regolamenti'), info.categoria);
        const scelto = (await teamIscritti(info, lato)).find(t => t.nome === team);
        if (!scelto) throw new ErroreUtente(`Il team "${team}" non è tra i tuoi iscritti in ${info.categoria}`);
        const problemi = controllaTeam(scelto.testo, reg);
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
        const t = await leggi(`partiteServer/${id}/team`);
        const teams = { p1: t.p1.packed, p2: t.p2.packed };
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
        const vincitore = b.winner === b.p1.name ? 'p1' : (b.winner === b.p2.name ? 'p2' : '');
        const righe = righePubbliche(b.log);

        // Statistiche del set (KO, ultimo rimasto...). Se qualcosa va storto il set si salva lo stesso.
        let stats = null;
        try {
            const portati = lato => b[lato].pokemon.map(p => p.set && p.set.species).filter(Boolean);
            stats = analizzaSet(righe, { portati: { p1: portati('p1'), p2: portati('p2') } });
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
                if (r.vincitore === 'p1') s1++;
                if (r.vincitore === 'p2') s2++;
                replays[`set${n}`] = { url: r.url || '', vincitore: r.vincitore === 'p1' ? '1' : (r.vincitore === 'p2' ? '2' : '') };
                if (r.stats) setStats[`set${n}`] = r.stats;
            }
            await registraRisultato({
                stagione: info.stagione,
                showdownId: info.showdown,
                matchNum: info.match,
                player1: info.p1.nome,
                player2: info.p2.nome,
                team1: team.p1,
                team2: team.p2,
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

    return { apriPartita, pronto, inviaScelta, salvaPartita };
}

module.exports = {
    creaServizio, ErroreUtente,
    // esportate per i test
    formatoSimulatore, livelloFormato, controllaTeam, importaTeam, righePubbliche, creaReplayHtml, creaCifratura
};
