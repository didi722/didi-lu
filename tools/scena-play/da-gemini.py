# Prepara l'immagine di Play: toglie lo sfondo verde piatto (chroma key con despill) e rimpicciolisce Charizard senza toccare Lucario.
# Prompt dell'immagine (Gemini): "Dynamic battle scene, 3D rendered Pokémon style like Pokémon HOME / Legends models, soft matte shading, not glossy; flat green background (#00FF00).
# Camera low-angle with strong foreshortening. Upper left: Mega Charizard Y in an aerial dive, front three-quarter view, head and roaring mouth large in the foreground, wings spread, tail far behind.
# Lower right: Mega Lucario in a deep lunge, three-quarter back view, one arm extended toward Charizard's mouth, blue aura on the fists. They collide on a diagonal from upper left to lower right."
# Uso: python3 tools/scena-play/da-gemini.py originale.jpg scena-play.webp [scala di Charizard, default 0.82]
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFilter

SC = 2                                                        # si lavora al doppio: i bordi restano morbidi
BG = np.array([83, 217, 68], np.float32)                      # il verde dell'originale (sfumato di poco)
BOCCA = (700, 300)                                            # punto fisso di Charizard (la bocca), nelle coordinate dell'originale
LUCARIO = [(858, 185), (1000, 185), (1000, 236), (1030, 226), (1062, 213), (1100, 203), (1130, 196), (1160, 193), (1376, 185), (1376, 768), (560, 768), (560, 500), (600, 430), (830, 420), (830, 380), (858, 330)]   # dove sta Lucario

def chiave(im):
    a = np.asarray(im.convert('RGB').resize((im.width * SC, im.height * SC), Image.LANCZOS)).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    al = np.clip((125 - (g - np.maximum(r, b))) / 85, 0, 1)
    fg = np.clip((a - (1 - al)[..., None] * BG) / np.maximum(al, 1e-3)[..., None], 0, 255)
    fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]))      # despill: il verde non supera mai il maggiore tra rosso e blu
    return Image.fromarray(np.dstack([fg, al * 255]).astype('uint8'), 'RGBA')

def main(src, dst, scala=0.82):
    im = chiave(Image.open(src))
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).polygon([(x * SC, y * SC) for x, y in LUCARIO], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2))
    alfa = im.getchannel('A')
    luc = im.copy(); luc.putalpha(Image.fromarray((np.asarray(alfa).astype(np.float32) * np.asarray(m) / 255).astype('uint8')))
    cha = im.copy(); cha.putalpha(Image.fromarray((np.asarray(alfa).astype(np.float32) * (255 - np.asarray(m)) / 255).astype('uint8')))
    px, py = BOCCA[0] * SC, BOCCA[1] * SC
    cha = cha.convert('RGBa').resize((int(im.width * scala), int(im.height * scala)), Image.LANCZOS).convert('RGBA')
    tela = Image.new('RGBA', im.size, (0, 0, 0, 0))
    tela.alpha_composite(cha, (int(px - px * scala), int(py - py * scala)))       # Charizard si rimpicciolisce attorno alla bocca: resta rivolto a Lucario
    tela.alpha_composite(luc)
    bb = tela.getchannel('A').point(lambda v: 255 if v > 2 else 0).getbbox()
    out = tela.crop(bb)
    h = 1000
    out = out.resize((round(out.width * h / out.height), h), Image.LANCZOS)
    out.save(dst, quality=88, alpha_quality=92, method=6)
    print('scritto', dst, out.size)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.82)
