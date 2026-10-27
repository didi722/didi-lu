# Scontro su trasparente (niente sfondo: cielo e raggi li mette la scena): Mega Charizard Y (in picchiata, da destra) contro Mega Lucario (in balzo, da sinistra), con cielo, mare e scontro
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageChops
import numpy as np, math, random, sys
import pose, effetti as E
W,H=2500,1400
rnd=random.Random(7)

def rumore(w,h,scala,seme):
    r=np.random.RandomState(seme); tot=np.zeros((h,w),np.float32); amp=1; s=scala
    for _ in range(5):
        g=r.rand(max(2,h//s+2),max(2,w//s+2)).astype(np.float32)
        tot+=np.asarray(Image.fromarray((g*255).astype('uint8')).resize((w,h),Image.BICUBIC)).astype(np.float32)/255*amp
        amp*=.5; s=max(2,s//2)
    return tot/tot.max()

def sfondo():
    y=np.linspace(0,1,H)[:,None]; x=np.linspace(0,1,W)[None,:]
    top=np.array([12,22,120]);mid=np.array([30,110,225]);low=np.array([120,215,245])
    t=np.clip(y/0.78,0,1)
    c=np.where(t[...,None]<.55,top+(mid-top)*(t[...,None]/.55),mid+(low-mid)*((t[...,None]-.55)/.45))
    c=np.broadcast_to(c,(H,W,3)).copy()
    # mare sotto l'orizzonte
    mare=(y>0.8)
    sea=np.array([20,90,170])+np.array([30,70,60])*np.clip((1-(y-.8)/.2),0,1)[...,None]
    c=np.where(mare[...,None],np.broadcast_to(sea,(H,W,3)),c)
    n=rumore(W,H,60,3)
    c+=((n-.5)*14)[...,None]
    im=Image.fromarray(np.clip(c,0,255).astype('uint8'),'RGB').convert('RGBA')
    # nuvole in basso
    nub=rumore(W,H,90,11); mask=np.clip((nub-.52)*5,0,1)*np.clip(1-abs(y-.76)/.12,0,1)
    mask=Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(10))
    bianco=Image.new('RGBA',(W,H),(235,247,255,0)); bianco.putalpha(mask.point(lambda v:int(v*.85)))
    im.alpha_composite(bianco)
    # riflessi sul mare
    d=ImageDraw.Draw(im)
    for _ in range(90):
        yy=rnd.randint(int(H*.82),H); xx=rnd.randint(0,W); l=rnd.randint(40,200)
        d.line([xx,yy,xx+l,yy],fill=(200,235,255,rnd.randint(30,90)),width=rnd.randint(1,3))
    return im

def pt(p,b,s,ang,off,size0,mirror,W0):
    x=p[0]*pose.K; y=p[1]*pose.K
    if mirror: x=W0-x
    x=(x-b[0])*s; y=(y-b[1])*s
    cx,cy=(b[2]-b[0])*s/2,(b[3]-b[1])*s/2
    th=math.radians(ang); dx,dy=x-cx,y-cy
    xr=dx*math.cos(th)+dy*math.sin(th); yr=-dx*math.sin(th)+dy*math.cos(th)
    return (xr+size0[0]/2+off[0], yr+size0[1]/2+off[1])

def piazza(im,altezza,ang,centro,mirror=False):
    W0=im.width
    if mirror: im=ImageOps.mirror(im)
    b=im.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()
    s=altezza/(b[3]-b[1]); c=im.crop(b).resize((int((b[2]-b[0])*s),int((b[3]-b[1])*s)),Image.LANCZOS)
    c0=c.size
    r=c.convert('RGBa').rotate(ang,expand=True,resample=Image.BICUBIC).convert('RGBA')
    pos=(int(centro[0]-r.width/2),int(centro[1]-r.height/2))
    tela=Image.new('RGBA',(W,H),(0,0,0,0)); tela.alpha_composite(r,(pos[0],pos[1]))
    # funzione: punto originale (coord 512) -> tela
    bb=list(b)
    def f(p):
        x=p[0]*pose.K
        if mirror: x=W0-x
        y=p[1]*pose.K
        x=(x-bb[0])*s-c0[0]/2; y=(y-bb[1])*s-c0[1]/2
        th=math.radians(ang)
        return (x*math.cos(th)+y*math.sin(th)+centro[0], -x*math.sin(th)+y*math.cos(th)+centro[1])
    return tela,f

def acceso(f):
    # il fuoco deve coprire il cielo, non sporcarlo: alpha più piena e colori più caldi
    a=np.asarray(f).astype(np.float32); al=np.clip(a[...,3]*2.2/255,0,1)
    rgb=np.clip(a[...,:3]*1.25+al[...,None]*np.array([60,70,20]),0,255)
    return Image.fromarray(np.dstack([rgb,al*255]).astype('uint8'),'RGBA')

def fuoco(punti,larg,seme=1):
    # getto di fuoco: densità lungo la spezzata, bordi sfilacciati da rumore, colore dal bianco-giallo al rosso secondo la "temperatura"
    w,h=W//2,H//2; P=[(x/2,y/2) for x,y in punti]
    ys,xs=np.mgrid[0:h,0:w].astype(np.float32)
    n1=rumore(w,h,30,seme); n2=rumore(w,h,10,seme+9)
    xs=xs+(n1-.5)*70; ys=ys+(n2-.5)*60
    seg=[(P[i],P[i+1]) for i in range(len(P)-1)]; L=[math.dist(a,b) for a,b in seg]; tot=sum(L)
    best=np.full((h,w),1e9,np.float32); bt=np.zeros((h,w),np.float32); acc=0
    for (a,b),l in zip(seg,L):
        ax,ay=a; bx,by=b; dx,dy=bx-ax,by-ay
        u=np.clip(((xs-ax)*dx+(ys-ay)*dy)/(l*l),0,1)
        d=np.hypot(xs-(ax+u*dx),ys-(ay+u*dy))
        m=d<best; best=np.where(m,d,best); bt=np.where(m,(acc+u*l)/tot,bt); acc+=l
    wd=(larg[0]+(larg[1]-larg[0])*bt**.9)/2
    core=np.clip(1-best/wd,0,1)
    temp=core*(1.15-.6*bt)+(n2-.5)*.45*core**.4
    al=np.clip((temp-.08)*3.2,0,1)
    t=np.clip(temp,0,1)[...,None]
    r=np.clip(255*np.ones_like(t),0,255)
    g=np.clip(60+t*260,0,255); b_=np.clip((t-.62)*600,0,255)
    rgb=np.concatenate([r*np.clip(.55+t*1.2,0,1),g,b_],-1)
    im=Image.fromarray(np.dstack([rgb,al*255]).astype('uint8'),'RGBA').resize((W,H),Image.LANCZOS)
    return im

def run(out='scontro'):
    C=pose.charizard(34)          # guarda a sinistra
    L=pose.lucario(-62)           # guarda a sinistra: lo specchio lo fa guardare a destra
    cc,fc=piazza(C,561,34,(1839,398))
    ll,fl=piazza(L,765,24,(1074,654),mirror=True)
    bocca=fc((176,214)); pugno=fl((66,192))
    print('bocca',bocca,'pugno',pugno)
    base=Image.new('RGBA',(W,H),(0,0,0,0))
    mx=(bocca[0]+pugno[0])/2; my=(bocca[1]+pugno[1])/2
    # luce dello scontro dietro
    dietro=Image.new('RGBA',(W,H),(0,0,0,0))
    dietro=E.schermo(dietro,E.palla((W,H),(mx,my),440,(255,225,170),.45,.6))
    dietro=E.schermo(dietro,E.palla((W,H),(pugno[0]+40,pugno[1]),330,(90,225,255),.95,.7))
    base=E.schermo(base,dietro)
    # aloni dei Pokémon
    base=E.schermo(base,E.alone(ll.getchannel('A'),(70,215,255),30,.9))
    base=E.schermo(base,E.alone(cc.getchannel('A'),(255,130,30),34,.8))
    # fuoco dalla bocca verso lo scontro (due getti sovrapposti)
    f1=fuoco([(bocca[0]-15,bocca[1]+12),(bocca[0]-170,bocca[1]+50),(pugno[0]+140,pugno[1]-25)],[42,280],seme=2)
    f2=fuoco([(bocca[0]-15,bocca[1]+18),(bocca[0]-150,bocca[1]+100),(pugno[0]+220,pugno[1]+65)],[30,195],seme=6)
    base.alpha_composite(cc); base.alpha_composite(ll)
    base=E.schermo(base,E.bordo_luce(cc.getchannel('A'),(255,235,170),.10,-14,8,5,.9))
    base=E.schermo(base,E.bordo_luce(ll.getchannel('A'),(255,200,110),.10,14,-8,5,.9))
    for f in (f2,f1):
        base.alpha_composite(f)
    base=E.schermo(base,E.palla((W,H),(bocca[0]-50,bocca[1]+25),120,(255,210,110),.9,.6))
    # energia sul pugno
    base=E.schermo(base,E.palla((W,H),(pugno[0]+25,pugno[1]-5),170,(140,235,255),1.0,.6))
    base=E.schermo(base,E.palla((W,H),(pugno[0]+25,pugno[1]-5),60,(255,255,255),1.0,.7))
    base=E.schermo(base,E.scintille((W,H),(mx,my),-math.pi/2,70,(255,210,120),seme=4,lunghezza=380,dispersione=2.6))
    bb=base.getchannel('A').point(lambda v:255 if v>2 else 0).getbbox(); m=14
    box=(bb[0]-m,bb[1]-m,bb[2]+m,bb[3]+m)
    assert box[0]>0 and box[1]>0 and box[2]<W and box[3]<H, 'alone o fuoco toccano il bordo della tela'
    fin=base.crop(box); fin=fin.resize((int(fin.width*.62),int(fin.height*.62)),Image.LANCZOS)
    fin.save(out+'.webp',quality=88,alpha_quality=92,method=6); print('finale',fin.size)
    cielo=Image.new('RGBA',fin.size,(30,110,225,255)); cielo.alpha_composite(fin); cielo.convert('RGB').save(out+'-anteprima.png')

if __name__=='__main__': run()
