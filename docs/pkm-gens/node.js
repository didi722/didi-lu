const fs = require('fs');
const vm = require('vm');

async function correggiColoriPokedex() {
    try {
        // 1. Leggi il tuo file pokedex_base.json attuale
        const percorsoFile = 'docs/pkm-gens/pokedex_base.json';
        if (!fs.existsSync(percorsoFile)) {
            console.error(`Errore: impossibile trovare il file ${percorsoFile}`);
            return;
        }
        const pokedexRaw = fs.readFileSync(percorsoFile, 'utf8');
        const pokedex = JSON.parse(pokedexRaw);

        console.log("Download dei dati ufficiali da Pokémon Showdown...");
        
        // 2. Recupera il file dei dati del client di Showdown (contiene i colori specifici per ogni forma)
        const response = await fetch('https://play.pokemonshowdown.com/data/pokedex.js');
        if (!response.ok) throw new Error("Impossibile scaricare i dati di Showdown");
        const jsCode = await response.text();

        // 3. Esegui il codice JS in un contesto isolato per estrarre l'oggetto BattlePokedex
        const sandbox = { exports: {} };
        vm.runInNewContext(jsCode, sandbox);
        const showdownPokedex = sandbox.exports.BattlePokedex;

        if (!showdownPokedex) {
            throw new Error("Struttura dati di Showdown non valida o non riconosciuta.");
        }

        // Funzione di normalizzazione per azzerare le discrepanze di formattazione nei nomi
        // Trasforma es: "Calyrex-ice" o "Calyrex-Ice" -> "calyrexice"
        const normalizza = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Creiamo una mappa di Showdown indicizzata per stringa normalizzata
        const mappaShowdown = {};
        for (const chiaveShowdown of Object.keys(showdownPokedex)) {
            mappaShowdown[normalizza(chiaveShowdown)] = showdownPokedex[chiaveShowdown];
        }

        let coloriCorrettiCount = 0;

        // 4. Confronta e correggi i colori nel tuo file locale
        for (const nomePokemon of Object.keys(pokedex)) {
            const pokemonLocale = pokedex[nomePokemon];
            const chiaveNormalizzata = normalizza(nomePokemon);

            const datiShowdown = mappaShowdown[chiaveNormalizzata];
            
            if (datiShowdown && datiShowdown.color) {
                // Showdown usa l'iniziale maiuscola (es. "White"), la convertiamo in minuscolo ("white") per il tuo standard
                const coloreCorretto = datiShowdown.color.toLowerCase();

                if (pokemonLocale.color !== coloreCorretto) {
                    console.log(`[CORREZIONE] ${nomePokemon}: da "${pokemonLocale.color}" -> a "${coloreCorretto}"`);
                    pokemonLocale.color = coloreCorretto;
                    coloriCorrettiCount++;
                }
            }
        }

        // 5. Sovrascrivi il file originale con i dati corretti
        fs.writeFileSync(percorsoFile, JSON.stringify(pokedex, null, 2), 'utf8');
        console.log(`\nAggiornamento completato! Sono stati corretti ${coloriCorrettiCount} colori sfasati.`);

    } catch (error) {
        console.error("Errore durante l'esecuzione del fetch di correzione:", error.message);
    }
}

// Avvia lo script
correggiColoriPokedex();