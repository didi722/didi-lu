// =====================================================
// CPU COME ALLENATORE — Poké-Tournament
//
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

    const NOMI = ["Marco", "Luca", "Giulia", "Sofia", "Alessandro", "Francesco", "Chiara", "Matteo", "Elena", "Davide", "Martina", "Simone", "Federica", "Andrea", "Valentina", "Lorenzo", "Alice", "Riccardo", "Giorgia", "Stefano", "Sara", "Gabriele", "Anna", "Tommaso", "Elisa", "Filippo", "Beatrice", "Emanuele", "Silvia", "Nicola", "Laura", "Antonio", "Paola", "Giovanni", "Roberta", "Pietro", "Claudia", "Edoardo", "Irene", "Daniele", "Camilla", "Michele", "Veronica", "Fabio", "Marta", "Samuele", "Ilaria", "Christian", "Serena", "Mattia", "Cristina", "Luigi", "Monica", "Vincenzo", "Alessia", "Salvatore", "Eleonora", "Paolo", "Cecilia", "Massimo", "Greta", "Enrico", "Aurora", "Leonardo", "Bianca", "Alberto", "Ginevra", "Diego", "Noemi", "Jacopo", "Rebecca", "Manuel", "Arianna", "Samuel", "Sabrina", "Raffaele", "Teresa", "Bruno", "Viola", "Gianluca", "Nadia", "Lucio", "Carlotta", "Ettore", "Maya", "Dario", "Ornella", "Oscar", "Vittoria", "Renato", "Lidia", "Cesare", "Miriam", "Franco", "Ludovica", "Tiziano", "Agnese", "Ivan", "Debora", "Rocco", "Gloria", "Walter", "Katia", "Elio", "Rosa", "Sergio", "Dora", "Mirko", "Lucia", "Gino", "Sonia", "Kevin", "Jessica", "Brian", "Emily", "Tyler", "Megan", "Jordan", "Ashley", "Dylan", "Hannah", "Ethan", "Chloe", "Mason", "Lily", "Logan", "Grace", "Caleb", "Nora", "Owen", "Ruby", "Hugo", "Camille", "Louis", "Manon", "Jules", "Lea", "Theo", "Ines", "Axel", "Mathis", "Noah", "Jade", "Yuki", "Haruto", "Sakura", "Ren", "Hana", "Kenji", "Aiko", "Taro", "Mei", "Daichi", "Rin", "Jun", "Akira", "Mika", "Kaito", "Nana", "Takumi", "Emi", "Carlos", "Mateo", "Valeria", "Pablo", "Carmen", "Javier", "Marina", "Pilar", "Rocio", "Hector", "Dolores", "Ivo", "Zoran", "Mila", "Luka", "Petra", "Nikola", "Tomas", "Klara", "Jan", "Eva", "Anton", "Lars", "Freya", "Sven", "Astrid", "Oskar", "Ingrid", "Erik", "Saga", "Olaf", "Liv", "Ash_K", "Misty99", "BrockStar", "RedFox", "TealWolf", "NightOwl", "IronLeaf", "BlueJay", "StormBird", "CobaltKid", "RustyNail", "PixelPete", "SilverFin", "MossyRock", "CrimsonTide", "ThunderPaw", "FrostByte", "SunnyDelta", "LunarMoth", "EmberFly", "SteelHeart", "VioletDawn", "AquaRush", "TurboSnail", "CactusJack", "WaveRider", "GlitchFox", "RocketBean", "MapleLeaf", "SaltyPeaks", "PaperTiger", "NeonCrab", "BoulderBoy", "DriftWood", "QuietStorm", "OrangeMoon", "LazyGengar", "SneakyEevee", "GrumpyGolem", "BraveBidoof", "ZenPikachu", "SpicyTaurus", "CosmicCarp", "DoubleBattleDan", "TrickRoomTim", "TailwindTina", "RainDanceRay", "SunnyDayDee", "ProtectPaul", "FakeOutFred", "WideGuardWendy", "SpeedTier", "PivotPaula", "ChoiceScarf", "FocusSash", "LeftoversLou", "HelmetHank", "AssaultVest", "EvioliteEva", "GuardianAngel", "TeraTommy", "MegaMonty", "DynaDino", "ZMoveZed", "CoachCarl", "RookieRay", "VeteranVic", "ChampionChad", "GymLeaderGus", "ElderOak", "WildcardWes", "DarkHorse", "QuickDraw", "SilentMike", "LoudLarry"];

    const NUMERI_AVATAR = Array.from({ length: 292 }, (_, i) => i + 1).filter(n => n !== 162 && n !== 168);
    const scelta = (lista, rnd) => lista[Math.min(lista.length - 1, Math.floor(rnd() * lista.length))];

    function scegli({ presi = {}, avatar = NUMERI_AVATAR, colori = [], rnd = Math.random } = {}) {
        const occupati = presi && typeof presi === 'object' ? presi : {};
        const liberiAvatar = avatar.filter(n => !occupati[`avatar-${n}`]);
        const liberiColori = colori.filter(c => !occupati[`colore-${String(c).replace('#', '').toLowerCase()}`]);
        // se per assurdo sono tutti presi si pesca da tutti
        const n = scelta(liberiAvatar.length ? liberiAvatar : avatar, rnd);
        const c = colori.length ? scelta(liberiColori.length ? liberiColori : colori, rnd) : '#6B93B0';
        return { nome: scelta(NOMI, rnd), avatar: `immagini/profile/${n}.png`, colore: String(c) };
    }

    return { NOMI, NUMERI_AVATAR, scegli };
});
