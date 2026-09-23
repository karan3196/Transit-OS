/**
 * Onboarding is the feature that decides whether this scales past one client,
 * so the checks that stop a bad profile reaching the database are tested here,
 * along with the SQL escaping that makes generating statements safe at all.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  agentTemplateSchema,
  tenantProfileSchema,
  validateProfile,
  type AgentTemplate,
} from '@/lib/onboarding/schema';
import {
  buildProvisionSql,
  quote,
  quoteJson,
  quoteNumber,
  quoteTextArray,
} from '@/lib/onboarding/sql';

const ROOT = process.cwd();

function loadTemplates(): Map<string, AgentTemplate> {
  const dir = join(ROOT, 'config', 'agents');
  const map = new Map<string, AgentTemplate>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const parsed = agentTemplateSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    map.set(parsed.slug, parsed);
  }
  return map;
}

function loadAlcadent() {
  return tenantProfileSchema.parse(
    JSON.parse(readFileSync(join(ROOT, 'config', 'tenants', 'alcadent.json'), 'utf8')),
  );
}

const minimalProfile = (overrides: Record<string, unknown> = {}) => ({
  slug: 'test-clinic',
  name: 'Test Clinic',
  agents: ['front-desk'],
  agent_variables: { business_name: 'Test Clinic', boundaries: '- nothing clinical' },
  ...overrides,
});

describe('SQL literal escaping', () => {
  it("doubles apostrophes so a name cannot close the literal", () => {
    expect(quote("Dr O'Brien's Clinic")).toBe("'Dr O''Brien''s Clinic'");
  });

  it('neutralises an attempt to end the statement early', () => {
    const injected = quote("x'; drop table public.tenants; --");
    expect(injected).toBe("'x''; drop table public.tenants; --'");
    // One literal, start to finish: no odd number of quotes in the middle.
    expect(injected.slice(1, -1).split("'").length % 2).toBe(1);
  });

  it('refuses a null byte rather than emitting something Postgres will reject', () => {
    expect(() => quote('bad\0value')).toThrow(/null byte/i);
  });

  it('emits a typed empty array rather than an untyped one', () => {
    expect(quoteTextArray([])).toBe(`'{}'::text[]`);
    expect(quoteTextArray(["a", "b'c"])).toBe(`array['a', 'b''c']`);
  });

  it('refuses non-finite numbers', () => {
    expect(quoteNumber(30)).toBe('30');
    expect(quoteNumber(null)).toBe('null');
    expect(() => quoteNumber(Number.NaN)).toThrow(/non-finite/i);
    expect(() => quoteNumber(Number.POSITIVE_INFINITY)).toThrow(/non-finite/i);
  });

  it('escapes quotes inside embedded JSON', () => {
    expect(quoteJson({ voice: "parent's voice" })).toBe(`'{"voice":"parent''s voice"}'::jsonb`);
  });
});

describe('profile schema', () => {
  it('accepts a minimal profile and fills in the defaults', () => {
    const profile = tenantProfileSchema.parse(minimalProfile());
    expect(profile.plan).toBe('starter');
    expect(profile.status).toBe('onboarding');
    expect(profile.timezone).toBe('Asia/Kolkata');
    expect(profile.services).toEqual([]);
  });

  it('rejects a slug that would not survive the database check constraint', () => {
    for (const slug of ['A', 'no', 'Has Spaces', 'UPPER', '-leading', 'trailing-']) {
      expect(tenantProfileSchema.safeParse(minimalProfile({ slug })).success, slug).toBe(false);
    }
  });

  it('rejects an appointment length the bookings table would refuse', () => {
    const withService = (duration: number) =>
      minimalProfile({
        services: [{ slug: 'x-ray', name: 'X-ray', duration_minutes: duration }],
      });

    expect(tenantProfileSchema.safeParse(withService(30)).success).toBe(true);
    expect(tenantProfileSchema.safeParse(withService(2)).success).toBe(false);
    expect(tenantProfileSchema.safeParse(withService(600)).success).toBe(false);
  });

  it('rejects malformed opening hours', () => {
    expect(tenantProfileSchema.safeParse(minimalProfile({ hours: { mon: ['10am', '8pm'] } })).success).toBe(
      false,
    );
    expect(tenantProfileSchema.safeParse(minimalProfile({ hours: { mon: ['10:00', '20:00'] } })).success).toBe(
      true,
    );
  });
});

describe('cross-file validation', () => {
  const templates = loadTemplates();
  const check = (overrides: Record<string, unknown> = {}) =>
    validateProfile(tenantProfileSchema.parse(minimalProfile(overrides)), templates);

  it('passes a well-formed profile', () => {
    expect(check()).toEqual([]);
  });

  it('catches an agent with no template on disk', () => {
    expect(check({ agents: ['front-desk', 'no-such-agent'] }).join(' ')).toMatch(/no-such-agent/);
  });

  it('catches a prompt variable nothing will fill', () => {
    expect(check({ agent_variables: { business_name: 'Test Clinic' } }).join(' ')).toMatch(
      /\{\{boundaries\}\}/,
    );
  });

  it('catches WhatsApp enabled with no phone number id to route on', () => {
    const problems = check({ channels: { whatsapp: { enabled: true } } });
    expect(problems.join(' ')).toMatch(/phone_number_id/);
  });

  it('catches web chat enabled with no widget key', () => {
    expect(check({ channels: { webchat: { enabled: true } } }).join(' ')).toMatch(/widget_key/);
  });

  it('catches voice sold below the Pro plan', () => {
    const problems = check({ plan: 'growth', channels: { voice: { enabled: true } } });
    expect(problems.join(' ')).toMatch(/Voice is Pro-only/);
  });

  it('catches duplicate service slugs before the unique index does', () => {
    const problems = check({
      services: [
        { slug: 'cleaning', name: 'Cleaning', duration_minutes: 30 },
        { slug: 'cleaning', name: 'Cleaning again', duration_minutes: 30 },
      ],
    });
    expect(problems.join(' ')).toMatch(/Duplicate service slug/);
  });

  it('catches a tenant with agents but nothing to answer inbound messages', () => {
    const problems = check({ agents: ['recall'], agent_variables: { business_name: 'T', boundaries: '-' } });
    expect(problems.join(' ')).toMatch(/No front-desk agent/);
  });
});

describe('SQL generation', () => {
  const templates = loadTemplates();

  it('looks the tenant up by slug rather than baking in an id', () => {
    const sql = buildProvisionSql(tenantProfileSchema.parse(minimalProfile()), templates);
    expect(sql).toContain("(select id from public.tenants where slug = 'test-clinic')");
  });

  it('is written entirely as upserts, so a second run changes nothing', () => {
    const sql = buildProvisionSql(loadAlcadent(), templates);
    const inserts = sql.match(/^insert into/gm) ?? [];
    const conflicts = sql.match(/^on conflict/gm) ?? [];
    // knowledge_chunks has no natural key and is replaced by a scoped delete.
    expect(sql).toContain("metadata ->> 'managed_by' = 'onboarding'");
    expect(conflicts.length).toBe(inserts.length - 1);
  });

  it('emits the owner link only when an owner was asked for', () => {
    const profile = tenantProfileSchema.parse(minimalProfile());
    expect(buildProvisionSql(profile, templates)).not.toContain('auth.users');
    expect(buildProvisionSql(profile, templates, { ownerEmail: "o'hara@clinic.in" })).toContain(
      "lower('o''hara@clinic.in')",
    );
  });

  it('carries a business name with an apostrophe through safely', () => {
    const sql = buildProvisionSql(
      tenantProfileSchema.parse(minimalProfile({ name: "Karan's Clinic" })),
      templates,
    );
    expect(sql).toContain("'Karan''s Clinic'");
  });

  it('skips sections a profile does not use', () => {
    const sql = buildProvisionSql(tenantProfileSchema.parse(minimalProfile()), templates);
    expect(sql).not.toContain('insert into public.services');
    expect(sql).not.toContain('insert into public.resources');
    expect(sql).not.toContain('insert into public.templates');
  });
});

describe('the files actually in /config', () => {
  it('every agent template parses', () => {
    const dir = join(ROOT, 'config', 'agents');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const result = agentTemplateSchema.safeParse(
        JSON.parse(readFileSync(join(dir, file), 'utf8')),
      );
      expect(result.success, `${file}: ${result.success ? '' : result.error.message}`).toBe(true);
    }
  });

  it('every tenant profile parses and is provisionable', () => {
    const dir = join(ROOT, 'config', 'tenants');
    const templates = loadTemplates();

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const parsed = tenantProfileSchema.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
      expect(parsed.success, `${file} does not parse`).toBe(true);
      if (!parsed.success) continue;

      expect(`${parsed.data.slug}.json`, 'filename must match the slug').toBe(file);
      expect(validateProfile(parsed.data, templates), file).toEqual([]);
    }
  });

  it('supabase/seed.sql is what the generator produces', () => {
    // Guards against seed.sql being hand-edited and drifting from the profile
    // that is supposed to be its single source of truth.
    const generated = buildProvisionSql(loadAlcadent(), loadTemplates());
    const onDisk = readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8');
    expect(onDisk).toBe(generated);
  });

  it('the demo fixtures still describe the same tenant as the profile', async () => {
    const profile = loadAlcadent();
    const { demoTenant, demoServices } = await import('@/lib/data/fixtures');

    expect(demoTenant.id).toBe(profile.id);
    expect(demoTenant.slug).toBe(profile.slug);
    expect(demoTenant.name).toBe(profile.name);
    expect(demoServices.map((s) => s.slug).sort()).toEqual(
      profile.services.map((s) => s.slug).sort(),
    );
  });
});
