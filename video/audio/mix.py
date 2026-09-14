"""Build the final 60s audio master: voice-over, music bed and sound design.

Run from the repo root:  python3 video/audio/mix.py
Work dir (voices, intermediate line WAVs) defaults to video/audio/.work;
override with VO_WORK. Piper voice defaults to en-us-ryan-high; override with
VO_VOICE (the .onnx and .onnx.json must sit in <work>/voices).
"""
import os
WORK = os.environ.get('VO_WORK', os.path.join(os.path.dirname(__file__), '.work'))
VOICE = os.environ.get('VO_VOICE', 'en-us-ryan-high')
os.makedirs(os.path.join(WORK, 'vo'), exist_ok=True)
SP = WORK

import json, numpy as np
SR=48000; DUR=60.0; N=int(SR*DUR)
rng=np.random.default_rng(7)
t=np.arange(N)/SR

def idx(s): return int(round(s*SR))
def place(dst,src,at,g=1.0):
    i=idx(at); j=min(N,i+len(src))
    if i<N and j>i: dst[i:j]+=src[:j-i]*g

def _smooth(n):
    # next length whose only prime factors are 2/3/5 - numpy's FFT is fast there,
    # and catastrophically slow on a large prime length
    while True:
        m=n
        for p in (2,3,5):
            while m%p==0: m//=p
        if m==1: return n
        n+=1

def fftfilt(x,lo=None,hi=None):
    n0=len(x); n=_smooth(n0)
    xp=np.concatenate([x,np.zeros(n-n0)]) if n>n0 else x
    X=np.fft.rfft(xp); f=np.fft.rfftfreq(n,1/SR); m=np.ones(len(X))
    if lo is not None: m*=1/(1+(lo/np.maximum(f,1e-6))**4)      # highpass
    if hi is not None: m*=1/(1+(np.maximum(f,1e-6)/hi)**4)      # lowpass
    return np.fft.irfft(X*m,n)[:n0]

def resample(x,a,b):
    n=int(round(len(x)*b/a))
    return np.interp(np.arange(n)*(a/b), np.arange(len(x)), x)

def env_ar(n,a,r,hold=None):
    e=np.ones(n); na=int(a*SR); nr=int(r*SR)
    if na: e[:na]=np.linspace(0,1,na)**1.5
    if nr: e[-nr:]*=np.linspace(1,0,nr)**1.8
    return e

# ---------------------------------------------------------------- VOICE OVER
sched=json.load(open(f'{SP}/vo_schedule.json'))
vo=np.zeros(N)
for r in sched:
    a=np.load(f"{SP}/vo/line{r['i']:02d}.npy").astype(np.float64)
    a=resample(a,22050,SR)
    a=fftfilt(a,lo=85,hi=15000)                       # clean up rumble / hiss
    p=np.max(np.abs(a));  a=a/p*0.92 if p>0 else a
    k=int(0.012*SR); a[:k]*=np.linspace(0,1,k); a[-k:]*=np.linspace(1,0,k)
    place(vo,a,r['start'])

# VO envelope, for ducking everything else
def boxcar(x,win):
    k=max(1,int(win*SR)); pad=k//2
    c=np.cumsum(np.concatenate([np.zeros(pad),x,np.zeros(pad+k)]))
    return (c[k:k+len(x)]-c[:len(x)])/k
venv=boxcar(np.abs(vo),0.05)
venv=boxcar(venv,0.25)
venv=np.clip(venv/max(venv.max(),1e-9),0,1)
duck=1.0-0.62*np.clip(venv*3.2,0,1)

# ---------------------------------------------------------------- MUSIC BED
SECT=[(0.0,5.0,[110.00,164.81,220.00]),      # title    Am (open 5th)
      (5.0,13.0,[110.00,130.81,164.81]),     # 01       Am
      (13.0,21.5,[ 87.31,110.00,130.81]),    # 02       F
      (21.5,32.5,[130.81,164.81,196.00]),    # 03       C
      (32.5,41.5,[ 98.00,123.47,146.83]),    # 04       G
      (41.5,48.5,[110.00,164.81,220.00]),    # 05       Am
      (48.5,54.5,[ 87.31,130.81,174.61]),    # 06       F
      (54.5,60.0,[130.81,196.00,261.63])]    # final    C
bed=np.zeros(N); XF=0.9
for (s0,s1,ch) in SECT:
    i0=idx(max(0,s0-XF)); i1=idx(min(DUR,s1+XF/2)); n=i1-i0
    if n<=0: continue
    tt=np.arange(n)/SR; seg=np.zeros(n)
    for k,f in enumerate(ch):
        for h,amp in ((1,1.0),(2,0.34),(3,0.15),(4,0.07)):
            det=1+0.0015*np.sin(2*np.pi*(0.07+0.03*k)*tt+k)
            seg+=amp*(0.9**k)*np.sin(2*np.pi*f*h*det*tt+k*1.7+h)
    seg/=np.max(np.abs(seg))
    seg*=0.82+0.18*np.sin(2*np.pi*0.06*tt+s0)                 # slow swell
    e=np.ones(n); na=idx(XF); nr=idx(XF/2)
    e[:na]*=np.linspace(0,1,na)**2; e[-nr:]*=np.linspace(1,0,nr)**2
    bed[i0:i1]+=seg*e
bed=fftfilt(bed,lo=35,hi=2600)
bed/=max(np.abs(bed).max(),1e-9)

air=fftfilt(rng.standard_normal(N),lo=2200,hi=9000)
air*= (0.35+0.65*np.abs(np.sin(2*np.pi*0.045*t)))
air/=max(np.abs(air).max(),1e-9)

# ---------------------------------------------------------------- SOUND DESIGN
sfx=np.zeros(N)

def whoosh(dur=0.75,f0=260,f1=2400,rev=False):
    n=idx(dur); x=fftfilt(rng.standard_normal(n),lo=f0,hi=f1)
    e=(np.linspace(0,1,n)**2.4) if rev else (np.linspace(1,0,n)**2.0)
    return x/max(np.abs(x).max(),1e-9)*e

def sub(f=55,dur=0.55,dec=6.0):
    n=idx(dur); tt=np.arange(n)/SR
    return np.sin(2*np.pi*f*tt*(1-0.25*tt/dur))*np.exp(-dec*tt)

def blip(f=1180,dur=0.13,dec=26):
    n=idx(dur); tt=np.arange(n)/SR
    return (np.sin(2*np.pi*f*tt)+0.35*np.sin(2*np.pi*f*2*tt))*np.exp(-dec*tt)

def tick():
    n=idx(0.05); x=fftfilt(rng.standard_normal(n),lo=2600,hi=8000)
    return x/max(np.abs(x).max(),1e-9)*np.linspace(1,0,n)**3

CUTS=[5.0,13.0,21.5,32.5,41.5,48.5,54.5]
for c in CUTS:
    place(sfx,whoosh(0.85,220,3000,rev=True),c-0.7,0.11)   # rise into the cut
    place(sfx,whoosh(0.55,180,1800),c,0.09)                # settle after it
    place(sfx,sub(48,0.5,7),c,0.20)

for s0,s1,txt in [(30.90,32.45,''),(40.10,41.45,''),(46.90,48.45,'')]:
    place(sfx,whoosh(0.45,400,5200,rev=True),s0-0.42,0.16)
    place(sfx,sub(52,0.75,4.2),s0,0.30)
    place(sfx,whoosh(1.5,900,7000),s0,0.05)

BLIPS=[2.0,5.95,6.57,7.19,7.81,14.0,15.6,17.9,19.3,23.2,28.05,28.3,
       33.3,34.2,34.62,35.04,37.2,38.5,39.5,42.1,44.6,45.1,45.5,45.9,
       51.0,51.28,51.56,51.84,52.12,55.3]
for i,b in enumerate(BLIPS):
    place(sfx,blip(980+((i*7)%5)*110),b,0.055)

# light 100bpm tick bed through the solution half
for k in range(int(21.5/0.6),int(54.5/0.6)):
    tt=k*0.6
    if 21.5<=tt<54.5: place(sfx,tick(),tt,0.020 if k%2 else 0.033)

# rotor hum while a drone is in shot
def hum(dur,f=176):
    n=idx(dur); tt=np.arange(n)/SR
    vib=1+0.012*np.sin(2*np.pi*5.5*tt)+0.006*np.sin(2*np.pi*11*tt)
    x=sum(a*np.sin(2*np.pi*f*h*vib*tt) for h,a in ((1,1.0),(2,0.5),(3,0.28),(4,0.15),(6,0.07)))
    x+=0.25*fftfilt(rng.standard_normal(n),lo=900,hi=5200)
    x/=max(np.abs(x).max(),1e-9)
    e=np.ones(n); na=idx(min(0.6,dur/3)); nr=idx(min(0.9,dur/3))
    e[:na]*=np.linspace(0,1,na)**2; e[-nr:]*=np.linspace(1,0,nr)**2
    e*=0.75+0.25*np.sin(2*np.pi*0.6*tt)
    return x*e
for (a,b,f) in [(22.4,29.4,176),(34.4,39.9,168),(42.5,45.3,184),(54.6,57.5,172)]:
    place(sfx,hum(b-a,f),a,0.050)

# end-frame resolve
n=idx(2.6); tt=np.arange(n)/SR
res=sum(0.9**k*np.sin(2*np.pi*f*tt) for k,f in enumerate([130.81,196.00,261.63,392.00]))
res/=max(np.abs(res).max(),1e-9)
place(sfx,res*np.concatenate([np.linspace(0,1,idx(0.25))**2,np.linspace(1,0,n-idx(0.25))**1.4]),57.55,0.13)
place(sfx,sub(65,1.6,2.2),57.6,0.26)

# ---------------------------------------------------------------- MIX
mix = vo*1.00 + bed*0.135*duck + air*0.022*duck + sfx*0.62*np.clip(duck+0.22,0,1)
mix = fftfilt(mix,lo=28)
fi=idx(1.2); mix[:fi]*=np.linspace(0,1,fi)**1.5
fo=idx(1.1); mix[-fo:]*=np.linspace(1,0,fo)**1.4
mix=np.tanh(mix*1.06)/np.tanh(1.06)                 # soft limit
mix*=0.96/max(np.abs(mix).max(),1e-9)

# gentle stereo: bed/sfx widened, voice centred
side = (bed*0.135+air*0.022)*0.55
L=np.clip(mix+side*0.5,-1,1); R=np.clip(mix-side*0.5,-1,1)
st=np.stack([L,R],axis=1)
import wave
with wave.open(f'{SP}/master.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st*32767).astype('<i2').tobytes())
rms=np.sqrt(np.mean(mix**2))
print(f'master.wav  {len(mix)/SR:.2f}s  peak {np.abs(mix).max():.3f}  rms {20*np.log10(rms):.1f} dBFS')
print('VO lines placed:',len(sched))
