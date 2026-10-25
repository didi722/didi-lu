#!/usr/bin/env python3
"""Le icone dell'app (PWA e APK) dal Magikarp con la corona del sito (docs/immagini/magikarp.png).

  python3 tools/crea-icone-app.py

Scrive:
  docs/immagini/app/icon-192.png, icon-512.png     icone "normali" della PWA (quadrato con gli angoli arrotondati)
  docs/immagini/app/icon-maskable-512.png          icona "maskable": a tutta pagina, il disegno nella zona sicura (Android la ritaglia come vuole)
  docs/immagini/app/apple-touch-icon.png           180x180 opaca (iOS la arrotonda da sé)
  assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png
                                                   i file che @capacitor/assets trasforma nelle icone e nella schermata di avvio dell'APK
Per cambiare l'aspetto basta cambiare i colori qui sotto o l'immagine di partenza e rilanciare.
"""
import os
from PIL import Image, ImageDraw

RADICE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SORGENTE = os.path.join(RADICE, 'docs', 'immagini', 'magikarp.png')
VERDE = (49, 196, 137, 255)      # il verde del sito (#31c489)
NERO = (0, 0, 0, 255)
GIALLO = (255, 189, 68, 255)     # --nb-giallo

pesce = Image.open(SORGENTE).convert('RGBA')
pesce = pesce.crop(pesce.getbbox())


def disegno(lato, riempimento):
    """Il Magikarp ridimensionato in modo che stia in un quadrato di `lato` pixel (con l'ombra nera piena dello stile del sito)."""
    r = min(lato / pesce.width, lato / pesce.height)
    p = pesce.resize((max(1, round(pesce.width * r)), max(1, round(pesce.height * r))), Image.LANCZOS)
    ombra = Image.new('RGBA', p.size, (0, 0, 0, 0))
    ombra.paste((0, 0, 0, 150), mask=p.split()[3])
    tela = Image.new('RGBA', (p.width + 24, p.height + 24), (0, 0, 0, 0))
    scarto = max(2, lato // 48)
    tela.alpha_composite(ombra, (12 + scarto, 12 + scarto))
    tela.alpha_composite(p, (12, 12))
    return tela


def centra(base, immagine, dy=0):
    base.alpha_composite(immagine, ((base.width - immagine.width) // 2, (base.height - immagine.height) // 2 + dy))


def pieno(lato, zona):
    """Sfondo verde a tutta pagina con una cornice nera sottile e il Magikarp nella zona sicura (`zona` = frazione del lato)."""
    im = Image.new('RGBA', (lato, lato), VERDE)
    d = ImageDraw.Draw(im)
    # pallini della mezzatinta, come lo sfondo delle finestre del sito
    passo = max(14, lato // 24)
    for y in range(passo // 2, lato, passo):
        for x in range(passo // 2 + (passo // 2 if (y // passo) % 2 else 0), lato, passo):
            d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(0, 0, 0, 38))
    centra(im, disegno(round(lato * zona), None), dy=round(lato * 0.01))
    return im


def arrotondato(im, raggio):
    maschera = Image.new('L', im.size, 0)
    ImageDraw.Draw(maschera).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=raggio, fill=255)
    fuori = Image.new('RGBA', im.size, (0, 0, 0, 0))
    fuori.paste(im, mask=maschera)
    return fuori


def con_bordo(lato, zona):
    """L'icona "normale": quadrato arrotondato con bordo nero spesso e ombra piena (stile neubrutalista)."""
    margine = round(lato * 0.06)
    interno = lato - 2 * margine
    sfondo = pieno(interno, zona)
    bordo = max(6, lato // 40)
    tela = Image.new('RGBA', (lato, lato), (0, 0, 0, 0))
    raggio = round(interno * 0.20)
    ombra = Image.new('RGBA', (interno, interno), NERO)
    tela.alpha_composite(arrotondato(ombra, raggio), (margine + bordo, margine + bordo))
    nero = arrotondato(Image.new('RGBA', (interno, interno), NERO), raggio)
    tela.alpha_composite(nero, (margine, margine))
    dentro = arrotondato(sfondo.resize((interno - 2 * bordo, interno - 2 * bordo), Image.LANCZOS), max(1, raggio - bordo))
    tela.alpha_composite(dentro, (margine + bordo, margine + bordo))
    return tela


def salva(im, percorso, opaca=False):
    percorso = os.path.join(RADICE, percorso)
    os.makedirs(os.path.dirname(percorso), exist_ok=True)
    if opaca:
        sfondo = Image.new('RGBA', im.size, VERDE)
        sfondo.alpha_composite(im)
        im = sfondo.convert('RGB')
    im.save(percorso, optimize=True)
    print('scritto', os.path.relpath(percorso, RADICE), im.size)


# --- PWA ---
grande = con_bordo(1024, 0.78)
salva(grande.resize((512, 512), Image.LANCZOS), 'docs/immagini/app/icon-512.png')
salva(grande.resize((192, 192), Image.LANCZOS), 'docs/immagini/app/icon-192.png')
salva(pieno(512, 0.62), 'docs/immagini/app/icon-maskable-512.png', opaca=True)
salva(pieno(180, 0.76), 'docs/immagini/app/apple-touch-icon.png', opaca=True)

# --- APK (@capacitor/assets) ---
salva(pieno(1024, 0.76), 'assets/icon-only.png', opaca=True)
primo = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
centra(primo, disegno(round(1024 * 0.56), None), dy=10)
salva(primo, 'assets/icon-foreground.png')
salva(Image.new('RGBA', (1024, 1024), VERDE), 'assets/icon-background.png', opaca=True)
for nome, colore in (('splash.png', VERDE), ('splash-dark.png', NERO)):
    s = Image.new('RGBA', (2732, 2732), colore)
    centra(s, disegno(820, None))
    salva(s, 'assets/' + nome, opaca=True)
