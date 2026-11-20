// =====================================================
// BOZZE DEI TEAM — Poké-Tournament
//
// Un team in lavorazione nel Team Builder (anche con meno di sei Pokémon, senza mosse, senza nome) si può mettere da parte come "bozza" e riprendere dopo.
// Dove stanno: players/<id>/bozze/<idBozza> = { nome, categoria (il formato), testoShowdown, specie: ["Garchomp", ...], quanti, daTeam, aggiornata }.
// Sono dati del giocatore (vale la regola di `players`): nessuna regola in più. Una bozza NON è un team: non compare in stagioni, match, classifiche né pagine
// pubbliche, finché non la si salva nel Box (a quel punto la bozza sparisce). `daTeam` è l'id del team del Box da cui si è partiti, se si stava modificando un
// team che non si poteva salvare (così "Continua" lo riapre in modifica e il salvataggio lo aggiorna).
// In più, per non perdere il lavoro se la pagina si chiude da sola (telefono, batteria, scheda scartata dal browser), il Team Builder tiene una copia
// di sicurezza nel browser (localStorage, una sola per giocatore): è il "backup", ha la stessa forma di una bozza.
//
//   BozzeTeam.MASSIMO                                  quante bozze al massimo per giocatore
//   BozzeTeam.percorso(giocatore)                      "players/<giocatore>/bozze"
//   BozzeTeam.specieDaTesto(testo)                     le specie di un testo di Showdown, una per Pokémon ("Soprannome (Specie) (M) @ Strumento" → "Specie")
//   BozzeTeam.pulisciNome(testo)                       il nome pulito (spazi, al massimo 40 caratteri)
//   BozzeTeam.perSalvare({ nome, categoria, testo, daTeam, ora })   l'oggetto da scrivere (senza valori undefined), o null se non c'è niente da salvare
//   BozzeTeam.elenco(nodo)                             [{ id, nome, categoria, testoShowdown, specie, quanti, daTeam, aggiornata }], dalla più recente, scartando le rotte
//   BozzeTeam.nomeVisibile(bozza)                      il nome, o "Untitled draft"
//   BozzeTeam.filtra(elenco, { testo, categoria, etichetta })   le bozze che passano i filtri del Box (le bozze non hanno etichette)
//   BozzeTeam.quando(aggiornata, ora)                  "just now", "5 min ago", "2 h ago", "3 days ago"
//   BozzeTeam.htmlCard(bozza, { esc, gif, colore, ora, posizione })   la card della bozza (come quelle dei team, con DRAFT e il conto n/6)
//   BozzeTeam.chiaveBackup(giocatore), leggiBackup(storage, giocatore, ora), scriviBackup(storage, giocatore, dati, ora), cancellaBackup(storage, giocatore)
//
// Funziona nel browser (window.BozzeTeam) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.BozzeTeam = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MASSIMO = 20;
    const SENZA_NOME = 'Untitled draft';
    const VALIDITA_BACKUP = 30 * 24 * 3600 * 1000;      // un backup più vecchio di un mese non si propone più

    const percorso = giocatore => `players/${giocatore}/bozze`;
    const testoDi = t => String(t == null ? '' : t);
    const pulisciNome = t => testoDi(t).replace(/\s+/g, ' ').trim().slice(0, 40);

    /** La specie di una riga di Pokémon di Showdown: "Soprannome (Specie) (M) @ Strumento" → "Specie"; "Garchomp @ Rocky Helmet" → "Garchomp" */
    function specieDaRiga(riga) {
        let r = testoDi(riga).split(' @ ')[0].trim();
        r = r.replace(/\s*\((M|F)\)\s*$/i, '').trim();
        const conSoprannome = /^(.*)\(([^()]+)\)\s*$/.exec(r);
        if (conSoprannome && conSoprannome[1].trim()) r = conSoprannome[2].trim();
        return r;
    }

    /** Le specie di un testo di Showdown (un Pokémon per blocco, separati da una riga vuota); le righe "=== ... ===" e i blocchi vuoti non contano */
    function specieDaTesto(testo) {
        return testoDi(testo).split(/\r?\n\s*\r?\n/)
            .map(blocco => blocco.split(/\r?\n/).map(r => r.trim()).filter(Boolean))
            .map(righe => righe.filter(r => !/^===.*===$/.test(r))[0] || '')
            .map(specieDaRiga)
            .filter(Boolean)
            .slice(0, 6);
    }

    /** L'oggetto da scrivere in players/<id>/bozze/<idBozza>; null se non c'è un formato o nemmeno un Pokémon */
    function perSalvare({ nome, categoria, testo, daTeam, ora } = {}) {
        const testoShowdown = testoDi(testo).trim();
        const formato = testoDi(categoria).trim();
        const specie = specieDaTesto(testoShowdown);
        if (!formato || !testoShowdown || !specie.length) return null;
        return {
            nome: pulisciNome(nome),
            categoria: formato,
            testoShowdown,
            specie,
            quanti: specie.length,
            daTeam: testoDi(daTeam),
            aggiornata: Number(ora) || Date.now()
        };
    }

    /** Le bozze di un giocatore (il nodo letto da Firebase), dalla più recente; si scartano quelle senza formato o senza Pokémon */
    function elenco(nodo) {
        const fuori = [];
        for (const [id, b] of Object.entries(nodo && typeof nodo === 'object' ? nodo : {})) {
            if (!b || typeof b !== 'object') continue;
            const testoShowdown = testoDi(b.testoShowdown).trim();
            const categoria = testoDi(b.categoria).trim();
            const specie = specieDaTesto(testoShowdown);
            if (!categoria || !specie.length) continue;
            fuori.push({
                id, nome: pulisciNome(b.nome), categoria, testoShowdown, specie, quanti: specie.length,
                daTeam: testoDi(b.daTeam), aggiornata: Number(b.aggiornata) || 0
            });
        }
        return fuori.sort((a, b) => (b.aggiornata - a.aggiornata) || a.id.localeCompare(b.id));
    }

    const nomeVisibile = b => (b && pulisciNome(b.nome)) || SENZA_NOME;

    /** Passano i filtri della pagina: ricerca nel nome, nel formato e nelle specie; formato scelto; le bozze non hanno etichette, quindi con un filtro per etichetta non ce n'è */
    function filtra(lista, { testo = '', categoria = '', etichetta = '' } = {}) {
        const q = testoDi(testo).trim().toLowerCase();
        if (etichetta) return [];
        return (lista || []).filter(b => {
            if (categoria && b.categoria !== categoria) return false;
            if (!q) return true;
            return `${nomeVisibile(b)} ${b.categoria} ${(b.specie || []).join(' ')}`.toLowerCase().includes(q);
        });
    }

    /** "just now", "5 min ago", "2 h ago", "3 days ago", poi la data */
    function quando(aggiornata, ora) {
        const t = Number(aggiornata);
        if (!t) return '';
        const adesso = Number(ora) || Date.now();
        const s = Math.max(0, Math.round((adesso - t) / 1000));
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)} min ago`;
        if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
        if (s < 30 * 86400) { const g = Math.floor(s / 86400); return `${g} day${g === 1 ? '' : 's'} ago`; }
        const d = new Date(t);
        return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }

    const escPredefinito = t => testoDi(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /**
     * La card di una bozza, con la stessa struttura di quelle dei team (card-header, category, h3, pkm-grid): lo stile del Box (e dell'app) la veste da solo.
     * `gif(specie)`: l'indirizzo della GIF; `colore(formato)`: il colore del formato; `posizione`: l'indice per l'entrata a scalare.
     */
    function htmlCard(b, { esc = escPredefinito, gif = () => '', colore = () => '#ccc', ora, posizione = 0 } = {}) {
        const id = esc(b.id);
        const specie = Array.isArray(b.specie) ? b.specie : [];
        const caselle = [];
        for (let i = 0; i < 6; i++) {
            const nomeSpecie = specie[i];
            caselle.push(nomeSpecie
                ? `<div class="pkm-box" title="${esc(nomeSpecie)}"><div class="pkm-sprite-container"><img src="${esc(gif(nomeSpecie))}" class="pkm-sprite" alt="" loading="lazy" onerror="this.style.visibility='hidden'"></div><div class="pkm-info"><span class="pkm-name">${esc(nomeSpecie)}</span></div></div>`
                : '<div class="pkm-box pkm-vuoto" aria-hidden="true"></div>');
        }
        const quando_ = quando(b.aggiornata, ora);
        return `
        <div class="card card-bozza" style="--i: ${Number(posizione) || 0}; --cc: ${esc(colore(b.categoria))};" data-bozza="${id}" tabindex="0" role="button"
             aria-label="Continue the draft ${esc(nomeVisibile(b))}"
             onclick="continuaBozza('${id}')" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); continuaBozza('${id}'); }">
            <div class="card-header">
                <span class="category">${esc(b.categoria)}</span>
                <div class="card-actions">
                    <button type="button" class="card-azione azione-modifica" onclick="event.stopPropagation(); continuaBozza('${id}')" title="Continue this draft" aria-label="Continue this draft">✏️</button>
                    <button type="button" class="card-azione azione-elimina" onclick="event.stopPropagation(); cancellaBozza('${id}')" title="Delete this draft" aria-label="Delete this draft">🗑️</button>
                </div>
                <span class="stats" title="Format">${esc(b.categoria)}</span>
            </div>
            <h3>${esc(nomeVisibile(b))}</h3>
            <div class="bozza-info"><span class="bozza-tag">Draft</span><span class="bozza-conta">${esc(b.quanti)}/6 Pokémon</span>${quando_ ? `<span class="bozza-quando">${esc(quando_)}</span>` : ''}</div>
            <div class="pkm-grid">${caselle.join('')}</div>
        </div>`;
    }

    // ---------- il backup nel browser ----------
    const chiaveBackup = giocatore => `boxBackup:${giocatore}`;

    function leggiBackup(storage, giocatore, ora) {
        try {
            const grezzo = storage && storage.getItem(chiaveBackup(giocatore));
            if (!grezzo) return null;
            const b = JSON.parse(grezzo);
            const dati = perSalvare({ nome: b.nome, categoria: b.categoria, testo: b.testoShowdown, daTeam: b.daTeam, ora: b.aggiornata });
            if (!dati) return null;
            if ((Number(ora) || Date.now()) - dati.aggiornata > VALIDITA_BACKUP) return null;
            return { ...dati, bozzaId: testoDi(b.bozzaId) };
        } catch (e) { return null; }
    }

    function scriviBackup(storage, giocatore, { nome, categoria, testo, daTeam, bozzaId, ora } = {}) {
        const dati = perSalvare({ nome, categoria, testo, daTeam, ora });
        if (!storage || !dati) return false;
        try { storage.setItem(chiaveBackup(giocatore), JSON.stringify({ ...dati, bozzaId: testoDi(bozzaId) })); return true; } catch (e) { return false; }
    }

    function cancellaBackup(storage, giocatore) {
        try { if (storage) storage.removeItem(chiaveBackup(giocatore)); } catch (e) { /* senza memoria */ }
    }

    return {
        MASSIMO, SENZA_NOME, percorso, specieDaTesto, pulisciNome, perSalvare, elenco, nomeVisibile, filtra, quando, htmlCard,
        chiaveBackup, leggiBackup, scriviBackup, cancellaBackup
    };
});
