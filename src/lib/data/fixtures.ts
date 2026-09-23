/**
 * Demo fixtures.
 *
 * The portal boots with an empty .env so the whole surface can be walked
 * through before Supabase and Meta are wired up. These rows mirror the shape
 * of `supabase/seed.sql` exactly — same tenant, same services, same agents —
 * so what you click in demo mode is what you get once the database is live.
 */
import { DEMO_TENANT_ID } from '@/lib/env';
import type { AgentRecord, BusinessFacts, KnowledgeHit, ServiceSummary } from '@/lib/agents/types';

const hoursConfig = {
  mon: ['10:00', '20:00'],
  tue: ['10:00', '20:00'],
  wed: ['10:00', '20:00'],
  thu: ['10:00', '20:00'],
  fri: ['10:00', '20:00'],
  sat: ['10:00', '20:00'],
  sun: ['11:00', '17:00'],
} as const;

export const demoHours = hoursConfig;

const hoursSummary = 'Mon–Sat 10:00–20:00, Sun 11:00–17:00';

export const demoTenant = {
  id: DEMO_TENANT_ID,
  slug: 'alcadent',
  name: 'Alcadent India',
  plan: 'growth' as const,
  status: 'active' as const,
  timezone: 'Asia/Kolkata',
};

export const demoBusiness: BusinessFacts = {
  name: 'Alcadent India',
  tagline: 'Kids & Adult Dentistry',
  leadClinician: 'Dr. Anukriti Gupta, Chief Pediatric Dental Surgeon',
  experienceYears: 14,
  address: 'F-49, First Floor, Elan Miracle Mall, Sector 84, Gurugram 122004',
  whatsapp: '+919889885908',
  highlights: [
    'Painless injection technique',
    'Conscious sedation for anxious children',
    'Open 7 days',
  ],
  hoursSummary,
  timezone: 'Asia/Kolkata',
  brandVoice:
    'Warm, plain, parent to parent. Short sentences. No fear-mongering, no exclamation stacking, no emoji in headlines. Hindi-English mixing allowed in captions, not headlines.',
  contentSizes: '1080x1350 for feed, 1080x1920 for story',
};

export const demoServices: ServiceSummary[] = [
  {
    slug: 'consultation',
    name: 'Consultation',
    description: 'First visit, examination and treatment plan discussion.',
    durationMinutes: 30,
    pricePaise: 50_000,
    priceIsEstimate: true,
  },
  {
    slug: 'cleaning',
    name: 'Scaling & polishing',
    description: 'Routine cleaning for adults and older children.',
    durationMinutes: 45,
    pricePaise: 150_000,
    priceIsEstimate: true,
  },
  {
    slug: 'kids-checkup',
    name: 'Kids check-up',
    description: 'Child-friendly examination with fluoride application if needed.',
    durationMinutes: 30,
    pricePaise: 80_000,
    priceIsEstimate: true,
  },
  {
    slug: 'rct-sitting',
    name: 'Root canal sitting',
    description: 'Follow-up sitting for an in-progress root canal.',
    durationMinutes: 60,
    pricePaise: null,
    priceIsEstimate: true,
  },
];

export const demoKnowledge: KnowledgeHit[] = [
  {
    source: 'clinic_facts',
    title: 'Opening hours',
    content:
      'Alcadent India is open seven days a week. Monday to Saturday 10:00 to 20:00, Sunday 11:00 to 17:00. Walk-ins are accepted but an appointment is faster.',
  },
  {
    source: 'clinic_facts',
    title: 'Location and parking',
    content:
      'F-49, First Floor, Elan Miracle Mall, Sector 84, Gurugram 122004. Parking is available in the mall basement. The clinic is on the first floor, near the atrium lifts.',
  },
  {
    source: 'clinic_facts',
    title: 'Anxious children',
    content:
      'The clinic uses a painless injection technique and offers conscious sedation for children who are very anxious. Parents can stay with the child during the visit.',
  },
  {
    source: 'oral_hygiene',
    title: 'Brushing for children',
    content:
      'Children should brush twice a day with a pea-sized amount of fluoride toothpaste, with adult supervision until about age seven. Replace the brush every three months.',
  },
];

export const demoFrontDeskAgent: AgentRecord = {
  id: 'agent-front-desk',
  slug: 'front-desk',
  name: 'WhatsApp Front Desk',
  systemPromptTemplate: [
    'You are the front desk assistant for {{business_name}}, {{tagline}}.',
    '',
    'Facts you may state:',
    '- Clinician: {{lead_clinician}}, {{experience_years}}+ years.',
    '- Address: {{address}}',
    '- Opening hours: {{hours_summary}}',
    '- Services and indicative prices:',
    '{{services_summary}}',
    '',
    'Match the customer\'s language. Short sentences, warm and plain.',
    'You do not diagnose, prescribe or quote final prices. Those go to {{lead_clinician}}.',
    'Escalate anything clinical, urgent or unhappy to the team.',
  ].join('\n'),
  toolAllowlist: ['search_knowledge', 'list_services', 'find_slots', 'create_booking', 'escalate_to_human'],
  tenantVariables: { business_name: 'Alcadent India', tagline: 'Kids & Adult Dentistry' },
  modelHint: 'claude-haiku-4-5-20251001',
  escalationRule: { on_low_confidence: true },
};

export interface DemoAgentRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  toolAllowlist: string[];
  modelHint: string;
  runs7d: number;
  escalations7d: number;
}

export const demoAgents: DemoAgentRow[] = [
  {
    id: 'agent-front-desk',
    slug: 'front-desk',
    name: 'WhatsApp Front Desk',
    description: 'Answers enquiries in Hindi and English around the clock and books appointments.',
    trigger: 'inbound_message',
    enabled: true,
    toolAllowlist: demoFrontDeskAgent.toolAllowlist,
    modelHint: 'claude-haiku-4-5-20251001',
    runs7d: 214,
    escalations7d: 19,
  },
  {
    id: 'agent-recall',
    slug: 'recall',
    name: 'Recall Agent',
    description: 'Six-month check-up reminders, pending treatment sittings and follow-ups.',
    trigger: 'schedule',
    enabled: true,
    toolAllowlist: ['list_services', 'find_slots', 'send_message', 'escalate_to_human'],
    modelHint: 'claude-haiku-4-5-20251001',
    runs7d: 41,
    escalations7d: 0,
  },
  {
    id: 'agent-content',
    slug: 'content-studio',
    name: 'Content Studio',
    description: 'Weekly carousels and reel scripts in the brand kit, held for clinician approval.',
    trigger: 'schedule',
    enabled: true,
    toolAllowlist: ['search_knowledge', 'list_services', 'create_content_draft'],
    modelHint: 'claude-sonnet-5',
    runs7d: 4,
    escalations7d: 0,
  },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAhead = (d: number, hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(hour, 0, 0, 0);
  return date;
};

export interface DemoMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'customer' | 'agent' | 'staff' | 'system';
  body: string;
  createdAt: Date;
}

export interface DemoConversation {
  id: string;
  customerName: string;
  phone: string;
  channel: 'whatsapp' | 'webchat' | 'instagram';
  status: 'open' | 'needs_human' | 'closed';
  escalationReason: string | null;
  lastMessageAt: Date;
  lastInboundAt: Date;
  messages: DemoMessage[];
}

export const demoConversations: DemoConversation[] = [
  {
    id: 'conv-1',
    customerName: 'Priya Menon',
    phone: '+919812345601',
    channel: 'whatsapp',
    status: 'needs_human',
    escalationReason: 'Inbound matched diagnosis_request',
    lastMessageAt: hoursAgo(0.4),
    lastInboundAt: hoursAgo(0.5),
    messages: [
      {
        id: 'm1',
        direction: 'inbound',
        sender: 'customer',
        body: 'Hi, my son is 6 and has a dark spot on his back tooth. Is it a cavity?',
        createdAt: hoursAgo(0.5),
      },
      {
        id: 'm2',
        direction: 'outbound',
        sender: 'agent',
        body: 'Let me get someone from the clinic to answer that properly. They will reply here shortly.',
        createdAt: hoursAgo(0.4),
      },
    ],
  },
  {
    id: 'conv-2',
    customerName: 'Rohit Bansal',
    phone: '+919812345602',
    channel: 'whatsapp',
    status: 'open',
    escalationReason: null,
    lastMessageAt: hoursAgo(2),
    lastInboundAt: hoursAgo(2.2),
    messages: [
      {
        id: 'm3',
        direction: 'inbound',
        sender: 'customer',
        body: 'Sunday ko clinic khula rehta hai kya?',
        createdAt: hoursAgo(2.2),
      },
      {
        id: 'm4',
        direction: 'outbound',
        sender: 'agent',
        body: 'Ji haan, Sunday 11:00 se 17:00 tak khula rehta hai. Baaki din 10:00 se 20:00. Appointment book kar dun?',
        createdAt: hoursAgo(2.1),
      },
      {
        id: 'm5',
        direction: 'inbound',
        sender: 'customer',
        body: 'Haan, Sunday 12 baje ho sakta hai?',
        createdAt: hoursAgo(2),
      },
    ],
  },
  {
    id: 'conv-3',
    customerName: 'Aisha Khan',
    phone: '+919812345603',
    channel: 'webchat',
    status: 'closed',
    escalationReason: null,
    lastMessageAt: hoursAgo(26),
    lastInboundAt: hoursAgo(27),
    messages: [
      {
        id: 'm6',
        direction: 'inbound',
        sender: 'customer',
        body: 'Where exactly are you located? Is there parking?',
        createdAt: hoursAgo(27),
      },
      {
        id: 'm7',
        direction: 'outbound',
        sender: 'agent',
        body: 'F-49, First Floor, Elan Miracle Mall, Sector 84, Gurugram. Parking is in the mall basement, and we are near the atrium lifts on the first floor.',
        createdAt: hoursAgo(26.5),
      },
      {
        id: 'm8',
        direction: 'inbound',
        sender: 'customer',
        body: 'Perfect, thank you.',
        createdAt: hoursAgo(26),
      },
    ],
  },
];

export interface DemoBooking {
  id: string;
  customerName: string;
  serviceName: string;
  resourceName: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  startsAt: Date;
  endsAt: Date;
  source: string;
}

export const demoBookings: DemoBooking[] = [
  {
    id: 'bk-1',
    customerName: 'Rohit Bansal',
    serviceName: 'Consultation',
    resourceName: 'Chair 1',
    status: 'confirmed',
    startsAt: daysAhead(0, 17),
    endsAt: daysAhead(0, 18),
    source: 'agent',
  },
  {
    id: 'bk-2',
    customerName: 'Aisha Khan',
    serviceName: 'Scaling & polishing',
    resourceName: 'Chair 2',
    status: 'confirmed',
    startsAt: daysAhead(1, 11),
    endsAt: daysAhead(1, 12),
    source: 'agent',
  },
  {
    id: 'bk-3',
    customerName: 'Vikram Sethi',
    serviceName: 'Kids check-up',
    resourceName: 'Chair 1',
    status: 'pending',
    startsAt: daysAhead(2, 16),
    endsAt: daysAhead(2, 17),
    source: 'webchat',
  },
  {
    id: 'bk-4',
    customerName: 'Neha Arora',
    serviceName: 'Root canal sitting',
    resourceName: 'Chair 2',
    status: 'confirmed',
    startsAt: daysAhead(3, 12),
    endsAt: daysAhead(3, 13),
    source: 'staff',
  },
];

export interface DemoCustomer {
  id: string;
  fullName: string;
  phone: string;
  tags: string[];
  lastSeenAt: Date;
  consentMarketing: boolean;
}

export const demoCustomers: DemoCustomer[] = [
  { id: 'c1', fullName: 'Priya Menon', phone: '+919812345601', tags: ['parent'], lastSeenAt: hoursAgo(0.5), consentMarketing: true },
  { id: 'c2', fullName: 'Rohit Bansal', phone: '+919812345602', tags: ['new'], lastSeenAt: hoursAgo(2), consentMarketing: true },
  { id: 'c3', fullName: 'Aisha Khan', phone: '+919812345603', tags: [], lastSeenAt: hoursAgo(26), consentMarketing: false },
  { id: 'c4', fullName: 'Vikram Sethi', phone: '+919812345604', tags: ['parent', 'recall-due'], lastSeenAt: hoursAgo(72), consentMarketing: true },
  { id: 'c5', fullName: 'Neha Arora', phone: '+919812345605', tags: ['rct-in-progress'], lastSeenAt: hoursAgo(120), consentMarketing: true },
];

export interface DemoUsageDay {
  date: string;
  conversations: number;
  costPaise: number;
}

export const demoUsage: DemoUsageDay[] = Array.from({ length: 14 }, (_, i) => {
  const date = new Date(Date.now() - (13 - i) * 86_400_000);
  const conversations = 18 + ((i * 7) % 13);
  return {
    date: date.toISOString().slice(0, 10),
    conversations,
    costPaise: conversations * 42 + ((i * 17) % 90),
  };
});
