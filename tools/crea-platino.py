#!/usr/bin/env python3
"""
Crea le PNG del livello platino di badge, fiocchi e medaglie partendo dalle PNG d'oro: la parte dorata (tonalità giallo-arancio) diventa
un metallo azzurro-viola molto luminoso, i colori del resto (nastri, fiocchi, foglie...) restano com'erano.

    python3 tools/crea-platino.py                 tutte le famiglie (badge-allenatore-*, badge-team-*, ribbon-*)
    python3 tools/crea-platino.py ribbon-ko ...   solo quelle (nome senza livello)

Serve Pillow e numpy (pip install pillow numpy). Le PNG da 1024 px escono a 512 px (si vedono sempre piccole).
"""
import sys, glob, os
import numpy as np
from PIL import Image

CARTELLA = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'immagini')

def rgb_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.where(m, d, 1), 0); gc = np.where(m, (mx - g) / np.where(m, d, 1), 0); bc = np.where(m, (mx - b) / np.where(m, d, 1), 0)
    h = np.where(mx == r, bc - gc, np.where(mx == g, 2.0 + rc - bc, 4.0 + gc - rc))
    h = (h / 6.0) % 1.0
    h = np.where(m, h, 0)
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0)
    return h * 360.0, s, mx

def hsv_rgb(h, s, v):
    h = (h % 360.0) / 60.0
    i = np.floor(h).astype(int) % 6; f = h - np.floor(h)
    p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v]); g = np.choose(i, [t, v, v, q, p, p]); b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)

def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

def platino(percorso_oro, uscita, lato=None):
    img = Image.open(percorso_oro).convert('RGBA')
    a = np.asarray(img).astype(np.float64) / 255.0
    rgb, alfa = a[..., :3], a[..., 3]
    h, s, v = rgb_hsv(rgb)
    # peso: quanto un pixel è "oro" (giallo-arancio, abbastanza saturo e luminoso); morbido ai bordi
    peso = smooth(h, 22, 36) * (1 - smooth(h, 62, 74)) * smooth(s, 0.14, 0.30) * smooth(v, 0.30, 0.50) * (alfa > 0.02)
    # metallo platino: azzurro che vira al viola nelle ombre, poco saturo, più chiaro
    ombra = 1 - np.clip(v, 0, 1)
    h_n = 208 + 38 * smooth(ombra, 0.15, 0.7)
    s_n = np.clip(0.10 + 0.55 * s * 0.55 + 0.30 * ombra, 0, 0.62)
    v_n = np.clip(0.52 + 0.55 * v, 0, 1.0)
    pt = hsv_rgb(h_n, s_n, v_n)
    nuovo = rgb * (1 - peso[..., None]) + pt * peso[..., None]
    out = np.concatenate([nuovo, alfa[..., None]], -1)
    res = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    if lato and res.size[0] > lato: res = res.resize((lato, lato), Image.LANCZOS)
    res.save(uscita, optimize=True)
    return float(peso.mean())

if __name__ == '__main__':
    famiglie = sys.argv[1:]
    if not famiglie:
        famiglie = sorted(os.path.basename(p)[:-len('-gold.png')] for p in glob.glob(os.path.join(CARTELLA, '*-gold.png')))
    for f in famiglie:
        src = os.path.join(CARTELLA, f + '-gold.png'); dst = os.path.join(CARTELLA, f + '-platinum.png')
        coperto = platino(src, dst, 512)
        print(f'{f}: {coperto * 100:.1f}% dell\'immagine ricolorata')
