const fs = require('fs');

function extractLegalPokemon(data) {
    const legalList = [];
    
    for (const [name, info] of Object.entries(data)) {
        if (!info.isNonstandard) {
            legalList.push(name);
        }
    }
    return legalList;
}
