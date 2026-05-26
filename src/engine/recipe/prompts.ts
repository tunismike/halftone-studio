// Tier 1 prompt builder. Produces the copy-paste prompt a user runs in
// ChatGPT/Gemini alongside their image. The model returns ONLY a Trace Recipe
// JSON envelope — never SVG. Our validator then maps it to engine params.

import type { Intent } from './types';
import { RECIPE_VERSION } from './types';

const SYSTEM = `You are a prepress art director for "Halftone Studio," a deterministic
vector halftone / dither / screen-print tool. You will be shown a SOURCE IMAGE and
an OUTPUT INTENT.

Return ONLY a single JSON object — a "Trace Recipe". No prose, no markdown fences,
no SVG. The app validates, clamps, and renders it; you only describe the treatment.

ENVELOPE (Tier 1 = exactly one layer with role "final-art"):
{
  "recipeVersion": "${RECIPE_VERSION}",
  "intent": "<the given intent>",
  "sourceTreatment": "analysis-only",
  "notes": "<one sentence on what you saw and why this treatment>",
  "layers": [
    { "id": "main", "name": "<short name>", "role": "final-art", "enabled": true,
      "params": { ...one mode object plus optional preprocess/adjust/colors } }
  ]
}

MODE (choose exactly one, inside params.mode):
  vector-halftone: { "mode":"vector-halftone", "screen":"grid|hex|radial|poisson|stipple",
    "mark":"circle|square|diamond|line|blob", "cellSize":2..40, "angleDeg":-90..90 }
  palette-dither:  { "mode":"palette-dither", "palette":"<builtin id|extract:N>",
    "algorithm":"floyd-steinberg|atkinson|stucki|jjn|burkes|ordered-bayer|blue-noise" }
  tonal:           { "mode":"tonal", "bandCount":1..5, "bandColors":["#..",...], "bgColor":"#.." }
  duotone:         { "mode":"duotone", "shadow":"#..", "highlight":"#.." }

Builtin palette ids you may use: mono-1bit, mono-gray-4, mono-handheld-green,
console-nes-ntsc, micro-c64, micro-zx, pc-cga-0-high, pc-ega-16, fantasy-pico8,
modern-nord, modern-gruvbox-dark. Or "extract:N" (N=2..16) to pull colors from the image.

OPTIONAL in params:
  preprocess: { blur:0..10, sharpen:0..2, sharpenRadius:0.5..10,
                levelsBlack:0..254, levelsWhite:1..255, gamma:0.1..3 }
  adjust:     { brightness:-1..1, contrast:-1..1, gamma:0.1..3, invert:bool }
  background, foreground: "#rrggbb"
  transparent: bool

MULTI-LAYER (optional): to MIX treatments, emit several enabled layers. Each layer
may add, alongside its params:
  "region": one of
     {"kind":"whole"}
     {"kind":"tone","min":0..1,"max":0..1}            (luminance window; dark subject ≈ min 0, max 0.4)
     {"kind":"color","count":2..12,"index":0..count-1} (quantize to N colours, target one)
  "blend": "normal|multiply|screen|darken|lighten"     (multiply ≈ overprinted inks)
  "opacity": 0..1
Layers paint bottom-to-top (first = bottom). Examples: a grid-halftone "whole" base plus a
tonal/duotone layer on a dark tone band for a poster; or three multiply tone-band plates for
a screen-print. Omit these fields for a single full-image layer (Tier 1).

RULES:
  - Match the mode to BOTH the intent and what you see. High-detail faces → stipple
    or fine palette-dither. Bold graphics/logos → tonal bands or grid halftone.
  - For screen-print prefer few colors and high contrast (raise levelsBlack, lower
    levelsWhite). For sticker prefer bold 1–2 tone. For comic-ink use grid circle
    halftone with sharpening.
  - Keep numbers inside the ranges shown. Use real hex colors.
  - Output the JSON object and nothing else.`;

const EXAMPLES: Record<Intent, string> = {
  'screen-print': `{
  "recipeVersion": "${RECIPE_VERSION}", "intent": "screen-print",
  "sourceTreatment": "analysis-only",
  "notes": "Portrait with clear shadow/midtone/highlight separation; three-tone works.",
  "layers": [{ "id":"main","name":"Three-tone","role":"final-art","enabled":true,
    "params": { "mode": { "mode":"tonal","bandCount":3,
      "bandColors":["#101820","#7a7a7a","#f4f4f4"], "bgColor":"#ffffff" },
      "preprocess": { "sharpen":0.6, "levelsBlack":28, "levelsWhite":230, "gamma":0.9 } } }]
}`,
  'halftone-poster': `{
  "recipeVersion": "${RECIPE_VERSION}", "intent": "halftone-poster",
  "sourceTreatment": "analysis-only",
  "notes": "Smooth tonal photo suits a classic 45° dot halftone.",
  "layers": [{ "id":"main","name":"Dot halftone","role":"final-art","enabled":true,
    "params": { "mode": { "mode":"vector-halftone","screen":"grid","mark":"circle",
      "cellSize":8,"angleDeg":45 }, "preprocess": { "sharpen":0.4, "levelsBlack":12, "levelsWhite":244 } } }]
}`,
  sticker: `{
  "recipeVersion": "${RECIPE_VERSION}", "intent": "sticker",
  "sourceTreatment": "analysis-only",
  "notes": "Bold subject; reduce to crisp two-tone for a die-cut sticker feel.",
  "layers": [{ "id":"main","name":"Two-tone","role":"final-art","enabled":true,
    "params": { "mode": { "mode":"tonal","bandCount":2,"bandColors":["#000000","#ffffff"],"bgColor":"#ffffff" },
      "preprocess": { "sharpen":0.8, "levelsBlack":40, "levelsWhite":216, "gamma":0.85 } } }]
}`,
  'comic-ink': `{
  "recipeVersion": "${RECIPE_VERSION}", "intent": "comic-ink",
  "sourceTreatment": "analysis-only",
  "notes": "High-contrast face; comic dot halftone at a slight angle reads as inked shading.",
  "layers": [{ "id":"main","name":"Comic halftone","role":"final-art","enabled":true,
    "params": { "mode": { "mode":"vector-halftone","screen":"grid","mark":"circle","cellSize":6,"angleDeg":15 },
      "preprocess": { "sharpen":0.7, "levelsBlack":30, "levelsWhite":225 }, "adjust": { "contrast":0.2 } } }]
}`,
  'retro-game': `{
  "recipeVersion": "${RECIPE_VERSION}", "intent": "retro-game",
  "sourceTreatment": "analysis-only",
  "notes": "Colorful scene; NES palette with ordered dithering for an 8-bit look.",
  "layers": [{ "id":"main","name":"NES dither","role":"final-art","enabled":true,
    "params": { "mode": { "mode":"palette-dither","palette":"console-nes-ntsc","algorithm":"ordered-bayer" } } }]
}`,
  duotone: `{
  "recipeVersion": "${RECIPE_VERSION}", "intent": "duotone",
  "sourceTreatment": "analysis-only",
  "notes": "Moody portrait; blue shadows to warm highlights.",
  "layers": [{ "id":"main","name":"Duotone","role":"final-art","enabled":true,
    "params": { "mode": { "mode":"duotone","shadow":"#13294b","highlight":"#f4b860" } } }]
}`,
};

export function buildPrompt(intent: Intent): string {
  return `${SYSTEM}

OUTPUT INTENT: ${intent}

EXAMPLE of a valid response for this intent (adapt to the actual image, do not copy verbatim):
${EXAMPLES[intent]}

Now analyze the attached image for intent "${intent}" and return one Trace Recipe JSON object.`;
}
