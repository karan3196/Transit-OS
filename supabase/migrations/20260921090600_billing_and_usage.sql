-- Karyalaya · 0007 · metering, billing and WhatsApp template registry.

create type public.usage_kind as enum (
  'ai_conversation', 'ai_tokens', 'whatsapp_template', 'whatsapp_service',
  'voice_minute', 'instagram_message'
);
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');
create type public.template_status as enum ('draft', 'submitted', 'approved', 'rejected', 'paused');

-- One row per billable event. Margin is only defensible if this is complete.
create table public.usage_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  kind          public.usage_kind not null,
  quantity      numeric(14, 4) not null default 1,
  cost_paise    bigint not null default 0,
  agent_run_id  uuid references public.agent_runs(id) on delete set null,
  metadata      jsonb not null default '{}'::jsonb,
  occurred_at   timestamptz not null default now()
);

create index usage_events_rollup_idx on public.usage_events (tenant_id, occurred_at desc, kind);

create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  plan                    public.plan_tier not null,
  status                  public.subscription_status not null default 'trialing',
  provider                text not null default 'razorpay',
  provider_subscription_id text,
  amount_paise            bigint not null default 0,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (tenant_id, provider, provider_subscription_id)
);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Meta-approved message templates, per tenant. Paid sends are metered above.
create table public.templates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  channel       public.consent_channel not null default 'whatsapp',
  language      text not null default 'en',
  category      text not null default 'utility',
  body          text not null,
  variables     text[] not null default '{}',
  status        public.template_status not null default 'draft',
  provider_template_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, name, language)
);

create trigger templates_updated_at before update on public.templates
  for each row execute function public.set_updated_at();

-- Raw webhook envelopes, kept briefly for replay and debugging. The unique
-- index is the outer idempotency guard, ahead of message-level dedupe.
create table public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references public.tenants(id) on delete cascade,
  provider        text not null,
  external_id     text not null,
  payload         jsonb not null,
  processed_at    timestamptz,
  error           text,
  received_at     timestamptz not null default now(),
  unique (provider, external_id)
);

create index webhook_events_unprocessed_idx on public.webhook_events (received_at)
  where processed_at is null;
