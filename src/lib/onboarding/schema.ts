/**
 * Schemas for the onboarding files in /config.
 *
 * These are as much a contract with Cowork as with the code: a profile that
 * parses is one the provisioner can apply without a developer. Anything
 * missing fails here, with a path, rather than halfway through a transaction.
 */
import { z } from 'zod';

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, 'Slugs are lowercase, 3-50 chars, a-z 0-9 and dashes.');

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, 'Times are HH:MM.');

export const agentTemplateSchema = z.object({
  $comment: z.string().optional(),
  slug,
  name: z.string().min(1),
  description: z.string().default(''),
  trigger: z.enum(['inbound_message', 'schedule', 'event', 'manual']),
  trigger_config: z.record(z.unknown()).default({}),
  tool_allowlist: z.array(z.string()).default([]),
  escalation_rule: z.record(z.unknown()).default({}),
  model_hint: z.string().nullable().default(null),
  system_prompt_template: z.string().min(20),
});

export type AgentTemplate = z.infer<typeof agentTemplateSchema>;

export const tenantProfileSchema = z.object({
  $comment: z.string().optional(),

  /** Pin the uuid to keep a tenant stable across rebuilds. Optional. */
  id: z.string().uuid().optional(),
  slug,
  name: z.string().min(1),
  vertical: z.string().default('general'),
  plan: z.enum(['starter', 'growth', 'pro']).default('starter'),
  status: z.enum(['onboarding', 'active', 'suspended', 'churned']).default('onboarding'),
  timezone: z.string().default('Asia/Kolkata'),
  locale: z.string().default('en-IN'),

  business: z.record(z.unknown()).default({}),
  hours: z.record(z.tuple([hhmm, hhmm]).or(z.array(z.string()).max(0))).default({}),
  brand: z.record(z.unknown()).default({}),
  escalation: z.record(z.unknown()).default({}),
  limits: z.record(z.unknown()).default({}),

  channels: z
    .object({
      whatsapp: z
        .object({ enabled: z.boolean().default(false), phone_number_id: z.string().optional() })
        .default({ enabled: false }),
      webchat: z
        .object({ enabled: z.boolean().default(false), widget_key: z.string().optional() })
        .default({ enabled: false }),
      instagram: z
        .object({ enabled: z.boolean().default(false), page_id: z.string().optional() })
        .default({ enabled: false }),
      voice: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
    })
    .default({}),

  resources: z.array(z.object({ slug, name: z.string().min(1) })).default([]),

  services: z
    .array(
      z.object({
        slug,
        name: z.string().min(1),
        description: z.string().nullable().default(null),
        duration_minutes: z.number().int().min(5).max(480),
        price_paise: z.number().int().min(0).nullable().default(null),
        price_is_estimate: z.boolean().default(true),
        recall_months: z.number().int().min(1).max(60).nullable().default(null),
      }),
    )
    .default([]),

  knowledge: z
    .array(
      z.object({
        source: z.string().min(1),
        title: z.string().nullable().default(null),
        content: z.string().min(1),
        approved_by: z.string().optional(),
      }),
    )
    .default([]),

  message_templates: z
    .array(
      z.object({
        name: z.string().min(1),
        language: z.string().default('en'),
        category: z.string().default('utility'),
        body: z.string().min(1),
        variables: z.array(z.string()).default([]),
      }),
    )
    .default([]),

  agents: z.array(slug).default([]),
  agent_variables: z.record(z.string()).default({}),

  open_items: z.array(z.string()).default([]),
});

export type TenantProfile = z.infer<typeof tenantProfileSchema>;

/**
 * Cross-file checks the per-file schemas cannot make on their own.
 * Returns human-readable problems; an empty array means the profile is
 * provisionable.
 */
export function validateProfile(
  profile: TenantProfile,
  templates: Map<string, AgentTemplate>,
): string[] {
  const problems: string[] = [];

  for (const agentSlug of profile.agents) {
    if (!templates.has(agentSlug)) {
      problems.push(`Agent template "${agentSlug}" not found in /config/agents.`);
    }
  }

  if (profile.channels.whatsapp.enabled && !profile.channels.whatsapp.phone_number_id) {
    problems.push('WhatsApp is enabled but channels.whatsapp.phone_number_id is missing; inbound messages could not be routed to this tenant.');
  }

  if (profile.channels.webchat.enabled && !profile.channels.webchat.widget_key) {
    problems.push('Web chat is enabled but channels.webchat.widget_key is missing.');
  }

  if (profile.channels.instagram.enabled && !profile.channels.instagram.page_id) {
    problems.push('Instagram is enabled but channels.instagram.page_id is missing.');
  }

  if (profile.channels.voice.enabled && profile.plan !== 'pro') {
    problems.push(`Voice is Pro-only, but this tenant is on the ${profile.plan} plan.`);
  }

  const serviceSlugs = new Set<string>();
  for (const service of profile.services) {
    if (serviceSlugs.has(service.slug)) problems.push(`Duplicate service slug "${service.slug}".`);
    serviceSlugs.add(service.slug);
  }

  // Every placeholder an installed agent needs must be resolvable. The runtime
  // fills business facts itself; everything else comes from agent_variables.
  const runtimeProvided = new Set([
    'business_name', 'tagline', 'lead_clinician', 'experience_years', 'address',
    'whatsapp', 'hours_summary', 'services_summary', 'customer_name', 'today',
    'recall_context', 'brand_voice', 'content_sizes',
  ]);

  for (const agentSlug of profile.agents) {
    const template = templates.get(agentSlug);
    if (!template) continue;

    const placeholders = [...template.system_prompt_template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)]
      .map((match) => match[1]!.toLowerCase());

    for (const placeholder of new Set(placeholders)) {
      if (!runtimeProvided.has(placeholder) && !(placeholder in profile.agent_variables)) {
        problems.push(
          `Agent "${agentSlug}" uses {{${placeholder}}}, which is not in agent_variables and is not supplied by the runtime.`,
        );
      }
    }
  }

  if (profile.agents.length > 0 && !profile.agents.includes('front-desk')) {
    problems.push('No front-desk agent: inbound messages would have nothing to answer them.');
  }

  return problems;
}
