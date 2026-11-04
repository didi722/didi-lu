'use strict';
// scheda-condivisione.js: le schede da mandare in chat (team, showdown, replay, allenatore): le parti pure (dati e testi) e il cablaggio nelle pagine.
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../docs/scheda-condivisione.js');

const leggi = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('team: fino a 6 Pokémon con specie (dal soprannome), strumento e al massimo 4 mosse vere; record in percentuale; colore sicuro', () => {
    const t = S.team({ nome: 'Alfa', categoria: 'VGC Gen 8', pokemon: [
        { nome: 'Pippo (Garchomp)', strumento: 'Rocky Helmet', abilita: 'Rough Skin', mosse: ['Earthquake', '-', '', 'Protect', 'Dragon Claw', 'Rock Slide', 'Swords Dance'] },
        ...Array.from({ length: 8 }, (_, i) => ({ nome: `Mon${i}` })), { nome: '' }
    ] }, { giocatore: 'Didi', colore: 'rosso<script>', avatar: 'a.png', record: { vinti: 5, persi: 2 } });
    assert.equal(t.tipo, 'team');
    assert.equal(t.pokemon.length, 6);
    assert.deepEqual([t.pokemon[0].specie, t.pokemon[0].nome], ['Garchomp', 'Pippo (Garchomp)']);
    assert.deepEqual(t.pokemon[0].mosse, ['Earthquake', 'Protect', 'Dragon Claw', 'Rock Slide']);
    assert.equal(t.colore, '#31c489', 'un colore non valido torna a quello di riserva');
    assert.deepEqual(t.record, { vinti: 5, persi: 2, perc: 71 });
    assert.equal(S.team({ nome: 'X', pokemon: [] }, {}).record, null);
    assert.equal(S.team(null).titolo, 'Team');
    assert.match(S.testo(t), /^Alfa \(VGC Gen 8\): Garchomp, Mon0.* · Didi — /);
});

test('showdown: punteggio in match vinti, match uno per uno (team anche come { valore }), colori e avatar per nome; chi vince', () => {
    const sd = S.showdown({ player1: 'Didi', player2: 'Lu', categoria: 'VGC', data: '2026-03-02' },
        { match1: { team1: 'Alfa', team2: { valore: 'Beta' }, p1score: 2, p2score: 1 }, match2: { team1: 'Alfa', team2: 'Gamma', p1score: 0, p2score: 2 }, match3: { team1: 'Alfa', team2: 'Beta', p1score: 2, p2score: 0 }, nonSalvato: { team1: 'x' } },
        { colori: { didi: '#ff0000', lu: 'blu' }, avatar: { didi: 'd.png' } });
    assert.deepEqual(sd.lati.map(l => [l.nome, l.vinti, l.colore, l.avatar]), [['Didi', 2, '#ff0000', 'd.png'], ['Lu', 1, '#8e44ad', '']]);
    assert.equal(sd.vince, 1);
    assert.equal(sd.match.length, 3);
    assert.equal(sd.match[0].team2, 'Beta');
    assert.equal(S.testo(sd), 'Didi 2 - 1 Lu · VGC · 2026-03-02 — Sant\'Alvise League');
    const pari = S.showdown({ player1: 'A', player2: 'B' }, { m: { p1score: 1, p2score: 1 } });
    assert.equal(pari.vince, 0);
    assert.equal(S.showdown(null, null).lati[0].nome, 'TBD');
});

test('replay: come lo showdown con set, esito, turni e link; il testo porta il link', () => {
    const sd = S.showdown({ player1: 'Didi', player2: 'Lu', categoria: 'VGC' }, { m: { p1score: 2, p2score: 1 } });
    const r = S.replay(sd, { set: 2, esitoSet: 'Lu', turni: 11, url: 'https://x.test/matches.html?id=s1&replay=a~b~set2&turno=7' });
    assert.deepEqual([r.tipo, r.titolo, r.set, r.esitoSet, r.turni], ['replay', 'REPLAY · SET 2', 2, 'Lu', 11]);
    assert.equal(sd.tipo, 'showdown', 'lo showdown di partenza non cambia');
    assert.equal(S.testo(r), 'Didi vs Lu · VGC · set 2\nhttps://x.test/matches.html?id=s1&replay=a~b~set2&turno=7');
    const m3 = S.replay(sd, { set: 2, match: 3 });
    assert.equal(m3.titolo, 'REPLAY · MATCH 3 · SET 2');
    assert.match(S.testo(m3), /^Didi vs Lu · VGC · match 3 · set 2$/);
    assert.equal(S.replay(sd, {}).titolo, 'REPLAY', 'senza match né set resta solo REPLAY');
});

test('allenatore: le quattro caselle dalle statistiche già pronte della pagina, formato e punti in più; testo breve', () => {
    const riepilogo = { rank: { grande: '#2', piccolo: 'ELO 1043' }, match: { grande: '71.4%', piccolo: '5W · 2L' }, sd: { grande: '60%', piccolo: '3W · 2L' }, set: { grande: '66.7%', piccolo: '10W · 5L' },
        punti: { grande: '59', piccolo: 'league points' }, formato: { grande: 'VGC Gen 8', piccolo: '4W · 1L' } };
    const a = S.allenatore({ nome: 'Didi', colore: '#123456', avatar: 'x.png', info: { motto: 'Vamos', pkmPreferito: 'Garchomp' }, riepilogo, compagnoShiny: true });
    assert.deepEqual(a.numeri.map(n => [n.et, n.val, n.sub]), [['Rank', '#2', 'ELO 1043'], ['Matches', '71.4%', '5W · 2L'], ['Showdowns', '60%', '3W · 2L'], ['Sets', '66.7%', '10W · 5L']]);
    assert.deepEqual(a.extra, ['Main format: VGC Gen 8 (4W · 1L)', 'League points: 59']);
    assert.deepEqual([a.motto, a.compagno, a.compagnoShiny], ['Vamos', 'Garchomp', true]);
    assert.match(S.testo(a), /^Didi: Rank #2 \(ELO 1043\) · Matches 71\.4%/);
    assert.equal(S.allenatore({}).numeri[0].val, '—');
});

test('nome del file e altezze delle immagini', () => {
    assert.equal(S.nomeFile(S.team({ nome: 'Il Mio Team!' })), 'team-il-mio-team.png');
    assert.equal(S.nomeFile(S.showdown({ player1: 'Didi', player2: 'Lu' })), 'showdown-didi-lu.png');
    assert.deepEqual([S.ALTEZZA.team, S.ALTEZZA.showdown, S.ALTEZZA.replay, S.ALTEZZA.allenatore], [1350, 1080, 920, 1350]);
});

test('cablaggio: Box (card del team), Matches (showdown e replay) e pagina dell\'allenatore hanno il tasto e caricano il modulo', () => {
    const box = leggi('docs', 'box.html');
    assert.match(box, /<script src="scheda-condivisione\.js"><\/script>/);
    assert.match(box, /onclick="event\.stopPropagation\(\); condividiTeam\('\$\{team\.id\}'\)"/);
    assert.match(box, /SchedaCondivisione\.team\(team, \{ giocatore: playerID/);
    const m = leggi('docs', 'matches.html');
    assert.match(m, /<script src="scheda-condivisione\.js"><\/script>/);
    assert.match(m, /onclick="condividiShowdown\(\)"/);
    assert.match(m, /globalThis\.showdownAperto = \{/);
    assert.match(m, /SchedaCondivisione\.showdown\(a\.info, a\.matches/);
    assert.match(m, /data-comando="condividi" id="rcCondividi"/);
    assert.match(m, /SchedaCondivisione\.replay\(sd, \{ set: Number\(set\.dataset\.set\)/);
    assert.match(m, /data-vincitore=/);
    assert.match(leggi('docs', 'public.html'), /<script src="scheda-condivisione\.js"><\/script>\s*<script src="cosmetici\.js"><\/script>\s*<script src="public-card\.js">/);
    assert.match(leggi('docs', 'public-card.js'), /SchedaCondivisione\.allenatore\(\{ nome: dati\.nome/);
    assert.match(leggi('docs', 'app-gioco-pagine.css'), /\.pp-modifica-btn:not\(\.pp-condividi-btn\)/);
});
