// =====================================================
// NEGOZIO — Poké-Tournament
//
// La finestra dove si spendono le monete (wallet/{uid}, lo scrive solo il server: functions/monete.js): cosmetici del catalogo (cosmetici.js) da comprare e,
// per il Pokémon compagno shiny e le aure, da mettere o togliere. Si apre dal campanello (SHOP) con Negozio.apri().
//
//   Negozio.apri(win)        legge il portafoglio e il profilo di chi è collegato e apre la finestra
//   Negozio.html(stato)      il markup (puro): stato = { saldo, posseduti, info, pagina, movimenti, nota, occupato }
//
// La parte pura si prova in Node (test/negozio.test.js); il resto gira nel browser.
// =====================================================
(function (radice, fabbrica) {
    const inNode = typeof module === 'object' && module.exports;
    const N = fabbrica(inNode ? require('./cosmetici.js') : radice.Cosmetici);
    if (inNode) module.exports = N; else radice.Negozio = N;
})(typeof self !== 'undefined' ? self : this, function (Cosmetici) {
    'use strict';

    const VERSIONE_FIREBASE = '9.17.1';
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const data = t => { const d = new Date(num(t)); return Number.isNaN(d.getTime()) ? '' : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

    const STILE = `.ng-velo{position:fixed;inset:0;z-index:100001;display:flex;align-items:flex-start;justify-content:center;padding:16px;background:rgba(0,0,0,.72);box-sizing:border-box;overflow:auto}
.ng-finestra{position:relative;box-sizing:border-box;width:min(640px,100%);margin:auto;padding:20px 18px 18px;background:#fff;color:#000;border:4px solid #000;box-shadow:8px 8px 0 #000;font-family:'Montserrat',sans-serif}
.ng-chiudi{position:absolute;top:8px;right:10px;width:32px;height:32px;background:#ffbd44;border:3px solid #000;font:900 1.1rem sans-serif;cursor:pointer}
.ng-testa{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 40px 12px 0}
.ng-testa h2{margin:0;font:900 1.4rem 'Josefin Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase}
.ng-saldo{padding:5px 12px 3px;background:#ffbd44;border:3px solid #000;box-shadow:3px 3px 0 #000;font:900 1.05rem 'Josefin Sans',sans-serif}
.ng-nota{margin:0 0 12px;font:600 .78rem/1.4 'Montserrat',sans-serif;opacity:.75}
.ng-msg{margin:0 0 12px;padding:8px 10px;border:3px solid #000;background:#fff6d6;font:700 .82rem/1.3 'Montserrat',sans-serif}
.ng-gruppo h3{margin:16px 0 4px;font:900 .95rem 'Josefin Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase}
.ng-gruppo>p{margin:0 0 8px;font:600 .74rem 'Montserrat',sans-serif;opacity:.65}
.ng-lista{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.ng-voce{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px;border:3px solid #000;background:#fff}
.ng-voce.ng-mio{background:#e9ffe9}
.ng-anteprima{position:relative;box-sizing:border-box;width:52px;height:52px;border:3px solid #000;border-radius:50%;background:var(--ng-c,#d9dde6);overflow:hidden}
.ng-voce[data-tipo=aura] .ng-anteprima{overflow:visible;background:#fff;border-color:var(--ng-c);box-shadow:0 0 5px 1px var(--ng-c),0 0 14px 4px var(--ng-c)}
.ng-voce[data-tipo=aura] .ng-anteprima::after{content:'';position:absolute;inset:6px;border-radius:50%;background:var(--ng-c)}
.ng-voce[data-tipo=aura][data-id=aura-arcobaleno] .ng-anteprima{animation:ng-arcobaleno 4s linear infinite}
@keyframes ng-arcobaleno{0%,100%{--ng-c:#ff3b3b}17%{--ng-c:#ffb02e}33%{--ng-c:#f4e03a}50%{--ng-c:#3be07a}67%{--ng-c:#3ba8ff}83%{--ng-c:#b04dff}}
@property --ng-c{syntax:'<color>';inherits:true;initial-value:#d9dde6}
@media (prefers-reduced-motion:reduce){.ng-voce[data-tipo=aura][data-id=aura-arcobaleno] .ng-anteprima{animation:none}}
.ng-voce[data-tipo=sfondo] .ng-anteprima{border-radius:0;width:64px;height:52px}
.ng-voce[data-tipo=shiny] .ng-anteprima{background:#fff}
.ng-voce[data-tipo=shiny] .ng-anteprima img{position:absolute;left:50%;top:50%;max-width:150%;max-height:150%;transform:translate(-50%,-50%);image-rendering:pixelated}
.ng-voce[data-tipo=shiny] .ng-anteprima.ng-scintilla::before{content:'✦';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:900 1.5rem sans-serif;color:#e0a800}
.ng-voce b{display:block;font:900 .85rem 'Josefin Sans',sans-serif;text-transform:uppercase}
.ng-voce small{display:block;font:600 .7rem/1.3 'Montserrat',sans-serif;opacity:.7}
.ng-bottone{padding:7px 12px 5px;background:#fff;color:#000;border:3px solid #000;box-shadow:3px 3px 0 #000;font:900 .76rem 'Josefin Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.ng-bottone.ng-compra{background:#47ea6a}
.ng-bottone:disabled{opacity:.45;cursor:default;box-shadow:none}
.ng-movimenti{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:3px;font:600 .76rem 'Montserrat',sans-serif}
.ng-movimenti li{display:flex;justify-content:space-between;gap:10px}
.ng-movimenti .ng-piu{color:#0a7d2a;font-weight:800}.ng-movimenti .ng-meno{color:#b3261e;font-weight:800}`;

    /** L'anteprima di una voce. `a` (facoltativo, da stato.anteprime): per gli sfondi lo stile vero del motivo; per lo shiny l'indirizzo dello sprite del compagno. */
    function anteprima(c, a) {
        const colore = esc(c.colore || '#d9dde6');
        if (c.tipo === 'sfondo' && a && a.immagine) {
            const stile = `background-color:${a.colore};background-image:${a.immagine};background-size:${a.dimensione};background-position:${a.posizione}`;
            return `<span class="ng-anteprima" style="${esc(stile)}"></span>`;
        }
        if (c.tipo === 'shiny') {
            return a && a.sprite
                ? `<span class="ng-anteprima"><img src="${esc(a.sprite)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('ng-scintilla');this.remove()"></span>`
                : '<span class="ng-anteprima ng-scintilla"></span>';
        }
        return `<span class="ng-anteprima" style="--ng-c:${colore}"></span>`;
    }

    /** Il markup della finestra (puro). */
    function html(stato) {
        const s = stato || {};
        const saldo = num(s.saldo);
        const contesto = { wallet: { posseduti: s.posseduti || {} }, info: s.info || {}, pagina: s.pagina || {} };
        const gruppi = Object.keys(Cosmetici.TIPI).map(tipo => {
            const voci = Cosmetici.CATALOGO.filter(c => c.tipo === tipo).map(c => {
                const mio = Cosmetici.possiede(c.id, contesto);
                const attivo = c.tipo === 'shiny' ? !!(s.info || {}).pkmShiny : c.tipo === 'aura' ? (s.info || {}).aura === c.id : false;
                const bottone = mio
                    ? (c.campo ? `<button type="button" class="ng-bottone" data-ng="equipa" data-id="${esc(c.id)}" data-attivo="${attivo ? '0' : '1'}"${s.occupato ? ' disabled' : ''}>${attivo ? 'Take off' : 'Put on'}</button>` : '<span class="ng-bottone" style="opacity:.6;box-shadow:none">Owned</span>')
                    : `<button type="button" class="ng-bottone ng-compra" data-ng="compra" data-id="${esc(c.id)}"${s.occupato || saldo < c.prezzo ? ' disabled' : ''}>${c.prezzo} 🪙</button>`;
                const nota = mio ? (c.campo ? (attivo ? 'On now' : 'Yours') : 'Yours: pick it in Customize on your page') : esc(c.descr);
                return `<li class="ng-voce${mio ? ' ng-mio' : ''}" data-tipo="${esc(c.tipo)}" data-id="${esc(c.id)}">${anteprima(c, (s.anteprime || {})[c.id])}<span><b>${esc(c.nome)}</b><small>${nota}</small></span>${bottone}</li>`;
            }).join('');
            return `<section class="ng-gruppo"><h3>${esc(Cosmetici.TIPI[tipo].nome)}</h3><p>${esc(Cosmetici.TIPI[tipo].frase)}</p><ul class="ng-lista">${voci}</ul></section>`;
        }).join('');
        const mov = (s.movimenti || []).slice(-8).reverse().map(m => `<li><span>${esc(data(m.t))} · ${esc(m.motivo)}</span><b class="${num(m.importo) >= 0 ? 'ng-piu' : 'ng-meno'}">${num(m.importo) >= 0 ? '+' : ''}${num(m.importo)}</b></li>`).join('');
        return `<div class="ng-finestra" role="dialog" aria-modal="true" aria-label="Shop"><button type="button" class="ng-chiudi" data-ng="chiudi" aria-label="Close">×</button>`
            + `<div class="ng-testa"><h2>Shop</h2><span class="ng-saldo" title="Your coins">🪙 ${saldo}</span></div>`
            + `<p class="ng-nota">Earn coins by playing: 4 per set, +6 if you win it (double in season matches; friendlies are capped at 40 a day), 25/50/100 for a new bronze/silver/gold badge, 300 for winning a season and 100 for an MVP.</p>`
            + (s.messaggio ? `<p class="ng-msg" role="status">${esc(s.messaggio)}</p>` : '')
            + gruppi
            + `<section class="ng-gruppo"><h3>Recent coins</h3>${mov ? `<ul class="ng-movimenti">${mov}</ul>` : '<p>Nothing yet: play a set!</p>'}</section></div>`;
    }

    // ---------------------------------------------------------------- nel browser
    const FRASI = { owned: 'You already have it.', poor: 'Not enough coins.', unknown: "That item doesn't exist.", 'not-owned': "You don't have it yet.", 'no-profile': "Your trainer profile wasn't found." };

    function caricaFunzioni(win) {
        if (win.firebase && win.firebase.functions) return Promise.resolve();
        return new Promise((ok, no) => {
            const sc = win.document.createElement('script');
            sc.src = `https://www.gstatic.com/firebasejs/${VERSIONE_FIREBASE}/firebase-functions-compat.js`;
            sc.onload = ok; sc.onerror = () => no(new Error('functions'));
            win.document.head.appendChild(sc);
        });
    }

    function caricaScript(win, src, pronto) {
        if (pronto()) return Promise.resolve();
        return new Promise(ok => {
            const sc = win.document.createElement('script');
            sc.src = src; sc.onload = ok; sc.onerror = ok;       // un'anteprima che manca non deve fermare il negozio
            win.document.head.appendChild(sc);
        });
    }

    /** Per ogni voce che ne ha bisogno: lo stile vero del motivo (sfondi) o lo sprite shiny del Pokémon preferito (shiny). Tutto facoltativo. */
    function creaAnteprime(win, info) {
        const fuori = {};
        const PP = win.PaginaPubblica, SP = win.SpritePkm;
        for (const c of Cosmetici.CATALOGO) {
            if (c.tipo === 'sfondo' && PP && PP.sfondoCss) {
                try {
                    // il motivo a metà grandezza: nel riquadro piccolo se ne vede di più
                    const met = t => String(t).replace(/(-?[\d.]+)px/g, (_, n) => `${Number(n) / 2}px`);
                    const r = PP.sfondoCss({ motivo: c.motivo, colore: '#ffd966', forza: 3 }, '#31c489');
                    fuori[c.id] = Object.assign({}, r, { dimensione: met(r.dimensione), posizione: met(r.posizione) });
                } catch (e) { /* senza anteprima */ }
            } else if (c.tipo === 'shiny' && SP && SP.gif && info && info.pkmPreferito) {
                try { fuori[c.id] = { sprite: SP.gif(info.pkmPreferito, true) }; } catch (e) { /* senza anteprima */ }
            }
        }
        return fuori;
    }

    async function apri(win) {
        const doc = win.document, fb = win.firebase;
        if (!fb || !fb.auth || !fb.database) return null;
        const utente = fb.auth().currentUser;
        if (!utente) return null;
        if (!doc.getElementById('ng-stile')) { const st = doc.createElement('style'); st.id = 'ng-stile'; st.textContent = STILE; doc.head.appendChild(st); }
        const db = fb.database();
        const velo = doc.createElement('div');
        velo.className = 'ng-velo';
        doc.body.appendChild(velo);
        const stato = { saldo: 0, posseduti: {}, info: {}, pagina: {}, movimenti: [], anteprime: {}, messaggio: '', occupato: false };
        const chiudi = () => { velo.remove(); doc.removeEventListener('keydown', tasto); };
        const tasto = e => { if (e.key === 'Escape') chiudi(); };
        doc.addEventListener('keydown', tasto);
        const disegna = () => { velo.innerHTML = html(stato); };
        const leggi = async () => {
            const nome = String((await db.ref(`users/${utente.uid}/name`).once('value')).val() || '').toLowerCase().trim();
            const [w, info] = await Promise.all([db.ref(`wallet/${utente.uid}`).once('value'), nome ? db.ref(`players/${nome}/info`).once('value') : Promise.resolve({ val: () => ({}) })]);
            const wallet = w.val() || {};
            stato.saldo = num(wallet.saldo);
            stato.posseduti = wallet.posseduti || {};
            stato.movimenti = Object.keys(wallet.movimenti || {}).sort().map(k => wallet.movimenti[k]);
            stato.info = info.val() || {};
            stato.pagina = stato.info.pagina || {};
            stato.anteprime = creaAnteprime(win, stato.info);
        };
        velo.innerHTML = '<div class="ng-finestra"><p class="ng-nota">Loading…</p></div>';
        // lo schema dei motivi e gli sprite servono solo alle anteprime: si caricano insieme ai dati, e se mancano la finestra funziona lo stesso
        await Promise.all([caricaScript(win, 'pagina-pubblica.js', () => !!win.PaginaPubblica), caricaScript(win, 'sprite-pkm.js', () => !!win.SpritePkm)]);
        try { await leggi(); } catch (e) { stato.messaggio = "Couldn't load your coins. Check the connection and try again."; }
        disegna();
        velo.addEventListener('click', async e => {
            if (e.target === velo) return chiudi();
            const b = e.target.closest ? e.target.closest('[data-ng]') : null;
            if (!b || b.disabled) return;
            if (b.dataset.ng === 'chiudi') return chiudi();
            stato.occupato = true; stato.messaggio = ''; disegna();
            try {
                await caricaFunzioni(win);
                const f = fb.app().functions('europe-west1');
                const r = (await f.httpsCallable(b.dataset.ng === 'compra' ? 'acquistaCosmetico' : 'equipaCosmetico')({ id: b.dataset.id, attivo: b.dataset.attivo !== '0' })).data || {};
                stato.messaggio = r.ok ? (b.dataset.ng === 'compra' ? 'Bought! Put it on whenever you like.' : 'Done.') : (FRASI[r.motivo] || "Couldn't do that.");
                await leggi();
            } catch (err) { stato.messaggio = "Couldn't do that. Try again in a moment."; }
            stato.occupato = false; disegna();
        });
        return velo;
    }

    return { html, anteprima, apri, STILE };
});
