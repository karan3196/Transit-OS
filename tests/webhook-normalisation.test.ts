import { describe, expect, it } from 'vitest';
import { normaliseInbound, whatsappWebhookSchema } from '@/lib/whatsapp/schema';

const envelope = (overrides: Record<string, unknown> = {}) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '919889885908', phone_number_id: 'PNID_1' },
            contacts: [{ wa_id: '919812345601', profile: { name: 'Priya' } }],
            messages: [
              {
                id: 'wamid.ABC123',
                from: '919812345601',
                timestamp: '1758441600',
                type: 'text',
                text: { body: 'Sunday ko khula hai kya?' },
              },
            ],
            ...overrides,
          },
        },
      ],
    },
  ],
});

describe('webhook payload parsing', () => {
  it('accepts a well-formed text message delivery', () => {
    expect(whatsappWebhookSchema.safeParse(envelope()).success).toBe(true);
  });

  it('rejects an envelope for a different Meta product', () => {
    const result = whatsappWebhookSchema.safeParse({ ...envelope(), object: 'page' });
    expect(result.success).toBe(false);
  });

  it('tolerates unknown fields Meta adds later', () => {
    const payload = envelope({ some_new_field: { anything: true } });
    expect(whatsappWebhookSchema.safeParse(payload).success).toBe(true);
  });
});

describe('inbound normalisation', () => {
  it('flattens the envelope into the shape the runtime uses', () => {
    const parsed = whatsappWebhookSchema.parse(envelope());
    const [message] = normaliseInbound(parsed);

    expect(message).toMatchObject({
      providerMessageId: 'wamid.ABC123',
      phoneNumberId: 'PNID_1',
      fromE164: '+919812345601',
      profileName: 'Priya',
      text: 'Sunday ko khula hai kya?',
    });
    expect(message!.receivedAt.toISOString()).toBe('2025-09-21T08:00:00.000Z');
  });

  it('drops status callbacks, which carry no message', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: 'PNID_1' },
                statuses: [{ id: 'wamid.ABC123', status: 'delivered' }],
              },
            },
          ],
        },
      ],
    };

    const parsed = whatsappWebhookSchema.parse(payload);
    expect(normaliseInbound(parsed)).toHaveLength(0);
  });

  it('marks a non-text message rather than pretending it had a body', () => {
    const payload = envelope({
      messages: [{ id: 'wamid.IMG', from: '919812345601', timestamp: '1758441600', type: 'image' }],
    });

    const [message] = normaliseInbound(whatsappWebhookSchema.parse(payload));
    expect(message!.text).toBe('');
    expect(message!.unsupportedType).toBe('image');
  });

  it('normalises a wa_id that already carries a plus', () => {
    const payload = envelope({
      messages: [
        {
          id: 'wamid.PLUS',
          from: '+919812345601',
          timestamp: '1758441600',
          type: 'text',
          text: { body: 'hi' },
        },
      ],
    });
    expect(normaliseInbound(whatsappWebhookSchema.parse(payload))[0]!.fromE164).toBe('+919812345601');
  });
});
