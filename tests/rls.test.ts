/**
 * Tenant isolation, idempotency and booking conflicts — the three things in
 * CLAUDE.md section 7 that can leak data or lose money, tested against real
 * Postgres rather than a mock.
 *
 * Skipped when DATABASE_URL is unset. See tests/helpers/db.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_URL, seedTwoTenants, setupDatabase, TENANT_A, TENANT_B, USER_A, USER_B, type TestDb } from './helpers/db';

const suite = DATABASE_URL ? describe : describe.skip;

suite('row level security', () => {
  let db: TestDb;
  let seed: Awaited<ReturnType<typeof seedTwoTenants>>;

  beforeAll(async () => {
    db = await setupDatabase();
    seed = await seedTwoTenants(db);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('enables RLS on every table that holds tenant data', async () => {
    const { rows } = await db.client.query(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);

    const unprotected = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(unprotected).toEqual([]);
  });

  it('gives every tenant-scoped table a NOT NULL tenant_id', async () => {
    const { rows } = await db.client.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and c.relname not in ('tenants', 'webhook_events')
        and not exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'tenant_id'
            and a.attnotnull and not a.attisdropped
        )
    `);

    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('shows a staff user only their own tenant', async () => {
    const customers = await db.asUser(USER_A, async (c) => {
      const { rows } = await c.query('select tenant_id, full_name from public.customers');
      return rows;
    });

    expect(customers).toHaveLength(1);
    expect(customers[0].tenant_id).toBe(TENANT_A);
    expect(customers[0].full_name).toBe('Priya Menon');
  });

  it('hides the other tenant even when its row id is known', async () => {
    const rows = await db.asUser(USER_A, async (c) => {
      const result = await c.query('select id from public.conversations where id = $1', [
        seed.conversationB,
      ]);
      return result.rows;
    });

    expect(rows).toHaveLength(0);
  });

  it('refuses a write into another tenant', async () => {
    await expect(
      db.asUser(USER_A, (c) =>
        c.query(
          `insert into public.customers (tenant_id, phone_e164, full_name) values ($1, '+919800000000', 'Injected')`,
          [TENANT_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('refuses to move a row into another tenant with an update', async () => {
    await expect(
      db.asUser(USER_A, (c) =>
        c.query('update public.customers set tenant_id = $1 where tenant_id = $2', [
          TENANT_B,
          TENANT_A,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('silently affects nothing when deleting another tenant\'s rows', async () => {
    const deleted = await db.asUser(USER_A, async (c) => {
      const result = await c.query('delete from public.conversations where id = $1', [
        seed.conversationB,
      ]);
      return result.rowCount;
    });

    expect(deleted).toBe(0);
  });

  it('shows an anonymous visitor nothing at all', async () => {
    // Migration 0008 revokes anon's table privileges on top of RLS, so a read
    // fails closed with a permission error rather than an empty result set.
    // Either outcome is acceptable here; a row coming back is not.
    for (const table of ['customers', 'conversations', 'messages', 'bookings', 'tenants']) {
      const rows = await db
        .asAnon(async (c) => {
          const result = await c.query(`select * from public.${table}`);
          return result.rows;
        })
        .catch((error: Error) => {
          expect(error.message, table).toMatch(/permission denied/i);
          return [];
        });

      expect(rows, table).toHaveLength(0);
    }
  });

  it('never exposes encrypted channel credentials to a signed-in user', async () => {
    await db.client.query(
      `insert into public.tenant_secrets (tenant_id, key, ciphertext) values ($1, 'whatsapp_token', 'v1.x.y.z')`,
      [TENANT_A],
    );

    const rows = await db.asUser(USER_A, async (c) => {
      const result = await c.query('select * from public.tenant_secrets');
      return result.rows;
    });

    expect(rows).toHaveLength(0);
  });

  it('scopes server code through app.tenant_id when there is no auth user', async () => {
    const mine = await db.asScopedService(TENANT_B, async (c) => {
      const result = await c.query('select tenant_id from public.customers');
      return result.rows;
    });

    expect(mine).toHaveLength(1);
    expect(mine[0].tenant_id).toBe(TENANT_B);
  });

  it('lets a user who belongs to both tenants see both', async () => {
    await db.client.query(
      `insert into public.users (tenant_id, auth_user_id, email, role) values ($1, $2, 'b@example.com', 'staff')`,
      [TENANT_A, USER_B],
    );

    const rows = await db.asUser(USER_B, async (c) => {
      const result = await c.query('select tenant_id from public.customers order by tenant_id');
      return result.rows;
    });

    expect(rows.map((r) => r.tenant_id)).toEqual([TENANT_A, TENANT_B]);

    await db.client.query('delete from public.users where auth_user_id = $1 and tenant_id = $2', [
      USER_B,
      TENANT_A,
    ]);
  });

  it('stops showing a disabled user anything', async () => {
    await db.client.query('update public.users set disabled_at = now() where auth_user_id = $1', [
      USER_A,
    ]);

    const rows = await db.asUser(USER_A, async (c) => {
      const result = await c.query('select * from public.customers');
      return result.rows;
    });

    expect(rows).toHaveLength(0);

    await db.client.query('update public.users set disabled_at = null where auth_user_id = $1', [
      USER_A,
    ]);
  });
});

suite('webhook idempotency', () => {
  let db: TestDb;
  let seed: Awaited<ReturnType<typeof seedTwoTenants>>;

  beforeAll(async () => {
    db = await setupDatabase();
    seed = await seedTwoTenants(db);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('rejects a replayed provider message id at the database', async () => {
    const insert = () =>
      db.client.query(
        `insert into public.messages (tenant_id, conversation_id, direction, sender, body, provider, provider_message_id)
         values ($1, $2, 'inbound', 'customer', 'hello', 'whatsapp', 'wamid.RETRY')`,
        [TENANT_A, seed.conversationA],
      );

    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/i);
  });

  it('rejects a replay even when it arrives for a different tenant', async () => {
    // Meta message ids are globally unique; a collision across tenants is a
    // replay or a spoof, not a legitimate second message.
    await expect(
      db.client.query(
        `insert into public.messages (tenant_id, conversation_id, direction, sender, body, provider, provider_message_id)
         values ($1, $2, 'inbound', 'customer', 'hello', 'whatsapp', 'wamid.RETRY')`,
        [TENANT_B, seed.conversationB],
      ),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('still allows many internal messages with no provider id', async () => {
    for (let i = 0; i < 3; i += 1) {
      await db.client.query(
        `insert into public.messages (tenant_id, conversation_id, direction, sender, body)
         values ($1, $2, 'outbound', 'agent', 'reply')`,
        [TENANT_A, seed.conversationA],
      );
    }

    const { rows } = await db.client.query(
      `select count(*)::int as n from public.messages where conversation_id = $1 and provider_message_id is null`,
      [seed.conversationA],
    );
    expect(rows[0].n).toBe(3);
  });

  it('rejects a replayed webhook envelope', async () => {
    const insert = () =>
      db.client.query(
        `insert into public.webhook_events (tenant_id, provider, external_id, payload)
         values ($1, 'whatsapp', 'wamid.ENV', '{}'::jsonb)`,
        [TENANT_A],
      );

    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key/i);
  });

  it('moves the conversation cursor forward on every inbound message', async () => {
    await db.client.query(
      `insert into public.messages (tenant_id, conversation_id, direction, sender, body, provider, provider_message_id)
       values ($1, $2, 'inbound', 'customer', 'later', 'whatsapp', 'wamid.LATER')`,
      [TENANT_A, seed.conversationA],
    );

    const { rows } = await db.client.query(
      'select last_inbound_at, last_message_at from public.conversations where id = $1',
      [seed.conversationA],
    );

    expect(rows[0].last_inbound_at).not.toBeNull();
    expect(new Date(rows[0].last_message_at).getTime()).toBeGreaterThan(0);
  });
});

suite('booking conflicts', () => {
  let db: TestDb;
  let seed: Awaited<ReturnType<typeof seedTwoTenants>>;
  let resourceA: string;
  let resourceB: string;

  beforeAll(async () => {
    db = await setupDatabase();
    seed = await seedTwoTenants(db);

    const { rows } = await db.client.query(
      `insert into public.resources (tenant_id, slug, name)
       values ($1, 'chair-1', 'Chair 1'), ($1, 'chair-2', 'Chair 2')
       returning id, slug`,
      [TENANT_A],
    );
    resourceA = rows.find((r) => r.slug === 'chair-1')!.id;
    resourceB = rows.find((r) => r.slug === 'chair-2')!.id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  const book = (resourceId: string | null, start: string, end: string, status = 'confirmed') =>
    db.client.query(
      `insert into public.bookings (tenant_id, customer_id, resource_id, status, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [TENANT_A, seed.customerA, resourceId, status, start, end],
    );

  it('accepts the first booking on a chair', async () => {
    const result = await book(resourceA, '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z');
    expect(result.rows[0].id).toBeTruthy();
  });

  it('rejects an overlapping booking on the same chair', async () => {
    await expect(
      book(resourceA, '2026-10-01T10:30:00Z', '2026-10-01T11:30:00Z'),
    ).rejects.toThrow(/conflicting key value|exclusion constraint/i);
  });

  it('accepts a booking that starts exactly when the previous one ends', async () => {
    const result = await book(resourceA, '2026-10-01T11:00:00Z', '2026-10-01T12:00:00Z');
    expect(result.rows[0].id).toBeTruthy();
  });

  it('accepts the same time on a different chair', async () => {
    const result = await book(resourceB, '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z');
    expect(result.rows[0].id).toBeTruthy();
  });

  it('ignores cancelled bookings when checking for a clash', async () => {
    await book(resourceB, '2026-10-02T10:00:00Z', '2026-10-02T11:00:00Z', 'cancelled');
    const result = await book(resourceB, '2026-10-02T10:00:00Z', '2026-10-02T11:00:00Z');
    expect(result.rows[0].id).toBeTruthy();
  });

  it('rejects a booking that ends before it starts', async () => {
    await expect(
      book(resourceB, '2026-10-03T11:00:00Z', '2026-10-03T10:00:00Z'),
    ).rejects.toThrow(/bookings_time_order/i);
  });

  it('does not constrain bookings with no resource assigned', async () => {
    await book(null, '2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z');
    const result = await book(null, '2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z');
    expect(result.rows[0].id).toBeTruthy();
  });
});
