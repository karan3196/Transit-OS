# Karyalaya

A multi-tenant platform that gives small offline businesses — dental clinics,
restaurants, workshops, small manufacturers — a suite of AI agents for their
customer-facing work: WhatsApp enquiries, bookings, recalls, reviews, social
content and owner reporting.

First design partner: **Alcadent India**, a kids-and-adult dental clinic in
Gurugram. Everything built for Alcadent generalises — a second clinic goes live
by changing configuration and credentials, never code.

See [CLAUDE.md](./CLAUDE.md) for the product context, the non-negotiables and the
current status. This file is about running the thing.

---

## Run it

```bash
npm install
npm run dev
# http://localhost:3000
```

That is the whole setup. With an empty environment the portal runs in **demo
mode**: every screen is backed by the same seeded Alcadent data that
`supabase/seed.sql` loads, and the agent answers from the knowledge base using a
deterministic offline responder. No database, no API key, no spend.

Start at `/` for the overview, `/dashboard` for the portal, and `/playground` to
talk to the front desk agent the way a customer would. Try the clinical question
in the suggestions — it escalates instead of answering.

## Wire up the real thing

Copy `.env.example` to `.env.local` and fill in one block at a time. Each block
switches on one more capability; the portal keeps working in between.

### 1. Database

```bash
supabase start          # local Postgres, Auth, Storage, Studio
supabase db reset       # applies supabase/migrations, then supabase/seed.sql
```

Put the URL and keys `supabase start` prints into `.env.local`. The portal
leaves demo mode as soon as `NEXT_PUBLIC_SUPABASE_URL` and the anon key are set.

Migrations live in `supabase/migrations` and nowhere else. No dashboard edits.

### 2. Model

Set `ANTHROPIC_API_KEY`. The runtime routes to the cheapest capable model by
default and escalates on complexity or thread length, logging the choice and an
estimated rupee cost for every run. `/usage` shows where the money goes.

### 3. WhatsApp

```bash
ngrok http 3000
```

In the Meta app dashboard, point the webhook at
`https://<your-tunnel>/api/webhooks/whatsapp` with the verify token you set in
`WHATSAPP_VERIFY_TOKEN`, then set `WHATSAPP_APP_SECRET` and
`WHATSAPP_ACCESS_TOKEN`.

Finally, map the test phone number to a tenant so inbound messages resolve:

```sql
insert into public.channel_identities (tenant_id, channel, external_id)
values ('11111111-1111-4111-8111-111111111111', 'whatsapp', '<phone_number_id>');
```

### 4. Scheduled agents

Set `CRON_SECRET`, then trigger the recall sweep:

```bash
curl -X POST http://localhost:3000/api/cron/recalls \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Test

```bash
npm test         # unit and integration tests
npm run typecheck
npm run build
```

The database suites — tenant isolation, webhook idempotency and booking
conflicts — need real Postgres and skip without it:

```bash
DATABASE_URL=postgres://postgres@localhost:54322/postgres npm test
```

(54322 is the port `supabase start` uses. Any Postgres superuser connection
works; the harness creates and drops its own database and shims the small part
of Supabase the migrations depend on.)

Testing is aimed at what can lose money or leak data, per CLAUDE.md section 7:
RLS isolation, webhook signature and idempotency, booking slot conflicts, and
agent output guardrails.

## How it fits together

```
Channels     WhatsApp Cloud API · web chat widget · Instagram DM · voice (deferred)
                          |
Ingress      webhook -> verify signature -> normalise -> resolve tenant -> dedupe -> store
                          |
Runtime      screen inbound -> route model -> prompt + tools -> screen outbound -> meter
                          |
Data         Postgres (RLS on every table) · knowledge · CRM · bookings · message log
                          |
Surfaces     owner dashboard · staff handoff inbox · usage and cost
```

### Layout

| Path | What lives there |
|---|---|
| `supabase/migrations` | Schema and RLS. The only place schema changes happen. |
| `supabase/seed.sql` | The Alcadent tenant: config, services, agents, knowledge. |
| `config/tenants` | Onboarding profiles. Shared state between Cowork and the repo. |
| `src/lib/tenancy.ts` | `withTenantScope()` — the only way service-role code reaches data. |
| `src/lib/whatsapp` | Signature verification, payload schemas, send client. |
| `src/lib/agents` | Runtime, guardrails, routing, cost, tools, prompt assembly. |
| `src/lib/bookings` | Slot arithmetic, kept pure so conflicts are directly testable. |
| `src/lib/ingress.ts` | Inbound pipeline from a normalised message to a stored reply. |
| `src/app/(portal)` | The owner-facing portal. |
| `src/app/api` | Webhook, web chat, cron and health endpoints. |

### Things that are structural, not incidental

- **Tenant isolation is enforced twice.** RLS covers everything the browser and
  the signed-in user's client can touch. Server code holding the service-role key
  bypasses RLS by design, so it goes through `TenantScope`, which filters every
  read and stamps `tenant_id` on every write. Neither path can name another
  tenant.
- **The signature is checked against raw bytes.** `request.text()` comes first;
  nothing is parsed until the HMAC matches.
- **Deduplication is a unique index.** Meta retries, and two workers can race on
  the same retry, so application-level checks are not enough.
- **Double-booking is impossible at the database.** A GiST exclusion constraint
  rejects overlapping live bookings on a resource, so a race between the agent
  and the front desk fails at insert rather than producing two appointments.
- **An agent is a row.** Prompt template, tool allowlist, trigger, escalation
  rule and tenant variables all live in `agents`. Adding the Review agent or the
  No-Show agent is configuration.
- **Nothing gets stuck with a bot.** Anything clinical, urgent or unhappy is
  escalated before the model runs; a reply that strays into advice, a firm price
  or a guaranteed outcome is blocked on the way out and handed to staff.

## Cost posture

- Cheapest capable model by default; escalate only on complexity or thread depth.
- Tenant system prompts and knowledge are prompt-cached — the largest and most
  stable part of every request.
- Replies inside Meta's 24-hour service window are free and preferred. Outside
  it, a paid template would be needed, so the agent does not send one on its own.
- Voice is the most expensive channel: metered, Pro-only, hard-capped, and not
  built yet.

Every agent run writes tokens, model, latency and an estimated cost to
`agent_runs`, and a matching row to `usage_events`.
