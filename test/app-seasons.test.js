'use strict';
// Seasons, la pagina dell'app per le stagioni (docs/seasons.html, app-seasons.js): tre locandine (passate, in corso, iscrizioni aperte); con una stagione sola il tocco
// porta dritto a lei, con più stagioni si sceglie, senza stagioni la locandina è spenta.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Sz = require('../docs/app-seasons.js');
const A = require('../docs/app.js');

const DOCS = path.join(__dirname, '..', 'docs');
const docs = f => fs.readFileSync(path.join(DOCS, f), 'utf8');
const GIORNO = 86400000;
const ADESSO = Date.parse('2026-06-10T12:00:00Z');
const futuro = ms => new Date(ADESSO + ms).toISOString();

const elenco = [
    { id: 'sbeta', info: { status: 'closed', name: 'Beta' } },
    { id: 's0', info: { status: 'closed', name: 'Sant\'Alvise 0', winner: 'Luca' } },
    { id: 's1', info: { status: 'closed', name: 'Sant\'Alvise I' } },
    { id: 's2', info: { status: 'open', name: 'Friuli DOC I', deadline: futuro(2 * GIORNO + 3600000) } },
    { id: 's3', info: { status: 'open', name: 'Scaduta', deadline: futuro(-GIORNO) } },       // iscrizioni scadute: è in corso
    null, { id: 's9', info: null }
];

test('raggruppa: passate, in corso e iscrizioni aperte; la beta non conta se c\'è altro; ordine: iscrizioni dalla scadenza più vicina, le altre dalla più recente', () => {
    const g = Sz.raggruppa(elenco, ADESSO);
    assert.deepEqual(g.past.map(s => s.id), ['s1', 's0']);
    assert.deepEqual(g.playing.map(s => s.id), ['s3'], 'iscrizioni scadute = in corso');
    assert.deepEqual(g.signups.map(s => s.id), ['s2']);
    assert.equal(g.signups[0].nome, 'Friuli DOC I');
    assert.equal(g.signups[0].mancano, 2 * GIORNO + 3600000);
    // solo la beta: si mostra lei
    assert.deepEqual(Sz.raggruppa([{ id: 'sbeta', info: { status: 'closed' } }], ADESSO).past.map(s => s.id), ['sbeta']);
    // più iscrizioni: la più vicina alla scadenza per prima
    const due = Sz.raggruppa([{ id: 's4', info: { status: 'open', deadline: futuro(5 * GIORNO) } }, { id: 's5', info: { status: 'open', deadline: futuro(GIORNO) } }], ADESSO);
    assert.deepEqual(due.signups.map(s => s.id), ['s5', 's4']);
    assert.equal(Sz.nomeStagione({ id: 's7', info: {} }), 'Season 7');
    assert.deepEqual(Sz.raggruppa([], ADESSO), { past: [], playing: [], signups: [] });
});

test('indirizzi: le iscrizioni vanno all\'hub, le altre a showdown e classifica', () => {
    assert.equal(Sz.indirizzo('signups', 's2'), 'hub.html?id=s2');
    assert.equal(Sz.indirizzo('playing', 's3'), 'matches.html?id=s3');
    assert.equal(Sz.indirizzo('past', 's0'), 'matches.html?id=s0');
});

test('la riga sotto il tag: il nome se la stagione è una sola, altrimenti quante sono o che non ce ne sono', () => {
    const uno = [{ nome: 'Friuli DOC I' }], tre = [{}, {}, {}];
    assert.equal(Sz.sottoGruppo('signups', uno), 'Friuli DOC I');
    assert.equal(Sz.sottoGruppo('playing', tre), '3 in progress');
    assert.equal(Sz.sottoGruppo('past', tre), '3 seasons');
    assert.equal(Sz.sottoGruppo('signups', []), 'None open');
    assert.equal(Sz.sottoGruppo('playing', []), 'None right now');
    assert.equal(Sz.sottoGruppo('past', []), 'None yet');
    assert.equal(Sz.sottoStagione('past', { info: { winner: 'Luca' } }), 'Luca won');
    assert.equal(Sz.sottoStagione('past', { info: {} }), 'Season over');
    assert.equal(Sz.sottoStagione('signups', { mancano: 2 * GIORNO + 3600000 }, true), "You're in · Closes in 2d 1h");
    assert.equal(Sz.sottoStagione('playing', {}), 'Showdowns in progress');
});

test('htmlHome: tre locandine nell\'ordine past, playing, sign-ups; una stagione sola = tocco dritto a lei; più stagioni = si sceglie; nessuna = spenta; la bolla conta le iscrizioni da fare', () => {
    const g = Sz.raggruppa(elenco, ADESSO);
    const h = Sz.htmlHome(g, { daIscrivere: 1 });
    assert.deepEqual([...h.matchAll(/class="pr-poster pr-p-(\w+)/g)].map(m => m[1]), ['past', 'playing', 'signups']);
    assert.match(h, /pr-p-past"[^>]*data-vista="past"/, 'due stagioni passate: si sceglie');
    assert.match(h, /pr-p-playing"[^>]*data-vai="matches\.html\?id=s3"/, 'una sola in corso: dritto a lei');
    assert.match(h, /pr-p-signups"[^>]*data-vai="hub\.html\?id=s2"/);
    assert.match(h, /<small class="pr-sotto-tag">Friuli DOC I<\/small>/, 'con una sola, il suo nome');
    assert.match(h, /<i class="pr-bolla" aria-label="1 to join">1<\/i>/);
    // senza stagioni: spente e senza azione
    const vuota = Sz.htmlHome({ past: [], playing: [], signups: [] });
    assert.equal((vuota.match(/ disabled/g) || []).length, 3);
    assert.equal((vuota.match(/pr-vuota/g) || []).length, 3);
    assert.doesNotMatch(vuota, /data-vai|data-vista|pr-bolla/);
    // ogni locandina cerca la sua immagine propria
    for (const id of ['past', 'signups']) assert.match(h, new RegExp(`<img class="pr-img" data-id="${id}" alt="" hidden>`));
    // Playing: solo la riga spezzata e la scritta VS, nessun Pokémon
    assert.match(h, /pr-p-playing[\s\S]*?<span class="pr-arte pr-vs">[\s\S]*?<b class="pr-vs-scritta" aria-hidden="true">VS<\/b>/);
    const playing = h.slice(h.indexOf('pr-p-playing'), h.indexOf('pr-p-signups'));
    assert.doesNotMatch(playing, /<img|\/home\/\d+\.png/, 'nessun Pokémon');
    assert.deepEqual(Sz.immaginiDi('signups'), ['immagini/app/seasons-signups.png', 'immagini/app/seasons-signups.webp']);
});

test('htmlScelta: una locandina per stagione (tasto indietro, nome protetto, dove porta), si scorre di lato', () => {
    const g = Sz.raggruppa(elenco, ADESSO);
    const h = Sz.htmlScelta('past', g.past);
    assert.match(h, /<h2>Past seasons<\/h2><span class="pr-sotto">Pick a season<\/span>/);
    assert.match(h, /class="pr-torna" data-vista="home"/);
    assert.match(h, /data-vai="matches\.html\?id=s1"/);
    assert.match(h, /data-vai="matches\.html\?id=s0"/);
    assert.match(h, /<small class="pr-sotto-tag">Luca won<\/small>/);
    assert.match(h, /class="pr-home pr-home-scorre"/);
    assert.match(Sz.htmlScelta('playing', [{ id: 's8', nome: '<b>x</b>', info: {} }]), /<span>&lt;b&gt;x&lt;\/b&gt;<\/span>/);
    const iscr = Sz.htmlScelta('signups', Sz.raggruppa([{ id: 's4', info: { status: 'open', name: 'A', deadline: futuro(GIORNO) } }], ADESSO).signups, { iscritto: () => true });
    assert.match(iscr, /You&#39;re in · Closes in 1d 0h/);
});

test('seasons.html: solo nell\'app, con Firebase e l\'accesso; la tessera Seasons del menù è la seconda e porta qui, l\'hub resta suo', () => {
    const html = docs('seasons.html');
    assert.match(html, /<body class="nb pg-practice pg-seasons senza-ads">/, 'stesse locandine e stile di Play');
    assert.match(html, /location\.replace\('index\.html'\)/);
    assert.match(html, /<main id="stagioni" class="pr"/);
    for (const id of ['login-modal', 'login-form', 'auth-text']) assert.ok(html.includes(`id="${id}"`), id);
    assert.deepEqual(A.SCRIPT_PAGINE['seasons.html'], ['app-scena.js', 'app-seasons.js']);
    assert.ok(A.FOGLI_SCENA.includes('seasons.html'));
    assert.deepEqual(A.VOCI.map(v => v.id), ['play', 'seasons', 'box', 'trainers', 'stats']);
    assert.equal(A.voceDi('/didi-lu/seasons.html').id, 'seasons');
    assert.equal(A.voceDi('/didi-lu/hub.html').id, 'seasons');
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /body\.pg-seasons \.pr-home-scorre \{ display: flex;[^}]*overflow-x: auto; overflow-y: hidden;/);
    assert.match(css, /body\.pg-seasons \.pr-poster\.pr-vuota \{/);
});
