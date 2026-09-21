/**
 * Web chat widget endpoint (Starter tier channel).
 *
 * Works in demo mode so the portal can be exercised end to end without any
 * infrastructure: the same runtime, guardrails and tool loop, backed by
 * fixtures instead of Postgres.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isDemoMode } from '@/lib/env';
import { runAgentTurn } from '@/lib/agents/runtime';
import { DemoToolBackend } from '@/lib/agents/backend';
import { demoBusiness, demoFrontDeskAgent, demoKnowledge, demoServices } from '@/lib/data/fixtures';
import { resolveTenantByChannel } from '@/lib/tenancy';
import { handleInboundMessage } from '@/lib/ingress';
import type { AgentContext } from '@/lib/agents/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  widgetKey: z.string().min(1).max(64).default('alcadent'),
  message: z.string().min(1).max(2000),
  visitorId: z.string().min(1).max(64),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { widgetKey, message, visitorId, history } = parsed.data;

  if (isDemoMode()) {
    const backend = new DemoToolBackend();
    const context: AgentContext = {
      tenantId: 'demo',
      conversationId: null,
      agent: demoFrontDeskAgent,
      business: demoBusiness,
      services: demoServices,
      knowledge: demoKnowledge,
      history,
    };

    const result = await runAgentTurn(context, message, backend);
    return NextResponse.json({
      reply: result.reply,
      escalated: result.escalate,
      model: result.model,
      costPaise: result.costPaise,
      guardrailFlags: result.guardrailFlags,
      demo: true,
    });
  }

  const tenantId = await resolveTenantByChannel('webchat', widgetKey);
  if (!tenantId) {
    return NextResponse.json({ error: 'Unknown widget.' }, { status: 404 });
  }

  const result = await handleInboundMessage(tenantId, {
    channel: 'webchat',
    provider: 'webchat',
    // Stable per visitor turn, so a retried request does not answer twice.
    providerMessageId: `${visitorId}:${Date.now()}`,
    fromE164: `+00${visitorId.replace(/\D/g, '').slice(0, 10).padStart(10, '0')}`,
    text: message,
    receivedAt: new Date(),
  });

  return NextResponse.json({
    reply: result.reply ?? '',
    escalated: result.escalated ?? false,
    demo: false,
  });
}
