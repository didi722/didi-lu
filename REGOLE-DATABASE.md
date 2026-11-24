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
- Cosmetici del negozio nel profilo (`info/aura`, `info/effettoNome`, `info/effettoPalco`, `info/stileCard` (ids `card-…`), `info/sfondoBox` (`box-…`), `info/effettoEntrata` (`entrata-…`), i motivi a pagamento dello sfondo (tutti tranne Plain e Dots) in `info/pagina/sfondo/motivo`): `players` resta scrivibile dai loggati, ma questi valori si accettano solo se chi scrive li ha nel portafoglio (o se non cambiano, così chi usava già un motivo lo tiene). Sono regole `.validate`, che il permesso del nodo sopra non può scavalcare. Le Functions passano comunque.
- Notifiche cancellate dal campanello: `notifiche/<uid>/nascoste/<chiave>` = timestamp (come `posta-lette`: lo scrive il proprietario, nessuna regola in più; i dati restano, solo non si mostrano).
- Palestra (`players/<id>/info/palestra` = `{ tappe: [ {formato, categoria, team, vantaggio} × 3 ] }`): nessuna regola in più, vale quella di `players` (scrivibile dai loggati). I team della palestra non sono copiati: la tappa punta a un team del Box (`players/<id>/teams/<team>`) e lo legge dal vivo. Limite noto: chi è loggato può leggerli e scrivere la palestra di un altro; i team restano nascosti solo nell'interfaccia. I progressi dello sfidante stanno nel browser (`localStorage`), non nel database. In battaglia, e già nella pagina di scelta dei team, la palestra si veste con l'aspetto della pagina del capopalestra (si leggono `info/color`, `info/pagina`, `info/aura`, `info/effettoNome`, `info/effettoPalco`, `info/avatar`, `info/pkmPreferito`: gli stessi valori della sua pagina pubblica, già leggibili da tutti i loggati) e suona la sua canzone preferita (`info/musicaPreferita` + `info/musicName`, che scrive il server quando la si indossa dallo Shop).

- Allenamento della CPU delle palestre (`players/<id>/palestraAllenamento/<team>`, uno per team del Box che è in una tappa della palestra; nessuna regola nuova, **nessuna Function**: lo scrive il browser del capopalestra e vale quella di `players`, scrivibile dai loggati). Dalla pagina dove si imposta la palestra (*Train CPU*, o *Train* nella carta di una tappa) si fa una partita di allenamento (`battle.html?cpu=1&allenamento=<tappa>&team=<id del team>`: il proprio team contro un team della CPU, come una prova dal Box); la CPU guarda come si gioca e a fine lezione la salva con una transazione: `{ v: 1, lezioni, partite, scelte, t, memoria, contro }`. `memoria` è la *memoria della serie* (`cpu-memoria.js`: per ogni Pokémon quante volte l'ha portato, aperto, le mosse usate e quelle del primo turno, quanto si para, cambia o usa mosse di stato); `contro` è `{ <specie avversaria>: { n, p: { <mio Pokémon>: quante volte l'ha portato }, l: { <mio Pokémon>: quante volte l'ha messo in apertura } } }`; `lezioni` conta le lezioni pesate (una da 6 turni in su vale 1, una più corta in proporzione; con 4 lezioni piene e tutti i Pokémon visti giocare la barra è al 100%). Sono solo numeri aggregati (mai partite intere né i team: le specie e le mosse sono id), chiavi solo `[a-z0-9]` e niente liste (il database le trasformerebbe in oggetti), al massimo ~25 KB per team; `cpu-copione.js` li ripulisce a ogni lettura (`normalizza`), quindi un valore rotto o scritto a mano vale come "non allenata". I numeri invecchiano (ogni lezione fa valere le precedenti il 92%). Chi sfida la palestra lo legge (`team-sito.js`, `caricaTappaPalestra`) e la CPU difende il team come l'ha allenata: in anteprima porta e apre come il capopalestra contro quella squadra, in battaglia usa le mosse di apertura e lo stile (parate, mosse di stato, cambi) che ha visto, senza smettere di calcolare (un'abitudine chiaramente cattiva non la segue fino in fondo). Chi sfida non vede quanto è allenata: la targa mostra solo i tre numeri della palestra. Limite noto, lo stesso di tutto `players`: chi è loggato può scrivere il copione di un altro (peggiorerebbe solo la CPU di quella palestra).
- Statistiche e premio delle palestre (Function `palestraSfida`, `functions/palestra-sfide.js`; nessuna regola nuova, ma **servono le Functions pubblicate**): il simulatore contro la CPU gira nel browser, che riferisce al server l'inizio e la fine di ogni tappa (`azione: 'inizia' | 'fine'`, `gym`, `tappa`, `vinta`). Il server scrive tre cose:
  - `players/<capopalestra>/palestraStat` = `{ v, tentativi, tenuta, espugnata, tappe: [{ giocate, vinte } × 3], ultime: [{ c, n, t, e: 'v' | 'p', s }] (le ultime 8 sfide), espugnatori: { <id>: { n, q, t } }, t }`: pubblico in lettura come tutto `players` (e, come tutto `players`, scrivibile da chi è loggato: i numeri si possono ritoccare a mano, ma non danno monete). Un *tentativo* è una sfida finita (da una sconfitta o dalla terza tappa vinta), quindi `tentativi = tenuta + espugnata`. La pagina della palestra (`palestra.html`) li mostra.
  - `palestraSfide/<uid>/<id palestra>` = `{ vinte, inizio, ok }`: dove è arrivato chi sfida. **Privato**: non è nelle regole, quindi chiuso al sito; lo legge e lo scrive solo il server.
  - il premio: `PREMI.palestra` (10 monete) a chi espugna la palestra di un altro, **una volta a settimana per ogni palestra** (settimana ISO, lunedì-domenica in UTC: più palestre espugnate, più premi), segnato in `walletEventi/palestra-<settimana>-<uid>-<palestra>`; `wallet/<uid>/premiPalestra/<palestra>` = `{ settimana, t }` dice al sito che il premio di quella palestra per questa settimana è già stato preso (il portafoglio lo legge solo il proprietario; il vecchio `wallet/<uid>/premioPalestra` = `{ settimana, gym, t }`, che valeva per una palestra sola, il sito lo legge ancora per la sua palestra).
  - Limite noto: il server non può controllare la partita contro la CPU. Per non regalare monete a chi chiama la Function a mano: un `fine` vale solo dopo il suo `inizia` e dopo almeno 40 secondi, una sola volta; una sfida non vista cominciare dalla prima tappa conta nelle statistiche ma non dà monete; il tetto vero è la settimana per ogni palestra (10 monete).
- Stile di gioco (`players/<id>/stile` = `{ v, set, decisioni, azioni: { mosse, cambi, attacco, protezione, … }, lega: { … }, aggiornato }`): le scelte di ogni allenatore nei set giocati sul sito, sommate (e la somma di tutta la lega); le scrive il workflow *Stile dei giocatori* (Admin SDK, ogni sei ore e a mano) e le legge la CPU per conoscere le abitudini di chi ha davanti. Lo stesso nodo contiene `situazioni` (`{ v, firma, set, singoli?, doppi?, validazione }`): come cambiano le scelte nelle varie situazioni (turno, PS, vantaggio…), imparate dai replay dei set della lega e uguali in ogni nodo; `singoli`/`doppi` ci sono solo se la prova incrociata dice che servono. Nessuna regola in più: vale quella di `players` (lettura libera, scrittura dei loggati).
- Meta della lega (`settings/cpuMeta` = `{ v, aggiornato, formati: { <categoria in minuscolo senza spazi>: { team, set, specie: { id: quota }, mosse: { id: { mossa: quota } }, classi, squadra } } }`, dove `classi` e `squadra` dicono quanti set e quanti per team hanno Helping Hand, Protezione, Fake Out, deviatore, Tailwind, Stanza Magica, mosse prioritarie e pivot): quali Pokémon e mosse si giocano nei team iscritti alle stagioni **chiuse**, solo numeri aggregati (mai team interi, accoppiamenti o nomi di giocatori). Le soglie di riservatezza sono spente (decisione del proprietario): compare ogni Pokémon e ogni mossa visti anche una volta sola, con le quote al centesimo; si può riaccenderle con `riservatezza: true` in `MetaLega.aggrega`. Il minimo è di tre team per formato. Lo scrive il workflow *Stile dei giocatori* (Admin SDK) e lo legge la CPU per comporre i suoi team. Nessuna regola in più: vale quella di `settings` (lettura libera, scrittura solo admin).
- Eccezione del movepool per i team già creati (`players/<id>/teams/<id>/eccezioneMosse` = `true`, nessuna regola nuova, ma **servono `firebase deploy --only functions`**: `controllo-team.js` e `partita.js` cambiano): Little Cup, VGC Gen 8 e QWERTY avevano già i loro team quando è arrivato il controllo che ogni mossa sia nel movepool della specie, e alcuni sono diventati illegali. Un team di quei tre formati (solo quelli) non si controlla sulle mosse, in Box, nel simulatore e sul server, se nel Box non è stato toccato prima del 16/11/2026 15:01 UTC (`dataUltimaModifica` più vecchia o assente) o se ha `eccezioneMosse: true`, che il Box gli scrive la prima volta che lo si modifica (così cambiargli il nome non gli toglie l'eccezione). Un team nuovo, o di un altro formato, è controllato per intero; specie, abilità, strumenti, tier e clausole valgono per tutti (`ControlloTeam.eccezioneMosse`).
- Account nuovi (admin.html → crea giocatore, **serve `firebase deploy --only functions`**: Function `assegnaInizialiGiocatore`, solo admin): il giocatore non ha più il nodo `players/<id>/teams` (prima c'era un finto `descrizione: "Lista team ancora vuota"` che compariva come team) e riceve un avatar, un colore e una canzone a caso tra quelli liberi (che nessuno ha o porta; la playlist la legge l'admin dal foglio online e la passa alla Function). Si indossano subito e sono riservati a lui in `cosmeticiPresi`, ma sono "iniziali": `wallet/<uid>/iniziali/{avatar,colore,canzone}` = l'id. Non contano come il primo: il primo cambio di ognuno è sempre gratis e sostituisce l'iniziale, che torna libera per tutti (così anche togliendo la canzone). Se l'admin non ha deployato le Functions o la playlist non si legge, il giocatore si crea lo stesso, con quelli di partenza di sempre (il primo è gratis come prima).
- Bozze dei team (`players/<id>/bozze/<idBozza>` = `{ nome, categoria, testoShowdown, specie: [...], quanti, daTeam, aggiornata }`): un team in lavorazione che il Team Builder mette da parte anche se non è finito (cinque Pokémon, niente mosse, niente nome). Non è un team: non compare in stagioni, match, classifiche né pagine pubbliche, e sparisce quando lo si salva nel Box. `daTeam` è l'id del team del Box da cui si è partiti (vuoto per un team nuovo). Al massimo 20 per giocatore (lo controlla il Team Builder). Nessuna regola in più: vale quella di `players` (lettura libera, scrittura dei loggati); chi scrive a mano nel database può metterci altro, ma la pagina scarta le bozze senza formato o senza Pokémon. In più il Team Builder tiene nel browser (`localStorage`, chiave `boxBackup:<giocatore>`, una sola per giocatore, valida un mese) la copia del team in lavorazione, per proporre di riprenderlo se la pagina si è chiusa da sola: non sta nel database.
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
          // stile delle card (card-…), sfondo del Box (box-…) ed entrata nella schermata VS (entrata-…): come l'aura, con il prefisso giusto
          "stileCard": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val().beginsWith('card-') && root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists())" },
          "sfondoBox": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val().beginsWith('box-') && root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists())" },
          "effettoEntrata": { ".validate": "newData.val() == null || data.val() == newData.val() || (newData.val().beginsWith('entrata-') && root.child('wallet').child(auth.uid).child('posseduti').child(newData.val()).exists())" },
          "pagina": { "sfondo": { "motivo": {
            // i nove motivi a pagamento (id nel catalogo: sfondo-<motivo>); Plain e Dots (quello di partenza) sono liberi
            ".validate": "(newData.val() != 'righe' && newData.val() != 'griglia' && newData.val() != 'zigzag' && newData.val() != 'scacchi' && newData.val() != 'raggi' && newData.val() != 'pokeball' && newData.val() != 'anelli' && newData.val() != 'stelle' && newData.val() != 'onde') || data.val() == newData.val() || root.child('wallet').child(auth.uid).child('posseduti').child('sfondo-' + newData.val()).exists()"
          } } }
        }
      }
    },
    "seasons": { ".read": true, ".write": "auth != null" },

    // Statistiche dei set (setStats/<stagione>/<showdown>/match<N> = { set1: {…}, set2: {…} }): prima stavano dentro ogni match e pesavano l'84% di una stagione. Le scrive il
    // server a fine match (e il browser, finché i risultati si calcolano dal sito): stessa regola di seasons.
    "setStats": { ".read": true, ".write": "auth != null" },

    // Riassunto del Match of the week (settimane, set scelto e badge già calcolati): lo scrive solo il workflow "Riassunto del Match of the week" (con l'admin SDK, che le regole non
    // fermano); tutti lo leggono, nessuno lo scrive dal sito. La home lo usa al posto delle statistiche di tutto il sito.
    "matchSettimana": { ".read": true, ".write": false },

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
8. **PALESTRA** (da profilo → *Set up your gym*, o dalla scheda di un allenatore → *Challenge gym*): impostare 3 tappe (formato doppio, team del Box, vantaggio) e salvare; dalla scheda di un altro allenatore con la palestra pronta, scegliere i 3 team e affrontare le tappe una dopo l'altra (la CPU gioca il team della palestra). Una sconfitta riporta alla prima tappa. Nessuna regola nuova, ma **le statistiche e le monete passano dalla Function `palestraSfida`: serve `firebase deploy --only functions`** (poi svuotare la cache). Provare anche: la scelta dei team (una schermata sola, che sta in una finestra da PC: il tabellone della palestra, le tre porte e il tasto per entrare; toccando una porta si apre la finestra con i team di quel format, e il tasto si accende con i tre team scelti) e che il vantaggio di campo resti per tutta la partita (il conto dei turni dice "all battle"). In battaglia, controllare che compaiano il cartello del vantaggio (all'ingresso e a inizio partita), il tasto del vantaggio nell'insegna e lo sfondo con i colori del capopalestra. La pagina di scelta dei team è già dentro la palestra: sfondo, avatar con l'aura, compagno, nome gigante e targa nei colori del capopalestra, e lì suona la canzone che ha scelto (se non ne ha, quella di sempre del sito); nel simulatore suona la stessa al posto della musica di battaglia di Showdown (il tasto del volume la ferma). Nella pagina della palestra (sia la propria sia quella che si sfida) compaiono i numeri: *Attempts*, *Gym wins* (la palestra ha tenuto), *Gym beaten* (espugnata), con il dettaglio tappa per tappa e le ultime sfide. Espugnare tutte e tre le tappe di una palestra altrui dà 10 monete, **una volta a settimana per ogni palestra** (si riparte il lunedì; palestre diverse pagano ognuna la sua volta): il cartello di fine tappa dice se sono arrivate, se erano già state prese o se la sfida non è partita dalla prima tappa (allora niente monete). **Allenamento della CPU** (nessuna Function, nessuna regola): nella pagina dove si imposta la palestra comparire il pannello *Train your gym's CPU* (percentuale totale e tasto *Train CPU*) e in ogni carta di tappa la barra del team con il tasto *Train* (spento finché la bozza non è salvata); il tasto apre una partita di allenamento (il proprio team contro un team della CPU): in alto *Training · Stage N* con la barra *CPU x%* che sale mentre si gioca, *Lesson n/6* e *End lesson*; a fine partita il cartello *Lesson learned!* con la barra che avanza, cosa ha notato la CPU (chi apre, mosse) e chi non ha ancora visto; *Another training battle* o *Back to my gym*. Uscendo con *← Gym* a metà partita la lezione si salva lo stesso (nell'app dopo la conferma). Dopo qualche lezione, sfidare quella palestra: in anteprima la CPU porta e apre come il proprietario.

Se qualcosa smette di funzionare, rimetti le regole vecchie (tienine una copia) e dimmi quale azione ha fallito: nella console del browser compare "permission_denied" col percorso.

Shiny dei team: le monete non si falsificano (le scrive solo il server) e avatar, colore e canzoni li cambia solo il server, ma il segno shiny dentro i team (`players/…/teams`) si scrive dal sito. Il Box toglie lo shiny non comprato quando salva un team, ma chi scrive a mano nel database può aggirarlo: è solo estetico.

Due rischi noti: chi guarda le partite in diretta **senza account** non le vedrà più (nelle regole era già "auth != null", ma non valeva); e non ho potuto provare le regole su Firebase da qui.

## Statistiche dei set (`setStats`): fuori da `seasons`

Le statistiche di ogni set (KO, Pokémon portati, ultimo rimasto, scelte turno per turno) stavano dentro ogni match, `seasons/<stagione>/showdowns/<sd>/matches/<match>/setStats`, e
pesavano l'84% di una stagione (529 KB su 680): ogni pagina che leggeva una stagione le scaricava, anche quando non le usava (Hub, Matches...). Ora stanno in un nodo a parte,
`setStats/<stagione>/<sd>/<match>` (stessa forma di prima: `{ set1: {…}, set2: {…} }`).

- **Chi le scrive:** il server a fine match (`registraRisultatoMatch`, in `functions/risultati-match.js` e `docs/risultati-match.js`). Se il nodo non si può scrivere (regole non ancora
  aggiornate) ripiega sul posto di prima, dentro al match: niente si rompe.
- **Chi le legge:** le pagine che le usano (Stats, badge, Match of the week, riepilogo di stagione, voto MVP, Hall of Fame, Formats, Box) le rimettono nei match con
  `DbLeggero.unisciSetStats` / `stagioniConStats` (`docs/db-leggero.js`): se un match le ha ancora dentro (dati non spostati) valgono quelle, se c'è il nodo nuovo vale il nodo.
- **Cancellazioni:** cancellare un match, uno showdown o una stagione toglie anche il suo pezzo in `setStats/` (se no, rifacendo un match con lo stesso numero ricomparirebbero le vecchie statistiche).

**Come passare (in quest'ordine; tra un passo e l'altro il sito funziona sempre):**
1. Mettere nelle regole del database il nodo `setStats` (blocco qui sopra, accanto a `seasons`) e pubblicarle.
2. Pubblicare le Functions (`firebase deploy --only functions`): da qui i match nuovi scrivono nel nodo nuovo.
3. GitHub → Actions → *Sposta le statistiche dei set* → Run workflow:
   - `prova`: stampa quanti match hanno le statistiche dentro e quanto pesano; non scrive niente;
   - `copia`: scrive `setStats/…` per i match che le hanno dentro (non toglie niente da `seasons`); si può ripetere;
   - controllare qualche pagina (Stats, un badge, il Match of the week): devono dare gli stessi numeri di prima;
   - `pulisci`: toglie le statistiche da dentro ai match, solo dove la copia è identica. Da qui le pagine leggono una stagione senza il 84% del peso.

## Riassunto del Match of the week (`matchSettimana`): la home non scarica più le statistiche

La home è la pagina più visitata e, per disegnare il banner del Match of the week, scaricava le statistiche di tutti i set (`setStats`, ~700 KB) e `players` (~210 KB) per
calcolare il set più bello di ogni settimana e i badge dei team. Ora un workflow lo calcola e lo salva in `matchSettimana` (pochi KB: per ogni settimana il set scelto e i
badge già pronti); la home legge quello.

- **Chi lo scrive:** solo il workflow *Riassunto del Match of the week* (`.github/workflows/riassunto-home.yml`, ogni 3 ore e a mano). Le regole non lo fanno scrivere a nessuno dal sito
  (`".write": false`; l'admin SDK le salta).
- **Chi lo legge:** la home (`docs/index.html`). Se il riassunto manca, ha un'altra versione o ha più di 12 ore, la home fa come prima (scarica le statistiche e calcola il banner da sé):
  se il workflow smette di funzionare il sito non si rompe, costa solo di più.
- **Quanto è fresco:** a ogni match nuovo la Function `avviaRiassuntoHome` (`functions/avvia-riassunto.js`) lancia il workflow: il banner si aggiorna in un paio di minuti.
  Scatta alla creazione di `setStats/{stagione}/{showdown}/match{N}` (match registrato dal sito o salvato dal simulatore; la stagione `sbeta` è esclusa). Più match ravvicinati non
  ammucchiano esecuzioni: il workflow ha una coda (una in corso e al massimo una in attesa). La pianificazione ogni 3 ore (in pratica 8-10: GitHub la esegue con comodo) resta
  come rete di sicurezza. Se la Function non parte (token mancante o scaduto) si legge nei log e il riassunto si aggiorna con la pianificazione.
- **L'MVP:** il conteggio dei voti scaduti, che in home si fa raramente, legge le statistiche solo della stagione da contare (`setStats/<stagione>`).

**Come attivarlo (in quest'ordine):**
1. Aggiungere alle regole del database il nodo `matchSettimana` (blocco qui sopra) e pubblicarle.
2. GitHub → Actions → *Riassunto del Match of the week* → Run workflow. Con `prova` stampa le ultime settimane e quanto pesa il riassunto senza scrivere; poi lanciarlo senza `prova`.
3. Aprire la home (cache pulita): il banner si vede come prima. In Console → Realtime Database deve esserci `matchSettimana` con `aggiornato` e `settimane`.

**Avvio automatico a ogni match nuovo (una volta):**
1. GitHub → Settings → Developer settings → Fine-grained personal access tokens → *Generate new token*: repository solo `didi722/didi-lu`, permesso *Actions: Read and write*,
   scadenza al massimo 1 anno (da rinnovare: scaduto, l'avvio automatico smette in silenzio e resta la pianificazione).
2. Salvarlo come segreto delle Functions (da Cloud Shell): `firebase functions:secrets:set GITHUB_ACTIONS_TOKEN` e incollare il token. Mai nel codice né in `functions/.env`.
3. Pubblicare la funzione: `firebase deploy --only functions:avviaRiassuntoHome`.
4. Prova: registrare un match (o riscriverne le statistiche) e guardare GitHub → Actions: parte *Riassunto del Match of the week* con evento «workflow_dispatch». Nei log della
   funzione (`firebase functions:log --only avviaRiassuntoHome`) compare «workflow avviato».
