# Browser Dither Engineering Brief

> Reference material gathered for the palette / dither expansion work.
> See `src/presets/builtin.ts` and (forthcoming) `src/engine/dither/*`,
> `src/engine/color/palette.ts`, `src/engine/color/quantize.ts`.

## Reference conventions

The palette array below uses hardware or emulator index order where that order is well-defined. For fixed digital palettes, I preferred machine-readable `.gpl` palette files from Aseprite's hardware-palettes repository because they expose exact RGB triples directly. For Game Boy Color, Pan Docs is the authoritative source for the actual hardware model: CGB does **not** have one single global fixed palette, but RGB555 palette RAM with 8 BG palettes and 8 OBJ palettes. For Atari ST, Atari's TOS source confirms that boot initializes a 16-entry default palette at `$FFFF8240`, but I did not recover a high-confidence machine-readable RGB list for the default low-resolution desktop palette in this pass, so I do not fabricate one here. Composite and artifact-color systems remain display-dependent by nature, so the `notes` fields explicitly name the chosen reference set.

```js
[
  {
    name: "Game Boy DMG",
    systemFamily: "handheld",
    colors: ["#9bbc0f", "#8bac0f", "#306230", "#0f380f"],
    source: "https://raw.githubusercontent.com/aseprite/aseprite/main/data/extensions/hardware-palettes/gameboy.gpl",
    notes: "Aseprite hardware-palette reference. Ordered in DMG shade index order 0→3, light-to-dark."
  },
  {
    name: "Game Boy Pocket",
    systemFamily: "handheld",
    colors: ["#ffffff", "#a9a9a9", "#545454", "#000000"],
    source: "https://en.wikipedia.org/wiki/List_of_video_game_console_palettes",
    notes: "Pure-gray reference set commonly used for GBP-style rendering."
  },
  {
    name: "Game Boy Color hardware palette model",
    systemFamily: "handheld",
    colors: [],
    source: "https://gbdev.io/pandocs/Palettes.html",
    notes: "No single canonical fixed RGB palette exists. CGB uses arbitrary RGB555 palette RAM, with 8 BG palettes and 8 OBJ palettes of 4 colors each."
  },
  {
    name: "NES / Famicom NTSC PPU palette",
    systemFamily: "console",
    colors: [
      "#7c7c7c", "#0000fc", "#0000bc", "#4428bc", "#940084", "#a80020", "#a81000", "#881400",
      "#503000", "#007800", "#006800", "#005800", "#004058", "#000000", "#000000", "#000000",
      "#bcbcbc", "#0078f8", "#0058f8", "#6844fc", "#d800cc", "#e40058", "#f83800", "#e45c10",
      "#ac7c00", "#00b800", "#00a800", "#00a844", "#008888", "#000000", "#000000", "#000000",
      "#f8f8f8", "#3cbcfc", "#6888fc", "#9878f8", "#f878f8", "#f85898", "#f87858", "#fca044",
      "#f8b800", "#b8f818", "#58d854", "#58f898", "#00e8d8", "#787878", "#000000", "#000000",
      "#fcfcfc", "#a4e4fc", "#b8b8f8", "#d8b8f8", "#f8b8f8", "#f8a4c0", "#f0d0b0", "#fce0a8",
      "#f8d878", "#d8f878", "#b8f8b8", "#b8f8d8", "#00fcfc", "#f8d8f8", "#000000", "#000000"
    ],
    source: "https://www.nesdev.org/wiki/PPU_palettes",
    notes: "Classic widely used emulator-style NTSC reference set. Exact RGB is decoder-dependent."
  },
  {
    name: "Master System",
    systemFamily: "console",
    colors: [
      "#000000", "#550000", "#aa0000", "#ff0000", "#005500", "#555500", "#aa5500", "#ff5500",
      "#00aa00", "#55aa00", "#aaaa00", "#ffaa00", "#00ff00", "#55ff00", "#aaff00", "#ffff00",
      "#000055", "#550055", "#aa0055", "#ff0055", "#005555", "#555555", "#aa5555", "#ff5555",
      "#00aa55", "#55aa55", "#aaaa55", "#ffaa55", "#00ff55", "#55ff55", "#aaff55", "#ffff55",
      "#0000aa", "#5500aa", "#aa00aa", "#ff00aa", "#0055aa", "#5555aa", "#aa55aa", "#ff55aa",
      "#00aaaa", "#55aaaa", "#aaaaaa", "#ffaaaa", "#00ffaa", "#55ffaa", "#aaffaa", "#ffffaa",
      "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#0055ff", "#5555ff", "#aa55ff", "#ff55ff",
      "#00aaff", "#55aaff", "#aaaaff", "#ffaaff", "#00ffff", "#55ffff", "#aaffff", "#ffffff"
    ],
    source: "aseprite/hardware-palettes master-system.gpl",
    notes: "Full 64-entry 2-bit-per-channel master palette in file order."
  },
  {
    name: "Atari 2600 NTSC",
    systemFamily: "console",
    colors: [
      "#000000", "#444400", "#702800", "#841800", "#880000", "#78005c", "#480078", "#140084",
      "#000088", "#00187c", "#002c5c", "#00402c", "#003c00", "#143800", "#2c3000", "#442800",
      "#404040", "#646410", "#844414", "#983418", "#9c2020", "#8c2074", "#602090", "#302098",
      "#1c209c", "#1c3890", "#1c4c78", "#1c5c48", "#205c20", "#345c1c", "#4c501c", "#644818",
      "#6c6c6c", "#848424", "#985c28", "#ac5030", "#b03c3c", "#a03c88", "#783ca4", "#4c3cac",
      "#3840b0", "#3854a8", "#386890", "#387c64", "#407c40", "#507c38", "#687034", "#846830",
      "#909090", "#a0a034", "#ac783c", "#c06848", "#c05858", "#b0589c", "#8c58b8", "#6858c0",
      "#505cc0", "#5070bc", "#5084ac", "#509c80", "#5c9c5c", "#6c9850", "#848c4c", "#a08444",
      "#b0b0b0", "#b8b840", "#bc8c4c", "#d0805c", "#d07070", "#c070b0", "#a070cc", "#7c70d0",
      "#6874d0", "#6888cc", "#689cc0", "#68b494", "#74b474", "#84b468", "#9ca864", "#b89c58",
      "#c8c8c8", "#d0d050", "#cca05c", "#e09470", "#e08888", "#d084c0", "#b484dc", "#9488e0",
      "#7c8ce0", "#7c9cdc", "#7cb4d4", "#7cd0ac", "#8cd08c", "#9ccc7c", "#b4c078", "#d0b46c",
      "#dcdcdc", "#e8e85c", "#dcb468", "#eca880", "#eca0a0", "#dc9cd0", "#c49cec", "#a8a0ec",
      "#90a4ec", "#90b4ec", "#90cce8", "#90e4c0", "#a4e4a4", "#b4e490", "#ccd488", "#e8cc7c",
      "#ececec", "#fcfc68", "#ecc878", "#fcbc94", "#fcb4b4", "#ecb0e0", "#d4b0fc", "#bcb4fc",
      "#a4b8fc", "#a4c8fc", "#a4e0fc", "#a4fcd4", "#b8fcb8", "#c8fca4", "#e0ec9c", "#fce08c"
    ],
    source: "aseprite/hardware-palettes atari2600-ntsc.gpl",
    notes: "128-entry NTSC TIA palette in palette-file order."
  },
  {
    name: "Commodore 64",
    systemFamily: "computer",
    colors: [
      "#000000", "#ffffff", "#883932", "#67b6bd",
      "#8b3f96", "#55a049", "#40318d", "#bfce72",
      "#8b5429", "#574200", "#b86962", "#505050",
      "#787878", "#94e089", "#7869c4", "#9f9f9f"
    ],
    source: "aseprite/hardware-palettes commodore64.gpl",
    notes: "C64 RGB values are notoriously disputed across composite, luma/chroma models, and emulator palettes."
  },
  {
    name: "ZX Spectrum",
    systemFamily: "computer",
    colors: [
      "#000000", "#0000c0", "#c00000", "#c000c0", "#00c000", "#00c0c0", "#c0c000", "#c0c0c0",
      "#0000ff", "#ff0000", "#ff00ff", "#00ff00", "#00ffff", "#ffff00", "#ffffff"
    ],
    source: "aseprite/hardware-palettes zx-spectrum.gpl",
    notes: "15-color set: normal 7 + bright 7 plus shared black."
  },
  {
    name: "Amstrad CPC",
    systemFamily: "computer",
    colors: [
      "#000000", "#000080", "#0000ff",
      "#800000", "#800080", "#8000ff",
      "#ff0000", "#ff0080", "#ff00ff",
      "#008000", "#008080", "#0080ff",
      "#808000", "#808080", "#8080ff",
      "#ff8000", "#ff8080", "#ff80ff",
      "#00ff00", "#00ff80", "#00ffff",
      "#80ff00", "#80ff80", "#80ffff",
      "#ffff00", "#ffff80", "#ffffff"
    ],
    source: "aseprite/hardware-palettes cpc.gpl",
    notes: "27-color CPC palette in file order."
  },
  {
    name: "MSX1",
    systemFamily: "computer",
    colors: [
      "#000000", "#010101", "#3eb849", "#74d07d",
      "#5955e0", "#8076f1", "#b95e51", "#65dbef",
      "#db6559", "#ff897d", "#ccc35e", "#ded087",
      "#3aa241", "#b766b5", "#cccccc", "#ffffff"
    ],
    source: "aseprite/hardware-palettes msx1.gpl",
    notes: "TMS9918-family 16-color reference set in file order, including transparent slot mapped here to black."
  },
  {
    name: "CGA mode 4 palette 0 low",
    systemFamily: "pc",
    colors: ["#000000", "#00aa00", "#aa0000", "#aa5500"],
    source: "aseprite/hardware-palettes cga0.gpl"
  },
  {
    name: "CGA mode 4 palette 0 high",
    systemFamily: "pc",
    colors: ["#000000", "#55ff55", "#ff5555", "#ffff55"],
    source: "aseprite/hardware-palettes cga0hi.gpl"
  },
  {
    name: "CGA mode 4 palette 1 low",
    systemFamily: "pc",
    colors: ["#000000", "#00aaaa", "#aa00aa", "#aaaaaa"],
    source: "aseprite/hardware-palettes cga1.gpl"
  },
  {
    name: "CGA mode 4 palette 1 high",
    systemFamily: "pc",
    colors: ["#000000", "#55ffff", "#ff55ff", "#ffffff"],
    source: "aseprite/hardware-palettes cga1hi.gpl"
  },
  {
    name: "CGA mode 5",
    systemFamily: "pc",
    colors: ["#000000", "#55ffff", "#ff5555", "#ffffff"],
    source: "aseprite/hardware-palettes cga3rdhi.gpl"
  },
  {
    name: "EGA default 16 from 64-color master",
    systemFamily: "pc",
    colors: [
      "#000000", "#0000aa", "#00aa00", "#00aaaa",
      "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
      "#555555", "#5555ff", "#55ff55", "#55ffff",
      "#ff5555", "#ff55ff", "#ffff55", "#ffffff"
    ],
    source: "aseprite/hardware-palettes cga.gpl",
    notes: "IBM-compatible default 16-color subset, conventionally identical to the canonical CGA 16-color logical palette."
  },
  {
    name: "Apple II HGR 6-color reference",
    systemFamily: "computer",
    colors: ["#000000", "#d93cf0", "#26c30f", "#ffffff", "#d9680f", "#2697f0"],
    source: "aseprite/hardware-palettes apple-ii.gpl",
    notes: "Selected 6-color subset. Apple II composite colors are display- and phase-dependent."
  },
  {
    name: "Macintosh 1-bit",
    systemFamily: "computer",
    colors: ["#ffffff", "#000000"]
  },
  {
    name: "PICO-8",
    systemFamily: "fantasy-console",
    colors: [
      "#000000", "#1d2b53", "#7e2553", "#008751",
      "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8",
      "#ff004d", "#ffa300", "#ffec27", "#00e436",
      "#29adff", "#83769c", "#ff77a8", "#ffccaa"
    ],
    source: "lexaloffle pico-8 manual",
    notes: "Canonical visible 16-color palette."
  },
  {
    name: "PICO-8 secret palette",
    systemFamily: "fantasy-console",
    colors: [
      "#291814", "#111d35", "#422136", "#125359",
      "#742f29", "#49333b", "#a28879", "#f3ef7d",
      "#be1250", "#ff6c24", "#a8e72e", "#00b543",
      "#065ab5", "#754665", "#ff6e59", "#ff9d81"
    ],
    source: "lexaloffle pico-8 manual"
  },
  {
    name: "Teletext",
    systemFamily: "broadcast",
    colors: ["#000000", "#0000ff", "#ff0000", "#ff00ff", "#00ff00", "#00ffff", "#ffff00", "#ffffff"],
    source: "aseprite/hardware-palettes teletext.gpl"
  },
  {
    name: "Nord",
    systemFamily: "modern-designer",
    colors: [
      "#2e3440", "#3b4252", "#434c5e", "#4c566a",
      "#d8dee9", "#e5e9f0", "#eceff4", "#8fbcbb",
      "#88c0d0", "#81a1c1", "#5e81ac", "#bf616a",
      "#d08770", "#ebcb8b", "#a3be8c", "#b48ead"
    ],
    source: "nordtheme.com",
    notes: "Official Nord 16-color core palette."
  },
  {
    name: "Solarized Dark",
    systemFamily: "modern-designer",
    colors: [
      "#002b36", "#073642", "#586e75", "#657b83",
      "#839496", "#93a1a1", "#eee8d5", "#fdf6e3",
      "#b58900", "#cb4b16", "#dc322f", "#d33682",
      "#6c71c4", "#268bd2", "#2aa198", "#859900"
    ],
    source: "ethanschoonover.com/solarized"
  },
  {
    name: "Dracula",
    systemFamily: "modern-designer",
    colors: [
      "#282a36", "#44475a", "#f8f8f2", "#6272a4", "#8be9fd",
      "#50fa7b", "#ffb86c", "#ff79c6", "#bd93f9", "#ff5555", "#f1fa8c"
    ],
    source: "draculatheme.com/palette"
  },
  {
    name: "Gruvbox Dark",
    systemFamily: "modern-designer",
    colors: [
      "#282828", "#3c3836", "#504945", "#665c54",
      "#bdae93", "#d5c4a1", "#ebdbb2", "#fbf1c7",
      "#fb4934", "#fe8019", "#fabd2f", "#b8bb26",
      "#8ec07c", "#83a598", "#d3869b", "#d65d0e"
    ],
    source: "github.com/morhetz/gruvbox"
  },
  {
    name: "Tokyo Night",
    systemFamily: "modern-designer",
    colors: [
      "#1a1b26", "#161925", "#24263b", "#414a6b",
      "#a9b1d6", "#c0caf5", "#399add", "#2ac3de",
      "#73d0ff", "#7aa2f7", "#9d7cd8", "#bb9af7",
      "#f7768e", "#ff9e64", "#e0af68", "#9ece6a"
    ],
    source: "github.com/folke/tokyonight.nvim"
  }
]
```

Open palette items intentionally NOT provided to avoid fabrication: Atari ST default TOS palette, Mac 4-bit/8-bit system palettes, Amiga Workbench 1.x default UI palette, Game Boy Color global palette (CGB uses arbitrary RGB555 RAM, no global LUT).

## Palette-restricted error-diffusion dithering

Standard structure: scan pixels in chosen order, choose nearest palette color, write index, compute per-channel quantization error, distribute via kernel.

**Algorithm skeleton:**

```
function QuantizeWithErrorDiffusion(srcSrgb, paletteSrgb, tapsLTR, traversal, metric):
    workLinear    = sRGBToLinear(srcSrgb)
    paletteLinear = sRGBToLinear(paletteSrgb)
    paletteLab    = sRGBToLab(paletteSrgb)   // for Lab metrics only

    for y in 0..H-1:
        rtl = (traversal == "serpentine") and (y % 2 == 1)
        taps = rtl ? MirrorHorizontally(tapsLTR) : tapsLTR

        for x in (rtl ? reversed range : forward range):
            p   = Clamp(workLinear[x,y], 0, 1)
            idx = NearestPaletteIndex(p, paletteLinear, paletteLab, metric)
            q   = paletteLinear[idx]
            out[x,y] = idx
            err = p - q                       // per channel, linear RGB

            for tap in taps:
                nx, ny = x+tap.dx, y+tap.dy
                if in bounds:
                    workLinear[nx,ny] += err * tap.w
```

**Canonical kernels** (LTR convention; mirror dx for serpentine RTL rows):

```
Floyd-Steinberg / 16:
  (+1,0,7), (-1,+1,3), (0,+1,5), (+1,+1,1)

Jarvis-Judice-Ninke / 48:
  (+1,0,7), (+2,0,5)
  (-2,+1,3), (-1,+1,5), (0,+1,7), (+1,+1,5), (+2,+1,3)
  (-2,+2,1), (-1,+2,3), (0,+2,5), (+1,+2,3), (+2,+2,1)

Stucki / 42:
  (+1,0,8), (+2,0,4)
  (-2,+1,2), (-1,+1,4), (0,+1,8), (+1,+1,4), (+2,+1,2)
  (-2,+2,1), (-1,+2,2), (0,+2,4), (+1,+2,2), (+2,+2,1)

Burkes / 32:
  (+1,0,8), (+2,0,4)
  (-2,+1,2), (-1,+1,4), (0,+1,8), (+1,+1,4), (+2,+1,2)

Sierra full / 32:
  (+1,0,5), (+2,0,3)
  (-2,+1,2), (-1,+1,4), (0,+1,5), (+1,+1,4), (+2,+1,2)
  (-1,+2,2), (0,+2,3), (+1,+2,2)

Sierra-2 / 16:
  (+1,0,4), (+2,0,3)
  (-2,+1,1), (-1,+1,2), (0,+1,3), (+1,+1,2), (+2,+1,1)

Sierra Lite / 4:
  (+1,0,2), (-1,+1,1), (0,+1,1)

Atkinson / 8:
  (+1,0,1), (+2,0,1), (-1,+1,1), (0,+1,1), (+1,+1,1), (0,+2,1)
  // total propagated = 6/8 — classic Mac drop look

Ostromoukhov:
  use 256-entry LUT keyed on 8-bit tone value: {wr, wdl, wd}
  diffuse to (+1,0), (-1,+1), (0,+1) only
```

**Color distance metrics:**

- sRGB Euclidean: fastest, visibly wrong in many cases
- Linear-light RGB Euclidean: physically sensible for mixing, not perceptually uniform
- CIE Lab DeltaE 76 / 94: better perceptual match
- CIE Lab DeltaE 2000: best perceptual quality, expensive
- Weighted RGB approximations: SIMD-friendly compromise

**Recommended default for high-quality photo dither:** keep error buffer in linear-light RGB, propagate per-channel; for nearest-palette search convert to Lab and use DeltaE 2000. Use perceptual distance for **selection**, linear RGB for **error transport**.

**Serpentine traversal** alternates LTR/RTL per row. Eliminates streaking and "worm" artifacts from one-direction raster diffusion. Standard win unless emulating historic hardware.

**Riemersma / Hilbert-curve dither:** scan along Hilbert space-filling curve, keep short weighted history of past errors instead of fixed 2D stencil. Removes the privileged axis of raster diffusion. Typical history length ~16 with exponentially decaying weights.

```
function RiemersmaPaletteDither(srcSrgb, paletteSrgb, metric, historyLen=16, decay=0.5):
    order   = HilbertTraversal(W, H)
    history = deque()
    weights = Normalize([decay^i for i in 0..historyLen-1])

    for p in order:
        base = sRGBToLinear(srcSrgb[p.x, p.y])
        acc  = base + sum(history[i] * weights[i] for i)
        acc  = Clamp(acc, 0, 1)
        idx  = NearestPaletteIndex(acc, paletteLinear, paletteLab, metric)
        err  = acc - paletteLinear[idx]
        out[p.x, p.y] = idx
        history.push_front(err)
        if history.length > historyLen: history.pop_back()
```

**Ordered palette dither (Bayer or blue-noise mask):**

```
function OrderedPaletteDither(srcSrgb, paletteSrgb, mask, ampLinear, metric):
    for each pixel (x,y):
        t = mask[y % H, x % W] - 0.5
        p = sRGBToLinear(srcSrgb[x,y])
        p = Clamp(p + ampLinear * t, 0, 1)
        out[x,y] = NearestPaletteIndex(p, paletteLinear, paletteLab, metric)
```

Bayer produces cross-hatch artifacts. Blue-noise mask suppresses low-frequency structure and looks much better while staying deterministic and tileable.

**Failure modes:**

- Saturated source colors with no saturated palette entries → map to muddy neutrals. No algorithm creates nonexistent gamut. Perceptual metric helps; lightness-first tie-break helps more.
- Error explosion with very small palettes → clamp candidate before search, optionally soft-limit buffer to `[-0.5, 1.5]`.
- Diffusing error in perceptual space → unstable; use perceptual for selection, linear RGB for transport.

## Void-and-cluster blue-noise threshold masks

Ulichney 1993. Generates tileable blue-noise threshold matrices. Key idea: low-pass filter a binary pattern, local maxima over "on" pixels = clusters, local minima over "off" pixels = voids, rank pixels in the order they turn on as coverage rises 0→100%.

**Algorithm:**

```
function ToroidalGaussianKernel(size, sigma):
    K = matrix
    c = floor(size/2)
    for y, x:
        dx = min(|x-c|, size-|x-c|)
        dy = min(|y-c|, size-|y-c|)
        K[y,x] = exp(-(dx² + dy²) / (2σ²))
    return K / sum(K)

function FilteredDensityToroidal(bits, gaussian):
    return CyclicConvolve(bits, gaussian)

function TightestCluster(bits, density):
    return argmax(density over pixels where bits == 1)

function LargestVoid(bits, density):
    return argmin(density over pixels where bits == 0)

function RelaxPrototype(bits, gaussian):
    loop:
        density  = FilteredDensityToroidal(bits, gaussian)
        cluster  = TightestCluster(bits, density)
        bits[cluster] = 0
        density2 = FilteredDensityToroidal(bits, gaussian)
        voidp    = LargestVoid(bits, density2)
        if voidp == cluster:
            bits[cluster] = 1
            break
        bits[voidp] = 1
    return bits

function RankVoidClusterMask(bitsPrototype, sigma):
    H, W = bitsPrototype.dims
    N = H * W
    ranks = matrix(-1)
    gaussian = ToroidalGaussianKernel(max(H,W), sigma)
    prototype = RelaxPrototype(copy(bitsPrototype), gaussian)
    m = CountOnes(prototype)

    // Phase I: rank existing minority pixels by removing tightest cluster repeatedly
    B = copy(prototype)
    for rank from m-1 down to 0:
        c = TightestCluster(B, FilteredDensityToroidal(B, gaussian))
        B[c] = 0
        ranks[c] = rank

    // Phase II: grow from prototype to 50% by filling largest voids
    B = copy(prototype)
    for rank from m to N/2 - 1:
        v = LargestVoid(B, FilteredDensityToroidal(B, gaussian))
        B[v] = 1
        ranks[v] = rank

    // Phase III: continue 50% → 100% via tightest cluster of HOLES
    for rank from N/2 to N - 1:
        holes = 1 - B
        h = TightestCluster(holes, FilteredDensityToroidal(holes, gaussian))
        B[h] = 1
        ranks[h] = rank

    return ranks

function ThresholdFromRanks(ranks):
    N = ranks.size
    return ranks.map(r => (r + 0.5) / N)
```

**Filter:** Gaussian, cyclic (toroidal). Toroidal wrap-around (a) avoids edge artifacts during optimization, (b) guarantees seamless tiling. Separable Gaussian fine if you preserve toroidal indexing; FFT cyclic convolution common at larger sizes. σ ≈ 1.5 is typical for 64×64.

**Sizes:** 32², 64², 128², 256². 64² is Peters's recommended default. Larger = less visible repetition but more memory.

**Ship pre-generated.** Christoph Peters has CC0 64² and 128² blue-noise textures: <http://momentsingraphics.de/BlueNoise.html>. Pre-generated assets > runtime synthesis for production. Keep generator for tooling.

**Alternatives:**

- Error-diffusion-based blue noise (good per-image, not reusable as mask)
- Peters's optimal-transport blue-noise textures
- Spot-removal/spot-addition variants for perceptual or printer-model objectives

**Usage for dithering:** identical structure to Bayer ordered dither — normalize mask to `[0,1)`, remap to `[-0.5,0.5)`, scale by amplitude, perturb pixel, then nearest-palette quantize. Difference is the spectrum: Bayer = regular cross-hatch; blue noise = energy pushed to high frequencies, much less visible patterning under HVS.

## Open palette items (not provided to avoid fabrication)

- Atari ST default TOS 16-color palette
- Mac System 4-bit and 8-bit system palettes
- Amiga Workbench 1.x default UI palette
- Game Boy Color "global" palette (does not exist; CGB uses RGB555 palette RAM with 8 BG + 8 OBJ palettes per game)
