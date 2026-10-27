# L'immagine di Play (docs/immagini/app/scena-play.webp)

È un'immagine di lotta generata con un'IA di immagini (Gemini): Mega Charizard Y in picchiata che soffia fuoco contro Mega Lucario in balzo, visto di tre quarti da dietro, nello stile
dei modelli 3D di Pokémon HOME. L'IA l'ha disegnata su sfondo verde piatto; `da-gemini.py` toglie il verde (chroma key con despill, bordi morbidi), rimpicciolisce
Charizard (senza toccare Lucario) attorno alla bocca e salva un WebP con trasparenza, alto 1000 px (Python, Pillow e numpy):

```
python3 tools/scena-play/da-gemini.py originale.jpg docs/immagini/app/scena-play.webp 0.82     # 0.82 = quanto si rimpicciolisce Charizard
```

Il prompt usato e i punti da regolare (il poligono `LUCARIO` dice dove sta Lucario, `BOCCA` il punto attorno a cui si rimpicciolisce Charizard) sono in testa allo script.
Una tua immagine, `docs/immagini/app/tessera-play.png` o `.webp` (ritagliata su trasparente), ha la precedenza su questa; sta a tutta altezza, a filo del bordo in basso e a destra.

## Le altre immagini (Box, Stats, locandine di Play)

Stesso procedimento, con `ritaglia.py`: l'IA le disegna su sfondo piatto (verde `#00FF00`, oppure magenta `#FF00FF` per Rayquaza, che è verde), lo script toglie lo sfondo, ripulisce l'alone e ritaglia attorno ai Pokémon.

```
python3 tools/scena-play/ritaglia.py originale.jpg docs/immagini/app/tessera-box.webp verde 900        # verde o magenta, altezza in px
```

Solo i Pokémon, senza effetti: gli effetti (Poké Ball che gira, radar, sole, cuori, griglia) li disegna l'app dietro di loro.
