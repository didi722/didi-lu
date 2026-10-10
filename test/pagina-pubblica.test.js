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

test('la configurazione di partenza ha ogni blocco una volta, tutti accesi (tranne quelli che partono spenti), e tutte le statistiche', () => {
    const d = P.predefinita();
    assert.deepEqual(ids(d).sort(), Object.keys(P.BLOCCHI).sort());
    assert.ok(d.blocchi.every(b => P.ZONE.includes(b.zona)));
    // le pagine già salvate non cambiano: il blocco Personality c'è ma parte spento, finché l'allenatore non lo accende
    assert.deepEqual(P.BLOCCHI_SPENTI, ['personalita']);
    assert.deepEqual(d.blocchi.filter(b => !b.on).map(b => b.id), P.BLOCCHI_SPENTI);
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
    assert.deepEqual(per(d), { a: ['palco', 'musica'], b: ['identita', 'statistiche'], c: ['party', 'trofei', 'medaglie', 'personalita'] });

    assert.deepEqual(per(P.sposta(d, 'party', 'a', 0)), { a: ['party', 'palco', 'musica'], b: ['identita', 'statistiche'], c: ['trofei', 'medaglie', 'personalita'] });
    assert.deepEqual(per(P.sposta(d, 'party', 'a', 1)).a, ['palco', 'party', 'musica']);
    assert.deepEqual(per(P.sposta(d, 'party', 'a', 99)).a, ['palco', 'musica', 'party']);
    // dentro la stessa zona
    assert.deepEqual(per(P.sposta(d, 'medaglie', 'c', 0)).c, ['medaglie', 'party', 'trofei', 'personalita']);
    assert.deepEqual(per(P.sposta(d, 'party', 'c', 2)).c, ['trofei', 'medaglie', 'party', 'personalita']);
    // verso una zona rimasta vuota
    let v = d;
    for (const id of ['palco', 'musica']) v = P.sposta(v, id, 'b', 99);
    assert.deepEqual(per(v).a, []);
    assert.deepEqual(per(P.sposta(v, 'party', 'a', 0)).a, ['party']);
    // niente di strano con dati sbagliati
    assert.deepEqual(P.sposta(d, 'inventato', 'a', 0), d);
    assert.deepEqual(P.sposta(d, 'party', 'x', 0), d);
    assert.deepEqual(per(d), { a: ['palco', 'musica'], b: ['identita', 'statistiche'], c: ['party', 'trofei', 'medaglie', 'personalita'] });
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


// ---- Misure: griglia dei layout, ridimensionamento, palco sempre il più grande -------------------

const TUTTI = Object.keys(P.BLOCCHI);
const conZone = (layout, zone) => {
    const c = P.impostaLayout(P.predefinita(), layout);
    c.blocchi = TUTTI.map((id, i) => ({ id, zona: zone[i], on: true }));
    return c;
};

test('layout: ci sono quelli di prima e due nuovi, ognuno con la sua geometria e i nomi delle zone', () => {
    assert.deepEqual(Object.keys(P.LAYOUT), ['carta', 'poster', 'dossier', 'collage', 'cinema', 'podio']);
    for (const [id, l] of Object.entries(P.LAYOUT)) {
        assert.deepEqual(Object.keys(l.zone), ['a', 'b', 'c'], id);
        const G = P.GEOMETRIA[id];
        assert.ok(G, `${id} non ha la geometria`);
        assert.equal(G.colonne.length, G.aree[0].length, id);
        assert.equal(G.righe.length, G.aree.length, id);
        assert.deepEqual([...new Set(G.aree.flat())].sort(), ['a', 'b', 'c'], `${id}: ogni zona deve comparire`);
        assert.deepEqual(Object.keys(G.dir).sort(), ['a', 'b', 'c']);
        for (const p of [...G.colonne, ...G.righe]) assert.ok(p >= P.PESO_MIN && p <= P.PESO_MAX, id);
    }
});

test('misure: qualunque cosa nel database diventa pesi validi, e valgono solo per il layout in uso', () => {
    const base = P.normalizza({});
    assert.deepEqual(base.misure, { colonne: null, righe: null, blocchi: {} });
    assert.deepEqual(P.normalizza({ layout: 'carta', misure: { colonne: [8, 4], righe: [3, 1], blocchi: { palco: 9, party: 2 } } }).misure,
        { colonne: [8, 4], righe: [3, 1], blocchi: { palco: 9, party: 2 } });
    // numero sbagliato di colonne per il layout (poster ne ha una): niente
    assert.equal(P.normalizza({ layout: 'poster', misure: { colonne: [8, 4], righe: [3, 1, 1] } }).misure.colonne, null);
    assert.deepEqual(P.normalizza({ layout: 'poster', misure: { righe: [3, 1, 1] } }).misure.righe, [3, 1, 1]);
    // fuori intervallo: si porta ai limiti; non numeri, testo, id sconosciuti: via
    const sporco = P.normalizza({ layout: 'carta', misure: { colonne: [0, 99], righe: [1, 'x'], blocchi: { palco: -3, party: 'molto', evil: 5, __proto__: { x: 1 } } } }).misure;
    assert.deepEqual(sporco.colonne, [P.PESO_MIN, P.PESO_MAX]);
    assert.equal(sporco.righe, null);
    assert.deepEqual(sporco.blocchi, { palco: P.PESO_MIN });
    for (const brutto of [null, 7, 'x', [], [1, 2]]) assert.deepEqual(P.normalizza({ misure: brutto }).misure, base.misure);
    // un array di Firebase con indici mancanti è un oggetto
    assert.deepEqual(P.normalizza({ layout: 'carta', misure: { colonne: { 0: 6, 1: 6 } } }).misure.colonne, [6, 6]);
    // cambiare layout azzera le misure; lasciare lo stesso no
    const mie = P.normalizza({ layout: 'carta', misure: { colonne: [8, 4], righe: null, blocchi: { palco: 9 } } });
    assert.deepEqual(P.impostaLayout(mie, 'poster').misure, base.misure);
    assert.equal(P.impostaLayout(mie, 'poster').layout, 'poster');
    assert.deepEqual(P.impostaLayout(mie, 'carta'), mie);
    assert.deepEqual(P.impostaLayout(mie, 'inesistente'), mie);
    assert.deepEqual(P.azzeraMisure(mie).misure, base.misure);
    // la configurazione di partenza non ha misure da salvare
    assert.ok(P.uguali(P.normalizza(P.predefinita()), P.predefinita()));
    assert.ok(P.uguali(P.normalizza(JSON.parse(JSON.stringify(mie))), mie));
});

test('spostare un blocco in un\'altra zona gli toglie il peso scelto (era relativo agli altri della vecchia zona)', () => {
    let c = P.predefinita();
    c.misure.blocchi = { party: 9, palco: 7 };
    const dopo = P.sposta(c, 'party', 'b', 0);
    assert.deepEqual(dopo.misure.blocchi, { palco: 7 });
    assert.deepEqual(P.sposta(c, 'party', 'c', 0).misure.blocchi, { party: 9, palco: 7 });   // stessa zona: resta
});

test('griglia: i layout standard hanno il palco molto più grande di ogni altro blocco', () => {
    for (const layout of Object.keys(P.LAYOUT)) {
        const g = P.griglia(P.impostaLayout(P.predefinita(), layout), TUTTI);
        assert.equal(g.ingrandito, false, `${layout}: i pesi di partenza bastano`);
        assert.ok(g.palcoOk);
        const altri = Object.entries(g.area).filter(([id]) => id !== 'palco').map(([, a]) => a);
        assert.ok(g.area.palco >= Math.max(...altri) * P.MARGINE_PALCO, `${layout}: palco ${g.area.palco}, altro ${Math.max(...altri)}`);
        // tutta la tela è assegnata: le quote dei blocchi fanno 1
        assert.ok(Math.abs(Object.values(g.area).reduce((s, x) => s + x, 0) - 1) < 1e-9, layout);
    }
});

test('griglia: zone vuote spariscono e una zona vicina prende il loro posto, sempre con zone rettangolari', () => {
    const sottoinsiemi = [['a'], ['b'], ['c'], ['a', 'b'], ['a', 'c'], ['b', 'c'], ['a', 'b', 'c']];
    for (const layout of Object.keys(P.LAYOUT)) for (const zone of sottoinsiemi) {
        const c = P.impostaLayout(P.predefinita(), layout);
        c.blocchi = [{ id: 'palco', zona: zone[0], on: true }, ...zone.slice(1).map((z, i) => ({ id: ['musica', 'identita'][i], zona: z, on: true }))];
        const g = P.griglia(c, c.blocchi.map(b => b.id));
        const nome = `${layout} ${zone.join('')}`;
        assert.ok(g.aree.length > 0 && g.aree.every(r => r.length === g.aree[0].length), nome);
        assert.ok(g.aree.flat().every(Boolean), `${nome}: celle vuote rimaste`);
        assert.deepEqual([...new Set(g.aree.flat())].sort(), [...zone].sort(), nome);
        assert.equal(g.colonne.length, g.aree[0].length);
        assert.equal(g.righe.length, g.aree.length);
        for (const [z, p] of Object.entries(g.zone)) {
            const celle = g.aree.flatMap((r, ri) => r.map((x, ci) => (x === z ? [ri, ci] : null)).filter(Boolean));
            assert.equal(celle.length, (p.r1 - p.r0 + 1) * (p.c1 - p.c0 + 1), `${nome}: zona ${z} non rettangolare`);
        }
    }
    // carta senza il pannello sinistro: il destro prende tutta la larghezza
    const c = conZone('carta', ['b', 'b', 'b', 'b', 'c', 'c', 'c', 'c']);
    assert.deepEqual(P.griglia(c, TUTTI).aree, [['b', 'b'], ['c', 'c']]);
    // dossier senza la fascia sotto: la colonna principale si allunga
    assert.deepEqual(P.griglia(conZone('dossier', ['a', 'a', 'b', 'b', 'b', 'b', 'b', 'b']), TUTTI).aree, [['a', 'b'], ['a', 'b']]);
    // cinema senza banner: due colonne a tutta altezza
    assert.deepEqual(P.griglia(conZone('cinema', ['b', 'b', 'b', 'b', 'c', 'c', 'c', 'c']), TUTTI).aree, [['b', 'c']]);
    // le colonne tolte non lasciano i loro pesi: la mappa dice a quale originale corrisponde
    const g = P.griglia(conZone('podio', ['a', 'a', 'c', 'c', 'c', 'c', 'c', 'c']), TUTTI);
    assert.deepEqual(g.aree, [['a', 'c']]);
    assert.deepEqual(g.idxColonne, [1, 2]);
    assert.deepEqual(g.colonne, [5, 3]);
});

test('griglia: i pesi scelti si usano, e i blocchi spenti o vuoti non contano', () => {
    const c = P.predefinita();
    c.misure = { colonne: [4, 8], righe: [2, 2], blocchi: { palco: 20, musica: 5 } };
    const g = P.griglia(c, TUTTI, { garantisciPalco: false });
    assert.deepEqual(g.colonne, [4, 8]);
    assert.deepEqual(g.righe, [2, 2]);
    assert.equal(g.blocchi.palco, 20);
    assert.equal(g.blocchi.musica, 5);
    assert.equal(g.blocchi.party, P.PESO_BLOCCO.party);
    const senzaMusica = P.griglia(c, TUTTI.filter(id => id !== 'musica'), { garantisciPalco: false });
    assert.equal(senzaMusica.blocchi.musica, undefined);
    assert.equal(senzaMusica.area.palco > g.area.palco, true);
    // con i pesi scelti il palco (pannello stretto da 4 su 12) non sarebbe il più grande: la griglia normale lo ingrandisce
    assert.equal(g.palcoOk, false);
    const garantita = P.griglia(c, TUTTI);
    assert.equal(garantita.ingrandito, true);
    assert.ok(garantita.colonne[0] > 4);
    assert.deepEqual(P.griglia(c, []).aree, []);
});

test('palco: in qualunque zona lo si metta, e con qualunque combinazione di blocchi spenti, resta il più grande', () => {
    // tutte le 3^8 assegnazioni dei blocchi alle zone, in ogni layout
    let provate = 0, ingranditi = 0;
    for (const layout of Object.keys(P.LAYOUT)) {
        for (let n = 0; n < 3 ** TUTTI.length; n++) {
            const zone = TUTTI.map((_, i) => 'abc'[Math.floor(n / 3 ** i) % 3]);
            const g = P.griglia(conZone(layout, zone), TUTTI);
            provate++;
            if (g.ingrandito) ingranditi++;
            const altri = Object.entries(g.area).filter(([id]) => id !== 'palco').map(([, a]) => a);
            assert.ok(g.area.palco >= Math.max(...altri) * P.MARGINE_PALCO - 1e-9, `${layout} ${zone.join('')}: palco ${g.area.palco.toFixed(3)} contro ${Math.max(...altri).toFixed(3)}`);
        }
    }
    assert.equal(provate, 6 * 3 ** TUTTI.length);
    assert.ok(ingranditi > 0 && ingranditi < provate, 'in certe disposizioni il palco va ingrandito, in altre no');

    // a caso: blocchi in vista, pesi scelti dall'utente e zone, con un generatore con seme
    let seme = 12345;
    const rnd = () => ((seme = (seme * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 4000; i++) {
        const layout = Object.keys(P.LAYOUT)[Math.floor(rnd() * 6)];
        const c = conZone(layout, TUTTI.map(() => 'abc'[Math.floor(rnd() * 3)]));
        const G = P.GEOMETRIA[layout];
        c.misure = {
            colonne: rnd() < 0.5 ? G.colonne.map(() => P.PESO_MIN + rnd() * 11) : null,
            righe: rnd() < 0.5 ? G.righe.map(() => P.PESO_MIN + rnd() * 11) : null,
            blocchi: Object.fromEntries(TUTTI.filter(() => rnd() < 0.5).map(id => [id, P.PESO_MIN + rnd() * 11]))
        };
        const visibili = TUTTI.filter(id => id === 'palco' || rnd() < 0.7);
        const g = P.griglia(P.normalizza(c), visibili);
        const altri = Object.entries(g.area).filter(([id]) => id !== 'palco').map(([, a]) => a);
        assert.ok(!altri.length || g.area.palco >= Math.max(...altri) * P.MARGINE_PALCO - 1e-9, `caso ${i} (${layout})`);
    }
    // senza il palco in vista non c'è niente da garantire
    const senza = P.griglia(P.predefinita(), TUTTI.filter(id => id !== 'palco'));
    assert.equal(senza.palcoOk, true);
    assert.equal(senza.ingrandito, false);
});

test('palco ingrandito: lo si vede dalla griglia, e senza garanzia i pesi restano quelli scelti', () => {
    const c = conZone('poster', ['b', 'c', 'a', 'a', 'a', 'a', 'a', 'a']);   // palco in b, musica in c: due righe da 1,1
    const con = P.griglia(c, TUTTI);
    const senza = P.griglia(c, TUTTI, { garantisciPalco: false });
    assert.equal(senza.ingrandito, false);
    assert.deepEqual(senza.righe, P.GEOMETRIA.poster.righe);
    assert.equal(senza.blocchi.palco, P.PESO_BLOCCO.palco);
    assert.equal(con.ingrandito, true);
    assert.ok(con.area.palco > senza.area.palco);
    // l'ingrandimento non modifica la configurazione data
    assert.deepEqual(c.misure, { colonne: null, righe: null, blocchi: {} });
});

test('muoviConfine: i due si dividono lo spazio, la somma dei pesi non cambia, i minimi si rispettano', () => {
    const r = P.muoviConfine({ px: [600, 400], pesi: [6, 4], minimi: [100, 100] }, 100);
    assert.equal(Math.round(r.delta), 100);
    assert.deepEqual(r.pesi, [7, 3]);
    assert.equal(r.pesi[0] + r.pesi[1], 10);
    // verso sinistra
    assert.deepEqual(P.muoviConfine({ px: [600, 400], pesi: [6, 4], minimi: [100, 100] }, -300).pesi, [3, 7]);
    // si ferma al minimo del più piccolo
    const fermo = P.muoviConfine({ px: [600, 400], pesi: [6, 4], minimi: [100, 250] }, 500);
    assert.equal(Math.round(fermo.delta), 150);
    assert.deepEqual(fermo.pesi, [7.5, 2.5]);
    const fermo2 = P.muoviConfine({ px: [600, 400], pesi: [6, 4], minimi: [450, 100] }, -500);
    assert.equal(Math.round(fermo2.delta), -150);
    assert.deepEqual(fermo2.pesi, [4.5, 5.5]);
    // già sotto il minimo (finestra stretta): non si muove
    assert.equal(P.muoviConfine({ px: [200, 200], pesi: [1, 1], minimi: [300, 300] }, 50).delta, 0);
    assert.deepEqual(P.muoviConfine({ px: [200, 200], pesi: [1, 1], minimi: [300, 300] }, 50).pesi, [1, 1]);
    // i pesi non scendono sotto il minimo né salgono sopra il massimo
    const estremo = P.muoviConfine({ px: [1000, 10], pesi: [11.9, 0.3], minimi: [0, 0] }, -2000);
    assert.ok(estremo.pesi[0] >= P.PESO_MIN && estremo.pesi[1] <= P.PESO_MAX);
    for (const p of [[0, 0], [NaN, 5]]) assert.deepEqual(P.muoviConfine({ px: p, pesi: [1, 1] }, 10).pesi, [1, 1]);
});

test('i minimi dei blocchi coincidono con quelli dello stile (min-width a schermo intero, e min-height del palco)', () => {
    const fs = require('node:fs'), path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '..', 'docs', 'style-public-card.css'), 'utf8');
    for (const [id, [w, h]] of Object.entries(P.MINIMI)) {
        assert.match(css, new RegExp(`body\\.pp-fisso :is\\(\\.pp-zona, \\.pp-linea\\) > \\.pp-${id}\\s*\\{[^}]*min-width:\\s*${w}px`), `${id}: larghezza ${w}`);
        if (id === 'palco') assert.match(css, new RegExp(`body\\.pp-fisso :is\\(\\.pp-zona, \\.pp-linea\\) > \\.pp-palco\\s*\\{[^}]*min-height:\\s*${h}px`), `${id}: altezza ${h}`);
    }
    assert.deepEqual(Object.keys(P.MINIMI).sort(), Object.keys(P.BLOCCHI).sort());
});

test('impostaPesi e ripristinaPesi: cambiano solo i due elementi al confine, e si torna ai pesi di partenza', () => {
    const c = P.predefinita();
    const g = P.griglia(c, TUTTI);
    // confine tra le due colonne della Trainer Card
    const largo = P.impostaPesi(c, g, 'colonne', 0, [8, 4]);
    assert.deepEqual(largo.misure, { colonne: [8, 4], righe: null, blocchi: {} });
    assert.deepEqual(P.ripristinaPesi(largo, g, 'colonne', 0).misure.colonne, null);
    // confine tra la griglia e la fascia sotto
    assert.deepEqual(P.impostaPesi(c, g, 'righe', 0, [3.5, 0.8]).misure.righe, [3.5, 0.8]);
    // due blocchi vicini della stessa zona
    const bl = P.impostaPesi(c, g, 'blocchi', ['palco', 'musica'], [6.5, 0.7]);
    assert.deepEqual(bl.misure.blocchi, { palco: 6.5, musica: 0.7 });
    assert.deepEqual(P.ripristinaPesi(bl, g, 'blocchi', ['palco', 'musica']).misure.blocchi, {});
    // la configurazione data non cambia
    assert.deepEqual(c.misure, { colonne: null, righe: null, blocchi: {} });
    // con una colonna tolta (zona vuota) i pesi vanno alle colonne giuste della geometria originale
    const podio = conZone('podio', ['a', 'a', 'c', 'c', 'c', 'c', 'c', 'c']);
    const gp = P.griglia(podio, TUTTI);
    assert.deepEqual(gp.idxColonne, [1, 2]);
    assert.deepEqual(P.impostaPesi(podio, gp, 'colonne', 0, [6, 2]).misure.colonne, [3, 6, 2]);
    // un peso fuori limite viene riportato dentro
    assert.deepEqual(P.impostaPesi(c, g, 'colonne', 0, [50, 0.01]).misure.colonne, [P.PESO_MAX, P.PESO_MIN]);
    // tornare a mano ai pesi di partenza di tutte le tracce lascia di nuovo "niente di scelto"
    const meta = P.impostaPesi(P.impostaPesi(c, g, 'colonne', 0, [8, 4]), g, 'righe', 0, [3, 1]);
    const dopo = P.ripristinaPesi(meta, g, 'colonne', 0);
    assert.equal(dopo.misure.colonne, null);
    assert.deepEqual(dopo.misure.righe, [3, 1]);
});

test('inclinazione: la carta parte dritta; la vecchia inclinazione di partenza (versione 1) torna dritta, una scelta nuova resta', () => {
    assert.equal(P.VERSIONE, 2);
    assert.equal(P.predefinita().carta.inclinazione, 'nessuna');
    assert.equal(P.predefinita().v, 2);
    // salvata con la versione 1 (o senza versione) con "lieve": era il valore di partenza, non una scelta
    assert.equal(P.normalizza({ v: 1, carta: { inclinazione: 'lieve' } }).carta.inclinazione, 'nessuna');
    assert.equal(P.normalizza({ carta: { inclinazione: 'lieve' } }).carta.inclinazione, 'nessuna');
    // "forte" non era il valore di partenza: era una scelta, e resta
    assert.equal(P.normalizza({ v: 1, carta: { inclinazione: 'forte' } }).carta.inclinazione, 'forte');
    // dalla versione 2 "lieve" è una scelta vera
    assert.equal(P.normalizza({ v: 2, carta: { inclinazione: 'lieve' } }).carta.inclinazione, 'lieve');
    // rileggendo una pagina già normalizzata non cambia niente
    const scelta = P.normalizza({ v: 2, carta: { inclinazione: 'lieve' } });
    assert.deepEqual(P.normalizza(scelta), scelta);
    assert.equal(scelta.v, 2);
});


// ---- Blocchi affiancati: più blocchi sulla stessa riga di una zona ----------------------------

const ordine = (c, zona) => c.blocchi.filter(b => b.zona === zona).map(b => b.id + (b.accanto ? '+' : ''));

test('accanto: si salva solo quando è vero, e la configurazione di partenza non ne ha', () => {
    assert.ok(P.predefinita().blocchi.every(b => !('accanto' in b)));
    const c = P.normalizza({ blocchi: [{ id: 'trofei', zona: 'c', on: true, accanto: true }, { id: 'medaglie', zona: 'c', accanto: false }, { id: 'party', zona: 'c', accanto: 'si' }] });
    assert.equal(c.blocchi.find(b => b.id === 'trofei').accanto, true);
    assert.ok(!('accanto' in c.blocchi.find(b => b.id === 'medaglie')));
    assert.ok(!('accanto' in c.blocchi.find(b => b.id === 'party')));
    assert.ok(P.uguali(P.normalizza(P.predefinita()), P.predefinita()));
    assert.ok(P.uguali(P.normalizza(c), c));
});

test('lineeDiZona: i blocchi con "accanto" stanno sulla riga del precedente; i blocchi spenti non spostano gli altri', () => {
    let c = P.predefinita();           // a: palco musica | b: identita statistiche | c: party trofei medaglie personalita
    assert.deepEqual(P.lineeDiZona(c), { a: [['palco'], ['musica']], b: [['identita'], ['statistiche']], c: [['party'], ['trofei'], ['medaglie'], ['personalita']] });
    c = P.affianca(c, 'medaglie', true);
    assert.deepEqual(P.lineeDiZona(c).c, [['party'], ['trofei', 'medaglie'], ['personalita']]);
    c = P.affianca(c, 'trofei', true);
    assert.deepEqual(P.lineeDiZona(c).c, [['party', 'trofei', 'medaglie'], ['personalita']]);
    // il primo di una zona non può essere affiancato a niente
    assert.deepEqual(ordine(P.affianca(P.predefinita(), 'palco', true), 'a'), ['palco', 'musica']);
    // togliere "accanto" a uno in mezzo spezza la riga: lui apre una riga nuova e il successivo lo segue
    assert.deepEqual(P.lineeDiZona(P.affianca(c, 'trofei', false)).c, [['party'], ['trofei', 'medaglie'], ['personalita']]);
    // con i blocchi in vista: uno spento sparisce dalla sua riga, una riga vuota sparisce
    const vis = ['palco', 'musica', 'identita', 'statistiche', 'party', 'medaglie'];
    assert.deepEqual(P.lineeDiZona(P.affianca(P.affianca(P.predefinita(), 'medaglie', true), 'trofei', true), vis).c, [['party', 'medaglie']]);
    // se il blocco che apriva la riga è spento, quelli accanto non passano alla riga prima
    const c2 = P.affianca(P.predefinita(), 'medaglie', true);          // c: party | trofei+medaglie
    assert.deepEqual(P.lineeDiZona(c2, ['palco', 'musica', 'identita', 'statistiche', 'party', 'medaglie']).c, [['party'], ['medaglie']]);
    assert.equal(P.affianca(P.predefinita(), 'inesistente', true).blocchi.length, Object.keys(P.BLOCCHI).length);
});

test('sposta con accanto: su una riga nuova, accanto al precedente, accanto al successivo (in testa), o in mezzo a una riga', () => {
    const base = P.predefinita();      // c: party trofei medaglie
    // false: riga tutta sua (come prima)
    assert.deepEqual(ordine(P.sposta(base, 'musica', 'c', 1), 'c'), ['party', 'musica', 'trofei', 'medaglie', 'personalita']);
    // true: sulla riga di party
    assert.deepEqual(ordine(P.sposta(base, 'musica', 'c', 1, true), 'c'), ['party', 'musica+', 'trofei', 'medaglie', 'personalita']);
    assert.deepEqual(P.lineeDiZona(P.sposta(base, 'musica', 'c', 1, true)).c, [['party', 'musica'], ['trofei'], ['medaglie'], ['personalita']]);
    // 'testa': prima di trofei, sulla sua riga (trofei diventa il secondo)
    const testa = P.sposta(base, 'musica', 'c', 1, 'testa');
    assert.deepEqual(ordine(testa, 'c'), ['party', 'musica', 'trofei+', 'medaglie', 'personalita']);
    assert.deepEqual(P.lineeDiZona(testa).c, [['party'], ['musica', 'trofei'], ['medaglie'], ['personalita']]);
    // in cima a una zona non c'è un precedente: "accanto" diventa una riga sua
    assert.deepEqual(P.lineeDiZona(P.sposta(base, 'musica', 'c', 0, true)).c, [['musica'], ['party'], ['trofei'], ['medaglie'], ['personalita']]);
    // in mezzo a una riga già fatta la divide
    const riga = P.affianca(P.affianca(base, 'trofei', true), 'medaglie', true);      // party+trofei+medaglie
    assert.deepEqual(P.lineeDiZona(P.sposta(riga, 'musica', 'c', 2)).c, [['party', 'trofei'], ['musica'], ['medaglie'], ['personalita']]);
    // ... mentre accanto la allunga
    assert.deepEqual(P.lineeDiZona(P.sposta(riga, 'musica', 'c', 2, true)).c, [['party', 'trofei', 'musica', 'medaglie'], ['personalita']]);
    // portare via il blocco che apriva la riga: il successivo la apre lui
    assert.deepEqual(P.lineeDiZona(P.sposta(P.affianca(base, 'trofei', true), 'party', 'a', 0)).c, [['trofei'], ['medaglie'], ['personalita']]);
    // spostare un blocco accanto fa sparire il suo vecchio "accanto"
    const spostato = P.sposta(P.affianca(base, 'trofei', true), 'trofei', 'b', 0);
    assert.ok(!('accanto' in spostato.blocchi.find(b => b.id === 'trofei')));
    // zona non valida o blocco sconosciuto: niente
    assert.deepEqual(P.sposta(base, 'party', 'z', 0, true), base);
    assert.deepEqual(P.sposta(base, 'nessuno', 'a', 0, true), base);
    // la configurazione data non cambia
    assert.ok(!base.blocchi.some(b => 'accanto' in b));
});

test('griglia con righe di blocchi: la riga pesa quanto il suo blocco più pesante e i blocchi dividono la larghezza della riga', () => {
    // zona a: palco | trofei + medaglie sulla stessa riga
    let c = P.impostaLayout(P.predefinita(), 'dossier');
    c.blocchi = [{ id: 'palco', zona: 'a', on: true }, { id: 'trofei', zona: 'a', on: true }, { id: 'medaglie', zona: 'a', on: true, accanto: true },
        { id: 'identita', zona: 'b', on: true }, { id: 'statistiche', zona: 'b', on: true }, { id: 'party', zona: 'c', on: true }, { id: 'musica', zona: 'c', on: true }];
    const g = P.griglia(c, ['palco', 'trofei', 'medaglie', 'identita', 'statistiche', 'party', 'musica'], { garantisciPalco: false });
    assert.deepEqual(g.zone.a.linee, [['palco'], ['trofei', 'medaglie']]);
    // la riga di trofei e medaglie pesa 1,4 (il maggiore dei due) contro i 6 del palco: 1,4 / 7,4 dell'altezza della zona
    const zona = g.area.palco + g.area.trofei + g.area.medaglie;
    assert.ok(Math.abs(g.area.palco / zona - 6 / 7.4) < 1e-9, 'il palco');
    assert.ok(Math.abs(g.area.trofei / zona - 0.7 / 7.4) < 1e-9, 'metà della riga ciascuno');
    assert.ok(Math.abs(g.area.trofei - g.area.medaglie) < 1e-12);
    assert.ok(Math.abs(Object.values(g.area).reduce((s, x) => s + x, 0) - 1) < 1e-9, 'tutta la tela è assegnata');
    // affiancati occupano la metà di quando stanno uno sotto l'altro, e il palco ne guadagna
    const sotto = P.griglia(P.affianca(c, 'medaglie', false), ['palco', 'trofei', 'medaglie', 'identita', 'statistiche', 'party', 'musica'], { garantisciPalco: false });
    assert.ok(g.area.palco > sotto.area.palco);
    assert.ok(Math.abs(g.area.trofei * 2 - sotto.area.trofei) < 1e-9 || g.area.trofei < sotto.area.trofei);
});

test('impostaPesi e ripristinaPesi su due righe di blocchi: ogni blocco della riga cresce dello stesso fattore', () => {
    let c = P.predefinita();
    c = P.affianca(c, 'medaglie', true);         // c: party | trofei+medaglie
    const vis = Object.keys(P.BLOCCHI);
    const g = P.griglia(c, vis);
    assert.deepEqual(g.zone.c.linee, [['party'], ['trofei', 'medaglie'], ['personalita']]);
    // la riga di party (5) cede alla riga di trofei+medaglie (1,4): 4 e 2,4
    const nuova = P.impostaPesi(c, g, 'linee', ['c', 0], [4, 2.4]);
    assert.equal(nuova.misure.blocchi.party, 4);
    assert.ok(Math.abs(nuova.misure.blocchi.trofei - 2.4) < 1e-9 && Math.abs(nuova.misure.blocchi.medaglie - 2.4) < 1e-9);
    // la proporzione dentro la riga resta (trofei 1,4 e medaglie 1,4 -> uguali)
    const g2 = P.griglia(P.impostaPesi(c, g, 'linee', ['c', 0], [4, 2.4]), vis, { garantisciPalco: false });
    assert.ok(Math.abs(g2.area.trofei - g2.area.medaglie) < 1e-12);
    // se i due pesi dentro la riga sono diversi, il rapporto si conserva
    let diversi = P.copia(c); diversi.misure.blocchi = { trofei: 1, medaglie: 3 };
    const gd = P.griglia(diversi, vis, { garantisciPalco: false });
    const dopo = P.impostaPesi(diversi, gd, 'linee', ['c', 0], [2.5, 6]);           // la riga pesava 3, ora 6: fattore 2
    assert.deepEqual([dopo.misure.blocchi.trofei, dopo.misure.blocchi.medaglie], [2, 6]);
    // ripristinare toglie i pesi di tutti i blocchi delle due righe
    assert.deepEqual(P.ripristinaPesi(nuova, g, 'linee', ['c', 0]).misure.blocchi, {});
});

test('palco: resta il blocco più grande anche con righe affiancate a caso', () => {
    let seme = 20260702;
    const rnd = () => ((seme = (seme * 1664525 + 1013904223) >>> 0) / 4294967296);
    let conAccanto = 0;
    for (let i = 0; i < 3000; i++) {
        const layout = Object.keys(P.LAYOUT)[Math.floor(rnd() * 6)];
        let c = conZone(layout, TUTTI.map(() => 'abc'[Math.floor(rnd() * 3)]));
        c.blocchi.forEach(b => { if (rnd() < 0.4) b.accanto = true; });
        c = P.normalizza(c);
        if (c.blocchi.some(b => b.accanto)) conAccanto++;
        const visibili = TUTTI.filter(id => id === 'palco' || rnd() < 0.8);
        const g = P.griglia(c, visibili);
        const altri = Object.entries(g.area).filter(([id]) => id !== 'palco').map(([, a]) => a);
        assert.ok(!altri.length || g.area.palco >= Math.max(...altri) * P.MARGINE_PALCO - 1e-9, `caso ${i} (${layout})`);
        assert.ok(Math.abs(Object.values(g.area).reduce((s, x) => s + x, 0) - 1) < 1e-9, `quote ${i}`);
    }
    assert.ok(conAccanto > 2000);
});


// ---- Personalità sulla pagina pubblica: il blocco (spento di partenza) e le targhette (titolo, nome della personalità) ----------

test('targhette: titolo e nome della personalità stanno nel blocco del nome, sul palco o nascosti; il resto torna a quello di partenza', () => {
    const D = P.predefinita();
    assert.deepEqual(D.targhette, { titolo: 'identita', personalita: 'identita' });
    assert.deepEqual(Object.keys(P.POSTI_TARGHETTA), ['identita', 'palco', 'nessuno']);
    assert.deepEqual(Object.keys(P.TARGHETTE), ['titolo', 'personalita']);
    // ogni scelta ammessa passa invariata
    for (const titolo of Object.keys(P.POSTI_TARGHETTA)) for (const personalita of Object.keys(P.POSTI_TARGHETTA)) {
        assert.deepEqual(P.normalizza({ targhette: { titolo, personalita } }).targhette, { titolo, personalita });
    }
    // il database è scrivibile da chi è proprietario e letto da tutti: niente di diverso dalle scelte ammesse arriva alla pagina
    for (const male of [null, 5, 'palco', [], { titolo: '<b>x</b>', personalita: 'scudo' }, { titolo: ['palco'], personalita: {} }, { titolo: 1, personalita: true }]) {
        assert.deepEqual(P.normalizza({ targhette: male }).targhette, D.targhette, JSON.stringify(male));
    }
    // un campo solo: l'altro resta quello di partenza
    assert.deepEqual(P.normalizza({ targhette: { titolo: 'palco' } }).targhette, { titolo: 'palco', personalita: 'identita' });
    // e una configurazione normalizzata non cambia a rileggerla
    const c = P.normalizza({ targhette: { titolo: 'nessuno', personalita: 'palco' } });
    assert.ok(P.uguali(P.normalizza(c), c));
});

test('blocco Personality: parte spento, in fondo alla zona C; una pagina già salvata lo riceve spento e non cambia', () => {
    assert.deepEqual(P.BLOCCHI_SPENTI, ['personalita']);
    assert.equal(P.BLOCCHI.personalita.nome, 'Personality');
    assert.match(P.BLOCCHI.personalita.vuoto, /25 analysed sets/);
    const vecchia = {
        v: 2, layout: 'poster',
        blocchi: ['palco', 'musica', 'identita', 'statistiche', 'party', 'trofei', 'medaglie'].map((id, i) => ({ id, zona: 'abc'[i % 3], on: i !== 1 })),
        statistiche: ['sd'], team: 'auto'
    };
    const n = P.normalizza(vecchia);
    assert.deepEqual(n.blocchi.slice(0, 7), vecchia.blocchi);
    assert.deepEqual(n.blocchi[7], { id: 'personalita', zona: 'c', on: false });
    assert.equal(n.layout, 'poster');
    // quello che l'allenatore sceglie resta: acceso, in un'altra zona, in un'altra posizione
    let c = P.accendi(P.predefinita(), 'personalita', true);
    c = P.sposta(c, 'personalita', 'a', 1);
    const dopo = P.normalizza(JSON.parse(JSON.stringify(c)));
    assert.deepEqual(dopo.blocchi.find(b => b.id === 'personalita'), { id: 'personalita', zona: 'a', on: true });
    assert.deepEqual(P.blocchiPerZona(dopo).a.map(b => b.id), ['palco', 'personalita', 'musica']);
});

test('blocco Personality: ha peso, misura minima e un posto in ogni layout, e acceso non sposta il palco dal primo posto', () => {
    assert.ok(P.PESO_BLOCCO.personalita > 0);
    assert.deepEqual(P.MINIMI.personalita, [210, 190]);
    for (const layout of Object.keys(P.LAYOUT)) {
        const c = P.accendi(P.impostaLayout(P.predefinita(), layout), 'personalita', true);
        const g = P.griglia(c, c.blocchi.filter(b => b.on).map(b => b.id));
        assert.ok(g.blocchi.personalita > 0, layout);
        assert.ok(g.area.personalita > 0, layout);
        assert.ok(g.area.palco >= g.area.personalita * P.MARGINE_PALCO - 1e-9, `${layout}: il palco resta il più grande`);
        // spento non occupa niente
        const spenta = P.griglia(P.impostaLayout(P.predefinita(), layout), P.predefinita().blocchi.filter(b => b.on).map(b => b.id));
        assert.equal(spenta.blocchi.personalita, undefined, layout);
    }
});

// ---- fumetti: dove mettere il fumetto di un elemento (sempre dentro lo schermo) ----------------------
test('posizionaFumetto: centrato sotto l\'elemento; sopra se sotto non ci sta e sopra c\'è più posto', () => {
    const vista = { w: 1000, h: 800 };
    const dim = { w: 200, h: 100 };
    // c'è posto sotto: centrato, 12px più giù del bordo basso
    assert.deepEqual(P.posizionaFumetto({ left: 400, right: 440, top: 100, bottom: 140 }, dim, vista), { left: 320, top: 152, sopra: false });
    // in fondo allo schermo sotto non ci sta e sopra sì: va sopra
    const giu = P.posizionaFumetto({ left: 400, right: 440, top: 700, bottom: 740 }, dim, vista);
    assert.equal(giu.sopra, true);
    assert.equal(giu.top, 700 - 12 - 100);
    // se non c'è più posto sopra che sotto resta sotto, ma schiacciato dentro lo schermo
    const stretto = P.posizionaFumetto({ left: 400, right: 440, top: 380, bottom: 420 }, { w: 200, h: 700 }, vista);
    assert.ok(stretto.top >= 10 && stretto.top + 700 <= 800 - 10, `dentro lo schermo: ${JSON.stringify(stretto)}`);
});

test('posizionaFumetto: mai fuori dai bordi laterali (un elemento a sinistra o a destra, un fumetto largo come lo schermo)', () => {
    const vista = { w: 400, h: 800 };
    const sinistra = P.posizionaFumetto({ left: 0, right: 30, top: 100, bottom: 130 }, { w: 220, h: 80 }, vista);
    assert.equal(sinistra.left, 10, 'a 10px dal bordo sinistro, non fuori');
    const destra = P.posizionaFumetto({ left: 370, right: 400, top: 100, bottom: 130 }, { w: 220, h: 80 }, vista);
    assert.equal(destra.left, 400 - 220 - 10, 'a 10px dal bordo destro');
    // più largo dello schermo: si appoggia al bordo sinistro, non esce a sinistra
    assert.equal(P.posizionaFumetto({ left: 100, right: 140, top: 100, bottom: 130 }, { w: 500, h: 80 }, vista).left, 10);
    // margini e distanza si possono cambiare
    assert.equal(P.posizionaFumetto({ left: 0, right: 30, top: 100, bottom: 130 }, { w: 220, h: 80 }, vista, { margine: 0 }).left, 0);
    assert.equal(P.posizionaFumetto({ left: 100, right: 140, top: 100, bottom: 130 }, { w: 100, h: 50 }, vista, { distanza: 30 }).top, 160);
});
