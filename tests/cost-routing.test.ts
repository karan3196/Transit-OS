import { describe, expect, it } from 'vitest';
import { estimateCostPaise, formatPaise, MODEL_PRICING } from '@/lib/agents/cost';
import { CHEAP_MODEL, STANDARD_MODEL, routeModel } from '@/lib/agents/router';

describe('cost estimation', () => {
  it('prices a typical front desk turn in paise', () => {
    // 1,200 in / 180 out on Haiku: ~$0.0021 -> ~18 paise.
    const paise = estimateCostPaise(CHEAP_MODEL, { inputTokens: 1200, outputTokens: 180 });
    expect(paise).toBeGreaterThan(10);
    expect(paise).toBeLessThan(40);
  });

  it('charges cached input at the cache rate', () => {
    const cold = estimateCostPaise(CHEAP_MODEL, { inputTokens: 20_000, outputTokens: 100 });
    const warm = estimateCostPaise(CHEAP_MODEL, {
      inputTokens: 0,
      outputTokens: 100,
      cacheReadTokens: 20_000,
    });
    expect(warm).toBeLessThan(cold);
  });

  it('prices an unknown model at the most expensive tier rather than zero', () => {
    const unknown = estimateCostPaise('some-future-model', { inputTokens: 1000, outputTokens: 1000 });
    const opus = estimateCostPaise('claude-opus-5', { inputTokens: 1000, outputTokens: 1000 });
    expect(unknown).toBe(opus);
    expect(unknown).toBeGreaterThan(0);
  });

  it('keeps a Growth tenant well inside the margin rule at plan volume', () => {
    // 2,000 conversations, 5 turns each, mostly cached input.
    const perTurn = estimateCostPaise(CHEAP_MODEL, {
      inputTokens: 800,
      outputTokens: 150,
      cacheReadTokens: 3000,
    });
    const monthlyPaise = perTurn * 5 * 2000;
    expect(monthlyPaise).toBeLessThan(200_000); // under ₹2,000
  });

  it('formats rupees with the Indian grouping', () => {
    expect(formatPaise(150_000)).toBe('₹1,500.00');
  });

  it('has pricing for every model the router can pick', () => {
    expect(MODEL_PRICING[CHEAP_MODEL]).toBeDefined();
    expect(MODEL_PRICING[STANDARD_MODEL]).toBeDefined();
  });
});

describe('model routing', () => {
  it('defaults to the cheapest capable model', () => {
    const decision = routeModel({ text: 'What time do you open?', turnCount: 1 });
    expect(decision.model).toBe(CHEAP_MODEL);
    expect(decision.complexity).toBe('simple');
  });

  it('escalates on a complex intent', () => {
    expect(routeModel({ text: 'I need to reschedule and get a quotation', turnCount: 1 }).model).toBe(
      STANDARD_MODEL,
    );
  });

  it('escalates on a long thread or a very long message', () => {
    expect(routeModel({ text: 'hi', turnCount: 12 }).model).toBe(STANDARD_MODEL);
    expect(routeModel({ text: 'x'.repeat(700), turnCount: 1 }).model).toBe(STANDARD_MODEL);
  });

  it('escalates after a previous escalation regardless of the hint', () => {
    const decision = routeModel({
      text: 'ok',
      turnCount: 1,
      modelHint: CHEAP_MODEL,
      escalatedPreviously: true,
    });
    expect(decision.model).toBe(STANDARD_MODEL);
  });

  it("honours the agent row's model hint for ordinary traffic", () => {
    expect(routeModel({ text: 'hi', turnCount: 1, modelHint: 'claude-opus-5' }).model).toBe(
      'claude-opus-5',
    );
  });

  it('always states a reason, so the choice is loggable', () => {
    expect(routeModel({ text: 'hi', turnCount: 1 }).reason).toBeTruthy();
  });
});
