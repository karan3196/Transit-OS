export interface ServiceSummary {
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  pricePaise: number | null;
  priceIsEstimate: boolean;
}

export interface KnowledgeHit {
  title: string | null;
  content: string;
  source: string;
}

export interface BusinessFacts {
  name: string;
  tagline?: string;
  leadClinician?: string;
  experienceYears?: number;
  address?: string;
  whatsapp?: string;
  highlights?: string[];
  hoursSummary: string;
  timezone: string;
  /** From tenant_config.brand — the brand kit is configuration, not per-agent copy. */
  brandVoice?: string;
  contentSizes?: string;
}

export interface AgentRecord {
  id: string;
  slug: string;
  name: string;
  systemPromptTemplate: string;
  toolAllowlist: string[];
  tenantVariables: Record<string, unknown>;
  modelHint: string | null;
  escalationRule: Record<string, unknown>;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Everything an agent turn needs. Assembled from the database in production
 * and from fixtures in demo mode, so the runtime itself never talks to
 * Postgres and stays directly testable.
 */
export interface AgentContext {
  tenantId: string;
  conversationId: string | null;
  agent: AgentRecord;
  business: BusinessFacts;
  services: ServiceSummary[];
  knowledge: KnowledgeHit[];
  history: ConversationTurn[];
  customerName?: string;
}
