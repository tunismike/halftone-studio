import { sampleBilinear } from '../image/sample';
import type { LumImage, Sample } from '../image/types';
import { fbm } from '../noise/value';

export interface WarpParams {
  waveAmp: number;
  waveFreq: number;
  wavePhase: number;
  noiseAmp: number;
  noiseFreq: number;
  noiseSeed: number;
  resample: boolean;
}

export const noWarp: WarpParams = {
  waveAmp: 0,
  waveFreq: 0.02,
  wavePhase: 0,
  noiseAmp: 0,
  noiseFreq: 0.02,
  noiseSeed: 1,
  resample: true,
};

export function warpSamples(samples: Sample[], img: LumImage, p: WarpParams): Sample[] {
  if (p.waveAmp === 0 && p.noiseAmp === 0) return samples;
  const out: Sample[] = new Array(samples.length);
  const fbmCfg = { octaves: 3, lacunarity: 2, gain: 0.5 };
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    let dx = 0;
    let dy = 0;
    if (p.waveAmp !== 0) {
      dx += p.waveAmp * Math.sin(p.waveFreq * s.y + p.wavePhase);
      dy += p.waveAmp * Math.sin(p.waveFreq * s.x + p.wavePhase + Math.PI / 2);
    }
    if (p.noiseAmp !== 0) {
      const nx = fbm(s.x * p.noiseFreq, s.y * p.noiseFreq, p.noiseSeed, fbmCfg);
      const ny = fbm(s.x * p.noiseFreq, s.y * p.noiseFreq, p.noiseSeed + 9173, fbmCfg);
      dx += p.noiseAmp * (nx - 0.5) * 2;
      dy += p.noiseAmp * (ny - 0.5) * 2;
    }
    const x = s.x + dx;
    const y = s.y + dy;
    const value = p.resample ? sampleBilinear(img, x, y) : s.value;
    out[i] = { x, y, value, cellSize: s.cellSize, angle: s.angle };
  }
  return out;
}
