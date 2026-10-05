// =====================================================
// USO GLOBALE DEI POKÉMON — Poké-Tournament
//
// UsoGlobale.calcola(dati, filtro, battaglia) dice quali Pokémon (le specie) si usano di più nella lega, e cosa si gioca su
// ognuno: le mosse, gli strumenti, le abilità, le nature, i compagni di squadra più frequenti.
//
// È una funzione pura: niente DOM, niente Firebase. La usa stats.html (scheda "Usage"), e si prova in Node
// (test/uso-globale.test.js).
//
// Da dove vengono i numeri
//   - I team sono quelli ISCRITTI alle stagioni (seasons/{id}/teams_iscritti/{formato}/{giocatore}/datiTeams: i team fotografati con
//     tutti i loro set — strumento, abilità, natura, mosse... — al momento dell'iscrizione) che hanno GIOCATO almeno un set ufficiale
//     di quella stagione, in quel formato: un match salvato in seasons/{id}/showdowns/*/matches con quel team e almeno un set giocato.
//     Prima del primo set un team non conta: altrimenti l'uso rivelerebbe agli avversari i team (e i loro set) che si sono iscritti
//     ma non hanno ancora giocato. Contano solo ciò che è già stato visto in campo.
//     I team solo nel Box (prove, team della CPU...) e quelli iscritti ma mai giocati non contano.
//   - "Uso" = parte dei team che hanno giocato e contengono quel Pokémon. Lo stesso team giocato in due stagioni conta due volte:
//     è stato giocato due volte. Un Pokémon doppio nello stesso team conta una volta sola per l'uso, ma ogni set conta per le mosse.
//   - Le mosse, gli strumenti, le abilità e le nature sono percentuali dei set di QUEL Pokémon (non dei team).
//   - Nelle stagioni a SCHEDA CHIUSA (seasons/{id}/info/open_sheet === false) gli avversari vedono solo i 6 Pokémon dei team che
//     hanno affrontato, mai strumenti, mosse e abilità (team-visibili.js): qui i Pokémon di quei team contano per l'uso e per i
//     compagni di squadra, ma i loro set no. `setVisibili` è il numero di set che contano per le mosse, gli strumenti, le abilità e
//     le nature (le percentuali sono su quelli), `istanze` tutti i Pokémon.
//   - Come nel resto del sito, "tutte le stagioni" esclude la beta (sbeta); la si può comunque scegliere.
//   - Le battaglie (set giocati, vinti, KO) arrivano da Statistiche.calcola, che si passa già calcolata (`battaglia`: l'elenco
//     `pokemon` del suo risultato, con lo stesso filtro): così i due conti guardano lo stesso periodo e lo stesso formato.
// =====================================================
(function (radice, fabbrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabbrica();
    else radice.UsoGlobale = fabbrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const BETA = 'sbeta';
    const COMPAGNI_MAX = 8;
    const VOCI_MAX = 12;

    const idSpecie = t => String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const idDi = t => String(t == null ? '' : t).toLowerCase().trim();
    const valori = x => (x && typeof x === 'object' ? (Array.isArray(x) ? x : Object.values(x)) : []);
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    // Nel Box un Pokémon con soprannome è salvato come "Soprannome (Specie)"
    const specieDaNome = nome => {
        const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(String(nome || '').trim());
        return m ? m[2].trim() : String(nome || '').trim();
    };
    // percentuale con un decimale; null se non c'è nulla su cui calcolarla
    const perc = (parte, tutto) => (tutto > 0 ? Math.round((parte / tutto) * 1000) / 10 : null);
    const pulisci = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
    // voci "vuote": nessuno strumento, nessuna mossa
    const vuota = t => { const s = pulisci(t).toLowerCase(); return !s || s === '-' || s === 'none' || s === 'no item' || s === '—'; };

    // contatore di voci: id → { nome, n }
    function conteggio() {
        const m = new Map();
        return {
            aggiungi(testo) {
                if (vuota(testo)) return;
                const nome = pulisci(testo), id = idSpecie(nome);
                if (!id) return;
                const v = m.get(id) || { id, nome, n: 0 };
                v.n++;
                m.set(id, v);
            },
            top(totale, quante = VOCI_MAX) {
                return [...m.values()].sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)).slice(0, quante)
                    .map(v => ({ id: v.id, nome: v.nome, n: v.n, perc: perc(v.n, totale) }));
            },
            get size() { return m.size; }
        };
    }

    // Il nome di un team, com'è nei match e nelle iscrizioni (a volte è { valore })
    const nomeTeam = n => pulisci(n && typeof n === 'object' ? n.valore : n).toLowerCase();
    const chiaveGiocata = (stagione, formato, giocatore, team) => `${stagione}|${idDi(formato)}|${idDi(giocatore)}|${nomeTeam(team)}`;

    // I team che hanno giocato almeno un set ufficiale: un match salvato (con il punteggio) con almeno un set giocato.
    // Insieme di chiavi "stagione|formato|giocatore|team". Un match senza formato vale per ogni formato del giocatore.
    function teamGiocati(seasons) {
        const giocati = new Set();
        for (const [sid, stagione] of Object.entries(seasons || {})) {
            for (const sd of Object.values(stagione?.showdowns || {})) {
                const formatoSd = sd?.info?.categoria;
                for (const m of Object.values(sd?.matches || {})) {
                    if (!m || m.p1score == null || m.p2score == null) continue;          // match non salvato
                    if (num(m.p1score) + num(m.p2score) < 1) continue;                    // nessun set giocato
                    const formato = m.categoria || formatoSd || '';
                    for (const [chi, team] of [[m.player1Id, m.team1], [m.player2Id, m.team2]]) {
                        if (idDi(chi) && nomeTeam(team)) giocati.add(chiaveGiocata(sid, formato, chi, team));
                    }
                }
            }
        }
        return giocati;
    }
    const haGiocato = (giocati, stagione, formato, giocatore, team) =>
        giocati.has(chiaveGiocata(stagione, formato, giocatore, team)) || giocati.has(chiaveGiocata(stagione, '', giocatore, team));

    // I team iscritti nel perimetro che hanno giocato: [{ stagione, formato, giocatore, team: {id, nome, pokemon[]} }]
    function iscrizioni(seasons, players, stagioneScelta, formatoScelto, giocati) {
        const out = [];
        for (const [sid, stagione] of Object.entries(seasons || {})) {
            if (stagioneScelta === 'all' ? sid === BETA : sid !== stagioneScelta) continue;
            for (const [formato, perGiocatore] of Object.entries(stagione?.teams_iscritti || {})) {
                if (formatoScelto !== 'all' && formato !== formatoScelto) continue;
                for (const [giocatore, iscr] of Object.entries(perGiocatore || {})) {
                    let elenco = valori(iscr?.datiTeams).filter(t => t && typeof t === 'object');
                    if (!elenco.length) {
                        // iscrizioni senza la fotografia dei team: si guardano i team nel Box del giocatore (stato di oggi)
                        const suoi = players?.[idDi(giocatore)]?.teams || {};
                        elenco = valori(iscr?.teamIds).map(id => suoi[id] ? { id, nome: suoi[id].nome, pokemon: suoi[id].pokemon } : null).filter(Boolean);
                    }
                    for (const t of elenco) {
                        if (!haGiocato(giocati, sid, formato, giocatore, t.nome)) continue;   // mai sceso in campo: non si mostra
                        const pokemon = valori(t.pokemon).filter(p => p && typeof p === 'object' && pulisci(p.nome));
                        if (pokemon.length) out.push({ stagione: sid, formato, giocatore: idDi(giocatore), schedaAperta: stagione?.info?.open_sheet !== false, team: { id: t.id, nome: t.nome, pokemon } });
                    }
                }
            }
        }
        return out;
    }

    /**
     * @param {{ seasons: object, players: object }} dati   i nodi `seasons` e `players` di Firebase
     * @param {{ stagione?: string, formato?: string }} [filtro]
     * @param {Array} [battaglia]   `pokemon` di Statistiche.calcola(dati, stessoFiltro): set portati/vinti e KO, sommati per specie
     */
    function calcola(dati, filtro = {}, battaglia = []) {
        const seasons = dati?.seasons || {};
        const players = dati?.players || {};
        const stagioneScelta = filtro.stagione && filtro.stagione !== 'all' ? String(filtro.stagione) : 'all';
        const formatoScelto = filtro.formato && filtro.formato !== 'all' ? String(filtro.formato) : 'all';

        // solo i team che hanno già giocato: gli altri (iscritti ma non ancora scesi in campo) non si vedono
        const giocati = teamGiocati(seasons);
        const tutte = iscrizioni(seasons, players, stagioneScelta, 'all', giocati);
        const nelPerimetro = formatoScelto === 'all' ? tutte : tutte.filter(i => i.formato === formatoScelto);

        // i formati della stagione scelta che hanno almeno un team giocato, per il selettore
        const formati = new Set(tutte.map(i => i.formato));

        const teamPerFormato = {};
        for (const i of tutte) teamPerFormato[i.formato] = (teamPerFormato[i.formato] || 0) + 1;

        const specie = new Map();
        const scheda = (id, nome) => {
            if (!specie.has(id)) {
                specie.set(id, {
                    specieId: id, nome, team: 0, istanze: 0, setVisibili: 0, giocatori: new Set(),
                    mosse: conteggio(), strumenti: conteggio(), abilita: conteggio(), nature: conteggio(), tera: conteggio(),
                    compagni: new Map(), perFormato: {}
                });
            }
            return specie.get(id);
        };

        for (const i of nelPerimetro) {
            const nomi = i.team.pokemon.map(p => specieDaNome(p.nome)).map(n => ({ id: idSpecie(n), nome: n })).filter(x => x.id);
            const distinte = [...new Map(nomi.map(x => [x.id, x])).values()];
            for (const p of i.team.pokemon) {
                const n = specieDaNome(p.nome), id = idSpecie(n);
                if (!id) continue;
                const s = scheda(id, n);
                s.istanze++;
                if (!i.schedaAperta) continue;                       // scheda chiusa: si sa che c'è, non cosa porta
                s.setVisibili++;
                valori(p.mosse).forEach(m => s.mosse.aggiungi(m));
                s.strumenti.aggiungi(p.strumento);
                s.abilita.aggiungi(p.abilita);
                s.nature.aggiungi(p.natura);
                s.tera.aggiungi(p.tera);
            }
            for (const x of distinte) {
                const s = scheda(x.id, x.nome);
                s.team++;
                s.giocatori.add(i.giocatore);
                s.perFormato[i.formato] = (s.perFormato[i.formato] || 0) + 1;
                for (const y of distinte) {
                    if (y.id === x.id) continue;
                    const c = s.compagni.get(y.id) || { specieId: y.id, nome: y.nome, n: 0 };
                    c.n++;
                    s.compagni.set(y.id, c);
                }
            }
        }

        // battaglie: si sommano per specie i Pokémon dei team (Statistiche) nello stesso perimetro
        const inBattaglia = new Map();
        for (const m of valori(battaglia)) {
            const id = idSpecie(m.specieId || m.specie);
            if (!id) continue;
            const b = inBattaglia.get(id) || { setConDati: 0, portato: 0, vinti: 0, persi: 0, koFatti: 0 };
            b.setConDati += num(m.setConDati);
            b.portato += num(m.portato);
            b.vinti += num(m.setPortatoVinti);
            b.persi += num(m.setPortatoPersi);
            b.koFatti += num(m.koFatti);
            inBattaglia.set(id, b);
        }

        const totaleTeam = nelPerimetro.length;
        const elenco = [...specie.values()].map(s => {
            const b = inBattaglia.get(s.specieId);
            const giocati = b ? b.vinti + b.persi : 0;
            return {
                specieId: s.specieId, nome: s.nome,
                team: s.team, perc: perc(s.team, totaleTeam),
                giocatori: s.giocatori.size, istanze: s.istanze, setVisibili: s.setVisibili,
                mosse: s.mosse.top(s.setVisibili), strumenti: s.strumenti.top(s.setVisibili, 8), abilita: s.abilita.top(s.setVisibili, 4),
                nature: s.nature.top(s.setVisibili, 6), tera: s.tera.top(s.setVisibili, 6),
                compagni: [...s.compagni.values()].sort((a, c) => c.n - a.n || a.nome.localeCompare(c.nome)).slice(0, COMPAGNI_MAX)
                    .map(c => ({ ...c, perc: perc(c.n, s.team) })),
                formati: Object.entries(s.perFormato).sort((a, c) => c[1] - a[1] || a[0].localeCompare(c[0]))
                    .map(([formato, n]) => ({ formato, team: n, perc: perc(n, teamPerFormato[formato]) })),
                battaglia: b && b.portato ? {
                    setConDati: b.setConDati, portato: b.portato, vinti: b.vinti, persi: b.persi,
                    percVinti: perc(b.vinti, giocati), koFatti: b.koFatti,
                    koPerSet: b.portato ? Math.round((b.koFatti / b.portato) * 10) / 10 : null
                } : null
            };
        }).sort((a, b) => b.team - a.team || b.istanze - a.istanze || a.nome.localeCompare(b.nome));

        // i più usati di ogni formato (con "tutti i formati" si vedono tutti insieme)
        const perFormato = {};
        const nomiSpecie = new Map([...specie.values()].map(s => [s.specieId, s.nome]));
        const conta = {};
        for (const i of tutte) {
            const f = (conta[i.formato] ||= { team: 0, specie: new Map() });
            f.team++;
            const viste = new Set();
            for (const p of i.team.pokemon) {
                const n = specieDaNome(p.nome), id = idSpecie(n);
                if (!id || viste.has(id)) continue;
                viste.add(id);
                const c = f.specie.get(id) || { specieId: id, nome: nomiSpecie.get(id) || n, team: 0 };
                c.team++;
                f.specie.set(id, c);
            }
        }
        for (const [f, x] of Object.entries(conta)) {
            perFormato[f] = {
                team: x.team,
                specie: [...x.specie.values()].sort((a, b) => b.team - a.team || a.nome.localeCompare(b.nome)).slice(0, 10)
                    .map(c => ({ ...c, perc: perc(c.team, x.team) }))
            };
        }

        return {
            filtro: { stagione: stagioneScelta, formato: formatoScelto },
            formati: [...formati].sort((a, b) => a.localeCompare(b)),
            totali: {
                team: totaleTeam,
                pokemon: nelPerimetro.reduce((n, i) => n + i.team.pokemon.length, 0),
                giocatori: new Set(nelPerimetro.map(i => i.giocatore)).size,
                specie: elenco.length
            },
            specie: elenco,
            perFormato
        };
    }

    return { calcola, idSpecie, specieDaNome };
});
