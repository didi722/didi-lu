// =====================================================
// APP — le schede della battaglia: i tooltip di Showdown rifatti come schede da gioco
// ---------------------------------------------------------------------
// Solo nell'app, sul telefono (app.js lo scarica per battle.html, prima di app-battaglia.js). Tenendo premuto un Pokémon o una mossa compare quello che da PC
// è un tooltip; qui diventa una scheda come quelle dei giochi, pensata per lo schermo girato:
//   Pokémon  a sinistra lui (la GIF che si muove su un fondo dei suoi due tipi, nome, livello, tipi), a destra la vita, le sei statistiche a barre colorate come nella
//            schermata "Sommario", abilità e strumento, le quattro mosse come tasti del colore del tipo
//   Mossa    una fascia del colore del tipo col nome, tipo e categoria; le placche Potenza / Precisione (e Priorità); la descrizione, le caratteristiche e,
//            sugli avversari, quanto è efficace (×2, ×½, ×0)
// Non si inventa niente: i numeri sono quelli che Showdown e battle-extra.js hanno già scritto nel tooltip (ne leggiamo il DOM e lo rifacciamo); se qualcosa non torna
// (un tooltip che non conosciamo: il campo, un'abilità) resta quello di prima.
//   AppSchede.trasforma(tooltip, { gif, id, SpritePkm })   riscrive il .tooltip (una volta sola: data-sc)
// =====================================================
(function (radice, fabbrica) {
    const S = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = S;
    else radice.AppSchede = S;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // i colori dei tipi: la stessa palette dei cartellini del sito (style-battle.css, .t-fire…)
    const COLORI_TIPO = {
        normal: '#aaaa99', fire: '#ff4422', water: '#3399ff', electric: '#ffcc33', grass: '#77cc55', ice: '#66ccff', fighting: '#bb5544', poison: '#aa5599',
        ground: '#ddbb55', flying: '#8899ff', psychic: '#ff5599', bug: '#aabb22', rock: '#bbaa66', ghost: '#6666bb', dragon: '#7766ee', dark: '#775544',
        steel: '#aaaabb', fairy: '#ee99ee'
    };
    const COLORE_NEUTRO = '#8a8a9c';           // tipo che non conosciamo (Stellar, ???)
    const TIPI_SCURI = ['ghost', 'dark', 'dragon', 'poison', 'fighting'];       // su questi la scritta è chiara
    /** Le tre categorie delle mosse, come le icone di Showdown */
    const CATEGORIE = { physical: 'Physical', special: 'Special', status: 'Status' };
    /** Il valore di una statistica a barra piena */
    const PIENO_STAT = 500;

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pulisci = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    const idDi = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, '');

    const coloreTipo = tipo => COLORI_TIPO[idDi(tipo)] || COLORE_NEUTRO;

    /** Quanta barra (0–100) per una statistica: 500 è la barra piena */
    function percStat(valore) {
        return Math.max(0, Math.min(100, Math.round((Number(valore) || 0) / PIENO_STAT * 100)));
    }

    /** La fascia di colore di una statistica (1 = bassa … 5 = altissima), come le barre del "Sommario" dei giochi */
    function fasciaStat(valore) {
        const n = Number(valore) || 0;
        return n < 100 ? 1 : n < 200 ? 2 : n < 300 ? 3 : n < 400 ? 4 : 5;
    }

    const percentuale = v => Math.max(0, Math.min(100, Number(v) || 0));

    // ---------- Le piccole parti ----------

    function htmlTipo(tipo) {
        const chiaro = TIPI_SCURI.includes(idDi(tipo)) ? ' sc-chiaro' : '';
        return `<span class="sc-tipo${chiaro}" style="--tipo:${coloreTipo(tipo)}">${esc(tipo)}</span>`;
    }

    function htmlCategoria(categoria) {
        const id = idDi(categoria);
        if (!CATEGORIE[id]) return '';
        return `<span class="sc-cat sc-cat-${id}">${CATEGORIE[id]}</span>`;
    }

    // ---------- La scheda del Pokémon ----------

    /**
     * La scheda di un Pokémon da quello che il tooltip dice (vedi leggiPokemon):
     *  { nome, specie, livello, lato, tipi: [], note: [], hp: { perc, classe: 'g|y|r', testo, stato, extra } | null, righe: [{ etichetta, valore }],
     *    possibili: [], stat: [{ nome, valore, base, dir, boost }] | null, velocita: { testo, note: [] } | null, boost: [{ testo, dir }], mosseTitolo, mosse: [{ tipo, nome, pp }] }
     *  opzioni.gif: l'indirizzo della GIF della specie (senza, la scheda non ha immagine)
     */
    function htmlCartaPokemon(d, opzioni = {}) {
        const tipi = d.tipi || [];
        const t1 = tipi[0] ? coloreTipo(tipi[0]) : COLORE_NEUTRO;
        const t2 = tipi[1] ? coloreTipo(tipi[1]) : t1;
        const specieDellaGif = d.specie || d.nome;
        const gif = typeof opzioni.gif === 'function' && specieDellaGif ? opzioni.gif(specieDellaGif) : '';
        const idGif = typeof opzioni.id === 'function' && specieDellaGif ? opzioni.id(specieDellaGif) : '';

        let eroe = `<div class="sc-eroe" style="--t1:${t1};--t2:${t2}">`;
        if (d.livello) eroe += `<span class="sc-livello">${esc(d.livello)}</span>`;
        if (gif) eroe += `<img class="sc-img" src="${esc(gif)}" data-id="${esc(idGif)}" alt="" draggable="false">`;
        eroe += `<b class="sc-nome">${esc(d.nome)}</b>`;
        if (d.specie) eroe += `<small class="sc-specie">${esc(d.specie)}</small>`;
        eroe += `<span class="sc-tipi">${tipi.map(htmlTipo).join('')}</span>`;
        if ((d.note || []).length) eroe += `<span class="sc-note">${d.note.map(n => `<i>${esc(n)}</i>`).join('')}</span>`;
        eroe += '</div>';

        let corpo = '<div class="sc-corpo">';
        if (d.hp) {
            const classe = d.hp.classe === 'r' ? 'r' : d.hp.classe === 'y' ? 'y' : 'g';
            corpo += `<div class="sc-hp"><span class="sc-et">HP</span><span class="sc-barra"><i class="sc-hp-${classe}" style="width:${percentuale(d.hp.perc)}%"></i></span><b>${esc(d.hp.testo)}</b>`;
            if (d.hp.stato) corpo += `<span class="sc-stato ${esc(d.hp.stato.codice)}">${esc(d.hp.stato.testo)}</span>`;
            if (d.hp.extra) corpo += `<small>${esc(d.hp.extra)}</small>`;
            corpo += '</div>';
        }

        if ((d.stat || []).length) {
            corpo += '<div class="sc-stat">' + d.stat.map(s => {
                const dir = s.dir === 'su' || s.dir === 'giu' ? ' ' + s.dir : '';
                const boost = s.boost ? `<em>${esc(s.boost)}</em>` : '';
                return `<div class="sc-st sc-v${fasciaStat(s.valore)}${dir}"><span>${esc(s.nome)}${boost}</span><span class="sc-barra"><i style="width:${percStat(s.valore)}%"></i></span><b>${esc(s.valore)}</b></div>`;
            }).join('') + '</div>';
        } else if (d.velocita) {
            corpo += `<div class="sc-vel"><span class="sc-et">Speed</span><b>${esc(d.velocita.testo)}</b>${(d.velocita.note || []).map(n => `<small>${esc(n)}</small>`).join('')}`
                + (d.boost || []).map(b => `<span class="sc-boost ${b.dir === 'su' ? 'su' : 'giu'}">${esc(b.testo)}</span>`).join('') + '</div>';
        } else if ((d.boost || []).length) {
            corpo += '<div class="sc-vel">' + d.boost.map(b => `<span class="sc-boost ${b.dir === 'su' ? 'su' : 'giu'}">${esc(b.testo)}</span>`).join('') + '</div>';
        }

        const chips = (d.righe || []).map(r => `<span class="sc-chip"><small>${esc(r.etichetta)}</small><b>${esc(r.valore)}</b></span>`)
            .concat((d.possibili || []).map(p => `<span class="sc-chip sc-poss"><small>Ability?</small><b>${esc(p)}</b></span>`));
        if (chips.length) corpo += `<div class="sc-chips">${chips.join('')}</div>`;

        if ((d.mosse || []).length) {
            corpo += `<div class="sc-mosse"><span class="sc-et">${esc(d.mosseTitolo || 'Moves')}</span>`
                + d.mosse.map(m => `<span class="sc-mossa${TIPI_SCURI.includes(idDi(m.tipo)) ? ' sc-chiaro' : ''}" style="--tipo:${coloreTipo(m.tipo)}"><b>${esc(m.nome)}</b>${m.pp ? `<small>${esc(m.pp)}</small>` : ''}</span>`).join('') + '</div>';
        }
        corpo += '</div>';

        return `<div class="sc sc-pkm${d.lato ? ' ' + esc(d.lato) : ''}">${eroe}${corpo}</div>`;
    }

    /** Il tooltip di un Pokémon (quello di battle-extra.js, htmlPokemon) letto come dati; null se non è quello */
    function leggiPokemon(t) {
        const testa = t.querySelector('.tt-testa');
        if (!testa) return null;
        const nomeEl = testa.querySelector('.tt-nome');
        const piccoli = nomeEl ? Array.from(nomeEl.querySelectorAll('small')).map(s => pulisci(s.textContent)) : [];
        let nome = '';
        if (nomeEl) for (const n of Array.from(nomeEl.childNodes)) if (n.nodeType === 3) nome += n.textContent;
        const lato = /(?:^|\s)(p[12])(?:\s|$)/.exec(testa.className || '');
        const d = {
            nome: pulisci(nome),
            specie: piccoli.find(s => !/^lv\b/i.test(s)) || '',
            livello: piccoli.find(s => /^lv\b/i.test(s)) || '',
            lato: lato ? lato[1] : '',
            tipi: Array.from(testa.querySelectorAll('.tt-tipo')).map(e => pulisci(e.textContent)),
            note: Array.from(testa.querySelectorAll('.tt-nota')).map(e => pulisci(e.textContent)),
            hp: null, righe: [], possibili: [], stat: null, velocita: null, boost: [], mosseTitolo: '', mosse: []
        };
        if (!d.nome) return null;

        const hpEl = t.querySelector('.tt-hp');
        if (hpEl) {
            const barra = hpEl.querySelector('.tt-barra > span');
            const larghezza = barra ? /width:\s*([\d.]+)%/.exec(barra.getAttribute('style') || '') : null;
            const classe = barra ? barra.className || '' : '';
            const testo = hpEl.querySelector('b');
            const stato = hpEl.querySelector('.tag-stato');
            const extra = hpEl.querySelector(':scope > small');
            d.hp = {
                perc: larghezza ? Number(larghezza[1]) : 0,
                classe: /hp-r/.test(classe) ? 'r' : /hp-y/.test(classe) ? 'y' : 'g',
                testo: pulisci(testo ? testo.textContent : ''),
                stato: stato ? { codice: (/\b(par|brn|psn|tox|slp|frz)\b/.exec(stato.className || '') || ['', ''])[1], testo: pulisci(stato.textContent) } : null,
                extra: extra ? pulisci(extra.textContent) : ''
            };
        }

        // abilità e strumento (la natura non serve per giocare)
        for (const riga of Array.from(t.querySelectorAll('.tt-corpo .tt-riga'))) {
            if (riga.closest('.tt-mossa')) continue;
            const et = riga.querySelector('.tt-etichetta');
            const etichetta = pulisci(et ? et.textContent : '');
            if (!etichetta || /^nature$/i.test(etichetta)) continue;
            const chips = Array.from(riga.querySelectorAll('.tt-chip'));
            if (chips.length) { for (const c of chips) d.possibili.push(pulisci(c.textContent)); continue; }
            const valore = riga.querySelector('.tt-valore');
            const testo = pulisci(valore ? valore.textContent : '');
            if (testo) d.righe.push({ etichetta, valore: testo });
        }

        // statistiche: le sei, oppure (avversario senza open sheet) la velocità possibile
        const celle = Array.from(t.querySelectorAll('.tt-griglia-stat .tt-cella'));
        if (celle.length) {
            d.stat = celle.map(c => {
                const valore = c.querySelector('b');
                const base = c.querySelector('small');
                const boost = c.querySelector('em');
                const classi = c.className || '';
                return {
                    nome: pulisci((c.querySelector('span') || {}).textContent),
                    valore: pulisci(valore ? valore.textContent : ''),
                    base: base ? pulisci(base.textContent) : '',
                    dir: /(?:^|\s)su(?:\s|$)/.test(classi) ? 'su' : /(?:^|\s)giu(?:\s|$)/.test(classi) ? 'giu' : '',
                    boost: boost ? pulisci(boost.textContent) : ''
                };
            }).filter(s => s.nome && s.valore);
        } else {
            const grande = t.querySelector('.tt-grande');
            if (grande) {
                d.velocita = {
                    testo: pulisci(grande.textContent),
                    note: Array.from(t.querySelectorAll('.tt-sub')).map(e => pulisci(e.textContent)).filter(x => /^at\s/i.test(x))
                };
            }
        }
        if (!d.stat) {
            d.boost = Array.from(t.querySelectorAll('.tt-chips .tt-chip.su, .tt-chips .tt-chip.giu'))
                .map(c => ({ testo: pulisci(c.textContent), dir: /(?:^|\s)su(?:\s|$)/.test(c.className || '') ? 'su' : 'giu' }));
        }

        const sezioneMosse = Array.from(t.querySelectorAll('.tt-sezione')).find(s => s.querySelector('.tt-mossa'));
        if (sezioneMosse) {
            const titolo = sezioneMosse.querySelector('.tt-titolo');
            d.mosseTitolo = pulisci(titolo ? titolo.textContent : '');
            d.mosse = Array.from(sezioneMosse.querySelectorAll('.tt-mossa')).map(m => {
                const tipo = m.querySelector('.tt-tipo');
                const nomeMossa = m.querySelector('span:not(.tt-tipo)');
                const pp = m.querySelector('small');
                return { tipo: pulisci(tipo ? tipo.textContent : ''), nome: pulisci(nomeMossa ? nomeMossa.textContent : ''), pp: pp ? pulisci(pp.textContent) : '' };
            }).filter(m => m.nome);
        }
        return d;
    }

    // ---------- La scheda della mossa ----------

    /**
     * La scheda di una mossa da quello che il tooltip dice (vedi leggiMossa):
     *  { nome, tipo, categoria, potenza, potenze: [], precisione, priorita, descrizione, bersaglio, effetto, tag: [], efficacia: [{ nome, classe, testo }] }
     */
    function htmlCartaMossa(d) {
        const colore = coloreTipo(d.tipo);
        const banda = `<div class="sc-banda"><b class="sc-nome">${esc(d.nome)}</b><span class="sc-tipi">${htmlTipo(d.tipo)}${htmlCategoria(d.categoria)}</span></div>`;

        const placche = [];
        if (d.potenze && d.potenze.length) placche.push(`<div class="sc-placca sc-placca-lunga"><small>Power</small>${d.potenze.map(p => `<b>${esc(p)}</b>`).join('')}</div>`);
        else if (d.potenza) placche.push(`<div class="sc-placca"><small>Power</small><b>${esc(d.potenza)}</b></div>`);
        if (d.precisione) placche.push(`<div class="sc-placca"><small>Accuracy</small><b>${esc(d.precisione)}</b></div>`);
        if (d.priorita) placche.push(`<div class="sc-placca"><small>Priority</small><b>${esc(d.priorita)}</b></div>`);

        let dettagli = '';
        if (d.descrizione) dettagli += `<p class="sc-desc">${esc(d.descrizione)}</p>`;
        if (d.effetto) dettagli += `<p class="sc-desc sc-effetto">${esc(d.effetto)}</p>`;
        const tag = (d.tag || []).map(x => `<span class="sc-tag">${esc(x)}</span>`);
        if (d.bersaglio) tag.unshift(`<span class="sc-tag sc-bersaglio">${esc(d.bersaglio)}</span>`);
        if (tag.length) dettagli += `<div class="sc-tags">${tag.join('')}</div>`;
        if ((d.efficacia || []).length) {
            dettagli += '<div class="sc-eff"><span class="sc-et">Against</span>' + d.efficacia.map(e => {
                // "×2 Super effective": il moltiplicatore grande, il resto piccolo
                const m = /^(\S*[×x]\S*)\s+(.*)$/.exec(e.testo);
                const classe = /^(super|poco|nullo|neutro)$/.test(e.classe) ? e.classe : 'neutro';
                return `<span class="sc-ef sc-ef-${classe}"><small>${esc(e.nome)}</small><b>${esc(m ? m[1] : e.testo)}</b>${m ? `<i>${esc(m[2])}</i>` : ''}</span>`;
            }).join('') + '</div>';
        }

        return `<div class="sc sc-mv" style="--t1:${colore}">${banda}<div class="sc-placche">${placche.join('')}</div><div class="sc-dettagli">${dettagli}</div></div>`;
    }

    /** Il tooltip di una mossa (quello nativo di Showdown, con in fondo l'efficacia di battle-extra.js) letto come dati; null se non è quello */
    function leggiMossa(t) {
        const h2 = t.querySelector('h2');
        if (!h2) return null;
        const immagini = Array.from(h2.querySelectorAll('img'));
        const tipo = pulisci(immagini[0] ? immagini[0].getAttribute('alt') : '');
        if (!tipo) return null;
        const primo = h2.childNodes && h2.childNodes[0];
        const d = {
            nome: pulisci(primo ? primo.textContent : ''),
            tipo,
            categoria: pulisci(immagini[1] ? immagini[1].getAttribute('alt') : ''),
            potenza: '', potenze: [], precisione: '', priorita: '', descrizione: '', bersaglio: '', effetto: '', tag: [], efficacia: []
        };
        if (!d.nome) return null;

        const descrizioni = [];
        for (const p of Array.from(t.querySelectorAll('p'))) {
            if (p.closest('.tt-efficacia')) continue;
            const testo = pulisci(p.textContent);
            if (!testo) continue;
            const classi = p.className || '';
            if (/(?:^|\s)movetag(?:\s|$)/.test(classi)) {
                // "✓ Makes contact (the target's contact abilities…)": il nome della caratteristica, senza il suggerimento
                const nomeTag = pulisci(testo.replace(/^[✓✔]\s*/, '').replace(/\s*\(.*$/, ''));
                if (nomeTag) d.tag.push(nomeTag);
            } else if (/^base power vs\.?/i.test(testo)) {
                // una riga per avversario: "Base power vs. Garchomp: 90"
                for (const riga of String(p.innerHTML || '').split(/<br\s*\/?>/i)) {
                    const r = pulisci(riga.replace(/<[^>]*>/g, ''));
                    if (r) d.potenze.push(r.replace(/^base power vs\.?\s*/i, ''));
                }
            } else if (/^base power/i.test(testo)) {
                const m = /:\s*(.+)$/.exec(testo);
                d.potenza = m ? pulisci(m[1]) : '';
            } else if (/^accuracy/i.test(testo)) {
                const m = /:\s*(.+)$/.exec(testo);
                d.precisione = m ? pulisci(m[1]) : '';
            } else if (/^z-effect/i.test(testo)) {
                const m = /:\s*(.+)$/.exec(testo);
                d.effetto = 'Z-Effect: ' + (m ? pulisci(m[1]) : '');
            } else if (/^◎/.test(testo)) {
                d.bersaglio = pulisci(testo.replace(/^◎\s*/, ''));
            } else {
                const pr = /priority\s*([+−-])\s*(\d+)/i.exec(testo);
                if (pr && /(first|last)/i.test(testo) && testo.length < 80) d.priorita = (pr[1] === '+' ? '+' : '−') + pr[2];
                else descrizioni.push(testo);
            }
        }
        d.descrizione = descrizioni.join(' ');

        for (const riga of Array.from(t.querySelectorAll('.tt-efficacia .tt-riga'))) {
            const nomi = riga.querySelector('.tt-nomi');
            const badge = riga.querySelector('.tt-badge');
            if (!nomi || !badge) continue;
            const classe = (/(?:^|\s)(super|poco|nullo|neutro)(?:\s|$)/.exec(badge.className || '') || ['', 'neutro'])[1];
            d.efficacia.push({ nome: pulisci(nomi.textContent), classe, testo: pulisci(badge.textContent) });
        }
        return d;
    }

    // ---------- Il tooltip sullo schermo ----------

    /**
     * Rifà il tooltip `t` come scheda (una volta sola: data-sc dice che è fatta). Ritorna 'pkm' | 'mossa' se l'ha rifatta, altrimenti null (il tooltip resta com'è).
     * opzioni: { gif, id } per l'immagine del Pokémon (win.SpritePkm); { riserva } chiamata sulle immagini che non si caricano
     */
    function trasforma(t, opzioni = {}) {
        if (!t || (t.dataset && t.dataset.sc)) return null;
        let tipo = null, html = '';
        try {
            const pokemon = leggiPokemon(t);
            if (pokemon) { tipo = 'pkm'; html = htmlCartaPokemon(pokemon, opzioni); }
            else {
                const mossa = leggiMossa(t);
                if (mossa) { tipo = 'mossa'; html = htmlCartaMossa(mossa); }
            }
        } catch (e) { return null; }
        if (!tipo) return null;
        t.dataset.sc = tipo;
        t.innerHTML = html;
        if (typeof opzioni.riserva === 'function') {
            for (const img of Array.from(t.querySelectorAll('img.sc-img'))) img.addEventListener('error', () => opzioni.riserva(img, img.dataset.id));
        }
        return tipo;
    }

    return {
        COLORI_TIPO, COLORE_NEUTRO, PIENO_STAT, esc, pulisci, coloreTipo, percStat, fasciaStat,
        htmlTipo, htmlCategoria, htmlCartaPokemon, htmlCartaMossa, leggiPokemon, leggiMossa, trasforma
    };
});
