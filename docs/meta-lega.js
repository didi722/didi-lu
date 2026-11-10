// =====================================================
// LA META DELLA LEGA — Poké-Tournament
//
// Cosa si gioca davvero nella nostra lega: quali Pokémon, con quali mosse, quanti Helping Hand, Protezioni e mosse prioritarie per team. La CPU li usa come
// punto di partenza quando compone i suoi team (team-cpu.js), così non gioca più "da manuale" ma si avvicina a quello che si vede nelle stagioni vere.
//
// Solo numeri aggregati, mai team: per ogni formato (categoria) si contano i Pokémon e le mosse di TUTTI i team iscritti, senza nomi di giocatori e senza
// sapere chi ha portato cosa, e non ci sono accoppiamenti né set completi. Si contano solo le stagioni chiuse (mai la beta, mai quella in corso).
// Le soglie di riservatezza (SOGLIE: un Pokémon solo se sta in almeno tre team, le sue mosse solo con tre set, quote a passi di 0,05, formati con almeno otto
// team) sono SPENTE di base: la CPU usa tutto ciò che c'è (SENZA_SOGLIE: ogni Pokémon e ogni mossa visti anche una volta sola, quote al centesimo, formati da tre
// team in su). Con { riservatezza: true } tornano. Il minimo di tre team resta perché con meno la "meta" sarebbe un team solo, e la CPU non deve copiare:
// team-cpu.js poi pesa la meta tanto meno quanto più piccola è la lega.
//
//   MetaLega.aggrega(seasons, opz?)  -> { [chiaveCategoria]: meta }      dal nodo "seasons" di Firebase (opz: { escludi, soloChiuse, riservatezza })
//   MetaLega.aggregaTeam(team[], opz?) -> meta | null                     da un elenco di team ({ set: [{ specie, mosse, strumento, abilita }] })
//   MetaLega.leggiTeam(voce)         -> { set: [...] } | null             un team iscritto ({ pokemon: [...] } oppure { testoShowdown })
//   MetaLega.chiaveCategoria(testo)  -> 'vgcgen9'                         la chiave con cui il nodo si salva e si ritrova
//   meta = { v, team, set, specie: { id: quota dei team }, mosse: { id: { mossa: quota dei set di quella specie } },
//            classi: { quota dei set con: aiuto, protezione, fakeout, redirezione, vento, stanza, priorita, perno (una mossa pivot: U-turn, Volt Switch...) },
//            squadra: { aiuto, priorita, protezioni, perno: quante per team in media } }
//
// Funziona nel browser (window.MetaLega) e in Node (workflow "Stile dei giocatori").
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.MetaLega = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSIONE = 1;
    // teamPerSpecie: un Pokémon compare solo se sta in almeno tanti team; setPerMosse: le sue mosse si danno solo se ne esistono tanti set; teamTotali: un formato
    // con meno team non ha una meta; quotaMinimaMossa: le mosse meno frequenti si scartano; passo: le quote si arrotondano a multipli di questo
    const SOGLIE = { teamPerSpecie: 3, setPerMosse: 3, teamTotali: 8, quotaMinimaMossa: 0.2, passo: 0.05, mossePerSpecie: 6 };
    const SENZA_SOGLIE = { teamPerSpecie: 1, setPerMosse: 1, teamTotali: 3, quotaMinimaMossa: 0, passo: 0.01, mossePerSpecie: 8 };
    const BETA = 'sbeta';

    const id = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]/g, '');
    const valori = x => (x && typeof x === 'object' ? Object.values(x) : []);
    const voci = x => (x && typeof x === 'object' ? Object.entries(x) : []);
    const arrotonda = (x, passo = 0.05) => Math.round(x / passo) * passo;
    const rotondo2 = x => Math.round(x * 100) / 100;

    const PROTEZIONI = new Set(['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark', 'obstruct', 'maxguard']);
    // le mosse d'attacco con priorità positiva (Fake Out è a parte)
    const PRIORITARIE = new Set(['suckerpunch', 'aquajet', 'bulletpunch', 'machpunch', 'extremespeed', 'iceshard', 'shadowsneak', 'quickattack', 'accelerock',
        'jetpunch', 'thunderclap', 'vacuumwave', 'watershuriken', 'upperhand', 'feint', 'grassyglide']);
    const RIPARO = new Set(['followme', 'ragepowder']);
    // le mosse con cui chi le usa esce dal campo e fa entrare un compagno senza perdere il turno (il "pivot")
    const PERNI = new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'batonpass', 'shedtail', 'chillyreception']);

    function chiaveCategoria(testo) { return id(testo); }

    // ---------- leggere un team ----------
    // Un team iscritto è { id, nome, pokemon: [{ nome, strumento, abilita, mosse: [] }] } oppure ha un testoShowdown (il testo del Team Builder)
    function setDaTesto(testo) {
        const out = [];
        for (const blocco of String(testo || '').split(/\n\s*\n/)) {
            const righe = blocco.split('\n').map(r => r.trim()).filter(Boolean);
            if (righe.length < 2) continue;
            let nome = righe[0].split('@')[0].trim();
            const strumento = righe[0].includes('@') ? righe[0].split('@')[1].trim() : '';
            const soprannome = /\(([^()]{2,})\)\s*(\([MF]\))?\s*$/.exec(nome);       // "Soprannome (Specie) (M)"
            if (soprannome && !/^[MF]$/.test(soprannome[1])) nome = soprannome[1];
            nome = nome.replace(/\s*\([MF]\)\s*$/, '').trim();
            const abilita = (righe.find(r => /^Ability:/i.test(r)) || '').replace(/^Ability:\s*/i, '');
            const mosse = righe.filter(r => /^-\s*/.test(r)).map(r => id(r.replace(/^-\s*/, '').replace(/\[.*\]/, '')));
            if (id(nome)) out.push({ specie: id(nome), mosse, strumento: id(strumento), abilita: id(abilita) });
        }
        return out;
    }

    function leggiTeam(voce) {
        if (!voce || typeof voce !== 'object') return null;
        let set = [];
        if (voce.testoShowdown && String(voce.testoShowdown).trim()) set = setDaTesto(voce.testoShowdown);
        else {
            const lista = Array.isArray(voce.pokemon) ? voce.pokemon : valori(voce.pokemon);
            set = lista.filter(p => p && p.nome).map(p => ({
                specie: id(p.nome), mosse: (Array.isArray(p.mosse) ? p.mosse : valori(p.mosse)).map(id).filter(Boolean), strumento: id(p.strumento), abilita: id(p.abilita)
            }));
        }
        return set.length ? { set } : null;
    }

    // ---------- aggregare ----------
    function aggregaTeam(team, opz = {}) {
        const soglie = opz.riservatezza ? SOGLIE : SENZA_SOGLIE;
        const lista = (team || []).filter(t => t && Array.isArray(t.set) && t.set.length);
        if (lista.length < soglie.teamTotali) return null;
        const nSet = lista.reduce((n, t) => n + t.set.length, 0);
        const inTeam = {};        // specie -> in quanti team compare (una volta per team)
        const perSpecie = {};     // specie -> { set, mosse: { mossa: n } }
        const classi = { aiuto: 0, protezione: 0, fakeout: 0, redirezione: 0, vento: 0, stanza: 0, priorita: 0, perno: 0 };
        const tot = { aiuto: 0, priorita: 0, protezioni: 0, perno: 0 };
        for (const t of lista) {
            for (const s of new Set(t.set.map(x => x.specie))) inTeam[s] = (inTeam[s] || 0) + 1;
            for (const s of t.set) {
                const p = perSpecie[s.specie] || (perSpecie[s.specie] = { set: 0, mosse: {} });
                p.set++;
                for (const m of new Set(s.mosse)) p.mosse[m] = (p.mosse[m] || 0) + 1;
                const ha = f => s.mosse.some(f);
                if (ha(m => m === 'helpinghand')) { classi.aiuto++; tot.aiuto++; }
                if (ha(m => PROTEZIONI.has(m))) { classi.protezione++; tot.protezioni++; }
                if (ha(m => m === 'fakeout')) classi.fakeout++;
                if (ha(m => RIPARO.has(m))) classi.redirezione++;
                if (ha(m => m === 'tailwind')) classi.vento++;
                if (ha(m => m === 'trickroom')) classi.stanza++;
                if (ha(m => PERNI.has(m))) { classi.perno++; tot.perno++; }
                const prio = s.mosse.filter(m => PRIORITARIE.has(m)).length;
                if (prio) { classi.priorita++; tot.priorita += prio; }
            }
        }
        const meta = { v: VERSIONE, team: lista.length, set: nSet, specie: {}, mosse: {}, classi: {}, squadra: {} };
        for (const [s, n] of Object.entries(inTeam)) if (n >= soglie.teamPerSpecie) meta.specie[s] = Math.max(soglie.passo, arrotonda(n / lista.length, soglie.passo));
        for (const [s, p] of Object.entries(perSpecie)) {
            if (!meta.specie[s] || p.set < soglie.setPerMosse) continue;
            const migliori = Object.entries(p.mosse).map(([m, n]) => [m, n / p.set]).filter(([, q]) => q >= soglie.quotaMinimaMossa)
                .sort((a, b) => b[1] - a[1]).slice(0, soglie.mossePerSpecie);
            if (migliori.length) meta.mosse[s] = Object.fromEntries(migliori.map(([m, q]) => [m, arrotonda(q, soglie.passo)]));
        }
        for (const k of Object.keys(classi)) meta.classi[k] = rotondo2(classi[k] / nSet);
        meta.squadra = { aiuto: rotondo2(tot.aiuto / lista.length), priorita: rotondo2(tot.priorita / lista.length), protezioni: rotondo2(tot.protezioni / lista.length), perno: rotondo2(tot.perno / lista.length) };
        return meta;
    }

    /** Dal nodo "seasons": un'aggregazione per formato. opz.escludi: stagioni da saltare (di base la beta); opz.soloChiuse (di base sì): solo le stagioni finite; opz.riservatezza: rimette le soglie */
    function aggrega(seasons, opz = {}) {
        const escludi = opz.escludi || [BETA];
        const soloChiuse = opz.soloChiuse !== false;
        const perFormato = {};
        for (const [sid, stagione] of voci(seasons)) {
            if (!stagione || escludi.includes(sid)) continue;
            if (soloChiuse && String((stagione.info && stagione.info.status) || '').toLowerCase().trim() !== 'closed') continue;
            for (const [formato, perGiocatore] of voci(stagione.teams_iscritti)) {
                const chiave = chiaveCategoria(formato);
                if (!chiave) continue;
                for (const giocatore of valori(perGiocatore)) {
                    for (const voce of valori(giocatore && giocatore.datiTeams)) {
                        const t = leggiTeam(voce);
                        if (t) (perFormato[chiave] = perFormato[chiave] || []).push(t);
                    }
                }
            }
        }
        const out = {};
        for (const [chiave, team] of Object.entries(perFormato)) { const m = aggregaTeam(team, opz); if (m) out[chiave] = m; }
        return out;
    }

    return { VERSIONE, SOGLIE, SENZA_SOGLIE, chiaveCategoria, leggiTeam, setDaTesto, aggregaTeam, aggrega };
});
