/**
 * Read models for the portal.
 *
 * Every function here has two paths: demo fixtures when Supabase is not
 * configured, and RLS-protected queries when it is. The Supabase path uses the
 * signed-in user's client, never the service role, so the database enforces
 * tenant isolation on every page in the portal.
 */
import { isDemoMode } from '@/lib/env';
import { getMemberships } from '@/lib/auth';
import { createUserClient } from '@/lib/supabase/server';
import {
  demoAgents,
  demoBookings,
  demoConversations,
  demoCustomers,
  demoKnowledge,
  demoServices,
  demoUsage,
  type DemoAgentRow,
  type DemoBooking,
  type DemoConversation,
  type DemoCustomer,
  type DemoUsageDay,
} from '@/lib/data/fixtures';

export interface ActiveTenant {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'growth' | 'pro';
  status: string;
  timezone: string;
  role: 'owner' | 'manager' | 'staff';
  demo: boolean;
}

export async function getActiveTenant(): Promise<ActiveTenant | null> {
  const memberships = await getMemberships();
  const membership = memberships[0];
  if (!membership) return null;

  return {
    id: membership.tenantId,
    name: membership.name,
    slug: membership.slug,
    plan: membership.plan,
    status: membership.status,
    timezone: membership.timezone,
    role: membership.role,
    demo: isDemoMode(),
  };
}

export interface InboxItem {
  id: string;
  customerName: string;
  phone: string;
  channel: string;
  status: string;
  escalationReason: string | null;
  lastMessageAt: Date;
  preview: string;
}

export async function listConversations(): Promise<InboxItem[]> {
  if (isDemoMode()) {
    return demoConversations.map(toInboxItem);
  }

  const supabase = await createUserClient();
  const { data } = await supabase
    .from('conversations')
    .select('id, channel, status, escalation_reason, last_message_at, customers(full_name, phone_e164), messages(body, created_at)')
    .order('last_message_at', { ascending: false })
    .limit(50);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    customerName: row.customers?.full_name ?? 'Unknown',
    phone: row.customers?.phone_e164 ?? '',
    channel: row.channel,
    status: row.status,
    escalationReason: row.escalation_reason,
    lastMessageAt: new Date(row.last_message_at),
    preview: (row.messages ?? []).at(-1)?.body?.slice(0, 120) ?? '',
  }));
}

function toInboxItem(conversation: DemoConversation): InboxItem {
  return {
    id: conversation.id,
    customerName: conversation.customerName,
    phone: conversation.phone,
    channel: conversation.channel,
    status: conversation.status,
    escalationReason: conversation.escalationReason,
    lastMessageAt: conversation.lastMessageAt,
    preview: conversation.messages.at(-1)?.body.slice(0, 120) ?? '',
  };
}

export interface ConversationThread {
  id: string;
  customerName: string;
  phone: string;
  channel: string;
  status: string;
  escalationReason: string | null;
  lastInboundAt: Date | null;
  messages: { id: string; direction: string; sender: string; body: string; createdAt: Date }[];
}

export async function getConversation(id: string): Promise<ConversationThread | null> {
  if (isDemoMode()) {
    const found = demoConversations.find((c) => c.id === id);
    if (!found) return null;
    return {
      id: found.id,
      customerName: found.customerName,
      phone: found.phone,
      channel: found.channel,
      status: found.status,
      escalationReason: found.escalationReason,
      lastInboundAt: found.lastInboundAt,
      messages: found.messages,
    };
  }

  const supabase = await createUserClient();
  const { data } = await supabase
    .from('conversations')
    .select('id, channel, status, escalation_reason, last_inbound_at, customers(full_name, phone_e164), messages(id, direction, sender, body, created_at)')
    .eq('id', id)
    .maybeSingle();

  if (!data) return null;
  const row = data as any;

  return {
    id: row.id,
    customerName: row.customers?.full_name ?? 'Unknown',
    phone: row.customers?.phone_e164 ?? '',
    channel: row.channel,
    status: row.status,
    escalationReason: row.escalation_reason,
    lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at) : null,
    messages: (row.messages ?? [])
      .map((m: any) => ({
        id: m.id,
        direction: m.direction,
        sender: m.sender,
        body: m.body,
        createdAt: new Date(m.created_at),
      }))
      .sort((a: any, b: any) => a.createdAt - b.createdAt),
  };
}

export async function listBookings(): Promise<DemoBooking[]> {
  if (isDemoMode()) return demoBookings;

  const supabase = await createUserClient();
  const { data } = await supabase
    .from('bookings')
    .select('id, status, starts_at, ends_at, source, customers(full_name), services(name), resources(name)')
    .gte('starts_at', new Date(Date.now() - 86_400_000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(100);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    customerName: row.customers?.full_name ?? 'Unknown',
    serviceName: row.services?.name ?? 'Appointment',
    resourceName: row.resources?.name ?? '—',
    status: row.status,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    source: row.source,
  }));
}

export async function listCustomers(): Promise<DemoCustomer[]> {
  if (isDemoMode()) return demoCustomers;

  const supabase = await createUserClient();
  const { data } = await supabase
    .from('customers')
    .select('id, full_name, phone_e164, tags, last_seen_at')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(100);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name ?? 'Unknown',
    phone: row.phone_e164 ?? '',
    tags: row.tags ?? [],
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : new Date(0),
    consentMarketing: false,
  }));
}

export async function listAgents(): Promise<DemoAgentRow[]> {
  if (isDemoMode()) return demoAgents;

  const supabase = await createUserClient();
  const { data } = await supabase
    .from('agents')
    .select('id, slug, name, description, trigger, enabled, tool_allowlist, model_hint')
    .order('slug');

  return (data ?? []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    trigger: row.trigger,
    enabled: row.enabled,
    toolAllowlist: row.tool_allowlist ?? [],
    modelHint: row.model_hint ?? 'auto',
    runs7d: 0,
    escalations7d: 0,
  }));
}

export async function listServices() {
  if (isDemoMode()) return demoServices;

  const supabase = await createUserClient();
  const { data } = await supabase
    .from('services')
    .select('slug, name, description, duration_minutes, price_paise, price_is_estimate')
    .eq('active', true)
    .order('name');

  return (data ?? []).map((row: any) => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    pricePaise: row.price_paise,
    priceIsEstimate: row.price_is_estimate,
  }));
}

export async function listKnowledge() {
  if (isDemoMode()) return demoKnowledge;

  const supabase = await createUserClient();
  const { data } = await supabase
    .from('knowledge_chunks')
    .select('source, title, content')
    .order('created_at', { ascending: false })
    .limit(100);

  return (data ?? []) as { source: string; title: string | null; content: string }[];
}

export async function getUsageSeries(): Promise<DemoUsageDay[]> {
  if (isDemoMode()) return demoUsage;

  const supabase = await createUserClient();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data } = await supabase
    .from('usage_events')
    .select('occurred_at, kind, cost_paise')
    .gte('occurred_at', since);

  const byDay = new Map<string, DemoUsageDay>();
  for (const row of (data ?? []) as any[]) {
    const date = String(row.occurred_at).slice(0, 10);
    const entry = byDay.get(date) ?? { date, conversations: 0, costPaise: 0 };
    if (row.kind === 'ai_conversation') entry.conversations += 1;
    entry.costPaise += row.cost_paise ?? 0;
    byDay.set(date, entry);
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface DashboardSummary {
  openConversations: number;
  needsHuman: number;
  upcomingBookings: number;
  conversations30d: number;
  cost30dPaise: number;
  planLimit: number;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [conversations, bookings, usage] = await Promise.all([
    listConversations(),
    listBookings(),
    getUsageSeries(),
  ]);

  return {
    openConversations: conversations.filter((c) => c.status !== 'closed').length,
    needsHuman: conversations.filter((c) => c.status === 'needs_human').length,
    upcomingBookings: bookings.filter((b) => b.startsAt > new Date() && b.status !== 'cancelled').length,
    conversations30d: usage.reduce((acc, day) => acc + day.conversations, 0),
    cost30dPaise: usage.reduce((acc, day) => acc + day.costPaise, 0),
    planLimit: 2000,
  };
}
