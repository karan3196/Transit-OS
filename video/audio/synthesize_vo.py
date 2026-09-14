"""Synthesize the voice-over and solve its timing against the film's scenes.

Run from the repo root:  python3 video/audio/synthesize_vo.py
Work dir (voices, intermediate line WAVs) defaults to video/audio/.work;
override with VO_WORK. Piper voice defaults to en-us-ryan-high; override with
VO_VOICE (the .onnx and .onnx.json must sit in <work>/voices).
"""
import os
WORK = os.environ.get('VO_WORK', os.path.join(os.path.dirname(__file__), '.work'))
VOICE = os.environ.get('VO_VOICE', 'en-us-ryan-high')
os.makedirs(os.path.join(WORK, 'vo'), exist_ok=True)
SP = WORK

import wave, io, json
import numpy as np
from piper import PiperVoice, SynthesisConfig

SR=22050

# scene_id, preferred VO start, target VO end (leaves room for the super / scene out)
SCENES={1:(5.50,12.85), 2:(13.50,21.30), 3:(22.00,31.15),
        4:(32.85,40.25), 5:(41.85,47.00), 6:(49.00,54.30), 7:(54.65,59.35)}
GAP=0.28
FLOOR=0.88

# caption text, spoken chunks (list => pause between), scene
LINES=[
 ("It's not the journey that defines the experience.", ["It's not the journey that defines the experience."], 1),
 ("It's how quickly support arrives.",                 ["It's how quickly support arrives."], 1),
 ("Because when a vehicle stops… life doesn't.",       ["Because when a vehicle stops,","life doesn't."], 1),
 ("Sometimes a repair doesn't wait for hours of work.",["Sometimes a repair doesn't wait for hours of work."], 2),
 ("It waits for one part.",                            ["It waits for one part."], 2),
 ("One missing component can extend customer downtime.",["One missing component can extend customer downtime."], 2),
 ("Imagine if urgent, lightweight components could move through the air.",
                                                       ["Imagine if urgent, lightweight components could move through the air."], 3),
 ("Not replacing traditional logistics — complementing it.",
                                                       ["Not replacing traditional logistics,","complementing it."], 3),
 ("Delivering critical parts faster, when every minute counts.",
                                                       ["Delivering critical parts faster, when every minute counts."], 3),
 ("Understanding the problem early improves response time.",
                                                       ["Understanding the problem early improves response time."], 4),
 ("Drones can provide a first view of the situation.",  ["Drones can provide a first view of the situation."], 4),
 ("Helping technicians arrive better prepared.",        ["Helping technicians arrive better prepared."], 4),
 ("In emergencies, timely information matters.",        ["In emergencies, timely information matters."], 5),
 ("Live aerial visibility helps coordinate response.",  ["Live aerial visibility helps coordinate response."], 5),
 ("The opportunity isn't drones everywhere.",           ["The opportunity isn't drones everywhere."], 6),
 ("It's using them where they create the greatest customer value.",
                                                       ["It's using them where they create the greatest customer value."], 6),
 ("The future of mobility isn't about flying vehicles.",["The future of mobility isn't about flying vehicles."], 7),
 ("It's about delivering care faster.",                 ["It's about delivering care faster."], 7),
]
CHUNK_PAUSE=0.30

voice = PiperVoice.load(f'{SP}/voices/{VOICE}.onnx',
                        config_path=f'{SP}/voices/{VOICE}.onnx.json')

def synth(chunks, scale):
    cfg = SynthesisConfig(length_scale=scale, noise_scale=0.667,
                          noise_w_scale=0.8, normalize_audio=True)
    parts=[]
    for j,c in enumerate(chunks):
        buf=io.BytesIO()
        with wave.open(buf,'wb') as w:
            voice.synthesize_wav(c, w, syn_config=cfg)
        buf.seek(0)
        with wave.open(buf,'rb') as w:
            a=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
        # trim silence head/tail
        thr=0.006; idx=np.where(np.abs(a)>thr)[0]
        if len(idx): a=a[max(0,idx[0]-int(0.02*SR)):min(len(a),idx[-1]+int(0.05*SR))]
        parts.append(a)
        if j<len(chunks)-1: parts.append(np.zeros(int(CHUNK_PAUSE*SR),dtype=np.float32))
    return np.concatenate(parts)

# pass 1: natural durations per scene, solve a scene-wide length_scale
nat={}
for i,(cap,chunks,sc) in enumerate(LINES):
    nat[i]=len(synth(chunks,1.0))/SR
scale={}
for sc,(t0,t1) in SCENES.items():
    ids=[i for i,l in enumerate(LINES) if l[2]==sc]
    total=sum(nat[i] for i in ids)+GAP*(len(ids)-1)
    avail=t1-t0
    s=1.0 if total<=avail else max(FLOOR,(avail-GAP*(len(ids)-1))/sum(nat[i] for i in ids))
    scale[sc]=round(s,3)

# pass 2: render at the solved scale and lay out the timeline
out=[]; audio={}
for sc,(t0,t1) in SCENES.items():
    ids=[i for i,l in enumerate(LINES) if l[2]==sc]
    cur=t0
    for i in ids:
        a=synth(LINES[i][1],scale[sc]); audio[i]=a
        d=len(a)/SR
        out.append(dict(i=i,scene=sc,start=round(cur,3),end=round(cur+d,3),
                        dur=round(d,3),scale=scale[sc],text=LINES[i][0]))
        cur+=d+GAP

for sc in SCENES: print(f'scene {sc}: length_scale {scale[sc]}')
print()
print(f"{'#':>2} {'scene':>5} {'in':>6} {'out':>6} {'dur':>5}  text")
over=0
for r in out:
    t1=SCENES[r['scene']][1]
    flag=''
    if r['end']>t1+0.02: flag=f"  OVER by {r['end']-t1:.2f}"; over+=1
    print(f"{r['i']:>2} {r['scene']:>5} {r['start']:>6.2f} {r['end']:>6.2f} {r['dur']:>5.2f}{flag}  {r['text'][:48]}")
print('\noverruns:',over,'| speech total',round(sum(r['dur'] for r in out),1),'s')
np.save(f'{SP}/vo_audio.npy', np.array([0]))
json.dump(out, open(f'{SP}/vo_schedule.json','w'), indent=1)
for i,a in audio.items():
    np.save(f'{SP}/vo/line{i:02d}.npy', a)
