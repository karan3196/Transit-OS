# "When Every Minute Matters" — 60s concept animatic

A self-contained, deterministic motion-graphics film rendered from code.
No stock footage, no external assets, no AI-generated imagery — every frame is
drawn as SVG and captured headlessly, so the output is byte-reproducible.

**Output:** `out/when-every-minute-matters.mp4` — 1920×1080, 30 fps, 60.0 s, H.264, silent.

## Why silent

The source script is written for a 2.5–3 minute AV with a voice-over. This cut
condenses it to 60 seconds and carries the VO as on-screen lines, which is the
normal form for a concept animatic used to lock structure and timing before a
voice session. See "Adding a voice-over" below.

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

Supers land at 30.2s, 39.8s and 46.6s.

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

## Adding a voice-over

The cut is built to take VO without re-timing: caption in/out points are the
intended line reads. With a recorded track:

```bash
ffmpeg -i out/when-every-minute-matters.mp4 -i vo.wav \
  -c:v copy -c:a aac -b:a 192k -shortest out/with-vo.mp4
```

To drop the on-screen VO lines once real voice-over exists, empty the `CAPS`
array and re-render — the supers and HUD text are separate and will stay.

## Longer cut

The full script runs 2.5–3 minutes. To restore it, widen each scene's in/out
points and re-space `CAPS` to the original line list; the scene builders are
written against local time, so they stretch without further changes.
