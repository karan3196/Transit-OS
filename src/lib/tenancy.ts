/**
 * Tenant scoping for server code that holds the service-role key.
 *
 * The service role bypasses RLS, so the database cannot be the last line of
 * defence on these paths. `withTenantScope` makes the tenant explicit and
 * hands back a narrow handle whose every query is filtered on tenant_id. There
 * is no way to get a service-role query builder without naming a tenant first.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { unsafeAdminClient } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Tables whose primary key is the tenant itself rather than a tenant_id column. */
const TENANT_KEYED = new Set(['tenants']);

export class TenantScope {
  constructor(
    readonly tenantId: string,
    private readonly client: SupabaseClient,
  ) {}

  /** Reads from `table`, pre-filtered to this tenant. */
  from(table: string) {
    const column = TENANT_KEYED.has(table) ? 'id' : 'tenant_id';
    return {
      select: (columns = '*') => this.client.from(table).select(columns).eq(column, this.tenantId),
      update: (values: Record<string, unknown>) =>
        this.client.from(table).update(values).eq(column, this.tenantId),
      delete: () => this.client.from(table).delete().eq(column, this.tenantId),
      /** tenant_id is stamped here, so a caller cannot write into another tenant. */
      insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const stamp = (row: Record<string, unknown>) => ({ ...row, tenant_id: this.tenantId });
        const payload = Array.isArray(values) ? values.map(stamp) : stamp(values);
        return this.client.from(table).insert(payload);
      },
      upsert: (
        values: Record<string, unknown> | Record<string, unknown>[],
        options?: { onConflict?: string; ignoreDuplicates?: boolean },
      ) => {
        const stamp = (row: Record<string, unknown>) => ({ ...row, tenant_id: this.tenantId });
        const payload = Array.isArray(values) ? values.map(stamp) : stamp(values);
        return this.client.from(table).upsert(payload, options);
      },
    };
  }

  /** Escape hatch for RPC calls, which carry their own tenant argument. */
  rpc(fn: string, args: Record<string, unknown>) {
    return this.client.rpc(fn, { ...args, p_tenant_id: this.tenantId });
  }
}

export function assertTenantId(tenantId: string | null | undefined): string {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new Error('A valid tenant id is required for this operation.');
  }
  return tenantId;
}

/**
 * Runs `work` against a tenant-scoped handle. Prefer this over reaching for the
 * admin client directly — that import is marked @internal for a reason.
 */
export async function withTenantScope<T>(
  tenantId: string,
  work: (scope: TenantScope) => Promise<T>,
): Promise<T> {
  const id = assertTenantId(tenantId);
  return work(new TenantScope(id, unsafeAdminClient()));
}

/** Resolves the tenant behind an inbound channel identity (phone number id, page id, widget key). */
export async function resolveTenantByChannel(
  channel: 'whatsapp' | 'instagram' | 'webchat' | 'voice',
  externalId: string,
): Promise<string | null> {
  const { data, error } = await unsafeAdminClient()
    .from('channel_identities')
    .select('tenant_id')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .maybeSingle();

  if (error) throw error;
  return (data as { tenant_id: string } | null)?.tenant_id ?? null;
}
