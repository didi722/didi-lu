// =====================================================
// CPU COME ALLENATORE — Poké-Tournament
//
// (i nomi stanno in un tag stretto: al massimo 8 lettere, così non devono scorrere)
// Nelle partite contro la CPU (prova di un team dal Box, Random Battle) l'avversario non si chiama "CPU": ha un nome, un avatar e un colore a caso, così sembra una sfida
// contro un allenatore vero. Avatar e colore sono scelti tra quelli LIBERI (non presi da nessun giocatore: cosmeticiPresi, vedi cosmetici.js), così non somiglia a nessuno.
//
//   CpuPersona.NOMI                          l'elenco dei nomi
//   CpuPersona.scegli({ presi, avatar, colori, rnd })   -> { nome, avatar: 'immagini/profile/N.png', colore: '#RRGGBB' }
//        presi: l'oggetto cosmeticiPresi ({ 'avatar-12': 'dodo', 'colore-ff8800': 'didi', ... }); avatar: i numeri tra cui scegliere; colori: i colori tra cui scegliere; rnd: () => [0,1)
//
// Puro: funziona nel browser (window.CpuPersona) e in Node (require).
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.CpuPersona = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const NOMI = ["Marco", "Luca", "Giulia", "Sofia", "Chiara", "Matteo", "Elena", "Davide", "Martina", "Simone", "Federica", "Andrea", "Lorenzo", "Alice", "Riccardo", "Giorgia", "Stefano", "Sara", "Gabriele", "Anna", "Tommaso", "Elisa", "Filippo", "Beatrice", "Emanuele", "Silvia", "Nicola", "Laura", "Antonio", "Paola", "Giovanni", "Roberta", "Pietro", "Claudia", "Edoardo", "Irene", "Daniele", "Camilla", "Michele", "Veronica", "Fabio", "Marta", "Samuele", "Ilaria", "Serena", "Mattia", "Cristina", "Luigi", "Monica", "Vincenzo", "Alessia", "Eleonora", "Paolo", "Cecilia", "Massimo", "Greta", "Enrico", "Aurora", "Leonardo", "Bianca", "Alberto", "Ginevra", "Diego", "Noemi", "Jacopo", "Rebecca", "Manuel", "Arianna", "Samuel", "Sabrina", "Raffaele", "Teresa", "Bruno", "Viola", "Gianluca", "Nadia", "Lucio", "Carlotta", "Ettore", "Maya", "Dario", "Ornella", "Oscar", "Vittoria", "Renato", "Lidia", "Cesare", "Miriam", "Franco", "Ludovica", "Tiziano", "Agnese", "Ivan", "Debora", "Rocco", "Gloria", "Walter", "Katia", "Elio", "Rosa", "Sergio", "Dora", "Mirko", "Lucia", "Gino", "Sonia", "Kevin", "Jessica", "Brian", "Emily", "Tyler", "Megan", "Jordan", "Ashley", "Dylan", "Hannah", "Ethan", "Chloe", "Mason", "Lily", "Logan", "Grace", "Caleb", "Nora", "Owen", "Ruby", "Hugo", "Camille", "Louis", "Manon", "Jules", "Lea", "Theo", "Ines", "Axel", "Mathis", "Noah", "Jade", "Yuki", "Haruto", "Sakura", "Ren", "Hana", "Kenji", "Aiko", "Taro", "Mei", "Daichi", "Rin", "Jun", "Akira", "Mika", "Kaito", "Nana", "Takumi", "Emi", "Carlos", "Mateo", "Valeria", "Pablo", "Carmen", "Javier", "Marina", "Pilar", "Rocio", "Hector", "Dolores", "Ivo", "Zoran", "Mila", "Luka", "Petra", "Nikola", "Tomas", "Klara", "Jan", "Eva", "Anton", "Lars", "Freya", "Sven", "Astrid", "Oskar", "Ingrid", "Erik", "Saga", "Olaf", "Liv", "Ash_K", "Misty99", "RedFox", "TealWolf", "NightOwl", "IronLeaf", "BlueJay", "EmberFly", "AquaRush", "NeonCrab", "DynaDino", "ZMoveZed", "ElderOak", "Nico", "Leo", "Gabri", "Ale", "Sam", "Max", "Zoe", "Mia", "Tara", "Bea", "Rex", "Kai", "Ziggy", "Pip", "Dex", "Bolt", "Rusty", "Tiny", "Moss", "Pebble", "Otto", "Lele", "Gigi", "Pippo", "Dani", "Fede", "Teo", "Rick", "Jack", "Ivy"];

    // Il genere degli avatar (guardati uno per uno: gli altri sono neutri, o coppie, sagome, personaggi ambigui) e dei nomi (gli altri, come Jordan, Yuki o i soprannomi, vanno bene per tutti):
    // un avatar femminile non prende un nome maschile e viceversa.
    const AVATAR_F = new Set([2, 4, 6, 8, 11, 14, 18, 19, 22, 26, 27, 28, 31, 34, 36, 37, 41, 44, 51, 55, 57, 62, 70, 77, 78, 79, 81, 85, 86, 88, 90, 96, 97, 98, 100, 102, 104, 106, 111, 112, 115, 116, 128, 131, 133, 138, 139, 142, 143, 146, 148, 149, 152, 155, 157, 159, 170, 172, 174, 175, 178, 182, 186, 188, 189, 190, 192, 194, 197, 205, 211, 215, 216, 217, 223, 228, 230, 232, 233, 239, 243, 245, 246, 249, 253, 255, 259, 260, 263, 265, 268, 272, 280, 283, 285, 289, 291, 292]);
    const AVATAR_M = new Set([1, 3, 7, 10, 12, 13, 15, 16, 20, 21, 25, 29, 30, 33, 35, 38, 39, 42, 43, 45, 47, 49, 54, 56, 58, 61, 63, 64, 65, 66, 67, 68, 72, 73, 74, 76, 80, 82, 84, 87, 89, 92, 93, 94, 99, 101, 105, 107, 108, 109, 110, 114, 117, 120, 121, 122, 123, 125, 126, 127, 129, 130, 132, 134, 135, 137, 140, 141, 144, 145, 147, 150, 151, 153, 154, 156, 160, 161, 163, 164, 165, 169, 171, 173, 176, 177, 179, 180, 181, 183, 191, 195, 196, 198, 202, 204, 206, 209, 210, 212, 214, 218, 219, 220, 221, 224, 226, 231, 234, 235, 238, 240, 241, 242, 244, 247, 250, 251, 252, 254, 257, 258, 262, 264, 266, 267, 275, 276, 277, 278, 281, 282, 284, 288, 290]);
    const NOMI_F = new Set(["Giulia", "Sofia", "Chiara", "Elena", "Martina", "Federica", "Alice", "Giorgia", "Sara", "Anna", "Elisa", "Beatrice", "Silvia", "Laura", "Paola", "Roberta", "Claudia", "Irene", "Camilla", "Veronica", "Marta", "Ilaria", "Serena", "Cristina", "Monica", "Alessia", "Eleonora", "Cecilia", "Greta", "Aurora", "Bianca", "Ginevra", "Noemi", "Rebecca", "Arianna", "Sabrina", "Teresa", "Viola", "Nadia", "Carlotta", "Maya", "Ornella", "Vittoria", "Lidia", "Miriam", "Ludovica", "Agnese", "Debora", "Gloria", "Katia", "Rosa", "Dora", "Lucia", "Sonia", "Jessica", "Emily", "Megan", "Ashley", "Hannah", "Chloe", "Lily", "Grace", "Nora", "Ruby", "Camille", "Manon", "Lea", "Ines", "Jade", "Sakura", "Hana", "Aiko", "Mei", "Mika", "Nana", "Emi", "Valeria", "Carmen", "Marina", "Pilar", "Rocio", "Dolores", "Mila", "Petra", "Klara", "Eva", "Freya", "Astrid", "Ingrid", "Saga", "Liv", "Misty99", "Zoe", "Mia", "Tara", "Bea", "Ivy"]);
    const NOMI_M = new Set(["Marco", "Luca", "Matteo", "Davide", "Simone", "Andrea", "Lorenzo", "Riccardo", "Stefano", "Gabriele", "Tommaso", "Filippo", "Emanuele", "Nicola", "Antonio", "Giovanni", "Pietro", "Edoardo", "Daniele", "Michele", "Fabio", "Samuele", "Mattia", "Luigi", "Vincenzo", "Paolo", "Massimo", "Enrico", "Leonardo", "Alberto", "Diego", "Jacopo", "Manuel", "Samuel", "Raffaele", "Bruno", "Gianluca", "Lucio", "Ettore", "Dario", "Oscar", "Renato", "Cesare", "Franco", "Tiziano", "Ivan", "Rocco", "Walter", "Elio", "Sergio", "Mirko", "Gino", "Kevin", "Brian", "Tyler", "Dylan", "Ethan", "Mason", "Logan", "Caleb", "Owen", "Hugo", "Louis", "Jules", "Theo", "Axel", "Mathis", "Noah", "Haruto", "Ren", "Kenji", "Taro", "Daichi", "Jun", "Akira", "Kaito", "Takumi", "Carlos", "Mateo", "Pablo", "Javier", "Hector", "Ivo", "Zoran", "Luka", "Nikola", "Tomas", "Jan", "Anton", "Lars", "Sven", "Oskar", "Erik", "Olaf", "Ash_K", "Otto", "Leo", "Max", "Rex", "Kai", "Teo", "Rick", "Jack", "Dex", "Sam", "Nico", "Pippo", "ElderOak"]);
    const genereAvatar = n => (AVATAR_F.has(n) ? 'F' : AVATAR_M.has(n) ? 'M' : '');
    /** I nomi adatti a un avatar: se è femminile tutti tranne quelli maschili, se è maschile tutti tranne quelli femminili, se è neutro tutti. */
    const nomiPer = n => (AVATAR_F.has(n) ? NOMI.filter(x => !NOMI_M.has(x)) : AVATAR_M.has(n) ? NOMI.filter(x => !NOMI_F.has(x)) : NOMI);
    const NUMERI_AVATAR = Array.from({ length: 292 }, (_, i) => i + 1).filter(n => n !== 162 && n !== 168);
    const scelta = (lista, rnd) => lista[Math.min(lista.length - 1, Math.floor(rnd() * lista.length))];

    function scegli({ presi = {}, avatar = NUMERI_AVATAR, colori = [], rnd = Math.random } = {}) {
        const occupati = presi && typeof presi === 'object' ? presi : {};
        const liberiAvatar = avatar.filter(n => !occupati[`avatar-${n}`]);
        const liberiColori = colori.filter(c => !occupati[`colore-${String(c).replace('#', '').toLowerCase()}`]);
        // se per assurdo sono tutti presi si pesca da tutti
        const n = scelta(liberiAvatar.length ? liberiAvatar : avatar, rnd);
        const c = colori.length ? scelta(liberiColori.length ? liberiColori : colori, rnd) : '#6B93B0';
        return { nome: scelta(nomiPer(n), rnd), avatar: `immagini/profile/${n}.png`, colore: String(c) };
    }

    return { NOMI, NOMI_F, NOMI_M, AVATAR_F, AVATAR_M, genereAvatar, nomiPer, NUMERI_AVATAR, scegli };
});
