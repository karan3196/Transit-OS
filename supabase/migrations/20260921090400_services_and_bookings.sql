-- Karyalaya · 0005 · services, bookable resources and double-booking prevention.

create extension if not exists btree_gist with schema extensions;

create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  slug              text not null,
  name              text not null,
  description       text,
  duration_minutes  int not null default 30 check (duration_minutes between 5 and 480),
  price_paise       bigint check (price_paise >= 0),
  price_is_estimate boolean not null default true,
  -- Interval in months after which the recall agent follows up. Null = no recall.
  recall_months     int check (recall_months between 1 and 60),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, slug)
);

create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- A chair, a bay, a table, a practitioner — whatever the tenant books against.
create table public.resources (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  slug          text not null,
  name          text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  service_id    uuid references public.services(id) on delete set null,
  resource_id   uuid references public.resources(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  status        public.booking_status not null default 'pending',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  source        text not null default 'agent',
  notes         text,
  reminder_sent_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at)
);

-- Two live bookings can never overlap on the same resource. Enforced by the
-- database so a race between the agent and the front desk cannot double-book.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    tenant_id with =,
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('pending', 'confirmed') and resource_id is not null);

create index bookings_calendar_idx on public.bookings (tenant_id, starts_at);
create index bookings_recall_idx on public.bookings (tenant_id, status, starts_at)
  where status = 'completed';

create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
