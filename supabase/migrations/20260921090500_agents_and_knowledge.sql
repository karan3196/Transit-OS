-- Karyalaya · 0006 · agent definitions, runs and the retrieval corpus.
--
-- An agent is a row, not an application. Adding one is configuration:
-- a prompt template, a tool allowlist, a trigger and an escalation rule.

create type public.agent_trigger as enum ('inbound_message', 'schedule', 'event', 'manual');
create type public.agent_run_status as enum ('running', 'succeeded', 'escalated', 'blocked', 'failed');

create table public.agents (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  slug                    text not null,
  name                    text not null,
  description             text,
  system_prompt_template  text not null,
  tool_allowlist          text[] not null default '{}',
  trigger                 public.agent_trigger not null default 'inbound_message',
  trigger_config          jsonb not null default '{}'::jsonb,
  escalation_rule         jsonb not null default '{}'::jsonb,
  tenant_variables        jsonb not null default '{}'::jsonb,
  model_hint              text,
  enabled                 boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (tenant_id, slug)
);

create trigger agents_updated_at before update on public.agents
  for each row execute function public.set_updated_at();

create table public.agent_runs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  agent_id            uuid references public.agents(id) on delete set null,
  conversation_id     uuid references public.conversations(id) on delete set null,
  status              public.agent_run_status not null default 'running',
  model               text,
  input_tokens        int not null default 0,
  output_tokens       int not null default 0,
  cache_read_tokens   int not null default 0,
  latency_ms          int,
  cost_paise          bigint not null default 0,
  escalation_reason   text,
  guardrail_flags     text[] not null default '{}',
  error               text,
  started_at          timestamptz not null default now(),
  finished_at         timestamptz
);

create index agent_runs_tenant_idx on public.agent_runs (tenant_id, started_at desc);

alter table public.messages
  add constraint messages_agent_run_fk
  foreign key (agent_run_id) references public.agent_runs(id) on delete set null;

create table public.knowledge_chunks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  source        text not null,
  title         text,
  content       text not null,
  -- Nullable: a tenant is useful with keyword retrieval before embeddings run.
  embedding     extensions.vector(1536),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index knowledge_chunks_tenant_idx on public.knowledge_chunks (tenant_id);
create index knowledge_chunks_fts_idx
  on public.knowledge_chunks using gin (to_tsvector('english', coalesce(title, '') || ' ' || content));

create trigger knowledge_chunks_updated_at before update on public.knowledge_chunks
  for each row execute function public.set_updated_at();
