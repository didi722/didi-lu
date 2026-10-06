// =====================================================
// ORDINE DEGLI SHOWDOWN — Poké-Tournament
//
// La lista degli showdown (matches.html) mette in cima quelli giocati per ultimi. Si ordina per GIORNO (più recente prima); due showdown
// dello stesso giorno stanno nell'ordine in cui si sono giocati davvero: in cima quello il cui ultimo match è stato salvato per ultimo.
//
//   OrdineShowdown.giorno(data)          -> 'AAAA-MM-GG' ('' se la data non c'è); accetta 'AAAA-MM-GG' e 'GG/MM/AAAA'
//   OrdineShowdown.ultimoMovimento(sd)   -> millisecondi dell'ultimo match salvato dello showdown (0 se non si sa)
//   OrdineShowdown.ordina(showdowns)     -> gli id degli showdown (oggetto id → showdown), il più recente per primo
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.OrdineShowdown = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const due = n => String(n).padStart(2, '0');

    function giorno(data) {
        const t = String(data == null ? '' : data).trim();
        let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
        if (m) return `${m[1]}-${due(m[2])}-${due(m[3])}`;
        m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(t);
        if (m) return `${m[3]}-${due(m[2])}-${due(m[1])}`;
        return '';
    }

    const quando = t => { const n = Date.parse(t); return Number.isFinite(n) ? n : 0; };

    // l'ultimo match salvato; per gli showdown senza orari sui match valgono quelli dello showdown
    function ultimoMovimento(sd) {
        const info = (sd && sd.info) || {};
        let ultimo = 0;
        for (const m of Object.values((sd && sd.matches) || {})) ultimo = Math.max(ultimo, quando(m && m.lastEdit));
        return ultimo || Math.max(quando(info.ultimoAggiornamento), quando(info.lastUpdate), quando(info.timestamp));
    }

    function ordina(showdowns) {
        const voce = id => ({ id, giorno: giorno((showdowns[id].info || {}).data), mossa: ultimoMovimento(showdowns[id]) });
        return Object.keys(showdowns || {}).filter(id => showdowns[id]).map(voce).sort((a, b) =>
            b.giorno.localeCompare(a.giorno) || b.mossa - a.mossa || b.id.localeCompare(a.id)).map(v => v.id);
    }

    return { giorno, ultimoMovimento, ordina };
});
