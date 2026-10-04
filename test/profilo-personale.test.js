'use strict';
// profilo-personale.js: bilancio contro i rivali e lista di "cosa devo fare" della pagina profilo.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../docs/profilo-personale.js');

// ---------- dati di prova ----------
const match = (p1, p2, s1, s2, extra = {}) => ({
    player1: p1, player1Id: p1.toLowerCase(), player2: p2, player2Id: p2.toLowerCase(),
    p1score: s1, p2score: s2, winnerId: (s1 > s2 ? p1 : p2).toLowerCase(), ...extra
});
const showdown = (p1, p2, categoria, risultati, info = {}) => ({
    info: { player1: p1, player1Id: p1.toLowerCase(), player2: p2, player2Id: p2.toLowerCase(), categoria, ...info },
    matches: Object.fromEntries(risultati.map(([a, b, extra], k) => [`match${k + 1}`, match(p1, p2, a, b, extra)]))
});

const stagioneChiusa = {
    info: { name: 'Beta', status: 'closed' },
    iscritti: { Didi: {}, Lu: {}, Gio: {} },
    showdowns: {
        a: showdown('Didi', 'Lu', 'OU', [[2, 0, { data: '2026-01-01' }], [2, 1, { data: '2026-01-02' }], [0, 2, { data: '2026-01-03' }]], { isCompleted: true }),
        b: showdown('Gio', 'Didi', 'OU', [[2, 1, { data: '2026-01-05' }], [2, 0, { data: '2026-01-06' }], [1, 2, { data: '2026-01-07' }]], { isCompleted: true }),
        c: showdown('Lu', 'Gio', 'OU', [[2, 0], [2, 0], [2, 0]], { isCompleted: true })   // non riguarda Didi
    }
};

test('rivali: match, set e showdown contro ciascun avversario', () => {
    const r = P.rivali('didi', { sbeta: stagioneChiusa });
    assert.deepEqual(r.map(x => x.id).sort(), ['gio', 'lu']);

    const lu = r.find(x => x.id === 'lu');
    assert.equal(lu.nome, 'Lu');
    assert.deepEqual([lu.matchV, lu.matchP], [2, 1]);
    assert.deepEqual([lu.setV, lu.setP], [4, 3]);       // 2-0, 2-1, 0-2
    assert.deepEqual([lu.sdV, lu.sdP, lu.sdInCorso], [1, 0, 0]);
    assert.deepEqual(lu.forma, ['V', 'V', 'P']);

    // Didi è il giocatore 2 nello showdown contro Gio: il verso dei punteggi si ribalta
    const gio = r.find(x => x.id === 'gio');
    assert.deepEqual([gio.matchV, gio.matchP], [1, 2]);
    assert.deepEqual([gio.setV, gio.setP], [1 + 0 + 2, 2 + 2 + 1]);
    assert.deepEqual([gio.sdV, gio.sdP], [0, 1]);
});

test('rivali: i più affrontati per primi, con il bilancio per formato e la data dell\'ultimo match', () => {
    const stagioni = {
        s1: {
            info: { status: 'playing' },
            showdowns: {
                x: showdown('Didi', 'Gio', 'VGC', [[2, 0, { data: '2026-03-01' }]], { isCompleted: false })
            }
        },
        sbeta: stagioneChiusa
    };
    const r = P.rivali('Didi', stagioni);
    assert.deepEqual(r.map(x => x.id), ['gio', 'lu']);   // Gio: 3 + 1 match, Lu: 3
    const gio = r[0];
    assert.deepEqual(gio.formati.OU, { matchV: 1, matchP: 2, sdV: 0, sdP: 1 });
    assert.deepEqual(gio.formati.VGC, { matchV: 1, matchP: 0, sdV: 0, sdP: 0 });
    assert.equal(gio.sdInCorso, 1);
    assert.deepEqual(gio.stagioni, ['s1', 'sbeta']);
    assert.equal(gio.ultimo, Date.parse('2026-03-01'));
    assert.deepEqual(gio.forma, ['P', 'P', 'V', 'V']);
});

test('rivali: la forma tiene solo gli ultimi cinque risultati, in ordine di data', () => {
    const sd = showdown('Didi', 'Lu', 'OU', [], { isCompleted: true });
    const giorni = [[2, 0], [0, 2], [2, 1], [2, 0], [1, 2], [2, 0], [0, 2]];
    giorni.forEach(([a, b], k) => {
        sd.matches[`match${k + 1}`] = match('Didi', 'Lu', a, b, { data: `2026-02-0${k + 1}` });
    });
    const [lu] = P.rivali('didi', { s1: { info: {}, showdowns: { z: sd } } });
    assert.equal(lu.forma.length, P.FORMA_MAX);
    assert.deepEqual(lu.forma, ['V', 'V', 'P', 'V', 'P']);
});

test('rivali: senza winnerId decidono i punteggi; i match pari o incompleti non contano', () => {
    const sd = {
        info: { player1: 'Didi', player2: 'Lu', categoria: 'OU' },
        matches: {
            match1: { p1score: 2, p2score: 0 },
            match2: { p1score: 1, p2score: 2 },
            match3: { p1score: 1, p2score: 1 },   // pari
            match4: { p1score: null, p2score: null }
        }
    };
    const [lu] = P.rivali('didi', { s1: { info: {}, showdowns: { z: sd } } });
    assert.deepEqual([lu.matchV, lu.matchP], [1, 1]);
});

test('rivali: showdown di altri, dati mancanti e nome vuoto non rompono nulla', () => {
    assert.deepEqual(P.rivali('didi', null), []);
    assert.deepEqual(P.rivali('', { s1: stagioneChiusa }), []);
    assert.deepEqual(P.rivali('didi', { s1: { info: {} }, s2: null, s3: { showdowns: { q: null, r: {} } } }), []);
    assert.deepEqual(P.rivali('zeno', { s1: stagioneChiusa }), []);
});

test('showdown: vince chi ha più match, a parità vale il campo salvato', () => {
    const sd = showdown('Didi', 'Lu', 'OU', [[2, 0], [0, 2]]);
    assert.equal(P.vincitoreShowdown(sd), '');
    sd.info.vincitoreShowdown = 'LU';
    assert.equal(P.vincitoreShowdown(sd), 'lu');
    sd.info.vincitoreShowdown = 'qualcun altro';
    assert.equal(P.vincitoreShowdown(sd), '');
    assert.equal(P.vincitoreShowdown(showdown('Didi', 'Lu', 'OU', [[2, 0], [2, 1]])), 'didi');
});

test('riepilogo: totali, il più affrontato, nemesi e preda con soglia minima', () => {
    const rivale = (id, matchV, matchP, setV = 0, setP = 0) =>
        ({ id, nome: id, matchV, matchP, setV, setP, sdV: 0, sdP: 0, sdInCorso: 0 });
    const elenco = [
        rivale('ada', 1, 5),     // nemesi
        rivale('bob', 6, 1),     // preda
        rivale('cy', 3, 3),      // pari: né l'una né l'altra
        rivale('dan', 0, 1),     // un solo match: troppo poco
        rivale('eve', 1, 0)
    ];
    const r = P.riepilogoRivali(elenco);
    assert.equal(r.totali.matchV, 11);
    assert.equal(r.totali.matchP, 10);
    assert.equal(r.totali.avversari, 5);
    assert.equal(r.nemesi.id, 'ada');
    assert.equal(r.preda.id, 'bob');
    assert.equal(r.piuGiocato.id, 'bob');   // 7 match contro i 6 di Ada e Cy

    const vuoto = P.riepilogoRivali([]);
    assert.equal(vuoto.nemesi, null);
    assert.equal(vuoto.preda, null);
    assert.equal(vuoto.piuGiocato, null);
    assert.equal(P.riepilogoRivali(null).totali.avversari, 0);
});

test('riepilogo: con un solo avversario nemesi e preda richiedono almeno due match', () => {
    const r = P.riepilogoRivali([{ id: 'x', nome: 'X', matchV: 1, matchP: 0, setV: 2, setP: 0, sdV: 0, sdP: 0, sdInCorso: 0 }]);
    assert.equal(r.preda, null);
    assert.equal(r.piuGiocato.id, 'x');
});


// ---------- cosa devo fare ----------
const stagioneInCorso = (extra = {}) => ({
    info: {
        name: 'Season 2', status: 'playing', showdowns_per_format: 2,
        selected_formats: { 0: 'OU', 1: 'VGC' }
    },
    iscritti: { Didi: {}, Lu: {}, Gio: {} },
    teams_iscritti: {},
    showdowns: {},
    ...extra
});

test('da fare: showdown ancora da giocare per avversario e formato', () => {
    const s2 = stagioneInCorso({
        showdowns: {
            a: showdown('Didi', 'Lu', 'OU', [[2, 0], [2, 0], [2, 0]], { isCompleted: true })
        }
    });
    const d = P.daFare('didi', { s2 }, {});
    const lu = d.mancanti.find(x => x.avversario === 'lu');
    const gio = d.mancanti.find(x => x.avversario === 'gio');
    assert.deepEqual(lu.formati, [{ formato: 'OU', rimasti: 1, occupato: false }, { formato: 'VGC', rimasti: 2, occupato: false }]);
    assert.equal(lu.totale, 3);
    assert.equal(gio.totale, 4);
    assert.deepEqual(d.mancanti.map(x => x.avversario), ['gio', 'lu']);   // il più indietro per primo
    assert.deepEqual(d.stagioni[0], {
        id: 's2', nome: 'Season 2', stato: 'PLAYING', iscritto: true, scadenza: '',
        richiesti: 8, giocati: 1, inCorso: 0   // (3 iscritti - 1) × 2 formati × 2 showdown
    });
});

test('da fare: una sfida in attesa e uno showdown in corso occupano il formato e contano come fatti', () => {
    const s2 = stagioneInCorso({
        showdowns: { a: showdown('Lu', 'Didi', 'OU', [[2, 1]], { timestamp: '2026-05-01T10:00:00Z' }) }
    });
    const sfide = {
        s2: {
            x1: { da: 'Didi', daId: 'didi', a: 'Lu', aId: 'lu', categoria: 'VGC', stato: 'in_attesa', creata: 5 },
            x2: { da: 'Didi', daId: 'didi', a: 'Lu', aId: 'lu', categoria: 'VGC', stato: 'rifiutata', creata: 6 }
        }
    };
    const d = P.daFare('didi', { s2 }, sfide);
    const lu = d.mancanti.find(x => x.avversario === 'lu');
    // OU: 2 − 1 showdown in corso = 1 (ma è occupato dallo showdown aperto); VGC: 2 − 1 sfida in attesa = 1 (occupato)
    assert.deepEqual(lu.formati, [
        { formato: 'OU', rimasti: 1, occupato: true },
        { formato: 'VGC', rimasti: 1, occupato: true }
    ]);
});

test('da fare: sfide ricevute e inviate, showdown in corso con link al prossimo match', () => {
    const s2 = stagioneInCorso({
        showdowns: {
            a: showdown('Didi', 'Gio', 'OU', [[2, 0], [0, 2]], { timestamp: '2026-05-01T10:00:00Z' }),
            b: showdown('Lu', 'Didi', 'VGC', [[2, 0]], { lastUpdate: '2026-05-03T10:00:00Z' }),
            c: showdown('Lu', 'Gio', 'OU', [[2, 0]])   // non mio
        }
    });
    const sfide = {
        s2: {
            r1: { da: 'Lu', daId: 'lu', a: 'Didi', aId: 'didi', categoria: 'OU', bestOf: 5, stato: 'in_attesa', creata: 10 },
            r2: { da: 'Gio', daId: 'gio', a: 'Didi', aId: 'didi', categoria: 'VGC', stato: 'in_attesa', creata: 20 },
            r3: { da: 'Gio', daId: 'gio', a: 'Didi', aId: 'didi', categoria: 'VGC', stato: 'accettata', creata: 30 },
            i1: { da: 'Didi', daId: 'didi', a: 'Gio', aId: 'gio', categoria: 'VGC', stato: 'in_attesa', creata: 15 },
            altro: { da: 'Lu', daId: 'lu', a: 'Gio', aId: 'gio', categoria: 'OU', stato: 'in_attesa', creata: 1 }
        }
    };
    const d = P.daFare('Didi', { s2 }, sfide);

    assert.deepEqual(d.sfideRicevute.map(x => x.id), ['r2', 'r1']);   // la più recente per prima
    assert.equal(d.sfideRicevute[1].bestOf, 5);
    assert.equal(d.sfideRicevute[0].nome, 'Gio');
    assert.deepEqual(d.sfideInviate.map(x => [x.id, x.avversario]), [['i1', 'gio']]);

    assert.deepEqual(d.inCorso.map(x => x.id), ['b', 'a']);           // aggiornato più di recente per primo
    const a = d.inCorso.find(x => x.id === 'a');
    assert.equal(a.avversario, 'gio');
    assert.equal(a.match, 3);
    assert.equal(a.mioPunteggio, '1 - 1');
    const b = d.inCorso.find(x => x.id === 'b');
    assert.equal(b.avversario, 'lu');
    assert.equal(b.match, 2);
    assert.equal(b.mioPunteggio, '0 - 1');                              // sono il giocatore 2: 2-0 per Lu
    assert.equal(d.stagioni[0].inCorso, 2);
});

test('da fare: stagione aperta, iscrizione e squadre mancanti; nessun conteggio finché non si gioca', () => {
    const aperta = {
        info: { name: 'Season 3', status: 'open', deadline: '2026-12-01T00:00:00Z', showdowns_per_format: 1, selected_formats: ['OU', 'VGC'] },
        iscritti: { Lu: {} },
        teams_iscritti: {}
    };
    let d = P.daFare('didi', { s3: aperta }, {});
    assert.deepEqual(d.iscrizioni, [{ tipo: 'iscriviti', stagione: 's3', nome: 'Season 3', scadenza: '2026-12-01T00:00:00Z' }]);
    assert.equal(d.mancanti.length, 0);
    assert.equal(d.stagioni[0].iscritto, false);

    aperta.iscritti.Didi = {};
    aperta.teams_iscritti = { OU: { didi: { count: 2 } }, VGC: { didi: { count: 0 } } };
    d = P.daFare('didi', { s3: aperta }, {});
    assert.deepEqual(d.iscrizioni, [{ tipo: 'squadre', stagione: 's3', nome: 'Season 3', scadenza: '2026-12-01T00:00:00Z', formati: ['VGC'] }]);
    assert.equal(d.mancanti.length, 0);

    aperta.teams_iscritti.VGC = { didi: { count: 1 } };
    assert.deepEqual(P.daFare('didi', { s3: aperta }, {}).iscrizioni, []);
});

test('da fare: le stagioni chiuse non contano; senza tetto per formato non ci sono showdown "mancanti"', () => {
    const d = P.daFare('didi', { sbeta: stagioneChiusa, s2: stagioneInCorso({ info: { name: 'S2', status: 'playing', selected_formats: ['OU'] } }) }, {});
    assert.deepEqual(d.stagioni.map(s => s.id), ['s2']);
    assert.equal(d.mancanti.length, 0);
    assert.equal(d.stagioni[0].richiesti, 0);
    assert.deepEqual(P.daFare('', { s2: stagioneInCorso() }, {}).stagioni, []);
});

test('da fare: chi non è iscritto non vede sfide, showdown in corso né showdown da giocare', () => {
    const s2 = stagioneInCorso({ iscritti: { Lu: {}, Gio: {} } });
    const d = P.daFare('didi', { s2 }, { s2: { x: { da: 'Lu', daId: 'lu', a: 'Didi', aId: 'didi', categoria: 'OU', stato: 'in_attesa' } } });
    assert.deepEqual([d.sfideRicevute, d.inCorso, d.mancanti], [[], [], []]);
});

test('formato dei dati: iscritti e formati si leggono anche come lista', () => {
    const s2 = stagioneInCorso({ iscritti: ['Didi', 'Lu'] });
    s2.info.selected_formats = ['OU'];
    const d = P.daFare('didi', { s2 }, {});
    assert.equal(d.mancanti.length, 1);
    assert.deepEqual(d.mancanti[0].formati, [{ formato: 'OU', rimasti: 2, occupato: false }]);
    assert.equal(d.stagioni[0].richiesti, 2);
});

test('tempoRimasto: giorni e ore, ore e minuti, minuti; scaduta o assente', () => {
    const t0 = Date.parse('2026-10-02T12:00:00Z');
    assert.equal(P.tempoRimasto('2026-10-05T16:30:00Z', t0), '3d 4h');
    assert.equal(P.tempoRimasto('2026-10-04T12:20:00Z', t0), '2d');
    assert.equal(P.tempoRimasto('2026-10-02T17:12:00Z', t0), '5h 12m');
    assert.equal(P.tempoRimasto('2026-10-02T14:00:00Z', t0), '2h');
    assert.equal(P.tempoRimasto('2026-10-02T12:09:30Z', t0), '9m');
    assert.equal(P.tempoRimasto('2026-10-02T12:00:10Z', t0), '1m');
    assert.equal(P.tempoRimasto('2026-10-01T12:00:00Z', t0), null);
    assert.equal(P.tempoRimasto('', t0), '');
    assert.equal(P.tempoRimasto(undefined, t0), '');
});

test('le regole coincidono con quelle di sfide.js (stessi nomi di campo e stessa formula dei rimasti)', () => {
    const sfide = fs.readFileSync(path.join(__dirname, '../docs/sfide.js'), 'utf8');
    assert.match(sfide, /const MATCH_PER_SHOWDOWN = 3;/);
    assert.match(sfide, /Math\.max\(0, massimo\(D\) - showdownTra\(D, a, b, formato\)\.length - inAttesa\)/);
    assert.match(sfide, /sd\?\.info\?\.isCompleted === true \|\| matchSalvati\(sd\) >= MATCH_PER_SHOWDOWN/);
    assert.equal(P.MATCH_PER_SHOWDOWN, 3);
});


// ---------- la pagina profilo ----------
const docs = nome => fs.readFileSync(path.join(__dirname, '..', 'docs', nome), 'utf8');

test('profile.html: via i vecchi form (ora si cambia tutto dalla Trainer Card), restano password e Achievements', () => {
    const html = docs('profile.html');
    for (const vecchio of ['bio-input', 'select-titoli', 'current-avatar-preview', 'honeycomb-picker', 'pkm-search', 'music-search',
        'salvaModificheProfilo', 'inizializzaAppearance', 'HONEYCOMB_COLORS', 'LISTA_AVATAR', 'popolaSelettoreMusica', 'selezionaPkm']) {
        assert.ok(!html.includes(vecchio), `${vecchio} è ancora in profile.html`);
    }
    for (const resta of ['richiediResetPasswordEmail', 'resetPasswordDalLogin', 'apriModaleAchievements', 'class="ach-open-btn"',
        'id="login-form"', 'id="user-menu"', 'id="admin-menu-item"', 'id="customize-public-link"']) {
        assert.ok(html.includes(resta), `${resta} non c'è più`);
    }
    // il link porta all'editor della Trainer Card di chi è dentro
    assert.match(html, /public\.html\?player=\$\{encodeURIComponent\(playerID\)\}&edit=1/);
    // i due contenitori delle nuove sezioni e i moduli che servono
    assert.match(html, /id="pf-todo-corpo"/);
    assert.match(html, /id="pf-rivali-corpo"/);
    assert.match(html, /<script src="profilo-personale\.js"><\/script>/);
    assert.match(html, /<script src="titoli\.js"><\/script>/);
    assert.match(html, /<script src="sfide\.js"><\/script>/);
});

test('profile.html: il testo che viene dal database entra solo come testo, mai come HTML', () => {
    const html = docs('profile.html');
    const da = html.indexOf('// RIVALI E "COSA DEVO FARE"');
    const a = html.indexOf('// PASSWORD');
    assert.ok(da > 0 && a > da, 'sezione non trovata');
    const nuovo = html.slice(da, a);
    for (const vietato of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
        assert.ok(!nuovo.includes(vietato), `${vietato} nel codice di Rivali / Cosa devo fare`);
    }
    // l'avatar e il colore di un altro giocatore passano da un controllo prima di arrivare agli stili
    assert.match(nuovo, /colorePulito = c => \(\/\^#\[0-9a-f\]\{3,8\}\$\/i\.test/);
    assert.match(nuovo, /avatarPulito = a => PP\.percorsoAvatar\(a, AVATAR_PREDEFINITO\)/);
});

test('profile.html: usa le stesse risposte alle sfide della campanella (sfide.js le espone, non le copia)', () => {
    const html = docs('profile.html');
    const sfide = docs('sfide.js');
    assert.match(sfide, /window\.Sfide = \{ avvia, bottoneRanking, apriSfida, rispondi, completato \}/);
    assert.match(sfide, /function apriSfida\(nome, stagione\)/);
    assert.match(sfide, /const D = stagione \? S\.stagioni\[stagione\] : pagina\(\)/);
    for (const risposta of ['accetta', 'rifiuta', 'ritira']) {
        assert.match(html, new RegExp(`Sfide\\.rispondi\\(s\\.stagione, s\\.id, '${risposta}'\\)`), risposta);
    }
    assert.match(html, /Sfide\.apriSfida\(m\.nome, m\.stagione\)/);
    // rifiuta e ritira solo se la sfida è davvero mia
    assert.match(sfide, /const mia = risposta === 'ritira' \? sf\.daId === S\.ioId : sf\.aId === S\.ioId/);
});

test('style-profile.css: via gli stili dei vecchi form, ci sono quelli delle nuove sezioni', () => {
    const css = docs('style-profile.css');
    for (const vecchio of ['.appearance-grid-container', '.honeycomb', '.custom-music-list', '.avatar-selector-grid', '.save-btn-hub', '#bio-input']) {
        assert.ok(!css.includes(vecchio), `${vecchio} è ancora nel CSS`);
    }
    for (const nuovo of ['.pf-rivale', '.pf-voce', '.pf-contatore', '.pf-tessera', '.ach-open-btn', '.bar-reset-pw-btn', '#login-modal .modal-content']) {
        assert.ok(css.includes(nuovo), `${nuovo} manca`);
    }
});

test('percorsoAvatar: legge sia il percorso relativo sia l\'indirizzo completo che salva l\'editor (il rivale non resta senza avatar)', () => {
    const PP = require('../docs/profilo-personale.js');
    const pre = 'immagini/profile/1.png';
    assert.equal(PP.percorsoAvatar('immagini/profile/5.png', pre), 'immagini/profile/5.png');
    assert.equal(PP.percorsoAvatar('https://didi722.github.io/didi-lu/immagini/profile/42.png', pre), 'immagini/profile/42.png');
    assert.equal(PP.percorsoAvatar('http://localhost:5500/immagini/profile/7.png?v=3#x', pre), 'immagini/profile/7.png');
    assert.equal(PP.percorsoAvatar('immagini/magikarp.png', pre), 'immagini/magikarp.png');
    // quello che non è un'immagine del sito resta l'avatar predefinito
    for (const x of ['', null, undefined, 'javascript:alert(1)', 'https://altro.example/foto.png', 'data:image/png;base64,AAAA', '/etc/passwd']) assert.equal(PP.percorsoAvatar(x, pre), pre, String(x));
});
