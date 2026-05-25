import { useState } from 'react';
import type { PipelineParams } from '../engine/pipeline';
import type { RgbaImage } from '../engine/image/types';
import { INTENTS, type Intent, type RecipeReport } from '../engine/recipe/types';
import { buildPrompt } from '../engine/recipe/prompts';
import { validateAndMapRecipe, mapRecipe } from '../engine/recipe/validate';
import { defaultRecipeForIntent } from '../engine/recipe/intents';

interface Props {
  source: RgbaImage | null;
  applyParams: (p: PipelineParams) => void;
}

const INTENT_LABEL: Record<Intent, string> = {
  'screen-print': 'Screen print',
  'halftone-poster': 'Halftone poster',
  sticker: 'Sticker',
  'comic-ink': 'Comic ink',
  'retro-game': 'Retro game',
  duotone: 'Duotone',
};

export function AiRecipePanel({ source, applyParams }: Props) {
  const [intent, setIntent] = useState<Intent>('halftone-poster');
  const [json, setJson] = useState('');
  const [report, setReport] = useState<RecipeReport | null>(null);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt(intent));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — fall back to selecting nothing; user can copy manually
    }
  };

  const applyJson = () => {
    const r = validateAndMapRecipe(json, intent, source ?? undefined);
    applyParams(r.params);
    setReport(r.report);
  };

  const resetToIntent = () => {
    const recipe = defaultRecipeForIntent(intent);
    const { params, warnings, clamped } = mapRecipe(recipe, source ?? undefined);
    applyParams(params);
    setReport({
      intent, mode: recipe.layers[0].params.mode.mode,
      warnings, clampedFields: clamped, fallbackUsed: true, parseOk: true,
    });
  };

  return (
    <div className="group">
      <h2>AI recipe (paste)</h2>
      <div className="row">
        <label>Intent</label>
        <select value={intent} onChange={(e) => setIntent(e.target.value as Intent)}>
          {INTENTS.map((i) => <option key={i} value={i}>{INTENT_LABEL[i]}</option>)}
        </select>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="ghost" onClick={copyPrompt}>
          {copied ? 'Copied ✓' : 'Copy prompt'}
        </button>
        <button className="ghost" onClick={resetToIntent} title="apply this intent's built-in default">
          Reset to default
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', margin: '4px 0' }}>
        Run the prompt + your image in ChatGPT or Gemini, then paste the JSON reply below.
      </div>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder='Paste the AI recipe JSON here…'
        spellCheck={false}
        style={{ width: '100%', minHeight: 96, fontFamily: 'monospace', fontSize: 11,
          background: 'var(--panel, #1b1b1b)', color: 'var(--text)', border: '1px solid var(--border)',
          borderRadius: 4, padding: 6, resize: 'vertical' }}
      />
      <button className="btn" style={{ width: '100%', marginTop: 6 }} disabled={!json.trim()} onClick={applyJson}>
        Apply recipe
      </button>
      {report && <RecipeReportView report={report} />}
    </div>
  );
}

function RecipeReportView({ report }: { report: RecipeReport }) {
  return (
    <div style={{
      marginTop: 8, fontSize: 11, border: '1px solid var(--border)', borderRadius: 4,
      padding: 8, background: report.fallbackUsed ? 'rgba(255,176,0,0.08)' : 'rgba(0,200,120,0.06)',
    }}>
      <div><strong>intent:</strong> {report.intent} &nbsp; <strong>mode:</strong> {report.mode}</div>
      <div>
        <strong>parsed:</strong> {report.parseOk ? 'ok' : 'invalid JSON'} &nbsp;
        <strong>fallback:</strong> {report.fallbackUsed ? 'YES (used intent default)' : 'no'}
      </div>
      {report.warnings.length > 0 && (
        <div style={{ marginTop: 4, color: 'var(--muted)' }}>
          <strong>warnings:</strong>
          <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
            {report.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {report.clampedFields.length > 0 && (
        <div style={{ marginTop: 4, color: 'var(--muted)' }}>
          <strong>clamped:</strong> {report.clampedFields.join(', ')}
        </div>
      )}
    </div>
  );
}
