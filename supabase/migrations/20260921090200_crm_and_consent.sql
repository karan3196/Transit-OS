-- Karyalaya · 0003 · customers and DPDP consent ledger.

create type public.consent_channel as enum ('whatsapp', 'instagram', 'webchat', 'voice', 'email', 'sms');
create type public.consent_state as enum ('granted', 'withdrawn');

create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  phone_e164    text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  full_name     text,
  email         text,
  locale        text not null default 'en-IN',
  tags          text[] not null default '{}',
  -- Appointment metadata only. Clinical notes, diagnoses and treatment records
  -- are explicitly out of scope (CLAUDE.md non-negotiable 7).
  notes         text,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, phone_e164)
);

create index customers_tenant_idx on public.customers (tenant_id, last_seen_at desc nulls last);

create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- Append-only consent ledger. No marketing message goes out without a
-- 'granted' row that has not been superseded by a 'withdrawn' one.
create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  channel       public.consent_channel not null,
  purpose       text not null default 'marketing',
  state         public.consent_state not null,
  source        text not null,
  evidence      jsonb not null default '{}'::jsonb,
  recorded_at   timestamptz not null default now()
);

create index consents_lookup_idx
  on public.consents (tenant_id, customer_id, channel, purpose, recorded_at desc);

-- Current consent state for a customer/channel/purpose: latest row wins.
create or replace function public.has_consent(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_channel public.consent_channel,
  p_purpose text default 'marketing'
)
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select c.state = 'granted'
      from public.consents c
      where c.tenant_id = p_tenant_id
        and c.customer_id = p_customer_id
        and c.channel = p_channel
        and c.purpose = p_purpose
      order by c.recorded_at desc
      limit 1
    ),
    false
  );
$$;
