'use strict';
// pagina-pubblica.js: schema della configurazione della pagina pubblica di un allenatore.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../docs/pagina-pubblica.js');

const ids = config => config.blocchi.map(b => b.id);

test('senza niente nel database si ha la configurazione di partenza', () => {
    for (const vuoto of [undefined, null, 0, 'x', [], true]) assert.deepEqual(P.normalizza(vuoto), P.predefinita());
    assert.deepEqual(P.normalizza({}), P.predefinita());
});

test('la configurazione di partenza ha ogni blocco una volta, tutti accesi, e tutte le statistiche', () => {
    const d = P.predefinita();
    assert.deepEqual(ids(d).sort(), Object.keys(P.BLOCCHI).sort());
    assert.ok(d.blocchi.every(b => b.on && P.ZONE.includes(b.zona)));
    assert.deepEqual(d.statistiche, Object.keys(P.STAT));
    assert.equal(d.team, 'auto');
    // chi legge e chi scrive non devono mai condividere lo stesso oggetto
    d.blocchi[0].on = false;
    assert.equal(P.predefinita().blocchi[0].on, true);
});

test('una configurazione valida passa invariata', () => {
    const c = P.predefinita();
    c.layout = 'collage';
    c.sfondo = { colore: '#ff6b9d', motivo: 'zigzag', forza: 3, scritta: false, animato: true };
    c.carta = { tema: 'scuro', ombra: 16, bordo: 6, angoli: 'tondi', inclinazione: 'forte', font: 'comic', holo: false };
    c.statistiche = ['sd', 'rank'];
    c.team = '-Nabc_123';
    c.adesivi = [{ id: 'wow', x: 10.5, y: 90, s: 1.5, r: -12 }];
    c.blocchi = P.sposta(c, 'party', 'a', 0).blocchi;
    assert.deepEqual(P.normalizza(c), c);
    assert.deepEqual(P.normalizza(JSON.parse(JSON.stringify(c))), c);
});

test('i valori fuori dalle scelte ammesse tornano a quelli di partenza', () => {
    const D = P.predefinita();
    const n = P.normalizza({
        layout: '<img src=x onerror=alert(1)>',
        sfondo: { colore: 'url(javascript:alert(1))', motivo: 'rosso', forza: 9, scritta: 'sì', animato: 1 },
        carta: { tema: 'oro', ombra: 11, bordo: 99, angoli: 'ovali', inclinazione: 'enorme', font: 'comic sans', holo: 'no' },
        team: 'a b"><script>', statistiche: ['nope'], adesivi: [{ id: 'bomba', x: 1, y: 1 }]
    });
    assert.deepEqual(n, D);
});

test('i colori ammessi sono solo esadecimali, anche a tre cifre e con la maiuscola', () => {
    const colore = valore => P.normalizza({ sfondo: { colore: valore } }).sfondo.colore;
    assert.equal(colore('#FF6B9D'), '#ff6b9d');
    assert.equal(colore('#f6d'), '#ff66dd');
    assert.equal(colore('giocatore'), 'giocatore');
    for (const male of ['red', '#ff6b9', '#ff6b9dd', 'rgb(0,0,0)', '#ff6b9d; background:url(x)', '', null, 5, {}]) {
        assert.equal(colore(male), 'giocatore', String(male));
    }
});

test('i blocchi: doppioni e sconosciuti spariscono, i mancanti tornano nella loro zona', () => {
    const n = P.normalizza({
        blocchi: [
            { id: 'party', zona: 'a', on: true },
            { id: 'party', zona: 'b', on: false },       // doppione
            { id: 'inventato', zona: 'a', on: true },
            { id: 'musica', zona: 'z', on: false },      // zona sbagliata: torna la sua
            null, 5, 'palco'
        ]
    });
    assert.deepEqual(ids(n).sort(), Object.keys(P.BLOCCHI).sort());
    assert.deepEqual(n.blocchi.slice(0, 2), [{ id: 'party', zona: 'a', on: true }, { id: 'musica', zona: 'a', on: false }]);
    assert.equal(n.blocchi.find(b => b.id === 'palco').zona, 'a');
    assert.equal(n.blocchi.find(b => b.id === 'identita').zona, 'b');
});

test('Firebase restituisce gli array con buchi come oggetti: si leggono lo stesso', () => {
    const n = P.normalizza({
        statistiche: { 0: 'sd', 2: 'rank' },
        adesivi: { 0: { id: 'stella', x: 5, y: 6 }, 3: { id: 'ko', x: 7, y: 8 } },
        blocchi: { 0: { id: 'party', zona: 'b' }, 1: { id: 'palco', zona: 'c', on: false } }
    });
    assert.deepEqual(n.statistiche, ['sd', 'rank']);
    assert.deepEqual(n.adesivi.map(a => a.id), ['stella', 'ko']);
    assert.deepEqual(n.blocchi.slice(0, 2), [{ id: 'party', zona: 'b', on: true }, { id: 'palco', zona: 'c', on: false }]);
});

test('gli adesivi: al massimo 12, posizioni e misure dentro i limiti, un numero alla volta', () => {
    const molti = Array.from({ length: 30 }, () => ({ id: 'stella', x: 50, y: 50 }));
    assert.equal(P.normalizza({ adesivi: molti }).adesivi.length, P.MAX_ADESIVI);
    const [a] = P.normalizza({ adesivi: [{ id: 'gg', x: -40, y: 400, s: 0, r: 999 }] }).adesivi;
    assert.deepEqual(a, { id: 'gg', x: 0, y: 100, s: 0.6, r: 45 });
    const [b] = P.normalizza({ adesivi: [{ id: 'gg', x: '12', y: NaN, s: Infinity, r: null }] }).adesivi;
    assert.deepEqual(b, { id: 'gg', x: 50, y: 50, s: 1, r: 0 });
});

test('il team in evidenza è "auto" o una chiave di Firebase', () => {
    assert.equal(P.normalizza({ team: '-OabC_d-1' }).team, '-OabC_d-1');
    for (const male of ['', 'x'.repeat(65), 'a/b', 'a.b', '$x', 5, null]) assert.equal(P.normalizza({ team: male }).team, 'auto');
});

test('sposta: cambia zona e posizione senza toccare l\'originale', () => {
    const d = P.predefinita();
    const per = c => Object.fromEntries(P.ZONE.map(z => [z, P.blocchiPerZona(c)[z].map(b => b.id)]));
    assert.deepEqual(per(d), { a: ['palco', 'musica'], b: ['identita', 'statistiche'], c: ['party', 'trofei', 'medaglie'] });

    assert.deepEqual(per(P.sposta(d, 'party', 'a', 0)), { a: ['party', 'palco', 'musica'], b: ['identita', 'statistiche'], c: ['trofei', 'medaglie'] });
    assert.deepEqual(per(P.sposta(d, 'party', 'a', 1)).a, ['palco', 'party', 'musica']);
    assert.deepEqual(per(P.sposta(d, 'party', 'a', 99)).a, ['palco', 'musica', 'party']);
    // dentro la stessa zona
    assert.deepEqual(per(P.sposta(d, 'medaglie', 'c', 0)).c, ['medaglie', 'party', 'trofei']);
    assert.deepEqual(per(P.sposta(d, 'party', 'c', 2)).c, ['trofei', 'medaglie', 'party']);
    // verso una zona rimasta vuota
    let v = d;
    for (const id of ['palco', 'musica']) v = P.sposta(v, id, 'b', 99);
    assert.deepEqual(per(v).a, []);
    assert.deepEqual(per(P.sposta(v, 'party', 'a', 0)).a, ['party']);
    // niente di strano con dati sbagliati
    assert.deepEqual(P.sposta(d, 'inventato', 'a', 0), d);
    assert.deepEqual(P.sposta(d, 'party', 'x', 0), d);
    assert.deepEqual(per(d), { a: ['palco', 'musica'], b: ['identita', 'statistiche'], c: ['party', 'trofei', 'medaglie'] });
    // tutti i blocchi restano, una volta sola
    assert.deepEqual(ids(P.sposta(d, 'party', 'a', 1)).sort(), Object.keys(P.BLOCCHI).sort());
});

test('accendi e spegni un blocco', () => {
    const d = P.predefinita();
    const spenta = P.accendi(d, 'musica', false);
    assert.equal(spenta.blocchi.find(b => b.id === 'musica').on, false);
    assert.equal(d.blocchi.find(b => b.id === 'musica').on, true);
    assert.equal(P.accendi(spenta, 'musica', true).blocchi.find(b => b.id === 'musica').on, true);
});

test('colori: luminanza, inchiostro e mescolanza', () => {
    assert.equal(P.inchiostroSu('#ffffff'), '#000000');
    assert.equal(P.inchiostroSu('#ffde4d'), '#000000');
    assert.equal(P.inchiostroSu('#17171c'), '#ffffff');
    assert.equal(P.inchiostroSu('#0055ff'), '#ffffff');
    assert.equal(P.mescola('#000000', 1), '#ffffff');
    assert.equal(P.mescola('#ffffff', -1), '#000000');
    assert.equal(P.mescola('#808080', 0), '#808080');
});

test('lo sfondo: ogni motivo dà un colore e un\'immagine; "nessuno" non disegna niente', () => {
    for (const motivo of Object.keys(P.MOTIVI)) {
        const s = P.sfondoCss({ colore: 'giocatore', motivo, forza: 2 }, '#31c489');
        assert.equal(s.colore, '#31c489');
        assert.equal(s.immagine === 'none', motivo === 'nessuno', motivo);
        assert.ok(Number.isInteger(s.periodo) && s.periodo >= 0, motivo);
        assert.doesNotMatch(s.immagine, /undefined|NaN/, motivo);
    }
    // i motivi che si ripetono dichiarano ogni quanto: serve a farli scorrere
    assert.equal(P.sfondoCss({ colore: 'giocatore', motivo: 'punti', forza: 1 }, '#31c489').periodo, 24);
    assert.equal(P.sfondoCss({ colore: 'giocatore', motivo: 'raggi', forza: 1 }, '#31c489').periodo, 0);
    // il colore è quello dell'allenatore, oppure quello scelto
    assert.equal(P.sfondoCss({ colore: '#ff6b9d', motivo: 'punti', forza: 2 }, '#31c489').colore, '#ff6b9d');
    assert.equal(P.sfondoCss({ colore: 'giocatore', motivo: 'punti', forza: 2 }, 'boh').colore, '#31c489');
});

test('lo sfondo: il motivo è scuro su fondo chiaro e chiaro su fondo scuro', () => {
    assert.match(P.sfondoCss({ colore: '#ffffff', motivo: 'punti', forza: 2 }, '#000').immagine, /rgba\(0,0,0,/);
    assert.match(P.sfondoCss({ colore: '#17171c', motivo: 'punti', forza: 2 }, '#000').immagine, /rgba\(255,255,255,/);
    // più forza, più opaco
    const a = forza => Number(/rgba\(0,0,0,([\d.]+)\)/.exec(P.sfondoCss({ colore: '#ffffff', motivo: 'punti', forza }, '#000').immagine)[1]);
    assert.ok(a(1) < a(2) && a(2) < a(3));
});

test('le variabili CSS non contengono mai niente che non sia nelle liste ammesse', () => {
    const v = P.variabiliCss(P.normalizza({ carta: { tema: 'colore', ombra: 16, bordo: 6, angoli: 'tondi', inclinazione: 'forte', font: 'mono' } }), '#31C489');
    assert.equal(v['--pp-sup'], '#31c489');
    assert.equal(v['--pp-bordo'], '6px');
    assert.equal(v['--pp-ombra'], '16px');
    assert.equal(v['--pp-raggio'], '20px');
    assert.equal(v['--pp-inclina'], '-2.2deg');
    assert.match(v['--pp-font'], /Space Mono/);
    for (const [nome, valore] of Object.entries(v)) assert.match(nome, /^--pp-[a-z0-9-]+$/);
    assert.equal(P.variabiliCss(P.predefinita(), '#31c489')['--pp-ink'], '#000000');
    assert.equal(P.variabiliCss(P.normalizza({ carta: { tema: 'scuro' } }), '#31c489')['--pp-ink'], '#ffffff');
});

test('il codice a barre dipende solo dal nome', () => {
    const a = P.codiceBarre('didi');
    assert.deepEqual(a, P.codiceBarre('didi'));
    assert.notDeepEqual(a, P.codiceBarre('tom'));
    assert.equal(a.length, 36);
    assert.equal(P.codiceBarre('x', 10).length, 10);
    assert.ok(a.every(n => Number.isInteger(n) && n >= 1 && n <= 4));
});

test('il numero di tessera è la posizione in ordine alfabetico', () => {
    assert.equal(P.numeroTessera('didi', ['tom', 'didi', 'anna']), '002');
    assert.equal(P.numeroTessera('Anna', ['tom', 'didi', 'anna']), '001');
    assert.equal(P.numeroTessera('zed', ['tom', 'didi']), '003');   // non ancora nell'elenco
    assert.equal(P.numeroTessera('solo', []), '001');
});

test('a sorpresa: una configurazione valida che non tocca blocchi, statistiche e team', () => {
    const base = P.normalizza({ team: 'abc', statistiche: ['sd', 'rank'] });
    base.blocchi = P.accendi(base, 'musica', false).blocchi;
    let n = 0;
    const finto = () => { n += 1; return ((n * 0.6180339887) % 1); };
    for (let i = 0; i < 50; i++) {
        const c = P.casuale(base, finto);
        assert.deepEqual(P.normalizza(c), c);
        assert.deepEqual(c.blocchi, base.blocchi);
        assert.deepEqual(c.statistiche, ['sd', 'rank']);
        assert.equal(c.team, 'abc');
        assert.ok(c.adesivi.length >= 3 && c.adesivi.length <= 6);
        assert.notEqual(c.sfondo.motivo, 'nessuno');
    }
    // con numeri estremi non esce nulla di non valido
    for (const x of [0, 0.999999]) assert.deepEqual(P.normalizza(P.casuale(base, () => x)), P.casuale(base, () => x));
});

// ---- Statistiche ----------------------------------------------------------------------------

const giocatore = (ranking, sdGiocati, extra = {}) => ({ stats: { 'individual-stats': { ranking, showdownsPlayed: sdGiocati, ...extra } } });

test('statistiche: posizione in classifica solo con almeno 3 showdown, per ELO decrescente', () => {
    const tutti = {
        didi: giocatore(1032, 9, { showdownsWon: 6, won: 21, lost: 7, setW: 44, setL: 19, points: 58, format: { 'format-name': 'VGC Reg G', 'format-showdownsWon': 4, 'format-showdownsLost': 1 } }),
        tom: giocatore(1100, 5),
        anna: giocatore(2000, 2),          // pochi showdown: fuori classifica, anche se l'ELO è altissimo
        zed: giocatore(900, 3)
    };
    const d = P.riepilogoStat('didi', tutti);
    assert.deepEqual(d.rank, { grande: '#2', piccolo: 'ELO 1032', pct: null, clic: true });
    assert.equal(P.riepilogoStat('tom', tutti).rank.grande, '#1');
    assert.equal(P.riepilogoStat('zed', tutti).rank.grande, '#3');
    assert.deepEqual(P.riepilogoStat('anna', tutti).rank, { grande: 'Unranked', piccolo: '2/3 showdowns', pct: null, clic: true });
});

test('statistiche: percentuali, vinte e perse, formato migliore', () => {
    const tutti = { didi: giocatore(1032, 9, { showdownsWon: 6, won: 21, lost: 7, setW: 44, setL: 19, points: 58, format: { 'format-name': 'VGC Reg G', 'format-showdownsWon': 4, 'format-showdownsLost': 1 } }) };
    const d = P.riepilogoStat('didi', tutti);
    assert.deepEqual(d.sd, { grande: '66.7%', piccolo: '6W · 3L', pct: 66.7, clic: false });
    assert.deepEqual(d.match, { grande: '75.0%', piccolo: '21W · 7L', pct: 75, clic: false });
    assert.deepEqual(d.set, { grande: '69.8%', piccolo: '44W · 19L', pct: 69.8, clic: false });
    assert.deepEqual(d.punti, { grande: '58', piccolo: 'league points', pct: null, clic: false });
    assert.deepEqual(d.formato, { grande: 'VGC Reg G', piccolo: '4W · 1L', pct: 80, clic: false });
});

test('statistiche: senza partite niente percentuali inventate', () => {
    for (const vuoto of [{}, null, undefined, { tom: {} }]) {
        const d = P.riepilogoStat('didi', vuoto);
        assert.equal(d.sd.grande, '—');
        assert.equal(d.sd.pct, null);
        assert.equal(d.match.piccolo, '0W · 0L');
        assert.equal(d.rank.grande, 'Unranked');
        assert.equal(d.rank.piccolo, '0/3 showdowns');
        assert.deepEqual(d.formato, { grande: '—', piccolo: 'no format yet', pct: null, clic: false });
        assert.equal(d.punti.grande, '0');
    }
    // il formato "-" scritto dal server vuol dire nessun formato
    const d = P.riepilogoStat('didi', { didi: giocatore(1000, 0, { format: { 'format-name': '-' } }) });
    assert.equal(d.formato.grande, '—');
});

test('statistiche: la chiave si trova anche con un\'altra maiuscola, e ELO mancante vale 1000', () => {
    const tutti = { Didi: giocatore(undefined, 4, { showdownsWon: 1 }) };
    const d = P.riepilogoStat('didi', tutti);
    assert.equal(d.rank.grande, '#1');
    assert.equal(d.rank.piccolo, 'ELO 1000');
    // più showdown vinti che giocati (dati sporchi): le perse non vanno sotto zero
    assert.equal(P.riepilogoStat('x', { x: giocatore(1000, 2, { showdownsWon: 5 }) }).sd.piccolo, '5W · 0L');
});

test('il nome sulla carta è bianco quando la carta ha già il colore dell\'allenatore', () => {
    assert.equal(P.variabiliCss(P.normalizza({ carta: { tema: 'colore' } }), '#31c489')['--pp-nome'], '#ffffff');
    assert.equal(P.variabiliCss(P.normalizza({ carta: { tema: 'bianco' } }), '#31c489')['--pp-nome'], '#31c489');
});

// ---- Il palco: allenatore e Pokémon in scala ------------------------------------------------

test('palco: un Pokémon normale ha la sua altezza vera, in scala con l\'allenatore di 1,70 m', () => {
    // 1,7 m come l'allenatore: alto uguale; 2,2 m: più alto di lui
    assert.deepEqual(P.scalaScena(1.7), { allenatore: 170, pokemon: 170, scala: 1, compresso: false });
    assert.deepEqual(P.scalaScena(2.2), { allenatore: 170, pokemon: 220, scala: 1, compresso: false });
});

test('palco: i piccoli si ingrandiscono come prima, ma mai sotto il minimo', () => {
    assert.equal(P.scalaScena(0.59).pokemon, Math.round(0.59 * 100 * 1.6));  // < 0,6 m: x1,6
    assert.equal(P.scalaScena(1.0).pokemon, Math.round(1.0 * 100 * 1.35));   // < 1,3 m: x1,35
    assert.equal(P.scalaScena(0.4).pokemon, P.SCENA.POKEMON_MIN);            // 40 x 1,6 = 64: sotto il minimo
    assert.equal(P.scalaScena(0.1).pokemon, P.SCENA.POKEMON_MIN);
    assert.equal(P.scalaScena(0.1).allenatore, 170);
});

test('palco: le correzioni su misura (Kyogre, Wailord, Charizard) restano quelle di prima', () => {
    assert.equal(P.scalaScena(4.5, { regola: 'rimpicciolisci' }).pokemon, 225);   // 450 / 2
    assert.equal(P.scalaScena(1.7, { regola: 'ingrandisci' }).pokemon, 255);      // 170 x 1,5: sta giusto giusto
});

test('palco: se un Pokémon è troppo grande si rimpicciolisce tutta la scena, allenatore compreso, e la proporzione resta vera', () => {
    // 4 m = 400 pixel di progetto: il palco ne concede 255, quindi tutto in scala 255/400
    const s = P.scalaScena(4);
    assert.equal(s.pokemon, 255);
    assert.equal(s.compresso, false);
    assert.ok(s.allenatore < 170, 'l\'allenatore deve rimpicciolirsi');
    assert.ok(Math.abs(s.pokemon / s.allenatore - 400 / 170) < 0.03, `rapporto ${s.pokemon / s.allenatore}`);
});

test('palco: chi vola ha meno spazio sopra, perché è sollevato da terra', () => {
    const terra = P.scalaScena(4), aria = P.scalaScena(4, { vola: true });
    assert.equal(aria.pokemon, P.SCENA.POKEMON_MAX_IN_VOLO);
    assert.ok(aria.pokemon < terra.pokemon && aria.allenatore <= terra.allenatore);
});

test('palco: un gigante assurdo non fa sparire l\'allenatore: al 55% si ferma e la proporzione si comprime', () => {
    const s = P.scalaScena(14.5, { regola: 'rimpicciolisci' });   // Wailord
    assert.equal(s.allenatore, Math.round(170 * P.SCENA.ALLENATORE_MIN));
    assert.equal(s.pokemon, P.SCENA.POKEMON_MAX);
    assert.equal(s.compresso, true);
    assert.equal(P.scalaScena(70, { vola: true }).pokemon, P.SCENA.POKEMON_MAX_IN_VOLO);
});

test('palco: mai fuori dal palco, e più è grande il Pokémon più è piccolo (o uguale) l\'allenatore', () => {
    let prima = Infinity;
    for (const m of [0.1, 0.5, 1, 1.7, 2.5, 4, 6, 10, 20, 100]) {
        for (const vola of [false, true]) {
            const s = P.scalaScena(m, { vola });
            assert.ok(s.pokemon <= (vola ? P.SCENA.POKEMON_MAX_IN_VOLO : P.SCENA.POKEMON_MAX), `${m} m`);
            assert.ok(s.allenatore >= Math.round(170 * P.SCENA.ALLENATORE_MIN) && s.allenatore <= 170);
        }
        const a = P.scalaScena(m).allenatore;
        assert.ok(a <= prima, `${m} m`);
        prima = a;
    }
    // dati mancanti: una taglia media
    assert.deepEqual(P.scalaScena(undefined), P.scalaScena(1.2));
    assert.deepEqual(P.scalaScena('boh'), P.scalaScena(1.2));
});

// ---- Scelte che non si possono condividere ---------------------------------------------------

const altri = {
    didi: { info: { color: '#31C489', avatar: 'https://sito.test/immagini/profile/3.png', pkmPreferito: 'Calyrex-Shadow', musicName: 'Tema', musicaPreferita: 'https://m.test/a.mp3' } },
    tom: { info: { color: '#ff7b6b', avatar: 'immagini/profile/7.png', pkmPreferito: 'pikachu', musicName: 'Route 1', musicaPreferita: 'https://m.test/b.mp3' } },
    anna: { info: { name: 'Anna' } },
    zed: {}
};

test('unici: l\'avatar si confronta sulle ultime due parti del percorso, qualunque sia il dominio', () => {
    assert.equal(P.chiaveAvatar('https://sito.test/immagini/profile/3.png?v=2#x'), 'profile/3.png');
    assert.equal(P.chiaveAvatar('immagini/profile/3.PNG'), 'profile/3.png');
    assert.equal(P.chiaveAvatar(''), '');
    assert.equal(P.chiaveAvatar(null), '');
});

test('unici: quello che hanno scelto gli altri non conta se è il tuo', () => {
    const presi = P.scelteDegliAltri('didi', altri);
    assert.deepEqual([...presi.colori], ['#FF7B6B']);
    assert.deepEqual([...presi.avatar], ['profile/7.png']);
    assert.deepEqual([...presi.pokemon], ['pikachu']);
    assert.deepEqual([...presi.canzoniUrl], ['https://m.test/b.mp3']);
    assert.deepEqual([...presi.canzoniNomi], ['route 1']);
    // la chiave si trova anche con un'altra maiuscola, e dati mancanti non rompono niente
    assert.deepEqual([...P.scelteDegliAltri('DIDI', altri).colori], ['#FF7B6B']);
    for (const male of [null, undefined, 5, []]) assert.equal(P.scelteDegliAltri('didi', male).colori.size, 0);
});

test('unici: i conflitti (colore, avatar, Pokémon, canzone) con maiuscole e domini diversi', () => {
    assert.deepEqual(P.conflitti('didi', { color: '#FF7B6B' }, altri), ['color']);
    assert.deepEqual(P.conflitti('didi', { color: '#ff7b6b' }, altri), ['color']);
    assert.deepEqual(P.conflitti('didi', { avatar: 'https://altro.test/x/immagini/profile/7.png' }, altri), ['avatar']);
    assert.deepEqual(P.conflitti('didi', { pkmPreferito: 'Pikachu' }, altri), ['pkmPreferito']);
    assert.deepEqual(P.conflitti('didi', { musicaPreferita: 'https://m.test/b.mp3' }, altri), ['musica']);
    assert.deepEqual(P.conflitti('didi', { musicName: ' route 1 ' }, altri), ['musica']);       // stesso nome, altro file
    assert.deepEqual(P.conflitti('didi', { color: '#FF7B6B', pkmPreferito: 'pikachu' }, altri), ['color', 'pkmPreferito']);
    // il proprio valore o uno libero non è un conflitto; vuoto neppure
    assert.deepEqual(P.conflitti('didi', { color: '#31C489', pkmPreferito: 'Calyrex-Shadow', musicName: 'Tema' }, altri), []);
    assert.deepEqual(P.conflitti('didi', { color: '#123456', avatar: 'immagini/profile/9.png', musicName: '', musicaPreferita: '' }, altri), []);
    assert.deepEqual(P.conflitti('tom', { color: '#31c489' }, altri), ['color']);
});

test('avatar disponibili: da 1 a 292 senza i due che mancano', () => {
    const a = P.elencoAvatar();
    assert.equal(a.length, 290);
    assert.ok(a.includes('1.png') && a.includes('292.png'));
    assert.ok(!a.includes('162.png') && !a.includes('168.png'));
    const fs = require('node:fs'), path = require('node:path');
    for (const f of a) assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'immagini', 'profile', f)), `manca ${f}`);
});

test('la playlist (CSV) si legge anche con le virgole tra virgolette e con le righe vuote', () => {
    const csv = 'Nome,Url\r\n"Boss, Finale",https://a.test/1.mp3\r\nRoute 1,https://a.test/2.mp3\r\n,https://x\r\nSenza url,\r\n"Con ""virgolette""",https://a.test/3.mp3\r\n';
    assert.deepEqual(P.leggiCsvCanzoni(csv), [
        { nome: 'Boss, Finale', url: 'https://a.test/1.mp3' },
        { nome: 'Route 1', url: 'https://a.test/2.mp3' },
        { nome: 'Con "virgolette"', url: 'https://a.test/3.mp3' }
    ]);
    assert.deepEqual(P.leggiCsvCanzoni(''), []);
    assert.deepEqual(P.leggiCsvCanzoni(null), []);
});

// ---- Colori e caratteri -----------------------------------------------------------------------

test('colori: la palette del profilo c\'è tutta, nello stesso ordine, e gli extra non la duplicano', () => {
    // I 40 colori che i giocatori hanno già scelto (prima stavano in profile.html, ora si scelgono dall'editor
    // della Trainer Card): cambiarli o spostarli cambierebbe il colore di qualcuno.
    const colori = [
        '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAFFF0', '#BAE1FF', '#D6CAFF', '#E8CAFF',
        '#FFCAFF', '#FFC2D1', '#C25959', '#D48C5F', '#D9B462', '#8F9E6C', '#699E98', '#6B93B0',
        '#7A89A8', '#9582A3', '#B07D9A', '#C7889B', '#FF3333', '#FF8800', '#FFDD00', '#33CC66',
        '#00BFA5', '#3399FF', '#0055FF', '#7A29FF', '#D11A7A', '#FF4D8D', '#FF1744', '#FF5E00',
        '#FFEA00', '#00FF66', '#00FFCC', '#00F0FF', '#0066FF', '#7B00FF', '#CC00FF', '#FF0099'
    ];
    assert.equal(colori.length, 40);
    assert.equal(new Set(colori).size, 40);
    assert.deepEqual(P.PALETTE_PROFILO.map(c => c.toUpperCase()), colori);

    const tutti = P.PALETTE_SFONDO.map(c => c.toLowerCase());
    assert.equal(new Set(tutti).size, tutti.length, 'colori doppi');
    for (const c of tutti) assert.match(c, /^#[0-9a-f]{6}$/);
    assert.deepEqual(P.PALETTE_FIRMA, [...P.PALETTE_PROFILO, ...P.PALETTE_EXTRA]);
    assert.ok(P.PALETTE_SFONDO.length > P.PALETTE_PROFILO.length + 16);
    // il colore firma non ha i neutri (bianco, nero...): sono solo per sfondi e carte
    for (const n of P.PALETTE_NEUTRI) assert.ok(!P.PALETTE_FIRMA.map(c => c.toLowerCase()).includes(n.toLowerCase()), n);
});

test('caratteri: ognuno ha nome, pila e larghezza, e la pagina li scarica tutti da Google Fonts', () => {
    const fs = require('node:fs'), path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'docs', 'public.html'), 'utf8');
    const link = /fonts\.googleapis\.com\/css2\?([^"]+)"/.exec(html)[1];
    assert.ok(Object.keys(P.FONT).length >= 12, 'servono più caratteri');
    for (const [id, f] of Object.entries(P.FONT)) {
        assert.ok(f.nome && f.pila.includes(f.nome) && f.larghezza >= 0.7 && f.larghezza <= 2, id);
        assert.ok(link.includes(`family=${f.nome.replace(/ /g, '+')}`), `${f.nome} non è nel link dei font`);
    }
    // la larghezza arriva agli stili
    assert.equal(P.variabiliCss(P.normalizza({ carta: { font: 'pixel' } }), '#31c489')['--pp-font-w'], String(P.FONT.pixel.larghezza));
});

test('il colore della carta può essere un tema o un colore qualunque della palette', () => {
    assert.equal(P.normalizza({ carta: { tema: '#FF3333' } }).carta.tema, '#ff3333');
    assert.equal(P.normalizza({ carta: { tema: 'giallo' } }).carta.tema, 'giallo');
    assert.equal(P.normalizza({ carta: { tema: 'red' } }).carta.tema, 'bianco');
    assert.equal(P.normalizza({ carta: { tema: 'url(x)' } }).carta.tema, 'bianco');
    const v = P.variabiliCss(P.normalizza({ carta: { tema: '#17171c' } }), '#31c489');
    assert.equal(v['--pp-sup'], '#17171c');
    assert.equal(v['--pp-ink'], '#ffffff');
});

test('a sorpresa: anche con colori e caratteri nuovi la configurazione resta valida, senza scroll possibile da layout', () => {
    // un generatore di numeri a caso ripetibile (mulberry32)
    let seme = 12345;
    const finto = () => { seme = (seme + 0x6D2B79F5) | 0; let t = Math.imul(seme ^ (seme >>> 15), 1 | seme); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const visti = new Set(), caratteri = new Set(), temi = new Set();
    for (let i = 0; i < 300; i++) {
        const c = P.casuale(P.predefinita(), finto);
        assert.deepEqual(P.normalizza(c), c);
        visti.add(c.layout); caratteri.add(c.carta.font); temi.add(c.carta.tema);
    }
    assert.equal(visti.size, Object.keys(P.LAYOUT).length);
    assert.ok(caratteri.size >= 8, `pochi caratteri: ${caratteri.size}`);
    assert.ok([...temi].some(t => t.startsWith('#')), 'mai un colore della palette');
});
