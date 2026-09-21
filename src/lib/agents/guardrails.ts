/**
 * Boundary guardrails (CLAUDE.md non-negotiable 6).
 *
 * The system prompt is the first line of defence; this is the automated check
 * behind it. Input screening decides whether a message should go straight to a
 * human. Output screening blocks a reply that strayed into advice, a firm
 * price, or a claim the clinic has not approved.
 *
 * These are deliberately blunt string checks. A blocked reply escalates to
 * staff, so a false positive costs a handoff, not a customer.
 */

export type GuardrailFlag =
  | 'clinical_advice'
  | 'diagnosis_request'
  | 'price_commitment'
  | 'guaranteed_outcome'
  | 'superlative'
  | 'emergency'
  | 'human_requested'
  | 'complaint';

export interface GuardrailVerdict {
  allowed: boolean;
  flags: GuardrailFlag[];
  /** Set when the message must go to a human instead of the agent. */
  escalate: boolean;
  reason?: string;
}

const INPUT_RULES: { flag: GuardrailFlag; escalate: boolean; patterns: RegExp[] }[] = [
  {
    flag: 'emergency',
    escalate: true,
    patterns: [
      /\b(emergency|urgent|severe pain|bleeding|swelling|accident|trauma|knocked out)\b/i,
      /(तेज़? ?दर्द|खून|सूजन|इमरजेंसी)/,
    ],
  },
  {
    flag: 'human_requested',
    escalate: true,
    patterns: [/\b(talk|speak) to (a )?(human|person|doctor|staff|someone)\b/i, /\b(real person|customer care)\b/i],
  },
  {
    flag: 'complaint',
    escalate: true,
    patterns: [/\b(complaint|refund|lawyer|legal action|negligen\w+|worst)\b/i],
  },
  {
    flag: 'diagnosis_request',
    escalate: true,
    patterns: [
      /\b(what (is|are) (wrong|this)|do i (have|need)|is (this|it) (an? )?(infection|cavity|abscess|cancer))\b/i,
      /\b(diagnos\w+|prescri\w+|which (medicine|antibiotic|painkiller))\b/i,
      /\b(x-?ray|scan|report)\b.*\b(check|look|read|tell)\b/i,
    ],
  },
];

const OUTPUT_RULES: { flag: GuardrailFlag; patterns: RegExp[] }[] = [
  {
    flag: 'clinical_advice',
    patterns: [
      /\byou (probably |likely |most likely )?have\b/i,
      /\b(i|we) (would )?(recommend|advise|suggest) (you )?(take|start|use) \w*(antibiotic|painkiller|medicine|ibuprofen|paracetamol|amoxicillin)/i,
      /\b(take|use) \d+\s?mg\b/i,
      /\byou (do not|don't) need (a )?(treatment|root canal|filling|extraction)\b/i,
    ],
  },
  {
    flag: 'guaranteed_outcome',
    patterns: [
      /\b(guarantee[ds]?|guaranteed results|100% (safe|success|painless)|permanent(ly)? (cure|fix))\b/i,
      /\bno (pain|risk) at all\b/i,
    ],
  },
  {
    flag: 'superlative',
    patterns: [
      /\bbest (dentist|clinic|dental)\b/i,
      /\b(number one|#1|top rated|finest) (dentist|clinic|in gurugram|in gurgaon)\b/i,
    ],
  },
  {
    flag: 'price_commitment',
    patterns: [
      /\b(final|fixed|exact|total) (price|cost|amount)\b.*₹|\b₹\s?[\d,]+\s*(only|flat|fixed|final)\b/i,
      /\bwill cost exactly\b/i,
      /\bit will take exactly \d+ (days?|weeks?|sittings?)\b/i,
    ],
  },
];

/** Screens an inbound customer message. Escalating here skips the model entirely. */
export function screenInbound(text: string): GuardrailVerdict {
  const flags: GuardrailFlag[] = [];
  let escalate = false;

  for (const rule of INPUT_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      flags.push(rule.flag);
      escalate ||= rule.escalate;
    }
  }

  return {
    allowed: true,
    flags,
    escalate,
    reason: escalate ? `Inbound matched ${flags.join(', ')}` : undefined,
  };
}

/** Screens a drafted reply. A blocked reply is never sent; staff pick it up instead. */
export function screenOutbound(text: string): GuardrailVerdict {
  const flags: GuardrailFlag[] = [];

  for (const rule of OUTPUT_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      flags.push(rule.flag);
    }
  }

  const allowed = flags.length === 0;
  return {
    allowed,
    flags,
    escalate: !allowed,
    reason: allowed ? undefined : `Reply blocked by ${flags.join(', ')}`,
  };
}

export const HANDOFF_MESSAGE =
  'Let me get someone from the clinic to answer that properly. They will reply here shortly.';
