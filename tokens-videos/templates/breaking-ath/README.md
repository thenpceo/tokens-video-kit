# Breaking ATH — template

A ~14s Tokens announcement video. Self-contained HyperFrames project.

**Scenes:** (1) 3D metallic Tokens mark spins in behind a `BREAKING:` headline → (2) a chart draws while a stat counts up → (3) `Tokenized Equities` heading over a conveyor of token cubes → (4) `tokens.xyz` logo lockup with a sheen. Full audio bed + SFX + grade included.

## Quick start

```bash
cp -r breaking-ath my-video && cd my-video
npx hyperframes preview        # watch it
npx hyperframes render --output my-video.mp4
```

## Retheme without editing code

```bash
npx hyperframes render --variables '{
  "breaking_line1": "BREAKING:",
  "breaking_line2": "NEW RECORD HIGH",
  "stat_prefix": "$", "stat_value": 250, "stat_suffix": "M",
  "stat_label": "Volume",
  "scene3_heading": "Tokenized Equities"
}' --output my-video.mp4
```

Variables: `breaking_line1`, `breaking_line2`, `stat_prefix`, `stat_value` (counts up to this number), `stat_suffix`, `stat_label`, `scene3_heading`, `cube1`…`cube7` (token-logo paths), `music` (bed path). Full schema in `../../references/templates.md`.

## Swap assets

- **Token cubes:** replace `assets/cube1.svg … cube7.svg` (keep the isometric cube style) or override the `cubeN` variables.
- **Music:** replace `assets/bgm.wav` (a generic synthesized bed ships as the default) or set the `music` variable. See `../../references/audio.md` — confirm licensing/attribution before publishing.

## Notes
- The scene-3 conveyor is intentionally offset left (`--ox:-1005px`) — keep it.
- Uses Three.js (WebGL) + an SVG chromatic filter, so `inspect` may be slow; rely on `lint`/`validate` and verify with extracted frames.
- Keep copy short (display text doesn't wrap).
