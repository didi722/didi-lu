// =====================================================
// NEGOZIO — Poké-Tournament
//
// I pezzi della pagina SHOP (shop.html, shop.js) che spendono le monete (wallet/{uid}, lo scrive solo il server: functions/monete.js). Qui c'è il markup (puro, provato in Node
// da test/negozio.test.js) e le chiamate al server; la pagina li mette insieme.
//
//   Negozio.catalogoHtml(stato)   le edizioni limitate in cima e i gruppi del catalogo (cosmetici.js): stato = { saldo, posseduti, info, pagina, anteprime, stagioni, nomiStagioni, occupato, provando }
//   Negozio.premiHtml() / movimentiHtml(movimenti)    l'elenco di quanto si guadagna e da cosa, gli ultimi movimenti
//   Negozio.shinyTeamHtml(stato)  i Pokémon di un team con fascia e prezzo dello shiny: stato = { pokemon: [{ nome, shiny, normale, brillante }], saldo, occupato, armato }
//   Negozio.frasiAcquisto / frasiRilascio   le frasi della conferma di un acquisto (a quota piena si rilascia un altro) o di un rilascio di avatar, colore o canzone
//   Negozio.chiama / cambia (indossa) / frase / creaAnteprime / STILE
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
.ng-premi{list-style:disc;margin:8px 0 6px;padding:0 0 0 22px;display:grid;gap:4px;max-width:420px}
.ng-premi li{display:list-item;font:600 .85rem/1.3 'Montserrat',sans-serif}
.ng-premi li span{display:inline-block;min-width:170px}
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
.ng-schiera{list-style:none;margin:14px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:30px 18px}
.ng-carta{display:flex;flex-direction:column;align-items:center;gap:0;min-width:0}
.ng-tondo{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:176px;height:176px;border:4px solid #000;border-radius:50%;background:#e6e9f2;box-shadow:4px 4px 0 rgba(0,0,0,.35);overflow:hidden}
.ng-shiny .ng-tondo{background:#fff1a8}
.ng-tondo img{max-width:136px;max-height:136px;object-fit:contain;image-rendering:pixelated}
.ng-tag{position:relative;z-index:1;margin:-16px 0 10px;max-width:100%;box-sizing:border-box;padding:4px 12px 2px;background:#000;color:#fff;border:3px solid #000;box-shadow:3px 3px 0 rgba(0,0,0,.35);font:700 14px/1.15 'Josefin Sans',sans-serif;letter-spacing:1px;text-transform:uppercase;text-align:center;overflow-wrap:anywhere;rotate:-1.5deg}
.ng-fatto{font:900 .8rem 'Josefin Sans',sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#8a6500;white-space:nowrap}
.ng-voce[data-tipo=nome] .ng-anteprima,.ng-voce[data-tipo=palco] .ng-anteprima{border-radius:0;width:64px;height:52px}
.ng-voce[data-tipo=nome] .ng-anteprima{display:flex;align-items:center;justify-content:center;background:#f3f4f8}
.ng-nome-prova{font:900 1.2rem/1 'Josefin Sans',sans-serif;letter-spacing:-.01em;text-transform:uppercase;color:var(--pp-nome,#31c489);-webkit-text-stroke:.075em #000;paint-order:stroke fill;text-shadow:.07em .07em 0 #000}
.ng-voce[data-tipo=palco] .ng-anteprima{position:relative;overflow:hidden;container-type:size;--ef-u:3cqh}
.ng-edizione{margin-top:16px;padding:2px 12px 12px;border:3px solid #000;background:#fff6d6;box-shadow:5px 5px 0 #000}
.ng-edizione h3{margin-top:10px}.ng-edizione .ng-voce.ng-mio{background:#e9ffe9}
.ng-fascia{display:inline-block;margin:0 0 0 7px;padding:2px 6px 0;border:2px solid #000;background:#e3e6ee;color:#000;font:900 .6rem/1.4 'Josefin Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;vertical-align:2px}
.ng-fascia[data-fascia=standard]{background:#cfeedd}.ng-fascia[data-fascia=forte]{background:#ffe08a}.ng-fascia[data-fascia=raro]{background:#ffb08f}.ng-fascia[data-fascia=mitico]{background:#d6b8ff}
.ng-fasce{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.ng-fasce .ng-fascia{margin:0}
.ng-guida{margin:14px 0 0;padding:10px 12px;border:3px dashed #000;background:#fafafa;font:600 .76rem/1.45 'Montserrat',sans-serif}
.ng-guida b{font-weight:800}
.ng-bottone{padding:7px 12px 5px;background:#fff;color:#000;border:3px solid #000;box-shadow:3px 3px 0 #000;font:900 .76rem 'Josefin Sans',sans-serif;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.ng-bottone.ng-compra{background:#47ea6a}
.ng-bottone:disabled{opacity:.45;cursor:default;box-shadow:none}
.ng-movimenti{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:3px;font:600 .76rem 'Montserrat',sans-serif}
.ng-movimenti li{display:flex;justify-content:space-between;gap:10px}
.ng-movimenti .ng-piu{color:#0a7d2a;font-weight:800}.ng-movimenti .ng-meno{color:#b3261e;font-weight:800}`;

    /** L'elenco dei guadagni (puro): quanto si prende e da cosa; i numeri vengono da PREMI (cosmetici.js), così non si disallineano */
    function premiHtml() {
        const P = Cosmetici.PREMI, o = P.set.ufficiale, a = P.set.amichevole;
        const voci = [
            ['Season set played', o.giocato], ['Season set won', o.giocato + o.vinto],
            ['Friendly set played', a.giocato], ['Friendly set won', a.giocato + a.vinto],
            ['New bronze badge', P.badge[1]], ['New silver badge', P.badge[2]], ['New gold badge', P.badge[3]],
            ['Season won', P.stagioneVinta], ['Season MVP', P.mvp]
        ];
        return `<ul class="ng-premi">${voci.map(([testo, n]) => `<li><span>${esc(testo)}</span><b>+${n} 🪙</b></li>`).join('')}</ul>`
            + `<p class="ng-nota">Friendly sets pay up to ${P.tettoAmichevoliGiorno} 🪙 a day in total.</p>`;
    }

    /**
     * L'anteprima di una voce. `a` (facoltativo, da stato.anteprime): per gli sfondi lo stile vero del motivo; per lo shiny l'indirizzo dello sprite del compagno.
     * `colorePersona` (facoltativo): il colore firma di chi guarda, per gli effetti del nome (neon) e del palco. Gli effetti veri stanno in effetti-pagina.css.
     */
    function anteprima(c, a, colorePersona) {
        const colore = esc(c.colore || '#d9dde6');
        const suo = esc(/^#[0-9a-f]{6}$/i.test(String(colorePersona || '')) ? colorePersona : '#6b93b0');
        if (c.tipo === 'nome') return `<span class="ng-anteprima" style="--pp-nome:${suo}"><span class="ng-nome-prova" data-effetto-nome="${esc(c.id)}" data-testo="NAME">NAME</span></span>`;
        if (c.tipo === 'palco') return `<span class="ng-anteprima" data-effetto-palco="${esc(c.id)}" style="--ng-c:${suo}"></span>`;
        if (c.tipo === 'sfondo' && a && a.immagine) {
            const stile = `background-color:${a.colore};background-image:${a.immagine};background-size:${a.dimensione};background-position:${a.posizione}`;
            return `<span class="ng-anteprima" style="${esc(stile)}"></span>`;
        }
        return `<span class="ng-anteprima" style="--ng-c:${colore}"></span>`;
    }

    /** Una riga del negozio (pura): la voce, com'è per chi guarda (sua, da comprare, in arrivo, finita). Toccando la riga si prova sulla pagina (data-ng="prova"), i tasti comprano e mettono */
    function voceHtml(c, s, contesto) {
        const saldo = num(s.saldo), info = s.info || {};
        const mio = Cosmetici.possiede(c.id, contesto);
        const disp = Cosmetici.disponibilita(c, s.stagioni);
        const attivo = c.campo ? info[c.campo] === c.id : false;
        const bottone = mio
            ? (c.campo ? `<button type="button" class="ng-bottone" data-ng="equipa" data-id="${esc(c.id)}" data-attivo="${attivo ? '0' : '1'}"${s.occupato ? ' disabled' : ''}>${attivo ? 'Take off' : 'Put on'}</button>` : '<span class="ng-bottone" style="opacity:.6;box-shadow:none">Owned</span>')
            : `<button type="button" class="ng-bottone ng-compra" data-ng="compra" data-id="${esc(c.id)}"${s.occupato || saldo < c.prezzo || disp !== 'si' ? ' disabled' : ''}>${disp === 'si' ? `${c.prezzo} 🪙` : disp === 'presto' ? 'Soon' : 'Ended'}</button>`;
        const nota = mio ? (c.campo ? (attivo ? 'On now' : 'Yours') : 'Yours: pick it in Customize on your page') : c.tipo === 'shiny' ? esc(c.descr) : '';
        return `<li class="ng-voce${mio ? ' ng-mio' : ''}${s.provando === c.id ? ' ng-prova' : ''}" data-tipo="${esc(c.tipo)}" data-id="${esc(c.id)}" data-ng="prova" title="Tap to see it on your page">${anteprima(c, (s.anteprime || {})[c.id], info.color)}<span><b>${esc(c.nome)}</b>${nota ? `<small>${nota}</small>` : ''}</span>${bottone}</li>`;
    }

    /**
     * Le edizioni limitate (pura), una sezione per stagione, in cima al negozio: ci sono le voci in vendita o in arrivo e quelle che già si hanno; le finite che non si hanno non si vedono.
     * stato.stagioni = { <idStagione>: <info/status> }, stato.nomiStagioni = { <idStagione>: <nome> }.
     */
    function edizioniHtml(s, contesto) {
        return Cosmetici.stagioniEdizioni().map(stagione => {
            const voci = Cosmetici.CATALOGO.filter(c => c.edizione && c.edizione.stagione === stagione && (Cosmetici.possiede(c.id, contesto) || Cosmetici.disponibilita(c, s.stagioni) !== 'finita'));
            if (!voci.length) return '';
            const nomeStagione = (s.nomiStagioni || {})[stagione];
            const disp = Cosmetici.disponibilita(voci[0], s.stagioni);
            const frase = disp === 'presto' ? 'Coming with the next season: save your coins!'
                : disp === 'si' ? `On sale only until ${nomeStagione ? esc(nomeStagione) : 'the season'} ends: after that nobody can buy them again. What you buy stays yours.`
                    : 'The sale has ended. What you bought stays yours.';
            return `<section class="ng-gruppo ng-edizione"><h3>Limited edition · ${esc(voci[0].edizione.nome)}</h3><p>${frase}</p><ul class="ng-lista">${voci.map(c => voceHtml(c, s, contesto)).join('')}</ul></section>`;
        }).join('');
    }

    /** Il catalogo (puro): le edizioni limitate in cima e poi un gruppo per tipo; ogni voce con anteprima, prezzo e tasto. `provando`: l'id della voce che si sta guardando nell'anteprima */
    function catalogoHtml(stato) {
        const s = stato || {};
        const contesto = { wallet: { posseduti: s.posseduti || {} }, info: s.info || {}, pagina: s.pagina || {} };
        const gruppi = Object.keys(Cosmetici.TIPI).map(tipo => {
            const voci = Cosmetici.CATALOGO.filter(c => c.tipo === tipo && !c.edizione).map(c => voceHtml(c, s, contesto)).join('');
            return `<section class="ng-gruppo"><h3>${esc(Cosmetici.TIPI[tipo].nome)}</h3><p>${esc(Cosmetici.TIPI[tipo].frase)}</p><ul class="ng-lista">${voci}</ul></section>`;
        }).join('');
        return edizioniHtml(s, contesto) + gruppi;
    }

    /** Dove si spende il resto, e come funzionano i cambi di avatar, colore e canzone (puro) */
    /** Gli ultimi movimenti, i più recenti prima (puro) */
    function movimentiHtml(movimenti) {
        const mov = (movimenti || []).slice(-8).reverse().map(m => `<li><span>${esc(data(m.t))} · ${esc(m.motivo)}</span><b class="${num(m.importo) >= 0 ? 'ng-piu' : 'ng-meno'}">${num(m.importo) === 0 ? 'free' : `${num(m.importo) > 0 ? '+' : ''}${num(m.importo)}`}</b></li>`).join('');
        return `<section class="ng-gruppo"><h3>Recent coins</h3>${mov ? `<ul class="ng-movimenti">${mov}</ul>` : '<p>Nothing yet: play a set!</p>'}</section>`;
    }

    const cosaDi = tipo => (tipo === 'avatar' ? 'avatar' : tipo === 'colore' ? 'colour' : 'song');

    /**
     * Le frasi della conferma di un acquisto di avatar, colore o canzone (pura). `piena`: ne ha già il massimo (`limite`) e per prenderne un altro deve rilasciarne uno (`scelta`: l'id scelto
     * da lasciare, '' se ancora non ha scelto). → { righe, conferma, ok } (ok = si può confermare: bastano le monete e, a quota piena, c'è la scelta)
     */
    function frasiAcquisto({ tipo, nome, prezzo, gratis, saldo, piena, limite, scelta }) {
        const cosa = cosaDi(tipo);
        const righe = [];
        if (gratis) righe.push(`Your first ${cosa} is free. It is yours: nobody else can take it. You wear it right away.`);
        else righe.push(`${nome} costs ${prezzo} 🪙, and you have ${saldo} 🪙.${saldo < prezzo ? ' Play some sets to earn more coins.' : ''}`, 'It is yours: nobody else can take it. You wear it right away.');
        if (piena) righe.push(`You already have ${limite} ${cosa}s, the most you can have. To get this one, release one of yours (free): it goes back to the pool for everyone.`);
        return { righe, conferma: gratis ? 'Take it for free' : `Buy · ${prezzo} 🪙`, ok: (gratis || saldo >= prezzo) && (!piena || !!scelta) };
    }

    /** Le frasi della conferma di un rilascio (pura): gratis, torna libero per tutti, e per riaverlo si ricompra (se nel frattempo non lo prende un altro) */
    function frasiRilascio({ tipo, nome }) {
        return { righe: [`${nome} goes back to the pool: anyone can take it. Releasing is free, but to get this ${cosaDi(tipo)} back you would have to buy it again, if nobody takes it first.`], conferma: 'Release it' };
    }

    /**
     * I Pokémon di un team come carte grandi (puro): la gif, il tag col nome e il pulsante. stato = { pokemon: [{ nome, shiny, comprato, normale, brillante }], saldo, occupato }.
     * Non shiny: il prezzo della sua specie (Cosmetici.prezzoShiny; il server lo calcola allo stesso modo), che apre la conferma; non shiny ma già comprato: "Make shiny" gratis;
     * shiny: "Back to normal" (gratis; poi si rimette shiny gratis).
     */
    function shinyTeamHtml(stato) {
        const s = stato || {};
        const saldo = num(s.saldo);
        const img = src => (src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : '');
        const pillola = (fascia, testo) => `<span class="ng-fascia" data-fascia="${esc(fascia)}">${esc(testo)}</span>`;
        const carte = (s.pokemon || []).map((p, i) => {
            const f = Cosmetici.prezzoShiny(p.nome);
            const dis = s.occupato ? ' disabled' : '';
            const bottone = p.shiny ? `<button type="button" class="ng-bottone" data-ng="shiny-off" data-i="${i}"${dis}>Back to normal</button>`
                : p.comprato ? `<button type="button" class="ng-bottone ng-compra" data-ng="shiny-on" data-i="${i}"${dis}>Make shiny · free</button>`
                    : `<button type="button" class="ng-bottone ng-compra" data-ng="shiny" data-i="${i}"${s.occupato || saldo < f.prezzo ? ' disabled' : ''}>${f.prezzo} 🪙</button>`;
            return `<li class="ng-carta${p.shiny ? ' ng-shiny' : ''}" data-tipo="pokemon"><span class="ng-tondo">${img(p.shiny ? p.brillante : p.normale)}</span><b class="ng-tag">${esc(p.nome)}</b>${bottone}</li>`;
        }).join('');
        const fasce = Cosmetici.fasceShiny().map(f => pillola(f.fascia, `${f.nome} ${f.prezzo}`)).join('');
        return `<p class="ng-nota">Pick the Pokémon to make shiny. The price depends on the species: the rarer it is, the more it costs. It only changes the colours, so it works on locked teams too, it shows in battle and on the site. Once bought it is yours: you can go back to normal and make it shiny again for free.</p>`
            + `<p class="ng-fasce" aria-label="Prices by rarity">${fasce}</p>`
            + (carte ? `<ul class="ng-schiera">${carte}</ul>` : '<p class="ng-nota">This team has no Pokémon yet.</p>');
    }

    // ---------------------------------------------------------------- nel browser
    const FRASI = {
        owned: 'You already have it.', poor: 'Not enough coins.', unknown: "That item doesn't exist.", 'not-owned': "You don't have it yet.", 'no-profile': "Your trainer profile wasn't found.",
        taken: 'Someone else already has it: every avatar, colour and song belongs to one trainer only.', same: 'It is already the one you are wearing.', limit: 'You already have the most you can have: release one of yours to get this.', worn: "You are wearing it: wear another one first, then release this.", already: 'It is already shiny.', busy: 'Another purchase of this Pokémon is still going through: try again in a moment.', 'cannot-apply': "Couldn't update this team's text, so nothing was charged.", 'box-companion': 'Your companion comes from your Box, so it is shiny or not like that Pokémon: make it shiny in the Pokémon tab. The shiny companion is for a Pokémon picked from the list.', 'not-shiny': 'It is not shiny.', 'not-yet': 'This limited edition is not on sale yet: it arrives with the next season.', ended: 'This limited edition has ended: it can no longer be bought.'
    };
    const frase = motivo => FRASI[motivo] || "Couldn't do that.";

    /** Chiama una funzione del server (europe-west1): le carica la prima volta, perché servono solo a chi compra */
    async function chiama(win, nome, dati) {
        await caricaFunzioni(win);
        const f = win.firebase.app().functions('europe-west1');
        return (await f.httpsCallable(nome)(dati || {})).data || {};
    }
    /** Indossa un avatar, un colore o una canzone che si ha (gratis; il server scrive il profilo): { tipo, id, url?, nome? }. Per togliere la canzone: tipo 'canzone' e id ''. */
    const cambia = (win, dati) => chiama(win, 'cambiaCosmetico', dati);

    function caricaFunzioni(win) {
        if (win.firebase && win.firebase.functions) return Promise.resolve();
        return new Promise((ok, no) => {
            const sc = win.document.createElement('script');
            sc.src = `https://www.gstatic.com/firebasejs/${VERSIONE_FIREBASE}/firebase-functions-compat.js`;
            sc.onload = ok; sc.onerror = () => no(new Error('functions'));
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
            }
        }
        return fuori;
    }

    return { catalogoHtml, movimentiHtml, premiHtml, shinyTeamHtml, frasiAcquisto, frasiRilascio, anteprima, voceHtml, edizioniHtml, creaAnteprime, cambia, chiama, frase, STILE };
});
