-- Karyalaya · 0004 · conversations, messages and the staff handoff queue.

create type public.conversation_status as enum ('open', 'needs_human', 'snoozed', 'closed');
create type public.message_direction as enum ('inbound', 'outbound');
create type public.message_sender as enum ('customer', 'agent', 'staff', 'system');

create table public.conversations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  customer_id       uuid not null references public.customers(id) on delete cascade,
  channel           public.consent_channel not null,
  status            public.conversation_status not null default 'open',
  subject           text,
  assigned_user_id  uuid references public.users(id) on delete set null,
  escalation_reason text,
  -- Meta's free service window closes 24h after the customer's last message.
  last_inbound_at   timestamptz,
  last_message_at   timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index conversations_inbox_idx
  on public.conversations (tenant_id, status, last_message_at desc);
create index conversations_customer_idx on public.conversations (tenant_id, customer_id);

create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  conversation_id       uuid not null references public.conversations(id) on delete cascade,
  direction             public.message_direction not null,
  sender                public.message_sender not null,
  body                  text not null default '',
  media                 jsonb not null default '[]'::jsonb,
  -- Meta retries webhooks. Dedupe is a database constraint, not app logic
  -- (CLAUDE.md non-negotiable 4).
  provider              text not null default 'internal',
  provider_message_id   text,
  agent_run_id          uuid,
  created_at            timestamptz not null default now()
);

create unique index messages_provider_dedupe_idx
  on public.messages (provider, provider_message_id)
  where provider_message_id is not null;

create index messages_thread_idx on public.messages (tenant_id, conversation_id, created_at);

-- Keep the conversation header in step with its newest message.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations c
     set last_message_at = new.created_at,
         last_inbound_at = case when new.direction = 'inbound' then new.created_at else c.last_inbound_at end
   where c.id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();
