# Ri-posa i due render HOME: braccio teso di Mega Lucario e bocca aperta di Mega Charizard Y (lavoro a 3x)
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np, math, os
ARTE=os.environ.get('ARTE','arte/')            # cartella con home-10059.png e home-10035.png (i render di Pokémon HOME di PokeAPI)
if not ARTE.endswith('/'): ARTE+='/'
K=3  # fattore di ingrandimento

def carica(n):
    im=Image.open(ARTE+f'home-{n}.png').convert('RGBA')
    return im.resize((im.width*K,im.height*K),Image.LANCZOS)

def ruota(im,angolo,centro):
    # con l'alpha premoltiplicato i bordi non si sfrangiano
    return im.convert('RGBa').rotate(angolo,center=centro,resample=Image.BICUBIC).convert('RGBA')

def poly(p): return [(x*K,y*K) for x,y in p]

# ---------------- Lucario: braccio sinistro (di chi guarda) teso in avanti ----------------
def lucario(angolo=-62):
    im=carica(10059)
    W,H=im.size
    m=Image.new('L',(W,H),0)
    ImageDraw.Draw(m).polygon(poly([(140,186),(172,186),(172,206),(158,236),(146,262),(138,284),(131,300),(129,320),(60,320),(60,200),(100,190)]),fill=255)
    m=m.filter(ImageFilter.GaussianBlur(0.6))
    alpha=im.getchannel('A')
    arm_alpha=ImageChops.multiply(alpha,m)
    arm=im.copy(); arm.putalpha(arm_alpha)
    body=im.copy()
    # il corpo senza il braccio: via l'alpha dentro la maschera
    inv=ImageChops.invert(m)
    body.putalpha(ImageChops.multiply(alpha,inv))
    pivot=(168*K,202*K)
    arm_r=ruota(arm,angolo,pivot)
    out=Image.new('RGBA',(W,H),(0,0,0,0))
    out.alpha_composite(body)
    out.alpha_composite(arm_r)
    return out

# ---------------- Charizard Y: bocca spalancata ----------------
BL=[(172,217),(180,209),(192,206),(206,203),(218,199),(230,194)]   # il bordo tra mascella e mandibola (coordinate 512)
def charizard(apertura=24):
    im=carica(10035)
    W,H=im.size
    alpha=im.getchannel('A')
    hinge=(224*K,203*K)
    def rot(p,a,scala=True):
        x,y=(p[0]*K if scala else p[0])-hinge[0],(p[1]*K if scala else p[1])-hinge[1]
        c,s=math.cos(math.radians(a)),math.sin(math.radians(a))       # antiorario a video (y verso il basso)
        return (hinge[0]+x*c+y*s,hinge[1]-x*s+y*c)
    # mandibola = tutto quello che sta sotto il bordo; verso la cerniera sfuma (così non si vede il taglio)
    jaw=Image.new('L',(W,H),0)
    ImageDraw.Draw(jaw).polygon(poly(BL+[(236,196),(240,224),(232,238),(176,238),(166,228)]),fill=255)
    jaw=jaw.filter(ImageFilter.GaussianBlur(0.7))
    ramp=np.clip((236*K-np.arange(W))/(26*K),0,1)[None,:]            # 1 fino a x=210, poi scende a 0 in x=236
    jaw=Image.fromarray((np.array(jaw)*ramp).astype('uint8'))
    jaw_im=im.copy(); jaw_im.putalpha(ImageChops.multiply(alpha,jaw))
    body=im.copy(); body.putalpha(ImageChops.multiply(alpha,ImageChops.invert(jaw)))
    jaw_r=ruota(jaw_im,apertura,hinge)
    # interno della bocca: lo spicchio tra il bordo e il bordo ruotato, scuro verso la cerniera
    sopra=[(x*K,y*K) for x,y in BL]
    sotto=[rot(p,apertura) for p in BL]
    cuneo=Image.new('L',(W,H),0)
    ImageDraw.Draw(cuneo).polygon(sopra+sotto[::-1],fill=255)
    cuneo=cuneo.filter(ImageFilter.GaussianBlur(0.8))
    xs=np.arange(W)[None,:].repeat(H,0)
    t=np.clip((xs-164*K)/(60*K),0,1)                                   # 0 davanti, 1 in fondo
    col=np.zeros((H,W,4),dtype='uint8')
    col[...,0]=(150-110*t).astype('uint8'); col[...,1]=(28-22*t).astype('uint8'); col[...,2]=(34-26*t).astype('uint8')
    col[...,3]=np.array(cuneo)
    interno=Image.fromarray(col,'RGBA')
    # lingua
    tongue=Image.new('RGBA',(W,H),(0,0,0,0))
    td=ImageDraw.Draw(tongue)
    p1=rot((180,213),apertura); p2=rot((214,204),apertura)
    cx,cy=(p1[0]+p2[0])/2,(p1[1]+p2[1])/2-1.5*K
    td.ellipse([cx-19*K,cy-4.5*K,cx+19*K,cy+4.5*K],fill=(224,96,104,255))
    ang=math.degrees(math.atan2(-(p2[1]-p1[1]),p2[0]-p1[0]))
    tongue=tongue.rotate(ang,center=(cx,cy),resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(1.0))
    # la zanna di sopra resta attaccata alla mascella
    zm=Image.new('L',(W,H),0)
    ImageDraw.Draw(zm).polygon(poly([(176,203),(196,203),(194,214),(187,222),(180,214)]),fill=255)
    arr=np.array(im)
    bright=(arr[...,:3].min(axis=2)>205)&(arr[...,3]>200)
    zmask=Image.fromarray(((bright&(np.array(zm)>0))*255).astype('uint8')).filter(ImageFilter.MaxFilter(3))
    zanna=im.copy(); zanna.putalpha(ImageChops.multiply(alpha,zmask))
    # una zanna piccola sulla mandibola
    low=Image.new('RGBA',(W,H),(0,0,0,0))
    q=rot((180,209),apertura); q2=rot((190,207),apertura)
    top=((q[0]+q2[0])/2-0.5*K,(q[1]+q2[1])/2-8*K)
    ImageDraw.Draw(low).polygon([q,q2,top],fill=(246,244,236,255))
    out=Image.new('RGBA',(W,H),(0,0,0,0))
    out.alpha_composite(interno)
    out.alpha_composite(tongue)
    out.alpha_composite(jaw_r)
    out.alpha_composite(low)
    out.alpha_composite(body)
    out.alpha_composite(zanna)
    return out

if __name__=='__main__':
    L=lucario(); L.save('lucario-arm.png')
    C=charizard(); C.save('charizard-open.png')
    def su(im,col=(110,140,200,255)):
        b=Image.new('RGBA',im.size,col); b.alpha_composite(im); return b
    su(L).crop((0,0,1536,1050)).save('prev-lucario.png')
    su(C).crop((375,375,975,780)).resize((1200,810),Image.LANCZOS).save('prev-char-head.png')
