// Strict Zod schema for parsing untrusted LLM JSON. `.strict()` rejects any
// unknown key so the model can never smuggle arbitrary fields into the
// renderer. Numbers are accepted as-is here (NOT range-rejected) — the mapper
// clamps them and records what it clamped, which is friendlier than failing
// the whole recipe over one out-of-range value. Enums ARE strict: an unknown
// mode/screen/mark/algorithm/role fails parsing and triggers the intent
// fallback.

import { z } from 'zod';
import {
  INTENTS, LAYER_ROLES, SOURCE_TREATMENTS,
  RECIPE_SCREENS, RECIPE_MARKS, RECIPE_DITHER_ALGOS,
} from './types';

const hex = z.string(); // shape-validated + normalized in the mapper

const vectorHalftone = z.object({
  mode: z.literal('vector-halftone'),
  screen: z.enum(RECIPE_SCREENS),
  mark: z.enum(RECIPE_MARKS),
  cellSize: z.number(),
  angleDeg: z.number(),
}).strict();

const paletteDither = z.object({
  mode: z.literal('palette-dither'),
  palette: z.string(),
  algorithm: z.enum(RECIPE_DITHER_ALGOS),
}).strict();

const tonal = z.object({
  mode: z.literal('tonal'),
  bandCount: z.number(),
  bandColors: z.array(hex),
  bgColor: hex,
}).strict();

const duotone = z.object({
  mode: z.literal('duotone'),
  shadow: hex,
  highlight: hex,
}).strict();

const recipeMode = z.discriminatedUnion('mode', [
  vectorHalftone, paletteDither, tonal, duotone,
]);

const preprocess = z.object({
  blur: z.number().optional(),
  sharpen: z.number().optional(),
  sharpenRadius: z.number().optional(),
  levelsBlack: z.number().optional(),
  levelsWhite: z.number().optional(),
  gamma: z.number().optional(),
}).strict();

const adjust = z.object({
  brightness: z.number().optional(),
  contrast: z.number().optional(),
  gamma: z.number().optional(),
  invert: z.boolean().optional(),
}).strict();

const layerParams = z.object({
  mode: recipeMode,
  preprocess: preprocess.optional(),
  adjust: adjust.optional(),
  background: hex.optional(),
  foreground: hex.optional(),
  transparent: z.boolean().optional(),
}).strict();

const layer = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(LAYER_ROLES),
  enabled: z.boolean(),
  params: layerParams,
}).strict();

export const traceRecipeSchema = z.object({
  recipeVersion: z.string(),
  intent: z.enum(INTENTS),
  sourceTreatment: z.enum(SOURCE_TREATMENTS),
  notes: z.string().optional(),
  layers: z.array(layer).min(1),
}).strict();

export type ParsedRecipe = z.infer<typeof traceRecipeSchema>;
