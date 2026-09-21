# CLAUDE.md — Karyalaya

Context file for Claude Code and Claude Cowork. Read this first in every session.
Last updated: 2026-09-21 · Update section 9 at the end of every working session.

---

## 1. What we are building

**Karyalaya** is a multi-tenant SaaS platform that gives small offline businesses
(dental clinics, restaurants, car workshops, furniture and toy manufacturers) a suite
of AI agents for their customer-facing work: WhatsApp enquiries, bookings, recalls,
reviews, social content and owner reporting.

- **Deployment target:** localhost for the initial phase (Supabase CLI local stack +
  Next.js dev server, webhooks via an ngrok tunnel). Vercel preview deployments start
  with the Alcadent pilot. Domain purchase deferred until pre-launch.
- **First client / design partner:** Alcadent India, a kids-and-adult dental clinic in
  Gurugram. Everything built for Alcadent must generalise: a second clinic goes live by
  changing configuration and credentials, never code.
- **Founder:** Karan, solo. No engineering team. Claude Code is the engineering team;
  Cowork handles content, research and ops artefacts; visual design happens on a Claude
  Design canvas.
- **Scaling rule:** an agent is configuration plus tools, not an application. If
  onboarding a new client needs a developer, the design is wrong.

---

## 2. Business model

| Plan | ₹/month | Channels | Contains |
|---|---|---|---|
| Starter | 2,999 | WhatsApp, web chat widget | Front desk, booking, reviews, Google profile basics; 500 AI conversations |
| Growth | 6,999 | + Instagram DM | + recalls, catalogue + UPI checkout, CRM, weekly insights; 2,000 conversations |
| Pro | 14,999 | + Voice | + voice agent (300 min), quotes, B2B reorders, inventory, multi-location |

- Setup fee ₹4,999–14,999, waived on annual plans.
- Target gross margin at least 70%. Any feature pushing per-client variable cost above
  about ₹2,000/month on Growth becomes a metered add-on.
- Break-even: 12–15 clients against fixed burn of about ₹50–60k/month.
- Capacity ceiling: about 150–200 clients for a solo founder. Self-serve onboarding is a
  core product requirement.

**Cost rules to respect in code**
- Route to the cheapest capable model by default; escalate only on complexity or low
  confidence. Log model choice per request.
- Use prompt caching for tenant system prompts and knowledge base chunks.
- Prefer customer-initiated WhatsApp conversations (service-window messages are free).
  Use paid marketing templates sparingly and meter them per tenant.
- Voice is the most expensive channel: metered, Pro-only, hard caps per tenant.

---

## 3. Architecture

```
Channels        WhatsApp Cloud API · web chat widget · Instagram DM · voice (deferred)
                             |
Ingress         webhook -> validate signature -> normalise -> tenant resolve -> store
                             |
Agent runtime   router -> agent (prompt + tools + tenant config) -> tool calls
                             |
Data            Postgres (Supabase) · pgvector KB · CRM · bookings · message log
                             |
Surfaces        owner dashboard · staff handoff inbox · weekly WhatsApp report
```

**Stack**
- Next.js (App Router), TypeScript; Vercel from pilot onward
- Supabase: Postgres, Auth, Storage, pgvector
- Anthropic API for agent reasoning
- Meta WhatsApp Cloud API directly (no BSP); Meta Instagram messaging API (Growth tier)
- Razorpay for subscriptions and UPI payment links
- Resend or similar for transactional email
- Voice: decoupled STT + LLM + TTS pipeline over a telephony provider. **Deferred** —
  see section 11. Do not build voice infrastructure until explicitly asked.

**Core tables (all tenant-scoped)**
`tenants`, `tenant_config`, `users`, `customers`, `conversations`, `messages`,
`bookings`, `services`, `knowledge_chunks`, `agents`, `agent_runs`, `usage_events`,
`consents`, `subscriptions`, `templates`.

---

## 4. Non-negotiables

If a request conflicts with one of these, say so before writing code.

1. **Tenant isolation.** Every table holding client data carries `tenant_id NOT NULL`.
   RLS is enabled on all of them with policies written and covered by tests. No query
   runs without a tenant scope. The service-role key is used only in server code that
   sets tenant scope explicitly. A cross-tenant leak ends the business.
2. **Secrets.** Env vars only. Never log tokens, API keys or credentials. Per-tenant
   channel tokens are stored encrypted, never in plain columns.
3. **Webhook security.** Verify Meta's `X-Hub-Signature-256` on every inbound webhook
   before any processing.
4. **Idempotency.** Meta retries webhooks. Deduplicate on provider message id with a
   unique constraint, not application logic alone.
5. **Human handoff.** Every agent can escalate to the business's staff inbox. No
   customer gets stuck with a bot.
6. **Boundary guardrails.** No medical, legal or financial advice. For Alcadent, agents
   handle timings, prices, directions, appointments and general oral-hygiene
   information. Diagnostic questions go to the dentist. Enforced in the system prompt
   and in an automated output check.
7. **Consent and data minimisation.** DPDP Act consent recorded (in `consents`) before
   any marketing message; opt-out honoured within one message. Store appointment
   metadata only, never clinical notes, diagnoses or treatment records.
8. **Cost observability.** Every agent run logs tokens, model, latency and estimated
   rupee cost against a tenant.
9. **Client content approval.** No clinical or medical claim is published on a client's
   channels without sign-off from the client's clinician.

---

## 5. Alcadent brand kit

| Token | Value | Token | Value |
|---|---|---|---|
| Deep green (ink) | `#14442B` | Brand green | `#2E7D4F` |
| Sage background | `#EDF2E6` | Cream | `#FAF7EF` |
| Warm accent | `#D08C2E` | Body text on light | `#3C5344` |

Status: derived from Alcadent's Instagram grid, **not yet confirmed by the clinic**.
Replace with official logo files and hex values when received.

- **Typography:** Plus Jakarta Sans (400/600/800) for headings and body; Caveat for
  short handwritten accents only.
- **Sizes:** 1080×1350 (4:5) for feed and carousels; 1080×1920 for stories.
- **Voice:** warm, plain, parent-to-parent. Short sentences. No fear-mongering, no
  exclamation stacking, no emoji in headlines. Hindi-English mixing allowed in captions,
  not headlines.
- **Core facts:** Alcadent India, Kids & Adult Dentistry · Dr. Anukriti Gupta, Chief
  Pediatric Dental Surgeon, 14+ years · painless injection technique · conscious
  sedation for anxious children · open 7 days · F-49, First Floor, Elan Miracle Mall,
  Sector 84, Gurugram 122004 · WhatsApp 98898 85908.
- **Never claim:** guaranteed outcomes, "best in Gurugram" superlatives, unconfirmed
  prices or durations.

---

## 6. Agent roster

Ship each tier completely before starting the next.

**Tier 1 (MVP)**
1. Content Studio Agent — weekly carousels, reels scripts, story frames in brand kit,
   with a clinician approval step before publishing.
2. WhatsApp Front Desk Agent — 24/7 answers in Hindi and English, booking capable.
3. Recall Agent — six-month check-ups, pending treatment sittings, follow-ups.

**Tier 2:** Review · Lead Qualifier · No-Show · Treatment Explainer
**Tier 3:** Local SEO · Insights · Reels Script · Referral

**Agent definition** is a database record in `agents`: `system_prompt_template`,
`tool_allowlist`, `trigger` (inbound message, schedule, event), `escalation_rule`,
`tenant_variables`. Adding an agent requires zero changes to the runtime.

---

## 7. Working conventions

- TypeScript everywhere. Zod schemas for all external input, including webhook payloads.
- Server Actions or Route Handlers for writes. No client-side secrets. Browser DB access
  only through the RLS-protected Supabase client.
- Migrations in `/supabase/migrations` only. No manual dashboard edits.
- Testing focus: RLS isolation, webhook signature and idempotency, booking slot
  conflicts, agent output guardrails. Test what can lose money or leak data.
- Conventional commits, one logical change each.
- Before any schema change, state the migration plan and the RLS impact.
- Ask before adding a dependency, changing the data model, introducing a queue or
  worker, or anything that raises fixed monthly cost.

---

## 8. Surface split

- **Claude Code (repo):** schema, RLS, webhooks, agent runtime, dashboard, billing,
  migrations, tests, deploys.
- **Cowork:** content calendars, onboarding questionnaires, pitch decks, pricing sheets,
  competitor scans, SOPs, client agreements drafts, WhatsApp template copy for Meta
  approval.
- **Chat + Design canvas:** visual design, positioning, strategy, prompt iteration.
- **Shared state lives in the repo.** Cowork outputs the system consumes land in
  `/config` or `/content` as files, never as pasted text.

---

## 9. Current status

- Business model and pricing: settled.
- Brand kit: extracted from Instagram; awaiting clinic confirmation.
- First content deliverable: seven-slide carousel on a Design canvas; awaiting
  clinician sign-off.
- **Repo: initialised.** Next.js 15 App Router + TypeScript, Supabase migrations with
  RLS, agent runtime, WhatsApp webhook, owner portal, Supabase Auth sign-in and
  self-serve onboarding. 123 tests passing.

### What is built

| Area | State |
|---|---|
| Schema | 8 migrations in `/supabase/migrations`: tenancy, CRM + consent ledger, conversations, services + bookings, agents + knowledge, billing + usage, RLS. |
| Tenant isolation | RLS on every table, policies driven by `public.current_tenant_ids()`. Service-role code goes through `withTenantScope()` — there is no way to get an unscoped query builder. Covered by 12 tests against real Postgres. |
| WhatsApp ingress | `POST /api/webhooks/whatsapp`: raw body read first, `X-Hub-Signature-256` verified, Zod-parsed, tenant resolved from `channel_identities`, deduped on a unique index at two levels. |
| Agent runtime | One `runAgentTurn()` for every agent. Inbound screening, prompt assembly with caching, model routing, bounded tool loop, outbound screening, cost accounting. Agents are rows; adding one needs no code. |
| Guardrails | Input and output screens for diagnosis requests, clinical advice, guaranteed outcomes, superlatives and firm price or duration commitments. A blocked reply escalates instead of sending. |
| Portal | Dashboard, inbox with transcripts and service-window state, bookings, customers, agents, knowledge, usage and cost, settings, and a playground for talking to the agent. |
| Auth | Supabase Auth sign-in at `/login` (password or magic link), session refresh in middleware, `/auth/callback` for the code exchange. Portal routes redirect when there is no session; a signed-in account with no membership gets the onboarding command instead of an empty dashboard. |
| Onboarding | `npm run onboard -- <slug>` provisions a business from `config/tenants/<slug>.json` plus the vertical-neutral templates in `config/agents/`. Idempotent upserts in one transaction, validated before anything is applied. `supabase/seed.sql` is generated by the same code path, with a test that fails if it drifts. |
| Demo mode | With an empty `.env` the whole portal runs on the seeded Alcadent fixtures, and the agent answers from the knowledge base with a deterministic offline fallback. No infrastructure, no spend. |

### Not built yet, deliberately

- Self-signup. `/login` signs in an existing account; creating the first account
  is a Supabase Studio step, because a public signup form on a multi-tenant
  portal needs an invitation flow to be worth having.
- Razorpay subscriptions and UPI checkout: `subscriptions` table exists, no integration.
- Instagram DM and voice: schema and enums allow for them, no code (voice is deferred
  by decision 2).
- Content Studio publishing: the agent row and approval flag exist; drafting and the
  clinician approval queue are not implemented.
- Embedding generation. `knowledge_chunks.embedding` is nullable and retrieval is
  full-text for now, which is enough at pilot scale.

### Next scope

1. **Run the local stack end to end.** `supabase start`, `supabase db reset`, ngrok
   tunnel, Meta test number, a real inbound WhatsApp message through to a booking.
   This is the one thing that cannot be verified from a container: it needs Docker
   for the Supabase CLI and a Meta developer account. Everything either side of it
   is tested.
2. **Staff invitations.** An owner invites a colleague by email and the invite
   creates the `users` row, so adding staff does not need a command line.
3. **Reply from the inbox.** The inbox renders transcripts but is read-only; staff
   need to answer an escalated conversation from the portal.

### Verified in this container

Postgres 16 with the migrations applied: RLS isolation across two real tenants,
webhook idempotency, booking exclusion constraints, and a full onboarding run
applied twice with no drift. A second tenant in a different vertical
(a restaurant) was provisioned from a profile with no code change, and RLS scoped
to it returned only its own rows. The WhatsApp webhook was exercised live:
correct signature 200, wrong secret 401, body tampered after signing 401, absent
signature 401, handshake with a wrong verify token 403.

### Meta access and entity plan
1. **Local development:** personal Meta Developer account, app in Development Mode,
   Meta-provided test number. No business verification required.
2. **Alcadent pilot:** production WhatsApp number hosted in Alcadent India's own Meta
   Business Manager. Karan is added as a developer/admin on their assets, with written
   authorisation from the clinic. Confirm the approach against current Meta
   documentation before go-live (see section 11).
3. **Scaling:** register a sole proprietorship or LLP in parallel, then pursue Meta
   business verification and Tech Provider / Embedded Signup before onboarding client #2.

## 10. Decisions log

| # | Decision |
|---|---|
| 1 | Product name: Karyalaya. Localhost first; domain deferred. |
| 2 | Voice: decoupled STT + LLM + TTS pipeline, Pro tier only, build deferred. |
| 3 | Instagram DM handling: Growth tier. Web chat widget: Starter tier. |
| 4 | Meta access: dev sandbox, then Alcadent's Business Manager for the pilot. |
| 5 | Next engineering step: week 1 scope in section 9. |
| 6 | Portal styling is hand-written CSS with brand tokens, no UI framework. Keeps the dependency list to Next, Supabase, Zod and the Anthropic SDK. |
| 7 | Demo mode: the portal runs on fixtures with an empty `.env`, and the agent falls back to a deterministic responder without `ANTHROPIC_API_KEY`. Lets the whole ingress path be exercised before any spend. |
| 8 | Booking conflicts are prevented by a GiST exclusion constraint, not application logic, so a race between the agent and the front desk cannot double-book a chair. |
| 9 | The repository lives at `karan3196/Transit-OS` for now. Creating a dedicated `karyalaya` repo needs repo-creation permission the GitHub app here does not hold; moving it later is a remote change, not a code change. |
| 10 | Onboarding generates SQL rather than issuing client calls, and `supabase/seed.sql` is generated by that same path. One source of truth, and the local stack cannot drift from a tenant profile. |
| 11 | Agent templates are vertical-neutral. Boundary rules and escalation wording come from the tenant's `agent_variables`, so a restaurant and a clinic share one front desk template. |
| 12 | The project is ESM (`"type": "module"`), which lets `scripts/*.mts` run under Node's native type stripping with no build step and no extra dependency. |
| 13 | Sign-in is for existing accounts only. Self-signup on a multi-tenant portal needs an invitation flow first, so the first account is created in Supabase Studio and linked with `npm run onboard -- <slug> --owner <email>`. |

---

## 11. Open risks and unresolved items

Do not treat these as settled. Raise them when work touches the relevant area.

1. **Employment contract.** Karan to confirm his current employment terms (moonlighting,
   IP assignment, conflict of interest) permit this venture before registering an
   entity or taking payment.
2. **Alcadent's WhatsApp number.** Moving 98898 85908 to the Cloud API may affect its use
   in the WhatsApp Business app. Confirm current Meta coexistence support, or use a new
   number for the pilot.
3. **Pilot asset ownership.** If the Meta app and tokens live in Alcadent's Business
   Manager, Karyalaya does not own them. Plan the migration to Karyalaya's own Tech
   Provider setup before client #2.
4. **Client agreement.** No pilot agreement, data processing terms, or patient-data
   ownership clause exists yet. Required before handling real patient conversations.
5. **Pilot terms and success metrics.** Price (free, discounted, paid) and success
   criteria for the Alcadent pilot are undefined.
6. **Voice build effort.** A self-assembled STT/TTS/telephony pipeline is significant
   engineering and operational load for a solo founder (latency, interruption handling,
   telecom compliance, hosting). Revisit build versus buy once there are 30+ paying
   clients.
7. **Name clearance.** Run a trademark and domain availability check on "Karyalaya"
   before building brand assets around it.
8. **Instagram messaging access.** Confirm permission and app review requirements for
   Instagram DM handling on client accounts before scoping the Growth tier build.
