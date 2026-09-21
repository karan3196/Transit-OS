/**
 * Cost observability (CLAUDE.md non-negotiable 8).
 *
 * Every agent run records tokens, model, latency and an estimated rupee cost
 * against a tenant. Estimates are deliberately conservative — they exist to
 * catch a tenant drifting past the ~₹2,000/month variable-cost line, not to
 * reconcile an invoice.
 */

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMillion: number;
  /** USD per million output tokens. */
  outputPerMillion: number;
  /** USD per million cached input tokens read back. */
  cacheReadPerMillion: number;
}

export const USD_TO_INR = 88;

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-haiku-4-5-20251001': { inputPerMillion: 1, outputPerMillion: 5, cacheReadPerMillion: 0.1 },
  'claude-sonnet-5': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3 },
  'claude-opus-5': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5 },
};

/** Unknown models are priced at the most expensive tier so surprises show up high, not low. */
const FALLBACK_PRICING: ModelPricing = MODEL_PRICING['claude-opus-5']!;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

/** Estimated cost of one model call, in paise (1 rupee = 100 paise). */
export function estimateCostPaise(model: string, usage: TokenUsage): number {
  const pricing = MODEL_PRICING[model] ?? FALLBACK_PRICING;
  const usd =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillion +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion +
    ((usage.cacheReadTokens ?? 0) / 1_000_000) * pricing.cacheReadPerMillion;

  return Math.round(usd * USD_TO_INR * 100);
}

export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
