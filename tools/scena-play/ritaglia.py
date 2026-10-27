# Toglie lo sfondo piatto (verde #00FF00 o magenta #FF00FF) da un'immagine di un'IA e la ritaglia attorno ai Pokémon.
# Uso: python3 tools/scena-play/ritaglia.py originale.jpg uscita.webp [verde|magenta] [altezza in px, default 900]
# Il colore dello sfondo si ricava dai bordi (di solito ha una sfumatura leggera); i pixel di bordo si "stappano" dallo sfondo e si ripulisce l'alone (despill).
import sys, numpy as np
from PIL import Image, ImageFilter

def eccesso(a, chiave):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return g - np.maximum(r, b) if chiave == 'verde' else np.minimum(r, b) - g          # quanto il pixel è "colore dello sfondo"

def main(src, dst, chiave='verde', altezza=900):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im.resize((im.width * 2, im.height * 2), Image.LANCZOS)).astype(np.float32)
    h, w = a.shape[:2]
    bordo = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(bordo, axis=0)
    v, vbg = eccesso(a, chiave), float(eccesso(bg[None, None, :], chiave)[0, 0])
    al = np.clip((0.86 * vbg - v) / (0.40 * vbg), 0, 1)                   # 0 = sfondo pieno, 1 = soggetto
    al = np.clip((al - 0.08) / 0.92, 0, 1)                                # piccolo "choke": via l'ultimo alone
    fg = np.clip((a - (1 - al)[..., None] * bg) / np.maximum(al, 1e-3)[..., None], 0, 255)
    r, g, b = fg[..., 0], fg[..., 1], fg[..., 2]
    zona = al < 0.985
    if chiave == 'verde':
        g2 = np.where(zona, np.minimum(g, np.maximum(r, b)), g); out = np.dstack([r, g2, b])
    else:
        e = np.where(zona, np.maximum(0, np.minimum(r, b) - g), 0); out = np.dstack([r - e, g, b - e])
    img = Image.fromarray(np.dstack([np.clip(out, 0, 255), al * 255]).astype('uint8'), 'RGBA')
    bb = img.getchannel('A').point(lambda x: 255 if x > 6 else 0).getbbox()
    m = 8
    img = img.crop((max(0, bb[0] - m), max(0, bb[1] - m), min(w, bb[2] + m), min(h, bb[3] + m)))
    img = img.convert('RGBa').resize((round(img.width * altezza / img.height), altezza), Image.LANCZOS).convert('RGBA')
    img.save(dst, quality=90, alpha_quality=95, method=6)
    print('scritto', dst, img.size, 'sfondo', bg.astype(int).tolist())

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'verde', int(sys.argv[4]) if len(sys.argv) > 4 else 900)
