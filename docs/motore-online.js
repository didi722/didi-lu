// =====================================================
// MOTORE ONLINE
// Stessa interfaccia di BattagliaLocale (on / scegli), ma la
// battaglia gira sul server: qui si ascolta Firebase e si
// inviano le scelte alla funzione "inviaScelta".
//
// Eventi:
//   'log'       (righe)             righe pubbliche del set in corso
//   'richiesta' (lato, richiesta)   solo per il proprio lato
//   'errore'    (lato, messaggio)   scelta rifiutata dal server
//   'fine'      ({ vincitore })     fine del set in corso
//   'set'       (numero)            inizia un nuovo set
//   'risultati' (risultati)         vincitori dei set giocati
//   'stato'     (stato)             lobby / in_corso / da_salvare / salvata ...
//   'avversario'(passo)             l'avversario ha scelto per questo passo
//   'pronti'    ({ p1, p2 })        chi è pronto nella lobby
//   'rivincita' (offerta | null)    (amichevoli) la rivincita offerta a fine partita: { sfida, daUid, da, bestOf, cambioTeam, stato }
//
// Metodi: scegli(lato, scelta), annulla(lato) (ritira la scelta finché l'avversario non ha scelto), avvia(), chiudi().
// =====================================================

import './esito-set.js';         // self.EsitoSet

// L'errore di "annullaScelta" in parole del sito (il server risponde in italiano; una funzione non ancora pubblicata o
// la rete che cade danno errori tecnici che a chi gioca non servono)
export function messaggioAnnulla(errore) {
    const testo = String((errore && errore.message) || errore || '');
    if (/^Troppo tardi/i.test(testo)) return 'Too late: your opponent has already chosen.';
    if (/nessuna scelta da annullare/i.test(testo)) return "There's no choice to cancel.";
    if (/richiesta è scaduta/i.test(testo)) return 'This turn has already moved on.';
    return "Couldn't cancel right now. Your choice stays as sent.";
}

export class BattagliaOnline {
    constructor({ id, lato, db, funzioni }) {
        this.id = id;
        this.lato = lato;                    // 'p1', 'p2' oppure null (spettatore)
        this.db = db;
        this.funzioni = funzioni;
        this.ascoltatori = {};
        this.riferimenti = [];
        this.set = 0;
        this.passo = null;
        this.righeLog = [];
    }

    on(evento, fn) {
        (this.ascoltatori[evento] ||= []).push(fn);
        return this;
    }

    _emetti(evento, ...args) {
        (this.ascoltatori[evento] || []).forEach(fn => fn(...args));
    }

    _ascolta(percorso, tipo, fn) {
        const ref = this.db.ref(percorso);
        ref.on(tipo, fn);
        this.riferimenti.push(ref);
        return ref;
    }

    avvia() {
        const base = `partite/${this.id}`;

        this._ascolta(`${base}/stato`, 'value', s => this._emetti('stato', s.val()));
        this._ascolta(`${base}/pronti`, 'value', s => this._emetti('pronti', s.val() || {}));
        this._ascolta(`${base}/risultati`, 'value', s => this._emetti('risultati', s.val() || {}));
        this._ascolta(`${base}/rivincita`, 'value', s => this._emetti('rivincita', s.val() || null));

        this._ascolta(`${base}/setCorrente`, 'value', s => {
            const n = s.val();
            if (!n || n === this.set) return;
            if (this.refLog) this.refLog.off();
            this.set = n;
            this.righeLog = [];
            this._emetti('set', n);
            // Una richiesta del nuovo set arrivata prima del cambio di set
            const sospesa = this.richiestaSospesa;
            if (sospesa && sospesa.set === n) {
                this.richiestaSospesa = null;
                this._consegna(sospesa);
            }
            this.refLog = this._ascolta(`${base}/log/set${n}`, 'child_added', blocco => {
                // il server le toglie già (righePubbliche); qui una difesa in più per i log salvati prima
                let righe = String(blocco.val() || '').split('\n').filter(r => r.startsWith('|') && !r.startsWith('|debug|'));
                // set chiusi in pareggio prima che il server lo risolvesse da solo: vince chi è caduto per ultimo
                if (righe.some(r => r === '|tie' || r === '|tie|') && self.EsitoSet) {
                    righe = self.EsitoSet.risolviPareggio([...this.righeLog, ...righe]).slice(this.righeLog.length);
                }
                this.righeLog.push(...righe);
                this._emetti('log', righe);
                for (const r of righe) {
                    if (r.startsWith('|win|')) this._emetti('fine', { vincitore: r.slice(5) });
                }
            });
        });

        if (this.lato) {
            this._presenza();
            const avversario = this.lato === 'p1' ? 'p2' : 'p1';
            this._ascolta(`${base}/privato/${this.lato}/richiesta`, 'value', s => {
                const r = s.val();
                if (!r || r.passo === this.passo) return;
                if (r.set !== this.set) { this.richiestaSospesa = r; return; }
                this._consegna(r);
            });
            this._ascolta(`${base}/haScelto/${avversario}`, 'value', s => this._emetti('avversario', s.val()));
        }
    }

    /**
     * Segna che questo giocatore è dentro la partita: il server non gli manda la notifica "tocca a te" mentre il simulatore è aperto (functions/push.js, inPartita).
     * Un battito ogni 30 secondi; sparisce da solo se la connessione cade o alla chiusura; nell'app, con lo schermo spento o l'app in secondo piano, si toglie (le notifiche devono arrivare).
     */
    _presenza() {
        const w = typeof self !== 'undefined' ? self : null;
        if (!w || !w.firebase || !w.firebase.database) return;
        const ref = this.db.ref(`partite/${this.id}/presenza/${this.lato}`);
        const nellApp = () => !!(w.document && w.document.documentElement.classList.contains('app'));
        const metti = () => { ref.set(w.firebase.database.ServerValue.TIMESTAMP).catch(() => { /* senza: arrivano anche le notifiche */ }); };
        const togli = () => { ref.remove().catch(() => { /* scade da sola */ }); };
        try { ref.onDisconnect().remove(); } catch (e) { /* senza: scade da sola dopo 90 secondi */ }
        metti();
        this._battito = w.setInterval(() => { if (!(nellApp() && w.document.visibilityState === 'hidden')) metti(); }, 30000);
        this._togliPresenza = togli;
        if (w.document) {
            this._visibilita = () => { if (!nellApp()) return; if (w.document.visibilityState === 'hidden') togli(); else metti(); };
            w.document.addEventListener('visibilitychange', this._visibilita);
        }
    }

    _consegna(r) {
        this.passo = r.passo;
        this._emetti('richiesta', this.lato, JSON.parse(r.json));
    }

    async scegli(lato, scelta) {
        try {
            await this.funzioni.httpsCallable('inviaScelta')({ id: this.id, passo: this.passo, scelta });
        } catch (e) {
            this._emetti('errore', lato, e.message || String(e));
        }
    }

    // Ritira la scelta già inviata, finché l'avversario non ha scelto. { ok: true } oppure { ok: false, messaggio }
    async annulla() {
        try {
            await this.funzioni.httpsCallable('annullaScelta')({ id: this.id, passo: this.passo });
            return { ok: true };
        } catch (e) {
            return { ok: false, messaggio: messaggioAnnulla(e) };
        }
    }

    chiudi() {
        if (this._battito) { self.clearInterval(this._battito); this._battito = null; }
        if (this._visibilita && self.document) self.document.removeEventListener('visibilitychange', this._visibilita);
        if (this._togliPresenza) { this._togliPresenza(); this._togliPresenza = null; }
        this.riferimenti.forEach(r => r.off());
        this.riferimenti = [];
    }
}
