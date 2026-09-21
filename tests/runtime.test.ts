import { beforeAll, describe, expect, it } from 'vitest';
import { runAgentTurn } from '@/lib/agents/runtime';
import { DemoToolBackend } from '@/lib/agents/backend';
import { buildSystemPrompt, renderTemplate } from '@/lib/agents/prompt';
import {
  demoBusiness,
  demoFrontDeskAgent,
  demoKnowledge,
  demoServices,
} from '@/lib/data/fixtures';
import { HANDOFF_MESSAGE } from '@/lib/agents/guardrails';
import type { AgentContext } from '@/lib/agents/types';

// These exercise the runtime's control flow, not the model. The offline
// fallback keeps them deterministic and free.
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

const context = (): AgentContext => ({
  tenantId: 'test',
  conversationId: 'conv-test',
  agent: demoFrontDeskAgent,
  business: demoBusiness,
  services: demoServices,
  knowledge: demoKnowledge,
  history: [],
});

describe('prompt assembly', () => {
  it('substitutes tenant variables and leaves unknown ones visible', () => {
    expect(renderTemplate('Hello {{business_name}} and {{nope}}', { business_name: 'Alcadent' })).toBe(
      'Hello Alcadent and {{nope}}',
    );
  });

  it('includes the business facts, services and approved knowledge', () => {
    const prompt = buildSystemPrompt(context());
    expect(prompt).toContain('Alcadent India');
    expect(prompt).toContain('Dr. Anukriti Gupta');
    expect(prompt).toContain('Scaling & polishing');
    expect(prompt).toContain('Approved facts you may quote');
    expect(prompt).not.toContain('{{');
  });
});

describe('agent turn', () => {
  it('escalates a clinical question without calling the model at all', async () => {
    const backend = new DemoToolBackend();
    const result = await runAgentTurn(
      context(),
      'My son has a dark spot on his molar, is it a cavity?',
      backend,
    );

    expect(result.escalate).toBe(true);
    expect(result.reply).toBe(HANDOFF_MESSAGE);
    expect(result.model).toBe('none');
    expect(result.costPaise).toBe(0);
    expect(backend.escalations).toHaveLength(1);
    expect(result.guardrailFlags).toContain('diagnosis_request');
  });

  it('answers an ordinary question from approved knowledge', async () => {
    const backend = new DemoToolBackend();
    const result = await runAgentTurn(context(), 'Where are you located and is there parking?', backend);

    expect(result.escalate).toBe(false);
    expect(result.reply).toMatch(/Elan Miracle Mall/);
    expect(backend.escalations).toHaveLength(0);
  });

  it('records a routing reason and a latency for every turn', async () => {
    const result = await runAgentTurn(context(), 'What time do you open?', new DemoToolBackend());
    expect(result.routingReason).toBeTruthy();
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('hands over when a drafted reply would break a boundary rule', async () => {
    const backend = new DemoToolBackend();
    // A knowledge chunk that should never have been approved: the output
    // screen is the backstop for exactly this.
    const bad: AgentContext = {
      ...context(),
      knowledge: [
        {
          source: 'clinic_facts',
          title: 'Whitening',
          content: 'Whitening treatment is 100% safe and results are guaranteed permanently.',
        },
      ],
    };

    const result = await runAgentTurn(bad, 'Tell me about whitening treatment please', backend);

    expect(result.reply).toBe(HANDOFF_MESSAGE);
    expect(result.escalate).toBe(true);
    expect(result.guardrailFlags).toContain('guaranteed_outcome');
    expect(backend.escalations).toHaveLength(1);
  });

  it('marks the offline fallback so the portal can say so', async () => {
    const result = await runAgentTurn(context(), 'hello', new DemoToolBackend());
    expect(result.simulated).toBe(true);
  });
});

describe('demo tool backend', () => {
  it('finds slots inside opening hours', async () => {
    const slots = await new DemoToolBackend().findSlots({ serviceSlug: 'consultation' });
    expect(slots.length).toBeGreaterThan(0);
  });

  it('returns only knowledge that actually matches the query', async () => {
    const backend = new DemoToolBackend();
    expect(await backend.searchKnowledge('parking')).toHaveLength(1);
    expect(await backend.searchKnowledge('zzzzzzzz')).toHaveLength(0);
  });
});
