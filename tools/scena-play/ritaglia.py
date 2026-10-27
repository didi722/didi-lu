# Toglie lo sfondo piatto (verde #00FF00, magenta #FF00FF, o un colore neutro qualsiasi: 'piatto') da un'immagine di un'IA e la ritaglia attorno ai Pokémon.
# Uso: python3 tools/scena-play/ritaglia.py originale.jpg uscita.webp [verde|magenta|piatto] [altezza in px, default 900]
# Il colore dello sfondo si ricava dai bordi (di solito ha una sfumatura leggera); i pixel di bordo si "stappano" dallo sfondo e si ripulisce l'alone (despill).
import sys, collections, numpy as np
from PIL import Image, ImageFilter

def eccesso(a, chiave):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return g - np.maximum(r, b) if chiave == 'verde' else np.minimum(r, b) - g          # quanto il pixel è "colore dello sfondo"

def piatto(a, tol=22):
    """Sfondo di un solo colore (anche chiaro o grigio): è sfondo quello che, partendo dai bordi, ha quel colore; il contorno scuro dei Pokémon lo ferma, quindi i denti
    bianchi o le parti chiare dentro la figura restano. Anche le 'tasche' di sfondo chiuse (tra una zampa e il corpo) se grandi. Restituisce (alpha, colore dello sfondo)."""
    h, w = a.shape[:2]
    bordo = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = np.median(bordo, axis=0)
    simile = np.sqrt(((a - bg) ** 2).sum(-1)) < tol
    visto = np.zeros((h, w), bool)
    sfondo = np.zeros((h, w), bool)
    coda = collections.deque()
    for x in range(w):
        for y in (0, h - 1):
            if simile[y, x] and not visto[y, x]: visto[y, x] = True; coda.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if simile[y, x] and not visto[y, x]: visto[y, x] = True; coda.append((y, x))
    while coda:
        y, x = coda.popleft()
        sfondo[y, x] = True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and simile[ny, nx] and not visto[ny, nx]:
                visto[ny, nx] = True; coda.append((ny, nx))
    # tasche chiuse e grandi, dello stesso colore (più stretto)
    rest = (np.sqrt(((a - bg) ** 2).sum(-1)) < tol * 0.6) & ~sfondo
    vis2 = np.zeros((h, w), bool)
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if rest[y, x] and not vis2[y, x]:
                comp = []; q = collections.deque([(y, x)]); vis2[y, x] = True
                while q:
                    cy, cx = q.popleft(); comp.append((cy, cx))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and rest[ny, nx] and not vis2[ny, nx]: vis2[ny, nx] = True; q.append((ny, nx))
                if len(comp) > 1500:
                    for cy, cx in comp: sfondo[cy, cx] = True
    return sfondo, bg

def main(src, dst, chiave='verde', altezza=900):
    if chiave == 'piatto':
        im = Image.open(src).convert('RGB')
        a = np.asarray(im).astype(np.float32)
        sf, bg = piatto(a)
        al = Image.fromarray((~sf * 255).astype('uint8'))
        al = al.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))      # via l'ultimo bordo chiaro (la linea scura del contorno resta) e bordo morbido
        img = Image.fromarray(np.dstack([a, np.asarray(al).astype(np.float32)]).astype('uint8'), 'RGBA')
        bb = img.getchannel('A').point(lambda x: 255 if x > 6 else 0).getbbox()
        m = 6
        img = img.crop((max(0, bb[0] - m), max(0, bb[1] - m), min(img.width, bb[2] + m), min(img.height, bb[3] + m)))
        img = img.convert('RGBa').resize((round(img.width * altezza / img.height), altezza), Image.LANCZOS).convert('RGBA')
        img.save(dst, quality=90, alpha_quality=95, method=6)
        print('scritto', dst, img.size, 'sfondo', bg.astype(int).tolist())
        return
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
