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
- `wallet` (le monete): ognuno legge solo il proprio, nessuno lo scrive dal sito. **Senza queste regole il negozio non è sicuro**: oggi chiunque sia loggato può scrivere ovunque, quindi anche darsi monete.
- `cosmeticiPresi` (chi tiene riservato quale avatar, colore o canzone): sono unici. Ognuno ne tiene due per tipo: il primo, "di casa", per sempre (l'unica cosa personale: tornarci non costa mai), e quello che porta finché lo porta (cambiando torna libero). Lo legge chiunque (serve a mostrare "già preso" nell'editor), lo scrive solo il server.
- Avatar, colore e canzone nel profilo (`players/…/info/avatar`, `color`, `musicaPreferita`, `musicName`): cambiarli costa e lo fa il server; il sito li può solo leggere. Regole `.validate`: si scrivono solo se non esistono ancora (come quando il pannello admin crea il giocatore) o lasciandoli uguali.
- Cosmetici del negozio nel profilo (`players/…/info/pkmShiny`, `info/aura`, `info/effettoNome`, `info/effettoPalco`, i motivi a pagamento dello sfondo in `info/pagina/sfondo/motivo`): `players` resta scrivibile dai loggati, ma questi valori si accettano solo se chi scrive li ha nel portafoglio (o se non cambiano, così chi usava già un motivo lo tiene). Sono regole `.validate`, che il permesso del nodo sopra non può scavalcare. Le Functions passano comunque.
- Edizioni limitate (voci del catalogo con `edizione`, per ora "Lagoon" legata alla stagione `s1`): non servono regole in più, le vende il server e controlla `seasons/<id>/info/status` (con `closed` l'edizione è finita; finché la stagione non esiste è "in arrivo"). Per legarne una a un'altra stagione si cambia `EDIZIONE_LAGUNA` in `cosmetici.js` (le due copie).
- Tutto quello che non è elencato (`partiteServer`, `pushInviati`, `pushProve`, `badgeVisti`, `walletEventi`) è chiuso al sito; le Functions e il checker passano comunque (Admin SDK).

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
    "players": {
      ".read": true,
      ".write": "auth != null",
      "$giocatore": {
        "info": {
          // Cosmetici a pagamento: un valore nuovo passa solo se è già nel portafoglio di chi scrive; togliere o lasciare com'è si può sempre.
          // Avatar, colore e canzone: li cambia solo il server (si pagano). Il sito può crearli (admin) o lasciarli uguali.
          "avatar": { ".validate": "!data.exists() || newData.val() == data.val()" },
          "color": { ".validate": "!data.exists() || newData.val() == data.val()" },
          "musicaPreferita": { ".validate": "!data.exists() || newData.val() == data.val()" },
          "musicName": { ".validate": "!data.exists() || newData.val() == data.val()" },
          "pkmShiny": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val() === true && root.child('wallet').child(auth.uid).child('posseduti').child('shiny').exists())" },
          "aura": { ".validate": "newData.val() == null || data.val() == newData.val() || root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists()" },
          // effetti del nome (id nome-…) e del palco (id palco-…): come l'aura, ma con il prefisso giusto
          "effettoNome": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val().beginsWith('nome-') && root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists())" },
          "effettoPalco": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val().beginsWith('palco-') && root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists())" },
          "pagina": { "sfondo": { "motivo": {
            // i cinque motivi a pagamento (id nel catalogo: sfondo-<motivo>); gli altri sono liberi
            ".validate": "(newData.val() != 'raggi' && newData.val() != 'pokeball' && newData.val() != 'anelli' && newData.val() != 'stelle' && newData.val() != 'onde') || data.val() == newData.val() || root.child('wallet').child(auth.uid).child('posseduti').child('sfondo-' + newData.val()).exists()"
          } } }
        }
      }
    },
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

    // Monete e cosmetici (functions/monete.js): ognuno legge il proprio portafoglio, lo scrive SOLO il server (nessuna regola ".write": è chiuso al sito).
    // Senza queste regole (oggi qualunque utente loggato scrive ovunque) chiunque potrebbe darsi monete a mano: pubblicale prima di far girare il negozio.
    "wallet": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid"
      }
    },

    // Chi tiene riservato quale avatar, colore o canzone (functions/monete.js): pubblico in lettura, lo scrive solo il server.
    "cosmeticiPresi": { ".read": true },

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
5. Negozio: comprare un cosmetico (anche un effetto del nome o del palco), metterlo e toglierlo (passa dalle Functions; l'edizione limitata in cima si compra finché la stagione `s1` esiste e non è chiusa, prima compare "Soon"); poi **Customize → Save** sulla propria pagina: deve salvare anche con un motivo comprato. Se compare "permission_denied" su `players/…/info/pagina/sfondo/motivo`, c'è un motivo a pagamento non nel portafoglio.
6. **Customize → Trainer**: cambiare avatar, colore e canzone (passa dalle Functions, non da Save). Se compare "permission_denied" su `players/…/info/avatar` o `info/color`, c'è ancora una versione vecchia del sito in cache: svuotarla.

Se qualcosa smette di funzionare, rimetti le regole vecchie (tienine una copia) e dimmi quale azione ha fallito: nella console del browser compare "permission_denied" col percorso.

Shiny dei team: le monete non si falsificano (le scrive solo il server) e avatar, colore e canzoni li cambia solo il server, ma il segno shiny dentro i team (`players/…/teams`) si scrive dal sito. Il Box toglie lo shiny non comprato quando salva un team, ma chi scrive a mano nel database può aggirarlo: è solo estetico.

Due rischi noti: chi guarda le partite in diretta **senza account** non le vedrà più (nelle regole era già "auth != null", ma non valeva); e non ho potuto provare le regole su Firebase da qui.
