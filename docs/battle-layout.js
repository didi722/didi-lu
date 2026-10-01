// =====================================================
// BATTLE-LAYOUT — tutta la battaglia in una schermata
//
// Su schermi larghi (html[data-modo="fit"]) la pagina è un unico "tavolo" di misure fisse:
// colonne dei player, console con lo schermo di Showdown e i comandi, cronaca
// (le variabili --w-* e --h-comandi di style-battle.css). Qui si misura la finestra e si
// rimpicciolisce il tavolo quanto basta perché ci stia, con transform: scale
// (mai ingrandito: lo schermo di Showdown è 640×360).
//
// Se anche così il testo diventerebbe troppo piccolo (finestra molto bassa, telefono) o la
// finestra è in verticale, niente scala: layout a colonna e la pagina scorre (html[data-modo="scorri"]).
// In quel caso lo schermo si adatta alla larghezza (--scala-campo).
//
// Si riadatta da sola quando cambia la finestra (anche con lo zoom del browser) o
// l'altezza dei contenuti: non serve chiamarla da altrove.
// =====================================================
(function () {
    'use strict';

    var MIN_LARGHEZZA = 1000;   // sotto: layout a colonna
    var MIN_SCALA = 0.65;       // sotto: si scorre invece di rimpicciolire ancora

    var radice = document.documentElement;
    var scala = document.getElementById('scala');
    var palcoBox = document.querySelector('.palco-box');
    if (!scala) return;

    var inFit = () => radice.getAttribute('data-modo') === 'fit';

    function adatta() {
        var W = radice.clientWidth;
        var H = window.innerHeight;
        var riuscito = false;

        // In verticale (tablet, telefono) l'insieme sarebbe minuscolo: meglio la colonna, che scorre
        if (W >= MIN_LARGHEZZA && W >= H) {
            // Prova del layout "fit": se poi non va bene la pagina torna dov'era (anche lo scorrimento)
            var scorrimento = window.pageYOffset;
            radice.setAttribute('data-modo', 'fit');
            var w = scala.offsetWidth;      // misure a scala 1: offsetWidth/Height ignorano le transform
            var h = scala.offsetHeight;
            var s = Math.min(1, W / w, H / h);
            if (s >= MIN_SCALA) {
                scala.style.setProperty('--scala', s.toFixed(4));
                scala.style.top = Math.max(0, (H - h * s) / 2).toFixed(1) + 'px';
                riuscito = true;
            } else if (scorrimento) {
                radice.setAttribute('data-modo', 'scorri');
                window.scrollTo(0, scorrimento);
            }
        }
        if (!riuscito) {
            radice.setAttribute('data-modo', 'scorri');
            scala.style.removeProperty('--scala');
            scala.style.top = '';
        }

        // Layout a colonna: lo schermo di Showdown segue la larghezza del contenitore
        if (palcoBox) {
            var f = inFit() ? 1 : Math.min(1, palcoBox.clientWidth / 640);
            palcoBox.style.setProperty('--scala-campo', f.toFixed(4));
        }
        radice.setAttribute('data-pronto', '');
    }

    var inAttesa = false;
    function programma() {
        if (inAttesa) return;
        inAttesa = true;
        requestAnimationFrame(function () { inAttesa = false; adatta(); });
    }

    window.addEventListener('resize', programma);
    if (window.ResizeObserver) {
        // Cambia l'altezza dei contenuti (es. comandi più alti): si riadatta la scala.
        // Nel layout a colonna basta il resize della finestra.
        var osservatore = new ResizeObserver(function () { if (inFit()) programma(); });
        osservatore.observe(scala);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(programma);
    adatta();
})();
