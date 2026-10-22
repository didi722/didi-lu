'use strict';
// Un Realtime Database finto, in memoria, con l'interfaccia che usano le Cloud Functions (firebase-admin):
// ref(percorso).once('value') / set / update / remove / transaction / push().key / child, e ref() sulla radice con update a più percorsi.
// Serve ai test che fanno girare il servizio delle partite (functions/partita.js) senza rete.
//
//   const db = creaDb({ users: { u1: { name: 'Didi' } } });
//   db.leggi('users/u1/name')   // 'Didi' (copia)
//   db.tutto()                  // tutto il contenuto
//   db.scritture                // i percorsi scritti, in ordine (per controllare cosa NON è stato toccato)
const copia = x => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

function creaDb(iniziale = {}) {
    const dati = copia(iniziale);
    const scritture = [];
    let contatorePush = 0;
    const chiavi = p => String(p).split('/').filter(Boolean);
    const leggiNodo = p => {
        let n = dati;
        for (const k of chiavi(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
        return n === undefined ? null : n;
    };
    const vuoto = v => v && typeof v === 'object' && !Object.keys(v).length;
    const pota = (nodo, ks) => {
        if (!ks.length || nodo == null || typeof nodo !== 'object') return;
        pota(nodo[ks[0]], ks.slice(1));
        if (vuoto(nodo[ks[0]])) delete nodo[ks[0]];
    };
    const scrivi = (p, v) => {
        scritture.push(chiavi(p).join('/'));
        const ks = chiavi(p);
        if (v === null || v === undefined) {
            let n = dati;
            for (const k of ks.slice(0, -1)) { if (n == null || typeof n !== 'object') return; n = n[k]; }
            if (n && typeof n === 'object') delete n[ks[ks.length - 1]];
            pota(dati, ks);
            return;
        }
        let n = dati;
        for (const k of ks.slice(0, -1)) { if (n[k] == null || typeof n[k] !== 'object') n[k] = {}; n = n[k]; }
        n[ks[ks.length - 1]] = copia(v);
    };
    const istantanea = p => { const v = copia(leggiNodo(p)); return { val: () => v, exists: () => v !== null, key: chiavi(p).pop() || null }; };
    const ref = (p = '') => ({
        key: chiavi(p).pop() || null,
        child: c => ref(`${p}/${c}`),
        push: () => ref(`${p}/-pushed${String(++contatorePush).padStart(6, '0')}`),
        once: async () => istantanea(p),
        set: async v => scrivi(p, v),
        remove: async () => scrivi(p, null),
        update: async oggetto => { for (const [k, v] of Object.entries(oggetto)) scrivi(`${p}/${k}`, v); },
        transaction: async fn => {
            const nuovo = fn(copia(leggiNodo(p)));
            if (nuovo === undefined) return { committed: false, snapshot: istantanea(p) };
            scrivi(p, nuovo);
            return { committed: true, snapshot: istantanea(p) };
        }
    });
    return { ref, leggi: p => copia(leggiNodo(p)), tutto: () => copia(dati), scritture };
}

module.exports = { creaDb, copia };
