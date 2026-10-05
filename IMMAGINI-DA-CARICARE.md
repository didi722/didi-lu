# Immagini dei badge

Tutte in `docs/immagini/`, PNG con sfondo trasparente, quadrate, almeno 256×256 px (vengono mostrate fra 22 e 66 px, ma così restano nitide). 
Nomi: `ribbon-<badge>-<livello>.png` per i Pokémon, `badge-team-<badge>-<livello>.png` per i team, `badge-allenatore-<badge>-<livello>.png` per gli allenatori, con `-bronze`, `-silver` o `-gold`. 
Finché un file manca il sito mostra al suo posto una medaglia disegnata con il CSS. Per rifare il controllo: `node tools/elenco-immagini.cjs --scrivi`.

## Fiocchi dei Pokémon (scheda Pokémon e medagliette sulla card del team)

12 file presenti su 21 attesi, 9 mancanti.

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

Hanno un solo file per tutti i livelli (nessun bronze/silver/gold):

- Win Streak: `ribbon-winstreak.png` → per i tre livelli servirebbero `ribbon-winstreak-bronze.png`, `ribbon-winstreak-silver.png` e `ribbon-winstreak-gold.png`
- Clean Streak: `ribbon-cleanstreak.png` → per i tre livelli servirebbero `ribbon-cleanstreak-bronze.png`, `ribbon-cleanstreak-silver.png` e `ribbon-cleanstreak-gold.png`
- Friendship: `ribbon-friendship.png` → per i tre livelli servirebbero `ribbon-friendship-bronze.png`, `ribbon-friendship-silver.png` e `ribbon-friendship-gold.png`

## Badge dei team (scaffale, medagliette nella testata e sulla card del team)

6 file presenti su 24 attesi, 18 mancanti.

Mancano:

| File | Badge | Cosa rappresenta |
|---|---|---|
| `badge-team-showdown-bronze.png` | Showdown Winner · bronze | Showdowns won with this team. |
| `badge-team-showdown-silver.png` | Showdown Winner · silver | Showdowns won with this team. |
| `badge-team-showdown-gold.png` | Showdown Winner · gold | Showdowns won with this team. |
| `badge-team-winner-bronze.png` | Winner · bronze | Matches won with this team. |
| `badge-team-winner-silver.png` | Winner · silver | Matches won with this team. |
| `badge-team-winner-gold.png` | Winner · gold | Matches won with this team. |
| `badge-team-winrate-bronze.png` | Win Rate · bronze | Share of matches won, once the team has played enough of them. |
| `badge-team-winrate-silver.png` | Win Rate · silver | Share of matches won, once the team has played enough of them. |
| `badge-team-winrate-gold.png` | Win Rate · gold | Share of matches won, once the team has played enough of them. |
| `badge-team-flawless-bronze.png` | Flawless · bronze | Sets won without losing a single Pokémon. |
| `badge-team-flawless-silver.png` | Flawless · silver | Sets won without losing a single Pokémon. |
| `badge-team-flawless-gold.png` | Flawless · gold | Sets won without losing a single Pokémon. |
| `badge-team-knockout-bronze.png` | Knockout · bronze | Opposing Pokémon knocked out by this team. |
| `badge-team-knockout-silver.png` | Knockout · silver | Opposing Pokémon knocked out by this team. |
| `badge-team-knockout-gold.png` | Knockout · gold | Opposing Pokémon knocked out by this team. |
| `badge-team-veteran-bronze.png` | Veteran · bronze | Seasons this team has played in. |
| `badge-team-veteran-silver.png` | Veteran · silver | Seasons this team has played in. |
| `badge-team-veteran-gold.png` | Veteran · gold | Seasons this team has played in. |

Hanno un solo file per tutti i livelli (nessun bronze/silver/gold):

- SD Streak: `badge-team-sdstreak.png` → per i tre livelli servirebbero `badge-team-sdstreak-bronze.png`, `badge-team-sdstreak-silver.png` e `badge-team-sdstreak-gold.png`
- Win Streak: `badge-team-winstreak.png` → per i tre livelli servirebbero `badge-team-winstreak-bronze.png`, `badge-team-winstreak-silver.png` e `badge-team-winstreak-gold.png`
- Clean Streak: `badge-team-cleanstreak.png` → per i tre livelli servirebbero `badge-team-cleanstreak-bronze.png`, `badge-team-cleanstreak-silver.png` e `badge-team-cleanstreak-gold.png`

## Badge degli allenatori (Achievements nel profilo, pagina Trainers, medaglie della pagina pubblica, scheda in Stats)

44 file presenti su 46 attesi, 2 mancanti.

Mancano:

| File | Badge | Cosa rappresenta |
|---|---|---|
| `badge-allenatore-knockout-bronze.png` | KO Artist · bronze | Opposing Pokémon knocked out (only sets played on the site are counted). |
| `badge-allenatore-knockout-silver.png` | KO Artist · silver | Opposing Pokémon knocked out (only sets played on the site are counted). |

Sagome "ghost" presenti ma non usate da nessuna pagina:

- `badge-allenatore-champion-ghost.png`
- `badge-allenatore-cleanstreak-ghost.png`
- `badge-allenatore-sdstreak-ghost.png`
- `badge-allenatore-winstreak-ghost.png`

Totale: 29 file mancanti.
