# Build & Render

How to run a Tokens video project, plus the non-obvious gotchas learned building the flagship. Mechanics live in the `hyperframes` skill; this is the Tokens-specific overlay.

## Commands

From inside a template/project folder:

```bash
npx hyperframes preview                 # live Studio in the browser (hot-reloads)
npx hyperframes lint                    # structural check — the reliable gate
npx hyperframes validate                # headless render-time check (contrast etc.)
npx hyperframes render --output out.mp4 # render to MP4
npx hyperframes render --variables '{...}' --output out.mp4   # template overrides
```

Pin a version if `npx` tries to fetch a too-new one: `npx hyperframes@0.6.106 ...`.

## Verify like this

Audio and 3D/WebGL can't be judged from the HTML. After rendering:

```bash
ffprobe -v error -select_streams a -show_entries stream=codec_name,channels -of csv=p=0 out.mp4   # expect: aac,2
for t in 1.4 5.6 7.0 12.5; do ffmpeg -y -loglevel error -ss $t -i out.mp4 -frames:v 1 frame_$t.png; done
```
Then look at the frames and listen to the audio before calling it done.

## Gotchas (these cost real time the first build)

- **Empty clips don't paint.** A top-level `clip` div with only a CSS background (e.g. a full-screen wipe or a grain/vignette overlay) will *not* render its own background in the capture pipeline. Put the painted layer as a **child** element of the clip (the grain/vignette do this). This is why the S2→S3 transition is a **scene push**, not a moving full-screen panel.
- **The Studio compiles/embeds assets.** Overwriting an asset *in place* (same filename) won't refresh the preview, because the old one is baked into the compiled bundle. **Version the filename** (e.g. `bgm.wav` → `bgm-v2.wav`) and update the `src`, or restart `npx hyperframes preview`, to bust it.
- **WebGL must be seek-safe.** The renderer captures by seeking the GSAP timeline, so the Three.js logo is driven from a GSAP proxy with `renderer.render()` called in `onUpdate` — never a `requestAnimationFrame` clock. Keep `preserveDrawingBuffer: true`.
- **Metal needs an environment.** `metalness: 1.0` materials render near-black under lights alone — the CanvasTexture studio-gradient set as `scene.environment` is what makes them read as metal. Don't remove it.
- **`inspect` can time out** on this composition (SVG RGB-shift filter + WebGL is heavy to load headless). That's not a structural failure — rely on `lint` + `validate`, and verify visually with extracted frames.
- **Mark intentional overflow/occlusion.** Off-screen entrances/exits (letters sliding off, cubes past the edge), the dynamic count-up width, and the transition seam covering the heading all need `data-layout-allow-overflow` / `data-layout-allow-occlusion` so the layout audit stays clean.
- **Renders are slower with the FX on** (the SVG chromatic filter adds time). Normal.

## Fonts

Inter is the shipped look (built into HyperFrames). The brand's display/numeric faces are **ABC Diatype** and **Berkeley Mono** — if you obtain those `.woff2`, drop them in a `fonts/` dir, add `@font-face`, and switch the `font-family`; otherwise Inter is the intended fallback.

## Output

1920×1080 @ 30fps MP4 (H.264). For social verticals, reflow to 1080×1920 — don't just squash the 16:9.
