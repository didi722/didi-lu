'use strict';
// =====================================================
// RITIRARE LA PROPRIA SCELTA
// Chi ha già scelto le mosse può cambiare idea finché l'avversario non ha scelto: il server tiene la scelta
// cifrata in partiteServer/{id}/inAttesa/{lato}, e il turno si gioca solo quando ci sono quelle di tutti.
// Ritirarla vuol dire toglierla da lì e dire all'avversario che chi aveva scelto "sta scegliendo" di nuovo.
//
// Il punto delicato è la gara con l'avversario che sceglie nello stesso istante: se la sua scelta arriva prima, il
// turno si gioca comunque (con la scelta che c'era) e il ritiro deve rispondere "troppo tardi". Per questo si usa una
// transazione sull'insieme delle scelte in attesa: o il ritiro vede soltanto la propria scelta e la toglie, o vede
// anche quella dell'avversario e non tocca niente.
//
// Non dipende dal simulatore: si prova con un database finto (test/ritira-scelta.test.js).
// =====================================================

// Restituisce 'ok' (scelta ritirata), 'tardi' (l'avversario aveva già scelto) o 'nessuna' (non c'era nulla da ritirare)
async function ritiraScelta(db, id, lato, passo) {
    const altro = lato === 'p1' ? 'p2' : 'p1';
    let ritirata = false;
    let tardi = false;

    const esito = await db.ref(`partiteServer/${id}/inAttesa`).transaction(cur => {
        ritirata = false;
        tardi = false;
        // La prima chiamata può arrivare con la copia locale vuota: restituendo null Firebase richiama la funzione col dato vero
        if (cur === null) return null;
        if (!cur[lato] || cur[lato].passo !== passo) return cur;                    // niente da ritirare: non si scrive nulla
        if (cur[altro] && cur[altro].passo === passo) { tardi = true; return; }     // troppo tardi: si annulla la transazione
        ritirata = true;
        const resto = { ...cur };
        delete resto[lato];
        return Object.keys(resto).length ? resto : null;
    });

    if (esito.committed && ritirata) {
        await db.ref(`partite/${id}/haScelto/${lato}`).set(null);    // l'avversario torna a vedere "sta scegliendo"
        return 'ok';
    }
    return tardi ? 'tardi' : 'nessuna';
}

module.exports = { ritiraScelta };
