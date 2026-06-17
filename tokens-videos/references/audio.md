# Audio

Sound is part of the Tokens brand — every video ships with a music bed plus a fixed SFX kit, mixed so the SFX sit clearly on top of the bed.

In HyperFrames, each cue is a separate `<audio>` element with `data-start`, `data-duration`, `data-track-index` (give each cue its own track so they never collide), and `data-volume`. See the audio block in `templates/breaking-ath/index.html` for exact placements.

## The SFX kit (bundled, royalty-free)

All in `assets/sfx/` — synthesized with FFmpeg, so they're ours to ship and reuse.

| File | Used for | Character |
|------|----------|-----------|
| `whoosh.wav` | scene transitions, cubes in/out | short pink-noise swish |
| `whoosh-soft.wav` | the logo swirl-in | gentle, airy |
| `riser-cine2.wav` | under the chart draw | **cinematic** noise build (brown rumble + rising air), ~2s |
| `slot.wav` | the stat count-up | decelerating slot-machine ticks |
| `thump.wav` | when the stat lands | low sub boom |
| `typing-v2.wav` | the `tokens.xyz` reveal | realistic key-clicks |
| `sparkle.wav` | the outro sheen/glint | quiet high shimmer |
| `chime.wav` | (alt) bell, currently unused | bright bell |

**Placement notes that matter:**
- The **riser** rides the green-line draw (≈2.5–4.5s), not the number.
- The **slot tick** decelerates to match the count-up's ease-out.
- The **sheen** (`sparkle`) is quiet (`volume ≈ 0.125`) and its start is timed so the audible peak lands when the glint crosses the logo — not at the file's start.
- The **logo swirl-in** uses the *soft* whoosh, not a bell/ding.

### Regenerating / making new SFX (FFmpeg)

These are the recipes used to synthesize the kit — adjust and re-run to taste.

```bash
# whoosh (transition)
ffmpeg -y -f lavfi -i "anoisesrc=d=0.6:c=pink:r=48000:a=0.6" \
  -af "highpass=f=350,lowpass=f=3500,afade=t=in:st=0:d=0.18,afade=t=out:st=0.33:d=0.27,volume=0.85,aformat=channel_layouts=stereo" whoosh.wav

# soft whoosh (logo)
ffmpeg -y -f lavfi -i "anoisesrc=d=0.9:c=pink:r=48000:a=0.4" \
  -af "highpass=f=500,lowpass=f=2600,afade=t=in:st=0:d=0.35,afade=t=out:st=0.5:d=0.4,volume=0.6,aformat=channel_layouts=stereo" whoosh-soft.wav

# cinematic riser (~2s): brown rumble + rising air + a little space
ffmpeg -y -f lavfi -i "anoisesrc=d=2.0:c=brown:r=48000:a=0.55" -f lavfi -i "anoisesrc=d=2.0:c=white:r=48000:a=0.32" \
  -filter_complex "[0:a]lowpass=f=320,afade=t=in:st=0:d=1.85:curve=exp[low];[1:a]highpass=f=2200,lowpass=f=9500,afade=t=in:st=0:d=1.92:curve=qua[hi];[low][hi]amix=inputs=2:duration=longest,aecho=0.8:0.7:60:0.3,afade=t=out:st=1.86:d=0.14,volume=1.15,aformat=channel_layouts=stereo[a]" -map "[a]" riser-cine2.wav

# thump (stat lands)
ffmpeg -y -f lavfi -i "aevalsrc='sin(2*PI*60*t)*exp(-7*t)':d=0.5:s=48000" \
  -af "volume=1.0,afade=t=out:st=0.4:d=0.1,aformat=channel_layouts=stereo" thump.wav

# sparkle (sheen)
ffmpeg -y -f lavfi -i "aevalsrc='(sin(2*PI*2200*t)+0.6*sin(2*PI*3300*t))*exp(-9*t)':d=0.6:s=48000" \
  -af "volume=0.5,aformat=channel_layouts=stereo" sparkle.wav
```

For the **typing** and **slot** kits (which are sequences of one click placed at many offsets), generate a single click and `amix` delayed copies — see the patterns in this skill's build history, or just reuse the bundled `typing-v2.wav` / `slot.wav`.

## Music bed

**Not bundled** (licensing). Templates ship a generic synthesized ambient `bgm.wav` as a safe default so they render out of the box. Replace it for anything you publish.

How to add a bed:
1. Get a track you have rights to. Good fit: **atmospheric / upbeat electronic with a light beat** (crypto-tech mood). Keep it *background-simple* — it sits under the SFX.
2. Trim ~14.2s to match the video, level it as a **bed** (`loudnorm I≈-17…-20`), light fade in + fade out, 48k stereo:
   ```bash
   ffmpeg -y -ss <START> -t 14.2 -i source.wav \
     -af "afade=t=in:st=0:d=0.4,afade=t=out:st=13.0:d=1.2,loudnorm=I=-17:TP=-1.5,aformat=channel_layouts=stereo" -ar 48000 assets/bgm.wav
   ```
   Pick `<START>` so the beat lands where you want it in the video (e.g. start ~1–2s before the first downbeat for a lead-in).
3. Point the template at it with the `music` variable, or just overwrite `assets/bgm.wav`.

> **Licensing:** if you pull from a "no-copyright"/royalty-free source, most still **require crediting the artist** and downloading from YouTube is against its ToS. Confirm the license and add attribution before publishing. Prefer libraries with clear commercial CC0 terms (e.g. Pixabay/Uppbeat) when possible.

## Mixing guidance

- Bed `volume ≈ 0.5`; transition whooshes `0.45–0.6`; riser `0.55`; thump `0.75`; slot `~0.58`; typing `0.3`; sheen `0.125`.
- If a real track is busier than the synth default, drop the bed to `~0.4` so SFX still read.
- Audio can't be checked by eye — after rendering, actually listen, and confirm `ffprobe` shows an `aac` stereo stream.
