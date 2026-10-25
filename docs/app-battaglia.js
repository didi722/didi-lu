// =====================================================
// APP — i comandi della battaglia come in un gioco Pokémon
// ---------------------------------------------------------------------
// Solo nell'app, solo sul telefono (app.js lo scarica per battle.html). Il simulatore (battle-ui.js) disegna come sempre le mosse e i cambi, tutti insieme;
// qui il pannello diventa a due passi, come nei giochi:
//   1. "What will X do?"  con due tasti grandi: FIGHT e POKÉMON
//   2. FIGHT -> le quattro mosse (e Mega/Tera/Dynamax, se ci sono);  POKÉMON -> la squadra.  "Back" torna al passo 1.
// Non cambia niente nelle scelte: i tasti sono sempre quelli del simulatore, qui si decide solo quali mostrare (data-ab sul .corpo, lo stile è in app-battaglia.css).
// Il pannello si ridisegna da solo a ogni cambio di stato: l'osservatore rimette i tasti, e ricorda a che passo eri finché la domanda è la stessa.
// =====================================================
(function (radice, fabbrica) {
    const B = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = B;
    else if (radice.document.readyState === 'loading') radice.document.addEventListener('DOMContentLoaded', () => B.avvia(radice));
    else B.avvia(radice);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // dove vale il layout da telefono (identica a quella di app-battaglia.css)
    const CONDIZIONE_TELEFONO = '(max-width: 700px), (max-height: 520px)';

    /** Il passo in cui mostrare il pannello: lo stesso di prima se la domanda non è cambiata, altrimenti il menu */
    function passoDa({ chiave, precedente }) {
        return precedente && precedente.chiave === chiave && precedente.passo ? precedente.passo : 'menu';
    }

    /** Si può cambiare Pokémon? (almeno un compagno non spento) */
    function puoCambiare(corpo) {
        return corpo.querySelectorAll('.cambi .btn-pkm:not(.spento)').length > 0;
    }

    function avvia(win) {
        const doc = win.document;
        const radice = doc.documentElement;
        if (!radice.classList.contains('app')) return null;
        const ricorda = new WeakMap();      // .corpo -> { chiave, passo }
        const mq = win.matchMedia ? win.matchMedia(CONDIZIONE_TELEFONO) : { matches: false };

        const tasto = (classe, testo, onclick) => {
            const b = doc.createElement('button');
            b.type = 'button';
            b.className = classe;
            b.textContent = testo;
            b.addEventListener('click', onclick);
            return b;
        };

        function vai(corpo, passo) {
            const d = corpo.querySelector('.testa-scelta .domanda');
            ricorda.set(corpo, { chiave: d ? d.textContent : '', passo });
            corpo.dataset.ab = passo;
            const v = corpo.querySelector('.mosse');
            if (v && passo === 'mosse') v.scrollTop = 0;
        }

        function pulisci(corpo) {
            delete corpo.dataset.ab;
            ricorda.delete(corpo);
            corpo.querySelectorAll('.ab-menu, .ab-indietro').forEach(x => x.remove());
        }

        function elabora(corpo) {
            if (!mq.matches) { if (corpo.dataset.ab || corpo.querySelector('.ab-menu')) pulisci(corpo); return; }
            const testa = corpo.querySelector(':scope > .testa-scelta');
            const haMosse = !!corpo.querySelector(':scope > .mosse');
            // niente mosse da scegliere (messaggi, cambio forzato, bersagli, anteprima…): il pannello resta quello del simulatore
            if (!testa || !haMosse) { if (corpo.dataset.ab || corpo.querySelector('.ab-menu')) pulisci(corpo); return; }
            if (corpo.querySelector(':scope > .ab-menu')) return;      // già pronto: è il nostro stesso inserimento che ha fatto scattare l'osservatore

            const d = testa.querySelector('.domanda');
            const passo = passoDa({ chiave: d ? d.textContent : '', precedente: ricorda.get(corpo) });

            const menu = doc.createElement('div');
            menu.className = 'ab-menu';
            const lotta = tasto('ab-btn ab-lotta', 'Fight', () => vai(corpo, 'mosse'));
            const squadra = tasto('ab-btn ab-squadra', 'Pokémon', () => { if (puoCambiare(corpo)) vai(corpo, 'cambi'); });
            if (!puoCambiare(corpo)) {
                squadra.setAttribute('aria-disabled', 'true');
                squadra.classList.add('spento');
                const et = corpo.querySelector('.cambi .etichetta');
                if (et && /trapped/i.test(et.textContent)) squadra.dataset.nota = 'Trapped';
            }
            menu.append(lotta, squadra);
            testa.after(menu);
            testa.prepend(tasto('ab-indietro', 'Back', () => vai(corpo, 'menu')));
            vai(corpo, passo);
        }

        function tutti() { doc.querySelectorAll('#comandi .corpo').forEach(elabora); }

        const comandi = doc.getElementById('comandi');
        if (!comandi) return null;
        const osservatore = new win.MutationObserver(tutti);
        osservatore.observe(comandi, { childList: true, subtree: true });
        if (mq.addEventListener) mq.addEventListener('change', tutti);
        tutti();
        return { osservatore, tutti };
    }

    return { CONDIZIONE_TELEFONO, passoDa, puoCambiare, avvia };
});
