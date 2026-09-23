/**
 * ToolBackend implementations.
 *
 * `SupabaseToolBackend` runs every query through a TenantScope, so even though
 * it holds the service-role key it cannot read or write outside the tenant the
 * webhook resolved. `DemoToolBackend` serves the same interface from fixtures.
 */
import type { Interval } from '@/lib/bookings/slots';
import { findAvailableSlots, type OpeningHours } from '@/lib/bookings/slots';
import type { TenantScope } from '@/lib/tenancy';
import type {
  BookingResult,
  CreateBookingInput,
  FindSlotsInput,
  ToolBackend,
} from '@/lib/agents/tools';
import type { KnowledgeHit, ServiceSummary } from '@/lib/agents/types';
import { demoHours, demoKnowledge, demoServices } from '@/lib/data/fixtures';

export class DemoToolBackend implements ToolBackend {
  escalations: string[] = [];

  async searchKnowledge(query: string, limit = 4): Promise<KnowledgeHit[]> {
    const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    return demoKnowledge
      .map((hit) => {
        const haystack = `${hit.title ?? ''} ${hit.content}`.toLowerCase();
        return { hit, score: words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.hit);
  }

  async listServices(): Promise<ServiceSummary[]> {
    return demoServices;
  }

  async findSlots(input: FindSlotsInput): Promise<Interval[]> {
    const service = demoServices.find((s) => s.slug === input.serviceSlug) ?? demoServices[0]!;
    return findAvailableSlots(
      {
        hours: demoHours as OpeningHours,
        timezone: 'Asia/Kolkata',
        durationMinutes: service.durationMinutes,
        notBefore: input.fromIso ? new Date(input.fromIso) : new Date(),
        maxSlots: 6,
      },
      input.days ?? 7,
    );
  }

  async createBooking(input: CreateBookingInput): Promise<BookingResult> {
    return { ok: true, bookingId: 'demo-booking', startsAt: input.startIso };
  }

  async escalateToHuman(reason: string): Promise<void> {
    this.escalations.push(reason);
  }
}

export class SupabaseToolBackend implements ToolBackend {
  constructor(
    private readonly scope: TenantScope,
    private readonly ctx: {
      conversationId: string | null;
      customerId: string | null;
      timezone: string;
      hours: OpeningHours;
    },
  ) {}

  async searchKnowledge(query: string, limit = 4): Promise<KnowledgeHit[]> {
    const terms = query
      .split(/\W+/)
      .filter((w) => w.length > 3)
      .slice(0, 6)
      .join(' | ');

    const builder = this.scope.from('knowledge_chunks').select('source, title, content');
    const { data } = terms
      ? await builder.textSearch('content', terms, { type: 'websearch' }).limit(limit)
      : await builder.limit(limit);

    return ((data ?? []) as any[]).map((row) => ({
      source: row.source,
      title: row.title,
      content: row.content,
    }));
  }

  async listServices(): Promise<ServiceSummary[]> {
    const { data } = await this.scope
      .from('services')
      .select('slug, name, description, duration_minutes, price_paise, price_is_estimate')
      .eq('active', true);

    return ((data ?? []) as any[]).map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      durationMinutes: row.duration_minutes,
      pricePaise: row.price_paise,
      priceIsEstimate: row.price_is_estimate,
    }));
  }

  private async resource(): Promise<{ id: string } | null> {
    const { data } = await this.scope.from('resources').select('id').eq('active', true).limit(1);
    return ((data ?? []) as any[])[0] ?? null;
  }

  async findSlots(input: FindSlotsInput): Promise<Interval[]> {
    const services = await this.listServices();
    const service = services.find((s) => s.slug === input.serviceSlug) ?? services[0];
    if (!service) return [];

    const resource = await this.resource();
    const from = input.fromIso ? new Date(input.fromIso) : new Date();
    const until = new Date(from.getTime() + (input.days ?? 7) * 86_400_000);

    let busy: Interval[] = [];
    if (resource) {
      const { data } = await this.scope
        .from('bookings')
        .select('starts_at, ends_at')
        .eq('resource_id', resource.id)
        .in('status', ['pending', 'confirmed'])
        .gte('starts_at', from.toISOString())
        .lte('starts_at', until.toISOString());

      busy = ((data ?? []) as any[]).map((row) => ({
        start: new Date(row.starts_at),
        end: new Date(row.ends_at),
      }));
    }

    return findAvailableSlots(
      {
        hours: this.ctx.hours,
        timezone: this.ctx.timezone,
        durationMinutes: service.durationMinutes,
        busy,
        notBefore: from,
        maxSlots: 6,
      },
      input.days ?? 7,
    );
  }

  async createBooking(input: CreateBookingInput): Promise<BookingResult> {
    if (!this.ctx.customerId) {
      return { ok: false, reason: 'no customer on this conversation' };
    }

    const services = await this.listServices();
    const service = services.find((s) => s.slug === input.serviceSlug);
    if (!service) return { ok: false, reason: 'unknown service' };

    const startsAt = new Date(input.startIso);
    if (Number.isNaN(startsAt.getTime())) return { ok: false, reason: 'invalid start time' };
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

    const { data: serviceRow } = await this.scope
      .from('services')
      .select('id')
      .eq('slug', input.serviceSlug)
      .limit(1);
    const resource = await this.resource();

    const { data, error } = await this.scope
      .from('bookings')
      .insert({
        customer_id: this.ctx.customerId,
        service_id: ((serviceRow ?? []) as any[])[0]?.id ?? null,
        resource_id: resource?.id ?? null,
        conversation_id: this.ctx.conversationId,
        status: 'confirmed',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        source: 'agent',
        notes: input.notes ?? null,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      // 23P01 is the exclusion-constraint violation from bookings_no_overlap:
      // someone took the slot between find_slots and here.
      const reason = error.code === '23P01' ? 'that time was just taken' : error.message;
      return { ok: false, reason };
    }

    return { ok: true, bookingId: (data as any)?.id, startsAt: startsAt.toISOString() };
  }

  async escalateToHuman(reason: string): Promise<void> {
    if (!this.ctx.conversationId) return;
    await this.scope
      .from('conversations')
      .update({ status: 'needs_human', escalation_reason: reason.slice(0, 500) })
      .eq('id', this.ctx.conversationId);
  }
}
