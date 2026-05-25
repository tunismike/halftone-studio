# Halftone Studio v3.0 — Dithertone Pro Parity + Texture Quality Pass

## Context

We've matched Dithertone Pro on dither algorithms, palettes, screens, color separation, and live preview, and we exceed them on RD/contour/vector/mark variety. This goal closes the remaining real gaps (preprocessing, tonal mapping, palette import, advanced mark controls, Bi-Thread algorithm class, DPI mode, mask mode) and reworks the texture system to deliver actual scanned-quality output.

## Scope

### 1. Preprocessing pipeline (matches "Effect Controls")

New stage in pipeline, runs after source decode and before mode rendering. Cached as one stage keyed by all params.

- **Blur** — Gaussian, radius 0–10 px
- **Sharpen** — unsharp mask with separate Strength (0–200%) and Radius (0.5–10 px) sliders
- **Denoise / Noise** — bipolar slider (−100 to +100). Negative = bilateral filter (edge-preserving denoise). Positive = additive monochrome film grain.
- **Levels** — dual-handle slider (black point + white point), 0–255 each, with optional gamma midpoint
- All controls live-update via worker; cached stage so unchanged params don't recompute

### 2. Tonal Controls panel (matches their "Tonal Controls")

- **Tonal Mapping** picker: 1 / 2 / 3 / 4 / 5 colors. Posterizes source into N luminance bands before dithering.
- **Zone color editor** — color slot per band. For 3-color: Highlights / Midtones / Shadows. For 2-color: Highlight / Shadow (duotone). For 1-color: ink color only.
- **Background color** picker with: solid color / transparent / checkerboard preview
- New mode kind: `tonal` (alongside `vector`, `raster`, `cmyk`, etc.) that uses the zone editor as palette and renders dither against background color

### 3. Palette import from any image (matches "palette import tool")

- "Import palette from image" button next to palette dropdown
- Upload → extract N dominant colors via median-cut (default) with k-means refinement option
- User picks color count (2–64)
- Save as named custom palette → appears in palette dropdown alongside built-ins
- Persisted to localStorage

### 4. Advanced mark controls (matches "2X Sampler" + "Bleed & Rounding")

- **2× Sampler** — render vector marks at 2× resolution then downsample with box filter for anti-aliased edges. Toggle on/off; tradeoff is render time.
- **Bleed** — formalize existing `mark.gain` as a Bleed slider (0–50%, expands dot size for ink-spread simulation)
- **Corner Rounding** — radius slider for square/diamond/rect marks (0 to mark size / 2)
- All exposed as ControlsPanel knobs under Mark section

### 5. Bi-Thread algorithm category

Investigate Dithertone Pro's Bi-Thread category, then implement plausible candidates:

- **Ostromoukhov variable-coefficient ED** — per-tone optimized kernel (already roughed-in, finish properly)
- **Knuth dot diffusion** — block-based diffusion, very different character from raster ED
- **Stevenson-Arce** — large radius kernel, distinctive coarser grain
- **Shiau-Fan** — fewer taps, sharper edges
- **Pigeon** — weighted hybrid
- Group under new "Bi-Thread" category in algorithm picker alongside Modulation (ordered) and Diffusion (error-diffusion)

### 6. DPI-based input mode + resampling picker

- Add **DPI** input field to top-level settings. When DPI mode is on, cell size derives from DPI × paper width.
- Toggle: Pixel mode (current) ↔ Print mode (DPI-based)
- **Resampling** dropdown for source resize: Nearest Neighbor / Bilinear / Bicubic / Lanczos
- Apply during source decode stage

### 7. Texture system rework

**7a. User uploads** — drag-drop file picker, store as ImageBitmap in IndexedDB, mirror-pad to fix non-tileable scans, show in texture chip grid alongside bundled

**7b. Procedural recipe rework** — replace the 7 weak recipes with ~10 dramatically better ones:

- **Voronoi cellular cracks** (matches Plastisol 2 / Gatorskin) — Worley F1+F2 with hard threshold
- **Cellular speckle** (matches Big Apple / Beatgrit) — thresholded Worley F1 noise
- **Hard-threshold multi-band noise** (matches Riffraff / Photo Dots) — 4-octave FBM with extreme contrast
- **Anisotropic fabric weave** (matches Linen / Denim / Fiberglass) — directional noise + thread modulation
- **Crack-network simulation** (matches Plastisol 2) — random Voronoi edge traversal with width variation
- **Stroke rasterization** (matches Scratchboard / brush textures) — proper Bresenham strokes with broken segments and width variation
- **Warped halftone** (matches ThrashTones) — halftone dots displaced by sine-warped UVs
- **High-contrast paint scuff** (matches Iceberg / Grindstone) — Gray-Scott + threshold at 0.5

**7c. Per-texture controls** — Contrast and Threshold sliders so user can dial intensity live

### 8. Mask Mode (closes "Mask Mode" + "Text Mode")

- Upload a mask image (grayscale or RGBA)
- Halftone renders only where mask is white; source pixels pass through unchanged where mask is black
- Optional invert toggle
- Mask scales to source dimensions automatically

### 9. Preset additions

Add ≥15 new presets that demonstrate the new features:

- 5 tritone presets (Highlights/Midtones/Shadows variations on portraits)
- 3 imported-palette presets (referencing common artistic palettes)
- 4 Bi-Thread algorithm showcases
- 3 advanced texture combos using the new procedural recipes

## Non-goals

- **PSD export** — we stay SVG/PNG. Different distribution channel; not worth the writer.
- **Batch render across multiple inputs** — single-image focus stands.
- **Animation / video frame support** — out of scope for v3.0.
- **Photoshop plugin integration** — we stay web.

## Performance budget

- Live slider response under 50 ms p50, 120 ms p95 (worker offload + cache)
- Preprocessing pipeline must cache cleanly: changing Levels alone shouldn't invalidate Sharpen output
- 2× Sampler limited to preview (export always uses full quality)
- Palette LUT recomputes on import; cached after

## Definition of done

- All 9 sections implemented with UI controls visible in ControlsPanel
- New mode kinds (`tonal`) and stages (`preprocess`, `mask`) round-trip through preset save/load and URL hash
- ≥15 new presets shipped
- Texture overlay output looks like reference packs (subjective check vs Texture Machine / Plastisol 2 / ThrashTones screenshots)
- All existing presets still render unchanged (regression check via thumbnail diff)
- TypeScript build passes, no console errors, lazy thumbnail render stays under 30 ms per tile
