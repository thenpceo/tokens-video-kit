# Breaking ATH — 1:1 square

Square (1080×1080) cut of `breaking-ath` for Instagram/feed posts, **~11.5s**. A tightened **3-scene** version:

1. 3D logo + headline,
2. chart + counting stat — the stat is **centered**, and its label reads **"Tokenized Equities Volume"** on one line,
3. logo + wordmark outro.

The separate "Tokenized Equities" cubes scene from the 16:9 master is **removed** in this cut and folded into scene 2's label. Everything else — copy, the variable schema, assets, audio, FX — matches the landscape version, reflowed and retimed for a square frame.

> The `cube1…7` and `scene3_heading` variables don't apply here (no cubes scene). All other variables work as in `../breaking-ath`.

Render:

```bash
cp -r breaking-ath-square my-video && cd my-video
npx hyperframes render --variables '{"stat_value":250,"stat_label":"Tokenized Equities Volume"}' --output my-video-square.mp4
```

For a 9:16 vertical, copy this and reflow similarly (it's the same edits — dimensions + a bit more vertical breathing room).
