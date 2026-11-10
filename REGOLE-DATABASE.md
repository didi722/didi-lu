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
- `cosmeticiPresi` (di chi è ogni avatar, colore o canzone): sono unici, quindi uno solo li ha. Ognuno può averne un massimo per tipo (`LIMITI` in `cosmetici.js`: 3 avatar, 2 colori, 3 canzoni): per prenderne un altro a quota piena ne rilascia uno (gratis) e quello torna libero per tutti. Il primo di ogni tipo è gratis. Indossare uno di quelli che si hanno è gratis. Il registro elenca tutto quello che gli allenatori hanno (non solo quello che portano). Lo legge chiunque (serve a mostrare "già preso" nello Shop), lo scrive solo il server.
- Avatar, colore e canzone nel profilo (`players/…/info/avatar`, `color`, `musicaPreferita`, `musicName`): comprarli, rilasciarli e indossarli lo fa il server (Functions `acquistaCosmetico`, `rilasciaCosmetico`, `cambiaCosmetico`); il sito li può solo leggere. Regole `.validate`: si scrivono solo se non esistono ancora (come quando il pannello admin crea il giocatore) o lasciandoli uguali.
- Cosmetici del negozio nel profilo (`info/aura`, `info/effettoNome`, `info/effettoPalco`, i motivi a pagamento dello sfondo (tutti tranne Plain e Dots) in `info/pagina/sfondo/motivo`): `players` resta scrivibile dai loggati, ma questi valori si accettano solo se chi scrive li ha nel portafoglio (o se non cambiano, così chi usava già un motivo lo tiene). Sono regole `.validate`, che il permesso del nodo sopra non può scavalcare. Le Functions passano comunque.
- Notifiche cancellate dal campanello: `notifiche/<uid>/nascoste/<chiave>` = timestamp (come `posta-lette`: lo scrive il proprietario, nessuna regola in più; i dati restano, solo non si mostrano).
- Palestra (`players/<id>/info/palestra` = `{ tappe: [ {formato, categoria, team, vantaggio} × 3 ] }`): nessuna regola in più, vale quella di `players` (scrivibile dai loggati). I team della palestra non sono copiati: la tappa punta a un team del Box (`players/<id>/teams/<team>`) e lo legge dal vivo. Limite noto: chi è loggato può leggerli e scrivere la palestra di un altro; i team restano nascosti solo nell'interfaccia. I progressi dello sfidante stanno nel browser (`localStorage`), non nel database. In battaglia la palestra si veste con l'aspetto della pagina del capopalestra (si leggono `info/color`, `info/pagina`, `info/aura`, `info/effettoNome`, `info/effettoPalco`, `info/avatar`: gli stessi valori della sua pagina pubblica, già leggibili da tutti i loggati).
- Stile di gioco (`players/<id>/stile` = `{ v, set, decisioni, azioni: { mosse, cambi, attacco, protezione, … }, lega: { … }, aggiornato }`): le scelte di ogni allenatore nei set giocati sul sito, sommate (e la somma di tutta la lega); le scrive il workflow *Stile dei giocatori* (Admin SDK, ogni sei ore e a mano) e le legge la CPU per conoscere le abitudini di chi ha davanti. Lo stesso nodo contiene `situazioni` (`{ v, firma, set, singoli?, doppi?, validazione }`): come cambiano le scelte nelle varie situazioni (turno, PS, vantaggio…), imparate dai replay dei set della lega e uguali in ogni nodo; `singoli`/`doppi` ci sono solo se la prova incrociata dice che servono. Nessuna regola in più: vale quella di `players` (lettura libera, scrittura dei loggati).
- Meta della lega (`settings/cpuMeta` = `{ v, aggiornato, formati: { <categoria in minuscolo senza spazi>: { team, set, specie: { id: quota }, mosse: { id: { mossa: quota } }, classi, squadra } } }`): quali Pokémon e mosse si giocano nei team iscritti alle stagioni **chiuse**, solo numeri aggregati (mai team interi, accoppiamenti o nomi di giocatori). Le soglie di riservatezza sono spente (decisione del proprietario): compare ogni Pokémon e ogni mossa visti anche una volta sola, con le quote al centesimo; si può riaccenderle con `riservatezza: true` in `MetaLega.aggrega`. Il minimo è di tre team per formato. Lo scrive il workflow *Stile dei giocatori* (Admin SDK) e lo legge la CPU per comporre i suoi team. Nessuna regola in più: vale quella di `settings` (lettura libera, scrittura solo admin).
- Edizioni limitate: per ora non ce ne sono. Il codice le supporta ancora (una voce del catalogo con `edizione: { stagione, nome }` si vende solo finché `seasons/<id>/info/status` non è `closed`): non servono regole in più.
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
          "aura": { ".validate": "newData.val() == null || data.val() == newData.val() || root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists()" },
          // effetti del nome (id nome-…) e del palco (id palco-…): come l'aura, ma con il prefisso giusto
          "effettoNome": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val().beginsWith('nome-') && root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists())" },
          "effettoPalco": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val().beginsWith('palco-') && root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists())" },
          "pagina": { "sfondo": { "motivo": {
            // i nove motivi a pagamento (id nel catalogo: sfondo-<motivo>); Plain e Dots (quello di partenza) sono liberi
            ".validate": "(newData.val() != 'righe' && newData.val() != 'griglia' && newData.val() != 'zigzag' && newData.val() != 'scacchi' && newData.val() != 'raggi' && newData.val() != 'pokeball' && newData.val() != 'anelli' && newData.val() != 'stelle' && newData.val() != 'onde') || data.val() == newData.val() || root.child('wallet').child(auth.uid).child('posseduti').child('sfondo-' + newData.val()).exists()"
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
5. **SHOP** (voce del menu del sito, e tessera nel menu dell'app): comprare un cosmetico (anche un effetto del nome o del palco), metterlo e toglierlo (passa dalle Functions). Toccando una voce la si prova sulla propria pagina, nel riquadro a destra. Poi **Customize → Save** sulla propria pagina: deve salvare anche con un motivo comprato. Se compare "permission_denied" su `players/…/info/pagina/sfondo/motivo`, c'è un motivo a pagamento non nel portafoglio. Nel Customize compaiono solo i motivi liberi e quelli comprati (con un rimando allo Shop per gli altri).
6. **SHOP → Trainer**: prendere un avatar, un colore o una canzone (il primo è gratis; poi costano; al massimo 3 avatar, 2 colori e 3 canzoni: a quota piena si sceglie quale rilasciare), indossare uno di quelli che si hanno (gratis) e rilasciarne uno (gratis, torna libero per tutti). Passa dalle Functions, non da Save. In **Customize → Trainer** ci sono solo quelli che si hanno, con un rimando allo Shop. Se compare "permission_denied" su `players/…/info/avatar` o `info/color`, c'è ancora una versione vecchia del sito in cache: svuotarla. Lo Shop legge `cosmeticiPresi` e `players` (per mostrare in grigio quello che hanno gli altri) e `seasons/<id>/info` (per le edizioni).
7. **SHOP → Pokémon** (o ✨ su un team del Box): rendere shiny un Pokémon.
8. **PALESTRA** (da profilo → *Set up your gym*, o dalla scheda di un allenatore → *Challenge gym*): impostare 3 tappe (formato doppio, team del Box, vantaggio) e salvare; dalla scheda di un altro allenatore con la palestra pronta, scegliere i 3 team e affrontare le tappe una dopo l'altra (la CPU gioca il team della palestra). Una sconfitta riporta alla prima tappa. Nessuna Function, nessuna regola nuova: basta svuotare la cache. Provare anche: la scelta dei team a passi (un format alla volta, poi il riepilogo) e che il vantaggio di campo resti per tutta la partita (il conto dei turni dice "all battle"). In battaglia, controllare che compaiano il cartello del vantaggio (all'ingresso e a inizio partita), il tasto del vantaggio nell'insegna e lo sfondo con i colori del capopalestra.

Se qualcosa smette di funzionare, rimetti le regole vecchie (tienine una copia) e dimmi quale azione ha fallito: nella console del browser compare "permission_denied" col percorso.

Shiny dei team: le monete non si falsificano (le scrive solo il server) e avatar, colore e canzoni li cambia solo il server, ma il segno shiny dentro i team (`players/…/teams`) si scrive dal sito. Il Box toglie lo shiny non comprato quando salva un team, ma chi scrive a mano nel database può aggirarlo: è solo estetico.

Due rischi noti: chi guarda le partite in diretta **senza account** non le vedrà più (nelle regole era già "auth != null", ma non valeva); e non ho potuto provare le regole su Firebase da qui.
