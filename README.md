# Halftone Studio

Browser-based vector halftone, dithering, and screen-print texture tool. React + Vite + TypeScript, with an OffscreenCanvas Web Worker pipeline and layered caching.

**Live app: https://tunismike.github.io/halftone-studio/** — installable PWA, works offline, autosaves your project locally.

## Features

- **Modes**: dither/threshold, vector halftone, CMYK separation, spot/duotone, palette dither, tonal (1–5 inks), RD-contour strokes
- **Screens**: grid, hex, radial, Poisson/blue-noise, reaction-diffusion
- **Marks**: circle, square, diamond, line, blob, flow, custom SVG glyph — with bleed, corner-rounding, fixed-radius (stipple), and distress modifiers
- **Dithering**: Floyd-Steinberg, JJN, Stucki, Burkes, Sierra family, Atkinson, plus Bi-Thread kernels (Stevenson-Arce, Shiau-Fan, Pigeon); Riemersma/Hilbert; ordered (Bayer + void-and-cluster blue noise)
- **Color**: 25+ built-in palettes (NES, Game Boy, C64, etc.), palette import from any image (median-cut + k-means), 4 color-distance metrics
- **Preprocessing**: blur, sharpen (unsharp mask), denoise/noise, levels (black/white point + gamma)
- **Textures**: procedural recipes (Worley/Voronoi cracks, cellular speckle, binarized noise, anisotropic fabric) plus user uploads persisted to IndexedDB
- **Mask mode**: restrict the halftone to regions of an uploaded mask
- **Output**: PNG, editable/compact/production SVG, per-channel ZIP bundle
- **Performance**: Web Worker + OffscreenCanvas, single-slot layered cache, Path2D batching, sample-count clamp, lazy thumbnail rendering, palette LUT
- **100+ presets** with searchable gallery, custom save/load, URL-hash state sharing

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm run typecheck  # tsc -b --noEmit
npm run build      # tsc -b && vite build
```

## Layout

- `src/engine/` — pure pipeline: screens, marks, dithering, color, textures, masks
- `src/worker/` — Web Worker host + client + message protocol
- `src/ui/` — React app, controls, canvas preview, preset gallery
- `src/presets/` — built-in preset definitions
- `docs/` — palette reference, goal spec
