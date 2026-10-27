# L'immagine di Play (docs/immagini/app/scena-play.webp)

Mega Charizard Y che soffia fuoco contro Mega Lucario col braccio teso, su sfondo trasparente (il cielo lo mette la scena). È composta da due render di Pokémon HOME (PokeAPI)
messi in posa (braccio teso, bocca aperta, inclinati), con aloni, luci di taglio e getto di fuoco. Si rifà con questi script (Python, Pillow e numpy):

```
mkdir arte
curl -o arte/home-10059.png https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/10059.png     # Mega Lucario
curl -o arte/home-10035.png https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/10035.png     # Mega Charizard Y
ARTE=arte python3 tools/scena-play/scontro.py       # scrive scontro.webp (con trasparenza) e scontro-anteprima.png
cp scontro.webp docs/immagini/app/scena-play.webp
```

- `pose.py`: le pose (angolo del braccio, apertura della bocca).
- `effetti.py`: aloni, luci di taglio e bagliori.
- `scontro.py`: posizioni, inclinazioni, fuoco ed esportazione (si ferma se qualcosa tocca il bordo: lì si vedrebbe un taglio netto).

Una tua immagine (anche generata con un'IA di immagini), `docs/immagini/app/tessera-play.png` o `.webp`, ritagliata su trasparente, ha la precedenza su questa.
