/* =====================================================================
   DESCRIZIONI — la spiegazione di mosse, strumenti e abilità (Team Builder)
   ---------------------------------------------------------------------
   Il Team Builder prende i dati da Pokémon Showdown (moves.js, items.js, abilities.js), ma quei file non portano i testi
   (shortDesc / desc): per questo le liste di scelta e i fumetti in hover dicevano sempre "No description available".
   I testi stanno in docs/descrizioni.json (lo genera tools/genera-descrizioni.cjs dal simulatore del sito). Qui si caricano (una
   volta sola) e si usano quando i dati di Showdown non hanno il testo; se hanno già il loro, vale quello.
   Modulo UMD: le funzioni pure si provano in Node (test/descrizioni.test.js).

     Descrizioni.carica()                        -> promessa della tabella (null se il file manca)
     Descrizioni.breve(tabella, tipo, id, dati)  -> il testo corto (una riga nelle liste)
     Descrizioni.completa(tabella, tipo, id, dati) -> il testo del fumetto: il lungo se non supera 260 caratteri, altrimenti il breve
       tipo: 'mossa' | 'oggetto' | 'abilita'; dati: la voce di Showdown (con shortDesc / desc, se li ha)
   ===================================================================== */
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.Descrizioni = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LUNGA_MAX = 260;
    const SEZIONE = { mossa: 'mosse', oggetto: 'strumenti', abilita: 'abilita' };

    let promessa = null;

    /** Carica la tabella; null se non c'è (il Team Builder funziona lo stesso, solo senza i testi). */
    function carica(caricaJson) {
        if (!promessa) {
            const leggi = caricaJson || (url => fetch(url).then(r => (r.ok ? r.json() : null)));
            promessa = Promise.resolve().then(() => leggi('descrizioni.json')).catch(() => null)
                .then(t => (t && t.mosse && t.strumenti && t.abilita ? t : null));
            // un file che non è arrivato si riprova alla volta dopo
            promessa.then(t => { if (!t) promessa = null; });
        }
        return promessa;
    }

    const pulito = t => String(t == null ? '' : t).trim();

    // [breve, lunga?] della tabella per quel tipo e quell'id, o null
    function voce(tabella, tipo, id) {
        const sezione = tabella && tabella[SEZIONE[tipo]];
        const k = String(id == null ? '' : id).toLowerCase().replace(/[^a-z0-9]/g, '');
        return (sezione && k && Object.prototype.hasOwnProperty.call(sezione, k) && sezione[k]) || null;
    }

    function breve(tabella, tipo, id, dati) {
        const suo = pulito(dati && dati.shortDesc) || pulito(dati && dati.desc);
        if (suo) return suo;
        const v = voce(tabella, tipo, id);
        return v ? pulito(v[0]) : '';
    }

    function completa(tabella, tipo, id, dati) {
        let corta = pulito(dati && dati.shortDesc), lunga = pulito(dati && dati.desc);
        if (!corta && !lunga) {
            const v = voce(tabella, tipo, id);
            if (v) { corta = pulito(v[0]); lunga = pulito(v[1]); }
        }
        return lunga && lunga.length <= LUNGA_MAX ? lunga : (corta || lunga);
    }

    return { carica, breve, completa, voce, LUNGA_MAX };
});
