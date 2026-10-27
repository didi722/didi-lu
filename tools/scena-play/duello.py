# Immagine finale: Mega Charizard Y contro Mega Lucario, con luci, alone e fuoco
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageOps
import numpy as np, math, sys, json
import pose, effetti as E
from compose import LW,LH,TERRA,bbox

K=pose.K
def trasforma(im,altezza,sinistra):
    b=bbox(im); w,h=b[2]-b[0],b[3]-b[1]; s=altezza/h
    crop=im.crop(b).resize((int(w*s),int(h*s)),Image.LANCZOS)
    x=int(sinistra); y=int(TERRA-crop.height)
    tela=Image.new('RGBA',(LW,LH),(0,0,0,0)); tela.alpha_composite(crop,(x,y))
    return tela,(b,s,x,y)

def main(hc=1220,hl=1250,xc=40,xl=1010,out='duello'):
    C=pose.charizard(24); C=ImageOps.mirror(C)
    L=pose.lucario(-62)
    cc,(bc,sc,xc_,yc_)=trasforma(C,hc,xc)
    ll,(bl,sl,xl_,yl_)=trasforma(L,hl,xl)
    def pc(p):   # coordinate 512 di Charizard (prima dello specchio) -> tela
        x=(512-p[0])*K; y=p[1]*K
        return ((x-bc[0])*sc+xc_,(y-bc[1])*sc+yc_)
    def pl(p):
        return ((p[0]*K-bl[0])*sl+xl_,(p[1]*K-bl[1])*sl+yl_)
    bocca=pc((176,214))          # davanti alla bocca aperta
    pugno=pl((66,192))           # pugno di Lucario
    print('bocca',bocca,'pugno',pugno)
    dim=(LW,LH)
    mc=cc.getchannel('A'); ml=ll.getchannel('A')
    strati=Image.new('RGBA',dim,(0,0,0,0))
    # --- dietro: alone dei due (uno caldo, uno freddo)
    dietro=Image.new('RGBA',dim,(0,0,0,0))
    dietro=E.schermo(dietro,E.alone(mc,(255,130,30),46,0.75))
    dietro=E.schermo(dietro,E.alone(ml,(70,215,255),34,1.0))
    dietro=E.schermo(dietro,E.palla(dim,(pugno[0]+10,pugno[1]+10),250,(90,210,255),0.85,0.8))
    dietro=E.schermo(dietro,E.palla(dim,(pugno[0]-10,pugno[1]),100,(235,252,255),0.9,0.7))
    # --- ombre a terra
    ombra=Image.new('RGBA',dim,(0,0,0,0)); d=ImageDraw.Draw(ombra)
    for (b,sp) in ((bc,None),):
        pass
    d.ellipse([xc_+200,TERRA-40,xc_+(bc[2]-bc[0])*sc*0.95,TERRA+50],fill=(10,20,60,90))
    d.ellipse([xl_+60,TERRA-34,xl_+(bl[2]-bl[0])*sl-40,TERRA+44],fill=(10,20,60,90))
    ombra=ombra.filter(ImageFilter.GaussianBlur(22))
    mx,my=bocca; px,py=pugno
    fine=((mx+px)/2+20,(my+py)/2)
    # --- sopra: bagliore caldo davanti alla bocca, aura fredda sul pugno e un lampo dove si incontrano
    sopra=Image.new('RGBA',dim,(0,0,0,0))
    sopra=E.schermo(sopra,E.palla(dim,(mx+30,my+10),210,(255,150,40),0.75,0.7))
    sopra=E.schermo(sopra,E.palla(dim,(mx+10,my+6),80,(255,230,150),0.8,0.7))
    # luci di taglio
    lc=E.bordo_luce(mc,(120,215,255),0.10,12,0,5,0.9)       # Charizard, lato che guarda Lucario: freddo
    ll_l=E.bordo_luce(ml,(255,150,50),0.10,-12,0,5,0.9)     # Lucario, lato che guarda Charizard: caldo
    # --- composizione
    t=Image.new('RGBA',dim,(0,0,0,0))
    t=E.schermo(t,dietro)
    t.alpha_composite(ombra)
    t.alpha_composite(cc)
    t=E.schermo(t,lc)
    t.alpha_composite(ll)
    t=E.schermo(t,ll_l)
    t=E.schermo(t,sopra)
    t.save(out+'-grande.png')
    # anteprima su un cielo
    cielo=Image.new('RGBA',dim,(0,0,0,255))
    arr=np.zeros((LH,LW,4),dtype='uint8'); gy=np.linspace(0,1,LH)[:,None]
    arr[...,0]=(10+150*gy).astype('uint8'); arr[...,1]=(79+140*gy).astype('uint8'); arr[...,2]=(214+30*gy).astype('uint8'); arr[...,3]=255
    cielo=Image.fromarray(arr,'RGBA'); cielo.alpha_composite(t)
    cielo.resize((1200,750),Image.LANCZOS).save(out+'-anteprima.png')
    json.dump({'bocca':bocca,'pugno':pugno},open(out+'-punti.json','w'))
    bb=t.getchannel('A').point(lambda v:255 if v>10 else 0).getbbox()
    m=60
    box=(max(0,bb[0]-m),max(0,bb[1]-m),min(LW,bb[2]+m),min(LH,bb[3]+m))
    fin=t.crop(box)
    larg=1400; fin=fin.resize((larg,int(fin.height*larg/fin.width)),Image.LANCZOS)
    fin.save(out+'-finale.webp',quality=88,alpha_quality=92,method=6)
    fin.save(out+'-finale.png')
    print('finale',fin.size,box)
    return t

if __name__=='__main__':
    a=[float(x) for x in sys.argv[1:5]] if len(sys.argv)>4 else []
    main(*a)
