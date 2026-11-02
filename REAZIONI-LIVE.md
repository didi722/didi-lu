# Reazioni alle partite in diretta

Chi guarda una partita (battle.html, "Watching live") ha sotto lo schermo sei tasti: 🔥 Hype, 😱 No way, 😂 LOL, 👏 GG, 💀 Ouch, ❤️ Love it. Un tocco e la reazione sale sul campo, **per tutti quelli che sono dentro la partita, giocatori compresi** (i giocatori vedono le reazioni ma non hanno i tasti). Sotto ogni tasto il totale della partita.

- Una reazione ogni 0,9 secondi a testa, al massimo 400 a partita, solo mentre si gioca (anche tra un set e l'altro).
- Il database non dice chi ha reagito: salva solo il tipo e l'ora.
- Funziona per le partite ufficiali e per le amichevoli.
- Per cambiare il disegno di una reazione (un'immagine al posto dell'emoji) basta cambiare `glifo` in `docs/reazioni-live.js`.

## Da fare una volta sola (servono i tuoi accessi: io non posso farlo)

1. **Pubblicare la funzione** (da Cloud Shell, come le altre volte): `firebase deploy --only functions:reagisciPartita`
   (è leggera: non carica il simulatore). Finché non è pubblicata i tasti compaiono ma toccandoli esce «Couldn't send it. Try again.».
2. **Regole del Realtime Database** (Firebase → Realtime Database → Regole). Controlla due cose:
   - **leggere**: chi è loggato deve poter leggere `partite/<id>/reazioni` e `partite/<id>/reazioniTotali`. Se la tua regola di lettura sta già su `partite/$id` (o su `partite`) vale anche per questi nodi e non c'è niente da fare; se invece elenchi i figli uno per uno (`stato`, `log`, …) aggiungi questi due con la stessa regola di `log`, per esempio:
     ```json
     "reazioni":       { ".read": "auth != null" },
     "reazioniTotali": { ".read": "auth != null" }
     ```
   - **scrivere**: nessun client deve poter scrivere in `reazioni`, `reazioniTotali` e `reazioniLimiti` (le scrive solo il server, che ignora le regole). Se la regola di scrittura di `partite/$id` è chiusa ai client (o limitata a `presenza`) non serve altro.

## Come controllare che funzioni
- Apri una partita in corso da un account che non la gioca: sotto lo schermo compaiono i tasti. Toccane uno: la reazione sale sul campo di chi guarda e dei due giocatori e il totale cresce.
- In Firebase → Realtime Database, dentro `partite/<id>` compaiono `reazioni`, `reazioniTotali`, `reazioniLimiti`.
- Se i tasti non fanno niente: Firebase → Functions → Log (`reagisciPartita`).
