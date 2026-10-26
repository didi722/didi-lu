'use strict';
// Play, la pagina dell'app per giocare (docs/practice.html, app-practice.js): ranked (le stagioni), unranked (amichevoli) o contro la CPU.
//   - la parte pura: le stagioni in corso e cosa c'è da fare, i team e gli allenatori da mostrare, gli indirizzi, l'HTML delle schermate;
//   - la pagina: solo nell'app (dal sito da PC si torna alla home), una sola carta Play in home, via dal Box e da Trainers.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../docs/app-comune.js');
const P = require('../docs/app-practice.js');
const docs = f => fs.readFileSync(path.join(__dirname, '..', 'docs', f), 'utf8');

test('elencoTeam: i team del giocatore in ordine di nome, con formato e le specie (al massimo sei); Firebase dà anche oggetti al posto degli array', () => {
    const l = P.elencoTeam({
        b: { nome: 'beta', categoria: 'OU', pokemon: [{ nome: 'Garchomp' }, { nome: '' }, { nome: 'Corviknight' }] },
        a: { nome: 'Alfa', pokemon: { 0: { nome: 'Pikachu' }, 1: { nome: 'a' }, 2: { nome: 'b' }, 3: { nome: 'c' }, 4: { nome: 'd' }, 5: { nome: 'e' }, 6: { nome: 'f' } } },
        c: { pokemon: [] },
        x: null
    });
    assert.deepEqual(l.map(t => t.id), ['a', 'b', 'c']);
    assert.deepEqual(l[0].specie, ['Pikachu', 'a', 'b', 'c', 'd', 'e'], 'sei al massimo');
    assert.deepEqual(l[1], { id: 'b', nome: 'beta', formato: 'OU', specie: ['Garchomp', 'Corviknight'] });
    assert.equal(l[2].nome, 'Team', 'senza nome si chiama Team');
    assert.deepEqual(P.elencoTeam(null), []);
});

test('elencoGiocatori: gli altri allenatori (non tu); prima chi ha un Elo, dal più alto, poi per nome; l\'Elo solo con abbastanza showdown', () => {
    const ind = (sd, r) => ({ stats: { 'individual-stats': { showdownsPlayed: sd, ranking: r } } });
    const l = P.elencoGiocatori({
        didi: { info: { name: 'Didi' }, ...ind(5, 1000) },
        Anna: { info: { name: 'Anna', color: '#ff0000', avatar: 'a.png' }, ...ind(4, 1200.4) },
        zeno: { info: { name: 'Zeno' }, ...ind(1, 1500) },
        bea: { info: { name: 'Bea' } },
        vuoto: null
    }, ' DIDI ');
    assert.deepEqual(l.map(g => g.id), ['anna', 'bea', 'zeno'], 'senza Didi; Anna ha l\'Elo, Bea e Zeno no');
    assert.equal(l[0].elo, 1200);
    assert.equal(l[0].colore, '#ff0000');
    assert.equal(l[2].elo, null, 'un solo showdown: niente Elo');
    assert.deepEqual(P.elencoGiocatori(null, 'x'), []);
});

test('gli indirizzi: contro la CPU col proprio team o con un Random Battle; il nome del formato è ripulito', () => {
    assert.equal(P.indirizzoTeam('t 1&'), 'battle.html?cpu=1&team=t%201%26');
    assert.equal(P.indirizzoRandom({ id: 'gen9randombattle', nome: 'Random Battle (Gen 9)' }), 'battle.html?cpu=1&random=gen9randombattle&nome=Random%20Battle%20(Gen%209)');
    assert.equal(P.indirizzoShowdown('s 2', 'sd1', 2), 'battle.html?stagione=s%202&showdown=sd1&match=2');
    assert.equal(P.indirizzoStagione('s3'), 'matches.html?id=s3');
    assert.deepEqual(P.immaginiDi('ranked'), ['immagini/app/play-ranked.png', 'immagini/app/play-ranked.webp']);
    assert.deepEqual(P.VISTE, ['home', 'ranked', 'cpu', 'amichevole']);
});

test('htmlHome: tre locandine affiancate (ranked, unranked, vs CPU), ognuna col suo tag, il suo colore e lo spazio per l\'immagine; ranked dice com\'è la stagione', () => {
    const h = P.htmlHome();
    assert.equal((h.match(/class="pr-poster /g) || []).length, 3);
    assert.match(h, /pr-p-ranked" data-vista="ranked" data-stagione="" style="--c:#ffbd44[^"]*"[\s\S]*<b class="pr-tag"><span>Ranked<\/span><\/b><small class="pr-sotto-tag">Seasons<\/small>/);
    assert.match(h, /pr-p-unranked" data-vista="amichevole"[\s\S]*<span>Unranked<\/span>/);
    assert.match(h, /pr-p-cpu" data-vista="cpu"[\s\S]*<span>VS CPU<\/span>/);
    for (const id of ['ranked', 'unranked', 'cpu']) assert.match(h, new RegExp(`<img class="pr-img" data-id="${id}" alt="" hidden>`));
    assert.doesNotMatch(h, /pr-bolla/, 'senza stagioni caricate, niente numero');
    const stagione = { nome: 'Season 3', ricevute: [{}], inCorso: [{}, {}], mancanti: [{ formati: [{ occupato: false }] }] };
    const con = P.htmlHome({ ranked: [stagione] });
    assert.match(con, /Season 3 · 4 to do/);
    assert.match(con, /<i class="pr-bolla" aria-label="3 waiting">3<\/i>/, 'sfide ricevute e showdown da riprendere');
});

test('sottoRanked: nessuna stagione, una sola (col suo nome e cosa c\'è da fare), più d\'una', () => {
    const vuota = { nome: 'Season 1', ricevute: [], inCorso: [], mancanti: [] };
    assert.equal(P.sottoRanked([]), 'No season in progress');
    assert.equal(P.sottoRanked(null), 'No season in progress');
    assert.equal(P.sottoRanked([vuota]), 'Season 1');
    assert.equal(P.sottoRanked([vuota, vuota]), '2 seasons in progress');
    assert.equal(P.dafare({ ricevute: [{}], inCorso: [], mancanti: [{ formati: [{ occupato: true }] }, { formati: [{ occupato: true }, { occupato: false }] }] }), 2, 'un giocatore con tutti i formati occupati non è da sfidare');
    assert.equal(P.dafare(null), 0);
});

// ----- le stagioni (ranked) -----

const GIORNO = 86400000;
const ADESSO = Date.UTC(2026, 9, 10);
const stagioniDati = () => ({
    s2: {
        info: { name: 'Season 2', status: 'playing', showdowns_per_format: 2, selected_formats: ['OU', 'VGC'] },
        iscritti: { Didi: {}, Lu: {}, Gio: {} },
        showdowns: {
            sd1: { info: { player1: 'Didi', player2: 'Gio', categoria: 'VGC', isCompleted: true }, matches: { match1: { p1score: 1, p2score: 0, winnerId: 'didi' }, match2: { p1score: 1, p2score: 0, winnerId: 'didi' } } },
            sd2: { info: { player1: 'Lu', player2: 'Didi', categoria: 'OU' }, matches: { match1: { p1score: 0, p2score: 1, winnerId: 'didi' } } }
        }
    },
    s3: { info: { name: 'Season 3', status: 'playing', selected_formats: ['OU'] }, iscritti: { Didi: {}, Ada: {}, Zed: {} }, showdowns: {} }       // senza tetto per formato
});
const sfideDati = () => ({ s2: { x1: { stato: 'in_attesa', da: 'Gio', daId: 'gio', a: 'Didi', aId: 'didi', categoria: 'OU', bestOf: 3, creata: 5 }, x2: { stato: 'in_attesa', da: 'Didi', daId: 'didi', a: 'Lu', aId: 'lu', categoria: 'VGC', bestOf: 3, creata: 6 } }, s3: {} });

test('normalizzaInfo / stagioniInCorso: con le iscrizioni scadute una stagione "open" è già in corso; chiuse, aperte e senza dati restano fuori; gli originali non cambiano', () => {
    const scaduta = { name: 'A', status: 'OPEN', deadline: new Date(ADESSO - GIORNO).toISOString() };
    const aperta = { name: 'B', status: 'open', deadline: new Date(ADESSO + GIORNO).toISOString() };
    assert.equal(P.normalizzaInfo(scaduta, ADESSO).status, 'playing');
    assert.equal(P.normalizzaInfo(aperta, ADESSO).status, 'open');
    assert.equal(P.normalizzaInfo({ name: 'C' }, ADESSO).status, 'open', 'senza stato: aperta');
    assert.equal(scaduta.status, 'OPEN', 'non tocca l\'originale');
    assert.equal(P.normalizzaInfo(null, ADESSO).status, 'open');
    const l = P.stagioniInCorso([{ id: 'sbeta', info: { status: 'closed' } }, { id: 's1', info: scaduta }, { id: 's2', info: aperta }, { id: 's3', info: { status: 'playing' } }, { id: 's4', info: null }, null], ADESSO);
    assert.deepEqual(l.map(x => x.id), ['s1', 's3']);
    assert.deepEqual(P.stagioniInCorso(null), []);
});

test('riepilogoRanked: per ogni stagione in corso, l\'avanzamento e le schede (da sfidare formato per formato, sfide ricevute e inviate, showdown da riprendere); la più recente per prima', () => {
    const r = P.riepilogoRanked('Didi', stagioniDati(), sfideDati(), ADESSO);
    assert.deepEqual(r.map(s => s.id), ['s3', 's2']);
    const s2 = r[1];
    assert.equal(s2.nome, 'Season 2');
    assert.equal(s2.iscritto, true);
    assert.equal(s2.richiesti, 8, '2 avversari × 2 formati × 2 showdown');
    assert.equal(s2.giocati, 1);
    assert.deepEqual(s2.ricevute.map(x => [x.avversario, x.categoria, x.id]), [['gio', 'OU', 'x1']]);
    assert.deepEqual(s2.inviate.map(x => [x.avversario, x.categoria]), [['lu', 'VGC']]);
    assert.deepEqual(s2.inCorso.map(x => [x.avversario, x.categoria, x.match]), [['lu', 'OU', 2]]);
    const gio = s2.mancanti.find(m => m.avversario === 'gio');
    assert.deepEqual(gio.formati, [{ formato: 'OU', rimasti: 1, occupato: true }, { formato: 'VGC', rimasti: 1, occupato: false }], 'OU ha la sfida di Gio in attesa: uno in meno e occupato');
    assert.ok(s2.mancanti.every(m => m.avversario !== 'didi'), 'non sfidi te stesso');
    // senza tetto per formato: si può sfidare chiunque (tutti gli altri iscritti), senza un numero
    const s3 = r[0];
    assert.equal(s3.richiesti, 0);
    assert.deepEqual(s3.mancanti.map(m => m.avversario).sort(), ['ada', 'zed']);
    assert.equal(s3.mancanti[0].formati[0].rimasti, Infinity);
    // chi non è iscritto vede la stagione ma niente da fare
    const fuori = P.riepilogoRanked('ospite', stagioniDati(), sfideDati(), ADESSO);
    assert.equal(fuori[0].iscritto, false);
    assert.deepEqual(fuori.map(s => s.mancanti.length + s.ricevute.length), [0, 0]);
    assert.deepEqual(P.riepilogoRanked('', stagioniDati(), sfideDati()), []);
    assert.deepEqual(P.riepilogoRanked('didi', {}, {}), []);
});

test('htmlRankedStagione: avanzamento, tasto per showdown e classifica, e le schede; ogni scheda ha il suo gesto (sfida, accetta/rifiuta, riprendi, ritira); senza niente da fare lo dice', () => {
    const r = P.riepilogoRanked('didi', stagioniDati(), sfideDati(), ADESSO);
    const h = P.htmlRankedStagione(r[1], { info: id => ({ avatar: 'a-' + id + '.png', color: '#ff0000' }), indietro: { vista: 'home' } });
    assert.match(h, /<h2>Ranked<\/h2><span class="pr-sotto">Season 2<\/span>/);
    assert.match(h, /data-vista="home"[^>]*data-suono="indietro"/, 'il tasto per tornare');
    assert.match(h, /role="progressbar" aria-valuemin="0" aria-valuemax="8" aria-valuenow="1"><i style="width:13%">/);
    assert.match(h, /1 \/ 8 <small>showdowns played<\/small>/);
    assert.match(h, /href="matches\.html\?id=s2"[^>]*>Showdowns &amp; rankings<\/a>/);
    assert.match(h, /pr-s-ricevuta[\s\S]*Challenged you[\s\S]*src="a-gio\.png"[\s\S]*data-risposta="accetta" data-sfida-id="x1" data-stagione="s2"[\s\S]*data-risposta="rifiuta" data-sfida-id="x1"/);
    assert.match(h, /pr-s-inCorso[\s\S]*Match 2 · 1 - 0[\s\S]*href="battle\.html\?stagione=s2&amp;showdown=sd2&amp;match=2"[^>]*>Resume</);
    assert.match(h, /pr-s-mancano[\s\S]*data-sfida-ranked="Gio" data-stagione="s2"[^>]*>Challenge</);
    assert.match(h, /pr-s-inviata[\s\S]*Waiting[\s\S]*data-risposta="ritira" data-sfida-id="x2"/);
    assert.match(h, /--c:#ff0000/, 'il colore del giocatore');
    // una stagione senza tetto: il numero dei giocati senza barra
    const senza = P.htmlRankedStagione(r[0], { info: () => null });
    assert.doesNotMatch(senza, /progressbar/);
    assert.match(senza, /0 <small>showdowns played<\/small>/);
    assert.match(senza, /src="immagini\/magikarp\.png"/, 'senza avatar il Magikarp');
    // non iscritti e tutto fatto
    assert.match(P.htmlRankedStagione({ ...r[0], iscritto: false, mancanti: [] }), /You are not in this season/);
    assert.match(P.htmlRankedStagione({ ...r[0], mancanti: [] }), /You have played everyone/);
    assert.match(P.htmlSchedaRanked('mancano', { avversario: 'x', nome: 'X', formati: [{ formato: 'OU', rimasti: 1, occupato: true }] }, 's', null), /Challenge pending/, 'tutti i formati occupati: niente tasto');
    assert.doesNotThrow(() => P.htmlSchedaRanked('mancano', { avversario: 'x', formati: [] }, 's'));
});

test('htmlFormati: al massimo tre, poi "+n"; "×n" solo con un numero; chi è occupato è spento', () => {
    const h = P.htmlFormati([{ formato: 'OU', rimasti: 2, occupato: false }, { formato: 'VGC', rimasti: Infinity, occupato: true }, { formato: 'A', rimasti: 1 }, { formato: 'B', rimasti: 1 }]);
    assert.match(h, /<i class="pr-fm">OU <b>×2<\/b><\/i><i class="pr-fm pr-fm-su">VGC<\/i>/);
    assert.match(h, /<i class="pr-fm">\+1<\/i>/);
    assert.equal(P.htmlFormati([]), '<span class="pr-formati"></span>');
});

test('htmlRankedScelta / htmlRankedVuoto: più stagioni in corso = una locandina per stagione (giocati nel disco, nome nel tag); nessuna = lo dice e porta alle stagioni', () => {
    const r = P.riepilogoRanked('didi', stagioniDati(), sfideDati(), ADESSO);
    const h = P.htmlRankedScelta(r);
    assert.equal((h.match(/class="pr-poster pr-stagione"/g) || []).length, 2);
    assert.match(h, /data-vista="ranked" data-stagione="s3"[\s\S]*<span>Season 3<\/span>[\s\S]*data-stagione="s2"[\s\S]*1<small>\/8<\/small>[\s\S]*<span>Season 2<\/span>/);
    assert.match(h, /--n:2/);
    assert.match(h, /data-vista="home"/, 'indietro: alla scelta iniziale');
    assert.match(P.htmlRankedVuoto(), /No season is in progress right now[\s\S]*<a href="index\.html">See the seasons<\/a>/);
});

test('htmlCpu: i team come carte con le specie, i Random Battle come chip; senza team lo dice e rimanda al Box', () => {
    const team = [{ id: 't1', nome: 'Il mio <OU>', formato: 'OU', specie: ['Garchomp', 'Rotom'] }];
    const h = P.htmlCpu({ team, random: [{ id: 'gen9randombattle', nome: 'Random Battle' }], dex: s => 'dex/' + s + '.png' });
    assert.match(h, /data-team="t1"/);
    assert.match(h, /<b class="pr-nome">Il mio &lt;OU&gt;<\/b><span class="pr-tag">OU<\/span>/);
    assert.equal((h.match(/class="pr-mini"/g) || []).length, 2);
    assert.match(h, /src="dex\/Garchomp\.png"/);
    assert.match(h, /data-random="gen9randombattle" data-nome="Random Battle"/);
    assert.doesNotMatch(h, /pr-vuoto/);
    const v = P.htmlCpu({ team: [], random: [] });
    assert.match(v, /You have no teams yet\. <a href="box\.html">Build one in the Box<\/a>/);
    assert.doesNotMatch(v, /Random battles/);
    assert.match(v, /data-vista="home"/, 'il tasto per tornare a Practice');
    assert.doesNotThrow(() => P.htmlCpu());
});

test('htmlAmichevole (Unranked): ogni allenatore in piedi sul suo palco tondo, col suo colore, il nome e l\'Elo (N/A senza); niente sfondo; senza nessuno lo dice', () => {
    const h = P.htmlAmichevole({ giocatori: [{ nome: 'Anna', colore: '#ff0000', elo: 1200, avatar: 'a.png' }, { nome: 'Bea <b>', colore: 'x', elo: null }] });
    assert.match(h, /data-sfida="Anna" style="--c:#ff0000"/);
    assert.match(h, /<span class="pr-palco" aria-hidden="true"><span class="pal-aura"><\/span><span class="pal-pedana"><\/span><img class="pr-avatar" draggable="false" src="a\.png"/);
    assert.match(h, /1200 <small>Elo<\/small>/);
    assert.match(h, /data-sfida="Bea &lt;b&gt;" style="--c:#31c489"/);
    assert.match(h, /<span class="pr-elo">N\/A<\/span>/);
    assert.match(h, /src="immagini\/magikarp\.png"/);
    assert.match(P.htmlAmichevole({ giocatori: [] }), /There is nobody to play with yet/);
    assert.match(P.htmlAccedi(), /data-accedi="1"/);
});

test('Practice non scorre in verticale: pagina ferma, i team e i Random Battle scorrono di lato; i Pokémon dei team sono GIF animate', () => {
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /html\.app-shell:has\(body\.pg-practice\), html\.app-shell body\.pg-practice \{ overflow: hidden !important; \}/);
    assert.match(css, /body\.pg-practice \.pr-griglia \{ display: flex; flex-wrap: nowrap;[^}]*overflow-x: auto; overflow-y: hidden;/);
    assert.match(css, /body\.pg-practice \.pr-chips \{ display: flex; flex-wrap: nowrap;[^}]*overflow-x: auto;/);
    assert.match(docs('app-practice.js'), /typeof win\.SpritePkm\.gif === 'function' \? win\.SpritePkm\.gif\(s\)/);
});

test('practice.html: solo nell\'app (dal browser si torna alla home), con Firebase, l\'accesso e gli script delle sfide; gli id che servono ci sono', () => {
    const html = docs('practice.html');
    assert.match(html, /<body class="nb pg-practice senza-ads">/);
    assert.match(html, /<title>Play \| /);
    assert.match(html, /classList\.contains\('app'\)\) location\.replace\('index\.html'\)/);
    for (const id of ['practice', 'login-modal', 'login-form', 'login-email', 'login-password', 'auth-text']) assert.ok(html.includes(`id="${id}"`), id);
    for (const s of ['sfide.js', 'amichevoli.js', 'formato-random.js', 'sprite-pkm.js', 'profilo-personale.js', 'controlli.js']) assert.match(html, new RegExp(`<script src="${s}"></script>`), s);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'id ripetuti');
    assert.deepEqual(require('../docs/app.js').SCRIPT_PAGINE['practice.html'], ['app-practice.js'], 'sprite-pkm.js lo carica la pagina stessa');
});

test('in app non si prova più un team dal Box e non si sfida più dalla scheda di un allenatore: si parte da Play', () => {
    const css = docs('app-gioco-pagine.css');
    assert.match(css, /html\.app-shell :is\(\.azione-cpu, \.tb-prova-cpu\) \{ display: none !important; \}/);
    // le schermate e i ritorni dalla battaglia
    assert.match(docs('battle-ui.js'), /inApp\(\) \? 'practice\.html'/);
    // in home Practice e Matches sono una sola carta, Play
    const voci = require('../docs/app.js').VOCI;
    assert.equal(voci[0].id, 'play');
    assert.deepEqual(voci[0].pagine, ['practice.html', 'matches.html']);
    assert.ok(C.ICONE.play && C.ICONE.matches && C.ICONE.cpu && C.ICONE.amici);
});

test('il foglio: Practice sta sotto html.app-shell, nella sua pagina', () => {
    const css = docs('app-gioco-pagine.css');
    const righe = css.split('\n').filter(r => /\.pr-/.test(r) && /\{/.test(r) && !/^\s+[a-z-]+:/.test(r));
    assert.ok(righe.length >= 20, 'regole trovate: ' + righe.length);
    for (const r of righe) assert.match(r.trim(), /^html\.app-shell /, r.trim().slice(0, 80));
});

test('avvia: fuori dall\'app, o senza la pagina, non fa niente', () => {
    assert.equal(P.avvia({ document: { getElementById: () => null, documentElement: { classList: { contains: () => true } } } }), null);
    assert.equal(P.avvia({ document: { getElementById: () => ({}), documentElement: { classList: { contains: () => false } } } }), null);
});
