/**
 * The agent runtime.
 *
 * One function runs every agent: inbound screening, prompt assembly, model
 * routing, a bounded tool-use loop, output screening and cost accounting.
 * Agents differ only by their database row, so adding the Review agent or the
 * No-Show agent needs no change here.
 *
 * Without ANTHROPIC_API_KEY the runtime falls back to a deterministic
 * responder. That keeps the whole ingress path — webhook, dedupe, tenant
 * resolve, handoff, metering — exercisable before any spend.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { estimateCostPaise, type TokenUsage } from '@/lib/agents/cost';
import { HANDOFF_MESSAGE, screenInbound, screenOutbound, type GuardrailFlag } from '@/lib/agents/guardrails';
import { routeModel } from '@/lib/agents/router';
import { buildSystemPrompt, summariseServices } from '@/lib/agents/prompt';
import { definitionsFor, executeTool, type ToolBackend } from '@/lib/agents/tools';
import type { AgentContext } from '@/lib/agents/types';

const MAX_TOOL_ITERATIONS = 4;
const MAX_OUTPUT_TOKENS = 700;

export interface AgentTurnResult {
  reply: string;
  model: string;
  routingReason: string;
  usage: TokenUsage;
  costPaise: number;
  latencyMs: number;
  escalate: boolean;
  escalationReason?: string;
  guardrailFlags: GuardrailFlag[];
  toolCalls: string[];
  simulated: boolean;
}

export async function runAgentTurn(
  ctx: AgentContext,
  inboundText: string,
  backend: ToolBackend,
): Promise<AgentTurnResult> {
  const startedAt = Date.now();
  const inbound = screenInbound(inboundText);

  // Anything clinical, urgent or angry never reaches the model.
  if (inbound.escalate) {
    await backend.escalateToHuman(inbound.reason ?? 'inbound guardrail');
    return {
      reply: HANDOFF_MESSAGE,
      model: 'none',
      routingReason: 'inbound guardrail escalation',
      usage: { inputTokens: 0, outputTokens: 0 },
      costPaise: 0,
      latencyMs: Date.now() - startedAt,
      escalate: true,
      escalationReason: inbound.reason,
      guardrailFlags: inbound.flags,
      toolCalls: [],
      simulated: false,
    };
  }

  const routing = routeModel({
    text: inboundText,
    turnCount: ctx.history.length,
    modelHint: ctx.agent.modelHint,
  });

  const apiKey = env('ANTHROPIC_API_KEY');
  const draft = apiKey
    ? await draftWithModel(ctx, inboundText, backend, routing.model, apiKey)
    : draftWithoutModel(ctx, inboundText);

  // Second line of defence behind the system prompt.
  const outbound = screenOutbound(draft.text);
  const blocked = !outbound.allowed;

  if (blocked) {
    await backend.escalateToHuman(outbound.reason ?? 'outbound guardrail');
  }

  const escalate = blocked || draft.escalated;
  const flags = [...inbound.flags, ...outbound.flags];

  return {
    reply: blocked ? HANDOFF_MESSAGE : draft.text,
    model: draft.model,
    routingReason: routing.reason,
    usage: draft.usage,
    costPaise: estimateCostPaise(draft.model, draft.usage),
    latencyMs: Date.now() - startedAt,
    escalate,
    escalationReason: blocked ? outbound.reason : draft.escalationReason,
    guardrailFlags: flags,
    toolCalls: draft.toolCalls,
    simulated: draft.simulated,
  };
}

interface Draft {
  text: string;
  model: string;
  usage: TokenUsage;
  toolCalls: string[];
  escalated: boolean;
  escalationReason?: string;
  simulated: boolean;
}

async function draftWithModel(
  ctx: AgentContext,
  inboundText: string,
  backend: ToolBackend,
  model: string,
  apiKey: string,
): Promise<Draft> {
  const client = new Anthropic({ apiKey });
  const tools = definitionsFor(ctx.agent.toolAllowlist);

  const messages: Anthropic.MessageParam[] = [
    ...ctx.history.map((turn) => ({ role: turn.role, content: turn.content }) as Anthropic.MessageParam),
    { role: 'user', content: inboundText },
  ];

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const toolCalls: string[] = [];
  let escalated = false;
  let escalationReason: string | undefined;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Cached: the tenant system prompt and knowledge base are stable across
      // turns, and are the largest part of every request (CLAUDE.md section 2).
      system: [
        {
          type: 'text',
          text: buildSystemPrompt(ctx),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: tools.length ? tools : undefined,
      messages,
    });

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;
    usage.cacheReadTokens =
      (usage.cacheReadTokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0);

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (toolUses.length === 0 || response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      return {
        text: text || HANDOFF_MESSAGE,
        model,
        usage,
        toolCalls,
        escalated,
        escalationReason,
        simulated: false,
      };
    }

    messages.push({ role: 'assistant', content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      toolCalls.push(call.name);
      const outcome = await executeTool(
        call.name,
        (call.input ?? {}) as Record<string, unknown>,
        backend,
        ctx.agent.toolAllowlist,
      );
      if (outcome.escalated) {
        escalated = true;
        escalationReason = `agent called escalate_to_human`;
      }
      results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content });
    }

    messages.push({ role: 'user', content: results });
  }

  // Ran out of tool iterations: hand over rather than guess.
  await backend.escalateToHuman('tool loop exhausted');
  return {
    text: HANDOFF_MESSAGE,
    model,
    usage,
    toolCalls,
    escalated: true,
    escalationReason: 'tool loop exhausted',
    simulated: false,
  };
}

/**
 * Deterministic stand-in used when no API key is configured. It answers from
 * the knowledge base and service list only — it never improvises — so the
 * boundary rules hold here too.
 */
function draftWithoutModel(ctx: AgentContext, inboundText: string): Draft {
  const query = inboundText.toLowerCase();
  const scored = ctx.knowledge
    .map((hit) => {
      const haystack = `${hit.title ?? ''} ${hit.content}`.toLowerCase();
      const score = query
        .split(/\W+/)
        .filter((word) => word.length > 3)
        .reduce((acc, word) => acc + (haystack.includes(word) ? 1 : 0), 0);
      return { hit, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const lines: string[] = [];

  if (best && best.score > 0) {
    lines.push(best.hit.content);
  } else if (/price|cost|charge|fees|कितने|कीमत/.test(query)) {
    lines.push('Here is what we offer. Final cost is confirmed at the clinic after an examination.');
    lines.push(summariseServices(ctx.services));
  } else if (/book|appointment|slot|time|मिलना|अपॉइंटमेंट/.test(query)) {
    lines.push(
      `Happy to book you in at ${ctx.business.name}. Which day suits you? We are open ${ctx.business.hoursSummary}.`,
    );
  } else {
    lines.push(
      `Thanks for writing to ${ctx.business.name}. Someone from the team will reply here shortly.`,
    );
  }

  return {
    text: lines.join('\n\n'),
    model: 'offline-fallback',
    usage: { inputTokens: 0, outputTokens: 0 },
    toolCalls: [],
    escalated: false,
    simulated: true,
  };
}
