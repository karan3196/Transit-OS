# "When Every Minute Matters" — 60s concept animatic

A self-contained, deterministic motion-graphics film rendered from code.
No stock footage, no external assets, no AI-generated imagery — every frame is
drawn as SVG and captured headlessly, so the output is byte-reproducible.

**Output:** `out/when-every-minute-matters.mp4` — 1920×1080, 30 fps, 60.0 s, H.264 + AAC.

## Audio

The film has a full mix: voice-over, a music bed and sound design, built from
code like the picture.

- **Voice-over** — synthesized offline with [Piper](https://github.com/rhasspy/piper)
  (neural TTS, ONNX). The default voice is `en-us-ryan-high`. It is a **scratch
  track**: good enough to lock timing and to show the film, not a substitute for
  a voice artist. Swapping in a real recording is a one-line remux (below).
- **Music bed** — a synthesized pad that changes chord on each scene boundary
  (Am → F → C → G → Am → F → C), ducked ~5 dB under the voice.
- **Sound design** — transition risers and sub drops on every cut, rotor hum
  while a drone is in shot, UI blips on HUD elements, a hit under each super,
  and a resolving chord into the end frame.

Master is 48 kHz stereo, peak -0.4 dBFS, about -15 dBFS RMS.

### Why the picture was re-timed

The first cut's caption windows were set for reading speed, which is faster
than speech — several lines could not be spoken in their slot. The caption
track is now derived from the actual synthesized line durations, so subtitles
and voice match frame for frame. Scenes 3, 4 and 5 run their voice ~10% brisk
(Piper `length_scale` 0.89-0.92) because 60 seconds is genuinely tight for this
script; see "Longer cut".

### Rebuilding the audio

Needs `piper-tts` and `numpy`, plus the voice model in `video/audio/.work/voices/`:

```bash
pip install piper-tts numpy
mkdir -p video/audio/.work/voices && cd video/audio/.work/voices
curl -LO https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-ryan-high.tar.gz
tar xzf voice-en-us-ryan-high.tar.gz && cd -

python3 video/audio/synthesize_vo.py   # voices + timing schedule
python3 video/audio/mix.py             # master.wav
```

`synthesize_vo.py` prints the solved schedule. If you change the copy, re-run it,
paste the emitted `CAPS`/`SUPERS` arrays into `scene.html`, and re-render the
picture so subtitles stay in sync.

### Dropping in a real voice-over

```bash
ffmpeg -i out/when-every-minute-matters.mp4 -i vo.wav \
  -c:v copy -c:a aac -b:a 192k -shortest out/with-vo.mp4
```

To remove the on-screen voice-over lines once real narration exists, empty the
`CAPS` array in `scene.html` and re-render; supers and HUD text are separate and
stay put.

## Structure

| # | Scene | In | Out | Beat |
|---|-------|----|-----|------|
| — | Title | 0.0 | 5.0 | "When Every Minute Matters" |
| 01 | Customer expectations | 5.0 | 13.0 | Waiting clock + four customer moments |
| 02 | The challenge | 13.0 | 21.5 | One missing part, 47 min by road, downtime climbing |
| 03 | Urgent parts | 21.5 | 32.5 | Hub → service centre drone corridor, repair closed out |
| 04 | Roadside assistance | 32.5 | 41.5 | Command centre, first visual, technician arrives prepared |
| 05 | Emergency support | 41.5 | 48.5 | Incident alert, live aerial imagery, responders converge |
| 06 | Connected ecosystem | 48.5 | 54.5 | Full network, selective corridors only |
| — | Final vision + end frame | 54.5 | 60.0 | Vehicle returns to the customer, end card |

Supers land at 30.9s, 40.1s and 46.9s.

## Files

- `scene.html` — the film. A single deterministic renderer: `window.seek(t)` fully
  defines the frame at time `t`, so there are no CSS animations or timers and every
  render is identical.
- `render.mjs` — drives `seek()` frame by frame, pipes PNGs straight into ffmpeg
  (no intermediate frame files on disk).
- `preview.mjs` — grabs stills at arbitrary timestamps, for checking a change
  without a full render.

## Rendering

Requires Node with Playwright's Chromium, an ffmpeg with libx264, and the Inter
font family installed system-wide.

```bash
FFMPEG=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())") \
FPS=30 DUR=60 OUT=out/when-every-minute-matters.mp4 \
node render.mjs
```

Stills only:

```bash
node preview.mjs /tmp/stills 2.6 19.0 27.0 44.0 58.8
```

Render cost is roughly 0.4 s per frame, so a 60 s cut takes about 13 minutes.

## Editing

- **Wording and timing of the VO lines** — the `CAPS` array near the bottom of
  `scene.html` (`[in, out, text]`, seconds).
- **Supers** — the `SUPERS` array, same shape.
- **Scene boundaries** — the `addScene(id, in, out, number, label, build)` calls.
  Each `build()` returns an `update(localTime)` that positions everything for that
  scene; nothing is stateful between frames.
- **Palette** — the `C` object at the top.

## Longer cut

The full script runs 2.5–3 minutes. To restore it, widen each scene's in/out
points and re-space `CAPS` to the original line list; the scene builders are
written against local time, so they stretch without further changes.
