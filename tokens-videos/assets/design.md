# design.md — Tokens

> Design system specification for **Tokens** (tokens.xyz), authored in Google's `design.md` framework.
> Values are reverse-engineered from the live site's design tokens (Next.js / Geist-derived token layer) and grounded in the shipped CSS. **Light mode is the canonical default; dark mode is the secondary theme.**

---

## 1. Overview

| Field | Value |
|-------|-------|
| **Product** | Tokens — Solana Liquidity & Token Aggregator |
| **Tagline** | Aggregate liquidity and token data across Solana DEXs |
| **Category** | On-chain trading terminal / market-data product |
| **Primary surface** | Web app (desktop-first, data-dense) |
| **Default theme** | Light (`#FFFFFF` canvas, `theme-color #FFFFFF`) |
| **Audience** | Solana traders, on-chain analysts, DeFi power users |
| **Aesthetic** | Minimal monochrome terminal + Solana neon accent. Bright, low-chrome, high information density, fast. |

---

## 2. Brand Personality

Tokens reads as a **precision instrument**, not a consumer app. The visual language is the Vercel/Geist school — a clean white canvas, restrained neutral grays, hairline borders, monospaced numerics — punctuated by the **Solana brand spectrum** used surgically for state, charts, and emphasis.

**Principles**
1. **Data first, chrome last.** Color and weight are reserved for meaning (price direction, status, charts). Surfaces stay quiet so numbers lead.
2. **Monochrome base, neon signal.** The interface is grayscale until something *matters* — then Solana mint/cyan/purple or semantic red/green appears.
3. **Terminal density.** Small base type (12–14px), tight 4px grid, compact controls. Built for scanning, not scrolling.
4. **Trustworthy & fast.** No decorative gradients-on-white, no playful rounding. Hairline borders, subtle glass, deterministic motion.

**Voice & tone:** Direct, quantitative, confident. Labels are nouns and verbs ("Trending", "Markets", "Token list", "Notifications"). No marketing fluff in-product.

---

## 3. Color

Tokens uses a **two-theme token model**: every role resolves to a light value (default) and a dark value. Neutrals follow a 14-step Geist-style ramp; accents are the Solana palette; status uses a 4-channel semantic set.

### 3.1 Core roles

| Role | Light (default) | Dark | Usage |
|------|------|-------|-------|
| `background` | `#FFFFFF` | `#0A0A0A` | App canvas |
| `foreground` | `#0A0A0A` | `#FAFAFA` | Primary text/icons |
| `primary` | `#171717` | `#E5E5E5` | Primary button fill (inverts vs canvas) |
| `primary-foreground` | `#FAFAFA` | `#171717` | Text on primary |
| `accent` | `#F5F5F5` | `#262626` | Hover/selected surface tint |
| `border` | `#E5E5E5` | `rgba(255,255,255,.10)` | Default hairline border |
| `ring` | `#737373` | `#A1A1A1` | Focus ring |
| `theme-color` | `#FFFFFF` | `#1C1C1D` | Browser chrome |

### 3.2 Neutral ramp (Geist-style, 14 steps)

Light-mode values (ascending = background → foreground). Low steps are surface tints; high steps are text.

| Token | Light | Token | Light |
|-------|------|-------|------|
| `gray-50` | `#F5F5F8` | `gray-800` | `#7A7783` |
| `gray-100` | `#E7E7ED` | `gray-900` | `#67656F` |
| `gray-200` | `#DAD8E1` | `gray-1000` | `#55545B` |
| `gray-300` | `#CCC9D5` | `gray-1100` | `#434247` |
| `gray-400` | `#BDB9C7` | `gray-1200` | `#313033` |
| `gray-500` | `#ADA9B7` | `gray-1300` | `#1F1F21` |
| `gray-600` | `#9D99A7` | `gray-1400` | `#0E0E0F` |
| `gray-700` | `#8C8795` | | |

> The ramp is **contrast-symmetric**: each step is defined by its contrast against the canvas, so the dark-mode value of `gray-N` equals the light-mode value of `gray-(1500−N)`. Dark mode therefore inverts the same hues — `gray-50 #000000` … `gray-1400 #E7E7ED`. The mid grays carry a faint warm-violet cast (`#8C8795`, `#ADA9B7`) rather than pure neutral.

### 3.3 Text & border tiers (alpha-derived)

| Token | Definition | Use |
|-------|------------|-----|
| `text-high` | foreground @ **88%** | Headings, primary values |
| `text-low` | foreground @ **58%** | Labels, secondary metadata |
| `border-extra-light` | foreground @ 4% | Internal dividers |
| `border-light` | foreground @ 12% | Card / row borders |
| `border-medium` | foreground @ 20% | Inputs, emphasis |
| `border-strong` | foreground @ 48% | Active / focused outlines |

### 3.4 Brand accent — Solana spectrum

Reserved for emphasis, brand moments, links, and chart series. Never used for large fills.

| Token | Hex | Note |
|-------|-----|------|
| `solana-green` | `#14F195` | Primary brand mint — CTAs, highlights, "up" energy |
| `solana-teal` | `#00FFA3` | Secondary mint/teal |
| `solana-cyan` | `#03E1FF` | Cool accent / gradient stop |
| `solana-purple` | `#AC4BFF` | Warm accent / gradient stop |

> Brand gradient: `solana-purple → solana-cyan → solana-green` (the canonical Solana sweep), used sparingly in hero/marketing and shimmer effects. On a white canvas, pair neon accents with sufficient surrounding neutral so they don't vibrate.

### 3.5 Market state (price direction)

Critical for a trading UI — applied to numbers, tickers, candles, deltas.

| State | Light (default) | Dark |
|-------|------|-------|
| **Up / positive** | `#009588` / `#00884C` | `#00BB7F` → `#05DF72` |
| **Down / negative** | `#B54B3F` | `#FF2357` |

### 3.6 Semantic status (badges)

Each channel ships `bg / dot / text`, per theme. Light-mode shown.

| Status | Dot (light) | Text (light) | BG (light) |
|--------|-----------|-------------|-----------|
| **Success** | `#00884C` | `#00572F` | `#D9FAE3` |
| **Danger** | `#B54B3F` | `#742F26` | `#FFE9E5` |
| **Info** | `#1F74BF` | `#124A7B` | `#E2F2FF` |
| **Warning** | `#936A00` | `#5E4300` | `#FFEECD` |

### 3.7 Chart series

| Series | Light (default) | Dark |
|--------|------|-------|
| `chart-1` | `#F05100` (orange) | `#1447E6` (blue) |
| `chart-2` | `#009588` (teal) | `#00BB7F` (green) |
| `chart-3` | `#104E64` (deep teal) | `#F99C00` (amber) |
| `chart-4` | `#AC4BFF` (purple) | `#FCBB00` (gold) |
| `chart-5` | `#F99C00` (amber) | `#FF2357` (red) |

---

## 4. Typography

A three-typeface system: an expressive grotesque for display, a neutral variable for UI text, and a monospace for all numerics and on-chain data.

| Role | Family | Stack | Use |
|------|--------|-------|-----|
| **Display** | **ABC Diatype** | `var(--font-abc-diatype), system-ui, sans-serif` | Headings, page titles, brand moments |
| **UI / Body** | **Inter Variable** | `"Inter Variable", Inter, system-ui, sans-serif` | All interface text, body, labels |
| **Mono / Data** | **Berkeley Mono** | `var(--font-berkeley-mono), ui-monospace, SFMono-Regular, Menlo, monospace` | Prices, balances, addresses, %, code |

**Weights:** `400` normal · `500` medium · `600` semibold · `700` bold.
Medium (500) is the workhorse UI weight; semibold for emphasis; bold for display only.

**Type scale** (data-dense — small base):

| Token | Size | Use |
|-------|------|-----|
| `body-sm` | **12px** | Badges, dense table cells, metadata |
| `body-md` | **14px** | Default body / UI text |
| `body-lg` | **16px** | Lead paragraphs, prominent values |

> Numerics should use **Berkeley Mono with tabular figures** so columns of prices align. Reserve ABC Diatype for type that is meant to be *read as a headline*, not scanned as data.

---

## 5. Spacing & Layout

- **Base unit:** `0.25rem` (**4px**) — a strict 4pt grid.
- **Scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 …
- **Layout model:** multi-pane trading terminal — persistent left **Main navigation**, central **token list / market feed**, right-side **trending tickers / news**, top **notifications**. Panels are collapsible.
- **Density:** compact. Rows are tight; whitespace is structural, not decorative.

---

## 6. Shape & Elevation

**Radius**

| Token | Value | Use |
|-------|-------|-----|
| `radius` (base) | `0.625rem` (**10px**) | Buttons, inputs, cards |
| `radius-2xl` | `1rem` (16px) | Large panels, modals |
| `radius-3xl` | `1.5rem` (24px) | Feature containers |
| badge radius | `9999px` (full) | Pills, status badges, tickers |

**Elevation:** flat-first. Depth comes from **hairline borders + background tint shifts**, not drop shadows. On the light canvas, lean on `gray-50`/`gray-100` surface tints to separate panels. Overlays use **backdrop blur**:

| Token | Value |
|-------|-------|
| `blur-sm` | 8px |
| `blur-md` | 12px |
| `blur-xl` | 24px |
| `blur-2xl` | 40px |

---

## 7. Components

### Buttons
| Prop | sm | md | lg | xl |
|------|----|----|----|----|
| height | 28px | 36px | 40px | 48px |
| icon | 14px | 16px | 18px | 20px |
| gap | 4px | 6px | 8px | 10px |

- Default radius `10px`; focus ring `ring` color with `2px` offset.
- **Primary** = `primary` fill (`#171717`) / `primary-foreground` text (`#FAFAFA`) — high contrast, inverts vs the white canvas.
- **Accent/ghost** = transparent → `accent` (`#F5F5F5`) tint on hover.

### Badges / Pills
- Height `20px`, full radius, `body-sm (12px)` / weight `500`, padding-x `8px`.
- Dot indicator `5px`, gap `5px`. Variants: default, success, danger, info, warning (§3.6).

### Cards / Panels
- `background` surface, `border-light` hairline, `radius` 10–16px, no shadow.
- Hover/selected rows shift to `accent` (`#F5F5F5`).

### Data tables (token lists)
- Berkeley Mono tabular numerics; up/down colors from §3.5.
- `body-sm`/`body-md` rows, `text-low` headers, `border-extra-light` row dividers.

---

## 8. Motion

- **Deterministic & subtle.** `pulse` (2s, ease-in-out) for loading/live states; `spin` (1s linear) for spinners.
- **Shimmer:** a moving linear-gradient highlight for skeletons and brand text (tune the highlight darker than the base on the light canvas).
- Transitions in the **150–250ms** range; respect `prefers-reduced-motion`.
- Live market data should update with a brief color flash (up green / down red) rather than motion.

---

## 9. Iconography & Imagery

- **Icons:** single-weight line icons on a 24×24 viewBox, sized 14–20px to match button tiers. Monochrome (`foreground` / `text-low`); never emoji.
- **Token logos:** circular, sourced per-asset; framed with `border-light`.
- **Imagery:** minimal — the data *is* the imagery. Brand visuals lean on the Solana gradient, not photography.

---

## 10. Accessibility

- Maintain ≥ 4.5:1 contrast for body text (`text-high`/`text-low` are tuned for this on `#FFFFFF`).
- **Never encode price direction by color alone** — pair up/down color with sign (▲/▼ or +/−).
- Visible focus ring (`ring`, 2px offset) on all interactive elements; full keyboard nav for nav, lists, and feeds (matches existing `aria-label`s: "Main navigation", "Token list category", "Trending market tickers", "Notifications").
- Honor `prefers-color-scheme`; ship both themes (light canonical, dark secondary).

---

## 11. Token Quick Reference

```css
/* Canvas — light is canonical */
--background: #FFFFFF;        /* dark: #0A0A0A */
--foreground: #0A0A0A;        /* dark: #FAFAFA */
--theme-color: #FFFFFF;       /* dark: #1C1C1D */

/* Brand — Solana */
--solana-green:  #14F195;
--solana-teal:   #00FFA3;
--solana-cyan:   #03E1FF;
--solana-purple: #AC4BFF;

/* Market state (light) */
--up:   #009588;             /* dark: #00BB7F */
--down: #B54B3F;             /* dark: #FF2357 */

/* Type */
--font-display: var(--font-abc-diatype), system-ui, sans-serif;
--font-sans:    "Inter Variable", Inter, system-ui, sans-serif;
--font-mono:    var(--font-berkeley-mono), ui-monospace, monospace;

/* Shape */
--radius: 0.625rem;   /* 10px */
--spacing: 0.25rem;   /* 4px grid */
```
