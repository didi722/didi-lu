# Immagini dei badge

Tutte in `docs/immagini/`, PNG con sfondo trasparente, quadrate, almeno 256×256 px (vengono mostrate fra 22 e 66 px, ma così restano nitide). 
Nomi: `ribbon-<badge>-<livello>.png` per i Pokémon, `badge-team-<badge>-<livello>.png` per i team, `badge-allenatore-<badge>-<livello>.png` per gli allenatori, con `-bronze`, `-silver` o `-gold`. 
Finché un file manca il sito mostra al suo posto una medaglia disegnata con il CSS. Per rifare il controllo: `node tools/elenco-immagini.cjs --scrivi`.

## Fiocchi dei Pokémon (scheda Pokémon e medagliette sulla card del team)

12 file presenti su 27 attesi, 15 mancanti.

Mancano:

| File | Badge | Cosa rappresenta |
|---|---|---|
| `ribbon-regular-bronze.png` | Regular · bronze | Actually sent out in a set: benched games do not count. |
| `ribbon-regular-silver.png` | Regular · silver | Actually sent out in a set: benched games do not count. |
| `ribbon-regular-gold.png` | Regular · gold | Actually sent out in a set: benched games do not count. |
| `ribbon-ko-bronze.png` | Knockout · bronze | Opposing Pokémon knocked out (direct and indirect). |
| `ribbon-ko-silver.png` | Knockout · silver | Opposing Pokémon knocked out (direct and indirect). |
| `ribbon-ko-gold.png` | Knockout · gold | Opposing Pokémon knocked out (direct and indirect). |
| `ribbon-laststand-bronze.png` | Last Stand · bronze | Sets won as the very last Pokémon standing. |
| `ribbon-laststand-silver.png` | Last Stand · silver | Sets won as the very last Pokémon standing. |
| `ribbon-laststand-gold.png` | Last Stand · gold | Sets won as the very last Pokémon standing. |
| `ribbon-winstreak-bronze.png` | Win Streak · bronze | Matches won in a row, counting only the ones it actually played. |
| `ribbon-winstreak-silver.png` | Win Streak · silver | Matches won in a row, counting only the ones it actually played. |
| `ribbon-cleanstreak-bronze.png` | Clean Streak · bronze | Matches won without dropping a set, counting only the ones it actually played. |
| `ribbon-cleanstreak-silver.png` | Clean Streak · silver | Matches won without dropping a set, counting only the ones it actually played. |
| `ribbon-friendship-bronze.png` | Friendship · bronze | A bond that lasts: seasons on the field with the same trainer and team. |
| `ribbon-friendship-silver.png` | Friendship · silver | A bond that lasts: seasons on the field with the same trainer and team. |

Badge con solo alcuni livelli (colori che mancano):

- Win Streak: c'è gold; mancano bronze e silver
- Clean Streak: c'è gold; mancano bronze e silver
- Friendship: c'è gold; mancano bronze e silver

## Badge dei team (scaffale, medagliette nella testata e sulla card del team)

6 file presenti su 30 attesi, 24 mancanti.

Mancano:

| File | Badge | Cosa rappresenta |
|---|---|---|
| `badge-team-showdown-bronze.png` | Showdown Winner · bronze | Showdowns won with this team. |
| `badge-team-showdown-silver.png` | Showdown Winner · silver | Showdowns won with this team. |
| `badge-team-showdown-gold.png` | Showdown Winner · gold | Showdowns won with this team. |
| `badge-team-sdstreak-bronze.png` | SD Streak · bronze | Showdowns won in a row with this team. |
| `badge-team-sdstreak-silver.png` | SD Streak · silver | Showdowns won in a row with this team. |
| `badge-team-winner-bronze.png` | Winner · bronze | Matches won with this team. |
| `badge-team-winner-silver.png` | Winner · silver | Matches won with this team. |
| `badge-team-winner-gold.png` | Winner · gold | Matches won with this team. |
| `badge-team-winrate-bronze.png` | Win Rate · bronze | Share of matches won, once the team has played enough of them. |
| `badge-team-winrate-silver.png` | Win Rate · silver | Share of matches won, once the team has played enough of them. |
| `badge-team-winrate-gold.png` | Win Rate · gold | Share of matches won, once the team has played enough of them. |
| `badge-team-winstreak-bronze.png` | Win Streak · bronze | Matches won in a row with this team. |
| `badge-team-winstreak-silver.png` | Win Streak · silver | Matches won in a row with this team. |
| `badge-team-cleanstreak-bronze.png` | Clean Streak · bronze | Matches won in a row without dropping a set. |
| `badge-team-cleanstreak-silver.png` | Clean Streak · silver | Matches won in a row without dropping a set. |
| `badge-team-flawless-bronze.png` | Flawless · bronze | Sets won without losing a single Pokémon. |
| `badge-team-flawless-silver.png` | Flawless · silver | Sets won without losing a single Pokémon. |
| `badge-team-flawless-gold.png` | Flawless · gold | Sets won without losing a single Pokémon. |
| `badge-team-knockout-bronze.png` | Knockout · bronze | Opposing Pokémon knocked out by this team. |
| `badge-team-knockout-silver.png` | Knockout · silver | Opposing Pokémon knocked out by this team. |
| `badge-team-knockout-gold.png` | Knockout · gold | Opposing Pokémon knocked out by this team. |
| `badge-team-veteran-bronze.png` | Veteran · bronze | Seasons this team has played in. |
| `badge-team-veteran-silver.png` | Veteran · silver | Seasons this team has played in. |
| `badge-team-veteran-gold.png` | Veteran · gold | Seasons this team has played in. |

Badge con solo alcuni livelli (colori che mancano):

- SD Streak: c'è gold; mancano bronze e silver
- Win Streak: c'è gold; mancano bronze e silver
- Clean Streak: c'è gold; mancano bronze e silver

## Badge degli allenatori (Achievements nel profilo, pagina Trainers, medaglie della pagina pubblica, scheda in Stats)

46 file presenti su 46 attesi, 0 mancanti.

Totale: 39 file mancanti.
