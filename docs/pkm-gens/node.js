const fs = require('fs');
const { Dex } = require('@pkmn/dex');

// 1. Configura il percorso del tuo file JSON locale
const PERCORSO_FILE = 'docs/pkm-gens/pokedex_base.json'; 

try {
    // Leggi il file JSON originale
    console.log("Caricamento del database locale...");
    const databaseLocale = JSON.parse(fs.readFileSync(PERCORSO_FILE, 'utf8'));

    let contatoreAggiornati = 0;
    let contatoreMancanti = 0;

    // 2. Cicla sulle chiavi originali mantenendo intatta la struttura e l'ordine
    for (const chiaveOriginale in databaseLocale) {
        if (Object.prototype.hasOwnProperty.call(databaseLocale, chiaveOriginale)) {
            const pokemon = databaseLocale[chiaveOriginale];

            // Interroghiamo Showdown usando la chiave originale
            // Dex.species.get() normalizza autonomamente stringhe come "Venusaur-mega" o "Ho-Oh"
            const datiShowdown = Dex.species.get(chiaveOriginale);

            if (datiShowdown && datiShowdown.exists && datiShowdown.abilities) {
                
                // OPZIONE A: Se vuoi le abilità come array semplice, es: ["Overgrow", "Chlorophyll"]
                pokemon.abilities = Object.values(datiShowdown.abilities);

                /* // OPZIONE B: Se invece vuoi specificare qual è la Hidden (H), scommenta questa riga 
                // e commenta l'Opzione A. Risultato: { "0": "Overgrow", "H": "Chlorophyll" }
                pokemon.abilities = datiShowdown.abilities;
                */

                contatoreAggiornati++;
            } else {
                console.warn(`[⚠️ Non trovato] Impossibile mappare le abilità per la chiave: "${chiaveOriginale}"`);
                // Fallback di sicurezza per non rompere la struttura del tuo JSON
                pokemon.abilities = [];
                contatoreMancanti++;
            }
        }
    }

    // 3. Salva il file modificato mantenendo la formattazione originale a 2 spazi
    console.log("Scrittura delle modifiche sul file...");
    fs.writeFileSync(PERCORSO_FILE, JSON.stringify(databaseLocale, null, 2), 'utf8');

    console.log(`\n[✅ OPERAZIONE COMPLETATA]`);
    console.log(`- Pokémon aggiornati con successo: ${contatoreAggiornati}`);
    console.log(`- Pokémon non trovati (impostati con array vuoto): ${contatoreMancanti}`);

} catch (errore) {
    console.error("Si è verificato un errore durante l'esecuzione:", errore);
}