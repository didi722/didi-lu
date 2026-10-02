// =====================================================
// PUBLIC EDITOR — l'allenatore personalizza la sua pagina pubblica (docs/public.html)
//
// Si carica solo quando chi guarda è il proprietario della pagina (lo fa public-card.js).
// Cambia la configurazione "in diretta": ogni scelta si vede subito sulla carta, e solo "SAVE"
// la scrive su Firebase (players/{id}/info/pagina). "Cancel" torna a come era.
//
// Cosa si può fare:
//   - scegliere il layout (Trainer Card, Poster, Dossier, Collage);
//   - spegnere, accendere e spostare i blocchi tra le zone: coi pulsanti del pannello, oppure
//     trascinandoli direttamente sulla carta dalla loro maniglia;
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
    let storia = [];              // configurazioni precedenti, per "undo"
    let ultimaChiave = '';
    let ultimoTempo = 0;
    let trascinato = null;        // id del blocco che si sta trascinando
    let ascoltatori = [];         // [bersaglio, evento, funzione] da togliere alla chiusura
    let avviso = null;

    const SCHEDE = [['layout', 'Layout'], ['blocchi', 'Blocks'], ['sfondo', 'Background'], ['carta', 'Card'], ['adesivi', 'Stickers'], ['contenuto', 'Content']];
    const COLORI_SFONDO = ['#ff6b9d', '#ff5a3c', '#ff9a4d', '#ffde4d', '#7cf29a', '#31c489', '#00bfa5', '#8fd3ff', '#3399ff', '#c4a3ff', '#ffffff', '#17171c'];
    const cfg = () => C.stato.config;
    const colore = () => C.stato.dati.colore;

    // ---- Cambiare la configurazione -----------------------------------------------------------

    /**
     * Applica una modifica alla configurazione in vista.
     * opzioni.chiave: le modifiche di fila con la stessa chiave (uno slider) contano come un solo "undo"
     * opzioni.senzaPannello: non ridisegnare il pannello (si sta ancora trascinando uno slider)
     */
    function cambia(modifica, opzioni = {}) {
        const prima = P.copia(cfg());
        const dopo = modifica(P.copia(cfg())) || null;
        if (!dopo) return;
        const adesso = Date.now();
        const accorpa = opzioni.chiave && opzioni.chiave === ultimaChiave && adesso - ultimoTempo < 1200;
        if (!accorpa) { storia.push(prima); if (storia.length > 40) storia.shift(); }
        ultimaChiave = opzioni.chiave || '';
        ultimoTempo = adesso;
        C.imposta(dopo);
        if (opzioni.senzaPannello) aggiornaPiede(); else disegnaPannello();
    }

    function annulla() {
        if (!storia.length) return;
        ultimaChiave = '';
        C.imposta(storia.pop());
        disegnaPannello();
    }

    const sporco = () => !P.uguali(cfg(), C.stato.salvata);

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
        h('p', { class: 'pe-nota', testo: 'The blocks stay where you put them: switching layout only changes how the three zones are drawn.' })];
    }

    // ---- Scheda: blocchi ----------------------------------------------------------------------

    function schedaBlocchi() {
        const per = P.blocchiPerZona(cfg());
        const zone = P.LAYOUT[cfg().layout].zone;
        return [
            h('p', { class: 'pe-nota', testo: 'Show, hide and move the blocks. You can also drag them straight on the card by their handle.' }),
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
        const personalizzato = s.colore !== 'giocatore' && !COLORI_SFONDO.includes(s.colore);
        const campoColore = h('input', { type: 'color', class: 'pe-colore-libero', value: s.colore === 'giocatore' ? proprio : s.colore, title: 'Pick any colour', 'aria-label': 'Custom colour',
            oninput: e => cambia(c => { c.sfondo.colore = e.target.value; return c; }, { chiave: 'sfondo-colore', senzaPannello: true }),
            onchange: () => disegnaPannello() });
        return [
            sezione('Pattern', h('div', { class: 'pe-motivi' }, Object.entries(P.MOTIVI).map(([id, nome]) =>
                h('button', { type: 'button', class: `pe-motivo${s.motivo === id ? ' is-on' : ''}`, 'aria-pressed': String(s.motivo === id), onclick: () => cambia(c => { c.sfondo.motivo = id; return c; }) },
                    h('span', { class: 'pe-motivo-prova', stile: anteprima(id) }), h('small', { testo: nome }))))),
            sezione('Colour', h('div', { class: 'pe-campioni' },
                campione(proprio, s.colore === 'giocatore', 'My colour', () => cambia(c => { c.sfondo.colore = 'giocatore'; return c; }), h('span', { class: 'pe-campione-etichetta', testo: 'ME' })),
                COLORI_SFONDO.map(x => campione(x, s.colore === x, x, () => cambia(c => { c.sfondo.colore = x; return c; }))),
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
            sezione('Card colour', h('div', { class: 'pe-campioni' }, Object.entries(P.TEMI).map(([id, t]) =>
                campione(t.colore || proprio, k.tema === id, t.nome, () => nuovo('tema', id), id === 'colore' ? h('span', { class: 'pe-campione-etichetta', testo: 'ME' }) : null)))),
            sezione('Hard shadow', segmentato(P.OMBRE.map(o => [o, o === 0 ? 'None' : o === 6 ? 'S' : o === 10 ? 'M' : 'L']), k.ombra, v => nuovo('ombra', v))),
            sezione('Borders', segmentato(P.BORDI.map(b => [b, b === 3 ? 'Thin' : b === 4 ? 'Normal' : 'Thick']), k.bordo, v => nuovo('bordo', v))),
            sezione('Corners', segmentato([['netti', 'Square'], ['tondi', 'Round']], k.angoli, v => nuovo('angoli', v))),
            sezione('Tilt', segmentato([['nessuna', 'Straight'], ['lieve', 'Slight'], ['forte', 'Wild']], k.inclinazione, v => nuovo('inclinazione', v))),
            sezione('Lettering', h('div', { class: 'pe-caratteri' }, Object.entries(P.FONT).map(([id, f]) =>
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

    function costruisciPannello() {
        pannello = h('aside', { id: 'pe-pannello', class: 'pe-pannello', role: 'dialog', 'aria-label': 'Customize your card' },
            h('header', { class: 'pe-testa' },
                h('h2', {}, h('span', { 'aria-hidden': 'true', testo: '✎ ' }), 'CUSTOMIZE'),
                h('button', { type: 'button', id: 'pe-annulla', class: 'pe-icona pe-testa-btn', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: annulla, testo: '↶' }),
                h('button', { type: 'button', class: 'pe-icona pe-testa-btn', title: 'Close', 'aria-label': 'Close', onclick: chiudi, testo: '×' })),
            h('nav', { class: 'pe-schede', role: 'tablist' }, SCHEDE.map(([id, nome]) =>
                h('button', { type: 'button', role: 'tab', 'data-scheda': id, onclick: () => { scheda = id; disegnaPannello(); }, testo: nome }))),
            h('div', { class: 'pe-corpo', id: 'pe-corpo' }),
            h('footer', { class: 'pe-piede' },
                h('div', { class: 'pe-piede-sopra' },
                    h('button', { type: 'button', class: 'pe-bottone', onclick: () => cambia(c => P.casuale(c)), title: 'Random look, keeps your blocks', testo: '🎲 Surprise me' }),
                    h('button', { type: 'button', class: 'pe-bottone', onclick: () => cambia(() => P.predefinita()), title: 'Back to the default look', testo: '↺ Reset' })),
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
        corpo.replaceChildren(...CONTENUTI[scheda]().flat().filter(Boolean));
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

    async function salva() {
        const bottone = pannello.querySelector('#pe-salva');
        bottone.disabled = true;
        bottone.textContent = 'SAVING…';
        const daSalvare = P.copia(cfg());
        try {
            const database = typeof db !== 'undefined' ? db : firebase.database();
            // la configurazione di partenza non si scrive: se un giorno cambia, chi non ha scelto niente la segue
            await database.ref(`players/${C.stato.dati.chiave}/info/pagina`).set(P.uguali(daSalvare, P.predefinita()) ? null : daSalvare);
            C.salvata(daSalvare);
            storia = [];
            avvisa('Saved! Your card is live.');
        } catch (e) {
            console.error('Saving the card failed:', e);
            avvisa(e && e.code === 'PERMISSION_DENIED'
                ? 'The database refused to save this (permissions). Ask the admin to allow players/<you>/info/pagina.'
                : `Could not save: ${e && e.message ? e.message : 'unknown error'}`, true);
        } finally {
            bottone.disabled = false;
            bottone.textContent = 'SAVE';
            disegnaPannello();
        }
    }

    // ---- Trascinare i blocchi -----------------------------------------------------------------

    /** In quale posizione della zona cade il puntatore, tra i blocchi che ci sono già (escluso quello trascinato) */
    function indiceNellaZona(zona, x, y) {
        const figli = Array.from(zona.children).filter(e => e.classList.contains('pp-blocco') && e.dataset.blocco !== trascinato);
        if (!figli.length) return 0;
        const riga = getComputedStyle(zona).flexDirection.startsWith('row');
        let migliore = 0, distanza = Infinity, prima = true;
        figli.forEach((e, i) => {
            const r = e.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const d = Math.hypot(x - cx, y - cy);
            if (d < distanza) { distanza = d; migliore = i; prima = riga ? x < cx : y < cy; }
        });
        return prima ? migliore : migliore + 1;
    }

    function ascolta(bersaglio, evento, funzione, opzioni) {
        bersaglio.addEventListener(evento, funzione, opzioni);
        ascoltatori.push([bersaglio, evento, funzione, opzioni]);
    }

    function sulla(zonaEl) {
        const evidenzia = su => zonaEl.classList.toggle('pp-sopra', su);
        ascolta(zonaEl, 'dragover', e => { if (!trascinato) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; evidenzia(true); });
        ascolta(zonaEl, 'dragleave', e => { if (!zonaEl.contains(e.relatedTarget)) evidenzia(false); });
        ascolta(zonaEl, 'drop', e => {
            if (!trascinato) return;
            e.preventDefault();
            evidenzia(false);
            const id = trascinato, zona = zonaEl.dataset.zona;
            const indice = indiceNellaZona(zonaEl, e.clientX, e.clientY);
            trascinato = null;
            cambia(c => P.sposta(c, id, zona, indice));
        });
    }

    function fineTrascinamento() {
        trascinato = null;
        document.querySelectorAll('.pp-sopra, .pp-in-volo, .pe-sopra').forEach(e => e.classList.remove('pp-sopra', 'pp-in-volo', 'pe-sopra'));
    }

    // La barra di ogni blocco sulla carta: maniglia per trascinarlo e occhio per nasconderlo
    function installaBarre() {
        for (const [id, el] of Object.entries(C.stato.blocchi)) {
            if (el.querySelector(':scope > .pp-barra-blocco')) continue;
            const maniglia = h('span', { class: 'pp-maniglia', draggable: 'true', title: 'Drag to move this block', 'aria-label': `Drag ${P.BLOCCHI[id].nome}`, testo: '⠇' });
            maniglia.addEventListener('dragstart', e => {
                trascinato = id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
                try { e.dataTransfer.setDragImage(el, 24, 24); } catch (_) { /* il browser usa l'immagine di default */ }
                setTimeout(() => el.classList.add('pp-in-volo'), 0);
            });
            maniglia.addEventListener('dragend', fineTrascinamento);
            const occhio = h('button', { type: 'button', class: 'pp-occhio', title: 'Hide this block', 'aria-label': `Hide ${P.BLOCCHI[id].nome}`, onclick: ev => { ev.stopPropagation(); cambia(c => P.accendi(c, id, false)); }, testo: '◉' });
            el.prepend(h('div', { class: 'pp-barra-blocco' }, maniglia, h('span', { class: 'pp-barra-nome', testo: P.BLOCCHI[id].nome }), occhio));
        }
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
            if (e.key === 'Escape') { chiudi(); return; }
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

    function apri(card) {
        C = card;
        h = card.h;
        if (pannello) return;
        storia = [];
        scheda = 'layout';
        C.stato.dopoApplica = () => { installaBarre(); };
        C.modifica(true);
        installaBarre();
        costruisciPannello();
        disegnaPannello();
        for (const zonaEl of Object.values(C.stato.zone)) sulla(zonaEl);
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
        accendi(id) { cambia(c => P.accendi(c, id, true)); },
        get aperto() { return !!pannello; }
    };
})();
