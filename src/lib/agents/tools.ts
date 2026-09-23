/**
 * Agent tools.
 *
 * Tools are declared once and gated per agent by `tool_allowlist` on the
 * `agents` row, so a new agent's capabilities are configuration. The backend is
 * injected, which keeps the runtime testable and lets the web widget run in
 * demo mode without a database.
 */
import type { Interval } from '@/lib/bookings/slots';
import type { KnowledgeHit, ServiceSummary } from '@/lib/agents/types';

export interface FindSlotsInput {
  serviceSlug?: string;
  fromIso?: string;
  days?: number;
}

export interface CreateBookingInput {
  serviceSlug: string;
  startIso: string;
  customerName?: string;
  notes?: string;
}

export interface BookingResult {
  ok: boolean;
  bookingId?: string;
  startsAt?: string;
  reason?: string;
}

/** Everything the tools need from the outside world. */
export interface ToolBackend {
  searchKnowledge(query: string, limit?: number): Promise<KnowledgeHit[]>;
  listServices(): Promise<ServiceSummary[]>;
  findSlots(input: FindSlotsInput): Promise<Interval[]>;
  createBooking(input: CreateBookingInput): Promise<BookingResult>;
  escalateToHuman(reason: string): Promise<void>;
}

export const TOOL_NAMES = [
  'search_knowledge',
  'list_services',
  'find_slots',
  'create_booking',
  'escalate_to_human',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDefinition {
  name: ToolName;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_knowledge',
    description:
      "Search the business's approved knowledge base for facts such as hours, location, parking or policies. Use this before answering any factual question.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What to look up.' } },
      required: ['query'],
    },
  },
  {
    name: 'list_services',
    description:
      'List the services the business offers, with duration and indicative price. Prices are indicative and confirmed on examination.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'find_slots',
    description:
      'Find bookable appointment times. Call this before proposing any time to the customer.',
    input_schema: {
      type: 'object',
      properties: {
        serviceSlug: { type: 'string', description: 'Slug from list_services.' },
        fromIso: { type: 'string', description: 'Earliest ISO 8601 instant to consider.' },
        days: { type: 'number', description: 'How many days ahead to search. Default 7.' },
      },
    },
  },
  {
    name: 'create_booking',
    description:
      'Book an appointment at a time returned by find_slots. Only call this once the customer has confirmed the time.',
    input_schema: {
      type: 'object',
      properties: {
        serviceSlug: { type: 'string' },
        startIso: { type: 'string', description: 'Exact start instant from find_slots.' },
        customerName: { type: 'string' },
        notes: { type: 'string', description: 'Scheduling notes only. Never clinical detail.' },
      },
      required: ['serviceSlug', 'startIso'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Hand the conversation to the business\'s staff inbox. Use for anything clinical, any complaint, or whenever the customer asks for a person.',
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason'],
    },
  },
];

export function definitionsFor(allowlist: string[]): ToolDefinition[] {
  const allowed = new Set(allowlist);
  return TOOL_DEFINITIONS.filter((t) => allowed.has(t.name));
}

export interface ToolCallOutcome {
  content: string;
  escalated: boolean;
}

/** Dispatches one tool call. Unknown or disallowed tools fail closed. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  backend: ToolBackend,
  allowlist: string[],
): Promise<ToolCallOutcome> {
  if (!allowlist.includes(name)) {
    return { content: `Tool ${name} is not available to this agent.`, escalated: false };
  }

  switch (name) {
    case 'search_knowledge': {
      const hits = await backend.searchKnowledge(String(input.query ?? ''), 4);
      return {
        content: hits.length
          ? hits.map((h) => `${h.title ?? h.source}: ${h.content}`).join('\n')
          : 'No approved fact found. Say you will check with the team.',
        escalated: false,
      };
    }
    case 'list_services': {
      const services = await backend.listServices();
      return {
        content: JSON.stringify(
          services.map((s) => ({
            slug: s.slug,
            name: s.name,
            durationMinutes: s.durationMinutes,
            indicativePricePaise: s.pricePaise,
            priceIsEstimate: s.priceIsEstimate,
          })),
        ),
        escalated: false,
      };
    }
    case 'find_slots': {
      const slots = await backend.findSlots({
        serviceSlug: input.serviceSlug ? String(input.serviceSlug) : undefined,
        fromIso: input.fromIso ? String(input.fromIso) : undefined,
        days: typeof input.days === 'number' ? input.days : undefined,
      });
      return {
        content: slots.length
          ? JSON.stringify(slots.slice(0, 6).map((s) => s.start.toISOString()))
          : 'No slots available in that window. Offer to have the team call back.',
        escalated: false,
      };
    }
    case 'create_booking': {
      const result = await backend.createBooking({
        serviceSlug: String(input.serviceSlug ?? ''),
        startIso: String(input.startIso ?? ''),
        customerName: input.customerName ? String(input.customerName) : undefined,
        notes: input.notes ? String(input.notes) : undefined,
      });
      return {
        content: result.ok
          ? `Booked. Reference ${result.bookingId}, starts ${result.startsAt}.`
          : `Could not book: ${result.reason ?? 'unknown reason'}. Offer another time.`,
        escalated: false,
      };
    }
    case 'escalate_to_human': {
      const reason = String(input.reason ?? 'unspecified');
      await backend.escalateToHuman(reason);
      return { content: 'Handed to the staff inbox. Tell the customer someone will reply here.', escalated: true };
    }
    default:
      return { content: `Unknown tool ${name}.`, escalated: false };
  }
}
