/**
 * Provision a tenant from its profile in /config.
 *
 * Onboarding a new business must not need a developer (CLAUDE.md section 1), so
 * this is the whole path from a JSON file to a working tenant:
 *
 *   npm run onboard -- alcadent                 apply to DATABASE_URL
 *   npm run onboard -- alcadent --owner a@b.in  ... and make that account owner
 *   npm run onboard -- alcadent --sql           print the SQL instead
 *   npm run seed:build                          regenerate supabase/seed.sql
 *
 * Apply and print share one generator, so the local stack and a live project
 * cannot drift.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentTemplateSchema, tenantProfileSchema, validateProfile, type AgentTemplate } from '../src/lib/onboarding/schema.ts';
import { buildProvisionSql } from '../src/lib/onboarding/sql.ts';

const ROOT = process.cwd();

interface Args {
  slug?: string;
  sql: boolean;
  owner?: string;
  out?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sql: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--sql') args.sql = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--owner') args.owner = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (!arg.startsWith('-')) args.slug ??= arg;
    else throw new Error(`Unknown option ${arg}`);
  }

  return args;
}

function loadAgentTemplates(): Map<string, AgentTemplate> {
  const dir = join(ROOT, 'config', 'agents');
  const templates = new Map<string, AgentTemplate>();

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const parsed = agentTemplateSchema.safeParse(raw);

    if (!parsed.success) {
      fail(`config/agents/${file} is not a valid agent template:\n${formatIssues(parsed.error)}`);
    }
    templates.set(parsed.data.slug, parsed.data);
  }

  return templates;
}

function formatIssues(error: { issues: { path: (string | number)[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `  · ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/** Minimal .env reader: enough to find DATABASE_URL without adding a dependency. */
function loadEnvFile(name: string): void {
  let contents: string;
  try {
    contents = readFileSync(join(ROOT, name), 'utf8');
  } catch {
    return;
  }

  for (const line of contents.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    if (process.env[key]) continue;
    process.env[key] = match[2]!.trim().replace(/^["']|["']$/g, '');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.slug) {
    console.log(`
Usage: npm run onboard -- <tenant-slug> [options]

  --sql            Print the SQL to stdout instead of applying it.
  --out <file>     Write the SQL to a file instead of stdout (implies --sql).
  --owner <email>  Link an existing Supabase Auth account as the tenant's owner.

Profiles live in config/tenants/<slug>.json; agent templates in config/agents/.
Applying needs DATABASE_URL (from .env.local, or the environment).
`);
    process.exit(args.help ? 0 : 1);
  }

  const profilePath = join(ROOT, 'config', 'tenants', `${args.slug}.json`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(profilePath, 'utf8'));
  } catch (error) {
    fail(`Could not read ${profilePath}: ${(error as Error).message}`);
  }

  const parsed = tenantProfileSchema.safeParse(raw);
  if (!parsed.success) {
    fail(`config/tenants/${args.slug}.json is not a valid profile:\n${formatIssues(parsed.error)}`);
  }
  const profile = parsed.data;

  if (profile.slug !== args.slug) {
    fail(`Profile slug "${profile.slug}" does not match the filename "${args.slug}.json".`);
  }

  const templates = loadAgentTemplates();
  const problems = validateProfile(profile, templates);
  if (problems.length > 0) {
    fail(`${profile.slug} is not ready to provision:\n${problems.map((p) => `  · ${p}`).join('\n')}`);
  }

  const sql = buildProvisionSql(profile, templates, { ownerEmail: args.owner });

  if (args.out) {
    writeFileSync(join(ROOT, args.out), sql);
    console.error(`✓ Wrote ${args.out} (${profile.agents.length} agents, ${profile.services.length} services)`);
    return;
  }

  if (args.sql) {
    process.stdout.write(sql);
    return;
  }

  loadEnvFile('.env.local');
  loadEnvFile('.env');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    fail(
      'DATABASE_URL is not set, so there is nothing to apply to.\n' +
        '  Local stack: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres\n' +
        '  Or run with --sql to print the statements instead.',
    );
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    // One transaction: a half-provisioned tenant is worse than none.
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    fail(`Provisioning failed and was rolled back: ${(error as Error).message}`);
  } finally {
    await client.end();
  }

  console.log(`✓ Provisioned ${profile.name} (${profile.slug})`);
  console.log(`  ${profile.agents.length} agents · ${profile.services.length} services · ${profile.knowledge.length} knowledge chunks`);
  if (args.owner) console.log(`  Owner: ${args.owner} (no-op if that account has not signed up yet)`);
  if (profile.open_items.length > 0) {
    console.log('\n  Open items on this profile:');
    for (const item of profile.open_items) console.log(`  · ${item}`);
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
