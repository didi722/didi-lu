# Compone il duello: Mega Charizard Y (a sinistra, mandibola aperta) contro Mega Lucario (a destra, braccio teso)
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageOps
import numpy as np, math, sys
import pose

LW,LH=2400,1500          # tela di lavoro (si riduce a metà alla fine)
TERRA=1400               # y dei piedi

def bbox(im):
    return im.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()

def prepara():
    L=pose.lucario(-62)
    C=pose.charizard(24)
    C=ImageOps.mirror(C)                                     # guarda a destra
    return C,L

def piazza(im,altezza,piede_x=None,sinistra=None,cx=None,terra=TERRA):
    """Ridimensiona (altezza del riquadro occupato) e posa sul terreno; restituisce (immagine su tela, bbox su tela)"""
    b=bbox(im); w,h=b[2]-b[0],b[3]-b[1]
    s=altezza/h
    crop=im.crop(b).resize((int(w*s),int(h*s)),Image.LANCZOS)
    tela=Image.new('RGBA',(LW,LH),(0,0,0,0))
    if cx is not None: x=int(cx-crop.width/2)
    else: x=int(sinistra)
    y=int(terra-crop.height)
    tela.alpha_composite(crop,(x,y))
    return tela,(x,y,x+crop.width,y+crop.height),s,b

if __name__=='__main__':
    C,L=prepara()
    hc=float(sys.argv[1]) if len(sys.argv)>1 else 1180
    hl=float(sys.argv[2]) if len(sys.argv)>2 else 1250
    cc,bc,sc,b0c=piazza(C,hc,sinistra=int(sys.argv[3]) if len(sys.argv)>3 else 60)
    ll,bl,sl,b0l=piazza(L,hl,sinistra=int(sys.argv[4]) if len(sys.argv)>4 else 1180)
    print('char',bc,'luca',bl)
    t=Image.new('RGBA',(LW,LH),(70,130,230,255))
    t.alpha_composite(cc); t.alpha_composite(ll)
    t.resize((1200,750),Image.LANCZOS).save('prev-duello.png')
