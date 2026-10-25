# Immagini dei badge

Tutte in `docs/immagini/`, PNG con sfondo trasparente, quadrate, almeno 256×256 px (vengono mostrate fra 22 e 66 px, ma così restano nitide). 
Nomi: `ribbon-<badge>-<livello>.png` per i Pokémon, `badge-team-<badge>-<livello>.png` per i team, `badge-allenatore-<badge>-<livello>.png` per gli allenatori, con `-bronze`, `-silver`, `-gold` o `-platinum` (il platino si genera dall oro con `python3 tools/crea-platino.py`). 
Finché un file manca il sito mostra al suo posto una medaglia disegnata con il CSS. Per rifare il controllo: `node tools/elenco-immagini.cjs --scrivi`.

## Fiocchi dei Pokémon (scheda Pokémon e medagliette sulla card del team)

36 file presenti su 40 attesi, 4 mancanti.

Mancano:

| File | Badge | Cosa rappresenta |
|---|---|---|
| `ribbon-mvp-bronze.png` | Season MVP · bronze | Voted MVP of a season by the players. It is this very Pokémon, not its species. |
| `ribbon-mvp-silver.png` | Season MVP · silver | Voted MVP of a season by the players. It is this very Pokémon, not its species. |
| `ribbon-mvp-gold.png` | Season MVP · gold | Voted MVP of a season by the players. It is this very Pokémon, not its species. |
| `ribbon-mvp-platinum.png` | Season MVP · platinum | Voted MVP of a season by the players. It is this very Pokémon, not its species. |

## Badge dei team (scaffale, medagliette nella testata e sulla card del team)

40 file presenti su 40 attesi, 0 mancanti.

## Badge degli allenatori (Achievements nel profilo, pagina Trainers, medaglie della pagina pubblica, scheda in Stats)

61 file presenti su 61 attesi, 0 mancanti.

Totale: 4 file mancanti.
