/**
 * Prompt assembly.
 *
 * The agent's `system_prompt_template` is a database column, so adding or
 * retuning an agent is configuration. Variables come from three places, in
 * increasing priority: tenant config, the agent's own tenant_variables, and
 * facts derived at run time.
 */
import type { AgentContext, ServiceSummary } from '@/lib/agents/types';
import { formatPaise } from '@/lib/agents/cost';

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, key: string) => {
    const value = variables[key.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

export function summariseServices(services: ServiceSummary[]): string {
  if (services.length === 0) return 'No services configured yet.';
  return services
    .map((s) => {
      const price =
        s.pricePaise === null
          ? 'price on examination'
          : `${s.priceIsEstimate ? 'from ' : ''}${formatPaise(s.pricePaise)}`;
      return `- ${s.name} (${s.durationMinutes} min, ${price})`;
    })
    .join('\n');
}

export function buildSystemPrompt(ctx: AgentContext): string {
  const { business, agent } = ctx;

  const variables: Record<string, string> = {
    business_name: business.name,
    tagline: business.tagline ?? '',
    lead_clinician: business.leadClinician ?? 'the clinician',
    experience_years: String(business.experienceYears ?? ''),
    address: business.address ?? '',
    whatsapp: business.whatsapp ?? '',
    hours_summary: business.hoursSummary,
    brand_voice: business.brandVoice ?? '',
    content_sizes: business.contentSizes ?? '',
    services_summary: summariseServices(ctx.services),
    customer_name: ctx.customerName ?? '',
    today: new Date().toLocaleDateString('en-IN', { timeZone: business.timezone }),
    ...Object.fromEntries(
      Object.entries(agent.tenantVariables ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
    ),
  };

  const base = renderTemplate(agent.systemPromptTemplate, variables);

  const knowledge = ctx.knowledge.length
    ? `\n\nApproved facts you may quote:\n${ctx.knowledge
        .map((k) => `- ${k.title ? `${k.title}: ` : ''}${k.content}`)
        .join('\n')}`
    : '';

  return `${base}${knowledge}`;
}
