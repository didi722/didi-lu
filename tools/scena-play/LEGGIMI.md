# L'immagine di Play (docs/immagini/app/scena-play.webp)

Mega Charizard Y contro Mega Lucario, composti da due render di Pokémon HOME (PokeAPI): il braccio di Lucario è teso in avanti, la mandibola di Charizard è aperta,
poi luci di taglio, aloni e ombre. Non c'è niente di disegnato a mano: si rifà con questi script (Python, Pillow e numpy).

```
mkdir arte
curl -o arte/home-10059.png https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/10059.png     # Mega Lucario
curl -o arte/home-10035.png https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/10035.png     # Mega Charizard Y
ARTE=arte python3 tools/scena-play/duello.py 1220 1250 40 1200      # altezza Charizard, altezza Lucario, dove stanno (a sinistra) sulla tela
cp duello-finale.webp docs/immagini/app/scena-play.webp
```

- `pose.py`: le due pose (angolo del braccio, apertura della bocca).
- `effetti.py`: aloni, luci di taglio e bagliori.
- `duello.py`: la composizione e l'esportazione (WebP con trasparenza, circa 1400 px di larghezza). Alone e ombre sfumano del tutto prima del bordo dell'immagine (il programma si ferma se lo toccano): un taglio netto lì si vedrebbe nella scena come una riga verticale.

Una tua immagine, `docs/immagini/app/tessera-play.png` (o `.webp`), ha la precedenza su questa.
