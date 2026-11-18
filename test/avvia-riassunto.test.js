'use strict';
// L'avvio automatico del riassunto del Match of the week: quando nasce il nodo delle statistiche di un match nuovo la Function chiede a GitHub di lanciare il workflow.
//
//   npm test        (dalla cartella principale)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { avviaRiassunto, REPO, WORKFLOW } = require('../functions/avvia-riassunto.js');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const registro = () => { const m = { warn: [], error: [] }; return { warn: (...a) => m.warn.push(a.join(' ')), error: (...a) => m.error.push(a.join(' ')), m }; };

test('avvio: una richiesta POST all\'API di GitHub per il workflow del riassunto, sul ramo main, con il token', async () => {
    const chiamate = [];
    const fetch = async (url, opzioni) => { chiamate.push({ url, opzioni }); return { status: 204 }; };
    const r = await avviaRiassunto({ token: 'ghp_prova', stagione: 's1', fetch, log: registro() });
    assert.deepEqual(r, { avviato: true });
    assert.equal(chiamate.length, 1);
    assert.equal(chiamate[0].url, `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`);
    assert.equal(REPO, 'didi722/didi-lu');
    assert.equal(WORKFLOW, 'riassunto-home.yml');
    assert.equal(chiamate[0].opzioni.method, 'POST');
    assert.equal(chiamate[0].opzioni.headers.Authorization, 'Bearer ghp_prova');
    assert.match(chiamate[0].opzioni.headers.Accept, /github/);
    assert.deepEqual(JSON.parse(chiamate[0].opzioni.body), { ref: 'main' });
});

test('avvio: la stagione beta non conta per il riassunto, niente richiesta', async () => {
    let chiamate = 0;
    const r = await avviaRiassunto({ token: 'x', stagione: 'sbeta', fetch: async () => { chiamate++; return { status: 204 }; }, log: registro() });
    assert.equal(r.avviato, false);
    assert.equal(chiamate, 0);
});

test('avvio: senza il token (segreto non creato) non si chiama GitHub e si scrive nel log', async () => {
    let chiamate = 0;
    const log = registro();
    const r = await avviaRiassunto({ token: '', stagione: 's1', fetch: async () => { chiamate++; return { status: 204 }; }, log });
    assert.deepEqual(r, { avviato: false, motivo: 'token mancante' });
    assert.equal(chiamate, 0);
    assert.match(log.m.warn[0], /GITHUB_ACTIONS_TOKEN/);
});

test('avvio: se GitHub rifiuta (token scaduto) o la rete non va, non lancia errori: lo dice e si scrive nel log', async () => {
    const log = registro();
    const rifiutato = await avviaRiassunto({ token: 'x', stagione: 's1', fetch: async () => ({ status: 401, text: async () => 'Bad credentials' }), log });
    assert.deepEqual(rifiutato, { avviato: false, motivo: 'GitHub 401' });
    assert.match(log.m.error[0], /401.*Bad credentials/);
    const rotta = await avviaRiassunto({ token: 'x', stagione: 's1', fetch: async () => { throw new Error('ECONNRESET'); }, log });
    assert.deepEqual(rotta, { avviato: false, motivo: 'rete' });
    assert.match(log.m.error[1], /ECONNRESET/);
    // anche se la risposta d'errore non si legge
    const senzaCorpo = await avviaRiassunto({ token: 'x', stagione: 's1', fetch: async () => ({ status: 500, text: async () => { throw new Error('chiusa'); } }), log });
    assert.equal(senzaCorpo.avviato, false);
});

test('Function: scatta alla creazione di setStats/{stagione}/{showdown}/{match} (match nuovo), con il segreto GITHUB_ACTIONS_TOKEN', () => {
    const indice = leggi('functions/index.js');
    assert.match(indice, /const TOKEN_GITHUB = defineSecret\('GITHUB_ACTIONS_TOKEN'\);/);
    assert.match(indice, /exports\.avviaRiassuntoHome = onValueCreated\(\s*\{ ref: '\/setStats\/\{stagione\}\/\{showdown\}\/\{match\}', instance: ISTANZA_DB, region: REGIONE, memory: '256MiB', secrets: \[TOKEN_GITHUB\] \}/);
    assert.match(indice, /avviaRiassunto\(\{ token: TOKEN_GITHUB\.value\(\), stagione: evento\.params\.stagione \}\)/);
    // il token non sta mai nel codice né nel file .env (che è nel repository)
    for (const f of ['functions/.env', 'functions/index.js', 'functions/avvia-riassunto.js']) assert.doesNotMatch(leggi(f), /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/, f);
    assert.doesNotMatch(leggi('functions/.env'), /GITHUB/i);
});

test('workflow: resta la pianificazione e il lancio a mano, e c\'è la coda (una esecuzione alla volta, una sola in attesa)', () => {
    const yml = leggi('.github/workflows/riassunto-home.yml');
    assert.match(yml, /schedule:\s*\n\s*- cron: '41 \*\/3 \* \* \*'/);
    assert.match(yml, /workflow_dispatch:/);
    assert.match(yml, /concurrency:\s*\n\s*group: riassunto-home\s*\n\s*cancel-in-progress: false/);
    // lanciato dall'API senza input: `prova` ha il suo valore predefinito (false) e il riassunto si scrive davvero
    assert.match(yml, /prova:[\s\S]*default: false/);
});

test('documentazione: REGOLE-DATABASE.md spiega l\'avvio automatico e come creare il segreto', () => {
    const doc = leggi('REGOLE-DATABASE.md');
    assert.match(doc, /firebase functions:secrets:set GITHUB_ACTIONS_TOKEN/);
    assert.match(doc, /firebase deploy --only functions:avviaRiassuntoHome/);
});
