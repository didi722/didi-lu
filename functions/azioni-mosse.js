// =====================================================
// AZIONI DELLE MOSSE — Poké-Tournament
//
// FILE GENERATO da tools/genera-azioni-mosse.cjs (non si modifica a mano). È lo stesso in docs/ e in functions/.
//
// classeDi(idMossa) dice che tipo di azione è una mossa quando un allenatore la sceglie:
//   attacco         fa danni (è il valore di tutto ciò che non è elencato qui sotto)
//   protezione      si para (Protect, Detect, Wide Guard...) o si nasconde (Substitute)
//   recupero        si cura (Recover, Roost, Rest, Wish...)
//   potenziamento   si prepara (Swords Dance, Calm Mind, Dragon Dance...)
//   campo           meteo, terreni, stanze, trappole, schermi, velocità (Rain Dance, Trick Room, Stealth Rock, Tailwind...)
//   supporto        aiuta il compagno (Helping Hand, Follow Me, Heal Pulse...)
//   disturbo        stati e trucchi sull'avversario (Thunder Wave, Taunt, Trick, Haze...)
//   altro           mosse di stato senza un ruolo chiaro (Splash, Metronome, Transform...)
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.AzioniMosse = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ELENCO = {
        protezione:
        'banefulbunker burningbulwark craftyshield detect endure kingsshield matblock obstruct protect quickguard shedtail' +
        ' ' +
        'silktrap spikyshield substitute wideguard',
        recupero:
        'aquaring healingwish healorder ingrain lunardance milkdrink moonlight morningsun purify recover rest revivalblessing' +
        ' ' +
        'roost shoreup slackoff softboiled strengthsap swallow synthesis wish',
        potenziamento:
        'acidarmor agility amnesia autotomize barrier bellydrum bulkup calmmind charge clangoroussoul coil cosmicpower' +
        ' ' +
        'cottonguard defendorder defensecurl doubleteam dragondance filletaway focusenergy gearup geomancy growth harden' +
        ' ' +
        'honeclaws howl irondefense laserfocus magneticflux meditate minimize nastyplot noretreat powertrick quiverdance' +
        ' ' +
        'rockpolish sharpen shellsmash shelter shiftgear stockpile stuffcheeks swordsdance tailglow takeheart tidyup' +
        ' ' +
        'victorydance withdraw workup',
        campo:
        'auroraveil chillyreception courtchange defog electricterrain fairylock grassyterrain gravity hail iondeluge' +
        ' ' +
        'lightscreen luckychant magicroom mist mistyterrain mudsport psychicterrain raindance reflect safeguard sandstorm' +
        ' ' +
        'snowscape spikes stealthrock stickyweb sunnyday tailwind toxicspikes trickroom watersport wonderroom',
        supporto:
        'acupressure afteryou allyswitch aromatherapy aromaticmist coaching dragoncheer floralhealing followme healbell' +
        ' ' +
        'healpulse helpinghand holdhands instruct junglehealing lifedew lunarblessing ragepowder spotlight',
        disturbo:
        'attract babydolleyes bestow block captivate charm confide confuseray conversion2 corrosivegas cottonspore curse' +
        ' ' +
        'darkvoid decorate destinybond disable doodle eerieimpulse electrify embargo encore entrainment faketears featherdance' +
        ' ' +
        'flash flatter foresight forestscurse gastroacid glare grasswhistle growl guardsplit guardswap haze healblock heartswap' +
        ' ' +
        'hypnosis imprison kinesis leechseed leer lockon lovelykiss magiccoat magicpowder meanlook mefirst memento metalsound' +
        ' ' +
        'mimic mindreader miracleeye mirrormove naturepower nightmare nobleroar octolock odorsleuth painsplit partingshot' +
        ' ' +
        'perishsong playnice poisongas poisonpowder powder powersplit powerswap psychoshift psychup quash reflecttype roar' +
        ' ' +
        'roleplay sandattack scaryface screech simplebeam sing sketch skillswap sleeppowder smokescreen snatch soak speedswap' +
        ' ' +
        'spicyextract spiderweb spite spore stringshot stunspore supersonic swagger sweetkiss sweetscent switcheroo tailwhip' +
        ' ' +
        'tarshot taunt tearfullook teeterdance telekinesis thunderwave tickle topsyturvy torment toxic toxicthread transform' +
        ' ' +
        'trick trickortreat venomdrench whirlwind willowisp worryseed yawn',
        altro:
        'assist batonpass camouflage celebrate conversion copycat flowershield grudge happyhour magnetrise metronome powershift' +
        ' ' +
        'recycle refresh rototiller sleeptalk splash teatime teleport'
    };

    const CLASSI = Object.keys(ELENCO);
    const PER_MOSSA = new Map();
    for (const classe of CLASSI) for (const id of ELENCO[classe].split(' ')) if (id) PER_MOSSA.set(id, classe);

    // "Stealth Rock" | "stealthrock" -> 'campo'
    function classeDi(mossa) {
        const id = String(mossa == null ? '' : mossa).toLowerCase().replace(/[^a-z0-9]+/g, '');
        return PER_MOSSA.get(id) || 'attacco';
    }

    return { classeDi, CLASSI: ['attacco'].concat(CLASSI), ELENCO };
});
