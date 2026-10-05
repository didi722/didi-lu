'use strict';
// Le note del team (docs/note-team.js): si appuntano durante la prova contro la CPU, si ritrovano nel Box e nel Team Builder, si
// cancellano quando sono risolte.
//   - il testo si pulisce e si limita; una nota ha solo valori semplici (Firebase non accetta undefined);
//   - le note stanno dentro il team (players/{giocatore}/teams/{team}/note): l'elenco arriva dalla più recente;
//   - scrittura, ascolto e cancellazione su un Firebase finto; gli errori delle regole del database si spiegano;
//   - il Box salva un team con update(): le note non si perdono quando il team si modifica.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../docs/note-team.js');

const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

// ---------- un Firebase finto (alberi di oggetti, ascoltatori, push con chiavi crescenti) ----------
function dbFinto({ errore = null } = {}) {
    let albero = {};
    const ascoltatori = [];
    let contatore = 0;
    const leggi = p => p.split('/').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), albero);
    const scrivi = (p, v) => {
        const chiavi = p.split('/').filter(Boolean);
        if (!chiavi.length) { albero = v || {}; return; }
        let o = albero;
        for (const k of chiavi.slice(0, -1)) o = (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {});
        if (v === null) delete o[chiavi[chiavi.length - 1]]; else o[chiavi[chiavi.length - 1]] = JSON.parse(JSON.stringify(v));
    };
    const avvisa = () => ascoltatori.forEach(a => a.f({ val: () => { const v = leggi(a.p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }));
    const ref = p => ({
        key: p.split('/').pop(),
        on: (_, f, fe) => { ascoltatori.push({ p, f, fe }); avvisa(); },
        off: (_, f) => { const i = ascoltatori.findIndex(a => a.p === p && a.f === f); if (i >= 0) ascoltatori.splice(i, 1); },
        once: async () => ({ val: () => leggi(p) ?? null }),
        push: () => ref(`${p}/-K${String(++contatore).padStart(4, '0')}`),
        set: async v => { if (errore) throw errore; scrivi(p, v); avvisa(); },
        remove: async () => { if (errore) throw errore; scrivi(p, null); avvisa(); }
    });
    return { ref, albero: () => albero };
}

test('pulisciTesto: a capo uniformi, niente righe vuote a catena, senza spazi attorno, al massimo 500 caratteri', () => {
    assert.equal(N.pulisciTesto('  ciao  '), 'ciao');
    assert.equal(N.pulisciTesto('uno\r\ndue\r\n\r\n\r\n\r\ntre  \n'), 'uno\ndue\n\ntre');
    assert.equal(N.pulisciTesto(null), '');
    assert.equal(N.pulisciTesto(undefined), '');
    assert.equal(N.pulisciTesto('   \n\t '), '');
    assert.equal(N.pulisciTesto('x'.repeat(900)).length, N.MAX_TESTO);
    assert.equal(N.pulisciTesto(123), '123');
});

test('nuovaNota: testo, momento, contro chi (al massimo sei specie) e turno; vuota non si salva', () => {
    assert.equal(N.nuovaNota({ testo: '   ' }), null);
    assert.equal(N.nuovaNota(null), null);
    const n = N.nuovaNota({ testo: ' Manca una Protezione ', contro: { nome: 'Team 3', specie: ['Garchomp', ' Kyurem ', '', 'A', 'B', 'C', 'D', 'E'] }, turno: 7.9 }, 1700000000123.8);
    assert.deepEqual(n, { testo: 'Manca una Protezione', creata: 1700000000123, contro: { nome: 'Team 3', specie: ['Garchomp', 'Kyurem', 'A', 'B', 'C', 'D'] }, turno: 7 });
    // senza contesto: solo testo e momento (Firebase non accetta undefined)
    assert.deepEqual(N.nuovaNota({ testo: 'ciao', contro: {}, turno: 0 }, 5), { testo: 'ciao', creata: 5 });
    assert.deepEqual(N.nuovaNota({ testo: 'ciao', turno: 'boh' }, 5), { testo: 'ciao', creata: 5 });
    assert.deepEqual(N.nuovaNota({ testo: 'ciao', contro: { nome: 'Team 1' } }, 5).contro, { nome: 'Team 1', specie: [] });
    assert.equal(JSON.stringify(n).includes('undefined'), false);
    assert.equal(Object.values(N.nuovaNota({ testo: 'x' }, 1)).some(v => v === undefined), false);
});

test('leggiNote: da oggetto o array di Firebase, dalla più recente, scartando quelle vuote o strane', () => {
    const grezzo = {
        a: { testo: 'vecchia', creata: 100 },
        b: { testo: 'nuova', creata: 300, turno: 4, contro: { nome: 'Team 2', specie: ['Kyurem'] } },
        c: { testo: '   ', creata: 500 },
        d: 'non una nota',
        e: { testo: 'di mezzo', creata: 200 },
        f: null
    };
    const l = N.leggiNote(grezzo);
    assert.deepEqual(l.map(n => n.id), ['b', 'e', 'a']);
    assert.deepEqual(l[0], { id: 'b', testo: 'nuova', creata: 300, contro: { nome: 'Team 2', specie: ['Kyurem'] }, turno: 4 });
    assert.deepEqual(N.leggiNote([{ testo: 'x', creata: 1 }, null, { testo: 'y', creata: 2 }]).map(n => n.testo), ['y', 'x']);
    for (const niente of [null, undefined, {}, [], 'x', 5]) assert.deepEqual(N.leggiNote(niente), []);
    assert.equal(N.contaNote(grezzo), 3);
    // a pari momento, un ordine stabile
    assert.deepEqual(N.leggiNote({ a: { testo: 'a', creata: 1 }, b: { testo: 'b', creata: 1 } }).map(n => n.id), ['b', 'a']);
});

test('etichettaContesto e quando: contro chi, a che turno, e da quanto', () => {
    assert.equal(N.etichettaContesto({ contro: { nome: 'Team 3', specie: ['Garchomp', 'Gholdengo', 'Kyurem', 'Zapdos'] }, turno: 7 }), 'vs Garchomp, Gholdengo +2 · turn 7');
    assert.equal(N.etichettaContesto({ contro: { nome: 'Team 3', specie: ['Garchomp', 'Gholdengo'] } }), 'vs Garchomp, Gholdengo');
    assert.equal(N.etichettaContesto({ contro: { nome: 'Team 3', specie: [] } }), 'vs Team 3');
    assert.equal(N.etichettaContesto({ turno: 2 }), 'turn 2');
    assert.equal(N.etichettaContesto({}), '');
    const t = 1_700_000_000_000;
    assert.equal(N.quando(t, t + 20_000), 'just now');
    assert.equal(N.quando(t, t + 5 * 60_000), '5 min ago');
    assert.equal(N.quando(t, t + 3 * 3600_000), '3 h ago');
    assert.equal(N.quando(t, t + 2 * 86400_000), '2 d ago');
    assert.match(N.quando(t, t + 40 * 86400_000), /2023/);
    assert.equal(N.quando(0), '');
});

test('percorso: dentro il team del giocatore (minuscolo, senza spazi); la bozza ha la sua chiave', () => {
    assert.equal(N.percorso(' Didi ', 'tcpu'), 'players/didi/teams/tcpu/note');
    assert.equal(N.chiaveBozza('Didi', 'tcpu'), 'noteBozza|didi|tcpu');
});

test('Firebase: si aggiunge sotto il team, si ascolta dalla più recente, si cancella quando è risolta', async () => {
    const db = dbFinto();
    const viste = [];
    const stop = N.ascolta(db, 'didi', 't1', elenco => viste.push(elenco.map(n => n.testo)));
    assert.deepEqual(viste.at(-1), [], 'all\'inizio nessuna nota');

    const a = await N.aggiungi(db, 'didi', 't1', { testo: 'prima', contro: { nome: 'Team 1', specie: ['Kyurem'] }, turno: 3 });
    await new Promise(r => setTimeout(r, 2));
    const b = await N.aggiungi(db, 'didi', 't1', { testo: 'seconda' });
    assert.match(a.id, /^-K/);
    assert.notEqual(a.id, b.id);
    // sta dentro il team, nient'altro è stato toccato
    assert.deepEqual(Object.keys(db.albero().players.didi.teams.t1), ['note']);
    assert.equal(db.albero().players.didi.teams.t1.note[a.id].testo, 'prima');
    assert.deepEqual(db.albero().players.didi.teams.t1.note[a.id].contro, { nome: 'Team 1', specie: ['Kyurem'] });
    assert.deepEqual(viste.at(-1), ['seconda', 'prima']);

    await N.elimina(db, 'didi', 't1', a.id);
    assert.deepEqual(viste.at(-1), ['seconda']);
    assert.equal(db.albero().players.didi.teams.t1.note[a.id], undefined);
    await N.elimina(db, 'didi', 't1', '');      // senza id non fa nulla
    assert.deepEqual(viste.at(-1), ['seconda']);

    stop();
    await N.aggiungi(db, 'didi', 't1', { testo: 'dopo lo stop' });
    assert.deepEqual(viste.at(-1), ['seconda'], 'dopo stop() non si è più avvisati');
    await assert.rejects(N.aggiungi(db, 'didi', 't1', { testo: '  ' }), /empty/);
});

test('Firebase: gli errori delle regole del database e della rete si spiegano', async () => {
    const rifiuto = Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
    const db = dbFinto({ errore: rifiuto });
    await assert.rejects(N.aggiungi(db, 'didi', 't1', { testo: 'ciao' }), /didn't allow saving the note.*admin/);
    await assert.rejects(N.elimina(db, 'didi', 't1', 'x'), /didn't allow/);
    assert.match(N.errorePerUtente({ code: 'network-error' }).message, /No connection/);
    assert.match(N.errorePerUtente(new Error('boh')).message, /boh/);
    assert.match(N.errorePerUtente({}).message, /Could not save/);
    // un errore di lettura (regole) arriva a chi ascolta
    const letture = { ref: () => ({ on: (_, f, fe) => fe(rifiuto), off() {} }) };
    let visto = null;
    N.ascolta(letture, 'didi', 't1', () => {}, e => { visto = e; });
    assert.match(visto.message, /didn't allow/);
});

test('il testo delle note entra nella pagina solo come testo, mai come HTML', () => {
    const src = docs('note-team.js');
    for (const vietato of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) assert.ok(!src.includes(vietato), vietato);
    assert.match(src, /el\('p', 'nt-nota-testo', n\.testo\)/);
});

test('il Box salva un team con update() e non tocca le note; i team iscritti alle stagioni non le copiano', () => {
    const box = docs('box.html');
    // modifica: update() unisce i campi (le note restano); un team nuovo non ne ha ancora
    assert.match(box, /players\/\$\{playerID\}\/teams\/\$\{editingId\}`\)\.update\(datiTeamDaSalvare\)/);
    assert.ok(!/datiTeamDaSalvare\.note\b/.test(box), 'il salvataggio non scrive il campo note');
    // le iscrizioni copiano solo id, nome e Pokémon
    const hub = docs('hub.html');
    assert.match(hub, /datiTeams: selectedTeamIds\.map\(id => \(\{\s*id: id,\s*nome: allTeams\[id\]\.nome,\s*pokemon: allTeams\[id\]\.pokemon \|\| \[\]\s*\}\)\)/);
});

// ===================================================
// Cablaggio nelle pagine
// ===================================================
test('battle.html: il pulsante delle note sta nei servizi (nascosto finché non è la prova con la CPU), il bloc notes fuori dalla scena scalata', () => {
    const html = docs('battle.html');
    assert.match(html, /<link rel="stylesheet" href="note-team\.css">/);
    // il pulsante accanto al volume, nascosto: lo mostra battle-ui.js solo contro la CPU
    const servizi = html.slice(html.indexOf('<div class="servizi">'), html.indexOf('<!-- Colonne dei player'));
    assert.match(servizi, /<button[^>]*id="btn-note"[^>]*aria-expanded="false"[^>]*aria-controls="note-team"[^>]*\bhidden\b/);
    assert.match(servizi, /id="btn-note-conto"[^>]*\bhidden\b/);
    assert.ok(servizi.indexOf('id="btn-note"') < servizi.indexOf('id="btn-audio"'), 'le note stanno prima del volume');
    // il bloc notes: un dialogo non modale, nascosto, dopo la chiusura di #scala (così lo scalare della scena non lo tocca)
    const scalaFine = html.indexOf('</div>', html.indexOf('</main>'));
    const finestra = html.indexOf('id="note-team"');
    assert.ok(finestra > scalaFine, 'il bloc notes sta fuori da #scala');
    assert.match(html, /<aside class="nt-finestra" id="note-team" role="dialog" aria-modal="false" aria-labelledby="note-team-titolo" hidden>/);
    for (const id of ['note-team-titolo', 'note-team-nome', 'note-team-chiudi', 'note-team-corpo']) assert.ok(html.includes(`id="${id}"`), id);
});

test('battle-ui.js: le note si preparano solo nella prova contro la CPU, ricordano contro chi e a che turno, e Esc le chiude', () => {
    const ui = docs('battle-ui.js');
    assert.match(ui, /import '\.\/note-team\.js';/);
    // preparaNote si chiama una sola volta, da preparaCpu
    assert.equal((ui.match(/preparaNote\(/g) || []).length, 2, 'una definizione e una chiamata');
    const cpu = ui.slice(ui.indexOf('async function preparaCpu'), ui.indexOf('function preparaNote'));
    assert.match(cpu, /preparaNote\(dati, chiaveTeam\);/);
    const note = ui.slice(ui.indexOf('function preparaNote'), ui.indexOf('// Mette in campo il team della CPU'));
    // le note stanno nel team del giocatore, e ogni nota porta il team della CPU (nome neutro e specie) e il turno
    assert.match(note, /giocatore: dati\.id, team: chiaveTeam/);
    assert.match(note, /contro: cpu && cpu\.team \? \{ nome: nomeNeutro\(cpu\.team\), specie: cpu\.team\.specie \} : null/);
    assert.match(note, /turno: stato && stato\.turno/);
    // il numero sul pulsante segue le note; Esc chiude e restituisce il focus; la tastiera scritta lì non arriva alla pagina
    assert.match(note, /btn-note-conto/);
    assert.match(note, /finestra\.addEventListener\('keydown', e => \{\s*e\.stopPropagation\(\);\s*if \(e\.key === 'Escape'\)/);
    assert.match(note, /aria-expanded/);
});

test('box.html: segnalino sulla card, bloc notes nel dettaglio e nel Team Builder, tutto fermato alla chiusura', () => {
    const box = docs('box.html');
    assert.match(box, /<link rel="stylesheet" href="note-team\.css">/);
    assert.match(box, /<script src="note-team\.js"><\/script>/);
    // la card: l'adesivo c'è per ogni team e resta nascosto senza note; il clic apre il dettaglio con il bloc notes aperto
    assert.match(box, /class="azione-note" data-note-chip="\$\{team\.id\}" \$\{numeroNote \? '' : 'hidden'\}/);
    assert.match(box, /onclick="event\.stopPropagation\(\); apriDettagli\('\$\{team\.id\}', \{ note: true \}\)"/);
    assert.match(box, /NoteTeam\.contaNote\(team\.note\)/);
    // l'ascolto dei team tiene giusti i numeri sulle card (note aggiunte o cancellate altrove)
    assert.match(box, /resolve\(tuttiITeam\);\s*aggiornaChipNote\(\);/);
    // il dettaglio: la casella accanto a "Practice vs CPU", montata all'apertura, fermata alla chiusura e a ogni cambio di team
    assert.match(box, /async function apriDettagli\(id, opzioni = \{\}\)/);
    assert.match(box, /montaNoteDettaglio\(team, !!\(opzioni && opzioni\.note\)\);/);
    assert.match(box, /<span class="nt-barra-team" data-note-team><\/span>/);
    assert.match(box, /function chiudiTeamModal\(\) \{\s*fermaNoteDettaglio\(\);/);
    assert.match(box, /function montaNoteDettaglio\(team, aperto\) \{\s*fermaNoteDettaglio\(\);/);
    // il Team Builder: casella nell'intestazione, montata solo se si modifica un team del Box, fermata alla chiusura
    assert.match(box, /<span id="tb-note" class="nt-barra-team tb-note" hidden><\/span>/);
    assert.match(box, /tbRender\(\);\s*tbMontaNote\(\);/);
    assert.match(box, /function chiudiTeamBuilder\(\) \{[^}]*tbFermaNote\(\);/s);
    assert.match(box, /const idTeam = tbModifica && tbModifica\.teamId;/);
    // il bloc notes aperto sale sopra al resto del builder
    assert.match(box, /alAprire: tbNoteSopra/);
});

test('note-team.css: il bloc notes sta sopra alle schede dei Pokémon, ha la sua × e sul telefono diventa una finestra in basso', () => {
    const css = docs('note-team.css');
    // le schede dei Pokémon nel dettaglio salgono a 999 al passaggio: il bloc notes deve stare più su
    const z = Number((css.match(/\.nt-pop \{[^}]*z-index: (\d+)/s) || [])[1]);
    assert.ok(z > 999, `z-index ${z}`);
    assert.match(css, /\.nt-pop-testa \.nt-chiudi/);
    assert.match(css, /\.tb-header\.nt-sopra \{ z-index: 60; \}/);
    // le misure non cambiano col tema: nessuna variabile di tema ne decide larghezze o altezze (solo colori, ombre, angoli, caratteri)
    assert.ok(!/(?:width|height|margin|padding)[^;{}]*var\(--nb-(?:raggio|rot|sh-)/.test(css), 'misure legate a variabili di tema');
    const telefono = css.slice(css.indexOf('@media (max-width: 560px)'));
    assert.match(telefono, /\.nt-pop \{ position: fixed; left: 12px; right: 12px;/);
    assert.match(telefono, /\.nt-finestra \{ top: auto; left: 8px; right: 8px; bottom: 8px;/);
    // la finestra della battaglia sta sotto ai pulsanti dei servizi (non li copre)
    assert.match(css, /\.nt-finestra \{\s*position: fixed; top: 96px;/);
});

test('note-team.js: le note si fermano quando serve (niente ascolti rimasti) e la tastiera nel bloc notes non muove la pagina', () => {
    const src = docs('note-team.js');
    // chi monta il bloc notes riceve distruggi(): ferma l'ascolto di Firebase e il clic fuori
    assert.match(src, /distruggi: \(\) => \{ smetti\(\); radiceDom\.remove\(\); \}/);
    assert.match(src, /distruggi: \(\) => \{ doc\.removeEventListener\('click', fuori\); if \(alAprire\) alAprire\(false\); pannello\.distruggi\(\); casella\.replaceChildren\(\); \}/);
    // le frecce non cambiano team nel dettaglio del Box, Esc chiude solo il bloc notes
    assert.match(src, /pop\.addEventListener\('keydown', e => \{\s*e\.stopPropagation\(\);\s*if \(e\.key === 'Escape'\)/);
    // il testo si scrive come testo: nessuna nota entra come HTML (già controllato sopra) e la bozza non si perde se la pagina si ricarica
    assert.match(src, /noteBozza\|/);
});
