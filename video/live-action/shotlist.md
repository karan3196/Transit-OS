# "When Every Minute Matters" — live-action shot list

Twenty clips, cut to the audio master that already exists
(`video/out/` audio track, built by `video/audio/`). Every in/out below is
locked to a voice-over line, so when the clips arrive the edit is deterministic —
`assemble.py` cuts it with no re-timing.

Generate each shot with a text-to-video model (Veo / Gemini / Runway / Kling).
Ask for **8 seconds at 1920×1080, 24 or 30 fps**; the assembler takes the
in/out it needs from the middle of each clip, so extra head and tail is useful,
not wasted.

## House style — append to every prompt

> Shot on ARRI Alexa, 35mm anamorphic, shallow depth of field, natural
> available light, handheld with subtle float, muted cinematic grade with warm
> highlights and cool shadows, fine film grain, documentary realism, no text or
> captions burned in, no visible brand logos or badges on any vehicle, building
> or uniform.

Keeping vehicles and uniforms unbranded matters: the end frame carries the
wordmark, and a generated logo would be a fabricated brand mark.

## Shots

| # | In | Out | Dur | Shot | Prompt |
|---|----|-----|-----|------|--------|
| 01 | 0.00 | 5.30 | 5.30 | Opening — title plate | A silver unbranded compact hatchback drives along an Indian national highway at dawn, low golden sun, mist over green fields, camera tracking alongside from a moving vehicle; far above, a small delivery drone crosses the frame. Wide, unhurried. |
| 02 | 5.30 | 8.20 | 2.90 | Waiting for delivery | An Indian family stands waiting in a car dealership handover bay, the father glancing at his wristwatch, mother and child beside him, warm morning light through tall glass, polished floor, slow push in. |
| 03 | 8.20 | 10.25 | 2.05 | Stranded | A hatchback stopped on the shoulder of an Indian highway with hazard lights blinking, a man standing beside the open driver's door speaking on his phone, late afternoon, traffic passing, slow drift. |
| 04 | 10.25 | 13.25 | 3.00 | The delay explained | An Indian service advisor in a plain uniform stands at a workshop reception counter explaining something to a woman customer, a wall clock visible behind them, soft daylight, handheld over-the-shoulder. |
| 05 | 13.25 | 16.35 | 3.10 | The repair stalls | A compact car raised on a two-post lift inside a clean Indian service workshop, a technician underneath looking at a tablet, shafts of daylight through the bay door, slow dolly in. |
| 06 | 16.35 | 17.80 | 1.45 | One part | Extreme close-up of a technician's hands opening an empty parts drawer in a workshop, then holding one small metal automotive component up to the light, shallow focus. |
| 07 | 17.80 | 21.60 | 3.80 | Traffic | Aerial drone view descending over dense stalled Indian city traffic at midday, a white delivery van boxed in among cars and autorickshaws, heat haze, slow downward push. |
| 08 | 21.60 | 25.30 | 3.70 | Loading the drone | Inside a clean automotive parts warehouse, a worker in a plain uniform places a small grey cargo box into the underslung payload bay of a white quadcopter delivery drone and closes the latch, rotors beginning to spin, shallow focus. |
| 09 | 25.30 | 28.55 | 3.25 | Lift-off | A white delivery drone carrying a compact cargo box lifts off from a rooftop landing pad above an Indian city at golden hour, camera low and close as it rises out of frame, city skyline behind. |
| 10 | 28.55 | 30.80 | 2.25 | The corridor | Aerial tracking shot flying alongside a delivery drone as it crosses above an Indian urban corridor at golden hour, rooftops and a flyover below, sense of speed and clear air. |
| 11 | 30.80 | 32.85 | 2.05 | Part lands, car ready | A delivery drone touches down on a marked pad outside an Indian service workshop, a technician steps in and lifts the cargo box from it, then hands car keys to a smiling woman customer beside a finished car. Warm late light. |
| 12 | 32.85 | 35.75 | 2.90 | Breakdown, rural | A car with hazard lights on, stopped on the shoulder of a rural Indian highway lined with green fields, the driver standing beside it looking down the empty road, late afternoon, wide and still. |
| 13 | 35.75 | 38.60 | 2.85 | Command centre | An Indian control-room operator watches a wall of live map and camera feeds in a dim command centre, screen glow on their face, colleagues working behind, slow lateral dolly. |
| 14 | 38.60 | 40.00 | 1.40 | Drone inbound | A delivery drone flies fast and low straight down the centre line of a rural Indian highway toward camera, fields either side, late afternoon sun behind it. |
| 15 | 40.00 | 41.85 | 1.85 | First view | Straight-down aerial drone view of a stranded car on a highway shoulder with its hazards on, the driver looking up, a service van pulling in behind it; slow rotation. |
| 16 | 41.85 | 44.40 | 2.55 | Incident, night | A night road incident on an Indian highway, hazard lights and headlight beams cutting through dust, figures at a distance, rain-wet asphalt reflecting red and amber, handheld. |
| 17 | 44.40 | 46.80 | 2.40 | Eyes up | A drone rises into the night sky above a highway incident, the scene shrinking below into pools of red and amber light, camera looking down past the rotors. |
| 18 | 46.80 | 48.60 | 1.80 | Coordinated response | High aerial night view of an Indian highway incident with an ambulance and two service vehicles converging from different directions, headlights tracing lines across the dark. |
| 19 | 48.60 | 54.60 | 6.00 | Network plate | Slow high aerial flight over an Indian city at dusk, lights coming on, arterial roads and industrial sheds visible, very gradual forward drift. *(The ecosystem graphic is composited over this plate.)* |
| 20 | 54.60 | 57.75 | 3.15 | Back on the road | Interior of a moving car, an Indian family of four, the mother driving and smiling, warm late sun through the windscreen, fields sliding past outside, handheld from the bonnet. |

## Graphics the assembler adds (no footage needed)

| Element | In | Out | Content |
|---------|----|-----|---------|
| Title | 0.6 | 4.6 | **WHEN EVERY MINUTE MATTERS** over shot 01, with "A CONCEPT FILM" above it |
| Super 1 | 30.90 | 32.45 | **Faster Parts. Faster Repairs.** |
| Super 2 | 40.10 | 41.45 | **Assess First. Respond Better.** |
| Super 3 | 46.90 | 48.45 | **Improved Visibility. Faster Coordination.** |
| Ecosystem | 48.60 | 54.60 | Node-and-corridor network over shot 19 |
| End frame | 57.75 | 60.00 | Drone Services for Smarter Customer Support / Exploring New Possibilities for Customer Experience / Maruti Suzuki |

Subtitles of the voice-over are optional and off by default — with a real
soundtrack the lines are heard, not read.

## Delivering the clips

Name them `shot01.mp4` … `shot20.mp4`, upload them to this session (or drop them
in `video/live-action/clips/`), and run:

```bash
python3 video/live-action/assemble.py
```

Missing shots are fine — any slot without a clip falls back to a black plate
with the shot number, so the film can be cut and reviewed while the footage is
still coming in.
