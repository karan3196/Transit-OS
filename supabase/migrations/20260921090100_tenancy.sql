-- Karyalaya · 0002 · tenants, per-tenant configuration and staff users.

create type public.plan_tier as enum ('starter', 'growth', 'pro');
create type public.tenant_status as enum ('onboarding', 'active', 'suspended', 'churned');
create type public.user_role as enum ('owner', 'manager', 'staff');

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  name          text not null,
  vertical      text not null default 'general',
  plan          public.plan_tier not null default 'starter',
  status        public.tenant_status not null default 'onboarding',
  timezone      text not null default 'Asia/Kolkata',
  locale        text not null default 'en-IN',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Everything a tenant needs to run that is not a secret: hours, brand tokens,
-- escalation targets, channel ids. Onboarding a clinic edits this, never code.
create table public.tenant_config (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  business      jsonb not null default '{}'::jsonb,
  hours         jsonb not null default '{}'::jsonb,
  brand         jsonb not null default '{}'::jsonb,
  channels      jsonb not null default '{}'::jsonb,
  escalation    jsonb not null default '{}'::jsonb,
  limits        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Per-tenant channel credentials. Ciphertext only — see src/lib/crypto.ts.
-- No policy grants SELECT to authenticated users; only scoped server code reads these.
create table public.tenant_secrets (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  key             text not null,
  ciphertext      text not null,
  key_version     int not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, key)
);

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  role          public.user_role not null default 'staff',
  disabled_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, auth_user_id)
);

create index users_auth_user_id_idx on public.users (auth_user_id) where disabled_at is null;
create index tenant_secrets_tenant_idx on public.tenant_secrets (tenant_id);

create trigger tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger tenant_config_updated_at before update on public.tenant_config
  for each row execute function public.set_updated_at();
create trigger tenant_secrets_updated_at before update on public.tenant_secrets
  for each row execute function public.set_updated_at();
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Channel identity -> tenant. Inbound webhooks resolve the tenant through this
-- table, so one Meta app can serve every tenant without a code change.
create table public.channel_identities (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  channel         text not null check (channel in ('whatsapp', 'instagram', 'webchat', 'voice')),
  external_id     text not null,
  display_name    text,
  created_at      timestamptz not null default now(),
  unique (channel, external_id)
);

create index channel_identities_tenant_idx on public.channel_identities (tenant_id);
