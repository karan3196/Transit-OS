-- Karyalaya · 0008 · row level security.
--
-- CLAUDE.md non-negotiable 1: every table holding client data carries
-- tenant_id NOT NULL and is unreadable without a tenant scope. The standard
-- policy set below is applied uniformly so a new table cannot quietly ship
-- without isolation; special cases are spelled out afterwards.
--
-- Note: RLS is deliberately NOT forced on public.users. current_tenant_ids()
-- is SECURITY DEFINER and reads that table to resolve memberships; forcing RLS
-- would make the resolver depend on the policy it is meant to feed.

do $$
declare
  t text;
  tenant_scoped constant text[] := array[
    'tenant_config', 'channel_identities', 'customers', 'consents',
    'conversations', 'messages', 'services', 'resources', 'bookings',
    'agents', 'agent_runs', 'knowledge_chunks', 'usage_events',
    'subscriptions', 'templates', 'users'
  ];
begin
  foreach t in array tenant_scoped loop
    execute format('alter table public.%I enable row level security', t);

    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (public.has_tenant_access(tenant_id))
    $f$, t || '_select', t);

    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (public.has_tenant_access(tenant_id))
    $f$, t || '_insert', t);

    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (public.has_tenant_access(tenant_id))
        with check (public.has_tenant_access(tenant_id))
    $f$, t || '_update', t);

    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using (public.has_tenant_access(tenant_id))
    $f$, t || '_delete', t);
  end loop;
end;
$$;

-- tenants is keyed on id rather than tenant_id, and is never deleted from the app.
alter table public.tenants enable row level security;

create policy tenants_select on public.tenants
  for select to authenticated
  using (public.has_tenant_access(id));

create policy tenants_update on public.tenants
  for update to authenticated
  using (public.has_tenant_access(id))
  with check (public.has_tenant_access(id));

-- Encrypted channel credentials: no policy, therefore no row is visible to
-- anon or authenticated. Only scoped server code holding the service-role key
-- touches this table (CLAUDE.md non-negotiable 2).
alter table public.tenant_secrets enable row level security;

-- Raw webhook envelopes are infrastructure, not tenant-facing data.
alter table public.webhook_events enable row level security;

-- Belt and braces: revoke the blanket grants Supabase hands to anon so that a
-- missing policy fails closed rather than falling back to table privileges.
revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
