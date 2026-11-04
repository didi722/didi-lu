// =====================================================
// SCHEDE DA CONDIVIDERE — Poké-Tournament
//
// Un'immagine nello stile del sito (carta bianca, striscia nera con i tre pallini, bordi spessi, i colori degli allenatori) da mandare in una chat:
// un TEAM, uno SHOWDOWN, un REPLAY (con il link), la scheda di un ALLENATORE. Il telefono apre il menu di condivisione (WhatsApp compreso), sul PC
// l'immagine si scarica o il testo si copia.
//
//   SchedaCondivisione.team(team, { giocatore, colore, avatar, record })      → la scheda (dati semplici) di un team
//   SchedaCondivisione.showdown(info, matches, { colori, avatar })            → di uno showdown
//   SchedaCondivisione.replay(showdown, { set, match, esitoSet, turni, url }) → di un set (con il link)
//   SchedaCondivisione.allenatore({ nome, colore, avatar, info, riepilogo })   → della scheda di un allenatore (riepilogo = riepilogoStat della sua pagina)
//   SchedaCondivisione.testo(scheda)                                          → il testo che accompagna l'immagine
//   SchedaCondivisione.disegna(win, scheda, { gif })                          → il canvas (async)
//   SchedaCondivisione.condividi(win, scheda, { gif })                        → disegna e apre l'anteprima con SHARE / SAVE / COPY
//
// Le schede (le parti pure) si provano in Node (test/scheda-condivisione.test.js); il disegno gira nel browser.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.SchedaCondivisione = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NOME_LEGA = "Sant'Alvise League";
    const coloreSicuro = (c, vuoto) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : vuoto);
    const testo = (t, max = 60) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    // "Soprannome (Specie)" → la specie, per lo sprite
    const specieDaNome = nome => { const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(String(nome || '').trim()); return m ? m[2].trim() : String(nome || '').trim(); };

    // ---------------------------------------------------------------- le schede (dati semplici)

    /** Un team: nome, formato, di chi è e fino a 6 Pokémon con strumento e mosse */
    function team(t, { giocatore = '', colore = '', avatar = '', record = null } = {}) {
        const pokemon = valori(t && t.pokemon).filter(p => p && p.nome).slice(0, 6).map(p => ({
            specie: specieDaNome(p.nome), nome: testo(p.nome, 40), shiny: !!p.shiny,
            strumento: testo(p.strumento, 30), abilita: testo(p.abilita, 30),
            mosse: valori(p.mosse).map(m => testo(m, 26)).filter(m => m && m !== '-').slice(0, 4)
        }));
        const v = record ? num(record.vinti) : 0, p = record ? num(record.persi) : 0;
        return {
            tipo: 'team', titolo: testo(t && t.nome, 40) || 'Team', etichetta: testo(t && (t.categoria || t.category), 30),
            colore: coloreSicuro(colore, '#31c489'), chi: { nome: testo(giocatore, 30), avatar: avatar || '' }, pokemon,
            record: v + p ? { vinti: v, persi: p, perc: Math.round((v / (v + p)) * 100) } : null
        };
    }

    /** Uno showdown: i due allenatori, il punteggio in match vinti e i match uno per uno */
    function showdown(info, matches, { colori = {}, avatar = {} } = {}) {
        const i = info || {};
        const lista = valori(matches).filter(m => m && m.p1score != null && m.p2score != null);
        let v1 = 0, v2 = 0;
        const righe = lista.map(m => {
            const a = num(m.p1score), b = num(m.p2score);
            if (a > b) v1++; else if (b > a) v2++;
            return { team1: testo(m.team1 && typeof m.team1 === 'object' ? m.team1.valore : m.team1, 30), team2: testo(m.team2 && typeof m.team2 === 'object' ? m.team2.valore : m.team2, 30), p1: a, p2: b };
        }).slice(0, 5);
        const n1 = testo(i.player1, 30) || 'TBD', n2 = testo(i.player2, 30) || 'TBD';
        const chiave = n => String(n).toLowerCase().trim();
        return {
            tipo: 'showdown', titolo: 'SHOWDOWN', etichetta: testo(i.categoria, 30), data: testo(i.data, 20),
            lati: [
                { nome: n1, colore: coloreSicuro(colori[chiave(n1)], '#31c489'), avatar: avatar[chiave(n1)] || '', vinti: v1 },
                { nome: n2, colore: coloreSicuro(colori[chiave(n2)], '#8e44ad'), avatar: avatar[chiave(n2)] || '', vinti: v2 }
            ],
            vince: v1 === v2 ? 0 : (v1 > v2 ? 1 : 2), match: righe
        };
    }

    /** Un set di un replay: come lo showdown, ma col set, l'esito, i turni e il link (con il turno, se c'è) */
    function replay(sd, { set = 0, match = 0, esitoSet = '', turni = 0, url = '' } = {}) {
        const s = JSON.parse(JSON.stringify(sd));
        s.tipo = 'replay';
        s.titolo = ['REPLAY', num(match) ? `MATCH ${num(match)}` : '', num(set) ? `SET ${num(set)}` : ''].filter(Boolean).join(' · ');
        s.match1 = num(match);
        s.set = num(set);
        s.esitoSet = testo(esitoSet, 30);
        s.turni = num(turni);
        s.url = String(url || '').slice(0, 300);
        return s;
    }

    /**
     * La scheda di un allenatore, dalle sei statistiche già pronte della sua pagina (pagina-pubblica.js: riepilogoStat) e dalle sue info
     * (colore, avatar, motto, Pokémon compagno).
     */
    function allenatore({ nome = '', colore = '', avatar = '', info = {}, riepilogo = {}, aura = '' } = {}) {
        const r = riepilogo || {};
        const voce = (et, x) => ({ et, val: testo(x && x.grande, 14) || '—', sub: testo(x && x.piccolo, 30) });
        return {
            tipo: 'allenatore', titolo: 'TRAINER', nome: testo(nome, 30) || 'Trainer',
            colore: coloreSicuro(colore, '#31c489'), avatar: avatar || '', aura: coloreSicuro(aura, ''),
            motto: testo(info.motto, 70), compagno: testo(info.pkmPreferito, 30), compagnoShiny: !!info.pkmShiny,
            numeri: [voce('Rank', r.rank), voce('Matches', r.match), voce('Showdowns', r.sd), voce('Sets', r.set)],
            extra: [r.formato && r.formato.grande && r.formato.grande !== '\u2014' ? `Main format: ${testo(r.formato.grande, 30)} (${testo(r.formato.piccolo, 20)})` : '',
                r.punti && r.punti.grande && r.punti.grande !== '0' ? `League points: ${testo(r.punti.grande, 10)}` : ''].filter(Boolean)
        };
    }

    /** Il testo che accompagna l'immagine nella chat */
    function testoDi(s) {
        if (!s) return '';
        if (s.tipo === 'team') return `${s.titolo}${s.etichetta ? ` (${s.etichetta})` : ''}: ${s.pokemon.map(p => p.specie).join(', ')}${s.chi.nome ? ` · ${s.chi.nome}` : ''} — ${NOME_LEGA}`;
        if (s.tipo === 'showdown') return `${s.lati[0].nome} ${s.lati[0].vinti} - ${s.lati[1].vinti} ${s.lati[1].nome}${s.etichetta ? ` · ${s.etichetta}` : ''}${s.data ? ` · ${s.data}` : ''} — ${NOME_LEGA}`;
        if (s.tipo === 'replay') return `${s.lati[0].nome} vs ${s.lati[1].nome}${s.etichetta ? ` · ${s.etichetta}` : ''}${s.match1 ? ` · match ${s.match1}` : ''} · set ${s.set || '?'}${s.url ? `\n${s.url}` : ''}`;
        if (s.tipo === 'allenatore') return `${s.nome}: ${s.numeri.map(n => `${n.et} ${n.val}${n.sub ? ` (${n.sub})` : ''}`).join(' · ')} — ${NOME_LEGA}`;
        return NOME_LEGA;
    }

    /** Il nome del file: team-nome.png */
    const nomeFile = s => `${String((s && s.tipo) || 'scheda')}-${String((s && (s.titolo === 'SHOWDOWN' || s.tipo === 'replay' ? `${s.lati[0].nome}-${s.lati[1].nome}` : (s.nome || s.titolo))) || 'sant-alvise').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}.png`;

    // ---------------------------------------------------------------- il disegno (browser)

    const W = 1080;
    const ALTEZZA = { team: 1350, allenatore: 1350, showdown: 1080, replay: 920 };
    const INK = '#000', CARTA = '#ffffff', SFONDO = '#e6e9ef';
    const FT = '"Josefin Sans", "Arial Black", Arial, sans-serif', FX = '"Montserrat", Arial, sans-serif';

    /** Carica un'immagine senza sporcare il canvas: se non arriva (CORS, rete) si salta */
    function caricaImmagine(win, src) {
        return new Promise(ok => {
            if (!src || !win.Image) return ok(null);
            const img = new win.Image();
            img.crossOrigin = 'anonymous';
            const t = win.setTimeout(() => ok(null), 5000);
            img.onload = () => { win.clearTimeout(t); ok(img); };
            img.onerror = () => { win.clearTimeout(t); ok(null); };
            img.src = src;
        });
    }

    /** L'immagine di un Pokémon: la prima della catena di SpritePkm che arriva (GIF, GIF gen 5, PNG del Pokédex) */
    async function immagineSpecie(win, specie, shiny) {
        const S = win.SpritePkm;
        if (!S || !specie) return null;
        let lista = [];
        try { lista = typeof S.catena === 'function' ? S.catena(specie) : [S.gif(specie)]; } catch (e) { return null; }
        if (shiny) lista = lista.map(u => u.replace('/ani/', '/ani-shiny/').replace('/gen5ani/', '/gen5ani-shiny/').replace('/dex/', '/dex-shiny/'));
        for (const url of lista) { const img = await caricaImmagine(win, url); if (img) return img; }
        return null;
    }

    function strumenti(c) {
        const fit = (t, x, y, maxW, px, peso, fam, col, al = 'left') => {
            let d = px;
            c.font = `${peso} ${d}px ${fam}`;
            while (c.measureText(t).width > maxW && d > 10) { d -= 1; c.font = `${peso} ${d}px ${fam}`; }
            c.fillStyle = col; c.textAlign = al; c.textBaseline = 'alphabetic';
            c.fillText(t, x, y);
        };
        const riquadro = (x, y, w, h, riempi, bordo = 6, ombra = 0) => {
            if (ombra) { c.fillStyle = INK; c.fillRect(x + ombra, y + ombra, w, h); }
            c.fillStyle = riempi; c.fillRect(x, y, w, h);
            c.lineWidth = bordo; c.strokeStyle = INK; c.strokeRect(x + bordo / 2, y + bordo / 2, w - bordo, h - bordo);
        };
        // senza avatar (non c'è, o il server non lo lascia leggere) il cerchio porta l'iniziale dell'allenatore
        const tondo = (img, cx, cy, r, vuoto, lettera) => {
            c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.closePath(); c.fillStyle = vuoto || '#ddd'; c.fill();
            if (img) { c.clip(); c.drawImage(img, cx - r, cy - r, r * 2, r * 2); }
            else if (lettera) { c.fillStyle = INK; c.font = `900 ${Math.round(r * 1.1)}px ${FT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(lettera).charAt(0).toUpperCase(), cx, cy + r * 0.06); c.textBaseline = 'alphabetic'; }
            c.restore(); c.lineWidth = 6; c.strokeStyle = INK; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
        };
        // un'immagine dentro un quadrato, senza deformarla
        const dentro = (img, x, y, lato) => {
            if (!img) return;
            const k = Math.min(lato / img.width, lato / img.height);
            c.drawImage(img, x + (lato - img.width * k) / 2, y + (lato - img.height * k) / 2, img.width * k, img.height * k);
        };
        return { fit, riquadro, tondo, dentro };
    }

    /** Sfondo a puntini, carta con ombra, striscia nera con i tre pallini e il titolo; ritorna l'altezza e dove inizia il contenuto */
    function cornice(c, H, titolo, h) {
        c.fillStyle = SFONDO; c.fillRect(0, 0, W, H);
        c.fillStyle = 'rgba(0,0,0,.07)';
        for (let y = 8; y < H; y += 24) for (let x = 8; x < W; x += 24) { c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill(); }
        h.riquadro(40, 36, W - 80, H - 90, CARTA, 10, 14);
        c.fillStyle = INK; c.fillRect(45, 41, W - 90, 70);
        [['#ff5f57', 50], ['#febc2e', 90], ['#28c840', 130]].forEach(([col, dx]) => { c.fillStyle = col; c.beginPath(); c.arc(40 + dx, 76, 13, 0, Math.PI * 2); c.fill(); });
        h.fit(titolo, 215, 90, W - 280, 34, 800, FT, '#fff');
    }

    function pie(c, H, h, riga) {
        h.fit(riga, W / 2, H - 18, W - 120, 26, 800, FT, '#333', 'center');
    }

    async function disegnaTeam(win, c, s, h) {
        const H = ALTEZZA.team;
        cornice(c, H, 'TEAM', h);
        const imgs = await Promise.all([caricaImmagine(win, s.chi.avatar), ...s.pokemon.map(p => immagineSpecie(win, p.specie, p.shiny))]);
        const avatar = imgs[0];
        // titolo e formato
        h.fit(s.titolo.toUpperCase(), 80, 200, W - 160, 84, 900, FT, INK);
        if (s.etichetta) {
            c.font = `900 30px ${FT}`;
            const w = c.measureText(s.etichetta.toUpperCase()).width + 40;
            h.riquadro(80, 222, w, 52, '#ffbd44', 5, 5);
            h.fit(s.etichetta.toUpperCase(), 80 + w / 2, 260, w - 20, 30, 900, FT, INK, 'center');
        }
        if (s.chi.nome) {
            h.tondo(avatar, W - 130, 215, 48, s.colore, s.chi.nome);
            h.fit(s.chi.nome.toUpperCase(), W - 195, 228, 340, 36, 900, FT, INK, 'right');
        }
        // la griglia dei Pokémon: due colonne, tre righe
        const cw = 450, ch = 285, gx = 80, gy = 305, sp = 18;
        s.pokemon.forEach((p, i) => {
            const x = gx + (i % 2) * (cw + sp), y = gy + Math.floor(i / 2) * (ch + sp);
            h.riquadro(x, y, cw, ch, s.colore, 6, 8);
            c.fillStyle = 'rgba(255,255,255,.78)'; c.fillRect(x + 6, y + 6, cw - 12, ch - 12);
            h.dentro(imgs[i + 1], x + 12, y + 20, 150);
            h.fit(p.specie.toUpperCase(), x + 170, y + 56, cw - 190, 34, 900, FT, INK);
            if (p.strumento) h.fit(p.strumento, x + 170, y + 90, cw - 190, 22, 700, FX, '#333');
            p.mosse.forEach((m, j) => h.fit(`• ${m}`, x + 20 + (j % 2) * (cw / 2 - 5), y + 205 + Math.floor(j / 2) * 40, cw / 2 - 30, 24, 700, FX, INK));
            if (p.abilita) h.fit(p.abilita, x + 170, y + 120, cw - 190, 20, 600, FX, '#555');
        });
        if (s.record) h.fit(`${s.record.vinti} W · ${s.record.persi} L · ${s.record.perc}% wins`, W / 2, H - 82, W - 160, 34, 900, FT, INK, 'center');
        pie(c, H, h, NOME_LEGA.toUpperCase());
    }

    async function disegnaScontro(win, c, s, h) {
        const H = ALTEZZA[s.tipo];
        cornice(c, H, s.titolo, h);
        const avatars = await Promise.all(s.lati.map(l => caricaImmagine(win, l.avatar)));
        if (s.etichetta) {
            c.font = `900 34px ${FT}`;
            const w = c.measureText(s.etichetta.toUpperCase()).width + 50;
            h.riquadro((W - w) / 2, 140, w, 60, '#ffbd44', 5, 5);
            h.fit(s.etichetta.toUpperCase(), W / 2, 183, w - 20, 34, 900, FT, INK, 'center');
        }
        // i due lati sul colore dell'allenatore; chi ha perso si sfuma dentro il bordo (che resta nero)
        const vince = s.tipo === 'replay' ? (s.esitoSet ? (s.esitoSet === s.lati[0].nome ? 1 : s.esitoSet === s.lati[1].nome ? 2 : 0) : 0) : s.vince;
        [0, 1].forEach(i => {
            const l = s.lati[i], x = i === 0 ? 70 : W / 2 + 25, w = W / 2 - 95, y = 240;
            h.riquadro(x, y, w, 360, l.colore, 8, vince === i + 1 ? 14 : 6);
            if (vince && vince !== i + 1) { c.fillStyle = 'rgba(255,255,255,.45)'; c.fillRect(x + 8, y + 8, w - 16, 344); }
            h.tondo(avatars[i], x + w / 2, y + 120, 85, '#fff', l.nome);
            h.fit(l.nome.toUpperCase(), x + w / 2, y + 285, w - 30, 46, 900, FT, INK, 'center');
            if (vince === i + 1) { h.riquadro(x + w / 2 - 55, y + 300, 110, 46, '#ffbd44', 4, 0); h.fit('WIN', x + w / 2, y + 335, 90, 32, 900, FT, INK, 'center'); }
        });
        h.riquadro(W / 2 - 50, 380, 100, 64, '#fff', 5, 5);
        h.fit('VS', W / 2, 428, 80, 40, 900, FT, INK, 'center');
        if (s.tipo === 'showdown') h.fit(`${s.lati[0].vinti} - ${s.lati[1].vinti}`, W / 2, 705, W - 200, 90, 900, FT, INK, 'center');
        // sotto: i match (showdown) o set, turni e link (replay)
        if (s.tipo === 'showdown') {
            s.match.forEach((m, i) => {
                const y = 780 + i * 50;
                h.fit(`${m.team1 || '—'}  ${m.p1}-${m.p2}  ${m.team2 || '—'}`, W / 2, y, W - 200, 30, 800, FX, INK, 'center');
            });
            if (s.data) h.fit(s.data, W / 2, H - 80, W - 160, 30, 800, FT, '#333', 'center');
        } else {
            h.fit(`${s.match1 ? `MATCH ${s.match1} · ` : ''}SET ${s.set || '?'}${s.esitoSet ? ` · ${s.esitoSet.toUpperCase()} WINS` : ''}${s.turni ? ` · ${s.turni} TURNS` : ''}`, W / 2, 690, W - 160, 54, 900, FT, INK, 'center');
            if (s.url) h.fit(s.url.replace(/^https?:\/\//, ''), W / 2, 760, W - 140, 22, 700, FX, '#333', 'center');
            h.fit('Tap the link to watch it', W / 2, 810, W - 160, 28, 800, FT, '#555', 'center');
        }
        pie(c, H, h, NOME_LEGA.toUpperCase());
    }

    async function disegnaAllenatore(win, c, s, h) {
        const H = ALTEZZA.allenatore;
        cornice(c, H, 'TRAINER', h);
        const [avatar, compagno] = await Promise.all([caricaImmagine(win, s.avatar), immagineSpecie(win, s.compagno, s.compagnoShiny)]);
        h.riquadro(80, 150, W - 160, 470, s.colore, 8, 12);
        // senza compagno l'avatar sta al centro del riquadro; l'aura (cosmetico) è un bagliore dietro il cerchio, tenuto dentro il riquadro
        const cx = compagno ? 260 : W / 2;
        if (s.aura) {
            c.save(); c.beginPath(); c.rect(88, 158, W - 176, 454); c.clip();
            c.shadowColor = s.aura; c.shadowBlur = 60; c.fillStyle = s.aura;
            c.beginPath(); c.arc(cx, 385, 138, 0, Math.PI * 2); c.fill(); c.fill();
            c.restore();
        }
        h.tondo(avatar, cx, 385, 140, '#fff', s.nome);
        if (compagno) h.dentro(compagno, 560, 220, 360);
        h.fit(s.nome.toUpperCase(), W / 2, 722, W - 160, 96, 900, FT, INK, 'center');
        if (s.motto) h.fit(`“${s.motto}”`, W / 2, 775, W - 200, 32, 700, FX, '#444', 'center');
        s.numeri.forEach((n, i) => {
            const x = 80 + (i % 2) * 470, y = 815 + Math.floor(i / 2) * 150;
            h.riquadro(x, y, 450, 130, '#fff', 6, 8);
            h.fit(n.val, x + 225, y + 68, 410, 62, 900, FT, INK, 'center');
            h.fit(`${n.et.toUpperCase()}${n.sub ? ` · ${n.sub}` : ''}`, x + 225, y + 108, 410, 24, 800, FT, '#555', 'center');
        });
        s.extra.slice(0, 3).forEach((t, i) => h.fit(t, W / 2, 1150 + i * 50, W - 160, 32, 800, FX, INK, 'center'));
        pie(c, H, h, NOME_LEGA.toUpperCase());
    }

    /** Disegna la scheda e ritorna il canvas */
    async function disegna(win, scheda) {
        const doc = win.document;
        const H = ALTEZZA[scheda.tipo] || 1350;
        const canvas = doc.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const c = canvas.getContext('2d');
        try { await Promise.all([doc.fonts.load('900 40px "Josefin Sans"'), doc.fonts.load('700 28px "Montserrat"')]); } catch (e) { /* caratteri di riserva */ }
        const h = strumenti(c);
        if (scheda.tipo === 'team') await disegnaTeam(win, c, scheda, h);
        else if (scheda.tipo === 'allenatore') await disegnaAllenatore(win, c, scheda, h);
        else await disegnaScontro(win, c, scheda, h);
        return canvas;
    }

    const STILE = `.sc-velo{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.72);box-sizing:border-box}
.sc-dialogo{display:flex;flex-direction:column;gap:12px;align-items:center;max-width:min(520px,100%);max-height:100%;overflow:auto}
.sc-dialogo img{display:block;max-width:100%;max-height:68vh;border:4px solid #000;background:#fff;box-shadow:6px 6px 0 #000}
.sc-azioni{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.sc-azioni button,.sc-azioni a{padding:9px 16px 7px;background:#fff;color:#000;border:3px solid #000;font:900 .8rem/1 'Josefin Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;cursor:pointer;box-shadow:3px 3px 0 #000}
.sc-azioni [data-sc="condividi"]{background:#ffbd44}
.sc-azioni button:active,.sc-azioni a:active{transform:translate(2px,2px);box-shadow:none}
.sc-attesa{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;padding:10px 18px 8px;background:#000;color:#fff;font:900 .8rem 'Josefin Sans',sans-serif;letter-spacing:.08em;text-transform:uppercase}`;

    /** La finestra con l'immagine pronta: SHARE (se il telefono lo permette), SAVE IMAGE, COPY TEXT */
    function anteprima(win, blob, scheda) {
        const doc = win.document;
        if (!doc.getElementById('sc-stile')) { const st = doc.createElement('style'); st.id = 'sc-stile'; st.textContent = STILE; doc.head.appendChild(st); }
        const url = win.URL.createObjectURL(blob);
        const nome = nomeFile(scheda);
        const file = typeof win.File === 'function' ? new win.File([blob], nome, { type: 'image/png' }) : null;
        const nav = win.navigator || {};
        const puoCondividere = typeof nav.share === 'function' && (!file || typeof nav.canShare !== 'function' || nav.canShare({ files: [file] }));
        const corpo = testoDi(scheda);
        const velo = doc.createElement('div');
        velo.className = 'sc-velo';
        velo.setAttribute('role', 'dialog');
        velo.setAttribute('aria-modal', 'true');
        velo.innerHTML = `<div class="sc-dialogo"><img src="${url}" alt="Share card"><div class="sc-azioni">`
            + `${puoCondividere ? '<button type="button" data-sc="condividi">Share</button>' : ''}`
            + `<a href="${url}" download="${nome}">Save image</a><button type="button" data-sc="copia">Copy text</button><button type="button" data-sc="chiudi">Close</button></div></div>`;
        const chiudi = () => { velo.remove(); win.URL.revokeObjectURL(url); doc.removeEventListener('keydown', tasto); };
        const tasto = e => { if (e.key === 'Escape') chiudi(); };
        velo.addEventListener('click', async e => {
            if (e.target === velo) return chiudi();
            const b = e.target.closest ? e.target.closest('[data-sc]') : null;
            if (!b) return;
            if (b.dataset.sc === 'chiudi') return chiudi();
            if (b.dataset.sc === 'copia') {
                try { await nav.clipboard.writeText(corpo); b.textContent = 'Copied!'; } catch (err) { b.textContent = "Couldn't copy"; }
                return;
            }
            try { await nav.share(file && (!nav.canShare || nav.canShare({ files: [file] })) ? { files: [file], title: scheda.titolo, text: corpo } : { title: scheda.titolo, text: corpo }); } catch (err) { /* annullato */ }
        });
        doc.addEventListener('keydown', tasto);
        doc.body.appendChild(velo);
        return velo;
    }

    /** Disegna la scheda e apre l'anteprima; se l'immagine non si può fare, condivide solo il testo */
    async function condividi(win, scheda) {
        const doc = win.document;
        const attesa = doc.createElement('div');
        attesa.className = 'sc-attesa';
        attesa.textContent = 'Preparing the card…';
        if (!doc.getElementById('sc-stile')) { const st = doc.createElement('style'); st.id = 'sc-stile'; st.textContent = STILE; doc.head.appendChild(st); }
        doc.body.appendChild(attesa);
        try {
            const canvas = await disegna(win, scheda);
            const blob = await new Promise((ok, no) => canvas.toBlob(b => (b ? ok(b) : no(new Error('immagine non creata'))), 'image/png'));
            return anteprima(win, blob, scheda);
        } catch (e) {
            if (win.console) win.console.warn('[Scheda] immagine non creata:', e);
            try { if (win.navigator && typeof win.navigator.share === 'function') await win.navigator.share({ title: scheda.titolo, text: testoDi(scheda) }); else if (win.navigator && win.navigator.clipboard) await win.navigator.clipboard.writeText(testoDi(scheda)); } catch (err) { /* annullato */ }
            return null;
        } finally { attesa.remove(); }
    }

    return { team, showdown, replay, allenatore, testo: testoDi, nomeFile, disegna, anteprima, condividi, immagineSpecie, ALTEZZA };
});
