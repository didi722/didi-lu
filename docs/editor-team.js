// =====================================================
// EDITOR DEL TEAM DENTRO IL SIMULATORE
// A fine partita contro la CPU si può modificare il proprio team senza uscire dal simulatore: battle.html apre il Box
// dentro una finestra (iframe) con `box.html?modifica=<id del team>&incorporato=1`. Il Box in quella modalità mostra solo
// l'editor (pannello e Team Builder, gli stessi di sempre), e invece di ricaricare la pagina dopo un salvataggio avvisa
// il simulatore con un messaggio. Qui sta il protocollo, usato da tutti e due i lati:
//
//   urlEditor(idTeam)                      -> l'indirizzo da mettere nell'iframe
//   messaggio(evento, extra)               -> cosa manda il Box al simulatore (postMessage)
//   leggiMessaggio(e, { origine, sorgente }) -> cosa il simulatore accetta: solo dalla propria origine e dalla propria
//                                              finestra, solo i nostri eventi; altrimenti null
//
// Eventi: 'pronto' (l'editor è aperto), 'salvato' (team aggiornato su Firebase), 'chiuso' (l'utente ha chiuso senza salvare),
// 'bloccato' (il team non è più modificabile), 'errore' (con "messaggio").
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.EditorTeam = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SITO = 'editor-team';
    const EVENTI = ['pronto', 'salvato', 'chiuso', 'bloccato', 'errore'];

    function urlEditor(idTeam, base = 'box.html') {
        return `${base}?modifica=${encodeURIComponent(String(idTeam == null ? '' : idTeam))}&incorporato=1`;
    }

    function messaggio(evento, extra = {}) {
        return Object.assign({ sito: SITO, evento }, extra);
    }

    function leggiMessaggio(e, { origine, sorgente } = {}) {
        if (!e || !e.data || typeof e.data !== 'object') return null;
        if (origine !== undefined && e.origin !== origine) return null;
        if (sorgente !== undefined && e.source !== sorgente) return null;
        if (e.data.sito !== SITO || !EVENTI.includes(e.data.evento)) return null;
        return {
            evento: e.data.evento,
            id: typeof e.data.id === 'string' ? e.data.id : '',
            messaggio: typeof e.data.messaggio === 'string' ? e.data.messaggio : ''
        };
    }

    // Il Box è stato aperto dal simulatore dentro una finestra? (parametro nell'indirizzo, e davvero dentro un iframe)
    function eIncorporato(ricerca, finestra) {
        return /[?&]incorporato=1(?:&|$)/.test(String(ricerca || '')) && !!finestra && finestra.parent !== finestra;
    }

    // L'id del team da modificare, dall'indirizzo del Box
    function teamDaModificare(ricerca) {
        const m = /[?&]modifica=([^&]+)/.exec(String(ricerca || ''));
        if (!m) return '';
        try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
    }

    return { urlEditor, messaggio, leggiMessaggio, eIncorporato, teamDaModificare, SITO, EVENTI };
});
