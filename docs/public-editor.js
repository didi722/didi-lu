// =====================================================
// PUBLIC EDITOR — l'allenatore personalizza la sua pagina pubblica (docs/public.html)
//
// Si carica solo quando chi guarda è il proprietario della pagina (lo fa public-card.js).
// Cambia tutto "in diretta": ogni scelta si vede subito sulla carta, e solo "SAVE" la scrive su Firebase
// (players/{id}/info/pagina per la pagina, gli altri campi di players/{id}/info per il profilo).
// "Cancel" torna a come era.
//
// Cosa si può fare:
//   - la scheda "Trainer" (public-editor-trainer.js): avatar, colore firma, titolo, motto, Pokémon
//     preferito e canzone, con le scelte che gli altri hanno già fatto nascoste;
//   - scegliere il layout (Trainer Card, Poster, Dossier, Collage), e tornare a quello standard;
//   - spegnere, accendere e spostare i blocchi: coi pulsanti del pannello, oppure afferrandoli sulla
//     carta e trascinandoli: si agganciano ai posti dove possono stare;
//   - sfondo (colore, motivo, nome gigante, movimento), stile della carta (colore, ombra, bordi,
//     angoli, inclinazione, carattere, effetto olografico);
//   - adesivi da trascinare dove si vuole;
//   - quali statistiche mostrare e quale team mettere in vista;
//   - "Surprise me" per una combinazione a caso, e annulla.
// =====================================================
(function () {
    'use strict';

    const P = window.PaginaPubblica;
    let C = null;                 // PublicCard
    let h = null;
    let pannello = null;
    let scheda = 'layout';
    let storia = [];              // com'era prima di ogni modifica (configurazione e profilo), per "undo"
    let ultimaChiave = '';
    let ultimoTempo = 0;
    let trascinato = null;        // id del blocco che si sta trascinando
    let ascoltatori = [];         // [bersaglio, evento, funzione] da togliere alla chiusura
    let avviso = null;

    const SCHEDE = [['layout', 'Layout'], ['blocchi', 'Blocks'], ['sfondo', 'Background'], ['carta', 'Card'], ['adesivi', 'Stickers'], ['contenuto', 'Content']];
    const estensioni = [];        // schede aggiunte da altri file (la scheda Trainer): { id, nome, disegna(contesto) }
    const cfg = () => C.stato.config;
    const colore = () => C.stato.dati.colore;

    // ---- Cambiare la configurazione -----------------------------------------------------------

    const foto = () => ({ config: P.copia(cfg()), profilo: { ...C.profilo() } });

    // Ogni modifica registra com'era prima (per "undo"). Più modifiche di fila con la stessa chiave
    // (uno slider che si trascina) contano come una sola.
    function registra(prima, opzioni) {
        const adesso = Date.now();
        const accorpa = opzioni.chiave && opzioni.chiave === ultimaChiave && adesso - ultimoTempo < 1200;
        if (!accorpa) { storia.push(prima); if (storia.length > 40) storia.shift(); }
        ultimaChiave = opzioni.chiave || '';
        ultimoTempo = adesso;
    }

    /**
     * Applica una modifica alla configurazione della pagina.
     * opzioni.chiave: le modifiche di fila con la stessa chiave contano come un solo "undo"
     * opzioni.senzaPannello: non ridisegnare il pannello (si sta ancora trascinando uno slider)
     */
    function cambia(modifica, opzioni = {}) {
        const prima = foto();
        const dopo = modifica(P.copia(cfg())) || null;
        if (!dopo) return;
        registra(prima, opzioni);
        C.imposta(dopo);
        if (opzioni.senzaPannello) aggiornaPiede(); else disegnaPannello();
    }

    /** Come cambia(), per i campi del profilo (avatar, color, bio, pkmPreferito, title, musicName, musicaPreferita) */
    function cambiaProfilo(nuovi, opzioni = {}) {
        registra(foto(), opzioni);
        C.impostaProfilo(nuovi);
        if (opzioni.senzaPannello) aggiornaPiede(); else disegnaPannello();
    }

    function annulla() {
        if (!storia.length) return;
        ultimaChiave = '';
        const f = storia.pop();
        C.impostaProfilo(f.profilo);
        C.imposta(f.config);
        disegnaPannello();
    }

    const profiloSporco = () => { const ora = C.profilo(), salvato = C.stato.infoSalvata; return P.CAMPI_PROFILO.some(k => ora[k] !== salvato[k]); };
    const sporco = () => !P.uguali(cfg(), C.stato.salvata) || profiloSporco();

    // ---- Piccoli componenti -------------------------------------------------------------------

    const sezione = (titolo, ...figli) => h('section', { class: 'pe-sezione' }, h('h3', { testo: titolo }), ...figli);

    function segmentato(voci, corrente, scegli) {
        return h('div', { class: 'pe-seg', role: 'group' }, voci.map(([valore, etichetta]) =>
            h('button', { type: 'button', class: valore === corrente ? 'is-on' : '', 'aria-pressed': String(valore === corrente), onclick: () => scegli(valore), testo: etichetta })));
    }

    function interruttore(etichetta, acceso, scegli) {
        return h('button', { type: 'button', class: `pe-toggle${acceso ? ' is-on' : ''}`, role: 'switch', 'aria-checked': String(acceso), onclick: () => scegli(!acceso) },
            h('span', { class: 'pe-toggle-casella', 'aria-hidden': 'true' }), h('span', { testo: etichetta }));
    }

    function campione(sfondo, attivo, titolo, scegli, extra) {
        return h('button', { type: 'button', class: `pe-campione${attivo ? ' is-on' : ''}`, title: titolo, 'aria-label': titolo, 'aria-pressed': String(attivo),
            stile: { '--c': sfondo }, onclick: scegli }, extra || null);
    }

    function cursore(etichetta, min, max, passo, valore, formato, alCambio, chiave) {
        const uscita = h('output', { testo: formato(valore) });
        const campo = h('input', { type: 'range', min, max, step: passo, value: valore,
            oninput: e => { uscita.textContent = formato(+e.target.value); alCambio(+e.target.value); } });
        campo.dataset.chiave = chiave;
        return h('label', { class: 'pe-cursore' }, h('span', { testo: etichetta }), campo, uscita);
    }

    // ---- Scheda: layout -----------------------------------------------------------------------

    // Disegnini dei layout: [x, y, larghezza, altezza, tipo (k nero, p palco, b blocco), rotazione] su 100x70
    const DISEGNI = {
        carta: [[0, 0, 100, 9, 'k'], [0, 9, 38, 36, 'p'], [0, 45, 38, 12, 'k'], [38, 9, 62, 17, 'b'], [38, 26, 62, 31, 'b'], [0, 57, 52, 13, 'b'], [52, 57, 24, 13, 'b'], [76, 57, 24, 13, 'b']],
        poster: [[0, 0, 100, 8, 'k'], [0, 11, 66, 26, 'p'], [69, 11, 31, 12, 'k'], [0, 41, 40, 14, 'b'], [43, 41, 57, 14, 'b'], [0, 58, 58, 12, 'b'], [61, 58, 18, 12, 'b'], [82, 58, 18, 12, 'b']],
        dossier: [[0, 0, 100, 8, 'k'], [0, 11, 30, 28, 'p'], [0, 42, 30, 9, 'k'], [33, 11, 67, 17, 'b'], [33, 31, 67, 19, 'b'], [33, 53, 67, 17, 'b']],
        collage: [[2, 9, 48, 28, 'p', -3], [54, 7, 44, 14, 'k', 2], [8, 42, 42, 16, 'b', 2], [54, 26, 44, 22, 'b', -2], [6, 60, 32, 10, 'b', -1], [42, 56, 56, 13, 'b', 1]]
    };

    function disegno(id) {
        return h('span', { class: 'pe-disegno', 'aria-hidden': 'true' }, DISEGNI[id].map(([x, y, w, a, t, r]) =>
            h('i', { class: `pe-d-${t}`, stile: { left: `${x}%`, top: `${(y / 70) * 100}%`, width: `${w}%`, height: `${(a / 70) * 100}%`, transform: r ? `rotate(${r}deg)` : null } })));
    }

    function schedaLayout() {
        return [sezione('Pick a layout', h('div', { class: 'pe-layout-griglia' }, Object.entries(P.LAYOUT).map(([id, l]) =>
            h('button', { type: 'button', class: `pe-layout${cfg().layout === id ? ' is-on' : ''}`, 'aria-pressed': String(cfg().layout === id),
                onclick: () => cambia(c => { c.layout = id; return c; }) },
            disegno(id), h('b', { testo: l.nome }), h('small', { testo: l.desc }))))),
        h('p', { class: 'pe-nota', testo: 'The blocks stay where you put them: switching layout only changes how the three zones are drawn.' }),
        sezione('Start over',
            h('button', { type: 'button', class: 'pe-bottone pe-grande', onclick: tornaAllaTrainerCard, testo: '↺ RESET TO THE STANDARD TRAINER CARD' }),
            h('p', { class: 'pe-nota', testo: 'Back to the Trainer Card layout with every block in its usual place and the default look (stickers included). Your trainer details are not touched, and you can still undo.' }))];
    }

    function tornaAllaTrainerCard() {
        C.scegliAdesivo(-1);
        cambia(() => P.predefinita());
        avvisa('Back to the standard Trainer Card. Press SAVE to keep it, or Undo.');
    }

    // ---- Scheda: blocchi ----------------------------------------------------------------------

    function schedaBlocchi() {
        const per = P.blocchiPerZona(cfg());
        const zone = P.LAYOUT[cfg().layout].zone;
        return [
            h('p', { class: 'pe-nota', testo: 'Show, hide and move the blocks. You can also grab a block right on the card and drop it where it fits: the spots it can take light up.' }),
            ...P.ZONE.map(z => h('section', { class: 'pe-zona', 'data-zona': z },
                h('h3', {}, h('span', { class: 'pe-zona-lettera', testo: z.toUpperCase() }), zone[z]),
                h('ul', { class: 'pe-lista', 'data-zona': z }, per[z].length
                    ? per[z].map((b, i) => rigaBlocco(b, i, per[z].length))
                    : h('li', { class: 'pe-vuota', testo: 'Empty — drop a block here' }))))
        ];
    }

    function rigaBlocco(b, i, quanti) {
        const def = P.BLOCCHI[b.id];
        const vuoto = !!C.stato.vuoti[b.id];
        const icona = (titolo, testo, attivo, fn, disabilitato) => h('button', { type: 'button', class: 'pe-icona', title: titolo, 'aria-label': titolo, disabled: disabilitato, 'aria-pressed': attivo === undefined ? null : String(attivo), onclick: fn, testo });
        return h('li', { class: `pe-riga${b.on ? '' : ' is-spento'}`, 'data-id': b.id, draggable: 'true' },
            h('span', { class: 'pe-presa', 'aria-hidden': 'true', testo: '⠇' }),
            h('span', { class: 'pe-riga-nome' }, h('b', { testo: def.nome }), h('small', { testo: vuoto ? 'Nothing to show yet' : def.desc })),
            icona(b.on ? 'Hide' : 'Show', b.on ? '◉' : '○', b.on, () => cambia(c => P.accendi(c, b.id, !b.on))),
            icona('Move up', '▲', undefined, () => cambia(c => P.sposta(c, b.id, b.zona, i - 1)), i === 0),
            icona('Move down', '▼', undefined, () => cambia(c => P.sposta(c, b.id, b.zona, i + 1)), i === quanti - 1),
            h('span', { class: 'pe-zone', role: 'group', 'aria-label': 'Zone' }, P.ZONE.map(z =>
                h('button', { type: 'button', class: z === b.zona ? 'is-on' : '', title: `Move to zone ${z.toUpperCase()}`, onclick: () => z !== b.zona && cambia(c => P.sposta(c, b.id, z, 999)), testo: z.toUpperCase() }))));
    }

    // ---- Scheda: sfondo -----------------------------------------------------------------------

    function schedaSfondo() {
        const s = cfg().sfondo;
        const anteprima = motivo => {
            const css = P.sfondoCss({ ...s, motivo }, colore());
            return { 'background-color': css.colore, 'background-image': css.immagine, 'background-size': css.dimensione === 'auto' ? 'auto' : css.dimensione, 'background-position': css.posizione };
        };
        const proprio = P.esadecimale(colore(), '#31c489');
        const nellaPalette = s.colore !== 'giocatore' && P.PALETTE_SFONDO.some(x => x.toLowerCase() === s.colore);
        const personalizzato = s.colore !== 'giocatore' && !nellaPalette;
        const campoColore = h('input', { type: 'color', class: 'pe-colore-libero', value: s.colore === 'giocatore' ? proprio : s.colore, title: 'Pick any colour', 'aria-label': 'Custom colour',
            oninput: e => cambia(c => { c.sfondo.colore = e.target.value; return c; }, { chiave: 'sfondo-colore', senzaPannello: true }),
            onchange: () => disegnaPannello() });
        return [
            sezione('Pattern', h('div', { class: 'pe-motivi' }, Object.entries(P.MOTIVI).map(([id, nome]) =>
                h('button', { type: 'button', class: `pe-motivo${s.motivo === id ? ' is-on' : ''}`, 'aria-pressed': String(s.motivo === id), onclick: () => cambia(c => { c.sfondo.motivo = id; return c; }) },
                    h('span', { class: 'pe-motivo-prova', stile: anteprima(id) }), h('small', { testo: nome }))))),
            sezione('Colour', h('div', { class: 'pe-campioni pe-campioni-fitti' },
                campione(proprio, s.colore === 'giocatore', 'My signature colour', () => cambia(c => { c.sfondo.colore = 'giocatore'; return c; }), h('span', { class: 'pe-campione-etichetta', testo: 'ME' })),
                P.PALETTE_SFONDO.map(x => campione(x, s.colore === x.toLowerCase(), x, () => cambia(c => { c.sfondo.colore = x.toLowerCase(); return c; }))),
                h('span', { class: `pe-campione pe-campione-libero${personalizzato ? ' is-on' : ''}`, stile: { '--c': personalizzato ? s.colore : '#fff' } }, campoColore, h('span', { class: 'pe-campione-etichetta', testo: '+' })))),
            sezione('Pattern strength', segmentato([[1, 'Soft'], [2, 'Medium'], [3, 'Bold']], s.forza, v => cambia(c => { c.sfondo.forza = v; return c; }))),
            sezione('Extras',
                interruttore('Giant name behind the card', s.scritta, v => cambia(c => { c.sfondo.scritta = v; return c; })),
                interruttore('Moving pattern', s.animato, v => cambia(c => { c.sfondo.animato = v; return c; })),
                s.animato && P.sfondoCss(s, colore()).periodo === 0 ? h('p', { class: 'pe-nota', testo: 'This pattern is too irregular to move: pick another one to see it scroll.' }) : null)
        ];
    }

    // ---- Scheda: carta ------------------------------------------------------------------------

    function schedaCarta() {
        const k = cfg().carta;
        const proprio = P.esadecimale(colore(), '#31c489');
        const nuovo = (campo, valore) => cambia(c => { c.carta[campo] = valore; return c; });
        return [
            sezione('Card colour',
                h('div', { class: 'pe-campioni' }, Object.entries(P.TEMI).map(([id, t]) =>
                    campione(t.colore || proprio, k.tema === id, t.nome, () => nuovo('tema', id), id === 'colore' ? h('span', { class: 'pe-campione-etichetta', testo: 'ME' }) : null))),
                h('div', { class: 'pe-campioni pe-campioni-fitti pe-sotto' }, P.PALETTE_SFONDO.map(x =>
                    campione(x, k.tema === x.toLowerCase(), x, () => nuovo('tema', x.toLowerCase()))))),
            sezione('Hard shadow', segmentato(P.OMBRE.map(o => [o, o === 0 ? 'None' : o === 6 ? 'S' : o === 10 ? 'M' : 'L']), k.ombra, v => nuovo('ombra', v))),
            sezione('Borders', segmentato(P.BORDI.map(b => [b, b === 3 ? 'Thin' : b === 4 ? 'Normal' : 'Thick']), k.bordo, v => nuovo('bordo', v))),
            sezione('Corners', segmentato([['netti', 'Square'], ['tondi', 'Round']], k.angoli, v => nuovo('angoli', v))),
            sezione('Tilt', segmentato([['nessuna', 'Straight'], ['lieve', 'Slight'], ['forte', 'Wild']], k.inclinazione, v => nuovo('inclinazione', v))),
            sezione('Lettering (name, titles, numbers)', h('div', { class: 'pe-caratteri' }, Object.entries(P.FONT).map(([id, f]) =>
                h('button', { type: 'button', class: `pe-carattere${k.font === id ? ' is-on' : ''}`, 'aria-pressed': String(k.font === id), stile: { 'font-family': f.pila }, onclick: () => nuovo('font', id) },
                    h('b', { testo: 'Aa' }), h('small', { testo: f.nome }))))),
            sezione('Effects', interruttore('Holographic shine (Trainer Card layout)', k.holo, v => nuovo('holo', v)))
        ];
    }

    // ---- Scheda: adesivi ----------------------------------------------------------------------

    function schedaAdesivi() {
        const lista = cfg().adesivi;
        const scelto = C.stato.adesivoScelto;
        const s = lista[scelto];
        const aggiungi = id => {
            if (lista.length >= P.MAX_ADESIVI) return avvisa(`You can place up to ${P.MAX_ADESIVI} stickers.`);
            const x = 15 + Math.random() * 70, y = 12 + Math.random() * 70;
            cambia(c => { c.adesivi.push({ id, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, s: 1, r: Math.round(Math.random() * 30 - 15) }); return c; });
            C.scegliAdesivo(lista.length);   // il nuovo è l'ultimo
            disegnaPannello();
        };
        const modifica = (campo, valore) => cambia(c => { if (c.adesivi[scelto]) c.adesivi[scelto][campo] = valore; return c; }, { chiave: `adesivo-${scelto}-${campo}`, senzaPannello: true });
        return [
            sezione(`Add a sticker (${lista.length}/${P.MAX_ADESIVI})`, h('div', { class: 'pe-adesivi' }, Object.entries(P.ADESIVI).map(([id, a]) =>
                h('button', { type: 'button', class: `pe-adesivo${a.testo ? ' pe-adesivo-testo' : ''}`, title: a.nome, 'aria-label': `Add sticker ${a.nome}`, stile: { '--tinta': a.tinta }, onclick: () => aggiungi(id), testo: a.glifo })))),
            h('p', { class: 'pe-nota', testo: 'Drag stickers on the card to move them. Arrow keys nudge the selected one, Delete removes it.' }),
            s
                ? sezione(`Selected: ${P.ADESIVI[s.id].nome}`,
                    cursore('Size', 0.6, 2.2, 0.1, s.s, v => `${v.toFixed(1)}×`, v => modifica('s', v), 'dim'),
                    cursore('Rotation', -45, 45, 1, s.r, v => `${v}°`, v => modifica('r', v), 'rot'),
                    h('div', { class: 'pe-azioni' },
                        h('button', { type: 'button', class: 'pe-bottone', onclick: () => cambia(c => { const [x] = c.adesivi.splice(scelto, 1); c.adesivi.push(x); return c; }) || (C.scegliAdesivo(lista.length - 1), disegnaPannello()), testo: 'Bring to front' }),
                        h('button', { type: 'button', class: 'pe-bottone pe-pericolo', onclick: () => togliAdesivo(scelto), testo: 'Delete' })))
                : (lista.length ? h('p', { class: 'pe-nota', testo: 'Click a sticker on the card to select it.' }) : null),
            lista.length ? h('div', { class: 'pe-azioni' }, h('button', { type: 'button', class: 'pe-bottone', onclick: () => { C.scegliAdesivo(-1); cambia(c => { c.adesivi = []; return c; }); }, testo: 'Remove all stickers' })) : null
        ];
    }

    function togliAdesivo(i) {
        C.scegliAdesivo(-1);
        cambia(c => { c.adesivi.splice(i, 1); return c; });
    }

    // ---- Scheda: contenuto --------------------------------------------------------------------

    function schedaContenuto() {
        const mostrate = cfg().statistiche;
        const tutte = [...mostrate, ...Object.keys(P.STAT).filter(id => !mostrate.includes(id))];
        const squadre = (C.stato.dati.teams || []).filter(t => t && typeof t === 'object');
        const automatico = C.sceltaTeam({ team: 'auto' });
        const riga = (t, scelta) => {
            const s = t.stats || {};
            return h('button', { type: 'button', class: `pe-team${scelta ? ' is-on' : ''}`, 'aria-pressed': String(scelta), onclick: () => cambia(c => { c.team = t.id; return c; }) },
                h('b', { testo: t.nome || t.name || 'My team' }),
                h('small', { testo: `${t.categoria || t.category || 'VGC'} · ${Number(s.won) || 0}W ${Number(s.lose ?? s.lost) || 0}L` }));
        };
        return [
            sezione('Stats to show',
                h('p', { class: 'pe-nota', testo: 'Tick the ones you want and put them in the order you like.' }),
                h('ul', { class: 'pe-lista' }, tutte.map((id, i) => {
                    const on = mostrate.includes(id);
                    return h('li', { class: `pe-riga${on ? '' : ' is-spento'}` },
                        h('button', { type: 'button', class: 'pe-icona', title: on ? 'Hide' : 'Show', 'aria-label': `${on ? 'Hide' : 'Show'} ${P.STAT[id].nome}`, 'aria-pressed': String(on),
                            onclick: () => { if (on && mostrate.length === 1) return avvisa('Keep at least one stat.'); cambia(c => { c.statistiche = on ? c.statistiche.filter(x => x !== id) : [...c.statistiche, id]; return c; }); },
                            testo: on ? '◉' : '○' }),
                        h('span', { class: 'pe-riga-nome' }, h('b', { testo: P.STAT[id].nome })),
                        on ? h('button', { type: 'button', class: 'pe-icona', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => cambia(c => { const k = c.statistiche.indexOf(id); [c.statistiche[k - 1], c.statistiche[k]] = [c.statistiche[k], c.statistiche[k - 1]]; return c; }), testo: '▲' }) : null,
                        on ? h('button', { type: 'button', class: 'pe-icona', title: 'Move down', 'aria-label': 'Move down', disabled: i === mostrate.length - 1, onclick: () => cambia(c => { const k = c.statistiche.indexOf(id); [c.statistiche[k + 1], c.statistiche[k]] = [c.statistiche[k], c.statistiche[k + 1]]; return c; }), testo: '▼' }) : null);
                }))),
            sezione('Team on show',
                squadre.length ? h('div', { class: 'pe-squadre' },
                    h('button', { type: 'button', class: `pe-team${cfg().team === 'auto' || !squadre.some(t => t.id === cfg().team) ? ' is-on' : ''}`, onclick: () => cambia(c => { c.team = 'auto'; return c; }) },
                        h('b', { testo: 'Automatic' }), h('small', { testo: automatico ? `Best record: ${automatico.nome || automatico.name}` : 'No team has played yet' })),
                    squadre.map(t => riga(t, cfg().team === t.id)))
                    : h('p', { class: 'pe-nota', testo: 'You have no teams yet. Build one in your BOX and it will show up here.' })),
            h('p', { class: 'pe-nota' }, 'Name, colour, favourite Pokémon, song, title and motto are in ', h('a', { href: 'profile.html', testo: 'PROFILE' }), '.')
        ];
    }

    // ---- Il pannello --------------------------------------------------------------------------

    const CONTENUTI = { layout: schedaLayout, blocchi: schedaBlocchi, sfondo: schedaSfondo, carta: schedaCarta, adesivi: schedaAdesivi, contenuto: schedaContenuto };

    // Le schede aggiunte da altri file (Trainer) vengono prima delle altre
    const esciDallaScheda = () => estensioni.forEach(x => { if (x.esci) x.esci(); });
    const tutteLeSchede = () => [...estensioni.map(e => [e.id, e.nome]), ...SCHEDE];
    const contenutoScheda = id => {
        const e = estensioni.find(x => x.id === id);
        return e ? e.disegna(contesto()) : CONTENUTI[id]();
    };

    function costruisciPannello() {
        pannello = h('aside', { id: 'pe-pannello', class: 'pe-pannello', role: 'dialog', 'aria-label': 'Customize your card' },
            h('header', { class: 'pe-testa' },
                h('h2', {}, h('span', { 'aria-hidden': 'true', testo: '✎ ' }), 'CUSTOMIZE'),
                h('button', { type: 'button', id: 'pe-annulla', class: 'pe-icona pe-testa-btn', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: annulla, testo: '↶' }),
                h('button', { type: 'button', class: 'pe-icona pe-testa-btn', title: 'Close', 'aria-label': 'Close', onclick: chiudi, testo: '×' })),
            h('nav', { class: 'pe-schede', role: 'tablist' }, tutteLeSchede().map(([id, nome]) =>
                h('button', { type: 'button', role: 'tab', 'data-scheda': id, onclick: () => { esciDallaScheda(); scheda = id; disegnaPannello(); }, testo: nome }))),
            h('div', { class: 'pe-corpo', id: 'pe-corpo' }),
            h('footer', { class: 'pe-piede' },
                h('div', { class: 'pe-piede-sopra' },
                    h('button', { type: 'button', class: 'pe-bottone', onclick: () => cambia(c => P.casuale(c)), title: 'Random look, keeps your blocks', testo: '🎲 Surprise me' }),
                    h('button', { type: 'button', class: 'pe-bottone', onclick: tornaAllaTrainerCard, title: 'Back to the standard Trainer Card', testo: '↺ Reset' })),
                h('div', { class: 'pe-piede-sotto' },
                    h('span', { class: 'pe-stato', id: 'pe-stato', 'aria-live': 'polite' }),
                    h('button', { type: 'button', class: 'pe-bottone', onclick: chiudi, testo: 'Cancel' }),
                    h('button', { type: 'button', class: 'pe-bottone pe-primario', id: 'pe-salva', onclick: salva, testo: 'SAVE' }))));
        document.body.append(pannello);
    }

    function disegnaPannello() {
        if (!pannello) return;
        const corpo = pannello.querySelector('#pe-corpo');
        const scorri = corpo.scrollTop;
        corpo.replaceChildren(...contenutoScheda(scheda).flat().filter(Boolean));
        corpo.scrollTop = scorri;
        for (const t of pannello.querySelectorAll('[role="tab"]')) {
            const attiva = t.dataset.scheda === scheda;
            t.classList.toggle('is-on', attiva);
            t.setAttribute('aria-selected', String(attiva));
        }
        collegaTrascinamentoPannello(corpo);
        aggiornaPiede();
    }

    function aggiornaPiede() {
        if (!pannello) return;
        const stato = pannello.querySelector('#pe-stato');
        const dirty = sporco();
        stato.textContent = dirty ? '● Unsaved changes' : '✓ Saved';
        stato.classList.toggle('is-sporco', dirty);
        pannello.querySelector('#pe-annulla').disabled = storia.length === 0;
    }

    function avvisa(testo, errore) {
        avviso?.remove();
        avviso = h('div', { class: `pe-avviso${errore ? ' is-errore' : ''}`, role: 'status', testo });
        document.body.append(avviso);
        const questo = avviso;
        setTimeout(() => questo.remove(), errore ? 6000 : 2400);
    }

    // ---- Salvare ------------------------------------------------------------------------------

    // Le scelte che non si possono condividere con un altro allenatore
    const CAMPI_UNICI = ['color', 'avatar', 'pkmPreferito', 'musicName', 'musicaPreferita'];
    const NOMI_CONFLITTO = { color: 'colour', avatar: 'avatar', pkmPreferito: 'favourite Pokémon', musica: 'song' };

    async function salva() {
        const bottone = pannello.querySelector('#pe-salva');
        bottone.disabled = true;
        bottone.textContent = 'SAVING…';
        const daSalvare = P.copia(cfg());
        const profilo = C.profilo();
        const salvato = C.stato.infoSalvata;
        const cambiati = P.CAMPI_PROFILO.filter(k => profilo[k] !== salvato[k]);
        try {
            const database = typeof db !== 'undefined' ? db : firebase.database();
            const chiave = C.stato.dati.chiave;

            // colore, avatar, Pokémon preferito e canzone sono unici: si ricontrolla sui dati di adesso, perché
            // qualcuno può aver scelto la stessa cosa mentre si modificava
            const unici = {};
            for (const k of CAMPI_UNICI) if (cambiati.includes(k)) unici[k] = profilo[k];
            if (Object.keys(unici).length) {
                const tutti = (await database.ref('players').once('value')).val() || {};
                C.stato.dati.tutti = tutti;
                const presi = P.conflitti(chiave, unici, tutti);
                if (presi.length) {
                    avvisa(`Someone else already has this ${presi.map(n => NOMI_CONFLITTO[n]).join(' and ')}: pick another one. Nothing was saved.`, true);
                    return;
                }
            }

            // un'unica scrittura: o passa tutto o niente. La configurazione di partenza non si scrive: se un giorno
            // cambia, chi non ha scelto niente la segue
            const aggiornamenti = { pagina: P.uguali(daSalvare, P.predefinita()) ? null : daSalvare };
            for (const k of cambiati) aggiornamenti[k] = k === 'title' && profilo.title === 'No Title' ? '' : profilo[k];
            await database.ref(`players/${chiave}/info`).update(aggiornamenti);

            C.salvata(daSalvare);
            C.profiloSalvato(profilo);
            storia = [];
            avvisa('Saved! Your card is live.');
        } catch (e) {
            console.error('Saving the card failed:', e);
            avvisa(e && e.code === 'PERMISSION_DENIED'
                ? 'The database refused to save this (permissions). Ask the admin to allow writing players/<you>/info.'
                : `Could not save: ${e && e.message ? e.message : 'unknown error'}`, true);
        } finally {
            bottone.disabled = false;
            bottone.textContent = 'SAVE';
            disegnaPannello();
        }
    }

    // ---- Trascinare i blocchi -----------------------------------------------------------------
    // Un blocco si afferra (dalla maniglia o da qualunque punto) e segue il puntatore. Intanto compaiono i posti
    // dove può stare (prima, tra e dopo gli altri blocchi di ogni zona, o dentro una zona vuota): quello più
    // vicino si evidenzia e, quando si lascia, il blocco si aggancia lì. Lasciandolo fuori dalla carta non succede niente.

    const SOGLIA_TRASCINA = 6;       // pixel da muovere prima che sia un trascinamento e non un clic
    const DISTANZA_MAX = 90;         // oltre questa distanza dai posti possibili, lasciare annulla

    function ascolta(bersaglio, evento, funzione, opzioni) {
        bersaglio.addEventListener(evento, funzione, opzioni);
        ascoltatori.push([bersaglio, evento, funzione, opzioni]);
    }

    const sopra = (r, x, y) => Math.hypot(Math.max(r.left - x, 0, x - (r.left + r.width)), Math.max(r.top - y, 0, y - (r.top + r.height)));

    /**
     * I posti dove può stare un blocco: posti = [{ zona, indice, rect }] con la misura dello "slot" sullo schermo,
     * e zone = [{ zona, rect, riga }] (la zona e se i suoi blocchi stanno in riga o in colonna)
     */
    function postiPossibili(idEscluso) {
        const posti = [], zone = [];
        for (const zonaEl of Object.values(C.stato.zone)) {
            const stile = getComputedStyle(zonaEl);
            if (stile.display === 'none') continue;
            const zona = zonaEl.dataset.zona;
            const figli = Array.from(zonaEl.children).filter(e => e.classList.contains('pp-blocco') && e.dataset.blocco !== idEscluso && getComputedStyle(e).display !== 'none');
            const zr = zonaEl.getBoundingClientRect();
            zone.push({ zona, rect: zr, riga: stile.flexDirection.startsWith('row') });
            if (!figli.length) { posti.push({ zona, indice: 0, rect: { left: zr.left + 8, top: zr.top + 8, width: Math.max(zr.width - 16, 20), height: Math.max(zr.height - 16, 20) } }); continue; }
            const riga = stile.flexDirection.startsWith('row');
            const r = figli.map(e => e.getBoundingClientRect());
            for (let i = 0; i <= figli.length; i++) {
                const rif = r[Math.min(i, figli.length - 1)];
                const bordo = riga ? (i < figli.length ? r[i].left : r[i - 1].right) : (i < figli.length ? r[i].top : r[i - 1].bottom);
                posti.push({ zona, indice: i, rect: riga
                    ? { left: bordo - 6, top: rif.top, width: 12, height: rif.height }
                    : { left: rif.left, top: bordo - 6, width: rif.width, height: 12 } });
            }
        }
        return { posti, zone };
    }

    let ultimoTrascinamento = 0;

    function avviaTrascinamento(e, id, el) {
        const scala = document.body.classList.contains('pp-fisso') && C.stato.scala ? C.stato.scala : 1;
        const partenza = { x: e.clientX, y: e.clientY };
        let attivo = false, posti = [], zone = [], vicino = null, strato = null;
        el.setPointerCapture(e.pointerId);

        const mostra = () => {
            attivo = true;
            ({ posti, zone } = postiPossibili(id));
            strato = h('div', { id: 'pp-ancore', class: 'pp-ancore', 'aria-hidden': 'true' }, posti.map(p =>
                h('i', { class: 'pp-ancora', stile: { left: `${p.rect.left}px`, top: `${p.rect.top}px`, width: `${p.rect.width}px`, height: `${p.rect.height}px` } })));
            document.body.append(strato);
            document.body.classList.add('pp-trascina');
            el.classList.add('pp-in-volo');
        };

        const muovi = ev => {
            const dx = ev.clientX - partenza.x, dy = ev.clientY - partenza.y;
            if (!attivo) {
                if (Math.hypot(dx, dy) < SOGLIA_TRASCINA) return;
                mostra();
            }
            el.style.translate = `${dx / scala}px ${dy / scala}px`;
            // Sopra una zona: vale il posto più vicino di quella zona, in qualunque punto della zona (misurando solo
            // lungo la direzione in cui stanno i blocchi). Fuori da tutte le zone: il posto più vicino, se non è lontano.
            const zonaSotto = zone.find(z => ev.clientX >= z.rect.left && ev.clientX <= z.rect.right && ev.clientY >= z.rect.top && ev.clientY <= z.rect.bottom);
            let migliore = null, distanza = Infinity;
            posti.forEach((p, i) => {
                if (zonaSotto && p.zona !== zonaSotto.zona) return;
                const lungoAsse = zonaSotto && posti.filter(q => q.zona === p.zona).length > 1;
                const d = lungoAsse
                    ? (zonaSotto.riga ? Math.abs(ev.clientX - (p.rect.left + p.rect.width / 2)) : Math.abs(ev.clientY - (p.rect.top + p.rect.height / 2)))
                    : sopra(p.rect, ev.clientX, ev.clientY);
                if (d < distanza) { distanza = d; migliore = i; }
            });
            if (!zonaSotto && distanza > DISTANZA_MAX) migliore = null;
            if (migliore !== vicino) {
                const marcati = strato.children;
                if (vicino !== null) marcati[vicino].classList.remove('is-vicina');
                if (migliore !== null) marcati[migliore].classList.add('is-vicina');
                vicino = migliore;
            }
        };

        const finisci = (conferma) => {
            el.removeEventListener('pointermove', muovi);
            el.removeEventListener('pointerup', alRilascio);
            el.removeEventListener('pointercancel', alRilascio);
            document.removeEventListener('keydown', alTasto, true);
            const scelto = conferma && vicino !== null ? posti[vicino] : null;
            strato?.remove();
            document.body.classList.remove('pp-trascina');
            el.classList.remove('pp-in-volo');
            el.style.translate = '';
            if (attivo) ultimoTrascinamento = Date.now();
            if (scelto) {
                const spostata = P.sposta(cfg(), id, scelto.zona, scelto.indice);
                if (!P.uguali(spostata.blocchi, cfg().blocchi)) cambia(() => spostata);   // lasciato dov'era: niente da fare
            }
        };
        const alRilascio = ev => finisci(ev.type === 'pointerup');
        const alTasto = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); finisci(false); } };

        el.addEventListener('pointermove', muovi);
        el.addEventListener('pointerup', alRilascio);
        el.addEventListener('pointercancel', alRilascio);
        document.addEventListener('keydown', alTasto, true);
    }

    function fineTrascinamento() {
        trascinato = null;
        document.querySelectorAll('.pp-sopra, .pp-in-volo, .pe-sopra, .pe-in-volo').forEach(e => e.classList.remove('pp-sopra', 'pp-in-volo', 'pe-sopra', 'pe-in-volo'));
        document.getElementById('pp-ancore')?.remove();
        document.body.classList.remove('pp-trascina');
    }

    // La barra di ogni blocco sulla carta: maniglia e occhio per nasconderlo. Il blocco si afferra da dove si vuole.
    function installaBarre() {
        for (const [id, el] of Object.entries(C.stato.blocchi)) {
            if (el.querySelector(':scope > .pp-barra-blocco')) continue;
            const maniglia = h('span', { class: 'pp-maniglia', title: 'Drag to move this block', 'aria-label': `Drag ${P.BLOCCHI[id].nome}`, testo: '⠇' });
            const occhio = h('button', { type: 'button', class: 'pp-occhio', title: 'Hide this block', 'aria-label': `Hide ${P.BLOCCHI[id].nome}`, onclick: ev => { ev.stopPropagation(); cambia(c => P.accendi(c, id, false)); }, testo: '◉' });
            el.prepend(h('div', { class: 'pp-barra-blocco' }, maniglia, h('span', { class: 'pp-barra-nome', testo: P.BLOCCHI[id].nome }), occhio));
        }
    }

    function installaTrascinamentoBlocchi() {
        const corpo = document.querySelector('.pp-corpo');
        ascolta(corpo, 'pointerdown', e => {
            if (e.button !== 0 || e.target.closest('.pp-occhio')) return;
            const el = e.target.closest('.pp-blocco');
            if (!el || !corpo.contains(el)) return;
            e.preventDefault();
            avviaTrascinamento(e, el.dataset.blocco, el);
        });
        // dopo un trascinamento non deve partire anche il clic (che riaccenderebbe un blocco spento)
        ascolta(corpo, 'click', e => { if (Date.now() - ultimoTrascinamento < 80) { e.stopPropagation(); e.preventDefault(); } }, true);
    }

    function togliBarre() {
        document.querySelectorAll('.pp-barra-blocco').forEach(e => e.remove());
    }

    // Anche le righe del pannello si trascinano tra le zone
    function collegaTrascinamentoPannello(corpo) {
        for (const riga of corpo.querySelectorAll('.pe-riga[data-id]')) {
            riga.addEventListener('dragstart', e => {
                trascinato = riga.dataset.id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', trascinato);
                setTimeout(() => riga.classList.add('pe-in-volo'), 0);
            });
            riga.addEventListener('dragend', fineTrascinamento);
        }
        for (const lista of corpo.querySelectorAll('.pe-lista[data-zona]')) {
            lista.addEventListener('dragover', e => { if (!trascinato) return; e.preventDefault(); lista.classList.add('pe-sopra'); });
            lista.addEventListener('dragleave', e => { if (!lista.contains(e.relatedTarget)) lista.classList.remove('pe-sopra'); });
            lista.addEventListener('drop', e => {
                if (!trascinato) return;
                e.preventDefault();
                const id = trascinato, zona = lista.dataset.zona;
                const righe = Array.from(lista.querySelectorAll('.pe-riga[data-id]')).filter(r => r.dataset.id !== id);
                let indice = righe.length;
                for (let i = 0; i < righe.length; i++) {
                    const r = righe[i].getBoundingClientRect();
                    if (e.clientY < r.top + r.height / 2) { indice = i; break; }
                }
                trascinato = null;
                cambia(c => P.sposta(c, id, zona, indice));
            });
        }
    }

    // ---- Trascinare gli adesivi ---------------------------------------------------------------

    function installaAdesivi() {
        const strato = document.getElementById('pp-adesivi');
        ascolta(strato, 'pointerdown', e => {
            const el = e.target.closest('.pp-adesivo');
            if (!el) return;
            e.preventDefault();
            const i = Number(el.dataset.i);
            C.scegliAdesivo(i);
            if (scheda !== 'adesivi') scheda = 'adesivi';
            disegnaPannello();
            const attuale = strato.querySelector(`.pp-adesivo[data-i="${i}"]`) || el;
            const area = strato.getBoundingClientRect();
            let x = cfg().adesivi[i].x, y = cfg().adesivi[i].y, mosso = false;
            attuale.setPointerCapture(e.pointerId);
            const muovi = ev => {
                mosso = true;
                x = Math.min(100, Math.max(0, (ev.clientX - area.left) / area.width * 100));
                y = Math.min(100, Math.max(0, (ev.clientY - area.top) / area.height * 100));
                attuale.style.left = `${x}%`;
                attuale.style.top = `${y}%`;
            };
            const fine = () => {
                attuale.removeEventListener('pointermove', muovi);
                attuale.removeEventListener('pointerup', fine);
                attuale.removeEventListener('pointercancel', fine);
                if (mosso) cambia(c => { if (c.adesivi[i]) { c.adesivi[i].x = x; c.adesivi[i].y = y; } return c; });
            };
            attuale.addEventListener('pointermove', muovi);
            attuale.addEventListener('pointerup', fine);
            attuale.addEventListener('pointercancel', fine);
        });
        // click su un punto vuoto della carta: nessun adesivo scelto
        ascolta(document, 'keydown', e => {
            const bersaglio = e.target;
            const inCampo = bersaglio && /^(INPUT|TEXTAREA|SELECT)$/.test(bersaglio.tagName) && bersaglio.type !== 'range';
            if (e.key === 'Escape') { if (!inCampo) chiudi(); return; }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inCampo) { e.preventDefault(); annulla(); return; }
            const i = C.stato.adesivoScelto;
            if (i < 0 || inCampo || !cfg().adesivi[i]) return;
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); togliAdesivo(i); return; }
            const passo = e.shiftKey ? 5 : 1;
            const spostamento = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
            if (!spostamento) return;
            e.preventDefault();
            cambia(c => { c.adesivi[i].x = Math.min(100, Math.max(0, c.adesivi[i].x + spostamento[0])); c.adesivi[i].y = Math.min(100, Math.max(0, c.adesivi[i].y + spostamento[1])); return c; },
                { chiave: `adesivo-${i}-tasti`, senzaPannello: true });
        });
    }

    // ---- Aprire e chiudere --------------------------------------------------------------------

    function avvertiSeNonSalvato(e) {
        if (!sporco()) return;
        e.preventDefault();
        e.returnValue = '';
    }

    /** Quello che serve alle schede aggiunte da altri file */
    function contesto() {
        return { P, C, h, sezione, segmentato, interruttore, campione, cursore, cambiaProfilo, avvisa, ridisegna: disegnaPannello };
    }

    function apri(card) {
        C = card;
        h = card.h;
        if (pannello) return;
        storia = [];
        scheda = estensioni.length ? estensioni[0].id : 'layout';
        C.stato.dopoApplica = () => { installaBarre(); };
        C.modifica(true);
        installaBarre();
        costruisciPannello();
        disegnaPannello();
        installaTrascinamentoBlocchi();
        installaAdesivi();
        ascolta(window, 'beforeunload', avvertiSeNonSalvato);
        // un clic su un punto vuoto della carta toglie la selezione dell'adesivo
        ascolta(document.getElementById('pp-tela'), 'pointerdown', e => {
            if (e.target.closest('.pp-adesivo') || C.stato.adesivoScelto < 0) return;
            C.scegliAdesivo(-1);
            if (scheda === 'adesivi') disegnaPannello();
        });
    }

    function chiudi() {
        if (!pannello) return;
        if (sporco() && !confirm('Discard your changes?')) return;
        esciDallaScheda();
        C.impostaProfilo(C.stato.infoSalvata);
        C.imposta(C.stato.salvata);
        C.stato.dopoApplica = null;
        for (const [bersaglio, evento, funzione, opzioni] of ascoltatori) bersaglio.removeEventListener(evento, funzione, opzioni);
        ascoltatori = [];
        togliBarre();
        pannello.remove();
        pannello = null;
        C.modifica(false);
        fineTrascinamento();
    }

    window.PublicEditor = {
        apri,
        /** Aggiunge una scheda al pannello: { id, nome, disegna(contesto) -> elementi, esci?() } */
        estendi(scheda) { if (!estensioni.some(e => e.id === scheda.id)) estensioni.push(scheda); },
        accendi(id) { cambia(c => P.accendi(c, id, true)); },
        get aperto() { return !!pannello; }
    };
})();
