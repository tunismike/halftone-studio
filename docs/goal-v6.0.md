# Goal v6.0 — Pattern screens (threshold-field engine)

## Why

Benchmarked against TheVectorLab's "Knockout Halftones" ($35, 21 patterns —
swatch sheet: https://thevectorlab.com/cdn/shop/files/PATTERN-SWATCHES-KNOCKOUT-HALFTONES_5000x.png
— reference only, do NOT commit their image to this public repo). Their product
is a static 4000px Photoshop template, yet its swatches look better than our
halftone in the shadows. The reason is structural, not polish: every one of
their patterns is a **threshold field** — a grayscale tile `T(x,y)` compared
per-pixel against image tone:

```
ink(x,y) = tone(x,y) < T(x,y)
```

That one comparison buys what our mark-stamping pipeline lacks: **continuous
structure through the whole tonal range**. A cosine dot field renders
highlights as dots, exactly a checkerboard at 50%, and shadows as clean round
*holes* — for free. Our `circle.ts` grows discs until overlap (tone-accurate
via `dot-coverage.ts`, but shadow structure is blob-merge, never the hole
phase). Threshold output is also inherently binary — the "no semi-transparent
pixels" knockout guarantee falls out structurally, and per-pixel comparison is
edge-preserving by construction.

v6.0 adds a **pattern-screen mode** that recreates all 21 of their patterns
parametrically — and vectorizes them, which their raster product cannot do.

## Architecture

New `ModeKind` variant:

```ts
{ kind: 'patternScreen';
  field: FieldKind;          // which threshold field
  cellSize: number;          // feature scale (px at processing res)
  angleDeg: number;
  warp: DomainWarp;          // applied to (x,y) BEFORE field eval
  shaping: { gamma: number; solidAt: number; dropAt: number; invert: boolean };
  softPreview: boolean;      // AA preview vs hard binary
}
```

**Field contract**: `field(x, y) → t ∈ [0,1)`, either analytic (pure function)
or a baked tile sampled with wraparound. **Every baked field must be
rank-equalized** (sort values, remap to uniform [0,1)) so a constant-tone
input at level `t` yields ink fraction ≈ `t`. This is THE quality detail —
their patterns look pro because their threshold maps have linear tonal
response. Bayer / void-and-cluster are equalized by construction; RD, Worley,
and fBm fields are not and must be remapped. Shared util:
`equalizeField(Float32Array) → Float32Array`.

**Domain warp**: `(x,y) → (x', y')` before field eval — sinusoidal + fBm terms,
same parameter shape as `screen/warp.ts` `WarpParams` (reuse `noise/value.ts`
fbm). Warping the *domain* of an analytic field is exact (no resampling loss).

### Field generators → their 21 patterns

| Generator | Source | Covers |
|---|---|---|
| `cosDot` — ½(cos u + cos v), rotated | new (~20 lines) | GRID, GRID ANGLE, GRID DOTS, GRID DOTS ANGLE (dots = shaping clamp that skips the hole phase), + warped: MESH WAVE, DOT MESH WAVE, DOT WAVE |
| `lineField` — \|frac(u)−½\|·2 at angle | new (~10 lines) | VERTICAL / HORIZONTAL LINES, ANGLE LINES 1–2, + warped: LINE WAVE ANGLE / VERTICAL / HORIZONTAL |
| `blueNoiseField` | `noise/blue-noise-mask.ts` (exists) | GRAIN |
| `rdField` — Gray-Scott, worm + spot regimes, equalized | `screen/reaction-diffusion-screen.ts` (exists) | PETROGLYPH (worms), PEBBLES (spots) |
| `worleyField` — edge-distance (F2−F1), equalized | `noise/worley.ts` (exists) | PAVERS |
| `fbmField` — turbulence, equalized | `noise/value.ts` (exists) | PLASMA |
| `pointField` — Poisson-disc centers, per-point radial bump with jittered scale, field = max over bumps | `screen/poisson.ts` (exists) + new bump pass | POINTILLISM 1–2 |

21/21, from 2 new analytic functions + 1 warp operator + equalization over
generators we already ship.

### Output paths

1. **Soft preview / art PNG** — evaluate at superSample res, threshold,
   downsample. Antialiased, WYSIWYG in the existing preview canvas.
2. **Print PNG (knockout)** — threshold at 1× target res, alpha strictly
   {0, 255}, single ink color, transparent background. Zero semi-transparent
   pixels, ever. This also closes the v5-era gap in the raster stamper's
   transparent export.
3. **SVG** — threshold at superSample res → existing `trace/trace.ts`
   (`traceBinaryMask` + Douglas-Peucker + smoothing, even-odd winding for
   holes) or Potrace, same as mono trace mode. True vector with hole paths.
   Min-feature cull reuses the tracer's island removal.

## Scope (phases in order)

### P1 — Core engine + analytic fields
`engine/screen/pattern-field.ts`: field contract, `cosDot`, `lineField`,
shaping curve, `equalizeField`, threshold renderer (soft + hard). Wire
`patternScreen` into `pipeline.ts` / worker protocol / cache key. Presets:
GRID, GRID ANGLE, GRID DOTS, GRID DOTS ANGLE, VERTICAL LINES, HORIZONTAL
LINES, ANGLE LINES 1, ANGLE LINES 2 (8/21).

### P2 — Domain warp
Warp operator on field coordinates; wave/noise params in the mode UI. Presets:
MESH WAVE, DOT MESH WAVE, DOT WAVE, LINE WAVE ANGLE / VERTICAL / HORIZONTAL
(14/21).

### P3 — Baked fields
`blueNoiseField`, `rdField` (worm + spot param presets), `worleyField`,
`fbmField`, `pointField`, all rank-equalized and tiled. Presets: GRAIN,
PETROGLYPH, PEBBLES, PAVERS, PLASMA, POINTILLISM 1, POINTILLISM 2 (21/21).

### P4 — Export + UI + parity check
Hard-alpha print PNG export; SVG trace path with min-feature (px) control;
"Pattern screen" mode panel; the 21 presets in the gallery under a "Knockout"
collection. **Acceptance fixture**: render a linear horizontal gradient ramp
through every preset (their swatches are exactly that) and eyeball
side-by-side against the swatch sheet.

### P5 — Physical units (print-facing)
Optional `dpi` + output inches on the doc; pattern `lpi` with
`cellSize = superSampledDpi / lpi` (their spec: 25/35/45 LPI @ 22.5°, up to
14×19" @ 300 DPI); min-feature expressible in mm. Export dialogs show physical
size. Applies to pattern-screen exports first; other modes can adopt later.

## Non-goals

- No Photoshop/Affinity template import, no reading their assets — clean-room
  from the visual taxonomy only.
- Single-ink first. Multi-ink pattern screens (per-channel field/angle for
  spot/CMYK) are a natural follow-up, not v6.0.
- No changes to existing mark-based halftone modes (the hole-phase upgrade for
  classic grid halftone can later be "circle mark → cosDot pattern screen"
  preset migration, not a rewrite).

## Tests

- **Tonal linearity** (the money test): constant-tone patch at t ∈ {0.1 … 0.9}
  through every field → measured ink fraction within ±2% of t. Guarantees
  equalization is right; this is what makes ours "as good as theirs".
- `cosDot` at t=0.5 is a checkerboard; t=0.15 yields disconnected holes
  (hole-phase exists); t=0.85 disconnected dots.
- Hard PNG: every pixel alpha ∈ {0, 255}; ink pixels all exactly the ink color.
- SVG/raster parity: rasterized SVG vs hard binary ≥99% pixel agreement.
- Warp determinism: same seed/params → identical field (cache-key safe).
