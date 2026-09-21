/**
 * Inbound message pipeline.
 *
 * webhook -> signature checked upstream -> normalise -> tenant resolve ->
 * dedupe -> store -> agent turn -> store reply -> meter.
 *
 * Deduplication is a unique-index violation, not an application check
 * (CLAUDE.md non-negotiable 4): Meta retries deliveries, and two workers can
 * race on the same retry.
 */
import { withTenantScope, type TenantScope } from '@/lib/tenancy';
import { runAgentTurn } from '@/lib/agents/runtime';
import { SupabaseToolBackend } from '@/lib/agents/backend';
import { summariseHours, type OpeningHours } from '@/lib/bookings/slots';
import { isServiceWindowOpen, sendText } from '@/lib/whatsapp/client';
import type { AgentContext, AgentRecord, BusinessFacts, ConversationTurn } from '@/lib/agents/types';

const UNIQUE_VIOLATION = '23505';

export interface InboundMessage {
  channel: 'whatsapp' | 'webchat' | 'instagram';
  providerMessageId: string;
  provider: string;
  fromE164: string;
  profileName?: string;
  text: string;
  receivedAt: Date;
  /** Channel address to reply on, e.g. the WhatsApp phone number id. */
  replyAddress?: string;
}

export interface IngressResult {
  status: 'processed' | 'duplicate' | 'ignored' | 'no_agent';
  conversationId?: string;
  reply?: string;
  escalated?: boolean;
}

export async function handleInboundMessage(
  tenantId: string,
  inbound: InboundMessage,
): Promise<IngressResult> {
  return withTenantScope(tenantId, async (scope) => {
    if (!inbound.text.trim()) {
      return { status: 'ignored' as const };
    }

    const tenant = await loadTenant(scope, tenantId);
    const customerId = await upsertCustomer(scope, inbound);
    const conversationId = await openConversation(scope, customerId, inbound);

    // Dedupe gate. A retry of the same Meta delivery stops here.
    const { error: insertError } = await scope.from('messages').insert({
      conversation_id: conversationId,
      direction: 'inbound',
      sender: 'customer',
      body: inbound.text,
      provider: inbound.provider,
      provider_message_id: inbound.providerMessageId,
    });

    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        return { status: 'duplicate' as const, conversationId };
      }
      throw insertError;
    }

    const agent = await loadAgent(scope, inbound.channel);
    if (!agent) {
      return { status: 'no_agent' as const, conversationId };
    }

    const history = await loadHistory(scope, conversationId);
    const backend = new SupabaseToolBackend(scope, {
      conversationId,
      customerId,
      timezone: tenant.timezone,
      hours: tenant.hours,
    });

    const context: AgentContext = {
      tenantId,
      conversationId,
      agent,
      business: tenant.business,
      services: await backend.listServices(),
      knowledge: await backend.searchKnowledge(inbound.text),
      history,
      customerName: inbound.profileName,
    };

    const result = await runAgentTurn(context, inbound.text, backend);

    const { data: runRow } = await scope
      .from('agent_runs')
      .insert({
        agent_id: agent.id,
        conversation_id: conversationId,
        status: result.escalate ? 'escalated' : 'succeeded',
        model: result.model,
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        cache_read_tokens: result.usage.cacheReadTokens ?? 0,
        latency_ms: result.latencyMs,
        cost_paise: result.costPaise,
        escalation_reason: result.escalationReason ?? null,
        guardrail_flags: result.guardrailFlags,
        finished_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    const agentRunId = (runRow as { id: string } | null)?.id ?? null;

    // Replying inside the 24h service window is free; outside it a template
    // would be billed, so we leave it to staff rather than spend silently.
    const windowOpen = isServiceWindowOpen(inbound.receivedAt);
    let sent: { providerMessageId?: string; simulated?: boolean } = {};

    if (inbound.channel === 'whatsapp' && inbound.replyAddress && windowOpen) {
      const send = await sendText(inbound.replyAddress, inbound.fromE164, result.reply);
      sent = { providerMessageId: send.providerMessageId, simulated: send.simulated };
    }

    await scope.from('messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      sender: 'agent',
      body: result.reply,
      provider: inbound.provider,
      provider_message_id: sent.providerMessageId ?? null,
      agent_run_id: agentRunId,
    });

    await scope.from('usage_events').insert([
      {
        kind: 'ai_conversation',
        quantity: 1,
        cost_paise: result.costPaise,
        agent_run_id: agentRunId,
        metadata: { model: result.model, routing: result.routingReason, channel: inbound.channel },
      },
      {
        kind: 'whatsapp_service',
        quantity: inbound.channel === 'whatsapp' && windowOpen ? 1 : 0,
        cost_paise: 0,
        agent_run_id: agentRunId,
        metadata: { service_window: windowOpen, simulated: sent.simulated ?? false },
      },
    ]);

    return {
      status: 'processed' as const,
      conversationId,
      reply: result.reply,
      escalated: result.escalate,
    };
  });
}

interface LoadedTenant {
  timezone: string;
  hours: OpeningHours;
  business: BusinessFacts;
}

async function loadTenant(scope: TenantScope, tenantId: string): Promise<LoadedTenant> {
  const { data: tenantRows } = await scope.from('tenants').select('name, timezone').limit(1);
  const tenantRow = ((tenantRows ?? []) as any[])[0] ?? {};

  const { data: configRows } = await scope
    .from('tenant_config')
    .select('business, hours, brand')
    .limit(1);
  const config = ((configRows ?? []) as any[])[0] ?? {};

  const hours = (config.hours ?? {}) as OpeningHours;
  const business = (config.business ?? {}) as Record<string, any>;

  return {
    timezone: tenantRow.timezone ?? 'Asia/Kolkata',
    hours,
    business: {
      name: tenantRow.name ?? 'the business',
      tagline: business.tagline,
      leadClinician: business.lead_clinician,
      experienceYears: business.experience_years,
      address: business.address,
      whatsapp: business.whatsapp,
      highlights: business.highlights,
      hoursSummary: summariseHours(hours),
      timezone: tenantRow.timezone ?? 'Asia/Kolkata',
    },
  };
}

async function upsertCustomer(scope: TenantScope, inbound: InboundMessage): Promise<string> {
  const { data: existing } = await scope
    .from('customers')
    .select('id')
    .eq('phone_e164', inbound.fromE164)
    .limit(1);

  const found = ((existing ?? []) as any[])[0];
  if (found) {
    await scope
      .from('customers')
      .update({ last_seen_at: inbound.receivedAt.toISOString() })
      .eq('id', found.id);
    return found.id;
  }

  const { data, error } = await scope
    .from('customers')
    .insert({
      phone_e164: inbound.fromE164,
      full_name: inbound.profileName ?? null,
      last_seen_at: inbound.receivedAt.toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string }).id;
}

async function openConversation(
  scope: TenantScope,
  customerId: string,
  inbound: InboundMessage,
): Promise<string> {
  const { data: open } = await scope
    .from('conversations')
    .select('id')
    .eq('customer_id', customerId)
    .eq('channel', inbound.channel)
    .in('status', ['open', 'needs_human', 'snoozed'])
    .order('last_message_at', { ascending: false })
    .limit(1);

  const found = ((open ?? []) as any[])[0];
  if (found) return found.id;

  const { data, error } = await scope
    .from('conversations')
    .insert({
      customer_id: customerId,
      channel: inbound.channel,
      status: 'open',
      last_inbound_at: inbound.receivedAt.toISOString(),
    })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string }).id;
}

async function loadAgent(
  scope: TenantScope,
  channel: InboundMessage['channel'],
): Promise<AgentRecord | null> {
  const { data } = await scope
    .from('agents')
    .select('id, slug, name, system_prompt_template, tool_allowlist, tenant_variables, model_hint, escalation_rule, trigger_config')
    .eq('trigger', 'inbound_message')
    .eq('enabled', true);

  const rows = (data ?? []) as any[];
  const match =
    rows.find((row) => (row.trigger_config?.channels ?? []).includes(channel)) ?? rows[0];

  if (!match) return null;

  return {
    id: match.id,
    slug: match.slug,
    name: match.name,
    systemPromptTemplate: match.system_prompt_template,
    toolAllowlist: match.tool_allowlist ?? [],
    tenantVariables: match.tenant_variables ?? {},
    modelHint: match.model_hint,
    escalationRule: match.escalation_rule ?? {},
  };
}

async function loadHistory(scope: TenantScope, conversationId: string): Promise<ConversationTurn[]> {
  const { data } = await scope
    .from('messages')
    .select('direction, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(11);

  // Newest first from the query, and the newest row is the message we just
  // stored — the runtime appends it itself.
  return ((data ?? []) as any[])
    .slice(1)
    .reverse()
    .map((row) => ({
      role: row.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: row.body,
    }))
    .filter((turn) => turn.content.trim().length > 0);
}
