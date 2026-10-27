from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np, math, random

def schermo(base,sopra):
    """screen blend di due RGBA (l'alpha si somma)"""
    a=np.array(base).astype(np.float32)/255; b=np.array(sopra).astype(np.float32)/255
    rgb=1-(1-a[...,:3])*(1-b[...,:3]*b[...,3:4])
    al=np.clip(a[...,3]+b[...,3]*(1-a[...,3]),0,1)
    return Image.fromarray((np.dstack([rgb,al])*255).astype('uint8'),'RGBA')

def alone(maschera,colore,raggio,forza=1.0):
    """Alone morbido attorno a una forma (maschera L) nel colore dato"""
    m=maschera.filter(ImageFilter.GaussianBlur(raggio))
    arr=np.array(m).astype(np.float32)/255*forza
    arr=np.clip(arr,0,1)
    out=np.zeros(arr.shape+(4,),dtype='uint8')
    out[...,0],out[...,1],out[...,2]=colore
    out[...,3]=(arr*255).astype('uint8')
    return Image.fromarray(out,'RGBA')

def bordo_luce(maschera,colore,spessore,dx,dy,raggio=6,forza=1.0):
    """Luce di taglio: il bordo della forma dalla parte (dx,dy)"""
    sh=ImageChops.offset(maschera,dx,dy)
    # bordo = forma meno la forma spostata dalla parte opposta
    e=ImageChops.subtract(maschera,ImageChops.offset(maschera,int(dx*spessore),int(dy*spessore)))
    e=e.filter(ImageFilter.GaussianBlur(raggio))
    arr=np.clip(np.array(e).astype(np.float32)/255*forza*2,0,1)
    arr=arr*(np.array(maschera).astype(np.float32)/255)          # solo dentro la forma
    out=np.zeros(arr.shape+(4,),dtype='uint8')
    out[...,0],out[...,1],out[...,2]=colore
    out[...,3]=(arr*255).astype('uint8')
    return Image.fromarray(out,'RGBA')

def palla(dim,centro,raggio,colore,forza=1.0,morbidezza=0.5):
    """Bagliore radiale"""
    w,h=dim
    y,x=np.mgrid[0:h,0:w].astype(np.float32)
    d=np.sqrt((x-centro[0])**2+(y-centro[1])**2)/raggio
    a=np.clip(1-d,0,1)**(1/morbidezza if morbidezza>0 else 1)
    a=a*forza
    out=np.zeros((h,w,4),dtype='uint8')
    out[...,0],out[...,1],out[...,2]=colore
    out[...,3]=(np.clip(a,0,1)*255).astype('uint8')
    return Image.fromarray(out,'RGBA')

def fiamma(dim,punti,larghezze,seme=1,gruppi=900):
    """Getto di fuoco lungo una spezzata: nucleo giallo-bianco, poi arancio, poi rosso che sfuma"""
    rnd=random.Random(seme)
    w,h=dim
    strati=[Image.new('RGBA',dim,(0,0,0,0)) for _ in range(3)]
    ds=[ImageDraw.Draw(s) for s in strati]
    # lunghezze cumulate
    seg=[math.dist(punti[i],punti[i+1]) for i in range(len(punti)-1)]
    tot=sum(seg)
    def pos(t):
        d=t*tot
        for i,l in enumerate(seg):
            if d<=l or i==len(seg)-1:
                u=min(1,d/l) if l else 0
                return (punti[i][0]+(punti[i+1][0]-punti[i][0])*u,punti[i][1]+(punti[i+1][1]-punti[i][1])*u,i+u)
            d-=l
    def larg(t):
        k=t*(len(larghezze)-1); i=min(int(k),len(larghezze)-2); u=k-i
        return larghezze[i]*(1-u)+larghezze[i+1]*u
    for g in range(gruppi):
        t=rnd.random()**0.8
        x,y,s=pos(t)
        # direzione per lo scostamento laterale
        x2,y2,_=pos(min(1,t+0.01)); dx,dy=x2-x,y2-y; n=math.hypot(dx,dy) or 1
        nx,ny=-dy/n,dx/n
        wv=larg(t)
        off=(rnd.random()-0.5)*wv*1.3+math.sin(t*14+seme)*wv*0.18
        px,py=x+nx*off,y+ny*off
        r=wv*(0.18+0.34*rnd.random())*(1+0.8*t)
        # colore secondo la distanza dal centro e da dove siamo lungo il getto
        centro=1-abs(off)/(wv*0.65+1e-6)
        for k,(col,al,scala) in enumerate((((230,40,10),150-90*t,1.0),((255,140,20),170-70*t,0.72),((255,235,150),190-120*t,0.42))):
            if k==2 and centro<0.25: continue
            if k==1 and centro<0.05: continue
            rr=r*scala
            ds[k].ellipse([px-rr,py-rr,px+rr,py+rr],fill=col+(max(0,int(al*(0.35+0.65*centro))),))
    strati=[strati[0].filter(ImageFilter.GaussianBlur(14)),strati[1].filter(ImageFilter.GaussianBlur(8)),strati[2].filter(ImageFilter.GaussianBlur(4))]
    out=Image.new('RGBA',dim,(0,0,0,0))
    for s in strati: out=schermo(out,s)
    return out

def scintille(dim,origine,verso,n,colore,seme=3,lunghezza=300,dispersione=0.5):
    rnd=random.Random(seme)
    out=Image.new('RGBA',dim,(0,0,0,0)); d=ImageDraw.Draw(out)
    for i in range(n):
        a=verso+(rnd.random()-0.5)*dispersione
        l=rnd.random()**0.7*lunghezza
        x,y=origine[0]+math.cos(a)*l+rnd.uniform(-12,12),origine[1]+math.sin(a)*l+rnd.uniform(-30,30)-l*0.12
        r=rnd.uniform(2,5.5)*(1-l/lunghezza*0.5)
        d.ellipse([x-r,y-r,x+r,y+r],fill=colore+(int(rnd.uniform(160,255)),))
    return out.filter(ImageFilter.GaussianBlur(1.2))
