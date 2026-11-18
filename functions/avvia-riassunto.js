'use strict';
// =====================================================
// AVVIO AUTOMATICO DEL RIASSUNTO DEL MATCH OF THE WEEK — Poké-Tournament
//
// La home legge il Match of the week da un riassunto (matchSettimana) che scrive il workflow "Riassunto del Match of the week" (.github/workflows/riassunto-home.yml).
// Il workflow ha una pianificazione, ma GitHub la esegue con comodo (di fatto ogni 8-10 ore): un match registrato in piattaforma compariva nel banner solo dopo ore.
// Qui, quando nel database nasce il nodo delle statistiche di un match nuovo (setStats/{stagione}/{showdown}/match{N}: lo scrive il sito quando si registra un match,
// o il server per le partite giocate nel simulatore), si chiede a GitHub di lanciare subito il workflow (API "workflow dispatch"): il banner si aggiorna in un paio di minuti.
// La pianificazione resta com'è, come rete di sicurezza. Più match ravvicinati non fanno ammucchiare le esecuzioni: il workflow ha una coda (concurrency) con una
// esecuzione in corso e al massimo una in attesa, che parte dopo e legge i dati più recenti.
//
// Il token di GitHub (permesso "Actions: Read and write" solo su questa repo) sta nel segreto delle Functions GITHUB_ACTIONS_TOKEN, mai nel codice né in functions/.env:
//   firebase functions:secrets:set GITHUB_ACTIONS_TOKEN
// Se manca o è scaduto non succede niente di grave: si scrive nel log e il riassunto si aggiorna con la pianificazione.
// =====================================================

const REPO = 'didi722/didi-lu';
const WORKFLOW = 'riassunto-home.yml';
const RIFERIMENTO = 'main';
const ATTESA_MASSIMA_MS = 10000;
// le stesse stagioni che il riassunto non considera (candidati() in docs/match-settimana.js): per loro non c'è niente da aggiornare
const STAGIONI_ESCLUSE = new Set(['sbeta']);

/**
 * Chiede a GitHub di lanciare il workflow del riassunto. Non lancia mai errori: dice com'è andata.
 * @param {object} opzioni  { token, stagione, fetch?, repo?, workflow?, ref?, log? }
 * @returns {Promise<{ avviato: boolean, motivo?: string }>}
 */
async function avviaRiassunto({ token, stagione, fetch: richiedi = globalThis.fetch, repo = REPO, workflow = WORKFLOW, ref = RIFERIMENTO, log = console } = {}) {
    if (STAGIONI_ESCLUSE.has(String(stagione))) return { avviato: false, motivo: 'stagione esclusa dal riassunto' };
    if (!token) {
        log.warn('Riassunto del Match of the week: manca il segreto GITHUB_ACTIONS_TOKEN, il workflow non è stato avviato (si aggiorna con la pianificazione).');
        return { avviato: false, motivo: 'token mancante' };
    }
    try {
        const r = await richiedi(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                'User-Agent': 'sant-alvise-functions'
            },
            body: JSON.stringify({ ref }),
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ATTESA_MASSIMA_MS) : undefined
        });
        if (r.status === 204) return { avviato: true };
        let dettaglio = '';
        try { dettaglio = String(await r.text()).slice(0, 200); } catch (e) { /* senza dettaglio */ }
        log.error(`Riassunto del Match of the week: GitHub ha risposto ${r.status} (${dettaglio}). Se è 401 o 403 il token è scaduto o non ha il permesso "Actions: Read and write".`);
        return { avviato: false, motivo: `GitHub ${r.status}` };
    } catch (e) {
        log.error('Riassunto del Match of the week: la richiesta a GitHub non è andata a buon fine:', e && e.message ? e.message : e);
        return { avviato: false, motivo: 'rete' };
    }
}

module.exports = { avviaRiassunto, REPO, WORKFLOW, RIFERIMENTO, STAGIONI_ESCLUSE };
