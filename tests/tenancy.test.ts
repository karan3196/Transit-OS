import { describe, expect, it } from 'vitest';
import { TenantScope, assertTenantId } from '@/lib/tenancy';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

/**
 * A stub that records what the scope actually sends to PostgREST. The point of
 * TenantScope is that service-role code cannot issue an unscoped query, so the
 * assertions here are about the filters and the stamped tenant_id.
 */
function stubClient() {
  const calls: { table: string; op: string; filters: [string, unknown][]; payload?: unknown }[] = [];

  const builder = (table: string, op: string, payload?: unknown) => {
    const record = { table, op, filters: [] as [string, unknown][], payload };
    calls.push(record);
    const chain: any = {
      eq(column: string, value: unknown) {
        record.filters.push([column, value]);
        return chain;
      },
      in(column: string, value: unknown) {
        record.filters.push([column, value]);
        return chain;
      },
      limit: () => chain,
      order: () => chain,
      select: () => chain,
    };
    return chain;
  };

  const client = {
    from(table: string) {
      return {
        select: () => builder(table, 'select'),
        update: (values: unknown) => builder(table, 'update', values),
        delete: () => builder(table, 'delete'),
        insert: (values: unknown) => builder(table, 'insert', values),
        upsert: (values: unknown) => builder(table, 'upsert', values),
      };
    },
  };

  return { client: client as any, calls };
}

describe('tenant id validation', () => {
  it('accepts a well-formed uuid', () => {
    expect(assertTenantId(TENANT_A)).toBe(TENANT_A);
  });

  it('rejects null, empty and non-uuid values', () => {
    for (const bad of [null, undefined, '', 'alcadent', '1234', '../../etc/passwd']) {
      expect(() => assertTenantId(bad as string), String(bad)).toThrow(/valid tenant id/i);
    }
  });
});

describe('TenantScope', () => {
  it('filters every select on tenant_id', () => {
    const { client, calls } = stubClient();
    new TenantScope(TENANT_A, client).from('customers').select('id');
    expect(calls[0]!.filters).toContainEqual(['tenant_id', TENANT_A]);
  });

  it('filters updates and deletes too', () => {
    const { client, calls } = stubClient();
    const scope = new TenantScope(TENANT_A, client);
    scope.from('conversations').update({ status: 'closed' });
    scope.from('conversations').delete();

    expect(calls[0]!.filters).toContainEqual(['tenant_id', TENANT_A]);
    expect(calls[1]!.filters).toContainEqual(['tenant_id', TENANT_A]);
  });

  it('stamps tenant_id on inserts, overriding any value the caller supplied', () => {
    const { client, calls } = stubClient();
    new TenantScope(TENANT_A, client)
      .from('messages')
      .insert({ body: 'hello', tenant_id: TENANT_B });

    expect(calls[0]!.payload).toEqual({ body: 'hello', tenant_id: TENANT_A });
  });

  it('stamps every row of a bulk insert', () => {
    const { client, calls } = stubClient();
    new TenantScope(TENANT_A, client)
      .from('usage_events')
      .insert([{ kind: 'ai_conversation' }, { kind: 'whatsapp_service', tenant_id: TENANT_B }]);

    expect(calls[0]!.payload).toEqual([
      { kind: 'ai_conversation', tenant_id: TENANT_A },
      { kind: 'whatsapp_service', tenant_id: TENANT_A },
    ]);
  });

  it('filters the tenants table on its own primary key', () => {
    const { client, calls } = stubClient();
    new TenantScope(TENANT_A, client).from('tenants').select('name');
    expect(calls[0]!.filters).toContainEqual(['id', TENANT_A]);
  });

  it('passes the tenant id into RPC calls', () => {
    const args: Record<string, unknown>[] = [];
    const client = { rpc: (_fn: string, a: Record<string, unknown>) => args.push(a) } as any;
    new TenantScope(TENANT_A, client).rpc('has_consent', { p_customer_id: 'c1' });
    expect(args[0]).toMatchObject({ p_customer_id: 'c1', p_tenant_id: TENANT_A });
  });
});
