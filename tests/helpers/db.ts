/**
 * Test harness for the SQL layer.
 *
 * Applies `supabase/migrations` to a throwaway database and stands up the
 * small part of Supabase these migrations depend on: the `auth` schema,
 * `auth.uid()`, and the `anon` / `authenticated` / `service_role` roles with
 * the grants Supabase hands out by default.
 *
 * Set DATABASE_URL to a Postgres superuser connection to run these tests:
 *   DATABASE_URL=postgres://postgres@localhost:5433/postgres npm test
 * Without it the suite skips rather than fails, so `npm test` stays green on a
 * machine with no database.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

export const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Supabase ships pgvector; a stock Postgres does not. Rather than skip the
 * whole isolation suite over an embedding column, the harness swaps the vector
 * type for text when the extension is unavailable. Nothing under test depends
 * on vector search.
 */
async function vectorAvailable(client: Client): Promise<boolean> {
  const { rows } = await client.query(
    `select 1 from pg_available_extensions where name = 'vector'`,
  );
  return rows.length > 0;
}

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }));
}

const BOOTSTRAP = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls;
    end if;
  end $$;

  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key,
    email text
  );

  -- Mirrors Supabase's auth.uid(): the subject of the request's JWT.
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;

  grant usage on schema public, auth to anon, authenticated, service_role;
  grant select on auth.users to anon, authenticated, service_role;

  -- Supabase grants table privileges to these roles by default, which is why
  -- RLS rather than GRANT is what keeps tenants apart.
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
`;

export interface TestDb {
  client: Client;
  close: () => Promise<void>;
  /** Runs `work` as an authenticated Supabase user. */
  asUser: <T>(authUserId: string, work: (c: Client) => Promise<T>) => Promise<T>;
  /** Runs `work` as an anonymous visitor. */
  asAnon: <T>(work: (c: Client) => Promise<T>) => Promise<T>;
  /** Runs `work` with an explicit app.tenant_id scope, as server code does. */
  asScopedService: <T>(tenantId: string, work: (c: Client) => Promise<T>) => Promise<T>;
}

export async function setupDatabase(): Promise<TestDb> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();

  const dbName = `karyalaya_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(DATABASE_URL);
  url.pathname = `/${dbName}`;

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(BOOTSTRAP);

  const hasVector = await vectorAvailable(client);

  for (const migration of migrationFiles()) {
    let sql = migration.sql;
    if (!hasVector) {
      sql = sql
        .replace(/create extension if not exists vector with schema extensions;/g, '')
        .replace(/extensions\.vector\(\d+\)/g, 'text');
    }
    try {
      await client.query(sql);
    } catch (error) {
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`);
    }
  }

  const withRole = async <T>(
    role: string,
    settings: [string, string][],
    work: (c: Client) => Promise<T>,
  ): Promise<T> => {
    await client.query('begin');
    try {
      for (const [key, value] of settings) {
        await client.query('select set_config($1, $2, true)', [key, value]);
      }
      await client.query(`set local role ${role}`);
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  };

  return {
    client,
    close: async () => {
      await client.end();
      const cleanup = new Client({ connectionString: DATABASE_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${dbName} with (force)`);
      await cleanup.end();
    },
    asUser: (authUserId, work) =>
      withRole('authenticated', [['request.jwt.claim.sub', authUserId]], work),
    asAnon: (work) => withRole('anon', [], work),
    asScopedService: (tenantId, work) =>
      withRole('authenticated', [['app.tenant_id', tenantId]], work),
  };
}

export const TENANT_A = '11111111-1111-4111-8111-111111111111';
export const TENANT_B = '22222222-2222-4222-8222-222222222222';
export const USER_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

/** Two tenants, one staff user each, with a customer and a conversation apiece. */
export async function seedTwoTenants(db: TestDb) {
  const { client } = db;

  await client.query(
    `insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`,
    [USER_A, USER_B],
  );

  await client.query(
    `insert into public.tenants (id, slug, name) values ($1, 'alcadent', 'Alcadent India'), ($2, 'other-clinic', 'Other Clinic')`,
    [TENANT_A, TENANT_B],
  );

  await client.query(
    `insert into public.users (tenant_id, auth_user_id, email, role)
     values ($1, $2, 'a@example.com', 'owner'), ($3, $4, 'b@example.com', 'owner')`,
    [TENANT_A, USER_A, TENANT_B, USER_B],
  );

  const { rows } = await client.query(
    `insert into public.customers (tenant_id, phone_e164, full_name)
     values ($1, '+919812345601', 'Priya Menon'), ($2, '+919812345602', 'Someone Else')
     returning id, tenant_id`,
    [TENANT_A, TENANT_B],
  );

  const customerA = rows.find((r) => r.tenant_id === TENANT_A)!.id;
  const customerB = rows.find((r) => r.tenant_id === TENANT_B)!.id;

  const conversations = await client.query(
    `insert into public.conversations (tenant_id, customer_id, channel)
     values ($1, $2, 'whatsapp'), ($3, $4, 'whatsapp')
     returning id, tenant_id`,
    [TENANT_A, customerA, TENANT_B, customerB],
  );

  return {
    customerA,
    customerB,
    conversationA: conversations.rows.find((r) => r.tenant_id === TENANT_A)!.id as string,
    conversationB: conversations.rows.find((r) => r.tenant_id === TENANT_B)!.id as string,
  };
}
