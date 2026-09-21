/**
 * Who is signed in, and which tenants they may see.
 *
 * Both reads go through the RLS-protected user client, so the membership list
 * a page acts on is the same one the database will enforce on every later
 * query. There is no place where the portal trusts a tenant id from the
 * request.
 */
import { createUserClient } from '@/lib/supabase/server';
import { demoTenant } from '@/lib/data/fixtures';
import { isDemoMode } from '@/lib/env';

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface Membership {
  tenantId: string;
  name: string;
  slug: string;
  plan: 'starter' | 'growth' | 'pro';
  status: string;
  timezone: string;
  role: 'owner' | 'manager' | 'staff';
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (isDemoMode()) {
    return { id: 'demo-user', email: 'demo@karyalaya.local' };
  }

  const supabase = await createUserClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id, email: user.email ?? null } : null;
  } catch {
    // Unreachable auth server reads as signed out, which sends the visitor to
    // the login page rather than a stack trace.
    return null;
  }
}

export async function getMemberships(): Promise<Membership[]> {
  if (isDemoMode()) {
    return [
      {
        tenantId: demoTenant.id,
        name: demoTenant.name,
        slug: demoTenant.slug,
        plan: demoTenant.plan,
        status: demoTenant.status,
        timezone: demoTenant.timezone,
        role: 'owner',
      },
    ];
  }

  const user = await getSessionUser();
  if (!user) return [];

  const supabase = await createUserClient();

  const { data } = await supabase
    .from('users')
    .select('role, tenant_id, tenants(id, name, slug, plan, status, timezone)')
    .eq('auth_user_id', user.id)
    .is('disabled_at', null);

  return ((data ?? []) as any[])
    .filter((row) => row.tenants)
    .map((row) => ({
      tenantId: row.tenants.id,
      name: row.tenants.name,
      slug: row.tenants.slug,
      plan: row.tenants.plan,
      status: row.tenants.status,
      timezone: row.tenants.timezone,
      role: row.role,
    }));
}
