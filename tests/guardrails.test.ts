import { describe, expect, it } from 'vitest';
import { screenInbound, screenOutbound } from '@/lib/agents/guardrails';

describe('inbound screening', () => {
  it('escalates a request for a diagnosis rather than answering it', () => {
    const verdict = screenInbound('My son has a dark spot on his molar. Is this a cavity?');
    expect(verdict.escalate).toBe(true);
    expect(verdict.flags).toContain('diagnosis_request');
  });

  it('escalates dental emergencies in English and Hindi', () => {
    expect(screenInbound('I have severe pain and swelling since last night').escalate).toBe(true);
    expect(screenInbound('bahut तेज दर्द हो रहा है').escalate).toBe(true);
  });

  it('escalates when the customer asks for a person', () => {
    const verdict = screenInbound('Can I speak to a human please');
    expect(verdict.escalate).toBe(true);
    expect(verdict.flags).toContain('human_requested');
  });

  it('escalates complaints and refund requests', () => {
    expect(screenInbound('I want a refund, this is negligence').flags).toContain('complaint');
  });

  it('lets ordinary front desk questions through to the agent', () => {
    for (const message of [
      'What time do you open on Sunday?',
      'Sunday ko clinic khula rehta hai kya?',
      'How much is a cleaning roughly?',
      'Where exactly are you located, is there parking?',
      'Can I book a kids check-up on Friday evening?',
    ]) {
      expect(screenInbound(message).escalate, message).toBe(false);
    }
  });
});

describe('outbound screening', () => {
  it('blocks clinical advice', () => {
    const verdict = screenOutbound('You probably have an infection, take 500 mg amoxicillin twice daily.');
    expect(verdict.allowed).toBe(false);
    expect(verdict.flags).toContain('clinical_advice');
  });

  it('blocks guaranteed outcomes', () => {
    expect(screenOutbound('The procedure is 100% painless and results are guaranteed.').allowed).toBe(
      false,
    );
  });

  it('blocks "best in Gurugram" style superlatives', () => {
    expect(screenOutbound('We are the best dental clinic in Gurugram.').allowed).toBe(false);
  });

  it('blocks a firm price or a firm duration commitment', () => {
    expect(screenOutbound('Your root canal will cost exactly ₹8,000.').allowed).toBe(false);
    expect(screenOutbound('It will take exactly 3 sittings.').allowed).toBe(false);
  });

  it('allows indicative prices, hours, directions and general hygiene advice', () => {
    for (const reply of [
      'Scaling and polishing starts from ₹1,500. The final amount is confirmed at the clinic after an examination.',
      'We are open Monday to Saturday 10:00 to 20:00, and Sunday 11:00 to 17:00.',
      'We are on the first floor of Elan Miracle Mall, Sector 84. Parking is in the basement.',
      'Children should brush twice a day with a pea-sized amount of fluoride toothpaste.',
      'Dr. Anukriti Gupta can take a look on Friday at 5pm. Shall I book that?',
    ]) {
      expect(screenOutbound(reply).allowed, reply).toBe(true);
    }
  });
});
