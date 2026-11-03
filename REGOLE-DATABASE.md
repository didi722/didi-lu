# Regole del Realtime Database: cosa non funziona oggi e il passo 1 sicuro

## Il problema delle regole attuali
In Firebase un permesso dato a un nodo **non si può togliere ai suoi figli**. Con `".read": true` e `".write": "auth != null"` in cima, tutte le regole più in basso sono decorative:
- **Lettura:** chiunque, anche senza account, legge tutto: `users` (nome, cognome, **email**), `pushTokens`, la posta in `notifiche`, `partite/*/privato` (le scelte nascoste di una partita in corso).
- **Scrittura:** qualunque utente loggato scrive ovunque: può mettersi `role: "admin"` in `users`, cancellare formati, cambiare stagioni e classifiche degli altri.

## Perché non si può chiudere tutto in un colpo
Il sito oggi calcola e scrive dal browser anche i risultati (`risultati-match.js`: classifiche, statistiche dei giocatori, badge; `sfide.js`: showdown). Finché è così, `players` e `seasons` devono restare scrivibili da chi è loggato. Chiuderli del tutto è il passo 2: spostare quei calcoli nelle Cloud Functions.

## Passo 1 (da incollare in Firebase → Realtime Database → Regole)
Non cambia nulla di quello che il sito fa oggi; chiude i buchi che non servono a nessuna pagina:
- `users`: lo legge solo il proprietario (e l'admin per la lista); lo scrive solo l'admin (via l'escalation ad admin).
- `regolamenti` (formati) e `settings`: scrittura solo admin.
- `pushTokens`, `notifiche`, `partite/*/privato`: ora davvero privati. L'admin può leggere/scrivere `notifiche` (serve a "Delete season", che pulisce le notifiche).
- `partite`: lettura solo da loggati (come già scritto), scrittura solo della `presenza`; il resto lo scrive il server.
- Tutto quello che non è elencato (`partiteServer`, `pushInviati`, `pushProve`, `badgeVisti`) è chiuso al sito; le Functions e il checker passano comunque (Admin SDK).

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    // Dati dell'account: nome, cognome, email, ruolo. Solo il proprietario li legge; solo l'admin li scrive.
    "users": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      "$uid": {
        ".read": "auth != null && auth.uid === $uid"
      }
    },

    // Dati pubblici della lega. Scrittura aperta ai loggati finché i risultati si calcolano dal browser (passo 2).
    "players": { ".read": true, ".write": "auth != null" },
    "seasons": { ".read": true, ".write": "auth != null" },

    // Formati e impostazioni: li cambia solo l'admin.
    "regolamenti": { ".read": true, ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'" },
    "settings":    { ".read": true, ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'" },

    // Sfide. Passo 2: sostituire ".write" con la regola stretta qui sotto (prima va provata su tutti i passaggi di una sfida)
    //   "$sfida": { ".write": "auth != null && (root.child('users').child(auth.uid).child('role').val() === 'admin' || (!data.exists() && newData.child('stato').val() === 'in_attesa' && newData.child('daId').val() === root.child('users').child(auth.uid).child('name').val().toLowerCase()) || (data.exists() && newData.exists() && (data.child('daId').val() === root.child('users').child(auth.uid).child('name').val().toLowerCase() || data.child('aId').val() === root.child('users').child(auth.uid).child('name').val().toLowerCase())))" }
    "sfide": {
      "$stagione": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },

    // Posta e preferenze di ognuno. L'admin legge/scrive tutto (pulizia delle notifiche quando elimina una stagione).
    "notifiche": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },

    // Token dei telefoni: ognuno scrive i suoi, nessuno li legge dal sito.
    "pushTokens": {
      "$uid": {
        ".write": "auth != null && auth.uid === $uid",
        ".read": false
      }
    },

    // Partite online. Le scrive il server (Functions); il browser scrive solo la propria presenza.
    "partite": {
      "$id": {
        "info":          { ".read": "auth != null" },
        "stato":         { ".read": "auth != null" },
        "errore":        { ".read": "auth != null" },
        "pronti":        { ".read": "auth != null" },
        "team":          { ".read": "auth != null" },
        "setCorrente":   { ".read": "auth != null" },
        "log":           { ".read": "auth != null" },
        "risultati":     { ".read": "auth != null" },
        "haScelto":      { ".read": "auth != null" },
        "rivincita":     { ".read": "auth != null" },
        "reazioni":      { ".read": "auth != null" },
        "reazioniTotali":{ ".read": "auth != null" },
        "presenza":      { ".read": "auth != null", ".write": "auth != null" },
        "privato": {
          "$lato": {
            ".read": "auth != null && auth.uid === root.child('partite').child($id).child('info').child($lato).child('uid').val()"
          }
        }
      }
    }
  }
}
```

## Dopo averle pubblicate: cosa provare (5 minuti)
1. Da **non loggato**: home, Matches, Trainers, Formats, Stats si aprono con i dati.
2. Da **giocatore**: salvare un colore/avatar, iscriversi a una stagione, sfidare, accettare, giocare un set, votare l'MVP, aprire il campanello (anche **Send a test**).
3. Da **admin**: creare/chiudere/eliminare una stagione, creare un formato, aggiungere un giocatore.
4. Una partita **in diretta** guardata da un secondo account.

Se qualcosa smette di funzionare, rimetti le regole vecchie (tienine una copia) e dimmi quale azione ha fallito: nella console del browser compare "permission_denied" col percorso.

Due rischi noti: chi guarda le partite in diretta **senza account** non le vedrà più (nelle regole era già "auth != null", ma non valeva); e non ho potuto provare le regole su Firebase da qui.
