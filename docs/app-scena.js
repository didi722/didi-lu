// =====================================================
// APP — le scene a tutto schermo (menù principale e locandine di Play)
// ---------------------------------------------------------------------
// Una "scena" è un'immagine da gioco per telefono fatta di strati: un cielo colorato con raggi di luce, nuvole e scintille che salgono, le figure grandi in
// primo piano (render di Pokémon HOME da PokeAPI, o figure, o un'immagine composta) che stanno ferme, e gli effetti che si muovono (Poké Ball che gira, quadrante, cuori...).
// Qui c'è solo il markup, a partire da una descrizione della scena (`SCENE` per il menù, `LOCANDINE` per le tre locandine di Play); lo stile sta in app-scena.css.
// Le figure di ripiego si possono sostituire con immagini proprie (vedi LEGGIMI): il menù e Play le cercano per nome e, se ci sono, le usano.
// La parte pura è provata in test/app-scena.test.js; funziona nel browser (window.AppScena) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    const A = fabbrica();
    if (typeof module === 'object' && module.exports) module.exports = A;
    else radice.AppScena = A;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /** Le immagini dei Pokémon di ripiego: i render di Pokémon HOME, da PokeAPI */
    const ARTE = id => 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/' + id + '.png';

    /**
     * Le scene del menù principale (una per voce): `cielo` (la classe del cielo), `fx` (gli effetti), `sotto` (la riga sotto il tag) ed `eroi` (le figure, ognuna col
     * suo posto = classe): `pkm` è il numero nel Pokédex (render HOME), `img` una figura qualsiasi. `prova` è il nome di un'immagine propria da cercare in
     * immagini/app/ (png o webp) al posto della figura. `arte` è un'immagine già pronta della scena intera (sta al posto delle figure; quella propria, tessera-<id>, vince).
     */
    const SCENE = {
        play: { cielo: 'cielo-blu', sotto: 'Ranked · Unranked · VS CPU', eroi: [], arte: 'immagini/app/scena-play.webp', alt: 'Mega Charizard Y and Mega Lucario face off' },
        box: { cielo: 'cielo-viola', fx: 'palla', sotto: 'Your teams & Pokémon', eroi: [{ pkm: 94, c: 'e-sx', alt: 'Gengar' }, { pkm: 149, c: 'e-dx', alt: 'Dragonite' }, { pkm: 445, c: 'e-cn', alt: 'Garchomp' }] },
        trainers: { cielo: 'cielo-tramonto', fx: 'aure', sotto: 'The League', eroi: [{ img: 'immagini/profile/15.png', c: 't-1', alt: '', prova: 'trainers-1' }, { img: 'immagini/profile/1.png', c: 't-2', alt: '', prova: 'trainers-2' }] },
        stats: { cielo: 'cielo-notte', fx: 'radar', sotto: 'Numbers & records', eroi: [{ pkm: 150, c: 'e-mew', alt: 'Mewtwo' }] }
    };

    /** Le tre locandine di Play: stessa cosa, in verticale */
    const LOCANDINE = {
        ranked: { cielo: 'cielo-oro', fx: 'sole', eroi: [{ pkm: 384, c: 'e-ray', alt: 'Rayquaza' }] },
        unranked: { cielo: 'cielo-rosa', fx: 'cuori', eroi: [{ pkm: 25, c: 'e-pika', alt: 'Pikachu' }, { pkm: 133, c: 'e-evee', alt: 'Eevee' }] },
        cpu: { cielo: 'cielo-tech', fx: 'griglia', eroi: [{ pkm: 474, c: 'e-pory', alt: 'Porygon-Z' }] }
    };

    /** Le scintille che salgono: `n` puntini con posto, grandezza e tempi diversi ma sempre gli stessi (generati da un seme, così la pagina è uguale a ogni apertura) */
    function htmlScintille(n, seme) {
        let r = (Number(seme) || 1) * 9301 + 49297;
        const casuale = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
        let h = '';
        for (let k = 0; k < n; k++) {
            const sinistra = Math.round(casuale() * 100), dim = 3 + Math.round(casuale() * 5), durata = (4 + casuale() * 4).toFixed(1), ritardo = (-casuale() * 8).toFixed(1);
            h += '<i style="--l:' + sinistra + '%;--z:' + dim + ';--d:' + durata + 's;--r:' + ritardo + 's"></i>';
        }
        return h;
    }

    // gli effetti: tutti si muovono con spostamenti, rotazioni e trasparenza (le fa la scheda grafica)
    const AURE = '<span class="gx-aura-l" aria-hidden="true"></span><span class="gx-aura-r" aria-hidden="true"></span>';
    const PALLA = '<svg class="gx-fx gx-palla" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><path d="M4 50h30M66 50h30"/><circle cx="50" cy="50" r="15"/><circle cx="50" cy="50" r="6"/></svg>';
    const RADAR = '<svg class="gx-fx gx-radar" viewBox="0 0 200 200" aria-hidden="true"><polygon class="gx-r-gr" points="100,14 174,57 174,143 100,186 26,143 26,57"/>' +
        '<polygon class="gx-r-gr" points="100,43 149,71 149,129 100,157 51,129 51,71"/><polygon class="gx-r-gr" points="100,72 124,86 124,114 100,128 76,114 76,86"/>' +
        '<path class="gx-r-assi" d="M100 100V14M100 100 174 57M100 100 174 143M100 100V186M100 100 26 143M100 100 26 57"/>' +
        '<polygon class="gx-r-val" points="100,34 160,64 150,132 100,170 52,128 44,66"/>'+
        '<polygon class="gx-r-val gx-r-val2" points="100,24 168,60 140,138 100,176 40,120 56,72"/></svg>';
    const SOLE = '<span class="gx-sole" aria-hidden="true"></span>';
    const CUORI = '<span class="gx-cuori" aria-hidden="true"><i>♥</i><i>♥</i><i>♥</i><i>♥</i><i>♥</i><i>♥</i></span>';
    const GRIGLIA = '<span class="gx-griglia" aria-hidden="true"></span><span class="gx-scansione" aria-hidden="true"></span>';
    const EFFETTI = { aure: AURE, palla: PALLA, radar: RADAR, sole: SOLE, cuori: CUORI, griglia: GRIGLIA };

    /** Le figure di una scena, ognuna col suo posto; se non si caricano spariscono e resta il resto. `prova` dice che c'è un'immagine propria da cercare (la prova il menù) */
    function htmlEroi(sc, escF) {
        const e_ = escF || esc;
        return ((sc && sc.eroi) || []).map(e => '<img class="gx-eroe ' + e_(e.c) + '" draggable="false" decoding="async" alt="' + e_(e.alt) + '" src="' + e_(e.pkm ? ARTE(e.pkm) : e.img) + '"' +
            (e.prova ? ' data-prova="' + e_(e.prova) + '"' : '') + ' onerror="this.style.display=\'none\'">').join('');
    }

    /**
     * La scena: cielo, raggi, nuvole e scintille dietro; le figure e gli effetti davanti (nel contenitore `gx-eroi`); poi `immagine` (l'immagine propria, già HTML, se
     * la pagina ne cerca una) e la vignetta che scurisce i bordi. `indice` dà il seme alle scintille, `scintille` quante sono.
     */
    function htmlScena(sc, { indice = 0, scintille = 10, immagine = '', escF } = {}) {
        const s = sc || { cielo: 'cielo-blu', eroi: [] };
        return '<span class="gx-sf">' +
            '<span class="gx-cielo ' + (escF || esc)(s.cielo) + '" aria-hidden="true"></span><span class="gx-raggi" aria-hidden="true"></span><span class="gx-nuvole" aria-hidden="true"></span>' +
            '<span class="gx-scintille" aria-hidden="true">' + htmlScintille(scintille, indice + 3) + '</span>' +
            '<span class="gx-eroi">' + htmlEroi(s, escF) + (EFFETTI[s.fx] || '') + '</span>' + immagine +
            '<span class="gx-vignetta" aria-hidden="true"></span></span>';
    }

    /**
     * Gli indirizzi da provare, in ordine, per un'immagine propria (`nome` senza estensione, dentro immagini/app/). Una pagina la usa se arriva: tenta i due indirizzi e,
     * se nessuno c'è, resta la scena di ripiego.
     */
    const proveDi = nome => ['immagini/app/' + nome + '.png', 'immagini/app/' + nome + '.webp'];

    /**
     * Mette nella pagina le immagini proprie: per ogni elemento trovato da `selettore` (con `data-prova` = il nome) prova i due indirizzi e, se uno carica, chiama
     * `trovata(elemento, indirizzo)`. Niente succede se l'immagine non c'è.
     */
    function cercaImmagini(radice, selettore, trovata, { Immagine } = {}) {
        const Img = Immagine || (typeof Image !== 'undefined' ? Image : null);
        if (!radice || !Img) return 0;
        const lista = [...radice.querySelectorAll(selettore)];
        lista.forEach(el => {
            const prove = proveDi(el.dataset.prova);
            const tenta = k => {
                if (k >= prove.length) return;
                const p = new Img();
                p.onload = () => trovata(el, prove[k]);
                p.onerror = () => tenta(k + 1);
                p.src = prove[k];
            };
            tenta(0);
        });
        return lista.length;
    }

    return { ARTE, SCENE, LOCANDINE, EFFETTI, htmlScintille, htmlEroi, htmlScena, proveDi, cercaImmagini };
});
