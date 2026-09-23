-- Karyalaya · 0001 · extensions, shared helpers and the tenant-scope primitive.
--
-- Tenant scope is resolved from one of two sources, in order:
--   1. the `app.tenant_id` GUC, set explicitly by server code that holds the
--      service-role key (see src/lib/tenancy.ts);
--   2. the tenant memberships of the currently authenticated Supabase user.
-- Everything else in the schema builds on `public.current_tenant_ids()`.

create schema if not exists extensions;
grant usage on schema extensions to public;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

-- Every mutable table carries updated_at; this keeps it honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Returns the tenant ids the current database session is allowed to see.
-- Marked STABLE so Postgres can cache it per statement inside RLS policies.
create or replace function public.current_tenant_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  scoped text := current_setting('app.tenant_id', true);
begin
  if scoped is not null and scoped <> '' then
    return query select scoped::uuid;
    return;
  end if;

  if auth.uid() is null then
    return;
  end if;

  return query
    select u.tenant_id
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.disabled_at is null;
end;
$$;

comment on function public.current_tenant_ids() is
  'Tenant ids visible to this session: the explicit app.tenant_id scope, else the auth user''s memberships.';

-- Convenience wrapper for single-tenant checks in application code.
create or replace function public.has_tenant_access(target uuid)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.current_tenant_ids() t where t = target);
$$;
