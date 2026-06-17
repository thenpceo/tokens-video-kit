# Tokens — Video Brand System

The rules that make a video read as *Tokens*. This adapts the product design system ([../assets/design.md](../assets/design.md)) for motion. When composing a new piece (Path B), follow this; when rethemeing a template (Path A), you mostly inherit it for free.

## 1. Canvas & theme

- **Light, always.** Background is white with a faint top radial: `radial-gradient(120% 120% at 50% 0%, #ffffff 60%, #f5f5f8 100%)`. Dark mode is off-brand for video.
- 1920×1080, 30fps. (A 1080×1920 vertical cut is fine but reflow, don't squash.)

## 2. Color

| Role | Value |
|------|-------|
| Canvas | `#FFFFFF` → `#F5F5F8` radial |
| Headline text | `#323236` |
| Secondary text | `#5A5A62` |
| Muted/label | `#67656F` |
| Brand mint (accent/seam) | `#14F195`, deepening to `#0BBF7A` |
| Chart stroke gradient | `#42A87D` → `#9EE4C6` (diagonal) |
| Chart area fill | `#42A87D` @ 34% → transparent |
| Up / positive | `#00BB7F` |
| Down / negative | `#FF2357` |

Solana spectrum (`#14F195` mint, `#00FFA3` teal, `#03E1FF` cyan, `#AC4BFF` purple) is the accent family — use mint/green as the default; cyan/purple only for charts or special accents.

## 3. Typography

- **Family:** Inter (the brand also uses ABC Diatype for display + Berkeley Mono for numerics — if you have those `.woff2`, prefer them; otherwise Inter is the shipped fallback and looks right).
- **Weight:** semibold (600) for display; medium (500) for small labels.
- **Tracking:** **-9px** on all display copy (headlines, the stat, the section heading). This tight tracking is a signature — don't leave it at default. Small uppercase labels stay near-normal (≈0.12em) so they don't crush.
- **Numerics:** `font-variant-numeric: tabular-nums` on any counting number so columns don't jitter.
- Headlines `#323236`; the secondary line a step lighter (`#5A5A62`).

## 4. The 3D logo (signature element)

The Tokens mark is **four thick metallic disks in a diamond**, rendered live in Three.js — never a flat PNG. It sits as a translucent background element with a left→right opacity gradient.

Reuse the exact setup from `templates/breaking-ath/index.html` (the `THREE.JS` block). Key parameters:
- 4 × `CylinderGeometry(1,1,0.40,72)`, each rotated `x = π/2` (faces to camera), placed at `(±1.02, ±1.02)`.
- **Split materials** so the curved rim reads lighter than the faces: faces `#9A9AA2`, rim `#F2F2F5` + small emissive; both `metalness 1.0`. Material array order is `[rim, topCap, bottomCap]`.
- Lit by a bright key + fill + two grazing side-lights, plus a CanvasTexture studio-gradient environment (this is what makes the metal read — pure lights alone look black on metal).
- Resting pose: `rotation z = π/4` (stands on a corner), `x ≈ -0.61`, `y ≈ -0.175`.
- Opacity gradient via CSS mask: `linear-gradient(to right, rgba(0,0,0,0.15), rgba(0,0,0,0.40))`.
- Deterministic render: drive rotation from a GSAP proxy and call `renderer.render` in `onUpdate` (no rAF clock) so it's seek-safe. Use `preserveDrawingBuffer: true`.
- Entrance: spins ~1.1 turns + scales up from ~45% on `power3.out` over ~1.3s, then a slow idle drift, then spins out on exit.

The flat `logo.svg` mark and `wordmark.svg` are used directly in the outro lockup.

## 5. Motion language

- **Entrances, not arrivals.** Every element animates in. Letters split into spans and stagger in (from the right in scene 1; up one-at-a-time elsewhere). Offset the first beat slightly (≈0.15s), don't start at t=0.
- **Vary eases.** Mix `power3.out` / `power2.out` / `back.out` for entrances; `power2.in` / `power3.in` for exits. At least a few different eases per scene.
- **Push transition.** Scene-to-scene uses a vertical push: outgoing scene slides up (`yPercent:-100`), incoming rises from below (`yPercent:100→0`), led by a **mint seam** bar that fades once it's done. (A full-screen overlay wipe does NOT paint reliably in HyperFrames — see build-and-render.md. Animate the scenes themselves.)
- **Motion blur** on the fastest exits: add `filter:"blur(7–8px)"` to the exit tween for letters and cubes.
- **Count-ups** for stats: animate a proxy and write `textContent` in `onUpdate`; pair with a slot-tick SFX and an impact punch (quick `scale:1.06` yoyo) when it lands.
- Pace is brisk: scenes ~2.8–3.9s, total ~14s. Tighten gaps so the next scene's content enters as the previous one leaves — avoid empty white holds.

## 6. Audio (part of the brand)

A video without sound is half-done. Every piece gets a music bed + the SFX kit, mixed so SFX sit on top. Full recipes and levels in [audio.md](audio.md). The signature cues:
- transition **whooshes**, a **cinematic riser** under the chart draw, a **slot-machine tick** on the count-up, a **thump** when the stat lands, **typing** on the wordmark, a **soft whoosh** on the logo swirl-in, and a quiet **sheen** on the outro glint — its peak aligned to the visual glint, not the file start.

## 7. Postprocessing grade

Applied across the piece for a premium finish:
- **Film grain** (subtle, `mix-blend: multiply`, ~5%) + **vignette** (soft edge darkening). Put the painted layers as *children* of a clip (empty clips don't paint).
- **Chromatic RGB-shift** on the cuts — an animated SVG channel-split filter toggled onto the scenes during transitions (spike ~9–12px, resolve).
- **Green bloom** — `drop-shadow` glow on the chart line + leading dot. (Bloom is subtle on white; it's an accent, not a showpiece.)

## Do / Don't

**Do:** light canvas; Inter semibold with -9px tracking; the 3D metallic mark; mint-green accents; push transitions with a seam; count-up stats; full audio + grade; tight pacing.

**Don't:** dark backgrounds; pure black `#000` text; Roboto/Arial/system defaults; a flat 2D logo where the 3D mark belongs; default (loose) letter-spacing on display type; silent exports; jump cuts between scenes; long empty white holds.
