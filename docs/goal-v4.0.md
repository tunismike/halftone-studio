# Halftone Studio v4.0 — Layers, Selections & Raster→SVG

## Context

Today the pipeline applies ONE treatment to the whole image and only the vector
modes can export SVG. v4.0 turns Halftone Studio into a **decompose-and-vectorize**
tool: split an image into selectable regions, give each region its own
halftone/dither/texture treatment, mix them in one composition, and trace any
region to clean, editable vector paths. The LLM stays the art director (Trace
Recipe) — deterministic geometry does the rendering and the vectorizing. No AI
model is required for v4.0; AI segmentation is a deferred optional layer.

Builds on what exists: marching squares (RD-contour), palette extraction
(median-cut + k-means), Mask Mode (single-region restriction), multi-group SVG
export (CMYK/spot), and the dock UI.

## Scope (phases in order)

### 1. Layer model + compositor (engine)
- New `Layer` = `{ id, name, region, treatment, enabled, blendMode, opacity }`.
  - `region`: `all | toneBand(min,max) | colorRegion(paletteIdx) | mask(id) | selection(id)`.
  - `treatment`: a full `ModeKind` + its `adjust`/`preprocess`/`textureOverlay`.
- `LayeredComposition` = ordered `Layer[]` over a background.
- Compositor: render each layer's treatment, clip to its region mask, composite
  (over / multiply / screen) into one output. Per-layer single-slot cache so an
  edit to one layer doesn't recompute the others.
- Backward compatible: a plain single-mode doc is just a one-layer composition.

### 2. Auto-selection generators
- **Tone bands** — split luminance into N bands → N region masks (shadows /
  mids / highlights at N=3).
- **Color regions** — quantize (median-cut) into N colors → one mask per color.
- "Generate layers from image" builds a starter stack (e.g. 3 tone-band layers
  or N color-region layers), each editable independently.

### 3. Homegrown raster→SVG tracer
- `traceMask(binaryMask) → contours` via marching squares at full resolution.
- **Douglas-Peucker** polyline simplification (tolerance slider).
- Corner detection + **bézier/Catmull-Rom smoothing** → smooth `path d`.
- Island removal (min-area cull) + hole handling (even-odd winding).
- Per-color-region trace → grouped `<path fill>` per region (stacked SVG).
- New "Vector trace" treatment + a tracer settings panel (colors, smoothing,
  min feature size, simplify tolerance).

### 4. Per-layer treatment (mixed styles)
- Each layer's treatment is a full `ModeKind` — so one layer can be grid
  halftone, another blue-noise stipple, another a traced flat-color fill,
  another a texture-only overlay.
- The Layers panel selects the active layer and edits its treatment with the
  existing control components (reused via the `view` prop).

### 5. Interactive selection tools
- **Magic-wand**: click a pixel → flood-fill by color/tone tolerance → region mask.
- **Lasso / marquee**: draw on a canvas overlay → region mask.
- "Make layer from selection" turns any selection into a layer.
- A separate 2D overlay canvas above the worker-controlled OffscreenCanvas hosts
  marching-ants + selection drawing (render pipeline stays decoupled).

### 6. Layers UI (new dock tool) + export
- "Layers" dock tool: reorderable list (dnd-kit), per-layer enable / rename /
  region picker / treatment editor / blend + opacity.
- Export: composite PNG + grouped SVG (named `<g>` per layer; traced paths where
  the layer is a vector trace, mark geometry where it's a halftone).

### 7. Trace Recipe (Tier 2) + presets
- Extend the recipe validator: multi-layer recipes map to the layer model
  (the envelope already supports `layers[]`).
- Demo presets, e.g. "Poster: traced subject + halftone background",
  "Tri-tone screenprint: 3 traced color plates".

## Non-goals
- AI subject segmentation (deferred optional layer; heuristics first).
- In-app LLM API calls (paste flow stands), batch render, video, PSD export.

## Performance
- Per-layer single-slot cache; unchanged layers don't re-render.
- Tracing runs in the worker; selection overlay is decoupled from the pipeline.
- Live slider response ≤50 ms p50 for single-layer edits; full multi-layer
  recompute bounded by the existing sample/mark clamps.

## Definition of done
- Can build a multi-layer composition: e.g. traced flat subject + halftone
  background + textured midtones, composited in one preview.
- Auto "generate layers" from tone bands and from color regions.
- Magic-wand + lasso selections become layers.
- Any region traces to editable smooth vector paths; grouped SVG export with
  named layers round-trips.
- Single-mode docs still work unchanged (one-layer path).
- TypeScript build + tests green; verified in-browser.
