/**
 * Model routing (CLAUDE.md section 2: route to the cheapest capable model,
 * escalate only on complexity or low confidence, and log the choice).
 */

export type Complexity = 'simple' | 'standard' | 'complex';

export const CHEAP_MODEL = 'claude-haiku-4-5-20251001';
export const STANDARD_MODEL = 'claude-sonnet-5';

const COMPLEX_SIGNALS = [
  /\b(treatment plan|insurance|invoice|quotation|quote|reschedul\w+|cancel\w*)\b/i,
  /\b(compare|difference between|options? for)\b/i,
];

export interface RoutingDecision {
  model: string;
  complexity: Complexity;
  reason: string;
}

export function routeModel(input: {
  text: string;
  turnCount: number;
  modelHint?: string | null;
  escalatedPreviously?: boolean;
}): RoutingDecision {
  const { text, turnCount, modelHint, escalatedPreviously } = input;

  if (escalatedPreviously) {
    return { model: STANDARD_MODEL, complexity: 'complex', reason: 'previous turn was escalated' };
  }

  if (COMPLEX_SIGNALS.some((p) => p.test(text)) || text.length > 600 || turnCount > 8) {
    return { model: STANDARD_MODEL, complexity: 'complex', reason: 'complex intent or long thread' };
  }

  // The agent record may pin a model; honour it for anything not already complex.
  if (modelHint) {
    return { model: modelHint, complexity: 'standard', reason: 'agent model_hint' };
  }

  return { model: CHEAP_MODEL, complexity: 'simple', reason: 'default cheapest capable model' };
}
